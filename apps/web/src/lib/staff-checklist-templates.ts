import { getApiUrl, getAuthHeaders } from "./api";
import type {
  StaffChecklistItemValueType,
  StaffChecklistShiftKind,
  StaffChecklistStore,
  StaffChecklistTemplateOption,
} from "./staff-checklists";

export type StaffChecklistTemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type StaffChecklistTemplateFilterStatus =
  | StaffChecklistTemplateStatus
  | "all";
export type StaffChecklistTemplateRoleScope =
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "MANAGER"
  | "ALL_STAFF";

export type StaffChecklistTemplateItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffChecklistItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffChecklistTemplateSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffChecklistTemplateItem[];
};

export type StaffChecklistTemplate = {
  id: string;
  title: string;
  description: string | null;
  shiftKind: StaffChecklistShiftKind;
  roleScope: StaffChecklistTemplateRoleScope;
  status: StaffChecklistTemplateStatus;
  version: number;
  sections: StaffChecklistTemplateSection[];
  sectionsCount: number;
  itemsCount: number;
  requiredItemsCount: number;
  evidenceItemsCount: number;
  scoreTotal: number;
  createdAt: string;
  updatedAt: string;
  store: StaffChecklistStore | null;
  sourceRegulation: {
    id: string;
    title: string;
    status: string;
    version: number;
  } | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
};

export type StaffChecklistTemplateFilters = {
  status?: StaffChecklistTemplateFilterStatus;
  shiftKind?: StaffChecklistShiftKind | "all";
  storeId?: string;
  search?: string;
};

export type StaffChecklistTemplateReport = {
  filters: {
    status: StaffChecklistTemplateFilterStatus;
    shiftKind: StaffChecklistShiftKind | "all";
    storeId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    draft: number;
    active: number;
    archived: number;
    itemsCount: number;
    requiredItemsCount: number;
    evidenceItemsCount: number;
    scoreTotal: number;
  };
  rows: StaffChecklistTemplate[];
  stores: StaffChecklistStore[];
  publishedRegulations: StaffChecklistTemplateOption[];
};

export async function getStaffChecklistTemplateReport(
  filters: StaffChecklistTemplateFilters = {},
): Promise<StaffChecklistTemplateReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/checklist-templates${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff checklist templates");
  }

  return response.json() as Promise<StaffChecklistTemplateReport>;
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
