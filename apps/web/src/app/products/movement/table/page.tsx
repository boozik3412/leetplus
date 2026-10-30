import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import { orderPlanningHref } from "@/lib/order-planning-views";
import { getOperationalReport } from "@/lib/reports";

type MovementTablePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ProductMovementTablePage({
  searchParams,
}: MovementTablePageProps) {
  const params = await searchParams;
  if (searchParam(params?.subset) === "write-offs") {
    await requireCurrentUser();
    const report = await getOperationalReport({
      from: searchParam(params?.from),
      to: searchParam(params?.to),
      storeId: searchParam(params?.storeId),
      storeIds: searchParamsArray(params?.storeIds),
      categoryIds: searchParamsArray(params?.categoryIds),
      asOf: searchParam(params?.asOf),
    });
    const rows = report.assortmentRows?.writeOffs ?? [];
    const movements = report.writeOffMovements ?? [];

    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-4 text-zinc-950">
        <div className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Списания</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Списания за {report.from}–{report.to}; итог и покрытие подтверждает
            сводка, строки показывают доступные движения.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {report.assortmentHealth?.writeOffAmount.reason ??
              "Статус источника списаний"}
            {" · "}
            {formatCoverage(
              report.assortmentHealth?.writeOffAmount.coverage.percent ?? null,
            )}
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Клуб</th>
                <th className="px-4 py-3 font-medium">Товар</th>
                <th className="px-4 py-3 font-medium">Категория</th>
                <th className="px-4 py-3 text-right font-medium">Количество</th>
                <th className="px-4 py-3 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-4 py-3 text-zinc-700">
                    {formatMovementDate(movement.movementDate)}
                  </td>
                  <td className="px-4 py-3">{movement.storeName}</td>
                  <td className="px-4 py-3 font-medium">
                    {movement.article ? `${movement.article} · ` : ""}
                    {movement.productName}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {movement.categoryName ?? "Без категории"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQuantity(movement.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(movement.amount)}
                  </td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-zinc-500"
                    colSpan={6}
                  >
                    {rows.length > 0
                      ? "Есть сводный итог, но детальные движения недоступны для отображения."
                      : "Нет подтверждённых строк списания в выбранной области."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    );
  }
  // The sales movement table is the «Движение» view of «Заказ товаров» now.
  redirect(orderPlanningHref("movement", params ?? {}));
}

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function formatCoverage(value: number | null) {
  return value === null
    ? "покрытие неизвестно"
    : `покрытие ${Math.round(value)}%`;
}

function formatMovementDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB",
  }).format(value);
}
