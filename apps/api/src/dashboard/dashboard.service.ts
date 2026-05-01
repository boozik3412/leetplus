import { BadRequestException, Injectable } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type DashboardPeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
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

type DashboardTrendGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';
type DashboardTrendMode = DashboardTrendGranularity | 'custom';

const DEMAND_PERIOD_DAYS = 21;

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
  salesTrend: DashboardSalesTrendSegment[];
  topSkuByRevenue: DashboardTopSku[];
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
    const fullDayPeriod = this.resolveFullDayRevenuePeriod();
    const previousPeriod = this.resolvePreviousComparablePeriod(
      period.fromDate,
      period.toDate,
      period.mode,
    );

    const [
      tenant,
      totalSku,
      activeSku,
      categoriesCount,
      suppliersCount,
      productsForAverages,
      salesFacts,
      trendSalesFacts,
      trendClubRevenueFacts,
      demandSalesFacts,
      inventorySnapshots,
      stockMovements,
      fullDayRevenueFacts,
      previousSalesFacts,
      previousStockMovements,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
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
          ...storeFilter,
          saleDate: {
            gte: period.trendFromDate,
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
      this.prisma.clubRevenueFact.findMany({
        where: {
          tenantId,
          ...storeFilter,
          revenueDate: {
            gte: period.trendFromDate,
            lte: period.trendToDate,
          },
        },
        select: {
          revenueDate: true,
          totalRevenue: true,
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
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
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          ...storeFilter,
          saleDate: {
            gte: fullDayPeriod.currentFromDate,
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
    const demandSoldByProduct = this.soldQuantityByProduct(demandSalesFacts);
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const salesTrend = this.buildSalesTrend(
      trendSalesFacts,
      trendClubRevenueFacts,
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
    const averageDailyRevenue = this.averageDailyRevenue(
      totalRevenue,
      period.fromDate,
      period.toDate,
    );
    const previousRevenue = previousSalesFacts.reduce(
      (sum, fact) => sum + fact.revenue.toNumber(),
      0,
    );
    const previousMovementImpact =
      this.stockMovementImpact(previousStockMovements);
    const writeOffRevenuePercent = this.ratioPercent(
      movementImpact.writeOffAmount,
      totalRevenue,
    );
    const previousWriteOffRevenuePercent = this.ratioPercent(
      previousMovementImpact.writeOffAmount,
      previousRevenue,
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
      activeSku,
      categoriesCount,
      suppliersCount,
      averageMarginPercent: this.round(averageMarginPercent),
      averageFacing: this.round(averageFacing),
      totalRevenue: this.round(totalRevenue),
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
      salesTrend,
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

  private resolvePeriod(query: DashboardQuery) {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    let fromDate = new Date(toDate);
    const period = query.period ?? 'month';
    let label = 'Текущий месяц';

    if (period === 'day') {
      label = 'Текущие сутки';
    } else if (period === 'week') {
      const dayOfWeek = fromDate.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      fromDate.setUTCDate(fromDate.getUTCDate() - mondayOffset);
      label = 'Текущая неделя';
    } else if (period === 'quarter') {
      const quarterStartMonth = Math.floor(toDate.getUTCMonth() / 3) * 3;
      fromDate = new Date(
        Date.UTC(toDate.getUTCFullYear(), quarterStartMonth, 1),
      );
      label = 'Текущий квартал';
    } else if (period === 'year') {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
      label = 'Текущий год';
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

      return {
        fromDate,
        toDate: customToDate,
        trendFromDate: fromDate,
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
    }

    toDate.setUTCHours(23, 59, 59, 999);
    fromDate.setUTCHours(0, 0, 0, 0);

    return {
      fromDate,
      toDate,
      trendFromDate: this.resolveTrendFromDate(period, fromDate),
      trendToDate: toDate,
      mode: period,
      label,
      labelGranularity: this.resolveTrendLabelGranularityByPeriod(period),
      trendMode: this.resolveTrendModeByPeriod(period),
    };
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

  private resolveFullDayRevenuePeriod() {
    const now = new Date();
    const currentFromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const currentToDate = new Date(currentFromDate);
    currentToDate.setUTCHours(23, 59, 59, 999);

    return {
      currentFromDate,
      currentToDate,
    };
  }

  private resolvePreviousComparablePeriod(
    fromDate: Date,
    toDate: Date,
    period: DashboardPeriod,
  ) {
    const currentFromDate = new Date(fromDate);
    const currentToDate = new Date(toDate);
    currentFromDate.setUTCHours(0, 0, 0, 0);
    currentToDate.setUTCHours(23, 59, 59, 999);

    if (period === 'month') {
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

    facts.forEach((fact) => {
      const saleTime = fact.saleDate.getTime();

      if (
        saleTime >= period.currentFromDate.getTime() &&
        saleTime <= period.currentToDate.getTime()
      ) {
        current += fact.revenue.toNumber();
      }
    });

    return {
      current,
    };
  }

  private averageDailyRevenue(totalRevenue: number, fromDate: Date, toDate: Date) {
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
    clubRevenueFacts: {
      revenueDate: Date;
      totalRevenue: { toNumber: () => number };
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

    clubRevenueFacts.forEach((fact) => {
      const revenueTime = fact.revenueDate.getTime();
      const segment = segments.find(
        (item) =>
          revenueTime >= item.fromDate.getTime() &&
          revenueTime <= item.toDate.getTime(),
      );

      if (!segment) {
        return;
      }

      segment.clubRevenue += fact.totalRevenue.toNumber();
    });

    return segments.map((segment, index) => {
      const previous = segments[index - 1];
      const stockByProduct = this.latestStockByProductAt(
        inventorySnapshots,
        segment.toDate,
      );
      const segmentDays = this.periodDays(segment.fromDate, segment.toDate);
      const noSalesSkuCount = activeProducts.filter((product) => {
        const stock = stockByProduct.get(product.id) ?? 0;

        return stock > 0 && !segment.soldByProduct.has(product.id);
      }).length;
      const outOfStockSkuCount = activeProducts.filter((product) => {
        const sold = segment.soldByProduct.get(product.id) ?? 0;
        const averageDailySales = sold / segmentDays;
        const stock = stockByProduct.get(product.id) ?? 0;
        const stockDays =
          averageDailySales > 0 ? stock / averageDailySales : null;

        return averageDailySales > 0 && stockDays !== null && stockDays <= 3;
      }).length;
      segment.noSalesSkuCount = noSalesSkuCount;
      segment.outOfStockSkuCount = outOfStockSkuCount;

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
      return `Q${Math.floor(date.getUTCMonth() / 3) + 1}.${date.getUTCFullYear()}`;
    }

    if (granularity === 'month') {
      return `${this.pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
    }

    if (granularity === 'week') {
      const isoWeek = this.isoWeek(date);

      return `${isoWeek.week}.${isoWeek.year}`;
    }

    return `${this.pad2(date.getUTCDate())}.${this.pad2(date.getUTCMonth() + 1)}`;
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
    return period === 'custom' ? 'custom' : period;
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
