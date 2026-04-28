import { requireCurrentUser } from "@/lib/auth";
import { ReportEmailForm } from "@/components/report-email-form";
import {
  getAssortmentReport,
  getOperationalReport,
  getSkuPerformanceReport,
  type AbcGroup,
  type AbcSummaryRow,
  type LowMarginProduct,
  type OutOfStockRiskProduct,
  type ProductWithoutSales,
  type ReportRecommendation,
  type ReportGroup,
  type SkuPerformanceRow,
} from "@/lib/reports";
import { getStores, type Store } from "@/lib/stores";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildExportHref({
  format,
  from,
  to,
  storeId,
}: {
  format: "csv" | "xlsx";
  from: string;
  to: string;
  storeId: string | null;
}) {
  const params = new URLSearchParams({ format, from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return `/api/reports/export?${params.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const filters = {
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  };
  const [assortmentReport, operationalReport, skuPerformanceReport, stores] =
    await Promise.all([
    getAssortmentReport(),
    getOperationalReport(filters),
      getSkuPerformanceReport(filters),
    getStores(),
  ]);

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Отчёты</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Операционная аналитика по организации{" "}
            {operationalReport.tenantSlug}. Показываем только данные текущего
            tenant.
          </p>
        </div>

        <ReportFilters
          from={operationalReport.from}
          to={operationalReport.to}
          storeId={operationalReport.storeId}
          stores={stores}
          csvHref={buildExportHref({
            format: "csv",
            from: operationalReport.from,
            to: operationalReport.to,
            storeId: operationalReport.storeId,
          })}
          xlsxHref={buildExportHref({
            format: "xlsx",
            from: operationalReport.from,
            to: operationalReport.to,
            storeId: operationalReport.storeId,
          })}
        />

        <ReportEmailForm
          defaultEmail={user.email}
          from={operationalReport.from}
          to={operationalReport.to}
          storeId={operationalReport.storeId}
        />

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Выручка"
            value={formatMoney(operationalReport.totalRevenue)}
          />
          <Metric
            label="Валовая прибыль"
            value={formatMoney(operationalReport.grossProfit)}
          />
          <Metric
            label="Маржа продаж"
            value={formatPercent(operationalReport.marginPercent)}
          />
          <Metric
            label="Продано, шт"
            value={formatQuantity(operationalReport.soldQuantity)}
          />
          <Metric
            label="Средняя выручка/день"
            value={formatMoney(operationalReport.averageDailyRevenue)}
          />
          <Metric
            label="Остаток, шт"
            value={formatQuantity(operationalReport.stockQuantity)}
          />
          <Metric
            label="Дней запаса"
            value={
              operationalReport.stockDays === null
                ? "—"
                : formatQuantity(operationalReport.stockDays)
            }
          />
          <Metric
            label="Риск out-of-stock"
            value={operationalReport.outOfStockRiskProducts.length}
          />
        </section>

        <RecommendationsPanel rows={operationalReport.recommendations} />

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <RiskTable rows={operationalReport.outOfStockRiskProducts} />
          <NoSalesTable rows={operationalReport.productsWithoutSales} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <AbcSummary
            title="ABC по выручке"
            description="Группы A/B/C по накопительной доле выручки."
            rows={skuPerformanceReport.abcByRevenue}
          />
          <AbcSummary
            title="ABC по прибыли"
            description="Группы A/B/C по накопительной доле валовой прибыли."
            rows={skuPerformanceReport.abcByProfit}
          />
        </section>

        <TopSkuTable rows={skuPerformanceReport.topByRevenue} />

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Всего SKU" value={assortmentReport.totalSku} />
          <Metric label="Активные SKU" value={assortmentReport.activeSku} />
          <Metric label="Архивные SKU" value={assortmentReport.inactiveSku} />
          <Metric
            label="Средняя маржа прайса"
            value={formatPercent(assortmentReport.averageMarginPercent)}
          />
          <Metric
            label="Средняя наценка прайса"
            value={formatPercent(assortmentReport.averageMarkupPercent)}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GroupTable title="Категории" rows={assortmentReport.categoryBreakdown} />
          <GroupTable title="Поставщики" rows={assortmentReport.supplierBreakdown} />
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">SKU с низкой маржой</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Товары ниже 20% маржинальности, сначала самые рискованные.
            </p>
          </div>

          {assortmentReport.lowMarginProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Артикул</th>
                    <th className="px-5 py-3 font-medium">Товар</th>
                    <th className="px-5 py-3 font-medium">Категория</th>
                    <th className="px-5 py-3 font-medium">Поставщик</th>
                    <th className="px-5 py-3 text-right font-medium">Вход</th>
                    <th className="px-5 py-3 text-right font-medium">Цена</th>
                    <th className="px-5 py-3 text-right font-medium">Маржа</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {assortmentReport.lowMarginProducts.map((product) => (
                    <LowMarginRow key={product.id} product={product} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Товаров с маржей ниже 20% не найдено.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportFilters({
  from,
  to,
  storeId,
  stores,
  csvHref,
  xlsxHref,
}: {
  from: string;
  to: string;
  storeId: string | null;
  stores: Store[];
  csvHref: string;
  xlsxHref: string;
}) {
  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">С даты</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">По дату</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">
            Торговая точка
          </span>
          <select
            name="storeId"
            defaultValue={storeId ?? ""}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Все точки</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Применить
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
        <span className="text-sm text-zinc-500">Выгрузить текущий отчёт:</span>
        <a
          href={csvHref}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          CSV
        </a>
        <a
          href={xlsxHref}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          XLSX
        </a>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
    </div>
  );
}

function RecommendationsPanel({ rows }: { rows: ReportRecommendation[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Рекомендации</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Автоматические действия на основе продаж, остатков и маржинальности.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <article
              key={row.id}
              className="grid gap-3 px-5 py-4 lg:grid-cols-[160px_1fr_180px]"
            >
              <div>
                <span
                  className={[
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                    severityClassName(row.severity),
                  ].join(" ")}
                >
                  {severityLabel(row.severity)}
                </span>
                <p className="mt-2 font-mono text-xs text-zinc-500">
                  {row.article}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-950">
                  {row.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {row.description}
                </p>
                <p className="mt-2 text-sm font-medium text-zinc-800">
                  {row.action}
                </p>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs text-zinc-500">{row.metricLabel}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
                  {row.metricValue}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Критичных рекомендаций по текущему фильтру нет.
        </p>
      )}
    </section>
  );
}

function severityLabel(severity: ReportRecommendation["severity"]) {
  const labels: Record<ReportRecommendation["severity"], string> = {
    HIGH: "Высокий",
    MEDIUM: "Средний",
    LOW: "Низкий",
  };

  return labels[severity];
}

function severityClassName(severity: ReportRecommendation["severity"]) {
  const classNames: Record<ReportRecommendation["severity"], string> = {
    HIGH: "bg-red-50 text-red-700",
    MEDIUM: "bg-amber-50 text-amber-700",
    LOW: "bg-zinc-100 text-zinc-700",
  };

  return classNames[severity];
}

function RiskTable({ rows }: { rows: OutOfStockRiskProduct[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Риск out-of-stock</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Товары, где текущего остатка хватит на 3 дня или меньше.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Артикул</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
                <th className="px-5 py-3 text-right font-medium">Продажи/день</th>
                <th className="px-5 py-3 text-right font-medium">Дней</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-600">
                    {row.article}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.stockQuantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.averageDailySales)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-red-700">
                    {formatQuantity(row.stockDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Критичных остатков по текущему фильтру нет.
        </p>
      )}
    </div>
  );
}

function NoSalesTable({ rows }: { rows: ProductWithoutSales[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">Товары без продаж</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Активные SKU без продаж в выбранном периоде.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Артикул</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 font-medium">Категория</th>
                <th className="px-5 py-3 font-medium">Поставщик</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-600">
                    {row.article}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.categoryName ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.supplierName ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.stockQuantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Все активные SKU продавались в выбранном периоде.
        </p>
      )}
    </div>
  );
}

function AbcSummary({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: AbcSummaryRow[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">Группа</th>
              <th className="px-5 py-3 text-right font-medium">SKU</th>
              <th className="px-5 py-3 text-right font-medium">Доля ассорт.</th>
              <th className="px-5 py-3 text-right font-medium">Доля выручки</th>
              <th className="px-5 py-3 text-right font-medium">Доля прибыли</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.group}>
                <td className="px-5 py-4">
                  <span
                    className={[
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                      abcGroupClassName(row.group),
                    ].join(" ")}
                  >
                    {row.group}
                  </span>
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                  {row.productsCount}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                  {formatPercent(row.assortmentSharePercent)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                  {formatPercent(row.revenueSharePercent)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                  {formatPercent(row.profitSharePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopSkuTable({ rows }: { rows: SkuPerformanceRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">ТОП SKU по выручке</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Рейтинг товаров с прибылью, маржой и эффективностью на 1 фейс.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">ABC</th>
                <th className="px-5 py-3 font-medium">Артикул</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 font-medium">Категория</th>
                <th className="px-5 py-3 text-right font-medium">Продано</th>
                <th className="px-5 py-3 text-right font-medium">Выручка</th>
                <th className="px-5 py-3 text-right font-medium">Прибыль</th>
                <th className="px-5 py-3 text-right font-medium">Маржа</th>
                <th className="px-5 py-3 text-right font-medium">Прод./фейс</th>
                <th className="px-5 py-3 text-right font-medium">Приб./фейс</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td className="px-5 py-4">
                    <span
                      className={[
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                        abcGroupClassName(row.abcRevenueGroup),
                      ].join(" ")}
                    >
                      {row.abcRevenueGroup}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-600">
                    {row.article}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.categoryName ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.soldQuantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.revenue)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.grossProfit)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatPercent(row.marginPercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.salesPerFacing)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.profitPerFacing)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж по текущему фильтру нет.
        </p>
      )}
    </section>
  );
}

function abcGroupClassName(group: AbcGroup) {
  const classNames: Record<AbcGroup, string> = {
    A: "bg-emerald-50 text-emerald-700",
    B: "bg-amber-50 text-amber-700",
    C: "bg-zinc-100 text-zinc-700",
  };

  return classNames[group];
}

function GroupTable({ title, rows }: { title: string; rows: ReportGroup[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Название</th>
                <th className="px-5 py-3 text-right font-medium">SKU</th>
                <th className="px-5 py-3 text-right font-medium">Маржа</th>
                <th className="px-5 py-3 text-right font-medium">Средняя цена</th>
                <th className="px-5 py-3 text-right font-medium">Фейсинг</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id ?? row.name}>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.productsCount}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatPercent(row.averageMarginPercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.averageSalePrice)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.totalFacing}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Нет данных.</p>
      )}
    </div>
  );
}

function LowMarginRow({ product }: { product: LowMarginProduct }) {
  return (
    <tr>
      <td className="px-5 py-4 font-mono text-xs text-zinc-600">
        {product.article}
      </td>
      <td className="px-5 py-4 font-medium text-zinc-950">{product.name}</td>
      <td className="px-5 py-4 text-zinc-700">
        {product.categoryName ?? "—"}
      </td>
      <td className="px-5 py-4 text-zinc-700">
        {product.supplierName ?? "—"}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
        {formatMoney(product.purchasePrice)}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
        {formatMoney(product.salePrice)}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-red-700">
        {formatPercent(product.marginPercent)}
      </td>
    </tr>
  );
}
