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
      </div>

      {rows.length > 0 ? (
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
              {rows.map((row) => (
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
