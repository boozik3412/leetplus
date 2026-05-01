import Link from "next/link";

export function ReportBreadcrumbs({ current }: { current: string }) {
  return (
    <nav aria-label="Навигация" className="mb-3 text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href="/dashboard"
            className="font-medium text-zinc-600 transition hover:text-zinc-950"
          >
            Дашборд
          </Link>
        </li>
        <li aria-hidden="true" className="text-zinc-300">
          /
        </li>
        <li>
          <Link
            href="/reports"
            className="font-medium text-zinc-600 transition hover:text-zinc-950"
          >
            Отчёты
          </Link>
        </li>
        <li aria-hidden="true" className="text-zinc-300">
          /
        </li>
        <li className="font-medium text-zinc-950" aria-current="page">
          {current}
        </li>
      </ol>
    </nav>
  );
}
