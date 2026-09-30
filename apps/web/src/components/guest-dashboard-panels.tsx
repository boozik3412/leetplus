import Link from "next/link";
import type {
  GuestDashboardRow,
  GuestListFilters,
  GuestsSummary,
} from "@/lib/guests";
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatPeriodDate,
  formatRubles,
  guestsExportHref,
  guestsHref,
  guestsReportHref,
  hourRangeLabel,
  segmentLabels,
  segmentTone,
  weekdayLabels,
} from "@/lib/guest-insights";
import {
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  KpiTile,
  PillLink,
} from "@/components/guest-insight-ui";

/**
 * Analytical panels of the guest dashboard that predate the CRM redesign:
 * bonus load, new-guest retention, visit heatmap, flow forecast, daily trend,
 * data quality and the compact TOP/risk lists. Formulas are unchanged.
 */

export function summaryToFilters(summary: GuestsSummary): GuestListFilters {
  return {
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
    storeId: summary.storeId ?? undefined,
    guestGroupId: summary.guestGroupId ?? undefined,
    page: "1",
    pageSize: "50",
  };
}

function bonusLoadLabel(status: GuestDashboardRow["bonusLoad"]["status"]) {
  const labels: Record<GuestDashboardRow["bonusLoad"]["status"], string> = {
    NONE: "Нет бонусов",
    NORMAL: "Активный остаток",
    WATCH: "Наблюдать",
    RISK: "Без активности",
  };

  return labels[status];
}

function bonusLoadTone(status: GuestDashboardRow["bonusLoad"]["status"]) {
  if (status === "RISK") return "danger" as const;
  if (status === "WATCH") return "warning" as const;
  if (status === "NORMAL") return "good" as const;
  return "neutral" as const;
}

export function BonusLoadPanel({ summary }: { summary: GuestsSummary }) {
  const bonusLoad = summary.bonusLoad;

  return (
    <InsightCard className="mt-6 overflow-hidden">
      <InsightCardHeader
        eyebrow="Бонусы Langame"
        title="Бонусная нагрузка"
        description="Последний снимок бонусных балансов: общий бонусный долг сети, сколько бонусов лежит у неактивных гостей и насколько остаток сопоставим с выручкой периода."
        aside={
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60 lg:min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Последний снимок
            </p>
            <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
              {formatDate(bonusLoad.latestSnapshotAt)}
            </p>
          </div>
        }
      />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Бонусный остаток"
          value={formatRubles(bonusLoad.totalBalance)}
          caption={`${formatNumber(bonusLoad.guestsWithBalance)} гостей с бонусами`}
          tone={bonusLoad.totalBalance > 0 ? "warning" : "good"}
        />
        <KpiTile
          label="Без активности"
          value={formatRubles(bonusLoad.inactiveBalance)}
          caption={`${formatNumber(bonusLoad.inactiveGuests)} гостей в риске или без визитов`}
          tone={bonusLoad.inactiveBalance > 0 ? "danger" : "good"}
          href={guestsHref({
            ...summaryToFilters(summary),
            signal: "BONUS_WITHOUT_ACTIVITY",
            sort: "bonusLoad",
          })}
        />
        <KpiTile
          label="Средний остаток"
          value={formatRubles(bonusLoad.averageBalance)}
          caption="на гостя с бонусным балансом"
        />
        <KpiTile
          label="К выручке периода"
          value={
            bonusLoad.balanceToPeriodRevenuePercent === null
              ? "нет данных"
              : formatPercent(bonusLoad.balanceToPeriodRevenuePercent)
          }
          caption="бонусный остаток / деньги периода"
          tone={(bonusLoad.balanceToPeriodRevenuePercent ?? 0) >= 15 ? "warning" : "neutral"}
        />
      </div>
      {summary.bonusLoadGuestsRows.length > 0 ? (
        <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Гости с самым большим бонусным остатком
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Откройте гостя или отсортируйте список по бонусам, чтобы выбрать
                реактивацию.
              </p>
            </div>
            <PillLink
              href={guestsHref({ ...summaryToFilters(summary), sort: "bonusLoad" })}
            >
              Все по бонусам
            </PillLink>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.bonusLoadGuestsRows.slice(0, 6).map((row) => (
              <Link
                key={row.id}
                href={`/guests/${row.id}`}
                className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {row.displayName}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {row.guestGroupName ?? row.externalDomain ?? "источник"}
                    </p>
                  </div>
                  <InsightBadge tone={bonusLoadTone(row.bonusLoad.status)}>
                    {bonusLoadLabel(row.bonusLoad.status)}
                  </InsightBadge>
                </div>
                <p className="mt-3 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatRubles(row.bonusLoad.currentBalance)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  активность: {formatDate(row.lastActivityAt)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </InsightCard>
  );
}

export function RetentionPanel({ summary }: { summary: GuestsSummary }) {
  const retention = summary.retention;

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Удержание"
        title="Второй визит новых гостей"
        description="Когорта — гости, зарегистрированные в периоде. В знаменателе окна только те, у кого 7/14/30 дней уже прошли."
      />
      <div className="grid gap-2 px-4 pt-4 sm:grid-cols-3">
        <RetentionMetric
          label="Когорта"
          value={formatNumber(retention.cohortGuests)}
          caption="новых гостей"
        />
        <RetentionMetric
          label="Без 2-го визита"
          value={formatNumber(retention.withoutSecondActivity)}
          caption="нужен контакт"
          href={guestsHref({
            ...summaryToFilters(summary),
            signal: "NEW_WITHOUT_SECOND_VISIT",
            sort: "registered",
            direction: "asc",
          })}
        />
        <RetentionMetric
          label="До 2-го визита"
          value={
            retention.averageDaysToSecondActivity !== null
              ? `${formatNumber(retention.averageDaysToSecondActivity, 1)} дн`
              : "нет данных"
          }
          caption="в среднем"
        />
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-3">
        {retention.windows.map((window) => (
          <div
            key={window.days}
            className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  {window.days} дней
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatPercent(window.percent)}
                </p>
              </div>
              <InsightBadge tone="good">
                {formatNumber(window.returnedGuests)}/{formatNumber(window.eligibleGuests)}
              </InsightBadge>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {window.eligibleGuests > 0
                ? "вернулись в окно из созревшей когорты"
                : "когорта ещё не созрела для этого окна"}
              {window.pendingGuests > 0
                ? `, ожидают ${formatNumber(window.pendingGuests)}`
                : ""}
            </p>
          </div>
        ))}
      </div>
    </InsightCard>
  );
}

function RetentionMetric({
  label,
  value,
  caption,
  href,
}: {
  label: string;
  value: string;
  caption: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{caption}</p>
    </>
  );
  const className =
    "rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60";

  return href ? (
    <Link href={href} className={`${className} block hover:border-emerald-200`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function VisitHeatmapPanel({ summary }: { summary: GuestsSummary }) {
  const heatmap = summary.visitHeatmap;
  const maxSessionsCount = Math.max(heatmap.maxSessionsCount, 1);
  const peak = heatmap.peak;
  const cellMap = new Map(
    heatmap.cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]),
  );

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Загрузка"
        title="Тепловая карта визитов"
        description="Сессии по дню недели и часу старта (UTC). Насыщенность показывает, где загрузка уже есть, а где можно запускать офферы на тихие часы."
        aside={
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60 lg:min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Пиковое окно
            </p>
            <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
              {peak
                ? `${weekdayLabels[peak.weekday]}, ${hourRangeLabel(peak.hour)}`
                : "нет данных"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {peak
                ? `${formatNumber(peak.sessionsCount)} визитов, ${formatNumber(peak.activeGuests)} гостей`
                : "за период нет сессий"}
            </p>
          </div>
        }
      />
      <div className="p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 text-[10px] text-zinc-400">
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="text-center tabular-nums">
                  {hour}
                </span>
              ))}
            </div>
            <div className="mt-2 space-y-1">
              {([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => (
                <div
                  key={weekday}
                  className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1"
                >
                  <div className="flex h-8 items-center text-xs font-semibold text-zinc-500">
                    {weekdayLabels[weekday]}
                  </div>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = cellMap.get(`${weekday}-${hour}`);
                    const sessionsCount = cell?.sessionsCount ?? 0;
                    const intensity =
                      sessionsCount > 0
                        ? Math.max(0.16, sessionsCount / maxSessionsCount)
                        : 0;

                    return (
                      <div
                        key={`${weekday}-${hour}`}
                        title={`${weekdayLabels[weekday]}, ${hourRangeLabel(hour)}: ${formatNumber(sessionsCount)} визитов, ${formatNumber(cell?.activeGuests ?? 0)} гостей, ${formatNumber(cell?.playHours ?? 0, 1)} ч`}
                        className="flex h-8 min-w-0 items-center justify-center rounded border border-zinc-100 text-[10px] font-semibold tabular-nums text-zinc-700 dark:border-zinc-800 dark:text-zinc-100"
                        style={{
                          backgroundColor:
                            intensity > 0
                              ? `rgba(16, 185, 129, ${0.12 + intensity * 0.68})`
                              : "transparent",
                        }}
                      >
                        {sessionsCount > 0 ? sessionsCount : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span>Максимум в ячейке: {formatNumber(heatmap.maxSessionsCount)} визитов</span>
          <span>Максимум гостей: {formatNumber(heatmap.maxActiveGuests)}</span>
        </div>
      </div>
    </InsightCard>
  );
}

function forecastConfidenceLabel(
  confidence: GuestsSummary["flowForecast"]["confidence"],
) {
  const labels: Record<GuestsSummary["flowForecast"]["confidence"], string> = {
    LOW: "мало данных",
    MEDIUM: "средняя",
    HIGH: "высокая",
  };

  return labels[confidence];
}

export function FlowForecastPanel({ summary }: { summary: GuestsSummary }) {
  const forecast = summary.flowForecast;
  const maxSessions = Math.max(
    ...forecast.days.map((day) => day.expectedSessions),
    1,
  );

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Прогноз"
        title="Гостевой поток на 7 дней"
        description="Средние значения аналогичных дней недели из последней исторической выборки."
        aside={
          <InsightBadge
            tone={
              forecast.confidence === "HIGH"
                ? "good"
                : forecast.confidence === "MEDIUM"
                  ? "info"
                  : "warning"
            }
          >
            Надёжность: {forecastConfidenceLabel(forecast.confidence)}
          </InsightBadge>
        }
      />
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <KpiTile
          label="Визиты 7 дней"
          value={formatNumber(forecast.totalExpectedSessions)}
          caption={`${formatNumber(forecast.baselineDays)} дней в базе прогноза`}
        />
        <KpiTile
          label="Гости 7 дней"
          value={formatNumber(forecast.totalExpectedActiveGuests)}
          caption="сумма дневных прогнозов"
        />
        <KpiTile
          label="Игровые часы"
          value={`${formatNumber(forecast.totalExpectedPlayHours, 1)} ч`}
          caption={
            forecast.peakDay
              ? `пиковый день: ${weekdayLabels[forecast.peakDay.weekday]}`
              : "пик пока не определён"
          }
        />
      </div>
      <div className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
        {forecast.days.map((day) => {
          const width = Math.max(
            day.expectedSessions > 0 ? 6 : 0,
            (day.expectedSessions / maxSessions) * 100,
          );

          return (
            <div
              key={day.date}
              className="grid gap-2 sm:grid-cols-[120px_1fr_140px] sm:items-center"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {weekdayLabels[day.weekday]}
                </p>
                <p className="text-xs text-zinc-500">{formatPeriodDate(day.date)}</p>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300 sm:text-right">
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatNumber(day.expectedSessions)}
                </span>{" "}
                визитов
                <p className="text-xs text-zinc-500">
                  {formatNumber(day.expectedActiveGuests)} гостей ·{" "}
                  {formatNumber(day.expectedPlayHours, 1)} ч
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </InsightCard>
  );
}

function niceChartMax(value: number) {
  if (value <= 10) {
    return 10;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized =
    normalized <= 2 ? 2 : normalized <= 5 ? 5 : normalized <= 10 ? 10 : 20;

  return niceNormalized * magnitude;
}

export function VisitTrendPanel({ summary }: { summary: GuestsSummary }) {
  const maxVisits = niceChartMax(
    Math.max(
      ...summary.visitTrend.map((row) => row.sessionsCount),
      ...summary.visitTrend.map((row) => row.activeGuests),
      1,
    ),
  );
  const yTicks = [maxVisits, Math.round(maxVisits / 2), 0];
  const maxBarValue = Math.max(
    ...summary.visitTrend.map((row) => row.sessionsCount),
    1,
  );

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Динамика"
        title="Визиты по дням"
        description="Общая высота столбца — визиты, залитая часть — уникальные гости за день."
      />
      <div className="grid h-72 grid-cols-[48px_minmax(0,1fr)] gap-3 px-5 py-5">
        <div className="grid h-full grid-rows-[1fr_auto]">
          <div className="relative">
            {yTicks.map((tick, index) => (
              <span
                key={`${tick}-${index}`}
                className="absolute right-0 translate-y-1/2 text-xs tabular-nums text-zinc-400"
                style={{ bottom: `${(tick / maxVisits) * 100}%` }}
              >
                {formatNumber(tick)}
              </span>
            ))}
          </div>
          <span className="h-4" />
        </div>
        <div className="grid h-full grid-rows-[1fr_auto]">
          <div className="relative min-h-0 border-l border-zinc-200 dark:border-zinc-800">
            {yTicks.map((tick, index) => (
              <div
                key={`${tick}-${index}`}
                className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-900"
                style={{ bottom: `${(tick / maxVisits) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 grid grid-cols-[repeat(auto-fit,minmax(12px,1fr))] items-end gap-1 pl-2">
              {summary.visitTrend.map((row) => {
                const visitsHeight = Math.max(
                  row.sessionsCount > 0 ? 3 : 0,
                  (row.sessionsCount / maxVisits) * 100,
                );
                const guestsHeight =
                  row.sessionsCount > 0
                    ? Math.min(
                        100,
                        (Math.min(row.activeGuests, row.sessionsCount) /
                          row.sessionsCount) *
                          100,
                      )
                    : 0;

                return (
                  <div
                    key={row.date}
                    className="group flex h-full flex-col justify-end"
                    title={`${formatPeriodDate(row.date)}: ${formatNumber(row.sessionsCount)} визитов, ${formatNumber(row.activeGuests)} гостей`}
                  >
                    <div
                      className="flex min-h-0 w-full items-end overflow-hidden rounded-t bg-emerald-200 transition-colors group-hover:bg-emerald-300 dark:bg-emerald-500/25 dark:group-hover:bg-emerald-500/35"
                      style={{ height: `${visitsHeight}%` }}
                    >
                      <div
                        className="w-full rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-600 dark:bg-emerald-400 dark:group-hover:bg-emerald-300"
                        style={{ height: `${guestsHeight}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid h-4 grid-cols-[repeat(auto-fit,minmax(12px,1fr))] gap-1 pl-2">
            {summary.visitTrend.map((row) => (
              <span
                key={row.date}
                className="hidden text-center text-[10px] text-zinc-400 min-[1200px]:block"
              >
                {row.date.slice(8, 10)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-500/25" />
          Визиты, максимум {formatNumber(maxBarValue)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
          Уникальные гости
        </span>
      </div>
    </InsightCard>
  );
}

export function DataQualityPanel({ summary }: { summary: GuestsSummary }) {
  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Источники"
        title="Качество данных Langame"
        description="Foundation показывает, что можно считать уже сейчас."
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <QualityMetric
            label="Сессии без гостя"
            value={summary.dataQuality.sessionsWithoutGuestId}
          />
          <QualityMetric
            label="Транзакции без гостя"
            value={summary.dataQuality.transactionsWithoutGuestId}
          />
          <QualityMetric
            label="Продажи без связи"
            value={summary.dataQuality.salesMissingGuestLink}
          />
        </div>
        {summary.dataQuality.unavailableEndpoints.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Недоступно в Langame сейчас</p>
            <p className="mt-2">
              {summary.dataQuality.unavailableEndpoints.join(", ")} возвращают
              ошибку API, поэтому балансы и бонусы не участвуют в KPI.
            </p>
          </div>
        ) : null}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {summary.dataQuality.latestProfileRuns.map((run) => (
            <div key={`${run.domain}-${run.startedAt}`} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{run.domain}</span>
                <span className="text-xs text-zinc-500">{run.status}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatNumber(run.guestsCount)} гостей,{" "}
                {formatNumber(run.sessionsCount)} сессий,{" "}
                {formatNumber(run.transactionsCount)} транзакций,{" "}
                {formatNumber(run.productSalesLinked)} продаж связано
              </p>
            </div>
          ))}
        </div>
      </div>
    </InsightCard>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

export function GuestMiniTable({
  title,
  rows,
  reportFilters,
}: {
  title: string;
  rows: GuestDashboardRow[];
  reportFilters?: GuestListFilters;
}) {
  return (
    <InsightCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {reportFilters ? (
          <div className="flex flex-wrap gap-2">
            <PillLink href={guestsReportHref(reportFilters)} external>
              Открыть
            </PillLink>
            <PillLink href={guestsExportHref(reportFilters)} external tone="accent">
              CSV
            </PillLink>
          </div>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/guests/${row.id}`}
              className="grid gap-3 px-5 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 md:grid-cols-[minmax(0,1fr)_120px_170px]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                  {row.displayName}
                </p>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {row.contact} · {row.guestGroupName ?? row.externalDomain ?? "источник"}
                </p>
              </div>
              <div>
                <InsightBadge tone={segmentTone(row.segment)}>
                  {segmentLabels[row.segment]}
                </InsightBadge>
              </div>
              <div className="text-right text-sm tabular-nums">
                <p className="font-medium">
                  {formatRubles(row.transactionAmount + row.barRevenue)}
                </p>
                <p className="text-xs text-zinc-500">
                  LTV {formatRubles(row.ltv.totalRevenue)} ·{" "}
                  {formatNumber(row.sessionsCount)} сессий
                </p>
                {row.bonusLoad.currentBalance > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-300">
                    бонусы {formatRubles(row.bonusLoad.currentBalance)}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Данных пока нет.</p>
      )}
    </InsightCard>
  );
}
