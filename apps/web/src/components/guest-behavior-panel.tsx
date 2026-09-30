import type { GuestDetail } from "@/lib/guests";
import {
  formatDate,
  formatNumber,
  hourRangeLabel,
  weekdayFullLabels,
  weekdayLabels,
} from "@/lib/guest-insights";
import { InsightCard, InsightCardHeader } from "@/components/guest-insight-ui";

function MiniBars({
  rows,
  labelFor,
  highlight,
}: {
  rows: Array<{ key: number; sessions: number }>;
  labelFor: (key: number) => string;
  highlight: number | null;
}) {
  const max = Math.max(...rows.map((row) => row.sessions), 1);

  return (
    <div
      className="grid items-end gap-1"
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          title={`${labelFor(row.key)}: ${formatNumber(row.sessions)} сесс.`}
          className="flex h-16 flex-col justify-end"
        >
          <div
            className={[
              "w-full rounded-t",
              row.key === highlight
                ? "bg-emerald-500 dark:bg-emerald-400"
                : "bg-emerald-200 dark:bg-emerald-500/30",
            ].join(" ")}
            style={{
              height: `${Math.max(row.sessions > 0 ? 8 : 2, (row.sessions / max) * 100)}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function GuestBehaviorPanel({ guest }: { guest: GuestDetail }) {
  const behavior = guest.behavior;

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Поведение"
        title="Ритм визитов"
        description={`По стартам сессий за последние 90 дней (${formatNumber(behavior.sampleSessions)} сессий с ${formatDate(behavior.sampleFrom)}); время в UTC.`}
      />
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact
          label="Любимый клуб"
          value={behavior.favoriteStoreName ?? "не определён"}
          caption={
            behavior.favoriteStoreVisits > 0
              ? `${formatNumber(behavior.favoriteStoreVisits)} визитов`
              : "нет клубной привязки"
          }
        />
        <Fact
          label="Любимый день"
          value={
            behavior.favoriteWeekday
              ? weekdayFullLabels[behavior.favoriteWeekday]
              : "—"
          }
          caption={
            behavior.favoriteHour !== null
              ? `чаще всего ${hourRangeLabel(behavior.favoriteHour)}`
              : "часы не определены"
          }
        />
        <Fact
          label="Частота"
          value={
            behavior.sessionsPer30Days === null
              ? "—"
              : `${formatNumber(behavior.sessionsPer30Days, 1)} сесс./30 дн.`
          }
          caption={
            behavior.averageIntervalDays === null
              ? "мало истории для интервала"
              : `обычный интервал ${formatNumber(behavior.averageIntervalDays)} дн.`
          }
        />
        <Fact
          label="Без визита"
          value={
            behavior.daysSinceLastVisit === null
              ? "—"
              : `${formatNumber(behavior.daysSinceLastVisit)} дн.`
          }
          caption={guest.churnRisk.reason}
        />
      </div>
      <div className="grid gap-6 border-t border-zinc-100 p-4 dark:border-zinc-800 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Дни недели
          </p>
          <div className="mt-3">
            <MiniBars
              rows={behavior.weekdays.map((row) => ({
                key: row.weekday,
                sessions: row.sessions,
              }))}
              labelFor={(key) => weekdayLabels[key]}
              highlight={behavior.favoriteWeekday}
            />
            <div className="mt-1 grid grid-cols-7 text-center text-[10px] text-zinc-400">
              {behavior.weekdays.map((row) => (
                <span key={row.weekday}>{weekdayLabels[row.weekday]}</span>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Часы старта сессий
          </p>
          <div className="mt-3">
            <MiniBars
              rows={behavior.hours.map((row) => ({
                key: row.hour,
                sessions: row.sessions,
              }))}
              labelFor={hourRangeLabel}
              highlight={behavior.favoriteHour}
            />
            <div className="mt-1 grid grid-cols-24 text-center text-[10px] text-zinc-400">
              {behavior.hours.map((row) => (
                <span key={row.hour}>{row.hour % 3 === 0 ? row.hour : ""}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </InsightCard>
  );
}

function Fact({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{caption}</p>
    </div>
  );
}
