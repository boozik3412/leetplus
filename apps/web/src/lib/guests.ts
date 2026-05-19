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
};

export type StaffControlDiagnostics = {
  latestRuns: Array<{
    domain: string;
    startedAt: string;
    endpointErrors: Record<string, string>;
    operationLogs: {
      total: number;
      candidateFields: Record<string, number>;
    };
    cashTransactions: {
      total: number;
      candidateFields: Record<string, number>;
    };
    workingShifts: {
      total: number;
      candidateFields: Record<string, number>;
    };
  }>;
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
  rows: StaffControlRow[];
  operationTypes: Array<{
    type: string;
    count: number;
    amount: number;
  }>;
  diagnostics: StaffControlDiagnostics;
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
