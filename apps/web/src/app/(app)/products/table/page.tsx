import { ProductsTable } from "@/components/products-table";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProducts } from "@/lib/products";

export default async function ProductsTablePage() {
  const [user, products] = await Promise.all([requireCurrentUser(), getProducts()]);
  const canEditProducts = can(user, "edit_products");

  return (
    <main className="px-4 py-6 text-zinc-950">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Табличный режим
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Товары
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Расширенный вид ассортимента с фильтрами, сортировкой и
              горизонтальным скроллом.
            </p>
          </div>
          <a
            href="/products"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Вернуться к товарам
          </a>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <ProductsTable
            products={products}
            canEditProducts={canEditProducts}
            tableMode
          />
        </div>
      </div>
    </main>
  );
}
