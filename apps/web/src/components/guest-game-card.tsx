import type {
  GuestDetail,
  GuestGameDetail,
  GuestGameExternalAccountDetail,
  GuestGameExternalMatchDetail,
} from "@/lib/guests";
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
  externalLookupErrorLabel,
  externalLookupStatusLabels,
  externalMatchBadge,
  externalMatchReasonLabel,
  externalProviderLabels,
  gameProfileStatusLabels,
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
          title="Не подключён к игре"
          description="Гость не зарегистрирован в игровом модуле или его телефон ещё не сопоставлен с профилем. Профиль появляется после регистрации через Telegram или веб-кабинет и подтверждения телефона."
          aside={<PillLink href="/gamification?tab=profiles">Игровой модуль</PillLink>}
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
            <InsightBadge tone="good">Подключён к игре</InsightBadge>
            {detail.connection && detail.connection.status !== "ACTIVE" ? (
              <InsightBadge tone="danger">
                {gameProfileStatusLabels[detail.connection.status] ??
                  detail.connection.status}
              </InsightBadge>
            ) : null}
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
              <InsightBadge tone="warning">Сотрудник · не в рейтинге</InsightBadge>
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
            <PillLink href="/gamification?tab=profiles">Игровой модуль</PillLink>
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
      <GameConnectionFacts detail={detail} />
      <ExternalGameBlocks detail={detail} />
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

function GameConnectionFacts({ detail }: { detail: GuestGameDetail }) {
  const connection = detail.connection;
  if (!connection) return null;
  const steam = (detail.externalAccounts ?? []).find(
    (account) => account.provider === "STEAM" && account.status === "ACTIVE",
  );
  const faceit = (detail.externalAccounts ?? []).find(
    (account) => account.provider === "FACEIT" && account.status === "ACTIVE",
  );

  return (
    <dl className="grid gap-3 border-t border-zinc-100 px-5 py-4 text-sm dark:border-zinc-800 sm:grid-cols-2 xl:grid-cols-5">
      <Fact label="Имя в игре" value={connection.displayName ?? "не указано"} />
      <Fact
        label="Профиль"
        value={gameProfileStatusLabels[connection.status] ?? connection.status}
      />
      <Fact
        label="Обучение «Как играть»"
        value={
          connection.tutorialSeenVersion > 0
            ? `пройдено ${formatDate(connection.tutorialSeenAt)} · версия ${connection.tutorialSeenVersion}`
            : "ещё не пройдено"
        }
      />
      <Fact
        label="Steam"
        value={steam ? (steam.nickname ?? "привязан") : "не привязан"}
      />
      <Fact
        label="FACEIT"
        value={
          faceit
            ? `${faceit.nickname ?? "найден"}${faceit.faceitLevel ? ` · уровень ${faceit.faceitLevel}` : ""}`
            : steam
              ? "не найден по Steam"
              : "нет Steam"
        }
      />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ExternalGameBlocks({ detail }: { detail: GuestGameDetail }) {
  const accounts = detail.externalAccounts;
  const matches = detail.externalMatches;
  if (!accounts || !matches) return null;
  const totals = detail.externalMatchTotals;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 border-t border-zinc-100 p-4 dark:border-zinc-800">
      <ListBlock
        title="Игровые аккаунты"
        emptyLabel="Гость ещё не привязал Steam в разделе «Игровые аккаунты» игры."
      >
        {accounts.map((account) => (
          <ExternalAccountRow key={account.id} account={account} />
        ))}
      </ListBlock>
      <div className="min-w-0 rounded-xl border border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Матчи FACEIT CS2
          </p>
          {totals && totals.total > 0 ? (
            <p className="text-xs text-zinc-500 tabular-nums">
              всего {formatNumber(totals.total)} · засчитано{" "}
              {formatNumber(totals.counted)} · вне сессии{" "}
              {formatNumber(totals.outsideSession)} · не подходит{" "}
              {formatNumber(totals.notEligible)} · на проверке{" "}
              {formatNumber(totals.review)}
            </p>
          ) : null}
        </div>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            {accounts.some(
              (account) => account.provider === "FACEIT" && account.status === "ACTIVE",
            )
              ? "Матчей после привязки пока нет. Новый матч появляется здесь через несколько минут после окончания."
              : "Матчи появятся, когда к Steam гостя найдётся аккаунт FACEIT."}
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Матч</th>
                  <th className="py-2 pr-3 font-medium">Итог</th>
                  <th className="py-2 pr-3 font-medium">У / С / П</th>
                  <th className="py-2 pr-3 font-medium">K/D</th>
                  <th className="py-2 pr-3 font-medium">ADR</th>
                  <th className="py-2 pr-3 font-medium">HS %</th>
                  <th className="py-2 pr-3 font-medium">Решение</th>
                  <th className="py-2 font-medium">XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {matches.map((match) => (
                  <ExternalMatchRow key={match.id} match={match} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ExternalAccountRow({ account }: { account: GuestGameExternalAccountDetail }) {
  const active = account.status === "ACTIVE";
  const provider = externalProviderLabels[account.provider] ?? account.provider;
  const lookupError = externalLookupErrorLabel(account.lookupError);
  const bans = account.steamBans;
  const banned = bans ? bans.vac || bans.gameBans > 0 || bans.community : false;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">
          {provider}: {account.nickname ?? "без ника"}
          {account.faceitLevel ? ` · уровень ${account.faceitLevel}` : ""}
          {account.faceitElo ? ` · ${formatNumber(account.faceitElo)} ELO` : ""}
        </p>
        <p className="text-xs text-zinc-500 [overflow-wrap:anywhere]">
          ID {account.externalId} · привязан {formatDate(account.linkedAt)}
          {account.unlinkedAt ? ` · отвязан ${formatDate(account.unlinkedAt)}` : ""}
          {account.checkedAt ? ` · проверен ${formatDateTime(account.checkedAt)}` : ""}
          {account.provider === "FACEIT" && account.matchesSyncedUntil
            ? ` · матчи загружены до ${formatDateTime(account.matchesSyncedUntil)}`
            : ""}
        </p>
        {account.provider === "STEAM" && active ? (
          <p className="text-xs text-zinc-500">
            {externalLookupStatusLabels[account.lookupStatus] ?? account.lookupStatus}
            {lookupError ? ` · ${lookupError}` : ""}
            {bans
              ? banned
                ? ` · баны: ${[
                    bans.vac ? "VAC" : null,
                    bans.gameBans > 0 ? `игровых ${bans.gameBans}` : null,
                    bans.community ? "сообщество" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}`
                : " · банов нет"
              : ""}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <InsightBadge tone={active ? (banned ? "warning" : "good") : "neutral"}>
          {active ? (banned ? "Привязан · есть баны" : "Привязан") : "Отвязан"}
        </InsightBadge>
        {account.profileUrl ? (
          <a
            href={account.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer rounded text-zinc-600 underline underline-offset-2 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:text-white"
          >
            Профиль {provider}
          </a>
        ) : null}
      </div>
    </li>
  );
}

function statValue(value: number | null, digits = 0) {
  return value === null
    ? "—"
    : value.toLocaleString("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function ExternalMatchRow({ match }: { match: GuestGameExternalMatchDetail }) {
  const reason = externalMatchReasonLabel(match.decision, match.decisionReason);
  const badge = externalMatchBadge(match);

  return (
    <tr className="align-top">
      <td className="py-2 pr-3">
        <p className="font-medium tabular-nums">{formatDateTime(match.finishedAt)}</p>
        <p className="text-xs text-zinc-500">
          {[match.map, match.storeName].filter(Boolean).join(" · ") || "CS2"}
          {match.matchUrl ? (
            <>
              {" · "}
              <a
                href={match.matchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded underline underline-offset-2 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:text-white"
              >
                на FACEIT
              </a>
            </>
          ) : null}
        </p>
      </td>
      <td className="py-2 pr-3">
        {match.result === "WIN" ? (
          <InsightBadge tone="good">Победа</InsightBadge>
        ) : match.result === "LOSS" ? (
          <InsightBadge tone="neutral">Поражение</InsightBadge>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {statValue(match.kills)} / {statValue(match.deaths)} / {statValue(match.assists)}
      </td>
      <td className="py-2 pr-3 tabular-nums">{statValue(match.kd, 2)}</td>
      <td className="py-2 pr-3 tabular-nums">{statValue(match.adr, 1)}</td>
      <td className="py-2 pr-3 tabular-nums">{statValue(match.hsPercent)}</td>
      <td className="py-2 pr-3">
        <InsightBadge tone={badge.tone}>{badge.label}</InsightBadge>
        {reason ? <p className="mt-1 max-w-[16rem] text-xs text-zinc-500">{reason}</p> : null}
      </td>
      <td className="py-2 tabular-nums">
        {match.xpDelta ? `${match.xpDelta > 0 ? "+" : ""}${match.xpDelta}` : "—"}
      </td>
    </tr>
  );
}
