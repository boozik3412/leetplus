import { getApiUrl, getAuthHeaders } from "./api";

export type StaffChecklistStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "ON_REVIEW"
  | "ACCEPTED"
  | "RETURNED"
  | "CANCELED";
export type StaffChecklistFilterStatus = StaffChecklistStatus | "OVERDUE" | "all";
export type StaffChecklistShiftKind =
  | "OPENING"
  | "CLOSING"
  | "CASH"
  | "BAR"
  | "PC_ZONE"
  | "CLEANLINESS"
  | "INCIDENT"
  | "INVENTORY"
  | "CUSTOM";
export type StaffChecklistAnswerStatus = "PASS" | "FAILED" | "NOT_APPLICABLE";
export type StaffChecklistItemValueType =
  | "CHECKBOX"
  | "TEXT"
  | "NUMBER"
  | "PHOTO_LINK"
  | "FILE_LINK"
  | "SELECT"
  | "TIMESTAMP";

export type StaffChecklistStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffChecklistUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type StaffChecklistItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffChecklistItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
};

export type StaffChecklistSection = {
  id: string;
  title: string;
  description: string | null;
  items: StaffChecklistItem[];
};

export type StaffChecklistAnswer = {
  sectionId: string;
  itemId: string;
  value: string | null;
  status: StaffChecklistAnswerStatus | null;
  note: string | null;
  evidenceUrl: string | null;
  completedAt: string | null;
};

export type StaffChecklistBlockingIssue = {
  sectionId: string;
  itemId: string;
  title: string;
  issue: "REQUIRED_ANSWER_MISSING" | "REQUIRED_EVIDENCE_MISSING";
};

export type StaffChecklistRegulationOption = {
  id: string;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  version: number;
  store: StaffChecklistStore | null;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
};

export type StaffChecklistTemplateOption = {
  id: string;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  status: string;
  version: number;
  store: StaffChecklistStore | null;
  sectionsCount: number;
  itemsCount: number;
  requiredEvidenceItems: number;
};

export type StaffChecklistRun = {
  id: string;
  regulationId: string | null;
  templateId: string | null;
  title: string;
  shiftKind: StaffChecklistShiftKind;
  roleScope: string;
  status: StaffChecklistStatus;
  regulationVersion: number;
  templateVersion: number | null;
  scheduledAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  sections: StaffChecklistSection[];
  answers: StaffChecklistAnswer[];
  scoreTotal: number;
  scoreEarned: number;
  requiredItemsTotal: number;
  requiredItemsDone: number;
  evidenceTotal: number;
  evidenceDone: number;
  failedItems: number;
  blockingIssues: StaffChecklistBlockingIssue[];
  reviewComment: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  regulation: { id: string; title: string; status: string; version: number } | null;
  template: { id: string; title: string; status: string; version: number } | null;
  store: StaffChecklistStore | null;
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
  createdByUser: StaffChecklistUser | null;
  assignedToUser: StaffChecklistUser | null;
  reviewedByUser: StaffChecklistUser | null;
};

export type StaffChecklistFilters = {
  status?: StaffChecklistFilterStatus;
  shiftKind?: StaffChecklistShiftKind | "all";
  regulationId?: string;
  storeId?: string;
  assignedToUserId?: string;
  search?: string;
};

export type StaffChecklistReport = {
  filters: {
    status: StaffChecklistFilterStatus;
    shiftKind: StaffChecklistShiftKind | "all";
    regulationId: string | null;
    storeId: string | null;
    assignedToUserId: string | null;
    search: string | null;
  };
  summary: {
    total: number;
    open: number;
    inProgress: number;
    onReview: number;
    accepted: number;
    returned: number;
    canceled: number;
    overdue: number;
    failedItems: number;
    blockingIssues: number;
  };
  rows: StaffChecklistRun[];
  publishedRegulations: StaffChecklistRegulationOption[];
  checklistTemplates: StaffChecklistTemplateOption[];
  stores: StaffChecklistStore[];
  users: StaffChecklistUser[];
};

export async function getStaffChecklistReport(
  filters: StaffChecklistFilters = {},
): Promise<StaffChecklistReport> {
  const response = await fetch(`${getApiUrl()}/staff/checklists${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff checklists");
  }

  return response.json() as Promise<StaffChecklistReport>;
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
