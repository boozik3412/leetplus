import { RecommendationsWorkflowTable } from "@/components/recommendations-workflow-table";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getOperationalReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950 dark:text-zinc-100">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Рекомендации" />
        <h1 className="text-3xl font-semibold tracking-tight">Рекомендации</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Рабочий список автоматических рекомендаций с ответственными,
          статусами и финансовым эффектом.
        </p>
      </div>
      <RecommendationsWorkflowTable initialRows={report.recommendations} />
    </main>
  );
}
