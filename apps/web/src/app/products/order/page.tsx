import Link from "next/link";

import { OrderPlanningTable } from "@/components/order-planning-table";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories } from "@/lib/catalog";
import { isOrderPlanningView } from "@/lib/order-planning-views";
import { getOrderPlanningReport } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ProductOrderPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const view = searchParam(params.view);
  const categoryIds = searchParamValues(params.categoryIds);
  const [report, categories] = await Promise.all([
    getOrderPlanningReport({
      days: searchParam(params.days),
      coverDays: searchParam(params.coverDays),
    }),
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
    noMovementDays: Number(searchParam(params.noSalesDays)) || null,
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <ReportBreadcrumbs
          current="Заказ товаров"
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
              Заказ товаров
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Движение, остатки и потребность в одной таблице: продажи за{" "}
              {formatDate(report.from)} – {formatDate(report.to)} (
              {report.windowDays} дн.), текущий остаток и сколько заказать,
              чтобы хватило на {report.coverDays} дн. В отчёте только товары,
              которые были на остатке в этом периоде или есть сейчас.
            </p>
          </div>
          <Link
            href="/products"
            className="w-fit rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к товарам
          </Link>
        </div>

        <details className="mt-4 mb-4 max-w-4xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          <summary className="cursor-pointer font-medium text-zinc-900">
            Как считается заказ
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>Дней в наличии</b> — дни периода, когда товар был на остатке
              клуба или продавался. Дни без остатка не учитываются, поэтому
              пустая полка не занижает спрос.
            </li>
            <li>
              <b>Продаж в день</b> = продано за период ÷ дней в наличии. Если
              товар был в наличии меньше 7 дней, рядом стоит «мало данных».
            </li>
            <li>
              <b>Потребность</b> = продаж в день × {report.coverDays} дн. −
              текущий остаток. <b>Заказать</b> — потребность, округлённая вверх
              до целых штук и до кратности поставщика.
            </li>
            <li>
              Статусы: «Нет в наличии» — остатка нет, а товар продаётся;
              «Кончится ≤ 3 дн.»; «Заказать» — не хватит на {report.coverDays}{" "}
              дн.; «Избыток» — остатка больше чем на {report.coverDays * 3} дн.;
              «Без продаж» — лежит, но не продавался.
            </li>
            <li>
              «По сети» складывает клубы: заказ сети — сумма заказов клубов,
              статус — самый срочный из клубов. Товары, объединённые в сетевой,
              считаются одной строкой.
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

      <OrderPlanningTable
        report={report}
        initialView={isOrderPlanningView(view) ? view : "order"}
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
