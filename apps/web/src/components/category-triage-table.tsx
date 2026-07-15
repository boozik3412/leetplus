"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Category } from "@/lib/catalog";
import type { ProductCatalog } from "@/lib/products";

type CategoryTriageTableProps = {
  catalog: ProductCatalog;
  categories: Category[];
  canEditProducts: boolean;
};

type AssignResponse = {
  updated?: number;
  message?: string;
};

export function CategoryTriageTable({
  catalog,
  categories,
  canEditProducts,
}: CategoryTriageTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    catalog.items.length > 0 && selectedIds.length === catalog.items.length;

  function toggleProduct(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleAll() {
    setSelectedIds(
      allSelected ? [] : catalog.items.map((product) => product.id),
    );
  }

  async function assignCategory() {
    if (!categoryId || selectedIds.length === 0) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/products/bulk-category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selectedIds, categoryId }),
      });
      const data = (await response.json()) as AssignResponse;

      if (!response.ok) {
        setError(data.message ?? "Не удалось назначить категорию");
        return;
      }

      setNotice(
        `Категория назначена: ${data.updated ?? selectedIds.length} SKU`,
      );
      setSelectedIds([]);
      setCategoryId("");
      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      {canEditProducts ? (
        <div className="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-zinc-700">
            Выбрано: <span className="font-semibold">{selectedIds.length}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="categoryId" className="sr-only">
              Категория LeetPlus
            </label>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="">Выберите категорию</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={assignCategory}
              disabled={isSubmitting || !categoryId || selectedIds.length === 0}
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isSubmitting ? "Назначаем..." : "Назначить категорию"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="px-4 pt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? (
        <p className="px-4 pt-3 text-sm text-emerald-700">{notice}</p>
      ) : null}

      {catalog.items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500">
          Товаров без категории по этому фильтру нет.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-white text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                {canEditProducts ? (
                  <th scope="col" className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Выбрать все товары на странице"
                      className="size-4 rounded border-zinc-300"
                    />
                  </th>
                ) : null}
                <th scope="col" className="px-4 py-3 font-medium">
                  Товар
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Артикул
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Клубы
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {catalog.items.map((product) => (
                <tr key={product.id} className="align-top hover:bg-zinc-50">
                  {canEditProducts ? (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIdSet.has(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        aria-label={`Выбрать ${product.name}`}
                        className="size-4 rounded border-zinc-300"
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3 font-medium text-zinc-950">
                    {product.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {product.article}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {product.storeNames.length > 0
                      ? product.storeNames.join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
