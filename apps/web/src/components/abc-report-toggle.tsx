"use client";

import { useState } from "react";
import type { AbcSummaryRow } from "@/lib/reports";

type Mode = "revenue" | "profit";

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function AbcReportToggle({
  revenueRows,
  profitRows,
  href,
}: {
  revenueRows: AbcSummaryRow[];
  profitRows: AbcSummaryRow[];
  href: string;
}) {
  const [mode, setMode] = useState<Mode>("revenue");
  const rows = mode === "revenue" ? revenueRows : profitRows;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">ABC-анализ</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Группы A/B/C по накопительной доле выручки или прибыли.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-md border border-zinc-200 bg-white p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("revenue")}
              className={[
                "rounded px-3 py-1.5 font-medium",
                mode === "revenue" ? "bg-zinc-900 text-white" : "text-zinc-600",
              ].join(" ")}
            >
              Выручка
            </button>
            <button
              type="button"
              onClick={() => setMode("profit")}
              className={[
                "rounded px-3 py-1.5 font-medium",
                mode === "profit" ? "bg-zinc-900 text-white" : "text-zinc-600",
              ].join(" ")}
            >
              Прибыль
            </button>
          </div>
          <a
            href={href}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Открыть полный отчёт
          </a>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">Группа</th>
              <th className="px-5 py-3 text-right font-medium">SKU</th>
              <th className="px-5 py-3 text-right font-medium">Выручка</th>
              <th className="px-5 py-3 text-right font-medium">Прибыль</th>
              <th className="px-5 py-3 text-right font-medium">Доля выручки</th>
              <th className="px-5 py-3 text-right font-medium">Доля прибыли</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.group}>
                <td className="px-5 py-4 font-semibold">{row.group}</td>
                <td className="px-5 py-4 text-right tabular-nums">{row.productsCount}</td>
                <td className="px-5 py-4 text-right tabular-nums">{formatMoney(row.revenue)}</td>
                <td className="px-5 py-4 text-right tabular-nums">{formatMoney(row.grossProfit)}</td>
                <td className="px-5 py-4 text-right tabular-nums">{formatPercent(row.revenueSharePercent)}</td>
                <td className="px-5 py-4 text-right tabular-nums">{formatPercent(row.profitSharePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
