import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffShiftRegulationBuilder } from "@/components/staff-shift-regulation-builder";
import { StaffShiftRegulationCatalog } from "@/components/staff-shift-regulation-catalog";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getStaffShiftRegulationReport,
  type StaffShiftKind,
  type StaffShiftRegulationFilterStatus,
  type StaffShiftRegulationFilters,
} from "@/lib/staff-shift-regulations";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const catalogOnlyRoles = new Set([
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);

const statusLabels: Record<StaffShiftRegulationFilterStatus, string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  PUBLISHED: "Опубликованные",
  ARCHIVED: "Архив",
};

const shiftKindLabels: Record<StaffShiftKind | "all", string> = {
  all: "Все типы",
  OPENING: "Открытие смены",
  CLOSING: "Закрытие смены",
  CASH: "Касса",
  BAR: "Бар",
  PC_ZONE: "PC-зона",
  CLEANLINESS: "Чистота",
  INCIDENT: "Инциденты",
  INVENTORY: "Передача остатков",
  CUSTOM: "Свой регламент",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(
  value: string | undefined,
): value is StaffShiftRegulationFilterStatus {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "PUBLISHED" ||
    value === "ARCHIVED"
  );
}

function isShiftKind(value: string | undefined): value is StaffShiftKind | "all" {
  return (
    value === "all" ||
    value === "OPENING" ||
    value === "CLOSING" ||
    value === "CASH" ||
    value === "BAR" ||
    value === "PC_ZONE" ||
    value === "CLEANLINESS" ||
    value === "INCIDENT" ||
    value === "INVENTORY" ||
    value === "CUSTOM"
  );
}

function resolveFilters(params: Awaited<SearchParams>): StaffShiftRegulationFilters {
  const status = searchParam(params.status);
  const shiftKind = searchParam(params.shiftKind);

  return {
    status: isStatus(status) ? status : "all",
    shiftKind: isShiftKind(shiftKind) ? shiftKind : "all",
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function isCatalogOnlyRole(role: string) {
  return catalogOnlyRoles.has(role);
}

export default async function StaffShiftRegulationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const requestedFilters = resolveFilters(params);
  const canManageRegulations =
    can(user, "manage_staff_standards") && !isCatalogOnlyRole(user.role);
  const filters: StaffShiftRegulationFilters = canManageRegulations
    ? requestedFilters
    : { ...requestedFilters, status: "PUBLISHED" };
  const report = await getStaffShiftRegulationReport(filters);

  const summaryCards = canManageRegulations
    ? [
        { label: "Всего", value: report.summary.total },
        { label: "Черновики", value: report.summary.draft },
        { label: "Опубликовано", value: report.summary.published },
        { label: "Архив", value: report.summary.archived },
        {
          label: "Пунктов с доказательством",
          value: report.summary.requiredEvidenceItems,
        },
        {
          label: "Ждут ознакомления",
          value: report.summary.pendingAcknowledgements,
        },
        { label: "С пересдачей", value: report.summary.retakeRequired },
      ]
    : [
        { label: "Опубликовано", value: report.summary.published },
        {
          label: "Ждут ознакомления",
          value: report.summary.pendingAcknowledgements,
        },
        {
          label: "Пунктов с доказательством",
          value: report.summary.requiredEvidenceItems,
        },
        { label: "С пересдачей", value: report.summary.retakeRequired },
      ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current={
            canManageRegulations
              ? "Регламенты смены"
              : "Регламенты и чек-листы"
          }
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Задачи персонала" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {canManageRegulations
                ? "Конструктор регламентов смены"
                : "Каталог регламентов и чек-листов"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {canManageRegulations
                ? "Соберите стандарт открытия, закрытия, кассы, бара или PC-зоны: разделы, пункты, обязательность, тип контроля, доказательства и баллы качества. Опубликованный регламент станет основой для будущих сменных чек-листов."
                : "Открывайте опубликованные регламенты, материалы и чек-листы смены. Если регламент требует ознакомления, подтвердите его после прочтения."}
            </p>
          </div>
          <Link
            href={canManageRegulations ? "/staff/tasks" : "/staff/checklists"}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {canManageRegulations ? "Задачи персонала" : "Открыть чек-листы"}
          </Link>
        </header>

        <section
          className={`mt-6 grid gap-3 sm:grid-cols-2 ${
            canManageRegulations ? "lg:grid-cols-7" : "lg:grid-cols-4"
          }`}
        >
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form
            className={`grid gap-3 ${
              canManageRegulations
                ? "lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                : "lg:grid-cols-[1fr_1fr_1fr_auto]"
            }`}
          >
            {canManageRegulations ? (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Статус
                </span>
                <select
                  name="status"
                  defaultValue={report.filters.status}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="status" value="PUBLISHED" />
            )}

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Тип
              </span>
              <select
                name="shiftKind"
                defaultValue={report.filters.shiftKind}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(shiftKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Название или описание"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <div className="flex items-end">
              <button className="h-10 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                Показать
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6">
          {canManageRegulations ? (
            <StaffShiftRegulationBuilder
              rows={report.rows}
              stores={report.stores}
              assessments={report.assessments}
              currentUserRole={user.role}
            />
          ) : (
            <StaffShiftRegulationCatalog rows={report.rows} />
          )}
        </section>
      </div>
    </main>
  );
}
