import { requireCurrentUser } from "@/lib/auth";
import {
  getSkuPerformanceReport,
  type SkuPerformanceReport,
  type SkuPerformanceRow,
} from "@/lib/reports";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default async function AbcTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const baseFilters = {
    from: searchParam(params.from),
    to: searchParam(params.to),
  };
  const requestedStoreId = searchParam(params.storeId);
  const stores = await getStores();
  const reports = requestedStoreId
    ? [
        {
          title:
            stores.find((store) => store.id === requestedStoreId)?.name ??
            "Выбранный клуб",
          report: await getSkuPerformanceReport({
            ...baseFilters,
            storeId: requestedStoreId,
          }),
        },
      ]
    : [
        {
          title: "Вся сеть",
          report: await getSkuPerformanceReport(baseFilters),
        },
        ...(await Promise.all(
          stores.map(async (store) => ({
            title: store.name,
            report: await getSkuPerformanceReport({
              ...baseFilters,
              storeId: store.id,
            }),
          })),
        )),
      ];

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Полный отчёт</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              ABC-анализ
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Группы A/B/C по выручке и прибыли с раскрытием SKU по сети и
              клубам.
            </p>
          </div>
          <a
            href="/reports"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к отчётам
          </a>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-8">
        {reports.map(({ title, report }) => (
          <ReportSection key={title} title={title} report={report} />
        ))}
      </div>
    </main>
  );
}

function ReportSection({
  title,
  report,
}: {
  title: string;
  report: SkuPerformanceReport;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Период {report.from} — {report.to}. SKU: {report.rows.length}
        </p>
      </div>
      {(["A", "B", "C"] as const).map((group) => (
        <details key={group} className="border-b border-zinc-100 last:border-b-0">
          <summary className="cursor-pointer px-5 py-3 font-semibold">
            Группа {group}
          </summary>
          <SkuRows rows={report.rows.filter((row) => row.abcRevenueGroup === group)} />
        </details>
      ))}
    </section>
  );
}

function SkuRows({ rows }: { rows: SkuPerformanceRow[] }) {
  if (rows.length === 0) {
    return <p className="px-5 pb-4 text-sm text-zinc-500">Нет SKU.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="bg-zinc-100 uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Товар</th>
            <th className="px-3 py-2 font-medium">Категория</th>
            <th className="px-3 py-2 text-right font-medium">Продано</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
            <th className="px-3 py-2 text-right font-medium">Прибыль</th>
            <th className="px-3 py-2 text-right font-medium">Доля выручки</th>
            <th className="px-3 py-2 text-right font-medium">Доля прибыли</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.productId}>
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2">{row.categoryName ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                {row.soldQuantity.toLocaleString("ru-RU")}
              </td>
              <td className="px-3 py-2 text-right">{formatMoney(row.revenue)}</td>
              <td className="px-3 py-2 text-right">
                {formatMoney(row.grossProfit)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatPercent(row.revenueSharePercent)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatPercent(row.profitSharePercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
