import Link from "next/link";
import {
  ProductArchiveButton,
  ProductInlineEditable,
  ProductInlineSelectEditable,
} from "@/components/product-actions";
import {
  productAssortmentRoleLabel,
  productAssortmentRoleOptions,
} from "@/lib/assortment-matrix";
import type {
  Category,
  Product,
  ProductCatalog,
  ProductCatalogQuery,
  ProductCatalogSort,
  Supplier,
} from "@/lib/products";
import type { Store } from "@/lib/stores";

type SortDirection = "asc" | "desc";

const SORTABLE_COLUMNS: ReadonlyArray<{
  key: ProductCatalogSort;
  label: string;
  align?: "right";
}> = [
  { key: "article", label: "Артикул" },
  { key: "name", label: "Наименование" },
  { key: "category", label: "Категория" },
  { key: "supplier", label: "Поставщик" },
  { key: "assortmentRole", label: "Роль" },
  { key: "isMandatory", label: "Обяз." },
  { key: "purchasePrice", label: "Входящая цена", align: "right" },
  { key: "salePrice", label: "Цена продажи", align: "right" },
];

function formatCurrency(value: string | number | null) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function calculateMarginPercent(purchasePrice: string, salePrice: string) {
  const purchase = Number(purchasePrice);
  const sale = Number(salePrice);

  if (!sale || sale <= 0) {
    return 0;
  }

  return ((sale - purchase) / sale) * 100;
}

function productStoreLabel(product: Product) {
  if (product.storeNames.length === 0) {
    return product.externalDomain ?? "—";
  }

  return product.storeNames.join(", ");
}

function catalogHref(query: ProductCatalogQuery) {
  const params = new URLSearchParams();

  if (query.page) {
    params.set("page", query.page);
  }

  if (query.pageSize) {
    params.set("pageSize", query.pageSize);
  }

  if (query.name?.trim()) {
    params.set("name", query.name.trim());
  }

  query.storeIds?.forEach((storeId) => params.append("storeId", storeId));

  if (query.sort) {
    params.set("sort", query.sort);
  }

  if (query.direction) {
    params.set("direction", query.direction);
  }

  return `/products/table${params.size > 0 ? `?${params.toString()}` : ""}`;
}

export function ProductsTable({
  catalog,
  categories,
  suppliers,
  stores,
  canEditProducts,
  query,
}: {
  catalog: ProductCatalog;
  categories: Category[];
  suppliers: Supplier[];
  stores: Store[];
  canEditProducts: boolean;
  query: ProductCatalogQuery;
}) {
  const selectedStoreIds = new Set(query.storeIds ?? []);
  const firstRow =
    catalog.total === 0 ? 0 : (catalog.page - 1) * catalog.pageSize + 1;
  const lastRow = catalog.total === 0 ? 0 : firstRow + catalog.items.length - 1;
  const columnCount = canEditProducts ? 14 : 13;

  return (
    <div>
      <form
        action="/products/table"
        className="border-b border-zinc-200 bg-white px-3 py-3"
      >
        {query.sort ? (
          <input type="hidden" name="sort" value={query.sort} />
        ) : null}
        {query.direction ? (
          <input type="hidden" name="direction" value={query.direction} />
        ) : null}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_150px]">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Наименование
              </span>
              <input
                name="name"
                defaultValue={query.name}
                placeholder="Фильтр по названию"
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <details className="group relative">
              <summary className="mt-[21px] flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 marker:hidden [&::-webkit-details-marker]:hidden">
                <span>
                  {selectedStoreIds.size === 0
                    ? "Все клубы"
                    : `Клубы: ${selectedStoreIds.size}`}
                </span>
                <span aria-hidden="true" className="text-zinc-400">
                  ⌄
                </span>
              </summary>
              <div className="absolute left-0 top-full z-30 mt-2 grid w-[min(360px,calc(100vw-3rem))] gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl shadow-zinc-950/10">
                {stores.map((store) => (
                  <label
                    key={store.id}
                    className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700"
                  >
                    <input
                      type="checkbox"
                      name="storeId"
                      value={store.id}
                      defaultChecked={selectedStoreIds.has(store.id)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-500"
                    />
                    {store.name}
                  </label>
                ))}
              </div>
            </details>

            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Строк на странице
              </span>
              <select
                name="pageSize"
                defaultValue={query.pageSize ?? "50"}
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              Применить
            </button>
            <Link
              href="/products/table"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Сбросить
            </Link>
          </div>
        </div>
      </form>

      <div className="flex flex-col gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">
          Показано {firstRow}–{lastRow} из {catalog.total}
        </p>
        <Link
          href="/reports"
          className="w-fit text-xs font-medium text-zinc-700 underline underline-offset-4 transition hover:text-zinc-950"
        >
          Экспорт и аналитика — в отчётах
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1480px] border-collapse text-left text-[11px]">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              {SORTABLE_COLUMNS.slice(0, 1).map((column) => (
                <SortableTh key={column.key} column={column} query={query} />
              ))}
              <th className="px-2 py-2 font-medium">Клуб / источник</th>
              {SORTABLE_COLUMNS.slice(1).map((column) => (
                <SortableTh key={column.key} column={column} query={query} />
              ))}
              <th className="px-2 py-2 text-right font-medium">
                Себестоимость шт.
              </th>
              <th className="px-2 py-2 text-right font-medium">
                Маржинальность
              </th>
              <th className="px-2 py-2 text-right font-medium">Фейсинг</th>
              <th className="px-2 py-2 text-right font-medium">
                Срок годности
              </th>
              {canEditProducts ? (
                <th className="px-2 py-2 text-right font-medium">Действия</th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {catalog.items.map((product) => {
              const unitCost =
                product.unitCost ?? Number(product.purchasePrice);
              const marginPercent = calculateMarginPercent(
                String(unitCost),
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
                  <td className="w-[130px] px-2 py-2 text-[10px] text-zinc-500">
                    {productStoreLabel(product)}
                  </td>
                  <td className="w-[230px] px-2 py-2 font-medium leading-4 text-zinc-950">
                    <ProductInlineEditable
                      product={product}
                      field="name"
                      value={product.name}
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[110px] px-2 py-2 text-zinc-700">
                    <ProductInlineSelectEditable
                      product={product}
                      field="categoryId"
                      value={product.categoryId ?? ""}
                      displayValue={product.category?.name ?? "—"}
                      options={[
                        { value: "", label: "Без категории" },
                        ...categories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        })),
                      ]}
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[110px] px-2 py-2 text-zinc-700">
                    <ProductInlineSelectEditable
                      product={product}
                      field="supplierId"
                      value={product.supplierId ?? ""}
                      displayValue={product.supplier?.name ?? "—"}
                      options={[
                        { value: "", label: "Без поставщика" },
                        ...suppliers.map((supplier) => ({
                          value: supplier.id,
                          label: supplier.name,
                        })),
                      ]}
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[105px] px-2 py-2 text-zinc-700">
                    <ProductInlineSelectEditable
                      product={product}
                      field="assortmentRole"
                      value={product.assortmentRole}
                      displayValue={productAssortmentRoleLabel(
                        product.assortmentRole,
                      )}
                      options={productAssortmentRoleOptions}
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[75px] px-2 py-2 text-zinc-700">
                    <ProductInlineSelectEditable
                      product={product}
                      field="isMandatory"
                      value={product.isMandatory ? "true" : "false"}
                      displayValue={product.isMandatory ? "Да" : "Нет"}
                      options={[
                        { value: "false", label: "Нет" },
                        { value: "true", label: "Да" },
                      ]}
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[105px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                    <ProductInlineEditable
                      product={product}
                      field="purchasePrice"
                      value={product.purchasePrice}
                      displayValue={formatCurrency(product.purchasePrice)}
                      inputType="number"
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[105px] whitespace-nowrap px-2 py-2 text-right text-zinc-950">
                    <ProductInlineEditable
                      product={product}
                      field="salePrice"
                      value={product.salePrice}
                      displayValue={formatCurrency(product.salePrice)}
                      inputType="number"
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[105px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                    {formatCurrency(unitCost)}
                  </td>
                  <td className="w-[100px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                    {marginPercent.toFixed(0)}%
                  </td>
                  <td className="w-[75px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                    <ProductInlineEditable
                      product={product}
                      field="facing"
                      value={String(product.facing)}
                      inputType="number"
                      canEdit={canEditProducts}
                    />
                  </td>
                  <td className="w-[100px] whitespace-nowrap px-2 py-2 text-right text-zinc-700">
                    <ProductInlineEditable
                      product={product}
                      field="shelfLifeDays"
                      value={product.shelfLifeDays?.toString() ?? ""}
                      displayValue={
                        product.shelfLifeDays === null
                          ? "—"
                          : `${product.shelfLifeDays} дн.`
                      }
                      inputType="number"
                      canEdit={canEditProducts}
                    />
                  </td>
                  {canEditProducts ? (
                    <td className="w-[96px] px-2 py-2 text-right">
                      <ProductArchiveButton id={product.id} />
                    </td>
                  ) : null}
                </tr>
              );
            })}

            {catalog.items.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-3 py-8 text-center text-xs text-zinc-500"
                >
                  По выбранным фильтрам товаров нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Страницы каталога"
        className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-3 py-3"
      >
        {catalog.page > 1 ? (
          <Link
            href={catalogHref({ ...query, page: String(catalog.page - 1) })}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Назад
          </Link>
        ) : (
          <span />
        )}
        <p className="text-xs text-zinc-500">
          Страница {catalog.page} из {catalog.totalPages}
        </p>
        {catalog.page < catalog.totalPages ? (
          <Link
            href={catalogHref({ ...query, page: String(catalog.page + 1) })}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вперёд
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

function SortableTh({
  column,
  query,
}: {
  column: (typeof SORTABLE_COLUMNS)[number];
  query: ProductCatalogQuery;
}) {
  const isActive = query.sort === column.key;
  const nextDirection: SortDirection =
    isActive && query.direction === "asc" ? "desc" : "asc";

  return (
    <th
      className={`px-2 py-2 font-medium ${
        column.align === "right" ? "text-right" : ""
      }`}
    >
      <Link
        href={catalogHref({
          ...query,
          page: "1",
          sort: column.key,
          direction: nextDirection,
        })}
        className="inline-flex items-center gap-1 transition hover:text-zinc-950"
      >
        <span>{column.label}</span>
        <span aria-hidden="true" className="text-[10px]">
          {isActive ? (query.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}
