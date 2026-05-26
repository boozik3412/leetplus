import Link from "next/link";
import type { ReactNode } from "react";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestCrmTaskReport,
  getGuestCrmUsers,
  type GuestCrmTask,
  type GuestCrmTaskFilters,
  type GuestCrmTaskSortKey,
  type GuestCrmTaskStatus,
  type GuestCrmTaskTargetType,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<GuestCrmTaskStatus | "all", string> = {
  all: "Все статусы",
  OPEN: "Новые",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELED: "Отменены",
};

const taskStatusLabels: Record<GuestCrmTaskStatus, string> = {
  OPEN: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELED: "Отменена",
};

const targetLabels: Record<GuestCrmTaskTargetType, string> = {
  all: "Все цели",
  group: "Группы",
  guest: "Гости Langame",
  lead: "CRM-гости",
};

const sortLabels: Record<GuestCrmTaskSortKey, string> = {
  dueAt: "Дедлайн",
  createdAt: "Дата создания",
  updatedAt: "Дата обновления",
  status: "Статус",
  target: "Цель",
  assignee: "Ответственный",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is GuestCrmTaskStatus | "all" {
  return (
    value === "all" ||
    value === "OPEN" ||
    value === "IN_PROGRESS" ||
    value === "DONE" ||
    value === "CANCELED"
  );
}

function isTargetType(value: string | undefined): value is GuestCrmTaskTargetType {
  return value === "all" || value === "group" || value === "guest" || value === "lead";
}

function isSortKey(value: string | undefined): value is GuestCrmTaskSortKey {
  return (
    value === "dueAt" ||
    value === "createdAt" ||
    value === "updatedAt" ||
    value === "status" ||
    value === "target" ||
    value === "assignee"
  );
}

function resolveFilters(params: Awaited<SearchParams>): GuestCrmTaskFilters {
  const status = searchParam(params.status);
  const targetType = searchParam(params.targetType);
  const sort = searchParam(params.sort);
  const direction = searchParam(params.direction);

  return {
    status: isStatus(status) ? status : "all",
    assignedToUserId: searchParam(params.assignedToUserId),
    targetType: isTargetType(targetType) ? targetType : "all",
    search: searchParam(params.search)?.trim(),
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    sort: isSortKey(sort) ? sort : "dueAt",
    direction: direction === "desc" ? "desc" : "asc",
    pageSize: searchParam(params.pageSize) ?? "200",
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function taskTarget(task: GuestCrmTask) {
  return (
    task.audience?.name ??
    task.lead?.displayName ??
    task.guest?.displayName ??
    "Без цели"
  );
}

function taskTargetType(task: GuestCrmTask) {
  if (task.audience) {
    return "Группа";
  }

  if (task.lead) {
    return "CRM-гость";
  }

  if (task.guest) {
    return "Гость Langame";
  }

  return "Цель";
}

function statusBadgeClass(status: GuestCrmTaskStatus) {
  const base =
    "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase";

  if (status === "DONE") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200`;
  }

  if (status === "IN_PROGRESS") {
    return `${base} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  if (status === "CANCELED") {
    return `${base} bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`;
  }

  return `${base} bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200`;
}

function tasksExportHref(filters: GuestCrmTaskFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return `/api/guests/crm/tasks/export?${params.toString()}`;
}

export default async function GuestCrmTasksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const [report, users] = await Promise.all([
    getGuestCrmTaskReport(filters),
    getGuestCrmUsers(),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Задачи CRM"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests/crm", label: "CRM гостей" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Задачи CRM
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Полный рабочий журнал по задачам: контакты с группами,
              CRM-гостями и гостями Langame, ответственные, дедлайны и статус
              исполнения.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={tasksExportHref(filters)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Скачать CSV
            </Link>
            <Link
              href="/guests/crm"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Назад в CRM
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          <MetricCard title="Активные" value={report.summary.open + report.summary.inProgress} />
          <MetricCard title="Просрочены" value={report.summary.overdue} tone="warn" />
          <MetricCard title="Закрыты" value={report.summary.done} tone="good" />
          <MetricCard title="Без ответственного" value={report.summary.withoutAssignee} />
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-6" method="get">
            <FilterField label="Статус">
              <select
                name="status"
                defaultValue={report.status}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Ответственный">
              <select
                name="assignedToUserId"
                defaultValue={report.assignedToUserId ?? ""}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Цель">
              <select
                name="targetType"
                defaultValue={report.targetType}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(targetLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="С даты">
              <input
                type="date"
                name="dateFrom"
                defaultValue={report.dateFrom ?? ""}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </FilterField>
            <FilterField label="По дату">
              <input
                type="date"
                name="dateTo"
                defaultValue={report.dateTo ?? ""}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </FilterField>
            <FilterField label="Сортировка">
              <select
                name="sort"
                defaultValue={report.sort}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Направление">
              <select
                name="direction"
                defaultValue={report.direction}
                className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="asc">По возрастанию</option>
                <option value="desc">По убыванию</option>
              </select>
            </FilterField>
            <div className="lg:col-span-4">
              <FilterField label="Поиск">
                <input
                  name="search"
                  defaultValue={report.search ?? ""}
                  placeholder="задача, группа, гость, ответственный"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </FilterField>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-11 w-full rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Применить
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">
              Задачи: {formatNumber(report.totalRows)}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Показано {formatNumber(report.rows.length)} из{" "}
              {formatNumber(report.totalRows)}.
            </p>
          </div>
          <div className="hidden min-w-full overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/70">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Задача</th>
                  <th className="px-4 py-3 text-left font-semibold">Цель</th>
                  <th className="px-4 py-3 text-left font-semibold">Статус</th>
                  <th className="px-4 py-3 text-left font-semibold">Ответственный</th>
                  <th className="px-4 py-3 text-left font-semibold">Дедлайн</th>
                  <th className="px-4 py-3 text-left font-semibold">Создана</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {report.rows.map((task) => (
                  <tr key={task.id}>
                    <td className="max-w-sm px-4 py-4 align-top">
                      <p className="font-semibold">{task.title}</p>
                      {task.description ? (
                        <p className="mt-1 line-clamp-4 whitespace-pre-line break-words text-xs leading-5 text-zinc-500">
                          {task.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium">{taskTarget(task)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{taskTargetType(task)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={statusBadgeClass(task.status)}>
                        {taskStatusLabels[task.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {task.assignedToUser?.displayName ?? "не назначен"}
                    </td>
                    <td className="px-4 py-4 align-top">{formatDateTime(task.dueAt)}</td>
                    <td className="px-4 py-4 align-top">{formatDateTime(task.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 lg:hidden">
            {report.rows.map((task) => (
              <article
                key={task.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{task.title}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {taskTargetType(task)}: {taskTarget(task)}
                    </p>
                  </div>
                  <span className={statusBadgeClass(task.status)}>
                    {taskStatusLabels[task.status]}
                  </span>
                </div>
                {task.description ? (
                  <p className="mt-3 whitespace-pre-line break-words text-sm leading-5 text-zinc-500">
                    {task.description}
                  </p>
                ) : null}
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <InfoTerm title="Ответственный" value={task.assignedToUser?.displayName ?? "не назначен"} />
                  <InfoTerm title="Дедлайн" value={formatDateTime(task.dueAt)} />
                  <InfoTerm title="Создана" value={formatDateTime(task.createdAt)} />
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "good" | "warn";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-zinc-950 dark:text-zinc-100";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoTerm({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{title}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
