"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { GuestGamificationVisualEditor } from "@/components/guest-gamification-visual-editor";
import type { GuestAudience, GuestCrmLead, GuestDashboardRow } from "@/lib/guests";
import type {
  GuestGameBonusLedgerDispatchItem,
  GuestGameBonusLedgerDispatchResult,
  GuestGameBonusLedgerQueueResult,
  GuestGameEvent,
  GuestGameDryRunResult,
  GuestGameGuestLogMappingIntent,
  GuestGameGuestLogMappingPreset,
  GuestGameGuestLogCatalog,
  GuestGameGuestLogTypeMapping,
  GuestGameDelivery,
  GuestGameDeliveryDispatchResult,
  GuestGameDeliveryStatus,
  GuestGameLootBox,
  GuestGameMission,
  GuestGamePilotRunbookAction,
  GuestGameProfile,
  GuestGameProfileStatus,
  GuestGamePipelineRunResult,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameSeason,
  GuestGameProcessEventResult,
  GuestGameSnapshotFact,
  GuestGameSnapshotFactsResult,
  GuestGameStatus,
  GuestGameTariffSnapshotEndpoint,
  GuestGameTariffSnapshotStatus,
  GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import type { Product } from "@/lib/products";
import type { Store } from "@/lib/stores";

type Props = {
  initialWorkspace: GuestGamificationWorkspace;
  audiences: GuestAudience[];
  stores: Store[];
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  products: Product[];
  tenantSlug: string;
  initialTab?: TabId;
  initialEditorMode?: EditorMode;
  access: {
    canManageRules: boolean;
    canApproveRewards: boolean;
    canViewGuestPii: boolean;
    isPlatformAdmin: boolean;
  };
};

export type TabId =
  | "overview"
  | "profiles"
  | "lootBoxes"
  | "missions"
  | "seasons"
  | "rewards"
  | "testRun";

export type EditorMode = "advanced" | "visual";

const editorModeOptions = [
  ["advanced", "Расширенные настройки"],
  ["visual", "Визуальный редактор"],
] as const satisfies readonly [EditorMode, string][];

type GuestLogMappingPayload = {
  rawType: string;
  label: string;
  preset: GuestGameGuestLogMappingPreset;
  intent: GuestGameGuestLogMappingIntent;
  note: string;
};

type BonusLedgerActionResult =
  | { kind: "queue"; result: GuestGameBonusLedgerQueueResult }
  | { kind: "dispatch"; result: GuestGameBonusLedgerDispatchResult }
  | { kind: "cancel"; result: GuestGameBonusLedgerDispatchItem };

type BonusLedgerActionOptions = {
  storeId?: string | null;
  limit?: number;
};

type ProfileForm = {
  guestId: string;
  leadId: string;
  displayName: string;
  contactMasked: string;
  telegramIdentity: string;
  maxIdentity: string;
  xp: string;
  level: string;
  status: GuestGameProfileStatus;
};

type LootBoxPrizeForm = {
  id: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  chancePercent: string;
};

type LootBoxTimeWindowMode = "ANY" | "QUIET_HOURS" | "CUSTOM";
type LootBoxWeekdayMode = "ANY" | "WEEKDAYS" | "WEEKENDS" | "CUSTOM";

type LootBoxForm = {
  name: string;
  status: GuestGameStatus;
  triggerKind: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  segment: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  storeIds: string[];
  quietHoursEnabled: boolean;
  weekdaysOnly: boolean;
  timeWindowMode: LootBoxTimeWindowMode;
  weekdayMode: LootBoxWeekdayMode;
  selectedWeekdays: number[];
  hourFrom: string;
  hourTo: string;
  perGuestPerWeek: string;
  totalPerDay: string;
  prizes: LootBoxPrizeForm[];
  requireCashierConfirmation: boolean;
  oneDevicePerGuest: boolean;
  periodRulesText: string;
  limitsText: string;
  probabilityRulesText: string;
  budgetAmount: string;
  antiFraudText: string;
  manualApprovalRequired: boolean;
  note: string;
};

type MissionQuestStepForm = {
  id: string;
  title: string;
  missionId: string;
};

type MissionForm = {
  name: string;
  status: GuestGameStatus;
  missionType: string;
  triggerKind: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  xpReward: string;
  progressTarget: string;
  progressUnit: string;
  audienceId: string;
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  budgetAmount: string;
  perGuestLimit: string;
  totalRewardLimit: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  metricAggregation: string;
  metricEventTypes: string;
  metricHours: string;
  metricProductIds: string;
  metricExternalProductIds: string;
  metricCategoryIds: string;
  metricCategoryNames: string;
  windowDays: string;
  weekdaysOnly: boolean;
  minSessionMinutes: string;
  minSpendAmount: string;
  questEnabled: boolean;
  questSteps: MissionQuestStepForm[];
  requireLangameFact: boolean;
  denySameDayRepeat: boolean;
  requireCashierConfirmation: boolean;
  conditionsText: string;
  antiFraudText: string;
  manualApprovalRequired: boolean;
  note: string;
};

type SeasonForm = {
  name: string;
  status: GuestGameStatus;
  seasonType: string;
  audienceId: string;
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  xpVisit: string;
  xpCheckIn: string;
  xpPlayHour: string;
  xpBarPurchase: string;
  xpMissionCompletion: string;
  xpPacketSessionBonus: string;
  xpGuestLog: string;
  sessionType: string;
  packetMode: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  levelCount: string;
  xpPerLevel: string;
  freeRewardEvery: string;
  premiumRewardEvery: string;
  freeRewardLabel: string;
  premiumRewardLabel: string;
  xpRulesText: string;
  levelsText: string;
  freeRewardsText: string;
  premiumRewardsText: string;
  premiumEnabled: boolean;
  premiumUpgradeMode: string;
  budgetAmount: string;
  manualApprovalRequired: boolean;
  note: string;
};

type RewardForm = {
  profileId: string;
  guestId: string;
  lootBoxId: string;
  missionId: string;
  seasonId: string;
  storeId: string;
  status: GuestGameRewardStatus;
  source: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  rewardCode: string;
  expiresAt: string;
  note: string;
  evidenceText: string;
};

type RewardRedeemForm = {
  claim: string;
  storeId: string;
  note: string;
};

type EventForm = {
  profileId: string;
  eventType: string;
  source: string;
  xpDelta: string;
  note: string;
  payloadText: string;
};

type DryRunForm = {
  profileId: string;
  guestId: string;
  storeId: string;
  eventType: string;
  occurredAt: string;
  sessionType: string;
  sessionPacket: string;
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  guestLogType: string;
  productId: string;
  externalProductId: string;
  categoryId: string;
  productName: string;
  categoryName: string;
  supplierName: string;
  quantity: string;
  sessionMinutes: string;
  spendAmount: string;
  sourceFactId: string;
  sourceFactKind: string;
  externalProvider: string;
  externalDomain: string;
  externalId: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "profiles", label: "Профили" },
  { id: "lootBoxes", label: "Лутбоксы" },
  { id: "missions", label: "Миссии" },
  { id: "seasons", label: "Battle Pass" },
  { id: "testRun", label: "Тест запуска" },
  { id: "rewards", label: "Кошелек" },
];

const dryRunEventOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "APP_OPEN", label: "Открытие приложения" },
  { value: "VISIT", label: "Визит" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка бара" },
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Лог гостя" },
  { value: "REFERRAL_ACCEPTED", label: "Реферал принят" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Миссия выполнена" },
];

const manualXpEventOptions = [
  {
    value: "MANUAL_XP",
    label: "Ручная корректировка XP",
    description:
      "Используйте для разового начисления или списания опыта по решению команды.",
    defaultXpDelta: "50",
    payloadReason: "manual_adjustment",
  },
  {
    value: "CHECK_IN",
    label: "Чекин в клубе",
    description:
      "Фиксирует ручной чекин, если гостя нужно отметить без гостевого экрана.",
    defaultXpDelta: "10",
    payloadReason: "manual_check_in",
  },
  {
    value: "VISIT",
    label: "Визит в клуб",
    description:
      "Отмечает посещение гостя, когда автоматический факт пока не подтянулся.",
    defaultXpDelta: "20",
    payloadReason: "manual_visit",
  },
  {
    value: "PLAY_HOUR",
    label: "Час игры",
    description:
      "Подходит для ручного зачета игрового времени или компенсации за сессию.",
    defaultXpDelta: "25",
    payloadReason: "manual_play_hour",
  },
  {
    value: "MISSION_COMPLETED",
    label: "Квест выполнен",
    description:
      "Используйте, когда сотрудник вручную подтверждает выполнение задания.",
    defaultXpDelta: "50",
    payloadReason: "manual_mission_completed",
  },
  {
    value: "REFERRAL_ACCEPTED",
    label: "Приглашенный гость зарегистрировался",
    description:
      "Ручной зачет реферального события, если автоматическая атрибуция не сработала.",
    defaultXpDelta: "50",
    payloadReason: "manual_referral",
  },
  {
    value: "APP_OPEN",
    label: "Открытие приложения",
    description:
      "Ручной зачет активности для сценариев возврата гостя в приложение.",
    defaultXpDelta: "5",
    payloadReason: "manual_app_open",
  },
] as const;

function manualXpEventOption(value: string) {
  return (
    manualXpEventOptions.find((option) => option.value === value) ??
    manualXpEventOptions[0]
  );
}

function manualXpPayloadText(eventType: string) {
  const option = manualXpEventOption(eventType);

  return jsonText({
    reason: option.payloadReason,
    createdFrom: "guest_game_hub",
  });
}

const lootBoxTriggerOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "APP_OPEN", label: "Открытие приложения" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Визит в клуб" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Событие Langame" },
];

const lootBoxSegmentOptions = [
  { value: "", label: "Все гости" },
  { value: "quiet_hours", label: "Тихие часы" },
  { value: "new_guests", label: "Новые гости" },
  { value: "regular_guests", label: "Постоянные гости" },
  { value: "returning_guests", label: "Вернувшиеся гости" },
  { value: "vip_guests", label: "VIP / активные" },
  { value: "birthday", label: "День рождения" },
  { value: "referral", label: "Реферальные гости" },
];

const lootBoxTimeWindowOptions: Array<{
  value: LootBoxTimeWindowMode;
  label: string;
}> = [
  { value: "ANY", label: "Любое время" },
  { value: "QUIET_HOURS", label: "Тихие часы" },
  { value: "CUSTOM", label: "Свое окно" },
];

const lootBoxWeekdayOptions: Array<{
  value: LootBoxWeekdayMode;
  label: string;
}> = [
  { value: "ANY", label: "Любой день" },
  { value: "WEEKDAYS", label: "Будни" },
  { value: "WEEKENDS", label: "Выходные" },
  { value: "CUSTOM", label: "Выбрать дни" },
];

const weekdayOptions = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

const weekdayPresets: Record<LootBoxWeekdayMode, number[]> = {
  ANY: [0, 1, 2, 3, 4, 5, 6],
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKENDS: [0, 6],
  CUSTOM: [1, 2, 3, 4, 5],
};

const triggerHelpText: Record<string, string> = {
  SESSION_START:
    "Правило проверится, когда у гостя начнется игровая сессия в клубе.",
  APP_OPEN:
    "Правило проверится, когда гость откроет сайт игрового модуля или Telegram Mini App. Подходит для возврата потерявшихся гостей.",
  CHECK_IN:
    "Правило проверится после чекина гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Общий визит в клуб: подходит для сценариев, где сессия, чекин или лог Langame считаются посещением.",
  PLAY_HOUR:
    "Правило проверится по накопленному игровому времени, например за час игры или завершение сессии.",
  BAR_PURCHASE:
    "Правило проверится после покупки или списания в баре, если факт есть в сохраненных данных.",
  PRODUCT_PURCHASE:
    "Правило проверится после товарной покупки из сохраненных продаж или списаний.",
  BALANCE_TOPUP:
    "Правило проверится после пополнения баланса гостя в сохраненных фактах Langame.",
  GUEST_LOG:
    "Правило проверится по событию из guests/logs. Ниже можно ограничить разрешенные и запрещенные типы логов.",
  REFERRAL_ACCEPTED:
    "Правило проверится, когда приглашенный гость успешно зарегистрируется по реферальной ссылке.",
  REPEAT_VISIT:
    "Правило проверит повторное посещение гостя в заданном окне времени.",
  MISSION_COMPLETED:
    "Правило проверится после выполнения другой миссии или квеста.",
};

const missionTypeOptions = [
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Посещение клуба" },
  { value: "PLAY_HOUR", label: "Игровое время" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "PRODUCT_PURCHASE", label: "Покупка товара" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "REFERRAL_ACCEPTED", label: "Приглашение друга" },
  { value: "APP_OPEN", label: "Возврат в приложение" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "CUSTOM", label: "Своя миссия" },
];

const missionTypeHelpText: Record<string, string> = {
  REPEAT_VISIT:
    "Квест засчитывает повторное посещение в заданном окне времени.",
  CHECK_IN:
    "Квест засчитывает чекин гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Квест засчитывает факт визита: сессию, чекин или подходящий лог Langame.",
  PLAY_HOUR:
    "Квест считает накопленное игровое время или длительность сессии.",
  BAR_PURCHASE:
    "Квест считает покупки бара по сохраненным продажам или списаниям.",
  PRODUCT_PURCHASE:
    "Квест считает покупку выбранных товаров или категорий.",
  BALANCE_TOPUP:
    "Квест считает пополнение баланса гостя по сохраненным фактам Langame.",
  REFERRAL_ACCEPTED:
    "Квест засчитывает регистрацию приглашенного друга в игровом модуле.",
  APP_OPEN:
    "Квест срабатывает при открытии сайта, игрового модуля или Mini App.",
  GUEST_LOG:
    "Квест работает от выбранных событий Langame из подготовленного каталога.",
  CUSTOM:
    "Свободный сценарий: событие и условия задаются ниже вручную.",
};

const progressUnitOptions = [
  { value: "visit", label: "визиты" },
  { value: "check_in", label: "чекины" },
  { value: "minute", label: "минуты игры" },
  { value: "purchase", label: "покупки" },
  { value: "rub", label: "рубли" },
  { value: "day", label: "уникальные дни" },
  { value: "friend", label: "друзья" },
  { value: "event", label: "события" },
  { value: "step", label: "шаги" },
];

const audienceHelpText: Record<string, string> = {
  "": "Правило доступно всем гостям выбранных клубов, если остальные условия совпали.",
  quiet_hours:
    "Сценарий для загрузки непиковых часов. Обычно используется вместе с временным окном.",
  new_guests:
    "Для гостей, которые только начинают взаимодействовать с клубом или игровым модулем.",
  regular_guests:
    "Для постоянных гостей с регулярной активностью и повторными визитами.",
  returning_guests:
    "Для гостей, которых нужно вернуть после паузы или долгого отсутствия.",
  vip_guests:
    "Для самых активных или ценных гостей, которым можно давать отдельные условия.",
  birthday:
    "Для поздравительных сценариев и наград, привязанных к дню рождения.",
  referral:
    "Для гостей, пришедших через приглашение, или для реферальных механик.",
};

const rewardTypeOptions = [
  { value: "PROMOCODE", label: "Промокод" },
  { value: "BONUS_BALANCE", label: "Бонусы Langame" },
  { value: "BALANCE", label: "Денежный баланс Langame" },
  { value: "XP", label: "Опыт XP" },
  { value: "FREE_HOURS", label: "Бесплатные часы" },
  { value: "CASHIER_CODE", label: "Код кассиру" },
  { value: "MERCH", label: "Физический приз" },
  { value: "BATTLE_PASS_REWARD", label: "Награда Battle Pass" },
];

const lootBoxRewardTypeOptions = rewardTypeOptions.filter(
  (option) => !["BALANCE", "BATTLE_PASS_REWARD"].includes(option.value),
);

const legacyRewardTypeLabelOptions = [
  { value: "BONUS", label: "Бонусы Langame (старый тип)" },
  { value: "BONUS_POINTS", label: "Бонусы Langame (старый тип)" },
  { value: "LOYALTY_BONUS", label: "Бонусы Langame (старый тип)" },
  { value: "CASHBACK", label: "Бонусы Langame (старый тип)" },
  { value: "CASH_BALANCE", label: "Бонусы Langame (старый тип)" },
  { value: "LANGAME_BALANCE", label: "Бонусы Langame (старый тип)" },
  { value: "MONEY_BALANCE", label: "Денежный баланс Langame (старый тип)" },
  { value: "WALLET_BALANCE", label: "Денежный баланс Langame (старый тип)" },
];

const rewardTypeLabelOptions = [
  ...rewardTypeOptions,
  ...legacyRewardTypeLabelOptions,
];

const automaticLedgerRewardTypes = new Set([
  "BALANCE",
  "BONUS",
  "BONUS_BALANCE",
  "BONUS_POINTS",
  "CASH_BALANCE",
  "DEPOSIT",
  "LANGAME_BALANCE",
  "LOYALTY_BONUS",
  "MONEY_BALANCE",
  "WALLET_BALANCE",
]);

const sessionTypeOptions = [
  { value: "", label: "любой тип" },
  { value: "regular_session", label: "обычная сессия" },
  { value: "packet_hours", label: "пакет часов" },
];

const packetModeOptions = [
  { value: "ANY", label: "любой формат" },
  { value: "PACKET_ONLY", label: "только пакет часов" },
  { value: "NON_PACKET_ONLY", label: "только обычная сессия" },
];

const dryRunPacketOptions = [
  { value: "", label: "не указано" },
  { value: "true", label: "пакет часов" },
  { value: "false", label: "обычная сессия" },
];

const statusLabels: Record<GuestGameStatus, string> = {
  DRAFT: "черновик",
  ACTIVE: "активно",
  PAUSED: "пауза",
  FINISHED: "завершено",
  ARCHIVED: "архив",
};

const profileStatusLabels: Record<GuestGameProfileStatus, string> = {
  ACTIVE: "активен",
  PAUSED: "пауза",
  ARCHIVED: "архив",
};

const rewardStatusLabels: Record<GuestGameRewardStatus, string> = {
  PENDING: "к выдаче",
  APPROVED: "согласовано",
  PAID: "выдано",
  CANCELED: "отменено",
  EXPIRED: "сгорело",
};

const rewardWalletStateLabels: Record<GuestGameReward["walletState"], string> = {
  WAITING_APPROVAL: "ожидает подтверждения",
  READY: "можно выдать",
  REDEEMED: "погашено",
  CANCELED: "отменено",
  EXPIRED: "срок истек",
};

const rewardStatusActionLabels: Record<GuestGameRewardStatus, string> = {
  PENDING: "Вернуть к выдаче",
  APPROVED: "Согласовать",
  PAID: "Отметить выдано",
  CANCELED: "Отменить",
  EXPIRED: "Списать как сгоревшую",
};

const rewardStatusDescriptions: Record<GuestGameRewardStatus, string> = {
  PENDING: "Награда создана и ждет проверки сотрудником.",
  APPROVED:
    "Согласовано: сотрудник подтвердил право гостя на приз. Автоматические бонусы попадут в очередь начисления, а ручную выдачу нужно закрыть кодом кассира или отметкой выдачи.",
  PAID: "Выдано: приз уже погашен или начислен, повторно выдать его нельзя.",
  CANCELED: "Отменено: награда не будет выдана гостю.",
  EXPIRED: "Сгорело: срок действия награды истек.",
};

type RewardSortMode = "newest" | "oldest";

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";

const smallButtonClass =
  "rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-100";

const primaryButtonClass =
  "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300";

const formSectionClass =
  "rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35";

const statusOptions: GuestGameStatus[] = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "FINISHED",
  "ARCHIVED",
];

const profileStatusOptions: GuestGameProfileStatus[] = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
];

const rewardStatusOptions: GuestGameRewardStatus[] = [
  "PENDING",
  "APPROVED",
  "PAID",
  "CANCELED",
  "EXPIRED",
];

const defaultProfileForm: ProfileForm = {
  guestId: "",
  leadId: "",
  displayName: "",
  contactMasked: "",
  telegramIdentity: "",
  maxIdentity: "",
  xp: "0",
  level: "1",
  status: "ACTIVE",
};

const defaultLootBoxPrizes: LootBoxPrizeForm[] = [
  {
    id: "default-bonus-50",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "50",
    rewardLabel: "50 бонусов",
    chancePercent: "85",
  },
  {
    id: "default-bonus-100",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "100",
    rewardLabel: "100 бонусов",
    chancePercent: "5",
  },
  {
    id: "default-bonus-200",
    rewardType: "BONUS_BALANCE",
    rewardAmount: "200",
    rewardLabel: "200 бонусов",
    chancePercent: "2",
  },
  {
    id: "default-promo-1000",
    rewardType: "PROMOCODE",
    rewardAmount: "1000",
    rewardLabel: "Промокод на 1000 рублей",
    chancePercent: "1",
  },
];

const defaultLootBoxForm: LootBoxForm = {
  name: "Лутбокс тихих часов",
  status: "DRAFT",
  triggerKind: "SESSION_START",
  rewardType: defaultLootBoxPrizes[0].rewardType,
  rewardAmount: defaultLootBoxPrizes[0].rewardAmount,
  rewardLabel: defaultLootBoxPrizes[0].rewardLabel,
  audienceId: "",
  segment: "quiet_hours",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  storeIds: [],
  quietHoursEnabled: true,
  weekdaysOnly: true,
  timeWindowMode: "QUIET_HOURS",
  weekdayMode: "WEEKDAYS",
  selectedWeekdays: [1, 2, 3, 4, 5],
  hourFrom: "10:00",
  hourTo: "16:00",
  perGuestPerWeek: "1",
  totalPerDay: "30",
  prizes: defaultLootBoxPrizes,
  requireCashierConfirmation: true,
  oneDevicePerGuest: true,
  periodRulesText: jsonText({
    timeWindowMode: "QUIET_HOURS",
    weekdayMode: "WEEKDAYS",
    weekdays: [1, 2, 3, 4, 5],
    hours: ["10:00-16:00"],
    packetMode: "ANY",
  }),
  limitsText: jsonText({
    perGuestPerWeek: 1,
    totalPerDay: 30,
  }),
  probabilityRulesText: jsonText({
    type: "weighted",
    prizes: defaultLootBoxPrizes.map((prize) => ({
      rewardType: prize.rewardType,
      rewardAmount: Number(prize.rewardAmount),
      rewardLabel: prize.rewardLabel,
      chancePercent: Number(prize.chancePercent),
      weight: Number(prize.chancePercent),
    })),
    items: defaultLootBoxPrizes.map((prize) => ({
      label: prize.rewardLabel,
      weight: Number(prize.chancePercent),
    })),
  }),
  budgetAmount: "5000",
  antiFraudText: jsonText({
    source: "business_controls",
  }),
  manualApprovalRequired: true,
  note: "Выдача только после проверки администратором.",
};

const defaultMissionQuestSteps: MissionQuestStepForm[] = [
  {
    id: "step-1",
    title: "Сыграть сессию от 90 минут",
    missionId: "",
  },
  {
    id: "step-2",
    title: "Купить напиток или снек",
    missionId: "",
  },
  {
    id: "step-3",
    title: "Вернуться в будний день",
    missionId: "",
  },
];

const maxMissionQuestSteps = 10;

function cloneMissionQuestSteps(steps: MissionQuestStepForm[]) {
  return steps.map((step) => ({ ...step }));
}

const defaultMissionForm: MissionForm = {
  name: "Вернись в будний день",
  status: "DRAFT",
  missionType: "REPEAT_VISIT",
  triggerKind: "REPEAT_VISIT",
  rewardType: "PROMOCODE",
  rewardAmount: "0",
  rewardLabel: "Промокод на бар",
  xpReward: "80",
  progressTarget: "1",
  progressUnit: "visit",
  audienceId: "",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  budgetAmount: "7000",
  perGuestLimit: "1",
  totalRewardLimit: "100",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  metricAggregation: "count",
  metricEventTypes: "",
  metricHours: "",
  metricProductIds: "",
  metricExternalProductIds: "",
  metricCategoryIds: "",
  metricCategoryNames: "",
  windowDays: "7",
  weekdaysOnly: true,
  minSessionMinutes: "90",
  minSpendAmount: "0",
  questEnabled: false,
  questSteps: cloneMissionQuestSteps(defaultMissionQuestSteps),
  requireLangameFact: true,
  denySameDayRepeat: true,
  requireCashierConfirmation: true,
  conditionsText: jsonText({
    windowDays: 7,
    weekdaysOnly: true,
    packetMode: "ANY",
    requiresLangameFact: true,
  }),
  antiFraudText: jsonText({
    denySameDayRepeat: true,
    requiresCashierConfirmation: true,
  }),
  manualApprovalRequired: true,
  note: "Факт визита берем из Langame, выдачу подтверждает кассир.",
};

const defaultSeasonForm: SeasonForm = {
  name: "Клубный сезон",
  status: "DRAFT",
  seasonType: "CLUB_SEASON",
  audienceId: "",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  xpVisit: "20",
  xpCheckIn: "20",
  xpPlayHour: "10",
  xpBarPurchase: "25",
  xpMissionCompletion: "50",
  xpPacketSessionBonus: "15",
  xpGuestLog: "5",
  sessionType: "",
  packetMode: "ANY",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  levelCount: "4",
  xpPerLevel: "250",
  freeRewardEvery: "2",
  premiumRewardEvery: "2",
  freeRewardLabel: "Промокод бара",
  premiumRewardLabel: "Усиленный промокод",
  xpRulesText: jsonText({
    visit: 20,
    checkIn: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
    packetSessionBonus: 15,
    guestLog: 5,
    packetMode: "ANY",
  }),
  levelsText: jsonText([
    { level: 1, xp: 0, freeReward: "Старт сезона" },
    { level: 2, xp: 250, freeReward: "Промокод бара" },
    { level: 3, xp: 500, freeReward: "Бонус на следующий визит" },
    { level: 4, xp: 900, freeReward: "Игровое время с подтверждением" },
  ]),
  freeRewardsText: jsonText([
    { level: 2, reward: "Промокод бара" },
    { level: 4, reward: "Бонус на следующий визит" },
  ]),
  premiumRewardsText: jsonText([
    { level: 2, reward: "Усиленный промокод" },
    { level: 4, reward: "Турнирный билет" },
  ]),
  premiumEnabled: false,
  premiumUpgradeMode: "manual",
  budgetAmount: "15000",
  manualApprovalRequired: true,
  note: "Premium включается вручную после оплаты или решения управляющего.",
};

const defaultRewardForm: RewardForm = {
  profileId: "",
  guestId: "",
  lootBoxId: "",
  missionId: "",
  seasonId: "",
  storeId: "",
  status: "PENDING",
  source: "MANUAL",
  rewardType: "PROMOCODE",
  rewardAmount: "0",
  rewardLabel: "Ручная награда",
  rewardCode: "",
  expiresAt: "",
  note: "",
  evidenceText: jsonText({
    cashierReview: true,
  }),
};

const defaultRewardRedeemForm: RewardRedeemForm = {
  claim: "",
  storeId: "",
  note: "",
};

const defaultEventForm: EventForm = {
  profileId: "",
  eventType: "MANUAL_XP",
  source: "MANUAL",
  xpDelta: "50",
  note: "",
  payloadText: manualXpPayloadText("MANUAL_XP"),
};

const emptyDryRunSource = {
  sourceFactId: "",
  sourceFactKind: "",
  externalProvider: "",
  externalDomain: "",
  externalId: "",
};

const defaultDryRunForm: DryRunForm = {
  profileId: "",
  guestId: "",
  storeId: "",
  eventType: "SESSION_START",
  occurredAt: "",
  sessionType: "",
  sessionPacket: "",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogType: "",
  productId: "",
  externalProductId: "",
  categoryId: "",
  productName: "",
  categoryName: "",
  supplierName: "",
  quantity: "",
  sessionMinutes: "120",
  spendAmount: "0",
  ...emptyDryRunSource,
};

export function GuestGamificationPanel({
  initialWorkspace,
  audiences,
  stores,
  guests,
  leads,
  products,
  tenantSlug,
  initialTab = "overview",
  initialEditorMode = "advanced",
  access,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(defaultProfileForm);
  const [lootBoxForm, setLootBoxForm] =
    useState<LootBoxForm>(defaultLootBoxForm);
  const [missionForm, setMissionForm] =
    useState<MissionForm>(defaultMissionForm);
  const [seasonForm, setSeasonForm] = useState<SeasonForm>(defaultSeasonForm);
  const [rewardForm, setRewardForm] = useState<RewardForm>(defaultRewardForm);
  const [rewardRedeemForm, setRewardRedeemForm] =
    useState<RewardRedeemForm>(defaultRewardRedeemForm);
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm);
  const [dryRunForm, setDryRunForm] =
    useState<DryRunForm>(defaultDryRunForm);
  const [dryRunResult, setDryRunResult] =
    useState<GuestGameDryRunResult | null>(null);
  const [processEventResult, setProcessEventResult] =
    useState<GuestGameProcessEventResult | null>(null);
  const [snapshotFacts, setSnapshotFacts] =
    useState<GuestGameSnapshotFactsResult | null>(null);
  const [pipelineResult, setPipelineResult] =
    useState<GuestGamePipelineRunResult | null>(null);
  const [deliveryDispatchResult, setDeliveryDispatchResult] =
    useState<GuestGameDeliveryDispatchResult | null>(null);
  const [bonusLedgerResult, setBonusLedgerResult] =
    useState<BonusLedgerActionResult | null>(null);
  const [redeemedReward, setRedeemedReward] =
    useState<GuestGameReward | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingLootBoxId, setEditingLootBoxId] = useState<string | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return workspace.profiles;
    }

    return workspace.profiles.filter((profile) =>
      [
        profile.displayName,
        profile.contactMasked,
        profile.telegramIdentity,
        profile.maxIdentity,
        profile.guest?.externalGuestId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [workspace.profiles, query]);

  const pendingRewards = useMemo(
    () =>
      workspace.rewards.filter((reward) =>
        ["PENDING", "APPROVED"].includes(reward.status),
      ),
    [workspace.rewards],
  );

  function editProfile(profile: GuestGameProfile) {
    setProfileForm(profileToForm(profile));
    setEditingProfileId(profile.id);
    setActiveTab("profiles");
  }

  function resetProfileForm() {
    setProfileForm(defaultProfileForm);
    setEditingProfileId(null);
  }

  function editLootBox(lootBox: GuestGameLootBox) {
    setLootBoxForm(lootBoxToForm(lootBox));
    setEditingLootBoxId(lootBox.id);
    setActiveTab("lootBoxes");
  }

  function resetLootBoxForm() {
    setLootBoxForm(defaultLootBoxForm);
    setEditingLootBoxId(null);
  }

  function editMission(mission: GuestGameMission) {
    setMissionForm(missionToForm(mission));
    setEditingMissionId(mission.id);
    setActiveTab("missions");
  }

  function resetMissionForm() {
    setMissionForm(defaultMissionForm);
    setEditingMissionId(null);
  }

  function editSeason(season: GuestGameSeason) {
    setSeasonForm(seasonToForm(season));
    setEditingSeasonId(season.id);
    setActiveTab("seasons");
  }

  function resetSeasonForm() {
    setSeasonForm(defaultSeasonForm);
    setEditingSeasonId(null);
  }

  function editReward(reward: GuestGameReward) {
    setRewardForm(rewardToForm(reward));
    setEditingRewardId(reward.id);
    setActiveTab("rewards");
  }

  function resetRewardForm() {
    setRewardForm(defaultRewardForm);
    setEditingRewardId(null);
  }

  async function reloadWorkspace() {
    const next = await fetchJson<GuestGamificationWorkspace>(
      "/api/guests/gamification/workspace",
    );
    setWorkspace(next);
  }

  async function saveProfile() {
    await saveAction("profile", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения игровых профилей нужно право `Геймификация: правила`.",
      );

      const payload = {
        guestId: nullable(profileForm.guestId),
        leadId: nullable(profileForm.leadId),
        displayName: nullable(profileForm.displayName),
        contactMasked: nullable(profileForm.contactMasked),
        telegramIdentity: nullable(profileForm.telegramIdentity),
        maxIdentity: nullable(profileForm.maxIdentity),
        xp: profileForm.xp,
        level: profileForm.level,
        status: profileForm.status,
      };

      if (editingProfileId) {
        await patchJson(
          `/api/guests/gamification/profiles/${editingProfileId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/profiles", payload);
      }

      resetProfileForm();
      await reloadWorkspace();
    });
  }

  async function updateProfileStatus(
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) {
    await saveAction(`profile-${profile.id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для изменения статуса профиля нужно право `Геймификация: правила`.",
      );

      await patchJson(`/api/guests/gamification/profiles/${profile.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function saveLootBox() {
    await saveAction("lootBox", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения лутбоксов нужно право `Геймификация: правила`.",
      );

      const primaryPrize = primaryLootBoxPrize(lootBoxForm);
      const payload = {
        name: lootBoxForm.name,
        status: lootBoxForm.status,
        triggerKind: lootBoxForm.triggerKind,
        rewardType: primaryPrize.rewardType,
        rewardAmount: primaryPrize.rewardAmount,
        rewardLabel: nullable(primaryPrize.rewardLabel),
        audienceId: nullable(lootBoxForm.audienceId),
        segment: nullable(lootBoxForm.segment),
        sessionType: nullable(lootBoxForm.sessionType),
        storeIds: lootBoxForm.storeIds,
        periodRules: buildLootBoxPeriodRules(lootBoxForm),
        limits: buildLootBoxLimits(lootBoxForm),
        probabilityRules: buildLootBoxProbabilityRules(lootBoxForm),
        budgetAmount: lootBoxForm.budgetAmount,
        antiFraudRules: buildLootBoxAntiFraudRules(),
        manualApprovalRequired: lootBoxForm.manualApprovalRequired,
        note: nullable(lootBoxForm.note),
      };

      if (editingLootBoxId) {
        await patchJson(
          `/api/guests/gamification/loot-boxes/${editingLootBoxId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/loot-boxes", payload);
      }

      resetLootBoxForm();
      await reloadWorkspace();
    });
  }

  async function saveMission() {
    await saveAction("mission", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения миссий нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: missionForm.name,
        status: missionForm.status,
        missionType: missionForm.missionType,
        triggerKind: missionForm.triggerKind,
        rewardType: missionForm.rewardType,
        rewardAmount: missionForm.rewardAmount,
        rewardLabel: nullable(missionForm.rewardLabel),
        xpReward: missionForm.xpReward,
        progressTarget: missionForm.progressTarget,
        progressUnit: nullable(missionForm.progressUnit),
        audienceId: nullable(missionForm.audienceId),
        storeIds: missionForm.storeIds,
        periodFrom: nullable(missionForm.periodFrom),
        periodTo: nullable(missionForm.periodTo),
        budgetAmount: missionForm.budgetAmount,
        perGuestLimit: missionForm.perGuestLimit,
        totalRewardLimit: missionForm.totalRewardLimit,
        conditions: buildMissionConditions(missionForm),
        antiFraudRules: buildMissionAntiFraudRules(missionForm),
        manualApprovalRequired: missionForm.manualApprovalRequired,
        note: nullable(missionForm.note),
      };

      if (editingMissionId) {
        await patchJson(
          `/api/guests/gamification/missions/${editingMissionId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/missions", payload);
      }

      resetMissionForm();
      await reloadWorkspace();
    });
  }

  async function saveSeason() {
    await saveAction("season", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения Battle Pass нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: seasonForm.name,
        status: seasonForm.status,
        seasonType: seasonForm.seasonType,
        audienceId: nullable(seasonForm.audienceId),
        storeIds: seasonForm.storeIds,
        periodFrom: nullable(seasonForm.periodFrom),
        periodTo: nullable(seasonForm.periodTo),
        xpRules: buildSeasonXpRules(seasonForm),
        levels: buildSeasonLevels(seasonForm),
        freeRewards: buildSeasonRewards(seasonForm, "free"),
        premiumRewards: buildSeasonRewards(seasonForm, "premium"),
        premiumEnabled: seasonForm.premiumEnabled,
        premiumUpgradeMode: nullable(seasonForm.premiumUpgradeMode),
        budgetAmount: seasonForm.budgetAmount,
        manualApprovalRequired: seasonForm.manualApprovalRequired,
        note: nullable(seasonForm.note),
      };

      if (editingSeasonId) {
        await patchJson(
          `/api/guests/gamification/seasons/${editingSeasonId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/seasons", payload);
      }

      resetSeasonForm();
      await reloadWorkspace();
    });
  }

  async function saveReward() {
    await saveAction("reward", async () => {
      assertCan(
        access.canApproveRewards,
        "Для изменения наград нужно право `Геймификация: награды`.",
      );

      const payload = {
        profileId: nullable(rewardForm.profileId),
        guestId: nullable(rewardForm.guestId),
        lootBoxId: nullable(rewardForm.lootBoxId),
        missionId: nullable(rewardForm.missionId),
        seasonId: nullable(rewardForm.seasonId),
        storeId: nullable(rewardForm.storeId),
        status: rewardForm.status,
        source: rewardForm.source,
        rewardType: rewardForm.rewardType,
        rewardAmount: rewardForm.rewardAmount,
        rewardLabel: rewardForm.rewardLabel,
        rewardCode: nullable(rewardForm.rewardCode),
        expiresAt: nullable(rewardForm.expiresAt),
        note: nullable(rewardForm.note),
        evidence: parseJson(rewardForm.evidenceText, "доказательства"),
      };

      if (editingRewardId) {
        await patchJson(
          `/api/guests/gamification/rewards/${editingRewardId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/rewards", payload);
      }

      resetRewardForm();
      await reloadWorkspace();
    });
  }

  async function saveEvent() {
    await saveAction("event", async () => {
      assertCan(
        access.canManageRules,
        "Для ручного создания игровых событий нужно право `Геймификация: правила`.",
      );

      await postJson("/api/guests/gamification/events", {
        profileId: nullable(eventForm.profileId),
        eventType: eventForm.eventType,
        source: eventForm.source,
        xpDelta: eventForm.xpDelta,
        note: nullable(eventForm.note),
        payload: parseJson(eventForm.payloadText, "payload события"),
      });
      setEventForm(defaultEventForm);
      await reloadWorkspace();
    });
  }

  async function runDryRun() {
    await saveAction("dryRun", async () => {
      const result = await postJson<GuestGameDryRunResult>(
        "/api/guests/gamification/dry-run",
        {
          profileId: nullable(dryRunForm.profileId),
          guestId: nullable(dryRunForm.guestId),
          storeId: nullable(dryRunForm.storeId),
          eventType: dryRunForm.eventType,
          occurredAt: nullable(dryRunForm.occurredAt),
          sessionType: nullable(dryRunForm.sessionType),
          sessionPacket: nullable(dryRunForm.sessionPacket),
          tariffGroupId: nullable(dryRunForm.tariffGroupId),
          tariffPeriodId: nullable(dryRunForm.tariffPeriodId),
          tariffTypeId: nullable(dryRunForm.tariffTypeId),
          guestLogType: nullable(dryRunForm.guestLogType),
          productId: nullable(dryRunForm.productId),
          externalProductId: nullable(dryRunForm.externalProductId),
          categoryId: nullable(dryRunForm.categoryId),
          productName: nullable(dryRunForm.productName),
          categoryName: nullable(dryRunForm.categoryName),
          supplierName: nullable(dryRunForm.supplierName),
          quantity: dryRunForm.quantity,
          sessionMinutes: dryRunForm.sessionMinutes,
          spendAmount: dryRunForm.spendAmount,
        },
      );

      setDryRunResult(result);
      setProcessEventResult(null);
    });
  }

  async function processDryRunEvent() {
    await saveAction("processEvent", async () => {
      assertCan(
        access.canManageRules,
        "Для подтвержденного запуска события нужно право `Геймификация: правила`.",
      );

      const result = await postJson<GuestGameProcessEventResult>(
        "/api/guests/gamification/process-event",
        {
          profileId: nullable(dryRunForm.profileId),
          guestId: nullable(dryRunForm.guestId),
          storeId: nullable(dryRunForm.storeId),
          eventType: dryRunForm.eventType,
          occurredAt: nullable(dryRunForm.occurredAt),
          sessionType: nullable(dryRunForm.sessionType),
          sessionPacket: nullable(dryRunForm.sessionPacket),
          tariffGroupId: nullable(dryRunForm.tariffGroupId),
          tariffPeriodId: nullable(dryRunForm.tariffPeriodId),
          tariffTypeId: nullable(dryRunForm.tariffTypeId),
          guestLogType: nullable(dryRunForm.guestLogType),
          productId: nullable(dryRunForm.productId),
          externalProductId: nullable(dryRunForm.externalProductId),
          categoryId: nullable(dryRunForm.categoryId),
          productName: nullable(dryRunForm.productName),
          categoryName: nullable(dryRunForm.categoryName),
          supplierName: nullable(dryRunForm.supplierName),
          quantity: dryRunForm.quantity,
          sessionMinutes: dryRunForm.sessionMinutes,
          spendAmount: dryRunForm.spendAmount,
          sourceFactId: nullable(dryRunForm.sourceFactId),
          sourceFactKind: nullable(dryRunForm.sourceFactKind),
          externalProvider: nullable(dryRunForm.externalProvider),
          externalDomain: nullable(dryRunForm.externalDomain),
          externalId: nullable(dryRunForm.externalId),
        },
      );

      setDryRunResult(result.dryRun);
      setProcessEventResult(result);
      await reloadWorkspace();
    });
  }

  async function loadSnapshotFacts() {
    await saveAction("facts", async () => {
      const result = await fetchJson<GuestGameSnapshotFactsResult>(
        "/api/guests/gamification/facts",
      );
      setSnapshotFacts(result);
    });
  }

  async function runSnapshotPipeline(dryRunOnly: boolean) {
    await saveAction(dryRunOnly ? "pipelinePreview" : "pipelineRun", async () => {
      if (!dryRunOnly) {
        assertCan(
          access.canManageRules,
          "Для batch-обработки snapshot-фактов нужно право `Геймификация: правила`.",
        );
      }

      const result = await postJson<GuestGamePipelineRunResult>(
        "/api/guests/gamification/pipeline/run",
        {
          limit: 20,
          dryRunOnly,
        },
      );

      setPipelineResult(result);
      setProcessEventResult(null);

      if (!dryRunOnly) {
        await reloadWorkspace();
      }
    });
  }

  async function saveGuestLogTypeMapping(payload: GuestLogMappingPayload) {
    await saveAction("guestLogMapping", async () => {
      assertCan(
        access.canManageRules,
        "Для настройки типов guests/logs нужно право `Геймификация: правила`.",
      );

      await postJson("/api/guests/gamification/guest-log-mappings", payload);
      await reloadWorkspace();
    });
  }

  async function deleteGuestLogTypeMapping(
    mapping: GuestGameGuestLogTypeMapping,
  ) {
    await saveAction("guestLogMapping", async () => {
      assertCan(
        access.canManageRules,
        "Для настройки типов guests/logs нужно право `Геймификация: правила`.",
      );

      await deleteJson(`/api/guests/gamification/guest-log-mappings/${mapping.id}`);
      await reloadWorkspace();
    });
  }

  function applySnapshotFact(fact: GuestGameSnapshotFact) {
    setDryRunForm((current) => ({
      ...current,
      profileId: fact.profileId ?? "",
      guestId: fact.guest?.id ?? current.guestId,
      storeId: fact.store?.id ?? current.storeId,
      eventType: fact.eventType,
      occurredAt: dateInputValue(fact.occurredAt),
      sessionType: fact.sessionType ?? current.sessionType,
      sessionPacket:
        fact.sessionPacket == null ? current.sessionPacket : String(fact.sessionPacket),
      tariffGroupId: fact.tariffGroupId ?? current.tariffGroupId,
      tariffPeriodId: fact.tariffPeriodId ?? current.tariffPeriodId,
      tariffTypeId: fact.tariffTypeId ?? current.tariffTypeId,
      guestLogType: fact.guestLogType ?? current.guestLogType,
      sessionMinutes:
        fact.sessionMinutes == null
          ? current.sessionMinutes
          : String(fact.sessionMinutes),
      spendAmount:
        fact.spendAmount == null ? current.spendAmount : String(fact.spendAmount),
      sourceFactId: fact.id,
      sourceFactKind: fact.source,
      externalProvider: fact.externalProvider ?? "",
      externalDomain: fact.externalDomain ?? "",
      externalId: fact.externalId ?? "",
    }));
    setDryRunResult(null);
    setProcessEventResult(null);
    setPipelineResult(null);
  }

  async function updateRewardStatus(
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) {
    await saveAction(`reward-${reward.id}`, async () => {
      assertCan(
        access.canApproveRewards,
        "Для изменения статуса награды нужно право `Геймификация: награды`.",
      );

      await patchJson(`/api/guests/gamification/rewards/${reward.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function prepareDeliveryOutbox() {
    await saveAction("deliveries-prepare", async () => {
      assertCan(
        access.canApproveRewards,
        "Для подготовки outbox выдачи нужно право `Геймификация: награды`.",
      );

      await postJson("/api/guests/gamification/deliveries/prepare", {
        includeBlocked: true,
        limit: 50,
      });
      await reloadWorkspace();
    });
  }

  async function dispatchDeliveryOutbox() {
    await saveAction("deliveries-dispatch", async () => {
      assertCan(
        access.canApproveRewards,
        "Для проверки dispatcher outbox нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameDeliveryDispatchResult>(
        "/api/guests/gamification/deliveries/dispatch",
        {
          channels: ["TELEGRAM", "MAX"],
          dryRun: true,
          limit: 25,
        },
      );

      setDeliveryDispatchResult(result);
      await reloadWorkspace();
    });
  }

  async function queueBonusLedger(options: BonusLedgerActionOptions = {}) {
    await saveAction("bonus-ledger-queue", async () => {
      assertCan(
        access.canApproveRewards,
        "Для постановки бонусов в ledger нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameBonusLedgerQueueResult>(
        "/api/guests/gamification/bonus-ledger/queue",
        {
          limit: options.limit ?? 50,
          storeId: nullable(options.storeId ?? ""),
        },
      );

      setBonusLedgerResult({ kind: "queue", result });
      await reloadWorkspace();
    });
  }

  async function dryRunBonusLedgerDispatch(
    options: BonusLedgerActionOptions = {},
  ) {
    await saveAction("bonus-ledger-dry-run", async () => {
      assertCan(
        access.canApproveRewards,
        "Для проверки bonus ledger dispatch нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameBonusLedgerDispatchResult>(
        "/api/guests/gamification/bonus-ledger/dispatch",
        {
          dryRun: true,
          queueApprovedRewards: false,
          limit: options.limit ?? 25,
          storeId: nullable(options.storeId ?? ""),
        },
      );

      setBonusLedgerResult({ kind: "dispatch", result });
      await reloadWorkspace();
    });
  }

  async function dispatchBonusLedger() {
    await saveAction("bonus-ledger-dispatch", async () => {
      assertCan(
        access.canApproveRewards,
        "Для запуска bonus ledger dispatch нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameBonusLedgerDispatchResult>(
        "/api/guests/gamification/bonus-ledger/dispatch",
        {
          dryRun: false,
          queueApprovedRewards: true,
          limit: 25,
        },
      );

      setBonusLedgerResult({ kind: "dispatch", result });
      await reloadWorkspace();
    });
  }

  async function dispatchBonusLedgerCanary(
    options: BonusLedgerActionOptions = {},
  ) {
    await saveAction("bonus-ledger-canary-dispatch", async () => {
      assertCan(
        access.canApproveRewards,
        "Для запуска canary bonus ledger dispatch нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameBonusLedgerDispatchResult>(
        "/api/guests/gamification/bonus-ledger/dispatch",
        {
          dryRun: false,
          queueApprovedRewards: false,
          canary: true,
          limit: 1,
          storeId: nullable(options.storeId ?? ""),
        },
      );

      setBonusLedgerResult({ kind: "dispatch", result });
      await reloadWorkspace();
    });
  }

  async function cancelBonusLedgerEntry(entryId: string) {
    if (
      !window.confirm(
        "Отменить ledger-запись до начисления в Langame? Связанная награда и неотправленные уведомления тоже будут отменены.",
      )
    ) {
      return;
    }

    await saveAction(`bonus-ledger-cancel-${entryId}`, async () => {
      assertCan(
        access.canApproveRewards,
        "Для отмены bonus ledger записи нужно право `Геймификация: награды`.",
      );

      const result = await postJson<GuestGameBonusLedgerDispatchItem>(
        `/api/guests/gamification/bonus-ledger/${entryId}/cancel`,
        {
          reason: "pilot_preflight_operator_cancel",
        },
      );

      setBonusLedgerResult({ kind: "cancel", result });
      await reloadWorkspace();
    });
  }

  async function updateDeliveryStatus(
    delivery: GuestGameDelivery,
    status: GuestGameDeliveryStatus,
  ) {
    await saveAction(`delivery-${delivery.id}`, async () => {
      assertCan(
        access.canApproveRewards,
        "Для изменения статуса outbox нужно право `Геймификация: награды`.",
      );

      await patchJson(`/api/guests/gamification/deliveries/${delivery.id}`, {
        status,
      });
      await reloadWorkspace();
    });
  }

  async function redeemReward() {
    await saveAction("rewardRedeem", async () => {
      assertCan(
        access.canApproveRewards,
        "Для кассирского погашения награды нужно право `Геймификация: награды`.",
      );

      const reward = await postJson<GuestGameReward>(
        "/api/guests/gamification/rewards/redeem",
        {
          claim: nullable(rewardRedeemForm.claim),
          storeId: nullable(rewardRedeemForm.storeId),
          note: nullable(rewardRedeemForm.note),
        },
      );

      setRedeemedReward(reward);
      setRewardRedeemForm((current) => ({
        ...defaultRewardRedeemForm,
        storeId: current.storeId,
      }));
      await reloadWorkspace();
    });
  }

  async function updateRuleStatus(
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) {
    await saveAction(`${type}-${id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для изменения статуса правила нужно право `Геймификация: правила`.",
      );

      await patchJson(`/api/guests/gamification/${type}/${id}`, { status });
      await reloadWorkspace();
    });
  }

  async function restartLootBox(id: string) {
    await saveAction(`loot-boxes-restart-${id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для перезапуска лутбокса нужно право `Геймификация: правила`.",
      );

      await postJson(`/api/guests/gamification/loot-boxes/${id}/restart`, {});
      await reloadWorkspace();
    });
  }

  async function saveAction(key: string, action: () => Promise<void>) {
    setSaving(key);
    setError(null);

    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Геймификация гостей
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Guest Game Hub: XP, миссии, лутбоксы и кошелек
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Здесь живет постоянная игровая экономика гостя: профиль, уровень,
              прогресс, правила, Battle Pass и награды. Разовые маркетинговые
              офферы и промо-эффект кампаний настраиваются отдельно.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {editorModeOptions.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEditorMode(mode)}
                  className={[
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    editorMode === mode
                      ? "bg-zinc-950 text-white dark:bg-cyan-300 dark:text-zinc-950"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            {access.isPlatformAdmin ? (
              <div className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                Начисления в Langame идут через bonus ledger: approved-награда
                попадает в очередь, dry-run проверяет контур, а dispatch пишет
                бонусы только при включенном backend-режиме.
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
              Здесь: игровая экономика
            </p>
            <h2 className="mt-1 font-semibold text-zinc-950 dark:text-white">
              Долгий прогресс гостя
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              XP, уровни, лутбоксы, игровые миссии, Battle Pass, кошелек
              наград, safe dry-run и batch по подготовленным snapshot-фактам.
            </p>
          </div>
          <Link
            href="/marketing/missions"
            className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500/70 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              Маркетинг
            </p>
            <h2 className="mt-1 font-semibold text-zinc-950 dark:text-white">
              Промо-сценарии кампаний
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Тихие часы, повторный визит, бар, события, аудитории, бюджеты
              и ручная очередь выдачи для измеримого промо-эффекта.
            </p>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Зарегистрировано в игре"
            value={
              workspace.summary.registeredProfilesCount ??
              workspace.summary.profilesCount
            }
          />
          <StatCard label="XP в системе" value={workspace.summary.totalXp} />
          <StatCard label="Награды к выдаче" value={workspace.summary.pendingRewards} />
          <StatCard
            label="Плановый бюджет"
            value={formatMoney(workspace.summary.plannedBudget)}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!access.canManageRules || !access.canApproveRewards ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
            Ваш доступ ограничен:{" "}
            {!access.canManageRules
              ? "редактирование правил и подтвержденные запуски недоступны"
              : "правила доступны"}
            ,{" "}
            {!access.canApproveRewards
              ? "выдача и погашение наград недоступны"
              : "награды доступны"}
            . Просмотр и безопасный dry-run остаются доступными.
          </div>
        ) : null}
      </section>

      {editorMode === "visual" ? (
        <GuestGamificationVisualEditor
          workspace={workspace}
          stores={stores}
          canManage={access.canManageRules}
          onPublished={reloadWorkspace}
          onRestartLootBox={restartLootBox}
          restartingLootBoxId={
            saving?.startsWith("loot-boxes-restart-")
              ? saving.replace("loot-boxes-restart-", "")
              : null
          }
        />
      ) : null}

      {editorMode === "advanced" ? (
        <>
      <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-zinc-950 text-white dark:bg-emerald-400 dark:text-zinc-950"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <OverviewTab
          workspace={workspace}
          pendingRewards={pendingRewards}
          onRewardStatus={updateRewardStatus}
          onEditReward={editReward}
          onOpenTab={setActiveTab}
          saving={saving}
          tenantSlug={tenantSlug}
          stores={stores}
          canApproveRewards={access.canApproveRewards}
          canManageRules={access.canManageRules}
          onPrepareOutbox={prepareDeliveryOutbox}
          onDispatchOutbox={dispatchDeliveryOutbox}
          deliveryDispatchResult={deliveryDispatchResult}
          onUpdateDeliveryStatus={updateDeliveryStatus}
          onSaveGuestLogMapping={saveGuestLogTypeMapping}
          onDeleteGuestLogMapping={deleteGuestLogTypeMapping}
          onQueueBonusLedger={queueBonusLedger}
          onDryRunBonusLedger={dryRunBonusLedgerDispatch}
          onDispatchBonusLedger={dispatchBonusLedger}
          onDispatchBonusLedgerCanary={dispatchBonusLedgerCanary}
          onCancelBonusLedgerEntry={cancelBonusLedgerEntry}
          bonusLedgerResult={bonusLedgerResult}
        />
      ) : null}

      {activeTab === "profiles" ? (
        <ProfilesTab
          form={profileForm}
          setForm={setProfileForm}
          guests={guests}
          leads={leads}
          profiles={filteredProfiles}
          query={query}
          setQuery={setQuery}
          eventForm={eventForm}
          setEventForm={setEventForm}
          editingProfileId={editingProfileId}
          onSaveProfile={saveProfile}
          onEditProfile={editProfile}
          onResetProfile={resetProfileForm}
          onSaveEvent={saveEvent}
          onProfileStatus={updateProfileStatus}
          saving={saving}
          canManage={access.canManageRules}
          canViewTechnicalPayload={access.isPlatformAdmin}
        />
      ) : null}

      {activeTab === "lootBoxes" ? (
        <LootBoxesTab
          form={lootBoxForm}
          setForm={setLootBoxForm}
          lootBoxes={workspace.lootBoxes}
          audiences={audiences}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          editingId={editingLootBoxId}
          onSave={saveLootBox}
          onEdit={editLootBox}
          onReset={resetLootBoxForm}
          onStatus={updateRuleStatus}
          onRestart={restartLootBox}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "missions" ? (
        <MissionsTab
          form={missionForm}
          setForm={setMissionForm}
          missions={workspace.missions}
          audiences={audiences}
          stores={stores}
          products={products}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          editingId={editingMissionId}
          onSave={saveMission}
          onEdit={editMission}
          onReset={resetMissionForm}
          onStatus={updateRuleStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "seasons" ? (
        <SeasonsTab
          form={seasonForm}
          setForm={setSeasonForm}
          seasons={workspace.seasons}
          audiences={audiences}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          editingId={editingSeasonId}
          onSave={saveSeason}
          onEdit={editSeason}
          onReset={resetSeasonForm}
          onStatus={updateRuleStatus}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}

      {activeTab === "rewards" ? (
        <RewardsTab
          form={rewardForm}
          setForm={setRewardForm}
          redeemForm={rewardRedeemForm}
          setRedeemForm={setRewardRedeemForm}
          redeemedReward={redeemedReward}
          rewards={workspace.rewards}
          profiles={workspace.profiles}
          guests={guests}
          stores={stores}
          lootBoxes={workspace.lootBoxes}
          missions={workspace.missions}
          seasons={workspace.seasons}
          editingId={editingRewardId}
          onSave={saveReward}
          onEdit={editReward}
          onReset={resetRewardForm}
          onStatus={updateRewardStatus}
          onRedeem={redeemReward}
          saving={saving}
          canApprove={access.canApproveRewards}
        />
      ) : null}

      {activeTab === "testRun" ? (
        <DryRunTab
          form={dryRunForm}
          setForm={setDryRunForm}
          result={dryRunResult}
          processResult={processEventResult}
          profiles={workspace.profiles}
          guests={guests}
          stores={stores}
          tariffSnapshots={workspace.tariffSnapshots}
          guestLogCatalog={workspace.guestLogCatalog}
          snapshotFacts={snapshotFacts}
          pipelineResult={pipelineResult}
          onRun={runDryRun}
          onProcess={processDryRunEvent}
          onLoadFacts={loadSnapshotFacts}
          onApplyFact={applySnapshotFact}
          onPipelineRun={runSnapshotPipeline}
          saving={saving}
          canManage={access.canManageRules}
        />
      ) : null}
        </>
      ) : null}
    </div>
  );
}

function assertCan(allowed: boolean, message: string) {
  if (!allowed) {
    throw new Error(message);
  }
}

function DryRunTab({
  form,
  setForm,
  result,
  processResult,
  profiles,
  guests,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  snapshotFacts,
  pipelineResult,
  onRun,
  onProcess,
  onLoadFacts,
  onApplyFact,
  onPipelineRun,
  saving,
  canManage,
}: {
  form: DryRunForm;
  setForm: Dispatch<SetStateAction<DryRunForm>>;
  result: GuestGameDryRunResult | null;
  processResult: GuestGameProcessEventResult | null;
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  snapshotFacts: GuestGameSnapshotFactsResult | null;
  pipelineResult: GuestGamePipelineRunResult | null;
  onRun: () => Promise<void>;
  onProcess: () => Promise<void>;
  onLoadFacts: () => Promise<void>;
  onApplyFact: (fact: GuestGameSnapshotFact) => void;
  onPipelineRun: (dryRunOnly: boolean) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const isRunning = saving === "dryRun";
  const isLoadingFacts = saving === "facts";
  const isProcessing = saving === "processEvent";
  const isPipelinePreview = saving === "pipelinePreview";
  const isPipelineRunning = saving === "pipelineRun";
  const canProcess =
    Boolean(result) &&
    Boolean(form.profileId || form.guestId || result?.profile || result?.guest) &&
    ((result?.summary.eligibleRules ?? 0) > 0 ||
      (result?.summary.projectedXpDelta ?? 0) > 0);

  function update<K extends keyof DryRunForm>(key: K, value: DryRunForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...emptyDryRunSource,
    }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Тест запуска" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Проверьте, что произойдет при событии гостя: какие лутбоксы,
              миссии и Battle Pass сработают, где есть блокировки, сколько XP и
              рублей попадет в очередь выдачи.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Награды, события и записи в Langame не создаются
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Факты Langame snapshot
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Загрузите последние сохраненные сессии, покупки, товарные продажи, логи, балансы и группы лояльности, затем выберите факт как основу проверки правил.
              </p>
            </div>
            <button
              className={smallButtonClass}
              type="button"
              disabled={isLoadingFacts}
              onClick={onLoadFacts}
            >
              {isLoadingFacts ? "Загружаем..." : "Загрузить факты"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Batch pipeline snapshot-фактов
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Обрабатывает до 20 последних сохраненных фактов: сначала проверяет правила,
                пропускает дубли и факты без гостя, затем пишет только события, XP и очередь
                наград внутри LeetPlus.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={smallButtonClass}
                type="button"
                disabled={isPipelinePreview || isPipelineRunning}
                onClick={() => onPipelineRun(true)}
              >
                {isPipelinePreview ? "Смотрим..." : "Предпросмотр batch"}
              </button>
              {canManage ? (
                <button
                  className={primaryButtonClass}
                  type="button"
                  disabled={isPipelinePreview || isPipelineRunning}
                  onClick={() => onPipelineRun(false)}
                >
                  {isPipelineRunning ? "Обрабатываем..." : "Обработать batch"}
                </button>
              ) : null}
            </div>
          </div>

          {pipelineResult ? <PipelineResultPanel result={pipelineResult} /> : null}

          {snapshotFacts ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-10">
                <MiniMetric
                  label="сессии"
                  value={snapshotFacts.summary.sessions}
                />
                <MiniMetric label="логи" value={snapshotFacts.summary.logs} />
                <MiniMetric
                  label="транзакции"
                  value={snapshotFacts.summary.transactions}
                />
                <MiniMetric
                  label="операции"
                  value={snapshotFacts.summary.operationLogs}
                />
                <MiniMetric
                  label="баланс"
                  value={snapshotFacts.summary.balances}
                />
                <MiniMetric
                  label="бонусы"
                  value={snapshotFacts.summary.bonusBalances}
                />
                <MiniMetric
                  label="группы"
                  value={snapshotFacts.summary.loyaltyGroups}
                />
                <MiniMetric
                  label="товары"
                  value={snapshotFacts.summary.productExpenses}
                />
                <MiniMetric
                  label="рефералы"
                  value={snapshotFacts.summary.referrals}
                />
                <MiniMetric
                  label="последний факт"
                  value={formatDate(snapshotFacts.summary.latestAt)}
                />
              </div>
              {snapshotFacts.facts.length ? (
                <div className="max-h-72 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                  {snapshotFacts.facts.map((fact) => (
                    <SnapshotFactRow
                      key={fact.id}
                      fact={fact}
                      onApply={onApplyFact}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="Snapshot-фактов пока нет. Запустите синхронизацию гостевых данных на странице синхронизации." />
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Профиль гостя
            <select
              className={fieldClass}
              value={form.profileId}
              onChange={(event) => {
                update("profileId", event.target.value);
                update("guestId", "");
              }}
            >
              <option value="">Не выбран</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} · ур. {profile.level}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Гость Langame
            <select
              className={fieldClass}
              value={form.guestId}
              onChange={(event) => {
                update("guestId", event.target.value);
                update("profileId", "");
              }}
            >
              <option value="">Не выбран</option>
              {guests.slice(0, 150).map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName} · {guest.contact}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Клуб
            <select
              className={fieldClass}
              value={form.storeId}
              onChange={(event) => update("storeId", event.target.value)}
            >
              <option value="">Вся сеть / не выбран</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Событие
            <select
              className={fieldClass}
              value={form.eventType}
              onChange={(event) => update("eventType", event.target.value)}
            >
              {dryRunEventOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Дата и время
            <input
              className={fieldClass}
              type="datetime-local"
              value={form.occurredAt}
              onChange={(event) => update("occurredAt", event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Тип guests/logs
            <input
              className={fieldClass}
              list="guest-log-type-options"
              placeholder="visit, login, tournament"
              value={form.guestLogType}
              onChange={(event) => update("guestLogType", event.target.value)}
            />
            <datalist id="guest-log-type-options">
              {guestLogCatalog.items.map((item) => (
                <option key={item.normalizedType} value={item.type} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Тип сессии
              <select
                className={fieldClass}
                value={form.sessionType}
                onChange={(event) => update("sessionType", event.target.value)}
              >
                {sessionTypeOptions.map((option) => (
                  <option key={option.value || "any"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Пакет часов
              <select
                className={fieldClass}
                value={form.sessionPacket}
                onChange={(event) => update("sessionPacket", event.target.value)}
              >
                {dryRunPacketOptions.map((option) => (
                  <option key={option.value || "unknown"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lg:col-span-3">
            <TariffConditionFields
              snapshots={tariffSnapshots}
              tariffGroupId={form.tariffGroupId}
              tariffPeriodId={form.tariffPeriodId}
              tariffTypeId={form.tariffTypeId}
              onChange={(patch) =>
                setForm((current) => ({
                  ...current,
                  ...patch,
                  ...emptyDryRunSource,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Минуты сессии
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.sessionMinutes}
                onChange={(event) => update("sessionMinutes", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Покупка, руб
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.spendAmount}
                onChange={(event) => update("spendAmount", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Название товара
              <input
                className={fieldClass}
                placeholder="Например: энергетик"
                value={form.productName}
                onChange={(event) => update("productName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Категория товара
              <input
                className={fieldClass}
                placeholder="Бар, напитки"
                value={form.categoryName}
                onChange={(event) => update("categoryName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              ID товара
              <input
                className={fieldClass}
                placeholder="productId"
                value={form.productId}
                onChange={(event) => update("productId", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Внешний ID товара
              <input
                className={fieldClass}
                placeholder="Langame id"
                value={form.externalProductId}
                onChange={(event) =>
                  update("externalProductId", event.target.value)
                }
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              ID категории
              <input
                className={fieldClass}
                placeholder="categoryId"
                value={form.categoryId}
                onChange={(event) => update("categoryId", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Поставщик
              <input
                className={fieldClass}
                placeholder="supplier"
                value={form.supplierName}
                onChange={(event) => update("supplierName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Количество
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.quantity}
                onChange={(event) => update("quantity", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className={primaryButtonClass}
            type="button"
            disabled={isRunning}
            onClick={onRun}
          >
            {isRunning ? "Проверяем..." : "Проверить сценарий"}
          </button>
          {canManage ? (
            <button
              className={smallButtonClass}
              type="button"
              disabled={!canProcess || isProcessing}
              onClick={onProcess}
            >
              {isProcessing
                ? "Записываем..."
                : "Создать событие и награды"}
            </button>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Если дата не задана, API проверит сценарий на текущий момент.
          </p>
        </div>

        {form.sourceFactId ? (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Выбран snapshot-факт: {form.sourceFactKind} ·{" "}
            {form.externalDomain || "без домена"} ·{" "}
            {form.externalId || form.sourceFactId}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionTitle title="Результат проверки" />
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {result.profile?.displayName ??
                  result.guest?.displayName ??
                  "Гость не выбран"}{" "}
                · {result.store?.name ?? "вся сеть"} · {result.eventType}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {new Date(result.occurredAt).toLocaleString("ru-RU")}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <StatusMetric
              label="Проверено"
              value={result.summary.checkedRules}
              hint="правил"
            />
            <StatusMetric
              label="Сработает"
              value={result.summary.eligibleRules}
              hint="без блокировок"
            />
            <StatusMetric
              label="Блок"
              value={result.summary.blockedRules}
              hint="нужны правки"
            />
            <StatusMetric
              label="XP"
              value={`+${result.summary.projectedXpDelta}`}
              hint={`${result.input.sessionMinutes} мин`}
            />
            <StatusMetric
              label="Сессия"
              value={sessionTypeLabel(result.input.sessionType)}
              hint={packetStateLabel(result.input.sessionPacket)}
            />
            <StatusMetric
              label="Награды"
              value={formatMoney(result.summary.estimatedRewardAmount)}
              hint={`${result.input.spendAmount} руб чек`}
            />
          </div>

          {canManage ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  Подтвержденный запуск в LeetPlus
                </p>
                <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
                  API заново пересчитает сценарий, создаст событие, начислит XP
                  и положит награды в очередь. Записи в Langame нет.
                </p>
              </div>
              <button
                className={primaryButtonClass}
                type="button"
                disabled={!canProcess || isProcessing}
                onClick={onProcess}
              >
                {isProcessing ? "Запускаем..." : "Записать в LeetPlus"}
              </button>
            </div>
            {!canProcess ? (
              <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">
                Для записи нужен гость и хотя бы одно сработавшее правило или
                XP.
              </p>
            ) : null}
          </div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              У вас read-only доступ: сценарий можно проверять и разбирать, но
              запись события, начисление XP и постановка наград в очередь
              недоступны.
            </div>
          )}

          {processResult ? (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
              <div className="grid gap-3 md:grid-cols-5">
                <StatusMetric
                  label="статус"
                  value={
                    processResult.summary.idempotent ? "повтор" : "записано"
                  }
                  hint={
                    processResult.summary.idempotent
                      ? "без новых записей"
                      : "создано в LeetPlus"
                  }
                />
                <StatusMetric
                  label="событие"
                  value={processResult.event.eventType}
                  hint={formatDate(processResult.event.occurredAt)}
                />
                <StatusMetric
                  label="XP применено"
                  value={`+${processResult.summary.appliedXpDelta}`}
                  hint={
                    processResult.summary.idempotent
                      ? "без повторного XP"
                      : processResult.summary.profileCreated
                      ? "профиль создан"
                      : "профиль обновлен"
                  }
                />
                <StatusMetric
                  label="наград в очереди"
                  value={processResult.summary.createdRewards}
                  hint={
                    processResult.summary.idempotent
                      ? "без дублей"
                      : formatMoney(processResult.summary.queuedRewardAmount)
                  }
                />
                <StatusMetric
                  label="Langame"
                  value="нет"
                  hint="write API не использовался"
                />
              </div>
              {processResult.summary.idempotent ? (
                <p className="mt-3 rounded-md border border-cyan-200 bg-white/70 px-3 py-2 text-xs font-semibold text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
                  Snapshot уже был обработан: LeetPlus вернул существующее
                  событие и не создавал повторный XP или награды.
                </p>
              ) : null}
              {processResult.summary.idempotencyKey ? (
                <p className="mt-3 break-all text-xs text-cyan-800 dark:text-cyan-100">
                  Idempotency: {processResult.summary.idempotencyKey}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            {result.rules.length ? (
              result.rules.map((rule) => (
                <DryRunRuleCard key={`${rule.kind}-${rule.id}`} rule={rule} />
              ))
            ) : (
              <EmptyState text="Правил для проверки пока нет" />
            )}
          </div>
        </section>
      ) : (
        <EmptyState text="Запустите проверку, чтобы увидеть допуск, награды, XP и причины блокировки." />
      )}
    </div>
  );
}

function PipelineResultPanel({ result }: { result: GuestGamePipelineRunResult }) {
  const modeLabel = result.dryRunOnly ? "предпросмотр" : "запуск";
  const statusLabel: Record<string, string> = {
    DRY_RUN: "проверено",
    PROCESSED: "обработано",
    SKIPPED: "пропуск",
    DUPLICATE: "дубль",
    ERROR: "ошибка",
  };
  const statusClass: Record<string, string> = {
    DRY_RUN:
      "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    PROCESSED:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    SKIPPED:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
    DUPLICATE:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-cyan-950 dark:text-cyan-100">
            Batch pipeline: {modeLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-900/75 dark:text-cyan-100/75">
            {result.note}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:text-cyan-200">
          Langame write: нет
        </span>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        <MiniMetric label="доступно" value={result.availableFacts} />
        <MiniMetric label="проверено" value={result.checkedFacts} />
        <MiniMetric label="обработано" value={result.processedFacts} />
        <MiniMetric label="пропуск" value={result.skippedFacts} />
        <MiniMetric label="дубли" value={result.duplicateFacts} />
        <MiniMetric label="ошибки" value={result.erroredFacts} />
        <MiniMetric label="XP" value={`+${result.appliedXpDelta}`} />
        <MiniMetric label="награды" value={result.queuedRewards} />
      </div>

      {result.facts.length ? (
        <div className="divide-y divide-cyan-200/70 overflow-hidden rounded-lg border border-cyan-200/70 bg-white dark:divide-cyan-900/60 dark:border-cyan-900/60 dark:bg-zinc-950">
          {result.facts.slice(0, 8).map((fact) => {
            const idempotentProcess = fact.process?.summary.idempotent === true;
            const idempotencyKey = fact.process?.summary.idempotencyKey;

            return (
              <div
                key={`${fact.factId}-${fact.status}`}
                className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-zinc-950 dark:text-white">
                    {fact.label}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDate(fact.occurredAt)} ·{" "}
                    {fact.store?.name ?? "вся сеть"} · {fact.eventType}
                  </p>
                  {fact.reason ? (
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {fact.reason}
                    </p>
                  ) : null}
                  {idempotentProcess ? (
                    <p className="mt-1 text-amber-700 dark:text-amber-200">
                      Повтор обработан безопасно: новых XP и наград нет.
                    </p>
                  ) : null}
                  {idempotentProcess && idempotencyKey ? (
                    <p className="mt-1 break-all text-[11px] text-amber-700/80 dark:text-amber-200/80">
                      Idempotency: {idempotencyKey}
                    </p>
                  ) : null}
                </div>
                <span
                  className={[
                    "self-start rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                    statusClass[fact.status],
                  ].join(" ")}
                >
                  {statusLabel[fact.status] ?? fact.status}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text="Подходящих snapshot-фактов для batch пока нет." />
      )}
    </div>
  );
}

function SnapshotFactRow({
  fact,
  onApply,
}: {
  fact: GuestGameSnapshotFact;
  onApply: (fact: GuestGameSnapshotFact) => void;
}) {
  const sourceLabel: Record<GuestGameSnapshotFact["source"], string> = {
    GUEST_SESSION: "сессия",
    GUEST_LOG: "лог",
    GUEST_TRANSACTION: "транзакция",
    GUEST_OPERATION_LOG: "операция",
    GUEST_BALANCE: "баланс",
    GUEST_BONUS_BALANCE: "бонусы",
    GUEST_LOYALTY_GROUP: "группа",
    PRODUCT_EXPENSE: "товары",
    GUEST_GAME_REFERRAL: "реферал",
  };
  const eventLabel =
    dryRunEventOptions.find((option) => option.value === fact.eventType)
      ?.label ?? fact.eventType;

  return (
    <button
      className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-emerald-50/70 focus:bg-emerald-50/70 focus:outline-none dark:hover:bg-emerald-950/20 dark:focus:bg-emerald-950/20 md:grid-cols-[1fr_auto]"
      type="button"
      onClick={() => onApply(fact)}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-zinc-950 dark:text-white">
            {fact.label}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {sourceLabel[fact.source]}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            {eventLabel}
          </span>
        </span>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(fact.occurredAt)} · {fact.store?.name ?? "вся сеть"} ·{" "}
          {fact.guest?.contact ?? "гость не привязан"}
        </span>
        {fact.details ? (
          <span className="mt-1 block truncate text-xs text-zinc-400">
            {fact.details}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2 md:justify-end">
        {fact.sessionMinutes != null ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {fact.sessionMinutes} мин
          </span>
        ) : null}
        {fact.sessionPacket != null || fact.sessionType ? (
          <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
            {fact.sessionPacket == null
              ? sessionTypeLabel(fact.sessionType)
              : packetStateLabel(fact.sessionPacket)}
          </span>
        ) : null}
        {fact.guestLogType ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            logs: {fact.guestLogType}
          </span>
        ) : null}
        {fact.spendAmount != null && fact.spendAmount > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {formatMoney(fact.spendAmount)}
          </span>
        ) : null}
        <span className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
          Взять в тест
        </span>
      </span>
    </button>
  );
}

function DryRunRuleCard({ rule }: { rule: GuestGameDryRunResult["rules"][number] }) {
  const kindLabel =
    rule.kind === "LOOT_BOX"
      ? "Лутбокс"
      : rule.kind === "MISSION"
        ? "Миссия"
        : "Battle Pass";

  return (
    <article
      className={[
        "rounded-lg border p-4 transition",
        rule.eligible
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {kindLabel}
          </p>
          <h3 className="mt-1 text-base font-bold text-zinc-950 dark:text-white">
            {rule.name}
          </h3>
        </div>
        <span
          className={[
            "rounded-full px-2 py-1 text-xs font-bold",
            rule.eligible
              ? "bg-emerald-500 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
          ].join(" ")}
        >
          {rule.eligible ? "сработает" : "блок"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3 dark:text-zinc-300">
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Награда
          </span>
          {rule.selectedRewardLabel ?? rule.rewardLabel ?? "не задана"}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Сумма
          </span>
          {formatMoney(rule.rewardAmount ?? 0)}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            XP
          </span>
          +{rule.xpDelta}
        </div>
      </div>

      {rule.progress?.applicable ? (
        <div className="mt-3 rounded-md border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/20">
          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-cyan-800 dark:text-cyan-100">
            <span>Прогресс</span>
            <span>
              {rule.progress.current}/{rule.progress.target}
              {rule.progress.unit ? ` ${rule.progress.unit}` : ""}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-zinc-900">
            <div
              className="h-full rounded-full bg-cyan-500"
              style={{ width: `${rule.progress.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-cyan-900/70 dark:text-cyan-100/70">
            Событий учтено: {rule.progress.matchedEvents}
            {rule.progress.windowDays
              ? ` за ${rule.progress.windowDays} дн.`
              : ""}
          </p>
        </div>
      ) : null}

      {rule.blockers.length ? (
        <div className="mt-3 space-y-1">
          {rule.blockers.map((blocker) => (
            <p
              key={blocker}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            >
              {blocker}
            </p>
          ))}
        </div>
      ) : null}

      {rule.reasons.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {rule.reasons.slice(0, 6).map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
            >
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function OverviewTab({
  workspace,
  pendingRewards,
  onRewardStatus,
  onEditReward,
  onOpenTab,
  saving,
  tenantSlug,
  stores,
  canApproveRewards,
  canManageRules,
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
  canManageRules: boolean;
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
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Старт игрового контура" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Соберите экономику от профиля гостя до ручной выдачи награды. Каждый
              блок можно настроить отдельно, а затем связать в единый сценарий.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Safe-mode: bonus ledger с dry-run
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            title="Лутбокс"
            text="Настроить открытие при старте сессии, клубы, лимиты и призы."
            metric={`${workspace.summary.activeLootBoxes} активных`}
            action="Настроить"
            onClick={() => onOpenTab("lootBoxes")}
          />
          <ScenarioStepCard
            step="3"
            title="Миссии"
            text="Задать квесты по визитам, часам, бару или реактивации."
            metric={`${workspace.summary.activeMissions} активных`}
            action="Собрать"
            onClick={() => onOpenTab("missions")}
          />
          <ScenarioStepCard
            step="4"
            title="Battle Pass"
            text="Создать сезон, уровни, free/premium дорожки и XP-правила."
            metric={`${workspace.summary.activeSeasons} сезонов`}
            action="Открыть"
            onClick={() => onOpenTab("seasons")}
          />
          <ScenarioStepCard
            step="5"
            title="Выдача"
            text="Проверить очередь, согласовать награду и закрыть статус."
            metric={`${workspace.summary.pendingRewards} к выдаче`}
            action="К кошельку"
            onClick={() => onOpenTab("rewards")}
          />
        </div>
      </section>

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
      <EffectControlCard effect={workspace.effect} />
      <IntegrationReadinessCard readiness={workspace.integrationReadiness} />
      <PilotReadinessCard
        readiness={workspace.pilotReadiness}
        saving={saving}
        canApproveRewards={canApproveRewards}
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
        canApproveRewards={canApproveRewards}
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

      <PortalLinksCard tenantSlug={tenantSlug} stores={stores} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-3">
          <SectionTitle title="Активные контуры" />
          <div className="grid gap-3 md:grid-cols-3">
            <StatusMetric
              label="Лутбоксы"
              value={workspace.summary.activeLootBoxes}
              hint={`${workspace.lootBoxes.length} всего`}
            />
            <StatusMetric
              label="Миссии"
              value={workspace.summary.activeMissions}
              hint={`${workspace.missions.length} всего`}
            />
            <StatusMetric
              label="Сезоны"
              value={workspace.summary.activeSeasons}
              hint={`${workspace.seasons.length} всего`}
            />
          </div>

          <SectionTitle title="Последние события" />
          <div className="space-y-2">
            {workspace.events.length ? (
              workspace.events.slice(0, 8).map((event) => (
                <EventRow key={event.id} event={event} />
              ))
            ) : (
              <EmptyState text="Событий пока нет" />
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Очередь выдач" />
          <div className="space-y-2">
            {pendingRewards.length ? (
              pendingRewards.slice(0, 8).map((reward) => (
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
    </div>
  );
}

function IntegrationReadinessCard({
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

function PilotReadinessCard({
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
            Чек-лист собирает путь от входа в игровой модуль до /play/game,
            события, кошелька наград, bonus ledger и последующей сверки баланса
            Langame. Проверка строится по сохраненным данным LeetPlus и не
            делает live-запросов.
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
        <MiniMetric
          label="Частично"
          value={readiness.summary.partial}
        />
        <MiniMetric
          label="Блокеры"
          value={readiness.summary.blocked}
        />
        <MiniMetric
          label="Ручной режим"
          value={readiness.summary.manualOnly}
        />
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
                  const cancelSaving = saving === `bonus-ledger-cancel-${item.id}`;
                  const cancelDisabled =
                    !canCancelPreview || !canApproveRewards || saving !== null;
                  const cancelTitle = !canCancelPreview
                    ? "Эту ledger-запись уже нельзя отменить из preflight."
                    : !canApproveRewards
                      ? "Для отмены ledger-записи нужно право `Геймификация: награды`."
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
                const disabledByPilotStore = requiresRewardAccess && !target?.id;
                const disabled =
                  !action.enabled ||
                  disabledByAccess ||
                  disabledBySaving ||
                  disabledByPilotStore;
                const disabledReason = !action.enabled
                  ? action.disabledReason
                  : disabledByAccess
                    ? "Для ledger-действий нужно право `Геймификация: награды`."
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

function PilotNextActionLink({
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

function PilotGate({ label, enabled }: { label: string; enabled: boolean }) {
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

function pilotRunbookActionRequiresRewardAccess(
  key: GuestGamePilotRunbookAction["key"],
) {
  return (
    key === "QUEUE_BONUS_LEDGER" ||
    key === "DRY_RUN_BONUS_LEDGER" ||
    key === "DISPATCH_BONUS_LEDGER"
  );
}

function pilotRunbookActionLabel(
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

function BonusLedgerAuditCard({
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
    audit.items.find(
      (item) => item.reconciliation.state === "MISMATCH",
    ) ??
    audit.items.find((item) => item.status === "FAILED") ??
    audit.items.find(
      (item) => item.reconciliation.state === "WAITING_SYNC",
    ) ??
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
          <span className="font-bold">Управление начислениями:</span>{" "}
          approved bonus-награды сначала попадают в ledger, затем dry-run проверяет
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
          Для управления ledger нужно право `Геймификация: награды`; журнал и
          сверка доступны только на просмотр.
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

function BonusBalanceCurrentReconciliationCard({
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
    .sort((left, right) => statePriority[left.state] - statePriority[right.state])
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

function BonusLedgerActionResultCard({
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

function EconomyControlCard({
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
          <EmptyState text="Экономика появится после создания лутбокса, миссии, Battle Pass или награды." />
        )}
      </div>
    </section>
  );
}

function EffectControlCard({
  effect,
}: {
  effect: GuestGamificationWorkspace["effect"];
}) {
  const visibleScenarios = effect.scenarios.slice(0, 6);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            Эффект сценариев
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Что произошло после игровых событий
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            LeetPlus смотрит {effect.windowDays} дней после XP, лутбокса,
            миссии или Battle Pass: вернулся ли гость, были ли сессии,
            продажи бара/товаров и пополнения баланса. Расчет идет только по
            сохраненным snapshot-фактам.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {effect.summary.measuredEvents
            ? `${effect.summary.measuredEvents} событий измеряется`
            : "Пока нет событий с сопоставленным гостем"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="возврат гостей"
          value={
            effect.summary.returnRatePercent === null
              ? "нет данных"
              : formatPercent(effect.summary.returnRatePercent)
          }
        />
        <MiniMetric
          label="сессии после события"
          value={`${effect.summary.postSessions} · ${formatMinutes(
            effect.summary.postPlayMinutes,
          )}`}
        />
        <MiniMetric
          label="бар/товары"
          value={formatMoney(effect.summary.productRevenue)}
        />
        <MiniMetric
          label="пополнения"
          value={formatMoney(effect.summary.balanceTopUps)}
        />
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
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold uppercase text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
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
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-4 lg:min-w-[560px]">
                  <MiniMetric
                    label="возврат"
                    value={
                      scenario.returnRatePercent === null
                        ? "нет"
                        : formatPercent(scenario.returnRatePercent)
                    }
                  />
                  <MiniMetric
                    label="гости"
                    value={`${scenario.returnedGuests}/${scenario.reachedGuests}`}
                  />
                  <MiniMetric
                    label="сессии"
                    value={`${scenario.postSessions} · ${formatMinutes(
                      scenario.postPlayMinutes,
                    )}`}
                  />
                  <MiniMetric
                    label="эффект"
                    value={formatMoney(scenario.totalRevenue)}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Эффект появится после игровых событий с сопоставленными гостями и последующих сессий, продаж или пополнений." />
        )}
      </div>
    </section>
  );
}

function CommunicationQueueCard({
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
          <button className={smallButtonClass} type="button" onClick={onOpenRewards}>
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
            {saving === "deliveries-prepare" ? "Готовим..." : "Подготовить outbox"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric
          label="готово к боту"
          value={queue.summary.readyForBot}
        />
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
          <Link className={smallButtonClass} href="/api/guests/gamification/deliveries/export">
            CSV
          </Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <MiniMetric label="готово" value={outbox.summary.ready} />
          <MiniMetric label="нужно действие" value={outbox.summary.blocked} />
          <MiniMetric label="выдано" value={outbox.summary.sent} />
          <MiniMetric label="Telegram/MAX" value={outbox.summary.telegram + outbox.summary.max} />
          <MiniMetric label="кассир/ручной" value={outbox.summary.cashier + outbox.summary.manual} />
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-cyan-200 bg-cyan-100/60 p-3 text-xs leading-5 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
            <p className="font-bold uppercase tracking-wide">Dispatcher</p>
            <p className="mt-1 text-sm font-semibold">{outbox.dispatcher.modeLabel}</p>
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
              Готово: {botConsumer.pendingReady} · Telegram {botConsumer.pendingTelegram} · MAX{" "}
              {botConsumer.pendingMax}
            </p>
            <p className="mt-1">
              Ack: {botConsumer.sentAck} sent / {botConsumer.failedAck} failed /{" "}
              {botConsumer.blockedAck} blocked
              {botConsumer.lastAckAt ? ` · ${formatDate(botConsumer.lastAckAt)}` : ""}
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
              <MiniMetric label="проверено" value={deliveryDispatchResult.checked} />
              <MiniMetric label="dry/skip" value={deliveryDispatchResult.skipped} />
              <MiniMetric label="отправлено" value={deliveryDispatchResult.sent} />
              <MiniMetric label="заблокировано" value={deliveryDispatchResult.blocked} />
              <MiniMetric label="ошибки" value={deliveryDispatchResult.failed} />
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
                <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-3 lg:min-w-[460px]">
                  <MiniMetric label="сумма" value={formatMoney(item.rewardAmount)} />
                  <MiniMetric
                    label="контакт"
                    value={item.contactMasked ?? "нет"}
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

function ScenarioStepCard({
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
    <div className="flex min-h-56 flex-col rounded-lg border border-zinc-200 bg-zinc-50 p-4 transition hover:border-emerald-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {step}
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          {metric}
        </span>
      </div>
      <h3 className="mt-4 text-base font-bold text-zinc-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {text}
      </p>
      <button type="button" className={`${smallButtonClass} mt-4`} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function SafetyNoteCard({
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

function TariffSnapshotReadinessCard({
  snapshots,
  onOpenRules,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
  onOpenRules?: () => void;
}) {
  const readyCount = snapshots.filter((snapshot) => snapshot.status === "READY")
    .length;
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
            snapshot этих справочников в правилах лутбоксов, миссий и battle
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
                  {snapshot.readySources}/{snapshot.totalSources || snapshot.sources.length}
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
                        {item.label ?? item.name ?? item.externalId ?? "Строка тарифа"}
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

function tariffSnapshotSyncHref(endpointKey: string) {
  return `/sync?endpoint=${encodeURIComponent(endpointKey)}#endpoint-profile-diagnostics`;
}

function GuestLogCatalogCard({
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
            подсказки в правилах лутбоксов, миссий и Battle Pass. Открытие
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

function PortalLinksCard({
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
            По этим ссылкам гости проходят OTP-вход и видят свой уровень
            лояльности Langame, XP, миссии, лутбоксы, battle pass и кошелек
            наград без доступа к внутренним разделам LeetPlus. Ссылки
            используют публичный slug клуба, старые URL с внутренним ID
            продолжают работать.
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
                    Slug еще не задан, используется технический ID.
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

function ProfilesTab({
  form,
  setForm,
  guests,
  leads,
  profiles,
  query,
  setQuery,
  eventForm,
  setEventForm,
  editingProfileId,
  onSaveProfile,
  onEditProfile,
  onResetProfile,
  onSaveEvent,
  onProfileStatus,
  saving,
  canManage,
  canViewTechnicalPayload,
}: {
  form: ProfileForm;
  setForm: (form: ProfileForm) => void;
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  profiles: GuestGameProfile[];
  query: string;
  setQuery: (value: string) => void;
  eventForm: EventForm;
  setEventForm: (form: EventForm) => void;
  editingProfileId: string | null;
  onSaveProfile: () => Promise<void>;
  onEditProfile: (profile: GuestGameProfile) => void;
  onResetProfile: () => void;
  onSaveEvent: () => Promise<void>;
  onProfileStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
  canViewTechnicalPayload: boolean;
}) {
  const selectedManualEvent = manualXpEventOption(eventForm.eventType);

  return (
    <div
      className={
        canManage
          ? "grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? (
      <section className="space-y-4">
        <Panel
          title={
            editingProfileId
              ? "Редактирование игрового профиля"
              : "Новый игровой профиль"
          }
        >
          <div className="space-y-3">
            <Field label="Гость из Langame">
              <select
                className={fieldClass}
                value={form.guestId}
                onChange={(event) =>
                  setForm({ ...form, guestId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.displayName} · {guest.contact}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="CRM-лид">
              <select
                className={fieldClass}
                value={form.leadId}
                onChange={(event) =>
                  setForm({ ...form, leadId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.displayName} · {lead.phone}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Имя на витрине">
                <input
                  className={fieldClass}
                  value={form.displayName}
                  onChange={(event) =>
                    setForm({ ...form, displayName: event.target.value })
                  }
                />
              </Field>
              <Field label="Контакт">
                <input
                  className={fieldClass}
                  value={form.contactMasked}
                  onChange={(event) =>
                    setForm({ ...form, contactMasked: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Telegram ID">
                <input
                  className={fieldClass}
                  value={form.telegramIdentity}
                  onChange={(event) =>
                    setForm({ ...form, telegramIdentity: event.target.value })
                  }
                />
              </Field>
              <Field label="MAX ID">
                <input
                  className={fieldClass}
                  value={form.maxIdentity}
                  onChange={(event) =>
                    setForm({ ...form, maxIdentity: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="XP">
                <input
                  className={fieldClass}
                  type="number"
                  value={form.xp}
                  onChange={(event) =>
                    setForm({ ...form, xp: event.target.value })
                  }
                />
              </Field>
              <Field label="Уровень">
                <input
                  className={fieldClass}
                  type="number"
                  value={form.level}
                  onChange={(event) =>
                    setForm({ ...form, level: event.target.value })
                  }
                />
              </Field>
              <Field label="Статус">
                <select
                  className={fieldClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as GuestGameProfileStatus,
                    })
                  }
                >
                  {profileStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {profileStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "profile"}
              onClick={onSaveProfile}
            >
              {editingProfileId ? "Изменить профиль" : "Создать профиль"}
            </button>
            {editingProfileId ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={onResetProfile}
              >
                Сбросить выбор
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel title="Ручное XP-событие">
          <div className="space-y-3">
            <Field label="Профиль">
              <select
                className={fieldClass}
                value={eventForm.profileId}
                onChange={(event) =>
                  setEventForm({ ...eventForm, profileId: event.target.value })
                }
              >
                <option value="">Не выбран</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName} · L{profile.level} · {profile.xp} XP
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Событие">
                <select
                  className={fieldClass}
                  value={eventForm.eventType}
                  onChange={(event) => {
                    const option = manualXpEventOption(event.target.value);

                    setEventForm({
                      ...eventForm,
                      eventType: option.value,
                      xpDelta: option.defaultXpDelta,
                      payloadText: manualXpPayloadText(option.value),
                    });
                  }}
                >
                  {manualXpEventOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <OptionHelp>{selectedManualEvent.description}</OptionHelp>
              </Field>
              <Field label="Изменение XP">
                <input
                  className={fieldClass}
                  type="number"
                  value={eventForm.xpDelta}
                  onChange={(event) =>
                    setEventForm({ ...eventForm, xpDelta: event.target.value })
                  }
                />
                <OptionHelp>
                  Можно указать положительное или отрицательное значение.
                </OptionHelp>
              </Field>
            </div>
            <Field label="Комментарий">
              <input
                className={fieldClass}
                value={eventForm.note}
                onChange={(event) =>
                  setEventForm({ ...eventForm, note: event.target.value })
                }
              />
            </Field>
            {canViewTechnicalPayload ? (
              <Field label="Технический payload JSON">
                <textarea
                  className={`${fieldClass} min-h-28 font-mono text-xs`}
                  value={eventForm.payloadText}
                  onChange={(event) =>
                    setEventForm({
                      ...eventForm,
                      payloadText: event.target.value,
                    })
                  }
                />
                <OptionHelp>
                  Видно только платформенным администраторам. Для сотрудников
                  клубов payload формируется автоматически.
                </OptionHelp>
              </Field>
            ) : null}
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "event"}
              onClick={onSaveEvent}
            >
              Записать событие
            </button>
          </div>
        </Panel>
      </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle title="Игровые профили" />
          <input
            className={`${fieldClass} sm:max-w-xs`}
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {profiles.length ? (
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEdit={onEditProfile}
                onStatus={onProfileStatus}
                saving={saving}
                canManage={canManage}
              />
            ))
          ) : (
            <EmptyState text="Профили не найдены" />
          )}
        </div>
      </section>
    </div>
  );
}

function LootBoxesTab({
  form,
  setForm,
  lootBoxes,
  audiences,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  onRestart,
  saving,
  canManage,
}: {
  form: LootBoxForm;
  setForm: (form: LootBoxForm) => void;
  lootBoxes: GuestGameLootBox[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (lootBox: GuestGameLootBox) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <RulesLayout
      canManage={canManage}
      formTitle={
        editingId ? "Редактирование лутбокса" : "Настройка лутбокса"
      }
      form={
        <div className="space-y-4">
          <RuleCommonFields
            status={form.status}
            name={form.name}
            rewardType={form.rewardType}
            rewardAmount={form.rewardAmount}
            rewardLabel={form.rewardLabel}
            audienceId={form.audienceId}
            budgetAmount={form.budgetAmount}
            manualApprovalRequired={form.manualApprovalRequired}
            note={form.note}
            audiences={audiences}
            hideRewardFields
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <FormSection
            title="Кому и когда открывать"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Событие для появления">
                <OptionSelect
                  options={lootBoxTriggerOptions}
                  value={form.triggerKind}
                  preservedLabel="Сохраненное событие"
                  onChange={(triggerKind) =>
                    setForm({ ...form, triggerKind })
                  }
                />
                <OptionHelp>
                  {triggerHelpText[form.triggerKind] ??
                    "LeetPlus проверит правило, когда получит событие этого типа."}
                </OptionHelp>
              </Field>
              <Field label="Аудитория">
                <OptionSelect
                  options={lootBoxSegmentOptions}
                  value={form.segment}
                  preservedLabel="Сохраненная аудитория"
                  onChange={(segment) => setForm({ ...form, segment })}
                />
                <OptionHelp>
                  {audienceHelpText[form.segment] ??
                    "Аудитория ограничивает, каким гостям доступно правило."}
                </OptionHelp>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Тип сессии">
                <select
                  className={fieldClass}
                  value={form.sessionType}
                  onChange={(event) =>
                    setForm({ ...form, sessionType: event.target.value })
                  }
                >
                  {sessionTypeOptions.map((option) => (
                    <option key={option.value || "any"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Пакет часов">
                <select
                  className={fieldClass}
                  value={form.packetMode}
                  onChange={(event) =>
                    setForm({ ...form, packetMode: event.target.value })
                  }
                >
                  {packetModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <StoreSelect
              stores={stores}
              value={form.storeIds}
              onChange={(storeIds) => setForm({ ...form, storeIds })}
            />
          </FormSection>
          <LootBoxBusinessRules
            form={form}
            tariffSnapshots={tariffSnapshots}
            guestLogCatalog={guestLogCatalog}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className={`${primaryButtonClass} sm:min-w-44`}
              disabled={saving === "lootBox"}
              onClick={onSave}
            >
              {editingId ? "Сохранить" : "Создать лутбокс"}
            </button>
            {editingId ? (
              <button type="button" className={smallButtonClass} onClick={onReset}>
                Сбросить выбор
              </button>
            ) : null}
          </div>
        </div>
      }
      listTitle="Созданные правила лутбоксов"
      items={lootBoxes}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          title={item.name}
          status={item.status}
          subtitle={`Появляется: ${optionLabel(
            lootBoxTriggerOptions,
            item.triggerKind,
          )} · Награда: ${
            item.rewardLabel ?? rewardTypeLabelFromValue(item.rewardType)
          }`}
          meta={[
            item.audience?.name ?? "все гости",
            optionLabel(lootBoxSegmentOptions, item.segment ?? ""),
            packetModeLabel(stringRule(item.periodRules, "packetMode", "ANY")),
            tariffRuleSummary(item.periodRules),
            guestLogRuleSummary(item.periodRules),
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("loot-boxes", item.id, status)}
          saving={saving === `loot-boxes-${item.id}`}
          onRestart={() => onRestart(item.id)}
          restartSaving={saving === `loot-boxes-restart-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function MissionsTab({
  form,
  setForm,
  missions,
  audiences,
  stores,
  products,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  products: Product[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (mission: GuestGameMission) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const missionTemplates = missions.filter((mission) => mission.id !== editingId);

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={editingId ? "Редактирование миссии" : "Конструктор миссии"}
      form={
        <div className="space-y-3">
          <RuleCommonFields
            status={form.status}
            name={form.name}
            rewardType={form.rewardType}
            rewardAmount={form.rewardAmount}
            rewardLabel={form.rewardLabel}
            audienceId={form.audienceId}
            budgetAmount={form.budgetAmount}
            manualApprovalRequired={form.manualApprovalRequired}
            note={form.note}
            audiences={audiences}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип миссии">
              <OptionSelect
                options={missionTypeOptions}
                value={form.missionType}
                preservedLabel="Сохраненный тип"
                onChange={(missionType) => setForm({ ...form, missionType })}
              />
              <OptionHelp>
                {missionTypeHelpText[form.missionType] ??
                  "Тип помогает сотруднику понять сценарий квеста. Условия выполнения задаются ниже."}
              </OptionHelp>
            </Field>
            <Field label="Событие для появления">
              <OptionSelect
                options={dryRunEventOptions}
                value={form.triggerKind}
                preservedLabel="Сохраненное событие"
                onChange={(triggerKind) =>
                  setForm({ ...form, triggerKind })
                }
              />
              <OptionHelp>
                {triggerHelpText[form.triggerKind] ??
                  "LeetPlus проверит правило, когда получит событие этого типа."}
              </OptionHelp>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="XP">
              <input
                className={fieldClass}
                type="number"
                value={form.xpReward}
                onChange={(event) =>
                  setForm({ ...form, xpReward: event.target.value })
                }
              />
            </Field>
            <Field label="Цель">
              <input
                className={fieldClass}
                type="number"
                value={form.progressTarget}
                onChange={(event) =>
                  setForm({ ...form, progressTarget: event.target.value })
                }
              />
            </Field>
            <Field label="Что считаем">
              <OptionSelect
                options={progressUnitOptions}
                value={form.progressUnit}
                preservedLabel="Сохраненная единица"
                onChange={(progressUnit) =>
                  setForm({ ...form, progressUnit })
                }
              />
              <OptionHelp>
                Показывается гостю как единица прогресса: визиты, минуты,
                покупки или шаги.
              </OptionHelp>
            </Field>
          </div>
          <StoreSelect
            stores={stores}
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Начало">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodFrom}
                onChange={(event) =>
                  setForm({ ...form, periodFrom: event.target.value })
                }
              />
            </Field>
            <Field label="Окончание">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodTo}
                onChange={(event) =>
                  setForm({ ...form, periodTo: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Лимит на гостя">
              <input
                className={fieldClass}
                type="number"
                value={form.perGuestLimit}
                onChange={(event) =>
                  setForm({ ...form, perGuestLimit: event.target.value })
                }
              />
            </Field>
            <Field label="Общий лимит">
              <input
                className={fieldClass}
                type="number"
                value={form.totalRewardLimit}
                onChange={(event) =>
                  setForm({ ...form, totalRewardLimit: event.target.value })
                }
              />
            </Field>
          </div>
          <MissionBusinessRules
            form={form}
            missionTemplates={missionTemplates}
            tariffSnapshots={tariffSnapshots}
            guestLogCatalog={guestLogCatalog}
            products={products}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "mission"}
            onClick={onSave}
          >
            {editingId ? "Изменить миссию" : "Создать миссию"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      }
      listTitle="Миссии"
      items={missions}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          title={item.name}
          status={item.status}
          subtitle={`${missionTypeLabel(item.missionType)} · ${item.xpReward} XP`}
          meta={[
            item.audience?.name ?? "все гости",
            packetModeLabel(stringRule(item.conditions, "packetMode", "ANY")),
            tariffRuleSummary(item.conditions),
            guestLogRuleSummary(item.conditions, item.antiFraudRules),
            missionMetricSummary(item.conditions),
            questRuleSummary(item.conditions),
            `${item.progressTarget ?? 1} ${item.progressUnit ?? "шаг"}`,
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function SeasonsTab({
  form,
  setForm,
  seasons,
  audiences,
  stores,
  tariffSnapshots,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  saving,
  canManage,
}: {
  form: SeasonForm;
  setForm: (form: SeasonForm) => void;
  seasons: GuestGameSeason[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (season: GuestGameSeason) => void;
  onReset: () => void;
  onStatus: (
    type: "loot-boxes" | "missions" | "seasons",
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <RulesLayout
      canManage={canManage}
      formTitle={editingId ? "Редактирование Battle Pass" : "Сезон и Battle Pass"}
      form={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название">
              <input
                className={fieldClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="Статус">
              <StatusSelect
                value={form.status}
                onChange={(status) => setForm({ ...form, status })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип сезона">
              <input
                className={fieldClass}
                value={form.seasonType}
                onChange={(event) =>
                  setForm({ ...form, seasonType: event.target.value })
                }
              />
            </Field>
            <AudienceSelect
              audiences={audiences}
              value={form.audienceId}
              onChange={(audienceId) => setForm({ ...form, audienceId })}
            />
          </div>
          <StoreSelect
            stores={stores}
            value={form.storeIds}
            onChange={(storeIds) => setForm({ ...form, storeIds })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Начало">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodFrom}
                onChange={(event) =>
                  setForm({ ...form, periodFrom: event.target.value })
                }
              />
            </Field>
            <Field label="Окончание">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.periodTo}
                onChange={(event) =>
                  setForm({ ...form, periodTo: event.target.value })
                }
              />
            </Field>
          </div>
          <SeasonBusinessRules
            form={form}
            tariffSnapshots={tariffSnapshots}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Premium">
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={form.premiumEnabled}
                  onChange={(event) =>
                    setForm({ ...form, premiumEnabled: event.target.checked })
                  }
                />
                Включен
              </label>
            </Field>
            <Field label="Upgrade mode">
              <input
                className={fieldClass}
                value={form.premiumUpgradeMode}
                onChange={(event) =>
                  setForm({ ...form, premiumUpgradeMode: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Бюджет">
              <input
                className={fieldClass}
                type="number"
                value={form.budgetAmount}
                onChange={(event) =>
                  setForm({ ...form, budgetAmount: event.target.value })
                }
              />
            </Field>
            <RewardApprovalSelect
              manualApprovalRequired={form.manualApprovalRequired}
              onChange={(manualApprovalRequired) =>
                setForm({ ...form, manualApprovalRequired })
              }
            />
          </div>
          <Field label="Заметка">
            <textarea
              className={`${fieldClass} min-h-20`}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
            />
          </Field>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "season"}
            onClick={onSave}
          >
            {editingId ? "Изменить сезон" : "Создать сезон"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
      }
      listTitle="Сезоны"
      items={seasons}
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          title={item.name}
          status={item.status}
          subtitle={`${item.seasonType} · ${item.premiumEnabled ? "premium" : "free"}`}
          meta={[
            item.audience?.name ?? "все гости",
            packetModeLabel(stringRule(item.xpRules, "packetMode", "ANY")),
            tariffRuleSummary(item.xpRules),
            guestLogRuleSummary(item.xpRules),
            formatDate(item.periodFrom),
            formatMoney(item.budgetAmount ?? 0),
          ]}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("seasons", item.id, status)}
          saving={saving === `seasons-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function RewardsTab({
  form,
  setForm,
  redeemForm,
  setRedeemForm,
  redeemedReward,
  rewards,
  profiles,
  guests,
  stores,
  lootBoxes,
  missions,
  seasons,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  onRedeem,
  saving,
  canApprove,
}: {
  form: RewardForm;
  setForm: (form: RewardForm) => void;
  redeemForm: RewardRedeemForm;
  setRedeemForm: Dispatch<SetStateAction<RewardRedeemForm>>;
  redeemedReward: GuestGameReward | null;
  rewards: GuestGameReward[];
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  onReset: () => void;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onRedeem: () => Promise<void>;
  saving: string | null;
  canApprove: boolean;
}) {
  const [rewardSearch, setRewardSearch] = useState("");
  const [selectedRewardTypes, setSelectedRewardTypes] = useState<string[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [rewardSort, setRewardSort] = useState<RewardSortMode>("newest");
  const filteredRewards = useMemo(() => {
    const query = rewardSearch.trim().toLocaleLowerCase("ru-RU");
    const rewardTypeSet = new Set(selectedRewardTypes);
    const storeSet = new Set(selectedStoreIds);

    return rewards
      .filter((reward) => {
        const matchesType =
          rewardTypeSet.size === 0 || rewardTypeSet.has(reward.rewardType);
        const storeId = reward.store?.id ?? "";
        const matchesStore = storeSet.size === 0 || storeSet.has(storeId);
        const matchesSearch =
          !query || rewardSearchTokens(reward).some((token) => token.includes(query));

        return matchesType && matchesStore && matchesSearch;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.qualifiedAt).getTime();
        const rightTime = new Date(right.qualifiedAt).getTime();

        return rewardSort === "newest"
          ? rightTime - leftTime
          : leftTime - rightTime;
      });
  }, [rewardSearch, rewardSort, rewards, selectedRewardTypes, selectedStoreIds]);

  const rewardStoreOptions = useMemo(() => {
    const rewardStoreIds = new Set(
      rewards.map((reward) => reward.store?.id).filter(Boolean),
    );
    const storesWithRewards = stores.filter((store) => rewardStoreIds.has(store.id));

    return storesWithRewards.length ? storesWithRewards : stores;
  }, [rewards, stores]);

  return (
    <div className="space-y-5">
      {canApprove ? (
      <details
        className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        open={editingId ? true : undefined}
      >
        <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 text-left outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-400 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900/60 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-base font-bold text-zinc-950 dark:text-white">
              {editingId ? "Редактирование награды" : "Ручная награда"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Создать приз вручную или поправить выбранную награду из кошелька.
            </p>
          </div>
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-bold text-zinc-600 transition group-open:border-emerald-300 group-open:bg-emerald-50 group-open:text-emerald-800 dark:border-zinc-800 dark:text-zinc-300 dark:group-open:border-emerald-800 dark:group-open:bg-emerald-950/40 dark:group-open:text-emerald-100">
            <span className="group-open:hidden">Развернуть</span>
            <span className="hidden group-open:inline">Свернуть</span>
          </span>
        </summary>
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="space-y-3">
          <Field label="Профиль">
            <select
              className={fieldClass}
              value={form.profileId}
              onChange={(event) =>
                setForm({ ...form, profileId: event.target.value })
              }
            >
              <option value="">Не выбран</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} · L{profile.level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Гость без профиля">
            <select
              className={fieldClass}
              value={form.guestId}
              onChange={(event) =>
                setForm({ ...form, guestId: event.target.value })
              }
            >
              <option value="">Не выбран</option>
              {guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName} · {guest.contact}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Источник">
              <select
                className={fieldClass}
                value={form.source}
                onChange={(event) =>
                  setForm({ ...form, source: event.target.value })
                }
              >
                <option value="MANUAL">ручной</option>
                <option value="CASHIER">кассир</option>
                <option value="API_IMPORT">импорт</option>
                <option value="LANGAME">Langame</option>
              </select>
            </Field>
            <Field label="Статус">
              <select
                className={fieldClass}
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as GuestGameRewardStatus,
                  })
                }
              >
                {rewardStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {rewardStatusLabels[status]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип">
              <OptionSelect
                options={rewardTypeOptions}
                value={form.rewardType}
                preservedLabel="Сохраненный тип награды"
                onChange={(rewardType) =>
                  setForm({ ...form, rewardType })
                }
              />
            </Field>
            <Field label="Сумма">
              <input
                className={fieldClass}
                type="number"
                value={form.rewardAmount}
                onChange={(event) =>
                  setForm({ ...form, rewardAmount: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Название">
            <input
              className={fieldClass}
              value={form.rewardLabel}
              onChange={(event) =>
                setForm({ ...form, rewardLabel: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Код">
              <input
                className={fieldClass}
                value={form.rewardCode}
                onChange={(event) =>
                  setForm({ ...form, rewardCode: event.target.value })
                }
              />
            </Field>
            <Field label="Сгорает">
              <input
                className={fieldClass}
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm({ ...form, expiresAt: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Клуб">
            <select
              className={fieldClass}
              value={form.storeId}
              onChange={(event) =>
                setForm({ ...form, storeId: event.target.value })
              }
            >
              <option value="">Любой</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </Field>
          <LinkSelect
            label="Лутбокс"
            value={form.lootBoxId}
            items={lootBoxes}
            onChange={(lootBoxId) => setForm({ ...form, lootBoxId })}
          />
          <LinkSelect
            label="Миссия"
            value={form.missionId}
            items={missions}
            onChange={(missionId) => setForm({ ...form, missionId })}
          />
          <LinkSelect
            label="Сезон"
            value={form.seasonId}
            items={seasons}
            onChange={(seasonId) => setForm({ ...form, seasonId })}
          />
          <Field label="Заметка">
            <textarea
              className={`${fieldClass} min-h-20`}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
            />
          </Field>
          <JsonField
            label="Evidence"
            value={form.evidenceText}
            onChange={(evidenceText) => setForm({ ...form, evidenceText })}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving === "reward"}
            onClick={onSave}
          >
            {editingId ? "Изменить награду" : "Поставить в кошелек"}
          </button>
          {editingId ? (
            <button type="button" className={smallButtonClass} onClick={onReset}>
              Сбросить выбор
            </button>
          ) : null}
        </div>
        </div>
      </details>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Кошелек наград" />
          {canApprove ? (
          <a
            className={smallButtonClass}
            href="/api/guests/gamification/rewards/export"
            download
          >
            Экспорт CSV
          </a>
          ) : null}
        </div>
        {canApprove ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Погашение кода гостя
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                Когда гость показывает код из кошелька или QR-код, вставьте
                короткий код кассиру. После погашения награда считается
                выданной и повторно использовать код нельзя.
              </p>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <input
                className={fieldClass}
                value={redeemForm.claim}
                placeholder="Например, LP-D5791101"
                onChange={(event) =>
                  setRedeemForm((current) => ({
                    ...current,
                    claim: event.target.value,
                  }))
                }
              />
              <select
                className={fieldClass}
                value={redeemForm.storeId}
                onChange={(event) =>
                  setRedeemForm((current) => ({
                    ...current,
                    storeId: event.target.value,
                  }))
                }
              >
                <option value="">Клуб не проверять</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "rewardRedeem"}
              onClick={onRedeem}
            >
              Погасить
            </button>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <input
              className={fieldClass}
              value={redeemForm.note}
              placeholder="Заметка кассира, если нужна"
              onChange={(event) =>
                setRedeemForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
            {redeemedReward ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                Погашено:{" "}
                <span className="font-bold">{redeemedReward.rewardLabel}</span>
                {" · "}
                {redeemedReward.profile?.displayName ??
                  redeemedReward.guest?.displayName ??
                  redeemedReward.guestExternalId ??
                  "гость"}
                {" · "}
                <span className="font-mono">
                  {redeemedReward.rewardCode ?? "без кода"}
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                Погашение проверяет код, клуб и статус награды, затем закрывает
                приз как выданный и защищает его от повторного использования.
              </div>
            )}
          </div>
          <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/70 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-cyan-900/50 dark:bg-zinc-950/40 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-white">
              Согласовано
            </span>{" "}
            — право на приз подтверждено, но выдача еще не закрыта.{" "}
            <span className="font-semibold text-zinc-900 dark:text-white">
              Выдано
            </span>{" "}
            — приз уже погашен или начислен, повторная выдача заблокирована.
          </div>
        </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            У вас read-only доступ к кошельку наград: можно смотреть очередь,
            статусы, коды и историю, но ручная выдача, экспорт, изменение
            статусов и кассирское погашение недоступны.
          </div>
        )}
        <RewardWalletFilters
          query={rewardSearch}
          onQueryChange={setRewardSearch}
          rewardTypes={selectedRewardTypes}
          onRewardTypesChange={setSelectedRewardTypes}
          storeIds={selectedStoreIds}
          onStoreIdsChange={setSelectedStoreIds}
          sort={rewardSort}
          onSortChange={setRewardSort}
          stores={rewardStoreOptions}
          totalCount={rewards.length}
          visibleCount={filteredRewards.length}
        />
        <div className="space-y-2">
          {filteredRewards.length ? (
            filteredRewards.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                onStatus={onStatus}
                onEdit={onEdit}
                saving={saving}
                canApprove={canApprove}
              />
            ))
          ) : (
            <EmptyState text={rewards.length ? "По фильтрам наград нет" : "Наград пока нет"} />
          )}
        </div>
      </section>
    </div>
  );
}

function RewardWalletFilters({
  query,
  onQueryChange,
  rewardTypes,
  onRewardTypesChange,
  storeIds,
  onStoreIdsChange,
  sort,
  onSortChange,
  stores,
  totalCount,
  visibleCount,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  rewardTypes: string[];
  onRewardTypesChange: (rewardTypes: string[]) => void;
  storeIds: string[];
  onStoreIdsChange: (storeIds: string[]) => void;
  sort: RewardSortMode;
  onSortChange: (sort: RewardSortMode) => void;
  stores: Store[];
  totalCount: number;
  visibleCount: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Field label="Поиск по ФИО или телефону">
          <input
            className={fieldClass}
            value={query}
            placeholder="Например, Иванов или 993780"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </Field>
        <Field label="Дата и время">
          <select
            className={fieldClass}
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as RewardSortMode)
            }
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <RewardFilterChips
          title="Тип награды"
          options={rewardTypeOptions}
          value={rewardTypes}
          onChange={onRewardTypesChange}
        />
        <RewardFilterChips
          title="Клуб"
          options={stores.map((store) => ({
            value: store.id,
            label: store.name,
          }))}
          value={storeIds}
          onChange={onStoreIdsChange}
        />
      </div>
      <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Показано {visibleCount} из {totalCount}
      </p>
    </div>
  );
}

function RewardFilterChips({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const toggle = (nextValue: string) => {
    onChange(
      selected.has(nextValue)
        ? value.filter((currentValue) => currentValue !== nextValue)
        : [...value, nextValue],
    );
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.length ? (
          options.map((option) => {
            const isSelected = selected.has(option.value);

            return (
              <button
                key={option.value}
                type="button"
                className={
                  isSelected
                    ? "rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white dark:bg-emerald-300 dark:text-zinc-950"
                    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:text-emerald-100"
                }
                onClick={() => toggle(option.value)}
              >
                {option.label}
              </button>
            );
          })
        ) : (
          <span className="text-xs text-zinc-400">Нет вариантов</span>
        )}
      </div>
    </div>
  );
}

function LootBoxBusinessRules({
  form,
  tariffSnapshots,
  guestLogCatalog,
  onChange,
}: {
  form: LootBoxForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  onChange: (patch: Partial<LootBoxForm>) => void;
}) {
  const updatePrizes = (prizes: LootBoxPrizeForm[]) =>
    onChange(lootBoxPrizePatch(form, prizes));
  const hasWeeklyLootBoxLimit = form.perGuestPerWeek.trim().length > 0;

  return (
    <BusinessRuleSection
      title="Правила запуска"
      description="Настройте, когда лутбокс открывается, сколько раз его можно получить и как распределяются награды."
    >
      <LootBoxScheduleFields form={form} onChange={onChange} />
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <GuestLogConditionFields
        guestLogTypes={form.guestLogTypes}
        blockedGuestLogTypes={form.blockedGuestLogTypes}
        catalog={guestLogCatalog}
        onChange={onChange}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Лимит на одного гостя
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Сколько раз один участник может открыть этот лутбокс за неделю.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="radio"
                checked={!hasWeeklyLootBoxLimit}
                onChange={() => onChange({ perGuestPerWeek: "" })}
              />
              <span>Сколько угодно</span>
            </label>
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <input
                type="radio"
                checked={hasWeeklyLootBoxLimit}
                onChange={() =>
                  onChange({ perGuestPerWeek: form.perGuestPerWeek || "1" })
                }
              />
              <span>Задать количество</span>
            </label>
          </div>
          {hasWeeklyLootBoxLimit ? (
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Открытий на гостя в неделю
              <input
                className={fieldClass}
                type="number"
                min="1"
                value={form.perGuestPerWeek}
                onChange={(event) =>
                  onChange({ perGuestPerWeek: event.target.value })
                }
              />
            </label>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              LeetPlus не будет ограничивать количество открытий этим недельным лимитом.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Общий дневной лимит
            <input
              className={fieldClass}
              type="number"
              min="1"
              value={form.totalPerDay}
              onChange={(event) => onChange({ totalPerDay: event.target.value })}
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Сколько всего открытий разрешено в день по этому лутбоксу для всех
            выбранных клубов. Оставьте поле пустым, если общий дневной лимит не
            нужен.
          </p>
        </div>
      </div>
      <LootBoxPrizesEditor prizes={form.prizes} onChange={updatePrizes} />
    </BusinessRuleSection>
  );
}

function LootBoxScheduleFields({
  form,
  onChange,
}: {
  form: LootBoxForm;
  onChange: (patch: Partial<LootBoxForm>) => void;
}) {
  const usesTimeWindow = form.timeWindowMode !== "ANY";
  const usesCustomWeekdays = form.weekdayMode === "CUSTOM";
  const selectedWeekdays = form.selectedWeekdays.length
    ? form.selectedWeekdays
    : weekdayPresets.CUSTOM;

  const setWeekdayMode = (weekdayMode: LootBoxWeekdayMode) => {
    onChange({
      weekdayMode,
      weekdaysOnly: weekdayMode === "WEEKDAYS",
      selectedWeekdays:
        weekdayMode === "CUSTOM"
          ? selectedWeekdays
          : weekdayPresets[weekdayMode],
    });
  };
  const toggleWeekday = (weekday: number) => {
    const next = selectedWeekdays.includes(weekday)
      ? selectedWeekdays.filter((item) => item !== weekday)
      : [...selectedWeekdays, weekday];

    onChange({
      weekdayMode: "CUSTOM",
      weekdaysOnly: false,
      selectedWeekdays: sortWeekdays(next),
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Когда показывать">
          <select
            className={fieldClass}
            value={form.timeWindowMode}
            onChange={(event) => {
              const timeWindowMode = event.target.value as LootBoxTimeWindowMode;

              onChange({
                timeWindowMode,
                quietHoursEnabled: timeWindowMode !== "ANY",
              });
            }}
          >
            {lootBoxTimeWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            {form.timeWindowMode === "ANY"
              ? "Лутбокс может появиться в любое время, если остальные условия совпали."
              : form.timeWindowMode === "QUIET_HOURS"
                ? "Сценарий для загрузки непиковых часов. Ниже задайте окно тихих часов."
                : "Задайте собственный временной интервал для появления лутбокса."}
          </OptionHelp>
        </Field>
        <Field label="По каким дням">
          <select
            className={fieldClass}
            value={form.weekdayMode}
            onChange={(event) =>
              setWeekdayMode(event.target.value as LootBoxWeekdayMode)
            }
          >
            {lootBoxWeekdayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            {form.weekdayMode === "ANY"
              ? "День недели не ограничивает появление лутбокса."
              : form.weekdayMode === "WEEKDAYS"
                ? "Лутбокс доступен с понедельника по пятницу."
                : form.weekdayMode === "WEEKENDS"
                  ? "Лутбокс доступен только в субботу и воскресенье."
                  : "Отметьте конкретные дни, когда лутбокс может появиться."}
          </OptionHelp>
        </Field>
      </div>
      {usesTimeWindow ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Начало окна">
            <input
              className={fieldClass}
              type="time"
              value={form.hourFrom}
              onChange={(event) => onChange({ hourFrom: event.target.value })}
            />
          </Field>
          <Field label="Конец окна">
            <input
              className={fieldClass}
              type="time"
              value={form.hourTo}
              onChange={(event) => onChange({ hourTo: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
      {usesCustomWeekdays ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {weekdayOptions.map((weekday) => {
            const active = selectedWeekdays.includes(weekday.value);

            return (
              <button
                key={weekday.value}
                type="button"
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-bold transition",
                  active
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
                ].join(" ")}
                onClick={() => toggleWeekday(weekday.value)}
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LootBoxPrizesEditor({
  prizes,
  onChange,
}: {
  prizes: LootBoxPrizeForm[];
  onChange: (prizes: LootBoxPrizeForm[]) => void;
}) {
  const chanceTotal = prizes.reduce(
    (total, prize) => total + Math.max(0, numeric(prize.chancePercent, 0)),
    0,
  );
  const chanceDiff = Math.round((100 - chanceTotal) * 100) / 100;
  const chanceStatus =
    Math.abs(chanceDiff) < 0.01
      ? "Сумма шансов 100%"
      : chanceDiff > 0
        ? `Осталось ${formatChanceNumber(chanceDiff)}%`
        : `Превышение ${formatChanceNumber(Math.abs(chanceDiff))}%`;
  const chanceStatusClass =
    Math.abs(chanceDiff) < 0.01
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

  const updatePrize = (index: number, patch: Partial<LootBoxPrizeForm>) => {
    onChange(
      prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...patch } : prize,
      ),
    );
  };
  const removePrize = (index: number) => {
    if (prizes.length <= 1) {
      return;
    }

    onChange(prizes.filter((_, prizeIndex) => prizeIndex !== index));
  };
  const addPrize = () =>
    onChange([
      ...prizes,
      {
        id: `prize-${Date.now()}-${prizes.length + 1}`,
        rewardType: "BONUS_BALANCE",
        rewardAmount: "50",
        rewardLabel: "Новый приз",
        chancePercent: "0",
      },
    ]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
            Призы и вероятности
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Добавьте несколько возможных наград. При открытии лутбокса LeetPlus
            выберет один приз по указанным шансам.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
              chanceStatusClass,
            ].join(" ")}
          >
            {chanceStatus}
          </span>
          <button
            type="button"
            className={smallButtonClass}
            title="Шансы выпада сохранятся пропорционально установленным текущим призам"
            onClick={() => onChange(normalizeLootBoxPrizeChances(prizes))}
          >
            Настроить вероятности автоматически
          </button>
          <button type="button" className={smallButtonClass} onClick={addPrize}>
            Добавить приз
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {prizes.map((prize, index) => (
          <div
            key={prize.id}
            className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50 lg:grid-cols-[minmax(150px,1fr)_minmax(110px,0.6fr)_minmax(190px,1.2fr)_minmax(110px,0.55fr)_auto] lg:items-end"
          >
            <Field label="Тип награды">
              <OptionSelect
                options={lootBoxRewardTypeOptions}
                value={prize.rewardType}
                preservedLabel="Сохраненный тип награды"
                onChange={(rewardType) => updatePrize(index, { rewardType })}
              />
            </Field>
            <Field label="Сумма">
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={prize.rewardAmount}
                onChange={(event) =>
                  updatePrize(index, { rewardAmount: event.target.value })
                }
              />
            </Field>
            <Field label="Название приза">
              <input
                className={fieldClass}
                value={prize.rewardLabel}
                onChange={(event) =>
                  updatePrize(index, { rewardLabel: event.target.value })
                }
              />
            </Field>
            <Field label="Шанс, %">
              <input
                className={fieldClass}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={prize.chancePercent}
                onChange={(event) =>
                  updatePrize(index, { chancePercent: event.target.value })
                }
              />
            </Field>
            <button
              type="button"
              className={`${smallButtonClass} justify-center lg:h-10`}
              disabled={prizes.length <= 1}
              onClick={() => removePrize(index)}
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionBusinessRules({
  form,
  missionTemplates,
  tariffSnapshots,
  guestLogCatalog,
  products,
  onChange,
}: {
  form: MissionForm;
  missionTemplates: GuestGameMission[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  products: Product[];
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Условия выполнения"
      description="Опишите проверяемое поведение гостя простыми правилами. Факты берутся из подготовленных данных Langame."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип сессии">
          <select
            className={fieldClass}
            value={form.sessionType}
            onChange={(event) => onChange({ sessionType: event.target.value })}
          >
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Пакет часов">
          <select
            className={fieldClass}
            value={form.packetMode}
            onChange={(event) => onChange({ packetMode: event.target.value })}
          >
            {packetModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Метрика прогресса
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Система считает прогресс по сохраненным фактам гостя: чекины, сессии,
          пополнения, покупки бара и рефералы.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Как считать">
            <select
              className={fieldClass}
              value={form.metricAggregation}
              onChange={(event) =>
                onChange({ metricAggregation: event.target.value })
              }
            >
              <option value="count">Количество действий</option>
              <option value="sum">Сумма, руб</option>
              <option value="duration">Минуты игры</option>
              <option value="distinctDays">Уникальные дни</option>
              <option value="exists">Факт события</option>
            </select>
          </Field>
          <MissionMetricEventField
            value={form.metricEventTypes}
            catalog={guestLogCatalog}
            onChange={(metricEventTypes) => onChange({ metricEventTypes })}
          />
          <Field label="Окна времени">
            <input
              className={fieldClass}
              placeholder="22:00-06:00"
              value={form.metricHours}
              onChange={(event) => onChange({ metricHours: event.target.value })}
            />
          </Field>
        </div>
        <MissionProductMetricSelector
          products={products}
          productIds={form.metricProductIds}
          externalProductIds={form.metricExternalProductIds}
          categoryIds={form.metricCategoryIds}
          categoryNames={form.metricCategoryNames}
          onChange={onChange}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Окно выполнения, дней">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.windowDays}
            onChange={(event) => onChange({ windowDays: event.target.value })}
          />
        </Field>
        <Field label="Минут в сессии">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSessionMinutes}
            onChange={(event) =>
              onChange({ minSessionMinutes: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Минимальная покупка, руб">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSpendAmount}
            onChange={(event) =>
              onChange({ minSpendAmount: event.target.value })
            }
          />
        </Field>
        <ToggleField
          label="Только будни"
          checked={form.weekdaysOnly}
          onChange={(weekdaysOnly) => onChange({ weekdaysOnly })}
        />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              Квестовая цепочка
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Разбейте миссию на понятные гостю шаги. В публичном кабинете они
              будут показаны от первого шага к награде.
            </p>
          </div>
          <ToggleField
            label="Включить цепочку"
            checked={form.questEnabled}
            onChange={(questEnabled) => onChange({ questEnabled })}
          />
        </div>
        {form.questEnabled ? (
          <MissionQuestChainFields
            form={form}
            missionTemplates={missionTemplates}
            onChange={onChange}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <ToggleField
            label="Нужен факт Langame"
            checked={form.requireLangameFact}
            onChange={(requireLangameFact) => onChange({ requireLangameFact })}
          />
          <OptionHelp>
            Миссия засчитывается только по подтвержденному сохраненному факту:
            визиту, сессии, чеку, пополнению или другому событию из Langame.
          </OptionHelp>
        </div>
        <ToggleField
          label="Без повтора в тот же день"
          checked={form.denySameDayRepeat}
          onChange={(denySameDayRepeat) => onChange({ denySameDayRepeat })}
        />
        <ToggleField
          label="Подтверждает кассир"
          checked={form.requireCashierConfirmation}
          onChange={(requireCashierConfirmation) =>
            onChange({ requireCashierConfirmation })
          }
        />
      </div>
    </BusinessRuleSection>
  );
}

function MissionQuestChainFields({
  form,
  missionTemplates,
  onChange,
}: {
  form: MissionForm;
  missionTemplates: GuestGameMission[];
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  const missionTemplateById = new Map(
    missionTemplates.map((mission) => [mission.id, mission]),
  );
  const questSteps = form.questSteps.length
    ? form.questSteps
    : cloneMissionQuestSteps(defaultMissionQuestSteps.slice(0, 1));

  const updateStep = (index: number, patch: Partial<MissionQuestStepForm>) => {
    onChange({
      questSteps: questSteps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    });
  };

  const selectTemplate = (index: number, missionId: string) => {
    const mission = missionTemplateById.get(missionId);
    const step = questSteps[index];

    updateStep(index, {
      missionId,
      title: mission?.name ?? step?.title ?? "",
    });
  };

  const addStep = () =>
    onChange({
      questSteps: [
        ...questSteps,
        {
          id: `step-${Date.now()}-${questSteps.length + 1}`,
          title: `Шаг ${questSteps.length + 1}`,
          missionId: "",
        },
      ],
    });

  const removeStep = (index: number) => {
    const nextSteps = questSteps.filter((_, stepIndex) => stepIndex !== index);

    onChange({
      questSteps: nextSteps.length
        ? nextSteps
        : cloneMissionQuestSteps(defaultMissionQuestSteps.slice(0, 1)),
    });
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OptionHelp>
          Шаг можно связать с сохраненной миссией-шаблоном или оставить ручной
          подписью. В цепочке сохраняется ссылка на выбранную миссию и текст,
          который увидит гость.
        </OptionHelp>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {questSteps.length} {missionStepCountLabel(questSteps.length)}
        </span>
      </div>
      {questSteps.map((step, index) => {
        const label = `Шаг ${index + 1}`;
        const selectedMission = missionTemplateById.get(step.missionId);

        return (
          <div
            key={step.id || label}
            className="grid gap-3 border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
          >
            <Field label={`${label}: шаблон`}>
              <select
                className={fieldClass}
                value={step.missionId}
                onChange={(event) =>
                  selectTemplate(index, event.target.value)
                }
              >
                <option value="">
                  {missionTemplates.length
                    ? "Без шаблона"
                    : "Сначала сохраните миссию"}
                </option>
                {missionTemplates.map((mission) => (
                  <option key={mission.id} value={mission.id}>
                    {mission.name} · {missionTypeLabel(mission.missionType)}
                  </option>
                ))}
              </select>
              <OptionHelp>
                {selectedMission
                  ? `${selectedMission.xpReward} XP · ${
                      selectedMission.progressTarget ?? 1
                    } ${selectedMission.progressUnit ?? "шаг"}`
                  : "Шаблон необязателен: можно оставить шаг простым текстом."}
              </OptionHelp>
            </Field>
            <Field label={`${label}: подпись для гостя`}>
              <input
                className={fieldClass}
                value={step.title}
                onChange={(event) =>
                  updateStep(index, { title: event.target.value })
                }
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                className={`${smallButtonClass} w-full justify-center lg:h-10`}
                disabled={questSteps.length <= 1}
                onClick={() => removeStep(index)}
              >
                Удалить
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallButtonClass}
          disabled={questSteps.length >= maxMissionQuestSteps}
          onClick={addStep}
        >
          Добавить шаг
        </button>
        <OptionHelp>
          Можно собрать до {maxMissionQuestSteps} шагов из сохраненных шаблонов
          миссий.
        </OptionHelp>
      </div>
    </div>
  );
}

function SeasonBusinessRules({
  form,
  tariffSnapshots,
  onChange,
}: {
  form: SeasonForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  onChange: (patch: Partial<SeasonForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Лестница Battle Pass"
      description="Задайте XP за действия, количество уровней и частоту наград. Система соберет free и premium дорожки сама."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Field label="XP за визит">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpVisit}
            onChange={(event) => onChange({ xpVisit: event.target.value })}
          />
        </Field>
        <Field label="XP за чекин">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpCheckIn}
            onChange={(event) => onChange({ xpCheckIn: event.target.value })}
          />
        </Field>
        <Field label="XP за час">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpPlayHour}
            onChange={(event) => onChange({ xpPlayHour: event.target.value })}
          />
        </Field>
        <Field label="XP за бар">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpBarPurchase}
            onChange={(event) =>
              onChange({ xpBarPurchase: event.target.value })
            }
          />
        </Field>
        <Field label="XP за миссию">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpMissionCompletion}
            onChange={(event) =>
              onChange({ xpMissionCompletion: event.target.value })
            }
          />
        </Field>
        <Field label="XP за guests/logs">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpGuestLog}
            onChange={(event) => onChange({ xpGuestLog: event.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Тип сессии">
          <select
            className={fieldClass}
            value={form.sessionType}
            onChange={(event) => onChange({ sessionType: event.target.value })}
          >
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Пакет часов">
          <select
            className={fieldClass}
            value={form.packetMode}
            onChange={(event) => onChange({ packetMode: event.target.value })}
          >
            {packetModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Бонус XP за пакет">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.xpPacketSessionBonus}
            onChange={(event) =>
              onChange({ xpPacketSessionBonus: event.target.value })
            }
          />
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Уровней">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.levelCount}
            onChange={(event) => onChange({ levelCount: event.target.value })}
          />
        </Field>
        <Field label="XP на уровень">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.xpPerLevel}
            onChange={(event) => onChange({ xpPerLevel: event.target.value })}
          />
        </Field>
        <Field label="Free каждые N уровней">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.freeRewardEvery}
            onChange={(event) =>
              onChange({ freeRewardEvery: event.target.value })
            }
          />
        </Field>
        <Field label="Premium каждые N уровней">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.premiumRewardEvery}
            onChange={(event) =>
              onChange({ premiumRewardEvery: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Free награда">
          <input
            className={fieldClass}
            value={form.freeRewardLabel}
            onChange={(event) =>
              onChange({ freeRewardLabel: event.target.value })
            }
          />
        </Field>
        <Field label="Premium награда">
          <input
            className={fieldClass}
            value={form.premiumRewardLabel}
            onChange={(event) =>
              onChange({ premiumRewardLabel: event.target.value })
            }
          />
        </Field>
      </div>
    </BusinessRuleSection>
  );
}

function BusinessRuleSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
        {title}
      </legend>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {description}
      </p>
      {children}
    </fieldset>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${formSectionClass} space-y-3`}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OptionSelect({
  options,
  value,
  onChange,
  preservedLabel,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  preservedLabel: string;
}) {
  const hasCurrentOption = options.some((option) => option.value === value);

  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {!hasCurrentOption && value ? (
        <option value={value}>
          {preservedLabel}: {value}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value || "empty"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function OptionHelp({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}

function RewardApprovalSelect({
  manualApprovalRequired,
  onChange,
}: {
  manualApprovalRequired: boolean;
  onChange: (manualApprovalRequired: boolean) => void;
}) {
  return (
    <Field label="Выдача награды">
      <select
        className={fieldClass}
        value={manualApprovalRequired ? "manual" : "auto"}
        onChange={(event) => onChange(event.target.value === "manual")}
      >
        <option value="auto">Автоматически</option>
        <option value="manual">После подтверждения сотрудником</option>
      </select>
    </Field>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function RuleCommonFields({
  status,
  name,
  rewardType,
  rewardAmount,
  rewardLabel,
  audienceId,
  budgetAmount,
  manualApprovalRequired,
  note,
  audiences,
  hideRewardFields = false,
  onChange,
}: {
  status: GuestGameStatus;
  name: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  budgetAmount: string;
  manualApprovalRequired: boolean;
  note: string;
  audiences: GuestAudience[];
  hideRewardFields?: boolean;
  onChange: (patch: Partial<LootBoxForm & MissionForm>) => void;
}) {
  return (
    <>
      <FormSection title="Основное">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.6fr)]">
          <Field label="Название">
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
          <Field label="Статус">
            <StatusSelect
              value={status}
              onChange={(next) => onChange({ status: next })}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title={hideRewardFields ? "Бюджет и выдача" : "Награда и бюджет"}>
        {hideRewardFields ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
            <Field label="Бюджет">
              <input
                className={fieldClass}
                type="number"
                value={budgetAmount}
                onChange={(event) =>
                  onChange({ budgetAmount: event.target.value })
                }
              />
            </Field>
            <RewardApprovalSelect
              manualApprovalRequired={manualApprovalRequired}
              onChange={(nextManualApprovalRequired) =>
                onChange({
                  manualApprovalRequired: nextManualApprovalRequired,
                })
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Тип награды">
                <OptionSelect
                  options={rewardTypeOptions}
                  value={rewardType}
                  preservedLabel="Сохраненный тип награды"
                  onChange={(nextRewardType) =>
                    onChange({ rewardType: nextRewardType })
                  }
                />
              </Field>
              <Field label="Сумма">
                <input
                  className={fieldClass}
                  type="number"
                  value={rewardAmount}
                  onChange={(event) =>
                    onChange({ rewardAmount: event.target.value })
                  }
                />
              </Field>
              <Field label="Бюджет">
                <input
                  className={fieldClass}
                  type="number"
                  value={budgetAmount}
                  onChange={(event) =>
                    onChange({ budgetAmount: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
              <Field label="Название награды">
                <input
                  className={fieldClass}
                  value={rewardLabel}
                  onChange={(event) =>
                    onChange({ rewardLabel: event.target.value })
                  }
                />
              </Field>
              <RewardApprovalSelect
                manualApprovalRequired={manualApprovalRequired}
                onChange={(nextManualApprovalRequired) =>
                  onChange({
                    manualApprovalRequired: nextManualApprovalRequired,
                  })
                }
              />
            </div>
          </>
        )}
      </FormSection>
      <FormSection title="Аудитория и заметка">
        <AudienceSelect
          audiences={audiences}
          value={audienceId}
          onChange={(next) => onChange({ audienceId: next })}
        />
        <Field label="Заметка">
          <textarea
            className={`${fieldClass} min-h-20`}
            value={note}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </Field>
      </FormSection>
    </>
  );
}

function RulesLayout<T>({
  canManage,
  formTitle,
  form,
  listTitle,
  items,
  renderItem,
}: {
  canManage: boolean;
  formTitle: string;
  form: ReactNode;
  listTitle: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div
      className={
        canManage
          ? "grid items-start gap-4 2xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? <Panel title={formTitle}>{form}</Panel> : null}
      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle title={listTitle} />
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {items.length} правил
          </p>
        </div>
        <div className="grid max-w-5xl gap-3 lg:grid-cols-2 2xl:max-w-none">
          {items.length ? (
            items.map(renderItem)
          ) : (
            <EmptyState text="Правил пока нет" />
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onStatus,
  saving,
  canManage,
}: {
  profile: GuestGameProfile;
  onEdit: (profile: GuestGameProfile) => void;
  onStatus: (
    profile: GuestGameProfile,
    status: GuestGameProfileStatus,
  ) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {profile.displayName}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {profile.contactMasked ?? profile.guest?.externalGuestId ?? "контакт не задан"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {profile.isStaffTest ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              Тест сотрудника
            </span>
          ) : null}
          <StatusPill label={profileStatusLabels[profile.status]} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="XP" value={profile.xp} />
        <MiniMetric label="Уровень" value={profile.level} />
        <MiniMetric label="Канал" value={profile.telegramIdentity ? "TG" : profile.maxIdentity ? "MAX" : "-"} />
      </div>
      {canManage ? (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButtonClass}
          onClick={() => onEdit(profile)}
        >
          Редактировать
        </button>
        {profileStatusOptions.map((status) => (
          <button
            key={status}
            type="button"
            className={smallButtonClass}
            disabled={saving === `profile-${profile.id}` || profile.status === status}
            onClick={() => onStatus(profile, status)}
          >
            {profileStatusLabels[status]}
          </button>
        ))}
      </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр профиля: изменение XP и статуса недоступно.
        </p>
      )}
    </div>
  );
}

function RuleCard({
  eyebrow,
  title,
  status,
  subtitle,
  meta,
  onEdit,
  onStatus,
  onRestart,
  saving,
  restartSaving,
  canManage,
}: {
  eyebrow?: string;
  title: string;
  status: GuestGameStatus;
  subtitle: string;
  meta: string[];
  onEdit: () => void;
  onStatus: (status: GuestGameStatus) => Promise<void>;
  onRestart?: () => Promise<void>;
  saving: boolean;
  restartSaving?: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <StatusPill label={statusLabels[status]} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {meta.map((item) => (
          <span
            key={item}
            className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {item}
          </span>
        ))}
      </div>
      {canManage ? (
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={smallButtonClass} onClick={onEdit}>
          Редактировать
        </button>
        {onRestart ? (
          <button
            type="button"
            className={smallButtonClass}
            disabled={saving || restartSaving}
            onClick={onRestart}
          >
            {restartSaving ? "Перезапуск..." : "Перезапустить"}
          </button>
        ) : null}
        {statusOptions.map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            className={smallButtonClass}
            disabled={saving || restartSaving || status === nextStatus}
            onClick={() => onStatus(nextStatus)}
          >
            {statusLabels[nextStatus]}
          </button>
        ))}
      </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр правила: редактирование и смена статуса недоступны.
        </p>
      )}
    </div>
  );
}

function rewardGuestFullName(reward: GuestGameReward) {
  return (
    reward.profile?.displayName ??
    reward.guest?.displayName ??
    reward.guestExternalId ??
    "Гость"
  );
}

function formatGuestShortName(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");

  if (!normalized || normalized === "без гостя") {
    return "Гость";
  }

  if (/^гость(?:\s|$)/i.test(normalized)) {
    return normalized;
  }

  const parts = normalized.split(" ").filter(Boolean);
  const initial = (part: string) =>
    part.slice(0, 1).toLocaleUpperCase("ru-RU");

  if (parts.length >= 3) {
    return `${parts[0]} ${initial(parts[1])}.${initial(parts[2])}.`;
  }

  if (parts.length === 2) {
    return `${parts[0]} ${initial(parts[1])}.`;
  }

  return normalized;
}

function formatPhoneTail(value: string | null | undefined) {
  if (!value) {
    return "телефон не указан";
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length >= 6) {
    return `***${digits.slice(-6)}`;
  }

  if (digits.length > 0) {
    return `***${digits}`;
  }

  return value;
}

function formatRewardPhone(reward: GuestGameReward) {
  return formatPhoneTail(reward.guest?.contact ?? reward.profile?.contactMasked);
}

function rewardActivityLabel(reward: GuestGameReward) {
  if (reward.lootBox) {
    return "Лутбокс";
  }

  if (reward.mission) {
    return "Квест";
  }

  if (reward.season) {
    return "Battle Pass";
  }

  if (reward.source === "MANUAL" || reward.source === "CASHIER") {
    return "Ручная награда";
  }

  return "Игровое событие";
}

function rewardSearchTokens(reward: GuestGameReward) {
  const fullName = rewardGuestFullName(reward);
  const phone = formatRewardPhone(reward);

  return [
    fullName,
    formatGuestShortName(fullName),
    phone,
    reward.guest?.contact,
    reward.profile?.contactMasked,
    reward.rewardLabel,
    reward.rewardCode,
    rewardActivityLabel(reward),
    reward.store?.name,
    rewardTypeLabelFromValue(reward.rewardType),
    formatDate(reward.qualifiedAt),
  ]
    .filter(Boolean)
    .map((token) => String(token).toLocaleLowerCase("ru-RU"));
}

function isAutomaticLedgerReward(reward: GuestGameReward) {
  return (
    reward.rewardAmount > 0 &&
    automaticLedgerRewardTypes.has(reward.rewardType.toUpperCase())
  );
}

function rewardWalletLabel(reward: GuestGameReward) {
  if (
    reward.status === "APPROVED" &&
    reward.walletState === "READY" &&
    isAutomaticLedgerReward(reward)
  ) {
    return "в начислении";
  }

  return rewardWalletStateLabels[reward.walletState];
}

function rewardActionNotice(reward: GuestGameReward) {
  if (reward.status === "PENDING" && isAutomaticLedgerReward(reward)) {
    return "Нажмите «Согласовать и начислить»: право на приз подтвердится, а бонусы сразу уйдут в очередь начисления Langame.";
  }

  if (reward.status === "PENDING") {
    return "Сначала согласуйте право на приз. После этого ручную выдачу можно закрыть кодом кассира или кнопкой «Отметить выдано».";
  }

  if (reward.status === "APPROVED" && isAutomaticLedgerReward(reward)) {
    return "Награда согласована и передана в очередь начисления Langame. После успешной записи в Langame статус станет «выдано».";
  }

  if (reward.status === "APPROVED") {
    return "Награда согласована. Выдайте приз вручную и закройте его кодом кассира или кнопкой «Отметить выдано».";
  }

  return rewardStatusDescriptions[reward.status];
}

function rewardStatusButtonLabel(
  reward: GuestGameReward,
  status: GuestGameRewardStatus,
) {
  if (status === "APPROVED" && isAutomaticLedgerReward(reward)) {
    return "Согласовать и начислить";
  }

  return rewardStatusActionLabels[status];
}

function RewardRow({
  reward,
  onStatus,
  onEdit,
  saving,
  canApprove,
}: {
  reward: GuestGameReward;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  saving: string | null;
  canApprove: boolean;
}) {
  const fullGuestName = rewardGuestFullName(reward);
  const guestName = formatGuestShortName(fullGuestName);
  const guestContact = formatRewardPhone(reward);
  const activity = rewardActivityLabel(reward);
  const storeName = reward.store?.name ?? "любой клуб";
  const qualifiedAt = formatDate(reward.qualifiedAt);
  const rewardTypeLabel = rewardTypeLabelFromValue(reward.rewardType);

  return (
    <details className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer list-none p-4 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-400 dark:hover:bg-zinc-900/60 [&::-webkit-details-marker]:hidden">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.8fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">
              Тип активности
            </p>
            <p className="mt-1 font-semibold text-zinc-950 dark:text-white">
              {activity}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {reward.rewardLabel}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">Клуб</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {storeName}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-zinc-400">Дата</p>
            <p className="mt-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {qualifiedAt}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">ФИО</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {guestName}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-zinc-400">Телефон</p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {guestContact}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <StatusPill label={rewardStatusLabels[reward.status]} />
            <StatusPill label={rewardWalletLabel(reward)} />
          </div>
        </div>
      </summary>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
                {reward.rewardLabel}
              </h3>
              <StatusPill label={rewardStatusLabels[reward.status]} />
              <StatusPill label={rewardWalletLabel(reward)} />
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {guestName} · телефон: {guestContact}
            </p>
            {fullGuestName !== guestName ? (
              <p className="mt-1 text-xs text-zinc-400">
                Имя в профиле: {fullGuestName}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {rewardTypeLabel} · {formatMoney(reward.rewardAmount)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {storeName} · {qualifiedAt}
            </p>
            <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              {rewardStatusDescriptions[reward.status]}
            </p>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <span className="block font-semibold uppercase text-zinc-400">
                  Код кассиру
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-zinc-900 dark:text-white">
                  {reward.rewardCode ?? "будет создан при согласовании"}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <span className="block font-semibold uppercase text-zinc-400">
                  Срок
                </span>
                <span className="mt-1 block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  {reward.expiresAt ? formatDate(reward.expiresAt) : "без срока"}
                </span>
              </div>
            </div>
            {reward.claimPayload ? (
              <p className="mt-2 rounded-lg border border-dashed border-cyan-300/40 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                QR-код готов для гостевой страницы. Для ручной выдачи используйте
                короткий код кассиру выше.
              </p>
            ) : null}
          </div>
          {canApprove ? (
          <div className="min-w-0 space-y-2">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              {rewardActionNotice(reward)}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                className={smallButtonClass}
                onClick={() => onEdit(reward)}
              >
                Редактировать
              </button>
              {rewardStatusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={smallButtonClass}
                  disabled={
                    saving === `reward-${reward.id}` || reward.status === status
                  }
                  onClick={() => onStatus(reward, status)}
                >
                  {rewardStatusButtonLabel(reward, status)}
                </button>
              ))}
            </div>
          </div>
          ) : (
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 xl:text-right">
              Только просмотр награды
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

function EventRow({ event }: { event: GuestGameEvent }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
            {event.eventType}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {event.profile?.displayName ?? event.guest?.displayName ?? "без профиля"}
            {event.xpDelta ? ` · ${event.xpDelta > 0 ? "+" : ""}${event.xpDelta} XP` : ""}
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

function StatusSelect({
  value,
  onChange,
}: {
  value: GuestGameStatus;
  onChange: (value: GuestGameStatus) => void;
}) {
  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value as GuestGameStatus)}
    >
      {statusOptions.map((status) => (
        <option key={status} value={status}>
          {statusLabels[status]}
        </option>
      ))}
    </select>
  );
}

function AudienceSelect({
  audiences,
  value,
  onChange,
}: {
  audiences: GuestAudience[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Группа гостей">
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Все гости</option>
        {audiences.map((audience) => (
          <option key={audience.id} value={audience.id}>
            {audience.name} · {audience.guestsCount}
          </option>
        ))}
      </select>
    </Field>
  );
}

function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: Store[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selectedStores = new Set(value);
  const toggleStore = (storeId: string) => {
    onChange(
      selectedStores.has(storeId)
        ? value.filter((currentStoreId) => currentStoreId !== storeId)
        : [...value, storeId],
    );
  };

  return (
    <Field label="Клубы">
      <div className="grid gap-2 sm:grid-cols-2">
        {stores.length ? (
          stores.map((store) => {
            const selected = selectedStores.has(store.id);

            return (
              <button
                key={store.id}
                type="button"
                aria-pressed={selected}
                className={[
                  "flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30",
                ].join(" ")}
                onClick={() => toggleStore(store.id)}
              >
                <span className="min-w-0 truncate font-semibold">
                  {store.name}
                </span>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                    selected
                      ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {selected ? "выбран" : "выбрать"}
                </span>
              </button>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Клубы пока не добавлены.
          </p>
        )}
      </div>
      <OptionHelp>
        Можно выбрать несколько клубов обычными кликами. Повторный клик снимает
        выбор.
      </OptionHelp>
    </Field>
  );
}

type TariffConditionPatch = {
  tariffGroupId?: string;
  tariffPeriodId?: string;
  tariffTypeId?: string;
};

function TariffConditionFields({
  snapshots,
  tariffGroupId,
  tariffPeriodId,
  tariffTypeId,
  onChange,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  onChange: (patch: TariffConditionPatch) => void;
}) {
  const groupItems = tariffItemsByEndpoint(snapshots, "tariffsGroups");
  const periodItems = tariffItemsByEndpoint(snapshots, "tariffsTimePeriod");
  const typeItems = tariffItemsByEndpoint(snapshots, "tariffsTypesGroups");
  const hasItems = groupItems.length || periodItems.length || typeItems.length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          Тарифные условия Langame
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {hasItems
            ? "Выберите только те условия, которые должны ограничивать правило."
            : "Справочники тарифов пока не заполнены snapshot-синхронизацией."}
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <TariffConditionSelect
          label="Группа тарифа"
          emptyLabel="Любая группа"
          items={groupItems}
          value={tariffGroupId}
          onChange={(value) => onChange({ tariffGroupId: value })}
        />
        <TariffConditionSelect
          label="Период тарифа"
          emptyLabel="Любой период"
          items={periodItems}
          value={tariffPeriodId}
          onChange={(value) => onChange({ tariffPeriodId: value })}
        />
        <TariffConditionSelect
          label="Тип тарифа"
          emptyLabel="Любой тип"
          items={typeItems}
          value={tariffTypeId}
          onChange={(value) => onChange({ tariffTypeId: value })}
        />
      </div>
    </div>
  );
}

type GuestLogBusinessPreset = {
  id: string;
  label: string;
  description: string;
  intent: "allow" | "block";
  tokens: string[];
  types: string[];
};

const guestLogBusinessPresetDefinitions: Array<
  Omit<GuestLogBusinessPreset, "types">
> = [
  {
    id: "visit_or_session_start",
    label: "Старт визита или сессии",
    description: "Подходит для лутбокса при начале игры или миссии на визит.",
    intent: "allow",
    tokens: [
      "start",
      "visit",
      "login",
      "session",
      "play",
      "старт",
      "визит",
      "вход",
      "начал",
      "начало",
      "сесс",
      "сеанс",
      "игр",
    ],
  },
  {
    id: "session_finish",
    label: "Завершение сессии",
    description: "Полезно для миссий на отыгранную сессию или итоговый XP.",
    intent: "allow",
    tokens: [
      "finish",
      "finished",
      "end",
      "stop",
      "logout",
      "close",
      "заверш",
      "оконч",
      "выход",
      "стоп",
    ],
  },
  {
    id: "events_and_tournaments",
    label: "Турниры и события",
    description: "Подходит для квестов за участие в турнирах и клубных событиях.",
    intent: "allow",
    tokens: [
      "tournament",
      "event",
      "quest",
      "mission",
      "challenge",
      "турнир",
      "событ",
      "ивент",
      "квест",
      "мисси",
      "челлендж",
    ],
  },
  {
    id: "balance_and_payment",
    label: "Баланс и оплата",
    description: "Подходит для миссий или XP за пополнение, оплату или бонусы.",
    intent: "allow",
    tokens: [
      "balance",
      "payment",
      "pay",
      "deposit",
      "bonus",
      "topup",
      "transaction",
      "cash",
      "плат",
      "баланс",
      "пополн",
      "бонус",
      "депозит",
      "касс",
    ],
  },
  {
    id: "manual_or_risk",
    label: "Ручные и рискованные события",
    description: "Лучше добавлять в запрет anti-fraud, чтобы исключить тесты и корректировки.",
    intent: "block",
    tokens: [
      "manual",
      "cancel",
      "rollback",
      "refund",
      "delete",
      "edit",
      "test",
      "debug",
      "admin",
      "коррект",
      "отмен",
      "возврат",
      "тест",
      "удал",
      "ручн",
      "админ",
      "ошиб",
    ],
  },
];

const guestLogMappingPresetOptions: Array<{
  id: GuestGameGuestLogMappingPreset;
  label: string;
}> = [
  ...guestLogBusinessPresetDefinitions.map((definition) => ({
    id: definition.id as GuestGameGuestLogMappingPreset,
    label: definition.label,
  })),
  { id: "custom", label: "Свой смысл" },
];

function guestLogMappingDraftFromItem(
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

function guestLogBusinessPresets(
  items: GuestGameGuestLogCatalog["items"],
): GuestLogBusinessPreset[] {
  if (!items.length) {
    return [];
  }

  const mappedPresets = new Map<string, GuestLogBusinessPreset>();

  for (const item of items) {
    if (!item.mapping) {
      continue;
    }

    const definition = guestLogBusinessPresetDefinitions.find(
      (preset) => preset.id === item.mapping?.preset,
    );
    const id = `mapped:${item.mapping.preset}:${item.mapping.intent}`;
    const existing = mappedPresets.get(id) ?? {
      id,
      label:
        item.mapping.preset === "custom"
          ? item.mapping.label
          : definition?.label ?? item.mapping.label,
      description:
        item.mapping.note ??
        definition?.description ??
        "Сохраненное сопоставление raw-типа guests/logs.",
      intent: item.mapping.intent,
      tokens: [],
      types: [],
    };

    if (!existing.types.includes(item.type)) {
      existing.types.push(item.type);
    }

    mappedPresets.set(id, existing);
  }

  const autoPresets = guestLogBusinessPresetDefinitions
    .map((definition) => ({
      ...definition,
      types: Array.from(
        new Set(
          items
            .filter(
              (item) =>
                !item.mapping && guestLogTypeMatchesPreset(item, definition.tokens),
            )
            .map((item) => item.type),
        ),
      ),
    }))
    .filter((preset) => preset.types.length);

  return [...mappedPresets.values(), ...autoPresets];
}

function guestLogTypeMatchesPreset(
  item: GuestGameGuestLogCatalog["items"][number],
  tokens: string[],
) {
  const searchable = `${item.type} ${item.normalizedType}`.toLowerCase();

  return tokens.some((token) => searchable.includes(token.toLowerCase()));
}

type GuestLogEventOption = {
  value: string;
  label: string;
  description: string;
};

const fallbackGuestLogEventOptions: GuestLogEventOption[] = [
  {
    value: "visit",
    label: "Визит гостя",
    description: "Гость появился в клубе или был отмечен как посетитель.",
  },
  {
    value: "login",
    label: "Вход гостя",
    description: "Гость вошел в систему или был найден в логах авторизации.",
  },
  {
    value: "session_start",
    label: "Старт игровой сессии",
    description: "Начало игровой активности, если такой тип есть в guests/logs.",
  },
  {
    value: "tournament",
    label: "Турнир или событие",
    description: "Участие в турнире, ивенте или похожей клубной активности.",
  },
  {
    value: "manual_cancel",
    label: "Ручная отмена",
    description: "Служебное действие, обычно его добавляют в исключения.",
  },
  {
    value: "test",
    label: "Тестовое событие",
    description: "Тестовые логи, которые не должны выдавать реальные награды.",
  },
];

function guestLogEventOptions(
  catalog: GuestGameGuestLogCatalog,
  selectedValues: string[],
): GuestLogEventOption[] {
  const options = new Map<string, GuestLogEventOption>();

  for (const item of catalog.items) {
    const domainLabel = item.domains
      .slice(0, 2)
      .map((domain) => domain.domain)
      .join(", ");
    options.set(item.type, {
      value: item.type,
      label: item.mapping?.label
        ? `${item.mapping.label} · ${item.type}`
        : item.type,
      description: `${item.count} логов${
        domainLabel ? ` · ${domainLabel}` : ""
      }`,
    });
  }

  for (const fallback of fallbackGuestLogEventOptions) {
    if (!options.has(fallback.value)) {
      options.set(fallback.value, fallback);
    }
  }

  for (const value of selectedValues) {
    if (!options.has(value)) {
      options.set(value, {
        value,
        label: value,
        description: "Сохраненное значение из правила.",
      });
    }
  }

  return Array.from(options.values());
}

function missionMetricEventOptions(
  catalog: GuestGameGuestLogCatalog,
  selectedValues: string[],
): GuestLogEventOption[] {
  const options = new Map<string, GuestLogEventOption>();

  for (const option of dryRunEventOptions) {
    options.set(option.value, {
      value: option.value,
      label: option.label,
      description:
        triggerHelpText[option.value] ??
        "Событие игрового модуля или сохраненный факт Langame.",
    });
  }

  for (const option of guestLogEventOptions(catalog, selectedValues)) {
    if (!options.has(option.value)) {
      options.set(option.value, option);
    }
  }

  for (const value of selectedValues) {
    if (!options.has(value)) {
      options.set(value, {
        value,
        label: value,
        description: "Сохраненное значение из правила.",
      });
    }
  }

  return Array.from(options.values());
}

function SelectedGuestLogEvents({
  values,
  options,
  emptyLabel,
  onRemove,
}: {
  values: string[];
  options: GuestLogEventOption[];
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  if (!values.length) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => {
        const option = options.find((item) => item.value === value);

        return (
          <button
            key={value}
            type="button"
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-xs font-semibold text-emerald-900 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-200"
            title="Убрать событие из правила"
            onClick={() => onRemove(value)}
          >
            <span className="truncate">{option?.label ?? value}</span>
            <span aria-hidden="true" className="text-sm leading-none">
              x
            </span>
          </button>
        );
      })}
    </div>
  );
}

type GuestLogConditionPatch = {
  guestLogTypes?: string;
  blockedGuestLogTypes?: string;
};

function GuestLogConditionFields({
  guestLogTypes,
  blockedGuestLogTypes,
  catalog,
  onChange,
}: {
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  catalog: GuestGameGuestLogCatalog;
  onChange: (patch: GuestLogConditionPatch) => void;
}) {
  const suggestedTypes = catalog.items.slice(0, 14);
  const allowedValues = csvList(guestLogTypes);
  const blockedValues = csvList(blockedGuestLogTypes);
  const eventOptions = guestLogEventOptions(catalog, [
    ...allowedValues,
    ...blockedValues,
  ]);
  const businessPresets = guestLogBusinessPresets(catalog.items);
  const addAllowedType = (type: string) =>
    onChange({ guestLogTypes: appendCsvToken(guestLogTypes, type) });
  const addBlockedType = (type: string) =>
    onChange({
      blockedGuestLogTypes: appendCsvToken(blockedGuestLogTypes, type),
    });
  const removeAllowedType = (type: string) =>
    onChange({ guestLogTypes: removeCsvToken(guestLogTypes, type) });
  const removeBlockedType = (type: string) =>
    onChange({
      blockedGuestLogTypes: removeCsvToken(blockedGuestLogTypes, type),
    });
  const applyPreset = (preset: GuestLogBusinessPreset) => {
    if (preset.intent === "block") {
      onChange({
        blockedGuestLogTypes: appendCsvTokens(
          blockedGuestLogTypes,
          preset.types,
        ),
      });
      return;
    }

    onChange({ guestLogTypes: appendCsvTokens(guestLogTypes, preset.types) });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          События Langame для лутбокса
        </p>
        {catalog.summary.types ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {catalog.summary.types} типов · {catalog.summary.logs} событий ·{" "}
            {catalog.summary.domains} источников
          </p>
        ) : (
          <Link
            href="/sync?includeGuestLogs=1"
            className="text-xs font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
          >
            Загрузить события из Langame
          </Link>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Этот блок нужен только для лутбоксов, которые открываются по конкретным
        действиям гостя в Langame: вход, визит, турнир, отмена или другое
        сохраненное событие. Если лутбокс не зависит от таких событий, оставьте
        поля пустыми.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Какие события открывают лутбокс">
          <select
            className={fieldClass}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                addAllowedType(event.target.value);
              }
            }}
          >
            <option value="">Выберите событие</option>
            {eventOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={csvHasToken(guestLogTypes, option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            Выберите действия Langame, после которых гостю можно показать
            лутбокс.
          </OptionHelp>
          <SelectedGuestLogEvents
            values={allowedValues}
            options={eventOptions}
            emptyLabel="Пока не выбрано ни одного события для открытия."
            onRemove={removeAllowedType}
          />
        </Field>
        <Field label="Какие события не засчитывать">
          <select
            className={fieldClass}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                addBlockedType(event.target.value);
              }
            }}
          >
            <option value="">Выберите исключение</option>
            {eventOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={csvHasToken(blockedGuestLogTypes, option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            Добавьте тестовые, ручные или отмененные события, которые не должны
            выдавать награду.
          </OptionHelp>
          <SelectedGuestLogEvents
            values={blockedValues}
            options={eventOptions}
            emptyLabel="Исключения не выбраны."
            onRemove={removeBlockedType}
          />
        </Field>
      </div>
      {businessPresets.length ? (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-950 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              Готовые варианты
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Выберите бизнес-смысл, а технические значения Langame попадут в
              правило автоматически.
            </p>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {businessPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-lg border border-cyan-200 bg-white p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-zinc-950 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30"
                onClick={() => applyPreset(preset)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-950 dark:text-white">
                    {preset.label}
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                      preset.intent === "block"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                    ].join(" ")}
                  >
                    {preset.intent === "block" ? "исключить" : "открывает"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {preset.description}
                </span>
                <span className="mt-2 block truncate text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                  {preset.types.slice(0, 4).join(", ")}
                  {preset.types.length > 4 ? ` +${preset.types.length - 4}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {suggestedTypes.length ? (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Найденные события Langame
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {catalog.summary.latestAt
                ? `последний лог ${formatDate(catalog.summary.latestAt)}`
                : "по сохраненным snapshot-фактам"}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedTypes.map((item) => {
              const domainLabel = item.domains
                .slice(0, 2)
                .map((domain) => domain.domain)
                .join(", ");

              return (
                <span
                  key={item.normalizedType}
                  className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-emerald-200 bg-white text-xs shadow-sm dark:border-emerald-900/70 dark:bg-zinc-950"
                  title={`${item.count} логов${domainLabel ? ` · ${domainLabel}` : ""}`}
                >
                  <button
                    type="button"
                    className="max-w-48 truncate px-2.5 py-1.5 font-semibold text-zinc-800 transition hover:bg-emerald-100 hover:text-emerald-900 dark:text-zinc-100 dark:hover:bg-emerald-950"
                    onClick={() => addAllowedType(item.type)}
                  >
                    {item.type}
                  </button>
                  <span className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-400 dark:border-emerald-900/70">
                    {item.count}
                  </span>
                  <button
                    type="button"
                    className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-500 transition hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:hover:bg-red-950/30 dark:hover:text-red-200"
                    onClick={() => addBlockedType(item.type)}
                  >
                    запретить
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Нажатие на название добавляет событие как условие открытия.
            Кнопка `запретить` добавляет событие в список исключений.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MissionMetricEventField({
  value,
  catalog,
  onChange,
}: {
  value: string;
  catalog: GuestGameGuestLogCatalog;
  onChange: (value: string) => void;
}) {
  const selectedValues = csvList(value);
  const options = missionMetricEventOptions(catalog, selectedValues);

  return (
    <Field label="События">
      <select
        className={fieldClass}
        value=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(appendCsvToken(value, event.target.value));
          }
        }}
      >
        <option value="">Выберите событие</option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={csvHasToken(value, option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
      <OptionHelp>
        Можно выбрать несколько событий. Они будут считаться как прогресс
        миссии.
      </OptionHelp>
      <SelectedGuestLogEvents
        values={selectedValues}
        options={options}
        emptyLabel="События для прогресса пока не выбраны."
        onRemove={(eventType) => onChange(removeCsvToken(value, eventType))}
      />
    </Field>
  );
}

type ProductCategoryOption = {
  id: string;
  label: string;
};

function MissionProductMetricSelector({
  products,
  productIds,
  externalProductIds,
  categoryIds,
  categoryNames,
  onChange,
}: {
  products: Product[];
  productIds: string;
  externalProductIds: string;
  categoryIds: string;
  categoryNames: string;
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const selectedProductIds = csvList(productIds);
  const selectedExternalProductIds = csvList(externalProductIds);
  const selectedCategoryIds = csvList(categoryIds);
  const selectedCategoryNames = csvList(categoryNames);
  const categoryOptions = useMemo(
    () => productCategoryOptions(products, selectedCategoryIds, selectedCategoryNames),
    [products, selectedCategoryIds, selectedCategoryNames],
  );
  const filteredProducts = useMemo(
    () =>
      filterProductsForMission(products, productQuery, selectedProductIds).slice(
        0,
        10,
      ),
    [products, productQuery, selectedProductIds],
  );
  const filteredCategories = useMemo(
    () =>
      filterCategoryOptions(
        categoryOptions,
        categoryQuery,
        selectedCategoryIds,
        selectedCategoryNames,
      ).slice(0, 10),
    [categoryOptions, categoryQuery, selectedCategoryIds, selectedCategoryNames],
  );
  const selectedProducts = selectedProductIds.map((id) => ({
    value: id,
    label:
      products.find((product) => product.id === id)?.name ??
      "Сохраненный товар",
  }));
  const selectedCategories = selectedCategoryIds.map((id) => {
    const option = categoryOptions.find((category) => category.id === id);

    return {
      value: id,
      label: option?.label ?? "Сохраненная категория",
    };
  });
  const selectedNameCategories = selectedCategoryNames
    .filter(
      (name) =>
        !selectedCategoryIds.some((id) => {
          const option = categoryOptions.find((category) => category.id === id);
          return option?.label === name;
        }),
    )
    .map((name) => ({ value: name, label: name }));

  function selectProduct(product: Product) {
    onChange({ metricProductIds: appendCsvToken(productIds, product.id) });
    setProductQuery("");
  }

  function selectCategory(category: ProductCategoryOption) {
    onChange({
      metricCategoryIds: appendCsvToken(categoryIds, category.id),
      metricCategoryNames: appendCsvToken(categoryNames, category.label),
    });
    setCategoryQuery("");
  }

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Товары
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Найдите товар по названию или артикулу. В правило попадет внутренний
          идентификатор, но сотруднику он не нужен.
        </p>
        <input
          className={fieldClass}
          placeholder="Начните вводить название товара"
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
        />
        {productQuery.trim() ? (
          <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            {filteredProducts.length ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                  onClick={() => selectProduct(product)}
                >
                  <span className="block font-semibold text-zinc-950 dark:text-white">
                    {product.name}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {product.article ? `Артикул ${product.article}` : "без артикула"}
                    {product.category?.name ? ` · ${product.category.name}` : ""}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Товар не найден в текущем ассортименте.
              </p>
            )}
          </div>
        ) : null}
        <SelectionChips
          items={selectedProducts}
          emptyLabel={
            products.length
              ? "Конкретные товары не выбраны."
              : "Ассортимент недоступен или пока пуст."
          }
          onRemove={(productId) =>
            onChange({ metricProductIds: removeCsvToken(productIds, productId) })
          }
        />
        {selectedExternalProductIds.length ? (
          <div className="mt-2">
            <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Сохраненные товары Langame
            </p>
            <SelectionChips
              items={selectedExternalProductIds.map((id) => ({
                value: id,
                label: "Сохраненный товар Langame",
              }))}
              emptyLabel=""
              onRemove={(externalId) =>
                onChange({
                  metricExternalProductIds: removeCsvToken(
                    externalProductIds,
                    externalId,
                  ),
                })
              }
            />
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Категории товаров
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Выберите категорию, если миссия должна считать любую покупку из этой
          группы.
        </p>
        <input
          className={fieldClass}
          placeholder="Найти категорию"
          value={categoryQuery}
          onChange={(event) => setCategoryQuery(event.target.value)}
        />
        {categoryQuery.trim() ? (
          <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            {filteredCategories.length ? (
              filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm font-semibold transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                  onClick={() => selectCategory(category)}
                >
                  {category.label}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Категория не найдена.
              </p>
            )}
          </div>
        ) : null}
        <SelectionChips
          items={[...selectedCategories, ...selectedNameCategories]}
          emptyLabel="Категории не выбраны."
          onRemove={(value) => {
            const option = categoryOptions.find((category) => category.id === value);

            onChange({
              metricCategoryIds: removeCsvToken(categoryIds, value),
              metricCategoryNames: removeCsvToken(
                categoryNames,
                option?.label ?? value,
              ),
            });
          }}
        />
      </div>
    </div>
  );
}

function filterProductsForMission(
  products: Product[],
  query: string,
  selectedProductIds: string[],
) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return products.filter((product) => {
    if (selectedProductIds.includes(product.id)) {
      return false;
    }

    return [
      product.name,
      product.article,
      product.category?.name,
      product.supplier?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  });
}

function productCategoryOptions(
  products: Product[],
  selectedCategoryIds: string[],
  selectedCategoryNames: string[],
): ProductCategoryOption[] {
  const map = new Map<string, ProductCategoryOption>();

  for (const product of products) {
    if (product.categoryId && product.category?.name) {
      map.set(product.categoryId, {
        id: product.categoryId,
        label: product.category.name,
      });
    }
  }

  for (const id of selectedCategoryIds) {
    if (!map.has(id)) {
      map.set(id, { id, label: "Сохраненная категория" });
    }
  }

  for (const name of selectedCategoryNames) {
    if (![...map.values()].some((option) => option.label === name)) {
      map.set(`name:${name}`, { id: `name:${name}`, label: name });
    }
  }

  return [...map.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "ru"),
  );
}

function filterCategoryOptions(
  categories: ProductCategoryOption[],
  query: string,
  selectedCategoryIds: string[],
  selectedCategoryNames: string[],
) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return categories.filter(
    (category) =>
      !selectedCategoryIds.includes(category.id) &&
      !selectedCategoryNames.includes(category.label) &&
      category.label.toLowerCase().includes(normalized),
  );
}

function SelectionChips({
  items,
  emptyLabel,
  onRemove,
}: {
  items: Array<{ value: string; label: string }>;
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  if (!items.length) {
    return emptyLabel ? (
      <p className="mt-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyLabel}
      </p>
    ) : null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={`${item.value}-${item.label}`}
          type="button"
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-xs font-semibold text-emerald-900 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-200"
          title="Убрать из правила"
          onClick={() => onRemove(item.value)}
        >
          <span className="truncate">{item.label}</span>
          <span aria-hidden="true" className="text-sm leading-none">
            x
          </span>
        </button>
      ))}
    </div>
  );
}

function TariffConditionSelect({
  label,
  emptyLabel,
  items,
  value,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  items: GuestGameTariffSnapshotEndpoint["typedItems"];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {items.map((item) => (
          <option key={`${item.domain}-${tariffItemValue(item)}`} value={tariffItemValue(item)}>
            {tariffItemLabel(item)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function LinkSelect<T extends { id: string; name: string }>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: T[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Не связан</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={`${label} JSON`}>
      <textarea
        className={`${fieldClass} min-h-32 font-mono text-xs leading-relaxed`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-base font-bold text-zinc-950 dark:text-white">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold text-zinc-950 dark:text-white">{title}</h2>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-100 p-2 dark:bg-zinc-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {text}
    </div>
  );
}

function profileToForm(profile: GuestGameProfile): ProfileForm {
  return {
    guestId: profile.guest?.id ?? "",
    leadId: profile.lead?.id ?? "",
    displayName: profile.displayName,
    contactMasked: profile.contactMasked ?? "",
    telegramIdentity: profile.telegramIdentity ?? "",
    maxIdentity: profile.maxIdentity ?? "",
    xp: String(profile.xp),
    level: String(profile.level),
    status: profile.status,
  };
}

function lootBoxToForm(lootBox: GuestGameLootBox): LootBoxForm {
  return {
    name: lootBox.name,
    status: lootBox.status,
    triggerKind: lootBox.triggerKind,
    rewardType: lootBox.rewardType,
    rewardAmount: moneyFormValue(lootBox.rewardAmount),
    rewardLabel: lootBox.rewardLabel ?? "",
    audienceId: lootBox.audience?.id ?? "",
    segment: lootBox.segment ?? "",
    sessionType: lootBox.sessionType ?? "",
    packetMode: stringRule(lootBox.periodRules, "packetMode", "ANY"),
    tariffGroupId: stringRule(lootBox.periodRules, "tariffGroupId", ""),
    tariffPeriodId: stringRule(lootBox.periodRules, "tariffPeriodId", ""),
    tariffTypeId: stringRule(lootBox.periodRules, "tariffTypeId", ""),
    guestLogTypes: stringListRule(lootBox.periodRules, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      lootBox.periodRules,
      "blockedGuestLogTypes",
    ),
    storeIds: lootBox.storeIds,
    quietHoursEnabled: booleanRule(lootBox.periodRules, "quietHoursEnabled", true),
    weekdaysOnly: booleanRule(lootBox.periodRules, "weekdaysOnly", true),
    timeWindowMode: lootBoxTimeWindowMode(lootBox.periodRules),
    weekdayMode: lootBoxWeekdayMode(lootBox.periodRules),
    selectedWeekdays: lootBoxSelectedWeekdays(lootBox.periodRules),
    hourFrom: timeWindowPart(lootBox.periodRules, 0, "10:00"),
    hourTo: timeWindowPart(lootBox.periodRules, 1, "16:00"),
    perGuestPerWeek: numberRule(lootBox.limits, "perGuestPerWeek", ""),
    totalPerDay: numberRule(lootBox.limits, "totalPerDay", "30"),
    prizes: lootBoxPrizesToForm(
      lootBox.probabilityRules,
      {
        rewardType: lootBox.rewardType,
        rewardAmount: moneyFormValue(lootBox.rewardAmount),
        rewardLabel: lootBox.rewardLabel ?? lootBox.name,
      },
    ),
    requireCashierConfirmation: booleanRule(
      lootBox.antiFraudRules,
      "requiresCashierConfirmation",
      true,
    ),
    oneDevicePerGuest: booleanRule(
      lootBox.antiFraudRules,
      "oneDevicePerGuest",
      true,
    ),
    periodRulesText: jsonFormValue(lootBox.periodRules),
    limitsText: jsonFormValue(lootBox.limits),
    probabilityRulesText: jsonFormValue(
      lootBox.probabilityRules,
      defaultLootBoxForm.probabilityRulesText,
    ),
    budgetAmount: moneyFormValue(lootBox.budgetAmount),
    antiFraudText: jsonFormValue(lootBox.antiFraudRules),
    manualApprovalRequired: lootBox.manualApprovalRequired,
    note: lootBox.note ?? "",
  };
}

function missionToForm(mission: GuestGameMission): MissionForm {
  const savedQuestSteps = missionQuestSteps(mission.conditions);
  const questSteps = savedQuestSteps.length
    ? cloneMissionQuestSteps(savedQuestSteps)
    : cloneMissionQuestSteps(defaultMissionQuestSteps);

  return {
    name: mission.name,
    status: mission.status,
    missionType: mission.missionType,
    triggerKind: mission.triggerKind,
    rewardType: mission.rewardType,
    rewardAmount: moneyFormValue(mission.rewardAmount),
    rewardLabel: mission.rewardLabel ?? "",
    xpReward: String(mission.xpReward),
    progressTarget: mission.progressTarget ? String(mission.progressTarget) : "",
    progressUnit: mission.progressUnit ?? "",
    audienceId: mission.audience?.id ?? "",
    storeIds: mission.storeIds,
    periodFrom: dateInputValue(mission.periodFrom),
    periodTo: dateInputValue(mission.periodTo),
    budgetAmount: moneyFormValue(mission.budgetAmount),
    perGuestLimit: mission.perGuestLimit ? String(mission.perGuestLimit) : "",
    totalRewardLimit: mission.totalRewardLimit
      ? String(mission.totalRewardLimit)
      : "",
    sessionType: stringRule(mission.conditions, "sessionType", ""),
    packetMode: stringRule(mission.conditions, "packetMode", "ANY"),
    tariffGroupId: stringRule(mission.conditions, "tariffGroupId", ""),
    tariffPeriodId: stringRule(mission.conditions, "tariffPeriodId", ""),
    tariffTypeId: stringRule(mission.conditions, "tariffTypeId", ""),
    guestLogTypes: stringListRule(mission.conditions, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      mission.antiFraudRules,
      "blockedGuestLogTypes",
    ),
    metricAggregation: stringRule(
      metricRule(mission.conditions),
      "aggregation",
      "count",
    ),
    metricEventTypes: stringListRule(metricRule(mission.conditions), "eventTypes"),
    metricHours: stringListRule(metricRule(mission.conditions), "hours"),
    metricProductIds: stringListRule(metricRule(mission.conditions), "productIds"),
    metricExternalProductIds: stringListRule(
      metricRule(mission.conditions),
      "externalProductIds",
    ),
    metricCategoryIds: stringListRule(metricRule(mission.conditions), "categoryIds"),
    metricCategoryNames: stringListRule(
      metricRule(mission.conditions),
      "categoryNames",
    ),
    windowDays: numberRule(mission.conditions, "windowDays", "7"),
    weekdaysOnly: booleanRule(mission.conditions, "weekdaysOnly", true),
    minSessionMinutes: numberRule(mission.conditions, "minSessionMinutes", "90"),
    minSpendAmount: numberRule(mission.conditions, "minSpendAmount", "0"),
    questEnabled: missionQuestEnabled(mission.conditions),
    questSteps,
    requireLangameFact: booleanRule(
      mission.conditions,
      "requiresLangameFact",
      true,
    ),
    denySameDayRepeat: booleanRule(
      mission.antiFraudRules,
      "denySameDayRepeat",
      true,
    ),
    requireCashierConfirmation: booleanRule(
      mission.antiFraudRules,
      "requiresCashierConfirmation",
      true,
    ),
    conditionsText: jsonFormValue(
      mission.conditions,
      defaultMissionForm.conditionsText,
    ),
    antiFraudText: jsonFormValue(mission.antiFraudRules),
    manualApprovalRequired: mission.manualApprovalRequired,
    note: mission.note ?? "",
  };
}

function seasonToForm(season: GuestGameSeason): SeasonForm {
  return {
    name: season.name,
    status: season.status,
    seasonType: season.seasonType,
    audienceId: season.audience?.id ?? "",
    storeIds: season.storeIds,
    periodFrom: dateInputValue(season.periodFrom),
    periodTo: dateInputValue(season.periodTo),
    xpVisit: numberRule(season.xpRules, "visit", "20"),
    xpCheckIn: numberRule(season.xpRules, "checkIn", "20"),
    xpPlayHour: numberRule(season.xpRules, "playHour", "10"),
    xpBarPurchase: numberRule(season.xpRules, "barPurchase", "25"),
    xpMissionCompletion: numberRule(
      season.xpRules,
      "missionCompletion",
      "50",
    ),
    xpPacketSessionBonus: numberRule(
      season.xpRules,
      "packetSessionBonus",
      "15",
    ),
    xpGuestLog: numberRule(season.xpRules, "guestLog", "5"),
    sessionType: stringRule(season.xpRules, "sessionType", ""),
    packetMode: stringRule(season.xpRules, "packetMode", "ANY"),
    tariffGroupId: stringRule(season.xpRules, "tariffGroupId", ""),
    tariffPeriodId: stringRule(season.xpRules, "tariffPeriodId", ""),
    tariffTypeId: stringRule(season.xpRules, "tariffTypeId", ""),
    guestLogTypes: stringListRule(season.xpRules, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      season.xpRules,
      "blockedGuestLogTypes",
    ),
    levelCount: String(arrayRule(season.levels).length || 4),
    xpPerLevel: seasonLevelStep(season.levels, "250"),
    freeRewardEvery: rewardFrequency(season.freeRewards, "2"),
    premiumRewardEvery: rewardFrequency(season.premiumRewards, "2"),
    freeRewardLabel: rewardLabel(season.freeRewards, "Промокод бара"),
    premiumRewardLabel: rewardLabel(season.premiumRewards, "Усиленный промокод"),
    xpRulesText: jsonFormValue(season.xpRules, defaultSeasonForm.xpRulesText),
    levelsText: jsonFormValue(season.levels, defaultSeasonForm.levelsText),
    freeRewardsText: jsonFormValue(season.freeRewards),
    premiumRewardsText: jsonFormValue(season.premiumRewards),
    premiumEnabled: season.premiumEnabled,
    premiumUpgradeMode: season.premiumUpgradeMode ?? "",
    budgetAmount: moneyFormValue(season.budgetAmount),
    manualApprovalRequired: season.manualApprovalRequired,
    note: season.note ?? "",
  };
}

function rewardToForm(reward: GuestGameReward): RewardForm {
  return {
    profileId: reward.profile?.id ?? "",
    guestId: reward.guest?.id ?? "",
    lootBoxId: reward.lootBox?.id ?? "",
    missionId: reward.mission?.id ?? "",
    seasonId: reward.season?.id ?? "",
    storeId: reward.store?.id ?? "",
    status: reward.status,
    source: reward.source,
    rewardType: reward.rewardType,
    rewardAmount: String(reward.rewardAmount),
    rewardLabel: reward.rewardLabel,
    rewardCode: reward.rewardCode ?? "",
    expiresAt: dateInputValue(reward.expiresAt),
    note: reward.note ?? "",
    evidenceText: jsonFormValue(reward.evidence),
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Ошибка запроса");
  }

  return response.json() as Promise<T>;
}

function postJson<T = unknown>(url: string, body: unknown) {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchJson<T = unknown>(url: string, body: unknown) {
  return fetchJson<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteJson<T = unknown>(url: string) {
  return fetchJson<T>(url, {
    method: "DELETE",
  });
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function csvList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function appendCsvToken(current: string, token: string) {
  return appendCsvTokens(current, [token]);
}

function appendCsvTokens(current: string, tokens: string[]) {
  const values = csvList(current);
  const existing = new Set(values.map((value) => value.toLowerCase()));
  const nextValues = [...values];

  for (const token of tokens) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      continue;
    }

    const key = normalizedToken.toLowerCase();

    if (existing.has(key)) {
      continue;
    }

    existing.add(key);
    nextValues.push(normalizedToken);
  }

  return nextValues.join(", ");
}

function removeCsvToken(current: string, token: string) {
  const key = token.trim().toLowerCase();

  if (!key) {
    return csvList(current).join(", ");
  }

  return csvList(current)
    .filter((value) => value.toLowerCase() !== key)
    .join(", ");
}

function csvHasToken(current: string, token: string) {
  const key = token.trim().toLowerCase();

  return (
    Boolean(key) &&
    csvList(current).some((value) => value.toLowerCase() === key)
  );
}

function buildLootBoxPeriodRules(form: LootBoxForm) {
  const start = form.hourFrom || "00:00";
  const end = form.hourTo || "23:59";
  const usesTimeWindow = form.timeWindowMode !== "ANY";
  const weekdays =
    form.weekdayMode === "ANY" ? [] : lootBoxWeekdaysForMode(form);

  return {
    source: "business_controls",
    timeWindowMode: form.timeWindowMode,
    weekdayMode: form.weekdayMode,
    quietHoursEnabled: usesTimeWindow,
    weekdaysOnly: form.weekdayMode === "WEEKDAYS",
    weekdays,
    hours: usesTimeWindow ? [`${start}-${end}`] : [],
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
  };
}

function buildLootBoxLimits(form: LootBoxForm) {
  const perGuestPerWeek = optionalNumber(form.perGuestPerWeek);
  const totalPerDay = optionalNumber(form.totalPerDay);

  return {
    source: "business_controls",
    ...(perGuestPerWeek == null ? {} : { perGuestPerWeek }),
    ...(totalPerDay == null ? {} : { totalPerDay }),
  };
}

function buildLootBoxProbabilityRules(form: LootBoxForm) {
  const prizes = form.prizes
    .map((prize) => {
      const rewardType = canonicalLootBoxRewardType(
        prize.rewardType || "PROMOCODE",
      );
      const rewardLabel = prize.rewardLabel.trim();
      const chancePercent = Math.max(0, numeric(prize.chancePercent, 0));

      return {
        rewardType,
        rewardAmount: optionalNumber(prize.rewardAmount) ?? 0,
        rewardLabel:
          rewardLabel ||
          rewardTypeLabelFromValue(rewardType) ||
          "Награда лутбокса",
        chancePercent,
        weight: chancePercent,
      };
    })
    .filter(
      (prize) =>
        prize.rewardLabel.trim() ||
        prize.rewardAmount > 0 ||
        prize.rewardType,
    );
  const safePrizes = prizes.length
    ? prizes
    : [
        {
          ...primaryLootBoxPrize(form),
          rewardAmount: optionalNumber(primaryLootBoxPrize(form).rewardAmount) ?? 0,
          chancePercent: 100,
          weight: 100,
        },
      ];
  const totalChancePercent = safePrizes.reduce(
    (total, prize) => total + prize.chancePercent,
    0,
  );

  return {
    type: "weighted",
    source: "business_controls",
    totalChancePercent: Math.round(totalChancePercent * 100) / 100,
    prizes: safePrizes,
    items: safePrizes.map((prize) => ({
      label: prize.rewardLabel,
      weight: prize.weight,
    })),
  };
}

function buildLootBoxAntiFraudRules() {
  return {
    source: "business_controls",
  };
}

function buildMissionConditions(form: MissionForm) {
  const questSteps = buildMissionQuestSteps(form);
  const metric = {
    aggregation: form.metricAggregation || "count",
    eventTypes: csvList(form.metricEventTypes),
    hours: csvList(form.metricHours),
    productIds: csvList(form.metricProductIds),
    externalProductIds: csvList(form.metricExternalProductIds),
    categoryIds: csvList(form.metricCategoryIds),
    categoryNames: csvList(form.metricCategoryNames),
    target: optionalNumber(form.progressTarget),
    windowDays: optionalNumber(form.windowDays),
  };

  return {
    source: "business_controls",
    metric,
    windowDays: optionalNumber(form.windowDays),
    weekdaysOnly: form.weekdaysOnly,
    sessionType: nullable(form.sessionType),
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    minSessionMinutes: optionalNumber(form.minSessionMinutes),
    minSpendAmount: optionalNumber(form.minSpendAmount),
    requiresLangameFact: form.requireLangameFact,
    progressTarget: optionalNumber(form.progressTarget),
    progressUnit: nullable(form.progressUnit),
    questEnabled: form.questEnabled && questSteps.length > 0,
    questMode: form.questEnabled && questSteps.length > 0 ? "CHAIN" : "SINGLE",
    questSteps,
  };
}

function buildMissionQuestSteps(form: MissionForm) {
  if (!form.questEnabled) {
    return [];
  }

  const unit = nullable(form.progressUnit) ?? "шаг";
  const steps = form.questSteps.length
    ? form.questSteps
    : defaultMissionQuestSteps.slice(0, 1);

  return steps
    .map((step, index) => {
      const missionId = nullable(step.missionId);

      return {
        id: `step-${index + 1}`,
        title: step.title.trim(),
        target: index + 1,
        unit,
        ...(missionId
          ? {
              missionId,
              templateMissionId: missionId,
            }
          : {}),
      };
    })
    .filter((step) => step.title.length > 0);
}

function buildMissionAntiFraudRules(form: MissionForm) {
  return {
    source: "business_controls",
    denySameDayRepeat: form.denySameDayRepeat,
    requiresCashierConfirmation: form.requireCashierConfirmation,
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
    perGuestLimit: optionalNumber(form.perGuestLimit),
    totalRewardLimit: optionalNumber(form.totalRewardLimit),
  };
}

function buildSeasonXpRules(form: SeasonForm) {
  return {
    source: "business_controls",
    visit: numeric(form.xpVisit, 0),
    checkIn: numeric(form.xpCheckIn, numeric(form.xpVisit, 0)),
    playHour: numeric(form.xpPlayHour, 0),
    barPurchase: numeric(form.xpBarPurchase, 0),
    missionCompletion: numeric(form.xpMissionCompletion, 0),
    packetSessionBonus: numeric(form.xpPacketSessionBonus, 0),
    guestLog: numeric(form.xpGuestLog, 0),
    sessionType: nullable(form.sessionType),
    packetMode: form.packetMode,
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    blockedGuestLogTypes: csvList(form.blockedGuestLogTypes),
  };
}

function buildSeasonLevels(form: SeasonForm) {
  const levelCount = Math.max(1, numeric(form.levelCount, 1));
  const xpPerLevel = Math.max(1, numeric(form.xpPerLevel, 1));

  return Array.from({ length: levelCount }, (_, index) => {
    const level = index + 1;
    return {
      level,
      xp: index * xpPerLevel,
      freeReward: levelRewardLabel(level, form.freeRewardEvery, form.freeRewardLabel),
      premiumReward: levelRewardLabel(
        level,
        form.premiumRewardEvery,
        form.premiumRewardLabel,
      ),
    };
  });
}

function buildSeasonRewards(form: SeasonForm, track: "free" | "premium") {
  const levelCount = Math.max(1, numeric(form.levelCount, 1));
  const every = numeric(
    track === "free" ? form.freeRewardEvery : form.premiumRewardEvery,
    0,
  );
  const label =
    track === "free" ? form.freeRewardLabel : form.premiumRewardLabel;

  if (!every || !label.trim()) {
    return [];
  }

  return Array.from({ length: levelCount }, (_, index) => index + 1)
    .filter((level) => level % every === 0)
    .map((level) => ({ level, reward: label.trim(), track }));
}

function levelRewardLabel(level: number, everyValue: string, label: string) {
  const every = numeric(everyValue, 0);
  return every && label.trim() && level % every === 0 ? label.trim() : null;
}

function numeric(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function arrayRule(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberArrayRule(value: unknown, key: string) {
  return arrayRule(asRecord(value)[key])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function sortWeekdays(value: number[]) {
  const order = new Map(weekdayOptions.map((item, index) => [item.value, index]));

  return Array.from(new Set(value))
    .filter((item) => order.has(item))
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function sameWeekdays(left: number[], right: number[]) {
  const leftSorted = sortWeekdays(left);
  const rightSorted = sortWeekdays(right);

  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((item, index) => item === rightSorted[index])
  );
}

function lootBoxTimeWindowMode(value: unknown): LootBoxTimeWindowMode {
  const record = asRecord(value);
  const storedMode = record.timeWindowMode;
  const hours = arrayRule(record.hours).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  if (
    storedMode === "ANY" ||
    storedMode === "QUIET_HOURS" ||
    storedMode === "CUSTOM"
  ) {
    return storedMode;
  }

  if (!hours.length && record.quietHoursEnabled !== true) {
    return "ANY";
  }

  return record.quietHoursEnabled === true ? "QUIET_HOURS" : "CUSTOM";
}

function lootBoxWeekdayMode(value: unknown): LootBoxWeekdayMode {
  const record = asRecord(value);
  const storedMode = record.weekdayMode;
  const weekdays = numberArrayRule(value, "weekdays");

  if (
    storedMode === "ANY" ||
    storedMode === "WEEKDAYS" ||
    storedMode === "WEEKENDS" ||
    storedMode === "CUSTOM"
  ) {
    return storedMode;
  }

  if (sameWeekdays(weekdays, weekdayPresets.WEEKDAYS)) {
    return "WEEKDAYS";
  }

  if (sameWeekdays(weekdays, weekdayPresets.WEEKENDS)) {
    return "WEEKENDS";
  }

  if (!weekdays.length || sameWeekdays(weekdays, weekdayPresets.ANY)) {
    return record.weekdaysOnly === true ? "WEEKDAYS" : "ANY";
  }

  return "CUSTOM";
}

function lootBoxSelectedWeekdays(value: unknown) {
  const mode = lootBoxWeekdayMode(value);
  const weekdays = numberArrayRule(value, "weekdays");

  if (mode === "CUSTOM") {
    return sortWeekdays(weekdays.length ? weekdays : weekdayPresets.CUSTOM);
  }

  return weekdayPresets[mode];
}

function lootBoxWeekdaysForMode(form: LootBoxForm) {
  if (form.weekdayMode === "CUSTOM") {
    return sortWeekdays(
      form.selectedWeekdays.length
        ? form.selectedWeekdays
        : weekdayPresets.CUSTOM,
    );
  }

  return weekdayPresets[form.weekdayMode];
}

function metricRule(value: unknown) {
  const record = asRecord(value);
  return asRecord(record.metric ?? record.progressMetric);
}

function numberRule(value: unknown, key: string, fallback: string) {
  const raw = asRecord(value)[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }
  return fallback;
}

function stringRule(value: unknown, key: string, fallback: string) {
  const raw = asRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function stringListRule(value: unknown, key: string, fallback = "") {
  const raw = asRecord(value)[key];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(", ");
  }

  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function rewardTypeLabelFromValue(value: string) {
  return optionLabel(rewardTypeLabelOptions, value);
}

function canonicalLootBoxRewardType(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return value;
  }

  if (
    [
      "BONUS",
      "BONUS_POINTS",
      "BONUS_BALANCE",
      "CASHBACK",
      "LOYALTY_BONUS",
    ].includes(normalized)
  ) {
    return "BONUS_BALANCE";
  }

  return normalized;
}

function missionTypeLabel(value: string) {
  return optionLabel(missionTypeOptions, value);
}

function tariffItemsByEndpoint(
  snapshots: GuestGameTariffSnapshotEndpoint[],
  endpointKey: string,
) {
  return (
    snapshots.find((snapshot) => snapshot.endpointKey === endpointKey)
      ?.typedItems ?? []
  );
}

function tariffItemValue(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  return item.externalId ?? item.id;
}

function tariffItemLabel(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  const label = item.label ?? item.name ?? item.externalId ?? item.id;
  return item.domain ? `${label} · ${item.domain}` : label;
}

function tariffRuleSummary(value: unknown) {
  const record = asRecord(value);
  const count = [
    record.tariffGroupId,
    record.tariffPeriodId,
    record.tariffTypeId,
  ].filter((item) => typeof item === "string" && item.trim()).length;

  return count ? `тарифы: ${count}` : "любой тариф";
}

function guestLogRuleSummary(conditions: unknown, antiFraud?: unknown) {
  const conditionRecord = asRecord(conditions);
  const antiFraudRecord = asRecord(antiFraud);
  const allowedCount = arrayRule(conditionRecord.guestLogTypes).filter(
    (item) => typeof item === "string" && item.trim(),
  ).length;
  const blockedCount = [
    ...arrayRule(conditionRecord.blockedGuestLogTypes),
    ...arrayRule(antiFraudRecord.blockedGuestLogTypes),
  ].filter((item) => typeof item === "string" && item.trim()).length;

  if (allowedCount && blockedCount) {
    return `logs: ${allowedCount} / anti-fraud ${blockedCount}`;
  }
  if (allowedCount) {
    return `logs: ${allowedCount}`;
  }
  if (blockedCount) {
    return `anti-fraud logs: ${blockedCount}`;
  }
  return "любой log";
}

function missionQuestSteps(value: unknown) {
  const steps = asRecord(value).questSteps;
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((item, index) => {
      const record = asRecord(item);
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `step-${index + 1}`;
      const missionId =
        typeof record.missionId === "string" && record.missionId.trim()
          ? record.missionId.trim()
          : typeof record.templateMissionId === "string" &&
              record.templateMissionId.trim()
            ? record.templateMissionId.trim()
            : "";

      return title ? { id, title, missionId } : null;
    })
    .filter(
      (item): item is { id: string; title: string; missionId: string } =>
        Boolean(item),
    );
}

function missionQuestEnabled(value: unknown) {
  return booleanRule(value, "questEnabled", missionQuestSteps(value).length > 0);
}

function missionStepCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "шагов";
  }

  if (lastDigit === 1) {
    return "шаг";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "шага";
  }

  return "шагов";
}

function questRuleSummary(value: unknown) {
  const steps = missionQuestSteps(value);
  const templateCount = steps.filter((step) => step.missionId).length;

  if (!steps.length) {
    return "один шаг";
  }

  return templateCount
    ? `квест: ${steps.length} ${missionStepCountLabel(
        steps.length,
      )}, ${templateCount} шабл.`
    : `квест: ${steps.length} ${missionStepCountLabel(steps.length)}`;
}

function missionMetricSummary(value: unknown) {
  const metric = metricRule(value);
  const aggregation = stringRule(metric, "aggregation", "count");
  const labels: Record<string, string> = {
    count: "счетчик",
    sum: "сумма",
    duration: "минуты",
    distinctDays: "дни",
    exists: "факт",
  };
  const eventTypes = stringListRule(metric, "eventTypes");

  return eventTypes
    ? `${labels[aggregation] ?? aggregation}: ${eventTypes}`
    : labels[aggregation] ?? aggregation;
}

function booleanRule(value: unknown, key: string, fallback: boolean) {
  const raw = asRecord(value)[key];
  return typeof raw === "boolean" ? raw : fallback;
}

function timeWindowPart(value: unknown, part: 0 | 1, fallback: string) {
  const hours = asRecord(value).hours;
  if (Array.isArray(hours) && typeof hours[0] === "string") {
    return hours[0].split("-")[part]?.trim() || fallback;
  }

  return fallback;
}

function lootBoxPrizesToForm(
  value: unknown,
  fallback: Pick<LootBoxPrizeForm, "rewardType" | "rewardAmount" | "rewardLabel">,
): LootBoxPrizeForm[] {
  const record = asRecord(value);
  const prizes = Array.isArray(record.prizes) ? record.prizes : [];
  const items = Array.isArray(record.items) ? record.items : [];
  const source = prizes.length ? prizes : items;
  const mapped = source
    .map((item, index) => lootBoxPrizeFromRuleItem(item, index, fallback))
    .filter((item): item is LootBoxPrizeForm => Boolean(item));

  if (mapped.length) {
    return mapped;
  }

  if (fallback.rewardLabel || fallback.rewardType || fallback.rewardAmount) {
    return [
      {
        id: "fallback-prize",
        rewardType: canonicalLootBoxRewardType(
          fallback.rewardType || "PROMOCODE",
        ),
        rewardAmount: fallback.rewardAmount || "0",
        rewardLabel: fallback.rewardLabel || "Награда лутбокса",
        chancePercent: "100",
      },
    ];
  }

  return defaultLootBoxPrizes.map((prize) => ({ ...prize }));
}

function lootBoxPrizeFromRuleItem(
  value: unknown,
  index: number,
  fallback: Pick<LootBoxPrizeForm, "rewardType" | "rewardAmount" | "rewardLabel">,
): LootBoxPrizeForm | null {
  const record = asRecord(value);
  const rewardLabel = String(
    record.rewardLabel ?? record.label ?? fallback.rewardLabel ?? "",
  ).trim();

  if (!rewardLabel) {
    return null;
  }

  return {
    id: `rule-prize-${index}`,
    rewardType: canonicalLootBoxRewardType(
      String(
        record.rewardType ?? record.type ?? fallback.rewardType ?? "PROMOCODE",
      ),
    ),
    rewardAmount: numberFormValue(
      record.rewardAmount ?? record.amount ?? fallback.rewardAmount ?? "0",
    ),
    rewardLabel,
    chancePercent: numberFormValue(
      record.chancePercent ?? record.weight ?? record.probability ?? "0",
    ),
  };
}

function numberFormValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatChanceNumber(parsed) : "";
}

function lootBoxPrizePatch(
  form: LootBoxForm,
  prizes: LootBoxPrizeForm[],
): Partial<LootBoxForm> {
  const primary = primaryLootBoxPrize({ ...form, prizes });

  return {
    prizes,
    rewardType: primary.rewardType,
    rewardAmount: primary.rewardAmount,
    rewardLabel: primary.rewardLabel,
  };
}

function primaryLootBoxPrize(form: LootBoxForm) {
  const prize = form.prizes.find(
    (item) =>
      item.rewardLabel.trim() ||
      item.rewardAmount.trim() ||
      item.rewardType.trim(),
  );

  return {
    rewardType: canonicalLootBoxRewardType(
      prize?.rewardType || form.rewardType || "PROMOCODE",
    ),
    rewardAmount: prize?.rewardAmount || form.rewardAmount || "0",
    rewardLabel: prize?.rewardLabel || form.rewardLabel || "Награда лутбокса",
  };
}

function normalizeLootBoxPrizeChances(prizes: LootBoxPrizeForm[]) {
  if (!prizes.length) {
    return prizes;
  }

  const rawValues = prizes.map((prize) =>
    Math.max(0, numeric(prize.chancePercent, 0)),
  );
  const total = rawValues.reduce((sum, value) => sum + value, 0);
  const normalized =
    total > 0
      ? rawValues.map((value) => (value / total) * 100)
      : rawValues.map(() => 100 / prizes.length);
  const rounded = normalized.map((value) => Math.round(value * 100) / 100);
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const diff = Math.round((100 - roundedTotal) * 100) / 100;
  const lastIndex = rounded.length - 1;

  rounded[lastIndex] = Math.max(
    0,
    Math.round((rounded[lastIndex] + diff) * 100) / 100,
  );

  return prizes.map((prize, index) => ({
    ...prize,
    chancePercent: formatChanceNumber(rounded[index]),
  }));
}

function formatChanceNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
}

function seasonLevelStep(value: unknown, fallback: string) {
  const levels = arrayRule(value)
    .map((item) => asRecord(item))
    .filter((item) => typeof item.xp === "number") as Array<{
    xp: number;
  }>;

  if (levels.length < 2) {
    return fallback;
  }

  const step = levels[1].xp - levels[0].xp;
  return step > 0 ? String(step) : fallback;
}

function rewardFrequency(value: unknown, fallback: string) {
  const first = arrayRule(value)
    .map((item) => asRecord(item))
    .find((item) => typeof item.level === "number");

  return typeof first?.level === "number" ? String(first.level) : fallback;
}

function rewardLabel(value: unknown, fallback: string) {
  const first = arrayRule(value)
    .map((item) => asRecord(item))
    .find((item) => typeof item.reward === "string");

  return typeof first?.reward === "string" && first.reward.trim()
    ? first.reward
    : fallback;
}

function parseJson(text: string, label: string, allowEmpty = true) {
  const trimmed = text.trim();

  if (!trimmed) {
    if (allowEmpty) {
      return null;
    }

    throw new Error(`Заполните JSON: ${label}`);
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Проверьте JSON: ${label}`);
  }
}

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function jsonFormValue(value: unknown, fallback = "") {
  if (value == null) {
    return fallback;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function moneyFormValue(value: number | null) {
  return value == null ? "" : String(value);
}

function dateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);

  return local.toISOString().slice(0, 16);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${value} мин`;
  }

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value / 60)} ч`;
}

function economyKindLabel(
  kind: GuestGamificationWorkspace["economy"]["scenarios"][number]["kind"],
) {
  switch (kind) {
    case "LOOT_BOX":
      return "Лутбокс";
    case "MISSION":
      return "Миссия";
    case "SEASON":
      return "Battle Pass";
    case "MANUAL":
    default:
      return "Ручное";
  }
}

function economyStatusLabel(
  status: GuestGamificationWorkspace["economy"]["scenarios"][number]["status"],
) {
  return statusLabels[status as GuestGameStatus] ?? status;
}

function economyUsageClass(value: number | null) {
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

function integrationReadinessStatusClass(
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

function pilotRunbookStageClass(
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

function pilotLedgerPreflightStatusClass(
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

function pilotFirstBonusReconciliationClass(
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

function bonusLedgerStatusClass(status: string) {
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

function bonusLedgerReconciliationClass(
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

function bonusBalanceCurrentReconciliationClass(
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

function communicationQueueStatusClass(
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

function sessionTypeLabel(value: string | null) {
  return (
    sessionTypeOptions.find((option) => option.value === (value ?? ""))?.label ??
    value ??
    "любой тип"
  );
}

function packetModeLabel(value: string | null) {
  return (
    packetModeOptions.find((option) => option.value === (value ?? "ANY"))
      ?.label ??
    value ??
    "любой формат"
  );
}

function packetStateLabel(value: boolean | null) {
  if (value === true) {
    return "пакет часов";
  }
  if (value === false) {
    return "обычная";
  }
  return "не указано";
}

function tariffSnapshotStatusLabel(status: GuestGameTariffSnapshotStatus) {
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

function tariffSnapshotStatusClass(status: GuestGameTariffSnapshotStatus) {
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

function formatDate(value: string | null) {
  if (!value) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
