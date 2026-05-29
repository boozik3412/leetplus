import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { ReportEmailInlineForm } from "@/components/report-email-inline-form";
import { SimpleReportTable, type SimpleReportRow } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getReplenishmentReport, type ReplenishmentRisk, type ReplenishmentRow } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function riskLabel(risk: ReplenishmentRisk) {
  const labels: Record<ReplenishmentRisk, string> = {
    OUT_OF_STOCK: "Нет остатка",
    LOW_STOCK: "Низкий остаток",
    OK: "В норме",
    NO_SALES: "Нет продаж",
  };

  return labels[risk];
}

function toRows(rows: ReplenishmentRow[]): SimpleReportRow[] {
  return rows.map((row) => ({
    risk: riskLabel(row.risk),
    article: row.article,
    name: row.name,
    storeName: row.storeName,
    categoryName: row.categoryName ?? "",
    supplierName: row.supplierName ?? "",
    stockQuantity: row.stockQuantity,
    soldQuantity: row.soldQuantity,
    averageDailySales: row.averageDailySales,
    stockDays: row.stockDays,
    dailyNeed: row.dailyNeed,
    recommendedOrder: row.recommendedOrder,
  }));
}

function exportHref({
  from,
  to,
  storeId,
  format,
}: {
  from: string;
  to: string;
  storeId: string | null;
  format: "xlsx" | "csv";
}) {
  const params = new URLSearchParams({
    report: "replenishment",
    format,
    from,
    to,
  });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return `/api/reports/export?${params.toString()}`;
}

const replenishmentExportTableState = {
  filters: {
    risk: "replenishmentRisk",
    storeName: "replenishmentStoreName",
    categoryName: "replenishmentCategoryName",
    supplierName: "replenishmentSupplierName",
    name: "replenishmentProductName",
  },
  sortKey: "replenishmentSort",
  sortDirection: "replenishmentSortDirection",
};

export default async function ReplenishmentTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const report = await getReplenishmentReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Остатки и потребность" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Полный отчет
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Остатки и потребность
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Все позиции по клубам за период {formatDateLabel(report.from)} -{" "}
              {formatDateLabel(report.to)}: остаток, среднесуточная
              реализация, потребность и рекомендованный заказ.
            </p>
          </div>
          <a
            href="/reports#replenishment"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к отчетам
          </a>
        </div>
      </div>

      <SimpleReportTable
        title="Остатки и потребность"
        rows={toRows(report.rows)}
        columns={[
          { key: "risk", label: "Статус" },
          { key: "article", label: "Артикул" },
          { key: "name", label: "Товар" },
          { key: "storeName", label: "Клуб" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "averageDailySales", label: "ССР", align: "right" },
          { key: "stockDays", label: "Дней", align: "right" },
          { key: "dailyNeed", label: "Потребность", align: "right" },
          { key: "recommendedOrder", label: "Заказать", align: "right" },
        ]}
        filters={[
          { key: "risk", label: "Статус", type: "multi-select" },
          { key: "storeName", label: "Клуб", type: "multi-select" },
          { key: "categoryName", label: "Категория", type: "multi-select" },
          { key: "supplierName", label: "Поставщик", type: "multi-select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
        serverExports={[
          {
            label: "XLSX файл",
            href: exportHref({
              from: report.from,
              to: report.to,
              storeId: report.storeId,
              format: "xlsx",
            }),
            tableStateParams: replenishmentExportTableState,
          },
          {
            label: "CSV файл",
            href: exportHref({
              from: report.from,
              to: report.to,
              storeId: report.storeId,
              format: "csv",
            }),
            tableStateParams: replenishmentExportTableState,
          },
        ]}
        extraActions={
          <>
            <ReportEmailInlineForm
              defaultEmail={user.email}
              from={report.from}
              to={report.to}
              storeId={report.storeId}
              report="replenishment"
              buttonLabel="Отправить"
            />
          </>
        }
      />
    </main>
  );
}
