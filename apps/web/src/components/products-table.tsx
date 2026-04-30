"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  const tableElementRef = useRef<HTMLTableElement | null>(null);
  const topSpacerRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const updateTopScrollWidth = () => {
      if (!topSpacerRef.current || !tableElementRef.current) {
        return;
      }

      topSpacerRef.current.style.width = `${tableElementRef.current.scrollWidth}px`;
    };

    updateTopScrollWidth();
    window.addEventListener("resize", updateTopScrollWidth);

    return () => window.removeEventListener("resize", updateTopScrollWidth);
  }, [sortedProducts.length]);

  function exportRows(format: "excel" | "1c" | "pdf") {
    const rows = sortedProducts.map((product) => productToExportRow(product));

    if (format === "excel") {
      downloadFile(
        `leetplus-products-${dateStamp()}.xls`,
        tableHtml(rows),
        "application/vnd.ms-excel;charset=utf-8",
      );
      return;
    }

    if (format === "1c") {
      downloadFile(
        `leetplus-products-1c-${dateStamp()}.csv`,
        `\uFEFF${toCsv(rows)}`,
        "text/csv;charset=utf-8",
      );
      return;
    }

    openPrintWindow(rows);
  }

  return (
    <div>
      <div className="border-b border-zinc-200 bg-white px-3 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_190px]">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Наименование
              </span>
              <input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder="Фильтр по названию"
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Клуб / источник
              </span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
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

          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500">
              Показано {sortedProducts.length} из {products.length}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exportRows("excel")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={() => exportRows("1c")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                1C
              </button>
              <button
                type="button"
                onClick={() => exportRows("pdf")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                PDF
              </button>
            </div>
            {!tableMode ? (
              <button
                type="button"
                onClick={() => window.open("/products/table", "_blank", "noopener,noreferrer")}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
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
        <div ref={topSpacerRef} className="h-2 min-w-[1140px]" />
      </div>

      <div
        ref={tableScrollRef}
        onScroll={() => syncHorizontalScroll(tableScrollRef, topScrollRef)}
        className="overflow-x-auto"
      >
    <table
      ref={tableElementRef}
      className="w-full min-w-[1140px] border-collapse text-left text-[11px]"
    >
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
            <th className="px-2 py-2 text-right font-medium">Действия</th>
          ) : null}
        </tr>
      </thead>

      <tbody className="divide-y divide-zinc-100">
        {sortedProducts.length === 0 ? (
          <tr>
            <td
              colSpan={canEditProducts ? 11 : 10}
              className="px-3 py-8 text-center text-xs text-zinc-500"
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
              <td className="w-[132px] whitespace-nowrap px-2 py-2 font-mono text-[10px] text-zinc-600">
                <ProductInlineEditable
                  product={product}
                  field="article"
                  value={product.article}
                  canEdit={canEditProducts}
                />
              </td>

              <td className="w-[105px] whitespace-nowrap px-2 py-2 text-[10px] text-zinc-500">
                {product.externalDomain ?? "—"}
              </td>

              <td className="w-[230px] px-2 py-2 font-medium leading-4 text-zinc-950">
                <ProductInlineEditable
                  product={product}
                  field="name"
                  value={product.name}
                  canEdit={canEditProducts}
                />
              </td>

              <td className="w-[95px] px-2 py-2 text-zinc-700">
                {product.category?.name ?? "—"}
              </td>

              <td className="w-[95px] px-2 py-2 text-zinc-700">
                {product.supplier?.name ?? "—"}
              </td>

              <td className="w-[90px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                <ProductInlineEditable
                  product={product}
                  field="purchasePrice"
                  value={product.purchasePrice}
                  displayValue={formatCurrency(product.purchasePrice)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="w-[90px] whitespace-nowrap px-2 py-2 text-right text-zinc-950">
                <ProductInlineEditable
                  product={product}
                  field="salePrice"
                  value={product.salePrice}
                  displayValue={formatCurrency(product.salePrice)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="w-[85px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                {marginPercent.toFixed(1)}%
              </td>

              <td className="w-[70px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                <ProductInlineEditable
                  product={product}
                  field="facing"
                  value={String(product.facing)}
                  inputType="number"
                  canEdit={canEditProducts}
                />
              </td>

              <td className="w-[85px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
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
                <td className="w-[88px] whitespace-nowrap px-2 py-2 text-right">
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
    <th className={["px-2 py-2 font-medium", align === "right" ? "text-right" : ""].join(" ")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-0.5 uppercase leading-3 transition hover:text-zinc-900"
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

type ExportRow = {
  article: string;
  source: string;
  name: string;
  category: string;
  supplier: string;
  purchasePrice: string;
  salePrice: string;
  marginPercent: string;
  facing: string;
  shelfLifeDays: string;
};

const exportHeaders: { key: keyof ExportRow; label: string }[] = [
  { key: "article", label: "Артикул" },
  { key: "source", label: "Клуб / источник" },
  { key: "name", label: "Наименование" },
  { key: "category", label: "Категория" },
  { key: "supplier", label: "Поставщик" },
  { key: "purchasePrice", label: "Входящая цена" },
  { key: "salePrice", label: "Цена продажи" },
  { key: "marginPercent", label: "Маржинальность" },
  { key: "facing", label: "Фейсинг" },
  { key: "shelfLifeDays", label: "Срок годности" },
];

function productToExportRow(product: Product): ExportRow {
  return {
    article: product.article,
    source: product.externalDomain ?? "",
    name: product.name,
    category: product.category?.name ?? "",
    supplier: product.supplier?.name ?? "",
    purchasePrice: product.purchasePrice,
    salePrice: product.salePrice,
    marginPercent: calculateMarginPercent(
      product.purchasePrice,
      product.salePrice,
    ).toFixed(1),
    facing: String(product.facing),
    shelfLifeDays: product.shelfLifeDays?.toString() ?? "",
  };
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: ExportRow[]) {
  return [
    exportHeaders.map((header) => escapeCsv(header.label)).join(";"),
    ...rows.map((row) =>
      exportHeaders.map((header) => escapeCsv(row[header.key])).join(";"),
    ),
  ].join("\r\n");
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function tableHtml(rows: ExportRow[]) {
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>${exportHeaders
    .map((header) => `<th>${escapeHtml(header.label)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${exportHeaders
          .map((header) => `<td>${escapeHtml(row[header.key])}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></body></html>`;
}

function openPrintWindow(rows: ExportRow[]) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    return;
  }

  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LeetPlus товары</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { margin: 0 0 16px; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
    th { background: #f3f4f6; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>LeetPlus товары</h1>
  ${tableHtml(rows).replace(/^<!doctype html><html><head><meta charset="utf-8" \/><\/head><body>/, "").replace(/<\/body><\/html>$/, "")}
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  printWindow.document.close();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
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
