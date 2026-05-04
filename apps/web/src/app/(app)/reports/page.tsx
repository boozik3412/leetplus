import type { ReactNode } from "react";
import { requireCurrentUser } from "@/lib/auth";
import { AbcReportToggle } from "@/components/abc-report-toggle";
import { NoSalesPeriodTable } from "@/components/no-sales-period-table";
import { OosExclusionActions } from "@/components/oos-exclusion-actions";
import { ReportEmailForm } from "@/components/report-email-form";
import { ReportLoadingLink } from "@/components/report-loading-link";
import {
  getAssortmentReport,
  getLflReport,
  getNewProductsReport,
  getOperationalReport,
  getReplenishmentReport,
  getSkuPerformanceReport,
  getSuppliersPerformanceReport,
  type LflPeriod,
  type LflReport,
  type LflReportRow,
  type LowMarginProduct,
  type NewProductsReport,
  type OutOfStockRiskProduct,
  type ReplenishmentRow,
  type ReportRecommendation,
  type ReportGroup,
  type SkuPerformanceRow,
  type SupplierPerformanceRow,
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

function resolveLflPeriod(value: string | string[] | undefined): LflPeriod {
  const period = searchParam(value);

  return period === "week" || period === "month" ? period : "day";
}

function buildLflExportHref({
  format,
  period,
}: {
  format: "csv" | "xlsx";
  period: LflPeriod;
}) {
  const params = new URLSearchParams({
    format,
    report: "lfl",
    lflPeriod: period,
  });

  return `/api/reports/export?${params.toString()}`;
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

function abcTableHref({
  from,
  to,
  storeId,
}: {
  from: string;
  to: string;
  storeId: string | null;
}) {
  const params = new URLSearchParams({ from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return `/reports/abc/table?${params.toString()}`;
}

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
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
  const lflPeriod = resolveLflPeriod(params.lflPeriod);
  const noSalesFilters = {
    storeId: filters.storeId,
    ...lastFullDaysRange(7),
  };
  const noSalesFilters14 = {
    storeId: filters.storeId,
    ...lastFullDaysRange(14),
  };
  const noSalesFilters21 = {
    storeId: filters.storeId,
    ...lastFullDaysRange(21),
  };
  const [
    assortmentReport,
    operationalReport,
    skuPerformanceReport,
    replenishmentReport,
    suppliersPerformanceReport,
    noSalesReport7,
    noSalesReport14,
    noSalesReport21,
    newProductsReport,
    lflReport,
    stores,
  ] = await Promise.all([
    getAssortmentReport(),
    getOperationalReport(filters),
    getSkuPerformanceReport(filters),
    getReplenishmentReport(filters),
    getSuppliersPerformanceReport(filters),
    getOperationalReport(noSalesFilters),
    getOperationalReport(noSalesFilters14),
    getOperationalReport(noSalesFilters21),
    getNewProductsReport({ storeId: filters.storeId }),
    getLflReport(lflPeriod),
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

        <section className="mt-6 grid gap-3">
          <ReportDisclosure
            title="LFL год к году"
            description="День, неделя или месяц год к году по выручке, прибыли и штукам."
          >
            <LflReportPanel report={lflReport} period={lflPeriod} />
          </ReportDisclosure>

          <ReportDisclosure
            title="Новинки"
            description="Первый в истории положительный остаток за последние 90 дней."
          >
            <NewProductsPanel
              report={newProductsReport}
              stores={stores}
              from={operationalReport.from}
              to={operationalReport.to}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="Рекомендации"
            description="Короткий список автоматических действий по рискам и маржинальности."
          >
            <RecommendationsPanel
              rows={operationalReport.recommendations}
              from={operationalReport.from}
              to={operationalReport.to}
              storeId={operationalReport.storeId}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="Риск out-of-stock"
            description="SKU, где текущего остатка хватит на 3 дня или меньше."
          >
            <RiskTable
              rows={operationalReport.outOfStockRiskProducts}
              from={operationalReport.from}
              to={operationalReport.to}
              storeId={operationalReport.storeId}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="Товары без продаж"
            description="Активные SKU с остатком, но без продаж за 7, 14 или 21 день."
          >
            <NoSalesPeriodTable
              rowsByPeriod={{
                7: noSalesReport7.productsWithoutSales,
                14: noSalesReport14.productsWithoutSales,
                21: noSalesReport21.productsWithoutSales,
              }}
              networkBadge={<NetworkSkuBadge />}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="Остатки и потребность"
            description="Позиции к заказу по клубам, ССР, остаткам в днях и недельной потребности."
          >
            <ReplenishmentTable
              rows={replenishmentReport.rows}
              from={replenishmentReport.from}
              to={replenishmentReport.to}
              storeId={replenishmentReport.storeId}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="ABC-анализ"
            description="Группы A/B/C по накопительной доле выручки или прибыли."
          >
            <AbcReportToggle
              revenueRows={skuPerformanceReport.abcByRevenue}
              profitRows={skuPerformanceReport.abcByProfit}
              href={abcTableHref({
                from: operationalReport.from,
                to: operationalReport.to,
                storeId: operationalReport.storeId,
              })}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="ТОП SKU по выручке"
            description="Рейтинг товаров с выручкой, прибылью, маржой и эффективностью фейса."
          >
            <TopSkuTable
              rows={skuPerformanceReport.topByRevenue}
              stores={stores}
              storeId={operationalReport.storeId}
              from={operationalReport.from}
              to={operationalReport.to}
            />
          </ReportDisclosure>

          <ReportDisclosure
            title="ТОП поставщиков"
            description="Выручка, прибыль, доля продаж и условия поставщиков."
          >
            <TopSuppliersTable rows={suppliersPerformanceReport.rows} />
          </ReportDisclosure>

          <ReportDisclosure
            title="Ассортимент"
            description="SKU, категории, поставщики и товары с низкой маржинальностью."
          >
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Всего SKU" value={assortmentReport.totalSku} />
              <Metric
                label="Активные SKU"
                value={assortmentReport.activeSku}
              />
              <Metric
                label="Архивные SKU"
                value={assortmentReport.inactiveSku}
              />
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
              <GroupTable
                title="Категории"
                rows={assortmentReport.categoryBreakdown}
              />
              <GroupTable
                title="Поставщики"
                rows={assortmentReport.supplierBreakdown}
              />
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
                        <th className="px-5 py-3 font-medium">Товар</th>
                        <th className="px-5 py-3 font-medium">Категория</th>
                        <th className="px-5 py-3 font-medium">Поставщик</th>
                        <th className="px-5 py-3 text-right font-medium">
                          Вход
                        </th>
                        <th className="px-5 py-3 text-right font-medium">
                          Цена
                        </th>
                        <th className="px-5 py-3 text-right font-medium">
                          Маржа
                        </th>
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
          </ReportDisclosure>
        </section>
      </div>
    </main>
  );
}

function ReportDisclosure({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow open:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden hover:bg-zinc-50 dark:hover:bg-zinc-900/70">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="shrink-0 truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {title}
          </h2>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          <span className="group-open:hidden">Развернуть</span>
          <span className="hidden group-open:inline">Свернуть</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 transition-transform group-open:rotate-180 dark:border-zinc-700">
            ⌄
          </span>
        </div>
      </summary>
      <div className="report-disclosure-body border-t border-zinc-200 dark:border-zinc-800 [&>div]:mt-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none [&>section]:mt-0 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
        {children}
      </div>
    </details>
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

function LflReportPanel({
  report,
  period,
}: {
  report: LflReport;
  period: LflPeriod;
}) {
  const rows = report.rows.filter((row) => row.level !== "product").slice(0, 8);
  const params = new URLSearchParams({ period });

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-zinc-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">LFL год к году</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Сравниваем сопоставимые пары “клуб + товар” за текущий период и тот
            же период прошлого года.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {report.currentFrom} - {report.currentTo} против{" "}
            {report.previousFrom} - {report.previousTo}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LflPeriodLink period="day" activePeriod={period} label="День" />
          <LflPeriodLink period="week" activePeriod={period} label="Неделя" />
          <LflPeriodLink period="month" activePeriod={period} label="Месяц" />
          <a
            href={buildLflExportHref({ format: "csv", period })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            CSV
          </a>
          <a
            href={buildLflExportHref({ format: "xlsx", period })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            XLSX
          </a>
          <ReportLoadingLink
            href={`/reports/lfl/table?${params.toString()}`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Открыть полный отчет
          </ReportLoadingLink>
        </div>
      </div>

      <div className="grid gap-4 border-b border-zinc-200 px-5 py-4 md:grid-cols-3">
        <Metric
          label="LFL выручка"
          value={formatNullablePercent(report.summary.revenueLflPercent)}
        />
        <Metric
          label="LFL прибыль"
          value={formatNullablePercent(report.summary.grossProfitLflPercent)}
        />
        <Metric
          label="LFL штуки"
          value={formatNullablePercent(report.summary.quantityLflPercent)}
        />
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Группа</th>
                <th className="px-5 py-3 font-medium">Название</th>
                <th className="px-5 py-3 text-right font-medium">Выручка LFL</th>
                <th className="px-5 py-3 text-right font-medium">Прибыль LFL</th>
                <th className="px-5 py-3 text-right font-medium">Штуки LFL</th>
                <th className="px-5 py-3 text-right font-medium">Выручка</th>
                <th className="px-5 py-3 text-right font-medium">Прибыль</th>
                <th className="px-5 py-3 text-right font-medium">Штуки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 text-zinc-500">
                    {lflLevelLabel(row.level)}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatNullablePercent(row.revenueLflPercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatNullablePercent(row.grossProfitLflPercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatNullablePercent(row.quantityLflPercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.currentRevenue)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.currentGrossProfit)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.currentQuantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Сопоставимых продаж за выбранный период пока нет.
        </p>
      )}
    </section>
  );
}

function LflPeriodLink({
  period,
  activePeriod,
  label,
}: {
  period: LflPeriod;
  activePeriod: LflPeriod;
  label: string;
}) {
  const params = new URLSearchParams({ lflPeriod: period });
  const isActive = period === activePeriod;

  return (
    <a
      href={`/reports?${params.toString()}`}
      className={[
        "rounded-md border px-3 py-2 text-sm font-medium",
        isActive
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </a>
  );
}

function NewProductsPanel({
  report,
  stores,
  from,
  to,
}: {
  report: NewProductsReport;
  stores: Store[];
  from: string;
  to: string;
}) {
  const rows = report.rows.slice(0, 10);
  const params = new URLSearchParams();

  if (report.storeId) {
    params.set("storeId", report.storeId);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Новинки</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Товары, которые впервые появились на остатках за последние 90 дней:
            {` ${report.from} - ${report.to}`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <select
              name="storeId"
              defaultValue={report.storeId ?? ""}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Вся сеть</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Применить
            </button>
          </form>
          <ReportLoadingLink
            href={`/reports/new-products/table${params.toString() ? `?${params.toString()}` : ""}`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Открыть полный отчёт
          </ReportLoadingLink>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 font-medium">Клуб</th>
                <th className="px-5 py-3 font-medium">Категория</th>
                <th className="px-5 py-3 text-right font-medium">Дата</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
                <th className="px-5 py-3 text-right font-medium">Себестоимость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.name}
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.firstSeenStoreName}
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.categoryName ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.firstSeenDate}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.currentStockQuantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.unitCost === null ? "—" : formatMoney(row.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          За последние 90 дней новых товаров на остатках не найдено.
        </p>
      )}
    </section>
  );
}

function formatNullablePercent(value: number | null) {
  return value === null ? "нов." : formatPercent(value);
}

function lflLevelLabel(level: LflReportRow["level"]) {
  const labels: Record<LflReportRow["level"], string> = {
    network: "Вся сеть",
    store: "Клуб",
    category: "Категория",
    product: "Товар",
  };

  return labels[level];
}

function RecommendationsPanel({
  rows,
  from,
  to,
  storeId,
}: {
  rows: ReportRecommendation[];
  from: string;
  to: string;
  storeId: string | null;
}) {
  const previewRows = rows.slice(0, 5);
  const params = new URLSearchParams({ from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Рекомендации</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Автоматические действия на основе продаж, остатков и маржинальности.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ReportLoadingLink
              href={`/reports/recommendations/table?${params.toString()}`}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Открыть полный отчёт
            </ReportLoadingLink>
            <a
              href="/reports/oos-exclusions"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Исключённые позиции
            </a>
          </div>
        </div>
      </div>

      {previewRows.length > 0 ? (
        <div className="divide-y divide-zinc-100">
          {previewRows.map((row) => (
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
                <p className="mt-1 text-xs text-zinc-500">
                  {row.storeName ?? "—"}
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
                {row.kind === "REPLENISH_STOCK" ? (
                  <OosExclusionActions productId={row.productId} />
                ) : null}
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

function RiskTable({
  rows,
  from,
  to,
  storeId,
}: {
  rows: OutOfStockRiskProduct[];
  from: string;
  to: string;
  storeId: string | null;
}) {
  const compactRows = topOutOfStockRowsByStore(rows);
  const hasOverflow = rows.length > compactRows.length;
  const params = new URLSearchParams({ from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Риск out-of-stock</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Товары, где текущего остатка хватит на 3 дня или меньше.
          </p>
        </div>
        <ReportLoadingLink
          href={`/reports/oos/table?${params.toString()}`}
          className={[
            "rounded-md border px-3 py-2 text-sm font-medium hover:bg-zinc-50",
            hasOverflow
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-zinc-300 text-zinc-700",
          ].join(" ")}
        >
          Открыть полный отчёт{hasOverflow ? " • есть ещё" : ""}
        </ReportLoadingLink>
      </div>

      {compactRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Клуб</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
                <th className="px-5 py-3 text-right font-medium">Продажи/день</th>
                <th className="px-5 py-3 text-right font-medium">Дней</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {compactRows.map((row) => (
                <tr key={`${row.storeId}:${row.productId}`}>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.storeName}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    <span className="inline-flex items-center gap-2">
                      {row.name}
                      {row.isCanonical ? <NetworkSkuBadge /> : null}
                    </span>
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
    </section>
  );
}

function ReplenishmentTable({
  rows,
  from,
  to,
  storeId,
}: {
  rows: ReplenishmentRow[];
  from: string;
  to: string;
  storeId: string | null;
}) {
  const compactRows = topReplenishmentRowsByStore(rows);
  const params = new URLSearchParams({ from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return (
    <section
      id="replenishment"
      className="mt-6 scroll-mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Остатки и потребность</h2>
          <p className="mt-1 text-sm text-zinc-500">
            TOP-5 позиций к заказу в каждом клубе.
          </p>
        </div>
        <ReportLoadingLink
          href={`/reports/replenishment/table?${params.toString()}`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Открыть полный отчёт
        </ReportLoadingLink>
      </div>

      {compactRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 font-medium">Клуб</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
                <th className="px-5 py-3 text-right font-medium">ССР</th>
                <th className="px-5 py-3 text-right font-medium">Остаток в днях</th>
                <th
                  className="px-5 py-3 text-right font-medium"
                  title="Потребность рассчитана на неделю продаж: ССР × 7 минус текущий остаток."
                >
                  Потребность
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {compactRows.map((row) => (
                <tr key={`${row.storeId}:${row.productId}`}>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    <span className="inline-flex items-center gap-2">
                      {row.name}
                      {row.isCanonical ? <NetworkSkuBadge /> : null}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-700">
                    {row.storeName}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.stockQuantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.averageDailySales)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.stockDays === null ? "—" : formatQuantity(row.stockDays)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.dailyNeed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Активных SKU для расчёта пополнения нет.
        </p>
      )}
    </section>
  );
}

function topReplenishmentRowsByStore(rows: ReplenishmentRow[]) {
  const rowsByStore = new Map<string, ReplenishmentRow[]>();

  rows.forEach((row) => {
    rowsByStore.set(row.storeId, [...(rowsByStore.get(row.storeId) ?? []), row]);
  });

  return [...rowsByStore.values()].flatMap((storeRows) =>
    storeRows
      .filter((row) => row.recommendedOrder > 0 || row.dailyNeed > 0)
      .sort(
        (a, b) =>
          b.recommendedOrder - a.recommendedOrder ||
          b.dailyNeed - a.dailyNeed ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 5),
  );
}

function topOutOfStockRowsByStore(rows: OutOfStockRiskProduct[]) {
  const rowsByStore = new Map<string, OutOfStockRiskProduct[]>();

  rows.forEach((row) => {
    rowsByStore.set(row.storeId, [...(rowsByStore.get(row.storeId) ?? []), row]);
  });

  return [...rowsByStore.values()].flatMap((storeRows) =>
    storeRows
      .sort(
        (a, b) =>
          b.averageDailySales - a.averageDailySales ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 3),
  );
}

function TopSkuTable({
  rows,
  stores,
  storeId,
  from,
  to,
}: {
  rows: SkuPerformanceRow[];
  stores: Store[];
  storeId: string | null;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams({ from, to });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">ТОП SKU по выручке</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Рейтинг товаров с прибылью, маржой и эффективностью на 1 фейс.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <select
              name="storeId"
              defaultValue={storeId ?? ""}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Вся сеть</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="ml-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Применить
            </button>
          </form>
          <ReportLoadingLink
            href={`/reports/top-sku/table?${params.toString()}`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Открыть полный отчёт
          </ReportLoadingLink>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Клуб</th>
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
                  <td className="px-5 py-4 text-zinc-700">
                    {storeId
                      ? (stores.find((store) => store.id === storeId)?.name ??
                        "Клуб")
                      : "Вся сеть"}
                  </td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    <span className="inline-flex items-center gap-2">
                      {row.name}
                      {row.isCanonical ? <NetworkSkuBadge /> : null}
                    </span>
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

function NetworkSkuBadge() {
  return (
    <span
      title="Товар является сетевым: составлен из одинаковых товаров, но с разными названиями в разных клубах."
      aria-label="Сетевой товар"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
    >
      ⇄
    </span>
  );
}

function TopSuppliersTable({ rows }: { rows: SupplierPerformanceRow[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">ТОП поставщиков</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Выручка, прибыль, доля продаж и условия поставщика по текущему фильтру.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Поставщик</th>
                <th className="px-5 py-3 text-right font-medium">SKU</th>
                <th className="px-5 py-3 text-right font-medium">Продано</th>
                <th className="px-5 py-3 text-right font-medium">Выручка</th>
                <th className="px-5 py-3 text-right font-medium">Прибыль</th>
                <th className="px-5 py-3 text-right font-medium">Маржа</th>
                <th className="px-5 py-3 text-right font-medium">Доля продаж</th>
                <th className="px-5 py-3 text-right font-medium">Выручка/SKU</th>
                <th className="px-5 py-3 text-right font-medium">Отсрочка</th>
                <th className="px-5 py-3 text-right font-medium">Мин. заказ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.supplierId ?? "without-supplier"}>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    {row.supplierName}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.activeSku}
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
                    {formatPercent(row.salesSharePercent)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.averageRevenuePerSku)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.paymentDelayDays === null
                      ? "—"
                      : `${row.paymentDelayDays} дн.`}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {row.minOrderAmount === null
                      ? "—"
                      : formatMoney(row.minOrderAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж по поставщикам в текущем фильтре нет.
        </p>
      )}
    </section>
  );
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
