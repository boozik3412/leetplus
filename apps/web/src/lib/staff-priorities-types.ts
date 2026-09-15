export const staffPriorityKinds = [
  "TASKS_OVERDUE",
  "CHECKLISTS_OVERDUE",
  "CHECKLISTS_REVIEW",
  "TRAINING_INCOMPLETE",
  "REGULATIONS_UNACKNOWLEDGED",
] as const;
export type StaffPriorityKind = (typeof staffPriorityKinds)[number];
export const staffPriorityLabels: Record<StaffPriorityKind, string> = {
  TASKS_OVERDUE: "Закрыть просроченные задачи",
  CHECKLISTS_OVERDUE: "Завершить просроченные чек-листы",
  CHECKLISTS_REVIEW: "Проверить сданные чек-листы",
  TRAINING_INCOMPLETE: "Завершить обязательное обучение",
  REGULATIONS_UNACKNOWLEDGED: "Ознакомить сотрудников с регламентами",
};
export type StaffPriorityMetric = {
  kind: StaffPriorityKind;
  value: number | null;
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "FAILED";
  reason: string | null;
  unit: "TASKS" | "CHECKLISTS" | "EMPLOYEES";
  coverage: {
    observed: number;
    total: number | null;
    limitCodes: string[];
  } | null;
};
export type StaffPrioritySummary = {
  scope: { storeIds: string[]; includesNetworkAssignments: boolean };
  evaluatedAt: string;
  metrics: Record<StaffPriorityKind, StaffPriorityMetric>;
};
export type StaffPriorityItem = {
  id: string;
  title: string;
  status: string | null;
  dueAt: string | null;
  store: { id: string; name: string } | null;
  employee: { id: string; name: string | null } | null;
  missingCourses?: Array<{ id: string; title: string }>;
  missingRegulations?: Array<{ id: string; title: string; version: number }>;
  target: {
    type: "TASK" | "CHECKLIST" | "TRAINING_PROFILE" | "REGULATION_CATALOG";
    id?: string;
    userId?: string;
  } | null;
};
export type StaffPriorityDetails = Omit<StaffPrioritySummary, "metrics"> & {
  kind: StaffPriorityKind;
  metric: StaffPriorityMetric;
  items: StaffPriorityItem[];
  page: { limit: number; hasMore: boolean; nextCursor: string | null };
};
export type StaffPriorityLoad = {
  data: StaffPrioritySummary | null;
  error: string | null;
};

export function staffPriorityHref(
  storeIds: readonly string[],
  kind: StaffPriorityKind,
) {
  const query = new URLSearchParams({ kind });
  storeIds.forEach((id) => query.append("storeIds", id));
  return `/dashboard/priorities?${query}`;
}

export function staffPriorityTarget(item: StaffPriorityItem) {
  const target = item.target;
  if (!target) return null;
  if (target.type === "TASK" && target.id)
    return `/staff/tasks?${new URLSearchParams({ taskId: target.id })}`;
  if (target.type === "CHECKLIST" && target.id)
    return `/staff/checklists?${new URLSearchParams({ runId: target.id })}`;
  if (target.type === "TRAINING_PROFILE" && target.userId)
    return `/staff/training-profiles?${new URLSearchParams({ userId: target.userId })}`;
  if (target.type === "REGULATION_CATALOG") return "/staff/shift-regulations";
  return null;
}
