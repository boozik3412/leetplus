import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { receiptIdentityFromSourceHash } from '../common/receipt-source-identity';
import { resolveGuestSessionStore } from '../common/guest-session-store';
import {
  AssortmentHealthLoaderService,
  type AssortmentSourceHealthEvidence,
} from '../common/assortment-health-loader.service';
import type {
  AssortmentHealth,
  AssortmentNoSalesWindow,
} from '../common/assortment-health';
import type {
  ExecutiveAppliedScope,
  ExecutiveMetric,
  ExecutiveMetrics,
} from '../common/executive-contract';
import {
  aggregateExecutiveRevenue,
  compareExecutiveValues,
} from '../common/executive-metrics';

export type DashboardPeriod =
  | 'day'
  | 'full-day'
  | 'week'
  | 'full-week'
  | 'month'
  | 'full-month'
  | 'quarter'
  | 'full-quarter'
  | 'year'
  | 'full-year'
  | 'custom';
export type DashboardSkuGrouping = 'club' | 'network';

export type DashboardQuery = {
  period?: DashboardPeriod;
  dateFrom?: string;
  dateTo?: string;
  storeIds?: string | string[];
  categoryIds?: string | string[];
  skuGrouping?: DashboardSkuGrouping;
  asOf?: string;
  noSalesDays?: AssortmentNoSalesWindow | string;
};

export type DashboardExecutiveProductRevenueQuery = Pick<
  DashboardQuery,
  'period' | 'dateFrom' | 'dateTo' | 'storeIds' | 'asOf'
>;

export type DashboardExecutiveQuery = DashboardExecutiveProductRevenueQuery & {
  comparison?: boolean | string;
};

export type DashboardExecutiveSummary = {
  scope: ExecutiveAppliedScope;
  metrics: ExecutiveMetrics;
  clubs: Array<{
    storeId: string;
    storeName: string;
    metrics: ExecutiveMetrics;
  }>;
  days: Array<{ date: string; metrics: ExecutiveMetrics }>;
};

export type DashboardExecutiveOperations = {
  scope: ExecutiveAppliedScope;
  assortment: {
    state: 'AVAILABLE' | 'PARTIAL' | 'MISSING' | 'STALE' | 'FAILED';
    reason: string | null;
    data: AssortmentHealth | null;
  };
};

export type DashboardExecutiveProductRevenue = {
  scope: ExecutiveAppliedScope;
  grain: 'CLUB';
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  selectedStoreIds: string[];
  metric: ExecutiveMetric<number> & {
    key: 'productRevenue';
    label: 'Товарная выручка';
    unit: 'RUB';
    grain: 'PRODUCT_SALE_OPERATION';
    destination: 'CLUBS';
  };
  rows: Array<{
    storeId: string;
    storeName: string;
    revenue: number | null;
    saleOperationCount: number | null;
    metric: ExecutiveMetric<number> & {
      key: 'productRevenue';
      label: 'Товарная выручка';
      unit: 'RUB';
      grain: 'PRODUCT_SALE_OPERATION';
      destination: 'CLUBS';
    };
  }>;
};

export type DashboardTopSku = {
  productId: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  storeId: string | null;
  storeName: string | null;
  revenue: number;
  grossProfit: number;
  soldQuantity: number;
};

export type DashboardCategoryMetric = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  grossProfit: number;
  activeSku: number;
  revenueSharePercent: number;
  grossProfitSharePercent: number;
  profitEfficiency: number | null;
  fillEfficiency: number | null;
};

export type DashboardStoreRevenueMetric = {
  storeId: string;
  storeName: string;
  totalRevenue: number;
  totalRevenueSource: Exclude<DashboardRevenueSource, 'SNAPSHOT'>;
  productRevenue: number;
  activeGuests: number;
  visitsCount: number;
  saleOperationCount: number;
  saleOperationsPer100Visits: number | null;
  productRevenueSharePercent: number | null;
};

export type DashboardRevenueSource =
  | 'SNAPSHOT'
  | 'BALANCE_OPERATIONS'
  | 'TRANSACTIONS'
  | 'PRODUCTS'
  | 'EMPTY';

export type DashboardRevenueTrustLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type DashboardRevenueBreakdown = {
  networkRevenue: number;
  allocatedClubRevenue: number;
  productRevenue: number;
  balanceOperationRevenue: number;
  transactionSpendRevenue: number;
  unallocatedTopupRevenue: number;
  shiftCashRevenue: number;
  primarySource: DashboardRevenueSource;
  formula: string;
  sourceCounts: {
    productSales: number;
    operationSpends: number;
    operationTopups: number;
    transactions: number;
    workingShifts: number;
  };
};

export type DashboardRevenueSnapshot = {
  status: 'FRESH' | 'STALE' | 'MISSING' | 'FAILED';
  generatedAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  networkRevenue: number | null;
  sourceCounts: Record<string, number>;
};

export type DashboardRevenueDataQuality = {
  level: DashboardRevenueTrustLevel;
  title: string;
  notes: string[];
};

type DashboardTrendGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
type DashboardTrendMode = DashboardTrendGranularity | 'custom';

const DEMAND_PERIOD_DAYS = 21;
const ACTIVE_SKU_SALES_DAYS = 14;
const FULL_DAY_AVERAGE_DAYS = 30;
const FORECAST_HISTORY_DAYS = 28;
const FORECAST_HORIZON_DAYS = 7;
const FORECAST_TARGET_UPLIFT_PERCENT = 5;
const NO_SALES_PERIOD_DAYS = [7, 14, 21] as const;

type NoSalesPeriodDays = (typeof NO_SALES_PERIOD_DAYS)[number];

export type DashboardSalesTrendSegment = {
  index: number;
  label: string;
  from: string;
  to: string;
  revenue: number;
  soldQuantity: number;
  grossProfit: number;
  visitsCount: number;
  saleOperationCount: number;
  saleOperationsPer100Visits: number | null;
  averageSaleOperationAmount: number | null;
  clubRevenue: number;
  revenueSharePercent: number | null;
  revenueDeltaPercent: number | null;
  quantityDeltaPercent: number | null;
  noSalesSkuCount: number;
  noSalesSkuDeltaPercent: number | null;
  noSalesSkuCount7: number;
  noSalesSkuDeltaPercent7: number | null;
  noSalesSkuCount14: number;
  noSalesSkuDeltaPercent14: number | null;
  noSalesSkuCount21: number;
  noSalesSkuDeltaPercent21: number | null;
  outOfStockSkuCount: number;
  outOfStockSkuDeltaPercent: number | null;
};

export type DashboardGrowthMetric = {
  value: number;
  previousValue: number;
  deltaPercent: number | null;
};

export type DashboardOptionalGrowthMetric = {
  value: number | null;
  previousValue: number | null;
  deltaPercent: number | null;
};

export type DashboardMetricCalculation = {
  key: string;
  label: string;
  source: string;
  formula: string;
  grain: string;
  state:
    | 'READY'
    | 'NO_DATA'
    | 'PARTIAL_COVERAGE'
    | 'SOURCE_UNAVAILABLE'
    | 'SOURCE_CONFLICT'
    | 'STALE';
  note: string | null;
};

export type DashboardAssortmentSourceHealth = {
  key: 'visits' | 'sales' | 'inventory' | 'costs' | 'categories';
  label: string;
  state: 'FRESH' | 'STALE' | 'MISSING' | 'FAILED' | 'PARTIAL';
  lastFactAt: string | null;
  lastImportedAt: string | null;
  coveragePercent: number | null;
  detail: string;
};

export type DashboardAssortmentAction = {
  key: string;
  priority: number;
  tone: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';
  title: string;
  description: string;
  metric: string;
  impactRubles: number | null;
  href: string;
};

export type DashboardReceiptMetrics = {
  state: 'READY' | 'PARTIAL_COVERAGE' | 'SOURCE_UNAVAILABLE' | 'NO_DATA';
  requiredField: 'RECEIPT_OR_ORDER_ID';
  reason: string;
  coveragePercent: number | null;
  coveredRevenuePercent: number | null;
  purchaseCount: number | null;
  averageCheck: number | null;
  itemsPerCheck: number | null;
  topBasketPair: {
    firstProductName: string;
    secondProductName: string;
    receiptsCount: number;
  } | null;
};

export type DashboardAssortmentForecastDay = {
  date: string;
  label: string;
  revenue: number;
};

export type DashboardAssortmentForecast = {
  state: 'READY' | 'NO_DATA' | 'PARTIAL_COVERAGE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  horizonDays: 7;
  historyDays: number;
  revenue: number | null;
  suggestedTargetRevenue: number | null;
  targetUpliftPercent: 5;
  oosRiskSkuCount: number;
  lostRevenue: number | null;
  recommendedOrderQuantity: number;
  recoverableRevenue: number | null;
  days: DashboardAssortmentForecastDay[];
  reason: string | null;
};

export type DashboardAssortmentCoverageGaps = {
  missingCostOperationCount: number;
  missingCostRevenue: number;
  missingStockSkuCount: number;
  uncategorizedSkuCount: number;
  uncategorizedRevenue: number;
  uncategorizedRevenueSharePercent: number | null;
  categoryNormalizationCandidateCount: number;
};

export type DashboardAssortmentDrivers = {
  identifiedActiveGuests: number;
  guestIdentificationCoveragePercent: number | null;
  sessionsPerIdentifiedGuest: number | null;
  stockTrackedSkuCount: number;
  stockCoveragePercent: number | null;
  availabilityPercent: number | null;
  itemsPerSaleOperation: number | null;
  averageItemPrice: number | null;
  costCoveragePercent: number | null;
  leadingCategory: {
    categoryId: string | null;
    categoryName: string;
    revenueSharePercent: number;
  } | null;
  productMarginPercent: number | null;
};

export type DashboardAssortmentOpportunity = {
  state: 'READY' | 'NO_DATA';
  storeId: string | null;
  storeName: string | null;
  currentSharePercent: number | null;
  benchmarkSharePercent: number | null;
  gapPoints: number | null;
  revenueOpportunity: number | null;
  reason: string | null;
};

export type DashboardAssortmentGrowth = {
  visits: DashboardGrowthMetric;
  saleOperations: DashboardGrowthMetric & {
    per100Visits: number | null;
    previousPer100Visits: number | null;
    per100VisitsDeltaPoints: number | null;
  };
  averageSaleOperationAmount: DashboardOptionalGrowthMetric;
  revenue: DashboardGrowthMetric;
  drivers: DashboardAssortmentDrivers;
  opportunity: DashboardAssortmentOpportunity;
  sources: DashboardAssortmentSourceHealth[];
  actions: DashboardAssortmentAction[];
  coverageGaps: DashboardAssortmentCoverageGaps;
  forecast: DashboardAssortmentForecast;
  calculations: DashboardMetricCalculation[];
  methodology: {
    visitUnit: 'GAME_SESSION';
    saleUnit: 'PRODUCT_SALE_OPERATION';
    saleUnitIsExact: true;
    receiptMetrics: DashboardReceiptMetrics;
  };
};

export type DashboardVisitBinding = {
  state: 'AVAILABLE' | 'PARTIAL' | 'MISSING';
  observedVisitCount: number;
  usableVisitCount: number | null;
  coverage: { covered: number; total: number; percent: number | null };
  reason: string | null;
};

export type DashboardMarginCoverage = {
  state: 'READY' | 'PARTIAL' | 'UNKNOWN';
  fullMarginPercent: number | null;
  fullGrossProfit: number | null;
  partialMarginPercent: number | null;
  partialGrossProfit: number | null;
  coveredRevenue: number;
  coveredOperations: number;
  totalRevenue: number;
  totalOperations: number;
};

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  periodLabel: string;
  skuGrouping: DashboardSkuGrouping;
  selectedStoreIds: string[];
  selectedCategoryIds: string[];
  selectedNoSalesDays: AssortmentNoSalesWindow;
  selectedAssortmentAsOf: string;
  visitBinding: DashboardVisitBinding;
  periodFrom: string;
  periodTo: string;
  totalSku: number;
  activeSku: number;
  categoriesCount: number;
  suppliersCount: number;
  averageMarginPercent: number;
  averageFacing: number;
  totalRevenue: number;
  clubRevenue: number;
  unallocatedTopupRevenue: number;
  revenueBreakdown: DashboardRevenueBreakdown;
  revenueSnapshot: DashboardRevenueSnapshot;
  revenueDataQuality: DashboardRevenueDataQuality;
  fullDayRevenueDate: string;
  fullDayRevenue: number;
  averageDailyRevenue: number;
  fullDayRevenueToAveragePercent: number | null;
  writeOffRevenuePercent: number | null;
  previousWriteOffRevenuePercent: number | null;
  writeOffRevenuePercentDelta: number | null;
  previousAdjustedGrossProfit: number | null;
  adjustedGrossProfitToPreviousPercent: number | null;
  grossProfit: number | null;
  adjustedGrossProfit: number | null;
  marginPercent: number | null;
  adjustedMarginPercent: number | null;
  marginCoverage: DashboardMarginCoverage;
  soldQuantity: number;
  writeOffAmount: number;
  returnAmount: number;
  stockQuantity: number;
  outOfStockRiskCount: number;
  recommendedOrderQuantity: number;
  assortmentGrowth: DashboardAssortmentGrowth;
  storeRevenueBreakdown: DashboardStoreRevenueMetric[];
  salesTrend: DashboardSalesTrendSegment[];
  categoryAnalytics: DashboardCategoryMetric[];
  topSkuByRevenue: DashboardTopSku[];
  assortmentHealth?: AssortmentHealth['summary'];
};

export type DashboardRevenueDiagnosticsTypeBreakdown = {
  type: string;
  count: number;
  amount: number;
};

export type DashboardRevenueDiagnosticsUnallocatedTopups = {
  amount: number;
  count: number;
  breakdown: DashboardRevenueDiagnosticsTypeBreakdown[];
};

export type DashboardRevenueDiagnosticsScenario = {
  key: string;
  title: string;
  amount: number;
  formula: string;
  description: string;
  includes: string[];
  excludes: string[];
  recommendation: 'PRIMARY' | 'CHECK' | 'EXCLUDED';
};

export type DashboardRevenueDiagnosticsSourceMetric = {
  key: string;
  title: string;
  endpoint: string;
  amount: number | null;
  count: number | null;
  includedInNetworkRevenue: boolean;
  includedInClubRevenue: boolean;
  role: 'PRIMARY' | 'CONTROL' | 'EXCLUDED';
  note: string;
};

export type DashboardRevenueDiagnosticsRow = {
  storeId: string;
  storeName: string;
  productRevenue: number;
  productSalesCount: number;
  productGuests: number;
  operationPlusAmount: number;
  operationMinusAmount: number;
  operationNetAmount: number;
  operationPlusCount: number;
  operationMinusCount: number;
  operationOtherAmount: number;
  operationOtherCount: number;
  transactionPositiveAmount: number;
  transactionNegativeAmount: number;
  transactionSpendAmount: number;
  transactionNetAmount: number;
  transactionCount: number;
  transactionGuests: number;
  sessionsCount: number;
  activeGuests: number;
  shiftsCount: number;
  shiftCashAmount: number;
  shiftCashlessAmount: number;
  shiftMobilePayAmount: number;
  shiftRefundAmount: number;
  shiftRevenueCandidate: number;
  balanceSpendRevenueCandidate: number;
  operationTypes: DashboardRevenueDiagnosticsTypeBreakdown[];
  transactionTypes: DashboardRevenueDiagnosticsTypeBreakdown[];
  notes: string[];
};

export type DashboardRevenueDiagnostics = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  selectedStoreIds: string[];
  revenueSnapshot: DashboardRevenueSnapshot;
  rows: DashboardRevenueDiagnosticsRow[];
  totals: Omit<
    DashboardRevenueDiagnosticsRow,
    'storeId' | 'storeName' | 'notes'
  >;
  unallocatedTopups: DashboardRevenueDiagnosticsUnallocatedTopups;
  revenueScenarios: DashboardRevenueDiagnosticsScenario[];
  sourceMetrics: DashboardRevenueDiagnosticsSourceMetric[];
  interpretation: {
    primaryRecommendation: string;
    mobileTopupRule: string;
    limitations: string[];
  };
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly assortmentHealthLoader: AssortmentHealthLoaderService,
  ) {}

  async getExecutiveProductRevenue(
    user: AuthenticatedUser,
    query: DashboardExecutiveProductRevenueQuery = {},
  ): Promise<DashboardExecutiveProductRevenue> {
    const requestedStoreIds = this.resolveStoreIds(query.storeIds);
    const { tenantId, tenantSlug, effectiveStoreIds } =
      await this.freshStoreScopeService.resolveRequestedStoreIds(
        user,
        requestedStoreIds,
      );
    const period = this.resolvePeriod(query);
    const candidateStoreFilter = effectiveStoreIds
      ? { id: { in: [...effectiveStoreIds] } }
      : {};
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId,
        isActive: true,
        ...candidateStoreFilter,
      },
      select: { id: true, name: true, timeZone: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    const activeStores = stores.filter((store) => store.isActive !== false);
    const selectedStoreIds = activeStores.map((store) => store.id);
    const storeTimeZones = Object.fromEntries(
      activeStores.map((store) => [store.id, store.timeZone?.trim() || 'UTC']),
    );
    const timeZones = [...new Set(Object.values(storeTimeZones))];
    const scopeTimeZone = timeZones.length === 1 ? timeZones[0] : 'PER_STORE';
    const asOf = this.resolveAssortmentAsOf(query.asOf);
    const [salesFacts, salesCoverage] = await Promise.all([
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          storeId: { in: selectedStoreIds },
          saleDate: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          revenue: true,
          saleDate: true,
          isCanceled: true,
        },
      }),
      this.assortmentHealthLoader.loadSalesCoverage({
        tenantId,
        storeIds: selectedStoreIds,
        period: { from: period.fromDate, to: period.toDate },
      }),
    ]);
    const businessDays = this.executiveDaysInclusive(
      period.fromDate,
      period.toDate,
    ).map((date) => this.toDateInputValue(date));
    const evidenceByStoreDay = new Map(
      salesCoverage.salesDayEvidence.map((item) => [
        `${item.storeId}:${this.toDateInputValue(item.date)}`,
        item.status,
      ]),
    );
    const scopedEvidence = activeStores.flatMap((store) =>
      businessDays.map((date) => {
        const status = evidenceByStoreDay.get(`${store.id}:${date}`);
        return {
          storeId: store.id,
          date,
          status: status ?? ('MISSING' as const),
        };
      }),
    );
    const coverageFor = (evidence: typeof scopedEvidence) => {
      const covered = evidence.filter(
        (item) => item.status === 'CONFIRMED',
      ).length;
      const total = evidence.length;
      return {
        covered,
        total,
        percent: total > 0 ? this.round((covered / total) * 100) : null,
        basis: 'STORE_DAYS' as const,
      };
    };
    const stateFor = (
      coverage: ReturnType<typeof coverageFor>,
      evidence: typeof scopedEvidence,
    ) => {
      if (coverage.total === 0) return 'MISSING' as const;
      if (coverage.covered === coverage.total) return 'AVAILABLE' as const;
      if (coverage.covered > 0) return 'PARTIAL' as const;
      return evidence.some((item) => item.status === 'FAILED')
        ? ('FAILED' as const)
        : ('MISSING' as const);
    };
    const coverage = coverageFor(scopedEvidence);
    const state = stateFor(coverage, scopedEvidence);
    const confirmedStoreDays = new Set(
      scopedEvidence
        .filter((item) => item.status === 'CONFIRMED')
        .map((item) => `${item.storeId}:${item.date}`),
    );
    const revenueByStore = new Map<
      string,
      { revenue: number; count: number }
    >();

    const selectedStoreIdSet = new Set(selectedStoreIds);
    const confirmedSalesFacts = salesFacts.filter(
      (fact) =>
        !fact.isCanceled &&
        selectedStoreIdSet.has(fact.storeId) &&
        confirmedStoreDays.has(
          `${fact.storeId}:${this.toDateInputValue(fact.saleDate)}`,
        ),
    );
    confirmedSalesFacts.forEach((fact) => {
      const current = revenueByStore.get(fact.storeId) ?? {
        revenue: 0,
        count: 0,
      };
      current.revenue += fact.revenue.toNumber();
      current.count += 1;
      revenueByStore.set(fact.storeId, current);
    });

    const hasVisibleValue = state === 'AVAILABLE' || state === 'PARTIAL';
    const totalRevenue = this.round(
      [...revenueByStore.values()].reduce(
        (total, row) => total + row.revenue,
        0,
      ),
    );
    const latestFactAt = confirmedSalesFacts.reduce<Date | null>(
      (latest, fact) =>
        !latest || fact.saleDate > latest ? fact.saleDate : latest,
      null,
    );
    const productMetric = (input: {
      value: number | null;
      state: typeof state;
      coverage: typeof coverage;
      factAsOf: string | null;
    }): DashboardExecutiveProductRevenue['metric'] => ({
      key: 'productRevenue',
      label: 'Товарная выручка',
      unit: 'RUB',
      definition:
        'Сумма подтверждённых товарных продаж выбранных клубов и периода; отмены исключены.',
      grain: 'PRODUCT_SALE_OPERATION',
      value: input.value,
      state: input.state,
      reason:
        input.state === 'FAILED'
          ? 'Продажи за выбранный период недоступны: синхронизация источника завершилась ошибкой.'
          : input.state === 'MISSING'
            ? 'Нет подтверждённого покрытия продаж за выбранный период.'
            : input.state === 'PARTIAL'
              ? `Продажи подтверждены для ${input.coverage.covered} из ${input.coverage.total} клубо-дней.`
              : input.value === 0
                ? 'За выбранный период подтверждённых товарных продаж не было.'
                : null,
      coverage: input.coverage,
      factAsOf: input.factAsOf,
      lastCalculatedAt: new Date().toISOString(),
      comparison: null,
      ratio: null,
      destination: 'CLUBS',
    });

    return {
      scope: {
        period: {
          from: this.toDateInputValue(period.fromDate),
          to: this.toDateInputValue(period.toDate),
          timezone: scopeTimeZone,
        },
        storeIds: selectedStoreIds,
        storeTimeZones,
        comparison: null,
        asOf: asOf.toISOString(),
      },
      grain: 'CLUB',
      tenantId,
      tenantSlug,
      periodFrom: period.fromDate.toISOString(),
      periodTo: period.toDate.toISOString(),
      selectedStoreIds,
      metric: productMetric({
        value: hasVisibleValue ? totalRevenue : null,
        state,
        coverage,
        factAsOf: latestFactAt?.toISOString() ?? null,
      }),
      rows: activeStores
        .map((store) => {
          const rowEvidence = scopedEvidence.filter(
            (item) => item.storeId === store.id,
          );
          const rowCoverage = coverageFor(rowEvidence);
          const rowState = stateFor(rowCoverage, rowEvidence);
          const rowValue = revenueByStore.get(store.id) ?? {
            revenue: 0,
            count: 0,
          };
          const rowFacts = confirmedSalesFacts.filter(
            (fact) => fact.storeId === store.id,
          );
          const rowHasVisibleValue =
            rowState === 'AVAILABLE' || rowState === 'PARTIAL';
          return {
            storeId: store.id,
            storeName: store.name,
            revenue: rowHasVisibleValue ? this.round(rowValue.revenue) : null,
            saleOperationCount: rowHasVisibleValue ? rowValue.count : null,
            metric: productMetric({
              value: rowHasVisibleValue ? this.round(rowValue.revenue) : null,
              state: rowState,
              coverage: rowCoverage,
              factAsOf:
                rowFacts
                  .reduce<Date | null>(
                    (latest, fact) =>
                      !latest || fact.saleDate > latest
                        ? fact.saleDate
                        : latest,
                    null,
                  )
                  ?.toISOString() ?? null,
            }),
          };
        })
        .sort(
          (first, second) =>
            (second.revenue ?? -1) - (first.revenue ?? -1) ||
            first.storeName.localeCompare(second.storeName, 'ru'),
        ),
    };
  }

  async getExecutiveSummary(
    user: AuthenticatedUser,
    query: DashboardExecutiveQuery = {},
  ): Promise<DashboardExecutiveSummary> {
    const product = await this.getExecutiveProductRevenue(user, query);
    const now = new Date().toISOString();
    const comparisonPeriod =
      query.comparison === false || query.comparison === 'false'
        ? null
        : this.executivePreviousPeriod(product.scope.period);
    const previousProduct = comparisonPeriod
      ? await this.getExecutiveProductRevenue(user, {
          period: 'custom',
          dateFrom: comparisonPeriod.from,
          dateTo: comparisonPeriod.to,
          storeIds: product.scope.storeIds,
          asOf: query.asOf,
        })
      : null;
    const storeIds = product.scope.storeIds;
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: product.tenantId,
        id: { in: storeIds },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        externalDomain: true,
        externalClubId: true,
        timeZone: true,
        isActive: true,
      },
    });
    const sessionFrom = new Date(
      `${comparisonPeriod?.from ?? product.scope.period.from}T00:00:00.000Z`,
    );
    sessionFrom.setUTCHours(sessionFrom.getUTCHours() - 14);
    const sessionTo = new Date(`${product.scope.period.to}T23:59:59.999Z`);
    sessionTo.setUTCHours(sessionTo.getUTCHours() + 14);
    const sessions = await this.prisma.guestSession.findMany({
      where: {
        tenantId: product.tenantId,
        startedAt: {
          gte: sessionFrom,
          lte: sessionTo,
        },
      },
      select: {
        id: true,
        storeId: true,
        externalProvider: true,
        externalDomain: true,
        externalClubId: true,
        externalSessionId: true,
        guestId: true,
        externalGuestId: true,
        startedAt: true,
      },
    });
    const sessionsWithStartedAt = sessions.filter(
      (session): session is typeof session & { startedAt: Date } =>
        session.startedAt !== null,
    );
    const visitsFor = (
      period: { from: string; to: string },
      storeId?: string,
    ) =>
      this.executiveVisitsMetricForScope({
        sessions: sessionsWithStartedAt,
        tenantId: product.tenantId,
        topology: stores,
        selectedStoreIds: storeId === undefined ? storeIds : [storeId],
        storeTimeZones: product.scope.storeTimeZones,
        period,
        now,
      });
    const metricsFor = (
      productMetric: ExecutiveMetric,
      visitsMetric: ExecutiveMetric,
    ): ExecutiveMetrics => {
      const services = this.executiveUnavailableMetric(
        'serviceRevenue',
        'RUB',
        'Оказанные услуги, классифицированные доказанным непересекающимся источником.',
        'SERVICE_OPERATION',
        'Нет подтверждённого словаря сохранённых операций для классификации оказанных услуг.',
        now,
      );
      const topups = this.executiveUnavailableMetric(
        'topups',
        'RUB',
        'Пополнения, отдельно от выручки.',
        'TOPUP_OPERATION',
        'Нет подтверждённого непересекающегося источника пополнений для выбранной выборки.',
        now,
      );
      const combined = aggregateExecutiveRevenue([
        {
          kind: 'PRODUCT',
          value: productMetric.value,
          state: productMetric.state,
        },
        { kind: 'SERVICE', value: services.value, state: services.state },
      ]);
      const revenue = this.executiveMetric({
        key: 'revenue',
        unit: 'RUB',
        definition:
          'Непересекающиеся подтверждённые услуги и товарные продажи; пополнения отдельно.',
        grain: 'REVENUE_COMPONENT',
        value: combined.value,
        state: combined.state,
        reason:
          combined.state === 'PARTIAL'
            ? 'Показана подтверждённая товарная составляющая; услуги не классифицированы доказанным источником.'
            : 'Нет подтверждённой непересекающейся выручки за выбранный период.',
        coverage: productMetric.coverage,
        factAsOf: productMetric.factAsOf,
        lastCalculatedAt: now,
      });
      return {
        revenue,
        serviceRevenue: services,
        topups,
        visits: visitsMetric,
        revenuePerVisit: this.executiveUnavailableMetric(
          'revenuePerVisit',
          'RUB_PER_VISIT',
          'Суммарная совместимая выручка / суммарные визиты той же выборки.',
          'NETWORK_RATIO',
          'Доход на визит недоступен: общая выручка пока содержит только подтверждённую товарную часть.',
          now,
          {
            numeratorValue: revenue.value,
            denominatorValue: visitsMetric.value,
            numeratorLabel: 'Выручка',
            denominatorLabel: 'Визиты',
            compatible: false,
          },
        ),
        load: this.executiveUnavailableMetric(
          'load',
          'PERCENT',
          'Занятые часы / доступные часы тех же клубов и интервала.',
          'CAPACITY_HOURS',
          'Загрузка недоступна: исторические мощность и режим работы не подтверждены источником.',
          now,
          {
            numeratorValue: null,
            denominatorValue: null,
            numeratorLabel: 'Занятые часы',
            denominatorLabel: 'Доступные часы',
            compatible: false,
          },
        ),
        productRevenue: productMetric,
        productRevenueShare: this.executiveUnavailableMetric(
          'productRevenueShare',
          'PERCENT',
          'Товарная выручка / общая совместимая выручка.',
          'NETWORK_RATIO',
          'Доля товара недоступна: общая выручка пока содержит только подтверждённую товарную часть.',
          now,
          {
            numeratorValue: productMetric.value,
            denominatorValue: revenue.value,
            numeratorLabel: 'Товарная выручка',
            denominatorLabel: 'Выручка',
            compatible: false,
          },
        ),
      };
    };
    const comparisonFor = (
      metric: ExecutiveMetric,
      previousMetric: ExecutiveMetric | undefined,
    ) => {
      if (
        !comparisonPeriod ||
        !previousMetric ||
        !this.executiveMetricsComparable(metric, previousMetric)
      ) {
        return null;
      }
      const delta = compareExecutiveValues(metric.value, previousMetric.value);
      return {
        previousValue: previousMetric.value,
        absoluteDelta: delta.absoluteDelta,
        percentDelta: delta.percentDelta,
        pointsDelta: null,
      };
    };
    const withComparisons = (
      current: ExecutiveMetrics,
      previous: ExecutiveMetrics | null,
    ): ExecutiveMetrics => ({
      ...current,
      revenue: {
        ...current.revenue,
        comparison: comparisonFor(current.revenue, previous?.revenue),
      },
      visits: {
        ...current.visits,
        comparison: comparisonFor(current.visits, previous?.visits),
      },
      productRevenue: {
        ...current.productRevenue,
        comparison: comparisonFor(
          current.productRevenue,
          previous?.productRevenue,
        ),
      },
    });
    const currentMetrics = metricsFor(
      product.metric,
      visitsFor(product.scope.period),
    );
    const previousMetrics =
      previousProduct && comparisonPeriod
        ? metricsFor(previousProduct.metric, visitsFor(comparisonPeriod))
        : null;
    const comparedMetrics = withComparisons(currentMetrics, previousMetrics);
    const allMetricDays = comparisonPeriod
      ? { from: comparisonPeriod.from, to: product.scope.period.to }
      : product.scope.period;
    const [daySalesFacts, daySalesCoverage] = await Promise.all([
      this.prisma.salesFact.findMany({
        where: {
          tenantId: product.tenantId,
          isCanceled: false,
          storeId: { in: storeIds },
          saleDate: {
            gte: new Date(`${allMetricDays.from}T00:00:00.000Z`),
            lte: new Date(`${allMetricDays.to}T23:59:59.999Z`),
          },
        },
        select: {
          storeId: true,
          revenue: true,
          saleDate: true,
          isCanceled: true,
        },
      }),
      this.assortmentHealthLoader.loadSalesCoverage({
        tenantId: product.tenantId,
        storeIds,
        period: {
          from: new Date(`${allMetricDays.from}T00:00:00.000Z`),
          to: new Date(`${allMetricDays.to}T23:59:59.999Z`),
        },
      }),
    ]);
    const currentDates = this.executiveDaysInclusive(
      new Date(`${product.scope.period.from}T00:00:00.000Z`),
      new Date(`${product.scope.period.to}T23:59:59.999Z`),
    ).map((date) => this.toDateInputValue(date));
    const previousDates = comparisonPeriod
      ? this.executiveDaysInclusive(
          new Date(`${comparisonPeriod.from}T00:00:00.000Z`),
          new Date(`${comparisonPeriod.to}T23:59:59.999Z`),
        ).map((date) => this.toDateInputValue(date))
      : [];

    return {
      scope: { ...product.scope, comparison: comparisonPeriod },
      metrics: comparedMetrics,
      clubs: product.rows.map((row) => {
        const previousRow = previousProduct?.rows.find(
          (item) => item.storeId === row.storeId,
        );
        return {
          storeId: row.storeId,
          storeName: row.storeName,
          metrics: withComparisons(
            metricsFor(
              row.metric,
              visitsFor(product.scope.period, row.storeId),
            ),
            previousRow && comparisonPeriod
              ? metricsFor(
                  previousRow.metric,
                  visitsFor(comparisonPeriod, row.storeId),
                )
              : null,
          ),
        };
      }),
      days: currentDates.map((date, index) => {
        const dayProduct = this.executiveProductMetricForDay({
          template: product.metric,
          stores: product.rows,
          storeIds,
          date,
          salesFacts: daySalesFacts,
          salesDayEvidence: daySalesCoverage.salesDayEvidence,
        });
        const previousDayProduct = comparisonPeriod
          ? this.executiveProductMetricForDay({
              template: previousProduct!.metric,
              stores: previousProduct!.rows,
              storeIds,
              date: previousDates[index],
              salesFacts: daySalesFacts,
              salesDayEvidence: daySalesCoverage.salesDayEvidence,
            })
          : null;
        return {
          date,
          metrics: withComparisons(
            metricsFor(dayProduct, visitsFor({ from: date, to: date })),
            previousDayProduct && comparisonPeriod
              ? metricsFor(
                  previousDayProduct,
                  visitsFor({
                    from: previousDates[index],
                    to: previousDates[index],
                  }),
                )
              : null,
          ),
        };
      }),
    };
  }

  async getExecutiveOperations(
    user: AuthenticatedUser,
    query: DashboardExecutiveQuery = {},
  ): Promise<DashboardExecutiveOperations> {
    const product = await this.getExecutiveProductRevenue(user, query);
    const comparison =
      query.comparison === false || query.comparison === 'false'
        ? null
        : this.executivePreviousPeriod(product.scope.period);
    try {
      const data = await this.assortmentHealthLoader.load({
        tenantId: product.tenantId,
        storeIds: product.scope.storeIds,
        categoryIds: null,
        period: {
          from: new Date(`${product.scope.period.from}T00:00:00.000Z`),
          to: new Date(`${product.scope.period.to}T23:59:59.999Z`),
        },
        asOf: new Date(product.scope.asOf),
      });
      return {
        scope: { ...product.scope, comparison },
        assortment: { state: 'AVAILABLE', reason: null, data: data.health },
      };
    } catch {
      return {
        scope: { ...product.scope, comparison },
        assortment: {
          state: 'FAILED',
          reason:
            'Не удалось прочитать ассортиментные сигналы для выбранной выборки.',
          data: null,
        },
      };
    }
  }

  private executiveVisitsMetricForScope(input: {
    sessions: Array<{
      id?: string;
      storeId: string | null;
      externalProvider?: string | null;
      externalDomain: string | null;
      externalClubId: string | null;
      externalSessionId: string;
      guestId?: string | null;
      externalGuestId?: string | null;
      startedAt: Date;
    }>;
    tenantId: string;
    topology: Array<{
      id: string;
      tenantId: string;
      externalDomain: string | null;
      externalClubId: string | null;
      isActive: boolean;
    }>;
    selectedStoreIds: readonly string[];
    storeTimeZones: Record<string, string>;
    period: { from: string; to: string };
    now: string;
  }): ExecutiveMetric {
    const selectedStoreIds = new Set(input.selectedStoreIds);
    const topologyStoreIds = new Set(input.topology.map((store) => store.id));
    const sessions: typeof input.sessions = [];
    let hasUnresolvedBinding = false;

    input.sessions.forEach((session) => {
      const resolvedStoreId =
        session.storeId && topologyStoreIds.has(session.storeId)
          ? session.storeId
          : resolveGuestSessionStore({
              tenantId: input.tenantId,
              externalDomain: session.externalDomain,
              externalClubId: session.externalClubId,
              stores: input.topology,
            }).storeId;
      if (resolvedStoreId && selectedStoreIds.has(resolvedStoreId)) {
        const localDate = this.executiveLocalDate(
          session.startedAt,
          input.storeTimeZones[resolvedStoreId] ?? 'UTC',
        );
        if (localDate >= input.period.from && localDate <= input.period.to) {
          sessions.push({ ...session, storeId: resolvedStoreId });
        }
        return;
      }

      const canBelongToSelectedStore = input.topology.some(
        (store) =>
          selectedStoreIds.has(store.id) &&
          store.externalDomain !== null &&
          store.externalDomain === session.externalDomain,
      );
      if (
        canBelongToSelectedStore &&
        this.executiveTimestampMayBelongToPeriod(
          session.startedAt,
          input.period,
        )
      ) {
        hasUnresolvedBinding = true;
      }
    });

    const visitCount = this.sessionIdentityStats(sessions).visits;
    const state: ExecutiveMetric['state'] =
      visitCount > 0 ? 'PARTIAL' : 'MISSING';
    return this.executiveMetric({
      key: 'visits',
      unit: 'COUNT',
      definition:
        'Уникальные сохранённые игровые сессии, начавшиеся в выбранных локальных днях клуба.',
      grain: 'GUEST_SESSION',
      value: visitCount > 0 ? visitCount : null,
      state,
      reason:
        state === 'MISSING'
          ? hasUnresolvedBinding
            ? 'Есть сохранённые сессии без доказуемой привязки к выбранным клубам; визиты за период неизвестны.'
            : 'Нет сохранённых сессий с подтверждённой привязкой к выбранным клубам.'
          : hasUnresolvedBinding
            ? 'Показаны доказуемо привязанные сессии; часть записей не удалось отнести к выбранным клубам, а полнота источника за клубо-дни не подтверждена.'
            : 'Показаны сохранённые сессии с доказуемой привязкой; полнота источника за выбранные клубо-дни не подтверждена.',
      coverage: {
        covered: visitCount,
        total: null,
        percent: null,
        basis: 'STORE_SESSIONS',
      },
      factAsOf:
        sessions
          .reduce<Date | null>(
            (latest, session) =>
              !latest || session.startedAt > latest
                ? session.startedAt
                : latest,
            null,
          )
          ?.toISOString() ?? null,
      lastCalculatedAt: input.now,
    });
  }

  private executiveTimestampMayBelongToPeriod(
    timestamp: Date,
    period: { from: string; to: string },
  ) {
    const from = new Date(`${period.from}T00:00:00.000Z`);
    from.setUTCHours(from.getUTCHours() - 14);
    const to = new Date(`${period.to}T23:59:59.999Z`);
    to.setUTCHours(to.getUTCHours() + 14);
    return timestamp >= from && timestamp <= to;
  }

  private executiveMetricsComparable(
    current: ExecutiveMetric,
    previous: ExecutiveMetric,
  ) {
    if (current.value === null || previous.value === null) return false;
    if (!['AVAILABLE', 'PARTIAL'].includes(current.state)) return false;
    if (!['AVAILABLE', 'PARTIAL'].includes(previous.state)) return false;
    if (current.coverage === null || previous.coverage === null) {
      return current.coverage === previous.coverage;
    }
    if (
      current.coverage.total === null ||
      previous.coverage.total === null ||
      current.coverage.percent === null ||
      previous.coverage.percent === null
    ) {
      return false;
    }
    return (
      current.coverage.basis === previous.coverage.basis &&
      current.coverage.covered === previous.coverage.covered &&
      current.coverage.total === previous.coverage.total
    );
  }

  private executiveProductMetricForDay(input: {
    template: DashboardExecutiveProductRevenue['metric'];
    stores: DashboardExecutiveProductRevenue['rows'];
    storeIds: readonly string[];
    date: string;
    salesFacts: Array<{
      storeId: string;
      revenue: { toNumber: () => number };
      saleDate: Date;
      isCanceled?: boolean;
    }>;
    salesDayEvidence: Array<{
      storeId: string;
      date: Date;
      status: 'CONFIRMED' | 'MISSING' | 'FAILED';
    }>;
  }): DashboardExecutiveProductRevenue['metric'] {
    const statuses = input.stores.map(
      (store) =>
        input.salesDayEvidence.find(
          (item) =>
            item.storeId === store.storeId &&
            this.toDateInputValue(item.date) === input.date,
        )?.status ?? 'MISSING',
    );
    const covered = statuses.filter((status) => status === 'CONFIRMED').length;
    const coverage = {
      covered,
      total: statuses.length,
      percent:
        statuses.length > 0
          ? this.round((covered / statuses.length) * 100)
          : null,
      basis: 'STORE_DAYS' as const,
    };
    const state =
      coverage.total === 0
        ? 'MISSING'
        : coverage.covered === coverage.total
          ? 'AVAILABLE'
          : coverage.covered > 0
            ? 'PARTIAL'
            : statuses.includes('FAILED')
              ? 'FAILED'
              : 'MISSING';
    const confirmedStoreIds = new Set(
      input.stores
        .filter((_, index) => statuses[index] === 'CONFIRMED')
        .map((store) => store.storeId),
    );
    const facts = input.salesFacts.filter(
      (fact) =>
        !fact.isCanceled &&
        input.storeIds.includes(fact.storeId) &&
        confirmedStoreIds.has(fact.storeId) &&
        this.toDateInputValue(fact.saleDate) === input.date,
    );
    const visible = state === 'AVAILABLE' || state === 'PARTIAL';
    const value = visible
      ? this.round(
          facts.reduce((total, fact) => total + fact.revenue.toNumber(), 0),
        )
      : null;
    const factAsOf = facts.reduce<Date | null>(
      (latest, fact) =>
        !latest || fact.saleDate > latest ? fact.saleDate : latest,
      null,
    );
    return {
      ...input.template,
      value,
      state,
      reason:
        state === 'FAILED'
          ? 'Продажи за выбранный период недоступны: синхронизация источника завершилась ошибкой.'
          : state === 'MISSING'
            ? 'Нет подтверждённого покрытия продаж за выбранный период.'
            : state === 'PARTIAL'
              ? `Продажи подтверждены для ${coverage.covered} из ${coverage.total} клубо-дней.`
              : value === 0
                ? 'За выбранный период подтверждённых товарных продаж не было.'
                : null,
      coverage,
      factAsOf: factAsOf?.toISOString() ?? null,
      comparison: null,
    };
  }

  private executiveMetric(input: {
    key: ExecutiveMetric['key'];
    unit: ExecutiveMetric['unit'];
    definition: string;
    grain: string;
    value: number | null;
    state: ExecutiveMetric['state'];
    reason: string | null;
    coverage: ExecutiveMetric['coverage'];
    factAsOf: string | null;
    lastCalculatedAt: string;
    ratio?: ExecutiveMetric['ratio'];
    destination?: ExecutiveMetric['destination'];
  }): ExecutiveMetric {
    return {
      ...input,
      comparison: null,
      ratio: input.ratio ?? null,
    };
  }

  private executiveUnavailableMetric(
    key: ExecutiveMetric['key'],
    unit: ExecutiveMetric['unit'],
    definition: string,
    grain: string,
    reason: string,
    lastCalculatedAt: string,
    ratio: ExecutiveMetric['ratio'] = null,
  ): ExecutiveMetric {
    return this.executiveMetric({
      key,
      unit,
      definition,
      grain,
      value: null,
      state: 'MISSING',
      reason,
      coverage: null,
      factAsOf: null,
      lastCalculatedAt,
      ratio,
    });
  }

  private executiveLocalDate(value: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  private executivePreviousPeriod(period: { from: string; to: string }) {
    const from = new Date(`${period.from}T00:00:00.000Z`);
    const to = new Date(`${period.to}T00:00:00.000Z`);
    const durationDays = Math.round(
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
    );
    const previousTo = new Date(from);
    previousTo.setUTCDate(previousTo.getUTCDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setUTCDate(previousFrom.getUTCDate() - durationDays);
    return {
      from: this.toDateInputValue(previousFrom),
      to: this.toDateInputValue(previousTo),
    };
  }

  async getSummary(
    user: AuthenticatedUser,
    query: DashboardQuery = {},
  ): Promise<DashboardSummary> {
    const requestedStoreIds = this.resolveStoreIds(query.storeIds);
    const requestedCategoryIds = this.resolveCategoryIds(query.categoryIds);
    const { tenantId, tenantSlug, effectiveStoreIds } =
      await this.freshStoreScopeService.resolveRequestedStoreIds(
        user,
        requestedStoreIds,
      );
    const period = this.resolvePeriod(query);
    const assortmentAsOf = this.resolveAssortmentAsOf(query.asOf);
    const selectedNoSalesDays = this.resolveNoSalesDays(query.noSalesDays);
    const selectedStoreIds = effectiveStoreIds ? [...effectiveStoreIds] : [];
    const selectedCategoryIds = requestedCategoryIds
      ? [...requestedCategoryIds]
      : [];
    const storeFilter = effectiveStoreIds
      ? { storeId: { in: [...effectiveStoreIds] } }
      : {};
    const productVisibility = this.productVisibility(effectiveStoreIds);
    const productCategoryFilter: Prisma.ProductWhereInput =
      selectedCategoryIds.length > 0
        ? { categoryId: { in: selectedCategoryIds } }
        : {};
    const relatedProductCategoryFilter =
      selectedCategoryIds.length > 0
        ? { product: { categoryId: { in: selectedCategoryIds } } }
        : {};
    const skuGrouping = query.skuGrouping === 'club' ? 'club' : 'network';
    const demandPeriod = this.resolveDemandPeriod();
    const activeSkuPeriod = this.resolveActiveSkuPeriod();
    const fullDayPeriod = this.resolveFullDayRevenuePeriod();
    const previousPeriod = this.resolvePreviousComparablePeriod(
      period.fromDate,
      period.toDate,
      period.mode,
    );
    const forecastHistoryPeriod = this.resolveForecastHistoryPeriod(
      period.toDate,
    );
    const assortmentHealthPromise = this.assortmentHealthLoader.load({
      tenantId,
      storeIds: effectiveStoreIds,
      categoryIds: requestedCategoryIds ?? null,
      period: { from: period.fromDate, to: period.toDate },
      asOf: assortmentAsOf,
      coveragePeriod: {
        from: forecastHistoryPeriod.fromDate,
        to: forecastHistoryPeriod.toDate,
      },
    });
    const tenantStoreTopologyPromise = this.prisma.store.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        tenantId: true,
        externalDomain: true,
        externalClubId: true,
        isActive: true,
      },
    });

    const [
      tenant,
      storesForRevenue,
      totalSku,
      categoriesCount,
      suppliersCount,
      productsForAverages,
      salesFacts,
      trendSalesFacts,
      demandSalesFacts,
      activeSkuSalesFacts,
      inventorySnapshots,
      currentInventorySnapshots,
      stockMovements,
      rawPeriodGuestSessions,
      rawTrendGuestSessions,
      rawPreviousGuestSessions,
      periodGuestTransactions,
      periodGuestOperationLogs,
      fullDayRevenueFacts,
      previousSalesFacts,
      previousStockMovements,
      forecastSalesFacts,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.store.findMany({
        where: {
          tenantId,
          ...(selectedStoreIds.length > 0
            ? { id: { in: selectedStoreIds } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          externalClubId: true,
        },
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.product.count({
        where: { tenantId, ...productVisibility, ...productCategoryFilter },
      }),
      this.prisma.category.count({
        where: {
          tenantId,
          ...(selectedCategoryIds.length > 0
            ? { id: { in: selectedCategoryIds } }
            : {}),
          ...(effectiveStoreIds
            ? {
                products: {
                  some: { ...productVisibility, ...productCategoryFilter },
                },
              }
            : {}),
        },
      }),
      this.prisma.supplier.count({
        where: {
          tenantId,
          ...(effectiveStoreIds || selectedCategoryIds.length > 0
            ? {
                products: {
                  some: { ...productVisibility, ...productCategoryFilter },
                },
              }
            : {}),
        },
      }),
      this.prisma.product.findMany({
        where: {
          tenantId,
          isActive: true,
          ...productVisibility,
          ...productCategoryFilter,
        },
        select: {
          id: true,
          article: true,
          name: true,
          purchasePrice: true,
          salePrice: true,
          facing: true,
          updatedAt: true,
          categoryId: true,
          category: {
            select: {
              name: true,
            },
          },
          supplier: {
            select: {
              orderMultiplicity: true,
            },
          },
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: period.fromDate,
            lte: period.toDate,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              article: true,
              name: true,
              categoryId: true,
              category: {
                select: {
                  name: true,
                },
              },
              canonicalProduct: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: this.noSalesTrendFromDate(period.trendFromDate),
            lte: period.trendToDate,
          },
        },
        select: {
          productId: true,
          saleDate: true,
          quantity: true,
          revenue: true,
          cost: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: demandPeriod.fromDate,
            lte: demandPeriod.toDate,
          },
        },
        select: {
          productId: true,
          quantity: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: activeSkuPeriod.fromDate,
            lte: activeSkuPeriod.toDate,
          },
        },
        select: {
          productId: true,
        },
        distinct: ['productId'],
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          snapshotDate: {
            lte: period.toDate,
          },
          updatedAt: { lte: assortmentAsOf },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          updatedAt: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          snapshotDate: {
            lte: activeSkuPeriod.toDate,
          },
          updatedAt: { lte: assortmentAsOf },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          updatedAt: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          movementDate: {
            gte: period.fromDate,
            lte: period.toDate,
          },
        },
        select: {
          type: true,
          amount: true,
        },
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          startedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          id: true,
          storeId: true,
          externalProvider: true,
          externalDomain: true,
          externalClubId: true,
          externalSessionId: true,
          guestId: true,
          externalGuestId: true,
          startedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          startedAt: {
            gte: period.trendFromDate,
            lte: period.trendToDate,
          },
        },
        select: {
          id: true,
          storeId: true,
          externalProvider: true,
          externalDomain: true,
          externalClubId: true,
          externalSessionId: true,
          startedAt: true,
        },
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          startedAt: {
            gte: previousPeriod.fromDate,
            lte: previousPeriod.toDate,
          },
        },
        select: {
          id: true,
          storeId: true,
          externalProvider: true,
          externalDomain: true,
          externalClubId: true,
          externalSessionId: true,
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...storeFilter,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          externalProvider: true,
          externalDomain: true,
          externalClubId: true,
          guestId: true,
          externalGuestId: true,
          type: true,
          amount: true,
        },
      }),
      this.prisma.guestOperationLog.findMany({
        where: {
          tenantId,
          ...storeFilter,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          externalClubId: true,
          type: true,
          operationSource: true,
          operationForm: true,
          amount: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: fullDayPeriod.averageFromDate,
            lte: fullDayPeriod.currentToDate,
          },
        },
        select: {
          saleDate: true,
          revenue: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: previousPeriod.fromDate,
            lte: previousPeriod.toDate,
          },
        },
        select: {
          revenue: true,
          cost: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          movementDate: {
            gte: previousPeriod.fromDate,
            lte: previousPeriod.toDate,
          },
        },
        select: {
          type: true,
          amount: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: forecastHistoryPeriod.fromDate,
            lte: forecastHistoryPeriod.toDate,
          },
        },
        select: {
          saleDate: true,
          revenue: true,
        },
      }),
    ]);

    const tenantStoreTopology = await tenantStoreTopologyPromise;
    const periodVisits = this.resolveScopedGuestSessions(
      rawPeriodGuestSessions,
      tenantId,
      tenantStoreTopology,
      effectiveStoreIds,
    );
    const trendVisits = this.resolveScopedGuestSessions(
      rawTrendGuestSessions,
      tenantId,
      tenantStoreTopology,
      effectiveStoreIds,
    );
    const previousVisits = this.resolveScopedGuestSessions(
      rawPreviousGuestSessions,
      tenantId,
      tenantStoreTopology,
      effectiveStoreIds,
    );
    const periodGuestSessions = periodVisits.sessions;
    const trendGuestSessions = trendVisits.sessions;
    const previousGuestSessions = previousVisits.sessions;

    const [
      periodGuestWorkingShifts,
      exactRevenueSnapshot,
      latestRevenueSnapshot,
    ] = await Promise.all([
      this.prisma.guestWorkingShift.findMany({
        where: {
          tenantId,
          ...storeFilter,
          startedAt: { lte: period.toDate },
          OR: [{ stoppedAt: null }, { stoppedAt: { gte: period.fromDate } }],
        },
        select: {
          cashAmount: true,
          cashlessAmount: true,
          mobilePay: true,
          refundsCash: true,
          refundsCashless: true,
        },
      }),
      effectiveStoreIds === null
        ? this.prisma.businessSnapshotRun.findFirst({
            where: {
              tenantId,
              type: 'REVENUE',
              status: { in: ['SUCCESS', 'EMPTY'] },
              periodFrom: period.fromDate,
              periodTo: period.toDate,
            },
            orderBy: { startedAt: 'desc' },
            select: {
              status: true,
              finishedAt: true,
              periodFrom: true,
              periodTo: true,
              sourceCounts: true,
              summary: true,
            },
          })
        : Promise.resolve(null),
      effectiveStoreIds === null
        ? this.prisma.businessSnapshotRun.findFirst({
            where: {
              tenantId,
              type: 'REVENUE',
            },
            orderBy: { startedAt: 'desc' },
            select: {
              status: true,
              finishedAt: true,
              periodFrom: true,
              periodTo: true,
              sourceCounts: true,
              summary: true,
            },
          })
        : Promise.resolve(null),
    ]);

    let averageMarginPercent = 0;
    let averageFacing = 0;

    if (productsForAverages.length > 0) {
      const marginSum = productsForAverages.reduce((sum, p) => {
        const purchase = p.purchasePrice.toNumber();
        const sale = p.salePrice.toNumber();
        if (!sale || sale <= 0) {
          return sum;
        }
        return sum + ((sale - purchase) / sale) * 100;
      }, 0);
      averageMarginPercent = marginSum / productsForAverages.length;

      const facingSum = productsForAverages.reduce(
        (sum, p) => sum + p.facing,
        0,
      );
      averageFacing = facingSum / productsForAverages.length;
    }

    const salesByProduct = new Map<string, DashboardTopSku>();
    const networkSkuKeyByName = new Map<string, string>();
    const networkSkuKeyByArticle = new Map<string, string>();
    const soldByProduct = new Map<string, number>();
    let totalRevenue = 0;
    let totalCost = 0;
    let soldQuantity = 0;

    salesFacts.forEach((fact) => {
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();
      const skuKey =
        skuGrouping === 'network'
          ? fact.product.canonicalProduct
            ? `canonical:${fact.product.canonicalProduct.id}`
            : this.resolveNetworkSkuKey(
                fact.product.name,
                fact.product.article,
                networkSkuKeyByName,
                networkSkuKeyByArticle,
              )
          : `${fact.store.id}:${fact.productId}`;
      const current = salesByProduct.get(skuKey) ?? {
        productId: skuGrouping === 'network' ? skuKey : fact.product.id,
        article: fact.product.article,
        name:
          skuGrouping === 'network'
            ? (fact.product.canonicalProduct?.name ?? fact.product.name)
            : fact.product.name,
        isCanonical: Boolean(fact.product.canonicalProduct),
        canonicalProductName: fact.product.canonicalProduct?.name ?? null,
        storeId: skuGrouping === 'network' ? null : fact.store.id,
        storeName: skuGrouping === 'network' ? null : fact.store.name,
        revenue: 0,
        grossProfit: 0,
        soldQuantity: 0,
      };

      current.revenue += revenue;
      current.grossProfit += revenue - cost;
      current.soldQuantity += quantity;
      salesByProduct.set(skuKey, current);
      soldByProduct.set(
        fact.productId,
        (soldByProduct.get(fact.productId) ?? 0) + quantity,
      );

      totalRevenue += revenue;
      totalCost += cost;
      soldQuantity += quantity;
    });

    const movementImpact = this.stockMovementImpact(stockMovements);
    const grossProfit = totalRevenue - totalCost;
    const marginCoverage = this.buildMarginCoverage(
      salesFacts.map((fact) => ({
        revenue: fact.revenue.toNumber(),
        cost: fact.cost.toNumber(),
      })),
    );
    const adjustedGrossProfit =
      grossProfit - movementImpact.writeOffAmount - movementImpact.returnAmount;
    const stockByProduct = this.latestStockByProduct(inventorySnapshots);
    const currentStockByProduct = this.latestStockByProduct(
      currentInventorySnapshots,
    );
    const activeProductIds = this.operationalActiveProductIds(
      productsForAverages,
      currentStockByProduct,
      activeSkuSalesFacts,
    );
    const demandSoldByProduct = this.soldQuantityByProduct(demandSalesFacts);
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const salesTrend = this.buildSalesTrend(
      trendSalesFacts,
      trendGuestSessions,
      period.trendFromDate,
      period.trendToDate,
      period.labelGranularity,
      period.trendMode,
      productsForAverages,
      inventorySnapshots,
    );
    const demand = productsForAverages
      .filter((product) => activeProductIds.has(product.id))
      .map((product) => {
        const sold = demandSoldByProduct.get(product.id) ?? 0;
        const averageDailySales = sold / DEMAND_PERIOD_DAYS;
        const hasStockSnapshot = stockByProduct.has(product.id);
        const stock = stockByProduct.get(product.id) ?? 0;

        return {
          productId: product.id,
          productName: product.name,
          hasStockSnapshot,
          stock,
          salePrice: product.salePrice.toNumber(),
          purchasePrice: product.purchasePrice.toNumber(),
          averageDailySales,
          stockDays:
            hasStockSnapshot && averageDailySales > 0
              ? stock / averageDailySales
              : null,
          recommendedOrder: hasStockSnapshot
            ? this.recommendedOrder(
                Math.max(0, averageDailySales * FORECAST_HORIZON_DAYS - stock),
                product.supplier?.orderMultiplicity ?? null,
              )
            : 0,
          forecastLostUnits: hasStockSnapshot
            ? Math.max(
                0,
                averageDailySales * FORECAST_HORIZON_DAYS - Math.max(0, stock),
              )
            : 0,
        };
      });
    const fullDayRevenue = this.fullDayRevenueComparison(
      fullDayRevenueFacts,
      fullDayPeriod,
    );
    const balanceTopupRevenue = this.guestOperationTopupTotal(
      periodGuestOperationLogs,
    );
    const revenueBreakdown = this.buildDashboardRevenueBreakdown({
      productRevenue: totalRevenue,
      balanceOperationRevenue: this.guestOperationRevenueTotal(
        periodGuestOperationLogs,
      ),
      transactionSpendRevenue: this.guestTransactionTotal(
        periodGuestTransactions,
      ),
      unallocatedTopupRevenue: balanceTopupRevenue,
      shiftCashRevenue: this.shiftCashRevenueTotal(periodGuestWorkingShifts),
      productSalesCount: salesFacts.length,
      operationLogs: periodGuestOperationLogs,
      transactions: periodGuestTransactions,
      workingShifts: periodGuestWorkingShifts,
      exactSnapshot: exactRevenueSnapshot,
    });
    const clubRevenue = revenueBreakdown.networkRevenue;
    const revenueSnapshot = this.buildDashboardRevenueSnapshot(
      exactRevenueSnapshot ?? latestRevenueSnapshot,
      period.fromDate,
      period.toDate,
    );
    const revenueDataQuality = this.buildDashboardRevenueDataQuality(
      revenueBreakdown,
      revenueSnapshot,
    );
    const storeRevenueBreakdown = this.buildStoreRevenueBreakdown(
      storesForRevenue,
      salesFacts,
      periodGuestSessions,
      periodGuestTransactions,
      periodGuestOperationLogs,
    );
    const averageDailyRevenue = fullDayRevenue.average;
    const previousRevenue = previousSalesFacts.reduce(
      (sum, fact) => sum + fact.revenue.toNumber(),
      0,
    );
    const previousGrossProfit = previousSalesFacts.reduce(
      (sum, fact) => sum + fact.revenue.toNumber() - fact.cost.toNumber(),
      0,
    );
    const previousMovementImpact = this.stockMovementImpact(
      previousStockMovements,
    );
    const previousAdjustedGrossProfit =
      previousGrossProfit -
      previousMovementImpact.writeOffAmount -
      previousMovementImpact.returnAmount;
    const previousMarginCoverage = this.buildMarginCoverage(
      previousSalesFacts.map((fact) => ({
        revenue: fact.revenue.toNumber(),
        cost: fact.cost.toNumber(),
      })),
    );
    const writeOffRevenuePercent = this.ratioPercent(
      movementImpact.writeOffAmount,
      totalRevenue,
    );
    const previousWriteOffRevenuePercent = this.ratioPercent(
      previousMovementImpact.writeOffAmount,
      previousRevenue,
    );
    const categoryAnalytics = this.buildCategoryAnalytics(
      productsForAverages,
      activeProductIds,
      salesFacts,
      totalRevenue,
      grossProfit,
    );
    const currentVisitStats = this.sessionIdentityStats(periodGuestSessions);
    const previousVisitStats = this.sessionIdentityStats(previousGuestSessions);
    const outOfStockRiskCount = demand.filter(
      (item) =>
        item.hasStockSnapshot &&
        item.averageDailySales > 0 &&
        item.stockDays !== null &&
        item.stockDays <= 3,
    ).length;
    const stockTrackedSkuCount = demand.filter(
      (item) => item.hasStockSnapshot,
    ).length;
    const costedSaleOperationCount = salesFacts.filter(
      (fact) => fact.revenue.toNumber() <= 0 || fact.cost.toNumber() > 0,
    ).length;
    const stockCoveragePercent =
      activeProductIds.size > 0
        ? this.round((stockTrackedSkuCount / activeProductIds.size) * 100)
        : null;
    const coverageGaps = this.buildAssortmentCoverageGaps({
      products: productsForAverages,
      activeProductIds,
      salesFacts,
      stockTrackedSkuCount,
      totalRevenue,
    });
    const categoryCoveragePercent =
      activeProductIds.size > 0
        ? this.round(
            ((activeProductIds.size - coverageGaps.uncategorizedSkuCount) /
              activeProductIds.size) *
              100,
          )
        : null;
    const receiptMetrics = this.buildReceiptMetrics(salesFacts);
    const assortmentHealth = await assortmentHealthPromise;
    const sources = this.buildAssortmentSourceHealth({
      salesFacts,
      guestSessions: periodGuestSessions,
      inventorySnapshots: currentInventorySnapshots,
      products: productsForAverages,
      asOf: assortmentAsOf,
      sourceHealthEvidence: assortmentHealth.sourceHealthEvidence,
      saleOperationCount: salesFacts.length,
      visitCount: currentVisitStats.visits,
      costCoveragePercent:
        salesFacts.length > 0
          ? this.round((costedSaleOperationCount / salesFacts.length) * 100)
          : null,
      stockCoveragePercent,
      categoryCoveragePercent,
    });
    const forecast = this.buildAssortmentForecast({
      history: forecastSalesFacts,
      historyTo: forecastHistoryPeriod.toDate,
      confirmedSalesDays: this.confirmedSalesDays(
        assortmentHealth.salesDayEvidence,
      ),
      demand,
      salesSource: sources.find((source) => source.key === 'sales') ?? null,
      inventorySource:
        sources.find((source) => source.key === 'inventory') ?? null,
    });
    const assortmentGrowth = this.buildAssortmentGrowth({
      currentRevenue: totalRevenue,
      currentSaleOperationCount: salesFacts.length,
      currentVisitCount: currentVisitStats.visits,
      previousRevenue,
      previousSaleOperationCount: previousSalesFacts.length,
      previousVisitCount: previousVisitStats.visits,
      identifiedActiveGuests: currentVisitStats.identifiedGuests,
      identifiedVisitCount: currentVisitStats.identifiedVisits,
      activeSkuCount: activeProductIds.size,
      stockTrackedSkuCount,
      outOfStockRiskCount,
      soldQuantity,
      categoryAnalytics,
      grossProfit,
      costedSaleOperationCount,
      storeRevenueBreakdown,
      sources,
      coverageGaps,
      receiptMetrics,
      forecast,
    });
    return {
      tenantId,
      tenantSlug,
      tenantName: tenant?.name ?? tenantSlug,
      periodLabel: period.label,
      skuGrouping,
      selectedStoreIds,
      selectedCategoryIds,
      selectedNoSalesDays,
      selectedAssortmentAsOf: assortmentAsOf.toISOString(),
      visitBinding: periodVisits.binding,
      periodFrom: this.toDateInputValue(period.fromDate),
      periodTo: this.toDateInputValue(period.toDate),
      totalSku,
      activeSku: activeProductIds.size,
      categoriesCount,
      suppliersCount,
      averageMarginPercent: this.round(averageMarginPercent),
      averageFacing: this.round(averageFacing),
      totalRevenue: this.round(totalRevenue),
      clubRevenue: this.round(clubRevenue),
      unallocatedTopupRevenue: this.round(balanceTopupRevenue),
      revenueBreakdown,
      revenueSnapshot,
      revenueDataQuality,
      fullDayRevenueDate: this.toDateInputValue(fullDayPeriod.currentFromDate),
      fullDayRevenue: this.round(fullDayRevenue.current),
      averageDailyRevenue: this.round(averageDailyRevenue),
      fullDayRevenueToAveragePercent:
        averageDailyRevenue > 0
          ? this.round(
              ((fullDayRevenue.current - averageDailyRevenue) /
                averageDailyRevenue) *
                100,
            )
          : null,
      writeOffRevenuePercent,
      previousWriteOffRevenuePercent,
      writeOffRevenuePercentDelta:
        writeOffRevenuePercent !== null &&
        previousWriteOffRevenuePercent !== null
          ? this.round(writeOffRevenuePercent - previousWriteOffRevenuePercent)
          : null,
      previousAdjustedGrossProfit:
        previousMarginCoverage.fullGrossProfit === null
          ? null
          : this.round(previousAdjustedGrossProfit),
      adjustedGrossProfitToPreviousPercent: this.changePercent(
        marginCoverage.fullGrossProfit === null ? null : adjustedGrossProfit,
        previousMarginCoverage.fullGrossProfit === null
          ? null
          : previousAdjustedGrossProfit,
      ),
      grossProfit: marginCoverage.fullGrossProfit,
      adjustedGrossProfit:
        marginCoverage.fullGrossProfit === null
          ? null
          : this.round(adjustedGrossProfit),
      marginPercent: marginCoverage.fullMarginPercent,
      adjustedMarginPercent:
        marginCoverage.fullGrossProfit === null
          ? null
          : this.marginPercent(
              totalRevenue - adjustedGrossProfit,
              totalRevenue,
            ),
      marginCoverage,
      soldQuantity: this.round(soldQuantity),
      writeOffAmount: this.round(movementImpact.writeOffAmount),
      returnAmount: this.round(movementImpact.returnAmount),
      stockQuantity: this.round(stockQuantity),
      outOfStockRiskCount,
      recommendedOrderQuantity: this.round(
        demand.reduce((sum, item) => sum + item.recommendedOrder, 0),
      ),
      assortmentGrowth,
      storeRevenueBreakdown,
      salesTrend,
      categoryAnalytics,
      topSkuByRevenue: [...salesByProduct.values()]
        .sort(
          (a, b) =>
            b.revenue - a.revenue ||
            b.grossProfit - a.grossProfit ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 10)
        .map((item) => ({
          ...item,
          revenue: this.round(item.revenue),
          grossProfit: this.round(item.grossProfit),
          soldQuantity: this.round(item.soldQuantity),
        })),
      assortmentHealth: assortmentHealth.health.summary,
    };
  }

  async getRevenueDiagnostics(
    user: AuthenticatedUser,
    query: DashboardQuery = {},
  ): Promise<DashboardRevenueDiagnostics> {
    const requestedStoreIds = this.resolveStoreIds(query.storeIds);
    const { tenantId, tenantSlug, effectiveStoreIds } =
      await this.freshStoreScopeService.resolveRequestedStoreIds(
        user,
        requestedStoreIds,
      );
    const period = this.resolvePeriod(query);
    const selectedStoreIds = effectiveStoreIds ? [...effectiveStoreIds] : [];
    const storeFilter = effectiveStoreIds
      ? { storeId: { in: [...effectiveStoreIds] } }
      : {};
    const [
      tenant,
      stores,
      salesFacts,
      operationLogs,
      transactions,
      sessions,
      shifts,
      exactRevenueSnapshot,
      latestRevenueSnapshot,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.store.findMany({
        where: {
          tenantId,
          ...(selectedStoreIds.length > 0
            ? { id: { in: selectedStoreIds } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          externalClubId: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          saleDate: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          revenue: true,
          guestId: true,
          externalGuestId: true,
        },
      }),
      this.prisma.guestOperationLog.findMany({
        where: {
          tenantId,
          ...storeFilter,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          externalClubId: true,
          type: true,
          operationName: true,
          operationSource: true,
          operationForm: true,
          amount: true,
        },
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId,
          ...storeFilter,
          happenedAt: { gte: period.fromDate, lte: period.toDate },
        },
        select: {
          storeId: true,
          externalClubId: true,
          guestId: true,
          externalGuestId: true,
          type: true,
          amount: true,
        },
      }),
      this.prisma.guestSession.findMany({
        where: {
          tenantId,
          ...storeFilter,
          startedAt: { lte: period.toDate },
          OR: [{ stoppedAt: null }, { stoppedAt: { gte: period.fromDate } }],
        },
        select: {
          storeId: true,
          externalClubId: true,
          externalSessionId: true,
          guestId: true,
          externalGuestId: true,
        },
      }),
      this.prisma.guestWorkingShift.findMany({
        where: {
          tenantId,
          ...storeFilter,
          startedAt: { lte: period.toDate },
          OR: [{ stoppedAt: null }, { stoppedAt: { gte: period.fromDate } }],
        },
        select: {
          storeId: true,
          externalClubId: true,
          cashAmount: true,
          cashlessAmount: true,
          mobilePay: true,
          refundsCash: true,
          refundsCashless: true,
        },
      }),
      effectiveStoreIds === null
        ? this.prisma.businessSnapshotRun.findFirst({
            where: {
              tenantId,
              type: 'REVENUE',
              status: { in: ['SUCCESS', 'EMPTY'] },
              periodFrom: period.fromDate,
              periodTo: period.toDate,
            },
            orderBy: { startedAt: 'desc' },
            select: {
              status: true,
              finishedAt: true,
              periodFrom: true,
              periodTo: true,
              sourceCounts: true,
              summary: true,
            },
          })
        : Promise.resolve(null),
      effectiveStoreIds === null
        ? this.prisma.businessSnapshotRun.findFirst({
            where: {
              tenantId,
              type: 'REVENUE',
            },
            orderBy: { startedAt: 'desc' },
            select: {
              status: true,
              finishedAt: true,
              periodFrom: true,
              periodTo: true,
              sourceCounts: true,
              summary: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const rows = this.buildRevenueDiagnosticsRows(
      stores,
      salesFacts,
      operationLogs,
      transactions,
      sessions,
      shifts,
    );
    const totals = this.buildRevenueDiagnosticsTotals(rows);
    const unallocatedTopups =
      this.buildRevenueDiagnosticsUnallocatedTopups(operationLogs);
    const revenueScenarios = this.buildRevenueDiagnosticsScenarios(
      totals,
      unallocatedTopups,
    );
    const sourceMetrics = this.buildRevenueDiagnosticsSourceMetrics(
      totals,
      unallocatedTopups,
    );
    const revenueSnapshot = this.buildDashboardRevenueSnapshot(
      exactRevenueSnapshot ?? latestRevenueSnapshot,
      period.fromDate,
      period.toDate,
    );

    return {
      tenantId,
      tenantSlug,
      tenantName: tenant?.name ?? tenantSlug,
      periodLabel: period.label,
      periodFrom: this.toDateInputValue(period.fromDate),
      periodTo: this.toDateInputValue(period.toDate),
      selectedStoreIds,
      revenueSnapshot,
      rows,
      totals,
      unallocatedTopups,
      revenueScenarios,
      sourceMetrics,
      interpretation: {
        primaryRecommendation:
          'Для выручки клуба использовать подтвержденные списания/расход баланса внутри клуба, а мобильные пополнения держать отдельно как сетевой денежный поток.',
        mobileTopupRule:
          'Пополнение баланса в мобильном приложении не должно увеличивать выручку конкретного клуба; клуб получает выручку в момент списания баланса на сессию, услугу или покупку в этом клубе.',
        limitations: [
          'GuestOperationLog сохраняет type, сумму, дату, клуб, source, form и name; точность разнесения онлайн-пополнений зависит от того, насколько Langame стабильно заполняет эти поля после свежей синхронизации.',
          'transactions/list требует подтверждения семантики полей: amount/sum могут быть суммой операции, изменением баланса или остатком.',
          'log_cash_transaction/list на production ранее возвращал ошибки, поэтому кассовый слой пока можно сверять только через working_shifts и operation log.',
        ],
      },
    };
  }

  private resolvePeriod(query: DashboardQuery) {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    let fromDate = new Date(toDate);
    const period = this.isDashboardPeriod(query.period)
      ? query.period
      : 'full-day';
    let trendPeriod = this.resolveBasePeriod(period);
    let label = 'Полные сутки';

    if (period === 'day') {
      label = 'Текущие сутки';
    } else if (period === 'full-day') {
      toDate.setUTCDate(toDate.getUTCDate() - 1);
      fromDate = new Date(toDate);
      label = 'Полные сутки';
    } else if (period === 'week') {
      const dayOfWeek = fromDate.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      fromDate.setUTCDate(fromDate.getUTCDate() - mondayOffset);
      label = 'Текущая неделя';
    } else if (period === 'full-week') {
      const dayOfWeek = toDate.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      toDate.setUTCDate(toDate.getUTCDate() - mondayOffset - 1);
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
      label = 'Полная неделя';
    } else if (period === 'quarter') {
      const quarterStartMonth = Math.floor(toDate.getUTCMonth() / 3) * 3;
      fromDate = new Date(
        Date.UTC(toDate.getUTCFullYear(), quarterStartMonth, 1),
      );
      label = 'Текущий квартал';
    } else if (period === 'full-quarter') {
      const quarterStartMonth = Math.floor(toDate.getUTCMonth() / 3) * 3;
      fromDate = new Date(
        Date.UTC(toDate.getUTCFullYear(), quarterStartMonth - 3, 1),
      );
      toDate.setUTCFullYear(fromDate.getUTCFullYear());
      toDate.setUTCMonth(fromDate.getUTCMonth() + 3, 0);
      label = 'Полный квартал';
    } else if (period === 'year') {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
      label = 'Текущий год';
    } else if (period === 'full-year') {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear() - 1, 0, 1));
      toDate.setUTCFullYear(fromDate.getUTCFullYear(), 11, 31);
      label = 'Полный год';
    } else if (period === 'full-month') {
      fromDate = new Date(
        Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - 1, 1),
      );
      toDate.setUTCFullYear(fromDate.getUTCFullYear());
      toDate.setUTCMonth(fromDate.getUTCMonth() + 1, 0);
      label = 'Полный месяц';
    } else if (period === 'custom') {
      fromDate = query.dateFrom
        ? this.parseDate(query.dateFrom, 'dateFrom')
        : fromDate;
      const customToDate = query.dateTo
        ? this.parseDate(query.dateTo, 'dateTo')
        : toDate;
      customToDate.setUTCHours(23, 59, 59, 999);

      if (fromDate > customToDate) {
        return {
          fromDate: customToDate,
          toDate: customToDate,
          trendFromDate: customToDate,
          trendToDate: customToDate,
          mode: period,
          label: 'Произвольный период',
          labelGranularity: 'day' as const,
          trendMode: 'custom' as const,
        };
      }

      const customPeriodDuration =
        customToDate.getTime() - fromDate.getTime() + 1;
      const customTrendFromDate = new Date(
        fromDate.getTime() - customPeriodDuration * 7,
      );

      return {
        fromDate,
        toDate: customToDate,
        trendFromDate: customTrendFromDate,
        trendToDate: customToDate,
        mode: period,
        label: 'Произвольный период',
        labelGranularity: this.resolveTrendLabelGranularity(
          customToDate.getTime() - fromDate.getTime(),
        ),
        trendMode: 'custom' as const,
      };
    } else {
      fromDate = new Date(
        Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1),
      );
      trendPeriod = 'month';
    }

    toDate.setUTCHours(23, 59, 59, 999);
    fromDate.setUTCHours(0, 0, 0, 0);

    return {
      fromDate,
      toDate,
      trendFromDate: this.resolveTrendFromDate(trendPeriod, fromDate),
      trendToDate: toDate,
      mode: period,
      label,
      labelGranularity: this.resolveTrendLabelGranularityByPeriod(trendPeriod),
      trendMode: this.resolveTrendModeByPeriod(trendPeriod),
    };
  }

  private executiveDaysInclusive(from: Date, to: Date) {
    const days: Date[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const last = new Date(to);
    last.setUTCHours(0, 0, 0, 0);

    while (cursor <= last) {
      days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private resolveBasePeriod(period: DashboardPeriod): DashboardPeriod {
    if (period === 'full-day') {
      return 'day';
    }

    if (period === 'full-week') {
      return 'week';
    }

    if (period === 'full-month') {
      return 'month';
    }

    if (period === 'full-quarter') {
      return 'quarter';
    }

    if (period === 'full-year') {
      return 'year';
    }

    return period;
  }

  private isDashboardPeriod(value: unknown): value is DashboardPeriod {
    return (
      value === 'day' ||
      value === 'full-day' ||
      value === 'week' ||
      value === 'full-week' ||
      value === 'month' ||
      value === 'full-month' ||
      value === 'quarter' ||
      value === 'full-quarter' ||
      value === 'year' ||
      value === 'full-year' ||
      value === 'custom'
    );
  }

  private resolveStoreIds(
    storeIds?: string | string[],
  ): readonly string[] | undefined {
    if (storeIds === undefined) {
      return undefined;
    }

    const values = Array.isArray(storeIds) ? storeIds : storeIds.split(',');

    return values.map((value) => value.trim());
  }

  private resolveCategoryIds(
    categoryIds?: string | string[],
  ): readonly string[] | undefined {
    if (categoryIds === undefined) {
      return undefined;
    }

    const values = Array.isArray(categoryIds)
      ? categoryIds
      : categoryIds.split(',');

    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private productVisibility(
    storeIds: readonly string[] | null,
  ): Prisma.ProductWhereInput {
    if (!storeIds) {
      return {};
    }

    const inScope = { in: [...storeIds] };

    return {
      OR: [
        { inventorySnapshots: { some: { storeId: inScope } } },
        { salesFacts: { some: { storeId: inScope } } },
        { stockMovements: { some: { storeId: inScope } } },
        { langameClubConfigurations: { some: { storeId: inScope } } },
      ],
    };
  }

  private resolveDemandPeriod() {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (DEMAND_PERIOD_DAYS - 1));
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    return { fromDate, toDate };
  }

  private resolveActiveSkuPeriod() {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (ACTIVE_SKU_SALES_DAYS - 1));
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    return { fromDate, toDate };
  }

  private resolveForecastHistoryPeriod(periodTo: Date) {
    const toDate = new Date(periodTo);
    const fromDate = new Date(toDate);

    fromDate.setUTCDate(fromDate.getUTCDate() - (FORECAST_HISTORY_DAYS - 1));
    fromDate.setUTCHours(0, 0, 0, 0);

    return { fromDate, toDate };
  }

  private resolveFullDayRevenuePeriod() {
    const now = new Date();
    const currentFromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const currentToDate = new Date(currentFromDate);
    currentToDate.setUTCHours(23, 59, 59, 999);
    const dayBeforeCurrentFromDate = new Date(currentFromDate);
    dayBeforeCurrentFromDate.setUTCDate(
      dayBeforeCurrentFromDate.getUTCDate() - 1,
    );
    dayBeforeCurrentFromDate.setUTCHours(23, 59, 59, 999);
    const averageToDate = new Date(dayBeforeCurrentFromDate);
    const averageFromDate = new Date(averageToDate);
    averageFromDate.setUTCDate(
      averageFromDate.getUTCDate() - (FULL_DAY_AVERAGE_DAYS - 1),
    );
    averageFromDate.setUTCHours(0, 0, 0, 0);

    return {
      currentFromDate,
      currentToDate,
      averageFromDate,
      averageToDate,
    };
  }

  private resolvePreviousComparablePeriod(
    fromDate: Date,
    toDate: Date,
    period: DashboardPeriod,
  ) {
    const currentFromDate = new Date(fromDate);
    const currentToDate = new Date(toDate);
    const basePeriod = this.resolveBasePeriod(period);
    currentFromDate.setUTCHours(0, 0, 0, 0);
    currentToDate.setUTCHours(23, 59, 59, 999);

    if (basePeriod === 'month') {
      const previousFromDate = new Date(
        Date.UTC(
          currentFromDate.getUTCFullYear(),
          currentFromDate.getUTCMonth() - 1,
          1,
        ),
      );
      const previousToDate = new Date(
        Date.UTC(
          currentFromDate.getUTCFullYear(),
          currentFromDate.getUTCMonth(),
          0,
          23,
          59,
          59,
          999,
        ),
      );

      return {
        fromDate: previousFromDate,
        toDate: previousToDate,
      };
    }

    if (basePeriod === 'quarter') {
      const previousFromDate = new Date(
        Date.UTC(
          currentFromDate.getUTCFullYear(),
          currentFromDate.getUTCMonth() - 3,
          1,
        ),
      );
      const previousToDate = new Date(
        Date.UTC(
          currentFromDate.getUTCFullYear(),
          currentFromDate.getUTCMonth(),
          0,
          23,
          59,
          59,
          999,
        ),
      );

      return {
        fromDate: previousFromDate,
        toDate: previousToDate,
      };
    }

    if (basePeriod === 'year') {
      const previousFromDate = new Date(
        Date.UTC(currentFromDate.getUTCFullYear() - 1, 0, 1),
      );
      const previousToDate = new Date(
        Date.UTC(currentFromDate.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999),
      );

      return {
        fromDate: previousFromDate,
        toDate: previousToDate,
      };
    }

    const days = Math.max(
      1,
      Math.floor(
        (currentToDate.getTime() - currentFromDate.getTime()) / 86400000,
      ) + 1,
    );
    const previousToDate = new Date(currentFromDate);
    previousToDate.setUTCDate(previousToDate.getUTCDate() - 1);
    previousToDate.setUTCHours(23, 59, 59, 999);
    const previousFromDate = new Date(previousToDate);
    previousFromDate.setUTCDate(previousFromDate.getUTCDate() - (days - 1));
    previousFromDate.setUTCHours(0, 0, 0, 0);

    return {
      fromDate: previousFromDate,
      toDate: previousToDate,
    };
  }

  private fullDayRevenueComparison(
    facts: {
      saleDate: Date;
      revenue: { toNumber: () => number };
    }[],
    period: ReturnType<DashboardService['resolveFullDayRevenuePeriod']>,
  ) {
    let current = 0;
    let averageTotal = 0;

    facts.forEach((fact) => {
      const saleTime = fact.saleDate.getTime();

      if (
        saleTime >= period.currentFromDate.getTime() &&
        saleTime <= period.currentToDate.getTime()
      ) {
        current += fact.revenue.toNumber();
      }

      if (
        saleTime >= period.averageFromDate.getTime() &&
        saleTime <= period.averageToDate.getTime()
      ) {
        averageTotal += fact.revenue.toNumber();
      }
    });

    const averageDays = Math.max(
      1,
      Math.floor(
        (period.averageToDate.getTime() - period.averageFromDate.getTime()) /
          86400000,
      ) + 1,
    );

    return {
      current,
      average: averageTotal / averageDays,
    };
  }

  private averageDailyRevenue(
    totalRevenue: number,
    fromDate: Date,
    toDate: Date,
  ) {
    return this.averageDailyValue(totalRevenue, fromDate, toDate);
  }

  private averageDailyValue(value: number, fromDate: Date, toDate: Date) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(0, 0, 0, 0);
    const days = Math.max(
      1,
      Math.floor((to.getTime() - from.getTime()) / 86400000) + 1,
    );

    return value / days;
  }

  private ratioPercent(value: number, total: number) {
    if (total <= 0) {
      return null;
    }

    return this.round((value / total) * 100);
  }

  private changePercent(current: number | null, previous: number | null) {
    if (current === null || previous === null || previous <= 0) {
      return null;
    }

    return this.round(((current - previous) / previous) * 100);
  }

  private buildAssortmentGrowth(input: {
    currentRevenue: number;
    currentSaleOperationCount: number;
    currentVisitCount: number;
    previousRevenue: number;
    previousSaleOperationCount: number;
    previousVisitCount: number;
    identifiedActiveGuests: number;
    identifiedVisitCount: number;
    activeSkuCount: number;
    stockTrackedSkuCount: number;
    outOfStockRiskCount: number;
    soldQuantity: number;
    categoryAnalytics: DashboardCategoryMetric[];
    grossProfit: number;
    costedSaleOperationCount: number;
    storeRevenueBreakdown: DashboardStoreRevenueMetric[];
    sources: DashboardAssortmentSourceHealth[];
    coverageGaps: DashboardAssortmentCoverageGaps;
    receiptMetrics: DashboardReceiptMetrics;
    forecast: DashboardAssortmentForecast;
  }): DashboardAssortmentGrowth {
    const currentAverageSaleOperation =
      input.currentSaleOperationCount > 0
        ? input.currentRevenue / input.currentSaleOperationCount
        : null;
    const previousAverageSaleOperation =
      input.previousSaleOperationCount > 0
        ? input.previousRevenue / input.previousSaleOperationCount
        : null;
    const currentSaleOperationsPer100Visits =
      input.currentVisitCount > 0
        ? (input.currentSaleOperationCount / input.currentVisitCount) * 100
        : null;
    const previousSaleOperationsPer100Visits =
      input.previousVisitCount > 0
        ? (input.previousSaleOperationCount / input.previousVisitCount) * 100
        : null;
    const guestIdentificationCoveragePercent =
      input.currentVisitCount > 0
        ? this.round(
            (input.identifiedVisitCount / input.currentVisitCount) * 100,
          )
        : null;
    const sessionsPerIdentifiedGuest =
      input.identifiedActiveGuests > 0
        ? this.round(input.identifiedVisitCount / input.identifiedActiveGuests)
        : null;
    const stockCoveragePercent =
      input.activeSkuCount > 0
        ? this.round((input.stockTrackedSkuCount / input.activeSkuCount) * 100)
        : null;
    const availabilityPercent =
      input.stockTrackedSkuCount > 0
        ? this.round(
            ((input.stockTrackedSkuCount - input.outOfStockRiskCount) /
              input.stockTrackedSkuCount) *
              100,
          )
        : null;
    const itemsPerSaleOperation =
      input.currentSaleOperationCount > 0
        ? this.round(input.soldQuantity / input.currentSaleOperationCount)
        : null;
    const averageItemPrice =
      input.soldQuantity > 0
        ? this.round(input.currentRevenue / input.soldQuantity)
        : null;
    const leadingCategory = input.categoryAnalytics[0]
      ? {
          categoryId: input.categoryAnalytics[0].categoryId,
          categoryName: input.categoryAnalytics[0].categoryName,
          revenueSharePercent: input.categoryAnalytics[0].revenueSharePercent,
        }
      : null;
    const costCoveragePercent =
      input.currentSaleOperationCount > 0
        ? this.round(
            (input.costedSaleOperationCount / input.currentSaleOperationCount) *
              100,
          )
        : null;
    const productMarginPercent =
      costCoveragePercent === 100
        ? this.ratioPercent(input.grossProfit, input.currentRevenue)
        : null;
    const opportunity = this.buildAssortmentOpportunity(
      input.storeRevenueBreakdown,
    );
    const visitSource = input.sources.find((source) => source.key === 'visits');
    const salesSource = input.sources.find((source) => source.key === 'sales');
    const visitSalesConflict =
      input.currentSaleOperationCount > 0 && input.currentVisitCount === 0;
    const receiptCalculationState =
      input.receiptMetrics.state === 'SOURCE_UNAVAILABLE'
        ? ('SOURCE_UNAVAILABLE' as const)
        : input.receiptMetrics.state;
    const actions = this.buildAssortmentActions({
      currentAverageSaleOperation,
      visitSalesConflict,
      sources: input.sources,
      coverageGaps: input.coverageGaps,
      forecast: input.forecast,
      storeRevenueBreakdown: input.storeRevenueBreakdown,
    });
    const calculations: DashboardMetricCalculation[] = [
      {
        key: 'visits',
        label: 'Визиты',
        source: 'GuestSession / guests/sessions',
        formula: 'COUNT(DISTINCT session)',
        grain: 'Одна игровая сессия',
        state: visitSalesConflict
          ? 'SOURCE_CONFLICT'
          : input.currentVisitCount === 0
            ? 'NO_DATA'
            : visitSource?.state === 'STALE'
              ? 'STALE'
              : 'READY',
        note: visitSalesConflict
          ? 'Продажи есть, но визиты за тот же период не загружены. Конверсия скрыта до восстановления источника.'
          : input.currentVisitCount === 0
            ? 'В периоде нет игровых сессий.'
            : visitSource?.state === 'STALE'
              ? visitSource.detail
              : null,
      },
      {
        key: 'saleOperations',
        label: 'Товарные операции',
        source: 'SalesFact / products/expense',
        formula: 'COUNT(sale operation)',
        grain: 'Одна строка продажи одного товара',
        state:
          input.currentSaleOperationCount === 0
            ? 'NO_DATA'
            : salesSource?.state === 'STALE'
              ? 'STALE'
              : 'READY',
        note:
          input.currentSaleOperationCount === 0
            ? 'В периоде нет товарных операций.'
            : salesSource?.state === 'STALE'
              ? salesSource.detail
              : null,
      },
      {
        key: 'averageSaleOperationAmount',
        label: 'Средняя сумма товарной операции',
        source: 'SalesFact / products/expense',
        formula: 'SUM(revenue) / COUNT(sale operation)',
        grain: 'Товарная операция',
        state: currentAverageSaleOperation === null ? 'NO_DATA' : 'READY',
        note:
          currentAverageSaleOperation === null
            ? 'В периоде нет товарных операций.'
            : null,
      },
      {
        key: 'productRevenue',
        label: 'Товарная выручка',
        source: 'SalesFact / products/expense',
        formula: 'SUM(revenue)',
        grain: 'Товарная операция',
        state: 'READY',
        note: null,
      },
      {
        key: 'periodDelta',
        label: 'Изменение к прошлому периоду',
        source: 'Текущий и предыдущий сопоставимые периоды',
        formula: '(current − previous) / previous × 100',
        grain: 'Период той же длины',
        state:
          input.previousVisitCount > 0 ||
          input.previousSaleOperationCount > 0 ||
          input.previousRevenue > 0
            ? 'READY'
            : 'NO_DATA',
        note:
          input.previousVisitCount > 0 ||
          input.previousSaleOperationCount > 0 ||
          input.previousRevenue > 0
            ? null
            : 'В предыдущем периоде нет ненулевой базы сравнения.',
      },
      {
        key: 'saleOperationsPer100Visits',
        label: 'Товарных операций на 100 визитов',
        source: 'SalesFact + GuestSession',
        formula: 'sale operations / visits × 100',
        grain: 'Выбранный период и фильтры',
        state: visitSalesConflict
          ? 'SOURCE_CONFLICT'
          : currentSaleOperationsPer100Visits === null
            ? 'NO_DATA'
            : 'READY',
        note: visitSalesConflict
          ? 'Метрика не рассчитывается: продажи загружены, а визиты отсутствуют.'
          : currentSaleOperationsPer100Visits === null
            ? 'В периоде нет игровых сессий.'
            : null,
      },
      {
        key: 'identifiedActiveGuests',
        label: 'Идентифицированные активные гости',
        source: 'GuestSession',
        formula: 'COUNT(DISTINCT guest identity)',
        grain: 'Гость в выбранном периоде',
        state:
          guestIdentificationCoveragePercent !== null &&
          guestIdentificationCoveragePercent < 100
            ? 'PARTIAL_COVERAGE'
            : 'READY',
        note:
          guestIdentificationCoveragePercent !== null &&
          guestIdentificationCoveragePercent < 100
            ? `Идентификатор гостя есть у ${guestIdentificationCoveragePercent}% визитов.`
            : null,
      },
      {
        key: 'guestIdentificationCoveragePercent',
        label: 'Покрытие ID гостей',
        source: 'GuestSession',
        formula: 'identified visits / visits × 100',
        grain: 'Игровая сессия',
        state:
          guestIdentificationCoveragePercent === null ? 'NO_DATA' : 'READY',
        note:
          guestIdentificationCoveragePercent === null
            ? 'В периоде нет игровых сессий.'
            : null,
      },
      {
        key: 'sessionsPerIdentifiedGuest',
        label: 'Сессий на идентифицированного гостя',
        source: 'GuestSession',
        formula: 'identified visits / distinct identified guests',
        grain: 'Гость в выбранном периоде',
        state: sessionsPerIdentifiedGuest === null ? 'NO_DATA' : 'READY',
        note:
          sessionsPerIdentifiedGuest === null
            ? 'Нет сессий с идентификатором гостя.'
            : null,
      },
      {
        key: 'availabilityPercent',
        label: 'Наличие среди SKU с остатками',
        source: 'InventorySnapshot + SalesFact',
        formula:
          '(tracked active SKU − OOS risk SKU) / tracked active SKU × 100',
        grain: 'Активный SKU',
        state:
          availabilityPercent === null
            ? 'NO_DATA'
            : stockCoveragePercent !== null && stockCoveragePercent < 100
              ? 'PARTIAL_COVERAGE'
              : 'READY',
        note:
          availabilityPercent === null
            ? 'Нет снимков остатков для активных SKU.'
            : stockCoveragePercent !== null && stockCoveragePercent < 100
              ? `Остатки загружены для ${stockCoveragePercent}% активных SKU.`
              : null,
      },
      {
        key: 'stockCoveragePercent',
        label: 'Покрытие остатков',
        source: 'InventorySnapshot',
        formula: 'tracked active SKU / active SKU × 100',
        grain: 'Активный SKU',
        state: stockCoveragePercent === null ? 'NO_DATA' : 'READY',
        note:
          stockCoveragePercent === null ? 'В периоде нет активных SKU.' : null,
      },
      {
        key: 'itemsPerSaleOperation',
        label: 'Товаров в операции',
        source: 'SalesFact / products/expense',
        formula: 'SUM(quantity) / COUNT(sale operation)',
        grain: 'Товарная операция',
        state: itemsPerSaleOperation === null ? 'NO_DATA' : 'READY',
        note:
          itemsPerSaleOperation === null
            ? 'В периоде нет товарных операций.'
            : null,
      },
      {
        key: 'averageItemPrice',
        label: 'Средняя цена проданного товара',
        source: 'SalesFact / products/expense',
        formula: 'SUM(revenue) / SUM(quantity)',
        grain: 'Проданная единица товара',
        state: averageItemPrice === null ? 'NO_DATA' : 'READY',
        note:
          averageItemPrice === null
            ? 'В периоде нет проданных единиц товара.'
            : null,
      },
      {
        key: 'leadingCategory',
        label: 'Категория-лидер',
        source: 'SalesFact + Product.category',
        formula: 'MAX(category revenue)',
        grain: 'Категория',
        state: leadingCategory === null ? 'NO_DATA' : 'READY',
        note:
          leadingCategory === null
            ? 'В периоде нет продаж по категориям.'
            : null,
      },
      {
        key: 'costCoveragePercent',
        label: 'Покрытие себестоимости',
        source: 'SalesFact / products/expense',
        formula: 'operations with positive cost / sale operations × 100',
        grain: 'Товарная операция',
        state:
          costCoveragePercent === null
            ? 'NO_DATA'
            : costCoveragePercent < 100
              ? 'PARTIAL_COVERAGE'
              : 'READY',
        note:
          costCoveragePercent === null
            ? 'В периоде нет товарных операций.'
            : costCoveragePercent < 100
              ? `Себестоимость подтверждена для ${costCoveragePercent}% товарных операций.`
              : null,
      },
      {
        key: 'productMarginPercent',
        label: 'Маржа товаров',
        source: 'SalesFact / products/expense',
        formula: '(SUM(revenue) − SUM(cost)) / SUM(revenue) × 100',
        grain: 'Товарная операция',
        state: productMarginPercent === null ? 'NO_DATA' : 'READY',
        note:
          productMarginPercent === null
            ? costCoveragePercent !== null && costCoveragePercent < 100
              ? `Положительная себестоимость есть у ${costCoveragePercent}% товарных операций.`
              : 'В периоде нет товарной выручки.'
            : null,
      },
      {
        key: 'storeOpportunity',
        label: 'Потенциал клуба',
        source: 'SalesFact + confirmed club revenue',
        formula: 'club revenue × (network median share − club product share)',
        grain: 'Клуб',
        state: opportunity.state,
        note: opportunity.reason,
      },
      {
        key: 'purchaseCount',
        label: 'Покупки (чеки)',
        source: 'SalesFact.sourcePayloadHash (receipt-bound token)',
        formula:
          'COUNT(DISTINCT provider + domain + club + SHA-256(receipt ID))',
        grain: 'Чек или заказ',
        state: receiptCalculationState,
        note: input.receiptMetrics.reason,
      },
      {
        key: 'averageCheck',
        label: 'Средний чек',
        source: 'SalesFact с идентификатором чека',
        formula: 'SUM(receipt revenue) / COUNT(DISTINCT receipt)',
        grain: 'Чек или заказ',
        state: receiptCalculationState,
        note: input.receiptMetrics.reason,
      },
      {
        key: 'itemsPerCheck',
        label: 'Товаров в чеке',
        source: 'SalesFact с идентификатором чека',
        formula: 'SUM(quantity) / COUNT(DISTINCT receipt)',
        grain: 'Чек или заказ',
        state: receiptCalculationState,
        note: input.receiptMetrics.reason,
      },
      {
        key: 'salesForecast',
        label: 'Прогноз товарной выручки',
        source: `SalesFact за окно ${FORECAST_HISTORY_DAYS} календарных дней`,
        formula:
          'среднее по дням с подтверждёнными продажами того же дня недели; fallback — среднее по подтверждённым дням',
        grain: `${FORECAST_HORIZON_DAYS} следующих дней`,
        state: input.forecast.state,
        note: input.forecast.reason,
      },
      {
        key: 'forecastLostRevenue',
        label: 'Выручка под риском OOS',
        source: 'InventorySnapshot + среднесуточные продажи + цена',
        formula: 'MAX(0, спрос 7 дней − текущий остаток) × цена продажи',
        grain: 'Активный SKU',
        state:
          input.forecast.lostRevenue === null
            ? 'NO_DATA'
            : input.forecast.state,
        note: input.forecast.reason,
      },
      {
        key: 'orderEffect',
        label: 'Эффект пополнения',
        source: 'Прогноз дефицита + кратность заказа',
        formula: 'MIN(выручка под риском, рекомендуемый заказ × цена)',
        grain: 'Активный SKU на 7 дней',
        state:
          input.forecast.recoverableRevenue === null
            ? 'NO_DATA'
            : input.forecast.state,
        note: input.forecast.reason,
      },
    ];

    return {
      visits: {
        value: input.currentVisitCount,
        previousValue: input.previousVisitCount,
        deltaPercent: this.changePercent(
          input.currentVisitCount,
          input.previousVisitCount,
        ),
      },
      saleOperations: {
        value: input.currentSaleOperationCount,
        previousValue: input.previousSaleOperationCount,
        deltaPercent: this.changePercent(
          input.currentSaleOperationCount,
          input.previousSaleOperationCount,
        ),
        per100Visits:
          currentSaleOperationsPer100Visits === null
            ? null
            : this.round(currentSaleOperationsPer100Visits),
        previousPer100Visits:
          previousSaleOperationsPer100Visits === null
            ? null
            : this.round(previousSaleOperationsPer100Visits),
        per100VisitsDeltaPoints:
          currentSaleOperationsPer100Visits !== null &&
          previousSaleOperationsPer100Visits !== null
            ? this.round(
                currentSaleOperationsPer100Visits -
                  previousSaleOperationsPer100Visits,
              )
            : null,
      },
      averageSaleOperationAmount: {
        value:
          currentAverageSaleOperation === null
            ? null
            : this.round(currentAverageSaleOperation),
        previousValue:
          previousAverageSaleOperation === null
            ? null
            : this.round(previousAverageSaleOperation),
        deltaPercent:
          currentAverageSaleOperation !== null &&
          previousAverageSaleOperation !== null
            ? this.changePercent(
                currentAverageSaleOperation,
                previousAverageSaleOperation,
              )
            : null,
      },
      revenue: {
        value: this.round(input.currentRevenue),
        previousValue: this.round(input.previousRevenue),
        deltaPercent: this.changePercent(
          input.currentRevenue,
          input.previousRevenue,
        ),
      },
      drivers: {
        identifiedActiveGuests: input.identifiedActiveGuests,
        guestIdentificationCoveragePercent,
        sessionsPerIdentifiedGuest,
        stockTrackedSkuCount: input.stockTrackedSkuCount,
        stockCoveragePercent,
        availabilityPercent,
        itemsPerSaleOperation,
        averageItemPrice,
        costCoveragePercent,
        leadingCategory,
        productMarginPercent,
      },
      opportunity,
      sources: input.sources,
      actions,
      coverageGaps: input.coverageGaps,
      forecast: input.forecast,
      calculations,
      methodology: {
        visitUnit: 'GAME_SESSION',
        saleUnit: 'PRODUCT_SALE_OPERATION',
        saleUnitIsExact: true,
        receiptMetrics: input.receiptMetrics,
      },
    };
  }

  private buildAssortmentSourceHealth(input: {
    salesFacts: Array<{
      saleDate: Date;
      updatedAt: Date;
    }>;
    guestSessions: Array<{
      startedAt: Date | null;
      updatedAt: Date;
    }>;
    inventorySnapshots: Array<{
      snapshotDate: Date;
      updatedAt: Date;
    }>;
    products: Array<{
      updatedAt: Date;
    }>;
    asOf: Date;
    sourceHealthEvidence?: AssortmentSourceHealthEvidence;
    saleOperationCount: number;
    visitCount: number;
    costCoveragePercent: number | null;
    stockCoveragePercent: number | null;
    categoryCoveragePercent: number | null;
  }): DashboardAssortmentSourceHealth[] {
    const isInventoryStale = (lastImportedAt: Date | null) => {
      return lastImportedAt
        ? lastImportedAt.getTime() < input.asOf.getTime() - 36 * 60 * 60 * 1000
        : false;
    };
    const latest = <T>(rows: T[], pick: (row: T) => Date | null) =>
      rows.reduce<Date | null>((result, row) => {
        const value = pick(row);
        return value && (!result || value > result) ? value : result;
      }, null);
    const salesFactAt = latest(input.salesFacts, (row) => row.saleDate);
    const salesImportedAt = latest(input.salesFacts, (row) => row.updatedAt);
    const visitsFactAt = latest(input.guestSessions, (row) => row.startedAt);
    const visitsImportedAt = latest(
      input.guestSessions,
      (row) => row.updatedAt,
    );
    const inventoryFactAt = latest(
      input.inventorySnapshots,
      (row) => row.snapshotDate,
    );
    const inventoryImportedAt = latest(
      input.inventorySnapshots,
      (row) => row.updatedAt,
    );
    const productsImportedAt = latest(input.products, (row) => row.updatedAt);
    const rawState = (
      hasData: boolean,
    ): DashboardAssortmentSourceHealth['state'] => {
      if (!hasData) {
        return 'MISSING';
      }
      return 'FRESH';
    };
    const moduleEvidenceState = (
      baseState: DashboardAssortmentSourceHealth['state'],
      evidence: AssortmentSourceHealthEvidence['sales'] | undefined,
      confirmedEmptyIsFresh: boolean,
    ): DashboardAssortmentSourceHealth['state'] => {
      if (!evidence || evidence.totalDomains === 0) return baseState;
      if (evidence.failedDomains === evidence.totalDomains) return 'FAILED';
      if (evidence.failedDomains > 0 || evidence.missingDomains > 0) {
        return evidence.confirmedDomains > 0 || baseState === 'FRESH'
          ? 'PARTIAL'
          : evidence.failedDomains > 0
            ? 'FAILED'
            : baseState;
      }
      return baseState === 'MISSING' && confirmedEmptyIsFresh
        ? 'FRESH'
        : baseState;
    };
    const salesState = moduleEvidenceState(
      rawState(input.saleOperationCount > 0),
      input.sourceHealthEvidence?.sales,
      true,
    );
    const visitsState = rawState(input.visitCount > 0);
    const inventoryBaseState: DashboardAssortmentSourceHealth['state'] =
      input.inventorySnapshots.length === 0
        ? 'MISSING'
        : isInventoryStale(inventoryImportedAt)
          ? 'STALE'
          : 'FRESH';
    const coverageState = (
      baseState: DashboardAssortmentSourceHealth['state'],
      coveragePercent: number | null,
    ): DashboardAssortmentSourceHealth['state'] =>
      baseState === 'FRESH' && coveragePercent !== null && coveragePercent < 100
        ? 'PARTIAL'
        : baseState;
    const costState: DashboardAssortmentSourceHealth['state'] = coverageState(
      salesState,
      input.costCoveragePercent,
    );
    const categoryBaseState = rawState(input.products.length > 0);
    const categoryState: DashboardAssortmentSourceHealth['state'] =
      coverageState(categoryBaseState, input.categoryCoveragePercent);
    const inventoryState: DashboardAssortmentSourceHealth['state'] =
      coverageState(
        moduleEvidenceState(
          inventoryBaseState,
          input.sourceHealthEvidence?.inventory,
          false,
        ),
        input.stockCoveragePercent,
      );
    const rawDetail = (
      state: DashboardAssortmentSourceHealth['state'],
      label: string,
    ) => {
      if (state === 'FAILED') {
        return 'Последняя синхронизация завершилась ошибкой.';
      }
      if (state === 'STALE') {
        return `${label} не обновлялись более 36 часов.`;
      }
      if (state === 'MISSING') {
        return `${label} для выбранного периода отсутствуют.`;
      }
      return `${label} загружены и пригодны для расчёта.`;
    };
    const sourceDetail = (
      state: DashboardAssortmentSourceHealth['state'],
      label: string,
      evidence: AssortmentSourceHealthEvidence['sales'] | undefined,
    ) => {
      if (state === 'PARTIAL' && evidence && evidence.totalDomains > 0) {
        return `${label} подтверждены для ${evidence.confirmedDomains} из ${evidence.totalDomains} доменов.`;
      }
      return rawDetail(state, label);
    };

    return [
      {
        key: 'visits',
        label: 'Визиты',
        state: visitsState,
        lastFactAt: visitsFactAt?.toISOString() ?? null,
        lastImportedAt: visitsImportedAt?.toISOString() ?? null,
        coveragePercent: null,
        detail:
          input.saleOperationCount > 0 && input.visitCount === 0
            ? 'Продажи есть, но визиты за тот же период не загружены.'
            : rawDetail(visitsState, 'Визиты'),
      },
      {
        key: 'sales',
        label: 'Продажи',
        state: salesState,
        lastFactAt: salesFactAt?.toISOString() ?? null,
        lastImportedAt: salesImportedAt?.toISOString() ?? null,
        coveragePercent: null,
        detail: sourceDetail(
          salesState,
          'Продажи',
          input.sourceHealthEvidence?.sales,
        ),
      },
      {
        key: 'inventory',
        label: 'Остатки',
        state: inventoryState,
        lastFactAt: inventoryFactAt?.toISOString() ?? null,
        lastImportedAt: inventoryImportedAt?.toISOString() ?? null,
        coveragePercent: input.stockCoveragePercent,
        detail:
          inventoryState === 'PARTIAL'
            ? `Остатки есть у ${input.stockCoveragePercent}% активных SKU.`
            : sourceDetail(
                inventoryState,
                'Остатки',
                input.sourceHealthEvidence?.inventory,
              ),
      },
      {
        key: 'costs',
        label: 'Себестоимость',
        state: costState,
        lastFactAt: salesFactAt?.toISOString() ?? null,
        lastImportedAt: salesImportedAt?.toISOString() ?? null,
        coveragePercent: input.costCoveragePercent,
        detail:
          costState === 'PARTIAL'
            ? `Себестоимость подтверждена для ${input.costCoveragePercent}% товарных операций.`
            : rawDetail(costState, 'Себестоимость'),
      },
      {
        key: 'categories',
        label: 'Категории',
        state: categoryState,
        lastFactAt: productsImportedAt?.toISOString() ?? null,
        lastImportedAt: productsImportedAt?.toISOString() ?? null,
        coveragePercent: input.categoryCoveragePercent,
        detail:
          categoryState === 'PARTIAL'
            ? `Категория назначена ${input.categoryCoveragePercent}% активных SKU.`
            : rawDetail(categoryState, 'Категории'),
      },
    ];
  }

  private buildAssortmentForecast(input: {
    history: Array<{
      saleDate: Date;
      revenue: { toNumber: () => number };
    }>;
    historyTo: Date;
    confirmedSalesDays?: Date[];
    demand: Array<{
      hasStockSnapshot: boolean;
      averageDailySales: number;
      salePrice: number;
      stockDays: number | null;
      forecastLostUnits: number;
      recommendedOrder: number;
    }>;
    salesSource: DashboardAssortmentSourceHealth | null;
    inventorySource: DashboardAssortmentSourceHealth | null;
  }): DashboardAssortmentForecast {
    const revenueByDay = new Map<string, number>();
    input.history.forEach((fact) => {
      const key = this.toDateInputValue(fact.saleDate);
      revenueByDay.set(
        key,
        (revenueByDay.get(key) ?? 0) + fact.revenue.toNumber(),
      );
    });
    const observedDayKeys = input.confirmedSalesDays
      ? new Set(
          input.confirmedSalesDays.map((date) => this.toDateInputValue(date)),
        )
      : new Set(revenueByDay.keys());
    const observedDays = [...observedDayKeys].map((date) => ({
      date: new Date(`${date}T00:00:00.000Z`),
      revenue: revenueByDay.get(date) ?? 0,
    }));
    const fallbackAverage =
      observedDays.length > 0
        ? observedDays.reduce((total, day) => total + day.revenue, 0) /
          observedDays.length
        : 0;
    const forecastDays: DashboardAssortmentForecastDay[] = [];
    const forecastFrom = new Date(input.historyTo);
    forecastFrom.setUTCDate(forecastFrom.getUTCDate() + 1);
    forecastFrom.setUTCHours(0, 0, 0, 0);

    for (let index = 0; index < FORECAST_HORIZON_DAYS; index += 1) {
      const date = new Date(forecastFrom);
      date.setUTCDate(date.getUTCDate() + index);
      const weekdayRows = observedDays.filter(
        (day) => day.date.getUTCDay() === date.getUTCDay(),
      );
      const weekdayAverage =
        weekdayRows.length >= 2
          ? weekdayRows.reduce((total, day) => total + day.revenue, 0) /
            weekdayRows.length
          : fallbackAverage;

      forecastDays.push({
        date: this.toDateInputValue(date),
        label: new Intl.DateTimeFormat('ru-RU', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          timeZone: 'UTC',
        }).format(date),
        revenue: this.round(weekdayAverage),
      });
    }

    const sourceIncomplete =
      input.salesSource?.state !== 'FRESH' ||
      input.inventorySource?.state !== 'FRESH';
    const historyDays = observedDays.length;
    const confidence =
      historyDays >= 21 && !sourceIncomplete
        ? 'HIGH'
        : historyDays >= 14
          ? 'MEDIUM'
          : 'LOW';
    const state =
      historyDays === 0
        ? ('NO_DATA' as const)
        : historyDays < 14 || sourceIncomplete
          ? ('PARTIAL_COVERAGE' as const)
          : ('READY' as const);
    const revenue =
      historyDays === 0
        ? null
        : this.round(
            forecastDays.reduce((total, day) => total + day.revenue, 0),
          );
    const trackedDemand = input.demand.filter(
      (item) => item.hasStockSnapshot && item.averageDailySales > 0,
    );
    const lostRevenue =
      trackedDemand.length === 0
        ? null
        : this.round(
            trackedDemand.reduce(
              (total, item) => total + item.forecastLostUnits * item.salePrice,
              0,
            ),
          );
    const recoverableRevenue =
      lostRevenue === null
        ? null
        : this.round(
            trackedDemand.reduce(
              (total, item) =>
                total +
                Math.min(
                  item.forecastLostUnits * item.salePrice,
                  item.recommendedOrder * item.salePrice,
                ),
              0,
            ),
          );

    return {
      state,
      confidence,
      horizonDays: FORECAST_HORIZON_DAYS,
      historyDays,
      revenue,
      suggestedTargetRevenue:
        revenue === null
          ? null
          : this.round(revenue * (1 + FORECAST_TARGET_UPLIFT_PERCENT / 100)),
      targetUpliftPercent: FORECAST_TARGET_UPLIFT_PERCENT,
      oosRiskSkuCount: trackedDemand.filter(
        (item) => item.stockDays !== null && item.stockDays <= 3,
      ).length,
      lostRevenue,
      recommendedOrderQuantity: this.round(
        trackedDemand.reduce((total, item) => total + item.recommendedOrder, 0),
      ),
      recoverableRevenue,
      days: revenue === null ? [] : forecastDays,
      reason:
        state === 'NO_DATA'
          ? 'Для прогноза ещё нет истории товарной выручки.'
          : state === 'PARTIAL_COVERAGE'
            ? `Прогноз предварительный: ${historyDays} дней с продажами или неполное покрытие источников.`
            : 'Прогноз рассчитан по подтверждённым дням продаж в 28-дневном окне с поправкой на день недели.',
    };
  }

  private confirmedSalesDays(
    evidence?: Array<{
      date: Date;
      status: 'CONFIRMED' | 'MISSING' | 'FAILED';
    }>,
  ) {
    if (!evidence || evidence.length === 0) return undefined;
    const statusesByDate = new Map<string, string[]>();
    evidence.forEach((item) => {
      const date = this.toDateInputValue(item.date);
      const statuses = statusesByDate.get(date) ?? [];
      statuses.push(item.status);
      statusesByDate.set(date, statuses);
    });
    return [...statusesByDate].flatMap(([date, statuses]) =>
      statuses.every((status) => status === 'CONFIRMED')
        ? [new Date(`${date}T00:00:00.000Z`)]
        : [],
    );
  }

  private buildAssortmentActions(input: {
    currentAverageSaleOperation: number | null;
    visitSalesConflict: boolean;
    sources: DashboardAssortmentSourceHealth[];
    coverageGaps: DashboardAssortmentCoverageGaps;
    forecast: DashboardAssortmentForecast;
    storeRevenueBreakdown: DashboardStoreRevenueMetric[];
  }): DashboardAssortmentAction[] {
    const actions: DashboardAssortmentAction[] = [];
    const unhealthySources = input.sources.filter((source) =>
      ['FAILED', 'STALE', 'MISSING'].includes(source.state),
    );

    if (input.visitSalesConflict || unhealthySources.length > 0) {
      actions.push({
        key: 'restore-data-sources',
        priority: 1,
        tone: 'CRITICAL',
        title: input.visitSalesConflict
          ? 'Восстановить загрузку визитов'
          : 'Обновить источники данных',
        description: input.visitSalesConflict
          ? 'Продажи уже есть, но конверсию нельзя считать без визитов за тот же период.'
          : unhealthySources.map((source) => source.label).join(', '),
        metric: `${unhealthySources.length || 1} источник требует внимания`,
        impactRubles: null,
        href: '/sync',
      });
    }

    if ((input.forecast.lostRevenue ?? 0) > 0) {
      actions.push({
        key: 'replenish-oos-risk',
        priority: 2,
        tone: 'WARNING',
        title: 'Пополнить товары с риском дефицита',
        description: `Закажите ${this.round(input.forecast.recommendedOrderQuantity)} шт. с учётом недельного спроса и кратности поставщика.`,
        metric: `${input.forecast.oosRiskSkuCount} SKU · ${this.round(input.forecast.lostRevenue ?? 0)} ₽ под риском`,
        impactRubles: input.forecast.recoverableRevenue,
        href: '/reports/replenishment/table',
      });
    }

    if (input.coverageGaps.missingCostOperationCount > 0) {
      actions.push({
        key: 'fill-missing-costs',
        priority: 3,
        tone: 'WARNING',
        title: 'Заполнить себестоимость',
        description:
          'Проверьте закупочные цены в карточках товара или загрузите себестоимость в CSV продаж.',
        metric: `${input.coverageGaps.missingCostOperationCount} операций · ${this.round(input.coverageGaps.missingCostRevenue)} ₽ без подтверждённой маржи`,
        impactRubles: null,
        href: '/products/table',
      });
    }

    if (
      input.coverageGaps.uncategorizedSkuCount > 0 ||
      input.coverageGaps.categoryNormalizationCandidateCount > 0
    ) {
      actions.push({
        key: 'normalize-categories',
        priority: 4,
        tone: 'WARNING',
        title: 'Разобрать категории',
        description:
          'Назначьте категории товарам без группы и объедините похожие названия через привязки Langame.',
        metric: `${input.coverageGaps.uncategorizedSkuCount} SKU без категории · ${input.coverageGaps.categoryNormalizationCandidateCount} кандидатов на нормализацию`,
        impactRubles: input.coverageGaps.uncategorizedRevenue,
        href: '/categories/triage',
      });
    }

    if (input.coverageGaps.missingStockSkuCount > 0) {
      actions.push({
        key: 'fill-inventory-gaps',
        priority: 5,
        tone: 'WARNING',
        title: 'Догрузить остатки',
        description:
          'Без снимка остатка SKU не участвует в прогнозе OOS и расчёте заказа.',
        metric: `${input.coverageGaps.missingStockSkuCount} активных SKU без остатка`,
        impactRubles: null,
        href: '/import',
      });
    }

    const eligibleStores = input.storeRevenueBreakdown.filter(
      (store) =>
        store.visitsCount > 0 && store.saleOperationsPer100Visits !== null,
    );
    const rates = eligibleStores
      .map((store) => store.saleOperationsPer100Visits ?? 0)
      .sort((left, right) => left - right);
    const median = this.median(rates);
    const lowestStore = [...eligibleStores].sort(
      (left, right) =>
        (left.saleOperationsPer100Visits ?? 0) -
        (right.saleOperationsPer100Visits ?? 0),
    )[0];

    if (
      lowestStore &&
      median !== null &&
      lowestStore.saleOperationsPer100Visits !== null &&
      lowestStore.saleOperationsPer100Visits < median
    ) {
      const missingOperations =
        ((median - lowestStore.saleOperationsPer100Visits) / 100) *
        lowestStore.visitsCount;
      const impactRubles =
        input.currentAverageSaleOperation === null
          ? null
          : this.round(missingOperations * input.currentAverageSaleOperation);

      actions.push({
        key: `raise-store-conversion-${lowestStore.storeId}`,
        priority: 6,
        tone: 'OPPORTUNITY',
        title: `Поднять конверсию в ${lowestStore.storeName}`,
        description:
          'Сравните наличие хитов, выкладку и предложение смены с клубами выше медианы.',
        metric: `${lowestStore.saleOperationsPer100Visits} против ${median} операций на 100 визитов`,
        impactRubles,
        href: '/dashboard/revenue-by-club',
      });
    }

    if (actions.length === 0) {
      actions.push({
        key: 'keep-monitoring',
        priority: 10,
        tone: 'INFO',
        title: 'Критичных действий на сегодня нет',
        description:
          'Источники и покрытие в норме. Проверьте динамику продаж и категории-лидеры.',
        metric: 'Контрольный просмотр',
        impactRubles: null,
        href: '/reports/top-sku/table',
      });
    }

    return actions
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          (right.impactRubles ?? 0) - (left.impactRubles ?? 0),
      )
      .slice(0, 5);
  }

  private buildAssortmentCoverageGaps(input: {
    products: Array<{
      id: string;
      categoryId: string | null;
      category: { name: string } | null;
    }>;
    activeProductIds: Set<string>;
    salesFacts: Array<{
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
      product: {
        categoryId: string | null;
        category: { name: string } | null;
      };
    }>;
    stockTrackedSkuCount: number;
    totalRevenue: number;
  }): DashboardAssortmentCoverageGaps {
    const activeProducts = input.products.filter((product) =>
      input.activeProductIds.has(product.id),
    );
    const missingCostFacts = input.salesFacts.filter(
      (fact) => fact.revenue.toNumber() > 0 && fact.cost.toNumber() <= 0,
    );
    const uncategorizedRevenue = input.salesFacts.reduce(
      (total, fact) =>
        total +
        (fact.product.categoryId === null ? fact.revenue.toNumber() : 0),
      0,
    );
    const categoryNames = [
      ...new Set(
        activeProducts
          .map((product) => product.category?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    const categoryCandidateGroups = new Map<string, Set<string>>();

    categoryNames.forEach((name) => {
      const key = this.categoryNormalizationKey(name);
      const names = categoryCandidateGroups.get(key) ?? new Set<string>();
      names.add(name);
      categoryCandidateGroups.set(key, names);
    });

    return {
      missingCostOperationCount: missingCostFacts.length,
      missingCostRevenue: this.round(
        missingCostFacts.reduce(
          (total, fact) => total + fact.revenue.toNumber(),
          0,
        ),
      ),
      missingStockSkuCount: Math.max(
        0,
        input.activeProductIds.size - input.stockTrackedSkuCount,
      ),
      uncategorizedSkuCount: activeProducts.filter(
        (product) => product.categoryId === null,
      ).length,
      uncategorizedRevenue: this.round(uncategorizedRevenue),
      uncategorizedRevenueSharePercent: this.ratioPercent(
        uncategorizedRevenue,
        input.totalRevenue,
      ),
      categoryNormalizationCandidateCount: [
        ...categoryCandidateGroups.values(),
      ].reduce((total, names) => total + Math.max(0, names.size - 1), 0),
    };
  }

  private categoryNormalizationKey(value: string) {
    const normalized = value
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[aeopcyx]/g, (letter) => {
        const lookalikes: Record<string, string> = {
          a: 'а',
          e: 'е',
          o: 'о',
          p: 'р',
          c: 'с',
          y: 'у',
          x: 'х',
        };
        return lookalikes[letter] ?? letter;
      })
      .replace(/ё/g, 'е')
      .replace(/[^а-я0-9]+/g, ' ')
      .replace(/\bеда\b/g, '')
      .trim();
    const firstWord = normalized.split(/\s+/)[0] ?? normalized;

    return firstWord.length >= 5 ? firstWord.slice(0, 5) : normalized;
  }

  private median(values: number[]) {
    if (values.length === 0) {
      return null;
    }

    const middle = Math.floor(values.length / 2);

    return values.length % 2 === 0
      ? this.round((values[middle - 1] + values[middle]) / 2)
      : this.round(values[middle]);
  }

  private buildReceiptMetrics(
    salesFacts: Array<{
      storeId: string;
      externalProvider?: string | null;
      externalDomain?: string | null;
      sourcePayloadHash?: string | null;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
      product: { name: string };
    }>,
  ): DashboardReceiptMetrics {
    if (salesFacts.length === 0) {
      return {
        state: 'NO_DATA',
        requiredField: 'RECEIPT_OR_ORDER_ID',
        reason: 'В выбранном периоде нет товарных операций.',
        coveragePercent: null,
        coveredRevenuePercent: null,
        purchaseCount: null,
        averageCheck: null,
        itemsPerCheck: null,
        topBasketPair: null,
      };
    }

    const coveredFacts = salesFacts
      .map((fact) => ({
        fact,
        receiptIdentity: receiptIdentityFromSourceHash(fact.sourcePayloadHash),
      }))
      .filter(
        (
          item,
        ): item is {
          fact: (typeof salesFacts)[number];
          receiptIdentity: string;
        } => Boolean(item.receiptIdentity),
      );

    if (coveredFacts.length === 0) {
      return {
        state: 'SOURCE_UNAVAILABLE',
        requiredField: 'RECEIPT_OR_ORDER_ID',
        reason:
          'Источник ещё не передал идентификатор чека или заказа. Его можно загрузить колонкой «Чек» в CSV продаж; товарные операции не подменяют покупки.',
        coveragePercent: 0,
        coveredRevenuePercent: 0,
        purchaseCount: null,
        averageCheck: null,
        itemsPerCheck: null,
        topBasketPair: null,
      };
    }

    const receipts = new Map<
      string,
      { revenue: number; quantity: number; products: Set<string> }
    >();
    let coveredRevenue = 0;
    let totalRevenue = 0;

    salesFacts.forEach((fact) => {
      totalRevenue += fact.revenue.toNumber();
    });
    coveredFacts.forEach(({ fact, receiptIdentity }) => {
      const key = [
        fact.externalProvider ?? 'manual',
        fact.externalDomain ?? 'local',
        fact.storeId,
        receiptIdentity,
      ].join(':');
      const receipt = receipts.get(key) ?? {
        revenue: 0,
        quantity: 0,
        products: new Set<string>(),
      };
      const revenue = fact.revenue.toNumber();

      receipt.revenue += revenue;
      receipt.quantity += fact.quantity.toNumber();
      receipt.products.add(fact.product.name);
      receipts.set(key, receipt);
      coveredRevenue += revenue;
    });

    const pairCounts = new Map<string, number>();
    receipts.forEach((receipt) => {
      const products = [...receipt.products].sort((left, right) =>
        left.localeCompare(right),
      );

      for (let first = 0; first < products.length; first += 1) {
        for (let second = first + 1; second < products.length; second += 1) {
          const key = `${products[first]}\u0000${products[second]}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    });
    const topPair = [...pairCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0];
    const coveragePercent = this.round(
      (coveredFacts.length / salesFacts.length) * 100,
    );
    const state =
      coveragePercent === 100 ? 'READY' : ('PARTIAL_COVERAGE' as const);

    return {
      state,
      requiredField: 'RECEIPT_OR_ORDER_ID',
      reason:
        state === 'READY'
          ? 'Идентификатор чека есть у всех товарных операций периода.'
          : `Идентификатор чека есть у ${coveragePercent}% товарных операций; чековые показатели рассчитаны только по покрытой части.`,
      coveragePercent,
      coveredRevenuePercent: this.ratioPercent(coveredRevenue, totalRevenue),
      purchaseCount: receipts.size,
      averageCheck:
        receipts.size > 0 ? this.round(coveredRevenue / receipts.size) : null,
      itemsPerCheck:
        receipts.size > 0
          ? this.round(
              [...receipts.values()].reduce(
                (total, receipt) => total + receipt.quantity,
                0,
              ) / receipts.size,
            )
          : null,
      topBasketPair: topPair
        ? {
            firstProductName: topPair[0].split('\u0000')[0],
            secondProductName: topPair[0].split('\u0000')[1],
            receiptsCount: topPair[1],
          }
        : null,
    };
  }

  private sessionIdentityStats(
    sessions: Array<{
      id?: string;
      externalProvider?: string | null;
      externalDomain?: string | null;
      externalSessionId: string;
      guestId?: string | null;
      externalGuestId?: string | null;
    }>,
  ) {
    const sessionGuests = new Map<string, string | null>();

    sessions.forEach((session, index) => {
      const sessionKey =
        session.id ??
        [
          session.externalProvider ?? 'unknown-provider',
          session.externalDomain ?? 'unknown-domain',
          session.externalSessionId || `row-${index}`,
        ].join(':');
      const guestKey = this.guestIdentityKey(session);

      sessionGuests.set(sessionKey, guestKey);
    });

    const identifiedGuestIds = new Set(
      [...sessionGuests.values()].filter((guestKey): guestKey is string =>
        Boolean(guestKey),
      ),
    );

    return {
      visits: sessionGuests.size,
      identifiedVisits: [...sessionGuests.values()].filter(Boolean).length,
      identifiedGuests: identifiedGuestIds.size,
    };
  }

  private resolveScopedGuestSessions<
    T extends {
      storeId: string | null;
      externalDomain: string | null;
      externalClubId: string | null;
    },
  >(
    sessions: T[],
    tenantId: string,
    topology: Array<{
      id: string;
      tenantId: string;
      externalDomain: string | null;
      externalClubId: string | null;
      isActive: boolean;
    }>,
    selectedStoreIds: readonly string[] | null,
  ): { sessions: T[]; binding: DashboardVisitBinding } {
    const selected = selectedStoreIds ? new Set(selectedStoreIds) : null;
    const topologyStoreIds = new Set(topology.map((store) => store.id));
    const isWholeDomainInScope = (domain: string) => {
      const activeDomainStores = topology.filter(
        (store) => store.isActive && store.externalDomain === domain,
      );
      return (
        selected !== null &&
        activeDomainStores.length > 0 &&
        activeDomainStores.every((store) => selected.has(store.id))
      );
    };
    const resolved: T[] = [];
    let observed = 0;
    let covered = 0;

    sessions.forEach((session) => {
      const resolvedStoreId =
        session.storeId && topologyStoreIds.has(session.storeId)
          ? session.storeId
          : resolveGuestSessionStore({
              tenantId,
              externalDomain: session.externalDomain,
              externalClubId: session.externalClubId,
              stores: topology,
            }).storeId;
      const isRelevant = selected
        ? resolvedStoreId
          ? selected.has(resolvedStoreId)
          : session.externalDomain !== null &&
            isWholeDomainInScope(session.externalDomain)
        : true;

      if (!isRelevant) return;
      observed += 1;

      if (!resolvedStoreId || (selected && !selected.has(resolvedStoreId))) {
        return;
      }

      covered += 1;
      resolved.push(
        resolvedStoreId === session.storeId
          ? session
          : { ...session, storeId: resolvedStoreId },
      );
    });

    const coveragePercent =
      observed > 0 ? this.round((covered / observed) * 100) : null;
    const state: DashboardVisitBinding['state'] =
      observed === 0
        ? 'MISSING'
        : covered === observed
          ? 'AVAILABLE'
          : 'PARTIAL';
    return {
      sessions: resolved,
      binding: {
        state,
        observedVisitCount: observed,
        usableVisitCount: state === 'AVAILABLE' ? covered : null,
        coverage: { covered, total: observed, percent: coveragePercent },
        reason:
          state === 'PARTIAL'
            ? 'Не все исторические сессии можно доказуемо привязать к выбранным клубам.'
            : state === 'MISSING'
              ? 'В выбранном периоде нет сессий с подтвержденной областью.'
              : null,
      },
    };
  }

  private guestIdentityKey(identity: {
    guestId?: string | null;
    externalProvider?: string | null;
    externalDomain?: string | null;
    externalGuestId?: string | null;
  }) {
    if (identity.guestId) {
      return `guest:${identity.guestId}`;
    }

    if (!identity.externalGuestId) {
      return null;
    }

    return [
      'external-guest',
      identity.externalProvider ?? 'unknown-provider',
      identity.externalDomain ?? 'unknown-domain',
      identity.externalGuestId,
    ].join(':');
  }

  private buildAssortmentOpportunity(
    stores: DashboardStoreRevenueMetric[],
  ): DashboardAssortmentOpportunity {
    const eligibleStores = stores
      .filter(
        (store) =>
          store.totalRevenue > 0 &&
          store.totalRevenueSource !== 'PRODUCTS' &&
          store.totalRevenueSource !== 'EMPTY' &&
          store.productRevenueSharePercent !== null,
      )
      .sort(
        (first, second) =>
          (first.productRevenueSharePercent ?? 0) -
          (second.productRevenueSharePercent ?? 0),
      );

    if (eligibleStores.length < 2) {
      return {
        state: 'NO_DATA',
        storeId: null,
        storeName: null,
        currentSharePercent: null,
        benchmarkSharePercent: null,
        gapPoints: null,
        revenueOpportunity: null,
        reason:
          'Для сравнения нужны минимум два клуба с подтверждённой общей выручкой.',
      };
    }

    const weakest = eligibleStores[0];
    const sortedShares = eligibleStores
      .map((store) => store.productRevenueSharePercent ?? 0)
      .sort((first, second) => first - second);
    const middleIndex = Math.floor(sortedShares.length / 2);
    const benchmarkSharePercent =
      sortedShares.length % 2 === 0
        ? (sortedShares[middleIndex - 1] + sortedShares[middleIndex]) / 2
        : sortedShares[middleIndex];
    const gapPoints = Math.max(
      0,
      benchmarkSharePercent - (weakest.productRevenueSharePercent ?? 0),
    );

    return {
      state: 'READY',
      storeId: weakest.storeId,
      storeName: weakest.storeName,
      currentSharePercent: weakest.productRevenueSharePercent,
      benchmarkSharePercent: this.round(benchmarkSharePercent),
      gapPoints: this.round(gapPoints),
      revenueOpportunity: this.round((weakest.totalRevenue * gapPoints) / 100),
      reason: null,
    };
  }

  private buildDashboardRevenueBreakdown(input: {
    productRevenue: number;
    balanceOperationRevenue: number;
    transactionSpendRevenue: number;
    unallocatedTopupRevenue: number;
    shiftCashRevenue: number;
    productSalesCount: number;
    operationLogs: {
      storeId: string | null;
      externalClubId: string | null;
      type: string | null;
      operationSource?: string | null;
      operationForm?: string | null;
      amount: { toNumber: () => number } | null;
    }[];
    transactions: { amount: { toNumber: () => number } | null }[];
    workingShifts: unknown[];
    exactSnapshot: {
      status: string;
      sourceCounts: unknown;
      summary: unknown;
    } | null;
  }): DashboardRevenueBreakdown {
    const allocatedClubRevenue = Math.max(
      input.productRevenue,
      input.balanceOperationRevenue,
      input.transactionSpendRevenue,
    );
    const liveNetworkRevenue =
      allocatedClubRevenue + input.unallocatedTopupRevenue;
    const snapshotNetworkRevenue = this.snapshotNumber(
      input.exactSnapshot?.summary,
      'dashboardNetworkRevenue',
    );
    const hasExactSnapshot =
      input.exactSnapshot?.status === 'SUCCESS' ||
      input.exactSnapshot?.status === 'EMPTY';
    const networkRevenue =
      hasExactSnapshot && snapshotNetworkRevenue !== null
        ? snapshotNetworkRevenue
        : liveNetworkRevenue;
    const primarySource: DashboardRevenueSource =
      hasExactSnapshot && snapshotNetworkRevenue !== null
        ? 'SNAPSHOT'
        : input.balanceOperationRevenue >= input.transactionSpendRevenue &&
            input.balanceOperationRevenue >= input.productRevenue &&
            input.balanceOperationRevenue > 0
          ? 'BALANCE_OPERATIONS'
          : input.transactionSpendRevenue >= input.productRevenue &&
              input.transactionSpendRevenue > 0
            ? 'TRANSACTIONS'
            : input.productRevenue > 0
              ? 'PRODUCTS'
              : 'EMPTY';

    const sourceCounts = {
      productSales:
        this.snapshotNumber(input.exactSnapshot?.sourceCounts, 'salesFacts') ??
        input.productSalesCount,
      operationSpends: input.operationLogs.filter((operationLog) =>
        this.isBalanceSpendOperationType(operationLog.type),
      ).length,
      operationTopups: input.operationLogs.filter((operationLog) =>
        this.isUnallocatedNetworkTopup(operationLog),
      ).length,
      transactions: input.transactions.length,
      workingShifts: input.workingShifts.length,
    };

    return {
      networkRevenue: this.round(networkRevenue),
      allocatedClubRevenue: this.round(
        this.snapshotNumber(
          input.exactSnapshot?.summary,
          'allocatedClubRevenue',
        ) ?? allocatedClubRevenue,
      ),
      productRevenue: this.round(
        this.snapshotNumber(input.exactSnapshot?.summary, 'productRevenue') ??
          input.productRevenue,
      ),
      balanceOperationRevenue: this.round(
        this.snapshotNumber(
          input.exactSnapshot?.summary,
          'balanceOperationSpendRevenue',
        ) ?? input.balanceOperationRevenue,
      ),
      transactionSpendRevenue: this.round(
        this.snapshotNumber(
          input.exactSnapshot?.summary,
          'transactionSpendRevenue',
        ) ?? input.transactionSpendRevenue,
      ),
      unallocatedTopupRevenue: this.round(
        this.snapshotNumber(
          input.exactSnapshot?.summary,
          'unallocatedTopupRevenue',
        ) ?? input.unallocatedTopupRevenue,
      ),
      shiftCashRevenue: this.round(
        this.snapshotNumber(input.exactSnapshot?.summary, 'shiftCashRevenue') ??
          input.shiftCashRevenue,
      ),
      primarySource,
      formula:
        'max(products, balance_spend, transactions_spend) + unallocated_online_topups',
      sourceCounts,
    };
  }

  private buildDashboardRevenueSnapshot(
    snapshot: {
      status: string;
      finishedAt: Date | null;
      periodFrom: Date | null;
      periodTo: Date | null;
      sourceCounts: unknown;
      summary: unknown;
    } | null,
    periodFrom: Date,
    periodTo: Date,
  ): DashboardRevenueSnapshot {
    if (!snapshot) {
      return {
        status: 'MISSING',
        generatedAt: null,
        periodFrom: null,
        periodTo: null,
        networkRevenue: null,
        sourceCounts: {},
      };
    }

    const matchesPeriod =
      snapshot.periodFrom?.getTime() === periodFrom.getTime() &&
      snapshot.periodTo?.getTime() === periodTo.getTime();

    return {
      status:
        snapshot.status === 'FAILED'
          ? 'FAILED'
          : matchesPeriod &&
              (snapshot.status === 'SUCCESS' || snapshot.status === 'EMPTY')
            ? 'FRESH'
            : 'STALE',
      generatedAt: snapshot.finishedAt?.toISOString() ?? null,
      periodFrom: snapshot.periodFrom?.toISOString() ?? null,
      periodTo: snapshot.periodTo?.toISOString() ?? null,
      networkRevenue: this.snapshotNumber(
        snapshot.summary,
        'dashboardNetworkRevenue',
      ),
      sourceCounts: this.snapshotNumberRecord(snapshot.sourceCounts),
    };
  }

  private buildDashboardRevenueDataQuality(
    breakdown: DashboardRevenueBreakdown,
    snapshot: DashboardRevenueSnapshot,
  ): DashboardRevenueDataQuality {
    if (breakdown.primarySource === 'SNAPSHOT' && snapshot.status === 'FRESH') {
      return {
        level: 'HIGH',
        title: 'Fresh revenue snapshot',
        notes: [
          'Dashboard uses the prepared REVENUE snapshot for this exact period.',
          'Formula separates club-recognized revenue and unallocated online top-ups.',
        ],
      };
    }

    if (
      breakdown.primarySource === 'BALANCE_OPERATIONS' ||
      breakdown.primarySource === 'TRANSACTIONS'
    ) {
      return {
        level: 'MEDIUM',
        title: 'Calculated from saved facts',
        notes: [
          'No exact prepared snapshot was found, so the dashboard calculated revenue from saved LeetPlus facts.',
          'Open /sync to create a fresh REVENUE snapshot before final reconciliation.',
        ],
      };
    }

    if (breakdown.primarySource === 'PRODUCTS') {
      return {
        level: 'MEDIUM',
        title: 'Product revenue only',
        notes: [
          'Only bar/goods revenue is available for this period.',
          'Game and service spend facts are missing or empty, so the revenue KPI can be understated.',
        ],
      };
    }

    return {
      level: 'LOW',
      title: 'No revenue facts',
      notes: [
        'No product sales, balance spend, transaction spend, or revenue snapshot was found for the period.',
        'Run sync and create typed snapshots before using this KPI.',
      ],
    };
  }

  private shiftCashRevenueTotal(
    shifts: {
      cashAmount: { toNumber: () => number } | null;
      cashlessAmount: { toNumber: () => number } | null;
      mobilePay: { toNumber: () => number } | null;
      refundsCash: { toNumber: () => number } | null;
      refundsCashless: { toNumber: () => number } | null;
    }[],
  ) {
    return shifts.reduce((sum, shift) => {
      const incoming =
        (shift.cashAmount?.toNumber() ?? 0) +
        (shift.cashlessAmount?.toNumber() ?? 0) +
        (shift.mobilePay?.toNumber() ?? 0);
      const refunds =
        (shift.refundsCash?.toNumber() ?? 0) +
        (shift.refundsCashless?.toNumber() ?? 0);

      return sum + incoming - refunds;
    }, 0);
  }

  private snapshotNumber(snapshot: unknown, key: string) {
    if (!snapshot || typeof snapshot !== 'object' || !(key in snapshot)) {
      return null;
    }

    const value = (snapshot as Record<string, unknown>)[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private snapshotNumberRecord(snapshot: unknown): Record<string, number> {
    if (!snapshot || typeof snapshot !== 'object') {
      return {};
    }

    return Object.entries(snapshot as Record<string, unknown>).reduce(
      (acc, [key, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          acc[key] = value;
        }

        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private guestTransactionTotal(
    transactions: {
      type: string | null;
      amount: { toNumber: () => number } | null;
    }[],
  ) {
    return transactions.reduce(
      (sum, transaction) =>
        sum +
        this.confirmedTransactionSpendAmount(
          transaction.type,
          transaction.amount?.toNumber() ?? 0,
        ),
      0,
    );
  }

  private guestOperationRevenueTotal(
    operationLogs: {
      type: string | null;
      operationSource: string | null;
      operationForm: string | null;
      amount: { toNumber: () => number } | null;
    }[],
  ) {
    return operationLogs.reduce(
      (sum, operationLog) =>
        sum +
        this.confirmedBalanceSpendAmount(
          operationLog.type,
          operationLog.amount?.toNumber() ?? 0,
        ),
      0,
    );
  }

  private guestOperationTopupTotal(
    operationLogs: {
      storeId: string | null;
      externalClubId: string | null;
      type: string | null;
      operationName?: string | null;
      operationSource?: string | null;
      operationForm?: string | null;
      amount: { toNumber: () => number } | null;
    }[],
  ) {
    return operationLogs.reduce((sum, operationLog) => {
      const amount = operationLog.amount?.toNumber() ?? 0;

      if (!Number.isFinite(amount) || amount === 0) {
        return sum;
      }

      return this.isUnallocatedNetworkTopup(operationLog)
        ? sum + Math.abs(amount)
        : sum;
    }, 0);
  }

  private isUnallocatedNetworkTopup(operationLog: {
    storeId?: string | null;
    externalClubId?: string | null;
    type: string | null;
    operationSource?: string | null;
    operationForm?: string | null;
  }) {
    if (!this.isBalanceTopUpOperationType(operationLog.type)) {
      return false;
    }

    const externalClubId = operationLog.externalClubId?.trim();

    if (operationLog.storeId || (externalClubId && externalClubId !== '0')) {
      return false;
    }

    const source = this.normalizeExternalType(
      operationLog.operationSource ?? null,
    );
    const form = this.normalizeExternalType(operationLog.operationForm ?? null);

    if (!source && !form) {
      return true;
    }

    return (
      source.includes('прилож') ||
      source.includes('app') ||
      source.includes('mobile') ||
      source.includes('лк_гост') ||
      source.includes('lk_guest') ||
      source.includes('web_интерфейс') ||
      form === 'qr'
    );
  }

  private confirmedBalanceSpendAmount(type: string | null, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) {
      return 0;
    }

    if (amount < 0) {
      return Math.abs(amount);
    }

    return this.isBalanceSpendOperationType(type) ? amount : 0;
  }

  private isBalanceSpendOperationType(type: string | null) {
    const normalizedType = this.normalizeExternalType(type);

    return (
      normalizedType === 'minus' ||
      normalizedType === 'spisanie' ||
      normalizedType.includes('withdraw') ||
      normalizedType.includes('spend') ||
      normalizedType.includes('expense') ||
      normalizedType.includes('payment') ||
      normalizedType.includes('write_off') ||
      normalizedType.includes('debit') ||
      normalizedType.includes('спис') ||
      normalizedType.includes('расход') ||
      normalizedType.includes('оплат')
    );
  }

  private confirmedTransactionSpendAmount(type: string | null, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) {
      return 0;
    }

    if (this.isBalanceTopUpOperationType(type)) {
      return 0;
    }

    return Math.abs(amount);
  }

  private isBalanceTopUpOperationType(type: string | null) {
    const normalizedType = this.normalizeExternalType(type);

    return (
      normalizedType === 'plus' ||
      normalizedType === 'popolnenie' ||
      normalizedType.includes('deposit') ||
      normalizedType.includes('top_up') ||
      normalizedType.includes('recharge') ||
      normalizedType.includes('пополн')
    );
  }

  private normalizeExternalType(type: string | null) {
    return String(type ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  private buildRevenueDiagnosticsRows(
    stores: {
      id: string;
      name: string;
      externalClubId: string | null;
    }[],
    salesFacts: {
      storeId: string;
      revenue: { toNumber: () => number };
      guestId: string | null;
      externalGuestId: string | null;
    }[],
    operationLogs: {
      storeId: string | null;
      externalClubId: string | null;
      type: string | null;
      amount: { toNumber: () => number } | null;
    }[],
    transactions: {
      storeId: string | null;
      externalClubId: string | null;
      guestId: string | null;
      externalGuestId: string | null;
      type: string | null;
      amount: { toNumber: () => number } | null;
    }[],
    sessions: {
      storeId: string | null;
      externalClubId: string | null;
      externalSessionId: string;
      guestId: string | null;
      externalGuestId: string | null;
    }[],
    shifts: {
      storeId: string | null;
      externalClubId: string | null;
      cashAmount: { toNumber: () => number } | null;
      cashlessAmount: { toNumber: () => number } | null;
      mobilePay: { toNumber: () => number } | null;
      refundsCash: { toNumber: () => number } | null;
      refundsCashless: { toNumber: () => number } | null;
    }[],
  ): DashboardRevenueDiagnosticsRow[] {
    const storeIdByExternalClubId = new Map(
      stores
        .filter((store) => store.externalClubId)
        .map((store) => [store.externalClubId as string, store.id]),
    );
    const rowsByStoreId = new Map(
      stores.map((store) => [
        store.id,
        this.emptyRevenueDiagnosticsRow(store.id, store.name),
      ]),
    );
    const productGuestIdsByStore = new Map<string, Set<string>>();
    const transactionGuestIdsByStore = new Map<string, Set<string>>();
    const sessionGuestIdsByStore = new Map<string, Set<string>>();

    const resolveStoreId = (
      storeId?: string | null,
      externalClubId?: string | null,
    ) => {
      if (storeId) {
        return storeId;
      }

      if (externalClubId) {
        return storeIdByExternalClubId.get(externalClubId) ?? null;
      }

      return null;
    };

    const addGuestKey = (
      map: Map<string, Set<string>>,
      storeId: string,
      guestKey?: string | null,
    ) => {
      if (!guestKey) {
        return;
      }

      const values = map.get(storeId) ?? new Set<string>();
      values.add(guestKey);
      map.set(storeId, values);
    };

    salesFacts.forEach((fact) => {
      const row = rowsByStoreId.get(fact.storeId);

      if (!row) {
        return;
      }

      row.productRevenue += fact.revenue.toNumber();
      row.productSalesCount += 1;
      addGuestKey(
        productGuestIdsByStore,
        fact.storeId,
        fact.guestId ?? fact.externalGuestId,
      );
    });

    operationLogs.forEach((operationLog) => {
      const storeId = resolveStoreId(
        operationLog.storeId,
        operationLog.externalClubId,
      );
      const row = storeId ? rowsByStoreId.get(storeId) : null;

      if (!storeId || !row) {
        return;
      }

      const type = operationLog.type ?? 'unknown';
      const amount = operationLog.amount?.toNumber() ?? 0;
      const absoluteAmount = Math.abs(amount);

      this.addDiagnosticsType(row.operationTypes, type, amount);

      if (this.isBalanceTopUpOperationType(type)) {
        row.operationPlusAmount += absoluteAmount;
        row.operationPlusCount += 1;
      } else if (this.isBalanceSpendOperationType(type)) {
        row.operationMinusAmount += absoluteAmount;
        row.operationMinusCount += 1;
      } else {
        row.operationOtherAmount += absoluteAmount;
        row.operationOtherCount += 1;
      }
    });

    transactions.forEach((transaction) => {
      const storeId = resolveStoreId(
        transaction.storeId,
        transaction.externalClubId,
      );
      const row = storeId ? rowsByStoreId.get(storeId) : null;

      if (!storeId || !row) {
        return;
      }

      const amount = transaction.amount?.toNumber() ?? 0;
      const spendAmount = this.confirmedTransactionSpendAmount(
        transaction.type,
        amount,
      );
      row.transactionCount += 1;
      row.transactionNetAmount += amount;
      this.addDiagnosticsType(
        row.transactionTypes,
        transaction.type ?? 'unknown',
        amount,
      );

      if (amount >= 0) {
        row.transactionPositiveAmount += amount;
      } else {
        row.transactionNegativeAmount += Math.abs(amount);
      }
      row.transactionSpendAmount += spendAmount;

      addGuestKey(
        transactionGuestIdsByStore,
        storeId,
        transaction.guestId ?? transaction.externalGuestId,
      );
    });

    sessions.forEach((session) => {
      const storeId = resolveStoreId(session.storeId, session.externalClubId);
      const row = storeId ? rowsByStoreId.get(storeId) : null;

      if (!storeId || !row) {
        return;
      }

      row.sessionsCount += 1;
      addGuestKey(
        sessionGuestIdsByStore,
        storeId,
        session.guestId ??
          session.externalGuestId ??
          `session:${session.externalSessionId}`,
      );
    });

    shifts.forEach((shift) => {
      const storeId = resolveStoreId(shift.storeId, shift.externalClubId);
      const row = storeId ? rowsByStoreId.get(storeId) : null;

      if (!row) {
        return;
      }

      row.shiftsCount += 1;
      row.shiftCashAmount += shift.cashAmount?.toNumber() ?? 0;
      row.shiftCashlessAmount += shift.cashlessAmount?.toNumber() ?? 0;
      row.shiftMobilePayAmount += shift.mobilePay?.toNumber() ?? 0;
      row.shiftRefundAmount +=
        (shift.refundsCash?.toNumber() ?? 0) +
        (shift.refundsCashless?.toNumber() ?? 0);
    });

    return [...rowsByStoreId.values()]
      .map((row) => {
        row.productGuests = productGuestIdsByStore.get(row.storeId)?.size ?? 0;
        row.transactionGuests =
          transactionGuestIdsByStore.get(row.storeId)?.size ?? 0;
        row.activeGuests = sessionGuestIdsByStore.get(row.storeId)?.size ?? 0;
        row.operationNetAmount =
          row.operationPlusAmount - row.operationMinusAmount;
        row.shiftRevenueCandidate =
          row.shiftCashAmount +
          row.shiftCashlessAmount +
          row.shiftMobilePayAmount -
          row.shiftRefundAmount;
        row.balanceSpendRevenueCandidate = Math.max(
          row.operationMinusAmount,
          row.transactionSpendAmount,
        );
        row.notes = this.revenueDiagnosticsNotes(row);

        return this.roundRevenueDiagnosticsRow(row);
      })
      .sort(
        (a, b) =>
          b.balanceSpendRevenueCandidate - a.balanceSpendRevenueCandidate ||
          b.operationPlusAmount - a.operationPlusAmount ||
          b.productRevenue - a.productRevenue ||
          a.storeName.localeCompare(b.storeName),
      );
  }

  private buildRevenueDiagnosticsUnallocatedTopups(
    operationLogs: {
      storeId: string | null;
      externalClubId: string | null;
      type: string | null;
      operationName?: string | null;
      operationSource?: string | null;
      operationForm?: string | null;
      amount: { toNumber: () => number } | null;
    }[],
  ): DashboardRevenueDiagnosticsUnallocatedTopups {
    const result: DashboardRevenueDiagnosticsUnallocatedTopups = {
      amount: 0,
      count: 0,
      breakdown: [],
    };

    operationLogs.forEach((operationLog) => {
      const amount = operationLog.amount?.toNumber() ?? 0;

      if (
        !Number.isFinite(amount) ||
        amount === 0 ||
        !this.isUnallocatedNetworkTopup(operationLog)
      ) {
        return;
      }

      const absoluteAmount = Math.abs(amount);
      result.amount += absoluteAmount;
      result.count += 1;
      this.addDiagnosticsType(
        result.breakdown,
        this.operationChannelLabel(operationLog),
        absoluteAmount,
      );
    });

    return {
      amount: this.round(result.amount),
      count: result.count,
      breakdown: this.sortDiagnosticsTypes(result.breakdown).map((item) => ({
        ...item,
        amount: this.round(item.amount),
      })),
    };
  }

  private buildRevenueDiagnosticsScenarios(
    totals: Omit<
      DashboardRevenueDiagnosticsRow,
      'storeId' | 'storeName' | 'notes'
    >,
    unallocatedTopups: DashboardRevenueDiagnosticsUnallocatedTopups,
  ): DashboardRevenueDiagnosticsScenario[] {
    const allocatedClubRevenue = Math.max(
      totals.productRevenue,
      totals.balanceSpendRevenueCandidate,
    );
    const dashboardNetworkRevenue =
      allocatedClubRevenue + unallocatedTopups.amount;
    const balanceTopupFlow =
      totals.operationPlusAmount + unallocatedTopups.amount;

    return [
      {
        key: 'dashboard-network-revenue',
        title: 'Текущий KPI сети',
        amount: this.round(dashboardNetworkRevenue),
        formula:
          'max(бар/товары, списания баланса) + нераспределенные online-пополнения',
        description:
          'Сумма, которую сводный дашборд может использовать как сетевую выручку: клубная часть отдельно, online-пополнения отдельно.',
        includes: [
          'products/expense',
          'all_operations_log/list или transactions/list',
          'нераспределенные online-пополнения',
        ],
        excludes: ['working_shifts/list', 'balances/list'],
        recommendation: 'PRIMARY',
      },
      {
        key: 'allocated-club-revenue',
        title: 'Разнесено по клубам',
        amount: this.round(allocatedClubRevenue),
        formula: 'max(бар/товары, списания баланса)',
        description:
          'Клубная часть без сетевых online-пополнений. Ее можно использовать для сравнения клубов и управленческих KPI по точкам.',
        includes: [
          'products/expense',
          'all_operations_log/list или transactions/list',
        ],
        excludes: ['нераспределенные online-пополнения', 'working_shifts/list'],
        recommendation: 'PRIMARY',
      },
      {
        key: 'balance-spend-revenue',
        title: 'Списания баланса',
        amount: this.round(totals.balanceSpendRevenueCandidate),
        formula:
          'max(списания all_operations_log, подтвержденные расходы transactions)',
        description:
          'Основной кандидат на игровую и сервисную выручку клуба: деньги признаются в момент списания внутри клуба.',
        includes: ['all_operations_log/list', 'transactions/list'],
        excludes: ['пополнения баланса', 'остатки балансов'],
        recommendation: 'PRIMARY',
      },
      {
        key: 'products-bar-revenue',
        title: 'Бар и товары',
        amount: this.round(totals.productRevenue),
        formula: 'сумма продаж products/expense',
        description:
          'Ассортиментная выручка: бар, товары и товарные позиции, которые уже попали в sales facts.',
        includes: ['products/expense'],
        excludes: ['игровые списания', 'online-пополнения'],
        recommendation: 'CHECK',
      },
      {
        key: 'shift-cash-revenue',
        title: 'Сменная касса',
        amount: this.round(totals.shiftRevenueCandidate),
        formula: 'cash + cashless + mobilePay - refunds',
        description:
          'Операционная сверка по сменам. Полезно для контроля кассы, но не заменяет выручку по гостевым списаниям.',
        includes: [
          'working_shifts/list',
          'log_cash_transaction/list как будущая сверка',
        ],
        excludes: ['нераспределенные online-пополнения'],
        recommendation: 'CHECK',
      },
      {
        key: 'balance-topup-flow',
        title: 'Пополнения как денежный поток',
        amount: this.round(balanceTopupFlow),
        formula: 'пополнения в клубах + нераспределенные online-пополнения',
        description:
          'Это входящий денежный поток, но не всегда выручка клуба: часть денег может лежать на балансе гостя до будущего списания.',
        includes: ['all_operations_log/list', 'transactions/list как контроль'],
        excludes: ['признание выручки по клубу до списания'],
        recommendation: 'EXCLUDED',
      },
    ];
  }

  private buildRevenueDiagnosticsSourceMetrics(
    totals: Omit<
      DashboardRevenueDiagnosticsRow,
      'storeId' | 'storeName' | 'notes'
    >,
    unallocatedTopups: DashboardRevenueDiagnosticsUnallocatedTopups,
  ): DashboardRevenueDiagnosticsSourceMetric[] {
    return [
      {
        key: 'products-expense',
        title: 'Бар и товары',
        endpoint: 'GET /public_api/products/expense',
        amount: this.round(totals.productRevenue),
        count: totals.productSalesCount,
        includedInNetworkRevenue: true,
        includedInClubRevenue: true,
        role: 'PRIMARY',
        note: 'Товарная выручка и ассортиментные продажи, уже сохраненные как sales facts.',
      },
      {
        key: 'operation-spend',
        title: 'Списания баланса',
        endpoint: 'GET /public_api/all_operations_log/list',
        amount: this.round(totals.operationMinusAmount),
        count: totals.operationMinusCount,
        includedInNetworkRevenue: true,
        includedInClubRevenue: true,
        role: 'PRIMARY',
        note: 'Основной источник признания игровой/сервисной выручки в клубе.',
      },
      {
        key: 'transactions-spend',
        title: 'Расходы по транзакциям',
        endpoint: 'GET /public_api/transactions/list',
        amount: this.round(totals.transactionSpendAmount),
        count: totals.transactionCount,
        includedInNetworkRevenue: true,
        includedInClubRevenue: true,
        role: 'CONTROL',
        note: 'Используется как сверка списаний, пока семантика type/amount подтверждается на production.',
      },
      {
        key: 'unallocated-topups',
        title: 'Online-пополнения без клуба',
        endpoint: 'GET /public_api/all_operations_log/list',
        amount: this.round(unallocatedTopups.amount),
        count: unallocatedTopups.count,
        includedInNetworkRevenue: true,
        includedInClubRevenue: false,
        role: 'PRIMARY',
        note: 'Входит в сетевую выручку как нераспределенный денежный поток, но не назначается конкретному клубу.',
      },
      {
        key: 'working-shifts',
        title: 'Сменная касса',
        endpoint: 'GET /public_api/working_shifts/list',
        amount: this.round(totals.shiftRevenueCandidate),
        count: totals.shiftsCount,
        includedInNetworkRevenue: false,
        includedInClubRevenue: false,
        role: 'CONTROL',
        note: 'Нужна для операционной сверки кассы, возвратов и смен, но не является самостоятельным KPI выручки.',
      },
      {
        key: 'balances',
        title: 'Остатки балансов',
        endpoint: 'GET /public_api/balances/list',
        amount: null,
        count: null,
        includedInNetworkRevenue: false,
        includedInClubRevenue: false,
        role: 'EXCLUDED',
        note: 'Остаток на балансе гостя не является выручкой периода; использовать как контроль будущих списаний после отдельной синхронизации.',
      },
      {
        key: 'cash-log',
        title: 'Кассовый лог',
        endpoint: 'GET /public_api/log_cash_transaction/list',
        amount: null,
        count: null,
        includedInNetworkRevenue: false,
        includedInClubRevenue: false,
        role: 'CONTROL',
        note: 'Оставлен как будущий слой сверки кассы после подтверждения стабильных параметров и ответов Langame.',
      },
    ];
  }

  private operationChannelLabel(operationLog: {
    operationName?: string | null;
    operationSource?: string | null;
    operationForm?: string | null;
    type?: string | null;
  }) {
    const source = operationLog.operationSource?.trim() || 'без source';
    const form = operationLog.operationForm?.trim() || 'без form';
    const name = operationLog.operationName?.trim();

    return name ? `${source} / ${form} / ${name}` : `${source} / ${form}`;
  }

  private emptyRevenueDiagnosticsRow(
    storeId: string,
    storeName: string,
  ): DashboardRevenueDiagnosticsRow {
    return {
      storeId,
      storeName,
      productRevenue: 0,
      productSalesCount: 0,
      productGuests: 0,
      operationPlusAmount: 0,
      operationMinusAmount: 0,
      operationNetAmount: 0,
      operationPlusCount: 0,
      operationMinusCount: 0,
      operationOtherAmount: 0,
      operationOtherCount: 0,
      transactionPositiveAmount: 0,
      transactionNegativeAmount: 0,
      transactionSpendAmount: 0,
      transactionNetAmount: 0,
      transactionCount: 0,
      transactionGuests: 0,
      sessionsCount: 0,
      activeGuests: 0,
      shiftsCount: 0,
      shiftCashAmount: 0,
      shiftCashlessAmount: 0,
      shiftMobilePayAmount: 0,
      shiftRefundAmount: 0,
      shiftRevenueCandidate: 0,
      balanceSpendRevenueCandidate: 0,
      operationTypes: [],
      transactionTypes: [],
      notes: [],
    };
  }

  private addDiagnosticsType(
    items: DashboardRevenueDiagnosticsTypeBreakdown[],
    type: string,
    amount: number,
  ) {
    const existing = items.find((item) => item.type === type);

    if (existing) {
      existing.count += 1;
      existing.amount += amount;
      return;
    }

    items.push({ type, count: 1, amount });
  }

  private sortDiagnosticsTypes(
    items: DashboardRevenueDiagnosticsTypeBreakdown[],
  ) {
    return [...items].sort((a, b) => b.amount - a.amount || b.count - a.count);
  }

  private revenueDiagnosticsNotes(row: DashboardRevenueDiagnosticsRow) {
    const notes: string[] = [];

    if (row.operationPlusAmount > 0 && row.operationMinusAmount === 0) {
      notes.push(
        'Есть только plus-операции: это может быть пополнение баланса, а не клубная выручка.',
      );
    }

    if (row.operationMinusAmount > 0) {
      notes.push(
        'Есть minus-операции: кандидат на выручку клуба через списание баланса в клубе.',
      );
    }

    if (row.productRevenue > row.balanceSpendRevenueCandidate) {
      notes.push(
        'Товары/бар больше списаний баланса: часть продаж могла идти напрямую по кассе или источник списаний неполный.',
      );
    }

    if (row.activeGuests === 0 && row.productGuests > 0) {
      notes.push(
        'В продажах есть гости, но в сессиях по клубу их нет: нужна проверка связки sessions.club_id.',
      );
    }

    if (row.shiftRevenueCandidate > 0) {
      notes.push(
        'Смены дают отдельный кассовый кандидат; его нужно сверить с operation log перед использованием в дашборде.',
      );
    }

    return notes;
  }

  private roundRevenueDiagnosticsRow(
    row: DashboardRevenueDiagnosticsRow,
  ): DashboardRevenueDiagnosticsRow {
    const roundType = (item: DashboardRevenueDiagnosticsTypeBreakdown) => ({
      ...item,
      amount: this.round(item.amount),
    });

    return {
      ...row,
      productRevenue: this.round(row.productRevenue),
      operationPlusAmount: this.round(row.operationPlusAmount),
      operationMinusAmount: this.round(row.operationMinusAmount),
      operationNetAmount: this.round(row.operationNetAmount),
      operationOtherAmount: this.round(row.operationOtherAmount),
      transactionPositiveAmount: this.round(row.transactionPositiveAmount),
      transactionNegativeAmount: this.round(row.transactionNegativeAmount),
      transactionSpendAmount: this.round(row.transactionSpendAmount),
      transactionNetAmount: this.round(row.transactionNetAmount),
      shiftCashAmount: this.round(row.shiftCashAmount),
      shiftCashlessAmount: this.round(row.shiftCashlessAmount),
      shiftMobilePayAmount: this.round(row.shiftMobilePayAmount),
      shiftRefundAmount: this.round(row.shiftRefundAmount),
      shiftRevenueCandidate: this.round(row.shiftRevenueCandidate),
      balanceSpendRevenueCandidate: this.round(
        row.balanceSpendRevenueCandidate,
      ),
      operationTypes: row.operationTypes
        .map(roundType)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      transactionTypes: row.transactionTypes
        .map(roundType)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }

  private buildRevenueDiagnosticsTotals(
    rows: DashboardRevenueDiagnosticsRow[],
  ): Omit<DashboardRevenueDiagnosticsRow, 'storeId' | 'storeName' | 'notes'> {
    const totals = this.emptyRevenueDiagnosticsRow('total', 'Итого');

    rows.forEach((row) => {
      totals.productRevenue += row.productRevenue;
      totals.productSalesCount += row.productSalesCount;
      totals.productGuests += row.productGuests;
      totals.operationPlusAmount += row.operationPlusAmount;
      totals.operationMinusAmount += row.operationMinusAmount;
      totals.operationNetAmount += row.operationNetAmount;
      totals.operationPlusCount += row.operationPlusCount;
      totals.operationMinusCount += row.operationMinusCount;
      totals.operationOtherAmount += row.operationOtherAmount;
      totals.operationOtherCount += row.operationOtherCount;
      totals.transactionPositiveAmount += row.transactionPositiveAmount;
      totals.transactionNegativeAmount += row.transactionNegativeAmount;
      totals.transactionSpendAmount += row.transactionSpendAmount;
      totals.transactionNetAmount += row.transactionNetAmount;
      totals.transactionCount += row.transactionCount;
      totals.transactionGuests += row.transactionGuests;
      totals.sessionsCount += row.sessionsCount;
      totals.activeGuests += row.activeGuests;
      totals.shiftsCount += row.shiftsCount;
      totals.shiftCashAmount += row.shiftCashAmount;
      totals.shiftCashlessAmount += row.shiftCashlessAmount;
      totals.shiftMobilePayAmount += row.shiftMobilePayAmount;
      totals.shiftRefundAmount += row.shiftRefundAmount;
      totals.shiftRevenueCandidate += row.shiftRevenueCandidate;
      totals.balanceSpendRevenueCandidate += row.balanceSpendRevenueCandidate;
      row.operationTypes.forEach((item) =>
        this.addDiagnosticsType(totals.operationTypes, item.type, item.amount),
      );
      row.transactionTypes.forEach((item) =>
        this.addDiagnosticsType(
          totals.transactionTypes,
          item.type,
          item.amount,
        ),
      );
    });

    const totalRow = this.roundRevenueDiagnosticsRow(totals);

    return {
      productRevenue: totalRow.productRevenue,
      productSalesCount: totalRow.productSalesCount,
      productGuests: totalRow.productGuests,
      operationPlusAmount: totalRow.operationPlusAmount,
      operationMinusAmount: totalRow.operationMinusAmount,
      operationNetAmount: totalRow.operationNetAmount,
      operationPlusCount: totalRow.operationPlusCount,
      operationMinusCount: totalRow.operationMinusCount,
      operationOtherAmount: totalRow.operationOtherAmount,
      operationOtherCount: totalRow.operationOtherCount,
      transactionPositiveAmount: totalRow.transactionPositiveAmount,
      transactionNegativeAmount: totalRow.transactionNegativeAmount,
      transactionSpendAmount: totalRow.transactionSpendAmount,
      transactionNetAmount: totalRow.transactionNetAmount,
      transactionCount: totalRow.transactionCount,
      transactionGuests: totalRow.transactionGuests,
      sessionsCount: totalRow.sessionsCount,
      activeGuests: totalRow.activeGuests,
      shiftsCount: totalRow.shiftsCount,
      shiftCashAmount: totalRow.shiftCashAmount,
      shiftCashlessAmount: totalRow.shiftCashlessAmount,
      shiftMobilePayAmount: totalRow.shiftMobilePayAmount,
      shiftRefundAmount: totalRow.shiftRefundAmount,
      shiftRevenueCandidate: totalRow.shiftRevenueCandidate,
      balanceSpendRevenueCandidate: totalRow.balanceSpendRevenueCandidate,
      operationTypes: totalRow.operationTypes,
      transactionTypes: totalRow.transactionTypes,
    };
  }

  private buildStoreRevenueBreakdown(
    stores: {
      id: string;
      name: string;
      externalClubId: string | null;
    }[],
    salesFacts: {
      storeId: string;
      guestId?: string | null;
      externalProvider?: string | null;
      externalDomain?: string | null;
      externalGuestId?: string | null;
      revenue: { toNumber: () => number };
    }[],
    guestSessions: {
      storeId: string | null;
      externalClubId: string | null;
      externalSessionId: string;
      guestId: string | null;
      externalProvider?: string | null;
      externalDomain?: string | null;
      externalGuestId: string | null;
    }[],
    guestTransactions: {
      storeId: string | null;
      externalClubId: string | null;
      guestId: string | null;
      externalProvider?: string | null;
      externalDomain?: string | null;
      externalGuestId: string | null;
      type: string | null;
      amount: { toNumber: () => number } | null;
    }[],
    guestOperationLogs: {
      storeId: string | null;
      externalClubId: string | null;
      type: string | null;
      amount: { toNumber: () => number } | null;
    }[],
  ): DashboardStoreRevenueMetric[] {
    const productRevenueByStore = new Map<string, number>();
    const transactionRevenueByStore = new Map<string, number>();
    const operationRevenueByStore = new Map<string, number>();
    const guestIdsByStore = new Map<string, Set<string>>();
    const sessionIdsByStore = new Map<string, Set<string>>();
    const saleOperationsByStore = new Map<string, number>();
    const storeIdByExternalClubId = new Map<string, string>();
    const storeIdByGuestKey = new Map<string, string>();

    stores.forEach((store) => {
      if (store.externalClubId) {
        storeIdByExternalClubId.set(store.externalClubId, store.id);
      }
    });

    const resolveStoreId = (
      storeId?: string | null,
      externalClubId?: string | null,
    ) => {
      if (storeId) {
        return storeId;
      }

      if (externalClubId) {
        return storeIdByExternalClubId.get(externalClubId) ?? null;
      }

      return null;
    };

    salesFacts.forEach((fact) => {
      saleOperationsByStore.set(
        fact.storeId,
        (saleOperationsByStore.get(fact.storeId) ?? 0) + 1,
      );
      productRevenueByStore.set(
        fact.storeId,
        (productRevenueByStore.get(fact.storeId) ?? 0) +
          fact.revenue.toNumber(),
      );

      const guestKey = this.guestIdentityKey(fact);
      if (guestKey) {
        const guestIds = guestIdsByStore.get(fact.storeId) ?? new Set<string>();
        guestIds.add(guestKey);
        guestIdsByStore.set(fact.storeId, guestIds);

        if (!storeIdByGuestKey.has(guestKey)) {
          storeIdByGuestKey.set(guestKey, fact.storeId);
        }
      }
    });

    guestSessions.forEach((session) => {
      const storeId = resolveStoreId(session.storeId, session.externalClubId);
      const guestKey = this.guestIdentityKey(session);

      if (!storeId) {
        return;
      }

      const sessionIds = sessionIdsByStore.get(storeId) ?? new Set<string>();
      sessionIds.add(session.externalSessionId);
      sessionIdsByStore.set(storeId, sessionIds);

      if (!guestKey) {
        return;
      }

      storeIdByGuestKey.set(guestKey, storeId);

      const guestIds = guestIdsByStore.get(storeId) ?? new Set<string>();
      guestIds.add(guestKey);
      guestIdsByStore.set(storeId, guestIds);
    });

    guestTransactions.forEach((transaction) => {
      const guestKey = this.guestIdentityKey(transaction);
      const storeId =
        resolveStoreId(transaction.storeId, transaction.externalClubId) ??
        (guestKey ? storeIdByGuestKey.get(guestKey) : null);

      if (!storeId) {
        return;
      }

      transactionRevenueByStore.set(
        storeId,
        (transactionRevenueByStore.get(storeId) ?? 0) +
          this.confirmedTransactionSpendAmount(
            transaction.type,
            transaction.amount?.toNumber() ?? 0,
          ),
      );
    });

    guestOperationLogs.forEach((operationLog) => {
      const storeId = resolveStoreId(
        operationLog.storeId,
        operationLog.externalClubId,
      );

      if (!storeId) {
        return;
      }

      operationRevenueByStore.set(
        storeId,
        (operationRevenueByStore.get(storeId) ?? 0) +
          this.confirmedBalanceSpendAmount(
            operationLog.type,
            operationLog.amount?.toNumber() ?? 0,
          ),
      );
    });

    return stores
      .map((store) => {
        const productRevenue = productRevenueByStore.get(store.id) ?? 0;
        const transactionRevenue = transactionRevenueByStore.get(store.id) ?? 0;
        const operationRevenue = operationRevenueByStore.get(store.id) ?? 0;
        const totalRevenue = Math.max(
          operationRevenue,
          transactionRevenue,
          productRevenue,
        );
        const totalRevenueSource: Exclude<DashboardRevenueSource, 'SNAPSHOT'> =
          totalRevenue <= 0
            ? 'EMPTY'
            : operationRevenue >= transactionRevenue &&
                operationRevenue >= productRevenue
              ? 'BALANCE_OPERATIONS'
              : transactionRevenue >= productRevenue
                ? 'TRANSACTIONS'
                : 'PRODUCTS';
        const visitsCount = sessionIdsByStore.get(store.id)?.size ?? 0;
        const saleOperationCount = saleOperationsByStore.get(store.id) ?? 0;

        return {
          storeId: store.id,
          storeName: store.name,
          totalRevenue: this.round(totalRevenue),
          totalRevenueSource,
          productRevenue: this.round(productRevenue),
          activeGuests: guestIdsByStore.get(store.id)?.size ?? 0,
          visitsCount,
          saleOperationCount,
          saleOperationsPer100Visits:
            visitsCount > 0
              ? this.round((saleOperationCount / visitsCount) * 100)
              : null,
          productRevenueSharePercent: this.ratioPercent(
            productRevenue,
            totalRevenue,
          ),
        };
      })
      .sort(
        (a, b) =>
          b.totalRevenue - a.totalRevenue ||
          b.productRevenue - a.productRevenue ||
          a.storeName.localeCompare(b.storeName),
      );
  }

  private soldQuantityByProduct(
    salesFacts: {
      productId: string;
      quantity: { toNumber: () => number };
    }[],
  ) {
    const soldByProduct = new Map<string, number>();

    salesFacts.forEach((fact) => {
      soldByProduct.set(
        fact.productId,
        (soldByProduct.get(fact.productId) ?? 0) + fact.quantity.toNumber(),
      );
    });

    return soldByProduct;
  }

  private buildSalesTrend(
    salesFacts: {
      productId: string;
      saleDate: Date;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
    }[],
    guestSessions: {
      id?: string;
      externalProvider?: string | null;
      externalDomain?: string | null;
      externalSessionId: string;
      startedAt: Date | null;
    }[],
    fromDate: Date,
    toDate: Date,
    labelGranularity: DashboardTrendGranularity,
    trendMode: DashboardTrendMode,
    activeProducts: { id: string }[],
    inventorySnapshots: {
      storeId: string;
      productId: string;
      snapshotDate: Date;
      quantity: { toNumber: () => number };
    }[],
  ): DashboardSalesTrendSegment[] {
    const segments =
      trendMode === 'custom'
        ? this.buildEqualTrendSegments(fromDate, toDate, labelGranularity)
        : this.buildCalendarTrendSegments(fromDate, toDate, trendMode);

    salesFacts.forEach((fact) => {
      const saleTime = fact.saleDate.getTime();
      const segment = segments.find(
        (item) =>
          saleTime >= item.fromDate.getTime() &&
          saleTime <= item.toDate.getTime(),
      );

      if (!segment) {
        return;
      }

      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();

      segment.revenue += revenue;
      segment.saleOperationCount += 1;
      segment.soldQuantity += fact.quantity.toNumber();
      segment.grossProfit += revenue - cost;
      segment.soldByProduct.set(
        fact.productId,
        (segment.soldByProduct.get(fact.productId) ?? 0) +
          fact.quantity.toNumber(),
      );
    });

    guestSessions.forEach((session, index) => {
      if (!session.startedAt) {
        return;
      }

      const startedAt = session.startedAt.getTime();
      const segment = segments.find(
        (item) =>
          startedAt >= item.fromDate.getTime() &&
          startedAt <= item.toDate.getTime(),
      );

      segment?.visitIds.add(
        session.id ??
          [
            session.externalProvider ?? 'unknown-provider',
            session.externalDomain ?? 'unknown-domain',
            session.externalSessionId || `row-${index}`,
          ].join(':'),
      );
    });

    return segments.map((segment, index) => {
      const previous = segments[index - 1];
      const stockByProduct = this.latestStockByProductAt(
        inventorySnapshots,
        segment.toDate,
      );
      const segmentDays = this.periodDays(segment.fromDate, segment.toDate);
      const noSalesCounts = this.noSalesCountsByPeriod(
        activeProducts,
        stockByProduct,
        salesFacts,
        segment.toDate,
      );
      const noSalesSkuCount = noSalesCounts[7];
      const outOfStockSkuCount = activeProducts.filter((product) => {
        if (!stockByProduct.has(product.id)) {
          return false;
        }

        const sold = segment.soldByProduct.get(product.id) ?? 0;
        const averageDailySales = sold / segmentDays;
        const stock = stockByProduct.get(product.id) ?? 0;
        const stockDays =
          averageDailySales > 0 ? stock / averageDailySales : null;

        return averageDailySales > 0 && stockDays !== null && stockDays <= 3;
      }).length;
      segment.noSalesSkuCount = noSalesSkuCount;
      segment.noSalesSkuCount7 = noSalesCounts[7];
      segment.noSalesSkuCount14 = noSalesCounts[14];
      segment.noSalesSkuCount21 = noSalesCounts[21];
      segment.outOfStockSkuCount = outOfStockSkuCount;
      segment.clubRevenue = Math.max(segment.clubRevenue, segment.revenue);

      return {
        index: segment.index,
        label: segment.label,
        from: this.toDateInputValue(segment.fromDate),
        to: this.toDateInputValue(segment.toDate),
        revenue: this.round(segment.revenue),
        soldQuantity: this.round(segment.soldQuantity),
        grossProfit: this.round(segment.grossProfit),
        visitsCount: segment.visitIds.size,
        saleOperationCount: segment.saleOperationCount,
        saleOperationsPer100Visits:
          segment.visitIds.size > 0
            ? this.round(
                (segment.saleOperationCount / segment.visitIds.size) * 100,
              )
            : null,
        averageSaleOperationAmount:
          segment.saleOperationCount > 0
            ? this.round(segment.revenue / segment.saleOperationCount)
            : null,
        clubRevenue: this.round(segment.clubRevenue),
        revenueSharePercent:
          segment.clubRevenue > 0
            ? this.round((segment.revenue / segment.clubRevenue) * 100)
            : null,
        revenueDeltaPercent: previous
          ? this.deltaPercent(segment.revenue, previous.revenue)
          : null,
        quantityDeltaPercent: previous
          ? this.deltaPercent(segment.soldQuantity, previous.soldQuantity)
          : null,
        noSalesSkuCount,
        noSalesSkuDeltaPercent: previous
          ? this.deltaPercent(noSalesSkuCount, previous.noSalesSkuCount)
          : null,
        noSalesSkuCount7: noSalesCounts[7],
        noSalesSkuDeltaPercent7: previous
          ? this.deltaPercent(noSalesCounts[7], previous.noSalesSkuCount7)
          : null,
        noSalesSkuCount14: noSalesCounts[14],
        noSalesSkuDeltaPercent14: previous
          ? this.deltaPercent(noSalesCounts[14], previous.noSalesSkuCount14)
          : null,
        noSalesSkuCount21: noSalesCounts[21],
        noSalesSkuDeltaPercent21: previous
          ? this.deltaPercent(noSalesCounts[21], previous.noSalesSkuCount21)
          : null,
        outOfStockSkuCount,
        outOfStockSkuDeltaPercent: previous
          ? this.deltaPercent(outOfStockSkuCount, previous.outOfStockSkuCount)
          : null,
      };
    });
  }

  private buildCalendarTrendSegments(
    fromDate: Date,
    toDate: Date,
    granularity: DashboardTrendGranularity,
  ) {
    return Array.from({ length: 8 }, (_, index) => {
      const segmentFrom = this.addTrendPeriods(fromDate, granularity, index);
      const nextSegmentFrom = this.addTrendPeriods(
        fromDate,
        granularity,
        index + 1,
      );
      const segmentTo =
        index === 7 ? toDate : new Date(nextSegmentFrom.getTime() - 1);

      return this.createEmptyTrendSegment(
        index,
        segmentFrom,
        segmentTo,
        granularity,
      );
    });
  }

  private buildEqualTrendSegments(
    fromDate: Date,
    toDate: Date,
    labelGranularity: DashboardTrendGranularity,
  ) {
    const fromTime = fromDate.getTime();
    const toTime = toDate.getTime();
    const segmentDuration = Math.max(1, (toTime - fromTime + 1) / 8);

    return Array.from({ length: 8 }, (_, index) => {
      const segmentFrom = new Date(fromTime + segmentDuration * index);
      const segmentTo = new Date(
        index === 7 ? toTime : fromTime + segmentDuration * (index + 1) - 1,
      );

      return this.createEmptyTrendSegment(
        index,
        segmentFrom,
        segmentTo,
        labelGranularity,
      );
    });
  }

  private createEmptyTrendSegment(
    index: number,
    fromDate: Date,
    toDate: Date,
    labelGranularity: DashboardTrendGranularity,
  ) {
    return {
      index: index + 1,
      label: this.segmentLabel(fromDate, toDate, labelGranularity),
      fromDate,
      toDate,
      revenue: 0,
      soldQuantity: 0,
      grossProfit: 0,
      saleOperationCount: 0,
      visitIds: new Set<string>(),
      clubRevenue: 0,
      soldByProduct: new Map<string, number>(),
      noSalesSkuCount: 0,
      noSalesSkuCount7: 0,
      noSalesSkuCount14: 0,
      noSalesSkuCount21: 0,
      outOfStockSkuCount: 0,
      revenueDeltaPercent: null,
      quantityDeltaPercent: null,
    };
  }

  private segmentLabel(
    fromDate: Date,
    toDate: Date,
    granularity: DashboardTrendGranularity,
  ) {
    const from = this.formatSegmentPoint(fromDate, granularity);
    const to = this.formatSegmentPoint(toDate, granularity);

    return from === to ? from : `${from}–${to}`;
  }

  private formatSegmentPoint(
    date: Date,
    granularity: DashboardTrendGranularity,
  ) {
    if (granularity === 'year') {
      return String(date.getUTCFullYear());
    }

    if (granularity === 'quarter') {
      return `Q${Math.floor(date.getUTCMonth() / 3) + 1}.${this.formatShortYear(date)}`;
    }

    if (granularity === 'month') {
      return `${this.formatShortMonth(date)}.${this.formatShortYear(date)}`;
    }

    if (granularity === 'week') {
      const isoWeek = this.isoWeek(date);

      return `${isoWeek.week}.${isoWeek.year}`;
    }

    return `${this.pad2(date.getUTCDate())}.${this.pad2(date.getUTCMonth() + 1)}`;
  }

  private noSalesTrendFromDate(trendFromDate: Date) {
    const maxDays = Math.max(...NO_SALES_PERIOD_DAYS);
    const fromDate = new Date(trendFromDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (maxDays - 1));
    fromDate.setUTCHours(0, 0, 0, 0);
    return fromDate;
  }

  private noSalesCountsByPeriod(
    activeProducts: Array<{ id: string }>,
    stockByProduct: Map<string, number>,
    salesFacts: Array<{ productId: string; saleDate: Date }>,
    toDate: Date,
  ): Record<NoSalesPeriodDays, number> {
    return NO_SALES_PERIOD_DAYS.reduce(
      (acc, days) => {
        const fromDate = new Date(toDate);
        fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
        fromDate.setUTCHours(0, 0, 0, 0);
        const soldProductIds = new Set(
          salesFacts
            .filter(
              (fact) => fact.saleDate >= fromDate && fact.saleDate <= toDate,
            )
            .map((fact) => fact.productId),
        );

        acc[days] = activeProducts.filter((product) => {
          const stock = stockByProduct.get(product.id) ?? 0;
          return stock > 0 && !soldProductIds.has(product.id);
        }).length;

        return acc;
      },
      {} as Record<NoSalesPeriodDays, number>,
    );
  }

  private formatShortMonth(date: Date) {
    return [
      'янв',
      'фев',
      'мар',
      'апр',
      'май',
      'июн',
      'июл',
      'авг',
      'сен',
      'окт',
      'ноя',
      'дек',
    ][date.getUTCMonth()];
  }

  private formatShortYear(date: Date) {
    return String(date.getUTCFullYear()).slice(-2);
  }

  private resolveTrendLabelGranularity(milliseconds: number) {
    const days = milliseconds / (24 * 60 * 60 * 1000);

    if (days > 730) {
      return 'quarter' as const;
    }

    if (days > 180) {
      return 'month' as const;
    }

    if (days > 62) {
      return 'week' as const;
    }

    return 'day' as const;
  }

  private resolveTrendLabelGranularityByPeriod(period: DashboardPeriod) {
    if (period === 'year') {
      return 'year' as const;
    }

    if (period === 'quarter') {
      return 'quarter' as const;
    }

    if (period === 'month') {
      return 'month' as const;
    }

    if (period === 'week') {
      return 'week' as const;
    }

    if (period === 'custom') {
      return 'day' as const;
    }

    return 'day' as const;
  }

  private resolveTrendModeByPeriod(
    period: DashboardPeriod,
  ): DashboardTrendMode {
    const basePeriod = this.resolveBasePeriod(period);

    if (basePeriod === 'custom') {
      return 'custom';
    }

    if (basePeriod === 'year') {
      return 'year';
    }

    if (basePeriod === 'quarter') {
      return 'quarter';
    }

    if (basePeriod === 'month') {
      return 'month';
    }

    if (basePeriod === 'week') {
      return 'week';
    }

    return 'day';
  }

  private resolveTrendFromDate(period: DashboardPeriod, fromDate: Date) {
    const trendFromDate = new Date(fromDate);

    if (period === 'day') {
      trendFromDate.setUTCDate(trendFromDate.getUTCDate() - 7);
    } else if (period === 'week') {
      trendFromDate.setUTCDate(trendFromDate.getUTCDate() - 7 * 7);
    } else if (period === 'month') {
      trendFromDate.setUTCMonth(trendFromDate.getUTCMonth() - 7);
    } else if (period === 'quarter') {
      trendFromDate.setUTCMonth(trendFromDate.getUTCMonth() - 7 * 3);
    } else if (period === 'year') {
      trendFromDate.setUTCFullYear(trendFromDate.getUTCFullYear() - 7);
    }

    return trendFromDate;
  }

  private addTrendPeriods(
    date: Date,
    granularity: DashboardTrendGranularity,
    amount: number,
  ) {
    const nextDate = new Date(date);

    if (granularity === 'day') {
      nextDate.setUTCDate(nextDate.getUTCDate() + amount);
    } else if (granularity === 'week') {
      nextDate.setUTCDate(nextDate.getUTCDate() + amount * 7);
    } else if (granularity === 'month') {
      nextDate.setUTCMonth(nextDate.getUTCMonth() + amount);
    } else if (granularity === 'quarter') {
      nextDate.setUTCMonth(nextDate.getUTCMonth() + amount * 3);
    } else {
      nextDate.setUTCFullYear(nextDate.getUTCFullYear() + amount);
    }

    return nextDate;
  }

  private isoWeek(date: Date) {
    const current = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = current.getUTCDay() || 7;
    current.setUTCDate(current.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));

    return {
      week: Math.ceil(
        ((current.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      ),
      year: current.getUTCFullYear(),
    };
  }

  private pad2(value: number) {
    return String(value).padStart(2, '0');
  }

  private deltaPercent(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }

    return this.round(((current - previous) / previous) * 100);
  }

  private parseDate(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private resolveAssortmentAsOf(value?: string) {
    const now = new Date();
    if (!value) return now;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const asOf = new Date(
        Date.UTC(
          Number(dateOnly[1]),
          Number(dateOnly[2]) - 1,
          Number(dateOnly[3]),
        ),
      );
      if (
        asOf.getUTCFullYear() !== Number(dateOnly[1]) ||
        asOf.getUTCMonth() !== Number(dateOnly[2]) - 1 ||
        asOf.getUTCDate() !== Number(dateOnly[3])
      ) {
        throw new BadRequestException('asOf must be a valid YYYY-MM-DD date');
      }
      if (asOf.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
        return now;
      }
      asOf.setUTCHours(23, 59, 59, 999);
      if (asOf > now) {
        throw new BadRequestException('asOf must not be in the future');
      }
      return asOf;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      throw new BadRequestException(
        'asOf must be a canonical ISO timestamp or YYYY-MM-DD',
      );
    }
    const asOf = new Date(value);
    if (Number.isNaN(asOf.getTime()) || asOf.toISOString() !== value) {
      throw new BadRequestException(
        'asOf must be a canonical ISO timestamp or YYYY-MM-DD',
      );
    }
    if (asOf > now) {
      throw new BadRequestException('asOf must not be in the future');
    }
    return asOf;
  }

  private resolveNoSalesDays(value: DashboardQuery['noSalesDays']) {
    if (value === undefined) return 21 as AssortmentNoSalesWindow;
    const days = Number(value);
    if (days === 7 || days === 14 || days === 21 || days === 30) {
      return days;
    }
    throw new BadRequestException('noSalesDays must be 7, 14, 21 or 30');
  }

  private resolveNetworkSkuKey(
    name: string,
    article: string,
    keyByName: Map<string, string>,
    keyByArticle: Map<string, string>,
  ) {
    const normalizedName = this.normalizeKey(name);
    const normalizedArticle = this.normalizeKey(article);
    const existingKey =
      keyByName.get(normalizedName) ?? keyByArticle.get(normalizedArticle);
    const key = existingKey ?? `network:${normalizedName || normalizedArticle}`;

    if (normalizedName) {
      keyByName.set(normalizedName, key);
    }

    if (normalizedArticle) {
      keyByArticle.set(normalizedArticle, key);
    }

    return key;
  }

  private normalizeKey(value: string) {
    return value.trim().toLowerCase().replace(/ё/g, 'е');
  }

  private latestStockByProduct(
    snapshots: {
      storeId: string;
      productId: string;
      quantity: { toNumber: () => number };
    }[],
  ) {
    const seen = new Set<string>();
    const stockByProduct = new Map<string, number>();

    snapshots.forEach((snapshot) => {
      const snapshotKey = `${snapshot.storeId}:${snapshot.productId}`;

      if (seen.has(snapshotKey)) {
        return;
      }

      seen.add(snapshotKey);
      stockByProduct.set(
        snapshot.productId,
        (stockByProduct.get(snapshot.productId) ?? 0) +
          snapshot.quantity.toNumber(),
      );
    });

    return stockByProduct;
  }

  private latestStockByProductAt(
    snapshots: {
      storeId: string;
      productId: string;
      snapshotDate: Date;
      quantity: { toNumber: () => number };
    }[],
    atDate: Date,
  ) {
    const seen = new Set<string>();
    const stockByProduct = new Map<string, number>();
    const atTime = atDate.getTime();

    snapshots.forEach((snapshot) => {
      if (snapshot.snapshotDate.getTime() > atTime) {
        return;
      }

      const snapshotKey = `${snapshot.storeId}:${snapshot.productId}`;

      if (seen.has(snapshotKey)) {
        return;
      }

      seen.add(snapshotKey);
      stockByProduct.set(
        snapshot.productId,
        (stockByProduct.get(snapshot.productId) ?? 0) +
          snapshot.quantity.toNumber(),
      );
    });

    return stockByProduct;
  }

  private operationalActiveProductIds(
    products: Array<{ id: string }>,
    stockByProduct: Map<string, number>,
    salesFacts: Array<{ productId: string }>,
  ) {
    const soldProductIds = new Set(salesFacts.map((fact) => fact.productId));

    return new Set(
      products
        .filter(
          (product) =>
            (stockByProduct.get(product.id) ?? 0) > 0 ||
            soldProductIds.has(product.id),
        )
        .map((product) => product.id),
    );
  }

  private buildCategoryAnalytics(
    products: Array<{
      id: string;
      categoryId: string | null;
      category: { name: string } | null;
    }>,
    activeProductIds: Set<string>,
    salesFacts: Array<{
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
      product: {
        categoryId: string | null;
        category: { name: string } | null;
      };
    }>,
    totalRevenue: number,
    grossProfit: number,
  ): DashboardCategoryMetric[] {
    const categories = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        revenue: number;
        grossProfit: number;
        activeSku: number;
      }
    >();
    const ensureCategory = (
      categoryId: string | null,
      categoryName: string | null | undefined,
    ) => {
      const key = categoryId ?? 'uncategorized';
      const current = categories.get(key) ?? {
        categoryId,
        categoryName: categoryName ?? 'Без категории',
        revenue: 0,
        grossProfit: 0,
        activeSku: 0,
      };

      if (categoryName) {
        current.categoryName = categoryName;
      }

      categories.set(key, current);
      return current;
    };

    products.forEach((product) => {
      if (!activeProductIds.has(product.id)) {
        return;
      }

      ensureCategory(product.categoryId, product.category?.name).activeSku += 1;
    });

    salesFacts.forEach((fact) => {
      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();
      const category = ensureCategory(
        fact.product.categoryId,
        fact.product.category?.name,
      );

      category.revenue += revenue;
      category.grossProfit += revenue - cost;
    });

    return [...categories.values()]
      .filter(
        (category) =>
          category.activeSku > 0 ||
          category.revenue !== 0 ||
          category.grossProfit !== 0,
      )
      .map((category) => {
        const revenueSharePercent =
          this.ratioPercent(category.revenue, totalRevenue) ?? 0;
        const grossProfitSharePercent =
          this.ratioPercent(category.grossProfit, grossProfit) ?? 0;

        return {
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          revenue: this.round(category.revenue),
          grossProfit: this.round(category.grossProfit),
          activeSku: category.activeSku,
          revenueSharePercent,
          grossProfitSharePercent,
          profitEfficiency:
            revenueSharePercent > 0
              ? this.round(grossProfitSharePercent / revenueSharePercent)
              : null,
          fillEfficiency:
            category.activeSku > 0
              ? this.round(category.revenue / category.activeSku)
              : null,
        };
      })
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.grossProfit - a.grossProfit ||
          a.categoryName.localeCompare(b.categoryName, 'ru'),
      );
  }

  private stockMovementImpact(
    movements: {
      type: StockMovementType;
      amount: { toNumber: () => number };
    }[],
  ) {
    return movements.reduce(
      (impact, movement) => {
        const amount = movement.amount.toNumber();

        if (movement.type === StockMovementType.WRITEOFF) {
          impact.writeOffAmount += amount;
        } else {
          impact.returnAmount += amount;
        }

        return impact;
      },
      {
        writeOffAmount: 0,
        returnAmount: 0,
      },
    );
  }

  private recommendedOrder(
    dailyNeed: number,
    orderMultiplicity: number | null,
  ) {
    if (dailyNeed <= 0) {
      return 0;
    }

    if (!orderMultiplicity || orderMultiplicity <= 1) {
      return Math.ceil(dailyNeed);
    }

    return Math.ceil(dailyNeed / orderMultiplicity) * orderMultiplicity;
  }

  private buildMarginCoverage(
    rows: Array<{ revenue: number; cost: number }>,
  ): DashboardMarginCoverage {
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const coveredRows = rows.filter((row) => row.revenue <= 0 || row.cost > 0);
    const coveredRevenue = coveredRows.reduce(
      (sum, row) => sum + row.revenue,
      0,
    );
    const coveredCost = coveredRows.reduce((sum, row) => sum + row.cost, 0);
    const partialGrossProfit = coveredRevenue - coveredCost;
    const fullyCovered = rows.length > 0 && coveredRows.length === rows.length;

    return {
      state: fullyCovered
        ? 'READY'
        : coveredRows.length > 0
          ? 'PARTIAL'
          : 'UNKNOWN',
      fullMarginPercent: fullyCovered
        ? this.marginPercent(coveredCost, coveredRevenue)
        : null,
      fullGrossProfit: fullyCovered ? this.round(partialGrossProfit) : null,
      partialMarginPercent:
        coveredRows.length > 0
          ? this.marginPercent(coveredCost, coveredRevenue)
          : null,
      partialGrossProfit:
        coveredRows.length > 0 ? this.round(partialGrossProfit) : null,
      coveredRevenue: this.round(coveredRevenue),
      coveredOperations: coveredRows.length,
      totalRevenue: this.round(totalRevenue),
      totalOperations: rows.length,
    };
  }

  private marginPercent(cost: number, revenue: number) {
    if (revenue <= 0) {
      return 0;
    }

    return this.round(((revenue - cost) / revenue) * 100);
  }

  private periodDays(fromDate: Date, toDate: Date) {
    const millisecondsInDay = 24 * 60 * 60 * 1000;
    return Math.max(
      1,
      Math.ceil((toDate.getTime() - fromDate.getTime()) / millisecondsInDay),
    );
  }

  private toDateInputValue(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
