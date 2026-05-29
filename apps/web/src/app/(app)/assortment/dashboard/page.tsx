import Link from "next/link";
import {
  getDashboardSummary,
  type DashboardCategoryMetric,
  type DashboardSalesTrendSegment,
} from "@/lib/dashboard-summary";
import { buildAssortmentRiskSummary } from "@/lib/assortment-risk";
import { DashboardFilters } from "@/components/dashboard-filters";
import {
  CategoryEfficiencyChart,
  CategoryShareChart,
} from "@/components/category-analytics";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { frozenStockShortText } from "@/lib/frozen-stock";
import { getOperationalReport } from "@/lib/reports";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type AssortmentInsight = {
  label: string;
  value: string;
  description: string;
  tone?: "neutral" | "good" | "warning" | "danger";
  href?: string;
};

type AssortmentAction = {
  title: string;
  description: string;
  href: string;
  tone?: "neutral" | "warning" | "danger";
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatMoney(value)} руб`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatPeriod(from: string, to: string) {
  return from === to ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`;
}

function getLatestTrendSegment(rows: DashboardSalesTrendSegment[]) {
  return rows.at(-1) ?? null;
}

function findLargestCategory(
  rows: DashboardCategoryMetric[],
  key: "revenue" | "grossProfit",
) {
  return rows.reduce<DashboardCategoryMetric | null>((best, row) => {
    if (!best || row[key] > best[key]) {
      return row;
    }

    return best;
  }, null);
}

function findWeakestProfitCategory(rows: DashboardCategoryMetric[]) {
  return rows.reduce<DashboardCategoryMetric | null>((weakest, row) => {
    if (row.grossProfit <= 0) {
      return !weakest || row.grossProfit < weakest.grossProfit ? row : weakest;
    }

    if (row.profitEfficiency === null) {
      return weakest;
    }

    if (!weakest) {
      return row;
    }

    const weakestScore = weakest.profitEfficiency ?? Number.POSITIVE_INFINITY;
    return row.profitEfficiency < weakestScore ? row : weakest;
  }, null);
}

function buildAssortmentInsights({
  summary,
  categoryAnalytics,
  assortmentRiskAmount,
  assortmentRiskSkuCount,
  oosProfitAtRisk,
  frozenStockAmount,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  categoryAnalytics: DashboardCategoryMetric[];
  assortmentRiskAmount: number;
  assortmentRiskSkuCount: number;
  oosProfitAtRisk: number;
  frozenStockAmount: number;
}) {
  const topRevenueCategory = findLargestCategory(categoryAnalytics, "revenue");
  const weakestCategory = findWeakestProfitCategory(categoryAnalytics);

  return [
    {
      label: "Лидер выручки",
      value: topRevenueCategory
        ? `${topRevenueCategory.categoryName} · ${formatRubles(topRevenueCategory.revenue)}`
        : "Нет данных",
      description: topRevenueCategory
        ? `Доля категории в обороте ${formatPercent(topRevenueCategory.revenueSharePercent)}.`
        : "Продаж за выбранный период пока нет.",
      href: "/reports/top-sku/table",
    },
    {
      label: "Риск OOS",
      value: `${formatQuantity(summary.outOfStockRiskCount)} SKU`,
      description:
        summary.outOfStockRiskCount > 0
          ? "Позиции с остатком менее 3 дней продаж требуют пополнения или замены."
          : "Критических SKU с запасом менее 3 дней сейчас нет.",
      tone: summary.outOfStockRiskCount > 0 ? "danger" : "good",
      href: "/reports/oos/table",
    },
    {
      label: "Слабая прибыльность",
      value: weakestCategory
        ? `${weakestCategory.categoryName} · ${formatRubles(weakestCategory.grossProfit)}`
        : "Нет данных",
      description: weakestCategory?.profitEfficiency
        ? `Индекс эффективности прибыли ${formatPercent(weakestCategory.profitEfficiency)}.`
        : "Проверьте категории с низкой или отрицательной прибыльностью.",
      tone:
        weakestCategory && weakestCategory.grossProfit <= 0
          ? "danger"
          : "warning",
      href: "/reports/top-sku/table",
    },
    {
      label: "Деньги в риске",
      value: formatRubles(assortmentRiskAmount),
      description: `${formatQuantity(assortmentRiskSkuCount)} SKU. Формула: OOS ${formatRubles(
        oosProfitAtRisk,
      )} + замороженный остаток ${formatRubles(frozenStockAmount)}. ${frozenStockShortText}`,
      tone: assortmentRiskAmount > 0 ? "danger" : "good",
      href: "/reports/assortment-risk/table",
    },
  ] satisfies AssortmentInsight[];
}

function buildAssortmentActions({
  summary,
  latestTrend,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  latestTrend: DashboardSalesTrendSegment | null;
}) {
  const actions: AssortmentAction[] = [];

  if (summary.outOfStockRiskCount > 0) {
    actions.push({
      title: "Закрыть риск OOS",
      description: `Проверить ${formatQuantity(
        summary.outOfStockRiskCount,
      )} SKU с запасом менее 3 дней и сформировать пополнение.`,
      href: "/reports/oos/table",
      tone: "danger",
    });
  }

  if (latestTrend && latestTrend.noSalesSkuCount14 > 0) {
    actions.push({
      title: "Разобрать SKU без продаж",
      description: `${formatQuantity(
        latestTrend.noSalesSkuCount14,
      )} SKU без движения 14 дней: проверить цену, выкладку, остатки и роль в матрице.`,
      href: "/reports/no-sales/table?period=14",
      tone: "warning",
    });
  }

  if (summary.writeOffAmount > 0) {
    actions.push({
      title: "Проверить списания",
      description: `Списания за период ${formatRubles(
        summary.writeOffAmount,
      )}: найти категории и клубы, где они съедают маржу.`,
      href: "/reports",
      tone: "warning",
    });
  }

  actions.push({
    title: "Проверить матрицу ассортимента",
    description:
      "Посмотреть обязательные SKU, роли товаров, наличие по клубам, продажи и индекс качества матрицы.",
    href: "/reports/assortment-matrix/table",
  });

  actions.push({
    title: "Открыть источник для сводной",
    description:
      "Скачать общий отчет по продажам по строкам для Excel: товар, клуб, дата, цена, себестоимость, прибыль и маржа.",
    href: "/reports/sales-detail/table",
  });

  return actions;
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
    skuGrouping:
      searchParam(params.skuGrouping) === "club" ? "club" : "network",
  } as const;

  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);
  const operationalStoreId =
    summary.selectedStoreIds.length === 1 ? summary.selectedStoreIds[0] : undefined;
  const [periodOperationalReport, noSalesReport21] = await Promise.all([
    getOperationalReport({
      from: summary.periodFrom,
      to: summary.periodTo,
      storeId: operationalStoreId,
    }),
    getOperationalReport({
      ...lastFullDaysRange(21),
      storeId: operationalStoreId,
    }),
  ]);
  const categoryAnalytics = summary.categoryAnalytics ?? [];
  const latestTrend = getLatestTrendSegment(summary.salesTrend);
  const assortmentRisk = buildAssortmentRiskSummary({
    oosRows: periodOperationalReport.outOfStockRiskProducts,
    noSalesRows: noSalesReport21.productsWithoutSales,
  });
  const insights = buildAssortmentInsights({
    summary,
    categoryAnalytics,
    assortmentRiskAmount: assortmentRisk.totalRiskAmount,
    assortmentRiskSkuCount:
      assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount,
    oosProfitAtRisk: assortmentRisk.oosProfitAtRisk,
    frozenStockAmount: assortmentRisk.frozenStockAmount,
  });
  const actions = buildAssortmentActions({ summary, latestTrend });

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Дашборд ассортимента"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Ассортимент
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Дашборд управления ассортиментом
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Отдельный рабочий экран для категорийного менеджмента:
                где теряем продажи, какие SKU требуют пополнения, где
                заморожены деньги и что проверить в первую очередь.
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Период:{" "}
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatPeriod(summary.periodFrom, summary.periodTo)}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <DashboardFilters
                period={filters.period}
                dateFrom={summary.periodFrom}
                dateTo={summary.periodTo}
                skuGrouping={summary.skuGrouping}
                stores={stores}
                selectedStoreIds={summary.selectedStoreIds}
              />
              <Link
                href="/reports"
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Все отчеты
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            <AssortmentMetric
              label="Прибыль товаров"
              value={formatRubles(summary.grossProfit)}
              tone={summary.grossProfit > 0 ? "good" : "danger"}
            />
            <AssortmentMetric
              label="Маржа товаров"
              value={formatPercent(summary.marginPercent)}
              tone={summary.marginPercent > 0 ? "good" : "danger"}
            />
            <AssortmentMetric
              label="Продано товаров"
              value={`${formatQuantity(summary.soldQuantity)} шт`}
            />
            <AssortmentMetric
              label="OOS"
              value={`${formatQuantity(summary.outOfStockRiskCount)} SKU`}
              tone={summary.outOfStockRiskCount > 0 ? "danger" : "good"}
            />
            <AssortmentMetric
              label="Деньги в риске"
              value={formatRubles(assortmentRisk.totalRiskAmount)}
              tone={assortmentRisk.totalRiskAmount > 0 ? "danger" : "good"}
            />
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <AssortmentFocusPanel insights={insights} />
          <AssortmentActionsPanel actions={actions} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <CategoryShareChart rows={categoryAnalytics} />
          <CategoryEfficiencyChart rows={categoryAnalytics} />
        </section>
      </div>
    </main>
  );
}

function AssortmentMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "danger";
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-300"
            : tone === "danger"
              ? "text-red-600 dark:text-red-300"
              : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function AssortmentFocusPanel({
  insights,
}: {
  insights: AssortmentInsight[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          Главное внимание
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Сигналы ассортимента, которые требуют решения: пополнить,
          перераспределить, вывести, проверить цену или поставщика.
        </p>
      </div>
      <div className="grid gap-px bg-zinc-200 dark:bg-zinc-800 md:grid-cols-2">
        {insights.map((insight) => {
          const content = (
            <div className="h-full bg-white p-5 dark:bg-zinc-950">
              <p className="text-xs font-medium uppercase text-zinc-500">
                {insight.label}
              </p>
              <p
                className={[
                  "mt-3 text-xl font-semibold text-zinc-950 dark:text-zinc-50",
                  insight.tone === "good"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : insight.tone === "warning"
                      ? "text-amber-700 dark:text-amber-300"
                      : insight.tone === "danger"
                        ? "text-red-700 dark:text-red-300"
                        : "",
                ].join(" ")}
              >
                {insight.value}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {insight.description}
              </p>
            </div>
          );

          return insight.href ? (
            <Link
              key={insight.label}
              href={insight.href}
              className="block transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {content}
            </Link>
          ) : (
            <div key={insight.label}>{content}</div>
          );
        })}
      </div>
    </section>
  );
}

function AssortmentActionsPanel({
  actions,
}: {
  actions: AssortmentAction[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Что сделать сегодня</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Короткий список действий по ассортименту, без погружения в большие
          таблицы.
        </p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {actions.map((action, index) => (
          <Link
            key={action.title}
            href={action.href}
            className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 px-5 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
          >
            <span
              className={[
                "mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold",
                action.tone === "danger"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : action.tone === "warning"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
              ].join(" ")}
            >
              {index + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {action.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
