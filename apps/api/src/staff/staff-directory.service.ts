import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const memberStatuses = [
  'ACTIVE',
  'ONBOARDING',
  'SUSPENDED',
  'DISMISSED',
] as const;

const employmentTypes = [
  'FULL_TIME',
  'PART_TIME',
  'SHIFT',
  'TRAINEE',
  'CONTRACTOR',
] as const;

const manageableRoles = new Set<UserRole>([
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
]);

export type StaffMemberStatus = (typeof memberStatuses)[number];
export type StaffMemberEmploymentType = (typeof employmentTypes)[number];

export type StaffDirectoryQuery = {
  status?: StaffMemberStatus | 'all';
  role?: UserRole | 'all';
  storeId?: string;
  search?: string;
};

export type StaffMemberDto = {
  displayName?: string;
  role?: UserRole;
  status?: StaffMemberStatus;
  position?: string | null;
  employmentType?: StaffMemberEmploymentType | null;
  email?: string | null;
  phone?: string | null;
  hiredAt?: string | null;
  dismissedAt?: string | null;
  storeId?: string | null;
  userId?: string | null;
  externalDomain?: string | null;
  externalUserId?: string | null;
  note?: string | null;
};

export type StaffDirectoryReport = {
  filters: {
    status: StaffMemberStatus | 'all';
    role: UserRole | 'all';
    storeId: string | null;
    search: string | null;
  };
  canManageDirectory: boolean;
  summary: {
    total: number;
    active: number;
    onboarding: number;
    suspended: number;
    dismissed: number;
    linkedAccounts: number;
    linkedLangameUsers: number;
  };
  rows: StaffMemberResponse[];
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    isActive: boolean;
  }>;
  legacyMappings: StaffLegacyIdentityMapping[];
};

export type StaffMemberResponse = {
  id: string;
  displayName: string;
  role: UserRole;
  status: StaffMemberStatus;
  position: string | null;
  employmentType: StaffMemberEmploymentType | null;
  email: string | null;
  phone: string | null;
  hiredAt: string | null;
  dismissedAt: string | null;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalUserId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string; isActive: boolean } | null;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    isActive: boolean;
  } | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffLegacyIdentityMapping = {
  id: string;
  externalProvider: IntegrationProvider | null;
  externalDomain: string;
  externalUserId: string;
  guestName: string | null;
  note: string | null;
  mappedStaffMemberId: string | null;
};

const staffMemberInclude = {
  store: { select: { id: true, name: true, isActive: true } },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  },
  createdByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffMemberInclude;

type StaffMemberRow = Prisma.StaffMemberGetPayload<{
  include: typeof staffMemberInclude;
}>;

@Injectable()
export class StaffDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getDirectory(
    user: AuthenticatedUser,
    query: StaffDirectoryQuery = {},
  ): Promise<StaffDirectoryReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);
    const canManageDirectory = this.canManageDirectory(user);

    const [rows, stores, users, legacyMappings] = await Promise.all([
      this.prisma.staffMember.findMany({
        where,
        include: staffMemberInclude,
        orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
        take: 300,
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
        },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }, { email: 'asc' }],
      }),
      this.getLegacyMappings(tenantId),
    ]);
    const responseRows = rows.map((row) => this.toMemberResponse(row));

    return {
      filters,
      canManageDirectory,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      users,
      legacyMappings: this.attachMappedMembers(responseRows, legacyMappings),
    };
  }

  async getCurrentMember(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.staffMember.findMany({
      where: {
        tenantId,
        OR: [
          { userId: user.id },
          { user: { email: user.email } },
          { email: user.email },
        ],
      },
      include: staffMemberInclude,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    const row =
      rows.find((member) => member.userId === user.id) ??
      rows.find((member) => member.user?.email === user.email) ??
      rows.find((member) => member.email === user.email) ??
      null;

    return {
      staffMember: row ? this.toMemberResponse(row) : null,
    };
  }

  async createMember(user: AuthenticatedUser, dto: StaffMemberDto) {
    this.assertCanManageDirectory(user);
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeMemberData(tenantId, dto, true);
    const created = await this.prisma.staffMember.create({
      data: {
        ...(data as Prisma.StaffMemberUncheckedCreateInput),
        tenantId,
        createdByUserId: user.id,
      },
      include: staffMemberInclude,
    });

    return this.toMemberResponse(created);
  }

  async updateMember(user: AuthenticatedUser, id: string, dto: StaffMemberDto) {
    this.assertCanManageDirectory(user);
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('Staff member not found');
    }

    const data = await this.normalizeMemberData(tenantId, dto, false);
    const updated = await this.prisma.staffMember.update({
      where: { id: current.id },
      data,
      include: staffMemberInclude,
    });

    return this.toMemberResponse(updated);
  }

  private resolveFilters(
    query: StaffDirectoryQuery,
  ): StaffDirectoryReport['filters'] {
    const status: StaffMemberStatus | 'all' = memberStatuses.includes(
      query.status as StaffMemberStatus,
    )
      ? (query.status as StaffMemberStatus)
      : query.status === 'all'
        ? 'all'
        : 'ACTIVE';
    const role =
      query.role === 'all' ||
      Object.values(UserRole).includes(query.role as UserRole)
        ? (query.role as UserRole | 'all')
        : 'all';

    return {
      status,
      role,
      storeId: this.cleanString(query.storeId),
      search: this.cleanString(query.search),
    };
  }

  private buildWhere(
    tenantId: string,
    filters: StaffDirectoryReport['filters'],
  ): Prisma.StaffMemberWhereInput {
    return {
      tenantId,
      ...(filters.status === 'all' ? {} : { status: filters.status }),
      ...(filters.role === 'all' ? {} : { role: filters.role }),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.search
        ? {
            OR: [
              {
                displayName: { contains: filters.search, mode: 'insensitive' },
              },
              { email: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search, mode: 'insensitive' } },
              { position: { contains: filters.search, mode: 'insensitive' } },
              {
                externalUserId: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                externalDomain: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private async normalizeMemberData(
    tenantId: string,
    dto: StaffMemberDto,
    requireName: boolean,
  ): Promise<
    | Prisma.StaffMemberUncheckedCreateInput
    | Prisma.StaffMemberUncheckedUpdateInput
  > {
    const user = await this.resolveUser(tenantId, dto.userId);
    const displayName =
      this.cleanString(dto.displayName) ??
      user?.fullName ??
      user?.email ??
      null;

    if (requireName && !displayName) {
      throw new BadRequestException('Staff member name is required');
    }

    const externalDomain = this.cleanString(dto.externalDomain);
    const externalUserId = this.cleanString(dto.externalUserId);

    if (
      (externalDomain && !externalUserId) ||
      (!externalDomain && externalUserId)
    ) {
      throw new BadRequestException(
        'Langame domain and user_id should be filled together',
      );
    }

    return {
      ...(displayName ? { displayName } : {}),
      ...(dto.role ? { role: this.resolveRole(dto.role) } : {}),
      ...(dto.status ? { status: this.resolveStatus(dto.status) } : {}),
      position: this.cleanString(dto.position),
      employmentType: this.resolveEmploymentType(dto.employmentType),
      email: this.cleanString(dto.email) ?? user?.email ?? null,
      phone: this.cleanString(dto.phone),
      hiredAt: this.parseDate(dto.hiredAt),
      dismissedAt: this.parseDate(dto.dismissedAt),
      storeId: await this.resolveStoreId(tenantId, dto.storeId),
      userId: user?.id ?? null,
      externalProvider:
        externalDomain && externalUserId ? IntegrationProvider.LANGAME : null,
      externalDomain,
      externalUserId,
      note: this.cleanString(dto.note, 1000),
    };
  }

  private async resolveUser(tenantId: string, userId?: string | null) {
    const cleanUserId = this.cleanString(userId);

    if (!cleanUserId) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: cleanUserId, tenantId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) {
      throw new BadRequestException('Selected user account is not available');
    }

    return user;
  }

  private async resolveStoreId(tenantId: string, storeId?: string | null) {
    const cleanStoreId = this.cleanString(storeId);

    if (!cleanStoreId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id: cleanStoreId, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('Selected store is not available');
    }

    return store.id;
  }

  private resolveRole(role: UserRole) {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Unsupported staff role');
    }

    return role;
  }

  private resolveStatus(status: StaffMemberStatus) {
    if (!memberStatuses.includes(status)) {
      throw new BadRequestException('Unsupported staff status');
    }

    return status;
  }

  private resolveEmploymentType(type?: StaffMemberEmploymentType | null) {
    const cleanType = this.cleanString(type);

    if (!cleanType) {
      return null;
    }

    if (!employmentTypes.includes(cleanType as StaffMemberEmploymentType)) {
      throw new BadRequestException('Unsupported employment type');
    }

    return cleanType as StaffMemberEmploymentType;
  }

  private parseDate(value?: string | null) {
    const cleanValue = this.cleanString(value);

    if (!cleanValue) {
      return null;
    }

    const date = new Date(cleanValue);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    return date;
  }

  private async getLegacyMappings(
    tenantId: string,
  ): Promise<StaffLegacyIdentityMapping[]> {
    const rows = await this.prisma.guestStaffIdentityMapping.findMany({
      where: { tenantId },
      include: {
        guest: {
          select: {
            fullNameMasked: true,
            phoneMasked: true,
            externalGuestId: true,
          },
        },
      },
      orderBy: [{ externalDomain: 'asc' }, { externalUserId: 'asc' }],
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalUserId: row.externalUserId,
      guestName:
        row.guest.fullNameMasked ??
        row.guest.phoneMasked ??
        `guest_id ${row.guest.externalGuestId}`,
      note: row.note,
      mappedStaffMemberId: null,
    }));
  }

  private attachMappedMembers(
    members: StaffMemberResponse[],
    mappings: StaffLegacyIdentityMapping[],
  ) {
    const memberByExternalKey = new Map(
      members
        .filter((member) => member.externalDomain && member.externalUserId)
        .map((member) => [
          `${member.externalProvider ?? ''}:${member.externalDomain}:${member.externalUserId}`,
          member.id,
        ]),
    );

    return mappings.map((mapping) => ({
      ...mapping,
      mappedStaffMemberId:
        memberByExternalKey.get(
          `${mapping.externalProvider ?? ''}:${mapping.externalDomain}:${mapping.externalUserId}`,
        ) ?? null,
    }));
  }

  private buildSummary(rows: StaffMemberResponse[]) {
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        if (row.status === 'ACTIVE') summary.active += 1;
        if (row.status === 'ONBOARDING') summary.onboarding += 1;
        if (row.status === 'SUSPENDED') summary.suspended += 1;
        if (row.status === 'DISMISSED') summary.dismissed += 1;
        if (row.user) summary.linkedAccounts += 1;
        if (row.externalUserId) summary.linkedLangameUsers += 1;

        return summary;
      },
      {
        total: 0,
        active: 0,
        onboarding: 0,
        suspended: 0,
        dismissed: 0,
        linkedAccounts: 0,
        linkedLangameUsers: 0,
      },
    );
  }

  private toMemberResponse(row: StaffMemberRow): StaffMemberResponse {
    return {
      id: row.id,
      displayName: row.displayName,
      role: row.role,
      status: row.status as StaffMemberStatus,
      position: row.position,
      employmentType: row.employmentType as StaffMemberEmploymentType | null,
      email: row.email,
      phone: row.phone,
      hiredAt: row.hiredAt?.toISOString() ?? null,
      dismissedAt: row.dismissedAt?.toISOString() ?? null,
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalUserId: row.externalUserId,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: row.store,
      user: row.user,
      createdByUser: row.createdByUser,
    };
  }

  private canManageDirectory(user: AuthenticatedUser) {
    return manageableRoles.has(user.role) || Boolean(user.isPlatformAdmin);
  }

  private assertCanManageDirectory(user: AuthenticatedUser) {
    if (!this.canManageDirectory(user)) {
      throw new ForbiddenException('Staff directory editing is not allowed');
    }
  }

  private cleanString(value?: string | null, maxLength = 255) {
    const cleanValue = value?.trim();

    if (!cleanValue) {
      return null;
    }

    return cleanValue.slice(0, maxLength);
  }
}
