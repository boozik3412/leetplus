import { getApiUrl, getAuthHeaders } from "./api";

export type StaffTaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "ON_REVIEW"
  | "DONE"
  | "CANCELED";

export type StaffTaskFilterStatus = StaffTaskStatus | "OVERDUE" | "all";

export type StaffTaskViewMode =
  | "all"
  | "today"
  | "overdue"
  | "my"
  | "watched"
  | "approval"
  | "byClub"
  | "byEmployee"
  | "byShift"
  | "byStatus";

export type StaffTaskType =
  | "ONE_TIME"
  | "SHIFT"
  | "RECURRING"
  | "LONG_TERM"
  | "PERSONAL"
  | "CLUB"
  | "ROLE";

export type StaffTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type StaffTaskSortKey =
  | "dueAt"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "priority";

export type StaffTaskUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type StaffTaskStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffTaskComment = {
  id: string;
  body: string | null;
  evidenceType: string | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  authorUser: StaffTaskUser | null;
};

export type StaffTaskAuditEvent = {
  id: string;
  action: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
  actorUser: StaffTaskUser | null;
};

export type StaffTaskObserver = {
  id: string;
  createdAt: string;
  user: StaffTaskUser;
};

export type StaffTask = {
  id: string;
  title: string;
  description: string | null;
  type: StaffTaskType;
  status: StaffTaskStatus;
  priority: StaffTaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  store: StaffTaskStore | null;
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
  createdByUser: StaffTaskUser | null;
  assignedToUser: StaffTaskUser | null;
  observers: StaffTaskObserver[];
  labels: unknown;
  checklist: unknown;
  comments: StaffTaskComment[];
  auditEvents: StaffTaskAuditEvent[];
};

export type StaffTaskFilters = {
  view?: StaffTaskViewMode;
  status?: StaffTaskFilterStatus;
  type?: StaffTaskType | "all";
  priority?: StaffTaskPriority | "all";
  storeId?: string;
  taskId?: string;
  shiftId?: string;
  assignedToUserId?: string;
  observerUserId?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  sort?: StaffTaskSortKey;
  direction?: "asc" | "desc";
  pageSize?: string;
};

export type StaffTaskReport = {
  filters: Required<
    Pick<
      StaffTaskFilters,
      "view" | "status" | "type" | "priority" | "sort" | "direction"
    >
  > & {
    storeId: string | null;
    taskId: string | null;
    shiftId: string | null;
    assignedToUserId: string | null;
    observerUserId: string | null;
    search: string | null;
    dueFrom: string | null;
    dueTo: string | null;
    pageSize: number;
  };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    onReview: number;
    done: number;
    overdue: number;
    canceled: number;
  };
  quickViews: Array<{
    key: StaffTaskViewMode;
    label: string;
    count: number;
  }>;
  groups: {
    byClub: StaffTaskGroup[];
    byEmployee: StaffTaskGroup[];
    byShift: StaffTaskGroup[];
    byStatus: StaffTaskGroup[];
  };
  rows: StaffTask[];
  users: StaffTaskUser[];
  stores: StaffTaskStore[];
};

export type StaffTaskGroup = {
  key: string;
  label: string;
  hint: string | null;
  total: number;
  open: number;
  inProgress: number;
  onReview: number;
  done: number;
  overdue: number;
  canceled: number;
  filter: {
    status?: StaffTaskFilterStatus;
    storeId?: string;
    assignedToUserId?: string;
    shiftId?: string;
  };
};

export async function getStaffTaskReport(
  filters: StaffTaskFilters = {},
): Promise<StaffTaskReport> {
  const response = await fetch(`${getApiUrl()}/staff/tasks${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff tasks");
  }

  return response.json() as Promise<StaffTaskReport>;
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
