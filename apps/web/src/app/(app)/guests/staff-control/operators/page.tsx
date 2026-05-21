import Link from "next/link";
import { Fragment } from "react";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { StaffIdentityMappingForm } from "@/components/staff-identity-mapping-form";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestFilterOptions,
  getStaffOperators,
  type StaffControlAnomalyType,
  type StaffOperatorFilters,
  type StaffOperatorReport,
  type StaffOperatorSortKey,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const sortLabels: Record<StaffOperatorSortKey, string> = {
  shifts: "Смены",
  hours: "Часы",
  cash: "Касса",
  refunds: "Возвраты",
  incass: "Инкассация",
  middleCheck: "Средний чек",
};

const anomalyLabels: Record<
  StaffControlAnomalyType,
  { title: string; description: string }
> = {
  refunds: {
    title: "Возвраты по сменам",
    description: "Администраторы, у которых за период есть возвраты.",
  },
  "missing-incassation": {
    title: "Касса без инкассации",
    description: "Касса от 10 000 руб при нулевой инкассации.",
  },
  "long-shift": {
    title: "Длинные смены",
    description: "Средняя длительность смены от 14 ч за выбранный период.",
  },
  "low-middle-check": {
    title: "Низкий средний чек",
    description: "Средний чек ниже 100 руб при кассе от 5 000 руб.",
  },
  "unmapped-operator": {
    title: "user_id без привязки",
    description: "Не привязанные user_id с кассой от 10 000 руб.",
  },
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatNumber(value)} руб`;
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatShiftDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatLastClosedShift(
  startedAt: string | null,
  stoppedAt: string | null,
) {
  if (!startedAt || !stoppedAt) {
    return "Нет закрытых смен";
  }

  return `${formatShiftDateTime(startedAt)} - ${formatShiftDateTime(stoppedAt)}`;
}

function formatShiftId(value: string | null) {
  return value ? `ID смены: ${value}` : "ID смены не определен";
}

function resolveFilters(params: Awaited<SearchParams>): StaffOperatorFilters {
  const status = searchParam(params.status);
  const anomaly = searchParam(params.anomaly);
  const sort = searchParam(params.sort);
  const direction = searchParam(params.direction);

  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    search: searchParam(params.search)?.trim(),
    status:
      status === "linked" || status === "unlinked" || status === "all"
        ? status
        : "all",
    anomaly: isAnomalyType(anomaly) ? anomaly : undefined,
    sort: isSortKey(sort) ? sort : "cash",
    direction: direction === "asc" ? "asc" : "desc",
  };
}

function isSortKey(value: string | undefined): value is StaffOperatorSortKey {
  return (
    value === "shifts" ||
    value === "hours" ||
    value === "cash" ||
    value === "refunds" ||
    value === "incass" ||
    value === "middleCheck"
  );
}

function isAnomalyType(
  value: string | undefined,
): value is StaffControlAnomalyType {
  return (
    value === "refunds" ||
    value === "missing-incassation" ||
    value === "long-shift" ||
    value === "low-middle-check" ||
    value === "unmapped-operator"
  );
}

function operatorReportHref(report: StaffOperatorReport) {
  const params = new URLSearchParams();

  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }

  return `/guests/staff-control?${params.toString()}`;
}

function currentOperatorReportHref(report: StaffOperatorReport) {
  const params = new URLSearchParams();

  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }
  params.set("status", report.status);
  if (report.anomaly) {
    params.set("anomaly", report.anomaly);
  }
  params.set("sort", report.sort);
  params.set("direction", report.direction);
  if (report.search) {
    params.set("search", report.search);
  }

  return `/guests/staff-control/operators?${params.toString()}`;
}

export default async function StaffOperatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const [report, options] = await Promise.all([
    getStaffOperators(filters),
    getGuestFilterOptions(),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[100rem]">
        <ReportBreadcrumbs
          current="Администраторы"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests/staff-control", label: "Контроль персонала" },
          ]}
        />
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Сравнение администраторов
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Инфографика по администраторам и связанным user_id Langame за период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}: смены, часы, касса,
              возвраты, инкассация и средний чек для сравнения между собой.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:shrink-0 xl:flex xl:justify-end">
            <Link
              href={currentOperatorReportHref(report)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-center text-sm font-semibold leading-5 text-zinc-950 transition hover:bg-emerald-400 xl:w-auto xl:whitespace-nowrap"
            >
              Открыть в новом окне
            </Link>
            <Link
              href={operatorReportHref(report)}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-semibold leading-5 text-zinc-700 transition hover:bg-zinc-50 xl:w-auto xl:whitespace-nowrap dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Назад в контроль персонала
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(7,minmax(0,1fr))_auto] xl:items-end">
            <FilterInput
              label="С даты"
              name="dateFrom"
              type="date"
              defaultValue={filters.dateFrom ?? report.periodFrom}
            />
            <FilterInput
              label="По дату"
              name="dateTo"
              type="date"
              defaultValue={filters.dateTo ?? report.periodTo}
            />
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={filters.storeId ?? ""}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {options.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={report.status}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="all">Все</option>
                <option value="unlinked">Без привязки</option>
                <option value="linked">Привязанные</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Сигнал
              </span>
              <select
                name="anomaly"
                defaultValue={report.anomaly ?? ""}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все сигналы</option>
                {Object.entries(anomalyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Сортировка
              </span>
              <select
                name="sort"
                defaultValue={report.sort}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Направление
              </span>
              <select
                name="direction"
                defaultValue={report.direction}
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </label>
            <div className="grid min-w-0 gap-1 text-sm md:col-span-2 xl:col-span-7">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={filters.search ?? ""}
                placeholder="администратор, user_id, клуб"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <button className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400">
              Применить
            </button>
          </form>
          {report.anomaly ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
              <p className="font-semibold">
                Фильтр сигнала: {anomalyLabels[report.anomaly].title}
              </p>
              <p className="mt-1 text-amber-900 dark:text-amber-100/80">
                {anomalyLabels[report.anomaly].description}
              </p>
            </div>
          ) : null}
        </section>

        <AdminComparisonPanel report={report} />

        <section className="mt-6 min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              Администраторы: {formatNumber(report.rows.length)}
            </h2>
          </div>
          {report.rows.length > 0 ? (
            <>
            <div className="grid gap-3 p-4 xl:hidden">
              {report.rows.map((row) => (
                <OperatorCard
                  key={`${row.externalDomain ?? "source"}-${row.externalUserId}`}
                  row={row}
                  staffOptions={report.staffOptions}
                />
              ))}
            </div>
            <div className="hidden w-full overflow-x-auto xl:block">
              <table className="w-full table-fixed divide-y divide-zinc-100 text-[13px] dark:divide-zinc-800">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[17%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">
                      Администратор
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      Сотрудник
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">Клубы</th>
                    <th className="px-3 py-3 text-left font-semibold">
                      Последняя смена
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">Смены</th>
                    <th className="px-3 py-3 text-right font-semibold">Часы</th>
                    <th className="px-3 py-3 text-right font-semibold">Касса</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Возвраты
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Инкассация
                    </th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Ср. чек
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {report.rows.map((row) => (
                    <Fragment
                      key={`${row.externalDomain ?? "source"}-${row.externalUserId}`}
                    >
                      <tr className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50">
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium">user_id {row.externalUserId}</p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {row.externalDomain ?? "источник"}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {row.linkedGuest ? (
                            <Link
                              href={`/guests/${row.linkedGuest.id}`}
                              className="block truncate font-medium underline underline-offset-4"
                            >
                              {row.linkedGuest.displayName}
                            </Link>
                          ) : (
                            <span className="text-zinc-500">не привязан</span>
                          )}
                          {row.mappingNote ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              {row.mappingNote}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-300">
                          {row.storeNames.length > 0
                            ? row.storeNames.join(", ")
                            : "не определены"}
                        </td>
                        <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-300">
                          <p>
                            {formatLastClosedShift(
                              row.lastClosedShiftStartedAt,
                              row.lastClosedShiftStoppedAt,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {formatShiftId(row.lastClosedShiftExternalShiftId)}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatNumber(row.shiftsCount)}
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatNumber(row.shiftHours, 1)} ч
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatRubles(row.shiftPaymentAmount)}
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatRubles(row.shiftRefundAmount)}
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatRubles(row.shiftIncassAmount)}
                        </td>
                        <td className="px-3 py-3 text-right align-top tabular-nums">
                          {formatRubles(row.averageShiftMiddleCheck)}
                        </td>
                      </tr>
                      <tr className="bg-zinc-50/50 dark:bg-zinc-900/20">
                        <td colSpan={10} className="px-3 pb-4">
                          <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                            <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">
                              Привязка сотрудника
                            </p>
                            <StaffIdentityMappingForm
                              externalDomain={row.externalDomain}
                              externalUserId={row.externalUserId}
                              staffOptions={report.staffOptions}
                              mappingId={row.mappingId}
                              variant="inline"
                            />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Администраторов по выбранным условиям не найдено.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function AdminComparisonPanel({ report }: { report: StaffOperatorReport }) {
  const rows = report.rows;
  const linkedCount = rows.filter((row) => row.linkedGuest).length;
  const totalCash = rows.reduce((sum, row) => sum + row.shiftPaymentAmount, 0);
  const totalRefunds = rows.reduce((sum, row) => sum + row.shiftRefundAmount, 0);
  const totalIncass = rows.reduce((sum, row) => sum + row.shiftIncassAmount, 0);
  const totalShifts = rows.reduce((sum, row) => sum + row.shiftsCount, 0);
  const totalHours = rows.reduce((sum, row) => sum + row.shiftHours, 0);
  const avgChecks = rows
    .map((row) => row.averageShiftMiddleCheck)
    .filter((value) => value > 0);
  const averageCheck =
    avgChecks.length > 0
      ? avgChecks.reduce((sum, value) => sum + value, 0) / avgChecks.length
      : 0;
  const maxCash = Math.max(1, ...rows.map((row) => row.shiftPaymentAmount));
  const maxShifts = Math.max(1, ...rows.map((row) => row.shiftsCount));
  const maxHours = Math.max(1, ...rows.map((row) => row.shiftHours));
  const maxRefunds = Math.max(1, ...rows.map((row) => row.shiftRefundAmount));
  const maxIncass = Math.max(1, ...rows.map((row) => row.shiftIncassAmount));
  const maxMiddleCheck = Math.max(
    1,
    ...rows.map((row) => row.averageShiftMiddleCheck),
  );
  const topCash = [...rows]
    .sort((first, second) => second.shiftPaymentAmount - first.shiftPaymentAmount)
    .slice(0, 5);
  const riskyRows = [...rows]
    .sort(
      (first, second) =>
        second.shiftRefundAmount - first.shiftRefundAmount ||
        first.averageShiftMiddleCheck - second.averageShiftMiddleCheck,
    )
    .slice(0, 5);

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
          Инфографика
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          Сравнение администраторов между собой
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
          Полосы показывают долю администратора относительно максимального
          значения в текущей выборке. Так проще увидеть, кто дает основную
          кассу, у кого больше смен, где заметны возвраты или низкий средний
          чек.
        </p>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        <InfographicMetric label="Администраторы" value={formatNumber(rows.length)} caption={`${formatNumber(linkedCount)} привязаны`} />
        <InfographicMetric label="Касса" value={formatRubles(totalCash)} caption={`${formatNumber(totalShifts)} смен`} />
        <InfographicMetric label="Часы" value={`${formatNumber(totalHours, 1)} ч`} caption="по закрытым сменам" />
        <InfographicMetric label="Средний чек" value={formatRubles(averageCheck)} caption="среднее по администраторам" />
        <InfographicMetric label="Возвраты" value={formatRubles(totalRefunds)} caption={`инкассация ${formatRubles(totalIncass)}`} />
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-4 border-t border-zinc-200 p-4 dark:border-zinc-800 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
          <div className="min-w-0 space-y-3">
            {rows.map((row, index) => (
              <AdminComparisonRow
                key={`${row.externalDomain ?? "source"}-${row.externalUserId}`}
                row={row}
                rank={index + 1}
                maxCash={maxCash}
                maxShifts={maxShifts}
                maxHours={maxHours}
                maxRefunds={maxRefunds}
                maxIncass={maxIncass}
                maxMiddleCheck={maxMiddleCheck}
              />
            ))}
          </div>
          <aside className="space-y-4">
            <MiniRanking
              title="Лидеры по кассе"
              rows={topCash}
              value={(row) => formatRubles(row.shiftPaymentAmount)}
            />
            <MiniRanking
              title="Требуют внимания"
              rows={riskyRows}
              value={(row) =>
                `${formatRubles(row.shiftRefundAmount)} возвратов, ср. чек ${formatRubles(row.averageShiftMiddleCheck)}`
              }
            />
          </aside>
        </div>
      ) : (
        <p className="border-t border-zinc-200 px-5 py-6 text-sm text-zinc-500 dark:border-zinc-800">
          Для инфографики нет строк по выбранным условиям.
        </p>
      )}
    </section>
  );
}

function InfographicMetric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{caption}</p>
    </div>
  );
}

function AdminComparisonRow({
  row,
  rank,
  maxCash,
  maxShifts,
  maxHours,
  maxRefunds,
  maxIncass,
  maxMiddleCheck,
}: {
  row: StaffOperatorReport["rows"][number];
  rank: number;
  maxCash: number;
  maxShifts: number;
  maxHours: number;
  maxRefunds: number;
  maxIncass: number;
  maxMiddleCheck: number;
}) {
  const name = row.linkedGuest?.displayName ?? `user_id ${row.externalUserId}`;
  const subtitle = row.linkedGuest
    ? `${row.externalDomain ?? "источник"} · привязан`
    : `${row.externalDomain ?? "источник"} · без привязки`;

  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            #{rank}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold">{name}</h3>
          <p className="mt-1 truncate text-sm text-zinc-500">{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right text-sm tabular-nums sm:grid-cols-4">
          <ComparisonPill label="Касса" value={formatRubles(row.shiftPaymentAmount)} />
          <ComparisonPill label="Смены" value={formatNumber(row.shiftsCount)} />
          <ComparisonPill label="Часы" value={`${formatNumber(row.shiftHours, 1)} ч`} />
          <ComparisonPill label="Ср. чек" value={formatRubles(row.averageShiftMiddleCheck)} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ComparisonBar label="Касса" value={row.shiftPaymentAmount} max={maxCash} tone="emerald" />
        <ComparisonBar label="Смены" value={row.shiftsCount} max={maxShifts} tone="sky" />
        <ComparisonBar label="Часы" value={row.shiftHours} max={maxHours} tone="violet" />
        <ComparisonBar label="Инкассация" value={row.shiftIncassAmount} max={maxIncass} tone="zinc" />
        <ComparisonBar label="Возвраты" value={row.shiftRefundAmount} max={maxRefunds} tone="red" />
        <ComparisonBar label="Средний чек" value={row.averageShiftMiddleCheck} max={maxMiddleCheck} tone="amber" />
      </div>
    </article>
  );
}

function ComparisonPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[11px] uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "emerald" | "sky" | "violet" | "amber" | "red" | "zinc";
}) {
  const width = Math.max(3, Math.min(100, (value / max) * 100));
  const colors = {
    emerald: "bg-emerald-400",
    sky: "bg-sky-400",
    violet: "bg-violet-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
    zinc: "bg-zinc-400",
  };

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-semibold tabular-nums">
          {label === "Смены"
            ? formatNumber(value)
            : label === "Часы"
              ? `${formatNumber(value, 1)} ч`
              : formatRubles(value)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MiniRanking({
  title,
  rows,
  value,
}: {
  title: string;
  rows: StaffOperatorReport["rows"];
  value: (row: StaffOperatorReport["rows"][number]) => string;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div
            key={`${title}-${row.externalDomain ?? "source"}-${row.externalUserId}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {index + 1}. {row.linkedGuest?.displayName ?? `user_id ${row.externalUserId}`}
              </p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {row.storeNames.join(", ") || row.externalDomain || "источник"}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs font-semibold tabular-nums">
              {value(row)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OperatorCard({
  row,
  staffOptions,
}: {
  row: StaffOperatorReport["rows"][number];
  staffOptions: StaffOperatorReport["staffOptions"];
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            user_id {row.externalUserId}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {row.externalDomain ?? "источник"}
          </p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            row.linkedGuest
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
          ].join(" ")}
        >
          {row.linkedGuest ? "Привязан" : "Без привязки"}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-medium uppercase text-zinc-500">
          Сотрудник
        </p>
        {row.linkedGuest ? (
          <Link
            href={`/guests/${row.linkedGuest.id}`}
            className="mt-1 block truncate font-semibold underline underline-offset-4"
          >
            {row.linkedGuest.displayName}
          </Link>
        ) : (
          <p className="mt-1 text-zinc-500">не привязан</p>
        )}
        {row.mappingNote ? (
          <p className="mt-1 text-xs text-zinc-500">{row.mappingNote}</p>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-medium uppercase text-zinc-500">
          Последняя закрытая смена
        </p>
        <p className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">
          {formatLastClosedShift(
            row.lastClosedShiftStartedAt,
            row.lastClosedShiftStoppedAt,
          )}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {formatShiftId(row.lastClosedShiftExternalShiftId)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <OperatorMetric label="Смены" value={formatNumber(row.shiftsCount)} />
        <OperatorMetric label="Часы" value={`${formatNumber(row.shiftHours, 1)} ч`} />
        <OperatorMetric label="Касса" value={formatRubles(row.shiftPaymentAmount)} />
        <OperatorMetric label="Возвраты" value={formatRubles(row.shiftRefundAmount)} />
        <OperatorMetric label="Инкассация" value={formatRubles(row.shiftIncassAmount)} />
        <OperatorMetric label="Ср. чек" value={formatRubles(row.averageShiftMiddleCheck)} />
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium uppercase text-zinc-500">Клубы</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {row.storeNames.length > 0 ? row.storeNames.join(", ") : "не определены"}
        </p>
      </div>

      <div className="mt-4">
        <StaffIdentityMappingForm
          externalDomain={row.externalDomain}
          externalUserId={row.externalUserId}
          staffOptions={staffOptions}
          mappingId={row.mappingId}
        />
      </div>
    </article>
  );
}

function OperatorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="truncate text-xs text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function FilterInput({
  label,
  name,
  type,
  defaultValue,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-xs font-medium uppercase text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
