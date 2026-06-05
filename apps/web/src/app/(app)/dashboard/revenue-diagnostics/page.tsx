import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getDashboardRevenueDiagnostics,
  type DashboardRevenueDiagnosticsRow,
  type DashboardRevenueDiagnosticsScenario,
  type DashboardRevenueDiagnosticsSourceMetric,
  type DashboardRevenueDiagnosticsTypeBreakdown,
} from "@/lib/dashboard-summary";
import { getStores } from "@/lib/stores";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatMoney(value)} руб`;
}

function formatNullableRubles(value: number | null) {
  return value === null ? "не применяется" : formatRubles(value);
}

function formatNullableCount(value: number | null) {
  return value === null ? "—" : formatMoney(value);
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPeriod(from: string, to: string) {
  return from === to
    ? formatPeriodDate(from)
    : `${formatPeriodDate(from)} - ${formatPeriodDate(to)}`;
}

function dashboardHref(filters: {
  period: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds: readonly string[];
}) {
  const params = new URLSearchParams();
  params.set("period", filters.period);

  if (filters.period === "custom") {
    if (filters.dateFrom) {
      params.set("dateFrom", filters.dateFrom);
    }

    if (filters.dateTo) {
      params.set("dateTo", filters.dateTo);
    }
  }

  filters.storeIds.forEach((storeId) => params.append("storeIds", storeId));

  const query = params.toString();
  return `/dashboard${query ? `?${query}` : ""}`;
}

function diagnosticsCanonicalHref(params: {
  period?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  storeIds?: string | string[];
}) {
  const canonicalParams = new URLSearchParams();
  const period = searchParam(params.period);

  if (period) {
    canonicalParams.set("period", period);
  }

  if (period === "custom") {
    const dateFrom = searchParam(params.dateFrom);
    const dateTo = searchParam(params.dateTo);

    if (dateFrom) {
      canonicalParams.set("dateFrom", dateFrom);
    }

    if (dateTo) {
      canonicalParams.set("dateTo", dateTo);
    }
  }

  searchParamsArray(params.storeIds).forEach((storeId) => {
    canonicalParams.append("storeIds", storeId);
  });

  const query = canonicalParams.toString();

  return `/dashboard/revenue-diagnostics${query ? `?${query}` : ""}`;
}

export default async function DashboardRevenueDiagnosticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (params.skuGrouping !== undefined) {
    redirect(diagnosticsCanonicalHref(params));
  }

  await requireCurrentUser();

  const filters = {
    period: searchParam(params.period) ?? "full-day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
  } as const;
  const [report, stores] = await Promise.all([
    getDashboardRevenueDiagnostics(filters),
    getStores(),
  ]);
  const backHref = dashboardHref({
    ...filters,
    dateFrom: report.periodFrom,
    dateTo: report.periodTo,
  });

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Сверка выручки"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-500">
              Диагностика источников
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Сверка выручки по клубам
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Сравниваем товары/бар, финансовые операции Langame, транзакции
              баланса, сессии гостей и смены за период{" "}
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                {formatPeriod(report.periodFrom, report.periodTo)}
              </span>
              . Мобильные пополнения не считаем выручкой клуба: клубный
              кандидат строится вокруг списаний баланса внутри клуба.
            </p>
          </div>
          <Link
            href={backHref}
            className="rounded-lg border border-zinc-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Назад в дашборд
          </Link>
        </div>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <DashboardFilters
            period={filters.period}
            dateFrom={report.periodFrom}
            dateTo={report.periodTo}
            stores={stores}
            selectedStoreIds={report.selectedStoreIds}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          <DiagnosticSummaryCard
            title="Товары и бар"
            value={formatRubles(report.totals.productRevenue)}
            caption={`${formatMoney(report.totals.productSalesCount)} продаж, ${formatMoney(report.totals.productGuests)} гостей в продажах`}
          />
          <DiagnosticSummaryCard
            title="Списания баланса"
            value={formatRubles(report.totals.balanceSpendRevenueCandidate)}
            caption="кандидат на клубную выручку без мобильных пополнений"
          />
          <DiagnosticSummaryCard
            title="Смены"
            value={formatRubles(report.totals.shiftRevenueCandidate)}
            caption={`${formatMoney(report.totals.shiftsCount)} смен, возвраты ${formatRubles(report.totals.shiftRefundAmount)}`}
          />
          <DiagnosticSummaryCard
            title="Онлайн-пополнения"
            value={formatRubles(report.unallocatedTopups.amount)}
            caption={`${formatMoney(report.unallocatedTopups.count)} операций без привязки к клубу`}
          />
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                Варианты суммы
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Какие суммы можно получить из Langame за период
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Сводная выручка строится не из одного endpoint. Ниже показаны
                разные денежные срезы, их формулы и правило включения в KPI сети
                или клубов.
              </p>
            </div>
            <p className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {formatPeriod(report.periodFrom, report.periodTo)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.revenueScenarios.map((scenario) => (
              <RevenueScenarioCard key={scenario.key} scenario={scenario} />
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Источники и правило включения
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Один и тот же денежный поток может быть выручкой, кассовой сверкой
              или остатком на балансе. Здесь видно, как LeetPlus трактует каждый
              источник до включения в бизнес-расчеты.
            </p>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            {report.sourceMetrics.map((source) => (
              <RevenueSourceRow key={source.key} source={source} />
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">{report.interpretation.mobileTopupRule}</p>
          <p className="mt-2">{report.interpretation.primaryRecommendation}</p>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Нераспределенные онлайн-пополнения
              </p>
              <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
                Это сетевой денежный поток без надежной привязки к клубу. Он
                входит в общую выручку сети, но не должен попадать в выручку
                отдельного клуба.
              </p>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {formatRubles(report.unallocatedTopups.amount)}
            </p>
          </div>
          <div className="mt-4">
            <TypeBreakdown
              title="Каналы и формы пополнений"
              items={report.unallocatedTopups.breakdown}
            />
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          {report.rows.map((row) => (
            <RevenueDiagnosticsCard key={row.storeId} row={row} />
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Ограничения данных</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {report.interpretation.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function DiagnosticSummaryCard({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{caption}</p>
    </article>
  );
}

function RevenueScenarioCard({
  scenario,
}: {
  scenario: DashboardRevenueDiagnosticsScenario;
}) {
  return (
    <article
      className={[
        "rounded-lg border p-4",
        scenario.recommendation === "PRIMARY"
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/20"
          : scenario.recommendation === "CHECK"
            ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20"
            : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {scenario.title}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {scenario.formula}
          </p>
        </div>
        <span className={scenarioBadgeClass(scenario.recommendation)}>
          {scenarioRecommendationLabel(scenario.recommendation)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">
        {formatRubles(scenario.amount)}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {scenario.description}
      </p>
      <div className="mt-3 grid gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          <span className="font-semibold text-zinc-700 dark:text-zinc-200">
            Входит:
          </span>{" "}
          {scenario.includes.join(", ")}
        </p>
        <p>
          <span className="font-semibold text-zinc-700 dark:text-zinc-200">
            Не входит:
          </span>{" "}
          {scenario.excludes.join(", ")}
        </p>
      </div>
    </article>
  );
}

function RevenueSourceRow({
  source,
}: {
  source: DashboardRevenueDiagnosticsSourceMetric;
}) {
  return (
    <div className="grid gap-3 border-b border-zinc-200 px-4 py-3 text-sm last:border-b-0 dark:border-zinc-800 lg:grid-cols-[1.2fr_1fr_auto_auto_1.4fr] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-zinc-950 dark:text-zinc-50">
            {source.title}
          </p>
          <span className={sourceRoleBadgeClass(source.role)}>
            {sourceRoleLabel(source.role)}
          </span>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {source.endpoint}
        </p>
      </div>
      <p className="text-zinc-600 dark:text-zinc-300">{source.note}</p>
      <div className="tabular-nums">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Сумма</p>
        <p className="font-semibold">{formatNullableRubles(source.amount)}</p>
      </div>
      <div className="tabular-nums">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Кол-во</p>
        <p className="font-semibold">{formatNullableCount(source.count)}</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <span
          className={
            source.includedInNetworkRevenue
              ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }
        >
          {source.includedInNetworkRevenue ? "в KPI сети" : "не в KPI сети"}
        </span>
        <span
          className={
            source.includedInClubRevenue
              ? "rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
              : "rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }
        >
          {source.includedInClubRevenue ? "в KPI клуба" : "не в KPI клуба"}
        </span>
      </div>
    </div>
  );
}

function RevenueDiagnosticsCard({
  row,
}: {
  row: DashboardRevenueDiagnosticsRow;
}) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{row.storeName}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Гости: {formatMoney(row.activeGuests)}, сессии:{" "}
              {formatMoney(row.sessionsCount)}, смены:{" "}
              {formatMoney(row.shiftsCount)}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Кандидат выручки клуба
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatRubles(row.balanceSpendRevenueCandidate)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Товары и бар" value={formatRubles(row.productRevenue)} caption={`${formatMoney(row.productSalesCount)} продаж`} />
        <Metric title="Пополнения в клубе" value={formatRubles(row.operationPlusAmount)} caption={`${formatMoney(row.operationPlusCount)} операций`} />
        <Metric title="Списания баланса" value={formatRubles(row.balanceSpendRevenueCandidate)} caption={`operation ${formatRubles(row.operationMinusAmount)}, transactions ${formatRubles(row.transactionSpendAmount)}`} />
        <Metric title="Смены" value={formatRubles(row.shiftRevenueCandidate)} caption={`возвраты ${formatRubles(row.shiftRefundAmount)}`} />
      </div>

      <div className="grid gap-4 border-t border-zinc-200 p-5 dark:border-zinc-800 lg:grid-cols-2">
        <TypeBreakdown title="Типы operation log" items={row.operationTypes} />
        <TypeBreakdown title="Типы transactions" items={row.transactionTypes} />
      </div>

      {row.notes.length > 0 ? (
        <div className="border-t border-zinc-200 p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <p className="font-semibold text-zinc-950 dark:text-zinc-100">
            Что проверить
          </p>
          <ul className="mt-2 space-y-1">
            {row.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function Metric({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{caption}</p>
    </div>
  );
}

function TypeBreakdown({
  title,
  items,
}: {
  title: string;
  items: DashboardRevenueDiagnosticsTypeBreakdown[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Нет данных
        </p>
      ) : (
        <div className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.slice(0, 6).map((item) => (
            <div
              key={item.type}
              className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-sm"
            >
              <span className="font-medium">{item.type}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {formatMoney(item.count)}
              </span>
              <span className="tabular-nums">{formatRubles(item.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function scenarioRecommendationLabel(
  recommendation: DashboardRevenueDiagnosticsScenario["recommendation"],
) {
  if (recommendation === "PRIMARY") {
    return "KPI";
  }

  if (recommendation === "CHECK") {
    return "сверка";
  }

  return "не выручка";
}

function scenarioBadgeClass(
  recommendation: DashboardRevenueDiagnosticsScenario["recommendation"],
) {
  const base = "rounded-full px-2.5 py-1 text-xs font-semibold";

  if (recommendation === "PRIMARY") {
    return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100`;
  }

  if (recommendation === "CHECK") {
    return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100`;
  }

  return `${base} bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`;
}

function sourceRoleLabel(
  role: DashboardRevenueDiagnosticsSourceMetric["role"],
) {
  if (role === "PRIMARY") {
    return "основной";
  }

  if (role === "CONTROL") {
    return "контроль";
  }

  return "исключить";
}

function sourceRoleBadgeClass(
  role: DashboardRevenueDiagnosticsSourceMetric["role"],
) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (role === "PRIMARY") {
    return `${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200`;
  }

  if (role === "CONTROL") {
    return `${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200`;
  }

  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
}
