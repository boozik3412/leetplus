import {
  getDashboardSummary,
  type DashboardSalesTrendSegment,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardQuickSyncButton } from "@/components/dashboard-quick-sync-button";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";
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
      searchParam(params.skuGrouping) === "network" ? "network" : "club",
  } as const;
  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);
  const selectedStoresLabel =
    summary.selectedStoreIds.length === 0
      ? "Вся сеть"
      : stores
          .filter((store) => summary.selectedStoreIds.includes(store.id))
          .map((store) => store.name)
          .join(", ");

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <span>{summary.periodLabel} · {selectedStoresLabel}</span>
                <span className="mx-2 text-emerald-300 dark:text-emerald-700">
                  ·
                </span>
                <DashboardQuickSyncButton />
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {summary.tenantName}: операционная картина ассортимента
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Период {summary.periodFrom} — {summary.periodTo}. В фокусе
                продажи, прибыльность, потери, риск дефицита и товары, которые
                формируют оборот.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="Выручка"
                value={formatMoney(summary.totalRevenue)}
                caption="оборот за выбранный период"
              />
              <HeroMetric
                label="Прибыль с потерями"
                value={formatMoney(summary.adjustedGrossProfit)}
                caption={`маржа ${formatPercent(summary.adjustedMarginPercent)}`}
                tone={
                  summary.adjustedGrossProfit < summary.grossProfit
                    ? "warning"
                    : "good"
                }
              />
            </div>
          </div>

          <div className="grid border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-4">
            <SignalMetric
              label="Продано"
              value={formatQuantity(summary.soldQuantity)}
              suffix="шт"
            />
            <SignalMetric
              label="Списания"
              value={formatMoney(summary.writeOffAmount)}
              tone="danger"
            />
            <SignalMetric
              label="Остатки"
              value={formatQuantity(summary.stockQuantity)}
              suffix="шт"
            />
            <SignalMetric
              label="Риск out-of-stock"
              value={formatQuantity(summary.outOfStockRiskCount)}
              suffix="SKU"
              tone={summary.outOfStockRiskCount > 0 ? "danger" : "good"}
            />
          </div>
        </section>

        <DashboardFilters
          period={filters.period}
          dateFrom={summary.periodFrom}
          dateTo={summary.periodTo}
          skuGrouping={summary.skuGrouping}
          stores={stores}
          selectedStoreIds={summary.selectedStoreIds}
        />

        <SalesTrendPanel rows={summary.salesTrend} period={filters.period} />

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
            description="Количество активных SKU относительно всего импортированного ассортимента."
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
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-3xl border p-5",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            : "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
      ].join(" ")}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm opacity-70">{caption}</p>
    </div>
  );
}

function SalesTrendPanel({
  rows,
  period,
}: {
  rows: DashboardSalesTrendSegment[];
  period: string;
}) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.soldQuantity, 0);

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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Итого: {formatMoney(totalRevenue)} · {formatQuantity(totalQuantity)} шт
          </p>
        </div>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-2">
        <RevenueTrendChart rows={rows} period={period} />
        <TrendChart
          title="Продано, шт"
          rows={rows}
          getValue={(row) => row.soldQuantity}
          getDelta={(row) => row.quantityDeltaPercent}
          formatValue={formatQuantity}
          tone="quantity"
          period={period}
        />
      </div>
    </section>
  );
}

function TrendChart({
  title,
  rows,
  getValue,
  getDelta,
  formatValue,
  tone,
  period,
}: {
  title: string;
  rows: DashboardSalesTrendSegment[];
  getValue: (row: DashboardSalesTrendSegment) => number;
  getDelta: (row: DashboardSalesTrendSegment) => number | null;
  formatValue: (value: number) => string;
  tone: "money" | "quantity";
  period: string;
}) {
  const maxValue = Math.max(...rows.map(getValue), 1);
  const colorClass = tone === "money" ? "bg-emerald-500" : "bg-sky-500";

  return (
    <div className="rounded-3xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
      </h3>
      <div className="mt-4 grid h-56 grid-cols-8 items-end gap-2">
        {rows.map((row) => {
          const value = getValue(row);
          const height = Math.max(4, (value / maxValue) * 100);
          const delta = getDelta(row);
          const weekday = getDailyWeekday(row.from, period);

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
                      : delta >= 0
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
  value,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "good" | "danger";
}) {
  return (
    <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 md:border-b-0 md:border-r last:md:border-r-0">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
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
}

function InsightCard({
  href,
  label,
  value,
  description,
}: {
  href?: string;
  label: string;
  value: string;
  description: string;
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
        className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {content}
    </div>
  );
}

function TopSkuTable({
  rows,
  grouping,
}: {
  rows: DashboardTopSku[];
  grouping: "club" | "network";
}) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">ТОП-10 SKU по выручке</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {grouping === "network"
            ? "Товары суммируются по всей сети при совпадении названия или артикула."
            : "Позиции показаны отдельно по каждому клубу."}
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => (
            <div
              key={row.productId}
              className="grid gap-4 px-5 py-4 lg:grid-cols-[48px_1fr_180px_160px]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {row.name}
                  </p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-900">
                    {row.article}
                  </span>
                </div>
                {grouping === "club" ? (
                  <p className="mt-1 text-sm text-zinc-500">
                    {row.storeName ?? "—"}
                  </p>
                ) : null}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (row.revenue / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs text-zinc-500">Выручка</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatMoney(row.revenue)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm lg:block lg:text-right">
                <div>
                  <p className="text-xs text-zinc-500">Продано</p>
                  <p className="mt-1 font-medium tabular-nums">
                    {formatQuantity(row.soldQuantity)}
                  </p>
                </div>
                <div className="lg:mt-3">
                  <p className="text-xs text-zinc-500">Прибыль</p>
                  <p className="mt-1 font-medium tabular-nums">
                    {formatMoney(row.grossProfit)}
                  </p>
                </div>
              </div>
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
