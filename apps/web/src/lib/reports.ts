import { getApiUrl, getAuthHeaders } from "./api";

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

export type OperationalReportFilters = {
  from?: string;
  to?: string;
  storeId?: string;
};

export type ProductOosExclusionType = "SERVICE" | "OOS_EXCLUDED";

export type ProductOosExclusion = {
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
  lastSaleDate: string | null;
  daysWithoutSales: number | null;
  categoryName: string | null;
  supplierName: string | null;
};

export type ReportRecommendation = {
  id: string;
  kind: "REPLENISH_STOCK" | "NO_SALES" | "LOW_MARGIN";
  severity: "HIGH" | "MEDIUM" | "LOW";
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

export type AbcGroup = "A" | "B" | "C";

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
  | "OUT_OF_STOCK"
  | "LOW_STOCK"
  | "OK"
  | "NO_SALES";

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

export type LflPeriod = "day" | "week" | "month";
export type LflGroupLevel = "network" | "store" | "category" | "product";

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

export async function getAssortmentReport(): Promise<AssortmentReport> {
  const response = await fetch(`${getApiUrl()}/reports/assortment`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch assortment report");
  }

  return response.json() as Promise<AssortmentReport>;
}

export async function getOperationalReport(
  filters: OperationalReportFilters,
): Promise<OperationalReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/operations${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch operational report");
  }

  return response.json() as Promise<OperationalReport>;
}

export async function getSalesDetailReport(
  filters: OperationalReportFilters,
): Promise<SalesDetailReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/sales-detail${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch sales detail report");
  }

  return response.json() as Promise<SalesDetailReport>;
}

export async function getSkuPerformanceReport(
  filters: OperationalReportFilters,
): Promise<SkuPerformanceReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/sku-performance${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch SKU performance report");
  }

  return response.json() as Promise<SkuPerformanceReport>;
}

export async function getSuppliersPerformanceReport(
  filters: OperationalReportFilters,
): Promise<SuppliersPerformanceReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/suppliers-performance${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch suppliers performance report");
  }

  return response.json() as Promise<SuppliersPerformanceReport>;
}

export async function getReplenishmentReport(
  filters: OperationalReportFilters,
): Promise<ReplenishmentReport> {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/replenishment${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch replenishment report");
  }

  return response.json() as Promise<ReplenishmentReport>;
}

export async function getNewProductsReport(
  filters: Pick<OperationalReportFilters, "storeId"> = {},
): Promise<NewProductsReport> {
  const params = new URLSearchParams();

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const query = params.toString();
  const response = await fetch(`${getApiUrl()}/reports/new-products${query ? `?${query}` : ""}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch new products report");
  }

  return response.json() as Promise<NewProductsReport>;
}

export async function getLflReport(
  period: LflPeriod,
): Promise<LflReport> {
  const params = new URLSearchParams({ period });
  const response = await fetch(`${getApiUrl()}/reports/lfl?${params}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch LFL report");
  }

  return response.json() as Promise<LflReport>;
}

export async function getOosExclusions(): Promise<ProductOosExclusion[]> {
  const response = await fetch(`${getApiUrl()}/reports/oos-exclusions`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch OOS exclusions");
  }

  return response.json() as Promise<ProductOosExclusion[]>;
}
