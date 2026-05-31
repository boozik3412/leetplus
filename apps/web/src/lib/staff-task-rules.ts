import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffTaskPriority,
  StaffTaskStore,
  StaffTaskType,
  StaffTaskUser,
} from "./staff-tasks";

export type StaffTaskRuleStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type StaffTaskRuleCadence =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "OPENING_SHIFT"
  | "CLOSING_SHIFT";

export type StaffTaskRuleFilters = {
  status?: StaffTaskRuleStatus | "all";
  cadence?: StaffTaskRuleCadence | "all";
  storeId?: string;
  templateId?: string;
  search?: string;
};

export type StaffTaskRuleTemplate = {
  id: string;
  title: string;
  status: string;
  type: StaffTaskType;
  priority: StaffTaskPriority;
  dueOffsetMinutes?: number | null;
  storeId: string | null;
};

export type StaffTaskRule = {
  id: string;
  title: string;
  description: string | null;
  cadence: StaffTaskRuleCadence;
  status: StaffTaskRuleStatus;
  taskType: StaffTaskType;
  priority: StaffTaskPriority;
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueOffsetMinutes: number | null;
  nextRunAt: string | null;
  lastManualRunAt: string | null;
  lastAutomaticRunAt: string | null;
  labels: unknown;
  checklist: unknown;
  tasksCreatedCount: number;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  template: StaffTaskRuleTemplate | null;
  createdByUser: StaffTaskUser | null;
  assignedToUser: StaffTaskUser | null;
  lastCreatedTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
  } | null;
};

export type StaffTaskRuleRun = {
  id: string;
  ruleId: string;
  ruleTitle: string;
  status: string;
  scheduledFor: string;
  startedAt: string;
  completedAt: string | null;
  message: string | null;
  metadata: unknown;
  createdTask: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
  } | null;
};

export type StaffTaskRuleRunDueResult = {
  now: string;
  dryRun: boolean;
  limit: number;
  due: number;
  created: number;
  skipped: number;
  failed: number;
  runs: Array<{
    ruleId: string;
    ruleTitle: string;
    scheduledFor: string;
    status: "DUE" | "SUCCESS" | "SKIPPED" | "FAILED";
    taskId: string | null;
    message: string | null;
  }>;
};

export type StaffTaskRuleReport = {
  filters: Required<Pick<StaffTaskRuleFilters, "status" | "cadence">> & {
    storeId: string | null;
    templateId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    active: number;
    paused: number;
    archived: number;
    dueNow: number;
    tasksCreated: number;
  };
  rows: StaffTaskRule[];
  runs: StaffTaskRuleRun[];
  stores: StaffTaskStore[];
  users: StaffTaskUser[];
  templates: StaffTaskRuleTemplate[];
};

export async function getStaffTaskRuleReport(
  filters: StaffTaskRuleFilters = {},
): Promise<StaffTaskRuleReport> {
  const response = await fetch(`${getApiUrl()}/staff/task-rules${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff task rules");
  }

  return response.json() as Promise<StaffTaskRuleReport>;
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
