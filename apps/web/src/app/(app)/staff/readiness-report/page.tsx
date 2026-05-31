import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getRoleLabel } from "@/lib/roles";
import {
  getStaffReadinessReport,
  type StaffReadinessReportFilters,
  type StaffReadinessRow,
  type StaffReadinessStatus,
  type StaffReadinessStatusFilter,
} from "@/lib/staff-readiness-report";
import type { StaffTrainingProfileRole } from "@/lib/staff-training-profiles";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffReadinessStatusFilter, string> = {
  all: "Все сотрудники",
  ready: "Готовы к смене",
  attention: "Требуют внимания",
  blocked: "Нет допуска",
  failed_tests: "Есть несданные тесты",
  expired_attestations: "Истекли аттестации",
  pending_regulations: "Не подтвержден регламент",
};

const readinessLabels: Record<StaffReadinessStatus, string> = {
  READY: "Готов",
  ATTENTION: "Внимание",
  BLOCKED: "Нет допуска",
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
];

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isRole(value: string | undefined): value is StaffTrainingProfileRole | "all" {
  return roleOptions.includes(value as StaffTrainingProfileRole | "all");
}

function isStatus(
  value: string | undefined,
): value is StaffReadinessStatusFilter {
  return Object.prototype.hasOwnProperty.call(statusLabels, value ?? "");
}

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffReadinessReportFilters {
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

function formatDate(value: string | null) {
  if (!value) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default async function StaffReadinessReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffReadinessReport(filters);
  const summaryCards = [
    { label: "Сотрудники", value: report.summary.employees },
    { label: "Готовы", value: report.summary.ready, tone: "ready" },
    { label: "Внимание", value: report.summary.attention, tone: "attention" },
    { label: "Нет допуска", value: report.summary.blocked, tone: "blocked" },
    { label: "Средняя готовность", value: `${report.summary.averageReadinessPercent}%` },
    { label: "Истекли аттестации", value: report.summary.expiredAttestations },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Готовность к сменам"
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
              Готовность сотрудников к сменам
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Управленческий отчет показывает, кто уже может выходить в смену,
              кому нужна пересдача теста или аттестации, и кто не подтвердил
              актуальный регламент.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/training-profiles"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Профили обучения
            </Link>
            <Link
              href="/staff/assessments"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Аттестации
            </Link>
            <Link
              href="/staff/shift-regulations"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Регламенты
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={[
                "rounded-lg border bg-white p-4 dark:bg-zinc-950",
                card.tone === "ready"
                  ? "border-emerald-200 dark:border-emerald-900/70"
                  : card.tone === "blocked"
                    ? "border-rose-200 dark:border-rose-900/70"
                    : card.tone === "attention"
                      ? "border-amber-200 dark:border-amber-900/70"
                      : "border-zinc-200 dark:border-zinc-800",
              ].join(" ")}
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
            {report.canManageReadiness ? (
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
                Статус допуска
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

            {report.canManageReadiness ? (
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

        <section className="mt-6 space-y-3">
          {report.rows.length > 0 ? (
            report.rows.map((row) => (
              <ReadinessCard key={row.user.id} row={row} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              По выбранным фильтрам сотрудников нет.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReadinessCard({ row }: { row: StaffReadinessRow }) {
  const problems = [...row.blockers, ...row.warnings].slice(0, 5);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {row.user.fullName ?? row.user.email}
            </h2>
            <ReadinessPill status={row.readinessStatus} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {getRoleLabel(row.user.role)} · {row.user.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
            {row.user.stores.length > 0 ? (
              row.user.stores.map((store) => (
                <span
                  key={store.id}
                  className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900"
                >
                  {store.name}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
                Вся сеть
              </span>
            )}
          </div>
        </div>

        <div className="w-full rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 lg:w-72">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Готовность</span>
            <span>{row.readinessPercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
            <div
              className={[
                "h-full rounded-full",
                row.readinessStatus === "READY"
                  ? "bg-emerald-500"
                  : row.readinessStatus === "ATTENTION"
                    ? "bg-amber-400"
                    : "bg-rose-500",
              ].join(" ")}
              style={{ width: `${row.readinessPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric
          label="Обязательные курсы"
          value={`${row.completedRequiredCoursesCount}/${row.requiredCoursesCount}`}
          detail={
            row.overdueCoursesCount > 0
              ? `${row.overdueCoursesCount} просрочено`
              : `${row.requiredCourseGapsCount} не завершено`
          }
        />
        <Metric
          label="Тесты и аттестации"
          value={`${row.passedAssessmentsCount}/${row.assessmentsCount}`}
          detail={`${row.failedTestsCount + row.failedAttestationsCount} не сдано, ${row.expiredAttestationsCount} истекло`}
        />
        <Metric
          label="Регламенты"
          value={`${row.acknowledgedRegulationsCount}/${row.assignedRegulationsCount}`}
          detail={`${row.pendingRegulationsCount} ждут подтверждения`}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Что мешает допуску</h3>
          {problems.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {problems.map((issue) => (
                <li
                  key={`${issue.source}-${issue.title}-${issue.detail}`}
                  className="flex flex-col gap-1 rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/70"
                >
                  <span className="font-medium">{issue.title}</span>
                  <span className="text-zinc-500">{issue.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              Блокеров нет: обучение, проверки и регламенты закрыты.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Следующее действие</h3>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {row.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          {row.regulations.length > 0 ? (
            <p className="mt-3 text-xs text-zinc-500">
              Последний регламент: версия {row.regulations[0]?.version ?? 1},
              публикация {formatDate(row.regulations[0]?.publishedAt ?? null)}.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function ReadinessPill({ status }: { status: StaffReadinessStatus }) {
  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-xs font-bold uppercase",
        status === "READY"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200"
          : status === "ATTENTION"
            ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"
            : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
      ].join(" ")}
    >
      {readinessLabels[status]}
    </span>
  );
}
