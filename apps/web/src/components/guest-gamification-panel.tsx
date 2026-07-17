"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { GuestGamificationVisualEditor } from "@/components/guest-gamification-visual-editor";
import {
  BattlePassStepConditionEditor,
  defaultBattlePassStepCondition,
  type BattlePassStepConditionValue,
} from "@/components/battle-pass-step-condition-editor";
import { normalizeExternalActionUrl } from "@/lib/external-links";
import type {
  GuestAudience,
  GuestCrmLead,
  GuestDashboardRow,
} from "@/lib/guests";
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
  GuestGameLootBoxUsageKind,
  GuestGameMission,
  GuestGamePilotRunbookAction,
  GuestGamePromoCard,
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
  | "checkIn"
  | "seasons"
  | "promoCards"
  | "rewards"
  | "testRun";

export type EditorMode = "advanced" | "visual";

type RuleTemplateType = "loot-boxes" | "missions" | "seasons" | "promo-cards";

const PROMO_BANNER_DISPLAY_LIMIT = 4;
const PROMO_BANNER_IMAGE_WIDTH = 720;
const PROMO_BANNER_IMAGE_HEIGHT = 1280;
const PROMO_BANNER_MAX_DATA_URL_LENGTH = 2_400_000;
const promoBannerJpegQualities = [0.78, 0.68, 0.58] as const;

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

type RuleDeleteBlockedModal = {
  title: string;
  message: string;
  stores: string[];
};

type RuleDeleteRequestModal = {
  type: RuleTemplateType;
  id: string;
  name: string;
  label: string;
};

type RuleDeleteActivityModal = RuleDeleteRequestModal & {
  message: string;
  stores: string[];
};

type RuleActivationRequestModal = RuleDeleteRequestModal & {
  stores: string[];
  confirmAction?: () => Promise<void>;
};

type PromoBannerUsageInfo = {
  visibleStoreNames: string[];
  overflowStoreNames: string[];
};

type PromoBannerStoreUsage = {
  storeId: string;
  storeName: string;
  activeCount: number;
  visibleCount: number;
  overflowCount: number;
};

type PromoBannerUsageSummary = {
  byCardId: Map<string, PromoBannerUsageInfo>;
  visibleCardIds: Set<string>;
  overflowCardIds: Set<string>;
  activeCardIds: Set<string>;
  stores: PromoBannerStoreUsage[];
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
type LootBoxCaseRarity = NonNullable<GuestGameReward["rewardRarity"]>;
type LootBoxPeriodicLimitPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

type LootBoxForm = {
  name: string;
  status: GuestGameStatus;
  usageKind: GuestGameLootBoxUsageKind;
  triggerKind: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  caseRarity: LootBoxCaseRarity;
  audienceId: string;
  segment: string;
  sessionType: string;
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
  periodicLimitEnabled: boolean;
  periodicLimitPeriod: LootBoxPeriodicLimitPeriod;
  totalPerDay: string;
  prizes: LootBoxPrizeForm[];
  requireCashierConfirmation: boolean;
  oneDevicePerGuest: boolean;
  periodRulesText: string;
  limitsText: string;
  probabilityRulesText: string;
  budgetAmount: string;
  budgetUnlimited: boolean;
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
  visibility: string;
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
  budgetUnlimited: boolean;
  perGuestLimit: string;
  perGuestLimitUnlimited: boolean;
  totalRewardLimit: string;
  sessionType: string;
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

type SeasonLevelStepForm = {
  id: string;
  level: string;
  xp: string;
  title: string;
  condition: string;
  description: string;
  freeReward: string;
  premiumReward: string;
  conditionV2?: BattlePassStepConditionValue;
  triggerKind?: string;
  sessionType?: string;
  timeWindowMode?: LootBoxTimeWindowMode;
  weekdayMode?: LootBoxWeekdayMode;
  selectedWeekdays?: number[];
  hourFrom?: string;
  hourTo?: string;
  tariffGroupId?: string;
  tariffPeriodId?: string;
  tariffTypeId?: string;
  guestLogTypes?: string;
  blockedGuestLogTypes?: string;
  freeRewardType?: string;
  freeRewardAmount?: string;
  freeRewardLabel?: string;
  freeRewardCode?: string;
  freeRewardLootBoxId?: string;
  freeRewardLootBoxName?: string;
  freeRewardLootBoxRarity?: LootBoxCaseRarity;
  freeRewardDelivery?: string;
  premiumRewardType?: string;
  premiumRewardAmount?: string;
  premiumRewardLabel?: string;
  premiumRewardCode?: string;
  premiumRewardLootBoxId?: string;
  premiumRewardLootBoxName?: string;
  premiumRewardLootBoxRarity?: LootBoxCaseRarity;
  premiumRewardDelivery?: string;
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
  levelSteps: SeasonLevelStepForm[];
  xpRulesText: string;
  levelsText: string;
  freeRewardsText: string;
  premiumRewardsText: string;
  premiumEnabled: boolean;
  premiumUpgradeMode: string;
  budgetAmount: string;
  budgetUnlimited: boolean;
  manualApprovalRequired: boolean;
  note: string;
};

type PromoBannerForm = {
  title: string;
  label: string;
  description: string;
  tag: string;
  status: GuestGameStatus;
  targetAnchor: string;
  priority: string;
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  actionLabel: string;
  actionUrl: string;
  imageUrl: string;
  imageSource: string;
  imageScale: string;
  imageOffsetX: string;
  imageOffsetY: string;
};

type PromoBannerNotice = {
  tone: "warning" | "error";
  message: string;
};

type PromoBannerDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
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
  { id: "missions", label: "Задания" },
  { id: "checkIn", label: "Чекин" },
  { id: "seasons", label: "Battle Pass" },
  { id: "promoCards", label: "Промо баннеры" },
  { id: "testRun", label: "Тест запуска" },
  { id: "rewards", label: "Кошелек" },
];

const promoTargetOptions = [
  { value: "", label: "Главный экран" },
  { value: "lootboxes", label: "Лутбоксы" },
  { value: "missions", label: "Задания" },
  { value: "battlePass", label: "Battle Pass" },
  { value: "rewards", label: "Кошелек наград" },
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
  { value: "MISSION_COMPLETED", label: "Задание выполнено" },
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
    label: "Задание выполнено",
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
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "REFERRAL_ACCEPTED", label: "Реферал принят" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Задание выполнено" },
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

const lootBoxPeriodicLimitOptions: Array<{
  value: LootBoxPeriodicLimitPeriod;
  label: string;
}> = [
  { value: "DAILY", label: "Ежедневный" },
  { value: "WEEKLY", label: "Еженедельный" },
  { value: "MONTHLY", label: "Ежемесячный" },
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
  MISSION_COMPLETED: "Правило проверится после выполнения другого задания.",
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
  { value: "CUSTOM", label: "Свое задание" },
];

const missionTypeHelpText: Record<string, string> = {
  REPEAT_VISIT:
    "Задание засчитывает повторное посещение в заданном окне времени.",
  CHECK_IN:
    "Задание засчитывает чекин гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Задание засчитывает факт визита: сессию, чекин или подходящий лог Langame.",
  PLAY_HOUR:
    "Задание считает накопленное игровое время или длительность сессии.",
  BAR_PURCHASE:
    "Задание считает покупки бара по сохраненным продажам или списаниям.",
  PRODUCT_PURCHASE: "Задание считает покупку выбранных товаров или категорий.",
  BALANCE_TOPUP:
    "Задание считает пополнение баланса гостя по сохраненным фактам Langame.",
  REFERRAL_ACCEPTED:
    "Задание засчитывает регистрацию приглашенного друга в игровом модуле.",
  APP_OPEN:
    "Задание срабатывает при открытии сайта, игрового модуля или Mini App.",
  GUEST_LOG:
    "Задание работает от выбранных событий Langame из подготовленного каталога.",
  CUSTOM: "Свободный сценарий: событие и условия задаются ниже вручную.",
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

const missionVisibilityOptions = [
  { value: "VISIBLE", label: "Видимое" },
  { value: "HIDDEN", label: "Скрытое" },
];

const missionVisibilityHelpText: Record<string, string> = {
  VISIBLE:
    "Задание будет видно гостям в игровом модуле сразу, если оно активно и подходит выбранному клубу.",
  HIDDEN:
    "Гости не увидят задание заранее. Оно появится только после выполнения как скрытая активность.",
};

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

const checkInRewardTypeOptions = rewardTypeOptions.filter((option) =>
  ["XP", "BONUS_BALANCE"].includes(option.value),
);

const lootBoxRewardTypeOptions = rewardTypeOptions.filter(
  (option) => !["BALANCE", "BATTLE_PASS_REWARD"].includes(option.value),
);

const battlePassStepRewardTypeOptions = [
  { value: "", label: "Без награды" },
  { value: "BONUS_BALANCE", label: "Бонусы Langame" },
  { value: "PROMOCODE", label: "Промокод" },
  { value: "LOOT_BOX", label: "Лутбокс" },
  { value: "ADMIN_OTHER", label: "Иной приз" },
];

const battlePassStepRewardDeliveryOptions = [
  { value: "AUTO", label: "Автоматическая выдача" },
  { value: "ADMIN", label: "Администратором" },
];

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
  { value: "regular_session", label: "почасовая сессия" },
  { value: "packet_hours", label: "пакет или абонемент" },
];

const dryRunPacketOptions = [
  { value: "", label: "не указано" },
  { value: "true", label: "пакет или абонемент" },
  { value: "false", label: "почасовая сессия" },
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

const rewardWalletStateLabels: Record<GuestGameReward["walletState"], string> =
  {
    WAITING_APPROVAL: "ожидает подтверждения",
    READY: "можно выдать",
    REDEEMED: "погашено",
    CANCELED: "отменено",
    EXPIRED: "срок истек",
  };

const rewardRarityLabels: Record<
  NonNullable<GuestGameReward["rewardRarity"]>,
  string
> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

const lootBoxCaseRarityLabels: Record<LootBoxCaseRarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

const lootBoxCaseRarityOptions = (
  Object.keys(lootBoxCaseRarityLabels) as LootBoxCaseRarity[]
).map((value) => ({ value, label: lootBoxCaseRarityLabels[value] }));

const lootBoxUsageKindOptions: Array<{
  value: GuestGameLootBoxUsageKind;
  label: string;
  description: string;
}> = [
  {
    value: "STANDALONE",
    label: "Витрина",
    description: "Показывается отдельной карточкой в игровом модуле.",
  },
  {
    value: "REWARD_TEMPLATE",
    label: "Подарочный",
    description: "Не отображается в витрине и используется только как награда.",
  },
  {
    value: "BOTH",
    label: "Витрина + подарок",
    description: "Можно открыть в витрине и выдать как награду.",
  },
];

const lootBoxUsageKindLabels: Record<GuestGameLootBoxUsageKind, string> = {
  STANDALONE: "витрина",
  REWARD_TEMPLATE: "подарочный",
  BOTH: "витрина + подарок",
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

const dangerButtonClass =
  "rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-200 dark:hover:border-red-700 dark:hover:bg-red-950/30";

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
  usageKind: "STANDALONE",
  triggerKind: "SESSION_START",
  rewardType: defaultLootBoxPrizes[0].rewardType,
  rewardAmount: defaultLootBoxPrizes[0].rewardAmount,
  rewardLabel: defaultLootBoxPrizes[0].rewardLabel,
  caseRarity: "common",
  audienceId: "",
  segment: "quiet_hours",
  sessionType: "",
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
  periodicLimitEnabled: false,
  periodicLimitPeriod: "DAILY",
  totalPerDay: "30",
  prizes: defaultLootBoxPrizes,
  requireCashierConfirmation: true,
  oneDevicePerGuest: true,
  periodRulesText: jsonText({
    timeWindowMode: "QUIET_HOURS",
    weekdayMode: "WEEKDAYS",
    weekdays: [1, 2, 3, 4, 5],
    hours: ["10:00-16:00"],
  }),
  limitsText: jsonText({
    perGuestPerWeek: 1,
    totalPerDay: 30,
  }),
  probabilityRulesText: jsonText({
    type: "weighted",
    caseRarity: "common",
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
  budgetUnlimited: false,
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
  visibility: "VISIBLE",
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
  budgetUnlimited: false,
  perGuestLimit: "1",
  perGuestLimitUnlimited: false,
  totalRewardLimit: "100",
  sessionType: "",
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
    requiresLangameFact: true,
    visibility: "VISIBLE",
  }),
  antiFraudText: jsonText({
    denySameDayRepeat: true,
    requiresCashierConfirmation: true,
  }),
  manualApprovalRequired: true,
  note: "Факт визита берем из Langame, выдачу подтверждает кассир.",
};

const defaultCheckInMissionForm: MissionForm = {
  ...defaultMissionForm,
  name: "Чекин в клубе",
  status: "DRAFT",
  missionType: "CHECK_IN",
  triggerKind: "CHECK_IN",
  visibility: "VISIBLE",
  rewardType: "XP",
  rewardAmount: "0",
  rewardLabel: "XP за чекин",
  xpReward: "20",
  progressTarget: "1",
  progressUnit: "check_in",
  budgetAmount: "0",
  budgetUnlimited: false,
  perGuestLimit: "",
  perGuestLimitUnlimited: true,
  totalRewardLimit: "",
  sessionType: "",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  metricAggregation: "count",
  metricEventTypes: "CHECK_IN",
  metricHours: "",
  metricProductIds: "",
  metricExternalProductIds: "",
  metricCategoryIds: "",
  metricCategoryNames: "",
  windowDays: "",
  weekdaysOnly: false,
  minSessionMinutes: "",
  minSpendAmount: "",
  questEnabled: false,
  questSteps: [],
  requireLangameFact: false,
  denySameDayRepeat: false,
  requireCashierConfirmation: false,
  conditionsText: jsonText({
    source: "business_controls",
    metric: {
      aggregation: "count",
      eventTypes: ["CHECK_IN"],
      target: 1,
    },
    progressTarget: 1,
    progressUnit: "check_in",
    visibility: "VISIBLE",
  }),
  antiFraudText: jsonText({
    source: "business_controls",
  }),
  manualApprovalRequired: false,
  note: "Чекин доступен гостю с активной сессией в выбранном клубе. Повторный чекин в том же клубе доступен на следующий календарный день по времени клуба.",
};

const defaultSeasonLevelSteps: SeasonLevelStepForm[] = [
  {
    id: "level-1",
    level: "1",
    xp: "0",
    title: "Старт сезона",
    condition: "Начните участие в сезоне клуба.",
    description: "Первый шаг запускает последовательный прогресс гостя.",
    freeReward: "Старт сезона",
    premiumReward: "",
  },
  {
    id: "level-2",
    level: "2",
    xp: "0",
    title: "Старт игровой сессии",
    condition: "Начните игровую сессию в клубе.",
    description: "Шаг выполнится после старта игровой сессии.",
    freeReward: "Промокод бара",
    premiumReward: "Усиленный промокод",
  },
  {
    id: "level-3",
    level: "3",
    xp: "0",
    title: "Пакет или абонемент",
    condition: "Начните игровую сессию с пакетом или абонементом.",
    description: "Шаг выполнится после старта подходящей сессии.",
    freeReward: "Бонус на следующий визит",
    premiumReward: "",
  },
  {
    id: "level-4",
    level: "4",
    xp: "0",
    title: "Финальный шаг",
    condition: "Выполните условие финального шага.",
    description: "Финальный этап сезона с главной наградой.",
    freeReward: "Игровое время с подтверждением",
    premiumReward: "Турнирный билет",
  },
];

const defaultSeasonForm: SeasonForm = {
  name: "Клубный сезон",
  status: "DRAFT",
  seasonType: "CLUB_SEASON",
  audienceId: "",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  xpVisit: "0",
  xpCheckIn: "0",
  xpPlayHour: "0",
  xpBarPurchase: "0",
  xpMissionCompletion: "0",
  xpPacketSessionBonus: "0",
  xpGuestLog: "0",
  sessionType: "",
  tariffGroupId: "",
  tariffPeriodId: "",
  tariffTypeId: "",
  guestLogTypes: "",
  blockedGuestLogTypes: "",
  levelCount: "4",
  xpPerLevel: "0",
  freeRewardEvery: "2",
  premiumRewardEvery: "2",
  freeRewardLabel: "Промокод бара",
  premiumRewardLabel: "Усиленный промокод",
  levelSteps: defaultSeasonLevelSteps.map((step) => ({ ...step })),
  xpRulesText: jsonText({
    visit: 20,
    checkIn: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
    packetSessionBonus: 15,
    guestLog: 5,
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
  budgetUnlimited: false,
  manualApprovalRequired: true,
  note: "Premium включается вручную после оплаты или решения управляющего.",
};

const defaultPromoBannerForm: PromoBannerForm = {
  title: "Новая акция клуба",
  label: "Акция",
  description: "Короткое описание для гостевой главной.",
  tag: "активно",
  status: "DRAFT",
  targetAnchor: "missions",
  priority: "0",
  storeIds: [],
  periodFrom: "",
  periodTo: "",
  actionLabel: "Открыть",
  actionUrl: "",
  imageUrl: "",
  imageSource: "",
  imageScale: "1",
  imageOffsetX: "0",
  imageOffsetY: "0",
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
  const [promoBannerForm, setPromoBannerForm] = useState<PromoBannerForm>(
    defaultPromoBannerForm,
  );
  const [rewardForm, setRewardForm] = useState<RewardForm>(defaultRewardForm);
  const [rewardRedeemForm, setRewardRedeemForm] = useState<RewardRedeemForm>(
    defaultRewardRedeemForm,
  );
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm);
  const [dryRunForm, setDryRunForm] = useState<DryRunForm>(defaultDryRunForm);
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
  const [redeemedReward, setRedeemedReward] = useState<GuestGameReward | null>(
    null,
  );
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingLootBoxId, setEditingLootBoxId] = useState<string | null>(null);
  const [isLootBoxFormOpen, setIsLootBoxFormOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [isMissionFormOpen, setIsMissionFormOpen] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [isSeasonFormOpen, setIsSeasonFormOpen] = useState(false);
  const [editingPromoBannerId, setEditingPromoBannerId] = useState<
    string | null
  >(null);
  const [isPromoBannerFormOpen, setIsPromoBannerFormOpen] = useState(false);
  const [promoBannerNotice, setPromoBannerNotice] =
    useState<PromoBannerNotice | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorModeRefreshing, setEditorModeRefreshing] =
    useState<EditorMode | null>(null);
  const [deleteRequestModal, setDeleteRequestModal] =
    useState<RuleDeleteRequestModal | null>(null);
  const [deleteActivityModal, setDeleteActivityModal] =
    useState<RuleDeleteActivityModal | null>(null);
  const [deleteBlockedModal, setDeleteBlockedModal] =
    useState<RuleDeleteBlockedModal | null>(null);
  const [activationRequestModal, setActivationRequestModal] =
    useState<RuleActivationRequestModal | null>(null);
  const [visualEditorStoreId, setVisualEditorStoreId] = useState<string | null>(
    null,
  );

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
  const checkInMissions = useMemo(
    () => workspace.missions.filter(isCheckInMission),
    [workspace.missions],
  );
  const regularMissions = useMemo(
    () => workspace.missions,
    [workspace.missions],
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
    setIsLootBoxFormOpen(true);
    setActiveTab("lootBoxes");
  }

  function createLootBox() {
    setLootBoxForm(defaultLootBoxForm);
    setEditingLootBoxId(null);
    setIsLootBoxFormOpen(true);
    setActiveTab("lootBoxes");
  }

  function resetLootBoxForm() {
    setLootBoxForm(defaultLootBoxForm);
    setEditingLootBoxId(null);
    setIsLootBoxFormOpen(false);
  }

  function editMission(mission: GuestGameMission) {
    setMissionForm(missionToForm(mission));
    setEditingMissionId(mission.id);
    setIsMissionFormOpen(true);
    setActiveTab(isCheckInMission(mission) ? "checkIn" : "missions");
  }

  function createMission() {
    setMissionForm(defaultMissionForm);
    setEditingMissionId(null);
    setIsMissionFormOpen(true);
    setActiveTab("missions");
  }

  function editCheckInMission(mission: GuestGameMission) {
    setMissionForm(normalizeCheckInMissionForm(missionToForm(mission)));
    setEditingMissionId(mission.id);
    setIsMissionFormOpen(true);
    setActiveTab("checkIn");
  }

  function createCheckInMission() {
    setMissionForm(defaultCheckInMissionForm);
    setEditingMissionId(null);
    setIsMissionFormOpen(true);
    setActiveTab("checkIn");
  }

  function resetMissionForm() {
    setMissionForm(defaultMissionForm);
    setEditingMissionId(null);
    setIsMissionFormOpen(false);
  }

  function resetCheckInMissionForm() {
    setMissionForm(defaultCheckInMissionForm);
    setEditingMissionId(null);
    setIsMissionFormOpen(false);
  }

  function editSeason(season: GuestGameSeason) {
    setSeasonForm(seasonToForm(season));
    setEditingSeasonId(season.id);
    setIsSeasonFormOpen(true);
    setActiveTab("seasons");
  }

  function createSeason() {
    setSeasonForm(defaultSeasonForm);
    setEditingSeasonId(null);
    setIsSeasonFormOpen(true);
    setActiveTab("seasons");
  }

  function resetSeasonForm() {
    setSeasonForm(defaultSeasonForm);
    setEditingSeasonId(null);
    setIsSeasonFormOpen(false);
  }

  function editPromoBanner(promoCard: GuestGamePromoCard) {
    setPromoBannerForm(promoCardToForm(promoCard));
    setEditingPromoBannerId(promoCard.id);
    setIsPromoBannerFormOpen(true);
    setPromoBannerNotice(null);
    setActiveTab("promoCards");
  }

  function createPromoBanner() {
    setPromoBannerForm(defaultPromoBannerForm);
    setEditingPromoBannerId(null);
    setIsPromoBannerFormOpen(true);
    setPromoBannerNotice(null);
    setActiveTab("promoCards");
  }

  function resetPromoBannerForm() {
    setPromoBannerForm(defaultPromoBannerForm);
    setEditingPromoBannerId(null);
    setIsPromoBannerFormOpen(false);
    setPromoBannerNotice(null);
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

  async function switchEditorMode(mode: EditorMode) {
    if (mode === editorMode || editorModeRefreshing) {
      return;
    }

    setEditorModeRefreshing(mode);
    setError(null);

    try {
      await reloadWorkspace();
      setEditorMode(mode);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось обновить данные редактора",
      );
    } finally {
      setEditorModeRefreshing(null);
    }
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

  function needsActivationConfirmation(
    nextStatus: GuestGameStatus,
    currentStatus: GuestGameStatus | null,
    confirmed: boolean,
  ) {
    return nextStatus === "ACTIVE" && currentStatus !== "ACTIVE" && !confirmed;
  }

  async function saveLootBox(options: { confirmedActivation?: boolean } = {}) {
    const currentStatus =
      workspace.lootBoxes.find((item) => item.id === editingLootBoxId)
        ?.status ?? null;

    if (
      needsActivationConfirmation(
        lootBoxForm.status,
        currentStatus,
        options.confirmedActivation === true,
      )
    ) {
      setActivationRequestModal({
        type: "loot-boxes",
        id: editingLootBoxId ?? "new-loot-box",
        name: lootBoxForm.name || "Новый лутбокс",
        label: ruleTemplateLabel("loot-boxes"),
        stores: activationTargetStoreNames(lootBoxForm.storeIds, stores),
        confirmAction: () => saveLootBox({ confirmedActivation: true }),
      });
      return;
    }

    await saveAction("lootBox", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения лутбоксов нужно право `Геймификация: правила`.",
      );

      const primaryPrize = primaryLootBoxPrize(lootBoxForm);
      const payload = {
        name: lootBoxForm.name,
        status: lootBoxForm.status,
        usageKind: lootBoxForm.usageKind,
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
        budgetAmount: lootBoxForm.budgetUnlimited
          ? null
          : lootBoxForm.budgetAmount,
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

  async function saveMission(options: { confirmedActivation?: boolean } = {}) {
    const currentStatus =
      workspace.missions.find((item) => item.id === editingMissionId)?.status ??
      null;

    if (
      needsActivationConfirmation(
        missionForm.status,
        currentStatus,
        options.confirmedActivation === true,
      )
    ) {
      setActivationRequestModal({
        type: "missions",
        id: editingMissionId ?? "new-mission",
        name: missionForm.name || "Новое задание",
        label: ruleTemplateLabel("missions"),
        stores: activationTargetStoreNames(missionForm.storeIds, stores),
        confirmAction: () => saveMission({ confirmedActivation: true }),
      });
      return;
    }

    await saveAction("mission", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения заданий нужно право `Геймификация: правила`.",
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
        periodFrom: dateInputIsoValue(missionForm.periodFrom),
        periodTo: dateInputIsoValue(missionForm.periodTo),
        budgetAmount: missionForm.budgetUnlimited
          ? null
          : missionForm.budgetAmount,
        perGuestLimit: missionForm.perGuestLimitUnlimited
          ? null
          : missionForm.perGuestLimit,
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

  async function saveSeason(options: { confirmedActivation?: boolean } = {}) {
    const currentStatus =
      workspace.seasons.find((item) => item.id === editingSeasonId)?.status ??
      null;

    if (
      needsActivationConfirmation(
        seasonForm.status,
        currentStatus,
        options.confirmedActivation === true,
      )
    ) {
      setActivationRequestModal({
        type: "seasons",
        id: editingSeasonId ?? "new-season",
        name: seasonForm.name || "Новый сезон",
        label: ruleTemplateLabel("seasons"),
        stores: activationTargetStoreNames(seasonForm.storeIds, stores),
        confirmAction: () => saveSeason({ confirmedActivation: true }),
      });
      return;
    }

    await saveAction("season", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения Battle Pass нужно право `Геймификация: правила`.",
      );

      const payload = {
        name: seasonForm.name,
        status: seasonForm.status,
        seasonType: "CLUB_SEASON",
        audienceId: nullable(seasonForm.audienceId),
        storeIds: seasonForm.storeIds,
        periodFrom: dateInputIsoValue(seasonForm.periodFrom),
        periodTo: dateInputIsoValue(seasonForm.periodTo),
        xpRules: buildSeasonXpRules(seasonForm),
        levels: buildSeasonLevels(seasonForm),
        freeRewards: buildSeasonRewards(seasonForm, "free"),
        premiumRewards: buildSeasonRewards(seasonForm, "premium"),
        premiumEnabled: seasonForm.premiumEnabled,
        premiumUpgradeMode: nullable(seasonForm.premiumUpgradeMode),
        budgetAmount: seasonForm.budgetUnlimited
          ? null
          : seasonForm.budgetAmount,
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

  async function savePromoBanner(
    options: { confirmedActivation?: boolean } = {},
  ) {
    const limitWarning = promoBannerDraftLimitWarning(
      promoBannerForm,
      workspace.promoCards,
      stores,
      editingPromoBannerId,
    );
    const nextStatus = limitWarning ? "DRAFT" : promoBannerForm.status;
    const currentStatus =
      workspace.promoCards.find((item) => item.id === editingPromoBannerId)
        ?.status ?? null;

    if (
      needsActivationConfirmation(
        nextStatus,
        currentStatus,
        options.confirmedActivation === true,
      )
    ) {
      setActivationRequestModal({
        type: "promo-cards",
        id: editingPromoBannerId ?? "new-promo-card",
        name: promoBannerForm.title || "Новый промо-баннер",
        label: ruleTemplateLabel("promo-cards"),
        stores: activationTargetStoreNames(promoBannerForm.storeIds, stores),
        confirmAction: () => savePromoBanner({ confirmedActivation: true }),
      });
      return;
    }

    await saveAction("promoBanner", async () => {
      assertCan(
        access.canManageRules,
        "Для изменения промо-баннеров нужно право `Геймификация: правила`.",
      );
      setPromoBannerNotice(null);

      let metadata: Awaited<ReturnType<typeof buildPromoBannerMetadata>>;

      try {
        metadata = await buildPromoBannerMetadata(promoBannerForm);
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Не удалось подготовить изображение баннера.";

        setPromoBannerNotice({ tone: "error", message });
        throw new Error(message);
      }

      const payload = {
        title: promoBannerForm.title,
        label: nullable(promoBannerForm.label),
        description: nullable(promoBannerForm.description),
        tag: nullable(promoBannerForm.tag),
        status: nextStatus,
        targetAnchor: nullable(promoBannerForm.targetAnchor),
        priority: promoBannerForm.priority,
        storeIds: promoBannerForm.storeIds,
        periodFrom: nullable(promoBannerForm.periodFrom),
        periodTo: nullable(promoBannerForm.periodTo),
        metadata,
      };

      if (editingPromoBannerId) {
        await patchJson(
          `/api/guests/gamification/promo-cards/${editingPromoBannerId}`,
          payload,
        );
      } else {
        await postJson("/api/guests/gamification/promo-cards", payload);
      }

      resetPromoBannerForm();
      if (limitWarning) {
        setPromoBannerNotice({ tone: "warning", message: limitWarning });
      }
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
    await saveAction(
      dryRunOnly ? "pipelinePreview" : "pipelineRun",
      async () => {
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
      },
    );
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

      await deleteJson(
        `/api/guests/gamification/guest-log-mappings/${mapping.id}`,
      );
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
        fact.sessionPacket == null
          ? current.sessionPacket
          : String(fact.sessionPacket),
      tariffGroupId: fact.tariffGroupId ?? current.tariffGroupId,
      tariffPeriodId: fact.tariffPeriodId ?? current.tariffPeriodId,
      tariffTypeId: fact.tariffTypeId ?? current.tariffTypeId,
      guestLogType: fact.guestLogType ?? current.guestLogType,
      sessionMinutes:
        fact.sessionMinutes == null
          ? current.sessionMinutes
          : String(fact.sessionMinutes),
      spendAmount:
        fact.spendAmount == null
          ? current.spendAmount
          : String(fact.spendAmount),
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

  function buildRuleActivationRequest(
    type: RuleTemplateType,
    id: string,
  ): RuleActivationRequestModal | null {
    const label = ruleTemplateLabel(type);

    if (type === "loot-boxes") {
      const item = workspace.lootBoxes.find((rule) => rule.id === id);
      return item && item.status !== "ACTIVE"
        ? {
            type,
            id,
            name: item.name,
            label,
            stores: activationTargetStoreNames(item.storeIds, stores),
          }
        : null;
    }

    if (type === "missions") {
      const item = workspace.missions.find((rule) => rule.id === id);
      return item && item.status !== "ACTIVE"
        ? {
            type,
            id,
            name: item.name,
            label,
            stores: activationTargetStoreNames(item.storeIds, stores),
          }
        : null;
    }

    if (type === "seasons") {
      const item = workspace.seasons.find((rule) => rule.id === id);
      return item && item.status !== "ACTIVE"
        ? {
            type,
            id,
            name: item.name,
            label,
            stores: activationTargetStoreNames(item.storeIds, stores),
          }
        : null;
    }

    const item = workspace.promoCards.find((rule) => rule.id === id);
    return item && item.status !== "ACTIVE"
      ? {
          type,
          id,
          name: item.title,
          label,
          stores: activationTargetStoreNames(item.storeIds, stores),
        }
      : null;
  }

  async function updateRuleStatus(
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
    options: { confirmedActivation?: boolean } = {},
  ) {
    if (status === "ACTIVE" && !options.confirmedActivation) {
      const activationRequest = buildRuleActivationRequest(type, id);

      if (activationRequest) {
        setActivationRequestModal(activationRequest);
        return;
      }
    }

    await saveAction(`${type}-${id}`, async () => {
      assertCan(
        access.canManageRules,
        "Для изменения статуса правила нужно право `Геймификация: правила`.",
      );

      await patchJson(`/api/guests/gamification/${type}/${id}`, { status });
      await reloadWorkspace();
    });
  }

  async function confirmActivateRuleTemplate(
    request: RuleActivationRequestModal,
  ) {
    setActivationRequestModal(null);
    if (request.confirmAction) {
      await request.confirmAction();
      return;
    }

    await updateRuleStatus(request.type, request.id, "ACTIVE", {
      confirmedActivation: true,
    });
  }

  async function deleteRuleTemplate(
    type: RuleTemplateType,
    id: string,
    name: string,
  ) {
    const label = ruleTemplateLabel(type);
    setDeleteRequestModal({ type, id, name, label });
  }

  async function confirmDeleteRuleTemplate(
    request: RuleDeleteRequestModal,
    options: { deleteActiveRule?: boolean; detachVisualEditor?: boolean } = {},
  ) {
    const { type, id, name } = request;
    setSaving(`${type}-delete-${id}`);
    setError(null);
    setDeleteRequestModal(null);
    setDeleteActivityModal(null);
    setDeleteBlockedModal(null);

    try {
      assertCan(
        access.canManageRules,
        "Для удаления шаблона нужно право `Геймификация: правила`.",
      );

      const deleteParams = new URLSearchParams();
      if (options.detachVisualEditor) {
        deleteParams.set("detachVisualEditor", "true");
      }
      if (options.deleteActiveRule) {
        deleteParams.set("deleteActiveRule", "true");
      }
      const deleteQuery = deleteParams.size ? `?${deleteParams}` : "";
      await deleteJson(`/api/guests/gamification/${type}/${id}${deleteQuery}`);

      if (type === "loot-boxes" && editingLootBoxId === id) {
        resetLootBoxForm();
      }

      if (type === "missions" && editingMissionId === id) {
        resetMissionForm();
      }

      if (type === "seasons" && editingSeasonId === id) {
        resetSeasonForm();
      }

      if (type === "promo-cards" && editingPromoBannerId === id) {
        resetPromoBannerForm();
      }

      await reloadWorkspace();
    } catch (caught) {
      const activeModal = buildDeleteActivityModal(request, caught);

      if (activeModal && !options.detachVisualEditor) {
        setDeleteActivityModal(activeModal);
        return;
      }

      const message =
        caught instanceof Error ? caught.message : "Не удалось удалить шаблон";
      const blockedModal = buildDeleteBlockedModal(name, message);

      if (blockedModal) {
        setDeleteBlockedModal(blockedModal);
      } else {
        setError(message);
      }
    } finally {
      setSaving(null);
    }
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
      const message =
        caught instanceof Error ? caught.message : "Не удалось сохранить";

      setError(message);

      if (key === "promoBanner") {
        setPromoBannerNotice({ tone: "error", message });
      }
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
              Guest Game Hub: XP, задания, лутбоксы и кошелек
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
                  disabled={editorModeRefreshing !== null}
                  onClick={() => void switchEditorMode(mode)}
                  className={[
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70",
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
              XP, уровни, лутбоксы, игровые задания, Battle Pass, кошелек
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
              Тихие часы, повторный визит, бар, события, аудитории, бюджеты и
              ручная очередь выдачи для измеримого промо-эффекта.
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
          <StatCard
            label="Награды к выдаче"
            value={workspace.summary.pendingRewards}
          />
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
          initialStoreId={visualEditorStoreId}
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
              canViewIntegrationReadiness={access.isPlatformAdmin}
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
              isFormOpen={isLootBoxFormOpen}
              onSave={saveLootBox}
              onEdit={editLootBox}
              onCreateNew={createLootBox}
              onReset={resetLootBoxForm}
              onStatus={updateRuleStatus}
              onDelete={deleteRuleTemplate}
              onRestart={restartLootBox}
              saving={saving}
              canManage={access.canManageRules}
            />
          ) : null}

          {activeTab === "missions" ? (
            <MissionsTab
              form={missionForm}
              setForm={setMissionForm}
              missions={regularMissions}
              audiences={audiences}
              stores={stores}
              products={products}
              tariffSnapshots={workspace.tariffSnapshots}
              guestLogCatalog={workspace.guestLogCatalog}
              editingId={editingMissionId}
              isFormOpen={isMissionFormOpen}
              onSave={saveMission}
              onEdit={editMission}
              onCreateNew={createMission}
              onReset={resetMissionForm}
              onStatus={updateRuleStatus}
              onDelete={deleteRuleTemplate}
              saving={saving}
              canManage={access.canManageRules}
            />
          ) : null}

          {activeTab === "checkIn" ? (
            <CheckInTab
              form={missionForm}
              setForm={setMissionForm}
              missions={checkInMissions}
              audiences={audiences}
              stores={stores}
              tariffSnapshots={workspace.tariffSnapshots}
              editingId={editingMissionId}
              isFormOpen={isMissionFormOpen}
              onSave={saveMission}
              onEdit={editCheckInMission}
              onCreateNew={createCheckInMission}
              onReset={resetCheckInMissionForm}
              onStatus={updateRuleStatus}
              onDelete={deleteRuleTemplate}
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
              products={products}
              lootBoxes={workspace.lootBoxes}
              editingId={editingSeasonId}
              isFormOpen={isSeasonFormOpen}
              onSave={saveSeason}
              onEdit={editSeason}
              onCreateNew={createSeason}
              onReset={resetSeasonForm}
              onStatus={updateRuleStatus}
              onDelete={deleteRuleTemplate}
              saving={saving}
              canManage={access.canManageRules}
            />
          ) : null}

          {activeTab === "promoCards" ? (
            <PromoBannersTab
              form={promoBannerForm}
              setForm={setPromoBannerForm}
              promoCards={workspace.promoCards}
              stores={stores}
              editingId={editingPromoBannerId}
              notice={promoBannerNotice}
              isFormOpen={isPromoBannerFormOpen}
              onSave={savePromoBanner}
              onEdit={editPromoBanner}
              onCreateNew={createPromoBanner}
              onReset={resetPromoBannerForm}
              onStatus={updateRuleStatus}
              onDelete={deleteRuleTemplate}
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

      {deleteRequestModal ? (
        <DeleteConfirmModal
          modal={deleteRequestModal}
          onClose={() => setDeleteRequestModal(null)}
          onConfirm={() => confirmDeleteRuleTemplate(deleteRequestModal)}
          saving={
            saving ===
            `${deleteRequestModal.type}-delete-${deleteRequestModal.id}`
          }
        />
      ) : null}

      {deleteActivityModal ? (
        <DeleteActivityModal
          modal={deleteActivityModal}
          onClose={() => setDeleteActivityModal(null)}
          onConfirm={() =>
            confirmDeleteRuleTemplate(deleteActivityModal, {
              deleteActiveRule: true,
              detachVisualEditor: true,
            })
          }
          saving={
            saving ===
            `${deleteActivityModal.type}-delete-${deleteActivityModal.id}`
          }
        />
      ) : null}

      {deleteBlockedModal ? (
        <DeleteBlockedModal
          modal={deleteBlockedModal}
          onClose={() => setDeleteBlockedModal(null)}
        />
      ) : null}

      {activationRequestModal ? (
        <ActivationConfirmModal
          modal={activationRequestModal}
          onClose={() => setActivationRequestModal(null)}
          onConfirm={() => confirmActivateRuleTemplate(activationRequestModal)}
          saving={
            saving ===
            `${activationRequestModal.type}-${activationRequestModal.id}`
          }
        />
      ) : null}
    </div>
  );
}

function assertCan(allowed: boolean, message: string) {
  if (!allowed) {
    throw new Error(message);
  }
}

function DeleteConfirmModal({
  modal,
  saving,
  onClose,
  onConfirm,
}: {
  modal: RuleDeleteRequestModal;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
            Подтвердите удаление
          </p>
          <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Удалить {modal.label} «{modal.name}»?
          </h3>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          История событий и наград сохранится, но шаблон исчезнет из редактора.
          Если он сейчас активен или используется в опубликованной визуализации
          клуба, LeetPlus покажет список клубов и попросит отдельное
          подтверждение.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={smallButtonClass}
            disabled={saving}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={saving}
            onClick={() => void onConfirm()}
          >
            {saving ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivationConfirmModal({
  modal,
  saving,
  onClose,
  onConfirm,
}: {
  modal: RuleActivationRequestModal;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-cyan-300">
            Подтвердите активацию
          </p>
          <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Активировать {modal.label} «{modal.name}»?
          </h3>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          После подтверждения элемент сразу попадет в игровой модуль и будет
          отображаться в визуальном редакторе для выбранных клубов.
        </p>
        <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-900 dark:text-cyan-200">
            Клубы
          </p>
          <ul className="mt-2 space-y-1 text-sm text-cyan-950 dark:text-cyan-100">
            {modal.stores.map((store) => (
              <li key={store}>{store}</li>
            ))}
          </ul>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={smallButtonClass}
            disabled={saving}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving}
            onClick={() => void onConfirm()}
          >
            {saving ? "Активируем..." : "Да, активировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteActivityModal({
  modal,
  saving,
  onClose,
  onConfirm,
}: {
  modal: RuleDeleteActivityModal;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
            Элемент активен в клубе
          </p>
          <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
            Вы действительно хотите удалить {modal.label} «{modal.name}»?
          </h3>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {modal.message}
        </p>
        {modal.stores.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Клубы
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
              {modal.stores.map((store) => (
                <li key={store}>{store}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Если подтвердить, LeetPlus уберет элемент из активности этих клубов,
          опубликованных и сохраненных конфигураций визуального редактора, а
          затем удалит сам шаблон из системы.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={smallButtonClass}
            disabled={saving}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={saving}
            onClick={() => void onConfirm()}
          >
            {saving ? "Удаление..." : "Удалить из активности и везде"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBlockedModal({
  modal,
  onClose,
}: {
  modal: RuleDeleteBlockedModal;
  onClose: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
              Удаление заблокировано
            </p>
            <h3 className="mt-1 text-lg font-bold text-zinc-950 dark:text-white">
              {modal.title}
            </h3>
          </div>
          <button type="button" className={smallButtonClass} onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {modal.message}
        </p>
        {modal.stores.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Где используется
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {modal.stores.map((store) => (
                <span
                  key={store}
                  className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-amber-900 shadow-sm dark:bg-amber-950/70 dark:text-amber-100"
                >
                  {store}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={onClose}
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
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
    Boolean(
      form.profileId || form.guestId || result?.profile || result?.guest,
    ) &&
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
              задания и Battle Pass сработают, где есть блокировки, сколько XP и
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
                Загрузите последние сохраненные сессии, покупки, товарные
                продажи, логи, балансы и группы лояльности, затем выберите факт
                как основу проверки правил.
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
                Обрабатывает до 20 последних сохраненных фактов: сначала
                проверяет правила, пропускает дубли и факты без гостя, затем
                пишет только события, XP и очередь наград внутри LeetPlus.
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

          {pipelineResult ? (
            <PipelineResultPanel result={pipelineResult} />
          ) : null}

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
                <option value="" disabled>
                  Выберите тип
                </option>
                {sessionTypeOptions.map((option) => (
                  <option key={option.value || "any"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Пакет или абонемент
              <select
                className={fieldClass}
                value={form.sessionPacket}
                onChange={(event) =>
                  update("sessionPacket", event.target.value)
                }
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
                onChange={(event) =>
                  update("sessionMinutes", event.target.value)
                }
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
              {isProcessing ? "Записываем..." : "Создать событие и награды"}
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
                    API заново пересчитает сценарий, создаст событие, начислит
                    XP и положит награды в очередь. Записи в Langame нет.
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

function PipelineResultPanel({
  result,
}: {
  result: GuestGamePipelineRunResult;
}) {
  const modeLabel = result.dryRunOnly ? "предпросмотр" : "запуск";
  const statusLabel: Record<string, string> = {
    DRY_RUN: "проверено",
    PROCESSED: "обработано",
    SKIPPED: "пропуск",
    DUPLICATE: "дубль",
    ERROR: "ошибка",
  };
  const statusClass: Record<string, string> = {
    DRY_RUN: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    PROCESSED:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    SKIPPED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
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

function DryRunRuleCard({
  rule,
}: {
  rule: GuestGameDryRunResult["rules"][number];
}) {
  const kindLabel =
    rule.kind === "LOOT_BOX"
      ? "Лутбокс"
      : rule.kind === "MISSION"
        ? "Задание"
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
  canViewIntegrationReadiness,
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
  canViewIntegrationReadiness: boolean;
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
            <SectionTitle title="Старт игрового контура" />
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
            title="Лутбокс"
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
      {canViewIntegrationReadiness ? (
        <IntegrationReadinessCard readiness={workspace.integrationReadiness} />
      ) : null}
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
          <div className="grid gap-3 md:grid-cols-5">
            <StatusMetric
              label="Лутбоксы"
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
          <EmptyState text="Экономика появится после создания лутбокса, задания, Battle Pass или награды." />
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
            задания или Battle Pass: вернулся ли гость, были ли сессии, продажи
            бара/товаров и пополнения баланса. Расчет идет только по сохраненным
            snapshot-фактам.
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
            лояльности Langame, XP, задания, лутбоксы, battle pass и кошелек
            наград без доступа к внутренним разделам LeetPlus. Ссылки используют
            публичный slug клуба, старые URL с внутренним ID продолжают
            работать.
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
                    setEventForm({
                      ...eventForm,
                      profileId: event.target.value,
                    })
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
                      setEventForm({
                        ...eventForm,
                        xpDelta: event.target.value,
                      })
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
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
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
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (lootBox: GuestGameLootBox) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const [lootBoxStoreFilter, setLootBoxStoreFilter] = useState("");
  const [lootBoxTriggerFilter, setLootBoxTriggerFilter] = useState("");
  const filteredLootBoxes = useMemo(
    () =>
      lootBoxes.filter(
        (lootBox) =>
          lootBoxMatchesStoreFilter(lootBox, lootBoxStoreFilter) &&
          (!lootBoxTriggerFilter ||
            lootBox.triggerKind === lootBoxTriggerFilter),
      ),
    [lootBoxes, lootBoxStoreFilter, lootBoxTriggerFilter],
  );
  const lootBoxTitle = form.name.trim();
  const formTitle =
    editingId && lootBoxTitle
      ? `Редактирование лутбокса "${lootBoxTitle}"`
      : editingId
        ? "Редактирование лутбокса"
        : "Настройка лутбокса";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый лутбокс
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-4">
            <RuleCommonFields
              status={form.status}
              name={form.name}
              rewardType={form.rewardType}
              rewardAmount={form.rewardAmount}
              rewardLabel={form.rewardLabel}
              audienceId={form.audienceId}
              budgetAmount={form.budgetAmount}
              budgetUnlimited={form.budgetUnlimited}
              manualApprovalRequired={form.manualApprovalRequired}
              note={form.note}
              audiences={audiences}
              hideRewardFields
              ruleKind="lootBox"
              lootBoxUsageKind={form.usageKind}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <FormSection title="Внешний вид кейса">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Качество кейса">
                  <select
                    className={fieldClass}
                    value={form.caseRarity}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        caseRarity: event.target.value as LootBoxCaseRarity,
                      })
                    }
                  >
                    {lootBoxCaseRarityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <OptionHelp>
                    Меняет только скин лутбокса. Редкость выпавшей награды
                    считается отдельно и не перекрашивает сам кейс.
                  </OptionHelp>
                </Field>
              </div>
            </FormSection>
            <FormSection title="Кому и когда открывать">
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
                    <option value="" disabled>
                      Выберите тип
                    </option>
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value || "any"} value={option.value}>
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
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onReset}
                >
                  Сбросить выбор
                </button>
              ) : null}
            </div>
          </div>
        ) : null
      }
      listTitle="Созданные правила лутбоксов"
      listSummary={
        <LootBoxRuleFilters
          stores={stores}
          storeId={lootBoxStoreFilter}
          triggerKind={lootBoxTriggerFilter}
          totalCount={lootBoxes.length}
          visibleCount={filteredLootBoxes.length}
          onStoreIdChange={setLootBoxStoreFilter}
          onTriggerKindChange={setLootBoxTriggerFilter}
          onReset={() => {
            setLootBoxStoreFilter("");
            setLootBoxTriggerFilter("");
          }}
        />
      }
      items={filteredLootBoxes}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("CASE", item.id)}
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
            `тип: ${sessionTypeLabel(item.sessionType)}`,
            lootBoxUsageKindLabels[item.usageKind],
            tariffRuleSummary(item.periodRules),
            guestLogRuleSummary(item.periodRules),
            formatBudgetAmount(item.budgetAmount),
          ]}
          details={<LootBoxRulePrizeSummary lootBox={item} />}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("loot-boxes", item.id, status)}
          saving={saving === `loot-boxes-${item.id}`}
          onDelete={() => onDelete("loot-boxes", item.id, item.name)}
          deleteSaving={saving === `loot-boxes-delete-${item.id}`}
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
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
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
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (mission: GuestGameMission) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const [editorChoice, setEditorChoice] = useState<GuestGameMission | null>(
    null,
  );
  const missionTemplates = missions.filter(
    (mission) => mission.id !== editingId,
  );
  const missionTitle = form.name.trim();
  const formTitle =
    editingId && missionTitle
      ? `Редактирование задания "${missionTitle}"`
      : editingId
        ? "Редактирование задания"
        : "Настройка задания";

  return (
    <>
      <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/gamification/missions/wizard"
              className={`${primaryButtonClass} sm:min-w-64`}
            >
              Создать задание с помощью мастера
            </Link>
            <button
              type="button"
              className={`${smallButtonClass} text-sm sm:min-w-52`}
              onClick={onCreateNew}
            >
              Открыть старый редактор
            </button>
          </div>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-3">
            <RuleCommonFields
              status={form.status}
              name={form.name}
              rewardType={form.rewardType}
              rewardAmount={form.rewardAmount}
              rewardLabel={form.rewardLabel}
              audienceId={form.audienceId}
              budgetAmount={form.budgetAmount}
              budgetUnlimited={form.budgetUnlimited}
              manualApprovalRequired={form.manualApprovalRequired}
              note={form.note}
              audiences={audiences}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Тип задания">
                <OptionSelect
                  options={missionTypeOptions}
                  value={form.missionType}
                  preservedLabel="Сохраненный тип"
                  onChange={(missionType) => setForm({ ...form, missionType })}
                />
                <OptionHelp>
                  {missionTypeHelpText[form.missionType] ??
                    "Тип помогает сотруднику понять сценарий задания. Условия выполнения задаются ниже."}
                </OptionHelp>
              </Field>
              <Field label="Видимость задания">
                <OptionSelect
                  options={missionVisibilityOptions}
                  value={form.visibility}
                  preservedLabel="Сохраненная видимость"
                  onChange={(visibility) => setForm({ ...form, visibility })}
                />
                <OptionHelp>
                  {missionVisibilityHelpText[
                    missionVisibilityValue(form.visibility)
                  ] ?? missionVisibilityHelpText.VISIBLE}
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
                <OptionHelp>
                  Опыт, который игровой профиль гостя получит после выполнения
                  задания. XP повышает уровень и не влияет на цель задания.
                </OptionHelp>
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
                    setForm({
                      ...form,
                      ...missionProgressUnitPatch(form, progressUnit),
                    })
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
                <div className="space-y-2">
                  <input
                    className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
                    type="number"
                    min="1"
                    value={
                      form.perGuestLimitUnlimited ? "" : form.perGuestLimit
                    }
                    disabled={form.perGuestLimitUnlimited}
                    placeholder={
                      form.perGuestLimitUnlimited
                        ? "Без ограничений"
                        : undefined
                    }
                    onChange={(event) =>
                      setForm({ ...form, perGuestLimit: event.target.value })
                    }
                  />
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    <span>Безлимит</span>
                    <input
                      type="checkbox"
                      checked={form.perGuestLimitUnlimited}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          perGuestLimitUnlimited: event.target.checked,
                        })
                      }
                    />
                  </label>
                </div>
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
              {editingId ? "Сохранить" : "Создать задание"}
            </button>
            {editingId ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={onReset}
              >
                Сбросить выбор
              </button>
            ) : null}
          </div>
        ) : null
      }
      listTitle="Созданные правила заданий"
      items={missions}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("TASK", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`${missionTypeLabel(item.missionType)} · ${item.xpReward} XP`}
          meta={[
            item.audience?.name ?? "все гости",
            missionVisibilitySummary(item.conditions),
            missionAvailabilitySummary(item),
            `тип: ${sessionTypeLabel(stringRule(item.conditions, "sessionType", ""))}`,
            tariffRuleSummary(item.conditions),
            guestLogRuleSummary(item.conditions, item.antiFraudRules),
            missionMetricSummary(item.conditions),
            questRuleSummary(item.conditions),
            `${item.progressTarget ?? 1} ${item.progressUnit ?? "шаг"}`,
            formatBudgetAmount(item.budgetAmount),
          ]}
          details={<MissionQuestStepIdSummary mission={item} />}
          onEdit={() => setEditorChoice(item)}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
          onDelete={() => onDelete("missions", item.id, item.name)}
          deleteSaving={saving === `missions-delete-${item.id}`}
          canManage={canManage}
        />
      )}
      />
      {editorChoice ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditorChoice(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-editor-choice-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="mission-editor-choice-title"
              className="text-xl font-black text-zinc-950 dark:text-white"
            >
              Как редактировать задание?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              «{editorChoice.name}» можно открыть в мастере с live-предпросмотром
              или в старом расширенном редакторе.
            </p>
            <div className="mt-5 grid gap-3">
              {editorChoice.definitionVersion === 2 ? (
                <Link
                  href={`/gamification/missions/wizard?missionId=${encodeURIComponent(editorChoice.id)}`}
                  className={`${primaryButtonClass} justify-center text-center`}
                >
                  Открыть мастер с предпросмотром
                </Link>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Это правило создано в контракте v1. Для него доступен старый
                  редактор; новые правила v2 можно редактировать в мастере.
                </div>
              )}
              <button
                type="button"
                className={`${smallButtonClass} justify-center`}
                onClick={() => {
                  const mission = editorChoice;
                  setEditorChoice(null);
                  onEdit(mission);
                }}
              >
                Открыть старый редактор
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                onClick={() => setEditorChoice(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CheckInTab({
  form,
  setForm,
  missions,
  audiences,
  stores,
  tariffSnapshots,
  editingId,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];

  editingId: string | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (mission: GuestGameMission) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const showForm = isFormOpen && isCheckInMissionForm(form);
  const checkInTitle = form.name.trim();
  const formTitle =
    editingId && showForm && checkInTitle
      ? `Редактирование чек-ина "${checkInTitle}"`
      : editingId && showForm
        ? "Редактирование чек-ина"
        : "Настройка чек-ина";
  const rewardIsXp = form.rewardType === "XP";
  const xpRewardNumber = Number(form.xpReward);
  const xpEnabled =
    rewardIsXp || (Number.isFinite(xpRewardNumber) && xpRewardNumber > 0);

  function patchForm(patch: Partial<MissionForm>) {
    setForm(normalizeCheckInMissionForm({ ...form, ...patch }));
  }

  function selectRewardType(rewardType: string) {
    const nextIsXp = rewardType === "XP";
    const currentLabel = form.rewardLabel.trim();

    patchForm({
      rewardType,
      rewardAmount: nextIsXp
        ? "0"
        : form.rewardAmount && form.rewardAmount !== "0"
          ? form.rewardAmount
          : "50",
      xpReward: nextIsXp
        ? form.xpReward && form.xpReward !== "0"
          ? form.xpReward
          : "20"
        : form.xpReward,
      rewardLabel:
        currentLabel &&
        currentLabel !== "XP за чекин" &&
        currentLabel !== "Бонусы за чекин"
          ? currentLabel
          : nextIsXp
            ? "XP за чекин"
            : "Бонусы за чекин",
    });
  }

  function toggleXpReward(enabled: boolean) {
    patchForm({
      xpReward: enabled
        ? form.xpReward && form.xpReward !== "0"
          ? form.xpReward
          : "20"
        : "0",
    });
  }

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !showForm ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать правило чек-ина
          </button>
        ) : undefined
      }
      form={
        showForm ? (
          <div className="space-y-3">
            <RuleCommonFields
              status={form.status}
              name={form.name}
              rewardType={form.rewardType}
              rewardAmount={form.rewardAmount}
              rewardLabel={form.rewardLabel}
              audienceId={form.audienceId}
              budgetAmount={form.budgetAmount}
              budgetUnlimited={form.budgetUnlimited}
              manualApprovalRequired={form.manualApprovalRequired}
              note={form.note}
              audiences={audiences}
              hideRewardFields
              onChange={(patch) => patchForm(patch)}
            />

            <FormSection title="Награда за чек-ин">
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Основная награда">
                  <OptionSelect
                    options={checkInRewardTypeOptions}
                    value={form.rewardType}
                    preservedLabel="Сохраненный тип награды"
                    onChange={selectRewardType}
                  />
                </Field>
                {!rewardIsXp ? (
                  <Field label="Бонусы Langame">
                    <input
                      className={fieldClass}
                      type="number"
                      min="0"
                      value={form.rewardAmount}
                      onChange={(event) =>
                        patchForm({ rewardAmount: event.target.value })
                      }
                    />
                  </Field>
                ) : null}
                <Field label="Получать XP">
                  <ToggleField
                    label="Начислять опыт"
                    checked={xpEnabled}
                    disabled={rewardIsXp}
                    onChange={toggleXpReward}
                  />
                </Field>
                <Field label="XP за чек-ин">
                  <input
                    className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
                    type="number"
                    min="0"
                    value={form.xpReward}
                    disabled={!xpEnabled}
                    onChange={(event) =>
                      patchForm({ xpReward: event.target.value })
                    }
                  />
                  <OptionHelp>
                    Опыт начисляется вместе с основной наградой при каждом
                    успешном чек-ине.
                  </OptionHelp>
                </Field>
                <div className="md:col-span-4">
                  <Field label="Текст награды">
                    <input
                      className={fieldClass}
                      value={form.rewardLabel}
                      onChange={(event) =>
                        patchForm({ rewardLabel: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection title="Кнопка и клубы">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
                Кнопка чек-ина появится в игровом модуле выбранных клубов, когда
                правило активно. Backend дополнительно проверяет активную сессию
                гостя в Langame и не дает сделать повторный чек-ин в том же
                клубе до следующего календарного дня по времени клуба.
              </div>
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => patchForm({ storeIds })}
              />
            </FormSection>

            <FormSection title="Условия активной сессии">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип задания">
                  <input
                    className={fieldClass}
                    value="Чекин в клубе"
                    disabled
                    readOnly
                  />
                  <OptionHelp>
                    Чекин срабатывает только от события CHECK_IN.
                  </OptionHelp>
                </Field>
                <Field label="Тип сессии">
                  <select
                    className={fieldClass}
                    value={form.sessionType}
                    onChange={(event) =>
                      patchForm({ sessionType: event.target.value })
                    }
                  >
                    <option value="">любой тип</option>
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <OptionHelp>
                    Оставьте любой тип, если чек-ин доступен при любой активной
                    сессии. Выберите пакет/абонемент или почасовую сессию для
                    дополнительного ограничения.
                  </OptionHelp>
                </Field>
              </div>
              <TariffConditionFields
                snapshots={tariffSnapshots}
                tariffGroupId={form.tariffGroupId}
                tariffPeriodId={form.tariffPeriodId}
                tariffTypeId={form.tariffTypeId}
                onChange={patchForm}
              />
            </FormSection>

            <FormSection title="Служебные ограничения">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Общий лимит наград">
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    placeholder="без лимита"
                    value={form.totalRewardLimit}
                    onChange={(event) =>
                      patchForm({ totalRewardLimit: event.target.value })
                    }
                  />
                  <OptionHelp>
                    Лимит на одного гостя не задается здесь по умолчанию:
                    повторный чек-ин уже ограничен одним разом в день в одном
                    клубе.
                  </OptionHelp>
                </Field>
                <div className="space-y-2">
                  <ToggleField
                    label="Подтверждает кассир"
                    checked={form.requireCashierConfirmation}
                    onChange={(requireCashierConfirmation) =>
                      patchForm({ requireCashierConfirmation })
                    }
                  />
                  <ToggleField
                    label="Требовать ручную выдачу"
                    checked={form.manualApprovalRequired}
                    onChange={(manualApprovalRequired) =>
                      patchForm({ manualApprovalRequired })
                    }
                  />
                </div>
              </div>
            </FormSection>

            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "mission"}
              onClick={onSave}
            >
              {editingId ? "Сохранить" : "Создать правило чек-ина"}
            </button>
            {editingId ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={onReset}
              >
                Сбросить выбор
              </button>
            ) : null}
          </div>
        ) : null
      }
      listTitle="Настройки чек-ина"
      listSummary={
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
          Эти правила управляют кнопкой чек-ина в игровом модуле. Активное
          правило сразу попадает в визуальный редактор выбранного клуба.
        </div>
      }
      items={missions}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("CHECKIN", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`Кнопка чек-ина · ${
            item.rewardLabel ?? rewardTypeLabelFromValue(item.rewardType)
          }`}
          meta={[
            storeScopeLabel(item.storeIds, stores),
            item.audience?.name ?? "все гости",
            ...(item.xpReward > 0 ? [`+${item.xpReward} XP`] : []),
            `тип: ${sessionTypeLabel(stringRule(item.conditions, "sessionType", ""))}`,
            tariffRuleSummary(item.conditions),
            item.manualApprovalRequired ? "ручная выдача" : "автовыдача",
          ]}
          details={
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Один гость может сделать чек-ин в одном клубе один раз за
              календарный день по времени клуба.
            </p>
          }
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
          onDelete={() => onDelete("missions", item.id, item.name)}
          deleteSaving={saving === `missions-delete-${item.id}`}
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
  products,
  lootBoxes,
  editingId,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  canManage,
}: {
  form: SeasonForm;
  setForm: (form: SeasonForm) => void;
  seasons: GuestGameSeason[];
  audiences: GuestAudience[];
  stores: Store[];
  products: Product[];
  lootBoxes: GuestGameLootBox[];
  editingId: string | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (season: GuestGameSeason) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const seasonTitle = form.name.trim();
  const formTitle =
    editingId && seasonTitle
      ? `Редактирование Battle Pass "${seasonTitle}"`
      : editingId
        ? "Редактирование Battle Pass"
        : "Настройка Battle Pass";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый Battle Pass
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
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
                  value="Клубный сезон"
                  disabled
                  readOnly
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
              stores={stores}
              products={products}
              lootBoxes={lootBoxes}
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
              <BudgetField
                value={form.budgetAmount}
                unlimited={form.budgetUnlimited}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
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
              {editingId ? "Сохранить" : "Создать Battle Pass"}
            </button>
            {editingId ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={onReset}
              >
                Сбросить выбор
              </button>
            ) : null}
          </div>
        ) : null
      }
      listTitle="Созданные правила Battle Pass"
      items={seasons}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("BP", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`${seasonTypeLabel(item.seasonType)} · ${
            item.premiumEnabled ? "premium" : "free"
          }`}
          meta={[
            item.audience?.name ?? "все гости",
            `тип: ${sessionTypeLabel(stringRule(item.xpRules, "sessionType", ""))}`,
            tariffRuleSummary(item.xpRules),
            guestLogRuleSummary(item.xpRules),
            formatDate(item.periodFrom),
            formatBudgetAmount(item.budgetAmount),
          ]}
          details={<BattlePassLevelIdSummary season={item} />}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("seasons", item.id, status)}
          saving={saving === `seasons-${item.id}`}
          onDelete={() => onDelete("seasons", item.id, item.name)}
          deleteSaving={saving === `seasons-delete-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

function PromoBannersTab({
  form,
  setForm,
  promoCards,
  stores,
  editingId,
  notice,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  canManage,
}: {
  form: PromoBannerForm;
  setForm: (form: PromoBannerForm) => void;
  promoCards: GuestGamePromoCard[];
  stores: Store[];
  editingId: string | null;
  notice: PromoBannerNotice | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (promoCard: GuestGamePromoCard) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const promoBannerUsage = useMemo(
    () => buildPromoBannerUsage(promoCards, stores),
    [promoCards, stores],
  );
  const activePromoCards = promoCards.filter(
    (promoCard) => promoCard.status === "ACTIVE",
  ).length;
  const promoTitle = form.title.trim();
  const formTitle =
    editingId && promoTitle
      ? `Редактирование промо баннера "${promoTitle}"`
      : editingId
        ? "Редактирование промо баннера"
        : "Настройка промо баннера";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый промо баннер
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-4">
            {notice ? <PromoBannerNoticeBox notice={notice} /> : null}
            <FormSection title="Основное">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.6fr)]">
                <Field label="Название">
                  <input
                    className={fieldClass}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
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
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Лейбл">
                  <input
                    className={fieldClass}
                    value={form.label}
                    onChange={(event) =>
                      setForm({ ...form, label: event.target.value })
                    }
                  />
                </Field>
                <Field label="Тег">
                  <input
                    className={fieldClass}
                    value={form.tag}
                    onChange={(event) =>
                      setForm({ ...form, tag: event.target.value })
                    }
                  />
                </Field>
                <Field label="Приоритет">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Описание">
                <textarea
                  className={`${fieldClass} min-h-20`}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
            </FormSection>

            <FormSection title="Предпросмотр карточки банера">
              <PromoBannerImageEditor form={form} setForm={setForm} />
            </FormSection>

            <FormSection title="Показ и действие">
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => setForm({ ...form, storeIds })}
              />
              <div className="grid gap-3 md:grid-cols-2">
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
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Куда ведет">
                  <select
                    className={fieldClass}
                    value={form.targetAnchor}
                    onChange={(event) =>
                      setForm({ ...form, targetAnchor: event.target.value })
                    }
                  >
                    {promoTargetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Текст действия">
                  <input
                    className={fieldClass}
                    value={form.actionLabel}
                    onChange={(event) =>
                      setForm({ ...form, actionLabel: event.target.value })
                    }
                  />
                </Field>
                <Field label="Внешняя ссылка">
                  <input
                    className={fieldClass}
                    placeholder="https://example.com/promo или ts3server://1337community"
                    type="text"
                    value={form.actionUrl}
                    onChange={(event) =>
                      setForm({ ...form, actionUrl: event.target.value })
                    }
                  />
                </Field>
              </div>
            </FormSection>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className={`${primaryButtonClass} sm:min-w-44`}
                disabled={saving === "promoBanner"}
                onClick={onSave}
              >
                {editingId ? "Сохранить" : "Создать промо баннер"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onReset}
                >
                  Сбросить выбор
                </button>
              ) : null}
            </div>
          </div>
        ) : null
      }
      listTitle="Созданные промо баннеры"
      listSummary={
        <div className="space-y-3">
          {!isFormOpen && notice ? (
            <PromoBannerNoticeBox notice={notice} />
          ) : null}
          <PromoBannerLimitSummary
            activeCount={activePromoCards}
            totalCount={promoCards.length}
            usage={promoBannerUsage}
          />
        </div>
      }
      items={promoCards}
      layout="stacked"
      renderItem={(item) => {
        const metadata = promoCardMetadata(item);
        const imageUrl = metadataString(metadata, "imageUrl");
        const actionUrl = metadataString(metadata, "actionUrl");
        const usageInfo = promoBannerUsage.byCardId.get(item.id);

        return (
          <RuleCard
            key={item.id}
            eyebrow="Сохраненный баннер"
            trackingId={trackingId("BAN", item.id)}
            title={item.title}
            status={item.status}
            subtitle={`${item.label ?? "Промо"} · ${
              item.description ?? "без описания"
            }`}
            meta={[
              ...promoBannerUsageMeta(item, promoBannerUsage, stores),
              item.tag ?? "без тега",
              `приоритет ${item.priority}`,
              formatDate(item.periodTo) || "без срока",
            ]}
            details={
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
                  <PromoBannerThumbnail
                    imageUrl={imageUrl}
                    title={item.title}
                  />
                  <div className="min-w-0 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    <p>
                      Формат: 9:16
                      {imageUrl
                        ? " · изображение загружено"
                        : " · без изображения"}
                    </p>
                    <p>
                      Действие:{" "}
                      {metadataString(metadata, "actionLabel") ??
                        promoTargetLabel(item.targetAnchor)}
                    </p>
                    <p>Ссылка: {actionUrl ?? "не указана"}</p>
                  </div>
                </div>
                <PromoBannerVisibilityDetails usageInfo={usageInfo} />
              </div>
            }
            onEdit={() => onEdit(item)}
            onStatus={(status) => onStatus("promo-cards", item.id, status)}
            saving={saving === `promo-cards-${item.id}`}
            onDelete={() => onDelete("promo-cards", item.id, item.title)}
            deleteSaving={saving === `promo-cards-delete-${item.id}`}
            canManage={canManage}
          />
        );
      }}
    />
  );
}

function PromoBannerNoticeBox({ notice }: { notice: PromoBannerNotice }) {
  const className =
    notice.tone === "error"
      ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100";

  return <div className={className}>{notice.message}</div>;
}

function PromoBannerLimitSummary({
  usage,
  activeCount,
  totalCount,
}: {
  usage: PromoBannerUsageSummary;
  activeCount: number;
  totalCount: number;
}) {
  const overloadedStores = usage.stores.filter(
    (store) => store.overflowCount > 0,
  );

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 text-sm text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">
            В игровом модуле показывается до {PROMO_BANNER_DISPLAY_LIMIT}{" "}
            промо-баннеров на клуб.
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-800/80 dark:text-cyan-100/80">
            Сейчас показывается {usage.visibleCardIds.size} из {activeCount}{" "}
            активных правил. Всего создано {totalCount}.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:bg-cyan-950 dark:text-cyan-100">
          лимит {PROMO_BANNER_DISPLAY_LIMIT}
        </span>
      </div>
      {overloadedStores.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {overloadedStores.slice(0, 4).map((store) => (
            <div
              key={store.storeId}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <span className="font-bold">{store.storeName}</span>:{" "}
              {store.visibleCount} показывается, {store.overflowCount} сверх
              лимита.
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-cyan-800/80 dark:text-cyan-100/80">
          Превышений по клубам нет: все активные баннеры, подходящие по датам,
          входят в доступные слоты.
        </p>
      )}
    </div>
  );
}

function PromoBannerVisibilityDetails({
  usageInfo,
}: {
  usageInfo: PromoBannerUsageInfo | undefined;
}) {
  if (!usageInfo?.overflowStoreNames.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      Не показывается для {compactStoreNames(usageInfo.overflowStoreNames)}: в
      игровом модуле уже заняты {PROMO_BANNER_DISPLAY_LIMIT} слота более
      приоритетными или более новыми баннерами.
    </div>
  );
}

function PromoBannerImageEditor({
  form,
  setForm,
}: {
  form: PromoBannerForm;
  setForm: (form: PromoBannerForm) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSnapshot, setEditorSnapshot] = useState<PromoBannerForm | null>(
    null,
  );
  const [dragState, setDragState] = useState<PromoBannerDragState | null>(null);
  const source = form.imageSource || form.imageUrl;
  const scale = Number(form.imageScale) || 1;
  const offsetX = Number(form.imageOffsetX) || 0;
  const offsetY = Number(form.imageOffsetY) || 0;

  function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageSource =
        typeof reader.result === "string" ? reader.result : "";
      setForm({
        ...form,
        imageSource,
        imageUrl: "",
        imageScale: "1",
        imageOffsetX: "0",
        imageOffsetY: "0",
      });
    };
    reader.readAsDataURL(file);
  }

  function openEditor() {
    if (!source) {
      return;
    }

    setEditorSnapshot(form);

    if (!form.imageSource) {
      setForm({
        ...form,
        imageSource: source,
        imageScale: "1",
        imageOffsetX: "0",
        imageOffsetY: "0",
      });
    }

    setEditorOpen(true);
  }

  function closeEditor() {
    if (editorSnapshot) {
      setForm(editorSnapshot);
      setEditorSnapshot(null);
    }

    setEditorOpen(false);
  }

  async function applyCrop(closeEditor = false) {
    const imageUrl = await renderPromoBannerImage(form);
    setForm({
      ...form,
      imageUrl,
      imageSource: "",
    });
    setEditorSnapshot(null);

    if (closeEditor) {
      setEditorOpen(false);
    }
  }

  function updateScale(nextScale: number) {
    setForm({
      ...form,
      imageScale: formatPromoBannerNumber(clampPromoBannerScale(nextScale)),
    });
  }

  function resetCrop() {
    setForm({
      ...form,
      imageScale: "1",
      imageOffsetX: "0",
      imageOffsetY: "0",
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!source) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const nextOffsetX = clampPromoBannerOffset(
      dragState.offsetX +
        ((event.clientX - dragState.startX) / rect.width) * 100,
    );
    const nextOffsetY = clampPromoBannerOffset(
      dragState.offsetY +
        ((event.clientY - dragState.startY) / rect.height) * 100,
    );

    setForm({
      ...form,
      imageOffsetX: formatPromoBannerNumber(nextOffsetX),
      imageOffsetY: formatPromoBannerNumber(nextOffsetY),
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragState(null);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="mx-auto w-[240px] max-w-full">
          <PromoBannerCardPreview
            form={form}
            source={source}
            onEdit={source ? openEditor : undefined}
          />
        </div>
        <div className="space-y-3">
          <Field label="Изображение">
            <input
              className={fieldClass}
              type="file"
              accept="image/*"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {source ? (
              <button
                type="button"
                className={smallButtonClass}
                onClick={() =>
                  setForm({
                    ...form,
                    imageUrl: "",
                    imageSource: "",
                  })
                }
              >
                Убрать изображение
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {editorOpen && source ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-4xl rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
                  Редактирование кадра
                </p>
                <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                  {form.title || "Промо баннер"}
                </h3>
              </div>
              <button
                type="button"
                className={smallButtonClass}
                onClick={closeEditor}
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 flex justify-center">
              <div
                className={[
                  "relative touch-none select-none overflow-hidden rounded-lg",
                  dragState ? "cursor-grabbing" : "cursor-grab",
                ].join(" ")}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                style={{
                  width:
                    "min(420px, calc((100vh - 180px) * 0.5625), calc(100vw - 48px))",
                }}
              >
                <PromoBannerCardPreview form={form} source={source} />
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" />
                <div
                  className="absolute inset-x-3 bottom-3 rounded-lg border border-white/20 bg-black/70 p-2 text-white shadow-lg backdrop-blur"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-lg font-bold transition hover:bg-white/20"
                      onClick={() => updateScale(scale - 0.1)}
                    >
                      -
                    </button>
                    <input
                      aria-label="Масштаб кадра"
                      className="min-w-0 flex-1 accent-cyan-300"
                      max="3"
                      min="1"
                      step="0.01"
                      type="range"
                      value={form.imageScale}
                      onChange={(event) =>
                        updateScale(Number(event.target.value))
                      }
                    />
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-lg font-bold transition hover:bg-white/20"
                      onClick={() => updateScale(scale + 0.1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold transition hover:bg-white/10"
                      onClick={resetCrop}
                    >
                      Сбросить кадр
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-cyan-200"
                      onClick={() => applyCrop(true)}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PromoBannerCardPreview({
  form,
  source,
  onEdit,
}: {
  form: PromoBannerForm;
  source: string;
  onEdit?: () => void;
}) {
  const title = form.title.trim() || "Название баннера";
  const label = form.label.trim() || "Акция";
  const description = form.description.trim() || "Короткое описание баннера.";
  const tag = form.tag.trim() || statusLabels[form.status];
  const priority = Number(form.priority);
  const isFeatured = Number.isFinite(priority) && priority <= 0;
  const accent = isFeatured ? "208, 170, 108" : "131, 228, 236";
  const canTransformImage = Boolean(form.imageSource);
  const scale = clampPromoBannerScale(Number(form.imageScale) || 1);
  const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX) || 0);
  const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY) || 0);
  const titleStyle = promoBannerPreviewTitleStyle(title);
  const baseBackground = isFeatured
    ? "linear-gradient(180deg, rgba(208, 170, 108, 0.17), transparent 36%), rgba(7, 12, 16, 0.86)"
    : "linear-gradient(180deg, rgba(131, 228, 236, 0.11), transparent 34%), rgba(5, 11, 14, 0.82)";
  const textureBackground = source
    ? `linear-gradient(180deg, rgba(3, 7, 9, 0.08), rgba(3, 7, 9, 0.66)), linear-gradient(135deg, transparent 0 34%, rgba(${accent}, 0.12) 34% 35%, transparent 35% 100%)`
    : isFeatured
      ? "radial-gradient(circle at 70% 18%, rgba(208, 170, 108, 0.2), transparent 24%), linear-gradient(135deg, transparent 0 38%, rgba(208, 170, 108, 0.15) 38% 39%, transparent 39% 100%)"
      : "linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%), radial-gradient(circle at 72% 18%, rgba(131, 228, 236, 0.16), transparent 24%)";

  return (
    <div
      className="relative aspect-[9/16] overflow-hidden rounded-lg border border-[#c4e0e12e] text-[#f4fbfb] shadow-sm"
      style={{ background: baseBackground }}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          src={source}
          style={
            canTransformImage
              ? {
                  transformOrigin: "center",
                  transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
                }
              : undefined
          }
        />
      ) : (
        <div className="absolute inset-0" />
      )}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: textureBackground }}
      />
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-[18px]">
        <span>
          <span className="block text-[9px] font-[820] uppercase tracking-[0.14em] text-[#7f9294]">
            {label}
          </span>
          <span
            className="mt-[18px] block font-[780] text-[#f4fbfb]"
            style={titleStyle}
          >
            {title}
          </span>
          <span className="mt-2.5 block text-xs leading-[1.45] text-[#a8b9ba]">
            {description}
          </span>
        </span>
        <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#c4e0e124] px-2.5 py-2 text-[9px] font-[860] uppercase tracking-[0.12em] text-[#83e4ec]">
          {tag}
        </span>
      </div>
      {onEdit ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-20 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-cyan-100"
          onClick={onEdit}
        >
          Редактировать
        </button>
      ) : null}
    </div>
  );
}

function promoBannerPreviewTitleStyle(title: string): CSSProperties {
  const size = promoBannerPreviewTitleSize(title);

  return {
    fontSize: `${size}px`,
    lineHeight: size <= 18 ? 1.08 : 1.05,
    overflowWrap: "anywhere",
  };
}

function promoBannerPreviewTitleSize(title: string) {
  const letterCount = Array.from(title).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  ).length;

  if (letterCount >= 30) {
    return 16;
  }

  if (letterCount >= 24) {
    return 17;
  }

  if (letterCount >= 20) {
    return 19;
  }

  if (letterCount >= 16) {
    return 21;
  }

  return 24;
}

function clampPromoBannerScale(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(3, Math.max(1, value));
}

function clampPromoBannerOffset(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(45, Math.max(-45, value));
}

function formatPromoBannerNumber(value: number) {
  return String(Math.round(value * 100) / 100);
}

function PromoBannerThumbnail({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <div className="aspect-[9/16] w-[72px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="h-full w-full object-cover"
          src={imageUrl}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] font-bold text-zinc-400">
          9:16
        </div>
      )}
    </div>
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
          !query ||
          rewardSearchTokens(reward).some((token) => token.includes(query));

        return matchesType && matchesStore && matchesSearch;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.qualifiedAt).getTime();
        const rightTime = new Date(right.qualifiedAt).getTime();

        return rewardSort === "newest"
          ? rightTime - leftTime
          : leftTime - rightTime;
      });
  }, [
    rewardSearch,
    rewardSort,
    rewards,
    selectedRewardTypes,
    selectedStoreIds,
  ]);

  const rewardStoreOptions = useMemo(() => {
    const rewardStoreIds = new Set(
      rewards.map((reward) => reward.store?.id).filter(Boolean),
    );
    const storesWithRewards = stores.filter((store) =>
      rewardStoreIds.has(store.id),
    );

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
                Создать приз вручную или поправить выбранную награду из
                кошелька.
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
                    onChange={(rewardType) => setForm({ ...form, rewardType })}
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
                label="Задание"
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
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onReset}
                >
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
                  <span className="font-bold">
                    {redeemedReward.rewardLabel}
                  </span>
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
                  Погашение проверяет код, клуб и статус награды, затем
                  закрывает приз как выданный и защищает его от повторного
                  использования.
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
            <EmptyState
              text={
                rewards.length ? "По фильтрам наград нет" : "Наград пока нет"
              }
            />
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
  const isPeriodicLootBox = form.periodicLimitEnabled;

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
      {form.triggerKind === "GUEST_LOG" ? (
        <GuestLogConditionFields
          guestLogTypes={form.guestLogTypes}
          blockedGuestLogTypes={form.blockedGuestLogTypes}
          catalog={guestLogCatalog}
          onChange={onChange}
        />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Лимит на одного гостя
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Включите периодичность, если лутбокс можно открывать регулярно, но
            не чаще одного раза за выбранный период.
          </p>
          <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={isPeriodicLootBox}
              onChange={(event) =>
                onChange({
                  periodicLimitEnabled: event.target.checked,
                  periodicLimitPeriod: form.periodicLimitPeriod || "DAILY",
                  perGuestPerWeek: event.target.checked
                    ? form.perGuestPerWeek
                    : form.perGuestPerWeek || "1",
                })
              }
            />
            <span>Периодический?</span>
          </label>
          {isPeriodicLootBox ? (
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Период
              <select
                className={fieldClass}
                value={form.periodicLimitPeriod}
                onChange={(event) =>
                  onChange({
                    periodicLimitPeriod:
                      lootBoxPeriodicLimitPeriod(event.target.value) ?? "DAILY",
                  })
                }
              >
                {lootBoxPeriodicLimitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500 dark:text-zinc-400">
                Один гость сможет открыть этот лутбокс один раз за выбранный
                календарный период. После начала нового периода он снова станет
                доступен.
              </span>
            </label>
          ) : (
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
              <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500 dark:text-zinc-400">
                Укажите, сколько раз один гость может открыть этот лутбокс за
                неделю. Для регулярных кейсов включите периодичность выше.
              </span>
            </label>
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
              onChange={(event) =>
                onChange({ totalPerDay: event.target.value })
              }
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

function LootBoxRuleFilters({
  stores,
  storeId,
  triggerKind,
  totalCount,
  visibleCount,
  onStoreIdChange,
  onTriggerKindChange,
  onReset,
}: {
  stores: Store[];
  storeId: string;
  triggerKind: string;
  totalCount: number;
  visibleCount: number;
  onStoreIdChange: (storeId: string) => void;
  onTriggerKindChange: (triggerKind: string) => void;
  onReset: () => void;
}) {
  const filtersActive = Boolean(storeId || triggerKind);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <Field label="Фильтр по клубу">
          <select
            className={fieldClass}
            value={storeId}
            onChange={(event) => onStoreIdChange(event.target.value)}
          >
            <option value="">Все клубы</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Фильтр по событию">
          <select
            className={fieldClass}
            value={triggerKind}
            onChange={(event) => onTriggerKindChange(event.target.value)}
          >
            <option value="">Все события</option>
            {lootBoxTriggerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={smallButtonClass}
          disabled={!filtersActive}
          onClick={onReset}
        >
          Сбросить
        </button>
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Показано {visibleCount} из {totalCount}
      </p>
    </div>
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
              const timeWindowMode = event.target
                .value as LootBoxTimeWindowMode;

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
  const sortedPrizes = [...prizes].sort(
    (left, right) =>
      numeric(right.chancePercent, 0) - numeric(left.chancePercent, 0),
  );
  const topPrize = sortedPrizes[0] ?? null;
  const chanceDiff = Math.round((100 - chanceTotal) * 100) / 100;
  const isChanceBalanced = Math.abs(chanceDiff) < 0.01;
  const chanceStatus = isChanceBalanced
    ? "Сумма шансов 100%"
    : chanceDiff > 0
      ? `Осталось ${formatChanceNumber(chanceDiff)}%`
      : `Превышение ${formatChanceNumber(Math.abs(chanceDiff))}%`;
  const chanceStatusClass = isChanceBalanced
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

      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Варианты наград
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {prizes.length === 1 ? "1 приз" : `${prizes.length} призов`}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Самый частый приз
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {topPrize?.rewardLabel || "Не задан"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Итоговая сумма
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {formatChanceNumber(chanceTotal)}%
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          {sortedPrizes.map((prize, index) => {
            const chance = Math.max(0, numeric(prize.chancePercent, 0));

            return (
              <div
                key={prize.id}
                className={[
                  "h-full",
                  index % 4 === 0
                    ? "bg-cyan-500"
                    : index % 4 === 1
                      ? "bg-emerald-500"
                      : index % 4 === 2
                        ? "bg-amber-500"
                        : "bg-fuchsia-500",
                ].join(" ")}
                style={{ width: `${chance}%` }}
                title={`${prize.rewardLabel}: ${formatChanceNumber(chance)}%`}
              />
            );
          })}
        </div>
        {!isChanceBalanced ? (
          <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-200">
            Сумма должна быть 100%. Сейчас шанс будет работать как вес, но
            оператору проще проверять шаблон, когда проценты выровнены.
          </p>
        ) : null}
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

function LootBoxRulePrizeSummary({ lootBox }: { lootBox: GuestGameLootBox }) {
  const prizes = lootBoxPrizesToForm(lootBox.probabilityRules, {
    rewardType: lootBox.rewardType,
    rewardAmount: String(lootBox.rewardAmount ?? 0),
    rewardLabel: lootBox.rewardLabel ?? lootBox.name,
  });
  const sortedPrizes = [...prizes].sort(
    (left, right) =>
      numeric(right.chancePercent, 0) - numeric(left.chancePercent, 0),
  );
  const chanceTotal = prizes.reduce(
    (total, prize) => total + Math.max(0, numeric(prize.chancePercent, 0)),
    0,
  );
  const isChanceBalanced = Math.abs(100 - chanceTotal) < 0.01;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Распределение призов
        </p>
        <span
          className={[
            "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
            isChanceBalanced
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
          ].join(" ")}
        >
          {formatChanceNumber(chanceTotal)}%
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {sortedPrizes.slice(0, 3).map((prize) => {
          const chance = Math.max(0, numeric(prize.chancePercent, 0));

          return (
            <div
              key={prize.id}
              className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">
                  {prize.rewardLabel}
                </span>
                <span className="shrink-0 font-bold text-zinc-950 dark:text-white">
                  {formatChanceNumber(chance)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{ width: `${Math.max(2, chance)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {sortedPrizes.length > 3 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Еще призов: {sortedPrizes.length - 3}
        </p>
      ) : null}
    </div>
  );
}

function MissionQuestStepIdSummary({ mission }: { mission: GuestGameMission }) {
  const steps = missionQuestSteps(mission.conditions);

  if (!steps.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        ID шагов задания
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {steps.map((step, index) => (
          <div
            key={step.id || index}
            className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="font-bold text-cyan-700 dark:text-cyan-300">
              {trackingId("TASKSTEP", `${mission.id}-${step.id || index + 1}`)}
            </p>
            <p className="mt-1 truncate text-zinc-600 dark:text-zinc-300">
              {index + 1}. {step.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BattlePassLevelIdSummary({ season }: { season: GuestGameSeason }) {
  const levels = battlePassLevelRows(season);

  if (!levels.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        ID заданий Battle Pass
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {levels.slice(0, 9).map((level) => (
          <div
            key={level.id}
            className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="font-bold text-cyan-700 dark:text-cyan-300">
              {level.id}
            </p>
            <p className="mt-1 truncate font-medium text-zinc-700 dark:text-zinc-200">
              Уровень {level.level}
            </p>
            <p className="truncate text-zinc-500 dark:text-zinc-400">
              {level.label}
              {level.xp !== null ? ` · ${level.xp} XP` : ""}
            </p>
          </div>
        ))}
      </div>
      {levels.length > 9 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Еще уровней: {levels.length - 9}
        </p>
      ) : null}
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
            <option value="" disabled>
              Выберите тип
            </option>
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
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
              onChange={(event) =>
                onChange({ metricHours: event.target.value })
              }
            />
          </Field>
        </div>
        {missionUsesProductMetric(form) ? (
          <MissionProductMetricSelector
            products={products}
            selectedStoreIds={form.storeIds}
            productIds={form.metricProductIds}
            externalProductIds={form.metricExternalProductIds}
            categoryIds={form.metricCategoryIds}
            categoryNames={form.metricCategoryNames}
            onChange={onChange}
          />
        ) : null}
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
              Цепочка заданий
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Разбейте задание на понятные гостю шаги. В публичном кабинете они
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
            Задание засчитывается только по подтвержденному сохраненному факту:
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
          Шаг можно связать с сохраненным заданием-шаблоном или оставить ручной
          подписью. В цепочке сохраняется ссылка на выбранное задание и текст,
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
                onChange={(event) => selectTemplate(index, event.target.value)}
              >
                <option value="">
                  {missionTemplates.length
                    ? "Без шаблона"
                    : "Сначала сохраните задание"}
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
          заданий.
        </OptionHelp>
      </div>
    </div>
  );
}

function SeasonBusinessRules({
  form,
  stores,
  products,
  lootBoxes,
  onChange,
}: {
  form: SeasonForm;
  stores: Store[];
  products: Product[];
  lootBoxes: GuestGameLootBox[];
  onChange: (patch: Partial<SeasonForm>) => void;
}) {
  const updateStep = (index: number, patch: Partial<SeasonLevelStepForm>) => {
    onChange({
      levelSteps: form.levelSteps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    });
  };
  const addStep = () => {
    const nextLevel =
      form.levelSteps.reduce(
        (maxLevel, step) => Math.max(maxLevel, numeric(step.level, 0)),
        0,
      ) + 1;
    onChange({
      levelCount: String(Math.max(numeric(form.levelCount, 0), nextLevel)),
      levelSteps: [
        ...form.levelSteps,
        {
          id: nextSeasonStepId(),
          level: String(nextLevel),
          xp: "0",
          title: `Этап ${nextLevel}`,
          condition: `Выполните условие шага ${nextLevel}.`,
          description: "",
          freeReward: "",
          premiumReward: "",
          conditionV2: { ...defaultBattlePassStepCondition },
          triggerKind: "",
          sessionType: "",
          timeWindowMode: "ANY",
          weekdayMode: "ANY",
          selectedWeekdays: weekdayPresets.ANY,
          hourFrom: "10:00",
          hourTo: "16:00",
          tariffGroupId: "",
          tariffPeriodId: "",
          tariffTypeId: "",
          guestLogTypes: "",
          blockedGuestLogTypes: "",
          freeRewardType: "",
          freeRewardAmount: "",
          freeRewardLabel: "",
          freeRewardCode: "",
          freeRewardLootBoxId: "",
          freeRewardLootBoxName: "",
          freeRewardLootBoxRarity: "common",
          freeRewardDelivery: "AUTO",
          premiumRewardType: "",
          premiumRewardAmount: "",
          premiumRewardLabel: "",
          premiumRewardCode: "",
          premiumRewardLootBoxId: "",
          premiumRewardLootBoxName: "",
          premiumRewardLootBoxRarity: "common",
          premiumRewardDelivery: "AUTO",
        },
      ],
    });
  };
  const removeStep = (index: number) => {
    const levelSteps = form.levelSteps.filter(
      (_, stepIndex) => stepIndex !== index,
    );
    onChange({
      levelSteps,
      levelCount: String(Math.max(1, levelSteps.length)),
    });
  };
  const mainRewardStepIndex = form.levelSteps.length - 1;
  const mainRewardStep =
    mainRewardStepIndex >= 0 ? form.levelSteps[mainRewardStepIndex] : null;
  const sortedLevelSteps = form.levelSteps
    .map((step, index) => ({ step, index }))
    .sort((left, right) => {
      const leftLevel = numeric(left.step.level, left.index + 1);
      const rightLevel = numeric(right.step.level, right.index + 1);

      return rightLevel - leftLevel || right.index - left.index;
    });

  return (
    <BusinessRuleSection
      title="Лестница Battle Pass"
      description="Настройте последовательные шаги сезона: каждый следующий шаг станет доступен только после выполнения предыдущего."
    >
      <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 text-sm leading-6 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-100">
        Battle Pass теперь проходит по шагам. Настройте действие для каждого
        шага ниже: первый шаг проверяется первым, второй начнет проверяться
        только после выполнения первого, и так далее.
      </div>

      <BattlePassRewardSummary form={form} lootBoxes={lootBoxes} />

      {mainRewardStep ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 ring-1 ring-amber-100 dark:border-amber-500/35 dark:bg-amber-950/20 dark:ring-amber-400/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                Главная награда сезона
              </p>
              <h4 className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">
                Выдается за прохождение последнего шага Battle Pass
              </h4>
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                Сейчас это шаг {mainRewardStepIndex + 1}:{" "}
                {mainRewardStep.title?.trim() || "финальный этап"}.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/30">
              Финал
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SeasonStepRewardFields
              title="Главная Free награда"
              prefix="free"
              step={mainRewardStep}
              lootBoxes={lootBoxes}
              onChange={(patch) => updateStep(mainRewardStepIndex, patch)}
            />
            <SeasonStepRewardFields
              title="Главная Premium награда"
              prefix="premium"
              step={mainRewardStep}
              lootBoxes={lootBoxes}
              onChange={(patch) => updateStep(mainRewardStepIndex, patch)}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/35">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Шаги Battle Pass
            </h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Каждый шаг можно настроить отдельно: действие для выполнения,
              пояснение и награды для free/premium дорожек.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={smallButtonClass}
              onClick={addStep}
            >
              Добавить шаг
            </button>
          </div>
        </div>
        {sortedLevelSteps.map(({ step, index }) => (
          <div
            key={step.id || `${step.level}-${index}`}
            className="relative space-y-4 rounded-xl border border-t-4 border-zinc-200 border-t-cyan-500 bg-white p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-700 dark:border-t-cyan-400 dark:bg-zinc-950/70 dark:shadow-black/30 dark:ring-cyan-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-500/30">
                Шаг {step.level.trim() || index + 1}
              </span>
              <button
                type="button"
                className={dangerButtonClass}
                disabled={form.levelSteps.length <= 1}
                onClick={() => removeStep(index)}
              >
                Удалить шаг
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Порядок шага">
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  value={step.level}
                  onChange={(event) =>
                    updateStep(index, { level: event.target.value })
                  }
                />
              </Field>
              <Field label="Название этапа">
                <input
                  className={fieldClass}
                  value={step.title}
                  onChange={(event) =>
                    updateStep(index, { title: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Что должен сделать гость">
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={step.condition}
                  onChange={(event) =>
                    updateStep(index, { condition: event.target.value })
                  }
                />
              </Field>
              <Field label="Подробное пояснение">
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={step.description}
                  onChange={(event) =>
                    updateStep(index, { description: event.target.value })
                  }
                />
              </Field>
            </div>
            <SeasonStepActivationFieldsV2
              step={step}
              storeIds={form.storeIds}
              stores={stores}
              products={products}
              onChange={(patch) => updateStep(index, patch)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SeasonStepRewardFields
                title="Free награда"
                prefix="free"
                step={step}
                lootBoxes={lootBoxes}
                onChange={(patch) => updateStep(index, patch)}
              />
              <SeasonStepRewardFields
                title="Premium награда"
                prefix="premium"
                step={step}
                lootBoxes={lootBoxes}
                onChange={(patch) => updateStep(index, patch)}
              />
            </div>
          </div>
        ))}
      </div>
    </BusinessRuleSection>
  );
}

type BattlePassRewardTrackSummary = {
  rewardCount: number;
  lootBoxCount: number;
  linkedLootBoxCount: number;
  minBonus: number;
  expectedBonus: number;
  maxBonus: number;
  fixedRewards: string[];
  unresolved: string[];
};

function BattlePassRewardSummary({
  form,
  lootBoxes,
}: {
  form: SeasonForm;
  lootBoxes: GuestGameLootBox[];
}) {
  const free = battlePassRewardTrackSummary(form, "free", lootBoxes);
  const premium = battlePassRewardTrackSummary(form, "premium", lootBoxes);
  const tracks = [
    { key: "free", label: "Free-дорожка", summary: free },
    ...(form.premiumEnabled
      ? [{ key: "premium", label: "Premium-дорожка", summary: premium }]
      : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/15">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
          Итог за полное прохождение
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          Диапазон учитывает суммы бонусов и все исходы привязанных лутбоксов.
          Остальные призы перечислены отдельно и не переводятся в бонусы или
          рубли.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {tracks.map(({ key, label, summary }) => (
          <div
            key={key}
            className="rounded-lg border border-emerald-200/80 bg-white/80 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                {label}
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {summary.rewardCount} наград
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <BattlePassRewardMetric
                label="Минимум"
                value={`${formatRewardNumber(summary.minBonus)} бонусов`}
              />
              <BattlePassRewardMetric
                label="Ожидаемо"
                value={`${formatRewardNumber(summary.expectedBonus)} бонусов`}
              />
              <BattlePassRewardMetric
                label="Максимум"
                value={`${formatRewardNumber(summary.maxBonus)} бонусов`}
              />
            </div>
            {summary.lootBoxCount ? (
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                Лутбоксы: {summary.linkedLootBoxCount} из {summary.lootBoxCount}{" "}
                привязаны к таблицам призов.
              </p>
            ) : null}
            {summary.fixedRewards.length ? (
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                Другие награды: {summary.fixedRewards.join(", ")}.
              </p>
            ) : null}
            {summary.unresolved.length ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
                Нельзя посчитать: {summary.unresolved.join("; ")}.
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BattlePassRewardMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-100 px-2 py-2 dark:bg-zinc-900">
      <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-semibold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function SeasonStepActivationFieldsV2({
  step,
  storeIds,
  stores,
  products,
  onChange,
}: {
  step: SeasonLevelStepForm;
  storeIds: string[];
  stores: Store[];
  products: Product[];
  onChange: (patch: Partial<SeasonLevelStepForm>) => void;
}) {
  return (
    <BattlePassStepConditionEditor
      value={step.conditionV2 ?? defaultBattlePassStepCondition}
      storeIds={storeIds}
      stores={stores}
      products={products}
      onChange={(conditionV2) => onChange({ conditionV2 })}
    />
  );
}

function SeasonStepRewardFields({
  title,
  prefix,
  step,
  lootBoxes,
  onChange,
}: {
  title: string;
  prefix: "free" | "premium";
  step: SeasonLevelStepForm;
  lootBoxes: GuestGameLootBox[];
  onChange: (patch: Partial<SeasonLevelStepForm>) => void;
}) {
  const typeKey = `${prefix}RewardType` as const;
  const amountKey = `${prefix}RewardAmount` as const;
  const labelKey = `${prefix}RewardLabel` as const;
  const codeKey = `${prefix}RewardCode` as const;
  const lootBoxIdKey = `${prefix}RewardLootBoxId` as const;
  const lootBoxNameKey = `${prefix}RewardLootBoxName` as const;
  const lootBoxRarityKey = `${prefix}RewardLootBoxRarity` as const;
  const deliveryKey = `${prefix}RewardDelivery` as const;
  const legacyKey = `${prefix}Reward` as const;
  const rewardType =
    step[typeKey] ?? (step[legacyKey]?.trim() ? "ADMIN_OTHER" : "");
  const currentLootBoxId = step[lootBoxIdKey] ?? "";
  const rewardLootBoxes = lootBoxes.filter(
    (lootBox) =>
      lootBoxCanBeRewardTemplate(lootBox) || lootBox.id === currentLootBoxId,
  );

  const patchReward = (patch: Partial<SeasonLevelStepForm>) => {
    const next = { ...step, ...patch };
    const legacyLabel = seasonStepRewardLabel(next, prefix);

    onChange({
      ...patch,
      [legacyKey]: legacyLabel,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип награды">
          <select
            className={fieldClass}
            value={rewardType}
            onChange={(event) =>
              patchReward({
                [typeKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          >
            {battlePassStepRewardTypeOptions.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Выдача">
          <select
            className={fieldClass}
            value={step[deliveryKey] ?? "AUTO"}
            onChange={(event) =>
              patchReward({
                [deliveryKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          >
            {battlePassStepRewardDeliveryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {rewardType === "BONUS_BALANCE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Сумма бонусов">
            <input
              className={fieldClass}
              type="number"
              min="0"
              value={step[amountKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [amountKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
          <Field label="Название награды">
            <input
              className={fieldClass}
              value={step[labelKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [labelKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
        </div>
      ) : null}
      {rewardType === "PROMOCODE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название промокода">
            <input
              className={fieldClass}
              value={step[labelKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [labelKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
          <Field label="Код или префикс">
            <input
              className={fieldClass}
              value={step[codeKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [codeKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
        </div>
      ) : null}
      {rewardType === "LOOT_BOX" ? (
        <div className="space-y-3">
          <Field label="Лутбокс для награды">
            <select
              className={fieldClass}
              value={step[lootBoxIdKey] ?? ""}
              onChange={(event) => {
                const selectedLootBox =
                  rewardLootBoxes.find(
                    (lootBox) => lootBox.id === event.target.value,
                  ) ?? null;

                patchReward({
                  [lootBoxIdKey]: selectedLootBox?.id ?? "",
                  [lootBoxNameKey]:
                    selectedLootBox?.name ?? step[lootBoxNameKey] ?? "",
                  [lootBoxRarityKey]: selectedLootBox
                    ? lootBoxCaseRarity(selectedLootBox.probabilityRules)
                    : (step[lootBoxRarityKey] ?? "common"),
                  [labelKey]: selectedLootBox?.name ?? step[labelKey] ?? "",
                } as Partial<SeasonLevelStepForm>);
              }}
            >
              <option value="">Выберите конкретный лутбокс</option>
              {rewardLootBoxes.map((lootBox) => (
                <option key={lootBox.id} value={lootBox.id}>
                  {lootBox.name} · {lootBoxUsageKindLabels[lootBox.usageKind]}
                </option>
              ))}
            </select>
            <OptionHelp>
              Можно использовать активный витринный или подарочный лутбокс. Его
              таблица призов будет участвовать в расчете минимальной, ожидаемой
              и максимальной награды Battle Pass.
            </OptionHelp>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название награды">
              <input
                className={fieldClass}
                value={step[lootBoxNameKey] ?? ""}
                onChange={(event) =>
                  patchReward({
                    [lootBoxIdKey]: "",
                    [lootBoxNameKey]: event.target.value,
                  } as Partial<SeasonLevelStepForm>)
                }
              />
            </Field>
            <Field label="Качество кейса">
              <select
                className={fieldClass}
                value={step[lootBoxRarityKey] ?? "common"}
                onChange={(event) =>
                  patchReward({
                    [lootBoxRarityKey]: event.target.value as LootBoxCaseRarity,
                  } as Partial<SeasonLevelStepForm>)
                }
              >
                {lootBoxCaseRarityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      ) : null}
      {rewardType === "ADMIN_OTHER" ? (
        <Field label="Что выдать">
          <input
            className={fieldClass}
            value={step[labelKey] ?? step[legacyKey] ?? ""}
            onChange={(event) =>
              patchReward({
                [labelKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          />
        </Field>
      ) : null}
    </div>
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
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function BudgetField({
  value,
  unlimited,
  onChange,
}: {
  value: string;
  unlimited: boolean;
  onChange: (patch: {
    budgetAmount?: string;
    budgetUnlimited?: boolean;
  }) => void;
}) {
  return (
    <Field label="Бюджет">
      <div className="space-y-2">
        <input
          className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
          type="number"
          min="0"
          value={unlimited ? "" : value}
          disabled={unlimited}
          placeholder={unlimited ? "Без ограничений" : undefined}
          onChange={(event) => onChange({ budgetAmount: event.target.value })}
        />
        <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <span>Безлимит</span>
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(event) =>
              onChange({ budgetUnlimited: event.target.checked })
            }
          />
        </label>
      </div>
    </Field>
  );
}

function RuleCommonFields({
  status,
  name,
  ruleKind,
  lootBoxUsageKind,
  rewardType,
  rewardAmount,
  rewardLabel,
  audienceId,
  budgetAmount,
  budgetUnlimited,
  manualApprovalRequired,
  note,
  audiences,
  hideRewardFields = false,
  onChange,
}: {
  status: GuestGameStatus;
  name: string;
  ruleKind?: "lootBox" | "mission";
  lootBoxUsageKind?: GuestGameLootBoxUsageKind;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  budgetAmount: string;
  budgetUnlimited: boolean;
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
      <FormSection
        title={hideRewardFields ? "Бюджет и выдача" : "Награда и бюджет"}
      >
        {hideRewardFields ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
            <BudgetField
              value={budgetAmount}
              unlimited={budgetUnlimited}
              onChange={onChange}
            />
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
              <BudgetField
                value={budgetAmount}
                unlimited={budgetUnlimited}
                onChange={onChange}
              />
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
      {ruleKind === "lootBox" ? (
        <FormSection
          title="Назначение лутбокса"
          description="Выберите, где кейс будет использоваться: в витрине игрового модуля, как подарок за другие активности или в обоих сценариях."
        >
          <div className="grid gap-2 md:grid-cols-3">
            {lootBoxUsageKindOptions.map((option) => {
              const active = lootBoxUsageKind === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "rounded-lg border p-3 text-left transition",
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-600/30"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20",
                  ].join(" ")}
                  onClick={() =>
                    onChange({
                      usageKind: option.value,
                    } as Partial<LootBoxForm & MissionForm>)
                  }
                >
                  <span className="block text-sm font-bold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </FormSection>
      ) : null}
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
  formAction,
  form,
  listTitle,
  listSummary,
  items,
  renderItem,
  layout = "sidebar",
}: {
  canManage: boolean;
  formTitle: string;
  formAction?: ReactNode;
  form: ReactNode;
  listTitle: string;
  listSummary?: ReactNode;
  items: T[];
  renderItem: (item: T) => ReactNode;
  layout?: "sidebar" | "stacked";
}) {
  const isStacked = layout === "stacked";

  return (
    <div
      className={
        canManage
          ? isStacked
            ? "grid gap-5"
            : "grid items-start gap-4 2xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? (
        <Panel title={formTitle} action={formAction}>
          {form}
        </Panel>
      ) : null}
      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle title={listTitle} />
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {items.length} правил
          </p>
        </div>
        {listSummary ? <div>{listSummary}</div> : null}
        <div
          className={
            isStacked
              ? "grid gap-3 lg:grid-cols-2"
              : "grid max-w-5xl gap-3 lg:grid-cols-2 2xl:max-w-none"
          }
        >
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
            {profile.contactMasked ??
              profile.guest?.externalGuestId ??
              "контакт не задан"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {profile.isStaffTest ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              Тест сотрудника
            </span>
          ) : null}
          <StatusPill
            label={profileStatusLabels[profile.status]}
            tone={profileStatusPillTone(profile.status)}
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="XP" value={profile.xp} />
        <MiniMetric label="Уровень" value={profile.level} />
        <MiniMetric
          label="Канал"
          value={
            profile.telegramIdentity ? "TG" : profile.maxIdentity ? "MAX" : "-"
          }
        />
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
              disabled={
                saving === `profile-${profile.id}` || profile.status === status
              }
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
  trackingId,
  title,
  status,
  subtitle,
  meta,
  details,
  onEdit,
  onStatus,
  onDelete,
  onRestart,
  saving,
  deleteSaving,
  restartSaving,
  canManage,
}: {
  eyebrow?: string;
  trackingId?: string;
  title: string;
  status: GuestGameStatus;
  subtitle: string;
  meta: string[];
  details?: ReactNode;
  onEdit: () => void;
  onStatus: (status: GuestGameStatus) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestart?: () => Promise<void>;
  saving: boolean;
  deleteSaving?: boolean;
  restartSaving?: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          {eyebrow || trackingId ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  {eyebrow}
                </p>
              ) : null}
              {trackingId ? (
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                  ID {trackingId}
                </span>
              ) : null}
            </div>
          ) : null}
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <StatusPill
          label={statusLabels[status]}
          tone={ruleStatusPillTone(status)}
        />
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
      {details ? <div className="mt-3">{details}</div> : null}
      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={smallButtonClass} onClick={onEdit}>
            Редактировать
          </button>
          {onDelete ? (
            <button
              type="button"
              className={dangerButtonClass}
              disabled={saving || restartSaving || deleteSaving}
              onClick={onDelete}
            >
              {deleteSaving ? "Удаление..." : "Удалить"}
            </button>
          ) : null}
          {onRestart ? (
            <button
              type="button"
              className={smallButtonClass}
              disabled={saving || restartSaving || deleteSaving}
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
              disabled={
                saving || restartSaving || deleteSaving || status === nextStatus
              }
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
  const initial = (part: string) => part.slice(0, 1).toLocaleUpperCase("ru-RU");

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
  return formatPhoneTail(
    reward.guest?.contact ?? reward.profile?.contactMasked,
  );
}

function rewardActivityLabel(reward: GuestGameReward) {
  if (reward.activityLabel?.trim()) {
    return reward.activityLabel;
  }

  if (reward.lootBox) {
    return `Лутбокс "${reward.lootBox.name}"`;
  }

  if (reward.mission) {
    if (
      reward.mission.missionType === "CHECK_IN" ||
      reward.mission.triggerKind === "CHECK_IN"
    ) {
      return "Чекин";
    }

    return `Задание "${reward.mission.name}"`;
  }

  if (reward.season) {
    return `Battlepass "${reward.season.name}"`;
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
    rewardRarityLabel(reward),
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

function rewardRarityLabel(reward: GuestGameReward) {
  return (
    reward.rewardRarityLabel ??
    (reward.rewardRarity ? rewardRarityLabels[reward.rewardRarity] : null)
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
  const rarityLabel = rewardRarityLabel(reward);

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
            {rarityLabel ? (
              <StatusPill
                label={rarityLabel}
                tone={rewardRarityPillTone(reward.rewardRarity)}
              />
            ) : null}
            <StatusPill
              label={rewardStatusLabels[reward.status]}
              tone={rewardStatusPillTone(reward.status)}
            />
            <StatusPill
              label={rewardWalletLabel(reward)}
              tone={rewardWalletPillTone(reward.walletState)}
            />
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
              <StatusPill
                label={rewardStatusLabels[reward.status]}
                tone={rewardStatusPillTone(reward.status)}
              />
              <StatusPill
                label={rewardWalletLabel(reward)}
                tone={rewardWalletPillTone(reward.walletState)}
              />
              {rarityLabel ? (
                <StatusPill
                  label={rarityLabel}
                  tone={rewardRarityPillTone(reward.rewardRarity)}
                />
              ) : null}
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
              {rarityLabel ? ` · ${rarityLabel}` : ""}
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
                  {reward.expiresAt
                    ? formatDate(reward.expiresAt)
                    : "без срока"}
                </span>
              </div>
            </div>
            {reward.claimPayload ? (
              <p className="mt-2 rounded-lg border border-dashed border-cyan-300/40 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                QR-код готов для гостевой страницы. Для ручной выдачи
                используйте короткий код кассиру выше.
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
                      saving === `reward-${reward.id}` ||
                      reward.status === status
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
    description: "Подходит для лутбокса при начале игры или задания на визит.",
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
    description: "Полезно для заданий на отыгранную сессию или итоговый XP.",
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
    description:
      "Подходит для заданий за участие в турнирах и клубных событиях.",
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
    description:
      "Подходит для заданий или XP за пополнение, оплату или бонусы.",
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
    description:
      "Лучше добавлять в запрет anti-fraud, чтобы исключить тесты и корректировки.",
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
          : (definition?.label ?? item.mapping.label),
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
                !item.mapping &&
                guestLogTypeMatchesPreset(item, definition.tokens),
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
    description:
      "Начало игровой активности, если такой тип есть в guests/logs.",
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
                  {preset.types.length > 4
                    ? ` +${preset.types.length - 4}`
                    : ""}
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
            Нажатие на название добавляет событие как условие открытия. Кнопка
            `запретить` добавляет событие в список исключений.
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
        задания.
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
  selectedStoreIds,
  productIds,
  externalProductIds,
  categoryIds,
  categoryNames,
  onChange,
}: {
  products: Product[];
  selectedStoreIds: string[];
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
  const availableProducts = useMemo(
    () => filterProductsByMissionStores(products, selectedStoreIds),
    [products, selectedStoreIds],
  );
  const categoryOptions = useMemo(
    () =>
      productCategoryOptions(
        availableProducts,
        selectedCategoryIds,
        selectedCategoryNames,
      ),
    [availableProducts, selectedCategoryIds, selectedCategoryNames],
  );
  const filteredProducts = useMemo(
    () =>
      filterProductsForMission(
        availableProducts,
        productQuery,
        selectedProductIds,
      ).slice(0, 10),
    [availableProducts, productQuery, selectedProductIds],
  );
  const filteredCategories = useMemo(
    () =>
      filterCategoryOptions(
        categoryOptions,
        categoryQuery,
        selectedCategoryIds,
        selectedCategoryNames,
      ).slice(0, 10),
    [
      categoryOptions,
      categoryQuery,
      selectedCategoryIds,
      selectedCategoryNames,
    ],
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
          Сначала выберите активный клуб выше, затем найдите один или несколько
          товаров, которые гость должен купить.
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
                    {product.article
                      ? `Артикул ${product.article}`
                      : "без артикула"}
                    {product.category?.name
                      ? ` · ${product.category.name}`
                      : ""}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Товар не найден в ассортименте выбранных клубов.
              </p>
            )}
          </div>
        ) : null}
        <SelectionChips
          items={selectedProducts}
          emptyLabel={
            availableProducts.length
              ? "Конкретные товары не выбраны."
              : selectedStoreIds.length
                ? "В выбранных клубах ассортимент недоступен или пока пуст."
                : "Выберите клуб выше, чтобы искать товары по его ассортименту."
          }
          onRemove={(productId) =>
            onChange({
              metricProductIds: removeCsvToken(productIds, productId),
            })
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
          Можно выбрать одну или несколько категорий вместо конкретных товаров.
          Тогда засчитается любая покупка из выбранной категории.
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
            const option = categoryOptions.find(
              (category) => category.id === value,
            );

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

function missionVisibilityValue(value: string | null | undefined) {
  return String(value ?? "").toUpperCase() === "HIDDEN" ? "HIDDEN" : "VISIBLE";
}

function missionVisibilitySummary(value: unknown) {
  return missionVisibilityValue(stringRule(value, "visibility", "VISIBLE")) ===
    "HIDDEN"
    ? "скрытое"
    : "видимое";
}

function missionUsesProductMetric(form: MissionForm) {
  const metricEvents = csvList(form.metricEventTypes);

  return (
    form.progressUnit === "purchase" ||
    form.progressUnit === "rub" ||
    form.missionType === "PRODUCT_PURCHASE" ||
    form.missionType === "BAR_PURCHASE" ||
    form.triggerKind === "PRODUCT_PURCHASE" ||
    form.triggerKind === "BAR_PURCHASE" ||
    metricEvents.some(
      (eventType) =>
        eventType === "PRODUCT_PURCHASE" || eventType === "BAR_PURCHASE",
    ) ||
    csvList(form.metricProductIds).length > 0 ||
    csvList(form.metricExternalProductIds).length > 0 ||
    csvList(form.metricCategoryIds).length > 0 ||
    csvList(form.metricCategoryNames).length > 0
  );
}

function missionProgressUnitPatch(
  form: MissionForm,
  progressUnit: string,
): Partial<MissionForm> {
  if (progressUnit === "minute") {
    return {
      progressUnit,
      triggerKind: "PLAY_HOUR",
      missionType: "PLAY_HOUR",
      metricAggregation: "duration",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, ["PLAY_HOUR"]),
    };
  }

  if (progressUnit === "purchase") {
    return {
      progressUnit,
      triggerKind: "PRODUCT_PURCHASE",
      missionType: "PRODUCT_PURCHASE",
      metricAggregation: "count",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, [
        "PRODUCT_PURCHASE",
        "BAR_PURCHASE",
      ]),
    };
  }

  if (progressUnit === "rub") {
    return {
      progressUnit,
      triggerKind: "PRODUCT_PURCHASE",
      missionType: "PRODUCT_PURCHASE",
      metricAggregation: "sum",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, [
        "PRODUCT_PURCHASE",
        "BAR_PURCHASE",
      ]),
    };
  }

  return { progressUnit };
}

function filterProductsByMissionStores(
  products: Product[],
  selectedStoreIds: string[],
) {
  if (!selectedStoreIds.length) {
    return [];
  }

  const storeIds = new Set(selectedStoreIds);

  return products.filter(
    (product) =>
      (product.storeIds?.length ?? 0) === 0 ||
      (product.storeIds ?? []).some((storeId) => storeIds.has(storeId)),
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
          <option
            key={`${item.domain}-${tariffItemValue(item)}`}
            value={tariffItemValue(item)}
          >
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

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-zinc-950 dark:text-white">
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
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

type StatusPillTone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "purple"
  | "cyan";

const statusPillToneClasses: Record<StatusPillTone, string> = {
  neutral:
    "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700",
  success:
    "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  info: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  warning:
    "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  danger:
    "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800",
  purple:
    "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  cyan: "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800",
};

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusPillTone;
}) {
  return (
    <span
      className={[
        "rounded-full px-2 py-1 text-xs font-bold ring-1",
        statusPillToneClasses[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function ruleStatusPillTone(status: GuestGameStatus): StatusPillTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "DRAFT":
      return "info";
    case "PAUSED":
      return "warning";
    case "FINISHED":
      return "cyan";
    case "ARCHIVED":
      return "neutral";
  }
}

function profileStatusPillTone(status: GuestGameProfileStatus): StatusPillTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PAUSED":
      return "warning";
    case "ARCHIVED":
      return "neutral";
  }
}

function rewardStatusPillTone(status: GuestGameRewardStatus): StatusPillTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "info";
    case "PAID":
      return "success";
    case "CANCELED":
      return "neutral";
    case "EXPIRED":
      return "danger";
  }
}

function rewardWalletPillTone(
  status: GuestGameReward["walletState"],
): StatusPillTone {
  switch (status) {
    case "WAITING_APPROVAL":
      return "warning";
    case "READY":
      return "success";
    case "REDEEMED":
      return "cyan";
    case "CANCELED":
      return "neutral";
    case "EXPIRED":
      return "danger";
  }
}

function rewardRarityPillTone(
  rarity: GuestGameReward["rewardRarity"],
): StatusPillTone {
  switch (rarity) {
    case "rare":
      return "info";
    case "epic":
      return "purple";
    case "legendary":
      return "warning";
    case "common":
    default:
      return "neutral";
  }
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
    usageKind: lootBox.usageKind,
    triggerKind: lootBox.triggerKind,
    rewardType: lootBox.rewardType,
    rewardAmount: moneyFormValue(lootBox.rewardAmount),
    rewardLabel: lootBox.rewardLabel ?? "",
    caseRarity: lootBoxCaseRarity(lootBox.probabilityRules),
    audienceId: lootBox.audience?.id ?? "",
    segment: lootBox.segment ?? "",
    sessionType: lootBox.sessionType ?? "",
    tariffGroupId: stringRule(lootBox.periodRules, "tariffGroupId", ""),
    tariffPeriodId: stringRule(lootBox.periodRules, "tariffPeriodId", ""),
    tariffTypeId: stringRule(lootBox.periodRules, "tariffTypeId", ""),
    guestLogTypes: stringListRule(lootBox.periodRules, "guestLogTypes"),
    blockedGuestLogTypes: stringListRule(
      lootBox.periodRules,
      "blockedGuestLogTypes",
    ),
    storeIds: lootBox.storeIds,
    quietHoursEnabled: booleanRule(
      lootBox.periodRules,
      "quietHoursEnabled",
      true,
    ),
    weekdaysOnly: booleanRule(lootBox.periodRules, "weekdaysOnly", true),
    timeWindowMode: lootBoxTimeWindowMode(lootBox.periodRules),
    weekdayMode: lootBoxWeekdayMode(lootBox.periodRules),
    selectedWeekdays: lootBoxSelectedWeekdays(lootBox.periodRules),
    hourFrom: timeWindowPart(lootBox.periodRules, 0, "10:00"),
    hourTo: timeWindowPart(lootBox.periodRules, 1, "16:00"),
    perGuestPerWeek: numberRule(lootBox.limits, "perGuestPerWeek", "1"),
    periodicLimitEnabled:
      lootBoxPeriodicLimitPeriod(asRecord(lootBox.limits).periodicLimit) !=
      null,
    periodicLimitPeriod:
      lootBoxPeriodicLimitPeriod(asRecord(lootBox.limits).periodicLimit) ??
      "DAILY",
    totalPerDay: numberRule(lootBox.limits, "totalPerDay", "30"),
    prizes: lootBoxPrizesToForm(lootBox.probabilityRules, {
      rewardType: lootBox.rewardType,
      rewardAmount: moneyFormValue(lootBox.rewardAmount),
      rewardLabel: lootBox.rewardLabel ?? lootBox.name,
    }),
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
    budgetUnlimited: lootBox.budgetAmount == null,
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
    visibility: missionVisibilityValue(
      stringRule(mission.conditions, "visibility", "VISIBLE"),
    ),
    rewardType: mission.rewardType,
    rewardAmount: moneyFormValue(mission.rewardAmount),
    rewardLabel: mission.rewardLabel ?? "",
    xpReward: String(mission.xpReward),
    progressTarget: mission.progressTarget
      ? String(mission.progressTarget)
      : "",
    progressUnit: mission.progressUnit ?? "",
    audienceId: mission.audience?.id ?? "",
    storeIds: mission.storeIds,
    periodFrom: dateInputValue(mission.periodFrom),
    periodTo: dateInputValue(mission.periodTo),
    budgetAmount: moneyFormValue(mission.budgetAmount),
    budgetUnlimited: mission.budgetAmount == null,
    perGuestLimit: mission.perGuestLimit ? String(mission.perGuestLimit) : "",
    perGuestLimitUnlimited: mission.perGuestLimit == null,
    totalRewardLimit: mission.totalRewardLimit
      ? String(mission.totalRewardLimit)
      : "",
    sessionType: stringRule(mission.conditions, "sessionType", ""),
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
    metricEventTypes: stringListRule(
      metricRule(mission.conditions),
      "eventTypes",
    ),
    metricHours: stringListRule(metricRule(mission.conditions), "hours"),
    metricProductIds: stringListRule(
      metricRule(mission.conditions),
      "productIds",
    ),
    metricExternalProductIds: stringListRule(
      metricRule(mission.conditions),
      "externalProductIds",
    ),
    metricCategoryIds: stringListRule(
      metricRule(mission.conditions),
      "categoryIds",
    ),
    metricCategoryNames: stringListRule(
      metricRule(mission.conditions),
      "categoryNames",
    ),
    windowDays: numberRule(mission.conditions, "windowDays", "7"),
    weekdaysOnly: booleanRule(mission.conditions, "weekdaysOnly", true),
    minSessionMinutes: numberRule(
      mission.conditions,
      "minSessionMinutes",
      "90",
    ),
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

function isCheckInMission(mission: GuestGameMission) {
  return (
    mission.missionType === "CHECK_IN" || mission.triggerKind === "CHECK_IN"
  );
}

function isCheckInMissionForm(form: MissionForm) {
  return form.missionType === "CHECK_IN" || form.triggerKind === "CHECK_IN";
}

function normalizeCheckInMissionForm(form: MissionForm): MissionForm {
  const rewardType = form.rewardType || "XP";
  const xpReward = form.xpReward && form.xpReward !== "0" ? form.xpReward : "0";

  return {
    ...form,
    missionType: "CHECK_IN",
    triggerKind: "CHECK_IN",
    rewardType,
    rewardAmount: rewardType === "XP" ? "0" : form.rewardAmount || "50",
    rewardLabel:
      form.rewardLabel ||
      (rewardType === "BONUS_BALANCE" ? "Бонусы за чекин" : "XP за чекин"),
    xpReward: rewardType === "XP" && xpReward === "0" ? "20" : xpReward,
    progressTarget: form.progressTarget || "1",
    progressUnit: form.progressUnit || "check_in",
    metricAggregation: form.metricAggregation || "count",
    metricEventTypes: form.metricEventTypes || "CHECK_IN",
    questEnabled: false,
    questSteps: [],
    requireLangameFact: false,
    denySameDayRepeat: false,
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
    xpMissionCompletion: numberRule(season.xpRules, "missionCompletion", "50"),
    xpPacketSessionBonus: numberRule(
      season.xpRules,
      "packetSessionBonus",
      "15",
    ),
    xpGuestLog: numberRule(season.xpRules, "guestLog", "5"),
    sessionType: stringRule(season.xpRules, "sessionType", ""),
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
    premiumRewardLabel: rewardLabel(
      season.premiumRewards,
      "Усиленный промокод",
    ),
    levelSteps: seasonLevelStepsToForm(season.levels),
    xpRulesText: jsonFormValue(season.xpRules, defaultSeasonForm.xpRulesText),
    levelsText: jsonFormValue(season.levels, defaultSeasonForm.levelsText),
    freeRewardsText: jsonFormValue(season.freeRewards),
    premiumRewardsText: jsonFormValue(season.premiumRewards),
    premiumEnabled: season.premiumEnabled,
    premiumUpgradeMode: season.premiumUpgradeMode ?? "",
    budgetAmount: moneyFormValue(season.budgetAmount),
    budgetUnlimited: season.budgetAmount == null,
    manualApprovalRequired: season.manualApprovalRequired,
    note: season.note ?? "",
  };
}

function promoCardToForm(promoCard: GuestGamePromoCard): PromoBannerForm {
  const metadata = promoCardMetadata(promoCard);
  const crop = asRecord(metadata.crop);

  return {
    title: promoCard.title,
    label: promoCard.label ?? "",
    description: promoCard.description ?? "",
    tag: promoCard.tag ?? "",
    status: promoCard.status,
    targetAnchor: promoCard.targetAnchor ?? "",
    priority: String(promoCard.priority),
    storeIds: promoCard.storeIds,
    periodFrom: dateInputValue(promoCard.periodFrom),
    periodTo: dateInputValue(promoCard.periodTo),
    actionLabel: metadataString(metadata, "actionLabel") ?? "Открыть",
    actionUrl: metadataString(metadata, "actionUrl") ?? "",
    imageUrl: metadataString(metadata, "imageUrl") ?? "",
    imageSource: "",
    imageScale: String(numberMetadata(crop, "scale", 1)),
    imageOffsetX: String(numberMetadata(crop, "offsetX", 0)),
    imageOffsetY: String(numberMetadata(crop, "offsetY", 0)),
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

type ApiRequestErrorBody = {
  code?: string;
  message?: string;
  stores?: Array<{ storeName?: string }>;
  storeNames?: string[];
};

class ApiRequestError extends Error {
  status: number;
  body: ApiRequestErrorBody | null;

  constructor(status: number, body: ApiRequestErrorBody | null) {
    super(body?.message ?? "Ошибка запроса");
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiRequestErrorBody | null;
    throw new ApiRequestError(response.status, body);
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

function ruleTemplateLabel(type: RuleTemplateType) {
  switch (type) {
    case "loot-boxes":
      return "лутбокс";
    case "missions":
      return "задание";
    case "seasons":
      return "сезон";
    case "promo-cards":
      return "промо-баннер";
  }
}

function activationTargetStoreNames(storeIds: string[], stores: Store[]) {
  if (!storeIds.length) {
    return ["Все активные клубы сети"];
  }

  const storeNameById = new Map(stores.map((store) => [store.id, store.name]));
  return storeIds.map((id) => storeNameById.get(id) ?? `Клуб ${id}`);
}

function buildDeleteActivityModal(
  request: RuleDeleteRequestModal,
  error: unknown,
): RuleDeleteActivityModal | null {
  if (!(error instanceof ApiRequestError)) {
    return null;
  }

  const body = error.body;

  if (
    error.status !== 409 ||
    !["GAME_RULE_ACTIVE", "VISUAL_EDITOR_RULE_ACTIVE"].includes(
      body?.code ?? "",
    )
  ) {
    return null;
  }

  const storesFromObjects =
    body?.stores
      ?.map((store) => store.storeName)
      .filter((store): store is string => Boolean(store)) ?? [];
  const stores = storesFromObjects.length
    ? storesFromObjects
    : (body?.storeNames ?? []);

  return {
    ...request,
    message: body?.message ?? "Элемент сейчас активен в клубе.",
    stores,
  };
}

function buildDeleteBlockedModal(
  name: string,
  message: string,
): RuleDeleteBlockedModal | null {
  if (!message.includes("используется в визуальном редакторе")) {
    return null;
  }

  return {
    title: `Нельзя удалить «${name}»`,
    message,
    stores: extractDeleteBlockedStores(message),
  };
}

function extractDeleteBlockedStores(message: string) {
  const marker = "для клубов:";
  const markerIndex = message.indexOf(marker);

  if (markerIndex < 0) {
    return [];
  }

  return message
    .slice(markerIndex + marker.length)
    .replace(/\.$/, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

function promoCardMetadata(promoCard: GuestGamePromoCard) {
  return asRecord(promoCard.metadata);
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberMetadata(
  metadata: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = metadata[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function storeScopeLabel(storeIds: string[], stores: Store[]) {
  if (!storeIds.length) {
    return "все клубы";
  }

  const names = storeIds
    .map((storeId) => stores.find((store) => store.id === storeId)?.name)
    .filter((value): value is string => Boolean(value));

  if (!names.length) {
    return `${storeIds.length} клуб.`;
  }

  return names.length > 2
    ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
    : names.join(", ");
}

function lootBoxMatchesStoreFilter(
  lootBox: Pick<GuestGameLootBox, "storeIds">,
  storeId: string,
) {
  return (
    !storeId || !lootBox.storeIds.length || lootBox.storeIds.includes(storeId)
  );
}

function buildPromoBannerUsage(
  promoCards: GuestGamePromoCard[],
  stores: Store[],
): PromoBannerUsageSummary {
  const byCardId = new Map<string, PromoBannerUsageInfo>();
  const visibleCardIds = new Set<string>();
  const overflowCardIds = new Set<string>();
  const activeCardIds = new Set<string>();
  const nowMs = Date.now();
  const storeTargets = stores.length
    ? stores.map((store) => ({ id: store.id, name: store.name }))
    : [{ id: "__all__", name: "все клубы" }];
  const activeCards = promoCards
    .filter((promoCard) => promoBannerCanAppear(promoCard, nowMs))
    .sort(comparePromoBannersForPortal);

  activeCards.forEach((promoCard) => activeCardIds.add(promoCard.id));

  const storeUsages = storeTargets
    .map((store) => {
      const eligibleCards = activeCards.filter((promoCard) =>
        promoBannerMatchesStore(promoCard, store.id),
      );

      eligibleCards.forEach((promoCard, index) => {
        const info = promoBannerUsageInfo(byCardId, promoCard.id);

        if (index < PROMO_BANNER_DISPLAY_LIMIT) {
          visibleCardIds.add(promoCard.id);
          info.visibleStoreNames.push(store.name);
        } else {
          overflowCardIds.add(promoCard.id);
          info.overflowStoreNames.push(store.name);
        }
      });

      return {
        storeId: store.id,
        storeName: store.name,
        activeCount: eligibleCards.length,
        visibleCount: Math.min(
          eligibleCards.length,
          PROMO_BANNER_DISPLAY_LIMIT,
        ),
        overflowCount: Math.max(
          eligibleCards.length - PROMO_BANNER_DISPLAY_LIMIT,
          0,
        ),
      };
    })
    .filter((usage) => usage.activeCount > 0);

  return {
    byCardId,
    visibleCardIds,
    overflowCardIds,
    activeCardIds,
    stores: storeUsages,
  };
}

function promoBannerDraftLimitWarning(
  form: PromoBannerForm,
  promoCards: GuestGamePromoCard[],
  stores: Store[],
  editingId: string | null,
) {
  if (form.status !== "ACTIVE" || !promoBannerFormIsInActivePeriod(form)) {
    return null;
  }

  const nowMs = Date.now();
  const fullStores = promoBannerFormTargetStores(form, stores).filter(
    (store) => {
      const activeCount = promoCards.filter(
        (promoCard) =>
          promoCard.id !== editingId &&
          promoBannerCanAppear(promoCard, nowMs) &&
          promoBannerMatchesStore(promoCard, store.id),
      ).length;

      return activeCount >= PROMO_BANNER_DISPLAY_LIMIT;
    },
  );

  if (!fullStores.length) {
    return null;
  }

  const storeLabel = compactStoreNames(fullStores.map((store) => store.name));

  return `Лимит на показ баннеров - ${PROMO_BANNER_DISPLAY_LIMIT}/${PROMO_BANNER_DISPLAY_LIMIT}${
    storeLabel ? ` (${storeLabel})` : ""
  }. Баннер сохранен в статусе "Черновик".`;
}

function promoBannerFormTargetStores(form: PromoBannerForm, stores: Store[]) {
  const allStores = stores.length
    ? stores.map((store) => ({ id: store.id, name: store.name }))
    : [{ id: "__all__", name: "все клубы" }];

  if (!form.storeIds.length) {
    return allStores;
  }

  const selectedIds = new Set(form.storeIds);
  const selectedStores = allStores.filter((store) => selectedIds.has(store.id));
  const missingStores = form.storeIds
    .filter((storeId) => !selectedStores.some((store) => store.id === storeId))
    .map((storeId) => ({ id: storeId, name: storeId }));

  return [...selectedStores, ...missingStores];
}

function promoBannerFormIsInActivePeriod(form: PromoBannerForm) {
  const fromMs = dateMs(form.periodFrom || null);
  const toMs = dateMs(form.periodTo || null);
  const nowMs = Date.now();

  if (fromMs !== null && fromMs > nowMs) {
    return false;
  }

  if (toMs !== null && toMs < nowMs) {
    return false;
  }

  return true;
}

function promoBannerUsageInfo(
  map: Map<string, PromoBannerUsageInfo>,
  promoCardId: string,
) {
  const current = map.get(promoCardId);

  if (current) {
    return current;
  }

  const next = { visibleStoreNames: [], overflowStoreNames: [] };
  map.set(promoCardId, next);

  return next;
}

function promoBannerCanAppear(promoCard: GuestGamePromoCard, nowMs: number) {
  return (
    promoCard.status === "ACTIVE" &&
    promoBannerIsInActivePeriod(promoCard, nowMs)
  );
}

function promoBannerIsInActivePeriod(
  promoCard: GuestGamePromoCard,
  nowMs = Date.now(),
) {
  const fromMs = dateMs(promoCard.periodFrom);
  const toMs = dateMs(promoCard.periodTo);

  if (fromMs !== null && fromMs > nowMs) {
    return false;
  }

  if (toMs !== null && toMs < nowMs) {
    return false;
  }

  return true;
}

function promoBannerMatchesStore(
  promoCard: GuestGamePromoCard,
  storeId: string,
) {
  return (
    storeId === "__all__" ||
    !promoCard.storeIds.length ||
    promoCard.storeIds.includes(storeId)
  );
}

function comparePromoBannersForPortal(
  left: GuestGamePromoCard,
  right: GuestGamePromoCard,
) {
  const priorityDelta = right.priority - left.priority;

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const updatedDelta =
    (dateMs(right.updatedAt) ?? 0) - (dateMs(left.updatedAt) ?? 0);

  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  return (dateMs(right.createdAt) ?? 0) - (dateMs(left.createdAt) ?? 0);
}

function promoBannerUsageMeta(
  promoCard: GuestGamePromoCard,
  usage: PromoBannerUsageSummary,
  stores: Store[],
) {
  const scope = storeScopeLabel(promoCard.storeIds, stores);

  if (promoCard.status !== "ACTIVE") {
    return [scope, "не показывается: статус"];
  }

  if (!promoBannerIsInActivePeriod(promoCard)) {
    return [scope, "не показывается: вне периода"];
  }

  const info = usage.byCardId.get(promoCard.id);

  if (!info) {
    return [scope, "не показывается"];
  }

  const meta: string[] = [];

  if (info.visibleStoreNames.length) {
    meta.push(`показывается: ${compactStoreNames(info.visibleStoreNames)}`);
  }

  if (info.overflowStoreNames.length) {
    meta.push(`сверх лимита: ${compactStoreNames(info.overflowStoreNames)}`);
  }

  return meta.length ? meta : [scope, "не показывается"];
}

function compactStoreNames(names: string[]) {
  const uniqueNames = Array.from(new Set(names));

  if (uniqueNames.length > 2) {
    return `${uniqueNames.slice(0, 2).join(", ")} +${uniqueNames.length - 2}`;
  }

  return uniqueNames.join(", ");
}

function dateMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function promoTargetLabel(targetAnchor: string | null) {
  return (
    promoTargetOptions.find((option) => option.value === (targetAnchor ?? ""))
      ?.label ?? "Главный экран"
  );
}

async function buildPromoBannerMetadata(form: PromoBannerForm) {
  const imageUrl = await renderPromoBannerImage(form);
  const scale = clampPromoBannerScale(Number(form.imageScale));
  const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX));
  const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY));
  const actionUrl = normalizeExternalActionUrl(form.actionUrl);

  return {
    source: "advanced_editor",
    imageAspectRatio: "9:16",
    imageUrl: imageUrl || null,
    imageStorage: imageUrl ? "inline_jpeg" : null,
    actionLabel: nullable(form.actionLabel),
    actionUrl,
    crop: {
      scale,
      offsetX,
      offsetY,
    },
  };
}

async function renderPromoBannerImage(form: PromoBannerForm) {
  const source = form.imageSource || form.imageUrl;

  if (!source) {
    return "";
  }

  if (!form.imageSource) {
    return form.imageUrl;
  }

  if (typeof window === "undefined") {
    return form.imageUrl || source;
  }

  if (!isInlineImageSource(source)) {
    throw new Error(
      "Картинка баннера должна храниться в LeetPlus. Загрузите изображение файлом и сохраните баннер еще раз.",
    );
  }

  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PROMO_BANNER_IMAGE_WIDTH;
      canvas.height = PROMO_BANNER_IMAGE_HEIGHT;
      const context = canvas.getContext("2d");

      if (!context || !image.naturalWidth || !image.naturalHeight) {
        reject(new Error("Не удалось подготовить изображение баннера."));
        return;
      }

      const scale =
        Math.max(
          PROMO_BANNER_IMAGE_WIDTH / image.naturalWidth,
          PROMO_BANNER_IMAGE_HEIGHT / image.naturalHeight,
        ) * clampPromoBannerScale(Number(form.imageScale));
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX));
      const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY));
      const dx =
        (PROMO_BANNER_IMAGE_WIDTH - drawWidth) / 2 +
        (offsetX / 100) * PROMO_BANNER_IMAGE_WIDTH;
      const dy =
        (PROMO_BANNER_IMAGE_HEIGHT - drawHeight) / 2 +
        (offsetY / 100) * PROMO_BANNER_IMAGE_HEIGHT;

      context.fillStyle = "#050b0e";
      context.fillRect(
        0,
        0,
        PROMO_BANNER_IMAGE_WIDTH,
        PROMO_BANNER_IMAGE_HEIGHT,
      );
      context.drawImage(image, dx, dy, drawWidth, drawHeight);

      try {
        const imageDataUrl = promoBannerJpegQualities.reduce<string | null>(
          (best, quality) => {
            if (best && best.length <= PROMO_BANNER_MAX_DATA_URL_LENGTH) {
              return best;
            }

            return canvas.toDataURL("image/jpeg", quality);
          },
          null,
        );

        if (!imageDataUrl) {
          reject(new Error("Не удалось подготовить изображение баннера."));
          return;
        }

        if (imageDataUrl.length > PROMO_BANNER_MAX_DATA_URL_LENGTH) {
          reject(
            new Error(
              "Картинка баннера слишком тяжелая. Загрузите изображение меньшего размера или с меньшим количеством деталей.",
            ),
          );
          return;
        }

        resolve(imageDataUrl);
      } catch {
        reject(
          new Error(
            "Не удалось сохранить картинку баннера у нас. Загрузите изображение файлом, а не внешней ссылкой.",
          ),
        );
      }
    };
    image.onerror = () =>
      reject(new Error("Не удалось загрузить изображение баннера."));
    image.src = source;
  });
}

function isInlineImageSource(value: string) {
  return value.trim().toLowerCase().startsWith("data:image/");
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
  const usesGuestLogTypes = form.triggerKind === "GUEST_LOG";
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
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: usesGuestLogTypes ? csvList(form.guestLogTypes) : [],
    blockedGuestLogTypes: usesGuestLogTypes
      ? csvList(form.blockedGuestLogTypes)
      : [],
  };
}

function buildLootBoxLimits(form: LootBoxForm) {
  const perGuestPerWeek = form.periodicLimitEnabled
    ? null
    : (optionalNumber(form.perGuestPerWeek) ?? 1);
  const totalPerDay = optionalNumber(form.totalPerDay);

  return {
    source: "business_controls",
    ...(form.periodicLimitEnabled
      ? { periodicLimit: form.periodicLimitPeriod }
      : {}),
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
        prize.rewardLabel.trim() || prize.rewardAmount > 0 || prize.rewardType,
    );
  const safePrizes = prizes.length
    ? prizes
    : [
        {
          ...primaryLootBoxPrize(form),
          rewardAmount:
            optionalNumber(primaryLootBoxPrize(form).rewardAmount) ?? 0,
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
    caseRarity: form.caseRarity,
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
    tariffGroupId: nullable(form.tariffGroupId),
    tariffPeriodId: nullable(form.tariffPeriodId),
    tariffTypeId: nullable(form.tariffTypeId),
    guestLogTypes: csvList(form.guestLogTypes),
    visibility: missionVisibilityValue(form.visibility),
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
    perGuestLimit: form.perGuestLimitUnlimited
      ? null
      : optionalNumber(form.perGuestLimit),
    totalRewardLimit: optionalNumber(form.totalRewardLimit),
  };
}

function buildSeasonXpRules(_form: SeasonForm) {
  return {
    source: "battle_pass_steps",
    mode: "SEQUENTIAL_ACTIONS",
  };
}

function buildSeasonLevels(form: SeasonForm) {
  const customLevels = seasonLevelStepFormsToLevels(form);

  if (customLevels.length) {
    return customLevels;
  }

  return buildAutomaticSeasonLevels(form);
}

function buildSeasonRewards(form: SeasonForm, track: "free" | "premium") {
  return seasonLevelStepFormsToRewards(form, track);
}

function buildAutomaticSeasonLevels(form: SeasonForm) {
  const levelCount = Math.max(1, numeric(form.levelCount, 1));

  return Array.from({ length: levelCount }, (_, index) => {
    const level = index + 1;
    return {
      level,
      xp: 0,
      title: `Этап ${level}`,
      condition: `Выполните условие шага ${level}.`,
      description: null,
      freeReward: levelRewardLabel(
        level,
        form.freeRewardEvery,
        form.freeRewardLabel,
      ),
      premiumReward: levelRewardLabel(
        level,
        form.premiumRewardEvery,
        form.premiumRewardLabel,
      ),
    };
  });
}

function buildAutomaticSeasonLevelSteps(
  form: SeasonForm,
): SeasonLevelStepForm[] {
  return buildAutomaticSeasonLevels(form).map((level) => ({
    id: nextSeasonStepId(),
    level: String(level.level),
    xp: String(level.xp),
    title: level.title,
    condition: level.condition,
    description: level.description ?? "",
    freeReward: level.freeReward ?? "",
    premiumReward: level.premiumReward ?? "",
    conditionV2: { ...defaultBattlePassStepCondition },
    triggerKind: "",
    sessionType: "",
    timeWindowMode: "ANY",
    weekdayMode: "ANY",
    selectedWeekdays: weekdayPresets.ANY,
    hourFrom: "10:00",
    hourTo: "16:00",
    tariffGroupId: "",
    tariffPeriodId: "",
    tariffTypeId: "",
    guestLogTypes: "",
    blockedGuestLogTypes: "",
    freeRewardType: level.freeReward ? "ADMIN_OTHER" : "",
    freeRewardAmount: "",
    freeRewardLabel: level.freeReward ?? "",
    freeRewardCode: "",
    freeRewardLootBoxId: "",
    freeRewardLootBoxName: "",
    freeRewardLootBoxRarity: "common",
    freeRewardDelivery: "ADMIN",
    premiumRewardType: level.premiumReward ? "ADMIN_OTHER" : "",
    premiumRewardAmount: "",
    premiumRewardLabel: level.premiumReward ?? "",
    premiumRewardCode: "",
    premiumRewardLootBoxId: "",
    premiumRewardLootBoxName: "",
    premiumRewardLootBoxRarity: "common",
    premiumRewardDelivery: "ADMIN",
  }));
}

function seasonLevelStepFormsToLevels(form: SeasonForm) {
  return form.levelSteps
    .map((step, index) => {
      const level = Math.max(1, numeric(step.level, index + 1));
      const freeReward = seasonStepRewardLabel(step, "free");
      const premiumReward = seasonStepRewardLabel(step, "premium");

      return {
        level,
        xp: 0,
        sequence: index + 1,
        unlockMode: "SEQUENTIAL_ACTION",
        title: nullable(step.title) ?? `Этап ${level}`,
        condition: nullable(step.condition),
        description: nullable(step.description),
        activationRules: seasonStepActivationRules(step),
        freeReward: nullable(freeReward),
        premiumReward: nullable(premiumReward),
        freeRewardDetails: seasonStepRewardDefinition(step, "free"),
        premiumRewardDetails: seasonStepRewardDefinition(step, "premium"),
      };
    })
    .filter((step) => step.title || step.freeReward || step.premiumReward)
    .sort((left, right) => left.level - right.level);
}

function seasonLevelStepFormsToRewards(
  form: SeasonForm,
  track: "free" | "premium",
) {
  return seasonLevelStepFormsToLevels(form)
    .map((step) => {
      const details =
        track === "free" ? step.freeRewardDetails : step.premiumRewardDetails;
      const reward = track === "free" ? step.freeReward : step.premiumReward;

      return {
        level: step.level,
        reward,
        track,
        ...(details
          ? {
              rewardType: details.type,
              delivery: details.delivery,
              details,
            }
          : {}),
      };
    })
    .filter((item) => Boolean(item.reward?.trim()))
    .map((item) => ({ ...item, reward: item.reward ?? "" }));
}

function seasonStepActivationRules(step: SeasonLevelStepForm) {
  const condition = step.conditionV2 ?? defaultBattlePassStepCondition;
  const taskType = condition.taskType;
  const purchaseTarget =
    condition.productMatch === "ALL"
      ? Math.max(
          1,
          condition.purchaseSource === "CATEGORY"
            ? condition.categorySelectionIds.length
            : condition.productIds.length,
        )
      : 1;
  const target =
    taskType === "APP_OPEN"
      ? 1
      : taskType === "PLAY_TIME"
      ? Math.max(1, condition.target)
      : taskType === "PRODUCT_PURCHASE"
        ? condition.amountMode === "PERIOD_TOTAL"
          ? Math.max(1, condition.totalAmount)
          : purchaseTarget
        : taskType === "BALANCE_TOPUP"
          ? condition.topupMode === "PERIOD_TOTAL"
            ? Math.max(1, condition.totalAmount)
            : condition.topupMode === "COUNT"
              ? Math.max(1, condition.topupCount)
              : 1
          : condition.checkInMode === "SINGLE"
            ? 1
            : condition.checkInMode === "STREAK"
              ? Math.max(1, condition.checkInDays)
              : Math.max(1, condition.checkInCount);
  const triggerKinds: Record<BattlePassStepConditionValue["taskType"], string> =
    {
      APP_OPEN: "APP_OPEN",
      PLAY_TIME: "PLAY_HOUR",
      PRODUCT_PURCHASE: "PRODUCT_PURCHASE",
      BALANCE_TOPUP: "BALANCE_TOPUP",
      CHECK_IN: "CHECK_IN",
    };
  const eventTypes: Record<BattlePassStepConditionValue["taskType"], string[]> =
    {
      APP_OPEN: ["APP_OPEN"],
      PLAY_TIME: ["PLAY_HOUR", "SESSION_STOP"],
      PRODUCT_PURCHASE: ["PRODUCT_PURCHASE", "BAR_PURCHASE"],
      BALANCE_TOPUP: ["BALANCE_TOPUP"],
      CHECK_IN: ["CHECK_IN"],
    };
  const aggregation =
    taskType === "APP_OPEN"
      ? "exists"
      : taskType === "PLAY_TIME"
      ? "duration"
      : taskType === "PRODUCT_PURCHASE"
        ? condition.amountMode === "PERIOD_TOTAL"
          ? "sum"
          : "count"
        : taskType === "BALANCE_TOPUP"
          ? condition.topupMode === "PERIOD_TOTAL"
            ? "sum"
            : condition.topupMode === "SINGLE"
              ? "exists"
              : "count"
          : condition.checkInMode === "STREAK"
            ? "streak"
            : "count";
  const unit =
    taskType === "APP_OPEN"
      ? "открытие"
      : taskType === "PLAY_TIME"
      ? "минут"
      : taskType === "PRODUCT_PURCHASE"
        ? condition.amountMode === "PERIOD_TOTAL"
          ? "₽"
          : "покупок"
        : taskType === "BALANCE_TOPUP"
          ? condition.topupMode === "PERIOD_TOTAL"
            ? "₽"
            : "пополнений"
          : condition.checkInMode === "STREAK"
            ? "дней"
            : "чекинов";
  const weekdays =
    taskType === "APP_OPEN" ||
    (taskType === "CHECK_IN" && !condition.specificDayEnabled)
      ? []
      : sortWeekdays(condition.weekdays);
  const hours =
    taskType === "APP_OPEN" ||
    (taskType === "CHECK_IN" && !condition.specificTimeEnabled)
      ? []
      : condition.hours.trim()
        ? [condition.hours.trim()]
        : [];

  return {
    source: "battle_pass_step",
    schemaVersion: 2,
    taskType,
    triggerKind: triggerKinds[taskType],
    sessionType: taskType === "APP_OPEN" ? "ANY" : condition.sessionType,
    periodicity: "NONE",
    purchaseSource:
      taskType === "PRODUCT_PURCHASE" ? condition.purchaseSource : undefined,
    categoryCatalogSource:
      taskType === "PRODUCT_PURCHASE" && condition.purchaseSource === "CATEGORY"
        ? condition.categoryCatalogSource
        : undefined,
    metric: {
      eventTypes: eventTypes[taskType],
      aggregation,
      target,
      unit,
      windowDays: Math.max(1, condition.windowDays),
      weekdays,
      hours,
      minSessionMinutes:
        taskType === "PLAY_TIME"
          ? Math.max(0, condition.minSessionMinutes)
          : undefined,
      purchaseSource:
        taskType === "PRODUCT_PURCHASE" ? condition.purchaseSource : undefined,
      categoryCatalogSource:
        taskType === "PRODUCT_PURCHASE" &&
        condition.purchaseSource === "CATEGORY"
          ? condition.categoryCatalogSource
          : undefined,
      productMatch:
        taskType === "PRODUCT_PURCHASE" ? condition.productMatch : undefined,
      amountMode:
        taskType === "PRODUCT_PURCHASE" ? condition.amountMode : undefined,
      productIds:
        taskType === "PRODUCT_PURCHASE" &&
        condition.purchaseSource === "PRODUCT"
          ? condition.productIds
          : [],
      externalProductIds: [],
      categorySelectionIds:
        taskType === "PRODUCT_PURCHASE" &&
        condition.purchaseSource === "CATEGORY"
          ? condition.categorySelectionIds
          : [],
      categoryIds:
        taskType === "PRODUCT_PURCHASE" &&
        condition.purchaseSource === "CATEGORY"
          ? condition.categorySelectionIds
          : [],
      categorySelectionLabels:
        taskType === "PRODUCT_PURCHASE" &&
        condition.purchaseSource === "CATEGORY"
          ? condition.categorySelectionLabels
          : [],
      minSpendAmount:
        taskType === "PRODUCT_PURCHASE" &&
        condition.amountMode === "SINGLE_MINIMUM"
          ? Math.max(0, condition.minimumAmount)
          : taskType === "BALANCE_TOPUP" &&
              condition.topupMode !== "PERIOD_TOTAL" &&
              condition.topupComparison === "AT_LEAST"
            ? Math.max(0, condition.topupAmount)
            : undefined,
      exactSpendAmount:
        taskType === "BALANCE_TOPUP" &&
        condition.topupMode !== "PERIOD_TOTAL" &&
        condition.topupComparison === "EXACT"
          ? Math.max(0, condition.topupAmount)
          : undefined,
      totalAmount:
        (taskType === "PRODUCT_PURCHASE" &&
          condition.amountMode === "PERIOD_TOTAL") ||
        (taskType === "BALANCE_TOPUP" && condition.topupMode === "PERIOD_TOTAL")
          ? Math.max(1, condition.totalAmount)
          : undefined,
      topupMode: taskType === "BALANCE_TOPUP" ? condition.topupMode : undefined,
      amountComparison:
        taskType === "BALANCE_TOPUP" ? condition.topupComparison : undefined,
      amount: taskType === "BALANCE_TOPUP" ? condition.topupAmount : undefined,
      count:
        taskType === "BALANCE_TOPUP"
          ? condition.topupCount
          : taskType === "CHECK_IN"
            ? condition.checkInCount
            : undefined,
      checkInMode: taskType === "CHECK_IN" ? condition.checkInMode : undefined,
      days: taskType === "CHECK_IN" ? condition.checkInDays : undefined,
    },
  };
}

function seasonStepRewardDefinition(
  step: SeasonLevelStepForm,
  track: "free" | "premium",
) {
  const legacyReward = track === "free" ? step.freeReward : step.premiumReward;
  const rewardType =
    (track === "free" ? step.freeRewardType : step.premiumRewardType) ??
    (legacyReward?.trim() ? "ADMIN_OTHER" : "");

  if (!rewardType) {
    return null;
  }

  const amountValue =
    track === "free" ? step.freeRewardAmount : step.premiumRewardAmount;
  const labelValue =
    track === "free" ? step.freeRewardLabel : step.premiumRewardLabel;
  const codeValue =
    track === "free" ? step.freeRewardCode : step.premiumRewardCode;
  const lootBoxIdValue =
    track === "free" ? step.freeRewardLootBoxId : step.premiumRewardLootBoxId;
  const lootBoxNameValue =
    track === "free"
      ? step.freeRewardLootBoxName
      : step.premiumRewardLootBoxName;
  const lootBoxRarityValue =
    track === "free"
      ? step.freeRewardLootBoxRarity
      : step.premiumRewardLootBoxRarity;
  const deliveryValue =
    track === "free" ? step.freeRewardDelivery : step.premiumRewardDelivery;
  const amount = optionalNumber(amountValue ?? "");
  const rawLabel = (labelValue ?? legacyReward ?? "").trim();
  const label =
    rawLabel ||
    (rewardType === "BONUS_BALANCE" && amount != null
      ? `${amount} бонусов`
      : rewardType === "PROMOCODE"
        ? "Промокод"
        : rewardType === "LOOT_BOX"
          ? (nullable(lootBoxNameValue ?? "") ?? "Лутбокс Battle Pass")
          : "Ручная награда");

  return {
    type: rewardType,
    label,
    amount,
    code: nullable(codeValue ?? ""),
    delivery: deliveryValue === "ADMIN" ? "ADMIN" : "AUTO",
    ...(rewardType === "LOOT_BOX"
      ? {
          lootBox: {
            id: nullable(lootBoxIdValue ?? ""),
            name: nullable(lootBoxNameValue ?? "") ?? label,
            caseRarity: lootBoxRarityValue ?? "common",
          },
        }
      : {}),
  };
}

function seasonStepRewardLabel(
  step: SeasonLevelStepForm,
  track: "free" | "premium",
) {
  return seasonStepRewardDefinition(step, track)?.label ?? "";
}

function battlePassRewardTrackSummary(
  form: SeasonForm,
  track: "free" | "premium",
  lootBoxes: GuestGameLootBox[],
): BattlePassRewardTrackSummary {
  const lootBoxesById = new Map(
    lootBoxes.map((lootBox) => [lootBox.id, lootBox]),
  );
  const summary: BattlePassRewardTrackSummary = {
    rewardCount: 0,
    lootBoxCount: 0,
    linkedLootBoxCount: 0,
    minBonus: 0,
    expectedBonus: 0,
    maxBonus: 0,
    fixedRewards: [],
    unresolved: [],
  };

  for (const step of form.levelSteps) {
    const definition = seasonStepRewardDefinition(step, track);

    if (!definition) {
      continue;
    }

    summary.rewardCount += 1;

    if (definition.type === "BONUS_BALANCE") {
      const amount =
        definition.amount ?? bonusAmountFromRewardLabel(definition.label);

      if (amount == null) {
        summary.unresolved.push(
          `${definition.label}: не указана сумма бонусов`,
        );
        continue;
      }

      summary.minBonus += amount;
      summary.expectedBonus += amount;
      summary.maxBonus += amount;
      continue;
    }

    if (definition.type !== "LOOT_BOX") {
      summary.fixedRewards.push(definition.label);
      continue;
    }

    summary.lootBoxCount += 1;
    const rewardLootBox =
      "lootBox" in definition ? definition.lootBox : undefined;
    const linkedLootBoxId = rewardLootBox?.id ?? null;
    const linkedLootBox = linkedLootBoxId
      ? lootBoxesById.get(linkedLootBoxId)
      : null;

    if (!linkedLootBox) {
      summary.unresolved.push(
        `${definition.label}: не выбран конкретный лутбокс`,
      );
      continue;
    }

    const prizes = lootBoxPrizesToForm(linkedLootBox.probabilityRules, {
      rewardType: linkedLootBox.rewardType,
      rewardAmount: String(linkedLootBox.rewardAmount ?? 0),
      rewardLabel: linkedLootBox.rewardLabel ?? linkedLootBox.name,
    }).filter((prize) => numeric(prize.chancePercent, 0) > 0);
    const totalWeight = prizes.reduce(
      (total, prize) => total + numeric(prize.chancePercent, 0),
      0,
    );

    if (!prizes.length || totalWeight <= 0) {
      summary.unresolved.push(
        `${definition.label}: нет корректной таблицы призов`,
      );
      continue;
    }

    const outcomes = prizes.map((prize) => {
      if (!battlePassBonusRewardType(prize.rewardType)) {
        return { bonusAmount: 0, weight: numeric(prize.chancePercent, 0) };
      }

      const amount = optionalNumber(prize.rewardAmount);
      return {
        bonusAmount: amount ?? 0,
        weight: numeric(prize.chancePercent, 0),
        missingAmount: amount == null,
      };
    });

    if (outcomes.some((outcome) => outcome.missingAmount)) {
      summary.unresolved.push(
        `${definition.label}: у приза не указана сумма бонусов`,
      );
      continue;
    }

    summary.linkedLootBoxCount += 1;
    summary.minBonus += Math.min(
      ...outcomes.map((outcome) => outcome.bonusAmount),
    );
    summary.maxBonus += Math.max(
      ...outcomes.map((outcome) => outcome.bonusAmount),
    );
    summary.expectedBonus += outcomes.reduce(
      (total, outcome) =>
        total + outcome.bonusAmount * (outcome.weight / totalWeight),
      0,
    );
  }

  summary.fixedRewards = [...new Set(summary.fixedRewards)];
  summary.unresolved = [...new Set(summary.unresolved)];

  return summary;
}

function battlePassBonusRewardType(value: string | null | undefined) {
  return [
    "BONUS",
    "BONUS_BALANCE",
    "BONUS_POINTS",
    "CASHBACK",
    "CASH_BALANCE",
    "LANGAME_BALANCE",
    "LOYALTY_BONUS",
  ].includes((value ?? "").trim().toUpperCase());
}

function bonusAmountFromRewardLabel(value: string | null | undefined) {
  const match = (value ?? "").match(
    /(\d[\d\s]*(?:[.,]\d+)?)\s*(?:бонус|балл)/i,
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function rewardLabelLooksLikeLootBox(value: string | null | undefined) {
  return /(?:лутбокс|кейс|контейнер)/i.test(value ?? "");
}

function legacySeasonRewardForm(
  rewardLabel: string | null,
  details: Record<string, unknown>,
) {
  let type =
    recordString(details, "type") ?? (rewardLabel?.trim() ? "ADMIN_OTHER" : "");
  let amount = numberRule(details, "amount", "");

  if (!type || type === "ADMIN_OTHER") {
    const inferredBonusAmount = bonusAmountFromRewardLabel(rewardLabel);

    if (inferredBonusAmount != null) {
      type = "BONUS_BALANCE";
      amount = String(inferredBonusAmount);
    } else if (rewardLabelLooksLikeLootBox(rewardLabel)) {
      type = "LOOT_BOX";
    }
  }

  return {
    type,
    amount,
    label: recordString(details, "label") ?? rewardLabel ?? "",
    code: recordString(details, "code") ?? "",
    lootBoxId:
      recordString(asRecord(details.lootBox), "id") ??
      recordString(details, "lootBoxId") ??
      "",
    lootBoxName:
      recordString(asRecord(details.lootBox), "name") ??
      (type === "LOOT_BOX" ? (rewardLabel ?? "") : ""),
    lootBoxRarity: lootBoxCaseRarity(asRecord(details.lootBox)) ?? "common",
    delivery: recordString(details, "delivery") ?? "AUTO",
  };
}

function formatRewardNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function seasonLevelStepsToForm(value: unknown): SeasonLevelStepForm[] {
  const steps = arrayRule(value)
    .map((item, index) => {
      const row = asRecord(item);
      const level = numeric(String(row.level ?? ""), index + 1);
      const freeReward = recordString(row, "freeReward");
      const premiumReward = recordString(row, "premiumReward");
      const activationRules = asRecord(row.activationRules);
      const freeRewardDetails = asRecord(row.freeRewardDetails);
      const premiumRewardDetails = asRecord(row.premiumRewardDetails);
      const freeRewardForm = legacySeasonRewardForm(
        freeReward,
        freeRewardDetails,
      );
      const premiumRewardForm = legacySeasonRewardForm(
        premiumReward,
        premiumRewardDetails,
      );
      const title =
        recordString(row, "title") ??
        freeReward ??
        premiumReward ??
        `Этап ${level}`;

      return {
        id: recordString(row, "id") ?? `level-${level}-${index}`,
        level: String(level),
        xp: "0",
        title,
        condition:
          recordString(row, "condition") ?? `Выполните условие шага ${level}.`,
        description: recordString(row, "description") ?? "",
        freeReward: freeReward ?? "",
        premiumReward: premiumReward ?? "",
        conditionV2: seasonStepConditionFromRules(activationRules),
        triggerKind: recordString(activationRules, "triggerKind") ?? "",
        sessionType: recordString(activationRules, "sessionType") ?? "",
        timeWindowMode: lootBoxTimeWindowMode(activationRules),
        weekdayMode: lootBoxWeekdayMode(activationRules),
        selectedWeekdays: numberArrayRule(activationRules, "weekdays"),
        hourFrom: timeWindowPart(activationRules, 0, "10:00"),
        hourTo: timeWindowPart(activationRules, 1, "16:00"),
        tariffGroupId: recordString(activationRules, "tariffGroupId") ?? "",
        tariffPeriodId: recordString(activationRules, "tariffPeriodId") ?? "",
        tariffTypeId: recordString(activationRules, "tariffTypeId") ?? "",
        guestLogTypes: stringListRule(activationRules, "guestLogTypes"),
        blockedGuestLogTypes: stringListRule(
          activationRules,
          "blockedGuestLogTypes",
        ),
        freeRewardType: freeRewardForm.type,
        freeRewardAmount: freeRewardForm.amount,
        freeRewardLabel: freeRewardForm.label,
        freeRewardCode: freeRewardForm.code,
        freeRewardLootBoxId: freeRewardForm.lootBoxId,
        freeRewardLootBoxName: freeRewardForm.lootBoxName,
        freeRewardLootBoxRarity: freeRewardForm.lootBoxRarity,
        freeRewardDelivery: freeRewardForm.delivery,
        premiumRewardType: premiumRewardForm.type,
        premiumRewardAmount: premiumRewardForm.amount,
        premiumRewardLabel: premiumRewardForm.label,
        premiumRewardCode: premiumRewardForm.code,
        premiumRewardLootBoxId: premiumRewardForm.lootBoxId,
        premiumRewardLootBoxName: premiumRewardForm.lootBoxName,
        premiumRewardLootBoxRarity: premiumRewardForm.lootBoxRarity,
        premiumRewardDelivery: premiumRewardForm.delivery,
      };
    })
    .filter((step) => step.title.trim().length > 0);

  return steps.length
    ? steps
    : defaultSeasonLevelSteps.map((step) => ({ ...step }));
}

function seasonStepConditionFromRules(
  rules: Record<string, unknown>,
): BattlePassStepConditionValue {
  const metric = asRecord(rules.metric);
  const triggerKind = recordString(rules, "triggerKind")?.toUpperCase() ?? "";
  const rawTaskType = recordString(rules, "taskType")?.toUpperCase();
  const taskType: BattlePassStepConditionValue["taskType"] =
    rawTaskType === "APP_OPEN" ||
    rawTaskType === "PRODUCT_PURCHASE" ||
    rawTaskType === "BALANCE_TOPUP" ||
    rawTaskType === "CHECK_IN" ||
    rawTaskType === "PLAY_TIME"
      ? rawTaskType
      : triggerKind === "APP_OPEN"
        ? "APP_OPEN"
        : triggerKind.includes("PURCHASE")
        ? "PRODUCT_PURCHASE"
        : triggerKind.includes("BALANCE")
          ? "BALANCE_TOPUP"
          : triggerKind === "CHECK_IN"
            ? "CHECK_IN"
            : "PLAY_TIME";
  const rawSessionType = recordString(rules, "sessionType")?.toUpperCase();
  const sessionType: BattlePassStepConditionValue["sessionType"] =
    rawSessionType === "HOURLY" || rawSessionType === "REGULAR_SESSION"
      ? "HOURLY"
      : rawSessionType === "PACKAGE_OR_SUBSCRIPTION" ||
          rawSessionType === "PACKET_HOURS"
        ? "PACKAGE_OR_SUBSCRIPTION"
        : "ANY";
  const purchaseSource =
    recordString(rules, "purchaseSource")?.toUpperCase() === "CATEGORY" ||
    recordString(metric, "purchaseSource")?.toUpperCase() === "CATEGORY"
      ? "CATEGORY"
      : "PRODUCT";
  const categoryCatalogSource =
    recordString(rules, "categoryCatalogSource")?.toUpperCase() ===
      "LEETPLUS" ||
    recordString(metric, "categoryCatalogSource")?.toUpperCase() === "LEETPLUS"
      ? "LEETPLUS"
      : "LANGAME";
  const categorySelections = arrayRule(metric.categorySelections)
    .map((item) => asRecord(item))
    .map((item) => ({
      id: recordString(item, "id") ?? "",
      name: recordString(item, "name") ?? "Сохранённая категория",
    }))
    .filter((item) => item.id);
  const savedCategoryLabels = arrayRule(metric.categorySelectionLabels)
    .map((item) => asRecord(item))
    .map((item) => ({
      id: recordString(item, "id") ?? "",
      name: recordString(item, "name") ?? "Сохранённая категория",
    }))
    .filter((item) => item.id);
  const categorySelectionIds = stringArrayRule(
    metric.categorySelectionIds ?? metric.categoryIds,
  );
  const labels = [...categorySelections, ...savedCategoryLabels];
  const labelById = new Map(labels.map((item) => [item.id, item.name]));
  const topupMode = enumConditionValue(
    recordString(metric, "topupMode"),
    ["SINGLE", "COUNT", "PERIOD_TOTAL"] as const,
    "SINGLE",
  );
  const checkInMode = enumConditionValue(
    recordString(metric, "checkInMode"),
    ["SINGLE", "COUNT", "PERIOD", "STREAK"] as const,
    "SINGLE",
  );
  const amountMode = enumConditionValue(
    recordString(metric, "amountMode"),
    ["NONE", "SINGLE_MINIMUM", "PERIOD_TOTAL"] as const,
    "NONE",
  );
  const hours = stringArrayRule(metric.hours);
  const weekdays = numberArrayRule(metric, "weekdays");

  return {
    ...defaultBattlePassStepCondition,
    schemaVersion: numeric(String(rules.schemaVersion ?? "1"), 1),
    taskType,
    sessionType,
    target: numeric(String(metric.target ?? "60"), 60),
    windowDays: numeric(String(metric.windowDays ?? "30"), 30),
    hours: hours[0] ?? "09:00-21:00",
    weekdays,
    minSessionMinutes: numeric(String(metric.minSessionMinutes ?? "0"), 0),
    purchaseSource,
    categoryCatalogSource,
    productMatch: enumConditionValue(
      recordString(metric, "productMatch"),
      ["ANY", "ALL"] as const,
      "ANY",
    ),
    amountMode,
    minimumAmount: numeric(String(metric.minSpendAmount ?? "200"), 200),
    totalAmount: numeric(
      String(
        metric.totalAmount ??
          (amountMode === "PERIOD_TOTAL" ? metric.target : 1000),
      ),
      1000,
    ),
    productIds: stringArrayRule(metric.productIds),
    categorySelectionIds,
    categorySelectionLabels: categorySelectionIds.map((id) => ({
      id,
      name: labelById.get(id) ?? "Сохранённая категория",
    })),
    topupMode,
    topupComparison:
      recordString(metric, "amountComparison")?.toUpperCase() === "EXACT"
        ? "EXACT"
        : "AT_LEAST",
    topupAmount: numeric(
      String(
        metric.exactSpendAmount ??
          metric.minSpendAmount ??
          metric.amount ??
          "500",
      ),
      500,
    ),
    topupCount: numeric(String(metric.count ?? "3"), 3),
    checkInMode,
    checkInCount: numeric(String(metric.count ?? "5"), 5),
    checkInDays: numeric(String(metric.days ?? "7"), 7),
    specificDayEnabled: weekdays.length > 0,
    specificTimeEnabled: hours.length > 0,
  };
}

function stringArrayRule(value: unknown) {
  return arrayRule(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function enumConditionValue<const T extends readonly string[]>(
  value: string | null | undefined,
  values: T,
  fallback: T[number],
): T[number] {
  const normalized = value?.toUpperCase();
  return values.includes(normalized as T[number])
    ? (normalized as T[number])
    : fallback;
}

function recordString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lootBoxCanBeRewardTemplate(lootBox: Pick<GuestGameLootBox, "status">) {
  return lootBox.status === "ACTIVE";
}

function nextSeasonStepId() {
  return `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const order = new Map(
    weekdayOptions.map((item, index) => [item.value, index]),
  );

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
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
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

function lootBoxPeriodicLimitPeriod(
  value: unknown,
): LootBoxPeriodicLimitPeriod | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";

  return raw === "DAILY" || raw === "WEEKLY" || raw === "MONTHLY" ? raw : null;
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
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
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

function seasonTypeLabel(value: string) {
  return value === "CLUB_SEASON" ? "Клубный сезон" : value || "Клубный сезон";
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
    .filter((item): item is { id: string; title: string; missionId: string } =>
      Boolean(item),
    );
}

function missionQuestEnabled(value: unknown) {
  return booleanRule(
    value,
    "questEnabled",
    missionQuestSteps(value).length > 0,
  );
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
    ? `задание: ${steps.length} ${missionStepCountLabel(
        steps.length,
      )}, ${templateCount} шабл.`
    : `задание: ${steps.length} ${missionStepCountLabel(steps.length)}`;
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
    : (labels[aggregation] ?? aggregation);
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
  fallback: Pick<
    LootBoxPrizeForm,
    "rewardType" | "rewardAmount" | "rewardLabel"
  >,
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
  fallback: Pick<
    LootBoxPrizeForm,
    "rewardType" | "rewardAmount" | "rewardLabel"
  >,
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

function lootBoxCaseRarity(value: unknown): LootBoxCaseRarity {
  const record = asRecord(value);
  const raw = record.caseRarity ?? record.skinRarity ?? record.lootBoxRarity;

  return raw === "rare" ||
    raw === "epic" ||
    raw === "legendary" ||
    raw === "common"
    ? raw
    : "common";
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

function dateInputIsoValue(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBudgetAmount(value: number | null | undefined) {
  return value == null ? "Безлимит" : formatMoney(value);
}

function missionAvailabilitySummary(mission: GuestGameMission) {
  const now = Date.now();
  const from = mission.periodFrom ? new Date(mission.periodFrom).getTime() : null;
  const to = mission.periodTo ? new Date(mission.periodTo).getTime() : null;

  if (mission.status === "ACTIVE" && from && Number.isFinite(from) && from > now) {
    return `начнётся ${formatDate(mission.periodFrom)}`;
  }
  if (mission.status === "ACTIVE" && to && Number.isFinite(to) && to < now) {
    return `период завершён ${formatDate(mission.periodTo)}`;
  }
  if (!mission.periodTo) return "бессрочно";
  return `до ${formatDate(mission.periodTo)}`;
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
      return "Задание";
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
  const normalized = normalizeUiSessionType(value);

  return (
    sessionTypeOptions.find((option) => option.value === normalized)?.label ??
    value ??
    "любой тип"
  );
}

function trackingId(prefix: string, value: string | null | undefined) {
  const compact = (value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `${prefix}-${compact || "NEW"}`;
}

function normalizeUiSessionType(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");

  if (
    [
      "packet_hours",
      "packet",
      "package",
      "package_hours",
      "subscription",
      "membership",
      "abonement",
      "abonnement",
      "абонемент",
    ].includes(normalized)
  ) {
    return "packet_hours";
  }

  if (
    ["regular_session", "regular", "common", "default"].includes(normalized)
  ) {
    return "regular_session";
  }

  return normalized;
}

function battlePassLevelRows(season: GuestGameSeason) {
  return arrayRule(season.levels).map((item, index) => {
    const record = asRecord(item);
    const levelValue = Number(record.level);
    const xpValue = Number(record.xp);
    const level = Number.isFinite(levelValue)
      ? Math.trunc(levelValue)
      : index + 1;
    const rewardLabel = String(
      record.freeReward ??
        record.premiumReward ??
        record.reward ??
        `Уровень ${level}`,
    ).trim();

    return {
      id: trackingId(`BP${String(level).padStart(2, "0")}`, season.id),
      level,
      xp: Number.isFinite(xpValue) ? Math.trunc(xpValue) : null,
      label: rewardLabel || `Уровень ${level}`,
    };
  });
}

function packetStateLabel(value: boolean | null) {
  if (value === true) {
    return "пакет или абонемент";
  }
  if (value === false) {
    return "почасовая";
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
