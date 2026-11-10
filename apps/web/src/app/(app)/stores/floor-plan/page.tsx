import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { fetchWithTimeout, getApiUrl, getAuthHeaders } from "@/lib/api";
import { ensurePageAccess, requireCurrentUser } from "@/lib/auth";
import {
  CLUB_FLOOR_PLAN_TEMPLATES,
  clubFloorPlanSceneUrl,
  clubFloorPlanTemplateFor,
} from "@/lib/club-floor-plan-templates";
import { can } from "@/lib/permissions";
import { getStores, type Store } from "@/lib/stores";

type FloorPlanView = {
  plan: { layout: { template?: string } } | null;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// The saved hall decides the scene; a failed read falls back to the club name.
async function savedTemplateOf(storeId: string) {
  try {
    const response = await fetchWithTimeout(
      `${getApiUrl()}/stores/${encodeURIComponent(storeId)}/floor-plan`,
      { cache: "no-store", headers: await getAuthHeaders() },
    );
    if (!response.ok) {
      return null;
    }
    const view = (await response.json()) as FloorPlanView;
    return typeof view.plan?.layout?.template === "string"
      ? view.plan.layout.template
      : null;
  } catch {
    return null;
  }
}

export default async function StoreFloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCurrentUser();
  ensurePageAccess(user, "/stores/floor-plan");
  const params = await searchParams;
  const stores = (await getStores()).filter((store) => store.isActive);
  const requested = first(params.store);
  const selected =
    stores.find((store) => store.id === requested) ??
    stores.find((store) => clubFloorPlanTemplateFor(store)) ??
    stores[0] ??
    null;
  const template = selected
    ? clubFloorPlanTemplateFor(selected, await savedTemplateOf(selected.id))
    : null;
  // Saving the hall is a network-wide setting, as on the API.
  const canEdit =
    can(user, "edit_stores") &&
    user.accessScope === "NETWORK" &&
    ["OWNER", "ADMIN", "MANAGER"].includes(user.role);
  const sceneUrl =
    selected && template
      ? clubFloorPlanSceneUrl(template, selected.id, canEdit)
      : null;

  return (
    <main className="px-4 py-6 text-zinc-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Схема клуба"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/stores", label: "Торговые точки" },
          ]}
        />
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Схема клуба
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              3D-зал клуба с живыми данными Langame: занятые компьютеры, смена
              администратора и выручка. Данные обновляются каждые 20 секунд.
              {canEdit
                ? " Мебель и места можно переставить кнопкой «Редактировать» на схеме."
                : ""}
            </p>
          </div>
          {sceneUrl ? (
            <a
              className="inline-flex min-h-11 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              href={sceneUrl}
              rel="noopener"
              target="_blank"
            >
              Открыть на весь экран
            </a>
          ) : null}
        </div>

        {stores.length > 1 ? (
          <nav aria-label="Клуб" className="mb-4 flex flex-wrap gap-2">
            {stores.map((store) => (
              <StoreChip
                key={store.id}
                store={store}
                active={store.id === selected?.id}
              />
            ))}
          </nav>
        ) : null}

        {sceneUrl && selected ? (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800">
            <iframe
              key={selected.id}
              className="block h-[calc(100dvh-15rem)] min-h-[34rem] w-full"
              src={sceneUrl}
              title={`Схема клуба ${selected.name}`}
            />
          </div>
        ) : (
          <EmptyState store={selected} />
        )}
      </div>
    </main>
  );
}

function StoreChip({ store, active }: { store: Store; active: boolean }) {
  const ready = Boolean(clubFloorPlanTemplateFor(store));
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-600 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900 dark:border-cyan-500 dark:bg-cyan-950/50 dark:text-cyan-100"
          : "inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }
      href={`/stores/floor-plan?store=${encodeURIComponent(store.id)}`}
    >
      {store.name}
      {ready ? null : (
        <span className="text-xs font-normal text-zinc-500">нет схемы</span>
      )}
    </Link>
  );
}

function EmptyState({ store }: { store: Store | null }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-950">
        {store
          ? `Для клуба «${store.name}» схемы зала пока нет`
          : "Активных клубов пока нет"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600">
        {store
          ? `Зал рисуем по схеме бронирования Langame. Сейчас готова схема: ${CLUB_FLOOR_PLAN_TEMPLATES.map((template) => template.title).join(", ")}. Напишите в поддержку, чтобы добавить этот клуб.`
          : "Добавьте клуб в разделе «Торговые точки»."}
      </p>
    </div>
  );
}
