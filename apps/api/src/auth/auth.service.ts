import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { TenantLifecycleStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptUserInviteDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedUser, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';

type AuthResponse = {
  accessToken: string;
  user: AuthenticatedUser;
};

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
  tenant: {
    slug: string;
    status: TenantLifecycleStatus;
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const tenantSlug = this.normalizeTenantSlug(dto.tenantSlug);
    const organizationName = dto.organizationName?.trim();
    const fullName = dto.fullName?.trim() || null;

    this.assertEmail(email);
    this.assertPassword(dto.password);
    this.assertPasswordConfirmation(dto.password, dto.confirmPassword);
    this.assertTenantSlug(tenantSlug);

    if (!organizationName) {
      throw new BadRequestException('Укажите название организации');
    }

    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.tenant.findUnique({ where: { slug: tenantSlug } }),
    ]);

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    if (existingTenant) {
      throw new ConflictException('Такой адрес организации уже занят');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: organizationName,
        slug: tenantSlug,
        domain: `${tenantSlug}.leetplus.ru`,
        users: {
          create: {
            email,
            fullName,
            passwordHash,
            role: UserRole.OWNER,
          },
        },
      },
      include: {
        users: true,
      },
    });

    const owner = tenant.users[0];

    if (!owner) {
      throw new BadRequestException('Не удалось создать владельца организации');
    }

    await this.emailVerificationService.sendVerificationEmail(
      owner.id,
      owner.email,
    );

    return this.createAuthResponse({
      id: owner.id,
      email: owner.email,
      fullName: owner.fullName,
      role: owner.role,
      customRoleId: null,
      customRole: null,
      isActive: owner.isActive,
      isPlatformAdmin: owner.isPlatformAdmin,
      passwordHash: owner.passwordHash,
      tenantId: owner.tenantId,
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
      },
    });
  }

  async getInvite(token: string): Promise<UserInvitePreview> {
    const invite = await this.resolveActiveInvite(token);
    this.assertTenantActive(invite.tenant.status);
    const stores = await this.resolveInviteStores(
      invite.tenantId,
      invite.storeIds,
    );

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
      scope: stores.length > 0 ? 'STORES' : 'NETWORK',
      stores,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(
    token: string,
    dto: AcceptUserInviteDto,
  ): Promise<AuthResponse> {
    const invite = await this.resolveActiveInvite(token);
    this.assertTenantActive(invite.tenant.status);
    const email = this.resolveInviteEmail(invite.email, dto.email);
    const fullName = this.resolveInviteFullName(invite.fullName, dto.fullName);
    const password = dto.password;
    this.assertPassword(password);
    this.assertPasswordConfirmation(password, dto.confirmPassword);

    const [existingUser, storeIds] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.resolveInviteStoreIds(invite.tenantId, invite.storeIds),
    ]);

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await this.passwordService.hash(password);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: invite.tenantId,
          email,
          fullName,
          passwordHash,
          role: invite.role,
          customRoleId: invite.customRoleId,
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

      await tx.userInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          tenant: {
            select: {
              slug: true,
              status: true,
            },
          },
          customRole: {
            select: {
              id: true,
              name: true,
              permissions: true,
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
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
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
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
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
            status: true,
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

  private resolveInviteEmail(
    invitedEmail: string | null,
    submittedEmail: unknown,
  ): string {
    const email = this.normalizeEmail(invitedEmail ?? submittedEmail);
    this.assertEmail(email);

    if (invitedEmail) {
      const normalizedSubmittedEmail = this.normalizeEmail(submittedEmail);

      if (
        normalizedSubmittedEmail &&
        normalizedSubmittedEmail !== invitedEmail
      ) {
        throw new BadRequestException('Приглашение выдано на другой email');
      }
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
      accessToken: await this.jwtService.signAsync(payload),
      user: authenticatedUser,
    };
  }

  private toAuthenticatedUser(user: UserWithTenant): AuthenticatedUser {
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

  private assertTenantActive(status: TenantLifecycleStatus): void {
    if (status !== TenantLifecycleStatus.ACTIVE) {
      throw new UnauthorizedException('Организация не активна');
    }
  }

  private assertTenantActiveForUser(user: UserWithTenant): void {
    if (user.isPlatformAdmin) {
      return;
    }

    this.assertTenantActive(user.tenant.status);
  }

  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      return '';
    }

    return email.trim().toLowerCase();
  }

  private normalizeTenantSlug(tenantSlug: unknown): string {
    if (typeof tenantSlug !== 'string') {
      return '';
    }

    return tenantSlug.trim().toLowerCase();
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

  private assertTenantSlug(tenantSlug: string): void {
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(tenantSlug)) {
      throw new BadRequestException(
        'Адрес организации должен содержать 3-32 символа: строчные латинские буквы, цифры или дефисы',
      );
    }
  }
}
