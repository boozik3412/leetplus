import { getApiUrl, getAuthHeaders, requestJsonWithTimeout } from "./api";

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
  connectionMode: "INTERNAL" | "SAFE_EXTERNAL";
  hasApiKey: boolean;
  domains: string[];
  stores: LangameStoreSettings[];
  sources: LangameSourceSettings[];
  syncJobs: LangameSyncJob[];
  latestSuccessfulSyncJob: LangameSyncJob | null;
  endpointProfiles: LangameEndpointProfileRunSummary[];
  endpointSnapshotCandidates: LangameEndpointSnapshotCandidate[];
  endpointSnapshots: LangameEndpointSnapshotRunSummary[];
};

export type LangameStoreSettings = {
  id: string;
  name: string;
  externalDomain: string | null;
  externalClubId: string | null;
  integrationSourceId: string | null;
};

export type LangameOnboardingClub = {
  externalClubId: string;
  name: string;
  address: string | null;
};

export type LangameOnboardingDiagnostic = {
  domain: string;
  status: "SUCCESS" | "FAILED";
  clubCount: number;
  clubs: LangameOnboardingClub[];
  requiresSelection: boolean;
  reasonCode:
    | "LANGAME_DIAGNOSTIC_FAILED"
    | "LANGAME_NO_ACTIVE_CLUBS"
    | "LANGAME_CLUB_LIST_INVALID"
    | null;
};

export type LangameSettingsPreview = {
  status: "READY" | "REJECTED";
  diagnostics: LangameOnboardingDiagnostic[];
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
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  storesCount: number;
  productsCount: number;
  inventoryCount: number;
  salesCount: number;
  discrepancyCount: number;
  hasDiscrepancyLog: boolean;
  discrepancyLogStatus: "NOT_REQUIRED" | "WRITTEN" | "FAILED";
  discrepancyLogError: string | null;
  errorMessage: string | null;
};

export async function getLangameSettings(): Promise<LangameSettings> {
  const response = await requestJsonWithTimeout<LangameSettings>(
    `${getApiUrl()}/integrations/langame/settings`,
    {
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Langame settings: ${response.error}`);
  }

  if (!response.data) {
    throw new Error("Failed to fetch Langame settings: empty response");
  }

  return response.data;
}
