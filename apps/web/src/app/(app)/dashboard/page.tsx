import { DashboardFilters } from "@/components/dashboard-filters";
import { ExecutiveDashboard } from "@/components/executive-dashboard";
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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function values(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function scopeMatches(
  summary: Awaited<ReturnType<typeof getExecutiveSummary>>["scope"],
  operations: ExecutiveOperations["scope"],
) {
  const sameIds = (left: readonly string[], right: readonly string[]) =>
    [...left].toSorted().join("\u0000") ===
    [...right].toSorted().join("\u0000");
  const sameComparison =
    summary.comparison === null
      ? operations.comparison === null
      : operations.comparison !== null &&
        summary.comparison.from === operations.comparison.from &&
        summary.comparison.to === operations.comparison.to;
  const sameTimeZones =
    JSON.stringify(Object.entries(summary.storeTimeZones).toSorted()) ===
    JSON.stringify(Object.entries(operations.storeTimeZones).toSorted());
  return (
    summary.period.from === operations.period.from &&
    summary.period.to === operations.period.to &&
    summary.period.timezone === operations.period.timezone &&
    summary.asOf === operations.asOf &&
    sameComparison &&
    sameIds(summary.storeIds, operations.storeIds) &&
    sameTimeZones
  );
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
    return scopeMatches(summary.scope, operations.scope) ? operations : null;
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
  const operations = await loadOperations(query, summary);
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Обзор сети
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Сводка сети
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Результат, изменения и следующие действия по выбранным клубам.
          </p>
          <div className="mt-5">
            <DashboardFilters
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
        <ExecutiveDashboard summary={summary} operations={operations} />
      </div>
    </main>
  );
}
