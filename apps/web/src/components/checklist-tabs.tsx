import Link from "next/link";

const tabs = [
  { key: "today", href: "/staff/checklists", label: "Сегодня" },
  { key: "all", href: "/staff/checklists?tab=all", label: "Все чек-листы" },
  { key: "templates", href: "/staff/checklist-templates", label: "Шаблоны" },
  { key: "report", href: "/staff/checklists/report", label: "Отчёт" },
] as const;

export type ChecklistTab = (typeof tabs)[number]["key"];

/** Tabs of «Чек-листы» for people who check others' checklists. */
export function ChecklistTabs({ current }: { current: ChecklistTab }) {
  return (
    <nav
      aria-label="Разделы чек-листов"
      className="mt-4 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
    >
      {tabs.map((tab) =>
        tab.key === current ? (
          <span
            key={tab.key}
            aria-current="page"
            className="-mb-px shrink-0 border-b-2 border-emerald-600 px-3 py-2 text-sm font-semibold text-zinc-950 dark:border-emerald-400 dark:text-white"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={tab.href}
            className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-300 dark:hover:text-white"
          >
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
