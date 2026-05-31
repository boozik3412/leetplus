import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTaskCreateForm } from "@/components/staff-task-create-form";
import { StaffTaskHistory } from "@/components/staff-task-history";
import { StaffTaskStatusActions } from "@/components/staff-task-status-actions";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffTaskReport,
  type StaffTask,
  type StaffTaskFilterStatus,
  type StaffTaskFilters,
  type StaffTaskGroup,
  type StaffTaskPriority,
  type StaffTaskSortKey,
  type StaffTaskStatus,
  type StaffTaskType,
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

const groupViewLabels: Partial<Record<StaffTaskViewMode, string>> = {
  byClub: "Задачи по клубам",
  byEmployee: "Задачи по сотрудникам",
  byShift: "Задачи по сменам",
  byStatus: "Задачи по статусам",
};

const groupViewDescriptions: Partial<Record<StaffTaskViewMode, string>> = {
  byClub: "Где скапливается работа и просрочка по клубам.",
  byEmployee: "Нагрузка, просрочка и проверка по ответственным.",
  byShift: "Сменные задачи и задачи, уже связанные с фактами смен.",
  byStatus: "Рабочая воронка задач от новых до закрытых.",
};

const taskStatusLabels: Record<StaffTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  ON_REVIEW: "На проверке",
  DONE: "Готово",
  CANCELED: "Отменена",
};

const typeLabels: Record<StaffTaskType | "all", string> = {
  all: "Все типы",
  ONE_TIME: "Разовая",
  SHIFT: "На смену",
  RECURRING: "Повторяемая",
  LONG_TERM: "Долгосрочная",
  PERSONAL: "Личная",
  CLUB: "Для клуба",
  ROLE: "Для роли",
};

const priorityLabels: Record<StaffTaskPriority | "all", string> = {
  all: "Все приоритеты",
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
  URGENT: "Срочно",
};

const sortLabels: Record<StaffTaskSortKey, string> = {
  dueAt: "Дедлайн",
  createdAt: "Создано",
  updatedAt: "Обновлено",
  status: "Статус",
  priority: "Приоритет",
};

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
    shiftId: searchParam(params.shiftId),
    assignedToUserId: searchParam(params.assignedToUserId),
    search: searchParam(params.search)?.trim(),
    dueFrom: searchParam(params.dueFrom),
    dueTo: searchParam(params.dueTo),
    sort: isSort(sort) ? sort : "dueAt",
    direction: direction === "desc" ? "desc" : "asc",
    pageSize: searchParam(params.pageSize) ?? "200",
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function exportHref(format: "csv" | "xlsx", filters: StaffTaskFilters) {
  const params = new URLSearchParams();

  Object.entries({ ...filters, format, pageSize: undefined }).forEach(
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
) {
  const params = new URLSearchParams();
  const next: Record<string, string | null | undefined> = {
    ...filters,
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "без срока";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
}: {
  title: string;
  description: string;
  groups: StaffTaskGroup[];
  filters: StaffTaskFilters;
}) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Быстрый разбор
          </p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <Link
          href={taskListHref(filters, {
            view: "all",
            status: "all",
            shiftId: null,
          })}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          Сбросить представление
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.slice(0, 12).map((group) => {
          const activeCount =
            group.open + group.inProgress + group.onReview;
          const href = taskListHref(filters, {
            view: "all",
            status: group.filter.status ?? filters.status ?? "all",
            storeId: group.filter.storeId ?? filters.storeId,
            assignedToUserId:
              group.filter.assignedToUserId ?? filters.assignedToUserId,
            shiftId: group.filter.shiftId ?? filters.shiftId,
          });

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
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffTaskReport(filters);
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

  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Просрочено", value: report.summary.overdue },
    { label: "В работе", value: report.summary.inProgress },
    { label: "На проверке", value: report.summary.onReview },
    { label: "Готово", value: report.summary.done },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Задачи персонала"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests/staff-control", label: "Контроль персонала" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Операционные задачи
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Первый рабочий слой Stage 8: задачи для смен, клубов и
              ответственных сотрудников. Чеклисты, регламенты и обучение будут
              подключаться к этой очереди следующим шагом.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={exportHref("csv", filters)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              CSV
            </a>
            <a
              href={exportHref("xlsx", filters)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              XLSX
            </a>
            <Link
              href="/staff/task-templates"
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Шаблоны задач
            </Link>
            <Link
              href="/guests/staff-control"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Контроль администраторов
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap gap-2">
            {report.quickViews.map((view) => {
              const isActive = report.filters.view === view.key;
              const href = taskListHref(filters, {
                view: view.key,
                status:
                  view.key === "today" || view.key === "overdue"
                    ? "all"
                    : filters.status,
                shiftId: view.key === "byShift" ? null : filters.shiftId,
              });

              return (
                <Link
                  key={view.key}
                  href={href}
                  className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                    isActive
                      ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                      : "border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
                  }`}
                >
                  <span>{view.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? "bg-zinc-950/10 text-zinc-950"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {formatNumber(view.count)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <StaffTaskCreateForm users={report.users} stores={report.stores} />
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
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
                Ответственный
              </span>
              <select
                name="assignedToUserId"
                defaultValue={report.filters.assignedToUserId ?? ""}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
              <span className="text-xs font-bold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Название или комментарий"
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            <div className="flex items-end">
              <button className="h-10 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                Показать
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span>Тип: {typeLabels[report.filters.type]}</span>
            <span>Приоритет: {priorityLabels[report.filters.priority]}</span>
            <span>Сортировка: {sortLabels[report.filters.sort]}</span>
          </div>
        </section>

        {activeGroupRows.length > 0 ? (
          <StaffTaskGroupSummary
            filters={filters}
            groups={activeGroupRows}
            title={groupViewLabels[report.filters.view] ?? "Группировка задач"}
            description={
              groupViewDescriptions[report.filters.view] ??
              "Сводка по текущему представлению задач."
            }
          />
        ) : null}

        <section className="mt-6 space-y-3">
          {report.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Задач по текущим фильтрам нет. Создайте первую задачу выше или
              снимите часть фильтров.
            </div>
          ) : (
            report.rows.map((task) => (
              <article
                key={task.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={statusBadgeClass(task)}>
                        {task.isOverdue
                          ? "Просрочено"
                          : taskStatusLabels[task.status]}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase ${priorityClass(
                          task.priority,
                        )}`}
                      >
                        {priorityLabels[task.priority]}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {typeLabels[task.type]}
                      </span>
                    </div>

                    <h2 className="mt-3 text-lg font-semibold">{task.title}</h2>
                    {task.description ? (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {task.description}
                      </p>
                    ) : null}

                    <dl className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-xs font-bold uppercase text-zinc-500">
                          Срок
                        </dt>
                        <dd>{formatDateTime(task.dueAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase text-zinc-500">
                          Клуб
                        </dt>
                        <dd>{task.store?.name ?? "Вся сеть"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase text-zinc-500">
                          Ответственный
                        </dt>
                        <dd>
                          {task.assignedToUser?.fullName ??
                            task.assignedToUser?.email ??
                            "Не назначен"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase text-zinc-500">
                          Создано
                        </dt>
                        <dd>{formatDateTime(task.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  <StaffTaskStatusActions
                    taskId={task.id}
                    status={task.status}
                  />
                </div>
                <StaffTaskHistory task={task} />
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
