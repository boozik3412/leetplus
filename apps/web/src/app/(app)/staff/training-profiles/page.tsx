import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffTrainingProfilesWorkspace } from "@/components/staff-training-profiles-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffTrainingProfilesReport,
  type StaffTrainingProfileRole,
  type StaffTrainingProfilesFilters,
  type StaffTrainingProfileStatusFilter,
} from "@/lib/staff-training-profiles";
import { getRoleLabel } from "@/lib/roles";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffTrainingProfileStatusFilter, string> = {
  all: "Все профили",
  overdue: "Есть просрочки",
  in_progress: "В обучении",
  completed: "Завершено",
  missing_attestation: "Нужна аттестация",
};

const roleOptions: Array<StaffTrainingProfileRole | "all"> = [
  "all",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CLUB_MANAGER",
  "STANDARDS_MANAGER",
  "SENIOR_ADMINISTRATOR",
  "CLUB_ADMINISTRATOR",
  "TRAINEE",
];

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isRole(value: string | undefined): value is StaffTrainingProfileRole | "all" {
  return roleOptions.includes(value as StaffTrainingProfileRole | "all");
}

function isStatus(
  value: string | undefined,
): value is StaffTrainingProfileStatusFilter {
  return (
    value === "all" ||
    value === "overdue" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "missing_attestation"
  );
}

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffTrainingProfilesFilters {
  const role = searchParam(params.role);
  const status = searchParam(params.status);

  return {
    role: isRole(role) ? role : "all",
    status: isStatus(status) ? status : "all",
    userId: searchParam(params.userId),
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function exportHref(format: "csv" | "xlsx", filters: StaffTrainingProfilesFilters) {
  const params = new URLSearchParams();

  Object.entries({ ...filters, format }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return `/api/staff/training-profiles/export?${params.toString()}`;
}

export default async function StaffTrainingProfilesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffTrainingProfilesReport(filters);
  const summaryCards = [
    { label: "Сотрудники", value: report.summary.employees },
    { label: "Средний прогресс", value: `${report.summary.averageProgressPercent}%` },
    { label: "Просрочки", value: report.summary.overdueCourses },
    { label: "Аттестации", value: report.summary.pendingAssessments },
    { label: "Сертификаты", value: report.summary.validCertificates },
    { label: "Истекшие", value: report.summary.expiredCertificates },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Профили обучения"
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
              Профили обучения сотрудников
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Контролируйте назначенные курсы, прогресс, просрочки, сертификаты
              и результаты тестов без перехода в отдельные конструкторы.
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
              href="/staff/training-courses"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Курсы
            </Link>
            <Link
              href="/staff/assessments"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Аттестации
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-bold uppercase text-zinc-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {typeof card.value === "number"
                  ? formatNumber(card.value)
                  : card.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
            {report.canManageTraining ? (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Роль
                </span>
                <select
                  name="role"
                  defaultValue={report.filters.role}
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role === "all" ? "Все роли" : getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

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

            {report.canManageTraining ? (
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
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Имя или email"
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
          <StaffTrainingProfilesWorkspace report={report} />
        </section>
      </div>
    </main>
  );
}
