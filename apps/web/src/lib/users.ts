import { getApiUrl, getAuthHeaders } from "./api";
import type { Capability } from "./permissions";
import type { UserRole } from "./roles";

export type UserAccountStore = {
  id: string;
  name: string;
  isActive: boolean;
};

export type UserAccount = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  customRole: UserAccessRole | null;
  permissions: Capability[];
  isActive: boolean;
  isPlatformAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scope: "NETWORK" | "STORES";
  stores: UserAccountStore[];
};

export type UserAccessRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Capability[];
  createdAt: string;
  updatedAt: string;
};

export type UserInvite = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  customRole: UserAccessRole | null;
  scope: "NETWORK" | "STORES";
  stores: UserAccountStore[];
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  registrationUrl?: string;
};

export type UserRoleOption = {
  role: UserRole;
  label: string;
  description: string;
};

export type CapabilityOption = {
  key: Capability;
  label: string;
  description: string;
};

export type UserAccountsResponse = {
  users: UserAccount[];
  stores: UserAccountStore[];
  roleOptions: UserRoleOption[];
  customRoles: UserAccessRole[];
  invites: UserInvite[];
  capabilityOptions: CapabilityOption[];
};

export async function getUserAccounts(): Promise<UserAccountsResponse> {
  const response = await fetch(`${getApiUrl()}/users`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }

  return response.json() as Promise<UserAccountsResponse>;
}
