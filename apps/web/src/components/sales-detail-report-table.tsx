"use client";

import { SimpleReportTable } from "@/components/simple-report-table";
import type { SimpleReportRow } from "@/components/simple-report-table";
import type { SalesDetailRow } from "@/lib/reports";

function toDisplayRows(rows: SalesDetailRow[]): SimpleReportRow[] {
  return rows.map((row) => ({
    saleDate: new Date(row.saleDate).toLocaleString("ru-RU"),
    storeName: row.storeName,
    article: row.article,
    productName: row.productNameAtSale ?? row.productName,
    categoryName: row.categoryName,
    supplierName: row.supplierName,
    quantity: row.quantity,
    revenue: row.revenue,
    cost: row.cost,
    unitSalePrice: row.unitSalePrice,
    unitCost: row.unitCost,
    grossProfit: row.grossProfit,
    marginPercent: `${row.marginPercent.toFixed(1)}%`,
    markupPercent: `${row.markupPercent.toFixed(1)}%`,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    facing: row.facing,
    source: row.source,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalSaleId: row.externalSaleId,
    externalProductId: row.externalProductId,
    externalClubId: row.externalClubId,
    isCanceled: row.isCanceled ? "Да" : "Нет",
  }));
}

const fullColumns = [
  { key: "saleDate", label: "Дата" },
  { key: "storeName", label: "Клуб" },
  { key: "article", label: "Артикул" },
  { key: "productName", label: "Товар" },
  { key: "categoryName", label: "Категория" },
  { key: "supplierName", label: "Поставщик" },
  { key: "quantity", label: "Продажи", align: "right" as const },
  { key: "revenue", label: "Выручка", align: "right" as const },
  { key: "cost", label: "Себестоимость", align: "right" as const },
  { key: "unitSalePrice", label: "Цена", align: "right" as const },
  { key: "unitCost", label: "Себ. ед.", align: "right" as const },
  { key: "grossProfit", label: "Прибыль", align: "right" as const },
  { key: "marginPercent", label: "Маржа", align: "right" as const },
  { key: "markupPercent", label: "Наценка", align: "right" as const },
  { key: "purchasePrice", label: "Закупка", align: "right" as const },
  { key: "salePrice", label: "Прайс", align: "right" as const },
  { key: "facing", label: "Фейсинг", align: "right" as const },
  { key: "source", label: "Источник" },
  { key: "externalProvider", label: "Провайдер" },
  { key: "externalDomain", label: "Домен" },
  { key: "externalSaleId", label: "ID продажи" },
  { key: "externalProductId", label: "ID товара" },
  { key: "externalClubId", label: "ID клуба" },
  { key: "isCanceled", label: "Отменена" },
];

const previewColumns = [
  { key: "saleDate", label: "Дата" },
  { key: "storeName", label: "Клуб" },
  { key: "article", label: "Артикул" },
  { key: "productName", label: "Товар" },
  { key: "quantity", label: "Продажи", align: "right" as const },
  { key: "revenue", label: "Выручка", align: "right" as const },
  { key: "cost", label: "Себестоимость", align: "right" as const },
  { key: "grossProfit", label: "Прибыль", align: "right" as const },
  { key: "marginPercent", label: "Маржа", align: "right" as const },
  { key: "source", label: "Источник" },
];

export function SalesDetailReportTable({ rows }: { rows: SalesDetailRow[] }) {
  return (
    <SimpleReportTable
      title="Общий отчет по продажам"
      rows={toDisplayRows(rows)}
      filters={[
        { key: "storeName", label: "Клуб", type: "multi-select" },
        { key: "categoryName", label: "Категория", type: "multi-select" },
        { key: "supplierName", label: "Поставщик", type: "multi-select" },
        { key: "source", label: "Источник", type: "multi-select" },
        { key: "productName", label: "Товар", type: "text" },
      ]}
      columns={fullColumns}
    />
  );
}

export function SalesDetailPreviewTable({ rows }: { rows: SalesDetailRow[] }) {
  const previewRows = toDisplayRows(rows).slice(0, 20);

  return (
    <div className="overflow-x-auto bg-white dark:bg-zinc-950">
      <table className="w-full min-w-[1120px] text-left text-xs">
        <thead className="bg-zinc-100 uppercase text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-500">
          <tr>
            {previewColumns.map((column) => (
              <th
                key={column.key}
                className={[
                  "px-3 py-2 font-medium",
                  column.align === "right" ? "text-right" : "",
                ].join(" ")}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/45">
          {previewRows.map((row, index) => (
            <tr key={index}>
              {previewColumns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    "px-3 py-2",
                    column.align === "right" ? "text-right tabular-nums" : "",
                  ].join(" ")}
                >
                  {String(row[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
