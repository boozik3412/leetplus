import Link from "next/link";
import { GuestAudiencesPanel } from "@/components/guest-audiences-panel";
import { GuestSavedFiltersPanel } from "@/components/guest-saved-filters-panel";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestAudiences,
  getGuestCrmContactEvents,
  getGuestCrmLeads,
  getGuestCrmTasks,
  getGuestCrmUsers,
  getGuestFilterOptions,
  getGuestSavedFilters,
  getGuests,
  type GuestCrmStatus,
  type GuestDashboardRow,
  type GuestFilterOptions,
  type GuestListFilters,
  type GuestListResponse,
  type GuestSegment,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const segments: Array<"top" | GuestSegment> = [
  "top",
  "active",
  "new",
  "repeat",
  "risk",
  "lost",
  "quiet",
];

const crmStatuses: GuestCrmStatus[] = [
  "NONE",
  "WATCH",
  "CONTACT",
  "INVITED",
  "LOYAL",
  "VIP",
  "PROBLEM",
  "DO_NOT_CONTACT",
];

const sortOptions: Array<NonNullable<GuestListFilters["sort"]>> = [
  "revenue",
  "sessions",
  "lastActivity",
  "registered",
];

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function segmentLabel(segment: GuestDashboardRow["segment"] | "top") {
  const labels: Record<GuestDashboardRow["segment"] | "top", string> = {
    top: "TOP по деньгам",
    active: "Активные",
    new: "Новые",
    repeat: "Повторные",
    risk: "В риске",
    lost: "Потерянные",
    quiet: "Тихие",
  };

  return labels[segment];
}

function crmStatusLabel(status: GuestCrmStatus) {
  const labels: Record<GuestCrmStatus, string> = {
    NONE: "Без статуса",
    WATCH: "Наблюдать",
    CONTACT: "Связаться",
    INVITED: "Приглашен",
    LOYAL: "Лояльный",
    VIP: "VIP",
    PROBLEM: "Проблемный",
    DO_NOT_CONTACT: "Не контактировать",
  };

  return labels[status];
}

function sortLabel(sort: NonNullable<GuestListFilters["sort"]>) {
  const labels: Record<NonNullable<GuestListFilters["sort"]>, string> = {
    revenue: "Деньги",
    sessions: "Сессии",
    lastActivity: "Активность",
    registered: "Регистрация",
  };

  return labels[sort];
}

export default async function GuestFullReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters: GuestListFilters = {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    guestGroupId: searchParam(params.guestGroupId),
    segment: searchParam(params.segment) as GuestListFilters["segment"],
    crmStatus: searchParam(params.crmStatus) as GuestListFilters["crmStatus"],
    search: searchParam(params.search),
    page: searchParam(params.page),
    pageSize: searchParam(params.pageSize) ?? "200",
    sort: searchParam(params.sort) as GuestListFilters["sort"],
    direction: searchParam(params.direction) as GuestListFilters["direction"],
  };
  const [
    guestList,
    options,
    savedFilters,
    audiences,
    crmLeads,
    crmTasks,
    crmUsers,
    crmContactEvents,
  ] = await Promise.all([
    getGuests(filters),
    getGuestFilterOptions(),
    getGuestSavedFilters(),
    getGuestAudiences(),
    getGuestCrmLeads(),
    getGuestCrmTasks(),
    getGuestCrmUsers(),
    getGuestCrmContactEvents(),
  ]);
  const effectiveFilters: GuestListFilters = {
    ...filters,
    dateFrom: filters.dateFrom ?? guestList.periodFrom,
    dateTo: filters.dateTo ?? guestList.periodTo,
    pageSize: filters.pageSize ?? String(guestList.pageSize),
    segment: filters.segment ?? guestList.segment,
    sort: filters.sort ?? guestList.sort,
    direction: filters.direction ?? guestList.direction,
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-5 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-[1760px]">
        <ReportBreadcrumbs
          current="Полный отчет по гостям"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests", label: "Гости" },
          ]}
        />
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Полный отчет по гостям
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {formatNumber(guestList.totalRows)} гостей в выборке за период{" "}
              {formatDate(`${guestList.periodFrom}T00:00:00.000Z`)} -{" "}
              {formatDate(`${guestList.periodTo}T00:00:00.000Z`)}. По
              умолчанию администраторы исключены; выберите админ-группу в
              фильтре, чтобы посмотреть ее отдельно.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={exportHref(filters)}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
            >
              CSV
            </Link>
            <Link
              href={reportHref({ ...filters, page: "1" })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Обновить
            </Link>
            <Link
              href={dashboardHref(filters)}
              className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
            >
              Вернуться в дашборд
            </Link>
          </div>
        </header>

        <ReportFilters
          filters={filters}
          options={options}
          periodFrom={guestList.periodFrom}
          periodTo={guestList.periodTo}
        />

        <GuestSavedFiltersPanel
          currentFilters={effectiveFilters}
          savedFilters={savedFilters}
        />

        <GuestAudiencesPanel
          currentFilters={effectiveFilters}
          totalRows={guestList.totalRows}
          audiences={audiences}
          crmLeads={crmLeads}
          crmTasks={crmTasks}
          crmUsers={crmUsers}
          crmContactEvents={crmContactEvents}
        />

        <ReportTable filters={filters} guestList={guestList} />
      </div>
    </main>
  );
}

function ReportFilters({
  filters,
  options,
  periodFrom,
  periodTo,
}: {
  filters: GuestListFilters;
  options: GuestFilterOptions;
  periodFrom: string;
  periodTo: string;
}) {
  return (
    <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        <input type="hidden" name="page" value="1" />
        <FilterLabel title="С даты">
          <input
            type="date"
            name="dateFrom"
            defaultValue={filters.dateFrom ?? periodFrom}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </FilterLabel>
        <FilterLabel title="По дату">
          <input
            type="date"
            name="dateTo"
            defaultValue={filters.dateTo ?? periodTo}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </FilterLabel>
        <FilterLabel title="Клуб">
          <select
            name="storeId"
            defaultValue={filters.storeId ?? ""}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Вся сеть</option>
            {options.stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel title="Группа">
          <select
            name="guestGroupId"
            defaultValue={filters.guestGroupId ?? ""}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Все группы</option>
            {options.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.externalDomain ?? "источник"})
              </option>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel title="Сегмент">
          <select
            name="segment"
            defaultValue={filters.segment ?? "top"}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {segments.map((segment) => (
              <option key={segment} value={segment}>
                {segmentLabel(segment)}
              </option>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel title="CRM статус">
          <select
            name="crmStatus"
            defaultValue={filters.crmStatus ?? ""}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Все статусы</option>
            {crmStatuses.map((status) => (
              <option key={status} value={status}>
                {crmStatusLabel(status)}
              </option>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel title="Сортировка">
          <select
            name="sort"
            defaultValue={filters.sort ?? "revenue"}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {sortOptions.map((sort) => (
              <option key={sort} value={sort}>
                {sortLabel(sort)}
              </option>
            ))}
          </select>
        </FilterLabel>
        <FilterLabel title="Направление">
          <select
            name="direction"
            defaultValue={filters.direction ?? "desc"}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="desc">По убыванию</option>
            <option value="asc">По возрастанию</option>
          </select>
        </FilterLabel>
        <FilterLabel title="Строк на странице">
          <select
            name="pageSize"
            defaultValue={filters.pageSize ?? "200"}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </FilterLabel>
        <label className="grid gap-1 text-sm lg:col-span-2 2xl:col-span-3">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Поиск
          </span>
          <input
            type="search"
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="ID, телефон, email, ФИО"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 2xl:col-span-3">
          <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
            Применить
          </button>
          <Link
            href="/guests/report"
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Сбросить
          </Link>
        </div>
      </form>
    </section>
  );
}

function FilterLabel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-xs font-medium uppercase text-zinc-500">
        {title}
      </span>
      {children}
    </label>
  );
}

function ReportTable({
  filters,
  guestList,
}: {
  filters: GuestListFilters;
  guestList: GuestListResponse;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Строки отчета</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Страница {formatNumber(guestList.page)} из{" "}
            {formatNumber(guestList.totalPages)}, показано{" "}
            {formatNumber(guestList.rows.length)} из{" "}
            {formatNumber(guestList.totalRows)} гостей
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          Сортировка: {sortLabel(guestList.sort)},{" "}
          {guestList.direction === "asc" ? "по возрастанию" : "по убыванию"}
        </div>
      </div>
      {guestList.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-[1420px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Гость</th>
                <th className="px-4 py-3 text-left font-semibold">Контакт</th>
                <th className="px-4 py-3 text-left font-semibold">Группа</th>
                <th className="px-4 py-3 text-left font-semibold">Сегмент</th>
                <th className="px-4 py-3 text-left font-semibold">CRM</th>
                <th className="px-4 py-3 text-right font-semibold">Сессии</th>
                <th className="px-4 py-3 text-right font-semibold">Дни</th>
                <th className="px-4 py-3 text-right font-semibold">Часы</th>
                <th className="px-4 py-3 text-right font-semibold">Деньги</th>
                <th className="px-4 py-3 text-right font-semibold">Бар</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Регистрация
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  Активность
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  Следующий шаг
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {guestList.rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/guests/${row.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                    >
                      {row.displayName}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      ID {row.externalGuestId}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.contact}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.guestGroupName ?? row.externalDomain ?? "источник"}
                  </td>
                  <td className="px-4 py-3">{segmentLabel(row.segment)}</td>
                  <td className="px-4 py-3">{crmStatusLabel(row.crmStatus)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.sessionsCount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.visitsDays)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.playHours, 1)} ч
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.transactionAmount + row.barRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.barRevenue)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatDate(row.insertedAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatDate(row.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    <p>{row.nextAction ?? "нет действия"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDateTime(row.nextContactAt)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          По текущим фильтрам гостей не найдено.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 text-sm dark:border-zinc-800">
        <PaginationLink
          filters={filters}
          page={guestList.page - 1}
          disabled={guestList.page <= 1}
        >
          Назад
        </PaginationLink>
        <span className="text-zinc-500">
          {formatNumber(guestList.page)} / {formatNumber(guestList.totalPages)}
        </span>
        <PaginationLink
          filters={filters}
          page={guestList.page + 1}
          disabled={guestList.page >= guestList.totalPages}
        >
          Вперед
        </PaginationLink>
      </div>
    </section>
  );
}

function PaginationLink({
  filters,
  page,
  disabled,
  children,
}: {
  filters: GuestListFilters;
  page: number;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-400 dark:border-zinc-800">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={reportHref({ ...filters, page: String(page) })}
      className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}

function dashboardHref(filters: GuestListFilters) {
  return pathHref("/guests", filters);
}

function reportHref(filters: GuestListFilters) {
  return pathHref("/guests/report", filters);
}

function exportHref(filters: GuestListFilters) {
  const exportFilters = { ...filters };
  delete exportFilters.page;
  delete exportFilters.pageSize;

  return pathHref("/api/guests/export", exportFilters);
}

function pathHref(pathname: string, filters: GuestListFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
