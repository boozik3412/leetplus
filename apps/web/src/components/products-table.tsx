"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import {
  ProductArchiveButton,
  ProductInlineEditable,
} from "@/components/product-actions";
import type { Product } from "@/lib/products";

type SortKey =
  | "createdAt"
  | "article"
  | "name"
  | "source"
  | "category"
  | "supplier"
  | "purchasePrice"
  | "salePrice"
  | "margin"
  | "facing"
  | "shelfLifeDays";

type SortDirection = "asc" | "desc";

function formatCurrency(value: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function calculateMarginPercent(purchasePrice: string, salePrice: string) {
  const purchase = Number(purchasePrice);
  const sale = Number(salePrice);

  if (!sale || sale <= 0) {
    return 0;
  }

  return ((sale - purchase) / sale) * 100;
}

export function ProductsTable({
  products,
  canEditProducts,
  tableMode = false,
}: {
  products: Product[];
  canEditProducts: boolean;
  tableMode?: boolean;
}) {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [nameFilter, setNameFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const sources = useMemo(
    () =>
      [...new Set(products.map((product) => product.externalDomain ?? "Без источника"))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru")),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const normalizedNameFilter = nameFilter.trim().toLowerCase();

    return products.filter((product) => {
      const matchesName = normalizedNameFilter
        ? product.name.toLowerCase().includes(normalizedNameFilter)
        : true;
      const source = product.externalDomain ?? "Без источника";
      const matchesSource = sourceFilter === "all" || source === sourceFilter;

      return matchesName && matchesSource;
    });
  }, [nameFilter, products, sourceFilter]);
  const sortedProducts = useMemo(
    () =>
      [...filteredProducts].sort((a, b) => {
        const result = compareProducts(a, b, sortKey);
        return sortDirection === "asc" ? result : -result;
      }),
    [filteredProducts, sortDirection, sortKey],
  );

  function setSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "createdAt" ? "desc" : "asc");
  }

  return (
    <div>
      <div className="border-b border-zinc-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-[minmax(260px,1fr)_220px]">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Наименование
              </span>
              <input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="Фильтр по названию"
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Клуб / источник
              </span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="all">Все источники</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-zinc-500">
              Показано {sortedProducts.length} из {products.length}
            </p>
            {!tableMode ? (
              <button
                type="button"
                onClick={() => window.open("/products/table", "_blank", "noopener,noreferrer")}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Открыть в новом окне
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={topScrollRef}
        onScroll={() => syncHorizontalScroll(topScrollRef, tableScrollRef)}
        className="overflow-x-auto border-b border-zinc-100 bg-zinc-50"
      >
        <div className="h-3 min-w-[1280px]" />
      </div>

      <div
        ref={tableScrollRef}
        onScroll={() => syncHorizontalScroll(tableScrollRef, topScrollRef)}
        className="overflow-x-auto"
      >
    <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
      <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
        <tr>
          <SortableTh label="Артикул" sortKey="article" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <SortableTh label="Клуб / источник" sortKey="source" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <SortableTh label="Наименование" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <SortableTh label="Категория" sortKey="category" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <SortableTh label="Поставщик" sortKey="supplier" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <SortableTh label="Входящая цена" sortKey="purchasePrice" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <SortableTh label="Цена продажи" sortKey="salePrice" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <SortableTh label="Маржинальность" sortKey="margin" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <SortableTh label="Фейсинг" sortKey="facing" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <SortableTh label="Срок годности" sortKey="shelfLifeDays" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          {canEditProducts ? (
            <th className="px-5 py-3 text-right font-medium">Действия</th>
          ) : null}
        </tr>
      </thead>

      <tbody className="divide-y divide-zinc-100">
        {sortedProducts.length === 0 ? (
          <tr>
            <td
              colSpan={canEditProducts ? 11 : 10}
              className="px-5 py-8 text-center text-sm text-zinc-500"
            >
              Пока нет товаров. Добавьте первый SKU через форму выше.
            </td>
          </tr>
        ) : null}

        {sortedProducts.map((product) => {
          const marginPercent = calculateMarginPercent(
            product.purchasePrice,
            product.salePrice,
          );

          return (
            <tr key={product.id} className="hover:bg-zinc-50">
              <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-zinc-600">
                <ProductInlineEditable
                  product={product}
                  field="article"
                  value={product.article}
                  canEdit={canEditProducts}
                />
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-xs text-zinc-500">
                {product.externalDomain ?? "—"}
              </td>

              <td className="px-5 py-4 font-medium text-zinc-950">
                <ProductInlineEditable
                  product={product}
                  field="name"
                  value={product.name}
                  canEdit={canEditProducts}
                />
              </td>

              <td className="px-5 py-4 text-zinc-700">
                {product.category?.name ?? "—"}
              </td>

              <td className="px-5 py-4 text-zinc-700">
                {product.supplier?.name ?? "—"}
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                <ProductInlineEditable
                  product={product}
                  field="purchasePrice"
                  value={product.purchasePrice}
                  displayValue={formatCurrency(product.purchasePrice)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-950">
                <ProductInlineEditable
                  product={product}
                  field="salePrice"
                  value={product.salePrice}
                  displayValue={formatCurrency(product.salePrice)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                {marginPercent.toFixed(1)}%
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                <ProductInlineEditable
                  product={product}
                  field="facing"
                  value={String(product.facing)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                <ProductInlineEditable
                  product={product}
                  field="shelfLifeDays"
                  value={product.shelfLifeDays?.toString() ?? ""}
                  displayValue={
                    product.shelfLifeDays ? `${product.shelfLifeDays} дн.` : "—"
                  }
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              {canEditProducts ? (
                <td className="whitespace-nowrap px-5 py-4 text-right">
                  <ProductArchiveButton id={product.id} />
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeKey === sortKey;

  return (
    <th className={["px-5 py-3 font-medium", align === "right" ? "text-right" : ""].join(" ")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase transition hover:text-zinc-900"
      >
        {label}
        <span className={isActive ? "text-zinc-900" : "text-zinc-300"}>
          {isActive ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function compareProducts(a: Product, b: Product, sortKey: SortKey) {
  if (sortKey === "createdAt") {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  if (sortKey === "purchasePrice" || sortKey === "salePrice") {
    return Number(a[sortKey]) - Number(b[sortKey]);
  }

  if (sortKey === "facing") {
    return a.facing - b.facing;
  }

  if (sortKey === "shelfLifeDays") {
    return (a.shelfLifeDays ?? -1) - (b.shelfLifeDays ?? -1);
  }

  if (sortKey === "margin") {
    return (
      calculateMarginPercent(a.purchasePrice, a.salePrice) -
      calculateMarginPercent(b.purchasePrice, b.salePrice)
    );
  }

  if (sortKey === "category") {
    return (a.category?.name ?? "").localeCompare(b.category?.name ?? "", "ru");
  }

  if (sortKey === "supplier") {
    return (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "", "ru");
  }

  if (sortKey === "source") {
    return (a.externalDomain ?? "").localeCompare(b.externalDomain ?? "", "ru");
  }

  return a[sortKey].localeCompare(b[sortKey], "ru");
}

function syncHorizontalScroll(
  sourceRef: RefObject<HTMLDivElement | null>,
  targetRef: RefObject<HTMLDivElement | null>,
) {
  if (!sourceRef.current || !targetRef.current) {
    return;
  }

  targetRef.current.scrollLeft = sourceRef.current.scrollLeft;
}
