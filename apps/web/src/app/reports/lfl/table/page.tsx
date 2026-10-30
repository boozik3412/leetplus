import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getLflReport,
  type LflGroupLevel,
  type LflPeriod,
  type LflReportRow,
} from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolvePeriod(value: string | string[] | undefined): LflPeriod {
  const period = searchParam(value);

  return period === "week" || period === "month" ? period : "day";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "нов." : `${value.toFixed(1)}%`;
}

function levelLabel(level: LflGroupLevel) {
  const labels: Record<LflGroupLevel, string> = {
    network: "Вся сеть",
    store: "Клубы",
    category: "Категории",
    product: "Товары",
  };

  return labels[level];
}

function exportHref(format: "csv" | "xlsx", period: LflPeriod) {
  const params = new URLSearchParams({
    format,
    report: "lfl",
    lflPeriod: period,
  });

  return `/api/reports/export?${params.toString()}`;
}

export default async function LflTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const report = await getLflReport(period);

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="LFL" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Полный отчет
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              LFL год к году
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              {report.currentFrom} - {report.currentTo} против{" "}
              {report.previousFrom} - {report.previousTo}. В расчет входят
              только сопоставимые пары “клуб + товар”, которые продавались в
              обоих периодах.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={exportHref("csv", period)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              CSV
            </a>
            <a
              href={exportHref("xlsx", period)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              XLSX
            </a>
            <a
              href="/reports"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Вернуться к отчетам
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-8">
        <LflRows title="Вся сеть" rows={[report.summary]} open />
        <LflRows
          title="Клубы"
          rows={report.rows.filter((row) => row.level === "store")}
          open
        />
        <LflRows
          title="Категории"
          rows={report.rows.filter((row) => row.level === "category")}
        />
        <LflRows
          title="Товары"
          rows={report.rows.filter((row) => row.level === "product")}
        />
      </div>
    </main>
  );
}

function LflRows({
  title,
  rows,
  open = false,
}: {
  title: string;
  rows: LflReportRow[];
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <summary className="cursor-pointer border-b border-zinc-200 px-5 py-4 text-lg font-semibold">
        {title} · {rows.length}
      </summary>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-xs">
            <thead className="bg-zinc-100 uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Уровень</th>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 text-right font-medium">
                  Выручка сейчас
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Выручка год назад
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  LFL выручка
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Прибыль сейчас
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Прибыль год назад
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  LFL прибыль
                </th>
                <th className="px-3 py-2 text-right font-medium">Штуки</th>
                <th className="px-3 py-2 text-right font-medium">
                  Штуки год назад
                </th>
                <th className="px-3 py-2 text-right font-medium">LFL штуки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-zinc-500">
                    {levelLabel(row.level)}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.currentRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.previousRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatPercent(row.revenueLflPercent)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.currentGrossProfit)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.previousGrossProfit)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatPercent(row.grossProfitLflPercent)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatQuantity(row.currentQuantity)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatQuantity(row.previousQuantity)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatPercent(row.quantityLflPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-zinc-500">Нет данных.</p>
      )}
    </details>
  );
}
