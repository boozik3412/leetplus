import {
  StoreArchiveButton,
  StoreCreateForm,
  StoreEditForm,
} from "@/components/store-actions";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStores } from "@/lib/stores";

export default async function StoresPage() {
  const user = await requireCurrentUser();
  const stores = await getStores();
  const canEditStores = can(user, "edit_stores");

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Торговые точки
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Клубы организации {user.tenantSlug}.leetplus.ru. Они будут
            использоваться в фильтрах продаж, остатков и отчетов.
          </p>
        </div>

        {canEditStores ? <StoreCreateForm /> : null}

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">Список точек</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Название и адрес</th>
                  <th className="px-5 py-3 font-medium">Статус</th>
                  {canEditStores ? (
                    <th className="px-5 py-3 text-right font-medium">
                      Действия
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="px-5 py-4">
                      {canEditStores ? (
                        <StoreEditForm store={store} />
                      ) : (
                        <div>
                          <p className="font-medium text-zinc-950">
                            {store.name}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">
                            {store.address ?? "—"}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      {store.isActive ? "Активна" : "Архив"}
                    </td>
                    {canEditStores ? (
                      <td className="px-5 py-4 text-right">
                        <StoreArchiveButton id={store.id} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            {stores.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                Торговых точек пока нет.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
