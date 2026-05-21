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

function formatDate(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPeriodDate(value: string) {
  return formatDate(`${value}T00:00:00.000Z`);
}

export default async function StaffDiagnosticsReportPage({
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
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Диагностика связки"
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
              Диагностика связки персонала
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Полный диагностический отчет за период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}. Сохраняем только имена полей
              и количество заполненных строк, без значений из Langame.
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
          {report.diagnostics.latestRuns.length > 0 ? (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {report.diagnostics.latestRuns.map((run) => (
                <div key={`${run.domain}-${run.startedAt}`} className="px-5 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{run.domain}</p>
                      <p className="text-xs text-zinc-500">
                        {formatDate(run.startedAt)}
                      </p>
                    </div>
                    {Object.keys(run.endpointErrors).length > 0 ? (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-300">
                        Есть недоступные endpoints
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
                    <DiagnosticSource
                      title="all_operations_log"
                      total={run.operationLogs.total}
                      fields={run.operationLogs.candidateFields}
                    />
                    <DiagnosticSource
                      title="log_cash_transaction"
                      total={run.cashTransactions.total}
                      fields={run.cashTransactions.candidateFields}
                    />
                    <DiagnosticSource
                      title="working_shifts"
                      total={run.workingShifts.total}
                      fields={run.workingShifts.candidateFields}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Диагностика появится после следующей синхронизации гостей.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function DiagnosticSource({
  title,
  total,
  fields,
}: {
  title: string;
  total: number;
  fields: Record<string, number>;
}) {
  const entries = Object.entries(fields).sort(
    (first, second) => second[1] - first[1],
  );

  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <p className="break-all text-sm font-semibold">{title}</p>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {formatNumber(total)}
        </span>
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entries.map(([field, count]) => (
            <span
              key={field}
              className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {field}: {formatNumber(count)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">Поля персонала пока не найдены.</p>
      )}
    </div>
  );
}
