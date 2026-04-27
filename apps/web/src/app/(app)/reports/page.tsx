import { requireCurrentUser } from "@/lib/auth";
import {
  getAssortmentReport,
  type LowMarginProduct,
  type ReportGroup,
} from "@/lib/reports";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

export default async function ReportsPage() {
  await requireCurrentUser();
  const report = await getAssortmentReport();

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Отчёты</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Ассортиментная аналитика по организации {report.tenantSlug}.
            Показываем только данные текущего tenant.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Всего SKU" value={report.totalSku} />
          <Metric label="Активные SKU" value={report.activeSku} />
          <Metric label="Архивные SKU" value={report.inactiveSku} />
          <Metric
            label="Средняя маржа"
            value={formatPercent(report.averageMarginPercent)}
          />
          <Metric
            label="Средняя наценка"
            value={formatPercent(report.averageMarkupPercent)}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GroupTable title="Категории" rows={report.categoryBreakdown} />
          <GroupTable title="Поставщики" rows={report.supplierBreakdown} />
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">SKU с низкой маржой</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Товары ниже 20% маржинальности, сначала самые рискованные.
            </p>
          </div>

          {report.lowMarginProducts.length > 0 ? (
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
                  {report.lowMarginProducts.map((product) => (
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
