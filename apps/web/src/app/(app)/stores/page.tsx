import {
  StoreArchiveButton,
  StoreBulkGeocodeButton,
  StoreCreateForm,
  StoreEditForm,
} from "@/components/store-actions";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  inferStoreCityFromAddress,
  timeZoneForStoreCity,
} from "@/lib/store-location";
import { getStores, type Store } from "@/lib/stores";
import type { ReactNode } from "react";

export default async function StoresPage() {
  const user = await requireCurrentUser();
  const stores = await getStores();
  const canEditStores = can(user, "edit_stores");
  const missingCoordinates = stores.filter(
    (store) =>
      store.isActive &&
      !hasCoordinates(store) &&
      (store.address || store.yandexMapsUrl),
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
                  ? "Геймификация не включена"
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
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Список точек</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Заполненные поля подсвечены как готовые. Часовой пояс
                подставляется после выбора города.
              </p>
            </div>
            {canEditStores ? (
              <StoreBulkGeocodeButton missingCount={missingCoordinates} />
            ) : null}
          </div>
          <div className="divide-y divide-zinc-100">
            {stores.map((store) => (
              <article key={store.id} className="px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-zinc-950">
                        {store.name}
                      </h3>
                      <StoreStatusPill tone={store.isActive ? "ready" : "muted"}>
                        {store.isActive ? "Активна" : "Архив"}
                      </StoreStatusPill>
                      <StoreStatusPill
                        tone={store.gamificationEnabled ? "ready" : "muted"}
                      >
                        {store.gamificationEnabled
                          ? "Геймификация включена"
                          : "Геймификация выключена"}
                      </StoreStatusPill>
                      <StoreStatusPill
                        tone={hasCoordinates(store) ? "ready" : "warning"}
                      >
                        {hasCoordinates(store)
                          ? "Карта готова"
                          : "Нужны координаты"}
                      </StoreStatusPill>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {store.address ?? "Адрес не заполнен"}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                      /game/auth?storeId={store.publicSlug ?? store.id}
                    </p>
                  </div>
                  {canEditStores ? (
                    <div className="shrink-0">
                      <StoreArchiveButton id={store.id} />
                    </div>
                  ) : null}
                </div>

                <StoreFieldReadiness store={store} />

                {canEditStores ? (
                  <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/70 p-3">
                    <StoreEditForm store={store} />
                  </div>
                ) : null}
              </article>
            ))}

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

type StoreStatusTone = "ready" | "warning" | "missing" | "muted" | "info";

function StoreStatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: StoreStatusTone;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${storeStatusToneClass(tone)}`}
    >
      {children}
    </span>
  );
}

function StoreFieldReadiness({ store }: { store: Store }) {
  const coordinatesReady = hasCoordinates(store);
  const inferredCity = inferStoreCityFromAddress(store.address);
  const displayCity = store.city ?? inferredCity;
  const displayTimeZone = store.timeZone ?? timeZoneForStoreCity(displayCity);
  const items = [
    {
      label: "Адрес",
      value: store.address ? "заполнен" : "нужно заполнить",
      detail: store.address ?? "Нужен для геокодинга и списка клубов.",
      tone: store.address ? "ready" : "missing",
    },
    {
      label: "Город",
      value:
        displayCity ??
        (coordinatesReady ? "не требуется для карты" : "нужно заполнить"),
      detail: store.city
        ? "Используется в поиске и быстрых фильтрах."
        : inferredCity
          ? "Определен по адресу и сохранится при следующем обновлении."
          : coordinatesReady
            ? "Карта уже работает по координатам; город нужен только для фильтров."
            : "После выбора города подтянем часовой пояс.",
      tone: displayCity ? "ready" : coordinatesReady ? "info" : "missing",
    },
    {
      label: "Часовой пояс",
      value:
        displayTimeZone ??
        (coordinatesReady ? "не требуется для карты" : "заполнится от города"),
      detail: displayTimeZone
        ? "Поле уже готово, отдельно заполнять не нужно."
        : displayCity
          ? "Город есть, но часовой пояс не определен."
          : coordinatesReady
            ? "Карта уже работает; часовой пояс нужен для расписаний и отчетов."
          : "Выберите город, и поле подставится автоматически.",
      tone: displayTimeZone ? "ready" : displayCity ? "warning" : "info",
    },
    {
      label: "Координаты",
      value: coordinatesReady
        ? `${formatCoordinate(store.latitude)}, ${formatCoordinate(store.longitude)}`
        : store.yandexMapsUrl
          ? "можно взять из ссылки"
          : "нужны для карты",
      detail: coordinatesReady
        ? "Геопоиск и карта могут использовать клуб."
        : store.yandexMapsUrl
          ? "Нажмите «Из ссылки» или «Заполнить координаты»."
          : "Добавьте ссылку Яндекс Карт или заполните вручную.",
      tone: coordinatesReady
        ? "ready"
        : store.yandexMapsUrl
          ? "warning"
          : "missing",
    },
    {
      label: "Яндекс Карты",
      value: store.yandexMapsUrl ? "ссылка сохранена" : "можно добавить",
      detail: store.yandexMapsUrl
        ? "Можно повторно получить координаты без адресного справочника."
        : "Ссылка ускоряет заполнение координат.",
      tone: store.yandexMapsUrl ? "ready" : "info",
    },
    {
      label: "Гостевой вход",
      value: "ссылка готова",
      detail: `/game/auth?storeId=${store.publicSlug ?? store.id}`,
      tone: "ready",
    },
  ] satisfies Array<{
    label: string;
    value: string;
    detail: string;
    tone: StoreStatusTone;
  }>;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {item.label}
            </p>
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${storeStatusDotClass(item.tone)}`}
            />
          </div>
          <p className="mt-1 text-sm font-semibold text-zinc-950">
            {item.value}
          </p>
          <p className="mt-1 break-words text-xs text-zinc-500">
            {item.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function storeStatusToneClass(tone: StoreStatusTone) {
  switch (tone) {
    case "ready":
      return "bg-emerald-100 text-emerald-800";
    case "warning":
      return "bg-amber-100 text-amber-800";
    case "missing":
      return "bg-rose-100 text-rose-800";
    case "info":
      return "bg-cyan-100 text-cyan-800";
    case "muted":
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

function storeStatusDotClass(tone: StoreStatusTone) {
  switch (tone) {
    case "ready":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "missing":
      return "bg-rose-500";
    case "info":
      return "bg-cyan-500";
    case "muted":
    default:
      return "bg-zinc-400";
  }
}

function formatCoordinate(value: Store["latitude"]) {
  return value === null || value === undefined ? "—" : String(value);
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
