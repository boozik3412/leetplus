import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, UserRole } from '@prisma/client';
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
  scope: 'NETWORK' | 'STORES';
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
  scope: 'NETWORK' | 'STORES';
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
  ) {}

  async getUsers(user: AuthenticatedUser): Promise<UserAccountsResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
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
          take: 20,
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

    return {
      users: users.map((account) =>
        this.toAccount(account, roleOverridesByRole),
      ),
      stores,
      roleOptions: this.toRoleOptions(roleOverridesByRole),
      customRoles: customRoles.map((role) => this.toAccessRole(role)),
      invites: invites.map((invite) => this.toInvite(invite, storesById)),
      capabilityOptions: accessCapabilityCatalog,
    };
  }

  async createUser(
    actor: AuthenticatedUser,
    dto: UserAccountDto,
  ): Promise<UserAccount> {
    const { tenantId } = await this.tenantContextService.resolve(actor);
    const email = this.normalizeEmail(dto.email);
    const customRoleId = this.normalizeOptionalId(dto.customRoleId);
    const role = customRoleId
      ? UserRole.CLUB_ADMINISTRATOR
      : this.parseRole(dto.role);
    const fullName = this.normalizeNullableText(dto.fullName);
    const password = dto.password?.trim() ?? '';

    this.assertEmail(email);
    this.assertPassword(password);

    const [existingUser, storeIds, customRole] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.resolveStoreIds(tenantId, dto.storeIds),
      this.resolveCustomRole(tenantId, customRoleId),
    ]);
    this.assertCanAssignAccountRole(actor, role, customRole);

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
    const { tenantId } = await this.tenantContextService.resolve(actor);
    const email = this.normalizeOptionalEmail(dto.email);
    const fullName = this.normalizeNullableText(dto.fullName);
    const customRoleId = this.normalizeOptionalId(dto.customRoleId);
    const role = customRoleId
      ? UserRole.CLUB_ADMINISTRATOR
      : this.parseRole(dto.role);
    const expiresAt = this.resolveInviteExpiry(dto.expiresInDays);

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
    this.assertCanAssignAccountRole(actor, role, customRole);

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

  async updateUser(
    actor: AuthenticatedUser,
    id: string,
    dto: UserAccountDto,
  ): Promise<UserAccount> {
    const { tenantId } = await this.tenantContextService.resolve(actor);
    const existing = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: userAccountInclude,
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    this.assertCanManageExistingUser(actor, existing);

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
      this.assertCanAssignAccountRole(actor, nextRole, customRole);
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
        ? undefined
        : await this.resolveStoreIds(tenantId, dto.storeIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (storeIds !== undefined) {
        await this.replaceStoreAccesses(tx, existing.id, storeIds);
      }

      return tx.user.update({
        where: { id: existing.id },
        data,
        include: userAccountInclude,
      });
    });

    return this.toAccount(updated, await this.getRoleOverrideMap(tenantId));
  }

  async createAccessRole(
    actor: AuthenticatedUser,
    dto: UserAccessRoleDto,
  ): Promise<UserAccessRoleAccount> {
    const { tenantId } = await this.tenantContextService.resolve(actor);
    this.assertCanManageUsers(actor);
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
    const { tenantId } = await this.tenantContextService.resolve(actor);
    this.assertCanManageUsers(actor);
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
    const { tenantId } = await this.tenantContextService.resolve(actor);
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

  private assertCanManageExistingUser(
    actor: AuthenticatedUser,
    target: Pick<UserAccountRow, 'role'>,
  ) {
    if (this.getAssignableRoles(actor).includes(target.role)) {
      return;
    }

    throw new ForbiddenException('Insufficient role permissions');
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

  private assertCanAssignAccountRole(
    actor: AuthenticatedUser,
    role: UserRole,
    customRole: UserAccessRoleRow | null,
  ) {
    if (customRole) {
      this.assertCanManageUsers(actor);
      return;
    }

    this.assertCanAssignRole(actor, role);
  }

  private assertCanAssignRole(actor: AuthenticatedUser, role: UserRole) {
    if (this.getAssignableRoles(actor).includes(role)) {
      return;
    }

    throw new ForbiddenException('You cannot assign this role');
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
    storeIds: string[],
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
    return baseRoleOptions.map((option) =>
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
    const stores = account.storeAccesses
      .map((access) => access.store)
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
      scope: stores.length > 0 ? 'STORES' : 'NETWORK',
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
      scope: stores.length > 0 ? 'STORES' : 'NETWORK',
      stores,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      ...(registrationUrl ? { registrationUrl } : {}),
    };
  }
}
