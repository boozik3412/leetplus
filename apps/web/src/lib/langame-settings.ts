import {
  fetchWithTimeout,
  getApiUrl,
  getAuthHeaders,
  readApiError,
} from "./api";

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
  latestSuccessfulSyncJob: LangameSyncJob | null;
  endpointProfiles: LangameEndpointProfileRunSummary[];
  endpointSnapshotCandidates: LangameEndpointSnapshotCandidate[];
  endpointSnapshots: LangameEndpointSnapshotRunSummary[];
};

export type LangameEndpointProfileRunSummary = {
  id: string;
  domain: string;
  endpointKey: string;
  endpointPath: string;
  group: string;
  status: string;
  checkedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  requestParams: unknown;
  rowCount: number;
  payloadKind: string | null;
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

export type LangameEndpointSnapshotCandidateStatus =
  | "READY"
  | "PARTIAL"
  | "STALE"
  | "FAILED"
  | "UNPROFILED";

export type LangameEndpointSnapshotCandidate = {
  endpointKey: string;
  endpointPath: string;
  title: string;
  group: string;
  status: LangameEndpointSnapshotCandidateStatus;
  activeSourcesCount: number;
  checkedSourcesCount: number;
  successfulSourcesCount: number;
  failedSourcesCount: number;
  latestCheckedAt: string | null;
  rowCount: number;
  nextAction: string;
};

export type LangameEndpointSnapshotRunSummary = {
  id: string;
  domain: string;
  endpointKey: string;
  endpointPath: string;
  group: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  requestParams: unknown;
  rowCount: number;
  payloadKind: string | null;
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
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
  const response = await fetchWithTimeout(
    `${getApiUrl()}/integrations/langame/settings`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Langame settings: ${await readApiError(response)}`,
    );
  }

  return response.json() as Promise<LangameSettings>;
}
