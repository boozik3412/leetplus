import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getOperationalReport } from "@/lib/reports";

export default async function OosTablePage() {
  await requireCurrentUser();
  const report = await getOperationalReport({});
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
