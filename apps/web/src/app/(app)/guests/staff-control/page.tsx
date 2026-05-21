import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestFilterOptions,
  getStaffControl,
  type GuestsSummaryFilters,
  type StaffControlAnomalyType,
  type StaffControlReport,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type StaffSortKey =
  | "sessions"
  | "hours"
  | "shifts"
  | "shiftCash"
  | "revenue";

type StaffSortDirection = "asc" | "desc";

type StaffTableControls = {
  staffSearch: string;
  staffGroup: string;
  staffFlag: string;
  staffSort: StaffSortKey;
  staffDirection: StaffSortDirection;
};

type StaffDisplayRow = {
  id: string;
  detailHref: string | null;
  displayName: string;
  contact: string;
  externalGuestId: string;
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

function resolveStaffTableControls(params: Awaited<SearchParams>) {
  const sort = searchParam(params.staffSort);
  const direction = searchParam(params.staffDirection);

  return {
    staffSearch: searchParam(params.staffSearch)?.trim() ?? "",
    staffGroup: searchParam(params.staffGroup)?.trim() ?? "",
    staffFlag: searchParam(params.staffFlag)?.trim() ?? "",
    staffSort: isStaffSortKey(sort) ? sort : "revenue",
    staffDirection: direction === "asc" ? "asc" : "desc",
  } satisfies StaffTableControls;
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

function staffControlHref({
  filters,
  controls,
  period,
  overrides = {},
}: {
  filters: GuestsSummaryFilters;
  controls: StaffTableControls;
  period: { from: string; to: string };
  overrides?: Partial<StaffTableControls>;
}) {
  const nextControls = { ...controls, ...overrides };
  const params = new URLSearchParams();

  params.set("dateFrom", filters.dateFrom ?? period.from);
  params.set("dateTo", filters.dateTo ?? period.to);

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  if (nextControls.staffSearch) {
    params.set("staffSearch", nextControls.staffSearch);
  }

  if (nextControls.staffGroup) {
    params.set("staffGroup", nextControls.staffGroup);
  }

  if (nextControls.staffFlag) {
    params.set("staffFlag", nextControls.staffFlag);
  }

  params.set("staffSort", nextControls.staffSort);
  params.set("staffDirection", nextControls.staffDirection);

  return `/guests/staff-control?${params.toString()}`;
}

function staffAdminsHref(
  report: StaffControlReport,
  filters: GuestsSummaryFilters,
  controls: StaffTableControls,
) {
  const params = new URLSearchParams();

  params.set("dateFrom", filters.dateFrom ?? report.periodFrom);
  params.set("dateTo", filters.dateTo ?? report.periodTo);

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  if (controls.staffSearch) {
    params.set("staffSearch", controls.staffSearch);
  }

  if (controls.staffGroup) {
    params.set("staffGroup", controls.staffGroup);
  }

  if (controls.staffFlag) {
    params.set("staffFlag", controls.staffFlag);
  }

  params.set("staffSort", controls.staffSort);
  params.set("staffDirection", controls.staffDirection);

  return `/guests/staff-control/admins?${params.toString()}`;
}

export default async function StaffControlPage({
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
  const staffControls = resolveStaffTableControls(params);
  const [report, options] = await Promise.all([
    getStaffControl(filters),
    getGuestFilterOptions(),
  ]);

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Персонал
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Контроль персонала
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Рабочий экран руководителя смен и управляющего: быстро увидеть
              кассовые риски, длинные смены, неподвязанных операторов и перейти
              в полный отчет только там, где нужно разбираться. Период{" "}
              {formatPeriodDate(report.periodFrom)} -{" "}
              {formatPeriodDate(report.periodTo)}.
            </p>
          </div>
          <Link
            href="/guests"
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            В дашборд гостей
          </Link>
        </header>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end">
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                С даты
              </span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={filters.dateFrom ?? report.periodFrom}
                className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                По дату
              </span>
              <input
                type="date"
                name="dateTo"
                defaultValue={filters.dateTo ?? report.periodTo}
                className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-xs font-medium uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={filters.storeId ?? ""}
                className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {options.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="h-10 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 lg:w-auto dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
              Применить
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <KpiCard label="Сотрудники" value={formatNumber(report.staffCount)} />
          <KpiCard
            label="Активные"
            value={formatNumber(report.activeStaff)}
            caption="сессия, деньги или продажа бара"
          />
          <KpiCard
            label="Смены Langame"
            value={formatNumber(report.shiftsCount)}
            caption={`${formatNumber(report.shiftsWithStaffLink)} связаны с сотрудником`}
          />
          <KpiCard
            label="Касса по сменам"
            value={formatRubles(report.shiftPaymentAmount)}
            caption={`возвраты ${formatRubles(report.shiftRefundAmount)}`}
          />
          <KpiCard
            label="Операции Langame"
            value={formatNumber(report.operationLogsCount)}
            caption={formatRubles(report.operationAmount)}
          />
        </section>

        <ReportPurposePanel report={report} filters={filters} controls={staffControls} />

        <AnomaliesPanel report={report} filters={filters} />

        <section className="mt-6 grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.45fr)]">
          <StaffTable
            report={report}
            filters={filters}
            controls={staffControls}
          />
          <OperationsPanel report={report} />
        </section>

        <UnmatchedOperatorsPanel report={report} />
        <DiagnosticsPanel report={report} />
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      {caption ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function ReportPurposePanel({
  report,
  filters,
  controls,
}: {
  report: StaffControlReport;
  filters: GuestsSummaryFilters;
  controls: StaffTableControls;
}) {
  const periodQuery = `dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${
    report.storeId ? `&storeId=${report.storeId}` : ""
  }`;

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-3">
      <PurposeCard
        label="1. Что требует внимания"
        title="Контроль смен"
        description="Автоматические сигналы по кассе, возвратам, инкассации, длинным сменам и низкому среднему чеку. Это первый блок для ежедневной проверки."
        href={staffOperatorsHref(report, filters)}
        action="Разобрать сигналы"
        meta={`${formatNumber(report.anomalies.length)} типов сигналов`}
      />
      <PurposeCard
        label="2. Кого проверять"
        title="Сотрудники и операторы"
        description="Список администраторов и user_id из Langame. Здесь видно, кто работает в сменах, кто приносит кассу и какие операторы еще не сопоставлены с сотрудниками."
        href={staffAdminsHref(report, filters, controls)}
        action="Открыть сотрудников"
        meta={`${formatNumber(report.unmatchedOperators.length)} без привязки`}
      />
      <PurposeCard
        label="3. На чем основаны выводы"
        title="Первичные источники"
        description="Операционный журнал и диагностика показывают, какие данные реально пришли из Langame и где пока не хватает надежной связки с администратором."
        href={`/guests/staff-control/operations?${periodQuery}`}
        secondaryHref={`/guests/staff-control/diagnostics?${periodQuery}`}
        action="Открыть операции"
        secondaryAction="Диагностика"
        meta={`${formatNumber(report.operationLogsCount)} операций`}
      />
    </section>
  );
}

function PurposeCard({
  label,
  title,
  description,
  href,
  action,
  meta,
  secondaryHref,
  secondaryAction,
}: {
  label: string;
  title: string;
  description: string;
  href: string;
  action: string;
  meta: string;
  secondaryHref?: string;
  secondaryAction?: string;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
        {label}
      </p>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {title}
        </h2>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {meta}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
        >
          {action}
        </Link>
        {secondaryHref && secondaryAction ? (
          <Link
            href={secondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {secondaryAction}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function AnomaliesPanel({
  report,
  filters,
}: {
  report: StaffControlReport;
  filters: GuestsSummaryFilters;
}) {
  const operatorsHref = staffOperatorsHref(report, filters);

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Блок 1
          </p>
          <h2 className="mt-1 text-base font-semibold">Сигналы для проверки смен</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Не полный журнал, а список поводов для управленческой проверки:
            возвраты, касса без инкассации, длинные смены, низкий средний чек и
            операторы без привязки.
          </p>
        </div>
        <Link
          href={operatorsHref}
          className="inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Операторы Langame
        </Link>
      </div>
      {report.anomalies.length > 0 ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {report.anomalies.map((anomaly) => (
            <Link
              key={anomaly.type}
              href={staffOperatorsHref(report, filters, anomaly.type)}
              className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${anomalyToneClass(anomaly.severity)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                    {formatNumber(anomaly.count)} сигналов
                  </p>
                  <h3 className="mt-2 text-base font-semibold">
                    {anomaly.title}
                  </h3>
                </div>
                {anomaly.amount !== null ? (
                  <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatRubles(anomaly.amount)}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                {anomaly.description}
              </p>
              <p className="mt-4 text-sm font-semibold underline underline-offset-4">
                Разобрать в отчете операторов
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Критичных сигналов по сменам за выбранный период нет.
        </p>
      )}
    </section>
  );
}

function anomalyToneClass(severity: "high" | "medium" | "low") {
  if (severity === "high") {
    return "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100";
  }

  if (severity === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-100";
}

function staffOperatorsHref(
  report: StaffControlReport,
  filters: GuestsSummaryFilters,
  anomaly?: StaffControlAnomalyType,
) {
  const params = new URLSearchParams();

  params.set("dateFrom", filters.dateFrom ?? report.periodFrom);
  params.set("dateTo", filters.dateTo ?? report.periodTo);

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  const drilldown = anomaly ? staffAnomalyDrilldown(anomaly) : null;

  params.set("status", drilldown?.status ?? "all");
  if (anomaly) {
    params.set("anomaly", anomaly);
  }
  params.set("sort", drilldown?.sort ?? "cash");
  params.set("direction", drilldown?.direction ?? "desc");

  return `/guests/staff-control/operators?${params.toString()}`;
}

function staffAnomalyDrilldown(anomaly: StaffControlAnomalyType): {
  status: "all" | "linked" | "unlinked";
  sort: "shifts" | "hours" | "cash" | "refunds" | "incass" | "middleCheck";
  direction: "asc" | "desc";
} {
  switch (anomaly) {
    case "refunds":
      return { status: "all", sort: "refunds", direction: "desc" };
    case "missing-incassation":
      return { status: "all", sort: "cash", direction: "desc" };
    case "long-shift":
      return { status: "all", sort: "hours", direction: "desc" };
    case "low-middle-check":
      return { status: "all", sort: "middleCheck", direction: "asc" };
    case "unmapped-operator":
      return { status: "unlinked", sort: "cash", direction: "desc" };
  }
}

function StaffTable({
  report,
  filters,
  controls,
}: {
  report: StaffControlReport;
  filters: GuestsSummaryFilters;
  controls: StaffTableControls;
}) {
  const period = { from: report.periodFrom, to: report.periodTo };
  const displayRows = getStaffDisplayRows(report);
  const groupOptions = Array.from(
    new Set(
      displayRows.map(
        (row) => row.guestGroupName ?? row.externalDomain ?? "источник",
      ),
    ),
  ).sort((first, second) => first.localeCompare(second, "ru"));
  const flagOptions = Array.from(
    new Set(displayRows.flatMap((row) => row.controlFlags)),
  ).sort((first, second) => first.localeCompare(second, "ru"));
  const search = controls.staffSearch.toLocaleLowerCase("ru-RU");
  const filteredRows = displayRows.filter((row) => {
    const groupName = row.guestGroupName ?? row.externalDomain ?? "источник";
    const searchableText = [
      row.displayName,
      row.contact,
      row.externalGuestId,
      row.externalDomain,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru-RU");

    return (
      (!search || searchableText.includes(search)) &&
      (!controls.staffGroup || groupName === controls.staffGroup) &&
      (!controls.staffFlag || row.controlFlags.includes(controls.staffFlag))
    );
  });
  const rows = [...filteredRows].sort((first, second) => {
    const firstValue = getStaffSortValue(first, controls.staffSort);
    const secondValue = getStaffSortValue(second, controls.staffSort);
    const result = firstValue - secondValue;

    return controls.staffDirection === "asc" ? result : -result;
  });
  const resetHref = staffControlHref({
    filters,
    controls: {
      staffSearch: "",
      staffGroup: "",
      staffFlag: "",
      staffSort: "revenue",
      staffDirection: "desc",
    },
    period,
  });
  const previewRows = rows.slice(0, 5);
  const fullHref = staffAdminsHref(report, filters, controls);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">
              Блок 2
            </p>
            <h2 className="mt-1 text-base font-semibold">
              Сотрудники и операторы
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Кто попал в контроль персонала: администраторы из групп{" "}
              {report.staffGroups.length > 0
                ? report.staffGroups.map((group) => group.name).join(", ")
                : "не найдены"}
              . Непривязанные user_id Langame добавлены отдельно, чтобы их
              можно было сопоставить с реальными сотрудниками.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Показано {formatNumber(rows.length)} из{" "}
            {formatNumber(displayRows.length)}
          </p>
          <Link
            href={fullHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Открыть полный отчет
          </Link>
        </div>
        {report.unmatchedOperators.length > 0 ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-300">
            Нужно сопоставить операторов Langame без привязки:{" "}
            {formatNumber(report.unmatchedOperators.length)}. До привязки их
            смены и касса видны по user_id, но не по имени сотрудника.
          </p>
        ) : null}
      </div>
      <form
        method="get"
        className="hidden"
      >
        <input
          type="hidden"
          name="dateFrom"
          value={filters.dateFrom ?? report.periodFrom}
        />
        <input
          type="hidden"
          name="dateTo"
          value={filters.dateTo ?? report.periodTo}
        />
        {filters.storeId ? (
          <input type="hidden" name="storeId" value={filters.storeId} />
        ) : null}
        <input type="hidden" name="staffSort" value={controls.staffSort} />
        <input
          type="hidden"
          name="staffDirection"
          value={controls.staffDirection}
        />
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Сотрудник
          </span>
          <input
            name="staffSearch"
            defaultValue={controls.staffSearch}
            placeholder="ФИО, телефон, ID"
            className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Группа
          </span>
          <select
            name="staffGroup"
            defaultValue={controls.staffGroup}
            className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Все группы</option>
            {groupOptions.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-xs font-medium uppercase text-zinc-500">
            Флаг
          </span>
          <select
            name="staffFlag"
            defaultValue={controls.staffFlag}
            className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Все флаги</option>
            {flagOptions.map((flag) => (
              <option key={flag} value={flag}>
                {flag}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button className="h-10 flex-1 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 lg:flex-none dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
            Применить
          </button>
          <Link
            href={resetHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Сбросить
          </Link>
        </div>
      </form>
      <div className="hidden">
        Сортировка: {staffSortLabels[controls.staffSort].toLocaleLowerCase("ru-RU")}
        , {controls.staffDirection === "asc" ? "по возрастанию" : "по убыванию"}
      </div>
      {displayRows.length > 0 ? (
        <div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {previewRows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_120px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-950 dark:text-zinc-50">
                    {row.displayName}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {row.contact}
                  </p>
                </div>
                <div className="min-w-0 text-zinc-600 dark:text-zinc-300">
                  <p className="truncate">
                    {row.guestGroupName ?? row.externalDomain ?? "источник"}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {row.storeNames.length > 0
                      ? row.storeNames.join(", ")
                      : "нет смен"}
                  </p>
                </div>
                <div className="tabular-nums">
                  <p className="text-xs uppercase text-zinc-500">Смены</p>
                  <p className="mt-1 font-semibold">
                    {formatNumber(row.shiftsCount)} /{" "}
                    {formatNumber(row.shiftHours, 1)} ч
                  </p>
                </div>
                <div className="tabular-nums">
                  <p className="text-xs uppercase text-zinc-500">Деньги</p>
                  <p className="mt-1 font-semibold">
                    {formatRubles(row.transactionAmount + row.barRevenue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {rows.length > previewRows.length ? (
            <div className="border-t border-zinc-200 px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800">
              В предпросмотре показано {formatNumber(previewRows.length)} из{" "}
              {formatNumber(rows.length)} строк. Полная таблица открывается в
              отдельном окне.
            </div>
          ) : null}
          <div className="hidden">
          <table className="min-w-[1160px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">
                  Сотрудник
                </th>
                <th className="px-4 py-3 text-left font-semibold">Группа</th>
                <th className="px-4 py-3 text-left font-semibold">Клубы</th>
                <SortableStaffHeader
                  controls={controls}
                  filters={filters}
                  period={period}
                  sortKey="sessions"
                />
                <SortableStaffHeader
                  controls={controls}
                  filters={filters}
                  period={period}
                  sortKey="hours"
                />
                <SortableStaffHeader
                  controls={controls}
                  filters={filters}
                  period={period}
                  sortKey="shifts"
                />
                <SortableStaffHeader
                  controls={controls}
                  filters={filters}
                  period={period}
                  sortKey="shiftCash"
                />
                <SortableStaffHeader
                  controls={controls}
                  filters={filters}
                  period={period}
                  sortKey="revenue"
                />
                <th className="px-4 py-3 text-left font-semibold">
                  Активность
                </th>
                <th className="px-4 py-3 text-left font-semibold">Флаги</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    {row.detailHref ? (
                      <Link
                        href={row.detailHref}
                        className="font-medium text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                      >
                        {row.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-zinc-950 dark:text-zinc-50">
                        {row.displayName}
                      </span>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">{row.contact}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.guestGroupName ?? row.externalDomain ?? "источник"}
                  </td>
                  <td className="max-w-40 px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.storeNames.length > 0 ? (
                      <span className="line-clamp-2">
                        {row.storeNames.join(", ")}
                      </span>
                    ) : (
                      <span className="text-zinc-400">нет смен</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.sessionsCount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.playHours, 1)} ч
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.shiftsCount)}
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatNumber(row.shiftHours, 1)} ч
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.shiftPaymentAmount)}
                    <p className="mt-1 text-xs text-zinc-500">
                      ср. чек {formatRubles(row.averageShiftMiddleCheck)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.transactionAmount + row.barRevenue)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatDate(row.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3">
                    {row.controlFlags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.controlFlags.map((flag) => (
                          <span
                            key={flag}
                            className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-400">нет</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">
              По текущим фильтрам сотрудники не найдены.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Администраторы по текущему периоду не найдены.
        </p>
      )}
    </section>
  );
}

function getStaffSortValue(
  row: StaffDisplayRow,
  sortKey: StaffSortKey,
) {
  switch (sortKey) {
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

function getStaffDisplayRows(report: StaffControlReport): StaffDisplayRow[] {
  const staffRows = report.rows.map((row) => ({
    id: row.id,
    detailHref: `/guests/${row.id}`,
    displayName: row.displayName,
    contact: row.contact,
    externalGuestId: row.externalGuestId,
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
  }));
  const unmatchedRows = report.unmatchedOperators.map((row) => ({
    id: `operator:${row.externalDomain ?? "source"}:${row.externalUserId}`,
    detailHref: null,
    displayName: `user_id ${row.externalUserId}`,
    contact: row.externalDomain ?? "источник",
    externalGuestId: row.externalUserId,
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
  }));

  return [...staffRows, ...unmatchedRows];
}

function SortableStaffHeader({
  controls,
  filters,
  period,
  sortKey,
}: {
  controls: StaffTableControls;
  filters: GuestsSummaryFilters;
  period: { from: string; to: string };
  sortKey: StaffSortKey;
}) {
  const isActive = controls.staffSort === sortKey;
  const nextDirection =
    isActive && controls.staffDirection === "desc" ? "asc" : "desc";
  const href = staffControlHref({
    filters,
    controls,
    period,
    overrides: {
      staffSort: sortKey,
      staffDirection: nextDirection,
    },
  });

  return (
    <th
      aria-sort={
        isActive
          ? controls.staffDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className="px-4 py-3 text-right font-semibold"
    >
      <Link
        href={href}
        className="inline-flex items-center justify-end gap-1 text-zinc-600 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-300"
      >
        <span>{staffSortLabels[sortKey]}</span>
        <span className="text-[10px]">
          {isActive ? (controls.staffDirection === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function OperationsPanel({ report }: { report: StaffControlReport }) {
  const rows = report.operationTypes.slice(0, 5);

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">
              Блок 3
            </p>
            <h2 className="mt-1 text-base font-semibold">
              Операционный журнал
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Агрегат по all_operations_log: какие типы операций происходили и
              на какую сумму. Сейчас это источник для сверки, а не персональная
              оценка сотрудника.
            </p>
          </div>
          <Link
            href={`/guests/staff-control/operations?dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${report.storeId ? `&storeId=${report.storeId}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Открыть полный отчет
          </Link>
        </div>
      </div>
      {report.operationTypes.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <div
              key={row.type}
              className="grid grid-cols-[minmax(0,1fr)_90px_120px] gap-3 px-5 py-4 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                  {row.type}
                </p>
              </div>
              <p className="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                {formatNumber(row.count)}
              </p>
              <p className="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                {formatRubles(row.amount)}
              </p>
            </div>
          ))}
          {report.operationTypes.length > rows.length ? (
            <p className="px-5 py-4 text-sm text-zinc-500">
              Показано {formatNumber(rows.length)} из{" "}
              {formatNumber(report.operationTypes.length)} типов операций.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Операций за период не найдено.
        </p>
      )}
    </section>
  );
}

function UnmatchedOperatorsPanel({ report }: { report: StaffControlReport }) {
  const totalRows = report.unmatchedOperators.length;
  const rows = report.unmatchedOperators.slice(0, 4);

  return (
    <section className="mt-6 min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Операторы Langame без привязки
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Рабочий список для настройки учета персонала. После привязки
              user_id к сотруднику смены начнут попадать в персональные отчеты
              администратора.
            </p>
          </div>
          <Link
            href={`/guests/staff-control/operators?dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${report.storeId ? `&storeId=${report.storeId}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Открыть в новом окне
          </Link>
        </div>
      </div>
      {totalRows > 0 ? (
        <div className="w-full overflow-x-auto">
          <table className="min-w-[760px] divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">
                  Оператор
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr
                  key={`${row.externalDomain ?? "source"}-${row.externalUserId}`}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      user_id {row.externalUserId}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.externalDomain ?? "источник"}
                    </p>
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
                </tr>
              ))}
            </tbody>
          </table>
          {totalRows > rows.length ? (
            <div className="border-t border-zinc-200 px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800">
              В предпросмотре показано {formatNumber(rows.length)} из{" "}
              {formatNumber(totalRows)} операторов. Привязка доступна в полном
              отчете.
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Нераспознанных операторов за период нет.
        </p>
      )}
    </section>
  );
}

function DiagnosticsPanel({ report }: { report: StaffControlReport }) {
  const latestRuns = report.diagnostics.latestRuns.slice(0, 2);

  return (
    <section className="mt-6 min-w-0 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Диагностика связки персонала
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Техническая проверка качества данных Langame: какие endpoints
              отдали строки и какие поля похожи на идентификаторы оператора.
              Нужна для развития точного контроля персонала.
            </p>
          </div>
          <Link
            href={`/guests/staff-control/diagnostics?dateFrom=${report.periodFrom}&dateTo=${report.periodTo}${report.storeId ? `&storeId=${report.storeId}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Открыть полный отчет
          </Link>
        </div>
      </div>
      {report.diagnostics.latestRuns.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {latestRuns.map((run) => (
            <div key={`${run.domain}-${run.startedAt}`} className="px-5 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {run.domain}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(run.startedAt)}
                  </p>
                </div>
                {Object.keys(run.endpointErrors).length > 0 ? (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-300">
                    Есть недоступные endpoints
                  </p>
                ) : null}
              </div>
              <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
                <DiagnosticSource
                  title="all_operations_log"
                  total={run.operationLogs.total}
                  fields={run.operationLogs.candidateFields}
                  operatorHints={run.operationLogs.operatorHints}
                />
                <DiagnosticSource
                  title="log_cash_transaction"
                  total={run.cashTransactions.total}
                  fields={run.cashTransactions.candidateFields}
                  operatorHints={run.cashTransactions.operatorHints}
                />
                <DiagnosticSource
                  title="working_shifts"
                  total={run.workingShifts.total}
                  fields={run.workingShifts.candidateFields}
                  operatorHints={run.workingShifts.operatorHints}
                />
              </div>
            </div>
          ))}
          {report.diagnostics.latestRuns.length > latestRuns.length ? (
            <p className="px-5 py-4 text-sm text-zinc-500">
              Показано {formatNumber(latestRuns.length)} из{" "}
              {formatNumber(report.diagnostics.latestRuns.length)} источников.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Диагностика появится после следующей синхронизации гостей.
        </p>
      )}
    </section>
  );
}

function DiagnosticSource({
  title,
  total,
  fields,
  operatorHints,
}: {
  title: string;
  total: number;
  fields: Record<string, number>;
  operatorHints: StaffControlReport["diagnostics"]["latestRuns"][number]["workingShifts"]["operatorHints"];
}) {
  const entries = Object.entries(fields)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 8);

  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <p className="break-all text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          {title}
        </p>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {formatNumber(total)}
        </span>
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entries.map(([field, count]) => (
            <span
              key={field}
              className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {field}: {formatNumber(count)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">
          Поля персонала пока не найдены.
        </p>
      )}
      {operatorHints.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Кандидаты операторов
          </p>
          {operatorHints.slice(0, 4).map((hint) => (
            <div key={hint.operatorId} className="text-xs text-zinc-500">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {hint.operatorId}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatNumber(hint.count)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(hint.fields)
                  .slice(0, 6)
                  .map(([field, values]) => (
                    <span
                      key={field}
                      className="max-w-full break-all rounded-md bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                    >
                      {field}: {values.join(", ")}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
