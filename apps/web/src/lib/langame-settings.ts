import { getApiUrl, getAuthHeaders } from "./api";

export type LangameSourceSettings = {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncedDate: string | null;
};

export type LangameSettings = {
  tenantName: string;
  hasApiKey: boolean;
  domains: string[];
  sources: LangameSourceSettings[];
  syncJobs: LangameSyncJob[];
};

export type LangameSyncJob = {
  id: string;
  domain: string;
  status: "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  storesCount: number;
  productsCount: number;
  inventoryCount: number;
  salesCount: number;
  discrepancyCount: number;
  hasDiscrepancyLog: boolean;
  errorMessage: string | null;
};

export async function getLangameSettings(): Promise<LangameSettings> {
  const response = await fetch(`${getApiUrl()}/integrations/langame/settings`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Langame settings");
  }

  return response.json() as Promise<LangameSettings>;
}
