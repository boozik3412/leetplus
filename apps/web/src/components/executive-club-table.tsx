"use client";

import Link from "next/link";
import { CaretRight, Info } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type {
  ExecutiveMetric,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";
import {
  clubDropSignals,
  deltaDirection,
  networkContributions,
} from "@/lib/executive-priority-rules";
import {
  formatMoney,
  formatNumber,
  formatRange,
  formatSigned,
} from "@/lib/executive-format";

type SortKey = "attention" | "name" | "value" | "delta" | "visits";
type Club = ExecutiveSummary["clubs"][number];

export function clubDetailHref(
  summary: ExecutiveSummary,
  metric: string,
  storeIds: readonly string[] = summary.scope.storeIds,
) {
  const params = new URLSearchParams({
    metric,
    period: "custom",
    dateFrom: summary.scope.period.from,
    dateTo: summary.scope.period.to,
    asOf: summary.scope.asOf,
    comparison: String(summary.scope.comparison !== null),
  });
  storeIds.forEach((storeId) => params.append("storeIds", storeId));
  return `/dashboard/executive-details?${params}`;
}

function factDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
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
      ? `подтверждено ${metric.coverage.covered}`
      : `покрытие ${metric.coverage.covered} из ${metric.coverage.total}`
    : null;
  return [
    state,
    metric.reason,
    coverage,
    metric.factAsOf ? `данные на ${factDate(metric.factAsOf)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function shortNote(metric: ExecutiveMetric, kind: "money" | "visits") {
  if (metric.state === "AVAILABLE") return null;
  if (metric.state === "MISSING")
    return kind === "visits" ? "нет привязанных сессий" : "нет данных";
  if (metric.state === "FAILED") return "ошибка источника";
  if (metric.state === "STALE")
    return `устарели${metric.factAsOf ? ` · ${factDate(metric.factAsOf)}` : ""}`;
  return kind === "visits" ? "частично" : "неполные дни";
}

function MetricNote({
  metric,
  expanded,
  kind,
}: {
  metric: ExecutiveMetric;
  expanded: boolean;
  kind: "money" | "visits";
}) {
  const note = expanded ? evidence(metric) : shortNote(metric, kind);
  if (!note) return null;
  const warn =
    !expanded && (metric.state === "FAILED" || metric.state === "STALE");
  return (
    <span
      className={`mt-1 block text-xs leading-5 ${warn ? "text-amber-800 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400"}`}
    >
      {note}
    </span>
  );
}

function DeltaCell({ metric }: { metric: ExecutiveMetric }) {
  const direction = deltaDirection(metric);
  const comparison = metric.comparison;
  if (!direction || !comparison || comparison.absoluteDelta === null)
    return (
      <span className="text-zinc-500 dark:text-zinc-400">
        —<span className="sr-only"> нет сопоставимого сравнения</span>
      </span>
    );
  const tone =
    direction === "down"
      ? "text-red-700 dark:text-red-300"
      : direction === "up"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-zinc-600 dark:text-zinc-300";
  return (
    <span className={`inline-flex flex-col items-end tabular-nums ${tone}`}>
      <span className="font-semibold">
        <span aria-hidden="true">
          {direction === "down" ? "▼ " : direction === "up" ? "▲ " : ""}
        </span>
        <span className="sr-only">
          {direction === "down" ? "снижение " : direction === "up" ? "рост " : ""}
        </span>
        {comparison.percentDelta === null
          ? "—"
          : formatSigned(comparison.percentDelta, 1, "%")}
      </span>
      <span className="text-xs">{formatSigned(comparison.absoluteDelta)} ₽</span>
    </span>
  );
}

/** Clubs needing attention: failed/unconfirmed sales, zero after sales, or a confirmed drop. */
function attentionRank(club: Club, dropped: ReadonlySet<string>) {
  const metric = club.metrics.productRevenue;
  if (!metric) return 1;
  const previous = metric.comparison?.previousValue ?? null;
  if (
    metric.state === "FAILED" ||
    metric.state === "MISSING" ||
    metric.state === "STALE" ||
    (metric.value === 0 && previous !== null && previous > 0) ||
    dropped.has(club.storeId)
  )
    return 0;
  return metric.comparison?.absoluteDelta === null ||
    metric.comparison?.absoluteDelta === undefined
    ? 2
    : 1;
}

export function ExecutiveClubTable({ summary }: { summary: ExecutiveSummary }) {
  const [sort, setSort] = useState<SortKey>("attention");
  const [showEvidence, setShowEvidence] = useState(false);
  const drops = useMemo(() => clubDropSignals(summary), [summary]);
  const dropped = useMemo(
    () => new Set(drops.map((drop) => drop.storeId)),
    [drops],
  );
  const contributions = useMemo(() => networkContributions(summary), [summary]);
  const showVisits = summary.clubs.some(
    (club) => club.metrics.visits.state !== "MISSING",
  );
  const showLoad = summary.clubs.some(
    (club) => club.metrics.load.state !== "MISSING",
  );
  const rows = useMemo(() => {
    const value = (club: Club, key: "value" | "delta" | "visits") =>
      key === "visits"
        ? club.metrics.visits.value
        : key === "delta"
          ? (club.metrics.productRevenue?.comparison?.absoluteDelta ?? null)
          : (club.metrics.productRevenue?.value ?? null);
    return [...summary.clubs].toSorted((left, right) => {
      if (sort === "name")
        return left.storeName.localeCompare(right.storeName, "ru");
      if (sort === "attention") {
        const rank =
          attentionRank(left, dropped) - attentionRank(right, dropped);
        if (rank !== 0) return rank;
        const leftDelta = value(left, "delta");
        const rightDelta = value(right, "delta");
        if (leftDelta !== null && rightDelta !== null)
          return leftDelta - rightDelta;
        return (value(right, "value") ?? 0) - (value(left, "value") ?? 0);
      }
      const leftValue = value(left, sort);
      const rightValue = value(right, sort);
      if (leftValue === null && rightValue === null) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return sort === "delta" ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [dropped, sort, summary.clubs]);
  const comparisonLabel = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : null;
  const maxContribution = contributions
    ? Math.max(1, ...contributions.clubs.map((club) => Math.abs(club.delta)))
    : 1;

  const headers: Array<{ key: SortKey; label: string; align: string }> = [
    { key: "name", label: "Клуб", align: "text-left" },
    { key: "value", label: "Бар и товары", align: "text-right" },
    { key: "delta", label: comparisonLabel ? `К ${comparisonLabel}` : "Изменение", align: "text-right" },
    ...(showVisits
      ? [{ key: "visits" as const, label: "Визиты", align: "text-right" }]
      : []),
  ];

  return (
    <section
      aria-labelledby="clubs-title"
      className="min-w-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="clubs-title"
            className="text-lg font-semibold text-[var(--foreground)]"
          >
            Клубы
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {sort === "attention"
              ? "Сначала клубы, требующие внимания"
              : "Сортировка по выбранной колонке"}
            {showLoad ? "" : " · загрузка не подтверждена источником"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sort !== "attention" ? (
            <button
              type="button"
              onClick={() => setSort("attention")}
              className="min-h-8 rounded-lg px-2 text-xs font-medium text-zinc-600 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-zinc-300"
            >
              Сначала внимание
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={showEvidence}
            onClick={() => setShowEvidence((visible) => !visible)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${showEvidence ? "bg-[var(--surface-muted)] text-[var(--foreground)]" : "text-zinc-600 hover:bg-[var(--surface-muted)] dark:text-zinc-300"}`}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Пояснения</span>
          </button>
        </div>
      </div>

      {contributions && comparisonLabel ? (
        <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            <strong className="font-semibold text-[var(--foreground)]">
              Что изменилось:
            </strong>{" "}
            бар и товары{" "}
            <span className="tabular-nums">
              {formatMoney(contributions.previousValue)} →{" "}
              {formatMoney(contributions.value)}
            </span>{" "}
            <span
              className={`font-semibold tabular-nums ${contributions.absoluteDelta < 0 ? "text-red-700 dark:text-red-300" : contributions.absoluteDelta > 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}
            >
              ({formatSigned(contributions.absoluteDelta)} ₽)
            </span>
          </p>
          <ul className="mt-3 grid gap-1.5" aria-label="Вклад клубов в изменение">
            {contributions.clubs.map((club) => (
              <li
                key={club.storeId}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
              >
                <span className="truncate text-zinc-700 dark:text-zinc-200">
                  {club.storeName}
                </span>
                <span className="relative h-2.5 rounded-full bg-[var(--surface)]">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 rounded-full ${club.delta < 0 ? "bg-red-500/80" : "bg-emerald-500/80"}`}
                    style={{
                      width: `${Math.max(2, (Math.abs(club.delta) / maxContribution) * 100)}%`,
                    }}
                  />
                </span>
                <span
                  className={`min-w-[5.5rem] text-right font-semibold tabular-nums ${club.delta < 0 ? "text-red-700 dark:text-red-300" : club.delta > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-600 dark:text-zinc-300"}`}
                >
                  {formatSigned(club.delta)} ₽
                </span>
              </li>
            ))}
          </ul>
          {contributions.notComparable.length ||
          contributions.unexplained !== 0 ? (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {contributions.notComparable.length
                ? `Без сопоставимого сравнения: ${contributions.notComparable.map((club) => club.storeName).join(", ")}. `
                : ""}
              {contributions.unexplained !== 0
                ? `Не разложено по клубам: ${formatSigned(contributions.unexplained)} ₽.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 hidden w-full overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border-soft)] text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <tr>
              {headers.map((header) => (
                <th
                  key={header.key}
                  scope="col"
                  aria-sort={
                    sort === header.key
                      ? header.key === "name" || header.key === "delta"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`px-2 py-2 ${header.align}`}
                >
                  <button
                    type="button"
                    onClick={() => setSort(header.key)}
                    className={`min-h-8 rounded px-1 font-medium hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${sort === header.key ? "text-[var(--foreground)]" : ""}`}
                  >
                    {header.label}
                  </button>
                </th>
              ))}
              <th className="w-8 px-2 py-2">
                <span className="sr-only">Детализация</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const product = row.metrics.productRevenue ?? row.metrics.revenue;
              const attention = attentionRank(row, dropped) === 0;
              return (
                <tr
                  key={row.storeId}
                  className="border-b border-[var(--border-soft)] last:border-0"
                >
                  <td
                    className={`border-l-4 px-2 py-3 font-semibold text-[var(--foreground)] ${attention ? "border-l-red-500" : "border-l-transparent"}`}
                  >
                    {row.storeName}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    <span className="block">
                      {product.value === null ? "—" : formatMoney(product.value)}
                    </span>
                    <MetricNote
                      metric={product}
                      expanded={showEvidence}
                      kind="money"
                    />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DeltaCell metric={product} />
                  </td>
                  {showVisits ? (
                    <td className="px-2 py-3 text-right tabular-nums">
                      <span className="block">
                        {row.metrics.visits.value === null
                          ? "—"
                          : formatNumber(row.metrics.visits.value)}
                      </span>
                      <MetricNote
                        metric={row.metrics.visits}
                        expanded={showEvidence}
                        kind="visits"
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-3 text-right">
                    <Link
                      href={clubDetailHref(summary, "productRevenue", [
                        row.storeId,
                      ])}
                      prefetch={false}
                      aria-label={`${row.storeName}: продажи по дням`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <CaretRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 grid gap-2 sm:hidden" aria-label="Клубы">
        {rows.map((row) => {
          const product = row.metrics.productRevenue ?? row.metrics.revenue;
          const attention = attentionRank(row, dropped) === 0;
          return (
            <li key={row.storeId}>
              <Link
                href={clubDetailHref(summary, "productRevenue", [row.storeId])}
                prefetch={false}
                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl border border-l-4 border-[var(--border-soft)] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${attention ? "border-l-red-500" : ""}`}
              >
                <span className="min-w-0 truncate font-semibold text-[var(--foreground)]">
                  {row.storeName}
                </span>
                <span className="text-right text-sm tabular-nums">
                  {product.value === null ? "—" : formatMoney(product.value)}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {showVisits
                    ? `Визиты: ${row.metrics.visits.value === null ? (shortNote(row.metrics.visits, "visits") ?? "—") : formatNumber(row.metrics.visits.value)}`
                    : (shortNote(product, "money") ?? "")}
                </span>
                <span className="text-right text-xs">
                  <DeltaCell metric={product} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
