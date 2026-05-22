import Link from "next/link";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import {
  getDashboardRevenueDiagnostics,
  type DashboardRevenueDiagnosticsRow,
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
  skuGrouping: "club" | "network";
}) {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  params.set("skuGrouping", filters.skuGrouping);

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

export default async function DashboardRevenueDiagnosticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requireCurrentUser();

  const filters = {
    period: searchParam(params.period) ?? "day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
    skuGrouping:
      searchParam(params.skuGrouping) === "club" ? "club" : "network",
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
            skuGrouping={filters.skuGrouping}
            stores={stores}
            selectedStoreIds={report.selectedStoreIds}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
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
        </section>

        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">{report.interpretation.mobileTopupRule}</p>
          <p className="mt-2">{report.interpretation.primaryRecommendation}</p>
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
        <Metric title="Operation plus" value={formatRubles(row.operationPlusAmount)} caption={`${formatMoney(row.operationPlusCount)} операций`} />
        <Metric title="Operation minus" value={formatRubles(row.operationMinusAmount)} caption={`${formatMoney(row.operationMinusCount)} операций`} />
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
