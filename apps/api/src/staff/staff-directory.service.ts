import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { parseLangameDate as parseLangameDateValue } from '../integrations/langame-date';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type { LangameWorkingShift } from '../integrations/langame.types';
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

const accountBackedStaffRoles = [
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
  UserRole.TRAINEE,
] as const;

export type StaffMemberStatus = (typeof memberStatuses)[number];
export type StaffMemberEmploymentType = (typeof employmentTypes)[number];

export type StaffDirectoryQuery = {
  status?: StaffMemberStatus | 'all';
  role?: UserRole | 'all';
  storeId?: string;
  search?: string;
};

export type StaffActiveShiftQuery = {
  storeId?: string;
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
  langameUsers: StaffLangameUserOption[];
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
  langameUser: StaffLangameUserOption | null;
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

export type StaffLangameUserOption = {
  id: string;
  externalDomain: string;
  externalUserId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  adminStatus: string | null;
  verified: boolean | null;
  phone: string | null;
  externalGuestId: string | null;
  workPointLabel: string | null;
  mappedStaffMemberId: string | null;
  updatedAt: string;
};

export type StaffActiveShiftCandidate = {
  id: string;
  externalDomain: string;
  externalUserId: string;
  externalShiftId: string;
  externalClubId: string | null;
  operatorName: string;
  operatorEmail: string | null;
  storeId: string;
  storeName: string;
  startedAt: string | null;
  stoppedAt: string | null;
  source: 'LIVE' | 'SNAPSHOT';
};

export type StaffActiveShiftCandidatesReport = {
  checkedAt: string;
  store: {
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
    city: string | null;
    timeZone: string | null;
  };
  candidates: StaffActiveShiftCandidate[];
  errors: string[];
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
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
  ) {}

  async getDirectory(
    user: AuthenticatedUser,
    query: StaffDirectoryQuery = {},
  ): Promise<StaffDirectoryReport> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureAccountBackedStaffMembers(tenantId);
    const filters = this.resolveFilters(query);
    const where = this.buildWhere(tenantId, filters);
    const canManageDirectory = this.canManageDirectory(user);

    const [rows, stores, users, legacyMappings, langameUsers] =
      await Promise.all([
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
          orderBy: [
            { isActive: 'desc' },
            { fullName: 'asc' },
            { email: 'asc' },
          ],
        }),
        this.getLegacyMappings(tenantId),
        this.getLangameUsers(tenantId),
      ]);
    const langameUsersByKey = this.langameUsersByKey(langameUsers);
    const responseRows = rows.map((row) =>
      this.toMemberResponse(row, this.findLangameUser(row, langameUsersByKey)),
    );

    return {
      filters,
      canManageDirectory,
      summary: this.buildSummary(responseRows),
      rows: responseRows,
      stores,
      users,
      legacyMappings: this.attachMappedMembers(responseRows, legacyMappings),
      langameUsers: this.attachMappedLangameUsers(responseRows, langameUsers),
    };
  }

  async getCurrentMember(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    await this.ensureAccountBackedStaffMembers(tenantId, user.id);
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

    const langameUser = row
      ? await this.getLangameUserForMember(tenantId, row)
      : null;

    return {
      staffMember: row ? this.toMemberResponse(row, langameUser) : null,
    };
  }

  async getActiveShiftCandidates(
    user: AuthenticatedUser,
    query: StaffActiveShiftQuery = {},
  ): Promise<StaffActiveShiftCandidatesReport> {
    this.assertCanManageDirectory(user);
    const { tenantId } = await this.tenantContextService.resolve(user);
    const storeId = this.cleanString(query.storeId);

    if (!storeId) {
      throw new BadRequestException('Store is required');
    }

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: {
        id: true,
        name: true,
        externalDomain: true,
        externalClubId: true,
        city: true,
        timeZone: true,
        integrationSourceId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const checkedAt = new Date();
    const errors: string[] = [];
    const candidatesByKey = new Map<string, StaffActiveShiftCandidate>();

    try {
      const { apiKey, sources } =
        await this.langameSettingsService.resolveTenantAccess(tenantId);
      const matchedSources = this.langameSourcesForStore(store, sources);

      if (matchedSources.length === 0) {
        errors.push(
          'Для выбранного клуба не найден активный Langame-источник.',
        );
      }

      const dateTo = this.toDateInputValue(
        new Date(checkedAt.getTime() + 12 * 60 * 60 * 1000),
      );
      const dateFrom = this.toDateInputValue(
        new Date(checkedAt.getTime() - 36 * 60 * 60 * 1000),
      );

      for (const source of matchedSources) {
        try {
          const rows = await this.listRecentWorkingShifts(
            source.baseUrl,
            apiKey,
            dateFrom,
            dateTo,
          );

          for (const row of rows) {
            const candidate = this.activeShiftCandidateFromLangameRow(
              row,
              source.domain,
              store,
            );

            if (!candidate) {
              continue;
            }

            candidatesByKey.set(candidate.id, candidate);
          }
        } catch (error) {
          errors.push(
            `${source.domain}: ${
              error instanceof Error
                ? error.message
                : 'не удалось получить открытые смены'
            }`,
          );
        }
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : 'Langame API временно недоступен',
      );
    }

    const cachedCandidates = await this.getCachedActiveShiftCandidates(
      tenantId,
      store,
      checkedAt,
    );

    for (const candidate of cachedCandidates) {
      if (!candidatesByKey.has(candidate.id)) {
        candidatesByKey.set(candidate.id, candidate);
      }
    }

    const candidates = await this.enrichActiveShiftCandidates(tenantId, [
      ...candidatesByKey.values(),
    ]);

    return {
      checkedAt: checkedAt.toISOString(),
      store: {
        id: store.id,
        name: store.name,
        externalDomain: store.externalDomain,
        externalClubId: store.externalClubId,
        city: store.city,
        timeZone: store.timeZone,
      },
      candidates: candidates.sort(
        (first, second) =>
          this.dateMs(second.startedAt) - this.dateMs(first.startedAt),
      ),
      errors,
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

    const langameUser = await this.getLangameUserForMember(tenantId, created);

    return this.toMemberResponse(created, langameUser);
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

    const langameUser = await this.getLangameUserForMember(tenantId, updated);

    return this.toMemberResponse(updated, langameUser);
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

  private async ensureAccountBackedStaffMembers(
    tenantId: string,
    userId?: string,
  ) {
    const accounts = await this.prisma.user.findMany({
      where: {
        tenantId,
        ...(userId ? { id: userId } : {}),
        role: { in: [...accountBackedStaffRoles] },
        staffMember: { is: null },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        storeAccesses: {
          select: { storeId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      take: userId ? 1 : 300,
    });

    if (accounts.length === 0) {
      return;
    }

    await this.prisma.staffMember.createMany({
      data: accounts.map((account) => {
        const storeIds = account.storeAccesses.map((access) => access.storeId);

        return {
          tenantId,
          userId: account.id,
          storeId: storeIds.length === 1 ? storeIds[0] : null,
          displayName: account.fullName ?? account.email,
          email: account.email,
          role: account.role,
          status: account.isActive ? 'ACTIVE' : 'SUSPENDED',
          employmentType: account.role === UserRole.TRAINEE ? 'TRAINEE' : null,
        };
      }),
      skipDuplicates: true,
    });
  }

  private langameSourcesForStore(
    store: {
      externalDomain: string | null;
      externalClubId: string | null;
      integrationSourceId: string | null;
    },
    sources: Array<{ id: string; domain: string; baseUrl: string }>,
  ) {
    const exactSources = sources.filter((source) => {
      if (
        store.integrationSourceId &&
        source.id === store.integrationSourceId
      ) {
        return true;
      }

      return Boolean(
        store.externalDomain && source.domain === store.externalDomain,
      );
    });

    if (exactSources.length > 0) {
      return exactSources;
    }

    return store.externalDomain
      ? sources.filter((source) => source.domain === store.externalDomain)
      : sources.length === 1
        ? sources
        : [];
  }

  private async listRecentWorkingShifts(
    baseUrl: string,
    apiKey: string,
    dateFrom: string,
    dateTo: string,
  ) {
    const rows: LangameWorkingShift[] = [];
    const pageLimit = 100;

    for (let page = 1; page <= 5; page += 1) {
      const pageRows = await this.langameClient.listWorkingShifts(
        baseUrl,
        apiKey,
        {
          page,
          pageLimit,
          dateFrom,
          dateTo,
        },
      );

      rows.push(...pageRows);

      if (pageRows.length < pageLimit) {
        break;
      }
    }

    return rows;
  }

  private activeShiftCandidateFromLangameRow(
    row: LangameWorkingShift,
    domain: string,
    store: {
      id: string;
      name: string;
      externalClubId: string | null;
      timeZone: string | null;
    },
  ): StaffActiveShiftCandidate | null {
    const externalShiftId = this.toNullableString(row.id);
    const externalUserId = this.toNullableString(row.user_id);
    const externalClubId = this.toNullableString(row.list_clubs_id);

    if (!externalShiftId || !externalUserId) {
      return null;
    }

    if (
      store.externalClubId &&
      externalClubId &&
      externalClubId !== store.externalClubId
    ) {
      return null;
    }

    if (!this.isOpenLangameShift(row.date_stop, store.timeZone)) {
      return null;
    }

    const startedAt = this.parseLangameDate(
      this.toNullableString(row.date_start),
      store.timeZone,
    );
    const stoppedAt = this.parseLangameDate(
      this.toNullableString(row.date_stop),
      store.timeZone,
    );

    return {
      id: this.activeShiftKey(domain, externalShiftId),
      externalDomain: domain,
      externalUserId,
      externalShiftId,
      externalClubId,
      operatorName: `user_id ${externalUserId}`,
      operatorEmail: null,
      storeId: store.id,
      storeName: store.name,
      startedAt: startedAt?.toISOString() ?? null,
      stoppedAt: stoppedAt?.toISOString() ?? null,
      source: 'LIVE',
    };
  }

  private async getCachedActiveShiftCandidates(
    tenantId: string,
    store: {
      id: string;
      name: string;
      externalClubId: string | null;
    },
    checkedAt: Date,
  ) {
    const startedAfter = new Date(checkedAt.getTime() - 72 * 60 * 60 * 1000);
    const rows = await this.prisma.guestWorkingShift.findMany({
      where: {
        tenantId,
        storeId: store.id,
        stoppedAt: null,
        startedAt: { gte: startedAfter },
        externalDomain: { not: null },
        externalUserId: { not: null },
      },
      select: {
        externalDomain: true,
        externalUserId: true,
        externalShiftId: true,
        externalClubId: true,
        startedAt: true,
        stoppedAt: true,
      },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 20,
    });

    return rows.flatMap((row) => {
      if (!row.externalDomain || !row.externalUserId) {
        return [];
      }

      return [
        {
          id: this.activeShiftKey(row.externalDomain, row.externalShiftId),
          externalDomain: row.externalDomain,
          externalUserId: row.externalUserId,
          externalShiftId: row.externalShiftId,
          externalClubId: row.externalClubId,
          operatorName: `user_id ${row.externalUserId}`,
          operatorEmail: null,
          storeId: store.id,
          storeName: store.name,
          startedAt: row.startedAt?.toISOString() ?? null,
          stoppedAt: row.stoppedAt?.toISOString() ?? null,
          source: 'SNAPSHOT' as const,
        },
      ];
    });
  }

  private async enrichActiveShiftCandidates(
    tenantId: string,
    candidates: StaffActiveShiftCandidate[],
  ) {
    if (candidates.length === 0) {
      return candidates;
    }

    const users = await this.prisma.langameStaffUser.findMany({
      where: {
        tenantId,
        OR: candidates.map((candidate) => ({
          externalDomain: candidate.externalDomain,
          externalUserId: candidate.externalUserId,
        })),
      },
      select: {
        externalDomain: true,
        externalUserId: true,
        username: true,
        email: true,
      },
    });
    const usersByKey = new Map(
      users.map((user) => [
        `${user.externalDomain}:${user.externalUserId}`,
        user,
      ]),
    );

    return candidates.map((candidate) => {
      const user = usersByKey.get(
        `${candidate.externalDomain}:${candidate.externalUserId}`,
      );

      return user
        ? {
            ...candidate,
            operatorName: user.username ?? user.email ?? candidate.operatorName,
            operatorEmail: user.email,
          }
        : candidate;
    });
  }

  private activeShiftKey(domain: string, externalShiftId: string) {
    return `${domain}:${externalShiftId}`;
  }

  private isOpenLangameShift(value: unknown, timeZone?: string | null) {
    const rawValue = this.toNullableString(value);

    if (!rawValue) {
      return true;
    }

    const normalized = rawValue.toLowerCase();
    if (
      normalized === '0' ||
      normalized === 'null' ||
      normalized === 'false' ||
      normalized.startsWith('0000-00-00')
    ) {
      return true;
    }

    return this.parseLangameDate(rawValue, timeZone) === null;
  }

  private parseLangameDate(
    value: string | null | undefined,
    timeZone?: string | null,
  ) {
    return parseLangameDateValue(value, timeZone);
  }

  private toDateInputValue(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toNullableString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'bigint'
    ) {
      return null;
    }

    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
  }

  private dateMs(value: string | null) {
    return value ? new Date(value).getTime() : 0;
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

  private async getLangameUsers(
    tenantId: string,
  ): Promise<StaffLangameUserOption[]> {
    const rows = await this.prisma.langameStaffUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        externalDomain: true,
        externalUserId: true,
        email: true,
        username: true,
        adminStatus: true,
        verified: true,
        phone: true,
        externalGuestId: true,
        workPoint: true,
        updatedAt: true,
      },
      orderBy: [
        { externalDomain: 'asc' },
        { username: 'asc' },
        { externalUserId: 'asc' },
      ],
      take: 1000,
    });

    return rows.map((row) => this.toLangameUserOption(row));
  }

  private async getLangameUserForMember(
    tenantId: string,
    member: StaffMemberRow,
  ): Promise<StaffLangameUserOption | null> {
    if (!member.externalDomain || !member.externalUserId) {
      return null;
    }

    const row = await this.prisma.langameStaffUser.findFirst({
      where: {
        tenantId,
        externalProvider:
          member.externalProvider ?? IntegrationProvider.LANGAME,
        externalDomain: member.externalDomain,
        externalUserId: member.externalUserId,
      },
      select: {
        id: true,
        externalDomain: true,
        externalUserId: true,
        email: true,
        username: true,
        adminStatus: true,
        verified: true,
        phone: true,
        externalGuestId: true,
        workPoint: true,
        updatedAt: true,
      },
    });

    return row ? this.toLangameUserOption(row, member.id) : null;
  }

  private langameUsersByKey(users: StaffLangameUserOption[]) {
    return new Map(
      users.map((user) => [
        this.langameIdentityKey(user.externalDomain, user.externalUserId),
        user,
      ]),
    );
  }

  private findLangameUser(
    member: StaffMemberRow,
    usersByKey: Map<string, StaffLangameUserOption>,
  ) {
    if (!member.externalDomain || !member.externalUserId) {
      return null;
    }

    const user =
      usersByKey.get(
        this.langameIdentityKey(member.externalDomain, member.externalUserId),
      ) ?? null;

    return user ? { ...user, mappedStaffMemberId: member.id } : null;
  }

  private attachMappedLangameUsers(
    members: StaffMemberResponse[],
    users: StaffLangameUserOption[],
  ) {
    const memberByExternalKey = new Map(
      members
        .filter((member) => member.externalDomain && member.externalUserId)
        .map((member) => [
          this.langameIdentityKey(
            member.externalDomain as string,
            member.externalUserId as string,
          ),
          member.id,
        ]),
    );

    return users.map((user) => ({
      ...user,
      mappedStaffMemberId:
        memberByExternalKey.get(
          this.langameIdentityKey(user.externalDomain, user.externalUserId),
        ) ?? null,
    }));
  }

  private toLangameUserOption(
    row: {
      id: string;
      externalDomain: string;
      externalUserId: string;
      email: string | null;
      username: string | null;
      adminStatus: string | null;
      verified: boolean | null;
      phone: string | null;
      externalGuestId: string | null;
      workPoint: Prisma.JsonValue | null;
      updatedAt: Date;
    },
    mappedStaffMemberId: string | null = null,
  ): StaffLangameUserOption {
    return {
      id: row.id,
      externalDomain: row.externalDomain,
      externalUserId: row.externalUserId,
      displayName: row.username ?? row.email ?? `user_id ${row.externalUserId}`,
      email: row.email,
      username: row.username,
      adminStatus: row.adminStatus,
      verified: row.verified,
      phone: row.phone,
      externalGuestId: row.externalGuestId,
      workPointLabel: this.langameJsonLabel(row.workPoint),
      mappedStaffMemberId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private langameIdentityKey(externalDomain: string, externalUserId: string) {
    return `${IntegrationProvider.LANGAME}:${externalDomain}:${externalUserId}`;
  }

  private langameJsonLabel(value: Prisma.JsonValue | null): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      return value.trim() || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} item(s)` : null;
    }

    const objectValue = value as Record<string, Prisma.JsonValue>;
    const directLabel = [
      objectValue.name,
      objectValue.title,
      objectValue.club_name,
      objectValue.clubName,
      objectValue.id,
    ]
      .map((candidate) =>
        typeof candidate === 'string' || typeof candidate === 'number'
          ? String(candidate)
          : null,
      )
      .find((candidate) => candidate && candidate.trim());

    if (directLabel) {
      return directLabel;
    }

    return JSON.stringify(objectValue).slice(0, 120);
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

  private toMemberResponse(
    row: StaffMemberRow,
    langameUser: StaffLangameUserOption | null = null,
  ): StaffMemberResponse {
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
      langameUser,
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
