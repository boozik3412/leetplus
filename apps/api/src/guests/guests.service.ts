import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type GuestsSummaryQuery = {
  dateFrom?: string;
  dateTo?: string;
};

export type GuestListQuery = GuestsSummaryQuery & {
  segment?: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'top';
  limit?: string;
};

export type GuestDashboardRow = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  displayName: string;
  contact: string;
  insertedAt: string | null;
  lastActivityAt: string | null;
  sessionsCount: number;
  visitsDays: number;
  playHours: number;
  transactionAmount: number;
  barRevenue: number;
  segment: 'active' | 'new' | 'repeat' | 'risk' | 'lost' | 'quiet';
};

export type GuestsSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
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
  segment: NonNullable<GuestListQuery['segment']>;
  rows: GuestDashboardRow[];
};

export type GuestDetail = GuestDashboardRow & {
  sessions: Array<{
    id: string;
    startedAt: string | null;
    stoppedAt: string | null;
    durationMinutes: number | null;
    externalDomain: string | null;
  }>;
  transactions: Array<{
    id: string;
    happenedAt: string | null;
    amount: number | null;
    balance: number | null;
    bonusBalance: number | null;
    type: string | null;
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

type GuestBase = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  phoneMasked: string | null;
  emailMasked: string | null;
  fullNameMasked: string | null;
  insertedAt: Date | null;
  lastActivityAt: Date | null;
  isDisabled: boolean;
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

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getSummary(
    user: AuthenticatedUser,
    query: GuestsSummaryQuery = {},
  ): Promise<GuestsSummary> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const { guests, metricsByGuestId } = await this.buildGuestMetrics(
      tenantId,
      period,
    );
    const rows = guests.map((guest) =>
      this.toDashboardRow(guest, metricsByGuestId.get(guest.id), period),
    );
    const activeRows = rows.filter((row) => row.segment === 'active');
    const newRows = rows.filter((row) => row.segment === 'new');
    const repeatRows = rows.filter((row) => row.segment === 'repeat');
    const riskRows = rows.filter((row) => row.segment === 'risk');
    const lostRows = rows.filter((row) => row.segment === 'lost');
    const periodMetrics = this.sumPeriodMetrics(metricsByGuestId);
    const trend = await this.buildVisitTrend(tenantId, period);
    const dataQuality = await this.getDataQuality(tenantId, period);

    return {
      tenantId,
      tenantSlug,
      periodFrom: period.from,
      periodTo: period.to,
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
      topGuests: this.sortTopRows(rows).slice(0, 12),
      riskGuestsRows: riskRows
        .sort(
          (a, b) =>
            b.barRevenue +
            b.transactionAmount -
            (a.barRevenue + a.transactionAmount),
        )
        .slice(0, 12),
    };
  }

  async getGuests(
    user: AuthenticatedUser,
    query: GuestListQuery = {},
  ): Promise<GuestListResponse> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const segment = query.segment ?? 'top';
    const limit = this.resolveLimit(query.limit);
    const { guests, metricsByGuestId } = await this.buildGuestMetrics(
      tenantId,
      period,
    );
    let rows = guests.map((guest) =>
      this.toDashboardRow(guest, metricsByGuestId.get(guest.id), period),
    );

    if (segment !== 'top') {
      rows = rows.filter((row) => row.segment === segment);
    }

    return {
      periodFrom: period.from,
      periodTo: period.to,
      segment,
      rows: this.sortTopRows(rows).slice(0, limit),
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

    const { metricsByGuestId } = await this.buildGuestMetrics(
      tenantId,
      period,
      [id],
    );
    const row = this.toDashboardRow(guest, metricsByGuestId.get(id), period);
    const [sessions, transactions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: { tenantId, guestId: id },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
          externalDomain: true,
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: { tenantId, guestId: id },
        orderBy: { happenedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          happenedAt: true,
          amount: true,
          balance: true,
          bonusBalance: true,
          type: true,
          externalDomain: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: { tenantId, guestId: id, isCanceled: false },
        orderBy: { saleDate: 'desc' },
        take: 20,
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
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: this.toIsoDateTime(session.startedAt),
        stoppedAt: this.toIsoDateTime(session.stoppedAt),
        durationMinutes: session.durationMinutes,
        externalDomain: session.externalDomain,
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        happenedAt: this.toIsoDateTime(transaction.happenedAt),
        amount: this.decimalToNumber(transaction.amount),
        balance: this.decimalToNumber(transaction.balance),
        bonusBalance: this.decimalToNumber(transaction.bonusBalance),
        type: transaction.type,
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

  private async buildGuestMetrics(
    tenantId: string,
    period: Period,
    guestIds?: string[],
  ) {
    const guestWhere = {
      tenantId,
      ...(guestIds ? { id: { in: guestIds } } : {}),
    };
    const [guests, sessions, transactions, sales] = await Promise.all([
      this.prisma.guest.findMany({
        where: guestWhere,
        select: this.guestSelect(),
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guestId: guestIds ? { in: guestIds } : { not: null },
          startedAt: { gte: period.activityFromDate, lte: period.toDate },
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
          guestId: guestIds ? { in: guestIds } : { not: null },
          happenedAt: { gte: period.activityFromDate, lte: period.toDate },
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
          guestId: guestIds ? { in: guestIds } : { not: null },
          saleDate: { gte: period.activityFromDate, lte: period.toDate },
          isCanceled: false,
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

    return { guests, metricsByGuestId };
  }

  private async buildVisitTrend(tenantId: string, period: Period) {
    const [sessions, sales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          guestId: { not: null },
          startedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: { guestId: true, startedAt: true },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          guestId: { not: null },
          saleDate: { gte: period.fromDate, lte: period.toDate },
          isCanceled: false,
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

  private async getDataQuality(tenantId: string, period: Period) {
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
        },
      }),
      this.prisma.guestTransaction.count({
        where: {
          tenantId,
          guestId: null,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
        },
      }),
      this.prisma.salesFact.count({
        where: {
          tenantId,
          externalGuestId: { not: null },
          guestId: null,
          saleDate: { gte: period.fromDate, lte: period.toDate },
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

  private toDashboardRow(
    guest: GuestBase,
    metrics: GuestMetrics | undefined,
    period: Period,
  ): GuestDashboardRow {
    const latestActivityAt = this.maxDate(
      guest.lastActivityAt,
      metrics?.latestActivityAt ?? null,
    );
    const segment = this.segmentGuest(guest, metrics, latestActivityAt, period);

    return {
      id: guest.id,
      externalDomain: guest.externalDomain,
      externalGuestId: guest.externalGuestId,
      displayName:
        guest.fullNameMasked ??
        guest.emailMasked ??
        guest.phoneMasked ??
        `Гость #${guest.externalGuestId}`,
      contact: guest.phoneMasked ?? guest.emailMasked ?? 'нет контакта',
      insertedAt: this.toIsoDateTime(guest.insertedAt),
      lastActivityAt: this.toIsoDateTime(latestActivityAt),
      sessionsCount: metrics?.sessionsCount ?? 0,
      visitsDays: metrics?.visitsDays.size ?? 0,
      playHours: this.round((metrics?.playMinutes ?? 0) / 60, 1),
      transactionAmount: this.round(metrics?.transactionAmount ?? 0, 2),
      barRevenue: this.round(metrics?.barRevenue ?? 0, 2),
      segment,
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

  private resolveLimit(value: string | undefined) {
    const parsed = Number(value ?? 100);

    if (!Number.isFinite(parsed)) {
      return 100;
    }

    return Math.min(Math.max(Math.trunc(parsed), 1), 500);
  }

  private guestSelect() {
    return {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      phoneMasked: true,
      emailMasked: true,
      fullNameMasked: true,
      insertedAt: true,
      lastActivityAt: true,
      isDisabled: true,
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

  private sortTopRows(rows: GuestDashboardRow[]) {
    return [...rows].sort((a, b) => {
      const bValue = b.transactionAmount + b.barRevenue;
      const aValue = a.transactionAmount + a.barRevenue;

      if (bValue !== aValue) {
        return bValue - aValue;
      }

      if (b.sessionsCount !== a.sessionsCount) {
        return b.sessionsCount - a.sessionsCount;
      }

      return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '');
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
}
