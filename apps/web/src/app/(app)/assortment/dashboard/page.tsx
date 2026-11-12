import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { AssortmentGrowthDashboard } from "@/components/assortment-growth-dashboard";
import {
  CategoryEfficiencyChart,
  CategoryShareChart,
} from "@/components/category-analytics";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requirePageAccess } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/dashboard-summary";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function allReportsHref(scope: {
  from: string;
  to: string;
  asOf: string;
  storeIds: readonly string[];
  categoryIds: readonly string[];
  noSalesDays: 7 | 14 | 21 | 30;
}) {
  const params = new URLSearchParams({
    from: scope.from,
    to: scope.to,
    asOf: scope.asOf,
    noSalesDays: String(scope.noSalesDays),
  });
  scope.storeIds.forEach((id) => params.append("storeIds", id));
  scope.categoryIds.forEach((id) => params.append("categoryIds", id));
  return `/reports?${params}`;
}

const assortmentViews = [
  ["actions", "Что сделать"],
  ["analytics", "Динамика и прогноз"],
  ["categories", "Категории"],
] as const;

type AssortmentView = (typeof assortmentViews)[number][0];

function assortmentView(value: string | undefined): AssortmentView {
  return value === "analytics" || value === "categories" ? value : "actions";
}

// Keeps every filter in the address and swaps only the tab, so a link to a
// tab keeps the period, clubs and categories the owner picked.
function assortmentViewHref(
  params: { [key: string]: string | string[] | undefined },
  view: AssortmentView,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "view" || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  if (view !== "actions") {
    query.set("view", view);
  }
  const search = query.toString();
  return search ? `/assortment/dashboard?${search}` : "/assortment/dashboard";
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatPeriod(from: string, to: string) {
  return from === to
    ? formatDate(from)
    : `${formatDate(from)}–${formatDate(to)}`;
}

export default async function AssortmentDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requirePageAccess("/assortment/dashboard");

  const filters = {
    period: searchParam(params.period) ?? "full-day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
    categoryIds: searchParamsArray(params.categoryIds),
    asOf: searchParam(params.asOf),
    noSalesDays: ([7, 14, 21, 30] as const).includes(
      Number(searchParam(params.noSalesDays)) as 7 | 14 | 21 | 30,
    )
      ? (Number(searchParam(params.noSalesDays)) as 7 | 14 | 21 | 30)
      : 21,
    skuGrouping:
      searchParam(params.skuGrouping) === "club" ? "club" : "network",
  } as const;

  const view = assortmentView(searchParam(params.view));

  const [summary, stores, categories] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
    getCategories(),
  ]);

  return (
    <main className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <ReportBreadcrumbs
          current="Ассортимент"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <header className="mt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-3xl">
                  Рост продаж товаров
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Данные за {formatPeriod(summary.periodFrom, summary.periodTo)}
                </p>
              </div>
            </div>

            <Link
              href={allReportsHref({
                from: summary.periodFrom,
                to: summary.periodTo,
                asOf: summary.selectedAssortmentAsOf,
                storeIds: summary.selectedStoreIds,
                categoryIds: summary.selectedCategoryIds,
                noSalesDays: summary.selectedNoSalesDays,
              })}
              className="inline-flex min-h-11 w-fit items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Все отчёты
              <ArrowRight
                className="h-4 w-4"
                weight="bold"
                aria-hidden="true"
              />
            </Link>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <DashboardFilters
              period={filters.period}
              dateFrom={summary.periodFrom}
              dateTo={summary.periodTo}
              skuGrouping={summary.skuGrouping}
              stores={stores}
              selectedStoreIds={summary.selectedStoreIds}
              categories={categories}
              selectedCategoryIds={summary.selectedCategoryIds}
              showComparison
            />
          </div>
        </header>

        <nav
          aria-label="Разделы ассортимента"
          className="mt-5 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
        >
          {assortmentViews.map(([id, label]) => (
            <Link
              key={id}
              href={assortmentViewHref(params, id)}
              aria-current={view === id ? "page" : undefined}
              className={[
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition",
                view === id
                  ? "border-emerald-500 text-zinc-950 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white",
              ].join(" ")}
            >
              {label}
            </Link>
          ))}
        </nav>

        {view === "categories" ? null : (
          <div className="mt-5" data-lp-veil-target="">
            <AssortmentGrowthDashboard
              section={view}
              summary={summary}
              dashboardQuery={{
                period: filters.period,
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
                skuGrouping: filters.skuGrouping,
                asOf: filters.asOf,
              }}
            />
          </div>
        )}

        {view === "categories" ? (
          <section data-lp-veil-target="" className="mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  Категории под выбранными фильтрами
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Сравните вклад категорий в оборот
                  {summary.marginCoverage.state === "READY"
                    ? " и прибыль"
                    : "; показатели прибыли появятся после полного покрытия себестоимости"}{" "}
                  после выбора клубов и периода.
                </p>
              </div>
              <Link
                href="/reports/assortment-matrix/table"
                className="inline-flex min-h-10 w-fit items-center gap-2 text-sm font-semibold text-zinc-700 hover:text-emerald-700 dark:text-zinc-200 dark:hover:text-emerald-300"
              >
                Открыть матрицу
                <ArrowRight
                  className="h-4 w-4"
                  weight="bold"
                  aria-hidden="true"
                />
              </Link>
            </div>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <CategoryShareChart
                rows={summary.categoryAnalytics}
                profitAvailable={summary.marginCoverage.state === "READY"}
              />
              <CategoryEfficiencyChart
                rows={summary.categoryAnalytics}
                profitAvailable={summary.marginCoverage.state === "READY"}
              />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
