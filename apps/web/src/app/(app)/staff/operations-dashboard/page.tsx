import Link from "next/link";
import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";
import {
  getStaffOperationsDashboard,
  type StaffOperationsDashboardFilters,
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

function resolveFilters(
  params: Awaited<SearchParams>,
): StaffOperationsDashboardFilters {
  return {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
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

function formatDate(value: string | null) {
  if (!value) {
    return "не указано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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

function scoreBarClass(level: StaffOperationsRiskLevel) {
  if (level === "HIGH") {
    return "bg-red-500";
  }

  if (level === "MEDIUM") {
    return "bg-amber-400";
  }

  return "bg-emerald-500";
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
  const summaryCards = [
    {
      label: "Индекс дисциплины",
      value: `${dashboard.summary.operationalScore}%`,
      tone: dashboard.summary.riskLevel,
    },
    { label: "В срок", value: dashboard.summary.doneOnTime, tone: "LOW" },
    { label: "Просрочено", value: dashboard.summary.overdue, tone: "HIGH" },
    { label: "На проверке", value: dashboard.summary.unchecked, tone: "MEDIUM" },
    { label: "Возвращено", value: dashboard.summary.returned, tone: "HIGH" },
    { label: "Эскалации", value: dashboard.summary.escalated, tone: "HIGH" },
    { label: "Повторы", value: dashboard.summary.recurringIssues, tone: "MEDIUM" },
  ] as const;

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
        />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={[
                "rounded-lg border bg-white p-4 dark:bg-zinc-950",
                riskClass(card.tone),
              ].join(" ")}
            >
              <p className="text-xs font-bold uppercase opacity-80">
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
            <Link
              key={anomaly.id}
              href={anomaly.href}
              className="rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
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
            </Link>
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Слабые сверху
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => <RatingRow key={row.id} row={row} />)
        ) : (
          <EmptyState text="Нет задач, чеклистов или рисков за выбранный период." />
        )}
      </div>
    </section>
  );
}

function EmployeeRatingPanel({ rows }: { rows: StaffOperationsEmployeeRating[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Рейтинг сотрудников</h2>
        <span className="text-xs font-semibold uppercase text-zinc-500">
          Исполнение + обучение
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => <EmployeeRatingRow key={row.id} row={row} />)
        ) : (
          <EmptyState text="Нет сотрудников или операционных фактов по фильтрам." />
        )}
      </div>
    </section>
  );
}

function RatingRow({ row }: { row: StaffOperationsRating }) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.label}</p>
          {row.caption ? (
            <p className="mt-1 text-xs text-zinc-500">{row.caption}</p>
          ) : null}
        </div>
        <RiskPill level={row.riskLevel} />
      </div>
      <ScoreLine score={row.score} level={row.riskLevel} />
      <MetricsLine row={row} />
    </>
  );

  if (row.href) {
    return (
      <Link
        href={row.href}
        className="block rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      {content}
    </div>
  );
}

function EmployeeRatingRow({ row }: { row: StaffOperationsEmployeeRating }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.label}</p>
          {row.caption ? (
            <p className="mt-1 text-xs text-zinc-500">{row.caption}</p>
          ) : null}
        </div>
        <RiskPill level={row.riskLevel} />
      </div>
      <ScoreLine score={row.score} level={row.riskLevel} />
      <MetricsLine row={row} />
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          Готовность:{" "}
          {row.readinessStatus
            ? `${readinessLabels[row.readinessStatus]} · ${row.readinessPercent ?? 0}%`
            : "нет данных"}
        </span>
        {row.trainingBlockers > 0 ? (
          <span className="rounded-full bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/15 dark:text-red-200">
            Блокеров обучения: {row.trainingBlockers}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ScoreLine({
  score,
  level,
}: {
  score: number;
  level: StaffOperationsRiskLevel;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Индекс</span>
        <span>{score}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div
          className={["h-full rounded-full", scoreBarClass(level)].join(" ")}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function MetricsLine({ row }: { row: StaffOperationsRating }) {
  const items = [
    ["В срок", row.doneOnTime],
    ["Проср.", row.overdue],
    ["Провалено", row.failedItems],
    ["Возврат", row.returned],
    ["Эскал.", row.escalated],
    ["Проверка", row.unchecked],
    ["Повтор", row.repeatedIssues],
  ] as const;

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-7">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/70"
        >
          <span className="block text-zinc-500">{label}</span>
          <span className="font-semibold">{formatNumber(value)}</span>
        </div>
      ))}
    </div>
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
            <Link
              key={risk.id}
              href={risk.href}
              className="block rounded-lg border border-zinc-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-zinc-800 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-500/10"
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
            </Link>
          ))
        ) : (
          <EmptyState text="Критичных задач и чеклистов по фильтрам нет." />
        )}
      </div>
    </section>
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
