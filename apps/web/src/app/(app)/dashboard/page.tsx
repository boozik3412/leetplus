import {
  getDashboardSummary,
  type DashboardSalesTrendSegment,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardAutoSync } from "@/components/dashboard-auto-sync";
import { DashboardQuickSyncButton } from "@/components/dashboard-quick-sync-button";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";
import { NoSalesTrendChart } from "@/components/no-sales-trend-chart";
import {
  CategoryEfficiencyChart,
  CategoryShareChart,
} from "@/components/category-analytics";
import { requireCurrentUser } from "@/lib/auth";
import { getStores } from "@/lib/stores";
import Link from "next/link";

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatShortDate(value: string) {
  const date = parseDateInput(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatDashboardPeriodHighlight(from: string, to: string) {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  if (!fromDate || !toDate) {
    return null;
  }

  if (
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth()
  ) {
    return new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(fromDate);
  }

  return null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requireCurrentUser();
  const filters = {
    period: searchParam(params.period) ?? "month",
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
  const highlightedPeriod = formatDashboardPeriodHighlight(
    summary.periodFrom,
    summary.periodTo,
  );
  const categoryAnalytics = summary.categoryAnalytics ?? [];

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <DashboardAutoSync />
      <div className="mx-auto max-w-7xl">
        <section className="overflow-visible rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-6 p-5 min-[1250px]:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <DashboardFilters
                  period={filters.period}
                  dateFrom={summary.periodFrom}
                  dateTo={summary.periodTo}
                  skuGrouping={summary.skuGrouping}
                  stores={stores}
                  selectedStoreIds={summary.selectedStoreIds}
                />
                <DashboardQuickSyncButton />
              </div>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 min-[1250px]:text-4xl">
                {summary.tenantName}: операционная картина ассортимента
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Период -{" "}
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {highlightedPeriod ?? `${summary.periodFrom} — ${summary.periodTo}`}
                </span>
                .
              </p>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 min-[1250px]:grid min-[1250px]:grid-cols-2 min-[1250px]:overflow-visible min-[1250px]:pb-0">
              <HeroMetric
                label="Выручка"
                value={formatMoney(summary.totalRevenue)}
                caption="оборот за выбранный период"
              >
                <FullDayRevenue
                  date={summary.fullDayRevenueDate}
                  revenue={summary.fullDayRevenue}
                  deltaPercent={summary.fullDayRevenueToAveragePercent}
                />
              </HeroMetric>
              <HeroMetric
                label="Прибыль с потерями"
                value={formatMoney(summary.adjustedGrossProfit)}
                caption={`маржа ${formatPercent(summary.adjustedMarginPercent)}`}
                tone={
                  summary.adjustedGrossProfit < summary.grossProfit
                    ? "warning"
                    : "good"
                }
              >
                <WriteOffRevenueShare
                  percent={summary.writeOffRevenuePercent}
                  deltaPercent={summary.writeOffRevenuePercentDelta}
                />
              </HeroMetric>
            </div>
          </div>

          <div className="grid border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-4">
            <SignalMetric
              label="Продано"
              value={formatQuantity(summary.soldQuantity)}
              suffix="шт"
              href="/reports/top-sku/table"
            />
            <SignalMetric
              label="Списания"
              value={formatMoney(summary.writeOffAmount)}
              tone="danger"
              href="/reports"
            />
            <SignalMetric
              label="Остатки"
              value={formatQuantity(summary.stockQuantity)}
              suffix="шт"
              href="/products"
            />
            <SignalMetric
              label="Риск out-of-stock"
              compactLabel="OOS"
              value={formatQuantity(summary.outOfStockRiskCount)}
              suffix="SKU"
              tone={summary.outOfStockRiskCount > 0 ? "danger" : "good"}
              href="/reports/oos/table"
            />
          </div>
        </section>

        <SalesTrendPanel
          rows={summary.salesTrend}
          period={filters.period}
          canShowRevenueShare={summary.selectedStoreIds.length === 0}
        />

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <CategoryShareChart rows={categoryAnalytics} />
          <CategoryEfficiencyChart rows={categoryAnalytics} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <InsightCard
            href="/reports#replenishment"
            label="Остатки менее 3-х дней продаж"
            value={`${formatQuantity(summary.outOfStockRiskCount)} SKU`}
            description="Перейти к полному отчёту по остаткам, дням запаса и рекомендованному заказу по SKU."
          />
          <InsightCard
            label="Активный ассортимент"
            value={`${formatQuantity(summary.activeSku)} / ${formatQuantity(
              summary.totalSku,
            )}`}
            description="SKU с текущим остатком или продажами за последние 14 дней."
            tooltip="Товары с остатками либо с продажами за последние 14 дней"
          />
          <InsightCard
            label="Возвраты"
            value={formatMoney(summary.returnAmount)}
            description="Сумма возвратов за выбранный период, учтённая в прибыльности."
          />
        </section>

        <TopSkuTable
          rows={summary.topSkuByRevenue}
          grouping={summary.skuGrouping}
          period={filters.period}
          dateFrom={summary.periodFrom}
          dateTo={summary.periodTo}
          selectedStoreIds={summary.selectedStoreIds}
        />
      </div>
    </main>
  );
}

function HeroMetric({
  label,
  value,
  caption,
  tone = "neutral",
  children,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "warning";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "min-w-[220px] flex-1 rounded-3xl border p-5 min-[1250px]:min-w-0",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            : "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
      ].join(" ")}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-3 whitespace-nowrap text-2xl font-semibold tabular-nums min-[1250px]:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-sm opacity-70">{caption}</p>
      {children}
    </div>
  );
}

function FullDayRevenue({
  date,
  revenue,
  deltaPercent,
}: {
  date: string;
  revenue: number;
  deltaPercent: number | null;
}) {
  const deltaTone =
    deltaPercent === null
      ? "text-zinc-500"
      : deltaPercent >= 0
        ? "text-emerald-600 dark:text-emerald-300"
        : "text-red-600 dark:text-red-300";

  return (
    <div className="mt-4 grid gap-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800/80">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Полные сутки {formatShortDate(date)}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(revenue)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          К среднесуточной
        </span>
        <span className={["text-sm font-semibold tabular-nums", deltaTone].join(" ")}>
          {deltaPercent === null ? "нет базы" : formatPercent(deltaPercent)}
        </span>
      </div>
    </div>
  );
}

function WriteOffRevenueShare({
  percent,
  deltaPercent,
}: {
  percent: number | null;
  deltaPercent: number | null;
}) {
  const deltaTone =
    deltaPercent === null
      ? "text-zinc-500"
      : deltaPercent <= 0
        ? "text-emerald-600 dark:text-emerald-300"
        : "text-red-600 dark:text-red-300";

  return (
    <div className="mt-4 grid gap-2 border-t border-zinc-200/70 pt-3 dark:border-zinc-800/80">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Списания / выручка
        </span>
        <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-300">
          {percent === null ? "нет базы" : formatPercent(percent)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          К предыдущему периоду
        </span>
        <span className={["text-sm font-semibold tabular-nums", deltaTone].join(" ")}>
          {deltaPercent === null ? "нет базы" : formatSignedPercent(deltaPercent)}
        </span>
      </div>
    </div>
  );
}

function SalesTrendPanel({
  rows,
  period,
  canShowRevenueShare,
}: {
  rows: DashboardSalesTrendSegment[];
  period: string;
  canShowRevenueShare: boolean;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Динамика продаж</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              8 отрезков выбранного периода: деньги, штуки и изменение к
              предыдущему отрезку.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-2">
        <div className="grid gap-6">
          <RevenueTrendChart
            rows={rows}
            period={period}
            canShowShare={canShowRevenueShare}
          />
          <NoSalesTrendChart rows={rows} />
        </div>
        <div className="grid gap-6">
          <TrendChart
            title="Продано, шт"
            rows={rows}
            getValue={(row) => row.soldQuantity}
            getDelta={(row) => row.quantityDeltaPercent}
            formatValue={formatQuantity}
            tone="quantity"
            period={period}
          />
          <TrendChart
            title="OOS, SKU"
            description="SKU с риском out-of-stock"
            rows={rows}
            getValue={(row) => row.outOfStockSkuCount}
            getDelta={(row) => row.outOfStockSkuDeltaPercent}
            formatValue={formatQuantity}
            tone="danger"
            period={period}
            deltaDirection="lowerGood"
          />
        </div>
      </div>
    </section>
  );
}

function TrendChart({
  title,
  description,
  rows,
  getValue,
  getDelta,
  formatValue,
  tone,
  period,
  deltaDirection = "higherGood",
}: {
  title: string;
  description?: string;
  rows: DashboardSalesTrendSegment[];
  getValue: (row: DashboardSalesTrendSegment) => number;
  getDelta: (row: DashboardSalesTrendSegment) => number | null;
  formatValue: (value: number) => string;
  tone: "money" | "quantity" | "warning" | "danger";
  period: string;
  deltaDirection?: "higherGood" | "lowerGood";
}) {
  const maxValue = Math.max(...rows.map(getValue), 1);
  const colorClass =
    tone === "money"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "danger"
          ? "bg-red-500"
          : "bg-sky-500";

  return (
    <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      <div className="mt-4 grid h-56 grid-cols-8 items-end gap-2">
        {rows.map((row) => {
          const value = getValue(row);
          const height = Math.max(4, (value / maxValue) * 100);
          const delta = getDelta(row);
          const weekday = getDailyWeekday(row.from, period);
          const isGood =
            delta !== null &&
            delta !== 0 &&
            (deltaDirection === "higherGood" ? delta > 0 : delta < 0);

          return (
            <div
              key={`${title}-${row.index}`}
              className="group flex h-full flex-col justify-end gap-2"
              title={weekday?.fullLabel}
            >
              <div className="min-h-12 text-center">
                <p className="text-[11px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {formatValue(value)}
                </p>
                <p
                  className={[
                    "mt-1 text-[10px] tabular-nums",
                    delta === null
                      ? "text-zinc-400"
                      : delta === 0
                        ? "text-zinc-400"
                        : isGood
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-300",
                  ].join(" ")}
                >
                  {formatDelta(delta)}
                </p>
              </div>
              <div
                className={[
                  "flex h-36 items-end rounded-xl border p-1 transition-colors",
                  weekday?.isAccent
                    ? weekday.containerClass
                    : "border-transparent bg-white dark:bg-zinc-950",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-full rounded-lg transition-all",
                    colorClass,
                  ].join(" ")}
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="min-h-8 text-center">
                {weekday ? (
                  <p
                    className={[
                      "mx-auto mb-1 w-fit rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase opacity-0 transition-opacity group-hover:opacity-100",
                      weekday.badgeClass,
                    ].join(" ")}
                  >
                    {weekday.shortLabel}
                  </p>
                ) : null}
                <p
                  className={[
                    "truncate text-[10px]",
                    weekday?.isAccent
                      ? weekday.labelClass
                      : "text-zinc-500 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {row.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDailyWeekday(dateValue: string, period: string) {
  if (period !== "day") {
    return null;
  }

  const date = parseDateInput(dateValue);

  if (!date) {
    return null;
  }

  const weekdays = [
    { shortLabel: "вскр", fullLabel: "Воскресенье" },
    { shortLabel: "пн", fullLabel: "Понедельник" },
    { shortLabel: "вт", fullLabel: "Вторник" },
    { shortLabel: "ср", fullLabel: "Среда" },
    { shortLabel: "чт", fullLabel: "Четверг" },
    { shortLabel: "пт", fullLabel: "Пятница" },
    { shortLabel: "сб", fullLabel: "Суббота" },
  ] as const;
  const weekday = date.getUTCDay();
  const accent =
    weekday === 5
      ? {
          containerClass:
            "border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30",
          badgeClass:
            "bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200",
          labelClass: "font-semibold text-amber-700 dark:text-amber-300",
        }
      : weekday === 6
        ? {
            containerClass:
              "border-orange-200 bg-orange-50 dark:border-orange-900/70 dark:bg-orange-950/30",
            badgeClass:
              "bg-orange-100 text-orange-800 dark:bg-orange-900/70 dark:text-orange-200",
            labelClass: "font-semibold text-orange-700 dark:text-orange-300",
          }
        : weekday === 0
          ? {
              containerClass:
                "border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30",
              badgeClass:
                "bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200",
              labelClass: "font-semibold text-red-700 dark:text-red-300",
            }
          : null;

  return {
    ...weekdays[weekday],
    isAccent: Boolean(accent),
    containerClass: accent?.containerClass ?? "",
    badgeClass:
      accent?.badgeClass ??
      "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300",
    labelClass: accent?.labelClass ?? "",
  };
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "нов.";
  }

  if (value === 0) {
    return "0%";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function SignalMetric({
  label,
  compactLabel,
  value,
  suffix,
  tone = "neutral",
  href,
}: {
  label: string;
  compactLabel?: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "good" | "danger";
  href?: string;
}) {
  const content = (
    <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 md:border-b-0 md:border-r last:md:border-r-0">
      <p
        className="text-xs font-medium uppercase tracking-wide text-zinc-500"
        title={compactLabel ? label : undefined}
      >
        {compactLabel ? (
          <>
            <span className="min-[1250px]:hidden">{compactLabel}</span>
            <span className="hidden min-[1250px]:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "danger"
              ? "text-red-700 dark:text-red-300"
              : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
        {suffix ? <span className="ml-1 text-sm text-zinc-500">{suffix}</span> : null}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block transition-colors hover:bg-zinc-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:hover:bg-zinc-900/70"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function InsightCard({
  href,
  label,
  value,
  description,
  tooltip,
}: {
  href?: string;
  label: string;
  value: string;
  description: string;
  tooltip?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={tooltip}
        className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      title={tooltip}
      className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      {content}
    </div>
  );
}

function TopSkuTable({
  rows,
  grouping,
  period,
  dateFrom,
  dateTo,
  selectedStoreIds,
}: {
  rows: DashboardTopSku[];
  grouping: "club" | "network";
  period: string;
  dateFrom: string;
  dateTo: string;
  selectedStoreIds: string[];
}) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">ТОП-10 SKU по выручке</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {grouping === "network"
                ? "По умолчанию показаны данные по всей сети с учетом спарсенных товаров."
                : "Позиции показаны отдельно по каждому клубу."}
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <div className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-50 p-1 text-xs font-semibold dark:border-zinc-800 dark:bg-zinc-900">
              <TopSkuGroupingLink
                label="По сети"
                isActive={grouping === "network"}
                href={buildDashboardHref({
                  period,
                  dateFrom,
                  dateTo,
                  selectedStoreIds,
                  skuGrouping: "network",
                })}
              />
              <TopSkuGroupingLink
                label="По клубам"
                isActive={grouping === "club"}
                href={buildDashboardHref({
                  period,
                  dateFrom,
                  dateTo,
                  selectedStoreIds,
                  skuGrouping: "club",
                })}
              />
            </div>
            <div className="hidden grid-cols-[120px_96px_120px] gap-4 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400 md:grid">
              <span>Выручка</span>
              <span>Продано</span>
              <span>Прибыль</span>
            </div>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => (
            <div
              key={`${row.productId}-${row.storeId ?? "network"}-${index}`}
              className="grid gap-3 px-4 py-4 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/45 md:grid-cols-[40px_minmax(0,1fr)_120px_96px_120px] md:items-center"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {row.name}
                  </p>
                  {row.isCanonical ? <NetworkSkuBadge /> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {grouping === "club" ? (
                    <span className="truncate font-medium text-zinc-600 dark:text-zinc-300">
                      {row.storeName ?? "—"}
                    </span>
                  ) : (
                    <span>По сети</span>
                  )}
                  <span className="tabular-nums md:hidden">
                    выручка {formatMoney(row.revenue)}
                  </span>
                  <span className="tabular-nums md:hidden">
                    {formatQuantity(row.soldQuantity)} шт
                  </span>
                  <span className="tabular-nums md:hidden">
                    прибыль {formatMoney(row.grossProfit)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (row.revenue / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="hidden text-right text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50 md:block">
                {formatMoney(row.revenue)}
              </p>
              <p className="hidden text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 md:block">
                {formatQuantity(row.soldQuantity)}
              </p>
              <p className="hidden text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 md:block">
                {formatMoney(row.grossProfit)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж за выбранный период пока нет.
        </p>
      )}
    </section>
  );
}

function buildDashboardHref({
  period,
  dateFrom,
  dateTo,
  selectedStoreIds,
  skuGrouping,
}: {
  period: string;
  dateFrom: string;
  dateTo: string;
  selectedStoreIds: string[];
  skuGrouping: "club" | "network";
}) {
  const params = new URLSearchParams();

  params.set("period", period);
  params.set("skuGrouping", skuGrouping);

  if (period === "custom") {
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
  }

  selectedStoreIds.forEach((storeId) => {
    params.append("storeIds", storeId);
  });

  return `/dashboard?${params.toString()}`;
}

function TopSkuGroupingLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "rounded-full px-3 py-1.5 transition-colors",
        isActive
          ? "bg-zinc-950 text-white shadow-sm dark:bg-emerald-400 dark:text-zinc-950"
          : "text-zinc-500 hover:bg-white hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function NetworkSkuBadge() {
  return (
    <span
      title="Товар является сетевым: составлен из одинаковых товаров, но с разными названиями в разных клубах."
      aria-label="Сетевой товар"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
    >
      ⇄
    </span>
  );
}
