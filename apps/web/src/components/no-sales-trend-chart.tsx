"use client";

import { useState } from "react";
import type { DashboardSalesTrendSegment } from "@/lib/dashboard-summary";
import {
  formatTrendPeriodLabel,
  formatTrendPeriodTitle,
} from "@/lib/trend-period-labels";

type NoSalesWindow = 7 | 14 | 21;

const windows: NoSalesWindow[] = [7, 14, 21];

export function NoSalesTrendChart({
  rows,
  period,
}: {
  rows: DashboardSalesTrendSegment[];
  period: string;
}) {
  const [windowDays, setWindowDays] = useState<NoSalesWindow>(7);
  const values = rows.map((row) => getNoSalesCount(row, windowDays));
  const maxValue = Math.max(...values, 1);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            SKU без движения
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Товары на остатке без продаж за выбранное окно.
          </p>
        </div>
        <div className="flex rounded-full border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          {windows.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={[
                "rounded-full px-2.5 py-1 font-semibold transition",
                windowDays === days
                  ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {days} дн
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid h-56 grid-cols-8 items-end gap-2 pb-2">
        {rows.map((row) => {
          const value = getNoSalesCount(row, windowDays);
          const delta = getNoSalesDelta(row, windowDays);
          const height = Math.max(4, (value / maxValue) * 100);
          const periodLabel = formatTrendPeriodLabel(row, period);
          const periodTitle = formatTrendPeriodTitle(row, period);

          return (
            <div
              key={`no-sales-${row.index}`}
              className="group flex h-full flex-col justify-end gap-2"
              title={`${periodTitle}. SKU без движения ${windowDays} дн: ${formatNumber(value)}`}
            >
              <div className="min-h-12 text-center">
                <p className="text-[11px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {formatNumber(value)}
                </p>
                <p
                  className={[
                    "mt-1 text-[10px] tabular-nums",
                    delta === null
                      ? "text-zinc-400"
                      : delta <= 0
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-300",
                  ].join(" ")}
                >
                  {formatDeltaPercent(delta)}
                </p>
              </div>
              <div className="flex h-36 items-end rounded-xl border border-transparent bg-white p-1 transition-colors dark:bg-zinc-950">
                <div
                  className="w-full rounded-lg bg-amber-500 transition-all"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="min-h-6 pt-1 text-center">
                <p className="whitespace-nowrap text-[10px] leading-none text-zinc-500 dark:text-zinc-400">
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

function getNoSalesCount(
  row: DashboardSalesTrendSegment,
  windowDays: NoSalesWindow,
) {
  if (windowDays === 14) {
    return row.noSalesSkuCount14;
  }

  if (windowDays === 21) {
    return row.noSalesSkuCount21;
  }

  return row.noSalesSkuCount7;
}

function getNoSalesDelta(
  row: DashboardSalesTrendSegment,
  windowDays: NoSalesWindow,
) {
  if (windowDays === 14) {
    return row.noSalesSkuDeltaPercent14;
  }

  if (windowDays === 21) {
    return row.noSalesSkuDeltaPercent21;
  }

  return row.noSalesSkuDeltaPercent7;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
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
