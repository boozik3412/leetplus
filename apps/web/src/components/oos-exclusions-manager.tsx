"use client";

import { useMemo, useState } from "react";
import { OosExclusionRestoreButton } from "@/components/oos-exclusion-actions";
import type { Product } from "@/lib/products";
import type { ProductOosExclusion, ProductOosExclusionType } from "@/lib/reports";

function exclusionTypeLabel(type: ProductOosExclusionType) {
  return type === "SERVICE" ? "Услуга" : "Исключение OOS";
}

export function OosExclusionsManager({
  exclusions,
  products,
}: {
  exclusions: ProductOosExclusion[];
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const excludedProductIds = new Set(
      exclusions.map((item) => item.productId),
    );

    if (!normalizedQuery) {
      return [];
    }

    return products
      .filter((product) => !excludedProductIds.has(product.id))
      .filter(
        (product) =>
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.article.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 20);
  }, [exclusions, products, query]);

  async function add(type: ProductOosExclusionType) {
    if (!selectedProductId) {
      return;
    }

    setIsSaving(true);

    try {
      await fetch("/api/reports/oos-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProductId, type }),
      });
      window.location.reload();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Добавить позицию в исключение OOS</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Найдите товар по названию или артикулу и выберите действие: услуга или
          обычное исключение из OOS.
        </p>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedProductId("");
          }}
          placeholder="Например: аренда девайсов"
          className="mt-4 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {matches.length > 0 ? (
          <div className="mt-3 max-h-72 divide-y divide-zinc-100 overflow-auto rounded-md border border-zinc-200">
            {matches.map((product) => (
              <label
                key={product.id}
                className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                <input
                  type="radio"
                  checked={selectedProductId === product.id}
                  onChange={() => setSelectedProductId(product.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-zinc-950">{product.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {product.article} · {product.externalDomain ?? "без источника"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : query ? (
          <p className="mt-3 text-sm text-zinc-500">Совпадений не найдено.</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!selectedProductId || isSaving}
            onClick={() => add("SERVICE")}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
          >
            Сделать услугой
          </button>
          <button
            type="button"
            disabled={!selectedProductId || isSaving}
            onClick={() => add("OOS_EXCLUDED")}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-60"
          >
            В исключение
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold">Исключённые позиции</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Эти позиции не участвуют в OOS-рекомендациях и отчёте потребности.
          </p>
        </div>
        {exclusions.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {exclusions.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[1fr_160px_140px]"
              >
                <div>
                  <p className="font-medium text-zinc-950">{item.product.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.product.article} · {item.product.externalDomain ?? "без источника"}
                  </p>
                </div>
                <div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {exclusionTypeLabel(item.type)}
                  </span>
                </div>
                <div className="lg:text-right">
                  <OosExclusionRestoreButton id={item.id} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-zinc-500">
            Исключённых позиций пока нет.
          </p>
        )}
      </div>
    </section>
  );
}
