import { getApiUrl, getAuthHeaders } from "./api";

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

export type DashboardSummaryFilters = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds?: string[];
  skuGrouping?: "club" | "network";
};

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  periodLabel: string;
  skuGrouping: "club" | "network";
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
  categoryAnalytics: DashboardCategoryMetric[];
  topSkuByRevenue: DashboardTopSku[];
};

export async function getDashboardSummary(
  filters: DashboardSummaryFilters = {},
): Promise<DashboardSummary> {
  const params = new URLSearchParams();

  if (filters.period) {
    params.set("period", filters.period);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  if (filters.skuGrouping) {
    params.set("skuGrouping", filters.skuGrouping);
  }

  filters.storeIds?.forEach((storeId) => {
    params.append("storeIds", storeId);
  });

  const query = params.toString();
  const response = await fetch(`${getApiUrl()}/dashboard/summary${query ? `?${query}` : ""}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch dashboard summary");
  }

  return response.json() as Promise<DashboardSummary>;
}
