import Link from "next/link";

type BreadcrumbItem = {
  href: string;
  label: string;
};

export function ReportBreadcrumbs({
  current,
  items,
}: {
  current: string;
  items?: BreadcrumbItem[];
}) {
  const breadcrumbs = items ?? [
    { href: "/dashboard", label: "Дашборд" },
    { href: "/reports", label: "Отчёты" },
  ];

  return (
    <nav aria-label="Навигация" className="mb-3 text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-2">
        {breadcrumbs.map((item) => (
          <li key={item.href} className="contents">
            <Link
              href={item.href}
              className="font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {item.label}
            </Link>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
              /
            </span>
          </li>
        ))}
        <li className="font-medium text-zinc-950" aria-current="page">
          {current}
        </li>
      </ol>
    </nav>
  );
}
