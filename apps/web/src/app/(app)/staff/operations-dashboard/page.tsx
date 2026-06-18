import Link from "next/link";
import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";
import {
  getStaffOperationsDashboard,
  type StaffOperationsDashboardFilters,
  type StaffOperationsDrilldownAction,
  type StaffOperationsEmployeeRating,
  type StaffOperationsRating,
  type StaffOperationsRecurringIssue,
  type StaffOperationsRiskItem,
  type StaffOperationsRiskLevel,
  type StaffOperationsStaffControl,
} from "@/lib/staff-operations-dashboard";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const riskLabels: Record<StaffOperationsRiskLevel, string> = {
  LOW: "Норма",
  MEDIUM: "Внимание",
  HIGH: "Риск",
};

const readinessLabels = {
  READY: "Готов",
  ATTENTION: "Внимание",
  BLOCKED: "Нет допуска",
} as const;

const riskKindLabels: Record<StaffOperationsRiskItem["kind"], string> = {
  TASK_OVERDUE: "Просрочена задача",
  TASK_UNCHECKED: "Задача на проверке",
  CHECKLIST_ESCALATED: "Чеклист эскалирован",
  CHECKLIST_RETURNED: "Чеклист возвращен",
  CHECKLIST_FAILED: "Провален пункт",
  CHECKLIST_UNCHECKED: "Чеклист на проверке",
  SHIFT_REFUNDS: "Возвраты по сменам",
  SHIFT_MISSING_INCASSATION: "Касса без инкассации",
  SHIFT_UNLINKED_OPERATOR: "Сотрудник без привязки",
  SHIFT_LONG: "Длинная смена",
  SHIFT_LOW_MIDDLE_CHECK: "Низкий средний чек",
  SHIFT_MISSED_CHECKLIST: "Кассовый чеклист",
  SHIFT_BAR_CHECKLIST: "Барный чеклист",
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function yektDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as {
    year: string;
    month: string;
    day: string;
  };
}

function yektDateParam(date: Date) {
  const parts = yektDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function defaultStaffControlPeriod() {
  const now = new Date();
  const todayParts = yektDateParts(now);
  const firstDay = `${todayParts.year}-${todayParts.month}-01`;
  const yesterdayNoon = new Date(
    `${yektDateParam(now)}T12:00:00+05:00`,
  );
  yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
  const lastFullDay = yektDateParam(yesterdayNoon);

  return {
    dateFrom: firstDay,
    dateTo: lastFullDay < firstDay ? firstDay : lastFullDay,
  };
}

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffOperationsDashboardFilters {
  const defaultPeriod = defaultStaffControlPeriod();

  return {
    dateFrom: searchParam(params.dateFrom) ?? defaultPeriod.dateFrom,
    dateTo: searchParam(params.dateTo) ?? defaultPeriod.dateTo,
    storeId: searchParam(params.storeId),
    userId: searchParam(params.userId),
    search: searchParam(params.search)?.trim(),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatRubles(value: number | null) {
  if (value === null) {
    return "нет суммы";
  }

  return `${formatNumber(Math.round(value))} руб`;
}

function formatHours(value: number) {
  return `${formatNumber(Math.round(value * 10) / 10)} ч`;
}

function parseDateForLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const dateOnly = value.includes("T") ? value.slice(0, 10) : value;
  const parsed = new Date(`${dateOnly}T00:00:00+05:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | null | undefined) {
  const parsed = parseDateForLabel(value);

  if (!parsed) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Yekaterinburg",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatDateRange(dateFrom: string | null | undefined, dateTo: string | null | undefined) {
  return `${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
}

function resolveDrilldownActions(
  actions: StaffOperationsDrilldownAction[],
  fallbackHref: string,
): StaffOperationsDrilldownAction[] {
  return actions.length > 0
    ? actions
    : [{ label: "Разобрать", href: fallbackHref }];
}

function riskClass(level: StaffOperationsRiskLevel) {
  if (level === "HIGH") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200";
  }

  if (level === "MEDIUM") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-500/10 dark:text-amber-200";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-500/10 dark:text-emerald-200";
}

export default async function StaffOperationsDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters = resolveFilters(params);
  const [dashboard, staffSnapshot] = await Promise.all([
    getStaffOperationsDashboard(filters),
    safeGetBusinessSnapshot("STAFF_SHIFTS_CASH"),
  ]);
  const staffControlPeriodLabel = formatDateRange(
    dashboard.filters.dateFrom,
    dashboard.filters.dateTo,
  );

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Операционная дисциплина"
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
              Операционная дисциплина
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Сводка по задачам, чеклистам и готовности сотрудников: где
              просрочки, возвраты, непроверенные результаты и повторяющиеся
              проблемы смены.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/staff/tasks"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Задачи
            </Link>
            <Link
              href="/staff/checklists/report"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Чеклисты
            </Link>
            <Link
              href="/staff/readiness-report"
              className="inline-flex h-10 items-center rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Готовность
            </Link>
          </div>
        </header>

        <BusinessSnapshotGate
          snapshot={staffSnapshot}
          type="STAFF_SHIFTS_CASH"
          compactPeriodLabel={staffControlPeriodLabel}
          compactPeriodBadge="Полные сутки"
          compact
        />

        <form className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                С даты
              </span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dashboard.filters.dateFrom}
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
                defaultValue={dashboard.filters.dateTo}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={dashboard.filters.storeId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {dashboard.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Сотрудник
              </span>
              <select
                name="userId"
                defaultValue={dashboard.filters.userId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Все сотрудники</option>
                {dashboard.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName ?? user.email}
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
                  defaultValue={dashboard.filters.search ?? ""}
                  placeholder="Задача, чеклист или сотрудник"
                  className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300">
                  Показать
                </button>
              </div>
            </label>
          </div>
        </form>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <StaffControlPanel staffControl={dashboard.staffControl} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <RatingPanel title="Рейтинг клубов" rows={dashboard.clubs} />
          <EmployeeRatingPanel rows={dashboard.employees} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <RecurringIssuesPanel issues={dashboard.recurringIssues} />
          <LatestRisksPanel risks={dashboard.latestRisks} />
        </section>
      </div>
    </main>
  );
}

function StaffControlPanel({
  staffControl,
}: {
  staffControl: StaffOperationsStaffControl;
}) {
  const { summary, anomalies } = staffControl;
  const metricCards = [
    {
      label: "Смены",
      value: formatNumber(summary.shiftsTotal),
      caption: `${formatNumber(summary.linkedShifts)} привязано / ${formatNumber(summary.unlinkedShifts)} без привязки`,
      tone: summary.unlinkedShifts > 0 ? "MEDIUM" : "LOW",
    },
    {
      label: "Часы",
      value: formatHours(summary.shiftHours),
      caption: "по рабочим сменам Langame",
      tone: "LOW",
    },
    {
      label: "Касса смен",
      value: formatRubles(summary.paymentAmount),
      caption: `наличные ${formatRubles(summary.cashAmount)}`,
      tone: "LOW",
    },
    {
      label: "Возвраты",
      value: formatRubles(summary.refundAmount),
      caption: "сигнал для проверки",
      tone: summary.refundAmount > 0 ? "MEDIUM" : "LOW",
    },
    {
      label: "Инкассация",
      value: formatRubles(summary.incassAmount),
      caption: "по сменам периода",
      tone: "LOW",
    },
    {
      label: "Средний чек",
      value: formatRubles(summary.averageMiddleCheck),
      caption: `${formatNumber(summary.missedChecklistRuns)} пропущенных чеклистов`,
      tone: summary.missedChecklistRuns > 0 ? "MEDIUM" : "LOW",
    },
  ] as const;

  return (
    <section className="lg:col-span-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Staff-control
          </p>
          <h2 className="mt-1 text-lg font-semibold">Смены, касса и операционные сигналы</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Дашборд связывает дисциплину персонала с фактическими сменами: привязка сотрудников, касса, возвраты, инкассация, средний чек и чеклисты смены.
          </p>
        </div>
        <Link
          href="/guests/staff-control"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Открыть staff-control
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className={[
              "rounded-lg border p-3",
              riskClass(card.tone),
            ].join(" ")}
          >
            <p className="text-xs font-bold uppercase opacity-80">{card.label}</p>
            <p className="mt-2 text-xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs opacity-80">{card.caption}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {anomalies.length > 0 ? (
          anomalies.map((anomaly) => (
            <article
              key={anomaly.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{anomaly.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {anomaly.store?.name ?? "вся сеть"}
                    {anomaly.operatorLabel ? ` · ${anomaly.operatorLabel}` : ""}
                  </p>
                </div>
                <RiskPill level={anomaly.severity} />
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                {formatNumber(anomaly.count)} сигналов
                {anomaly.amount !== null ? ` · ${formatRubles(anomaly.amount)}` : ""}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {anomaly.detail}
              </p>
              <DrilldownActions
                actions={resolveDrilldownActions(
                  anomaly.actions,
                  anomaly.href,
                )}
              />
            </article>
          ))
        ) : (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyState text="Сменных кассовых аномалий по выбранному периоду нет." />
          </div>
        )}
      </div>
    </section>
  );
}

function RatingPanel({
  title,
  rows,
}: {
  title: string;
  rows: StaffOperationsRating[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Компактный список: место, индекс и ключевой сигнал.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          лучшие сверху
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <RatingRow key={row.id} row={row} rank={index + 1} />
          ))
        ) : (
          <EmptyState text="Нет задач, чек-листов или рисков за выбранный период." />
        )}
      </div>
    </section>
  );
}

function EmployeeRatingPanel({ rows }: { rows: StaffOperationsEmployeeRating[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Рейтинг сотрудников</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Компактный список: сильные сверху, детали по клику.
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          исполнение + обучение
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <EmployeeRatingRow key={row.id} row={row} rank={index + 1} />
          ))
        ) : (
          <EmptyState text="Нет сотрудников или операционных фактов по фильтрам." />
        )}
      </div>
    </section>
  );
}

function RatingRow({
  row,
  rank,
}: {
  row: StaffOperationsRating;
  rank: number;
}) {
  const href = row.href ?? `/staff/operations-dashboard?storeId=${row.id}`;
  const content = (
    <div className="grid gap-3 sm:grid-cols-[48px_1fr_auto] sm:items-center">
      <RankBadge rank={rank} />
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-semibold">{row.label}</p>
        {row.caption ? (
          <p className="truncate text-xs text-zinc-500">{row.caption}</p>
        ) : null}
        <CompactSignals row={row} />
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <ScoreChip score={row.score} level={row.riskLevel} />
        <span className="inline-flex h-8 items-center rounded-full border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition group-hover:border-emerald-400 group-hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:group-hover:border-emerald-500 dark:group-hover:text-emerald-200">
          Открыть разбор
        </span>
      </div>
    </div>
  );

  return (
    <Link
      href={href}
      className="group block rounded-lg border border-zinc-200 px-3 py-2.5 transition hover:border-emerald-400 hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
    >
      {content}
    </Link>
  );
}

function EmployeeRatingRow({
  row,
  rank,
}: {
  row: StaffOperationsEmployeeRating;
  rank: number;
}) {
  const href = row.href ?? `/staff/operations-dashboard?userId=${row.id}`;
  const readinessText = row.readinessStatus
    ? `${readinessLabels[row.readinessStatus]} · ${row.readinessPercent ?? 0}%`
    : null;

  return (
    <Link
      href={href}
      className="group block rounded-lg border border-zinc-200 px-3 py-2.5 transition hover:border-emerald-400 hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
    >
      <div className="grid gap-3 sm:grid-cols-[48px_1fr_auto] sm:items-center">
        <RankBadge rank={rank} />
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold">{row.label}</p>
          {row.caption ? (
            <p className="truncate text-xs text-zinc-500">{row.caption}</p>
          ) : null}
          <CompactSignals
            row={row}
            suffix={[
              readinessText ? `готовность ${readinessText}` : null,
              row.trainingBlockers > 0
                ? `блокеры обучения ${row.trainingBlockers}`
                : null,
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <ScoreChip score={row.score} level={row.riskLevel} />
          <span className="inline-flex h-8 items-center rounded-full border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition group-hover:border-emerald-400 group-hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:group-hover:border-emerald-500 dark:group-hover:text-emerald-200">
            Детализация
          </span>
        </div>
      </div>
    </Link>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      {rank}
    </div>
  );
}

function CompactSignals({
  row,
  suffix = [],
}: {
  row: StaffOperationsRating;
  suffix?: Array<string | null>;
}) {
  const signals = [
    { label: "проср.", value: row.overdue },
    { label: "проверка", value: row.unchecked },
    { label: "провалы", value: row.failedItems },
    { label: "возвраты", value: row.returned },
    { label: "повторы", value: row.repeatedIssues },
  ] as const;
  const visibleSignals = signals
    .filter((signal) => signal.value > 0)
    .map((signal) => `${signal.label} ${formatNumber(signal.value)}`);
  const textParts = [
    ...visibleSignals,
    ...suffix.filter((value): value is string => Boolean(value)),
  ].slice(0, 3);

  if (textParts.length === 0) {
    return (
      <p className="truncate text-xs text-emerald-700 dark:text-emerald-300">
        без критичных сигналов
      </p>
    );
  }

  return (
    <p className="truncate text-xs text-zinc-500">{textParts.join(" · ")}</p>
  );
}

function ScoreChip({
  score,
  level,
}: {
  score: number;
  level: StaffOperationsRiskLevel;
}) {
  return (
    <span
      className={[
        "inline-flex h-8 min-w-16 items-center justify-center rounded-full border px-3 text-sm font-bold",
        riskClass(level),
      ].join(" ")}
    >
      {score}%
    </span>
  );
}

function RecurringIssuesPanel({
  issues,
}: {
  issues: StaffOperationsRecurringIssue[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Повторяющиеся проблемы</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          По чеклистам
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {issues.length > 0 ? (
          issues.map((issue) => (
            <Link
              key={issue.id}
              href={issue.href}
              className="block rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{issue.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {issue.scopeLabel}
                  </p>
                </div>
                <RiskPill level={issue.riskLevel} />
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {issue.occurrences} повторов в {issue.failedRuns} выполнениях,
                последний раз {formatDate(issue.lastSeen)}.
              </p>
            </Link>
          ))
        ) : (
          <EmptyState text="Повторяющихся провалов по чеклистам не найдено." />
        )}
      </div>
    </section>
  );
}

function LatestRisksPanel({ risks }: { risks: StaffOperationsRiskItem[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Что разобрать сейчас</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          По приоритету
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {risks.length > 0 ? (
          risks.map((risk) => (
            <article
              key={risk.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{risk.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {riskKindLabels[risk.kind]} ·{" "}
                    {risk.store?.name ?? "вся сеть"} ·{" "}
                    {risk.user?.fullName ?? risk.user?.email ?? "не назначен"}
                  </p>
                </div>
                <RiskPill level={risk.severity} />
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {risk.detail} · {formatDate(risk.date)}
              </p>
              <DrilldownActions
                actions={resolveDrilldownActions(risk.actions, risk.href)}
              />
            </article>
          ))
        ) : (
          <EmptyState text="Критичных задач и чеклистов по фильтрам нет." />
        )}
      </div>
    </section>
  );
}

function DrilldownActions({
  actions,
}: {
  actions: StaffOperationsDrilldownAction[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={`${action.label}:${action.href}`}
          href={action.href}
          className="inline-flex h-8 items-center rounded-full border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-100"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function RiskPill({ level }: { level: StaffOperationsRiskLevel }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase",
        riskClass(level),
      ].join(" ")}
    >
      {riskLabels[level]}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
      {text}
    </div>
  );
}
