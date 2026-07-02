import Link from "next/link";
import { StaffDisciplineWorkspace } from "@/components/staff-discipline-workspace";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffDisciplineReport,
  type StaffDisciplineFilters,
} from "@/lib/staff-discipline";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(params: Awaited<SearchParams>): StaffDisciplineFilters {
  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    userId: searchParam(params.userId),
    status: searchParam(params.status) as StaffDisciplineFilters["status"],
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatMoney(value: number) {
  return `${formatNumber(Math.round(value))} руб`;
}

function exportHref(format: "csv" | "xlsx", filters: StaffDisciplineFilters) {
  const params = new URLSearchParams();

  Object.entries({ ...filters, format }).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return `/api/staff/discipline/export?${params.toString()}`;
}

export default async function StaffDisciplinePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const report = await getStaffDisciplineReport(filters);
  const isSelfView = report.access.mode === "SELF";
  const pageTitle = isSelfView ? "Мотивация" : "Мотивация персонала";
  const pageDescription = isSelfView
    ? "Здесь отображаются только ваши предупреждения и штрафы за выбранный период. Другие сотрудники в этом режиме недоступны."
    : "Шаблон из файла перенесен в систему: три категории, два предупреждения в категории и штрафная шкала по конкретному нарушению. Включение управляется для всей сети или отдельно по клубам.";
  const cards: Array<{ label: string; value: number | string }> = isSelfView
    ? [
        { label: "Записи", value: report.summary.recordsTotal },
        { label: "Предупреждения", value: report.summary.warnings },
        { label: "Штрафы", value: report.summary.fines },
        { label: "Сумма штрафов", value: formatMoney(report.summary.fineAmount) },
      ]
    : [
        { label: "Предупреждения", value: report.summary.warnings },
        { label: "Штрафы", value: report.summary.fines },
        { label: "Сумма штрафов", value: formatMoney(report.summary.fineAmount) },
        { label: "Активные правила", value: report.summary.activeRules },
      ];

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current={pageTitle}
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
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {pageDescription}
            </p>
          </div>
          {report.access.canExport || report.access.canManage ? (
            <div className="flex flex-wrap gap-2">
              {report.access.canExport ? (
                <>
                  <a
                    href={exportHref("csv", filters)}
                    className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    CSV
                  </a>
                  <a
                    href={exportHref("xlsx", filters)}
                    className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    XLSX
                  </a>
                </>
              ) : null}
              {report.access.canManage ? (
                <>
                  <Link
                    href="/staff/administrator-ratings"
                    className="inline-flex h-10 items-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                  >
                    Рейтинг администраторов
                  </Link>
                  <Link
                    href="/staff/operations-dashboard"
                    className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Операционная дисциплина
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
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

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                С даты
              </span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={report.filters.dateFrom}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                По дату
              </span>
              <input
                type="date"
                name="dateTo"
                defaultValue={report.filters.dateTo}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={report.filters.storeId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={report.filters.status}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="ACTIVE">Активные</option>
                <option value="CANCELED">Отмененные</option>
                <option value="RESET">Сброшенные</option>
                <option value="all">Все</option>
              </select>
            </label>
            <label className="block text-sm lg:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Поиск
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  name="search"
                  defaultValue={report.filters.search ?? ""}
                  placeholder={
                    isSelfView
                      ? "Нарушение или комментарий"
                      : "Администратор, нарушение, комментарий"
                  }
                  className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                  Показать
                </button>
              </div>
            </label>
          </div>
        </form>

        <div className="mt-6">
          <StaffDisciplineWorkspace report={report} />
        </div>
      </div>
    </main>
  );
}
