import type { AuthUser } from "./auth";

export const staffShiftWorkspaceHref = "/staff/shift-workspace";
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

export function isCommunicationChatOnlyRole(
  role: AuthUser["role"] | null | undefined,
) {
  return role === "CLUB_ADMINISTRATOR" || role === "TRAINEE";
}

export function getDefaultLandingPath(
  user: Pick<AuthUser, "role" | "isPlatformAdmin"> | null,
) {
  if (user?.isPlatformAdmin) {
    return platformAdministrationHref;
  }

  if (isShiftWorkspaceRole(user?.role)) {
    return staffShiftWorkspaceHref;
  }

  return "/dashboard";
}

export function getAuthenticatedDestination(
  user: Pick<AuthUser, "role" | "isPlatformAdmin">,
  returnTo?: string | null,
) {
  if (user.isPlatformAdmin) {
    return platformAdministrationHref;
  }

  return returnTo ?? getDefaultLandingPath(user);
}
