"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  DashboardRevenueBreakdown,
  DashboardRevenueDataQuality,
  DashboardRevenueSnapshot,
  DashboardStoreRevenueMetric,
} from "@/lib/dashboard-summary";

type DashboardRevenueView = "summary" | "stores";
type StoreChartMetric = "revenue" | "bar" | "guests";

type DashboardRevenuePanelProps = {
  initialView: DashboardRevenueView;
  totalClubRevenue: number;
  unallocatedTopupRevenue: number;
  revenueBreakdown: DashboardRevenueBreakdown;
  revenueSnapshot: DashboardRevenueSnapshot;
  revenueDataQuality: DashboardRevenueDataQuality;
  adjustedGrossProfit: number;
  grossProfit: number;
  adjustedMarginPercent: number;
  fullDayRevenueDate: string;
  fullDayRevenue: number;
  fullDayRevenueToAveragePercent: number | null;
  writeOffRevenuePercent: number | null;
  adjustedGrossProfitToPreviousPercent: number | null;
  storeRevenueBreakdown: DashboardStoreRevenueMetric[];
  fullReportHref: string;
  diagnosticsHref: string;
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function DashboardRevenuePanel({
  initialView,
  totalClubRevenue,
  unallocatedTopupRevenue,
  revenueBreakdown,
  revenueSnapshot,
  revenueDataQuality,
  adjustedGrossProfit,
  grossProfit,
  adjustedMarginPercent,
  fullDayRevenueDate,
  fullDayRevenue,
  fullDayRevenueToAveragePercent,
  writeOffRevenuePercent,
  adjustedGrossProfitToPreviousPercent,
  storeRevenueBreakdown,
  fullReportHref,
  diagnosticsHref,
}: DashboardRevenuePanelProps) {
  const [view, setView] = useState<DashboardRevenueView>(initialView);

  return (
    <div className="space-y-3">
      <DashboardRevenueViewToggle current={view} onChange={setView} />
      {view === "stores" ? (
        <StoreRevenueHero
          rows={storeRevenueBreakdown}
          fullReportHref={fullReportHref}
        />
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <HeroMetric
            label="Общая выручка"
            value={formatMoney(totalClubRevenue)}
            caption={
              totalClubRevenue > 0
                ? "оборот сети за выбранный период"
                : "нет общей выручки из Langame за период"
            }
          >
            <FullDayRevenue
              date={fullDayRevenueDate}
              revenue={fullDayRevenue}
              deltaPercent={fullDayRevenueToAveragePercent}
            />
            <RevenueBreakdownDetails
              breakdown={revenueBreakdown}
              snapshot={revenueSnapshot}
              quality={revenueDataQuality}
              diagnosticsHref={diagnosticsHref}
            />
            <UnallocatedTopupRevenue revenue={unallocatedTopupRevenue} />
          </HeroMetric>
          <HeroMetric
            label="Товарная прибыль после потерь"
            value={formatMoney(adjustedGrossProfit)}
            caption={`товары и бар · маржа ${formatPercent(adjustedMarginPercent)}`}
            tone={adjustedGrossProfit < grossProfit ? "warning" : "good"}
          >
            <WriteOffRevenueShare
              percent={writeOffRevenuePercent}
              profitDeltaPercent={adjustedGrossProfitToPreviousPercent}
            />
          </HeroMetric>
        </div>
      )}
    </div>
  );
}

function DashboardRevenueViewToggle({
  current,
  onChange,
}: {
  current: DashboardRevenueView;
  onChange: (view: DashboardRevenueView) => void;
}) {
  const itemClass = (isActive: boolean) =>
    [
      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
      isActive
        ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
    ].join(" ");

  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        className={itemClass(current === "summary")}
        onClick={() => onChange("summary")}
      >
        Сводка
      </button>
      <button
        type="button"
        className={itemClass(current === "stores")}
        onClick={() => onChange("stores")}
      >
        По клубам
      </button>
    </div>
  );
}

function StoreRevenueHero({
  rows,
  fullReportHref,
}: {
  rows: DashboardStoreRevenueMetric[];
  fullReportHref: string;
}) {
  const [metric, setMetric] = useState<StoreChartMetric>("revenue");
  const visibleRows = rows.slice(0, 4);
  const maxValue = Math.max(
    1,
    ...visibleRows.map((row) => storeChartValue(row, metric)),
  );
  const metricConfig = storeChartMetricConfig[metric];

  if (visibleRows.length === 0) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          По клубам
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          За выбранный период нет выручки по клубам.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Выручка по клубам
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Вертикальная гистограмма: {metricConfig.caption}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StoreChartMetricToggle current={metric} onChange={setMetric} />
          {rows.length > 4 ? (
            <Link
              href={fullReportHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Открыть чтобы увидеть все
            </Link>
          ) : null}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-[3rem_1fr] gap-3">
          <div className="flex h-56 flex-col justify-between py-2 text-right text-[11px] tabular-nums text-zinc-400">
            <span>{formatStoreChartAxisValue(maxValue, metric)}</span>
            <span>{formatStoreChartAxisValue(maxValue / 2, metric)}</span>
            <span>0</span>
          </div>
          <div className="relative h-56 overflow-hidden border-b border-l border-zinc-200 dark:border-zinc-800">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-zinc-200 dark:border-zinc-800" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-200 dark:border-zinc-800" />
            <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200 dark:border-zinc-800" />
            <div className="absolute inset-0 grid grid-cols-4 items-end gap-4 px-3 pb-2 pt-4">
              {visibleRows.map((row) => (
                <StoreRevenueColumn
                  key={row.storeId}
                  row={row}
                  metric={metric}
                  maxValue={maxValue}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          Масштаб: лидер выборки ={" "}
          <span className="font-semibold text-zinc-700 dark:text-zinc-200">
            {formatStoreChartValue(maxValue, metric)}
          </span>
        </span>
        <span>
          Показано {visibleRows.length} из {rows.length} клубов
        </span>
      </div>
    </div>
  );
}

const storeChartMetricConfig: Record<
  StoreChartMetric,
  {
    label: string;
    caption: string;
    barClassName: string;
  }
> = {
  revenue: {
    label: "Выручка",
    caption: "общая выручка клуба",
    barClassName: "bg-emerald-400",
  },
  bar: {
    label: "Бар",
    caption: "товары и бар",
    barClassName: "bg-sky-400",
  },
  guests: {
    label: "Гости",
    caption: "уникальные гости с сессиями",
    barClassName: "bg-violet-400",
  },
};

function StoreChartMetricToggle({
  current,
  onChange,
}: {
  current: StoreChartMetric;
  onChange: (metric: StoreChartMetric) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
      {(Object.keys(storeChartMetricConfig) as StoreChartMetric[]).map(
        (metric) => (
          <button
            key={metric}
            type="button"
            onClick={() => onChange(metric)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              current === metric
                ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {storeChartMetricConfig[metric].label}
          </button>
        ),
      )}
    </div>
  );
}

function StoreRevenueColumn({
  row,
  metric,
  maxValue,
}: {
  row: DashboardStoreRevenueMetric;
  metric: StoreChartMetric;
  maxValue: number;
}) {
  const value = storeChartValue(row, metric);
  const height = `${Math.max(4, Math.min(100, (value / maxValue) * 100))}%`;

  return (
    <article className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
      <p className="max-w-full truncate text-xs font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {formatStoreChartValue(value, metric)}
      </p>
      <div className="flex h-36 w-full items-end justify-center">
        <div
          className={[
            "w-full max-w-12 rounded-t-lg transition-all duration-300",
            storeChartMetricConfig[metric].barClassName,
          ].join(" ")}
          style={{ height }}
        />
      </div>
      <p className="max-w-full truncate text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        {row.storeName}
      </p>
    </article>
  );
}

function storeChartValue(
  row: DashboardStoreRevenueMetric,
  metric: StoreChartMetric,
) {
  if (metric === "bar") {
    return row.productRevenue;
  }

  if (metric === "guests") {
    return row.activeGuests;
  }

  return row.totalRevenue;
}

function formatStoreChartValue(value: number, metric: StoreChartMetric) {
  if (metric === "guests") {
    return `${formatMoney(value)} гостей`;
  }

  return `${formatMoney(value)} руб`;
}

function formatStoreChartAxisValue(value: number, metric: StoreChartMetric) {
  if (metric === "guests") {
    return formatMoney(value);
  }

  if (value >= 1000) {
    return `${formatMoney(Math.round(value / 1000))}к`;
  }

  return formatMoney(value);
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
        "flex min-w-0 flex-col rounded-2xl border p-4 sm:rounded-3xl sm:p-5",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            : "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
      ].join(" ")}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums min-[1250px]:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-sm opacity-70">{caption}</p>
      <div className="mt-auto">{children}</div>
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
        <span
          className={["text-sm font-semibold tabular-nums", deltaTone].join(
            " ",
          )}
        >
          {deltaPercent === null ? "нет базы" : formatPercent(deltaPercent)}
        </span>
      </div>
    </div>
  );
}

function RevenueBreakdownDetails({
  breakdown,
  snapshot,
  quality,
  diagnosticsHref,
}: {
  breakdown: DashboardRevenueBreakdown;
  snapshot: DashboardRevenueSnapshot;
  quality: DashboardRevenueDataQuality;
  diagnosticsHref: string;
}) {
  const gameRevenue = Math.max(
    breakdown.balanceOperationRevenue,
    breakdown.transactionSpendRevenue,
  );
  const rows = [
    {
      label: "Клубная часть",
      value: breakdown.allocatedClubRevenue,
      visible: true,
    },
    {
      label: "Игра и услуги",
      value: gameRevenue,
      visible: gameRevenue > 0,
    },
    {
      label: "Товары и бар",
      value: breakdown.productRevenue,
      visible: breakdown.productRevenue > 0,
    },
    {
      label: "Касса смен",
      value: breakdown.shiftCashRevenue,
      visible: breakdown.shiftCashRevenue > 0,
    },
  ].filter((row) => row.visible);

  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-zinc-200/70 p-3 text-xs dark:border-zinc-800/80">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <span className="text-zinc-500 dark:text-zinc-400">{row.label}</span>
          <span className="font-semibold tabular-nums">
            {formatMoney(row.value)}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800/80">
        <span
          className={[
            "rounded-full px-2 py-1 text-[11px] font-semibold",
            quality.level === "HIGH"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
              : quality.level === "MEDIUM"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200"
                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
          ].join(" ")}
          title={quality.notes.join(" ")}
        >
          {revenueSourceLabel(breakdown.primarySource)} ·{" "}
          {snapshotStatusLabel(snapshot.status)}
        </span>
        <Link
          href={diagnosticsHref}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-emerald-600 transition hover:text-emerald-500 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          Сверка
        </Link>
      </div>
    </div>
  );
}

function revenueSourceLabel(source: DashboardRevenueBreakdown["primarySource"]) {
  if (source === "SNAPSHOT") {
    return "snapshot";
  }
  if (source === "BALANCE_OPERATIONS") {
    return "списания";
  }
  if (source === "TRANSACTIONS") {
    return "транзакции";
  }
  if (source === "PRODUCTS") {
    return "товары";
  }
  return "нет данных";
}

function snapshotStatusLabel(status: DashboardRevenueSnapshot["status"]) {
  if (status === "FRESH") {
    return "свежий";
  }
  if (status === "STALE") {
    return "устарел";
  }
  if (status === "FAILED") {
    return "ошибка";
  }
  return "без snapshot";
}

function UnallocatedTopupRevenue({ revenue }: { revenue: number }) {
  if (revenue <= 0) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 px-3 py-2 text-xs dark:border-zinc-800/80">
      <span className="text-zinc-500 dark:text-zinc-400">
        Онлайн-пополнения без клуба
      </span>
      <span className="font-semibold tabular-nums">
        {formatMoney(revenue)}
      </span>
    </div>
  );
}

function WriteOffRevenueShare({
  percent,
  profitDeltaPercent,
}: {
  percent: number | null;
  profitDeltaPercent: number | null;
}) {
  const deltaTone =
    profitDeltaPercent === null
      ? "text-zinc-500"
      : profitDeltaPercent >= 0
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
        <span
          className={["text-sm font-semibold tabular-nums", deltaTone].join(
            " ",
          )}
        >
          {profitDeltaPercent === null
            ? "нет базы"
            : formatPercent(profitDeltaPercent)}
        </span>
      </div>
    </div>
  );
}
