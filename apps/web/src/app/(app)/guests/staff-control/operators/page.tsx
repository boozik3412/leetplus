import Link from "next/link";
import { StaffIdentityMappingForm } from "@/components/staff-identity-mapping-form";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestFilterOptions,
  getStaffOperators,
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

function resolveFilters(params: Awaited<SearchParams>): StaffOperatorFilters {
  const status = searchParam(params.status);
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

function operatorReportHref(report: StaffOperatorReport) {
  const params = new URLSearchParams();

  params.set("dateFrom", report.periodFrom);
  params.set("dateTo", report.periodTo);
  if (report.storeId) {
    params.set("storeId", report.storeId);
  }

  return `/guests/staff-control?${params.toString()}`;
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
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Контроль персонала
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Операторы LAngame
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Полный отчет по `working_shifts.user_id` за период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}: привязка к сотрудникам,
              смены, касса, возвраты и инкассация.
            </p>
          </div>
          <Link
            href={operatorReportHref(report)}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Назад в контроль персонала
          </Link>
        </header>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto] xl:items-end">
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
            <div className="grid min-w-0 gap-1 text-sm md:col-span-2 xl:col-span-6">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Поиск
              </span>
              <input
                name="search"
                defaultValue={filters.search ?? ""}
                placeholder="user_id, сотрудник, клуб"
                className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <button className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400">
              Применить
            </button>
          </form>
        </section>

        <section className="mt-6 min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              Операторы: {formatNumber(report.rows.length)}
            </h2>
          </div>
          {report.rows.length > 0 ? (
            <div className="w-full overflow-x-auto">
              <table className="min-w-[1280px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      Оператор
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Сотрудник
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Клубы</th>
                    <th className="px-4 py-3 text-right font-semibold">Смены</th>
                    <th className="px-4 py-3 text-right font-semibold">Часы</th>
                    <th className="px-4 py-3 text-right font-semibold">Касса</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Возвраты
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Инкассация
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Ср. чек
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Привязка
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {report.rows.map((row) => (
                    <tr
                      key={`${row.externalDomain ?? "source"}-${row.externalUserId}`}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">user_id {row.externalUserId}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {row.externalDomain ?? "источник"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {row.linkedGuest ? (
                          <Link
                            href={`/guests/${row.linkedGuest.id}`}
                            className="font-medium underline underline-offset-4"
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
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {row.storeNames.length > 0
                          ? row.storeNames.join(", ")
                          : "не определены"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(row.shiftsCount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(row.shiftHours, 1)} ч
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRubles(row.shiftPaymentAmount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRubles(row.shiftRefundAmount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRubles(row.shiftIncassAmount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRubles(row.averageShiftMiddleCheck)}
                      </td>
                      <td className="px-4 py-3">
                        <StaffIdentityMappingForm
                          externalDomain={row.externalDomain}
                          externalUserId={row.externalUserId}
                          staffOptions={report.staffOptions}
                          mappingId={row.mappingId}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-500">
              Операторов по выбранным условиям не найдено.
            </p>
          )}
        </section>
      </div>
    </main>
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
