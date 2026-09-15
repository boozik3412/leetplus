"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExecutiveSummary } from "@/lib/dashboard-executive";

type TrendMode = "revenue" | "visits";

function day(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

function number(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function money(value: number) {
  return `${number(value)} ₽`;
}

export function ExecutiveTrendChart({
  summary,
}: {
  summary: ExecutiveSummary;
}) {
  const [mode, setMode] = useState<TrendMode>("revenue");
  const rows = useMemo(
    () =>
      summary.days.map((row) => ({
        date: day(row.date),
        revenue: row.metrics.revenue.value,
        revenuePrevious: row.metrics.revenue.comparison?.previousValue ?? null,
        visits: row.metrics.visits.value,
        visitsPrevious: row.metrics.visits.comparison?.previousValue ?? null,
      })),
    [summary.days],
  );
  const key = mode === "revenue" ? "revenue" : "visits";
  const previousKey = mode === "revenue" ? "revenuePrevious" : "visitsPrevious";
  const label = mode === "revenue" ? "Выручка" : "Визиты";
  const unit = mode === "revenue" ? "₽" : "визитов";
  const hasPrevious =
    summary.scope.comparison !== null &&
    rows.some((row) => row[previousKey] !== null);
  const formatValue = (value: number) =>
    mode === "revenue" ? money(value) : number(value);

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Динамика периода
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            По дням выбранного периода
          </p>
        </div>
        <div
          className="inline-flex w-fit rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-1"
          role="group"
          aria-label="Показатель графика"
        >
          {(["revenue", "visits"] as const).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => setMode(next)}
              aria-pressed={mode === next}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition ${mode === next ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {next === "revenue" ? "Выручка" : "Визиты"}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mt-4 h-60 w-full"
        aria-label={`${label} по дням: ${unit}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-zinc-200 dark:text-zinc-800"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              width={58}
              tickFormatter={(value) =>
                mode === "revenue"
                  ? `${Math.round(value / 1000)} тыс.`
                  : number(value)
              }
            />
            <Tooltip
              cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
              contentStyle={{
                borderRadius: 12,
                borderColor: "#d4d4d8",
                fontSize: 12,
              }}
              formatter={(value, name) => [
                formatValue(Number(value)),
                name === key ? label : "Предыдущий период",
              ]}
              labelFormatter={(value) => `Дата: ${value}`}
            />
            {hasPrevious ? (
              <Line
                type="monotone"
                dataKey={previousKey}
                name="Предыдущий период"
                stroke="#71717a"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey={key}
              name={label}
              stroke="#059669"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: "#059669", strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {hasPrevious
          ? "Сплошная линия — выбранный период, пунктир — предыдущий сопоставимый период."
          : "Нет сопоставимого предыдущего периода."}
      </p>
    </section>
  );
}
