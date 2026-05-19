import { requireCurrentUser } from "@/lib/auth";
import {
  getGuestsSummary,
  type GuestDashboardRow,
  type GuestsSummary,
} from "@/lib/guests";

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRubles(value: number) {
  return `${formatNumber(value)} руб`;
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

function segmentLabel(segment: GuestDashboardRow["segment"]) {
  const labels: Record<GuestDashboardRow["segment"], string> = {
    active: "Активный",
    new: "Новый",
    repeat: "Повторный",
    risk: "В риске",
    lost: "Потерянный",
    quiet: "Тихий",
  };

  return labels[segment];
}

export default async function GuestsPage() {
  await requireCurrentUser();
  const summary = await getGuestsSummary();

  return (
    <main className="px-6 py-8 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Аналитика клиентской базы
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Первый read-only слой: визиты, сессии, покупки бара и денежные
              операции за период {formatPeriodDate(summary.periodFrom)} -{" "}
              {formatPeriodDate(summary.periodTo)}. Бонусы и балансы скрыты,
              пока LAngame endpoints возвращают ошибку.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-zinc-500">Гостей в базе</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatNumber(summary.totalGuests)}
            </p>
          </div>
        </header>

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
            label="Денежные операции"
            value={formatRubles(summary.transactionAmount)}
            caption={`${formatNumber(summary.transactionsCount)} операций`}
          />
          <KpiCard
            label="Покупки бара"
            value={formatRubles(summary.barRevenue)}
            caption={`${formatNumber(summary.barSalesCount)} продаж`}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <VisitTrendPanel summary={summary} />
          <DataQualityPanel summary={summary} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GuestTable title="TOP гостей" rows={summary.topGuests} />
          <GuestTable title="Гости в риске" rows={summary.riskGuestsRows} />
        </section>
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

function VisitTrendPanel({ summary }: { summary: GuestsSummary }) {
  const maxSessions = Math.max(
    ...summary.visitTrend.map((row) => row.sessionsCount),
    1,
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Визиты по дням</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Сессии и активные гости по загруженным данным LAngame.
        </p>
      </div>
      <div className="grid h-72 grid-cols-[repeat(30,minmax(14px,1fr))] items-end gap-1 px-5 py-5">
        {summary.visitTrend.map((row) => {
          const height = Math.max(4, (row.sessionsCount / maxSessions) * 100);

          return (
            <div
              key={row.date}
              className="group flex h-full flex-col justify-end gap-2"
              title={`${formatPeriodDate(row.date)}: ${formatNumber(row.sessionsCount)} сессий, ${formatNumber(row.activeGuests)} гостей`}
            >
              <div
                className="rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-600"
                style={{ height: `${height}%` }}
              />
              <span className="hidden text-center text-[10px] text-zinc-400 min-[1200px]:block">
                {row.date.slice(8, 10)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DataQualityPanel({ summary }: { summary: GuestsSummary }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Качество данных LAngame</h2>
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
            <p className="font-semibold">Недоступно в LAngame сейчас</p>
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

function GuestTable({
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
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Гость</th>
                <th className="px-4 py-3 text-left font-semibold">Сегмент</th>
                <th className="px-4 py-3 text-right font-semibold">Сессии</th>
                <th className="px-4 py-3 text-right font-semibold">Деньги</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Активность
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {row.displayName}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.contact} · {row.externalDomain ?? "источник"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {segmentLabel(row.segment)}
                    </span>
                  </td>
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
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(row.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Данных пока нет.</p>
      )}
    </section>
  );
}
