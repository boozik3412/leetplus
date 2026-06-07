import { getApiUrl, getAuthHeaders } from "./api";

export type BusinessSnapshotType =
  | "REVENUE"
  | "GUESTS"
  | "TARIFFS"
  | "ASSORTMENT_ARRIVALS"
  | "STAFF_SHIFTS_CASH";

export type BusinessSnapshotStatus = "EMPTY" | "FRESH" | "STALE" | "FAILED";

export type BusinessSnapshotRunSummary = {
  id: string;
  type: BusinessSnapshotType;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  staleAfterHours: number;
  rowCount: number;
  sourceCounts: Record<string, number>;
  summary: Record<string, unknown>;
  freshness: Record<string, unknown>;
  errorMessage: string | null;
};

export type BusinessSnapshotTypeStatus = {
  type: BusinessSnapshotType;
  title: string;
  businessArea: string;
  targetRoute: string;
  status: BusinessSnapshotStatus;
  staleAfterHours: number;
  latestRun: BusinessSnapshotRunSummary | null;
  latestSuccessfulRun: BusinessSnapshotRunSummary | null;
  ageHours: number | null;
  rowCount: number;
  sourceCounts: Record<string, number>;
  summary: Record<string, unknown>;
  nextAction: string;
};

export type BusinessSnapshotStatusResult = {
  checkedAt: string;
  staleAfterHours: number;
  snapshots: BusinessSnapshotTypeStatus[];
};

export async function getBusinessSnapshotStatus() {
  const response = await fetch(
    `${getApiUrl()}/integrations/langame/business-snapshots/status`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch business snapshot status");
  }

  return response.json() as Promise<BusinessSnapshotStatusResult>;
}

export async function safeGetBusinessSnapshot(
  type: BusinessSnapshotType,
): Promise<BusinessSnapshotTypeStatus | null> {
  try {
    const status = await getBusinessSnapshotStatus();

    return status.snapshots.find((snapshot) => snapshot.type === type) ?? null;
  } catch {
    return null;
  }
}
