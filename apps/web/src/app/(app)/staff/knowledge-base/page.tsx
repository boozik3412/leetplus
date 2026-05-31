import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffKnowledgeBaseWorkspace } from "@/components/staff-knowledge-base-workspace";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffKnowledgeBaseReport,
  type StaffKnowledgeArticleStatus,
  type StaffKnowledgeBaseFilters,
  type StaffKnowledgeRoleScope,
} from "@/lib/staff-knowledge-base";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabels: Record<StaffKnowledgeArticleStatus | "all", string> = {
  all: "Все статусы",
  DRAFT: "Черновики",
  REVIEW: "На согласовании",
  PUBLISHED: "Опубликованные",
  ARCHIVED: "Архив",
};

const roleScopeLabels: Record<StaffKnowledgeRoleScope | "all", string> = {
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
): value is StaffKnowledgeArticleStatus | "all" {
  return (
    value === "all" ||
    value === "DRAFT" ||
    value === "REVIEW" ||
    value === "PUBLISHED" ||
    value === "ARCHIVED"
  );
}

function isRequiredReading(
  value: string | undefined,
): value is "all" | "required" | "optional" {
  return value === "all" || value === "required" || value === "optional";
}

function isRoleScope(
  value: string | undefined,
): value is StaffKnowledgeRoleScope | "all" {
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

function resolveFilters(params: Awaited<SearchParams>): StaffKnowledgeBaseFilters {
  const status = searchParam(params.status);
  const roleScope = searchParam(params.roleScope);
  const requiredReading = searchParam(params.requiredReading);

  return {
    status: isStatus(status) ? status : "all",
    roleScope: isRoleScope(roleScope) ? roleScope : "all",
    folder: searchParam(params.folder),
    category: searchParam(params.category),
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
    requiredReading: isRequiredReading(requiredReading)
      ? requiredReading
      : "all",
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export default async function StaffKnowledgeBasePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffKnowledgeBaseReport(filters);

  const summaryCards = [
    { label: "Всего", value: report.summary.total },
    { label: "Опубликовано", value: report.summary.published },
    { label: "Черновики", value: report.summary.draft },
    { label: "На согласовании", value: report.summary.review },
    {
      label: "Прочтение",
      value: `${formatNumber(report.summary.readReceipts)}/${formatNumber(
        report.summary.requiredAudience,
      )}`,
    },
  ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="База знаний"
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
              База знаний
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Операционные инструкции, учебные материалы и стандарты работы для
              администраторов, старших смены, управляющих и менеджера по
              стандартам.
            </p>
          </div>
          <Link
            href="/staff/shift-regulations"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Регламенты смены
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
              <p className="mt-2 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
            {report.canManageKnowledge ? (
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
                Папка
              </span>
              <select
                name="folder"
                defaultValue={report.filters.folder ?? ""}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все папки</option>
                {report.folders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Категория
              </span>
              <select
                name="category"
                defaultValue={report.filters.category ?? ""}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все категории</option>
                {report.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Обязательность
              </span>
              <select
                name="requiredReading"
                defaultValue={report.filters.requiredReading}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">Все материалы</option>
                <option value="required">Обязательные</option>
                <option value="optional">Необязательные</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={report.filters.search ?? ""}
                placeholder="Тема, тег или текст"
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
          <StaffKnowledgeBaseWorkspace report={report} />
        </section>
      </div>
    </main>
  );
}
