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
  type GuestChurnRiskLevel,
  type GuestCrmStatus,
  type GuestDashboardRow,
  type GuestFilterOptions,
  type GuestListFilters,
  type GuestListResponse,
  type GuestRfmSegment,
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
  "rfm",
  "churnRisk",
  "ltv",
  "bonusLoad",
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

function segmentTone(segment: GuestDashboardRow["segment"]) {
  if (segment === "active" || segment === "new" || segment === "repeat") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }

  if (segment === "risk") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  }

  if (segment === "lost") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  }

  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
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

function rfmSegmentLabel(segment: GuestRfmSegment) {
  const labels: Record<GuestRfmSegment, string> = {
    CHAMPION: "Чемпион",
    LOYAL: "Лояльный",
    PROMISING: "Перспективный",
    NEED_ATTENTION: "Нужен контакт",
    AT_RISK: "VIP в риске",
    LOST: "Потерянный",
  };

  return labels[segment];
}

function churnRiskLabel(level: GuestChurnRiskLevel) {
  const labels: Record<GuestChurnRiskLevel, string> = {
    LOW: "Низкий",
    MEDIUM: "Наблюдать",
    HIGH: "Высокий",
    LOST: "Потерян",
  };

  return labels[level];
}

function churnRiskTone(level: GuestChurnRiskLevel) {
  if (level === "LOW") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }

  if (level === "MEDIUM") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  }

  return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
}

function bonusLoadLabel(status: GuestDashboardRow["bonusLoad"]["status"]) {
  const labels: Record<GuestDashboardRow["bonusLoad"]["status"], string> = {
    NONE: "Нет бонусов",
    NORMAL: "Активный остаток",
    WATCH: "Наблюдать",
    RISK: "Без активности",
  };

  return labels[status];
}

function bonusLoadTone(status: GuestDashboardRow["bonusLoad"]["status"]) {
  if (status === "RISK") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  }

  if (status === "WATCH") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  }

  if (status === "NORMAL") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  }

  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function sortLabel(sort: NonNullable<GuestListFilters["sort"]>) {
  const labels: Record<NonNullable<GuestListFilters["sort"]>, string> = {
    revenue: "Деньги",
    sessions: "Сессии",
    lastActivity: "Активность",
    registered: "Регистрация",
    rfm: "RFM",
    churnRisk: "Риск оттока",
    ltv: "LTV факт",
    bonusLoad: "Бонусы",
  };

  return labels[sort];
}

function primaryStoreLabel(row: GuestDashboardRow) {
  return row.primaryStoreName ?? row.externalDomain ?? "Клуб не определен";
}

function primaryStoreMeta(row: GuestDashboardRow) {
  if (row.primaryStoreVisits > 0) {
    return `${formatNumber(row.primaryStoreVisits)} визитов в клубе`;
  }

  if (row.primaryStoreName) {
    return "клуб из истории";
  }

  if (row.externalDomain) {
    return "источник Langame";
  }

  return "нет клубной привязки";
}

function nextActionLabel(row: GuestDashboardRow) {
  if (row.nextAction) {
    return row.nextAction;
  }

  if (row.churnRisk.level === "HIGH" || row.segment === "risk") {
    return "Связаться и предложить повод вернуться";
  }

  if (row.segment === "lost") {
    return "Проверить контакт и подготовить реактивацию";
  }

  if (row.segment === "new") {
    return "Закрепить первый повторный визит";
  }

  if (row.segment === "quiet") {
    return "Добавить в мягкую коммуникацию";
  }

  return "Плановое наблюдение";
}

function activityLabel(row: GuestDashboardRow) {
  const parts = [
    `${formatNumber(row.sessionsCount)} сесс.`,
    `${formatNumber(row.visitsDays)} дн.`,
    `${formatNumber(row.playHours, 1)} ч`,
  ];

  return parts.join(" · ");
}

function recentActivityLabel(row: GuestDashboardRow) {
  const parts = [
    `${formatNumber(row.recentSessionsCount)} сесс.`,
    `${formatNumber(row.recentVisitsDays)} дн.`,
    `${formatNumber(row.recentPlayHours, 1)} ч`,
  ];

  return parts.join(" · ");
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
              href={reportHref(filters)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Открыть отдельно
            </Link>
            <Link
              href={exportHref(filters)}
              target="_blank"
              rel="noopener noreferrer"
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
            {formatNumber(guestList.totalRows)} гостей. На экране оставлены
            ключевые сигналы; полный набор полей доступен в CSV.
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          Сортировка: {sortLabel(guestList.sort)},{" "}
          {guestList.direction === "asc" ? "по возрастанию" : "по убыванию"}
        </div>
      </div>
      {guestList.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Гость</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Основной клуб
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  Активность
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  Деньги / LTV
                </th>
                <th className="px-4 py-3 text-left font-semibold">
                  Риск
                </th>
                <th className="px-4 py-3 text-right font-semibold">Бонусы</th>
                <th className="px-4 py-3 text-left font-semibold">
                  CRM / действие
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
                    <p className="mt-1 max-w-56 truncate text-xs text-zinc-500">
                      {row.contact}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${segmentTone(
                        row.segment,
                      )}`}
                    >
                      {segmentLabel(row.segment)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-800 dark:text-zinc-100">
                      {primaryStoreLabel(row)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {primaryStoreMeta(row)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.guestGroupName ?? "без группы"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                      {activityLabel(row)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      за выбранный период
                    </p>
                    <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      история: {recentActivityLabel(row)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      последний визит: {formatDate(row.lastActivityAt)}
                    </p>
                    {row.churnRisk.expectedIntervalDays !== null ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        обычный интервал: {row.churnRisk.expectedIntervalDays} дн.
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                      {formatRubles(row.transactionAmount + row.barRevenue)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      за период, бар {formatRubles(row.barRevenue)}
                    </p>
                    <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {row.ltv.revenueDays > 0
                        ? `LTV ${formatRubles(row.ltv.totalRevenue)}`
                        : "LTV: нет связанной выручки"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {row.ltv.revenueDays > 0
                        ? `${formatNumber(row.ltv.revenueDays)} дн. с выручкой`
                        : "проверьте связку гостя с операциями"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${churnRiskTone(
                        row.churnRisk.level,
                      )}`}
                    >
                      {churnRiskLabel(row.churnRisk.level)} ·{" "}
                      {row.churnRisk.score}/100
                    </span>
                    <p className="mt-2 max-w-52 text-xs text-zinc-500">
                      {row.churnRisk.reason}
                    </p>
                    {row.churnRisk.valueAtRisk > 0 ? (
                      <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-300">
                        в риске {formatRubles(row.churnRisk.valueAtRisk)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      RFM {row.rfm.totalScore}/15 · {rfmSegmentLabel(row.rfm.segment)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <p className="font-semibold">
                      {formatRubles(row.bonusLoad.currentBalance)}
                    </p>
                    <p
                      className={`text-xs font-medium ${bonusLoadTone(
                        row.bonusLoad.status,
                      )} inline-flex rounded-full px-2 py-0.5`}
                    >
                      {bonusLoadLabel(row.bonusLoad.status)}
                    </p>
                    {row.bonusLoad.balanceToLtvPercent !== null ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatNumber(row.bonusLoad.balanceToLtvPercent, 1)}% от LTV
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.bonusLoad.latestSnapshotAt
                        ? `снимок ${formatDate(row.bonusLoad.latestSnapshotAt)}`
                        : "снимок бонусов не найден"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    <p className="max-w-64 font-medium text-zinc-800 dark:text-zinc-100">
                      {nextActionLabel(row)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      CRM: {crmStatusLabel(row.crmStatus)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.nextContactAt
                        ? formatDateTime(row.nextContactAt)
                        : "без даты контакта"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      зарегистрирован: {formatDate(row.insertedAt)}
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
