import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffReadinessStatus,
} from "./staff-readiness-report";
import type { StaffTaskStore } from "./staff-tasks";
import type { StaffTrainingProfileUser } from "./staff-training-profiles";

export type StaffOperationsRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type StaffOperationsDashboardFilters = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  search?: string;
};

export type StaffOperationsSummary = {
  totalSignals: number;
  tasksTotal: number;
  checklistsTotal: number;
  doneOnTime: number;
  overdue: number;
  failedItems: number;
  returned: number;
  unchecked: number;
  readinessBlocked: number;
  recurringIssues: number;
  operationalScore: number;
  riskLevel: StaffOperationsRiskLevel;
};

export type StaffOperationsRating = {
  id: string;
  label: string;
  caption: string | null;
  score: number;
  riskLevel: StaffOperationsRiskLevel;
  tasksTotal: number;
  checklistsTotal: number;
  doneOnTime: number;
  overdue: number;
  failedItems: number;
  returned: number;
  unchecked: number;
  readinessBlocked: number;
  readinessAttention: number;
  repeatedIssues: number;
  scorePercent: number;
  href: string | null;
};

export type StaffOperationsEmployeeRating = StaffOperationsRating & {
  user: Pick<StaffTrainingProfileUser, "id" | "email" | "fullName"> | null;
  readinessStatus: StaffReadinessStatus | null;
  readinessPercent: number | null;
  trainingBlockers: number;
};

export type StaffOperationsRecurringIssue = {
  id: string;
  title: string;
  scopeLabel: string;
  club: StaffTaskStore | null;
  employee: Pick<StaffTrainingProfileUser, "id" | "email" | "fullName"> | null;
  shiftKind: string;
  occurrences: number;
  failedRuns: number;
  firstSeen: string;
  lastSeen: string;
  latestRunTitle: string;
  riskLevel: StaffOperationsRiskLevel;
  href: string;
};

export type StaffOperationsRiskItem = {
  id: string;
  kind:
    | "TASK_OVERDUE"
    | "TASK_UNCHECKED"
    | "CHECKLIST_RETURNED"
    | "CHECKLIST_FAILED"
    | "CHECKLIST_UNCHECKED";
  title: string;
  detail: string;
  severity: StaffOperationsRiskLevel;
  date: string;
  store: StaffTaskStore | null;
  user: Pick<StaffTrainingProfileUser, "id" | "email" | "fullName"> | null;
  href: string;
};

export type StaffOperationsDashboard = {
  filters: Required<Pick<StaffOperationsDashboardFilters, "dateFrom" | "dateTo">> & {
    storeId: string | null;
    userId: string | null;
    search: string | null;
  };
  summary: StaffOperationsSummary;
  clubs: StaffOperationsRating[];
  employees: StaffOperationsEmployeeRating[];
  recurringIssues: StaffOperationsRecurringIssue[];
  latestRisks: StaffOperationsRiskItem[];
  stores: StaffTaskStore[];
  users: Array<Pick<StaffTrainingProfileUser, "id" | "email" | "fullName">>;
};

export async function getStaffOperationsDashboard(
  filters: StaffOperationsDashboardFilters = {},
): Promise<StaffOperationsDashboard> {
  const response = await fetch(
    `${getApiUrl()}/staff/operations-dashboard${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff operations dashboard");
  }

  return response.json() as Promise<StaffOperationsDashboard>;
}

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const value = params.toString();
  return value ? `?${value}` : "";
}
