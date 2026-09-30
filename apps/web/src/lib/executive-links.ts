import type { ExecutiveSummary } from "./dashboard-executive";

/** Revenue-tree factor opened by a click on the main screen. */
export type DriverFocus =
  | "visits"
  | "conversion"
  | "purchases"
  | "check"
  | "bar"
  | "load";

export const driverFocuses: readonly DriverFocus[] = [
  "visits",
  "conversion",
  "purchases",
  "check",
  "bar",
  "load",
];

function detailParams(
  summary: ExecutiveSummary,
  metric: string,
  storeIds: readonly string[],
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
  // A club drill-down returns to the whole selection, not to that club.
  const selection = summary.scope.storeIds;
  if (
    storeIds.length !== selection.length ||
    storeIds.some((storeId) => !selection.includes(storeId))
  )
    selection.forEach((storeId) => params.append("returnStoreIds", storeId));
  return params;
}

/** Club/day detail of one metric with the same period, comparison and cut-off. */
export function clubDetailHref(
  summary: ExecutiveSummary,
  metric: string,
  storeIds: readonly string[] = summary.scope.storeIds,
) {
  return `/dashboard/executive-details?${detailParams(summary, metric, storeIds)}`;
}

/** Club/day table of the revenue tree with one factor in focus. */
export function driverDetailHref(
  summary: ExecutiveSummary,
  focus: DriverFocus,
  storeIds: readonly string[] = summary.scope.storeIds,
) {
  const params = detailParams(summary, "drivers", storeIds);
  params.set("focus", focus);
  return `/dashboard/executive-details?${params}`;
}

export type TaskDraft = {
  title: string;
  description: string;
  storeId?: string | null;
  priority: "NORMAL" | "HIGH" | "URGENT";
};

/**
 * The staff task form, opened and filled from a signal. The owner still
 * chooses the responsible people and creates the task there.
 */
export function taskDraftHref(draft: TaskDraft) {
  const params = new URLSearchParams({
    draftTitle: draft.title,
    draftDescription: draft.description,
    draftPriority: draft.priority,
    draftType: "ONE_TIME",
  });
  if (draft.storeId) params.set("draftStoreId", draft.storeId);
  return `/staff/tasks?${params}#new-task`;
}
