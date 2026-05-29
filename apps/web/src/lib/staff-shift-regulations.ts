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
