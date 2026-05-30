import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffTaskPriority,
  StaffTaskStore,
  StaffTaskType,
  StaffTaskUser,
} from "./staff-tasks";

export type StaffTaskTemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type StaffTaskTemplateFilters = {
  status?: StaffTaskTemplateStatus | "all";
  type?: StaffTaskType | "all";
  priority?: StaffTaskPriority | "all";
  storeId?: string;
  search?: string;
};

export type StaffTaskTemplate = {
  id: string;
  title: string;
  description: string | null;
  type: StaffTaskType;
  priority: StaffTaskPriority;
  status: StaffTaskTemplateStatus;
  dueOffsetMinutes: number | null;
  labels: unknown;
  checklist: unknown;
  tasksCreatedCount: number;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  createdByUser: StaffTaskUser | null;
};

export type StaffTaskTemplateReport = {
  filters: Required<Pick<StaffTaskTemplateFilters, "status" | "type" | "priority">> & {
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    tasksCreated: number;
  };
  rows: StaffTaskTemplate[];
  stores: StaffTaskStore[];
  users: StaffTaskUser[];
};

export async function getStaffTaskTemplateReport(
  filters: StaffTaskTemplateFilters = {},
): Promise<StaffTaskTemplateReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/task-templates${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff task templates");
  }

  return response.json() as Promise<StaffTaskTemplateReport>;
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
