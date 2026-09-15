export const staffPriorityKinds = [
  'TASKS_OVERDUE',
  'CHECKLISTS_OVERDUE',
  'CHECKLISTS_REVIEW',
  'TRAINING_INCOMPLETE',
  'REGULATIONS_UNACKNOWLEDGED',
] as const;
export type StaffPriorityKind = (typeof staffPriorityKinds)[number];
export type StaffPriorityScope = {
  storeIds: string[];
  includesNetworkAssignments: boolean;
};
export type StaffPriorityMetric = {
  kind: StaffPriorityKind;
  value: number | null;
  state: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED';
  reason: string | null;
  unit: 'TASKS' | 'CHECKLISTS' | 'EMPLOYEES';
  coverage: {
    observed: number;
    total: number | null;
    limitCodes: string[];
  } | null;
};
export type StaffPrioritySummary = {
  scope: StaffPriorityScope;
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
    type: 'TASK' | 'CHECKLIST' | 'TRAINING_PROFILE' | 'REGULATION_CATALOG';
    id?: string;
    userId?: string;
  } | null;
};
export type StaffPriorityDetails = Omit<StaffPrioritySummary, 'metrics'> & {
  kind: StaffPriorityKind;
  metric: StaffPriorityMetric;
  items: StaffPriorityItem[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};
export type StaffPriorityQuery = { storeIds?: string | string[] };
export type StaffPriorityItemsQuery = StaffPriorityQuery & {
  kind?: string;
  cursor?: string;
  limit?: string;
};
