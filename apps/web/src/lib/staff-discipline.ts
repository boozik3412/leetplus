import { getApiUrl, getAuthHeaders } from "./api";
import type { UserRole } from "./roles";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffDisciplineRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type StaffDisciplineFilters = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  status?: "ACTIVE" | "CANCELED" | "RESET" | "all";
  search?: string;
};

export type StaffDisciplinePolicy = {
  id: string | null;
  scope: "NETWORK" | "STORE";
  storeId: string | null;
  storeName: string | null;
  label: string;
  enabled: boolean;
  inheritedFromNetwork: boolean;
};

export type StaffDisciplineRule = {
  id: string;
  category: string;
  title: string;
  firstFineAmount: number;
  secondFineAmount: number;
  thirdFineAmount: number;
  isActive: boolean;
  sortOrder: number;
};

export type StaffDisciplineUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

export type StaffDisciplineRecord = {
  id: string;
  occurredAt: string;
  category: string;
  ruleTitle: string;
  level: "WARNING_1" | "WARNING_2" | "FINE_1" | "FINE_2" | "FINE_3";
  amount: number;
  status: "ACTIVE" | "CANCELED" | "RESET";
  comment: string | null;
  rule: Pick<StaffDisciplineRule, "id" | "category" | "title">;
  store: StaffTaskStore | null;
  user: StaffDisciplineUser;
  createdByUser: Pick<StaffDisciplineUser, "id" | "email" | "fullName"> | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffDisciplineReport = {
  filters: Required<Pick<StaffDisciplineFilters, "dateFrom" | "dateTo">> & {
    storeId: string | null;
    userId: string | null;
    status: "ACTIVE" | "CANCELED" | "RESET" | "all";
    search: string | null;
  };
  summary: {
    activeRules: number;
    rulesTotal: number;
    recordsTotal: number;
    warnings: number;
    fines: number;
    fineAmount: number;
    enabledScopes: number;
    disabledScopes: number;
  };
  policies: StaffDisciplinePolicy[];
  rules: StaffDisciplineRule[];
  records: StaffDisciplineRecord[];
  stores: StaffTaskStore[];
  users: StaffDisciplineUser[];
};

export type StaffAdministratorRating = {
  id: string;
  user: StaffDisciplineUser & { stores: StaffTaskStore[] };
  score: number;
  riskLevel: StaffDisciplineRiskLevel;
  regulations: {
    required: number;
    acknowledged: number;
    score: number;
  };
  checklists: {
    total: number;
    accepted: number;
    returned: number;
    failedItems: number;
    score: number;
  };
  attestation: {
    status: string;
    passed: boolean | null;
    score: number | null;
    submittedAt: string | null;
  };
  discipline: {
    warnings: number;
    fines: number;
    fineAmount: number;
    byCategory: Array<{
      category: string;
      warnings: number;
      fines: number;
      fineAmount: number;
    }>;
    score: number;
  };
};

export type StaffAdministratorRatingsReport = {
  filters: Required<Pick<StaffDisciplineFilters, "dateFrom" | "dateTo">> & {
    storeId: string | null;
    search: string | null;
  };
  summary: {
    administrators: number;
    averageScore: number;
    warnings: number;
    fines: number;
    fineAmount: number;
    attestationProblems: number;
  };
  rows: StaffAdministratorRating[];
  stores: StaffTaskStore[];
};

export async function getStaffDisciplineReport(
  filters: StaffDisciplineFilters = {},
): Promise<StaffDisciplineReport> {
  const response = await fetch(`${getApiUrl()}/staff/discipline${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff discipline report");
  }

  return response.json() as Promise<StaffDisciplineReport>;
}

export async function getStaffAdministratorRatings(
  filters: Pick<StaffDisciplineFilters, "dateFrom" | "dateTo" | "storeId" | "search"> = {},
): Promise<StaffAdministratorRatingsReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/administrator-ratings${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff administrator ratings");
  }

  return response.json() as Promise<StaffAdministratorRatingsReport>;
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
