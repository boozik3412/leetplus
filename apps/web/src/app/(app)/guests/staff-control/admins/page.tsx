import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestFilterOptions,
  getStaffControl,
  type GuestsSummaryFilters,
  type StaffControlReport,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type StaffSortKey = "sessions" | "hours" | "shifts" | "shiftCash" | "revenue";
type StaffSortDirection = "asc" | "desc";

const staffSortLabels: Record<StaffSortKey, string> = {
  sessions: "Сессии",
  hours: "Часы",
  shifts: "Смены",
  shiftCash: "Касса смен",
  revenue: "Деньги",
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

function formatDate(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPeriodDate(value: string) {
  return formatDate(`${value}T00:00:00.000Z`);
}

function isStaffSortKey(value: string | undefined): value is StaffSortKey {
  return (
    value === "sessions" ||
    value === "hours" ||
    value === "shifts" ||
    value === "shiftCash" ||
    value === "revenue"
  );
}

function getSortValue(row: StaffDisplayRow, sort: StaffSortKey) {
  switch (sort) {
    case "sessions":
      return row.sessionsCount;
    case "hours":
      return row.playHours;
    case "shifts":
      return row.shiftsCount;
    case "shiftCash":
      return row.shiftPaymentAmount;
    case "revenue":
      return row.transactionAmount + row.barRevenue;
  }
}

type StaffDisplayRow = {
  id: string;
  detailHref: string | null;
  displayName: string;
  contact: string;
  externalDomain: string | null;
  guestGroupName: string | null;
  controlFlags: string[];
  storeNames: string[];
  sessionsCount: number;
  playHours: number;
  shiftsCount: number;
  shiftHours: number;
  shiftPaymentAmount: number;
  averageShiftMiddleCheck: number;
  transactionAmount: number;
  barRevenue: number;
  lastActivityAt: string | null;
};

function getRows(report: StaffControlReport): StaffDisplayRow[] {
  return [
    ...report.rows.map((row) => ({
      id: row.id,
      detailHref: `/guests/${row.id}`,
      displayName: row.displayName,
      contact: row.contact,
      externalDomain: row.externalDomain,
      guestGroupName: row.guestGroupName,
      controlFlags: row.controlFlags,
      storeNames: row.storeNames,
      sessionsCount: row.sessionsCount,
      playHours: row.playHours,
      shiftsCount: row.shiftsCount,
      shiftHours: row.shiftHours,
      shiftPaymentAmount: row.shiftPaymentAmount,
      averageShiftMiddleCheck: row.averageShiftMiddleCheck,
      transactionAmount: row.transactionAmount,
      barRevenue: row.barRevenue,
      lastActivityAt: row.lastActivityAt,
    })),
    ...report.unmatchedOperators.map((row) => ({
      id: `operator:${row.externalDomain ?? "source"}:${row.externalUserId}`,
      detailHref: null,
      displayName: `user_id ${row.externalUserId}`,
      contact: row.externalDomain ?? "источник",
      externalDomain: row.externalDomain,
      guestGroupName: "Оператор Langame",
      controlFlags: ["Нужна привязка"],
      storeNames: row.storeNames,
      sessionsCount: 0,
      playHours: 0,
      shiftsCount: row.shiftsCount,
      shiftHours: row.shiftHours,
      shiftPaymentAmount: row.shiftPaymentAmount,
      averageShiftMiddleCheck: row.averageShiftMiddleCheck,
      transactionAmount: 0,
      barRevenue: 0,
      lastActivityAt: null,
    })),
  ];
}

export default async function StaffAdminsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters: GuestsSummaryFilters = {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
  };
  const staffSearch = searchParam(params.staffSearch)?.trim() ?? "";
  const staffGroup = searchParam(params.staffGroup)?.trim() ?? "";
  const staffFlag = searchParam(params.staffFlag)?.trim() ?? "";
  const sortParam = searchParam(params.staffSort);
  const directionParam = searchParam(params.staffDirection);
  const staffSort = isStaffSortKey(sortParam) ? sortParam : "revenue";
  const staffDirection: StaffSortDirection =
    directionParam === "asc" ? "asc" : "desc";
  const [report, options] = await Promise.all([
    getStaffControl(filters),
    getGuestFilterOptions(),
  ]);
  const allRows = getRows(report);
  const groupOptions = Array.from(
    new Set(allRows.map((row) => row.guestGroupName ?? row.externalDomain ?? "источник")),
  ).sort((first, second) => first.localeCompare(second, "ru"));
  const flagOptions = Array.from(
    new Set(allRows.flatMap((row) => row.controlFlags)),
  ).sort((first, second) => first.localeCompare(second, "ru"));
  const search = staffSearch.toLocaleLowerCase("ru-RU");
  const rows = allRows
    .filter((row) => {
      const groupName = row.guestGroupName ?? row.externalDomain ?? "источник";
      const text = [row.displayName, row.contact, row.externalDomain]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU");

      return (
        (!search || text.includes(search)) &&
        (!staffGroup || groupName === staffGroup) &&
        (!staffFlag || row.controlFlags.includes(staffFlag))
      );
    })
    .sort((first, second) => {
      const result = getSortValue(first, staffSort) - getSortValue(second, staffSort);
      return staffDirection === "asc" ? result : -result;
    });

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
              Администраторы
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Полный отчет за период {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}: активности, смены, касса,
              деньги гостей и флаги контроля.
            </p>
          </div>
          <Link
            href={`/guests/staff-control?dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${report.storeId ? `&storeId=${report.storeId}` : ""}`}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Назад в контроль персонала
          </Link>
        </header>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(7,minmax(0,1fr))_auto] xl:items-end">
            <FilterInput label="С даты" name="dateFrom" type="date" defaultValue={filters.dateFrom ?? report.periodFrom} />
            <FilterInput label="По дату" name="dateTo" type="date" defaultValue={filters.dateTo ?? report.periodTo} />
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">Клуб</span>
              <select name="storeId" defaultValue={filters.storeId ?? ""} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                <option value="">Вся сеть</option>
                {options.stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">Группа</span>
              <select name="staffGroup" defaultValue={staffGroup} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                <option value="">Все группы</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">Флаг</span>
              <select name="staffFlag" defaultValue={staffFlag} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                <option value="">Все флаги</option>
                {flagOptions.map((flag) => (
                  <option key={flag} value={flag}>{flag}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">Сортировка</span>
              <select name="staffSort" defaultValue={staffSort} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                {Object.entries(staffSortLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">Направление</span>
              <select name="staffDirection" defaultValue={staffDirection} className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </label>
            <div className="grid min-w-0 gap-1 text-sm md:col-span-2 xl:col-span-7">
              <span className="text-xs font-medium uppercase text-zinc-500">Поиск</span>
              <input name="staffSearch" defaultValue={staffSearch} placeholder="ФИО, телефон, user_id" className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            </div>
            <button className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400">
              Применить
            </button>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-base font-semibold">
              Строк: {formatNumber(rows.length)} из {formatNumber(allRows.length)}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1160px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Сотрудник</th>
                  <th className="px-4 py-3 text-left font-semibold">Группа</th>
                  <th className="px-4 py-3 text-left font-semibold">Клубы</th>
                  <th className="px-4 py-3 text-right font-semibold">Сессии</th>
                  <th className="px-4 py-3 text-right font-semibold">Часы</th>
                  <th className="px-4 py-3 text-right font-semibold">Смены</th>
                  <th className="px-4 py-3 text-right font-semibold">Касса смен</th>
                  <th className="px-4 py-3 text-right font-semibold">Деньги</th>
                  <th className="px-4 py-3 text-left font-semibold">Активность</th>
                  <th className="px-4 py-3 text-left font-semibold">Флаги</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      {row.detailHref ? (
                        <Link href={row.detailHref} className="font-medium hover:text-emerald-700 dark:hover:text-emerald-300">
                          {row.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.displayName}</span>
                      )}
                      <p className="mt-1 text-xs text-zinc-500">{row.contact}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{row.guestGroupName ?? row.externalDomain ?? "источник"}</td>
                    <td className="max-w-48 px-4 py-3 text-zinc-600 dark:text-zinc-300">{row.storeNames.length > 0 ? row.storeNames.join(", ") : "нет смен"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.sessionsCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.playHours, 1)} ч</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.shiftsCount)}<p className="mt-1 text-xs text-zinc-500">{formatNumber(row.shiftHours, 1)} ч</p></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRubles(row.shiftPaymentAmount)}<p className="mt-1 text-xs text-zinc-500">ср. чек {formatRubles(row.averageShiftMiddleCheck)}</p></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRubles(row.transactionAmount + row.barRevenue)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{formatDate(row.lastActivityAt)}</td>
                    <td className="px-4 py-3">
                      {row.controlFlags.length > 0 ? row.controlFlags.join(", ") : "нет"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <span className="text-xs font-medium uppercase text-zinc-500">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
