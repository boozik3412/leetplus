import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductAssortmentRole,
  ProductOosExclusionType,
  RecommendationRole,
  RecommendationStatus,
  StockMovementType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  buildProductCostBasis,
  type ProductCostBasis,
} from './stock-cost-basis';
import type { UpdateRecommendationStateDto } from './reports.dto';
import {
  AssortmentHealthLoaderService,
  type AssortmentHealthLoaderResult,
} from '../common/assortment-health-loader.service';
import type {
  AssortmentHealth,
  AssortmentHealthRow,
  AssortmentMetricState,
  AssortmentNoSalesWindow,
} from '../common/assortment-health';

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
  storeIds?: string | string[];
  categoryId?: string;
  categoryIds?: string | string[];
  asOf?: string;
  noSalesDays?: AssortmentNoSalesWindow | string;
  stockStatus?: 'OUT_OF_STOCK' | 'LOW_STOCK';
  excess?: boolean | 'true' | 'false';
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
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  stockQuantity: number;
  averageDailySales: number;
  revenueAtRiskPerDay: number | null;
  grossProfitAtRiskPerDay: number | null;
  grossProfitAtRiskForPeriod: number | null;
  stockDays: number | null;
  state?: AssortmentHealthRow['risk'];
  reason?: string | null;
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
  frozenStockUnitValue: number | null;
  frozenStockValuation: FrozenStockValuation;
  frozenStockAmount: number | null;
  lastSaleDate: string | null;
  daysWithoutSales: number | null;
  categoryName: string | null;
  supplierName: string | null;
  state?: AssortmentHealthRow['risk'];
  reason?: string | null;
};
export type FrozenStockValuation =
  | 'PURCHASE_PRICE'
  | 'SALE_PRICE'
  | 'HISTORICAL_REVENUE'
  | 'CLUB_PURCHASE_PRICE'
  | 'SALES_UNIT_COST'
  | 'PRODUCT_PURCHASE_PRICE'
  | 'SALE_PRICE_ESTIMATE'
  | 'UNKNOWN';

export type ReportRecommendation = {
  id: string;
  kind: 'REPLENISH_STOCK' | 'NO_SALES' | 'LOW_MARGIN';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  role: RecommendationRole;
  status: RecommendationStatus;
  statusNote: string | null;
  statusChangedAt: string | null;
  effectType: 'PROFIT_PROTECTION' | 'STOCK_RELEASE' | 'MARGIN_UPLIFT';
  effectLabel: string;
  effectAmount: number;
  effectUnit: 'RUB';
  effectDescription: string;
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
  storeIds: string[];
  categoryIds: string[];
  asOf: string;
  noSalesDays: AssortmentNoSalesWindow;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number | null;
  adjustedGrossProfit: number | null;
  marginPercent: number | null;
  adjustedMarginPercent: number | null;
  marginCoverage: ReportMarginCoverage;
  soldQuantity: number;
  writeOffQuantity: number | null;
  writeOffAmount: number | null;
  returnQuantity: number;
  returnAmount: number;
  averageDailyRevenue: number;
  stockQuantity: number;
  stockDays: number | null;
  recommendations: ReportRecommendation[];
  outOfStockRiskProducts: OutOfStockRiskProduct[];
  productsWithoutSales: ProductWithoutSales[];
  writeOffMovements?: WriteOffMovementRow[];
  assortmentHealth?: AssortmentHealth['summary'];
  assortmentRows?: {
    outOfStock: AssortmentHealthRow[];
    noSales: AssortmentHealthRow[];
    writeOffs: AssortmentHealthRow[];
  };
};

export type WriteOffMovementRow = {
  id: string;
  movementDate: string;
  storeId: string;
  storeName: string;
  productId: string;
  article: string;
  productName: string;
  categoryName: string | null;
  quantity: number;
  amount: number;
};

export type ReportMarginCoverage = {
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
export type PlanFactGroupLevel = 'network' | 'store' | 'category' | 'supplier';

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

export type PlanFactReportRow = {
  id: string;
  level: PlanFactGroupLevel;
  parentId: string | null;
  name: string;
  currentRevenue: number;
  planRevenue: number;
  revenueDelta: number;
  revenueCompletionPercent: number | null;
  currentGrossProfit: number;
  planGrossProfit: number;
  grossProfitDelta: number;
  grossProfitCompletionPercent: number | null;
  currentQuantity: number;
  planQuantity: number;
  quantityDelta: number;
  quantityCompletionPercent: number | null;
};

export type PlanFactReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  planFrom: string;
  planTo: string;
  summary: PlanFactReportRow;
  rows: PlanFactReportRow[];
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
  writeOffQuantity: number;
  writeOffAmount: number;
  oosSkuCount: number;
  slowSkuCount: number;
  frozenSkuCount: number;
  frozenStockAmount: number;
  problemCategoryName: string | null;
  deliveryQualityStatus: 'TERMS_CONFIGURED' | 'NO_DELIVERY_FACTS';
  deliveryQualityNote: string;
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

export type ReplenishmentCoverage = {
  state: AssortmentMetricState;
  reason: string | null;
  covered: number;
  total: number;
  percent: number | null;
};

export type ReplenishmentReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  storeIds: string[];
  categoryIds: string[];
  asOf: string;
  totalStockQuantity: number;
  totalDailyNeed: number;
  totalRecommendedOrder: number;
  rows: ReplenishmentRow[];
  assortmentHealth: AssortmentHealth['summary'];
  coverage: ReplenishmentCoverage;
};

export type InventoryTurnoverStatus = 'OK' | 'SLOW' | 'FROZEN';

export type InventoryTurnoverRow = {
  productId: string;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  isCanonical: boolean;
  canonicalProductName: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  stockQuantity: number;
  soldQuantity: number;
  revenue: number;
  grossProfit: number;
  averageDailySales: number;
  stockDays: number | null;
  turnoverRate: number;
  frozenStockUnitValue: number | null;
  frozenStockValuation: FrozenStockValuation;
  frozenStockAmount: number | null;
  lastSaleDate: string | null;
  daysWithoutSales: number | null;
  status: InventoryTurnoverStatus;
};

export type InventoryTurnoverReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  storeIds: string[];
  categoryIds: string[];
  asOf: string;
  periodDays: number;
  totalStockQuantity: number;
  totalFrozenStockAmount: number;
  averageStockDays: number | null;
  slowSkuCount: number;
  frozenSkuCount: number;
  rows: InventoryTurnoverRow[];
  assortmentHealth?: AssortmentHealth['summary'];
  assortmentRows?: AssortmentHealthRow[];
};

export type AssortmentMatrixStatus =
  | 'SOLD'
  | 'IN_STOCK'
  | 'NO_STOCK'
  | 'NO_SALES'
  | 'MISSING'
  | 'NEEDS_REPLENISHMENT'
  | 'EXCLUDED';

export type AssortmentQualityLevel = 'network' | 'store' | 'category';

export type AssortmentQualityRow = {
  id: string;
  level: AssortmentQualityLevel;
  name: string;
  mandatoryCells: number;
  healthyCells: number;
  missingCells: number;
  noStockCells: number;
  noSalesCells: number;
  replenishmentCells: number;
  optionalCells: number;
  qualityIndex: number | null;
};

export type AssortmentMatrixRow = {
  id: string;
  productId: string;
  canonicalProductId: string | null;
  storeId: string;
  storeName: string;
  article: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  assortmentRole: ProductAssortmentRole;
  isMandatory: boolean;
  existsInStore: boolean;
  isSold: boolean;
  inStock: boolean;
  noSales: boolean;
  needsReplenishment: boolean;
  status: AssortmentMatrixStatus;
  stockQuantity: number;
  soldQuantity: number;
  revenue: number;
  grossProfit: number;
  averageDailySales: number;
  stockDays: number | null;
  qualityPoints: number;
  qualityMaxPoints: number;
};

export type AssortmentMatrixSummary = {
  mandatoryCells: number;
  healthyCells: number;
  missingCells: number;
  noStockCells: number;
  noSalesCells: number;
  replenishmentCells: number;
  optionalCells: number;
  qualityIndex: number | null;
};

export type AssortmentMatrixReport = {
  tenantId: string;
  tenantSlug: string;
  from: string;
  to: string;
  storeId: string | null;
  periodDays: number;
  summary: AssortmentMatrixSummary;
  byStore: AssortmentQualityRow[];
  byCategory: AssortmentQualityRow[];
  rows: AssortmentMatrixRow[];
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
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  revenue: number;
  cost: number;
};

type MatrixProduct = {
  id: string;
  canonicalProductId: string | null;
  article: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  assortmentRole: ProductAssortmentRole;
  isMandatory: boolean;
  externalDomain: string | null;
};

type MatrixSales = {
  soldQuantity: number;
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
    salePrice?: { toNumber: () => number };
    canonicalProduct: { name: string } | null;
    categoryId?: string | null;
    category: { name: string } | null;
    supplierId?: string | null;
    supplier: { id?: string; name: string } | null;
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
  categoryId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  stockQuantity: number;
  unitCost: number;
  unitValueSource: FrozenStockValuation;
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

type PlanFactSaleFact = SalesFactWithCost & {
  storeId: string;
  revenue: { toNumber: () => number };
  store: {
    id: string;
    name: string;
  };
  product: {
    id: string;
    name: string;
    purchasePrice?: { toNumber: () => number } | null;
    categoryId: string | null;
    category: { name: string } | null;
    supplierId: string | null;
    supplier: { name: string } | null;
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

type PlanFactAccumulator = {
  id: string;
  level: PlanFactGroupLevel;
  parentId: string | null;
  name: string;
  revenue: number;
  grossProfit: number;
  quantity: number;
};

const DEMAND_PERIOD_DAYS = 21;
const NEW_PRODUCTS_PERIOD_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REAPPEARED_AFTER_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly assortmentHealthLoader: AssortmentHealthLoaderService,
  ) {}

  async getAssortmentReport(
    user: AuthenticatedUser,
  ): Promise<AssortmentReport> {
    const { tenantId, tenantSlug, storeFilter, productVisibility } =
      await this.resolveStoreReadScope(user);

    const [totalSku, activeProducts, inventorySnapshots] = await Promise.all([
      this.prisma.product.count({
        where: { tenantId, ...productVisibility },
      }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true, ...productVisibility },
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
        where: { tenantId, ...storeFilter },
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
    const requestedStoreIds = this.resolveRequestedStoreIds(query);
    const requestedCategoryIds = this.resolveRequestedCategoryIds(query);
    const scope = await this.resolveStoreReadScope(user, requestedStoreIds);
    const { tenantId, tenantSlug, storeFilter } = scope;
    const period = this.resolvePeriod(query);
    const asOf = this.resolveAssortmentAsOf(query.asOf);
    const relatedProductCategoryFilter: Prisma.SalesFactWhereInput =
      requestedCategoryIds?.length
        ? { product: { categoryId: { in: [...requestedCategoryIds] } } }
        : {};
    const reportTo = period.toDate > asOf ? asOf : period.toDate;
    const assortmentHealthPromise = this.assortmentHealthLoader.load({
      tenantId,
      storeIds: scope.effectiveStoreIds,
      categoryIds: requestedCategoryIds ?? null,
      period: { from: period.fromDate, to: period.toDate },
      asOf,
    });
    const [salesFacts, inventorySnapshots, stockMovements] = await Promise.all([
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          ...storeFilter,
          ...relatedProductCategoryFilter,
          saleDate: {
            gte: period.fromDate,
            lte: reportTo,
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
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          ...storeFilter,
          ...(requestedCategoryIds?.length
            ? { product: { categoryId: { in: [...requestedCategoryIds] } } }
            : {}),
          snapshotDate: {
            lte: asOf,
          },
          updatedAt: { lte: asOf },
        },
        include: {
          product: {
            select: {
              id: true,
              article: true,
              name: true,
              purchasePrice: true,
              salePrice: true,
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
          ...(requestedCategoryIds?.length
            ? { product: { categoryId: { in: [...requestedCategoryIds] } } }
            : {}),
          movementDate: {
            gte: period.fromDate,
            lte: reportTo,
          },
        },
        select: {
          type: true,
          quantity: true,
          amount: true,
        },
      }),
    ]);
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
        categoryName: null,
        supplierId: null,
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
    const stockQuantity = [...stockByProduct.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const grossProfit = totalRevenue - totalCost;
    const marginCoverage = this.buildMarginCoverage(
      salesFacts.map((fact) => ({
        revenue: fact.revenue.toNumber(),
        cost: fact.cost.toNumber(),
      })),
    );
    const movementImpact = this.stockMovementImpact(stockMovements);
    const adjustedGrossProfit =
      grossProfit - movementImpact.writeOffAmount - movementImpact.returnAmount;
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const assortmentHealth = await assortmentHealthPromise;
    const healthWriteOffQuantity =
      assortmentHealth.health.summary.writeOffQuantity?.value ?? null;
    const healthWriteOffAmount =
      assortmentHealth.health.summary.writeOffAmount?.value ?? null;
    const noSalesDays = this.resolveNoSalesDays(query.noSalesDays);
    const assortmentRows = this.operationalAssortmentRows(
      assortmentHealth.health.rows,
      query.stockStatus,
      noSalesDays,
    );
    const outOfStockRiskProducts = this.toOutOfStockRiskProducts(
      assortmentRows.outOfStock,
      assortmentHealth,
    );
    const productsWithoutSales = this.toProductsWithoutSales(
      assortmentRows.noSales,
      assortmentHealth,
    );
    const recommendations = await this.applyRecommendationWorkflowState(
      tenantId,
      this.buildRecommendations(
        productSales,
        outOfStockRiskProducts,
        productsWithoutSales,
      ),
    );

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      storeIds: scope.effectiveStoreIds ? [...scope.effectiveStoreIds] : [],
      categoryIds: requestedCategoryIds ? [...requestedCategoryIds] : [],
      asOf: asOf.toISOString(),
      noSalesDays,
      totalRevenue: this.round(totalRevenue),
      totalCost: this.round(totalCost),
      grossProfit: marginCoverage.fullGrossProfit,
      adjustedGrossProfit:
        marginCoverage.fullGrossProfit === null || healthWriteOffAmount === null
          ? null
          : this.round(adjustedGrossProfit),
      marginPercent: marginCoverage.fullMarginPercent,
      adjustedMarginPercent:
        marginCoverage.fullGrossProfit === null || healthWriteOffAmount === null
          ? null
          : this.marginPercent(
              totalRevenue - adjustedGrossProfit,
              totalRevenue,
            ),
      marginCoverage,
      soldQuantity: this.round(soldQuantity),
      writeOffQuantity: healthWriteOffQuantity,
      writeOffAmount: healthWriteOffAmount,
      returnQuantity: this.round(movementImpact.returnQuantity),
      returnAmount: this.round(movementImpact.returnAmount),
      averageDailyRevenue: this.round(totalRevenue / periodDays),
      stockQuantity: this.round(stockQuantity),
      stockDays:
        soldQuantity > 0
          ? this.round(stockQuantity / (soldQuantity / periodDays))
          : null,
      recommendations,
      outOfStockRiskProducts,
      productsWithoutSales,
      writeOffMovements: this.toWriteOffMovements(
        assortmentHealth,
        period,
        asOf,
      ),
      assortmentHealth: assortmentHealth.health.summary,
      assortmentRows,
    };
  }

  async getInventoryTurnoverReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<InventoryTurnoverReport> {
    const requestedStoreIds = this.resolveRequestedStoreIds(query);
    const requestedCategoryIds = this.resolveRequestedCategoryIds(query);
    const scope = await this.resolveStoreReadScope(user, requestedStoreIds);
    const { tenantId, tenantSlug } = scope;
    const period = this.resolvePeriod(query);
    const asOf = this.resolveAssortmentAsOf(query.asOf);
    const assortmentHealth = await this.assortmentHealthLoader.load({
      tenantId,
      storeIds: scope.effectiveStoreIds,
      categoryIds: requestedCategoryIds ?? null,
      period: { from: period.fromDate, to: period.toDate },
      asOf,
    });
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const assortmentRows = this.turnoverAssortmentRows(
      assortmentHealth.health.rows,
      query.excess,
    );
    const rows = this.toInventoryTurnoverRows(assortmentRows, assortmentHealth);
    const stockDayRows = rows.filter((row) => row.stockDays !== null);
    const stockDaysSum = stockDayRows.reduce(
      (sum, row) => sum + (row.stockDays ?? 0),
      0,
    );
    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      storeIds: scope.effectiveStoreIds ? [...scope.effectiveStoreIds] : [],
      categoryIds: requestedCategoryIds ? [...requestedCategoryIds] : [],
      asOf: asOf.toISOString(),
      periodDays,
      totalStockQuantity: this.round(
        rows.reduce((sum, row) => sum + row.stockQuantity, 0),
      ),
      totalFrozenStockAmount: this.round(
        rows.reduce((sum, row) => sum + (row.frozenStockAmount ?? 0), 0),
      ),
      averageStockDays:
        stockDayRows.length > 0
          ? this.round(stockDaysSum / stockDayRows.length)
          : null,
      slowSkuCount: rows.filter((row) => row.status === 'SLOW').length,
      frozenSkuCount: rows.filter((row) => row.status === 'FROZEN').length,
      rows,
      assortmentHealth: assortmentHealth.health.summary,
      assortmentRows,
    };
  }

  async getAssortmentMatrixReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<AssortmentMatrixReport> {
    const { tenantId, tenantSlug, storeFilter, storeWhere, productVisibility } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolvePeriod(query);

    const [stores, products, inventorySnapshots, salesFacts] =
      await Promise.all([
        this.prisma.store.findMany({
          where: storeWhere,
          select: {
            id: true,
            name: true,
            externalDomain: true,
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.product.findMany({
          where: { tenantId, isActive: true, ...productVisibility },
          select: {
            id: true,
            canonicalProductId: true,
            article: true,
            name: true,
            assortmentRole: true,
            isMandatory: true,
            externalDomain: true,
            categoryId: true,
            category: { select: { name: true } },
            supplierId: true,
            supplier: { select: { name: true } },
            canonicalProduct: { select: { name: true } },
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
          select: {
            storeId: true,
            productId: true,
            snapshotDate: true,
            quantity: true,
          },
          orderBy: { snapshotDate: 'desc' },
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
          select: {
            storeId: true,
            productId: true,
            quantity: true,
            revenue: true,
            cost: true,
          },
        }),
      ]);

    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const matrixProducts = products.map((product) => ({
      id: product.id,
      canonicalProductId: product.canonicalProductId,
      article: product.article,
      name: product.canonicalProduct?.name ?? product.name,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      supplierId: product.supplierId,
      supplierName: product.supplier?.name ?? null,
      assortmentRole: product.assortmentRole,
      isMandatory: product.isMandatory,
      externalDomain: product.externalDomain,
    }));
    const productGroups = this.groupAssortmentMatrixProducts(matrixProducts);
    const stockByStoreProduct =
      this.latestMatrixStockByStoreProduct(inventorySnapshots);
    const salesByStoreProduct = this.matrixSalesByStoreProduct(salesFacts);
    const rows: AssortmentMatrixRow[] = [];

    stores.forEach((store) => {
      productGroups.forEach((product) => {
        const aggregate = product.productIds.reduce(
          (current, productId) => {
            const key = `${store.id}:${productId}`;
            const sale = salesByStoreProduct.get(key);

            current.stockQuantity += stockByStoreProduct.get(key) ?? 0;
            current.soldQuantity += sale?.soldQuantity ?? 0;
            current.revenue += sale?.revenue ?? 0;
            current.cost += sale?.cost ?? 0;

            if (stockByStoreProduct.has(key) || salesByStoreProduct.has(key)) {
              current.hasStoreActivity = true;
            }

            return current;
          },
          {
            stockQuantity: 0,
            soldQuantity: 0,
            revenue: 0,
            cost: 0,
            hasStoreActivity: false,
          },
        );
        const existsInStore =
          aggregate.hasStoreActivity ||
          Boolean(
            store.externalDomain &&
            product.externalDomains.has(store.externalDomain),
          );
        const averageDailySales = aggregate.soldQuantity / periodDays;
        const stockDays =
          averageDailySales > 0
            ? aggregate.stockQuantity / averageDailySales
            : null;
        const inStock = aggregate.stockQuantity > 0;
        const isSold = aggregate.soldQuantity > 0;
        const noSales = existsInStore && inStock && !isSold;
        const needsReplenishment =
          existsInStore &&
          isSold &&
          (aggregate.stockQuantity <= 0 ||
            (stockDays !== null && stockDays <= 3));
        const status = this.assortmentMatrixStatus({
          assortmentRole: product.assortmentRole,
          existsInStore,
          inStock,
          isSold,
          noSales,
          needsReplenishment,
        });
        const quality = this.assortmentMatrixQuality({
          assortmentRole: product.assortmentRole,
          isMandatory: product.isMandatory,
          status,
        });

        rows.push({
          id: `${store.id}:${product.id}`,
          productId: product.id,
          canonicalProductId: product.canonicalProductId,
          storeId: store.id,
          storeName: store.name,
          article: product.article,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          supplierId: product.supplierId,
          supplierName: product.supplierName,
          assortmentRole: product.assortmentRole,
          isMandatory: product.isMandatory,
          existsInStore,
          isSold,
          inStock,
          noSales,
          needsReplenishment,
          status,
          stockQuantity: this.round(aggregate.stockQuantity),
          soldQuantity: this.round(aggregate.soldQuantity),
          revenue: this.round(aggregate.revenue),
          grossProfit: this.round(aggregate.revenue - aggregate.cost),
          averageDailySales: this.round(averageDailySales),
          stockDays: stockDays === null ? null : this.round(stockDays),
          qualityPoints: quality.points,
          qualityMaxPoints: quality.maxPoints,
        });
      });
    });

    rows.sort(
      (a, b) =>
        this.assortmentMatrixStatusRank(a.status) -
          this.assortmentMatrixStatusRank(b.status) ||
        Number(b.isMandatory) - Number(a.isMandatory) ||
        a.storeName.localeCompare(b.storeName, 'ru') ||
        (a.categoryName ?? '').localeCompare(b.categoryName ?? '', 'ru') ||
        a.name.localeCompare(b.name, 'ru'),
    );

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      periodDays,
      summary: this.assortmentMatrixSummary(rows),
      byStore: this.assortmentMatrixQualityRows(
        rows,
        'store',
        (row) => row.storeId,
        (row) => row.storeName,
      ),
      byCategory: this.assortmentMatrixQualityRows(
        rows,
        'category',
        (row) => row.categoryId ?? 'uncategorized',
        (row) => row.categoryName ?? 'Без категории',
      ),
      rows,
    };
  }

  async getPlanFactReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<PlanFactReport> {
    const { tenantId, tenantSlug, storeFilter } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolvePeriod(query);
    const planPeriod = this.resolvePreviousPlanPeriod(period);

    const [currentSalesFacts, planSalesFacts, currentSnapshots, planSnapshots] =
      await Promise.all([
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
            store: { select: { id: true, name: true } },
            product: {
              select: {
                id: true,
                name: true,
                purchasePrice: true,
                categoryId: true,
                category: { select: { name: true } },
                supplierId: true,
                supplier: { select: { name: true } },
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
              gte: planPeriod.fromDate,
              lte: planPeriod.toDate,
            },
          },
          include: {
            store: { select: { id: true, name: true } },
            product: {
              select: {
                id: true,
                name: true,
                purchasePrice: true,
                categoryId: true,
                category: { select: { name: true } },
                supplierId: true,
                supplier: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.inventorySnapshot.findMany({
          where: {
            tenantId,
            ...storeFilter,
            snapshotDate: { lte: period.toDate },
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
            ...storeFilter,
            snapshotDate: { lte: planPeriod.toDate },
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
    const planCostBasis = buildProductCostBasis([], planSnapshots);
    const currentRows = this.planFactAccumulators(
      currentSalesFacts,
      currentCostBasis,
    );
    const planRows = this.planFactAccumulators(planSalesFacts, planCostBasis);
    const rows = this.mergePlanFactRows(currentRows, planRows);
    const summary =
      rows.find((row) => row.level === 'network') ??
      this.emptyPlanFactRow('network', 'network', null, 'Вся сеть');

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      planFrom: this.toDateInputValue(planPeriod.fromDate),
      planTo: this.toDateInputValue(planPeriod.toDate),
      summary,
      rows: rows.filter((row) => row.level !== 'network'),
    };
  }

  async getSalesDetailReport(
    user: AuthenticatedUser,
    query: OperationalReportQuery,
  ): Promise<SalesDetailReport> {
    const { tenantId, tenantSlug, storeFilter } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolvePeriod(query);

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
    const { tenantId, tenantSlug, storeFilter } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolvePeriod(query);

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
    const { tenantId, tenantSlug, storeFilter, productVisibility } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolvePeriod(query);

    const [salesFacts, activeProducts, inventorySnapshots, stockMovements] =
      await Promise.all([
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
            store: { select: { id: true, name: true } },
            product: {
              select: {
                article: true,
                name: true,
                purchasePrice: true,
                categoryId: true,
                category: { select: { name: true } },
                supplierId: true,
                canonicalProduct: { select: { name: true } },
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
          where: { tenantId, isActive: true, ...productVisibility },
          select: {
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
            store: { select: { id: true, name: true } },
            product: {
              select: {
                id: true,
                article: true,
                name: true,
                purchasePrice: true,
                salePrice: true,
                canonicalProduct: { select: { name: true } },
                categoryId: true,
                category: { select: { name: true } },
                supplierId: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { snapshotDate: 'desc' },
        }),
        this.prisma.stockMovement.findMany({
          where: {
            tenantId,
            ...storeFilter,
            movementDate: {
              gte: period.fromDate,
              lte: period.toDate,
            },
            type: StockMovementType.WRITEOFF,
          },
          include: {
            store: { select: { id: true, name: true } },
            product: {
              select: {
                supplierId: true,
                supplier: { select: { id: true, name: true } },
                category: { select: { name: true } },
              },
            },
          },
        }),
      ]);
    const costBasisByProduct = buildProductCostBasis([], inventorySnapshots);
    const stockByStoreProduct =
      this.latestStockByStoreProduct(inventorySnapshots);
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const periodSalesByStoreProduct =
      this.productSalesByStoreProduct(salesFacts);
    const turnoverRows = this.inventoryTurnoverRows(
      stockByStoreProduct,
      periodSalesByStoreProduct,
      new Map(),
      new Map(),
      periodDays,
      period.toDate,
    );
    const oosRows = this.outOfStockRiskProducts(
      periodSalesByStoreProduct,
      stockByStoreProduct,
      periodDays,
      periodDays,
      new Set(),
    );
    const supplierMetaByKey = new Map<
      string,
      {
        supplierId: string | null;
        supplierName: string;
        activeSku: number;
        paymentDelayDays: number | null;
        minOrderAmount: string | null;
        orderMultiplicity: number | null;
      }
    >();

    activeProducts.forEach((product) => {
      const key = product.supplierId ?? 'without-supplier';
      const current = supplierMetaByKey.get(key) ?? {
        supplierId: product.supplierId,
        supplierName: product.supplier?.name ?? 'Без поставщика',
        activeSku: 0,
        paymentDelayDays: product.supplier?.paymentDelayDays ?? null,
        minOrderAmount: product.supplier?.minOrderAmount?.toString() ?? null,
        orderMultiplicity: product.supplier?.orderMultiplicity ?? null,
      };
      current.activeSku += 1;
      supplierMetaByKey.set(key, current);
    });

    const rowsBySupplier = new Map<string, SupplierPerformanceRow>();
    const problemCategoryBySupplier = new Map<string, Map<string, number>>();
    let totalRevenue = 0;
    let totalGrossProfit = 0;
    const ensureSupplierRow = (
      key: string,
      meta?: {
        supplierId: string | null;
        supplierName: string;
        activeSku?: number;
        paymentDelayDays?: number | null;
        minOrderAmount?: string | null;
        orderMultiplicity?: number | null;
      },
    ) => {
      const savedMeta = supplierMetaByKey.get(key);
      const supplierId = meta?.supplierId ?? savedMeta?.supplierId ?? null;
      const supplierName =
        meta?.supplierName ?? savedMeta?.supplierName ?? 'Без поставщика';
      const current = rowsBySupplier.get(key) ?? {
        supplierId,
        supplierName,
        activeSku: meta?.activeSku ?? savedMeta?.activeSku ?? 0,
        soldQuantity: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        marginPercent: 0,
        salesSharePercent: 0,
        profitSharePercent: 0,
        averageRevenuePerSku: 0,
        paymentDelayDays:
          meta?.paymentDelayDays ?? savedMeta?.paymentDelayDays ?? null,
        minOrderAmount:
          meta?.minOrderAmount ?? savedMeta?.minOrderAmount ?? null,
        orderMultiplicity:
          meta?.orderMultiplicity ?? savedMeta?.orderMultiplicity ?? null,
        writeOffQuantity: 0,
        writeOffAmount: 0,
        oosSkuCount: 0,
        slowSkuCount: 0,
        frozenSkuCount: 0,
        frozenStockAmount: 0,
        problemCategoryName: null,
        deliveryQualityStatus: 'NO_DELIVERY_FACTS' as const,
        deliveryQualityNote: '',
      };

      rowsBySupplier.set(key, current);
      return current;
    };
    const addProblemCategory = (
      supplierKey: string,
      categoryName: string | null,
      amount: number,
    ) => {
      if (amount <= 0) {
        return;
      }

      const category = categoryName ?? 'Без категории';
      const categories =
        problemCategoryBySupplier.get(supplierKey) ?? new Map<string, number>();
      categories.set(category, (categories.get(category) ?? 0) + amount);
      problemCategoryBySupplier.set(supplierKey, categories);
    };

    supplierMetaByKey.forEach((meta, key) => ensureSupplierRow(key, meta));

    salesFacts.forEach((fact) => {
      const supplier = fact.product.supplier;
      const supplierId = fact.product.supplierId;
      const key = supplierId ?? 'without-supplier';
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = this.saleCost(fact, costBasisByProduct);
      const grossProfit = revenue - cost;
      const current = ensureSupplierRow(key, {
        supplierId,
        supplierName: supplier?.name ?? 'Без поставщика',
        paymentDelayDays: supplier?.paymentDelayDays ?? null,
        minOrderAmount: supplier?.minOrderAmount?.toString() ?? null,
        orderMultiplicity: supplier?.orderMultiplicity ?? null,
      });

      current.soldQuantity += quantity;
      current.revenue += revenue;
      current.cost += cost;
      current.grossProfit += grossProfit;

      totalRevenue += revenue;
      totalGrossProfit += grossProfit;
    });

    stockMovements.forEach((movement) => {
      const supplier = movement.product.supplier;
      const supplierId = movement.product.supplierId;
      const key = supplierId ?? 'without-supplier';
      const current = ensureSupplierRow(key, {
        supplierId,
        supplierName: supplier?.name ?? 'Без поставщика',
      });
      const quantity = movement.quantity.toNumber();
      const amount = movement.amount.toNumber();

      current.writeOffQuantity += quantity;
      current.writeOffAmount += amount;
      addProblemCategory(key, movement.product.category?.name ?? null, amount);
    });

    oosRows.forEach((row) => {
      const key = row.supplierId ?? 'without-supplier';
      const current = ensureSupplierRow(key, {
        supplierId: row.supplierId,
        supplierName: row.supplierName ?? 'Без поставщика',
      });

      current.oosSkuCount += 1;
      addProblemCategory(
        key,
        row.categoryName,
        row.grossProfitAtRiskForPeriod ?? 0,
      );
    });

    turnoverRows.forEach((row) => {
      if (row.status === 'OK') {
        return;
      }

      const key = row.supplierId ?? 'without-supplier';
      const current = ensureSupplierRow(key, {
        supplierId: row.supplierId,
        supplierName: row.supplierName ?? 'Без поставщика',
      });

      if (row.status === 'SLOW') {
        current.slowSkuCount += 1;
      } else {
        current.frozenSkuCount += 1;
      }

      current.frozenStockAmount += row.frozenStockAmount ?? 0;
      addProblemCategory(key, row.categoryName, row.frozenStockAmount ?? 0);
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
        writeOffQuantity: this.round(row.writeOffQuantity),
        writeOffAmount: this.round(row.writeOffAmount),
        frozenStockAmount: this.round(row.frozenStockAmount),
        problemCategoryName: this.topProblemCategory(
          problemCategoryBySupplier.get(row.supplierId ?? 'without-supplier') ??
            new Map<string, number>(),
        ),
        deliveryQualityStatus:
          row.paymentDelayDays !== null ||
          row.minOrderAmount !== null ||
          row.orderMultiplicity !== null
            ? ('TERMS_CONFIGURED' as const)
            : ('NO_DELIVERY_FACTS' as const),
        deliveryQualityNote:
          row.paymentDelayDays !== null ||
          row.minOrderAmount !== null ||
          row.orderMultiplicity !== null
            ? 'Условия поставки заполнены; фактические сроки и SLA поставок пока не импортируются.'
            : 'Фактические сроки и качество поставок пока не импортируются.',
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.frozenStockAmount - a.frozenStockAmount ||
          b.writeOffAmount - a.writeOffAmount ||
          a.supplierName.localeCompare(b.supplierName),
      );

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
    const requestedStoreIds = this.resolveRequestedStoreIds(query);
    const requestedCategoryIds = this.resolveRequestedCategoryIds(query);
    const scope = await this.resolveStoreReadScope(user, requestedStoreIds);
    const { tenantId, tenantSlug } = scope;
    const period = this.resolvePeriod(query);
    const asOf = this.resolveAssortmentAsOf(query.asOf);
    const assortmentHealth = await this.assortmentHealthLoader.load({
      tenantId,
      storeIds: scope.effectiveStoreIds,
      categoryIds: requestedCategoryIds ?? null,
      period: { from: period.fromDate, to: period.toDate },
      asOf,
    });
    const replenishmentRows = this.toReplenishmentRows(assortmentHealth);
    const rows = query.stockStatus
      ? replenishmentRows.rows.filter((row) => row.risk === query.stockStatus)
      : replenishmentRows.rows;

    return {
      tenantId,
      tenantSlug,
      from: this.toDateInputValue(period.fromDate),
      to: this.toDateInputValue(period.toDate),
      storeId: query.storeId ?? null,
      storeIds: scope.effectiveStoreIds ? [...scope.effectiveStoreIds] : [],
      categoryIds: requestedCategoryIds ? [...requestedCategoryIds] : [],
      asOf: asOf.toISOString(),
      totalStockQuantity: this.round(
        rows.reduce((sum, row) => sum + row.stockQuantity, 0),
      ),
      totalDailyNeed: this.round(
        rows.reduce((sum, row) => sum + row.dailyNeed, 0),
      ),
      totalRecommendedOrder: this.round(
        rows.reduce((sum, row) => sum + row.recommendedOrder, 0),
      ),
      rows: rows.sort(
        (a, b) =>
          this.replenishmentRiskRank(a.risk) -
            this.replenishmentRiskRank(b.risk) ||
          b.recommendedOrder - a.recommendedOrder ||
          a.name.localeCompare(b.name),
      ),
      assortmentHealth: assortmentHealth.health.summary,
      coverage: replenishmentRows.coverage,
    };
  }

  async getNewProductsReport(
    user: AuthenticatedUser,
    query: Pick<OperationalReportQuery, 'storeId'> = {},
  ): Promise<NewProductsReport> {
    const { tenantId, tenantSlug, storeFilter, productVisibility } =
      await this.resolveStoreReadScope(user, query.storeId);
    const period = this.resolveNewProductsPeriod();

    const [products, inventorySnapshots] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true, ...productVisibility },
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
    const { tenantId, tenantSlug, storeFilter } =
      await this.resolveStoreReadScope(user);
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
          ...storeFilter,
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
          ...storeFilter,
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
          ...storeFilter,
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
          ...storeFilter,
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
    const { tenantId } = await this.freshStoreScopeService.assertNetwork(user);
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
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);

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
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);
    const row = await this.prisma.productOosExclusion.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!row) {
      throw new BadRequestException('Exclusion not found');
    }

    return this.prisma.productOosExclusion.delete({ where: { id } });
  }

  async updateRecommendationState(
    user: AuthenticatedUser,
    recommendationKey: string,
    dto: UpdateRecommendationStateDto,
  ) {
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);
    const status = this.parseRecommendationStatus(dto.status);
    const role = dto.role ? this.parseRecommendationRole(dto.role) : undefined;
    const note =
      typeof dto.note === 'string'
        ? dto.note.trim() || null
        : dto.note === null
          ? null
          : undefined;
    const now = new Date();
    const isTerminal = this.isTerminalRecommendationStatus(status);

    const state = await this.prisma.recommendationState.upsert({
      where: {
        tenantId_recommendationKey: {
          tenantId,
          recommendationKey,
        },
      },
      create: {
        tenantId,
        recommendationKey,
        role: role ?? RecommendationRole.COMMERCIAL_DIRECTOR,
        status,
        note: note ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        statusChangedAt: now,
        resolvedAt: isTerminal ? now : null,
      },
      update: {
        status,
        ...(role ? { role } : {}),
        ...(note !== undefined ? { note } : {}),
        statusChangedAt: now,
        resolvedAt: isTerminal ? now : null,
      },
    });

    return this.serializeRecommendationState(state);
  }

  private async resolveStoreReadScope(
    user: AuthenticatedUser,
    requestedStoreIds?: string | readonly string[],
  ) {
    const requested =
      typeof requestedStoreIds === 'string'
        ? [requestedStoreIds]
        : requestedStoreIds;
    const scope = await this.freshStoreScopeService.resolveRequestedStoreIds(
      user,
      requested,
    );
    const storeFilter = scope.effectiveStoreIds
      ? { storeId: { in: [...scope.effectiveStoreIds] } }
      : {};
    const productVisibility: Prisma.ProductWhereInput = scope.effectiveStoreIds
      ? {
          OR: [
            {
              inventorySnapshots: {
                some: { storeId: { in: [...scope.effectiveStoreIds] } },
              },
            },
            {
              salesFacts: {
                some: { storeId: { in: [...scope.effectiveStoreIds] } },
              },
            },
            {
              stockMovements: {
                some: { storeId: { in: [...scope.effectiveStoreIds] } },
              },
            },
            {
              langameClubConfigurations: {
                some: { storeId: { in: [...scope.effectiveStoreIds] } },
              },
            },
          ],
        }
      : {};

    return {
      tenantId: scope.tenantId,
      tenantSlug: scope.tenantSlug,
      effectiveStoreIds: scope.effectiveStoreIds,
      storeFilter,
      productVisibility,
      storeWhere: {
        tenantId: scope.tenantId,
        isActive: true,
        ...(scope.effectiveStoreIds
          ? { id: { in: [...scope.effectiveStoreIds] } }
          : {}),
      },
    };
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

  private planFactAccumulators(
    facts: PlanFactSaleFact[],
    costBasisByProduct: Map<string, ProductCostBasis>,
  ) {
    const rows = new Map<string, PlanFactAccumulator>();
    const add = (
      id: string,
      level: PlanFactGroupLevel,
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
      const quantity = fact.quantity.toNumber();
      const revenue = fact.revenue.toNumber();
      const cost = this.saleCost(fact, costBasisByProduct);
      const grossProfit = revenue - cost;
      const categoryId = fact.product.categoryId ?? 'without-category';
      const categoryName = fact.product.category?.name ?? 'Без категории';
      const supplierId = fact.product.supplierId ?? 'without-supplier';
      const supplierName = fact.product.supplier?.name ?? 'Без поставщика';

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
        `supplier:${supplierId}`,
        'supplier',
        'network',
        supplierName,
        revenue,
        grossProfit,
        quantity,
      );
    });

    return rows;
  }

  private mergePlanFactRows(
    currentRows: Map<string, PlanFactAccumulator>,
    planRows: Map<string, PlanFactAccumulator>,
  ) {
    const ids = new Set([...currentRows.keys(), ...planRows.keys()]);
    const levelRank: Record<PlanFactGroupLevel, number> = {
      network: 0,
      store: 1,
      category: 2,
      supplier: 3,
    };

    return [...ids]
      .map((id) => {
        const current = currentRows.get(id);
        const plan = planRows.get(id);
        const source = current ?? plan;

        if (!source) {
          return this.emptyPlanFactRow(id, 'supplier', null, id);
        }

        const currentRevenue = current?.revenue ?? 0;
        const planRevenue = plan?.revenue ?? 0;
        const currentGrossProfit = current?.grossProfit ?? 0;
        const planGrossProfit = plan?.grossProfit ?? 0;
        const currentQuantity = current?.quantity ?? 0;
        const planQuantity = plan?.quantity ?? 0;

        return {
          id,
          level: source.level,
          parentId: source.parentId,
          name: source.name,
          currentRevenue: this.round(currentRevenue),
          planRevenue: this.round(planRevenue),
          revenueDelta: this.round(currentRevenue - planRevenue),
          revenueCompletionPercent: this.completionPercent(
            currentRevenue,
            planRevenue,
          ),
          currentGrossProfit: this.round(currentGrossProfit),
          planGrossProfit: this.round(planGrossProfit),
          grossProfitDelta: this.round(currentGrossProfit - planGrossProfit),
          grossProfitCompletionPercent: this.completionPercent(
            currentGrossProfit,
            planGrossProfit,
          ),
          currentQuantity: this.round(currentQuantity),
          planQuantity: this.round(planQuantity),
          quantityDelta: this.round(currentQuantity - planQuantity),
          quantityCompletionPercent: this.completionPercent(
            currentQuantity,
            planQuantity,
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

  private emptyPlanFactRow(
    id: string,
    level: PlanFactGroupLevel,
    parentId: string | null,
    name: string,
  ): PlanFactReportRow {
    return {
      id,
      level,
      parentId,
      name,
      currentRevenue: 0,
      planRevenue: 0,
      revenueDelta: 0,
      revenueCompletionPercent: 0,
      currentGrossProfit: 0,
      planGrossProfit: 0,
      grossProfitDelta: 0,
      grossProfitCompletionPercent: 0,
      currentQuantity: 0,
      planQuantity: 0,
      quantityDelta: 0,
      quantityCompletionPercent: 0,
    };
  }

  private lflPercent(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }

    return this.round(((current - previous) / previous) * 100);
  }

  private completionPercent(current: number, plan: number) {
    if (plan === 0) {
      return current === 0 ? 0 : null;
    }

    return this.round((current / plan) * 100);
  }

  private topProblemCategory(categories: Map<string, number>) {
    const [top] = [...categories.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'),
    );

    return top?.[0] ?? null;
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

      const unitValue = this.stockUnitValue(snapshot.product);

      seen.add(snapshotKey);
      stockByStoreProduct.set(snapshotKey, {
        productId: snapshot.productId,
        storeId: snapshot.storeId,
        storeName: snapshot.store.name,
        article: snapshot.product.article,
        name: snapshot.product.name,
        isCanonical: Boolean(snapshot.product.canonicalProduct),
        canonicalProductName: snapshot.product.canonicalProduct?.name ?? null,
        categoryId: snapshot.product.categoryId ?? null,
        categoryName: snapshot.product.category?.name ?? null,
        supplierId: snapshot.product.supplierId ?? null,
        supplierName: snapshot.product.supplier?.name ?? null,
        stockQuantity: snapshot.quantity.toNumber(),
        unitCost: unitValue.amount,
        unitValueSource: unitValue.source,
      });
    });

    return stockByStoreProduct;
  }

  private stockUnitValue(product: {
    purchasePrice?: { toNumber: () => number };
    salePrice?: { toNumber: () => number };
  }) {
    const purchasePrice = product.purchasePrice?.toNumber() ?? 0;

    if (purchasePrice > 0) {
      return { amount: purchasePrice, source: 'PURCHASE_PRICE' as const };
    }

    const salePrice = product.salePrice?.toNumber() ?? 0;

    if (salePrice > 0) {
      return { amount: salePrice, source: 'SALE_PRICE' as const };
    }

    return { amount: 0, source: 'UNKNOWN' as const };
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
          categoryName: sale.categoryName ?? stockItem?.categoryName ?? null,
          supplierId: sale.supplierId ?? stockItem?.supplierId ?? null,
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
        category?: { name: string } | null;
        supplierId?: string | null;
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
        categoryName: fact.product.category?.name ?? null,
        supplierId: fact.product.supplierId ?? null,
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
        category?: { name: string } | null;
        supplierId?: string | null;
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
        categoryName: fact.product.category?.name ?? null,
        supplierId: fact.product.supplierId ?? null,
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
    historicalUnitRevenueByStoreProduct: Map<string, number>,
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
        const key = `${item.storeId}:${item.productId}`;
        const historicalUnitRevenue =
          historicalUnitRevenueByStoreProduct.get(key) ?? 0;
        const unitValue =
          item.unitCost > 0 ? item.unitCost : historicalUnitRevenue;
        const frozenStockValuation =
          item.unitCost > 0
            ? item.unitValueSource
            : historicalUnitRevenue > 0
              ? 'HISTORICAL_REVENUE'
              : 'UNKNOWN';
        const stockQuantity = this.round(item.stockQuantity);
        const frozenStockUnitValue = this.round(unitValue);

        return {
          productId: item.productId,
          storeId: item.storeId,
          storeName: item.storeName,
          article: item.article,
          name: item.name,
          isCanonical: item.isCanonical,
          canonicalProductName: item.canonicalProductName,
          stockQuantity,
          frozenStockUnitValue,
          frozenStockValuation,
          frozenStockAmount: this.round(stockQuantity * frozenStockUnitValue),
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

  private inventoryTurnoverRows(
    stockByStoreProduct: Map<string, StockByStoreProductItem>,
    productSales: Map<string, ProductSales>,
    lastSaleByStoreProduct: Map<string, Date>,
    historicalUnitRevenueByStoreProduct: Map<string, number>,
    periodDays: number,
    periodToDate: Date,
  ): InventoryTurnoverRow[] {
    const statusRank: Record<InventoryTurnoverStatus, number> = {
      FROZEN: 0,
      SLOW: 1,
      OK: 2,
    };

    return [...stockByStoreProduct.values()]
      .filter((item) => this.round(item.stockQuantity) > 0)
      .map((item) => {
        const key = `${item.storeId}:${item.productId}`;
        const sale = productSales.get(key);
        const soldQuantity = this.round(sale?.quantity ?? 0);
        const revenue = this.round(sale?.revenue ?? 0);
        const grossProfit = this.round(
          (sale?.revenue ?? 0) - (sale?.cost ?? 0),
        );
        const stockQuantity = this.round(item.stockQuantity);
        const averageDailySales = this.round(soldQuantity / periodDays);
        const stockDays =
          averageDailySales > 0
            ? this.round(stockQuantity / averageDailySales)
            : null;
        const turnoverRate =
          stockQuantity > 0 ? this.round(soldQuantity / stockQuantity) : 0;
        const historicalUnitRevenue =
          historicalUnitRevenueByStoreProduct.get(key) ?? 0;
        const unitValue =
          item.unitCost > 0 ? item.unitCost : historicalUnitRevenue;
        const frozenStockValuation =
          item.unitCost > 0
            ? item.unitValueSource
            : historicalUnitRevenue > 0
              ? 'HISTORICAL_REVENUE'
              : 'UNKNOWN';
        const frozenStockUnitValue = this.round(unitValue);
        const lastSaleDate = lastSaleByStoreProduct.get(key) ?? null;
        const status: InventoryTurnoverStatus =
          soldQuantity <= 0
            ? 'FROZEN'
            : stockDays !== null && stockDays >= 30
              ? 'SLOW'
              : 'OK';

        return {
          productId: item.productId,
          storeId: item.storeId,
          storeName: item.storeName,
          article: item.article,
          name: item.name,
          isCanonical: item.isCanonical,
          canonicalProductName: item.canonicalProductName,
          categoryName: item.categoryName,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          stockQuantity,
          soldQuantity,
          revenue,
          grossProfit,
          averageDailySales,
          stockDays,
          turnoverRate,
          frozenStockUnitValue,
          frozenStockValuation,
          frozenStockAmount: this.round(stockQuantity * frozenStockUnitValue),
          lastSaleDate: lastSaleDate
            ? this.toDateInputValue(lastSaleDate)
            : null,
          daysWithoutSales: lastSaleDate
            ? this.daysBetween(lastSaleDate, periodToDate)
            : null,
          status,
        };
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          b.frozenStockAmount - a.frozenStockAmount ||
          a.storeName.localeCompare(b.storeName, 'ru') ||
          a.name.localeCompare(b.name, 'ru'),
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

  private unitRevenueByStoreProduct(
    salesFacts: {
      storeId: string;
      productId: string;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
    }[],
  ) {
    const revenueByStoreProduct = new Map<
      string,
      { quantity: number; revenue: number }
    >();

    salesFacts.forEach((fact) => {
      const key = `${fact.storeId}:${fact.productId}`;
      const current = revenueByStoreProduct.get(key) ?? {
        quantity: 0,
        revenue: 0,
      };

      current.quantity += fact.quantity.toNumber();
      current.revenue += fact.revenue.toNumber();
      revenueByStoreProduct.set(key, current);
    });

    return new Map(
      [...revenueByStoreProduct.entries()]
        .filter(([, value]) => value.quantity > 0 && value.revenue > 0)
        .map(([key, value]) => [key, value.revenue / value.quantity]),
    );
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

  private async applyRecommendationWorkflowState(
    tenantId: string,
    recommendations: ReportRecommendation[],
  ): Promise<ReportRecommendation[]> {
    if (recommendations.length === 0) {
      return recommendations;
    }

    const now = new Date();
    const recommendationKeys = recommendations.map((item) => item.id);
    const existingStates = await this.prisma.recommendationState.findMany({
      where: {
        tenantId,
        recommendationKey: { in: recommendationKeys },
      },
    });
    const existingByKey = new Map(
      existingStates.map((state) => [state.recommendationKey, state]),
    );
    const states = await Promise.all(
      recommendations.map((recommendation) => {
        const existing = existingByKey.get(recommendation.id);

        const shouldReappear = existing
          ? this.shouldMarkRecommendationReappeared(existing, now)
          : false;

        return this.prisma.recommendationState.upsert({
          where: {
            tenantId_recommendationKey: {
              tenantId,
              recommendationKey: recommendation.id,
            },
          },
          create: {
            tenantId,
            recommendationKey: recommendation.id,
            role: recommendation.role,
            status: RecommendationStatus.NEW,
            firstSeenAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
          },
          update: {
            lastSeenAt: now,
            ...(shouldReappear
              ? {
                  status: RecommendationStatus.REAPPEARED,
                  statusChangedAt: now,
                  resolvedAt: null,
                }
              : {}),
          },
        });
      }),
    );
    const statesByKey = new Map(
      states.map((state) => [state.recommendationKey, state]),
    );

    return recommendations.map((recommendation) => {
      const state = statesByKey.get(recommendation.id);

      if (!state) {
        return recommendation;
      }

      return {
        ...recommendation,
        role: state.role,
        status: state.status,
        statusNote: state.note,
        statusChangedAt: state.statusChangedAt.toISOString(),
      };
    });
  }

  private shouldMarkRecommendationReappeared(
    state: {
      status: RecommendationStatus;
      resolvedAt: Date | null;
      lastSeenAt: Date;
    },
    now: Date,
  ) {
    return (
      this.isTerminalRecommendationStatus(state.status) &&
      state.resolvedAt !== null &&
      state.lastSeenAt.getTime() < state.resolvedAt.getTime() &&
      now.getTime() - state.resolvedAt.getTime() >= REAPPEARED_AFTER_MS
    );
  }

  private parseRecommendationStatus(value: RecommendationStatus | undefined) {
    if (!value || !Object.values(RecommendationStatus).includes(value)) {
      throw new BadRequestException('Invalid recommendation status');
    }

    return value;
  }

  private parseRecommendationRole(value: RecommendationRole) {
    if (!Object.values(RecommendationRole).includes(value)) {
      throw new BadRequestException('Invalid recommendation role');
    }

    return value;
  }

  private isTerminalRecommendationStatus(status: RecommendationStatus) {
    return (
      status === RecommendationStatus.DONE ||
      status === RecommendationStatus.REJECTED ||
      status === RecommendationStatus.HIDDEN
    );
  }

  private serializeRecommendationState(state: {
    recommendationKey: string;
    role: RecommendationRole;
    status: RecommendationStatus;
    note: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    statusChangedAt: Date;
    resolvedAt: Date | null;
  }) {
    return {
      recommendationKey: state.recommendationKey,
      role: state.role,
      status: state.status,
      note: state.note,
      firstSeenAt: state.firstSeenAt.toISOString(),
      lastSeenAt: state.lastSeenAt.toISOString(),
      statusChangedAt: state.statusChangedAt.toISOString(),
      resolvedAt: state.resolvedAt?.toISOString() ?? null,
    };
  }

  private marginUpliftAmount(sale: ProductSales) {
    return this.round(
      Math.max(0, sale.revenue * 0.2 - (sale.revenue - sale.cost)),
    );
  }

  private buildRecommendations(
    productSales: Map<string, ProductSales>,
    outOfStockRiskProducts: OutOfStockRiskProduct[],
    productsWithoutSales: ProductWithoutSales[],
  ): ReportRecommendation[] {
    const recommendations: ReportRecommendation[] = [
      ...outOfStockRiskProducts.flatMap((product) => {
        if (product.stockDays === null) {
          return [];
        }
        const effectAmount =
          product.grossProfitAtRiskForPeriod ??
          product.revenueAtRiskPerDay ??
          0;
        const effectLabel =
          product.grossProfitAtRiskForPeriod === null
            ? 'Выручка под угрозой'
            : 'Прибыль в риске';
        return [
          {
            id: `stock:${product.storeId}:${product.productId}`,
            kind: 'REPLENISH_STOCK' as const,
            severity:
              product.stockDays <= 1 ? ('HIGH' as const) : ('MEDIUM' as const),
            role: RecommendationRole.BUYER,
            status: RecommendationStatus.NEW,
            statusNote: null,
            statusChangedAt: null,
            effectType: 'PROFIT_PROTECTION' as const,
            effectLabel,
            effectAmount: this.round(effectAmount),
            effectUnit: 'RUB' as const,
            effectDescription:
              product.grossProfitAtRiskForPeriod === null
                ? `Если не пополнить запас, выручка под угрозой составит ${this.round(effectAmount)} руб. в день.`
                : `Если не пополнить запас, валовая прибыль в риске за период составит ${this.round(effectAmount)} руб.`,
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
          },
        ];
      }),
      ...productsWithoutSales.flatMap((product) => {
        if (product.stockQuantity <= 0 || product.frozenStockAmount === null) {
          return [];
        }
        return [
          {
            id: `no-sales:${product.storeId}:${product.productId}`,
            kind: 'NO_SALES' as const,
            severity: 'LOW' as const,
            role: RecommendationRole.CLUB_MANAGER,
            status: RecommendationStatus.NEW,
            statusNote: null,
            statusChangedAt: null,
            effectType: 'STOCK_RELEASE' as const,
            effectLabel: 'Деньги в остатке',
            effectAmount: this.round(product.frozenStockAmount),
            effectUnit: 'RUB' as const,
            effectDescription: `В товаре без продаж заморожено ${this.round(product.frozenStockAmount)} руб.`,
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
          },
        ];
      }),
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
          role: RecommendationRole.COMMERCIAL_DIRECTOR,
          status: RecommendationStatus.NEW,
          statusNote: null,
          statusChangedAt: null,
          effectType: 'MARGIN_UPLIFT' as const,
          effectLabel: 'Потенциал маржи',
          effectAmount: this.marginUpliftAmount(item.sale),
          effectUnit: 'RUB' as const,
          effectDescription: `Потенциал до 20% маржи: ${this.marginUpliftAmount(item.sale)} руб.`,
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

  private groupAssortmentMatrixProducts(products: MatrixProduct[]) {
    const groups = new Map<
      string,
      MatrixProduct & {
        productIds: string[];
        externalDomains: Set<string>;
      }
    >();

    products.forEach((product) => {
      const key = product.canonicalProductId ?? product.id;
      const current = groups.get(key);

      if (!current) {
        groups.set(key, {
          ...product,
          productIds: [product.id],
          externalDomains: product.externalDomain
            ? new Set([product.externalDomain])
            : new Set<string>(),
        });
        return;
      }

      current.productIds.push(product.id);

      if (product.externalDomain) {
        current.externalDomains.add(product.externalDomain);
      }

      if (
        this.assortmentRolePriority(product.assortmentRole) <
        this.assortmentRolePriority(current.assortmentRole)
      ) {
        current.assortmentRole = product.assortmentRole;
      }

      current.isMandatory = current.isMandatory || product.isMandatory;
      current.article = current.article || product.article;
      current.categoryId = current.categoryId ?? product.categoryId;
      current.categoryName = current.categoryName ?? product.categoryName;
      current.supplierId = current.supplierId ?? product.supplierId;
      current.supplierName = current.supplierName ?? product.supplierName;
    });

    return groups;
  }

  private latestMatrixStockByStoreProduct(
    snapshots: {
      storeId: string;
      productId: string;
      snapshotDate: Date;
      quantity: { toNumber: () => number };
    }[],
  ) {
    const seen = new Set<string>();
    const stockByStoreProduct = new Map<string, number>();

    snapshots.forEach((snapshot) => {
      const key = `${snapshot.storeId}:${snapshot.productId}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      stockByStoreProduct.set(key, snapshot.quantity.toNumber());
    });

    return stockByStoreProduct;
  }

  private matrixSalesByStoreProduct(
    salesFacts: {
      storeId: string;
      productId: string;
      quantity: { toNumber: () => number };
      revenue: { toNumber: () => number };
      cost: { toNumber: () => number };
    }[],
  ) {
    const salesByStoreProduct = new Map<string, MatrixSales>();

    salesFacts.forEach((fact) => {
      const key = `${fact.storeId}:${fact.productId}`;
      const current = salesByStoreProduct.get(key) ?? {
        soldQuantity: 0,
        revenue: 0,
        cost: 0,
      };

      current.soldQuantity += fact.quantity.toNumber();
      current.revenue += fact.revenue.toNumber();
      current.cost += fact.cost.toNumber();
      salesByStoreProduct.set(key, current);
    });

    return salesByStoreProduct;
  }

  private assortmentMatrixStatus(input: {
    assortmentRole: ProductAssortmentRole;
    existsInStore: boolean;
    inStock: boolean;
    isSold: boolean;
    noSales: boolean;
    needsReplenishment: boolean;
  }): AssortmentMatrixStatus {
    if (input.assortmentRole === ProductAssortmentRole.EXCLUDED) {
      return 'EXCLUDED';
    }

    if (!input.existsInStore) {
      return 'MISSING';
    }

    if (input.needsReplenishment) {
      return 'NEEDS_REPLENISHMENT';
    }

    if (input.inStock && input.isSold) {
      return 'SOLD';
    }

    if (input.noSales) {
      return 'NO_SALES';
    }

    if (input.inStock) {
      return 'IN_STOCK';
    }

    return 'NO_STOCK';
  }

  private assortmentMatrixQuality(input: {
    assortmentRole: ProductAssortmentRole;
    isMandatory: boolean;
    status: AssortmentMatrixStatus;
  }) {
    const maxPoints =
      input.isMandatory &&
      input.assortmentRole !== ProductAssortmentRole.EXCLUDED
        ? 1
        : 0;

    if (maxPoints === 0) {
      return { points: 0, maxPoints };
    }

    if (input.status === 'SOLD' || input.status === 'IN_STOCK') {
      return { points: 1, maxPoints };
    }

    if (input.status === 'NO_SALES') {
      return { points: 0.6, maxPoints };
    }

    if (input.status === 'NEEDS_REPLENISHMENT') {
      return { points: 0.5, maxPoints };
    }

    return { points: 0, maxPoints };
  }

  private assortmentMatrixSummary(
    rows: AssortmentMatrixRow[],
  ): AssortmentMatrixSummary {
    const mandatoryRows = rows.filter((row) => row.qualityMaxPoints > 0);
    const points = mandatoryRows.reduce(
      (sum, row) => sum + row.qualityPoints,
      0,
    );

    return {
      mandatoryCells: mandatoryRows.length,
      healthyCells: mandatoryRows.filter((row) => row.qualityPoints >= 1)
        .length,
      missingCells: mandatoryRows.filter((row) => row.status === 'MISSING')
        .length,
      noStockCells: mandatoryRows.filter((row) => row.status === 'NO_STOCK')
        .length,
      noSalesCells: mandatoryRows.filter((row) => row.status === 'NO_SALES')
        .length,
      replenishmentCells: mandatoryRows.filter(
        (row) => row.status === 'NEEDS_REPLENISHMENT',
      ).length,
      optionalCells: rows.length - mandatoryRows.length,
      qualityIndex:
        mandatoryRows.length > 0
          ? this.round((points / mandatoryRows.length) * 100)
          : null,
    };
  }

  private assortmentMatrixQualityRows(
    rows: AssortmentMatrixRow[],
    level: AssortmentQualityLevel,
    getId: (row: AssortmentMatrixRow) => string,
    getName: (row: AssortmentMatrixRow) => string,
  ): AssortmentQualityRow[] {
    const groups = new Map<string, AssortmentMatrixRow[]>();

    rows.forEach((row) => {
      const key = getId(row);
      const groupRows = groups.get(key) ?? [];
      groupRows.push(row);
      groups.set(key, groupRows);
    });

    return [...groups.entries()]
      .map(([id, groupRows]) => ({
        id,
        level,
        name: getName(groupRows[0]),
        ...this.assortmentMatrixSummary(groupRows),
      }))
      .sort(
        (a, b) =>
          (a.qualityIndex ?? -1) - (b.qualityIndex ?? -1) ||
          a.name.localeCompare(b.name, 'ru'),
      );
  }

  private assortmentMatrixStatusRank(status: AssortmentMatrixStatus) {
    const rank: Record<AssortmentMatrixStatus, number> = {
      MISSING: 0,
      NO_STOCK: 1,
      NEEDS_REPLENISHMENT: 2,
      NO_SALES: 3,
      IN_STOCK: 4,
      SOLD: 5,
      EXCLUDED: 6,
    };

    return rank[status];
  }

  private assortmentRolePriority(role: ProductAssortmentRole) {
    const rank: Record<ProductAssortmentRole, number> = {
      CORE: 0,
      TRAFFIC_DRIVER: 1,
      MARGIN_DRIVER: 2,
      IMPULSE: 3,
      SEASONAL: 4,
      TEST: 5,
      SERVICE: 6,
      OPTIONAL: 7,
      EXCLUDED: 8,
    };

    return rank[role];
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

  private resolveRequestedStoreIds(
    query: OperationalReportQuery,
  ): readonly string[] | undefined {
    const raw = query.storeIds ?? query.storeId;
    if (raw === undefined) return undefined;
    const values = Array.isArray(raw) ? raw : raw.split(',');
    return values.map((value) => value.trim());
  }

  private resolveRequestedCategoryIds(
    query: OperationalReportQuery,
  ): readonly string[] | undefined {
    const raw = query.categoryIds ?? query.categoryId;
    if (raw === undefined) return undefined;
    const values = Array.isArray(raw) ? raw : raw.split(',');
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private resolveNoSalesDays(value: OperationalReportQuery['noSalesDays']) {
    if (value === undefined) return 21 as AssortmentNoSalesWindow;
    const days = Number(value);
    if (days === 7 || days === 14 || days === 21 || days === 30) {
      return days;
    }
    throw new BadRequestException('noSalesDays must be 7, 14, 21 or 30');
  }

  private operationalAssortmentRows(
    rows: AssortmentHealthRow[],
    stockStatus: OperationalReportQuery['stockStatus'],
    noSalesDays: AssortmentNoSalesWindow,
  ) {
    const allowedRisks: ReadonlySet<string> = stockStatus
      ? new Set([stockStatus])
      : new Set(['OUT_OF_STOCK', 'LOW_STOCK'] as const);
    return {
      outOfStock: rows.filter((row) => allowedRisks.has(row.risk)),
      noSales: rows.filter((row) => row.noSales?.[noSalesDays] === true),
      writeOffs: rows.filter(
        (row) =>
          row.writeOffQuantity?.value !== null ||
          row.writeOffAmount?.value !== null,
      ),
    };
  }

  private toOutOfStockRiskProducts(
    rows: AssortmentHealthRow[],
    loaded: AssortmentHealthLoaderResult,
  ): OutOfStockRiskProduct[] {
    return rows.flatMap((row) => {
      const product = loaded.productsById.get(row.productId);
      const store = loaded.storesById.get(row.storeId);
      if (!product || !store || row.inventory.value === null) return [];
      const salePrice = row.price.value;
      const demand = row.demand21d.value;
      if (demand === null) return [];
      const revenueAtRiskPerDay =
        salePrice === null || demand === null
          ? null
          : this.round(salePrice * demand);
      return [
        {
          productId: product.id,
          storeId: store.id,
          storeName: store.name,
          article: product.article,
          name: product.name,
          isCanonical: false,
          canonicalProductName: null,
          categoryName: product.categoryName,
          supplierId: null,
          supplierName: product.supplierName,
          stockQuantity: this.round(row.inventory.value),
          averageDailySales: this.round(demand),
          revenueAtRiskPerDay,
          grossProfitAtRiskPerDay: null,
          grossProfitAtRiskForPeriod: null,
          stockDays: row.turnoverDays.value,
          state: row.risk,
          reason:
            row.price.reason ?? row.demand21d.reason ?? row.inventory.reason,
        },
      ];
    });
  }

  private toProductsWithoutSales(
    rows: AssortmentHealthRow[],
    loaded: AssortmentHealthLoaderResult,
  ): ProductWithoutSales[] {
    return rows.flatMap((row) => {
      const product = loaded.productsById.get(row.productId);
      const store = loaded.storesById.get(row.storeId);
      if (!product || !store || row.inventory.value === null) return [];
      const frozenStockAmount = row.frozenValue.value;
      return [
        {
          productId: product.id,
          storeId: store.id,
          storeName: store.name,
          article: product.article,
          name: product.name,
          isCanonical: false,
          canonicalProductName: null,
          stockQuantity: this.round(row.inventory.value),
          frozenStockUnitValue:
            frozenStockAmount === null || row.inventory.value <= 0
              ? null
              : this.round(frozenStockAmount / row.inventory.value),
          frozenStockValuation: row.frozenValue.basis,
          frozenStockAmount,
          lastSaleDate: null,
          daysWithoutSales: null,
          categoryName: product.categoryName,
          supplierName: product.supplierName,
          state: row.risk,
          reason: row.frozenValue.reason ?? row.inventory.reason,
        },
      ];
    });
  }

  private turnoverAssortmentRows(
    rows: AssortmentHealthRow[],
    excess: OperationalReportQuery['excess'],
  ) {
    const wantsExcess = excess === true || excess === 'true';
    return rows.filter(
      (row) =>
        (row.turnoverDays.value !== null || row.noSales?.[21] === true) &&
        (!wantsExcess || (row.excessQuantity.value ?? 0) > 0),
    );
  }

  private toInventoryTurnoverRows(
    rows: AssortmentHealthRow[],
    loaded: AssortmentHealthLoaderResult,
  ): InventoryTurnoverRow[] {
    const statusRank: Record<InventoryTurnoverStatus, number> = {
      FROZEN: 0,
      SLOW: 1,
      OK: 2,
    };

    return rows
      .flatMap((row) => {
        const product = loaded.productsById.get(row.productId);
        const store = loaded.storesById.get(row.storeId);
        const stockQuantity = row.inventory.value;
        if (
          !product ||
          !store ||
          stockQuantity === null ||
          stockQuantity <= 0
        ) {
          return [];
        }
        const averageDailySales = row.demand21d.value ?? 0;
        const frozenStockAmount = row.frozenValue.value;
        const frozenStockUnitValue =
          frozenStockAmount === null
            ? null
            : this.round(frozenStockAmount / stockQuantity);
        const status: InventoryTurnoverStatus =
          averageDailySales <= 0
            ? 'FROZEN'
            : (row.turnoverDays.value ?? 0) >= 30
              ? 'SLOW'
              : 'OK';
        return [
          {
            productId: product.id,
            storeId: store.id,
            storeName: store.name,
            article: product.article,
            name: product.name,
            isCanonical: false,
            canonicalProductName: null,
            categoryName: product.categoryName,
            supplierId: null,
            supplierName: product.supplierName,
            stockQuantity: this.round(stockQuantity),
            soldQuantity: this.round(averageDailySales * 21),
            revenue: 0,
            grossProfit: 0,
            averageDailySales: this.round(averageDailySales),
            stockDays: row.turnoverDays.value,
            turnoverRate:
              stockQuantity > 0
                ? this.round((averageDailySales * 21) / stockQuantity)
                : 0,
            frozenStockUnitValue,
            frozenStockValuation: row.frozenValue.basis,
            frozenStockAmount,
            lastSaleDate: null,
            daysWithoutSales: null,
            status,
          },
        ];
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          (b.frozenStockAmount ?? -Infinity) -
            (a.frozenStockAmount ?? -Infinity) ||
          a.storeName.localeCompare(b.storeName, 'ru') ||
          a.name.localeCompare(b.name, 'ru'),
      );
  }

  private toWriteOffMovements(
    loaded: AssortmentHealthLoaderResult,
    period: { fromDate: Date; toDate: Date },
    asOf: Date,
  ): WriteOffMovementRow[] {
    const reportTo = period.toDate > asOf ? asOf : period.toDate;
    const eligibleGrains = new Set(
      loaded.health.rows
        .filter(
          (row) =>
            !row.excluded &&
            ((row.writeOffQuantity?.value ?? null) !== null ||
              (row.writeOffAmount?.value ?? null) !== null),
        )
        .map((row) => `${row.storeId}:${row.productId}`),
    );

    return (loaded.writeOffMovements ?? []).flatMap((movement) => {
      if (
        !eligibleGrains.has(`${movement.storeId}:${movement.productId}`) ||
        movement.movementDate < period.fromDate ||
        movement.movementDate > reportTo
      ) {
        return [];
      }
      const product = loaded.productsById.get(movement.productId);
      const store = loaded.storesById.get(movement.storeId);
      if (!product || !store) return [];
      return [
        {
          id: movement.id,
          movementDate: movement.movementDate.toISOString(),
          storeId: store.id,
          storeName: store.name,
          productId: product.id,
          article: product.article,
          productName: product.name,
          categoryName: product.categoryName,
          quantity: movement.quantity,
          amount: movement.amount,
        },
      ];
    });
  }

  private toReplenishmentRows(loaded: AssortmentHealthLoaderResult): {
    rows: ReplenishmentRow[];
    coverage: ReplenishmentCoverage;
  } {
    const policyRows = loaded.health.rows.filter((row) => !row.excluded);
    const sourceRows = policyRows.filter(
      (row) =>
        row.inventory.state === 'AVAILABLE' &&
        row.inventory.value !== null &&
        row.demand21d.state === 'AVAILABLE' &&
        row.demand21d.value !== null,
    );
    const rows = sourceRows.flatMap((row) => {
      const product = loaded.productsById.get(row.productId);
      const store = loaded.storesById.get(row.storeId);
      const stockQuantity = row.inventory.value;
      const averageDailySales = row.demand21d.value;
      if (
        !product ||
        !store ||
        stockQuantity === null ||
        averageDailySales === null
      ) {
        return [];
      }
      const dailyNeed = this.round(
        Math.max(0, averageDailySales * 7 - stockQuantity),
      );
      return [
        {
          productId: product.id,
          storeId: store.id,
          storeName: store.name,
          article: product.article,
          name: product.name,
          isCanonical: false,
          canonicalProductName: null,
          categoryName: product.categoryName,
          supplierName: product.supplierName,
          stockQuantity: this.round(stockQuantity),
          soldQuantity: this.round(averageDailySales * DEMAND_PERIOD_DAYS),
          averageDailySales: this.round(averageDailySales),
          stockDays: row.turnoverDays.value,
          dailyNeed,
          recommendedOrder: row.recommendedOrderQuantity ?? 0,
          orderMultiplicity: product.orderMultiplicity,
          risk: this.replenishmentRiskFromAssortmentRow(row),
        },
      ];
    });
    const covered = rows.length;
    const state: AssortmentMetricState =
      policyRows.length === 0 || covered === 0
        ? this.replenishmentCoverageState(policyRows)
        : covered === policyRows.length
          ? 'AVAILABLE'
          : 'PARTIAL';
    const excludedReasons = policyRows
      .filter((row) => !sourceRows.includes(row))
      .map((row) => row.inventory.reason ?? row.demand21d.reason)
      .filter((reason): reason is string => Boolean(reason));

    return {
      rows,
      coverage: {
        state,
        reason:
          state === 'AVAILABLE'
            ? null
            : (excludedReasons[0] ??
              'Не все позиции имеют свежий остаток и подтвержденный спрос.'),
        covered,
        total: policyRows.length,
        percent:
          policyRows.length === 0
            ? null
            : this.round((covered / policyRows.length) * 100),
      },
    };
  }

  private replenishmentCoverageState(
    rows: AssortmentHealthRow[],
  ): AssortmentMetricState {
    if (rows.length === 0) return 'MISSING';
    if (rows.some((row) => row.inventory.state === 'STALE')) return 'STALE';
    if (rows.some((row) => row.demand21d.state === 'FAILED')) return 'FAILED';
    if (rows.some((row) => row.demand21d.state === 'STALE')) return 'STALE';
    if (rows.some((row) => row.demand21d.state === 'PARTIAL')) {
      return 'PARTIAL';
    }
    if (rows.some((row) => row.inventory.state === 'MISSING')) return 'MISSING';
    return 'UNKNOWN';
  }

  private replenishmentRiskFromAssortmentRow(
    row: AssortmentHealthRow,
  ): ReplenishmentRisk {
    if (row.risk === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
    if (row.risk === 'LOW_STOCK') return 'LOW_STOCK';
    if (row.risk === 'NO_DEMAND') return 'NO_SALES';
    return 'OK';
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

  private resolvePreviousPlanPeriod(period: { fromDate: Date; toDate: Date }) {
    const periodDays = this.periodDays(period.fromDate, period.toDate);
    const toDate = new Date(period.fromDate);
    toDate.setUTCDate(toDate.getUTCDate() - 1);
    toDate.setUTCHours(23, 59, 59, 999);
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (periodDays - 1));
    fromDate.setUTCHours(0, 0, 0, 0);

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

  private buildMarginCoverage(
    rows: Array<{ revenue: number; cost: number }>,
  ): ReportMarginCoverage {
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
