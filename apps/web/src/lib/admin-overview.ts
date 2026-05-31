import { getApiUrl, getAuthHeaders } from "./api";

export type AdminAuditEvent = {
  id: string;
  tenantId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  actor: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type AdminAuditEventsResponse = {
  events: AdminAuditEvent[];
  count: number;
};

export type AdminOverview = {
  totals: {
    tenants: number;
    users: number;
    stores: number;
    products: number;
    salesFacts: number;
    integrationSources: number;
    criticalTenants: number;
    warningTenants: number;
  };
  tenants: {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    statusChangedAt: string | null;
    statusReason: string | null;
    usersCount: number;
    activeUsersCount: number;
    inactiveUsersCount: number;
    storesCount: number;
    activeStoresCount: number;
    inactiveStoresCount: number;
    productsCount: number;
    salesFactsCount: number;
    langameSources: {
      id: string;
      domain: string;
      isActive: boolean;
      lastSyncedAt: string | null;
      supportDisabledAt: string | null;
      supportDisabledReason: string | null;
      supportReviewRequestedAt: string | null;
      supportReviewReason: string | null;
    }[];
    diagnostics: {
      severity: "OK" | "WARNING" | "CRITICAL";
      activeLangameSources: number;
      staleLangameSources: number;
      failedSyncJobs24h: number;
      lastSyncStatus: "SUCCESS" | "FAILED" | null;
      lastSyncAt: string | null;
      issues: string[];
    };
  }[];
  recentSyncJobs: {
    id: string;
    tenantId: string;
    domain: string;
    status: "SUCCESS" | "FAILED";
    mode: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    storesCount: number;
    productsCount: number;
    inventoryCount: number;
    salesCount: number;
    discrepancyCount: number;
    errorMessage: string | null;
  }[];
  auditEvents: AdminAuditEvent[];
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await fetch(`${getApiUrl()}/admin/overview`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin overview");
  }

  return response.json() as Promise<AdminOverview>;
}
