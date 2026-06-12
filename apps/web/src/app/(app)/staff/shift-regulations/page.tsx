import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffShiftOperationsOverview } from "@/components/staff-shift-operations-overview";
import { StaffShiftRegulationBuilder } from "@/components/staff-shift-regulation-builder";
import { StaffShiftRegulationCatalog } from "@/components/staff-shift-regulation-catalog";
import { requireCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStaffChecklistExecutionReport } from "@/lib/staff-checklists";
import {
  getStaffChecklistTemplateReport,
  type StaffChecklistTemplateFilterStatus,
} from "@/lib/staff-checklist-templates";
import {
  getStaffShiftRegulationReport,
  type StaffShiftKind,
  type StaffShiftRegulationFilterStatus,
  type StaffShiftRegulationFilters,
} from "@/lib/staff-shift-regulations";
import { getStaffTaskReport } from "@/lib/staff-tasks";

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

function isCatalogOnlyRole(role: string) {
  return catalogOnlyRoles.has(role);
}

function currentOperationalDate() {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valueByType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
}

function operationalDateLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${value}T00:00:00+05:00`));
}

function checklistStatusFromRegulationStatus(
  status: StaffShiftRegulationFilterStatus,
): StaffChecklistTemplateFilterStatus {
  if (status === "DRAFT") {
    return "DRAFT";
  }

  if (status === "PUBLISHED") {
    return "ACTIVE";
  }

  if (status === "ARCHIVED") {
    return "ARCHIVED";
  }

  return "all";
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
  const operationalDate = currentOperationalDate();
  const [report, checklistTemplates, checklistExecution, taskReport] =
    await Promise.all([
    getStaffShiftRegulationReport(filters),
    getStaffChecklistTemplateReport({
      status: canManageRegulations
        ? checklistStatusFromRegulationStatus(filters.status ?? "all")
        : "ACTIVE",
      shiftKind: requestedFilters.shiftKind,
      storeId: requestedFilters.storeId,
      search: requestedFilters.search,
    }),
    getStaffChecklistExecutionReport({
      status: "all",
      shiftKind: "all",
      dateFrom: operationalDate,
      dateTo: operationalDate,
    }),
    getStaffTaskReport({
      status: "all",
      dueFrom: operationalDate,
      dueTo: operationalDate,
      sort: "dueAt",
      pageSize: "500",
    }),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Регламенты и чек-листы"
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
              Регламенты и чек-листы
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {canManageRegulations
                ? "Каталог опубликованных регламентов и чек-листов смены. Конструктор открывается только когда нужно создать или изменить документ."
                : "Открывайте опубликованные регламенты, материалы и чек-листы смены. Если регламент требует ознакомления, подтвердите его после прочтения."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageRegulations ? (
              <Link
                href="/staff/checklist-templates?new=1"
                className="inline-flex h-11 min-w-44 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Новый чек-лист
              </Link>
            ) : null}
            <Link
              href={canManageRegulations ? "/staff/tasks" : "/staff/checklists"}
              className="inline-flex h-11 min-w-44 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {canManageRegulations ? "Задачи персонала" : "Открыть чек-листы"}
            </Link>
          </div>
        </header>

        <StaffShiftOperationsOverview
          checklists={checklistExecution}
          tasks={taskReport}
          dateLabel={operationalDateLabel(operationalDate)}
        />

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
              checklistTemplates={checklistTemplates.rows}
              stores={report.stores}
              assessments={report.assessments}
              currentUserId={user.id}
              currentUserRole={user.role}
            />
          ) : (
            <StaffShiftRegulationCatalog
              rows={report.rows}
              checklistTemplates={checklistTemplates.rows}
            />
          )}
        </section>
      </div>
    </main>
  );
}
