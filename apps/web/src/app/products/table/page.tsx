import Link from "next/link";

import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import {
  getProductCatalog,
  type ProductCatalogQuery,
  type ProductCatalogSort,
} from "@/lib/products";
import { getStores } from "@/lib/stores";

type ProductsTablePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PRODUCT_CATALOG_SORTS = new Set<ProductCatalogSort>([
  "name",
  "article",
  "category",
  "supplier",
  "assortmentRole",
  "isMandatory",
  "purchasePrice",
  "salePrice",
  "createdAt",
]);

export default async function ProductsTablePage({
  searchParams,
}: ProductsTablePageProps) {
  const params = await searchParams;
  const query = resolveCatalogQuery(params);
  const [user, catalog, categories, suppliers, stores] = await Promise.all([
    requireCurrentUser(),
    getProductCatalog(query),
    getCategories(),
    getSuppliers(),
    getStores(),
  ]);
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <nav aria-label="Навигация" className="mb-3 text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link
                href="/dashboard"
                className="font-medium text-zinc-600 transition hover:text-zinc-950"
              >
                Дашборд
              </Link>
            </li>
            <li aria-hidden="true" className="text-zinc-300">
              /
            </li>
            <li>
              <Link
                href="/products"
                className="font-medium text-zinc-600 transition hover:text-zinc-950"
              >
                Товары
              </Link>
            </li>
            <li aria-hidden="true" className="text-zinc-300">
              /
            </li>
            <li className="font-medium text-zinc-950" aria-current="page">
              Каталог
            </li>
          </ol>
        </nav>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Каталог SKU</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Товары
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Фильтруйте, сортируйте и редактируйте ассортимент. На странице
              загружается только выбранная часть каталога.
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            К хабу товаров
          </Link>
        </div>
      </div>

      <ProductsTable
        catalog={catalog}
        categories={categories}
        suppliers={suppliers}
        stores={stores}
        canEditProducts={canEditProducts}
        query={query}
      />
    </main>
  );
}

function resolveCatalogQuery(
  params: Record<string, string | string[] | undefined>,
): ProductCatalogQuery {
  const sort = firstParam(params.sort);

  return {
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
    name: firstParam(params.name),
    storeIds: allParams(params.storeId),
    sort: PRODUCT_CATALOG_SORTS.has(sort as ProductCatalogSort)
      ? (sort as ProductCatalogSort)
      : undefined,
    direction: firstParam(params.direction) === "desc" ? "desc" : "asc",
  };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allParams(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
