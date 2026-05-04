import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getNewProductsReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function dateRange(from: string, to: string) {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export default async function NewProductsTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getNewProductsReport({
    storeId: searchParam(params.storeId),
  });
  const dates = dateRange(report.from, report.to);
  const rows = report.rows.map((row) => {
    const salesByDate = new Map(
      row.dailySales.map((sale) => [sale.date, sale.quantity]),
    );

    return {
      storeName: row.firstSeenStoreName,
      name: row.name,
      categoryName: row.categoryName ?? "",
      supplierName: row.supplierName ?? "",
      firstSeenDate: row.firstSeenDate,
      currentStockQuantity: row.currentStockQuantity,
      unitCost: row.unitCost ?? null,
      ...Object.fromEntries(
        dates.map((date) => [date, salesByDate.get(date) ?? 0]),
      ),
    };
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Новинки" />
        <h1 className="text-3xl font-semibold tracking-tight">Новинки</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Сводная таблица новых товаров с продажами по дням.
        </p>
      </div>
      <SimpleReportTable
        title="Новинки"
        rows={rows}
        columns={[
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          { key: "firstSeenDate", label: "Дата первого остатка" },
          { key: "currentStockQuantity", label: "Остаток", align: "right" },
          { key: "unitCost", label: "Себестоимость", align: "right" },
          ...dates.map((date) => ({
            key: date,
            label: formatDateLabel(date),
            align: "right" as const,
          })),
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
