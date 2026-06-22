import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffChecklistWorkspace } from "@/components/staff-checklist-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffChecklistReport,
  type StaffChecklistFilterStatus,
  type StaffChecklistFilters,
  type StaffChecklistShiftKind,
} from "@/lib/staff-checklists";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const checklistUseOnlyRoles = new Set([
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
]);

const statusLabels: Record<StaffChecklistFilterStatus, string> = {
  all: "Все статусы",
  OPEN: "Новые",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  ACCEPTED: "Приняты",
  RETURNED: "Возвращены",
  ESCALATED: "Эскалированы",
  CANCELED: "Отменены",
  OVERDUE: "Просрочены",
};

const shiftKindLabels: Record<StaffChecklistShiftKind | "all", string> = {
  all: "Все типы",
  OPENING: "Открытие",
  CLOSING: "Закрытие",
  CASH: "Касса",
  BAR: "Бар",
  PC_ZONE: "PC-зона",
  CLEANLINESS: "Чистота",
  INCIDENT: "Инцидент",
  INVENTORY: "Передача ТМЦ",
  CUSTOM: "Другое",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffChecklistFilterStatus {
  return (
    value === "all" ||
    value === "OPEN" ||
    value === "IN_PROGRESS" ||
    value === "ON_REVIEW" ||
    value === "ACCEPTED" ||
    value === "RETURNED" ||
    value === "ESCALATED" ||
    value === "CANCELED" ||
    value === "OVERDUE"
  );
}

function isShiftKind(
  value: string | undefined,
): value is StaffChecklistShiftKind | "all" {
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

function resolveFilters(params: Awaited<SearchParams>): StaffChecklistFilters {
  const status = searchParam(params.status);
  const shiftKind = searchParam(params.shiftKind);

  return {
    status: isStatus(status) ? status : "all",
    shiftKind: isShiftKind(shiftKind) ? shiftKind : "all",
    runId: searchParam(params.runId),
    regulationId: searchParam(params.regulationId),
    storeId: searchParam(params.storeId),
    assignedToUserId: searchParam(params.assignedToUserId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function isChecklistUseOnlyRole(role: string) {
  return checklistUseOnlyRoles.has(role);
}

export default async function StaffChecklistsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffChecklistReport(filters);
  const canManageChecklists = !isChecklistUseOnlyRole(user.role);
  const breadcrumbItems = [
    { href: "/dashboard", label: "Дашборд" },
    { href: "/staff/tasks", label: "Задачи персонала" },
    ...(canManageChecklists
      ? [{ href: "/staff/shift-regulations", label: "Регламенты смены" }]
      : []),
  ];

  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Просрочено", value: report.summary.overdue },
    { label: "На проверке", value: report.summary.onReview },
    { label: "Принято", value: report.summary.accepted },
    { label: "Эскалировано", value: report.summary.escalated },
    { label: "Проблемные пункты", value: report.summary.failedItems },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Чеклисты смены"
          items={breadcrumbItems}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Чеклисты смены
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {canManageChecklists
                ? "Выполнение опубликованных регламентов: открыть смену, закрыть кассу, проверить бар, PC-зону и чистоту. Обязательные пункты и доказательства контролируются перед отправкой на проверку."
                : "Текущие чек-листы вашей смены: отметьте пункты, приложите доказательства и отправьте результат на проверку."}
            </p>
          </div>
          {canManageChecklists ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/staff/checklists/report"
                className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                Отчет по чек-листам
              </Link>
              <Link
                href="/staff/checklist-templates"
                className="inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
              >
                Шаблоны чеклистов
              </Link>
              <Link
                href="/staff/shift-regulations"
                className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                Регламенты
              </Link>
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-semibold uppercase text-zinc-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={report.filters.status}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Тип смены
              </span>
              <select
                name="shiftKind"
                defaultValue={report.filters.shiftKind}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {Object.entries(shiftKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Все клубы</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            {canManageChecklists ? (
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Ответственный
                </span>
                <select
                  name="assignedToUserId"
                  defaultValue={report.filters.assignedToUserId ?? ""}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="">Все сотрудники</option>
                  {report.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName ?? user.email}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-sm lg:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Название чеклиста или регламента"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Применить
            </button>
          </div>
        </form>

        <section className="mt-6">
          <StaffChecklistWorkspace
            key={report.filters.runId ?? "all-checklists"}
            report={report}
            focusRunId={report.filters.runId}
            canCreateRuns={true}
            canReviewRuns={canManageChecklists}
            canAssignRuns={canManageChecklists}
            canStartFromRegulations={canManageChecklists}
          />
        </section>
      </div>
    </main>
  );
}
