import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import {
  getPlanFactReport,
  type PlanFactReportRow,
} from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function levelLabel(level: PlanFactReportRow["level"]) {
  const labels: Record<PlanFactReportRow["level"], string> = {
    network: "Вся сеть",
    store: "Клуб",
    category: "Категория",
    supplier: "Поставщик",
  };

  return labels[level];
}

export default async function PlanFactTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getPlanFactReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });
  const rows = [report.summary, ...report.rows].map((row) => ({
    level: levelLabel(row.level),
    name: row.name,
    currentRevenue: row.currentRevenue,
    planRevenue: row.planRevenue,
    revenueDelta: row.revenueDelta,
    revenueCompletionPercent: row.revenueCompletionPercent,
    currentGrossProfit: row.currentGrossProfit,
    planGrossProfit: row.planGrossProfit,
    grossProfitDelta: row.grossProfitDelta,
    grossProfitCompletionPercent: row.grossProfitCompletionPercent,
    currentQuantity: row.currentQuantity,
    planQuantity: row.planQuantity,
    quantityDelta: row.quantityDelta,
    quantityCompletionPercent: row.quantityCompletionPercent,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="План-факт" />
        <h1 className="text-3xl font-semibold tracking-tight">План-факт</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Факт выбранного периода сравнивается с предыдущим сопоставимым
          периодом той же длины: {report.planFrom} - {report.planTo}. Отчет
          разбит по сети, клубам, категориям и поставщикам.
        </p>
      </div>
      <SimpleReportTable
        title="План-факт"
        rows={rows}
        columns={[
          { key: "level", label: "Уровень" },
          { key: "name", label: "Название" },
          { key: "currentRevenue", label: "Факт выручки", align: "right" },
          { key: "planRevenue", label: "План выручки", align: "right" },
          { key: "revenueDelta", label: "Откл. выручки", align: "right" },
          { key: "revenueCompletionPercent", label: "% выручки", align: "right" },
          { key: "currentGrossProfit", label: "Факт прибыли", align: "right" },
          { key: "planGrossProfit", label: "План прибыли", align: "right" },
          { key: "grossProfitDelta", label: "Откл. прибыли", align: "right" },
          {
            key: "grossProfitCompletionPercent",
            label: "% прибыли",
            align: "right",
          },
          { key: "currentQuantity", label: "Факт шт", align: "right" },
          { key: "planQuantity", label: "План шт", align: "right" },
          { key: "quantityDelta", label: "Откл. шт", align: "right" },
          { key: "quantityCompletionPercent", label: "% шт", align: "right" },
        ]}
        filters={[
          { key: "level", label: "Уровень", type: "select" },
          { key: "name", label: "Название", type: "text" },
        ]}
      />
    </main>
  );
}
