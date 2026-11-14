"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GuestGamificationVisualEditor } from "@/components/guest-gamification-visual-editor";
import { HourlySessionSourceNote } from "@/components/hourly-session-source-note";
import {
  LootBoxPrizeVisual,
  defaultLootBoxPrizeColors,
  defaultLootBoxPrizeIconKey,
  lootBoxPrizeCardColorStyle,
  lootBoxPrizeIconOptions,
  lootBoxPrizeVisualModeOptions,
  normalizeLootBoxPrizeColor,
  normalizeLootBoxPrizeIconKey,
  type LootBoxPrizeIconKey,
  type LootBoxPrizeVisualMode,
} from "@/components/lootbox-prize-visual";
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
  GuestGameDryRunResult,
  GuestGameGuestLogCatalog,
  GuestGameGuestLogTypeMapping,
  GuestGameDelivery,
  GuestGameDeliveryDispatchResult,
  GuestGameDeliveryStatus,
  GuestGameLootBox,
  GuestGameMission,
  GuestGamePromoCard,
  GuestGameProfile,
  GuestGameProfileStatus,
  GuestGamePipelineRunResult,
  GuestGameRewardMaterializerManualRunResult,
  GuestGameRewardMaterializerStatus,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameSeason,
  GuestGameProcessEventResult,
  GuestGameSnapshotFact,
  GuestGameSnapshotFactsResult,
  GuestGameStatus,
  GuestGameTariffSnapshotEndpoint,
  GuestGamificationWorkspace,
} from "@/lib/guest-gamification";
import type { Product } from "@/lib/products";
import type { Store } from "@/lib/stores";
import type {
  TabId,
  RuleTemplateType,
  LootBoxTimeWindowMode,
  LootBoxWeekdayMode,
  LootBoxPeriodicLimitPeriod,
  ProfileForm,
  LootBoxForm,
  MissionForm,
  SeasonLevelStepForm,
  SeasonForm,
  PromoBannerForm,
  RewardForm,
  RewardRedeemForm,
  EventForm,
  DryRunForm,
  BonusLedgerActionResult,
  PromoBannerNotice,
  MissionMigrationNotice,
  GuestLogMappingPayload,
  BonusLedgerActionOptions,
  LootBoxCaseRarity,
  LootBoxPrizeForm,
  MissionQuestStepForm,
  GuestLogEventOption,
  GuestLogBusinessPreset,
} from "./guest-gamification/shared/types";
export type { TabId } from "./guest-gamification/shared/types";
import {
  rewardTypeOptions,
  defaultLootBoxPrizes,
  defaultMissionQuestSteps,
  emptyDryRunSource,
  smallButtonClass,
  dangerButtonClass,
  primaryButtonClass,
  fieldClass,
  dryRunEventOptions,
  sessionTypeOptions,
  lootBoxCaseRarityOptions,
  triggerHelpText,
  lootBoxUsageKindLabels,
  PROMO_BANNER_DISPLAY_LIMIT,
  weekdayPresets,
  weekdayOptions,
} from "./guest-gamification/shared/constants";
import {
  jsonText,
  cloneMissionQuestSteps,
  manualXpPayloadText,
  isCheckInMission,
  normalizeCheckInMissionForm,
  nullable,
  primaryLootBoxPrize,
  formatMoney,
  formatDate,
  sessionTypeLabel,
  rewardTypeLabelFromValue,
  guestLogBusinessPresets,
  trackingId,
  optionLabel,
  tariffRuleSummary,
  guestLogRuleSummary,
  formatBudgetAmount,
  missionVisibilityValue,
  stringRule,
  lootBoxPeriodicLimitPeriod,
  sortWeekdays,
  numeric,
  formatChanceNumber,
  lootBoxPrizesToForm,
  missionQuestSteps,
  seasonStepRewardLabel,
  lootBoxCaseRarity,
  guestLogEventOptions,
  csvList,
  appendCsvToken,
  removeCsvToken,
  appendCsvTokens,
  csvHasToken,
  normalizeUiSessionType,
  stringListRule,
  asRecord,
  metricRule,
  arrayRule,
  optionalNumber,
  canonicalLootBoxRewardType,
  seasonStepRewardDefinition,
  bonusAmountFromRewardLabel,
} from "./guest-gamification/shared/helpers";
import { fetchJson, ApiRequestError } from "./guest-gamification/shared/api";
import {
  Field,
  OptionHelp,
  FormSection,
  OptionSelect,
  ToggleField,
} from "./guest-gamification/shared/ui";
import {
  TariffConditionFields,
  RulesLayout,
  RuleCommonFields,
  StoreSelect,
  RuleCard,
  StatusSelect,
  AudienceSelect,
  BudgetField,
  RewardApprovalSelect,
  BusinessRuleSection,
  SelectedGuestLogEvents,
} from "./guest-gamification/shared/rule-fields";
import {
  promoCardMetadata,
  metadataString,
  compactStoreNames,
  renderPromoBannerImage,
  clampPromoBannerScale,
  clampPromoBannerOffset,
  promoBannerCanAppear,
  promoBannerMatchesStore,
  dateMs,
  isInlineImageSource,
} from "./guest-gamification/shared/promo-banner";
import { ProfilesTab } from "./guest-gamification/tabs/profiles-tab";
import { CheckInTab } from "./guest-gamification/tabs/check-in-tab";
import { RewardsTab } from "./guest-gamification/tabs/rewards-tab";
import { DryRunTab } from "./guest-gamification/tabs/dry-run-tab";
import { OverviewTab } from "./guest-gamification/tabs/overview-tab";
import { PromoBannersTab } from "./guest-gamification/tabs/promo-banners-tab";

const GuestGamificationEffectTab = dynamic(
  () =>
    import("@/components/guest-gamification-effect-tab").then(
      (module) => module.GuestGamificationEffectTab,
    ),
  {
    loading: () => (
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    ),
  },
);

const GuestGamificationStatisticsTab = dynamic(
  () =>
    import("@/components/guest-gamification-statistics-tab").then(
      (module) => module.GuestGamificationStatisticsTab,
    ),
  {
    loading: () => (
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    ),
  },
);

const GuestGamificationLeaderboardTab = dynamic(
  () =>
    import("@/components/guest-gamification-leaderboard-tab").then(
      (module) => module.GuestGamificationLeaderboardTab,
    ),
  {
    loading: () => (
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    ),
  },
);

type Props = {
  initialWorkspace: GuestGamificationWorkspace;
  audiences: GuestAudience[];
  stores: Store[];
  guests: GuestDashboardRow[];
  leads: GuestCrmLead[];
  products: Product[];
  tenantSlug: string;
  initialRewardMaterializerStatus: GuestGameRewardMaterializerStatus | null;
  initialTab?: TabId;
  initialEditorMode?: EditorMode;
  access: {
    canManageRules: boolean;
    canApproveRewards: boolean;
    canOperateLedger: boolean;
    canViewGuestPii: boolean;
    isPlatformAdmin: boolean;
    canRunRewardMaterializer: boolean;
    canUseTestRun: boolean;
  };
};

export type EditorMode = "advanced" | "visual";

const editorModeOptions = [
  ["advanced", "Расширенные настройки"],
  ["visual", "Визуальный редактор"],
] as const satisfies readonly [EditorMode, string][];

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

type MissionWizardMigrationResult = {
  migrated: GuestGameMission[];
  skipped: Array<{ id: string; name: string; reason: string }>;
};

const allTabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "statistics", label: "Статистика" },
  { id: "effect", label: "Эффект" },
  { id: "profiles", label: "Профили" },
  { id: "lootBoxes", label: "Кейсы" },
  { id: "missions", label: "Задания" },
  { id: "checkIn", label: "Чекин" },
  { id: "seasons", label: "Battle Pass" },
  { id: "leaderboard", label: "Рейтинг" },
  { id: "promoCards", label: "Промо баннеры" },
  { id: "testRun", label: "Тест запуска" },
  { id: "rewards", label: "Кошелек" },
];

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

const lootBoxRewardTypeOptions = rewardTypeOptions.filter(
  (option) => !["BALANCE", "BATTLE_PASS_REWARD"].includes(option.value),
);

const battlePassStepRewardTypeOptions = [
  { value: "", label: "Без награды" },
  {
    value: "BATTLE_PASS_COMPLETION_MARKER",
    label: "Служебный этап (без выдачи)",
  },
  { value: "BONUS_BALANCE", label: "Бонусы Langame" },
  { value: "PROMOCODE", label: "Промокод" },
  { value: "LOOT_BOX", label: "Лутбокс" },
  { value: "ADMIN_OTHER", label: "Иной приз" },
];

const battlePassStepRewardDeliveryOptions = [
  { value: "AUTO", label: "Автоматическая выдача" },
  { value: "ADMIN", label: "Администратором" },
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
  maxPendingRewards: "1",
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
    maxPendingRewards: 1,
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
      noBonus: prize.noBonus,
      visualMode: prize.visualMode,
      iconKey: prize.iconKey,
      imageUrl: prize.imageUrl || null,
      borderColor: normalizeLootBoxPrizeColor(prize.borderColor),
      textColor: normalizeLootBoxPrizeColor(prize.textColor),
      backgroundColor: normalizeLootBoxPrizeColor(prize.backgroundColor),
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

const maxMissionQuestSteps = 10;

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
    conditionV2: {
      ...defaultBattlePassStepCondition,
      taskType: "APP_OPEN",
      target: 1,
    },
    freeRewardType: "BATTLE_PASS_COMPLETION_MARKER",
    freeRewardLabel: "Старт сезона",
    freeRewardDelivery: "AUTO",
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
  initialRewardMaterializerStatus,
  initialTab = "overview",
  initialEditorMode = "advanced",
  access,
}: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  // «Тест запуска» is shown to the owner and platform admins only.
  const tabs = allTabs.filter(
    (tab) => tab.id !== "testRun" || access.canUseTestRun,
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);
  const [directoryGuests, setDirectoryGuests] = useState(guests);
  const [directoryLeads, setDirectoryLeads] = useState(leads);
  const [missionProducts, setMissionProducts] = useState(products);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [missionProductsLoading, setMissionProductsLoading] = useState(false);
  const directoryRequested = useRef(guests.length > 0 || leads.length > 0);
  const missionProductsRequested = useRef(products.length > 0);
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
  const [rewardMaterializerStatus, setRewardMaterializerStatus] = useState(
    initialRewardMaterializerStatus,
  );
  const [rewardMaterializerResult, setRewardMaterializerResult] =
    useState<GuestGameRewardMaterializerManualRunResult | null>(null);
  const [redeemedReward, setRedeemedReward] = useState<GuestGameReward | null>(
    null,
  );
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingLootBoxId, setEditingLootBoxId] = useState<string | null>(null);
  const [isLootBoxFormOpen, setIsLootBoxFormOpen] = useState(false);
  const [lootBoxFormRevealSeq, setLootBoxFormRevealSeq] = useState(0);
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
  const [missionMigrationNotice, setMissionMigrationNotice] =
    useState<MissionMigrationNotice | null>(null);
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

  async function ensureGuestDirectory() {
    if (directoryRequested.current || directoryLoading) return;

    directoryRequested.current = true;
    setDirectoryLoading(true);
    try {
      const [guestsResponse, leadsResponse] = await Promise.all([
        fetch("/api/guests?pageSize=80&sort=lastActivity", {
          cache: "no-store",
        }),
        fetch("/api/guests/crm/leads", { cache: "no-store" }),
      ]);
      if (!guestsResponse.ok || !leadsResponse.ok) {
        throw new Error("Не удалось загрузить справочник гостей.");
      }
      const [guestPayload, leadPayload] = (await Promise.all([
        guestsResponse.json(),
        leadsResponse.json(),
      ])) as [{ rows?: GuestDashboardRow[] }, GuestCrmLead[]];
      setDirectoryGuests(guestPayload.rows ?? []);
      setDirectoryLeads(Array.isArray(leadPayload) ? leadPayload : []);
    } catch (loadError) {
      directoryRequested.current = false;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить справочник гостей.",
      );
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function ensureMissionProducts() {
    if (missionProductsRequested.current || missionProductsLoading) return;

    missionProductsRequested.current = true;
    setMissionProductsLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить каталог товаров.");
      }
      const payload = (await response.json()) as Product[];
      setMissionProducts(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      missionProductsRequested.current = false;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить каталог товаров.",
      );
    } finally {
      setMissionProductsLoading(false);
    }
  }

  function openGamificationTab(tab: TabId) {
    if (["profiles", "rewards", "testRun"].includes(tab)) {
      void ensureGuestDirectory();
    }
    if (["missions", "seasons"].includes(tab)) {
      void ensureMissionProducts();
    }

    const url = new URL(window.location.href);
    if (tab === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    setActiveTab(tab);
  }

  function editProfile(profile: GuestGameProfile) {
    setProfileForm(profileToForm(profile));
    setEditingProfileId(profile.id);
    openGamificationTab("profiles");
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
    setLootBoxFormRevealSeq((seq) => seq + 1);
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
    if (!isCheckInMission(mission)) void ensureMissionProducts();
    openGamificationTab(isCheckInMission(mission) ? "checkIn" : "missions");
  }

  function createMission() {
    setMissionForm(defaultMissionForm);
    setEditingMissionId(null);
    setIsMissionFormOpen(true);
    void ensureMissionProducts();
    openGamificationTab("missions");
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
    void ensureMissionProducts();
    openGamificationTab("seasons");
  }

  function createSeason() {
    setSeasonForm(defaultSeasonForm);
    setEditingSeasonId(null);
    setIsSeasonFormOpen(true);
    void ensureMissionProducts();
    openGamificationTab("seasons");
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
    openGamificationTab("rewards");
  }

  function resetRewardForm() {
    setRewardForm(defaultRewardForm);
    setEditingRewardId(null);
  }

  async function reloadWorkspace() {
    const next = await fetchJson<GuestGamificationWorkspace>(
      "/api/guests/gamification/workspace?compact=1",
    );
    setWorkspace(next);
  }

  async function runRewardMaterializer() {
    await saveAction("reward-materializer-run", async () => {
      assertCan(
        access.canRunRewardMaterializer,
        "Ручной запуск materializer доступен только владельцу или администратору.",
      );
      const result = await postJson<GuestGameRewardMaterializerManualRunResult>(
        "/api/guests/gamification/reward-materializer/run",
        { limit: 100 },
      );
      setRewardMaterializerResult(result);

      const [nextStatus] = await Promise.all([
        fetchJson<GuestGameRewardMaterializerStatus>(
          "/api/guests/gamification/reward-materializer/status",
        ).catch(() => null),
        reloadWorkspace().catch(() => undefined),
      ]);
      if (nextStatus) {
        setRewardMaterializerStatus(nextStatus);
      }
    });
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
        access.canOperateLedger,
        "Для постановки бонусов в ledger нужно право `Геймификация: bonus ledger`.",
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
        access.canOperateLedger,
        "Для проверки dispatch нужно право `Геймификация: bonus ledger`.",
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
        access.canOperateLedger,
        "Для запуска dispatch нужно право `Геймификация: bonus ledger`.",
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
        access.canOperateLedger,
        "Для запуска canary нужно право `Геймификация: bonus ledger`.",
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
        access.canOperateLedger,
        "Для отмены записи нужно право `Геймификация: bonus ledger`.",
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

  async function migrateActiveMissionsToWizard() {
    setSaving("missions-migrate-wizard");
    setError(null);

    try {
      assertCan(
        access.canManageRules,
        "Для переноса заданий в мастер нужно право `Геймификация: правила`.",
      );
      const result = await postJson<MissionWizardMigrationResult>(
        "/api/guests/gamification/missions/migrate-active-to-wizard",
        {},
      );
      await reloadWorkspace();
      setMissionMigrationNotice({
        message: result.migrated.length
          ? `В мастер перенесено активных заданий: ${result.migrated.length}. ID, статусы, награды, лимиты и текущий прогресс сохранены.`
          : "Активных заданий старого формата не осталось.",
      });
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось перенести активные задания в мастер.",
      );
      return false;
    } finally {
      setSaving(null);
    }
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
              Гости
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Игровой модуль
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Уровни, задания, кейсы, Battle Pass и награды гостей. Разовую
              награду гостю вручную (турнир, друг, день рождения) выдают в
              разделе{" "}
              <Link
                href="/marketing/missions"
                className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                «Ручные награды»
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            {access.canManageRules ? (
              <Link
                href="/gamification/missions/wizard"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Создать механику
              </Link>
            ) : null}
            <div className="inline-flex max-w-full rounded-lg border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {editorModeOptions.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={editorModeRefreshing !== null}
                  onClick={() => void switchEditorMode(mode)}
                  className={[
                    "min-w-0 rounded-md px-3 text-center sm:whitespace-nowrap py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70",
                    editorMode === mode
                      ? "bg-zinc-950 text-white dark:bg-cyan-300 dark:text-zinc-950"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
            . Просмотр и проверка без начисления остаются доступными.
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
                onClick={() => openGamificationTab(tab.id)}
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

          {directoryLoading &&
          ["profiles", "rewards", "testRun"].includes(activeTab) ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Загружаем справочник гостей…
            </p>
          ) : null}

          {activeTab === "overview" ? (
            <OverviewTab
              workspace={workspace}
              pendingRewards={pendingRewards}
              onRewardStatus={updateRewardStatus}
              onEditReward={editReward}
              onOpenTab={openGamificationTab}
              saving={saving}
              tenantSlug={tenantSlug}
              stores={stores}
              canApproveRewards={access.canApproveRewards}
              canOperateLedger={access.canOperateLedger}
              canManageRules={access.canManageRules}
              canViewIntegrationReadiness={access.isPlatformAdmin}
              canOpenTestRun={access.canUseTestRun}
              diagnosticsLead={
                <>
                  {access.isPlatformAdmin ? (
                    // ui-copy-allow: диагностика для платформы
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      Начисления в Langame идут через журнал начислений:
                      подтверждённая награда попадает в очередь, проверка без
                      начисления проверяет связку, а отправка пишет бонусы
                      только при включенном режиме на сервере.
                    </div>
                  ) : null}
                  {rewardMaterializerStatus ||
                  access.canRunRewardMaterializer ? (
                    <RewardMaterializerControl
                      status={rewardMaterializerStatus}
                      result={rewardMaterializerResult}
                      canRun={access.canRunRewardMaterializer}
                      running={saving === "reward-materializer-run"}
                      onRun={runRewardMaterializer}
                    />
                  ) : null}
                </>
              }
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

          {activeTab === "statistics" ? (
            <GuestGamificationStatisticsTab stores={stores} />
          ) : null}

          {activeTab === "effect" ? (
            <GuestGamificationEffectTab canManage={access.canManageRules} />
          ) : null}

          {activeTab === "leaderboard" ? (
            <GuestGamificationLeaderboardTab canManage={access.canManageRules} />
          ) : null}

          {activeTab === "profiles" ? (
            <ProfilesTab
              form={profileForm}
              setForm={setProfileForm}
              guests={directoryGuests}
              leads={directoryLeads}
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
              formRevealSeq={lootBoxFormRevealSeq}
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
              products={missionProducts}
              productsLoading={missionProductsLoading}
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
              legacyActiveMissionCount={
                workspace.missions.filter(
                  (mission) =>
                    mission.status === "ACTIVE" &&
                    mission.definitionVersion < 2,
                ).length
              }
              migrationNotice={missionMigrationNotice}
              onMigrateActive={migrateActiveMissionsToWizard}
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
              products={missionProducts}
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
              error={error}
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
              guests={directoryGuests}
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

          {activeTab === "testRun" && access.canUseTestRun ? (
            <DryRunTab
              form={dryRunForm}
              setForm={setDryRunForm}
              result={dryRunResult}
              processResult={processEventResult}
              profiles={workspace.profiles}
              guests={directoryGuests}
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
  formRevealSeq,
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
  formRevealSeq: number;
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
      formRevealSeq={formRevealSeq}
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
                    <option value="">Любая</option>
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value || "any"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {form.sessionType === "regular_session" ? (
                    <HourlySessionSourceNote />
                  ) : null}
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
  productsLoading,
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
  legacyActiveMissionCount,
  migrationNotice,
  onMigrateActive,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  products: Product[];
  productsLoading: boolean;
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
  legacyActiveMissionCount: number;
  migrationNotice: MissionMigrationNotice | null;
  onMigrateActive: () => Promise<boolean>;
  saving: string | null;
  canManage: boolean;
}) {
  const [editorChoice, setEditorChoice] = useState<GuestGameMission | null>(
    null,
  );
  const [migrationConfirmation, setMigrationConfirmation] = useState(false);
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {legacyActiveMissionCount > 0 && canManage ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={() => setMigrationConfirmation(true)}
                  disabled={saving === "missions-migrate-wizard"}
                >
                  Перевести старые задания
                </button>
              ) : null}
              <Link
                href="/gamification/missions/wizard"
                className={`${primaryButtonClass} sm:min-w-64`}
              >
                Создать задание с помощью мастера
              </Link>
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
                    onChange={(missionType) =>
                      setForm({ ...form, missionType })
                    }
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
              {productsLoading && form.missionType === "PRODUCT_PURCHASE" ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Загружаем каталог товаров…
                </p>
              ) : null}
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
      {migrationNotice ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          role="status"
        >
          {migrationNotice.message}
        </div>
      ) : null}
      {legacyActiveMissionCount > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-amber-950 dark:text-amber-100">
                Активные задания старого формата: {legacyActiveMissionCount}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900 dark:text-amber-200">
                Перевод создаст v2-контракт мастера без смены ID, статуса,
                сроков, наград, лимитов и даты активации. Накопленный прогресс
                не будет пересчитан или выдан повторно.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                className={`${primaryButtonClass} shrink-0`}
                onClick={() => setMigrationConfirmation(true)}
                disabled={saving === "missions-migrate-wizard"}
              >
                Перевести в мастер
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {migrationConfirmation ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setMigrationConfirmation(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-migration-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="mission-migration-title"
              className="text-xl font-black text-zinc-950 dark:text-white"
            >
              Перевести активные задания в мастер?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Будут перенесены все {legacyActiveMissionCount} активных заданий
              старого формата. Сначала сервер проверит, что каждое условие можно
              выразить через мастер; при любой несовместимости ничего не
              изменится.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className={smallButtonClass}
                onClick={() => setMigrationConfirmation(false)}
                disabled={saving === "missions-migrate-wizard"}
              >
                Отмена
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "missions-migrate-wizard"}
                onClick={() => {
                  void onMigrateActive().then((migrated) => {
                    if (migrated) setMigrationConfirmation(false);
                  });
                }}
              >
                {saving === "missions-migrate-wizard"
                  ? "Проверяем и переносим…"
                  : "Подтвердить перенос"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
              «{editorChoice.name}» открывается в мастере с live-предпросмотром.
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
                  Это правило ещё в контракте v1. Сначала переведите активные
                  задания в мастер — старый редактор больше не используется.
                </div>
              )}
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
  error,
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
  error: string | null;
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
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
              >
                {error}
              </div>
            ) : null}
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
            item.manualApprovalRequired
              ? "выдача: после подтверждения сотрудником"
              : "выдача: автоматически",
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
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-2">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Максимальное количество накопленных наград для получения
            <input
              className={fieldClass}
              type="number"
              min="1"
              step="1"
              value={form.maxPendingRewards}
              onChange={(event) =>
                onChange({ maxPendingRewards: event.target.value })
              }
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Сколько неоткрытых кейсов этого лутбокса гость может хранить
            одновременно. После открытия кейса слот освобождается.
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
  const prizesRef = useRef(prizes);
  const [uploadingPrizeId, setUploadingPrizeId] = useState<string | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);
  useEffect(() => {
    prizesRef.current = prizes;
  }, [prizes]);
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
  const updatePrizeById = (
    prizeId: string,
    patch: Partial<LootBoxPrizeForm>,
  ) => {
    onChange(
      prizesRef.current.map((prize) =>
        prize.id === prizeId ? { ...prize, ...patch } : prize,
      ),
    );
  };
  const uploadPrizeImage = async (prizeId: string, file: File | null) => {
    if (!file) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
      setVisualError("Для приза выберите изображение JPG, PNG или WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setVisualError("Изображение приза должно быть не больше 2 МБ.");
      return;
    }

    setVisualError(null);
    setUploadingPrizeId(prizeId);
    try {
      const body = new FormData();
      body.set("file", file);
      const asset = await fetchJson<{ url?: string }>("/api/guest-game/media", {
        method: "POST",
        body,
      });

      if (!asset.url) {
        throw new Error("Медиахранилище не вернуло адрес изображения.");
      }

      updatePrizeById(prizeId, {
        visualMode: "IMAGE",
        imageUrl: asset.url,
      });
    } catch (error) {
      setVisualError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить изображение приза.",
      );
    } finally {
      setUploadingPrizeId(null);
    }
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
        noBonus: false,
        visualMode: "AUTO",
        iconKey: "coins",
        imageUrl: "",
        borderColor: "",
        textColor: "",
        backgroundColor: "",
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
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="grid gap-2 lg:grid-cols-[minmax(150px,1fr)_minmax(110px,0.6fr)_minmax(190px,1.2fr)_minmax(110px,0.55fr)_auto] lg:items-end">
              <Field label="Тип награды">
                <OptionSelect
                  options={lootBoxRewardTypeOptions}
                  value={prize.rewardType}
                  preservedLabel="Сохраненный тип награды"
                  onChange={(rewardType) => {
                    const noBonus = rewardType === "MERCH" && prize.noBonus;
                    updatePrize(index, {
                      rewardType,
                      noBonus,
                      ...(noBonus ? { rewardAmount: "0" } : {}),
                      ...(prize.visualMode === "AUTO"
                        ? { iconKey: defaultLootBoxPrizeIconKey(rewardType) }
                        : {}),
                    });
                  }}
                />
              </Field>
              <Field label="Сумма">
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  value={prize.rewardAmount}
                  disabled={prize.rewardType === "MERCH" && prize.noBonus}
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

            {prize.rewardType === "MERCH" ? (
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 text-sm text-zinc-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-zinc-100">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-600"
                  type="checkbox"
                  checked={prize.noBonus}
                  onChange={(event) =>
                    updatePrize(index, {
                      noBonus: event.target.checked,
                      ...(event.target.checked ? { rewardAmount: "0" } : {}),
                    })
                  }
                />
                <span>
                  <strong className="block">Без бонусов</strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Игрок получит только физический приз. Бонусы на баланс не
                    начисляются.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-[112px_minmax(180px,0.8fr)_minmax(240px,1.2fr)] md:items-end">
              <div className="row-span-2 flex min-h-28 items-center justify-center rounded-lg border border-cyan-200 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_68%)] text-cyan-700 dark:border-cyan-900 dark:text-cyan-200">
                <LootBoxPrizeVisual
                  alt={`Визуал приза ${prize.rewardLabel || index + 1}`}
                  className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:h-14 [&_svg]:w-14"
                  imageUrl={
                    prize.visualMode === "IMAGE" ? prize.imageUrl : null
                  }
                  iconKey={prize.visualMode === "AUTO" ? null : prize.iconKey}
                  rewardType={prize.rewardType}
                />
              </div>
              <Field label="Визуал награды">
                <OptionSelect
                  options={lootBoxPrizeVisualModeOptions}
                  value={prize.visualMode}
                  preservedLabel="Сохраненный режим визуала"
                  onChange={(visualMode) =>
                    updatePrize(index, {
                      visualMode: visualMode as LootBoxPrizeVisualMode,
                    })
                  }
                />
              </Field>
              {prize.visualMode === "IMAGE" ? (
                <Field label="Собственное изображение">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${fieldClass} min-w-0 flex-1`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingPrizeId === prize.id}
                      onChange={(event) => {
                        void uploadPrizeImage(
                          prize.id,
                          event.target.files?.[0] ?? null,
                        );
                        event.target.value = "";
                      }}
                    />
                    {prize.imageUrl ? (
                      <button
                        type="button"
                        className={smallButtonClass}
                        onClick={() => updatePrize(index, { imageUrl: "" })}
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </Field>
              ) : (
                <Field label="Стандартная иконка">
                  <OptionSelect
                    options={lootBoxPrizeIconOptions}
                    value={
                      prize.visualMode === "AUTO"
                        ? defaultLootBoxPrizeIconKey(prize.rewardType)
                        : prize.iconKey
                    }
                    preservedLabel="Сохраненная иконка"
                    onChange={(iconKey) =>
                      updatePrize(index, {
                        visualMode: "ICON",
                        iconKey: iconKey as LootBoxPrizeIconKey,
                      })
                    }
                  />
                </Field>
              )}
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:col-start-2 md:col-end-4">
                {uploadingPrizeId === prize.id
                  ? "Загружаем изображение…"
                  : prize.visualMode === "IMAGE"
                    ? "JPG, PNG или WebP до 2 МБ. Изображение вписывается в карточку без обрезки."
                    : "Иконка используется в рулетке и остаётся резервом, если изображение недоступно."}
              </p>
            </div>

            <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3">
              <LootBoxPrizeColorField
                label="Рамка карточки"
                value={prize.borderColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.borderColor
                }
                onChange={(borderColor) => updatePrize(index, { borderColor })}
              />
              <LootBoxPrizeColorField
                label="Текст карточки"
                value={prize.textColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.textColor
                }
                onChange={(textColor) => updatePrize(index, { textColor })}
              />
              <LootBoxPrizeColorField
                label="Фон карточки"
                value={prize.backgroundColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.backgroundColor
                }
                onChange={(backgroundColor) =>
                  updatePrize(index, { backgroundColor })
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  Пустое значение использует автоматическую палитру редкости.
                </p>
                {prize.borderColor ||
                prize.textColor ||
                prize.backgroundColor ? (
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() =>
                      updatePrize(index, {
                        borderColor: "",
                        textColor: "",
                        backgroundColor: "",
                      })
                    }
                  >
                    Сбросить цвета
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {visualError ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {visualError}
        </p>
      ) : null}

      <LootBoxRouletteEditorPreview prizes={prizes} />
    </div>
  );
}

function LootBoxPrizeColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const selectedColor = normalizeLootBoxPrizeColor(value) ?? fallback;

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
          type="color"
          value={selectedColor}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          className={fieldClass}
          value={value}
          maxLength={7}
          placeholder={fallback}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          onBlur={() => {
            if (value && !normalizeLootBoxPrizeColor(value)) {
              onChange("");
            }
          }}
        />
      </span>
    </label>
  );
}

function LootBoxRouletteEditorPreview({
  prizes,
}: {
  prizes: LootBoxPrizeForm[];
}) {
  const stripPrizes = prizes.length
    ? Array.from(
        { length: Math.max(8, prizes.length * 2) },
        (_, index) => prizes[index % prizes.length]!,
      )
    : [];

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#03090b] p-4 text-white shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Предпросмотр рулетки</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Карточки обновляются сразу. В игровом модуле полоса движется, а
            рамка победителя подсвечивается по редкости.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
          Live preview
        </span>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/40 p-3">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
        <div className="flex min-w-max gap-2">
          {stripPrizes.map((prize, index) => {
            const chance = Math.max(0, numeric(prize.chancePercent, 0));
            const rarity = lootBoxPrizeEditorRarity(chance);

            return (
              <div
                key={`${prize.id}-preview-${index}`}
                className={[
                  "grid h-40 w-32 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-1 rounded-lg border bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%)] p-1 shadow-xl",
                  rarity.className,
                ].join(" ")}
                style={{
                  ...lootBoxPrizeCardColorStyle(prize),
                  borderColor:
                    normalizeLootBoxPrizeColor(prize.borderColor) ??
                    rarity.colors.borderColor,
                  color:
                    normalizeLootBoxPrizeColor(prize.textColor) ??
                    rarity.colors.textColor,
                  backgroundColor:
                    normalizeLootBoxPrizeColor(prize.backgroundColor) ??
                    rarity.colors.backgroundColor,
                }}
              >
                <strong className="line-clamp-2 px-1 pt-1 text-xs leading-tight">
                  {prize.rewardLabel || "Награда"}
                </strong>
                <LootBoxPrizeVisual
                  alt=""
                  className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-md border border-current/30 [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:h-14 [&_svg]:w-14"
                  imageUrl={
                    prize.visualMode === "IMAGE" ? prize.imageUrl : null
                  }
                  iconKey={prize.visualMode === "AUTO" ? null : prize.iconKey}
                  rewardType={prize.rewardType}
                />
                <span className="px-1 pb-1 text-[9px] font-black uppercase tracking-wide opacity-90">
                  {rarity.label} · {formatChanceNumber(chance)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function lootBoxPrizeEditorRarity(chancePercent: number) {
  if (chancePercent <= 1) {
    return {
      label: "Легендарная",
      className: "border-amber-300/80 text-amber-100 shadow-amber-500/20",
      colors: {
        borderColor: "#FCD34D",
        textColor: "#FEF3C7",
        backgroundColor: "#1C1405",
      },
    };
  }
  if (chancePercent <= 4) {
    return {
      label: "Эпическая",
      className: "border-violet-300/80 text-violet-100 shadow-violet-500/20",
      colors: {
        borderColor: "#C4B5FD",
        textColor: "#EDE9FE",
        backgroundColor: "#160D2B",
      },
    };
  }
  if (chancePercent <= 15) {
    return {
      label: "Редкая",
      className: "border-cyan-300/80 text-cyan-100 shadow-cyan-500/20",
      colors: {
        borderColor: defaultLootBoxPrizeColors.borderColor,
        textColor: defaultLootBoxPrizeColors.textColor,
        backgroundColor: defaultLootBoxPrizeColors.backgroundColor,
      },
    };
  }
  return {
    label: "Обычная",
    className: "border-zinc-500/80 text-zinc-100 shadow-black/20",
    colors: {
      borderColor: "#9EB5B7",
      textColor: "#F4F4F5",
      backgroundColor: "#050D10",
    },
  };
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
  const currentLootBox = currentLootBoxId
    ? (lootBoxes.find((lootBox) => lootBox.id === currentLootBoxId) ?? null)
    : null;
  const currentLootBoxIsEligible = currentLootBox
    ? lootBoxCanBeRewardTemplate(currentLootBox)
    : !currentLootBoxId;
  const rewardLootBoxes = lootBoxes.filter(lootBoxCanBeRewardTemplate);

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
              value={currentLootBoxIsEligible ? currentLootBoxId : ""}
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
            {!currentLootBoxIsEligible ? (
              <p
                role="alert"
                className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300"
              >
                Ранее выбранный лутбокс «{currentLootBox?.name ?? "недоступен"}»
                работает только на витрине. Выберите подарочный лутбокс или
                лутбокс с режимом «Витрина + подарок».
              </p>
            ) : null}
            <OptionHelp>
              Для награды доступны только активные подарочные лутбоксы и
              лутбоксы с режимом «Витрина + подарок». Их таблица призов будет
              участвовать в расчете минимальной, ожидаемой и максимальной
              награды Battle Pass.
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
      {rewardType === "BATTLE_PASS_COMPLETION_MARKER" ? (
        <Field label="Название этапа в истории">
          <input
            className={fieldClass}
            value={step[labelKey] ?? step[legacyKey] ?? ""}
            onChange={(event) =>
              patchReward({
                [labelKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          />
          <OptionHelp>
            Этап будет отмечен как полученный сразу после выполнения, без
            отдельной выдачи и без уведомления о неполученной награде.
          </OptionHelp>
        </Field>
      ) : null}
    </div>
  );
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

function RewardMaterializerControl({
  status,
  result,
  canRun,
  running,
  onRun,
}: {
  status: GuestGameRewardMaterializerStatus | null;
  result: GuestGameRewardMaterializerManualRunResult | null;
  canRun: boolean;
  running: boolean;
  onRun: () => Promise<void>;
}) {
  const queueReady =
    (status?.queue.intents.ready ?? 0) + (status?.queue.effects.ready ?? 0);
  const queueProcessing =
    (status?.queue.intents.processing ?? 0) +
    (status?.queue.effects.processing ?? 0);
  const deadLetters =
    (status?.queue.intents.deadLetters ?? 0) +
    (status?.queue.effects.deadLetters ?? 0);
  const runtimeRunning = status?.runtime.running ?? false;
  const backgroundReady = status?.runtime.backgroundReady ?? false;
  const backgroundAppliesToTenant =
    backgroundReady && (status?.runtime.scope.appliesToViewerTenant ?? false);
  const killSwitchEnabled = status?.runtime.killSwitchEnabled ?? false;
  const runDisabled =
    !status ||
    running ||
    runtimeRunning ||
    backgroundAppliesToTenant ||
    killSwitchEnabled;

  const modeLabel = !status
    ? "статус недоступен"
    : killSwitchEnabled
      ? "остановлено"
      : runtimeRunning
        ? "выполняется"
        : backgroundAppliesToTenant
          ? "автоматически"
          : "вручную";
  const modeClass = !status
    ? "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
    : killSwitchEnabled
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
      : runtimeRunning
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-zinc-950 dark:text-white">
              Обработка наград
            </h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${modeClass}`}
            >
              {modeLabel}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {status ? (
              <>
                Ждут обработки: {queueReady}. В работе: {queueProcessing}.
                Не удалось обработать: {deadLetters}. Обычно это идёт само;
                ручной запуск обработает только вашу сеть, и повтор не начислит
                награду дважды.
              </>
            ) : (
              "Очередь не загружена, поэтому ручной запуск заблокирован."
            )}
          </p>
        </div>
        {canRun ? (
          <button
            type="button"
            disabled={runDisabled}
            onClick={() => void onRun()}
            className="shrink-0 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {running || runtimeRunning
              ? "Обрабатываем…"
              : backgroundAppliesToTenant
                ? "Идёт автоматически"
                : "Обработать сейчас (до 100)"}
          </button>
        ) : null}
      </div>

      {result ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200">
          <span className="font-semibold">
            {rewardMaterializerResultLabel(result)}
          </span>
          {" · "}события: {result.intents.applied} обработано,{" "}
          {materializerIssueCount(result.intents)} с ошибкой; награды:{" "}
          {result.effects.applied} выдано, {result.effects.recovered}{" "}
          восстановлено, {materializerIssueCount(result.effects)} с ошибкой.
        </div>
      ) : null}
    </section>
  );
}

function materializerIssueCount(
  counts: GuestGameRewardMaterializerManualRunResult["intents"],
) {
  return counts.failed + counts.deadLettered + counts.staleFinalizations;
}

function rewardMaterializerResultLabel(
  result: GuestGameRewardMaterializerManualRunResult,
) {
  if (result.reason === "KILL_SWITCH_ENABLED") {
    return "Обработка остановлена, запуск недоступен";
  }
  if (result.reason === "RUN_ALREADY_IN_PROGRESS") {
    return "Другой проход уже выполняется";
  }
  if (result.status === "PARTIAL") {
    return "Проход завершён частично";
  }
  if (result.status === "FAILED") {
    return "Проход завершился ошибкой";
  }
  return "Проход завершён";
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
    sessionType: normalizeUiSessionType(lootBox.sessionType),
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
    maxPendingRewards: numberRule(lootBox.limits, "maxPendingRewards", "1"),
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

function lootBoxMatchesStoreFilter(
  lootBox: Pick<GuestGameLootBox, "storeIds">,
  storeId: string,
) {
  return (
    !storeId || !lootBox.storeIds.length || lootBox.storeIds.includes(storeId)
  );
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

async function buildPromoBannerMetadata(form: PromoBannerForm) {
  const renderedImage = await renderPromoBannerImage(form);
  const imageUrl = await persistPromoBannerImage(renderedImage);
  const scale = clampPromoBannerScale(Number(form.imageScale));
  const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX));
  const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY));
  const actionUrl = normalizeExternalActionUrl(form.actionUrl);

  return {
    source: "advanced_editor",
    imageAspectRatio: "9:16",
    imageUrl: imageUrl || null,
    imageStorage: imageUrl ? "media_asset" : null,
    actionLabel: nullable(form.actionLabel),
    actionUrl,
    crop: {
      scale,
      offsetX,
      offsetY,
    },
  };
}

async function persistPromoBannerImage(imageUrl: string) {
  if (!imageUrl || !isInlineImageSource(imageUrl)) {
    return imageUrl;
  }

  const imageResponse = await fetch(imageUrl);

  if (!imageResponse.ok) {
    throw new Error("Не удалось подготовить картинку баннера к загрузке.");
  }

  const blob = await imageResponse.blob();
  const body = new FormData();
  body.set(
    "file",
    new File([blob], "promo-banner.jpg", {
      type: blob.type || "image/jpeg",
    }),
  );
  const asset = await fetchJson<{ url?: string }>("/api/guest-game/media", {
    method: "POST",
    body,
  });

  if (!asset.url) {
    throw new Error("Медиахранилище не вернуло адрес картинки.");
  }

  return asset.url;
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
  const maxPendingRewards = Math.max(
    1,
    Math.trunc(optionalNumber(form.maxPendingRewards) ?? 1),
  );

  return {
    source: "business_controls",
    ...(form.periodicLimitEnabled
      ? { periodicLimit: form.periodicLimitPeriod }
      : {}),
    ...(perGuestPerWeek == null ? {} : { perGuestPerWeek }),
    ...(totalPerDay == null ? {} : { totalPerDay }),
    maxPendingRewards,
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
      const noBonus = rewardType === "MERCH" && prize.noBonus;

      return {
        rewardType,
        rewardAmount: noBonus ? 0 : (optionalNumber(prize.rewardAmount) ?? 0),
        rewardLabel:
          rewardLabel ||
          rewardTypeLabelFromValue(rewardType) ||
          "Награда лутбокса",
        chancePercent,
        weight: chancePercent,
        noBonus,
        visualMode: prize.visualMode,
        iconKey: normalizeLootBoxPrizeIconKey(prize.iconKey, rewardType),
        imageUrl:
          prize.visualMode === "IMAGE" ? nullable(prize.imageUrl) : null,
        borderColor: normalizeLootBoxPrizeColor(prize.borderColor),
        textColor: normalizeLootBoxPrizeColor(prize.textColor),
        backgroundColor: normalizeLootBoxPrizeColor(prize.backgroundColor),
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
          noBonus: false,
          visualMode: "AUTO" as const,
          iconKey: defaultLootBoxPrizeIconKey(form.rewardType),
          imageUrl: null,
          borderColor: null,
          textColor: null,
          backgroundColor: null,
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
        id: step.id,
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
    condition.purchaseSource !== "ANY" && condition.productMatch === "ALL"
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
    sessionType:
      taskType === "PLAY_TIME" || taskType === "CHECK_IN"
        ? condition.sessionType
        : "ANY",
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
      windowMatch:
        taskType === "PLAY_TIME" && condition.windowMatch === "OVERLAP"
          ? "OVERLAP"
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

    if (!linkedLootBox || !lootBoxCanBeRewardTemplate(linkedLootBox)) {
      summary.unresolved.push(
        `${definition.label}: выберите активный подарочный лутбокс`,
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
  const rawPurchaseSource =
    recordString(rules, "purchaseSource")?.toUpperCase() ??
    recordString(metric, "purchaseSource")?.toUpperCase();
  const purchaseSource =
    rawPurchaseSource === "CATEGORY"
      ? "CATEGORY"
      : rawPurchaseSource === "ANY"
        ? "ANY"
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
    windowMatch:
      recordString(metric, "windowMatch")?.toUpperCase() === "OVERLAP"
        ? "OVERLAP"
        : "SESSION_END",
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

function lootBoxCanBeRewardTemplate(
  lootBox: Pick<GuestGameLootBox, "status" | "usageKind">,
) {
  return (
    lootBox.status === "ACTIVE" &&
    (lootBox.usageKind === "REWARD_TEMPLATE" || lootBox.usageKind === "BOTH")
  );
}

function nextSeasonStepId() {
  return `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function levelRewardLabel(level: number, everyValue: string, label: string) {
  const every = numeric(everyValue, 0);
  return every && label.trim() && level % every === 0 ? label.trim() : null;
}

function numberArrayRule(value: unknown, key: string) {
  return arrayRule(asRecord(value)[key])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
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

function seasonTypeLabel(value: string) {
  return value === "CLUB_SEASON" ? "Клубный сезон" : value || "Клубный сезон";
}

function missionTypeLabel(value: string) {
  return optionLabel(missionTypeOptions, value);
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

function missionAvailabilitySummary(mission: GuestGameMission) {
  const now = Date.now();
  const from = mission.periodFrom
    ? new Date(mission.periodFrom).getTime()
    : null;
  const to = mission.periodTo ? new Date(mission.periodTo).getTime() : null;

  if (
    mission.status === "ACTIVE" &&
    from &&
    Number.isFinite(from) &&
    from > now
  ) {
    return `начнётся ${formatDate(mission.periodFrom)}`;
  }
  if (mission.status === "ACTIVE" && to && Number.isFinite(to) && to < now) {
    return `период завершён ${formatDate(mission.periodTo)}`;
  }
  if (!mission.periodTo) return "бессрочно";
  return `до ${formatDate(mission.periodTo)}`;
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
