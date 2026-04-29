import {
  getDashboardSummary,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";

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

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  const operations: { label: string; value: string; tone?: "danger" }[] = [
    { label: "Выручка 30 дней", value: formatMoney(summary.totalRevenue) },
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
            Сводка по организации {summary.tenantSlug} за период{" "}
            {summary.periodFrom} — {summary.periodTo}. Главные показатели
            собраны из продаж, остатков, списаний и возвратов.
          </p>
        </div>

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

        <TopSkuTable rows={summary.topSkuByRevenue} />
      </div>
    </main>
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

function TopSkuTable({ rows }: { rows: DashboardTopSku[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold">ТОП SKU по выручке</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Быстрый срез товаров, которые сильнее всего формируют оборот клуба.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Артикул</th>
                <th className="px-5 py-3 font-medium">Товар</th>
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
