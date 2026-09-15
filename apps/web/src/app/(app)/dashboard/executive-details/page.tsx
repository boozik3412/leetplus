import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { requireTenantWorkspaceUser } from "@/lib/auth";
import {
  getExecutiveSummary,
  type ExecutiveDetailMetricKey,
  type ExecutiveMetric,
  type ExecutiveQuery,
} from "@/lib/dashboard-executive";
import { dashboardWorkspaceHref, getDefaultLandingPath } from "@/lib/landing";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const metricKeys = new Set<ExecutiveDetailMetricKey>([
  "averageProductCheck",
  "revenue",
  "serviceRevenue",
  "topups",
  "visits",
  "revenuePerVisit",
  "load",
  "productRevenue",
  "productRevenueShare",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function values(value: string | string[] | undefined) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function render(value: number | null, unit: string) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: unit === "PERCENT" ? 1 : 0,
  }).format(value);
  return unit === "RUB" || unit === "RUB_PER_VISIT"
    ? `${formatted} ₽`
    : unit === "PERCENT"
      ? `${formatted}%`
      : formatted;
}

function renderRatioOperand(
  metricKey: ExecutiveDetailMetricKey,
  value: number | null,
  side: "numerator" | "denominator",
) {
  if (value === null) return "—";
  if (metricKey === "revenuePerVisit" || metricKey === "averageProductCheck") {
    return side === "numerator" ? render(value, "RUB") : render(value, "COUNT");
  }
  if (metricKey === "productRevenueShare") return render(value, "RUB");
  if (metricKey === "load") {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} ч`;
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function evidence(metric: ExecutiveMetric) {
  const state = {
    AVAILABLE: "Подтверждено",
    PARTIAL: "Частично подтверждено",
    MISSING: "Нет данных",
    STALE: "Данные устарели",
    FAILED: "Источник недоступен",
  }[metric.state];
  const coverage = metric.coverage
    ? metric.coverage.total === null
      ? `Подтверждено ${metric.coverage.covered}`
      : `Покрытие ${metric.coverage.covered}/${metric.coverage.total}`
    : null;
  return [
    state,
    metric.reason,
    coverage,
    metric.factAsOf ? `Факты на ${metric.factAsOf.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function ExecutiveDetailsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await requireTenantWorkspaceUser();
  const landingPath = getDefaultLandingPath(user);
  if (landingPath !== dashboardWorkspaceHref) redirect(landingPath);
  const candidate = first(params.metric);
  const metricKey: ExecutiveDetailMetricKey =
    candidate && metricKeys.has(candidate as ExecutiveDetailMetricKey)
      ? (candidate as ExecutiveDetailMetricKey)
      : "revenue";
  const query: ExecutiveQuery = {
    period: first(params.period) ?? "custom",
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    storeIds: values(params.storeIds),
    asOf: first(params.asOf),
    comparison: first(params.comparison) !== "false",
  };
  const summary = await getExecutiveSummary(query);
  const metric = summary.metrics[metricKey];
  if (!metric)
    return (
      <main className="p-6">
        <Link href="/dashboard">Вернуться к сводке</Link>
        <h1 className="mt-5 text-2xl font-semibold">
          Средний товарный чек пока недоступен
        </h1>
        <p className="mt-3">
          Источник ещё не передаёт подтверждённые данные о чеках.
        </p>
      </main>
    );
  const back = new URLSearchParams({
    period: "custom",
    dateFrom: summary.scope.period.from,
    dateTo: summary.scope.period.to,
    asOf: summary.scope.asOf,
    comparison: String(query.comparison ?? true),
  });
  summary.scope.storeIds.forEach((storeId) => back.append("storeIds", storeId));
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/dashboard?${back}`}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться к сводке
        </Link>
        <header className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Детализация · агрегаты по клубам и дням
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {metric.definition}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Выборка: {summary.scope.period.from}–{summary.scope.period.to};{" "}
            {summary.scope.storeIds.length} клубов. Это не список отдельных
            чеков или сессий.
          </p>
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
            Детализация повторно прочитана для сохранённых параметров. Она может
            отличаться от исходной карточки, если сохранённые факты изменились
            после её открытия.
          </p>
          <p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums">
            {render(metric.value, metric.unit)}
          </p>
          {metric.ratio ? (
            <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
              Основания: {metric.ratio.numeratorLabel} —{" "}
              {renderRatioOperand(
                metricKey,
                metric.ratio.numeratorValue,
                "numerator",
              )}
              ; {metric.ratio.denominatorLabel} —{" "}
              {renderRatioOperand(
                metricKey,
                metric.ratio.denominatorValue,
                "denominator",
              )}
              .
              {metric.ratio.compatible
                ? ""
                : " Основания несовместимы, отношение не рассчитано."}
            </p>
          ) : null}
          {metric.reason ? (
            <p className="mt-3 text-sm leading-6 text-amber-900 dark:text-amber-100">
              {metric.reason}
            </p>
          ) : null}
          {metric.receiptEvidence ? (
            <div className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              <p>
                Чеков с однозначным идентификатором:{" "}
                {metric.receiptEvidence.receiptCount ?? "—"}. Операций с
                подтверждённым чеком:{" "}
                {metric.receiptEvidence.operations.covered} из{" "}
                {metric.receiptEvidence.operations.total}.
              </p>
              <p>
                Выручка подтверждённых чеков:{" "}
                {render(metric.receiptEvidence.revenue.covered, "RUB")} из{" "}
                {render(metric.receiptEvidence.revenue.total, "RUB")}.
                Неоднозначных идентификаторов:{" "}
                {metric.receiptEvidence.ambiguousIdentityCount}.
              </p>
              <p>
                Средний чек периода считается по всем подтверждённым чекам, а не
                как среднее дневных средних.
              </p>
            </div>
          ) : null}
        </header>
        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <DetailTable
            title="По клубам"
            rows={summary.clubs.map((club) => ({
              label: club.storeName,
              metric: club.metrics[metricKey],
            }))}
          />
          <DetailTable
            title="По дням"
            rows={summary.days.map((row) => ({
              label: row.date,
              metric: row.metrics[metricKey],
            }))}
          />
        </section>
      </div>
    </main>
  );
}

function DetailTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    metric: ExecutiveMetric | undefined;
  }>;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="pb-3">Группа</th>
              <th className="pb-3 text-right">Значение</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-t border-[var(--border-soft)]"
              >
                <td className="py-3">
                  <span className="font-medium">{row.label}</span>
                  {row.metric?.reason ? (
                    <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {row.metric.reason}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right font-semibold tabular-nums">
                  <span className="block">
                    {row.metric
                      ? render(row.metric.value, row.metric.unit)
                      : "—"}
                  </span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500 dark:text-zinc-400">
                    {row.metric
                      ? evidence(row.metric)
                      : "Источник пока не передаёт показатель"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
