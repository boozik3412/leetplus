import { redirect } from "next/navigation";
import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { GuestActionCenter } from "@/components/guest-action-center";
import { GuestAttentionPanel } from "@/components/guest-attention-panel";
import {
  BonusLoadPanel,
  DataQualityPanel,
  FlowForecastPanel,
  GuestMiniTable,
  RetentionPanel,
  summaryToFilters,
  VisitHeatmapPanel,
  VisitTrendPanel,
} from "@/components/guest-dashboard-panels";
import { GuestDashboardFilters } from "@/components/guest-dashboard-filters";
import { GuestGamificationOverview } from "@/components/guest-gamification-overview";
import { GuestHealthPanel } from "@/components/guest-health-panel";
import { KpiTile, PillLink } from "@/components/guest-insight-ui";
import { GuestListTable } from "@/components/guest-list-table";
import { requireCurrentUser } from "@/lib/auth";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";
import { getDefaultLandingPath } from "@/lib/landing";
import { can } from "@/lib/permissions";
import {
  formatNumber,
  formatPercent,
  formatPeriodDate,
  formatRubles,
  guestsExportHref,
  guestsHref,
  guestsReportHref,
  pluralize,
  guestsWord,
} from "@/lib/guest-insights";
import {
  getGuestFilterOptions,
  getGuests,
  getGuestsSummary,
  type GuestListFilters,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireCurrentUser();

  if (!can(user, "view_guests")) {
    redirect(getDefaultLandingPath(user));
  }

  const params = await searchParams;
  const filters: GuestListFilters = {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    guestGroupId: searchParam(params.guestGroupId),
    segment: searchParam(params.segment) as GuestListFilters["segment"],
    crmStatus: searchParam(params.crmStatus) as GuestListFilters["crmStatus"],
    gameStatus: searchParam(params.gameStatus) as GuestListFilters["gameStatus"],
    churnRisk: searchParam(params.churnRisk) as GuestListFilters["churnRisk"],
    rfm: searchParam(params.rfm) as GuestListFilters["rfm"],
    consent: searchParam(params.consent) as GuestListFilters["consent"],
    signal: searchParam(params.signal) as GuestListFilters["signal"],
    search: searchParam(params.search),
    page: searchParam(params.page),
    pageSize: searchParam(params.pageSize) ?? "50",
    sort: searchParam(params.sort) as GuestListFilters["sort"],
    direction: searchParam(params.direction) as GuestListFilters["direction"],
  };
  const selectedPeriod = searchParam(params.period);
  const [summary, guestList, options, guestSnapshot] = await Promise.all([
    getGuestsSummary(filters),
    getGuests(filters),
    getGuestFilterOptions(),
    safeGetBusinessSnapshot("GUESTS"),
  ]);
  const scope = summaryToFilters(summary);
  const canManageCrm = can(user, "manage_guest_crm");
  const gameAvailable = summary.gamification.available;
  const comparison = summary.comparison.metrics;

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Гости"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Клиентская база
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Период {formatPeriodDate(summary.periodFrom)} —{" "}
              {formatPeriodDate(summary.periodTo)}; изменения считаются к
              предыдущему периоду {formatPeriodDate(summary.comparison.previousPeriodFrom)}{" "}
              — {formatPeriodDate(summary.comparison.previousPeriodTo)}. Факты
              Langame, ручные CRM-поля LeetPlus и игровой модуль собраны в одну
              картину по гостю; администраторы клубов исключены из выборки.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <PillLink href="/guests/crm/tasks?status=all">Задачи CRM</PillLink>
              <PillLink href={guestsReportHref(filters)} external>
                Полный отчёт
              </PillLink>
              <PillLink href={guestsExportHref(filters)} external tone="accent">
                CSV
              </PillLink>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-zinc-500">Гостей в выборке</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(summary.totalGuests)}
              </p>
            </div>
          </div>
        </header>

        <GuestDashboardFilters
          key={[
            selectedPeriod,
            filters.dateFrom,
            filters.dateTo,
            filters.storeId,
            filters.guestGroupId,
            filters.segment,
            filters.crmStatus,
            filters.gameStatus,
            filters.churnRisk,
            filters.rfm,
            filters.search,
          ].join("|")}
          filters={filters}
          options={options}
          period={selectedPeriod}
          periodFrom={summary.periodFrom}
          periodTo={summary.periodTo}
          gameAvailable={gameAvailable}
        />

        <BusinessSnapshotGate snapshot={guestSnapshot} type="GUESTS" />

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <GuestAttentionPanel
            signals={summary.attention}
            scope={scope}
            periodTo={summary.periodTo}
            canManageCrm={canManageCrm}
          />
          <GuestActionCenter
            actions={summary.actions}
            crmQueue={summary.crmQueue}
            scope={scope}
            periodTo={summary.periodTo}
            canManageCrm={canManageCrm}
          />
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <KpiTile
            label="Активные гости"
            value={formatNumber(summary.activeGuests)}
            comparison={comparison.activeGuests}
            caption="сессия, пополнение или покупка"
            tone="good"
            formula="Гости сегментов «Активные», «Повторные» и «Новые»: есть сессия, транзакция или покупка бара в периоде"
            href={guestsHref({ ...scope, sort: "lastActivity" })}
          />
          <KpiTile
            label="Новые"
            value={formatNumber(summary.newGuests)}
            comparison={comparison.newGuests}
            caption="регистрация внутри периода"
            formula="Guest.insertedAt внутри периода"
            href={guestsHref({ ...scope, segment: "new", sort: "registered" })}
          />
          <KpiTile
            label="Повторные"
            value={formatNumber(summary.repeatGuests)}
            comparison={comparison.repeatGuests}
            caption={`${formatPercent(summary.kpi.repeatShare, 0)} активных`}
            tone="good"
            formula="2+ сессии или 2+ дня активности в периоде"
            href={guestsHref({ ...scope, segment: "repeat", sort: "sessions" })}
          />
          <KpiTile
            label="Вернувшиеся"
            value={formatNumber(summary.kpi.returnedGuests)}
            caption="после паузы 30+ дней"
            formula="Есть активность в периоде, а предыдущая активность была 30+ дней назад"
          />
          <KpiTile
            label="В риске"
            value={formatNumber(summary.riskGuests)}
            comparison={comparison.riskGuests}
            comparisonDirection="down-is-good"
            caption={`под риском ${formatRubles(summary.kpi.valueAtRisk)}`}
            tone="warning"
            formula="Сегмент «В риске»: нет активности 14+ дней. Деньги под риском — сумма valueAtRisk по уровням риска «Высокий» и «Наблюдать»"
            href={guestsHref({ ...scope, segment: "risk", sort: "churnRisk" })}
          />
          <KpiTile
            label="Потерянные"
            value={formatNumber(summary.lostGuests)}
            comparison={comparison.lostGuests}
            comparisonDirection="down-is-good"
            caption={`потеряно ${formatRubles(summary.kpi.lostValue)}`}
            tone="danger"
            formula="Сегмент «Потерянные»: нет активности 30+ дней или гость отключён"
            href={guestsHref({ ...scope, segment: "lost", sort: "ltv" })}
          />
          <KpiTile
            label="Выручка гостей"
            value={formatRubles(summary.kpi.revenue)}
            comparison={comparison.revenue}
            caption={
              summary.kpi.arpu === null
                ? "нет активных гостей"
                : `ARPU ${formatRubles(summary.kpi.arpu)}`
            }
            formula="Пополнения баланса + покупки бара в периоде. ARPU = выручка / активные гости"
          />
          <KpiTile
            label="Средний чек"
            value={
              summary.kpi.averageCheck === null
                ? "—"
                : formatRubles(summary.kpi.averageCheck)
            }
            caption={`${formatNumber(summary.kpi.averageCheckBase)} операций`}
            formula="Выручка периода / (пополнения + продажи бара)"
          />
          <KpiTile
            label="Сессии"
            value={formatNumber(summary.sessionsCount)}
            comparison={comparison.sessionsCount}
            caption={`${formatNumber(summary.playHours, 1)} ч · средняя ${formatNumber(summary.averageSessionMinutes)} мин`}
            formula="Сессии Langame, пересекающие период; часы — по пересечению с периодом"
          />
          <KpiTile
            label="Бар"
            value={formatRubles(summary.barRevenue)}
            comparison={comparison.barRevenue}
            caption={`${formatPercent(summary.kpi.barBuyersShare, 0)} активных покупают · ${formatNumber(summary.kpi.visitFrequency ?? 0, 1)} дн. визитов на гостя`}
            formula="Продажи бара, связанные с гостем; доля — гости с покупкой среди активных"
          />
        </section>

        <div className="mt-6">
          <GuestHealthPanel health={summary.health} scope={scope} />
        </div>

        <div className="mt-6">
          <GuestGamificationOverview
            gamification={summary.gamification}
            scope={scope}
          />
        </div>

        <BonusLoadPanel summary={summary} />

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <RetentionPanel summary={summary} />
          <FlowForecastPanel summary={summary} />
        </section>

        <div className="mt-6">
          <VisitHeatmapPanel summary={summary} />
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <VisitTrendPanel summary={summary} />
          <DataQualityPanel summary={summary} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GuestMiniTable
            title="TOP гостей по деньгам"
            rows={summary.topGuests}
            reportFilters={{ ...scope, segment: "top" }}
          />
          <GuestMiniTable
            title={`Гости в риске · ${pluralize(summary.riskGuests, guestsWord)}`}
            rows={summary.riskGuestsRows}
            reportFilters={{ ...scope, segment: "risk" }}
          />
        </section>

        <GuestListTable
          filters={filters}
          guestList={guestList}
          gameAvailable={gameAvailable}
        />
      </div>
    </main>
  );
}
