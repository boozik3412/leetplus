import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
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
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
  ],
  [UserRole.ADMIN]: [
    UserRole.MANAGER,
    UserRole.BUYER,
    UserRole.MARKETER,
    UserRole.CLUB_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
    UserRole.CLUB_ADMINISTRATOR,
  ],
  [UserRole.MANAGER]: [],
  [UserRole.BUYER]: [],
  [UserRole.MARKETER]: [],
  [UserRole.CLUB_MANAGER]: [],
  [UserRole.SENIOR_ADMINISTRATOR]: [],
  [UserRole.CLUB_ADMINISTRATOR]: [],
};

const roleOptions = [
  {
    role: UserRole.OWNER,
    label: 'Владелец',
    description: 'Полный доступ к сети, настройкам, ролям и финансам.',
  },
  {
    role: UserRole.ADMIN,
    label: 'Администратор системы',
    description: 'Операционное администрирование LeetPlus без смены владельца.',
  },
  {
    role: UserRole.MANAGER,
    label: 'Управляющий сетью',
    description:
      'Дашборды, гости, маркетинг, персонал и ассортиментные отчеты.',
  },
  {
    role: UserRole.CLUB_MANAGER,
    label: 'Управляющий клубом',
    description: 'Операционная работа по выбранным клубам и персоналу.',
  },
  {
    role: UserRole.MARKETER,
    label: 'Маркетолог',
    description: 'Маркетинг, CRM-группы, кампании и промо-наборы.',
  },
  {
    role: UserRole.BUYER,
    label: 'Закупщик',
    description: 'Ассортимент, товары, поставщики и коммерческие отчеты.',
  },
  {
    role: UserRole.SENIOR_ADMINISTRATOR,
    label: 'Старший администратор',
    description: 'Задачи персонала, чеклисты смены и контроль выполнения.',
  },
  {
    role: UserRole.CLUB_ADMINISTRATOR,
    label: 'Администратор клуба',
    description: 'Сменные задачи и чеклисты без лишних управленческих данных.',
  },
] satisfies Array<{
  role: UserRole;
  label: string;
  description: string;
}>;

const userAccountInclude = {
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

type UserAccountRow = Prisma.UserGetPayload<{
  include: typeof userAccountInclude;
}>;

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
  isActive: boolean;
  isPlatformAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scope: 'NETWORK' | 'STORES';
  stores: UserAccountStore[];
};

export type UserAccountsResponse = {
  users: UserAccount[];
  stores: UserAccountStore[];
  roleOptions: typeof roleOptions;
};

export type UserAccountDto = {
  email?: string;
  fullName?: string | null;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  storeIds?: string[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getUsers(user: AuthenticatedUser): Promise<UserAccountsResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [users, stores] = await Promise.all([
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
    ]);

    return {
      users: users.map((account) => this.toAccount(account)),
      stores,
      roleOptions,
    };
  }

  async createUser(
    actor: AuthenticatedUser,
    dto: UserAccountDto,
  ): Promise<UserAccount> {
    const { tenantId } = await this.tenantContextService.resolve(actor);
    const email = this.normalizeEmail(dto.email);
    const role = this.parseRole(dto.role);
    const fullName = this.normalizeNullableText(dto.fullName);
    const password = dto.password?.trim() ?? '';

    this.assertEmail(email);
    this.assertPassword(password);
    this.assertCanAssignRole(actor, role);

    const [existingUser, storeIds] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.resolveStoreIds(tenantId, dto.storeIds),
    ]);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
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

    return this.toAccount(created);
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
    const nextRole = dto.role ? this.parseRole(dto.role) : existing.role;

    if (dto.role && dto.role !== existing.role) {
      if (existing.id === actor.id) {
        throw new BadRequestException('You cannot change your own role');
      }
      this.assertCanAssignRole(actor, nextRole);
      data.role = nextRole;
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
          throw new ConflictException('User with this email already exists');
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

    return this.toAccount(updated);
  }

  private assertCanManageExistingUser(
    actor: AuthenticatedUser,
    target: Pick<UserAccountRow, 'role'>,
  ) {
    if (actor.role === UserRole.OWNER) {
      return;
    }

    if (actor.role === UserRole.ADMIN) {
      if (target.role === UserRole.OWNER || target.role === UserRole.ADMIN) {
        throw new ForbiddenException(
          'Only owner can manage owner or system admin accounts',
        );
      }
      return;
    }

    throw new ForbiddenException('Insufficient role permissions');
  }

  private assertCanAssignRole(actor: AuthenticatedUser, role: UserRole) {
    if (!assignableRolesByActor[actor.role]?.includes(role)) {
      throw new ForbiddenException('You cannot assign this role');
    }
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

  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      return '';
    }

    return email.trim().toLowerCase();
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
      throw new BadRequestException('Valid email is required');
    }
  }

  private assertPassword(password: string): void {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'Password must contain at least 8 characters',
      );
    }
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

  private toAccount(account: UserAccountRow): UserAccount {
    const stores = account.storeAccesses
      .map((access) => access.store)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      isActive: account.isActive,
      isPlatformAdmin: account.isPlatformAdmin,
      emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      scope: stores.length > 0 ? 'STORES' : 'NETWORK',
      stores,
    };
  }
}
