import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getStaffControl, type GuestsSummaryFilters } from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatRubles(value: number) {
  return `${formatNumber(value)} руб`;
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export default async function StaffOperationsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters: GuestsSummaryFilters = {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
  };
  const report = await getStaffControl(filters);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <ReportBreadcrumbs
          current="Операционный журнал"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests/staff-control", label: "Контроль персонала" },
          ]}
        />
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Операционный журнал
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Полный срез all_operations_log за период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}. Привязки к конкретному
              администратору в текущей foundation-модели пока нет.
            </p>
          </div>
          <Link
            href={`/guests/staff-control?dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${report.storeId ? `&storeId=${report.storeId}` : ""}`}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Назад в контроль персонала
          </Link>
        </header>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              Типы операций: {formatNumber(report.operationTypes.length)}
            </h2>
          </div>
          {report.operationTypes.length > 0 ? (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {report.operationTypes.map((row) => (
                <div
                  key={row.type}
                  className="grid grid-cols-[minmax(0,1fr)_120px_160px] gap-3 px-5 py-4 text-sm"
                >
                  <p className="min-w-0 truncate font-medium">{row.type}</p>
                  <p className="text-right tabular-nums">
                    {formatNumber(row.count)}
                  </p>
                  <p className="text-right tabular-nums">
                    {formatRubles(row.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Операций за период не найдено.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
