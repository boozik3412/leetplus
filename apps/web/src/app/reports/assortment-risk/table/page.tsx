import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { buildAssortmentRiskSummary } from "@/lib/assortment-risk";
import {
  frozenStockFormulaText,
  frozenStockScopeText,
  frozenStockValuationLabel,
} from "@/lib/frozen-stock";
import { getOperationalReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function noSalesDaysParam(value: string | string[] | undefined) {
  const days = Number(searchParam(value));

  return ([7, 14, 21, 30] as const).includes(days as 7 | 14 | 21 | 30)
    ? (days as 7 | 14 | 21 | 30)
    : 21;
}

export default async function AssortmentRiskTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const noSalesDays = noSalesDaysParam(params.noSalesDays);
  const reportScope = {
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
    storeIds: searchParamsArray(params.storeIds),
    categoryIds: searchParamsArray(params.categoryIds),
    asOf: searchParam(params.asOf),
    noSalesDays,
  };
  const periodReport = await getOperationalReport({
    ...reportScope,
  });
  const noSalesReport = await getOperationalReport({
    ...reportScope,
  });
  const summary = buildAssortmentRiskSummary({
    oosRows: periodReport.outOfStockRiskProducts,
    noSalesRows: noSalesReport.productsWithoutSales,
    oosState: periodReport.assortmentHealth?.outOfStock.state,
    noSalesState: noSalesReport.assortmentHealth?.noSales[noSalesDays].state,
  });
  const rows = summary.rows.map((row) => ({
    riskTypeLabel: row.riskTypeLabel,
    storeName: row.storeName,
    name: row.name,
    categoryName: row.categoryName,
    supplierName: row.supplierName,
    stockQuantity: row.stockQuantity,
    averageDailySales: row.averageDailySales,
    stockDays: row.stockDays,
    profitAtRiskForPeriod: row.profitAtRiskForPeriod,
    frozenStockUnitValue: row.frozenStockUnitValue,
    frozenStockValuation: frozenStockValuationLabel(row.frozenStockValuation),
    frozenStockAmount: row.frozenStockAmount,
    totalRiskAmount: row.totalRiskAmount,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Деньги в риске" />
        <p className="text-sm font-medium text-emerald-700">Полный отчёт</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Деньги в риске
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Гибридный отчет: прибыль в риске из-за OOS за выбранный период и
          деньги, замороженные в товарах без движения {noSalesDays} дней.{" "}
          {frozenStockFormulaText} {frozenStockScopeText}
        </p>
      </div>
      <SimpleReportTable
        title="Деньги в риске"
        rows={rows}
        columns={[
          { key: "riskTypeLabel", label: "Тип риска" },
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          { key: "averageDailySales", label: "ССР", align: "right" },
          { key: "stockDays", label: "Дней остатка", align: "right" },
          {
            key: "profitAtRiskForPeriod",
            label: "Прибыль OOS за период",
            align: "right",
          },
          {
            key: "frozenStockUnitValue",
            label: "Оценка, руб/шт",
            align: "right",
          },
          { key: "frozenStockValuation", label: "Источник оценки" },
          {
            key: "frozenStockAmount",
            label: "Заморожено",
            align: "right",
          },
          { key: "totalRiskAmount", label: "Всего в риске", align: "right" },
        ]}
        filters={[
          { key: "riskTypeLabel", label: "Тип риска", type: "select" },
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "categoryName", label: "Категория", type: "select" },
          { key: "supplierName", label: "Поставщик", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
