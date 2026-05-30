import type { AuthUser } from "./auth";

export type Capability =
  | "view_dashboard"
  | "view_reports"
  | "view_guests"
  | "view_marketing"
  | "view_staff"
  | "manage_users"
  | "manage_integrations"
  | "run_sync"
  | "import_data"
  | "use_utilities"
  | "edit_products"
  | "edit_catalog"
  | "edit_stores";

const roleCapabilities: Record<AuthUser["role"], Capability[]> = {
  OWNER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
    "view_staff",
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  ADMIN: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
    "view_staff",
    "manage_users",
    "manage_integrations",
    "run_sync",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  MANAGER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
    "view_staff",
    "import_data",
    "use_utilities",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  BUYER: ["view_dashboard", "view_reports", "use_utilities", "edit_products"],
  MARKETER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
  ],
  CLUB_MANAGER: [
    "view_dashboard",
    "view_reports",
    "view_guests",
    "view_marketing",
    "view_staff",
  ],
  SENIOR_ADMINISTRATOR: ["view_dashboard", "view_staff"],
  CLUB_ADMINISTRATOR: ["view_dashboard", "view_staff"],
};

export function can(user: AuthUser | null, capability: Capability) {
  if (!user) {
    return false;
  }

  return roleCapabilities[user.role].includes(capability);
}

export function canAccessPath(user: AuthUser | null, href: string) {
  if (href === "/admin") {
    return Boolean(user?.isPlatformAdmin);
  }

  if (href === "/users") {
    return can(user, "manage_users");
  }

  if (href.startsWith("/staff") || href.startsWith("/guests/staff-control")) {
    return can(user, "view_staff");
  }

  if (href.startsWith("/marketing")) {
    return can(user, "view_marketing");
  }

  if (href.startsWith("/guests")) {
    return can(user, "view_guests");
  }

  if (
    href.startsWith("/assortment") ||
    href.startsWith("/products") ||
    href.startsWith("/categories") ||
    href.startsWith("/suppliers") ||
    href.startsWith("/stores") ||
    href.startsWith("/reports")
  ) {
    return can(user, "view_reports") || can(user, "edit_products");
  }

  if (href === "/settings") {
    return can(user, "manage_integrations");
  }

  if (href === "/sync") {
    return can(user, "run_sync");
  }

  if (href === "/import") {
    return can(user, "import_data");
  }

  if (href === "/utilities") {
    return can(user, "use_utilities");
  }

  return true;
}
