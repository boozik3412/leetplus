import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { productAssortmentRoleLabel } from "@/lib/assortment-matrix";
import { requireCurrentUser } from "@/lib/auth";
import {
  getAssortmentMatrixReport,
  type AssortmentMatrixRow,
  type AssortmentMatrixStatus,
  type AssortmentQualityRow,
} from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatPercent(value: number | null) {
  return value === null ? "Нет обязательных SKU" : `${value.toFixed(1)}%`;
}

function statusLabel(status: AssortmentMatrixStatus) {
  const labels: Record<AssortmentMatrixStatus, string> = {
    SOLD: "Продается",
    IN_STOCK: "В наличии",
    NO_STOCK: "Нет остатка",
    NO_SALES: "Нет продаж",
    MISSING: "Не заведен в клубе",
    NEEDS_REPLENISHMENT: "Нужно пополнить",
    EXCLUDED: "Исключен",
  };

  return labels[status];
}

function qualityRows(rows: AssortmentQualityRow[]) {
  return rows.map((row) => ({
    name: row.name,
    qualityIndex: row.qualityIndex,
    mandatoryCells: row.mandatoryCells,
    healthyCells: row.healthyCells,
    missingCells: row.missingCells,
    noStockCells: row.noStockCells,
    noSalesCells: row.noSalesCells,
    replenishmentCells: row.replenishmentCells,
  }));
}

function matrixRows(rows: AssortmentMatrixRow[]) {
  return rows.map((row) => ({
    status: statusLabel(row.status),
    role: productAssortmentRoleLabel(row.assortmentRole),
    mandatory: row.isMandatory ? "Да" : "Нет",
    storeName: row.storeName,
    article: row.article,
    name: row.name,
    categoryName: row.categoryName ?? "Без категории",
    supplierName: row.supplierName ?? "Без поставщика",
    existsInStore: row.existsInStore ? "Да" : "Нет",
    stockQuantity: row.stockQuantity,
    soldQuantity: row.soldQuantity,
    averageDailySales: row.averageDailySales,
    stockDays: row.stockDays,
    revenue: row.revenue,
    grossProfit: row.grossProfit,
  }));
}

export default async function AssortmentMatrixTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getAssortmentMatrixReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Матрица ассортимента" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Матрица ассортимента
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Обязательные SKU, роли товаров, наличие по клубам, продажи за{" "}
          {report.periodDays} дн. и индекс качества матрицы.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <SummaryCard
            label="Индекс качества"
            value={formatPercent(report.summary.qualityIndex)}
          />
          <SummaryCard
            label="Обязательные ячейки"
            value={String(report.summary.mandatoryCells)}
          />
          <SummaryCard
            label="Не заведено"
            value={String(report.summary.missingCells)}
          />
          <SummaryCard
            label="Нужно пополнить"
            value={String(report.summary.replenishmentCells)}
          />
        </div>
      </div>

      <section className="border-y border-zinc-200">
        <SimpleReportTable
          title="Качество матрицы по клубам"
          rows={qualityRows(report.byStore)}
          columns={[
            { key: "name", label: "Клуб" },
            { key: "qualityIndex", label: "Индекс, %", align: "right" },
            { key: "mandatoryCells", label: "Обяз.", align: "right" },
            { key: "healthyCells", label: "Здоровые", align: "right" },
            { key: "missingCells", label: "Не заведено", align: "right" },
            { key: "noStockCells", label: "Нет остатка", align: "right" },
            { key: "noSalesCells", label: "Нет продаж", align: "right" },
            { key: "replenishmentCells", label: "Пополнить", align: "right" },
          ]}
          filters={[{ key: "name", label: "Клуб", type: "text" }]}
        />
      </section>

      <section className="border-b border-zinc-200">
        <SimpleReportTable
          title="Качество матрицы по категориям"
          rows={qualityRows(report.byCategory)}
          columns={[
            { key: "name", label: "Категория" },
            { key: "qualityIndex", label: "Индекс, %", align: "right" },
            { key: "mandatoryCells", label: "Обяз.", align: "right" },
            { key: "healthyCells", label: "Здоровые", align: "right" },
            { key: "missingCells", label: "Не заведено", align: "right" },
            { key: "noStockCells", label: "Нет остатка", align: "right" },
            { key: "noSalesCells", label: "Нет продаж", align: "right" },
            { key: "replenishmentCells", label: "Пополнить", align: "right" },
          ]}
          filters={[{ key: "name", label: "Категория", type: "text" }]}
        />
      </section>

      <SimpleReportTable
        title="Матрица товар x клуб"
        rows={matrixRows(report.rows)}
        columns={[
          { key: "status", label: "Статус" },
          { key: "role", label: "Роль" },
          { key: "mandatory", label: "Обяз." },
          { key: "storeName", label: "Клуб" },
          { key: "article", label: "Артикул" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "existsInStore", label: "Заведен" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "averageDailySales", label: "Ср/день", align: "right" },
          { key: "stockDays", label: "Дней запаса", align: "right" },
          { key: "revenue", label: "Выручка", align: "right" },
          { key: "grossProfit", label: "Прибыль", align: "right" },
        ]}
        filters={[
          { key: "status", label: "Статус", type: "select" },
          { key: "role", label: "Роль", type: "select" },
          { key: "mandatory", label: "Обяз.", type: "select" },
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "categoryName", label: "Категория", type: "select" },
          { key: "supplierName", label: "Поставщик", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
        {value}
      </p>
    </div>
  );
}
