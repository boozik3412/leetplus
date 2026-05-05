"use client";

import { useState } from "react";
import type { DashboardSalesTrendSegment } from "@/lib/dashboard-summary";
import {
  formatTrendPeriodLabel,
  formatTrendPeriodTitle,
} from "@/lib/trend-period-labels";

type RevenueMode = "money" | "share";

export function RevenueTrendChart({
  rows,
  period,
  canShowShare,
}: {
  rows: DashboardSalesTrendSegment[];
  period: string;
  canShowShare: boolean;
}) {
  const [mode, setMode] = useState<RevenueMode>("money");
  const activeMode = canShowShare ? mode : "money";
  const values = rows.map((row) =>
    activeMode === "money" ? row.revenue : (row.revenueSharePercent ?? 0),
  );
  const maxValue = Math.max(...values, activeMode === "money" ? 1 : 100);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Выручка
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {activeMode === "money"
              ? "Товарная выручка ассортимента"
              : "Доля ассортимента в общей выручке клубов"}
          </p>
        </div>
        {canShowShare ? (
          <div className="flex rounded-full border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setMode("money")}
              className={[
                "rounded-full px-2.5 py-1 font-semibold transition",
                activeMode === "money"
                  ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              ₽
            </button>
            <button
              type="button"
              onClick={() => setMode("share")}
              className={[
                "rounded-full px-2.5 py-1 font-semibold transition",
                activeMode === "share"
                  ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              %
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid h-56 grid-cols-8 items-end gap-2 pb-2">
        {rows.map((row, index) => {
          const value = values[index] ?? 0;
          const height = Math.max(4, (value / maxValue) * 100);
          const weekday = getDailyWeekday(row.from, period);
          const periodLabel = formatTrendPeriodLabel(row, period);
          const periodTitle = formatTrendPeriodTitle(row, period);
          const previous = rows[index - 1];
          const delta =
            activeMode === "money"
              ? row.revenueDeltaPercent
              : previous?.revenueSharePercent !== null &&
                  previous?.revenueSharePercent !== undefined &&
                  row.revenueSharePercent !== null
                ? row.revenueSharePercent - previous.revenueSharePercent
                : null;

          return (
            <div
              key={`revenue-${row.index}`}
              className="group flex h-full flex-col justify-end gap-2"
              title={revenueTooltip(row, activeMode, periodTitle)}
            >
              <div className="min-h-12 text-center">
                <p className="text-[11px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {activeMode === "money"
                    ? formatMoney(row.revenue)
                    : formatShare(row.revenueSharePercent)}
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
                  {activeMode === "money"
                    ? formatDeltaPercent(delta)
                    : formatDeltaPoints(delta)}
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
                  className="w-full rounded-lg bg-emerald-500 transition-all"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="min-h-6 pt-1 text-center">
                <p
                  className={[
                    "whitespace-nowrap text-[10px] leading-none",
                    weekday?.isAccent
                      ? weekday.labelClass
                      : "text-zinc-500 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {periodLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function revenueTooltip(
  row: DashboardSalesTrendSegment,
  mode: RevenueMode,
  weekday?: string,
) {
  const base = weekday ? `${weekday}. ` : "";

  if (mode === "money") {
    return `${base}Товарная выручка: ${formatMoney(row.revenue)}`;
  }

  return `${base}Доля ассортимента: ${formatShare(row.revenueSharePercent)} от общей выручки ${formatMoney(row.clubRevenue)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShare(value: number | null) {
  return value === null ? "н/д" : `${value.toFixed(1)}%`;
}

function formatDeltaPercent(value: number | null) {
  if (value === null) {
    return "нов.";
  }

  if (value === 0) {
    return "0%";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDeltaPoints(value: number | null) {
  if (value === null) {
    return "н/д";
  }

  if (value === 0) {
    return "0 п.п.";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)} п.п.`;
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
