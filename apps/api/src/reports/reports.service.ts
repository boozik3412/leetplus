import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export type ReportGroup = {
  id: string | null;
  name: string;
  productsCount: number;
  averageMarginPercent: number;
  averageSalePrice: number;
  totalFacing: number;
};

export type LowMarginProduct = {
  id: string;
  article: string;
  name: string;
  marginPercent: number;
  purchasePrice: string;
  salePrice: string;
  categoryName: string | null;
  supplierName: string | null;
};

export type AssortmentReport = {
  tenantId: string;
  tenantSlug: string;
  totalSku: number;
  activeSku: number;
  inactiveSku: number;
  averageMarginPercent: number;
  averageMarkupPercent: number;
  categoryBreakdown: ReportGroup[];
  supplierBreakdown: ReportGroup[];
  lowMarginProducts: LowMarginProduct[];
};

export type OperationalReportQuery = {
  from?: string;
  to?: string;
  storeId?: string;
};

export type OutOfStockRiskProduct = {
  productId: string;
  article: string;
  name: string;
  stockQuantity: number;
  averageDailySales: number;
  stockDays: number;
};

export type ProductWithoutSales = {
  productId: string;
  article: string;
  name: string;
  stockQuantity: number;
  categoryName: string | null;
  supplierName: string | null;
};

export type ReportRecommendation = {
  id: string;
  kind: 'REPLENISH_STOCK' | 'NO_SALES' | 'LOW_MARGIN';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  action: string;
  productId: string;
  article: string;
  productName: string;
  metricLabel: string;
  metricValue: string;
};

export type OperationalReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  soldQuantity: number;
  averageDailyRevenue: number;
  stockQuantity: number;
  stockDays: number | null;
  recommendations: ReportRecommendation[];
  outOfStockRiskProducts: OutOfStockRiskProduct[];
  productsWithoutSales: ProductWithoutSales[];
};

export type AbcGroup = 'A' | 'B' | 'C';

export type SkuPerformanceRow = {
  productId: string;
  article: string;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  facing: number;
  soldQuantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
  salesPerFacing: number;
  profitPerFacing: number;
  abcRevenueGroup: AbcGroup;
  abcProfitGroup: AbcGroup;
};

export type AbcSummaryRow = {
  group: AbcGroup;
  productsCount: number;
  assortmentSharePercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
};

export type SkuPerformanceReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  rows: SkuPerformanceRow[];
  abcByRevenue: AbcSummaryRow[];
  abcByProfit: AbcSummaryRow[];
  topByRevenue: SkuPerformanceRow[];
  topByProfit: SkuPerformanceRow[];
  topByQuantity: SkuPerformanceRow[];
  topBySalesPerFacing: SkuPerformanceRow[];
  topByProfitPerFacing: SkuPerformanceRow[];
};

type GroupAccumulator = {
  id: string | null;
  name: string;
  productsCount: number;
  marginSum: number;
  salePriceSum: number;
  totalFacing: number;
};

type ReportItem = {
  marginPercent: number;
  salePrice: number;
  product: {
    facing: number;
  };
};

type ProductSales = {
  productId: string;
  article: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getAssortmentReport(
    user: AuthenticatedUser,
  ): Promise<AssortmentReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);

    const [totalSku, activeProducts] = await Promise.all([
      this.prisma.product.count({ where: { tenantId } }),
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
          supplierId: true,
          category: {
            select: {
              name: true,
            },
          },
          supplier: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const activeSku = activeProducts.length;
    const margins = activeProducts.map((product) => {
      const purchasePrice = product.purchasePrice.toNumber();
      const salePrice = product.salePrice.toNumber();

      return {
        product,
        purchasePrice,
        salePrice,
        marginPercent: this.marginPercent(purchasePrice, salePrice),
        markupPercent: this.markupPercent(purchasePrice, salePrice),
      };
    });

    const marginSum = margins.reduce(
      (sum, item) => sum + item.marginPercent,
      0,
    );
    const markupSum = margins.reduce(
      (sum, item) => sum + item.markupPercent,
      0,
    );

    return {
      tenantId,
      tenantSlug,
      totalSku,
      activeSku,
      inactiveSku: totalSku - activeSku,
      averageMarginPercent: this.average(marginSum, activeSku),
      averageMarkupPercent: this.average(markupSum, activeSku),
      categoryBreakdown: this.buildGroups(
        margins,
        (item) => item.product.categoryId,
        (item) => item.product.category?.name ?? 'Без категории',
      ),
      supplierBreakdown: this.buildGroups(
        margins,
        (item) => item.product.supplierId,
        (item) => item.product.supplier?.name ?? 'Без поставщика',
      ),
      lowMarginProducts: margins
        .filter((item) => item.marginPercent < 20)
        .sort((a, b) => a.marginPercent - b.marginPercent)
        .slice(0, 10)
        .map((item) => ({
          id: item.product.id,
          article: item.product.article,
          name: item.product.name,
          marginPercent: this.round(item.marginPercent),
          purchasePrice: item.product.purchasePrice.toString(),
          salePrice: item.product.salePrice.toString(),
          categoryName: item.product.category?.name ?? null,
          supplierName: item.product.supplier?.name ?? null,
        })),
    };
  }

  async getOperationalReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<OperationalReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeFilter = query.storeId ? { storeId: query.storeId } : {};

    if (query.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: query.storeId, tenantId, isActive: true },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('Store not found');
      }
    }

    const [salesFacts, inventorySnapshots, activeProducts] = await Promise.all([
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
            },
          },
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
        include: {
          product: {
            select: {
              id: true,
              article: true,
              name: true,
            },
          },
        },
        orderBy: {
          snapshotDate: 'desc',
        },
      }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          article: true,
          name: true,
          category: {
            select: { name: true },
          },
          supplier: {
            select: { name: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const productSales = new Map<string, ProductSales>();
    let totalRevenue = 0;
    let totalCost = 0;
    let soldQuantity = 0;

    salesFacts.forEach((fact) => {
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();
      const current = productSales.get(fact.productId) ?? {
        productId: fact.productId,
        article: fact.product.article,
        name: fact.product.name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };

      current.quantity += quantity;
      current.revenue += revenue;
      current.cost += cost;
      productSales.set(fact.productId, current);

      soldQuantity += quantity;
      totalRevenue += revenue;
      totalCost += cost;
    });

    const stockByProduct = this.latestStockByProduct(inventorySnapshots);
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const grossProfit = totalRevenue - totalCost;
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const outOfStockRiskProducts = this.outOfStockRiskProducts(
      productSales,
      stockByProduct,
      periodDays,
    );
    const productsWithoutSales = this.productsWithoutSales(
      activeProducts,
      productSales,
      stockByProduct,
    );

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      totalRevenue: this.round(totalRevenue),
      totalCost: this.round(totalCost),
      grossProfit: this.round(grossProfit),
      marginPercent: this.marginPercent(totalCost, totalRevenue),
      soldQuantity: this.round(soldQuantity),
      averageDailyRevenue: this.round(totalRevenue / periodDays),
      stockQuantity: this.round(stockQuantity),
      stockDays:
        soldQuantity > 0
          ? this.round(stockQuantity / (soldQuantity / periodDays))
          : null,
      recommendations: this.buildRecommendations(
        productSales,
        outOfStockRiskProducts,
        productsWithoutSales,
      ),
      outOfStockRiskProducts,
      productsWithoutSales,
    };
  }

  async getSkuPerformanceReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<SkuPerformanceReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeFilter = query.storeId ? { storeId: query.storeId } : {};

    if (query.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: query.storeId, tenantId, isActive: true },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('Store not found');
      }
    }

    const salesFacts = await this.prisma.salesFact.findMany({
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
            facing: true,
            category: {
              select: { name: true },
            },
            supplier: {
              select: { name: true },
            },
          },
        },
      },
    });

    const rowsByProduct = new Map<string, SkuPerformanceRow>();

    salesFacts.forEach((fact) => {
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = fact.cost.toNumber();
      const grossProfit = revenue - cost;
      const current = rowsByProduct.get(fact.productId) ?? {
        productId: fact.productId,
        article: fact.product.article,
        name: fact.product.name,
        categoryName: fact.product.category?.name ?? null,
        supplierName: fact.product.supplier?.name ?? null,
        facing: fact.product.facing,
        soldQuantity: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        marginPercent: 0,
        revenueSharePercent: 0,
        profitSharePercent: 0,
        salesPerFacing: 0,
        profitPerFacing: 0,
        abcRevenueGroup: 'C' as const,
        abcProfitGroup: 'C' as const,
      };

      current.soldQuantity += quantity;
      current.revenue += revenue;
      current.cost += cost;
      current.grossProfit += grossProfit;
      rowsByProduct.set(fact.productId, current);
    });

    const rows = [...rowsByProduct.values()];
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);

    rows.forEach((row) => {
      row.soldQuantity = this.round(row.soldQuantity);
      row.revenue = this.round(row.revenue);
      row.cost = this.round(row.cost);
      row.grossProfit = this.round(row.grossProfit);
      row.marginPercent = this.marginPercent(row.cost, row.revenue);
      row.revenueSharePercent = this.sharePercent(row.revenue, totalRevenue);
      row.profitSharePercent = this.sharePercent(row.grossProfit, totalProfit);
      row.salesPerFacing =
        row.facing > 0 ? this.round(row.soldQuantity / row.facing) : 0;
      row.profitPerFacing =
        row.facing > 0 ? this.round(row.grossProfit / row.facing) : 0;
    });

    this.assignAbcGroup(rows, 'revenue', 'abcRevenueGroup');
    this.assignAbcGroup(rows, 'grossProfit', 'abcProfitGroup');

    const sortedRows = [...rows].sort(
      (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
    );

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      rows: sortedRows,
      abcByRevenue: this.buildAbcSummary(
        sortedRows,
        totalRevenue,
        totalProfit,
        'abcRevenueGroup',
      ),
      abcByProfit: this.buildAbcSummary(
        sortedRows,
        totalRevenue,
        totalProfit,
        'abcProfitGroup',
      ),
      topByRevenue: this.topRows(sortedRows, (row) => row.revenue),
      topByProfit: this.topRows(sortedRows, (row) => row.grossProfit),
      topByQuantity: this.topRows(sortedRows, (row) => row.soldQuantity),
      topBySalesPerFacing: this.topRows(
        sortedRows,
        (row) => row.salesPerFacing,
      ),
      topByProfitPerFacing: this.topRows(
        sortedRows,
        (row) => row.profitPerFacing,
      ),
    };
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

  private outOfStockRiskProducts(
    productSales: Map<string, ProductSales>,
    stockByProduct: Map<string, number>,
    periodDays: number,
  ): OutOfStockRiskProduct[] {
    return [...productSales.values()]
      .map((sale) => {
        const averageDailySales = sale.quantity / periodDays;
        const stockQuantity = stockByProduct.get(sale.productId) ?? 0;
        const stockDays =
          averageDailySales > 0 ? stockQuantity / averageDailySales : 0;

        return {
          productId: sale.productId,
          article: sale.article,
          name: sale.name,
          stockQuantity: this.round(stockQuantity),
          averageDailySales: this.round(averageDailySales),
          stockDays: this.round(stockDays),
        };
      })
      .filter((item) => item.averageDailySales > 0 && item.stockDays <= 3)
      .sort((a, b) => a.stockDays - b.stockDays)
      .slice(0, 10);
  }

  private productsWithoutSales(
    products: {
      id: string;
      article: string;
      name: string;
      category: { name: string } | null;
      supplier: { name: string } | null;
    }[],
    productSales: Map<string, ProductSales>,
    stockByProduct: Map<string, number>,
  ): ProductWithoutSales[] {
    return products
      .filter((product) => !productSales.has(product.id))
      .map((product) => ({
        productId: product.id,
        article: product.article,
        name: product.name,
        stockQuantity: this.round(stockByProduct.get(product.id) ?? 0),
        categoryName: product.category?.name ?? null,
        supplierName: product.supplier?.name ?? null,
      }))
      .sort(
        (a, b) =>
          b.stockQuantity - a.stockQuantity || a.name.localeCompare(b.name),
      )
      .slice(0, 10);
  }

  private buildRecommendations(
    productSales: Map<string, ProductSales>,
    outOfStockRiskProducts: OutOfStockRiskProduct[],
    productsWithoutSales: ProductWithoutSales[],
  ): ReportRecommendation[] {
    const recommendations: ReportRecommendation[] = [
      ...outOfStockRiskProducts.map((product) => ({
        id: `stock:${product.productId}`,
        kind: 'REPLENISH_STOCK' as const,
        severity:
          product.stockDays <= 1 ? ('HIGH' as const) : ('MEDIUM' as const),
        title: `Пополнить запас: ${product.name}`,
        description: `Текущего остатка хватит примерно на ${product.stockDays} дн. при среднем спросе ${product.averageDailySales} шт/день.`,
        action: 'Проверить поставщика и ближайший заказ.',
        productId: product.productId,
        article: product.article,
        productName: product.name,
        metricLabel: 'Дней запаса',
        metricValue: String(product.stockDays),
      })),
      ...productsWithoutSales
        .filter((product) => product.stockQuantity > 0)
        .slice(0, 5)
        .map((product) => ({
          id: `no-sales:${product.productId}`,
          kind: 'NO_SALES' as const,
          severity: 'LOW' as const,
          title: `Разобрать товар без продаж: ${product.name}`,
          description: `В выбранном периоде продаж нет, но на остатке ${product.stockQuantity} шт.`,
          action: 'Проверить цену, выкладку или необходимость архивации.',
          productId: product.productId,
          article: product.article,
          productName: product.name,
          metricLabel: 'Остаток',
          metricValue: String(product.stockQuantity),
        })),
      ...[...productSales.values()]
        .filter((sale) => sale.revenue > 0)
        .map((sale) => ({
          sale,
          marginPercent: this.marginPercent(sale.cost, sale.revenue),
        }))
        .filter((item) => item.marginPercent < 20)
        .sort((a, b) => a.marginPercent - b.marginPercent)
        .slice(0, 5)
        .map((item) => ({
          id: `margin:${item.sale.productId}`,
          kind: 'LOW_MARGIN' as const,
          severity:
            item.marginPercent < 10 ? ('MEDIUM' as const) : ('LOW' as const),
          title: `Пересмотреть маржу: ${item.sale.name}`,
          description: `Маржа продаж ${this.round(item.marginPercent)}% при выручке ${this.round(item.sale.revenue)}.`,
          action: 'Проверить закупочную цену, розничную цену и промо-условия.',
          productId: item.sale.productId,
          article: item.sale.article,
          productName: item.sale.name,
          metricLabel: 'Маржа',
          metricValue: `${this.round(item.marginPercent)}%`,
        })),
    ];

    return recommendations
      .sort(
        (a, b) =>
          this.severityRank(a.severity) - this.severityRank(b.severity) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 12);
  }

  private severityRank(severity: ReportRecommendation['severity']) {
    const ranks: Record<ReportRecommendation['severity'], number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };

    return ranks[severity];
  }

  private assignAbcGroup(
    rows: SkuPerformanceRow[],
    metric: 'revenue' | 'grossProfit',
    groupKey: 'abcRevenueGroup' | 'abcProfitGroup',
  ) {
    const total = rows.reduce((sum, row) => sum + Math.max(0, row[metric]), 0);
    let cumulative = 0;

    [...rows]
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
      .forEach((row) => {
        if (total <= 0 || row[metric] <= 0) {
          row[groupKey] = 'C';
          return;
        }

        const cumulativeShareBefore = (cumulative / total) * 100;
        cumulative += row[metric];

        if (cumulativeShareBefore < 80) {
          row[groupKey] = 'A';
        } else if (cumulativeShareBefore < 95) {
          row[groupKey] = 'B';
        } else {
          row[groupKey] = 'C';
        }
      });
  }

  private buildAbcSummary(
    rows: SkuPerformanceRow[],
    totalRevenue: number,
    totalProfit: number,
    groupKey: 'abcRevenueGroup' | 'abcProfitGroup',
  ): AbcSummaryRow[] {
    const groups: AbcGroup[] = ['A', 'B', 'C'];

    return groups.map((group) => {
      const groupRows = rows.filter((row) => row[groupKey] === group);
      const revenue = groupRows.reduce((sum, row) => sum + row.revenue, 0);
      const profit = groupRows.reduce((sum, row) => sum + row.grossProfit, 0);

      return {
        group,
        productsCount: groupRows.length,
        assortmentSharePercent: this.sharePercent(
          groupRows.length,
          rows.length,
        ),
        revenueSharePercent: this.sharePercent(revenue, totalRevenue),
        profitSharePercent: this.sharePercent(profit, totalProfit),
      };
    });
  }

  private topRows(
    rows: SkuPerformanceRow[],
    getMetric: (row: SkuPerformanceRow) => number,
  ) {
    return [...rows]
      .sort(
        (a, b) =>
          getMetric(b) - getMetric(a) ||
          b.revenue - a.revenue ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 10);
  }

  private resolvePeriod(query: OperationalReportQuery) {
    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const fromDate = query.from
      ? this.parseDate(query.from, 'from')
      : defaultFrom;
    const toDate = query.to ? this.parseDate(query.to, 'to') : defaultTo;
    toDate.setUTCHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw new BadRequestException('From date must be before to date');
    }

    return { fromDate, toDate };
  }

  private parseDate(value: string, field: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }

    const date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );

    if (
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])
    ) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    return date;
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

  private buildGroups<T extends ReportItem>(
    items: T[],
    getId: (item: T) => string | null,
    getName: (item: T) => string,
  ): ReportGroup[] {
    const groups = new Map<string, GroupAccumulator>();

    items.forEach((item) => {
      const id = getId(item);
      const key = id ?? getName(item);
      const current = groups.get(key) ?? {
        id,
        name: getName(item),
        productsCount: 0,
        marginSum: 0,
        salePriceSum: 0,
        totalFacing: 0,
      };

      current.productsCount += 1;
      current.marginSum += item.marginPercent;
      current.salePriceSum += item.salePrice;
      current.totalFacing += item.product.facing;
      groups.set(key, current);
    });

    return [...groups.values()]
      .map((group) => ({
        id: group.id,
        name: group.name,
        productsCount: group.productsCount,
        averageMarginPercent: this.average(
          group.marginSum,
          group.productsCount,
        ),
        averageSalePrice: this.average(group.salePriceSum, group.productsCount),
        totalFacing: group.totalFacing,
      }))
      .sort(
        (a, b) =>
          b.productsCount - a.productsCount || a.name.localeCompare(b.name),
      );
  }

  private marginPercent(purchasePrice: number, salePrice: number) {
    if (salePrice <= 0) {
      return 0;
    }

    return ((salePrice - purchasePrice) / salePrice) * 100;
  }

  private markupPercent(purchasePrice: number, salePrice: number) {
    if (purchasePrice <= 0) {
      return 0;
    }

    return ((salePrice - purchasePrice) / purchasePrice) * 100;
  }

  private average(sum: number, count: number) {
    return count > 0 ? this.round(sum / count) : 0;
  }

  private sharePercent(value: number, total: number) {
    return total > 0 ? this.round((value / total) * 100) : 0;
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
