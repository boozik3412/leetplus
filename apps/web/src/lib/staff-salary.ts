import { getApiUrl, getAuthHeaders } from "./api";
import type { UserRole } from "./roles";
import type { StaffTaskStore } from "./staff-tasks";

export type StaffSalarySchemeStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type StaffSalaryPeriodType = "MONTHLY" | "BIWEEKLY" | "WEEKLY" | "CUSTOM";
export type StaffSalaryRoleScope =
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_ADMINISTRATOR";

export type StaffSalaryFilters = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  userId?: string;
  schemeId?: string;
  search?: string;
};

export type StaffSalaryBonusRules = {
  taskDoneOnTimeAmount: number;
  acceptedChecklistAmount: number;
  perfectChecklistAmount: number;
  noViolationAmount: number;
};

export type StaffSalaryPenaltyRules = {
  overdueTaskAmount: number;
  returnedChecklistAmount: number;
  failedChecklistItemAmount: number;
  warningAmount: number;
  includeDisciplineFines: boolean;
};

export type StaffSalaryScheme = {
  id: string;
  storeId: string | null;
  title: string;
  description: string | null;
  status: StaffSalarySchemeStatus;
  roleScope: StaffSalaryRoleScope;
  periodType: StaffSalaryPeriodType;
  fixedAmount: number;
  hourlyRate: number;
  shiftRate: number;
  bonusRules: StaffSalaryBonusRules;
  penaltyRules: StaffSalaryPenaltyRules;
  store: StaffTaskStore | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffSalaryUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

export type StaffSalaryRow = {
  id: string;
  user: StaffSalaryUser & { stores: StaffTaskStore[] };
  scheme: StaffSalaryScheme | null;
  baseAmount: number;
  shiftAmount: number;
  hourlyAmount: number;
  bonusAmount: number;
  penaltyAmount: number;
  netAmount: number;
  shifts: number;
  hours: number;
  tasks: {
    total: number;
    completedOnTime: number;
    overdue: number;
  };
  checklists: {
    total: number;
    accepted: number;
    returned: number;
    failedItems: number;
  };
  discipline: {
    warnings: number;
    fines: number;
    fineAmount: number;
  };
  sourceWarnings: string[];
};

export type StaffSalaryWorkspace = {
  filters: Required<Pick<StaffSalaryFilters, "dateFrom" | "dateTo">> & {
    storeId: string | null;
    userId: string | null;
    schemeId: string | null;
    search: string | null;
  };
  summary: {
    administrators: number;
    activeSchemes: number;
    totalBaseAmount: number;
    totalShiftAmount: number;
    totalHourlyAmount: number;
    totalBonusAmount: number;
    totalPenaltyAmount: number;
    totalNetAmount: number;
    shifts: number;
    hours: number;
  };
  schemes: StaffSalaryScheme[];
  rows: StaffSalaryRow[];
  stores: StaffTaskStore[];
  users: StaffSalaryUser[];
};

export async function getStaffSalaryWorkspace(
  filters: StaffSalaryFilters = {},
): Promise<StaffSalaryWorkspace> {
  const response = await fetch(`${getApiUrl()}/staff/salary${query(filters)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff salary workspace");
  }

  return response.json() as Promise<StaffSalaryWorkspace>;
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
