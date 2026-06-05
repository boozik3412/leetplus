import { Injectable } from '@nestjs/common';
import { Prisma, type BusinessSnapshotRun } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export type BusinessSnapshotType =
  | 'REVENUE'
  | 'GUESTS'
  | 'TARIFFS'
  | 'ASSORTMENT_ARRIVALS'
  | 'STAFF_SHIFTS_CASH';

type BusinessSnapshotStatus = 'EMPTY' | 'FRESH' | 'STALE' | 'FAILED';

export type BusinessSnapshotRunQuery = {
  type?: BusinessSnapshotType | 'ALL';
  dateFrom?: string;
  dateTo?: string;
};

export type BusinessSnapshotRunSummary = {
  id: string;
  type: BusinessSnapshotType;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  staleAfterHours: number;
  rowCount: number;
  sourceCounts: Record<string, number>;
  summary: Record<string, unknown>;
  freshness: Record<string, unknown>;
  errorMessage: string | null;
};

export type BusinessSnapshotTypeStatus = {
  type: BusinessSnapshotType;
  title: string;
  businessArea: string;
  targetRoute: string;
  status: BusinessSnapshotStatus;
  staleAfterHours: number;
  latestRun: BusinessSnapshotRunSummary | null;
  latestSuccessfulRun: BusinessSnapshotRunSummary | null;
  ageHours: number | null;
  rowCount: number;
  sourceCounts: Record<string, number>;
  summary: Record<string, unknown>;
  nextAction: string;
};

export type BusinessSnapshotStatusResult = {
  checkedAt: string;
  staleAfterHours: number;
  snapshots: BusinessSnapshotTypeStatus[];
};

export type BusinessSnapshotRunResult = {
  startedAt: string;
  finishedAt: string;
  runs: BusinessSnapshotRunSummary[];
  status: BusinessSnapshotStatusResult;
};

type SnapshotDefinition = {
  type: BusinessSnapshotType;
  title: string;
  businessArea: string;
  targetRoute: string;
};

type SnapshotBuildResult = {
  periodFrom: Date | null;
  periodTo: Date | null;
  rowCount: number;
  sourceCounts: Record<string, number>;
  summary: Record<string, unknown>;
};

const businessSnapshotFreshMs = 24 * 60 * 60 * 1000;
const businessSnapshotStaleAfterHours = 24;
const businessSnapshotDefinitions: SnapshotDefinition[] = [
  {
    type: 'REVENUE',
    title: 'Revenue snapshot',
    businessArea: 'Сводный дашборд и выручка',
    targetRoute: '/dashboard',
  },
  {
    type: 'GUESTS',
    title: 'Guest snapshot',
    businessArea: 'Гости и CRM',
    targetRoute: '/guests',
  },
  {
    type: 'TARIFFS',
    title: 'Tariff snapshot',
    businessArea: 'Маркетинг',
    targetRoute: '/marketing/promo-bundles',
  },
  {
    type: 'ASSORTMENT_ARRIVALS',
    title: 'Assortment arrival snapshot',
    businessArea: 'Ассортимент и отчеты',
    targetRoute: '/reports',
  },
  {
    type: 'STAFF_SHIFTS_CASH',
    title: 'Staff shift/cash snapshot',
    businessArea: 'Персонал',
    targetRoute: '/staff/operations-dashboard',
  },
];

@Injectable()
export class BusinessSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(
    user: AuthenticatedUser,
  ): Promise<BusinessSnapshotStatusResult> {
    const latestRuns = await this.prisma.businessSnapshotRun.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 80,
    });

    const now = new Date();
    const snapshots = businessSnapshotDefinitions.map((definition) =>
      this.toTypeStatus(definition, latestRuns, now),
    );

    return {
      checkedAt: now.toISOString(),
      staleAfterHours: businessSnapshotStaleAfterHours,
      snapshots,
    };
  }

  async runSnapshots(
    user: AuthenticatedUser,
    query: BusinessSnapshotRunQuery,
  ): Promise<BusinessSnapshotRunResult> {
    const startedAt = new Date();
    const period = this.resolvePeriod(query);
    const types = this.resolveTypes(query.type);
    const runs: BusinessSnapshotRunSummary[] = [];

    for (const type of types) {
      const run = await this.createSnapshotRun(user.tenantId, type, period);
      runs.push(this.toRunSummary(run));
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      runs,
      status: await this.getStatus(user),
    };
  }

  private async createSnapshotRun(
    tenantId: string,
    type: BusinessSnapshotType,
    period: { dateFrom: Date; dateTo: Date },
  ) {
    const startedAt = new Date();

    try {
      const data = await this.buildSnapshot(tenantId, type, period);
      const finishedAt = new Date();
      const freshness = this.buildFreshness('FRESH', data.rowCount, finishedAt);

      return this.prisma.businessSnapshotRun.create({
        data: {
          tenantId,
          type,
          status: data.rowCount > 0 ? 'SUCCESS' : 'EMPTY',
          startedAt,
          finishedAt,
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          staleAfterHours: businessSnapshotStaleAfterHours,
          rowCount: data.rowCount,
          sourceCounts: this.toInputJson(data.sourceCounts),
          summary: this.toInputJson(data.summary),
          freshness: this.toInputJson(freshness),
          errorMessage: null,
        },
      });
    } catch (error) {
      return this.prisma.businessSnapshotRun.create({
        data: {
          tenantId,
          type,
          status: 'FAILED',
          startedAt,
          finishedAt: new Date(),
          periodFrom: period.dateFrom,
          periodTo: period.dateTo,
          staleAfterHours: businessSnapshotStaleAfterHours,
          rowCount: 0,
          sourceCounts: this.toInputJson({}),
          summary: this.toInputJson({}),
          freshness: this.toInputJson(
            this.buildFreshness('FAILED', 0, new Date()),
          ),
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Не удалось создать typed snapshot.',
        },
      });
    }
  }

  private async buildSnapshot(
    tenantId: string,
    type: BusinessSnapshotType,
    period: { dateFrom: Date; dateTo: Date },
  ): Promise<SnapshotBuildResult> {
    switch (type) {
      case 'REVENUE':
        return this.buildRevenueSnapshot(tenantId, period);
      case 'GUESTS':
        return this.buildGuestSnapshot(tenantId, period);
      case 'TARIFFS':
        return this.buildTariffSnapshot(tenantId);
      case 'ASSORTMENT_ARRIVALS':
        return this.buildAssortmentArrivalSnapshot(tenantId, period);
      case 'STAFF_SHIFTS_CASH':
        return this.buildStaffShiftCashSnapshot(tenantId, period);
    }
  }

  private async buildRevenueSnapshot(
    tenantId: string,
    period: { dateFrom: Date; dateTo: Date },
  ): Promise<SnapshotBuildResult> {
    const [sales, clubRevenue, operations, transactions, shifts] =
      await Promise.all([
        this.prisma.salesFact.aggregate({
          where: {
            tenantId,
            isCanceled: false,
            saleDate: { gte: period.dateFrom, lte: period.dateTo },
          },
          _count: { _all: true },
          _sum: { revenue: true, cost: true },
          _max: { saleDate: true },
        }),
        this.prisma.clubRevenueFact.aggregate({
          where: {
            tenantId,
            revenueDate: { gte: period.dateFrom, lte: period.dateTo },
          },
          _count: { _all: true },
          _sum: { totalRevenue: true },
          _max: { revenueDate: true },
        }),
        this.prisma.guestOperationLog.aggregate({
          where: {
            tenantId,
            happenedAt: { gte: period.dateFrom, lte: period.dateTo },
          },
          _count: { _all: true },
          _sum: { amount: true },
          _max: { happenedAt: true },
        }),
        this.prisma.guestTransaction.aggregate({
          where: {
            tenantId,
            happenedAt: { gte: period.dateFrom, lte: period.dateTo },
          },
          _count: { _all: true },
          _sum: { amount: true },
          _max: { happenedAt: true },
        }),
        this.prisma.guestWorkingShift.aggregate({
          where: {
            tenantId,
            startedAt: { gte: period.dateFrom, lte: period.dateTo },
          },
          _count: { _all: true },
          _sum: {
            cashAmount: true,
            cashlessAmount: true,
            mobilePay: true,
            refundsCash: true,
            refundsCashless: true,
          },
          _max: { startedAt: true },
        }),
      ]);

    const shiftCash = this.decimalToNumber(shifts._sum.cashAmount);
    const shiftCashless = this.decimalToNumber(shifts._sum.cashlessAmount);
    const shiftMobilePay = this.decimalToNumber(shifts._sum.mobilePay);
    const shiftRefunds =
      this.decimalToNumber(shifts._sum.refundsCash) +
      this.decimalToNumber(shifts._sum.refundsCashless);

    return {
      periodFrom: period.dateFrom,
      periodTo: period.dateTo,
      rowCount:
        sales._count._all +
        clubRevenue._count._all +
        operations._count._all +
        transactions._count._all +
        shifts._count._all,
      sourceCounts: {
        salesFacts: sales._count._all,
        clubRevenueFacts: clubRevenue._count._all,
        operationLogs: operations._count._all,
        guestTransactions: transactions._count._all,
        workingShifts: shifts._count._all,
      },
      summary: {
        productRevenue: this.decimalToNumber(sales._sum.revenue),
        productCost: this.decimalToNumber(sales._sum.cost),
        clubRevenue: this.decimalToNumber(clubRevenue._sum.totalRevenue),
        operationAmount: this.decimalToNumber(operations._sum.amount),
        transactionAmount: this.decimalToNumber(transactions._sum.amount),
        shiftCashRevenue:
          shiftCash + shiftCashless + shiftMobilePay - shiftRefunds,
        latestFactAt: this.latestIso([
          sales._max.saleDate,
          clubRevenue._max.revenueDate,
          operations._max.happenedAt,
          transactions._max.happenedAt,
          shifts._max.startedAt,
        ]),
      },
    };
  }

  private async buildGuestSnapshot(
    tenantId: string,
    period: { dateFrom: Date; dateTo: Date },
  ): Promise<SnapshotBuildResult> {
    const [
      guests,
      groups,
      sessions,
      logs,
      transactions,
      balances,
      bonusBalances,
    ] = await Promise.all([
      this.prisma.guest.count({ where: { tenantId } }),
      this.prisma.guestGroup.count({ where: { tenantId } }),
      this.prisma.guestSession.aggregate({
        where: {
          tenantId,
          startedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _max: { startedAt: true },
      }),
      this.prisma.guestLog.aggregate({
        where: {
          tenantId,
          happenedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _max: { happenedAt: true },
      }),
      this.prisma.guestTransaction.aggregate({
        where: {
          tenantId,
          happenedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _max: { happenedAt: true },
      }),
      this.prisma.guestBalanceSnapshot.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { snapshotDate: true },
        _sum: { balance: true },
      }),
      this.prisma.guestBonusBalanceSnapshot.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { snapshotDate: true },
        _sum: { bonusBalance: true },
      }),
    ]);

    return {
      periodFrom: period.dateFrom,
      periodTo: period.dateTo,
      rowCount:
        guests +
        groups +
        sessions._count._all +
        logs._count._all +
        transactions._count._all +
        balances._count._all +
        bonusBalances._count._all,
      sourceCounts: {
        guests,
        guestGroups: groups,
        sessions: sessions._count._all,
        logs: logs._count._all,
        transactions: transactions._count._all,
        balances: balances._count._all,
        bonusBalances: bonusBalances._count._all,
      },
      summary: {
        balanceTotal: this.decimalToNumber(balances._sum.balance),
        bonusBalanceTotal: this.decimalToNumber(
          bonusBalances._sum.bonusBalance,
        ),
        latestFactAt: this.latestIso([
          sessions._max.startedAt,
          logs._max.happenedAt,
          transactions._max.happenedAt,
          balances._max.snapshotDate,
          bonusBalances._max.snapshotDate,
        ]),
      },
    };
  }

  private async buildTariffSnapshot(
    tenantId: string,
  ): Promise<SnapshotBuildResult> {
    const [total, latest, groups] = await Promise.all([
      this.prisma.langameTariffSnapshotItem.count({ where: { tenantId } }),
      this.prisma.langameTariffSnapshotItem.aggregate({
        where: { tenantId },
        _max: { startedAt: true },
      }),
      this.prisma.langameTariffSnapshotItem.groupBy({
        by: ['endpointKey'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);

    const byEndpoint = Object.fromEntries(
      groups.map((item) => [item.endpointKey, item._count._all]),
    );

    return {
      periodFrom: latest._max.startedAt,
      periodTo: latest._max.startedAt,
      rowCount: total,
      sourceCounts: byEndpoint,
      summary: {
        endpointKeys: Object.keys(byEndpoint),
        latestFactAt: latest._max.startedAt?.toISOString() ?? null,
      },
    };
  }

  private async buildAssortmentArrivalSnapshot(
    tenantId: string,
    period: { dateFrom: Date; dateTo: Date },
  ): Promise<SnapshotBuildResult> {
    const [inventory, movements, products, stores] = await Promise.all([
      this.prisma.inventorySnapshot.aggregate({
        where: {
          tenantId,
          snapshotDate: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _max: { snapshotDate: true },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.aggregate({
        where: {
          tenantId,
          movementDate: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _max: { movementDate: true },
        _sum: { quantity: true, amount: true },
      }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.store.count({ where: { tenantId } }),
    ]);

    return {
      periodFrom: period.dateFrom,
      periodTo: period.dateTo,
      rowCount: inventory._count._all + movements._count._all,
      sourceCounts: {
        inventorySnapshots: inventory._count._all,
        stockMovements: movements._count._all,
        products,
        stores,
      },
      summary: {
        inventoryQuantity: this.decimalToNumber(inventory._sum.quantity),
        movementQuantity: this.decimalToNumber(movements._sum.quantity),
        movementAmount: this.decimalToNumber(movements._sum.amount),
        latestFactAt: this.latestIso([
          inventory._max.snapshotDate,
          movements._max.movementDate,
        ]),
      },
    };
  }

  private async buildStaffShiftCashSnapshot(
    tenantId: string,
    period: { dateFrom: Date; dateTo: Date },
  ): Promise<SnapshotBuildResult> {
    const [shifts, operations, staffMembers, mappings] = await Promise.all([
      this.prisma.guestWorkingShift.aggregate({
        where: {
          tenantId,
          startedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _sum: {
          cashAmount: true,
          cashlessAmount: true,
          refundsCash: true,
          refundsCashless: true,
          incassAmount: true,
        },
        _max: { startedAt: true },
      }),
      this.prisma.guestOperationLog.aggregate({
        where: {
          tenantId,
          happenedAt: { gte: period.dateFrom, lte: period.dateTo },
        },
        _count: { _all: true },
        _sum: { amount: true },
        _max: { happenedAt: true },
      }),
      this.prisma.staffMember.count({ where: { tenantId } }),
      this.prisma.guestStaffIdentityMapping.count({ where: { tenantId } }),
    ]);

    const cashAmount = this.decimalToNumber(shifts._sum.cashAmount);
    const cashlessAmount = this.decimalToNumber(shifts._sum.cashlessAmount);
    const refunds =
      this.decimalToNumber(shifts._sum.refundsCash) +
      this.decimalToNumber(shifts._sum.refundsCashless);

    return {
      periodFrom: period.dateFrom,
      periodTo: period.dateTo,
      rowCount: shifts._count._all + operations._count._all,
      sourceCounts: {
        workingShifts: shifts._count._all,
        operationLogs: operations._count._all,
        staffMembers,
        staffMappings: mappings,
      },
      summary: {
        shiftCashAmount: cashAmount,
        shiftCashlessAmount: cashlessAmount,
        shiftRefunds: refunds,
        shiftNetCash: cashAmount + cashlessAmount - refunds,
        incassAmount: this.decimalToNumber(shifts._sum.incassAmount),
        operationAmount: this.decimalToNumber(operations._sum.amount),
        latestFactAt: this.latestIso([
          shifts._max.startedAt,
          operations._max.happenedAt,
        ]),
      },
    };
  }

  private toTypeStatus(
    definition: SnapshotDefinition,
    latestRuns: BusinessSnapshotRun[],
    now: Date,
  ): BusinessSnapshotTypeStatus {
    const runs = latestRuns.filter((run) => run.type === definition.type);
    const latestRun = runs[0] ?? null;
    const latestSuccessfulRun =
      runs.find((run) => run.status === 'SUCCESS' || run.status === 'EMPTY') ??
      null;
    const finishedAt = latestSuccessfulRun?.finishedAt ?? null;
    const ageHours = finishedAt
      ? Math.round(((now.getTime() - finishedAt.getTime()) / 3_600_000) * 10) /
        10
      : null;
    const status = this.resolveStatus(latestRun, latestSuccessfulRun, now);
    const runSummary = latestSuccessfulRun
      ? this.jsonObject(latestSuccessfulRun.summary)
      : {};

    return {
      type: definition.type,
      title: definition.title,
      businessArea: definition.businessArea,
      targetRoute: definition.targetRoute,
      status,
      staleAfterHours: businessSnapshotStaleAfterHours,
      latestRun: latestRun ? this.toRunSummary(latestRun) : null,
      latestSuccessfulRun: latestSuccessfulRun
        ? this.toRunSummary(latestSuccessfulRun)
        : null,
      ageHours,
      rowCount: latestSuccessfulRun?.rowCount ?? 0,
      sourceCounts: latestSuccessfulRun
        ? this.numberRecord(latestSuccessfulRun.sourceCounts)
        : {},
      summary: runSummary,
      nextAction: this.snapshotNextAction(status, definition),
    };
  }

  private resolveStatus(
    latestRun: BusinessSnapshotRun | null,
    latestSuccessfulRun: BusinessSnapshotRun | null,
    now: Date,
  ): BusinessSnapshotStatus {
    if (!latestRun) {
      return 'EMPTY';
    }
    if (latestRun.status === 'FAILED' && !latestSuccessfulRun) {
      return 'FAILED';
    }
    const finishedAt = latestSuccessfulRun?.finishedAt;
    if (!finishedAt) {
      return latestRun.status === 'FAILED' ? 'FAILED' : 'EMPTY';
    }
    return now.getTime() - finishedAt.getTime() > businessSnapshotFreshMs
      ? 'STALE'
      : 'FRESH';
  }

  private snapshotNextAction(
    status: BusinessSnapshotStatus,
    definition: SnapshotDefinition,
  ) {
    if (status === 'FRESH') {
      return `${definition.businessArea}: рабочие страницы могут использовать typed snapshot без live-запросов к Langame.`;
    }
    if (status === 'STALE') {
      return `Обновите ${definition.title} на /sync перед сверкой ${definition.targetRoute}.`;
    }
    if (status === 'FAILED') {
      return `Разберите ошибку последнего ${definition.title} и повторите запуск.`;
    }
    return `Создайте первый ${definition.title} из уже сохраненных LeetPlus-фактов.`;
  }

  private toRunSummary(run: BusinessSnapshotRun): BusinessSnapshotRunSummary {
    return {
      id: run.id,
      type: run.type as BusinessSnapshotType,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      periodFrom: run.periodFrom?.toISOString() ?? null,
      periodTo: run.periodTo?.toISOString() ?? null,
      staleAfterHours: run.staleAfterHours,
      rowCount: run.rowCount,
      sourceCounts: this.numberRecord(run.sourceCounts),
      summary: this.jsonObject(run.summary),
      freshness: this.jsonObject(run.freshness),
      errorMessage: run.errorMessage,
    };
  }

  private resolveTypes(type?: BusinessSnapshotRunQuery['type']) {
    if (!type || type === 'ALL') {
      return businessSnapshotDefinitions.map((definition) => definition.type);
    }
    if (
      !businessSnapshotDefinitions.some(
        (definition) => definition.type === type,
      )
    ) {
      return businessSnapshotDefinitions.map((definition) => definition.type);
    }
    return [type];
  }

  private resolvePeriod(query: BusinessSnapshotRunQuery) {
    const dateTo = this.parseDate(query.dateTo) ?? new Date();
    const dateFrom =
      this.parseDate(query.dateFrom) ??
      new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      dateFrom: this.startOfUtcDay(dateFrom),
      dateTo: this.endOfUtcDay(dateTo),
    };
  }

  private buildFreshness(
    status: BusinessSnapshotStatus,
    rowCount: number,
    finishedAt: Date,
  ) {
    return {
      status,
      rowCount,
      finishedAt: finishedAt.toISOString(),
      staleAfterHours: businessSnapshotStaleAfterHours,
    };
  }

  private parseDate(value?: string) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private endOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined) {
    return value ? Number(value) : 0;
  }

  private latestIso(values: Array<Date | null | undefined>) {
    const latest = values
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latest?.toISOString() ?? null;
  }

  private toInputJson(value: Record<string, unknown>) {
    return value as Prisma.InputJsonObject;
  }

  private jsonObject(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private numberRecord(value: Prisma.JsonValue | null) {
    const object = this.jsonObject(value);
    return Object.fromEntries(
      Object.entries(object).map(([key, raw]) => [
        key,
        typeof raw === 'number' ? raw : Number(raw) || 0,
      ]),
    );
  }
}
