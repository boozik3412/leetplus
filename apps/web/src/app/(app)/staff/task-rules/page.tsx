import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTaskRulesWorkspace } from "@/components/staff-task-rules-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffTaskRuleReport,
  type StaffTaskRuleCadence,
  type StaffTaskRuleFilters,
  type StaffTaskRuleStatus,
} from "@/lib/staff-task-rules";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffTaskRuleStatus | "all", string> = {
  all: "Все статусы",
  ACTIVE: "Активные",
  PAUSED: "На паузе",
  ARCHIVED: "Архив",
};

const cadenceLabels: Record<StaffTaskRuleCadence | "all", string> = {
  all: "Все расписания",
  DAILY: "Каждый день",
  WEEKLY: "Каждую неделю",
  MONTHLY: "Каждый месяц",
  OPENING_SHIFT: "Открытие смены",
  CLOSING_SHIFT: "Закрытие смены",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(value: string | undefined): value is StaffTaskRuleStatus | "all" {
  return (
    value === "all" ||
    value === "ACTIVE" ||
    value === "PAUSED" ||
    value === "ARCHIVED"
  );
}

function isCadence(
  value: string | undefined,
): value is StaffTaskRuleCadence | "all" {
  return (
    value === "all" ||
    value === "DAILY" ||
    value === "WEEKLY" ||
    value === "MONTHLY" ||
    value === "OPENING_SHIFT" ||
    value === "CLOSING_SHIFT"
  );
}

function resolveFilters(params: Awaited<SearchParams>): StaffTaskRuleFilters {
  const status = searchParam(params.status);
  const cadence = searchParam(params.cadence);

  return {
    status: isStatus(status) ? status : "all",
    cadence: isCadence(cadence) ? cadence : "all",
    storeId: searchParam(params.storeId),
    templateId: searchParam(params.templateId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffTaskRulesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffTaskRuleReport(filters);

  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "На паузе", value: report.summary.paused },
    { label: "Создано задач", value: report.summary.tasksCreated },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Регулярные задачи"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Задачи персонала" },
            { href: "/staff/task-templates", label: "Шаблоны задач" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Регулярные задачи
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Настройте правила для повторяющихся поручений: открытие и закрытие
              смены, ежедневные, еженедельные и ежемесячные задачи. На первом
              шаге задача создается вручную из правила, чтобы проверить контур
              перед автоматическим запуском.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/task-templates"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Шаблоны задач
            </Link>
            <Link
              href="/staff/tasks"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              Открыть задачи
            </Link>
          </div>
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
                Расписание
              </span>
              <select
                name="cadence"
                defaultValue={report.filters.cadence}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(cadenceLabels).map(([value, label]) => (
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
          <StaffTaskRulesWorkspace report={report} />
        </section>
      </div>
    </main>
  );
}
