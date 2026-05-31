import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getStaffAdministratorRatings,
  type StaffAdministratorRating,
  type StaffDisciplineFilters,
  type StaffDisciplineRiskLevel,
} from "@/lib/staff-discipline";
import { getRoleLabel } from "@/lib/roles";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const riskLabels: Record<StaffDisciplineRiskLevel, string> = {
  LOW: "Норма",
  MEDIUM: "Внимание",
  HIGH: "Риск",
};

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

function riskClass(level: StaffDisciplineRiskLevel) {
  if (level === "HIGH") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200";
  }

  if (level === "MEDIUM") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-200";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-500/10 dark:text-emerald-200";
}

function scoreBarClass(level: StaffDisciplineRiskLevel) {
  if (level === "HIGH") {
    return "bg-red-500";
  }

  if (level === "MEDIUM") {
    return "bg-amber-400";
  }

  return "bg-emerald-500";
}

export default async function StaffAdministratorRatingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const report = await getStaffAdministratorRatings(resolveFilters(params));
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

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Рейтинг администраторов
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Общий рейтинг собирает соблюдение регламентов, выполнение
              чеклистов, результаты аттестации, предупреждения и штрафы в одну
              управленческую картину по администраторам.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/discipline"
              className="inline-flex h-10 items-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Предупреждения и штрафы
            </Link>
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

        <section className="mt-6 space-y-3">
          {report.rows.length > 0 ? (
            report.rows.map((row) => <RatingRow key={row.id} row={row} />)
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
              Администраторы по выбранным фильтрам не найдены.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function RatingRow({ row }: { row: StaffAdministratorRating }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {row.user.fullName ?? row.user.email}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {getRoleLabel(row.user.role)} ·{" "}
            {row.user.stores.length > 0
              ? row.user.stores.map((store) => store.name).join(", ")
              : "вся сеть"}
          </p>
        </div>
        <span
          className={[
            "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase",
            riskClass(row.riskLevel),
          ].join(" ")}
        >
          {riskLabels[row.riskLevel]}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Итоговый рейтинг</span>
          <span>{row.score}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
          <div
            className={["h-full rounded-full", scoreBarClass(row.riskLevel)].join(
              " ",
            )}
            style={{ width: `${row.score}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CriterionCard
          title="Регламенты"
          score={row.regulations.score}
          detail={`${row.regulations.acknowledged}/${row.regulations.required} ознакомлений`}
        />
        <CriterionCard
          title="Чеклисты"
          score={row.checklists.score}
          detail={`${row.checklists.accepted}/${row.checklists.total} принято, провалов: ${row.checklists.failedItems}`}
        />
        <CriterionCard
          title="Аттестация"
          score={row.attestation.score ?? 100}
          detail={
            row.attestation.score === null
              ? "нет результата"
              : row.attestation.passed
                ? "сдана"
                : "не сдана"
          }
        />
        <CriterionCard
          title="Предупреждения и штрафы"
          score={row.discipline.score}
          detail={`${row.discipline.warnings} пред., ${row.discipline.fines} штрафов, ${formatMoney(row.discipline.fineAmount)}`}
        />
      </div>

      {row.discipline.byCategory.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {row.discipline.byCategory.map((category) => (
            <span
              key={category.category}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {category.category}: {category.warnings} пред., {category.fines}{" "}
              штрафов
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CriterionCard({
  title,
  score,
  detail,
}: {
  title: string;
  score: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-sm font-bold">{score}%</span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
