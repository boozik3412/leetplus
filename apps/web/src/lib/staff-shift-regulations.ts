import { getApiUrl, getAuthHeaders } from "./api";

export type StaffShiftRegulationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type StaffShiftRegulationFilterStatus =
  | StaffShiftRegulationStatus
  | "all";
export type StaffShiftKind =
  | "OPENING"
  | "CLOSING"
  | "CASH"
  | "BAR"
  | "PC_ZONE"
  | "CLEANLINESS"
  | "INCIDENT"
  | "INVENTORY"
  | "CUSTOM";
export type StaffShiftRoleScope =
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "MANAGER"
  | "ALL_STAFF";
export type StaffShiftItemValueType =
  | "CHECKBOX"
  | "TEXT"
  | "NUMBER"
  | "PHOTO_LINK"
  | "FILE_LINK"
  | "SELECT"
  | "TIMESTAMP";

export type StaffShiftRegulationStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffShiftRegulationUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
};

export type StaffShiftRegulationItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffShiftItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffShiftRegulationSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffShiftRegulationItem[];
};

export type StaffShiftRegulationVersion = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  shiftKind: StaffShiftKind;
  roleScope: StaffShiftRoleScope;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
  effectiveFrom: string | null;
  publishedAt: string | null;
  createdAt: string;
  store: StaffShiftRegulationStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffShiftRegulation = {
  id: string;
  title: string;
  description: string | null;
  shiftKind: StaffShiftKind;
  status: StaffShiftRegulationStatus;
  roleScope: StaffShiftRoleScope;
  version: number;
  sections: StaffShiftRegulationSection[];
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
  effectiveFrom: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: StaffShiftRegulationStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  acknowledgementSummary: {
    requiredCount: number;
    acknowledgedCount: number;
    pendingCount: number;
    requiredByMe: boolean;
    acknowledgedByMe: boolean;
    acknowledgedAt: string | null;
  };
  acknowledgements: Array<{
    id: string;
    userId: string;
    version: number;
    comment: string | null;
    acknowledgedAt: string;
    user: StaffShiftRegulationUser;
  }>;
  versions: StaffShiftRegulationVersion[];
};

export type StaffShiftRegulationFilters = {
  status?: StaffShiftRegulationFilterStatus;
  shiftKind?: StaffShiftKind | "all";
  storeId?: string;
  search?: string;
};

export type StaffShiftRegulationReport = {
  filters: {
    status: StaffShiftRegulationFilterStatus;
    shiftKind: StaffShiftKind | "all";
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    published: number;
    archived: number;
    requiredEvidenceItems: number;
    requiredAcknowledgements: number;
    acknowledged: number;
    pendingAcknowledgements: number;
  };
  rows: StaffShiftRegulation[];
  stores: StaffShiftRegulationStore[];
};

export async function getStaffShiftRegulationReport(
  filters: StaffShiftRegulationFilters = {},
): Promise<StaffShiftRegulationReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/shift-regulations${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff shift regulations");
  }

  return response.json() as Promise<StaffShiftRegulationReport>;
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
