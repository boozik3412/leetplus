import { getApiUrl, getAuthHeaders } from "./api";

export type AdminOverview = {
  totals: {
    tenants: number;
    users: number;
    stores: number;
    products: number;
    salesFacts: number;
    integrationSources: number;
  };
  tenants: {
    id: string;
    name: string;
    slug: string;
    usersCount: number;
    storesCount: number;
    productsCount: number;
    salesFactsCount: number;
    langameSources: {
      domain: string;
      isActive: boolean;
      lastSyncedAt: string | null;
    }[];
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
