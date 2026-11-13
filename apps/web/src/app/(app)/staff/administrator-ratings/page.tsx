import Link from "next/link";
import { AdminRatingPanel } from "@/components/admin-rating-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffControlTabs } from "@/components/staff-control-tabs";
import { requirePageAccess } from "@/lib/auth";
import {
  getStaffAdministratorRatings,
  type StaffAdministratorRating,
  type StaffDisciplineFilters,
} from "@/lib/staff-discipline";
import type { AdminRatingView } from "@/lib/staff-admin-rating";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(
  params: Awaited<SearchParams>,
): Pick<StaffDisciplineFilters, "dateFrom" | "dateTo" | "storeId" | "search"> {
  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatMoney(value: number) {
  return `${formatNumber(Math.round(value))} руб`;
}

export default async function StaffAdministratorRatingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageAccess("/staff/administrator-ratings");
  const params = await searchParams;
  const report = await getStaffAdministratorRatings(resolveFilters(params));
  const rowsById = new Map(report.rows.map((row) => [row.id, row]));
  const cards = [
    { label: "Администраторы", value: report.summary.administrators },
    { label: "Средний рейтинг", value: `${report.summary.averageScore}%` },
    { label: "Предупреждения", value: report.summary.warnings },
    { label: "Штрафы", value: report.summary.fines },
    { label: "Сумма штрафов", value: formatMoney(report.summary.fineAmount) },
    { label: "Проблемы аттестации", value: report.summary.attestationProblems },
  ] as const;

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Рейтинг администраторов"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/staff/tasks", label: "Персонал" },
          ]}
        />
        <StaffControlTabs user={user} current="/staff/administrator-ratings" />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Рейтинг администраторов
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Каждый администратор начинает период со 100 баллов. Эскалации
              чек-листов, штрафы, предупреждения и просроченные задачи их
              снимают, средний чек двигает в обе стороны. Регламенты и
              аттестация показаны справочно и на балл не влияют.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/operations-dashboard"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Операционная дисциплина
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
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
            <label className="block text-sm lg:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Поиск
              </span>
              <div className="mt-1 flex gap-2">
                <input
                  name="search"
                  defaultValue={report.filters.search ?? ""}
                  placeholder="Имя или email администратора"
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
          <AdminRatingPanel
            rows={report.rows.map(toAdminRatingView)}
            emptyText="Администраторы по выбранным фильтрам не найдены."
            renderExtra={(view) => {
              const row = rowsById.get(view.id);
              return row ? <ReferenceFacts row={row} /> : null;
            }}
          />
        </div>
      </div>
    </main>
  );
}

function toAdminRatingView(row: StaffAdministratorRating): AdminRatingView {
  return {
    id: row.id,
    user: row.user,
    score: row.score,
    riskLevel: row.riskLevel,
    items: row.rating?.items ?? [],
    counts: row.rating?.counts ?? {
      escalatedChecklists: 0,
      fines: 0,
      warnings: 0,
      overdueTasks: 0,
    },
    averageCheck: row.rating?.averageCheck ?? {
      day: emptyCheck("DAY"),
      night: emptyCheck("NIGHT"),
    },
    linkedToLangame: row.rating?.linkedToLangame ?? false,
    shiftsTotal: row.rating?.shiftsTotal ?? 0,
  };
}

function emptyCheck(shiftKind: "DAY" | "NIGHT") {
  return {
    shiftKind,
    shifts: 0,
    average: null,
    clubAverage: null,
    deltaPercent: null,
    points: 0,
  };
}

/** Context that does not change the score. */
function ReferenceFacts({ row }: { row: StaffAdministratorRating }) {
  const facts = [
    {
      title: "Регламенты",
      detail: `${row.regulations.acknowledged} из ${row.regulations.required} прочитано`,
    },
    {
      title: "Чек-листы",
      detail: `${row.checklists.accepted} из ${row.checklists.total} принято, возвратов ${row.checklists.returned}, проблемных пунктов ${row.checklists.failedItems}`,
    },
    {
      title: "Аттестация",
      detail:
        row.attestation.score === null
          ? "нет результата"
          : `${row.attestation.passed ? "сдана" : "не сдана"}, ${row.attestation.score}%`,
    },
    {
      title: "Сумма штрафов",
      detail: formatMoney(row.discipline.fineAmount),
    },
  ];

  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold uppercase text-zinc-500">
        Справочно, на балл не влияет
      </h3>
      <dl className="mt-1 grid gap-2 text-xs sm:grid-cols-2">
        {facts.map((fact) => (
          <div
            key={fact.title}
            className="rounded-md border border-zinc-200 px-2.5 py-2 dark:border-zinc-800"
          >
            <dt className="font-semibold">{fact.title}</dt>
            <dd className="mt-0.5 text-zinc-500">{fact.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
