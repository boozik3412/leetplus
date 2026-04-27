import {
  CatalogCreateForm,
  CatalogDeleteButton,
  CatalogRenameForm,
} from "@/components/catalog-actions";
import { requireCurrentUser } from "@/lib/auth";
import { getSuppliers } from "@/lib/catalog";

function formatMoney(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default async function SuppliersPage() {
  const user = await requireCurrentUser();
  const suppliers = await getSuppliers();

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Поставщики</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Справочник поставщиков для организации {user.tenantSlug}.leetplus.ru.
          </p>
        </div>

        <CatalogCreateForm kind="suppliers" />

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">Список поставщиков</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Поставщик</th>
                  <th className="px-5 py-3 font-medium">Отсрочка</th>
                  <th className="px-5 py-3 font-medium">Мин. заказ</th>
                  <th className="px-5 py-3 font-medium">Кратность</th>
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Статус</th>
                  <th className="px-5 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-5 py-4">
                      <CatalogRenameForm
                        id={supplier.id}
                        name={supplier.name}
                        kind="suppliers"
                      />
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {supplier.paymentDelayDays ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {formatMoney(supplier.minOrderAmount)}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {supplier.orderMultiplicity ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {supplier._count.products}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {supplier.isActive ? "Активен" : "Архив"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <CatalogDeleteButton
                        id={supplier.id}
                        kind="suppliers"
                        label="В архив"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {suppliers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                Поставщиков пока нет.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
