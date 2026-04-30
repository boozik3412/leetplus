import { requireCurrentUser } from "@/lib/auth";
import { getReplenishmentReport, type ReplenishmentRisk } from "@/lib/reports";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function riskLabel(risk: ReplenishmentRisk) {
  const labels: Record<ReplenishmentRisk, string> = {
    OUT_OF_STOCK: "Нет остатка",
    LOW_STOCK: "Мало",
    OK: "ОК",
    NO_SALES: "Нет продаж",
  };

  return labels[risk];
}

export default async function ReplenishmentTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getReplenishmentReport({
    from: searchParam(params.from),
    to: searchParam(params.to),
    storeId: searchParam(params.storeId),
  });

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Полный отчёт
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Остатки и потребность
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Все позиции по клубам: остаток, среднесуточная реализация,
              потребность и рекомендованный заказ.
            </p>
          </div>
          <a
            href="/reports#replenishment"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к отчётам
          </a>
        </div>
      </div>

      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[1280px] text-left text-xs">
          <thead className="bg-zinc-100 uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Артикул</th>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium">Клуб</th>
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Поставщик</th>
              <th className="px-3 py-2 text-right font-medium">Остаток</th>
              <th className="px-3 py-2 text-right font-medium">Продано</th>
              <th className="px-3 py-2 text-right font-medium">ССР</th>
              <th className="px-3 py-2 text-right font-medium">Дней</th>
              <th className="px-3 py-2 text-right font-medium">Потребность</th>
              <th className="px-3 py-2 text-right font-medium">Заказать</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {report.rows.map((row) => (
              <tr key={`${row.storeId}:${row.productId}`}>
                <td className="px-3 py-2">{riskLabel(row.risk)}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">
                  {row.article}
                </td>
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.storeName}</td>
                <td className="px-3 py-2">{row.categoryName ?? "—"}</td>
                <td className="px-3 py-2">{row.supplierName ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(row.stockQuantity)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(row.soldQuantity)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(row.averageDailySales)}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.stockDays === null ? "—" : formatQuantity(row.stockDays)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatQuantity(row.dailyNeed)}
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {row.recommendedOrder > 0
                    ? formatQuantity(row.recommendedOrder)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
