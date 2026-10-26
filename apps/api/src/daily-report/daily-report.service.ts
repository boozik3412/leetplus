import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { buildDailyReport } from './daily-report-builder';
import {
  DailyReportCommentaryService,
  type CommentaryResult,
} from './daily-report-commentary';
import { renderDailyReport } from './daily-report-text';
import {
  clubDayWindow,
  lastClosedClubDay,
  shiftDate,
  type ClubDayWindow,
} from './daily-report-window';
import type {
  DailyReport,
  DailyReportInput,
  DailyReportSaleRow,
  DailyReportShiftRow,
} from './daily-report.types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BASELINE_DAYS = 7;
const ADMIN_HISTORY_DAYS = 30;
const STOCK_DAYS = 14;
const OPEN_SHIFT_LOOKBACK_MS = 2 * DAY_MS;
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export type DailyReportPreview = {
  report: DailyReport;
  commentary: CommentaryResult | null;
  /** Telegram HTML messages exactly as the bot would send them. */
  messages: string[];
};

export type DailyReportScope = {
  tenantId: string;
  /** `null` is every active store of the tenant (NETWORK scope). */
  storeIds: readonly string[] | null;
};

const toNumber = (value: Prisma.Decimal | number | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value);

@Injectable()
export class DailyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScope: FreshStoreScopeService,
    private readonly commentaryService: DailyReportCommentaryService,
  ) {}

  /** Numbers only: a read without any provider call. */
  async previewForUser(
    user: AuthenticatedUser,
    query: { date?: string },
  ): Promise<DailyReportPreview> {
    const report = await this.build(
      await this.scopeOf(user),
      new Date(),
      query.date,
    );
    return {
      report,
      commentary: null,
      messages: renderDailyReport(report, null),
    };
  }

  /** The same report with the AI commentary; calls the LLM provider. */
  async commentaryForUser(
    user: AuthenticatedUser,
    query: { date?: string },
  ): Promise<DailyReportPreview> {
    const report = await this.build(
      await this.scopeOf(user),
      new Date(),
      query.date,
    );
    const commentary = await this.commentaryService.comment(report);
    return {
      report,
      commentary,
      messages: renderDailyReport(report, commentary.text),
    };
  }

  private async scopeOf(user: AuthenticatedUser): Promise<DailyReportScope> {
    const scope = await this.freshStoreScope.resolve(user);
    return {
      tenantId: scope.tenantId,
      storeIds: scope.mode === 'NETWORK' ? null : scope.allowedStoreIds,
    };
  }

  /**
   * The report of the club day that closed on `reportDate` (club-local), or of
   * each club's latest closed day when no date is given.
   */
  async build(
    scope: DailyReportScope,
    now: Date,
    reportDate?: string,
  ): Promise<DailyReport> {
    if (reportDate !== undefined && !DATE_INPUT.test(reportDate)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return buildDailyReport(await this.loadInput(scope, now, reportDate));
  }

  async loadInput(
    scope: DailyReportScope,
    now: Date,
    reportDate?: string,
  ): Promise<DailyReportInput> {
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: scope.tenantId,
        isActive: true,
        ...(scope.storeIds ? { id: { in: [...scope.storeIds] } } : {}),
      },
      select: { id: true, name: true, timeZone: true, computerCount: true },
      orderBy: { name: 'asc' },
    });
    const storeIds = stores.map((store) => store.id);
    const windows = stores.map((store) => {
      const timeZone = store.timeZone?.trim() || 'UTC';
      const window = reportDate
        ? clubDayWindow(reportDate, timeZone)
        : lastClosedClubDay(now, timeZone);
      const baseline: ClubDayWindow[] = [];
      for (let offset = 1; offset <= BASELINE_DAYS; offset += 1) {
        baseline.push(
          clubDayWindow(shiftDate(window.reportDate, -offset), timeZone),
        );
      }
      return { store, window, baseline };
    });

    if (!windows.length) {
      return {
        generatedAt: now,
        stores: [],
        baselineWindows: {},
        shifts: [],
        historyShifts: [],
        sales: [],
        sessions: [],
        stock: [],
        stockSales: [],
        stockDays: STOCK_DAYS,
        oosExcludedProductKeys: new Set(),
      };
    }

    const rangeFrom = new Date(
      Math.min(
        ...windows.flatMap(({ baseline }) =>
          baseline.map((window) => window.from.getTime()),
        ),
      ),
    );
    const rangeTo = new Date(
      Math.max(...windows.map(({ window }) => window.to.getTime())),
    );
    const historyFrom = new Date(
      rangeTo.getTime() - ADMIN_HISTORY_DAYS * DAY_MS,
    );
    const stockFrom = new Date(now.getTime() - STOCK_DAYS * DAY_MS);
    const tenantId = scope.tenantId;
    const storeFilter = { in: storeIds };

    const [
      shiftRows,
      historyRows,
      salesRows,
      sessionRows,
      stockRows,
      stockSalesRows,
      exclusions,
    ] = await Promise.all([
      this.prisma.guestWorkingShift.findMany({
        where: {
          tenantId,
          storeId: storeFilter,
          OR: [
            {
              startedAt: {
                gte: new Date(rangeFrom.getTime() - 3 * HOUR_MS),
                lt: rangeTo,
              },
            },
            {
              stoppedAt: null,
              startedAt: {
                gte: new Date(rangeTo.getTime() - OPEN_SHIFT_LOOKBACK_MS),
              },
            },
          ],
        },
        select: shiftSelect,
      }),
      this.prisma.guestWorkingShift.findMany({
        where: {
          tenantId,
          storeId: storeFilter,
          stoppedAt: { not: null },
          startedAt: { gte: historyFrom, lt: rangeTo },
        },
        select: shiftSelect,
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          storeId: storeFilter,
          isCanceled: false,
          saleDate: { gte: rangeFrom, lt: rangeTo },
        },
        select: saleSelect,
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          storeId: storeFilter,
          startedAt: { gte: rangeFrom, lt: rangeTo },
        },
        select: {
          storeId: true,
          guestId: true,
          externalGuestId: true,
          startedAt: true,
          durationMinutes: true,
          guest: { select: { insertedAt: true } },
        },
      }),
      this.loadLatestStock(tenantId, storeIds),
      this.prisma.salesFact.groupBy({
        by: ['storeId', 'productId'],
        where: {
          tenantId,
          storeId: storeFilter,
          isCanceled: false,
          saleDate: { gte: stockFrom, lt: now },
        },
        _sum: { quantity: true },
      }),
      this.prisma.productOosExclusion.findMany({
        where: { tenantId },
        select: { productId: true },
      }),
    ]);

    const adminNames = await this.loadAdminNames(tenantId, [
      ...shiftRows,
      ...historyRows,
    ]);
    const toShift = (row: ShiftRecord): DailyReportShiftRow => {
      const adminKey =
        row.externalDomain && row.externalUserId
          ? `${row.externalDomain}:${row.externalUserId}`
          : null;
      return {
        id: row.id,
        storeId: row.storeId!,
        adminKey,
        adminName: adminKey ? (adminNames.get(adminKey) ?? null) : null,
        startedAt: row.startedAt,
        stoppedAt: row.stoppedAt,
        cash: toNumber(row.cashAmount),
        cashless: toNumber(row.cashlessAmount),
        mobilePay: toNumber(row.mobilePay),
        refunds: toNumber(row.refundsCash) + toNumber(row.refundsCashless),
        incass: toNumber(row.incassAmount),
      };
    };
    const toSale = (row: SaleRecord): DailyReportSaleRow => ({
      storeId: row.storeId,
      productKey: row.productId,
      productName:
        row.product.canonicalProduct?.name ??
        row.product.name ??
        row.productNameAtSale ??
        'Товар',
      saleDate: row.saleDate,
      quantity: toNumber(row.quantity),
      revenue: toNumber(row.revenue),
      cost: toNumber(row.cost),
    });

    return {
      generatedAt: now,
      stores: windows.map(({ store, window }) => ({
        id: store.id,
        name: store.name,
        timeZone: window.timeZone,
        computerCount: store.computerCount,
        window,
      })),
      baselineWindows: Object.fromEntries(
        windows.map(({ store, baseline }) => [store.id, baseline]),
      ),
      shifts: shiftRows.filter((row) => row.storeId).map(toShift),
      historyShifts: historyRows.filter((row) => row.storeId).map(toShift),
      sales: salesRows.map(toSale),
      sessions: sessionRows
        .filter((row) => row.storeId && row.startedAt)
        .map((row) => ({
          storeId: row.storeId!,
          guestKey: row.guestId ?? row.externalGuestId ?? null,
          startedAt: row.startedAt!,
          durationMinutes: row.durationMinutes,
          guestRegisteredAt: row.guest?.insertedAt ?? null,
        })),
      stock: stockRows,
      stockSales: stockSalesRows.map((row) => ({
        storeId: row.storeId,
        productKey: row.productId,
        productName: '',
        saleDate: now,
        quantity: toNumber(row._sum.quantity),
        revenue: 0,
        cost: 0,
      })),
      stockDays: STOCK_DAYS,
      oosExcludedProductKeys: new Set(exclusions.map((row) => row.productId)),
    };
  }

  private async loadLatestStock(tenantId: string, storeIds: string[]) {
    const latest = await this.prisma.inventorySnapshot.groupBy({
      by: ['storeId'],
      where: { tenantId, storeId: { in: storeIds } },
      _max: { snapshotDate: true },
    });
    const pairs = latest.filter((row) => row._max.snapshotDate);
    if (!pairs.length) return [];
    const rows = await this.prisma.inventorySnapshot.findMany({
      where: {
        tenantId,
        OR: pairs.map((row) => ({
          storeId: row.storeId,
          snapshotDate: row._max.snapshotDate!,
        })),
        product: { isActive: true },
      },
      select: {
        storeId: true,
        productId: true,
        quantity: true,
        snapshotDate: true,
        product: {
          select: { name: true, canonicalProduct: { select: { name: true } } },
        },
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      productKey: row.productId,
      productName: row.product.canonicalProduct?.name ?? row.product.name,
      quantity: toNumber(row.quantity),
      snapshotDate: row.snapshotDate,
    }));
  }

  private async loadAdminNames(tenantId: string, rows: ShiftRecord[]) {
    const keys = new Map<
      string,
      { externalDomain: string; externalUserId: string }
    >();
    rows.forEach((row) => {
      if (row.externalDomain && row.externalUserId) {
        keys.set(`${row.externalDomain}:${row.externalUserId}`, {
          externalDomain: row.externalDomain,
          externalUserId: row.externalUserId,
        });
      }
    });
    if (!keys.size) return new Map<string, string>();
    const users = await this.prisma.langameStaffUser.findMany({
      where: { tenantId, OR: [...keys.values()] },
      select: {
        externalDomain: true,
        externalUserId: true,
        username: true,
        email: true,
      },
    });
    return new Map(
      users
        .map((user) => [
          `${user.externalDomain}:${user.externalUserId}`,
          user.username?.trim() || user.email?.trim() || '',
        ])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }
}

const shiftSelect = {
  id: true,
  storeId: true,
  externalDomain: true,
  externalUserId: true,
  startedAt: true,
  stoppedAt: true,
  cashAmount: true,
  cashlessAmount: true,
  mobilePay: true,
  refundsCash: true,
  refundsCashless: true,
  incassAmount: true,
} satisfies Prisma.GuestWorkingShiftSelect;

const saleSelect = {
  storeId: true,
  productId: true,
  productNameAtSale: true,
  saleDate: true,
  quantity: true,
  revenue: true,
  cost: true,
  product: {
    select: { name: true, canonicalProduct: { select: { name: true } } },
  },
} satisfies Prisma.SalesFactSelect;

type ShiftRecord = Prisma.GuestWorkingShiftGetPayload<{
  select: typeof shiftSelect;
}>;
type SaleRecord = Prisma.SalesFactGetPayload<{ select: typeof saleSelect }>;
