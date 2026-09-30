import { notFound, redirect } from "next/navigation";
import { GuestBehaviorPanel } from "@/components/guest-behavior-panel";
import { GuestCrmActivity } from "@/components/guest-crm-activity";
import { GuestCrmForm } from "@/components/guest-crm-form";
import { GuestGameCard } from "@/components/guest-game-card";
import {
  InsightBadge,
  InsightCard,
  InsightCardHeader,
  KpiTile,
  PillLink,
} from "@/components/guest-insight-ui";
import { ReportBreadcrumbs } from "@/components/report-breadcrumbs";
import { requireCurrentUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";
import { can } from "@/lib/permissions";
import {
  churnRiskLabels,
  churnTone,
  consentLabels,
  consentTone,
  crmStatusLabels,
  crmStatusTone,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRubles,
  gameEngagementLabels,
  gameEngagementTone,
  recommendedActionLabels,
  recommendedActionTone,
  rfmSegmentLabels,
  rfmTone,
  segmentLabels,
  segmentTone,
} from "@/lib/guest-insights";
import { getGuest, type GuestDetail } from "@/lib/guests";

type PageParams = Promise<{ id: string }>;

export default async function GuestPage({ params }: { params: PageParams }) {
  const user = await requireCurrentUser();

  if (!can(user, "view_guests")) {
    redirect(getDefaultLandingPath(user));
  }

  const { id } = await params;
  const guest = await getGuest(id).catch(() => null);

  if (!guest) {
    notFound();
  }

  const canManageCrm = can(user, "manage_guest_crm");
  const canManageCommunications = can(user, "manage_communications");
  const game = guest.gameProfile;

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <ReportBreadcrumbs
          current="Карточка гостя"
          items={[
            { href: "/dashboard", label: "Дашборд" },
            { href: "/guests", label: "Гости" },
          ]}
        />

        <InsightCard className="overflow-hidden">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                Карточка гостя
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {guest.displayName}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <InsightBadge tone={segmentTone(guest.segment)}>
                  {segmentLabels[guest.segment]}
                </InsightBadge>
                <InsightBadge
                  tone={rfmTone(guest.rfm.segment)}
                  title={`R${guest.rfm.recencyScore} F${guest.rfm.frequencyScore} M${guest.rfm.monetaryScore}`}
                >
                  RFM {guest.rfm.totalScore}/15 · {rfmSegmentLabels[guest.rfm.segment]}
                </InsightBadge>
                <InsightBadge tone={churnTone(guest.churnRisk.level)} title={guest.churnRisk.reason}>
                  Риск оттока: {churnRiskLabels[guest.churnRisk.level]} ({guest.churnRisk.score})
                </InsightBadge>
                {guest.crmStatus !== "NONE" ? (
                  <InsightBadge tone={crmStatusTone(guest.crmStatus)}>
                    {crmStatusLabels[guest.crmStatus]}
                  </InsightBadge>
                ) : null}
                <InsightBadge tone={consentTone(guest.phoneConsentStatus)}>
                  {consentLabels[guest.phoneConsentStatus]}
                </InsightBadge>
                {guest.gameAccess === "AVAILABLE" ? (
                  game ? (
                    <InsightBadge tone={gameEngagementTone(game.engagement)}>
                      Игра: уровень {game.level} · {gameEngagementLabels[game.engagement]}
                    </InsightBadge>
                  ) : (
                    <InsightBadge tone="neutral">Не в игре</InsightBadge>
                  )
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Рекомендуемое действие
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <InsightBadge tone={recommendedActionTone(guest.recommendedAction.key)}>
                    {recommendedActionLabels[guest.recommendedAction.key]}
                  </InsightBadge>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {guest.recommendedAction.label}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{guest.recommendedAction.reason}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <PillLink href="/guests">К списку гостей</PillLink>
                {guest.gameAccess === "AVAILABLE" && game ? (
                  <PillLink href={`/gamification/log?profileId=${encodeURIComponent(game.profileId)}`}>
                    Игровой журнал
                  </PillLink>
                ) : null}
                <PillLink href={`/api/guests/${guest.id}/live-session`} external>
                  Сессия сейчас (API)
                </PillLink>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <dl className="grid gap-3 text-sm">
                <Info label="Контакт" value={guest.contact} />
                <Info label="Внешний ID" value={guest.externalGuestId} />
                <Info label="Группа" value={guest.guestGroupName ?? "не определена"} />
                <Info label="Источник" value={guest.externalDomain ?? "не определён"} />
                <Info label="Регистрация" value={formatDate(guest.insertedAt)} />
                <Info label="Последняя активность" value={formatDate(guest.lastActivityAt)} />
                <Info
                  label="Следующий контакт"
                  value={guest.nextContactAt ? formatDate(guest.nextContactAt) : "не назначен"}
                />
              </dl>
              <p className="mt-3 text-xs text-zinc-500">
                ФИО и телефон показываются полностью пользователям с правом
                просмотра гостей. Документы гостя не показываются.
              </p>
            </div>
          </div>
        </InsightCard>

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Деньги за 30 дней"
            value={formatRubles(guest.transactionAmount + guest.barRevenue)}
            caption={`бар ${formatRubles(guest.barRevenue)}`}
            formula="Пополнения баланса + покупки бара за последние 30 дней"
          />
          <KpiTile
            label="LTV факт"
            value={formatRubles(guest.ltv.totalRevenue)}
            caption={`${formatNumber(guest.ltv.revenueDays)} дней с выручкой · ${formatRubles(guest.ltv.averageRevenuePerRevenueDay)}/день`}
            formula="Все пополнения и покупки бара за доступную историю"
          />
          <KpiTile
            label="Сессии за 30 дней"
            value={formatNumber(guest.sessionsCount)}
            caption={`${formatNumber(guest.playHours, 1)} ч · ${formatNumber(guest.visitsDays)} активных дней`}
          />
          <KpiTile
            label="За 90 дней"
            value={formatNumber(guest.recentSessionsCount)}
            caption={`${formatNumber(guest.recentPlayHours, 1)} ч · ${formatNumber(guest.recentVisitsDays)} активных дней`}
          />
          <KpiTile
            label="Бонусы Langame"
            value={formatRubles(guest.bonusLoad.currentBalance)}
            caption={
              guest.bonusLoad.status === "RISK"
                ? "лежат без активности"
                : guest.bonusLoad.status === "WATCH"
                  ? "наблюдать"
                  : guest.bonusLoad.status === "NORMAL"
                    ? `активный остаток · снимок ${formatDate(guest.bonusLoad.latestSnapshotAt)}`
                    : "нет бонусного остатка"
            }
            tone={guest.bonusLoad.status === "RISK" ? "danger" : "neutral"}
          />
          <KpiTile
            label="Риск оттока"
            value={`${guest.churnRisk.score}/100`}
            caption={guest.churnRisk.reason}
            tone={
              guest.churnRisk.level === "HIGH" || guest.churnRisk.level === "LOST"
                ? "danger"
                : guest.churnRisk.level === "MEDIUM"
                  ? "warning"
                  : "good"
            }
            formula="Дни без активности / порог (1.5 × обычный интервал визитов, минимум 7 дней)"
          />
          <KpiTile
            label="Накопленные часы"
            value={
              guest.currentCountHours === null
                ? "нет данных"
                : `${formatNumber(guest.currentCountHours, 1)} ч`
            }
            caption="поле Langame current_count_hours"
          />
          <KpiTile
            label="Игра"
            value={
              guest.gameAccess !== "AVAILABLE"
                ? "нет доступа"
                : game
                  ? `ур. ${game.level} · ${formatNumber(game.xp)} XP`
                  : "не в игре"
            }
            caption={
              game
                ? game.pendingRewards > 0
                  ? `${formatNumber(game.pendingRewards)} награды ждут получения`
                  : `наград выдано ${formatNumber(game.rewardsPaidTotal)} · бонусов ${formatRubles(game.bonusConfirmedTotal)}`
                : "профиль появится после регистрации в игре"
            }
            tone={game?.pendingRewards ? "warning" : "neutral"}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          {canManageCrm ? (
            <GuestCrmForm guest={guest} />
          ) : (
            <InsightCard>
              <InsightCardHeader
                eyebrow="CRM"
                title="CRM-поля"
                description="Изменение статуса и заметок доступно с правом «Гости: CRM»."
              />
              <dl className="grid gap-3 p-5 text-sm">
                <Info label="Статус" value={crmStatusLabels[guest.crmStatus]} />
                <Info label="Следующее действие" value={guest.nextAction ?? "—"} />
                <Info label="Заметка" value={guest.crmNote ?? "—"} />
                <Info label="Обновлено" value={formatDateTime(guest.crmUpdatedAt)} />
              </dl>
            </InsightCard>
          )}
          <GuestCrmActivity
            guest={guest}
            canManageCommunications={canManageCommunications}
          />
        </section>

        <div className="mt-6">
          <GuestGameCard guest={guest} />
        </div>

        <div className="mt-6">
          <GuestBehaviorPanel guest={guest} />
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <SessionsPanel guest={guest} />
          <TransactionsPanel guest={guest} />
        </section>

        <SalesPanel guest={guest} />
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

function SessionsPanel({ guest }: { guest: GuestDetail }) {
  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader eyebrow="Langame" title="Последние сессии" />
      {guest.sessions.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {guest.sessions.map((session) => (
            <div key={session.id} className="grid gap-1 px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{formatDateTime(session.startedAt)}</span>
                <span className="tabular-nums text-zinc-500">
                  {session.durationMinutes === null
                    ? "нет длительности"
                    : `${formatNumber(session.durationMinutes)} мин`}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {session.storeName ?? session.externalDomain ?? "клуб не определён"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Сессий пока нет.</p>
      )}
    </InsightCard>
  );
}

function TransactionsPanel({ guest }: { guest: GuestDetail }) {
  return (
    <InsightCard className="overflow-hidden">
      <InsightCardHeader eyebrow="Langame" title="Пополнения и баланс" />
      {guest.transactions.length > 0 ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {guest.transactions.map((transaction) => (
            <div key={transaction.id} className="grid gap-1 px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{formatDateTime(transaction.happenedAt)}</span>
                <span className="tabular-nums">{formatRubles(transaction.amount)}</span>
              </div>
              <p className="text-xs text-zinc-500">
                {transaction.type ?? "тип не определён"} ·{" "}
                {transaction.storeName ?? transaction.externalDomain ?? "клуб не определён"}
                {transaction.balance !== null
                  ? ` · баланс ${formatRubles(transaction.balance)}`
                  : ""}
                {transaction.bonusBalance !== null
                  ? ` · бонусы ${formatRubles(transaction.bonusBalance)}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Денежных операций пока нет.</p>
      )}
    </InsightCard>
  );
}

function SalesPanel({ guest }: { guest: GuestDetail }) {
  return (
    <InsightCard className="mt-6 overflow-hidden">
      <InsightCardHeader eyebrow="Langame" title="Покупки бара" />
      {guest.sales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-[0.08em] text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Дата</th>
                <th className="px-4 py-3 text-left font-semibold">Товар</th>
                <th className="px-4 py-3 text-left font-semibold">Клуб</th>
                <th className="px-4 py-3 text-right font-semibold">Шт</th>
                <th className="px-4 py-3 text-right font-semibold">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {guest.sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="px-4 py-3">{formatDate(sale.saleDate)}</td>
                  <td className="px-4 py-3 font-medium">{sale.productName}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {sale.storeName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(sale.quantity, 1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRubles(sale.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Связанных покупок бара пока нет.</p>
      )}
    </InsightCard>
  );
}
