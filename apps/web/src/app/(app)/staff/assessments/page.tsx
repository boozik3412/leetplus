import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffAssessmentsWorkspace } from "@/components/staff-assessments-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffAssessmentsReport,
  type StaffAssessmentKind,
  type StaffAssessmentsFilters,
  type StaffAssessmentRoleScope,
  type StaffAssessmentStatus,
} from "@/lib/staff-assessments";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffAssessmentStatus | "all", string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  ACTIVE: "Активные",
  ARCHIVED: "Архив",
};

const kindLabels: Record<StaffAssessmentKind | "all", string> = {
  all: "Все типы",
  TEST: "Тесты",
  ATTESTATION: "Аттестации",
};

const roleScopeLabels: Record<StaffAssessmentRoleScope | "all", string> = {
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
): value is StaffAssessmentStatus | "all" {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "ACTIVE" ||
    value === "ARCHIVED"
  );
}

function isKind(value: string | undefined): value is StaffAssessmentKind | "all" {
  return value === "all" || value === "TEST" || value === "ATTESTATION";
}

function isRoleScope(
  value: string | undefined,
): value is StaffAssessmentRoleScope | "all" {
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

function resolveFilters(params: Awaited<SearchParams>): StaffAssessmentsFilters {
  const status = searchParam(params.status);
  const roleScope = searchParam(params.roleScope);
  const assessmentKind = searchParam(params.assessmentKind);

  return {
    status: isStatus(status) ? status : "all",
    roleScope: isRoleScope(roleScope) ? roleScope : "all",
    assessmentKind: isKind(assessmentKind) ? assessmentKind : "all",
    storeId: searchParam(params.storeId),
    resultUserId: searchParam(params.resultUserId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffAssessmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffAssessmentsReport(filters);

  const summaryCards = [
    { label: "Проверок", value: report.summary.total },
    { label: "Активные", value: report.summary.active },
    { label: "Попытки", value: report.summary.resultAttempts },
    { label: "Проходной %", value: report.summary.passRate },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Аттестации"
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
              Тесты и аттестации
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Создавайте проверки знаний для администраторов, старших смен и
              управляющих: вопросы, порог прохождения, лимит попыток, срок
              действия результата и история пересдач.
            </p>
          </div>
          <Link
            href="/staff/training-courses"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Курсы обучения
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
                {card.label === "Проходной %" ? "%" : ""}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            {report.canManageAssessments ? (
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
                Тип
              </span>
              <select
                name="assessmentKind"
                defaultValue={report.filters.assessmentKind}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

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
          <StaffAssessmentsWorkspace report={report} />
        </section>
      </div>
    </main>
  );
}
