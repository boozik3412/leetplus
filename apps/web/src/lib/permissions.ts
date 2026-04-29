import type { AuthUser } from "./auth";

export type Capability =
  | "view_dashboard"
  | "view_reports"
  | "manage_integrations"
  | "run_sync"
  | "import_data"
  | "edit_products"
  | "edit_catalog"
  | "edit_stores";

const roleCapabilities: Record<AuthUser["role"], Capability[]> = {
  OWNER: [
    "view_dashboard",
    "view_reports",
    "manage_integrations",
    "run_sync",
    "import_data",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  ADMIN: [
    "view_dashboard",
    "view_reports",
    "manage_integrations",
    "run_sync",
    "import_data",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  MANAGER: [
    "view_dashboard",
    "view_reports",
    "import_data",
    "edit_products",
    "edit_catalog",
    "edit_stores",
  ],
  BUYER: ["view_dashboard", "view_reports", "edit_products"],
};

export function can(user: AuthUser | null, capability: Capability) {
  if (!user) {
    return false;
  }

  return roleCapabilities[user.role].includes(capability);
}

export function canAccessPath(user: AuthUser | null, href: string) {
  if (href === "/settings") {
    return can(user, "manage_integrations");
  }

  if (href === "/import") {
    return can(user, "import_data");
  }

  return true;
}
