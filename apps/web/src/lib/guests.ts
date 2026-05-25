import { getApiUrl, getAuthHeaders } from "./api";

export type GuestSegment =
  | "active"
  | "new"
  | "repeat"
  | "risk"
  | "lost"
  | "quiet";

export type GuestCrmStatus =
  | "NONE"
  | "WATCH"
  | "CONTACT"
  | "INVITED"
  | "LOYAL"
  | "VIP"
  | "PROBLEM"
  | "DO_NOT_CONTACT";

export type GuestCommunicationConsentStatus =
  | "UNKNOWN"
  | "GRANTED"
  | "DENIED"
  | "UNSUBSCRIBED";

export type GuestDashboardRow = {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  guestGroupName: string | null;
  displayName: string;
  contact: string;
  insertedAt: string | null;
  lastActivityAt: string | null;
  sessionsCount: number;
  visitsDays: number;
  playHours: number;
  currentCountHours: number | null;
  transactionAmount: number;
  barRevenue: number;
  segment: GuestSegment;
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: string | null;
  crmUpdatedAt: string | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
};

export type GuestFilterOptions = {
  stores: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
  }>;
  groups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
};

export type GuestsSummary = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  totalGuests: number;
  activeGuests: number;
  newGuests: number;
  repeatGuests: number;
  riskGuests: number;
  lostGuests: number;
  sessionsCount: number;
  playHours: number;
  computerCount: number | null;
  playCapacityHours: number | null;
  loadPercent: number | null;
  averageSessionMinutes: number;
  transactionsCount: number;
  transactionAmount: number;
  barRevenue: number;
  barSalesCount: number;
  dataQuality: {
    latestProfileRuns: Array<{
      domain: string;
      startedAt: string;
      status: string;
      guestsCount: number;
      sessionsCount: number;
      transactionsCount: number;
      productSalesLinked: number;
      endpointErrors: Record<string, string>;
    }>;
    unavailableEndpoints: string[];
    sessionsWithoutGuestId: number;
    transactionsWithoutGuestId: number;
    salesMissingGuestLink: number;
  };
  visitTrend: Array<{
    date: string;
    sessionsCount: number;
    activeGuests: number;
    barRevenue: number;
  }>;
  topGuests: GuestDashboardRow[];
  riskGuestsRows: GuestDashboardRow[];
};

export type GuestListFilters = GuestsSummaryFilters & {
  segment?: "top" | GuestSegment;
  crmStatus?: GuestCrmStatus;
  search?: string;
  page?: string;
  pageSize?: string;
  sort?: "revenue" | "sessions" | "lastActivity" | "registered";
  direction?: "asc" | "desc";
};

export type GuestSavedFilter = {
  id: string;
  name: string;
  description: string | null;
  filters: Omit<GuestListFilters, "page">;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type GuestAudience = {
  id: string;
  name: string;
  description: string | null;
  filters: Omit<GuestListFilters, "page">;
  guestsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GuestCrmLead = {
  id: string;
  displayName: string;
  phone: string;
  email: string | null;
  source: string | null;
  eventName: string | null;
  crmStatus: GuestCrmStatus;
  crmNote: string | null;
  nextAction: string | null;
  nextContactAt: string | null;
  phoneConsentStatus: GuestCommunicationConsentStatus;
  phoneConsentSource: string | null;
  phoneConsentAt: string | null;
  unsubscribedAt: string | null;
  matchedGuestId: string | null;
  matchedGuestDisplayName: string | null;
  matchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestCrmTask = {
  id: string;
  title: string;
  description: string | null;
  status: GuestCrmTaskStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  audience: { id: string; name: string } | null;
  guest: { id: string; displayName: string } | null;
  lead: { id: string; displayName: string } | null;
  assignedToUser: { id: string; displayName: string; email: string } | null;
};

export type GuestCrmTaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELED";

export type GuestCrmTaskSortKey =
  | "dueAt"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "target"
  | "assignee";

export type GuestCrmTaskTargetType = "all" | "group" | "guest" | "lead";

export type GuestCrmTaskFilters = {
  status?: GuestCrmTaskStatus | "all";
  assignedToUserId?: string;
  targetType?: GuestCrmTaskTargetType;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: GuestCrmTaskSortKey;
  direction?: "asc" | "desc";
  pageSize?: string;
};

export type GuestCrmTaskReport = {
  status: GuestCrmTaskStatus | "all";
  assignedToUserId: string | null;
  targetType: GuestCrmTaskTargetType;
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sort: GuestCrmTaskSortKey;
  direction: "asc" | "desc";
  pageSize: number;
  totalRows: number;
  summary: {
    open: number;
    inProgress: number;
    done: number;
    canceled: number;
    overdue: number;
    withAssignee: number;
    withoutAssignee: number;
  };
  rows: GuestCrmTask[];
};

export type GuestCrmUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
};

export type GuestCrmContactEvent = {
  id: string;
  channel: string;
  result: string | null;
  note: string | null;
  contactedAt: string;
  createdAt: string;
  audience: { id: string; name: string } | null;
  guest: { id: string; displayName: string } | null;
  lead: { id: string; displayName: string } | null;
  createdBy: string | null;
};

export type GuestListResponse = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  guestGroupId: string | null;
  segment: "top" | GuestSegment;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  sort: NonNullable<GuestListFilters["sort"]>;
  direction: NonNullable<GuestListFilters["direction"]>;
  rows: GuestDashboardRow[];
};

export type StaffControlRow = GuestDashboardRow & {
  controlFlags: string[];
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  averageShiftMiddleCheck: number;
};

export type StaffControlDiagnostics = {
  latestRuns: Array<{
    domain: string;
    startedAt: string;
    endpointErrors: Record<string, string>;
    operationLogs: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
    cashTransactions: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
    workingShifts: {
      total: number;
      candidateFields: Record<string, number>;
      operatorHints: StaffOperatorHint[];
    };
  }>;
};

export type StaffOperatorHint = {
  operatorId: string;
  count: number;
  fields: Record<string, string[]>;
};

export type StaffUnmatchedOperatorRow = {
  externalDomain: string | null;
  externalUserId: string;
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  averageShiftMiddleCheck: number;
};

export type StaffControlReport = {
  tenantId: string;
  tenantSlug: string;
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  staffGroups: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    externalGroupId: string;
  }>;
  staffCount: number;
  activeStaff: number;
  sessionsCount: number;
  playHours: number;
  transactionAmount: number;
  barRevenue: number;
  operationLogsCount: number;
  operationAmount: number;
  shiftsCount: number;
  shiftsWithStaffLink: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  averageShiftMiddleCheck: number;
  rows: StaffControlRow[];
  anomalies: Array<{
    type: StaffControlAnomalyType;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    amount: number | null;
    count: number;
  }>;
  operationTypes: Array<{
    type: string;
    count: number;
    amount: number;
  }>;
  operationKindSummary: Array<{
    kind: StaffOperationKind;
    count: number;
    amount: number;
  }>;
  unmatchedOperators: StaffUnmatchedOperatorRow[];
  diagnostics: StaffControlDiagnostics;
};

export type StaffOperatorSortKey =
  | "shifts"
  | "hours"
  | "cash"
  | "refunds"
  | "incass"
  | "middleCheck";

export type StaffOperationKind =
  | "refunds"
  | "discounts"
  | "cash"
  | "guest"
  | "service"
  | "other";

export type StaffOperationSortKey = "count" | "amount" | "lastSeen" | "type";

export type StaffControlAnomalyType =
  | "refunds"
  | "missing-incassation"
  | "long-shift"
  | "low-middle-check"
  | "unmapped-operator";

export type StaffOperatorShiftDetail = {
  externalShiftId: string | null;
  storeName: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  durationHours: number;
  paymentAmount: number;
  refundAmount: number;
  incassAmount: number;
  middleCheck: number;
  barRevenue: number;
  hookahRevenue: number;
  signals: StaffControlAnomalyType[];
};

export type StaffOperatorReportRow = {
  externalDomain: string | null;
  externalUserId: string;
  mappingId: string | null;
  mappingNote: string | null;
  linkedGuest: GuestDashboardRow | null;
  storeNames: string[];
  lastClosedShiftExternalShiftId: string | null;
  lastClosedShiftStartedAt: string | null;
  lastClosedShiftStoppedAt: string | null;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  shiftRefundAmount: number;
  shiftIncassAmount: number;
  barRevenue: number;
  hookahRevenue: number;
  averageShiftMiddleCheck: number;
  shiftDetails: StaffOperatorShiftDetail[];
};

export type StaffOperatorReport = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  status: "all" | "linked" | "unlinked";
  anomaly: StaffControlAnomalyType | null;
  search: string | null;
  sort: StaffOperatorSortKey;
  direction: "asc" | "desc";
  rows: StaffOperatorReportRow[];
  staffOptions: GuestDashboardRow[];
};

export type StaffOperationsReportRow = {
  type: string;
  kind: StaffOperationKind;
  count: number;
  amount: number;
  lastSeenAt: string | null;
  storeNames: string[];
  externalDomains: string[];
};

export type StaffOperationsReport = {
  periodFrom: string;
  periodTo: string;
  storeId: string | null;
  kind: StaffOperationKind | "all";
  search: string | null;
  sort: StaffOperationSortKey;
  direction: "asc" | "desc";
  totalCount: number;
  totalAmount: number;
  kindSummary: Array<{
    kind: StaffOperationKind;
    count: number;
    amount: number;
  }>;
  rows: StaffOperationsReportRow[];
};

export type GuestDetail = GuestDashboardRow & {
  crmEvents: Array<{
    id: string;
    status: GuestCrmStatus;
    note: string | null;
    nextAction: string | null;
    nextContactAt: string | null;
    createdAt: string;
    createdBy: string | null;
  }>;
  sessions: Array<{
    id: string;
    startedAt: string | null;
    stoppedAt: string | null;
    durationMinutes: number | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  transactions: Array<{
    id: string;
    happenedAt: string | null;
    amount: number | null;
    balance: number | null;
    bonusBalance: number | null;
    type: string | null;
    storeName: string | null;
    externalDomain: string | null;
  }>;
  sales: Array<{
    id: string;
    saleDate: string;
    productName: string;
    storeName: string;
    revenue: number;
    quantity: number;
  }>;
};

export type GuestsSummaryFilters = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  guestGroupId?: string;
};

export type StaffOperatorFilters = GuestsSummaryFilters & {
  status?: "all" | "linked" | "unlinked";
  anomaly?: StaffControlAnomalyType;
  search?: string;
  sort?: StaffOperatorSortKey;
  direction?: "asc" | "desc";
};

export type StaffOperationsFilters = GuestsSummaryFilters & {
  kind?: StaffOperationKind | "all";
  search?: string;
  sort?: StaffOperationSortKey;
  direction?: "asc" | "desc";
};

export async function getGuestFilterOptions(): Promise<GuestFilterOptions> {
  const response = await fetch(`${getApiUrl()}/guests/filter-options`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest filter options");
  }

  return response.json() as Promise<GuestFilterOptions>;
}

export async function getGuestsSummary(
  filters: GuestsSummaryFilters = {},
): Promise<GuestsSummary> {
  const response = await fetch(
    `${getApiUrl()}/guests/summary${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch guests summary");
  }

  return response.json() as Promise<GuestsSummary>;
}

export async function getGuests(
  filters: GuestListFilters = {},
): Promise<GuestListResponse> {
  const response = await fetch(`${getApiUrl()}/guests${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guests");
  }

  return response.json() as Promise<GuestListResponse>;
}

export async function getGuestSavedFilters(): Promise<GuestSavedFilter[]> {
  const response = await fetch(`${getApiUrl()}/guests/saved-filters`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest saved filters");
  }

  return response.json() as Promise<GuestSavedFilter[]>;
}

export async function getGuestAudiences(): Promise<GuestAudience[]> {
  const response = await fetch(`${getApiUrl()}/guests/audiences`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest groups");
  }

  return response.json() as Promise<GuestAudience[]>;
}

export async function getGuestCrmLeads(): Promise<GuestCrmLead[]> {
  const response = await fetch(`${getApiUrl()}/guests/crm/leads`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest CRM leads");
  }

  return response.json() as Promise<GuestCrmLead[]>;
}

export async function getGuestCrmTasks(): Promise<GuestCrmTask[]> {
  const response = await fetch(`${getApiUrl()}/guests/crm/tasks`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest CRM tasks");
  }

  return response.json() as Promise<GuestCrmTask[]>;
}

export async function getGuestCrmTaskReport(
  filters: GuestCrmTaskFilters = {},
): Promise<GuestCrmTaskReport> {
  const response = await fetch(
    `${getApiUrl()}/guests/crm/tasks/report${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch guest CRM task report");
  }

  return response.json() as Promise<GuestCrmTaskReport>;
}

export async function getGuestCrmUsers(): Promise<GuestCrmUser[]> {
  const response = await fetch(`${getApiUrl()}/guests/crm/users`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest CRM users");
  }

  return response.json() as Promise<GuestCrmUser[]>;
}

export async function getGuestCrmContactEvents(): Promise<
  GuestCrmContactEvent[]
> {
  const response = await fetch(`${getApiUrl()}/guests/crm/contact-events`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest CRM contact events");
  }

  return response.json() as Promise<GuestCrmContactEvent[]>;
}

export async function getStaffControl(
  filters: GuestsSummaryFilters = {},
): Promise<StaffControlReport> {
  const response = await fetch(
    `${getApiUrl()}/guests/staff-control${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff control report");
  }

  return response.json() as Promise<StaffControlReport>;
}

export async function getStaffOperators(
  filters: StaffOperatorFilters = {},
): Promise<StaffOperatorReport> {
  const response = await fetch(
    `${getApiUrl()}/guests/staff-control/operators${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff operator report");
  }

  return response.json() as Promise<StaffOperatorReport>;
}

export async function getStaffOperations(
  filters: StaffOperationsFilters = {},
): Promise<StaffOperationsReport> {
  const response = await fetch(
    `${getApiUrl()}/guests/staff-control/operations${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff operations report");
  }

  return response.json() as Promise<StaffOperationsReport>;
}

export async function getGuest(id: string): Promise<GuestDetail> {
  const response = await fetch(`${getApiUrl()}/guests/${id}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest");
  }

  return response.json() as Promise<GuestDetail>;
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
