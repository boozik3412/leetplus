import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { fetchWithTimeout, getApiUrl, getAuthHeaders } from "@/lib/api";
import { ensurePageAccess, requireCurrentUser } from "@/lib/auth";
import {
  CLUB_FLOOR_PLAN_TEMPLATES,
  clubFloorPlanSceneUrl,
  clubFloorPlanTemplateFor,
  type ClubFloorPlanTemplate,
} from "@/lib/club-floor-plan-templates";
import { can } from "@/lib/permissions";

type Store = { id: string; name: string; address: string | null };
type FloorPlanClub = Store & { template: string | null };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// Active clubs of the viewer's scope with the hall saved for each. A failed
// read shows the empty state rather than an error page.
async function floorPlanClubs(): Promise<FloorPlanClub[]> {
  try {
    const response = await fetchWithTimeout(
      `${getApiUrl()}/stores/floor-plans`,
      { cache: "no-store", headers: await getAuthHeaders() },
    );
    if (!response.ok) {
      return [];
    }
    const view = (await response.json()) as { clubs?: FloorPlanClub[] };
    return Array.isArray(view.clubs) ? view.clubs : [];
  } catch {
    return [];
  }
}

export default async function VisualizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCurrentUser();
  ensurePageAccess(user, "/visualization");
  const params = await searchParams;
  const clubs = (await floorPlanClubs()).map(({ template, ...store }) => ({
    store,
    saved: template,
    template: clubFloorPlanTemplateFor(store, template),
  }));
  const requested = first(params.store);
  const selected =
    clubs.find((club) => club.store.id === requested) ??
    clubs.find((club) => club.template) ??
    clubs[0] ??
    null;
  // Saving the hall is a network-wide setting, as on the API.
  const canEdit =
    can(user, "edit_stores") &&
    user.accessScope === "NETWORK" &&
    ["OWNER", "ADMIN", "MANAGER"].includes(user.role);
  const template = selected
    ? clubFloorPlanTemplateFor(
        selected.store,
        selected.saved,
        canEdit ? first(params.template) : null,
      )
    : null;
  const sceneUrl =
    selected && template
      ? clubFloorPlanSceneUrl(template, selected.store.id, canEdit)
      : null;

  return (
    <main className="px-4 py-6 text-zinc-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Схема клуба"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
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

        {clubs.length > 1 ? (
          <nav aria-label="Клуб" className="mb-4 flex flex-wrap gap-2">
            {clubs.map((club) => (
              <StoreChip
                key={club.store.id}
                store={club.store}
                ready={Boolean(club.template)}
                active={club.store.id === selected?.store.id}
              />
            ))}
          </nav>
        ) : null}

        {sceneUrl && selected ? (
          <>
            {!selected.saved && canEdit ? (
              <p className="mb-3 text-sm text-zinc-600">
                Схема ещё не сохранена для этого клуба. Нажмите «Редактировать»
                и «Сохранить схему», чтобы закрепить её.
              </p>
            ) : null}
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800">
              <iframe
                key={`${selected.store.id}:${template?.id}`}
                className="block h-[calc(100dvh-15rem)] min-h-[34rem] w-full"
                src={sceneUrl}
                title={`Схема клуба ${selected.store.name}`}
              />
            </div>
          </>
        ) : (
          <EmptyState store={selected?.store ?? null} canEdit={canEdit} />
        )}
      </div>
    </main>
  );
}

function StoreChip({
  store,
  ready,
  active,
}: {
  store: Store;
  ready: boolean;
  active: boolean;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-600 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900 dark:border-cyan-500 dark:bg-cyan-950/50 dark:text-cyan-100"
          : "inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }
      href={`/visualization?store=${encodeURIComponent(store.id)}`}
    >
      {store.name}
      {ready ? null : (
        <span className="text-xs font-normal text-zinc-500">нет схемы</span>
      )}
    </Link>
  );
}

function EmptyState({
  store,
  canEdit,
}: {
  store: Store | null;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-950">
        {store
          ? `Для клуба «${store.name}» схема зала не выбрана`
          : "Активных клубов пока нет"}
      </h2>
      {store && canEdit ? (
        <>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600">
            Выберите нарисованный зал. После «Сохранить схему» в редакторе он
            закрепится за этим клубом.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {CLUB_FLOOR_PLAN_TEMPLATES.map((template) => (
              <TemplateLink
                key={template.id}
                store={store}
                template={template}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600">
          {store
            ? "Зал рисуем по схеме бронирования Langame. Напишите в поддержку, чтобы добавить этот клуб."
            : "Добавьте клуб в разделе «Торговые точки»."}
        </p>
      )}
    </div>
  );
}

function TemplateLink({
  store,
  template,
}: {
  store: Store;
  template: ClubFloorPlanTemplate;
}) {
  const params = new URLSearchParams({
    store: store.id,
    template: template.id,
  });
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
      href={`/visualization?${params.toString()}`}
    >
      Зал «{template.title}»
    </Link>
  );
}
