"use client";

import type {
  GuestGamificationWorkspace,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameDeliveryDispatchResult,
  GuestGameDelivery,
  GuestGameDeliveryStatus,
  GuestGameGuestLogTypeMapping,
  GuestGamePilotRunbookAction,
  GuestGameTariffSnapshotEndpoint,
  GuestGameGuestLogCatalog,
  GuestGameGuestLogMappingPreset,
  GuestGameGuestLogMappingIntent,
  GuestGameEvent,
  GuestGameStatus,
  GuestGameTariffSnapshotStatus,
} from "@/lib/guest-gamification";
import type {
  TabId,
  GuestLogMappingPayload,
  BonusLedgerActionOptions,
  BonusLedgerActionResult,
} from "../shared/types";
import type { Store } from "@/lib/stores";
import { useMemo, type ReactNode, useState } from "react";
import { buildPromoBannerUsage } from "../shared/promo-banner";
import {
  isCheckInMission,
  formatMoney,
  rewardTypeLabelFromValue,
  formatDate,
  guestLogBusinessPresets,
} from "../shared/helpers";
import {
  SectionTitle,
  StatusMetric,
  EmptyState,
  MiniMetric,
  Field,
} from "../shared/ui";
import { RewardRow } from "../shared/rule-fields";
import Link from "next/link";
import {
  primaryButtonClass,
  smallButtonClass,
  fieldClass,
  guestLogBusinessPresetDefinitions,
  statusLabels,
} from "../shared/constants";

export function OverviewTab({
  workspace,
  pendingRewards,
  onRewardStatus,
  onEditReward,
  onOpenTab,
  saving,
  tenantSlug,
  stores,
  canApproveRewards,
  canOperateLedger,
  canManageRules,
  canViewIntegrationReadiness,
  diagnosticsLead,
  onPrepareOutbox,
  onDispatchOutbox,
  deliveryDispatchResult,
  onUpdateDeliveryStatus,
  onSaveGuestLogMapping,
  onDeleteGuestLogMapping,
  onQueueBonusLedger,
  onDryRunBonusLedger,
  onDispatchBonusLedger,
  onDispatchBonusLedgerCanary,
  onCancelBonusLedgerEntry,
  bonusLedgerResult,
}: {
  workspace: GuestGamificationWorkspace;
  pendingRewards: GuestGameReward[];
  onRewardStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onEditReward: (reward: GuestGameReward) => void;
  onOpenTab: (tab: TabId) => void;
  saving: string | null;
  tenantSlug: string;
  stores: Store[];
  canApproveRewards: boolean;
  canOperateLedger: boolean;
  canManageRules: boolean;
  canViewIntegrationReadiness: boolean;
  /** Support-only controls from the panel, shown first inside «Диагностика». */
  diagnosticsLead?: ReactNode;
  onPrepareOutbox: () => void;
  onDispatchOutbox: () => void;
  deliveryDispatchResult: GuestGameDeliveryDispatchResult | null;
  onUpdateDeliveryStatus: (
    delivery: GuestGameDelivery,
    status: GuestGameDeliveryStatus,
  ) => void;
  onSaveGuestLogMapping: (payload: GuestLogMappingPayload) => Promise<void>;
  onDeleteGuestLogMapping: (
    mapping: GuestGameGuestLogTypeMapping,
  ) => Promise<void>;
  onQueueBonusLedger: (options?: BonusLedgerActionOptions) => void;
  onDryRunBonusLedger: (options?: BonusLedgerActionOptions) => void;
  onDispatchBonusLedger: () => void;
  onDispatchBonusLedgerCanary: (options?: BonusLedgerActionOptions) => void;
  onCancelBonusLedgerEntry: (entryId: string) => void;
  bonusLedgerResult: BonusLedgerActionResult | null;
}) {
  const promoBannerUsage = useMemo(
    () => buildPromoBannerUsage(workspace.promoCards, stores),
    [stores, workspace.promoCards],
  );
  const activePromoCards = workspace.promoCards.filter(
    (promoCard) => promoCard.status === "ACTIVE",
  ).length;
  const activeCheckInMissions = workspace.missions.filter(
    (mission) => mission.status === "ACTIVE" && isCheckInMission(mission),
  ).length;
  const activeRegularMissions = workspace.missions.filter(
    (mission) => mission.status === "ACTIVE" && !isCheckInMission(mission),
  ).length;
  const checkInMissionCount =
    workspace.missions.filter(isCheckInMission).length;
  const regularMissionCount = workspace.missions.length - checkInMissionCount;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Старт игрового модуля" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Соберите экономику от профиля гостя до ручной выдачи награды.
              Каждый блок можно настроить отдельно, а затем связать в единый
              сценарий.
            </p>
          </div>
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
            title="Награды сначала проверяются без записи в Langame, а реальное начисление проходит только через защищенную очередь."
          >
            Безопасный режим: проверка перед начислением
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <ScenarioStepCard
            step="1"
            title="Игровые профили"
            text="Связать гостя, контакт и будущие каналы Telegram/MAX."
            metric={`${workspace.summary.profilesCount} профилей`}
            action="Открыть профили"
            onClick={() => onOpenTab("profiles")}
          />
          <ScenarioStepCard
            step="2"
            title="Чекин"
            text="Включить кнопку чекина и награду за подтвержденную активную сессию."
            metric={`${activeCheckInMissions} активных`}
            action="Настроить"
            onClick={() => onOpenTab("checkIn")}
          />
          <ScenarioStepCard
            step="3"
            title="Кейсы"
            text="Настроить открытие при старте сессии, клубы, лимиты и призы."
            metric={`${workspace.summary.activeLootBoxes} активных`}
            action="Настроить"
            onClick={() => onOpenTab("lootBoxes")}
          />
          <ScenarioStepCard
            step="4"
            title="Задания"
            text="Задать задания по визитам, часам, бару или реактивации."
            metric={`${activeRegularMissions} активных`}
            action="Собрать"
            onClick={() => onOpenTab("missions")}
          />
          <ScenarioStepCard
            step="5"
            title="Battle Pass"
            text="Создать сезон, уровни, free/premium дорожки и XP-правила."
            metric={`${workspace.summary.activeSeasons} сезонов`}
            action="Открыть"
            onClick={() => onOpenTab("seasons")}
          />
          <ScenarioStepCard
            step="6"
            title="Промо баннеры"
            text="Показать сторис-баннеры на главном экране клуба."
            metric={`${promoBannerUsage.visibleCardIds.size} показывается`}
            action="Открыть"
            onClick={() => onOpenTab("promoCards")}
          />
          <ScenarioStepCard
            step="7"
            title="Выдача"
            text="Проверить очередь, согласовать награду и закрыть статус."
            metric={`${workspace.summary.pendingRewards} к выдаче`}
            action="К кошельку"
            onClick={() => onOpenTab("rewards")}
          />
        </div>
      </section>

      <EffectLinkCard onOpen={() => onOpenTab("effect")} />

      <PortalLinksCard tenantSlug={tenantSlug} stores={stores} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-3">
          <SectionTitle title="Что сейчас работает" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <StatusMetric
              label="Кейсы"
              value={workspace.summary.activeLootBoxes}
              hint={`${workspace.lootBoxes.length} всего`}
            />
            <StatusMetric
              label="Чекин"
              value={activeCheckInMissions}
              hint={`${checkInMissionCount} всего`}
            />
            <StatusMetric
              label="Задания"
              value={activeRegularMissions}
              hint={`${regularMissionCount} всего`}
            />
            <StatusMetric
              label="Сезоны"
              value={workspace.summary.activeSeasons}
              hint={`${workspace.seasons.length} всего`}
            />
            <StatusMetric
              label="Промо баннеры"
              value={promoBannerUsage.visibleCardIds.size}
              hint={`${activePromoCards} активных · ${workspace.promoCards.length} всего`}
            />
          </div>

          <SectionTitle title="Последние события" />
          <div className="space-y-2">
            {workspace.events.length ? (
              workspace.events
                .slice(0, 8)
                .map((event) => <EventRow key={event.id} event={event} />)
            ) : (
              <EmptyState text="Событий пока нет" />
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Очередь выдач" />
          <div className="space-y-2">
            {pendingRewards.length ? (
              pendingRewards
                .slice(0, 8)
                .map((reward) => (
                  <RewardRow
                    key={reward.id}
                    reward={reward}
                    onStatus={onRewardStatus}
                    onEdit={onEditReward}
                    saving={saving}
                    canApprove={canApproveRewards}
                  />
                ))
            ) : (
              <EmptyState text="Нет наград к выдаче" />
            )}
          </div>
        </section>
      </div>

      <details
        id="gamification-diagnostics"
        className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-semibold text-zinc-950 dark:text-white">
              Диагностика
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Для поддержки: обработка наград, бюджет и очередь, начисления в
              Langame, сверка баланса, рассылки, тарифы и события.
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            <span className="group-open:hidden">Показать</span>
            <span className="hidden group-open:inline">Скрыть</span>
          </span>
        </summary>
        {/* ui-copy-allow: диагностика для поддержки */}
        <div className="space-y-5 border-t border-zinc-200 p-4 dark:border-zinc-800">
          {diagnosticsLead}
          <div className="grid gap-3 md:grid-cols-3">
            <SafetyNoteCard
              title="Langame"
              value="ledger-контур"
              text="Правила используют подготовленные события и не пишут бонусы напрямую: начисление идет через bonus ledger и backend-флаг реальной записи."
            />
            <SafetyNoteCard
              title="Экономика"
              value={formatMoney(workspace.summary.plannedBudget)}
              text="Бюджеты и лимиты держат стоимость призов под контролем до запуска автоматизации."
            />
            <SafetyNoteCard
              title="Выдача"
              value={formatMoney(workspace.summary.pendingRewardAmount)}
              text="Награды проходят через кошелек, outbox или bonus ledger, чтобы исключить двойную выдачу и сохранить аудит начислений."
            />
          </div>

          <EconomyControlCard economy={workspace.economy} />
          {canViewIntegrationReadiness ? (
            <IntegrationReadinessCard readiness={workspace.integrationReadiness} />
          ) : null}
          <PilotReadinessCard
            readiness={workspace.pilotReadiness}
            saving={saving}
            canApproveRewards={canOperateLedger}
            onOpenDryRun={() => onOpenTab("testRun")}
            onQueueBonusLedger={onQueueBonusLedger}
            onDryRunBonusLedger={onDryRunBonusLedger}
            onDispatchBonusLedger={onDispatchBonusLedgerCanary}
            onCancelBonusLedgerEntry={onCancelBonusLedgerEntry}
            onOpenReconciliation={() =>
              document
                .getElementById("bonus-balance-reconciliation")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <BonusLedgerAuditCard
            audit={workspace.bonusLedgerAudit}
            saving={saving}
            canApproveRewards={canOperateLedger}
            onQueueBonusLedger={onQueueBonusLedger}
            onDryRunBonusLedger={onDryRunBonusLedger}
            onDispatchBonusLedger={onDispatchBonusLedger}
            result={bonusLedgerResult}
          />
          <BonusBalanceCurrentReconciliationCard
            reconciliation={workspace.bonusBalanceCurrentReconciliation}
          />
          <CommunicationQueueCard
            queue={workspace.communicationQueue}
            outbox={workspace.deliveryOutbox}
            saving={saving}
            canApproveRewards={canApproveRewards}
            onOpenRewards={() => onOpenTab("rewards")}
            onPrepareOutbox={onPrepareOutbox}
            onDispatchOutbox={onDispatchOutbox}
            deliveryDispatchResult={deliveryDispatchResult}
            onUpdateDeliveryStatus={onUpdateDeliveryStatus}
          />

          <TariffSnapshotReadinessCard
            snapshots={workspace.tariffSnapshots}
            onOpenRules={() => onOpenTab("lootBoxes")}
          />

          <GuestLogCatalogCard
            catalog={workspace.guestLogCatalog}
            saving={saving}
            canManage={canManageRules}
            onSaveMapping={onSaveGuestLogMapping}
            onDeleteMapping={onDeleteGuestLogMapping}
          />
        </div>
      </details>
    </div>
  );
}

export function IntegrationReadinessCard({
  readiness,
}: {
  readiness: GuestGamificationWorkspace["integrationReadiness"];
}) {
  const visibleItems = readiness.items;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Готовность интеграций
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Что можно тестировать, а что требует настройки
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Слой показывает состояние публичного кабинета, OTP, Telegram/MAX и
            записи наград в Langame. Секреты не выводятся: видны только
            необходимые env-настройки и следующий безопасный шаг.
          </p>
        </div>
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-center text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="px-3 py-2">
            <span className="block text-zinc-400">Готово</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {readiness.summary.ready}
            </span>
          </div>
          <div className="border-x border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="block text-zinc-400">Частично</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {readiness.summary.partial}
            </span>
          </div>
          <div className="px-3 py-2">
            <span className="block text-zinc-400">Блокеры</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {readiness.summary.blocked}
            </span>
          </div>
          <div className="border-l border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="block text-zinc-400">Ручной</span>
            <span className="font-bold text-zinc-900 dark:text-white">
              {readiness.summary.manualOnly}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        {readiness.note}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item) => (
          <article
            key={item.key}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-zinc-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  env {item.configured ? "есть" : "нет"} ·{" "}
                  {item.enabled ? "включено" : "выключено"}
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  integrationReadinessStatusClass(item.status),
                ].join(" ")}
              >
                {item.statusLabel}
              </span>
            </div>

            <p className="mt-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
              {item.note}
            </p>

            {item.details?.length ? (
              <dl className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
                {item.details.map((detail) => (
                  <div
                    key={`${item.key}-${detail.label}`}
                    className="grid grid-cols-[96px_1fr] gap-2"
                  >
                    <dt className="text-zinc-400">{detail.label}</dt>
                    <dd className="min-w-0 break-words font-semibold text-zinc-700 dark:text-zinc-200">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {item.requiredEnv.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {item.requiredEnv.slice(0, 4).map((envName) => (
                  <span
                    key={envName}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
                  >
                    {envName}
                  </span>
                ))}
                {item.requiredEnv.length > 4 ? (
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                    +{item.requiredEnv.length - 4}
                  </span>
                ) : null}
              </div>
            ) : null}

            {item.runbook ? (
              <a
                className="mt-3 inline-flex text-xs font-bold text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900 dark:text-emerald-200 dark:decoration-emerald-700 dark:hover:text-emerald-100"
                href={item.runbook.href}
                target="_blank"
                rel="noreferrer"
                title={item.runbook.path}
              >
                {item.runbook.label}
              </a>
            ) : null}

            <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {item.nextAction}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PilotReadinessCard({
  readiness,
  saving,
  canApproveRewards,
  onOpenDryRun,
  onQueueBonusLedger,
  onDryRunBonusLedger,
  onDispatchBonusLedger,
  onCancelBonusLedgerEntry,
  onOpenReconciliation,
}: {
  readiness: GuestGamificationWorkspace["pilotReadiness"];
  saving: string | null;
  canApproveRewards: boolean;
  onOpenDryRun: () => void;
  onQueueBonusLedger: (options?: BonusLedgerActionOptions) => void;
  onDryRunBonusLedger: (options?: BonusLedgerActionOptions) => void;
  onDispatchBonusLedger: (options?: BonusLedgerActionOptions) => void;
  onCancelBonusLedgerEntry: (entryId: string) => void;
  onOpenReconciliation: () => void;
}) {
  const target = readiness.targetStore;
  const runbook = readiness.runbook;
  const ledgerPreflight = runbook.ledgerPreflight;
  const firstBonus = runbook.firstBonusReconciliation;
  const pilotLedgerScope = {
    storeId: target?.id ?? null,
    limit: 1,
  };
  const actionHandlers: Record<GuestGamePilotRunbookAction["key"], () => void> =
    {
      OPEN_DRY_RUN: onOpenDryRun,
      QUEUE_BONUS_LEDGER: () => onQueueBonusLedger(pilotLedgerScope),
      DRY_RUN_BONUS_LEDGER: () => onDryRunBonusLedger(pilotLedgerScope),
      DISPATCH_BONUS_LEDGER: () => onDispatchBonusLedger(pilotLedgerScope),
      RECONCILE_BALANCE: onOpenReconciliation,
    };
  const nextIssue =
    readiness.items.find((item) => item.status === "BLOCKED") ??
    readiness.items.find((item) => item.status === "PARTIAL") ??
    readiness.items.find((item) => item.status === "MANUAL_ONLY") ??
    null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Пилотный прогон
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Готовность клуба к первому бонусу
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Чек-лист собирает путь от входа в игровой модуль до /game, события,
            кошелька наград, bonus ledger и последующей сверки баланса Langame.
            Проверка строится по сохраненным данным LeetPlus и не делает
            live-запросов.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] xl:w-[420px]">
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-center dark:border-cyan-900/60 dark:bg-cyan-950/30">
            <span className="block text-xs font-semibold text-cyan-700 dark:text-cyan-200">
              Готовность
            </span>
            <span className="mt-1 block text-3xl font-black text-zinc-950 dark:text-white">
              {readiness.summary.readinessPercent}%
            </span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="font-bold text-zinc-950 dark:text-white">
              {target?.name ?? "Пилотный клуб не найден"}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {target
                ? [
                    target.city,
                    target.address,
                    target.externalDomain,
                    target.externalClubId,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Клуб выбран из активных точек сети"
                : "Добавьте активный клуб или включите геймификацию у 1337."}
            </p>
            {target ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={target.playPath}
                  className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-700"
                >
                  Открыть игру
                </Link>
                <Link
                  href={target.guestPortalPath}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  Кабинет клуба
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-center text-xs sm:grid-cols-4">
        <MiniMetric label="Готово" value={readiness.summary.ready} />
        <MiniMetric label="Частично" value={readiness.summary.partial} />
        <MiniMetric label="Блокеры" value={readiness.summary.blocked} />
        <MiniMetric label="Ручной режим" value={readiness.summary.manualOnly} />
      </div>

      {nextIssue ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <span className="font-bold">Следующий шаг:</span>{" "}
          {nextIssue.nextAction}
          <PilotNextActionLink
            href={nextIssue.actionHref}
            label={nextIssue.actionLabel}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                pilotRunbookStageClass(runbook.stage),
              ].join(" ")}
            >
              {runbook.stageLabel}
            </span>
            <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-100">
              Пилотный режим
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-zinc-950 dark:text-white">
            {runbook.nextAction}
          </p>
          <p className="mt-2 text-xs leading-5 text-cyan-900 dark:text-cyan-100">
            {runbook.note}
          </p>
          {runbook.blockers.length ? (
            <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-100">
              Блокеры: {runbook.blockers.join(", ")}
            </p>
          ) : null}

          <div className="mt-3 border-t border-cyan-200 pt-3 text-xs dark:border-cyan-900/60">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  pilotLedgerPreflightStatusClass(ledgerPreflight.status),
                ].join(" ")}
              >
                {ledgerPreflight.statusLabel}
              </span>
              <span className="font-semibold text-cyan-800 dark:text-cyan-100">
                Проверка ledger
              </span>
              {ledgerPreflight.scopedStoreName ? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {ledgerPreflight.scopedStoreName}
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PilotGate
                label={`К dispatch ${ledgerPreflight.readyCount}`}
                enabled={ledgerPreflight.ready}
              />
              <PilotGate
                label={`В очереди ${ledgerPreflight.pendingCount}`}
                enabled={ledgerPreflight.pendingCount === 1}
              />
              <PilotGate
                label={`Retry ${ledgerPreflight.retryReadyCount}`}
                enabled={ledgerPreflight.retryReadyCount === 1}
              />
              <PilotGate
                label={`Обработка ${ledgerPreflight.processingCount}`}
                enabled={ledgerPreflight.processingCount === 0}
              />
            </div>
            <p className="mt-2 leading-5 text-cyan-900 dark:text-cyan-100">
              {ledgerPreflight.nextAction}
            </p>
            {ledgerPreflight.previewItems.length ? (
              <div className="mt-2 space-y-2">
                {ledgerPreflight.previewItems.map((item) => {
                  const canCancelPreview = [
                    "PENDING",
                    "FAILED",
                    "PROCESSING",
                  ].includes(item.status);
                  const cancelSaving =
                    saving === `bonus-ledger-cancel-${item.id}`;
                  const cancelDisabled =
                    !canCancelPreview || !canApproveRewards || saving !== null;
                  const cancelTitle = !canCancelPreview
                    ? "Эту ledger-запись уже нельзя отменить из preflight."
                    : !canApproveRewards
                      ? "Для отмены ledger-записи нужно право `Геймификация: bonus ledger`."
                      : saving !== null
                        ? "Дождитесь завершения текущего действия."
                        : "Отменить ledger-запись до начисления в Langame.";

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-cyan-200 bg-white/70 px-2 py-2 dark:border-cyan-900/60 dark:bg-zinc-950/60"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase",
                                bonusLedgerStatusClass(item.status),
                              ].join(" ")}
                            >
                              {item.statusLabel}
                            </span>
                            <span className="font-bold text-zinc-950 dark:text-white">
                              {item.amount} бонусов
                            </span>
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {item.guest.displayName}
                              {item.guest.contact
                                ? ` · ${item.guest.contact}`
                                : ""}
                            </span>
                          </div>
                          <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-300">
                            {item.reward
                              ? `${item.reward.rewardLabel} · ${rewardTypeLabelFromValue(
                                  item.reward.rewardType,
                                )}`
                              : item.source}
                          </p>
                          <p className="mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                            attempts {item.attempts} ·{" "}
                            {item.nextAttemptAt
                              ? `retry ${formatDate(item.nextAttemptAt)}`
                              : `создано ${formatDate(item.createdAt)}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCancelBonusLedgerEntry(item.id)}
                          disabled={cancelDisabled}
                          title={cancelTitle}
                          className="shrink-0 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/30"
                        >
                          {cancelSaving ? "Отмена..." : "Отменить запись"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-3 border-t border-cyan-200 pt-3 text-xs dark:border-cyan-900/60">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  pilotFirstBonusReconciliationClass(firstBonus.status),
                ].join(" ")}
              >
                {firstBonus.statusLabel}
              </span>
              <span className="font-semibold text-cyan-800 dark:text-cyan-100">
                Первая сверка bonus_balance
              </span>
              {firstBonus.scopedStoreName ? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {firstBonus.scopedStoreName}
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <PilotGate
                label="confirmed"
                enabled={Boolean(firstBonus.ledgerEntry)}
              />
              <PilotGate
                label="snapshot"
                enabled={["MATCHED", "MISMATCH"].includes(firstBonus.status)}
              />
              <PilotGate label="сошлось" enabled={firstBonus.ready} />
            </div>
            <p className="mt-2 leading-5 text-cyan-900 dark:text-cyan-100">
              {firstBonus.nextAction}
            </p>
            {firstBonus.ledgerEntry ? (
              <div className="mt-2 rounded-lg border border-cyan-200 bg-white/70 px-2 py-2 leading-5 dark:border-cyan-900/60 dark:bg-zinc-950/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-zinc-950 dark:text-white">
                    {firstBonus.ledgerEntry.amount} бонусов
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {firstBonus.ledgerEntry.guest.displayName}
                    {firstBonus.ledgerEntry.guest.contact
                      ? ` · ${firstBonus.ledgerEntry.guest.contact}`
                      : ""}
                  </span>
                </div>
                <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                  balanceAfter{" "}
                  {firstBonus.ledgerEntry.balanceAfter ?? "не сохранен"} ·{" "}
                  {firstBonus.ledgerEntry.confirmedAt
                    ? formatDate(firstBonus.ledgerEntry.confirmedAt)
                    : "без даты"}
                </p>
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                  {firstBonus.ledgerEntry.reconciliation.note}
                </p>
              </div>
            ) : null}
          </div>

          {runbook.actions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {runbook.actions.map((action) => {
                const requiresRewardAccess =
                  pilotRunbookActionRequiresRewardAccess(action.key);
                const disabledByAccess =
                  requiresRewardAccess && !canApproveRewards;
                const disabledBySaving =
                  requiresRewardAccess && saving !== null;
                const disabledByPilotStore =
                  requiresRewardAccess && !target?.id;
                const disabled =
                  !action.enabled ||
                  disabledByAccess ||
                  disabledBySaving ||
                  disabledByPilotStore;
                const disabledReason = !action.enabled
                  ? action.disabledReason
                  : disabledByAccess
                    ? "Для ledger-действий нужно право `Геймификация: bonus ledger`."
                    : disabledBySaving
                      ? "Дождитесь завершения текущего действия."
                      : disabledByPilotStore
                        ? "Пилотный клуб не найден."
                        : null;

                return (
                  <button
                    key={action.key}
                    type="button"
                    className={
                      action.tone === "PRIMARY"
                        ? primaryButtonClass
                        : smallButtonClass
                    }
                    onClick={actionHandlers[action.key]}
                    disabled={disabled}
                    title={disabledReason ?? undefined}
                  >
                    {pilotRunbookActionLabel(action.key, action.label, saving)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <PilotGate label="Dry-run" enabled={runbook.canRunDryRun} />
            <PilotGate label="Canary" enabled={runbook.canRunCanary} />
            <PilotGate label="Live" enabled={runbook.canRunLive} />
            <PilotGate label="Сверка" enabled={runbook.canReconcile} />
            <PilotGate label="Первый бонус" enabled={firstBonus.ready} />
          </div>
          <ul className="mt-3 space-y-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {runbook.safeguards.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {readiness.items.map((item, index) => (
          <article
            key={item.key}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-xs font-black text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {index + 1}
              </span>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  integrationReadinessStatusClass(item.status),
                ].join(" ")}
              >
                {item.statusLabel}
              </span>
            </div>
            <h3 className="mt-3 text-sm font-bold text-zinc-950 dark:text-white">
              {item.title}
            </h3>
            <p className="mt-1 text-xs font-semibold text-cyan-700 dark:text-cyan-200">
              {item.metric}
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {item.note}
            </p>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p>Следующее: {item.nextAction}</p>
              <PilotNextActionLink
                href={item.actionHref}
                label={item.actionLabel}
              />
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        {readiness.note}
      </p>
    </section>
  );
}

export function PilotNextActionLink({
  href,
  label,
}: {
  href?: string | null;
  label?: string | null;
}) {
  if (!href) {
    return null;
  }

  const className =
    "mt-2 inline-flex items-center rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100 dark:hover:bg-cyan-950/60";

  if (href.startsWith("/api/")) {
    return (
      <a href={href} className={className}>
        {label ?? "Открыть"}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {label ?? "Открыть"}
    </Link>
  );
}

export function PilotGate({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      className={[
        "rounded-lg px-2 py-2 text-center font-bold",
        enabled
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200"
          : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
      ].join(" ")}
    >
      {label}
    </div>
  );
}

export function pilotRunbookActionRequiresRewardAccess(
  key: GuestGamePilotRunbookAction["key"],
) {
  return (
    key === "QUEUE_BONUS_LEDGER" ||
    key === "DRY_RUN_BONUS_LEDGER" ||
    key === "DISPATCH_BONUS_LEDGER"
  );
}

export function pilotRunbookActionLabel(
  key: GuestGamePilotRunbookAction["key"],
  fallback: string,
  saving: string | null,
) {
  if (key === "QUEUE_BONUS_LEDGER" && saving === "bonus-ledger-queue") {
    return "Ставим в ledger...";
  }

  if (key === "DRY_RUN_BONUS_LEDGER" && saving === "bonus-ledger-dry-run") {
    return "Проверяем ledger...";
  }

  if (key === "DISPATCH_BONUS_LEDGER" && saving === "bonus-ledger-dispatch") {
    return "Начисляем...";
  }

  if (
    key === "DISPATCH_BONUS_LEDGER" &&
    saving === "bonus-ledger-canary-dispatch"
  ) {
    return "Canary write...";
  }

  return fallback;
}

export function BonusLedgerAuditCard({
  audit,
  saving,
  canApproveRewards,
  onQueueBonusLedger,
  onDryRunBonusLedger,
  onDispatchBonusLedger,
  result,
}: {
  audit: GuestGamificationWorkspace["bonusLedgerAudit"];
  saving: string | null;
  canApproveRewards: boolean;
  onQueueBonusLedger: () => void;
  onDryRunBonusLedger: () => void;
  onDispatchBonusLedger: () => void;
  result: BonusLedgerActionResult | null;
}) {
  const visibleItems = audit.items.slice(0, 8);
  const actionDisabled = saving !== null || !canApproveRewards;
  const nextIssue =
    audit.items.find((item) => item.reconciliation.state === "MISMATCH") ??
    audit.items.find((item) => item.status === "FAILED") ??
    audit.items.find((item) => item.reconciliation.state === "WAITING_SYNC") ??
    null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Bonus ledger
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Журнал начислений и сверка Langame
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Последние операции показывают путь бонуса от очереди до confirmed,
            retry и сверки с ночным bonus balance snapshot. В журнал не попадают
            raw phone, токены и полный payload Langame.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {audit.summary.latestConfirmedAt
            ? `Последнее подтверждение: ${formatDate(
                audit.summary.latestConfirmedAt,
              )}`
            : "Подтвержденных ledger-операций пока нет"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
          <span className="font-bold">Управление начислениями:</span> approved
          bonus-награды сначала попадают в ledger, затем dry-run проверяет
          очередь без claim, а dispatch начисляет бонусы в Langame только когда
          backend-режим готов к реальной записи.
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            className={smallButtonClass}
            onClick={onQueueBonusLedger}
            disabled={actionDisabled}
          >
            {saving === "bonus-ledger-queue"
              ? "Ставим в ledger..."
              : "Поставить approved"}
          </button>
          <button
            type="button"
            className={smallButtonClass}
            onClick={onDryRunBonusLedger}
            disabled={actionDisabled}
          >
            {saving === "bonus-ledger-dry-run"
              ? "Проверяем..."
              : "Dry-run dispatch"}
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onDispatchBonusLedger}
            disabled={actionDisabled}
          >
            {saving === "bonus-ledger-dispatch"
              ? "Начисляем..."
              : "Запустить dispatch"}
          </button>
        </div>
      </div>

      {!canApproveRewards ? (
        <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Для управления ledger нужно право `Геймификация: bonus ledger`; журнал
          и сверка доступны только на просмотр.
        </p>
      ) : null}

      {result ? <BonusLedgerActionResultCard result={result} /> : null}

      <div className="mt-4 grid gap-2 text-center text-xs sm:grid-cols-2 xl:grid-cols-5">
        <MiniMetric
          label="очередь"
          value={`${audit.summary.pending}/${audit.summary.processing}`}
        />
        <MiniMetric
          label="confirmed"
          value={formatMoney(audit.summary.amountConfirmed)}
        />
        <MiniMetric
          label="ошибки / retry"
          value={`${audit.summary.failed}/${audit.summary.retryReady}`}
        />
        <MiniMetric
          label="ждет sync"
          value={audit.summary.reconciliationPending}
        />
        <MiniMetric
          label="расхождения"
          value={audit.summary.reconciliationMismatch}
        />
      </div>

      {nextIssue ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <span className="font-bold">Следующее действие:</span>{" "}
          {nextIssue.nextAction}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {visibleItems.length ? (
          visibleItems.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                        bonusLedgerStatusClass(item.status),
                      ].join(" ")}
                    >
                      {item.statusLabel}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                        bonusLedgerReconciliationClass(
                          item.reconciliation.state,
                        ),
                      ].join(" ")}
                    >
                      {item.reconciliation.stateLabel}
                    </span>
                    {item.retryReady ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        retry ready
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {item.reward?.rewardLabel ?? item.reason ?? item.source}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {item.guest.displayName}
                    {item.guest.contact ? ` · ${item.guest.contact}` : ""}
                    {item.store ? ` · ${item.store.name}` : ""}
                    {item.externalDomain ? ` · ${item.externalDomain}` : ""}
                  </p>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                  <MiniMetric label="сумма" value={formatMoney(item.amount)} />
                  <MiniMetric
                    label="balanceAfter"
                    value={
                      item.balanceAfter === null
                        ? "нет"
                        : formatMoney(item.balanceAfter)
                    }
                  />
                  <MiniMetric
                    label="snapshot"
                    value={
                      item.reconciliation.latestSnapshotBalance === null
                        ? "нет"
                        : formatMoney(item.reconciliation.latestSnapshotBalance)
                    }
                  />
                  <MiniMetric label="attempts" value={item.attempts} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs lg:grid-cols-[minmax(0,1fr)_220px]">
                <p className="rounded-lg bg-white px-3 py-2 leading-5 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                  {item.errorMessage ?? item.reconciliation.note}
                </p>
                <p className="rounded-lg bg-white px-3 py-2 leading-5 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800">
                  {item.nextAttemptAt
                    ? `Retry: ${formatDate(item.nextAttemptAt)}`
                    : `Создано: ${formatDate(item.createdAt)}`}
                </p>
              </div>
            </article>
          ))
        ) : (
          <EmptyState text="Ledger-операций пока нет: после первой approved bonus-награды здесь появится очередь, dispatch и сверка." />
        )}
      </div>

      <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        {audit.note}
      </p>
    </section>
  );
}

export function BonusBalanceCurrentReconciliationCard({
  reconciliation,
}: {
  reconciliation: GuestGamificationWorkspace["bonusBalanceCurrentReconciliation"];
}) {
  const statePriority = {
    MISMATCH: 0,
    WAITING_SYNC: 1,
    NO_SNAPSHOT: 2,
    MATCHED: 3,
  } satisfies Record<
    GuestGamificationWorkspace["bonusBalanceCurrentReconciliation"]["items"][number]["state"],
    number
  >;
  const visibleItems = [...reconciliation.items]
    .sort(
      (left, right) => statePriority[left.state] - statePriority[right.state],
    )
    .slice(0, 8);
  const nextIssue =
    visibleItems.find((item) => item.state === "MISMATCH") ??
    visibleItems.find((item) => item.state === "WAITING_SYNC") ??
    visibleItems.find((item) => item.state === "NO_SNAPSHOT") ??
    null;

  return (
    <section
      id="bonus-balance-reconciliation"
      className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Bonus balance
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Сверка текущего бонусного баланса
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Контроль показывает, подтвердил ли ночной Langame snapshot текущий
            бонусный баланс после ledger-начислений. Страница не делает
            live-запросы и не раскрывает raw phone или payload.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {reconciliation.summary.latestCurrentAt
            ? `Current: ${formatDate(reconciliation.summary.latestCurrentAt)}`
            : "Текущих bonus balance записей пока нет"}
          {reconciliation.summary.latestSnapshotAt
            ? ` · Snapshot: ${formatDate(
                reconciliation.summary.latestSnapshotAt,
              )}`
            : ""}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-center text-xs sm:grid-cols-2 xl:grid-cols-6">
        <MiniMetric
          label="current"
          value={formatMoney(reconciliation.summary.amountCurrent)}
        />
        <MiniMetric
          label="snapshot"
          value={formatMoney(reconciliation.summary.amountSnapshot)}
        />
        <MiniMetric
          label="diff"
          value={formatMoney(reconciliation.summary.diffTotal)}
        />
        <MiniMetric label="сошлось" value={reconciliation.summary.matched} />
        <MiniMetric
          label="ждет / нет"
          value={`${reconciliation.summary.waitingSync}/${reconciliation.summary.noSnapshot}`}
        />
        <MiniMetric
          label="расхождения"
          value={reconciliation.summary.mismatched}
        />
      </div>

      {nextIssue ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <span className="font-bold">Контрольный сигнал:</span>{" "}
          {nextIssue.note}
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {visibleItems.length ? (
          visibleItems.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                        bonusBalanceCurrentReconciliationClass(item.state),
                      ].join(" ")}
                    >
                      {item.stateLabel}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {item.source}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {item.guest.displayName}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {item.guest.contact ?? "контакт скрыт"}
                    {item.externalDomain ? ` · ${item.externalDomain}` : ""}
                    {item.externalGuestId ? ` · ${item.externalGuestId}` : ""}
                  </p>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                  <MiniMetric
                    label="current"
                    value={formatMoney(item.currentBalance)}
                  />
                  <MiniMetric
                    label="snapshot"
                    value={
                      item.latestSnapshotBalance === null
                        ? "нет"
                        : formatMoney(item.latestSnapshotBalance)
                    }
                  />
                  <MiniMetric
                    label="diff"
                    value={item.diff === null ? "нет" : formatMoney(item.diff)}
                  />
                  <MiniMetric
                    label="updated"
                    value={formatDate(item.currentSnapshotAt)}
                  />
                </div>
              </div>

              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                {item.note}
                {item.latestSnapshotAt
                  ? ` Последний snapshot: ${formatDate(item.latestSnapshotAt)}.`
                  : ""}
              </p>
            </article>
          ))
        ) : (
          <EmptyState text="Текущих bonus balance записей пока нет: блок наполнится после guest foundation sync или первого ledger-начисления." />
        )}
      </div>

      <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        {reconciliation.note}
      </p>
    </section>
  );
}

export function BonusLedgerActionResultCard({
  result,
}: {
  result: BonusLedgerActionResult;
}) {
  if (result.kind === "queue") {
    return (
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="grid gap-2 text-center text-xs sm:grid-cols-3">
          <MiniMetric label="проверено" value={result.result.checkedRewards} />
          <MiniMetric label="в ledger" value={result.result.queued} />
          <MiniMetric label="пропущено" value={result.result.skipped} />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {result.result.note}
        </p>
      </div>
    );
  }

  if (result.kind === "cancel") {
    const item = result.result;

    return (
      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="grid gap-2 text-center text-xs sm:grid-cols-3">
          <MiniMetric label="ledger" value="отменено" />
          <MiniMetric label="status" value={item.status} />
          <MiniMetric label="сумма" value={formatMoney(item.amount)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {item.note}
        </p>
      </div>
    );
  }

  const dispatch = result.result;

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="grid gap-2 text-center text-xs sm:grid-cols-3 xl:grid-cols-6">
        <MiniMetric
          label="режим"
          value={
            dispatch.canary
              ? `${dispatch.status.modeLabel} · canary`
              : dispatch.status.modeLabel
          }
        />
        <MiniMetric label="проверено" value={dispatch.checked} />
        <MiniMetric label="confirmed" value={dispatch.confirmed} />
        <MiniMetric label="skip" value={dispatch.skipped} />
        <MiniMetric label="blocked" value={dispatch.blocked} />
        <MiniMetric label="ошибки" value={dispatch.failed} />
      </div>

      {dispatch.queued ? (
        <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          Перед dispatch поставлено в ledger: {dispatch.queued.queued} из{" "}
          {dispatch.queued.checkedRewards}, пропущено {dispatch.queued.skipped}.
        </p>
      ) : dispatch.canary ? (
        <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          Canary dispatch не ставит новые rewards в ledger и обрабатывает только
          одну уже подготовленную запись.
        </p>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
        {dispatch.note}
      </p>

      {dispatch.items.length ? (
        <div className="mt-3 space-y-2">
          {dispatch.items.slice(0, 5).map((item) => (
            <div
              key={item.ledgerEntryId}
              className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <span
                  className={[
                    "mr-2 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                    bonusLedgerStatusClass(item.status),
                  ].join(" ")}
                >
                  {item.status}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  {item.externalDomain ?? "Langame"}{" "}
                  {item.externalGuestId ? `· ${item.externalGuestId}` : ""}
                </span>
              </div>
              <span className="font-semibold text-zinc-950 dark:text-white">
                {formatMoney(item.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EconomyControlCard({
  economy,
}: {
  economy: GuestGamificationWorkspace["economy"];
}) {
  const usage = economy.summary.budgetUsagePercent ?? 0;
  const usageWidth = Math.max(0, Math.min(100, usage));
  const visibleScenarios = economy.scenarios.slice(0, 6);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Коммерческая экономика
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Бюджет, очередь и фактическая выдача
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Слой считает стоимость наград и XP по уже сохраненным правилам,
            событиям и кошельку LeetPlus. Live-запросы и запись в Langame здесь
            не выполняются.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className={smallButtonClass}
            href="/api/guests/gamification/overview/export"
            download
          >
            CSV экономики и эффекта
          </a>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            {economy.summary.rulesWithoutBudget
              ? `${economy.summary.rulesWithoutBudget} активн. сценариев без бюджета`
              : "Активные сценарии с бюджетом под контролем"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="использовано бюджета"
          value={formatMoney(economy.summary.budgetUsedCost)}
        />
        <MiniMetric
          label="очередь выдачи"
          value={formatMoney(
            economy.summary.pendingCost + economy.summary.approvedCost,
          )}
        />
        <MiniMetric
          label="погашено"
          value={formatMoney(economy.summary.paidCost)}
        />
        <MiniMetric
          label="гости / XP"
          value={`${economy.summary.uniqueGuests} / +${economy.summary.xpIssued}`}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span>Плановый бюджет</span>
          <span>
            {economy.summary.budgetUsagePercent === null
              ? "лимит не задан"
              : `${formatPercent(economy.summary.budgetUsagePercent)} · ${formatMoney(
                  economy.summary.plannedBudget,
                )}`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
          <div
            className={[
              "h-full rounded-full transition-all",
              economyUsageClass(economy.summary.budgetUsagePercent),
            ].join(" ")}
            style={{ width: `${usageWidth}%` }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {visibleScenarios.length ? (
          visibleScenarios.map((scenario) => (
            <div
              key={`${scenario.kind}:${scenario.id}`}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      {economyKindLabel(scenario.kind)}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {economyStatusLabel(scenario.status)}
                    </span>
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {scenario.name}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {scenario.recommendation}
                  </p>
                </div>
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-4 lg:min-w-[520px]">
                  <MiniMetric
                    label="стоимость"
                    value={formatMoney(scenario.budgetUsedCost)}
                  />
                  <MiniMetric
                    label="очередь"
                    value={`${scenario.pendingRewards + scenario.approvedRewards} · ${formatMoney(
                      scenario.pendingCost + scenario.approvedCost,
                    )}`}
                  />
                  <MiniMetric
                    label="выдано"
                    value={`${scenario.paidRewards} · ${formatMoney(
                      scenario.paidCost,
                    )}`}
                  />
                  <MiniMetric
                    label="события"
                    value={`${scenario.eventsCount} · +${scenario.xpIssued} XP`}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Экономика появится после создания лутбокса, задания, Battle Pass или награды." />
        )}
      </div>
    </section>
  );
}

export function EffectLinkCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Эффект сценариев
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Что игра меняет для клуба и каждого гостя
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Визиты, часы и деньги игроков до и после старта в сравнении с
            похожими гостями без игры — по сети, по клубам и по каждому
            заданию, кейсу и Battle Pass. Там же включается контрольная
            группа.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900"
        >
          Открыть «Эффект»
        </button>
      </div>
    </section>
  );
}

export function CommunicationQueueCard({
  queue,
  outbox,
  saving,
  canApproveRewards,
  onOpenRewards,
  onPrepareOutbox,
  onDispatchOutbox,
  deliveryDispatchResult,
  onUpdateDeliveryStatus,
}: {
  queue: GuestGamificationWorkspace["communicationQueue"];
  outbox: GuestGamificationWorkspace["deliveryOutbox"];
  saving: string | null;
  canApproveRewards: boolean;
  onOpenRewards: () => void;
  onPrepareOutbox: () => void;
  onDispatchOutbox: () => void;
  deliveryDispatchResult: GuestGameDeliveryDispatchResult | null;
  onUpdateDeliveryStatus: (
    delivery: GuestGameDelivery,
    status: GuestGameDeliveryStatus,
  ) => void;
}) {
  const visibleItems = queue.items.slice(0, 6);
  const visibleDeliveries = outbox.items.slice(0, 5);
  const botConsumer = outbox.botConsumer;
  const botReadyDeliveryCount = outbox.dispatcher.providers.reduce(
    (total, provider) => total + provider.pendingReady,
    0,
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
            Коммуникации и выдача
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Готовность Telegram/MAX, кассира и согласий
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Слой показывает, какие награды уже можно отдать вручную, какие
            готовы для будущего Telegram/MAX-бота, а где не хватает согласия,
            канала или подтверждения. Dispatcher по умолчанию работает в
            dry-run; внешняя отправка включается только отдельными env-флагами.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={smallButtonClass}
            type="button"
            onClick={onOpenRewards}
          >
            Открыть кошелек
          </button>
          <button
            className={smallButtonClass}
            type="button"
            disabled={
              !canApproveRewards ||
              saving === "deliveries-dispatch" ||
              botReadyDeliveryCount === 0
            }
            onClick={onDispatchOutbox}
          >
            {saving === "deliveries-dispatch"
              ? "Проверяем..."
              : "Проверить доставку"}
          </button>
          <button
            className={primaryButtonClass}
            type="button"
            disabled={!canApproveRewards || saving === "deliveries-prepare"}
            onClick={onPrepareOutbox}
          >
            {saving === "deliveries-prepare"
              ? "Готовим..."
              : "Подготовить outbox"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="готово к боту" value={queue.summary.readyForBot} />
        <MiniMetric
          label="готово кассиру"
          value={queue.summary.readyForCashier}
        />
        <MiniMetric
          label="нужно подтвердить"
          value={queue.summary.needsApproval}
        />
        <MiniMetric
          label="нет согласия / канала"
          value={queue.summary.needsConsent + queue.summary.needsChannel}
        />
      </div>

      <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 text-xs leading-5 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/25 dark:text-violet-100">
        {queue.note}
      </div>

      <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/25">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-200">
              Outbox выдачи
            </p>
            <p className="mt-1 text-sm leading-6 text-cyan-950 dark:text-cyan-100">
              {outbox.note}
            </p>
          </div>
          <Link
            className={smallButtonClass}
            href="/api/guests/gamification/deliveries/export"
          >
            CSV
          </Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <MiniMetric label="готово" value={outbox.summary.ready} />
          <MiniMetric label="нужно действие" value={outbox.summary.blocked} />
          <MiniMetric label="выдано" value={outbox.summary.sent} />
          <MiniMetric
            label="Telegram/MAX"
            value={outbox.summary.telegram + outbox.summary.max}
          />
          <MiniMetric
            label="кассир/ручной"
            value={outbox.summary.cashier + outbox.summary.manual}
          />
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-cyan-200 bg-cyan-100/60 p-3 text-xs leading-5 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
            <p className="font-bold uppercase tracking-wide">Dispatcher</p>
            <p className="mt-1 text-sm font-semibold">
              {outbox.dispatcher.modeLabel}
            </p>
            <p className="mt-1">{outbox.dispatcher.note}</p>
          </div>
          <div className="rounded-lg border border-cyan-200 bg-white p-3 text-xs leading-5 text-zinc-600 dark:border-cyan-900/60 dark:bg-zinc-950 dark:text-zinc-300">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-zinc-950 dark:text-white">
                VDS bot-consumer
              </p>
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {botConsumer.modeLabel}
              </span>
            </div>
            <p className="mt-1">
              Готово: {botConsumer.pendingReady} · Telegram{" "}
              {botConsumer.pendingTelegram} · MAX {botConsumer.pendingMax}
            </p>
            <p className="mt-1">
              Ack: {botConsumer.sentAck} sent / {botConsumer.failedAck} failed /{" "}
              {botConsumer.blockedAck} blocked
              {botConsumer.lastAckAt
                ? ` · ${formatDate(botConsumer.lastAckAt)}`
                : ""}
            </p>
            <p className="mt-1">{botConsumer.nextAction}</p>
            {botConsumer.requiredEnv.length ? (
              <p className="mt-1 text-amber-700 dark:text-amber-200">
                Env: {botConsumer.requiredEnv.join(", ")}
              </p>
            ) : null}
            {botConsumer.preview.length ? (
              <div className="mt-2 space-y-1 rounded-md border border-cyan-100 bg-cyan-50/60 p-2 dark:border-cyan-900/50 dark:bg-cyan-950/30">
                <p className="font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-100">
                  Первые к отправке
                </p>
                {botConsumer.preview.map((item) => (
                  <div
                    key={item.deliveryId}
                    className="rounded border border-cyan-100 bg-white px-2 py-1 dark:border-cyan-900/50 dark:bg-zinc-950"
                  >
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      {item.rewardLabel} · {formatMoney(item.rewardAmount)}
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {item.channelLabel}
                      {item.storeName ? ` · ${item.storeName}` : ""}
                      {item.recipientMasked ? ` · ${item.recipientMasked}` : ""}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      {item.deliveryId}
                      {item.channelIdentityMasked
                        ? ` · ${item.channelIdentityMasked}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <a
              className="mt-2 inline-flex text-xs font-bold text-cyan-700 underline decoration-cyan-300 underline-offset-4 hover:text-cyan-900 dark:text-cyan-200 dark:decoration-cyan-700 dark:hover:text-cyan-100"
              href={botConsumer.runbook.href}
              target="_blank"
              rel="noreferrer"
              title={botConsumer.runbook.path}
            >
              {botConsumer.runbook.label}
            </a>
          </div>
          {outbox.dispatcher.providers.map((provider) => (
            <div
              key={provider.channel}
              className="rounded-lg border border-cyan-200 bg-white p-3 text-xs leading-5 text-zinc-600 dark:border-cyan-900/60 dark:bg-zinc-950 dark:text-zinc-300"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-zinc-950 dark:text-white">
                  {provider.channelLabel}
                </p>
                <span className="rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  {provider.canAttemptSend
                    ? "готов"
                    : provider.dryRunOnly
                      ? "dry-run"
                      : "отключен"}
                </span>
              </div>
              <p className="mt-1">
                Готовых: {provider.pendingReady} · env{" "}
                {provider.enabledByEnv ? "включен" : "выключен"} · config{" "}
                {provider.configured ? "есть" : "нет"}
              </p>
              <p className="mt-1">{provider.note}</p>
            </div>
          ))}
        </div>
        {deliveryDispatchResult ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs leading-5 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-bold uppercase tracking-wide">
                  Последняя проверка dispatcher
                </p>
                <p className="mt-1">{deliveryDispatchResult.note}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">
                {deliveryDispatchResult.dryRun ? "dry-run" : "real send"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              <MiniMetric
                label="проверено"
                value={deliveryDispatchResult.checked}
              />
              <MiniMetric
                label="dry/skip"
                value={deliveryDispatchResult.skipped}
              />
              <MiniMetric
                label="отправлено"
                value={deliveryDispatchResult.sent}
              />
              <MiniMetric
                label="заблокировано"
                value={deliveryDispatchResult.blocked}
              />
              <MiniMetric
                label="ошибки"
                value={deliveryDispatchResult.failed}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          {visibleDeliveries.length ? (
            visibleDeliveries.map((delivery) => {
              const canRetryDelivery = delivery.status === "FAILED";
              const canMarkDeliverySent = delivery.status === "READY";
              const canCancelDelivery =
                delivery.status !== "SENT" && delivery.status !== "CANCELED";

              return (
                <div
                  key={delivery.id}
                  className="rounded-lg border border-cyan-200 bg-white p-3 dark:border-cyan-900/60 dark:bg-zinc-950"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-100">
                          {delivery.statusLabel}
                        </span>
                        <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                          {delivery.channelLabel}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-[11px] font-bold",
                            communicationQueueStatusClass(
                              delivery.readinessStatus,
                            ),
                          ].join(" ")}
                        >
                          {delivery.readinessStatusLabel}
                        </span>
                      </div>
                      <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                        {delivery.messageTitle}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                        {delivery.profile?.displayName ??
                          delivery.guest?.displayName ??
                          delivery.reward.guestExternalId ??
                          "Гость"}
                        {delivery.store ? ` · ${delivery.store.name}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canRetryDelivery ? (
                        <button
                          type="button"
                          className={smallButtonClass}
                          disabled={saving === `delivery-${delivery.id}`}
                          onClick={() =>
                            onUpdateDeliveryStatus(delivery, "READY")
                          }
                        >
                          Повторить
                        </button>
                      ) : null}
                      {canMarkDeliverySent ? (
                        <button
                          type="button"
                          className={smallButtonClass}
                          disabled={saving === `delivery-${delivery.id}`}
                          onClick={() =>
                            onUpdateDeliveryStatus(delivery, "SENT")
                          }
                        >
                          Отметить выдано
                        </button>
                      ) : null}
                      {canCancelDelivery ? (
                        <button
                          type="button"
                          className={smallButtonClass}
                          disabled={saving === `delivery-${delivery.id}`}
                          onClick={() =>
                            onUpdateDeliveryStatus(delivery, "CANCELED")
                          }
                        >
                          Отменить
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {delivery.blockers.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {delivery.blockers.slice(0, 3).map((blocker) => (
                        <span
                          key={blocker}
                          className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100"
                        >
                          {blocker}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <EmptyState text="Outbox пока пуст. Подготовьте его из текущей очереди выдачи, когда награды и согласия будут готовы к обработке." />
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {visibleItems.length ? (
          visibleItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                        communicationQueueStatusClass(item.queueStatus),
                      ].join(" ")}
                    >
                      {item.queueStatusLabel}
                    </span>
                    <span className="rounded-full bg-zinc-200 px-2 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {item.channelLabel}
                    </span>
                    {item.botDeliveryEnabled ? null : (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        отправка выкл.
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 truncate text-sm font-bold text-zinc-950 dark:text-white">
                    {item.guestLabel}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {item.rewardLabel} · {item.sourceLabel}
                    {item.store ? ` · ${item.store.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {item.nextAction}
                  </p>
                </div>
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                  <MiniMetric
                    label="сумма"
                    value={formatMoney(item.rewardAmount)}
                  />
                  <MiniMetric
                    label="контакт"
                    value={item.contactMasked ?? "нет"}
                  />
                  <MiniMetric
                    label="дата"
                    value={formatDate(item.qualifiedAt)}
                  />
                  <MiniMetric
                    label="до"
                    value={formatDate(item.expiresAt) || "без срока"}
                  />
                </div>
              </div>
              {item.blockers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.blockers.slice(0, 3).map((blocker) => (
                    <span
                      key={blocker}
                      className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
                    >
                      {blocker}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState text="Коммуникационная очередь появится после создания наград в кошельке." />
        )}
      </div>
    </section>
  );
}

export function ScenarioStepCard({
  step,
  title,
  text,
  metric,
  action,
  onClick,
}: {
  step: string;
  title: string;
  text: string;
  metric: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex min-h-40 flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {step}
        </span>
        <span className="truncate rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          {metric}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-bold text-zinc-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 flex-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {text}
      </p>
      <button
        type="button"
        className={`${smallButtonClass} mt-3 w-full justify-center px-2 py-1.5`}
        onClick={onClick}
      >
        {action}
      </button>
    </div>
  );
}

export function SafetyNoteCard({
  title,
  value,
  text,
}: {
  title: string;
  value: ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        {title}
      </p>
      <p className="mt-2 text-lg font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {text}
      </p>
    </div>
  );
}

export function TariffSnapshotReadinessCard({
  snapshots,
  onOpenRules,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
  onOpenRules?: () => void;
}) {
  const readyCount = snapshots.filter(
    (snapshot) => snapshot.status === "READY",
  ).length;
  const latestAt = snapshots.reduce<string | null>((latest, snapshot) => {
    if (!snapshot.latestAt) {
      return latest;
    }

    if (!latest) {
      return snapshot.latestAt;
    }

    return new Date(snapshot.latestAt).getTime() > new Date(latest).getTime()
      ? snapshot.latestAt
      : latest;
  }, null);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionTitle title="Тарифные snapshot-источники" />
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Тарифы редактируются в Langame, а LeetPlus использует сохраненный
            snapshot этих справочников в правилах лутбоксов, заданий и battle
            pass. Отсюда можно перейти к нужному endpoint, проверить поля и
            создать свежий snapshot.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            {readyCount}/{snapshots.length} готовы
            <span className="ml-2 text-zinc-400">
              {latestAt ? formatDate(latestAt) : "snapshot не создан"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/sync?endpoint=tariffsGroups#endpoint-profile-diagnostics"
              className={smallButtonClass}
            >
              Открыть тарифы в /sync
            </Link>
            <button
              type="button"
              className={smallButtonClass}
              onClick={onOpenRules}
            >
              Использовать в правилах
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {snapshots.map((snapshot) => (
          <article
            key={snapshot.endpointKey}
            className="min-h-52 rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
                  {snapshot.title}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {snapshot.endpointPath}
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                  tariffSnapshotStatusClass(snapshot.status),
                ].join(" ")}
              >
                {tariffSnapshotStatusLabel(snapshot.status)}
              </span>
            </div>

            <p className="mt-3 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
              {snapshot.description}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Источники</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.readySources}/
                  {snapshot.totalSources || snapshot.sources.length}
                </span>
              </div>
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Строки</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.rowCount}
                </span>
              </div>
              <div className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-950">
                <span className="block text-zinc-400">Typed</span>
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {snapshot.typedItemsCount}
                </span>
              </div>
            </div>

            {snapshot.fieldKeys.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {snapshot.fieldKeys.slice(0, 4).map((field) => (
                  <span
                    key={field}
                    className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
                  >
                    {field}
                  </span>
                ))}
              </div>
            ) : null}

            {snapshot.typedItems.length ? (
              <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/60 p-2 dark:border-emerald-950 dark:bg-emerald-950/20">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Подготовленные строки
                </p>
                <div className="mt-2 space-y-1">
                  {snapshot.typedItems.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate font-semibold text-zinc-800 dark:text-zinc-100">
                        {item.label ??
                          item.name ??
                          item.externalId ??
                          "Строка тарифа"}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">
                        {item.domain}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {snapshot.nextAction}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={tariffSnapshotSyncHref(snapshot.endpointKey)}
                className={smallButtonClass}
              >
                Проверить endpoint
              </Link>
              <Link
                href={tariffSnapshotSyncHref(snapshot.endpointKey)}
                className={smallButtonClass}
              >
                Создать snapshot
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function tariffSnapshotSyncHref(endpointKey: string) {
  return `/sync?endpoint=${encodeURIComponent(endpointKey)}#endpoint-profile-diagnostics`;
}

export function GuestLogCatalogCard({
  catalog,
  saving,
  canManage,
  onSaveMapping,
  onDeleteMapping,
}: {
  catalog: GuestGameGuestLogCatalog;
  saving: string | null;
  canManage: boolean;
  onSaveMapping: (payload: GuestLogMappingPayload) => Promise<void>;
  onDeleteMapping: (mapping: GuestGameGuestLogTypeMapping) => Promise<void>;
}) {
  const topItems = catalog.items.slice(0, 8);
  const initialItem = topItems[0] ?? catalog.items[0] ?? null;
  const [selectedType, setSelectedType] = useState(
    initialItem?.normalizedType ?? "",
  );
  const [draft, setDraft] = useState<GuestLogMappingPayload>(() =>
    guestLogMappingDraftFromItem(initialItem),
  );
  const selectedItem =
    catalog.items.find((item) => item.normalizedType === selectedType) ??
    initialItem;
  const selectedMapping = selectedItem?.mapping ?? null;
  const businessPresets = guestLogBusinessPresets(catalog.items).slice(0, 5);
  const isSaving = saving === "guestLogMapping";
  const selectItem = (item: GuestGameGuestLogCatalog["items"][number]) => {
    setSelectedType(item.normalizedType);
    setDraft(guestLogMappingDraftFromItem(item));
  };
  const saveMapping = async () => {
    if (!selectedItem) {
      return;
    }

    await onSaveMapping({
      ...draft,
      rawType: selectedItem.type,
      label: draft.label.trim() || selectedItem.type,
      note: draft.note.trim(),
    });
  };
  const resetMapping = async () => {
    if (!selectedItem?.mapping) {
      return;
    }

    await onDeleteMapping(selectedItem.mapping);
    setDraft({
      rawType: selectedItem.type,
      label: selectedItem.type,
      preset: "custom",
      intent: "allow",
      note: "",
    });
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionTitle title="Каталог событий guests/logs" />
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Эти типы собраны из сохраненных фактов Langame и используются как
            подсказки в правилах лутбоксов, заданий и Battle Pass. Открытие
            страницы не делает live-запросов в Langame.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <a
            className={smallButtonClass}
            href="/api/guests/gamification/guest-log-catalog/export"
            download
          >
            CSV каталога
          </a>
          <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-center text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="px-3 py-2">
              <span className="block text-zinc-400">Типы</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {catalog.summary.types}
              </span>
            </div>
            <div className="border-x border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="block text-zinc-400">Логи</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {catalog.summary.logs}
              </span>
            </div>
            <div className="px-3 py-2">
              <span className="block text-zinc-400">Источники</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {catalog.summary.domains}
              </span>
            </div>
            <div className="border-l border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="block text-zinc-400">Словарь</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {catalog.mappings.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {topItems.length ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="grid gap-2 sm:grid-cols-2">
              {topItems.map((item) => {
                const isSelected =
                  selectedItem?.normalizedType === item.normalizedType;

                return (
                  <button
                    key={item.normalizedType}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={[
                      "rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-800",
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/30"
                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
                    ].join(" ")}
                    title={item.domains
                      .map((domain) => `${domain.domain}: ${domain.count}`)
                      .join(", ")}
                  >
                    <span className="block truncate text-sm font-bold text-zinc-900 dark:text-white">
                      {item.mapping?.label ?? item.type}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {item.type}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-white px-2 py-1 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                        {item.count} логов
                      </span>
                      {item.mapping ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                          настроено
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                          авто
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Сопоставление типа
              </p>
              <h3 className="mt-1 truncate text-base font-bold text-zinc-950 dark:text-white">
                {selectedItem?.type ?? "Тип не выбран"}
              </h3>
              <div className="mt-3 grid gap-3">
                <Field label="Название для менеджера">
                  <input
                    className={fieldClass}
                    value={draft.label}
                    disabled={!canManage || !selectedItem}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Бизнес-пресет">
                    <select
                      className={fieldClass}
                      value={draft.preset}
                      disabled={!canManage || !selectedItem}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          preset: event.target
                            .value as GuestGameGuestLogMappingPreset,
                        }))
                      }
                    >
                      {guestLogMappingPresetOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Применение">
                    <select
                      className={fieldClass}
                      value={draft.intent}
                      disabled={!canManage || !selectedItem}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          intent: event.target
                            .value as GuestGameGuestLogMappingIntent,
                        }))
                      }
                    >
                      <option value="allow">Разрешенное условие</option>
                      <option value="block">Anti-fraud запрет</option>
                    </select>
                  </Field>
                </div>
                <Field label="Заметка">
                  <textarea
                    className={`${fieldClass} min-h-20 resize-y`}
                    value={draft.note}
                    disabled={!canManage || !selectedItem}
                    placeholder="Например: срабатывает при старте оплаченной игровой сессии"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              {selectedMapping ? (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Сохранено: {formatDate(selectedMapping.updatedAt)}
                  {selectedMapping.updatedBy
                    ? ` · ${selectedMapping.updatedBy.displayName}`
                    : ""}
                </p>
              ) : (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Пока используется автоподбор по словам. Сохраните смысл, если
                  raw-тип нужно трактовать стабильнее.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveMapping}
                  disabled={!canManage || !selectedItem || isSaving}
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Сохраняем..." : "Сохранить смысл"}
                </button>
                {selectedMapping ? (
                  <button
                    type="button"
                    onClick={resetMapping}
                    disabled={!canManage || isSaving}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-950"
                  >
                    Сбросить
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {catalog.summary.latestAt ? (
            <p className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Последний лог: {formatDate(catalog.summary.latestAt)}
            </p>
          ) : null}

          {businessPresets.length ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Бизнес-пресеты из найденных типов
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {businessPresets.map((preset) => (
                  <span
                    key={preset.id}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800"
                    title={preset.description}
                  >
                    {preset.label} · {preset.types.length}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Каталог пока пуст
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            На production еще нет сохраненных `guests/logs`. Запустите
            расширенную синхронизацию гостевых логов на странице синхронизации,
            после этого здесь появятся реальные типы событий и CSV-каталог.
          </p>
          <Link className={`${smallButtonClass} mt-3 inline-flex`} href="/sync">
            Открыть синхронизацию
          </Link>
        </div>
      )}
    </section>
  );
}

export function PortalLinksCard({
  tenantSlug,
  stores,
}: {
  tenantSlug: string;
  stores: Store[];
}) {
  const activeStores = stores.filter((store) => store.isActive);

  return (
    <section className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            Гостевой кабинет
          </p>
          <h2 className="mt-2 text-lg font-bold text-zinc-950 dark:text-white">
            Публичные ссылки для клубов
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            По этим ссылкам гости входят по коду из сообщения и видят свой
            уровень лояльности Langame, XP, задания, кейсы, Battle Pass и
            кошелёк наград. Внутренние разделы LeetPlus им недоступны. Старые
            ссылки клубов продолжают работать.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:text-cyan-200">
          {activeStores.length} клубов
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {activeStores.length ? (
          activeStores.map((store) => {
            const publicKey = store.publicSlug ?? store.id;
            const href = `/guest/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(
              publicKey,
            )}`;

            return (
              <a
                key={store.id}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-cyan-200 bg-white px-3 py-3 text-sm transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-zinc-950 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30"
              >
                <span className="block font-bold text-zinc-950 dark:text-white">
                  {store.name}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {href}
                </span>
                {store.publicSlug ? null : (
                  <span className="mt-2 block text-[11px] text-amber-700 dark:text-amber-300">
                    Короткий адрес клуба не задан, ссылка длиннее обычной.
                  </span>
                )}
              </a>
            );
          })
        ) : (
          <EmptyState text="Активных клубов пока нет" />
        )}
      </div>
    </section>
  );
}

export function EventRow({ event }: { event: GuestGameEvent }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
            {event.eventType}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {event.profile?.displayName ??
              event.guest?.displayName ??
              "без профиля"}
            {event.xpDelta
              ? ` · ${event.xpDelta > 0 ? "+" : ""}${event.xpDelta} XP`
              : ""}
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-400">
          {formatDate(event.occurredAt)}
        </p>
      </div>
      {event.note ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {event.note}
        </p>
      ) : null}
    </div>
  );
}

export const guestLogMappingPresetOptions: Array<{
  id: GuestGameGuestLogMappingPreset;
  label: string;
}> = [
  ...guestLogBusinessPresetDefinitions.map((definition) => ({
    id: definition.id as GuestGameGuestLogMappingPreset,
    label: definition.label,
  })),
  { id: "custom", label: "Свой смысл" },
];

export function guestLogMappingDraftFromItem(
  item: GuestGameGuestLogCatalog["items"][number] | null,
): GuestLogMappingPayload {
  return {
    rawType: item?.type ?? "",
    label: item?.mapping?.label ?? item?.type ?? "",
    preset: item?.mapping?.preset ?? "custom",
    intent: item?.mapping?.intent ?? "allow",
    note: item?.mapping?.note ?? "",
  };
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function economyKindLabel(
  kind: GuestGamificationWorkspace["economy"]["scenarios"][number]["kind"],
) {
  switch (kind) {
    case "LOOT_BOX":
      return "Лутбокс";
    case "MISSION":
      return "Задание";
    case "SEASON":
      return "Battle Pass";
    case "MANUAL":
    default:
      return "Ручное";
  }
}

export function economyStatusLabel(
  status: GuestGamificationWorkspace["economy"]["scenarios"][number]["status"],
) {
  return statusLabels[status as GuestGameStatus] ?? status;
}

export function economyUsageClass(value: number | null) {
  if (value === null) {
    return "bg-zinc-300 dark:bg-zinc-700";
  }

  if (value >= 90) {
    return "bg-red-500";
  }

  if (value >= 70) {
    return "bg-amber-400";
  }

  return "bg-emerald-500";
}

export function integrationReadinessStatusClass(
  status: GuestGamificationWorkspace["integrationReadiness"]["items"][number]["status"],
) {
  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "PARTIAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "MANUAL_ONLY":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200";
    case "BLOCKED":
    default:
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  }
}

export function pilotRunbookStageClass(
  stage: GuestGamificationWorkspace["pilotReadiness"]["runbook"]["stage"],
) {
  switch (stage) {
    case "READY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "LIVE_WRITE":
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200";
    case "RECONCILIATION":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "CANARY":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200";
    case "DRY_RUN":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "BLOCKED":
    default:
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  }
}

export function pilotLedgerPreflightStatusClass(
  status: GuestGamificationWorkspace["pilotReadiness"]["runbook"]["ledgerPreflight"]["status"],
) {
  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "MULTIPLE":
    case "NO_STORE":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "PROCESSING":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "WAITING_RETRY":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "EMPTY":
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  }
}

export function pilotFirstBonusReconciliationClass(
  status: GuestGamificationWorkspace["pilotReadiness"]["runbook"]["firstBonusReconciliation"]["status"],
) {
  switch (status) {
    case "MATCHED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "WAITING_SYNC":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "MISMATCH":
    case "NO_STORE":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "WAITING_LIVE":
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";
  }
}

export function bonusLedgerStatusClass(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "QUEUED":
    case "PENDING":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200";
    case "DRY_RUN":
    case "PROCESSING":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "FAILED":
    case "BLOCKED":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "SKIPPED":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "CANCELED":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    default:
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

export function bonusLedgerReconciliationClass(
  state: GuestGamificationWorkspace["bonusLedgerAudit"]["items"][number]["reconciliation"]["state"],
) {
  switch (state) {
    case "MATCHED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "WAITING_SYNC":
    case "NOT_READY":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "MISMATCH":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "NOT_APPLICABLE":
    default:
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

export function bonusBalanceCurrentReconciliationClass(
  state: GuestGamificationWorkspace["bonusBalanceCurrentReconciliation"]["items"][number]["state"],
) {
  switch (state) {
    case "MATCHED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "WAITING_SYNC":
    case "NO_SNAPSHOT":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "MISMATCH":
    default:
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  }
}

export function communicationQueueStatusClass(
  status: GuestGamificationWorkspace["communicationQueue"]["items"][number]["queueStatus"],
) {
  switch (status) {
    case "READY_FOR_BOT":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "READY_FOR_CASHIER":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200";
    case "NEEDS_APPROVAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "NEEDS_CONSENT":
    case "NEEDS_CHANNEL":
      return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
    case "UNSUBSCRIBED":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "EXPIRED":
    case "REDEEMED":
    case "CANCELED":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    default:
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

export function tariffSnapshotStatusLabel(status: GuestGameTariffSnapshotStatus) {
  switch (status) {
    case "READY":
      return "готов";
    case "PARTIAL":
      return "частично";
    case "STALE":
      return "устарел";
    case "FAILED":
      return "ошибка";
    case "UNPROFILED":
    default:
      return "нет snapshot";
  }
}

export function tariffSnapshotStatusClass(status: GuestGameTariffSnapshotStatus) {
  switch (status) {
    case "READY":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "PARTIAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "STALE":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
    case "FAILED":
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
    case "UNPROFILED":
    default:
      return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
}
