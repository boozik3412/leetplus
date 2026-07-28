import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  Prisma,
  TenantCustomerStage,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  accessCapabilityCatalog,
  hasCapability,
  normalizeCapabilities,
  roleCapabilities,
  resolveUserCapabilities,
  type AccessCapability,
} from '../auth/capabilities';
import { PasswordService } from '../auth/password.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScopeService,
  type AccessScopeMode,
  type RequestedAccessScope,
} from '../tenancy/access-scope.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const assignableRolesByActor: Record<UserRole, UserRole[]> = {
  [UserRole.OWNER]: [
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.BUYER,
    UserRole.MARKETER,
    UserRole.CLUB_MANAGER,
    UserRole.STANDARDS_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
    UserRole.TRAINEE,
  ],
  [UserRole.ADMIN]: [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.BUYER,
    UserRole.MARKETER,
    UserRole.CLUB_MANAGER,
    UserRole.STANDARDS_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
    UserRole.TRAINEE,
  ],
  [UserRole.MANAGER]: [
    UserRole.CLUB_MANAGER,
    UserRole.STANDARDS_MANAGER,
    UserRole.MARKETER,
    UserRole.BUYER,
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
    UserRole.TRAINEE,
  ],
  [UserRole.BUYER]: [],
  [UserRole.MARKETER]: [],
  [UserRole.CLUB_MANAGER]: [],
  [UserRole.STANDARDS_MANAGER]: [
    UserRole.CLUB_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
    UserRole.TRAINEE,
  ],
  [UserRole.SENIOR_ADMINISTRATOR]: [],
  [UserRole.CLUB_ADMINISTRATOR]: [],
  [UserRole.TRAINEE]: [],
};

const baseRoleOptions = [
  {
    role: UserRole.OWNER,
    label: 'Владелец',
    description: 'Полный доступ к сети, настройкам, ролям и финансам.',
    permissions: roleCapabilities[UserRole.OWNER],
  },
  {
    role: UserRole.ADMIN,
    label: 'Администратор системы',
    description: 'Операционное администрирование LeetPlus без смены владельца.',
    permissions: roleCapabilities[UserRole.ADMIN],
  },
  {
    role: UserRole.MANAGER,
    label: 'Управляющий сетью',
    description:
      'Дашборды, гости, маркетинг, персонал и ассортиментные отчеты.',
    permissions: roleCapabilities[UserRole.MANAGER],
  },
  {
    role: UserRole.CLUB_MANAGER,
    label: 'Управляющий клубом',
    description: 'Операционная работа по выбранным клубам и персоналу.',
    permissions: roleCapabilities[UserRole.CLUB_MANAGER],
  },
  {
    role: UserRole.MARKETER,
    label: 'Маркетолог',
    description: 'Маркетинг, CRM-группы, кампании и промо-наборы.',
    permissions: roleCapabilities[UserRole.MARKETER],
  },
  {
    role: UserRole.STANDARDS_MANAGER,
    label: 'Менеджер по стандартам',
    description:
      'Обучение, подбор администраторов, регламенты, чек-листы, стандарты работы, контроль администраторов и аттестации.',
    permissions: roleCapabilities[UserRole.STANDARDS_MANAGER],
  },
  {
    role: UserRole.BUYER,
    label: 'Закупщик',
    description: 'Ассортимент, товары, поставщики и коммерческие отчеты.',
    permissions: roleCapabilities[UserRole.BUYER],
  },
  {
    role: UserRole.SENIOR_ADMINISTRATOR,
    label: 'Старший администратор',
    description: 'Задачи персонала, чеклисты смены и контроль выполнения.',
    permissions: roleCapabilities[UserRole.SENIOR_ADMINISTRATOR],
  },
  {
    role: UserRole.CLUB_ADMINISTRATOR,
    label: 'Администратор клуба',
    description: 'Сменные задачи и чеклисты без лишних управленческих данных.',
    permissions: roleCapabilities[UserRole.CLUB_ADMINISTRATOR],
  },
  {
    role: UserRole.TRAINEE,
    label: 'Стажер',
    description:
      'Рабочее место смены, обучение, база знаний и просмотр сменных материалов без управленческих действий с задачами и стандартами.',
    permissions: roleCapabilities[UserRole.TRAINEE],
  },
] satisfies Array<{
  role: UserRole;
  label: string;
  description: string;
  permissions: AccessCapability[];
}>;

const userAccountInclude = {
  customRole: {
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  storeAccesses: {
    include: {
      store: {
        select: {
          id: true,
          name: true,
          isActive: true,
          tenantId: true,
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

const userInviteInclude = {
  customRole: {
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.UserInviteInclude;

type UserAccountRow = Prisma.UserGetPayload<{
  include: typeof userAccountInclude;
}>;

type UserInviteRow = Prisma.UserInviteGetPayload<{
  include: typeof userInviteInclude;
}>;

type UserAccessRoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
};

type UserRoleOverrideRow = {
  role: UserRole;
  permissions: string[];
  updatedAt: Date;
};

export type UserAccountStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type UserAccount = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  customRole: UserAccessRoleAccount | null;
  permissions: AccessCapability[];
  isActive: boolean;
  isPlatformAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scope: AccessScopeMode;
  stores: UserAccountStore[];
};

export type UserAccessRoleAccount = {
  id: string;
  name: string;
  description: string | null;
  permissions: AccessCapability[];
  createdAt: string;
  updatedAt: string;
};

export type UserRoleOption = {
  role: UserRole;
  label: string;
  description: string;
  permissions: AccessCapability[];
  isOverridden: boolean;
  updatedAt: string | null;
};

export type UserInviteAccount = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  customRole: UserAccessRoleAccount | null;
  scope: AccessScopeMode;
  stores: UserAccountStore[];
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  registrationUrl?: string;
};

export type UserAccountsResponse = {
  users: UserAccount[];
  stores: UserAccountStore[];
  roleOptions: UserRoleOption[];
  customRoles: UserAccessRoleAccount[];
  invites: UserInviteAccount[];
  capabilityOptions: typeof accessCapabilityCatalog;
};

export type UserAccountDto = {
  email?: string;
  fullName?: string | null;
  password?: string;
  role?: UserRole;
  customRoleId?: string | null;
  isActive?: boolean;
  scope?: AccessScopeMode;
  storeIds?: string[];
};

export type UserAccessRoleDto = {
  name?: string;
  description?: string | null;
  permissions?: string[];
};

export type UserRoleOverrideDto = {
  permissions?: string[];
};

export type UserInviteDto = {
  email?: string | null;
  fullName?: string | null;
  role?: UserRole;
  customRoleId?: string | null;
  scope?: AccessScopeMode;
  storeIds?: string[];
  expiresInDays?: number;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async getUsers(user: AuthenticatedUser): Promise<UserAccountsResponse> {
    const { tenantId } = this.tenantContextService.resolve(user);
    const actorScope = this.accessScopeService.resolve(user);
    const [users, stores, customRoles, invites, roleOverrides] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { tenantId },
          include: userAccountInclude,
          orderBy: [{ role: 'asc' }, { fullName: 'asc' }, { email: 'asc' }],
        }),
        this.prisma.store.findMany({
          where: { tenantId },
          select: { id: true, name: true, isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.userAccessRole.findMany({
          where: { tenantId },
          orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.userInvite.findMany({
          where: {
            tenantId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: userInviteInclude,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.userRoleOverride.findMany({
          where: { tenantId },
          select: {
            role: true,
            permissions: true,
            updatedAt: true,
          },
        }),
      ]);
    const storesById = this.createStoreMap(stores);
    const roleOverridesByRole = this.createRoleOverrideMap(roleOverrides);
    const visibleUsers = users.filter((account) =>
      this.isVisibleUserTarget(user, account),
    );
    const visibleInvites = invites
      .filter((invite) => this.isVisibleInviteTarget(user, invite, storesById))
      .slice(0, 20);
    const visibleStores =
      actorScope.mode === 'NETWORK'
        ? stores
        : stores.filter((store) =>
            actorScope.allowedStoreIds.includes(store.id),
          );

    return {
      users: visibleUsers.map((account) =>
        this.toAccount(account, roleOverridesByRole),
      ),
      stores: visibleStores,
      roleOptions: this.toRoleOptions(roleOverridesByRole),
      customRoles: customRoles.map((role) => this.toAccessRole(role)),
      invites: visibleInvites.map((invite) =>
        this.toInvite(invite, storesById),
      ),
      capabilityOptions: accessCapabilityCatalog,
    };
  }

  async createUser(
    actor: AuthenticatedUser,
    dto: UserAccountDto,
  ): Promise<UserAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    await this.assertGenericIdentityMutationAllowed(
      tenantId,
      'direct user creation',
    );
    const email = this.normalizeEmail(dto.email);
    const customRoleId = this.normalizeOptionalId(dto.customRoleId);
    const role = customRoleId
      ? UserRole.CLUB_ADMINISTRATOR
      : this.parseRole(dto.role);
    const fullName = this.normalizeNullableText(dto.fullName);
    const password = dto.password?.trim() ?? '';
    const scope = this.parseAccessScope(dto.scope);

    this.assertEmail(email);
    this.assertPassword(password);
    this.assertOwnerAssignmentUsesTransferWorkflow(role);

    const [existingUser, storeIds, customRole] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.resolveStoreIds(tenantId, dto.storeIds),
      this.resolveCustomRole(tenantId, customRoleId),
    ]);
    await this.assertCanAssignAccountRole(actor, role, customRole, tenantId);
    this.assertNewScope(scope, storeIds);
    this.accessScopeService.assertCanDelegate(actor, {
      mode: scope,
      storeIds,
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await this.passwordService.hash(password);
    const created = await this.prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          tenantId,
          email,
          fullName,
          passwordHash,
          role,
          customRoleId: customRole?.id ?? null,
          accessScope: scope,
          isActive: dto.isActive ?? true,
          emailVerifiedAt: new Date(),
        },
      });

      await this.replaceStoreAccesses(tx, account.id, storeIds);

      return tx.user.findUniqueOrThrow({
        where: { id: account.id },
        include: userAccountInclude,
      });
    });

    return this.toAccount(created, await this.getRoleOverrideMap(tenantId));
  }

  async createInvite(
    actor: AuthenticatedUser,
    dto: UserInviteDto,
  ): Promise<UserInviteAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    await this.assertGenericIdentityMutationAllowed(
      tenantId,
      'invite delivery',
    );
    const email = this.normalizeOptionalEmail(dto.email);
    const fullName = this.normalizeNullableText(dto.fullName);
    const customRoleId = this.normalizeOptionalId(dto.customRoleId);
    const role = customRoleId
      ? UserRole.CLUB_ADMINISTRATOR
      : this.parseRole(dto.role);
    const expiresAt = this.resolveInviteExpiry(dto.expiresInDays);
    const scope = this.parseAccessScope(dto.scope);

    if (!email) {
      throw new BadRequestException(
        'Invite must be bound to a valid email address',
      );
    }
    this.assertOwnerAssignmentUsesTransferWorkflow(role);

    const [existingUser, storeIds, customRole, stores] = await Promise.all([
      email ? this.prisma.user.findUnique({ where: { email } }) : null,
      this.resolveStoreIds(tenantId, dto.storeIds),
      this.resolveCustomRole(tenantId, customRoleId),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    await this.assertCanAssignAccountRole(actor, role, customRole, tenantId);
    this.assertNewScope(scope, storeIds);
    this.accessScopeService.assertCanDelegate(actor, {
      mode: scope,
      storeIds,
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const invite = await this.prisma.userInvite.create({
      data: {
        tenantId,
        email,
        fullName,
        role,
        customRoleId: customRole?.id ?? null,
        accessScope: scope,
        storeIds,
        tokenHash: this.hashInviteToken(rawToken),
        expiresAt,
        createdByUserId: actor.id,
      },
      include: userInviteInclude,
    });

    return this.toInvite(
      invite,
      this.createStoreMap(stores),
      this.buildInviteUrl(rawToken),
    );
  }

  async updateInvite(
    actor: AuthenticatedUser,
    id: string,
    dto: UserInviteDto,
  ): Promise<UserInviteAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    await this.assertGenericIdentityMutationAllowed(
      tenantId,
      'invite delivery',
    );
    const existing = await this.prisma.userInvite.findFirst({
      where: { id, tenantId },
      include: userInviteInclude,
    });

    if (!existing) {
      throw new NotFoundException('Invite not found');
    }

    if (existing.acceptedAt) {
      throw new BadRequestException('Invite is already used');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invite is expired');
    }

    const existingStoreIds = await this.resolveStoreIds(
      tenantId,
      existing.storeIds,
    );
    const existingScope = this.resolveManageableInviteScope(
      actor,
      existing,
      existingStoreIds,
    );

    const email =
      dto.email === undefined
        ? existing.email
        : this.normalizeOptionalEmail(dto.email);
    const fullName =
      dto.fullName === undefined
        ? existing.fullName
        : this.normalizeNullableText(dto.fullName);
    const customRoleId =
      dto.customRoleId === undefined
        ? existing.customRoleId
        : this.normalizeOptionalId(dto.customRoleId);
    const customRole =
      dto.customRoleId === undefined
        ? existing.customRole
        : await this.resolveCustomRole(tenantId, customRoleId);
    const role = customRole
      ? UserRole.CLUB_ADMINISTRATOR
      : dto.role
        ? this.parseRole(dto.role)
        : existing.role;
    const storeIds =
      dto.storeIds === undefined
        ? existingStoreIds
        : await this.resolveStoreIds(tenantId, dto.storeIds);
    const scope =
      dto.scope === undefined
        ? existingScope.mode
        : this.parseAccessScope(dto.scope);
    const expiresAt =
      dto.expiresInDays === undefined
        ? existing.expiresAt
        : this.resolveInviteExpiry(dto.expiresInDays);

    if (!email) {
      throw new BadRequestException(
        'Invite must be bound to a valid email address',
      );
    }
    this.assertOwnerAssignmentUsesTransferWorkflow(role);

    await this.assertCanAssignAccountRole(actor, role, customRole, tenantId);
    this.assertNewScope(scope, storeIds);
    this.accessScopeService.assertCanDelegate(actor, {
      mode: scope,
      storeIds,
    });
    this.assertInviteScopeNotWidened(existingScope, {
      mode: scope,
      storeIds,
    });

    if (email && email !== existing.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException(
          'Пользователь с таким email уже существует',
        );
      }
    }

    const rawToken = randomBytes(32).toString('base64url');
    const updatedCount = await this.prisma.userInvite.updateMany({
      where: {
        id: existing.id,
        tenantId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        updatedAt: existing.updatedAt,
      },
      data: {
        email,
        fullName,
        role,
        customRoleId: customRole?.id ?? null,
        accessScope: scope,
        storeIds,
        tokenHash: this.hashInviteToken(rawToken),
        expiresAt,
      },
    });

    if (updatedCount.count !== 1) {
      throw new ConflictException('Invite changed or was already accepted');
    }

    const [updated, stores] = await Promise.all([
      this.prisma.userInvite.findUniqueOrThrow({
        where: { id: existing.id },
        include: userInviteInclude,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return this.toInvite(
      updated,
      this.createStoreMap(stores),
      this.buildInviteUrl(rawToken),
    );
  }

  async cancelInvite(actor: AuthenticatedUser, id: string) {
    const { tenantId } = this.tenantContextService.resolve(actor);
    const existing = await this.prisma.userInvite.findFirst({
      where: { id, tenantId },
      include: userInviteInclude,
    });

    if (!existing) {
      throw new NotFoundException('Invite not found');
    }

    if (existing.acceptedAt) {
      throw new BadRequestException('Invite is already used');
    }

    const existingStoreIds = await this.resolveStoreIds(
      tenantId,
      existing.storeIds,
    );
    this.resolveManageableInviteScope(actor, existing, existingStoreIds);
    await this.assertCanAssignAccountRole(
      actor,
      existing.role,
      existing.customRole,
      tenantId,
    );

    if (existing.expiresAt.getTime() <= Date.now()) {
      return { id: existing.id };
    }

    const canceled = await this.prisma.userInvite.updateMany({
      where: {
        id: existing.id,
        tenantId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        updatedAt: existing.updatedAt,
      },
      data: { expiresAt: new Date() },
    });

    if (canceled.count !== 1) {
      throw new ConflictException('Invite changed or was already accepted');
    }

    return { id: existing.id };
  }

  async updateUser(
    actor: AuthenticatedUser,
    id: string,
    dto: UserAccountDto,
  ): Promise<UserAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: userAccountInclude,
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const existingScope = this.resolveManageableUserScope(actor, existing);
    await this.assertCanManageExistingUser(actor, existing, tenantId);

    const data: Prisma.UserUpdateInput = {};
    const customRoleId =
      dto.customRoleId === undefined
        ? existing.customRoleId
        : this.normalizeOptionalId(dto.customRoleId);
    const customRole =
      dto.customRoleId === undefined
        ? existing.customRole
        : await this.resolveCustomRole(tenantId, customRoleId);
    const nextRole = customRole
      ? UserRole.CLUB_ADMINISTRATOR
      : dto.role
        ? this.parseRole(dto.role)
        : existing.role;
    const roleChanged =
      nextRole !== existing.role ||
      (customRole?.id ?? null) !== existing.customRoleId;

    if (roleChanged) {
      if (existing.id === actor.id) {
        throw new BadRequestException('You cannot change your own role');
      }
      this.assertOwnerAssignmentUsesTransferWorkflow(nextRole);
      await this.assertCanAssignAccountRole(
        actor,
        nextRole,
        customRole,
        tenantId,
      );
      data.role = nextRole;
      if (customRole) {
        data.customRole = {
          connect: {
            id: customRole.id,
          },
        };
      } else if (existing.customRoleId) {
        data.customRole = {
          disconnect: true,
        };
      }
    }

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      this.assertEmail(email);

      if (email !== existing.email) {
        await this.assertGenericIdentityMutationAllowed(
          tenantId,
          'email change',
        );
        const emailOwner = await this.prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (emailOwner && emailOwner.id !== existing.id) {
          throw new ConflictException(
            'Пользователь с таким email уже существует',
          );
        }

        data.email = email;
        data.emailVerifiedAt = new Date();
      }
    }

    if (dto.fullName !== undefined) {
      data.fullName = this.normalizeNullableText(dto.fullName);
    }

    if (dto.isActive !== undefined) {
      if (existing.id === actor.id && !dto.isActive) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      data.isActive = Boolean(dto.isActive);
    }

    if (dto.password !== undefined && dto.password.trim()) {
      const password = dto.password.trim();
      this.assertPassword(password);
      data.passwordHash = await this.passwordService.hash(password);
    }

    const storeIds =
      dto.storeIds === undefined
        ? existingScope.storeIds
        : await this.resolveStoreIds(tenantId, dto.storeIds);
    const scope =
      dto.scope === undefined
        ? existingScope.mode
        : this.parseAccessScope(dto.scope);
    const scopeChanged =
      scope !== existingScope.mode ||
      !this.sameStoreIds(storeIds, existingScope.storeIds);
    const removesActiveNetworkOwner =
      this.isActiveNetworkOwner(existing) &&
      !this.isActiveNetworkOwner({
        role: nextRole,
        customRoleId: customRole?.id ?? null,
        accessScope: scope,
        isActive:
          dto.isActive === undefined
            ? existing.isActive
            : Boolean(dto.isActive),
      });

    if (scopeChanged) {
      if (existing.id === actor.id) {
        throw new BadRequestException(
          'You cannot change your own access scope',
        );
      }

      this.assertNewScope(scope, storeIds);
      this.accessScopeService.assertCanDelegate(actor, {
        mode: scope,
        storeIds,
      });
      data.accessScope = scope;
    }

    let updated: UserAccountRow;

    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await this.lockUserForUpdate(tx, tenantId, existing.id);

        if (removesActiveNetworkOwner) {
          await this.assertAnotherActiveNetworkOwnerExists(tx, {
            tenantId,
            targetUserId: existing.id,
            expectedUpdatedAt: existing.updatedAt,
          });
        }

        if (scopeChanged) {
          await this.replaceStoreAccesses(tx, existing.id, storeIds);
        }

        return tx.user.update({
          where: {
            id: existing.id,
            tenantId,
            updatedAt: existing.updatedAt,
          },
          data,
          include: userAccountInclude,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(
          'User changed while the update was being prepared',
        );
      }

      throw error;
    }

    return this.toAccount(updated, await this.getRoleOverrideMap(tenantId));
  }

  private async assertGenericIdentityMutationAllowed(
    tenantId: string,
    operation: 'direct user creation' | 'email change' | 'invite delivery',
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { customerStage: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant was not found');
    }
    if (tenant.customerStage === TenantCustomerStage.INTERNAL) {
      return;
    }

    const messageByOperation = {
      'direct user creation':
        'External tenants must create users through email-bound invites',
      'invite delivery':
        'External tenant invitations require the verified email-delivery workflow',
      'email change':
        'External tenant email changes require the verified email-change workflow',
    } satisfies Record<typeof operation, string>;
    throw new ForbiddenException(messageByOperation[operation]);
  }

  async createAccessRole(
    actor: AuthenticatedUser,
    dto: UserAccessRoleDto,
  ): Promise<UserAccessRoleAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    this.assertCanManageUsers(actor);
    this.accessScopeService.assertNetwork(actor);
    const data = this.normalizeAccessRoleDto(dto);
    this.assertCapabilitiesGrantable(actor, data.permissions);

    try {
      const role = await this.prisma.userAccessRole.create({
        data: {
          tenantId,
          ...data,
        },
      });

      return this.toAccessRole(role);
    } catch (error) {
      this.handleUniqueRoleNameError(error);
    }
  }

  async updateAccessRole(
    actor: AuthenticatedUser,
    id: string,
    dto: UserAccessRoleDto,
  ): Promise<UserAccessRoleAccount> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    this.assertCanManageUsers(actor);
    this.accessScopeService.assertNetwork(actor);
    await this.assertAccessRoleExists(tenantId, id);
    const data = this.normalizeAccessRoleDto(dto);
    this.assertCapabilitiesGrantable(actor, data.permissions);

    try {
      const role = await this.prisma.userAccessRole.update({
        where: { id },
        data,
      });

      return this.toAccessRole(role);
    } catch (error) {
      this.handleUniqueRoleNameError(error);
    }
  }

  async updateSystemRole(
    actor: AuthenticatedUser,
    roleValue: string,
    dto: UserRoleOverrideDto,
  ): Promise<UserRoleOption> {
    const { tenantId } = this.tenantContextService.resolve(actor);
    this.accessScopeService.assertNetwork(actor);
    const role = this.parseRole(roleValue);
    this.assertCanManageSystemRoleOverride(actor, role);
    const permissions = normalizeCapabilities(dto.permissions);
    this.assertCapabilitiesGrantable(actor, permissions);

    const override = await this.prisma.userRoleOverride.upsert({
      where: {
        tenantId_role: {
          tenantId,
          role,
        },
      },
      create: {
        tenantId,
        role,
        permissions,
      },
      update: {
        permissions,
      },
      select: {
        role: true,
        permissions: true,
        updatedAt: true,
      },
    });

    return this.toRoleOption(role, override);
  }

  private isVisibleUserTarget(
    actor: AuthenticatedUser,
    target: UserAccountRow,
  ): boolean {
    if (target.isPlatformAdmin) {
      return false;
    }

    try {
      return this.accessScopeService.isVisibleTarget(
        actor,
        this.resolvePersistedUserScope(target),
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        return false;
      }

      throw error;
    }
  }

  private isVisibleInviteTarget(
    actor: AuthenticatedUser,
    target: UserInviteRow,
    storesById: Map<string, UserAccountStore>,
  ): boolean {
    if (
      new Set(target.storeIds).size !== target.storeIds.length ||
      target.storeIds.some((storeId) => !storesById.has(storeId))
    ) {
      return false;
    }

    try {
      return this.accessScopeService.isVisibleTarget(
        actor,
        this.resolvePersistedInviteScope(target, target.storeIds),
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        return false;
      }

      throw error;
    }
  }

  private resolvePersistedUserScope(
    target: UserAccountRow,
  ): RequestedAccessScope {
    return this.accessScopeService.fromPersisted({
      tenantId: target.tenantId,
      accessScope: target.accessScope,
      storeAccesses: target.storeAccesses,
    });
  }

  private resolvePersistedInviteScope(
    target: UserInviteRow,
    storeIds: readonly string[],
  ): RequestedAccessScope {
    return this.accessScopeService.fromPersisted({
      tenantId: target.tenantId,
      accessScope: target.accessScope,
      storeAccesses: storeIds.map((storeId) => ({ storeId })),
    });
  }

  private resolveManageableUserScope(
    actor: AuthenticatedUser,
    target: UserAccountRow,
  ): RequestedAccessScope {
    if (target.isPlatformAdmin) {
      throw new NotFoundException('User not found');
    }

    try {
      const scope = this.resolvePersistedUserScope(target);
      this.accessScopeService.assertCanManageTarget(actor, scope);
      return scope;
    } catch (error) {
      this.rethrowScopeTargetAsNotFound(error, 'User');
    }
  }

  private resolveManageableInviteScope(
    actor: AuthenticatedUser,
    target: UserInviteRow,
    storeIds: readonly string[],
  ): RequestedAccessScope {
    try {
      const scope = this.resolvePersistedInviteScope(target, storeIds);
      this.accessScopeService.assertCanManageTarget(actor, scope);
      return scope;
    } catch (error) {
      this.rethrowScopeTargetAsNotFound(error, 'Invite');
    }
  }

  private rethrowScopeTargetAsNotFound(
    error: unknown,
    targetLabel: 'User' | 'Invite',
  ): never {
    if (
      error instanceof UnauthorizedException ||
      error instanceof ForbiddenException
    ) {
      throw new NotFoundException(`${targetLabel} not found`);
    }

    throw error;
  }

  private parseAccessScope(value: unknown): AccessScopeMode {
    if (value === 'NETWORK' || value === 'STORES') {
      return value;
    }

    throw new BadRequestException('Access scope is required');
  }

  private assertNewScope(
    mode: AccessScopeMode,
    storeIds: readonly string[],
  ): void {
    if (mode === 'NETWORK' && storeIds.length > 0) {
      throw new BadRequestException(
        'Network access cannot contain explicit stores',
      );
    }

    if (mode === 'STORES' && storeIds.length === 0) {
      throw new BadRequestException(
        'Store access must contain at least one store',
      );
    }
  }

  private assertInviteScopeNotWidened(
    current: RequestedAccessScope,
    next: RequestedAccessScope,
  ): void {
    if (current.mode === 'NETWORK') {
      return;
    }

    if (
      next.mode === 'NETWORK' ||
      next.storeIds.some((storeId) => !current.storeIds.includes(storeId))
    ) {
      throw new BadRequestException(
        'Issue a new invite to widen its access scope',
      );
    }
  }

  private sameStoreIds(
    left: readonly string[],
    right: readonly string[],
  ): boolean {
    return (
      left.length === right.length &&
      left.every((storeId) => right.includes(storeId))
    );
  }

  private isActiveNetworkOwner(account: {
    role: UserRole;
    customRoleId: string | null;
    accessScope: AccessScopeMode | null;
    isActive: boolean;
  }): boolean {
    return (
      account.role === UserRole.OWNER &&
      account.customRoleId === null &&
      account.accessScope === UserAccessScope.NETWORK &&
      account.isActive
    );
  }

  private async assertAnotherActiveNetworkOwnerExists(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      targetUserId: string;
      expectedUpdatedAt: Date;
    },
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`users:last-active-network-owner:${input.tenantId}`},
            0
          )
        )
      `,
    );

    const target = await tx.user.findFirst({
      where: {
        id: input.targetUserId,
        tenantId: input.tenantId,
      },
      select: {
        role: true,
        customRoleId: true,
        accessScope: true,
        isActive: true,
        updatedAt: true,
      },
    });

    if (
      !target ||
      target.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() ||
      !this.isActiveNetworkOwner(target)
    ) {
      throw new ConflictException(
        'User changed while the update was being prepared',
      );
    }

    const otherOwnerCount = await tx.user.count({
      where: {
        tenantId: input.tenantId,
        id: { not: input.targetUserId },
        role: UserRole.OWNER,
        customRoleId: null,
        accessScope: UserAccessScope.NETWORK,
        isActive: true,
      },
    });

    if (otherOwnerCount === 0) {
      throw new ConflictException(
        'Tenant must retain at least one active NETWORK OWNER',
      );
    }
  }

  private async lockUserForUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT subject."id"
      FROM "User" AS subject
      WHERE subject."id" = ${userId}
        AND subject."tenantId" = ${tenantId}
      FOR UPDATE
    `);

    if (lockedUsers.length !== 1) {
      throw new ConflictException(
        'User changed while the update was being prepared',
      );
    }
  }

  private async assertCanManageExistingUser(
    actor: AuthenticatedUser,
    target: Pick<UserAccountRow, 'role' | 'customRole'>,
    tenantId: string,
  ) {
    if (!this.getAssignableRoles(actor).includes(target.role)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    const roleOverride = target.customRole
      ? null
      : await this.prisma.userRoleOverride.findUnique({
          where: {
            tenantId_role: {
              tenantId,
              role: target.role,
            },
          },
          select: {
            permissions: true,
          },
        });

    this.assertCapabilitiesGrantable(
      actor,
      resolveUserCapabilities({ ...target, roleOverride }),
    );
  }

  private assertCanManageUsers(actor: AuthenticatedUser) {
    if (this.getAssignableRoles(actor).length > 0) {
      return;
    }

    throw new ForbiddenException('Insufficient role permissions');
  }

  private assertCanManageSystemRoleOverride(
    actor: AuthenticatedUser,
    role: UserRole,
  ) {
    if (
      actor.isPlatformAdmin ||
      actor.role === UserRole.OWNER ||
      actor.role === UserRole.ADMIN ||
      ((actor.role === UserRole.MANAGER ||
        actor.role === UserRole.STANDARDS_MANAGER) &&
        this.getAssignableRoles(actor).includes(role))
    ) {
      return;
    }

    throw new ForbiddenException('Insufficient role permissions');
  }

  private async assertCanAssignAccountRole(
    actor: AuthenticatedUser,
    role: UserRole,
    customRole: UserAccessRoleRow | null,
    tenantId: string,
  ) {
    if (customRole) {
      this.assertCanManageUsers(actor);
      this.assertCapabilitiesGrantable(
        actor,
        normalizeCapabilities(customRole.permissions),
      );
      return;
    }

    this.assertCanAssignRole(actor, role);
    const roleOverride = await this.prisma.userRoleOverride.findUnique({
      where: {
        tenantId_role: {
          tenantId,
          role,
        },
      },
      select: {
        permissions: true,
      },
    });
    this.assertCapabilitiesGrantable(
      actor,
      roleOverride
        ? resolveUserCapabilities({ role, roleOverride })
        : roleCapabilities[role],
    );
  }

  private assertCanAssignRole(actor: AuthenticatedUser, role: UserRole) {
    if (this.getAssignableRoles(actor).includes(role)) {
      return;
    }

    throw new ForbiddenException('You cannot assign this role');
  }

  private assertOwnerAssignmentUsesTransferWorkflow(role: UserRole) {
    if (role === UserRole.OWNER) {
      throw new ForbiddenException(
        'OWNER assignment requires the dedicated owner-transfer workflow',
      );
    }
  }

  private getAssignableRoles(actor: AuthenticatedUser) {
    return assignableRolesByActor[actor.role] ?? [];
  }

  private assertCapabilitiesGrantable(
    actor: AuthenticatedUser,
    permissions: AccessCapability[],
  ) {
    if (actor.isPlatformAdmin) {
      return;
    }

    const deniedPermissions = permissions.filter(
      (permission) =>
        !hasCapability(
          { permissions: this.getActorGrantableCapabilities(actor) },
          permission,
        ),
    );

    if (deniedPermissions.length > 0) {
      throw new ForbiddenException(
        'You cannot grant permissions outside your access scope',
      );
    }
  }

  private getActorGrantableCapabilities(actor: AuthenticatedUser) {
    const explicitPermissions = normalizeCapabilities(actor.permissions);

    if (
      explicitPermissions.length > 0 ||
      actor.customRoleId ||
      actor.hasRoleOverride
    ) {
      return explicitPermissions;
    }

    return roleCapabilities[actor.role] ?? [];
  }

  private parseRole(role: unknown): UserRole {
    if (!role || typeof role !== 'string') {
      throw new BadRequestException('Role is required');
    }

    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException('Unknown user role');
    }

    return role as UserRole;
  }

  private normalizeOptionalId(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Role id must be a string');
    }

    return value.trim() || null;
  }

  private async resolveCustomRole(
    tenantId: string,
    customRoleId: string | null,
  ): Promise<UserAccessRoleRow | null> {
    if (!customRoleId) {
      return null;
    }

    const role = await this.prisma.userAccessRole.findFirst({
      where: { id: customRoleId, tenantId },
    });

    if (!role) {
      throw new BadRequestException('Custom role was not found');
    }

    return role;
  }

  private async assertAccessRoleExists(tenantId: string, id: string) {
    const role = await this.prisma.userAccessRole.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException('Custom role not found');
    }
  }

  private normalizeAccessRoleDto(dto: UserAccessRoleDto) {
    const name = this.normalizeText(dto.name);

    if (!name) {
      throw new BadRequestException('Role name is required');
    }

    return {
      name,
      description: this.normalizeNullableText(dto.description),
      permissions: normalizeCapabilities(dto.permissions),
    };
  }

  private normalizeText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim();
  }

  private handleUniqueRoleNameError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Role with this name already exists');
    }

    throw error;
  }

  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      return '';
    }

    return email.trim().toLowerCase();
  }

  private normalizeOptionalEmail(email: unknown): string | null {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return null;
    }

    this.assertEmail(normalizedEmail);
    return normalizedEmail;
  }

  private normalizeNullableText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const text = value.trim();
    return text || null;
  }

  private assertEmail(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Укажите корректный email');
    }
  }

  private assertPassword(password: string): void {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'Пароль должен содержать минимум 8 символов',
      );
    }
  }

  private resolveInviteExpiry(value: unknown): Date {
    const days =
      typeof value === 'number' && Number.isFinite(value) ? value : 7;
    const normalizedDays = Math.min(30, Math.max(1, Math.floor(days)));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + normalizedDays);
    return expiresAt;
  }

  private hashInviteToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildInviteUrl(token: string): string {
    const configuredBase =
      this.configService.get<string>('WEB_URL') ??
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('NEXT_PUBLIC_WEB_URL') ??
      'https://leetplus.ru';
    const base = configuredBase.replace(/\/+$/, '');

    return `${base}/register?invite=${encodeURIComponent(token)}`;
  }

  private async resolveStoreIds(tenantId: string, storeIds: unknown) {
    if (storeIds === undefined || storeIds === null) {
      return [] satisfies string[];
    }

    if (!Array.isArray(storeIds)) {
      throw new BadRequestException('Store ids must be an array');
    }

    const uniqueIds = Array.from(
      new Set(
        storeIds
          .filter((storeId): storeId is string => typeof storeId === 'string')
          .map((storeId) => storeId.trim())
          .filter(Boolean),
      ),
    );

    if (uniqueIds.length === 0) {
      return [] satisfies string[];
    }

    const stores = await this.prisma.store.findMany({
      where: { tenantId, id: { in: uniqueIds } },
      select: { id: true },
    });

    if (stores.length !== uniqueIds.length) {
      throw new BadRequestException('One or more stores were not found');
    }

    return uniqueIds;
  }

  private createStoreMap(stores: UserAccountStore[]) {
    return new Map(stores.map((store) => [store.id, store] as const));
  }

  private async getRoleOverrideMap(tenantId: string) {
    const roleOverrides = await this.prisma.userRoleOverride.findMany({
      where: { tenantId },
      select: {
        role: true,
        permissions: true,
        updatedAt: true,
      },
    });

    return this.createRoleOverrideMap(roleOverrides);
  }

  private createRoleOverrideMap(roleOverrides: UserRoleOverrideRow[]) {
    return new Map(roleOverrides.map((override) => [override.role, override]));
  }

  private async replaceStoreAccesses(
    tx: Prisma.TransactionClient,
    userId: string,
    storeIds: readonly string[],
  ) {
    await tx.userStoreAccess.deleteMany({ where: { userId } });

    if (storeIds.length === 0) {
      return;
    }

    await tx.userStoreAccess.createMany({
      data: storeIds.map((storeId) => ({ userId, storeId })),
      skipDuplicates: true,
    });
  }

  private toRoleOptions(
    roleOverridesByRole: Map<UserRole, UserRoleOverrideRow>,
  ): UserRoleOption[] {
    return baseRoleOptions
      .filter((option) => option.role !== UserRole.OWNER)
      .map((option) =>
        this.toRoleOption(option.role, roleOverridesByRole.get(option.role)),
      );
  }

  private toRoleOption(
    role: UserRole,
    override?: UserRoleOverrideRow | null,
  ): UserRoleOption {
    const baseRole = baseRoleOptions.find((option) => option.role === role);

    if (!baseRole) {
      throw new BadRequestException('Unknown user role');
    }

    return {
      role: baseRole.role,
      label: baseRole.label,
      description: baseRole.description,
      permissions: override
        ? resolveUserCapabilities({ role, roleOverride: override })
        : baseRole.permissions,
      isOverridden: Boolean(override),
      updatedAt: override?.updatedAt.toISOString() ?? null,
    };
  }

  private toAccount(
    account: UserAccountRow,
    roleOverridesByRole: Map<UserRole, UserRoleOverrideRow>,
  ): UserAccount {
    const accessScope = this.resolvePersistedUserScope(account);
    const stores = account.storeAccesses
      .map((access) => ({
        id: access.store.id,
        name: access.store.name,
        isActive: access.store.isActive,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      customRoleId: account.customRoleId,
      customRole: account.customRole
        ? this.toAccessRole(account.customRole)
        : null,
      permissions: resolveUserCapabilities({
        ...account,
        roleOverride: roleOverridesByRole.get(account.role) ?? null,
      }),
      isActive: account.isActive,
      isPlatformAdmin: account.isPlatformAdmin,
      emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      scope: accessScope.mode,
      stores,
    };
  }

  private toAccessRole(role: UserAccessRoleRow): UserAccessRoleAccount {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: normalizeCapabilities(role.permissions),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private toInvite(
    invite: UserInviteRow,
    storesById: Map<string, UserAccountStore>,
    registrationUrl?: string,
  ): UserInviteAccount {
    const accessScope = this.resolvePersistedInviteScope(
      invite,
      invite.storeIds,
    );
    const stores = invite.storeIds
      .map((storeId) => storesById.get(storeId))
      .filter((store): store is UserAccountStore => Boolean(store))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return {
      id: invite.id,
      email: invite.email,
      fullName: invite.fullName,
      role: invite.role,
      customRoleId: invite.customRoleId,
      customRole: invite.customRole
        ? this.toAccessRole(invite.customRole)
        : null,
      scope: accessScope.mode,
      stores,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      ...(registrationUrl ? { registrationUrl } : {}),
    };
  }
}
