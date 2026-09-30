"use client";

import type { ExecutiveHistory } from "@/lib/executive-history";

import Link from "next/link";
import {
  clubDropSignals,
  deltaDirection,
  hasConfirmedDecline,
  priorityCount,
  priorityLevelCounts,
  salesCoverageGap,
  sortPriorities,
  type PriorityKind,
  type PriorityLevel,
} from "@/lib/executive-priority-rules";
import { useId, useState, type ReactNode } from "react";
import {
  staffPriorityKinds,
  staffPriorityLabels,
  staffPriorityHref,
  type StaffPriorityKind,
  type StaffPriorityLoad,
} from "@/lib/staff-priorities-types";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import {
  ExecutiveClubTable,
  clubDetailHref,
} from "@/components/executive-club-table";
import {
  ExecutiveTrendChart,
  type ExecutiveTrendMetric,
} from "@/components/executive-trend-chart";
import { buildAssortmentReportHref } from "@/lib/assortment-report-query";
import type { DashboardMetric } from "@/lib/dashboard-summary";
import type {
  ExecutiveMetric,
  ExecutiveMetricKey,
  ExecutiveOperations,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";
import {
  formatDay,
  formatMoney,
  formatNumber,
  formatRange,
  formatSigned,
  pluralRu,
} from "@/lib/executive-format";

const metricLabels: Record<ExecutiveTrendMetric | "serviceRevenue" | "topups", string> = {
  revenue: "Выручка",
  productRevenue: "Бар и товары",
  visits: "Визиты",
  averageProductCheck: "Средний чек бара",
  revenuePerVisit: "Доход на визит",
  load: "Загрузка",
  serviceRevenue: "Услуги",
  topups: "Пополнения",
};

const basisLabels = {
  STORE_DAYS: "клубо-дней",
  STORE_OPERATIONS: "операций",
  STORE_SESSIONS: "сессий",
  CAPACITY_HOURS: "часов мощности",
} as const;

function formatMetric(metric: ExecutiveMetric) {
  if (metric.value === null) return "—";
  if (metric.unit === "RUB" || metric.unit === "RUB_PER_VISIT")
    return formatMoney(metric.value);
  if (metric.unit === "PERCENT") return `${formatNumber(metric.value, 1)}%`;
  return formatNumber(metric.value);
}

function formatProductPositions(value: number) {
  return `${formatNumber(value)} ${pluralRu(value, ["товарная позиция", "товарные позиции", "товарных позиций"])}`;
}

function coverageText(metric: ExecutiveMetric) {
  if (!metric.coverage) return null;
  const basis = basisLabels[metric.coverage.basis];
  return metric.coverage.total === null
    ? `подтверждено ${formatNumber(metric.coverage.covered)} ${basis}`
    : `${formatNumber(metric.coverage.covered)} из ${formatNumber(metric.coverage.total)} ${basis}`;
}

function metricEvidence(metric: ExecutiveMetric) {
  const state = {
    AVAILABLE: "Подтверждено",
    PARTIAL: "Частично подтверждено",
    MISSING: "Не подтверждено источником",
    STALE: "Данные устарели",
    FAILED: "Источник недоступен",
  }[metric.state];
  return [
    state,
    metric.reason,
    coverageText(metric),
    metric.factAsOf ? `факты на ${formatDay(metric.factAsOf.slice(0, 10))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StateChip({ metric }: { metric: ExecutiveMetric }) {
  if (metric.state === "AVAILABLE") return null;
  const tone =
    metric.state === "FAILED"
      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
      : metric.state === "STALE"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  const label = {
    PARTIAL: "частично",
    MISSING: "не подтверждено",
    STALE: "устарело",
    FAILED: "сбой источника",
  }[metric.state];
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}
      title={metricEvidence(metric)}
    >
      {label}
    </span>
  );
}

function Delta({
  metric,
  against,
}: {
  metric: ExecutiveMetric;
  against: string | null;
}) {
  const direction = deltaDirection(metric);
  const comparison = metric.comparison;
  if (!direction || !comparison || comparison.absoluteDelta === null)
    return (
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {against ? "Без сопоставимого сравнения" : "Сравнение выключено"}
      </span>
    );
  const tone =
    direction === "down"
      ? "text-red-700 dark:text-red-300"
      : direction === "up"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-zinc-600 dark:text-zinc-300";
  const money = metric.unit === "RUB" || metric.unit === "RUB_PER_VISIT";
  return (
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>
      <span aria-hidden="true">
        {direction === "down" ? "▼ " : direction === "up" ? "▲ " : ""}
      </span>
      <span className="sr-only">
        {direction === "down" ? "Снижение: " : direction === "up" ? "Рост: " : "Без изменений: "}
      </span>
      {comparison.percentDelta === null
        ? ""
        : `${formatSigned(comparison.percentDelta, 1, "%")} · `}
      {formatSigned(comparison.absoluteDelta)}
      {money ? " ₽" : ""}
      {against ? (
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          {" "}
          к {against}
        </span>
      ) : null}
    </span>
  );
}

function Sparkline({
  values,
  previous,
}: {
  values: Array<number | null>;
  previous: Array<number | null>;
}) {
  const all = [...values, ...previous].filter(
    (value): value is number => value !== null,
  );
  if (values.filter((value) => value !== null).length < 2) return null;
  const max = Math.max(...all, 1);
  const width = 240;
  const height = 48;
  const x = (index: number) =>
    values.length === 1 ? 0 : (index / (values.length - 1)) * width;
  const y = (value: number) => height - 3 - (value / max) * (height - 6);
  const path = (series: Array<number | null>) =>
    series
      .map((value, index) =>
        value === null
          ? null
          : `${index === 0 || series[index - 1] === null ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`,
      )
      .filter(Boolean)
      .join(" ");
  const lastIndex = values.findLastIndex((value) => value !== null);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-12 w-full overflow-visible"
    >
      {previous.some((value) => value !== null) ? (
        <path
          d={path(previous)}
          fill="none"
          stroke="currentColor"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="text-zinc-400 dark:text-zinc-500"
        />
      ) : null}
      <path
        d={path(values)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className="text-emerald-600 dark:text-emerald-400"
      />
      {lastIndex >= 0 ? (
        <circle
          cx={x(lastIndex)}
          cy={y(values[lastIndex]!)}
          r={3}
          className="fill-emerald-600 dark:fill-emerald-400"
        />
      ) : null}
    </svg>
  );
}

function headlineKey(summary: ExecutiveSummary) {
  return summary.metrics.serviceRevenue.state === "AVAILABLE"
    ? "revenue"
    : "productRevenue";
}

function Headline({
  summary,
  history,
}: {
  summary: ExecutiveSummary;
  history?: ExecutiveHistory;
}) {
  const key = headlineKey(summary);
  const metric = summary.metrics[key];
  const against = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : null;
  const series = history ? history.data : summary;
  const days = series?.days ?? [];
  const bound = summary.clubs.filter(
    (club) => club.metrics.visits.state !== "MISSING",
  ).length;
  const secondary = (
    ["visits", "averageProductCheck", "revenuePerVisit", "load", "topups"] as const
  )
    .map((metricKey) => ({ metricKey, metric: summary.metrics[metricKey] }))
    .filter(
      (item): item is { metricKey: typeof item.metricKey; metric: ExecutiveMetric } =>
        item.metric !== undefined && item.metric.state !== "MISSING",
    );
  const unconfirmed = (
    ["serviceRevenue", "topups", "revenuePerVisit", "load", "averageProductCheck"] as const
  )
    .map((metricKey) => ({ metricKey, metric: summary.metrics[metricKey] }))
    .filter(
      (item): item is { metricKey: typeof item.metricKey; metric: ExecutiveMetric } =>
        item.metric?.state === "MISSING",
    );
  return (
    <section
      aria-labelledby="headline-title"
      className="min-w-0 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-end">
        <div className="min-w-0">
          <h2
            id="headline-title"
            className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"
          >
            {key === "revenue" ? "Выручка" : "Выручка бара и товаров"}
            <StateChip metric={metric} />
          </h2>
          <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-[var(--foreground)] sm:text-5xl">
            {formatMetric(metric)}
          </p>
          <p className="mt-2">
            <Delta metric={metric} against={against} />
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {key === "revenue"
              ? `Бар и товары: ${formatMetric(summary.metrics.productRevenue)} · услуги: ${formatMetric(summary.metrics.serviceRevenue)}`
              : "Услуги и игровое время в эту цифру не входят: их источник пока не подтверждён."}
            {metric.state !== "AVAILABLE" && metric.reason ? ` ${metric.reason}` : ""}
          </p>
        </div>
        {days.length > 1 ? (
          <div className="min-w-0">
            <Sparkline
              values={days.map((day) => day.metrics[key]?.value ?? null)}
              previous={days.map(
                (day) => day.metrics[key]?.comparison?.previousValue ?? null,
              )}
            />
            <p className="mt-1 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
              {history
                ? `21 день, ${formatRange(history.scope.period.from, history.scope.period.to)}`
                : `по дням, ${formatRange(summary.scope.period.from, summary.scope.period.to)}`}
            </p>
          </div>
        ) : null}
      </div>
      {secondary.length ? (
        <dl className="mt-5 grid gap-3 border-t border-[var(--border-soft)] pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {secondary.map(({ metricKey, metric: item }) => (
            <div key={metricKey} className="min-w-0">
              <dt className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                {metricLabels[metricKey]}
                <StateChip metric={item} />
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">
                {formatMetric(item)}
              </dd>
              <dd className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {metricKey === "visits" && bound < summary.clubs.length
                  ? `Сессии привязаны у ${bound} из ${summary.clubs.length} клубов · `
                  : ""}
                {metricKey === "averageProductCheck" &&
                item.receiptEvidence?.receiptCount != null
                  ? `${formatNumber(item.receiptEvidence.receiptCount)} ${pluralRu(item.receiptEvidence.receiptCount, ["чек", "чека", "чеков"])} · `
                  : ""}
                {item.comparison ? (
                  <Delta metric={item} against={null} />
                ) : (
                  "без сравнения"
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {unconfirmed.length ? (
        <details className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            Пока не подтверждены источником:{" "}
            {unconfirmed
              .map(({ metricKey }) => metricLabels[metricKey].toLowerCase())
              .join(", ")}{" "}
            · почему
          </summary>
          <ul className="mt-2 grid gap-1">
            {unconfirmed.map(({ metricKey, metric: item }) => (
              <li key={metricKey}>
                <strong className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {metricLabels[metricKey]}:
                </strong>{" "}
                {item.reason ?? "источник не подтверждён"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

type PriorityItem = {
  key: string;
  kind: PriorityKind;
  level: PriorityLevel;
  amount?: number | null;
  club?: string;
  title: string;
  caption: string;
  href: string;
};

const staffLevels: Record<StaffPriorityKind, PriorityLevel> = {
  TASKS_OVERDUE: "URGENT",
  CHECKLISTS_OVERDUE: "URGENT",
  CHECKLISTS_REVIEW: "TODAY",
  TRAINING_INCOMPLETE: "TODAY",
  REGULATIONS_UNACKNOWLEDGED: "TODAY",
};

function usableCount(metric: DashboardMetric<number> | undefined) {
  return (metric?.state === "AVAILABLE" || metric?.state === "PARTIAL") &&
    metric.value !== null &&
    metric.value > 0
    ? metric.value
    : null;
}

function assortmentScope(summary: ExecutiveSummary) {
  return {
    from: summary.scope.period.from,
    to: summary.scope.period.to,
    asOf: summary.scope.asOf,
    storeIds: summary.scope.storeIds,
    categoryIds: [],
    noSalesDays: 21 as const,
  };
}

function buildPriorities(
  summary: ExecutiveSummary,
  operations: ExecutiveOperations | null,
  staff: StaffPriorityLoad,
): PriorityItem[] {
  const items: PriorityItem[] = [];
  const against = summary.scope.comparison
    ? formatRange(summary.scope.comparison.from, summary.scope.comparison.to)
    : "";
  for (const drop of clubDropSignals(summary))
    items.push({
      key: `club-drop:${drop.storeId}`,
      kind: "CLUB_DROP",
      level: drop.level,
      amount: -drop.absoluteDelta,
      club: drop.storeName,
      title: "Разобрать падение продаж бара",
      caption: `${formatSigned(drop.percentDelta, 1, "%")} · ${formatSigned(drop.absoluteDelta)} ₽ к ${against} · ≈ ${formatSigned(drop.perDay)} ₽ в день`,
      href: clubDetailHref(summary, "productRevenue", [drop.storeId]),
    });
  const assortment = operations?.assortment;
  const health =
    assortment?.state === "AVAILABLE" || assortment?.state === "PARTIAL"
      ? assortment.data
      : null;
  const scope = assortmentScope(summary);
  const outOfStock = usableCount(health?.outOfStock);
  if (outOfStock !== null)
    items.push({
      key: "out-of-stock",
      kind: "OUT_OF_STOCK",
      level: "URGENT",
      title: "Пополнить позиции без остатка",
      caption: `${health?.outOfStock.state === "PARTIAL" ? "Не менее " : ""}${formatProductPositions(outOfStock)}`,
      href: buildAssortmentReportHref(scope, "out-of-stock"),
    });
  const lowStock = usableCount(health?.lowStock);
  if (lowStock !== null)
    items.push({
      key: "low-stock",
      kind: "LOW_STOCK",
      level: "TODAY",
      title: "Пополнить запас на ближайшие 3 дня",
      caption: `${health?.lowStock.state === "PARTIAL" ? "Не менее " : ""}${formatProductPositions(lowStock)}`,
      href: buildAssortmentReportHref(scope, "low-stock"),
    });
  const visits = summary.metrics.visits;
  if (hasConfirmedDecline(visits))
    items.push({
      key: "visits",
      kind: "VISITS_DECLINE",
      level: "TODAY",
      title: "Разобрать снижение визитов",
      caption: `${formatSigned(visits.comparison!.absoluteDelta!)} к ${against}`,
      href: clubDetailHref(summary, "visits"),
    });
  for (const [key, kind, title] of [
    ["averageProductCheck", "AVERAGE_CHECK_DECLINE", "Разобрать снижение среднего чека"],
    ["revenuePerVisit", "REVENUE_PER_VISIT_DECLINE", "Разобрать снижение дохода на визит"],
  ] as const) {
    const metric = summary.metrics[key];
    if (metric && hasConfirmedDecline(metric))
      items.push({
        key,
        kind,
        level: "TODAY",
        title,
        caption: `${metric.comparison!.percentDelta === null ? "" : `${formatSigned(metric.comparison!.percentDelta, 1, "%")} · `}${formatSigned(metric.comparison!.absoluteDelta!)} ₽ к ${against}`,
        href: clubDetailHref(summary, key),
      });
  }
  for (const kind of staffPriorityKinds) {
    const metric = staff.data?.metrics[kind];
    if (
      metric &&
      (metric.state === "AVAILABLE" || metric.state === "PARTIAL") &&
      metric.value !== null &&
      metric.value > 0
    )
      items.push({
        key: kind,
        kind,
        level: staffLevels[kind],
        title: staffPriorityLabels[kind],
        caption: `${metric.state === "PARTIAL" ? "Не менее " : ""}${priorityCount(metric.value, metric.unit)}${kind === "CHECKLISTS_REVIEW" ? " · сданы, ждут проверки после планового срока" : ""}`,
        href: staffPriorityHref(summary.scope.storeIds, kind),
      });
  }
  const gap = salesCoverageGap(summary.metrics.productRevenue);
  if (gap)
    items.push({
      key: "sales-coverage",
      kind: "SALES_COVERAGE",
      level: "DATA",
      title: "Проверить полноту продаж",
      caption:
        gap.kind === "UNCONFIRMED_DAYS"
          ? `Подтверждено ${gap.covered} из ${gap.total} клубо-дней`
          : (gap.reason ?? "Источник продаж не подтверждён"),
      href: clubDetailHref(summary, "productRevenue"),
    });
  return sortPriorities(items);
}

const levelStyles: Record<
  PriorityLevel,
  { stripe: string; label: string; text: string }
> = {
  URGENT: {
    stripe: "bg-red-500",
    label: "Срочно",
    text: "text-red-700 dark:text-red-300",
  },
  TODAY: {
    stripe: "bg-amber-400",
    label: "Сегодня",
    text: "text-amber-800 dark:text-amber-300",
  },
  DATA: {
    stripe: "bg-zinc-400",
    label: "Данные",
    text: "text-zinc-600 dark:text-zinc-300",
  },
};

function AssortmentLine({
  summary,
  operations,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
}) {
  const assortment = operations?.assortment;
  const health = assortment?.data;
  const href = buildAssortmentReportHref(assortmentScope(summary), "dashboard");
  if (!assortment || !health)
    return (
      <p className="text-xs leading-5 text-amber-800 dark:text-amber-300">
        {assortment?.reason ??
          "Не удалось прочитать состояние ассортимента. Остальные показатели доступны."}
      </p>
    );
  const noSales = health.noSales[21];
  const frozen = health.frozenValue;
  const frozenUsable =
    (frozen.state === "AVAILABLE" || frozen.state === "PARTIAL") &&
    frozen.value !== null &&
    frozen.value > 0;
  return (
    <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
      <p>
        <strong className="font-semibold text-[var(--foreground)]">
          Ассортимент:
        </strong>{" "}
        {noSales.value === null
          ? "товары без продаж 21 день не подтверждены"
          : `${noSales.state === "PARTIAL" ? "не менее " : ""}${formatProductPositions(noSales.value)} без продаж 21 день`}
        {frozenUsable
          ? ` · в остатке ${frozen.state === "PARTIAL" ? "оценочно " : ""}${formatMoney(frozen.value!)}`
          : ""}{" "}
        <Link
          href={href}
          prefetch={false}
          className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
        >
          Открыть <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </p>
      <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
        {health.inventory.asOf
          ? `Остатки на ${formatDay(health.inventory.asOf.slice(0, 10))}`
          : "Дата остатков неизвестна"}
        {assortment.state !== "AVAILABLE" && assortment.reason
          ? ` · ${assortment.reason}`
          : ""}
      </p>
    </div>
  );
}

export function ExecutivePriorities({
  summary,
  operations,
  staff = { data: null, error: "Персонал ещё не проверен." },
  staffLoading = false,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
  staff?: StaffPriorityLoad;
  staffLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = buildPriorities(summary, operations, staff);
  const counts = priorityLevelCounts(items);
  const limited =
    !staff.data ||
    staffPriorityKinds.some(
      (kind) => staff.data?.metrics[kind]?.state !== "AVAILABLE",
    );
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <section
      aria-labelledby="priorities-title"
      className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2
          id="priorities-title"
          className="text-lg font-semibold text-[var(--foreground)]"
        >
          Требует внимания
        </h2>
        <p className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {counts.urgent ? (
            <span className="rounded-md bg-red-100 px-2 py-1 text-red-800 dark:bg-red-950/60 dark:text-red-200">
              {counts.urgent} срочно
            </span>
          ) : null}
          {counts.today ? (
            <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
              {counts.today} сегодня
            </span>
          ) : null}
          {counts.data ? (
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {counts.data} данные
            </span>
          ) : null}
        </p>
      </div>
      {items.length ? (
        <ul className="mt-4 grid gap-2">
          {visible.map((item) => {
            const style = levelStyles[item.level];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="grid grid-cols-[4px_minmax(0,1fr)] gap-3 rounded-xl bg-[var(--surface-muted)] py-3 pr-3 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800/80"
                >
                  <span
                    aria-hidden="true"
                    className={`rounded-full ${style.stripe}`}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap gap-x-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                      <span className={style.text}>{style.label}</span>
                      <span>{item.club ?? "Сеть"}</span>
                    </span>
                    <strong className="mt-0.5 block text-sm text-[var(--foreground)]">
                      {item.title}
                    </strong>
                    <span className="mt-0.5 block text-xs leading-5 tabular-nums text-zinc-600 dark:text-zinc-300">
                      {item.caption}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Нет подтверждённых сигналов для этой выборки.
        </p>
      )}
      {items.length > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 min-h-10 text-sm font-semibold text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
        >
          {expanded ? "Свернуть" : `Показать все (${items.length})`}
        </button>
      ) : null}
      <div className="mt-4 border-t border-[var(--border-soft)] pt-3">
        <AssortmentLine summary={summary} operations={operations} />
      </div>
      <details className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          {staffLoading
            ? "Проверяем персонал…"
            : limited
              ? "Проверка персонала ограничена"
              : "Персонал проверен"}{" "}
          · Источники
        </summary>
        <p className="mt-2">
          Персонал — текущие обязательства; продажи и падение клубов — за
          выбранный период. Падение клуба проверяется для периодов от 7 дней:
          от 20% — «сегодня», от 50% — «срочно».
        </p>
        {staffLoading ? (
          <p role="status">Загружаем текущие задачи и обучение.</p>
        ) : staff.error ? (
          <p>{staff.error}</p>
        ) : null}
        {staff.data ? (
          <>
            <p>
              Проверено:{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Asia/Yekaterinburg",
              }).format(new Date(staff.data.evaluatedAt))}{" "}
              (Екатеринбург).{" "}
              {staff.data.scope.includesNetworkAssignments
                ? "Включены общесетевые обязательства."
                : "Общесетевые обязательства не отнесены к выбранным клубам."}
            </p>
            {staffPriorityKinds.map((kind) => (
              <p key={kind}>
                {staffPriorityLabels[kind]}:{" "}
                {staff.data!.metrics[kind]?.reason ??
                  `${staff.data!.metrics[kind]?.value ?? "—"}`}
              </p>
            ))}
          </>
        ) : null}
        {(["averageProductCheck", "revenuePerVisit"] as const).map((key) => {
          const metric = summary.metrics[key];
          return (
            <p key={key} className="mt-1">
              {metricLabels[key]}:{" "}
              {metric?.state === "AVAILABLE"
                ? metric.comparison
                  ? "сравнение рассчитано."
                  : summary.scope.comparison
                    ? "нет сопоставимого прошлого периода."
                    : "сравнение периодов отключено."
                : (metric?.reason ?? "источник пока не подтверждён.")}
            </p>
          );
        })}
      </details>
    </section>
  );
}

function MetricSources({ summary }: { summary: ExecutiveSummary }) {
  const keys: ExecutiveMetricKey[] = [
    "productRevenue",
    "revenue",
    "visits",
    "serviceRevenue",
    "topups",
    "revenuePerVisit",
    "load",
  ];
  return (
    <details className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200">
      <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        Источники и методика показателей
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map((key) => {
          const metric = summary.metrics[key];
          return (
            <div key={key} className="rounded-lg bg-[var(--surface-muted)] p-3">
              <p className="font-semibold text-[var(--foreground)]">
                {metricLabels[key as keyof typeof metricLabels] ?? key}
              </p>
              <p className="mt-1 text-xs leading-5">{metric.definition}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {metricEvidence(metric)}
              </p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

const trendOrder: ExecutiveTrendMetric[] = [
  "productRevenue",
  "revenue",
  "visits",
  "averageProductCheck",
  "revenuePerVisit",
  "load",
];

function trendOptions(summary: ExecutiveSummary) {
  const available: ExecutiveTrendMetric[] = [];
  const unavailable: ExecutiveTrendMetric[] = [];
  for (const key of trendOrder) {
    // While services are unconfirmed, revenue equals the product line.
    if (key === "revenue" && headlineKey(summary) !== "revenue") continue;
    const metric = summary.metrics[key];
    if (!metric) continue;
    if (metric.state === "MISSING") unavailable.push(key);
    else available.push(key);
  }
  return { available, unavailable };
}

export function ExecutiveDashboard({
  summary,
  operations,
  priorities,
  history,
  initialTrend,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
  priorities?: ReactNode;
  history?: ExecutiveHistory;
  initialTrend?: string;
}) {
  const { available, unavailable } = trendOptions(summary);
  const fallback = available[0] ?? "productRevenue";
  const [trendMetric, setTrendMetric] = useState<ExecutiveTrendMetric>(
    available.includes(initialTrend as ExecutiveTrendMetric)
      ? (initialTrend as ExecutiveTrendMetric)
      : fallback,
  );
  const chartId = useId();
  function selectTrend(metricKey: ExecutiveTrendMetric) {
    setTrendMetric(metricKey);
    // Shallow URL update: the choice survives reload and sharing without a new request.
    const url = new URL(window.location.href);
    if (metricKey === fallback) url.searchParams.delete("trend");
    else url.searchParams.set("trend", metricKey);
    window.history.replaceState(null, "", url);
  }
  const bound = summary.clubs.filter(
    (club) => club.metrics.visits.state !== "MISSING",
  ).length;
  const tabs = (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Показатель на графике"
        className="inline-flex flex-wrap gap-1 rounded-xl bg-[var(--surface-muted)] p-1"
      >
        {available.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={trendMetric === key}
            aria-controls={chartId}
            onClick={() => selectTrend(key)}
            className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${trendMetric === key ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-zinc-600 hover:text-[var(--foreground)] dark:text-zinc-300"}`}
          >
            {metricLabels[key]}
          </button>
        ))}
      </div>
      {unavailable.length ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Не подтверждены:{" "}
          {unavailable.map((key) => metricLabels[key].toLowerCase()).join(", ")}
        </span>
      ) : null}
    </div>
  );
  const historyDetails = history?.data
    ? `${clubDetailHref(history.data, trendMetric)}&returnPeriod=full-day`
    : clubDetailHref(summary, trendMetric);
  return (
    <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)] xl:grid-rows-[auto_auto_auto_1fr]">
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        <Headline summary={summary} history={history} />
      </div>
      <div className="min-w-0 xl:col-start-2 xl:row-span-4 xl:row-start-1">
        {priorities ?? (
          <ExecutivePriorities summary={summary} operations={operations} />
        )}
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-2">
        <ExecutiveClubTable summary={summary} />
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-3">
        <ExecutiveTrendChart
          summary={summary}
          history={history}
          metricKey={trendMetric}
          label={metricLabels[trendMetric]}
          id={chartId}
          detailsHref={historyDetails}
          tabs={tabs}
          note={
            trendMetric === "visits" && bound < summary.clubs.length ? (
              <span>
                Визиты — по клубам с привязанными сессиями ({bound} из{" "}
                {summary.clubs.length})
              </span>
            ) : undefined
          }
        />
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-4">
        <MetricSources summary={summary} />
      </div>
    </div>
  );
}
