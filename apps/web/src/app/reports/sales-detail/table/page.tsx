import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SalesDetailReportTable } from "@/components/sales-detail-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getSalesDetailReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SalesDetailTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const report = await getSalesDetailReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Общий отчет по продажам" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Полный отчет
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Общий отчет по продажам
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Все строки продаж за период {report.from} - {report.to}: товар,
              клуб, цены, себестоимость, прибыль, маржа, наценка, поставщик,
              категория, источник и внешние ID.
            </p>
          </div>
          <a
            href="/reports"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к отчетам
          </a>
        </div>
      </div>

      <SalesDetailReportTable
        rows={report.rows}
        defaultEmail={user.email}
        from={report.from}
        to={report.to}
        storeId={report.storeId}
      />
    </main>
  );
}
