import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { frozenStockValuationLabel } from "@/lib/frozen-stock";
import {
  getInventoryTurnoverReport,
  type InventoryTurnoverRow,
} from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: InventoryTurnoverRow["status"]) {
  const labels: Record<InventoryTurnoverRow["status"], string> = {
    OK: "Норма",
    SLOW: "Медленный SKU",
    FROZEN: "Без продаж",
  };

  return labels[status];
}

export default async function InventoryTurnoverTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getInventoryTurnoverReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });
  const rows = report.rows.map((row) => ({
    status: statusLabel(row.status),
    storeName: row.storeName,
    name: row.name,
    categoryName: row.categoryName ?? "Без категории",
    supplierName: row.supplierName ?? "Без поставщика",
    stockQuantity: row.stockQuantity,
    soldQuantity: row.soldQuantity,
    averageDailySales: row.averageDailySales,
    stockDays: row.stockDays,
    turnoverRate: row.turnoverRate,
    revenue: row.revenue,
    grossProfit: row.grossProfit,
    frozenStockUnitValue: row.frozenStockUnitValue,
    frozenStockValuation: frozenStockValuationLabel(row.frozenStockValuation),
    frozenStockAmount: row.frozenStockAmount,
    lastSaleDate: row.lastSaleDate,
    daysWithoutSales: row.daysWithoutSales,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Оборачиваемость" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Оборачиваемость и медленные SKU
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Полный отчет по текущему остатку: продажи за {report.periodDays} дн.,
          дни запаса, деньги в остатках и источник оценки. Медленные SKU -
          запас от 30 дней; без продаж - остаток без продаж за выбранный период.
        </p>
      </div>
      <SimpleReportTable
        title="Оборачиваемость и медленные SKU"
        rows={rows}
        columns={[
          { key: "status", label: "Статус" },
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "averageDailySales", label: "Ср/день", align: "right" },
          { key: "stockDays", label: "Дней запаса", align: "right" },
          { key: "turnoverRate", label: "Оборот/остаток", align: "right" },
          { key: "revenue", label: "Выручка", align: "right" },
          { key: "grossProfit", label: "Прибыль", align: "right" },
          { key: "frozenStockUnitValue", label: "Оценка/шт", align: "right" },
          { key: "frozenStockValuation", label: "Источник" },
          { key: "frozenStockAmount", label: "Деньги в остатках", align: "right" },
          { key: "lastSaleDate", label: "Последняя продажа" },
          { key: "daysWithoutSales", label: "Дней без продаж", align: "right" },
        ]}
        filters={[
          { key: "status", label: "Статус", type: "select" },
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "categoryName", label: "Категория", type: "select" },
          { key: "supplierName", label: "Поставщик", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
