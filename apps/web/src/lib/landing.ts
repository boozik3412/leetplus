import type { AuthUser } from "./auth";

export const staffShiftWorkspaceHref = "/staff/shift-workspace";
export const staffTasksWorkspaceHref = "/staff/tasks?view=my&status=all";
export const platformAdministrationHref = "/administration";

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

  return "/dashboard";
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

  return returnTo ?? getDefaultLandingPath(user);
}
