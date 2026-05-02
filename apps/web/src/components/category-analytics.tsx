"use client";

import { useState } from "react";
import type { DashboardCategoryMetric } from "@/lib/dashboard-summary";

type ShareMode = "revenue" | "profit";
type EfficiencyMode = "profit" | "fill";

export function CategoryShareChart({
  rows,
}: {
  rows: DashboardCategoryMetric[];
}) {
  const [mode, setMode] = useState<ShareMode>("revenue");
  const sortedRows = [...rows]
    .sort((a, b) => shareValue(b, mode) - shareValue(a, mode))
    .slice(0, 10);
  const maxShare = Math.max(...sortedRows.map((row) => shareValue(row, mode)), 1);

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Веса категорий
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Доля каждой категории в общей {mode === "revenue" ? "выручке" : "прибыли"}.
          </p>
        </div>
        <SegmentedControl
          options={[
            { value: "revenue", label: "Выручка" },
            { value: "profit", label: "Прибыль" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {sortedRows.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {sortedRows.map((row) => {
            const value = shareValue(row, mode);
            const width = Math.max(3, (Math.max(value, 0) / maxShare) * 100);

            return (
              <div
                key={row.categoryId ?? "uncategorized"}
                className="group"
                title={`${row.categoryName}: ${formatPercent(value)} от ${
                  mode === "revenue" ? "выручки" : "прибыли"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">
                    {row.categoryName}
                  </span>
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatPercent(value)}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all group-hover:bg-emerald-400"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

export function CategoryEfficiencyChart({
  rows,
}: {
  rows: DashboardCategoryMetric[];
}) {
  const [mode, setMode] = useState<EfficiencyMode>("profit");
  const sortedRows = [...rows]
    .sort((a, b) => efficiencyValue(b, mode) - efficiencyValue(a, mode))
    .slice(0, 10);
  const maxValue = Math.max(
    ...sortedRows.map((row) => Math.max(efficiencyValue(row, mode), 0)),
    1,
  );

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Эффективность категории
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "profit"
              ? "Коэффициент: доля в прибыли / доля в выручке."
              : "Выручка категории на один активный SKU."}
          </p>
        </div>
        <SegmentedControl
          options={[
            { value: "profit", label: "Прибыль" },
            { value: "fill", label: "Наполнение" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {sortedRows.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {sortedRows.map((row) => {
            const value = efficiencyValue(row, mode);
            const width = Math.max(3, (Math.max(value, 0) / maxValue) * 100);

            return (
              <div
                key={row.categoryId ?? "uncategorized"}
                className="group"
                title={
                  mode === "profit"
                    ? `${row.categoryName}: ${formatCoefficient(row.profitEfficiency)}`
                    : `${row.categoryName}: ${formatMoney(row.fillEfficiency ?? 0)} на активный SKU`
                }
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">
                    {row.categoryName}
                  </span>
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {mode === "profit"
                      ? formatCoefficient(row.profitEfficiency)
                      : `${formatMoney(row.fillEfficiency ?? 0)} / SKU`}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all group-hover:bg-sky-400"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-fit rounded-full border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "rounded-full px-3 py-1.5 font-semibold transition",
            value === option.value
              ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      За выбранный период нет данных по категориям.
    </div>
  );
}

function shareValue(row: DashboardCategoryMetric, mode: ShareMode) {
  return mode === "revenue"
    ? row.revenueSharePercent
    : row.grossProfitSharePercent;
}

function efficiencyValue(row: DashboardCategoryMetric, mode: EfficiencyMode) {
  return mode === "profit"
    ? (row.profitEfficiency ?? 0)
    : (row.fillEfficiency ?? 0);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCoefficient(value: number | null) {
  return value === null ? "н/д" : `x${value.toFixed(2)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}
