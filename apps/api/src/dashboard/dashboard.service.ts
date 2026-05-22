import { BadRequestException, Injectable } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { TenantContextService } from '../tenancy/tenant-context.service';

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
  skuGrouping?: DashboardSkuGrouping;
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
  productRevenue: number;
  activeGuests: number;
  productRevenueSharePercent: number | null;
};

type DashboardTrendGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
type DashboardTrendMode = DashboardTrendGranularity | 'custom';

const DEMAND_PERIOD_DAYS = 21;
const ACTIVE_SKU_SALES_DAYS = 14;
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

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  periodLabel: string;
  skuGrouping: DashboardSkuGrouping;
  selectedStoreIds: string[];
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
  fullDayRevenueDate: string;
  fullDayRevenue: number;
  averageDailyRevenue: number;
  fullDayRevenueToAveragePercent: number | null;
  writeOffRevenuePercent: number | null;
  previousWriteOffRevenuePercent: number | null;
  writeOffRevenuePercentDelta: number | null;
  grossProfit: number;
  adjustedGrossProfit: number;
  marginPercent: number;
  adjustedMarginPercent: number;
  soldQuantity: number;
  writeOffAmount: number;
  returnAmount: number;
  stockQuantity: number;
  outOfStockRiskCount: number;
  recommendedOrderQuantity: number;
  storeRevenueBreakdown: DashboardStoreRevenueMetric[];
  salesTrend: DashboardSalesTrendSegment[];
  categoryAnalytics: DashboardCategoryMetric[];
  topSkuByRevenue: DashboardTopSku[];
};

export type DashboardRevenueDiagnosticsTypeBreakdown = {
  type: string;
  count: number;
  amount: number;
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
  rows: DashboardRevenueDiagnosticsRow[];
  totals: Omit<
    DashboardRevenueDiagnosticsRow,
    'storeId' | 'storeName' | 'notes'
  >;
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
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getSummary(
    user?: AuthenticatedUser,
    query: DashboardQuery = {},
  ): Promise<DashboardSummary> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const selectedStoreIds = this.resolveStoreIds(query.storeIds);
    const storeFilter =
      selectedStoreIds.length > 0 ? { storeId: { in: selectedStoreIds } } : {};
    const skuGrouping = query.skuGrouping === 'club' ? 'club' : 'network';
    const demandPeriod = this.resolveDemandPeriod();
    const activeSkuPeriod = this.resolveActiveSkuPeriod();
    const fullDayPeriod = this.resolveFullDayRevenuePeriod(
      period.fromDate,
      period.toDate,
    );
    const previousPeriod = this.resolvePreviousComparablePeriod(
      period.fromDate,
      period.toDate,
      period.mode,
    );

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
      periodGuestSessions,
      periodGuestTransactions,
      periodGuestOperationLogs,
      fullDayRevenueFacts,
      previousSalesFacts,
      previousStockMovements,
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
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.category.count({ where: { tenantId } }),
      this.prisma.supplier.count({ where: { tenantId } }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          article: true,
          name: true,
          purchasePrice: true,
          salePrice: true,
          facing: true,
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
          snapshotDate: {
            lte: period.toDate,
          },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          ...storeFilter,
          snapshotDate: {
            lte: activeSkuPeriod.toDate,
          },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...storeFilter,
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
          saleDate: {
            gte: previousPeriod.fromDate,
            lte: previousPeriod.toDate,
          },
        },
        select: {
          revenue: true,
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...storeFilter,
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
      period.trendFromDate,
      period.trendToDate,
      period.labelGranularity,
      period.trendMode,
      productsForAverages,
      inventorySnapshots,
    );
    const demand = productsForAverages.map((product) => {
      const sold = demandSoldByProduct.get(product.id) ?? 0;
      const averageDailySales = sold / DEMAND_PERIOD_DAYS;
      const stock = stockByProduct.get(product.id) ?? 0;

      return {
        stock,
        averageDailySales,
        stockDays: averageDailySales > 0 ? stock / averageDailySales : null,
        recommendedOrder: this.recommendedOrder(
          Math.max(0, averageDailySales - stock),
          product.supplier?.orderMultiplicity ?? null,
        ),
      };
    });
    const fullDayRevenue = this.fullDayRevenueComparison(
      fullDayRevenueFacts,
      fullDayPeriod,
    );
    const confirmedBalanceSpendRevenue = Math.max(
      this.guestOperationRevenueTotal(periodGuestOperationLogs),
      this.guestTransactionTotal(periodGuestTransactions),
    );
    const balanceTopupRevenue = this.guestOperationTopupTotal(
      periodGuestOperationLogs,
    );
    const clubRevenue =
      Math.max(totalRevenue, confirmedBalanceSpendRevenue) +
      balanceTopupRevenue;
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
    const previousMovementImpact = this.stockMovementImpact(
      previousStockMovements,
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

    return {
      tenantId,
      tenantSlug,
      tenantName: tenant?.name ?? tenantSlug,
      periodLabel: period.label,
      skuGrouping,
      selectedStoreIds,
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
      grossProfit: this.round(grossProfit),
      adjustedGrossProfit: this.round(adjustedGrossProfit),
      marginPercent: this.marginPercent(totalCost, totalRevenue),
      adjustedMarginPercent: this.marginPercent(
        totalRevenue - adjustedGrossProfit,
        totalRevenue,
      ),
      soldQuantity: this.round(soldQuantity),
      writeOffAmount: this.round(movementImpact.writeOffAmount),
      returnAmount: this.round(movementImpact.returnAmount),
      stockQuantity: this.round(stockQuantity),
      outOfStockRiskCount: demand.filter(
        (item) =>
          item.averageDailySales > 0 &&
          item.stockDays !== null &&
          item.stockDays <= 3,
      ).length,
      recommendedOrderQuantity: this.round(
        demand.reduce((sum, item) => sum + item.recommendedOrder, 0),
      ),
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
    };
  }

  async getRevenueDiagnostics(
    user?: AuthenticatedUser,
    query: DashboardQuery = {},
  ): Promise<DashboardRevenueDiagnostics> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const selectedStoreIds = this.resolveStoreIds(query.storeIds);
    const storeFilter =
      selectedStoreIds.length > 0 ? { storeId: { in: selectedStoreIds } } : {};
    const [
      tenant,
      stores,
      salesFacts,
      operationLogs,
      transactions,
      sessions,
      shifts,
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

    return {
      tenantId,
      tenantSlug,
      tenantName: tenant?.name ?? tenantSlug,
      periodLabel: period.label,
      periodFrom: this.toDateInputValue(period.fromDate),
      periodTo: this.toDateInputValue(period.toDate),
      selectedStoreIds,
      rows,
      totals,
      interpretation: {
        primaryRecommendation:
          'Для выручки клуба использовать подтвержденные списания/расход баланса внутри клуба, а мобильные пополнения держать отдельно как сетевой денежный поток.',
        mobileTopupRule:
          'Пополнение баланса в мобильном приложении не должно увеличивать выручку конкретного клуба; клуб получает выручку в момент списания баланса на сессию, услугу или покупку в этом клубе.',
        limitations: [
          'В GuestOperationLog сейчас сохранены type, сумма, дата и клуб, но не сохранены source/form/name, поэтому нельзя надежно отделить мобильное приложение, кассу и терминал без расширения модели.',
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
    const period = this.isDashboardPeriod(query.period) ? query.period : 'day';
    let trendPeriod = this.resolveBasePeriod(period);
    let label = 'Текущие сутки';

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

  private resolveStoreIds(storeIds?: string | string[]) {
    if (!storeIds) {
      return [];
    }

    const values = Array.isArray(storeIds) ? storeIds : storeIds.split(',');

    return values.map((value) => value.trim()).filter(Boolean);
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

  private resolveFullDayRevenuePeriod(
    periodFromDate: Date,
    periodToDate: Date,
  ) {
    const now = new Date();
    const currentFromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const currentToDate = new Date(currentFromDate);
    currentToDate.setUTCHours(23, 59, 59, 999);
    let averageFromDate = new Date(periodFromDate);
    averageFromDate.setUTCHours(0, 0, 0, 0);
    let averageToDate = new Date(
      Math.min(periodToDate.getTime(), currentToDate.getTime()),
    );
    averageToDate.setUTCHours(23, 59, 59, 999);

    if (averageFromDate > averageToDate) {
      averageToDate = new Date(currentFromDate);
      averageToDate.setUTCDate(averageToDate.getUTCDate() - 1);
      averageToDate.setUTCHours(23, 59, 59, 999);
      averageFromDate = new Date(averageToDate);
      averageFromDate.setUTCDate(averageFromDate.getUTCDate() - 6);
      averageFromDate.setUTCHours(0, 0, 0, 0);
    }

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

    if (operationLog.storeId || operationLog.externalClubId) {
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
      externalGuestId?: string | null;
      revenue: { toNumber: () => number };
    }[],
    guestSessions: {
      storeId: string | null;
      externalClubId: string | null;
      externalSessionId: string;
      guestId: string | null;
      externalGuestId: string | null;
    }[],
    guestTransactions: {
      storeId: string | null;
      externalClubId: string | null;
      guestId: string | null;
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
      productRevenueByStore.set(
        fact.storeId,
        (productRevenueByStore.get(fact.storeId) ?? 0) +
          fact.revenue.toNumber(),
      );

      const guestKey = fact.guestId ?? fact.externalGuestId;
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
      const guestKey =
        session.guestId ??
        session.externalGuestId ??
        `session:${session.externalSessionId}`;

      if (!storeId || !guestKey) {
        return;
      }

      if (session.guestId || session.externalGuestId) {
        storeIdByGuestKey.set(
          session.guestId ?? session.externalGuestId!,
          storeId,
        );
      }

      const guestIds = guestIdsByStore.get(storeId) ?? new Set<string>();
      guestIds.add(guestKey);
      guestIdsByStore.set(storeId, guestIds);
    });

    guestTransactions.forEach((transaction) => {
      const guestKey = transaction.guestId ?? transaction.externalGuestId;
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

        return {
          storeId: store.id,
          storeName: store.name,
          totalRevenue: this.round(totalRevenue),
          productRevenue: this.round(productRevenue),
          activeGuests: guestIdsByStore.get(store.id)?.size ?? 0,
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
      segment.soldQuantity += fact.quantity.toNumber();
      segment.grossProfit += revenue - cost;
      segment.soldByProduct.set(
        fact.productId,
        (segment.soldByProduct.get(fact.productId) ?? 0) +
          fact.quantity.toNumber(),
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
