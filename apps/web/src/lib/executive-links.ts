import type { ExecutiveSummary } from "./dashboard-executive";

/** Club/day detail of one metric with the same period, comparison and cut-off. */
export function clubDetailHref(
  summary: ExecutiveSummary,
  metric: string,
  storeIds: readonly string[] = summary.scope.storeIds,
) {
  const params = new URLSearchParams({
    metric,
    period: "custom",
    dateFrom: summary.scope.period.from,
    dateTo: summary.scope.period.to,
    asOf: summary.scope.asOf,
    comparison: String(summary.scope.comparison !== null),
  });
  storeIds.forEach((storeId) => params.append("storeIds", storeId));
  return `/dashboard/executive-details?${params}`;
}
