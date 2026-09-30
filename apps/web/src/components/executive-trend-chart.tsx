"use client";

import { ExecutiveLink } from "@/components/executive-link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ExecutiveMetric,
  ExecutiveMetricUnit,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";
import type { ExecutiveHistory } from "@/lib/executive-history";
import {
  formatDay,
  formatNumber,
  formatRange,
  formatWeekdayDay,
} from "@/lib/executive-format";

export type ExecutiveTrendMetric =
  | "revenue"
  | "productRevenue"
  | "visits"
  | "averageProductCheck"
  | "revenuePerVisit"
  | "load";

/** A daily series computed outside summary.days (the revenue drivers). */
export type ExecutiveTrendSeries = {
  unit: ExecutiveMetricUnit;
  rows: Array<{
    date: string;
    value: number | null;
    previous: number | null;
  }>;
};

function shiftDay(date: string, offset: number) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}

/** A day is incomplete only by its own evidence, not by the model-wide services gap. */
function incompleteDay(metric: ExecutiveMetric | undefined) {
  if (!metric) return false;
  if (metric.state === "FAILED" || metric.state === "STALE") return true;
  const coverage = metric.coverage;
  return Boolean(
    coverage && coverage.total !== null && coverage.covered < coverage.total,
  );
}

type Row = {
  date: string;
  label: string;
  value: number | null;
  previous: number | null;
  previousDate: string | null;
  incomplete: boolean;
};

function Dot(props: {
  cx?: number;
  cy?: number;
  payload?: Row;
  index?: number;
  last: number;
}) {
  const { cx, cy, payload, index, last } = props;
  if (cx === undefined || cy === undefined || payload?.value == null)
    return null;
  const isLast = index === last;
  return payload.incomplete ? (
    <circle
      cx={cx}
      cy={cy}
      r={isLast ? 4.5 : 3.5}
      fill="var(--surface)"
      stroke="#d97706"
      strokeWidth={2}
    />
  ) : (
    <circle cx={cx} cy={cy} r={isLast ? 4.5 : 2.75} fill="#059669" />
  );
}

export function ExecutiveTrendChart({
  summary,
  metricKey,
  label,
  id,
  detailsHref,
  history,
  tabs,
  note,
  series,
}: {
  summary: ExecutiveSummary;
  series?: ExecutiveTrendSeries;
  metricKey: ExecutiveTrendMetric;
  label: string;
  id: string;
  detailsHref: string;
  history?: ExecutiveHistory;
  tabs?: ReactNode;
  note?: ReactNode;
}) {
  const chartSummary = history ? history.data : summary;
  const chartScope = history?.scope ?? summary.scope;
  const rows = useMemo<Row[]>(
    () =>
      series
        ? series.rows.map((row, index) => ({
            date: row.date,
            label: formatWeekdayDay(row.date),
            value: row.value,
            previous: row.previous,
            previousDate: chartScope.comparison
              ? shiftDay(chartScope.comparison.from, index)
              : null,
            incomplete: false,
          }))
        : (chartSummary?.days ?? []).map((row, index) => {
        const metric = row.metrics[metricKey];
        return {
          date: row.date,
          label: formatWeekdayDay(row.date),
          value: metric?.value ?? null,
          previous: metric?.comparison?.previousValue ?? null,
          previousDate: chartScope.comparison
            ? shiftDay(chartScope.comparison.from, index)
            : null,
          incomplete: incompleteDay(metric),
        };
      }),
    [chartSummary?.days, chartScope.comparison, metricKey, series],
  );
  const metric = chartSummary?.metrics[metricKey];
  const metricUnit =
    series?.unit ?? summary.metrics[metricKey]?.unit ?? "RUB";
  const hasPrevious =
    chartScope.comparison !== null && rows.some((row) => row.previous !== null);
  const hasCurrent = rows.some((row) => row.value !== null);
  const hasIncomplete = rows.some((row) => row.incomplete);
  const hasGaps = rows.some((row) => row.value === null);
  const lastIndex = rows.reduce(
    (last, row, index) => (row.value !== null ? index : last),
    -1,
  );
  const formatValue = (value: number) => {
    if (metricUnit === "PERCENT") return `${formatNumber(value, 1)}%`;
    if (metricUnit === "RUB_PER_VISIT") return `${formatNumber(value)} ₽ / визит`;
    return metricUnit === "RUB" ? `${formatNumber(value)} ₽` : formatNumber(value);
  };
  const formatTick = (value: number) => {
    if (metricUnit === "PERCENT") return `${formatNumber(value, 1)}%`;
    const short =
      Math.abs(value) >= 1000
        ? `${formatNumber(value / 1000, 1)} тыс.`
        : formatNumber(value);
    return metricUnit === "COUNT" ? short : `${short} ₽`;
  };
  const periodLabel = formatRange(chartScope.period.from, chartScope.period.to);
  const comparisonLabel = chartScope.comparison
    ? formatRange(chartScope.comparison.from, chartScope.comparison.to)
    : null;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-24 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            {history ? "Динамика за 21 день" : "Динамика по дням"}
          </h2>
          <p
            className="mt-1 text-sm text-zinc-600 dark:text-zinc-300"
            aria-live="polite"
            aria-atomic="true"
          >
            {label} · {periodLabel}
            {history ? ` · итоги выше — за ${formatDay(summary.scope.period.to)}` : ""}
          </p>
        </div>
        {chartSummary ? (
          <ExecutiveLink
            href={detailsHref}
            prefetch={false}
            aria-label={`Подробнее: ${label}`}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-300"
          >
            Подробнее <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </ExecutiveLink>
        ) : null}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : null}
      <div
        className="mt-4 h-60 w-full"
        role="img"
        aria-label={`${label} по дням, ${periodLabel}`}
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
                dataKey="label"
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
                tick={{ fill: "currentColor", fontSize: 11 }}
              />
              <YAxis
                className="text-zinc-500 dark:text-zinc-400"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "currentColor",
                  fontSize: 11,
                  style: { fontVariantNumeric: "tabular-nums" },
                }}
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
                  fontVariantNumeric: "tabular-nums",
                }}
                formatter={(value, name, item) => {
                  const row = (item as { payload?: Row }).payload;
                  if (name === "previous")
                    return [
                      formatValue(Number(value)),
                      row?.previousDate
                        ? formatWeekdayDay(row.previousDate) +
                          `.${row.previousDate.slice(5, 7)}`
                        : "Предыдущий период",
                    ];
                  return [
                    `${formatValue(Number(value))}${row?.incomplete ? " · данные неполные" : ""}`,
                    label,
                  ];
                }}
                labelFormatter={(value, payload) => {
                  const row = payload?.[0]?.payload as Row | undefined;
                  return row ? `${value}.${row.date.slice(5, 7)}` : String(value);
                }}
              />
              {hasPrevious ? (
                <Line
                  type="linear"
                  dataKey="previous"
                  name="previous"
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
                type="linear"
                dataKey="value"
                name="value"
                stroke="#059669"
                strokeWidth={2.5}
                dot={(props: Record<string, unknown>) => {
                  const { cx, cy, payload, index } = props as {
                    cx?: number;
                    cy?: number;
                    payload?: Row;
                    index?: number;
                  };
                  return (
                    <Dot
                      key={`dot-${String(index)}`}
                      cx={cx}
                      cy={cy}
                      payload={payload}
                      index={index}
                      last={lastIndex}
                    />
                  );
                }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-[var(--surface-muted)] px-6 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {history && !chartSummary
                ? "Не удалось загрузить динамику за 21 день"
                : "Нет данных для графика"}
            </p>
            <p className="max-w-md text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              {history && !chartSummary
                ? "Итоги за выбранные сутки доступны выше. Обновите страницу, чтобы повторить загрузку графика."
                : (metric?.reason ??
                  "Для этого показателя пока нет значений по дням выбранного периода.")}
            </p>
          </div>
        )}
      </div>
      {hasCurrent || hasPrevious ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded bg-emerald-600" />
            {periodLabel}
          </span>
          {hasPrevious && comparisonLabel ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-0 w-4 border-t-2 border-dashed border-zinc-500"
              />
              {comparisonLabel}
            </span>
          ) : (
            <span>Нет сопоставимого предыдущего периода</span>
          )}
          {hasIncomplete ? (
            <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full border-2 border-amber-600"
              />
              день с неполными данными
            </span>
          ) : null}
          {hasGaps ? <span>Дни без данных — разрыв линии</span> : null}
          {note}
        </div>
      ) : null}
    </section>
  );
}
