import Link from "next/link";

import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StockValueTable } from "@/components/stock-value-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { getOrderPlanningReport } from "@/lib/reports";
import {
  STOCK_VALUE_DEFAULT_WINDOW_DAYS,
  isStockValueView,
} from "@/lib/stock-value";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// The order report's sales windows; a longer no-sales window needs a longer
// sales window.
const WINDOW_OPTIONS = [21, 28, 30, 45, 60];

export default async function StockValuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const view = searchParam(params.view);
  const noSalesDays = Number(searchParam(params.noSalesDays)) || null;
  const categoryIds = searchParamValues(params.categoryIds);
  const days =
    searchParam(params.days) ??
    String(
      WINDOW_OPTIONS.find(
        (option) =>
          option >= Math.max(noSalesDays ?? 0, STOCK_VALUE_DEFAULT_WINDOW_DAYS),
      ) ?? STOCK_VALUE_DEFAULT_WINDOW_DAYS,
    );
  const [report, categories] = await Promise.all([
    getOrderPlanningReport({ days }),
    // Old report links filter by category id; the table filters by name.
    categoryIds.length > 0 ? getCategories() : Promise.resolve([]),
  ]);
  const storeIds = new Set(searchParamValues(params.storeIds));
  const initialFilters = {
    stores: [
      ...new Set(
        report.rows
          .filter((row) => storeIds.has(row.storeId))
          .map((row) => row.storeName),
      ),
    ],
    categories: [
      ...categories
        .filter((category) => categoryIds.includes(category.id))
        .map((category) => category.name),
      ...searchParamValues(params.category),
    ],
    noSalesDays,
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs
          current="Деньги в остатке"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/products", label: "Товары" },
          ]}
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Сводный отчёт
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Деньги в остатке
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Где лежат деньги в товаре и что с ним делать: сколько стоит
              остаток, что не продаётся, чего лишнего и сколько прибыли теряем
              из-за товаров, которых нет. Продажи за {formatDate(report.from)} –{" "}
              {formatDate(report.to)} ({report.windowDays} дн.), остаток —
              последний из Langame.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products/order?view=no-movement"
              className="w-fit rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Заказ товаров
            </Link>
            <Link
              href="/products"
              className="w-fit rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Вернуться к товарам
            </Link>
          </div>
        </div>

        <details className="mt-4 mb-4 max-w-4xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          <summary className="cursor-pointer font-medium text-zinc-900">
            Как считается
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>Деньги в остатке</b> = остаток × закупочная цена клуба из
              Langame, а если её нет — закупочная цена товара. Товары без цены в
              суммы не входят, их число видно в отдельной плитке.
            </li>
            <li>
              <b>Без продаж</b> — товар на остатке, который не продавался
              выбранное число полных дней клуба (вчера включительно).
            </li>
            <li>
              <b>Лишний запас</b> = остаток − продаж в день × выбранный запас.
              Продаж в день считаются как в «Заказе товаров»: продано ÷ дней в
              наличии. У товара без продаж лишний весь остаток.
            </li>
            <li>
              <b>Теряем в день</b> — для товара, который продаётся, а остатка
              нет: продаж в день × (средняя цена продажи за период − закупочная
              цена).
            </li>
            <li>
              Продажи считаются по дням клуба, отменённые продажи не
              учитываются.
              {report.excludedProducts > 0
                ? ` Услуги и товары, исключённые из контроля наличия (${report.excludedProducts}), не показываются.`
                : ""}
            </li>
          </ul>
        </details>
      </div>

      <StockValueTable
        report={report}
        initialView={isStockValueView(view) ? view : "frozen"}
        initialFilters={initialFilters}
      />
    </main>
  );
}

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamValues(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
