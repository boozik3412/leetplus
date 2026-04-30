import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getSkuPerformanceReport } from "@/lib/reports";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ storeId?: string }>;

export default async function TopSkuTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getSkuPerformanceReport({ storeId: params.storeId });
  const stores = await getStores();
  const storeName = params.storeId
    ? (stores.find((store) => store.id === params.storeId)?.name ?? "Клуб")
    : "Вся сеть";
  const rows = report.rows.map((row) => ({
    storeName,
    name: row.name,
    categoryName: row.categoryName ?? "",
    soldQuantity: row.soldQuantity,
    revenue: row.revenue,
    grossProfit: row.grossProfit,
    marginPercent: row.marginPercent,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          ТОП SKU по выручке
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Полный отчёт без ограничения строк.
        </p>
      </div>
      <SimpleReportTable
        title="ТОП SKU по выручке"
        rows={rows}
        columns={[
          { key: "storeName", label: "Клуб" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "revenue", label: "Выручка", align: "right" },
          { key: "grossProfit", label: "Прибыль", align: "right" },
          { key: "marginPercent", label: "Маржа", align: "right" },
        ]}
        filters={[
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "categoryName", label: "Категория", type: "select" },
          { key: "name", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
