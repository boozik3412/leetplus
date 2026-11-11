import Link from "next/link";
import type { AuthUser } from "@/lib/auth";
import { isShiftWorkspaceRole } from "@/lib/landing";
import { canAccessPath } from "@/lib/permissions";

// One menu item, «Контроль и мотивация», opens these three pages; the tabs
// move between them. Each tab is shown only to roles that may open it.
const staffControlTabs = [
  { href: "/staff/administrator-ratings", label: "Рейтинг администраторов" },
  { href: "/staff/discipline", label: "Мотивация персонала" },
  { href: "/staff/staff-control", label: "Контроль персонала" },
] as const;

export type StaffControlTabHref = (typeof staffControlTabs)[number]["href"];

export function StaffControlTabs({
  user,
  current,
}: {
  user: AuthUser | null;
  current: StaffControlTabHref;
}) {
  const tabs = staffControlTabs.filter(
    (tab) =>
      canAccessPath(user, tab.href) &&
      // Shift administrators keep only their own records.
      !(user && isShiftWorkspaceRole(user.role) && tab.href !== current),
  );

  if (tabs.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Контроль и мотивация"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
    >
      {tabs.map((tab) => {
        const isCurrent = tab.href === current;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            className={[
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
              isCurrent
                ? "border-emerald-500 text-zinc-950 dark:text-zinc-50"
                : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
