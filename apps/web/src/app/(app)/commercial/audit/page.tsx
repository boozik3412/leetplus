import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { buildAssortmentRiskSummary } from "@/lib/assortment-risk";
import { ReportLoadingLink } from "@/components/report-loading-link";
import { getDefaultLandingPath } from "@/lib/landing";
import { can } from "@/lib/permissions";
import {
  getAssortmentMatrixReport,
  getAssortmentReport,
  getInventoryTurnoverReport,
  getOperationalReport,
  type ReportRecommendation,
} from "@/lib/reports";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function lastFullDaysRange(days: number) {
  const now = new Date();
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} руб`;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "нет данных";
  }

  return `${formatNumber(value, 1)}%`;
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function differenceInDays(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  return Math.max(
    1,
    Math.round((toDate.getTime() - fromDate.getTime()) / DAY_IN_MS) + 1,
  );
}

function isActiveRecommendation(recommendation: ReportRecommendation) {
  return (
    recommendation.status !== "DONE" &&
    recommendation.status !== "HIDDEN" &&
    recommendation.status !== "REJECTED"
  );
}

function reportHref(path: string, filters: { from: string; to: string }) {
  const params = new URLSearchParams(filters);

  return `${path}?${params.toString()}`;
}

export default async function CommercialAuditPage() {
  const user = await requireCurrentUser();

  if (!can(user, "view_reports")) {
    redirect(getDefaultLandingPath(user));
  }

  const filters = lastFullDaysRange(14);
  const [assortmentReport, operationalReport, matrixReport, turnoverReport] =
    await Promise.all([
      getAssortmentReport(),
      getOperationalReport(filters),
      getAssortmentMatrixReport(filters),
      getInventoryTurnoverReport(filters),
    ]);

  const assortmentRisk = buildAssortmentRiskSummary({
    oosRows: operationalReport.outOfStockRiskProducts,
    noSalesRows: operationalReport.productsWithoutSales,
  });
  const activeRecommendations = operationalReport.recommendations
    .filter(isActiveRecommendation)
    .sort((a, b) => b.effectAmount - a.effectAmount);
  const expectedEffect = activeRecommendations
    .slice(0, 10)
    .reduce((total, item) => total + item.effectAmount, 0);
  const activeSkuShare =
    assortmentReport.totalSku > 0
      ? (assortmentReport.activeSku / assortmentReport.totalSku) * 100
      : null;
  const periodDays = differenceInDays(filters.from, filters.to);
  const topRiskRows = assortmentRisk.rows.slice(0, 5);
  const topRecommendations = activeRecommendations.slice(0, 5);
  const qualityIndex = matrixReport.summary.qualityIndex;

  return (
    <main className="min-h-full bg-zinc-50 px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <ReportBreadcrumbs
          current="Коммерческий аудит"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/commercial/audit", label: "Управление" },
          ]}
        />

        <section className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Этап 6
            </p>
            <h1 className="text-3xl font-black tracking-normal text-zinc-950 dark:text-white sm:text-4xl">
              Коммерческий аудит сети
            </h1>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-300">
              Сводка показывает, где сейчас лежат деньги: дефицит,
              замороженный остаток, потенциал действий и качество
              ассортиментной матрицы.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            Период:{" "}
            <span className="font-semibold text-zinc-950 dark:text-white">
              {formatDateLabel(filters.from)} - {formatDateLabel(filters.to)}
            </span>{" "}
            ({periodDays} дн.)
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Деньги в риске"
            value={formatMoney(assortmentRisk.totalRiskAmount)}
            note={`${formatNumber(
              assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount,
            )} SKU требуют действия`}
            tone="rose"
          />
          <MetricCard
            label="Потенциал действий"
            value={formatMoney(expectedEffect)}
            note={`${formatNumber(
              activeRecommendations.length,
            )} активных рекомендаций`}
            tone="emerald"
          />
          <MetricCard
            label="Качество матрицы"
            value={formatPercent(qualityIndex)}
            note={`${formatNumber(
              matrixReport.summary.healthyCells,
            )} здоровых обязательных ячеек`}
            tone="sky"
          />
          <MetricCard
            label="Активный SKU"
            value={formatPercent(activeSkuShare)}
            note={`${formatNumber(assortmentReport.activeSku)} из ${formatNumber(
              assortmentReport.totalSku,
            )} SKU активны`}
            tone="amber"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <AuditPanel
            title="Потери"
            eyebrow="дефицит и замороженный сток"
            summary={`${formatMoney(
              assortmentRisk.oosProfitAtRisk,
            )} прибыли в риске и ${formatMoney(
              assortmentRisk.frozenStockAmount,
            )} в замороженном остатке.`}
            actionHref={reportHref("/reports/assortment-risk/table", filters)}
            actionLabel="Открыть отчет по рискам"
          >
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {topRiskRows.length > 0 ? (
                topRiskRows.map((row) => (
                  <div
                    key={`${row.riskType}-${row.storeName}-${row.name}`}
                    className="py-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                          {row.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {row.storeName} · {row.riskTypeLabel}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-rose-600 dark:text-rose-300">
                        {formatMoney(row.totalRiskAmount)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyLine text="Критичных потерь в выбранном периоде не найдено." />
              )}
            </div>
          </AuditPanel>

          <AuditPanel
            title="Возможности роста"
            eyebrow="действия с оценкой эффекта"
            summary={`Первые ${formatNumber(
              Math.min(topRecommendations.length, 5),
            )} действий дают ${formatMoney(
              topRecommendations.reduce(
                (total, item) => total + item.effectAmount,
                0,
              ),
            )} оцененного эффекта.`}
            actionHref={reportHref("/reports/recommendations/table", filters)}
            actionLabel="Открыть очередь действий"
          >
            <div className="space-y-3">
              {topRecommendations.length > 0 ? (
                topRecommendations.map((recommendation) => (
                  <RecommendationLine
                    key={recommendation.id}
                    recommendation={recommendation}
                  />
                ))
              ) : (
                <EmptyLine text="Активных рекомендаций нет." />
              )}
            </div>
          </AuditPanel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <AuditPanel
            title="Качество матрицы"
            eyebrow="обязательные SKU по клубам"
            summary={`${formatPercent(
              qualityIndex,
            )} - текущий индекс качества по сети.`}
            actionHref={reportHref("/reports/assortment-matrix/table", filters)}
            actionLabel="Открыть матрицу"
          >
            <CompactStats
              rows={[
                [
                  "Здоровые ячейки",
                  formatNumber(matrixReport.summary.healthyCells),
                ],
                ["Нет остатка", formatNumber(matrixReport.summary.noStockCells)],
                ["Не заведено", formatNumber(matrixReport.summary.missingCells)],
              ]}
            />
          </AuditPanel>

          <AuditPanel
            title="Оборачиваемость"
            eyebrow="запас и медленные SKU"
            summary={`${formatMoney(
              turnoverReport.totalFrozenStockAmount,
            )} денег лежит в замороженных позициях.`}
            actionHref={reportHref("/reports/inventory-turnover/table", filters)}
            actionLabel="Проверить оборачиваемость"
          >
            <CompactStats
              rows={[
                ["Медленные SKU", formatNumber(turnoverReport.slowSkuCount)],
                [
                  "Замороженные SKU",
                  formatNumber(turnoverReport.frozenSkuCount),
                ],
                [
                  "Средний запас",
                  turnoverReport.averageStockDays === null
                    ? "нет данных"
                    : `${formatNumber(turnoverReport.averageStockDays, 1)} дн.`,
                ],
              ]}
            />
          </AuditPanel>

          <AuditPanel
            title="Вывод для продажи"
            eyebrow="что показать в демо"
            summary="Эта страница - основа коммерческой демо-витрины: она переводит отчеты в деньги и действия."
            actionHref="/reports"
            actionLabel="Перейти к отчетам"
          >
            <CompactStats
              rows={[
                [
                  "Выручка за период",
                  formatMoney(operationalReport.totalRevenue),
                ],
                [
                  "Валовая прибыль",
                  formatMoney(operationalReport.grossProfit),
                ],
                ["Маржа", formatPercent(operationalReport.marginPercent)],
              ]}
            />
          </AuditPanel>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "rose" | "emerald" | "sky" | "amber";
}) {
  const toneClass = {
    rose: "text-rose-600 dark:text-rose-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
    sky: "text-sky-600 dark:text-sky-300",
    amber: "text-amber-600 dark:text-amber-300",
  }[tone];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-black tracking-normal ${toneClass}`}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {note}
      </p>
    </div>
  );
}

function AuditPanel({
  title,
  eyebrow,
  summary,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  eyebrow: string;
  summary: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[20rem] flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
          {eyebrow}
        </p>
        <h2 className="text-xl font-black tracking-normal text-zinc-950 dark:text-white">
          {title}
        </h2>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {summary}
        </p>
      </div>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
      <ReportLoadingLink
        href={actionHref}
        className="mt-5 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
      >
        {actionLabel}
      </ReportLoadingLink>
    </section>
  );
}

function RecommendationLine({
  recommendation,
}: {
  recommendation: ReportRecommendation;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
            {recommendation.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {recommendation.storeName ?? "Вся сеть"} ·{" "}
            {recommendation.effectLabel}
          </p>
        </div>
        <p className="shrink-0 text-sm font-bold text-emerald-600 dark:text-emerald-300">
          {formatMoney(recommendation.effectAmount)}
        </p>
      </div>
    </div>
  );
}

function CompactStats({ rows }: { rows: [string, string][] }) {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 py-3"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{label}</p>
          <p className="text-right text-sm font-bold text-zinc-950 dark:text-white">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700">
      {text}
    </p>
  );
}
