import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getOperationalReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OosTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getOperationalReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });
  const rows = report.outOfStockRiskProducts.map((row) => ({
    storeName: row.storeName,
    name: row.name,
    stockQuantity: row.stockQuantity,
    averageDailySales: row.averageDailySales,
    stockDays: row.stockDays,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Риск out-of-stock" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Риск out-of-stock
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Полный отчёт без ограничения строк.
        </p>
      </div>
      <SimpleReportTable
        title="Риск out-of-stock"
        rows={rows}
        columns={[
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "stockQuantity", label: "Остаток", align: "right" },
          { key: "averageDailySales", label: "ССР", align: "right" },
          { key: "stockDays", label: "Остаток в днях", align: "right" },
        ]}
        filters={[
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
