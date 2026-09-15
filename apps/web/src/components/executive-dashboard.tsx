import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartLineDown,
  Info,
  Package,
} from "@phosphor-icons/react/dist/ssr";
import { ExecutiveClubTable } from "@/components/executive-club-table";
import { ExecutiveTrendChart } from "@/components/executive-trend-chart";
import { buildAssortmentReportHref } from "@/lib/assortment-report-query";
import type { DashboardMetric } from "@/lib/dashboard-summary";
import type {
  ExecutiveMetric,
  ExecutiveMetricKey,
  ExecutiveOperations,
  ExecutiveSummary,
} from "@/lib/dashboard-executive";

const labels: Record<
  Exclude<
    ExecutiveMetricKey,
    "serviceRevenue" | "topups" | "productRevenueShare"
  >,
  string
> = {
  revenue: "Выручка",
  visits: "Визиты",
  revenuePerVisit: "Доход на визит",
  load: "Загрузка",
  productRevenue: "Товарная выручка",
};

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatMoney(value: number) {
  return `${formatNumber(value)} ₽`;
}

function formatProductPositions(value: number) {
  const absolute = Math.abs(value);
  const lastTwoDigits = absolute % 100;
  const lastDigit = absolute % 10;
  const label =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "товарных позиций"
      : lastDigit === 1
        ? "товарная позиция"
        : lastDigit >= 2 && lastDigit <= 4
          ? "товарные позиции"
          : "товарных позиций";
  return `${formatNumber(value)} ${label}`;
}

function formatMetric(metric: ExecutiveMetric) {
  if (metric.value === null) return "—";
  if (metric.unit === "RUB" || metric.unit === "RUB_PER_VISIT")
    return formatMoney(metric.value);
  if (metric.unit === "PERCENT") return `${formatNumber(metric.value, 1)}%`;
  return formatNumber(metric.value);
}

function formatDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

function formatPeriod(summary: ExecutiveSummary) {
  return summary.scope.period.from === summary.scope.period.to
    ? formatDay(summary.scope.period.from)
    : `${formatDay(summary.scope.period.from)}–${formatDay(summary.scope.period.to)}`;
}

function formatDelta(metric: ExecutiveMetric) {
  const comparison = metric.comparison;
  if (!comparison || comparison.absoluteDelta === null) return null;
  const sign = comparison.absoluteDelta > 0 ? "+" : "";
  const absolute =
    metric.unit === "RUB" || metric.unit === "RUB_PER_VISIT"
      ? `${sign}${formatMoney(comparison.absoluteDelta)}`
      : metric.unit === "PERCENT"
        ? `${sign}${formatNumber(comparison.pointsDelta ?? comparison.absoluteDelta, 1)} п.п.`
        : `${sign}${formatNumber(comparison.absoluteDelta)}`;
  return comparison.percentDelta === null
    ? `${absolute} к прошлому периоду`
    : `${comparison.percentDelta > 0 ? "+" : ""}${formatNumber(comparison.percentDelta, 1)}% · ${absolute}`;
}

function coverage(metric: ExecutiveMetric) {
  if (!metric.coverage) return null;
  const basis = metric.coverage.basis.toLowerCase().replaceAll("_", " ");
  return metric.coverage.total === null
    ? `Подтверждено: ${formatNumber(metric.coverage.covered)} (${basis})`
    : `Покрытие: ${formatNumber(metric.coverage.covered)} из ${formatNumber(metric.coverage.total)} ${basis}`;
}

function ratioOperands(metric: ExecutiveMetric) {
  if (!metric.ratio) return null;
  const { denominatorLabel, denominatorValue, numeratorLabel, numeratorValue } =
    metric.ratio;
  return `${numeratorLabel}: ${numeratorValue === null ? "—" : formatNumber(numeratorValue)} · ${denominatorLabel}: ${denominatorValue === null ? "—" : formatNumber(denominatorValue)}`;
}

function metricEvidence(metric: ExecutiveMetric) {
  const state = {
    AVAILABLE: "Подтверждено",
    PARTIAL: "Частично подтверждено",
    MISSING: "Нет данных",
    STALE: "Данные устарели",
    FAILED: "Источник недоступен",
  }[metric.state];
  const details = [
    state,
    metric.reason,
    coverage(metric),
    metric.factAsOf ? `Факты на ${metric.factAsOf.slice(0, 10)}` : null,
  ].filter(Boolean);
  return details.join(" · ");
}

function assortmentEvidence(assortment: ExecutiveOperations["assortment"]) {
  const state = {
    AVAILABLE: "Подтверждено",
    PARTIAL: "Частично подтверждено",
    MISSING: "Нет данных",
    STALE: "Данные устарели",
    FAILED: "Источник недоступен",
  }[assortment.state];
  return [state, assortment.reason].filter(Boolean).join(" · ");
}

function healthMetricEvidence(metric: DashboardMetric<number> | undefined) {
  if (!metric || metric.state === "AVAILABLE") return null;
  const state = {
    PARTIAL: "Частично подтверждено",
    STALE: "Данные устарели",
    MISSING: "Нет данных",
    FAILED: "Источник недоступен",
    UNKNOWN: "Состояние неизвестно",
  }[metric.state];
  return [state, metric.reason].filter(Boolean).join(" · ");
}

function hasCurrentAssortmentPriorityEvidence(
  assortment: ExecutiveOperations["assortment"] | undefined,
  metric: DashboardMetric<number> | undefined,
) {
  return (
    (assortment?.state === "AVAILABLE" || assortment?.state === "PARTIAL") &&
    (metric?.state === "AVAILABLE" || metric?.state === "PARTIAL")
  );
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

function MetricCard({
  summary,
  metricKey,
  primary = false,
}: {
  summary: ExecutiveSummary;
  metricKey: Exclude<
    ExecutiveMetricKey,
    "serviceRevenue" | "topups" | "productRevenueShare"
  >;
  primary?: boolean;
}) {
  const metric = summary.metrics[metricKey];
  const statusBorder =
    metric.state === "FAILED"
      ? "border-red-200 dark:border-red-900/70"
      : metric.state === "PARTIAL" || metric.state === "MISSING"
        ? "border-amber-200 dark:border-amber-900/70"
        : "border-[var(--border-soft)]";
  const needsContext = metric.state !== "AVAILABLE";
  const delta = formatDelta(metric);
  const statusClass = delta
    ? delta.startsWith("-")
      ? "text-red-700 dark:text-red-300"
      : "text-emerald-700 dark:text-emerald-300"
    : "text-zinc-500 dark:text-zinc-400";
  return (
    <Link
      href={detailHref(summary, metricKey)}
      className={`group flex min-w-0 flex-col rounded-2xl border bg-[var(--surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${statusBorder} ${primary ? "min-h-[184px] sm:p-5" : "min-h-[174px]"}`}
    >
      <span className="flex items-start justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300">
        <span>{labels[metricKey]}</span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:text-emerald-600 dark:group-hover:text-emerald-300"
          aria-hidden="true"
        />
      </span>
      <strong
        className={`mt-4 break-words font-semibold tracking-tight tabular-nums text-[var(--foreground)] ${primary ? "text-4xl sm:text-5xl" : "text-3xl"}`}
      >
        {formatMetric(metric)}
      </strong>
      <span
        className={`mt-2 min-h-5 text-xs font-semibold leading-5 ${statusClass}`}
      >
        {delta ??
          (metric.value === null
            ? (metric.reason ?? "Показатель пока недоступен")
            : "Без сопоставимого сравнения")}
      </span>
      <span className="mt-auto pt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {metricKey === "productRevenue" &&
        summary.metrics.productRevenueShare.value !== null
          ? `${formatNumber(summary.metrics.productRevenueShare.value, 1)}% общей выручки`
          : metric.ratio
            ? ratioOperands(metric)
            : null}
      </span>
      {needsContext ? (
        <span className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {metricEvidence(metric)}
        </span>
      ) : null}
    </Link>
  );
}

function Trend({ summary }: { summary: ExecutiveSummary }) {
  return <ExecutiveTrendChart summary={summary} />;
}

function Priorities({
  summary,
  operations,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
}) {
  const assortment = operations?.assortment;
  const health = assortment?.data;
  const outOfStockMetric = health?.outOfStock;
  const outOfStock = health?.outOfStock.value;
  const items = [
    hasCurrentAssortmentPriorityEvidence(assortment, outOfStockMetric) &&
    outOfStock !== null &&
    outOfStock !== undefined &&
    outOfStock > 0
      ? {
          title: "Пополнить позиции без остатка",
          caption: `${formatProductPositions(outOfStock)} в клубах`,
          href: buildAssortmentReportHref(
            assortmentScope(summary),
            "out-of-stock",
          ),
          icon: Package,
        }
      : null,
    summary.metrics.visits.state === "AVAILABLE" &&
    summary.metrics.visits.comparison?.previousValue !== null &&
    summary.metrics.visits.comparison?.absoluteDelta !== null &&
    (summary.metrics.visits.comparison?.absoluteDelta ?? 0) < 0
      ? {
          title: "Разобрать снижение визитов",
          caption:
            formatDelta(summary.metrics.visits) ??
            "Визиты снизились к прошлому периоду",
          href: detailHref(summary, "visits"),
          icon: ChartLineDown,
        }
      : null,
    summary.metrics.revenue.state !== "AVAILABLE"
      ? {
          title: "Проверить полноту выручки",
          caption:
            summary.metrics.revenue.reason ??
            "Главная метрика считается по подтверждённой части",
          href: detailHref(summary, "revenue"),
          icon: Info,
        }
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as Array<{
    title: string;
    caption: string;
    href: string;
    icon: typeof Package;
  }>;
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Приоритеты
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            Что сделать сегодня
          </h2>
        </div>
        <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
          {items.length}
        </span>
      </div>
      {items.length ? (
        <div className="mt-4 divide-y divide-[var(--border-soft)]">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                href={item.href}
                className="group flex gap-3 py-4 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-[var(--foreground)]">
                    {item.title}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    {item.caption}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Открыть <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Нет подтверждённых приоритетов для этой выборки.
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Выбрано по подтверждённым фактам и качеству данных.
      </p>
    </section>
  );
}

function AssortmentBrief({
  summary,
  operations,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
}) {
  const assortment = operations?.assortment;
  const health = assortment?.data;
  const scope = assortmentScope(summary);
  const showAssortmentState =
    assortment !== undefined && assortment.state !== "AVAILABLE";
  const assortmentStateClass =
    assortment?.state === "FAILED"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100"
      : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100";
  const items = [
    {
      label: "Нет в наличии",
      metric: health?.outOfStock,
      href: buildAssortmentReportHref(scope, "out-of-stock"),
    },
    {
      label: "Закончится за 3 дня",
      metric: health?.lowStock,
      href: buildAssortmentReportHref(scope, "low-stock"),
    },
    {
      label: "Без продаж 21 день",
      metric: health?.noSales[21],
      href: buildAssortmentReportHref(scope, "no-sales"),
    },
  ];
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Состояние ассортимента
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Сигналы по выбранным клубам
          </p>
        </div>
        <Link
          href={buildAssortmentReportHref(scope, "dashboard")}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
        >
          Открыть <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {!assortment || !health ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          {assortment?.reason ??
            "Не удалось прочитать состояние ассортимента. Основные KPI остаются доступны."}
        </p>
      ) : (
        <>
          {showAssortmentState ? (
            <p
              className={`mt-5 rounded-xl border px-3 py-3 text-sm leading-6 ${assortmentStateClass}`}
            >
              {assortmentEvidence(assortment)}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {items.map((item) => {
              const evidence = healthMetricEvidence(item.metric);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span className="block h-1 w-6 rounded-full bg-amber-400" />
                  <strong className="mt-4 block break-words text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                    {item.metric?.value === null ||
                    item.metric?.value === undefined
                      ? "—"
                      : formatNumber(item.metric.value)}
                  </strong>
                  <span className="mt-2 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    {item.label}
                  </span>
                  {evidence ? (
                    <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {evidence}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {health.inventory.asOf
              ? `Остатки на ${formatDay(health.inventory.asOf)}`
              : "Дата остатков неизвестна"}
            {health.inventory.reason ? ` · ${health.inventory.reason}` : ""}
          </p>
        </>
      )}
    </section>
  );
}

function MetricSources({ summary }: { summary: ExecutiveSummary }) {
  const items = [
    summary.metrics.revenue,
    summary.metrics.visits,
    summary.metrics.revenuePerVisit,
    summary.metrics.load,
    summary.metrics.productRevenue,
  ];
  return (
    <details className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200">
      <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        Источники и методика показателей
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((metric) => (
          <div
            key={metric.key}
            className="rounded-lg bg-[var(--surface-muted)] p-3"
          >
            <p className="font-semibold text-[var(--foreground)]">
              {labels[metric.key as keyof typeof labels] ?? metric.key}
            </p>
            <p className="mt-1 text-xs leading-5">{metric.definition}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {metricEvidence(metric)}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ExecutiveDashboard({
  summary,
  operations,
}: {
  summary: ExecutiveSummary;
  operations: ExecutiveOperations | null;
}) {
  const service = summary.metrics.serviceRevenue;
  const topups = summary.metrics.topups;
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-y border-[var(--border-soft)] py-3 text-xs text-zinc-600 dark:text-zinc-300">
        <span>
          {formatPeriod(summary)} · {summary.scope.storeIds.length}{" "}
          {summary.scope.storeIds.length === 1
            ? "клуб"
            : summary.scope.storeIds.length >= 2 &&
                summary.scope.storeIds.length <= 4
              ? "клуба"
              : "клубов"}
        </span>
      </div>
      <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <div className="col-span-2 xl:col-span-1">
          <MetricCard summary={summary} metricKey="revenue" primary />
        </div>
        <MetricCard summary={summary} metricKey="visits" />
        <MetricCard summary={summary} metricKey="revenuePerVisit" />
        <MetricCard summary={summary} metricKey="load" />
        <MetricCard summary={summary} metricKey="productRevenue" />
      </section>
      <section className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
          <strong className="text-[var(--foreground)]">Услуги: </strong>
          {service.value === null
            ? (service.reason ?? "Отдельная часть услуг пока не подтверждена.")
            : formatMetric(service)}
          {service.value === null
            ? " Главная выручка показывает только подтверждённую товарную часть."
            : ""}
        </div>
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
          <strong className="text-[var(--foreground)]">
            Пополнения баланса:{" "}
          </strong>
          {formatMetric(topups)}. Они показаны отдельно и не складываются с
          выручкой.
        </div>
      </section>
      <MetricSources summary={summary} />
      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]">
        <Trend summary={summary} />
        <Priorities summary={summary} operations={operations} />
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]">
        <ExecutiveClubTable summary={summary} />
        <AssortmentBrief summary={summary} operations={operations} />
      </section>
    </>
  );
}
