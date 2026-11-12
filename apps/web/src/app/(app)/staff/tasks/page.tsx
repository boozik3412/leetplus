import Link from "next/link";
import { LocalDateTime } from "@/components/local-date-time";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import {
  StaffTaskCreateForm,
  type StaffTaskDraft,
} from "@/components/staff-task-create-form";
import { StaffTaskBoard } from "@/components/staff-task-board";
import { StaffTaskHistory } from "@/components/staff-task-history";
import { StaffTaskStatusActions } from "@/components/staff-task-status-actions";
import { ensurePageAccess, requireCurrentUser } from "@/lib/auth";
import {
  isKnowledgeBaseApprovalTask,
  staffTaskAssigneeLabel,
  staffTaskObserverLabels,
  staffTaskPriorityLabels,
  staffTaskStatusLabels,
  staffTaskTypeLabels,
} from "@/lib/staff-task-display";
import { staffTaskCandidateUserIds } from "@/lib/staff-task-moves";
import {
  getStaffTaskReport,
  type StaffTask,
  type StaffTaskFilterStatus,
  type StaffTaskFilters,
  type StaffTaskGroup,
  type StaffTaskPriority,
  type StaffTaskSortKey,
  type StaffTaskType,
  type StaffTaskUser,
  type StaffTaskViewMode,
} from "@/lib/staff-tasks";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffTaskFilterStatus, string> = {
  all: "Все статусы",
  OPEN: "Новые",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  DONE: "Готово",
  OVERDUE: "Просрочено",
  CANCELED: "Отменены",
};

/** The four views people switch between every day. */
const chipViews: StaffTaskViewMode[] = ["all", "today", "overdue", "my"];

const chipLabels: Partial<Record<StaffTaskViewMode, string>> = {
  all: "Все",
  today: "Сегодня",
  overdue: "Просрочены",
  my: "Мои",
};

/** The rest of the views live in one «Вид» dropdown. */
const extraViews: Array<{ key: StaffTaskViewMode; label: string }> = [
  { key: "watched", label: "Я наблюдаю" },
  { key: "approval", label: "Возврат из базы знаний" },
  { key: "byClub", label: "Сводка по клубам" },
  { key: "byEmployee", label: "Сводка по сотрудникам" },
  { key: "byShift", label: "Сводка по сменам" },
  { key: "byStatus", label: "Сводка по статусам" },
];

const groupViewLabels: Partial<Record<StaffTaskViewMode, string>> = {
  byClub: "По клубам",
  byEmployee: "По сотрудникам",
  byShift: "По сменам",
  byStatus: "По статусам",
};

const groupViewDescriptions: Partial<Record<StaffTaskViewMode, string>> = {
  byClub: "Где копятся задачи и просрочка.",
  byEmployee: "Сколько задач у каждого и что просрочено.",
  byShift: "Задачи на смену и задачи, привязанные к сменам.",
  byStatus: "Сколько задач на каждом шаге.",
};

type Layout = "board" | "list";

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffTaskFilterStatus {
  return (
    value === "all" ||
    value === "OPEN" ||
    value === "IN_PROGRESS" ||
    value === "ON_REVIEW" ||
    value === "DONE" ||
    value === "OVERDUE" ||
    value === "CANCELED"
  );
}

function isView(value: string | undefined): value is StaffTaskViewMode {
  return (
    value === "all" ||
    value === "today" ||
    value === "overdue" ||
    value === "my" ||
    value === "watched" ||
    value === "approval" ||
    value === "byClub" ||
    value === "byEmployee" ||
    value === "byShift" ||
    value === "byStatus"
  );
}

function isType(value: string | undefined): value is StaffTaskType | "all" {
  return (
    value === "all" ||
    value === "ONE_TIME" ||
    value === "SHIFT" ||
    value === "RECURRING" ||
    value === "LONG_TERM" ||
    value === "PERSONAL" ||
    value === "CLUB" ||
    value === "ROLE"
  );
}

function isPriority(
  value: string | undefined,
): value is StaffTaskPriority | "all" {
  return (
    value === "all" ||
    value === "LOW" ||
    value === "NORMAL" ||
    value === "HIGH" ||
    value === "URGENT"
  );
}

const draftTypes = new Set<StaffTaskDraft["type"]>([
  "ONE_TIME",
  "SHIFT",
  "RECURRING",
  "LONG_TERM",
  "PERSONAL",
  "CLUB",
  "ROLE",
]);

/** A task prepared by a signal of the network summary (`draft*` params). */
function resolveDraft(params: Awaited<SearchParams>): StaffTaskDraft | null {
  const title = searchParam(params.draftTitle)?.trim().slice(0, 200);
  if (!title) return null;
  const priority = searchParam(params.draftPriority);
  const type = searchParam(params.draftType) as StaffTaskDraft["type"];
  return {
    title,
    description:
      searchParam(params.draftDescription)?.trim().slice(0, 2000) ?? "",
    storeId: searchParam(params.draftStoreId) ?? null,
    priority: isPriority(priority) && priority !== "all" ? priority : "NORMAL",
    type: draftTypes.has(type) ? type : "ONE_TIME",
  };
}

function isSort(value: string | undefined): value is StaffTaskSortKey {
  return (
    value === "dueAt" ||
    value === "createdAt" ||
    value === "updatedAt" ||
    value === "status" ||
    value === "priority"
  );
}

function resolveFilters(params: Awaited<SearchParams>): StaffTaskFilters {
  const view = searchParam(params.view);
  const status = searchParam(params.status);
  const type = searchParam(params.type);
  const priority = searchParam(params.priority);
  const sort = searchParam(params.sort);
  const direction = searchParam(params.direction);

  return {
    view: isView(view) ? view : "all",
    status: isStatus(status) ? status : "all",
    type: isType(type) ? type : "all",
    priority: isPriority(priority) ? priority : "all",
    storeId: searchParam(params.storeId),
    taskId: searchParam(params.taskId),
    shiftId: searchParam(params.shiftId),
    assignedToUserId: searchParam(params.assignedToUserId),
    observerUserId: searchParam(params.observerUserId),
    search: searchParam(params.search)?.trim(),
    dueFrom: searchParam(params.dueFrom),
    dueTo: searchParam(params.dueTo),
    sort: isSort(sort) ? sort : "dueAt",
    direction: direction === "desc" ? "desc" : "asc",
    pageSize: searchParam(params.pageSize) ?? "200",
  };
}

function resolveLayout(params: Awaited<SearchParams>): Layout {
  return searchParam(params.layout) === "list" ? "list" : "board";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function exportHref(format: "csv" | "xlsx", filters: StaffTaskFilters) {
  const params = new URLSearchParams();

  Object.entries({ ...filters, format, pageSize: undefined, taskId: undefined }).forEach(
    ([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    },
  );

  return `/api/staff/tasks/export?${params.toString()}`;
}

function taskListHref(
  filters: StaffTaskFilters,
  patch: Record<string, string | null | undefined>,
  layout: Layout,
) {
  const params = new URLSearchParams();
  const next: Record<string, string | null | undefined> = {
    ...filters,
    // Defaults stay out of the address.
    view: filters.view === "all" ? null : filters.view,
    status: filters.status === "all" ? null : filters.status,
    sort: filters.sort === "dueAt" ? null : filters.sort,
    direction: filters.direction === "asc" ? null : filters.direction,
    pageSize: filters.pageSize === "200" ? null : filters.pageSize,
    type: filters.type === "all" ? null : filters.type,
    priority: filters.priority === "all" ? null : filters.priority,
    taskId: null,
    layout: layout === "list" ? "list" : null,
    ...patch,
  };

  Object.entries(next).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const value = params.toString();
  return value ? `/staff/tasks?${value}` : "/staff/tasks";
}

function statusBadgeClass(task: StaffTask) {
  const base =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase";

  if (task.isOverdue) {
    return `${base} bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200`;
  }

  if (task.status === "DONE") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (task.status === "IN_PROGRESS") {
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  if (task.status === "ON_REVIEW") {
    return `${base} bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200`;
  }

  if (task.status === "CANCELED") {
    return `${base} bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`;
  }

  return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
}

function priorityClass(priority: StaffTaskPriority) {
  if (priority === "URGENT") {
    return "text-red-600 dark:text-red-300";
  }

  if (priority === "HIGH") {
    return "text-amber-600 dark:text-amber-300";
  }

  if (priority === "LOW") {
    return "text-zinc-500 dark:text-zinc-400";
  }

  return "text-zinc-700 dark:text-zinc-200";
}

function StaffTaskGroupSummary({
  title,
  description,
  groups,
  filters,
  layout,
}: {
  title: string;
  description: string;
  groups: StaffTaskGroup[];
  filters: StaffTaskFilters;
  layout: Layout;
}) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <Link
          href={taskListHref(
            filters,
            { view: null, status: null, shiftId: null },
            layout,
          )}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          Убрать сводку
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.slice(0, 12).map((group) => {
          const activeCount =
            group.open + group.inProgress + group.onReview;
          const href = taskListHref(
            filters,
            {
              view: null,
              status: group.filter.status ?? filters.status ?? null,
              storeId: group.filter.storeId ?? filters.storeId,
              assignedToUserId:
                group.filter.assignedToUserId ?? filters.assignedToUserId,
              shiftId: group.filter.shiftId ?? filters.shiftId,
            },
            layout,
          );

          return (
            <Link
              key={group.key}
              href={href}
              className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {group.label}
                  </h3>
                  {group.hint ? (
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {group.hint}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  {formatNumber(group.total)}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="font-bold uppercase text-zinc-500">
                    Активно
                  </dt>
                  <dd className="mt-1 text-base font-semibold">
                    {formatNumber(activeCount)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase text-zinc-500">
                    Проср.
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-red-600 dark:text-red-300">
                    {formatNumber(group.overdue)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase text-zinc-500">
                    Готово
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatNumber(group.done)}
                  </dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default async function StaffTasksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const currentUser = await requireCurrentUser();
  ensurePageAccess(currentUser, "/staff/tasks");
  const params = await searchParams;
  const filters = resolveFilters(params);
  const layout = resolveLayout(params);
  const draft = resolveDraft(params);
  const report = await getStaffTaskReport(filters);
  const currentStaffUser = report.users.find((user) => user.id === currentUser.id);
  const activeGroupRows =
    report.filters.view === "byClub"
      ? report.groups.byClub
      : report.filters.view === "byEmployee"
        ? report.groups.byEmployee
        : report.filters.view === "byShift"
          ? report.groups.byShift
          : report.filters.view === "byStatus"
            ? report.groups.byStatus
            : [];
  const quickViewCount = new Map(
    report.quickViews.map((view) => [view.key, view.count]),
  );
  const activeView = report.filters.view;
  const isChipView = chipViews.includes(activeView);
  const statusFilter = report.filters.status;
  const filterControlClass =
    "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const layoutLinkClass = (active: boolean) =>
    `inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
      active
        ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
        : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
    }`;

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Задачи персонала"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/staff-control", label: "Контроль персонала" },
          ]}
        />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Задачи персонала
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Кто что делает и к какому сроку. Откройте карточку, чтобы
              сменить статус или написать комментарий.
            </p>
          </div>
          <div id="new-task" className="flex flex-wrap items-center gap-2">
            <Link
              href="/staff/task-templates"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Шаблоны задач
            </Link>
            <StaffTaskCreateForm
              users={report.users}
              stores={report.stores}
              currentUser={{
                id: currentUser.id,
                role: currentUser.role,
                stores: currentStaffUser?.stores ?? [],
              }}
              draft={draft}
            />
          </div>
        </header>

        <nav
          aria-label="Быстрый отбор задач"
          className="mt-6 flex flex-wrap gap-2"
        >
          {chipViews.map((key) => {
            const isActive = activeView === key;

            return (
              <Link
                key={key}
                href={taskListHref(
                  filters,
                  {
                    view: key === "all" ? null : key,
                    status: null,
                    shiftId: null,
                    observerUserId: null,
                  },
                  layout,
                )}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition ${
                  isActive
                    ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                    : "border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
                }`}
              >
                {chipLabels[key]}
                <span
                  className={`tabular-nums ${
                    isActive ? "text-zinc-950/70" : "text-zinc-500"
                  } ${key === "overdue" && !isActive && (quickViewCount.get(key) ?? 0) > 0 ? "font-bold text-red-600 dark:text-red-300" : ""}`}
                >
                  {formatNumber(quickViewCount.get(key) ?? 0)}
                </span>
              </Link>
            );
          })}
        </nav>

        <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form
            className={`grid gap-3 sm:grid-cols-2 ${
              layout === "list"
                ? "lg:grid-cols-[1fr_1fr_1fr_1fr_1.2fr_auto]"
                : "lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto]"
            }`}
          >
            {layout === "list" ? (
              <input type="hidden" name="layout" value="list" />
            ) : null}
            {report.filters.observerUserId && activeView !== "watched" ? (
              <input
                type="hidden"
                name="observerUserId"
                value={report.filters.observerUserId}
              />
            ) : null}
            {layout === "board" && statusFilter !== "all" ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500">Вид</span>
              <select
                name="view"
                defaultValue={activeView}
                className={filterControlClass}
              >
                <option value={isChipView ? activeView : "all"}>
                  {isChipView && activeView !== "all"
                    ? `Обычный · ${chipLabels[activeView]}`
                    : "Обычный"}
                </option>
                {extraViews.map((view) => (
                  <option key={view.key} value={view.key}>
                    {view.label}
                    {quickViewCount.has(view.key)
                      ? ` · ${formatNumber(quickViewCount.get(view.key) ?? 0)}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            {layout === "list" ? (
              <label className="space-y-1">
                <span className="text-xs font-semibold text-zinc-500">
                  Статус
                </span>
                <select
                  name="status"
                  defaultValue={statusFilter}
                  className={filterControlClass}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500">Клуб</span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className={filterControlClass}
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
              <span className="text-xs font-semibold text-zinc-500">
                Ответственный
              </span>
              <select
                name="assignedToUserId"
                defaultValue={report.filters.assignedToUserId ?? ""}
                className={filterControlClass}
              >
                <option value="">Все</option>
                {report.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName ?? user.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500">Поиск</span>
              <input
                name="search"
                type="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Название или комментарий"
                className={filterControlClass}
              />
            </label>

            <div className="flex items-end">
              <button className="h-10 w-full cursor-pointer rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                Показать
              </button>
            </div>
          </form>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Как показать задачи"
            className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
          >
            <Link
              href={taskListHref(filters, {}, "board")}
              aria-current={layout === "board" ? "page" : undefined}
              className={layoutLinkClass(layout === "board")}
            >
              Доска
            </Link>
            <Link
              href={taskListHref(filters, {}, "list")}
              aria-current={layout === "list" ? "page" : undefined}
              className={layoutLinkClass(layout === "list")}
            >
              Список
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {layout === "board" && statusFilter !== "all" ? (
              <Link
                href={taskListHref(filters, { status: null }, layout)}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Только «{statusLabels[statusFilter]}» · показать все
              </Link>
            ) : null}
            <span className="text-zinc-500">
              Скачать:{" "}
              <a
                href={exportHref("csv", filters)}
                className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
              >
                CSV
              </a>
              {" · "}
              <a
                href={exportHref("xlsx", filters)}
                className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
              >
                XLSX
              </a>
            </span>
          </div>
        </div>

        {activeGroupRows.length > 0 ? (
          <StaffTaskGroupSummary
            filters={filters}
            groups={activeGroupRows}
            layout={layout}
            title={groupViewLabels[activeView] ?? "Сводка"}
            description={
              groupViewDescriptions[activeView] ??
              "Сводка по выбранным задачам."
            }
          />
        ) : null}

        {layout === "board" ? (
          <section className="mt-4">
            <StaffTaskBoard
              key={report.filters.taskId ?? "board"}
              tasks={report.rows}
              users={report.users}
              currentUser={currentUser}
              focusTaskId={report.filters.taskId}
            />
          </section>
        ) : (
          <section className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Задач нет. Нажмите «+ Задача» или снимите часть фильтров.
              </div>
            ) : (
              report.rows.map((task) => (
                <StaffTaskListItem
                  key={task.id}
                  task={task}
                  users={report.users}
                  currentUser={currentUser}
                  isFocused={report.filters.taskId === task.id}
                />
              ))
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function StaffTaskListItem({
  task,
  users,
  currentUser,
  isFocused,
}: {
  task: StaffTask;
  users: StaffTaskUser[];
  currentUser: Parameters<typeof StaffTaskHistory>[0]["currentUser"];
  isFocused: boolean;
}) {
  return (
    <article
      id={`task-${task.id}`}
      className={[
        "scroll-mt-24 rounded-lg border bg-white p-4 shadow-sm dark:bg-zinc-950",
        isFocused
          ? "border-emerald-500 ring-2 ring-emerald-500/25 dark:border-emerald-400"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusBadgeClass(task)}>
              {task.isOverdue ? "Просрочено" : staffTaskStatusLabels[task.status]}
            </span>
            <span
              className={`text-xs font-semibold ${priorityClass(task.priority)}`}
            >
              {staffTaskPriorityLabels[task.priority]}
            </span>
            <span className="text-xs text-zinc-500">
              {staffTaskTypeLabels[task.type]}
            </span>
            {isKnowledgeBaseApprovalTask(task) ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                Возврат из базы знаний
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 text-lg font-semibold [overflow-wrap:anywhere]">
            {task.title}
          </h2>
          {task.description ? (
            <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-6 text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
              {task.description}
            </p>
          ) : null}

          <dl className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold text-zinc-500">Срок</dt>
              <dd>
                <LocalDateTime value={task.dueAt} empty="без срока" />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-zinc-500">Клуб</dt>
              <dd>{task.store?.name ?? "Вся сеть"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-zinc-500">Кто</dt>
              <dd>{staffTaskAssigneeLabel(task, users) ?? "Не назначен"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-zinc-500">
                Наблюдатели
              </dt>
              <dd>{staffTaskObserverLabels(task) || "Нет"}</dd>
            </div>
          </dl>
        </div>

        <StaffTaskStatusActions
          taskId={task.id}
          status={task.status}
          assignedToUser={task.assignedToUser}
          candidateUserIds={staffTaskCandidateUserIds(task.labels)}
          currentUser={currentUser}
        />
      </div>
      <StaffTaskHistory task={task} currentUser={currentUser} />
    </article>
  );
}
