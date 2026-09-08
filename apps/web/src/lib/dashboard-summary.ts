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
    | "READY"
    | "NO_DATA"
    | "PARTIAL_COVERAGE"
    | "SOURCE_UNAVAILABLE"
    | "SOURCE_CONFLICT"
    | "STALE";
  note: string | null;
};

export type DashboardAssortmentSourceHealth = {
  key: "visits" | "sales" | "inventory" | "costs" | "categories";
  label: string;
  state: "FRESH" | "STALE" | "MISSING" | "FAILED" | "PARTIAL";
  lastFactAt: string | null;
  lastImportedAt: string | null;
  coveragePercent: number | null;
  detail: string;
};

export type DashboardAssortmentAction = {
  key: string;
  priority: number;
  tone: "CRITICAL" | "WARNING" | "OPPORTUNITY" | "INFO";
  title: string;
  description: string;
  metric: string;
  impactRubles: number | null;
  href: string;
};

export type DashboardReceiptMetrics = {
  state: "READY" | "PARTIAL_COVERAGE" | "SOURCE_UNAVAILABLE" | "NO_DATA";
  requiredField: "RECEIPT_OR_ORDER_ID";
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
  state: "READY" | "NO_DATA" | "PARTIAL_COVERAGE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
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
  state: "READY" | "NO_DATA";
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
    visitUnit: "GAME_SESSION";
    saleUnit: "PRODUCT_SALE_OPERATION";
    saleUnitIsExact: true;
    receiptMetrics: DashboardReceiptMetrics;
  };
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
  totalRevenueSource:
    | "BALANCE_OPERATIONS"
    | "TRANSACTIONS"
    | "PRODUCTS"
    | "EMPTY";
  productRevenue: number;
  activeGuests: number;
  visitsCount: number;
  saleOperationCount: number;
  saleOperationsPer100Visits: number | null;
  productRevenueSharePercent: number | null;
};

export type DashboardRevenueBreakdown = {
  networkRevenue: number;
  allocatedClubRevenue: number;
  productRevenue: number;
  balanceOperationRevenue: number;
  transactionSpendRevenue: number;
  unallocatedTopupRevenue: number;
  shiftCashRevenue: number;
  primarySource:
    | "SNAPSHOT"
    | "BALANCE_OPERATIONS"
    | "TRANSACTIONS"
    | "PRODUCTS"
    | "EMPTY";
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
  status: "FRESH" | "STALE" | "MISSING" | "FAILED";
  generatedAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  networkRevenue: number | null;
  sourceCounts: Record<string, number>;
};

export type DashboardRevenueDataQuality = {
  level: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  notes: string[];
};

export type DashboardSummaryFilters = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds?: string[];
  categoryIds?: string[];
  skuGrouping?: "club" | "network";
};

export type DashboardSummary = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  periodLabel: string;
  skuGrouping: "club" | "network";
  selectedStoreIds: string[];
  selectedCategoryIds: string[];
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
  previousAdjustedGrossProfit: number;
  adjustedGrossProfitToPreviousPercent: number | null;
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
  assortmentGrowth: DashboardAssortmentGrowth;
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
  recommendation: "PRIMARY" | "CHECK" | "EXCLUDED";
};

export type DashboardRevenueDiagnosticsSourceMetric = {
  key: string;
  title: string;
  endpoint: string;
  amount: number | null;
  count: number | null;
  includedInNetworkRevenue: boolean;
  includedInClubRevenue: boolean;
  role: "PRIMARY" | "CONTROL" | "EXCLUDED";
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
    "storeId" | "storeName" | "notes"
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

  filters.categoryIds?.forEach((categoryId) => {
    params.append("categoryIds", categoryId);
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
