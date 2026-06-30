import { getApiUrl, getAuthHeaders } from "./api";
import type { AuthUser } from "./auth";

export type StaffMemberStatus =
  | "ACTIVE"
  | "ONBOARDING"
  | "SUSPENDED"
  | "DISMISSED";

export type StaffMemberEmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "SHIFT"
  | "TRAINEE"
  | "CONTRACTOR";

export type StaffMemberCompensationType = "SHIFT" | "MONTH";

export type StaffDirectoryFilters = {
  status?: StaffMemberStatus | "all";
  role?: AuthUser["role"] | "all";
  storeId?: string;
  search?: string;
};

export type StaffDirectoryStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffDirectoryUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: AuthUser["role"];
  isActive: boolean;
};

export type StaffDirectoryMember = {
  id: string;
  displayName: string;
  role: AuthUser["role"];
  status: StaffMemberStatus;
  position: string | null;
  employmentType: StaffMemberEmploymentType | null;
  compensationType: StaffMemberCompensationType | null;
  compensationAmount: number | null;
  email: string | null;
  phone: string | null;
  hiredAt: string | null;
  dismissedAt: string | null;
  externalProvider: "LANGAME" | null;
  externalDomain: string | null;
  externalUserId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  store: StaffDirectoryStore | null;
  user: StaffDirectoryUser | null;
  createdByUser: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  langameUser: StaffLangameUserOption | null;
};

export type StaffLegacyIdentityMapping = {
  id: string;
  externalProvider: "LANGAME" | null;
  externalDomain: string;
  externalUserId: string;
  guestName: string | null;
  note: string | null;
  mappedStaffMemberId: string | null;
};

export type StaffLangameUserOption = {
  id: string;
  externalDomain: string;
  externalUserId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  adminStatus: string | null;
  verified: boolean | null;
  phone: string | null;
  externalGuestId: string | null;
  workPointLabel: string | null;
  mappedStaffMemberId: string | null;
  updatedAt: string;
};

export type StaffDirectoryReport = {
  filters: Required<Pick<StaffDirectoryFilters, "status" | "role">> & {
    storeId: string | null;
    search: string | null;
  };
  canManageDirectory: boolean;
  summary: {
    total: number;
    active: number;
    onboarding: number;
    suspended: number;
    dismissed: number;
    linkedAccounts: number;
    linkedLangameUsers: number;
  };
  rows: StaffDirectoryMember[];
  stores: StaffDirectoryStore[];
  users: StaffDirectoryUser[];
  legacyMappings: StaffLegacyIdentityMapping[];
  langameUsers: StaffLangameUserOption[];
};

export type StaffShiftWorkspaceProfile = {
  staffMember: StaffDirectoryMember | null;
};

export async function getStaffDirectoryReport(
  filters: StaffDirectoryFilters = {},
): Promise<StaffDirectoryReport> {
  const response = await fetch(
    `${getApiUrl()}/staff/directory${query(filters)}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch staff directory");
  }

  return response.json() as Promise<StaffDirectoryReport>;
}

export async function getStaffShiftWorkspaceProfile(): Promise<StaffShiftWorkspaceProfile> {
  const response = await fetch(`${getApiUrl()}/staff/shift-workspace/profile`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff shift workspace profile");
  }

  return response.json() as Promise<StaffShiftWorkspaceProfile>;
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
