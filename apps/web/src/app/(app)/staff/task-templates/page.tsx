import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTaskTemplateBuilder } from "@/components/staff-task-template-builder";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffTaskTemplateReport,
  type StaffTaskTemplateFilters,
  type StaffTaskTemplateStatus,
} from "@/lib/staff-task-templates";
import type { StaffTaskPriority, StaffTaskType } from "@/lib/staff-tasks";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffTaskTemplateStatus | "all", string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  ACTIVE: "Активные",
  ARCHIVED: "Архив",
};

const typeLabels: Record<StaffTaskType | "all", string> = {
  all: "Все типы",
  ONE_TIME: "Разовые",
  SHIFT: "На смену",
  RECURRING: "Повторяемые",
  LONG_TERM: "Долгосрочные",
  PERSONAL: "Личные",
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

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffTaskTemplateStatus | "all" {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "ACTIVE" ||
    value === "ARCHIVED"
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

function resolveFilters(params: Awaited<SearchParams>): StaffTaskTemplateFilters {
  const status = searchParam(params.status);
  const type = searchParam(params.type);
  const priority = searchParam(params.priority);

  return {
    status: isStatus(status) ? status : "all",
    type: isType(type) ? type : "all",
    priority: isPriority(priority) ? priority : "all",
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffTaskTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffTaskTemplateReport(filters);

  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "Черновики", value: report.summary.draft },
    { label: "Создано задач", value: report.summary.tasksCreated },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Шаблоны задач"
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
              Шаблоны задач
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Собирайте типовые поручения для смен, клубов и ответственных
              ролей, а затем запускайте конкретную задачу без повторного ввода.
            </p>
          </div>
          <Link
            href="/staff/tasks"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Открыть задачи
          </Link>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                Тип
              </span>
              <select
                name="type"
                defaultValue={report.filters.type}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Приоритет
              </span>
              <select
                name="priority"
                defaultValue={report.filters.priority}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
          <StaffTaskTemplateBuilder report={report} />
        </section>
      </div>
    </main>
  );
}
