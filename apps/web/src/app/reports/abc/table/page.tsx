import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { SimpleReportTable } from "@/components/simple-report-table";
import { requireCurrentUser } from "@/lib/auth";
import { getSkuPerformanceReport } from "@/lib/reports";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * SKU rating and ABC in one table: it replaces the separate «ABC-анализ» and
 * «ТОП SKU по выручке» reports (the latter redirects here).
 */
export default async function SkuRatingTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const storeId = searchParam(params.storeId) || undefined;
  const [report, stores] = await Promise.all([
    getSkuPerformanceReport({
      from: searchParam(params.from),
      to: searchParam(params.to),
      storeId,
    }),
    getStores(),
  ]);
  const byRevenue = [...report.rows].sort((a, b) => b.revenue - a.revenue);
  const rows = byRevenue.map((row, index) => ({
    rank: index + 1,
    article: row.article,
    name: row.name,
    categoryName: row.categoryName ?? "Без категории",
    supplierName: row.supplierName ?? "Без поставщика",
    abcRevenueGroup: row.abcRevenueGroup,
    abcProfitGroup: row.abcProfitGroup,
    soldQuantity: row.soldQuantity,
    revenue: row.revenue,
    grossProfit: row.grossProfit,
    marginPercent: row.marginPercent,
    revenueSharePercent: row.revenueSharePercent,
    profitSharePercent: row.profitSharePercent,
    salesPerFacing: row.salesPerFacing,
  }));

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs current="Рейтинг SKU и ABC" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Полный отчёт</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Рейтинг SKU и ABC
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Продажи за {formatDateLabel(report.from)} —{" "}
              {formatDateLabel(report.to)} по дням клуба: место по выручке,
              группы ABC по выручке и прибыли, доли и эффективность фейса.
              Фильтруйте по группе, категории или поставщику и сортируйте по
              любой колонке.
            </p>
          </div>
          <a
            href="/reports"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к отчётам
          </a>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="block text-xs font-medium uppercase text-zinc-500">
            С
            <input
              type="date"
              name="from"
              defaultValue={report.from}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </label>
          <label className="block text-xs font-medium uppercase text-zinc-500">
            По
            <input
              type="date"
              name="to"
              defaultValue={report.to}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </label>
          <label className="block text-xs font-medium uppercase text-zinc-500">
            Клуб
            <select
              name="storeId"
              defaultValue={storeId ?? ""}
              className="mt-1 block rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="">Вся сеть</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-950 px-4 py-2 font-semibold text-white hover:bg-zinc-800"
          >
            Показать
          </button>
        </form>
      </div>
      <SimpleReportTable
        title="Рейтинг SKU и ABC"
        rows={rows}
        columns={[
          { key: "rank", label: "Место", align: "right" },
          { key: "article", label: "Артикул" },
          { key: "name", label: "Товар" },
          { key: "categoryName", label: "Категория" },
          { key: "supplierName", label: "Поставщик" },
          {
            key: "abcRevenueGroup",
            label: "ABC выручка",
            tooltip:
              "A — товары, дающие первые 80% выручки, B — следующие 15%, C — остальное.",
          },
          {
            key: "abcProfitGroup",
            label: "ABC прибыль",
            tooltip: "То же разбиение по валовой прибыли.",
          },
          { key: "soldQuantity", label: "Продано", align: "right" },
          { key: "revenue", label: "Выручка", align: "right" },
          { key: "grossProfit", label: "Прибыль", align: "right" },
          { key: "marginPercent", label: "Маржа, %", align: "right" },
          {
            key: "revenueSharePercent",
            label: "Доля выручки, %",
            align: "right",
          },
          {
            key: "profitSharePercent",
            label: "Доля прибыли, %",
            align: "right",
          },
          {
            key: "salesPerFacing",
            label: "Продажи на фейс",
            align: "right",
          },
        ]}
        filters={[
          { key: "name", label: "Товар", type: "text" },
          { key: "abcRevenueGroup", label: "ABC выручка", type: "select" },
          { key: "abcProfitGroup", label: "ABC прибыль", type: "select" },
          { key: "categoryName", label: "Категория", type: "multi-select" },
          { key: "supplierName", label: "Поставщик", type: "multi-select" },
        ]}
      />
    </main>
  );
}
