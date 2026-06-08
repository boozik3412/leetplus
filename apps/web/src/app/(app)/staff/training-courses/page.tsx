import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTrainingCoursesWorkspace } from "@/components/staff-training-courses-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffTrainingCoursesReport,
  type StaffTrainingCourseStatus,
  type StaffTrainingCoursesFilters,
  type StaffTrainingRoleScope,
} from "@/lib/staff-training-courses";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffTrainingCourseStatus | "all", string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  ACTIVE: "Активные",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffTrainingRoleScope | "all", string> = {
  all: "Все роли",
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isStatus(
  value: string | undefined,
): value is StaffTrainingCourseStatus | "all" {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "ACTIVE" ||
    value === "ARCHIVED"
  );
}

function isRoleScope(
  value: string | undefined,
): value is StaffTrainingRoleScope | "all" {
  return (
    value === "all" ||
    value === "ALL_STAFF" ||
    value === "ADMINISTRATOR" ||
    value === "SENIOR_ADMINISTRATOR" ||
    value === "CLUB_MANAGER" ||
    value === "MANAGER" ||
    value === "STANDARDS_MANAGER"
  );
}

function isRequired(value: string | undefined) {
  return value === "true" || value === "false" || value === "all";
}

function resolveFilters(params: Awaited<SearchParams>): StaffTrainingCoursesFilters {
  const status = searchParam(params.status);
  const roleScope = searchParam(params.roleScope);
  const required = searchParam(params.required);

  return {
    status: isStatus(status) ? status : "all",
    roleScope: isRoleScope(roleScope) ? roleScope : "all",
    required: isRequired(required) ? required : "all",
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffTrainingCoursesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffTrainingCoursesReport(filters);

  const summaryCards = [
    { label: "Курсов", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "Обязательные", value: report.summary.required },
    { label: "Шаги", value: report.summary.stepsCount },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Курсы обучения"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
          ]}
        />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Курсы обучения
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {report.canManageTraining
                ? "Собирайте учебные маршруты для администраторов, старших смены и управляющих: статьи базы знаний, ссылки, задания и текстовые шаги в нужном порядке."
                : "Просматривайте назначенные учебные маршруты: материалы базы знаний, ссылки, задания и текстовые шаги для работы на смене."}
            </p>
          </div>
          <Link
            href="/staff/knowledge-base"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            База знаний
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
            {report.canManageTraining ? (
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
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Роль
              </span>
              <select
                name="roleScope"
                defaultValue={report.filters.roleScope}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(roleScopeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Обязательность
              </span>
              <select
                name="required"
                defaultValue={report.filters.required}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">Все курсы</option>
                <option value="true">Обязательные</option>
                <option value="false">Необязательные</option>
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
          <StaffTrainingCoursesWorkspace report={report} />
        </section>
      </div>
    </main>
  );
}
