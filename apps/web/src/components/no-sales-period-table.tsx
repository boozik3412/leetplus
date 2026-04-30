"use client";

import { useState } from "react";
import type { ProductWithoutSales } from "@/lib/reports";

type Period = 7 | 14 | 21;

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function NoSalesPeriodTable({
  rowsByPeriod,
  networkBadge,
}: {
  rowsByPeriod: Record<Period, ProductWithoutSales[]>;
  networkBadge: React.ReactNode;
}) {
  const [period, setPeriod] = useState<Period>(7);
  const rows = rowsByPeriod[period];
  const compactRows = topRowsByStore(rows);
  const hasOverflow = hasMoreThanFivePerStore(rows);

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Товары без продаж</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Активные SKU с остатком, но без продаж в выбранном периоде.
            Высокие риски невыставленного товара.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-md border border-zinc-200 bg-white p-1 text-sm">
            {[7, 14, 21].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriod(days as Period)}
                className={[
                  "rounded px-3 py-1.5 font-medium",
                  period === days ? "bg-zinc-900 text-white" : "text-zinc-600",
                ].join(" ")}
              >
                {days} дн
              </button>
            ))}
          </div>
          <a
            href={`/reports/no-sales/table?period=${period}`}
            target="_blank"
            className={[
              "rounded-md border px-3 py-2 text-sm font-medium hover:bg-zinc-50",
              hasOverflow
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-zinc-300 text-zinc-700",
            ].join(" ")}
          >
            Открыть полный отчёт{hasOverflow ? " • есть ещё" : ""}
          </a>
        </div>
      </div>

      {compactRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Клуб</th>
                <th className="px-5 py-3 font-medium">Товар</th>
                <th className="px-5 py-3 font-medium">Категория</th>
                <th className="px-5 py-3 font-medium">Поставщик</th>
                <th className="px-5 py-3 text-right font-medium">Остаток</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {compactRows.map((row) => (
                <tr key={`${row.storeId}:${row.productId}`}>
                  <td className="px-5 py-4 text-zinc-700">{row.storeName}</td>
                  <td className="px-5 py-4 font-medium text-zinc-950">
                    <span className="inline-flex items-center gap-2">
                      {row.name}
                      {row.isCanonical ? networkBadge : null}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-700">{row.categoryName ?? "—"}</td>
                  <td className="px-5 py-4 text-zinc-700">{row.supplierName ?? "—"}</td>
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
          За {period} дн. невыставленных SKU с остатком не найдено.
        </p>
      )}
    </section>
  );
}

function topRowsByStore(rows: ProductWithoutSales[]) {
  const rowsByStore = new Map<string, ProductWithoutSales[]>();

  rows.forEach((row) => {
    rowsByStore.set(row.storeId, [...(rowsByStore.get(row.storeId) ?? []), row]);
  });

  return [...rowsByStore.values()].flatMap((storeRows) =>
    storeRows
      .sort(
        (a, b) =>
          b.stockQuantity - a.stockQuantity || a.name.localeCompare(b.name),
      )
      .slice(0, 5),
  );
}

function hasMoreThanFivePerStore(rows: ProductWithoutSales[]) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    counts.set(row.storeId, (counts.get(row.storeId) ?? 0) + 1);
  });

  return [...counts.values()].some((count) => count > 5);
}
