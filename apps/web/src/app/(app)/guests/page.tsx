import Link from "next/link";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { GuestDashboardFilters } from "@/components/guest-dashboard-filters";
import {
  getGuestFilterOptions,
  getGuests,
  getGuestsSummary,
  type GuestDashboardRow,
  type GuestListFilters,
  type GuestsSummary,
} from "@/lib/guests";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatNumber(value)} руб`;
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)}%`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function segmentLabel(segment: GuestDashboardRow["segment"] | "top") {
  const labels: Record<GuestDashboardRow["segment"] | "top", string> = {
    top: "TOP по деньгам",
    active: "Активные",
    new: "Новые",
    repeat: "Повторные",
    risk: "В риске",
    lost: "Потерянные",
    quiet: "Тихие",
  };

  return labels[segment];
}

function segmentBadge(segment: GuestDashboardRow["segment"]) {
  const tone =
    segment === "repeat" || segment === "active" || segment === "new"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20"
      : segment === "risk"
        ? "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20"
        : segment === "lost"
          ? "bg-red-50 text-red-700 ring-red-100 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/20"
          : "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800";

  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1",
        tone,
      ].join(" ")}
    >
      {segmentLabel(segment)}
    </span>
  );
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
  if (status === "RISK") {
    return "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20";
  }

  if (status === "WATCH") {
    return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20";
  }

  if (status === "NORMAL") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20";
  }

  return "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800";
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCurrentUser();
  const params = await searchParams;
  const filters: GuestListFilters = {
    dateFrom: searchParam(params.dateFrom),
    dateTo: searchParam(params.dateTo),
    storeId: searchParam(params.storeId),
    guestGroupId: searchParam(params.guestGroupId),
    segment: searchParam(params.segment) as GuestListFilters["segment"],
    crmStatus: searchParam(params.crmStatus) as GuestListFilters["crmStatus"],
    search: searchParam(params.search),
    page: searchParam(params.page),
    pageSize: searchParam(params.pageSize) ?? "50",
    sort: searchParam(params.sort) as GuestListFilters["sort"],
    direction: searchParam(params.direction) as GuestListFilters["direction"],
  };
  const selectedPeriod = searchParam(params.period);
  const [summary, guestList, options] = await Promise.all([
    getGuestsSummary(filters),
    getGuests(filters),
    getGuestFilterOptions(),
  ]);

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Гости"
          items={[{ href: "/dashboard", label: "Дашборд" }]}
        />
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Аналитика клиентской базы
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Read-only слой по гостям: визиты, сессии, пополнения баланса,
              покупки бара и бонусная нагрузка за период{" "}
              {formatPeriodDate(summary.periodFrom)} -{" "}
              {formatPeriodDate(summary.periodTo)}. Бонусы считаются по
              последнему снимку бонусных балансов Langame. По умолчанию
              администраторы исключены из клиентских отчетов; выберите
              админ-группу, чтобы посмотреть ее отдельно.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Link
              href={guestsReportHref(filters)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Полный отчет
            </Link>
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
            filters.search,
          ].join("|")}
          filters={filters}
          options={options}
          period={selectedPeriod}
          periodFrom={summary.periodFrom}
          periodTo={summary.periodTo}
        />

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label="Активные гости"
            value={formatNumber(summary.activeGuests)}
            caption="сессия, транзакция или покупка"
            tone="good"
          />
          <KpiCard
            label="Новые гости"
            value={formatNumber(summary.newGuests)}
            caption="регистрация внутри периода"
          />
          <KpiCard
            label="Повторные"
            value={formatNumber(summary.repeatGuests)}
            caption="2+ визита или активных дня"
            tone="good"
          />
          <KpiCard
            label="В риске"
            value={formatNumber(summary.riskGuests)}
            caption="нет активности 14+ дней"
            tone="warning"
          />
          <KpiCard
            label="Потерянные"
            value={formatNumber(summary.lostGuests)}
            caption="нет активности 30+ дней"
            tone="danger"
          />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Сессии"
            value={formatNumber(summary.sessionsCount)}
            caption={`${formatNumber(summary.playHours, 1)} часов игры`}
          />
          <KpiCard
            label="Средняя сессия"
            value={`${formatNumber(summary.averageSessionMinutes)} мин`}
            caption="по завершенным сессиям"
          />
          <KpiCard
            label="Пополнение баланса"
            value={formatRubles(summary.transactionAmount)}
            caption={`${formatNumber(summary.transactionsCount)} операций`}
          />
          <KpiCard
            label="Покупки бара"
            value={formatRubles(summary.barRevenue)}
            caption={`${formatNumber(summary.barSalesCount)} продаж`}
          />
        </section>

        <BonusLoadPanel summary={summary} />

        <RetentionPanel summary={summary} />
        <VisitHeatmapPanel summary={summary} />
        <FlowForecastPanel summary={summary} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <VisitTrendPanel summary={summary} />
          <DataQualityPanel summary={summary} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GuestMiniTable title="TOP гостей" rows={summary.topGuests} />
          <GuestMiniTable title="Гости в риске" rows={summary.riskGuestsRows} />
        </section>

        <GuestListTable filters={filters} guestList={guestList} />
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-red-700 dark:text-red-300"
          : "text-zinc-950 dark:text-zinc-50";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p
        className={["mt-3 text-2xl font-semibold tabular-nums", toneClass].join(
          " ",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{caption}</p>
    </div>
  );
}

function BonusLoadPanel({ summary }: { summary: GuestsSummary }) {
  const bonusLoad = summary.bonusLoad;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Бонусная нагрузка</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Считаем последний снимок бонусных балансов: общий бонусный долг
            сети, сколько бонусов лежит у неактивных гостей и насколько
            остаток сопоставим с выручкой выбранного периода.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60 lg:min-w-[260px]">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Последний снимок
          </p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {formatDate(bonusLoad.latestSnapshotAt)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Данные появляются после успешной синхронизации бонусных балансов.
          </p>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Бонусный остаток"
          value={formatRubles(bonusLoad.totalBalance)}
          caption={`${formatNumber(bonusLoad.guestsWithBalance)} гостей с бонусами`}
          tone={bonusLoad.totalBalance > 0 ? "warning" : "good"}
        />
        <KpiCard
          label="Без активности"
          value={formatRubles(bonusLoad.inactiveBalance)}
          caption={`${formatNumber(bonusLoad.inactiveGuests)} гостей в риске или без визитов`}
          tone={bonusLoad.inactiveBalance > 0 ? "danger" : "good"}
        />
        <KpiCard
          label="Средний остаток"
          value={formatRubles(bonusLoad.averageBalance)}
          caption="на гостя с бонусным балансом"
        />
        <KpiCard
          label="К выручке периода"
          value={
            bonusLoad.balanceToPeriodRevenuePercent === null
              ? "нет данных"
              : formatPercent(bonusLoad.balanceToPeriodRevenuePercent)
          }
          caption="бонусный остаток / деньги периода"
          tone={
            (bonusLoad.balanceToPeriodRevenuePercent ?? 0) >= 15
              ? "warning"
              : "neutral"
          }
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
                Откройте гостя или отсортируйте полный список по бонусам, чтобы
                выбрать реактивацию.
              </p>
            </div>
            <Link
              href={guestsHref({ ...summaryToFilters(summary), sort: "bonusLoad" })}
              className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Все по бонусам
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {summary.bonusLoadGuestsRows.slice(0, 6).map((row) => (
              <Link
                key={row.id}
                href={`/guests/${row.id}`}
                className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
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
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1",
                      bonusLoadTone(row.bonusLoad.status),
                    ].join(" ")}
                  >
                    {bonusLoadLabel(row.bonusLoad.status)}
                  </span>
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
    </section>
  );
}

const weekdayLabels: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

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

function forecastConfidenceTone(
  confidence: GuestsSummary["flowForecast"]["confidence"],
) {
  if (confidence === "HIGH") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20";
  }

  if (confidence === "MEDIUM") {
    return "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20";
  }

  return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20";
}

function VisitHeatmapPanel({ summary }: { summary: GuestsSummary }) {
  const heatmap = summary.visitHeatmap;
  const maxSessionsCount = Math.max(heatmap.maxSessionsCount, 1);
  const peak = heatmap.peak;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Тепловая карта визитов</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Сессии сгруппированы по дню недели и часу старта за выбранный
            период. Насыщенность показывает, где загрузка уже есть, а где можно
            запускать офферы на тихие часы.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60 lg:min-w-[260px]">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            Пиковое окно
          </p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {peak
              ? `${weekdayLabels[peak.weekday]}, ${formatHourRange(peak.hour)}`
              : "нет данных"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {peak
              ? `${formatNumber(peak.sessionsCount)} визитов, ${formatNumber(peak.activeGuests)} гостей`
              : "за период нет сессий"}
          </p>
        </div>
      </div>
      <div className="p-5">
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
                    const cell = heatmap.cells.find(
                      (item) => item.weekday === weekday && item.hour === hour,
                    );
                    const sessionsCount = cell?.sessionsCount ?? 0;
                    const intensity =
                      sessionsCount > 0
                        ? Math.max(0.16, sessionsCount / maxSessionsCount)
                        : 0;

                    return (
                      <div
                        key={`${weekday}-${hour}`}
                        title={`${weekdayLabels[weekday]}, ${formatHourRange(hour)}: ${formatNumber(sessionsCount)} визитов, ${formatNumber(cell?.activeGuests ?? 0)} гостей, ${formatNumber(cell?.playHours ?? 0, 1)} ч`}
                        className="flex h-8 min-w-0 items-center justify-center rounded border border-zinc-100 text-[10px] font-semibold tabular-nums text-zinc-700 transition-transform hover:scale-105 dark:border-zinc-800 dark:text-zinc-100"
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
          <span>Время показано по данным стартов сессий Langame.</span>
        </div>
      </div>
    </section>
  );
}

function FlowForecastPanel({ summary }: { summary: GuestsSummary }) {
  const forecast = summary.flowForecast;
  const maxSessions = Math.max(
    ...forecast.days.map((day) => day.expectedSessions),
    1,
  );

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Прогноз гостевого потока</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Прогноз на ближайшие 7 дней строится по средним значениям
            аналогичных дней недели из последней исторической выборки.
          </p>
        </div>
        <span
          className={[
            "inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1",
            forecastConfidenceTone(forecast.confidence),
          ].join(" ")}
        >
          Надежность: {forecastConfidenceLabel(forecast.confidence)}
        </span>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-3">
        <KpiCard
          label="Визиты 7 дней"
          value={formatNumber(forecast.totalExpectedSessions)}
          caption={`${formatNumber(forecast.baselineDays)} дней в базе прогноза`}
        />
        <KpiCard
          label="Гости 7 дней"
          value={formatNumber(forecast.totalExpectedActiveGuests)}
          caption="сумма дневных прогнозов"
        />
        <KpiCard
          label="Игровые часы"
          value={`${formatNumber(forecast.totalExpectedPlayHours, 1)} ч`}
          caption={
            forecast.peakDay
              ? `пиковый день: ${weekdayLabels[forecast.peakDay.weekday]}`
              : "пик пока не определен"
          }
        />
      </div>
      <div className="grid gap-5 border-t border-zinc-100 p-5 dark:border-zinc-800 xl:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {forecast.days.map((day) => {
            const width = Math.max(
              day.expectedSessions > 0 ? 6 : 0,
              (day.expectedSessions / maxSessions) * 100,
            );

            return (
              <div key={day.date} className="grid gap-2 sm:grid-cols-[120px_1fr_120px] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {weekdayLabels[day.weekday]}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatPeriodDate(day.date)}
                  </p>
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
        <div className="grid gap-3 text-sm">
          <ForecastSideCard
            label="Пиковый день"
            day={forecast.peakDay}
            empty="недостаточно данных"
          />
          <ForecastSideCard
            label="Тихий день"
            day={forecast.quietDay}
            empty="недостаточно данных"
          />
        </div>
      </div>
    </section>
  );
}

function ForecastSideCard({
  label,
  day,
  empty,
}: {
  label: string;
  day: GuestsSummary["flowForecast"]["peakDay"];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      {day ? (
        <>
          <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {weekdayLabels[day.weekday]}, {formatPeriodDate(day.date)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {formatNumber(day.expectedSessions)} визитов,{" "}
            {formatNumber(day.expectedActiveGuests)} гостей
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">{empty}</p>
      )}
    </div>
  );
}

function formatHourRange(hour: number) {
  const nextHour = (hour + 1) % 24;
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${pad(hour)}:00-${pad(nextHour)}:00`;
}

function RetentionPanel({ summary }: { summary: GuestsSummary }) {
  const retention = summary.retention;

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Удержание новых гостей
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Считаем второй день активности для гостей, зарегистрированных в
            выбранном периоде. В знаменателе только те, у кого окно 7/14/30
            дней уже успело пройти.
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
          <RetentionMetric
            label="Когорта"
            value={formatNumber(retention.cohortGuests)}
            caption="новых гостей"
          />
          <RetentionMetric
            label="Без 2-го визита"
            value={formatNumber(retention.withoutSecondActivity)}
            caption="нужен контакт"
          />
          <RetentionMetric
            label="До 2-го визита"
            value={
              retention.averageDaysToSecondActivity !== null
                ? `${formatNumber(retention.averageDaysToSecondActivity, 1)} дн`
                : "нет данных"
            }
            caption="среднее"
          />
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {retention.windows.map((window) => (
          <div
            key={window.days}
            className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  {window.days} дней
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatPercent(window.percent)}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">
                {formatNumber(window.returnedGuests)}/
                {formatNumber(window.eligibleGuests)}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              {window.eligibleGuests > 0
                ? "вернулись в окно из созревшей когорты"
                : "когорта еще не созрела для этого окна"}
              {window.pendingGuests > 0
                ? `, ожидают ${formatNumber(window.pendingGuests)}`
                : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RetentionMetric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{caption}</p>
    </div>
  );
}

function VisitTrendPanel({ summary }: { summary: GuestsSummary }) {
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
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Визиты по дням</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Общая высота столбца - визиты, залитая часть - уникальные гости за
          день.
        </p>
      </div>
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
    </section>
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

function DataQualityPanel({ summary }: { summary: GuestsSummary }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Качество данных Langame</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Foundation показывает, что можно считать уже сейчас.
        </p>
      </div>
      <div className="space-y-4 p-5">
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Недоступно в Langame сейчас</p>
            <p className="mt-2">
              {summary.dataQuality.unavailableEndpoints.join(", ")} возвращают
              ошибку API, поэтому балансы и бонусы не участвуют в KPI.
            </p>
          </div>
        ) : null}

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {summary.dataQuality.latestProfileRuns.map((run) => (
            <div
              key={`${run.domain}-${run.startedAt}`}
              className="py-3 text-sm"
            >
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
    </section>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function GuestMiniTable({
  title,
  rows,
}: {
  title: string;
  rows: GuestDashboardRow[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <GuestCompactRow key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Данных пока нет.</p>
      )}
    </section>
  );
}

function GuestCompactRow({ row }: { row: GuestDashboardRow }) {
  return (
    <Link
      href={`/guests/${row.id}`}
      className="grid gap-3 px-5 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50 md:grid-cols-[minmax(0,1fr)_120px_170px]"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-950 dark:text-zinc-50">
          {row.displayName}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {row.contact} ·{" "}
          {row.guestGroupName ?? row.externalDomain ?? "источник"}
        </p>
      </div>
      <div>{segmentBadge(row.segment)}</div>
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
  );
}

function GuestListTable({
  filters,
  guestList,
}: {
  filters: GuestListFilters;
  guestList: Awaited<ReturnType<typeof getGuests>>;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div
        id="guest-list"
        className="flex scroll-mt-6 flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h2 className="text-base font-semibold">Список гостей</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {formatNumber(guestList.totalRows)} гостей, страница{" "}
            {formatNumber(guestList.page)} из{" "}
            {formatNumber(guestList.totalPages)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <SortLink filters={filters} sort="revenue" label="Деньги" />
          <SortLink filters={filters} sort="ltv" label="LTV" />
          <SortLink filters={filters} sort="bonusLoad" label="Бонусы" />
          <SortLink filters={filters} sort="sessions" label="Сессии" />
          <SortLink filters={filters} sort="lastActivity" label="Активность" />
          <SortLink filters={filters} sort="registered" label="Регистрация" />
        </div>
      </div>
      {guestList.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Гость</th>
                <th className="px-4 py-3 text-left font-semibold">Сегмент</th>
                <th className="px-4 py-3 text-right font-semibold">Сессии</th>
                <th className="px-4 py-3 text-right font-semibold">Деньги</th>
                <th className="px-4 py-3 text-right font-semibold">LTV</th>
                <th className="px-4 py-3 text-right font-semibold">Бонусы</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Активность
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {guestList.rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/guests/${row.id}`}
                      className="font-medium text-zinc-950 hover:text-emerald-700 dark:text-zinc-50 dark:hover:text-emerald-300"
                    >
                      {row.displayName}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.contact} ·{" "}
                      {row.guestGroupName ?? row.externalDomain ?? "источник"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{segmentBadge(row.segment)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(row.sessionsCount)}
                    <p className="text-xs text-zinc-500">
                      {formatNumber(row.playHours, 1)} ч
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.transactionAmount + row.barRevenue)}
                    <p className="text-xs text-zinc-500">
                      бар {formatRubles(row.barRevenue)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.ltv.totalRevenue)}
                    <p className="text-xs text-zinc-500">
                      {formatNumber(row.ltv.revenueDays)} дн.
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(row.bonusLoad.currentBalance)}
                    <p
                      className={[
                        "text-xs",
                        row.bonusLoad.status === "RISK"
                          ? "text-rose-600 dark:text-rose-300"
                          : row.bonusLoad.status === "WATCH"
                            ? "text-amber-600 dark:text-amber-300"
                            : "text-zinc-500",
                      ].join(" ")}
                    >
                      {bonusLoadLabel(row.bonusLoad.status)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(row.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">
          По текущему фильтру гостей не найдено.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 text-sm dark:border-zinc-800">
        <PaginationLink
          filters={filters}
          page={guestList.page - 1}
          disabled={guestList.page <= 1}
        >
          Назад
        </PaginationLink>
        <span className="text-zinc-500">
          {formatNumber(guestList.page)} / {formatNumber(guestList.totalPages)}
        </span>
        <PaginationLink
          filters={filters}
          page={guestList.page + 1}
          disabled={guestList.page >= guestList.totalPages}
        >
          Вперед
        </PaginationLink>
      </div>
    </section>
  );
}

function SortLink({
  filters,
  sort,
  label,
}: {
  filters: GuestListFilters;
  sort: NonNullable<GuestListFilters["sort"]>;
  label: string;
}) {
  const currentSort = filters.sort ?? "revenue";
  const currentDirection = filters.direction ?? "desc";
  const nextDirection =
    currentSort === sort && currentDirection === "desc" ? "asc" : "desc";
  const isActive = currentSort === sort;

  return (
    <Link
      href={guestsHref({
        ...filters,
        sort,
        direction: nextDirection,
        page: "1",
      })}
      className={[
        "rounded-full border px-3 py-1.5 transition-colors",
        isActive
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-zinc-950"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function PaginationLink({
  filters,
  page,
  disabled,
  children,
}: {
  filters: GuestListFilters;
  page: number;
  disabled: boolean;
  children: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-400 dark:border-zinc-800">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={guestsHref({ ...filters, page: String(page) })}
      className="rounded-md border border-zinc-300 px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}

function summaryToFilters(summary: GuestsSummary): GuestListFilters {
  return {
    dateFrom: summary.periodFrom,
    dateTo: summary.periodTo,
    storeId: summary.storeId ?? undefined,
    guestGroupId: summary.guestGroupId ?? undefined,
    page: "1",
    pageSize: "50",
  };
}

function guestsHref(filters: GuestListFilters) {
  return guestsPathHref("/guests", filters);
}

function guestsReportHref(filters: GuestListFilters) {
  return guestsPathHref("/guests/report", {
    ...filters,
    page: "1",
    pageSize: "200",
  });
}

function guestsPathHref(pathname: string, filters: GuestListFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
