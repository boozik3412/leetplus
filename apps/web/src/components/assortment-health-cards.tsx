"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CaretDown,
  Coins,
  Package,
  TrendDown,
  WarningCircle,
} from "@phosphor-icons/react";
import { buildAssortmentReportHref } from "@/lib/assortment-report-query";
import type {
  DashboardMetric,
  DashboardSummary,
  DashboardValuationMetric,
} from "@/lib/dashboard-summary";

type MetricLike = DashboardMetric<number> | DashboardValuationMetric;

const unavailableMetric: DashboardMetric<number> = {
  value: null,
  state: "MISSING",
  reason: "Сводка остатков пока недоступна.",
  coverage: { covered: 0, total: 0, percent: null },
  asOf: null,
};

export function AssortmentHealthCards({
  summary,
  dashboardQuery,
}: {
  summary: DashboardSummary;
  dashboardQuery: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    skuGrouping: "club" | "network";
    asOf?: string;
  };
}) {
  const health = summary.assortmentHealth;
  const noSalesDays = summary.selectedNoSalesDays ?? 21;
  const scope = {
    from: summary.periodFrom,
    to: summary.periodTo,
    asOf: summary.selectedAssortmentAsOf,
    storeIds: summary.selectedStoreIds,
    categoryIds: summary.selectedCategoryIds,
    noSalesDays,
  } as const;
  const noSales = health?.noSales[noSalesDays] ?? unavailableMetric;
  const frozenValue = health?.frozenValue ?? unavailableMetric;

  return (
    <section aria-labelledby="assortment-health-title" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">
            Остатки
          </p>
          <h2
            id="assortment-health-title"
            className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50"
          >
            Показатели для действий по ассортименту
          </h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Продажи: {formatDate(summary.periodFrom)}–
          {formatDate(summary.periodTo)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Нет в наличии"
          value={health?.outOfStock ?? unavailableMetric}
          href={buildAssortmentReportHref(scope, "out-of-stock")}
          icon={
            <WarningCircle
              className="h-5 w-5"
              weight="duotone"
              aria-hidden="true"
            />
          }
          stockAsOf={health?.inventory.asOf}
        />
        <HealthCard
          label="Закончится за 3 дня"
          value={health?.lowStock ?? unavailableMetric}
          href={buildAssortmentReportHref(scope, "low-stock")}
          icon={
            <TrendDown
              className="h-5 w-5"
              weight="duotone"
              aria-hidden="true"
            />
          }
          stockAsOf={health?.inventory.asOf}
        />
        <HealthCard
          label="Без продаж"
          value={noSales}
          href={buildAssortmentReportHref(scope, "no-sales")}
          icon={
            <Package className="h-5 w-5" weight="duotone" aria-hidden="true" />
          }
          control={
            <NoSalesSelector
              scope={scope}
              selected={noSalesDays}
              dashboardQuery={dashboardQuery}
            />
          }
          stockAsOf={health?.inventory.asOf}
        />
        <HealthCard
          label="Деньги в этих остатках"
          value={frozenValue}
          href={buildAssortmentReportHref(scope, "no-sales")}
          icon={
            <Coins className="h-5 w-5" weight="duotone" aria-hidden="true" />
          }
          money
          stockAsOf={health?.inventory.asOf}
          valueDateLabel="данные оценки на"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <HealthCard
          label="Дни запаса и оборачиваемость"
          value={health?.turnoverDays ?? unavailableMetric}
          href={buildAssortmentReportHref(scope, "turnover")}
          compact
          unit="days"
          stockAsOf={health?.inventory.asOf}
          valueDateLabel="расчёт на"
        />
        <HealthCard
          label="Избыточный запас"
          value={
            health?.excessValue ?? health?.excessQuantity ?? unavailableMetric
          }
          href={buildAssortmentReportHref(scope, "excess")}
          compact
          money={Boolean(health?.excessValue)}
          stockAsOf={health?.inventory.asOf}
          valueDateLabel="данные оценки на"
        />
        <HealthCard
          label="Списания за период"
          value={health?.writeOffAmount ?? unavailableMetric}
          href={buildAssortmentReportHref(scope, "write-offs")}
          compact
          money
          secondary={health?.writeOffQuantity ?? unavailableMetric}
          secondaryLabel="Количество"
          dateLabel="движения на"
        />
      </div>
    </section>
  );
}

function NoSalesSelector({
  scope,
  selected,
  dashboardQuery,
}: {
  scope: Parameters<typeof buildAssortmentReportHref>[0];
  selected: 7 | 14 | 21 | 30;
  dashboardQuery: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    skuGrouping: "club" | "network";
    asOf?: string;
  };
}) {
  return (
    <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-[10px] font-semibold dark:border-zinc-800 dark:bg-zinc-900">
      {[7, 14, 21, 30].map((days) => {
        const active = days === selected;
        const href = `/assortment/dashboard?${dashboardScopeParams({ ...scope, noSalesDays: days as 7 | 14 | 21 | 30 }, dashboardQuery)}`;
        return (
          <Link
            key={days}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-1.5 py-1 transition ${active ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"}`}
          >
            {days}
          </Link>
        );
      })}
      <span className="self-center pr-1 text-zinc-500">дн.</span>
    </div>
  );
}

function HealthCard({
  label,
  value,
  href,
  icon,
  control,
  money = false,
  compact = false,
  unit,
  secondary,
  secondaryLabel,
  dateLabel = "остатки на",
  stockAsOf,
  valueDateLabel,
}: {
  label: string;
  value: MetricLike;
  href: string;
  icon?: ReactNode;
  control?: ReactNode;
  money?: boolean;
  compact?: boolean;
  unit?: "days";
  secondary?: MetricLike;
  secondaryLabel?: string;
  dateLabel?: string;
  stockAsOf?: string | null;
  valueDateLabel?: string;
}) {
  const degraded = value.state !== "AVAILABLE";
  const valuation = "basis" in value ? valuationBasisLabel(value.basis) : null;
  const valueDate = value.asOf
    ? `${dateLabel} ${formatDate(value.asOf)}`
    : dateLabel === "остатки на"
      ? "дата остатков неизвестна"
      : "дата движений неизвестна";
  const dataDate = stockAsOf
    ? `остатки на ${formatDate(stockAsOf)}`
    : valueDate;
  const additionalDate =
    stockAsOf && value.asOf && valueDateLabel
      ? `${valueDateLabel} ${formatDate(value.asOf)}`
      : null;
  return (
    <div className="relative">
      {control ? (
        <div className="absolute right-3 top-3 z-10">{control}</div>
      ) : null}
      <Link
        href={href}
        className={`group block rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-950 ${degraded ? "border-amber-200 dark:border-amber-900" : "border-zinc-200 dark:border-zinc-800"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {label}
          </p>
          {icon ? (
            <span className="text-emerald-600 dark:text-emerald-300">
              {icon}
            </span>
          ) : !control ? (
            <CaretDown
              className="h-4 w-4 text-zinc-400 group-hover:text-emerald-600"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <p
          className={`${compact ? "mt-3 text-2xl" : "mt-5 text-3xl"} font-semibold tabular-nums text-zinc-950 dark:text-zinc-50`}
        >
          {formatMetric(value.value, money, unit)}
        </p>
        <p className="mt-1 min-h-5 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {value.reason ?? stateLabel(value.state)}
        </p>
        <p className="mt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
          {coverageLabel(value)} · {dataDate}
          {additionalDate ? ` · ${additionalDate}` : ""}
          {valuation ? ` · ${valuation}` : ""}
        </p>
        {secondary ? (
          <p className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            {secondaryLabel}: {formatMetric(secondary.value, false)} ·{" "}
            {secondary.reason ?? stateLabel(secondary.state)}
          </p>
        ) : null}
      </Link>
    </div>
  );
}

function dashboardScopeParams(
  scope: Parameters<typeof buildAssortmentReportHref>[0],
  dashboardQuery: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    skuGrouping: "club" | "network";
    asOf?: string;
  },
) {
  const params = new URLSearchParams({
    period: dashboardQuery.period,
    noSalesDays: String(scope.noSalesDays),
    skuGrouping: dashboardQuery.skuGrouping,
  });
  if (dashboardQuery.dateFrom) params.set("dateFrom", dashboardQuery.dateFrom);
  if (dashboardQuery.dateTo) params.set("dateTo", dashboardQuery.dateTo);
  if (scope.asOf) params.set("asOf", scope.asOf);
  scope.storeIds.forEach((id) => params.append("storeIds", id));
  scope.categoryIds.forEach((id) => params.append("categoryIds", id));
  return params;
}

function formatMetric(value: number | null, money: boolean, unit?: "days") {
  if (value === null) return "Нет данных";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: unit === "days" ? 1 : 0,
  }).format(value);
  return money
    ? `${formatted} ₽`
    : unit === "days"
      ? `${formatted} дн.`
      : formatted;
}

function coverageLabel(value: MetricLike) {
  return value.coverage.percent === null
    ? "покрытие неизвестно"
    : `покрытие ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value.coverage.percent)}%`;
}

function stateLabel(state: MetricLike["state"]) {
  return (
    {
      AVAILABLE: "Подтверждённый расчёт",
      PARTIAL: "Частично подтверждено",
      STALE: "Данные устарели",
      MISSING: "Нет исходных данных",
      FAILED: "Источник завершился ошибкой",
      UNKNOWN: "Состояние источника неизвестно",
    } as const
  )[state];
}

function valuationBasisLabel(basis: DashboardValuationMetric["basis"]) {
  return (
    {
      CLUB_PURCHASE_PRICE: "закупочная цена клуба",
      SALES_UNIT_COST: "себестоимость продаж",
      PRODUCT_PURCHASE_PRICE: "закупочная цена товара",
      SALE_PRICE_ESTIMATE: "оценка по продажной цене",
      MIXED: "смешанная оценка",
      UNKNOWN: "оценка неизвестна",
    } as const
  )[basis];
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
