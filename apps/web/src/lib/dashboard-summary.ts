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

export type DashboardStoreRevenueMetric = {
  storeId: string;
  storeName: string;
  totalRevenue: number;
  productRevenue: number;
  activeGuests: number;
  productRevenueSharePercent: number | null;
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
  clubRevenue: number;
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
  totals: Omit<DashboardRevenueDiagnosticsRow, "storeId" | "storeName" | "notes">;
  interpretation: {
    primaryRecommendation: string;
    mobileTopupRule: string;
    limitations: string[];
  };
};

export async function getDashboardSummary(
  filters: DashboardSummaryFilters = {},
): Promise<DashboardSummary> {
  return getDashboardResource("summary", filters, "summary");
}

export async function getDashboardRevenueDiagnostics(
  filters: DashboardSummaryFilters = {},
): Promise<DashboardRevenueDiagnostics> {
  return getDashboardResource(
    "revenue-diagnostics",
    filters,
    "revenue diagnostics",
  );
}

async function getDashboardResource<T>(
  resource: string,
  filters: DashboardSummaryFilters = {},
  errorLabel: string,
): Promise<T> {
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
  const response = await fetch(
    `${getApiUrl()}/dashboard/${resource}${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard ${errorLabel}`);
  }

  return response.json() as Promise<T>;
}
