import {
  ProductArchiveButton,
  ProductCreateForm,
  ProductEditRow,
} from "@/components/product-actions";
import { requireCurrentUser } from "@/lib/auth";
import { getCategories, getSuppliers } from "@/lib/catalog";
import { getProducts } from "@/lib/products";
import { Fragment } from "react";

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

export default async function ProductsPage() {
  const [user, products, categories, suppliers] = await Promise.all([
    requireCurrentUser(),
    getProducts(),
    getCategories(),
    getSuppliers(),
  ]);

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

        <div className="mb-6">
          <ProductCreateForm categories={categories} suppliers={suppliers} />
        </div>

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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Артикул</th>
                  <th className="px-5 py-3 font-medium">Наименование</th>
                  <th className="px-5 py-3 font-medium">Категория</th>
                  <th className="px-5 py-3 font-medium">Поставщик</th>
                  <th className="px-5 py-3 text-right font-medium">
                    Входящая цена
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    Цена продажи
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    Маржинальность
                  </th>
                  <th className="px-5 py-3 text-right font-medium">Фейсинг</th>
                  <th className="px-5 py-3 text-right font-medium">
                    Срок годности
                  </th>
                  <th className="px-5 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-8 text-center text-sm text-zinc-500"
                    >
                      Пока нет товаров. Добавьте первый SKU через форму выше.
                    </td>
                  </tr>
                ) : null}

                {products.map((product) => {
                  const marginPercent = calculateMarginPercent(
                    product.purchasePrice,
                    product.salePrice,
                  );

                  return (
                    <Fragment key={product.id}>
                      <tr className="hover:bg-zinc-50">
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-zinc-600">
                          {product.article}
                        </td>

                        <td className="px-5 py-4 font-medium text-zinc-950">
                          {product.name}
                        </td>

                        <td className="px-5 py-4 text-zinc-700">
                          {product.category?.name ?? "—"}
                        </td>

                        <td className="px-5 py-4 text-zinc-700">
                          {product.supplier?.name ?? "—"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                          {formatCurrency(product.purchasePrice)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-950">
                          {formatCurrency(product.salePrice)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                          {marginPercent.toFixed(1)}%
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                          {product.facing}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right text-zinc-700">
                          {product.shelfLifeDays
                            ? `${product.shelfLifeDays} дн.`
                            : "—"}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-right">
                          <ProductArchiveButton id={product.id} />
                        </td>
                      </tr>

                      <ProductEditRow
                        product={product}
                        categories={categories}
                        suppliers={suppliers}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
