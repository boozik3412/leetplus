import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getDashboardSummary,
  type DashboardStoreRevenueMetric,
} from "@/lib/dashboard-summary";
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPeriod(from: string, to: string) {
  return from === to
    ? formatPeriodDate(from)
    : `${formatPeriodDate(from)} - ${formatPeriodDate(to)}`;
}

function dashboardHref(filters: {
  period: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds: readonly string[];
}) {
  const params = new URLSearchParams();

  params.set("period", filters.period);

  if (filters.period === "custom") {
    if (filters.dateFrom) {
      params.set("dateFrom", filters.dateFrom);
    }

    if (filters.dateTo) {
      params.set("dateTo", filters.dateTo);
    }
  }

  params.set("revenueView", "stores");

  filters.storeIds.forEach((storeId) => {
    params.append("storeIds", storeId);
  });

  const query = params.toString();

  return `/dashboard${query ? `?${query}` : ""}`;
}

function revenueByClubCanonicalHref(params: {
  period?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  storeIds?: string | string[];
}) {
  const canonicalParams = new URLSearchParams();
  const period = searchParam(params.period);

  if (period) {
    canonicalParams.set("period", period);
  }

  if (period === "custom") {
    const dateFrom = searchParam(params.dateFrom);
    const dateTo = searchParam(params.dateTo);

    if (dateFrom) {
      canonicalParams.set("dateFrom", dateFrom);
    }

    if (dateTo) {
      canonicalParams.set("dateTo", dateTo);
    }
  }

  searchParamsArray(params.storeIds).forEach((storeId) => {
    canonicalParams.append("storeIds", storeId);
  });

  const query = canonicalParams.toString();

  return `/dashboard/revenue-by-club${query ? `?${query}` : ""}`;
}

export default async function DashboardRevenueByClubPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (params.skuGrouping !== undefined) {
    redirect(revenueByClubCanonicalHref(params));
  }

  await requireCurrentUser();

  const filters = {
    period: searchParam(params.period) ?? "full-day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
  } as const;

  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);
  const rows = summary.storeRevenueBreakdown;
  const maxRevenue = Math.max(
    1,
    ...rows.flatMap((row) => [row.totalRevenue, row.productRevenue]),
  );
  const backHref = dashboardHref({
    ...filters,
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
  });

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Выручка по клубам"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-500">
              Сводный дашборд
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Выручка по клубам
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Инфографика по всем клубам за период{" "}
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                {formatPeriod(summary.periodFrom, summary.periodTo)}
              </span>
              : общая выручка сети и товарная часть “Товары и бар”.
            </p>
          </div>
          <Link
            href={backHref}
            className="rounded-lg border border-zinc-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Назад в дашборд
          </Link>
        </div>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <DashboardFilters
            period={filters.period}
            dateFrom={summary.periodFrom}
            dateTo={summary.periodTo}
            stores={stores}
            selectedStoreIds={summary.selectedStoreIds}
          />
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Клубы: {rows.length}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Чем длиннее полоса, тем выше показатель относительно лидера
                  текущей выборки.
                </p>
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500 dark:text-zinc-400">
              За выбранный период нет данных по клубам.
            </div>
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-4">
              {rows.map((row) => (
                <StoreRevenueReportCard
                  key={row.storeId}
                  row={row}
                  maxRevenue={maxRevenue}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StoreRevenueReportCard({
  row,
  maxRevenue,
}: {
  row: DashboardStoreRevenueMetric;
  maxRevenue: number;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
        {row.storeName}
      </h3>
      <div className="mt-4 grid gap-3">
        <RevenueLine
          label="Общая выручка"
          value={row.totalRevenue}
          maxValue={maxRevenue}
          tone="total"
        />
        <RevenueLine
          label="Товары и бар"
          value={row.productRevenue}
          maxValue={maxRevenue}
          tone="product"
        />
      </div>
      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
          Доля товаров и бара
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {row.productRevenueSharePercent === null
            ? "нет данных"
            : formatPercent(row.productRevenueSharePercent)}
        </p>
      </div>
    </article>
  );
}

function RevenueLine({
  label,
  value,
  maxValue,
  tone,
}: {
  label: string;
  value: number;
  maxValue: number;
  tone: "total" | "product";
}) {
  const width = `${Math.max(2, Math.min(100, (value / maxValue) * 100))}%`;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="font-semibold tabular-nums">
          {formatMoney(value)} руб
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={[
            "h-full rounded-full",
            tone === "total" ? "bg-emerald-400" : "bg-sky-400",
          ].join(" ")}
          style={{ width }}
        />
      </div>
    </div>
  );
}
