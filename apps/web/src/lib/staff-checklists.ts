import { getApiUrl, getAuthHeaders } from "./api";

export type StaffChecklistStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "ON_REVIEW"
  | "ACCEPTED"
  | "RETURNED"
  | "ESCALATED"
  | "CANCELED";
export type StaffChecklistFilterStatus = StaffChecklistStatus | "OVERDUE" | "OTHER" | "all";
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
export type StaffChecklistItemTimingMode =
  | "NONE"
  | "SHIFT_START"
  | "SHIFT_END"
  | "CHECKLIST_SCHEDULED"
  | "TIME_OF_DAY";
export type StaffChecklistTimingStatus =
  | "NOT_CONFIGURED"
  | "WAITING"
  | "ON_TIME"
  | "EARLY"
  | "LATE"
  | "MISSED"
  | "NO_ANCHOR";
export type StaffChecklistExecutionSort =
  | "activityDate"
  | "checklist"
  | "store"
  | "employee"
  | "score"
  | "problems"
  | "status";
export type StaffChecklistExecutionSortDirection = "asc" | "desc";
export type StaffChecklistExecutionProblemFilter = "all" | "with" | "none";
export type StaffChecklistExecutionScoreFilter =
  | "all"
  | "lt50"
  | "50to79"
  | "80to99"
  | "100";
export type StaffChecklistExecutionSourceFilter =
  | "all"
  | "REGULATION"
  | "TEMPLATE"
  | "RUN";

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

export type StaffChecklistItemTiming = {
  mode: StaffChecklistItemTimingMode;
  offsetMinutes: number | null;
  timeOfDay: string | null;
  toleranceMinutes: number;
  affectsDiscipline: boolean;
};

export type StaffChecklistItem = {
  id: string;
  title: string;
  instruction: string | null;
  valueType: StaffChecklistItemValueType;
  required: boolean;
  evidenceRequired: boolean;
  score: number;
  timing: StaffChecklistItemTiming;
};

export type StaffChecklistEvidenceAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type StaffChecklistReviewThreadStatus = "OPEN" | "RESOLVED";

export type StaffChecklistReviewThreadMessage = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  authorRole: string | null;
  body: string;
  attachments: StaffChecklistEvidenceAttachment[];
  createdAt: string;
};

export type StaffChecklistReviewThread = {
  id: string;
  status: StaffChecklistReviewThreadStatus;
  createdByUserId: string | null;
  createdAt: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  messages: StaffChecklistReviewThreadMessage[];
};

export type StaffChecklistAnswerTiming = {
  status: StaffChecklistTimingStatus;
  plannedAt: string | null;
  windowStartAt: string | null;
  windowEndAt: string | null;
  deviationMinutes: number | null;
  toleranceMinutes: number;
  affectsDiscipline: boolean;
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
  evidenceAttachments: StaffChecklistEvidenceAttachment[];
  reviewThreads: StaffChecklistReviewThread[];
  completedAt: string | null;
  timing: StaffChecklistAnswerTiming | null;
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
  timedItemsTotal: number;
  timedItemsDone: number;
  timedItemsOnTime: number;
  timedItemsEarly: number;
  timedItemsLate: number;
  timingViolations: number;
  timingCompliancePercent: number;
  maxTimingDeviationMinutes: number;
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
  runId?: string;
  regulationId?: string;
  templateId?: string;
  storeId?: string;
  assignedToUserId?: string;
  search?: string;
};

export type StaffChecklistExecutionReportFilters = StaffChecklistFilters & {
  dateFrom?: string;
  dateTo?: string;
  sort?: StaffChecklistExecutionSort;
  direction?: StaffChecklistExecutionSortDirection;
  problems?: StaffChecklistExecutionProblemFilter;
  scoreRange?: StaffChecklistExecutionScoreFilter;
  sourceType?: StaffChecklistExecutionSourceFilter;
};

export type StaffChecklistReport = {
  filters: {
    status: StaffChecklistFilterStatus;
    shiftKind: StaffChecklistShiftKind | "all";
    runId: string | null;
    regulationId: string | null;
    templateId?: string | null;
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
    escalated: number;
    canceled: number;
    overdue: number;
    failedItems: number;
    blockingIssues: number;
    timedItemsTotal: number;
    timedItemsDone: number;
    timedItemsOnTime: number;
    timingViolations: number;
    timingCompliancePercent: number;
  };
  rows: StaffChecklistRun[];
  publishedRegulations: StaffChecklistRegulationOption[];
  checklistTemplates: StaffChecklistTemplateOption[];
  stores: StaffChecklistStore[];
  users: StaffChecklistUser[];
};

export type StaffChecklistExecutionMetrics = {
  total: number;
  open: number;
  inProgress: number;
  onReview: number;
  accepted: number;
  returned: number;
  escalated: number;
  canceled: number;
  overdue: number;
  failedItems: number;
  blockingIssues: number;
  scoreTotal: number;
  scoreEarned: number;
  scorePercent: number;
  requiredItemsTotal: number;
  requiredItemsDone: number;
  requiredPercent: number;
  evidenceTotal: number;
  evidenceDone: number;
  evidencePercent: number;
  timedItemsTotal: number;
  timedItemsDone: number;
  timedItemsOnTime: number;
  timedItemsEarly: number;
  timedItemsLate: number;
  timingViolations: number;
  timingCompliancePercent: number;
  maxTimingDeviationMinutes: number;
};

export type StaffChecklistExecutionGroup = StaffChecklistExecutionMetrics & {
  key: string;
  label: string;
  caption: string | null;
};

export type StaffChecklistExecutionRun = StaffChecklistExecutionMetrics & {
  id: string;
  title: string;
  status: StaffChecklistStatus;
  activityDate: string;
  scheduledAt: string | null;
  submittedAt: string | null;
  store: StaffChecklistStore | null;
  assignedToUser: StaffChecklistUser | null;
  checklist: {
    id: string | null;
    title: string;
    type: "REGULATION" | "TEMPLATE" | "RUN";
  };
  shift: {
    id: string;
    externalShiftId: string;
    startedAt: string | null;
    stoppedAt: string | null;
    store: { id: string; name: string } | null;
  } | null;
};

export type StaffChecklistExecutionReport = {
  filters: StaffChecklistReport["filters"] & {
    dateFrom: string | null;
    dateTo: string | null;
    sort: StaffChecklistExecutionSort;
    direction: StaffChecklistExecutionSortDirection;
    problems: StaffChecklistExecutionProblemFilter;
    scoreRange: StaffChecklistExecutionScoreFilter;
    sourceType: StaffChecklistExecutionSourceFilter;
  };
  summary: StaffChecklistExecutionMetrics;
  byClub: StaffChecklistExecutionGroup[];
  byShift: StaffChecklistExecutionGroup[];
  byEmployee: StaffChecklistExecutionGroup[];
  byChecklist: StaffChecklistExecutionGroup[];
  runs: StaffChecklistExecutionRun[];
  stores: StaffChecklistStore[];
  users: StaffChecklistUser[];
  checklistTemplates: StaffChecklistTemplateOption[];
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

export async function getStaffChecklistExecutionReport(
  filters: StaffChecklistExecutionReportFilters = {},
): Promise<StaffChecklistExecutionReport> {
  const response = await fetch(`${getApiUrl()}/staff/checklists/report${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff checklist execution report");
  }

  return response.json() as Promise<StaffChecklistExecutionReport>;
}

export async function addStaffChecklistItemReviewMessage(
  runId: string,
  itemId: string,
  payload: {
    body: string;
    attachmentUrl?: string | null;
    attachments?: StaffChecklistEvidenceAttachment[];
  },
): Promise<StaffChecklistRun> {
  const response = await fetch(
    `${getApiUrl()}/staff/checklists/${runId}/items/${itemId}/review-messages`,
    {
      method: "POST",
      headers: {
        ...(await getAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to add staff checklist review message");
  }

  return response.json() as Promise<StaffChecklistRun>;
}

export async function resolveStaffChecklistItemReview(
  runId: string,
  itemId: string,
  payload: { comment?: string | null } = {},
): Promise<StaffChecklistRun> {
  const response = await fetch(
    `${getApiUrl()}/staff/checklists/${runId}/items/${itemId}/review-resolve`,
    {
      method: "POST",
      headers: {
        ...(await getAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to resolve staff checklist review");
  }

  return response.json() as Promise<StaffChecklistRun>;
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
