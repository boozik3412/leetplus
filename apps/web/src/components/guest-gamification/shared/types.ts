import type {
  GuestGameGuestLogMappingPreset,
  GuestGameGuestLogMappingIntent,
  GuestGameBonusLedgerQueueResult,
  GuestGameBonusLedgerDispatchResult,
  GuestGameBonusLedgerDispatchItem,
  GuestGameProfileStatus,
  GuestGameReward,
  GuestGameStatus,
  GuestGameLootBoxUsageKind,
  GuestGameRewardStatus,
} from "@/lib/guest-gamification";
import type {
  LootBoxPrizeVisualMode,
  LootBoxPrizeIconKey,
} from "@/components/lootbox-prize-visual";
import type {
  BattlePassStepConditionValue,
} from "@/components/battle-pass-step-condition-editor";

export type TabId =
  | "overview"
  | "statistics"
  | "effect"
  | "profiles"
  | "lootBoxes"
  | "missions"
  | "checkIn"
  | "seasons"
  | "leaderboard"
  | "promoCards"
  | "rewards"
  | "testRun";

export type RuleTemplateType = "loot-boxes" | "missions" | "seasons" | "promo-cards";

export type GuestLogMappingPayload = {
  rawType: string;
  label: string;
  preset: GuestGameGuestLogMappingPreset;
  intent: GuestGameGuestLogMappingIntent;
  note: string;
};

export type BonusLedgerActionResult =
  | { kind: "queue"; result: GuestGameBonusLedgerQueueResult }
  | { kind: "dispatch"; result: GuestGameBonusLedgerDispatchResult }
  | { kind: "cancel"; result: GuestGameBonusLedgerDispatchItem };

export type BonusLedgerActionOptions = {
  storeId?: string | null;
  limit?: number;
};

export type MissionMigrationNotice = {
  message: string;
};

export type PromoBannerUsageInfo = {
  visibleStoreNames: string[];
  overflowStoreNames: string[];
};

export type PromoBannerStoreUsage = {
  storeId: string;
  storeName: string;
  activeCount: number;
  visibleCount: number;
  overflowCount: number;
};

export type PromoBannerUsageSummary = {
  byCardId: Map<string, PromoBannerUsageInfo>;
  visibleCardIds: Set<string>;
  overflowCardIds: Set<string>;
  activeCardIds: Set<string>;
  stores: PromoBannerStoreUsage[];
};

export type ProfileForm = {
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

export type LootBoxPrizeForm = {
  id: string;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  chancePercent: string;
  noBonus: boolean;
  visualMode: LootBoxPrizeVisualMode;
  iconKey: LootBoxPrizeIconKey;
  imageUrl: string;
  borderColor: string;
  textColor: string;
  backgroundColor: string;
};

export type LootBoxTimeWindowMode = "ANY" | "QUIET_HOURS" | "CUSTOM";

export type LootBoxWeekdayMode = "ANY" | "WEEKDAYS" | "WEEKENDS" | "CUSTOM";

export type LootBoxCaseRarity = NonNullable<GuestGameReward["rewardRarity"]>;

export type LootBoxPeriodicLimitPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

export type LootBoxForm = {
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
  maxPendingRewards: string;
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

export type MissionQuestStepForm = {
  id: string;
  title: string;
  missionId: string;
};

export type MissionForm = {
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

export type SeasonLevelStepForm = {
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

export type SeasonForm = {
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

export type PromoBannerForm = {
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

export type PromoBannerNotice = {
  tone: "warning" | "error";
  message: string;
};

export type RewardForm = {
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

export type RewardRedeemForm = {
  claim: string;
  storeId: string;
  note: string;
};

export type EventForm = {
  profileId: string;
  eventType: string;
  source: string;
  xpDelta: string;
  note: string;
  payloadText: string;
};

export type DryRunForm = {
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

export type TariffConditionPatch = {
  tariffGroupId?: string;
  tariffPeriodId?: string;
  tariffTypeId?: string;
};

export type GuestLogBusinessPreset = {
  id: string;
  label: string;
  description: string;
  intent: "allow" | "block";
  tokens: string[];
  types: string[];
};

export type GuestLogEventOption = {
  value: string;
  label: string;
  description: string;
};

export type StatusPillTone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "purple"
  | "cyan";

export type ApiRequestErrorBody = {
  code?: string;
  message?: string;
  stores?: Array<{ storeName?: string }>;
  storeNames?: string[];
};
