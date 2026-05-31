import { getApiUrl, getAuthHeaders } from "./api";
import type { StaffTaskStore, StaffTaskUser } from "./staff-tasks";

export type StaffNotificationStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type StaffNotificationSeverity = "INFO" | "WARNING" | "CRITICAL";
export type StaffNotificationSourceType =
  | "TASK"
  | "CHECKLIST"
  | "RECURRING_RULE"
  | "TEAM_CHAT"
  | "KNOWLEDGE_BASE";

export type StaffNotification = {
  id: string;
  sourceType: StaffNotificationSourceType;
  sourceId: string | null;
  severity: StaffNotificationSeverity;
  status: StaffNotificationStatus;
  title: string;
  message: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  metadata: unknown;
  targetUser: StaffTaskUser | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: StaffTaskStore | null;
  acknowledgedByUser: StaffTaskUser | null;
  resolvedByUser: StaffTaskUser | null;
};

export type StaffNotificationsFilters = {
  status?: StaffNotificationStatus | "all";
  severity?: StaffNotificationSeverity | "all";
  sourceType?: StaffNotificationSourceType | "all";
  storeId?: string;
  search?: string;
  pageSize?: string;
};

export type StaffNotificationsReport = {
  filters: {
    status: StaffNotificationStatus | "all";
    severity: StaffNotificationSeverity | "all";
    sourceType: StaffNotificationSourceType | "all";
    storeId: string | null;
    search: string | null;
    pageSize: number;
  };
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    critical: number;
    warning: number;
    info: number;
  };
  rows: StaffNotification[];
  stores: StaffTaskStore[];
  sourceTypes: StaffNotificationSourceType[];
  severities: StaffNotificationSeverity[];
  statuses: StaffNotificationStatus[];
};

export async function getStaffNotificationsReport(
  filters: StaffNotificationsFilters = {},
): Promise<StaffNotificationsReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/notifications${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff notifications");
  }

  return response.json() as Promise<StaffNotificationsReport>;
}

function query(filters: StaffNotificationsFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const value = params.toString();
  return value ? `?${value}` : "";
}
