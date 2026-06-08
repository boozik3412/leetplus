import type { AuthUser } from "./auth";

export const staffShiftWorkspaceHref = "/staff/shift-workspace";

export function isShiftWorkspaceRole(
  role: AuthUser["role"] | null | undefined,
) {
  return (
    role === "CLUB_ADMINISTRATOR" ||
    role === "SENIOR_ADMINISTRATOR" ||
    role === "TRAINEE"
  );
}

export function getDefaultLandingPath(user: Pick<AuthUser, "role"> | null) {
  if (isShiftWorkspaceRole(user?.role)) {
    return staffShiftWorkspaceHref;
  }

  return "/dashboard";
}
