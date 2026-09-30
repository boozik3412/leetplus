import { DashboardFilters } from "@/components/dashboard-filters";
import {
  ExecutiveDashboard,
  ExecutivePriorities,
} from "@/components/executive-dashboard";
import { Suspense } from "react";
import { getStaffPriorities } from "@/lib/staff-priorities";
import { requireTenantWorkspaceUser } from "@/lib/auth";
import {
  ExecutiveDashboardRequestError,
  getExecutiveOperations,
  getExecutiveSummary,
  type ExecutiveOperations,
  type ExecutiveQuery,
} from "@/lib/dashboard-executive";
import { dashboardWorkspaceHref, getDefaultLandingPath } from "@/lib/landing";
import { getStores } from "@/lib/stores";
import { redirect } from "next/navigation";
import { formatClubs, formatDay, formatRange } from "@/lib/executive-format";
import { salesConfirmedThrough } from "@/lib/executive-driver-rules";
import {
  executiveScopeMatches,
  loadExecutiveHistory,
} from "@/lib/executive-history";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function StaffPrioritiesSlot({
  summary,
  operations,
  request,
}: {
  summary: Awaited<ReturnType<typeof getExecutiveSummary>>;
  operations: ExecutiveOperations | null;
  request: ReturnType<typeof getStaffPriorities>;
}) {
  return (
    <ExecutivePriorities
      summary={summary}
      operations={operations}
      staff={await request}
    />
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function values(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

async function loadOperations(
  query: ExecutiveQuery,
  summary: Awaited<ReturnType<typeof getExecutiveSummary>>,
) {
  try {
    const operations = await getExecutiveOperations({
      ...query,
      dateFrom: summary.scope.period.from,
      dateTo: summary.scope.period.to,
      storeIds: summary.scope.storeIds,
      asOf: summary.scope.asOf,
    });
    return executiveScopeMatches(summary.scope, operations.scope)
      ? operations
      : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await requireTenantWorkspaceUser();
  const landingPath = getDefaultLandingPath(user);
  if (landingPath !== dashboardWorkspaceHref) redirect(landingPath);

  const query: ExecutiveQuery = {
    period: first(params.period) ?? "full-week",
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    storeIds: values(params.storeIds),
    comparison: first(params.comparison) !== "false",
    asOf: first(params.asOf),
  };
  const [storesResult, summaryResult] = await Promise.allSettled([
    getStores(),
    getExecutiveSummary(query),
  ]);
  const stores = storesResult.status === "fulfilled" ? storesResult.value : [];

  if (summaryResult.status === "rejected") {
    const status =
      summaryResult.reason instanceof ExecutiveDashboardRequestError
        ? summaryResult.reason.status
        : null;
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <DashboardFilters
            variant="executive"
            period={query.period ?? "full-week"}
            dateFrom={query.dateFrom ?? ""}
            dateTo={query.dateTo ?? ""}
            stores={stores}
            selectedStoreIds={query.storeIds ?? []}
            showComparison
            comparison={query.comparison}
            asOf={query.asOf}
          />
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
            <h1 className="text-xl font-semibold">Сводка пока недоступна</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6">
              Не удалось прочитать сохранённые данные для этой выборки
              {status ? ` (код ${status})` : ""}. Измените фильтры или обновите
              страницу; запрос не запускает синхронизацию.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const summary = summaryResult.value;
  const salesThrough = salesConfirmedThrough(summary);
  const scopeLine = [
    formatRange(summary.scope.period.from, summary.scope.period.to),
    summary.scope.comparison
      ? `к ${formatRange(summary.scope.comparison.from, summary.scope.comparison.to)}`
      : "без сравнения",
    formatClubs(summary.scope.storeIds.length),
    salesThrough ? `продажи подтверждены по ${formatDay(salesThrough)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const staffRequest = getStaffPriorities(summary.scope.storeIds);
  const [operations, history] = await Promise.all([
    loadOperations(query, summary),
    loadExecutiveHistory(query.period, summary, (historyQuery) =>
      getExecutiveSummary(historyQuery, {
        signal: AbortSignal.timeout(15_000),
      }),
    ),
  ]);
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Сводка сети
            </h1>
            <p className="mt-1 text-sm leading-6 tabular-nums text-zinc-600 dark:text-zinc-300">
              {scopeLine}
            </p>
          </div>
          <div className="min-w-0">
            <DashboardFilters
              variant="executive"
              period={query.period ?? "full-week"}
              dateFrom={summary.scope.period.from}
              dateTo={summary.scope.period.to}
              stores={stores}
              selectedStoreIds={summary.scope.storeIds}
              showComparison
              comparison={query.comparison}
              asOf={summary.scope.asOf}
            />
          </div>
        </header>
        <ExecutiveDashboard
          initialTrend={first(params.trend)}
          summary={summary}
          operations={operations}
          history={history}
          priorities={
            <Suspense
              key={JSON.stringify(summary.scope)}
              fallback={
                <ExecutivePriorities
                  summary={summary}
                  operations={operations}
                  staffLoading
                />
              }
            >
              <StaffPrioritiesSlot
                summary={summary}
                operations={operations}
                request={staffRequest}
              />
            </Suspense>
          }
        />
      </div>
    </main>
  );
}
