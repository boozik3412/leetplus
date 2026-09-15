import { getApiUrl, getAuthHeaders } from "@/lib/api";
import type { DashboardAssortmentHealthSummary } from "@/lib/dashboard-summary";

export type ExecutiveMetricUnit = "RUB" | "COUNT" | "PERCENT" | "RUB_PER_VISIT";
export type ExecutiveMetricState =
  | "AVAILABLE"
  | "PARTIAL"
  | "MISSING"
  | "STALE"
  | "FAILED";
export type ExecutiveCoverage = {
  covered: number;
  total: number | null;
  percent: number | null;
  basis:
    | "STORE_DAYS"
    | "STORE_OPERATIONS"
    | "STORE_SESSIONS"
    | "CAPACITY_HOURS";
};
export type ExecutiveAppliedScope = {
  period: { from: string; to: string; timezone: string };
  storeIds: string[];
  storeTimeZones: Record<string, string>;
  comparison: { from: string; to: string } | null;
  asOf: string;
};
export type ExecutiveMetric<T = number> = {
  key: string;
  unit: ExecutiveMetricUnit;
  definition: string;
  grain: string;
  value: T | null;
  state: ExecutiveMetricState;
  reason: string | null;
  coverage: ExecutiveCoverage | null;
  factAsOf: string | null;
  lastCalculatedAt: string;
  comparison: {
    previousValue: number | null;
    absoluteDelta: number | null;
    percentDelta: number | null;
    pointsDelta: number | null;
  } | null;
  ratio: {
    numeratorValue: number | null;
    denominatorValue: number | null;
    numeratorLabel: string;
    denominatorLabel: string;
    compatible: boolean;
  } | null;
  destination?: "CLUBS" | "ASSORTMENT";
};
export type ExecutiveMetricKey =
  | "revenue"
  | "serviceRevenue"
  | "topups"
  | "visits"
  | "revenuePerVisit"
  | "load"
  | "productRevenue"
  | "productRevenueShare";
export type ExecutiveMetrics = Record<ExecutiveMetricKey, ExecutiveMetric>;
export type ExecutiveSummary = {
  scope: ExecutiveAppliedScope;
  metrics: ExecutiveMetrics;
  clubs: Array<{
    storeId: string;
    storeName: string;
    metrics: ExecutiveMetrics;
  }>;
  days: Array<{ date: string; metrics: ExecutiveMetrics }>;
};
export type ExecutiveOperations = {
  scope: ExecutiveAppliedScope;
  assortment: {
    state: ExecutiveMetricState;
    reason: string | null;
    data: DashboardAssortmentHealthSummary | null;
  };
};
export type ExecutiveQuery = {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds?: string[];
  comparison?: boolean;
  asOf?: string;
};
export type DashboardExecutiveProductRevenue = {
  scope: ExecutiveAppliedScope;
  grain: "CLUB";
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  selectedStoreIds: string[];
  metric: ExecutiveMetric<number> & {
    key: "productRevenue";
    label: "Товарная выручка";
    unit: "RUB";
    grain: "PRODUCT_SALE_OPERATION";
    destination: "CLUBS";
  };
  rows: Array<{
    storeId: string;
    storeName: string;
    revenue: number | null;
    saleOperationCount: number | null;
    metric: ExecutiveMetric<number> & {
      key: "productRevenue";
      label: "Товарная выручка";
      unit: "RUB";
      grain: "PRODUCT_SALE_OPERATION";
      destination: "CLUBS";
    };
  }>;
};

export class ExecutiveDashboardRequestError extends Error {
  constructor(
    readonly status: number,
    resource: string,
  ) {
    super(`Failed to fetch dashboard ${resource}`);
  }
}

export async function getExecutiveSummary(
  query: ExecutiveQuery,
  options: { signal?: AbortSignal } = {},
) {
  return getExecutiveResource<ExecutiveSummary>(
    "executive-summary",
    query,
    options,
  );
}

export async function getExecutiveOperations(
  query: ExecutiveQuery,
  options: { signal?: AbortSignal } = {},
) {
  return getExecutiveResource<ExecutiveOperations>(
    "executive-operations",
    query,
    options,
  );
}

export async function getExecutiveProductRevenue(
  query: Pick<
    ExecutiveQuery,
    "period" | "dateFrom" | "dateTo" | "storeIds" | "asOf"
  >,
  options: { signal?: AbortSignal } = {},
) {
  return getExecutiveResource<DashboardExecutiveProductRevenue>(
    "executive-product-revenue",
    query,
    options,
  );
}

async function getExecutiveResource<T>(
  resource: string,
  query: ExecutiveQuery,
  options: { signal?: AbortSignal },
): Promise<T> {
  const params = new URLSearchParams();
  if (query.period) params.set("period", query.period);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.comparison !== undefined)
    params.set("comparison", String(query.comparison));
  if (query.asOf) params.set("asOf", query.asOf);
  query.storeIds?.forEach((storeId) => params.append("storeIds", storeId));
  const response = await fetch(
    `${getApiUrl()}/dashboard/${resource}${params.size ? `?${params}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new ExecutiveDashboardRequestError(response.status, resource);
  }
  return response.json() as Promise<T>;
}
