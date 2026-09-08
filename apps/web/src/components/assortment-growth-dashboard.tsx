"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowsClockwise,
  CalendarCheck,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  Coins,
  Database,
  Equals,
  Info,
  Package,
  Receipt,
  ShoppingBagOpen,
  SquaresFour,
  Target,
  TrendDown,
  TrendUp,
  UsersThree,
  WarningCircle,
  Wrench,
  X,
} from "@phosphor-icons/react";
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
  DashboardMetricCalculation,
  DashboardAssortmentAction,
  DashboardAssortmentSourceHealth,
  DashboardSalesTrendSegment,
  DashboardSummary,
} from "@/lib/dashboard-summary";

type MetricTone = "emerald" | "blue" | "amber" | "zinc";

const metricTones: Record<
  MetricTone,
  { text: string; line: string; soft: string }
> = {
  emerald: {
    text: "text-emerald-600 dark:text-emerald-300",
    line: "#10b981",
    soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  blue: {
    text: "text-blue-600 dark:text-blue-300",
    line: "#3b82f6",
    soft: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-300",
    line: "#f59e0b",
    soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  zinc: {
    text: "text-zinc-950 dark:text-zinc-50",
    line: "#18181b",
    soft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  },
};

export function AssortmentGrowthDashboard({
  summary,
}: {
  summary: DashboardSummary;
}) {
  const growth = summary.assortmentGrowth;
  const drivers = growth.drivers;
  const calculationsWithData = growth.calculations.filter(
    (calculation) =>
      calculation.state === "READY" ||
      calculation.state === "PARTIAL_COVERAGE" ||
      calculation.state === "STALE",
  ).length;
  const calculationCaveats = growth.calculations.filter(
    (calculation) => calculation.state !== "READY",
  ).length;
  const opportunity = buildStoreOpportunity(summary);
  const freshSources = growth.sources.filter(
    (source) => source.state === "FRESH",
  ).length;
  const sourceAlert = growth.sources.some((source) =>
    ["FAILED", "MISSING"].includes(source.state),
  );

  return (
    <div className="space-y-5">
      <section
        className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
          sourceAlert
            ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"
            : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {sourceAlert ? (
            <WarningCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300"
              weight="fill"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300"
              weight="fill"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {freshSources} из {growth.sources.length} источников готовы
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              Дашборд отделяет точные чеки от товарных операций и скрывает
              производные метрики при конфликте источников.
            </p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm dark:bg-zinc-950 dark:text-emerald-300"
          title={
            calculationCaveats > 0
              ? `${calculationCaveats} с неполным покрытием; подробности есть в методике расчёта.`
              : "Все источники выбранного периода имеют полное покрытие."
          }
        >
          {calculationsWithData} рассчитано · {calculationCaveats} требуют
          внимания
        </span>
      </section>

      <SourceHealthPanel sources={growth.sources} />

      <ActionCenter actions={growth.actions} summary={summary} />

      <details className="group rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:text-zinc-200 sm:px-5">
          <span>Методика расчёта показателей</span>
          <CaretDown
            className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180"
            weight="bold"
            aria-hidden="true"
          />
        </summary>
        <div className="grid border-t border-zinc-100 dark:border-zinc-800 md:grid-cols-2 xl:grid-cols-3">
          {growth.calculations.map((calculation) => (
            <article
              key={calculation.key}
              className="border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800 md:border-r md:[&:nth-child(2n)]:border-r-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r-0"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {calculation.label}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${calculationStateTone(calculation.state)}`}
                >
                  {calculationStateLabel(calculation.state)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {calculation.formula}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                {calculation.source} · {calculation.grain}
              </p>
              {calculation.note ? (
                <p className="mt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                  {calculation.note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </details>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid sm:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.18fr]">
          <GrowthMetric
            label="Визиты"
            value={formatInteger(growth.visits.value)}
            detail="игровых сессий"
            delta={growth.visits.deltaPercent}
            tone="emerald"
            info="Количество игровых сессий, начавшихся в выбранном периоде."
            className="border-b border-zinc-100 dark:border-zinc-800 sm:border-r xl:border-0"
          />
          <EquationSign icon="arrow" />
          <GrowthMetric
            label="Товарные операции"
            value={formatInteger(growth.saleOperations.value)}
            detail={
              growth.saleOperations.per100Visits === null
                ? "нет данных о визитах"
                : `${formatDecimal(growth.saleOperations.per100Visits)} на 100 визитов`
            }
            delta={growth.saleOperations.deltaPercent}
            tone="emerald"
            info="Количество строк продажи из products/expense. Одна строка — операция по одному товару, а не целый чек."
            className="border-b border-zinc-100 dark:border-zinc-800 xl:border-0"
          />
          <EquationSign icon="multiply" />
          <GrowthMetric
            label="Средняя сумма операции"
            value={formatOptionalRubles(
              growth.averageSaleOperationAmount.value,
            )}
            detail="выручка на товарную операцию"
            delta={growth.averageSaleOperationAmount.deltaPercent}
            tone="emerald"
            info="Товарная выручка, делённая на точное количество товарных операций источника."
            className="border-b border-zinc-100 dark:border-zinc-800 sm:border-b-0 sm:border-r xl:border-0"
          />
          <EquationSign icon="equals" />
          <GrowthMetric
            label="Товарная выручка"
            value={formatRubles(growth.revenue.value)}
            detail="за выбранный период"
            delta={growth.revenue.deltaPercent}
            tone="emerald"
            info="Выручка выбранных клубов и категорий только по товарам."
            emphasized
          />
        </div>
      </section>

      <ReceiptMetricsPanel summary={summary} />

      <section className="grid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-2 xl:grid-cols-3">
        <TrendPanel
          title="Визиты"
          description={`Всего за период: ${formatInteger(growth.visits.value)}`}
          rows={summary.salesTrend}
          dataKey="visitsCount"
          tone="emerald"
          valueFormatter={formatInteger}
          className="md:border-r xl:border-b-0"
        />
        <TrendPanel
          title="Товарные операции на 100 визитов"
          description={
            growth.saleOperations.per100Visits === null
              ? "Недостаточно данных о визитах"
              : `Среднее: ${formatDecimal(growth.saleOperations.per100Visits)}`
          }
          rows={summary.salesTrend}
          dataKey="saleOperationsPer100Visits"
          tone="blue"
          valueFormatter={formatDecimal}
          className="xl:border-b-0 xl:border-r"
        />
        <TrendPanel
          title="Средняя сумма товарной операции"
          description={`Среднее: ${formatOptionalRubles(growth.averageSaleOperationAmount.value)}`}
          rows={summary.salesTrend}
          dataKey="averageSaleOperationAmount"
          tone="amber"
          valueFormatter={formatRubles}
          className="md:col-span-2 xl:col-span-1 xl:border-b-0"
        />
      </section>

      <ForecastPanel summary={summary} />

      <section className="grid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-2 xl:grid-cols-3">
        <DriverGroup
          title="Что растит визиты"
          tone="emerald"
          href="/guests"
          className="md:border-r xl:border-b-0"
          rows={[
            {
              icon: UsersThree,
              label: "Идентифицированные гости",
              value: formatInteger(drivers.identifiedActiveGuests),
              hint:
                drivers.guestIdentificationCoveragePercent === null
                  ? "в периоде нет визитов"
                  : `${formatPercent(drivers.guestIdentificationCoveragePercent)} визитов с ID гостя`,
            },
            {
              icon: ChartLineUp,
              label: "Сессий на гостя с ID",
              value:
                drivers.sessionsPerIdentifiedGuest === null
                  ? "Нет данных"
                  : formatDecimal(drivers.sessionsPerIdentifiedGuest),
              hint: "частота среди идентифицированных гостей",
            },
          ]}
        />
        <DriverGroup
          title="Что растит товарные операции"
          tone="blue"
          href="/reports/oos/table"
          className="xl:border-b-0 xl:border-r"
          rows={[
            {
              icon: CheckCircle,
              label: "Наличие активных SKU",
              value:
                drivers.availabilityPercent === null
                  ? "Нет данных"
                  : formatPercent(drivers.availabilityPercent),
              hint:
                drivers.stockCoveragePercent === null
                  ? "нет снимков остатков"
                  : `${formatInteger(summary.outOfStockRiskCount)} в OOS-риске · ${formatPercent(drivers.stockCoveragePercent)} SKU с остатками`,
            },
            {
              icon: ShoppingBagOpen,
              label: "Операций на 100 визитов",
              value:
                growth.saleOperations.per100Visits === null
                  ? "Нет данных"
                  : formatDecimal(growth.saleOperations.per100Visits),
              hint: formatPointsDelta(
                growth.saleOperations.per100VisitsDeltaPoints,
              ),
            },
          ]}
        />
        <DriverGroup
          title="Что растит сумму операции"
          tone="amber"
          href="/reports/top-sku/table"
          className="md:col-span-2 xl:col-span-1 xl:border-b-0"
          rows={[
            {
              icon: Package,
              label: "Товаров в операции",
              value:
                drivers.itemsPerSaleOperation === null
                  ? "Нет данных"
                  : `${formatDecimal(drivers.itemsPerSaleOperation)} шт`,
              hint: "количество в строке продажи",
            },
            {
              icon: Receipt,
              label: "Средняя цена товара",
              value:
                drivers.averageItemPrice === null
                  ? "Нет данных"
                  : formatRubles(drivers.averageItemPrice),
              hint: "товарный микс",
            },
            {
              icon: SquaresFour,
              label: "Категория-лидер",
              value: drivers.leadingCategory?.categoryName ?? "Нет данных",
              hint: drivers.leadingCategory
                ? `${formatPercent(drivers.leadingCategory.revenueSharePercent)} выручки`
                : "нет продаж",
            },
          ]}
        />
      </section>

      <CoverageGapsPanel summary={summary} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm dark:bg-zinc-950 dark:text-emerald-300">
            <Target className="h-7 w-7" weight="duotone" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {opportunity.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {opportunity.description}
            </p>
          </div>
          <Link
            href={opportunity.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            Разобрать возможность
            <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Маржа товаров
            <span title="Маржа остаётся защитной метрикой роста">
              <Info className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {drivers.productMarginPercent === null
              ? "Нет данных"
              : formatPercent(drivers.productMarginPercent)}
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {drivers.costCoveragePercent !== null &&
            drivers.costCoveragePercent < 100
              ? `Себестоимость подтверждена для ${formatPercent(drivers.costCoveragePercent)} операций.`
              : "Защитная метрика: рост товарных операций и их суммы не должен ухудшать прибыльность."}
          </p>
        </div>
      </section>
    </div>
  );
}

function SourceHealthPanel({
  sources,
}: {
  sources: DashboardAssortmentSourceHealth[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section
      aria-labelledby="source-health-title"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex min-h-14 items-center gap-2 px-2 sm:px-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="source-health-details"
          onClick={() => setIsOpen((current) => !current)}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:px-3"
        >
          <h2
            id="source-health-title"
            className="text-base font-semibold text-zinc-950 dark:text-zinc-50"
          >
            Свежесть и полнота данных
          </h2>
          <CaretDown
            className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            weight="bold"
            aria-hidden="true"
          />
        </button>
        <Link
          href="/sync"
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-emerald-300 sm:px-3"
        >
          Обновить данные
          <ArrowsClockwise
            className="h-4 w-4"
            weight="bold"
            aria-hidden="true"
          />
        </Link>
      </div>
      {isOpen ? (
        <div id="source-health-details" className="border-t border-zinc-100 dark:border-zinc-800">
          <p className="px-4 py-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:px-5">
            Каждый источник проверяется отдельно до расчёта производных метрик.
          </p>
          <div className="grid border-t border-zinc-100 dark:border-zinc-800 sm:grid-cols-2 xl:grid-cols-5">
            {sources.map((source) => (
              <article
                key={source.key}
                className="min-w-0 border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800 sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    <Database
                      className="h-5 w-5"
                      weight="duotone"
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${sourceStateTone(source.state)}`}
                  >
                    {sourceStateLabel(source.state)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {source.label}
                </p>
                <p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {source.detail}
                </p>
                <p className="mt-2 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {source.coveragePercent === null
                    ? formatSourceDate(source.lastFactAt)
                    : `${formatPercent(source.coveragePercent)} покрытия`}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionCenter({
  actions,
  summary,
}: {
  actions: DashboardAssortmentAction[];
  summary: DashboardSummary;
}) {
  return (
    <section
      aria-labelledby="action-center-title"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
            Приоритеты
          </p>
          <h2
            id="action-center-title"
            className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50"
          >
            Что сделать сегодня
          </h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          До {actions.length} действий по влиянию и качеству данных
        </p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {actions.map((action, index) => (
          <article
            key={action.key}
            className="grid gap-3 px-4 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center sm:px-5"
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold tabular-nums ${actionTone(action.tone).soft}`}
              aria-label={`Приоритет ${index + 1}`}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {action.title}
                </h3>
                <span
                  className={`text-xs font-semibold ${actionTone(action.tone).text}`}
                >
                  {action.metric}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {action.description}
                {action.impactRubles !== null && action.impactRubles > 0
                  ? ` Потенциал: ${formatSignedRubles(action.impactRubles)}.`
                  : ""}
              </p>
            </div>
            <Link
              href={buildActionHref(action.href, summary)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:w-auto"
            >
              Открыть
              <ArrowRight
                className="h-4 w-4"
                weight="bold"
                aria-hidden="true"
              />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReceiptMetricsPanel({ summary }: { summary: DashboardSummary }) {
  const receipts = summary.assortmentGrowth.methodology.receiptMetrics;
  const available =
    receipts.state === "READY" || receipts.state === "PARTIAL_COVERAGE";

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <Receipt
              className="h-5 w-5 text-blue-600 dark:text-blue-300"
              weight="duotone"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Покупки и средний чек
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {receipts.reason}
          </p>
        </div>
        <Link
          href="/import"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:w-auto"
        >
          Загрузить чеки
          <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric
          label="Покупки"
          value={
            available && receipts.purchaseCount !== null
              ? formatInteger(receipts.purchaseCount)
              : "Ожидает ID чека"
          }
          hint={
            receipts.coveragePercent === null
              ? "нет операций"
              : `${formatPercent(receipts.coveragePercent)} операций с ID`
          }
        />
        <CompactMetric
          label="Средний чек"
          value={
            available
              ? formatOptionalRubles(receipts.averageCheck)
              : "Нет данных"
          }
          hint="выручка на подтверждённый чек"
        />
        <CompactMetric
          label="Товаров в чеке"
          value={
            available && receipts.itemsPerCheck !== null
              ? `${formatDecimal(receipts.itemsPerCheck)} шт`
              : "Нет данных"
          }
          hint="по строкам с ID чека"
        />
        <CompactMetric
          label="Частая пара"
          value={
            receipts.topBasketPair
              ? `${receipts.topBasketPair.receiptsCount} чек.`
              : "Нет данных"
          }
          hint={
            receipts.topBasketPair
              ? `${receipts.topBasketPair.firstProductName} + ${receipts.topBasketPair.secondProductName}`
              : "появится при двух товарах в чеке"
          }
          last
        />
      </div>
    </section>
  );
}

function ForecastPanel({ summary }: { summary: DashboardSummary }) {
  const forecast = summary.assortmentGrowth.forecast;

  return (
    <section className="grid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
      <article className="min-w-0 border-b border-zinc-100 p-4 dark:border-zinc-800 sm:p-5 xl:border-b-0 xl:border-r">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck
                className="h-5 w-5 text-emerald-600 dark:text-emerald-300"
                weight="duotone"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Прогноз на 7 дней
              </h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {forecast.reason}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${forecastConfidenceTone(forecast.confidence)}`}
          >
            {forecastConfidenceLabel(forecast.confidence)} точность
          </span>
        </div>
        {forecast.days.length > 0 ? (
          <div
            className="mt-4 h-48 w-full"
            aria-label="Прогноз товарной выручки на семь дней"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={forecast.days}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e4e4e7"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  minTickGap={12}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  width={60}
                  tickFormatter={formatCompactRubles}
                />
                <Tooltip
                  cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
                  formatter={(value) => [
                    formatRubles(Number(value)),
                    "Прогноз",
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    borderRadius: 12,
                    borderColor: "#e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-4 flex h-48 items-center justify-center rounded-xl bg-zinc-50 px-6 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            Нужна история продаж, чтобы построить прогноз.
          </div>
        )}
      </article>
      <div className="grid sm:grid-cols-2 xl:grid-cols-1">
        <ForecastMetric
          icon={ChartLineUp}
          label="Базовый прогноз"
          value={formatOptionalRubles(forecast.revenue)}
          hint={
            forecast.suggestedTargetRevenue === null
              ? "нет базы"
              : `рекомендуемый план +${forecast.targetUpliftPercent}%: ${formatRubles(forecast.suggestedTargetRevenue)}`
          }
        />
        <ForecastMetric
          icon={WarningCircle}
          label="Выручка под риском OOS"
          value={formatOptionalRubles(forecast.lostRevenue)}
          hint={`${forecast.oosRiskSkuCount} SKU могут закончиться за 3 дня`}
        />
        <ForecastMetric
          icon={Coins}
          label="Эффект заказа"
          value={formatOptionalRubles(forecast.recoverableRevenue)}
          hint={`${formatInteger(forecast.recommendedOrderQuantity)} шт. в рекомендуемом заказе`}
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>
    </section>
  );
}

function CoverageGapsPanel({ summary }: { summary: DashboardSummary }) {
  const gaps = summary.assortmentGrowth.coverageGaps;
  const rows = [
    {
      label: "Без себестоимости",
      value: gaps.missingCostOperationCount,
      hint: `${formatRubles(gaps.missingCostRevenue)} выручки`,
      href: "/products/table",
    },
    {
      label: "Без остатка",
      value: gaps.missingStockSkuCount,
      hint: "не входят в OOS-прогноз",
      href: "/import",
    },
    {
      label: "Без категории",
      value: gaps.uncategorizedSkuCount,
      hint:
        gaps.uncategorizedRevenueSharePercent === null
          ? "нет товарной выручки"
          : `${formatPercent(gaps.uncategorizedRevenueSharePercent)} выручки`,
      href: "/categories/triage",
    },
    {
      label: "Похожие категории",
      value: gaps.categoryNormalizationCandidateCount,
      hint: "кандидаты на объединение",
      href: "/categories/triage",
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
      <div className="flex items-center gap-2">
        <Wrench
          className="h-5 w-5 text-zinc-600 dark:text-zinc-300"
          weight="duotone"
          aria-hidden="true"
        />
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          Пробелы, которые мешают точному расчёту
        </h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <Link
            key={row.label}
            href={buildActionHref(row.href, summary)}
            className="group rounded-xl border border-zinc-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {row.label}
              </p>
              <ArrowRight
                className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600"
                weight="bold"
                aria-hidden="true"
              />
            </div>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums ${row.value > 0 ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`}
            >
              {formatInteger(row.value)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {row.hint}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CompactMetric({
  label,
  value,
  hint,
  last = false,
}: {
  label: string;
  value: string;
  hint: string;
  last?: boolean;
}) {
  return (
    <article
      className={`min-w-0 border-b border-zinc-100 p-4 dark:border-zinc-800 sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r ${last ? "xl:border-r-0" : ""}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums text-blue-600 dark:text-blue-300">
        {value}
      </p>
      <p
        className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
        title={hint}
      >
        {hint}
      </p>
    </article>
  );
}

type ForecastIcon = typeof ChartLineUp;

function ForecastMetric({
  icon: Icon,
  label,
  value,
  hint,
  className = "",
}: {
  icon: ForecastIcon;
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <article
      className={`min-w-0 border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Icon className="h-5 w-5" weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {hint}
          </p>
        </div>
      </div>
    </article>
  );
}

function GrowthMetric({
  label,
  value,
  detail,
  delta,
  tone,
  info,
  emphasized = false,
  className = "",
}: {
  label: string;
  value: string;
  detail: string;
  delta: number | null;
  tone: MetricTone;
  info: string;
  emphasized?: boolean;
  className?: string;
}) {
  return (
    <article
      className={[
        "min-w-0 p-4 sm:p-5 xl:p-6",
        emphasized ? "bg-emerald-50/40 dark:bg-emerald-950/15" : "",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        {label}
        <span title={info}>
          <Info className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p
        className={`mt-3 truncate text-3xl font-semibold tracking-tight tabular-nums xl:mt-4 xl:text-4xl ${metricTones[tone].text}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {detail}
      </p>
      <DeltaValue value={delta} />
    </article>
  );
}

function EquationSign({ icon }: { icon: "arrow" | "multiply" | "equals" }) {
  const Icon = icon === "arrow" ? ArrowRight : icon === "multiply" ? X : Equals;

  return (
    <div className="hidden items-center justify-center text-zinc-400 xl:flex">
      <Icon className="h-6 w-6" weight="regular" aria-hidden="true" />
    </div>
  );
}

function DeltaValue({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <p className="mt-4 text-xs text-zinc-400">Нет сопоставимых данных</p>
    );
  }

  const positive = value >= 0;
  const Icon = positive ? TrendUp : TrendDown;

  return (
    <div
      className={`mt-4 inline-flex items-center gap-1 text-xs font-semibold ${
        positive
          ? "text-emerald-600 dark:text-emerald-300"
          : "text-red-600 dark:text-red-300"
      }`}
    >
      <Icon className="h-4 w-4" weight="bold" aria-hidden="true" />
      {positive ? "+" : ""}
      {formatDecimal(value)}% к прошлому периоду
    </div>
  );
}

function TrendPanel({
  title,
  description,
  rows,
  dataKey,
  tone,
  valueFormatter,
  className = "",
}: {
  title: string;
  description: string;
  rows: DashboardSalesTrendSegment[];
  dataKey:
    | "visitsCount"
    | "saleOperationsPer100Visits"
    | "averageSaleOperationAmount";
  tone: MetricTone;
  valueFormatter: (value: number) => string;
  className?: string;
}) {
  return (
    <article
      className={`min-w-0 border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800 sm:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {title}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${metricTones[tone].soft}`}
          style={{ backgroundColor: metricTones[tone].line }}
        />
      </div>
      <div className="mt-4 h-40 w-full" aria-label={`График: ${title}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e4e4e7"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              minTickGap={18}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                const rawValue = payload[0]?.value;
                const value = typeof rawValue === "number" ? rawValue : 0;

                return (
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {label}
                    </p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                      {valueFormatter(value)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={metricTones[tone].line}
              strokeWidth={2.5}
              dot={{ r: 3, fill: metricTones[tone].line, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

type DriverIcon = typeof UsersThree;

function DriverGroup({
  title,
  tone,
  href,
  rows,
  className = "",
}: {
  title: string;
  tone: MetricTone;
  href: string;
  className?: string;
  rows: {
    icon: DriverIcon;
    label: string;
    value: string;
    hint: string;
  }[];
}) {
  return (
    <article
      className={`flex min-w-0 flex-col border-b border-zinc-100 p-4 last:border-b-0 dark:border-zinc-800 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
          {title}
        </h2>
        <ArrowRight
          className={`h-5 w-5 ${metricTones[tone].text}`}
          weight="bold"
          aria-hidden="true"
        />
      </div>
      <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((row) => {
          const Icon = row.icon;

          return (
            <div
              key={row.label}
              className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-2"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${metricTones[tone].soft}`}
              >
                <Icon className="h-5 w-5" weight="duotone" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {row.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {row.hint}
                </p>
              </div>
              <p className="max-w-32 truncate text-right text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {row.value}
              </p>
            </div>
          );
        })}
      </div>
      <Link
        href={href}
        className="mt-auto inline-flex min-h-10 items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Смотреть детально
        <ArrowRight className="h-4 w-4" weight="bold" aria-hidden="true" />
      </Link>
    </article>
  );
}

function buildStoreOpportunity(summary: DashboardSummary) {
  const opportunity = summary.assortmentGrowth.opportunity;

  if (
    opportunity.state === "NO_DATA" ||
    !opportunity.storeName ||
    opportunity.gapPoints === null ||
    opportunity.revenueOpportunity === null
  ) {
    return {
      title: "Главная возможность появится после накопления данных",
      description:
        opportunity.reason ??
        "Для сравнения нужны минимум два клуба с подтверждённой общей выручкой.",
      href: "/dashboard/revenue-by-club",
    };
  }

  return {
    title: `Главная возможность: поднять долю товаров в ${opportunity.storeName}`,
    description:
      opportunity.gapPoints > 0
        ? `Клуб ниже медианы сети на ${formatDecimal(opportunity.gapPoints)} п.п. Ориентир при достижении медианы — ${formatSignedRubles(opportunity.revenueOpportunity)} за выбранный период.`
        : `Доля товарной выручки — ${formatPercent(opportunity.currentSharePercent ?? 0)}. Проверьте наличие хитов и предложение в часы максимального трафика.`,
    href: "/dashboard/revenue-by-club",
  };
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatInteger(value)} ₽`;
}

function formatOptionalRubles(value: number | null) {
  return value === null ? "Нет данных" : formatRubles(value);
}

function formatSignedRubles(value: number) {
  return `+${formatInteger(value)} ₽`;
}

function formatPercent(value: number) {
  return `${formatDecimal(value)}%`;
}

function formatPointsDelta(value: number | null) {
  if (value === null) {
    return "нет сопоставимого периода";
  }

  return `${value >= 0 ? "+" : ""}${formatDecimal(value)} п.п. к прошлому периоду`;
}

function formatCompactRubles(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSourceDate(value: string | null) {
  if (!value) {
    return "нет даты факта";
  }

  return `факт до ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value))}`;
}

function sourceStateLabel(state: DashboardAssortmentSourceHealth["state"]) {
  const labels: Record<DashboardAssortmentSourceHealth["state"], string> = {
    FRESH: "Готово",
    PARTIAL: "Неполно",
    STALE: "Устарело",
    MISSING: "Нет данных",
    FAILED: "Ошибка",
  };

  return labels[state];
}

function sourceStateTone(state: DashboardAssortmentSourceHealth["state"]) {
  if (state === "FRESH") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (state === "PARTIAL" || state === "STALE") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
}

function actionTone(tone: DashboardAssortmentAction["tone"]) {
  const tones: Record<
    DashboardAssortmentAction["tone"],
    { soft: string; text: string }
  > = {
    CRITICAL: {
      soft: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
      text: "text-red-600 dark:text-red-300",
    },
    WARNING: {
      soft: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
      text: "text-amber-600 dark:text-amber-300",
    },
    OPPORTUNITY: {
      soft: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      text: "text-emerald-600 dark:text-emerald-300",
    },
    INFO: {
      soft: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      text: "text-blue-600 dark:text-blue-300",
    },
  };

  return tones[tone];
}

function forecastConfidenceLabel(
  confidence: DashboardSummary["assortmentGrowth"]["forecast"]["confidence"],
) {
  if (confidence === "HIGH") {
    return "Высокая";
  }
  if (confidence === "MEDIUM") {
    return "Средняя";
  }
  return "Низкая";
}

function forecastConfidenceTone(
  confidence: DashboardSummary["assortmentGrowth"]["forecast"]["confidence"],
) {
  if (confidence === "HIGH") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (confidence === "MEDIUM") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

function buildActionHref(href: string, summary: DashboardSummary) {
  if (!href.startsWith("/reports/")) {
    return href;
  }

  const params = new URLSearchParams({
    from: summary.periodFrom,
    to: summary.periodTo,
  });

  if (summary.selectedStoreIds.length === 1) {
    params.set("storeId", summary.selectedStoreIds[0]);
  }

  return `${href}?${params.toString()}`;
}

function calculationStateLabel(state: DashboardMetricCalculation["state"]) {
  if (state === "READY") {
    return "Рассчитано";
  }

  if (state === "PARTIAL_COVERAGE") {
    return "Покрытие";
  }

  if (state === "SOURCE_UNAVAILABLE") {
    return "Нет источника";
  }

  if (state === "SOURCE_CONFLICT") {
    return "Конфликт";
  }

  if (state === "STALE") {
    return "Устарело";
  }

  return "Нет данных";
}

function calculationStateTone(state: DashboardMetricCalculation["state"]) {
  if (state === "READY") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (state === "PARTIAL_COVERAGE") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  if (state === "STALE") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  if (state === "SOURCE_CONFLICT") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }

  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}
