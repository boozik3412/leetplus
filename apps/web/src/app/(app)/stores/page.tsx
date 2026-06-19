import {
  StoreArchiveButton,
  StoreBulkGeocodeButton,
  StoreCreateForm,
  StoreEditForm,
} from "@/components/store-actions";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStores } from "@/lib/stores";

export default async function StoresPage() {
  const user = await requireCurrentUser();
  const stores = await getStores();
  const canEditStores = can(user, "edit_stores");
  const missingCoordinates = stores.filter(
    (store) => store.isActive && !hasCoordinates(store) && store.address,
  ).length;
  const gameStores = stores.filter(
    (store) => store.isActive && store.gamificationEnabled,
  );
  const gameStoresWithCoordinates = gameStores.filter(hasCoordinates).length;
  const gameStoresMissingCoordinates = Math.max(
    gameStores.length - gameStoresWithCoordinates,
    0,
  );

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-6xl">
        <ReportBreadcrumbs
          current="Клубы"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/administration", label: "Администрирование" },
          ]}
        />
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

        <section className="mt-6 rounded-lg border border-cyan-100 bg-cyan-50/70 px-5 py-4 text-sm text-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                LeetPlus Game
              </p>
              <h2 className="mt-1 text-base font-semibold text-zinc-950">
                Карта игрового модуля
              </h2>
              <p className="mt-1 text-zinc-600">
                {gameStores.length > 0
                  ? `${gameStoresWithCoordinates} из ${gameStores.length} активных игровых клубов с координатами`
                  : "Игровые клубы пока не включены"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  gameStoresMissingCoordinates === 0 && gameStores.length > 0
                    ? "rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800"
                    : "rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800"
                }
              >
                {gameStores.length === 0
                  ? "Квесты не включены"
                  : gameStoresMissingCoordinates === 0
                    ? "Геопоиск готов"
                    : `Без координат: ${gameStoresMissingCoordinates}`}
              </span>
              <a
                className="rounded-md border border-cyan-200 bg-white px-3 py-2 font-semibold text-cyan-800 hover:bg-cyan-50"
                href="/game/clubs"
              >
                Проверить выбор клуба
              </a>
              <a
                className="rounded-md border border-cyan-200 bg-white px-3 py-2 font-semibold text-cyan-800 hover:bg-cyan-50"
                href="/play"
              >
                Проверить /play
              </a>
            </div>
          </div>
        </section>

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold">Список точек</h2>
            {canEditStores ? (
              <StoreBulkGeocodeButton missingCount={missingCoordinates} />
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Название и адрес</th>
                  <th className="px-5 py-3 font-medium">Гостевая ссылка</th>
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
                      <span className="font-mono text-xs">
                        /game/auth?storeId={store.publicSlug ?? store.id}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-700">
                      <div className="space-y-1">
                        <p>{store.isActive ? "Активна" : "Архив"}</p>
                        <p
                          className={
                            store.gamificationEnabled
                              ? "text-emerald-700"
                              : "text-zinc-500"
                          }
                        >
                          {store.gamificationEnabled
                            ? "Квесты включены"
                            : "Квесты выключены"}
                        </p>
                        <p
                          className={
                            hasCoordinates(store)
                              ? "text-cyan-700"
                              : "text-amber-700"
                          }
                        >
                          {hasCoordinates(store)
                            ? "Координаты для карты есть"
                            : "Координаты для карты не указаны"}
                        </p>
                      </div>
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

function hasCoordinates(store: {
  latitude?: string | number | null;
  longitude?: string | number | null;
}) {
  return (
    store.latitude !== null &&
    store.latitude !== undefined &&
    store.longitude !== null &&
    store.longitude !== undefined
  );
}
