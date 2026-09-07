import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { AssortmentGrowthDashboard } from "@/components/assortment-growth-dashboard";
import {
  CategoryEfficiencyChart,
  CategoryShareChart,
} from "@/components/category-analytics";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
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
  await requireCurrentUser();

  const filters = {
    period: searchParam(params.period) ?? "full-day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
    categoryIds: searchParamsArray(params.categoryIds),
    skuGrouping:
      searchParam(params.skuGrouping) === "club" ? "club" : "network",
  } as const;

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
              href="/reports"
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

        <div className="mt-5">
          <AssortmentGrowthDashboard summary={summary} />
        </div>

        <section className="mt-8 border-t border-zinc-200 pt-7 dark:border-zinc-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
                Детализация
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Категории под выбранными фильтрами
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Сравните вклад категорий в оборот и прибыль после выбора клубов
                и периода.
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
            <CategoryShareChart rows={summary.categoryAnalytics} />
            <CategoryEfficiencyChart rows={summary.categoryAnalytics} />
          </div>
        </section>
      </div>
    </main>
  );
}
