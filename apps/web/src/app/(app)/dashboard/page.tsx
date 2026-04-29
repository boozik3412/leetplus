import {
  getDashboardSummary,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";
import { getStores, type Store } from "@/lib/stores";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function formatFacing(value: number) {
  return value.toFixed(1);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = {
    period: searchParam(params.period) ?? "month",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
    skuGrouping:
      searchParam(params.skuGrouping) === "network" ? "network" : "club",
  } as const;
  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);

  const operations: { label: string; value: string; tone?: "danger" }[] = [
    { label: "Выручка", value: formatMoney(summary.totalRevenue) },
    { label: "Валовая прибыль", value: formatMoney(summary.grossProfit) },
    {
      label: "Прибыль с потерями",
      value: formatMoney(summary.adjustedGrossProfit),
      tone: summary.adjustedGrossProfit < summary.grossProfit ? "danger" : undefined,
    },
    { label: "Маржа с потерями", value: formatPercent(summary.adjustedMarginPercent) },
    { label: "Продано, шт", value: formatQuantity(summary.soldQuantity) },
    { label: "Списания", value: formatMoney(summary.writeOffAmount), tone: "danger" },
    { label: "Возвраты", value: formatMoney(summary.returnAmount) },
    { label: "Реком. заказ, шт", value: formatQuantity(summary.recommendedOrderQuantity) },
  ];
  const assortment: { label: string; value: string }[] = [
    { label: "Всего SKU", value: formatQuantity(summary.totalSku) },
    { label: "Активные SKU", value: formatQuantity(summary.activeSku) },
    { label: "Категорий", value: formatQuantity(summary.categoriesCount) },
    { label: "Поставщиков", value: formatQuantity(summary.suppliersCount) },
    {
      label: "Средняя маржинальность",
      value: formatPercent(summary.averageMarginPercent),
    },
    { label: "Средний фейсинг", value: formatFacing(summary.averageFacing) },
    { label: "Остаток, шт", value: formatQuantity(summary.stockQuantity) },
    { label: "Риск out-of-stock", value: formatQuantity(summary.outOfStockRiskCount) },
  ];

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Сводка по сети {summary.tenantName} за период {summary.periodLabel} (
            {summary.periodFrom} — {summary.periodTo}). Главные показатели
            собраны из продаж, остатков, списаний и возвратов.
          </p>
        </div>

        <DashboardFilters
          period={filters.period}
          dateFrom={summary.periodFrom}
          dateTo={summary.periodTo}
          skuGrouping={summary.skuGrouping}
          stores={stores}
          selectedStoreIds={summary.selectedStoreIds}
        />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {operations.map((card) => (
            <Metric key={card.label} {...card} />
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {assortment.map((card) => (
            <Metric key={card.label} {...card} />
          ))}
        </section>

        <TopSkuTable rows={summary.topSkuByRevenue} grouping={summary.skuGrouping} />
      </div>
    </main>
  );
}

function DashboardFilters({
  period,
  dateFrom,
  dateTo,
  skuGrouping,
  stores,
  selectedStoreIds,
}: {
  period: string;
  dateFrom: string;
  dateTo: string;
  skuGrouping: "club" | "network";
  stores: Store[];
  selectedStoreIds: string[];
}) {
  const selected = new Set(selectedStoreIds);

  return (
    <form className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Период</span>
          <select
            name="period"
            defaultValue={period}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="month">Текущий месяц</option>
            <option value="week">Текущая неделя</option>
            <option value="day">Текущие сутки</option>
            <option value="custom">Произвольный период</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">С даты</span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">По дату</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Применить
        </button>
      </div>

      <div className="mt-5 grid gap-5 border-t border-zinc-100 pt-5 lg:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">
            Клубы для верхнего блока и ТОП SKU
          </legend>
          <p className="mt-1 text-xs text-zinc-500">
            Если ничего не выбрано, показывается вся сеть.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stores.map((store) => (
              <label
                key={store.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="storeIds"
                  value={store.id}
                  defaultChecked={selected.has(store.id)}
                />
                <span>{store.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">
            Группировка ТОП SKU
          </legend>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="skuGrouping"
                value="club"
                defaultChecked={skuGrouping === "club"}
              />
              <span>Отдельно по клубам</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="skuGrouping"
                value="network"
                defaultChecked={skuGrouping === "network"}
              />
              <span>По всей сети, одинаковые товары суммируются</span>
            </label>
          </div>
        </fieldset>
      </div>
    </form>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "danger" ? "text-red-700" : "text-zinc-900",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function TopSkuTable({
  rows,
  grouping,
}: {
  rows: DashboardTopSku[];
  grouping: "club" | "network";
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">ТОП SKU по выручке</h2>
        <p className="mt-1 text-sm text-zinc-500">
          ТОП-10 товаров по выручке. Сейчас:{" "}
          {grouping === "network"
            ? "группировка по всей сети"
            : "отдельно по клубам"}.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Артикул</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                {grouping === "club" ? (
                  <th className="px-5 py-3 font-medium">Клуб</th>
                ) : null}
                <th className="px-5 py-3 text-right font-medium">Продано</th>
                <th className="px-5 py-3 text-right font-medium">Выручка</th>
                <th className="px-5 py-3 text-right font-medium">Прибыль</th>
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
                  {grouping === "club" ? (
                    <td className="px-5 py-4 text-zinc-700">
                      {row.storeName ?? "—"}
                    </td>
                  ) : null}
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatQuantity(row.soldQuantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.revenue)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-zinc-700">
                    {formatMoney(row.grossProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж за последние 30 дней пока нет.
        </p>
      )}
    </section>
  );
}
