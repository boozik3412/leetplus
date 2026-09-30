import type { GuestDetail } from "@/lib/guests";
import {
  consentLabels,
  consentTone,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRubles,
  gameEngagementLabels,
  gameEngagementTone,
  gameEventTypeLabel,
  ledgerStatusLabels,
  rewardSourceKindLabels,
  rewardStatusLabels,
  walletStatusLabels,
} from "@/lib/guest-insights";
import {
  EmptyNote,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  KpiTile,
  PillLink,
} from "@/components/guest-insight-ui";

export function GuestGameCard({ guest }: { guest: GuestDetail }) {
  if (guest.gameAccess === "NO_CAPABILITY") {
    return (
      <InsightCard>
        <InsightCardHeader eyebrow="Геймификация" title="Игровой профиль" />
        <div className="p-5">
          <EmptyNote>
            Игровые данные видны только с правом «Геймификация: просмотр».
          </EmptyNote>
        </div>
      </InsightCard>
    );
  }

  const detail = guest.gamification;

  if (!detail) {
    return (
      <InsightCard>
        <InsightCardHeader
          eyebrow="Геймификация"
          title="Игровой профиль не найден"
          description="Гость не зарегистрирован в игровом модуле или его телефон ещё не сопоставлен с профилем. Профиль появляется после регистрации через Telegram или веб-кабинет и подтверждения телефона."
          aside={<PillLink href="/gamification?tab=profiles">Guest Game Hub</PillLink>}
        />
        <div className="p-5">
          <EmptyNote>
            {guest.segment === "repeat" || guest.segment === "active"
              ? "Гость регулярно играет в клубе: это кандидат на приглашение в игру (QR в клубе или Telegram-бот)."
              : "Приглашение в игру имеет смысл после возврата гостя в клуб."}
          </EmptyNote>
        </div>
      </InsightCard>
    );
  }

  const profile = detail.profile;
  const levelProgress =
    profile.xpToNextLevel + (profile.xp % 500) > 0
      ? Math.min(100, Math.round(((profile.xp % 500) / 500) * 100))
      : 0;

  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader
        eyebrow="Геймификация"
        title={`Уровень ${profile.level} · ${formatNumber(profile.xp)} XP`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <InsightBadge tone={gameEngagementTone(profile.engagement)}>
              {gameEngagementLabels[profile.engagement]}
            </InsightBadge>
            <InsightBadge tone={consentTone(profile.phoneConsentStatus)}>
              {consentLabels[profile.phoneConsentStatus]}
            </InsightBadge>
            {profile.channels.telegram ? (
              <InsightBadge tone="info">Telegram</InsightBadge>
            ) : null}
            {profile.channels.max ? <InsightBadge tone="info">MAX</InsightBadge> : null}
            {profile.isStaffTest ? (
              <InsightBadge tone="warning">Тест сотрудника</InsightBadge>
            ) : null}
            <span className="text-xs text-zinc-500">
              регистрация {formatDate(profile.registeredAt)} · активация{" "}
              {formatDate(profile.gameActivatedAt)} · последнее событие{" "}
              {formatDate(profile.lastGameActivityAt)}
            </span>
          </span>
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <PillLink href="/gamification?tab=profiles">Guest Game Hub</PillLink>
            <PillLink href="/gamification/log">Игровой журнал</PillLink>
          </div>
        }
      />
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>До следующего уровня {formatNumber(profile.xpToNextLevel)} XP</span>
          <span>{levelProgress} %</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
          <div
            className="h-full rounded-full bg-violet-500"
            style={{ width: `${levelProgress}%` }}
          />
        </div>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Награды к получению"
          value={formatNumber(profile.pendingRewards)}
          caption={
            profile.pendingRewards > 0
              ? `ближайшая сгорает ${formatDate(profile.nearestRewardExpiresAt)}`
              : "кошелёк пуст"
          }
          tone={profile.rewardsExpiringSoon > 0 ? "warning" : "neutral"}
        />
        <KpiTile
          label="Выдано наград"
          value={formatNumber(profile.rewardsPaidTotal)}
          caption={`за период ${formatNumber(profile.rewardsPaidInPeriod)} · квалификаций ${formatNumber(profile.rewardsQualifiedInPeriod)}`}
        />
        <KpiTile
          label="Бонусы начислены"
          value={formatRubles(profile.bonusConfirmedTotal)}
          caption={
            profile.bonusPendingAmount > 0
              ? `в очереди ${formatRubles(profile.bonusPendingAmount)}`
              : `за период ${formatRubles(profile.bonusConfirmedInPeriod)}`
          }
          tone="good"
        />
        <KpiTile
          label="Игровые события"
          value={formatNumber(detail.totals.events)}
          caption={`за период ${formatNumber(profile.gameEventsInPeriod)} доверенных`}
        />
      </div>
      <div className="grid gap-5 border-t border-zinc-100 p-4 dark:border-zinc-800 xl:grid-cols-2">
        <ListBlock title="Кошелёк наград" emptyLabel="Записей кошелька нет.">
          {detail.wallet.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-xs text-zinc-500">
                  {item.rewardLabel} · {rewardSourceKindLabels[item.sourceKind] ?? item.sourceKind}
                  {item.storeName ? ` · ${item.storeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <InsightBadge
                  tone={
                    item.status === "CLAIMED"
                      ? "good"
                      : item.status === "FAILED"
                        ? "danger"
                        : item.status === "PENDING"
                          ? "warning"
                          : "info"
                  }
                >
                  {walletStatusLabels[item.status] ?? item.status}
                </InsightBadge>
                <p className="mt-1 text-zinc-500">
                  {item.claimedAt
                    ? `получена ${formatDate(item.claimedAt)}`
                    : `ещё ${formatNumber(item.expiresInDays)} дн.`}
                </p>
              </div>
            </li>
          ))}
        </ListBlock>
        <ListBlock title="Награды" emptyLabel="Наград пока нет.">
          {detail.rewards.map((reward) => (
            <li key={reward.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{reward.rewardLabel}</p>
                <p className="text-xs text-zinc-500">
                  {rewardSourceKindLabels[reward.sourceKind]}
                  {reward.sourceName ? `: ${reward.sourceName}` : ""}
                  {reward.storeName ? ` · ${reward.storeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <InsightBadge
                  tone={
                    reward.status === "PAID"
                      ? "good"
                      : reward.status === "CANCELED" || reward.status === "EXPIRED"
                        ? "danger"
                        : "warning"
                  }
                >
                  {rewardStatusLabels[reward.status] ?? reward.status}
                </InsightBadge>
                <p className="mt-1 text-zinc-500">
                  {reward.paidAt
                    ? formatDate(reward.paidAt)
                    : formatDate(reward.qualifiedAt)}
                </p>
              </div>
            </li>
          ))}
        </ListBlock>
        <ListBlock title="Бонусы в Langame" emptyLabel="Операций bonus ledger нет.">
          {detail.ledger.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">
                  +{formatRubles(entry.amount)}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {entry.reason ?? "начисление за игру"}
                  {entry.storeName ? ` · ${entry.storeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <InsightBadge
                  tone={
                    entry.status === "CONFIRMED"
                      ? "good"
                      : entry.status === "FAILED" ||
                          entry.status === "CANCELED" ||
                          entry.status === "RECONCILIATION_REQUIRED"
                        ? "danger"
                        : "warning"
                  }
                >
                  {ledgerStatusLabels[entry.status] ?? entry.status}
                </InsightBadge>
                <p className="mt-1 text-zinc-500">
                  {formatDateTime(entry.confirmedAt ?? entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ListBlock>
        <ListBlock title="Последние игровые события" emptyLabel="Событий нет.">
          {detail.events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {gameEventTypeLabel(event.eventType)}
                  {event.sourceName ? `: ${event.sourceName}` : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  источник {event.source}
                  {event.xpDelta ? ` · ${event.xpDelta > 0 ? "+" : ""}${event.xpDelta} XP` : ""}
                </p>
              </div>
              <p className="shrink-0 text-xs text-zinc-500">
                {formatDateTime(event.occurredAt)}
              </p>
            </li>
          ))}
        </ListBlock>
      </div>
    </InsightCard>
  );
}

function ListBlock({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="rounded-xl border border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {title}
      </p>
      {children.length > 0 ? (
        <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">{emptyLabel}</p>
      )}
    </div>
  );
}
