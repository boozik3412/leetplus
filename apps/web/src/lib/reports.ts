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
  kind: "REPLENISH_STOCK" | "NO_SALES" | "LOW_MARGIN";
  severity: "HIGH" | "MEDIUM" | "LOW";
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

export type AbcGroup = "A" | "B" | "C";

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
