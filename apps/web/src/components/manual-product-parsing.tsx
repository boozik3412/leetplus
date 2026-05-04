"use client";

import { useMemo, useState } from "react";
import type {
  ManualParsingGroup,
  ManualParsingOverview,
  ManualParsingProduct,
} from "@/lib/product-parsing";

function errorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить действие";
}

export function ManualProductParsing({
  initialOverview,
}: {
  initialOverview: ManualParsingOverview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyOverview(nextOverview: ManualParsingOverview, message: string) {
    setOverview(nextOverview);
    setNotice(message);
    setError(null);
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Ручной парсинг товаров</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Здесь можно вручную собрать сетевой SKU, привязать к нему товары
              из разных клубов или поправить уже существующую группу без
              повторного автоматического анализа.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400">Групп:</span>{" "}
            <span className="font-semibold tabular-nums">
              {overview.groups.length}
            </span>
            <span className="mx-2 text-zinc-400">·</span>
            <span className="text-zinc-500 dark:text-zinc-400">Товаров:</span>{" "}
            <span className="font-semibold tabular-nums">
              {overview.products.length}
            </span>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
      </div>

      <CreateManualGroup
        products={overview.products}
        onCreated={(nextOverview) =>
          applyOverview(nextOverview, "Ручная группа создана")
        }
        onError={setError}
      />

      <div className="space-y-4">
        {overview.groups.map((group) => (
          <ManualGroupEditor
            key={group.id}
            group={group}
            products={overview.products}
            onSaved={(nextOverview) =>
              applyOverview(nextOverview, "Группа обновлена")
            }
            onError={setError}
          />
        ))}
      </div>
    </section>
  );
}

function CreateManualGroup({
  products,
  onCreated,
  onError,
}: {
  products: ManualParsingProduct[];
  onCreated: (overview: ManualParsingOverview) => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const filteredProducts = useFilteredProducts(products, query);

  async function createGroup() {
    if (!name.trim() || selectedProductIds.length === 0) {
      onError("Укажите название и выберите хотя бы один товар");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/utilities/product-parsing/manual/groups",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, productIds: selectedProductIds }),
        },
      );
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        onError(errorMessage(data));
        return;
      }

      setName("");
      setQuery("");
      setSelectedProductIds([]);
      onCreated(data as ManualParsingOverview);
    } catch {
      onError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-lg font-semibold">Создать ручную группу</h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,360px)_1fr]">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Название сетевого SKU
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Coca-Cola Original 330мл ж/б"
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <ProductPicker
          products={filteredProducts}
          selectedProductIds={selectedProductIds}
          query={query}
          onQueryChange={setQuery}
          onToggle={(productId) =>
            setSelectedProductIds((current) => toggleId(current, productId))
          }
        />
      </div>
      <button
        type="button"
        onClick={createGroup}
        disabled={isSaving}
        className="mt-4 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:bg-zinc-400"
      >
        {isSaving ? "Сохраняем..." : "Создать группу"}
      </button>
    </div>
  );
}

function ManualGroupEditor({
  group,
  products,
  onSaved,
  onError,
}: {
  group: ManualParsingGroup;
  products: ManualParsingProduct[];
  onSaved: (overview: ManualParsingOverview) => void;
  onError: (message: string | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [query, setQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState(
    group.products.map((product) => product.id),
  );
  const [isSaving, setIsSaving] = useState(false);
  const filteredProducts = useFilteredProducts(products, query);

  async function saveGroup() {
    if (!name.trim()) {
      onError("Укажите название сетевого SKU");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/utilities/product-parsing/manual/groups/${group.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, productIds: selectedProductIds }),
        },
      );
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        onError(errorMessage(data));
        return;
      }

      setIsEditing(false);
      onSaved(data as ManualParsingOverview);
    } catch {
      onError("API недоступен");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Сетевой SKU
          </p>
          <h3 className="mt-1 text-lg font-semibold">{group.name}</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Товаров в группе: {group.products.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing((current) => !current)}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isEditing ? "Скрыть редактирование" : "Редактировать"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {group.products.slice(0, 6).map((product) => (
          <span
            key={product.id}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
          >
            {product.name}
          </span>
        ))}
        {group.products.length > 6 ? (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            +{group.products.length - 6}
          </span>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(220px,360px)_1fr]">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Название сетевого SKU
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={saveGroup}
              disabled={isSaving}
              className="mt-3 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:bg-zinc-400"
            >
              {isSaving ? "Сохраняем..." : "Сохранить группу"}
            </button>
          </label>

          <ProductPicker
            products={filteredProducts}
            selectedProductIds={selectedProductIds}
            query={query}
            currentGroupId={group.id}
            onQueryChange={setQuery}
            onToggle={(productId) =>
              setSelectedProductIds((current) => toggleId(current, productId))
            }
          />
        </div>
      ) : null}
    </article>
  );
}

function ProductPicker({
  products,
  selectedProductIds,
  query,
  currentGroupId,
  onQueryChange,
  onToggle,
}: {
  products: ManualParsingProduct[];
  selectedProductIds: string[];
  query: string;
  currentGroupId?: string;
  onQueryChange: (query: string) => void;
  onToggle: (productId: string) => void;
}) {
  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Поиск товара
        </span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Название, артикул, клуб или домен"
          className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {products.map((product) => {
          const linkedElsewhere =
            product.canonicalProductId &&
            product.canonicalProductId !== currentGroupId;

          return (
            <label
              key={product.id}
              className={[
                "flex items-start gap-3 rounded-xl border px-3 py-2 text-sm",
                linkedElsewhere
                  ? "border-amber-300 bg-amber-50/80 dark:border-amber-800/80 dark:bg-amber-950/30"
                  : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={() => onToggle(product.id)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              />
              <span>
                <span className="font-medium">{product.name}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {product.sourceLabel} · {product.article}
                </span>
                {linkedElsewhere ? (
                  <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">
                    Сейчас привязан к:{" "}
                    {product.canonicalProductName ?? "сетевой SKU"}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Показано до 80 найденных товаров. Уточните поиск, если нужной позиции
        нет в списке.
      </p>
    </div>
  );
}

function useFilteredProducts(products: ManualParsingProduct[], query: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products
      .filter((product) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          product.name,
          product.article,
          product.sourceLabel,
          product.externalDomain ?? "",
          product.canonicalProductName ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 80);
  }, [products, query]);
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}
