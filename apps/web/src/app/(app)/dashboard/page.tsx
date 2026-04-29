import {
  getDashboardSummary,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";
import { getStores, type Store } from "@/lib/stores";

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
  const selectedStoresLabel =
    summary.selectedStoreIds.length === 0
      ? "Вся сеть"
      : stores
          .filter((store) => summary.selectedStoreIds.includes(store.id))
          .map((store) => store.name)
          .join(", ");

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {summary.periodLabel} · {selectedStoresLabel}
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {summary.tenantName}: операционная картина ассортимента
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Период {summary.periodFrom} — {summary.periodTo}. В фокусе
                продажи, прибыльность, потери, риск дефицита и товары, которые
                формируют оборот.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="Выручка"
                value={formatMoney(summary.totalRevenue)}
                caption="оборот за выбранный период"
              />
              <HeroMetric
                label="Прибыль с потерями"
                value={formatMoney(summary.adjustedGrossProfit)}
                caption={`маржа ${formatPercent(summary.adjustedMarginPercent)}`}
                tone={
                  summary.adjustedGrossProfit < summary.grossProfit
                    ? "warning"
                    : "good"
                }
              />
            </div>
          </div>

          <div className="grid border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-4">
            <SignalMetric
              label="Продано"
              value={formatQuantity(summary.soldQuantity)}
              suffix="шт"
            />
            <SignalMetric
              label="Списания"
              value={formatMoney(summary.writeOffAmount)}
              tone="danger"
            />
            <SignalMetric
              label="Остатки"
              value={formatQuantity(summary.stockQuantity)}
              suffix="шт"
            />
            <SignalMetric
              label="Риск out-of-stock"
              value={formatQuantity(summary.outOfStockRiskCount)}
              suffix="SKU"
              tone={summary.outOfStockRiskCount > 0 ? "danger" : "good"}
            />
          </div>
        </section>

        <DashboardFilters
          period={filters.period}
          dateFrom={summary.periodFrom}
          dateTo={summary.periodTo}
          skuGrouping={summary.skuGrouping}
          stores={stores}
          selectedStoreIds={summary.selectedStoreIds}
        />

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <InsightCard
            label="Рекомендованный заказ"
            value={`${formatQuantity(summary.recommendedOrderQuantity)} шт`}
            description="Потребность по SKU, где текущего остатка не хватает на средний спрос."
          />
          <InsightCard
            label="Активный ассортимент"
            value={`${formatQuantity(summary.activeSku)} / ${formatQuantity(
              summary.totalSku,
            )}`}
            description="Количество активных SKU относительно всего импортированного ассортимента."
          />
          <InsightCard
            label="Возвраты"
            value={formatMoney(summary.returnAmount)}
            description="Сумма возвратов за выбранный период, учтённая в прибыльности."
          />
        </section>

        <TopSkuTable
          rows={summary.topSkuByRevenue}
          grouping={summary.skuGrouping}
        />
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
    <form className="mt-6 rounded-3xl border border-zinc-200 bg-white/85 p-5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Период
          </span>
          <select
            name="period"
            defaultValue={period}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="month">Текущий месяц</option>
            <option value="week">Текущая неделя</option>
            <option value="day">Текущие сутки</option>
            <option value="custom">Произвольный период</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            С даты
          </span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            По дату
          </span>
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          Применить
        </button>
      </div>

      <div className="mt-5 grid gap-5 border-t border-zinc-100 pt-5 dark:border-zinc-800 lg:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Клубы
          </legend>
          <p className="mt-1 text-xs text-zinc-500">
            Ничего не выбрано = вся сеть.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stores.map((store) => (
              <label
                key={store.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/70"
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
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Группировка ТОП SKU
          </legend>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/70">
              <input
                type="radio"
                name="skuGrouping"
                value="club"
                defaultChecked={skuGrouping === "club"}
              />
              <span>Отдельно по клубам</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/70">
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

function HeroMetric({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return (
    <div
      className={[
        "rounded-3xl border p-5",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
            : "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
      ].join(" ")}
    >
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm opacity-70">{caption}</p>
    </div>
  );
}

function SignalMetric({
  label,
  value,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "good" | "danger";
}) {
  return (
    <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 md:border-b-0 md:border-r last:md:border-r-0">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "danger"
              ? "text-red-700 dark:text-red-300"
              : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
        {suffix ? <span className="ml-1 text-sm text-zinc-500">{suffix}</span> : null}
      </p>
    </div>
  );
}

function InsightCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
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
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">ТОП-10 SKU по выручке</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {grouping === "network"
            ? "Товары суммируются по всей сети при совпадении названия или артикула."
            : "Позиции показаны отдельно по каждому клубу."}
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => (
            <div
              key={row.productId}
              className="grid gap-4 px-5 py-4 lg:grid-cols-[48px_1fr_180px_160px]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {row.name}
                  </p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-900">
                    {row.article}
                  </span>
                </div>
                {grouping === "club" ? (
                  <p className="mt-1 text-sm text-zinc-500">
                    {row.storeName ?? "—"}
                  </p>
                ) : null}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (row.revenue / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs text-zinc-500">Выручка</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatMoney(row.revenue)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm lg:block lg:text-right">
                <div>
                  <p className="text-xs text-zinc-500">Продано</p>
                  <p className="mt-1 font-medium tabular-nums">
                    {formatQuantity(row.soldQuantity)}
                  </p>
                </div>
                <div className="lg:mt-3">
                  <p className="text-xs text-zinc-500">Прибыль</p>
                  <p className="mt-1 font-medium tabular-nums">
                    {formatMoney(row.grossProfit)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж за выбранный период пока нет.
        </p>
      )}
    </section>
  );
}
