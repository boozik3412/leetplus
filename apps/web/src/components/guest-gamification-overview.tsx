import Link from "next/link";
import type {
  GuestCohortStats,
  GuestListFilters,
  GuestsGamificationSummary,
} from "@/lib/guests";
import {
  formatNumber,
  formatPercent,
  formatRubles,
  gameEngagementLabels,
  gameEngagementTone,
  guestListAnchorHref,
} from "@/lib/guest-insights";
import {
  EmptyNote,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  KpiTile,
  PillLink,
} from "@/components/guest-insight-ui";

type Scope = Pick<
  GuestListFilters,
  "dateFrom" | "dateTo" | "storeId" | "guestGroupId"
>;

function FunnelStep({
  label,
  value,
  percent,
  href,
}: {
  label: string;
  value: number;
  percent: number | null;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {percent === null ? "—" : `${formatPercent(percent, 0)} от предыдущего шага`}
      </p>
    </>
  );
  const className =
    "rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50";

  return href ? (
    <Link
      href={href}
      className={`${className} block transition-colors hover:border-emerald-200 dark:hover:border-emerald-500/30`}
    >
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function CohortColumn({ title, stats }: { title: string; stats: GuestCohortStats }) {
  return (
    <div className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </p>
      <p className="text-xs text-zinc-500">{formatNumber(stats.guests)} гостей</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-zinc-500">Повторные</dt>
        <dd className="text-right font-medium tabular-nums">
          {formatPercent(stats.repeatShare, 0)}
        </dd>
        <dt className="text-zinc-500">Дней с визитами</dt>
        <dd className="text-right font-medium tabular-nums">
          {stats.averageVisitDays ?? "—"}
        </dd>
        <dt className="text-zinc-500">Сессий</dt>
        <dd className="text-right font-medium tabular-nums">
          {stats.averageSessions ?? "—"}
        </dd>
        <dt className="text-zinc-500">Денег на гостя</dt>
        <dd className="text-right font-medium tabular-nums">
          {stats.averageRevenue === null ? "—" : formatRubles(stats.averageRevenue)}
        </dd>
        <dt className="text-zinc-500">Бар на гостя</dt>
        <dd className="text-right font-medium tabular-nums">
          {stats.averageBarRevenue === null
            ? "—"
            : formatRubles(stats.averageBarRevenue)}
        </dd>
        <dt className="text-zinc-500">В риске/потеряны</dt>
        <dd className="text-right font-medium tabular-nums">
          {formatPercent(stats.riskShare, 0)}
        </dd>
      </dl>
    </div>
  );
}

export function GuestGamificationOverview({
  gamification,
  scope,
}: {
  gamification: GuestsGamificationSummary;
  scope: Scope;
}) {
  const listHref = (filters: Partial<GuestListFilters>) =>
    guestListAnchorHref({ ...scope, ...filters, page: "1", pageSize: "50" });

  if (!gamification.available) {
    return (
      <InsightCard>
        <InsightCardHeader
          eyebrow="Геймификация"
          title="Игровой модуль в клиентской базе"
        />
        <div className="p-5">
          <EmptyNote>
            {gamification.reason === "NO_CAPABILITY"
              ? "Для игрового блока нужно право «Геймификация: просмотр». Остальная аналитика гостей доступна."
              : "Игровой модуль ещё не настроен для этой сети."}
          </EmptyNote>
        </div>
      </InsightCard>
    );
  }

  const { funnel, shares, rewards, profiles, effect, topPlayers } = gamification;

  return (
    <InsightCard>
      <InsightCardHeader
        eyebrow="Геймификация"
        title="Игровой модуль в клиентской базе"
        description="Связка по GuestGameProfile.guestId: сколько гостей из выборки зарегистрированы в игре, играют, получают награды и бонусы. Тестовые профили сотрудников исключены."
        aside={
          <div className="flex flex-wrap gap-2">
            <PillLink href="/gamification">Guest Game Hub</PillLink>
            <PillLink href="/gamification?tab=statistics">Статистика игры</PillLink>
          </div>
        }
      />
      <div className="grid gap-2 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <FunnelStep label="Гостей в выборке" value={funnel.guests} percent={null} />
        <FunnelStep
          label="В игре"
          value={funnel.registered}
          percent={shares.registeredPercent}
          href={listHref({ gameStatus: "registered", sort: "level" })}
        />
        <FunnelStep
          label="Активировали"
          value={funnel.activated}
          percent={shares.activatedPercent}
        />
        <FunnelStep
          label="Играли в периоде"
          value={funnel.activeInPeriod}
          percent={shares.activePercent}
          href={listHref({ gameStatus: "active", sort: "gameActivity" })}
        />
        <FunnelStep
          label="Получили награду"
          value={funnel.withRewardsInPeriod}
          percent={
            funnel.activeInPeriod > 0
              ? Math.round((funnel.withRewardsInPeriod / funnel.activeInPeriod) * 1000) / 10
              : null
          }
        />
        <FunnelStep
          label="Бонусы в Langame"
          value={funnel.withConfirmedBonusesInPeriod}
          percent={
            funnel.withRewardsInPeriod > 0
              ? Math.round(
                  (funnel.withConfirmedBonusesInPeriod / funnel.withRewardsInPeriod) *
                    1000,
                ) / 10
              : null
          }
        />
      </div>
      <div className="grid gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Награды к получению"
          value={formatNumber(rewards.pendingWalletItems)}
          caption={`${formatNumber(rewards.guestsWithPendingRewards)} гостей · сгорает за неделю: ${formatNumber(rewards.expiringSoonItems)}`}
          tone={rewards.expiringSoonItems > 0 ? "warning" : "neutral"}
          href={listHref({ gameStatus: "pending_rewards", sort: "pendingRewards" })}
          formula="Wallet-item в статусе PENDING/FAILED с неистёкшим 30-дневным сроком"
        />
        <KpiTile
          label="Выдано наград"
          value={formatNumber(rewards.paidInPeriod)}
          caption={`квалифицировано ${formatNumber(rewards.qualifiedInPeriod)}`}
          formula="GuestGameReward со статусом PAID по paidAt в периоде"
        />
        <KpiTile
          label="Бонусы начислены"
          value={formatRubles(rewards.bonusConfirmedAmountInPeriod)}
          caption={
            rewards.bonusPendingAmount > 0
              ? `в очереди ${formatRubles(rewards.bonusPendingAmount)}`
              : "очередь пуста"
          }
          tone="good"
          formula="Bonus ledger: EARN · GAMIFICATION · CONFIRMED по confirmedAt"
        />
        <KpiTile
          label="Профили без гостя"
          value={formatNumber(profiles.unlinked)}
          caption={`выпали из игры: ${formatNumber(profiles.idle)} · не активировали: ${formatNumber(profiles.notActivated)}`}
          tone={profiles.unlinked > 0 ? "warning" : "neutral"}
          href="/gamification/log"
          formula="GuestGameProfile без guestId (телефон не сопоставлен с базой Langame)"
        />
      </div>
      <div className="grid gap-4 border-t border-zinc-100 p-4 dark:border-zinc-800 xl:grid-cols-[1fr_1fr_320px]">
        <CohortColumn title="Активные гости в игре" stats={effect.registered} />
        <CohortColumn title="Активные гости без игры" stats={effect.notRegistered} />
        <div className="rounded-xl border border-zinc-100 p-4 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Топ игроков
          </p>
          {topPlayers.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Пока нет игроков в выборке.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {topPlayers.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <Link
                    href={`/guests/${row.id}`}
                    className="min-w-0 truncate font-medium text-zinc-800 hover:text-emerald-700 dark:text-zinc-200 dark:hover:text-emerald-300"
                  >
                    {row.displayName}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                    <span className="tabular-nums">
                      ур. {row.gameProfile?.level} · {formatNumber(row.gameProfile?.xp ?? 0)} XP
                    </span>
                    {row.gameProfile ? (
                      <InsightBadge tone={gameEngagementTone(row.gameProfile.engagement)}>
                        {gameEngagementLabels[row.gameProfile.engagement]}
                      </InsightBadge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        {effect.note}
      </p>
    </InsightCard>
  );
}
