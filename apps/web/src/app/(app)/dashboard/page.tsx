import {
  getDashboardSummary,
  type DashboardSalesTrendSegment,
  type DashboardTopSku,
} from "@/lib/dashboard-summary";
import { buildAssortmentRiskSummary } from "@/lib/assortment-risk";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardAutoSync } from "@/components/dashboard-auto-sync";
import { DashboardQuickSyncButton } from "@/components/dashboard-quick-sync-button";
import { DashboardRevenuePanel } from "@/components/dashboard-revenue-panel";
import { RevenueTrendChart } from "@/components/revenue-trend-chart";
import { NoSalesTrendChart } from "@/components/no-sales-trend-chart";
import {
  CategoryEfficiencyChart,
  CategoryShareChart,
} from "@/components/category-analytics";
import {
  formatTrendPeriodLabel,
  formatTrendPeriodTitle,
} from "@/lib/trend-period-labels";
import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestCrmTaskReport,
  getGuestsSummary,
  getStaffControl,
  type GuestCrmTaskReport,
  type GuestsSummary,
  type StaffControlReport,
} from "@/lib/guests";
import { getOperationalReport } from "@/lib/reports";
import { getStores } from "@/lib/stores";
import Link from "next/link";

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

type DashboardRevenueView = "summary" | "stores";

type DashboardHrefFilters = {
  period: string;
  dateFrom?: string;
  dateTo?: string;
  storeIds: readonly string[];
  skuGrouping: "club" | "network";
};

function dashboardQuery(filters: DashboardHrefFilters) {
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

  params.set("skuGrouping", filters.skuGrouping);

  filters.storeIds.forEach((storeId) => {
    params.append("storeIds", storeId);
  });

  return params;
}

function dashboardRevenueByClubHref(filters: DashboardHrefFilters) {
  const params = dashboardQuery(filters);
  const query = params.toString();

  return `/dashboard/revenue-by-club${query ? `?${query}` : ""}`;
}

function dashboardRevenueDiagnosticsHref(filters: DashboardHrefFilters) {
  const params = dashboardQuery(filters);
  const query = params.toString();

  return `/dashboard/revenue-diagnostics${query ? `?${query}` : ""}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatMoney(value)} руб`;
}

function formatHours(value: number) {
  return `${formatQuantity(value)} ч`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRatioPercent(value: number | null) {
  return value === null ? "нет данных" : formatPercent(value);
}

function ratioPercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : null;
}

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

function formatDashboardPeriodLabel(from: string, to: string) {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);

  if (!fromDate || !toDate) {
    return `${from} - ${to}`;
  }

  if (
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth() &&
    fromDate.getUTCDate() === toDate.getUTCDate()
  ) {
    return formatFullDate(fromDate);
  }

  return `${formatFullDate(fromDate)} - ${formatFullDate(toDate)}`;
}

function formatFullDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

type BusinessSignalTone = "neutral" | "good" | "warning" | "danger";

type BusinessSignal = {
  title: string;
  value: string;
  description: string;
  actionLabel: string;
  href: string;
  tone?: BusinessSignalTone;
};

type BusinessSignalGroup = {
  title: string;
  subtitle: string;
  routeLabel: string;
  href: string;
  signals: BusinessSignal[];
};

function getLatestTrendSegment(rows: DashboardSalesTrendSegment[]) {
  return rows.at(-1) ?? null;
}

function getComparableTrendSegment(
  rows: DashboardSalesTrendSegment[],
  period: string,
) {
  if (period === "day") {
    return rows.at(-2) ?? null;
  }

  return getLatestTrendSegment(rows);
}

function dashboardScopedParams(
  summary: Awaited<ReturnType<typeof getDashboardSummary>>,
) {
  const params = new URLSearchParams({
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
  });

  if (summary.selectedStoreIds.length === 1) {
    params.set("storeId", summary.selectedStoreIds[0]);
  }

  return params;
}

function scopedHref(
  path: string,
  summary: Awaited<ReturnType<typeof getDashboardSummary>>,
  extra: Record<string, string | undefined> = {},
) {
  const params = dashboardScopedParams(summary);

  Object.entries(extra).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();

  return `${path}${query ? `?${query}` : ""}`;
}

function buildBusinessSignalGroups({
  summary,
  guestsSummary,
  crmTaskReport,
  staffControlReport,
  latestTrend,
  assortmentRiskAmount,
  assortmentRiskSkuCount,
  productRevenueShare,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  guestsSummary: GuestsSummary;
  crmTaskReport: GuestCrmTaskReport;
  staffControlReport: StaffControlReport;
  latestTrend: DashboardSalesTrendSegment | null;
  assortmentRiskAmount: number;
  assortmentRiskSkuCount: number;
  productRevenueShare: number | null;
}) {
  const guestMoney = guestsSummary.transactionAmount + guestsSummary.barRevenue;
  const barShare = ratioPercent(guestsSummary.barRevenue, guestMoney);
  const activeCrmTasks =
    crmTaskReport.summary.open + crmTaskReport.summary.inProgress;
  const staffAnomalyCount = staffControlReport.anomalies.reduce(
    (total, anomaly) => total + anomaly.count,
    0,
  );
  const refundSummary = staffControlReport.operationKindSummary.find(
    (row) => row.kind === "refunds",
  );
  const loadPercent = guestsSummary.loadPercent;
  const noSalesSkuCount = latestTrend?.noSalesSkuCount14 ?? 0;

  return [
    {
      title: "Клиентская база",
      subtitle: "Вернуть, развить и не потерять гостей.",
      routeLabel: "Открыть CRM",
      href: "/guests/crm",
      signals: [
        {
          title: "Гости в риске",
          value: `${formatQuantity(guestsSummary.riskGuests)} гостей`,
          description:
            guestsSummary.riskGuests > guestsSummary.newGuests
              ? `Риск выше притока: новых ${formatQuantity(guestsSummary.newGuests)}. Нужна реактивация.`
              : `Новых гостей ${formatQuantity(guestsSummary.newGuests)}, риск контролируемый.`,
          actionLabel: "Разобрать группу",
          href: scopedHref("/guests/report", summary, {
            segment: "risk",
            page: "1",
            pageSize: "50",
          }),
          tone:
            guestsSummary.riskGuests > guestsSummary.newGuests
              ? "warning"
              : "good",
        },
        {
          title: "CRM задачи",
          value:
            crmTaskReport.summary.overdue > 0
              ? `${formatQuantity(crmTaskReport.summary.overdue)} просрочено`
              : `${formatQuantity(activeCrmTasks)} в работе`,
          description:
            crmTaskReport.summary.overdue > 0
              ? "Есть контакты без своевременного follow-up."
              : "Просроченных задач нет, можно идти к плановым контактам.",
          actionLabel: "Открыть задачи",
          href: "/guests/crm/tasks?status=all&sort=dueAt&direction=asc",
          tone: crmTaskReport.summary.overdue > 0 ? "danger" : "good",
        },
      ],
    },
    {
      title: "Управление ассортиментом",
      subtitle: "Закупить, вывести, перераспределить или проверить SKU.",
      routeLabel: "Открыть дашборд",
      href: "/assortment/dashboard",
      signals: [
        {
          title: "OOS риск",
          value: `${formatQuantity(summary.outOfStockRiskCount)} SKU`,
          description:
            summary.outOfStockRiskCount > 0
              ? "Позиции могут потерять продажи из-за короткого запаса."
              : "Критичного OOS риска сейчас не видно.",
          actionLabel: "Закрыть риск",
          href: "/reports/oos/table",
          tone: summary.outOfStockRiskCount > 0 ? "danger" : "good",
        },
        {
          title: "Деньги в риске",
          value: formatRubles(assortmentRiskAmount),
          description: `${formatQuantity(assortmentRiskSkuCount)} SKU: OOS плюс замороженный остаток без продаж${
            noSalesSkuCount > 0
              ? `; ${formatQuantity(noSalesSkuCount)} SKU без продаж 14 дней.`
              : "."
          }`,
          actionLabel: "Открыть разбор",
          href: "/reports/assortment-risk/table",
          tone: assortmentRiskAmount > 0 ? "danger" : "good",
        },
      ],
    },
    {
      title: "Маркетинг",
      subtitle: "Выбрать цель, группу, механику и канал.",
      routeLabel: "Подготовить кампанию",
      href: "/guests/crm",
      signals: [
        {
          title: "Игровая загрузка",
          value:
            loadPercent === null ? "нет данных" : formatPercent(loadPercent),
          description:
            loadPercent === null
              ? "Для промо по слабым часам нужно обновить данные по ПК и сессиям."
              : loadPercent < 35
                ? "Есть свободная емкость для промо, событий или офферов на тихие часы."
                : "Загрузка заметная, промо лучше привязывать к удержанию и среднему чеку.",
          actionLabel: "Найти группу",
          href: scopedHref("/guests/report", summary, {
            segment: "quiet",
            page: "1",
            pageSize: "50",
          }),
          tone:
            loadPercent === null ? "neutral" : loadPercent < 35 ? "warning" : "good",
        },
        {
          title: "Доля бара",
          value: formatRatioPercent(barShare),
          description: `Товары и бар занимают ${formatRatioPercent(productRevenueShare)} общей выручки. Можно искать гостей с низким баром.`,
          actionLabel: "Собрать оффер",
          href: "/guests/crm",
          tone: barShare !== null && barShare < 25 ? "warning" : "neutral",
        },
      ],
    },
    {
      title: "Персонал",
      subtitle: "Понять, где исполнение влияет на деньги и сервис.",
      routeLabel: "Открыть контроль",
      href: scopedHref("/guests/staff-control", summary),
      signals: [
        {
          title: "Сигналы смен",
          value: `${formatQuantity(staffAnomalyCount)} сигналов`,
          description:
            staffAnomalyCount > 0
              ? "Есть поводы для проверки смен: возвраты, инкассация, чек или длина смен."
              : "Критичных сигналов по сменам в периоде нет.",
          actionLabel: "Разобрать",
          href: scopedHref("/guests/staff-control", summary),
          tone: staffAnomalyCount > 0 ? "warning" : "good",
        },
        {
          title: "Возвраты",
          value: formatRubles(refundSummary?.amount ?? 0),
          description: `${formatQuantity(refundSummary?.count ?? 0)} операций в журнале. Проверка помогает защитить выручку.`,
          actionLabel: "Открыть операции",
          href: scopedHref("/guests/staff-control/operations", summary, {
            kind: "refunds",
            sort: "amount",
            direction: "desc",
          }),
          tone: (refundSummary?.amount ?? 0) > 0 ? "warning" : "good",
        },
      ],
    },
  ] satisfies BusinessSignalGroup[];
}

export default async function DashboardPage({
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
  const revenueView: DashboardRevenueView =
    searchParam(params.revenueView) === "stores" ? "stores" : "summary";
  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);
  const operationalStoreId =
    summary.selectedStoreIds.length === 1 ? summary.selectedStoreIds[0] : undefined;
  const [
    periodOperationalReport,
    noSalesReport21,
    guestsSummary,
    crmTaskReport,
    staffControlReport,
  ] =
    await Promise.all([
    getOperationalReport({
      from: summary.periodFrom,
      to: summary.periodTo,
      storeId: operationalStoreId,
    }),
    getOperationalReport({
      ...lastFullDaysRange(21),
      storeId: operationalStoreId,
    }),
    getGuestsSummary({
      dateFrom: summary.periodFrom,
      dateTo: summary.periodTo,
      storeId: operationalStoreId,
    }),
    getGuestCrmTaskReport({
      status: "all",
      sort: "dueAt",
      direction: "asc",
      pageSize: "50",
    }),
    getStaffControl({
      dateFrom: summary.periodFrom,
      dateTo: summary.periodTo,
      storeId: operationalStoreId,
    }),
  ]);
  const assortmentRisk = buildAssortmentRiskSummary({
    oosRows: periodOperationalReport.outOfStockRiskProducts,
    noSalesRows: noSalesReport21.productsWithoutSales,
  });
  const highlightedPeriod = formatDashboardPeriodLabel(
    summary.periodFrom,
    summary.periodTo,
  );
  const latestTrend = getLatestTrendSegment(summary.salesTrend);
  const comparableTrend = getComparableTrendSegment(
    summary.salesTrend,
    filters.period,
  );
  const categoryAnalytics = summary.categoryAnalytics ?? [];
  const totalClubRevenue = summary.clubRevenue;
  const productRevenueShare = ratioPercent(summary.totalRevenue, totalClubRevenue);
  const businessSignalGroups = buildBusinessSignalGroups({
    summary,
    guestsSummary,
    crmTaskReport,
    staffControlReport,
    latestTrend,
    assortmentRiskAmount: assortmentRisk.totalRiskAmount,
    assortmentRiskSkuCount:
      assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount,
    productRevenueShare,
  });
  const revenueByClubHref = dashboardRevenueByClubHref({
    ...filters,
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
  });
  const revenueDiagnosticsHref = dashboardRevenueDiagnosticsHref({
    ...filters,
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
  });

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <DashboardAutoSync />
      <div className="mx-auto max-w-7xl">
        <section className="overflow-visible rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-6 p-5 min-[1250px]:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <DashboardFilters
                  period={filters.period}
                  dateFrom={summary.periodFrom}
                  dateTo={summary.periodTo}
                  skuGrouping={summary.skuGrouping}
                  stores={stores}
                  selectedStoreIds={summary.selectedStoreIds}
                />
                <DashboardQuickSyncButton />
                <Link
                  href={revenueDiagnosticsHref}
                  target="_blank"
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold leading-5 text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Сверка выручки
                </Link>
              </div>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 min-[1250px]:text-4xl">
                {summary.tenantName}: сводный дашборд сети
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Период -{" "}
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {highlightedPeriod}
                </span>
                . Первый экран соединяет деньги, гостей, ассортимент и игровую
                загрузку, чтобы быстро понять, где сеть зарабатывает и где теряет
                потенциал.
              </p>
            </div>

            <DashboardRevenuePanel
              initialView={revenueView}
              totalClubRevenue={totalClubRevenue}
              unallocatedTopupRevenue={summary.unallocatedTopupRevenue}
              adjustedGrossProfit={summary.adjustedGrossProfit}
              grossProfit={summary.grossProfit}
              adjustedMarginPercent={summary.adjustedMarginPercent}
              fullDayRevenueDate={summary.fullDayRevenueDate}
              fullDayRevenue={summary.fullDayRevenue}
              fullDayRevenueToAveragePercent={
                summary.fullDayRevenueToAveragePercent
              }
              writeOffRevenuePercent={summary.writeOffRevenuePercent}
              writeOffRevenuePercentDelta={summary.writeOffRevenuePercentDelta}
              storeRevenueBreakdown={summary.storeRevenueBreakdown}
              fullReportHref={revenueByClubHref}
            />
          </div>

          <div className="grid border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-5">
            <SignalMetric
              label="Валовая прибыль товаров"
              compactLabel="Прибыль товаров"
              value={formatMoney(summary.grossProfit)}
              tone={summary.grossProfit > 0 ? "good" : "danger"}
              href="/reports/sales-detail/table"
            />
            <SignalMetric
              label="Маржа товаров"
              value={formatPercent(summary.marginPercent)}
              tone={summary.marginPercent > 0 ? "good" : "danger"}
              href="/reports/top-sku/table"
            />
            <SignalMetric
              label="Продано товаров"
              value={formatQuantity(summary.soldQuantity)}
              suffix="шт"
              href="/reports/top-sku/table"
            />
            <SignalMetric
              label="Остаток товаров"
              value={formatQuantity(summary.stockQuantity)}
              suffix="шт"
              href="/products"
            />
            <SignalMetric
              label="Риск out-of-stock"
              compactLabel="OOS"
              value={formatQuantity(summary.outOfStockRiskCount)}
              suffix="SKU"
              tone={summary.outOfStockRiskCount > 0 ? "danger" : "good"}
              href="/reports/oos/table"
            />
          </div>
        </section>

        <ExecutiveOverviewPanel
          summary={summary}
          guestsSummary={guestsSummary}
          assortmentRiskAmount={assortmentRisk.totalRiskAmount}
          assortmentRiskSkuCount={
            assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount
          }
          totalClubRevenue={totalClubRevenue}
          productRevenueShare={productRevenueShare}
        />

        <BusinessSignalPanel groups={businessSignalGroups} />

        <ExecutiveNavigationPanel />

        <ChangeSnapshotPanel
          latestTrend={comparableTrend}
          period={filters.period}
          summary={summary}
        />

        <SalesTrendPanel
          rows={summary.salesTrend}
          period={filters.period}
          canShowRevenueShare={summary.selectedStoreIds.length === 0}
        />

        <section className="mt-6">
          <SectionHeading
            title="Категории и SKU"
            description="Ниже - детализация для поиска причин: доли категорий, эффективность прибыли и товары, которые формируют оборот."
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <CategoryShareChart rows={categoryAnalytics} />
          <CategoryEfficiencyChart rows={categoryAnalytics} />
        </section>

        <TopSkuTable
          rows={summary.topSkuByRevenue}
          grouping={summary.skuGrouping}
          period={filters.period}
          dateFrom={summary.periodFrom}
          dateTo={summary.periodTo}
          selectedStoreIds={summary.selectedStoreIds}
        />
      </div>
    </main>
  );
}

function ExecutiveOverviewPanel({
  summary,
  guestsSummary,
  assortmentRiskAmount,
  assortmentRiskSkuCount,
  totalClubRevenue,
  productRevenueShare,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  guestsSummary: GuestsSummary;
  assortmentRiskAmount: number;
  assortmentRiskSkuCount: number;
  totalClubRevenue: number;
  productRevenueShare: number | null;
}) {
  const averageVisitsPerActiveGuest =
    guestsSummary.activeGuests > 0
      ? guestsSummary.sessionsCount / guestsSummary.activeGuests
      : 0;
  const guestMoney =
    guestsSummary.transactionAmount + guestsSummary.barRevenue;
  const barShare = ratioPercent(guestsSummary.barRevenue, guestMoney);

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-4">
      <ExecutiveMetricCard
        label="Товары и бар"
        value={formatRubles(summary.totalRevenue)}
        description={`Доля в общей выручке: ${formatRatioPercent(productRevenueShare)}. Общая выручка: ${formatRubles(totalClubRevenue)}. Нераспределенные пополнения: ${formatRubles(summary.unallocatedTopupRevenue)}.`}
        href="/reports/sales-detail/table"
        tone={summary.totalRevenue > 0 ? "good" : "neutral"}
      />
      <ExecutiveMetricCard
        label="Гости"
        value={`${formatQuantity(guestsSummary.activeGuests)} гостей`}
        description={`Новые: ${formatQuantity(guestsSummary.newGuests)}, повторные: ${formatQuantity(guestsSummary.repeatGuests)}, в риске: ${formatQuantity(guestsSummary.riskGuests)}.`}
        href="/guests"
        tone={guestsSummary.riskGuests > guestsSummary.newGuests ? "warning" : "good"}
      />
      <ExecutiveMetricCard
        label="Загрузка"
        value={
          guestsSummary.loadPercent !== null
            ? formatPercent(guestsSummary.loadPercent)
            : "нет данных"
        }
        description={
          guestsSummary.playCapacityHours !== null &&
          guestsSummary.computerCount !== null
            ? `${formatHours(guestsSummary.playHours)} из ${formatHours(guestsSummary.playCapacityHours)} возможных. ПК: ${formatQuantity(guestsSummary.computerCount)}, визитов: ${formatQuantity(guestsSummary.sessionsCount)}.`
            : `${formatHours(guestsSummary.playHours)} отыграно. Для процента нужна синхронизация количества ПК.`
        }
        href="/guests"
        tone={
          guestsSummary.loadPercent === null
            ? "neutral"
            : guestsSummary.loadPercent >= 35
              ? "good"
              : "warning"
        }
      />
      <ExecutiveMetricCard
        label="Ассортимент"
        value={`${formatQuantity(summary.activeSku)} активных SKU`}
        description={`OOS: ${formatQuantity(summary.outOfStockRiskCount)} SKU. Деньги в риске: ${formatRubles(assortmentRiskAmount)} по ${formatQuantity(assortmentRiskSkuCount)} SKU.`}
        href="/reports/assortment-risk/table"
        tone={assortmentRiskAmount > 0 ? "danger" : "good"}
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <ExecutiveConclusion
            title="Деньги"
            text={
              totalClubRevenue > 0
                ? `Товарная часть занимает ${formatRatioPercent(productRevenueShare)} общей выручки. Если доля падает, стоит проверить бар, OOS и топ-SKU.`
                : "Нет общей выручки за выбранный период: сначала проверьте синхронизацию и фильтр клубов."
            }
            href="/reports"
          />
          <ExecutiveConclusion
            title="Клиентская база"
            text={
              guestsSummary.riskGuests > guestsSummary.newGuests
                ? `Гостей в риске больше, чем новых: ${formatQuantity(guestsSummary.riskGuests)} против ${formatQuantity(guestsSummary.newGuests)}. Фокус - реактивация.`
                : `Приток гостей перекрывает риск: ${formatQuantity(guestsSummary.newGuests)} новых против ${formatQuantity(guestsSummary.riskGuests)} в риске.`
            }
            href="/guests/report"
          />
          <ExecutiveConclusion
            title="Загрузка и чек"
            text={`На активного гостя приходится ${formatQuantity(averageVisitsPerActiveGuest)} визита. Доля бара в гостевых деньгах: ${formatRatioPercent(barShare)}.`}
            href="/guests/staff-control"
          />
        </div>
      </section>
    </section>
  );
}

function ExecutiveMetricCard({
  label,
  value,
  description,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  description: string;
  href: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  return (
    <Link
      href={href}
      className={[
        "block rounded-lg border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-950",
        tone === "good"
          ? "border-emerald-200 dark:border-emerald-900/70"
          : tone === "warning"
            ? "border-amber-200 dark:border-amber-900/70"
            : tone === "danger"
              ? "border-red-200 dark:border-red-900/70"
              : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </Link>
  );
}

function ExecutiveConclusion({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 transition hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
    >
      <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {text}
      </p>
    </Link>
  );
}

function BusinessSignalPanel({ groups }: { groups: BusinessSignalGroup[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Рабочие сценарии
        </p>
        <div className="mt-1 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
              Что требует внимания
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Сводный дашборд показывает не сырой набор отчетов, а короткий
              маршрут: сигнал, бизнес-логика и следующий рабочий шаг.
            </p>
          </div>
          <Link
            href="/guests/crm/tasks"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/20"
          >
            Открыть задачи CRM
          </Link>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <article
            key={group.title}
            className="flex min-h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex flex-col border-b border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60 md:h-[152px]">
              <h3 className="text-sm font-semibold leading-5 text-zinc-950 dark:text-zinc-50">
                {group.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {group.subtitle}
              </p>
              <Link
                href={group.href}
                className="mt-3 inline-flex w-fit max-w-full items-center justify-center rounded-full border border-zinc-200 px-3 py-1 text-left text-xs font-semibold leading-4 text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-emerald-900 dark:hover:text-emerald-300 md:mt-auto"
              >
                {group.routeLabel}
              </Link>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              {group.signals.map((signal) => (
                <BusinessSignalCard key={signal.title} signal={signal} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BusinessSignalCard({ signal }: { signal: BusinessSignal }) {
  return (
    <Link
      href={signal.href}
      className={[
        "group flex min-h-[150px] flex-col rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm dark:bg-zinc-950",
        signal.tone === "danger"
          ? "border-red-200 dark:border-red-900/70"
          : signal.tone === "warning"
            ? "border-amber-200 dark:border-amber-900/70"
            : signal.tone === "good"
              ? "border-emerald-200 dark:border-emerald-900/70"
              : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
          {signal.title}
        </p>
        <span
          className={[
            "h-2 w-2 rounded-full",
            signal.tone === "danger"
              ? "bg-red-400"
              : signal.tone === "warning"
                ? "bg-amber-400"
                : signal.tone === "good"
                  ? "bg-emerald-400"
                  : "bg-zinc-400",
          ].join(" ")}
        />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {signal.value}
      </p>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {signal.description}
      </p>
      <span className="mt-3 text-sm font-semibold text-emerald-700 transition group-hover:text-emerald-600 dark:text-emerald-300">
        {signal.actionLabel}
      </span>
    </Link>
  );
}

function ExecutiveNavigationPanel() {
  const links = [
    {
      title: "Гости",
      description: "Сегменты, ТОП гостей, риск оттока, CRM и карточки.",
      href: "/guests",
    },
    {
      title: "Товары",
      description: "SKU, остатки, цены, группировка и карточки товаров.",
      href: "/products",
    },
    {
      title: "Отчеты",
      description: "OOS, деньги в риске, продажи, рекомендации и сводные таблицы.",
      href: "/reports",
    },
    {
      title: "Контроль персонала",
      description: "Смены, операторы, возвраты, инкассация и средние чеки.",
      href: "/guests/staff-control",
    },
  ];

  return (
    <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/20"
        >
          <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {link.title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {link.description}
          </span>
        </Link>
      ))}
    </section>
  );
}

function ChangeSnapshotPanel({
  latestTrend,
  period,
  summary,
}: {
  latestTrend: DashboardSalesTrendSegment | null;
  period: string;
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
}) {
  const description =
    period === "day"
      ? "Последние полные сутки сравниваются с предыдущими полными сутками."
      : "Последний отрезок динамики сравнивается с предыдущим аналогичным отрезком. Корректная оценка период к периоду только в полных периодах.";

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 min-[1145px]:flex-row min-[1145px]:items-center min-[1145px]:justify-between max-[1144px]:grid max-[1144px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] max-[1144px]:items-center">
        <div>
          <h2 className="text-base font-semibold">Что изменилось</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 min-[1145px]:grid-cols-4">
          <ChangeMetric
            label="Выручка"
            value={latestTrend?.revenueDeltaPercent ?? null}
            lowerGood={false}
          />
          <ChangeMetric
            label="Продано"
            value={latestTrend?.quantityDeltaPercent ?? null}
            lowerGood={false}
          />
          <ChangeMetric
            label="OOS"
            value={latestTrend?.outOfStockSkuDeltaPercent ?? null}
            lowerGood
          />
          <ChangeMetric
            label="Списания / выручка"
            value={summary.writeOffRevenuePercentDelta}
            lowerGood
          />
        </div>
      </div>
    </section>
  );
}

function ChangeMetric({
  label,
  value,
  lowerGood,
}: {
  label: string;
  value: number | null;
  lowerGood: boolean;
}) {
  const isGood =
    value !== null && value !== 0 && (lowerGood ? value < 0 : value > 0);

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
      <p
        className={[
          "mt-2 text-lg font-semibold tabular-nums",
          value === null || value === 0
            ? "text-zinc-600 dark:text-zinc-300"
            : isGood
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300",
        ].join(" ")}
      >
        {value === null ? "нет базы" : formatSignedPercent(value)}
      </p>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

function SalesTrendPanel({
  rows,
  period,
  canShowRevenueShare,
}: {
  rows: DashboardSalesTrendSegment[];
  period: string;
  canShowRevenueShare: boolean;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Динамика продаж</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              8 отрезков выбранного периода: деньги, штуки и изменение к
              предыдущему отрезку.
            </p>
          </div>
        </div>
      </div>
      <div className="grid items-stretch gap-6 p-5 xl:grid-cols-2">
        <RevenueTrendChart
          rows={rows}
          period={period}
          canShowShare={canShowRevenueShare}
        />
        <TrendChart
          title="Продано, шт"
          rows={rows}
          getValue={(row) => row.soldQuantity}
          getDelta={(row) => row.quantityDeltaPercent}
          formatValue={formatQuantity}
          tone="quantity"
          period={period}
        />
        <NoSalesTrendChart rows={rows} period={period} />
        <TrendChart
          title="OOS, SKU"
          description="SKU с риском out-of-stock"
          rows={rows}
          getValue={(row) => row.outOfStockSkuCount}
          getDelta={(row) => row.outOfStockSkuDeltaPercent}
          formatValue={formatQuantity}
          tone="danger"
          period={period}
          deltaDirection="lowerGood"
        />
      </div>
    </section>
  );
}

function TrendChart({
  title,
  description,
  rows,
  getValue,
  getDelta,
  formatValue,
  tone,
  period,
  deltaDirection = "higherGood",
}: {
  title: string;
  description?: string;
  rows: DashboardSalesTrendSegment[];
  getValue: (row: DashboardSalesTrendSegment) => number;
  getDelta: (row: DashboardSalesTrendSegment) => number | null;
  formatValue: (value: number) => string;
  tone: "money" | "quantity" | "warning" | "danger";
  period: string;
  deltaDirection?: "higherGood" | "lowerGood";
}) {
  const maxValue = Math.max(...rows.map(getValue), 1);
  const colorClass =
    tone === "money"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "danger"
          ? "bg-red-500"
          : "bg-sky-500";

  return (
    <div className="flex h-full flex-col rounded-3xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      <div className="mt-4 grid h-56 grid-cols-8 items-end gap-2 pb-2">
        {rows.map((row) => {
          const value = getValue(row);
          const height = Math.max(4, (value / maxValue) * 100);
          const delta = getDelta(row);
          const weekday = getDailyWeekday(row.from, period);
          const periodLabel = formatTrendPeriodLabel(row, period);
          const periodTitle = formatTrendPeriodTitle(row, period);
          const isGood =
            delta !== null &&
            delta !== 0 &&
            (deltaDirection === "higherGood" ? delta > 0 : delta < 0);

          return (
            <div
              key={`${title}-${row.index}`}
              className="group flex h-full flex-col justify-end gap-2"
              title={periodTitle}
            >
              <div className="min-h-12 text-center">
                <p className="text-[11px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {formatValue(value)}
                </p>
                <p
                  className={[
                    "mt-1 text-[10px] tabular-nums",
                    delta === null
                      ? "text-zinc-400"
                      : delta === 0
                        ? "text-zinc-400"
                        : isGood
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-red-600 dark:text-red-300",
                  ].join(" ")}
                >
                  {formatDelta(delta)}
                </p>
              </div>
              <div
                className={[
                  "flex h-36 items-end rounded-xl border p-1 transition-colors",
                  weekday?.isAccent
                    ? weekday.containerClass
                    : "border-transparent bg-white dark:bg-zinc-950",
                ].join(" ")}
              >
                <div
                  className={[
                    "w-full rounded-lg transition-all",
                    colorClass,
                  ].join(" ")}
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="min-h-6 pt-1 text-center">
                <p
                  className={[
                    "whitespace-nowrap text-[10px] leading-none",
                    weekday?.isAccent
                      ? weekday.labelClass
                      : "text-zinc-500 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {periodLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDailyWeekday(dateValue: string, period: string) {
  const basePeriod = period.startsWith("full-") ? period.slice(5) : period;

  if (basePeriod !== "day") {
    return null;
  }

  const date = parseDateInput(dateValue);

  if (!date) {
    return null;
  }

  const weekdays = [
    { shortLabel: "вскр", fullLabel: "Воскресенье" },
    { shortLabel: "пн", fullLabel: "Понедельник" },
    { shortLabel: "вт", fullLabel: "Вторник" },
    { shortLabel: "ср", fullLabel: "Среда" },
    { shortLabel: "чт", fullLabel: "Четверг" },
    { shortLabel: "пт", fullLabel: "Пятница" },
    { shortLabel: "сб", fullLabel: "Суббота" },
  ] as const;
  const weekday = date.getUTCDay();
  const accent =
    weekday === 5
      ? {
          containerClass:
            "border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30",
          badgeClass:
            "bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200",
          labelClass: "font-semibold text-amber-700 dark:text-amber-300",
        }
      : weekday === 6
        ? {
            containerClass:
              "border-orange-200 bg-orange-50 dark:border-orange-900/70 dark:bg-orange-950/30",
            badgeClass:
              "bg-orange-100 text-orange-800 dark:bg-orange-900/70 dark:text-orange-200",
            labelClass: "font-semibold text-orange-700 dark:text-orange-300",
          }
        : weekday === 0
          ? {
              containerClass:
                "border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30",
              badgeClass:
                "bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-200",
              labelClass: "font-semibold text-red-700 dark:text-red-300",
            }
          : null;

  return {
    ...weekdays[weekday],
    isAccent: Boolean(accent),
    containerClass: accent?.containerClass ?? "",
    badgeClass:
      accent?.badgeClass ??
      "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300",
    labelClass: accent?.labelClass ?? "",
  };
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "нов.";
  }

  if (value === 0) {
    return "0%";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function SignalMetric({
  label,
  compactLabel,
  value,
  suffix,
  tone = "neutral",
  href,
}: {
  label: string;
  compactLabel?: string;
  value: string;
  suffix?: string;
  tone?: "neutral" | "good" | "danger";
  href?: string;
}) {
  const content = (
    <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 md:border-b-0 md:border-r last:md:border-r-0">
      <p
        className="text-xs font-medium uppercase tracking-wide text-zinc-500"
        title={compactLabel ? label : undefined}
      >
        {compactLabel ? (
          <>
            <span className="min-[1250px]:hidden">{compactLabel}</span>
            <span className="hidden min-[1250px]:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "danger"
              ? "text-red-700 dark:text-red-300"
              : "text-zinc-950 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-sm text-zinc-500">{suffix}</span>
        ) : null}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block transition-colors hover:bg-zinc-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:hover:bg-zinc-900/70"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function TopSkuTable({
  rows,
  grouping,
  period,
  dateFrom,
  dateTo,
  selectedStoreIds,
}: {
  rows: DashboardTopSku[];
  grouping: "club" | "network";
  period: string;
  dateFrom: string;
  dateTo: string;
  selectedStoreIds: string[];
}) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/reports#top-sku"
              className="inline-flex rounded-sm text-base font-semibold transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:hover:text-emerald-300"
            >
              ТОП-10 SKU по выручке
            </Link>
            <p className="mt-1 text-sm text-zinc-500">
              {grouping === "network"
                ? "По умолчанию показаны данные по всей сети с учетом спарсенных товаров."
                : "Позиции показаны отдельно по каждому клубу."}
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <div className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-50 p-1 text-xs font-semibold dark:border-zinc-800 dark:bg-zinc-900">
              <TopSkuGroupingLink
                label="По сети"
                isActive={grouping === "network"}
                href={buildDashboardHref({
                  period,
                  dateFrom,
                  dateTo,
                  selectedStoreIds,
                  skuGrouping: "network",
                })}
              />
              <TopSkuGroupingLink
                label="По клубам"
                isActive={grouping === "club"}
                href={buildDashboardHref({
                  period,
                  dateFrom,
                  dateTo,
                  selectedStoreIds,
                  skuGrouping: "club",
                })}
              />
            </div>
            <div className="hidden grid-cols-[120px_96px_120px] gap-4 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400 md:grid">
              <span>Выручка</span>
              <span>Продано</span>
              <span>Прибыль</span>
            </div>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => (
            <div
              key={`${row.productId}-${row.storeId ?? "network"}-${index}`}
              className="grid gap-3 px-4 py-4 transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/45 md:grid-cols-[40px_minmax(0,1fr)_120px_96px_120px] md:items-center"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {row.name}
                  </p>
                  {row.isCanonical ? <NetworkSkuBadge /> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {grouping === "club" ? (
                    <span className="truncate font-medium text-zinc-600 dark:text-zinc-300">
                      {row.storeName ?? "—"}
                    </span>
                  ) : (
                    <span>По сети</span>
                  )}
                  <span className="tabular-nums md:hidden">
                    выручка {formatMoney(row.revenue)}
                  </span>
                  <span className="tabular-nums md:hidden">
                    {formatQuantity(row.soldQuantity)} шт
                  </span>
                  <span className="tabular-nums md:hidden">
                    прибыль {formatMoney(row.grossProfit)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.max(8, (row.revenue / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <p className="hidden text-right text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50 md:block">
                {formatMoney(row.revenue)}
              </p>
              <p className="hidden text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 md:block">
                {formatQuantity(row.soldQuantity)}
              </p>
              <p className="hidden text-right text-sm tabular-nums text-zinc-700 dark:text-zinc-300 md:block">
                {formatMoney(row.grossProfit)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          Продаж за выбранный период пока нет.
        </p>
      )}
    </section>
  );
}

function buildDashboardHref({
  period,
  dateFrom,
  dateTo,
  selectedStoreIds,
  skuGrouping,
}: {
  period: string;
  dateFrom: string;
  dateTo: string;
  selectedStoreIds: string[];
  skuGrouping: "club" | "network";
}) {
  const params = new URLSearchParams();

  params.set("period", period);
  params.set("skuGrouping", skuGrouping);

  if (period === "custom") {
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
  }

  selectedStoreIds.forEach((storeId) => {
    params.append("storeIds", storeId);
  });

  return `/dashboard?${params.toString()}`;
}

function TopSkuGroupingLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "rounded-full px-3 py-1.5 transition-colors",
        isActive
          ? "bg-zinc-950 text-white shadow-sm dark:bg-emerald-400 dark:text-zinc-950"
          : "text-zinc-500 hover:bg-white hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function NetworkSkuBadge() {
  return (
    <span
      title="Товар является сетевым: составлен из одинаковых товаров, но с разными названиями в разных клубах."
      aria-label="Сетевой товар"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
    >
      ⇄
    </span>
  );
}
