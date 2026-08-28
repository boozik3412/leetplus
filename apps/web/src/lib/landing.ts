import type { AuthUser } from "./auth";

export const staffShiftWorkspaceHref = "/staff/shift-workspace";
export const staffTasksWorkspaceHref = "/staff/tasks?view=my&status=all";
export const staffStandardsWorkspaceHref = "/staff";
export const assortmentWorkspaceHref = "/assortment/dashboard";
export const marketingWorkspaceHref = "/marketing";
export const dashboardWorkspaceHref = "/dashboard";
export const platformAdministrationHref = "/administration";

const tenantRoleLandingPaths = {
  OWNER: dashboardWorkspaceHref,
  ADMIN: dashboardWorkspaceHref,
  MANAGER: dashboardWorkspaceHref,
  CLUB_MANAGER: dashboardWorkspaceHref,
  BUYER: assortmentWorkspaceHref,
  MARKETER: marketingWorkspaceHref,
  STANDARDS_MANAGER: staffStandardsWorkspaceHref,
  SENIOR_ADMINISTRATOR: staffShiftWorkspaceHref,
  CLUB_ADMINISTRATOR: staffShiftWorkspaceHref,
  TRAINEE: staffShiftWorkspaceHref,
} satisfies Record<AuthUser["role"], string>;

export function shouldShowTenantOnboardingNotice(
  user: Pick<
    AuthUser,
    "role" | "isPlatformAdmin" | "tenantOnboardingStatus"
  >,
) {
  return (
    !user.isPlatformAdmin &&
    user.role === "OWNER" &&
    user.tenantOnboardingStatus === "ONBOARDING"
  );
}

export function isShiftWorkspaceRole(
  role: AuthUser["role"] | null | undefined,
) {
  return (
    role === "CLUB_ADMINISTRATOR" ||
    role === "SENIOR_ADMINISTRATOR" ||
    role === "TRAINEE"
  );
}

export function getDefaultLandingPath(
  user: Pick<
    AuthUser,
    "role" | "isPlatformAdmin" | "platformTenantContext" | "accessScope"
  > | null,
) {
  if (user?.isPlatformAdmin && !user.platformTenantContext) {
    return platformAdministrationHref;
  }

  if (isShiftWorkspaceRole(user?.role)) {
    return staffShiftWorkspaceHref;
  }

  return user
    ? tenantRoleLandingPaths[user.role]
    : dashboardWorkspaceHref;
}

export function getAuthenticatedDestination(
  user: Pick<
    AuthUser,
    "role" | "isPlatformAdmin" | "platformTenantContext" | "accessScope"
  >,
  returnTo?: string | null,
) {
  if (user.isPlatformAdmin && !user.platformTenantContext) {
    return platformAdministrationHref;
  }

  const defaultLandingPath = getDefaultLandingPath(user);

  if (
    returnTo &&
    defaultLandingPath !== dashboardWorkspaceHref &&
    isDashboardPath(returnTo)
  ) {
    return defaultLandingPath;
  }

  return returnTo ?? defaultLandingPath;
}

function isDashboardPath(value: string) {
  const path = value.split(/[?#]/u, 1)[0] ?? value;

  return path === dashboardWorkspaceHref || path.startsWith("/dashboard/");
}
