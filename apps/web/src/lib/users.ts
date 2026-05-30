import { getApiUrl, getAuthHeaders } from "./api";
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
  isActive: boolean;
  isPlatformAdmin: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scope: "NETWORK" | "STORES";
  stores: UserAccountStore[];
};

export type UserRoleOption = {
  role: UserRole;
  label: string;
  description: string;
};

export type UserAccountsResponse = {
  users: UserAccount[];
  stores: UserAccountStore[];
  roleOptions: UserRoleOption[];
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
