import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { can } from "@/lib/permissions";
import { getProducts } from "@/lib/products";
import { getStores } from "@/lib/stores";

export default async function ProductsTablePage() {
  const [user, products, categories, suppliers, stores] = await Promise.all([
    requireCurrentUser(),
    getProducts(),
    getCategories(),
    getSuppliers(),
    getStores(),
  ]);
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="min-h-screen bg-[var(--background)] text-zinc-950">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Табличный режим
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Товары
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Расширенный вид ассортимента с фильтрами, сортировкой,
              экспортом и горизонтальным скроллом.
            </p>
          </div>
          <a
            href="/products"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к товарам
          </a>
        </div>
      </div>

      <ProductsTable
        products={products}
        categories={categories}
        suppliers={suppliers}
        stores={stores}
        canEditProducts={canEditProducts}
        tableMode
      />
    </main>
  );
}
