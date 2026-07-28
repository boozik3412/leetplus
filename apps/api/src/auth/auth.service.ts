import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import {
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import {
  type PersistedTenantModuleEntitlement,
  type PersistedTenantExecutionSubject,
  TenantExecutionPolicyService,
} from '../tenancy/tenant-execution-policy.service';
import { AcceptUserInviteDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedUser, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';

type AuthResponse = {
  accessToken: string;
  user: AuthenticatedUser;
};

const AUTH_TOKEN_EXPIRES_IN = '24h';
const tenantModuleEntitlementExecutionSelect = {
  module: true,
  readEnabled: true,
  writeEnabled: true,
  outboundEnabled: true,
  validFrom: true,
  validUntil: true,
  profileRevision: true,
} satisfies Prisma.TenantModuleEntitlementSelect;

type UserWithTenant = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  isActive: boolean;
  isPlatformAdmin: boolean;
  passwordHash: string;
  tenantId: string;
  accessScope: unknown;
  storeAccesses: Array<{
    storeId: string;
    store: {
      tenantId: string;
    };
  }>;
  tenant: {
    slug: string;
    status: TenantLifecycleStatus;
    customerStage: TenantCustomerStage;
    onboardingStatus: TenantOnboardingStatus;
    trialStartsAt: Date | null;
    trialEndsAt: Date | null;
    entitlementProfileRevision: number;
    moduleEntitlements: PersistedTenantModuleEntitlement[];
  };
  customRole?: {
    id: string;
    name: string;
    permissions: string[];
  } | null;
  roleOverride?: {
    permissions: string[];
  } | null;
};

type UserInvitePreview = {
  email: string | null;
  fullName: string | null;
  role: UserRole;
  customRole: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
  } | null;
  tenant: {
    name: string;
    slug: string;
  };
  scope: 'NETWORK' | 'STORES';
  stores: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  expiresAt: string;
};

type InviteAdmissionCandidate = {
  role: UserRole;
  accessScope: UserAccessScope | null;
  customRoleId: string | null;
  storeIds: readonly string[];
  tenant: PersistedTenantExecutionSubject;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly configService: ConfigService,
    private readonly accessScopeService: AccessScopeService,
    private readonly tenantExecutionPolicy: TenantExecutionPolicyService,
  ) {}

  register(dto: RegisterDto): never {
    void dto;
    throw new ForbiddenException(
      'Самостоятельная регистрация отключена. Используйте приглашение владельца сети.',
    );
  }

  async getInvite(token: string): Promise<UserInvitePreview> {
    const invite = await this.resolveActiveInvite(token);
    this.assertInviteAdmitted(invite);
    const storeIds = await this.resolveInviteStoreIds(
      invite.tenantId,
      invite.storeIds,
    );
    const accessScope = this.accessScopeService.fromPersisted({
      tenantId: invite.tenantId,
      accessScope: invite.accessScope,
      storeAccesses: storeIds.map((storeId) => ({ storeId })),
    });
    const stores = await this.resolveInviteStores(invite.tenantId, storeIds);

    return {
      email: invite.email,
      fullName: invite.fullName,
      role: invite.role,
      customRole: invite.customRole
        ? {
            id: invite.customRole.id,
            name: invite.customRole.name,
            description: invite.customRole.description,
            permissions: invite.customRole.permissions,
          }
        : null,
      tenant: {
        name: invite.tenant.name,
        slug: invite.tenant.slug,
      },
      scope: accessScope.mode,
      stores,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(
    token: string,
    dto: AcceptUserInviteDto,
  ): Promise<AuthResponse> {
    const invite = await this.resolveActiveInvite(token);
    this.assertInviteAdmitted(invite);
    const email = this.resolveInviteEmail(invite.email, dto.email);
    const fullName = this.resolveInviteFullName(invite.fullName, dto.fullName);
    const password = dto.password;
    this.assertPassword(password);
    this.assertPasswordConfirmation(password, dto.confirmPassword);

    const [existingUser, storeIds] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.resolveInviteStoreIds(invite.tenantId, invite.storeIds),
    ]);
    const inviteAccessScope = this.accessScopeService.fromPersisted({
      tenantId: invite.tenantId,
      accessScope: invite.accessScope,
      storeAccesses: storeIds.map((storeId) => ({ storeId })),
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await this.passwordService.hash(password);
    const created = await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();
      const lockedTenants = await tx.$queryRaw<
        Array<PersistedTenantExecutionSubject>
      >(Prisma.sql`
        SELECT
          "id",
          "status",
          "customerStage",
          "onboardingStatus",
          "trialStartsAt",
          "trialEndsAt",
          "entitlementProfileRevision"
        FROM "Tenant"
        WHERE "id" = ${invite.tenantId}
        FOR UPDATE
      `);
      const lockedTenant = lockedTenants[0];
      if (!lockedTenant) {
        throw new ConflictException('Tenant changed while accepting invite');
      }
      const lockedEntitlements =
        await tx.tenantModuleEntitlement.findMany({
          where: { tenantId: invite.tenantId },
          select: tenantModuleEntitlementExecutionSelect,
        });
      this.assertInviteAdmitted(
        {
          ...invite,
          tenant: {
            ...lockedTenant,
            moduleEntitlements: lockedEntitlements,
          },
        },
        acceptedAt,
      );

      if (invite.role === UserRole.OWNER) {
        const ownerCount = await tx.user.count({
          where: {
            tenantId: invite.tenantId,
            role: UserRole.OWNER,
          },
        });
        if (ownerCount !== 0) {
          throw new ConflictException(
            'Initial owner already exists; use the owner-transfer workflow',
          );
        }
      }

      const user = await tx.user.create({
        data: {
          tenantId: invite.tenantId,
          email,
          fullName,
          passwordHash,
          role: invite.role,
          customRoleId: invite.customRoleId,
          accessScope: inviteAccessScope.mode,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });

      if (storeIds.length > 0) {
        await tx.userStoreAccess.createMany({
          data: storeIds.map((storeId) => ({ userId: user.id, storeId })),
          skipDuplicates: true,
        });
      }

      const accepted = await tx.userInvite.updateMany({
        where: {
          id: invite.id,
          acceptedAt: null,
          expiresAt: { gt: acceptedAt },
          updatedAt: invite.updatedAt,
        },
        data: {
          acceptedAt,
          acceptedByUserId: user.id,
        },
      });

      if (accepted.count !== 1) {
        throw new ConflictException('Invite changed or was already accepted');
      }

      if (invite.role === UserRole.OWNER) {
        const transitioned = await tx.tenant.updateMany({
          where: {
            id: invite.tenantId,
            status: TenantLifecycleStatus.ACTIVE,
            onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
            entitlementProfileRevision: lockedTenant.entitlementProfileRevision,
          },
          data: {
            onboardingStatus: TenantOnboardingStatus.ONBOARDING,
          },
        });

        if (transitioned.count !== 1) {
          throw new ConflictException(
            'Tenant onboarding changed while accepting invite',
          );
        }

        await tx.platformAdminAuditEvent.create({
          data: {
            tenantId: invite.tenantId,
            actorUserId: user.id,
            action: 'TENANT_OWNER_INVITE_ACCEPTED',
            targetType: 'TENANT_ONBOARDING',
            targetId: invite.tenantId,
            reason: 'Initial owner accepted the email-bound invite',
            before: {
              onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
            },
            after: {
              onboardingStatus: TenantOnboardingStatus.ONBOARDING,
            },
            metadata: {
              inviteId: invite.id,
              ownerUserId: user.id,
            },
          },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          tenant: {
            select: {
              slug: true,
              status: true,
              customerStage: true,
              onboardingStatus: true,
              trialStartsAt: true,
              trialEndsAt: true,
              entitlementProfileRevision: true,
              moduleEntitlements: {
                select: tenantModuleEntitlementExecutionSelect,
              },
            },
          },
          customRole: {
            select: {
              id: true,
              name: true,
              permissions: true,
            },
          },
          storeAccesses: {
            select: {
              storeId: true,
              store: {
                select: {
                  tenantId: true,
                },
              },
            },
          },
        },
      });
    });

    return this.createAuthResponse(created);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto?.email);
    this.assertEmail(email);
    this.assertPassword(dto?.password);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        tenant: {
          select: {
            slug: true,
            status: true,
            customerStage: true,
            onboardingStatus: true,
            trialStartsAt: true,
            trialEndsAt: true,
            entitlementProfileRevision: true,
            moduleEntitlements: {
              select: tenantModuleEntitlementExecutionSelect,
            },
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        storeAccesses: {
          select: {
            storeId: true,
            store: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Учетная запись отключена');
    }

    const isPasswordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    return this.createAuthResponse(user);
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            slug: true,
            status: true,
            customerStage: true,
            onboardingStatus: true,
            trialStartsAt: true,
            trialEndsAt: true,
            entitlementProfileRevision: true,
            moduleEntitlements: {
              select: tenantModuleEntitlementExecutionSelect,
            },
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
        storeAccesses: {
          select: {
            storeId: true,
            store: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись больше не существует');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Учетная запись отключена');
    }

    this.assertTenantActiveForUser(user);

    return this.toAuthenticatedUser(await this.withRoleOverride(user));
  }

  confirmEmail(token: string) {
    return this.emailVerificationService.confirmEmail(token);
  }

  resendVerificationEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    this.assertEmail(normalizedEmail);
    return this.emailVerificationService.resendByEmail(normalizedEmail);
  }

  private async resolveActiveInvite(token: string) {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';

    if (!normalizedToken) {
      throw new BadRequestException('Токен приглашения обязателен');
    }

    const invite = await this.prisma.userInvite.findUnique({
      where: { tokenHash: this.hashInviteToken(normalizedToken) },
      include: {
        tenant: {
          select: {
            name: true,
            slug: true,
            id: true,
            status: true,
            customerStage: true,
            onboardingStatus: true,
            trialStartsAt: true,
            trialEndsAt: true,
            entitlementProfileRevision: true,
            moduleEntitlements: {
              select: tenantModuleEntitlementExecutionSelect,
            },
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Ссылка-приглашение не найдена');
    }

    if (!invite.email) {
      throw new BadRequestException(
        'Приглашение не привязано к email и должно быть перевыпущено',
      );
    }

    if (invite.acceptedAt) {
      throw new BadRequestException('Ссылка-приглашение уже использована');
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Срок действия приглашения истек');
    }

    return invite;
  }

  private hashInviteToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertInviteAdmitted(
    invite: InviteAdmissionCandidate,
    now = new Date(),
  ): void {
    this.tenantExecutionPolicy.assertInviteAllowed(invite.tenant, now);

    const ownerBootstrap =
      invite.tenant.onboardingStatus === TenantOnboardingStatus.OWNER_INVITED;
    if (ownerBootstrap) {
      if (
        invite.role !== UserRole.OWNER ||
        invite.accessScope !== UserAccessScope.NETWORK ||
        invite.customRoleId !== null ||
        invite.storeIds.length !== 0
      ) {
        throw new UnauthorizedException(
          'Initial owner invite must grant only the NETWORK OWNER bootstrap role',
        );
      }
      return;
    }

    if (invite.role === UserRole.OWNER) {
      throw new UnauthorizedException(
        'Additional owner invites require the owner-transfer workflow',
      );
    }
  }

  private resolveInviteEmail(
    invitedEmail: string | null,
    submittedEmail: unknown,
  ): string {
    if (!invitedEmail) {
      throw new BadRequestException(
        'Приглашение не привязано к email и должно быть перевыпущено',
      );
    }

    const email = this.normalizeEmail(invitedEmail);
    this.assertEmail(email);

    const normalizedSubmittedEmail = this.normalizeEmail(submittedEmail);

    if (normalizedSubmittedEmail && normalizedSubmittedEmail !== invitedEmail) {
      throw new BadRequestException('Приглашение выдано на другой email');
    }

    return email;
  }

  private resolveInviteFullName(
    invitedFullName: string | null,
    submittedFullName: unknown,
  ): string | null {
    if (typeof submittedFullName === 'string' && submittedFullName.trim()) {
      return submittedFullName.trim();
    }

    return invitedFullName;
  }

  private async resolveInviteStores(tenantId: string, storeIds: string[]) {
    if (storeIds.length === 0) {
      return [];
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        id: { in: storeIds },
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    return stores;
  }

  private async resolveInviteStoreIds(tenantId: string, storeIds: string[]) {
    const stores = await this.resolveInviteStores(tenantId, storeIds);

    if (stores.length !== storeIds.length) {
      throw new BadRequestException(
        'One or more invited stores are unavailable',
      );
    }

    return storeIds;
  }

  private async createAuthResponse(
    user: UserWithTenant,
  ): Promise<AuthResponse> {
    this.assertTenantActiveForUser(user);

    const userWithRoleOverride = await this.withRoleOverride(user);
    const authenticatedUser = this.toAuthenticatedUser(userWithRoleOverride);
    const payload: AuthTokenPayload = {
      sub: authenticatedUser.id,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
      customRoleId: authenticatedUser.customRoleId,
      permissions: authenticatedUser.permissions,
      isPlatformAdmin: authenticatedUser.isPlatformAdmin,
      tenantId: authenticatedUser.tenantId,
      tenantSlug: authenticatedUser.tenantSlug,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        expiresIn: AUTH_TOKEN_EXPIRES_IN,
      }),
      user: authenticatedUser,
    };
  }

  private toAuthenticatedUser(user: UserWithTenant): AuthenticatedUser {
    const accessScope = this.accessScopeService.fromPersisted(user);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      customRoleId: user.customRole?.id ?? user.customRoleId ?? null,
      customRoleName: user.customRole?.name ?? null,
      hasRoleOverride: Boolean(user.roleOverride),
      permissions: resolveUserCapabilities(user),
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      tenantStatus: user.tenant.status,
      accessScope: accessScope.mode,
      allowedStoreIds: [...accessScope.storeIds],
    };
  }

  private async withRoleOverride(
    user: UserWithTenant,
  ): Promise<UserWithTenant> {
    if (user.customRole) {
      return {
        ...user,
        roleOverride: null,
      };
    }

    const roleOverride = await this.prisma.userRoleOverride.findUnique({
      where: {
        tenantId_role: {
          tenantId: user.tenantId,
          role: user.role,
        },
      },
      select: {
        permissions: true,
      },
    });

    return {
      ...user,
      roleOverride,
    };
  }

  private assertTenantActiveForUser(user: UserWithTenant): void {
    if (user.isPlatformAdmin) {
      return;
    }

    this.tenantExecutionPolicy.assertSessionAllowed({
      id: user.tenantId,
      status: user.tenant.status,
      customerStage: user.tenant.customerStage,
      onboardingStatus: user.tenant.onboardingStatus,
      trialStartsAt: user.tenant.trialStartsAt,
      trialEndsAt: user.tenant.trialEndsAt,
      entitlementProfileRevision: user.tenant.entitlementProfileRevision,
      moduleEntitlements: user.tenant.moduleEntitlements,
    });
  }

  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      return '';
    }

    return email.trim().toLowerCase();
  }

  private assertEmail(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Укажите корректный email');
    }
  }

  private assertPassword(password: unknown): asserts password is string {
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException(
        'Пароль должен содержать минимум 8 символов',
      );
    }
  }

  private assertPasswordConfirmation(
    password: unknown,
    confirmPassword: unknown,
  ) {
    if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
      throw new BadRequestException('Пароли не совпадают');
    }
  }
}
