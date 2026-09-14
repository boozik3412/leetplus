import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
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

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

export default async function NoSalesTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const period = ([7, 14, 21, 30] as const).includes(
    Number(searchParam(params.noSalesDays ?? params.period)) as
      | 7
      | 14
      | 21
      | 30,
  )
    ? (Number(searchParam(params.noSalesDays ?? params.period)) as
        | 7
        | 14
        | 21
        | 30)
    : 21;
  const report = await getOperationalReport({
    ...(searchParam(params.from) && searchParam(params.to)
      ? { from: searchParam(params.from), to: searchParam(params.to) }
      : lastFullDaysRange(period)),
    storeId: searchParam(params.storeId),
    storeIds: searchParamsArray(params.storeIds),
    categoryIds: searchParamsArray(params.categoryIds),
    asOf: searchParam(params.asOf),
    noSalesDays: period,
  });
  const rows = report.productsWithoutSales.map((row) => ({
    storeName: row.storeName,
    name: row.name,
    categoryName: row.categoryName ?? "",
    supplierName: row.supplierName ?? "",
    lastSaleDate: row.lastSaleDate ?? "",
    daysWithoutSales: row.daysWithoutSales ?? null,
    stockQuantity: row.stockQuantity,
    frozenStockUnitValue: row.frozenStockUnitValue ?? "Нет оценки",
    frozenStockValuation: frozenStockValuationLabel(row.frozenStockValuation),
    frozenStockAmount: row.frozenStockAmount ?? "Нет оценки",
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Товары без продаж" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Товары без продаж
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Полный отчёт без ограничения строк. {frozenStockFormulaText}{" "}
          {frozenStockScopeText}
        </p>
      </div>
      <SimpleReportTable
        title="Товары без продаж"
        rows={rows}
        columns={[
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "lastSaleDate", label: "Дата последней продажи" },
          {
            key: "daysWithoutSales",
            label: "Дней без продаж",
            align: "right",
          },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          {
            key: "frozenStockUnitValue",
            label: "Оценка, руб/шт",
            align: "right",
          },
          { key: "frozenStockValuation", label: "Источник оценки" },
          { key: "frozenStockAmount", label: "Заморожено", align: "right" },
        ]}
        filters={[
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "categoryName", label: "Категория", type: "select" },
          { key: "supplierName", label: "Поставщик", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
