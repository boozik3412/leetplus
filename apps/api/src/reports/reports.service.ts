import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductOosExclusionType, StockMovementType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  buildProductCostBasis,
  type ProductCostBasis,
} from './stock-cost-basis';

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

export type ProductOosExclusionDto = {
  productId: string;
  type: ProductOosExclusionType;
};

export type ProductOosExclusionRow = {
  id: string;
  productId: string;
  type: ProductOosExclusionType;
  createdAt: string;
  product: {
    id: string;
    article: string;
    name: string;
    externalDomain: string | null;
  };
};

export type OutOfStockRiskProduct = {
  productId: string;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  supplierName: string | null;
  stockQuantity: number;
  averageDailySales: number;
  revenueAtRiskPerDay: number;
  grossProfitAtRiskPerDay: number;
  grossProfitAtRiskForPeriod: number;
  stockDays: number;
};

export type ProductWithoutSales = {
  productId: string;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  stockQuantity: number;
  frozenStockAmount: number;
  lastSaleDate: string | null;
  daysWithoutSales: number | null;
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
  storeId: string | null;
  storeName: string | null;
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
  adjustedGrossProfit: number;
  marginPercent: number;
  adjustedMarginPercent: number;
  soldQuantity: number;
  writeOffQuantity: number;
  writeOffAmount: number;
  returnQuantity: number;
  returnAmount: number;
  averageDailyRevenue: number;
  stockQuantity: number;
  stockDays: number | null;
  recommendations: ReportRecommendation[];
  outOfStockRiskProducts: OutOfStockRiskProduct[];
  productsWithoutSales: ProductWithoutSales[];
};

export type SalesDetailRow = {
  id: string;
  saleDate: string;
  productId: string;
  article: string;
  productName: string;
  productNameAtSale: string | null;
  storeId: string;
  storeName: string;
  storeNameAtSale: string | null;
  categoryName: string | null;
  supplierName: string | null;
  quantity: number;
  revenue: number;
  cost: number;
  unitSalePrice: number;
  unitCost: number;
  grossProfit: number;
  marginPercent: number;
  markupPercent: number;
  purchasePrice: number;
  salePrice: number;
  facing: number;
  source: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalSaleId: string | null;
  externalProductId: string | null;
  externalClubId: string | null;
  sourcePayloadHash: string | null;
  isCanceled: boolean;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesDetailReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  rows: SalesDetailRow[];
};

export type AbcGroup = 'A' | 'B' | 'C';

export type SkuPerformanceRow = {
  productId: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  facing: number;
  soldQuantity: number;
  revenue: number;
  cost: number;
  unitCost: number | null;
  grossProfit: number;
  marginPercent: number;
  markupPercent: number;
  revenueSharePercent: number;
  profitSharePercent: number;
  salesPerFacing: number;
  profitPerFacing: number;
  abcRevenueGroup: AbcGroup;
  abcProfitGroup: AbcGroup;
};

export type NewProductRow = {
  productId: string;
  article: string;
  name: string;
  firstSeenDate: string;
  firstSeenStoreName: string;
  currentStockQuantity: number;
  unitCost: number | null;
  categoryName: string | null;
  supplierName: string | null;
  dailySales: {
    date: string;
    quantity: number;
    revenue: number;
  }[];
};

export type NewProductsReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  rows: NewProductRow[];
};

export type LflPeriod = 'day' | 'week' | 'month';
export type LflGroupLevel = 'network' | 'store' | 'category' | 'product';

export type LflReportQuery = {
  period?: LflPeriod;
};

export type LflReportRow = {
  id: string;
  level: LflGroupLevel;
  parentId: string | null;
  name: string;
  currentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
  revenueLflPercent: number | null;
  currentGrossProfit: number;
  previousGrossProfit: number;
  grossProfitDelta: number;
  grossProfitLflPercent: number | null;
  currentQuantity: number;
  previousQuantity: number;
  quantityDelta: number;
  quantityLflPercent: number | null;
};

export type LflReport = {
  tenantId: string;
  tenantSlug: string;
  period: LflPeriod;
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  summary: LflReportRow;
  rows: LflReportRow[];
};

export type AbcSummaryRow = {
  group: AbcGroup;
  productsCount: number;
  assortmentSharePercent: number;
  revenue: number;
  grossProfit: number;
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

export type SupplierPerformanceRow = {
  supplierId: string | null;
  supplierName: string;
  activeSku: number;
  soldQuantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
  salesSharePercent: number;
  profitSharePercent: number;
  averageRevenuePerSku: number;
  paymentDelayDays: number | null;
  minOrderAmount: string | null;
  orderMultiplicity: number | null;
};

export type SuppliersPerformanceReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  totalRevenue: number;
  totalGrossProfit: number;
  rows: SupplierPerformanceRow[];
};

export type ReplenishmentRisk =
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'OK'
  | 'NO_SALES';

export type ReplenishmentRow = {
  productId: string;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  stockQuantity: number;
  soldQuantity: number;
  averageDailySales: number;
  stockDays: number | null;
  dailyNeed: number;
  recommendedOrder: number;
  orderMultiplicity: number | null;
  risk: ReplenishmentRisk;
};

export type ReplenishmentReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  totalStockQuantity: number;
  totalDailyNeed: number;
  totalRecommendedOrder: number;
  rows: ReplenishmentRow[];
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
  storeId: string | null;
  storeName: string | null;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  supplierName: string | null;
  quantity: number;
  revenue: number;
  cost: number;
};

type StockSnapshot = {
  storeId: string;
  store: { name: string };
  productId: string;
  snapshotDate?: Date;
  product: {
    id?: string;
    article: string;
    name: string;
    purchasePrice?: { toNumber: () => number };
    canonicalProduct: { name: string } | null;
    category: { name: string } | null;
    supplier: { name: string } | null;
  };
  quantity: { toNumber: () => number };
};

type StockByStoreProductItem = {
  productId: string;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  stockQuantity: number;
  unitCost: number;
};

type SalesFactWithCost = {
  productId: string;
  quantity: { toNumber: () => number };
  cost: { toNumber: () => number };
  product?: {
    purchasePrice?: { toNumber: () => number } | null;
  } | null;
};

type LflSaleFact = SalesFactWithCost & {
  storeId: string;
  revenue: { toNumber: () => number };
  store: {
    id: string;
    name: string;
  };
  product: {
    id: string;
    article: string;
    name: string;
    purchasePrice?: { toNumber: () => number } | null;
    categoryId: string | null;
    category: { name: string } | null;
  };
};

type LflAccumulator = {
  id: string;
  level: LflGroupLevel;
  parentId: string | null;
  name: string;
  revenue: number;
  grossProfit: number;
  quantity: number;
};

const DEMAND_PERIOD_DAYS = 21;
const NEW_PRODUCTS_PERIOD_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

    const [totalSku, activeProducts, inventorySnapshots] = await Promise.all([
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
      this.prisma.inventorySnapshot.findMany({
        where: { tenantId },
        select: {
          storeId: true,
          productId: true,
          quantity: true,
        },
        orderBy: { snapshotDate: 'desc' },
      }),
    ]);
    const stockByProduct = this.latestStockByProduct(inventorySnapshots);

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
        .filter((item) => item.purchasePrice > 0 && item.salePrice > 0)
        .filter((item) => (stockByProduct.get(item.product.id) ?? 0) > 0)
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
    const demandPeriod = this.resolveDemandPeriod();

    if (query.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: query.storeId, tenantId, isActive: true },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('Store not found');
      }
    }

    const [
      salesFacts,
      demandSalesFacts,
      lastSalesFacts,
      inventorySnapshots,
      stockMovements,
      oosExclusions,
    ] = await Promise.all([
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
              purchasePrice: true,
              canonicalProduct: {
                select: {
                  name: true,
                },
              },
              supplier: {
                select: { name: true },
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
            gte: demandPeriod.fromDate,
            lte: demandPeriod.toDate,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              article: true,
              name: true,
              purchasePrice: true,
              canonicalProduct: {
                select: { name: true },
              },
              category: {
                select: { name: true },
              },
              supplier: {
                select: { name: true },
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
            lte: period.toDate,
          },
        },
        select: {
          storeId: true,
          productId: true,
          saleDate: true,
        },
        orderBy: {
          saleDate: 'desc',
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
              purchasePrice: true,
              canonicalProduct: {
                select: { name: true },
              },
              category: {
                select: { name: true },
              },
              supplier: {
                select: { name: true },
              },
            },
          },
          store: {
            select: {
              name: true,
            },
          },
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
          quantity: true,
          amount: true,
        },
      }),
      this.prisma.productOosExclusion.findMany({
        where: { tenantId },
        select: { productId: true },
      }),
    ]);
    const excludedProductIds = new Set(
      oosExclusions.map((exclusion) => exclusion.productId),
    );
    const costBasisByProduct = buildProductCostBasis([], inventorySnapshots);

    const productSales = new Map<string, ProductSales>();
    let totalRevenue = 0;
    let totalCost = 0;
    let soldQuantity = 0;

    salesFacts.forEach((fact) => {
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = this.saleCost(fact, costBasisByProduct);
      const current = productSales.get(fact.productId) ?? {
        productId: fact.productId,
        storeId: fact.store.id,
        storeName: fact.store.name,
        article: fact.product.article,
        name: fact.product.name,
        isCanonical: Boolean(fact.product.canonicalProduct),
        canonicalProductName: fact.product.canonicalProduct?.name ?? null,
        supplierName: fact.product.supplier?.name ?? null,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };

      if (current.storeId !== fact.store.id) {
        current.storeId = 'multiple';
        current.storeName = 'Несколько клубов';
      }

      current.quantity += quantity;
      current.revenue += revenue;
      current.cost += cost;
      productSales.set(fact.productId, current);

      soldQuantity += quantity;
      totalRevenue += revenue;
      totalCost += cost;
    });

    const stockByProduct = this.latestStockByProduct(inventorySnapshots);
    const stockByStoreProduct =
      this.latestStockByStoreProduct(inventorySnapshots);
    const demandProductSales =
      this.productSalesByStoreProduct(demandSalesFacts);
    const periodProductSalesByStoreProduct =
      this.productSalesByStoreProduct(salesFacts);
    const lastSaleByStoreProduct = this.lastSaleByStoreProduct(lastSalesFacts);
    const incomingStockByStoreProduct = this.incomingStockByStoreProduct(
      inventorySnapshots,
      period.fromDate,
      period.toDate,
    );
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const grossProfit = totalRevenue - totalCost;
    const movementImpact = this.stockMovementImpact(stockMovements);
    const adjustedGrossProfit =
      grossProfit - movementImpact.writeOffAmount - movementImpact.returnAmount;
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const outOfStockRiskProducts = this.outOfStockRiskProducts(
      demandProductSales,
      stockByStoreProduct,
      DEMAND_PERIOD_DAYS,
      periodDays,
      excludedProductIds,
    );
    const productsWithoutSales = this.productsWithoutSales(
      stockByStoreProduct,
      periodProductSalesByStoreProduct,
      excludedProductIds,
      lastSaleByStoreProduct,
      incomingStockByStoreProduct,
      period.toDate,
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
      adjustedGrossProfit: this.round(adjustedGrossProfit),
      marginPercent: this.marginPercent(totalCost, totalRevenue),
      adjustedMarginPercent: this.marginPercent(
        totalRevenue - adjustedGrossProfit,
        totalRevenue,
      ),
      soldQuantity: this.round(soldQuantity),
      writeOffQuantity: this.round(movementImpact.writeOffQuantity),
      writeOffAmount: this.round(movementImpact.writeOffAmount),
      returnQuantity: this.round(movementImpact.returnQuantity),
      returnAmount: this.round(movementImpact.returnAmount),
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

  async getSalesDetailReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<SalesDetailReport> {
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

    const [salesFacts, inventorySnapshots] = await Promise.all([
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
              purchasePrice: true,
              salePrice: true,
              facing: true,
              category: {
                select: { name: true },
              },
              supplier: {
                select: { name: true },
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
        orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }],
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
              purchasePrice: true,
            },
          },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);
    const costBasisByProduct = buildProductCostBasis([], inventorySnapshots);

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      rows: salesFacts.map((fact) => {
        const quantity = fact.quantity.toNumber();
        const revenue = fact.revenue.toNumber();
        const cost = this.saleCost(fact, costBasisByProduct);
        const grossProfit = revenue - cost;

        return {
          id: fact.id,
          saleDate: fact.saleDate.toISOString(),
          productId: fact.productId,
          article: fact.product.article,
          productName: fact.product.name,
          productNameAtSale: fact.productNameAtSale,
          storeId: fact.storeId,
          storeName: fact.store.name,
          storeNameAtSale: fact.storeNameAtSale,
          categoryName: fact.product.category?.name ?? null,
          supplierName: fact.product.supplier?.name ?? null,
          quantity: this.round(quantity),
          revenue: this.round(revenue),
          cost: this.round(cost),
          unitSalePrice: quantity > 0 ? this.round(revenue / quantity) : 0,
          unitCost: quantity > 0 ? this.round(cost / quantity) : 0,
          grossProfit: this.round(grossProfit),
          marginPercent: this.marginPercent(cost, revenue),
          markupPercent: this.markupPercent(cost, revenue),
          purchasePrice: fact.product.purchasePrice.toNumber(),
          salePrice: fact.product.salePrice.toNumber(),
          facing: fact.product.facing,
          source:
            fact.externalProvider ??
            fact.externalDomain ??
            (fact.sourcePayloadHash ? 'IMPORT' : 'MANUAL'),
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          externalSaleId: fact.externalSaleId,
          externalProductId: fact.externalProductId,
          externalClubId: fact.externalClubId,
          sourcePayloadHash: fact.sourcePayloadHash,
          isCanceled: fact.isCanceled,
          canceledAt: fact.canceledAt?.toISOString() ?? null,
          createdAt: fact.createdAt.toISOString(),
          updatedAt: fact.updatedAt.toISOString(),
        };
      }),
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

    const [salesFacts, inventorySnapshots] = await Promise.all([
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
              purchasePrice: true,
              facing: true,
              canonicalProduct: {
                select: {
                  id: true,
                  name: true,
                },
              },
              category: {
                select: { name: true },
              },
              supplier: {
                select: { name: true },
              },
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
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          product: {
            select: {
              purchasePrice: true,
            },
          },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);
    const costBasisByProduct = buildProductCostBasis([], inventorySnapshots);

    const shouldUseCanonicalGrouping = !query.storeId;
    const buildRows = (useCanonicalGrouping: boolean) => {
      const rowsByProduct = new Map<string, SkuPerformanceRow>();
      const facingProductsByRow = new Map<string, Set<string>>();

      salesFacts.forEach((fact) => {
        const quantity = fact.quantity.toNumber();
        const revenue = fact.revenue.toNumber();
        const cost = this.saleCost(fact, costBasisByProduct);
        const grossProfit = revenue - cost;
        const unitCost = quantity > 0 ? cost / quantity : null;
        const canonicalProduct = fact.product.canonicalProduct;
        const rowKey =
          useCanonicalGrouping && canonicalProduct
            ? `canonical:${canonicalProduct.id}`
            : fact.productId;
        const current = rowsByProduct.get(rowKey) ?? {
          productId: rowKey,
          article: fact.product.article,
          name:
            useCanonicalGrouping && canonicalProduct
              ? canonicalProduct.name
              : fact.product.name,
          isCanonical: Boolean(canonicalProduct),
          canonicalProductName: canonicalProduct?.name ?? null,
          categoryName: fact.product.category?.name ?? null,
          supplierName: fact.product.supplier?.name ?? null,
          facing: 0,
          soldQuantity: 0,
          revenue: 0,
          cost: 0,
          unitCost: null,
          grossProfit: 0,
          marginPercent: 0,
          markupPercent: 0,
          revenueSharePercent: 0,
          profitSharePercent: 0,
          salesPerFacing: 0,
          profitPerFacing: 0,
          abcRevenueGroup: 'C' as const,
          abcProfitGroup: 'C' as const,
        };

        const facingProducts =
          facingProductsByRow.get(rowKey) ?? new Set<string>();

        if (!facingProducts.has(fact.product.id)) {
          current.facing += fact.product.facing;
          facingProducts.add(fact.product.id);
          facingProductsByRow.set(rowKey, facingProducts);
        }

        current.soldQuantity += quantity;
        current.revenue += revenue;
        current.cost += cost;
        current.unitCost =
          current.soldQuantity > 0
            ? current.cost / current.soldQuantity
            : unitCost;
        current.grossProfit += grossProfit;
        rowsByProduct.set(rowKey, current);
      });

      return [...rowsByProduct.values()];
    };

    const rows = buildRows(shouldUseCanonicalGrouping);
    const facingRows = shouldUseCanonicalGrouping ? buildRows(false) : rows;
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);

    rows.forEach((row) => {
      row.soldQuantity = this.round(row.soldQuantity);
      row.revenue = this.round(row.revenue);
      row.cost = this.round(row.cost);
      row.unitCost = row.unitCost === null ? null : this.round(row.unitCost);
      row.grossProfit = this.round(row.grossProfit);
      row.marginPercent = this.marginPercent(row.cost, row.revenue);
      row.markupPercent = this.markupPercent(row.cost, row.revenue);
      row.revenueSharePercent = this.sharePercent(row.revenue, totalRevenue);
      row.profitSharePercent = this.sharePercent(row.grossProfit, totalProfit);
      row.salesPerFacing =
        row.facing > 0 ? this.round(row.soldQuantity / row.facing) : 0;
      row.profitPerFacing =
        row.facing > 0 ? this.round(row.grossProfit / row.facing) : 0;
    });
    facingRows.forEach((row) => {
      row.soldQuantity = this.round(row.soldQuantity);
      row.revenue = this.round(row.revenue);
      row.cost = this.round(row.cost);
      row.unitCost = row.unitCost === null ? null : this.round(row.unitCost);
      row.grossProfit = this.round(row.grossProfit);
      row.marginPercent = this.marginPercent(row.cost, row.revenue);
      row.markupPercent = this.markupPercent(row.cost, row.revenue);
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
        facingRows,
        (row) => row.salesPerFacing,
      ),
      topByProfitPerFacing: this.topRows(
        facingRows,
        (row) => row.profitPerFacing,
      ),
    };
  }

  async getSuppliersPerformanceReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<SuppliersPerformanceReport> {
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

    const [salesFacts, activeProducts, inventorySnapshots] = await Promise.all([
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
              purchasePrice: true,
              supplierId: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                  paymentDelayDays: true,
                  minOrderAmount: true,
                  orderMultiplicity: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          supplierId: true,
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
          product: {
            select: {
              purchasePrice: true,
            },
          },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);
    const costBasisByProduct = buildProductCostBasis([], inventorySnapshots);

    const activeSkuBySupplier = new Map<string, number>();

    activeProducts.forEach((product) => {
      const key = product.supplierId ?? 'without-supplier';
      activeSkuBySupplier.set(key, (activeSkuBySupplier.get(key) ?? 0) + 1);
    });

    const rowsBySupplier = new Map<string, SupplierPerformanceRow>();
    let totalRevenue = 0;
    let totalGrossProfit = 0;

    salesFacts.forEach((fact) => {
      const supplier = fact.product.supplier;
      const supplierId = fact.product.supplierId;
      const key = supplierId ?? 'without-supplier';
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = this.saleCost(fact, costBasisByProduct);
      const grossProfit = revenue - cost;
      const current = rowsBySupplier.get(key) ?? {
        supplierId,
        supplierName: supplier?.name ?? 'Без поставщика',
        activeSku: activeSkuBySupplier.get(key) ?? 0,
        soldQuantity: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        marginPercent: 0,
        salesSharePercent: 0,
        profitSharePercent: 0,
        averageRevenuePerSku: 0,
        paymentDelayDays: supplier?.paymentDelayDays ?? null,
        minOrderAmount: supplier?.minOrderAmount?.toString() ?? null,
        orderMultiplicity: supplier?.orderMultiplicity ?? null,
      };

      current.soldQuantity += quantity;
      current.revenue += revenue;
      current.cost += cost;
      current.grossProfit += grossProfit;
      rowsBySupplier.set(key, current);

      totalRevenue += revenue;
      totalGrossProfit += grossProfit;
    });

    const rows = [...rowsBySupplier.values()]
      .map((row) => ({
        ...row,
        soldQuantity: this.round(row.soldQuantity),
        revenue: this.round(row.revenue),
        cost: this.round(row.cost),
        grossProfit: this.round(row.grossProfit),
        marginPercent: this.marginPercent(row.cost, row.revenue),
        salesSharePercent: this.sharePercent(row.revenue, totalRevenue),
        profitSharePercent: this.sharePercent(
          row.grossProfit,
          totalGrossProfit,
        ),
        averageRevenuePerSku:
          row.activeSku > 0 ? this.round(row.revenue / row.activeSku) : 0,
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue || a.supplierName.localeCompare(b.supplierName),
      )
      .slice(0, 20);

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      totalRevenue: this.round(totalRevenue),
      totalGrossProfit: this.round(totalGrossProfit),
      rows,
    };
  }

  async getReplenishmentReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<ReplenishmentReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolvePeriod(query);
    const storeFilter = query.storeId ? { storeId: query.storeId } : {};
    const demandPeriod = this.resolveDemandPeriod();

    if (query.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: query.storeId, tenantId, isActive: true },
        select: { id: true },
      });

      if (!store) {
        throw new BadRequestException('Store not found');
      }
    }

    const [activeProducts, inventorySnapshots, salesFacts, oosExclusions] =
      await Promise.all([
        this.prisma.product.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            article: true,
            name: true,
            canonicalProduct: {
              select: { name: true },
            },
            category: {
              select: { name: true },
            },
            supplier: {
              select: {
                name: true,
                orderMultiplicity: true,
              },
            },
          },
          orderBy: { name: 'asc' },
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
            store: {
              select: { name: true },
            },
            product: {
              select: {
                article: true,
                name: true,
                canonicalProduct: {
                  select: { name: true },
                },
                category: {
                  select: { name: true },
                },
                supplier: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: {
            snapshotDate: 'desc',
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
            storeId: true,
            productId: true,
            quantity: true,
          },
        }),
        this.prisma.productOosExclusion.findMany({
          where: { tenantId },
          select: { productId: true },
        }),
      ]);
    const excludedProductIds = new Set(
      oosExclusions.map((exclusion) => exclusion.productId),
    );

    const stockByStoreProduct =
      this.latestStockByStoreProduct(inventorySnapshots);
    const soldByProduct = new Map<string, number>();

    salesFacts.forEach((fact) => {
      const key = `${fact.storeId}:${fact.productId}`;
      soldByProduct.set(
        key,
        (soldByProduct.get(key) ?? 0) + fact.quantity.toNumber(),
      );
    });

    let totalStockQuantity = 0;
    let totalDailyNeed = 0;
    let totalRecommendedOrder = 0;

    const productsById = new Map(
      activeProducts.map((product) => [product.id, product]),
    );
    const rows = [...stockByStoreProduct.values()]
      .filter((item) => !excludedProductIds.has(item.productId))
      .map((item) => {
        const product = productsById.get(item.productId);
        const stockQuantity = this.round(item.stockQuantity);
        const soldQuantity = this.round(
          soldByProduct.get(`${item.storeId}:${item.productId}`) ?? 0,
        );
        const averageDailySales = this.round(soldQuantity / DEMAND_PERIOD_DAYS);
        const stockDays =
          averageDailySales > 0
            ? this.round(stockQuantity / averageDailySales)
            : null;
        const dailyNeed = this.round(
          Math.max(0, averageDailySales * 7 - stockQuantity),
        );
        const orderMultiplicity = product?.supplier?.orderMultiplicity ?? null;
        const recommendedOrder = this.recommendedOrder(
          dailyNeed,
          orderMultiplicity,
        );
        const row = {
          productId: item.productId,
          storeId: item.storeId,
          storeName: item.storeName,
          article: item.article,
          name: item.name,
          isCanonical: item.isCanonical,
          canonicalProductName: item.canonicalProductName,
          categoryName: item.categoryName,
          supplierName: item.supplierName,
          stockQuantity,
          soldQuantity,
          averageDailySales,
          stockDays,
          dailyNeed,
          recommendedOrder,
          orderMultiplicity,
          risk: this.replenishmentRisk(
            stockQuantity,
            averageDailySales,
            stockDays,
          ),
        };

        totalStockQuantity += stockQuantity;
        totalDailyNeed += dailyNeed;
        totalRecommendedOrder += recommendedOrder;

        return row;
      });

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      totalStockQuantity: this.round(totalStockQuantity),
      totalDailyNeed: this.round(totalDailyNeed),
      totalRecommendedOrder: this.round(totalRecommendedOrder),
      rows: rows.sort(
        (a, b) =>
          this.replenishmentRiskRank(a.risk) -
            this.replenishmentRiskRank(b.risk) ||
          b.recommendedOrder - a.recommendedOrder ||
          a.name.localeCompare(b.name),
      ),
    };
  }

  async getNewProductsReport(
    user: AuthenticatedUser,
    query: Pick<OperationalReportQuery, 'storeId'> = {},
  ): Promise<NewProductsReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolveNewProductsPeriod();
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

    const [products, inventorySnapshots] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          purchasePrice: true,
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          ...storeFilter,
          quantity: { gt: 0 },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          store: {
            select: {
              name: true,
            },
          },
          product: {
            select: {
              article: true,
              name: true,
              purchasePrice: true,
              category: {
                select: { name: true },
              },
              supplier: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);
    const costBasisByProduct = buildProductCostBasis(
      products,
      inventorySnapshots,
    );
    const firstSnapshotByProduct = new Map<
      string,
      (typeof inventorySnapshots)[number]
    >();

    inventorySnapshots.forEach((snapshot) => {
      if (firstSnapshotByProduct.has(snapshot.productId)) {
        return;
      }

      firstSnapshotByProduct.set(snapshot.productId, snapshot);
    });

    const latestStockByProduct = this.latestStockByProduct(inventorySnapshots);
    const rowsWithoutDailySales = [...firstSnapshotByProduct.values()]
      .filter(
        (snapshot) =>
          snapshot.snapshotDate >= period.fromDate &&
          snapshot.snapshotDate <= period.toDate,
      )
      .map((snapshot) => ({
        productId: snapshot.productId,
        article: snapshot.product.article,
        name: snapshot.product.name,
        firstSeenDate: this.toDateInputValue(snapshot.snapshotDate),
        firstSeenStoreName: snapshot.store.name,
        currentStockQuantity: this.round(
          latestStockByProduct.get(snapshot.productId) ?? 0,
        ),
        unitCost:
          costBasisByProduct.get(snapshot.productId)?.unitCost === null ||
          costBasisByProduct.get(snapshot.productId)?.unitCost === undefined
            ? null
            : this.round(costBasisByProduct.get(snapshot.productId)!.unitCost!),
        categoryName: snapshot.product.category?.name ?? null,
        supplierName: snapshot.product.supplier?.name ?? null,
      }))
      .sort(
        (a, b) =>
          b.currentStockQuantity - a.currentStockQuantity ||
          a.name.localeCompare(b.name, 'ru'),
      );
    const productIds = rowsWithoutDailySales.map((row) => row.productId);
    const salesFacts =
      productIds.length > 0
        ? await this.prisma.salesFact.findMany({
            where: {
              tenantId,
              isCanceled: false,
              ...storeFilter,
              productId: { in: productIds },
              saleDate: {
                gte: period.fromDate,
                lte: period.toDate,
              },
            },
            select: {
              productId: true,
              saleDate: true,
              quantity: true,
              revenue: true,
            },
          })
        : [];
    const dailySalesByProduct = new Map<
      string,
      Map<string, { quantity: number; revenue: number }>
    >();

    salesFacts.forEach((fact) => {
      const date = this.toDateInputValue(fact.saleDate);
      const salesByDate =
        dailySalesByProduct.get(fact.productId) ??
        new Map<string, { quantity: number; revenue: number }>();
      const current = salesByDate.get(date) ?? { quantity: 0, revenue: 0 };

      current.quantity += fact.quantity.toNumber();
      current.revenue += fact.revenue.toNumber();
      salesByDate.set(date, current);
      dailySalesByProduct.set(fact.productId, salesByDate);
    });
    const rows = rowsWithoutDailySales.map((row) => ({
      ...row,
      dailySales: [
        ...(dailySalesByProduct.get(row.productId)?.entries() ?? []),
      ].map(([date, sales]) => ({
        date,
        quantity: this.round(sales.quantity),
        revenue: this.round(sales.revenue),
      })),
    }));

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      rows,
    };
  }

  async getLflReport(
    user: AuthenticatedUser,
    query: LflReportQuery = {},
  ): Promise<LflReport> {
    const { tenantId, tenantSlug } =
      await this.tenantContextService.resolve(user);
    const period = this.resolveLflPeriod(query.period);
    const [
      currentSalesFacts,
      previousSalesFacts,
      currentSnapshots,
      previousSnapshots,
    ] = await Promise.all([
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          saleDate: {
            gte: period.currentFromDate,
            lte: period.currentToDate,
          },
        },
        include: {
          store: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              article: true,
              name: true,
              purchasePrice: true,
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          saleDate: {
            gte: period.previousFromDate,
            lte: period.previousToDate,
          },
        },
        include: {
          store: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              article: true,
              name: true,
              purchasePrice: true,
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          snapshotDate: { lte: period.currentToDate },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          product: { select: { purchasePrice: true } },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          snapshotDate: { lte: period.previousToDate },
        },
        select: {
          storeId: true,
          productId: true,
          snapshotDate: true,
          quantity: true,
          product: { select: { purchasePrice: true } },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);
    const currentCostBasis = buildProductCostBasis([], currentSnapshots);
    const previousCostBasis = buildProductCostBasis([], previousSnapshots);
    const comparableKeys = this.comparableProductStoreKeys(
      currentSalesFacts,
      previousSalesFacts,
    );
    const currentRows = this.lflAccumulators(
      currentSalesFacts,
      currentCostBasis,
      comparableKeys,
    );
    const previousRows = this.lflAccumulators(
      previousSalesFacts,
      previousCostBasis,
      comparableKeys,
    );
    const rows = this.mergeLflRows(currentRows, previousRows);
    const summary =
      rows.find((row) => row.level === 'network') ??
      this.emptyLflRow('network', 'network', null, 'Вся сеть');

    return {
      tenantId,
      tenantSlug,
      period: period.period,
      currentFrom: this.toDateInputValue(period.currentFromDate),
      currentTo: this.toDateInputValue(period.currentToDate),
      previousFrom: this.toDateInputValue(period.previousFromDate),
      previousTo: this.toDateInputValue(period.previousToDate),
      summary,
      rows: rows.filter((row) => row.level !== 'network'),
    };
  }

  async getOosExclusions(
    user: AuthenticatedUser,
  ): Promise<ProductOosExclusionRow[]> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const rows = await this.prisma.productOosExclusion.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            article: true,
            name: true,
            externalDomain: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      product: row.product,
    }));
  }

  async createOosExclusion(
    user: AuthenticatedUser,
    dto: ProductOosExclusionDto,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    if (!Object.values(ProductOosExclusionType).includes(dto.type)) {
      throw new BadRequestException('Invalid exclusion type');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new BadRequestException('Product not found');
    }

    return this.prisma.productOosExclusion.upsert({
      where: {
        tenantId_productId: {
          tenantId,
          productId: dto.productId,
        },
      },
      create: {
        tenantId,
        productId: dto.productId,
        type: dto.type,
      },
      update: {
        type: dto.type,
      },
    });
  }

  async deleteOosExclusion(user: AuthenticatedUser, id: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const row = await this.prisma.productOosExclusion.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!row) {
      throw new BadRequestException('Exclusion not found');
    }

    return this.prisma.productOosExclusion.delete({ where: { id } });
  }

  private saleCost(
    fact: SalesFactWithCost,
    costBasisByProduct: Map<string, ProductCostBasis>,
  ) {
    const quantity = fact.quantity.toNumber();
    const unitCost = costBasisByProduct.get(fact.productId)?.unitCost;

    if (unitCost !== null && unitCost !== undefined && unitCost > 0) {
      return unitCost * quantity;
    }

    const storedCost = fact.cost.toNumber();

    if (storedCost > 0) {
      return storedCost;
    }

    return (fact.product?.purchasePrice?.toNumber() ?? 0) * quantity;
  }

  private comparableProductStoreKeys(
    currentFacts: LflSaleFact[],
    previousFacts: LflSaleFact[],
  ) {
    const currentKeys = new Set(
      currentFacts.map((fact) => `${fact.storeId}:${fact.productId}`),
    );
    const previousKeys = new Set(
      previousFacts.map((fact) => `${fact.storeId}:${fact.productId}`),
    );

    return new Set([...currentKeys].filter((key) => previousKeys.has(key)));
  }

  private lflAccumulators(
    facts: LflSaleFact[],
    costBasisByProduct: Map<string, ProductCostBasis>,
    comparableKeys: Set<string>,
  ) {
    const rows = new Map<string, LflAccumulator>();
    const add = (
      id: string,
      level: LflGroupLevel,
      parentId: string | null,
      name: string,
      revenue: number,
      grossProfit: number,
      quantity: number,
    ) => {
      const current = rows.get(id) ?? {
        id,
        level,
        parentId,
        name,
        revenue: 0,
        grossProfit: 0,
        quantity: 0,
      };

      current.revenue += revenue;
      current.grossProfit += grossProfit;
      current.quantity += quantity;
      rows.set(id, current);
    };

    facts.forEach((fact) => {
      const productStoreKey = `${fact.storeId}:${fact.productId}`;

      if (!comparableKeys.has(productStoreKey)) {
        return;
      }

      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = this.saleCost(fact, costBasisByProduct);
      const grossProfit = revenue - cost;
      const categoryId = fact.product.categoryId ?? 'without-category';
      const categoryName = fact.product.category?.name ?? 'Без категории';

      add(
        'network',
        'network',
        null,
        'Вся сеть',
        revenue,
        grossProfit,
        quantity,
      );
      add(
        `store:${fact.store.id}`,
        'store',
        'network',
        fact.store.name,
        revenue,
        grossProfit,
        quantity,
      );
      add(
        `category:${categoryId}`,
        'category',
        'network',
        categoryName,
        revenue,
        grossProfit,
        quantity,
      );
      add(
        `product:${fact.product.id}`,
        'product',
        `category:${categoryId}`,
        fact.product.name,
        revenue,
        grossProfit,
        quantity,
      );
    });

    return rows;
  }

  private mergeLflRows(
    currentRows: Map<string, LflAccumulator>,
    previousRows: Map<string, LflAccumulator>,
  ) {
    const ids = new Set([...currentRows.keys(), ...previousRows.keys()]);
    const levelRank: Record<LflGroupLevel, number> = {
      network: 0,
      store: 1,
      category: 2,
      product: 3,
    };

    return [...ids]
      .map((id) => {
        const current = currentRows.get(id);
        const previous = previousRows.get(id);
        const source = current ?? previous;

        if (!source) {
          return this.emptyLflRow(id, 'product', null, id);
        }

        const currentRevenue = current?.revenue ?? 0;
        const previousRevenue = previous?.revenue ?? 0;
        const currentGrossProfit = current?.grossProfit ?? 0;
        const previousGrossProfit = previous?.grossProfit ?? 0;
        const currentQuantity = current?.quantity ?? 0;
        const previousQuantity = previous?.quantity ?? 0;

        return {
          id,
          level: source.level,
          parentId: source.parentId,
          name: source.name,
          currentRevenue: this.round(currentRevenue),
          previousRevenue: this.round(previousRevenue),
          revenueDelta: this.round(currentRevenue - previousRevenue),
          revenueLflPercent: this.lflPercent(currentRevenue, previousRevenue),
          currentGrossProfit: this.round(currentGrossProfit),
          previousGrossProfit: this.round(previousGrossProfit),
          grossProfitDelta: this.round(
            currentGrossProfit - previousGrossProfit,
          ),
          grossProfitLflPercent: this.lflPercent(
            currentGrossProfit,
            previousGrossProfit,
          ),
          currentQuantity: this.round(currentQuantity),
          previousQuantity: this.round(previousQuantity),
          quantityDelta: this.round(currentQuantity - previousQuantity),
          quantityLflPercent: this.lflPercent(
            currentQuantity,
            previousQuantity,
          ),
        };
      })
      .sort(
        (a, b) =>
          levelRank[a.level] - levelRank[b.level] ||
          b.currentRevenue - a.currentRevenue ||
          a.name.localeCompare(b.name, 'ru'),
      );
  }

  private emptyLflRow(
    id: string,
    level: LflGroupLevel,
    parentId: string | null,
    name: string,
  ): LflReportRow {
    return {
      id,
      level,
      parentId,
      name,
      currentRevenue: 0,
      previousRevenue: 0,
      revenueDelta: 0,
      revenueLflPercent: 0,
      currentGrossProfit: 0,
      previousGrossProfit: 0,
      grossProfitDelta: 0,
      grossProfitLflPercent: 0,
      currentQuantity: 0,
      previousQuantity: 0,
      quantityDelta: 0,
      quantityLflPercent: 0,
    };
  }

  private lflPercent(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }

    return this.round(((current - previous) / previous) * 100);
  }

  private stockMovementImpact(
    movements: {
      type: StockMovementType;
      quantity: { toNumber: () => number };
      amount: { toNumber: () => number };
    }[],
  ) {
    return movements.reduce(
      (impact, movement) => {
        const quantity = movement.quantity.toNumber();
        const amount = movement.amount.toNumber();

        if (movement.type === StockMovementType.WRITEOFF) {
          impact.writeOffQuantity += quantity;
          impact.writeOffAmount += amount;
        } else {
          impact.returnQuantity += quantity;
          impact.returnAmount += amount;
        }

        return impact;
      },
      {
        writeOffQuantity: 0,
        writeOffAmount: 0,
        returnQuantity: 0,
        returnAmount: 0,
      },
    );
  }

  private latestStockByProduct(
    snapshots: {
      storeId: string;
      productId: string;
      snapshotDate?: Date;
      quantity: { toNumber: () => number };
    }[],
  ) {
    const seen = new Set<string>();
    const stockByProduct = new Map<string, number>();

    [...snapshots]
      .sort(
        (a, b) =>
          (b.snapshotDate?.getTime() ?? 0) - (a.snapshotDate?.getTime() ?? 0),
      )
      .forEach((snapshot) => {
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

  private latestStockByStoreProduct(snapshots: StockSnapshot[]) {
    const seen = new Set<string>();
    const stockByStoreProduct = new Map<string, StockByStoreProductItem>();

    snapshots.forEach((snapshot) => {
      const snapshotKey = `${snapshot.storeId}:${snapshot.productId}`;

      if (seen.has(snapshotKey)) {
        return;
      }

      seen.add(snapshotKey);
      stockByStoreProduct.set(snapshotKey, {
        productId: snapshot.productId,
        storeId: snapshot.storeId,
        storeName: snapshot.store.name,
        article: snapshot.product.article,
        name: snapshot.product.name,
        isCanonical: Boolean(snapshot.product.canonicalProduct),
        canonicalProductName: snapshot.product.canonicalProduct?.name ?? null,
        categoryName: snapshot.product.category?.name ?? null,
        supplierName: snapshot.product.supplier?.name ?? null,
        stockQuantity: snapshot.quantity.toNumber(),
        unitCost: snapshot.product.purchasePrice?.toNumber() ?? 0,
      });
    });

    return stockByStoreProduct;
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

  private replenishmentRisk(
    stockQuantity: number,
    averageDailySales: number,
    stockDays: number | null,
  ): ReplenishmentRisk {
    if (averageDailySales <= 0) {
      return 'NO_SALES';
    }

    if (stockQuantity <= 0) {
      return 'OUT_OF_STOCK';
    }

    if (stockDays !== null && stockDays <= 3) {
      return 'LOW_STOCK';
    }

    return 'OK';
  }

  private replenishmentRiskRank(risk: ReplenishmentRisk) {
    const ranks: Record<ReplenishmentRisk, number> = {
      OUT_OF_STOCK: 0,
      LOW_STOCK: 1,
      OK: 2,
      NO_SALES: 3,
    };

    return ranks[risk];
  }

  private outOfStockRiskProducts(
    productSales: Map<string, ProductSales>,
    stockByStoreProduct: Map<string, StockByStoreProductItem>,
    demandPeriodDays: number,
    selectedPeriodDays: number,
    excludedProductIds: Set<string>,
  ): OutOfStockRiskProduct[] {
    return [...productSales.values()]
      .filter((sale) => !excludedProductIds.has(sale.productId))
      .filter(
        (sale): sale is ProductSales & { storeId: string; storeName: string } =>
          Boolean(sale.storeId && sale.storeName),
      )
      .map((sale) => {
        const averageDailySales = sale.quantity / demandPeriodDays;
        const stockItem = stockByStoreProduct.get(
          `${sale.storeId}:${sale.productId}`,
        );
        const stockQuantity = stockItem?.stockQuantity ?? 0;
        const stockDays =
          averageDailySales > 0 ? stockQuantity / averageDailySales : 0;
        const revenueAtRiskPerDay = sale.revenue / demandPeriodDays;
        const grossProfitAtRiskPerDay =
          (sale.revenue - sale.cost) / demandPeriodDays;

        return {
          productId: sale.productId,
          storeId: sale.storeId,
          storeName: sale.storeName,
          article: sale.article,
          name: sale.name,
          isCanonical: sale.isCanonical,
          canonicalProductName: sale.canonicalProductName,
          supplierName: sale.supplierName ?? stockItem?.supplierName ?? null,
          stockQuantity: this.round(stockQuantity),
          averageDailySales: this.round(averageDailySales),
          revenueAtRiskPerDay: this.round(revenueAtRiskPerDay),
          grossProfitAtRiskPerDay: this.round(grossProfitAtRiskPerDay),
          grossProfitAtRiskForPeriod: this.round(
            grossProfitAtRiskPerDay * selectedPeriodDays,
          ),
          stockDays: this.round(stockDays),
        };
      })
      .filter((item) => item.averageDailySales > 0 && item.stockDays <= 3)
      .sort(
        (a, b) =>
          a.storeName.localeCompare(b.storeName, 'ru') ||
          b.averageDailySales - a.averageDailySales ||
          a.name.localeCompare(b.name, 'ru'),
      );
  }

  private productSalesByProduct(
    salesFacts: {
      productId: string;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
      product: {
        article: string;
        name: string;
        canonicalProduct: { name: string } | null;
        supplier?: { name: string } | null;
      };
    }[],
  ) {
    const productSales = new Map<string, ProductSales>();

    salesFacts.forEach((fact) => {
      const current = productSales.get(fact.productId) ?? {
        productId: fact.productId,
        storeId: null,
        storeName: null,
        article: fact.product.article,
        name: fact.product.name,
        isCanonical: Boolean(fact.product.canonicalProduct),
        canonicalProductName: fact.product.canonicalProduct?.name ?? null,
        supplierName: fact.product.supplier?.name ?? null,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };

      current.quantity += fact.quantity.toNumber();
      current.revenue += fact.revenue.toNumber();
      current.cost += fact.cost.toNumber();
      productSales.set(fact.productId, current);
    });

    return productSales;
  }

  private productSalesByStoreProduct(
    salesFacts: {
      productId: string;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
      store: {
        id: string;
        name: string;
      };
      product: {
        article: string;
        name: string;
        canonicalProduct: { name: string } | null;
        supplier?: { name: string } | null;
      };
    }[],
  ) {
    const productSales = new Map<string, ProductSales>();

    salesFacts.forEach((fact) => {
      const key = `${fact.store.id}:${fact.productId}`;
      const current = productSales.get(key) ?? {
        productId: fact.productId,
        storeId: fact.store.id,
        storeName: fact.store.name,
        article: fact.product.article,
        name: fact.product.name,
        isCanonical: Boolean(fact.product.canonicalProduct),
        canonicalProductName: fact.product.canonicalProduct?.name ?? null,
        supplierName: fact.product.supplier?.name ?? null,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };

      current.quantity += fact.quantity.toNumber();
      current.revenue += fact.revenue.toNumber();
      current.cost += fact.cost.toNumber();
      productSales.set(key, current);
    });

    return productSales;
  }

  private productsWithoutSales(
    stockByStoreProduct: Map<string, StockByStoreProductItem>,
    productSales: Map<string, ProductSales>,
    excludedProductIds: Set<string>,
    lastSaleByStoreProduct: Map<string, Date>,
    incomingStockByStoreProduct: Set<string>,
    periodToDate: Date,
  ): ProductWithoutSales[] {
    return [...stockByStoreProduct.values()]
      .filter((item) => !excludedProductIds.has(item.productId))
      .filter((item) => this.round(item.stockQuantity) > 0)
      .filter((item) => !productSales.has(`${item.storeId}:${item.productId}`))
      .filter(
        (item) =>
          !incomingStockByStoreProduct.has(`${item.storeId}:${item.productId}`),
      )
      .map((item) => {
        const lastSaleDate =
          lastSaleByStoreProduct.get(`${item.storeId}:${item.productId}`) ??
          null;

        return {
          productId: item.productId,
          storeId: item.storeId,
          storeName: item.storeName,
          article: item.article,
          name: item.name,
          isCanonical: item.isCanonical,
          canonicalProductName: item.canonicalProductName,
          stockQuantity: this.round(item.stockQuantity),
          frozenStockAmount: this.round(item.stockQuantity * item.unitCost),
          lastSaleDate: lastSaleDate
            ? this.toDateInputValue(lastSaleDate)
            : null,
          daysWithoutSales: lastSaleDate
            ? this.daysBetween(lastSaleDate, periodToDate)
            : null,
          categoryName: item.categoryName,
          supplierName: item.supplierName,
        };
      })
      .sort(
        (a, b) =>
          b.stockQuantity - a.stockQuantity || a.name.localeCompare(b.name),
      );
  }

  private incomingStockByStoreProduct(
    snapshots: StockSnapshot[],
    periodFromDate: Date,
    periodToDate: Date,
  ) {
    const snapshotsByStoreProduct = new Map<string, StockSnapshot[]>();

    snapshots.forEach((snapshot) => {
      const key = `${snapshot.storeId}:${snapshot.productId}`;
      const productSnapshots = snapshotsByStoreProduct.get(key) ?? [];
      productSnapshots.push(snapshot);
      snapshotsByStoreProduct.set(key, productSnapshots);
    });

    const incomingStockByStoreProduct = new Set<string>();

    snapshotsByStoreProduct.forEach((productSnapshots, key) => {
      const sortedSnapshots = [...productSnapshots].sort(
        (a, b) =>
          (a.snapshotDate?.getTime() ?? 0) - (b.snapshotDate?.getTime() ?? 0),
      );
      let previousQuantity = 0;

      sortedSnapshots.forEach((snapshot) => {
        const quantity = Math.max(0, snapshot.quantity.toNumber());
        const snapshotDate = snapshot.snapshotDate;
        const isInPeriod =
          snapshotDate !== undefined &&
          snapshotDate >= periodFromDate &&
          snapshotDate <= periodToDate;

        if (isInPeriod && quantity > previousQuantity) {
          incomingStockByStoreProduct.add(key);
        }

        previousQuantity = quantity;
      });
    });

    return incomingStockByStoreProduct;
  }

  private lastSaleByStoreProduct(
    salesFacts: { storeId: string; productId: string; saleDate: Date }[],
  ) {
    const lastSaleByStoreProduct = new Map<string, Date>();

    salesFacts.forEach((fact) => {
      const key = `${fact.storeId}:${fact.productId}`;
      const currentDate = lastSaleByStoreProduct.get(key);

      if (!currentDate || fact.saleDate > currentDate) {
        lastSaleByStoreProduct.set(key, fact.saleDate);
      }
    });

    return lastSaleByStoreProduct;
  }

  private daysBetween(from: Date, to: Date) {
    const fromUtc = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    const toUtc = Date.UTC(
      to.getUTCFullYear(),
      to.getUTCMonth(),
      to.getUTCDate(),
    );

    return Math.max(0, Math.floor((toUtc - fromUtc) / DAY_IN_MS));
  }

  private buildRecommendations(
    productSales: Map<string, ProductSales>,
    outOfStockRiskProducts: OutOfStockRiskProduct[],
    productsWithoutSales: ProductWithoutSales[],
  ): ReportRecommendation[] {
    const recommendations: ReportRecommendation[] = [
      ...outOfStockRiskProducts.map((product) => ({
        id: `stock:${product.storeId}:${product.productId}`,
        kind: 'REPLENISH_STOCK' as const,
        severity:
          product.stockDays <= 1 ? ('HIGH' as const) : ('MEDIUM' as const),
        title: `Пополнить запас: ${product.name}`,
        description: `Текущего остатка хватит примерно на ${product.stockDays} дн. при среднем спросе ${product.averageDailySales} шт/день.`,
        action: 'Проверить поставщика и ближайший заказ.',
        productId: product.productId,
        storeId: product.storeId,
        storeName: product.storeName,
        article: product.article,
        productName: product.name,
        metricLabel: 'Дней запаса',
        metricValue: String(product.stockDays),
      })),
      ...productsWithoutSales
        .filter((product) => product.stockQuantity > 0)
        .map((product) => ({
          id: `no-sales:${product.storeId}:${product.productId}`,
          kind: 'NO_SALES' as const,
          severity: 'LOW' as const,
          title: `Разобрать товар без продаж: ${product.name}`,
          description: `В выбранном периоде продаж нет, но на остатке ${product.stockQuantity} шт.`,
          action: 'Проверить цену, выкладку или необходимость архивации.',
          productId: product.productId,
          storeId: product.storeId,
          storeName: product.storeName,
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
          storeId: item.sale.storeId,
          storeName: item.sale.storeName,
          article: item.sale.article,
          productName: item.sale.name,
          metricLabel: 'Маржа',
          metricValue: `${this.round(item.marginPercent)}%`,
        })),
    ];

    return recommendations.sort(
      (a, b) =>
        this.severityRank(a.severity) - this.severityRank(b.severity) ||
        a.title.localeCompare(b.title),
    );
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
        revenue: this.round(revenue),
        grossProfit: this.round(profit),
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

  private resolveNewProductsPeriod() {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (NEW_PRODUCTS_PERIOD_DAYS - 1));
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    return { fromDate, toDate };
  }

  private resolveLflPeriod(period: LflPeriod = 'day') {
    const validPeriods: LflPeriod[] = ['day', 'week', 'month'];

    if (!validPeriods.includes(period)) {
      throw new BadRequestException('period must be day, week or month');
    }

    const now = new Date();
    const anchorDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const currentFromDate = new Date(anchorDate);
    const currentToDate = new Date(anchorDate);

    if (period === 'week') {
      const dayOfWeek = anchorDate.getUTCDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      currentFromDate.setUTCDate(anchorDate.getUTCDate() - daysSinceMonday);
    }

    if (period === 'month') {
      currentFromDate.setUTCDate(1);
    }

    currentFromDate.setUTCHours(0, 0, 0, 0);
    currentToDate.setUTCHours(23, 59, 59, 999);

    const previousFromDate = new Date(currentFromDate);
    previousFromDate.setUTCFullYear(previousFromDate.getUTCFullYear() - 1);
    const previousToDate = new Date(currentToDate);
    previousToDate.setUTCFullYear(previousToDate.getUTCFullYear() - 1);

    return {
      period,
      currentFromDate,
      currentToDate,
      previousFromDate,
      previousToDate,
    };
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
