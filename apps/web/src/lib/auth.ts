import { getApiUrl, getAuthHeaders } from "./api";
import { notFound, redirect } from "next/navigation";
import {
  getAuthenticatedDestination,
  getDefaultLandingPath,
  platformAdministrationHref,
} from "./landing";
import { canAccessPath } from "./permissions";
import { cache } from "react";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role:
    | "OWNER"
    | "MANAGER"
    | "BUYER"
    | "ADMIN"
    | "MARKETER"
    | "CLUB_MANAGER"
    | "STANDARDS_MANAGER"
    | "SENIOR_ADMINISTRATOR"
    | "CLUB_ADMINISTRATOR"
    | "TRAINEE";
  customRoleId?: string | null;
  customRoleName?: string | null;
  hasRoleOverride?: boolean;
  permissions?: string[];
  isActive?: boolean;
  isPlatformAdmin: boolean;
  platformTenantContext?: boolean;
  tenantId: string;
  tenantSlug: string;
  tenantStatus?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  tenantCustomerStage?: "INTERNAL" | "PILOT" | "BETA" | "LIVE";
  tenantOnboardingStatus?:
    | "PROVISIONING"
    | "OWNER_INVITED"
    | "ONBOARDING"
    | "READY"
    | "ACTIVE"
    | "OFFBOARDING";
  tenantTrialStartsAt?: string | null;
  tenantTrialEndsAt?: string | null;
  tenantEntitlementProfileRevision?: number;
  accessScope: "NETWORK" | "STORES";
  allowedStoreIds: string[];
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

async function fetchCurrentUser(): Promise<AuthUser | null> {
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

export async function getCurrentUser(): Promise<AuthUser | null> {
  return fetchCurrentUser();
}

export const getCurrentUserForRequest = cache(fetchCurrentUser);

export async function redirectIfAuthenticated(returnTo?: string | null) {
  const user = await getCurrentUserForRequest();

  if (user) {
    redirect(
      getAuthenticatedDestination(user, sanitizeReturnTo(returnTo)),
    );
  }
}

export function sanitizeReturnTo(value?: string | null) {
  if (!value) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (value.startsWith("/login") || value.startsWith("/register")) {
    return null;
  }

  return value;
}

export async function requireCurrentUser() {
  const user = await getCurrentUserForRequest();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * Page-level companion of the sidebar rule: a page the user's role cannot
 * open (canAccessPath is false) sends them to their supported landing page
 * before any restricted API fetch, instead of rendering a failed request.
 * The API remains the authoritative boundary; this never widens access.
 * When the landing page itself is the denied path, the page renders and the
 * API decides, so a custom role without its landing capability cannot loop.
 */
export function ensurePageAccess(user: AuthUser, path: string) {
  if (canAccessPath(user, path)) {
    return;
  }

  const landingPath = getDefaultLandingPath(user);
  const landingRoute = landingPath.split(/[?#]/u, 1)[0] ?? landingPath;

  if (landingRoute !== path) {
    redirect(landingPath);
  }
}

export async function requirePageAccess(path: string) {
  const user = await requireCurrentUser();

  ensurePageAccess(user, path);

  return user;
}

/**
 * Keeps platform operators without a selected tenant out of tenant-scoped
 * pages. The API remains the authoritative boundary.
 */
export async function requireTenantWorkspaceUser() {
  const user = await requireCurrentUser();

  if (user.isPlatformAdmin && !user.platformTenantContext) {
    redirect(platformAdministrationHref);
  }

  return user;
}

/**
 * UI companion for API workspaces protected by FreshNetworkScopeGuard.
 * The API guard remains the authoritative, database-fresh boundary; this
 * helper prevents a STORES subject from reaching a server component that
 * would otherwise turn the expected 403 into a generic RSC failure.
 */
export async function requireNetworkScopedUser(options: {
  storesFallback?: string;
} = {}) {
  const user = await requireCurrentUser();

  if (user.accessScope !== "NETWORK") {
    if (options.storesFallback) {
      redirect(options.storesFallback);
    }

    notFound();
  }

  return user;
}
