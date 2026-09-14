import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import {
  getOperationalReport,
  type GrossProfitAtRisk,
  type OutOfStockRiskProduct,
} from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatCoverage(value: number | null) {
  return value === null
    ? "покрытие неизвестно"
    : `покрытие ${Math.round(value)}%`;
}

function grossProfitAtRiskValue(
  legacyValue: number | null,
  metric: GrossProfitAtRisk["perDay"] | undefined,
) {
  const value = metric?.value ?? legacyValue;
  return value ?? "Нет данных";
}

function grossProfitRiskEvidence(
  risk: OutOfStockRiskProduct["grossProfitAtRisk"],
) {
  if (!risk) {
    return "Причина оценки прибыли в риске не получена.";
  }

  const metric = risk.forPeriod;

  if (metric.value === null) {
    return (
      metric.reason ?? "Нет подтвержденной себестоимости для оценки риска."
    );
  }

  const basis = {
    CLUB_PURCHASE_PRICE: "закупочная цена клуба",
    SALES_UNIT_COST: "себестоимость продаж",
    PRODUCT_PURCHASE_PRICE: "закупочная цена товара",
    SALE_PRICE_ESTIMATE: "оценка по продажной цене",
    UNKNOWN: "основание не подтверждено",
  } as const;
  const state = {
    AVAILABLE: "подтверждено",
    PARTIAL: "частично",
    STALE: "устарело",
    MISSING: "нет данных",
    FAILED: "источник с ошибкой",
    UNKNOWN: "неизвестно",
  } as const;
  const asOf = metric.asOf ? ` · на ${formatDate(metric.asOf)}` : "";

  return `${basis[risk.costBasis]} · ${state[metric.state]} · ${formatCoverage(metric.coverage.percent)}${asOf}`;
}

export default async function OosTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const requestedStatus = searchParam(params.stockStatus);
  const stockStatus =
    requestedStatus === "LOW_STOCK" || requestedStatus === "OUT_OF_STOCK"
      ? requestedStatus
      : undefined;
  const report = await getOperationalReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
    storeIds: searchParamsArray(params.storeIds),
    categoryIds: searchParamsArray(params.categoryIds),
    asOf: searchParam(params.asOf),
    stockStatus,
  });
  const title =
    stockStatus === "LOW_STOCK"
      ? "Закончится за 3 дня"
      : stockStatus === "OUT_OF_STOCK"
        ? "Нет в наличии"
        : "Риски по остаткам";
  const metric =
    stockStatus === "LOW_STOCK"
      ? report.assortmentHealth?.lowStock
      : report.assortmentHealth?.outOfStock;
  const rows = report.outOfStockRiskProducts.map((row) => ({
    storeName: row.storeName,
    supplierName: row.supplierName ?? "Без поставщика",
    categoryName: row.categoryName ?? "Без категории",
    name: row.name,
    stockQuantity: row.stockQuantity,
    averageDailySales: row.averageDailySales,
    revenueAtRiskPerDay: row.revenueAtRiskPerDay ?? "Нет данных",
    grossProfitAtRiskPerDay: grossProfitAtRiskValue(
      row.grossProfitAtRiskPerDay,
      row.grossProfitAtRisk?.perDay,
    ),
    grossProfitAtRiskForPeriod: grossProfitAtRiskValue(
      row.grossProfitAtRiskForPeriod,
      row.grossProfitAtRisk?.forPeriod,
    ),
    grossProfitRiskEvidence: grossProfitRiskEvidence(row.grossProfitAtRisk),
    stockDays: row.stockDays,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current={title} />
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Полный отчёт за {formatDate(report.from)}–{formatDate(report.to)}
          {report.asOf
            ? `; остатки рассчитаны на ${formatDate(report.asOf)}.`
            : "."}
        </p>
        {metric ? (
          <p className="mt-1 text-xs text-zinc-500">
            {metric.reason ?? "Подтверждённый расчёт"} ·{" "}
            {formatCoverage(metric.coverage.percent)}
            {metric.asOf
              ? ` · данные остатков на ${formatDate(metric.asOf)}`
              : ""}
          </p>
        ) : null}
      </div>
      <SimpleReportTable
        title={title}
        rows={rows}
        columns={[
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          {
            key: "averageDailySales",
            label: "ССР",
            align: "right",
            tooltip:
              "ССР — среднесуточные продажи: количество проданных единиц товара за последние 21 полный день, делённое на 21.",
          },
          {
            key: "revenueAtRiskPerDay",
            label: "Выручка в риске / день",
            align: "right",
          },
          {
            key: "grossProfitAtRiskPerDay",
            label: "Прибыль в риске / день",
            align: "right",
          },
          {
            key: "grossProfitAtRiskForPeriod",
            label: "Прибыль в риске за период",
            align: "right",
          },
          {
            key: "grossProfitRiskEvidence",
            label: "Основание оценки",
            tooltip:
              "Прибыль в риске — оценка недополученной прибыли при OOS, а не фактическая потеря. Основание, покрытие и дата относятся к подтверждённой себестоимости.",
          },
          { key: "stockDays", label: "Остаток в днях", align: "right" },
        ]}
        filters={[
          { key: "storeName", label: "Клуб", type: "multi-select" },
          { key: "supplierName", label: "Поставщик", type: "multi-select" },
          { key: "categoryName", label: "Категория", type: "multi-select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
