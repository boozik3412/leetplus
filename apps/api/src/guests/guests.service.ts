import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestCrmStatus, IntegrationProvider, Prisma } from '@prisma/client';
import { createDecipheriv, createHash, createHmac } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type GuestsSummaryQuery = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  guestGroupId?: string;
};

export type GuestListQuery = GuestsSummaryQuery & {
  segment?: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'quiet' | 'top';
  crmStatus?: GuestCrmStatus;
  search?: string;
  page?: string;
  pageSize?: string;
  sort?: 'revenue' | 'sessions' | 'lastActivity' | 'registered';
  direction?: 'asc' | 'desc';
};

export type StaffControlQuery = GuestsSummaryQuery;

export type GuestDashboardRow = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  guestGroupName: string | null;
  displayName: string;
  contact: string;
  insertedAt: string | null;
  lastActivityAt: string | null;
  sessionsCount: number;
  visitsDays: number;
  playHours: number;
  currentCountHours: number | null;
  transactionAmount: number;
  barRevenue: number;
  segment: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'quiet';
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: string | null;
  crmUpdatedAt: string | null;
};

export type GuestFilterOptions = {
  stores: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
  }>;
  groups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
};

export type GuestsSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  totalGuests: number;
  activeGuests: number;
  newGuests: number;
  repeatGuests: number;
  riskGuests: number;
  lostGuests: number;
  sessionsCount: number;
  playHours: number;
  averageSessionMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
  dataQuality: {
    latestProfileRuns: Array<{
      domain: string;
      startedAt: string;
      status: string;
      guestsCount: number;
      sessionsCount: number;
      transactionsCount: number;
      productSalesLinked: number;
      endpointErrors: Record<string, string>;
    }>;
    unavailableEndpoints: string[];
    sessionsWithoutGuestId: number;
    transactionsWithoutGuestId: number;
    salesMissingGuestLink: number;
  };
  visitTrend: Array<{
    date: string;
    sessionsCount: number;
    activeGuests: number;
    barRevenue: number;
  }>;
  topGuests: GuestDashboardRow[];
  riskGuestsRows: GuestDashboardRow[];
};

export type GuestListResponse = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  segment: NonNullable<GuestListQuery['segment']>;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  sort: NonNullable<GuestListQuery['sort']>;
  direction: NonNullable<GuestListQuery['direction']>;
  rows: GuestDashboardRow[];
};

export type GuestDetail = GuestDashboardRow & {
  crmEvents: Array<{
    id: string;
    status: GuestCrmStatus;
    note: string | null;
    nextAction: string | null;
    nextContactAt: string | null;
    createdAt: string;
    createdBy: string | null;
  }>;
  sessions: Array<{
    id: string;
    startedAt: string | null;
    stoppedAt: string | null;
    durationMinutes: number | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  transactions: Array<{
    id: string;
    happenedAt: string | null;
    amount: number | null;
    balance: number | null;
    bonusBalance: number | null;
    type: string | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  sales: Array<{
    id: string;
    saleDate: string;
    productName: string;
    storeName: string;
    revenue: number;
    quantity: number;
  }>;
};

export type StaffControlRow = GuestDashboardRow & {
  controlFlags: string[];
};

export type StaffControlReport = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  staffGroups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
  staffCount: number;
  activeStaff: number;
  sessionsCount: number;
  playHours: number;
  transactionAmount: number;
  barRevenue: number;
  operationLogsCount: number;
  operationAmount: number;
  rows: StaffControlRow[];
  operationTypes: Array<{
    type: string;
    count: number;
    amount: number;
  }>;
};

export type GuestCrmUpdateDto = {
  crmStatus?: GuestCrmStatus;
  crmNote?: string | null;
  nextAction?: string | null;
  nextContactAt?: string | null;
};

type GuestBase = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  externalGuestTypeId: string | null;
  phoneMasked: string | null;
  phoneEncrypted: string | null;
  emailMasked: string | null;
  fullNameMasked: string | null;
  fullNameEncrypted: string | null;
  insertedAt: Date | null;
  lastActivityAt: Date | null;
  isDisabled: boolean;
  currentCountHours: Prisma.Decimal | null;
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: Date | null;
  crmUpdatedAt: Date | null;
};

type GuestMetrics = {
  latestActivityAt: Date | null;
  sessionsCount: number;
  visitsDays: Set<string>;
  playMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
};

type Period = {
  fromDate: Date;
  toDate: Date;
  activityFromDate: Date;
  from: string;
  to: string;
};

type ResolvedGuestFilters = {
  storeId: string | null;
  guestGroupId: string | null;
  externalDomain: string | null;
  externalGuestTypeId: string | null;
  search: string | null;
  excludedAdminGuestGroups: Array<{
    externalDomain: string | null;
    externalGuestTypeId: string;
  }>;
  onlyGuestGroups?: Array<{
    externalDomain: string | null;
    externalGuestTypeId: string;
  }>;
};

type GuestGroupsByKey = Map<string, string>;

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  async getFilterOptions(user: AuthenticatedUser): Promise<GuestFilterOptions> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [stores, groups] = await Promise.all([
      this.prisma.store.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          externalDomain: true,
          externalClubId: true,
        },
      }),
      this.prisma.guestGroup.findMany({
        where: { tenantId },
        orderBy: [{ externalDomain: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          externalDomain: true,
          externalGroupId: true,
        },
      }),
    ]);

    return { stores, groups };
  }

  async getSummary(
    user: AuthenticatedUser,
    query: GuestsSummaryQuery = {},
  ): Promise<GuestsSummary> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const filters = await this.resolveGuestFilters(tenantId, query);
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    const rows = guests.map((guest) =>
      this.toDashboardRow(
        guest,
        metricsByGuestId.get(guest.id),
        period,
        groupsByKey,
      ),
    );
    const activeRows = rows.filter((row) => row.segment === 'active');
    const newRows = rows.filter((row) => row.segment === 'new');
    const repeatRows = rows.filter((row) => row.segment === 'repeat');
    const riskRows = rows.filter((row) => row.segment === 'risk');
    const lostRows = rows.filter((row) => row.segment === 'lost');
    const periodMetrics = this.sumPeriodMetrics(metricsByGuestId);
    const trend = await this.buildVisitTrend(tenantId, period, filters);
    const dataQuality = await this.getDataQuality(tenantId, period, filters);

    return {
      tenantId,
      tenantSlug,
      periodFrom: period.from,
      periodTo: period.to,
      storeId: filters.storeId,
      guestGroupId: filters.guestGroupId,
      totalGuests: guests.length,
      activeGuests: activeRows.length + repeatRows.length + newRows.length,
      newGuests: newRows.length,
      repeatGuests: repeatRows.length,
      riskGuests: riskRows.length,
      lostGuests: lostRows.length,
      sessionsCount: periodMetrics.sessionsCount,
      playHours: this.round(periodMetrics.playMinutes / 60, 1),
      averageSessionMinutes:
        periodMetrics.sessionsCount > 0
          ? this.round(
              periodMetrics.playMinutes / periodMetrics.sessionsCount,
              0,
            )
          : 0,
      transactionsCount: periodMetrics.transactionsCount,
      transactionAmount: this.round(periodMetrics.transactionAmount, 2),
      barRevenue: this.round(periodMetrics.barRevenue, 2),
      barSalesCount: periodMetrics.barSalesCount,
      dataQuality,
      visitTrend: trend,
      topGuests: this.sortRows(rows, 'revenue', 'desc').slice(0, 12),
      riskGuestsRows: this.sortRows(riskRows, 'revenue', 'desc').slice(0, 12),
    };
  }

  async getGuests(
    user: AuthenticatedUser,
    query: GuestListQuery = {},
  ): Promise<GuestListResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const filters = await this.resolveGuestFilters(tenantId, query);
    const segment = this.resolveSegment(query.segment);
    const crmStatus = this.resolveCrmStatusFilter(query.crmStatus);
    const page = this.resolvePositiveInteger(query.page, 1, 1, 10_000);
    const pageSize = this.resolvePositiveInteger(query.pageSize, 50, 10, 200);
    const sort = this.resolveSort(query.sort);
    const direction = this.resolveDirection(query.direction);
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    let rows = guests.map((guest) =>
      this.toDashboardRow(
        guest,
        metricsByGuestId.get(guest.id),
        period,
        groupsByKey,
      ),
    );

    if (segment !== 'top') {
      rows = rows.filter((row) => row.segment === segment);
    }

    if (crmStatus) {
      rows = rows.filter((row) => row.crmStatus === crmStatus);
    }

    const sortedRows = this.sortRows(rows, sort, direction);
    const totalRows = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;

    return {
      periodFrom: period.from,
      periodTo: period.to,
      storeId: filters.storeId,
      guestGroupId: filters.guestGroupId,
      segment,
      page: normalizedPage,
      pageSize,
      totalRows,
      totalPages,
      sort,
      direction,
      rows: sortedRows.slice(offset, offset + pageSize),
    };
  }

  async getGuest(user: AuthenticatedUser, id: string): Promise<GuestDetail> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod({});
    const guest = await this.prisma.guest.findFirst({
      where: { id, tenantId },
      select: this.guestSelect(),
    });

    if (!guest) {
      throw new NotFoundException('Guest not found');
    }

    const filters: ResolvedGuestFilters = {
      storeId: null,
      guestGroupId: null,
      externalDomain: null,
      externalGuestTypeId: null,
      search: null,
      excludedAdminGuestGroups: [],
      onlyGuestGroups: undefined,
    };
    const { metricsByGuestId, groupsByKey } = await this.buildGuestMetrics(
      tenantId,
      period,
      filters,
      [id],
    );
    const row = this.toDashboardRow(
      guest,
      metricsByGuestId.get(id),
      period,
      groupsByKey,
    );
    const [crmEvents, sessions, transactions, sales] = await Promise.all([
      this.prisma.guestCrmEvent.findMany({
        where: { tenantId, guestId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          note: true,
          nextAction: true,
          nextContactAt: true,
          createdAt: true,
          createdByUser: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.guestSession.findMany({
        where: { tenantId, guestId: id },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
          externalDomain: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: { tenantId, guestId: id },
        orderBy: { happenedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          happenedAt: true,
          amount: true,
          balance: true,
          bonusBalance: true,
          type: true,
          externalDomain: true,
          store: { select: { name: true } },
        },
      }),
      this.prisma.salesFact.findMany({
        where: { tenantId, guestId: id, isCanceled: false },
        orderBy: { saleDate: 'desc' },
        take: 30,
        select: {
          id: true,
          saleDate: true,
          productNameAtSale: true,
          storeNameAtSale: true,
          revenue: true,
          quantity: true,
        },
      }),
    ]);

    return {
      ...row,
      crmEvents: crmEvents.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        nextAction: event.nextAction,
        nextContactAt: this.toIsoDateTime(event.nextContactAt),
        createdAt: event.createdAt.toISOString(),
        createdBy:
          event.createdByUser?.fullName ?? event.createdByUser?.email ?? null,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: this.toIsoDateTime(session.startedAt),
        stoppedAt: this.toIsoDateTime(session.stoppedAt),
        durationMinutes: session.durationMinutes,
        storeName: session.store?.name ?? null,
        externalDomain: session.externalDomain,
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        happenedAt: this.toIsoDateTime(transaction.happenedAt),
        amount: this.decimalToNumber(transaction.amount),
        balance: this.decimalToNumber(transaction.balance),
        bonusBalance: this.decimalToNumber(transaction.bonusBalance),
        type: transaction.type,
        storeName: transaction.store?.name ?? null,
        externalDomain: transaction.externalDomain,
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        saleDate: this.toIsoDate(sale.saleDate),
        productName: sale.productNameAtSale ?? 'Товар',
        storeName: sale.storeNameAtSale ?? 'Клуб',
        revenue: this.decimalToNumber(sale.revenue) ?? 0,
        quantity: this.decimalToNumber(sale.quantity) ?? 0,
      })),
    };
  }

  async getStaffControl(
    user: AuthenticatedUser,
    query: StaffControlQuery = {},
  ): Promise<StaffControlReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeId = await this.resolveStoreId(tenantId, query.storeId);
    const staffGroups = await this.loadAdminGuestGroups(tenantId);
    const emptyReport = {
      tenantId,
      tenantSlug,
      periodFrom: period.from,
      periodTo: period.to,
      storeId,
      staffGroups,
      staffCount: 0,
      activeStaff: 0,
      sessionsCount: 0,
      playHours: 0,
      transactionAmount: 0,
      barRevenue: 0,
      operationLogsCount: 0,
      operationAmount: 0,
      rows: [],
      operationTypes: [],
    } satisfies StaffControlReport;

    if (staffGroups.length === 0) {
      return emptyReport;
    }

    const filters: ResolvedGuestFilters = {
      storeId,
      guestGroupId: null,
      externalDomain: null,
      externalGuestTypeId: null,
      search: null,
      excludedAdminGuestGroups: [],
      onlyGuestGroups: staffGroups.map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGroupId,
      })),
    };
    const { guests, metricsByGuestId, groupsByKey } =
      await this.buildGuestMetrics(tenantId, period, filters);
    const rows = guests
      .map((guest) =>
        this.toStaffControlRow(
          this.toDashboardRow(
            guest,
            metricsByGuestId.get(guest.id),
            period,
            groupsByKey,
          ),
        ),
      )
      .sort(
        (first, second) =>
          second.transactionAmount +
          second.barRevenue -
          (first.transactionAmount + first.barRevenue),
      );
    const periodMetrics = this.sumPeriodMetrics(metricsByGuestId);
    const operationTypes = await this.getOperationTypeSummary(
      tenantId,
      period,
      storeId,
    );
    const operationAmount = operationTypes.reduce(
      (sum, row) => sum + row.amount,
      0,
    );

    return {
      ...emptyReport,
      staffCount: guests.length,
      activeStaff: rows.filter(
        (row) =>
          row.sessionsCount > 0 ||
          row.transactionAmount > 0 ||
          row.barRevenue > 0,
      ).length,
      sessionsCount: periodMetrics.sessionsCount,
      playHours: this.round(periodMetrics.playMinutes / 60, 1),
      transactionAmount: this.round(periodMetrics.transactionAmount, 2),
      barRevenue: this.round(periodMetrics.barRevenue, 2),
      operationLogsCount: operationTypes.reduce(
        (sum, row) => sum + row.count,
        0,
      ),
      operationAmount: this.round(operationAmount, 2),
      rows,
      operationTypes,
    };
  }

  async updateGuestCrm(
    user: AuthenticatedUser,
    id: string,
    dto: GuestCrmUpdateDto,
  ): Promise<GuestDetail> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const guest = await this.prisma.guest.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!guest) {
      throw new NotFoundException('Guest not found');
    }

    const data = this.normalizeCrmUpdate(dto);

    await this.prisma.$transaction([
      this.prisma.guest.update({
        where: { id },
        data: {
          ...data,
          crmUpdatedByUserId: user.id,
          crmUpdatedAt: new Date(),
        },
      }),
      this.prisma.guestCrmEvent.create({
        data: {
          tenantId,
          guestId: id,
          createdByUserId: user.id,
          status: data.crmStatus,
          note: data.crmNote,
          nextAction: data.nextAction,
          nextContactAt: data.nextContactAt,
        },
      }),
    ]);

    return this.getGuest(user, id);
  }

  private async buildGuestMetrics(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
    guestIds?: string[],
  ) {
    const guestWhere = this.buildGuestWhere(tenantId, filters, guestIds);
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const [allGuests, groupsByKey] = await Promise.all([
      this.prisma.guest.findMany({
        where: guestWhere,
        select: this.guestSelect(),
      }),
      this.loadGuestGroups(tenantId),
    ]);
    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          startedAt: { gte: period.activityFromDate, lte: period.toDate },
          ...storeWhere,
        },
        select: {
          guestId: true,
          startedAt: true,
          durationMinutes: true,
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          happenedAt: { gte: period.activityFromDate, lte: period.toDate },
          ...storeWhere,
        },
        select: {
          guestId: true,
          happenedAt: true,
          amount: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          saleDate: { gte: period.activityFromDate, lte: period.toDate },
          isCanceled: false,
          ...storeWhere,
        },
        select: {
          guestId: true,
          saleDate: true,
          revenue: true,
        },
      }),
    ]);
    const metricsByGuestId = new Map<string, GuestMetrics>();

    for (const session of sessions) {
      if (!session.guestId || !session.startedAt) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, session.guestId);
      this.applyLatest(metrics, session.startedAt);

      if (session.startedAt >= period.fromDate) {
        metrics.sessionsCount += 1;
        metrics.visitsDays.add(this.toIsoDate(session.startedAt));
        metrics.playMinutes += session.durationMinutes ?? 0;
      }
    }

    for (const transaction of transactions) {
      if (!transaction.guestId || !transaction.happenedAt) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, transaction.guestId);
      this.applyLatest(metrics, transaction.happenedAt);

      if (transaction.happenedAt >= period.fromDate) {
        metrics.transactionsCount += 1;
        metrics.transactionAmount += Math.abs(
          this.decimalToNumber(transaction.amount) ?? 0,
        );
      }
    }

    for (const sale of sales) {
      if (!sale.guestId) {
        continue;
      }
      const metrics = this.ensureMetrics(metricsByGuestId, sale.guestId);
      this.applyLatest(metrics, sale.saleDate);

      if (sale.saleDate >= period.fromDate) {
        metrics.barSalesCount += 1;
        metrics.barRevenue += this.decimalToNumber(sale.revenue) ?? 0;
      }
    }

    const guests = filters.storeId
      ? allGuests.filter((guest) => metricsByGuestId.has(guest.id))
      : allGuests;

    return { guests, metricsByGuestId, groupsByKey };
  }

  private buildGuestWhere(
    tenantId: string,
    filters: ResolvedGuestFilters,
    guestIds?: string[],
  ): Prisma.GuestWhereInput {
    const where: Prisma.GuestWhereInput = {
      tenantId,
      ...(guestIds ? { id: { in: guestIds } } : {}),
    };

    if (filters.externalGuestTypeId) {
      where.externalGuestTypeId = filters.externalGuestTypeId;
      where.externalDomain = filters.externalDomain;
    }

    if (filters.onlyGuestGroups?.length) {
      where.OR = filters.onlyGuestGroups.map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGuestTypeId,
      }));
    }

    if (filters.excludedAdminGuestGroups.length > 0) {
      where.NOT = {
        OR: filters.excludedAdminGuestGroups.map((group) => ({
          externalDomain: group.externalDomain,
          externalGuestTypeId: group.externalGuestTypeId,
        })),
      };
    }

    if (filters.search) {
      const searchHashes = this.searchHashes(filters.search);
      where.OR = [
        { externalGuestId: { contains: filters.search, mode: 'insensitive' } },
        { phoneMasked: { contains: filters.search, mode: 'insensitive' } },
        { emailMasked: { contains: filters.search, mode: 'insensitive' } },
        { fullNameMasked: { contains: filters.search, mode: 'insensitive' } },
        ...(searchHashes.phoneHash
          ? [{ phoneHash: searchHashes.phoneHash }]
          : []),
        ...(searchHashes.fullNameHash
          ? [{ fullNameHash: searchHashes.fullNameHash }]
          : []),
        {
          bonusProgramNumber: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    return where;
  }

  private async buildVisitTrend(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ) {
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const guestWhere = this.buildGuestWhere(tenantId, filters);
    const [sessions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          startedAt: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
        select: { guestId: true, startedAt: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guest: { is: guestWhere },
          saleDate: { gte: period.fromDate, lte: period.toDate },
          isCanceled: false,
          ...storeWhere,
        },
        select: { saleDate: true, revenue: true },
      }),
    ]);
    const trend = new Map<
      string,
      { sessionsCount: number; activeGuestIds: Set<string>; barRevenue: number }
    >();

    for (const day of this.daysBetween(period.fromDate, period.toDate)) {
      trend.set(day, {
        sessionsCount: 0,
        activeGuestIds: new Set<string>(),
        barRevenue: 0,
      });
    }

    for (const session of sessions) {
      if (!session.startedAt || !session.guestId) {
        continue;
      }
      const day = this.toIsoDate(session.startedAt);
      const row = trend.get(day);
      if (!row) {
        continue;
      }
      row.sessionsCount += 1;
      row.activeGuestIds.add(session.guestId);
    }

    for (const sale of sales) {
      const day = this.toIsoDate(sale.saleDate);
      const row = trend.get(day);
      if (!row) {
        continue;
      }
      row.barRevenue += this.decimalToNumber(sale.revenue) ?? 0;
    }

    return Array.from(trend.entries()).map(([date, row]) => ({
      date,
      sessionsCount: row.sessionsCount,
      activeGuests: row.activeGuestIds.size,
      barRevenue: this.round(row.barRevenue, 2),
    }));
  }

  private async getDataQuality(
    tenantId: string,
    period: Period,
    filters: ResolvedGuestFilters,
  ) {
    const storeWhere = filters.storeId ? { storeId: filters.storeId } : {};
    const [
      latestProfileRuns,
      sessionsWithoutGuestId,
      transactionsWithoutGuestId,
      salesMissingGuestLink,
    ] = await Promise.all([
      this.prisma.guestDataProfileRun.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
        },
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: {
          domain: true,
          startedAt: true,
          status: true,
          guestsCount: true,
          sessionsCount: true,
          transactionsCount: true,
          productSalesLinked: true,
          profile: true,
        },
      }),
      this.prisma.guestSession.count({
        where: {
          tenantId,
          guestId: null,
          startedAt: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
      this.prisma.guestTransaction.count({
        where: {
          tenantId,
          guestId: null,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
      this.prisma.salesFact.count({
        where: {
          tenantId,
          externalGuestId: { not: null },
          guestId: null,
          saleDate: { gte: period.fromDate, lte: period.toDate },
          ...storeWhere,
        },
      }),
    ]);
    const formattedRuns = latestProfileRuns.map((run) => {
      const endpointErrors = this.endpointErrorsFromProfile(run.profile);

      return {
        domain: run.domain,
        startedAt: run.startedAt.toISOString(),
        status: run.status,
        guestsCount: run.guestsCount,
        sessionsCount: run.sessionsCount,
        transactionsCount: run.transactionsCount,
        productSalesLinked: run.productSalesLinked,
        endpointErrors,
      };
    });
    const unavailableEndpoints = Array.from(
      new Set(
        formattedRuns.flatMap((run) => Object.keys(run.endpointErrors)).sort(),
      ),
    );

    return {
      latestProfileRuns: formattedRuns,
      unavailableEndpoints,
      sessionsWithoutGuestId,
      transactionsWithoutGuestId,
      salesMissingGuestLink,
    };
  }

  private async resolveGuestFilters(
    tenantId: string,
    query: GuestsSummaryQuery & { search?: string },
  ): Promise<ResolvedGuestFilters> {
    const storeId = this.blankToNull(query.storeId);
    const guestGroupId = this.blankToNull(query.guestGroupId);
    const search = this.normalizeSearch(query.search);
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      select: {
        id: true,
        externalDomain: true,
        externalGroupId: true,
        name: true,
      },
    });
    const adminGuestGroups = groups.filter((group) =>
      this.isAdminGuestGroupName(group.name),
    );
    let excludedAdminGuestGroups = adminGuestGroups
      .filter((group) => this.isAdminGuestGroupName(group.name))
      .map((group) => ({
        externalDomain: group.externalDomain,
        externalGuestTypeId: group.externalGroupId,
      }));
    let externalDomain: string | null = null;
    let externalGuestTypeId: string | null = null;

    if (storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('storeId is not available');
      }
    }

    if (guestGroupId) {
      const group = groups.find((candidate) => candidate.id === guestGroupId);

      if (!group) {
        throw new BadRequestException('guestGroupId is not available');
      }

      externalDomain = group.externalDomain;
      externalGuestTypeId = group.externalGroupId;

      if (this.isAdminGuestGroupName(group.name)) {
        excludedAdminGuestGroups = [];
      }
    }

    return {
      storeId,
      guestGroupId,
      externalDomain,
      externalGuestTypeId,
      search,
      excludedAdminGuestGroups,
      onlyGuestGroups: undefined,
    };
  }

  private async resolveStoreId(tenantId: string, value: string | undefined) {
    const storeId = this.blankToNull(value);

    if (!storeId) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });

    if (!store) {
      throw new BadRequestException('storeId is not available');
    }

    return storeId;
  }

  private async loadAdminGuestGroups(tenantId: string) {
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      orderBy: [{ externalDomain: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        externalDomain: true,
        externalGroupId: true,
      },
    });

    return groups.filter((group) => this.isAdminGuestGroupName(group.name));
  }

  private async getOperationTypeSummary(
    tenantId: string,
    period: Period,
    storeId: string | null,
  ) {
    const rows = await this.prisma.guestOperationLog.findMany({
      where: {
        tenantId,
        happenedAt: { gte: period.fromDate, lte: period.toDate },
        ...(storeId ? { storeId } : {}),
      },
      select: {
        type: true,
        amount: true,
      },
    });
    const byType = new Map<string, { count: number; amount: number }>();

    for (const row of rows) {
      const type = row.type?.trim() || 'unknown';
      const current = byType.get(type) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(this.decimalToNumber(row.amount) ?? 0);
      byType.set(type, current);
    }

    return Array.from(byType.entries())
      .map(([type, row]) => ({
        type,
        count: row.count,
        amount: this.round(row.amount, 2),
      }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 12);
  }

  private toStaffControlRow(row: GuestDashboardRow): StaffControlRow {
    const controlFlags: string[] = [];
    const totalMoney = row.transactionAmount + row.barRevenue;

    if (row.sessionsCount === 0 && totalMoney === 0) {
      controlFlags.push('Нет активности за период');
    }

    if (row.transactionAmount > 0 && row.sessionsCount === 0) {
      controlFlags.push('Деньги без сессий');
    }

    if (row.playHours >= 20) {
      controlFlags.push('Много часов');
    }

    return { ...row, controlFlags };
  }

  private isAdminGuestGroupName(name: string) {
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();

    return (
      normalized.includes('администратор') ||
      normalized.includes('админ') ||
      normalized.includes('admin')
    );
  }

  private async loadGuestGroups(tenantId: string): Promise<GuestGroupsByKey> {
    const groups = await this.prisma.guestGroup.findMany({
      where: { tenantId },
      select: {
        externalDomain: true,
        externalGroupId: true,
        name: true,
      },
    });

    return new Map(
      groups.map((group) => [
        this.guestGroupKey(group.externalDomain, group.externalGroupId),
        group.name,
      ]),
    );
  }

  private toDashboardRow(
    guest: GuestBase,
    metrics: GuestMetrics | undefined,
    period: Period,
    groupsByKey: GuestGroupsByKey,
  ): GuestDashboardRow {
    const latestActivityAt = this.maxDate(
      guest.lastActivityAt,
      metrics?.latestActivityAt ?? null,
    );
    const segment = this.segmentGuest(guest, metrics, latestActivityAt, period);
    const guestGroupName = guest.externalGuestTypeId
      ? (groupsByKey.get(
          this.guestGroupKey(guest.externalDomain, guest.externalGuestTypeId),
        ) ?? null)
      : null;

    return {
      id: guest.id,
      externalDomain: guest.externalDomain,
      externalGuestId: guest.externalGuestId,
      guestGroupName,
      displayName:
        this.decryptSensitiveValue(guest.fullNameEncrypted) ??
        guest.fullNameMasked ??
        guest.emailMasked ??
        this.decryptSensitiveValue(guest.phoneEncrypted) ??
        guest.phoneMasked ??
        `Гость #${guest.externalGuestId}`,
      contact:
        this.decryptSensitiveValue(guest.phoneEncrypted) ??
        guest.phoneMasked ??
        guest.emailMasked ??
        'нет контакта',
      insertedAt: this.toIsoDateTime(guest.insertedAt),
      lastActivityAt: this.toIsoDateTime(latestActivityAt),
      sessionsCount: metrics?.sessionsCount ?? 0,
      visitsDays: metrics?.visitsDays.size ?? 0,
      playHours: this.round((metrics?.playMinutes ?? 0) / 60, 1),
      currentCountHours: this.decimalToNumber(guest.currentCountHours),
      transactionAmount: this.round(metrics?.transactionAmount ?? 0, 2),
      barRevenue: this.round(metrics?.barRevenue ?? 0, 2),
      segment,
      crmStatus: guest.crmStatus,
      crmNote: guest.crmNote,
      nextAction: guest.nextAction,
      nextContactAt: this.toIsoDateTime(guest.nextContactAt),
      crmUpdatedAt: this.toIsoDateTime(guest.crmUpdatedAt),
    };
  }

  private segmentGuest(
    guest: GuestBase,
    metrics: GuestMetrics | undefined,
    latestActivityAt: Date | null,
    period: Period,
  ): GuestDashboardRow['segment'] {
    if (guest.insertedAt && guest.insertedAt >= period.fromDate) {
      return 'new';
    }

    if (!latestActivityAt || guest.isDisabled) {
      return 'lost';
    }

    const daysSinceActivity = this.daysBetweenDates(
      latestActivityAt,
      period.toDate,
    );

    if (daysSinceActivity >= 30) {
      return 'lost';
    }

    if (daysSinceActivity >= 14) {
      return 'risk';
    }

    if (
      (metrics?.sessionsCount ?? 0) >= 2 ||
      (metrics?.visitsDays.size ?? 0) >= 2
    ) {
      return 'repeat';
    }

    if (
      (metrics?.sessionsCount ?? 0) > 0 ||
      (metrics?.transactionsCount ?? 0) > 0 ||
      (metrics?.barSalesCount ?? 0) > 0
    ) {
      return 'active';
    }

    return 'quiet';
  }

  private normalizeCrmUpdate(dto: GuestCrmUpdateDto) {
    return {
      crmStatus: this.resolveCrmStatus(dto.crmStatus),
      crmNote: this.normalizeText(dto.crmNote, 2000),
      nextAction: this.normalizeText(dto.nextAction, 160),
      nextContactAt: this.resolveOptionalDate(dto.nextContactAt),
    };
  }

  private resolveCrmStatus(value: GuestCrmUpdateDto['crmStatus']) {
    if (!value) {
      return GuestCrmStatus.NONE;
    }

    if (!Object.values(GuestCrmStatus).includes(value)) {
      throw new BadRequestException('crmStatus is not supported');
    }

    return value;
  }

  private normalizeText(value: string | null | undefined, maxLength: number) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, maxLength);
  }

  private resolveOptionalDate(value: string | null | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return this.parseDateInput(trimmed, 'nextContactAt');
  }

  private resolvePeriod(query: GuestsSummaryQuery): Period {
    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const toDate = query.dateTo
      ? this.parseDateInput(query.dateTo, 'dateTo')
      : defaultTo;
    const fromDate = query.dateFrom
      ? this.parseDateInput(query.dateFrom, 'dateFrom')
      : new Date(toDate);

    if (!query.dateFrom) {
      fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    }

    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw new BadRequestException('dateFrom must be before dateTo');
    }

    const activityFromDate = new Date(fromDate);
    activityFromDate.setUTCDate(activityFromDate.getUTCDate() - 60);

    return {
      fromDate,
      toDate,
      activityFromDate,
      from: this.toIsoDate(fromDate),
      to: this.toIsoDate(toDate),
    };
  }

  private parseDateInput(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private resolveSegment(value: GuestListQuery['segment']) {
    const allowed = ['active', 'new', 'repeat', 'risk', 'lost', 'quiet', 'top'];
    return allowed.includes(value ?? '') ? (value ?? 'top') : 'top';
  }

  private resolveCrmStatusFilter(value: GuestListQuery['crmStatus']) {
    if (!value) {
      return null;
    }

    return Object.values(GuestCrmStatus).includes(value) ? value : null;
  }

  private resolveSort(value: GuestListQuery['sort']) {
    const allowed = ['revenue', 'sessions', 'lastActivity', 'registered'];
    return allowed.includes(value ?? '') ? (value ?? 'revenue') : 'revenue';
  }

  private resolveDirection(value: GuestListQuery['direction']) {
    return value === 'asc' ? 'asc' : 'desc';
  }

  private resolvePositiveInteger(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? fallback);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), min), max);
  }

  private guestSelect() {
    return {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      externalGuestTypeId: true,
      phoneMasked: true,
      phoneEncrypted: true,
      emailMasked: true,
      fullNameMasked: true,
      fullNameEncrypted: true,
      insertedAt: true,
      lastActivityAt: true,
      isDisabled: true,
      currentCountHours: true,
      crmStatus: true,
      crmNote: true,
      nextAction: true,
      nextContactAt: true,
      crmUpdatedAt: true,
    } satisfies Prisma.GuestSelect;
  }

  private ensureMetrics(map: Map<string, GuestMetrics>, guestId: string) {
    const existing = map.get(guestId);

    if (existing) {
      return existing;
    }

    const created: GuestMetrics = {
      latestActivityAt: null,
      sessionsCount: 0,
      visitsDays: new Set<string>(),
      playMinutes: 0,
      transactionsCount: 0,
      transactionAmount: 0,
      barRevenue: 0,
      barSalesCount: 0,
    };
    map.set(guestId, created);

    return created;
  }

  private sumPeriodMetrics(metricsByGuestId: Map<string, GuestMetrics>) {
    const totals = {
      sessionsCount: 0,
      playMinutes: 0,
      transactionsCount: 0,
      transactionAmount: 0,
      barRevenue: 0,
      barSalesCount: 0,
    };

    for (const metrics of metricsByGuestId.values()) {
      totals.sessionsCount += metrics.sessionsCount;
      totals.playMinutes += metrics.playMinutes;
      totals.transactionsCount += metrics.transactionsCount;
      totals.transactionAmount += metrics.transactionAmount;
      totals.barRevenue += metrics.barRevenue;
      totals.barSalesCount += metrics.barSalesCount;
    }

    return totals;
  }

  private sortRows(
    rows: GuestDashboardRow[],
    sort: NonNullable<GuestListQuery['sort']>,
    direction: NonNullable<GuestListQuery['direction']>,
  ) {
    const multiplier = direction === 'asc' ? 1 : -1;

    return [...rows].sort((first, second) => {
      const compare =
        sort === 'sessions'
          ? first.sessionsCount - second.sessionsCount
          : sort === 'lastActivity'
            ? (first.lastActivityAt ?? '').localeCompare(
                second.lastActivityAt ?? '',
              )
            : sort === 'registered'
              ? (first.insertedAt ?? '').localeCompare(second.insertedAt ?? '')
              : first.transactionAmount +
                first.barRevenue -
                (second.transactionAmount + second.barRevenue);

      if (compare !== 0) {
        return compare * multiplier;
      }

      const tieBreaker =
        first.transactionAmount +
        first.barRevenue -
        (second.transactionAmount + second.barRevenue);
      if (tieBreaker !== 0) {
        return tieBreaker * -1;
      }

      return first.displayName.localeCompare(second.displayName);
    });
  }

  private applyLatest(metrics: GuestMetrics, value: Date | null) {
    if (!value) {
      return;
    }

    metrics.latestActivityAt = this.maxDate(metrics.latestActivityAt, value);
  }

  private maxDate(first: Date | null, second: Date | null) {
    if (!first) {
      return second;
    }
    if (!second) {
      return first;
    }

    return first > second ? first : second;
  }

  private daysBetweenDates(from: Date, to: Date) {
    return Math.floor(
      (this.startOfUtcDay(to).getTime() - this.startOfUtcDay(from).getTime()) /
        86_400_000,
    );
  }

  private daysBetween(from: Date, to: Date) {
    const days: string[] = [];
    const cursor = this.startOfUtcDay(from);
    const end = this.startOfUtcDay(to);

    while (cursor <= end) {
      days.push(this.toIsoDate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private startOfUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private endpointErrorsFromProfile(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const endpointErrors = value.endpointErrors;
    if (
      !endpointErrors ||
      typeof endpointErrors !== 'object' ||
      Array.isArray(endpointErrors)
    ) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(endpointErrors).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return value ? value.toNumber() : null;
  }

  private toIsoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private toIsoDateTime(value: Date | null) {
    return value ? value.toISOString() : null;
  }

  private round(value: number, digits: number) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  private blankToNull(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeSearch(value: string | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, 80);
  }

  private searchHashes(value: string) {
    const phone = value.replace(/\D/g, '');
    const fullName = value.toLowerCase().replace(/\s+/g, ' ').trim();

    return {
      phoneHash: phone
        ? createHmac('sha256', this.piiSecret()).update(phone).digest('hex')
        : null,
      fullNameHash: fullName.includes(' ')
        ? createHmac('sha256', this.piiSecret()).update(fullName).digest('hex')
        : null,
    };
  }

  private guestGroupKey(domain: string | null, externalGroupId: string) {
    return `${domain ?? 'unknown'}:${externalGroupId}`;
  }

  private decryptSensitiveValue(value: string | null) {
    if (!value) {
      return null;
    }

    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      return null;
    }

    try {
      const [, iv, tag, encrypted] = parts;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.piiEncryptionKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  private piiEncryptionKey() {
    return createHash('sha256').update(this.piiSecret()).digest();
  }

  private piiSecret() {
    const secret =
      this.configService.get<string>('APP_ENCRYPTION_KEY')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new BadRequestException('APP_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }
}
