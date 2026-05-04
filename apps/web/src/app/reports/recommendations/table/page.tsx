import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getOperationalReport, type ReportRecommendation } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function severityLabel(severity: ReportRecommendation["severity"]) {
  const labels: Record<ReportRecommendation["severity"], string> = {
    HIGH: "Высокий",
    MEDIUM: "Средний",
    LOW: "Низкий",
  };

  return labels[severity];
}

function kindLabel(kind: ReportRecommendation["kind"]) {
  const labels: Record<ReportRecommendation["kind"], string> = {
    REPLENISH_STOCK: "Пополнение",
    NO_SALES: "Без продаж",
    LOW_MARGIN: "Низкая маржа",
  };

  return labels[kind];
}

export default async function RecommendationsTablePage({
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
  const rows = report.recommendations.map((row) => ({
    severity: severityLabel(row.severity),
    kind: kindLabel(row.kind),
    storeName: row.storeName ?? "",
    productName: row.productName,
    title: row.title,
    description: row.description,
    action: row.action,
    metricLabel: row.metricLabel,
    metricValue: row.metricValue,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Рекомендации" />
        <h1 className="text-3xl font-semibold tracking-tight">Рекомендации</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Полный список автоматических рекомендаций по продажам, остаткам и
          маржинальности.
        </p>
      </div>
      <SimpleReportTable
        title="Рекомендации"
        rows={rows}
        columns={[
          { key: "severity", label: "Риск" },
          { key: "kind", label: "Тип" },
          { key: "storeName", label: "Клуб" },
          { key: "productName", label: "Товар" },
          { key: "title", label: "Рекомендация" },
          { key: "description", label: "Описание" },
          { key: "action", label: "Действие" },
          { key: "metricLabel", label: "Метрика" },
          { key: "metricValue", label: "Значение" },
        ]}
        filters={[
          { key: "severity", label: "Риск", type: "select" },
          { key: "kind", label: "Тип", type: "select" },
          { key: "storeName", label: "Клуб", type: "select" },
          { key: "productName", label: "Товар", type: "text" },
        ]}
      />
    </main>
  );
}
