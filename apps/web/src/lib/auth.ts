import { getApiUrl, getAuthHeaders } from "./api";
import { redirect } from "next/navigation";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "OWNER" | "MANAGER" | "BUYER" | "ADMIN";
  tenantId: string;
  tenantSlug: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const headers = await getAuthHeaders();

  if (!("Authorization" in headers)) {
    return null;
  }

  const response = await fetch(`${getApiUrl()}/auth/me`, {
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<AuthUser>;
}

export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
