import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getSuppliersPerformanceReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SupplierScorecardTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getSuppliersPerformanceReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });
  const rows = report.rows.map((row) => ({
    supplierName: row.supplierName,
    activeSku: row.activeSku,
    soldQuantity: row.soldQuantity,
    revenue: row.revenue,
    cost: row.cost,
    grossProfit: row.grossProfit,
    marginPercent: row.marginPercent,
    salesSharePercent: row.salesSharePercent,
    profitSharePercent: row.profitSharePercent,
    averageRevenuePerSku: row.averageRevenuePerSku,
    writeOffQuantity: row.writeOffQuantity,
    writeOffAmount: row.writeOffAmount,
    oosSkuCount: row.oosSkuCount,
    slowSkuCount: row.slowSkuCount,
    frozenSkuCount: row.frozenSkuCount,
    frozenStockAmount: row.frozenStockAmount,
    problemCategoryName: row.problemCategoryName ?? "",
    paymentDelayDays: row.paymentDelayDays,
    minOrderAmount: row.minOrderAmount,
    orderMultiplicity: row.orderMultiplicity,
    deliveryQuality: row.deliveryQualityNote,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Карточка поставщика" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Карточка поставщика
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Полный supplier scorecard: продажи, прибыль, списания, OOS, медленные
          SKU, деньги в остатках, условия поставщика и проблемная категория.
        </p>
      </div>
      <SimpleReportTable
        title="Карточка поставщика"
        rows={rows}
        columns={[
          { key: "supplierName", label: "Поставщик" },
          { key: "activeSku", label: "SKU", align: "right" },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "revenue", label: "Выручка", align: "right" },
          { key: "grossProfit", label: "Прибыль", align: "right" },
          { key: "marginPercent", label: "Маржа", align: "right" },
          { key: "salesSharePercent", label: "Доля продаж", align: "right" },
          { key: "profitSharePercent", label: "Доля прибыли", align: "right" },
          { key: "averageRevenuePerSku", label: "Выручка/SKU", align: "right" },
          { key: "writeOffQuantity", label: "Списания шт", align: "right" },
          { key: "writeOffAmount", label: "Списания руб", align: "right" },
          { key: "oosSkuCount", label: "OOS SKU", align: "right" },
          { key: "slowSkuCount", label: "Медленные", align: "right" },
          { key: "frozenSkuCount", label: "Без продаж", align: "right" },
          { key: "frozenStockAmount", label: "Остатки руб", align: "right" },
          { key: "problemCategoryName", label: "Проблемная категория" },
          { key: "paymentDelayDays", label: "Отсрочка", align: "right" },
          { key: "minOrderAmount", label: "Мин. заказ", align: "right" },
          { key: "orderMultiplicity", label: "Кратность", align: "right" },
          { key: "deliveryQuality", label: "Поставки" },
        ]}
        filters={[
          { key: "supplierName", label: "Поставщик", type: "text" },
          { key: "problemCategoryName", label: "Проблемная категория", type: "select" },
        ]}
      />
    </main>
  );
}
