"use client";

import Link from "next/link";
import { CaretDown, CaretRight, Info } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type {
  ExecutiveMetric,
  ExecutiveMetricKey,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";

type SortKey = "revenue" | "visits" | "revenuePerVisit";

function display(value: number | null, unit: string) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: unit === "PERCENT" ? 1 : 0,
  }).format(value);
  return unit === "RUB" || unit === "RUB_PER_VISIT"
    ? `${formatted} ₽`
    : unit === "PERCENT"
      ? `${formatted}%`
      : formatted;
}

function detailHref(summary: ExecutiveSummary, metric: ExecutiveMetricKey) {
  const params = new URLSearchParams({
    metric,
    period: "custom",
    dateFrom: summary.scope.period.from,
    dateTo: summary.scope.period.to,
    asOf: summary.scope.asOf,
    comparison: String(summary.scope.comparison !== null),
  });
  summary.scope.storeIds.forEach((storeId) =>
    params.append("storeIds", storeId),
  );
  return `/dashboard/executive-details?${params}`;
}

function evidence(metric: ExecutiveMetric) {
  const state = {
    AVAILABLE: "Подтверждено",
    PARTIAL: "Частично подтверждено",
    MISSING: "Нет данных",
    STALE: "Данные устарели",
    FAILED: "Источник недоступен",
  }[metric.state];
  const coverage = metric.coverage
    ? metric.coverage.total === null
      ? `Подтверждено ${metric.coverage.covered}`
      : `Покрытие ${metric.coverage.covered}/${metric.coverage.total}`
    : null;
  return [
    state,
    metric.reason,
    coverage,
    metric.factAsOf ? `Данные на ${factDate(metric.factAsOf)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function factDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function MetricNote({
  metric,
  expanded,
}: {
  metric: ExecutiveMetric;
  expanded: boolean;
}) {
  if (!expanded && metric.state === "AVAILABLE") return null;
  const note = expanded
    ? evidence(metric)
    : {
        AVAILABLE: "",
        PARTIAL: "Неполные данные",
        MISSING: "Нет данных",
        STALE: `Устарели${metric.factAsOf ? ` · ${factDate(metric.factAsOf)}` : ""}`,
        FAILED: "Ошибка загрузки",
      }[metric.state];
  return (
    <span
      className={`mt-1 block text-xs leading-5 ${!expanded && (metric.state === "PARTIAL" || metric.state === "STALE") ? "text-amber-800 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400"}`}
    >
      {note}
    </span>
  );
}

export function ExecutiveClubTable({ summary }: { summary: ExecutiveSummary }) {
  const [sort, setSort] = useState<SortKey>("revenue");
  const [showEvidence, setShowEvidence] = useState(false);
  const rows = useMemo(
    () =>
      [...summary.clubs].toSorted((left, right) => {
        const leftValue = left.metrics[sort].value;
        const rightValue = right.metrics[sort].value;
        if (leftValue === null && rightValue === null) return 0;
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        return rightValue - leftValue;
      }),
    [sort, summary.clubs],
  );

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Результаты по клубам
        </h2>
        <button
          type="button"
          aria-pressed={showEvidence}
          onClick={() => setShowEvidence((visible) => !visible)}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${showEvidence ? "bg-[var(--surface-muted)] text-[var(--foreground)]" : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"}`}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Пояснения</span>
        </button>
        <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Сортировка
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="min-w-0 rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <option value="revenue">по выручке</option>
            <option value="visits">по визитам</option>
            <option value="revenuePerVisit">по доходу на визит</option>
          </select>
          <CaretDown className="h-3.5 w-3.5" aria-hidden="true" />
        </label>
      </div>
      <div className="mt-4 w-full overflow-x-auto">
        <table className="min-w-[680px] w-full text-left text-sm">
          <thead className="border-b border-[var(--border-soft)] text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-2 py-3">Клуб</th>
              <th className="px-2 py-3 text-right">Выручка</th>
              <th className="px-2 py-3 text-right">Визиты</th>
              <th className="px-2 py-3 text-right">Загрузка</th>
              <th className="px-2 py-3 text-right">Динамика</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const revenue = row.metrics.revenue;
              const delta = revenue.comparison?.percentDelta;
              return (
                <tr
                  key={row.storeId}
                  className="border-b border-[var(--border-soft)] last:border-0"
                >
                  <td className="px-2 py-4 font-semibold text-[var(--foreground)]">
                    {row.storeName}
                  </td>
                  <td className="px-2 py-4 text-right tabular-nums">
                    <span className="block">
                      {display(revenue.value, revenue.unit)}
                    </span>
                    <MetricNote metric={revenue} expanded={showEvidence} />
                  </td>
                  <td className="px-2 py-4 text-right tabular-nums">
                    <span className="block">
                      {display(
                        row.metrics.visits.value,
                        row.metrics.visits.unit,
                      )}
                    </span>
                    <MetricNote
                      metric={row.metrics.visits}
                      expanded={showEvidence}
                    />
                  </td>
                  <td className="px-2 py-4 text-right tabular-nums">
                    <span className="block">
                      {display(row.metrics.load.value, row.metrics.load.unit)}
                    </span>
                    <MetricNote
                      metric={row.metrics.load}
                      expanded={showEvidence}
                    />
                  </td>
                  <td className="px-2 py-4 text-right">
                    <Link
                      href={detailHref(summary, "revenue")}
                      className="inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                    >
                      {delta === null || delta === undefined
                        ? revenue.comparison?.absoluteDelta === null ||
                          revenue.comparison?.absoluteDelta === undefined
                          ? "—"
                          : display(
                              revenue.comparison.absoluteDelta,
                              revenue.unit,
                            )
                        : `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(delta)}%`}
                      <CaretRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
