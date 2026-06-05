import { getDashboardSummary } from "@/lib/dashboard-summary";
import { buildAssortmentRiskSummary } from "@/lib/assortment-risk";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardQuickSyncButton } from "@/components/dashboard-quick-sync-button";
import { DashboardRevenuePanel } from "@/components/dashboard-revenue-panel";
import { requireCurrentUser } from "@/lib/auth";
import { isShiftWorkspaceRole, staffShiftWorkspaceHref } from "@/lib/landing";
import {
  getGuestCrmTaskReport,
  getGuestsSummary,
  type GuestCrmTaskReport,
  type GuestsSummary,
} from "@/lib/guests";
import { getOperationalReport, type OperationalReport } from "@/lib/reports";
import { getStores } from "@/lib/stores";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

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

function dashboardCanonicalHref(params: {
  period?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  revenueView?: string | string[];
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

  const revenueView = searchParam(params.revenueView);

  if (revenueView) {
    canonicalParams.set("revenueView", revenueView);
  }

  searchParamsArray(params.storeIds).forEach((storeId) => {
    canonicalParams.append("storeIds", storeId);
  });

  const query = canonicalParams.toString();

  return `/dashboard${query ? `?${query}` : ""}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
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

type DashboardGuestsSummary = Pick<
  GuestsSummary,
  | "activeGuests"
  | "newGuests"
  | "repeatGuests"
  | "riskGuests"
  | "playHours"
  | "computerCount"
  | "playCapacityHours"
  | "loadPercent"
  | "transactionAmount"
  | "barRevenue"
>;

type DashboardCrmTaskReport = Pick<GuestCrmTaskReport, "summary">;

type DashboardOperationalReport = Pick<
  OperationalReport,
  "outOfStockRiskProducts" | "productsWithoutSales"
>;

const emptyGuestsSummary: DashboardGuestsSummary = {
  activeGuests: 0,
  newGuests: 0,
  repeatGuests: 0,
  riskGuests: 0,
  playHours: 0,
  computerCount: null,
  playCapacityHours: null,
  loadPercent: null,
  transactionAmount: 0,
  barRevenue: 0,
};

const emptyCrmTaskReport: DashboardCrmTaskReport = {
  summary: {
    open: 0,
    inProgress: 0,
    done: 0,
    canceled: 0,
    overdue: 0,
    withAssignee: 0,
    withoutAssignee: 0,
  },
};

const emptyOperationalReport: DashboardOperationalReport = {
  outOfStockRiskProducts: [],
  productsWithoutSales: [],
};

async function safeDashboardValue<T>(
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
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
  latestTrend,
  assortmentRiskAmount,
  assortmentRiskSkuCount,
  productRevenueShare,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  guestsSummary: DashboardGuestsSummary;
  crmTaskReport: DashboardCrmTaskReport;
  latestTrend: { noSalesSkuCount14: number } | null;
  assortmentRiskAmount: number;
  assortmentRiskSkuCount: number;
  productRevenueShare: number | null;
}) {
  const guestMoney = guestsSummary.transactionAmount + guestsSummary.barRevenue;
  const barShare = ratioPercent(guestsSummary.barRevenue, guestMoney);
  const activeCrmTasks =
    crmTaskReport.summary.open + crmTaskReport.summary.inProgress;
  const loadPercent = guestsSummary.loadPercent;
  const noSalesSkuCount = latestTrend?.noSalesSkuCount14 ?? 0;

  return [
    {
      title: "Гости и CRM",
      subtitle:
        "Понять, с кем работать сегодня: риск оттока, новые гости и задачи контакта.",
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
      subtitle:
        "Найти товарные потери: OOS, замороженные остатки и позиции без продаж.",
      routeLabel: "Открыть ассортимент",
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
      subtitle:
        "Выбрать цель кампании: загрузить тихие часы, усилить бар или вернуть гостей.",
      routeLabel: "Подготовить кампанию",
      href: "/marketing",
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
          href: "/marketing",
          tone: barShare !== null && barShare < 25 ? "warning" : "neutral",
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

  if (params.skuGrouping !== undefined) {
    redirect(dashboardCanonicalHref(params));
  }

  const user = await requireCurrentUser();

  if (isShiftWorkspaceRole(user.role)) {
    redirect(staffShiftWorkspaceHref);
  }

  const filters = {
    period: searchParam(params.period) ?? "day",
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeIds: searchParamsArray(params.storeIds),
  } as const;
  const revenueView: DashboardRevenueView =
    searchParam(params.revenueView) === "stores" ? "stores" : "summary";
  const [summary, stores] = await Promise.all([
    getDashboardSummary(filters),
    getStores(),
  ]);
  const highlightedPeriod = formatDashboardPeriodLabel(
    summary.periodFrom,
    summary.periodTo,
  );
  const totalClubRevenue = summary.clubRevenue;
  const revenueByClubHref = dashboardRevenueByClubHref({
    ...filters,
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
  });

  return (
    <main className="px-4 py-5 text-zinc-950 sm:px-6 sm:py-8 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-visible rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid min-w-0 gap-5 p-4 min-[1250px]:grid-cols-[1.1fr_0.9fr] sm:p-5 lg:p-8">
            <div className="min-w-0">
              <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:flex-wrap lg:items-center">
                <DashboardFilters
                  period={filters.period}
                  dateFrom={summary.periodFrom}
                  dateTo={summary.periodTo}
                  stores={stores}
                  selectedStoreIds={summary.selectedStoreIds}
                />
                <DashboardQuickSyncButton />
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 min-[1250px]:text-4xl">
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
        </section>

        <Suspense fallback={<DashboardSecondaryPanelsSkeleton />}>
          <DashboardSecondaryPanels summary={summary} />
        </Suspense>
      </div>
    </main>
  );
}

async function DashboardSecondaryPanels({
  summary,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
}) {
  const operationalStoreId =
    summary.selectedStoreIds.length === 1
      ? summary.selectedStoreIds[0]
      : undefined;
  const [
    periodOperationalReport,
    noSalesReport21,
    guestsSummary,
    crmTaskReport,
  ] = await Promise.all([
    safeDashboardValue(
      getOperationalReport({
        from: summary.periodFrom,
        to: summary.periodTo,
        storeId: operationalStoreId,
      }),
      emptyOperationalReport,
    ),
    safeDashboardValue(
      getOperationalReport({
        ...lastFullDaysRange(21),
        storeId: operationalStoreId,
      }),
      emptyOperationalReport,
    ),
    safeDashboardValue(
      getGuestsSummary({
        dateFrom: summary.periodFrom,
        dateTo: summary.periodTo,
        storeId: operationalStoreId,
      }),
      emptyGuestsSummary,
    ),
    safeDashboardValue(
      getGuestCrmTaskReport({
        status: "all",
        sort: "dueAt",
        direction: "asc",
        pageSize: "50",
      }),
      emptyCrmTaskReport,
    ),
  ]);
  const assortmentRisk = buildAssortmentRiskSummary({
    oosRows: periodOperationalReport.outOfStockRiskProducts,
    noSalesRows: noSalesReport21.productsWithoutSales,
  });
  const latestTrend = summary.salesTrend.at(-1) ?? null;
  const productRevenueShare = ratioPercent(
    summary.totalRevenue,
    summary.clubRevenue,
  );
  const businessSignalGroups = buildBusinessSignalGroups({
    summary,
    guestsSummary,
    crmTaskReport,
    latestTrend,
    assortmentRiskAmount: assortmentRisk.totalRiskAmount,
    assortmentRiskSkuCount:
      assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount,
    productRevenueShare,
  });

  return (
    <>
      <ExecutiveOverviewPanel
        summary={summary}
        guestsSummary={guestsSummary}
        assortmentRiskAmount={assortmentRisk.totalRiskAmount}
        assortmentRiskSkuCount={
          assortmentRisk.oosSkuCount + assortmentRisk.noSalesSkuCount
        }
        productRevenueShare={productRevenueShare}
      />

      <BusinessSignalPanel groups={businessSignalGroups} />
    </>
  );
}

function DashboardSecondaryPanelsSkeleton() {
  return (
    <>
      <section className="mt-6 grid auto-rows-fr items-stretch gap-4 lg:grid-cols-3">
        {["Клиентская база", "Маркетинг и загрузка", "Ассортимент"].map(
          (label) => (
            <div
              key={label}
              className="min-h-[172px] rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-semibold uppercase text-zinc-500">
                {label}
              </p>
              <div className="mt-5 h-8 w-28 rounded-full bg-zinc-100 dark:bg-zinc-900" />
              <div className="mt-8 h-4 w-full max-w-xs rounded-full bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ),
        )}
      </section>
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          Рабочие сценарии
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-44 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
            />
          ))}
        </div>
      </section>
    </>
  );
}

function ExecutiveOverviewPanel({
  summary,
  guestsSummary,
  assortmentRiskAmount,
  assortmentRiskSkuCount,
  productRevenueShare,
}: {
  summary: Awaited<ReturnType<typeof getDashboardSummary>>;
  guestsSummary: DashboardGuestsSummary;
  assortmentRiskAmount: number;
  assortmentRiskSkuCount: number;
  productRevenueShare: number | null;
}) {
  return (
    <section className="mt-6 grid auto-rows-fr items-stretch gap-4 lg:grid-cols-3">
      <ExecutiveMetricCard
        label="Клиентская база"
        value={`${formatQuantity(guestsSummary.activeGuests)} гостей`}
        description={`Новые: ${formatQuantity(guestsSummary.newGuests)}, повторные: ${formatQuantity(guestsSummary.repeatGuests)}, в риске: ${formatQuantity(guestsSummary.riskGuests)}.`}
        href="/guests/crm"
        tone={guestsSummary.riskGuests > guestsSummary.newGuests ? "warning" : "good"}
      />
      <ExecutiveMetricCard
        label="Маркетинг и загрузка"
        value={
          guestsSummary.loadPercent !== null
            ? formatPercent(guestsSummary.loadPercent)
            : "нет данных"
        }
        description={
          guestsSummary.playCapacityHours !== null &&
          guestsSummary.computerCount !== null
            ? `${formatHours(guestsSummary.playHours)} из ${formatHours(guestsSummary.playCapacityHours)} возможных. Товары и бар: ${formatRatioPercent(productRevenueShare)} выручки.`
            : `${formatHours(guestsSummary.playHours)} отыграно. Для процента нужна синхронизация количества ПК.`
        }
        href="/guests/crm"
        tone={
          guestsSummary.loadPercent === null
            ? "neutral"
            : guestsSummary.loadPercent >= 35
              ? "good"
              : "warning"
        }
      />
      <ExecutiveMetricCard
        label="Управление ассортиментом"
        value={`${formatQuantity(summary.activeSku)} активных SKU`}
        description={`OOS: ${formatQuantity(summary.outOfStockRiskCount)} SKU. Деньги в риске: ${formatRubles(assortmentRiskAmount)} по ${formatQuantity(assortmentRiskSkuCount)} SKU.`}
        href="/assortment/dashboard"
        tone={assortmentRiskAmount > 0 ? "danger" : "good"}
      />
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
        "flex h-full flex-col rounded-lg border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-950",
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
      <p className="mt-3 min-h-[64px] text-2xl font-semibold leading-tight tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-auto pt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
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
        <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          Что требует внимания
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Три рабочих маршрута: гости и CRM, управление ассортиментом и
          маркетинг. Внутри каждого блока - главный сигнал и следующий шаг.
        </p>
      </div>

      <div className="grid items-stretch gap-4 p-4 lg:grid-cols-3">
        {groups.map((group) => (
          <article
            key={group.title}
            className="flex h-full min-h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex min-h-[174px] flex-col border-b border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              <h3 className="text-sm font-semibold leading-5 text-zinc-950 dark:text-zinc-50">
                {group.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {group.subtitle}
              </p>
              <Link
                href={group.href}
                className="mt-auto inline-flex w-fit max-w-full items-center justify-center rounded-full border border-zinc-200 px-3 py-1 text-left text-xs font-semibold leading-4 text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-emerald-900 dark:hover:text-emerald-300"
              >
                {group.routeLabel}
              </Link>
            </div>

            <div className="grid flex-1 auto-rows-fr gap-3 p-4">
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
        "group flex h-full min-h-[210px] flex-col rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm dark:bg-zinc-950",
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
