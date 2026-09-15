"use client";

import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { useMemo } from "react";
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

export type ExecutiveTrendMetric =
  | "revenue"
  | "visits"
  | "revenuePerVisit"
  | "load"
  | "productRevenue";

function day(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function ExecutiveTrendChart({
  summary,
  metricKey,
  label,
  id,
  detailsHref,
}: {
  summary: ExecutiveSummary;
  metricKey: ExecutiveTrendMetric;
  label: string;
  id: string;
  detailsHref: string;
}) {
  const rows = useMemo(
    () =>
      summary.days.map((row) => ({
        date: day(row.date),
        value: row.metrics[metricKey].value,
        previous: row.metrics[metricKey].comparison?.previousValue ?? null,
        state: row.metrics[metricKey].state,
      })),
    [summary.days, metricKey],
  );
  const metric = summary.metrics[metricKey];
  const unit = {
    RUB: "₽",
    COUNT: "визитов",
    RUB_PER_VISIT: "₽ / визит",
    PERCENT: "%",
  }[metric.unit];
  const hasPrevious =
    summary.scope.comparison !== null &&
    rows.some((row) => row.previous !== null);
  const hasCurrent = rows.some((row) => row.value !== null);
  const hasPartial =
    metric.state === "PARTIAL" || rows.some((row) => row.state === "PARTIAL");
  const hasStale =
    metric.state === "STALE" || rows.some((row) => row.state === "STALE");
  const hasGaps = rows.some((row) => row.value === null);
  const formatValue = (value: number) => {
    if (metric.unit === "PERCENT") return `${number(value, 1)}%`;
    if (metric.unit === "RUB_PER_VISIT") return `${number(value)} ₽ / визит`;
    return metric.unit === "RUB" ? `${number(value)} ₽` : number(value);
  };
  const formatTick = (value: number) => {
    if (metric.unit === "PERCENT") return `${number(value, 1)}%`;
    const short =
      Math.abs(value) >= 1000
        ? `${number(value / 1000, 1)} тыс.`
        : number(value);
    return metric.unit === "COUNT" ? short : `${short} ₽`;
  };

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-24 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id={`${id}-title`}
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Динамика периода
          </h2>
          <p
            className="mt-1 text-sm text-zinc-600 dark:text-zinc-300"
            aria-live="polite"
            aria-atomic="true"
          >
            {label} · по дням выбранного периода
          </p>
        </div>
        <Link
          href={detailsHref}
          prefetch={false}
          aria-label={`Подробнее: ${label}`}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-300"
        >
          Подробнее <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div
        className="mt-4 h-60 w-full"
        aria-label={`${label} по дням: ${unit}`}
      >
        {hasCurrent || hasPrevious ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              key={metricKey}
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
                className="text-zinc-500 dark:text-zinc-400"
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 11 }}
              />
              <YAxis
                className="text-zinc-500 dark:text-zinc-400"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 11 }}
                width={70}
                tickFormatter={formatTick}
              />
              <Tooltip
                itemStyle={{ color: "var(--foreground)" }}
                cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
                contentStyle={{
                  borderRadius: 12,
                  borderColor: "var(--border-soft)",
                  backgroundColor: "var(--surface)",
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  formatValue(Number(value)),
                  name === label ? label : "Предыдущий период",
                ]}
                labelFormatter={(value) => `Дата: ${value}`}
              />
              {hasPrevious ? (
                <Line
                  type="monotone"
                  dataKey="previous"
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
                dataKey="value"
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
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-[var(--surface-muted)] px-6 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Нет данных для графика
            </p>
            <p className="max-w-md text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              {metric.reason ??
                "Для этого показателя пока нет значений по дням выбранного периода."}
            </p>
          </div>
        )}
      </div>
      {hasCurrent || hasPrevious ? (
        <>
          {hasStale || hasPartial || hasGaps ? (
            <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
              {hasStale
                ? "Есть устаревшие данные."
                : hasPartial
                  ? "Показана подтверждённая часть данных."
                  : "За часть дней нет данных."}
              {hasGaps ? " Пропуски не соединены линией." : ""}
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {hasPrevious
              ? "Сплошная линия — выбранный период, пунктир — предыдущий сопоставимый период."
              : "Нет сопоставимого предыдущего периода."}
          </p>
        </>
      ) : null}
    </section>
  );
}
