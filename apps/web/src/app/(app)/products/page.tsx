import {
  ProductCreateForm,
} from "@/components/product-actions";
import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProducts } from "@/lib/products";

export default async function ProductsPage() {
  const [user, products, categories, suppliers] = await Promise.all([
    requireCurrentUser(),
    getProducts(),
    getCategories(),
    getSuppliers(),
  ]);
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-zinc-500">LeetPlus</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Товары</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Ассортимент tenant <code>{user.tenantSlug}</code>. Данные
            загружаются из NestJS API и PostgreSQL через Prisma.
          </p>
        </div>

        {canEditProducts ? (
          <div className="mb-6">
            <ProductCreateForm categories={categories} suppliers={suppliers} />
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Всего SKU</p>
            <p className="mt-2 text-2xl font-semibold">{products.length}</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Активные SKU</p>
            <p className="mt-2 text-2xl font-semibold">
              {products.filter((product) => product.isActive).length}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Категории</p>
            <p className="mt-2 text-2xl font-semibold">
              {
                new Set(
                  products
                    .map((product) => product.category?.name)
                    .filter(Boolean),
                ).size
              }
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Поставщики</p>
            <p className="mt-2 text-2xl font-semibold">
              {
                new Set(
                  products
                    .map((product) => product.supplier?.name)
                    .filter(Boolean),
                ).size
              }
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">Ассортимент</h2>
          </div>

          <div>
            <ProductsTable products={products} canEditProducts={canEditProducts} />
          </div>
        </div>
      </div>
    </main>
  );
}
