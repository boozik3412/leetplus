import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  DailyDataCoverageScope,
  DailyDataCoverageStatus,
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  type GuestGameRewardIntent,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestIdentityResolverService } from '../integrations/guest-identity-resolver.service';
import { LangameClient } from '../integrations/langame.client';
import { parseLangameDate } from '../integrations/langame-date';
import {
  buildLangameTariffTypeGroupIndex,
  resolveLangameSessionTariff,
  type LangameTariffTypeGroupIndex,
} from '../integrations/langame-session-tariff';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestLog,
  LangameGuestSession,
  LangameTransaction,
} from '../integrations/langame.types';
import type { GuestPortalGameSummary } from '../guest-portal/guest-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffTeamChatService } from '../staff/staff-team-chat.service';
import { normalizeExternalActionUrl } from '../utilities/external-action-url';
import {
  GuestBonusLedgerSchedulerService,
  type GuestBonusLedgerSchedulerRuntimeStatus,
} from './guest-bonus-ledger-scheduler.service';
import {
  guestGameRewardMaterializerClaimsAllowed,
  resolveGuestGameRewardMaterializerPolicy,
} from './guest-game-reward-materializer-policy';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import {
  evaluateGuestGameLedgerRule,
  guestGameRuleActivationAt,
  guestGameRuleDomainTimeZones,
  guestGameRuleExternalDomains,
  guestGameSessionTypeFromConditions,
  guestGameStringArray,
  type GuestGameLedgerRule,
} from './guest-game-rule-evaluator';
import {
  evaluateGuestGameProgress,
  guestGameTriggerMatches,
  type GuestGameProgressEvent,
  type GuestGameProgressResult,
} from './guest-game-progress';
import {
  guestGameMissionDefinitionVersion,
  missionEvaluationPolicy,
  missionTaskType,
  missionTaskTypeFromConditions,
  missionWizardTrigger,
  normalizeMissionWizardConditions,
  validateMissionWizard,
  type GuestGameMissionWizardDto,
  type GuestGameMissionWizardReadiness,
  type GuestGameMissionTaskType,
} from './guest-game-mission-contract';
import {
  buildGuestGameOriginKey,
  buildGuestGameRewardIdempotencyKey,
  canonicalGuestGameEventType,
} from './guest-game-origin-key';
import {
  guestGameEvaluationPolicy,
  guestGamePolicyAllowsEvaluation,
  type GuestGameEvaluationMode,
} from './guest-game-source-policy';

const statusValues = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'ARCHIVED',
] as const;
const lootBoxUsageKindValues = [
  'STANDALONE',
  'REWARD_TEMPLATE',
  'BOTH',
] as const;
const profileStatuses = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
const rewardStatuses = [
  'PENDING',
  'APPROVED',
  'PAID',
  'CANCELED',
  'EXPIRED',
] as const;
const rewardSources = ['MANUAL', 'LANGAME', 'API_IMPORT', 'CASHIER'] as const;
const lootBoxRewardRarityLabels: Record<GuestGameRewardRarity, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};
const lootBoxCaseRarityLabels: Record<GuestGameRewardRarity, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};
const eventSources = [
  'MANUAL',
  'LANGAME',
  'API_IMPORT',
  'SYSTEM',
  'CHECK_IN',
] as const;
const deliveryChannels = ['TELEGRAM', 'MAX', 'CASHIER', 'MANUAL'] as const;
const deliveryStatuses = [
  'READY',
  'BLOCKED',
  'SENT',
  'FAILED',
  'CANCELED',
] as const;
const staffTestRewardAccrualEnabledEnv =
  'GUEST_GAME_STAFF_TEST_REWARD_ACCRUAL_ENABLED';
const LANGAME_TARIFF_TYPE_GROUP_CACHE_MS = 10 * 60 * 1000;
const liveSessionStartCacheDefaultTtlMs = 30_000;
const liveSessionStartLookupDefaultTimeoutMs = 4_000;
const liveSessionStartCacheMaxEntries = 1_000;
const promoBannerDisplayLimit = 4;
const otpSmsRateLimitDefaults = {
  phoneWindowMinutes: 60,
  phoneMax: 3,
  storeWindowMinutes: 10,
  storeMax: 30,
  tenantWindowMinutes: 24 * 60,
  tenantMax: 300,
};
const guestLogMappingPresets = [
  'visit_or_session_start',
  'session_finish',
  'events_and_tournaments',
  'balance_and_payment',
  'manual_or_risk',
  'custom',
] as const;
const guestLogMappingIntents = ['allow', 'block'] as const;
const snapshotFactSources = [
  'GUEST_SESSION',
  'GUEST_LOG',
  'GUEST_TRANSACTION',
  'GUEST_OPERATION_LOG',
  'GUEST_BALANCE',
  'GUEST_BONUS_BALANCE',
  'GUEST_LOYALTY_GROUP',
  'PRODUCT_EXPENSE',
  'GUEST_GAME_REFERRAL',
] as const;
const tariffSnapshotFreshMs = 24 * 60 * 60 * 1000;
const snapshotSessionClassificationGraceMs = 2 * 60 * 1000;
const snapshotSessionPackageCorrectionVersion = 'package-v1';
const snapshotPipelineBackfillLookbackDefaultMs = 30 * 24 * 60 * 60 * 1000;
const snapshotPipelineBackfillLookbackMinMs = 24 * 60 * 60 * 1000;
const snapshotPipelineBackfillLookbackMaxMs = 90 * 24 * 60 * 60 * 1000;
type SnapshotPipelineBackfillMode = 'OFF' | 'SHADOW' | 'LIVE';
type SnapshotPipelineBackfillPolicy = {
  mode: SnapshotPipelineBackfillMode;
  enabled: boolean;
  profileId: string | null;
  profileGuestIds: string[];
  liveNotBefore: Date | null;
};
const gameEffectWindowDays = 14;
const defaultGuestGameTimeZone = 'Asia/Yekaterinburg';
const guestLootBoxOpenSourceKind = 'GUEST_LOOT_BOX_OPEN';
const tariffSnapshotDefinitions = [
  {
    endpointKey: 'tariffsByDays',
    endpointPath: '/tariffs/by_days/list',
    title: 'Тарифы по дням',
    description: 'Дни недели и ограничения периода для заданий и loot box.',
  },
  {
    endpointKey: 'tariffsGroups',
    endpointPath: '/tariffs/groups/list',
    title: 'Группы тарифов',
    description: 'Группы тарифов и пакетов для условий сессий.',
  },
  {
    endpointKey: 'tariffsTimePeriod',
    endpointPath: '/tariffs/time_period/list',
    title: 'Тарифные периоды',
    description: 'Окна тихих часов, ночных пакетов и специальных периодов.',
  },
  {
    endpointKey: 'tariffsTypesGroups',
    endpointPath: '/tariffs/types_groups/list',
    title: 'Типы тарифных групп',
    description: 'Типы тарифов для разделения обычной игры и пакетов часов.',
  },
] as const;

const rewardApprovalEventLabels: Record<string, string> = {
  SESSION_START: 'Старт сессии',
  APP_OPEN: 'Открытие приложения',
  CHECK_IN: 'Чекин в клубе',
  VISIT: 'Визит в клуб',
  PLAY_HOUR: 'Час игры',
  BAR_PURCHASE: 'Покупка в баре',
  PRODUCT_PURCHASE: 'Покупка товара',
  BALANCE_TOPUP: 'Пополнение баланса',
  BALANCE_TOP_UP: 'Пополнение баланса',
  GUEST_LOG: 'Событие Langame',
  REFERRAL_ACCEPTED: 'Регистрация приглашенного гостя',
  GAME_REFERRAL_ACCEPTED: 'Регистрация приглашенного гостя',
  REPEAT_VISIT: 'Повторный визит',
  MISSION_COMPLETED: 'Задание выполнено',
  visit: 'Визит',
  login: 'Вход в клуб',
  tournament: 'Турнир',
  manual_cancel: 'Ручная отмена',
  test: 'Тестовое событие',
};

const rewardApprovalSegmentLabels: Record<string, string> = {
  quiet_hours: 'Тихие часы',
  new_guests: 'Новые гости',
  regular_guests: 'Постоянные гости',
  returning_guests: 'Вернувшиеся гости',
  vip_guests: 'VIP / активные',
  birthday: 'День рождения',
  referral: 'Реферальные гости',
};

const rewardApprovalMissionTypeLabels: Record<string, string> = {
  REPEAT_VISIT: 'Повторный визит',
  CHECK_IN: 'Чекин в клубе',
  VISIT: 'Посещение клуба',
  PLAY_HOUR: 'Игровое время',
  BAR_PURCHASE: 'Покупка в баре',
  PRODUCT_PURCHASE: 'Покупка товара',
  BALANCE_TOPUP: 'Пополнение баланса',
  REFERRAL_ACCEPTED: 'Приглашение друга',
  APP_OPEN: 'Возврат в приложение',
  GUEST_LOG: 'Событие Langame',
  CUSTOM: 'Свое задание',
};

const rewardApprovalProgressUnitLabels: Record<string, string> = {
  visit: 'визитов',
  check_in: 'чекинов',
  minute: 'минут игры',
  purchase: 'покупок',
  rub: 'рублей',
  day: 'уникальных дней',
  friend: 'друзей',
  event: 'событий',
  step: 'шагов',
};

const rewardApprovalSessionTypeLabels: Record<string, string> = {
  regular_session: 'почасовая сессия',
  packet_hours: 'пакет или абонемент',
};

type StatusValue = (typeof statusValues)[number];
type ProfileStatus = (typeof profileStatuses)[number];
type RewardStatus = (typeof rewardStatuses)[number];
type RewardSource = (typeof rewardSources)[number];
type EventSource = (typeof eventSources)[number];
type GuestLogMappingPreset = (typeof guestLogMappingPresets)[number];
type GuestLogMappingIntent = (typeof guestLogMappingIntents)[number];
type LootBoxPeriodicLimitPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type GuestGameTariffSnapshotStatus =
  | 'READY'
  | 'PARTIAL'
  | 'STALE'
  | 'FAILED'
  | 'UNPROFILED';

const gameProfileInclude = {
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
      phoneConsentStatus: true,
      phoneConsentSource: true,
      phoneConsentAt: true,
      unsubscribedAt: true,
    },
  },
  lead: {
    select: {
      id: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
      matchedGuestId: true,
      phoneConsentStatus: true,
      phoneConsentSource: true,
      phoneConsentAt: true,
      unsubscribedAt: true,
    },
  },
  createdByUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.GuestGameProfileInclude;

const audienceSelect = {
  id: true,
  name: true,
  description: true,
  guestsCount: true,
} satisfies Prisma.GuestAudienceSelect;

const creatorSelect = {
  id: true,
  fullName: true,
  email: true,
} satisfies Prisma.UserSelect;

const pilotStoreSelect = {
  id: true,
  name: true,
  publicSlug: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  externalDomain: true,
  externalClubId: true,
  gamificationEnabled: true,
  isActive: true,
} satisfies Prisma.StoreSelect;

const bonusLedgerAuditSelect = {
  id: true,
  guestId: true,
  profileId: true,
  rewardId: true,
  storeId: true,
  status: true,
  entryType: true,
  source: true,
  amount: true,
  balanceBefore: true,
  balanceAfter: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  attempts: true,
  nextAttemptAt: true,
  processedAt: true,
  confirmedAt: true,
  failedAt: true,
  canceledAt: true,
  errorCode: true,
  errorMessage: true,
  reason: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  reward: {
    select: {
      id: true,
      status: true,
      rewardType: true,
      rewardLabel: true,
      rewardCode: true,
      qualifiedAt: true,
      paidAt: true,
    },
  },
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  store: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
  processedByUser: { select: creatorSelect },
} satisfies Prisma.GuestBonusLedgerEntrySelect;

const bonusLedgerAuditSnapshotSelect = {
  guestId: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  snapshotDate: true,
  bonusBalance: true,
  sourcePayloadHash: true,
} satisfies Prisma.GuestBonusBalanceSnapshotSelect;

const bonusBalanceCurrentReconciliationSelect = {
  id: true,
  guestId: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  bonusBalance: true,
  snapshotDate: true,
  source: true,
  lastSyncedAt: true,
  updatedAt: true,
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
} satisfies Prisma.GuestBonusBalanceCurrentSelect;

const lootBoxInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameLootBoxInclude;

const missionInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameMissionInclude;

const seasonInclude = {
  audience: { select: audienceSelect },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameSeasonInclude;

const promoCardInclude = {
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGamePromoCardInclude;

const visualDraftInclude = {
  store: { select: pilotStoreSelect },
  createdByUser: { select: creatorSelect },
  updatedByUser: { select: creatorSelect },
  publishedByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameVisualDraftInclude;
const rewardInclude = {
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
      xp: true,
      level: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  lootBox: {
    select: {
      id: true,
      name: true,
      status: true,
      triggerKind: true,
      segment: true,
      sessionType: true,
      periodRules: true,
      limits: true,
      manualApprovalRequired: true,
      note: true,
    },
  },
  mission: {
    select: {
      id: true,
      name: true,
      status: true,
      missionType: true,
      triggerKind: true,
      xpReward: true,
      progressTarget: true,
      progressUnit: true,
      conditions: true,
      periodFrom: true,
      periodTo: true,
      perGuestLimit: true,
      totalRewardLimit: true,
      manualApprovalRequired: true,
      note: true,
    },
  },
  season: {
    select: {
      id: true,
      name: true,
      status: true,
      levels: true,
      seasonType: true,
      periodFrom: true,
      periodTo: true,
      manualApprovalRequired: true,
      note: true,
    },
  },
  store: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
  approvedByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameRewardInclude;

const deliveryEventInclude = {
  actorUser: { select: creatorSelect },
} satisfies Prisma.GuestGameDeliveryEventInclude;

const deliveryInclude = {
  reward: { include: rewardInclude },
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
      telegramIdentity: true,
      maxIdentity: true,
      xp: true,
      level: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
    },
  },
  store: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
  events: {
    include: deliveryEventInclude,
    orderBy: { createdAt: 'desc' as const },
    take: 6,
  },
} satisfies Prisma.GuestGameDeliveryInclude;

const eventInclude = {
  profile: {
    select: {
      id: true,
      displayName: true,
      contactMasked: true,
      xp: true,
      level: true,
    },
  },
  guest: {
    select: {
      id: true,
      externalDomain: true,
      externalGuestId: true,
      fullNameMasked: true,
      phoneMasked: true,
    },
  },
  lootBox: { select: { id: true, name: true } },
  mission: { select: { id: true, name: true } },
  season: { select: { id: true, name: true } },
  createdByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameEventInclude;

const guestLogTypeMappingInclude = {
  createdByUser: { select: creatorSelect },
  updatedByUser: { select: creatorSelect },
} satisfies Prisma.GuestGameLogTypeMappingInclude;

const snapshotGuestSelect = {
  id: true,
  externalDomain: true,
  externalGuestId: true,
  fullNameMasked: true,
  phoneMasked: true,
  emailMasked: true,
} satisfies Prisma.GuestSelect;

const snapshotStoreSelect = {
  id: true,
  name: true,
} satisfies Prisma.StoreSelect;

const snapshotGameProfileSelect = {
  id: true,
  displayName: true,
  contactMasked: true,
  guest: { select: snapshotGuestSelect },
} satisfies Prisma.GuestGameProfileSelect;

const snapshotReferralEventSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalId: true,
  occurredAt: true,
  payload: true,
} satisfies Prisma.GuestGameEventSelect;

const snapshotProductSelect = {
  id: true,
  article: true,
  name: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

const snapshotSessionSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalSessionId: true,
  externalGuestId: true,
  startedAt: true,
  stoppedAt: true,
  durationMinutes: true,
  normalStop: true,
  packet: true,
  guest: { select: snapshotGuestSelect },
  store: { select: snapshotStoreSelect },
} satisfies Prisma.GuestSessionSelect;

const snapshotLogSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  sourceKey: true,
  externalGuestId: true,
  type: true,
  happenedAt: true,
  guest: { select: snapshotGuestSelect },
} satisfies Prisma.GuestLogSelect;

const snapshotTransactionSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalTransactionId: true,
  externalGuestId: true,
  type: true,
  happenedAt: true,
  amount: true,
  balance: true,
  bonusBalance: true,
  guest: { select: snapshotGuestSelect },
  store: { select: snapshotStoreSelect },
} satisfies Prisma.GuestTransactionSelect;

const snapshotOperationLogSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  sourceKey: true,
  type: true,
  operationName: true,
  operationSource: true,
  operationForm: true,
  happenedAt: true,
  amount: true,
  store: { select: snapshotStoreSelect },
} satisfies Prisma.GuestOperationLogSelect;

const snapshotBalanceSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  snapshotDate: true,
  balance: true,
  guest: { select: snapshotGuestSelect },
} satisfies Prisma.GuestBalanceSnapshotSelect;

const snapshotBonusBalanceSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  snapshotDate: true,
  bonusBalance: true,
  guest: { select: snapshotGuestSelect },
} satisfies Prisma.GuestBonusBalanceSnapshotSelect;

const snapshotLoyaltyGuestSelect = {
  id: true,
  externalProvider: true,
  externalDomain: true,
  externalGuestId: true,
  externalGuestTypeId: true,
  fullNameMasked: true,
  phoneMasked: true,
  emailMasked: true,
  currentCountHours: true,
  insertedAt: true,
  lastActivityAt: true,
  updatedAt: true,
} satisfies Prisma.GuestSelect;

const snapshotGuestGroupSelect = {
  externalProvider: true,
  externalDomain: true,
  externalGroupId: true,
  name: true,
  percent: true,
  countHoursFrom: true,
  countHoursTo: true,
  bonusBirthday: true,
  lastSyncedAt: true,
} satisfies Prisma.GuestGroupSelect;

const snapshotProductExpenseSelect = {
  id: true,
  productId: true,
  externalProvider: true,
  externalDomain: true,
  externalSaleId: true,
  externalProductId: true,
  externalGuestId: true,
  saleDate: true,
  quantity: true,
  revenue: true,
  cost: true,
  productNameAtSale: true,
  storeNameAtSale: true,
  guest: { select: snapshotGuestSelect },
  store: { select: snapshotStoreSelect },
  product: { select: snapshotProductSelect },
} satisfies Prisma.SalesFactSelect;

type ProfileRow = Prisma.GuestGameProfileGetPayload<{
  include: typeof gameProfileInclude;
}>;
type LootBoxRow = Prisma.GuestGameLootBoxGetPayload<{
  include: typeof lootBoxInclude;
}>;
type MissionRow = Prisma.GuestGameMissionGetPayload<{
  include: typeof missionInclude;
}>;
type SeasonRow = Prisma.GuestGameSeasonGetPayload<{
  include: typeof seasonInclude;
}>;
type PromoCardRow = Prisma.GuestGamePromoCardGetPayload<{
  include: typeof promoCardInclude;
}>;
type VisualDraftRow = Prisma.GuestGameVisualDraftGetPayload<{
  include: typeof visualDraftInclude;
}>;
type RewardRow = Prisma.GuestGameRewardGetPayload<{
  include: typeof rewardInclude;
}>;
type DeliveryRow = Prisma.GuestGameDeliveryGetPayload<{
  include: typeof deliveryInclude;
}>;
type DeliveryEventRow = Prisma.GuestGameDeliveryEventGetPayload<{
  include: typeof deliveryEventInclude;
}>;
type EventRow = Prisma.GuestGameEventGetPayload<{
  include: typeof eventInclude;
}>;
type GuestLogTypeMappingRow = Prisma.GuestGameLogTypeMappingGetPayload<{
  include: typeof guestLogTypeMappingInclude;
}>;
type SnapshotGuestRow = Prisma.GuestGetPayload<{
  select: typeof snapshotGuestSelect;
}>;
type SnapshotGameProfileRow = Prisma.GuestGameProfileGetPayload<{
  select: typeof snapshotGameProfileSelect;
}>;
type SnapshotReferralEventRow = Prisma.GuestGameEventGetPayload<{
  select: typeof snapshotReferralEventSelect;
}>;
type SnapshotSessionRow = Prisma.GuestSessionGetPayload<{
  select: typeof snapshotSessionSelect;
}>;
type SnapshotLogRow = Prisma.GuestLogGetPayload<{
  select: typeof snapshotLogSelect;
}>;
type SnapshotTransactionRow = Prisma.GuestTransactionGetPayload<{
  select: typeof snapshotTransactionSelect;
}>;
type SnapshotOperationLogRow = Prisma.GuestOperationLogGetPayload<{
  select: typeof snapshotOperationLogSelect;
}>;
type SnapshotBalanceRow = Prisma.GuestBalanceSnapshotGetPayload<{
  select: typeof snapshotBalanceSelect;
}>;
type SnapshotBonusBalanceRow = Prisma.GuestBonusBalanceSnapshotGetPayload<{
  select: typeof snapshotBonusBalanceSelect;
}>;
type SnapshotLoyaltyGuestRow = Prisma.GuestGetPayload<{
  select: typeof snapshotLoyaltyGuestSelect;
}>;
type SnapshotGuestGroupRow = Prisma.GuestGroupGetPayload<{
  select: typeof snapshotGuestGroupSelect;
}>;
type SnapshotProductExpenseRow = Prisma.SalesFactGetPayload<{
  select: typeof snapshotProductExpenseSelect;
}>;
type PilotStoreRow = Prisma.StoreGetPayload<{
  select: typeof pilotStoreSelect;
}>;
type BonusLedgerAuditRow = Prisma.GuestBonusLedgerEntryGetPayload<{
  select: typeof bonusLedgerAuditSelect;
}>;
type BonusLedgerAuditSnapshotRow = Prisma.GuestBonusBalanceSnapshotGetPayload<{
  select: typeof bonusLedgerAuditSnapshotSelect;
}>;
type BonusBalanceCurrentReconciliationRow =
  Prisma.GuestBonusBalanceCurrentGetPayload<{
    select: typeof bonusBalanceCurrentReconciliationSelect;
  }>;
type SupplementalActivityFactRow = Prisma.GuestActivityFactGetPayload<
  Record<string, never>
>;

export type GuestGameUser = {
  id: string;
  displayName: string;
  email: string;
};

export type GuestGameAudience = {
  id: string;
  name: string;
  description: string | null;
  guestsCount: number;
};

export type GuestGameProfile = {
  id: string;
  displayName: string;
  contactMasked: string | null;
  phoneHash: string | null;
  telegramIdentity: string | null;
  maxIdentity: string | null;
  xp: number;
  level: number;
  status: ProfileStatus;
  isStaffTest: boolean;
  staffTestReason: string | null;
  staffTestMatchedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    externalDomain: string | null;
    externalGuestId: string;
    displayName: string;
    contact: string;
  } | null;
  lead: {
    id: string;
    displayName: string;
    contact: string;
    matchedGuestId: string | null;
  } | null;
  communication: {
    phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
    phoneConsentSource: string | null;
    phoneConsentAt: string | null;
    unsubscribedAt: string | null;
    telegramReady: boolean;
    maxReady: boolean;
    botReady: boolean;
  };
  createdBy: GuestGameUser | null;
};

export type GuestGameRuleBase = {
  id: string;
  name: string;
  status: StatusValue;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string | null;
  storeIds: string[];
  budgetAmount: number | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameLootBoxUsageKind = (typeof lootBoxUsageKindValues)[number];

export type GuestGameLootBox = GuestGameRuleBase & {
  usageKind: GuestGameLootBoxUsageKind;
  triggerKind: string;
  segment: string | null;
  sessionType: string | null;
  periodRules: Prisma.JsonValue | null;
  limits: Prisma.JsonValue | null;
  probabilityRules: Prisma.JsonValue;
  antiFraudRules: Prisma.JsonValue | null;
};

export type GuestGameMission = GuestGameRuleBase & {
  definitionVersion: number;
  evaluationPolicy?: string;
  missionType: string;
  triggerKind: string;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
  conditions: Prisma.JsonValue;
  periodFrom: string | null;
  periodTo: string | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  antiFraudRules: Prisma.JsonValue | null;
};

export type GuestGameMissionEvaluationPolicyDto = {
  evaluationPolicy?: string | null;
};

export type GuestGameSeason = {
  id: string;
  name: string;
  status: StatusValue;
  seasonType: string;
  periodFrom: string | null;
  periodTo: string | null;
  xpRules: Prisma.JsonValue;
  levels: Prisma.JsonValue;
  freeRewards: Prisma.JsonValue | null;
  premiumRewards: Prisma.JsonValue | null;
  premiumEnabled: boolean;
  premiumUpgradeMode: string | null;
  storeIds: string[];
  budgetAmount: number | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameRuleDeleteResult = {
  deleted: true;
  detachedEvents: number;
  detachedRewards: number;
  detachedVisualEditorItems?: number;
};

export type GuestGameRuleDeleteOptions = {
  detachVisualEditor?: boolean | string | null;
  deleteActiveRule?: boolean | string | null;
};

type VisualEditorUsageKind = 'lootBox' | 'mission' | 'season' | 'promoCard';

type RuleDeleteActivityUsage = {
  source: 'visualEditor' | 'advanced';
  draftId?: string;
  storeId: string | null;
  storeName: string;
  status: string;
  publishedAt?: string | null;
  updatedAt?: string;
};

type VisualEditorRuleUsage = {
  draftId: string;
  storeId: string | null;
  storeName: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
};

export type GuestGamePromoCard = {
  id: string;
  title: string;
  label: string | null;
  description: string | null;
  tag: string | null;
  status: StatusValue;
  targetAnchor: string | null;
  priority: number;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
  createdBy: GuestGameUser | null;
};

export type GuestGamePromoCardDto = {
  title?: string;
  label?: string | null;
  description?: string | null;
  tag?: string | null;
  status?: string;
  targetAnchor?: string | null;
  priority?: number | string | null;
  storeIds?: string[];
  periodFrom?: string | null;
  periodTo?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type GuestGamePromoCardUpdateDto = Partial<GuestGamePromoCardDto>;

export type GuestGameVisualEditorRewardMode = 'XP' | 'BONUS' | '';

export type GuestGameVisualEditorLootBoxPrize = {
  id: string;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string;
  chancePercent: number;
};

export type GuestGameVisualEditorBattlePass = {
  id: string | null;
  enabled: boolean;
  title: string;
  status: StatusValue;
  levelCount: number;
  xpPerLevel: number;
  mainPrize: string | null;
  levelRewards: Array<{ level: number; reward: string }>;
};

export type GuestGameVisualEditorLootBox = {
  id: string | null;
  title: string;
  status: StatusValue;
  triggerKind: string;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string;
  caseRarity: GuestGameRewardRarity;
  prizes: GuestGameVisualEditorLootBoxPrize[];
  condition: string;
  limitPerGuest: number | null;
  periodicLimitEnabled: boolean;
  periodicLimitPeriod: LootBoxPeriodicLimitPeriod;
  timeWindowMode: string;
  weekdayMode: string;
  weekdays: number[];
  hourFrom: string;
  hourTo: string;
};

export type GuestGameVisualEditorMission = {
  id: string | null;
  title: string;
  status: StatusValue;
  missionType: string;
  triggerKind: string;
  xpReward: number;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string;
  progressTarget: number | null;
  progressUnit: string | null;
  questSteps: Array<{ id: string; title: string; target: number }>;
};

export type GuestGameVisualEditorPromoCard = {
  id: string | null;
  label: string | null;
  title: string;
  description: string | null;
  tag: string | null;
  status: StatusValue;
  targetAnchor: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  metadata: Prisma.JsonValue | null;
};

export type GuestGameVisualEditorCheckIn = {
  enabled: boolean;
  rewardMode: GuestGameVisualEditorRewardMode;
  xp: number | null;
  bonusAmount: number | null;
  rewardLabel: string | null;
};

export type GuestGameVisualEditorPayload = {
  version: 1;
  battlePass: GuestGameVisualEditorBattlePass;
  lootBoxes: GuestGameVisualEditorLootBox[];
  missions: GuestGameVisualEditorMission[];
  promoCards: GuestGameVisualEditorPromoCard[];
  checkIn: GuestGameVisualEditorCheckIn;
};

export type GuestGameVisualEditorStore = {
  id: string;
  name: string;
  publicSlug: string | null;
  city: string | null;
  address: string | null;
  gamificationEnabled: boolean;
};

export type GuestGameVisualDraft = {
  id: string;
  status: string;
  payload: GuestGameVisualEditorPayload;
  note: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: GuestGameVisualEditorStore | null;
  createdBy: GuestGameUser | null;
  updatedBy: GuestGameUser | null;
  publishedBy: GuestGameUser | null;
};

export type GuestGameVisualDraftDto = {
  id?: string | null;
  storeId?: string | null;
  payload?: Prisma.InputJsonValue | null;
  note?: string | null;
};

export type GuestGameVisualEditorPreview = {
  draft: GuestGameVisualDraft;
  summary: GuestPortalGameSummary;
};

export type GuestGameVisualEventSyncStore = {
  storeId: string;
  storeName: string;
  draftId: string | null;
  publishedAt: string | null;
  addedLootBoxes: string[];
  removedLootBoxes: string[];
  addedMissions: string[];
  removedMissions: string[];
};

export type GuestGameVisualEventSyncStatus = {
  dirty: boolean;
  checkedAt: string;
  stores: GuestGameVisualEventSyncStore[];
};

export type GuestGameVisualEventSyncDto = {
  storeIds?: string[];
  publish?: boolean;
};

export type GuestGameVisualEventSyncResult = {
  published: boolean;
  drafts: GuestGameVisualDraft[];
  status: GuestGameVisualEventSyncStatus;
};
export type GuestGameReward = {
  id: string;
  status: RewardStatus;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  activityLabel: string;
  source: RewardSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  originKey: string | null;
  idempotencyKey: string | null;
  guestExternalId: string | null;
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  rewardRarity: GuestGameRewardRarity | null;
  rewardRarityLabel: string | null;
  rewardDropChance: number | null;
  rewardCode: string | null;
  claimPayload: string | null;
  qualifiedAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  note: string | null;
  evidence: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
  profile: Pick<
    GuestGameProfile,
    'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
  > | null;
  guest: GuestGameProfile['guest'];
  lootBox: { id: string; name: string; status: string } | null;
  mission: {
    id: string;
    name: string;
    status: string;
    missionType: string;
    triggerKind: string;
    xpReward: number;
    progressUnit: string | null;
  } | null;
  season: { id: string; name: string; status: string } | null;
  store: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
  approvedBy: GuestGameUser | null;
};

export type GuestGameEvent = {
  id: string;
  eventType: string;
  source: EventSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  originKey: string | null;
  xpDelta: number;
  occurredAt: string;
  payload: Prisma.JsonValue | null;
  note: string | null;
  createdAt: string;
  profile: Pick<
    GuestGameProfile,
    'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
  > | null;
  guest: GuestGameProfile['guest'];
  lootBox: { id: string; name: string } | null;
  mission: { id: string; name: string } | null;
  season: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameTariffSnapshotSource = {
  id: string;
  domain: string;
  status: string;
  rowCount: number;
  startedAt: string;
  finishedAt: string | null;
  payloadKind: string | null;
  fieldKeys: string[];
  summary: string | null;
  errorMessage: string | null;
};

export type GuestGameTariffSnapshotItem = {
  id: string;
  domain: string;
  externalId: string | null;
  name: string | null;
  label: string | null;
  kind: string | null;
  fieldKeys: string[];
  startedAt: string;
};

export type GuestGameTariffSnapshotEndpoint = {
  endpointKey: string;
  endpointPath: string;
  title: string;
  description: string;
  status: GuestGameTariffSnapshotStatus;
  totalSources: number;
  readySources: number;
  failedSources: number;
  rowCount: number;
  latestAt: string | null;
  fieldKeys: string[];
  typedItemsCount: number;
  typedItems: GuestGameTariffSnapshotItem[];
  nextAction: string;
  sources: GuestGameTariffSnapshotSource[];
};

export type GuestGameGuestLogCatalogDomain = {
  domain: string;
  provider: string | null;
  count: number;
  latestAt: string | null;
};

export type GuestGameGuestLogCatalogItem = {
  type: string;
  normalizedType: string;
  count: number;
  latestAt: string | null;
  domains: GuestGameGuestLogCatalogDomain[];
  mapping: GuestGameGuestLogTypeMapping | null;
};

export type GuestGameGuestLogTypeMapping = {
  id: string;
  rawType: string;
  normalizedType: string;
  label: string;
  preset: GuestLogMappingPreset;
  intent: GuestLogMappingIntent;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: GuestGameUser | null;
  updatedBy: GuestGameUser | null;
};

export type GuestGameGuestLogCatalog = {
  items: GuestGameGuestLogCatalogItem[];
  mappings: GuestGameGuestLogTypeMapping[];
  summary: {
    types: number;
    logs: number;
    domains: number;
    latestAt: string | null;
    lastSuccessfulSync: {
      businessDate: string;
      updatedAt: string;
      guestLogs: number;
      sources: number | null;
      failedSources: number | null;
    } | null;
  };
};

export type GuestGameGuestLogTypeMappingDto = {
  rawType?: string | null;
  label?: string | null;
  preset?: string | null;
  intent?: string | null;
  note?: string | null;
};

type GuestLogCatalogDomainAccumulator = {
  domain: string;
  provider: string | null;
  count: number;
  latestAt: Date | null;
};

type GuestLogCatalogItemAccumulator = {
  type: string;
  normalizedType: string;
  count: number;
  latestAt: Date | null;
  domains: Map<string, GuestLogCatalogDomainAccumulator>;
};

export type GuestGamificationSummary = {
  profilesCount: number;
  registeredProfilesCount: number;
  totalXp: number;
  averageLevel: number;
  activeLootBoxes: number;
  activeMissions: number;
  activeSeasons: number;
  pendingRewards: number;
  approvedRewards: number;
  paidRewards: number;
  expiredRewards: number;
  plannedBudget: number;
  pendingRewardAmount: number;
  paidRewardAmount: number;
};

export type GuestGameEconomyScenario = {
  kind: 'LOOT_BOX' | 'MISSION' | 'SEASON' | 'MANUAL';
  id: string;
  name: string;
  status: StatusValue | 'ACTIVE';
  plannedBudget: number | null;
  budgetUsedCost: number;
  pendingCost: number;
  approvedCost: number;
  paidCost: number;
  expiredCost: number;
  canceledCost: number;
  rewardCount: number;
  pendingRewards: number;
  approvedRewards: number;
  paidRewards: number;
  expiredRewards: number;
  canceledRewards: number;
  eventsCount: number;
  uniqueGuests: number;
  xpIssued: number;
  budgetUsagePercent: number | null;
  averageRewardCost: number;
  recommendation: string;
};

export type GuestGameEconomy = {
  summary: {
    plannedBudget: number;
    budgetUsedCost: number;
    pendingCost: number;
    approvedCost: number;
    paidCost: number;
    expiredCost: number;
    canceledCost: number;
    rewardCount: number;
    rewardBacklog: number;
    paidRewards: number;
    eventsCount: number;
    uniqueGuests: number;
    xpIssued: number;
    rulesWithoutBudget: number;
    budgetUsagePercent: number | null;
    averageRewardCost: number;
  };
  scenarios: GuestGameEconomyScenario[];
};

export type GuestGameEffectScenario = {
  kind: 'LOOT_BOX' | 'MISSION' | 'SEASON' | 'MANUAL';
  id: string;
  name: string;
  status: StatusValue | 'ACTIVE';
  eventsCount: number;
  measuredEvents: number;
  reachedGuests: number;
  returnedGuests: number;
  returnRatePercent: number | null;
  postSessions: number;
  postPlayMinutes: number;
  productRevenue: number;
  balanceTopUps: number;
  totalRevenue: number;
  averageRevenuePerReturnedGuest: number;
  recommendation: string;
};

export type GuestGameEffect = {
  windowDays: number;
  summary: {
    eventsCount: number;
    measuredEvents: number;
    reachedGuests: number;
    returnedGuests: number;
    returnRatePercent: number | null;
    postSessions: number;
    postPlayMinutes: number;
    productRevenue: number;
    balanceTopUps: number;
    totalRevenue: number;
    averageRevenuePerReturnedGuest: number;
  };
  scenarios: GuestGameEffectScenario[];
};

export type GuestGameCommunicationQueueStatus =
  | 'READY_FOR_BOT'
  | 'READY_FOR_CASHIER'
  | 'NEEDS_APPROVAL'
  | 'NEEDS_CONSENT'
  | 'NEEDS_CHANNEL'
  | 'UNSUBSCRIBED'
  | 'EXPIRED'
  | 'REDEEMED'
  | 'CANCELED';

export type GuestGameCommunicationQueueItem = {
  id: string;
  rewardId: string;
  profileId: string | null;
  guestLabel: string;
  contactMasked: string | null;
  rewardLabel: string;
  rewardType: string;
  rewardAmount: number;
  walletState: GuestGameReward['walletState'];
  queueStatus: GuestGameCommunicationQueueStatus;
  queueStatusLabel: string;
  channel: 'TELEGRAM' | 'MAX' | 'CASHIER' | 'MANUAL';
  channelLabel: string;
  sourceLabel: string;
  store: { id: string; name: string } | null;
  qualifiedAt: string;
  expiresAt: string | null;
  rewardCodeReady: boolean;
  botDeliveryEnabled: false;
  blockers: string[];
  nextAction: string;
};

export type GuestGameCommunicationQueue = {
  summary: {
    total: number;
    readyForBot: number;
    readyForCashier: number;
    needsApproval: number;
    needsConsent: number;
    needsChannel: number;
    blockedByUnsubscribe: number;
    expired: number;
    redeemed: number;
    canceled: number;
  };
  items: GuestGameCommunicationQueueItem[];
  note: string;
};

export type GuestGameDeliveryStatus = (typeof deliveryStatuses)[number];
export type GuestGameDeliveryChannel = (typeof deliveryChannels)[number];

export type GuestGameDeliveryEvent = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  channel: GuestGameDeliveryChannel | null;
  note: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: string;
  actor: GuestGameUser | null;
};

export type GuestGameDelivery = {
  id: string;
  rewardId: string;
  profileId: string | null;
  guestId: string | null;
  storeId: string | null;
  channel: GuestGameDeliveryChannel;
  channelLabel: string;
  status: GuestGameDeliveryStatus;
  statusLabel: string;
  readinessStatus: GuestGameCommunicationQueueStatus;
  readinessStatusLabel: string;
  recipientMasked: string | null;
  channelIdentityMasked: string | null;
  messageTitle: string;
  messageBody: string;
  blockers: string[];
  metadata: Prisma.JsonValue | null;
  preparedAt: string;
  sentAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  reward: GuestGameReward;
  profile: {
    id: string;
    displayName: string | null;
    contactMasked: string | null;
    telegramIdentity: string | null;
    maxIdentity: string | null;
    xp: number;
    level: number;
  } | null;
  guest: GuestGameProfile['guest'];
  store: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
  events: GuestGameDeliveryEvent[];
};

export type GuestGameDeliveryOutbox = {
  summary: {
    total: number;
    ready: number;
    blocked: number;
    sent: number;
    failed: number;
    canceled: number;
    telegram: number;
    max: number;
    cashier: number;
    manual: number;
  };
  dispatcher: GuestGameDeliveryDispatcherStatus;
  botConsumer: GuestGameBotConsumerStatus;
  items: GuestGameDelivery[];
  note: string;
};

export type GuestGameIntegrationReadinessStatus =
  | 'READY'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'MANUAL_ONLY';

export type GuestGameRunbookLink = {
  label: string;
  path: string;
  href: string;
};

export type GuestGameIntegrationReadinessItem = {
  key:
    | 'PUBLIC_PORTAL'
    | 'OTP'
    | 'OTP_SMS'
    | 'OTP_TELEGRAM'
    | 'OTP_MAX'
    | 'USER_CALL_AUTH'
    | 'INCOMING_CALL_LAST4_AUTH'
    | 'TELEGRAM_LINK'
    | 'TELEGRAM_WEBHOOK'
    | 'TELEGRAM_BOT_MENU'
    | 'TELEGRAM_AUTH_REPLY_SENDER'
    | 'TELEGRAM_MINI_APP'
    | 'TELEGRAM_DELIVERY'
    | 'MAX_DELIVERY'
    | 'BONUS_LEDGER_SCHEDULER'
    | 'LANGAME_WRITE_API';
  title: string;
  status: GuestGameIntegrationReadinessStatus;
  statusLabel: string;
  ready: boolean;
  configured: boolean;
  enabled: boolean;
  requiredEnv: string[];
  details?: Array<{ label: string; value: string }>;
  runbook?: GuestGameRunbookLink | null;
  note: string;
  nextAction: string;
};

export type GuestGameIntegrationReadiness = {
  summary: {
    total: number;
    ready: number;
    partial: number;
    blocked: number;
    manualOnly: number;
  };
  items: GuestGameIntegrationReadinessItem[];
  note: string;
};

export type GuestGamePilotReadinessItem = {
  key:
    | 'CLUB'
    | 'GEOSEARCH'
    | 'PUBLIC_REGISTRATION'
    | 'PUBLIC_GAME_QA'
    | 'OTP'
    | 'GAME_PROFILE'
    | 'LANGAME_MATCH'
    | 'ACTIVE_RULES'
    | 'GUEST_LOGS'
    | 'TEST_EVENT'
    | 'REWARD_QUEUE'
    | 'BONUS_LEDGER'
    | 'BALANCE_RECONCILIATION';
  title: string;
  status: GuestGameIntegrationReadinessStatus;
  statusLabel: string;
  ready: boolean;
  metric: string;
  note: string;
  nextAction: string;
  actionHref?: string | null;
  actionLabel?: string | null;
};

export type GuestGamePilotLedgerPreflightStatus =
  | 'NO_STORE'
  | 'EMPTY'
  | 'READY'
  | 'MULTIPLE'
  | 'PROCESSING'
  | 'WAITING_RETRY';

export type GuestGamePilotLedgerPreflightItem = {
  id: string;
  status: string;
  statusLabel: string;
  entryType: string;
  source: string;
  amount: number;
  attempts: number;
  retryReady: boolean;
  nextAttemptAt: string | null;
  createdAt: string;
  guest: {
    id: string | null;
    displayName: string;
    contact: string | null;
  };
  reward: {
    id: string;
    status: string;
    rewardType: string;
    rewardLabel: string;
  } | null;
  store: { id: string; name: string } | null;
  nextAction: string;
};

export type GuestGamePilotLedgerPreflight = {
  status: GuestGamePilotLedgerPreflightStatus;
  statusLabel: string;
  ready: boolean;
  scopedStoreId: string | null;
  scopedStoreName: string | null;
  readyCount: number;
  pendingCount: number;
  retryReadyCount: number;
  staleProcessingCount: number;
  processingCount: number;
  failedWaitingRetryCount: number;
  previewItems: GuestGamePilotLedgerPreflightItem[];
  metric: string;
  note: string;
  nextAction: string;
};

export type GuestGamePilotFirstBonusReconciliationStatus =
  | 'NO_STORE'
  | 'WAITING_LIVE'
  | 'WAITING_SYNC'
  | 'MATCHED'
  | 'MISMATCH';

export type GuestGamePilotFirstBonusReconciliation = {
  status: GuestGamePilotFirstBonusReconciliationStatus;
  statusLabel: string;
  ready: boolean;
  scopedStoreId: string | null;
  scopedStoreName: string | null;
  ledgerEntry: {
    id: string;
    status: string;
    statusLabel: string;
    amount: number;
    balanceAfter: number | null;
    confirmedAt: string | null;
    guest: {
      id: string | null;
      displayName: string;
      contact: string | null;
    };
    store: { id: string; name: string } | null;
    reconciliation: GuestGameBonusLedgerAuditItem['reconciliation'];
  } | null;
  metric: string;
  note: string;
  nextAction: string;
};

export type GuestGamePilotRunbookStage =
  | 'BLOCKED'
  | 'DRY_RUN'
  | 'CANARY'
  | 'LIVE_WRITE'
  | 'RECONCILIATION'
  | 'READY';

export type GuestGamePilotRunbookActionKey =
  | 'OPEN_DRY_RUN'
  | 'QUEUE_BONUS_LEDGER'
  | 'DRY_RUN_BONUS_LEDGER'
  | 'DISPATCH_BONUS_LEDGER'
  | 'RECONCILE_BALANCE';

export type GuestGamePilotRunbookAction = {
  key: GuestGamePilotRunbookActionKey;
  label: string;
  enabled: boolean;
  tone: 'PRIMARY' | 'SECONDARY';
  disabledReason: string | null;
};

export type GuestGamePilotRunbook = {
  stage: GuestGamePilotRunbookStage;
  stageLabel: string;
  canRunDryRun: boolean;
  canRunCanary: boolean;
  canRunLive: boolean;
  canReconcile: boolean;
  ledgerPreflight: GuestGamePilotLedgerPreflight;
  firstBonusReconciliation: GuestGamePilotFirstBonusReconciliation;
  actions: GuestGamePilotRunbookAction[];
  blockers: string[];
  safeguards: string[];
  nextAction: string;
  note: string;
};

export type GuestGamePilotReadiness = {
  targetStore: {
    id: string;
    name: string;
    publicSlug: string | null;
    city: string | null;
    address: string | null;
    externalDomain: string | null;
    externalClubId: string | null;
    gamificationEnabled: boolean;
    guestPortalPath: string;
    playPath: string;
  } | null;
  summary: {
    total: number;
    ready: number;
    partial: number;
    blocked: number;
    manualOnly: number;
    readinessPercent: number;
  };
  items: GuestGamePilotReadinessItem[];
  runbook: GuestGamePilotRunbook;
  note: string;
};

export type GuestGameBonusLedgerReconciliationState =
  | 'NOT_READY'
  | 'WAITING_SYNC'
  | 'MATCHED'
  | 'MISMATCH'
  | 'NOT_APPLICABLE';

export type GuestGameBonusLedgerAuditItem = {
  id: string;
  status: string;
  statusLabel: string;
  entryType: string;
  source: string;
  amount: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  externalProvider: string | null;
  externalDomain: string | null;
  externalGuestId: string | null;
  phoneMasked: string | null;
  attempts: number;
  retryReady: boolean;
  nextAttemptAt: string | null;
  processedAt: string | null;
  confirmedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  reason: string | null;
  guest: {
    id: string | null;
    displayName: string;
    contact: string | null;
  };
  reward: {
    id: string;
    status: string;
    rewardType: string;
    rewardLabel: string;
    rewardCode: string | null;
  } | null;
  store: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
  processedBy: GuestGameUser | null;
  reconciliation: {
    state: GuestGameBonusLedgerReconciliationState;
    stateLabel: string;
    latestSnapshotAt: string | null;
    latestSnapshotBalance: number | null;
    expectedBalance: number | null;
    diff: number | null;
    note: string;
  };
  nextAction: string;
};

export type GuestGameBonusLedgerAudit = {
  summary: {
    total: number;
    pending: number;
    processing: number;
    confirmed: number;
    failed: number;
    canceled: number;
    retryReady: number;
    reconciliationPending: number;
    reconciliationMismatch: number;
    amountPending: number;
    amountConfirmed: number;
    amountFailed: number;
    latestConfirmedAt: string | null;
  };
  items: GuestGameBonusLedgerAuditItem[];
  note: string;
};

export type GuestGameBonusBalanceCurrentReconciliationState =
  | 'MATCHED'
  | 'MISMATCH'
  | 'WAITING_SYNC'
  | 'NO_SNAPSHOT';

export type GuestGameBonusBalanceCurrentReconciliationItem = {
  id: string;
  source: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalGuestId: string;
  currentBalance: number;
  currentSnapshotAt: string;
  lastSyncedAt: string | null;
  updatedAt: string;
  latestSnapshotAt: string | null;
  latestSnapshotBalance: number | null;
  diff: number | null;
  state: GuestGameBonusBalanceCurrentReconciliationState;
  stateLabel: string;
  note: string;
  guest: {
    id: string | null;
    displayName: string;
    contact: string | null;
  };
};

export type GuestGameBonusBalanceCurrentReconciliation = {
  summary: {
    totalCurrent: number;
    matched: number;
    mismatched: number;
    waitingSync: number;
    noSnapshot: number;
    ledgerBacked: number;
    snapshotBacked: number;
    amountCurrent: number;
    amountSnapshot: number;
    diffTotal: number;
    latestCurrentAt: string | null;
    latestSnapshotAt: string | null;
  };
  items: GuestGameBonusBalanceCurrentReconciliationItem[];
  note: string;
};

export type GuestGamificationWorkspace = {
  summary: GuestGamificationSummary;
  economy: GuestGameEconomy;
  effect: GuestGameEffect;
  integrationReadiness: GuestGameIntegrationReadiness;
  pilotReadiness: GuestGamePilotReadiness;
  bonusLedgerAudit: GuestGameBonusLedgerAudit;
  bonusBalanceCurrentReconciliation: GuestGameBonusBalanceCurrentReconciliation;
  communicationQueue: GuestGameCommunicationQueue;
  deliveryOutbox: GuestGameDeliveryOutbox;
  profiles: GuestGameProfile[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  promoCards: GuestGamePromoCard[];
  rewards: GuestGameReward[];
  events: GuestGameEvent[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
};

export type GuestGameProfileDto = {
  guestId?: string | null;
  leadId?: string | null;
  displayName?: string | null;
  contactMasked?: string | null;
  phoneHash?: string | null;
  telegramIdentity?: string | null;
  maxIdentity?: string | null;
  xp?: number | string | null;
  level?: number | string | null;
  status?: string | null;
  lastActivityAt?: string | null;
};

export type GuestGameProfileUpdateDto = Partial<GuestGameProfileDto>;

export type GuestGameLootBoxDto = {
  name?: string;
  status?: string;
  usageKind?: string | null;
  triggerKind?: string;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string | null;
  audienceId?: string | null;
  segment?: string | null;
  sessionType?: string | null;
  storeIds?: string[];
  periodRules?: Prisma.InputJsonValue | null;
  limits?: Prisma.InputJsonValue | null;
  probabilityRules?: Prisma.InputJsonValue | null;
  budgetAmount?: number | string | null;
  antiFraudRules?: Prisma.InputJsonValue | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameLootBoxUpdateDto = Partial<GuestGameLootBoxDto>;

export type GuestGameMissionDto = {
  name?: string;
  status?: string;
  missionType?: string;
  triggerKind?: string;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string | null;
  xpReward?: number | string | null;
  progressTarget?: number | string | null;
  progressUnit?: string | null;
  audienceId?: string | null;
  conditions?: Prisma.InputJsonValue | null;
  storeIds?: string[];
  periodFrom?: string | null;
  periodTo?: string | null;
  budgetAmount?: number | string | null;
  perGuestLimit?: number | string | null;
  totalRewardLimit?: number | string | null;
  antiFraudRules?: Prisma.InputJsonValue | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameMissionUpdateDto = Partial<GuestGameMissionDto>;

export type GuestGameMissionWizardSaveResult = {
  mission: GuestGameMission;
  readiness: GuestGameMissionWizardReadiness;
};

export type GuestGameMissionWizardLoadResult =
  GuestGameMissionWizardSaveResult & {
    definition: GuestGameMissionWizardDto;
  };

export type GuestGameMissionWizardMigrationResult = {
  migrated: GuestGameMission[];
  skipped: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
};

export type GuestGameMissionProductGroupCatalog = {
  source: 'LANGAME' | 'LEETPLUS';
  status: 'READY' | 'PARTIAL' | 'EMPTY';
  latestSyncedAt: string | null;
  stores: Array<{
    id: string;
    name: string;
    externalDomain: string | null;
    ready: boolean;
  }>;
  warnings: string[];
  groups: Array<{
    id: string;
    source: 'LANGAME' | 'LEETPLUS';
    name: string;
    categoryIds: string[];
    productCount: number;
    storeCount: number;
    storeNames: string[];
    refs: Array<{
      externalDomain: string;
      externalGroupId: string;
      productCount: number;
      storeIds: string[];
    }>;
  }>;
};

export type GuestGameSeasonDto = {
  name?: string;
  status?: string;
  seasonType?: string;
  audienceId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  xpRules?: Prisma.InputJsonValue | null;
  levels?: Prisma.InputJsonValue | null;
  freeRewards?: Prisma.InputJsonValue | null;
  premiumRewards?: Prisma.InputJsonValue | null;
  premiumEnabled?: boolean;
  premiumUpgradeMode?: string | null;
  storeIds?: string[];
  budgetAmount?: number | string | null;
  manualApprovalRequired?: boolean;
  note?: string | null;
};

export type GuestGameSeasonUpdateDto = Partial<GuestGameSeasonDto>;

export type GuestGameBattlePassStepEvaluationPolicyDto = {
  evaluationPolicy: string;
  expectedUpdatedAt: string;
};

export type GuestGameRewardDto = {
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  missionId?: string | null;
  seasonId?: string | null;
  storeId?: string | null;
  status?: string | null;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  guestExternalId?: string | null;
  rewardType?: string;
  rewardAmount?: number | string | null;
  rewardLabel?: string;
  rewardRarity?: string | null;
  rewardRarityLabel?: string | null;
  rewardDropChance?: number | string | null;
  rewardCode?: string | null;
  qualifiedAt?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  evidence?: Prisma.InputJsonValue | null;
};

export type GuestGameRewardUpdateDto = Partial<GuestGameRewardDto>;

export type GuestGameRewardRedeemDto = {
  claim?: string | null;
  claimPayload?: string | null;
  rewardCode?: string | null;
  storeId?: string | null;
  note?: string | null;
};

export type GuestGameDeliveryPrepareDto = {
  rewardIds?: string[] | null;
  includeBlocked?: boolean | string | null;
  limit?: number | string | null;
};

export type GuestGameDeliveryUpdateDto = {
  status?: string | null;
  note?: string | null;
};

export type GuestGameDeliveryPrepareResult = {
  created: number;
  updated: number;
  skipped: number;
  deliveries: GuestGameDelivery[];
};

export type GuestGameDeliveryProviderStatus = {
  channel: 'TELEGRAM' | 'MAX';
  channelLabel: string;
  pendingReady: number;
  enabledByEnv: boolean;
  configured: boolean;
  canAttemptSend: boolean;
  dryRunOnly: boolean;
  requiredEnv: string[];
  note: string;
};

export type GuestGameDeliveryDispatcherStatus = {
  mode: 'DISABLED' | 'DRY_RUN' | 'READY';
  modeLabel: string;
  realSendEnabled: boolean;
  providers: GuestGameDeliveryProviderStatus[];
  note: string;
};

export type GuestGameBotConsumerPreviewItem = {
  deliveryId: string;
  rewardId: string;
  channel: 'TELEGRAM' | 'MAX';
  channelLabel: string;
  recipientMasked: string | null;
  channelIdentityMasked: string | null;
  rewardLabel: string;
  rewardType: string;
  rewardAmount: number;
  storeName: string | null;
  profileLabel: string | null;
  preparedAt: string;
  expiresAt: string | null;
};

export type GuestGameBotConsumerStatus = {
  mode: 'BLOCKED' | 'DRY_RUN' | 'READY';
  modeLabel: string;
  dryRun: boolean;
  configured: boolean;
  limit: number;
  canaryLimit: boolean;
  canaryRequired: boolean;
  channels: Array<'TELEGRAM' | 'MAX'>;
  requiredEnv: string[];
  runbook: GuestGameRunbookLink;
  pendingReady: number;
  pendingTelegram: number;
  pendingMax: number;
  sentAck: number;
  failedAck: number;
  blockedAck: number;
  lastAckAt: string | null;
  preview: GuestGameBotConsumerPreviewItem[];
  nextAction: string;
  note: string;
};

export type GuestGameDeliveryDispatchDto = {
  channels?: string[] | string | null;
  dryRun?: boolean | string | null;
  limit?: number | string | null;
};

export type GuestGameDeliveryDispatchItem = {
  deliveryId: string;
  rewardId: string;
  channel: GuestGameDeliveryChannel;
  status: 'DRY_RUN' | 'SENT' | 'FAILED' | 'SKIPPED' | 'BLOCKED';
  note: string;
};

export type GuestGameDeliveryDispatchResult = {
  dryRun: boolean;
  realSendEnabled: boolean;
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  blocked: number;
  items: GuestGameDeliveryDispatchItem[];
  deliveries: GuestGameDelivery[];
  dispatcher: GuestGameDeliveryDispatcherStatus;
  note: string;
};

export type GuestGameScheduledDeliveryDispatchDto =
  GuestGameDeliveryDispatchDto & {
    tenantId?: string | null;
    tenantSlug?: string | null;
  };

export type GuestGameScheduledDeliveryTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  result: GuestGameDeliveryDispatchResult | null;
};

export type GuestGameScheduledDeliveryDispatchResult = {
  dryRun: boolean;
  realSendEnabled: boolean;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
  blocked: number;
  tenants: GuestGameScheduledDeliveryTenantResult[];
  note: string;
};

export type GuestGameBotDeliveryPullDto = {
  tenantId?: string | null;
  tenantSlug?: string | null;
  channels?: string[] | string | null;
  limit?: number | string | null;
};

export type GuestGameBotDeliveryItem = {
  tenantId: string;
  tenantSlug: string;
  deliveryId: string;
  rewardId: string;
  channel: 'TELEGRAM' | 'MAX';
  channelLabel: string;
  recipient: {
    telegramChatId: string | null;
    maxIdentity: string | null;
    identityMasked: string | null;
    recipientMasked: string | null;
  };
  message: {
    title: string;
    body: string;
  };
  reward: {
    label: string;
    amount: number;
    type: string;
    code: string | null;
    expiresAt: string | null;
  };
  store: { id: string; name: string } | null;
  preparedAt: string;
};

export type GuestGameBotDeliveryPullResult = {
  checked: number;
  ready: number;
  skipped: number;
  items: GuestGameBotDeliveryItem[];
  note: string;
};

export type GuestGameBotDeliveryAckStatus = 'SENT' | 'FAILED' | 'BLOCKED';

export type GuestGameBotDeliveryAckDto = {
  tenantId?: string | null;
  tenantSlug?: string | null;
  deliveryId?: string | null;
  status?: string | null;
  note?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  errorCode?: string | null;
  externalEventId?: string | null;
};

export type GuestGameBotDeliveryAckResult = {
  delivery: GuestGameDelivery;
  eventType: string;
  note: string;
  idempotent: boolean;
};

export type GuestGameEventDto = {
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  missionId?: string | null;
  seasonId?: string | null;
  eventType?: string;
  source?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  xpDelta?: number | string | null;
  occurredAt?: string | null;
  payload?: Prisma.InputJsonValue | null;
  note?: string | null;
};

export type GuestGameDryRunDto = {
  traceId?: string | null;
  sourceFactId?: string | null;
  sourceFactKind?: string | null;
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  storeId?: string | null;
  externalDomain?: string | null;
  eventType?: string | null;
  occurredAt?: string | null;
  limitOccurredAt?: string | null;
  sessionType?: string | null;
  sessionPacket?: boolean | string | null;
  sessionMinutes?: number | string | null;
  spendAmount?: number | string | null;
  tariffGroupId?: string | null;
  tariffPeriodId?: string | null;
  tariffTypeId?: string | null;
  guestLogType?: string | null;
  productId?: string | null;
  externalProductId?: string | null;
  externalCategoryKey?: string | null;
  externalCategoryId?: string | null;
  categoryId?: string | null;
  productName?: string | null;
  categoryName?: string | null;
  supplierName?: string | null;
  quantity?: number | string | null;
};

export type GuestGameProcessEventDto = GuestGameDryRunDto & {
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  payload?: Prisma.InputJsonObject | null;
  note?: string | null;
  activeRulesOnly?: boolean | string | null;
  suppressLootBoxRewards?: boolean | string | null;
  suppressLootBoxEntitlements?: boolean | string | null;
};

export type GuestGameSelectedReward = {
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  weight: number;
  chancePercent: number;
  rewardRarity: GuestGameRewardRarity;
  rewardRarityLabel: string;
};

export type GuestGameRewardRarity = 'common' | 'rare' | 'epic' | 'legendary';

type GuestGameLootBoxRewardCandidate = Omit<
  GuestGameSelectedReward,
  'chancePercent' | 'rewardRarity' | 'rewardRarityLabel'
>;

export type GuestGameDryRunRule = {
  id: string;
  kind: 'LOOT_BOX' | 'MISSION' | 'SEASON';
  name: string;
  status: string;
  triggerKind: string | null;
  evaluationPolicy: string;
  manualApprovalRequired: boolean;
  eligible: boolean;
  rewardType: string | null;
  rewardAmount: number | null;
  rewardLabel: string | null;
  selectedRewardLabel: string | null;
  selectedReward: GuestGameSelectedReward | null;
  xpDelta: number;
  budgetAmount: number | null;
  progress: GuestGameProgressResult | null;
  battlePassLevel?: number | null;
  battlePassStep?: number | null;
  battlePassStepTitle?: string | null;
  battlePassRewardTrack?: 'FREE' | 'PREMIUM' | null;
  rewardLootBoxId?: string | null;
  periodicLimitPeriod?: LootBoxPeriodicLimitPeriod | null;
  missionDenySameDayRepeat?: boolean;
  missionPerGuestLimit?: number | null;
  missionTotalRewardLimit?: number | null;
  rewardMaterializationSuppressed?: boolean;
  reasons: string[];
  blockers: string[];
};

export type GuestGameDryRunResult = {
  dryRun: true;
  eventType: string;
  occurredAt: string;
  profile: Pick<
    GuestGameProfile,
    'id' | 'displayName' | 'contactMasked' | 'xp' | 'level' | 'status'
  > | null;
  guest: GuestGameProfile['guest'];
  store: {
    id: string;
    name: string;
    timeZone?: string | null;
    externalDomain?: string | null;
  } | null;
  input: {
    sessionType: string | null;
    sessionPacket: boolean | null;
    sessionMinutes: number;
    spendAmount: number;
    tariffGroupId: string | null;
    tariffPeriodId: string | null;
    tariffTypeId: string | null;
    guestLogType: string | null;
    productId: string | null;
    externalProductId: string | null;
    externalCategoryKey: string | null;
    externalCategoryId: string | null;
    categoryId: string | null;
    productName: string | null;
    categoryName: string | null;
    supplierName: string | null;
    quantity: number | null;
  };
  summary: {
    checkedRules: number;
    eligibleRules: number;
    blockedRules: number;
    estimatedRewardAmount: number;
    projectedXpDelta: number;
  };
  rules: GuestGameDryRunRule[];
  note: string;
};

export type GuestGameLootBoxEntitlementWriteOutcome = {
  ruleId: string;
  status:
    | 'PERSISTED'
    | 'IDEMPOTENT'
    | 'LIMIT_EXHAUSTED'
    | 'RULE_INACTIVE'
    | 'PERSISTENCE_FAILED';
  entitlementId: string | null;
  limitCodes: string[];
};

export type GuestGameRuleDecisionRecordResult = {
  lootBoxEntitlements: GuestGameLootBoxEntitlementWriteOutcome[];
};

export type GuestGameProcessEventResult = {
  processed: true;
  dryRun: GuestGameDryRunResult;
  event: GuestGameEvent;
  rewards: GuestGameReward[];
  summary: {
    profileCreated: boolean;
    appliedXpDelta: number;
    createdRewards: number;
    queuedRewardAmount: number;
    idempotencyKey: string | null;
    idempotent: boolean;
    langameWrite: false;
  };
  note: string;
};

export type GuestGameEffectMaterializeDto = {
  eventId?: string | null;
  rewardId?: string | null;
  limit?: number | string | null;
  claimLeaseMs?: number | string | null;
  maxAttempts?: number | string | null;
};

export type GuestGameEffectMaterializeResult = {
  claimed: number;
  applied: number;
  recovered: number;
  canceled: number;
  failed: number;
  deadLettered: number;
  staleFinalizations: number;
  rewardIds: string[];
};

type ClaimedRewardIntentRow = {
  id: string;
  eventId: string;
  profileId: string | null;
  rewardId: string | null;
  idempotencyKey: string;
  plan: Prisma.JsonValue;
  attempts: number;
  leaseVersion: number;
};

type ClaimedRewardEffectRow = {
  id: string;
  rewardId: string;
  effectKind: string;
  payload: Prisma.JsonValue;
  attempts: number;
  leaseVersion: number;
};

type ProcessRewardIntentMaterialization = {
  dryRun: GuestGameDryRunResult;
  rewards: GuestGameReward[];
  stats: GuestGameEffectMaterializeResult;
};

type GuestGameProcessEventOptions = {
  allowedRuleIds?: Iterable<string>;
  allowedBattlePassSteps?: ReadonlyMap<string, number>;
  evaluationMode?: GuestGameEvaluationMode;
  evaluatorVersion?: string;
  ruleDomainTimeZones?: ReadonlyMap<string, ReadonlyMap<string, string | null>>;
  ruleExternalDomains?: ReadonlyMap<string, readonly string[]>;
  /**
   * Persist/reconcile reward intents and their side effects. Exact ledger
   * canonicalization deliberately disables this: it creates only the
   * physical event and leaves every rule/reward path untouched.
   */
  materializeRewards?: boolean;
  originKey?: string | null;
  suppressLedgerShadow?: boolean;
  replayRewardScope?: {
    ruleKind: 'SEASON';
    ruleId: string;
    battlePassStep: number;
    stepId: string;
    sourceFactId: string;
    sourceFactUpdatedAt: Date;
    seasonUpdatedAt: Date;
    confirmationHash: string;
  };
};

type GuestGameDryRunOptions = {
  ruleDomainTimeZones?: ReadonlyMap<string, ReadonlyMap<string, string | null>>;
  ruleExternalDomains?: ReadonlyMap<string, readonly string[]>;
  rewardScope?: {
    seasonId: string;
    profileId: string;
    guestId: string | null;
  };
};

export type GuestGameCheckInDto = {
  guestId?: string | null;
  storeId?: string | null;
  note?: string | null;
};

export type GuestGameCheckInResult = {
  checkedIn: true;
  checkedAt: string;
  liveSession: {
    externalDomain: string;
    externalSessionId: string;
    externalUuid: string | null;
    startedAt: string | null;
    durationMinutes: number | null;
    sessionType: string;
    sessionPacket: boolean | null;
    store: { id: string; name: string } | null;
  };
  processResult: GuestGameProcessEventResult;
  note: string;
};

export type GuestGameSnapshotFact = {
  id: string;
  source:
    | 'GUEST_SESSION'
    | 'GUEST_LOG'
    | 'GUEST_TRANSACTION'
    | 'GUEST_OPERATION_LOG'
    | 'GUEST_BALANCE'
    | 'GUEST_BONUS_BALANCE'
    | 'GUEST_LOYALTY_GROUP'
    | 'PRODUCT_EXPENSE'
    | 'GUEST_GAME_REFERRAL';
  eventType: string;
  occurredAt: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  profileId?: string | null;
  guest: GuestGameProfile['guest'];
  store: { id: string; name: string } | null;
  sessionType: string | null;
  sessionPacket: boolean | null;
  sessionMinutes: number | null;
  sessionClassificationCorrection?: 'PACKAGE_V1' | null;
  spendAmount: number | null;
  tariffGroupId: string | null;
  tariffPeriodId: string | null;
  tariffTypeId: string | null;
  guestLogType?: string | null;
  productId?: string | null;
  externalProductId?: string | null;
  externalCategoryKey?: string | null;
  externalCategoryId?: string | null;
  categoryId?: string | null;
  productName?: string | null;
  categoryName?: string | null;
  supplierName?: string | null;
  quantity?: number | null;
  label: string;
  details: string | null;
};

export type GuestGameSnapshotFactsResult = {
  facts: GuestGameSnapshotFact[];
  summary: {
    sessions: number;
    logs: number;
    transactions: number;
    operationLogs: number;
    balances: number;
    bonusBalances: number;
    loyaltyGroups: number;
    productExpenses: number;
    referrals: number;
    latestAt: string | null;
  };
};

export type GuestGamePipelineRunDto = {
  limit?: number | string | null;
  source?: string | null;
  dryRunOnly?: boolean | string | null;
};

export type GuestGameScheduledPipelineRunDto = GuestGamePipelineRunDto & {
  tenantId?: string | null;
  tenantSlug?: string | null;
};

export type GuestGamePipelineFactStatus =
  | 'DRY_RUN'
  | 'PROCESSED'
  | 'SKIPPED'
  | 'DUPLICATE'
  | 'ERROR';

export type GuestGamePipelineFactResult = {
  factId: string;
  source: GuestGameSnapshotFact['source'];
  label: string;
  eventType: string;
  occurredAt: string;
  guest: GuestGameProfile['guest'];
  store: { id: string; name: string } | null;
  status: GuestGamePipelineFactStatus;
  reason: string | null;
  dryRun: GuestGameDryRunResult | null;
  process: GuestGameProcessEventResult | null;
};

type CheckInLiveSession = {
  externalDomain: string;
  externalSessionId: string;
  externalGuestId: string | null;
  externalClubId: string | null;
  externalUuid: string | null;
  startedAt: Date | null;
  durationMinutes: number | null;
  sessionType: string;
  sessionPacket: boolean | null;
  sessionBillingResolvedBy:
    | 'tariff_type_group'
    | 'session_marker'
    | 'session_text'
    | 'unknown';
  store: { id: string; name: string; timeZone?: string | null } | null;
  raw: LangameGuestSession;
};

type CheckInResolvedStore = {
  id: string;
  name: string;
  timeZone: string | null;
};

type CheckInExpectedStore = {
  id: string;
  name: string;
  externalDomain: string | null;
  externalClubId: string | null;
  integrationSourceId: string | null;
  timeZone: string | null;
};

type CheckInLookupOptions = {
  timeoutMs?: number;
  expectedStore?: CheckInExpectedStore | null;
};

type LiveSessionStartCacheEntry = {
  expiresAt: number;
  result: GuestGameProcessEventResult | null;
};

type LiveSessionStartProcessOutcome = {
  result: GuestGameProcessEventResult | null;
  cache: boolean;
};

export type GuestGamePipelineRunResult = {
  dryRunOnly: boolean;
  langameWrite: false;
  availableFacts: number;
  checkedFacts: number;
  processedFacts: number;
  skippedFacts: number;
  duplicateFacts: number;
  erroredFacts: number;
  appliedXpDelta: number;
  queuedRewards: number;
  queuedRewardAmount: number;
  facts: GuestGamePipelineFactResult[];
  note: string;
};

export type GuestGameScheduledPipelineTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  result: GuestGamePipelineRunResult | null;
};

export type GuestGameScheduledPipelineRunResult = {
  dryRunOnly: boolean;
  langameWrite: false;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  availableFacts: number;
  checkedFacts: number;
  processedFacts: number;
  skippedFacts: number;
  duplicateFacts: number;
  erroredFacts: number;
  appliedXpDelta: number;
  queuedRewards: number;
  queuedRewardAmount: number;
  tenants: GuestGameScheduledPipelineTenantResult[];
  note: string;
};

export type GuestGameSupplementalPipelineMode = 'OFF' | 'SHADOW' | 'LIVE';

const supplementalReceiptClaimLeaseMs = 2 * 60 * 1000;
const supplementalReceiptMaxAttempts = 3;

export type GuestGameSupplementalPipelineRunDto = {
  mode?: GuestGameSupplementalPipelineMode;
  factTypes?: string[];
  limit?: number | string | null;
  tenantId?: string | null;
  tenantSlug?: string | null;
};

export type GuestGameSupplementalPipelineTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  checkedFacts: number;
  processedFacts: number;
  shadowFacts: number;
  duplicateFacts: number;
  failedFacts: number;
  createdEvents: number;
  createdRewards: number;
};

export type GuestGameSupplementalPipelineRunResult = {
  mode: GuestGameSupplementalPipelineMode;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  checkedFacts: number;
  processedFacts: number;
  shadowFacts: number;
  duplicateFacts: number;
  failedFacts: number;
  createdEvents: number;
  createdRewards: number;
  tenants: GuestGameSupplementalPipelineTenantResult[];
};

const scheduledPipelineActorRoles = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
] as const;

function scheduledPipelineRoleRank(role: UserRole) {
  const index = scheduledPipelineActorRoles.findIndex(
    (value) => value === role,
  );

  return index >= 0 ? index : scheduledPipelineActorRoles.length;
}

function tariffSnapshotStatus({
  totalSources,
  checkedSources,
  readySources,
  failedSources,
  latestTime,
}: {
  totalSources: number;
  checkedSources: number;
  readySources: number;
  failedSources: number;
  latestTime: number;
}): GuestGameTariffSnapshotStatus {
  if (checkedSources === 0) {
    return 'UNPROFILED';
  }

  if (readySources === 0) {
    return 'FAILED';
  }

  if (failedSources > 0 || (totalSources > 0 && readySources < totalSources)) {
    return 'PARTIAL';
  }

  if (latestTime > 0 && Date.now() - latestTime > tariffSnapshotFreshMs) {
    return 'STALE';
  }

  return 'READY';
}

function tariffSnapshotNextAction(status: GuestGameTariffSnapshotStatus) {
  switch (status) {
    case 'READY':
      return 'Источник готов: можно использовать как проверенный тарифный контекст для правил.';
    case 'PARTIAL':
      return 'Часть клубов еще не дала успешный snapshot. Обновите endpoint в /sync перед точным запуском.';
    case 'STALE':
      return 'Snapshot устарел старше суток. Перед запуском правил обновите тарифные endpoints в /sync.';
    case 'FAILED':
      return 'Последний snapshot неуспешен. Сначала разберите ошибку endpoint в /sync.';
    case 'UNPROFILED':
    default:
      return 'Snapshot еще не создан. Сначала профилируйте и сохраните endpoint в /sync.';
  }
}

function jsonStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function snapshotSummary(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const summary = (value as Record<string, unknown>).summary;

  return typeof summary === 'string' ? summary : null;
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteJsonNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].slice(0, 16);
}

function allUniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function snapshotFactKey(fact: GuestGameSnapshotFact) {
  return [
    fact.source,
    fact.id,
    fact.eventType,
    fact.externalProvider ?? '',
    fact.externalDomain ?? '',
    fact.externalId ?? '',
  ].join('\u0000');
}

function uniqueSnapshotFacts(facts: GuestGameSnapshotFact[]) {
  return [
    ...new Map(facts.map((fact) => [snapshotFactKey(fact), fact])).values(),
  ];
}

function interleaveSnapshotFacts(groups: GuestGameSnapshotFact[][]) {
  const result: GuestGameSnapshotFact[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const fact = group[index];
      if (fact) result.push(fact);
    }
  }

  return result;
}

function maxDate(left: Date | null, right: Date | null) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return right.getTime() > left.getTime() ? right : left;
}

const pilotRunbookPrerequisiteKeys = new Set<
  GuestGamePilotReadinessItem['key']
>([
  'CLUB',
  'GEOSEARCH',
  'PUBLIC_REGISTRATION',
  'PUBLIC_GAME_QA',
  'GAME_PROFILE',
  'LANGAME_MATCH',
  'ACTIVE_RULES',
  'GUEST_LOGS',
]);

function buildPilotRunbookActions({
  stage,
  canRunDryRun,
  canRunCanary,
  canRunLive,
  canReconcile,
  bonusRewards,
  ledgerPreflight,
}: {
  stage: GuestGamePilotRunbookStage;
  canRunDryRun: boolean;
  canRunCanary: boolean;
  canRunLive: boolean;
  canReconcile: boolean;
  bonusRewards: number;
  ledgerPreflight: GuestGamePilotLedgerPreflight;
}): GuestGamePilotRunbookAction[] {
  const stageClosedReason =
    stage === 'RECONCILIATION'
      ? 'Первое начисление уже подтверждено: сначала завершите сверку баланса.'
      : stage === 'READY'
        ? 'Пилот уже прошел live-write и сверку.'
        : null;
  const ledgerBaseDisabledReason = !canRunCanary
    ? 'Сначала нужен тестовый event/process-event или approved reward.'
    : bonusRewards <= 0
      ? 'Нужна approved bonus-награда, которая попадет в bonus ledger.'
      : stageClosedReason;
  const queueLedgerDisabledReason =
    ledgerBaseDisabledReason ??
    (ledgerPreflight.readyCount > 0
      ? 'В pilot ledger уже есть готовая запись: не ставьте новую перед canary.'
      : null);
  const dryRunLedgerDisabledReason =
    ledgerBaseDisabledReason ??
    (ledgerPreflight.readyCount === 0
      ? 'Сначала поставьте ровно одну approved bonus-награду 1337 в ledger.'
      : ledgerPreflight.readyCount > 1
        ? 'Перед dry-run/canary оставьте ровно одну готовую ledger-запись по 1337.'
        : null);
  const liveDisabledReason =
    ledgerPreflight.readyCount === 0
      ? 'В pilot ledger нет готовой записи по 1337 для canary.'
      : ledgerPreflight.readyCount > 1
        ? 'В pilot ledger больше одной готовой записи по 1337: canary заблокирован.'
        : 'Нужны canary-награда, готовый scheduler и включенный Langame write-флаг.';

  return [
    {
      key: 'OPEN_DRY_RUN',
      label: 'Открыть dry-run',
      enabled: canRunDryRun && stage !== 'READY',
      tone: 'SECONDARY',
      disabledReason:
        canRunDryRun && stage !== 'READY'
          ? null
          : canRunDryRun
            ? 'Пилот уже прошел базовый dry-run.'
            : 'Сначала закройте базовые условия регистрации, OTP, профиля, Langame-связки и активного правила.',
    },
    {
      key: 'QUEUE_BONUS_LEDGER',
      label: 'Поставить в ledger',
      enabled: !queueLedgerDisabledReason,
      tone: 'SECONDARY',
      disabledReason: queueLedgerDisabledReason,
    },
    {
      key: 'DRY_RUN_BONUS_LEDGER',
      label: 'Dry-run ledger',
      enabled: !dryRunLedgerDisabledReason,
      tone: 'SECONDARY',
      disabledReason: dryRunLedgerDisabledReason,
    },
    {
      key: 'DISPATCH_BONUS_LEDGER',
      label: 'Canary live dispatch',
      enabled: canRunLive && stage === 'LIVE_WRITE',
      tone: 'PRIMARY',
      disabledReason:
        canRunLive && stage === 'LIVE_WRITE'
          ? null
          : canRunLive
            ? 'Live-write уже не является текущей стадией пилота.'
            : liveDisabledReason,
    },
    {
      key: 'RECONCILE_BALANCE',
      label: 'Открыть сверку',
      enabled: canReconcile,
      tone: 'SECONDARY',
      disabledReason: canReconcile
        ? null
        : 'Сверка появится после первого confirmed ledger-начисления Langame.',
    },
  ];
}

function buildPilotRunbook({
  items,
  activeRuleCount,
  events,
  approvedRewards,
  readyWalletRewards,
  bonusRewards,
  bonusLedgerAutonomousReady,
  ledgerPreflight,
  firstBonusReconciliation,
}: {
  items: GuestGamePilotReadinessItem[];
  activeRuleCount: number;
  events: number;
  approvedRewards: number;
  readyWalletRewards: number;
  bonusRewards: number;
  bonusLedgerAutonomousReady: boolean;
  ledgerPreflight: GuestGamePilotLedgerPreflight;
  firstBonusReconciliation: GuestGamePilotFirstBonusReconciliation;
}): GuestGamePilotRunbook {
  const prerequisiteBlockers = items.filter(
    (item) =>
      item.status === 'BLOCKED' && pilotRunbookPrerequisiteKeys.has(item.key),
  );
  const prerequisiteBlockerTitles = prerequisiteBlockers.map(
    (item) => item.title,
  );
  const downstreamBlockerTitles = items
    .filter((item) => item.status === 'BLOCKED')
    .filter((item) => !pilotRunbookPrerequisiteKeys.has(item.key))
    .map((item) => item.title);
  const hasPrerequisites = prerequisiteBlockers.length === 0;
  const canRunDryRun = hasPrerequisites && activeRuleCount > 0;
  const canRunCanary =
    canRunDryRun &&
    (events > 0 || approvedRewards > 0 || readyWalletRewards > 0);
  const canRunLive =
    canRunCanary &&
    bonusLedgerAutonomousReady &&
    bonusRewards > 0 &&
    ledgerPreflight.ready;
  const canReconcile = Boolean(firstBonusReconciliation.ledgerEntry);
  const canaryNextAction = !bonusRewards
    ? 'Подготовить approved reward с бонусным rewardType, чтобы он попал в bonus ledger, а не в ручную выдачу.'
    : ledgerPreflight.readyCount === 0
      ? 'Поставить ровно одну approved bonus-награду 1337 в ledger и выполнить dry-run dispatcher.'
      : ledgerPreflight.readyCount > 1
        ? 'Перед live-write отменить или разобрать лишние pending/retry ledger-записи 1337, оставив ровно одну.'
        : bonusLedgerAutonomousReady
          ? 'Выполнить dry-run ledger по единственной записи 1337, затем запускать canary live dispatch.'
          : 'Проверить scheduler/write-флаги и выполнить dry-run ledger по единственной записи 1337.';

  const safeguards = [
    'До live-стадии используются только сохраненные факты LeetPlus и dry-run без записи в Langame.',
    'Первый live-write должен идти как canary: одна бонусная награда, один гость, один клуб 1337.',
    'Live canary разблокируется только если preflight видит ровно одну готовую ledger-запись в scope пилотного клуба.',
    'Raw phone и токены не попадают в UI; ledger и delivery показывают маски и безопасные статусы.',
    'После подтверждения Langame обязательна сверка GuestBonusBalanceCurrent с новым snapshot.',
  ];
  const withActions = (
    runbook: Omit<
      GuestGamePilotRunbook,
      'actions' | 'ledgerPreflight' | 'firstBonusReconciliation'
    >,
  ): GuestGamePilotRunbook => ({
    ...runbook,
    ledgerPreflight,
    firstBonusReconciliation,
    actions: buildPilotRunbookActions({
      stage: runbook.stage,
      canRunDryRun: runbook.canRunDryRun,
      canRunCanary: runbook.canRunCanary,
      canRunLive: runbook.canRunLive,
      canReconcile: runbook.canReconcile,
      bonusRewards,
      ledgerPreflight,
    }),
  });

  if (prerequisiteBlockers.length > 0) {
    return withActions({
      stage: 'BLOCKED',
      stageLabel: 'Стоп',
      canRunDryRun,
      canRunCanary,
      canRunLive,
      canReconcile,
      blockers: prerequisiteBlockerTitles,
      safeguards,
      nextAction:
        prerequisiteBlockers[0]?.nextAction ??
        'Закрыть блокеры пилотного чек-листа.',
      note: 'Пилотный прогон первого бонуса нельзя запускать, пока не закрыты базовые условия регистрации, OTP, профиля, связки с Langame, активного правила и обязательных snapshot-фактов.',
    });
  }

  if (firstBonusReconciliation.status === 'MATCHED') {
    return withActions({
      stage: 'READY',
      stageLabel: 'Готово',
      canRunDryRun,
      canRunCanary,
      canRunLive: false,
      canReconcile,
      blockers: [],
      safeguards,
      nextAction:
        'Сохранить пилот 1337 как эталонный сценарий и расширять лимит начислений только после проверки журнала.',
      note: 'Путь первого bonus_balance начисления прошел до подтверждения Langame и последующей сверки баланса.',
    });
  }

  if (
    firstBonusReconciliation.status === 'WAITING_SYNC' ||
    firstBonusReconciliation.status === 'MISMATCH'
  ) {
    return withActions({
      stage: 'RECONCILIATION',
      stageLabel: 'Сверка',
      canRunDryRun,
      canRunCanary,
      canRunLive: false,
      canReconcile,
      blockers: downstreamBlockerTitles,
      safeguards,
      nextAction: firstBonusReconciliation.nextAction,
      note: 'Первое начисление уже подтверждено Langame; следующий обязательный этап - сверка баланса и отсутствие расхождений.',
    });
  }

  if (!events || (!approvedRewards && !readyWalletRewards)) {
    return withActions({
      stage: 'DRY_RUN',
      stageLabel: 'Dry-run',
      canRunDryRun,
      canRunCanary,
      canRunLive: false,
      canReconcile,
      blockers: [],
      safeguards,
      nextAction:
        'Прогнать dry-run/process-event на тестовом госте 1337 и убедиться, что правило создает ожидаемую бонусную награду без записи в Langame.',
      note: 'Базовые условия готовы; теперь нужен контролируемый тест события и проверка idempotency до очереди бонусов.',
    });
  }

  if (!canRunLive) {
    return withActions({
      stage: 'CANARY',
      stageLabel: 'Canary',
      canRunDryRun,
      canRunCanary,
      canRunLive,
      canReconcile,
      blockers: downstreamBlockerTitles,
      safeguards,
      nextAction: canaryNextAction,
      note: 'Есть тестовая активность или награда, но до live-write нужен безопасный canary через ledger dry-run и проверку scheduler/write-флагов.',
    });
  }

  return withActions({
    stage: 'LIVE_WRITE',
    stageLabel: 'Live write',
    canRunDryRun,
    canRunCanary,
    canRunLive,
    canReconcile,
    blockers: [],
    safeguards,
    nextAction:
      'Запустить первый live-write только на одной бонусной награде 1337, затем сразу проверить ledger status и ждать свежий snapshot баланса.',
    note: 'Все условия для первого боевого начисления есть; режим должен оставаться canary до подтвержденной сверки баланса.',
  });
}

function pickPilotStore(stores: PilotStoreRow[]) {
  return (
    stores.find((store) =>
      [
        store.name,
        store.publicSlug,
        store.externalDomain,
        store.externalClubId,
        store.address,
        store.city,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes('1337')),
    ) ??
    stores.find((store) => store.gamificationEnabled) ??
    stores[0] ??
    null
  );
}

function ruleMatchesPilotStore(
  rule: { status: StatusValue; storeIds: string[] },
  storeId: string | null,
) {
  if (rule.status !== 'ACTIVE') {
    return false;
  }

  return (
    !rule.storeIds.length || Boolean(storeId && rule.storeIds.includes(storeId))
  );
}

function isBonusLedgerRewardType(rewardType: string | null) {
  const normalized = rewardType?.trim().toUpperCase();

  return Boolean(
    normalized &&
    ['BONUS', 'BONUS_POINTS', 'BONUS_BALANCE', 'LOYALTY_BONUS'].includes(
      normalized,
    ),
  );
}

function canonicalLootBoxRewardType(rewardType: string): string;
function canonicalLootBoxRewardType(rewardType: null | undefined): undefined;
function canonicalLootBoxRewardType(
  rewardType: string | null | undefined,
): string | undefined;
function canonicalLootBoxRewardType(rewardType: string | null | undefined) {
  const normalized = rewardType?.trim().toUpperCase();

  if (!normalized) {
    return rewardType ?? undefined;
  }

  if (
    [
      'BONUS',
      'BONUS_POINTS',
      'BONUS_BALANCE',
      'CASHBACK',
      'LOYALTY_BONUS',
    ].includes(normalized)
  ) {
    return 'BONUS_BALANCE';
  }

  return normalized;
}

function positiveConfigInt(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function buildPilotLedgerPreflight({
  targetStore,
  pendingCount,
  retryReadyCount,
  staleProcessingCount,
  processingCount,
  failedWaitingRetryCount,
  previewItems,
}: {
  targetStore: PilotStoreRow | null;
  pendingCount: number;
  retryReadyCount: number;
  staleProcessingCount: number;
  processingCount: number;
  failedWaitingRetryCount: number;
  previewItems: GuestGamePilotLedgerPreflightItem[];
}): GuestGamePilotLedgerPreflight {
  const readyCount = pendingCount + retryReadyCount + staleProcessingCount;
  const freshProcessingCount = Math.max(
    0,
    processingCount - staleProcessingCount,
  );
  const metric = `${readyCount} ready / ${pendingCount} pending / ${retryReadyCount} retry`;

  if (!targetStore) {
    return {
      status: 'NO_STORE',
      statusLabel: 'нет клуба',
      ready: false,
      scopedStoreId: null,
      scopedStoreName: null,
      readyCount,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
      metric,
      note: 'Preflight не может проверить bonus ledger без выбранного пилотного клуба.',
      nextAction:
        'Выбрать активный клуб 1337 или включить геймификацию у пилотной точки.',
    };
  }

  if (readyCount === 1) {
    return {
      status: 'READY',
      statusLabel: '1 готова',
      ready: true,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      readyCount,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
      metric,
      note: 'В pilot ledger есть ровно одна запись, которую canary dispatch может забрать по scope клуба.',
      nextAction:
        'Выполнить ledger dry-run и запускать canary live dispatch только для этой записи.',
    };
  }

  if (readyCount > 1) {
    return {
      status: 'MULTIPLE',
      statusLabel: 'дубликаты',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      readyCount,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
      metric,
      note: 'В scope пилотного клуба больше одной готовой ledger-записи: первый Langame write перестает быть canary.',
      nextAction:
        'Отменить или разобрать лишние pending/retry записи по 1337, оставив ровно одну для первого write.',
    };
  }

  if (freshProcessingCount > 0) {
    return {
      status: 'PROCESSING',
      statusLabel: 'обработка',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      readyCount,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
      metric,
      note: 'По пилотному клубу уже есть свежая PROCESSING-запись; live canary ждет завершения или stale-lock.',
      nextAction:
        'Дождаться завершения worker или протухания lock перед новым canary-действием.',
    };
  }

  if (failedWaitingRetryCount > 0) {
    return {
      status: 'WAITING_RETRY',
      statusLabel: 'ждет retry',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      readyCount,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
      metric,
      note: 'Есть failed ledger-запись по 1337, но nextAttemptAt еще не наступил для безопасного retry.',
      nextAction:
        'Дождаться nextAttemptAt или вручную отменить ошибочную запись перед постановкой новой.',
    };
  }

  return {
    status: 'EMPTY',
    statusLabel: 'пусто',
    ready: false,
    scopedStoreId: targetStore.id,
    scopedStoreName: targetStore.name,
    readyCount,
    pendingCount,
    retryReadyCount,
    staleProcessingCount,
    processingCount,
    failedWaitingRetryCount,
    previewItems,
    metric,
    note: 'В pilot ledger пока нет готовой записи по клубу 1337 для первого Langame write.',
    nextAction:
      'Поставить одну approved bonus-награду в ledger, затем выполнить dry-run и canary.',
  };
}

function buildPilotFirstBonusReconciliation({
  targetStore,
  ledgerEntry,
}: {
  targetStore: PilotStoreRow | null;
  ledgerEntry: GuestGameBonusLedgerAuditItem | null;
}): GuestGamePilotFirstBonusReconciliation {
  if (!targetStore) {
    return {
      status: 'NO_STORE',
      statusLabel: 'нет клуба',
      ready: false,
      scopedStoreId: null,
      scopedStoreName: null,
      ledgerEntry: null,
      metric: 'клуб не выбран',
      note: 'Первую сверку bonus_balance нельзя проверить без выбранного пилотного клуба.',
      nextAction:
        'Выбрать активный клуб 1337 или включить геймификацию у пилотной точки.',
    };
  }

  if (!ledgerEntry) {
    return {
      status: 'WAITING_LIVE',
      statusLabel: 'ждет live',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: null,
      metric: '0 confirmed bonus_balance',
      note: 'В scope пилотного клуба еще нет подтвержденного положительного bonus_balance начисления через Langame.',
      nextAction:
        'Довести canary до одного confirmed bonus_balance начисления по 1337, затем ждать свежий snapshot баланса.',
    };
  }

  const reconciliation = ledgerEntry.reconciliation;
  const status: GuestGamePilotFirstBonusReconciliationStatus =
    reconciliation.state === 'MATCHED'
      ? 'MATCHED'
      : reconciliation.state === 'MISMATCH'
        ? 'MISMATCH'
        : 'WAITING_SYNC';

  const ledgerPayload = {
    id: ledgerEntry.id,
    status: ledgerEntry.status,
    statusLabel: ledgerEntry.statusLabel,
    amount: ledgerEntry.amount,
    balanceAfter: ledgerEntry.balanceAfter,
    confirmedAt: ledgerEntry.confirmedAt,
    guest: ledgerEntry.guest,
    store: ledgerEntry.store,
    reconciliation,
  };

  if (status === 'MATCHED') {
    return {
      status,
      statusLabel: 'сверено',
      ready: true,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: ledgerPayload,
      metric: `${ledgerEntry.amount} бонусов / snapshot совпал`,
      note: 'Первая bonus_balance операция пилота подтверждена Langame и совпала с последующим snapshot баланса.',
      nextAction:
        'Сохранить эту ledger-запись как эталон пилотного начисления перед расширением лимитов.',
    };
  }

  if (status === 'MISMATCH') {
    return {
      status,
      statusLabel: 'расхождение',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: ledgerPayload,
      metric: `${ledgerEntry.amount} бонусов / diff ${reconciliation.diff ?? 'n/a'}`,
      note: 'Первая bonus_balance операция пилота подтверждена, но сохраненный Langame snapshot не совпал с ожидаемым balanceAfter.',
      nextAction:
        'Разобрать первую ledger-запись 1337 в журнале, сверить гостя в Langame и не расширять live-write до устранения расхождения.',
    };
  }

  return {
    status,
    statusLabel: 'ждет snapshot',
    ready: false,
    scopedStoreId: targetStore.id,
    scopedStoreName: targetStore.name,
    ledgerEntry: ledgerPayload,
    metric: `${ledgerEntry.amount} бонусов / snapshot нужен`,
    note: 'Первая bonus_balance операция пилота уже подтверждена Langame, но еще нет свежего snapshot после confirmedAt.',
    nextAction:
      'Дождаться guest foundation sync и нового bonus balance snapshot после первого начисления.',
  };
}

function isPilotFirstBonusLedgerRow(row: BonusLedgerAuditRow) {
  if (
    row.status !== 'CONFIRMED' ||
    row.entryType !== 'EARN' ||
    numberValue(row.amount) <= 0
  ) {
    return false;
  }

  const metadata = jsonRecord(row.metadata);
  const configuredType = nullableString(metadata.langameBalanceType)
    ?.trim()
    .toLowerCase();

  if (configuredType) {
    return configuredType === 'bonus_balance';
  }

  return isBonusLedgerRewardType(
    nullableString(metadata.rewardType) ?? row.reward?.rewardType ?? null,
  );
}

function guestGamificationDebugJson(payload: Record<string, unknown>) {
  try {
    return JSON.stringify(payload, guestGamificationDebugJsonReplacer);
  } catch (error) {
    return JSON.stringify({
      serializationError:
        error instanceof Error ? error.message : 'failed_to_serialize',
    });
  }
}

function guestGamificationDebugJsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    const decimalLike = value as {
      constructor?: { name?: string };
      toString?: () => string;
    };
    const name = decimalLike.constructor?.name;

    if (name === 'Decimal' && typeof decimalLike.toString === 'function') {
      return decimalLike.toString();
    }
  }

  return value;
}

@Injectable()
export class GuestGamificationService {
  private readonly logger = new Logger(GuestGamificationService.name);
  private readonly liveSessionStartCache = new Map<
    string,
    LiveSessionStartCacheEntry
  >();
  private readonly liveSessionStartInFlight = new Map<
    string,
    Promise<GuestGameProcessEventResult | null>
  >();
  private readonly tariffTypeGroupCache = new Map<
    string,
    { expiresAt: number; index: LangameTariffTypeGroupIndex }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
    private readonly configService: ConfigService,
    private readonly bonusLedgerSchedulerService: GuestBonusLedgerSchedulerService,
    private readonly bonusLedgerService: GuestBonusLedgerService,
    private readonly guestIdentityResolver: GuestIdentityResolverService,
    @Optional()
    private readonly staffTeamChatService?: StaffTeamChatService,
  ) {}

  private async resolveProfileIdentityGuestIds(
    user: AuthenticatedUser,
    input: {
      profileId?: string | null;
      legacyGuestId?: string | null;
      legacyExternalDomain?: string | null;
      externalDomain?: string | null;
    },
  ): Promise<string[]> {
    const profileId = nullableId(input.profileId);
    const legacyGuestId = nullableId(input.legacyGuestId);
    const externalDomain = nullableString(input.externalDomain);

    if (!profileId) {
      return legacyGuestId ? [legacyGuestId] : [];
    }

    if (externalDomain) {
      const domainGuest =
        await this.guestIdentityResolver.findActiveGuestForProfileDomain({
          tenantId: user.tenantId,
          profileId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
        });
      if (domainGuest?.id) {
        return [domainGuest.id];
      }

      return legacyGuestId &&
        nullableString(input.legacyExternalDomain) === externalDomain
        ? [legacyGuestId]
        : [];
    }

    const linkedGuestIds = await this.guestIdentityResolver.listActiveGuestIds(
      user.tenantId,
      profileId,
    );
    return uniqueStrings([
      ...(legacyGuestId ? [legacyGuestId] : []),
      ...linkedGuestIds,
    ]);
  }

  private logGuestGameDebug(
    stage: string,
    payload: Record<string, unknown>,
    level: 'log' | 'warn' = 'log',
  ) {
    const message = `[guest-game-debug:${stage}] ${guestGamificationDebugJson(
      payload,
    )}`;

    if (level === 'warn') {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }

  private guestGameDebugSource(source: { baseUrl?: string | null }) {
    const baseUrl = nullableString(source.baseUrl);

    if (!baseUrl) {
      return null;
    }

    try {
      return new URL(baseUrl).host;
    } catch {
      return baseUrl.slice(0, 120);
    }
  }

  private guestGameDebugStore(store: CheckInExpectedStore | null) {
    if (!store) {
      return null;
    }

    return {
      id: store.id,
      name: store.name,
      externalDomain: store.externalDomain,
      externalClubId: store.externalClubId,
      integrationSourceId: store.integrationSourceId,
      timeZone: store.timeZone,
    };
  }

  private guestGameDebugSession(session: CheckInLiveSession | null) {
    if (!session) {
      return null;
    }

    return {
      externalSessionId: session.externalSessionId,
      externalDomain: session.externalDomain,
      externalClubId: session.externalClubId,
      startedAt: session.startedAt?.toISOString() ?? null,
      durationMinutes: session.durationMinutes,
      sessionType: session.sessionType,
      sessionPacket: session.sessionPacket,
      sessionBillingResolvedBy: session.sessionBillingResolvedBy,
      store: session.store
        ? {
            id: session.store.id,
            name: session.store.name,
            timeZone: session.store.timeZone,
          }
        : null,
    };
  }

  private guestGameDebugTransaction(
    row: LangameTransaction,
    session: CheckInLiveSession,
    externalGuestId: string,
  ) {
    const record = row;
    const text = this.checkInPacketMarkerText(record);

    return {
      id:
        this.checkInScalar(record.id) ??
        this.checkInScalar(record.transaction_id) ??
        null,
      realGuestId: this.checkInScalar(row.real_guest_id),
      guestId: this.checkInScalar(row.guest_id),
      sessionId: this.checkInScalar(row.session_id),
      clubId: this.checkInScalar(row.club_id ?? row.list_clubs_id),
      date: this.checkInTransactionDate(row),
      type: this.checkInScalar(row.type),
      text: text ? text.slice(0, 240) : null,
      guestMatches: this.checkInTransactionGuestMatches(row, externalGuestId),
      sessionOrStoreMatches: this.checkInTransactionSessionOrStoreMatches(
        row,
        session,
      ),
      looksLikePacketOrSubscription:
        this.checkInTransactionLooksLikePacketHours(row),
    };
  }

  private guestGameDebugGuestLog(
    row: LangameGuestLog,
    session: CheckInLiveSession,
    externalGuestId: string,
  ) {
    const record = row;
    const text = this.checkInPacketMarkerText(record);

    return {
      id:
        this.checkInScalar(record.id) ??
        this.checkInScalar(record.log_id) ??
        null,
      realGuestId: this.checkInScalar(record.real_guest_id),
      guestId: this.checkInScalar(row.guest_id ?? record.guest_id),
      clubId: this.checkInScalar(record.club_id ?? record.list_clubs_id),
      date: this.checkInGuestLogDate(row),
      type: this.checkInScalar(row.type),
      text: text ? text.slice(0, 240) : null,
      guestMatches: this.checkInGuestLogGuestMatches(row, externalGuestId),
      storeMatches: this.checkInGuestLogStoreMatches(row, session),
      sessionWindowMatches: this.checkInGuestLogIsInSessionWindow(row, session),
      looksLikePacketOrSubscription:
        this.checkInGuestLogLooksLikePacketHours(row),
    };
  }

  private guestGameDebugProcessResult(
    result: GuestGameProcessEventResult | null,
  ) {
    if (!result) {
      return null;
    }

    const event = result.event ?? null;
    const input = result.dryRun?.input ?? null;
    const rules = result.dryRun?.rules ?? [];

    return {
      eventId: event?.id ?? null,
      eventType: event?.eventType ?? null,
      occurredAt: event?.occurredAt ?? null,
      input: {
        sessionType: input?.sessionType ?? null,
        sessionPacket: input?.sessionPacket ?? null,
        sessionMinutes: input?.sessionMinutes ?? null,
      },
      summary: {
        idempotent: result.summary.idempotent,
        appliedXpDelta: result.summary.appliedXpDelta,
        createdRewards: result.summary.createdRewards,
        queuedRewardAmount: result.summary.queuedRewardAmount,
        idempotencyKey: result.summary.idempotencyKey,
      },
      lootBoxRules: rules
        .filter((rule) => rule.kind === 'LOOT_BOX')
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          eligible: rule.eligible,
          status: rule.status,
          blockers: rule.blockers,
        })),
    };
  }

  async getWorkspace(
    user: AuthenticatedUser,
  ): Promise<GuestGamificationWorkspace> {
    const [
      profiles,
      lootBoxes,
      missions,
      seasons,
      promoCards,
      rewards,
      deliveries,
      events,
      tariffSnapshots,
      guestLogCatalog,
      pilotStores,
      bonusLedgerAudit,
      bonusBalanceCurrentReconciliation,
    ] = await Promise.all([
      this.getProfiles(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getSeasons(user),
      this.getPromoCards(user),
      this.getRewards(user),
      this.getDeliveries(user),
      this.getEvents(user),
      this.getTariffSnapshots(user),
      this.getGuestLogCatalog(user),
      this.getPilotStores(user),
      this.getBonusLedgerAudit(user),
      this.getBonusBalanceCurrentReconciliation(user),
    ]);

    const targetPilotStore = pickPilotStore(pilotStores);
    const [effect, pilotLedgerPreflight, pilotFirstBonusReconciliation] =
      await Promise.all([
        this.buildEffect(user, lootBoxes, missions, seasons, events),
        this.getPilotBonusLedgerPreflight(user, targetPilotStore),
        this.getPilotFirstBonusReconciliation(user, targetPilotStore),
      ]);
    const integrationReadiness = this.buildIntegrationReadiness(deliveries);
    const communicationQueue = this.buildCommunicationQueue(profiles, rewards);
    const deliveryOutbox = this.buildDeliveryOutbox(
      deliveries,
      user.tenantSlug,
    );

    return {
      summary: this.buildSummary(
        profiles,
        lootBoxes,
        missions,
        seasons,
        rewards,
      ),
      economy: this.buildEconomy(lootBoxes, missions, seasons, rewards, events),
      effect,
      integrationReadiness,
      pilotReadiness: this.buildPilotReadiness({
        tenantSlug: user.tenantSlug,
        stores: pilotStores,
        profiles,
        lootBoxes,
        missions,
        seasons,
        rewards,
        events,
        integrationReadiness,
        guestLogCatalog,
        pilotLedgerPreflight,
        pilotFirstBonusReconciliation,
        communicationQueue,
        deliveryOutbox,
      }),
      bonusLedgerAudit,
      bonusBalanceCurrentReconciliation,
      communicationQueue,
      deliveryOutbox,
      profiles,
      lootBoxes,
      missions,
      seasons,
      promoCards,
      rewards,
      events,
      tariffSnapshots,
      guestLogCatalog,
    };
  }

  private async getPilotStores(
    user: AuthenticatedUser,
  ): Promise<PilotStoreRow[]> {
    return this.prisma.store.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
      },
      select: pilotStoreSelect,
      orderBy: [
        { gamificationEnabled: 'desc' },
        { name: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  private async getPilotBonusLedgerPreflight(
    user: AuthenticatedUser,
    targetStore: PilotStoreRow | null,
  ): Promise<GuestGamePilotLedgerPreflight> {
    if (!targetStore) {
      return buildPilotLedgerPreflight({
        targetStore: null,
        pendingCount: 0,
        retryReadyCount: 0,
        staleProcessingCount: 0,
        processingCount: 0,
        failedWaitingRetryCount: 0,
        previewItems: [],
      });
    }

    const now = new Date();
    const maxAttempts = positiveConfigInt(
      this.configService.get<string>('LANGAME_BONUS_ACCRUAL_MAX_ATTEMPTS'),
      5,
      20,
    );
    const staleLockMinutes = positiveConfigInt(
      this.configService.get<string>(
        'LANGAME_BONUS_ACCRUAL_STALE_LOCK_MINUTES',
      ),
      15,
      24 * 60,
    );
    const staleLockedBefore = new Date(
      now.getTime() - staleLockMinutes * 60 * 1000,
    );
    const baseWhere = {
      tenantId: user.tenantId,
      storeId: targetStore.id,
    };
    const [
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      readyPreviewIds,
    ] = await Promise.all([
      this.prisma.guestBonusLedgerEntry.count({
        where: { ...baseWhere, status: 'PENDING' },
      }),
      this.prisma.guestBonusLedgerEntry.count({
        where: {
          ...baseWhere,
          status: 'FAILED',
          attempts: { lt: maxAttempts },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      }),
      this.prisma.guestBonusLedgerEntry.count({
        where: {
          ...baseWhere,
          status: 'PROCESSING',
          attempts: { lt: maxAttempts },
          lockedAt: { lt: staleLockedBefore },
        },
      }),
      this.prisma.guestBonusLedgerEntry.count({
        where: { ...baseWhere, status: 'PROCESSING' },
      }),
      this.prisma.guestBonusLedgerEntry.count({
        where: {
          ...baseWhere,
          status: 'FAILED',
          attempts: { lt: maxAttempts },
          nextAttemptAt: { gt: now },
        },
      }),
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "GuestBonusLedgerEntry"
        WHERE "tenantId" = ${user.tenantId}
          AND "storeId" = ${targetStore.id}
          AND (
            "status" = 'PENDING'
            OR (
              "status" = 'FAILED'
              AND "attempts" < ${maxAttempts}
              AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
            )
            OR (
              "status" = 'PROCESSING'
              AND "attempts" < ${maxAttempts}
              AND "lockedAt" < ${staleLockedBefore}
            )
          )
        ORDER BY COALESCE("nextAttemptAt", "createdAt"), "createdAt"
        LIMIT 3
      `),
    ]);
    const previewRows = readyPreviewIds.length
      ? await this.prisma.guestBonusLedgerEntry.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: readyPreviewIds.map((item) => item.id) },
          },
          select: bonusLedgerAuditSelect,
        })
      : [];
    const previewById = new Map(previewRows.map((row) => [row.id, row]));
    const previewItems = readyPreviewIds
      .map((item) => previewById.get(item.id))
      .filter((row): row is BonusLedgerAuditRow => Boolean(row))
      .map((row) => mapPilotLedgerPreflightItem(row, now));

    return buildPilotLedgerPreflight({
      targetStore,
      pendingCount,
      retryReadyCount,
      staleProcessingCount,
      processingCount,
      failedWaitingRetryCount,
      previewItems,
    });
  }

  private async getPilotFirstBonusReconciliation(
    user: AuthenticatedUser,
    targetStore: PilotStoreRow | null,
  ): Promise<GuestGamePilotFirstBonusReconciliation> {
    if (!targetStore) {
      return buildPilotFirstBonusReconciliation({
        targetStore: null,
        ledgerEntry: null,
      });
    }

    const candidates = await this.prisma.guestBonusLedgerEntry.findMany({
      where: {
        tenantId: user.tenantId,
        storeId: targetStore.id,
        status: 'CONFIRMED',
        entryType: 'EARN',
        confirmedAt: { not: null },
      },
      select: bonusLedgerAuditSelect,
      orderBy: [{ confirmedAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
    const firstBonusRow =
      candidates.find((row) => isPilotFirstBonusLedgerRow(row)) ?? null;

    if (!firstBonusRow) {
      return buildPilotFirstBonusReconciliation({
        targetStore,
        ledgerEntry: null,
      });
    }

    const snapshots = await this.getBonusLedgerAuditSnapshots(user.tenantId, [
      firstBonusRow,
    ]);
    const ledgerEntry =
      buildBonusLedgerAudit([firstBonusRow], snapshots).items[0] ?? null;

    return buildPilotFirstBonusReconciliation({
      targetStore,
      ledgerEntry,
    });
  }

  private async getBonusLedgerAudit(
    user: AuthenticatedUser,
  ): Promise<GuestGameBonusLedgerAudit> {
    const entries = await this.prisma.guestBonusLedgerEntry.findMany({
      where: { tenantId: user.tenantId },
      select: bonusLedgerAuditSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
    });
    const snapshots = await this.getBonusLedgerAuditSnapshots(
      user.tenantId,
      entries,
    );

    return buildBonusLedgerAudit(entries, snapshots);
  }

  private async getBonusLedgerAuditSnapshots(
    tenantId: string,
    entries: BonusLedgerAuditRow[],
  ): Promise<BonusLedgerAuditSnapshotRow[]> {
    const confirmedEntries = entries.filter(
      (entry) => entry.status === 'CONFIRMED' && entry.confirmedAt,
    );

    if (!confirmedEntries.length) {
      return [];
    }

    const earliestConfirmedAt = confirmedEntries.reduce<Date | null>(
      (earliest, entry) =>
        !earliest ||
        (entry.confirmedAt && entry.confirmedAt.getTime() < earliest.getTime())
          ? entry.confirmedAt
          : earliest,
      null,
    );
    const snapshotScopes: Prisma.GuestBonusBalanceSnapshotWhereInput[] = [];

    for (const entry of confirmedEntries) {
      if (entry.guestId) {
        snapshotScopes.push({ guestId: entry.guestId });
      }

      if (entry.externalGuestId) {
        snapshotScopes.push({
          externalProvider: entry.externalProvider,
          externalDomain: entry.externalDomain,
          externalGuestId: entry.externalGuestId,
        });
      }
    }

    if (!snapshotScopes.length) {
      return [];
    }

    return this.prisma.guestBonusBalanceSnapshot.findMany({
      where: {
        tenantId,
        snapshotDate: earliestConfirmedAt
          ? { gte: earliestConfirmedAt }
          : undefined,
        OR: snapshotScopes,
      },
      select: bonusLedgerAuditSnapshotSelect,
      orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  private async getBonusBalanceCurrentReconciliation(
    user: AuthenticatedUser,
  ): Promise<GuestGameBonusBalanceCurrentReconciliation> {
    const currents = await this.prisma.guestBonusBalanceCurrent.findMany({
      where: { tenantId: user.tenantId },
      select: bonusBalanceCurrentReconciliationSelect,
      orderBy: [
        { snapshotDate: 'desc' },
        { bonusBalance: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 50,
    });
    const snapshots = await this.getBonusBalanceCurrentSnapshots(
      user.tenantId,
      currents,
    );

    return buildBonusBalanceCurrentReconciliation(currents, snapshots);
  }

  private async getBonusBalanceCurrentSnapshots(
    tenantId: string,
    currents: BonusBalanceCurrentReconciliationRow[],
  ): Promise<BonusLedgerAuditSnapshotRow[]> {
    const snapshotScopes: Prisma.GuestBonusBalanceSnapshotWhereInput[] = [];

    for (const current of currents) {
      if (current.guestId) {
        snapshotScopes.push({ guestId: current.guestId });
      }

      if (current.externalGuestId) {
        snapshotScopes.push({
          externalProvider: current.externalProvider,
          externalDomain: current.externalDomain,
          externalGuestId: current.externalGuestId,
        });
      }
    }

    if (!snapshotScopes.length) {
      return [];
    }

    return this.prisma.guestBonusBalanceSnapshot.findMany({
      where: {
        tenantId,
        OR: snapshotScopes,
      },
      select: bonusLedgerAuditSnapshotSelect,
      orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(300, currents.length * 10),
    });
  }

  private buildPilotReadiness({
    tenantSlug,
    stores,
    profiles,
    lootBoxes,
    missions,
    seasons,
    rewards,
    events,
    integrationReadiness,
    guestLogCatalog,
    pilotLedgerPreflight,
    pilotFirstBonusReconciliation,
    communicationQueue,
    deliveryOutbox,
  }: {
    tenantSlug: string;
    stores: PilotStoreRow[];
    profiles: GuestGameProfile[];
    lootBoxes: GuestGameLootBox[];
    missions: GuestGameMission[];
    seasons: GuestGameSeason[];
    rewards: GuestGameReward[];
    events: GuestGameEvent[];
    integrationReadiness: GuestGameIntegrationReadiness;
    guestLogCatalog: GuestGameGuestLogCatalog;
    pilotLedgerPreflight: GuestGamePilotLedgerPreflight;
    pilotFirstBonusReconciliation: GuestGamePilotFirstBonusReconciliation;
    communicationQueue: GuestGameCommunicationQueue;
    deliveryOutbox: GuestGameDeliveryOutbox;
  }): GuestGamePilotReadiness {
    const targetStore = pickPilotStore(stores);
    const targetStoreId = targetStore?.id ?? null;
    const activeProfiles = profiles.filter(
      (profile) => profile.status === 'ACTIVE',
    );
    const linkedProfiles = activeProfiles.filter((profile) => profile.guest);
    const activeLootBoxes = lootBoxes.filter((item) =>
      ruleMatchesPilotStore(item, targetStoreId),
    );
    const activeMissions = missions.filter((item) =>
      ruleMatchesPilotStore(item, targetStoreId),
    );
    const activeSeasons = seasons.filter((item) =>
      ruleMatchesPilotStore(item, targetStoreId),
    );
    const activeRuleCount =
      activeLootBoxes.length + activeMissions.length + activeSeasons.length;
    const guestLogTypes = guestLogCatalog.summary.types;
    const guestLogRows = guestLogCatalog.summary.logs;
    const guestLogDomains = guestLogCatalog.summary.domains;
    const guestLogMappings = guestLogCatalog.mappings.length;
    const guestLogLatestAt = guestLogCatalog.summary.latestAt;
    const guestLogsReady = guestLogTypes > 0 && guestLogRows > 0;
    const guestLogLastSync = guestLogCatalog.summary.lastSuccessfulSync;
    const guestLogsCheckedEmpty = Boolean(!guestLogsReady && guestLogLastSync);
    const guestLogRuleDependencies = [
      ...activeLootBoxes,
      ...activeMissions,
      ...activeSeasons,
    ].filter(guestGameRuleUsesGuestLogs).length;
    const guestLogsRequiredByRules = guestLogRuleDependencies > 0;
    const pilotRewards = targetStoreId
      ? rewards.filter(
          (reward) => !reward.store || reward.store.id === targetStoreId,
        )
      : rewards;
    const approvedRewards = pilotRewards.filter(
      (reward) => reward.status === 'APPROVED',
    );
    const pendingRewards = pilotRewards.filter(
      (reward) => reward.status === 'PENDING',
    );
    const readyWalletRewards = pilotRewards.filter(
      (reward) => reward.walletState === 'READY',
    );
    const bonusRewards = approvedRewards.filter((reward) =>
      isBonusLedgerRewardType(reward.rewardType),
    );
    const cashierReady =
      communicationQueue.summary.readyForCashier +
      deliveryOutbox.summary.cashier;
    const otpItem = integrationReadiness.items.find(
      (item) => item.key === 'OTP',
    );
    const langameWriteItem = integrationReadiness.items.find(
      (item) => item.key === 'LANGAME_WRITE_API',
    );
    const bonusLedgerSchedulerItem = integrationReadiness.items.find(
      (item) => item.key === 'BONUS_LEDGER_SCHEDULER',
    );
    const telegramLinkItem = integrationReadiness.items.find(
      (item) => item.key === 'TELEGRAM_LINK',
    );
    const telegramConsumerItem = integrationReadiness.items.find(
      (item) => item.key === 'TELEGRAM_WEBHOOK',
    );
    const userCallItem = integrationReadiness.items.find(
      (item) => item.key === 'USER_CALL_AUTH',
    );
    const telegramAuthReady = Boolean(
      telegramLinkItem?.ready && telegramConsumerItem?.ready,
    );
    const userCallReady = Boolean(userCallItem?.ready);
    const smsReserveReady = Boolean(otpItem?.ready);
    const publicAuthReady = Boolean(
      telegramAuthReady || userCallReady || smsReserveReady,
    );
    const publicAuthPartial = Boolean(
      telegramLinkItem?.enabled ||
      telegramLinkItem?.configured ||
      telegramConsumerItem?.enabled ||
      telegramConsumerItem?.configured ||
      userCallItem?.enabled ||
      userCallItem?.configured ||
      otpItem?.enabled ||
      otpItem?.configured,
    );
    const publicAuthChannels: string[] = [];
    if (telegramAuthReady) {
      publicAuthChannels.push('Telegram');
    }
    if (userCallReady) {
      publicAuthChannels.push('звонок');
    }
    if (smsReserveReady) {
      publicAuthChannels.push('SMS');
    }
    const bonusLedgerAutonomousReady = Boolean(
      langameWriteItem?.ready && bonusLedgerSchedulerItem?.ready,
    );
    const registrationReady = Boolean(
      targetStore && (targetStore.gamificationEnabled || activeRuleCount > 0),
    );
    const targetStoreCoordinatesReady = Boolean(
      targetStore?.latitude != null && targetStore?.longitude != null,
    );
    const targetStoreCoordinatesPartial = Boolean(
      targetStore &&
      !targetStoreCoordinatesReady &&
      (targetStore.latitude != null || targetStore.longitude != null),
    );
    const storeSlugOrId = targetStore?.publicSlug ?? targetStore?.id ?? null;
    const targetStoreAuthPath = storeSlugOrId
      ? `/game/auth?storeId=${encodeURIComponent(storeSlugOrId)}`
      : '/game/auth';
    const targetStoreGamePath = '/play/game';
    const targetStorePayload = targetStore
      ? {
          id: targetStore.id,
          name: targetStore.name,
          publicSlug: targetStore.publicSlug,
          city: targetStore.city,
          address: targetStore.address,
          externalDomain: targetStore.externalDomain,
          externalClubId: targetStore.externalClubId,
          gamificationEnabled: targetStore.gamificationEnabled,
          guestPortalPath: `/guest/${tenantSlug}/${storeSlugOrId}`,
          playPath: targetStoreGamePath,
        }
      : null;
    const items: GuestGamePilotReadinessItem[] = [
      {
        key: 'CLUB',
        title: 'Клуб пилота',
        status: targetStore
          ? targetStore.gamificationEnabled
            ? 'READY'
            : 'PARTIAL'
          : 'BLOCKED',
        statusLabel: targetStore
          ? targetStore.gamificationEnabled
            ? 'в каталоге'
            : 'нужен флаг'
          : 'нет клуба',
        ready: Boolean(targetStore?.gamificationEnabled),
        metric: targetStore?.name ?? 'клуб не выбран',
        note: targetStore
          ? 'Пилот выбирает клуб 1337, если он найден среди активных клубов; иначе берется первый клуб с включенной геймификацией.'
          : 'В tenant нет активного клуба для пилотного запуска геймификации.',
        nextAction: targetStore?.gamificationEnabled
          ? 'Оставить клуб включенным в публичном каталоге /game/clubs.'
          : 'Включить флаг геймификации у пилотного клуба на странице клубов.',
        actionHref: '/stores',
        actionLabel: 'Открыть клубы',
      },
      {
        key: 'GEOSEARCH',
        title: 'Карта и поиск рядом',
        status: targetStore
          ? targetStoreCoordinatesReady
            ? 'READY'
            : 'BLOCKED'
          : 'BLOCKED',
        statusLabel: targetStore
          ? targetStoreCoordinatesReady
            ? 'координаты есть'
            : targetStoreCoordinatesPartial
              ? 'частично'
              : 'нет координат'
          : 'нет клуба',
        ready: targetStoreCoordinatesReady,
        metric: targetStore
          ? targetStoreCoordinatesReady
            ? 'широта и долгота'
            : targetStoreCoordinatesPartial
              ? 'заполнена одна координата'
              : 'координат нет'
          : 'клуб не выбран',
        note: 'Перед production QA первого бонуса пилотный клуб должен участвовать в карте и поиске рядом на /game/clubs и /play/game.',
        nextAction: targetStoreCoordinatesReady
          ? 'Проверить /game/clubs и /play/game с фильтром рядом на реальной геолокации.'
          : 'Заполнить широту и долготу пилотного клуба в /stores вручную или через bulk-действие Заполнить координаты.',
        actionHref: '/stores',
        actionLabel: targetStoreCoordinatesReady
          ? 'Открыть клубы'
          : 'Заполнить координаты',
      },
      {
        key: 'PUBLIC_REGISTRATION',
        title: 'Публичная регистрация',
        status: registrationReady
          ? 'READY'
          : targetStore
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: registrationReady ? 'готово' : 'не готово',
        ready: registrationReady,
        metric: registrationReady ? '/game/auth' : 'нужна настройка',
        note: 'Гость должен пройти путь /game/auth -> согласие -> OTP/Telegram/звонок -> выбор клуба без сотруднической авторизации.',
        nextAction: registrationReady
          ? 'Проверить путь на тестовом телефоне и открыть гостевой кабинет клуба.'
          : 'Включить клуб в каталог /game/clubs через флаг геймификации или активное игровое правило.',
        actionHref: targetStore ? targetStoreAuthPath : '/game/auth',
        actionLabel: 'Открыть вход',
      },
      {
        key: 'PUBLIC_GAME_QA',
        title: 'Публичный QA-путь',
        status:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'READY'
            : !targetStore
              ? 'BLOCKED'
              : !registrationReady
                ? 'PARTIAL'
                : !publicAuthReady && !publicAuthPartial
                  ? 'BLOCKED'
                  : 'PARTIAL',
        statusLabel:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'готов к QA'
            : !targetStore
              ? 'нет клуба'
              : !registrationReady
                ? 'нужен каталог'
                : !publicAuthReady && !publicAuthPartial
                  ? 'нет входа'
                  : 'частично',
        ready: Boolean(
          registrationReady && targetStoreCoordinatesReady && publicAuthReady,
        ),
        metric: publicAuthChannels.length
          ? `вход: ${publicAuthChannels.join(' / ')}`
          : 'нет готового входа',
        note: 'Проверяет основной гостевой путь /game/auth -> Telegram contact-share или бесплатный звонок/SMS -> /game/clubs -> /play/game без сотруднической сессии, live Langame reads и ПДн.',
        nextAction:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'Пройти production QA: /game/auth -> вход -> /game/clubs -> /play/game на тестовом телефоне.'
            : !targetStore
              ? 'Создать или включить пилотный клуб в LeetPlus Game.'
              : !registrationReady
                ? 'Включить клуб в публичный игровой каталог через флаг геймификации или активное правило.'
                : !targetStoreCoordinatesReady
                  ? 'Заполнить координаты пилотного клуба перед проверкой /game/clubs и поиска рядом.'
                  : publicAuthPartial
                    ? 'Завершить настройку Telegram polling edge, бесплатного звонка или SMS-резерва и затем пройти /game/auth.'
                    : 'Настроить хотя бы один канал входа: Telegram-бот, бесплатный звонок или SMS-резерв.',
        actionHref:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? '/game/auth'
            : !targetStoreCoordinatesReady
              ? '/stores'
              : '/gamification',
        actionLabel:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'Открыть /game/auth'
            : !targetStoreCoordinatesReady
              ? 'Заполнить координаты'
              : 'Открыть readiness',
      },
      {
        key: 'OTP',
        title: 'OTP-доставка',
        status: otpItem?.status ?? 'BLOCKED',
        statusLabel: otpItem?.statusLabel ?? 'нет данных',
        ready: Boolean(otpItem?.ready),
        metric: otpItem?.enabled ? 'включено' : 'выключено',
        note:
          otpItem?.note ??
          'Для production-пилота нужен явный OTP-канал или контролируемый dev-режим.',
        nextAction:
          otpItem?.nextAction ??
          'Настроить SMS/Telegram/MAX provider или временно согласовать dev OTP.',
      },
      {
        key: 'GAME_PROFILE',
        title: 'Игровой профиль',
        status: activeProfiles.length
          ? 'READY'
          : registrationReady
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: activeProfiles.length ? 'есть профиль' : 'ожидает гостя',
        ready: activeProfiles.length > 0,
        metric: `${activeProfiles.length} активных`,
        note: 'Регистрация не создает общий Guest, а создает отдельный GuestGameProfile для XP, заданий и наград.',
        nextAction: activeProfiles.length
          ? 'Использовать тестовый профиль для dry-run и первого события.'
          : 'Зарегистрировать тестового участника через /game/auth.',
        actionHref: targetStorePayload?.playPath ?? targetStoreGamePath,
        actionLabel: 'Открыть игру',
      },
      {
        key: 'LANGAME_MATCH',
        title: 'Связка с Langame',
        status: linkedProfiles.length
          ? 'READY'
          : activeProfiles.length
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: linkedProfiles.length ? 'связан' : 'нужна сверка',
        ready: linkedProfiles.length > 0,
        metric: `${linkedProfiles.length}/${activeProfiles.length}`,
        note: 'Для бонусной записи нужен связанный Langame-гость или следующий guest foundation sync по phoneHash.',
        nextAction: linkedProfiles.length
          ? 'Перейти к проверке факта сессии и события.'
          : 'В гостевом кабинете нажать ручную проверку Langame или дождаться foundation sync.',
        actionHref: targetStorePayload?.guestPortalPath ?? targetStoreGamePath,
        actionLabel: targetStorePayload ? 'Открыть кабинет' : 'Открыть игру',
      },
      {
        key: 'ACTIVE_RULES',
        title: 'Активные правила',
        status: activeRuleCount ? 'READY' : targetStore ? 'PARTIAL' : 'BLOCKED',
        statusLabel: activeRuleCount ? 'есть сценарии' : 'нет правил',
        ready: activeRuleCount > 0,
        metric: `${activeRuleCount} правил`,
        note: 'Пилоту нужен хотя бы один активный лутбокс, задание или Battle Pass, применимый к клубу.',
        nextAction: activeRuleCount
          ? 'Запустить dry-run по тестовому профилю и пилотному клубу.'
          : 'Создать простое задание или лутбокс для клуба 1337.',
        actionHref: '/gamification?mode=advanced&tab=lootBoxes',
        actionLabel: 'Открыть конструктор',
      },
      {
        key: 'GUEST_LOGS',
        title: 'Факты guests/logs',
        status: guestLogsReady
          ? 'READY'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? 'PARTIAL'
              : 'BLOCKED'
            : guestLogMappings
              ? 'PARTIAL'
              : 'MANUAL_ONLY',
        statusLabel: guestLogsReady
          ? 'типы найдены'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? '0 после sync'
              : 'нужен sync'
            : guestLogMappings
              ? 'ждет sync'
              : guestLogsCheckedEmpty
                ? 'проверено: 0'
                : 'не требуется',
        ready: guestLogsReady,
        metric: guestLogsReady
          ? guestLogsRequiredByRules
            ? `${guestLogRows} логов / ${guestLogTypes} типов / ${guestLogRuleDependencies} правил`
            : `${guestLogRows} логов / ${guestLogTypes} типов`
          : guestLogsRequiredByRules
            ? `0 логов / ${guestLogRuleDependencies} правил`
            : guestLogMappings
              ? `${guestLogMappings} сопоставлений`
              : 'текущие правила без guests/logs',
        note: guestLogsReady
          ? guestLogsRequiredByRules
            ? `Каталог событий готов для ${guestLogRuleDependencies} правил guests/logs: ${guestLogDomains} источников, последнее событие ${guestLogLatestAt ?? 'без даты'}.`
            : `Каталог событий сохранен для будущих заданий и anti-fraud: ${guestLogDomains} источников, последнее событие ${guestLogLatestAt ?? 'без даты'}. Текущие правила могут идти без guests/logs.`
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? `Диагностика guests/logs закрыта: последний успешный foundation sync за ${guestLogLastSync?.businessDate ?? 'последнюю дату'} проверил endpoint и вернул 0 логов. Пилот можно продолжать на правилах без guests/logs, а guests/logs-зависимости считать ожидающими подтверждения payload Langame.`
              : 'Активные правила используют типы guests/logs, но сохраненных фактов пока нет: dry-run по этим правилам будет неполным.'
            : guestLogMappings
              ? 'Словарь типов уже настроен, но текущие активные правила не требуют guests/logs.'
              : guestLogsCheckedEmpty
                ? `Текущие активные правила не требуют guests/logs; последний успешный foundation sync за ${guestLogLastSync?.businessDate ?? 'последнюю дату'} уже проверил endpoint и вернул 0 логов.`
                : 'Текущие активные правила не требуют guests/logs; каталог нужен для будущих заданий и anti-fraud.',
        nextAction: guestLogsReady
          ? 'Скачать CSV каталога и выбрать реальные типы для правил 1337.'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? 'Хвост закрыт: endpoint уже проверен и вернул 0 строк. Для первого бонуса используйте правила без guests/logs; к guests/logs вернуться после подтверждения payload Langame.'
              : 'На /sync включить расширенную проверку guests/logs и дождаться сохраненных фактов перед dry-run.'
            : guestLogsCheckedEmpty
              ? 'Можно запускать dry-run текущих правил; для guests/logs-заданий сначала подтвердить у Langame, почему endpoint возвращает 0 строк.'
              : 'Можно запускать dry-run текущих правил; для расширенных заданий позже заполнить guests/logs на /sync.',
        actionHref: guestLogsReady
          ? '/api/guests/gamification/guest-log-catalog/export'
          : guestLogsRequiredByRules && guestLogsCheckedEmpty
            ? '/gamification?mode=advanced&tab=lootBoxes'
            : '/sync?includeGuestLogs=1',
        actionLabel: guestLogsReady
          ? 'Скачать CSV'
          : guestLogsRequiredByRules && guestLogsCheckedEmpty
            ? 'Открыть конструктор'
            : guestLogsCheckedEmpty
              ? 'Открыть диагностику'
              : 'Открыть /sync',
      },
      {
        key: 'TEST_EVENT',
        title: 'Тестовое событие',
        status: events.length
          ? 'READY'
          : activeRuleCount && linkedProfiles.length
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: events.length ? 'есть история' : 'нужен dry-run',
        ready: events.length > 0,
        metric: `${events.length} событий`,
        note: 'Перед боевым начислением нужно подтвердить dry-run/process-event на сохраненном snapshot-факте или ручном событии.',
        nextAction: events.length
          ? 'Проверить созданные награды и idempotency по событию.'
          : 'Во вкладке тестового запуска выполнить dry-run и подтвердить одно событие.',
      },
      {
        key: 'REWARD_QUEUE',
        title: 'Очередь наград',
        status: readyWalletRewards.length
          ? 'READY'
          : pendingRewards.length || activeRuleCount
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: readyWalletRewards.length
          ? 'готово к выдаче'
          : pendingRewards.length
            ? 'ждет проверки'
            : 'пусто',
        ready: readyWalletRewards.length > 0,
        metric: `${readyWalletRewards.length} готово`,
        note: 'Награда должна появиться в кошельке с кодом кассиру или как approved bonus reward для ledger.',
        nextAction: readyWalletRewards.length
          ? 'Проверить код выдачи или подготовку ledger-записи.'
          : pendingRewards.length
            ? 'Подтвердить тестовую награду или включить auto-approve для безопасного правила.'
            : 'Создать событие, которое формирует награду.',
      },
      {
        key: 'BONUS_LEDGER',
        title: 'Bonus ledger -> Langame',
        status: bonusLedgerAutonomousReady
          ? pilotLedgerPreflight.ready
            ? 'READY'
            : pilotLedgerPreflight.readyCount > 1
              ? 'BLOCKED'
              : 'PARTIAL'
          : langameWriteItem?.ready || bonusLedgerSchedulerItem?.enabled
            ? 'PARTIAL'
            : cashierReady || approvedRewards.length
              ? 'MANUAL_ONLY'
              : 'BLOCKED',
        statusLabel: bonusLedgerAutonomousReady
          ? pilotLedgerPreflight.ready
            ? 'canary ready'
            : pilotLedgerPreflight.readyCount > 1
              ? 'лишние записи'
              : bonusRewards.length
                ? 'ждет ledger'
                : 'ждет бонус'
          : langameWriteItem?.ready
            ? 'нужен scheduler'
            : bonusLedgerSchedulerItem?.enabled
              ? 'нужен write API'
              : 'ручной режим',
        ready: Boolean(
          bonusLedgerAutonomousReady &&
          bonusRewards.length &&
          pilotLedgerPreflight.ready,
        ),
        metric: `${bonusRewards.length} bonus rewards / ${pilotLedgerPreflight.readyCount} ledger ready`,
        note: 'Автономный scheduler должен поставить approved bonus rewards в ledger и отправить их через master endpoint Langame по телефону гостя без админского клика.',
        nextAction: bonusLedgerAutonomousReady
          ? bonusRewards.length
            ? pilotLedgerPreflight.nextAction
            : 'Создать approved-награду с бонусным rewardType для ledger.'
          : langameWriteItem?.ready
            ? 'Включить GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED и сначала прогнать dry-run/canary для 1337.'
            : bonusLedgerSchedulerItem?.enabled
              ? 'После dry-run включить LANGAME_BONUS_ACCRUAL_ENABLED=true для реальной записи в Langame.'
              : 'До включения LANGAME_BONUS_ACCRUAL_ENABLED использовать claim-код или ручную выдачу.',
      },
      {
        key: 'BALANCE_RECONCILIATION',
        title: 'Сверка после начисления',
        status: pilotFirstBonusReconciliation.ready
          ? 'READY'
          : pilotFirstBonusReconciliation.status === 'MISMATCH'
            ? 'BLOCKED'
            : pilotFirstBonusReconciliation.status === 'WAITING_SYNC'
              ? 'PARTIAL'
              : pilotFirstBonusReconciliation.status === 'NO_STORE'
                ? 'BLOCKED'
                : langameWriteItem?.ready && bonusRewards.length
                  ? 'PARTIAL'
                  : 'MANUAL_ONLY',
        statusLabel: pilotFirstBonusReconciliation.statusLabel,
        ready: pilotFirstBonusReconciliation.ready,
        metric: pilotFirstBonusReconciliation.metric,
        note: pilotFirstBonusReconciliation.note,
        nextAction: pilotFirstBonusReconciliation.nextAction,
        actionHref: pilotFirstBonusReconciliation.ledgerEntry
          ? '#bonus-balance-reconciliation'
          : null,
        actionLabel: pilotFirstBonusReconciliation.ledgerEntry
          ? 'Открыть сверку'
          : null,
      },
    ];
    const ready = items.filter((item) => item.status === 'READY').length;
    const partial = items.filter((item) => item.status === 'PARTIAL').length;
    const blocked = items.filter((item) => item.status === 'BLOCKED').length;
    const manualOnly = items.filter(
      (item) => item.status === 'MANUAL_ONLY',
    ).length;
    const readinessPercent = items.length
      ? Math.round(
          ((ready + partial * 0.5 + manualOnly * 0.5) / items.length) * 100,
        )
      : 0;
    const runbook = buildPilotRunbook({
      items,
      activeRuleCount,
      events: events.length,
      approvedRewards: approvedRewards.length,
      readyWalletRewards: readyWalletRewards.length,
      bonusRewards: bonusRewards.length,
      bonusLedgerAutonomousReady,
      ledgerPreflight: pilotLedgerPreflight,
      firstBonusReconciliation: pilotFirstBonusReconciliation,
    });

    return {
      targetStore: targetStorePayload,
      summary: {
        total: items.length,
        ready,
        partial,
        blocked,
        manualOnly,
        readinessPercent,
      },
      items,
      runbook,
      note: 'Пилотный чек-лист показывает путь от публичной регистрации до первого бонуса в Langame по уже сохраненным данным LeetPlus. Он не делает live-запросов и не раскрывает ПДн.',
    };
  }

  private buildIntegrationReadiness(
    deliveries: GuestGameDelivery[],
  ): GuestGameIntegrationReadiness {
    const deliveryConfig = deliveryProviderConfig();
    const dispatcher = this.buildDeliveryDispatcherStatus(deliveries);
    const telegramProvider = dispatcher.providers.find(
      (provider) => provider.channel === 'TELEGRAM',
    );
    const maxProvider = dispatcher.providers.find(
      (provider) => provider.channel === 'MAX',
    );
    const otp = guestPortalOtpReadiness();
    const userCallAuth = guestPortalUserCallAuthReadiness();
    const incomingCallLast4Auth = guestPortalIncomingCallLast4Readiness();
    const telegramBotUsername = envString('GUEST_GAME_TELEGRAM_BOT_USERNAME');
    const telegramLinkSecret =
      envString('GUEST_GAME_TELEGRAM_LINK_SECRET') ??
      envString('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET');
    const telegramWebhookSecret =
      envString('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET') ??
      envString('GUEST_GAME_TELEGRAM_LINK_SECRET');
    const telegramWebhookReplyEnabled = envFlag(
      'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
    );
    const telegramWebhookReplyToken =
      envString('GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN') ??
      envString('GUEST_GAME_TELEGRAM_BOT_TOKEN') ??
      envString('TELEGRAM_BOT_TOKEN');
    const publicWebUrl =
      envString('WEB_URL') ??
      envString('FRONTEND_URL') ??
      envString('NEXT_PUBLIC_WEB_URL') ??
      'https://leetplus.ru';
    const telegramMiniAppUrl =
      envString('GUEST_GAME_TELEGRAM_MINI_APP_URL') ??
      `${publicWebUrl.replace(/\/$/, '')}/game/app`;
    const telegramMiniAppToken =
      envString('GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN') ??
      telegramWebhookReplyToken;
    const telegramMiniAppEdgeSecret = envString(
      'GUEST_GAME_TG_EDGE_SHARED_SECRET',
    );
    const telegramLinkConfigured = Boolean(
      telegramBotUsername && telegramLinkSecret,
    );
    const telegramWebhookConfigured = Boolean(telegramWebhookSecret);
    const telegramDeliveryConfigured = Boolean(
      telegramProvider?.configured && telegramProvider.enabledByEnv,
    );
    const telegramWebhookReplyReady = Boolean(
      telegramWebhookSecret &&
      telegramWebhookReplyEnabled &&
      telegramWebhookReplyToken,
    );
    const telegramEdgeReplyReady = Boolean(
      telegramWebhookSecret && telegramMiniAppEdgeSecret,
    );
    const telegramAuthReplySenderReady =
      telegramWebhookReplyReady || telegramEdgeReplyReady;
    const telegramWebhookReplyRequiredEnv = [
      ...(telegramWebhookSecret ? [] : ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET']),
      ...(telegramEdgeReplyReady || telegramWebhookReplyEnabled
        ? []
        : [
            'GUEST_GAME_TG_EDGE_SHARED_SECRET or GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED',
          ]),
      ...(telegramEdgeReplyReady || telegramWebhookReplyToken
        ? []
        : [
            'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN',
          ]),
    ];
    const telegramWebhookReplyStatus: GuestGameIntegrationReadinessStatus =
      telegramAuthReplySenderReady
        ? 'READY'
        : !telegramWebhookSecret
          ? 'BLOCKED'
          : telegramWebhookReplyEnabled ||
              telegramWebhookReplyToken ||
              telegramMiniAppEdgeSecret
            ? 'PARTIAL'
            : 'MANUAL_ONLY';
    const telegramMiniAppReady = Boolean(
      telegramBotUsername &&
      telegramMiniAppUrl &&
      (telegramMiniAppToken || telegramMiniAppEdgeSecret),
    );
    const telegramMiniAppStatus: GuestGameIntegrationReadinessStatus =
      telegramMiniAppReady
        ? 'READY'
        : telegramBotUsername ||
            telegramMiniAppToken ||
            telegramMiniAppEdgeSecret
          ? 'PARTIAL'
          : 'BLOCKED';
    const telegramMiniAppRequiredEnv = [
      ...(telegramBotUsername ? [] : ['GUEST_GAME_TELEGRAM_BOT_USERNAME']),
      ...(telegramMiniAppToken
        ? []
        : telegramMiniAppEdgeSecret
          ? []
          : [
              'GUEST_GAME_TELEGRAM_MINI_APP_BOT_TOKEN or GUEST_GAME_TG_EDGE_SHARED_SECRET',
            ]),
      ...(telegramMiniAppUrl
        ? []
        : ['GUEST_GAME_TELEGRAM_MINI_APP_URL or WEB_URL']),
    ];
    const maxDeliveryConfigured = Boolean(
      maxProvider?.configured && maxProvider.enabledByEnv,
    );
    const maxDeliveryCanAttempt = Boolean(maxProvider?.canAttemptSend);
    const langameBonusAccrualEnabled = envFlag('LANGAME_BONUS_ACCRUAL_ENABLED');
    const bonusLedgerScheduler = bonusLedgerSchedulerReadiness(
      langameBonusAccrualEnabled,
      this.bonusLedgerSchedulerService.getRuntimeStatus(),
    );
    const items: GuestGameIntegrationReadinessItem[] = [
      {
        key: 'PUBLIC_PORTAL',
        title: 'Публичный гостевой кабинет',
        status: 'READY',
        statusLabel: 'готов',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        note: 'Маршрут /guest/[tenantSlug]/[storeId] работает отдельно от внутреннего кабинета и использует guest-token.',
        nextAction:
          'Проверяйте гостевые ссылки по клубам из блока публичных ссылок ниже.',
      },
      {
        key: 'OTP',
        title: 'OTP-вход гостя',
        status: otp.status,
        statusLabel: otp.statusLabel,
        ready: otp.ready,
        configured: otp.configured,
        enabled: otp.enabled,
        requiredEnv: otp.requiredEnv,
        note: otp.note,
        nextAction: otp.nextAction,
      },
      {
        key: 'OTP_SMS',
        title: 'SMS OTP provider',
        status: otp.sms.status,
        statusLabel: otp.sms.statusLabel,
        ready: otp.sms.ready,
        configured: otp.sms.configured,
        enabled: otp.sms.enabled,
        requiredEnv: otp.sms.requiredEnv,
        details: otp.sms.details,
        note: otp.sms.note,
        nextAction: otp.sms.nextAction,
        runbook: guestAuthFallbackRunbook,
      },
      {
        key: 'OTP_TELEGRAM',
        title: 'Telegram OTP-код (резерв)',
        status: otp.telegram.status,
        statusLabel: otp.telegram.ready
          ? otp.telegram.statusLabel
          : 'резерв · выключен',
        ready: otp.telegram.ready,
        configured: otp.telegram.configured,
        enabled: otp.telegram.enabled,
        requiredEnv: otp.telegram.requiredEnv,
        note: otp.telegram.note,
        nextAction: otp.telegram.nextAction,
      },
      {
        key: 'OTP_MAX',
        title: 'MAX OTP provider',
        status: otp.max.status,
        statusLabel: otp.max.statusLabel,
        ready: otp.max.ready,
        configured: otp.max.configured,
        enabled: otp.max.enabled,
        requiredEnv: otp.max.requiredEnv,
        note: otp.max.note,
        nextAction: otp.max.nextAction,
      },
      userCallAuth,
      incomingCallLast4Auth,
      {
        key: 'TELEGRAM_LINK',
        title: 'Привязка Telegram-бота',
        status: telegramLinkConfigured
          ? 'READY'
          : telegramBotUsername || telegramLinkSecret
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: telegramLinkConfigured
          ? 'готово'
          : telegramBotUsername || telegramLinkSecret
            ? 'частично'
            : 'не настроено',
        ready: telegramLinkConfigured,
        configured: telegramLinkConfigured,
        enabled: Boolean(telegramBotUsername || telegramLinkSecret),
        requiredEnv: [
          'GUEST_GAME_TELEGRAM_BOT_USERNAME',
          'GUEST_GAME_TELEGRAM_LINK_SECRET',
        ],
        note: 'Гость после OTP может создать одноразовый link-code и открыть deep link бота; LeetPlus хранит только chat:<id>.',
        nextAction: telegramLinkConfigured
          ? 'Проверить deep link в гостевом кабинете и 1337 polling edge.'
          : 'Настроить username бота и link secret до публичного запуска привязки.',
      },
      {
        key: 'TELEGRAM_WEBHOOK',
        title: 'Telegram update consumer (polling edge)',
        status: telegramWebhookConfigured ? 'READY' : 'BLOCKED',
        statusLabel: telegramWebhookConfigured ? 'секрет есть' : 'секрет нужен',
        ready: telegramWebhookConfigured,
        configured: telegramWebhookConfigured,
        enabled: telegramWebhookConfigured,
        requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'],
        note: 'Основной API принимает /start link-code, callback query и команды отписки от 1337 polling edge, не хранит raw update и возвращает только safe reply payload.',
        nextAction: telegramWebhookConfigured
          ? 'На 1337 проверить telegram-poller: webhook url=-, затем пройти Telegram canary.'
          : 'Задать update secret и только потом подключать 1337 polling edge к production API.',
      },
      {
        key: 'TELEGRAM_BOT_MENU',
        title: 'Telegram bot menu',
        status: telegramWebhookConfigured ? 'READY' : 'BLOCKED',
        statusLabel: telegramWebhookConfigured
          ? 'callback menu ready'
          : 'secret нужен',
        ready: telegramWebhookConfigured,
        configured: telegramWebhookConfigured,
        enabled: telegramWebhookConfigured,
        requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'],
        details: [
          {
            label: 'Sections',
            value: 'profile / quests / rewards / help',
          },
          {
            label: 'Callback answer',
            value: '1337 edge answerCallbackQuery',
          },
          {
            label: 'Safe payload',
            value: 'без raw text/contact/chat id',
          },
        ],
        note: 'Bot menu строится в основном API из safe game summary; edge только прокидывает callback_data и отправляет opaque replyMarkup.',
        nextAction: telegramWebhookConfigured
          ? 'Проверить /start, /help, bot:profile, bot:quests, bot:rewards и fallback bot:menu через polling edge.'
          : 'Сначала настроить общий update secret между API и 1337 edge.',
        runbook: telegramAuthRunbook,
      },
      {
        key: 'TELEGRAM_AUTH_REPLY_SENDER',
        title: 'Telegram reply sender для входа',
        status: telegramWebhookReplyStatus,
        statusLabel: telegramWebhookReplyReady
          ? 'api sender ready'
          : telegramEdgeReplyReady
            ? 'edge sender ready'
            : telegramWebhookReplyStatus === 'MANUAL_ONLY'
              ? 'adapter-only'
              : telegramWebhookReplyStatus === 'PARTIAL'
                ? 'частично'
                : 'secret нужен',
        ready: telegramAuthReplySenderReady,
        configured: Boolean(
          telegramWebhookReplyToken || telegramEdgeReplyReady,
        ),
        enabled: Boolean(telegramWebhookReplyEnabled || telegramEdgeReplyReady),
        requiredEnv: telegramWebhookReplyRequiredEnv,
        details: [
          {
            label: 'Update secret',
            value: telegramWebhookSecret ? 'секрет есть' : 'секрет нужен',
          },
          {
            label: 'Sender',
            value: telegramWebhookReplyReady
              ? 'API-side'
              : telegramEdgeReplyReady
                ? '1337 polling edge'
                : telegramWebhookReplyEnabled
                  ? 'API-side включен'
                  : 'выключен',
          },
          {
            label: 'Bot token',
            value: telegramWebhookReplyToken
              ? 'на API'
              : telegramEdgeReplyReady
                ? 'на edge'
                : 'нужен для API-side send',
          },
        ],
        note: telegramWebhookReplyReady
          ? 'API сам отправляет Telegram reply payload из текущего update: кнопку request_contact после /start и remove_keyboard после подтверждения. Raw chat_id используется только из текущего update в памяти.'
          : telegramEdgeReplyReady
            ? '1337 polling edge отправляет safe reply payload в Telegram. API-side sender можно включить отдельно, если перенести bot token на основную VDS.'
            : 'LeetPlus возвращает safe reply payload для 1337 edge adapter. Для прямой отправки нужны update secret, env-флаг sender и bot token.',
        nextAction: telegramAuthReplySenderReady
          ? 'Проверить /game/auth -> Telegram deep link -> contact-share на тестовом госте без raw chat id, raw phone и raw update.'
          : 'Добавить недостающие env или оставить 1337 polling edge, который отправляет reply payload.',
        runbook: telegramAuthRunbook,
      },
      {
        key: 'TELEGRAM_MINI_APP',
        title: 'Telegram Mini App',
        status: telegramMiniAppStatus,
        statusLabel: telegramMiniAppReady
          ? 'готов'
          : telegramMiniAppStatus === 'PARTIAL'
            ? 'частично'
            : 'не настроено',
        ready: telegramMiniAppReady,
        configured: Boolean(telegramMiniAppToken || telegramMiniAppEdgeSecret),
        enabled: Boolean(
          telegramBotUsername ||
          telegramMiniAppToken ||
          telegramMiniAppEdgeSecret,
        ),
        requiredEnv: telegramMiniAppRequiredEnv,
        details: [
          {
            label: 'Route',
            value: telegramMiniAppUrl
              ? '/game/app?tab=quests|rewards|profile'
              : 'нужен URL',
          },
          {
            label: 'Bot username',
            value: telegramBotUsername ? 'настроен' : 'нужен',
          },
          {
            label: 'initData token',
            value: telegramMiniAppToken ? 'настроен' : 'edge/shared',
          },
          {
            label: 'Edge assertion',
            value: telegramMiniAppEdgeSecret ? 'настроен' : 'не используется',
          },
        ],
        note: 'Mini App открывает /game/app, поддерживает tab deeplink и выдает обычную guest-session для существующего GuestGameProfile. InitData можно валидировать на API bot token-ом или на отдельной edge VDS с передачей edge assertion.',
        nextAction: telegramMiniAppReady
          ? 'Проверить кнопку Open Mini App после Telegram contact-share и mobile WebView /game/app на тестовом госте.'
          : 'Настроить bot username, Mini App URL и bot token на edge VDS или shared secret для edge assertion.',
        runbook: telegramAuthRunbook,
      },
      {
        key: 'TELEGRAM_DELIVERY',
        title: 'Отправка наград в Telegram',
        status: telegramDeliveryConfigured
          ? 'READY'
          : deliveryConfig.realSendEnabled || telegramProvider?.configured
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: telegramDeliveryConfigured
          ? 'provider готов'
          : deliveryConfig.realSendEnabled || telegramProvider?.configured
            ? 'частично'
            : 'dry-run',
        ready: telegramDeliveryConfigured,
        configured: Boolean(telegramProvider?.configured),
        enabled: Boolean(telegramProvider?.enabledByEnv),
        requiredEnv: telegramProvider?.requiredEnv ?? [
          'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
          'GUEST_GAME_TELEGRAM_DELIVERY_ENABLED',
          'GUEST_GAME_TELEGRAM_BOT_TOKEN',
        ],
        note:
          telegramProvider?.note ??
          'Telegram delivery provider еще не настроен; dispatcher работает безопасно.',
        nextAction:
          'Включать реальную отправку только после согласий, numeric chat_id, bot token и production-аудита outbox.',
      },
      {
        key: 'MAX_DELIVERY',
        title: 'MAX bot / Mini App',
        status: maxDeliveryCanAttempt
          ? 'MANUAL_ONLY'
          : maxDeliveryConfigured
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: maxDeliveryCanAttempt
          ? 'canary разрешен'
          : maxDeliveryConfigured
            ? 'нужен canary'
            : 'не настроено',
        ready: false,
        configured: Boolean(maxProvider?.configured),
        enabled: Boolean(maxProvider?.enabledByEnv),
        requiredEnv: maxProvider?.requiredEnv ?? [
          'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
          'GUEST_GAME_MAX_DELIVERY_ENABLED',
          'GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED',
          'GUEST_GAME_MAX_BOT_TOKEN',
          'GUEST_GAME_MAX_DELIVERY_ENDPOINT',
        ],
        note:
          maxProvider?.note ??
          'MAX остается вторым адаптером: нужна юридическая подготовка и подтвержденный API-контракт.',
        nextAction: maxDeliveryCanAttempt
          ? 'Провести один MAX canary на согласованном госте и проверить SENT/FAILED/BLOCKED audit без raw payload.'
          : maxDeliveryConfigured
            ? 'Включать GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED только после утвержденного endpoint, токена, согласий и обработки отписок.'
            : 'Не включать автоматизацию MAX до утвержденного endpoint, токена, согласий и обработки отписок.',
      },
      bonusLedgerScheduler,
      {
        key: 'LANGAME_WRITE_API',
        title: 'Запись бонусов в Langame',
        status: langameBonusAccrualEnabled ? 'READY' : 'MANUAL_ONLY',
        statusLabel: langameBonusAccrualEnabled
          ? 'master endpoint готов'
          : 'выключено',
        ready: langameBonusAccrualEnabled,
        configured: true,
        enabled: langameBonusAccrualEnabled,
        requiredEnv: ['LANGAME_BONUS_ACCRUAL_ENABLED'],
        note: langameBonusAccrualEnabled
          ? 'Бонусный ledger может начислять bonus_balance или balance через /master_api/guests/balance/phone по телефону гостя.'
          : 'Бонусный ledger готов к Langame master balance endpoint, но боевые списания и начисления выключены env-флагом.',
        nextAction:
          'Включать только после проверки dry-run, tenant Langame ключа и расписания ledger-диспетчера.',
      },
    ];

    return {
      summary: {
        total: items.length,
        ready: items.filter((item) => item.status === 'READY').length,
        partial: items.filter((item) => item.status === 'PARTIAL').length,
        blocked: items.filter((item) => item.status === 'BLOCKED').length,
        manualOnly: items.filter((item) => item.status === 'MANUAL_ONLY')
          .length,
      },
      items,
      note: 'Готовность интеграций показывает, что уже можно тестировать, а что требует внешнего провайдера, секрета, согласий или подтвержденного API. Значения секретов не раскрываются.',
    };
  }

  private async getGuestLogCatalog(
    user: AuthenticatedUser,
    options: { limit?: number | null } = {},
  ): Promise<GuestGameGuestLogCatalog> {
    const limit = options.limit === null ? null : (options.limit ?? 80);
    const [rows, mappings, recentFoundationRuns] = await Promise.all([
      this.prisma.guestLog.groupBy({
        by: ['type', 'externalDomain', 'externalProvider'],
        where: {
          tenantId: user.tenantId,
          type: { not: null },
        },
        _count: { _all: true },
        _max: {
          happenedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.guestGameLogTypeMapping.findMany({
        where: { tenantId: user.tenantId },
        include: guestLogTypeMappingInclude,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.dailyDataCoverage.findMany({
        where: {
          tenantId: user.tenantId,
          scope: DailyDataCoverageScope.GUEST_FOUNDATION,
          status: DailyDataCoverageStatus.SUCCESS,
        },
        select: {
          businessDate: true,
          updatedAt: true,
          sourceCounts: true,
        },
        orderBy: [{ businessDate: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
      }),
    ]);
    const mappedMappings = mappings.map(mapGuestLogTypeMapping);
    const mappingByType = new Map(
      mappedMappings.map((mapping) => [mapping.normalizedType, mapping]),
    );
    const itemMap = new Map<string, GuestLogCatalogItemAccumulator>();

    for (const row of rows) {
      const type = row.type?.trim();
      const normalizedType = type ? normalizeGuestLogType(type) : '';

      if (!type || !normalizedType) {
        continue;
      }

      const count = row._count._all;
      const latestAt = row._max.happenedAt ?? row._max.createdAt ?? null;
      const existing = itemMap.get(normalizedType) ?? {
        type,
        normalizedType,
        count: 0,
        latestAt: null,
        domains: new Map<string, GuestLogCatalogDomainAccumulator>(),
      };

      existing.count += count;
      existing.latestAt = maxDate(existing.latestAt, latestAt);

      const domain = row.externalDomain ?? 'unknown';
      const domainKey = `${row.externalProvider ?? ''}:${domain}`;
      const existingDomain = existing.domains.get(domainKey) ?? {
        domain,
        provider: row.externalProvider ?? null,
        count: 0,
        latestAt: null,
      };

      existingDomain.count += count;
      existingDomain.latestAt = maxDate(existingDomain.latestAt, latestAt);
      existing.domains.set(domainKey, existingDomain);
      itemMap.set(normalizedType, existing);
    }

    const sortedItems = [...itemMap.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return (right.latestAt?.getTime() ?? 0) - (left.latestAt?.getTime() ?? 0);
    });
    const visibleItems =
      limit === null ? sortedItems : sortedItems.slice(0, limit);
    const items = visibleItems.map((item) => ({
      type: item.type,
      normalizedType: item.normalizedType,
      count: item.count,
      latestAt: item.latestAt?.toISOString() ?? null,
      domains: [...item.domains.values()]
        .sort((left, right) => right.count - left.count)
        .map((domain) => ({
          domain: domain.domain,
          provider: domain.provider,
          count: domain.count,
          latestAt: domain.latestAt?.toISOString() ?? null,
        })),
      mapping: mappingByType.get(item.normalizedType) ?? null,
    }));
    const latestAt = items.reduce<Date | null>((latest, item) => {
      const value = item.latestAt ? new Date(item.latestAt) : null;

      return maxDate(latest, value);
    }, null);
    const domains = new Set(
      items.flatMap((item) => item.domains.map((domain) => domain.domain)),
    );
    const lastSuccessfulSync =
      recentFoundationRuns
        .map((run) => {
          const counts = jsonRecord(run.sourceCounts);
          const guestLogs = finiteJsonNumber(counts.guestLogs);

          if (guestLogs === null) {
            return null;
          }

          return {
            businessDate: run.businessDate.toISOString().slice(0, 10),
            updatedAt: run.updatedAt.toISOString(),
            guestLogs,
            sources: finiteJsonNumber(counts.sources),
            failedSources: finiteJsonNumber(counts.failedSources),
          };
        })
        .find((run) => run !== null) ?? null;

    return {
      items,
      mappings: mappedMappings,
      summary: {
        types: items.length,
        logs: items.reduce((sum, item) => sum + item.count, 0),
        domains: domains.size,
        latestAt: latestAt?.toISOString() ?? null,
        lastSuccessfulSync,
      },
    };
  }

  async exportGuestLogCatalogCsv(user: AuthenticatedUser): Promise<string> {
    const catalog = await this.getGuestLogCatalog(user, { limit: null });
    const header = [
      'Раздел',
      'Raw тип guests/logs',
      'Нормализованный тип',
      'Название в LeetPlus',
      'Бизнес-пресет',
      'Применение',
      'Логи всего',
      'Домен',
      'Провайдер',
      'Логи в источнике',
      'Последняя активность',
      'Заметка',
      'Маппинг обновлен',
    ];
    const rows: unknown[][] = [];
    const exportedTypes = new Set<string>();

    for (const item of catalog.items) {
      exportedTypes.add(item.normalizedType);
      const domains = item.domains.length
        ? item.domains
        : [
            {
              domain: '',
              provider: null,
              count: 0,
              latestAt: null,
            },
          ];

      for (const domain of domains) {
        rows.push([
          'Факт guests/logs',
          item.type,
          item.normalizedType,
          item.mapping?.label ?? '',
          guestLogMappingPresetLabel(item.mapping?.preset),
          guestLogMappingIntentLabel(item.mapping?.intent),
          item.count,
          domain.domain,
          domain.provider ?? '',
          domain.count,
          domain.latestAt ?? item.latestAt ?? '',
          item.mapping?.note ?? '',
          item.mapping?.updatedAt ?? '',
        ]);
      }
    }

    for (const mapping of catalog.mappings) {
      if (exportedTypes.has(mapping.normalizedType)) {
        continue;
      }

      rows.push([
        'Маппинг без факта',
        mapping.rawType,
        mapping.normalizedType,
        mapping.label,
        guestLogMappingPresetLabel(mapping.preset),
        guestLogMappingIntentLabel(mapping.intent),
        0,
        '',
        '',
        0,
        '',
        mapping.note ?? '',
        mapping.updatedAt,
      ]);
    }

    return [
      '\uFEFF' + header.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async upsertGuestLogTypeMapping(
    user: AuthenticatedUser,
    dto: GuestGameGuestLogTypeMappingDto,
  ): Promise<GuestGameGuestLogTypeMapping> {
    const rawType = stringValue(dto.rawType);

    if (!rawType) {
      throw new BadRequestException('Укажите raw-тип события guests/logs');
    }

    const normalizedType = normalizeGuestLogType(rawType);

    if (!normalizedType) {
      throw new BadRequestException('Не удалось нормализовать тип события');
    }

    const label = stringValue(dto.label) ?? rawType;
    const row = await this.prisma.guestGameLogTypeMapping.upsert({
      where: {
        tenantId_normalizedType: {
          tenantId: user.tenantId,
          normalizedType,
        },
      },
      create: {
        tenantId: user.tenantId,
        createdByUserId: actorUserId(user),
        updatedByUserId: user.id,
        rawType,
        normalizedType,
        label,
        preset: normalizeGuestLogMappingPreset(dto.preset),
        intent: normalizeGuestLogMappingIntent(dto.intent),
        note: nullableString(dto.note),
      },
      update: {
        rawType,
        label,
        preset: normalizeGuestLogMappingPreset(dto.preset),
        intent: normalizeGuestLogMappingIntent(dto.intent),
        note: nullableString(dto.note),
        updatedByUserId: user.id,
      },
      include: guestLogTypeMappingInclude,
    });

    return mapGuestLogTypeMapping(row);
  }

  async deleteGuestLogTypeMapping(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ deleted: true }> {
    const existing = await this.prisma.guestGameLogTypeMapping.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Сопоставление типа события не найдено');
    }

    await this.prisma.guestGameLogTypeMapping.delete({ where: { id } });

    return { deleted: true };
  }

  private async getTariffSnapshots(
    user: AuthenticatedUser,
  ): Promise<GuestGameTariffSnapshotEndpoint[]> {
    const endpointKeys = tariffSnapshotDefinitions.map(
      (definition) => definition.endpointKey,
    );
    const [activeSourcesCount, runs, typedItemCounts, typedItems] =
      await Promise.all([
        this.prisma.integrationSource.count({
          where: {
            tenantId: user.tenantId,
            provider: IntegrationProvider.LANGAME,
            isActive: true,
          },
        }),
        this.prisma.langameEndpointSnapshotRun.findMany({
          where: {
            tenantId: user.tenantId,
            provider: IntegrationProvider.LANGAME,
            endpointKey: { in: [...endpointKeys] },
          },
          select: {
            id: true,
            domain: true,
            endpointKey: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            rowCount: true,
            payloadKind: true,
            fieldKeys: true,
            snapshot: true,
            errorMessage: true,
          },
          orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
          take: 80,
        }),
        this.prisma.langameTariffSnapshotItem.groupBy({
          by: ['endpointKey'],
          where: {
            tenantId: user.tenantId,
            provider: IntegrationProvider.LANGAME,
            endpointKey: { in: [...endpointKeys] },
          },
          _count: { _all: true },
        }),
        this.prisma.langameTariffSnapshotItem.findMany({
          where: {
            tenantId: user.tenantId,
            provider: IntegrationProvider.LANGAME,
            endpointKey: { in: [...endpointKeys] },
          },
          select: {
            id: true,
            domain: true,
            endpointKey: true,
            externalId: true,
            name: true,
            label: true,
            kind: true,
            fieldKeys: true,
            startedAt: true,
            createdAt: true,
          },
          orderBy: [
            { endpointKey: 'asc' },
            { startedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 400,
        }),
      ]);
    const latestRuns: typeof runs = [];
    const seen = new Set<string>();
    const typedCountByEndpoint = new Map(
      typedItemCounts.map((item) => [item.endpointKey, item._count._all]),
    );

    for (const run of runs) {
      const key = `${run.endpointKey}:${run.domain}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      latestRuns.push(run);
    }

    return tariffSnapshotDefinitions.map((definition) => {
      const endpointRuns = latestRuns.filter(
        (run) => run.endpointKey === definition.endpointKey,
      );
      const readySources = endpointRuns.filter(
        (run) => run.status === 'SUCCESS',
      ).length;
      const failedSources = endpointRuns.filter(
        (run) => run.status !== 'SUCCESS',
      ).length;
      const totalSources = Math.max(activeSourcesCount, endpointRuns.length);
      const latestTime = endpointRuns.reduce((latest, run) => {
        const time = run.finishedAt?.getTime() ?? run.startedAt.getTime();

        return Number.isNaN(time) ? latest : Math.max(latest, time);
      }, 0);
      const status = tariffSnapshotStatus({
        totalSources,
        checkedSources: endpointRuns.length,
        readySources,
        failedSources,
        latestTime,
      });
      const endpointTypedItems: typeof typedItems = [];
      const typedItemKeys = new Set<string>();

      for (const item of typedItems) {
        if (item.endpointKey !== definition.endpointKey) {
          continue;
        }

        const typedKey = [
          item.endpointKey,
          item.domain,
          item.externalId ?? '',
          item.label ?? item.name ?? '',
          item.kind ?? '',
        ].join(':');

        if (typedItemKeys.has(typedKey)) {
          continue;
        }

        typedItemKeys.add(typedKey);
        endpointTypedItems.push(item);

        if (endpointTypedItems.length >= 60) {
          break;
        }
      }

      return {
        ...definition,
        status,
        totalSources,
        readySources,
        failedSources,
        rowCount: endpointRuns.reduce((sum, run) => sum + run.rowCount, 0),
        latestAt: latestTime > 0 ? new Date(latestTime).toISOString() : null,
        fieldKeys: uniqueStrings(
          endpointRuns.flatMap((run) => jsonStringArray(run.fieldKeys)),
        ),
        typedItemsCount:
          typedCountByEndpoint.get(definition.endpointKey) ??
          endpointTypedItems.length,
        typedItems: endpointTypedItems.map((item) => ({
          id: item.id,
          domain: item.domain,
          externalId: item.externalId,
          name: item.name,
          label: item.label,
          kind: item.kind,
          fieldKeys: jsonStringArray(item.fieldKeys),
          startedAt: item.startedAt.toISOString(),
        })),
        nextAction: tariffSnapshotNextAction(status),
        sources: endpointRuns.map((run) => ({
          id: run.id,
          domain: run.domain,
          status: run.status,
          rowCount: run.rowCount,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          payloadKind: run.payloadKind,
          fieldKeys: jsonStringArray(run.fieldKeys),
          summary: snapshotSummary(run.snapshot),
          errorMessage: run.errorMessage,
        })),
      };
    });
  }

  async getSnapshotFacts(
    user: AuthenticatedUser,
  ): Promise<GuestGameSnapshotFactsResult> {
    const [
      sessions,
      logs,
      transactions,
      operationLogs,
      balances,
      bonusBalances,
      loyaltyGuests,
      guestGroups,
      productExpenses,
      referralEvents,
    ] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: { tenantId: user.tenantId, startedAt: { not: null } },
        select: snapshotSessionSelect,
        // A session gets its duration and stop time only after the next
        // Langame synchronization. Order by that synchronization update so a
        // just-finished session cannot be hidden behind newer session starts.
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.prisma.guestLog.findMany({
        where: { tenantId: user.tenantId, happenedAt: { not: null } },
        select: snapshotLogSelect,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      this.prisma.guestTransaction.findMany({
        where: { tenantId: user.tenantId, happenedAt: { not: null } },
        select: snapshotTransactionSelect,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.prisma.guestOperationLog.findMany({
        where: { tenantId: user.tenantId, happenedAt: { not: null } },
        select: snapshotOperationLogSelect,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.prisma.guestBalanceSnapshot.findMany({
        where: { tenantId: user.tenantId },
        select: snapshotBalanceSelect,
        orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      }),
      this.prisma.guestBonusBalanceSnapshot.findMany({
        where: { tenantId: user.tenantId },
        select: snapshotBonusBalanceSelect,
        orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
        take: 25,
      }),
      this.prisma.guest.findMany({
        where: { tenantId: user.tenantId, externalGuestTypeId: { not: null } },
        select: snapshotLoyaltyGuestSelect,
        orderBy: [{ updatedAt: 'desc' }],
        take: 25,
      }),
      this.prisma.guestGroup.findMany({
        where: { tenantId: user.tenantId },
        select: snapshotGuestGroupSelect,
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId: user.tenantId,
          guestId: { not: null },
          isCanceled: false,
          revenue: { gt: 0 },
          quantity: { gt: 0 },
        },
        select: snapshotProductExpenseSelect,
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
      this.prisma.guestGameEvent.findMany({
        where: {
          tenantId: user.tenantId,
          eventType: 'GAME_REFERRAL_ACCEPTED',
          source: 'GUEST_PORTAL_REFERRAL',
        },
        select: snapshotReferralEventSelect,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
    ]);
    const guestGroupMap = new Map(
      guestGroups.map((group) => [snapshotGroupKey(group), group]),
    );
    const referralPayloads = referralEvents.map((event) =>
      jsonRecord(event.payload),
    );
    const referralProfileIds = uniqueStrings(
      referralPayloads
        .map((payload) => nullableString(payload.inviterProfileId))
        .filter((id): id is string => Boolean(id)),
    );
    const referralStoreIds = uniqueStrings(
      referralPayloads
        .map((payload) => nullableString(payload.storeId))
        .filter((id): id is string => Boolean(id)),
    );
    const [referralProfiles, referralStores] = await Promise.all([
      referralProfileIds.length
        ? this.prisma.guestGameProfile.findMany({
            where: { tenantId: user.tenantId, id: { in: referralProfileIds } },
            select: snapshotGameProfileSelect,
          })
        : Promise.resolve([] as SnapshotGameProfileRow[]),
      referralStoreIds.length
        ? this.prisma.store.findMany({
            where: { tenantId: user.tenantId, id: { in: referralStoreIds } },
            select: snapshotStoreSelect,
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);
    const referralProfileMap = new Map(
      referralProfiles.map((profile) => [profile.id, profile]),
    );
    const referralStoreMap = new Map(
      referralStores.map((store) => [store.id, store]),
    );
    const referralFacts = referralEvents.flatMap((event) =>
      mapReferralFact(event, referralProfileMap, referralStoreMap),
    );
    const productConfigurations = productExpenses.length
      ? await this.prisma.langameClubProductConfiguration.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            storeId: {
              in: uniqueStrings(
                productExpenses.map((row) => row.store?.id ?? ''),
              ),
            },
            externalProductId: {
              in: uniqueStrings(
                productExpenses.map((row) => row.externalProductId ?? ''),
              ),
            },
          },
          select: {
            storeId: true,
            externalDomain: true,
            externalProductId: true,
            externalGroupId: true,
          },
        })
      : [];
    const configurationGroupRefs = productConfigurations
      .filter((row): row is typeof row & { externalGroupId: string } =>
        Boolean(row.externalGroupId),
      )
      .map((row) => ({
        externalDomain: row.externalDomain,
        externalGroupId: row.externalGroupId,
      }));
    const productGroupRows = configurationGroupRefs.length
      ? await this.prisma.langameProductGroup.findMany({
          where: {
            tenantId: user.tenantId,
            OR: configurationGroupRefs,
          },
          select: {
            externalDomain: true,
            externalGroupId: true,
            name: true,
          },
        })
      : [];
    const productGroupNames = new Map(
      productGroupRows.map((row) => [
        `${row.externalDomain}:${row.externalGroupId}`,
        row.name,
      ]),
    );
    const productCategoryMappings = new Map<
      string,
      ExternalProductCategoryMapping
    >();
    productConfigurations.forEach((row) => {
      if (!row.externalGroupId) return;
      const externalCategoryKey = `${row.externalDomain}:${row.externalGroupId}`;
      productCategoryMappings.set(
        `${row.storeId}:${row.externalDomain}:${row.externalProductId}`,
        {
          externalCategoryKey,
          externalCategoryId: row.externalGroupId,
          externalCategoryName:
            productGroupNames.get(externalCategoryKey) ?? null,
        },
      );
    });

    const facts = [
      ...sessions.flatMap(mapSessionFacts),
      ...logs.flatMap(mapLogFact),
      ...transactions.flatMap(mapTransactionFact),
      ...operationLogs.flatMap(mapOperationLogFact),
      ...balances.flatMap(mapBalanceFact),
      ...bonusBalances.flatMap(mapBonusBalanceFact),
      ...loyaltyGuests.flatMap((guest) =>
        mapLoyaltyGroupFact(
          guest,
          guest.externalGuestTypeId
            ? (guestGroupMap.get(
                snapshotGroupKey({
                  externalProvider: guest.externalProvider,
                  externalDomain: guest.externalDomain,
                  externalGroupId: guest.externalGuestTypeId,
                }),
              ) ?? null)
            : null,
        ),
      ),
      ...productExpenses.flatMap((row) =>
        mapProductExpenseFact(row, productCategoryMappings),
      ),
      ...referralFacts,
    ]
      .sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime(),
      )
      .slice(0, 90);

    return {
      facts,
      summary: {
        sessions: sessions.length,
        logs: logs.length,
        transactions: transactions.length,
        operationLogs: operationLogs.length,
        balances: balances.length,
        bonusBalances: bonusBalances.length,
        loyaltyGroups: loyaltyGuests.length,
        productExpenses: productExpenses.length,
        referrals: referralFacts.length,
        latestAt: facts[0]?.occurredAt ?? null,
      },
    };
  }

  private snapshotPipelineBackfillMode(): SnapshotPipelineBackfillMode {
    const configured = nullableString(
      this.configService.get<string>('GUEST_GAME_PIPELINE_BACKFILL_MODE'),
    )?.toUpperCase();

    return configured === 'SHADOW' || configured === 'LIVE'
      ? configured
      : 'OFF';
  }

  private strictConfigBoolean(key: string): boolean | null {
    const configured = nullableString(
      this.configService.get<string>(key),
    )?.toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(configured ?? '')) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(configured ?? '')) {
      return false;
    }

    return null;
  }

  private snapshotPipelineBackfillLiveNotBefore(): {
    configured: boolean;
    value: Date | null;
  } {
    const configured = nullableString(
      this.configService.get<string>(
        'GUEST_GAME_PIPELINE_BACKFILL_LIVE_NOT_BEFORE',
      ),
    );
    if (!configured) {
      return { configured: false, value: null };
    }

    // Require an explicit timezone. A server-local timestamp would make a
    // canary cutoff change meaning between environments.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(configured)) {
      return { configured: true, value: null };
    }

    const parsed = new Date(configured);
    return {
      configured: true,
      value: Number.isFinite(parsed.getTime()) ? parsed : null,
    };
  }

  private async snapshotPipelineBackfillPolicy(
    user: AuthenticatedUser,
  ): Promise<SnapshotPipelineBackfillPolicy> {
    const mode = this.snapshotPipelineBackfillMode();
    const disabled = (
      profileId: string | null = null,
      liveNotBefore: Date | null = null,
    ): SnapshotPipelineBackfillPolicy => ({
      mode,
      enabled: false,
      profileId,
      profileGuestIds: [],
      liveNotBefore,
    });

    if (mode === 'OFF') {
      return disabled();
    }

    // The historical anti-join is intentionally opt-in twice: a valid mode
    // plus an explicitly false kill switch. Missing or unknown boolean text
    // therefore stops the backfill instead of silently enabling it.
    if (
      this.strictConfigBoolean('GUEST_GAME_PIPELINE_BACKFILL_KILL_SWITCH') !==
      false
    ) {
      return disabled();
    }

    const tenantId = nullableString(
      this.configService.get<string>('GUEST_GAME_PIPELINE_BACKFILL_TENANT_ID'),
    );
    const tenantSlug = nullableString(
      this.configService.get<string>(
        'GUEST_GAME_PIPELINE_BACKFILL_TENANT_SLUG',
      ),
    );
    const tenantConfigured = Boolean(tenantId || tenantSlug);
    const tenantMatches =
      tenantConfigured &&
      (!tenantId || tenantId === user.tenantId) &&
      (!tenantSlug ||
        tenantSlug.toLowerCase() === user.tenantSlug.toLowerCase());

    if (!tenantMatches) {
      return disabled();
    }

    const profileId = nullableString(
      this.configService.get<string>('GUEST_GAME_PIPELINE_BACKFILL_PROFILE_ID'),
    );
    const liveCutoff = this.snapshotPipelineBackfillLiveNotBefore();
    const allowTenantWide =
      this.strictConfigBoolean(
        'GUEST_GAME_PIPELINE_BACKFILL_ALLOW_TENANT_WIDE',
      ) === true;

    if (liveCutoff.configured && !liveCutoff.value) {
      return disabled(profileId);
    }

    if (
      mode === 'LIVE' &&
      (!liveCutoff.value || (!profileId && !allowTenantWide))
    ) {
      return disabled(profileId, liveCutoff.value);
    }

    if (!profileId) {
      return {
        mode,
        enabled: true,
        profileId: null,
        profileGuestIds: [],
        liveNotBefore: liveCutoff.value,
      };
    }

    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { tenantId: user.tenantId, id: profileId },
      select: { guestId: true },
    });
    if (!profile) {
      return disabled(profileId, liveCutoff.value);
    }
    const profileGuestIds = await this.resolveProfileIdentityGuestIds(user, {
      profileId,
      legacyGuestId: profile.guestId,
    });
    if (!profileGuestIds.length) {
      return disabled(profileId, liveCutoff.value);
    }

    return {
      mode,
      enabled: true,
      profileId,
      profileGuestIds,
      liveNotBefore: liveCutoff.value,
    };
  }

  private async loadPendingPrimarySnapshotFacts(
    user: AuthenticatedUser,
    limit: number,
    source: GuestGameSnapshotFact['source'] | null,
    policy: SnapshotPipelineBackfillPolicy,
  ): Promise<GuestGameSnapshotFact[]> {
    if (!policy.enabled || policy.mode === 'OFF') {
      return [];
    }

    const includeSessions = !source || source === 'GUEST_SESSION';
    const includePurchases = !source || source === 'PRODUCT_EXPENSE';

    if (!includeSessions && !includePurchases) {
      return [];
    }

    const boundedLookbackCutoff = new Date(
      Date.now() -
        this.configMilliseconds(
          'GUEST_GAME_PIPELINE_BACKFILL_LOOKBACK_MS',
          snapshotPipelineBackfillLookbackDefaultMs,
          snapshotPipelineBackfillLookbackMinMs,
          snapshotPipelineBackfillLookbackMaxMs,
        ),
    );
    const cutoff =
      policy.liveNotBefore &&
      policy.liveNotBefore.getTime() > boundedLookbackCutoff.getTime()
        ? policy.liveNotBefore
        : boundedLookbackCutoff;

    const [sessionFacts, purchaseFacts] = await Promise.all([
      includeSessions
        ? this.loadPendingSessionSnapshotFacts(
            user,
            limit,
            cutoff,
            policy.profileGuestIds,
          )
        : Promise.resolve([] as GuestGameSnapshotFact[]),
      includePurchases
        ? this.loadPendingProductExpenseSnapshotFacts(
            user,
            limit,
            cutoff,
            policy.profileGuestIds,
          )
        : Promise.resolve([] as GuestGameSnapshotFact[]),
    ]);

    return interleaveSnapshotFacts([sessionFacts, purchaseFacts])
      .filter((fact) => {
        if (!policy.liveNotBefore) return true;
        const occurredAt = new Date(fact.occurredAt);
        return (
          Number.isFinite(occurredAt.getTime()) &&
          occurredAt.getTime() >= policy.liveNotBefore.getTime()
        );
      })
      .slice(0, limit);
  }

  private async loadPendingSessionSnapshotFacts(
    user: AuthenticatedUser,
    limit: number,
    cutoff: Date,
    profileGuestIds: string[] = [],
  ): Promise<GuestGameSnapshotFact[]> {
    const scopedGuestIds = uniqueStrings(profileGuestIds);
    const profileScope = scopedGuestIds.length
      ? Prisma.sql`AND session."guestId" IN (${Prisma.join(scopedGuestIds)})`
      : Prisma.sql``;
    const pendingRows =
      (await this.prisma.$queryRaw<
        Array<{
          id: string;
          needsSessionStart: boolean;
          needsPlayHour: boolean;
          needsPackageCorrection: boolean;
        }>
      >(Prisma.sql`
        SELECT
          session."id",
          pending."needsSessionStart" AS "needsSessionStart",
          pending."needsPlayHour" AS "needsPlayHour",
          pending."needsPackageCorrection" AS "needsPackageCorrection"
        FROM "GuestSession" session
        CROSS JOIN LATERAL (
          SELECT
            NOT EXISTS (
              SELECT 1
              FROM "GuestGameEvent" event
              WHERE event."tenantId" = session."tenantId"
                AND event."source" = 'API_IMPORT'
                AND event."externalProvider" = COALESCE(
                  session."externalProvider",
                  'LANGAME'::"IntegrationProvider"
                )
                AND event."externalDomain" = COALESCE(
                  session."externalDomain",
                  'guest-gamification-snapshot'
                )
                AND event."externalId" = CONCAT(
                  'guest-game:GUEST_SESSION:SESSION_START:',
                  session."externalSessionId"
                )
            ) AS "needsSessionStart",
            (
              session."stoppedAt" > session."startedAt"
              AND NOT EXISTS (
                SELECT 1
                FROM "GuestGameEvent" event
                WHERE event."tenantId" = session."tenantId"
                  AND event."source" = 'API_IMPORT'
                  AND event."externalProvider" = COALESCE(
                    session."externalProvider",
                    'LANGAME'::"IntegrationProvider"
                  )
                  AND event."externalDomain" = COALESCE(
                    session."externalDomain",
                    'guest-gamification-snapshot'
                  )
                  AND event."externalId" = CONCAT(
                    'guest-game:GUEST_SESSION:PLAY_HOUR:',
                    session."externalSessionId"
                  )
              )
            ) AS "needsPlayHour",
            (
              session."packet" = true
              AND EXISTS (
                SELECT 1
                FROM "GuestGameEvent" event
                WHERE event."tenantId" = session."tenantId"
                  AND event."source" = 'API_IMPORT'
                  AND event."externalProvider" = COALESCE(
                    session."externalProvider",
                    'LANGAME'::"IntegrationProvider"
                  )
                  AND event."externalDomain" = COALESCE(
                    session."externalDomain",
                    'guest-gamification-snapshot'
                  )
                  AND event."externalId" = CONCAT(
                    'guest-game:GUEST_SESSION:SESSION_START:',
                    session."externalSessionId"
                  )
                  AND (
                    event."payload" #>> '{input,sessionPacket}' = 'false'
                    OR LOWER(
                      COALESCE(
                        event."payload" #>> '{input,sessionType}',
                        ''
                      )
                    ) = 'regular_session'
                  )
              )
              AND NOT EXISTS (
                SELECT 1
                FROM "GuestGameEvent" event
                WHERE event."tenantId" = session."tenantId"
                  AND event."source" = 'API_IMPORT'
                  AND event."externalProvider" = COALESCE(
                    session."externalProvider",
                    'LANGAME'::"IntegrationProvider"
                  )
                  AND event."externalDomain" = COALESCE(
                    session."externalDomain",
                    'guest-gamification-snapshot'
                  )
                  AND event."externalId" = CONCAT(
                    'guest-game:GUEST_SESSION:SESSION_START:',
                    session."externalSessionId",
                    ':classification:',
                    ${snapshotSessionPackageCorrectionVersion}
                  )
              )
            ) AS "needsPackageCorrection"
        ) pending
        WHERE session."tenantId" = ${user.tenantId}
          AND session."guestId" IS NOT NULL
          AND session."startedAt" IS NOT NULL
          AND (
            session."startedAt" >= ${cutoff}
            OR session."stoppedAt" >= ${cutoff}
          )
          ${profileScope}
          AND (
            pending."needsSessionStart"
            OR pending."needsPlayHour"
            OR pending."needsPackageCorrection"
          )
        ORDER BY session."updatedAt" DESC, session."createdAt" DESC, session."id" DESC
        LIMIT ${limit}
      `)) ?? [];
    const ids = allUniqueStrings(pendingRows.map((row) => row.id));

    if (!ids.length) {
      return [];
    }

    const rows = await this.prisma.guestSession.findMany({
      where: { tenantId: user.tenantId, id: { in: ids } },
      select: snapshotSessionSelect,
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    const pendingById = new Map(pendingRows.map((row) => [row.id, row]));

    return ids.flatMap((id) => {
      const row = rowsById.get(id);
      const pending = pendingById.get(id);
      if (!row || !pending) return [];

      // Older unit-test delegates returned only the id. Preserve their
      // historical all-facts behavior while production uses the explicit
      // anti-join flags above to avoid spending a batch slot on a duplicate
      // SESSION_START before the final PLAY_HOUR fact.
      const hasExplicitFlags =
        typeof pending.needsSessionStart === 'boolean' &&
        typeof pending.needsPlayHour === 'boolean' &&
        typeof pending.needsPackageCorrection === 'boolean';
      const facts = mapSessionFacts(row).filter(
        (fact) =>
          !hasExplicitFlags ||
          (fact.eventType === 'SESSION_START'
            ? pending.needsSessionStart
            : fact.eventType === 'PLAY_HOUR'
              ? pending.needsPlayHour
              : false),
      );

      if (pending.needsPackageCorrection) {
        facts.push(mapSessionPackageCorrectionFact(row));
      }

      return facts;
    });
  }

  private async loadPendingProductExpenseSnapshotFacts(
    user: AuthenticatedUser,
    limit: number,
    cutoff: Date,
    profileGuestIds: string[] = [],
  ): Promise<GuestGameSnapshotFact[]> {
    const scopedGuestIds = uniqueStrings(profileGuestIds);
    const profileScope = scopedGuestIds.length
      ? Prisma.sql`AND sale."guestId" IN (${Prisma.join(scopedGuestIds)})`
      : Prisma.sql``;
    const pendingRows =
      (await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT sale."id"
        FROM "SalesFact" sale
        WHERE sale."tenantId" = ${user.tenantId}
          AND sale."guestId" IS NOT NULL
          AND sale."isCanceled" = false
          AND sale."revenue" > 0
          AND sale."quantity" > 0
          AND sale."saleDate" >= ${cutoff}
          ${profileScope}
          AND NOT EXISTS (
            SELECT 1
            FROM "GuestGameEvent" event
            WHERE event."tenantId" = sale."tenantId"
              AND event."source" = 'API_IMPORT'
              AND event."externalProvider" = COALESCE(
                sale."externalProvider",
                'LANGAME'::"IntegrationProvider"
              )
              AND event."externalDomain" = COALESCE(
                sale."externalDomain",
                'guest-gamification-snapshot'
              )
              AND event."externalId" = CONCAT(
                'guest-game:PRODUCT_EXPENSE:PRODUCT_PURCHASE:',
                COALESCE(
                  sale."externalSaleId",
                  CONCAT('product-expense:', sale."id")
                )
              )
          )
        ORDER BY sale."saleDate" DESC, sale."createdAt" DESC, sale."id" DESC
        LIMIT ${limit}
      `)) ?? [];
    const ids = allUniqueStrings(pendingRows.map((row) => row.id));

    if (!ids.length) {
      return [];
    }

    const rows = await this.prisma.salesFact.findMany({
      where: { tenantId: user.tenantId, id: { in: ids } },
      select: snapshotProductExpenseSelect,
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = ids
      .map((id) => rowsById.get(id))
      .filter((row): row is SnapshotProductExpenseRow => Boolean(row));
    const productConfigurations = orderedRows.length
      ? await this.prisma.langameClubProductConfiguration.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            storeId: {
              in: allUniqueStrings(
                orderedRows.map((row) => row.store?.id ?? ''),
              ),
            },
            externalProductId: {
              in: allUniqueStrings(
                orderedRows.map((row) => row.externalProductId ?? ''),
              ),
            },
          },
          select: {
            storeId: true,
            externalDomain: true,
            externalProductId: true,
            externalGroupId: true,
          },
        })
      : [];
    const groupRefs = productConfigurations
      .filter((row): row is typeof row & { externalGroupId: string } =>
        Boolean(row.externalGroupId),
      )
      .map((row) => ({
        externalDomain: row.externalDomain,
        externalGroupId: row.externalGroupId,
      }));
    const groupRows = groupRefs.length
      ? await this.prisma.langameProductGroup.findMany({
          where: { tenantId: user.tenantId, OR: groupRefs },
          select: {
            externalDomain: true,
            externalGroupId: true,
            name: true,
          },
        })
      : [];
    const groupNames = new Map(
      groupRows.map((row) => [
        `${row.externalDomain}:${row.externalGroupId}`,
        row.name,
      ]),
    );
    const categoryMappings = new Map<string, ExternalProductCategoryMapping>();

    productConfigurations.forEach((row) => {
      if (!row.externalGroupId) return;
      const externalCategoryKey = `${row.externalDomain}:${row.externalGroupId}`;
      categoryMappings.set(
        `${row.storeId}:${row.externalDomain}:${row.externalProductId}`,
        {
          externalCategoryKey,
          externalCategoryId: row.externalGroupId,
          externalCategoryName: groupNames.get(externalCategoryKey) ?? null,
        },
      );
    });

    return orderedRows.flatMap((row) =>
      mapProductExpenseFact(row, categoryMappings),
    );
  }

  async runSnapshotPipeline(
    user: AuthenticatedUser,
    dto: GuestGamePipelineRunDto,
  ): Promise<GuestGamePipelineRunResult> {
    const source = pipelineSourceValue(dto.source);
    const limit = Math.min(30, Math.max(1, intValue(dto.limit) ?? 20));
    const dryRunOnly = booleanValue(dto.dryRunOnly);
    const [factsResult, backfillPolicy] = await Promise.all([
      this.getSnapshotFacts(user),
      this.snapshotPipelineBackfillPolicy(user),
    ]);
    const pendingPrimaryFacts = backfillPolicy.enabled
      ? await this.loadPendingPrimarySnapshotFacts(
          user,
          limit,
          source,
          backfillPolicy,
        )
      : [];
    const latestSnapshotFactKeys = new Set(
      factsResult.facts.map(snapshotFactKey),
    );
    const shadowBackfillOnlyFactKeys = new Set(
      backfillPolicy.mode === 'SHADOW'
        ? pendingPrimaryFacts
            .map(snapshotFactKey)
            .filter((key) => !latestSnapshotFactKeys.has(key))
        : [],
    );
    const sourceCandidates = uniqueSnapshotFacts([
      ...pendingPrimaryFacts,
      ...factsResult.facts,
    ]).filter((fact) => !source || fact.source === source);
    let orderedCandidates = sourceCandidates;

    // Snapshot sources are intentionally bounded. If already processed rows
    // keep occupying the head of that window, a newly completed session or
    // purchase below them can otherwise starve forever. In live mode, scan
    // the bounded window once and put facts without a canonical event first;
    // processEvent still remains the final idempotency authority.
    if (!dryRunOnly && sourceCandidates.length > limit) {
      const candidateReferences = sourceCandidates.map((fact) => ({
        fact,
        reference: buildProcessExternalReference(
          pipelineProcessDtoFromFact(fact),
          fact.eventType,
        ),
      }));
      const uniqueReferences = [
        ...new Map(
          candidateReferences
            .filter(
              (
                item,
              ): item is typeof item & {
                reference: ProcessExternalReference;
              } => Boolean(item.reference),
            )
            .map((item) => [
              processExternalReferenceKey(item.reference),
              item.reference,
            ]),
        ).values(),
      ];
      const existingEvents = uniqueReferences.length
        ? ((await this.prisma.guestGameEvent.findMany({
            where: {
              tenantId: user.tenantId,
              OR: uniqueReferences.map((reference) => ({
                externalProvider: reference.externalProvider,
                externalDomain: reference.externalDomain,
                externalId: reference.externalId,
              })),
            },
            select: {
              externalProvider: true,
              externalDomain: true,
              externalId: true,
            },
          })) ?? [])
        : [];
      const processedReferences = new Set(
        existingEvents
          .filter(
            (
              event,
            ): event is typeof event & {
              externalProvider: IntegrationProvider;
              externalDomain: string;
              externalId: string;
            } =>
              Boolean(
                event.externalProvider &&
                event.externalDomain &&
                event.externalId,
              ),
          )
          .map((event) => processExternalReferenceKey(event)),
      );
      const pending: GuestGameSnapshotFact[] = [];
      const processed: GuestGameSnapshotFact[] = [];
      const unbound: GuestGameSnapshotFact[] = [];

      for (const item of candidateReferences) {
        if (!item.fact.guest?.id && !item.fact.profileId) {
          unbound.push(item.fact);
          continue;
        }
        if (
          item.reference &&
          processedReferences.has(processExternalReferenceKey(item.reference))
        ) {
          processed.push(item.fact);
        } else {
          pending.push(item.fact);
        }
      }
      // Unbound facts can never produce a guest reward. Keep them visible in
      // diagnostics, but do not let a dense block of them occupy the batch
      // ahead of actionable guest-bound sessions and purchases.
      orderedCandidates = [...pending, ...processed, ...unbound];
    }

    const candidates =
      backfillPolicy.mode === 'SHADOW'
        ? [
            ...orderedCandidates
              .filter(
                (fact) =>
                  !shadowBackfillOnlyFactKeys.has(snapshotFactKey(fact)),
              )
              .slice(0, limit),
            ...orderedCandidates
              .filter((fact) =>
                shadowBackfillOnlyFactKeys.has(snapshotFactKey(fact)),
              )
              .slice(0, limit),
          ]
        : orderedCandidates.slice(0, limit);
    const facts: GuestGamePipelineFactResult[] = [];

    for (const fact of candidates) {
      const shadowBackfillOnly = shadowBackfillOnlyFactKeys.has(
        snapshotFactKey(fact),
      );
      if (!fact.guest?.id && !fact.profileId) {
        facts.push({
          ...pipelineFactBase(fact),
          status: 'SKIPPED',
          reason:
            'Факт не привязан к гостю Langame или игровому профилю, автоматический запуск пропущен.',
          dryRun: null,
          process: null,
        });
        continue;
      }

      const processDto = pipelineProcessDtoFromFact(fact);

      try {
        if (
          fact.sessionClassificationCorrection === 'PACKAGE_V1' &&
          !shadowBackfillOnly &&
          !dryRunOnly
        ) {
          const process =
            await this.processSessionPackageClassificationCorrection(
              user,
              processDto,
            );
          facts.push({
            ...pipelineFactBase(fact),
            status: process.summary.idempotent ? 'DUPLICATE' : 'PROCESSED',
            reason: process.summary.idempotent
              ? 'РЈС‚РѕС‡РЅРµРЅРёРµ РїР°РєРµС‚РЅРѕР№ СЃРµСЃСЃРёРё СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅРѕ.'
              : `${process.summary.createdRewards} РЅР°РіСЂР°Рґ РІ РѕС‡РµСЂРµРґРё РїРѕСЃР»Рµ СѓС‚РѕС‡РЅРµРЅРёСЏ С‚РёРїР° СЃРµСЃСЃРёРё, XP ${process.summary.appliedXpDelta}.`,
            dryRun: process.dryRun,
            process,
          });
          continue;
        }

        const dryRun = filterDryRunRulesByEvaluationPolicy(
          await this.dryRun(user, processDto),
          'LIVE',
        );
        const eligibleRules = dryRun.rules.filter((rule) => rule.eligible);
        const activeEligibleRules = eligibleRules.filter(
          (rule) => rule.status === 'ACTIVE',
        );
        const nonActiveEligibleRules = eligibleRules.filter(
          (rule) => rule.status !== 'ACTIVE',
        );
        const activeXpDelta = sum(
          activeEligibleRules.map((rule) => rule.xpDelta),
        );
        const activeProgressRules = dryRun.rules.filter(
          (rule) =>
            rule.status === 'ACTIVE' &&
            rule.progress?.applicable === true &&
            rule.progress.matchedEvents > 0,
        );

        if (dryRunOnly || shadowBackfillOnly) {
          if (shadowBackfillOnly) {
            await this.recordRuleDecisions(user, dryRun, {
              evaluationMode: 'SHADOW',
              evaluatorVersion: 'primary-snapshot-backfill-shadow-v1',
              sourceFactId: fact.id,
              sourceExternalId: fact.externalId,
              sourceFactKind: fact.source,
              suppressLedgerShadow: true,
              evidence: {
                source: 'PRIMARY_SNAPSHOT_BACKFILL',
                mode: 'SHADOW',
                eventType: fact.eventType,
                occurredAt: fact.occurredAt,
              },
            });
          }
          facts.push({
            ...pipelineFactBase(fact),
            status: 'DRY_RUN',
            reason: shadowBackfillOnly
              ? `Historical snapshot fact evaluated in SHADOW: ${activeEligibleRules.length} active rules matched; no event, XP, reward or entitlement was created.`
              : `${activeEligibleRules.length} активных правил сработает, ${dryRun.summary.blockedRules} правил заблокировано.`,
            dryRun,
            process: null,
          });
          continue;
        }

        const persistCanonicalPrimaryFact =
          fact.source === 'GUEST_SESSION' || fact.source === 'PRODUCT_EXPENSE';

        if (
          !activeEligibleRules.length &&
          activeXpDelta === 0 &&
          !activeProgressRules.length &&
          !persistCanonicalPrimaryFact
        ) {
          facts.push({
            ...pipelineFactBase(fact),
            status: 'SKIPPED',
            reason:
              'Нет активных сработавших правил или XP для записи события.',
            dryRun,
            process: null,
          });
          continue;
        }

        if (
          nonActiveEligibleRules.length &&
          activeEligibleRules.length === 0 &&
          !persistCanonicalPrimaryFact
        ) {
          facts.push({
            ...pipelineFactBase(fact),
            status: 'SKIPPED',
            reason:
              'Есть сработавшие правила не в ACTIVE-статусе. Подтвердите такой факт вручную в тестовом запуске.',
            dryRun,
            process: null,
          });
          continue;
        }

        const process = await this.processEvent(user, {
          ...processDto,
          activeRulesOnly: true,
          suppressLootBoxRewards: true,
          note: 'Автоматический batch pipeline обработал сохраненный LeetPlus/Langame факт внутри LeetPlus. Запись в Langame не выполнялась.',
        });

        if (process.summary.idempotent) {
          facts.push({
            ...pipelineFactBase(fact),
            status: 'DUPLICATE',
            reason: 'Snapshot-факт уже был обработан ранее.',
            dryRun: process.dryRun,
            process,
          });
          continue;
        }

        facts.push({
          ...pipelineFactBase(fact),
          status: 'PROCESSED',
          reason: `${process.summary.createdRewards} наград в очереди, XP ${process.summary.appliedXpDelta}.`,
          dryRun: process.dryRun,
          process,
        });
      } catch (error) {
        facts.push({
          ...pipelineFactBase(fact),
          status: error instanceof ConflictException ? 'DUPLICATE' : 'ERROR',
          reason:
            error instanceof ConflictException
              ? 'Snapshot-факт уже был обработан ранее.'
              : pipelineErrorMessage(error),
          dryRun: null,
          process: null,
        });
      }
    }

    const processed = facts.filter((fact) => fact.status === 'PROCESSED');

    return {
      dryRunOnly,
      langameWrite: false,
      availableFacts: sourceCandidates.length,
      checkedFacts: candidates.length,
      processedFacts: processed.length,
      skippedFacts: facts.filter((fact) => fact.status === 'SKIPPED').length,
      duplicateFacts: facts.filter((fact) => fact.status === 'DUPLICATE')
        .length,
      erroredFacts: facts.filter((fact) => fact.status === 'ERROR').length,
      appliedXpDelta: sum(
        processed.map((fact) => fact.process?.summary.appliedXpDelta ?? 0),
      ),
      queuedRewards: sum(
        processed.map((fact) => fact.process?.summary.createdRewards ?? 0),
      ),
      queuedRewardAmount: sum(
        processed.map((fact) => fact.process?.summary.queuedRewardAmount ?? 0),
      ),
      facts,
      note: dryRunOnly
        ? 'Предпросмотр batch: события, XP, награды и Langame-записи не создавались.'
        : 'Batch обработал только сохраненные snapshot-факты внутри LeetPlus. Запись в Langame не выполнялась.',
    };
  }

  async runSnapshotPipelineScheduled(
    dto: GuestGameScheduledPipelineRunDto = {},
  ): Promise<GuestGameScheduledPipelineRunResult> {
    const tenantId = nullableString(dto.tenantId);
    const tenantSlug = nullableString(dto.tenantSlug);
    const tenants = await this.prisma.tenant.findMany({
      where: clean({
        id: tenantId ?? undefined,
        slug: tenantSlug ?? undefined,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            role: { in: [...scheduledPipelineActorRoles] },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { slug: 'asc' },
    });
    const tenantResults: GuestGameScheduledPipelineTenantResult[] = [];

    for (const tenant of tenants) {
      if (tenant.status !== TenantLifecycleStatus.ACTIVE) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'Tenant is not active; scheduled Guest Game pipeline skipped.',
          result: null,
        });
        continue;
      }

      const actor = this.pickScheduledPipelineActor(tenant.users);

      if (!actor) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'No active owner, system administrator or network manager user found for audit-safe run.',
          result: null,
        });
        continue;
      }

      try {
        const result = await this.runSnapshotPipeline(
          {
            id: actor.id,
            email: actor.email,
            fullName: actor.fullName,
            role: actor.role,
            customRoleId: actor.customRoleId,
            isPlatformAdmin: actor.isPlatformAdmin,
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            tenantStatus: tenant.status,
          },
          dto,
        );

        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'PROCESSED',
          reason: null,
          result,
        });
      } catch (error) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'ERROR',
          reason: pipelineErrorMessage(error),
          result: null,
        });
      }
    }

    return this.buildScheduledPipelineSummary(
      booleanValue(dto.dryRunOnly),
      tenantResults,
    );
  }

  async runSupplementalPipelineScheduled(
    dto: GuestGameSupplementalPipelineRunDto = {},
  ): Promise<GuestGameSupplementalPipelineRunResult> {
    const mode = supplementalPipelineMode(dto.mode);
    const factTypes = supplementalFactTypes(dto.factTypes);
    const limit = Math.min(100, Math.max(1, intValue(dto.limit) ?? 30));
    const tenants = await this.prisma.tenant.findMany({
      where: clean({
        id: nullableString(dto.tenantId) ?? undefined,
        slug: nullableString(dto.tenantSlug) ?? undefined,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            role: { in: [...scheduledPipelineActorRoles] },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { slug: 'asc' },
    });
    const results: GuestGameSupplementalPipelineTenantResult[] = [];

    for (const tenant of tenants) {
      if (mode === 'OFF' || tenant.status !== TenantLifecycleStatus.ACTIVE) {
        results.push(
          supplementalTenantResult(
            tenant.id,
            tenant.slug,
            'SKIPPED',
            mode === 'OFF'
              ? 'Supplemental pipeline is disabled.'
              : 'Tenant is not active.',
          ),
        );
        continue;
      }

      const actor = this.pickScheduledPipelineActor(tenant.users);
      if (!actor) {
        results.push(
          supplementalTenantResult(
            tenant.id,
            tenant.slug,
            'SKIPPED',
            'No audit-safe tenant actor is available.',
          ),
        );
        continue;
      }

      try {
        results.push(
          await this.runSupplementalPipelineForTenant(
            {
              id: actor.id,
              email: actor.email,
              fullName: actor.fullName,
              role: actor.role,
              customRoleId: actor.customRoleId,
              isPlatformAdmin: actor.isPlatformAdmin,
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              tenantStatus: tenant.status,
            },
            mode,
            factTypes,
            limit,
          ),
        );
      } catch (error) {
        results.push(
          supplementalTenantResult(
            tenant.id,
            tenant.slug,
            'ERROR',
            pipelineErrorMessage(error),
          ),
        );
      }
    }

    return summarizeSupplementalPipeline(mode, results);
  }

  private async runSupplementalPipelineForTenant(
    user: AuthenticatedUser,
    mode: Exclude<GuestGameSupplementalPipelineMode, 'OFF'>,
    factTypes: string[],
    limit: number,
  ): Promise<GuestGameSupplementalPipelineTenantResult> {
    const [missions, seasonRows, ruleStores] = await Promise.all([
      this.prisma.guestGameMission.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          definitionVersion: guestGameMissionDefinitionVersion,
          evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
          triggerKind: { in: factTypes },
        },
        select: {
          id: true,
          createdAt: true,
          periodFrom: true,
          periodTo: true,
          conditions: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          createdAt: true,
          periodFrom: true,
          periodTo: true,
          levels: true,
          storeIds: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, externalDomain: true, timeZone: true },
      }),
    ]);
    const seasons = (seasonRows ?? []).filter((season) =>
      seasonHasSupplementalBattlePassStep(season.levels, factTypes),
    );
    const stores = ruleStores ?? [];
    if (!missions.length && !seasons.length) {
      return supplementalTenantResult(
        user.tenantId,
        user.tenantSlug,
        'SKIPPED',
        'No active supplemental missions or Battle Pass steps.',
      );
    }

    const activationDates = [
      ...missions.map((mission) =>
        guestGameRuleActivationAt(mission.createdAt, mission.conditions),
      ),
      ...seasons.map((season) => season.periodFrom ?? season.createdAt),
    ];
    const earliestActivation = activationDates.reduce((earliest, value) =>
      value < earliest ? value : earliest,
    );
    const result = supplementalTenantResult(
      user.tenantId,
      user.tenantSlug,
      'PROCESSED',
      null,
    );
    const candidates: Array<{
      fact: SupplementalActivityFactRow;
      ruleIds: string[];
      receiptAttempts: number;
    }> = [];
    const supplementalRules = [
      ...missions.map((mission) => ({
        id: mission.id,
        storeIds: guestGameStringArray(mission.storeIds),
        configuredDomains: guestGameStringArray(
          jsonRecord(mission.conditions).externalDomains,
        ),
      })),
      ...seasons.map((season) => ({
        id: season.id,
        storeIds: guestGameStringArray(season.storeIds),
        configuredDomains: [] as string[],
      })),
    ];
    const ruleExternalDomains = new Map<string, readonly string[]>(
      supplementalRules.map((rule) => [
        rule.id,
        supplementalRuleExternalDomains(
          rule.storeIds,
          rule.configuredDomains,
          stores,
        ),
      ]),
    );
    const ruleDomainTimeZones = new Map<
      string,
      ReadonlyMap<string, string | null>
    >(
      supplementalRules.map((rule) => [
        rule.id,
        new Map(
          Object.entries(guestGameRuleDomainTimeZones(rule.storeIds, stores)),
        ),
      ]),
    );
    const staleClaimBefore = new Date(
      Date.now() - supplementalReceiptClaimLeaseMs,
    );
    const factPageSize = Math.max(50, limit);
    let factCursor: { id: string } | undefined;

    while (candidates.length < limit) {
      const facts = await this.prisma.guestActivityFact.findMany({
        where: {
          tenantId: user.tenantId,
          factType: { in: factTypes },
          lifecycleStatus: 'ACTIVE',
          confidence: 'EXACT',
          supersededAt: null,
          happenedAt: { gte: earliestActivation },
          sourceExternalId: { not: null },
          OR: [{ guestId: { not: null } }, { profileId: { not: null } }],
        },
        orderBy: [{ happenedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: factPageSize,
        ...(factCursor ? { cursor: factCursor, skip: 1 } : {}),
      });
      if (!facts.length) {
        break;
      }

      const pageCandidates = facts.flatMap((fact) => {
        const happenedAt = fact.happenedAt;
        if (
          !happenedAt ||
          !fact.externalDomain ||
          !fact.sourceExternalId ||
          !fact.amount
        ) {
          return [];
        }
        const ruleIds = [
          ...missions
            .filter((mission) =>
              supplementalMissionMatchesFact(
                mission,
                stores,
                fact.externalDomain,
                happenedAt,
              ),
            )
            .map((mission) => mission.id),
          ...seasons
            .filter((season) =>
              supplementalSeasonMatchesFact(
                season,
                stores,
                fact.externalDomain,
                happenedAt,
              ),
            )
            .map((season) => season.id),
        ];

        return ruleIds.length ? [{ fact, ruleIds }] : [];
      });
      const uniqueReceiptKeys = new Map<
        string,
        { factType: string; externalDomain: string; sourceHash: string }
      >();
      for (const { fact } of pageCandidates) {
        uniqueReceiptKeys.set(supplementalReceiptKey(fact), {
          factType: fact.factType,
          externalDomain: fact.externalDomain,
          sourceHash: fact.sourceHash,
        });
      }
      const receipts = uniqueReceiptKeys.size
        ? await this.prisma.guestGameSupplementalFactReceipt.findMany({
            where: {
              tenantId: user.tenantId,
              OR: [...uniqueReceiptKeys.values()],
            },
            select: {
              factType: true,
              externalDomain: true,
              sourceHash: true,
              status: true,
              attempts: true,
              updatedAt: true,
            },
          })
        : [];
      const receiptByKey = new Map(
        receipts.map((receipt) => [supplementalReceiptKey(receipt), receipt]),
      );

      for (const candidate of pageCandidates) {
        const receipt = receiptByKey.get(
          supplementalReceiptKey(candidate.fact),
        );
        if (
          receipt &&
          supplementalReceiptShouldDeadLetter(receipt, staleClaimBefore)
        ) {
          await this.prisma.guestGameSupplementalFactReceipt.updateMany({
            where: {
              tenantId: user.tenantId,
              factType: candidate.fact.factType,
              externalDomain: candidate.fact.externalDomain,
              sourceHash: candidate.fact.sourceHash,
              status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
              attempts: { gte: supplementalReceiptMaxAttempts },
              updatedAt: { lt: staleClaimBefore },
            },
            data: {
              status: 'DEAD_LETTER',
              lastError:
                'Supplemental fact exhausted the bounded processing retry budget.',
            },
          });
        }
        if (
          receipt &&
          !supplementalReceiptCanBeClaimed(mode, receipt, staleClaimBefore)
        ) {
          result.duplicateFacts += 1;
          continue;
        }

        candidates.push({
          ...candidate,
          receiptAttempts: receipt?.attempts ?? 0,
        });
      }

      factCursor = { id: facts[facts.length - 1].id };
      if (facts.length < factPageSize) {
        break;
      }
    }

    for (const { fact, ruleIds, receiptAttempts } of candidates) {
      if (result.checkedFacts >= limit) {
        break;
      }
      const happenedAt = fact.happenedAt;
      if (
        !happenedAt ||
        !fact.externalDomain ||
        !fact.sourceExternalId ||
        !fact.amount
      ) {
        continue;
      }
      const receiptKey = {
        tenantId: user.tenantId,
        factType: fact.factType,
        externalDomain: fact.externalDomain,
        sourceHash: fact.sourceHash,
      };
      await this.prisma.guestGameSupplementalFactReceipt.createMany({
        data: [
          {
            ...receiptKey,
            factId: fact.id,
            mode,
            status: 'PENDING',
          },
        ],
        skipDuplicates: true,
      });
      const claim =
        await this.prisma.guestGameSupplementalFactReceipt.updateMany({
          where: {
            ...receiptKey,
            // attempts is the receipt fencing version. A worker can only
            // acquire the exact version it observed while paging candidates;
            // reclaim increments it and permanently fences the stale worker.
            attempts: receiptAttempts,
            OR: [
              {
                status: {
                  in:
                    mode === 'LIVE'
                      ? ['PENDING', 'FAILED', 'SHADOWED']
                      : ['PENDING', 'FAILED'],
                },
              },
              {
                status: 'PROCESSING',
                updatedAt: { lt: staleClaimBefore },
              },
            ],
          },
          data: {
            factId: fact.id,
            mode,
            status: 'PROCESSING',
            attempts: { increment: 1 },
            lastError: null,
          },
        });
      if (claim.count === 0) {
        result.duplicateFacts += 1;
        continue;
      }
      const claimAttempt = receiptAttempts + 1;
      result.checkedFacts += 1;

      try {
        const processDto: GuestGameProcessEventDto = {
          profileId: fact.profileId,
          guestId: fact.guestId,
          eventType: 'BALANCE_TOPUP',
          occurredAt: happenedAt.toISOString(),
          spendAmount: Number(fact.amount),
          sourceFactId: fact.id,
          sourceFactKind: 'SUPPLEMENTAL_BALANCE_TOPUP',
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          externalId: fact.sourceHash,
          activeRulesOnly: true,
          payload: {
            supplemental: true,
            factType: fact.factType,
            sourceHash: fact.sourceHash,
            confidence: fact.confidence,
          },
        };

        if (mode === 'SHADOW') {
          const dryRun = filterDryRunRules(
            filterDryRunRulesByEvaluationPolicy(
              activeRulesOnlyDryRun(
                await this.dryRun(user, processDto, {
                  ruleDomainTimeZones,
                  ruleExternalDomains,
                }),
              ),
              'LIVE_SUPPLEMENTAL',
            ),
            new Set(ruleIds),
          );
          await this.recordRuleDecisions(user, dryRun, {
            sourceFactId: fact.id,
            sourceFactKind: 'SUPPLEMENTAL_BALANCE_TOPUP',
            evaluationMode: 'SHADOW_SUPPLEMENTAL',
            evaluatorVersion: 'ledger-supplemental-v1',
            evidence: supplementalFactEvidence(fact),
          });
          const finalized =
            await this.prisma.guestGameSupplementalFactReceipt.updateMany({
              where: {
                ...receiptKey,
                status: 'PROCESSING',
                attempts: claimAttempt,
              },
              data: { status: 'SHADOWED', processedAt: new Date() },
            });
          if (finalized.count === 0) {
            result.duplicateFacts += 1;
            continue;
          }
          result.shadowFacts += 1;
          continue;
        }

        const processed = await this.processEvent(user, processDto, {
          allowedRuleIds: ruleIds,
          evaluationMode: 'LIVE_SUPPLEMENTAL',
          evaluatorVersion: 'ledger-supplemental-v1',
          ruleDomainTimeZones,
          ruleExternalDomains,
          originKey: buildGuestGameOriginKey({
            externalProvider: fact.externalProvider,
            externalDomain: fact.externalDomain,
            eventType: 'BALANCE_TOPUP',
            stableExternalId: fact.sourceExternalId,
          }),
          suppressLedgerShadow: true,
        });
        const finalized =
          await this.prisma.guestGameSupplementalFactReceipt.updateMany({
            where: {
              ...receiptKey,
              status: 'PROCESSING',
              attempts: claimAttempt,
            },
            data: {
              status: 'PROCESSED',
              eventId: processed.event.id,
              processedAt: new Date(),
            },
          });
        if (finalized.count === 0) {
          result.duplicateFacts += 1;
          continue;
        }
        result.processedFacts += 1;
        result.createdEvents += processed.summary.idempotent ? 0 : 1;
        result.createdRewards += processed.summary.createdRewards;
      } catch (error) {
        const finalized =
          await this.prisma.guestGameSupplementalFactReceipt.updateMany({
            where: {
              ...receiptKey,
              status: 'PROCESSING',
              attempts: claimAttempt,
            },
            data: {
              status: 'FAILED',
              lastError: pipelineErrorMessage(error).slice(0, 500),
            },
          });
        if (finalized.count > 0) result.failedFacts += 1;
        else result.duplicateFacts += 1;
      }
    }

    return result;
  }

  async runDeliveryDispatchScheduled(
    dto: GuestGameScheduledDeliveryDispatchDto = {},
  ): Promise<GuestGameScheduledDeliveryDispatchResult> {
    const tenantId = nullableString(dto.tenantId);
    const tenantSlug = nullableString(dto.tenantSlug);
    const config = deliveryProviderConfig();
    const dryRun =
      dto.dryRun === undefined
        ? true
        : booleanValue(dto.dryRun) || !config.realSendEnabled;
    const tenants = await this.prisma.tenant.findMany({
      where: clean({
        id: tenantId ?? undefined,
        slug: tenantSlug ?? undefined,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            role: { in: [...scheduledPipelineActorRoles] },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { slug: 'asc' },
    });
    const tenantResults: GuestGameScheduledDeliveryTenantResult[] = [];

    for (const tenant of tenants) {
      if (tenant.status !== TenantLifecycleStatus.ACTIVE) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'Tenant is not active; scheduled delivery dispatcher skipped.',
          result: null,
        });
        continue;
      }

      const actor = this.pickScheduledPipelineActor(tenant.users);

      if (!actor) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'SKIPPED',
          reason:
            'No active owner, system administrator or network manager user found for audit-safe run.',
          result: null,
        });
        continue;
      }

      try {
        const result = await this.dispatchDeliveries(
          {
            id: actor.id,
            email: actor.email,
            fullName: actor.fullName,
            role: actor.role,
            customRoleId: actor.customRoleId,
            isPlatformAdmin: actor.isPlatformAdmin,
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            tenantStatus: tenant.status,
          },
          {
            ...dto,
            dryRun,
          },
        );

        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'PROCESSED',
          reason: null,
          result,
        });
      } catch (error) {
        tenantResults.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: 'ERROR',
          reason: pipelineErrorMessage(error),
          result: null,
        });
      }
    }

    return this.buildScheduledDeliveryDispatchSummary(dryRun, tenantResults);
  }

  async pullBotDeliveries(
    dto: GuestGameBotDeliveryPullDto = {},
  ): Promise<GuestGameBotDeliveryPullResult> {
    const { user, tenantSlug } = await this.resolveScheduledTenantActor(dto);
    const channels = deliveryDispatchChannels(dto.channels);
    const limit = Math.min(50, Math.max(1, intValue(dto.limit) ?? 25));
    const rows = await this.prisma.guestGameDelivery.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'READY',
        readinessStatus: 'READY_FOR_BOT',
        channel: { in: channels },
      },
      include: deliveryInclude,
      orderBy: [{ preparedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    const items = rows
      .map((row) => mapBotDeliveryItem(row, tenantSlug))
      .filter((item): item is GuestGameBotDeliveryItem => Boolean(item));

    return {
      checked: rows.length,
      ready: items.length,
      skipped: rows.length - items.length,
      items,
      note: items.length
        ? 'Bot consumer received ready Telegram/MAX deliveries. Send messages externally and ack each result back to LeetPlus.'
        : 'No READY_FOR_BOT Telegram/MAX deliveries with a confirmed bot identity were found for this tenant.',
    };
  }

  async ackBotDelivery(
    dto: GuestGameBotDeliveryAckDto,
  ): Promise<GuestGameBotDeliveryAckResult> {
    const { user } = await this.resolveScheduledTenantActor(dto);
    const deliveryId = nullableString(dto.deliveryId);

    if (!deliveryId) {
      throw new BadRequestException('deliveryId is required');
    }

    const nextStatus = botDeliveryAckStatusValue(dto.status);
    const current = await this.assertDelivery(user, deliveryId);
    const channel = deliveryChannelValue(current.channel, null);

    if (channel !== 'TELEGRAM' && channel !== 'MAX') {
      throw new BadRequestException(
        'Bot consumer can ack only Telegram/MAX deliveries.',
      );
    }

    if (current.readinessStatus !== 'READY_FOR_BOT') {
      throw new BadRequestException(
        'Delivery is not marked READY_FOR_BOT and cannot be acked by bot consumer.',
      );
    }

    if (current.status === 'CANCELED') {
      throw new ConflictException('Canceled delivery cannot be acked.');
    }

    const eventType = botDeliveryAckEventType(nextStatus);

    if (isTerminalBotAckStatus(current.status)) {
      if (current.status !== nextStatus) {
        throw new ConflictException(
          'Terminal bot delivery ack can only be repeated with the same status. Retry the delivery from Guest Game Hub before sending it again.',
        );
      }

      return {
        delivery: mapDelivery(current),
        eventType,
        note: 'Duplicate bot consumer ack ignored.',
        idempotent: true,
      };
    }

    const now = new Date();
    const note =
      boundedString(dto.note, 500) ?? botDeliveryAckDefaultNote(nextStatus);
    const row = await this.prisma.guestGameDelivery.update({
      where: { id: deliveryId },
      data: clean({
        status: nextStatus,
        note,
        sentAt:
          nextStatus === 'SENT' ? (current.sentAt ?? now) : current.sentAt,
        failedAt:
          nextStatus === 'FAILED'
            ? (current.failedAt ?? now)
            : current.failedAt,
      }),
      include: deliveryInclude,
    });

    await this.createDeliveryEvent(user, row.id, row.rewardId, {
      eventType,
      fromStatus: current.status,
      toStatus: row.status,
      channel,
      note,
      payload: botDeliveryAckPayload(dto, nextStatus, channel),
    });

    return {
      delivery: mapDelivery(row),
      eventType,
      note,
      idempotent: false,
    };
  }

  async getProfiles(user: AuthenticatedUser): Promise<GuestGameProfile[]> {
    const rows = await this.prisma.guestGameProfile.findMany({
      where: { tenantId: user.tenantId },
      include: gameProfileInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    return rows.map(mapProfile);
  }

  async createProfile(
    user: AuthenticatedUser,
    dto: GuestGameProfileDto,
  ): Promise<GuestGameProfile> {
    const data = (await this.buildProfileData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameProfileUncheckedCreateInput;
    const row = await this.prisma.guestGameProfile.create({
      data,
      include: gameProfileInclude,
    });

    await this.createSystemEvent(user, {
      profileId: row.id,
      guestId: row.guestId,
      eventType: 'PROFILE_CREATED',
      xpDelta: 0,
      note: 'Игровой профиль создан в LeetPlus.',
    });

    return mapProfile(row);
  }

  async updateProfile(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameProfileUpdateDto,
  ): Promise<GuestGameProfile> {
    await this.assertProfile(user, id);
    const data = await this.buildProfileData(user, dto, false);
    const row = await this.prisma.guestGameProfile.update({
      where: { id },
      data,
      include: gameProfileInclude,
    });

    return mapProfile(row);
  }

  async getLootBoxes(user: AuthenticatedUser): Promise<GuestGameLootBox[]> {
    const rows = await this.prisma.guestGameLootBox.findMany({
      where: { tenantId: user.tenantId },
      include: lootBoxInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map(mapLootBox);
  }

  async createLootBox(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxDto,
  ): Promise<GuestGameLootBox> {
    const data = (await this.buildLootBoxData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameLootBoxUncheckedCreateInput;
    const row = await this.prisma.guestGameLootBox.create({
      data,
      include: lootBoxInclude,
    });

    return mapLootBox(row);
  }

  async updateLootBox(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameLootBoxUpdateDto,
  ): Promise<GuestGameLootBox> {
    const lootBox = await this.assertLootBox(user, id);
    const data = await this.buildLootBoxData(user, dto, false);
    const nextStatus = enumValue(dto.status, statusValues, undefined);
    const activatedNow = nextStatus === 'ACTIVE' && lootBox.status !== 'ACTIVE';
    const nextData = activatedNow
      ? {
          ...data,
          limits: ruleMetadataWithActivatedAt(
            data.limits ?? lootBox.limits,
          ) as Prisma.InputJsonValue,
        }
      : data;
    const row = await this.prisma.guestGameLootBox.update({
      where: { id },
      data: nextData,
      include: lootBoxInclude,
    });

    return mapLootBox(row);
  }

  async restartLootBox(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{
    lootBox: GuestGameLootBox;
    restartedAt: string;
    canceledRewards: number;
  }> {
    const lootBox = await this.assertLootBox(user, id);
    const restartedAt = new Date().toISOString();
    const limits = jsonRecord(lootBox.limits);
    const nextLimits = {
      ...limits,
      restartedAt,
    } as Prisma.InputJsonObject;

    const canceledRewards = await this.prisma.guestGameReward.updateMany({
      where: {
        tenantId: user.tenantId,
        lootBoxId: lootBox.id,
        status: { in: ['PENDING', 'APPROVED', 'EXPIRED'] },
      },
      data: {
        status: 'CANCELED',
        note: 'Лутбокс перезапущен: старая невыданная награда закрыта.',
      },
    });

    const row = await this.prisma.guestGameLootBox.update({
      where: { id: lootBox.id },
      data: { limits: nextLimits },
      include: lootBoxInclude,
    });

    return {
      lootBox: mapLootBox(row),
      restartedAt,
      canceledRewards: canceledRewards.count,
    };
  }

  async deleteLootBox(
    user: AuthenticatedUser,
    id: string,
    options: GuestGameRuleDeleteOptions = {},
  ): Promise<GuestGameRuleDeleteResult> {
    const lootBox = await this.assertLootBox(user, id);
    const detachedVisualEditorItems = await this.prepareRuleDelete(
      user,
      'lootBox',
      lootBox.id,
      `лутбокс "${lootBox.name}"`,
      lootBox,
      options,
    );
    const [detachedEvents, detachedRewards] = await Promise.all([
      this.prisma.guestGameEvent.count({
        where: { tenantId: user.tenantId, lootBoxId: lootBox.id },
      }),
      this.prisma.guestGameReward.count({
        where: { tenantId: user.tenantId, lootBoxId: lootBox.id },
      }),
    ]);

    await this.prisma.guestGameLootBox.delete({
      where: { id: lootBox.id },
    });

    return {
      deleted: true,
      detachedEvents,
      detachedRewards,
      detachedVisualEditorItems,
    };
  }

  async getMissions(user: AuthenticatedUser): Promise<GuestGameMission[]> {
    const rows = await this.prisma.guestGameMission.findMany({
      where: { tenantId: user.tenantId },
      include: missionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map(mapMission);
  }

  async migrateActiveMissionsToWizard(
    user: AuthenticatedUser,
  ): Promise<GuestGameMissionWizardMigrationResult> {
    const legacyMissions = await this.prisma.guestGameMission.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
        definitionVersion: { lt: guestGameMissionDefinitionVersion },
      },
      include: missionInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (!legacyMissions.length) {
      return { migrated: [], skipped: [] };
    }

    const storeIds = uniqueStrings(
      legacyMissions.flatMap((mission) =>
        guestGameStringArray(mission.storeIds),
      ),
    );
    const stores = storeIds.length
      ? await this.prisma.store.findMany({
          where: { tenantId: user.tenantId, id: { in: storeIds } },
          select: { id: true, externalDomain: true },
        })
      : [];
    const storesById = new Map(stores.map((store) => [store.id, store]));
    const skipped: GuestGameMissionWizardMigrationResult['skipped'] = [];
    const prepared: Array<{
      id: string;
      taskType: GuestGameMissionTaskType;
      definition: GuestGameMissionWizardDto;
      data: Prisma.GuestGameMissionUpdateInput;
    }> = [];

    for (const mission of legacyMissions) {
      try {
        const missionStoreIds = guestGameStringArray(mission.storeIds);
        const missingStoreIds = missionStoreIds.filter(
          (storeId) => !storesById.has(storeId),
        );
        if (missingStoreIds.length) {
          throw new BadRequestException(
            'У задания есть недоступные клубы, поэтому его нельзя безопасно перенести в мастер.',
          );
        }

        const externalDomains = uniqueStrings(
          missionStoreIds.map(
            (storeId) => storesById.get(storeId)?.externalDomain ?? '',
          ),
        );
        const { taskType, definition } = legacyMissionWizardDefinition(mission);
        const readiness = validateMissionWizard(definition);
        if (!readiness.ready) {
          throw new BadRequestException(readiness.blockers.join(' '));
        }

        const reward = jsonRecord(definition.reward as Prisma.JsonValue | null);
        const rewardType = wizardRewardType(reward.type);
        const normalizedConditions =
          normalizeMissionWizardConditions(definition);
        const conditions: Record<string, unknown> = {
          ...normalizedConditions,
          ...(taskType === 'BALANCE_TOPUP'
            ? { domainScoped: true, externalDomains }
            : {}),
          reward: cleanJsonRecord(reward),
        };
        const metric = jsonRecord(conditions.metric as Prisma.JsonValue | null);

        prepared.push({
          id: mission.id,
          taskType,
          definition,
          data: {
            definitionVersion: guestGameMissionDefinitionVersion,
            evaluationPolicy: missionEvaluationPolicy(taskType),
            missionType: taskType,
            triggerKind: missionWizardTrigger(taskType),
            rewardType,
            rewardAmount: new Prisma.Decimal(
              wizardRewardAmount(rewardType, mission.rewardAmount),
            ),
            progressTarget: intValue(metric.target) ?? 1,
            progressUnit: nullableString(metric.unit) ?? mission.progressUnit,
            conditions: cleanJsonRecord(conditions),
          },
        });
      } catch (caught) {
        skipped.push({
          id: mission.id,
          name: mission.name,
          reason:
            caught instanceof Error
              ? caught.message
              : 'Не удалось безопасно привести задание к контракту мастера.',
        });
      }
    }

    if (skipped.length) {
      throw new BadRequestException({
        message:
          'Не все активные задания можно безопасно перенести в мастер. Изменения не применены.',
        migrations: skipped,
      });
    }

    const migrated = await this.prisma.$transaction(
      prepared.map(({ id, data }) =>
        this.prisma.guestGameMission.update({
          where: { id },
          data,
          include: missionInclude,
        }),
      ),
    );

    return { migrated: migrated.map(mapMission), skipped: [] };
  }

  async getMissionProductGroupCatalog(
    user: AuthenticatedUser,
    requestedStoreIds: string[],
    requestedSource?: string | null,
  ): Promise<GuestGameMissionProductGroupCatalog> {
    const source =
      nullableString(requestedSource)?.toUpperCase() === 'LEETPLUS'
        ? 'LEETPLUS'
        : 'LANGAME';
    const storeIds = uniqueStrings(requestedStoreIds);
    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(storeIds.length ? { id: { in: storeIds } } : {}),
      },
      select: { id: true, name: true, externalDomain: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (storeIds.length && stores.length !== storeIds.length) {
      throw new BadRequestException(
        'Один или несколько выбранных клубов недоступны.',
      );
    }

    const configurations = stores.length
      ? await this.prisma.langameClubProductConfiguration.findMany({
          where: {
            tenantId: user.tenantId,
            storeId: { in: stores.map((store) => store.id) },
            ...(source === 'LANGAME'
              ? { externalGroupId: { not: null } }
              : { productId: { not: null } }),
            isActive: true,
          },
          select: {
            storeId: true,
            productId: true,
            externalDomain: true,
            externalGroupId: true,
            externalProductId: true,
            syncedAt: true,
          },
        })
      : [];
    const storeById = new Map(stores.map((store) => [store.id, store]));
    const readyStoreIds = new Set(configurations.map((row) => row.storeId));

    if (source === 'LEETPLUS') {
      const products = configurations.length
        ? await this.prisma.product.findMany({
            where: {
              tenantId: user.tenantId,
              id: {
                in: uniqueStrings(
                  configurations.map((row) => row.productId ?? ''),
                ),
              },
              isActive: true,
              categoryId: { not: null },
            },
            select: {
              id: true,
              updatedAt: true,
              category: {
                select: { id: true, name: true, updatedAt: true },
              },
            },
          })
        : [];
      const productById = new Map(
        products.map((product) => [product.id, product]),
      );
      const buckets = new Map<
        string,
        {
          name: string;
          productIds: Set<string>;
          storeIds: Set<string>;
        }
      >();
      configurations.forEach((configuration) => {
        if (!configuration.productId) return;
        const product = productById.get(configuration.productId);
        if (!product?.category) return;
        const bucket = buckets.get(product.category.id) ?? {
          name: product.category.name,
          productIds: new Set<string>(),
          storeIds: new Set<string>(),
        };
        bucket.productIds.add(product.id);
        bucket.storeIds.add(configuration.storeId);
        buckets.set(product.category.id, bucket);
      });
      const catalogGroups = [...buckets.entries()]
        .map(([categoryId, bucket]) => ({
          id: categoryId,
          source: 'LEETPLUS' as const,
          name: bucket.name,
          categoryIds: [categoryId],
          productCount: bucket.productIds.size,
          storeCount: bucket.storeIds.size,
          storeNames: [...bucket.storeIds]
            .map((storeId) => storeById.get(storeId)?.name)
            .filter((name): name is string => Boolean(name))
            .sort((left, right) => left.localeCompare(right, 'ru')),
          refs: [],
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
      const missingStores = stores.filter(
        (store) => !readyStoreIds.has(store.id),
      );
      const timestamps = [
        ...configurations.map((row) => row.syncedAt),
        ...products.flatMap((product) => [
          product.updatedAt,
          ...(product.category ? [product.category.updatedAt] : []),
        ]),
      ];
      return {
        source,
        status: !catalogGroups.length
          ? 'EMPTY'
          : missingStores.length
            ? 'PARTIAL'
            : 'READY',
        latestSyncedAt: timestamps.length
          ? new Date(
              Math.max(...timestamps.map((value) => value.getTime())),
            ).toISOString()
          : null,
        stores: stores.map((store) => ({
          ...store,
          ready: readyStoreIds.has(store.id),
        })),
        warnings: [
          ...(missingStores.length
            ? [
                `Нет свежей клубной конфигурации: ${missingStores
                  .map((store) => store.name)
                  .join(', ')}. Запустите синхронизацию каталога.`,
              ]
            : []),
          ...(!catalogGroups.length && configurations.length
            ? [
                'Для выбранных клубов пока нет товаров с назначенной категорией LeetPlus.',
              ]
            : []),
        ],
        groups: catalogGroups,
      };
    }

    const groupKeys = new Map<string, { domain: string; groupId: string }>();
    configurations.forEach((row) => {
      if (!row.externalGroupId) return;
      groupKeys.set(`${row.externalDomain}:${row.externalGroupId}`, {
        domain: row.externalDomain,
        groupId: row.externalGroupId,
      });
    });
    const groups = groupKeys.size
      ? await this.prisma.langameProductGroup.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            isDeleted: false,
            OR: [...groupKeys.values()].map((item) => ({
              externalDomain: item.domain,
              externalGroupId: item.groupId,
            })),
          },
          select: {
            externalDomain: true,
            externalGroupId: true,
            name: true,
            syncedAt: true,
          },
        })
      : [];
    const groupByExternalKey = new Map(
      groups.map((group) => [
        `${group.externalDomain}:${group.externalGroupId}`,
        group,
      ]),
    );
    const buckets = new Map<
      string,
      {
        name: string;
        refs: Map<
          string,
          {
            externalDomain: string;
            externalGroupId: string;
            productIds: Set<string>;
            storeIds: Set<string>;
          }
        >;
        productIds: Set<string>;
        storeIds: Set<string>;
      }
    >();

    configurations.forEach((row) => {
      if (!row.externalGroupId) return;
      const externalKey = `${row.externalDomain}:${row.externalGroupId}`;
      const group = groupByExternalKey.get(externalKey);
      if (!group) return;
      const semanticKey = group.name.trim().toLocaleLowerCase('ru-RU');
      const bucket = buckets.get(semanticKey) ?? {
        name: group.name.trim(),
        refs: new Map<
          string,
          {
            externalDomain: string;
            externalGroupId: string;
            productIds: Set<string>;
            storeIds: Set<string>;
          }
        >(),
        productIds: new Set<string>(),
        storeIds: new Set<string>(),
      };
      const ref = bucket.refs.get(externalKey) ?? {
        externalDomain: row.externalDomain,
        externalGroupId: row.externalGroupId,
        productIds: new Set<string>(),
        storeIds: new Set<string>(),
      };
      const productKey =
        row.productId ?? `${row.externalDomain}:${row.externalProductId}`;
      ref.productIds.add(productKey);
      ref.storeIds.add(row.storeId);
      bucket.productIds.add(productKey);
      bucket.storeIds.add(row.storeId);
      bucket.refs.set(externalKey, ref);
      buckets.set(semanticKey, bucket);
    });

    const catalogGroups = [...buckets.values()]
      .map((bucket) => {
        const refs = [...bucket.refs.values()]
          .map((ref) => ({
            externalDomain: ref.externalDomain,
            externalGroupId: ref.externalGroupId,
            productCount: ref.productIds.size,
            storeIds: [...ref.storeIds].sort(),
          }))
          .sort((left, right) =>
            `${left.externalDomain}:${left.externalGroupId}`.localeCompare(
              `${right.externalDomain}:${right.externalGroupId}`,
            ),
          );
        const identity = refs
          .map((ref) => `${ref.externalDomain}:${ref.externalGroupId}`)
          .join('|');
        return {
          id: createHash('sha256').update(identity).digest('hex').slice(0, 24),
          source: 'LANGAME' as const,
          name: bucket.name,
          categoryIds: [],
          productCount: bucket.productIds.size,
          storeCount: bucket.storeIds.size,
          storeNames: [...bucket.storeIds]
            .map((storeId) => storeById.get(storeId)?.name)
            .filter((name): name is string => Boolean(name))
            .sort((left, right) => left.localeCompare(right, 'ru')),
          refs,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
    const missingStores = stores.filter(
      (store) => !readyStoreIds.has(store.id),
    );
    const timestamps = [
      ...configurations.map((row) => row.syncedAt),
      ...groups.map((group) => group.syncedAt),
    ];
    const latestSyncedAt = timestamps.length
      ? new Date(
          Math.max(...timestamps.map((value) => value.getTime())),
        ).toISOString()
      : null;

    return {
      source,
      status: !catalogGroups.length
        ? 'EMPTY'
        : missingStores.length
          ? 'PARTIAL'
          : 'READY',
      latestSyncedAt,
      stores: stores.map((store) => ({
        ...store,
        ready: readyStoreIds.has(store.id),
      })),
      warnings: missingStores.length
        ? [
            `Нет свежей клубной конфигурации: ${missingStores
              .map((store) => store.name)
              .join(', ')}. Запустите синхронизацию каталога.`,
          ]
        : [],
      groups: catalogGroups,
    };
  }

  validateMissionWizard(
    _user: AuthenticatedUser,
    dto: GuestGameMissionWizardDto,
  ): GuestGameMissionWizardReadiness {
    return validateMissionWizard(dto);
  }

  async getMissionWizard(
    user: AuthenticatedUser,
    id: string,
  ): Promise<GuestGameMissionWizardLoadResult> {
    await this.assertMission(user, id);
    const row = await this.prisma.guestGameMission.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      include: missionInclude,
    });

    if (row.definitionVersion !== guestGameMissionDefinitionVersion) {
      throw new ConflictException(
        'Задание создано в старом редакторе и не может быть открыто в мастере.',
      );
    }

    const definition = missionRowToWizardDto(row);
    return {
      mission: mapMission(row),
      definition,
      readiness: validateMissionWizard(definition),
    };
  }

  async saveMissionWizard(
    user: AuthenticatedUser,
    dto: GuestGameMissionWizardDto,
    id?: string | null,
  ): Promise<GuestGameMissionWizardSaveResult> {
    const readiness = validateMissionWizard(dto);
    const taskType = missionTaskType(dto.taskType);
    let conditions = normalizeMissionWizardConditions(dto);
    const reward = jsonRecord((dto.reward ?? null) as Prisma.JsonValue);
    let metric = jsonRecord((conditions.metric ?? null) as Prisma.JsonValue);
    const rewardType = wizardRewardType(reward.type);
    const rewardAmount = wizardRewardAmount(rewardType, reward.amount);
    const xpEnabled = reward.xpEnabled !== false;
    const storeIds = uniqueStrings(dto.storeIds ?? []);
    const selectedStores = storeIds.length
      ? await this.prisma.store.findMany({
          where: { tenantId: user.tenantId, id: { in: storeIds } },
          select: { id: true, externalDomain: true },
        })
      : [];
    if (selectedStores.length !== storeIds.length) {
      throw new BadRequestException(
        'Один или несколько выбранных клубов недоступны.',
      );
    }
    const externalDomains = uniqueStrings(
      selectedStores.map((store) => store.externalDomain ?? ''),
    );
    if (taskType === 'PRODUCT_PURCHASE') {
      const purchaseSource =
        nullableString(conditions.purchaseSource)?.toUpperCase() === 'CATEGORY'
          ? 'CATEGORY'
          : 'PRODUCT';
      if (purchaseSource === 'CATEGORY') {
        const categoryCatalogSource =
          nullableString(conditions.categoryCatalogSource)?.toUpperCase() ===
          'LEETPLUS'
            ? 'LEETPLUS'
            : 'LANGAME';
        const selectedCategoryIds = uniqueStrings(
          guestGameStringArray(metric.categoryIds),
        );
        const catalog = await this.getMissionProductGroupCatalog(
          user,
          storeIds,
          categoryCatalogSource,
        );
        const selectedCategories = catalog.groups.filter((group) =>
          selectedCategoryIds.includes(group.id),
        );
        if (selectedCategories.length !== selectedCategoryIds.length) {
          throw new BadRequestException(
            'Одна или несколько выбранных категорий недоступны в выбранных клубах.',
          );
        }
        const categorySelections = selectedCategories.map((group) => ({
          id: group.id,
          name: group.name,
          categoryIds: group.categoryIds,
          externalCategoryKeys: group.refs.map(
            (ref) => `${ref.externalDomain}:${ref.externalGroupId}`,
          ),
          refs: group.refs.map((ref) => ({
            externalDomain: ref.externalDomain,
            externalGroupId: ref.externalGroupId,
          })),
        }));
        metric = {
          ...metric,
          categoryCatalogSource,
          productIds: [],
          externalProductIds: [],
          categorySelectionIds: selectedCategories.map((group) => group.id),
          categoryIds:
            categoryCatalogSource === 'LEETPLUS'
              ? uniqueStrings(
                  selectedCategories.flatMap((group) => group.categoryIds),
                )
              : [],
          categoryLabels: selectedCategories.map((group) => group.name),
          categoryNames: [],
          externalCategoryKeys:
            categoryCatalogSource === 'LANGAME'
              ? uniqueStrings(
                  categorySelections.flatMap(
                    (selection) => selection.externalCategoryKeys,
                  ),
                )
              : [],
          categorySelections,
          target:
            nullableString(metric.productMatch)?.toUpperCase() === 'ALL'
              ? Math.max(1, selectedCategories.length)
              : 1,
        };
      } else {
        const selectedProductIds = uniqueStrings(
          guestGameStringArray(metric.productIds),
        );
        const selectedProducts = selectedProductIds.length
          ? await this.prisma.product.findMany({
              where: {
                tenantId: user.tenantId,
                id: { in: selectedProductIds },
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                externalProductId: true,
                externalDomain: true,
              },
            })
          : [];
        if (selectedProducts.length !== selectedProductIds.length) {
          throw new BadRequestException(
            'Один или несколько выбранных товаров недоступны.',
          );
        }
        metric = {
          ...metric,
          categoryCatalogSource: null,
          categoryIds: [],
          categorySelectionIds: [],
          categoryLabels: [],
          categorySelections: [],
          externalCategoryKeys: [],
          productIds: selectedProducts.map((product) => product.id),
          externalProductIds: uniqueStrings(
            selectedProducts.map((product) => product.externalProductId ?? ''),
          ),
          productRefs: selectedProducts.map((product) => ({
            productId: product.id,
            name: product.name,
            externalProductId: product.externalProductId,
            externalDomain: product.externalDomain,
          })),
        };
      }
      conditions = {
        ...conditions,
        ...(purchaseSource === 'CATEGORY'
          ? {
              categoryCatalogSource:
                nullableString(metric.categoryCatalogSource) ?? 'LANGAME',
            }
          : { categoryCatalogSource: null }),
        metric: cleanJsonRecord(metric),
      };
    }
    const missionDto: GuestGameMissionDto = {
      name: stringValue(dto.name) ?? 'Новое задание',
      status: 'DRAFT',
      missionType: taskType,
      triggerKind: missionWizardTrigger(taskType),
      rewardType,
      rewardAmount,
      rewardLabel: nullableString(reward.label),
      xpReward: xpEnabled ? Math.max(0, intValue(reward.xpAmount) ?? 0) : 0,
      progressTarget: intValue(metric.target) ?? 1,
      progressUnit: nullableString(metric.unit),
      audienceId: nullableId(dto.audienceId),
      conditions: {
        ...conditions,
        ...(taskType === 'BALANCE_TOPUP'
          ? { domainScoped: true, externalDomains }
          : {}),
        reward: cleanJsonRecord(reward),
      },
      storeIds,
      periodFrom:
        conditions.indefinite === true ? null : nullableString(dto.periodFrom),
      periodTo:
        conditions.indefinite === true ? null : nullableString(dto.periodTo),
      budgetAmount:
        rewardType === 'LOOT_BOX_ENTITLEMENT' || reward.budgetUnlimited === true
          ? null
          : numberOrNull(decimalValue(reward.budgetAmount) ?? null),
      perGuestLimit:
        reward.perGuestLimitUnlimited === true
          ? null
          : intValue(reward.perGuestLimit),
      totalRewardLimit:
        rewardType === 'LOOT_BOX_ENTITLEMENT' && reward.budgetUnlimited !== true
          ? intValue(reward.budgetAmount)
          : intValue(reward.totalRewardLimit),
      manualApprovalRequired: reward.delivery === 'ADMIN_APPROVAL',
      note: nullableString(dto.note),
    };

    if (id) {
      const existing = await this.assertMission(user, id);
      if (existing.definitionVersion !== guestGameMissionDefinitionVersion) {
        throw new ConflictException(
          'Задание создано в старом редакторе и не может быть перезаписано мастером.',
        );
      }
      const existingTaskType = missionTaskType(
        nullableString(jsonRecord(existing.conditions).taskType) ??
          existing.missionType,
      );
      const preserveEvaluationPolicy =
        existing.status === 'DRAFT' &&
        existingTaskType === taskType &&
        taskType === 'PLAY_TIME' &&
        (existing.evaluationPolicy === 'LIVE_PRIMARY' ||
          existing.evaluationPolicy === 'LIVE_WITH_LEDGER_FALLBACK');
      const row = await this.prisma.guestGameMission.update({
        where: { id },
        data: {
          ...(await this.buildMissionData(user, missionDto, false)),
          definitionVersion: guestGameMissionDefinitionVersion,
          ...(preserveEvaluationPolicy
            ? {}
            : { evaluationPolicy: missionEvaluationPolicy(taskType) }),
        },
        include: missionInclude,
      });
      return { mission: mapMission(row), readiness };
    }

    const row = await this.prisma.guestGameMission.create({
      data: {
        ...((await this.buildMissionData(
          user,
          missionDto,
          true,
        )) as Prisma.GuestGameMissionUncheckedCreateInput),
        definitionVersion: guestGameMissionDefinitionVersion,
        evaluationPolicy: missionEvaluationPolicy(taskType),
      },
      include: missionInclude,
    });
    return { mission: mapMission(row), readiness };
  }

  async activateMissionWizard(
    user: AuthenticatedUser,
    id: string,
  ): Promise<GuestGameMissionWizardSaveResult> {
    await this.assertMission(user, id);
    const mission = await this.prisma.guestGameMission.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      include: missionInclude,
    });
    if (mission.definitionVersion !== guestGameMissionDefinitionVersion) {
      throw new ConflictException('Это задание создано не в мастере.');
    }
    const wizardDto = missionRowToWizardDto(mission);
    const readiness = validateMissionWizard(wizardDto);
    if (!readiness.ready) {
      throw new BadRequestException({
        message: 'Задание не готово к активации.',
        readiness,
      });
    }
    const missionConditions = jsonRecord(mission.conditions);
    const normalizedDefinitionConditions =
      normalizeMissionWizardConditions(wizardDto);
    const normalizedMetric = jsonRecord(
      normalizedDefinitionConditions.metric as Prisma.JsonValue | null,
    );
    const normalizedConditions = {
      ...missionConditions,
      ...normalizedDefinitionConditions,
      metric: normalizedMetric,
    } as Prisma.InputJsonObject;
    const reward = jsonRecord(
      missionConditions.reward as Prisma.JsonValue | null,
    );
    const rewardType = nullableString(reward.type)?.toUpperCase();
    if (rewardType === 'LOOTBOX') {
      const lootBoxId = nullableId(reward.lootBoxId);
      const lootBox = lootBoxId
        ? await this.prisma.guestGameLootBox.findFirst({
            where: {
              id: lootBoxId,
              tenantId: user.tenantId,
              status: 'ACTIVE',
              usageKind: { in: ['REWARD_TEMPLATE', 'BOTH'] },
            },
            select: { id: true },
          })
        : null;
      if (!lootBox) {
        throw new BadRequestException(
          'Наградной лутбокс не опубликован или недоступен для заданий.',
        );
      }
    }
    if (rewardType === 'PROMOCODE') {
      const promoCodeId = nullableId(reward.promoCodeId);
      const promo = promoCodeId
        ? await this.prisma.marketingPromoBundle.findFirst({
            where: {
              id: promoCodeId,
              tenantId: user.tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      if (!promo) {
        throw new BadRequestException(
          'Промокод не опубликован или больше недоступен.',
        );
      }
    }
    await Promise.all(
      guestGameStringArray(mission.storeIds).map((storeId) =>
        this.assertStore(user, storeId),
      ),
    );
    const activatedAt = new Date();
    const row = await this.prisma.guestGameMission.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        evaluationPolicy: readiness.evaluationPolicy,
        missionType: readiness.taskType,
        triggerKind: missionWizardTrigger(readiness.taskType),
        progressTarget: intValue(normalizedMetric.target) ?? 1,
        progressUnit: nullableString(normalizedMetric.unit),
        ...(missionConditions.indefinite === true
          ? { periodFrom: activatedAt, periodTo: null }
          : {}),
        conditions: ruleMetadataWithActivatedAt(
          normalizedConditions,
          activatedAt,
        ),
      },
      include: missionInclude,
    });
    return { mission: mapMission(row), readiness };
  }

  async createMission(
    user: AuthenticatedUser,
    dto: GuestGameMissionDto,
  ): Promise<GuestGameMission> {
    const data = (await this.buildMissionData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameMissionUncheckedCreateInput;
    const row = await this.prisma.guestGameMission.create({
      data,
      include: missionInclude,
    });

    return mapMission(row);
  }

  async updateMission(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameMissionUpdateDto,
  ): Promise<GuestGameMission> {
    const mission = await this.assertMission(user, id);
    const data = await this.buildMissionData(user, dto, false);
    const nextStatus = enumValue(dto.status, statusValues, undefined);
    const activatedNow = nextStatus === 'ACTIVE' && mission.status !== 'ACTIVE';
    const nextData = activatedNow
      ? {
          ...data,
          conditions: ruleMetadataWithActivatedAt(
            data.conditions ?? mission.conditions,
          ) as Prisma.InputJsonValue,
        }
      : data;
    const row = await this.prisma.guestGameMission.update({
      where: { id },
      data: nextData,
      include: missionInclude,
    });

    return mapMission(row);
  }

  async updateMissionEvaluationPolicy(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameMissionEvaluationPolicyDto,
  ): Promise<GuestGameMission> {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Переключать источник оценки могут только владелец, администратор или менеджер.',
      );
    }

    const mission = await this.assertMission(user, id);
    if (mission.status !== 'DRAFT') {
      throw new ConflictException(
        'Политику источника можно менять только у черновика задания.',
      );
    }
    if (mission.definitionVersion !== guestGameMissionDefinitionVersion) {
      throw new ConflictException(
        'Политику источника можно менять только у задания нового мастера.',
      );
    }

    const taskType = missionTaskType(
      nullableString(jsonRecord(mission.conditions).taskType) ??
        mission.missionType,
    );
    const storedTaskType = missionTaskType(mission.missionType);
    if (taskType !== storedTaskType) {
      throw new ConflictException(
        'Тип задания и версия условий не совпадают. Сначала пересохраните черновик в мастере.',
      );
    }
    if (taskType !== 'PLAY_TIME') {
      throw new BadRequestException(
        'Ledger fallback пока разрешён только для игрового времени.',
      );
    }

    const evaluationPolicy = nullableString(
      dto.evaluationPolicy,
    )?.toUpperCase();
    if (
      evaluationPolicy !== 'LIVE_PRIMARY' &&
      evaluationPolicy !== 'LIVE_WITH_LEDGER_FALLBACK'
    ) {
      throw new BadRequestException(
        'Разрешены только LIVE_PRIMARY и LIVE_WITH_LEDGER_FALLBACK.',
      );
    }

    const updated = await this.prisma.guestGameMission.updateMany({
      where: {
        id,
        tenantId: user.tenantId,
        status: 'DRAFT',
        definitionVersion: guestGameMissionDefinitionVersion,
        missionType: mission.missionType,
        updatedAt: mission.updatedAt,
      },
      data: { evaluationPolicy },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Черновик изменился одновременно с переключением источника. Обновите страницу и повторите.',
      );
    }

    const row = await this.prisma.guestGameMission.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      include: missionInclude,
    });
    return mapMission(row);
  }

  async deleteMission(
    user: AuthenticatedUser,
    id: string,
    options: GuestGameRuleDeleteOptions = {},
  ): Promise<GuestGameRuleDeleteResult> {
    const mission = await this.assertMission(user, id);
    const detachedVisualEditorItems = await this.prepareRuleDelete(
      user,
      'mission',
      mission.id,
      `задание "${mission.name}"`,
      mission,
      options,
    );
    const [detachedEvents, detachedRewards] = await Promise.all([
      this.prisma.guestGameEvent.count({
        where: { tenantId: user.tenantId, missionId: mission.id },
      }),
      this.prisma.guestGameReward.count({
        where: { tenantId: user.tenantId, missionId: mission.id },
      }),
    ]);

    await this.prisma.guestGameMission.delete({
      where: { id: mission.id },
    });

    return {
      deleted: true,
      detachedEvents,
      detachedRewards,
      detachedVisualEditorItems,
    };
  }

  async getSeasons(user: AuthenticatedUser): Promise<GuestGameSeason[]> {
    const rows = await this.prisma.guestGameSeason.findMany({
      where: { tenantId: user.tenantId },
      include: seasonInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map(mapSeason);
  }

  async createSeason(
    user: AuthenticatedUser,
    dto: GuestGameSeasonDto,
  ): Promise<GuestGameSeason> {
    const data = (await this.buildSeasonData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameSeasonUncheckedCreateInput;
    const row = await this.prisma.guestGameSeason.create({
      data,
      include: seasonInclude,
    });
    const season = mapSeason(row);

    await this.reconcileActiveSeasonStores(user, season);

    return season;
  }

  async updateSeason(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameSeasonUpdateDto,
  ): Promise<GuestGameSeason> {
    const current = await this.assertSeason(user, id);
    const data = await this.buildSeasonData(
      user,
      dto,
      false,
      guestGameStringArray(current.storeIds),
      current.levels,
    );
    const updated = await this.prisma.guestGameSeason.updateMany({
      where: { id, tenantId: user.tenantId, updatedAt: current.updatedAt },
      data,
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Battle Pass изменился одновременно с сохранением. Обновите страницу и повторите.',
      );
    }
    const row = await this.prisma.guestGameSeason.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      include: seasonInclude,
    });
    const season = mapSeason(row);

    await this.reconcileActiveSeasonStores(user, season);

    return season;
  }

  async updateBattlePassStepEvaluationPolicy(
    user: AuthenticatedUser,
    seasonId: string,
    stepSequence: string,
    dto: GuestGameBattlePassStepEvaluationPolicyDto,
  ): Promise<GuestGameSeason> {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Менять источник оценки шага Battle Pass могут только владелец, администратор или менеджер.',
      );
    }

    const season = await this.assertSeason(user, seasonId);
    if (season.status !== 'ACTIVE' && season.status !== 'DRAFT') {
      throw new ConflictException(
        'Политику источника можно менять только у активного сезона или черновика Battle Pass.',
      );
    }

    const expectedUpdatedAt = dateValue(dto.expectedUpdatedAt);
    if (!(expectedUpdatedAt instanceof Date)) {
      throw new BadRequestException(
        'Для безопасного обновления укажите expectedUpdatedAt сезона.',
      );
    }

    const evaluationPolicy = nullableString(
      dto.evaluationPolicy,
    )?.toUpperCase();
    if (
      evaluationPolicy !== 'LIVE_PRIMARY' &&
      evaluationPolicy !== 'LIVE_WITH_LEDGER_FALLBACK'
    ) {
      throw new BadRequestException(
        'Разрешены только LIVE_PRIMARY и LIVE_WITH_LEDGER_FALLBACK.',
      );
    }

    if (!Array.isArray(season.levels)) {
      throw new ConflictException('В Battle Pass нет настраиваемых шагов.');
    }

    const sequence = Number(stepSequence.trim());
    if (!Number.isInteger(sequence) || sequence <= 0) {
      throw new BadRequestException(
        'Порядковый номер шага Battle Pass должен быть положительным целым числом.',
      );
    }

    // Runtime evaluates Battle Pass steps after discarding invalid levels and
    // sorting by level. Address the exact same canonical sequence here while
    // retaining the original array index for a one-field JSON update.
    const canonicalSteps = season.levels
      .map((item, originalIndex) => ({
        originalIndex,
        level: dryRunNumber(jsonRecord(item).level, originalIndex + 1),
      }))
      .filter((step) => step.level > 0)
      .sort((left, right) => left.level - right.level)
      .map((step, index) => ({ ...step, sequence: index + 1 }));
    const selectedStep = canonicalSteps.find(
      (step) => step.sequence === sequence,
    );
    if (!selectedStep) {
      throw new NotFoundException('Шаг Battle Pass не найден.');
    }

    const stepIndex = selectedStep.originalIndex;
    const level = jsonRecord(season.levels[stepIndex]);
    const stableStepId =
      nullableString(level.id) ?? `bp-step-${randomBytes(8).toString('hex')}`;
    const activationRules = jsonRecord(
      level.activationRules as Prisma.JsonValue | null,
    );
    const schemaVersion = dryRunNumber(activationRules.schemaVersion, 1);
    const taskType = nullableString(activationRules.taskType)?.toUpperCase();
    if (
      schemaVersion !== guestGameMissionDefinitionVersion ||
      taskType !== 'PLAY_TIME'
    ) {
      throw new BadRequestException(
        'Ledger fallback разрешён только для шага PLAY_TIME контракта v2.',
      );
    }

    const levels = season.levels.map((item, index) =>
      index === stepIndex
        ? cleanJsonRecord({
            ...level,
            id: stableStepId,
            activationRules: cleanJsonRecord({
              ...activationRules,
              evaluationPolicy,
            }),
          })
        : item,
    ) as Prisma.InputJsonValue;

    const updated = await this.prisma.guestGameSeason.updateMany({
      where: {
        id: seasonId,
        tenantId: user.tenantId,
        status: { in: ['ACTIVE', 'DRAFT'] },
        updatedAt: expectedUpdatedAt,
      },
      data: { levels },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Battle Pass изменился одновременно с переключением источника оценки. Обновите страницу и повторите.',
      );
    }

    const row = await this.prisma.guestGameSeason.findFirstOrThrow({
      where: { id: seasonId, tenantId: user.tenantId },
      include: seasonInclude,
    });
    return mapSeason(row);
  }

  private async reconcileActiveSeasonStores(
    user: AuthenticatedUser,
    activeSeason: GuestGameSeason,
  ) {
    if (
      activeSeason.status !== 'ACTIVE' ||
      !isoPeriodIsActive(activeSeason.periodFrom, activeSeason.periodTo)
    ) {
      return;
    }

    const [stores, competingSeasons] = await Promise.all([
      this.getPilotStores(user),
      this.prisma.guestGameSeason.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          id: { not: activeSeason.id },
        },
        select: {
          id: true,
          storeIds: true,
          periodFrom: true,
          periodTo: true,
        },
      }),
    ]);
    const allStoreIds = stores.map((store) => store.id);
    const targetStoreIds = activeSeason.storeIds.length
      ? activeSeason.storeIds
      : allStoreIds;

    await Promise.all(
      (competingSeasons ?? [])
        .filter(
          (season) =>
            databasePeriodIsActive(season.periodFrom, season.periodTo) &&
            ruleStoreSetsOverlap(
              stringArray(season.storeIds),
              targetStoreIds,
              allStoreIds,
            ),
        )
        .map((season) =>
          this.prisma.guestGameSeason.update({
            where: { id: season.id },
            data: visualStoreDetachManyData(
              stringArray(season.storeIds),
              targetStoreIds,
              allStoreIds,
            ),
          }),
        ),
    );
  }

  async deleteSeason(
    user: AuthenticatedUser,
    id: string,
    options: GuestGameRuleDeleteOptions = {},
  ): Promise<GuestGameRuleDeleteResult> {
    const season = await this.assertSeason(user, id);
    const detachedVisualEditorItems = await this.prepareRuleDelete(
      user,
      'season',
      season.id,
      `Battle Pass "${season.name}"`,
      season,
      options,
    );
    const [detachedEvents, detachedRewards] = await Promise.all([
      this.prisma.guestGameEvent.count({
        where: { tenantId: user.tenantId, seasonId: season.id },
      }),
      this.prisma.guestGameReward.count({
        where: { tenantId: user.tenantId, seasonId: season.id },
      }),
    ]);

    await this.prisma.guestGameSeason.delete({
      where: { id: season.id },
    });

    return {
      deleted: true,
      detachedEvents,
      detachedRewards,
      detachedVisualEditorItems,
    };
  }

  async getPromoCards(user: AuthenticatedUser): Promise<GuestGamePromoCard[]> {
    const rows = await this.prisma.guestGamePromoCard.findMany({
      where: { tenantId: user.tenantId },
      include: promoCardInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map(mapPromoCard);
  }

  async createPromoCard(
    user: AuthenticatedUser,
    dto: GuestGamePromoCardDto,
  ): Promise<GuestGamePromoCard> {
    const data = this.buildPromoCardData(
      user,
      dto,
      true,
    ) as Prisma.GuestGamePromoCardUncheckedCreateInput;
    const row = await this.prisma.guestGamePromoCard.create({
      data,
      include: promoCardInclude,
    });

    return mapPromoCard(row);
  }

  async updatePromoCard(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGamePromoCardUpdateDto,
  ): Promise<GuestGamePromoCard> {
    await this.assertPromoCard(user, id);
    const data = this.buildPromoCardData(user, dto, false);
    const row = await this.prisma.guestGamePromoCard.update({
      where: { id },
      data,
      include: promoCardInclude,
    });

    return mapPromoCard(row);
  }

  async deletePromoCard(
    user: AuthenticatedUser,
    id: string,
    options: GuestGameRuleDeleteOptions = {},
  ): Promise<GuestGameRuleDeleteResult> {
    const promoCard = await this.assertPromoCard(user, id);
    const detachedVisualEditorItems = await this.prepareRuleDelete(
      user,
      'promoCard',
      promoCard.id,
      `промо-баннер "${promoCard.title}"`,
      promoCard,
      options,
    );

    await this.prisma.guestGamePromoCard.delete({
      where: { id: promoCard.id },
    });

    return {
      deleted: true,
      detachedEvents: 0,
      detachedRewards: 0,
      detachedVisualEditorItems,
    };
  }

  async getVisualEditorDraft(
    user: AuthenticatedUser,
    dto: Pick<GuestGameVisualDraftDto, 'id' | 'storeId'> = {},
  ): Promise<GuestGameVisualDraft> {
    if (dto.id) {
      return mapVisualDraft(await this.assertVisualDraft(user, dto.id));
    }

    const store = await this.resolveVisualEditorStore(user, dto.storeId);
    const [draftRow, publishedRow] = await Promise.all([
      this.prisma.guestGameVisualDraft.findFirst({
        where: {
          tenantId: user.tenantId,
          storeId: store.id,
          status: 'DRAFT',
        },
        include: visualDraftInclude,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.guestGameVisualDraft.findFirst({
        where: {
          tenantId: user.tenantId,
          storeId: store.id,
          status: 'PUBLISHED',
        },
        include: visualDraftInclude,
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    if (draftRow) {
      const livePayload = await this.mergeVisualEditorPayloadWithLiveRules(
        user,
        store.id,
        normalizeVisualEditorPayload(draftRow.payload),
      );

      if (!visualEditorPayloadEquals(draftRow.payload, livePayload)) {
        return mapVisualDraft(
          await this.prisma.guestGameVisualDraft.update({
            where: { id: draftRow.id },
            data: {
              payload: livePayload,
              updatedByUserId: actorUserId(user),
            },
            include: visualDraftInclude,
          }),
        );
      }

      return mapVisualDraft(draftRow);
    }

    if (publishedRow) {
      return mapVisualDraft(
        await this.upsertVisualEditorDraft(
          user,
          store,
          await this.mergeVisualEditorPayloadWithLiveRules(
            user,
            store.id,
            normalizeVisualEditorPayload(publishedRow.payload),
          ),
          null,
        ),
      );
    }

    return mapVisualDraft(await this.createVisualEditorDraft(user, store));
  }

  async updateVisualEditorDraft(
    user: AuthenticatedUser,
    dto: GuestGameVisualDraftDto,
  ): Promise<GuestGameVisualDraft> {
    const store = await this.resolveVisualEditorStore(user, dto.storeId);
    const existingDraft = dto.id
      ? await this.assertVisualDraft(user, dto.id)
      : null;
    const payload = await this.materializeVisualEditorPayload(
      user,
      store,
      normalizeVisualEditorPayload(dto.payload),
      'draft',
    );
    const note = nullableString(dto.note) ?? null;
    const updatedByUserId = actorUserId(user);
    const row = existingDraft
      ? await this.prisma.guestGameVisualDraft.update({
          where: { id: existingDraft.id },
          data: {
            storeId: store.id,
            payload: payload,
            note,
            updatedByUserId,
          },
          include: visualDraftInclude,
        })
      : await this.upsertVisualEditorDraft(user, store, payload, note);

    return mapVisualDraft(row);
  }

  async publishVisualEditorDraft(
    user: AuthenticatedUser,
    dto: GuestGameVisualDraftDto,
  ): Promise<GuestGameVisualEditorPreview> {
    const draft = dto.id
      ? await this.assertVisualDraft(user, dto.id)
      : await this.assertVisualDraft(
          user,
          (await this.getVisualEditorDraft(user, dto)).id,
        );
    const store =
      draft.store ?? (await this.resolveVisualEditorStore(user, draft.storeId));
    const payload = normalizeVisualEditorPayload(dto.payload ?? draft.payload);

    validateVisualEditorPublish(payload);
    const publishedPayload = await this.materializeVisualEditorPayload(
      user,
      store,
      payload,
      'publish',
    );

    const row = await this.prisma.guestGameVisualDraft.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        payload: publishedPayload,
        note: nullableString(dto.note) ?? draft.note,
        updatedByUserId: actorUserId(user),
        publishedByUserId: actorUserId(user),
        publishedAt: new Date(),
      },
      include: visualDraftInclude,
    });
    const mapped = mapVisualDraft(row);

    return {
      draft: mapped,
      summary: this.buildVisualEditorPreviewSummary(
        user,
        store,
        publishedPayload,
      ),
    };
  }

  async getVisualEditorPreview(
    user: AuthenticatedUser,
    dto: Pick<GuestGameVisualDraftDto, 'id' | 'storeId'> = {},
  ): Promise<GuestGameVisualEditorPreview> {
    const draft = await this.getVisualEditorDraft(user, dto);
    const store = await this.resolveVisualEditorStore(
      user,
      draft.store?.id ?? dto.storeId,
    );

    return {
      draft,
      summary: this.buildVisualEditorPreviewSummary(user, store, draft.payload),
    };
  }

  async getVisualEditorEventSyncStatus(
    user: AuthenticatedUser,
  ): Promise<GuestGameVisualEventSyncStatus> {
    const [stores, lootBoxes, missions, publishedRows] = await Promise.all([
      this.getPilotStores(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.findVisualEditorDraftRows(user, ['PUBLISHED']),
    ]);

    return this.buildVisualEditorEventSyncStatus(
      stores,
      lootBoxes,
      missions,
      publishedRows,
    );
  }

  async syncVisualEditorEvents(
    user: AuthenticatedUser,
    dto: GuestGameVisualEventSyncDto = {},
  ): Promise<GuestGameVisualEventSyncResult> {
    const [stores, lootBoxes, missions, rows] = await Promise.all([
      this.getPilotStores(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.findVisualEditorDraftRows(user, ['DRAFT', 'PUBLISHED']),
    ]);
    const published = dto.publish === true;
    const statusBefore = this.buildVisualEditorEventSyncStatus(
      stores,
      lootBoxes,
      missions,
      rows.filter((row) => row.status === 'PUBLISHED'),
    );
    const requestedStoreIds = uniqueStrings(
      Array.isArray(dto.storeIds)
        ? dto.storeIds.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
    );
    const targetStoreIds = requestedStoreIds.length
      ? requestedStoreIds
      : statusBefore.stores.map((item) => item.storeId);
    const targetStoreIdSet = new Set(targetStoreIds);
    const targetStores = stores.filter((store) =>
      targetStoreIdSet.has(store.id),
    );
    const drafts: GuestGameVisualDraft[] = [];

    for (const store of targetStores) {
      const row = await this.upsertVisualEditorEventSyncDraft(
        user,
        store,
        rows,
        this.buildVisualEditorEventPayloadFromRules(
          await this.visualEditorEventSyncBasePayload(user, store, rows),
          lootBoxes,
          missions,
          store.id,
        ),
        published,
      );
      drafts.push(mapVisualDraft(row));
    }

    const refreshedRows = await this.findVisualEditorDraftRows(user, [
      'PUBLISHED',
    ]);

    return {
      published,
      drafts,
      status: this.buildVisualEditorEventSyncStatus(
        stores,
        lootBoxes,
        missions,
        refreshedRows,
      ),
    };
  }

  private async findVisualEditorDraftRows(
    user: AuthenticatedUser,
    statuses: string[],
  ): Promise<VisualDraftRow[]> {
    return this.prisma.guestGameVisualDraft.findMany({
      where: { tenantId: user.tenantId, status: { in: statuses } },
      include: visualDraftInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private buildVisualEditorEventSyncStatus(
    stores: PilotStoreRow[],
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    publishedRows: VisualDraftRow[],
  ): GuestGameVisualEventSyncStatus {
    const publishedByStoreId = latestVisualDraftByStoreId(publishedRows);
    const storeDiffs = stores
      .map((store) => {
        const publishedDraft = publishedByStoreId.get(store.id) ?? null;
        const publishedPayload = normalizeVisualEditorPayload(
          publishedDraft?.payload ?? null,
        );
        const currentPayload = this.buildVisualEditorEventPayloadFromRules(
          publishedPayload,
          lootBoxes,
          missions,
          store.id,
        );
        const lootBoxDiff = visualEventSyncDiff(
          visualRuleRefs(
            currentPayload.lootBoxes.map((item) => ({
              id: item.id,
              label: item.title,
            })),
          ),
          visualRuleRefs(
            publishedPayload.lootBoxes.map((item) => ({
              id: item.id,
              label: item.title,
            })),
          ),
        );
        const missionDiff = visualEventSyncDiff(
          visualRuleRefs(
            currentPayload.missions.map((item) => ({
              id: item.id,
              label: item.title,
            })),
          ),
          visualRuleRefs(
            publishedPayload.missions.map((item) => ({
              id: item.id,
              label: item.title,
            })),
          ),
        );

        return {
          storeId: store.id,
          storeName: store.name,
          draftId: publishedDraft?.id ?? null,
          publishedAt: iso(publishedDraft?.publishedAt ?? null),
          addedLootBoxes: lootBoxDiff.added,
          removedLootBoxes: lootBoxDiff.removed,
          addedMissions: missionDiff.added,
          removedMissions: missionDiff.removed,
        };
      })
      .filter((item) => visualEventSyncStoreIsDirty(item));

    return {
      dirty: storeDiffs.length > 0,
      checkedAt: new Date().toISOString(),
      stores: storeDiffs,
    };
  }

  private buildVisualEditorEventPayloadFromRules(
    basePayload: GuestGameVisualEditorPayload,
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    storeId: string,
  ): GuestGameVisualEditorPayload {
    return this.mergeVisualEditorPayloadFromRules(
      basePayload,
      { lootBoxes, missions },
      storeId,
    );
  }

  private async mergeVisualEditorPayloadWithLiveRules(
    user: AuthenticatedUser,
    storeId: string,
    basePayload: GuestGameVisualEditorPayload,
  ): Promise<GuestGameVisualEditorPayload> {
    const [seasons, lootBoxes, missions, promoCards] = await Promise.all([
      this.getSeasons(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getPromoCards(user),
    ]);

    return this.mergeVisualEditorPayloadFromRules(
      basePayload,
      { seasons, lootBoxes, missions, promoCards },
      storeId,
    );
  }

  private mergeVisualEditorPayloadFromRules(
    basePayload: GuestGameVisualEditorPayload,
    rules: {
      seasons?: GuestGameSeason[];
      lootBoxes?: GuestGameLootBox[];
      missions?: GuestGameMission[];
      promoCards?: GuestGamePromoCard[];
    },
    storeId: string,
  ): GuestGameVisualEditorPayload {
    const liveSeason =
      rules.seasons?.find(
        (item) =>
          ruleMatchesPilotStore(item, storeId) &&
          visualRulePeriodIsActive(item.periodFrom, item.periodTo),
      ) ?? null;
    const liveCheckInMission =
      rules.missions?.find(
        (item) =>
          item.status === 'ACTIVE' &&
          visualRulePeriodIsActive(item.periodFrom, item.periodTo) &&
          (item.missionType === 'CHECK_IN' ||
            item.triggerKind === 'CHECK_IN') &&
          ruleMatchesStoreIds(item.storeIds, storeId),
      ) ?? null;
    const visibleLootBoxes = rules.lootBoxes?.filter(lootBoxVisibleInCatalog);
    const liveLootBoxes = visibleLootBoxes
      ?.filter((item) => ruleMatchesPilotStore(item, storeId))
      .slice(0, 8)
      .map(visualLootBoxFromRule);
    const liveMissions = rules.missions
      ?.filter(
        (item) =>
          item.missionType !== 'CHECK_IN' &&
          item.triggerKind !== 'CHECK_IN' &&
          ruleMatchesPilotStore(item, storeId) &&
          visualRulePeriodIsActive(item.periodFrom, item.periodTo),
      )
      .slice(0, 8)
      .map(visualMissionFromRule);
    const livePromoCards = rules.promoCards
      ?.filter(
        (item) =>
          item.status === 'ACTIVE' &&
          visualRulePeriodIsActive(item.periodFrom, item.periodTo) &&
          ruleMatchesStoreIds(item.storeIds, storeId),
      )
      .slice(0, promoBannerDisplayLimit)
      .map(visualPromoFromRule);

    return normalizeVisualEditorPayload({
      ...basePayload,
      battlePass: rules.seasons
        ? mergeVisualBattlePassFromLive(
            basePayload.battlePass,
            liveSeason ? visualBattlePassFromSeason(liveSeason) : null,
            rules.seasons,
          )
        : basePayload.battlePass,
      lootBoxes: visibleLootBoxes
        ? mergeVisualEditorRuleItems(
            basePayload.lootBoxes,
            liveLootBoxes ?? [],
            visibleLootBoxes,
            12,
          )
        : basePayload.lootBoxes,
      missions: rules.missions
        ? mergeVisualEditorRuleItems(
            basePayload.missions,
            liveMissions ?? [],
            rules.missions,
            24,
          )
        : basePayload.missions,
      promoCards: rules.promoCards
        ? mergeVisualEditorRuleItems(
            basePayload.promoCards,
            livePromoCards ?? [],
            rules.promoCards,
            12,
          )
        : basePayload.promoCards,
      checkIn: rules.missions
        ? liveCheckInMission
          ? visualCheckInFromMission(liveCheckInMission)
          : basePayload.checkIn
        : basePayload.checkIn,
    });
  }

  private async visualEditorEventSyncBasePayload(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    rows: VisualDraftRow[],
  ): Promise<GuestGameVisualEditorPayload> {
    const storeRows = rows.filter((row) => row.storeId === store.id);
    const draftRow =
      storeRows.find((row) => row.status === 'DRAFT') ??
      storeRows.find((row) => row.status === 'PUBLISHED') ??
      null;

    if (draftRow) {
      return normalizeVisualEditorPayload(draftRow.payload);
    }

    return this.buildVisualEditorPayloadFromLive(user, store.id);
  }

  private async upsertVisualEditorEventSyncDraft(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    rows: VisualDraftRow[],
    payload: GuestGameVisualEditorPayload,
    publish: boolean,
  ): Promise<VisualDraftRow> {
    const storeRows = rows.filter((row) => row.storeId === store.id);
    const existing =
      storeRows.find((row) => row.status === 'DRAFT') ??
      storeRows.find((row) => row.status === 'PUBLISHED') ??
      null;
    const actorId = actorUserId(user);
    const note = publish
      ? 'Опубликовано после синхронизации игровых событий.'
      : 'Черновик синхронизирован с расширенными игровыми правилами.';

    if (publish) {
      validateVisualEditorPublish(payload);
    }

    if (existing) {
      return this.prisma.guestGameVisualDraft.update({
        where: { id: existing.id },
        data: {
          status: publish ? 'PUBLISHED' : 'DRAFT',
          payload,
          note,
          updatedByUserId: actorId,
          ...(publish
            ? {
                publishedByUserId: actorId,
                publishedAt: new Date(),
              }
            : {}),
        },
        include: visualDraftInclude,
      });
    }

    return this.prisma.guestGameVisualDraft.create({
      data: {
        tenantId: user.tenantId,
        storeId: store.id,
        status: publish ? 'PUBLISHED' : 'DRAFT',
        payload,
        note,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        ...(publish
          ? {
              publishedByUserId: actorId,
              publishedAt: new Date(),
            }
          : {}),
      },
      include: visualDraftInclude,
    });
  }

  private async upsertVisualEditorDraft(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    payload: GuestGameVisualEditorPayload,
    note: string | null,
  ): Promise<VisualDraftRow> {
    const existing = await this.prisma.guestGameVisualDraft.findFirst({
      where: { tenantId: user.tenantId, storeId: store.id, status: 'DRAFT' },
      include: visualDraftInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (existing) {
      return this.prisma.guestGameVisualDraft.update({
        where: { id: existing.id },
        data: {
          payload: payload,
          note,
          updatedByUserId: actorUserId(user),
        },
        include: visualDraftInclude,
      });
    }

    return this.prisma.guestGameVisualDraft.create({
      data: {
        tenantId: user.tenantId,
        storeId: store.id,
        createdByUserId: actorUserId(user),
        updatedByUserId: actorUserId(user),
        payload: payload,
        note,
      },
      include: visualDraftInclude,
    });
  }

  private async createVisualEditorDraft(
    user: AuthenticatedUser,
    store: PilotStoreRow,
  ): Promise<VisualDraftRow> {
    return this.prisma.guestGameVisualDraft.create({
      data: {
        tenantId: user.tenantId,
        storeId: store.id,
        createdByUserId: actorUserId(user),
        updatedByUserId: actorUserId(user),
        payload: await this.buildVisualEditorPayloadFromLive(user, store.id),
      },
      include: visualDraftInclude,
    });
  }

  private async resolveVisualEditorStore(
    user: AuthenticatedUser,
    storeId?: string | null,
  ): Promise<PilotStoreRow> {
    if (storeId) {
      const row = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId: user.tenantId, isActive: true },
        select: pilotStoreSelect,
      });

      if (!row) {
        throw new NotFoundException('Клуб для визуального редактора не найден');
      }

      return row;
    }

    const store = pickPilotStore(await this.getPilotStores(user));

    if (!store) {
      throw new BadRequestException(
        'Для визуального редактора нужен активный клуб',
      );
    }

    return store;
  }

  private async assertVisualDraft(
    user: AuthenticatedUser,
    id: string,
  ): Promise<VisualDraftRow> {
    const row = await this.prisma.guestGameVisualDraft.findFirst({
      where: { id, tenantId: user.tenantId },
      include: visualDraftInclude,
    });

    if (!row) {
      throw new NotFoundException('Черновик визуального редактора не найден');
    }

    return row;
  }

  private async prepareRuleDelete(
    user: AuthenticatedUser,
    kind: VisualEditorUsageKind,
    id: string,
    label: string,
    rule: {
      status?: string | null;
      storeIds?: Prisma.JsonValue | null;
    },
    options: GuestGameRuleDeleteOptions,
  ): Promise<number> {
    const visualUsages = await this.findPublishedVisualEditorRuleUsages(
      user,
      kind,
      id,
    );
    const advancedUsages = await this.findAdvancedRuleActivityUsages(
      user,
      rule.status,
      stringArray(rule.storeIds ?? null),
    );
    const detachVisualEditor = booleanValue(options.detachVisualEditor);
    const deleteActiveRule = booleanValue(options.deleteActiveRule);
    const blockedUsages: RuleDeleteActivityUsage[] = [];

    if (visualUsages.length && !detachVisualEditor) {
      blockedUsages.push(
        ...visualUsages.map((usage) => ({
          ...usage,
          source: 'visualEditor' as const,
        })),
      );
    }

    if (advancedUsages.length && !deleteActiveRule) {
      blockedUsages.push(...advancedUsages);
    }

    if (blockedUsages.length) {
      throw new ConflictException(
        ruleDeleteActivityConfirmation(label, blockedUsages),
      );
    }

    return this.detachRuleFromVisualEditorPayloads(user, kind, id);
  }

  private async findAdvancedRuleActivityUsages(
    user: AuthenticatedUser,
    status: string | null | undefined,
    storeIds: string[],
  ): Promise<RuleDeleteActivityUsage[]> {
    if (status !== 'ACTIVE') {
      return [];
    }

    if (!storeIds.length) {
      return [
        {
          source: 'advanced',
          storeId: null,
          storeName: 'все клубы сети',
          status,
        },
      ];
    }

    const stores = await this.prisma.store.findMany({
      where: { tenantId: user.tenantId, id: { in: storeIds } },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
      },
    });
    const storesById = new Map(stores.map((store) => [store.id, store]));

    return storeIds.map((storeId) => {
      const store = storesById.get(storeId);

      return {
        source: 'advanced',
        storeId,
        storeName: store
          ? visualEditorUsageStoreName(store)
          : `клуб ${storeId}`,
        status,
      };
    });
  }

  private async findPublishedVisualEditorRuleUsages(
    user: AuthenticatedUser,
    kind: VisualEditorUsageKind,
    id: string,
  ): Promise<VisualEditorRuleUsage[]> {
    const rows = await this.prisma.guestGameVisualDraft.findMany({
      where: { tenantId: user.tenantId, status: 'PUBLISHED' },
      select: {
        id: true,
        storeId: true,
        status: true,
        payload: true,
        publishedAt: true,
        updatedAt: true,
        store: {
          select: {
            name: true,
            city: true,
            address: true,
          },
        },
      },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return rows
      .filter((row) => visualEditorPayloadUsesRule(row.payload, kind, id))
      .map((row) => ({
        draftId: row.id,
        storeId: row.storeId,
        storeName: visualEditorUsageStoreName(row.store),
        status: row.status,
        publishedAt: iso(row.publishedAt),
        updatedAt: row.updatedAt.toISOString(),
      }));
  }

  private async detachRuleFromVisualEditorPayloads(
    user: AuthenticatedUser,
    kind: VisualEditorUsageKind,
    id: string,
  ) {
    const rows = await this.prisma.guestGameVisualDraft.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        payload: true,
      },
    });
    const updates: Array<Promise<unknown>> = [];

    for (const row of rows) {
      const payload = normalizeVisualEditorPayload(row.payload);
      const nextPayload = detachVisualEditorRule(payload, kind, id);

      if (!nextPayload) {
        continue;
      }

      updates.push(
        this.prisma.guestGameVisualDraft.update({
          where: { id: row.id },
          data: {
            payload: nextPayload,
            updatedByUserId: actorUserId(user),
          },
        }),
      );
    }

    await Promise.all(updates);
    return updates.length;
  }

  private async buildVisualEditorPayloadFromLive(
    user: AuthenticatedUser,
    storeId: string,
  ): Promise<GuestGameVisualEditorPayload> {
    const [seasons, lootBoxes, missions, promoCards] = await Promise.all([
      this.getSeasons(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getPromoCards(user),
    ]);
    const season =
      seasons.find(
        (item) =>
          ruleMatchesPilotStore(item, storeId) &&
          visualRulePeriodIsActive(item.periodFrom, item.periodTo),
      ) ?? null;
    const checkInMission = missions.find(
      (item) =>
        item.status === 'ACTIVE' &&
        visualRulePeriodIsActive(item.periodFrom, item.periodTo) &&
        (item.missionType === 'CHECK_IN' || item.triggerKind === 'CHECK_IN') &&
        ruleMatchesStoreIds(item.storeIds, storeId),
    );

    return normalizeVisualEditorPayload({
      version: 1,
      battlePass: visualBattlePassFromSeason(season),
      lootBoxes: lootBoxes
        .filter((item) => ruleMatchesPilotStore(item, storeId))
        .slice(0, 8)
        .map(visualLootBoxFromRule),
      missions: missions
        .filter(
          (item) =>
            item.missionType !== 'CHECK_IN' &&
            item.triggerKind !== 'CHECK_IN' &&
            ruleMatchesPilotStore(item, storeId) &&
            visualRulePeriodIsActive(item.periodFrom, item.periodTo),
        )
        .slice(0, 8)
        .map(visualMissionFromRule),
      promoCards: promoCards
        .filter(
          (item) =>
            item.status === 'ACTIVE' &&
            visualRulePeriodIsActive(item.periodFrom, item.periodTo) &&
            ruleMatchesStoreIds(item.storeIds, storeId),
        )
        .slice(0, promoBannerDisplayLimit)
        .map(visualPromoFromRule),
      checkIn: visualCheckInFromMission(checkInMission ?? null),
    });
  }

  private async materializeVisualEditorPayload(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    payload: GuestGameVisualEditorPayload,
    mode: 'draft' | 'publish',
  ): Promise<GuestGameVisualEditorPayload> {
    const storeIds = [store.id];
    const publish = mode === 'publish';
    let battlePass = payload.battlePass;

    if (payload.battlePass.enabled) {
      const seasonPayload = publish
        ? payload
        : {
            ...payload,
            battlePass: {
              ...payload.battlePass,
              status: 'DRAFT' as StatusValue,
            },
          };
      if (payload.battlePass.id) {
        if (publish) {
          const existingSeason = await this.assertSeason(
            user,
            payload.battlePass.id,
          );
          const seasonData = buildVisualSeasonData(
            user,
            visualStoreIdsForExistingRule(
              stringArray(existingSeason.storeIds),
              store.id,
            ),
            seasonPayload,
            existingSeason.levels,
          );
          const updated = await this.prisma.guestGameSeason.updateMany({
            where: {
              id: payload.battlePass.id,
              tenantId: user.tenantId,
              updatedAt: existingSeason.updatedAt,
            },
            data: seasonData,
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Battle Pass изменился одновременно с публикацией визуального редактора. Обновите страницу и повторите.',
            );
          }
          const row = await this.prisma.guestGameSeason.findFirstOrThrow({
            where: {
              id: payload.battlePass.id,
              tenantId: user.tenantId,
            },
            include: seasonInclude,
          });
          battlePass = visualBattlePassFromSeason(mapSeason(row));
        }
      } else {
        const seasonData = buildVisualSeasonData(user, storeIds, seasonPayload);
        const row = await this.prisma.guestGameSeason.create({
          data: seasonData,
          include: seasonInclude,
        });
        battlePass = visualBattlePassFromSeason(mapSeason(row));
      }
    }

    const lootBoxes: GuestGameVisualEditorLootBox[] = [];
    for (const lootBox of payload.lootBoxes) {
      const item = publish
        ? lootBox
        : { ...lootBox, status: 'DRAFT' as StatusValue };
      if (lootBox.id) {
        if (publish) {
          const existingLootBox = await this.assertLootBox(user, lootBox.id);
          const data = buildVisualLootBoxData(
            user,
            visualStoreIdsForExistingRule(
              stringArray(existingLootBox.storeIds),
              store.id,
            ),
            item,
            existingLootBox.limits,
          );
          const row = await this.prisma.guestGameLootBox.update({
            where: { id: lootBox.id },
            data,
            include: lootBoxInclude,
          });
          lootBoxes.push(visualLootBoxFromRule(mapLootBox(row)));
        } else {
          lootBoxes.push(lootBox);
        }
      } else {
        const data = buildVisualLootBoxData(user, storeIds, item);
        const row = await this.prisma.guestGameLootBox.create({
          data: data,
          include: lootBoxInclude,
        });
        lootBoxes.push(visualLootBoxFromRule(mapLootBox(row)));
      }
    }

    const missions: GuestGameVisualEditorMission[] = [];
    for (const mission of payload.missions) {
      const item = publish
        ? mission
        : { ...mission, status: 'DRAFT' as StatusValue };
      if (mission.id) {
        if (publish) {
          const existingMission = await this.assertMission(user, mission.id);
          const data = buildVisualMissionData(
            user,
            visualStoreIdsForExistingRule(
              stringArray(existingMission.storeIds),
              store.id,
            ),
            item,
          );
          const row = await this.prisma.guestGameMission.update({
            where: { id: mission.id },
            data,
            include: missionInclude,
          });
          missions.push(visualMissionFromRule(mapMission(row)));
        } else {
          missions.push(mission);
        }
      } else {
        const data = buildVisualMissionData(user, storeIds, item);
        const row = await this.prisma.guestGameMission.create({
          data: data,
          include: missionInclude,
        });
        missions.push(visualMissionFromRule(mapMission(row)));
      }
    }

    const promoCards: GuestGameVisualEditorPromoCard[] = [];
    for (const promoCard of payload.promoCards) {
      const item = publish
        ? promoCard
        : { ...promoCard, status: 'DRAFT' as StatusValue };
      if (promoCard.id) {
        if (publish) {
          const existingPromoCard = await this.assertPromoCard(
            user,
            promoCard.id,
          );
          const data = buildVisualPromoCardData(
            user,
            visualStoreIdsForExistingRule(
              stringArray(existingPromoCard.storeIds),
              store.id,
            ),
            item,
          );
          const row = await this.prisma.guestGamePromoCard.update({
            where: { id: promoCard.id },
            data,
            include: promoCardInclude,
          });
          promoCards.push(visualPromoFromRule(mapPromoCard(row)));
        } else {
          promoCards.push(promoCard);
        }
      } else {
        const data = buildVisualPromoCardData(user, storeIds, item);
        const row = await this.prisma.guestGamePromoCard.create({
          data: data,
          include: promoCardInclude,
        });
        promoCards.push(visualPromoFromRule(mapPromoCard(row)));
      }
    }

    const materializedPayload = normalizeVisualEditorPayload({
      ...payload,
      battlePass,
      lootBoxes,
      missions,
      promoCards,
    });

    if (publish) {
      await this.applyVisualCheckInRule(
        user,
        store.id,
        materializedPayload.checkIn,
      );
      await this.reconcilePublishedVisualEditorPayload(
        user,
        store.id,
        materializedPayload,
      );
    }

    return materializedPayload;
  }

  private async assertPromoCard(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGamePromoCard.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Промо-карточка не найдена');
    }

    return row;
  }

  private async reconcilePublishedVisualEditorPayload(
    user: AuthenticatedUser,
    storeId: string,
    payload: GuestGameVisualEditorPayload,
  ) {
    const stores = (await this.getPilotStores(user)) ?? [];
    if (!stores.length) {
      return;
    }

    const allStoreIds = stores.map((store) => store.id);
    const [seasons, lootBoxes, missions, promoCards] = await Promise.all([
      this.getSeasons(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getPromoCards(user),
    ]);
    const activeBattlePassId =
      payload.battlePass.enabled && payload.battlePass.id
        ? payload.battlePass.id
        : null;
    const activeLootBoxIds = new Set(
      payload.lootBoxes
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    );
    const activeMissionIds = new Set(
      payload.missions
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    );
    const activePromoCardIds = new Set(
      payload.promoCards
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    );
    const updates: Array<Promise<unknown>> = [];

    for (const season of seasons) {
      if (
        season.status === 'ACTIVE' &&
        season.id !== activeBattlePassId &&
        ruleMatchesStoreIds(season.storeIds, storeId)
      ) {
        updates.push(
          this.prisma.guestGameSeason.update({
            where: { id: season.id },
            data: visualStoreDetachData(season.storeIds, storeId, allStoreIds),
          }),
        );
      }
    }

    for (const lootBox of lootBoxes) {
      if (
        lootBox.status === 'ACTIVE' &&
        lootBoxVisibleInCatalog(lootBox) &&
        !activeLootBoxIds.has(lootBox.id) &&
        ruleMatchesStoreIds(lootBox.storeIds, storeId)
      ) {
        updates.push(
          this.prisma.guestGameLootBox.update({
            where: { id: lootBox.id },
            data: visualStoreDetachData(lootBox.storeIds, storeId, allStoreIds),
          }),
        );
      }
    }

    for (const mission of missions) {
      if (
        mission.status === 'ACTIVE' &&
        mission.missionType !== 'CHECK_IN' &&
        mission.triggerKind !== 'CHECK_IN' &&
        !activeMissionIds.has(mission.id) &&
        ruleMatchesStoreIds(mission.storeIds, storeId)
      ) {
        updates.push(
          this.prisma.guestGameMission.update({
            where: { id: mission.id },
            data: visualStoreDetachData(mission.storeIds, storeId, allStoreIds),
          }),
        );
      }
    }

    for (const promoCard of promoCards) {
      if (
        promoCard.status === 'ACTIVE' &&
        !activePromoCardIds.has(promoCard.id) &&
        ruleMatchesStoreIds(promoCard.storeIds, storeId)
      ) {
        updates.push(
          this.prisma.guestGamePromoCard.update({
            where: { id: promoCard.id },
            data: visualStoreDetachData(
              promoCard.storeIds,
              storeId,
              allStoreIds,
            ),
          }),
        );
      }
    }

    await Promise.all(updates);
  }

  private async applyVisualCheckInRule(
    user: AuthenticatedUser,
    storeId: string,
    checkIn: GuestGameVisualEditorCheckIn,
  ) {
    const existingRows = await this.prisma.guestGameMission.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ missionType: 'CHECK_IN' }, { triggerKind: 'CHECK_IN' }],
      },
    });
    const existing = existingRows.find((row) =>
      ruleMatchesStoreIds(stringArray(row.storeIds), storeId),
    );

    if (!checkIn.enabled) {
      if (existing) {
        const stores = await this.getPilotStores(user);
        await this.prisma.guestGameMission.update({
          where: { id: existing.id },
          data: visualStoreDetachData(
            stringArray(existing.storeIds),
            storeId,
            stores.map((store) => store.id),
          ),
        });
      }
      return;
    }

    const data = buildVisualCheckInMissionData(
      user,
      existing
        ? visualStoreIdsForExistingRule(stringArray(existing.storeIds), storeId)
        : [storeId],
      checkIn,
    );
    if (existing) {
      await this.prisma.guestGameMission.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.guestGameMission.create({
        data: data,
      });
    }
  }

  private buildVisualEditorPreviewSummary(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    payload: GuestGameVisualEditorPayload,
  ): GuestPortalGameSummary {
    return buildVisualEditorPreviewSummary(user, store, payload);
  }
  async getRewards(
    user: AuthenticatedUser,
    options: { take?: number | null } = {},
  ): Promise<GuestGameReward[]> {
    const take = options.take === null ? undefined : (options.take ?? 100);
    const rows = await this.prisma.guestGameReward.findMany({
      where: { tenantId: user.tenantId },
      include: rewardInclude,
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      ...(take ? { take } : {}),
    });

    return rows.map(mapReward);
  }

  async exportRewardsCsv(user: AuthenticatedUser): Promise<string> {
    const rewards = await this.getRewards(user);
    const header = [
      'Статус',
      'Состояние кошелька',
      'Гость',
      'Контакт',
      'Клуб',
      'Тип награды',
      'Название награды',
      'Сумма',
      'Код',
      'QR payload',
      'Создано',
      'Сгорает',
      'Выдано',
      'Источник',
      'Связанный сценарий',
      'Заметка',
    ];
    const rows = rewards.map((reward) => [
      reward.status,
      reward.walletState,
      reward.profile?.displayName ??
        reward.guest?.displayName ??
        reward.guestExternalId ??
        '',
      reward.profile?.contactMasked ?? reward.guest?.contact ?? '',
      reward.store?.name ?? '',
      reward.rewardType,
      reward.rewardLabel,
      reward.rewardAmount,
      reward.rewardCode ?? '',
      reward.claimPayload ?? '',
      reward.qualifiedAt,
      reward.expiresAt ?? '',
      reward.paidAt ?? '',
      reward.source,
      reward.lootBox?.name ?? reward.mission?.name ?? reward.season?.name ?? '',
      reward.note ?? '',
    ]);

    return [
      '\uFEFF' + header.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async getDeliveries(
    user: AuthenticatedUser,
    options: { take?: number | null } = {},
  ): Promise<GuestGameDelivery[]> {
    const take = options.take === null ? undefined : (options.take ?? 100);
    const rows = await this.prisma.guestGameDelivery.findMany({
      where: { tenantId: user.tenantId },
      include: deliveryInclude,
      orderBy: [{ preparedAt: 'desc' }, { createdAt: 'desc' }],
      ...(take ? { take } : {}),
    });

    return rows.map(mapDelivery);
  }

  async getDeliveryDispatcherStatus(
    user: AuthenticatedUser,
  ): Promise<GuestGameDeliveryDispatcherStatus> {
    const deliveries = await this.getDeliveries(user, { take: null });

    return this.buildDeliveryDispatcherStatus(deliveries);
  }

  async dispatchDeliveries(
    user: AuthenticatedUser,
    dto: GuestGameDeliveryDispatchDto = {},
  ): Promise<GuestGameDeliveryDispatchResult> {
    const channels = deliveryDispatchChannels(dto.channels);
    const limit = Math.min(100, Math.max(1, intValue(dto.limit) ?? 25));
    const requestedDryRun =
      dto.dryRun === undefined ? true : booleanValue(dto.dryRun);
    const config = deliveryProviderConfig();
    const dryRun = requestedDryRun || !config.realSendEnabled;
    const rows = await this.prisma.guestGameDelivery.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'READY',
        readinessStatus: 'READY_FOR_BOT',
        channel: { in: channels },
      },
      include: deliveryInclude,
      orderBy: [{ preparedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    const items: GuestGameDeliveryDispatchItem[] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let blocked = 0;

    for (const row of rows) {
      const channel = deliveryChannelValue(row.channel, null);

      if (channel !== 'TELEGRAM' && channel !== 'MAX') {
        skipped += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel: channel ?? 'MANUAL',
          status: 'SKIPPED',
          note: 'Dispatcher обрабатывает только Telegram/MAX outbox.',
        });
        continue;
      }

      if (row.readinessStatus !== 'READY_FOR_BOT') {
        const note =
          'Delivery не готова к бот-доставке: сначала нужны согласие, канал и подтвержденная награда.';
        blocked += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'BLOCKED',
          note,
        });
        await this.createDeliveryEvent(user, row.id, row.rewardId, {
          eventType: 'DELIVERY_DISPATCH_BLOCKED',
          fromStatus: row.status,
          toStatus: row.status,
          channel,
          note,
          payload: deliveryDispatchPayload({
            dryRun,
            providerConfigured: false,
            reason: 'readiness_status',
          }),
        });
        continue;
      }

      const provider = deliveryProviderForChannel(config, channel);
      const chatId =
        channel === 'TELEGRAM'
          ? telegramChatIdFromIdentity(row.profile?.telegramIdentity ?? null)
          : null;
      const maxIdentity =
        channel === 'MAX' ? nullableString(row.profile?.maxIdentity) : null;
      const identityReady =
        channel === 'TELEGRAM' ? chatId !== null : maxIdentity !== null;

      if (!identityReady) {
        const note = deliveryProviderBlockerNote(channel, provider, {
          identityReady,
        });
        blocked += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'BLOCKED',
          note,
        });
        await this.createDeliveryEvent(user, row.id, row.rewardId, {
          eventType: 'DELIVERY_DISPATCH_BLOCKED',
          fromStatus: row.status,
          toStatus: row.status,
          channel,
          note,
          payload: deliveryDispatchPayload({
            dryRun,
            providerConfigured: provider.configured,
            reason: 'identity_not_ready',
          }),
        });
        continue;
      }

      if (dryRun) {
        const note =
          'Dry-run dispatcher: сообщение проверено, внешняя отправка не выполнялась.';
        skipped += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'DRY_RUN',
          note,
        });
        await this.createDeliveryEvent(user, row.id, row.rewardId, {
          eventType: 'DELIVERY_DISPATCH_DRY_RUN',
          fromStatus: row.status,
          toStatus: row.status,
          channel,
          note,
          payload: deliveryDispatchPayload({
            dryRun,
            providerConfigured: provider.configured,
            reason: 'dry_run',
          }),
        });
        continue;
      }

      if (!provider.canAttemptSend) {
        const note = deliveryProviderBlockerNote(channel, provider, {
          identityReady,
        });
        blocked += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'BLOCKED',
          note,
        });
        await this.createDeliveryEvent(user, row.id, row.rewardId, {
          eventType: 'DELIVERY_DISPATCH_BLOCKED',
          fromStatus: row.status,
          toStatus: row.status,
          channel,
          note,
          payload: deliveryDispatchPayload({
            dryRun,
            providerConfigured: provider.configured,
            reason: 'provider_not_ready',
          }),
        });
        continue;
      }

      try {
        const providerPayload =
          channel === 'TELEGRAM'
            ? await sendTelegramDelivery({
                token: config.telegram.token,
                chatId: chatId ?? '',
                text: deliveryProviderMessage(row),
              })
            : await sendMaxDelivery({
                endpoint: config.max.endpoint,
                token: config.max.token,
                identity: maxIdentity ?? '',
                text: deliveryProviderMessage(row),
                row,
              });
        const now = new Date();
        const updated = await this.prisma.guestGameDelivery.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: now,
            note: `${communicationQueueChannelLabel(channel)} dispatcher: отправлено.`,
          },
          include: deliveryInclude,
        });
        sent += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'SENT',
          note: 'Сообщение отправлено через настроенный provider.',
        });
        await this.createDeliveryEvent(user, updated.id, updated.rewardId, {
          eventType: 'DELIVERY_SENT_BY_PROVIDER',
          fromStatus: row.status,
          toStatus: updated.status,
          channel,
          note: 'Сообщение отправлено через настроенный provider.',
          payload: providerPayload,
        });
      } catch (error) {
        const now = new Date();
        const note = safeDeliveryErrorMessage(error);
        const updated = await this.prisma.guestGameDelivery.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failedAt: now,
            note,
          },
          include: deliveryInclude,
        });
        failed += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'FAILED',
          note,
        });
        await this.createDeliveryEvent(user, updated.id, updated.rewardId, {
          eventType: 'DELIVERY_PROVIDER_FAILED',
          fromStatus: row.status,
          toStatus: updated.status,
          channel,
          note,
          payload: deliveryDispatchPayload({
            dryRun,
            providerConfigured: provider.configured,
            reason: 'provider_error',
          }),
        });
      }
    }

    const deliveries = await this.getDeliveries(user);
    const dispatcher = this.buildDeliveryDispatcherStatus(deliveries);

    return {
      dryRun,
      realSendEnabled: config.realSendEnabled,
      checked: rows.length,
      sent,
      failed,
      skipped,
      blocked,
      items,
      deliveries: deliveries.slice(0, 12),
      dispatcher,
      note: dryRun
        ? 'Dispatcher запущен в безопасном dry-run: события записаны, внешних Telegram/MAX-отправок не было.'
        : 'Dispatcher обработал готовые Telegram/MAX delivery через настроенные providers.',
    };
  }

  async prepareDeliveries(
    user: AuthenticatedUser,
    dto: GuestGameDeliveryPrepareDto = {},
  ): Promise<GuestGameDeliveryPrepareResult> {
    const [profiles, rewards] = await Promise.all([
      this.getProfiles(user),
      this.getRewards(user, { take: null }),
    ]);
    const rewardById = new Map(rewards.map((reward) => [reward.id, reward]));
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const requestedRewardIds = Array.isArray(dto.rewardIds)
      ? new Set(dto.rewardIds.filter((item): item is string => !!item))
      : null;
    const includeBlocked =
      dto.includeBlocked === undefined
        ? true
        : booleanValue(dto.includeBlocked);
    const limit = Math.min(100, Math.max(1, intValue(dto.limit) ?? 50));
    const queue = this.buildCommunicationQueue(profiles, rewards, null);
    const items = queue.items
      .filter((item) =>
        requestedRewardIds ? requestedRewardIds.has(item.rewardId) : true,
      )
      .filter(
        (item) =>
          includeBlocked || isReadyDeliveryQueueStatus(item.queueStatus),
      )
      .slice(0, limit);
    const deliveries: GuestGameDelivery[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      const reward = rewardById.get(item.rewardId);

      if (!reward) {
        skipped += 1;
        continue;
      }

      const profile =
        item.profileId !== null
          ? (profileById.get(item.profileId) ?? null)
          : null;
      const status = deliveryStatusFromQueueStatus(item.queueStatus);
      const now = new Date();
      const existing = await this.prisma.guestGameDelivery.findFirst({
        where: {
          tenantId: user.tenantId,
          rewardId: item.rewardId,
          channel: item.channel,
        },
        include: deliveryInclude,
      });

      if (existing && isTerminalDeliveryStatus(existing.status)) {
        skipped += 1;
        deliveries.push(mapDelivery(existing));
        continue;
      }

      const baseData = clean({
        profileId: item.profileId,
        guestId: reward.guest?.id ?? null,
        storeId: item.store?.id ?? null,
        createdByUserId: actorUserId(user),
        channel: item.channel,
        status,
        readinessStatus: item.queueStatus,
        recipientMasked: item.contactMasked,
        channelIdentityMasked: deliveryChannelIdentityMasked(
          item.channel,
          profile,
        ),
        messageTitle: buildDeliveryMessageTitle(item),
        messageBody: buildDeliveryMessageBody(item),
        blockers: item.blockers,
        metadata: deliveryMetadata(item),
        preparedAt: now,
        sentAt: status === 'SENT' ? now : null,
        failedAt: status === 'FAILED' ? now : null,
        canceledAt: status === 'CANCELED' ? now : null,
        note: item.nextAction,
      });

      const row = existing
        ? await this.prisma.guestGameDelivery.update({
            where: { id: existing.id },
            data: baseData,
            include: deliveryInclude,
          })
        : await this.prisma.guestGameDelivery.create({
            data: {
              tenantId: user.tenantId,
              rewardId: item.rewardId,
              ...baseData,
            },
            include: deliveryInclude,
          });

      await this.createDeliveryEvent(user, row.id, row.rewardId, {
        eventType: existing ? 'DELIVERY_REFRESHED' : 'DELIVERY_PREPARED',
        fromStatus: existing?.status ?? null,
        toStatus: row.status,
        channel: row.channel,
        note: item.nextAction,
        payload: deliveryMetadata(item),
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }

      deliveries.push(mapDelivery(row));
    }

    return { created, updated, skipped, deliveries };
  }

  async updateDelivery(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameDeliveryUpdateDto,
  ): Promise<GuestGameDelivery> {
    const current = await this.assertDelivery(user, id);
    const nextStatus = enumValue(
      dto.status,
      deliveryStatuses,
      deliveryStatusValue(current.status),
    );
    const currentStatus = deliveryStatusValue(current.status);
    const currentReadinessStatus = communicationQueueStatusValue(
      current.readinessStatus,
    );

    if (
      (currentStatus === 'SENT' || currentStatus === 'CANCELED') &&
      nextStatus !== currentStatus
    ) {
      throw new ConflictException(
        'Terminal delivery status cannot be changed.',
      );
    }

    if (nextStatus === 'READY') {
      if (currentStatus !== 'READY' && currentStatus !== 'FAILED') {
        throw new ConflictException(
          'Only failed delivery can be returned to READY manually.',
        );
      }

      if (!isReadyDeliveryQueueStatus(currentReadinessStatus)) {
        throw new BadRequestException(
          'Delivery readiness is not READY_FOR_BOT or READY_FOR_CASHIER.',
        );
      }
    }

    if (
      nextStatus === 'SENT' &&
      currentStatus !== 'SENT' &&
      currentStatus !== 'READY' &&
      currentStatus !== 'FAILED'
    ) {
      throw new BadRequestException(
        'Only ready or failed delivery can be marked as sent.',
      );
    }

    if (
      nextStatus === 'SENT' &&
      currentStatus !== 'SENT' &&
      !isReadyDeliveryQueueStatus(currentReadinessStatus)
    ) {
      throw new BadRequestException(
        'Delivery readiness is not READY_FOR_BOT or READY_FOR_CASHIER.',
      );
    }

    const now = new Date();
    const data = clean({
      status: nextStatus,
      note: nullableString(dto.note),
      sentAt: nextStatus === 'SENT' ? (current.sentAt ?? now) : null,
      failedAt: nextStatus === 'FAILED' ? (current.failedAt ?? now) : null,
      canceledAt:
        nextStatus === 'CANCELED'
          ? (current.canceledAt ?? now)
          : nextStatus === 'READY' || nextStatus === 'SENT'
            ? null
            : current.canceledAt,
    });
    const row = await this.prisma.guestGameDelivery.update({
      where: { id },
      data,
      include: deliveryInclude,
    });

    if (nextStatus !== current.status || dto.note !== undefined) {
      await this.createDeliveryEvent(user, row.id, row.rewardId, {
        eventType: 'DELIVERY_STATUS_UPDATED',
        fromStatus: current.status,
        toStatus: row.status,
        channel: row.channel,
        note: nullableString(dto.note),
      });
    }

    return mapDelivery(row);
  }

  async exportDeliveriesCsv(user: AuthenticatedUser): Promise<string> {
    const deliveries = await this.getDeliveries(user, { take: null });
    const header = [
      'Статус outbox',
      'Готовность',
      'Канал',
      'Гость',
      'Контакт',
      'Клуб',
      'Награда',
      'Сумма',
      'Блокировки',
      'Подготовлено',
      'Отправлено',
      'Заметка',
    ];
    const rows = deliveries.map((delivery) => [
      delivery.statusLabel,
      delivery.readinessStatusLabel,
      delivery.channelLabel,
      delivery.profile?.displayName ??
        delivery.guest?.displayName ??
        delivery.reward.guestExternalId ??
        '',
      delivery.recipientMasked ?? '',
      delivery.store?.name ?? '',
      delivery.reward.rewardLabel,
      delivery.reward.rewardAmount,
      delivery.blockers.join('; '),
      delivery.preparedAt,
      delivery.sentAt ?? '',
      delivery.note ?? '',
    ]);

    return [
      '\uFEFF' + header.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  private async assertDelivery(user: AuthenticatedUser, id: string) {
    const delivery = await this.prisma.guestGameDelivery.findFirst({
      where: { id, tenantId: user.tenantId },
      include: deliveryInclude,
    });

    if (!delivery) {
      throw new NotFoundException('Запись outbox не найдена');
    }

    return delivery;
  }

  private async createDeliveryEvent(
    user: AuthenticatedUser,
    deliveryId: string,
    rewardId: string,
    data: {
      eventType: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      channel?: string | null;
      note?: string | null;
      payload?: Prisma.InputJsonValue | null;
    },
  ) {
    await this.prisma.guestGameDeliveryEvent.create({
      data: {
        tenantId: user.tenantId,
        deliveryId,
        rewardId,
        actorUserId: user.id,
        eventType: data.eventType,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        channel: data.channel ?? null,
        note: data.note ?? null,
        payload: data.payload ?? Prisma.JsonNull,
      },
    });
  }

  async exportOverviewCsv(user: AuthenticatedUser): Promise<string> {
    const [lootBoxes, missions, seasons, rewards, events] = await Promise.all([
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getSeasons(user),
      this.getRewards(user, { take: null }),
      this.getEvents(user, { take: null }),
    ]);
    const [economy, effect] = await Promise.all([
      Promise.resolve(
        this.buildEconomy(lootBoxes, missions, seasons, rewards, events, null),
      ),
      this.buildEffect(user, lootBoxes, missions, seasons, events, null),
    ]);
    const header = [
      'Раздел',
      'Тип',
      'Сценарий',
      'Статус',
      'События',
      'Уникальные гости',
      'Награды всего',
      'Очередь наград',
      'Плановый бюджет',
      'Использовано бюджета',
      'Использование бюджета, %',
      'Погашено наград',
      'Погашено, сумма',
      'XP',
      'Измеряемые события',
      'Вернувшиеся гости',
      'Возврат, %',
      'Сессии после события',
      'Игровые минуты после события',
      'Бар/товары после события',
      'Пополнения после события',
      'Итого выручка после события',
      'Средняя выручка на вернувшегося',
      'Окно эффекта, дней',
      'Рекомендация',
    ];
    const rows: unknown[][] = [
      [
        'Экономика',
        'Сводка',
        'Все сценарии',
        '',
        economy.summary.eventsCount,
        economy.summary.uniqueGuests,
        economy.summary.rewardCount,
        economy.summary.rewardBacklog,
        economy.summary.plannedBudget,
        economy.summary.budgetUsedCost,
        economy.summary.budgetUsagePercent ?? '',
        economy.summary.paidRewards,
        economy.summary.paidCost,
        economy.summary.xpIssued,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        economy.summary.rulesWithoutBudget
          ? `Активных сценариев без бюджета: ${economy.summary.rulesWithoutBudget}`
          : '',
      ],
      ...economy.scenarios.map((scenario) => [
        'Экономика',
        gameScenarioKindLabel(scenario.kind),
        scenario.name,
        gameScenarioStatusLabel(scenario.status),
        scenario.eventsCount,
        scenario.uniqueGuests,
        scenario.rewardCount,
        scenario.pendingRewards + scenario.approvedRewards,
        scenario.plannedBudget ?? '',
        scenario.budgetUsedCost,
        scenario.budgetUsagePercent ?? '',
        scenario.paidRewards,
        scenario.paidCost,
        scenario.xpIssued,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        scenario.recommendation,
      ]),
      [
        'Эффект',
        'Сводка',
        'Все сценарии',
        '',
        effect.summary.eventsCount,
        effect.summary.reachedGuests,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        effect.summary.measuredEvents,
        effect.summary.returnedGuests,
        effect.summary.returnRatePercent ?? '',
        effect.summary.postSessions,
        effect.summary.postPlayMinutes,
        effect.summary.productRevenue,
        effect.summary.balanceTopUps,
        effect.summary.totalRevenue,
        effect.summary.averageRevenuePerReturnedGuest,
        effect.windowDays,
        '',
      ],
      ...effect.scenarios.map((scenario) => [
        'Эффект',
        gameScenarioKindLabel(scenario.kind),
        scenario.name,
        gameScenarioStatusLabel(scenario.status),
        scenario.eventsCount,
        scenario.reachedGuests,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        scenario.measuredEvents,
        scenario.returnedGuests,
        scenario.returnRatePercent ?? '',
        scenario.postSessions,
        scenario.postPlayMinutes,
        scenario.productRevenue,
        scenario.balanceTopUps,
        scenario.totalRevenue,
        scenario.averageRevenuePerReturnedGuest,
        effect.windowDays,
        scenario.recommendation,
      ]),
    ];

    return [
      '\uFEFF' + header.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n');
  }

  async createReward(
    user: AuthenticatedUser,
    dto: GuestGameRewardDto,
    canonicalIdentity: {
      originKey?: string | null;
      idempotencyKey?: string | null;
    } = {},
  ): Promise<GuestGameReward> {
    const data = (await this.buildRewardData(
      user,
      dto,
      true,
      canonicalIdentity,
    )) as Prisma.GuestGameRewardUncheckedCreateInput;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.guestGameReward.create({
        data,
        include: rewardInclude,
      });
      const completionNotificationKind =
        created.status === 'CANCELED' || !created.profileId
          ? null
          : created.missionId
            ? 'MISSION'
            : created.seasonId
              ? 'BATTLE_PASS'
              : null;
      const completionProfileId = created.profileId;

      if (completionNotificationKind && completionProfileId) {
        await tx.guestGameCompletionNotification.upsert({
          where: {
            tenantId_rewardId: {
              tenantId: created.tenantId,
              rewardId: created.id,
            },
          },
          create: {
            tenantId: created.tenantId,
            profileId: completionProfileId,
            rewardId: created.id,
            kind: completionNotificationKind,
          },
          update: {},
        });
      }
      await tx.guestGameEvent.create({
        data: {
          tenantId: user.tenantId,
          profileId: created.profileId,
          guestId: created.guestId,
          lootBoxId: created.lootBoxId,
          missionId: created.missionId,
          seasonId: created.seasonId,
          createdByUserId: actorUserId(user),
          eventType: 'REWARD_QUALIFIED',
          source: 'SYSTEM',
          xpDelta: 0,
          occurredAt: new Date(),
          note: created.rewardLabel,
        },
      });
      const effects = guestGameRewardEffectPlans(created);
      if (effects.length > 0) {
        await tx.guestGameRewardEffect.createMany({
          data: effects.map((effect) => ({
            tenantId: created.tenantId,
            rewardId: created.id,
            ...effect,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    await this.reconcileCreatedRewardSideEffects(user, row);

    return mapReward(row);
  }

  async updateReward(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameRewardUpdateDto,
  ): Promise<GuestGameReward> {
    const current = await this.assertReward(user, id);
    const data = await this.buildRewardData(user, dto, false);
    const nextStatus = dto.status;

    if (nextStatus && nextStatus === current.status) {
      delete data.approvedByUserId;
      delete data.paidAt;
    }

    if (
      (nextStatus === 'APPROVED' || nextStatus === 'PAID') &&
      !current.rewardCode &&
      !('rewardCode' in data)
    ) {
      data.rewardCode = generateRewardCode();
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.guestGameReward.update({
        where: { id },
        data,
        include: rewardInclude,
      });

      if (dto.status && dto.status !== current.status) {
        await tx.guestGameEvent.create({
          data: {
            tenantId: user.tenantId,
            profileId: updated.profileId,
            guestId: updated.guestId,
            lootBoxId: updated.lootBoxId,
            missionId: updated.missionId,
            seasonId: updated.seasonId,
            createdByUserId: actorUserId(user),
            eventType: rewardStatusEventType(dto.status),
            source: 'SYSTEM',
            xpDelta: 0,
            occurredAt: new Date(),
            note: updated.rewardLabel,
          },
        });
      }
      const effects = guestGameRewardEffectPlans(updated);
      if (effects.length > 0) {
        await tx.guestGameRewardEffect.createMany({
          data: effects.map((effect) => ({
            tenantId: updated.tenantId,
            rewardId: updated.id,
            ...effect,
          })),
          skipDuplicates: true,
        });
      }
      return updated;
    });

    await this.reconcileCreatedRewardSideEffects(user, row);

    return mapReward(row);
  }

  async redeemReward(
    user: AuthenticatedUser,
    dto: GuestGameRewardRedeemDto,
  ): Promise<GuestGameReward> {
    const claim = parseRewardClaimInput(dto);

    if (!claim.code) {
      throw new BadRequestException('Укажите код награды или QR payload');
    }

    if (dto.storeId) {
      await this.assertStore(user, dto.storeId);
    }

    const row = await this.prisma.guestGameReward.findFirst({
      where: clean({
        tenantId: user.tenantId,
        id: claim.rewardId ?? undefined,
        rewardCode: { in: rewardCodeVariants(claim.code) },
      }),
      include: rewardInclude,
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!row) {
      throw new NotFoundException('Награда с таким кодом не найдена');
    }

    if (dto.storeId && row.storeId && row.storeId !== dto.storeId) {
      throw new BadRequestException('Эта награда привязана к другому клубу');
    }

    if (row.status === 'PENDING') {
      throw new BadRequestException('Награда еще не согласована');
    }

    if (row.status === 'PAID') {
      throw new ConflictException('Награда уже погашена');
    }

    if (row.status === 'CANCELED') {
      throw new BadRequestException('Награда отменена');
    }

    if (
      row.status === 'EXPIRED' ||
      (row.expiresAt && row.expiresAt.getTime() < Date.now())
    ) {
      if (row.status !== 'EXPIRED') {
        await this.prisma.guestGameReward.update({
          where: { id: row.id },
          data: { status: 'EXPIRED' },
        });
        await this.createSystemEvent(user, {
          profileId: row.profileId,
          guestId: row.guestId,
          lootBoxId: row.lootBoxId,
          missionId: row.missionId,
          seasonId: row.seasonId,
          eventType: 'REWARD_EXPIRED',
          xpDelta: 0,
          note: row.rewardLabel,
        });
      }

      throw new BadRequestException('Срок действия награды истек');
    }

    if (row.status !== 'APPROVED') {
      throw new BadRequestException(
        'Погасить можно только согласованную награду',
      );
    }

    const redeemedAt = new Date();
    const redeemed = await this.prisma.guestGameReward.update({
      where: { id: row.id },
      data: {
        status: 'PAID',
        paidAt: redeemedAt,
        approvedByUserId: row.approvedByUserId ?? user.id,
        evidence: buildRewardRedeemEvidence(
          row.evidence,
          dto,
          claim,
          redeemedAt,
          user.id,
        ),
      },
      include: rewardInclude,
    });

    await this.createSystemEvent(user, {
      profileId: redeemed.profileId,
      guestId: redeemed.guestId,
      lootBoxId: redeemed.lootBoxId,
      missionId: redeemed.missionId,
      seasonId: redeemed.seasonId,
      eventType: 'REWARD_PAID',
      xpDelta: 0,
      note: `${redeemed.rewardLabel} · ${redeemed.rewardCode ?? claim.code}`,
    });

    return mapReward(redeemed);
  }

  async getEvents(
    user: AuthenticatedUser,
    options: { take?: number | null } = {},
  ): Promise<GuestGameEvent[]> {
    const take = options.take === null ? undefined : (options.take ?? 100);
    const rows = await this.prisma.guestGameEvent.findMany({
      where: { tenantId: user.tenantId },
      include: eventInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      ...(take ? { take } : {}),
    });

    return rows.map(mapEvent);
  }

  async createEvent(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
    canonicalIdentity: { originKey?: string | null } = {},
  ): Promise<GuestGameEvent> {
    const data = await this.buildEventData(user, dto, canonicalIdentity);
    const profileId = nullableId(dto.profileId);
    const guestId = nullableId(dto.guestId) ?? null;
    const xpDelta = intValue(dto.xpDelta) ?? 0;
    const rewardIntentPlans = processRewardIntentPlans(dto.payload);
    const missionQualificationRules = processMissionQualificationRules(
      dto.payload,
    );

    if (
      (!profileId || xpDelta === 0) &&
      rewardIntentPlans.length === 0 &&
      missionQualificationRules.length === 0
    ) {
      const row = await this.prisma.guestGameEvent.create({
        data,
        include: eventInclude,
      });
      return mapEvent(row);
    }

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const row = await this.prisma.$transaction(
          async (tx) => {
            const qualificationOutcomes = profileId
              ? await this.atomicMissionQualificationOutcomes(tx, {
                  tenantId: user.tenantId,
                  profileId,
                  guestId,
                  occurredAt:
                    data.occurredAt instanceof Date
                      ? data.occurredAt
                      : new Date(data.occurredAt as string),
                  timeZone: processPayloadTimeZone(dto.payload),
                  rules: missionQualificationRules,
                })
              : [];
            const qualifiedPayload = applyAtomicMissionQualificationOutcomes(
              dto.payload,
              qualificationOutcomes,
            );
            const qualifiedRewardIntentPlans =
              processRewardIntentPlans(qualifiedPayload);
            const deniedMissionRuleIds = new Set(
              qualificationOutcomes
                .filter((outcome) => !outcome.allowed)
                .map((outcome) => outcome.ruleId),
            );
            const deniedMissionXp = sum(
              missionQualificationRules
                .filter((rule) => deniedMissionRuleIds.has(rule.id))
                .map((rule) => rule.xpDelta),
            );
            const qualifiedXpDelta = xpDelta - deniedMissionXp;
            const created = await tx.guestGameEvent.create({
              data: {
                ...data,
                payload: jsonValue(qualifiedPayload),
                xpDelta:
                  qualifiedRewardIntentPlans.length > 0 ? 0 : qualifiedXpDelta,
              },
              include: eventInclude,
            });

            for (const outcome of qualificationOutcomes.filter(
              (item) => item.allowed,
            )) {
              const rule = missionQualificationRules.find(
                (item) => item.id === outcome.ruleId,
              );
              if (!rule) continue;
              const idempotencyKey = [
                'mission-qualification',
                created.id,
                rule.id,
              ].join(':');
              await tx.guestGameRewardIntent.upsert({
                where: {
                  tenantId_idempotencyKey: {
                    tenantId: user.tenantId,
                    idempotencyKey,
                  },
                },
                create: {
                  tenantId: user.tenantId,
                  eventId: created.id,
                  profileId,
                  originKey: nullableString(canonicalIdentity.originKey),
                  ruleType: 'MISSION',
                  ruleId: rule.id,
                  effectKind: 'QUALIFICATION',
                  slotKey: 'mission-qualification',
                  idempotencyKey,
                  claimKey: null,
                  status: 'APPLIED',
                  plan: {
                    schemaVersion: 1,
                    qualifiedAt: outcome.qualifiedAt,
                    slotKey: 'mission-qualification',
                    claimKey: null,
                    rule,
                    atomicMissionLimit: {
                      codes: outcome.codes,
                      counts: outcome.counts,
                      isolationLevel: 'SERIALIZABLE',
                    },
                  },
                  qualifiedAt: new Date(outcome.qualifiedAt),
                  processedAt: new Date(),
                },
                update: {},
              });
            }

            let effectiveXpDelta = qualifiedXpDelta;
            if (qualifiedRewardIntentPlans.length > 0) {
              const persistedPlanKeys = new Set<string>();

              for (const plan of qualifiedRewardIntentPlans) {
                const idempotencyKey =
                  buildGuestGameRewardIdempotencyKey({
                    originKey: nullableString(canonicalIdentity.originKey),
                    ruleKind: plan.rule.kind,
                    ruleId: plan.rule.id,
                    slot: plan.slotKey,
                  }) ??
                  [
                    'guest-game-intent',
                    created.id,
                    plan.rule.kind,
                    plan.rule.id,
                    plan.slotKey,
                  ].join(':');
                const intentData = {
                  tenantId: user.tenantId,
                  eventId: created.id,
                  profileId,
                  originKey: nullableString(canonicalIdentity.originKey),
                  ruleType: plan.rule.kind,
                  ruleId: plan.rule.id,
                  effectKind: 'REWARD',
                  slotKey: plan.slotKey,
                  idempotencyKey,
                  claimKey: plan.claimKey,
                  status: 'PENDING',
                  plan,
                  qualifiedAt: new Date(plan.qualifiedAt),
                } satisfies Prisma.GuestGameRewardIntentUncheckedCreateInput;
                const intent = plan.claimKey
                  ? await tx.guestGameRewardIntent.upsert({
                      where: {
                        tenantId_claimKey: {
                          tenantId: user.tenantId,
                          claimKey: plan.claimKey,
                        },
                      },
                      create: intentData,
                      update: {},
                    })
                  : await tx.guestGameRewardIntent.upsert({
                      where: {
                        tenantId_idempotencyKey: {
                          tenantId: user.tenantId,
                          idempotencyKey,
                        },
                      },
                      create: intentData,
                      update: {},
                    });

                if (intent.eventId === created.id) {
                  persistedPlanKeys.add(processRewardIntentPlanKey(plan));
                }
              }

              effectiveXpDelta -= sum(
                qualifiedRewardIntentPlans
                  .filter(
                    (plan) =>
                      !persistedPlanKeys.has(processRewardIntentPlanKey(plan)),
                  )
                  .map((plan) => plan.rule.xpDelta),
              );

              if (effectiveXpDelta !== 0) {
                await tx.guestGameEvent.update({
                  where: { id: created.id },
                  data: { xpDelta: effectiveXpDelta },
                });
              }
            }

            if (profileId && effectiveXpDelta !== 0) {
              const incremented = await tx.guestGameProfile.update({
                where: { id: profileId },
                data: {
                  xp: { increment: effectiveXpDelta },
                  lastActivityAt: new Date(),
                },
                select: { xp: true },
              });
              const balanceBefore = incremented.xp - effectiveXpDelta;
              const balanceAfter = Math.max(0, incremented.xp);

              await tx.guestGameProfile.update({
                where: { id: profileId },
                data: {
                  xp: balanceAfter,
                  level: levelFromXp(balanceAfter),
                  lastActivityAt: new Date(),
                },
              });
              await tx.guestGameXpPosting.create({
                data: {
                  tenantId: user.tenantId,
                  profileId,
                  eventId: created.id,
                  idempotencyKey: `guest-game-xp:${created.id}`,
                  requestedDelta: effectiveXpDelta,
                  appliedDelta: balanceAfter - balanceBefore,
                  balanceBefore,
                  balanceAfter,
                  evidence: {
                    eventType: created.eventType,
                    originKey: nullableString(canonicalIdentity.originKey),
                  },
                },
              });
            }

            return (
              (await tx.guestGameEvent.findUnique({
                where: { id: created.id },
                include: eventInclude,
              })) ?? created
            );
          },
          { isolationLevel: 'Serializable' },
        );

        return mapEvent(row);
      } catch (error) {
        if (isSerializationConflictError(error) && attempt < maxAttempts) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Mission qualification serialization retry exhausted.');
  }

  private async atomicMissionQualificationOutcomes(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      profileId: string;
      guestId: string | null;
      occurredAt: Date;
      timeZone: string;
      rules: ProcessRewardIntentRuleSnapshot[];
    },
  ): Promise<AtomicMissionQualificationOutcome[]> {
    const rules = [...input.rules].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    if (!rules.length) return [];
    const ruleIds = rules.map((rule) => rule.id);
    const missions = new Map<
      string,
      {
        id: string;
        status: string;
        conditions: Prisma.JsonValue;
        antiFraudRules: Prisma.JsonValue | null;
        perGuestLimit: number | null;
        totalRewardLimit: number | null;
        budgetAmount: Prisma.Decimal | null;
        rewardAmount: Prisma.Decimal | null;
      } | null
    >();

    // Lock all participating missions in one deterministic statement. The
    // SERIALIZABLE transaction then evaluates and reserves every mission
    // against one consistent history snapshot across API replicas.
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "GuestGameMission"
      WHERE "tenantId" = ${input.tenantId}
        AND "id" IN (${Prisma.join(ruleIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
    const [missionRows, intentRows, rewardRows, entitlementRows] =
      await Promise.all([
        tx.guestGameMission.findMany({
          where: {
            tenantId: input.tenantId,
            id: { in: ruleIds },
          },
          select: {
            id: true,
            status: true,
            conditions: true,
            antiFraudRules: true,
            perGuestLimit: true,
            totalRewardLimit: true,
            budgetAmount: true,
            rewardAmount: true,
          },
        }),
        tx.guestGameRewardIntent.findMany({
          where: {
            tenantId: input.tenantId,
            ruleType: 'MISSION',
            ruleId: { in: ruleIds },
            effectKind: { in: ['QUALIFICATION', 'REWARD'] },
            status: {
              in: ['PENDING', 'PROCESSING', 'FAILED', 'APPLIED'],
            },
          },
          select: {
            id: true,
            eventId: true,
            ruleId: true,
            effectKind: true,
            status: true,
            rewardId: true,
            profileId: true,
            qualifiedAt: true,
            plan: true,
          },
        }),
        tx.guestGameReward.findMany({
          where: {
            tenantId: input.tenantId,
            missionId: { in: ruleIds },
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
          select: {
            id: true,
            missionId: true,
            profileId: true,
            guestId: true,
            qualifiedAt: true,
            rewardAmount: true,
          },
        }),
        tx.guestGameEntitlement.findMany({
          where: {
            tenantId: input.tenantId,
            ruleType: 'LOOT_BOX',
            status: { in: ['AVAILABLE', 'CONSUMED'] },
            OR: ruleIds.map((ruleId) => ({
              evidence: { path: ['missionId'], equals: ruleId },
            })),
          },
          select: {
            id: true,
            eventId: true,
            rewardId: true,
            profileId: true,
            guestId: true,
            qualifiedAt: true,
            evidence: true,
          },
        }),
      ]);
    for (const mission of missionRows) {
      missions.set(mission.id, mission);
    }

    const outcomes: AtomicMissionQualificationOutcome[] = [];
    for (const rule of rules) {
      const mission = missions.get(rule.id);
      if (!mission || mission.status !== 'ACTIVE') {
        outcomes.push({
          ruleId: rule.id,
          allowed: false,
          qualifiedAt: input.occurredAt.toISOString(),
          codes: ['RULE_INACTIVE'],
          counts: {},
        });
        continue;
      }

      const ruleIntentRows = Array.isArray(intentRows)
        ? intentRows.filter((row) => row.ruleId === rule.id)
        : [];
      const ruleRewardRows = Array.isArray(rewardRows)
        ? rewardRows.filter((row) => row.missionId === rule.id)
        : [];
      const ruleEntitlementRows = Array.isArray(entitlementRows)
        ? entitlementRows.filter(
            (row) => nullableId(jsonRecord(row.evidence).missionId) === rule.id,
          )
        : [];
      const issuances = atomicMissionIssuances({
        ruleId: rule.id,
        intents: ruleIntentRows,
        rewards: ruleRewardRows,
        entitlements: ruleEntitlementRows,
      });
      const rewardConfig = dryRunRecord(
        dryRunRecord(mission.conditions).reward,
      );
      const guard = atomicMissionLimitGuard({
        denySameDayRepeat:
          dryRunRecord(mission.antiFraudRules).denySameDayRepeat === true,
        periodicity: lootBoxPeriodicLimitPeriod(rewardConfig.periodicity),
        perGuestLimit: mission.perGuestLimit,
        totalRewardLimit: mission.totalRewardLimit,
        budgetAmount: numberOrNull(mission.budgetAmount),
        projectedAmount: numberOrNull(mission.rewardAmount) ?? 0,
        profileId: input.profileId,
        guestId: input.guestId,
        qualifiedAt: input.occurredAt,
        timeZone: input.timeZone,
        issuances,
      });
      outcomes.push({
        ruleId: rule.id,
        allowed: !guard.exhausted,
        qualifiedAt: input.occurredAt.toISOString(),
        codes: guard.codes,
        counts: guard.counts,
      });
    }

    return outcomes;
  }

  async dryRun(
    user: AuthenticatedUser,
    dto: GuestGameDryRunDto,
    options: GuestGameDryRunOptions = {},
  ): Promise<GuestGameDryRunResult> {
    const eventType = stringValue(dto.eventType) ?? 'SESSION_START';
    const lootBoxId = nullableId(dto.lootBoxId);
    const occurredAt = dateValue(dto.occurredAt) ?? new Date();
    const limitOccurredAt = dateValue(dto.limitOccurredAt) ?? occurredAt;
    const sessionType = nullableString(dto.sessionType) ?? null;
    const sessionPacket = nullableBooleanValue(dto.sessionPacket);
    const sessionMinutes = Math.max(0, intValue(dto.sessionMinutes) ?? 120);
    const spendAmount = Math.max(0, dryRunNumber(dto.spendAmount, 0));
    const tariffGroupId = nullableString(dto.tariffGroupId) ?? null;
    const tariffPeriodId = nullableString(dto.tariffPeriodId) ?? null;
    const tariffTypeId = nullableString(dto.tariffTypeId) ?? null;
    const guestLogType = nullableString(dto.guestLogType) ?? null;
    const productId = nullableString(dto.productId) ?? null;
    const externalProductId = nullableString(dto.externalProductId) ?? null;
    const externalCategoryKey = nullableString(dto.externalCategoryKey) ?? null;
    const externalCategoryId = nullableString(dto.externalCategoryId) ?? null;
    const categoryId = nullableString(dto.categoryId) ?? null;
    const productName = nullableString(dto.productName) ?? null;
    const categoryName = nullableString(dto.categoryName) ?? null;
    const supplierName = nullableString(dto.supplierName) ?? null;
    const quantity = dryRunOptionalNumber(dto.quantity);
    const externalDomain = nullableString(dto.externalDomain) ?? null;
    const sourceFactId = nullableString(dto.sourceFactId) ?? null;
    const [profile, lootBoxes, missions, seasons, store] = await Promise.all([
      this.resolveDryRunProfile(user, dto),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getSeasons(user),
      dto.storeId ? this.assertStore(user, dto.storeId) : Promise.resolve(null),
    ]);
    const selectedExternalDomain =
      nullableString(store?.externalDomain) ?? externalDomain;
    const identityGuestIds = await this.resolveProfileIdentityGuestIds(user, {
      profileId: profile?.id,
      legacyGuestId: profile?.guest?.id,
      legacyExternalDomain: profile?.guest?.externalDomain,
      externalDomain: selectedExternalDomain,
    });
    const selectedIdentityGuestId = identityGuestIds[0] ?? null;
    const rewards = await this.getDryRunRewards(user, {
      ...options.rewardScope,
      missionIds: missions.map((mission) => mission.id),
    });
    const explicitGuestId = nullableId(dto.guestId);
    const explicitGuest = explicitGuestId
      ? dryRunGuestSummary(await this.getTenantGuest(user, explicitGuestId))
      : null;
    const scopedExplicitGuest =
      !selectedExternalDomain ||
      nullableString(explicitGuest?.externalDomain) === selectedExternalDomain
        ? explicitGuest
        : null;
    const guestId = scopedExplicitGuest?.id ?? selectedIdentityGuestId;
    const guest = guestId
      ? profile?.guest?.id === guestId
        ? profile.guest
        : (scopedExplicitGuest ??
          dryRunGuestSummary(await this.getTenantGuest(user, guestId)))
      : selectedExternalDomain
        ? null
        : (profile?.guest ?? null);
    const missionRewardEntitlements =
      await this.getDryRunMissionRewardEntitlements(user, {
        profileId: profile?.id ?? null,
        guestId: guest?.id ?? null,
        missionIds: missions.map((mission) => mission.id),
      });
    const lootBoxLimitEntitlements =
      await this.getDryRunLootBoxLimitEntitlements(
        user,
        lootBoxes.map((lootBox) => lootBox.id),
        limitOccurredAt,
      );
    const timeZone = guestGameTimeZone(store?.timeZone ?? null);
    const progressEvents = await this.getDryRunProgressEvents(user, {
      profileId: profile?.id ?? null,
      guestIds: uniqueStrings([
        ...identityGuestIds,
        ...(guest?.id ? [guest.id] : []),
      ]),
    });
    const audienceMemberIds = await this.getDryRunAudienceMemberIds(
      user,
      guest,
      identityGuestIds,
    );
    const context: DryRunContext = {
      eventType,
      occurredAt,
      limitOccurredAt,
      sourceFactId,
      profile,
      guest,
      storeId: store?.id ?? null,
      externalDomain: selectedExternalDomain,
      timeZone,
      sessionType,
      sessionPacket,
      sessionMinutes,
      spendAmount,
      tariffGroupId,
      tariffPeriodId,
      tariffTypeId,
      guestLogType,
      productId,
      externalProductId,
      externalCategoryKey,
      externalCategoryId,
      categoryId,
      productName,
      categoryName,
      supplierName,
      quantity,
      rewards,
      missionRewardEntitlements,
      lootBoxLimitEntitlements,
      rewardTemplateLootBoxIds: new Set(
        lootBoxes
          .filter(
            (lootBox) =>
              lootBox.status === 'ACTIVE' &&
              (lootBox.usageKind === 'REWARD_TEMPLATE' ||
                lootBox.usageKind === 'BOTH'),
          )
          .map((lootBox) => lootBox.id),
      ),
      progressEvents,
      audienceMemberIds,
      ruleDomainTimeZones: options.ruleDomainTimeZones,
      ruleExternalDomains: options.ruleExternalDomains,
    };
    const targetLootBoxes = lootBoxId
      ? lootBoxes.filter((item) => item.id === lootBoxId)
      : lootBoxes.filter(lootBoxVisibleInCatalog);

    if (lootBoxId && !targetLootBoxes.length) {
      throw new NotFoundException('Лутбокс не найден');
    }

    const rules = [
      ...targetLootBoxes.map((item) => evaluateLootBoxDryRun(item, context)),
      ...(lootBoxId
        ? []
        : missions.map((item) => evaluateMissionDryRun(item, context))),
      ...(lootBoxId
        ? []
        : seasons.map((item) => evaluateSeasonDryRun(item, context))),
    ];
    const eligibleRules = rules.filter((rule) => rule.eligible);

    return {
      dryRun: true,
      eventType,
      occurredAt: occurredAt.toISOString(),
      profile: profile
        ? {
            id: profile.id,
            displayName: profile.displayName,
            contactMasked: profile.contactMasked,
            xp: profile.xp,
            level: profile.level,
            status: profile.status,
          }
        : null,
      guest,
      store: store
        ? {
            id: store.id,
            name: store.name,
            timeZone: store.timeZone,
            externalDomain: store.externalDomain,
          }
        : null,
      input: {
        sessionType,
        sessionPacket,
        sessionMinutes,
        spendAmount,
        tariffGroupId,
        tariffPeriodId,
        tariffTypeId,
        guestLogType,
        productId,
        externalProductId,
        externalCategoryKey,
        externalCategoryId,
        categoryId,
        productName,
        categoryName,
        supplierName,
        quantity,
      },
      summary: {
        checkedRules: rules.length,
        eligibleRules: eligibleRules.length,
        blockedRules: rules.length - eligibleRules.length,
        estimatedRewardAmount: sum(
          eligibleRules.map((rule) => rule.rewardAmount ?? 0),
        ),
        projectedXpDelta: sum(eligibleRules.map((rule) => rule.xpDelta)),
      },
      rules,
      note: 'Dry-run only: rewards, events and Langame writes are not created.',
    };
  }

  async recordRuleDecisions(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    options: {
      eventId?: string | null;
      originKey?: string | null;
      traceId?: string | null;
      sourceFactId?: string | null;
      sourceExternalId?: string | null;
      sourceFactKind?: string | null;
      evaluationRunId?: string;
      evaluationMode?: string;
      evaluatorVersion?: string;
      excludeSeasonRewardIds?: string[];
      evidence?: Prisma.InputJsonValue;
      suppressLedgerShadow?: boolean;
      replaceExistingRun?: boolean;
    } = {},
  ): Promise<GuestGameRuleDecisionRecordResult> {
    if (!dryRun.rules.length) {
      return { lootBoxEntitlements: [] };
    }

    const evaluationRunId =
      options.evaluationRunId ?? randomBytes(16).toString('hex');
    const evaluatedAt = new Date();
    const evaluationMode = options.evaluationMode ?? 'LIVE';
    let decisionsPersisted = false;

    try {
      const decisionRows = dryRun.rules.map((rule) => ({
        tenantId: user.tenantId,
        profileId: dryRun.profile?.id ?? null,
        guestId: dryRun.guest?.id ?? null,
        storeId: dryRun.store?.id ?? null,
        eventId: nullableId(options.eventId),
        originKey: nullableString(options.originKey),
        evaluationRunId,
        evaluationMode,
        evaluatorVersion: options.evaluatorVersion ?? 'legacy-v1',
        ruleType: rule.kind === 'SEASON' ? 'BATTLE_PASS' : rule.kind,
        ruleId: rule.id,
        ruleName: rule.name,
        ruleStatus: rule.status,
        triggerKind: rule.triggerKind,
        sourceEventType: dryRun.eventType,
        sourceFactId: nullableString(options.sourceFactId),
        sourceFactKind: nullableString(options.sourceFactKind),
        traceId: nullableString(options.traceId),
        status: rule.eligible ? 'MATCHED' : 'BLOCKED',
        reasons: rule.reasons,
        blockers: rule.blockers,
        input: {
          occurredAt: dryRun.occurredAt,
          storeId: dryRun.store?.id ?? null,
          ...dryRun.input,
        },
        ...(options.evidence ? { evidence: options.evidence } : {}),
        evaluatedAt,
      }));
      if (options.replaceExistingRun) {
        await this.prisma.$transaction([
          this.prisma.guestGameRuleDecision.deleteMany({
            where: {
              tenantId: user.tenantId,
              evaluationRunId,
              evaluationMode,
            },
          }),
          this.prisma.guestGameRuleDecision.createMany({ data: decisionRows }),
        ]);
      } else {
        await this.prisma.guestGameRuleDecision.createMany({
          data: decisionRows,
        });
      }
      decisionsPersisted = true;
    } catch (error) {
      this.logger.warn(
        `Failed to persist guest game rule decisions for tenant ${user.tenantId}: ${this.checkInErrorMessage(error)}`,
      );
    }

    const isLiveDecision = evaluationMode === 'LIVE';
    const isLiveObservation =
      isLiveDecision || evaluationMode.startsWith('LIVE_');
    const shouldRecordLedgerShadow =
      isLiveObservation &&
      evaluationMode !== 'LIVE_SUPPLEMENTAL' &&
      evaluationMode !== 'LIVE_LEDGER_FALLBACK' &&
      !options.suppressLedgerShadow;
    let lootBoxEntitlements: GuestGameLootBoxEntitlementWriteOutcome[] = [];

    if (isLiveObservation) {
      if (decisionsPersisted) {
        lootBoxEntitlements = await this.recordMatchedEntitlements(
          user,
          dryRun,
          {
            ...options,
            evaluationRunId,
          },
        );
      }
      if (decisionsPersisted) {
        await this.recordMatchedMissionRewardEntitlements(user, dryRun, {
          ...options,
          evaluationRunId,
          evaluationMode,
        });
      }
      if (shouldRecordLedgerShadow) {
        await this.recordLedgerShadowRuleDecisions(user, dryRun, {
          ...options,
          evaluationRunId,
        });
      }
    }

    return { lootBoxEntitlements };
  }

  private async getMissingMatchedLootBoxEntitlementRuleIds(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    eventId: string,
  ): Promise<string[]> {
    const ruleIds = uniqueStrings(
      dryRun.rules
        .filter((rule) => rule.kind === 'LOOT_BOX' && rule.eligible)
        .map((rule) => rule.id),
    );
    if (!ruleIds.length) return [];

    const existing = await this.prisma.guestGameEntitlement.findMany({
      where: {
        tenantId: user.tenantId,
        eventId,
        ruleType: 'LOOT_BOX',
        ruleId: { in: ruleIds },
      },
      select: { ruleId: true },
    });
    const existingRuleIds = new Set(existing.map((row) => row.ruleId));

    return ruleIds.filter((ruleId) => !existingRuleIds.has(ruleId));
  }

  private async getMissingMatchedMissionRewardEntitlementRuleIds(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    eventId: string,
  ): Promise<string[]> {
    const candidates = dryRun.rules.filter(
      (rule) =>
        rule.kind === 'MISSION' &&
        rule.eligible &&
        rule.rewardType === 'LOOT_BOX_ENTITLEMENT' &&
        !rule.manualApprovalRequired,
    );
    if (!candidates.length || !dryRun.profile?.id) return [];

    const qualificationRequiredIds = candidates
      .filter(missionDryRunRuleRequiresAtomicQualification)
      .map((rule) => rule.id);
    const qualificationRows = qualificationRequiredIds.length
      ? await this.prisma.guestGameRewardIntent.findMany({
          where: {
            tenantId: user.tenantId,
            eventId,
            ruleType: 'MISSION',
            ruleId: { in: qualificationRequiredIds },
            effectKind: 'QUALIFICATION',
            status: 'APPLIED',
          },
          select: { ruleId: true },
        })
      : [];
    const qualifiedRuleIds = new Set(
      qualificationRows.map((row) => row.ruleId),
    );
    const recoverableRuleIds = candidates
      .filter(
        (rule) =>
          !missionDryRunRuleRequiresAtomicQualification(rule) ||
          qualifiedRuleIds.has(rule.id),
      )
      .map((rule) => rule.id);
    if (!recoverableRuleIds.length) return [];

    const existing = await this.prisma.guestGameEntitlement.findMany({
      where: {
        tenantId: user.tenantId,
        eventId,
        ruleType: 'LOOT_BOX',
        status: { in: ['AVAILABLE', 'CONSUMED', 'CANCELED'] },
      },
      select: { evidence: true },
    });
    const existingMissionIds = new Set(
      existing
        .map((row) => nullableId(jsonRecord(row.evidence).missionId))
        .filter((missionId): missionId is string => Boolean(missionId)),
    );

    return recoverableRuleIds.filter(
      (ruleId) => !existingMissionIds.has(ruleId),
    );
  }

  private async recordMatchedEntitlements(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    options: {
      eventId?: string | null;
      originKey?: string | null;
      traceId?: string | null;
      sourceFactId?: string | null;
      sourceFactKind?: string | null;
      evaluationRunId: string;
      evaluationMode?: string;
      evaluatorVersion?: string;
      evidence?: Prisma.InputJsonValue;
    },
  ): Promise<GuestGameLootBoxEntitlementWriteOutcome[]> {
    if (nullableString(options.sourceFactKind) === 'GUEST_LOOT_BOX_OPEN') {
      return [];
    }

    const rules = dryRun.rules.filter(
      (rule) => rule.kind === 'LOOT_BOX' && rule.eligible,
    );
    if (!rules.length || !dryRun.profile?.id) {
      return [];
    }

    const occurredAt = new Date(dryRun.occurredAt);
    const qualifiedAt = Number.isNaN(occurredAt.getTime())
      ? new Date()
      : occurredAt;
    const timeZone = guestGameTimeZone(dryRun.store?.timeZone ?? null);
    const sourceIdentity =
      nullableString(options.originKey) ??
      nullableId(options.eventId) ??
      [
        nullableString(options.sourceFactKind),
        nullableString(options.sourceFactId),
      ]
        .filter(Boolean)
        .join(':');

    return Promise.all(
      rules.map(async (rule) => {
        const periodicLimitPeriod = rule.periodicLimitPeriod ?? null;
        const isDaily = periodicLimitPeriod === 'DAILY';
        const entitlementPeriodKey = isDaily
          ? dryRunLocalDateKey(qualifiedAt, timeZone)
          : null;
        const idempotencyKey = isDaily
          ? [
              'loot-box',
              rule.id,
              'daily',
              dryRun.profile!.id,
              entitlementPeriodKey,
            ].join(':')
          : [
              'loot-box',
              rule.id,
              sourceIdentity || options.evaluationRunId,
            ].join(':');
        const periodEndsAt = isDaily
          ? dryRunNextLocalDayStart(qualifiedAt, timeZone)
          : null;
        const baseEvidence = {
          evaluationMode: options.evaluationMode ?? 'LIVE',
          evaluatorVersion: options.evaluatorVersion ?? 'legacy-v1',
          reasons: rule.reasons,
          blockers: rule.blockers,
          input: dryRun.input,
          sourceEvidence: options.evidence ?? null,
          entitlementPeriod: isDaily
            ? {
                kind: 'DAILY',
                key: entitlementPeriodKey,
                timeZone,
                periodEndsAt: periodEndsAt?.toISOString() ?? null,
              }
            : null,
        };

        try {
          return await this.persistMatchedLootBoxEntitlement({
            tenantId: user.tenantId,
            profileId: dryRun.profile!.id,
            guestId: dryRun.guest?.id ?? null,
            storeId: dryRun.store?.id ?? null,
            eventId: nullableId(options.eventId) ?? null,
            originKey: nullableString(options.originKey) ?? null,
            evaluationRunId: options.evaluationRunId,
            rule,
            sourceEventType: dryRun.eventType,
            sourceFactId: nullableString(options.sourceFactId) ?? null,
            sourceFactKind: nullableString(options.sourceFactKind) ?? null,
            traceId: nullableString(options.traceId) ?? null,
            idempotencyKey,
            qualifiedAt,
            timeZone,
            baseEvidence,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to persist guest game entitlement ${rule.id} for tenant ${user.tenantId}: ${this.checkInErrorMessage(error)}`,
          );
          return {
            ruleId: rule.id,
            status: 'PERSISTENCE_FAILED' as const,
            entitlementId: null,
            limitCodes: [],
          };
        }
      }),
    );
  }

  private async persistMatchedLootBoxEntitlement(input: {
    tenantId: string;
    profileId: string;
    guestId: string | null;
    storeId: string | null;
    eventId: string | null;
    originKey: string | null;
    evaluationRunId: string;
    rule: GuestGameDryRunRule;
    sourceEventType: string;
    sourceFactId: string | null;
    sourceFactKind: string | null;
    traceId: string | null;
    idempotencyKey: string;
    qualifiedAt: Date;
    timeZone: string;
    baseEvidence: Prisma.InputJsonObject;
  }): Promise<GuestGameLootBoxEntitlementWriteOutcome> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.guestGameEntitlement.findFirst({
              where: {
                tenantId: input.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
              select: { id: true, status: true, evidence: true },
            });
            if (existing) {
              return {
                ruleId: input.rule.id,
                status: 'IDEMPOTENT' as const,
                entitlementId: existing.id,
                limitCodes: lootBoxLimitCodesFromEvidence(existing.evidence),
              };
            }

            const activeRule = await tx.guestGameLootBox.findFirst({
              where: {
                tenantId: input.tenantId,
                id: input.rule.id,
                status: 'ACTIVE',
              },
              select: { id: true, limits: true },
            });
            const limits = dryRunRecord(activeRule?.limits);
            const earliestRelevantAt = lootBoxLimitEarliestRelevantAt(
              input.qualifiedAt,
              limits,
            );
            const [rewards, entitlements] = activeRule
              ? await Promise.all([
                  tx.guestGameReward.findMany({
                    where: {
                      tenantId: input.tenantId,
                      lootBoxId: input.rule.id,
                      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
                      qualifiedAt: {
                        gte: earliestRelevantAt,
                      },
                    },
                    select: {
                      id: true,
                      profileId: true,
                      guestId: true,
                      qualifiedAt: true,
                    },
                  }),
                  tx.guestGameEntitlement.findMany({
                    where: {
                      tenantId: input.tenantId,
                      ruleType: 'LOOT_BOX',
                      ruleId: input.rule.id,
                      status: { in: ['AVAILABLE', 'CONSUMED'] },
                      qualifiedAt: {
                        gte: earliestRelevantAt,
                      },
                    },
                    select: {
                      id: true,
                      profileId: true,
                      guestId: true,
                      rewardId: true,
                      qualifiedAt: true,
                    },
                  }),
                ])
              : [[], []];
            const limitGuard = activeRule
              ? lootBoxEntitlementLimitGuard({
                  limits,
                  profileId: input.profileId,
                  guestId: input.guestId,
                  qualifiedAt: input.qualifiedAt,
                  timeZone: input.timeZone,
                  rewards,
                  entitlements,
                })
              : {
                  exhausted: true,
                  codes: ['RULE_INACTIVE'],
                  counts: {},
                };
            const status = limitGuard.exhausted ? 'CANCELED' : 'AVAILABLE';
            const evidence = {
              ...input.baseEvidence,
              issuanceOutcome: activeRule
                ? limitGuard.exhausted
                  ? 'LIMIT_EXHAUSTED'
                  : 'PERSISTED'
                : 'RULE_INACTIVE',
              atomicLimitGuard: {
                isolationLevel: 'SERIALIZABLE',
                codes: limitGuard.codes,
                counts: limitGuard.counts,
              },
            };
            const entitlement = await tx.guestGameEntitlement.upsert({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: input.tenantId,
                  idempotencyKey: input.idempotencyKey,
                },
              },
              create: {
                tenantId: input.tenantId,
                profileId: input.profileId,
                guestId: input.guestId,
                storeId: input.storeId,
                eventId: input.eventId,
                originKey: input.originKey,
                evaluationRunId: input.evaluationRunId,
                ruleType: 'LOOT_BOX',
                ruleId: input.rule.id,
                ruleName: input.rule.name,
                sourceEventType: input.sourceEventType,
                sourceFactId: input.sourceFactId,
                sourceFactKind: input.sourceFactKind,
                traceId: input.traceId,
                status,
                idempotencyKey: input.idempotencyKey,
                qualifiedAt: input.qualifiedAt,
                validUntil: null,
                canceledAt: status === 'CANCELED' ? new Date() : null,
                evidence,
              },
              update: {},
              select: { id: true },
            });

            return {
              ruleId: input.rule.id,
              status: activeRule
                ? limitGuard.exhausted
                  ? ('LIMIT_EXHAUSTED' as const)
                  : ('PERSISTED' as const)
                : ('RULE_INACTIVE' as const),
              entitlementId: entitlement.id,
              limitCodes: limitGuard.codes,
            };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const existing = await this.prisma.guestGameEntitlement.findFirst({
            where: {
              tenantId: input.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
            select: { id: true, evidence: true },
          });
          if (existing) {
            return {
              ruleId: input.rule.id,
              status: 'IDEMPOTENT',
              entitlementId: existing.id,
              limitCodes: lootBoxLimitCodesFromEvidence(existing.evidence),
            };
          }
        }
        if (isSerializationConflictError(error) && attempt < maxAttempts) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Loot-box entitlement serialization retry exhausted.');
  }

  private async recordMatchedMissionRewardEntitlements(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    options: {
      eventId?: string | null;
      originKey?: string | null;
      traceId?: string | null;
      sourceFactId?: string | null;
      sourceFactKind?: string | null;
      evaluationRunId: string;
      evaluationMode: string;
      evidence?: Prisma.InputJsonValue;
    },
  ) {
    // A mission reward is authoritative only after processEvent persisted the
    // canonical source event. Diagnostic LIVE_* evaluations (for example a
    // blocked guest-portal loot-box open attempt) intentionally have no
    // eventId and must never materialize a reward entitlement.
    if (!nullableId(options.eventId)) return;

    const candidateMissionRules = dryRun.rules.filter(
      (rule) =>
        rule.kind === 'MISSION' &&
        rule.eligible &&
        rule.rewardType === 'LOOT_BOX_ENTITLEMENT' &&
        !rule.manualApprovalRequired,
    );
    if (!candidateMissionRules.length || !dryRun.profile?.id) return;

    const eventId = nullableId(options.eventId)!;
    const qualificationRequiredIds = candidateMissionRules
      .filter(missionDryRunRuleRequiresAtomicQualification)
      .map((rule) => rule.id);
    const qualificationRows = qualificationRequiredIds.length
      ? await this.prisma.guestGameRewardIntent.findMany({
          where: {
            tenantId: user.tenantId,
            eventId,
            ruleType: 'MISSION',
            ruleId: { in: qualificationRequiredIds },
            effectKind: 'QUALIFICATION',
            status: 'APPLIED',
          },
          select: { ruleId: true },
        })
      : [];
    const qualifiedRuleIds = new Set(
      qualificationRows.map((row) => row.ruleId),
    );
    const missionRules = candidateMissionRules.filter(
      (rule) =>
        !missionDryRunRuleRequiresAtomicQualification(rule) ||
        qualifiedRuleIds.has(rule.id),
    );
    if (!missionRules.length) return;

    const missions = await this.prisma.guestGameMission.findMany({
      where: {
        tenantId: user.tenantId,
        id: { in: missionRules.map((rule) => rule.id) },
      },
      select: { id: true, conditions: true, antiFraudRules: true },
    });
    const missionConfigById = new Map(
      missions.map((mission) => {
        const reward = jsonRecord(
          jsonRecord(mission.conditions).reward as Prisma.JsonValue,
        );
        return [
          mission.id,
          {
            lootBoxId: nullableId(reward.lootBoxId),
            denySameDayRepeat:
              jsonRecord(mission.antiFraudRules).denySameDayRepeat === true,
          },
        ] as const;
      }),
    );
    const targetIds = uniqueStrings(
      [...missionConfigById.values()]
        .map((value) => value.lootBoxId)
        .filter((value): value is string => Boolean(value)),
    );
    if (!targetIds.length) return;

    const lootBoxes = await this.prisma.guestGameLootBox.findMany({
      where: {
        tenantId: user.tenantId,
        id: { in: targetIds },
        status: 'ACTIVE',
        usageKind: { in: ['REWARD_TEMPLATE', 'BOTH'] },
      },
      select: { id: true, name: true },
    });
    const lootBoxById = new Map(lootBoxes.map((item) => [item.id, item]));
    const occurredAt = new Date(dryRun.occurredAt);
    const qualifiedAt = Number.isNaN(occurredAt.getTime())
      ? new Date()
      : occurredAt;
    const sourceIdentity =
      nullableString(options.originKey) ??
      nullableId(options.eventId) ??
      [options.sourceFactKind, options.sourceFactId].filter(Boolean).join(':');
    const timeZone = guestGameTimeZone(dryRun.store?.timeZone ?? null);

    await Promise.all(
      missionRules.map(async (rule) => {
        const missionConfig = missionConfigById.get(rule.id);
        const targetId = missionConfig?.lootBoxId;
        const target = targetId ? lootBoxById.get(targetId) : null;
        if (!target || !missionConfig) return;
        const entitlementDateKey = missionConfig.denySameDayRepeat
          ? dryRunLocalDateKey(qualifiedAt, timeZone)
          : null;
        // The daily identity is enforced by the database unique key. Two
        // workers evaluating different facts for the same mission/day can
        // therefore create at most one automatic reward entitlement.
        const idempotencyKey = missionConfig.denySameDayRepeat
          ? [
              'mission-loot-box',
              rule.id,
              'daily',
              dryRun.profile!.id,
              entitlementDateKey,
            ].join(':')
          : [
              'mission-loot-box',
              rule.id,
              sourceIdentity || options.evaluationRunId,
            ].join(':');
        await this.prisma.guestGameEntitlement.upsert({
          where: {
            tenantId_idempotencyKey: {
              tenantId: user.tenantId,
              idempotencyKey,
            },
          },
          create: {
            tenantId: user.tenantId,
            profileId: dryRun.profile?.id ?? null,
            guestId: dryRun.guest?.id ?? null,
            storeId: dryRun.store?.id ?? null,
            eventId: nullableId(options.eventId),
            originKey: nullableString(options.originKey),
            evaluationRunId: options.evaluationRunId,
            ruleType: 'LOOT_BOX',
            ruleId: target.id,
            ruleName: target.name,
            sourceEventType: dryRun.eventType,
            sourceFactId: nullableString(options.sourceFactId),
            sourceFactKind: nullableString(options.sourceFactKind),
            traceId: nullableString(options.traceId),
            status: 'AVAILABLE',
            idempotencyKey,
            qualifiedAt,
            evidence: {
              source: 'mission_reward',
              missionId: rule.id,
              evaluationMode: options.evaluationMode,
              evaluatorVersion: 'mission-wizard-v2',
              denySameDayRepeat: missionConfig.denySameDayRepeat,
              entitlementDateKey,
              timeZone,
              sourceEvidence: options.evidence ?? null,
            },
          },
          // AVAILABLE, CONSUMED and CANCELED are all durable outcomes. A
          // retry must not mutate or reopen any previously issued right.
          update: {},
        });
      }),
    );
  }

  private async createApprovedRewardLootBoxEntitlement(
    user: AuthenticatedUser,
    reward: RewardRow,
  ) {
    if (
      reward.tenantId !== user.tenantId ||
      reward.rewardType !== 'LOOT_BOX_ENTITLEMENT' ||
      !reward.profileId
    ) {
      return;
    }

    const rewardEvidence = jsonRecord(reward.evidence);
    const ruleEvidence = jsonRecord(
      rewardEvidence.rule as Prisma.JsonValue | null,
    );
    const battlePassTrack = processBattlePassRewardTrack(
      ruleEvidence.battlePassRewardTrack,
    );
    const missionReward = reward.mission
      ? jsonRecord(
          jsonRecord(reward.mission.conditions).reward as Prisma.JsonValue,
        )
      : null;
    const lootBoxId = reward.mission
      ? nullableId(missionReward?.lootBoxId)
      : reward.season && battlePassTrack === 'FREE'
        ? nullableId(ruleEvidence.rewardLootBoxId)
        : null;
    if (!lootBoxId) {
      if (reward.season) {
        throw new BadRequestException(
          'Наградной лутбокс Battle Pass не может быть выдан без подтвержденной FREE-дорожки и сохраненного идентификатора лутбокса.',
        );
      }
      return;
    }

    const lootBox = await this.prisma.guestGameLootBox.findFirst({
      where: {
        id: lootBoxId,
        tenantId: user.tenantId,
        status: 'ACTIVE',
        usageKind: { in: ['REWARD_TEMPLATE', 'BOTH'] },
      },
      select: { id: true, name: true },
    });
    if (!lootBox) {
      throw new BadRequestException(
        'Наградной лутбокс больше недоступен для выдачи.',
      );
    }

    const isBattlePassReward = Boolean(reward.season);
    const idempotencyKey = isBattlePassReward
      ? `battle-pass-loot-box-approval:${reward.id}`
      : `mission-loot-box-approval:${reward.id}`;
    await this.prisma.guestGameEntitlement.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId: user.tenantId,
          idempotencyKey,
        },
      },
      create: {
        tenantId: user.tenantId,
        profileId: reward.profileId,
        guestId: reward.guestId,
        storeId: reward.storeId,
        rewardId: reward.id,
        ruleType: 'LOOT_BOX',
        ruleId: lootBox.id,
        ruleName: lootBox.name,
        sourceEventType: isBattlePassReward
          ? 'BATTLE_PASS_REWARD_APPROVED'
          : 'MISSION_REWARD_APPROVED',
        status: 'AVAILABLE',
        idempotencyKey,
        qualifiedAt: reward.qualifiedAt,
        evidence: isBattlePassReward
          ? {
              source: reward.approvedByUser
                ? 'battle_pass_reward_admin_approval'
                : 'battle_pass_reward_auto',
              seasonId: reward.season?.id ?? null,
              battlePassLevel: intValue(ruleEvidence.battlePassLevel),
              battlePassStep: intValue(ruleEvidence.battlePassStep),
              battlePassRewardTrack: battlePassTrack,
              rewardId: reward.id,
              approvedByUserId: reward.approvedByUser?.id ?? null,
              evaluatorVersion: 'battle-pass-rewards-v2',
            }
          : {
              source: 'mission_reward_admin_approval',
              missionId: reward.mission?.id ?? null,
              rewardId: reward.id,
              approvedByUserId: user.id,
              evaluatorVersion: 'mission-wizard-v2',
            },
      },
      // Approval/effect retries are create-only. In particular, a consumed
      // or canceled entitlement is terminal and must never become AVAILABLE
      // again merely because the materializer retried the same reward.
      update: {},
    });
  }

  private guestGameLedgerEvaluatorMode(): 'OFF' | 'SHADOW' {
    const configured = nullableString(
      this.configService.get<string>('GUEST_GAME_LEDGER_EVALUATOR_MODE'),
    )?.toUpperCase();

    if (configured === 'OFF' || configured === 'SHADOW') {
      return configured;
    }

    return process.env.NODE_ENV === 'test' ? 'OFF' : 'SHADOW';
  }

  private async recordLedgerShadowRuleDecisions(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    options: {
      eventId?: string | null;
      originKey?: string | null;
      traceId?: string | null;
      sourceFactId?: string | null;
      sourceExternalId?: string | null;
      sourceFactKind?: string | null;
      evaluationRunId: string;
      excludeSeasonRewardIds?: string[];
      evidence?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    if (
      this.guestGameLedgerEvaluatorMode() !== 'SHADOW' ||
      (!dryRun.profile?.id && !dryRun.guest?.id)
    ) {
      return;
    }

    try {
      const dryRules = new Map(dryRun.rules.map((rule) => [rule.id, rule]));
      const lootBoxIds = dryRun.rules
        .filter((rule) => rule.kind === 'LOOT_BOX')
        .map((rule) => rule.id);
      const missionIds = dryRun.rules
        .filter((rule) => rule.kind === 'MISSION')
        .map((rule) => rule.id);
      const seasonIds = dryRun.rules
        .filter((rule) => rule.kind === 'SEASON')
        .map((rule) => rule.id);
      const identityGuestIds = await this.resolveProfileIdentityGuestIds(user, {
        profileId: dryRun.profile?.id,
        legacyGuestId: dryRun.guest?.id,
        legacyExternalDomain: dryRun.guest?.externalDomain,
        externalDomain: dryRun.store?.externalDomain,
      });
      const identityOwners: Prisma.GuestGameRewardWhereInput[] = [
        ...(dryRun.profile?.id ? [{ profileId: dryRun.profile.id }] : []),
        ...(identityGuestIds.length
          ? [{ guestId: { in: identityGuestIds } }]
          : []),
      ];
      const lootBoxes = lootBoxIds.length
        ? await this.prisma.guestGameLootBox.findMany({
            where: { tenantId: user.tenantId, id: { in: lootBoxIds } },
          })
        : [];
      const missions = missionIds.length
        ? await this.prisma.guestGameMission.findMany({
            where: { tenantId: user.tenantId, id: { in: missionIds } },
          })
        : [];
      const seasons = seasonIds.length
        ? await this.prisma.guestGameSeason.findMany({
            where: { tenantId: user.tenantId, id: { in: seasonIds } },
          })
        : [];
      const seasonRewards = seasonIds.length
        ? await this.prisma.guestGameReward.findMany({
            where: {
              tenantId: user.tenantId,
              seasonId: { in: seasonIds },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
              ...(options.excludeSeasonRewardIds?.length
                ? { id: { notIn: options.excludeSeasonRewardIds } }
                : {}),
              OR: identityOwners,
            },
            select: {
              id: true,
              seasonId: true,
              profileId: true,
              guestId: true,
              status: true,
              qualifiedAt: true,
              expiresAt: true,
            },
            orderBy: { qualifiedAt: 'desc' },
            take: 1000,
          })
        : [];
      const ruleStores =
        (await this.prisma.store.findMany({
          where: { tenantId: user.tenantId, isActive: true },
          select: { id: true, externalDomain: true, timeZone: true },
        })) ?? [];
      const rules: GuestGameLedgerRule[] = [
        ...lootBoxes.map((rule) => ({
          type: 'LOOT_BOX',
          id: rule.id,
          title: rule.name,
          triggerKind:
            dryRules.get(rule.id)?.triggerKind ?? rule.triggerKind ?? null,
          sessionType: rule.sessionType,
          createdAt: rule.createdAt,
          activatedAt: guestGameRuleActivationAt(rule.createdAt, rule.limits),
          periodFrom: null,
          periodTo: null,
          periodRules: rule.periodRules,
          storeIds: guestGameStringArray(rule.storeIds),
          externalDomains: guestGameRuleExternalDomains(
            guestGameStringArray(rule.storeIds),
            ruleStores,
          ),
          domainTimeZones: guestGameRuleDomainTimeZones(
            guestGameStringArray(rule.storeIds),
            ruleStores,
          ),
          progressTarget: null,
          progressUnit: null,
        })),
        ...missions.map((rule) => ({
          type: 'MISSION',
          id: rule.id,
          title: rule.name,
          triggerKind:
            dryRules.get(rule.id)?.triggerKind ?? rule.triggerKind ?? null,
          sessionType: guestGameSessionTypeFromConditions(rule.conditions),
          createdAt: rule.createdAt,
          activatedAt: guestGameRuleActivationAt(
            rule.createdAt,
            rule.conditions,
          ),
          periodFrom: rule.periodFrom,
          periodTo: rule.periodTo,
          periodRules: rule.conditions,
          storeIds: guestGameStringArray(rule.storeIds),
          externalDomains: guestGameRuleExternalDomains(
            guestGameStringArray(rule.storeIds),
            ruleStores,
          ),
          domainTimeZones: guestGameRuleDomainTimeZones(
            guestGameStringArray(rule.storeIds),
            ruleStores,
          ),
          progressTarget: rule.progressTarget,
          progressUnit: rule.progressUnit,
        })),
        ...seasons.map((rule) => {
          const dryRule = dryRules.get(rule.id);
          const currentStep = dryRunSeasonLevels(rule.levels).find(
            (level) => level.level === dryRule?.battlePassLevel,
          );
          const periodRules = dryRunRecord(
            currentStep?.activationRules ?? rule.xpRules,
          );
          const metric = dryRunRecord(periodRules.metric);

          return {
            type: 'BATTLE_PASS' as const,
            id: rule.id,
            title: rule.name,
            triggerKind:
              dryRunString(periodRules.triggerKind) ??
              dryRule?.triggerKind ??
              dryRun.eventType ??
              null,
            sessionType:
              guestGameSessionTypeFromConditions(
                periodRules as Prisma.JsonValue,
              ) ?? dryRun.input.sessionType,
            createdAt: rule.createdAt,
            activatedAt: guestGameShadowBattlePassStepActivatedAt(
              rule,
              dryRun,
              seasonRewards,
              options.excludeSeasonRewardIds,
            ),
            periodFrom: rule.periodFrom,
            periodTo: rule.periodTo,
            periodRules: periodRules as Prisma.JsonValue,
            storeIds: guestGameStringArray(rule.storeIds),
            externalDomains:
              dryRunStringArray(periodRules.externalDomains).length > 0
                ? dryRunStringArray(periodRules.externalDomains)
                : guestGameRuleExternalDomains(
                    guestGameStringArray(rule.storeIds),
                    ruleStores,
                  ),
            domainTimeZones: guestGameRuleDomainTimeZones(
              guestGameStringArray(rule.storeIds),
              ruleStores,
            ),
            progressTarget: dryRunOptionalNumber(metric.target),
            progressUnit: dryRunString(metric.unit),
          };
        }),
      ];

      if (!rules.length) {
        return;
      }

      const occurredAt = new Date(dryRun.occurredAt);
      const evaluatedTo = Number.isNaN(occurredAt.getTime())
        ? new Date()
        : occurredAt;
      const evaluatedFrom = rules.reduce(
        (earliest, rule) =>
          rule.activatedAt < earliest ? rule.activatedAt : earliest,
        rules[0].activatedAt,
      );
      const facts = await this.prisma.guestActivityFact.findMany({
        where: {
          tenantId: user.tenantId,
          lifecycleStatus: 'ACTIVE',
          OR: [
            ...(dryRun.profile?.id ? [{ profileId: dryRun.profile.id }] : []),
            ...(identityGuestIds.length
              ? [{ guestId: { in: identityGuestIds } }]
              : []),
          ],
          happenedAt: { gte: evaluatedFrom, lte: evaluatedTo },
        },
        include: {
          store: { select: { id: true, timeZone: true } },
        },
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      });
      const evaluatedAt = new Date();

      await this.prisma.guestGameRuleDecision.createMany({
        data: rules.map((rule) => {
          const evaluation = evaluateGuestGameLedgerRule(
            rule,
            facts,
            dryRun.store?.id ?? null,
            evaluatedTo,
            {
              mode: 'EVENT_PARITY',
              sourceEventType: dryRun.eventType,
              sourceFactId: nullableString(options.sourceFactId),
              sourceExternalId: nullableString(options.sourceExternalId),
              sourceOriginKey: nullableString(options.originKey),
              occurredAt: evaluatedTo,
            },
          );

          return {
            tenantId: user.tenantId,
            profileId: dryRun.profile?.id ?? null,
            guestId: dryRun.guest?.id ?? null,
            storeId: dryRun.store?.id ?? null,
            eventId: nullableId(options.eventId),
            evaluationRunId: options.evaluationRunId,
            evaluationMode: 'SHADOW',
            evaluatorVersion: 'ledger-v2',
            ruleType: rule.type,
            ruleId: rule.id,
            ruleName: rule.title,
            ruleStatus: dryRules.get(rule.id)?.status ?? null,
            triggerKind: rule.triggerKind,
            sourceEventType: dryRun.eventType,
            sourceFactId: nullableString(options.sourceFactId),
            sourceFactKind: nullableString(options.sourceFactKind),
            traceId: nullableString(options.traceId),
            status: evaluation.status,
            reasons: evaluation.reasons,
            blockers: evaluation.blockers,
            input: {
              occurredAt: dryRun.occurredAt,
              storeId: dryRun.store?.id ?? null,
              ...dryRun.input,
            },
            evidence: {
              liveEvidence: options.evidence ?? null,
              facts: evaluation.facts.slice(0, 20).map((fact) => ({
                id: fact.id,
                factType: fact.factType,
                confidence: fact.confidence,
                happenedAt: fact.happenedAt?.toISOString() ?? null,
                storeId: fact.storeId,
                tariffName: fact.tariffName,
                tariffType: fact.tariffType,
                amount: fact.amount?.toString() ?? null,
                durationMinutes: fact.durationMinutes,
                evidence: fact.evidence,
              })),
              progress: evaluation.progress,
            },
            evaluatedAt,
          };
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist ledger shadow decisions for tenant ${user.tenantId}: ${this.checkInErrorMessage(error)}`,
      );
    }
  }

  async processEvent(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
    options: GuestGameProcessEventOptions = {},
  ): Promise<GuestGameProcessEventResult> {
    const { profile, profileCreated } = await this.ensureProcessProfile(
      user,
      dto,
    );
    const requestedGuestId = nullableId(dto.guestId);
    const requestedStoreId = nullableId(dto.storeId);
    const requestedExternalDomain = nullableString(dto.externalDomain);
    const processStore =
      !requestedExternalDomain && requestedStoreId
        ? await this.prisma.store.findFirst({
            where: { id: requestedStoreId, tenantId: user.tenantId },
            select: { externalDomain: true },
          })
        : null;
    const processExternalDomain =
      requestedExternalDomain ?? nullableString(processStore?.externalDomain);
    const scopedRequestedGuestId =
      requestedGuestId && processExternalDomain
        ? ((
            await this.prisma.guest.findFirst({
              where: {
                id: requestedGuestId,
                tenantId: user.tenantId,
                externalDomain: processExternalDomain,
                isDisabled: false,
              },
              select: { id: true },
            })
          )?.id ?? null)
        : requestedGuestId;
    const processIdentityGuestIds = await this.resolveProfileIdentityGuestIds(
      user,
      {
        profileId: profile.id,
        legacyGuestId: profile.guest?.id,
        legacyExternalDomain: profile.guest?.externalDomain,
        externalDomain: processExternalDomain,
      },
    );
    const processGuestId =
      scopedRequestedGuestId ??
      processIdentityGuestIds[0] ??
      (processExternalDomain ? null : (profile.guest?.id ?? null)) ??
      null;
    const dryRunOptions =
      options.ruleDomainTimeZones ||
      options.ruleExternalDomains ||
      options.replayRewardScope
        ? {
            ruleDomainTimeZones: options.ruleDomainTimeZones,
            ruleExternalDomains: options.ruleExternalDomains,
            ...(options.replayRewardScope
              ? {
                  rewardScope: {
                    seasonId: options.replayRewardScope.ruleId,
                    profileId: profile.id,
                    guestId: processGuestId,
                  },
                }
              : {}),
          }
        : undefined;
    const dryRunResult = await this.dryRun(
      user,
      {
        ...dto,
        profileId: profile.id,
        guestId: processGuestId,
      },
      dryRunOptions,
    );
    const activeDryRun = booleanValue(dto.activeRulesOnly)
      ? activeRulesOnlyDryRun(dryRunResult)
      : dryRunResult;
    const evaluationMode = options.evaluationMode ?? 'LIVE';
    const routedDryRun = filterDryRunRulesByEvaluationPolicy(
      activeDryRun,
      evaluationMode,
    );
    const ruleFilteredDryRun = options.allowedRuleIds
      ? filterDryRunRules(routedDryRun, new Set(options.allowedRuleIds))
      : routedDryRun;
    const decisionDryRun = options.allowedBattlePassSteps
      ? filterDryRunBattlePassSteps(
          ruleFilteredDryRun,
          options.allowedBattlePassSteps,
        )
      : ruleFilteredDryRun;
    const rewardDryRun = booleanValue(dto.suppressLootBoxRewards)
      ? suppressLootBoxRewardsDryRun(decisionDryRun)
      : decisionDryRun;
    const dryRun = booleanValue(dto.suppressLootBoxEntitlements)
      ? suppressLootBoxEntitlementsDryRun(rewardDryRun)
      : rewardDryRun;
    const eventReference = buildProcessExternalReference(dto, dryRun.eventType);
    const originKey =
      nullableString(options.originKey) ??
      buildProcessOriginKey(dto, dryRun.eventType);
    const materializeRewards = options.materializeRewards !== false;
    const processPayload = buildProcessPayload(dto, dryRun, materializeRewards);
    let existingEvent = originKey
      ? await this.findProcessEventByOriginKey(user, originKey)
      : null;
    if (!existingEvent && eventReference) {
      existingEvent = await this.findProcessEventByReference(
        user,
        eventReference,
      );
    }

    if (
      existingEvent &&
      !processEventOriginOwnerMatches(
        existingEvent,
        profile.id,
        dryRun.eventType,
      )
    ) {
      throw new ConflictException(
        'Каноническое событие уже связано с другим гостем или типом действия.',
      );
    }

    if (existingEvent) {
      const replayIntentIds = options.replayRewardScope
        ? await this.persistReplayRewardIntent(
            user,
            dryRun,
            existingEvent.id,
            profile.id,
            originKey,
            options.replayRewardScope,
          )
        : undefined;
      if (options.replayRewardScope && replayIntentIds) {
        await this.recordRuleDecisions(user, dryRun, {
          eventId: existingEvent.id,
          originKey,
          traceId: nullableString(dto.traceId),
          sourceFactId: options.replayRewardScope.sourceFactId,
          sourceExternalId: nullableString(dto.externalId),
          sourceFactKind: 'RULE_REPLAY',
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          evaluatorVersion: options.evaluatorVersion ?? 'ledger-rule-replay-v1',
          suppressLedgerShadow: true,
          evidence: {
            ruleReplay: true,
            actorUserId: user.id,
            factId: options.replayRewardScope.sourceFactId,
            seasonId: options.replayRewardScope.ruleId,
            stepId: options.replayRewardScope.stepId,
            stepSequence: options.replayRewardScope.battlePassStep,
            confirmationHash: options.replayRewardScope.confirmationHash,
            intentIds: replayIntentIds,
            deliveryStatus: 'INTENT_PERSISTED',
          },
        });
      }
      const existingRewards = materializeRewards
        ? await this.findProcessRewardsByReference(
            user,
            eventReference,
            originKey,
          )
        : [];
      const materialized = materializeRewards
        ? await this.materializeProcessRewardIntents(
            user,
            dto,
            dryRun,
            existingEvent,
            profile.id,
            eventReference,
            originKey,
            replayIntentIds ? { intentIds: replayIntentIds } : undefined,
          )
        : null;
      const persistedProcessDryRun = processPersistedEventDryRun(
        existingEvent,
        materialized?.dryRun ?? dryRun,
      );
      const processDryRun = dryRunWithPersistedRewardIntents(
        persistedProcessDryRun ?? dryRun,
        materialized?.dryRun ?? null,
      );
      const processRewards = materialized?.rewards ?? existingRewards;
      const existingRewardIds = new Set(
        existingRewards.map((reward) => reward.id),
      );
      const createdRewards = processRewards.filter(
        (reward) => !existingRewardIds.has(reward.id),
      );
      const persistedEntitlementDryRun = !options.replayRewardScope
        ? processLootBoxEntitlementRecoveryDryRun(existingEvent, processDryRun)
        : null;
      const missingLootBoxEntitlementRuleIds = persistedEntitlementDryRun
        ? await this.getMissingMatchedLootBoxEntitlementRuleIds(
            user,
            persistedEntitlementDryRun,
            existingEvent.id,
          )
        : [];
      const missingMissionEntitlementRuleIds = persistedEntitlementDryRun
        ? await this.getMissingMatchedMissionRewardEntitlementRuleIds(
            user,
            persistedEntitlementDryRun,
            existingEvent.id,
          )
        : [];
      const missingEntitlementRuleIds = uniqueStrings([
        ...missingLootBoxEntitlementRuleIds,
        ...missingMissionEntitlementRuleIds,
      ]);
      const entitlementRecoveryDryRun = missingEntitlementRuleIds.length
        ? filterDryRunRules(
            persistedEntitlementDryRun!,
            new Set(missingEntitlementRuleIds),
          )
        : null;

      // Legacy events do not have an immutable reward intent. Re-evaluating
      // them here could advance another Battle Pass step or reroll a lootbox.
      if (
        !options.replayRewardScope &&
        (materialized || entitlementRecoveryDryRun)
      ) {
        await this.recordRuleDecisions(
          user,
          entitlementRecoveryDryRun ?? processDryRun,
          {
            eventId: existingEvent.id,
            originKey,
            traceId: nullableString(dto.traceId),
            sourceFactId: nullableString(dto.sourceFactId),
            sourceExternalId: nullableString(dto.externalId),
            sourceFactKind: nullableString(dto.sourceFactKind),
            evaluationRunId: entitlementRecoveryDryRun
              ? `loot-box-entitlement-recovery:${existingEvent.id}`
              : undefined,
            evaluationMode:
              options.evaluationMode ??
              (entitlementRecoveryDryRun
                ? 'LIVE_LOOT_BOX_RECOVERY'
                : undefined),
            evaluatorVersion: options.evaluatorVersion,
            suppressLedgerShadow:
              options.suppressLedgerShadow ??
              Boolean(entitlementRecoveryDryRun),
            excludeSeasonRewardIds: processRewards.map((reward) => reward.id),
            evidence: {
              idempotent: true,
              entitlementRecovery: Boolean(entitlementRecoveryDryRun),
              recoveredFromPersistedIntent: createdRewards.length > 0,
              externalId: eventReference?.externalId ?? null,
              originKey,
            },
          },
        );
      }

      return {
        processed: true,
        dryRun: processDryRun,
        event: mapEvent(existingEvent),
        rewards: processRewards,
        summary: {
          profileCreated: false,
          appliedXpDelta: 0,
          createdRewards: createdRewards.length,
          queuedRewardAmount: sum(
            processRewards.map((reward) => reward.rewardAmount),
          ),
          idempotencyKey: originKey ?? eventReference?.externalId ?? null,
          idempotent: true,
          langameWrite: false,
        },
        note:
          createdRewards.length > 0
            ? 'Snapshot-событие уже было обработано ранее; LeetPlus восстановил отсутствующие награды без повторного XP или события.'
            : 'Snapshot-событие уже было обработано ранее; повторный запуск не создал XP, события или награды.',
      };
    }

    if (options.replayRewardScope) {
      throw new ConflictException(
        'Точечный replay не создаёт новое физическое событие: каноническое событие исходного факта не найдено.',
      );
    }

    const source: EventSource =
      nullableString(dto.sourceFactKind) === 'LIVE_CHECK_IN'
        ? 'CHECK_IN'
        : 'API_IMPORT';
    let event: GuestGameEvent;

    try {
      event = await this.createProcessEvent(
        user,
        {
          profileId: profile.id,
          guestId: processGuestId,
          lootBoxId: nullableId(dto.lootBoxId),
          eventType: dryRun.eventType,
          source,
          externalProvider: eventReference?.externalProvider ?? null,
          externalDomain: eventReference?.externalDomain ?? null,
          externalId: eventReference?.externalId ?? null,
          xpDelta: materializeRewards ? dryRun.summary.projectedXpDelta : 0,
          occurredAt: dryRun.occurredAt,
          payload: processPayload,
          note:
            nullableString(dto.note) ??
            'Подтвержденный запуск события геймификации в LeetPlus.',
        },
        originKey,
      );
    } catch (error) {
      if ((originKey || eventReference) && error instanceof ConflictException) {
        let duplicateEvent = originKey
          ? await this.findProcessEventByOriginKey(user, originKey)
          : null;
        if (!duplicateEvent && eventReference) {
          duplicateEvent = await this.findProcessEventByReference(
            user,
            eventReference,
          );
        }

        if (duplicateEvent) {
          if (
            !processEventOriginOwnerMatches(
              duplicateEvent,
              profile.id,
              dryRun.eventType,
            )
          ) {
            throw new ConflictException(
              'Каноническое событие уже связано с другим гостем или типом действия.',
            );
          }
          const existingRewards = materializeRewards
            ? await this.findProcessRewardsByReference(
                user,
                eventReference,
                originKey,
              )
            : [];
          const materialized = materializeRewards
            ? await this.materializeProcessRewardIntents(
                user,
                dto,
                dryRun,
                duplicateEvent,
                profile.id,
                eventReference,
                originKey,
              )
            : null;
          const persistedProcessDryRun = processPersistedEventDryRun(
            duplicateEvent,
            materialized?.dryRun ?? dryRun,
          );
          const processDryRun = dryRunWithPersistedRewardIntents(
            persistedProcessDryRun ?? dryRun,
            materialized?.dryRun ?? null,
          );
          const processRewards = materialized?.rewards ?? existingRewards;
          const existingRewardIds = new Set(
            existingRewards.map((reward) => reward.id),
          );
          const createdRewards = processRewards.filter(
            (reward) => !existingRewardIds.has(reward.id),
          );

          const persistedEntitlementDryRun =
            processLootBoxEntitlementRecoveryDryRun(
              duplicateEvent,
              processDryRun,
            );
          const missingLootBoxEntitlementRuleIds = persistedEntitlementDryRun
            ? await this.getMissingMatchedLootBoxEntitlementRuleIds(
                user,
                persistedEntitlementDryRun,
                duplicateEvent.id,
              )
            : [];
          const missingMissionEntitlementRuleIds = persistedEntitlementDryRun
            ? await this.getMissingMatchedMissionRewardEntitlementRuleIds(
                user,
                persistedEntitlementDryRun,
                duplicateEvent.id,
              )
            : [];
          const missingEntitlementRuleIds = uniqueStrings([
            ...missingLootBoxEntitlementRuleIds,
            ...missingMissionEntitlementRuleIds,
          ]);
          const entitlementRecoveryDryRun = missingEntitlementRuleIds.length
            ? filterDryRunRules(
                persistedEntitlementDryRun!,
                new Set(missingEntitlementRuleIds),
              )
            : null;

          if (materialized || entitlementRecoveryDryRun) {
            await this.recordRuleDecisions(
              user,
              entitlementRecoveryDryRun ?? processDryRun,
              {
                eventId: duplicateEvent.id,
                originKey,
                traceId: nullableString(dto.traceId),
                sourceFactId: nullableString(dto.sourceFactId),
                sourceExternalId: nullableString(dto.externalId),
                sourceFactKind: nullableString(dto.sourceFactKind),
                evaluationRunId: entitlementRecoveryDryRun
                  ? `loot-box-entitlement-recovery:${duplicateEvent.id}`
                  : undefined,
                evaluationMode:
                  options.evaluationMode ??
                  (entitlementRecoveryDryRun
                    ? 'LIVE_LOOT_BOX_RECOVERY'
                    : undefined),
                evaluatorVersion: options.evaluatorVersion,
                suppressLedgerShadow:
                  options.suppressLedgerShadow ??
                  Boolean(entitlementRecoveryDryRun),
                excludeSeasonRewardIds: processRewards.map(
                  (reward) => reward.id,
                ),
                evidence: {
                  idempotent: true,
                  entitlementRecovery: Boolean(entitlementRecoveryDryRun),
                  conflictRecovered: true,
                  recoveredFromPersistedIntent: createdRewards.length > 0,
                  externalId: eventReference?.externalId ?? null,
                  originKey,
                },
              },
            );
          }

          return {
            processed: true,
            dryRun: processDryRun,
            event: mapEvent(duplicateEvent),
            rewards: processRewards,
            summary: {
              profileCreated: false,
              appliedXpDelta: 0,
              createdRewards: createdRewards.length,
              queuedRewardAmount: sum(
                processRewards.map((reward) => reward.rewardAmount),
              ),
              idempotencyKey: originKey ?? eventReference?.externalId ?? null,
              idempotent: true,
              langameWrite: false,
            },
            note:
              createdRewards.length > 0
                ? 'Событие уже было обработано параллельным запросом; LeetPlus восстановил отсутствующие награды без повторного XP или события.'
                : 'Событие уже было обработано параллельным запросом; повторный запуск не создал XP, события или награды.',
          };
        }
      }

      throw error;
    }
    const materialized = materializeRewards
      ? await this.materializeProcessRewardIntents(
          user,
          dto,
          dryRun,
          event,
          profile.id,
          eventReference,
          originKey,
        )
      : null;
    const persistedProcessDryRun = processPersistedEventDryRun(
      event,
      materialized?.dryRun ?? dryRun,
    );
    const processDryRun = dryRunWithPersistedRewardIntents(
      persistedProcessDryRun ?? dryRun,
      materialized?.dryRun ?? null,
    );
    const rewards = materialized?.rewards ?? [];

    if (materializeRewards) {
      await this.recordRuleDecisions(user, processDryRun, {
        eventId: event.id,
        originKey,
        traceId: nullableString(dto.traceId),
        sourceFactId: nullableString(dto.sourceFactId),
        sourceExternalId: nullableString(dto.externalId),
        sourceFactKind: nullableString(dto.sourceFactKind),
        evaluationMode: options.evaluationMode,
        evaluatorVersion: options.evaluatorVersion,
        suppressLedgerShadow: options.suppressLedgerShadow,
        excludeSeasonRewardIds: rewards.map((reward) => reward.id),
        evidence: {
          idempotent: false,
          originKey,
          createdRewardIds: rewards.map((reward) => reward.id),
        },
      });
    }

    return {
      processed: true,
      dryRun: processDryRun,
      event,
      rewards,
      summary: {
        profileCreated,
        appliedXpDelta: event.xpDelta,
        createdRewards: rewards.length,
        queuedRewardAmount: sum(rewards.map((reward) => reward.rewardAmount)),
        idempotencyKey: originKey ?? eventReference?.externalId ?? null,
        idempotent: false,
        langameWrite: false,
      },
      note: 'Событие и очередь наград созданы внутри LeetPlus. Запись в Langame не выполнялась.',
    };
  }

  async processLiveSessionStart(
    user: AuthenticatedUser,
    dto: Pick<
      GuestGameProcessEventDto,
      'profileId' | 'guestId' | 'storeId' | 'note' | 'traceId'
    >,
  ): Promise<GuestGameProcessEventResult | null> {
    const guestId = nullableId(dto.guestId);

    if (!guestId) {
      this.logGuestGameDebug(
        'live-session-start-skipped',
        {
          tenantId: user.tenantId,
          storeId: nullableId(dto.storeId),
          profileId: nullableId(dto.profileId),
          guestId: null,
          reason: 'guest_id_missing',
        },
        'warn',
      );
      return null;
    }

    const guest = await this.getTenantGuest(user, guestId);
    const externalGuestId = nullableString(guest.externalGuestId);

    if (!externalGuestId) {
      this.logGuestGameDebug(
        'live-session-start-skipped',
        {
          tenantId: user.tenantId,
          storeId: nullableId(dto.storeId),
          profileId: nullableId(dto.profileId),
          guestId,
          reason: 'external_guest_id_missing',
        },
        'warn',
      );
      return null;
    }

    const expectedStoreId = nullableId(dto.storeId) ?? null;
    const cacheKey = this.liveSessionStartCacheKey(
      user.tenantId,
      guestId,
      expectedStoreId,
    );
    const cached = this.readLiveSessionStartCache(cacheKey);

    if (cached !== undefined) {
      this.logGuestGameDebug('live-session-start-cache-hit', {
        tenantId: user.tenantId,
        guestId,
        storeId: expectedStoreId,
        cacheKey,
        result: this.guestGameDebugProcessResult(cached),
      });
      return cached;
    }

    const pending = this.liveSessionStartInFlight.get(cacheKey);

    if (pending) {
      return pending;
    }

    const promise = this.processLiveSessionStartUncached(
      user,
      dto,
      {
        externalDomain: guest.externalDomain,
        externalGuestId,
        currentCountHours: guest.currentCountHours,
      },
      guestId,
      expectedStoreId,
    )
      .then((outcome) => {
        if (outcome.cache) {
          this.writeLiveSessionStartCache(cacheKey, outcome.result);
        }

        return outcome.result;
      })
      .finally(() => {
        this.liveSessionStartInFlight.delete(cacheKey);
      });

    this.liveSessionStartInFlight.set(cacheKey, promise);

    return promise;
  }

  private async processLiveSessionStartUncached(
    user: AuthenticatedUser,
    dto: Pick<
      GuestGameProcessEventDto,
      'profileId' | 'guestId' | 'storeId' | 'note' | 'traceId'
    >,
    guest: {
      externalDomain: string | null;
      externalGuestId: string;
      currentCountHours?: Prisma.Decimal | number | string | null;
    },
    guestId: string,
    expectedStoreId: string | null,
  ): Promise<LiveSessionStartProcessOutcome> {
    if (!(await this.hasActiveSessionStartRules(user))) {
      this.logGuestGameDebug('live-session-start-skipped', {
        tenantId: user.tenantId,
        guestId,
        storeId: expectedStoreId,
        reason: 'no_active_session_start_rules',
      });
      return { result: null, cache: true };
    }

    const expectedStore = expectedStoreId
      ? await this.assertStore(user, expectedStoreId)
      : null;
    const checkInExpectedStore = expectedStore
      ? this.toCheckInExpectedStore(expectedStore)
      : null;
    let liveSession: CheckInLiveSession | null;

    this.logGuestGameDebug('live-session-start-query', {
      tenantId: user.tenantId,
      guestId,
      profileId: nullableId(dto.profileId),
      expectedStoreId,
      expectedStore: this.guestGameDebugStore(checkInExpectedStore),
      externalDomain: guest.externalDomain,
      externalGuestId: guest.externalGuestId,
      localCurrentCountHours: guest.currentCountHours ?? null,
    });

    try {
      liveSession = await this.findActiveCheckInSession(user.tenantId, guest, {
        timeoutMs: this.liveSessionStartLookupTimeoutMs(),
        expectedStore: checkInExpectedStore,
      });
    } catch (error) {
      this.logGuestGameDebug(
        'live-session-start-query-failed',
        {
          tenantId: user.tenantId,
          guestId,
          expectedStoreId,
          error: this.checkInErrorMessage(error),
        },
        'warn',
      );
      this.logger.warn(
        `Failed to check live session start for guest ${guestId}: ${this.checkInErrorMessage(error)}`,
      );
      return { result: null, cache: false };
    }

    if (!liveSession?.externalSessionId) {
      this.logGuestGameDebug(
        'live-session-start-not-found',
        {
          tenantId: user.tenantId,
          guestId,
          expectedStoreId,
          expectedStore: this.guestGameDebugStore(checkInExpectedStore),
        },
        'warn',
      );
      return { result: null, cache: false };
    }

    this.logGuestGameDebug('live-session-start-found', {
      tenantId: user.tenantId,
      guestId,
      expectedStoreId,
      liveSession: this.guestGameDebugSession(liveSession),
    });

    const storeId = this.liveSessionStartStoreId(
      liveSession,
      checkInExpectedStore,
    );

    if (expectedStoreId && !storeId) {
      this.logGuestGameDebug(
        'live-session-start-store-mismatch',
        {
          tenantId: user.tenantId,
          guestId,
          expectedStoreId,
          liveSession: this.guestGameDebugSession(liveSession),
        },
        'warn',
      );
      return { result: null, cache: false };
    }

    const occurredAt = liveSession.startedAt ?? new Date();
    const processDto: GuestGameProcessEventDto = {
      traceId: nullableString(dto.traceId),
      profileId: nullableId(dto.profileId),
      guestId,
      storeId,
      eventType: 'SESSION_START',
      occurredAt: occurredAt.toISOString(),
      sessionType: liveSession.sessionType,
      sessionPacket: liveSession.sessionPacket,
      sessionMinutes: liveSession.durationMinutes ?? 0,
      sourceFactId: liveSession.externalSessionId,
      sourceFactKind: 'GUEST_SESSION',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: liveSession.externalDomain,
      externalId: liveSession.externalSessionId,
      activeRulesOnly: true,
      suppressLootBoxRewards: true,
      note:
        nullableString(dto.note) ??
        'Гость открыл игровой модуль во время активной Langame-сессии; старт сессии обработан live-проверкой.',
    };
    this.logGuestGameDebug('live-session-start-process-event', {
      tenantId: user.tenantId,
      guestId,
      profileId: processDto.profileId,
      storeId: processDto.storeId,
      eventType: processDto.eventType,
      occurredAt: processDto.occurredAt,
      sessionType: processDto.sessionType,
      sessionPacket: processDto.sessionPacket,
      sessionMinutes: processDto.sessionMinutes,
      sourceFactId: processDto.sourceFactId,
      liveSession: this.guestGameDebugSession(liveSession),
    });
    const result = await this.syncLiveSessionStartResult(
      user,
      await this.processEvent(user, processDto),
      processDto,
    );

    this.logGuestGameDebug('live-session-start-processed', {
      tenantId: user.tenantId,
      guestId,
      expectedStoreId,
      cache: liveSession.sessionPacket === true,
      result: this.guestGameDebugProcessResult(result),
    });

    return { result, cache: liveSession.sessionPacket === true };
  }

  private async syncLiveSessionStartResult(
    user: AuthenticatedUser,
    result: GuestGameProcessEventResult,
    dto: GuestGameProcessEventDto,
  ): Promise<GuestGameProcessEventResult> {
    if (!result.summary.idempotent) {
      return result;
    }

    const payload = jsonRecord(result.event.payload);
    const input = jsonRecord(payload.input ?? null);
    const nextInput = result.dryRun.input;
    const sameLiveSessionState =
      nullableString(input.sessionType) === nextInput.sessionType &&
      nullableBooleanValue(input.sessionPacket) === nextInput.sessionPacket &&
      finiteJsonNumber(input.sessionMinutes) === nextInput.sessionMinutes;

    if (sameLiveSessionState) {
      return result;
    }

    const storedWasRegular =
      nullableBooleanValue(input.sessionPacket) === false ||
      nullableString(input.sessionType) === 'regular_session';
    const becamePackage =
      nextInput.sessionPacket === true ||
      nextInput.sessionType === 'packet_hours';

    if (storedWasRegular && becamePackage) {
      // Preserve the original event payload as immutable evidence of the
      // regular classification. A separate versioned event is scoped to only
      // rules that become eligible because the package marker arrived later.
      return this.processSessionPackageClassificationCorrection(user, dto);
    }

    const nextPayload = buildProcessPayload(dto, result.dryRun);

    await this.prisma.guestGameEvent.update({
      where: { id: result.event.id },
      data: { payload: nextPayload },
    });

    return {
      ...result,
      event: {
        ...result.event,
        payload: nextPayload as Prisma.JsonValue,
      },
    };
  }

  private async processSessionPackageClassificationCorrection(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
  ): Promise<GuestGameProcessEventResult> {
    const originalExternalId = nullableString(dto.externalId);
    const originalSourceFactId = nullableString(dto.sourceFactId);
    const correctionSuffix = `:classification:${snapshotSessionPackageCorrectionVersion}`;
    const correctionExternalId = originalExternalId?.endsWith(correctionSuffix)
      ? originalExternalId
      : originalExternalId
        ? `${originalExternalId}${correctionSuffix}`
        : null;
    if (!correctionExternalId || !originalSourceFactId) {
      throw new BadRequestException(
        'Р”Р»СЏ СѓС‚РѕС‡РЅРµРЅРёСЏ С‚РёРїР° СЃРµСЃСЃРёРё РЅСѓР¶РµРЅ СЃС‚Р°Р±РёР»СЊРЅС‹Р№ Langame session id.',
      );
    }

    const correctionDto: GuestGameProcessEventDto = {
      ...dto,
      eventType: 'SESSION_START',
      sessionType: 'packet_hours',
      sessionPacket: true,
      // Keep the physical session identity stable. Progress aggregation uses
      // sourceFactId to distinguish sessions, while the versioned externalId
      // below gives the correction event its own idempotency/origin key.
      sourceFactId: originalSourceFactId,
      sourceFactKind: 'GUEST_SESSION',
      externalId: correctionExternalId,
      activeRulesOnly: true,
      suppressLootBoxRewards: true,
      payload: {
        ...(dto.payload ?? {}),
        sessionClassificationCorrection: {
          schemaVersion: 1,
          from: 'regular_session',
          to: 'packet_hours',
          originalExternalId,
        },
      },
    };
    const regularDto: GuestGameProcessEventDto = {
      ...correctionDto,
      sessionType: 'regular_session',
      sessionPacket: false,
    };
    const [packageDryRun, regularDryRun] = await Promise.all([
      this.dryRun(user, correctionDto),
      this.dryRun(user, regularDto),
    ]);
    const routedPackageDryRun = filterDryRunRulesByEvaluationPolicy(
      activeRulesOnlyDryRun(packageDryRun),
      'LIVE',
    );
    const routedRegularDryRun = filterDryRunRulesByEvaluationPolicy(
      activeRulesOnlyDryRun(regularDryRun),
      'LIVE',
    );
    const regularEligibility = new Map(
      routedRegularDryRun.rules.map((rule) => [
        sessionClassificationRuleKey(rule),
        rule.eligible,
      ]),
    );
    const newlyEligible = routedPackageDryRun.rules.filter(
      (rule) =>
        rule.status === 'ACTIVE' &&
        rule.eligible &&
        regularEligibility.get(sessionClassificationRuleKey(rule)) !== true,
    );
    const allowedRuleIds = new Set(newlyEligible.map((rule) => rule.id));
    const allowedBattlePassSteps = new Map<string, number>();
    for (const rule of newlyEligible) {
      if (rule.kind === 'SEASON' && rule.battlePassStep != null) {
        allowedBattlePassSteps.set(rule.id, rule.battlePassStep);
      }
    }

    return this.processEvent(user, correctionDto, {
      allowedRuleIds,
      allowedBattlePassSteps,
      evaluationMode: 'LIVE',
      evaluatorVersion: 'live-session-package-correction-v1',
      materializeRewards: newlyEligible.length > 0,
      suppressLedgerShadow: newlyEligible.length === 0,
    });
  }

  private async hasActiveSessionStartRules(user: AuthenticatedUser) {
    const [lootBoxes, missions, seasons] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          usageKind: { in: ['STANDALONE', 'BOTH'] },
        },
        select: { triggerKind: true },
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: { triggerKind: true },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: { xpRules: true },
      }),
    ]);

    return (
      lootBoxes.some((rule) =>
        guestGameTriggerMatches(rule.triggerKind, 'SESSION_START'),
      ) ||
      missions.some((rule) =>
        guestGameTriggerMatches(rule.triggerKind, 'SESSION_START'),
      ) ||
      seasons.some((season) =>
        this.seasonXpRulesMatchLiveSessionStart(season.xpRules),
      )
    );
  }

  private seasonXpRulesMatchLiveSessionStart(value: unknown) {
    const rules = dryRunRecord(value);

    return (
      dryRunNumber(rules.visit, 0) > 0 ||
      dryRunNumber(rules.packetSessionBonus, 0) > 0
    );
  }

  private liveSessionStartCacheKey(
    tenantId: string,
    guestId: string,
    storeId: string | null,
  ) {
    return [tenantId, guestId, storeId ?? 'any-store'].join(':');
  }

  private readLiveSessionStartCache(
    key: string,
  ): GuestGameProcessEventResult | null | undefined {
    const entry = this.liveSessionStartCache.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.liveSessionStartCache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  private writeLiveSessionStartCache(
    key: string,
    result: GuestGameProcessEventResult | null,
  ) {
    const ttlMs = this.liveSessionStartCacheTtlMs();

    if (ttlMs <= 0) {
      return;
    }

    if (this.liveSessionStartCache.size >= liveSessionStartCacheMaxEntries) {
      const oldestKey = this.liveSessionStartCache.keys().next();

      if (!oldestKey.done) {
        this.liveSessionStartCache.delete(oldestKey.value);
      }
    }

    this.liveSessionStartCache.set(key, {
      expiresAt: Date.now() + ttlMs,
      result,
    });
  }

  private liveSessionStartCacheTtlMs() {
    return this.configMilliseconds(
      'GUEST_GAME_LIVE_SESSION_START_CACHE_TTL_MS',
      liveSessionStartCacheDefaultTtlMs,
      0,
      5 * 60_000,
    );
  }

  private liveSessionStartLookupTimeoutMs() {
    return this.configMilliseconds(
      'GUEST_GAME_LIVE_SESSION_START_LOOKUP_TIMEOUT_MS',
      liveSessionStartLookupDefaultTimeoutMs,
      1_000,
      15_000,
    );
  }

  private configMilliseconds(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const configured = intValue(this.configService.get<string>(key));

    if (configured == null) {
      return fallback;
    }

    return Math.min(max, Math.max(min, configured));
  }

  async checkIn(
    user: AuthenticatedUser,
    dto: GuestGameCheckInDto,
  ): Promise<GuestGameCheckInResult> {
    const guestId = nullableId(dto.guestId);

    if (!guestId) {
      throw new BadRequestException('Выберите гостя для чекина');
    }

    const guest = await this.getTenantGuest(user, guestId);

    if (!nullableString(guest.externalGuestId)) {
      throw new BadRequestException(
        'У гостя нет Langame guest_id, поэтому проверить активную сессию нельзя.',
      );
    }

    const expectedStoreId = nullableId(dto.storeId);
    const expectedStore = expectedStoreId
      ? this.toCheckInExpectedStore(
          await this.assertStore(user, expectedStoreId),
        )
      : null;
    let liveSession: CheckInLiveSession | null;

    try {
      liveSession = await this.findActiveCheckInSession(user.tenantId, guest, {
        expectedStore,
      });
    } catch (error) {
      throw new BadRequestException(
        `Не удалось проверить активную сессию Langame: ${this.checkInErrorMessage(error)}`,
      );
    }

    if (!liveSession) {
      throw new BadRequestException(
        'Активная сессия гостя в Langame не найдена. Чекин доступен только гостю, который сейчас находится в клубе.',
      );
    }

    liveSession = this.resolveCheckInSessionTypeFromGuestBalance(
      liveSession,
      guest,
    );

    const checkInStore = liveSession.store ?? expectedStore;

    if (
      expectedStore &&
      (!checkInStore || checkInStore.id !== expectedStore.id)
    ) {
      throw new BadRequestException(
        'Не удалось подтвердить, что активная сессия гостя открыта в этом клубе.',
      );
    }

    const checkedAt = new Date();

    if (checkInStore?.id) {
      await this.assertCheckInAvailableToday(user, {
        guestId: guest.id,
        storeId: checkInStore.id,
        externalDomain: liveSession.externalDomain,
        checkedAt,
        timeZone: checkInStore.timeZone,
      });
    }

    const eventExternalId = [
      'check-in',
      liveSession.externalDomain,
      liveSession.externalSessionId,
      guest.externalGuestId,
    ].join(':');
    const storeResolvedBy =
      checkInStore &&
      expectedStore &&
      checkInStore.id === expectedStore.id &&
      expectedStore.externalDomain &&
      liveSession.externalDomain === expectedStore.externalDomain &&
      liveSession.externalClubId !== expectedStore.externalClubId
        ? 'selected_store_domain_fallback'
        : checkInStore && expectedStore && !liveSession.externalClubId
          ? 'selected_store_fallback'
          : checkInStore
            ? 'langame_session'
            : 'none';
    const processResult = await this.processEvent(user, {
      guestId: guest.id,
      storeId: checkInStore?.id ?? null,
      eventType: 'CHECK_IN',
      occurredAt: checkedAt.toISOString(),
      sessionType: liveSession.sessionType,
      sessionPacket: liveSession.sessionPacket,
      sessionMinutes: liveSession.durationMinutes ?? 0,
      sourceFactId: liveSession.externalSessionId,
      sourceFactKind: 'LIVE_CHECK_IN',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: liveSession.externalDomain,
      externalId: eventExternalId,
      payload: {
        langameSessionResolution: {
          externalClubId: liveSession.externalClubId,
          selectedStoreId: expectedStore?.id ?? null,
          resolvedStoreId: checkInStore?.id ?? null,
          storeResolvedBy,
        },
      },
      suppressLootBoxRewards: true,
      note:
        nullableString(dto.note) ??
        'Гость прошел чекин в активной сессии Langame.',
    });

    return {
      checkedIn: true,
      checkedAt: checkedAt.toISOString(),
      liveSession: {
        externalDomain: liveSession.externalDomain,
        externalSessionId: liveSession.externalSessionId,
        externalUuid: liveSession.externalUuid,
        startedAt: liveSession.startedAt?.toISOString() ?? null,
        durationMinutes: liveSession.durationMinutes,
        sessionType: liveSession.sessionType,
        sessionPacket: liveSession.sessionPacket,
        store: checkInStore
          ? { id: checkInStore.id, name: checkInStore.name }
          : null,
      },
      processResult,
      note: 'Чекин подтвержден активной сессией Langame и обработан правилами геймификации.',
    };
  }

  private async createProcessEvent(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
    originKey: string | null,
  ): Promise<GuestGameEvent> {
    try {
      return await this.createEvent(user, dto, { originKey });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Это событие snapshot уже обработано. Обновите список событий или выберите другой факт.',
        );
      }

      throw error;
    }
  }

  private findProcessEventByReference(
    user: AuthenticatedUser,
    eventReference: ProcessExternalReference,
  ) {
    return this.prisma.guestGameEvent.findFirst({
      where: {
        tenantId: user.tenantId,
        externalProvider: eventReference.externalProvider,
        externalDomain: eventReference.externalDomain,
        externalId: eventReference.externalId,
      },
      include: eventInclude,
    });
  }

  private findProcessEventByOriginKey(
    user: AuthenticatedUser,
    originKey: string,
  ) {
    return this.prisma.guestGameEvent.findFirst({
      where: { tenantId: user.tenantId, originKey },
      include: eventInclude,
    });
  }

  private async findProcessRewardsByReference(
    user: AuthenticatedUser,
    eventReference: ProcessExternalReference | null,
    originKey: string | null,
  ): Promise<GuestGameReward[]> {
    let rows = originKey
      ? await this.prisma.guestGameReward.findMany({
          where: {
            tenantId: user.tenantId,
            source: 'API_IMPORT',
            originKey,
          },
          include: rewardInclude,
          orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    if (rows.length === 0 && eventReference) {
      rows = await this.prisma.guestGameReward.findMany({
        where: {
          tenantId: user.tenantId,
          source: 'API_IMPORT',
          externalProvider: eventReference.externalProvider,
          externalDomain: eventReference.externalDomain,
          externalId: {
            startsWith: `${eventReference.externalId}:reward:`,
          },
        },
        include: rewardInclude,
        orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      });
    }

    return rows.map(mapReward);
  }

  private async findProcessRewardByExternalId(
    user: AuthenticatedUser,
    eventReference: ProcessExternalReference,
    externalId: string,
  ): Promise<GuestGameReward | null> {
    const row = await this.prisma.guestGameReward.findFirst({
      where: {
        tenantId: user.tenantId,
        source: 'API_IMPORT',
        externalProvider: eventReference.externalProvider,
        externalDomain: eventReference.externalDomain,
        externalId,
      },
      include: rewardInclude,
    });

    return row ? mapReward(row) : null;
  }

  private async findProcessRewardByIdempotencyKey(
    user: AuthenticatedUser,
    idempotencyKey: string,
  ): Promise<GuestGameReward | null> {
    const row = await this.prisma.guestGameReward.findFirst({
      where: { tenantId: user.tenantId, idempotencyKey },
      include: rewardInclude,
    });
    return row ? mapReward(row) : null;
  }

  private async persistReplayRewardIntent(
    user: AuthenticatedUser,
    dryRun: GuestGameDryRunResult,
    eventId: string,
    profileId: string,
    originKey: string | null,
    scope: NonNullable<GuestGameProcessEventOptions['replayRewardScope']>,
  ): Promise<string[]> {
    if (!originKey) {
      throw new BadRequestException(
        'Для точечного replay требуется стабильный originKey исходного факта.',
      );
    }

    const matchingRules = dryRun.rules.filter(
      (rule) =>
        rule.kind === scope.ruleKind &&
        rule.id === scope.ruleId &&
        rule.battlePassStep === scope.battlePassStep,
    );
    if (matchingRules.length !== 1 || !matchingRules[0]?.eligible) {
      throw new ConflictException(
        'Выбранный шаг Battle Pass больше не является единственным подходящим правилом replay.',
      );
    }

    const plans = matchingRules
      .filter(shouldQueueProcessReward)
      .map((rule) =>
        processRewardIntentPlan(rule, dryRun.occurredAt, profileId),
      );
    if (plans.length !== 1) {
      throw new ConflictException(
        'Для выбранного шага Battle Pass не сформирован единственный план награды.',
      );
    }
    if (plans.some((plan) => plan.rule.xpDelta !== 0)) {
      throw new ConflictException(
        'Точечный replay пока не поддерживает отдельное начисление XP. Используйте его только для шага Battle Pass без XP.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const [lockedFacts, lockedSeasons] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
          SELECT "id", "updatedAt"
          FROM "GuestActivityFact"
          WHERE "id" = ${scope.sourceFactId}
            AND "tenantId" = ${user.tenantId}
            AND "lifecycleStatus" = 'ACTIVE'
            AND "confidence" = 'EXACT'
            AND "supersededAt" IS NULL
          FOR SHARE
        `),
        tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
          SELECT "id", "updatedAt"
          FROM "GuestGameSeason"
          WHERE "id" = ${scope.ruleId}
            AND "tenantId" = ${user.tenantId}
            AND "status" = 'ACTIVE'
          FOR SHARE
        `),
      ]);
      const factVersion = lockedFacts[0]?.updatedAt;
      const seasonVersion = lockedSeasons[0]?.updatedAt;
      if (
        lockedFacts.length !== 1 ||
        lockedSeasons.length !== 1 ||
        !(factVersion instanceof Date) ||
        !(seasonVersion instanceof Date) ||
        factVersion.getTime() !== scope.sourceFactUpdatedAt.getTime() ||
        seasonVersion.getTime() !== scope.seasonUpdatedAt.getTime()
      ) {
        throw new ConflictException(
          'Факт или сезон изменились после preview; rule-scoped intent не создан.',
        );
      }
      const intentIds: string[] = [];
      for (const plan of plans) {
        const idempotencyKey = buildGuestGameRewardIdempotencyKey({
          originKey,
          ruleKind: plan.rule.kind,
          ruleId: plan.rule.id,
          slot: plan.slotKey,
        });
        if (!idempotencyKey) {
          throw new ConflictException(
            'Не удалось построить идемпотентность награды для точечного replay.',
          );
        }
        const data = {
          tenantId: user.tenantId,
          eventId,
          profileId,
          originKey,
          ruleType: plan.rule.kind,
          ruleId: plan.rule.id,
          effectKind: 'REWARD',
          slotKey: plan.slotKey,
          idempotencyKey,
          claimKey: plan.claimKey,
          status: 'PENDING',
          plan,
          qualifiedAt: new Date(plan.qualifiedAt),
        } satisfies Prisma.GuestGameRewardIntentUncheckedCreateInput;

        const intent: GuestGameRewardIntent = plan.claimKey
          ? await tx.guestGameRewardIntent.upsert({
              where: {
                tenantId_claimKey: {
                  tenantId: user.tenantId,
                  claimKey: plan.claimKey,
                },
              },
              create: data,
              update: {},
            })
          : await tx.guestGameRewardIntent.upsert({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: user.tenantId,
                  idempotencyKey,
                },
              },
              create: data,
              update: {},
            });
        const storedPlan = parseProcessRewardIntentPlan(intent.plan);
        if (
          intent.eventId !== eventId ||
          intent.profileId !== profileId ||
          intent.originKey !== originKey ||
          intent.idempotencyKey !== idempotencyKey ||
          intent.claimKey !== plan.claimKey ||
          !['PENDING', 'PROCESSING', 'FAILED', 'APPLIED'].includes(
            intent.status,
          ) ||
          !storedPlan ||
          storedPlan.rule.kind !== scope.ruleKind ||
          storedPlan.rule.id !== scope.ruleId ||
          storedPlan.rule.battlePassStep !== scope.battlePassStep ||
          storedPlan.slotKey !== plan.slotKey
        ) {
          throw new ConflictException(
            'Rule-scoped intent был конкурентно создан с другим событием, профилем или планом; replay остановлен без новой награды.',
          );
        }
        intentIds.push(intent.id);
      }

      await tx.guestGameAuditEvent.create({
        data: {
          tenantId: user.tenantId,
          profileId,
          guestId: dryRun.guest?.id ?? null,
          storeId: dryRun.store?.id ?? null,
          entityType: 'GUEST_GAME_REWARD_INTENT',
          entityId: intentIds[0] ?? null,
          action: 'RULE_REPLAY',
          status: 'INTENT_PERSISTED',
          reasonCode: 'BATTLE_PASS_STEP_REPLAY',
          reasonText:
            'Точечный replay шага Battle Pass подтверждён оператором.',
          payload: {
            actorUserId: user.id,
            sourceFactId: scope.sourceFactId,
            ruleKind: scope.ruleKind,
            ruleId: scope.ruleId,
            battlePassStep: scope.battlePassStep,
            stepId: scope.stepId,
            confirmationHash: scope.confirmationHash,
            eventId,
            intentIds,
          },
        },
      });
      return intentIds;
    });
  }

  private async materializeProcessRewardIntents(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
    currentDryRun: GuestGameDryRunResult,
    event: {
      id: string;
      eventType: string;
      occurredAt: Date | string;
      guestId?: string | null;
      externalProvider?: unknown;
      externalDomain?: string | null;
      externalId?: string | null;
      originKey?: string | null;
      payload?: Prisma.JsonValue | null;
    },
    profileId: string,
    eventReference: ProcessExternalReference | null,
    originKey: string | null,
    options: {
      limit?: number;
      claimLeaseMs?: number;
      maxAttempts?: number;
      throwOnFailure?: boolean;
      intentIds?: string[];
    } = {},
  ): Promise<ProcessRewardIntentMaterialization | null> {
    if (!this.rewardMaterializerClaimsAllowed()) {
      return null;
    }
    const limit = boundedEffectInteger(options.limit, 30, 1, 100);
    const claimLeaseMs = boundedEffectInteger(
      options.claimLeaseMs,
      120_000,
      30_000,
      10 * 60_000,
    );
    const maxAttempts = boundedEffectInteger(options.maxAttempts, 5, 1, 20);
    const stats = emptyEffectMaterializeResult();
    const now = new Date();
    const intentIds = Array.from(
      new Set((options.intentIds ?? []).map(nullableId).filter(Boolean)),
    ) as string[];
    const intentWhere = intentIds.length ? { id: { in: intentIds } } : {};
    const exhausted = await this.prisma.guestGameRewardIntent.updateMany({
      where: {
        tenantId: user.tenantId,
        eventId: event.id,
        ...intentWhere,
        effectKind: 'REWARD',
        status: 'PROCESSING',
        attempts: { gte: maxAttempts },
        OR: [{ claimExpiresAt: { lte: now } }, { claimExpiresAt: null }],
      },
      data: {
        status: 'DEAD_LETTER',
        claimExpiresAt: null,
        nextAttemptAt: null,
        lastError: 'Lease expired after the maximum number of attempts.',
      },
    });
    stats.deadLettered += exhausted.count;
    const intents = await this.prisma.guestGameRewardIntent.findMany({
      where: {
        tenantId: user.tenantId,
        eventId: event.id,
        ...intentWhere,
        effectKind: 'REWARD',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!intents.length) return null;

    const parsedPlans = intents.map((intent) =>
      parseProcessRewardIntentPlan(intent.plan),
    );
    const plans = parsedPlans.filter((plan): plan is ProcessRewardIntentPlan =>
      Boolean(plan),
    );
    if (plans.length !== intents.length) {
      this.logger.warn(
        'РЎРѕС…СЂР°РЅС‘РЅРЅС‹Р№ РїР»Р°РЅ РЅР°РіСЂР°РґС‹ РїРѕРІСЂРµР¶РґС‘РЅ Рё РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїРµСЂРµСЃС‡РёС‚Р°РЅ РїРѕРІС‚РѕСЂРЅРѕ.',
      );
    }
    const plansByIntentId = new Map(
      intents.map((intent, index) => [intent.id, parsedPlans[index]]),
    );

    const rules = plans.map<GuestGameDryRunRule>((plan) => ({
      ...plan.rule,
      progress: null,
    }));
    const storedPayload = jsonRecord(event.payload ?? null);
    const storedInput = processRewardInputSnapshot(
      storedPayload.input,
      currentDryRun.input,
    );
    const storedStore = processRewardStoreSnapshot(
      storedPayload.store,
      currentDryRun.store,
    );
    const occurredAt =
      event.occurredAt instanceof Date
        ? event.occurredAt
        : (dateValue(event.occurredAt) ?? new Date());
    const intentDryRun = dryRunWithRules(
      {
        ...currentDryRun,
        eventType: event.eventType,
        occurredAt: occurredAt.toISOString(),
        store: storedStore,
        input: storedInput,
      },
      rules,
    );
    const storedProvider = integrationProviderValue(event.externalProvider);
    const storedDomain = nullableString(event.externalDomain);
    const storedExternalId = nullableString(event.externalId);
    const storedReference =
      storedProvider && storedDomain && storedExternalId
        ? {
            externalProvider: storedProvider,
            externalDomain: storedDomain,
            externalId: storedExternalId,
          }
        : eventReference;
    const storedDto: GuestGameProcessEventDto = {
      ...dto,
      profileId,
      guestId: nullableId(event.guestId) ?? nullableId(dto.guestId),
      storeId: storedStore?.id ?? null,
      eventType: event.eventType,
      occurredAt: occurredAt.toISOString(),
      sessionType: storedInput.sessionType,
      sessionPacket: storedInput.sessionPacket,
      sessionMinutes: storedInput.sessionMinutes,
      spendAmount: storedInput.spendAmount,
      tariffGroupId: storedInput.tariffGroupId,
      tariffPeriodId: storedInput.tariffPeriodId,
      tariffTypeId: storedInput.tariffTypeId,
      guestLogType: storedInput.guestLogType,
      productId: storedInput.productId,
      externalProductId: storedInput.externalProductId,
      externalCategoryKey: storedInput.externalCategoryKey,
      externalCategoryId: storedInput.externalCategoryId,
      categoryId: storedInput.categoryId,
      productName: storedInput.productName,
      categoryName: storedInput.categoryName,
      supplierName: storedInput.supplierName,
      quantity: storedInput.quantity,
      sourceFactId:
        nullableString(storedPayload.sourceFactId) ??
        nullableString(dto.sourceFactId),
      sourceFactKind:
        nullableString(storedPayload.sourceFactKind) ??
        nullableString(dto.sourceFactKind),
      externalProvider: storedReference?.externalProvider ?? null,
      externalDomain: storedReference?.externalDomain ?? null,
      externalId: storedReference?.externalId ?? null,
    };
    const storedOriginKey = nullableString(event.originKey) ?? originKey;

    const appliedRewardIds = intents
      .filter((intent) => intent.status === 'APPLIED' && intent.rewardId)
      .map((intent) => intent.rewardId as string);
    const appliedRewardRows = appliedRewardIds.length
      ? await this.prisma.guestGameReward.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: appliedRewardIds },
          },
          include: rewardInclude,
        })
      : [];
    const rewardsById = new Map(
      appliedRewardRows.map((row) => [row.id, mapReward(row)]),
    );
    // Reward rows are durable, while entitlement and bonus-ledger delivery are
    // post-commit idempotent side effects. A retry may safely reconcile them
    // without evaluating a new rule or choosing a new prize.
    await Promise.all(
      appliedRewardRows.map((row) =>
        this.reconcileCreatedRewardSideEffects(user, row),
      ),
    );

    const claims = await this.claimRewardIntents(
      user.tenantId,
      event.id,
      limit,
      claimLeaseMs,
      maxAttempts,
      intentIds,
    );
    stats.claimed = claims.length;
    const actionable = claims
      .map((claim) => ({
        claim,
        plan:
          plansByIntentId.get(claim.id) ??
          parseProcessRewardIntentPlan(claim.plan),
      }))
      .filter(
        (
          item,
        ): item is {
          claim: ClaimedRewardIntentRow;
          plan: ProcessRewardIntentPlan;
        } => Boolean(item.plan),
      );

    for (const claim of claims) {
      if (actionable.some((item) => item.claim.id === claim.id)) continue;
      const dead = await this.prisma.guestGameRewardIntent.updateMany({
        where: {
          id: claim.id,
          tenantId: user.tenantId,
          eventId: event.id,
          status: 'PROCESSING',
          leaseVersion: claim.leaseVersion,
        },
        data: {
          status: 'DEAD_LETTER',
          claimExpiresAt: null,
          nextAttemptAt: null,
          lastError: 'The immutable reward intent plan is invalid.',
        },
      });
      if (dead.count > 0) stats.deadLettered += 1;
      else stats.staleFinalizations += 1;
    }

    if (!actionable.length) {
      return {
        dryRun: intentDryRun,
        rewards: intents
          .map((intent) =>
            intent.rewardId ? rewardsById.get(intent.rewardId) : null,
          )
          .filter((reward): reward is GuestGameReward => Boolean(reward)),
        stats,
      };
    }

    const actionableDryRun = dryRunWithRules(
      intentDryRun,
      actionable.map(({ plan }) => ({ ...plan.rule, progress: null })),
    );

    try {
      const createdRewards = await this.createProcessRewards(
        user,
        storedDto,
        actionableDryRun,
        profileId,
        storedReference,
        storedOriginKey,
        new Map(
          actionable.map(({ claim, plan }) => [
            processRewardIntentPlanKey(plan),
            claim.idempotencyKey,
          ]),
        ),
      );
      if (createdRewards.length !== actionable.length) {
        throw new ConflictException(
          'Не удалось однозначно сопоставить сохранённые планы с наградами.',
        );
      }

      for (const [index, { claim }] of actionable.entries()) {
        const reward = createdRewards[index];
        if (!reward) continue;
        const finalized = await this.prisma.guestGameRewardIntent.updateMany({
          where: {
            id: claim.id,
            tenantId: user.tenantId,
            eventId: event.id,
            status: 'PROCESSING',
            leaseVersion: claim.leaseVersion,
          },
          data: {
            status: 'APPLIED',
            rewardId: reward.id,
            processedAt: new Date(),
            nextAttemptAt: null,
            claimExpiresAt: null,
            lastError: null,
          },
        });
        if (finalized.count === 0) {
          stats.staleFinalizations += 1;
          continue;
        }
        stats.applied += 1;
        if (claim.attempts > 1) stats.recovered += 1;
        stats.rewardIds.push(reward.id);
        rewardsById.set(reward.id, reward);
        const intent = intents.find((item) => item.id === claim.id);
        if (intent) intent.rewardId = reward.id;
      }

      return {
        dryRun: intentDryRun,
        rewards: intents
          .map((intent) =>
            intent.rewardId ? rewardsById.get(intent.rewardId) : null,
          )
          .filter((reward): reward is GuestGameReward => Boolean(reward)),
        stats: {
          ...stats,
          rewardIds: [...new Set(stats.rewardIds)],
        },
      };
    } catch (error) {
      for (const { claim } of actionable) {
        const deadLetter = claim.attempts >= maxAttempts;
        const failed = await this.prisma.guestGameRewardIntent.updateMany({
          where: {
            id: claim.id,
            tenantId: user.tenantId,
            eventId: event.id,
            status: 'PROCESSING',
            leaseVersion: claim.leaseVersion,
          },
          data: {
            status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
            nextAttemptAt: deadLetter
              ? null
              : new Date(Date.now() + rewardEffectRetryDelayMs(claim.attempts)),
            claimExpiresAt: null,
            lastError: this.checkInErrorMessage(error).slice(0, 500),
          },
        });
        if (failed.count === 0) stats.staleFinalizations += 1;
        else if (deadLetter) stats.deadLettered += 1;
        else stats.failed += 1;
      }
      if (options.throwOnFailure !== false) throw error;
      return {
        dryRun: intentDryRun,
        rewards: intents
          .map((intent) =>
            intent.rewardId ? rewardsById.get(intent.rewardId) : null,
          )
          .filter((reward): reward is GuestGameReward => Boolean(reward)),
        stats,
      };
    }
  }

  private async claimRewardIntents(
    tenantId: string,
    eventId: string,
    limit: number,
    claimLeaseMs: number,
    maxAttempts: number,
    intentIds: string[] = [],
  ): Promise<ClaimedRewardIntentRow[]> {
    const intentFilter = intentIds.length
      ? Prisma.sql`AND intent."id" IN (${Prisma.join(intentIds)})`
      : Prisma.empty;
    const claimed = await this.prisma.$queryRaw<ClaimedRewardIntentRow[]>(
      Prisma.sql`
        WITH candidates AS (
          SELECT intent."id"
          FROM "GuestGameRewardIntent" AS intent
          WHERE intent."tenantId" = ${tenantId}
            AND intent."eventId" = ${eventId}
            ${intentFilter}
            AND intent."effectKind" = 'REWARD'
            AND intent."attempts" < ${maxAttempts}
            AND (
              (
                intent."status" IN ('PENDING', 'FAILED')
                AND (intent."nextAttemptAt" IS NULL OR intent."nextAttemptAt" <= NOW())
              )
              OR (
                intent."status" = 'PROCESSING'
                AND (intent."claimExpiresAt" IS NULL OR intent."claimExpiresAt" <= NOW())
              )
            )
          ORDER BY COALESCE(intent."nextAttemptAt", intent."createdAt"), intent."createdAt", intent."id"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "GuestGameRewardIntent" AS intent
        SET
          "status" = 'PROCESSING',
          "attempts" = intent."attempts" + 1,
          "leaseVersion" = intent."leaseVersion" + 1,
          "claimExpiresAt" = NOW() + (${claimLeaseMs} * INTERVAL '1 millisecond'),
          "nextAttemptAt" = NULL,
          "lastError" = NULL,
          "updatedAt" = NOW()
        FROM candidates
        WHERE intent."id" = candidates."id"
        RETURNING intent."id", intent."eventId", intent."profileId", intent."rewardId",
          intent."idempotencyKey", intent."plan", intent."attempts", intent."leaseVersion"
      `,
    );
    if (Array.isArray(claimed)) return claimed;

    // Unit-test delegates do not execute PostgreSQL raw SQL. The CAS fallback
    // mirrors the lease transition; production always uses SKIP LOCKED above.
    const now = new Date();
    const candidates = await this.prisma.guestGameRewardIntent.findMany({
      where: {
        tenantId,
        eventId,
        ...(intentIds.length ? { id: { in: intentIds } } : {}),
        effectKind: 'REWARD',
        attempts: { lt: maxAttempts },
        OR: [
          {
            status: { in: ['PENDING', 'FAILED'] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: 'PROCESSING',
            OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const fallback: ClaimedRewardIntentRow[] = [];
    for (const candidate of candidates) {
      const status = candidate.status ?? 'PENDING';
      const attempts = Number(candidate.attempts ?? 0);
      const leaseVersion = Number(candidate.leaseVersion ?? 0);
      const due =
        ((status === 'PENDING' || status === 'FAILED') &&
          (!candidate.nextAttemptAt || candidate.nextAttemptAt <= now)) ||
        (status === 'PROCESSING' &&
          (!candidate.claimExpiresAt || candidate.claimExpiresAt <= now));
      if (!due || attempts >= maxAttempts) continue;

      const updated = await this.prisma.guestGameRewardIntent.updateMany({
        where: {
          id: candidate.id,
          tenantId,
          eventId,
          status,
          leaseVersion,
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          leaseVersion: { increment: 1 },
          claimExpiresAt: new Date(Date.now() + claimLeaseMs),
          nextAttemptAt: null,
          lastError: null,
        },
      });
      if (updated.count !== 1) continue;
      fallback.push({
        id: candidate.id,
        eventId: candidate.eventId,
        profileId: candidate.profileId,
        rewardId: candidate.rewardId,
        idempotencyKey: candidate.idempotencyKey,
        plan: candidate.plan,
        attempts: attempts + 1,
        leaseVersion: leaseVersion + 1,
      });
    }
    return fallback;
  }

  private async createProcessRewards(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
    dryRun: GuestGameDryRunResult,
    profileId: string,
    eventReference: ProcessExternalReference | null,
    originKey: string | null,
    rewardIdempotencyKeys: ReadonlyMap<string, string> = new Map(),
  ): Promise<GuestGameReward[]> {
    const guestId = dryRun.guest?.id ?? nullableId(dto.guestId) ?? null;
    const guestExternalId = dryRun.guest?.externalGuestId ?? null;
    const eligibleRules = dryRun.rules.filter(shouldQueueProcessReward);
    const rewards: GuestGameReward[] = [];
    const profileStaffTest = eligibleRules.length
      ? await this.prisma.guestGameProfile.findFirst({
          where: {
            id: profileId,
            tenantId: user.tenantId,
          },
          select: {
            isStaffTest: true,
            staffTestReason: true,
          },
        })
      : null;
    const staffTestReason = profileStaffTest?.isStaffTest
      ? (profileStaffTest.staffTestReason ?? 'STAFF_PHONE_MATCH')
      : null;
    const staffTestRewardAccrualEnabled =
      Boolean(staffTestReason) &&
      booleanValue(
        this.configService.get<string>(staffTestRewardAccrualEnabledEnv),
        true,
      );
    const staffTestBlocked = Boolean(
      staffTestReason && !staffTestRewardAccrualEnabled,
    );

    for (const rule of eligibleRules) {
      const link = rewardRuleLink(rule);
      const externalRewardSlot =
        rule.kind === 'SEASON'
          ? `:${rule.battlePassStep ?? 'step'}:${rule.rewardType ?? 'reward'}`
          : '';
      const externalId = eventReference
        ? `${eventReference.externalId}:reward:${rule.kind}:${rule.id}${externalRewardSlot}`
        : null;
      const idempotencyKey =
        rewardIdempotencyKeys.get(processRewardRuleKey(rule)) ??
        buildGuestGameRewardIdempotencyKey({
          originKey,
          ruleKind: rule.kind,
          ruleId: rule.id,
          slot:
            rule.kind === 'SEASON'
              ? `${rule.battlePassStep ?? 'step'}:${rule.rewardType ?? 'reward'}`
              : (rule.rewardType ?? 'reward'),
        });
      const qualifiedAt = processRewardQualifiedAt(dto, dryRun, rule);

      try {
        const reward = await this.createReward(
          user,
          {
            profileId,
            guestId,
            storeId: nullableId(dto.storeId),
            status: staffTestBlocked
              ? 'CANCELED'
              : rule.manualApprovalRequired
                ? 'PENDING'
                : 'APPROVED',
            source: 'API_IMPORT',
            externalProvider: eventReference?.externalProvider ?? null,
            externalDomain: eventReference?.externalDomain ?? null,
            externalId,
            guestExternalId,
            rewardType:
              rule.rewardType ??
              (rule.kind === 'SEASON' ? 'BATTLE_PASS_REWARD' : 'PROMOCODE'),
            rewardAmount: rule.rewardAmount ?? 0,
            rewardLabel:
              rule.selectedRewardLabel ??
              rule.rewardLabel ??
              `${processRuleKindLabel(rule.kind)}: ${rule.name}`,
            rewardRarity:
              rule.kind === 'LOOT_BOX'
                ? rule.selectedReward?.rewardRarity
                : null,
            rewardRarityLabel:
              rule.kind === 'LOOT_BOX'
                ? rule.selectedReward?.rewardRarityLabel
                : null,
            rewardDropChance:
              rule.kind === 'LOOT_BOX'
                ? rule.selectedReward?.chancePercent
                : null,
            qualifiedAt,
            note: staffTestBlocked
              ? 'Создано как тест сотрудника; автоматическое начисление в Langame заблокировано.'
              : staffTestReason
                ? 'Создано как тест сотрудника; автоматическое начисление в Langame разрешено для всех профилей.'
                : 'Создано подтвержденным запуском события геймификации.',
            evidence: {
              source: 'guest_gamification_process_event',
              langameWrite: false,
              sourceFactId: nullableString(dto.sourceFactId),
              sourceFactKind: nullableString(dto.sourceFactKind),
              eventType: dryRun.eventType,
              occurredAt: dryRun.occurredAt,
              limitOccurredAt: nullableString(dto.limitOccurredAt),
              qualifiedAt,
              input: dryRun.input,
              rule,
              ...(staffTestReason
                ? {
                    staffTestBlocked,
                    staffTestReason,
                    ...(staffTestRewardAccrualEnabled
                      ? {
                          staffTestAccrualOverride: true,
                          staffTestRewardAccrualEnabled: true,
                          staffTestRewardAccrualEnv:
                            staffTestRewardAccrualEnabledEnv,
                        }
                      : {}),
                  }
                : {}),
            },
            ...link,
          },
          { originKey, idempotencyKey },
        );
        rewards.push(reward);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          if (idempotencyKey) {
            const existingReward = await this.findProcessRewardByIdempotencyKey(
              user,
              idempotencyKey,
            );
            if (existingReward) {
              await this.reconcileCreatedRewardSideEffectsById(
                user,
                existingReward.id,
              );
              rewards.push(existingReward);
              continue;
            }
          }
          if (eventReference && externalId) {
            const existingReward = await this.findProcessRewardByExternalId(
              user,
              eventReference,
              externalId,
            );

            if (existingReward) {
              await this.reconcileCreatedRewardSideEffectsById(
                user,
                existingReward.id,
              );
              rewards.push(existingReward);
              continue;
            }
          }

          throw new ConflictException(
            'Одна из наград по этому snapshot уже создана. Обновите очередь наград.',
          );
        }

        throw error;
      }
    }

    return rewards;
  }

  private async ensureProcessProfile(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
  ): Promise<{ profile: GuestGameProfile; profileCreated: boolean }> {
    if (dto.profileId) {
      const profile = await this.resolveDryRunProfile(user, dto);

      if (!profile) {
        throw new NotFoundException('Игровой профиль не найден');
      }

      return { profile, profileCreated: false };
    }

    if (!dto.guestId) {
      throw new BadRequestException(
        'Для подтвержденного запуска выберите игровой профиль или гостя Langame.',
      );
    }

    const guest = await this.getTenantGuest(user, dto.guestId);
    const existing = await this.resolveDryRunProfile(user, {
      guestId: guest.id,
    });

    if (existing) {
      return { profile: existing, profileCreated: false };
    }

    try {
      const data = (await this.buildProfileData(
        user,
        { guestId: guest.id },
        true,
      )) as Prisma.GuestGameProfileUncheckedCreateInput;
      const row = await this.prisma.guestGameProfile.create({
        data,
        include: gameProfileInclude,
      });

      await this.createSystemEvent(user, {
        profileId: row.id,
        guestId: row.guestId,
        eventType: 'PROFILE_CREATED',
        xpDelta: 0,
        note: 'Игровой профиль создан подтвержденным запуском события.',
      });

      return { profile: mapProfile(row), profileCreated: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const profile = await this.resolveDryRunProfile(user, {
        guestId: guest.id,
      });

      if (!profile) {
        throw error;
      }

      return { profile, profileCreated: false };
    }
  }

  private async resolveDryRunProfile(
    user: AuthenticatedUser,
    dto: GuestGameDryRunDto,
  ): Promise<GuestGameProfile | null> {
    if (!dto.profileId && !dto.guestId) {
      return null;
    }

    const row = await this.prisma.guestGameProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        ...(dto.profileId
          ? { id: dto.profileId }
          : {
              OR: [
                { guestId: dto.guestId ?? undefined },
                {
                  identityLinks: {
                    some: {
                      tenantId: user.tenantId,
                      guestId: dto.guestId ?? undefined,
                      status: 'ACTIVE',
                    },
                  },
                },
              ],
            }),
      },
      include: gameProfileInclude,
    });

    if (!row && dto.profileId) {
      throw new NotFoundException('Игровой профиль не найден');
    }

    return row ? mapProfile(row) : null;
  }

  private async getDryRunRewards(
    user: AuthenticatedUser,
    scope: {
      seasonId?: string | null;
      profileId?: string | null;
      guestId?: string | null;
      missionIds?: string[];
    } = {},
  ): Promise<GuestGameReward[]> {
    const owners: Prisma.GuestGameRewardWhereInput[] = [
      ...(scope.profileId ? [{ profileId: scope.profileId }] : []),
      ...(scope.guestId ? [{ guestId: scope.guestId }] : []),
    ];
    const missionIds = uniqueStrings(scope.missionIds ?? []);
    const [rows, missionRows] = await Promise.all([
      this.prisma.guestGameReward.findMany({
        where: {
          tenantId: user.tenantId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          ...(scope.seasonId ? { seasonId: scope.seasonId } : {}),
          ...(scope.seasonId && owners.length ? { OR: owners } : {}),
        },
        include: rewardInclude,
        orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1000,
      }),
      missionIds.length
        ? this.prisma.guestGameReward.findMany({
            where: {
              tenantId: user.tenantId,
              missionId: { in: missionIds },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            include: rewardInclude,
            orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
    ]);
    const uniqueRows = new Map(
      [...rows, ...missionRows].map((row) => [row.id, row] as const),
    );

    return [...uniqueRows.values()].map(mapReward);
  }

  private async getDryRunMissionRewardEntitlements(
    user: AuthenticatedUser,
    scope: {
      profileId?: string | null;
      guestId?: string | null;
      missionIds?: string[];
    },
  ): Promise<DryRunMissionRewardEntitlement[]> {
    const missionIds = uniqueStrings(scope.missionIds ?? []);
    if (!missionIds.length) return [];

    return this.prisma.guestGameEntitlement.findMany({
      where: {
        tenantId: user.tenantId,
        ruleType: 'LOOT_BOX',
        status: { in: ['AVAILABLE', 'CONSUMED'] },
        OR: missionIds.map((missionId) => ({
          evidence: { path: ['missionId'], equals: missionId },
        })),
      },
      select: {
        id: true,
        ruleId: true,
        status: true,
        rewardId: true,
        profileId: true,
        guestId: true,
        qualifiedAt: true,
        evidence: true,
      },
      orderBy: { qualifiedAt: 'desc' },
    });
  }

  private async getDryRunLootBoxLimitEntitlements(
    user: AuthenticatedUser,
    ruleIds: string[],
    occurredAt: Date,
  ): Promise<DryRunMissionRewardEntitlement[]> {
    if (!ruleIds.length) return [];

    const earliestRelevantAt = new Date(
      occurredAt.getTime() - 40 * 24 * 60 * 60 * 1000,
    );

    return this.prisma.guestGameEntitlement.findMany({
      where: {
        tenantId: user.tenantId,
        ruleType: 'LOOT_BOX',
        ruleId: { in: ruleIds },
        status: { in: ['AVAILABLE', 'CONSUMED'] },
        qualifiedAt: {
          gte: earliestRelevantAt,
          lte: occurredAt,
        },
      },
      select: {
        id: true,
        ruleId: true,
        status: true,
        rewardId: true,
        profileId: true,
        guestId: true,
        qualifiedAt: true,
        evidence: true,
      },
      orderBy: { qualifiedAt: 'desc' },
    });
  }

  private async getDryRunProgressEvents(
    user: AuthenticatedUser,
    scope: { profileId?: string | null; guestIds?: string[] },
  ): Promise<GuestGameProgressEvent[]> {
    const guestIds = uniqueStrings(scope.guestIds ?? []);
    const conditions: Prisma.GuestGameEventWhereInput[] = [
      ...(scope.profileId ? [{ profileId: scope.profileId }] : []),
      ...(guestIds.length ? [{ guestId: { in: guestIds } }] : []),
    ];

    if (!conditions.length) {
      return [];
    }

    const rows = await this.prisma.guestGameEvent.findMany({
      where: {
        tenantId: user.tenantId,
        OR: conditions,
      },
      select: {
        eventType: true,
        occurredAt: true,
        externalDomain: true,
        payload: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });

    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map(storedEventToProgressEvent);
  }

  private async getDryRunAudienceMemberIds(
    user: AuthenticatedUser,
    guest: GuestGameProfile['guest'],
    identityGuestIds: string[] = [],
  ): Promise<Set<string>> {
    const guestIds = uniqueStrings([
      ...identityGuestIds,
      ...(guest?.id ? [guest.id] : []),
    ]);
    const linkedGuests = guestIds.length
      ? ((await this.prisma.guest.findMany({
          where: { tenantId: user.tenantId, id: { in: guestIds } },
          select: {
            id: true,
            externalDomain: true,
            externalGuestId: true,
          },
        })) ?? [])
      : [];
    const externalOwners = new Map<
      string,
      { externalDomain: string; externalGuestId: string }
    >();
    if (guest?.externalGuestId) {
      externalOwners.set(
        `${guest.externalDomain ?? ''}:${guest.externalGuestId}`,
        {
          externalDomain: guest.externalDomain ?? '',
          externalGuestId: guest.externalGuestId,
        },
      );
    }
    for (const linkedGuest of linkedGuests) {
      externalOwners.set(
        `${linkedGuest.externalDomain ?? ''}:${linkedGuest.externalGuestId}`,
        {
          externalDomain: linkedGuest.externalDomain ?? '',
          externalGuestId: linkedGuest.externalGuestId,
        },
      );
    }
    const ownerFilters: Prisma.GuestAudienceMemberWhereInput[] = [
      ...(guestIds.length === 1
        ? [{ guestId: guestIds[0] }]
        : guestIds.length > 1
          ? [{ guestId: { in: guestIds } }]
          : []),
      ...externalOwners.values(),
    ];

    if (!ownerFilters.length) {
      return new Set();
    }

    const rows = await this.prisma.guestAudienceMember.findMany({
      where: {
        tenantId: user.tenantId,
        OR: ownerFilters,
      },
      select: { audienceId: true },
    });

    return new Set(rows.map((row) => row.audienceId));
  }

  private async resolveScheduledTenantActor(dto: {
    tenantId?: string | null;
    tenantSlug?: string | null;
  }): Promise<{ user: AuthenticatedUser; tenantSlug: string }> {
    const tenantId = nullableString(dto.tenantId);
    const tenantSlug = nullableString(dto.tenantSlug);

    if (!tenantId && !tenantSlug) {
      throw new BadRequestException('tenantId or tenantSlug is required');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: clean({
        id: tenantId ?? undefined,
        slug: tenantSlug ?? undefined,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: {
            isActive: true,
            role: { in: [...scheduledPipelineActorRoles] },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant was not found for bot consumer.');
    }

    if (tenant.status !== TenantLifecycleStatus.ACTIVE) {
      throw new BadRequestException(
        'Tenant is not active; bot consumer is disabled.',
      );
    }

    const actor = this.pickScheduledPipelineActor(tenant.users);

    if (!actor) {
      throw new BadRequestException(
        'No active owner, system administrator or network manager user found for audit-safe bot consumer.',
      );
    }

    return {
      user: {
        id: actor.id,
        email: actor.email,
        fullName: actor.fullName,
        role: actor.role,
        customRoleId: actor.customRoleId,
        isPlatformAdmin: actor.isPlatformAdmin,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantStatus: tenant.status,
      },
      tenantSlug: tenant.slug,
    };
  }

  private pickScheduledPipelineActor(
    users: Array<{
      id: string;
      email: string;
      fullName: string | null;
      role: UserRole;
      customRoleId: string | null;
      isPlatformAdmin: boolean;
    }>,
  ) {
    return [...users].sort(
      (left, right) =>
        scheduledPipelineRoleRank(left.role) -
        scheduledPipelineRoleRank(right.role),
    )[0];
  }

  private buildScheduledPipelineSummary(
    dryRunOnly: boolean,
    tenants: GuestGameScheduledPipelineTenantResult[],
  ): GuestGameScheduledPipelineRunResult {
    const processed = tenants.filter((tenant) => tenant.status === 'PROCESSED');
    const results = processed
      .map((tenant) => tenant.result)
      .filter((result): result is GuestGamePipelineRunResult =>
        Boolean(result),
      );

    return {
      dryRunOnly,
      langameWrite: false,
      checkedTenants: tenants.length,
      processedTenants: processed.length,
      skippedTenants: tenants.filter((tenant) => tenant.status === 'SKIPPED')
        .length,
      erroredTenants: tenants.filter((tenant) => tenant.status === 'ERROR')
        .length,
      availableFacts: sum(results.map((result) => result.availableFacts)),
      checkedFacts: sum(results.map((result) => result.checkedFacts)),
      processedFacts: sum(results.map((result) => result.processedFacts)),
      skippedFacts: sum(results.map((result) => result.skippedFacts)),
      duplicateFacts: sum(results.map((result) => result.duplicateFacts)),
      erroredFacts: sum(results.map((result) => result.erroredFacts)),
      appliedXpDelta: sum(results.map((result) => result.appliedXpDelta)),
      queuedRewards: sum(results.map((result) => result.queuedRewards)),
      queuedRewardAmount: sum(
        results.map((result) => result.queuedRewardAmount),
      ),
      tenants,
      note: dryRunOnly
        ? 'Scheduled Guest Game pipeline preview finished without creating events, rewards or Langame writes.'
        : 'Scheduled Guest Game pipeline processed prepared snapshot facts inside LeetPlus only. Langame writes are not performed.',
    };
  }

  private buildScheduledDeliveryDispatchSummary(
    dryRun: boolean,
    tenants: GuestGameScheduledDeliveryTenantResult[],
  ): GuestGameScheduledDeliveryDispatchResult {
    const processed = tenants.filter((tenant) => tenant.status === 'PROCESSED');
    const results = processed
      .map((tenant) => tenant.result)
      .filter((result): result is GuestGameDeliveryDispatchResult =>
        Boolean(result),
      );
    const config = deliveryProviderConfig();

    return {
      dryRun,
      realSendEnabled: config.realSendEnabled,
      checkedTenants: tenants.length,
      processedTenants: processed.length,
      skippedTenants: tenants.filter((tenant) => tenant.status === 'SKIPPED')
        .length,
      erroredTenants: tenants.filter((tenant) => tenant.status === 'ERROR')
        .length,
      checked: sum(results.map((result) => result.checked)),
      sent: sum(results.map((result) => result.sent)),
      failed: sum(results.map((result) => result.failed)),
      skipped: sum(results.map((result) => result.skipped)),
      blocked: sum(results.map((result) => result.blocked)),
      tenants,
      note: dryRun
        ? 'Scheduled delivery dispatcher ran in safe dry-run mode: audit events were recorded, external Telegram/MAX sends were not performed.'
        : 'Scheduled delivery dispatcher processed ready Telegram/MAX deliveries through configured providers. Langame writes were not performed.',
    };
  }

  private buildSummary(
    profiles: GuestGameProfile[],
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    seasons: GuestGameSeason[],
    rewards: GuestGameReward[],
  ): GuestGamificationSummary {
    const plannedBudget =
      sum(lootBoxes.map((item) => item.budgetAmount ?? 0)) +
      sum(missions.map((item) => item.budgetAmount ?? 0)) +
      sum(seasons.map((item) => item.budgetAmount ?? 0));
    const pendingRewards = rewards.filter(
      (reward) => reward.status === 'PENDING',
    );
    const approvedRewards = rewards.filter(
      (reward) => reward.status === 'APPROVED',
    );
    const paidRewards = rewards.filter((reward) => reward.status === 'PAID');

    return {
      profilesCount: profiles.length,
      registeredProfilesCount: profiles.filter(isRegisteredGameProfile).length,
      totalXp: sum(profiles.map((profile) => profile.xp)),
      averageLevel: profiles.length
        ? Math.round(
            (sum(profiles.map((profile) => profile.level)) / profiles.length) *
              10,
          ) / 10
        : 0,
      activeLootBoxes: lootBoxes.filter((item) => item.status === 'ACTIVE')
        .length,
      activeMissions: missions.filter((item) => item.status === 'ACTIVE')
        .length,
      activeSeasons: seasons.filter((item) => item.status === 'ACTIVE').length,
      pendingRewards: pendingRewards.length,
      approvedRewards: approvedRewards.length,
      paidRewards: paidRewards.length,
      expiredRewards: rewards.filter((reward) => reward.status === 'EXPIRED')
        .length,
      plannedBudget,
      pendingRewardAmount: sum(
        pendingRewards.map((reward) => reward.rewardAmount),
      ),
      paidRewardAmount: sum(paidRewards.map((reward) => reward.rewardAmount)),
    };
  }

  private buildCommunicationQueue(
    profiles: GuestGameProfile[],
    rewards: GuestGameReward[],
    limit: number | null = 24,
  ): GuestGameCommunicationQueue {
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const queueRewards = rewards.filter((reward) =>
      ['PENDING', 'APPROVED', 'PAID', 'CANCELED', 'EXPIRED'].includes(
        reward.status,
      ),
    );
    const items = queueRewards
      .map((reward) => {
        const profile = reward.profile?.id
          ? (profileById.get(reward.profile.id) ?? null)
          : null;
        return buildCommunicationQueueItem(reward, profile);
      })
      .sort((left, right) => {
        const statusRank =
          communicationQueueStatusRank(left.queueStatus) -
          communicationQueueStatusRank(right.queueStatus);
        if (statusRank !== 0) {
          return statusRank;
        }

        return (
          new Date(right.qualifiedAt).getTime() -
          new Date(left.qualifiedAt).getTime()
        );
      })
      .slice(0, limit ?? undefined);

    const approvedRewards = queueRewards.filter(
      (reward) => reward.walletState === 'READY',
    );
    const approvedWithProfiles = approvedRewards.map((reward) => ({
      reward,
      profile: reward.profile?.id
        ? (profileById.get(reward.profile.id) ?? null)
        : null,
    }));

    return {
      summary: {
        total: queueRewards.length,
        readyForBot: approvedWithProfiles.filter(
          ({ profile }) => profile?.communication.botReady,
        ).length,
        readyForCashier: approvedRewards.filter(
          (reward) => reward.rewardCode !== null,
        ).length,
        needsApproval: queueRewards.filter(
          (reward) => reward.walletState === 'WAITING_APPROVAL',
        ).length,
        needsConsent: approvedWithProfiles.filter(
          ({ profile }) =>
            profile?.communication.phoneConsentStatus !== 'GRANTED' &&
            profile?.communication.phoneConsentStatus !== 'UNSUBSCRIBED',
        ).length,
        needsChannel: approvedWithProfiles.filter(
          ({ profile }) =>
            profile?.communication.phoneConsentStatus === 'GRANTED' &&
            !profile.communication.telegramReady &&
            !profile.communication.maxReady,
        ).length,
        blockedByUnsubscribe: approvedWithProfiles.filter(
          ({ profile }) =>
            profile?.communication.phoneConsentStatus === 'UNSUBSCRIBED',
        ).length,
        expired: queueRewards.filter(
          (reward) => reward.walletState === 'EXPIRED',
        ).length,
        redeemed: queueRewards.filter(
          (reward) => reward.walletState === 'REDEEMED',
        ).length,
        canceled: queueRewards.filter(
          (reward) => reward.walletState === 'CANCELED',
        ).length,
      },
      items,
      note: 'Это внутренняя готовность LeetPlus: Telegram/MAX, SMS и Langame write API здесь не вызываются. После подключения бота этот слой можно использовать как безопасную очередь отправки и выдачи.',
    };
  }

  private buildDeliveryOutbox(
    deliveries: GuestGameDelivery[],
    tenantSlug?: string,
  ): GuestGameDeliveryOutbox {
    return {
      summary: {
        total: deliveries.length,
        ready: deliveries.filter((item) => item.status === 'READY').length,
        blocked: deliveries.filter((item) => item.status === 'BLOCKED').length,
        sent: deliveries.filter((item) => item.status === 'SENT').length,
        failed: deliveries.filter((item) => item.status === 'FAILED').length,
        canceled: deliveries.filter((item) => item.status === 'CANCELED')
          .length,
        telegram: deliveries.filter((item) => item.channel === 'TELEGRAM')
          .length,
        max: deliveries.filter((item) => item.channel === 'MAX').length,
        cashier: deliveries.filter((item) => item.channel === 'CASHIER').length,
        manual: deliveries.filter((item) => item.channel === 'MANUAL').length,
      },
      dispatcher: this.buildDeliveryDispatcherStatus(deliveries),
      botConsumer: this.buildBotConsumerStatus(deliveries, tenantSlug),
      items: deliveries.slice(0, 12),
      note: 'Outbox хранит подготовленные снимки выдачи наград. Внешний Telegram/MAX-бот пока не отправляет эти сообщения.',
    };
  }

  private buildBotConsumerStatus(
    deliveries: GuestGameDelivery[],
    tenantSlug?: string,
  ): GuestGameBotConsumerStatus {
    const config = botConsumerConfig(tenantSlug);
    const readyForBot = deliveries.filter(
      (item) =>
        item.status === 'READY' &&
        item.readinessStatus === 'READY_FOR_BOT' &&
        (item.channel === 'TELEGRAM' || item.channel === 'MAX'),
    );
    const previewLimit = Math.min(3, config.limit);
    const preview = readyForBot
      .slice()
      .sort(compareBotConsumerDeliveryCandidate)
      .slice(0, previewLimit)
      .map((item) => this.toBotConsumerPreviewItem(item));
    const ackEvents = deliveries
      .flatMap((delivery) => delivery.events)
      .filter((event) => event.eventType.startsWith('DELIVERY_BOT_CONSUMER_'));
    const lastAckAt =
      ackEvents
        .map((event) => event.createdAt)
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
    const canaryRequired =
      config.configured && !config.dryRun && !config.canaryLimit && !lastAckAt;
    const requiredEnv = canaryRequired
      ? [...config.requiredEnv, 'GUEST_GAME_BOT_CONSUMER_LIMIT=1']
      : config.requiredEnv;
    const configured = config.configured && !canaryRequired;
    const mode: GuestGameBotConsumerStatus['mode'] = !configured
      ? 'BLOCKED'
      : config.dryRun
        ? 'DRY_RUN'
        : 'READY';

    return {
      mode,
      modeLabel: canaryRequired
        ? 'нужен canary LIMIT=1'
        : mode === 'READY'
          ? 'готов к real-send'
          : mode === 'DRY_RUN'
            ? 'dry-run'
            : 'нужна настройка',
      dryRun: config.dryRun,
      configured,
      limit: config.limit,
      canaryLimit: config.canaryLimit,
      canaryRequired,
      channels: config.channels,
      requiredEnv,
      runbook: botConsumerRunbook,
      pendingReady: readyForBot.length,
      pendingTelegram: readyForBot.filter((item) => item.channel === 'TELEGRAM')
        .length,
      pendingMax: readyForBot.filter((item) => item.channel === 'MAX').length,
      sentAck: ackEvents.filter(
        (event) => event.eventType === 'DELIVERY_BOT_CONSUMER_SENT',
      ).length,
      failedAck: ackEvents.filter(
        (event) => event.eventType === 'DELIVERY_BOT_CONSUMER_FAILED',
      ).length,
      blockedAck: ackEvents.filter(
        (event) => event.eventType === 'DELIVERY_BOT_CONSUMER_BLOCKED',
      ).length,
      lastAckAt,
      preview,
      nextAction: botConsumerNextAction(
        config,
        readyForBot.length,
        lastAckAt,
        canaryRequired,
      ),
      note: 'Статус собран из API-visible env, текущего outbox и сохраненных ack-событий. Если runner запущен отдельным systemd unit со своим EnvironmentFile, фактический запуск подтверждается по новым ack-событиям.',
    };
  }

  private toBotConsumerPreviewItem(
    item: GuestGameDelivery,
  ): GuestGameBotConsumerPreviewItem {
    return {
      deliveryId: item.id,
      rewardId: item.rewardId,
      channel: item.channel === 'MAX' ? 'MAX' : 'TELEGRAM',
      channelLabel:
        item.channelLabel ??
        communicationQueueChannelLabel(
          item.channel === 'MAX' ? 'MAX' : 'TELEGRAM',
        ),
      recipientMasked: item.recipientMasked,
      channelIdentityMasked: item.channelIdentityMasked,
      rewardLabel: item.reward.rewardLabel,
      rewardType: item.reward.rewardType,
      rewardAmount: Number(item.reward.rewardAmount),
      storeName: item.store?.name ?? item.reward.store?.name ?? null,
      profileLabel:
        item.profile?.displayName ??
        item.guest?.displayName ??
        item.recipientMasked,
      preparedAt:
        dateTimeString(item.preparedAt) ?? dateTimeString(item.createdAt) ?? '',
      expiresAt: dateTimeString(item.reward.expiresAt),
    };
  }

  private buildDeliveryDispatcherStatus(
    deliveries: GuestGameDelivery[],
  ): GuestGameDeliveryDispatcherStatus {
    const config = deliveryProviderConfig();
    const providers = [
      deliveryProviderStatus(
        config,
        'TELEGRAM',
        deliveries.filter(
          (item) =>
            item.status === 'READY' &&
            item.readinessStatus === 'READY_FOR_BOT' &&
            item.channel === 'TELEGRAM',
        ).length,
      ),
      deliveryProviderStatus(
        config,
        'MAX',
        deliveries.filter(
          (item) =>
            item.status === 'READY' &&
            item.readinessStatus === 'READY_FOR_BOT' &&
            item.channel === 'MAX',
        ).length,
      ),
    ];
    const hasReadyProvider = providers.some(
      (provider) => provider.canAttemptSend,
    );
    const mode: GuestGameDeliveryDispatcherStatus['mode'] =
      !config.realSendEnabled
        ? 'DRY_RUN'
        : hasReadyProvider
          ? 'READY'
          : 'DISABLED';

    return {
      mode,
      modeLabel:
        mode === 'READY'
          ? 'готов к отправке'
          : mode === 'DRY_RUN'
            ? 'dry-run'
            : 'отключен',
      realSendEnabled: config.realSendEnabled,
      providers,
      note:
        mode === 'READY'
          ? 'Dispatcher может отправлять только готовые Telegram/MAX delivery с подтвержденным numeric chat_id или настроенным provider.'
          : mode === 'DRY_RUN'
            ? 'Безопасный режим: dispatcher проверяет outbox и пишет audit-события, но не отправляет внешние сообщения.'
            : 'Внешние providers не готовы: включите env-флаги и настройте токены после юридической и технической подготовки.',
    };
  }

  private buildEconomy(
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    seasons: GuestGameSeason[],
    rewards: GuestGameReward[],
    events: GuestGameEvent[],
    scenarioLimit: number | null = 12,
  ): GuestGameEconomy {
    const scenarios: GuestGameEconomyScenario[] = [
      ...lootBoxes.map((item) =>
        this.buildEconomyScenario({
          kind: 'LOOT_BOX',
          id: item.id,
          name: item.name,
          status: item.status,
          plannedBudget: item.budgetAmount,
          rewards: rewards.filter((reward) => reward.lootBox?.id === item.id),
          events: events.filter((event) => event.lootBox?.id === item.id),
        }),
      ),
      ...missions.map((item) =>
        this.buildEconomyScenario({
          kind: 'MISSION',
          id: item.id,
          name: item.name,
          status: item.status,
          plannedBudget: item.budgetAmount,
          rewards: rewards.filter((reward) => reward.mission?.id === item.id),
          events: events.filter((event) => event.mission?.id === item.id),
        }),
      ),
      ...seasons.map((item) =>
        this.buildEconomyScenario({
          kind: 'SEASON',
          id: item.id,
          name: item.name,
          status: item.status,
          plannedBudget: item.budgetAmount,
          rewards: rewards.filter((reward) => reward.season?.id === item.id),
          events: events.filter((event) => event.season?.id === item.id),
        }),
      ),
    ];
    const manualRewards = rewards.filter(
      (reward) => !reward.lootBox && !reward.mission && !reward.season,
    );
    const manualEvents = events.filter(
      (event) => !event.lootBox && !event.mission && !event.season,
    );

    if (manualRewards.length || manualEvents.length) {
      scenarios.push(
        this.buildEconomyScenario({
          kind: 'MANUAL',
          id: 'manual',
          name: 'Ручные награды и события',
          status: 'ACTIVE',
          plannedBudget: null,
          rewards: manualRewards,
          events: manualEvents,
        }),
      );
    }

    const plannedBudget = sum(
      scenarios.map((scenario) => scenario.plannedBudget ?? 0),
    );
    const budgetUsedCost = sum(
      scenarios.map((scenario) => scenario.budgetUsedCost),
    );
    const rewardCount = sum(scenarios.map((scenario) => scenario.rewardCount));
    const uniqueGuests = new Set<string>();

    for (const reward of rewards) {
      const key = gameEconomyGuestKey(reward);

      if (key) {
        uniqueGuests.add(key);
      }
    }

    for (const event of events) {
      const key = gameEconomyGuestKey(event);

      if (key) {
        uniqueGuests.add(key);
      }
    }

    return {
      summary: {
        plannedBudget,
        budgetUsedCost,
        pendingCost: sum(scenarios.map((scenario) => scenario.pendingCost)),
        approvedCost: sum(scenarios.map((scenario) => scenario.approvedCost)),
        paidCost: sum(scenarios.map((scenario) => scenario.paidCost)),
        expiredCost: sum(scenarios.map((scenario) => scenario.expiredCost)),
        canceledCost: sum(scenarios.map((scenario) => scenario.canceledCost)),
        rewardCount,
        rewardBacklog: sum(
          scenarios.map(
            (scenario) => scenario.pendingRewards + scenario.approvedRewards,
          ),
        ),
        paidRewards: sum(scenarios.map((scenario) => scenario.paidRewards)),
        eventsCount: events.length,
        uniqueGuests: uniqueGuests.size,
        xpIssued: sum(events.map((event) => event.xpDelta)),
        rulesWithoutBudget: scenarios.filter(
          (scenario) =>
            scenario.kind !== 'MANUAL' &&
            scenario.status === 'ACTIVE' &&
            !scenario.plannedBudget,
        ).length,
        budgetUsagePercent: percentOrNull(budgetUsedCost, plannedBudget),
        averageRewardCost: rewardCount
          ? Math.round(budgetUsedCost / rewardCount)
          : 0,
      },
      scenarios: scenarios
        .sort((left, right) => {
          const activeWeight =
            Number(right.status === 'ACTIVE') -
            Number(left.status === 'ACTIVE');

          if (activeWeight !== 0) {
            return activeWeight;
          }

          if (right.budgetUsedCost !== left.budgetUsedCost) {
            return right.budgetUsedCost - left.budgetUsedCost;
          }

          return right.eventsCount - left.eventsCount;
        })
        .slice(0, scenarioLimit ?? undefined),
    };
  }

  private buildEconomyScenario({
    kind,
    id,
    name,
    status,
    plannedBudget,
    rewards,
    events,
  }: {
    kind: GuestGameEconomyScenario['kind'];
    id: string;
    name: string;
    status: GuestGameEconomyScenario['status'];
    plannedBudget: number | null;
    rewards: GuestGameReward[];
    events: GuestGameEvent[];
  }): GuestGameEconomyScenario {
    const pendingRewards = rewards.filter(
      (reward) => reward.status === 'PENDING',
    );
    const approvedRewards = rewards.filter(
      (reward) => reward.status === 'APPROVED',
    );
    const paidRewards = rewards.filter((reward) => reward.status === 'PAID');
    const expiredRewards = rewards.filter(
      (reward) => reward.status === 'EXPIRED',
    );
    const canceledRewards = rewards.filter(
      (reward) => reward.status === 'CANCELED',
    );
    const pendingCost = sum(
      pendingRewards.map((reward) => reward.rewardAmount),
    );
    const approvedCost = sum(
      approvedRewards.map((reward) => reward.rewardAmount),
    );
    const paidCost = sum(paidRewards.map((reward) => reward.rewardAmount));
    const expiredCost = sum(
      expiredRewards.map((reward) => reward.rewardAmount),
    );
    const canceledCost = sum(
      canceledRewards.map((reward) => reward.rewardAmount),
    );
    const budgetUsedCost = pendingCost + approvedCost + paidCost;
    const guests = new Set<string>();

    for (const reward of rewards) {
      const key = gameEconomyGuestKey(reward);

      if (key) {
        guests.add(key);
      }
    }

    for (const event of events) {
      const key = gameEconomyGuestKey(event);

      if (key) {
        guests.add(key);
      }
    }

    return {
      kind,
      id,
      name,
      status,
      plannedBudget,
      budgetUsedCost,
      pendingCost,
      approvedCost,
      paidCost,
      expiredCost,
      canceledCost,
      rewardCount: rewards.length,
      pendingRewards: pendingRewards.length,
      approvedRewards: approvedRewards.length,
      paidRewards: paidRewards.length,
      expiredRewards: expiredRewards.length,
      canceledRewards: canceledRewards.length,
      eventsCount: events.length,
      uniqueGuests: guests.size,
      xpIssued: sum(events.map((event) => event.xpDelta)),
      budgetUsagePercent: percentOrNull(budgetUsedCost, plannedBudget ?? 0),
      averageRewardCost: rewards.length
        ? Math.round(budgetUsedCost / rewards.length)
        : 0,
      recommendation: economyRecommendation({
        status,
        plannedBudget,
        budgetUsagePercent: percentOrNull(budgetUsedCost, plannedBudget ?? 0),
        backlog: pendingRewards.length + approvedRewards.length,
        eventsCount: events.length,
        paidRewards: paidRewards.length,
      }),
    };
  }

  private async buildEffect(
    user: AuthenticatedUser,
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    seasons: GuestGameSeason[],
    events: GuestGameEvent[],
    scenarioLimit: number | null = 12,
  ): Promise<GuestGameEffect> {
    const measurableEvents = events
      .map((event) => ({
        event,
        guestId: event.guest?.id ?? null,
        occurredAt: new Date(event.occurredAt),
      }))
      .filter(
        (
          item,
        ): item is {
          event: GuestGameEvent;
          guestId: string;
          occurredAt: Date;
        } => Boolean(item.guestId) && !Number.isNaN(item.occurredAt.getTime()),
      );

    if (!measurableEvents.length) {
      return emptyGameEffect();
    }

    const guestIds = uniqueStrings(
      measurableEvents.map((item) => item.guestId),
    );
    const from = new Date(
      Math.min(...measurableEvents.map((item) => item.occurredAt.getTime())),
    );
    const to = addDays(
      new Date(
        Math.max(...measurableEvents.map((item) => item.occurredAt.getTime())),
      ),
      gameEffectWindowDays,
    );
    const [sessions, transactions, productSales] = await Promise.all([
      this.prisma.guestSession.findMany({
        where: {
          tenantId: user.tenantId,
          guestId: { in: guestIds },
          startedAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          guestId: true,
          startedAt: true,
          stoppedAt: true,
          durationMinutes: true,
        },
        orderBy: { startedAt: 'asc' },
        take: 5000,
      }),
      this.prisma.guestTransaction.findMany({
        where: {
          tenantId: user.tenantId,
          guestId: { in: guestIds },
          happenedAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          guestId: true,
          happenedAt: true,
          amount: true,
        },
        orderBy: { happenedAt: 'asc' },
        take: 5000,
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId: user.tenantId,
          guestId: { in: guestIds },
          saleDate: { gte: from, lte: to },
          isCanceled: false,
        },
        select: {
          id: true,
          guestId: true,
          saleDate: true,
          revenue: true,
        },
        orderBy: { saleDate: 'asc' },
        take: 5000,
      }),
    ]);
    const scenarios: GuestGameEffectScenario[] = [
      ...lootBoxes.map((item) =>
        this.buildEffectScenario({
          kind: 'LOOT_BOX',
          id: item.id,
          name: item.name,
          status: item.status,
          events: measurableEvents.filter(
            (event) => event.event.lootBox?.id === item.id,
          ),
          sessions,
          transactions,
          productSales,
        }),
      ),
      ...missions.map((item) =>
        this.buildEffectScenario({
          kind: 'MISSION',
          id: item.id,
          name: item.name,
          status: item.status,
          events: measurableEvents.filter(
            (event) => event.event.mission?.id === item.id,
          ),
          sessions,
          transactions,
          productSales,
        }),
      ),
      ...seasons.map((item) =>
        this.buildEffectScenario({
          kind: 'SEASON',
          id: item.id,
          name: item.name,
          status: item.status,
          events: measurableEvents.filter(
            (event) => event.event.season?.id === item.id,
          ),
          sessions,
          transactions,
          productSales,
        }),
      ),
    ];
    const manualEvents = measurableEvents.filter(
      (event) =>
        !event.event.lootBox && !event.event.mission && !event.event.season,
    );

    if (manualEvents.length) {
      scenarios.push(
        this.buildEffectScenario({
          kind: 'MANUAL',
          id: 'manual',
          name: 'Ручные события',
          status: 'ACTIVE',
          events: manualEvents,
          sessions,
          transactions,
          productSales,
        }),
      );
    }

    const activeScenarios = scenarios.filter(
      (scenario) => scenario.eventsCount > 0 || scenario.status === 'ACTIVE',
    );
    const summary = mergeGameEffectScenarios(activeScenarios);

    return {
      windowDays: gameEffectWindowDays,
      summary,
      scenarios: activeScenarios
        .sort((left, right) => {
          if (right.totalRevenue !== left.totalRevenue) {
            return right.totalRevenue - left.totalRevenue;
          }

          if (right.returnedGuests !== left.returnedGuests) {
            return right.returnedGuests - left.returnedGuests;
          }

          return right.eventsCount - left.eventsCount;
        })
        .slice(0, scenarioLimit ?? undefined),
    };
  }

  private buildEffectScenario({
    kind,
    id,
    name,
    status,
    events,
    sessions,
    transactions,
    productSales,
  }: {
    kind: GuestGameEffectScenario['kind'];
    id: string;
    name: string;
    status: GuestGameEffectScenario['status'];
    events: Array<{ event: GuestGameEvent; guestId: string; occurredAt: Date }>;
    sessions: Array<{
      id: string;
      guestId: string | null;
      startedAt: Date | null;
      stoppedAt: Date | null;
      durationMinutes: number | null;
    }>;
    transactions: Array<{
      id: string;
      guestId: string | null;
      happenedAt: Date | null;
      amount: Prisma.Decimal | null;
    }>;
    productSales: Array<{
      id: string;
      guestId: string | null;
      saleDate: Date;
      revenue: Prisma.Decimal;
    }>;
  }): GuestGameEffectScenario {
    const reachedGuestIds = new Set(events.map((event) => event.guestId));
    const returnedGuestIds = new Set<string>();
    const sessionIds = new Set<string>();
    const transactionIds = new Set<string>();
    const saleIds = new Set<string>();
    let postPlayMinutes = 0;
    let productRevenue = 0;
    let balanceTopUps = 0;

    for (const event of events) {
      const windowTo = addDays(event.occurredAt, gameEffectWindowDays);
      const matchedSessions = sessions.filter(
        (session) =>
          session.guestId === event.guestId &&
          session.startedAt !== null &&
          session.startedAt.getTime() > event.occurredAt.getTime() &&
          session.startedAt.getTime() <= windowTo.getTime(),
      );

      if (matchedSessions.length) {
        returnedGuestIds.add(event.guestId);
      }

      for (const session of matchedSessions) {
        if (sessionIds.has(session.id)) {
          continue;
        }

        sessionIds.add(session.id);
        postPlayMinutes +=
          session.durationMinutes ??
          durationMinutes(session.startedAt, session.stoppedAt) ??
          0;
      }

      for (const sale of productSales) {
        if (
          sale.guestId !== event.guestId ||
          sale.saleDate.getTime() <= event.occurredAt.getTime() ||
          sale.saleDate.getTime() > windowTo.getTime() ||
          saleIds.has(sale.id)
        ) {
          continue;
        }

        saleIds.add(sale.id);
        productRevenue += Number(sale.revenue);
      }

      for (const transaction of transactions) {
        if (
          transaction.guestId !== event.guestId ||
          transaction.happenedAt === null ||
          transaction.happenedAt.getTime() <= event.occurredAt.getTime() ||
          transaction.happenedAt.getTime() > windowTo.getTime() ||
          transactionIds.has(transaction.id)
        ) {
          continue;
        }

        const amount = transaction.amount ? Number(transaction.amount) : 0;

        if (amount > 0) {
          transactionIds.add(transaction.id);
          balanceTopUps += amount;
        }
      }
    }

    const totalRevenue = productRevenue + balanceTopUps;

    return {
      kind,
      id,
      name,
      status,
      eventsCount: events.length,
      measuredEvents: events.length,
      reachedGuests: reachedGuestIds.size,
      returnedGuests: returnedGuestIds.size,
      returnRatePercent: percentOrNull(
        returnedGuestIds.size,
        reachedGuestIds.size,
      ),
      postSessions: sessionIds.size,
      postPlayMinutes,
      productRevenue,
      balanceTopUps,
      totalRevenue,
      averageRevenuePerReturnedGuest: returnedGuestIds.size
        ? Math.round(totalRevenue / returnedGuestIds.size)
        : 0,
      recommendation: effectRecommendation({
        status,
        eventsCount: events.length,
        reachedGuests: reachedGuestIds.size,
        returnedGuests: returnedGuestIds.size,
        totalRevenue,
      }),
    };
  }

  private async buildProfileData(
    user: AuthenticatedUser,
    dto: GuestGameProfileDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameProfileUncheckedCreateInput
    | Prisma.GuestGameProfileUncheckedUpdateInput
  > {
    const guest = dto.guestId
      ? await this.getTenantGuest(user, dto.guestId)
      : null;
    const lead = dto.leadId ? await this.getTenantLead(user, dto.leadId) : null;
    const xp = intValue(dto.xp);
    const level = intValue(dto.level);

    if (!isCreate && Object.keys(dto).length === 0) {
      return {};
    }

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      guestId: nullableId(dto.guestId),
      leadId: nullableId(dto.leadId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      displayName:
        stringValue(dto.displayName) ??
        guest?.fullNameMasked ??
        lead?.fullNameMasked ??
        guest?.externalGuestId,
      contactMasked:
        stringValue(dto.contactMasked) ??
        guest?.phoneMasked ??
        lead?.phoneMasked ??
        guest?.emailMasked ??
        lead?.emailMasked,
      phoneHash: nullableString(dto.phoneHash),
      telegramIdentity: nullableString(dto.telegramIdentity),
      maxIdentity: nullableString(dto.maxIdentity),
      xp: xp ?? (isCreate ? 0 : undefined),
      level: level ?? (xp != null ? levelFromXp(xp) : isCreate ? 1 : undefined),
      status: enumValue(
        dto.status,
        profileStatuses,
        isCreate ? 'ACTIVE' : undefined,
      ),
      lastActivityAt: dateValue(dto.lastActivityAt),
    });
  }

  private async buildLootBoxData(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameLootBoxUncheckedCreateInput
    | Prisma.GuestGameLootBoxUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    const rewardType = canonicalLootBoxRewardType(stringValue(dto.rewardType));
    const status = enumValue(
      dto.status,
      statusValues,
      isCreate ? 'DRAFT' : undefined,
    );
    const limits = jsonValue(dto.limits);

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(dto.name, 'Название лутбокса', isCreate),
      status,
      usageKind: enumValue(
        dto.usageKind,
        lootBoxUsageKindValues,
        isCreate ? 'STANDALONE' : undefined,
      ),
      triggerKind:
        stringValue(dto.triggerKind) ??
        (isCreate ? 'SESSION_START' : undefined),
      rewardType: rewardType ?? (isCreate ? 'PROMOCODE' : undefined),
      rewardAmount: decimalValue(dto.rewardAmount),
      rewardLabel: nullableString(dto.rewardLabel),
      segment: nullableString(dto.segment),
      sessionType: nullableString(dto.sessionType),
      storeIds: jsonValue(dto.storeIds),
      periodRules: jsonValue(dto.periodRules),
      limits:
        isCreate && status === 'ACTIVE'
          ? ruleMetadataWithActivatedAt(limits)
          : limits,
      probabilityRules:
        jsonValue(dto.probabilityRules) ??
        (isCreate ? defaultProbabilityRules() : undefined),
      budgetAmount: decimalValue(dto.budgetAmount),
      antiFraudRules: jsonValue(dto.antiFraudRules),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async buildMissionData(
    user: AuthenticatedUser,
    dto: GuestGameMissionDto,
    isCreate: boolean,
  ): Promise<
    | Prisma.GuestGameMissionUncheckedCreateInput
    | Prisma.GuestGameMissionUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    const status = enumValue(
      dto.status,
      statusValues,
      isCreate ? 'DRAFT' : undefined,
    );
    const conditions =
      jsonValue(dto.conditions) ??
      (isCreate ? defaultMissionConditions() : undefined);

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(dto.name, 'Название задания', isCreate),
      status,
      missionType:
        stringValue(dto.missionType) ?? (isCreate ? 'REPEAT_VISIT' : undefined),
      triggerKind:
        stringValue(dto.triggerKind) ?? (isCreate ? 'REPEAT_VISIT' : undefined),
      rewardType:
        stringValue(dto.rewardType) ?? (isCreate ? 'PROMOCODE' : undefined),
      rewardAmount: decimalValue(dto.rewardAmount),
      rewardLabel: nullableString(dto.rewardLabel),
      xpReward: intValue(dto.xpReward) ?? (isCreate ? 50 : undefined),
      progressTarget: intValue(dto.progressTarget),
      progressUnit: nullableString(dto.progressUnit),
      conditions:
        isCreate && status === 'ACTIVE'
          ? ruleMetadataWithActivatedAt(conditions)
          : conditions,
      storeIds: jsonValue(dto.storeIds),
      periodFrom: dateValue(dto.periodFrom),
      periodTo: dateValue(dto.periodTo),
      budgetAmount: decimalValue(dto.budgetAmount),
      perGuestLimit: intValue(dto.perGuestLimit),
      totalRewardLimit: intValue(dto.totalRewardLimit),
      antiFraudRules: jsonValue(dto.antiFraudRules),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async buildSeasonData(
    user: AuthenticatedUser,
    dto: GuestGameSeasonDto,
    isCreate: boolean,
    currentStoreIds: string[] = [],
    currentLevels: Prisma.JsonValue | null = null,
  ): Promise<
    | Prisma.GuestGameSeasonUncheckedCreateInput
    | Prisma.GuestGameSeasonUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

    const storeIds = uniqueStrings(dto.storeIds ?? currentStoreIds);
    const levels =
      dto.levels === undefined
        ? isCreate
          ? defaultLevels()
          : undefined
        : dto.levels === null
          ? Prisma.JsonNull
          : await this.normalizeBattlePassLevels(
              user,
              dto.levels,
              storeIds,
              currentLevels,
            );

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(dto.name, 'Название сезона', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      seasonType:
        stringValue(dto.seasonType) ?? (isCreate ? 'CLUB_SEASON' : undefined),
      periodFrom: dateValue(dto.periodFrom),
      periodTo: dateValue(dto.periodTo),
      xpRules:
        jsonValue(dto.xpRules) ?? (isCreate ? defaultXpRules() : undefined),
      levels,
      freeRewards: jsonValue(dto.freeRewards),
      premiumRewards: jsonValue(dto.premiumRewards),
      premiumEnabled: dto.premiumEnabled ?? (isCreate ? false : undefined),
      premiumUpgradeMode: nullableString(dto.premiumUpgradeMode),
      storeIds: jsonValue(dto.storeIds),
      budgetAmount: decimalValue(dto.budgetAmount),
      manualApprovalRequired:
        dto.manualApprovalRequired ?? (isCreate ? true : undefined),
      note: nullableString(dto.note),
    });
  }

  private async normalizeBattlePassLevels(
    user: AuthenticatedUser,
    value: Prisma.InputJsonValue,
    storeIds: string[],
    currentLevels: Prisma.JsonValue | null = null,
  ): Promise<Prisma.InputJsonValue> {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Шаги Battle Pass должны быть массивом.');
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(storeIds.length ? { id: { in: storeIds } } : {}),
      },
      select: { id: true, externalDomain: true },
    });
    if (storeIds.length && stores.length !== storeIds.length) {
      throw new BadRequestException(
        'Один или несколько клубов Battle Pass недоступны.',
      );
    }
    const externalDomains = uniqueStrings(
      stores.map((store) => store.externalDomain ?? ''),
    );
    const persistedLevelMatches = matchPersistedBattlePassLevels(
      value,
      currentLevels,
    );

    return Promise.all(
      value.map(async (item, index) => {
        const level = jsonRecord(item as Prisma.JsonValue);
        const rawRules = jsonRecord(level.activationRules ?? null);
        const rawTaskType = nullableString(rawRules.taskType);

        // Published legacy seasons keep their old evaluator until an operator
        // explicitly saves the step with the v2 condition editor.
        if (!rawTaskType) {
          return level as Prisma.InputJsonObject;
        }

        const taskType = missionTaskType(rawTaskType);
        const persistedEvaluationPolicy =
          persistedBattlePassPlayTimeEvaluationPolicy(
            persistedLevelMatches.get(index),
            taskType,
          );
        let conditions = normalizeMissionWizardConditions({
          taskType,
          conditions: rawRules,
        });
        let metric = jsonRecord(
          (conditions.metric ?? null) as Prisma.JsonValue,
        );

        if (taskType === 'PRODUCT_PURCHASE') {
          const purchaseSource =
            nullableString(conditions.purchaseSource)?.toUpperCase() ===
            'CATEGORY'
              ? 'CATEGORY'
              : 'PRODUCT';

          if (purchaseSource === 'CATEGORY') {
            const categoryCatalogSource =
              nullableString(
                conditions.categoryCatalogSource,
              )?.toUpperCase() === 'LEETPLUS'
                ? 'LEETPLUS'
                : 'LANGAME';
            const selectionIds = uniqueStrings(
              guestGameStringArray(
                metric.categorySelectionIds ?? metric.categoryIds,
              ),
            );
            const catalog = await this.getMissionProductGroupCatalog(
              user,
              storeIds,
              categoryCatalogSource,
            );
            const selected = catalog.groups.filter((group) =>
              selectionIds.includes(group.id),
            );
            if (
              !selectionIds.length ||
              selected.length !== selectionIds.length
            ) {
              throw new BadRequestException(
                `Шаг ${index + 1}: выберите доступные категории товаров.`,
              );
            }
            const categorySelections = selected.map((group) => ({
              id: group.id,
              name: group.name,
              categoryIds: group.categoryIds,
              externalCategoryKeys: group.refs.map(
                (ref) => `${ref.externalDomain}:${ref.externalGroupId}`,
              ),
              refs: group.refs.map((ref) => ({
                externalDomain: ref.externalDomain,
                externalGroupId: ref.externalGroupId,
              })),
            }));
            metric = {
              ...metric,
              categoryCatalogSource,
              productIds: [],
              externalProductIds: [],
              categorySelectionIds: selected.map((group) => group.id),
              categoryIds:
                categoryCatalogSource === 'LEETPLUS'
                  ? uniqueStrings(
                      selected.flatMap((group) => group.categoryIds),
                    )
                  : [],
              categoryLabels: selected.map((group) => group.name),
              categoryNames: [],
              externalCategoryKeys:
                categoryCatalogSource === 'LANGAME'
                  ? uniqueStrings(
                      categorySelections.flatMap(
                        (selection) => selection.externalCategoryKeys,
                      ),
                    )
                  : [],
              categorySelections,
              target:
                nullableString(metric.productMatch)?.toUpperCase() === 'ALL'
                  ? Math.max(1, selected.length)
                  : 1,
            };
          } else {
            const productIds = uniqueStrings(
              guestGameStringArray(metric.productIds),
            );
            const products = productIds.length
              ? await this.prisma.product.findMany({
                  where: {
                    tenantId: user.tenantId,
                    id: { in: productIds },
                    isActive: true,
                  },
                  select: {
                    id: true,
                    name: true,
                    externalProductId: true,
                    externalDomain: true,
                  },
                })
              : [];
            if (!productIds.length || products.length !== productIds.length) {
              throw new BadRequestException(
                `Шаг ${index + 1}: выберите доступные товары.`,
              );
            }
            metric = {
              ...metric,
              categoryCatalogSource: null,
              categoryIds: [],
              categorySelectionIds: [],
              categoryLabels: [],
              categorySelections: [],
              externalCategoryKeys: [],
              productIds: products.map((product) => product.id),
              externalProductIds: uniqueStrings(
                products.map((product) => product.externalProductId ?? ''),
              ),
              productRefs: products.map((product) => ({
                productId: product.id,
                name: product.name,
                externalProductId: product.externalProductId,
                externalDomain: product.externalDomain,
              })),
            };
          }
          conditions = {
            ...conditions,
            categoryCatalogSource:
              purchaseSource === 'CATEGORY'
                ? (nullableString(metric.categoryCatalogSource) ?? 'LANGAME')
                : null,
            metric: cleanJsonRecord(metric),
          };
        }

        const target = dryRunOptionalNumber(metric.target);
        if (target == null || target <= 0) {
          throw new BadRequestException(
            `Шаг ${index + 1}: цель условия должна быть больше нуля.`,
          );
        }

        return {
          ...level,
          activationRules: cleanJsonRecord({
            ...conditions,
            schemaVersion: guestGameMissionDefinitionVersion,
            source: 'battle_pass_step',
            taskType,
            triggerKind: missionWizardTrigger(taskType),
            evaluationPolicy:
              persistedEvaluationPolicy ?? missionEvaluationPolicy(taskType),
            periodicity: 'NONE',
            ...(taskType === 'BALANCE_TOPUP'
              ? { domainScoped: true, externalDomains }
              : {}),
          }),
        };
      }),
    );
  }

  private buildPromoCardData(
    user: AuthenticatedUser,
    dto: GuestGamePromoCardDto,
    isCreate: boolean,
  ):
    | Prisma.GuestGamePromoCardUncheckedCreateInput
    | Prisma.GuestGamePromoCardUncheckedUpdateInput {
    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      title: requiredString(dto.title, 'Название промо-баннера', isCreate),
      label: nullableString(dto.label),
      description: nullableString(dto.description),
      tag: nullableString(dto.tag),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      targetAnchor: nullableString(dto.targetAnchor),
      priority: intValue(dto.priority) ?? (isCreate ? 0 : undefined),
      storeIds: jsonValue(dto.storeIds),
      periodFrom: dateValue(dto.periodFrom),
      periodTo: dateValue(dto.periodTo),
      metadata:
        jsonValue(dto.metadata) ??
        (isCreate
          ? {
              source: 'advanced_editor',
              imageAspectRatio: '9:16',
            }
          : undefined),
    });
  }

  private async buildRewardData(
    user: AuthenticatedUser,
    dto: GuestGameRewardDto,
    isCreate: boolean,
    canonicalIdentity: {
      originKey?: string | null;
      idempotencyKey?: string | null;
    } = {},
  ): Promise<
    | Prisma.GuestGameRewardUncheckedCreateInput
    | Prisma.GuestGameRewardUncheckedUpdateInput
  > {
    if (dto.profileId) {
      await this.assertProfile(user, dto.profileId);
    }
    if (dto.guestId) {
      await this.getTenantGuest(user, dto.guestId);
    }
    if (dto.lootBoxId) {
      await this.assertLootBox(user, dto.lootBoxId);
    }
    if (dto.missionId) {
      await this.assertMission(user, dto.missionId);
    }
    if (dto.seasonId) {
      await this.assertSeason(user, dto.seasonId);
    }
    if (dto.storeId) {
      await this.assertStore(user, dto.storeId);
    }

    const status = enumValue(
      dto.status,
      rewardStatuses,
      isCreate ? 'PENDING' : undefined,
    );
    const rewardRarity = lootBoxRewardRarityCode(dto.rewardRarity);

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      profileId: nullableId(dto.profileId),
      guestId: nullableId(dto.guestId),
      lootBoxId: nullableId(dto.lootBoxId),
      missionId: nullableId(dto.missionId),
      seasonId: nullableId(dto.seasonId),
      storeId: nullableId(dto.storeId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      approvedByUserId:
        status === 'APPROVED' || status === 'PAID'
          ? actorUserId(user)
          : undefined,
      status,
      source: enumValue(
        dto.source,
        rewardSources,
        isCreate ? 'MANUAL' : undefined,
      ),
      externalProvider: integrationProviderValue(dto.externalProvider),
      externalDomain: nullableString(dto.externalDomain),
      externalId: nullableString(dto.externalId),
      originKey: isCreate
        ? nullableString(canonicalIdentity.originKey)
        : undefined,
      idempotencyKey: isCreate
        ? nullableString(canonicalIdentity.idempotencyKey)
        : undefined,
      guestExternalId: nullableString(dto.guestExternalId),
      rewardType: requiredString(dto.rewardType, 'Тип награды', isCreate),
      rewardAmount:
        decimalValue(dto.rewardAmount) ??
        (isCreate ? new Prisma.Decimal(0) : undefined),
      rewardLabel: requiredString(
        dto.rewardLabel,
        'Название награды',
        isCreate,
      ),
      rewardRarity,
      rewardRarityLabel:
        nullableString(dto.rewardRarityLabel) ??
        (rewardRarity ? lootBoxRewardRarityLabels[rewardRarity] : undefined),
      rewardDropChance: decimalValue(dto.rewardDropChance),
      rewardCode:
        nullableString(dto.rewardCode) ??
        (isCreate ? generateRewardCode() : undefined),
      qualifiedAt:
        dateValue(dto.qualifiedAt) ?? (isCreate ? new Date() : undefined),
      expiresAt: dateValue(dto.expiresAt),
      paidAt: status === 'PAID' ? new Date() : undefined,
      note: nullableString(dto.note),
      evidence: jsonValue(dto.evidence),
    });
  }

  private async buildEventData(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
    canonicalIdentity: { originKey?: string | null } = {},
  ): Promise<Prisma.GuestGameEventUncheckedCreateInput> {
    if (dto.profileId) {
      await this.assertProfile(user, dto.profileId);
    }
    if (dto.guestId) {
      await this.getTenantGuest(user, dto.guestId);
    }
    if (dto.lootBoxId) {
      await this.assertLootBox(user, dto.lootBoxId);
    }
    if (dto.missionId) {
      await this.assertMission(user, dto.missionId);
    }
    if (dto.seasonId) {
      await this.assertSeason(user, dto.seasonId);
    }

    return clean({
      tenantId: user.tenantId,
      profileId: nullableId(dto.profileId),
      guestId: nullableId(dto.guestId),
      lootBoxId: nullableId(dto.lootBoxId),
      missionId: nullableId(dto.missionId),
      seasonId: nullableId(dto.seasonId),
      createdByUserId: actorUserId(user),
      eventType: requiredString(dto.eventType, 'Тип события', true),
      source: enumValue(dto.source, eventSources, 'MANUAL'),
      externalProvider: integrationProviderValue(dto.externalProvider),
      externalDomain: nullableString(dto.externalDomain),
      externalId: nullableString(dto.externalId),
      originKey: nullableString(canonicalIdentity.originKey),
      xpDelta: intValue(dto.xpDelta) ?? 0,
      occurredAt: dateValue(dto.occurredAt) ?? new Date(),
      payload: jsonValue(dto.payload),
      note: nullableString(dto.note),
    }) as Prisma.GuestGameEventUncheckedCreateInput;
  }

  async materializeRewardIntents(
    user: AuthenticatedUser,
    dto: GuestGameEffectMaterializeDto = {},
  ): Promise<GuestGameEffectMaterializeResult> {
    if (!this.rewardMaterializerClaimsAllowed()) {
      return emptyEffectMaterializeResult();
    }
    const limit = boundedEffectInteger(dto.limit, 30, 1, 100);
    const claimLeaseMs = boundedEffectInteger(
      dto.claimLeaseMs,
      120_000,
      30_000,
      10 * 60_000,
    );
    const maxAttempts = boundedEffectInteger(dto.maxAttempts, 5, 1, 20);
    const eventId = nullableId(dto.eventId) ?? null;
    const result = emptyEffectMaterializeResult();
    const now = new Date();

    const exhausted = await this.prisma.guestGameRewardIntent.updateMany({
      where: {
        tenantId: user.tenantId,
        ...(eventId ? { eventId } : {}),
        effectKind: 'REWARD',
        status: 'PROCESSING',
        attempts: { gte: maxAttempts },
        OR: [{ claimExpiresAt: { lte: now } }, { claimExpiresAt: null }],
      },
      data: {
        status: 'DEAD_LETTER',
        claimExpiresAt: null,
        nextAttemptAt: null,
        lastError: 'Lease expired after the maximum number of attempts.',
      },
    });
    result.deadLettered += exhausted.count;

    const candidates = await this.prisma.guestGameRewardIntent.findMany({
      where: {
        tenantId: user.tenantId,
        ...(eventId ? { eventId } : {}),
        effectKind: 'REWARD',
        attempts: { lt: maxAttempts },
        OR: [
          {
            status: { in: ['PENDING', 'FAILED'] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: 'PROCESSING',
            OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
          },
        ],
      },
      select: { eventId: true, profileId: true },
      distinct: ['eventId'],
      orderBy: [{ createdAt: 'asc' }, { eventId: 'asc' }],
      take: limit,
    });

    for (const candidate of candidates) {
      const event = await this.prisma.guestGameEvent.findFirst({
        where: { id: candidate.eventId, tenantId: user.tenantId },
        include: eventInclude,
      });
      const profileId = candidate.profileId ?? event?.profileId ?? null;
      const profile = profileId
        ? await this.prisma.guestGameProfile.findFirst({
            where: { id: profileId, tenantId: user.tenantId },
            include: gameProfileInclude,
          })
        : null;

      if (!event || !profileId || !profile) {
        const dead = await this.prisma.guestGameRewardIntent.updateMany({
          where: {
            tenantId: user.tenantId,
            eventId: candidate.eventId,
            effectKind: 'REWARD',
            status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
          },
          data: {
            status: 'DEAD_LETTER',
            claimExpiresAt: null,
            nextAttemptAt: null,
            lastError: !event
              ? 'The source event no longer exists.'
              : 'The guest game profile required by the reward intent no longer exists.',
          },
        });
        result.deadLettered += dead.count;
        continue;
      }

      const storedPayload = jsonRecord(event.payload ?? null);
      const input = processRewardInputSnapshot(
        storedPayload.input,
        emptyProcessRewardInput(),
      );
      const store = processRewardStoreSnapshot(storedPayload.store, null);
      const mappedProfile = mapProfile(profile);
      const currentDryRun: GuestGameDryRunResult = {
        dryRun: true,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        profile: {
          id: mappedProfile.id,
          displayName: mappedProfile.displayName,
          contactMasked: mappedProfile.contactMasked,
          xp: mappedProfile.xp,
          level: mappedProfile.level,
          status: mappedProfile.status,
        },
        guest: mappedProfile.guest,
        store,
        input,
        summary: {
          checkedRules: 0,
          eligibleRules: 0,
          blockedRules: 0,
          estimatedRewardAmount: 0,
          projectedXpDelta: 0,
        },
        rules: [],
        note: 'Reward intent is reconstructed from its immutable persisted snapshot.',
      };
      const eventReference =
        event.externalProvider && event.externalDomain && event.externalId
          ? {
              externalProvider: event.externalProvider,
              externalDomain: event.externalDomain,
              externalId: event.externalId,
            }
          : null;
      const materialized = await this.materializeProcessRewardIntents(
        user,
        {
          profileId,
          guestId: event.guestId,
          storeId: store?.id ?? null,
          eventType: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          externalProvider: event.externalProvider,
          externalDomain: event.externalDomain,
          externalId: event.externalId,
        },
        currentDryRun,
        event,
        profileId,
        eventReference,
        event.originKey,
        {
          limit: Math.max(1, limit - result.claimed),
          claimLeaseMs,
          maxAttempts,
          throwOnFailure: false,
        },
      );
      if (materialized) {
        mergeEffectMaterializeResult(result, materialized.stats);
      }
      if (result.claimed >= limit) break;
    }

    result.rewardIds = [...new Set(result.rewardIds)];
    return result;
  }

  async materializeRewardEffects(
    user: AuthenticatedUser,
    dto: GuestGameEffectMaterializeDto = {},
  ): Promise<GuestGameEffectMaterializeResult> {
    if (!this.rewardMaterializerClaimsAllowed()) {
      return emptyEffectMaterializeResult();
    }
    const limit = boundedEffectInteger(dto.limit, 30, 1, 100);
    const claimLeaseMs = boundedEffectInteger(
      dto.claimLeaseMs,
      120_000,
      30_000,
      10 * 60_000,
    );
    const maxAttempts = boundedEffectInteger(dto.maxAttempts, 5, 1, 20);
    const rewardId = nullableId(dto.rewardId) ?? null;
    const result = emptyEffectMaterializeResult();
    const now = new Date();

    const exhausted = await this.prisma.guestGameRewardEffect.updateMany({
      where: {
        tenantId: user.tenantId,
        ...(rewardId ? { rewardId } : {}),
        status: 'PROCESSING',
        attempts: { gte: maxAttempts },
        OR: [{ claimExpiresAt: { lte: now } }, { claimExpiresAt: null }],
      },
      data: {
        status: 'DEAD_LETTER',
        claimExpiresAt: null,
        nextAttemptAt: null,
        lastError: 'Lease expired after the maximum number of attempts.',
      },
    });
    result.deadLettered += exhausted.count;

    const claims = await this.claimRewardEffects(
      user.tenantId,
      rewardId,
      limit,
      claimLeaseMs,
      maxAttempts,
    );
    result.claimed = claims.length;

    for (const claim of claims) {
      try {
        const row = await this.prisma.guestGameReward.findFirst({
          where: { id: claim.rewardId, tenantId: user.tenantId },
          include: rewardInclude,
        });
        if (!row) {
          throw new Error('Reward referenced by the effect no longer exists.');
        }

        if (!guestGameRewardEffectStillApplies(row, claim.effectKind)) {
          const canceled = await this.prisma.guestGameRewardEffect.updateMany({
            where: {
              id: claim.id,
              tenantId: user.tenantId,
              status: 'PROCESSING',
              leaseVersion: claim.leaseVersion,
            },
            data: {
              status: 'CANCELED',
              claimExpiresAt: null,
              nextAttemptAt: null,
              appliedAt: new Date(),
              lastError: null,
              result: { reason: 'reward_status_changed' },
            },
          });
          if (canceled.count > 0) result.canceled += 1;
          else result.staleFinalizations += 1;
          continue;
        }

        if (claim.effectKind === 'STAFF_APPROVAL_NOTIFICATION') {
          await this.notifyRewardApprovalRequired(row);
        } else if (claim.effectKind === 'LOOT_BOX_ENTITLEMENT') {
          await this.createApprovedRewardLootBoxEntitlement(user, row);
        } else if (claim.effectKind === 'BONUS_LEDGER_QUEUE') {
          await this.bonusLedgerService.queueApprovedRewards(user, {
            rewardId: row.id,
            rewardTypes: [row.rewardType],
            limit: 1,
          });
        } else {
          throw new Error(`Unsupported reward effect: ${claim.effectKind}`);
        }

        const finalized = await this.prisma.guestGameRewardEffect.updateMany({
          where: {
            id: claim.id,
            tenantId: user.tenantId,
            status: 'PROCESSING',
            leaseVersion: claim.leaseVersion,
          },
          data: {
            status: 'APPLIED',
            claimExpiresAt: null,
            nextAttemptAt: null,
            appliedAt: new Date(),
            lastError: null,
            result: {
              effectKind: claim.effectKind,
              rewardId: row.id,
            },
          },
        });
        if (finalized.count === 0) {
          result.staleFinalizations += 1;
          continue;
        }
        result.applied += 1;
        if (claim.attempts > 1) result.recovered += 1;
        result.rewardIds.push(row.id);
      } catch (error) {
        const deadLetter = claim.attempts >= maxAttempts;
        const failed = await this.prisma.guestGameRewardEffect.updateMany({
          where: {
            id: claim.id,
            tenantId: user.tenantId,
            status: 'PROCESSING',
            leaseVersion: claim.leaseVersion,
          },
          data: {
            status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
            claimExpiresAt: null,
            nextAttemptAt: deadLetter
              ? null
              : new Date(Date.now() + rewardEffectRetryDelayMs(claim.attempts)),
            lastError: this.checkInErrorMessage(error).slice(0, 500),
          },
        });
        if (failed.count === 0) result.staleFinalizations += 1;
        else if (deadLetter) result.deadLettered += 1;
        else result.failed += 1;
      }
    }

    result.rewardIds = [...new Set(result.rewardIds)];
    return result;
  }

  private async claimRewardEffects(
    tenantId: string,
    rewardId: string | null,
    limit: number,
    claimLeaseMs: number,
    maxAttempts: number,
  ): Promise<ClaimedRewardEffectRow[]> {
    const rewardFilter = rewardId
      ? Prisma.sql`AND effect."rewardId" = ${rewardId}`
      : Prisma.empty;
    const claimed = await this.prisma.$queryRaw<ClaimedRewardEffectRow[]>(
      Prisma.sql`
        WITH candidates AS (
          SELECT effect."id"
          FROM "GuestGameRewardEffect" AS effect
          WHERE effect."tenantId" = ${tenantId}
            ${rewardFilter}
            AND effect."attempts" < ${maxAttempts}
            AND (
              (
                effect."status" IN ('PENDING', 'FAILED')
                AND (effect."nextAttemptAt" IS NULL OR effect."nextAttemptAt" <= NOW())
              )
              OR (
                effect."status" = 'PROCESSING'
                AND (effect."claimExpiresAt" IS NULL OR effect."claimExpiresAt" <= NOW())
              )
            )
          ORDER BY COALESCE(effect."nextAttemptAt", effect."createdAt"), effect."createdAt", effect."id"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "GuestGameRewardEffect" AS effect
        SET
          "status" = 'PROCESSING',
          "attempts" = effect."attempts" + 1,
          "leaseVersion" = effect."leaseVersion" + 1,
          "claimedAt" = NOW(),
          "claimExpiresAt" = NOW() + (${claimLeaseMs} * INTERVAL '1 millisecond'),
          "nextAttemptAt" = NULL,
          "lastError" = NULL,
          "updatedAt" = NOW()
        FROM candidates
        WHERE effect."id" = candidates."id"
        RETURNING effect."id", effect."rewardId", effect."effectKind", effect."payload",
          effect."attempts", effect."leaseVersion"
      `,
    );
    if (Array.isArray(claimed)) return claimed;

    // Jest delegates do not execute raw SQL. This CAS fallback keeps unit
    // tests deterministic; production always uses the SKIP LOCKED query.
    const candidates = await this.prisma.guestGameRewardEffect.findMany({
      where: {
        tenantId,
        ...(rewardId ? { rewardId } : {}),
        attempts: { lt: maxAttempts },
        OR: [
          {
            status: { in: ['PENDING', 'FAILED'] },
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: new Date() } },
            ],
          },
          {
            status: 'PROCESSING',
            OR: [
              { claimExpiresAt: null },
              { claimExpiresAt: { lte: new Date() } },
            ],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const fallback: ClaimedRewardEffectRow[] = [];
    for (const candidate of candidates) {
      const nextLeaseVersion = candidate.leaseVersion + 1;
      const updated = await this.prisma.guestGameRewardEffect.updateMany({
        where: {
          id: candidate.id,
          tenantId,
          leaseVersion: candidate.leaseVersion,
          status: candidate.status,
        },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          leaseVersion: { increment: 1 },
          claimedAt: new Date(),
          claimExpiresAt: new Date(Date.now() + claimLeaseMs),
          nextAttemptAt: null,
          lastError: null,
        },
      });
      if (updated.count === 1) {
        fallback.push({
          id: candidate.id,
          rewardId: candidate.rewardId,
          effectKind: candidate.effectKind,
          payload: candidate.payload,
          attempts: candidate.attempts + 1,
          leaseVersion: nextLeaseVersion,
        });
      }
    }
    return fallback;
  }

  private async notifyRewardApprovalRequired(row: RewardRow) {
    if (!this.staffTeamChatService) {
      throw new Error('Staff team chat service is not available.');
    }

    await this.staffTeamChatService.createGamificationRewardApprovalNotification(
      row.tenantId,
      {
        rewardId: row.id,
        activityType: this.rewardActivityType(row),
        activityName: this.rewardActivityName(row),
        conditions: this.rewardApprovalConditions(row),
        rewardLabel: row.rewardLabel,
        rewardAmount: numberValue(row.rewardAmount),
        guestLabel:
          row.profile?.displayName ??
          row.guest?.fullNameMasked ??
          row.guest?.externalGuestId ??
          null,
        guestPhone:
          row.profile?.contactMasked ??
          row.guest?.phoneMasked ??
          row.guest?.emailMasked ??
          null,
        storeId: row.storeId,
        storeName: row.store?.name ?? null,
        qualifiedAt: row.qualifiedAt,
        actionHref: `/gamification?tab=rewards&rewardId=${encodeURIComponent(row.id)}`,
      },
    );
  }

  private async reconcileCreatedRewardSideEffects(
    user: AuthenticatedUser,
    row: RewardRow,
  ) {
    const effects = guestGameRewardEffectPlans(row);
    if (effects.length > 0) {
      await this.prisma.guestGameRewardEffect.createMany({
        data: effects.map((effect) => ({
          tenantId: row.tenantId,
          rewardId: row.id,
          ...effect,
        })),
        skipDuplicates: true,
      });
    }
    if (!this.rewardMaterializerClaimsAllowed()) {
      return;
    }
    const materialized = await this.materializeRewardEffects(user, {
      rewardId: row.id,
      limit: Math.max(1, effects.length),
    });
    if (materialized.failed > 0 || materialized.deadLettered > 0) {
      this.logger.warn(
        `Reward effect reconciliation deferred for ${row.id}: failed=${materialized.failed} dead=${materialized.deadLettered}`,
      );
    }
  }

  private rewardMaterializerClaimsAllowed() {
    return guestGameRewardMaterializerClaimsAllowed(
      resolveGuestGameRewardMaterializerPolicy(this.configService),
    );
  }

  private async reconcileCreatedRewardSideEffectsById(
    user: AuthenticatedUser,
    rewardId: string,
  ) {
    const row = await this.prisma.guestGameReward.findFirst({
      where: { id: rewardId, tenantId: user.tenantId },
      include: rewardInclude,
    });
    if (!row) return;

    await this.reconcileCreatedRewardSideEffects(user, row);
  }

  private rewardActivityType(row: RewardRow) {
    if (row.lootBoxId) {
      return 'Лутбокс';
    }

    if (row.mission && rewardMissionIsCheckIn(row.mission)) {
      return 'Чекин';
    }

    if (row.missionId) {
      return 'Задание';
    }

    if (row.seasonId) {
      return 'Battle Pass';
    }

    return row.source === 'MANUAL' ? 'Ручная награда' : 'Игровое событие';
  }

  private rewardActivityName(row: RewardRow) {
    return (
      row.lootBox?.name ??
      row.mission?.name ??
      row.season?.name ??
      row.rewardLabel
    );
  }

  private rewardApprovalConditions(row: RewardRow) {
    return buildRewardApprovalConditions(row);
  }

  private async createSystemEvent(
    user: AuthenticatedUser,
    dto: Omit<GuestGameEventDto, 'source'>,
  ) {
    await this.prisma.guestGameEvent.create({
      data: {
        tenantId: user.tenantId,
        profileId: dto.profileId ?? null,
        guestId: dto.guestId ?? null,
        lootBoxId: dto.lootBoxId ?? null,
        missionId: dto.missionId ?? null,
        seasonId: dto.seasonId ?? null,
        createdByUserId: actorUserId(user),
        eventType: dto.eventType ?? 'SYSTEM',
        source: 'SYSTEM',
        xpDelta: intValue(dto.xpDelta) ?? 0,
        occurredAt: new Date(),
        note: dto.note ?? null,
      },
    });
  }

  private async assertProfile(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameProfile.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Игровой профиль не найден');
    }

    return row;
  }

  private async assertLootBox(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameLootBox.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Лутбокс не найден');
    }

    return row;
  }

  private async assertMission(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameMission.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Игровое задание не найдено');
    }

    return row;
  }

  private async assertSeason(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameSeason.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Сезон не найден');
    }

    return row;
  }

  private async assertReward(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameReward.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Награда не найдена');
    }

    return row;
  }

  private async assertAudience(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestAudience.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Группа гостей не найдена');
    }

    return row;
  }

  private async assertStore(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.store.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Клуб не найден');
    }

    return row;
  }

  private toCheckInExpectedStore(store: {
    id: string;
    name?: string | null;
    externalDomain?: string | null;
    externalClubId?: string | null;
    integrationSourceId?: string | null;
    timeZone?: string | null;
  }): CheckInExpectedStore {
    return {
      id: store.id,
      name: store.name ?? 'Клуб',
      externalDomain: nullableString(store.externalDomain) ?? null,
      externalClubId: nullableString(store.externalClubId) ?? null,
      integrationSourceId: nullableString(store.integrationSourceId) ?? null,
      timeZone: nullableString(store.timeZone) ?? null,
    };
  }

  private async findActiveCheckInSession(
    tenantId: string,
    guest: {
      externalDomain: string | null;
      externalGuestId: string;
      currentCountHours?: Prisma.Decimal | number | string | null;
    },
    options: CheckInLookupOptions = {},
  ): Promise<CheckInLiveSession | null> {
    const externalGuestId = nullableString(guest.externalGuestId);

    if (!externalGuestId) {
      return null;
    }

    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const preferredDomain = nullableString(guest.externalDomain) ?? null;
    const orderedSources = this.checkInLookupSources(
      sources,
      preferredDomain,
      options.expectedStore ?? null,
    );
    const period = this.checkInLookupPeriod(new Date());

    for (const source of orderedSources) {
      try {
        const session = await this.findCheckInSessionInSource({
          tenantId,
          apiKey,
          source,
          externalGuestId,
          period,
          timeoutMs: options.timeoutMs,
          expectedStore: options.expectedStore ?? null,
        });

        if (session) {
          return this.resolveCheckInSessionTypeFromLiveGuestBalance(session, {
            apiKey,
            source,
            externalGuestId,
            guest,
            timeoutMs: options.timeoutMs,
          });
        }
      } catch {
        continue;
      }
    }

    const cachedSession = await this.findCachedCheckInSession(
      tenantId,
      guest,
      options.expectedStore ?? null,
    );

    if (!cachedSession) {
      return null;
    }

    const cachedSource = this.checkInSourceForCachedSession(
      orderedSources,
      cachedSession,
    );

    if (!cachedSource) {
      this.logGuestGameDebug('live-session-start-cached-fallback', {
        tenantId,
        externalGuestId,
        reason: 'source_not_found',
        session: this.guestGameDebugSession(cachedSession),
      });
      return cachedSession;
    }

    const refreshedSession =
      await this.resolveCheckInSessionTypeFromLiveGuestBalance(cachedSession, {
        apiKey,
        source: cachedSource,
        externalGuestId,
        guest,
        timeoutMs: options.timeoutMs,
      });

    this.logGuestGameDebug('live-session-start-cached-fallback', {
      tenantId,
      externalGuestId,
      apiSource: this.guestGameDebugSource(cachedSource),
      session: this.guestGameDebugSession(refreshedSession),
      sessionChanged:
        refreshedSession.sessionPacket !== cachedSession.sessionPacket ||
        refreshedSession.sessionType !== cachedSession.sessionType,
    });

    return refreshedSession;
  }

  private checkInSourceForCachedSession(
    sources: Array<{ id: string; domain: string; baseUrl: string }>,
    session: CheckInLiveSession,
  ) {
    const sessionDomain = nullableString(session.externalDomain);

    return (
      sources.find((source) => source.domain === sessionDomain) ??
      sources[0] ??
      null
    );
  }

  private checkInLookupSources(
    sources: Array<{ id: string; domain: string; baseUrl: string }>,
    preferredDomain: string | null,
    expectedStore: CheckInExpectedStore | null,
  ) {
    const expectedSourceId =
      nullableString(expectedStore?.integrationSourceId) ?? null;
    const expectedDomain =
      nullableString(expectedStore?.externalDomain) ?? null;
    const scopedSources = expectedStore
      ? sources.filter((source) => {
          if (expectedSourceId && source.id === expectedSourceId) {
            return true;
          }

          return Boolean(expectedDomain && source.domain === expectedDomain);
        })
      : [];
    const candidateSources = scopedSources.length > 0 ? scopedSources : sources;

    return [...candidateSources].sort(
      (left, right) =>
        this.checkInLookupSourceScore(
          left,
          preferredDomain,
          expectedSourceId,
          expectedDomain,
        ) -
        this.checkInLookupSourceScore(
          right,
          preferredDomain,
          expectedSourceId,
          expectedDomain,
        ),
    );
  }

  private checkInLookupSourceScore(
    source: { id: string; domain: string },
    preferredDomain: string | null,
    expectedSourceId: string | null,
    expectedDomain: string | null,
  ) {
    if (expectedSourceId && source.id === expectedSourceId) {
      return 0;
    }

    if (expectedDomain && source.domain === expectedDomain) {
      return 1;
    }

    if (preferredDomain && source.domain === preferredDomain) {
      return 2;
    }

    return 3;
  }

  private async resolveCheckInSessionTypeFromLiveGuestBalance(
    session: CheckInLiveSession,
    params: {
      apiKey: string;
      source: { baseUrl: string };
      externalGuestId: string;
      guest: { currentCountHours?: Prisma.Decimal | number | string | null };
      timeoutMs?: number;
    },
  ): Promise<CheckInLiveSession> {
    // The tariff type-group dictionary is the strongest source Langame gives
    // us. In particular, packet=1 is the `basic` hourly group on current
    // installations and must not be promoted to a package by stale balances
    // or historical guest-log entries.
    if (session.sessionBillingResolvedBy === 'tariff_type_group') {
      this.logGuestGameDebug('live-session-type-detected', {
        source: 'tariff_type_group',
        apiSource: this.guestGameDebugSource(params.source),
        externalGuestId: params.externalGuestId,
        session: this.guestGameDebugSession(session),
      });
      return session;
    }

    const currentCountHours = await this.findLiveGuestCurrentCountHours(params);
    const sessionWithLiveBalance =
      this.resolveCheckInSessionTypeFromGuestBalance(session, {
        currentCountHours,
      });

    if (sessionWithLiveBalance.sessionPacket === true) {
      this.logGuestGameDebug('live-session-type-detected', {
        source: 'live_guest_balance',
        apiSource: this.guestGameDebugSource(params.source),
        externalGuestId: params.externalGuestId,
        localCurrentCountHours: params.guest.currentCountHours ?? null,
        liveCurrentCountHours: currentCountHours,
        session: this.guestGameDebugSession(sessionWithLiveBalance),
      });
      return sessionWithLiveBalance;
    }

    const transactionMatched = await this.hasLivePacketHoursTransaction(
      sessionWithLiveBalance,
      params,
    );
    const liveBalanceExplicitlyEmpty = this.guestHasExplicitZeroPacketHours({
      currentCountHours,
    });
    const guestLogMatched =
      transactionMatched || liveBalanceExplicitlyEmpty
        ? false
        : await this.hasLivePacketHoursGuestLog(sessionWithLiveBalance, params);

    this.logGuestGameDebug('live-session-type-evaluated', {
      apiSource: this.guestGameDebugSource(params.source),
      externalGuestId: params.externalGuestId,
      localCurrentCountHours: params.guest.currentCountHours ?? null,
      liveCurrentCountHours: currentCountHours,
      liveBalanceExplicitlyEmpty,
      transactionMatched,
      guestLogMatched,
      sessionBeforeTransaction: this.guestGameDebugSession(
        sessionWithLiveBalance,
      ),
    });

    if (transactionMatched || guestLogMatched) {
      return this.markCheckInSessionAsPacket(sessionWithLiveBalance);
    }

    return sessionWithLiveBalance;
  }

  private async findLiveGuestCurrentCountHours(params: {
    apiKey: string;
    source: { baseUrl: string };
    externalGuestId: string;
    timeoutMs?: number;
  }): Promise<string | number | null> {
    try {
      const payload = await this.langameClient.searchGuests(
        params.source.baseUrl,
        params.apiKey,
        { guest_id: params.externalGuestId },
        { timeoutMs: params.timeoutMs },
      );
      const rows = this.checkInGuestSearchRows(payload);
      const row =
        rows.find((item) =>
          [item.guest_id, item.real_guest_id, item.id].some(
            (value) => this.checkInScalar(value) === params.externalGuestId,
          ),
        ) ?? rows[0];
      const value = row?.current_count_hours;

      this.logGuestGameDebug('live-guest-balance', {
        apiSource: this.guestGameDebugSource(params.source),
        externalGuestId: params.externalGuestId,
        rows: rows.length,
        matchedRow: row
          ? {
              guestId: this.checkInScalar(row.guest_id),
              realGuestId: this.checkInScalar(row.real_guest_id),
              id: this.checkInScalar(row.id),
              currentCountHours: value ?? null,
            }
          : null,
      });

      return typeof value === 'string' || typeof value === 'number'
        ? value
        : null;
    } catch (error) {
      this.logGuestGameDebug(
        'live-guest-balance-failed',
        {
          apiSource: this.guestGameDebugSource(params.source),
          externalGuestId: params.externalGuestId,
          error: this.checkInErrorMessage(error),
        },
        'warn',
      );
      return null;
    }
  }

  private async hasLivePacketHoursTransaction(
    session: CheckInLiveSession,
    params: {
      apiKey: string;
      source: { baseUrl: string };
      externalGuestId: string;
      timeoutMs?: number;
    },
  ): Promise<boolean> {
    const dateRange = this.checkInSessionTransactionPeriod(session);
    const pageLimit = 200;
    const maxPages = 5;
    let pagesChecked = 0;
    let rowsChecked = 0;
    const candidateRows: Array<Record<string, unknown>> = [];

    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const rows = await this.langameClient.listTransactions(
          params.source.baseUrl,
          params.apiKey,
          {
            page,
            pageLimit,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
          },
        );
        pagesChecked += 1;
        rowsChecked += rows.length;

        for (const row of rows) {
          const debugRow = this.guestGameDebugTransaction(
            row,
            session,
            params.externalGuestId,
          );

          if (
            candidateRows.length < 8 &&
            (debugRow.guestMatches ||
              debugRow.sessionOrStoreMatches ||
              debugRow.looksLikePacketOrSubscription)
          ) {
            candidateRows.push(debugRow);
          }

          if (
            this.isPacketHoursTransactionForSession(
              row,
              session,
              params.externalGuestId,
            )
          ) {
            this.logGuestGameDebug('live-packet-transaction-match', {
              apiSource: this.guestGameDebugSource(params.source),
              externalGuestId: params.externalGuestId,
              dateRange,
              page,
              pagesChecked,
              rowsChecked,
              session: this.guestGameDebugSession(session),
              transaction: debugRow,
            });
            return true;
          }
        }

        if (rows.length < pageLimit) {
          break;
        }
      }
    } catch (error) {
      this.logGuestGameDebug(
        'live-packet-transaction-failed',
        {
          apiSource: this.guestGameDebugSource(params.source),
          externalGuestId: params.externalGuestId,
          dateRange,
          pagesChecked,
          rowsChecked,
          session: this.guestGameDebugSession(session),
          error: this.checkInErrorMessage(error),
        },
        'warn',
      );
      return false;
    }

    this.logGuestGameDebug(
      'live-packet-transaction-not-found',
      {
        apiSource: this.guestGameDebugSource(params.source),
        externalGuestId: params.externalGuestId,
        dateRange,
        pagesChecked,
        rowsChecked,
        session: this.guestGameDebugSession(session),
        candidateRows,
      },
      'warn',
    );

    return false;
  }

  private async hasLivePacketHoursGuestLog(
    session: CheckInLiveSession,
    params: {
      apiKey: string;
      source: { baseUrl: string };
      externalGuestId: string;
      timeoutMs?: number;
    },
  ): Promise<boolean> {
    const dateRange = this.checkInSessionTransactionPeriod(session);
    const pageLimit = 200;
    const maxPages = 5;
    let pagesChecked = 0;
    let rowsChecked = 0;
    const candidateRows: Array<Record<string, unknown>> = [];

    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const rows = await this.langameClient.listGuestLogs(
          params.source.baseUrl,
          params.apiKey,
          {
            page,
            pageLimit,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            guestId: params.externalGuestId,
          },
        );
        pagesChecked += 1;
        rowsChecked += rows.length;

        for (const row of rows) {
          const debugRow = this.guestGameDebugGuestLog(
            row,
            session,
            params.externalGuestId,
          );

          if (
            candidateRows.length < 8 &&
            (debugRow.guestMatches ||
              debugRow.storeMatches ||
              debugRow.looksLikePacketOrSubscription)
          ) {
            candidateRows.push(debugRow);
          }

          if (
            this.isPacketHoursGuestLogForSession(
              row,
              session,
              params.externalGuestId,
            )
          ) {
            this.logGuestGameDebug('live-packet-guest-log-match', {
              apiSource: this.guestGameDebugSource(params.source),
              externalGuestId: params.externalGuestId,
              dateRange,
              page,
              pagesChecked,
              rowsChecked,
              session: this.guestGameDebugSession(session),
              guestLog: debugRow,
            });
            return true;
          }
        }

        if (rows.length < pageLimit) {
          break;
        }
      }
    } catch (error) {
      this.logGuestGameDebug(
        'live-packet-guest-log-failed',
        {
          apiSource: this.guestGameDebugSource(params.source),
          externalGuestId: params.externalGuestId,
          dateRange,
          pagesChecked,
          rowsChecked,
          session: this.guestGameDebugSession(session),
          error: this.checkInErrorMessage(error),
        },
        'warn',
      );
      return false;
    }

    this.logGuestGameDebug(
      'live-packet-guest-log-not-found',
      {
        apiSource: this.guestGameDebugSource(params.source),
        externalGuestId: params.externalGuestId,
        dateRange,
        pagesChecked,
        rowsChecked,
        session: this.guestGameDebugSession(session),
        candidateRows,
      },
      'warn',
    );

    return false;
  }

  private checkInSessionTransactionPeriod(session: CheckInLiveSession) {
    const startedAt = session.startedAt ?? new Date();
    const from = new Date(startedAt);
    from.setUTCDate(from.getUTCDate() - 1);

    return {
      dateFrom: this.checkInDateParam(from),
      dateTo: this.checkInDateParam(new Date()),
    };
  }

  private isPacketHoursTransactionForSession(
    row: LangameTransaction,
    session: CheckInLiveSession,
    externalGuestId: string,
  ) {
    if (!this.checkInTransactionGuestMatches(row, externalGuestId)) {
      return false;
    }

    if (!this.checkInTransactionLooksLikePacketHours(row)) {
      return false;
    }

    if (this.checkInTransactionSessionOrStoreMatches(row, session)) {
      return true;
    }

    const transactionClubId = this.checkInScalar(
      row.club_id ?? row.list_clubs_id,
    );

    return Boolean(
      !transactionClubId &&
      this.checkInTransactionIsInSessionWindow(row, session),
    );
  }

  private checkInTransactionGuestMatches(
    row: LangameTransaction,
    externalGuestId: string,
  ) {
    return [row.real_guest_id, row.guest_id].some(
      (value) => this.checkInScalar(value) === externalGuestId,
    );
  }

  private checkInTransactionSessionOrStoreMatches(
    row: LangameTransaction,
    session: CheckInLiveSession,
  ) {
    const transactionSessionId = this.checkInScalar(row.session_id);
    const transactionClubId = this.checkInScalar(
      row.club_id ?? row.list_clubs_id,
    );

    if (
      transactionSessionId &&
      session.externalSessionId &&
      transactionSessionId === session.externalSessionId
    ) {
      return true;
    }

    return Boolean(
      transactionClubId &&
      session.externalClubId &&
      transactionClubId === session.externalClubId &&
      this.checkInTransactionIsInSessionWindow(row, session),
    );
  }

  private checkInTransactionIsInSessionWindow(
    row: LangameTransaction,
    session: CheckInLiveSession,
  ) {
    if (!session.startedAt) {
      return false;
    }

    const happenedAt = this.parseCheckInLangameDate(
      this.checkInTransactionDate(row),
      session.store?.timeZone ?? null,
    );

    if (!happenedAt) {
      return false;
    }

    return happenedAt.getTime() >= session.startedAt.getTime() - 15 * 60_000;
  }

  private checkInTransactionDate(row: LangameTransaction) {
    return this.checkInScalar(
      row.date ??
        row.date_normal ??
        row.date_insert ??
        row.created_at ??
        row.created ??
        row.time ??
        row.datetime ??
        row.date_update,
    );
  }

  private checkInTransactionLooksLikePacketHours(row: LangameTransaction) {
    return this.checkInRecordLooksLikePacketHours(row);
  }

  private isPacketHoursGuestLogForSession(
    row: LangameGuestLog,
    session: CheckInLiveSession,
    externalGuestId: string,
  ) {
    return (
      this.checkInGuestLogGuestMatches(row, externalGuestId) &&
      this.checkInGuestLogStoreMatches(row, session) &&
      this.checkInGuestLogIsInSessionWindow(row, session) &&
      this.checkInGuestLogLooksLikePacketHours(row)
    );
  }

  private checkInGuestLogGuestMatches(
    row: LangameGuestLog,
    externalGuestId: string,
  ) {
    const record = row;

    return [
      row.guest_id,
      record.real_guest_id,
      record.guest,
      record.guestId,
    ].some((value) => this.checkInScalar(value) === externalGuestId);
  }

  private checkInGuestLogStoreMatches(
    row: LangameGuestLog,
    session: CheckInLiveSession,
  ) {
    const record = row;
    const logClubId = this.checkInScalar(
      record.club_id ?? record.list_clubs_id,
    );

    if (!logClubId || !session.externalClubId) {
      return true;
    }

    return logClubId === session.externalClubId;
  }

  private checkInGuestLogDate(row: LangameGuestLog) {
    const record = row;

    return this.checkInScalar(
      row.date ??
        record.date_normal ??
        record.date_insert ??
        record.created_at ??
        record.created ??
        record.time ??
        record.datetime ??
        record.date_update,
    );
  }

  private checkInGuestLogIsInSessionWindow(
    row: LangameGuestLog,
    session: CheckInLiveSession,
  ) {
    if (!session.startedAt) {
      return false;
    }

    const happenedAt = this.parseCheckInLangameDate(
      this.checkInGuestLogDate(row),
      session.store?.timeZone ?? null,
    );

    if (!happenedAt) {
      return false;
    }

    const startedAtMs = session.startedAt.getTime();
    const durationMs = Math.max(session.durationMinutes ?? 0, 0) * 60_000;
    const toleranceMs = 15 * 60_000;
    const lowerBound = startedAtMs - toleranceMs;
    const upperBound = startedAtMs + Math.max(durationMs, toleranceMs);

    return (
      happenedAt.getTime() >= lowerBound &&
      happenedAt.getTime() <= upperBound + toleranceMs
    );
  }

  private checkInGuestLogLooksLikePacketHours(row: LangameGuestLog) {
    return this.checkInRecordLooksLikePacketHours(row);
  }

  private checkInSessionLooksLikePacketHours(row: LangameGuestSession) {
    return this.checkInRecordLooksLikePacketHours(row);
  }

  private checkInRecordLooksLikePacketHours(record: Record<string, unknown>) {
    const text = this.checkInPacketMarkerText(record).toLowerCase();

    if (!text) {
      return false;
    }

    const hasStrongPacketHoursMarker =
      text.includes('packet_hours') ||
      text.includes('package_hours') ||
      text.includes('count_hours') ||
      text.includes('пакет часов') ||
      text === 'packet';
    const hasPacketMarker =
      text.includes('packet') ||
      text.includes('package') ||
      text.includes('count_hours') ||
      text.includes('count hours') ||
      text.includes('hours package') ||
      text.includes('package hours') ||
      text.includes('пакет');
    const hasHoursMarker =
      text.includes('hour') ||
      text.includes('hours') ||
      text.includes('час') ||
      text.includes('часа') ||
      text.includes('часов');
    const hasSubscriptionMarker =
      text.includes('subscription') ||
      text.includes('membership') ||
      text.includes('abonement') ||
      text.includes('abonnement') ||
      text.includes('абонемент');
    const hasTariffHoursMarker =
      /(?:tariff|тариф)[\s\S]{0,80}\d+\s*(?:hour|hours|час|часа|часов)/i.test(
        text,
      );
    const hasPrepaidMarker =
      text.includes('prepaid') || text.includes('предоплат');
    const hasCancellationMarker =
      text.includes('refund') ||
      text.includes('cancel') ||
      text.includes('возврат') ||
      text.includes('отмена');

    return (
      !hasCancellationMarker &&
      (hasStrongPacketHoursMarker ||
        (hasPacketMarker && hasHoursMarker) ||
        hasSubscriptionMarker ||
        hasTariffHoursMarker ||
        hasPrepaidMarker)
    );
  }

  private checkInPacketMarkerText(record: Record<string, unknown>) {
    return [
      record.type,
      record.comment,
      record.name,
      record.title,
      record.description,
      record.operation_type,
      record.operation_name,
      record.tariff,
      record.tarif,
      record.tariff_name,
      record.tarif_name,
      record.tariff_title,
      record.tarif_title,
      record.tariff_type,
      record.tarif_type,
      record.tariff_group,
      record.tarif_group,
      record.text,
      record.message,
    ]
      .map((value) => this.checkInScalar(value))
      .filter(Boolean)
      .join(' | ');
  }

  private checkInGuestSearchRows(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(isRecord);
    }

    if (!isRecord(payload)) {
      return [];
    }

    if (this.checkInLooksLikeGuestSearchRow(payload)) {
      return [payload];
    }

    for (const key of ['data', 'guests', 'items', 'results', 'result']) {
      const value = payload[key];

      if (Array.isArray(value)) {
        return value.filter(isRecord);
      }

      if (isRecord(value) && this.checkInLooksLikeGuestSearchRow(value)) {
        return [value];
      }
    }

    return [];
  }

  private checkInLooksLikeGuestSearchRow(row: Record<string, unknown>) {
    return Boolean(
      row.guest_id ??
      row.real_guest_id ??
      row.id ??
      row.phone ??
      row.email ??
      row.fio,
    );
  }

  private async findCheckInSessionInSource(params: {
    tenantId?: string;
    apiKey: string;
    source: { id: string; domain: string; baseUrl: string };
    externalGuestId: string;
    period: { dateFrom: string; dateTo: string };
    timeoutMs?: number;
    expectedStore?: CheckInExpectedStore | null;
  }): Promise<CheckInLiveSession | null> {
    const pageLimit = 200;
    const maxPages = 5;
    const candidates: CheckInLiveSession[] = [];
    const tariffTypeGroups = await this.resolveLangameTariffTypeGroups(
      params.source.baseUrl,
      params.apiKey,
    );

    for (let page = 1; page <= maxPages; page += 1) {
      const rows = await this.langameClient.listGuestSessions(
        params.source.baseUrl,
        params.apiKey,
        {
          page,
          pageLimit,
          dateFrom: params.period.dateFrom,
          dateTo: params.period.dateTo,
        },
        { timeoutMs: params.timeoutMs },
      );

      for (const row of rows) {
        if (
          this.checkInSessionGuestIdMatches(row, params.externalGuestId) &&
          this.isOpenCheckInSessionStop(row.date_stop)
        ) {
          const externalClubId = this.checkInScalar(
            row.club_id ?? row.list_clubs_id,
          );

          if (
            !this.checkInSessionMatchesExpectedStore(
              params.source,
              externalClubId,
              params.expectedStore ?? null,
            )
          ) {
            continue;
          }

          const store = params.tenantId
            ? await this.resolveCheckInStore(
                params.tenantId,
                params.source.id,
                params.source.domain,
                externalClubId,
                params.expectedStore ?? null,
              )
            : null;

          if (params.expectedStore && !store) {
            continue;
          }

          const session = this.toCheckInLiveSession(
            params.source.domain,
            row,
            store?.timeZone ?? null,
            tariffTypeGroups,
          );

          if (session.externalSessionId) {
            candidates.push({
              ...session,
              externalClubId:
                nullableString(session.externalClubId) ??
                nullableString(params.expectedStore?.externalClubId) ??
                null,
              store: store
                ? { id: store.id, name: store.name, timeZone: store.timeZone }
                : null,
            });
          }
        }
      }

      if (rows.length < pageLimit) {
        break;
      }
    }

    return (
      candidates.sort(
        (left, right) =>
          (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0),
      )[0] ?? null
    );
  }

  private toCheckInLiveSession(
    externalDomain: string,
    row: LangameGuestSession,
    timeZone?: string | null,
    tariffTypeGroups: LangameTariffTypeGroupIndex = new Map(),
  ): CheckInLiveSession {
    const startedAt = this.parseCheckInLangameDate(
      this.checkInScalar(row.date_start),
      timeZone,
    );
    const tariff = resolveLangameSessionTariff(row.packet, tariffTypeGroups);
    const billingKind =
      tariff.kind === 'unknown' && this.checkInSessionLooksLikePacketHours(row)
        ? 'package_or_subscription'
        : tariff.kind;
    const sessionBillingResolvedBy =
      tariff.kind !== 'unknown' && tariff.tariffType
        ? 'tariff_type_group'
        : tariff.kind !== 'unknown'
          ? 'session_marker'
          : billingKind === 'package_or_subscription'
            ? 'session_text'
            : 'unknown';
    const packet =
      billingKind === 'package_or_subscription'
        ? true
        : billingKind === 'hourly'
          ? false
          : null;

    return {
      externalDomain,
      externalSessionId: this.checkInScalar(row.id) ?? '',
      externalGuestId: this.checkInSessionExternalGuestId(row),
      externalClubId: this.checkInScalar(row.club_id ?? row.list_clubs_id),
      externalUuid: this.checkInScalar(row.UUID),
      startedAt,
      durationMinutes: this.checkInDurationMinutes(startedAt),
      sessionType:
        billingKind === 'package_or_subscription'
          ? 'packet_hours'
          : billingKind === 'hourly'
            ? 'regular_session'
            : 'unknown_session',
      sessionPacket: packet,
      sessionBillingResolvedBy,
      store: null,
      raw: row,
    };
  }

  private async resolveLangameTariffTypeGroups(
    baseUrl: string,
    apiKey: string,
  ): Promise<LangameTariffTypeGroupIndex> {
    const key = baseUrl.trim().toLowerCase();
    const cached = this.tariffTypeGroupCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.index;
    }

    try {
      const rows = await this.langameClient.listTariffTypeGroups(
        baseUrl,
        apiKey,
      );
      const index = buildLangameTariffTypeGroupIndex(rows);
      this.tariffTypeGroupCache.set(key, {
        index,
        expiresAt: Date.now() + LANGAME_TARIFF_TYPE_GROUP_CACHE_MS,
      });
      return index;
    } catch (error) {
      this.logger.warn(
        `[guest-game-debug:tariff-type-groups-unavailable] ${guestGamificationDebugJson(
          {
            source: this.guestGameDebugSource({ baseUrl }),
            error: error instanceof Error ? error.message : String(error),
          },
        )}`,
      );
      return new Map();
    }
  }

  private checkInSessionMatchesExpectedStore(
    source: { id: string; domain: string },
    externalClubId: string | null,
    expectedStore: CheckInExpectedStore | null,
  ) {
    if (!expectedStore) {
      return true;
    }

    const expectedSourceId = nullableString(expectedStore.integrationSourceId);
    const expectedDomain = nullableString(expectedStore.externalDomain);
    const expectedClubId = nullableString(expectedStore.externalClubId);

    if (expectedSourceId && source.id !== expectedSourceId && !expectedDomain) {
      return false;
    }

    if (expectedDomain && source.domain !== expectedDomain) {
      return false;
    }

    if (
      (expectedDomain && source.domain === expectedDomain) ||
      (expectedSourceId && source.id === expectedSourceId)
    ) {
      return true;
    }

    if (expectedClubId && externalClubId) {
      return externalClubId === expectedClubId;
    }

    if (expectedClubId && !externalClubId) {
      return Boolean(expectedSourceId || expectedDomain);
    }

    return true;
  }

  private async findCachedCheckInSession(
    tenantId: string,
    guest: {
      externalDomain: string | null;
      externalGuestId: string;
      currentCountHours?: Prisma.Decimal | number | string | null;
    },
    expectedStore: CheckInExpectedStore | null,
  ): Promise<CheckInLiveSession | null> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 2);
    const expectedDomain = nullableString(expectedStore?.externalDomain);
    const expectedStoreId = nullableId(expectedStore?.id);
    const expectedClubId = nullableString(expectedStore?.externalClubId);
    const cachedExternalDomain =
      expectedDomain ?? nullableString(guest.externalDomain);
    const expectedScope = expectedDomain
      ? null
      : expectedStoreId || expectedClubId
        ? {
            OR: [
              ...(expectedStoreId ? [{ storeId: expectedStoreId }] : []),
              ...(expectedClubId ? [{ externalClubId: expectedClubId }] : []),
            ],
          }
        : null;

    const row = await this.prisma.guestSession.findFirst({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalGuestId: guest.externalGuestId,
        ...(cachedExternalDomain
          ? { externalDomain: cachedExternalDomain }
          : {}),
        stoppedAt: null,
        AND: [
          { OR: [{ startedAt: null }, { startedAt: { gte: since } }] },
          ...(expectedScope ? [expectedScope] : []),
        ],
      },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        externalDomain: true,
        externalSessionId: true,
        externalGuestId: true,
        externalClubId: true,
        externalUuid: true,
        startedAt: true,
        durationMinutes: true,
        packet: true,
        store: { select: { id: true, name: true, timeZone: true } },
      },
    });

    if (!row?.externalSessionId) {
      return null;
    }

    const store = expectedStore
      ? {
          id: expectedStore.id,
          name: expectedStore.name,
          timeZone: expectedStore.timeZone,
        }
      : row.store;
    const resolvedExternalClubId =
      nullableString(row.externalClubId) ??
      nullableString(expectedStore?.externalClubId) ??
      null;
    const rawSession = {
      id: row.externalSessionId,
      guest_id: row.externalGuestId ?? guest.externalGuestId,
      date_start: row.startedAt?.toISOString() ?? null,
      date_stop: null,
      UUID: row.externalUuid,
      packet: row.packet,
      list_clubs_id: resolvedExternalClubId,
    };
    const sessionPacket =
      row.packet === true || this.guestHasCurrentPacketHours(guest)
        ? true
        : this.checkInSessionLooksLikePacketHours(rawSession)
          ? true
          : row.packet;

    return {
      externalDomain: row.externalDomain ?? guest.externalDomain ?? '',
      externalSessionId: row.externalSessionId,
      externalGuestId: row.externalGuestId ?? guest.externalGuestId,
      externalClubId: resolvedExternalClubId,
      externalUuid: row.externalUuid,
      startedAt: row.startedAt,
      durationMinutes: row.durationMinutes,
      sessionType: sessionPacket ? 'packet_hours' : 'regular_session',
      sessionPacket,
      sessionBillingResolvedBy: 'unknown',
      store,
      raw: { ...rawSession, packet: sessionPacket },
    };
  }

  private resolveCheckInSessionTypeFromGuestBalance(
    session: CheckInLiveSession,
    guest: { currentCountHours?: Prisma.Decimal | number | string | null },
  ): CheckInLiveSession {
    if (
      session.sessionBillingResolvedBy === 'tariff_type_group' ||
      session.sessionPacket === true ||
      !this.guestHasCurrentPacketHours(guest)
    ) {
      return session;
    }

    return this.markCheckInSessionAsPacket(session);
  }

  private markCheckInSessionAsPacket(
    session: CheckInLiveSession,
  ): CheckInLiveSession {
    return {
      ...session,
      sessionType: 'packet_hours',
      sessionPacket: true,
      sessionBillingResolvedBy:
        session.sessionBillingResolvedBy === 'unknown'
          ? 'session_text'
          : session.sessionBillingResolvedBy,
      raw: {
        ...session.raw,
        packet: true,
      },
    };
  }

  private guestHasCurrentPacketHours(guest: {
    currentCountHours?: Prisma.Decimal | number | string | null;
  }): boolean {
    const currentCountHours = guest.currentCountHours;

    if (currentCountHours == null) {
      return false;
    }

    const value = Number(currentCountHours);

    return Number.isFinite(value) && value > 0;
  }

  private guestHasExplicitZeroPacketHours(guest: {
    currentCountHours?: Prisma.Decimal | number | string | null;
  }): boolean {
    const currentCountHours = guest.currentCountHours;

    if (currentCountHours == null) {
      return false;
    }

    if (typeof currentCountHours === 'string' && !currentCountHours.trim()) {
      return false;
    }

    const value = Number(currentCountHours);

    return Number.isFinite(value) && value <= 0;
  }

  private checkInSessionGuestIdMatches(
    row: LangameGuestSession,
    externalGuestId: string,
  ) {
    return this.checkInSessionExternalGuestIds(row).includes(externalGuestId);
  }

  private async assertCheckInAvailableToday(
    user: AuthenticatedUser,
    params: {
      guestId: string;
      storeId: string;
      externalDomain?: string | null;
      checkedAt: Date;
      timeZone?: string | null;
    },
  ) {
    const existing = await this.findCheckInEventInLocalDay(user, params);

    if (existing) {
      throw new BadRequestException(
        'Чекин в этом клубе уже был сделан сегодня. Повторить можно завтра после 00:01 по времени клуба.',
      );
    }
  }

  private async findCheckInEventInLocalDay(
    user: AuthenticatedUser,
    params: {
      guestId: string;
      storeId: string;
      externalDomain?: string | null;
      checkedAt: Date;
      timeZone?: string | null;
    },
  ): Promise<{ occurredAt: Date } | null> {
    const day = this.checkInLocalDayWindow(params.checkedAt, params.timeZone);
    const externalDomain = nullableString(params.externalDomain);
    const rows = await this.prisma.guestGameEvent.findMany({
      where: {
        tenantId: user.tenantId,
        guestId: params.guestId,
        eventType: 'CHECK_IN',
        ...(externalDomain ? { externalDomain } : {}),
        occurredAt: {
          gte: day.from,
          lt: day.to,
        },
      },
      select: {
        occurredAt: true,
        externalDomain: true,
        payload: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return (
      rows.find((row) =>
        externalDomain
          ? nullableString(row.externalDomain) === externalDomain
          : this.checkInEventStoreId(row.payload) === params.storeId,
      ) ?? null
    );
  }

  private checkInEventStoreId(payloadValue: Prisma.JsonValue | null) {
    const payload = jsonRecord(payloadValue);
    const store = jsonRecord(payload.store as Prisma.JsonValue | null);
    const input = jsonRecord(payload.input as Prisma.JsonValue | null);

    return (
      nullableString(store.id) ??
      nullableString(input.storeId) ??
      nullableString(payload.storeId)
    );
  }

  private checkInLocalDayWindow(
    value: Date,
    timeZone?: string | null,
  ): { from: Date; to: Date } {
    const normalizedTimeZone = this.checkInTimeZone(timeZone);
    const localDate = this.checkInLocalDateParts(value, normalizedTimeZone);
    const fromLabel = checkInDateLabel(localDate);
    const toLabel = checkInDateLabel(checkInAddLocalDays(localDate, 1));

    return {
      from:
        parseLangameDate(`${fromLabel} 00:00:00`, normalizedTimeZone) ??
        new Date(`${fromLabel}T00:00:00.000Z`),
      to:
        parseLangameDate(`${toLabel} 00:00:00`, normalizedTimeZone) ??
        new Date(`${toLabel}T00:00:00.000Z`),
    };
  }

  private checkInLocalDateParts(value: Date, timeZone: string) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(value);
      const valueByType = new Map(parts.map((part) => [part.type, part.value]));

      return {
        year: Number(valueByType.get('year')),
        month: Number(valueByType.get('month')),
        day: Number(valueByType.get('day')),
      };
    } catch {
      return {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      };
    }
  }

  private checkInTimeZone(timeZone?: string | null) {
    const normalized = nullableString(timeZone) ?? 'UTC';

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(
        new Date(),
      );
      return normalized;
    } catch {
      return 'UTC';
    }
  }

  private checkInSessionExternalGuestId(row: LangameGuestSession) {
    return this.checkInSessionExternalGuestIds(row)[0] ?? null;
  }

  private checkInSessionExternalGuestIds(row: LangameGuestSession) {
    const record = row;
    const nestedGuest = this.checkInRecord(record.guest);
    const values = [
      record.real_guest_id,
      record.guest_id,
      nestedGuest?.real_guest_id,
      nestedGuest?.guest_id,
      nestedGuest?.id,
    ];
    const ids = new Set<string>();

    for (const value of values) {
      const id = this.checkInScalar(value);

      if (id) {
        ids.add(id);
      }
    }

    return [...ids];
  }

  private checkInRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private async resolveCheckInStore(
    tenantId: string,
    integrationSourceId: string,
    externalDomain: string,
    externalClubId: string | null,
    expectedStore: CheckInExpectedStore | null,
  ): Promise<CheckInResolvedStore | null> {
    if (expectedStore) {
      if (
        !this.checkInSessionMatchesExpectedStore(
          { id: integrationSourceId, domain: externalDomain },
          externalClubId,
          expectedStore,
        )
      ) {
        return null;
      }

      return {
        id: expectedStore.id,
        name: expectedStore.name,
        timeZone: expectedStore.timeZone,
      };
    }

    if (externalClubId) {
      const store = await this.prisma.store.findFirst({
        where: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
          externalClubId,
          isActive: true,
        },
        select: { id: true, name: true, timeZone: true },
      });

      if (store) {
        return store;
      }
    }

    const sourceStores = await this.prisma.store.findMany({
      where: { tenantId, integrationSourceId, isActive: true },
      take: 2,
      select: { id: true, name: true, timeZone: true },
    });

    if (sourceStores.length === 1) {
      return sourceStores[0];
    }

    const domainStores = await this.prisma.store.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain,
        isActive: true,
      },
      take: 2,
      select: { id: true, name: true, timeZone: true },
    });

    return domainStores.length === 1 ? domainStores[0] : null;
  }

  private checkInLookupPeriod(now: Date) {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 2);

    return {
      dateFrom: this.checkInDateParam(from),
      dateTo: this.checkInDateParam(now),
    };
  }

  private checkInDateParam(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private isOpenCheckInSessionStop(value: unknown) {
    const normalized = this.checkInScalar(value)?.toLowerCase();

    return (
      !normalized ||
      normalized === 'null' ||
      normalized === '0' ||
      normalized.startsWith('0000-00-00')
    );
  }

  private checkInScalar(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'bigint'
    ) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  private checkInBoolean(value: unknown) {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : value;

    if (
      normalized === true ||
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 1
    ) {
      return true;
    }

    if (
      normalized === false ||
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 0
    ) {
      return false;
    }

    return null;
  }

  private parseCheckInLangameDate(
    value: string | null | undefined,
    timeZone?: string | null,
  ) {
    return parseLangameDate(value, timeZone);
  }

  private checkInDurationMinutes(startedAt: Date | null) {
    if (!startedAt) {
      return null;
    }

    const minutes = Math.max(
      0,
      Math.round((Date.now() - startedAt.getTime()) / 60000),
    );

    return Number.isFinite(minutes) ? minutes : null;
  }

  private liveSessionStartStoreId(
    liveSession: CheckInLiveSession,
    expectedStore: {
      id: string;
      externalDomain: string | null;
      externalClubId: string | null;
    } | null,
  ) {
    if (!expectedStore) {
      return liveSession.store?.id ?? null;
    }

    if (liveSession.store?.id) {
      if (liveSession.store.id === expectedStore.id) {
        return expectedStore.id;
      }

      if (
        expectedStore.externalDomain &&
        liveSession.externalDomain === expectedStore.externalDomain
      ) {
        return expectedStore.id;
      }

      return null;
    }

    if (
      expectedStore.externalDomain &&
      liveSession.externalDomain === expectedStore.externalDomain
    ) {
      return expectedStore.id;
    }

    return null;
  }

  private checkInErrorMessage(error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'неизвестная ошибка';

    if (message.toLowerCase().includes('not configured')) {
      return 'интеграция Langame не настроена';
    }

    return message;
  }

  private async getTenantGuest(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guest.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        externalGuestId: true,
        externalDomain: true,
        fullNameMasked: true,
        phoneMasked: true,
        emailMasked: true,
        currentCountHours: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Гость не найден');
    }

    return row;
  }

  private async getTenantLead(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestCrmLead.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        fullNameMasked: true,
        phoneMasked: true,
        emailMasked: true,
      },
    });

    if (!row) {
      throw new NotFoundException('CRM-гость не найден');
    }

    return row;
  }
}

function mapProfile(row: ProfileRow): GuestGameProfile {
  const communication = resolveProfileCommunication(row);

  return {
    id: row.id,
    displayName:
      row.displayName ??
      row.guest?.fullNameMasked ??
      row.lead?.fullNameMasked ??
      row.guest?.externalGuestId ??
      'Игровой профиль',
    contactMasked:
      row.contactMasked ??
      row.guest?.phoneMasked ??
      row.lead?.phoneMasked ??
      row.guest?.emailMasked ??
      row.lead?.emailMasked ??
      null,
    phoneHash: row.phoneHash,
    telegramIdentity: row.telegramIdentity,
    maxIdentity: row.maxIdentity,
    xp: row.xp,
    level: row.level,
    status: row.status as ProfileStatus,
    isStaffTest: row.isStaffTest,
    staffTestReason: row.staffTestReason,
    staffTestMatchedAt: iso(row.staffTestMatchedAt),
    lastActivityAt: iso(row.lastActivityAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact:
            row.guest.phoneMasked ?? row.guest.emailMasked ?? 'нет контакта',
        }
      : null,
    lead: row.lead
      ? {
          id: row.lead.id,
          displayName: row.lead.fullNameMasked ?? 'CRM-гость',
          contact:
            row.lead.phoneMasked ?? row.lead.emailMasked ?? 'нет контакта',
          matchedGuestId: row.lead.matchedGuestId,
        }
      : null,
    communication: {
      phoneConsentStatus: communication.phoneConsentStatus,
      phoneConsentSource: communication.phoneConsentSource,
      phoneConsentAt: iso(communication.phoneConsentAt),
      unsubscribedAt: iso(communication.unsubscribedAt),
      telegramReady: Boolean(row.telegramIdentity),
      maxReady: Boolean(row.maxIdentity),
      botReady:
        communication.phoneConsentStatus === 'GRANTED' &&
        Boolean(row.telegramIdentity || row.maxIdentity),
    },
    createdBy: mapUser(row.createdByUser),
  };
}

type ProfileCommunicationConsent = {
  phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
  phoneConsentSource: string | null;
  phoneConsentAt: Date | null;
  unsubscribedAt: Date | null;
};

function resolveProfileCommunication(
  row: ProfileRow,
): ProfileCommunicationConsent {
  const sources: ProfileCommunicationConsent[] = [
    ...(row.guest
      ? [
          {
            phoneConsentStatus: row.guest.phoneConsentStatus,
            phoneConsentSource: row.guest.phoneConsentSource,
            phoneConsentAt: row.guest.phoneConsentAt,
            unsubscribedAt: row.guest.unsubscribedAt,
          },
        ]
      : []),
    ...(row.lead
      ? [
          {
            phoneConsentStatus: row.lead.phoneConsentStatus,
            phoneConsentSource: row.lead.phoneConsentSource,
            phoneConsentAt: row.lead.phoneConsentAt,
            unsubscribedAt: row.lead.unsubscribedAt,
          },
        ]
      : []),
    {
      phoneConsentStatus: row.phoneConsentStatus,
      phoneConsentSource: row.phoneConsentSource,
      phoneConsentAt: row.phoneConsentAt,
      unsubscribedAt: row.unsubscribedAt,
    },
  ];

  const selected = sources
    .filter(
      (source) =>
        source.phoneConsentStatus !== 'UNKNOWN' ||
        Boolean(source.phoneConsentAt || source.unsubscribedAt),
    )
    .sort(
      (left, right) =>
        profileConsentTimestamp(right) - profileConsentTimestamp(left),
    )[0];

  if (selected) {
    return {
      ...selected,
      phoneConsentStatus: selected.unsubscribedAt
        ? 'UNSUBSCRIBED'
        : selected.phoneConsentStatus,
    };
  }

  return {
    phoneConsentStatus: 'UNKNOWN',
    phoneConsentSource: null,
    phoneConsentAt: null,
    unsubscribedAt: null,
  };
}

function profileConsentTimestamp(source: ProfileCommunicationConsent) {
  const datedAt = source.unsubscribedAt ?? source.phoneConsentAt;

  if (datedAt) {
    return datedAt.getTime();
  }

  return source.phoneConsentStatus === 'UNKNOWN' ? 0 : 1;
}

const gameRegistrationConsentSources = new Set([
  'guest_portal_game_consent',
  'telegram_auth_contact_share',
  'guest_portal_club_selection',
  'guest_portal',
  'telegram_bot',
]);

function isRegisteredGameProfile(profile: GuestGameProfile) {
  if (profile.status === 'ARCHIVED' || !profile.phoneHash) {
    return false;
  }

  const consent = profile.communication;
  const hasRegistrationDate = Boolean(
    consent.phoneConsentAt || consent.unsubscribedAt,
  );

  if (!hasRegistrationDate || consent.phoneConsentStatus === 'DENIED') {
    return false;
  }

  const source = consent.phoneConsentSource ?? '';
  if (gameRegistrationConsentSources.has(source)) {
    return true;
  }

  return !profile.createdBy && consent.phoneConsentStatus === 'GRANTED';
}

function lootBoxUsageKind(
  value: string | null | undefined,
): GuestGameLootBoxUsageKind {
  return enumValue(value, lootBoxUsageKindValues, 'STANDALONE') ?? 'STANDALONE';
}

function lootBoxVisibleInCatalog(rule: { usageKind?: string | null }) {
  const usageKind = lootBoxUsageKind(rule.usageKind);

  return usageKind === 'STANDALONE' || usageKind === 'BOTH';
}

function mapLootBox(row: LootBoxRow): GuestGameLootBox {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    usageKind: lootBoxUsageKind(row.usageKind),
    triggerKind: row.triggerKind,
    rewardType: row.rewardType,
    rewardAmount: numberOrNull(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    segment: row.segment,
    sessionType: row.sessionType,
    storeIds: stringArray(row.storeIds),
    periodRules: row.periodRules,
    limits: row.limits,
    probabilityRules: row.probabilityRules,
    budgetAmount: numberOrNull(row.budgetAmount),
    antiFraudRules: row.antiFraudRules,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapMission(row: MissionRow): GuestGameMission {
  const rawConditions = jsonRecord(row.conditions);
  const effectiveTaskType = missionTaskTypeFromConditions(
    rawConditions,
    row.missionType,
  );
  const effectiveMissionType = effectiveTaskType ?? row.missionType;
  const conditions =
    effectiveTaskType === 'BALANCE_TOPUP'
      ? normalizeMissionWizardConditions({
          taskType: 'BALANCE_TOPUP',
          conditions: rawConditions,
        })
      : rawConditions;
  const metric = jsonRecord(conditions.metric as Prisma.JsonValue | null);
  const effectiveProgressTarget =
    positiveMissionNumber(metric.target) ?? row.progressTarget;
  const effectiveProgressUnit = nullableString(metric.unit) ?? row.progressUnit;

  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    missionType: effectiveMissionType,
    triggerKind: effectiveTaskType
      ? missionWizardTrigger(effectiveTaskType)
      : row.triggerKind,
    rewardType: row.rewardType,
    rewardAmount: numberOrNull(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressTarget: effectiveProgressTarget,
    progressUnit: effectiveProgressUnit,
    conditions: conditions as Prisma.JsonValue,
    storeIds: stringArray(row.storeIds),
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    budgetAmount: numberOrNull(row.budgetAmount),
    perGuestLimit: row.perGuestLimit,
    totalRewardLimit: row.totalRewardLimit,
    antiFraudRules: row.antiFraudRules,
    manualApprovalRequired: row.manualApprovalRequired,
    definitionVersion: row.definitionVersion,
    evaluationPolicy: row.evaluationPolicy,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function missionRowToWizardDto(row: MissionRow): GuestGameMissionWizardDto {
  const conditions = jsonRecord(row.conditions);
  const reward = jsonRecord(conditions.reward ?? null);
  const embeddedRewardType = wizardRewardType(reward.type);
  const useEmbeddedRewardReference = embeddedRewardType === row.rewardType;
  return {
    name: row.name,
    status: row.status,
    taskType:
      nullableString(conditions.taskType) ?? row.missionType ?? 'PLAY_TIME',
    visibility: nullableString(conditions.visibility) ?? 'VISIBLE',
    audienceId: row.audienceId,
    storeIds: guestGameStringArray(row.storeIds),
    indefinite: conditions.indefinite === true,
    periodFrom: row.periodFrom?.toISOString() ?? null,
    periodTo: row.periodTo?.toISOString() ?? null,
    conditions,
    reward: {
      ...reward,
      type: row.rewardType,
      amount: numberOrNull(row.rewardAmount),
      label: row.rewardLabel,
      lootBoxId: useEmbeddedRewardReference ? reward.lootBoxId : null,
      promoCodeId: useEmbeddedRewardReference ? reward.promoCodeId : null,
      xpEnabled: row.xpReward > 0,
      xpAmount: row.xpReward,
      perGuestLimit: row.perGuestLimit,
      perGuestLimitUnlimited: row.perGuestLimit === null,
      totalRewardLimit: row.totalRewardLimit,
      budgetAmount: numberOrNull(row.budgetAmount),
      budgetUnlimited: row.budgetAmount === null,
      delivery: row.manualApprovalRequired ? 'ADMIN_APPROVAL' : 'AUTOMATIC',
    },
    appearance: jsonRecord(conditions.presentation ?? null),
    note: row.note,
  };
}

function legacyMissionWizardDefinition(row: MissionRow): {
  taskType: GuestGameMissionTaskType;
  definition: GuestGameMissionWizardDto;
} {
  const source = jsonRecord(row.conditions);
  const metric = jsonRecord(source.metric as Prisma.JsonValue | null);
  const taskType = legacyMissionTaskType(row, source, metric);

  if (!taskType) {
    throw new BadRequestException(
      'Тип условия этого задания не поддерживается мастером. Перенесите его вручную после настройки подходящего сценария.',
    );
  }

  const reward = jsonRecord(source.reward as Prisma.JsonValue | null);
  const presentation = jsonRecord(
    source.presentation as Prisma.JsonValue | null,
  );
  const rewardType = wizardRewardType(row.rewardType);
  const sessionType = legacyMissionSessionType(source.sessionType);
  const target =
    positiveMissionNumber(metric.target) ??
    positiveMissionNumber(row.progressTarget) ??
    1;
  const normalizedMetric = legacyMissionWizardMetric(
    taskType,
    source,
    metric,
    target,
    row.progressUnit,
  );
  const indefinite =
    source.indefinite === true && !row.periodFrom && !row.periodTo
      ? true
      : !row.periodFrom && !row.periodTo;

  return {
    taskType,
    definition: {
      name: row.name,
      status: row.status,
      taskType,
      visibility:
        nullableString(source.visibility)?.toUpperCase() === 'HIDDEN'
          ? 'HIDDEN'
          : 'VISIBLE',
      audienceId: row.audienceId,
      storeIds: guestGameStringArray(row.storeIds),
      indefinite,
      periodFrom: row.periodFrom?.toISOString() ?? null,
      periodTo: row.periodTo?.toISOString() ?? null,
      conditions: {
        ...source,
        sessionType,
        metric: normalizedMetric,
      },
      reward: {
        ...reward,
        type: rewardType,
        amount: wizardRewardAmount(rewardType, row.rewardAmount),
        label: row.rewardLabel,
        xpEnabled: row.xpReward > 0,
        xpAmount: row.xpReward,
        perGuestLimit: row.perGuestLimit,
        perGuestLimitUnlimited: row.perGuestLimit === null,
        totalRewardLimit: row.totalRewardLimit,
        budgetAmount: numberOrNull(row.budgetAmount),
        budgetUnlimited: row.budgetAmount === null,
        delivery: row.manualApprovalRequired ? 'ADMIN_APPROVAL' : 'AUTOMATIC',
        periodicity: legacyMissionPeriodicity(source, reward),
      },
      appearance: {
        ...presentation,
        description:
          nullableString(presentation.description) ??
          nullableString(source.description),
        actionText:
          nullableString(presentation.actionText) ??
          nullableString(source.actionText),
        theme: nullableString(presentation.theme) ?? 'CLASSIC',
        icon: nullableString(presentation.icon) ?? nullableString(source.icon),
        coverUrl:
          nullableString(presentation.coverUrl) ??
          nullableString(source.coverUrl),
      },
      note: row.note,
    },
  };
}

function legacyMissionTaskType(
  row: MissionRow,
  source: Record<string, unknown>,
  metric: Record<string, unknown>,
): GuestGameMissionTaskType | null {
  const candidates = [
    source.taskType,
    ...guestGameStringArray(metric.eventTypes),
    row.missionType,
    row.triggerKind,
  ];

  for (const candidate of candidates) {
    const value = nullableString(candidate)?.toUpperCase();
    if (!value) continue;
    if (value === 'APP_OPEN') return 'APP_OPEN';
    if (['PLAY_TIME', 'PLAY_HOUR', 'SESSION_STOP'].includes(value)) {
      return 'PLAY_TIME';
    }
    if (['PRODUCT_PURCHASE', 'BAR_PURCHASE', 'PURCHASE'].includes(value)) {
      return 'PRODUCT_PURCHASE';
    }
    if (['BALANCE_TOPUP', 'BALANCE_TOP_UP'].includes(value)) {
      return 'BALANCE_TOPUP';
    }
    if (['CHECK_IN', 'CHECKIN'].includes(value)) return 'CHECK_IN';
  }

  return null;
}

function legacyMissionSessionType(value: unknown) {
  const normalized = nullableString(value)?.toUpperCase();
  if (
    [
      'PACKAGE_OR_SUBSCRIPTION',
      'PACKAGE',
      'PACKET',
      'PACKET_HOURS',
      'SUBSCRIPTION',
      'MEMBERSHIP',
      'ABONEMENT',
      'ABONNEMENT',
    ].includes(normalized ?? '')
  ) {
    return 'PACKAGE_OR_SUBSCRIPTION';
  }
  if (
    ['HOURLY', 'REGULAR', 'REGULAR_SESSION', 'COMMON', 'DEFAULT'].includes(
      normalized ?? '',
    )
  ) {
    return 'HOURLY';
  }
  return 'ANY';
}

function legacyMissionWizardMetric(
  taskType: GuestGameMissionTaskType,
  source: Record<string, unknown>,
  metric: Record<string, unknown>,
  target: number,
  progressUnit: string | null,
) {
  const base = {
    ...metric,
    unit: nullableString(metric.unit) ?? progressUnit ?? 'шаг',
    windowDays:
      positiveMissionNumber(metric.windowDays) ??
      positiveMissionNumber(source.windowDays) ??
      undefined,
    weekdays: guestGameStringArray(metric.weekdays),
    hours: guestGameStringArray(metric.hours),
  };

  if (taskType === 'APP_OPEN') {
    return {
      eventTypes: ['APP_OPEN'],
      aggregation: 'exists',
      target: 1,
      unit: 'вход',
    };
  }

  if (taskType === 'PLAY_TIME') {
    return {
      ...base,
      eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
      aggregation: 'duration',
      target,
      unit: nullableString(metric.unit) ?? progressUnit ?? 'минуты',
      minSessionMinutes:
        positiveMissionNumber(metric.minSessionMinutes) ??
        positiveMissionNumber(source.minSessionMinutes) ??
        undefined,
    };
  }

  if (taskType === 'PRODUCT_PURCHASE') {
    const purchaseSource =
      nullableString(source.purchaseSource)?.toUpperCase() === 'CATEGORY'
        ? 'CATEGORY'
        : 'PRODUCT';
    const productMatch =
      nullableString(metric.productMatch)?.toUpperCase() === 'ALL'
        ? 'ALL'
        : 'ANY';
    const legacyMinimumAmount =
      positiveMissionNumber(metric.minSpendAmount) ??
      positiveMissionNumber(metric.exactSpendAmount) ??
      positiveMissionNumber(metric.amount);
    const aggregation = nullableString(metric.aggregation)?.toLowerCase();
    const amountMode =
      nullableString(metric.amountMode)?.toUpperCase() === 'PERIOD_TOTAL'
        ? 'PERIOD_TOTAL'
        : nullableString(metric.amountMode)?.toUpperCase() === 'SINGLE_MINIMUM'
          ? 'SINGLE_MINIMUM'
          : aggregation === 'sum'
            ? 'PERIOD_TOTAL'
            : legacyMinimumAmount
              ? 'SINGLE_MINIMUM'
              : 'NONE';
    return {
      ...base,
      eventTypes: ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
      aggregation: amountMode === 'PERIOD_TOTAL' ? 'sum' : 'count',
      target,
      purchaseSource,
      categoryCatalogSource:
        purchaseSource === 'CATEGORY'
          ? (nullableString(source.categoryCatalogSource) ?? 'LANGAME')
          : null,
      productMatch,
      amountMode,
      minSpendAmount:
        amountMode === 'NONE' ? undefined : (legacyMinimumAmount ?? undefined),
      productIds:
        purchaseSource === 'PRODUCT'
          ? guestGameStringArray(metric.productIds)
          : [],
      externalProductIds:
        purchaseSource === 'PRODUCT'
          ? guestGameStringArray(metric.externalProductIds)
          : [],
      categoryIds:
        purchaseSource === 'CATEGORY'
          ? guestGameStringArray(metric.categoryIds)
          : [],
      externalCategoryKeys:
        purchaseSource === 'CATEGORY'
          ? guestGameStringArray(metric.externalCategoryKeys)
          : [],
    };
  }

  if (taskType === 'BALANCE_TOPUP') {
    const aggregation = nullableString(metric.aggregation)?.toLowerCase();
    const topupMode =
      nullableString(metric.topupMode)?.toUpperCase() === 'PERIOD_TOTAL' ||
      aggregation === 'sum'
        ? 'PERIOD_TOTAL'
        : nullableString(metric.topupMode)?.toUpperCase() === 'COUNT' ||
            target > 1
          ? 'COUNT'
          : 'SINGLE';
    const amountComparison =
      metric.exactSpendAmount !== undefined ||
      nullableString(metric.amountComparison)?.toUpperCase() === 'EXACT'
        ? 'EXACT'
        : 'AT_LEAST';
    const amount =
      positiveMissionNumber(
        amountComparison === 'EXACT'
          ? metric.exactSpendAmount
          : metric.minSpendAmount,
      ) ??
      positiveMissionNumber(metric.amount) ??
      0;
    return {
      ...base,
      eventTypes: ['BALANCE_TOPUP'],
      aggregation:
        topupMode === 'PERIOD_TOTAL'
          ? 'sum'
          : topupMode === 'COUNT'
            ? 'count'
            : 'exists',
      target,
      topupMode,
      amountComparison,
      amount,
      count: topupMode === 'COUNT' ? target : undefined,
      totalAmount: topupMode === 'PERIOD_TOTAL' ? target : undefined,
    };
  }

  const aggregation = nullableString(metric.aggregation)?.toLowerCase();
  const checkInMode =
    nullableString(metric.checkInMode)?.toUpperCase() === 'STREAK' ||
    aggregation === 'streak'
      ? 'STREAK'
      : nullableString(metric.checkInMode)?.toUpperCase() === 'PERIOD'
        ? 'PERIOD'
        : target > 1
          ? 'COUNT'
          : 'SINGLE';
  return {
    ...base,
    eventTypes: ['CHECK_IN'],
    aggregation: checkInMode === 'STREAK' ? 'streak' : 'count',
    target,
    checkInMode,
    count: checkInMode === 'STREAK' ? undefined : target,
    days: checkInMode === 'STREAK' ? target : undefined,
  };
}

function legacyMissionPeriodicity(
  source: Record<string, unknown>,
  reward: Record<string, unknown>,
) {
  const value = (
    nullableString(reward.periodicity) ?? nullableString(source.periodicity)
  )?.toUpperCase();
  return ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(value ?? '')
    ? value
    : 'NONE';
}

function positiveMissionNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function wizardRewardType(value: unknown) {
  const normalized = (nullableString(value) ?? 'NONE').toUpperCase();
  const values: Record<string, string> = {
    LANGAME_BONUS: 'BONUS_BALANCE',
    BONUS: 'BONUS_BALANCE',
    LANGAME: 'BONUS_BALANCE',
    BONUS_BALANCE: 'BONUS_BALANCE',
    LOOTBOX: 'LOOT_BOX_ENTITLEMENT',
    LOOT_BOX_ENTITLEMENT: 'LOOT_BOX_ENTITLEMENT',
    PROMO: 'PROMOCODE',
    PROMOCODE: 'PROMOCODE',
    NONE: 'NONE',
  };
  return values[normalized] ?? 'NONE';
}

function wizardRewardAmount(rewardType: string, value: unknown) {
  if (['NONE', 'LOOT_BOX_ENTITLEMENT', 'PROMOCODE'].includes(rewardType)) {
    return 0;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function cleanJsonRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Prisma.InputJsonObject;
}

function mapSeason(row: SeasonRow): GuestGameSeason {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    seasonType: row.seasonType,
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    xpRules: row.xpRules,
    levels: row.levels,
    freeRewards: row.freeRewards,
    premiumRewards: row.premiumRewards,
    premiumEnabled: row.premiumEnabled,
    premiumUpgradeMode: row.premiumUpgradeMode,
    storeIds: stringArray(row.storeIds),
    budgetAmount: numberOrNull(row.budgetAmount),
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapPromoCard(row: PromoCardRow): GuestGamePromoCard {
  return {
    id: row.id,
    title: row.title,
    label: row.label,
    description: row.description,
    tag: row.tag,
    status: row.status as StatusValue,
    targetAnchor: row.targetAnchor,
    priority: row.priority,
    storeIds: stringArray(row.storeIds),
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: mapUser(row.createdByUser),
  };
}

function mapVisualDraft(row: VisualDraftRow): GuestGameVisualDraft {
  return {
    id: row.id,
    status: row.status,
    payload: normalizeVisualEditorPayload(row.payload),
    note: row.note,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    store: row.store ? mapVisualEditorStore(row.store) : null,
    createdBy: mapUser(row.createdByUser),
    updatedBy: mapUser(row.updatedByUser),
    publishedBy: mapUser(row.publishedByUser),
  };
}

function mapVisualEditorStore(row: PilotStoreRow): GuestGameVisualEditorStore {
  return {
    id: row.id,
    name: row.name,
    publicSlug: row.publicSlug,
    city: row.city,
    address: row.address,
    gamificationEnabled: row.gamificationEnabled,
  };
}

function latestVisualDraftByStoreId(rows: VisualDraftRow[]) {
  const map = new Map<string, VisualDraftRow>();

  for (const row of rows) {
    if (!row.storeId || map.has(row.storeId)) {
      continue;
    }

    map.set(row.storeId, row);
  }

  return map;
}

function visualRuleRefs(
  items: Array<{ id: string | null; label: string }>,
): Map<string, string> {
  const refs = new Map<string, string>();

  for (const item of items) {
    const key = item.id ? `id:${item.id}` : `title:${item.label.trim()}`;

    if (!key || refs.has(key)) {
      continue;
    }

    refs.set(key, item.label);
  }

  return refs;
}

function visualEventSyncDiff(
  currentRefs: Map<string, string>,
  publishedRefs: Map<string, string>,
) {
  const added = [...currentRefs.entries()]
    .filter(([key]) => !publishedRefs.has(key))
    .map(([, label]) => label);
  const removed = [...publishedRefs.entries()]
    .filter(([key]) => !currentRefs.has(key))
    .map(([, label]) => label);

  return { added, removed };
}

function visualEventSyncStoreIsDirty(store: GuestGameVisualEventSyncStore) {
  return Boolean(
    store.addedLootBoxes.length ||
    store.removedLootBoxes.length ||
    store.addedMissions.length ||
    store.removedMissions.length,
  );
}

function visualEditorPayloadUsesRule(
  value: unknown,
  kind: VisualEditorUsageKind,
  id: string,
) {
  const payload = normalizeVisualEditorPayload(value);

  switch (kind) {
    case 'lootBox':
      return payload.lootBoxes.some((item) => item.id === id);
    case 'mission':
      return payload.missions.some((item) => item.id === id);
    case 'season':
      return payload.battlePass.enabled && payload.battlePass.id === id;
    case 'promoCard':
      return visualEditorVisiblePromoCards(payload).some(
        (item) => item.id === id,
      );
  }
}

function detachVisualEditorRule(
  payload: GuestGameVisualEditorPayload,
  kind: VisualEditorUsageKind,
  id: string,
): GuestGameVisualEditorPayload | null {
  switch (kind) {
    case 'lootBox': {
      const lootBoxes = payload.lootBoxes.filter((item) => item.id !== id);

      return lootBoxes.length === payload.lootBoxes.length
        ? null
        : normalizeVisualEditorPayload({ ...payload, lootBoxes });
    }
    case 'mission': {
      const missions = payload.missions.filter((item) => item.id !== id);

      return missions.length === payload.missions.length
        ? null
        : normalizeVisualEditorPayload({ ...payload, missions });
    }
    case 'season': {
      if (payload.battlePass.id !== id) {
        return null;
      }

      return normalizeVisualEditorPayload({
        ...payload,
        battlePass: {
          ...payload.battlePass,
          id: null,
          enabled: false,
          status: 'DRAFT',
        },
      });
    }
    case 'promoCard': {
      const promoCards = payload.promoCards.filter((item) => item.id !== id);

      return promoCards.length === payload.promoCards.length
        ? null
        : normalizeVisualEditorPayload({ ...payload, promoCards });
    }
  }
}

function visualEditorVisiblePromoCards(
  payload: GuestGameVisualEditorPayload,
  now = new Date(),
) {
  return payload.promoCards
    .filter((item) => visualEditorPromoCardCanAppear(item, now))
    .slice(0, promoBannerDisplayLimit);
}

function visualEditorPayloadEquals(
  left: Prisma.JsonValue | GuestGameVisualEditorPayload | null,
  right: GuestGameVisualEditorPayload,
) {
  return (
    JSON.stringify(normalizeVisualEditorPayload(left)) ===
    JSON.stringify(normalizeVisualEditorPayload(right))
  );
}

function visualRulePeriodIsActive(
  periodFrom: string | null,
  periodTo: string | null,
  now = new Date(),
) {
  const nowMs = now.getTime();
  const fromMs = dateTimestampOrNull(periodFrom);
  const toMs = dateTimestampOrNull(periodTo);

  if (fromMs !== null && fromMs > nowMs) {
    return false;
  }

  if (toMs !== null && toMs < nowMs) {
    return false;
  }

  return true;
}

function visualEditorPromoCardCanAppear(
  item: GuestGameVisualEditorPromoCard,
  now: Date,
) {
  if (item.status !== 'ACTIVE') {
    return false;
  }

  const nowMs = now.getTime();
  const fromMs = dateTimestampOrNull(item.periodFrom);
  const toMs = dateTimestampOrNull(item.periodTo);

  if (fromMs !== null && fromMs > nowMs) {
    return false;
  }

  if (toMs !== null && toMs < nowMs) {
    return false;
  }

  return true;
}

function dateTimestampOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function visualEditorUsageStoreName(
  store: { name: string; city: string | null; address: string | null } | null,
) {
  if (!store) {
    return 'общей визуализации';
  }

  const details = [store.city, store.address]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return details.length ? `${store.name} (${details.join(', ')})` : store.name;
}

function ruleDeleteActivityConfirmation(
  label: string,
  usages: RuleDeleteActivityUsage[],
) {
  const storeNames = Array.from(
    new Set(usages.map((usage) => usage.storeName)),
  );
  const storeList = storeNames.join(', ');
  const hasVisualEditorUsage = usages.some(
    (usage) => usage.source === 'visualEditor',
  );
  const hasAdvancedUsage = usages.some((usage) => usage.source === 'advanced');

  return {
    statusCode: 409,
    code: 'GAME_RULE_ACTIVE',
    message: `Нельзя удалить ${label}: этот элемент сейчас активен в клубе. Удалить его из активности клуба и затем удалить шаблон?`,
    stores: usages,
    storeNames,
    storeList,
    sources: {
      visualEditor: hasVisualEditorUsage,
      advanced: hasAdvancedUsage,
    },
  };
}

function rewardActivityLabel(row: RewardRow) {
  if (row.lootBox) {
    return `Лутбокс "${row.lootBox.name}"`;
  }

  if (row.mission) {
    if (rewardMissionIsCheckIn(row.mission)) {
      return 'Чекин';
    }

    return `Задание "${row.mission.name}"`;
  }

  if (row.season) {
    const stepNumber = rewardBattlePassStepNumber(row);

    return stepNumber
      ? `Battlepass шаг №${stepNumber}`
      : `Battlepass "${row.season.name}"`;
  }

  return row.source === 'MANUAL' || row.source === 'CASHIER'
    ? 'Ручная награда'
    : 'Игровое событие';
}

function rewardMissionIsCheckIn(mission: NonNullable<RewardRow['mission']>) {
  return (
    mission.missionType === 'CHECK_IN' || mission.triggerKind === 'CHECK_IN'
  );
}

function rewardBattlePassStepNumber(row: RewardRow) {
  const evidence = jsonRecord(row.evidence);
  const rule = jsonRecord(evidence.rule as Prisma.JsonValue | null);
  const directStep = [
    evidence.level,
    evidence.levelNumber,
    evidence.step,
    evidence.stepNumber,
    rule.level,
    rule.levelNumber,
    rule.step,
    rule.stepNumber,
  ]
    .map((value) => dryRunNumber(value, 0))
    .find((value) => value > 0);

  if (directStep) {
    return Math.trunc(directStep);
  }

  const rewardLabel = row.rewardLabel.trim();
  const levels = dryRunArray(row.season?.levels)
    .map((item) => dryRunRecord(item))
    .map((item) => {
      const level = dryRunNumber(item.level, 0);
      const freeReward = dryRunString(item.freeReward);
      const premiumReward = dryRunString(item.premiumReward);
      const combinedReward = [freeReward, premiumReward]
        .filter(Boolean)
        .join(' + ');

      return {
        level,
        labels: [freeReward, premiumReward, combinedReward].filter(Boolean),
      };
    })
    .filter((item) => item.level > 0);

  return (
    levels.find((item) => item.labels.some((label) => label === rewardLabel))
      ?.level ?? null
  );
}

function mapReward(row: RewardRow): GuestGameReward {
  const walletState = rewardWalletState(row.status, row.expiresAt);

  return {
    id: row.id,
    status: row.status as RewardStatus,
    walletState,
    activityLabel: rewardActivityLabel(row),
    source: row.source as RewardSource,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId: row.externalId,
    originKey: row.originKey,
    idempotencyKey: row.idempotencyKey,
    guestExternalId: row.guestExternalId,
    rewardType: row.rewardType,
    rewardAmount: numberValue(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    rewardRarity: lootBoxRewardRarityCode(row.rewardRarity) ?? null,
    rewardRarityLabel: row.rewardRarityLabel,
    rewardDropChance: numberOrNull(row.rewardDropChance),
    rewardCode: row.rewardCode,
    claimPayload:
      row.rewardCode && walletState !== 'REDEEMED'
        ? buildRewardClaimPayload(row.id, row.rewardCode)
        : null,
    qualifiedAt: row.qualifiedAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    paidAt: iso(row.paidAt),
    note: row.note,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    profile: mapProfileSummary(row.profile),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact:
            row.guest.phoneMasked ?? row.guest.emailMasked ?? 'нет контакта',
        }
      : null,
    lootBox: row.lootBox
      ? {
          id: row.lootBox.id,
          name: row.lootBox.name,
          status: row.lootBox.status,
        }
      : null,
    mission: row.mission
      ? {
          id: row.mission.id,
          name: row.mission.name,
          status: row.mission.status,
          missionType: row.mission.missionType,
          triggerKind: row.mission.triggerKind,
          xpReward: row.mission.xpReward,
          progressUnit: row.mission.progressUnit,
        }
      : null,
    season: row.season
      ? {
          id: row.season.id,
          name: row.season.name,
          status: row.season.status,
        }
      : null,
    store: row.store,
    createdBy: mapUser(row.createdByUser),
    approvedBy: mapUser(row.approvedByUser),
  };
}

function buildBonusBalanceCurrentReconciliation(
  currents: BonusBalanceCurrentReconciliationRow[],
  snapshots: BonusLedgerAuditSnapshotRow[],
): GuestGameBonusBalanceCurrentReconciliation {
  const snapshotByKey = new Map<string, BonusLedgerAuditSnapshotRow>();

  for (const snapshot of snapshots) {
    for (const key of bonusLedgerSnapshotKeys(snapshot)) {
      if (!snapshotByKey.has(key)) {
        snapshotByKey.set(key, snapshot);
      }
    }
  }

  const items = currents.map((current) => {
    const snapshot = bonusLedgerSnapshotKeys(current)
      .map((key) => snapshotByKey.get(key))
      .filter((value): value is BonusLedgerAuditSnapshotRow => Boolean(value))
      .reduce<BonusLedgerAuditSnapshotRow | null>(
        (latest, candidate) =>
          !latest ||
          candidate.snapshotDate.getTime() > latest.snapshotDate.getTime()
            ? candidate
            : latest,
        null,
      );

    return mapBonusBalanceCurrentReconciliationItem(current, snapshot);
  });
  const latestCurrentAt = currents.reduce<Date | null>(
    (latest, current) => maxDate(latest, current.snapshotDate),
    null,
  );
  const latestSnapshotAt = snapshots.reduce<Date | null>(
    (latest, snapshot) => maxDate(latest, snapshot.snapshotDate),
    null,
  );

  return {
    summary: {
      totalCurrent: items.length,
      matched: items.filter((item) => item.state === 'MATCHED').length,
      mismatched: items.filter((item) => item.state === 'MISMATCH').length,
      waitingSync: items.filter((item) => item.state === 'WAITING_SYNC').length,
      noSnapshot: items.filter((item) => item.state === 'NO_SNAPSHOT').length,
      ledgerBacked: items.filter((item) => item.source === 'LANGAME_LEDGER')
        .length,
      snapshotBacked: items.filter((item) => item.latestSnapshotAt).length,
      amountCurrent: roundMoney(sum(items.map((item) => item.currentBalance))),
      amountSnapshot: roundMoney(
        sum(items.map((item) => item.latestSnapshotBalance ?? 0)),
      ),
      diffTotal: roundMoney(sum(items.map((item) => item.diff ?? 0))),
      latestCurrentAt: iso(latestCurrentAt),
      latestSnapshotAt: iso(latestSnapshotAt),
    },
    items,
    note: 'Сверка сравнивает текущий GuestBonusBalanceCurrent с последним сохраненным GuestBonusBalanceSnapshot по guestId или внешнему Langame-id. Live-запросы в Langame при открытии страницы не выполняются.',
  };
}

function mapBonusBalanceCurrentReconciliationItem(
  row: BonusBalanceCurrentReconciliationRow,
  snapshot: BonusLedgerAuditSnapshotRow | null,
): GuestGameBonusBalanceCurrentReconciliationItem {
  const currentBalance = numberValue(row.bonusBalance);
  const latestSnapshotBalance = snapshot
    ? numberValue(snapshot.bonusBalance)
    : null;
  const snapshotIsFresh =
    snapshot !== null &&
    snapshot.snapshotDate.getTime() >= row.snapshotDate.getTime();
  const diff =
    latestSnapshotBalance === null
      ? null
      : roundMoney(latestSnapshotBalance - currentBalance);
  const guestDisplay =
    row.guest?.fullNameMasked ?? row.externalGuestId ?? 'гость без профиля';
  const guestContact = row.guest?.phoneMasked ?? row.guest?.emailMasked ?? null;
  const reconciliation = bonusBalanceCurrentReconciliationState({
    source: row.source,
    snapshotIsFresh,
    diff,
    snapshot,
  });

  return {
    id: row.id,
    source: row.source,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalGuestId: row.externalGuestId,
    currentBalance,
    currentSnapshotAt: row.snapshotDate.toISOString(),
    lastSyncedAt: iso(row.lastSyncedAt),
    updatedAt: row.updatedAt.toISOString(),
    latestSnapshotAt: snapshot ? snapshot.snapshotDate.toISOString() : null,
    latestSnapshotBalance,
    diff,
    state: reconciliation.state,
    stateLabel: reconciliation.stateLabel,
    note: reconciliation.note,
    guest: {
      id: row.guest?.id ?? row.guestId,
      displayName: guestDisplay,
      contact: guestContact,
    },
  };
}

function bonusBalanceCurrentReconciliationState({
  source,
  snapshotIsFresh,
  diff,
  snapshot,
}: {
  source: string;
  snapshotIsFresh: boolean;
  diff: number | null;
  snapshot: BonusLedgerAuditSnapshotRow | null;
}): Pick<
  GuestGameBonusBalanceCurrentReconciliationItem,
  'state' | 'stateLabel' | 'note'
> {
  if (!snapshot) {
    return {
      state: 'NO_SNAPSHOT',
      stateLabel: 'нет snapshot',
      note: 'Для текущего бонусного баланса еще нет исторического Langame snapshot. Нужен следующий guest foundation sync.',
    };
  }

  if (!snapshotIsFresh) {
    return {
      state: 'WAITING_SYNC',
      stateLabel: 'ждет sync',
      note:
        source === 'LANGAME_LEDGER'
          ? 'Баланс уже обновлен ledger-начислением, но ночной Langame snapshot еще не подтвердил новое значение.'
          : 'Текущая запись свежее последнего найденного snapshot: дождитесь следующей синхронизации балансов.',
    };
  }

  if (diff !== null && Math.abs(diff) <= 0.01) {
    return {
      state: 'MATCHED',
      stateLabel: 'сошлось',
      note: 'Последний Langame snapshot совпадает с текущим бонусным балансом LeetPlus.',
    };
  }

  return {
    state: 'MISMATCH',
    stateLabel: 'расхождение',
    note: 'Текущий бонусный баланс LeetPlus отличается от последнего Langame snapshot: нужна ручная сверка гостя и ledger-операций.',
  };
}

function buildBonusLedgerAudit(
  entries: BonusLedgerAuditRow[],
  snapshots: BonusLedgerAuditSnapshotRow[],
): GuestGameBonusLedgerAudit {
  const snapshotByKey = new Map<string, BonusLedgerAuditSnapshotRow>();

  for (const snapshot of snapshots) {
    for (const key of bonusLedgerSnapshotKeys(snapshot)) {
      if (!snapshotByKey.has(key)) {
        snapshotByKey.set(key, snapshot);
      }
    }
  }

  const now = new Date();
  const items = entries.map((entry) => {
    const snapshot =
      bonusLedgerSnapshotKeys(entry)
        .map((key) => snapshotByKey.get(key))
        .find((value): value is BonusLedgerAuditSnapshotRow =>
          Boolean(value),
        ) ?? null;

    return mapBonusLedgerAuditItem(entry, snapshot, now);
  });
  const latestConfirmedAt = entries.reduce<Date | null>(
    (latest, entry) => maxDate(latest, entry.confirmedAt),
    null,
  );

  return {
    summary: {
      total: items.length,
      pending: items.filter((item) => item.status === 'PENDING').length,
      processing: items.filter((item) => item.status === 'PROCESSING').length,
      confirmed: items.filter((item) => item.status === 'CONFIRMED').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      canceled: items.filter((item) => item.status === 'CANCELED').length,
      retryReady: items.filter((item) => item.retryReady).length,
      reconciliationPending: items.filter(
        (item) => item.reconciliation.state === 'WAITING_SYNC',
      ).length,
      reconciliationMismatch: items.filter(
        (item) => item.reconciliation.state === 'MISMATCH',
      ).length,
      amountPending: roundMoney(
        sum(
          items
            .filter((item) => ['PENDING', 'PROCESSING'].includes(item.status))
            .map((item) => item.amount),
        ),
      ),
      amountConfirmed: roundMoney(
        sum(
          items
            .filter((item) => item.status === 'CONFIRMED')
            .map((item) => item.amount),
        ),
      ),
      amountFailed: roundMoney(
        sum(
          items
            .filter((item) => item.status === 'FAILED')
            .map((item) => item.amount),
        ),
      ),
      latestConfirmedAt: iso(latestConfirmedAt),
    },
    items,
    note: 'Журнал показывает последние bonus-ledger операции геймификации без raw phone, токенов и полного Langame payload. Сверка считается только по сохраненным GuestBonusBalanceSnapshot после подтвержденного начисления.',
  };
}

function mapBonusLedgerAuditItem(
  row: BonusLedgerAuditRow,
  snapshot: BonusLedgerAuditSnapshotRow | null,
  now: Date,
): GuestGameBonusLedgerAuditItem {
  const metadata = jsonRecord(row.metadata);
  const phoneMasked =
    nullableString(metadata.phoneMasked) ??
    row.guest?.phoneMasked ??
    row.profile?.contactMasked ??
    null;
  const guestDisplay =
    row.profile?.displayName ??
    row.guest?.fullNameMasked ??
    row.externalGuestId ??
    'Гость не связан';
  const guestContact =
    row.profile?.contactMasked ??
    row.guest?.phoneMasked ??
    row.guest?.emailMasked ??
    phoneMasked;
  const retryReady =
    row.status === 'FAILED' &&
    (!row.nextAttemptAt || row.nextAttemptAt.getTime() <= now.getTime());
  const reconciliation = bonusLedgerReconciliation(row, snapshot);

  return {
    id: row.id,
    status: row.status,
    statusLabel: bonusLedgerStatusLabel(row.status),
    entryType: row.entryType,
    source: row.source,
    amount: numberValue(row.amount),
    balanceBefore: numberOrNull(row.balanceBefore),
    balanceAfter: numberOrNull(row.balanceAfter),
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalGuestId: row.externalGuestId,
    phoneMasked,
    attempts: row.attempts,
    retryReady,
    nextAttemptAt: iso(row.nextAttemptAt),
    processedAt: iso(row.processedAt),
    confirmedAt: iso(row.confirmedAt),
    failedAt: iso(row.failedAt),
    canceledAt: iso(row.canceledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    reason: row.reason,
    guest: {
      id: row.guest?.id ?? row.profileId,
      displayName: guestDisplay,
      contact: guestContact,
    },
    reward: row.reward
      ? {
          id: row.reward.id,
          status: row.reward.status,
          rewardType: row.reward.rewardType,
          rewardLabel: row.reward.rewardLabel,
          rewardCode: row.reward.rewardCode,
        }
      : null,
    store: row.store,
    createdBy: mapUser(row.createdByUser),
    processedBy: mapUser(row.processedByUser),
    reconciliation,
    nextAction: bonusLedgerNextAction(row, retryReady, reconciliation),
  };
}

function mapPilotLedgerPreflightItem(
  row: BonusLedgerAuditRow,
  now: Date,
): GuestGamePilotLedgerPreflightItem {
  const item = mapBonusLedgerAuditItem(row, null, now);

  return {
    id: item.id,
    status: item.status,
    statusLabel: item.statusLabel,
    entryType: item.entryType,
    source: item.source,
    amount: item.amount,
    attempts: item.attempts,
    retryReady: item.retryReady,
    nextAttemptAt: item.nextAttemptAt,
    createdAt: item.createdAt,
    guest: item.guest,
    reward: item.reward
      ? {
          id: item.reward.id,
          status: item.reward.status,
          rewardType: item.reward.rewardType,
          rewardLabel: item.reward.rewardLabel,
        }
      : null,
    store: item.store,
    nextAction: item.nextAction,
  };
}

function bonusLedgerReconciliation(
  row: BonusLedgerAuditRow,
  snapshot: BonusLedgerAuditSnapshotRow | null,
): GuestGameBonusLedgerAuditItem['reconciliation'] {
  const expectedBalance = numberOrNull(row.balanceAfter);

  if (['FAILED', 'CANCELED'].includes(row.status)) {
    return {
      state: 'NOT_APPLICABLE',
      stateLabel: 'не требуется',
      latestSnapshotAt: null,
      latestSnapshotBalance: null,
      expectedBalance,
      diff: null,
      note: 'Запись не подтверждена в Langame, сверка баланса не требуется.',
    };
  }

  if (row.status !== 'CONFIRMED') {
    return {
      state: 'NOT_READY',
      stateLabel: 'рано сверять',
      latestSnapshotAt: null,
      latestSnapshotBalance: null,
      expectedBalance,
      diff: null,
      note: 'Сначала нужно подтвердить начисление через bonus ledger dispatcher.',
    };
  }

  if (
    !snapshot ||
    !row.confirmedAt ||
    snapshot.snapshotDate.getTime() < row.confirmedAt.getTime()
  ) {
    return {
      state: 'WAITING_SYNC',
      stateLabel: 'ждет snapshot',
      latestSnapshotAt: snapshot ? snapshot.snapshotDate.toISOString() : null,
      latestSnapshotBalance: snapshot
        ? numberValue(snapshot.bonusBalance)
        : null,
      expectedBalance,
      diff: null,
      note: 'Начисление подтверждено, но еще нет свежего Langame snapshot после операции.',
    };
  }

  const latestSnapshotBalance = numberValue(snapshot.bonusBalance);
  const diff =
    expectedBalance === null
      ? null
      : roundMoney(latestSnapshotBalance - expectedBalance);
  const matched = diff !== null && Math.abs(diff) <= 0.01;

  return {
    state: matched ? 'MATCHED' : 'MISMATCH',
    stateLabel: matched ? 'сошлось' : 'расхождение',
    latestSnapshotAt: snapshot.snapshotDate.toISOString(),
    latestSnapshotBalance,
    expectedBalance,
    diff,
    note: matched
      ? 'Последний Langame snapshot совпадает с ожидаемым балансом после ledger-начисления.'
      : 'Langame snapshot отличается от ожидаемого баланса: нужна ручная сверка по гостю и операции.',
  };
}

function bonusLedgerNextAction(
  row: BonusLedgerAuditRow,
  retryReady: boolean,
  reconciliation: GuestGameBonusLedgerAuditItem['reconciliation'],
) {
  if (row.status === 'PENDING') {
    return 'Запустить bonus-ledger dispatch или дождаться scheduled dispatcher.';
  }

  if (row.status === 'PROCESSING') {
    return 'Проверить, не завис ли worker; stale-lock вернет запись в обработку по расписанию.';
  }

  if (row.status === 'FAILED') {
    return retryReady
      ? 'Повторить dispatch после проверки Langame-ключа, телефона гостя и домена клуба.'
      : 'Дождаться nextAttemptAt или вручную разобрать ошибку перед повтором.';
  }

  if (row.status === 'CONFIRMED') {
    if (reconciliation.state === 'MATCHED') {
      return 'Операция закрыта: можно использовать ее как эталон пилотного начисления.';
    }

    if (reconciliation.state === 'MISMATCH') {
      return 'Сверить гостя в Langame и при необходимости оформить обратную/корректирующую операцию.';
    }

    return 'Дождаться guest foundation sync и ночного bonus balance snapshot для финальной сверки.';
  }

  if (row.status === 'CANCELED') {
    return 'Оставить отмену в аудите; для подтвержденных операций использовать отдельную обратную запись.';
  }

  return 'Проверить статус ledger-записи перед следующей операцией.';
}

function bonusLedgerStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'в очереди';
    case 'PROCESSING':
      return 'обработка';
    case 'CONFIRMED':
      return 'подтверждено';
    case 'FAILED':
      return 'ошибка';
    case 'CANCELED':
      return 'отменено';
    default:
      return status.toLowerCase();
  }
}

function bonusLedgerSnapshotKeys(value: {
  guestId?: string | null;
  externalProvider?: IntegrationProvider | null;
  externalDomain?: string | null;
  externalGuestId?: string | null;
}) {
  const keys: string[] = [];

  if (value.guestId) {
    keys.push(`guest:${value.guestId}`);
  }

  if (value.externalGuestId) {
    keys.push(
      [
        'external',
        value.externalProvider ?? 'UNKNOWN',
        value.externalDomain ?? '',
        value.externalGuestId,
      ].join(':'),
    );
  }

  return keys;
}

function mapDeliveryEvent(row: DeliveryEventRow): GuestGameDeliveryEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    channel: deliveryChannelValue(row.channel, null),
    note: row.note,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    actor: mapUser(row.actorUser),
  };
}

function mapDelivery(row: DeliveryRow): GuestGameDelivery {
  const readinessStatus = communicationQueueStatusValue(row.readinessStatus);
  const channel = deliveryChannelValue(row.channel, 'MANUAL') ?? 'MANUAL';
  const status = deliveryStatusValue(row.status);

  return {
    id: row.id,
    rewardId: row.rewardId,
    profileId: row.profileId,
    guestId: row.guestId,
    storeId: row.storeId,
    channel,
    channelLabel: communicationQueueChannelLabel(channel),
    status,
    statusLabel: deliveryStatusLabel(status),
    readinessStatus,
    readinessStatusLabel: communicationQueueStatusLabel(readinessStatus),
    recipientMasked: row.recipientMasked,
    channelIdentityMasked: row.channelIdentityMasked,
    messageTitle: row.messageTitle,
    messageBody: row.messageBody,
    blockers: stringArray(row.blockers),
    metadata: row.metadata,
    preparedAt: row.preparedAt.toISOString(),
    sentAt: iso(row.sentAt),
    failedAt: iso(row.failedAt),
    canceledAt: iso(row.canceledAt),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reward: mapReward(row.reward),
    profile: row.profile
      ? {
          id: row.profile.id,
          displayName: row.profile.displayName,
          contactMasked: row.profile.contactMasked,
          telegramIdentity: row.profile.telegramIdentity,
          maxIdentity: row.profile.maxIdentity,
          xp: row.profile.xp,
          level: row.profile.level,
        }
      : null,
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact:
            row.guest.phoneMasked ?? row.guest.emailMasked ?? 'нет контакта',
        }
      : null,
    store: row.store,
    createdBy: mapUser(row.createdByUser),
    events: row.events.map(mapDeliveryEvent),
  };
}

function rewardWalletState(
  status: string,
  expiresAt: Date | null,
): GuestGameReward['walletState'] {
  if (status === 'PAID') {
    return 'REDEEMED';
  }

  if (status === 'CANCELED') {
    return 'CANCELED';
  }

  if (
    status === 'EXPIRED' ||
    (expiresAt !== null && expiresAt.getTime() < Date.now())
  ) {
    return 'EXPIRED';
  }

  if (status === 'APPROVED') {
    return 'READY';
  }

  return 'WAITING_APPROVAL';
}

function buildCommunicationQueueItem(
  reward: GuestGameReward,
  profile: GuestGameProfile | null,
): GuestGameCommunicationQueueItem {
  const consentStatus = profile?.communication.phoneConsentStatus ?? 'UNKNOWN';
  const telegramReady = Boolean(profile?.communication.telegramReady);
  const maxReady = Boolean(profile?.communication.maxReady);
  const botReady = Boolean(profile?.communication.botReady);
  const rewardCodeReady = Boolean(reward.rewardCode);
  const blockers: string[] = [];

  if (!profile) {
    blockers.push('Нет связанного игрового профиля гостя.');
  }

  if (reward.walletState === 'WAITING_APPROVAL') {
    blockers.push('Награду нужно подтвердить перед выдачей или уведомлением.');
  }

  if (reward.walletState === 'READY') {
    if (consentStatus === 'UNSUBSCRIBED') {
      blockers.push('Гость отписался от игровых коммуникаций.');
    } else if (consentStatus === 'DENIED') {
      blockers.push('Гость отказался от игровых коммуникаций.');
    } else if (consentStatus !== 'GRANTED') {
      blockers.push('Нет подтвержденного согласия на игровые коммуникации.');
    }

    if (!telegramReady && !maxReady) {
      blockers.push('Telegram/MAX alias еще не привязан.');
    }

    if (!rewardCodeReady) {
      blockers.push('Код кассира еще не создан для ручной выдачи.');
    }
  }

  const queueStatus = communicationQueueStatus({
    reward,
    consentStatus,
    botReady,
    rewardCodeReady,
  });
  const channel = communicationQueueChannel({
    telegramReady,
    maxReady,
    rewardCodeReady,
  });

  return {
    id: `${reward.id}:${queueStatus}`,
    rewardId: reward.id,
    profileId: profile?.id ?? reward.profile?.id ?? null,
    guestLabel:
      profile?.displayName ??
      reward.profile?.displayName ??
      reward.guest?.displayName ??
      reward.guestExternalId ??
      'Гость',
    contactMasked:
      profile?.contactMasked ??
      reward.profile?.contactMasked ??
      reward.guest?.contact ??
      null,
    rewardLabel: reward.rewardLabel,
    rewardType: reward.rewardType,
    rewardAmount: reward.rewardAmount,
    walletState: reward.walletState,
    queueStatus,
    queueStatusLabel: communicationQueueStatusLabel(queueStatus),
    channel,
    channelLabel: communicationQueueChannelLabel(channel),
    sourceLabel: communicationQueueSourceLabel(reward),
    store: reward.store,
    qualifiedAt: reward.qualifiedAt,
    expiresAt: reward.expiresAt,
    rewardCodeReady,
    botDeliveryEnabled: false,
    blockers,
    nextAction: communicationQueueNextAction(queueStatus),
  };
}

function communicationQueueStatus({
  reward,
  consentStatus,
  botReady,
  rewardCodeReady,
}: {
  reward: GuestGameReward;
  consentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
  botReady: boolean;
  rewardCodeReady: boolean;
}): GuestGameCommunicationQueueStatus {
  if (reward.walletState === 'REDEEMED') {
    return 'REDEEMED';
  }

  if (reward.walletState === 'CANCELED') {
    return 'CANCELED';
  }

  if (reward.walletState === 'EXPIRED') {
    return 'EXPIRED';
  }

  if (reward.walletState === 'WAITING_APPROVAL') {
    return 'NEEDS_APPROVAL';
  }

  if (botReady) {
    return 'READY_FOR_BOT';
  }

  if (consentStatus === 'UNSUBSCRIBED') {
    return 'UNSUBSCRIBED';
  }

  if (consentStatus !== 'GRANTED') {
    return 'NEEDS_CONSENT';
  }

  if (rewardCodeReady) {
    return 'READY_FOR_CASHIER';
  }

  return 'NEEDS_CHANNEL';
}

function communicationQueueChannel({
  telegramReady,
  maxReady,
  rewardCodeReady,
}: {
  telegramReady: boolean;
  maxReady: boolean;
  rewardCodeReady: boolean;
}): GuestGameCommunicationQueueItem['channel'] {
  if (telegramReady) {
    return 'TELEGRAM';
  }

  if (maxReady) {
    return 'MAX';
  }

  return rewardCodeReady ? 'CASHIER' : 'MANUAL';
}

function communicationQueueStatusLabel(
  status: GuestGameCommunicationQueueStatus,
) {
  const labels: Record<GuestGameCommunicationQueueStatus, string> = {
    READY_FOR_BOT: 'готово к боту',
    READY_FOR_CASHIER: 'готово кассиру',
    NEEDS_APPROVAL: 'нужно подтвердить',
    NEEDS_CONSENT: 'нет согласия',
    NEEDS_CHANNEL: 'нет канала',
    UNSUBSCRIBED: 'отписался',
    EXPIRED: 'срок истек',
    REDEEMED: 'погашено',
    CANCELED: 'отменено',
  };

  return labels[status];
}

function communicationQueueNextAction(
  status: GuestGameCommunicationQueueStatus,
) {
  const actions: Record<GuestGameCommunicationQueueStatus, string> = {
    READY_FOR_BOT:
      'После подключения Telegram/MAX-бота можно отправить игровое уведомление.',
    READY_FOR_CASHIER:
      'Выдайте награду по коду кассира или попросите гостя привязать Telegram/MAX.',
    NEEDS_APPROVAL: 'Подтвердите награду в кошельке.',
    NEEDS_CONSENT:
      'Получите согласие гостя в публичном кабинете или при ручном контакте.',
    NEEDS_CHANNEL:
      'Привяжите Telegram/MAX alias или выдайте награду через ручной код.',
    UNSUBSCRIBED: 'Не отправляйте сообщения; доступна только ручная обработка.',
    EXPIRED: 'Проверьте срок и при необходимости создайте новую награду.',
    REDEEMED: 'Действий не требуется.',
    CANCELED: 'Действий не требуется.',
  };

  return actions[status];
}

function communicationQueueChannelLabel(
  channel: GuestGameCommunicationQueueItem['channel'],
) {
  const labels: Record<GuestGameCommunicationQueueItem['channel'], string> = {
    TELEGRAM: 'Telegram',
    MAX: 'MAX',
    CASHIER: 'Кассир',
    MANUAL: 'Ручная выдача',
  };

  return labels[channel];
}

function communicationQueueStatusRank(
  status: GuestGameCommunicationQueueStatus,
) {
  const ranks: Record<GuestGameCommunicationQueueStatus, number> = {
    READY_FOR_BOT: 0,
    READY_FOR_CASHIER: 1,
    NEEDS_APPROVAL: 2,
    NEEDS_CONSENT: 3,
    NEEDS_CHANNEL: 4,
    UNSUBSCRIBED: 5,
    EXPIRED: 6,
    REDEEMED: 7,
    CANCELED: 8,
  };

  return ranks[status];
}

function communicationQueueSourceLabel(reward: GuestGameReward) {
  if (reward.lootBox) {
    return `Лутбокс: ${reward.lootBox.name}`;
  }

  if (reward.mission) {
    return `Задание: ${reward.mission.name}`;
  }

  if (reward.season) {
    return `Battle Pass: ${reward.season.name}`;
  }

  return 'Ручная награда';
}

function communicationQueueStatusValue(
  status: string,
): GuestGameCommunicationQueueStatus {
  const values: GuestGameCommunicationQueueStatus[] = [
    'READY_FOR_BOT',
    'READY_FOR_CASHIER',
    'NEEDS_APPROVAL',
    'NEEDS_CONSENT',
    'NEEDS_CHANNEL',
    'UNSUBSCRIBED',
    'EXPIRED',
    'REDEEMED',
    'CANCELED',
  ];

  return values.includes(status as GuestGameCommunicationQueueStatus)
    ? (status as GuestGameCommunicationQueueStatus)
    : 'NEEDS_APPROVAL';
}

function isReadyDeliveryQueueStatus(status: GuestGameCommunicationQueueStatus) {
  return status === 'READY_FOR_BOT' || status === 'READY_FOR_CASHIER';
}

function deliveryStatusFromQueueStatus(
  status: GuestGameCommunicationQueueStatus,
): GuestGameDeliveryStatus {
  if (status === 'REDEEMED') {
    return 'SENT';
  }

  if (status === 'CANCELED') {
    return 'CANCELED';
  }

  return isReadyDeliveryQueueStatus(status) ? 'READY' : 'BLOCKED';
}

function deliveryStatusValue(status: string): GuestGameDeliveryStatus {
  return deliveryStatuses.includes(status as GuestGameDeliveryStatus)
    ? (status as GuestGameDeliveryStatus)
    : 'BLOCKED';
}

function isTerminalDeliveryStatus(status: string | null) {
  return status === 'SENT' || status === 'FAILED' || status === 'CANCELED';
}

function deliveryChannelValue(
  channel: string | null,
  fallback: GuestGameDeliveryChannel | null,
): GuestGameDeliveryChannel | null {
  if (deliveryChannels.includes(channel as GuestGameDeliveryChannel)) {
    return channel as GuestGameDeliveryChannel;
  }

  return fallback;
}

function deliveryStatusLabel(status: GuestGameDeliveryStatus) {
  const labels: Record<GuestGameDeliveryStatus, string> = {
    READY: 'готово',
    BLOCKED: 'нужно действие',
    SENT: 'отправлено/выдано',
    FAILED: 'ошибка',
    CANCELED: 'отменено',
  };

  return labels[status];
}

function deliveryMetadata(
  item: GuestGameCommunicationQueueItem,
): Prisma.InputJsonValue {
  return {
    queueStatus: item.queueStatus,
    queueStatusLabel: item.queueStatusLabel,
    walletState: item.walletState,
    sourceLabel: item.sourceLabel,
    nextAction: item.nextAction,
    rewardCodeReady: item.rewardCodeReady,
    botDeliveryEnabled: item.botDeliveryEnabled,
  };
}

function buildDeliveryMessageTitle(item: GuestGameCommunicationQueueItem) {
  return `Ваша награда: ${item.rewardLabel}`;
}

function buildDeliveryMessageBody(item: GuestGameCommunicationQueueItem) {
  const amount = item.rewardAmount > 0 ? ` на ${item.rewardAmount} руб.` : '';
  const club = item.store ? ` в клубе ${item.store.name}` : '';
  const expires = item.expiresAt
    ? ` Действует до ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}.`
    : '';

  return `В LeetPlus для вас подготовлена награда${amount}${club}: ${item.rewardLabel}.${expires} Покажите код кассиру или откройте личный кабинет гостя.`;
}

function deliveryChannelIdentityMasked(
  channel: GuestGameDeliveryChannel,
  profile: GuestGameProfile | null,
) {
  if (channel === 'TELEGRAM') {
    return maskAlias(profile?.telegramIdentity ?? null);
  }

  if (channel === 'MAX') {
    return maskAlias(profile?.maxIdentity ?? null);
  }

  return null;
}

type GuestPortalOtpProviderReadiness = {
  status: GuestGameIntegrationReadinessStatus;
  statusLabel: string;
  ready: boolean;
  configured: boolean;
  enabled: boolean;
  requiredEnv: string[];
  details?: Array<{ label: string; value: string }>;
  note: string;
  nextAction: string;
};

type GuestPortalOtpReadiness = GuestPortalOtpProviderReadiness & {
  sms: GuestPortalOtpProviderReadiness;
  telegram: GuestPortalOtpProviderReadiness;
  max: GuestPortalOtpProviderReadiness;
};

function guestPortalOtpReadiness(): GuestPortalOtpReadiness {
  const devEnabled = envFlag('GUEST_PORTAL_DEV_OTP_ENABLED');
  const realSendEnabled = envFlag('GUEST_PORTAL_OTP_REAL_SEND_ENABLED');
  const smsEnabled = envFlag('GUEST_PORTAL_OTP_SMS_ENABLED');
  const smsRuApiId =
    envString('GUEST_PORTAL_OTP_SMS_RU_API_ID') ??
    envString('GUEST_PORTAL_USER_CALL_SMS_RU_API_ID');
  const smsRuConfigured = Boolean(smsRuApiId);
  const smsRuTestMode = envFlag('GUEST_PORTAL_OTP_SMS_RU_TEST_MODE');
  const smsRuLiveCanaryEnabled = envFlag(
    'GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
  );
  const smsRuLiveCanaryReady =
    !smsRuConfigured || smsRuTestMode || smsRuLiveCanaryEnabled;
  const genericSmsConfigured = Boolean(
    envString('GUEST_PORTAL_OTP_SMS_ENDPOINT') &&
    envString('GUEST_PORTAL_OTP_SMS_TOKEN'),
  );
  const smsRateLimits = guestPortalOtpSmsRateLimitReadiness();
  const smsConfigured = smsRuConfigured || genericSmsConfigured;
  const smsProviderLabel = smsRuConfigured
    ? 'SMS.ru /sms/send'
    : genericSmsConfigured
      ? 'generic endpoint'
      : 'provider не настроен';
  const telegramEnabled = envFlag('GUEST_PORTAL_OTP_TELEGRAM_ENABLED');
  const telegramConfigured = Boolean(
    envString('GUEST_PORTAL_TELEGRAM_BOT_TOKEN') ??
    envString('GUEST_GAME_TELEGRAM_BOT_TOKEN') ??
    envString('TELEGRAM_BOT_TOKEN'),
  );
  const maxEnabled = envFlag('GUEST_PORTAL_OTP_MAX_ENABLED');
  const maxConfigured = Boolean(
    envString('GUEST_PORTAL_OTP_MAX_ENDPOINT') &&
    envString('GUEST_PORTAL_OTP_MAX_TOKEN'),
  );

  const sms = guestPortalOtpProviderReadiness({
    channelLabel: 'SMS',
    realSendEnabled,
    channelEnabled: smsEnabled,
    configured: smsConfigured,
    requiredEnv: [
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
      'GUEST_PORTAL_OTP_SMS_ENABLED',
      'GUEST_PORTAL_OTP_SMS_RU_API_ID or GUEST_PORTAL_USER_CALL_SMS_RU_API_ID',
      'GUEST_PORTAL_OTP_SMS_ENDPOINT + GUEST_PORTAL_OTP_SMS_TOKEN',
    ],
    details: [
      {
        label: 'Real send',
        value: realSendEnabled ? 'включен' : 'выключен',
      },
      {
        label: 'Канал SMS',
        value: smsEnabled ? 'включен' : 'выключен',
      },
      {
        label: 'Provider',
        value: smsProviderLabel,
      },
      {
        label: 'SMS.ru api_id',
        value: smsRuConfigured ? 'настроен' : 'нужен или fallback Callcheck',
      },
      {
        label: 'Generic provider',
        value: genericSmsConfigured ? 'настроен' : 'не используется',
      },
      {
        label: 'SMS.ru test-mode',
        value: smsRuTestMode ? 'test=1' : 'выключен',
      },
      {
        label: 'SMS.ru live canary',
        value: smsRuConfigured
          ? smsRuLiveCanaryReady
            ? smsRuTestMode
              ? 'staged test-mode'
              : 'canary включен'
            : 'нужен canary'
          : 'не используется',
      },
      ...smsRateLimits.details,
    ],
    configuredNote:
      'SMS-код готов как резервный канал: backend отправит OTP через SMS.ru /sms/send или совместимый generic SMS provider только при включенном real-send и активных rate-limit/budget guards.',
    blockedNote:
      'SMS OTP не готов: нужен real-send, флаг SMS-канала и SMS.ru api_id либо generic endpoint/token.',
    safetyReady: smsRateLimits.ready && smsRuLiveCanaryReady,
    safetyRequiredEnv: [
      ...smsRateLimits.requiredEnv,
      ...(smsRuLiveCanaryReady
        ? []
        : [
            'GUEST_PORTAL_OTP_SMS_RU_TEST_MODE or GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED',
          ]),
    ],
    partialNote: !smsRuLiveCanaryReady
      ? 'SMS.ru provider настроен, но live-режим нельзя считать готовым без staged test-mode или отдельного controlled canary-флага.'
      : smsRateLimits.ready
        ? undefined
        : 'SMS OTP provider настроен, но live-режим нельзя считать готовым: один или несколько rate-limit/budget env отключены.',
    nextAction:
      'Провести staged QA с GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true, затем включать live SMS только через GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=true, активные лимиты, provider-бюджет и delivery audit без раскрытия кода.',
  });
  const telegram = guestPortalOtpProviderReadiness({
    channelLabel: 'Telegram',
    realSendEnabled,
    channelEnabled: telegramEnabled,
    configured: telegramConfigured,
    requiredEnv: [
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
      'GUEST_PORTAL_OTP_TELEGRAM_ENABLED',
      'GUEST_PORTAL_TELEGRAM_BOT_TOKEN',
      'GUEST_GAME_TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_TOKEN',
    ],
    configuredNote:
      'Резервный Telegram OTP-код готов: его можно отправить только гостю с уже подтвержденным numeric chat_id. Основной Telegram-вход идет через бота и contact-share.',
    blockedNote:
      'Резервный Telegram OTP-код выключен. Это не влияет на основной вход через Telegram-бота: OTP нужен только как дополнительный канал для уже привязанных гостей с chat:<id>.',
    partialNote:
      'Резервный Telegram OTP-код оставлен выключенным или настроен частично. Основной Telegram-вход работает отдельно через бота, contact-share и polling edge.',
    nextAction:
      'Оставить резервом до отдельного решения; включать после проверки основного Telegram-бота, согласий и профилей с chat:<id>.',
  });
  const max = guestPortalOtpProviderReadiness({
    channelLabel: 'MAX',
    realSendEnabled,
    channelEnabled: maxEnabled,
    configured: maxConfigured,
    requiredEnv: [
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
      'GUEST_PORTAL_OTP_MAX_ENABLED',
      'GUEST_PORTAL_OTP_MAX_ENDPOINT',
      'GUEST_PORTAL_OTP_MAX_TOKEN',
    ],
    configuredNote:
      'MAX provider имеет endpoint и token, но канал остается вторым адаптером до подтвержденного production-контракта.',
    blockedNote:
      'MAX OTP не готов: нужен подтвержденный provider endpoint/token, юридическая схема и отписки.',
    nextAction:
      'MAX включать только после утверждения API-контракта, consent-сценария, обработки отписок и теста на отдельном госте.',
  });
  const providers = [sms, telegram, max];
  const readyProviders = providers.filter((provider) => provider.ready);
  const partialProviders = providers.filter(
    (provider) => provider.status === 'PARTIAL',
  );
  const ready = readyProviders.length > 0;
  const readyProviderLabels = readyProviders
    .map((provider) => provider.statusLabel.replace(' готов', ''))
    .join(', ');
  const hasAnyProviderSignal =
    partialProviders.length > 0 ||
    providers.some((provider) => provider.configured || provider.enabled);
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : devEnabled || hasAnyProviderSignal || realSendEnabled
      ? 'PARTIAL'
      : 'BLOCKED';

  return {
    status,
    statusLabel: ready
      ? 'provider готов'
      : devEnabled
        ? 'demo-код'
        : status === 'PARTIAL'
          ? 'частично'
          : 'нужен provider',
    ready,
    configured: devEnabled || providers.some((provider) => provider.configured),
    enabled: devEnabled || providers.some((provider) => provider.enabled),
    requiredEnv: [
      'GUEST_PORTAL_DEV_OTP_ENABLED',
      'GUEST_PORTAL_OTP_REAL_SEND_ENABLED',
      'GUEST_PORTAL_OTP_SMS_ENABLED',
      'GUEST_PORTAL_OTP_TELEGRAM_ENABLED',
      'GUEST_PORTAL_OTP_MAX_ENABLED',
    ],
    note: ready
      ? `Production OTP имеет готовый канал: ${readyProviderLabels}. Гостевой портал не показывает код и использует безопасный guest-token.`
      : devEnabled
        ? 'Включен dev/demo OTP: подходит для теста, но не для production-верификации гостей.'
        : 'Реальная SMS/Telegram/MAX-доставка OTP еще не подключена; без dev/demo-кода гостевой вход не пройдет.',
    nextAction: ready
      ? 'Проверить один тестовый вход гостя и delivery audit по выбранному каналу, не включая массовые коммуникации.'
      : 'Согласовать OTP-провайдера и consent-сценарий; demo-код включать только для тестов, production запускать по одному каналу.',
    sms,
    telegram,
    max,
  };
}

function guestPortalUserCallAuthReadiness(): GuestGameIntegrationReadinessItem {
  const enabled = envFlag('GUEST_PORTAL_USER_CALL_ENABLED');
  const phoneNumber = envString('GUEST_PORTAL_USER_CALL_PHONE_NUMBER');
  const secret = envString('GUEST_PORTAL_USER_CALL_SECRET');
  const smsRuApiId = envString('GUEST_PORTAL_USER_CALL_SMS_RU_API_ID');
  const provider = normalizeGuestPortalUserCallProviderEnv(
    envString('GUEST_PORTAL_USER_CALL_PROVIDER') ??
      (smsRuApiId ? 'SMS_RU_CALLCHECK' : 'MANUAL'),
  );
  const configured =
    provider === 'SMS_RU_CALLCHECK'
      ? Boolean(smsRuApiId)
      : Boolean(phoneNumber && secret);
  const ready = enabled && configured;
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : enabled || phoneNumber || secret || smsRuApiId
      ? 'PARTIAL'
      : 'BLOCKED';
  const requiredEnv = [
    ...(enabled ? [] : ['GUEST_PORTAL_USER_CALL_ENABLED']),
    ...(provider === 'SMS_RU_CALLCHECK'
      ? smsRuApiId
        ? []
        : ['GUEST_PORTAL_USER_CALL_SMS_RU_API_ID']
      : [
          ...(phoneNumber ? [] : ['GUEST_PORTAL_USER_CALL_PHONE_NUMBER']),
          ...(secret ? [] : ['GUEST_PORTAL_USER_CALL_SECRET']),
        ]),
  ];
  const providerLabel =
    provider === 'SMS_RU_CALLCHECK' ? 'SMS.ru Callcheck' : 'ручной callback';

  return {
    key: 'USER_CALL_AUTH',
    title: 'Звонок пользователя для входа',
    status,
    statusLabel: ready
      ? 'готов'
      : status === 'PARTIAL'
        ? 'частично'
        : 'не настроен',
    ready,
    configured,
    enabled,
    requiredEnv,
    details: [
      {
        label: 'Флаг',
        value: enabled ? 'включен' : 'выключен',
      },
      {
        label: 'Provider',
        value: providerLabel,
      },
      ...(provider === 'SMS_RU_CALLCHECK'
        ? [
            {
              label: 'SMS.ru api_id',
              value: smsRuApiId ? 'настроен' : 'нужен',
            },
          ]
        : [
            {
              label: 'Номер',
              value: phoneNumber ? 'настроен' : 'нужен',
            },
            {
              label: 'Callback secret',
              value: secret ? 'настроен' : 'нужен',
            },
          ]),
    ],
    note: ready
      ? provider === 'SMS_RU_CALLCHECK'
        ? 'Fallback-вход по SMS.ru Callcheck готов: /game/auth создает USER_CALL challenge, гость звонит на выданный SMS.ru номер, а LeetPlus подтверждает статус polling-запросом.'
        : 'Fallback-вход по звонку готов: /game/auth создает USER_CALL challenge, гость звонит на настроенный номер, а call-provider подтверждает caller id сервисным callback.'
      : 'Звонок пользователя остается вторым каналом после Telegram-бота; сейчас поддержаны ручной callback provider и SMS.ru Callcheck.',
    nextAction: ready
      ? 'Проверить /game/auth на тестовом госте: создать вход по звонку, позвонить с введенного номера и подтвердить callback без раскрытия raw phone.'
      : 'Задать env GUEST_PORTAL_USER_CALL_ENABLED и либо GUEST_PORTAL_USER_CALL_SMS_RU_API_ID для SMS.ru, либо GUEST_PORTAL_USER_CALL_PHONE_NUMBER/GUEST_PORTAL_USER_CALL_SECRET для ручного provider.',
    runbook: guestAuthFallbackRunbook,
  };
}

function guestPortalIncomingCallLast4Readiness(): GuestGameIntegrationReadinessItem {
  const enabled = envFlag('GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED');
  const endpoint = envString('GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT');
  const token = envString('GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN');
  const configured = Boolean(endpoint && token);
  const ready = enabled && configured;
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : enabled || endpoint || token
      ? 'PARTIAL'
      : 'BLOCKED';
  const requiredEnv = [
    ...(enabled ? [] : ['GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED']),
    ...(endpoint ? [] : ['GUEST_PORTAL_INCOMING_CALL_LAST4_ENDPOINT']),
    ...(token ? [] : ['GUEST_PORTAL_INCOMING_CALL_LAST4_TOKEN']),
  ];

  return {
    key: 'INCOMING_CALL_LAST4_AUTH',
    title: 'Входящий звонок с 4 цифрами',
    status,
    statusLabel: ready
      ? 'готов'
      : status === 'PARTIAL'
        ? 'частично'
        : 'не настроен',
    ready,
    configured,
    enabled,
    requiredEnv,
    details: [
      {
        label: 'Флаг',
        value: enabled ? 'включен' : 'выключен',
      },
      {
        label: 'Provider endpoint',
        value: endpoint ? 'настроен' : 'нужен',
      },
      {
        label: 'Provider token',
        value: token ? 'настроен' : 'нужен',
      },
    ],
    note: ready
      ? 'Резервный вход готов: /game/auth создает challenge, provider звонит гостю с номером, последние 4 цифры которого проверяются в LeetPlus.'
      : 'Четвертый канал оставлен резервом после Telegram-бота, звонка пользователя на номер и SMS-кода; для запуска нужен отдельный call-provider исходящих звонков.',
    nextAction: ready
      ? 'Проверить один тестовый вход: создать звонок, ввести последние 4 цифры номера и убедиться, что raw phone не попадает в UI.'
      : 'Подключать только после стабилизации первых трех каналов: задать GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED, endpoint и token.',
    runbook: guestAuthFallbackRunbook,
  };
}

function guestPortalOtpProviderReadiness({
  channelLabel,
  realSendEnabled,
  channelEnabled,
  configured,
  requiredEnv,
  details,
  configuredNote,
  blockedNote,
  safetyReady = true,
  safetyRequiredEnv = [],
  partialNote,
  nextAction,
}: {
  channelLabel: string;
  realSendEnabled: boolean;
  channelEnabled: boolean;
  configured: boolean;
  requiredEnv: string[];
  details?: Array<{ label: string; value: string }>;
  configuredNote: string;
  blockedNote: string;
  safetyReady?: boolean;
  safetyRequiredEnv?: string[];
  partialNote?: string;
  nextAction: string;
}): GuestPortalOtpProviderReadiness {
  const ready = realSendEnabled && channelEnabled && configured && safetyReady;
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : realSendEnabled || channelEnabled || configured || !safetyReady
      ? 'PARTIAL'
      : 'BLOCKED';

  return {
    status,
    statusLabel: ready
      ? `${channelLabel} готов`
      : status === 'PARTIAL'
        ? 'частично'
        : 'не настроено',
    ready,
    configured,
    enabled: realSendEnabled && channelEnabled,
    requiredEnv: [...requiredEnv, ...safetyRequiredEnv],
    details,
    note: ready
      ? configuredNote
      : status === 'PARTIAL'
        ? (partialNote ??
          `${channelLabel} OTP настроен частично: проверьте общий флаг реальной отправки, флаг канала и provider-секреты.`)
        : blockedNote,
    nextAction,
  };
}

function guestPortalOtpSmsRateLimitReadiness() {
  const limits = {
    phoneWindowMinutes: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES',
      otpSmsRateLimitDefaults.phoneWindowMinutes,
    ),
    phoneMax: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX',
      otpSmsRateLimitDefaults.phoneMax,
    ),
    storeWindowMinutes: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES',
      otpSmsRateLimitDefaults.storeWindowMinutes,
    ),
    storeMax: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX',
      otpSmsRateLimitDefaults.storeMax,
    ),
    tenantWindowMinutes: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES',
      otpSmsRateLimitDefaults.tenantWindowMinutes,
    ),
    tenantMax: envNonNegativeInt(
      'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX',
      otpSmsRateLimitDefaults.tenantMax,
    ),
  };
  const disabled = [
    ...(limits.phoneWindowMinutes > 0 && limits.phoneMax > 0
      ? []
      : [
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_WINDOW_MINUTES',
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_PHONE_MAX',
        ]),
    ...(limits.storeWindowMinutes > 0 && limits.storeMax > 0
      ? []
      : [
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_WINDOW_MINUTES',
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_STORE_MAX',
        ]),
    ...(limits.tenantWindowMinutes > 0 && limits.tenantMax > 0
      ? []
      : [
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_WINDOW_MINUTES',
          'GUEST_PORTAL_OTP_SMS_RATE_LIMIT_TENANT_MAX',
        ]),
  ];

  return {
    ready: disabled.length === 0,
    requiredEnv: Array.from(new Set(disabled)),
    details: [
      {
        label: 'Лимит телефона',
        value: rateLimitDetail(limits.phoneMax, limits.phoneWindowMinutes),
      },
      {
        label: 'Лимит клуба',
        value: rateLimitDetail(limits.storeMax, limits.storeWindowMinutes),
      },
      {
        label: 'Лимит tenant',
        value: rateLimitDetail(limits.tenantMax, limits.tenantWindowMinutes),
      },
    ],
  };
}

function rateLimitDetail(max: number, windowMinutes: number) {
  if (max <= 0 || windowMinutes <= 0) {
    return 'отключен';
  }

  return `${max} за ${windowMinutes} мин`;
}

type DeliveryProviderConfig = {
  realSendEnabled: boolean;
  telegram: {
    enabled: boolean;
    token: string;
  };
  max: {
    enabled: boolean;
    token: string;
    endpoint: string;
    liveCanaryEnabled: boolean;
  };
};

type BotConsumerConfig = {
  dryRun: boolean;
  configured: boolean;
  limit: number;
  canaryLimit: boolean;
  channels: Array<'TELEGRAM' | 'MAX'>;
  requiredEnv: string[];
};

const botConsumerRunbook = {
  label: 'Runbook VDS',
  path: 'docs/deployment/systemd/README.md',
  href: 'https://github.com/boozik3412/leetplus/tree/main/docs/deployment/systemd',
};

const telegramAuthRunbook = {
  label: 'Runbook Telegram-входа',
  path: 'docs/deployment/telegram-auth.md',
  href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
};

const guestAuthFallbackRunbook = {
  label: 'Runbook fallback-входа',
  path: 'docs/deployment/guest-auth-fallbacks.md',
  href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/guest-auth-fallbacks.md',
};

const bonusLedgerSchedulerRunbook = {
  label: 'Runbook scheduler',
  path: 'docs/deployment/bonus-ledger-scheduler.md',
  href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/bonus-ledger-scheduler.md',
};

function deliveryProviderConfig(): DeliveryProviderConfig {
  return {
    realSendEnabled: envFlag('GUEST_GAME_DELIVERY_REAL_SEND_ENABLED'),
    telegram: {
      enabled: envFlag('GUEST_GAME_TELEGRAM_DELIVERY_ENABLED'),
      token:
        envString('GUEST_GAME_TELEGRAM_BOT_TOKEN') ??
        envString('TELEGRAM_BOT_TOKEN') ??
        '',
    },
    max: {
      enabled: envFlag('GUEST_GAME_MAX_DELIVERY_ENABLED'),
      token:
        envString('GUEST_GAME_MAX_BOT_TOKEN') ??
        envString('MAX_BOT_TOKEN') ??
        '',
      endpoint: envString('GUEST_GAME_MAX_DELIVERY_ENDPOINT') ?? '',
      liveCanaryEnabled: envFlag('GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED'),
    },
  };
}

function botConsumerConfig(tenantSlug?: string): BotConsumerConfig {
  const dryRunEnv = envString('GUEST_GAME_BOT_CONSUMER_DRY_RUN');
  const dryRun = dryRunEnv === null ? true : booleanValue(dryRunEnv);
  const limit = botConsumerLimit(envString('GUEST_GAME_BOT_CONSUMER_LIMIT'));
  const syncTokenConfigured = Boolean(
    envString('GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN') ??
    envString('SYNC_SERVICE_TOKEN'),
  );
  const tenantScopeConfigured = Boolean(
    envString('GUEST_GAME_BOT_CONSUMER_TENANT_ID') ??
    envString('GUEST_GAME_BOT_CONSUMER_TENANT_SLUG'),
  );
  const telegramTokenConfigured = Boolean(
    envString('GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN') ??
    envString('GUEST_GAME_TELEGRAM_BOT_TOKEN') ??
    envString('GUEST_PORTAL_TELEGRAM_BOT_TOKEN') ??
    envString('TELEGRAM_BOT_TOKEN'),
  );
  const maxProviderConfigured = Boolean(
    (envString('GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT') ??
      envString('GUEST_GAME_MAX_DELIVERY_ENDPOINT')) &&
    (envString('GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN') ??
      envString('GUEST_GAME_MAX_BOT_TOKEN') ??
      envString('MAX_BOT_TOKEN')),
  );
  const channels = botConsumerChannels(
    envString('GUEST_GAME_BOT_CONSUMER_CHANNELS'),
  );
  const requiredEnv: string[] = [];

  if (!syncTokenConfigured) {
    requiredEnv.push(
      'GUEST_GAME_BOT_CONSUMER_SYNC_TOKEN or SYNC_SERVICE_TOKEN',
    );
  }

  if (!tenantScopeConfigured) {
    requiredEnv.push(
      tenantSlug
        ? `GUEST_GAME_BOT_CONSUMER_TENANT_SLUG=${tenantSlug} or GUEST_GAME_BOT_CONSUMER_TENANT_ID`
        : 'GUEST_GAME_BOT_CONSUMER_TENANT_ID or GUEST_GAME_BOT_CONSUMER_TENANT_SLUG',
    );
  }

  if (!dryRun && channels.includes('TELEGRAM') && !telegramTokenConfigured) {
    requiredEnv.push(
      'GUEST_GAME_BOT_CONSUMER_TELEGRAM_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN',
    );
  }

  if (!dryRun && channels.includes('MAX') && !maxProviderConfigured) {
    requiredEnv.push(
      'GUEST_GAME_BOT_CONSUMER_MAX_DELIVERY_ENDPOINT or GUEST_GAME_MAX_DELIVERY_ENDPOINT',
      'GUEST_GAME_BOT_CONSUMER_MAX_BOT_TOKEN or GUEST_GAME_MAX_BOT_TOKEN',
    );
  }

  return {
    dryRun,
    configured: requiredEnv.length === 0,
    limit,
    canaryLimit: limit === 1,
    channels,
    requiredEnv,
  };
}

function compareBotConsumerDeliveryCandidate(
  left: GuestGameDelivery,
  right: GuestGameDelivery,
) {
  const preparedDelta =
    dateTimeMs(left.preparedAt) - dateTimeMs(right.preparedAt);

  if (preparedDelta !== 0) {
    return preparedDelta;
  }

  return dateTimeMs(left.createdAt) - dateTimeMs(right.createdAt);
}

function dateTimeString(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function dateTimeMs(value: string | Date | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function botConsumerLimit(value: string | null) {
  const parsed = value === null ? NaN : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(Math.floor(parsed), 50);
}

function botConsumerChannels(value: string | null): Array<'TELEGRAM' | 'MAX'> {
  const raw = value ? value.split(',') : ['TELEGRAM'];
  const channels = raw
    .map((item) => item.trim().toUpperCase())
    .filter(
      (item): item is 'TELEGRAM' | 'MAX' =>
        item === 'TELEGRAM' || item === 'MAX',
    );

  return [...new Set(channels)].length ? [...new Set(channels)] : ['TELEGRAM'];
}

function botConsumerNextAction(
  config: BotConsumerConfig,
  pendingReady: number,
  lastAckAt: string | null,
  canaryRequired = false,
) {
  if (!config.configured) {
    return `Настроить env внешнего bot-consumer: ${config.requiredEnv.join(', ')}.`;
  }

  if (canaryRequired) {
    return 'Перед первым real-send поставить GUEST_GAME_BOT_CONSUMER_LIMIT=1, запустить one-shot canary и проверить первый SENT/FAILED/BLOCKED ack в Guest Game Hub.';
  }

  if (config.dryRun) {
    return pendingReady > 0
      ? 'Запустить VDS runner в dry-run и проверить pull без внешней отправки и ack.'
      : 'Ожидать READY_FOR_BOT доставку или подготовить outbox из готовых наград.';
  }

  if (pendingReady > 0) {
    return lastAckAt
      ? 'Проверить новый tick runner и ack-события; pending доставки еще ждут обработки.'
      : 'Запустить real Telegram runner и дождаться первого SENT/FAILED ack.';
  }

  return lastAckAt
    ? 'Очередь пуста; контролировать следующий ack после появления новых READY_FOR_BOT доставок.'
    : 'Очередь пуста; сначала подготовить outbox и подтвердить Telegram-связь гостя.';
}

function deliveryDispatchChannels(
  value: GuestGameDeliveryDispatchDto['channels'],
): Array<'TELEGRAM' | 'MAX'> {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : ['TELEGRAM', 'MAX'];
  const channels = raw
    .map((item) => item.trim().toUpperCase())
    .filter(
      (item): item is 'TELEGRAM' | 'MAX' =>
        item === 'TELEGRAM' || item === 'MAX',
    );

  return [...new Set(channels)].length
    ? [...new Set(channels)]
    : ['TELEGRAM', 'MAX'];
}

function mapBotDeliveryItem(
  row: DeliveryRow,
  tenantSlug: string,
): GuestGameBotDeliveryItem | null {
  const channel = deliveryChannelValue(row.channel, null);

  if (channel !== 'TELEGRAM' && channel !== 'MAX') {
    return null;
  }

  const telegramChatId =
    channel === 'TELEGRAM'
      ? telegramChatIdFromIdentity(row.profile?.telegramIdentity ?? null)
      : null;
  const maxIdentity =
    channel === 'MAX'
      ? (nullableString(row.profile?.maxIdentity) ?? null)
      : null;

  if (channel === 'TELEGRAM' && !telegramChatId) {
    return null;
  }

  if (channel === 'MAX' && !maxIdentity) {
    return null;
  }

  return {
    tenantId: row.tenantId,
    tenantSlug,
    deliveryId: row.id,
    rewardId: row.rewardId,
    channel,
    channelLabel: communicationQueueChannelLabel(channel),
    recipient: {
      telegramChatId,
      maxIdentity,
      identityMasked: row.channelIdentityMasked,
      recipientMasked: row.recipientMasked,
    },
    message: {
      title: row.messageTitle,
      body: row.messageBody,
    },
    reward: {
      label: row.reward.rewardLabel,
      amount: numberValue(row.reward.rewardAmount),
      type: row.reward.rewardType,
      code: row.reward.rewardCode,
      expiresAt: iso(row.reward.expiresAt),
    },
    store: row.store ? { id: row.store.id, name: row.store.name } : null,
    preparedAt: row.preparedAt.toISOString(),
  };
}

function botDeliveryAckStatusValue(
  value: unknown,
): GuestGameBotDeliveryAckStatus {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (status === 'SENT' || status === 'FAILED' || status === 'BLOCKED') {
    return status;
  }

  throw new BadRequestException(
    'status must be one of SENT, FAILED or BLOCKED',
  );
}

function botDeliveryAckEventType(status: GuestGameBotDeliveryAckStatus) {
  if (status === 'SENT') {
    return 'DELIVERY_BOT_CONSUMER_SENT';
  }

  if (status === 'FAILED') {
    return 'DELIVERY_BOT_CONSUMER_FAILED';
  }

  return 'DELIVERY_BOT_CONSUMER_BLOCKED';
}

function isTerminalBotAckStatus(
  status: string,
): status is GuestGameBotDeliveryAckStatus {
  return status === 'SENT' || status === 'FAILED' || status === 'BLOCKED';
}

function botDeliveryAckDefaultNote(status: GuestGameBotDeliveryAckStatus) {
  if (status === 'SENT') {
    return 'External bot consumer reported successful delivery.';
  }

  if (status === 'FAILED') {
    return 'External bot consumer reported delivery failure.';
  }

  return 'External bot consumer blocked delivery.';
}

function botDeliveryAckPayload(
  dto: GuestGameBotDeliveryAckDto,
  status: GuestGameBotDeliveryAckStatus,
  channel: 'TELEGRAM' | 'MAX',
): Prisma.InputJsonValue {
  return clean({
    source: 'guest_game_bot_consumer',
    status,
    channel,
    providerMessageId: boundedString(dto.providerMessageId, 160),
    providerStatus: boundedString(dto.providerStatus, 160),
    errorCode: boundedString(dto.errorCode, 160),
    externalEventId: boundedString(dto.externalEventId, 160),
  });
}

function deliveryProviderForChannel(
  config: DeliveryProviderConfig,
  channel: 'TELEGRAM' | 'MAX',
): GuestGameDeliveryProviderStatus {
  return deliveryProviderStatus(config, channel, 0);
}

function deliveryProviderStatus(
  config: DeliveryProviderConfig,
  channel: 'TELEGRAM' | 'MAX',
  pendingReady: number,
): GuestGameDeliveryProviderStatus {
  if (channel === 'TELEGRAM') {
    const enabledByEnv = config.realSendEnabled && config.telegram.enabled;
    const configured = config.telegram.token.length > 0;
    const canAttemptSend = enabledByEnv && configured;

    return {
      channel,
      channelLabel: 'Telegram',
      pendingReady,
      enabledByEnv,
      configured,
      canAttemptSend,
      dryRunOnly: !config.realSendEnabled,
      requiredEnv: [
        'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
        'GUEST_GAME_TELEGRAM_DELIVERY_ENABLED',
        'GUEST_GAME_TELEGRAM_BOT_TOKEN',
      ],
      note: !config.realSendEnabled
        ? 'Безопасный dry-run: включите GUEST_GAME_DELIVERY_REAL_SEND_ENABLED только после настройки согласий и бота.'
        : !config.telegram.enabled
          ? 'Telegram provider выключен env-флагом GUEST_GAME_TELEGRAM_DELIVERY_ENABLED.'
          : !configured
            ? 'Telegram bot token не настроен.'
            : 'Telegram provider настроен; отправка требует подтвержденный numeric chat_id гостя.',
    };
  }

  const enabledByEnv = config.realSendEnabled && config.max.enabled;
  const configured =
    config.max.token.length > 0 && config.max.endpoint.length > 0;
  const canAttemptSend =
    enabledByEnv && configured && config.max.liveCanaryEnabled;

  return {
    channel,
    channelLabel: 'MAX',
    pendingReady,
    enabledByEnv,
    configured,
    canAttemptSend,
    dryRunOnly: !config.realSendEnabled,
    requiredEnv: [
      'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
      'GUEST_GAME_MAX_DELIVERY_ENABLED',
      'GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED',
      'GUEST_GAME_MAX_BOT_TOKEN',
      'GUEST_GAME_MAX_DELIVERY_ENDPOINT',
    ],
    note: canAttemptSend
      ? 'MAX provider настроен через generic delivery endpoint; real-send разрешен только явным live-canary флагом.'
      : configured && enabledByEnv && !config.max.liveCanaryEnabled
        ? 'MAX provider настроен, но live-send заблокирован до явного GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED=true.'
        : 'MAX provider не настроен или не включен; нужен подтвержденный endpoint и токен.',
  };
}

function deliveryProviderBlockerNote(
  channel: 'TELEGRAM' | 'MAX',
  provider: GuestGameDeliveryProviderStatus,
  options: { identityReady: boolean },
) {
  if (!options.identityReady) {
    return channel === 'TELEGRAM'
      ? 'Telegram alias не является numeric chat_id: гость должен открыть бота, чтобы LeetPlus получил безопасный chat_id.'
      : 'MAX identity гостя еще не привязана к игровому профилю.';
  }

  if (provider.dryRunOnly) {
    return 'Dispatcher работает в безопасном dry-run или provider пока не поддерживает реальную отправку.';
  }

  if (!provider.enabledByEnv) {
    return `${provider.channelLabel} provider выключен env-настройками.`;
  }

  if (!provider.configured) {
    return `${provider.channelLabel} provider не настроен токеном/endpoint.`;
  }

  return provider.note;
}

function checkInDateLabel(parts: { year: number; month: number; day: number }) {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function checkInAddLocalDays(
  parts: { year: number; month: number; day: number },
  days: number,
) {
  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function telegramChatIdFromIdentity(value: string | null) {
  const identity = nullableString(value);

  if (!identity) {
    return null;
  }

  const normalized = identity.replace(/^(chat:|tg:)/i, '').trim();

  return /^-?\d{5,32}$/.test(normalized) ? normalized : null;
}

function deliveryDispatchPayload(data: {
  dryRun: boolean;
  providerConfigured: boolean;
  reason: string;
  providerMessageId?: string | null;
}): Prisma.InputJsonValue {
  return clean(data);
}

function deliveryProviderMessage(row: DeliveryRow) {
  const code = row.reward.rewardCode ? `\nКод: ${row.reward.rewardCode}` : '';

  return `${row.messageTitle}\n\n${row.messageBody}${code}\n\nLeetPlus`;
}

async function sendTelegramDelivery({
  token,
  chatId,
  text,
}: {
  token: string;
  chatId: string;
  text: string;
}): Promise<Prisma.InputJsonValue> {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  } | null;

  if (!response.ok || body?.ok === false) {
    throw new Error(
      `Telegram sendMessage failed: ${body?.description ?? response.status}`,
    );
  }

  return clean({
    provider: 'TELEGRAM',
    providerMessageId: body?.result?.message_id
      ? String(body.result.message_id)
      : null,
  });
}

async function sendMaxDelivery({
  endpoint,
  token,
  identity,
  text,
  row,
}: {
  endpoint: string;
  token: string;
  identity: string;
  text: string;
  row: DeliveryRow;
}): Promise<Prisma.InputJsonValue> {
  if (!identity) {
    throw new Error('MAX identity is not configured for this delivery.');
  }

  if (!endpoint || !token) {
    throw new Error('MAX delivery endpoint or token is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: 'MAX',
      recipient: {
        identity,
        identityMasked: row.channelIdentityMasked,
        recipientMasked: row.recipientMasked,
      },
      message: {
        title: row.messageTitle,
        body: row.messageBody,
        text,
      },
      delivery: {
        id: row.id,
        rewardId: row.rewardId,
        tenantId: row.reward.tenantId,
        preparedAt: row.preparedAt.toISOString(),
      },
      reward: {
        label: nullableString(row.reward.rewardLabel) ?? row.reward.rewardType,
        amount: numberValue(row.reward.rewardAmount),
        type: row.reward.rewardType,
        code: row.reward.rewardCode,
        expiresAt: dateTimeString(row.reward.expiresAt),
      },
      store: row.store ? { id: row.store.id, name: row.store.name } : null,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    status?: string;
    description?: string;
    error?: string;
    messageId?: string | number;
    message_id?: string | number;
    id?: string | number;
    result?: {
      messageId?: string | number;
      message_id?: string | number;
      id?: string | number;
    };
  } | null;

  if (!response.ok || body?.ok === false || body?.status === 'error') {
    throw new Error(
      `MAX delivery failed: ${
        body?.description ?? body?.error ?? response.status
      }`,
    );
  }

  const providerMessageId =
    body?.messageId ??
    body?.message_id ??
    body?.id ??
    body?.result?.messageId ??
    body?.result?.message_id ??
    body?.result?.id ??
    null;

  return clean({
    provider: 'MAX',
    providerMessageId:
      providerMessageId === null ? null : String(providerMessageId),
    providerStatus: 'max:ok',
  });
}

function safeDeliveryErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Delivery provider error';

  return message.slice(0, 300);
}

function envString(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

function envFlag(name: string) {
  const value = envString(name)?.toLowerCase();

  return value === '1' || value === 'true' || value === 'yes';
}

function normalizeGuestPortalUserCallProviderEnv(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (
    normalized === 'SMS_RU_CALLCHECK' ||
    normalized === 'SMS_RU' ||
    normalized === 'SMSRU' ||
    normalized === 'SMSRU_CALLCHECK'
  ) {
    return 'SMS_RU_CALLCHECK';
  }

  return 'MANUAL';
}

function envOptionalFlag(name: string): boolean | null {
  const value = envString(name)?.toLowerCase();

  if (!value) {
    return null;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  return null;
}

function envPositiveInt(name: string, fallback: number) {
  const parsed = Number(envString(name));
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;

  return value > 0 ? value : fallback;
}

function envNonNegativeInt(name: string, fallback: number) {
  const raw = envString(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(parsed));
}

function bonusLedgerSchedulerReadiness(
  langameBonusAccrualEnabled: boolean,
  runtimeStatus?: GuestBonusLedgerSchedulerRuntimeStatus | null,
): GuestGameIntegrationReadinessItem {
  const explicitEnabled = envOptionalFlag(
    'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
  );
  const dryRunOverride = envOptionalFlag(
    'GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN',
  );
  const queueApprovedRewards =
    envOptionalFlag(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS',
    ) ?? true;
  const syncTokenConfigured = Boolean(envString('SYNC_SERVICE_TOKEN'));
  const nodeEnv = envString('NODE_ENV');
  const defaultProductionEnabled =
    nodeEnv === 'production' && syncTokenConfigured;
  const enabled =
    runtimeStatus?.enabled ?? explicitEnabled ?? defaultProductionEnabled;
  const forcedDryRun = dryRunOverride === true;
  const intervalMs =
    runtimeStatus?.intervalMs ??
    envPositiveInt(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_INTERVAL_MS',
      5 * 60 * 1000,
    );
  const limit = envPositiveInt('GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT', 50);
  const tenantScope =
    envString('GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG') ??
    envString('GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_ID') ??
    'все tenant';
  const rewardTypes =
    envString('GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES') ??
    envString('LANGAME_BONUS_ACCRUAL_REWARD_TYPES') ??
    'BONUS,BONUS_POINTS,BONUS_BALANCE,LOYALTY_BONUS';
  const ready = enabled && !forcedDryRun && langameBonusAccrualEnabled;
  const configured =
    syncTokenConfigured ||
    explicitEnabled !== null ||
    Boolean(runtimeStatus?.enabled);
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : enabled
      ? 'MANUAL_ONLY'
      : configured
        ? 'PARTIAL'
        : 'BLOCKED';

  return {
    key: 'BONUS_LEDGER_SCHEDULER',
    title: 'Автозапуск bonus ledger',
    status,
    statusLabel: ready
      ? 'автоначисление'
      : enabled
        ? forcedDryRun
          ? 'dry-run'
          : 'ждет write API'
        : configured
          ? 'выключен'
          : 'нужен token',
    ready,
    configured,
    enabled,
    requiredEnv: [
      'SYNC_SERVICE_TOKEN',
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN',
      'LANGAME_BONUS_ACCRUAL_ENABLED',
    ],
    details: bonusLedgerSchedulerDetails({
      enabled,
      intervalMs,
      limit,
      tenantScope,
      rewardTypes,
      queueApprovedRewards,
      runtimeStatus,
    }),
    runbook: bonusLedgerSchedulerRunbook,
    note: ready
      ? `Scheduler обрабатывает ledger каждые ${intervalMs} мс, лимит ${limit}, scope ${tenantScope}, reward types ${rewardTypes}. Queue approved rewards: ${queueApprovedRewards ? 'on' : 'off'}.`
      : enabled
        ? forcedDryRun
          ? `Scheduler включен в dry-run: проверяет очередь каждые ${intervalMs} мс без claim и записи в Langame.`
          : 'Scheduler включен, но реальные начисления ждут LANGAME_BONUS_ACCRUAL_ENABLED=true.'
        : configured
          ? 'Scheduler настроен частично или выключен явно; автономная обработка bonus ledger не запущена.'
          : 'Scheduler не запущен: нужен SYNC_SERVICE_TOKEN или явное включение на VDS.',
    nextAction: ready
      ? 'Проверить первый production batch на одной награде и затем сверить GuestBonusBalanceCurrent с ночным Langame snapshot.'
      : enabled
        ? forcedDryRun
          ? 'Снять dry-run только после проверки очереди, tenant Langame ключа и тестовой записи.'
          : 'Включить LANGAME_BONUS_ACCRUAL_ENABLED=true только после dry-run и проверки tenant Langame ключа.'
        : configured
          ? 'Включить GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=true или убрать явное выключение после согласования VDS/env.'
          : 'Задать SYNC_SERVICE_TOKEN на VDS и включить scheduler сначала в dry-run/canary для 1337.',
  };
}

function bonusLedgerSchedulerDetails({
  enabled,
  intervalMs,
  limit,
  tenantScope,
  rewardTypes,
  queueApprovedRewards,
  runtimeStatus,
}: {
  enabled: boolean;
  intervalMs: number;
  limit: number;
  tenantScope: string;
  rewardTypes: string;
  queueApprovedRewards: boolean;
  runtimeStatus?: GuestBonusLedgerSchedulerRuntimeStatus | null;
}): GuestGameIntegrationReadinessItem['details'] {
  const details: GuestGameIntegrationReadinessItem['details'] = [
    {
      label: 'Состояние',
      value: runtimeStatus?.running
        ? 'выполняется'
        : enabled
          ? 'включен'
          : 'выключен',
    },
    { label: 'Интервал', value: `${intervalMs} мс` },
    { label: 'Лимит', value: String(limit) },
    { label: 'Scope', value: tenantScope },
    { label: 'Reward types', value: rewardTypes },
    {
      label: 'Queue approved',
      value: queueApprovedRewards ? 'on' : 'off',
    },
    {
      label: 'Последний запуск',
      value: bonusLedgerSchedulerLastRunLabel(runtimeStatus),
    },
    {
      label: 'Последний результат',
      value: bonusLedgerSchedulerLastResultLabel(runtimeStatus),
    },
  ];

  if (runtimeStatus?.lastSkippedAt) {
    details.push({
      label: 'Последний skip',
      value: `${runtimeStatus.lastSkippedAt}: ${
        runtimeStatus.lastSkipReason ?? 'previous dispatch is still running'
      }`,
    });
  }

  return details;
}

function bonusLedgerSchedulerLastRunLabel(
  runtimeStatus?: GuestBonusLedgerSchedulerRuntimeStatus | null,
) {
  if (!runtimeStatus?.lastStartedAt) {
    return runtimeStatus?.running ? 'выполняется' : 'еще не запускался';
  }

  const outcome =
    runtimeStatus.lastOutcome === 'SUCCESS'
      ? 'успех'
      : runtimeStatus.lastOutcome === 'ERROR'
        ? 'ошибка'
        : runtimeStatus.running
          ? 'выполняется'
          : 'нет результата';

  if (!runtimeStatus.lastFinishedAt) {
    return `${outcome} · старт ${runtimeStatus.lastStartedAt}`;
  }

  return `${outcome} · ${runtimeStatus.lastFinishedAt}`;
}

function bonusLedgerSchedulerLastResultLabel(
  runtimeStatus?: GuestBonusLedgerSchedulerRuntimeStatus | null,
) {
  const result = runtimeStatus?.lastResult;

  if (!result) {
    return runtimeStatus?.lastError
      ? `ошибка: ${runtimeStatus.lastError}`
      : 'нет результата';
  }

  return [
    `mode ${result.mode}`,
    `dryRun ${result.dryRun ? 'on' : 'off'}`,
    `tenants ${result.processedTenants}/${result.checkedTenants}`,
    `queued ${result.queued}`,
    `confirmed ${result.confirmed}`,
    `failed ${result.failed}`,
    `blocked ${result.blocked}`,
    `skipped ${result.skipped}`,
  ].join(', ');
}

function maskAlias(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length <= 4) {
    return `${trimmed[0] ?? '*'}***`;
  }

  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function rewardStatusEventType(status: string) {
  if (status === 'APPROVED') {
    return 'REWARD_APPROVED';
  }

  if (status === 'PAID') {
    return 'REWARD_PAID';
  }

  if (status === 'CANCELED') {
    return 'REWARD_CANCELED';
  }

  if (status === 'EXPIRED') {
    return 'REWARD_EXPIRED';
  }

  return 'REWARD_STATUS_CHANGED';
}

function buildRewardClaimPayload(rewardId: string, rewardCode: string) {
  return `LEETPLUS_REWARD:${rewardId}:${rewardCode}`;
}

function parseRewardClaimInput(dto: GuestGameRewardRedeemDto) {
  const raw =
    [dto.claimPayload, dto.claim, dto.rewardCode]
      .find((value) => typeof value === 'string' && value.trim().length > 0)
      ?.trim() ?? '';
  const prefix = 'LEETPLUS_REWARD:';

  if (raw.slice(0, prefix.length).toUpperCase() === prefix) {
    const [rewardId, ...codeParts] = raw.slice(prefix.length).split(':');

    return {
      raw,
      rewardId: rewardId?.trim() || null,
      code: codeParts.join(':').trim() || null,
    };
  }

  return {
    raw,
    rewardId: null,
    code: raw.trim() || null,
  };
}

function rewardCodeVariants(code: string) {
  return [...new Set([code.trim(), code.trim().toUpperCase()])].filter(
    (value) => value.length > 0,
  );
}

function buildRewardRedeemEvidence(
  previous: Prisma.JsonValue | null,
  dto: GuestGameRewardRedeemDto,
  claim: ReturnType<typeof parseRewardClaimInput>,
  redeemedAt: Date,
  redeemedByUserId: string,
) {
  const note = nullableString(dto.note);
  const storeId = nullableId(dto.storeId);

  return clean({
    source: 'cashier_redeem',
    redeemedAt: redeemedAt.toISOString(),
    redeemedByUserId,
    storeId,
    claim: claim.raw,
    rewardCode: claim.code,
    note,
    previousEvidence: previous ?? undefined,
  }) as Prisma.InputJsonValue;
}

function generateRewardCode() {
  return `LP-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function csvCell(value: unknown) {
  const text =
    value == null
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint'
        ? String(value)
        : (JSON.stringify(value) ?? '');

  return `"${text.replace(/"/g, '""')}"`;
}

function gameScenarioKindLabel(kind: GuestGameEconomyScenario['kind']) {
  switch (kind) {
    case 'LOOT_BOX':
      return 'Лутбокс';
    case 'MISSION':
      return 'Задание';
    case 'SEASON':
      return 'Battle Pass';
    case 'MANUAL':
    default:
      return 'Ручное';
  }
}

function gameScenarioStatusLabel(status: StatusValue | 'ACTIVE') {
  switch (status) {
    case 'DRAFT':
      return 'Черновик';
    case 'ACTIVE':
      return 'Активно';
    case 'PAUSED':
      return 'Пауза';
    case 'FINISHED':
      return 'Завершено';
    case 'ARCHIVED':
      return 'Архив';
    default:
      return status;
  }
}

function guestLogMappingPresetLabel(
  preset: GuestLogMappingPreset | null | undefined,
) {
  switch (preset) {
    case 'visit_or_session_start':
      return 'Визит или старт сессии';
    case 'session_finish':
      return 'Завершение сессии';
    case 'events_and_tournaments':
      return 'События и турниры';
    case 'balance_and_payment':
      return 'Баланс и оплаты';
    case 'manual_or_risk':
      return 'Ручные или риск-события';
    case 'custom':
      return 'Кастомный тип';
    default:
      return '';
  }
}

function guestLogMappingIntentLabel(
  intent: GuestLogMappingIntent | null | undefined,
) {
  switch (intent) {
    case 'allow':
      return 'Можно использовать в правилах';
    case 'block':
      return 'Блокировать как anti-fraud';
    default:
      return '';
  }
}

function mapEvent(row: EventRow): GuestGameEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    source: row.source as EventSource,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId: row.externalId,
    originKey: row.originKey,
    xpDelta: row.xpDelta,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    profile: mapProfileSummary(row.profile),
    guest: row.guest
      ? {
          id: row.guest.id,
          externalDomain: row.guest.externalDomain,
          externalGuestId: row.guest.externalGuestId,
          displayName: row.guest.fullNameMasked ?? row.guest.externalGuestId,
          contact: row.guest.phoneMasked ?? 'нет контакта',
        }
      : null,
    lootBox: row.lootBox,
    mission: row.mission,
    season: row.season,
    createdBy: mapUser(row.createdByUser),
  };
}

function mapSessionFacts(row: SnapshotSessionRow): GuestGameSnapshotFact[] {
  if (!row.startedAt) {
    return [];
  }

  // Completed sessions use the raw timestamp interval as the authority. The
  // synchronized integer can be rounded by an upstream source (59:30 -> 60),
  // which must never satisfy a 60-minute rule. Active sessions keep the
  // synchronized estimate for diagnostics only; no PLAY_HOUR is emitted until
  // the terminal stop timestamp is present.
  const completedMinutes = durationMinutes(row.startedAt, row.stoppedAt);
  const sessionMinutes = row.stoppedAt
    ? completedMinutes
    : (row.durationMinutes ?? null);
  const sessionPacket = row.packet ?? null;
  const sessionType = sessionPacket ? 'packet_hours' : 'regular_session';
  const guestName = snapshotGuestName(row.guest, row.externalGuestId);
  const facts: GuestGameSnapshotFact[] = [];
  const sessionClassificationStable =
    row.packet === true ||
    Boolean(row.stoppedAt) ||
    Date.now() - row.startedAt.getTime() >=
      snapshotSessionClassificationGraceMs;

  if (sessionClassificationStable) {
    facts.push({
      id: `session:${row.id}:start`,
      source: 'GUEST_SESSION',
      eventType: 'SESSION_START',
      occurredAt: row.startedAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.externalSessionId,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: mapSnapshotStore(row.store),
      sessionType,
      sessionPacket,
      sessionMinutes,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Старт сессии: ${guestName}`,
      details: [
        row.store?.name,
        sessionMinutes ? `${sessionMinutes} мин` : null,
        row.packet ? 'пакет/абонемент' : null,
        row.normalStop === false ? 'нестандартное завершение' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  // Session duration is mutable until Langame reports a stop. Persisting a
  // PLAY_HOUR event for an active session would make the later final duration
  // idempotent against stale 30/60-minute data.
  if (row.stoppedAt && row.stoppedAt.getTime() > row.startedAt.getTime()) {
    const terminalSessionMinutes = sessionMinutes ?? 0;
    facts.push({
      id: `session:${row.id}:play`,
      source: 'GUEST_SESSION',
      eventType: 'PLAY_HOUR',
      occurredAt: row.stoppedAt?.toISOString() ?? row.startedAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.externalSessionId,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: mapSnapshotStore(row.store),
      sessionType,
      sessionPacket,
      sessionMinutes: terminalSessionMinutes,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Игровое время: ${guestName}`,
      details: [
        row.store?.name,
        `${Math.round((terminalSessionMinutes / 60) * 10) / 10} ч`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  return facts;
}

function mapSessionPackageCorrectionFact(
  row: SnapshotSessionRow,
): GuestGameSnapshotFact {
  if (!row.startedAt) {
    throw new Error('Package classification correction requires startedAt.');
  }

  const guestName = snapshotGuestName(row.guest, row.externalGuestId);
  const externalId = [
    row.externalSessionId,
    'classification',
    snapshotSessionPackageCorrectionVersion,
  ].join(':');

  return {
    // The correction is a new canonical event, not a second physical session.
    // Keep the same source-fact identity as the initial SESSION_START so
    // ANY/count aggregations cannot count both classifications.
    id: `session:${row.id}:start`,
    source: 'GUEST_SESSION',
    eventType: 'SESSION_START',
    occurredAt: row.startedAt.toISOString(),
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId,
    guest: mapSnapshotGuest(row.guest, row.externalGuestId),
    store: mapSnapshotStore(row.store),
    sessionType: 'packet_hours',
    sessionPacket: true,
    sessionMinutes: row.stoppedAt
      ? durationMinutes(row.startedAt, row.stoppedAt)
      : (row.durationMinutes ?? null),
    sessionClassificationCorrection: 'PACKAGE_V1',
    spendAmount: null,
    tariffGroupId: null,
    tariffPeriodId: null,
    tariffTypeId: null,
    label: `РЈС‚РѕС‡РЅРµРЅРёРµ С‚РёРїР° СЃРµСЃСЃРёРё: ${guestName}`,
    details:
      'РџР°РєРµС‚ РёР»Рё Р°Р±РѕРЅРµРјРµРЅС‚ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ РїРѕСЃР»Рµ РїРµСЂРІРёС‡РЅРѕР№ РїРѕС‡Р°СЃРѕРІРѕР№ РєР»Р°СЃСЃРёС„РёРєР°С†РёРё.',
  };
}

function mapLogFact(row: SnapshotLogRow): GuestGameSnapshotFact[] {
  if (!row.happenedAt) {
    return [];
  }

  const eventType = guestLogEventType(row.type);
  const guestLogType = nullableString(row.type);

  return [
    {
      id: `log:${row.id}`,
      source: 'GUEST_LOG',
      eventType,
      occurredAt: row.happenedAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.sourceKey,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: null,
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      guestLogType,
      label: `Лог гостя: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: row.type ?? 'тип не указан',
    },
  ];
}

function mapTransactionFact(
  row: SnapshotTransactionRow,
): GuestGameSnapshotFact[] {
  if (!row.happenedAt) {
    return [];
  }

  const amount = numberOrNull(row.amount) ?? 0;
  const eventType = isTopUpFactType(row.type)
    ? 'BALANCE_TOPUP'
    : 'BAR_PURCHASE';

  return [
    {
      id: `transaction:${row.id}`,
      source: 'GUEST_TRANSACTION',
      eventType,
      occurredAt: row.happenedAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.externalTransactionId,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: mapSnapshotStore(row.store),
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: Math.abs(amount),
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `${eventType === 'BALANCE_TOPUP' ? 'Пополнение баланса' : 'Покупка/списание'}: ${snapshotGuestName(
        row.guest,
        row.externalGuestId,
      )}`,
      details: [
        row.type,
        amount ? `${Math.abs(amount)} руб` : null,
        row.store?.name,
        row.balance ? `баланс ${numberValue(row.balance)} руб` : null,
        row.bonusBalance ? `бонусы ${numberValue(row.bonusBalance)} руб` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
}

function mapOperationLogFact(
  row: SnapshotOperationLogRow,
): GuestGameSnapshotFact[] {
  if (!row.happenedAt) {
    return [];
  }

  const amount = numberOrNull(row.amount) ?? 0;
  const eventType = isTopUpFactType(row.type)
    ? 'BALANCE_TOPUP'
    : 'BAR_PURCHASE';

  return [
    {
      id: `operation:${row.id}`,
      source: 'GUEST_OPERATION_LOG',
      eventType,
      occurredAt: row.happenedAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.sourceKey,
      guest: null,
      store: mapSnapshotStore(row.store),
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: Math.abs(amount),
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label:
        row.operationName ??
        (eventType === 'BALANCE_TOPUP'
          ? 'Операция пополнения'
          : 'Операция покупки/списания'),
      details: [
        row.type,
        row.operationSource,
        row.operationForm,
        amount ? `${Math.abs(amount)} руб` : null,
        row.store?.name,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
}

function mapBalanceFact(row: SnapshotBalanceRow): GuestGameSnapshotFact[] {
  const balance = numberValue(row.balance);

  return [
    {
      id: `balance:${row.id}`,
      source: 'GUEST_BALANCE',
      eventType: 'BALANCE_SNAPSHOT',
      occurredAt: row.snapshotDate.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: `${row.externalGuestId}:${row.snapshotDate.toISOString()}`,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: null,
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Баланс гостя: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: `Баланс ${balance} руб`,
    },
  ];
}

function mapBonusBalanceFact(
  row: SnapshotBonusBalanceRow,
): GuestGameSnapshotFact[] {
  const bonusBalance = numberValue(row.bonusBalance);

  return [
    {
      id: `bonus-balance:${row.id}`,
      source: 'GUEST_BONUS_BALANCE',
      eventType: 'BONUS_BALANCE_SNAPSHOT',
      occurredAt: row.snapshotDate.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: `${row.externalGuestId}:${row.snapshotDate.toISOString()}`,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: null,
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Бонусный баланс: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: `Бонусы ${bonusBalance} руб`,
    },
  ];
}

function mapLoyaltyGroupFact(
  row: SnapshotLoyaltyGuestRow,
  group: SnapshotGuestGroupRow | null,
): GuestGameSnapshotFact[] {
  if (!row.externalGuestTypeId) {
    return [];
  }

  const occurredAt = row.lastActivityAt ?? row.updatedAt ?? row.insertedAt;
  const groupName = group?.name ?? row.externalGuestTypeId;
  const percent = group?.percent ? numberValue(group.percent) : null;
  const hoursFrom = group?.countHoursFrom
    ? numberValue(group.countHoursFrom)
    : null;
  const hoursTo = group?.countHoursTo ? numberValue(group.countHoursTo) : null;
  const currentHours = row.currentCountHours
    ? numberValue(row.currentCountHours)
    : null;

  return [
    {
      id: `loyalty-group:${row.id}:${row.externalGuestTypeId}`,
      source: 'GUEST_LOYALTY_GROUP',
      eventType: 'LOYALTY_GROUP_SNAPSHOT',
      occurredAt: occurredAt.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: `${row.externalGuestId}:group:${row.externalGuestTypeId}`,
      guest: mapSnapshotGuest(row, row.externalGuestId),
      store: null,
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Группа лояльности: ${groupName}`,
      details: [
        snapshotGuestName(row, row.externalGuestId),
        percent != null ? `скидка ${percent}%` : null,
        currentHours != null ? `${currentHours} ч у гостя` : null,
        hoursFrom != null || hoursTo != null
          ? `диапазон ${hoursFrom ?? 0}-${hoursTo ?? 'в€ћ'} ч`
          : null,
        group?.lastSyncedAt
          ? `группа обновлена ${group.lastSyncedAt.toISOString()}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
}

type ExternalProductCategoryMapping = {
  externalCategoryKey: string;
  externalCategoryId: string;
  externalCategoryName: string | null;
};

function mapProductExpenseFact(
  row: SnapshotProductExpenseRow,
  categoryMappings: Map<string, ExternalProductCategoryMapping>,
): GuestGameSnapshotFact[] {
  const revenue = numberValue(row.revenue);
  const cost = numberValue(row.cost);
  const quantity = numberValue(row.quantity);
  if (!row.guest || revenue <= 0 || quantity <= 0) {
    return [];
  }
  const productName =
    row.productNameAtSale ?? row.product?.name ?? row.externalProductId;
  const categoryName = row.product?.category?.name ?? null;
  const supplierName = row.product?.supplier?.name ?? null;
  const guestName = snapshotGuestName(row.guest, row.externalGuestId);
  const externalCategory = categoryMappings.get(
    `${row.store.id}:${row.externalDomain}:${row.externalProductId}`,
  );
  const displayCategoryName =
    externalCategory?.externalCategoryName ?? categoryName;

  return [
    {
      id: `product-expense:${row.id}`,
      source: 'PRODUCT_EXPENSE',
      eventType: 'PRODUCT_PURCHASE',
      occurredAt: row.saleDate.toISOString(),
      externalProvider: row.externalProvider,
      externalDomain: row.externalDomain,
      externalId: row.externalSaleId,
      guest: mapSnapshotGuest(row.guest, row.externalGuestId),
      store: mapSnapshotStore(row.store),
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: revenue,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      productId: row.productId,
      externalProductId: row.externalProductId,
      externalCategoryKey: externalCategory?.externalCategoryKey ?? null,
      externalCategoryId: externalCategory?.externalCategoryId ?? null,
      categoryId: row.product?.category?.id ?? null,
      productName,
      categoryName: displayCategoryName,
      supplierName,
      quantity,
      label: `Товарная покупка: ${productName ?? 'товар'} · ${guestName}`,
      details: [
        row.storeNameAtSale ?? row.store?.name,
        productName,
        displayCategoryName,
        supplierName,
        quantity ? `${quantity} шт` : null,
        revenue ? `${Math.abs(revenue)} руб` : null,
        cost ? `себестоимость ${Math.abs(cost)} руб` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
}

function mapReferralFact(
  row: SnapshotReferralEventRow,
  profileMap: Map<string, SnapshotGameProfileRow>,
  storeMap: Map<string, { id: string; name: string }>,
): GuestGameSnapshotFact[] {
  const payload = jsonRecord(row.payload);
  const valid = nullableBooleanValue(payload.valid) === true;
  const eligibleForReward =
    nullableBooleanValue(payload.eligibleForReward) === true;
  const selfReferral = nullableBooleanValue(payload.selfReferral) === true;
  const inviterProfileId = nullableString(payload.inviterProfileId);

  if (!valid || !eligibleForReward || selfReferral || !inviterProfileId) {
    return [];
  }

  const storeId = nullableString(payload.storeId);
  const profile = profileMap.get(inviterProfileId) ?? null;
  const store = storeId ? (storeMap.get(storeId) ?? null) : null;
  const profileLabel =
    profile?.displayName ??
    profile?.contactMasked ??
    `игровой профиль ${inviterProfileId.slice(0, 8)}`;
  const channel = nullableString(payload.channel);
  const referralCodeMasked = nullableString(payload.referralCodeMasked);
  const clubId = nullableString(payload.clubId);
  const acceptedAt = nullableString(payload.acceptedAt);

  return [
    {
      id: `referral:${row.id}:inviter`,
      source: 'GUEST_GAME_REFERRAL',
      eventType: 'REFERRAL_ACCEPTED',
      occurredAt: row.occurredAt.toISOString(),
      externalProvider: row.externalProvider ?? IntegrationProvider.LANGAME,
      externalDomain: row.externalDomain ?? 'leetplus-referral',
      externalId: row.externalId ?? row.id,
      profileId: inviterProfileId,
      guest: profile?.guest
        ? mapSnapshotGuest(profile.guest, profile.guest.externalGuestId)
        : null,
      store: mapSnapshotStore(store),
      sessionType: null,
      sessionPacket: null,
      sessionMinutes: null,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Реферал: ${profileLabel}`,
      details: [
        store?.name ?? clubId,
        channel ? `канал ${channel}` : null,
        referralCodeMasked ? `код ${referralCodeMasked}` : null,
        acceptedAt ? `принят ${acceptedAt}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
}

function mapSnapshotGuest(
  row: SnapshotGuestRow | null,
  externalGuestId: string | null,
): GuestGameProfile['guest'] {
  if (!row && !externalGuestId) {
    return null;
  }

  if (!row) {
    const guestId = externalGuestId ?? 'unknown';

    return {
      id: '',
      externalDomain: null,
      externalGuestId: guestId,
      displayName: guestId,
      contact: 'нет контакта',
    };
  }

  return {
    id: row.id,
    externalDomain: row.externalDomain,
    externalGuestId: row.externalGuestId,
    displayName: row.fullNameMasked ?? row.externalGuestId,
    contact: row.phoneMasked ?? row.emailMasked ?? 'нет контакта',
  };
}

function mapSnapshotStore(
  row: { id: string; name: string } | null,
): { id: string; name: string } | null {
  return row ? { id: row.id, name: row.name } : null;
}

function snapshotGuestName(
  row: SnapshotGuestRow | null,
  externalGuestId: string | null,
) {
  return row?.fullNameMasked ?? externalGuestId ?? 'гость без профиля';
}

function snapshotGroupKey(row: {
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalGroupId: string;
}) {
  return [
    row.externalProvider ?? '',
    row.externalDomain ?? '',
    row.externalGroupId,
  ].join(':');
}

function durationMinutes(startedAt: Date | null, stoppedAt: Date | null) {
  if (!startedAt || !stoppedAt) {
    return null;
  }

  const minutes = Math.floor(
    (stoppedAt.getTime() - startedAt.getTime()) / 60_000,
  );

  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function guestLogEventType(type: string | null) {
  const normalized = normalizeSnapshotType(type);

  if (
    normalized.includes('session') ||
    normalized.includes('visit') ||
    normalized.includes('login') ||
    normalized.includes('вход') ||
    normalized.includes('визит')
  ) {
    return 'VISIT';
  }

  return 'GUEST_LOG';
}

function isTopUpFactType(type: string | null) {
  const normalized = normalizeSnapshotType(type);

  return (
    normalized === 'plus' ||
    normalized.includes('deposit') ||
    normalized.includes('topup') ||
    normalized.includes('top_up') ||
    normalized.includes('balance_add') ||
    normalized.includes('пополн') ||
    normalized.includes('зачисл')
  );
}

function normalizeSnapshotType(value: string | null) {
  return (value ?? '').trim().toLowerCase();
}

type ProcessExternalReference = {
  externalProvider: IntegrationProvider;
  externalDomain: string;
  externalId: string;
};

function processExternalReferenceKey(reference: ProcessExternalReference) {
  return [
    reference.externalProvider,
    reference.externalDomain,
    reference.externalId,
  ].join(':');
}

function buildProcessExternalReference(
  dto: GuestGameProcessEventDto,
  eventType: string,
): ProcessExternalReference | null {
  const sourceFactId = nullableString(dto.sourceFactId);
  const externalId = nullableString(dto.externalId);
  const baseId = externalId ?? sourceFactId;

  if (!baseId) {
    return null;
  }

  return {
    externalProvider:
      integrationProviderValue(dto.externalProvider) ??
      IntegrationProvider.LANGAME,
    externalDomain:
      nullableString(dto.externalDomain) ?? 'guest-gamification-snapshot',
    externalId: [
      'guest-game',
      nullableString(dto.sourceFactKind) ?? 'snapshot',
      eventType,
      baseId,
    ].join(':'),
  };
}

function buildProcessOriginKey(
  dto: GuestGameProcessEventDto,
  eventType: string,
) {
  return buildGuestGameOriginKey({
    externalProvider:
      integrationProviderValue(dto.externalProvider) ??
      IntegrationProvider.LANGAME,
    externalDomain: nullableString(dto.externalDomain),
    eventType,
    stableExternalId: nullableString(dto.externalId),
  });
}

function processEventOriginOwnerMatches(
  event: Pick<EventRow, 'profileId' | 'eventType'>,
  profileId: string,
  eventType: string,
) {
  return (
    (!event.profileId || event.profileId === profileId) &&
    canonicalGuestGameEventType(event.eventType) ===
      canonicalGuestGameEventType(eventType)
  );
}

function pipelineSourceValue(value: unknown) {
  const parsed = nullableString(value);

  if (!parsed || parsed === 'ALL') {
    return null;
  }

  if (
    !snapshotFactSources.includes(parsed as GuestGameSnapshotFact['source'])
  ) {
    throw new BadRequestException(
      `Недопустимый источник snapshot-фактов: ${parsed}`,
    );
  }

  return parsed as GuestGameSnapshotFact['source'];
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : value;

  if (
    normalized === true ||
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 1
  ) {
    return true;
  }

  return false;
}

function nullableBooleanValue(value: unknown): boolean | null {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : value;

  if (
    normalized === true ||
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 1
  ) {
    return true;
  }
  if (
    normalized === false ||
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 0
  ) {
    return false;
  }

  return null;
}

function pipelineProcessDtoFromFact(
  fact: GuestGameSnapshotFact,
): GuestGameProcessEventDto {
  return {
    profileId: fact.profileId ?? null,
    guestId: fact.guest?.id ?? null,
    storeId: fact.store?.id ?? null,
    eventType: fact.eventType,
    occurredAt: fact.occurredAt,
    sessionType: fact.sessionType,
    sessionPacket: fact.sessionPacket,
    sessionMinutes: fact.sessionMinutes,
    spendAmount: fact.spendAmount,
    tariffGroupId: fact.tariffGroupId,
    tariffPeriodId: fact.tariffPeriodId,
    tariffTypeId: fact.tariffTypeId,
    guestLogType: fact.guestLogType ?? null,
    productId: fact.productId ?? null,
    externalProductId: fact.externalProductId ?? null,
    externalCategoryKey: fact.externalCategoryKey ?? null,
    externalCategoryId: fact.externalCategoryId ?? null,
    categoryId: fact.categoryId ?? null,
    productName: fact.productName ?? null,
    categoryName: fact.categoryName ?? null,
    supplierName: fact.supplierName ?? null,
    quantity: fact.quantity ?? null,
    sourceFactId: fact.id,
    sourceFactKind: fact.source,
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    externalId: fact.externalId,
  };
}

function pipelineFactBase(fact: GuestGameSnapshotFact) {
  return {
    factId: fact.id,
    source: fact.source,
    label: fact.label,
    eventType: fact.eventType,
    occurredAt: fact.occurredAt,
    guest: fact.guest,
    store: fact.store,
  } satisfies Pick<
    GuestGamePipelineFactResult,
    | 'factId'
    | 'source'
    | 'label'
    | 'eventType'
    | 'occurredAt'
    | 'guest'
    | 'store'
  >;
}

type GuestGameRewardEffectKind =
  | 'STAFF_APPROVAL_NOTIFICATION'
  | 'LOOT_BOX_ENTITLEMENT'
  | 'BONUS_LEDGER_QUEUE';

function guestGameRewardEffectPlans(row: {
  id: string;
  status: string;
  rewardType: string;
}) {
  const effectKinds: GuestGameRewardEffectKind[] = [];
  if (row.status === 'PENDING') {
    effectKinds.push('STAFF_APPROVAL_NOTIFICATION');
  }
  if (
    (row.status === 'APPROVED' || row.status === 'PAID') &&
    row.rewardType === 'LOOT_BOX_ENTITLEMENT'
  ) {
    effectKinds.push('LOOT_BOX_ENTITLEMENT');
  }
  if (row.status === 'APPROVED' && row.rewardType !== 'LOOT_BOX_ENTITLEMENT') {
    effectKinds.push('BONUS_LEDGER_QUEUE');
  }

  return effectKinds.map((effectKind) => ({
    effectKind,
    slotKey: 'primary',
    idempotencyKey: [
      'guest-game-reward-effect',
      'v1',
      row.id,
      effectKind,
      'primary',
    ].join(':'),
    status: 'PENDING',
    payload: {
      schemaVersion: 1,
      rewardId: row.id,
      effectKind,
    } satisfies Prisma.InputJsonObject,
  }));
}

function guestGameRewardEffectStillApplies(
  row: { status: string; rewardType: string },
  effectKind: string,
) {
  if (effectKind === 'STAFF_APPROVAL_NOTIFICATION') {
    return row.status === 'PENDING';
  }
  if (effectKind === 'LOOT_BOX_ENTITLEMENT') {
    return (
      (row.status === 'APPROVED' || row.status === 'PAID') &&
      row.rewardType === 'LOOT_BOX_ENTITLEMENT'
    );
  }
  if (effectKind === 'BONUS_LEDGER_QUEUE') {
    return (
      row.status === 'APPROVED' && row.rewardType !== 'LOOT_BOX_ENTITLEMENT'
    );
  }
  return true;
}

function emptyEffectMaterializeResult(): GuestGameEffectMaterializeResult {
  return {
    claimed: 0,
    applied: 0,
    recovered: 0,
    canceled: 0,
    failed: 0,
    deadLettered: 0,
    staleFinalizations: 0,
    rewardIds: [],
  };
}

function mergeEffectMaterializeResult(
  target: GuestGameEffectMaterializeResult,
  source: GuestGameEffectMaterializeResult,
) {
  target.claimed += source.claimed;
  target.applied += source.applied;
  target.recovered += source.recovered;
  target.canceled += source.canceled;
  target.failed += source.failed;
  target.deadLettered += source.deadLettered;
  target.staleFinalizations += source.staleFinalizations;
  target.rewardIds.push(...source.rewardIds);
}

function emptyProcessRewardInput(): GuestGameDryRunResult['input'] {
  return {
    sessionType: null,
    sessionPacket: null,
    sessionMinutes: 0,
    spendAmount: 0,
    tariffGroupId: null,
    tariffPeriodId: null,
    tariffTypeId: null,
    guestLogType: null,
    productId: null,
    externalProductId: null,
    externalCategoryKey: null,
    externalCategoryId: null,
    categoryId: null,
    productName: null,
    categoryName: null,
    supplierName: null,
    quantity: null,
  };
}

function rewardEffectRetryDelayMs(attempts: number) {
  return Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, attempts - 1));
}

function boundedEffectInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function pipelineErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Не удалось обработать snapshot-факт.';
}

function buildProcessPayload(
  dto: GuestGameProcessEventDto,
  dryRun: GuestGameDryRunResult,
  includeRewardMaterialization = true,
): Prisma.InputJsonObject {
  const extraPayload = dto.payload ?? null;

  return {
    processSchemaVersion: 2,
    source: 'guest_gamification_process_event',
    langameWrite: false,
    sourceFactId: nullableString(dto.sourceFactId),
    sourceFactKind: nullableString(dto.sourceFactKind),
    externalProvider: nullableString(dto.externalProvider),
    externalDomain: nullableString(dto.externalDomain),
    externalId: nullableString(dto.externalId),
    ...(extraPayload ? { extra: extraPayload } : {}),
    store: dryRun.store,
    input: dryRun.input,
    summary: dryRun.summary,
    ...(includeRewardMaterialization
      ? {
          rules: dryRun.rules.map(processRewardRuleSnapshot),
          rewardIntents: dryRun.rules
            .filter(shouldQueueProcessReward)
            .map((rule) =>
              processRewardIntentPlan(
                rule,
                processRewardQualifiedAt(dto, dryRun, rule),
                dryRun.profile?.id ?? null,
              ),
            ),
        }
      : {}),
  };
}

type ProcessRewardIntentRuleSnapshot = {
  id: string;
  kind: GuestGameDryRunRule['kind'];
  name: string;
  status: string;
  triggerKind: string | null;
  evaluationPolicy: string;
  manualApprovalRequired: boolean;
  rewardMaterializationSuppressed: boolean;
  eligible: boolean;
  rewardType: string | null;
  rewardAmount: number | null;
  rewardLabel: string | null;
  selectedRewardLabel: string | null;
  selectedReward: GuestGameSelectedReward | null;
  xpDelta: number;
  budgetAmount: number | null;
  battlePassLevel: number | null;
  battlePassStep: number | null;
  battlePassStepTitle: string | null;
  battlePassRewardTrack: 'FREE' | 'PREMIUM' | null;
  rewardLootBoxId: string | null;
  periodicLimitPeriod: LootBoxPeriodicLimitPeriod | null;
  missionDenySameDayRepeat: boolean;
  missionPerGuestLimit: number | null;
  missionTotalRewardLimit: number | null;
  reasons: string[];
  blockers: string[];
};

type ProcessRewardIntentPlan = {
  schemaVersion: 1;
  qualifiedAt: string;
  slotKey: string;
  claimKey: string | null;
  rule: ProcessRewardIntentRuleSnapshot;
};

type AtomicMissionQualificationOutcome = {
  ruleId: string;
  allowed: boolean;
  qualifiedAt: string;
  codes: string[];
  counts: Record<string, number | string | null>;
};

type AtomicMissionIssuance = {
  key: string;
  profileId: string | null;
  guestId: string | null;
  qualifiedAt: Date;
  amount: number;
};

function processRewardRuleSnapshot(
  rule: GuestGameDryRunRule,
): ProcessRewardIntentRuleSnapshot {
  return {
    id: rule.id,
    kind: rule.kind,
    name: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    evaluationPolicy: rule.evaluationPolicy,
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardMaterializationSuppressed:
      rule.rewardMaterializationSuppressed ?? false,
    eligible: rule.eligible,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel,
    selectedRewardLabel: rule.selectedRewardLabel,
    selectedReward: rule.selectedReward,
    xpDelta: rule.xpDelta,
    budgetAmount: rule.budgetAmount,
    battlePassLevel: rule.battlePassLevel ?? null,
    battlePassStep: rule.battlePassStep ?? null,
    battlePassStepTitle: rule.battlePassStepTitle ?? null,
    battlePassRewardTrack: rule.battlePassRewardTrack ?? null,
    rewardLootBoxId: rule.rewardLootBoxId ?? null,
    periodicLimitPeriod: rule.periodicLimitPeriod ?? null,
    missionDenySameDayRepeat: rule.missionDenySameDayRepeat ?? false,
    missionPerGuestLimit: rule.missionPerGuestLimit ?? null,
    missionTotalRewardLimit: rule.missionTotalRewardLimit ?? null,
    reasons: rule.reasons,
    blockers: rule.blockers,
  };
}

function processRewardIntentPlan(
  rule: GuestGameDryRunRule,
  qualifiedAt: string,
  profileId: string | null,
): ProcessRewardIntentPlan {
  const slotKey =
    rule.kind === 'SEASON'
      ? `${rule.battlePassStep ?? 'step'}:${rule.rewardType ?? 'reward'}`
      : (rule.rewardType ?? 'reward');
  const claimKey =
    rule.kind === 'SEASON' && profileId && rule.battlePassStep != null
      ? `season:${rule.id}:profile:${profileId}:step:${rule.battlePassStep}`
      : null;

  return {
    schemaVersion: 1,
    qualifiedAt,
    slotKey,
    claimKey,
    rule: processRewardRuleSnapshot(rule),
  };
}

function processRewardIntentPlanKey(plan: ProcessRewardIntentPlan) {
  return `${plan.rule.kind}:${plan.rule.id}:${plan.slotKey}`;
}

function processRewardInputSnapshot(
  value: unknown,
  fallback: GuestGameDryRunResult['input'],
): GuestGameDryRunResult['input'] {
  const input = jsonRecord(value ?? null);
  if (!Object.keys(input).length) return fallback;

  return {
    sessionType: nullableString(input.sessionType) ?? null,
    sessionPacket:
      typeof input.sessionPacket === 'boolean' ? input.sessionPacket : null,
    sessionMinutes: Math.max(0, intValue(input.sessionMinutes) ?? 0),
    spendAmount: Math.max(0, finiteJsonNumber(input.spendAmount) ?? 0),
    tariffGroupId: nullableString(input.tariffGroupId) ?? null,
    tariffPeriodId: nullableString(input.tariffPeriodId) ?? null,
    tariffTypeId: nullableString(input.tariffTypeId) ?? null,
    guestLogType: nullableString(input.guestLogType) ?? null,
    productId: nullableString(input.productId) ?? null,
    externalProductId: nullableString(input.externalProductId) ?? null,
    externalCategoryKey: nullableString(input.externalCategoryKey) ?? null,
    externalCategoryId: nullableString(input.externalCategoryId) ?? null,
    categoryId: nullableString(input.categoryId) ?? null,
    productName: nullableString(input.productName) ?? null,
    categoryName: nullableString(input.categoryName) ?? null,
    supplierName: nullableString(input.supplierName) ?? null,
    quantity: finiteJsonNumber(input.quantity) ?? null,
  };
}

function processRewardStoreSnapshot(
  value: unknown,
  fallback: GuestGameDryRunResult['store'],
): GuestGameDryRunResult['store'] {
  const store = jsonRecord(value ?? null);
  const id = nullableId(store.id);
  const name = nullableString(store.name);
  if (!id || !name) return fallback;

  return {
    id,
    name,
    timeZone: nullableString(store.timeZone) ?? null,
  };
}

type PersistedProcessEventEvidence = {
  eventType: string;
  occurredAt: Date | string;
  payload: Prisma.JsonValue | null;
  profileId?: string | null;
  guestId?: string | null;
  profile?: { id: string } | null;
  guest?: { id: string } | null;
};

function processPersistedEventDryRun(
  event: PersistedProcessEventEvidence,
  identityDryRun: GuestGameDryRunResult,
): GuestGameDryRunResult | null {
  const payload = jsonRecord(event.payload ?? null);
  if (
    intValue(payload.processSchemaVersion) !== 2 ||
    nullableString(payload.source) !== 'guest_gamification_process_event' ||
    !isRecord(payload.input) ||
    !Object.keys(payload.input).length ||
    !isRecord(payload.store) ||
    !Array.isArray(payload.rules)
  ) {
    return null;
  }

  const store = processRewardStoreSnapshot(payload.store, null);
  if (!store) return null;

  const rules = payload.rules
    .map<GuestGameDryRunRule | null>((value) => {
      const rule = parseProcessRewardIntentRule(value);
      return rule ? { ...rule, progress: null } : null;
    })
    .filter((rule): rule is GuestGameDryRunRule => Boolean(rule));
  if (!rules.length) return null;

  const occurredAt =
    event.occurredAt instanceof Date
      ? event.occurredAt
      : dateValue(event.occurredAt);
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) return null;
  const eventProfileId =
    nullableId(event.profileId) ?? event.profile?.id ?? null;
  const eventGuestId = nullableId(event.guestId) ?? event.guest?.id ?? null;

  return dryRunWithRules(
    {
      ...identityDryRun,
      eventType: event.eventType,
      occurredAt: occurredAt.toISOString(),
      profile:
        identityDryRun.profile?.id === eventProfileId
          ? identityDryRun.profile
          : null,
      guest:
        identityDryRun.guest?.id === eventGuestId ? identityDryRun.guest : null,
      store,
      input: processRewardInputSnapshot(payload.input, identityDryRun.input),
      note: 'Loot-box entitlement is reconstructed from immutable persisted event evidence.',
    },
    rules,
  );
}

function processLootBoxEntitlementRecoveryDryRun(
  event: PersistedProcessEventEvidence,
  identityDryRun: GuestGameDryRunResult,
): GuestGameDryRunResult | null {
  const persisted = processPersistedEventDryRun(event, identityDryRun);
  if (!persisted) return null;
  const rawRules = dryRunArray(jsonRecord(event.payload).rules);
  const hasExplicitPeriodField = new Set(
    rawRules
      .filter(
        (value): value is Record<string, unknown> =>
          isRecord(value) &&
          Object.prototype.hasOwnProperty.call(value, 'periodicLimitPeriod') ===
            true,
      )
      .map((value) => nullableId(value.id))
      .filter((ruleId): ruleId is string => Boolean(ruleId)),
  );
  const rules = persisted.rules.filter((rule) => {
    if (!rule.eligible) return false;
    const standaloneLootBox =
      rule.kind === 'LOOT_BOX' && hasExplicitPeriodField.has(rule.id);
    const automaticMissionLootBox =
      rule.kind === 'MISSION' &&
      rule.rewardType === 'LOOT_BOX_ENTITLEMENT' &&
      !rule.manualApprovalRequired;
    return (
      (standaloneLootBox || automaticMissionLootBox) &&
      !(rule.periodicLimitPeriod === 'DAILY' && !persisted.store?.timeZone)
    );
  });

  return rules.length ? dryRunWithRules(persisted, rules) : null;
}

function processRewardIntentPlans(value: unknown): ProcessRewardIntentPlan[] {
  if (!isRecord(value) || intValue(value.processSchemaVersion) !== 2) {
    return [];
  }
  if (!Array.isArray(value.rewardIntents)) return [];

  return value.rewardIntents
    .map(parseProcessRewardIntentPlan)
    .filter((item): item is ProcessRewardIntentPlan => Boolean(item));
}

function processMissionQualificationRules(
  value: unknown,
): ProcessRewardIntentRuleSnapshot[] {
  if (!isRecord(value) || intValue(value.processSchemaVersion) !== 2) {
    return [];
  }
  if (!Array.isArray(value.rules)) return [];

  return value.rules
    .map(parseProcessRewardIntentRule)
    .filter((rule): rule is ProcessRewardIntentRuleSnapshot => {
      if (!rule || rule.kind !== 'MISSION' || !rule.eligible) return false;
      const hasIssuableEffect =
        rule.xpDelta !== 0 ||
        rule.rewardType === 'LOOT_BOX_ENTITLEMENT' ||
        Boolean(rule.rewardLabel) ||
        (rule.rewardAmount ?? 0) > 0;

      return (
        missionDryRunRuleRequiresAtomicQualification(rule) && hasIssuableEffect
      );
    });
}

function missionDryRunRuleRequiresAtomicQualification(
  rule: Pick<
    GuestGameDryRunRule,
    | 'missionDenySameDayRepeat'
    | 'periodicLimitPeriod'
    | 'missionPerGuestLimit'
    | 'missionTotalRewardLimit'
    | 'budgetAmount'
    | 'rewardAmount'
  >,
) {
  return Boolean(
    rule.missionDenySameDayRepeat ||
    rule.periodicLimitPeriod != null ||
    rule.missionPerGuestLimit != null ||
    rule.missionTotalRewardLimit != null ||
    (rule.budgetAmount != null && (rule.rewardAmount ?? 0) > 0),
  );
}

function processPayloadTimeZone(value: unknown) {
  const payload = isRecord(value) ? value : {};
  const store = isRecord(payload.store) ? payload.store : {};
  return guestGameTimeZone(nullableString(store.timeZone));
}

function applyAtomicMissionQualificationOutcomes(
  value: unknown,
  outcomes: AtomicMissionQualificationOutcome[],
): Prisma.InputJsonObject | null {
  if (!isRecord(value)) return null;
  if (!outcomes.length) return safeInputJsonObject(value);

  const outcomeByRuleId = new Map(
    outcomes.map((outcome) => [outcome.ruleId, outcome] as const),
  );
  const deniedRuleIds = new Set(
    outcomes
      .filter((outcome) => !outcome.allowed)
      .map((outcome) => outcome.ruleId),
  );
  const rules = dryRunArray(value.rules).map((rawRule) => {
    if (!isRecord(rawRule)) return rawRule;
    const ruleId = nullableString(rawRule.id);
    const outcome = ruleId ? outcomeByRuleId.get(ruleId) : null;
    if (!outcome) return rawRule;
    const blockers = processStringArray(rawRule.blockers);

    return {
      ...rawRule,
      eligible: outcome.allowed ? booleanValue(rawRule.eligible) : false,
      blockers: outcome.allowed
        ? blockers
        : [
            ...blockers,
            `Atomic mission limit exhausted: ${outcome.codes.join(', ') || 'UNKNOWN_LIMIT'}.`,
          ],
      atomicMissionQualification: {
        allowed: outcome.allowed,
        qualifiedAt: outcome.qualifiedAt,
        codes: outcome.codes,
        counts: outcome.counts,
        isolationLevel: 'SERIALIZABLE',
      },
    };
  });
  const rewardIntents = dryRunArray(value.rewardIntents).filter((rawPlan) => {
    const plan = parseProcessRewardIntentPlan(rawPlan);
    return !(plan?.rule.kind === 'MISSION' && deniedRuleIds.has(plan.rule.id));
  });

  return safeInputJsonObject({
    ...value,
    rules,
    rewardIntents,
    atomicMissionQualifications: outcomes.map((outcome) => ({
      ruleId: outcome.ruleId,
      allowed: outcome.allowed,
      qualifiedAt: outcome.qualifiedAt,
      codes: outcome.codes,
      counts: outcome.counts,
    })),
  });
}

function safeInputJsonObject(
  value: Record<string, unknown>,
): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, item] of Object.entries(value)) {
    const normalized = safeInputJsonValue(item);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }

  return result;
}

function safeInputJsonValue(
  value: unknown,
): Prisma.InputJsonValue | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeInputJsonValue(item) ?? null);
  }
  if (isRecord(value)) return safeInputJsonObject(value);

  return undefined;
}

function atomicMissionIssuances(input: {
  ruleId: string;
  intents: Array<{
    eventId: string;
    effectKind: string;
    status: string;
    rewardId: string | null;
    profileId: string | null;
    qualifiedAt: Date;
    plan: Prisma.JsonValue;
  }>;
  rewards: Array<{
    id: string;
    profileId: string | null;
    guestId: string | null;
    qualifiedAt: Date;
    rewardAmount: Prisma.Decimal;
  }>;
  entitlements: Array<{
    id: string;
    eventId: string | null;
    rewardId: string | null;
    profileId: string | null;
    guestId: string | null;
    qualifiedAt: Date;
    evidence: Prisma.JsonValue | null;
  }>;
}): AtomicMissionIssuance[] {
  const result = new Map<string, AtomicMissionIssuance>();
  const rewardEventKeys = new Map<string, string>();
  const add = (key: string, value: Omit<AtomicMissionIssuance, 'key'>) => {
    const previous = result.get(key);
    if (!previous) {
      result.set(key, { key, ...value });
      return;
    }
    result.set(key, {
      key,
      profileId: previous.profileId ?? value.profileId,
      guestId: previous.guestId ?? value.guestId,
      qualifiedAt:
        previous.qualifiedAt.getTime() <= value.qualifiedAt.getTime()
          ? previous.qualifiedAt
          : value.qualifiedAt,
      amount: Math.max(previous.amount, value.amount),
    });
  };

  for (const intent of input.intents) {
    const qualifiedAt = dryRunDateOrNull(intent.qualifiedAt);
    const isQualification =
      intent.effectKind === 'QUALIFICATION' && intent.status === 'APPLIED';
    const isRewardReservation =
      intent.effectKind === 'REWARD' &&
      ['PENDING', 'PROCESSING', 'FAILED', 'APPLIED'].includes(intent.status);
    if (!qualifiedAt || (!isQualification && !isRewardReservation)) continue;
    const key = `event:${intent.eventId}`;
    if (intent.rewardId) rewardEventKeys.set(intent.rewardId, key);
    add(key, {
      profileId: intent.profileId,
      guestId: null,
      qualifiedAt,
      amount: parseProcessRewardIntentPlan(intent.plan)?.rule.rewardAmount ?? 0,
    });
  }

  for (const reward of input.rewards) {
    const qualifiedAt = dryRunDateOrNull(reward.qualifiedAt);
    if (!qualifiedAt) continue;
    const key = rewardEventKeys.get(reward.id) ?? `reward:${reward.id}`;
    add(key, {
      profileId: reward.profileId,
      guestId: reward.guestId,
      qualifiedAt,
      amount: Number(reward.rewardAmount),
    });
  }

  for (const entitlement of input.entitlements) {
    const evidence = jsonRecord(entitlement.evidence);
    if (nullableId(evidence.missionId) !== input.ruleId) continue;
    const qualifiedAt = dryRunDateOrNull(entitlement.qualifiedAt);
    if (!qualifiedAt) continue;
    const key = entitlement.eventId
      ? `event:${entitlement.eventId}`
      : entitlement.rewardId
        ? (rewardEventKeys.get(entitlement.rewardId) ??
          `reward:${entitlement.rewardId}`)
        : `entitlement:${entitlement.id}`;
    add(key, {
      profileId: entitlement.profileId,
      guestId: entitlement.guestId,
      qualifiedAt,
      amount: 0,
    });
  }

  return [...result.values()];
}

function atomicMissionLimitGuard(input: {
  denySameDayRepeat: boolean;
  periodicity: LootBoxPeriodicLimitPeriod | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  budgetAmount: number | null;
  projectedAmount: number;
  profileId: string | null;
  guestId: string | null;
  qualifiedAt: Date;
  timeZone: string;
  issuances: AtomicMissionIssuance[];
}) {
  const matchesGuest = (issuance: AtomicMissionIssuance) =>
    (input.profileId != null && issuance.profileId === input.profileId) ||
    (input.guestId != null && issuance.guestId === input.guestId);
  const guestIssuances = input.issuances.filter(matchesGuest);
  const codes: string[] = [];
  const spentAmount = sum(input.issuances.map((issuance) => issuance.amount));
  const counts: Record<string, number | string | null> = {
    totalCount: input.issuances.length,
    guestCount: guestIssuances.length,
    spentAmount,
  };
  const needsGuest =
    input.denySameDayRepeat ||
    input.periodicity != null ||
    input.perGuestLimit != null;

  if (needsGuest && !input.profileId && !input.guestId) {
    codes.push('GUEST_IDENTITY_MISSING');
  }
  if (input.denySameDayRepeat && (input.profileId || input.guestId)) {
    const sameDayCount = guestIssuances.filter((issuance) =>
      dryRunIsSameDay(issuance.qualifiedAt, input.qualifiedAt, input.timeZone),
    ).length;
    counts.sameDayCount = sameDayCount;
    counts.sameDayLimit = 1;
    if (sameDayCount >= 1) codes.push('SAME_DAY_REPEAT_EXHAUSTED');
  }
  if (input.periodicity && (input.profileId || input.guestId)) {
    const periodicCount = guestIssuances.filter((issuance) =>
      dryRunIsWithinLootBoxPeriod(
        issuance.qualifiedAt,
        input.qualifiedAt,
        input.periodicity!,
        input.timeZone,
      ),
    ).length;
    counts.periodicCount = periodicCount;
    counts.periodicLimit = 1;
    counts.periodicLimitPeriod = input.periodicity;
    if (periodicCount >= 1) codes.push('PERIODIC_LIMIT_EXHAUSTED');
  }
  if (input.perGuestLimit != null && (input.profileId || input.guestId)) {
    counts.perGuestLimit = input.perGuestLimit;
    if (guestIssuances.length >= input.perGuestLimit) {
      codes.push('PER_GUEST_LIMIT_EXHAUSTED');
    }
  }
  if (input.totalRewardLimit != null) {
    counts.totalRewardLimit = input.totalRewardLimit;
    if (input.issuances.length >= input.totalRewardLimit) {
      codes.push('TOTAL_REWARD_LIMIT_EXHAUSTED');
    }
  }
  if (input.budgetAmount != null) {
    counts.budgetAmount = input.budgetAmount;
    counts.projectedAmount = input.projectedAmount;
    if (
      spentAmount >= input.budgetAmount ||
      (input.projectedAmount > 0 &&
        spentAmount + input.projectedAmount > input.budgetAmount)
    ) {
      codes.push('BUDGET_EXHAUSTED');
    }
  }

  return { exhausted: codes.length > 0, codes, counts };
}

function parseProcessRewardIntentPlan(
  value: unknown,
): ProcessRewardIntentPlan | null {
  if (!isRecord(value) || intValue(value.schemaVersion) !== 1) return null;
  const rule = parseProcessRewardIntentRule(value.rule);
  const qualifiedAt = dateValue(value.qualifiedAt);
  const slotKey = nullableString(value.slotKey);
  if (!rule || !qualifiedAt || !slotKey) return null;

  return {
    schemaVersion: 1,
    qualifiedAt: qualifiedAt.toISOString(),
    slotKey,
    claimKey: nullableString(value.claimKey) ?? null,
    rule,
  };
}

function parseProcessRewardIntentRule(
  value: unknown,
): ProcessRewardIntentRuleSnapshot | null {
  if (!isRecord(value)) return null;
  const id = nullableString(value.id);
  const kind = nullableString(value.kind);
  const name = nullableString(value.name);
  if (
    !id ||
    !name ||
    (kind !== 'LOOT_BOX' && kind !== 'MISSION' && kind !== 'SEASON')
  ) {
    return null;
  }

  return {
    id,
    kind,
    name,
    status: nullableString(value.status) ?? 'ACTIVE',
    triggerKind: nullableString(value.triggerKind) ?? null,
    evaluationPolicy: nullableString(value.evaluationPolicy) ?? 'LIVE_PRIMARY',
    manualApprovalRequired: booleanValue(value.manualApprovalRequired),
    rewardMaterializationSuppressed:
      Object.prototype.hasOwnProperty.call(
        value,
        'rewardMaterializationSuppressed',
      ) === true
        ? booleanValue(value.rewardMaterializationSuppressed)
        : kind === 'LOOT_BOX' &&
          Object.prototype.hasOwnProperty.call(value, 'periodicLimitPeriod') ===
            true,
    eligible: booleanValue(value.eligible),
    rewardType: nullableString(value.rewardType) ?? null,
    rewardAmount: finiteJsonNumber(value.rewardAmount) ?? null,
    rewardLabel: nullableString(value.rewardLabel) ?? null,
    selectedRewardLabel: nullableString(value.selectedRewardLabel) ?? null,
    selectedReward: parseProcessSelectedReward(value.selectedReward),
    xpDelta: intValue(value.xpDelta) ?? 0,
    budgetAmount: finiteJsonNumber(value.budgetAmount) ?? null,
    battlePassLevel: intValue(value.battlePassLevel) ?? null,
    battlePassStep: intValue(value.battlePassStep) ?? null,
    battlePassStepTitle: nullableString(value.battlePassStepTitle) ?? null,
    battlePassRewardTrack: processBattlePassRewardTrack(
      value.battlePassRewardTrack,
    ),
    rewardLootBoxId: nullableId(value.rewardLootBoxId) ?? null,
    periodicLimitPeriod: processPeriodicLimitPeriod(value.periodicLimitPeriod),
    missionDenySameDayRepeat: booleanValue(value.missionDenySameDayRepeat),
    missionPerGuestLimit: intValue(value.missionPerGuestLimit) ?? null,
    missionTotalRewardLimit: intValue(value.missionTotalRewardLimit) ?? null,
    reasons: processStringArray(value.reasons),
    blockers: processStringArray(value.blockers),
  };
}

function processBattlePassRewardTrack(
  value: unknown,
): 'FREE' | 'PREMIUM' | null {
  const normalized = nullableString(value)?.toUpperCase();
  return normalized === 'FREE' || normalized === 'PREMIUM' ? normalized : null;
}

function parseProcessSelectedReward(
  value: unknown,
): GuestGameSelectedReward | null {
  if (!isRecord(value)) return null;
  const rewardType = nullableString(value.rewardType);
  const rewardLabel = nullableString(value.rewardLabel);
  const rewardRarity = nullableString(value.rewardRarity);
  if (
    !rewardType ||
    !rewardLabel ||
    (rewardRarity !== 'common' &&
      rewardRarity !== 'rare' &&
      rewardRarity !== 'epic' &&
      rewardRarity !== 'legendary')
  ) {
    return null;
  }

  return {
    rewardType,
    rewardAmount: finiteJsonNumber(value.rewardAmount) ?? 0,
    rewardLabel,
    weight: finiteJsonNumber(value.weight) ?? 0,
    chancePercent: finiteJsonNumber(value.chancePercent) ?? 0,
    rewardRarity,
    rewardRarityLabel: nullableString(value.rewardRarityLabel) ?? rewardRarity,
  };
}

function processPeriodicLimitPeriod(
  value: unknown,
): LootBoxPeriodicLimitPeriod | null {
  const normalized = nullableString(value)?.toUpperCase();
  return normalized === 'DAILY' ||
    normalized === 'WEEKLY' ||
    normalized === 'MONTHLY'
    ? normalized
    : null;
}

function processStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(nullableString).filter((item): item is string => Boolean(item))
    : [];
}

function activeRulesOnlyDryRun(
  dryRun: GuestGameDryRunResult,
): GuestGameDryRunResult {
  const rules = dryRun.rules.map((rule) => {
    if (!rule.eligible || rule.status === 'ACTIVE') {
      return rule;
    }

    return {
      ...rule,
      eligible: false,
      blockers: [
        ...rule.blockers,
        `Статус правила не позволяет публичный запуск: ${rule.status}`,
      ],
    };
  });

  return dryRunWithRules(dryRun, rules);
}

function filterDryRunRules(
  dryRun: GuestGameDryRunResult,
  allowedRuleIds: Set<string>,
): GuestGameDryRunResult {
  const rules = dryRun.rules.filter((rule) => allowedRuleIds.has(rule.id));
  const eligibleRules = rules.filter((rule) => rule.eligible);

  return {
    ...dryRun,
    rules,
    summary: {
      checkedRules: rules.length,
      eligibleRules: eligibleRules.length,
      blockedRules: rules.length - eligibleRules.length,
      estimatedRewardAmount: sum(
        eligibleRules.map((rule) => rule.rewardAmount ?? 0),
      ),
      projectedXpDelta: sum(eligibleRules.map((rule) => rule.xpDelta)),
    },
  };
}

function filterDryRunBattlePassSteps(
  dryRun: GuestGameDryRunResult,
  allowedSteps: ReadonlyMap<string, number>,
): GuestGameDryRunResult {
  return dryRunWithRules(
    dryRun,
    dryRun.rules.filter(
      (rule) =>
        rule.kind !== 'SEASON' ||
        (rule.battlePassStep != null &&
          allowedSteps.get(rule.id) === rule.battlePassStep),
    ),
  );
}

function filterDryRunRulesByEvaluationPolicy(
  dryRun: GuestGameDryRunResult,
  evaluationMode: GuestGameEvaluationMode,
) {
  return filterDryRunRules(
    dryRun,
    new Set(
      dryRun.rules
        .filter((rule) =>
          guestGamePolicyAllowsEvaluation(
            rule.evaluationPolicy,
            evaluationMode,
          ),
        )
        .map((rule) => rule.id),
    ),
  );
}

function supplementalPipelineMode(
  value: unknown,
): GuestGameSupplementalPipelineMode {
  const mode = nullableString(value)?.toUpperCase();
  return mode === 'LIVE' || mode === 'SHADOW' ? mode : 'OFF';
}

function supplementalFactTypes(value: unknown): string[] {
  const requested = Array.isArray(value)
    ? value.map((item) => nullableString(item)?.toUpperCase()).filter(Boolean)
    : [];
  if (!requested.length) {
    return ['BALANCE_TOPUP'];
  }

  return requested.includes('BALANCE_TOPUP') ? ['BALANCE_TOPUP'] : [];
}

function supplementalReceiptKey(value: {
  factType: string;
  externalDomain: string;
  sourceHash: string;
}) {
  return `${value.factType}\u0000${value.externalDomain}\u0000${value.sourceHash}`;
}

function supplementalReceiptCanBeClaimed(
  mode: Exclude<GuestGameSupplementalPipelineMode, 'OFF'>,
  receipt: { status: string; attempts: number; updatedAt?: Date | null },
  staleClaimBefore: Date,
) {
  if (receipt.attempts >= supplementalReceiptMaxAttempts) {
    return false;
  }

  if (receipt.status === 'PROCESSING') {
    return Boolean(
      receipt.updatedAt &&
      receipt.updatedAt.getTime() < staleClaimBefore.getTime(),
    );
  }

  return (
    receipt.status === 'PENDING' ||
    receipt.status === 'FAILED' ||
    (mode === 'LIVE' && receipt.status === 'SHADOWED')
  );
}

function supplementalReceiptShouldDeadLetter(
  receipt: { status: string; attempts: number; updatedAt?: Date | null },
  staleClaimBefore: Date,
) {
  return Boolean(
    ['PENDING', 'PROCESSING', 'FAILED'].includes(receipt.status) &&
    receipt.attempts >= supplementalReceiptMaxAttempts &&
    receipt.updatedAt &&
    receipt.updatedAt.getTime() < staleClaimBefore.getTime(),
  );
}

function supplementalTenantResult(
  tenantId: string,
  tenantSlug: string,
  status: GuestGameSupplementalPipelineTenantResult['status'],
  reason: string | null,
): GuestGameSupplementalPipelineTenantResult {
  return {
    tenantId,
    tenantSlug,
    status,
    reason,
    checkedFacts: 0,
    processedFacts: 0,
    shadowFacts: 0,
    duplicateFacts: 0,
    failedFacts: 0,
    createdEvents: 0,
    createdRewards: 0,
  };
}

function summarizeSupplementalPipeline(
  mode: GuestGameSupplementalPipelineMode,
  tenants: GuestGameSupplementalPipelineTenantResult[],
): GuestGameSupplementalPipelineRunResult {
  const total = (key: keyof GuestGameSupplementalPipelineTenantResult) =>
    tenants.reduce((sumValue, tenant) => {
      const value = tenant[key];
      return sumValue + (typeof value === 'number' ? value : 0);
    }, 0);

  return {
    mode,
    checkedTenants: tenants.length,
    processedTenants: tenants.filter((item) => item.status === 'PROCESSED')
      .length,
    skippedTenants: tenants.filter((item) => item.status === 'SKIPPED').length,
    erroredTenants: tenants.filter((item) => item.status === 'ERROR').length,
    checkedFacts: total('checkedFacts'),
    processedFacts: total('processedFacts'),
    shadowFacts: total('shadowFacts'),
    duplicateFacts: total('duplicateFacts'),
    failedFacts: total('failedFacts'),
    createdEvents: total('createdEvents'),
    createdRewards: total('createdRewards'),
    tenants,
  };
}

function supplementalMissionMatchesFact(
  mission: {
    createdAt: Date;
    periodFrom: Date | null;
    periodTo: Date | null;
    conditions: Prisma.JsonValue | null;
    storeIds: Prisma.JsonValue;
  },
  stores: Array<{
    id: string;
    externalDomain: string | null;
    timeZone: string | null;
  }>,
  externalDomain: string,
  happenedAt: Date,
) {
  const conditions = jsonRecord(mission.conditions);
  const domains = supplementalRuleExternalDomains(
    guestGameStringArray(mission.storeIds),
    guestGameStringArray(conditions.externalDomains),
    stores,
  );
  const activatedAt = guestGameRuleActivationAt(
    mission.createdAt,
    mission.conditions,
  );

  return (
    domains.includes(externalDomain) &&
    happenedAt >= activatedAt &&
    (!mission.periodFrom || happenedAt >= mission.periodFrom) &&
    (!mission.periodTo || happenedAt <= mission.periodTo)
  );
}

function supplementalRuleExternalDomains(
  storeIds: string[],
  configuredDomains: string[],
  stores: Array<{ id: string; externalDomain: string | null }>,
) {
  if (storeIds.length) {
    return guestGameRuleExternalDomains(storeIds, stores);
  }

  return configuredDomains.length
    ? uniqueStrings(configuredDomains)
    : uniqueStrings(stores.map((store) => store.externalDomain ?? ''));
}

function seasonHasSupplementalBattlePassStep(
  value: unknown,
  factTypes: string[],
) {
  const accepted = new Set(factTypes.map((item) => item.toUpperCase()));

  return dryRunSeasonLevels(value).some((level) => {
    const rules = level.activationRules;
    return (
      dryRunNumber(rules.schemaVersion, 1) >=
        guestGameMissionDefinitionVersion &&
      dryRunString(rules.evaluationPolicy)?.toUpperCase() ===
        'LEDGER_SUPPLEMENTAL' &&
      accepted.has(dryRunString(rules.triggerKind)?.toUpperCase() ?? '')
    );
  });
}

function supplementalSeasonMatchesFact(
  season: {
    createdAt: Date;
    periodFrom: Date | null;
    periodTo: Date | null;
    storeIds: Prisma.JsonValue;
  },
  stores: Array<{ id: string; externalDomain: string | null }>,
  externalDomain: string,
  happenedAt: Date,
) {
  const storeIds = guestGameStringArray(season.storeIds);
  const domains = storeIds.length
    ? guestGameRuleExternalDomains(storeIds, stores)
    : uniqueStrings(stores.map((store) => store.externalDomain ?? ''));
  const activatedAt = season.periodFrom ?? season.createdAt;

  return (
    domains.includes(externalDomain) &&
    happenedAt >= activatedAt &&
    (!season.periodTo || happenedAt <= season.periodTo)
  );
}

function supplementalFactEvidence(fact: {
  factType: string;
  sourceHash: string;
  externalDomain: string;
  sourceKind: string;
  confidence: string;
  happenedAt: Date | null;
  amount: Prisma.Decimal | null;
}): Prisma.InputJsonObject {
  return {
    source: 'guest_activity_fact',
    factType: fact.factType,
    sourceKind: fact.sourceKind,
    sourceHash: fact.sourceHash,
    externalDomain: fact.externalDomain,
    confidence: fact.confidence,
    happenedAt: fact.happenedAt?.toISOString() ?? null,
    amount: fact.amount?.toString() ?? null,
  };
}

function suppressLootBoxRewardsDryRun(
  dryRun: GuestGameDryRunResult,
): GuestGameDryRunResult {
  const rules = dryRun.rules.map((rule) => {
    if (!rule.eligible || rule.kind !== 'LOOT_BOX') {
      return rule;
    }

    return {
      ...rule,
      rewardMaterializationSuppressed: true,
      reasons: [
        ...rule.reasons,
        'Условие лутбокса выполнено: создано только право на ручное открытие.',
      ],
    };
  });

  return dryRunWithRules(dryRun, rules);
}

function suppressLootBoxEntitlementsDryRun(
  dryRun: GuestGameDryRunResult,
): GuestGameDryRunResult {
  const rules = dryRun.rules.map((rule) => {
    if (!rule.eligible || rule.kind !== 'LOOT_BOX') {
      return rule;
    }

    return {
      ...rule,
      eligible: false,
      blockers: [
        ...rule.blockers,
        'Для этого технического события создание права на открытие отключено.',
      ],
    };
  });

  return dryRunWithRules(dryRun, rules);
}

function dryRunWithRules(
  dryRun: GuestGameDryRunResult,
  rules: GuestGameDryRunRule[],
): GuestGameDryRunResult {
  const eligibleRules = rules.filter((rule) => rule.eligible);

  return {
    ...dryRun,
    summary: {
      checkedRules: rules.length,
      eligibleRules: eligibleRules.length,
      blockedRules: rules.length - eligibleRules.length,
      estimatedRewardAmount: sum(
        eligibleRules.map((rule) => rule.rewardAmount ?? 0),
      ),
      projectedXpDelta: sum(eligibleRules.map((rule) => rule.xpDelta)),
    },
    rules,
  };
}

function dryRunWithPersistedRewardIntents(
  dryRun: GuestGameDryRunResult,
  persisted: GuestGameDryRunResult | null,
) {
  const persistedKeys = new Set(
    (persisted?.rules ?? []).map(processRewardRuleKey),
  );
  const rules = dryRun.rules.map((rule) => {
    if (
      !shouldQueueProcessReward(rule) ||
      persistedKeys.has(processRewardRuleKey(rule))
    ) {
      return rule;
    }

    return {
      ...rule,
      eligible: false,
      blockers: [
        ...rule.blockers,
        'Награда по этому шагу уже была зафиксирована ранее.',
      ],
    };
  });

  return dryRunWithRules(dryRun, rules);
}

function processRewardRuleKey(rule: GuestGameDryRunRule) {
  const slotKey =
    rule.kind === 'SEASON'
      ? `${rule.battlePassStep ?? 'step'}:${rule.rewardType ?? 'reward'}`
      : (rule.rewardType ?? 'reward');
  return `${rule.kind}:${rule.id}:${slotKey}`;
}

function sessionClassificationRuleKey(rule: GuestGameDryRunRule) {
  return [
    rule.kind,
    rule.id,
    rule.battlePassStep ?? '',
    rule.battlePassRewardTrack ?? '',
  ].join(':');
}

function shouldQueueProcessReward(rule: GuestGameDryRunRule) {
  if (!rule.eligible || rule.rewardMaterializationSuppressed) {
    return false;
  }

  if (rule.kind === 'MISSION') {
    if (rule.rewardType === 'LOOT_BOX_ENTITLEMENT') {
      return rule.manualApprovalRequired;
    }
    return Boolean(rule.rewardLabel || (rule.rewardAmount ?? 0) > 0);
  }

  if (rule.kind === 'SEASON') {
    return Boolean(rule.selectedRewardLabel);
  }

  return Boolean(
    rule.rewardType ||
    rule.rewardLabel ||
    rule.selectedRewardLabel ||
    (rule.rewardAmount ?? 0) > 0,
  );
}

function rewardRuleLink(rule: GuestGameDryRunRule) {
  if (rule.kind === 'LOOT_BOX') {
    return { lootBoxId: rule.id };
  }

  if (rule.kind === 'MISSION') {
    return { missionId: rule.id };
  }

  return { seasonId: rule.id };
}

function processRewardQualifiedAt(
  dto: GuestGameProcessEventDto,
  dryRun: GuestGameDryRunResult,
  rule: GuestGameDryRunRule,
) {
  if (
    rule.kind === 'LOOT_BOX' &&
    nullableString(dto.sourceFactKind) === guestLootBoxOpenSourceKind
  ) {
    return dateValue(dto.limitOccurredAt)?.toISOString() ?? dryRun.occurredAt;
  }

  return dryRun.occurredAt;
}

function buildRewardApprovalConditions(row: RewardRow) {
  const evidence = jsonRecord(row.evidence);
  const rule = jsonRecord(evidence.rule as Prisma.JsonValue | null);
  const hasLinkedRule = Boolean(row.lootBox || row.mission || row.season);
  const values = [
    ...rewardApprovalRuleConditions(row, evidence, rule),
    ...(hasLinkedRule ? [] : rewardApprovalReasonConditions(rule)),
    ...rewardApprovalFallbackConditions(row, evidence, rule),
  ];
  const unique = new Set<string>();

  for (const value of values) {
    const line = rewardApprovalCleanLine(value);

    if (!line || unique.has(line)) {
      continue;
    }

    unique.add(line);
  }

  return [...unique].join(' · ') || 'Условия указаны в правиле геймификации';
}

function rewardApprovalRuleConditions(
  row: RewardRow,
  evidence: Record<string, unknown>,
  rule: Record<string, unknown>,
) {
  if (row.lootBox) {
    return rewardApprovalLootBoxConditions(row.lootBox, evidence, rule);
  }

  if (row.mission) {
    return rewardApprovalMissionConditions(row.mission, evidence, rule);
  }

  if (row.season) {
    return rewardApprovalSeasonConditions(row.season);
  }

  return [];
}

function rewardApprovalLootBoxConditions(
  lootBox: NonNullable<RewardRow['lootBox']>,
  evidence: Record<string, unknown>,
  rule: Record<string, unknown>,
) {
  const periodRules = jsonRecord(lootBox.periodRules);
  const limits = jsonRecord(lootBox.limits);
  const trigger =
    nullableString(lootBox.triggerKind) ??
    nullableString(rule.triggerKind) ??
    nullableString(evidence.eventType);
  const values = [
    trigger
      ? `Событие для появления: ${rewardApprovalEventLabel(trigger)}`
      : null,
    lootBox.segment
      ? `Аудитория: ${rewardApprovalSegmentLabel(lootBox.segment)}`
      : null,
    ...rewardApprovalPeriodRuleLines(periodRules),
    ...rewardApprovalSessionRuleLines(lootBox.sessionType),
    ...rewardApprovalGuestLogRuleLines(periodRules),
    ...rewardApprovalLimitRuleLines(limits),
  ];

  return values;
}

function rewardApprovalMissionConditions(
  mission: NonNullable<RewardRow['mission']>,
  evidence: Record<string, unknown>,
  rule: Record<string, unknown>,
) {
  const conditions = jsonRecord(mission.conditions);
  const trigger =
    nullableString(mission.triggerKind) ??
    nullableString(rule.triggerKind) ??
    nullableString(evidence.eventType);
  const values = [
    trigger
      ? `Событие для появления: ${rewardApprovalEventLabel(trigger)}`
      : null,
    mission.missionType
      ? `Тип задания: ${rewardApprovalMissionTypeLabel(mission.missionType)}`
      : null,
    mission.progressTarget
      ? `Цель: ${mission.progressTarget} ${rewardApprovalProgressUnitLabel(
          mission.progressUnit,
        )}`
      : null,
    ...rewardApprovalMissionConditionLines(conditions),
    ...rewardApprovalDatePeriodLines(mission.periodFrom, mission.periodTo),
    mission.perGuestLimit
      ? `Лимит на гостя: ${mission.perGuestLimit} ${pluralRu(
          mission.perGuestLimit,
          'награда',
          'награды',
          'наград',
        )}`
      : null,
    mission.totalRewardLimit
      ? `Общий лимит: ${mission.totalRewardLimit} ${pluralRu(
          mission.totalRewardLimit,
          'награда',
          'награды',
          'наград',
        )}`
      : null,
  ];

  return values;
}

function rewardApprovalSeasonConditions(
  season: NonNullable<RewardRow['season']>,
) {
  return [
    season.seasonType
      ? `Сезон: ${rewardApprovalHumanToken(season.seasonType)}`
      : null,
    ...rewardApprovalDatePeriodLines(season.periodFrom, season.periodTo),
  ];
}

function rewardApprovalMissionConditionLines(
  conditions: Record<string, unknown>,
) {
  const values = [
    ...rewardApprovalPeriodRuleLines(conditions),
    ...rewardApprovalGuestLogRuleLines(conditions),
  ];
  const windowDays = dryRunOptionalNumber(conditions.windowDays);
  const minSessionMinutes = dryRunOptionalNumber(conditions.minSessionMinutes);
  const minSpendAmount = dryRunOptionalNumber(conditions.minSpendAmount);
  const events = dryRunStringValues(
    conditions.events,
    conditions.eventTypes,
    conditions.guestLogTypes,
  );
  const productNames = dryRunStringValues(
    conditions.productNames,
    conditions.productName,
    conditions.categoryNames,
    conditions.categoryName,
  );

  if (windowDays != null) {
    values.push(
      `Окно выполнения: ${windowDays} ${pluralRu(windowDays, 'день', 'дня', 'дней')}`,
    );
  }
  if (minSessionMinutes != null) {
    values.push(`Минимум игры: ${minSessionMinutes} мин`);
  }
  if (minSpendAmount != null) {
    values.push(`Минимальная покупка: ${minSpendAmount} руб`);
  }
  if (events.length) {
    values.push(`События: ${events.map(rewardApprovalEventLabel).join(', ')}`);
  }
  if (productNames.length) {
    values.push(`Товары/категории: ${productNames.join(', ')}`);
  }
  if (conditions.noRepeatSameDay === true) {
    values.push('Без повтора в тот же день');
  }
  if (conditions.requiresLangameFact === true) {
    values.push('Нужен подтвержденный факт Langame');
  }

  return values;
}

function rewardApprovalPeriodRuleLines(rules: Record<string, unknown>) {
  const values: Array<string | null> = [];
  const timeWindowMode = nullableString(rules.timeWindowMode)?.toUpperCase();
  const hours = dryRunStringArray(rules.hours);
  const quietHoursEnabled = rules.quietHoursEnabled === true;
  const timeLabel =
    timeWindowMode === 'QUIET_HOURS' || (!timeWindowMode && quietHoursEnabled)
      ? 'Тихие часы'
      : timeWindowMode === 'CUSTOM'
        ? 'Свое окно'
        : timeWindowMode === 'ANY'
          ? 'Любое время'
          : hours.length
            ? 'Свое окно'
            : null;

  if (timeLabel && timeLabel !== 'Любое время') {
    values.push(
      hours.length
        ? `Когда показывать: ${timeLabel} (${hours.join(', ')})`
        : `Когда показывать: ${timeLabel}`,
    );
  }

  const weekdayMode = nullableString(rules.weekdayMode)?.toUpperCase();
  const weekdays = dryRunNumberArray(rules.weekdays);
  const weekdayLabel =
    weekdayMode === 'WEEKDAYS' || (!weekdayMode && rules.weekdaysOnly === true)
      ? 'Будни'
      : weekdayMode === 'WEEKENDS'
        ? 'Выходные'
        : weekdayMode === 'CUSTOM'
          ? rewardApprovalWeekdaysLabel(weekdays)
          : weekdayMode === 'ANY'
            ? 'Любой день'
            : weekdays.length
              ? rewardApprovalWeekdaysLabel(weekdays)
              : null;

  if (weekdayLabel && weekdayLabel !== 'Любой день') {
    values.push(`По каким дням: ${weekdayLabel}`);
  }

  return values;
}

function rewardApprovalSessionRuleLines(sessionType: string | null) {
  const values: Array<string | null> = [];
  const normalizedSessionType = sessionType
    ? normalizeSessionType(sessionType)
    : null;

  if (normalizedSessionType && normalizedSessionType !== 'any') {
    values.push(
      `Тип сессии: ${
        rewardApprovalSessionTypeLabels[normalizedSessionType] ??
        rewardApprovalHumanToken(normalizedSessionType)
      }`,
    );
  }

  return values;
}

function rewardApprovalGuestLogRuleLines(rules: Record<string, unknown>) {
  const allowed = dryRunStringValues(
    rules.guestLogTypes,
    rules.allowedGuestLogTypes,
    rules.eventTypes,
  );
  const blocked = dryRunStringValues(
    rules.blockedGuestLogTypes,
    rules.blockedEventTypes,
  );
  const values: Array<string | null> = [];

  if (allowed.length) {
    values.push(
      `События Langame: ${allowed.map(rewardApprovalEventLabel).join(', ')}`,
    );
  }
  if (blocked.length) {
    values.push(
      `Не засчитывать: ${blocked.map(rewardApprovalEventLabel).join(', ')}`,
    );
  }

  return values;
}

function rewardApprovalLimitRuleLines(rules: Record<string, unknown>) {
  const periodicLimit = lootBoxPeriodicLimitPeriod(rules.periodicLimit);
  const perGuestPerWeek = dryRunOptionalNumber(rules.perGuestPerWeek);
  const totalPerDay = dryRunOptionalNumber(rules.totalPerDay);
  const values: Array<string | null> = [];

  if (periodicLimit) {
    values.push(
      `Периодический: ${lootBoxPeriodicLimitLabel(periodicLimit).toLowerCase()}`,
    );
  }
  if (perGuestPerWeek != null) {
    values.push(
      `Лимит на гостя: ${perGuestPerWeek} ${pluralRu(
        perGuestPerWeek,
        'открытие',
        'открытия',
        'открытий',
      )} в неделю`,
    );
  }
  if (totalPerDay != null) {
    values.push(
      `Общий дневной лимит: ${totalPerDay} ${pluralRu(
        totalPerDay,
        'открытие',
        'открытия',
        'открытий',
      )}`,
    );
  }

  return values;
}

function rewardApprovalDatePeriodLines(
  periodFrom: Date | string | null,
  periodTo: Date | string | null,
) {
  if (!periodFrom && !periodTo) {
    return [];
  }

  const from = periodFrom ? rewardApprovalDateLabel(periodFrom) : 'без начала';
  const to = periodTo ? rewardApprovalDateLabel(periodTo) : 'без окончания';

  return [`Период: ${from} - ${to}`];
}

function rewardApprovalReasonConditions(rule: Record<string, unknown>) {
  return dryRunArray(rule.reasons)
    .map((item) => nullableString(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => !rewardApprovalIsOperationalReason(item));
}

function rewardApprovalFallbackConditions(
  row: RewardRow,
  evidence: Record<string, unknown>,
  rule: Record<string, unknown>,
) {
  if (row.lootBox || row.mission || row.season) {
    return [];
  }

  const eventType =
    nullableString(evidence.eventType) ?? nullableString(rule.triggerKind);
  const values = [
    eventType
      ? `Факт выполнения: ${rewardApprovalEventLabel(eventType)}`
      : null,
    nullableString(rule.name) ? `Правило: ${nullableString(rule.name)}` : null,
    rewardApprovalBusinessNote(row.note),
  ];

  return values;
}

function rewardApprovalBusinessNote(value: unknown) {
  const note = nullableString(value);

  if (!note || /подтвержденн.+запуск.+события геймификации/i.test(note)) {
    return null;
  }

  return note;
}

function rewardApprovalCleanLine(value: string | null | undefined) {
  const line = value?.trim();

  if (!line || rewardApprovalLooksTechnical(line)) {
    return null;
  }

  return line.replace(/\s+/g, ' ');
}

function rewardApprovalLooksTechnical(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes('externalid') ||
    normalized.includes('external id') ||
    normalized.includes('guest-game:') ||
    normalized.includes('sourcefact') ||
    normalized.includes('rawphone') ||
    normalized.includes('payload') ||
    /^[a-z]+:[a-z_]+:[a-z_]+:[a-f0-9-]{16,}/i.test(value)
  );
}

function rewardApprovalIsOperationalReason(value: string) {
  return [
    'Правило активно',
    'Черновик проверяется в тестовом режиме',
    'Выбранный клуб входит в область правила',
    'Доступно для всей сети',
    'Бюджет не задан',
    'Выдача требует подтверждения сотрудником',
  ].includes(value);
}

function rewardApprovalEventLabel(value: string) {
  return (
    rewardApprovalEventLabels[value] ??
    rewardApprovalEventLabels[value.toUpperCase()] ??
    rewardApprovalHumanToken(value)
  );
}

function rewardApprovalSegmentLabel(value: string) {
  return rewardApprovalSegmentLabels[value] ?? rewardApprovalHumanToken(value);
}

function rewardApprovalMissionTypeLabel(value: string) {
  return (
    rewardApprovalMissionTypeLabels[value] ?? rewardApprovalHumanToken(value)
  );
}

function rewardApprovalProgressUnitLabel(value: string | null) {
  if (!value) {
    return 'шагов';
  }

  return (
    rewardApprovalProgressUnitLabels[value] ?? rewardApprovalHumanToken(value)
  );
}

function rewardApprovalWeekdaysLabel(values: number[]) {
  const labels = values.map((value) => {
    switch (value) {
      case 1:
        return 'Пн';
      case 2:
        return 'Вт';
      case 3:
        return 'Ср';
      case 4:
        return 'Чт';
      case 5:
        return 'Пт';
      case 6:
        return 'Сб';
      case 0:
        return 'Вс';
      default:
        return null;
    }
  });

  return labels.filter(Boolean).join(', ') || 'выбранные дни';
}

function rewardApprovalDateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function rewardApprovalHumanToken(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(value) % 10;
  const mod100 = Math.abs(value) % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }

  return many;
}

function processRuleKindLabel(kind: GuestGameDryRunRule['kind']) {
  if (kind === 'LOOT_BOX') {
    return 'Лутбокс';
  }

  if (kind === 'MISSION') {
    return 'Задание';
  }

  return 'Battle Pass';
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isSerializationConflictError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034')
  );
}

function lootBoxLimitCodesFromEvidence(value: unknown) {
  const evidence = jsonRecord(value ?? null);
  const guard = jsonRecord(evidence.atomicLimitGuard ?? null);
  return uniqueStrings(
    (Array.isArray(guard.codes) ? guard.codes : []).map((code) => String(code)),
  );
}

function mapUser(
  row: { id: string; fullName: string | null; email: string } | null,
): GuestGameUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.fullName ?? row.email,
    email: row.email,
  };
}

function mapGuestLogTypeMapping(
  row: GuestLogTypeMappingRow,
): GuestGameGuestLogTypeMapping {
  return {
    id: row.id,
    rawType: row.rawType,
    normalizedType: row.normalizedType,
    label: row.label,
    preset: normalizeGuestLogMappingPreset(row.preset),
    intent: normalizeGuestLogMappingIntent(row.intent),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: mapUser(row.createdByUser),
    updatedBy: mapUser(row.updatedByUser),
  };
}

function mapAudience(
  row: {
    id: string;
    name: string;
    description: string | null;
    guestsCount: number;
  } | null,
): GuestGameAudience | null {
  return row ? { ...row } : null;
}

function mapProfileSummary(
  row: {
    id: string;
    displayName: string | null;
    contactMasked: string | null;
    xp: number;
    level: number;
  } | null,
): Pick<
  GuestGameProfile,
  'id' | 'displayName' | 'contactMasked' | 'xp' | 'level'
> | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayName: row.displayName ?? 'Игровой профиль',
    contactMasked: row.contactMasked,
    xp: row.xp,
    level: row.level,
  };
}

function storedEventToProgressEvent(row: {
  eventType: string;
  occurredAt: Date;
  externalDomain: string | null;
  payload: Prisma.JsonValue | null;
}): GuestGameProgressEvent {
  const payload = jsonRecord(row.payload);
  const input = jsonRecord(payload.input as Prisma.JsonValue | null);
  const store = jsonRecord(payload.store as Prisma.JsonValue | null);

  return {
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    sourceFactId: nullableString(payload.sourceFactId),
    storeId: nullableString(store.id),
    externalDomain:
      nullableString(row.externalDomain) ??
      nullableString(payload.externalDomain),
    sessionType: nullableString(input.sessionType),
    sessionPacket: nullableBooleanValue(input.sessionPacket),
    sessionMinutes: dryRunOptionalNumber(input.sessionMinutes),
    spendAmount: dryRunOptionalNumber(input.spendAmount),
    tariffGroupId: nullableString(input.tariffGroupId),
    tariffPeriodId: nullableString(input.tariffPeriodId),
    tariffTypeId: nullableString(input.tariffTypeId),
    guestLogType: nullableString(input.guestLogType),
    productId: nullableString(input.productId),
    externalProductId: nullableString(input.externalProductId),
    externalCategoryKey: nullableString(input.externalCategoryKey),
    externalCategoryId: nullableString(input.externalCategoryId),
    categoryId: nullableString(input.categoryId),
    productName: nullableString(input.productName),
    categoryName: nullableString(input.categoryName),
    supplierName: nullableString(input.supplierName),
    quantity: dryRunOptionalNumber(input.quantity),
  };
}

function currentEventToProgressEvent(
  context: DryRunContext,
): GuestGameProgressEvent {
  return {
    eventType: context.eventType,
    occurredAt: context.occurredAt,
    sourceFactId: context.sourceFactId,
    storeId: context.storeId,
    externalDomain: context.externalDomain,
    sessionType: context.sessionType,
    sessionPacket: context.sessionPacket,
    sessionMinutes: context.sessionMinutes,
    spendAmount: context.spendAmount,
    tariffGroupId: context.tariffGroupId,
    tariffPeriodId: context.tariffPeriodId,
    tariffTypeId: context.tariffTypeId,
    guestLogType: context.guestLogType,
    productId: context.productId,
    externalProductId: context.externalProductId,
    externalCategoryKey: context.externalCategoryKey,
    externalCategoryId: context.externalCategoryId,
    categoryId: context.categoryId,
    productName: context.productName,
    categoryName: context.categoryName,
    supplierName: context.supplierName,
    quantity: context.quantity,
  };
}

type DryRunContext = {
  eventType: string;
  occurredAt: Date;
  limitOccurredAt: Date;
  sourceFactId: string | null;
  profile: GuestGameProfile | null;
  guest: GuestGameProfile['guest'];
  storeId: string | null;
  externalDomain: string | null;
  timeZone: string;
  sessionType: string | null;
  sessionPacket: boolean | null;
  sessionMinutes: number;
  spendAmount: number;
  tariffGroupId: string | null;
  tariffPeriodId: string | null;
  tariffTypeId: string | null;
  guestLogType: string | null;
  productId: string | null;
  externalProductId: string | null;
  externalCategoryKey: string | null;
  externalCategoryId: string | null;
  categoryId: string | null;
  productName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  quantity: number | null;
  rewards: GuestGameReward[];
  missionRewardEntitlements: DryRunMissionRewardEntitlement[];
  lootBoxLimitEntitlements: DryRunMissionRewardEntitlement[];
  rewardTemplateLootBoxIds: Set<string>;
  progressEvents: GuestGameProgressEvent[];
  audienceMemberIds: Set<string>;
  ruleDomainTimeZones?: ReadonlyMap<string, ReadonlyMap<string, string | null>>;
  ruleExternalDomains?: ReadonlyMap<string, readonly string[]>;
};

type DryRunMissionRewardEntitlement = {
  id: string;
  ruleId: string;
  status: string;
  rewardId: string | null;
  profileId: string | null;
  guestId: string | null;
  qualifiedAt: Date;
  evidence: Prisma.JsonValue | null;
};

type LootBoxAtomicLimitReward = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  qualifiedAt: Date;
};

type LootBoxAtomicLimitEntitlement = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  rewardId: string | null;
  qualifiedAt: Date;
};

type LootBoxAtomicLimitGuard = {
  exhausted: boolean;
  codes: string[];
  counts: Record<string, number | string | null>;
};

function evaluateLootBoxDryRun(
  rule: GuestGameLootBox,
  context: DryRunContext,
): GuestGameDryRunRule {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const ruleRewards = dryRunRewardsForRule(context.rewards, 'lootBox', rule.id);
  const selectedReward = pickLootBoxReward(rule);
  const selectedRewardLabel =
    selectedReward?.rewardLabel ?? rule.rewardLabel ?? rule.name;
  const rewardAmount = selectedReward?.rewardAmount ?? rule.rewardAmount ?? 0;
  const rewardType = selectedReward?.rewardType ?? rule.rewardType;
  const rewardLabel = selectedReward?.rewardLabel ?? rule.rewardLabel;

  appendDryRunProfileCheck(context, blockers, reasons);
  appendDryRunStatusCheck(rule.status, blockers, reasons);
  appendDryRunTriggerCheck(rule.triggerKind, context.eventType, blockers);
  appendDryRunRuleActivationCheck(rule, context, blockers, reasons);
  appendDryRunAudienceCheck(rule, context, blockers, reasons);
  const scopedContext = appendDryRunStoreCheck(
    rule.id,
    rule.storeIds,
    guestGameStringArray(jsonRecord(rule.periodRules).externalDomains),
    context,
    blockers,
    reasons,
  );
  if (scopedContext) {
    appendDryRunPeriodRules(
      rule.periodRules,
      scopedContext.occurredAt,
      scopedContext.timeZone,
      blockers,
      reasons,
    );
    appendDryRunSessionConditionCheck(
      rule.sessionType,
      scopedContext,
      blockers,
      reasons,
    );
    appendDryRunLootBoxSessionDurationCheck(
      rule.triggerKind,
      rule.periodRules,
      scopedContext,
      blockers,
      reasons,
    );
    appendDryRunTariffConditionCheck(
      rule.periodRules,
      scopedContext,
      blockers,
      reasons,
    );
    appendDryRunGuestLogTypeCheck(
      rule.periodRules,
      scopedContext,
      blockers,
      reasons,
    );
  }
  appendDryRunBudgetCheck(
    rule.budgetAmount,
    rewardAmount,
    ruleRewards,
    blockers,
    reasons,
  );
  if (scopedContext) {
    appendDryRunLootBoxLimits(
      rule,
      scopedContext,
      ruleRewards,
      context.lootBoxLimitEntitlements.filter(
        (entitlement) => entitlement.ruleId === rule.id,
      ),
      blockers,
      reasons,
    );
  }

  if (rule.segment) {
    reasons.push(`Сегмент: ${rule.segment}`);
  }
  if (rule.manualApprovalRequired) {
    reasons.push('Выдача требует подтверждения сотрудником');
  }

  return dryRunRuleResult({
    id: rule.id,
    kind: 'LOOT_BOX',
    name: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    evaluationPolicy: 'LIVE_PRIMARY',
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType,
    rewardAmount,
    rewardLabel,
    selectedRewardLabel,
    selectedReward,
    xpDelta: 0,
    budgetAmount: rule.budgetAmount,
    progress: null,
    periodicLimitPeriod: lootBoxPeriodicLimitPeriod(
      dryRunRecord(rule.limits).periodicLimit,
    ),
    reasons,
    blockers,
  });
}

function evaluateMissionDryRun(
  rule: GuestGameMission,
  context: DryRunContext,
): GuestGameDryRunRule {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const ruleRewards = dryRunRewardsForRule(context.rewards, 'mission', rule.id);
  const ruleEntitlements = context.missionRewardEntitlements.filter(
    (entitlement) =>
      nullableId(jsonRecord(entitlement.evidence).missionId) === rule.id,
  );

  appendDryRunProfileCheck(context, blockers, reasons);
  appendDryRunStatusCheck(rule.status, blockers, reasons);
  appendDryRunTriggerCheck(rule.triggerKind, context.eventType, blockers);
  appendDryRunRuleActivationCheck(rule, context, blockers, reasons);
  appendDryRunAudienceCheck(rule, context, blockers, reasons);
  const scopedContext = appendDryRunStoreCheck(
    rule.id,
    rule.storeIds,
    guestGameStringArray(jsonRecord(rule.conditions).externalDomains),
    context,
    blockers,
    reasons,
  );
  appendDryRunDateBounds(
    rule.periodFrom,
    rule.periodTo,
    context.occurredAt,
    blockers,
    reasons,
  );
  if (scopedContext) {
    appendDryRunMissionConditions(rule, scopedContext, blockers, reasons);
  }
  const progress = scopedContext
    ? appendDryRunMissionProgress(rule, scopedContext, blockers, reasons)
    : null;
  appendDryRunBudgetCheck(
    rule.budgetAmount,
    rule.rewardAmount ?? 0,
    ruleRewards,
    blockers,
    reasons,
  );
  if (scopedContext) {
    appendDryRunMissionLimits(
      rule,
      scopedContext,
      ruleRewards,
      ruleEntitlements,
      blockers,
      reasons,
    );
  }

  if (rule.manualApprovalRequired) {
    reasons.push('Выдача требует подтверждения сотрудником');
  }

  return dryRunRuleResult({
    id: rule.id,
    kind: 'MISSION',
    name: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    evaluationPolicy: guestGameEvaluationPolicy(rule.evaluationPolicy),
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel,
    selectedRewardLabel: rule.rewardLabel ?? rule.name,
    selectedReward: null,
    xpDelta: rule.xpReward,
    budgetAmount: rule.budgetAmount,
    progress,
    periodicLimitPeriod: lootBoxPeriodicLimitPeriod(
      dryRunRecord(dryRunRecord(rule.conditions).reward).periodicity,
    ),
    missionDenySameDayRepeat:
      dryRunRecord(rule.antiFraudRules).denySameDayRepeat === true,
    missionPerGuestLimit: rule.perGuestLimit,
    missionTotalRewardLimit: rule.totalRewardLimit,
    reasons,
    blockers,
  });
}

function evaluateSeasonDryRun(
  rule: GuestGameSeason,
  context: DryRunContext,
): GuestGameDryRunRule {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const ruleRewards = dryRunRewardsForRule(context.rewards, 'season', rule.id);
  const levels = dryRunSeasonLevels(rule.levels);
  const completedLevelCount = dryRunSeasonCompletedLevelCount(
    levels,
    ruleRewards,
    context,
  );
  const currentStep = levels[completedLevelCount] ?? null;
  const currentStepPolicy = guestGameEvaluationPolicy(
    dryRunRecord(currentStep?.activationRules).evaluationPolicy,
  );
  const stepRewardPlan = currentStep
    ? dryRunSeasonFreeRewardPlan(currentStep, context, blockers, reasons)
    : null;
  let progress: GuestGameProgressResult | null = null;

  appendDryRunProfileCheck(context, blockers, reasons);
  appendDryRunStatusCheck(rule.status, blockers, reasons);
  appendDryRunAudienceCheck(rule, context, blockers, reasons);
  const scopedContext = appendDryRunStoreCheck(
    rule.id,
    rule.storeIds,
    dryRunStringArray(currentStep?.activationRules.externalDomains),
    context,
    blockers,
    reasons,
  );
  appendDryRunDateBounds(
    rule.periodFrom,
    rule.periodTo,
    context.occurredAt,
    blockers,
    reasons,
  );

  if (!levels.length) {
    blockers.push('В Battle Pass нет настроенных шагов');
  } else if (!currentStep) {
    blockers.push('Все шаги Battle Pass уже выполнены');
  } else if (scopedContext) {
    reasons.push(
      `Текущий шаг Battle Pass: ${currentStep.sequence}/${levels.length}`,
    );
    progress = appendDryRunSeasonStepActivationCheck(
      rule,
      currentStep,
      scopedContext,
      dryRunSeasonCurrentStepActivatedAt(rule, ruleRewards, scopedContext),
      blockers,
      reasons,
    );
  }

  appendDryRunBudgetCheck(
    rule.budgetAmount,
    stepRewardPlan?.rewardAmount ?? 0,
    ruleRewards,
    blockers,
    reasons,
  );

  if (rule.premiumEnabled) {
    reasons.push('Есть premium-дорожка');
  }
  if (rule.manualApprovalRequired) {
    reasons.push('Награды сезона требуют подтверждения сотрудником');
  }

  const selectedRewardLabel =
    currentStep && blockers.length === 0
      ? (stepRewardPlan?.rewardLabel ??
        dryRunSeasonStepRewardLabel(currentStep))
      : null;

  return dryRunRuleResult({
    id: rule.id,
    kind: 'SEASON',
    name: rule.name,
    status: rule.status,
    triggerKind: 'BATTLE_PASS',
    evaluationPolicy: currentStepPolicy,
    manualApprovalRequired:
      rule.manualApprovalRequired || stepRewardPlan?.delivery === 'ADMIN',
    rewardType:
      stepRewardPlan?.rewardType ??
      (selectedRewardLabel ? 'BATTLE_PASS_REWARD' : null),
    rewardAmount: stepRewardPlan?.rewardAmount ?? 0,
    rewardLabel: selectedRewardLabel,
    selectedRewardLabel,
    selectedReward: null,
    xpDelta: 0,
    budgetAmount: rule.budgetAmount,
    progress,
    battlePassLevel: currentStep?.level ?? null,
    battlePassStep: currentStep?.sequence ?? null,
    battlePassStepTitle: currentStep?.title ?? null,
    battlePassRewardTrack: stepRewardPlan?.rewardTrack ?? null,
    rewardLootBoxId: stepRewardPlan?.rewardLootBoxId ?? null,
    reasons,
    blockers,
  });
}

function dryRunRuleResult(input: Omit<GuestGameDryRunRule, 'eligible'>) {
  return {
    ...input,
    eligible: input.blockers.length === 0,
  };
}

function appendDryRunStatusCheck(
  status: string,
  blockers: string[],
  reasons: string[],
) {
  if (status === 'ACTIVE') {
    reasons.push('Правило активно');
    return;
  }
  if (status === 'DRAFT') {
    reasons.push('Черновик проверяется в тестовом режиме');
    return;
  }

  blockers.push(`Статус правила не позволяет запуск: ${status}`);
}

function appendDryRunProfileCheck(
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  if (!context.profile && !context.guest) {
    reasons.push('Гость не выбран: проверяются только общие условия');
    return;
  }
  if (context.profile?.status && context.profile.status !== 'ACTIVE') {
    blockers.push(`Профиль гостя не активен: ${context.profile.status}`);
    return;
  }

  reasons.push('Гость выбран для проверки');
}

function appendDryRunAudienceCheck(
  rule: Pick<GuestGameRuleBase, 'audience'>,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  if (!rule.audience) {
    return;
  }

  if (!context.guest) {
    blockers.push(
      `Гость не связан с Langame, нельзя проверить аудиторию: ${rule.audience.name}`,
    );
    return;
  }

  if (!context.audienceMemberIds.has(rule.audience.id)) {
    blockers.push(`Гость не входит в аудиторию: ${rule.audience.name}`);
    return;
  }

  reasons.push(`Аудитория подходит: ${rule.audience.name}`);
}

function appendDryRunTriggerCheck(
  triggerKind: string,
  eventType: string,
  blockers: string[],
) {
  if (guestGameTriggerMatches(triggerKind, eventType)) {
    return;
  }

  blockers.push(`Триггер ${triggerKind} не совпадает с событием ${eventType}`);
}

function appendDryRunRuleActivationCheck(
  rule: Pick<GuestGameRuleBase, 'status' | 'updatedAt'> & {
    limits?: Prisma.JsonValue | null;
    conditions?: Prisma.JsonValue | null;
  },
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const activatedAt = dryRunRuleActivatedAt(rule);

  if (!activatedAt) {
    return;
  }

  if (context.occurredAt.getTime() < activatedAt.getTime()) {
    blockers.push('Событие произошло раньше активации правила');
    return;
  }

  reasons.push('Событие произошло после активации правила');
}

function dryRunRuleActivatedAt(
  rule: Pick<GuestGameRuleBase, 'status' | 'updatedAt'> & {
    limits?: Prisma.JsonValue | null;
    conditions?: Prisma.JsonValue | null;
  },
) {
  const limits = dryRunRecord(rule.limits);
  const conditions = dryRunRecord(rule.conditions);
  return [
    dryRunDateOrNull(limits.restartedAt),
    dryRunDateOrNull(limits.activatedAt),
    dryRunDateOrNull(conditions.activatedAt),
  ].reduce(maxDate, null);
}

function ruleMetadataWithActivatedAt(
  value: unknown,
  activatedAt = new Date(),
): Prisma.InputJsonObject {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...record,
    activatedAt: activatedAt.toISOString(),
  };
}

function appendDryRunStoreCheck(
  ruleId: string,
  storeIds: string[],
  configuredDomains: string[],
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  if (!storeIds.length) {
    reasons.push('Доступно для всей сети');
    return context;
  }
  if (context.storeId) {
    if (!storeIds.includes(context.storeId)) {
      blockers.push('Выбранный клуб не входит в область правила');
      return null;
    }

    reasons.push('Выбранный клуб входит в область правила');
    return context;
  }

  const externalDomain = nullableString(context.externalDomain);
  if (!externalDomain) {
    blockers.push(
      'Факт не содержит ни точный клуб, ни домен Langame для проверки области правила',
    );
    return null;
  }

  const allowedDomains = dryRunRuleExternalDomains(
    ruleId,
    configuredDomains,
    context,
  );
  if (!allowedDomains.includes(externalDomain)) {
    blockers.push(
      'Домен факта Langame не входит в область выбранных клубов правила',
    );
    return null;
  }

  const domainTimeZone = context.ruleDomainTimeZones
    ?.get(ruleId)
    ?.get(externalDomain);
  if (!domainTimeZone) {
    blockers.push(
      'Часовой пояс для доменного факта не определён однозначно по выбранным клубам правила',
    );
    return null;
  }

  reasons.push(
    'Домен факта Langame совпадает с областью выбранных клубов правила',
  );
  return { ...context, timeZone: domainTimeZone };
}

function appendDryRunPeriodRules(
  value: unknown,
  occurredAt: Date,
  timeZone: string,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);
  const metric = dryRunRecord(rules.metric ?? rules.progressMetric);
  const weekdayMode = (
    nullableString(metric.weekdayMode ?? rules.weekdayMode) ?? 'ANY'
  ).toUpperCase();
  const weekdays = dryRunNumberArray(metric.weekdays ?? rules.weekdays);
  const localTime = dryRunLocalTimeParts(occurredAt, timeZone);
  const weekday = localTime.weekday;
  const weekdaysOnly =
    metric.weekdaysOnly === true || rules.weekdaysOnly === true;
  const expectedWeekdays =
    weekdayMode === 'WEEKDAYS' || weekdaysOnly
      ? [1, 2, 3, 4, 5]
      : weekdayMode === 'WEEKENDS'
        ? [0, 6]
        : weekdays;

  if (expectedWeekdays.length && !expectedWeekdays.includes(weekday)) {
    blockers.push('День недели не входит в период правила');
  } else if (expectedWeekdays.length) {
    reasons.push('День недели подходит');
  }

  const hours = dryRunStringArray(metric.hours ?? rules.hours);
  if (!hours.length) {
    return;
  }

  if (
    hours.some((window) =>
      dryRunIsWithinTimeWindow(localTime.minutesOfDay, window),
    )
  ) {
    reasons.push(`Время входит в окно ${hours.join(', ')}`);
  } else {
    blockers.push(`Время не входит в окно ${hours.join(', ')}`);
  }
}

function appendDryRunSessionConditionCheck(
  sessionTypeValue: unknown,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const expectedType = dryRunString(sessionTypeValue);
  const actualType = context.sessionType;

  if (expectedType && isActionableSessionType(expectedType)) {
    if (!actualType) {
      blockers.push('Тип сессии не указан для проверки правила');
    } else if (
      normalizeSessionType(expectedType) !== normalizeSessionType(actualType)
    ) {
      blockers.push(`Тип сессии не подходит: нужен ${expectedType}`);
    } else {
      reasons.push(`Тип сессии подходит: ${actualType}`);
    }
  } else if (expectedType) {
    reasons.push(`Тип сессии правила: ${expectedType}`);
  }
}

function appendDryRunLootBoxSessionDurationCheck(
  triggerKind: string,
  value: unknown,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);
  const metric = dryRunRecord(rules.metric ?? rules.progressMetric);
  const configuredMinimum = dryRunOptionalNumber(
    metric.minSessionMinutes ?? rules.minSessionMinutes,
  );
  const minimum =
    configuredMinimum ??
    (triggerKind.trim().toUpperCase() === 'PLAY_HOUR' ? 60 : null);

  if (minimum === null) {
    return;
  }

  if (context.sessionMinutes < minimum) {
    blockers.push(
      `Сессия короче условия кейса: ${context.sessionMinutes}/${minimum} мин`,
    );
    return;
  }

  reasons.push(
    `Длительность сессии подходит для кейса: ${context.sessionMinutes} мин`,
  );
}

function appendDryRunTariffConditionCheck(
  value: unknown,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);

  appendDryRunTariffSingleCheck(
    'Тарифная группа',
    dryRunStringValues(rules.tariffGroupIds, rules.tariffGroupId),
    context.tariffGroupId,
    blockers,
    reasons,
  );
  appendDryRunTariffSingleCheck(
    'Тарифный период',
    dryRunStringValues(rules.tariffPeriodIds, rules.tariffPeriodId),
    context.tariffPeriodId,
    blockers,
    reasons,
  );
  appendDryRunTariffSingleCheck(
    'Тип тарифа',
    dryRunStringValues(rules.tariffTypeIds, rules.tariffTypeId),
    context.tariffTypeId,
    blockers,
    reasons,
  );
}

function appendDryRunTariffSingleCheck(
  label: string,
  expectedValues: string[],
  actualValue: string | null,
  blockers: string[],
  reasons: string[],
) {
  const uniqueExpected = Array.from(new Set(expectedValues));

  if (!uniqueExpected.length) {
    return;
  }

  if (!actualValue) {
    blockers.push(`${label}: значение не указано для проверки правила`);
    return;
  }

  if (!uniqueExpected.includes(actualValue)) {
    blockers.push(`${label} не подходит: нужен ${uniqueExpected.join(', ')}`);
    return;
  }

  reasons.push(`${label} подходит`);
}

function guestGameRuleUsesGuestLogs(
  rule: GuestGameLootBox | GuestGameMission | GuestGameSeason,
) {
  if ('xpRules' in rule) {
    return guestGameRuleConfigUsesGuestLogs(rule.xpRules);
  }

  if ('conditions' in rule) {
    return (
      guestGameRuleConfigUsesGuestLogs(rule.conditions) ||
      guestGameRuleConfigUsesGuestLogs(rule.antiFraudRules)
    );
  }

  return guestGameRuleConfigUsesGuestLogs(rule.periodRules);
}

function guestGameRuleConfigUsesGuestLogs(value: unknown) {
  const rules = dryRunRecord(value);
  const configuredTypes = normalizedGuestLogTypes(
    dryRunStringValues(
      rules.guestLogTypes,
      rules.guestLogType,
      rules.logTypes,
      rules.logType,
      rules.blockedGuestLogTypes,
      rules.deniedGuestLogTypes,
      rules.blockedLogTypes,
      rules.deniedLogTypes,
    ),
  );
  const guestLogXp = dryRunOptionalNumber(rules.guestLog);

  return configuredTypes.length > 0 || (guestLogXp != null && guestLogXp > 0);
}

function appendDryRunGuestLogTypeCheck(
  value: unknown,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);
  const allowedTypes = normalizedGuestLogTypes(
    dryRunStringValues(
      rules.guestLogTypes,
      rules.guestLogType,
      rules.logTypes,
      rules.logType,
    ),
  );
  const blockedTypes = normalizedGuestLogTypes(
    dryRunStringValues(
      rules.blockedGuestLogTypes,
      rules.deniedGuestLogTypes,
      rules.blockedLogTypes,
      rules.deniedLogTypes,
    ),
  );

  if (!allowedTypes.length && !blockedTypes.length) {
    return;
  }

  const actualType = context.guestLogType
    ? normalizeGuestLogType(context.guestLogType)
    : null;

  if (!actualType) {
    blockers.push('Тип события guests/logs не указан для проверки правила');
    return;
  }

  if (blockedTypes.includes(actualType)) {
    blockers.push(
      `Тип guests/logs заблокирован anti-fraud правилом: ${context.guestLogType}`,
    );
    return;
  }

  if (blockedTypes.length) {
    reasons.push('Тип guests/logs не входит в anti-fraud блокировки');
  }

  if (!allowedTypes.length) {
    return;
  }

  if (!allowedTypes.includes(actualType)) {
    blockers.push(
      `Тип guests/logs не подходит: нужен ${allowedTypes.join(', ')}`,
    );
    return;
  }

  reasons.push(`Тип guests/logs подходит: ${context.guestLogType}`);
}

function normalizedGuestLogTypes(values: string[]) {
  return Array.from(new Set(values.map(normalizeGuestLogType).filter(Boolean)));
}

function normalizeGuestLogType(value: string) {
  return value.trim().toLowerCase();
}

function appendDryRunDateBounds(
  periodFrom: string | null,
  periodTo: string | null,
  occurredAt: Date,
  blockers: string[],
  reasons: string[],
) {
  const from = periodFrom ? new Date(periodFrom) : null;
  const to = periodTo ? new Date(periodTo) : null;

  if (from && occurredAt < from) {
    blockers.push('Событие раньше периода действия');
  }
  if (to && occurredAt > to) {
    blockers.push('Событие позже периода действия');
  }
  if (from || to) {
    reasons.push('Период действия проверен');
  }
}

function appendDryRunMissionConditions(
  rule: GuestGameMission,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const conditions = dryRunRecord(rule.conditions);
  const minSessionMinutes = dryRunOptionalNumber(conditions.minSessionMinutes);
  const minSpendAmount = dryRunOptionalNumber(conditions.minSpendAmount);
  const windowDays = dryRunOptionalNumber(conditions.windowDays);

  appendDryRunSessionConditionCheck(
    conditions.sessionType,
    context,
    blockers,
    reasons,
  );
  appendDryRunTariffConditionCheck(conditions, context, blockers, reasons);
  appendDryRunGuestLogTypeCheck(conditions, context, blockers, reasons);
  appendDryRunGuestLogTypeCheck(
    rule.antiFraudRules,
    context,
    blockers,
    reasons,
  );
  appendDryRunPeriodRules(
    conditions,
    context.occurredAt,
    context.timeZone,
    blockers,
    reasons,
  );

  if (minSessionMinutes != null && context.sessionMinutes < minSessionMinutes) {
    blockers.push(
      `Сессия короче условия: ${context.sessionMinutes}/${minSessionMinutes} мин`,
    );
  } else if (minSessionMinutes != null) {
    reasons.push(`Длительность сессии подходит: ${context.sessionMinutes} мин`);
  }

  if (minSpendAmount != null && context.spendAmount < minSpendAmount) {
    blockers.push(
      `Сумма покупки ниже условия: ${context.spendAmount}/${minSpendAmount} руб`,
    );
  } else if (minSpendAmount != null) {
    reasons.push(`Сумма покупки подходит: ${context.spendAmount} руб`);
  }

  if (conditions.requiresLangameFact === true) {
    reasons.push('Факт Langame обязателен для боевого подтверждения');
  }
  if (windowDays != null) {
    reasons.push(`Окно выполнения: ${windowDays} дн.`);
  }
}

function appendDryRunMissionProgress(
  rule: GuestGameMission,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const createdAt = new Date(rule.createdAt);
  const periodFrom = rule.periodFrom ? new Date(rule.periodFrom) : null;
  const periodTo = rule.periodTo ? new Date(rule.periodTo) : null;
  const activatedAt = guestGameRuleActivationAt(createdAt, rule.conditions);
  const progressFrom =
    rule.definitionVersion >= guestGameMissionDefinitionVersion
      ? periodFrom && periodFrom > activatedAt
        ? periodFrom
        : activatedAt
      : periodFrom;
  const progress = evaluateGuestGameProgress(
    {
      triggerKind: rule.triggerKind,
      progressTarget: rule.progressTarget,
      progressUnit: rule.progressUnit,
      conditions: rule.conditions,
      storeIds: rule.storeIds,
      externalDomains: dryRunRuleExternalDomains(
        rule.id,
        guestGameStringArray(jsonRecord(rule.conditions).externalDomains),
        context,
      ),
      periodFrom: progressFrom,
      periodTo,
      timeZone: context.timeZone,
    },
    currentEventToProgressEvent(context),
    context.progressEvents,
  );

  if (!progress.applicable) {
    return null;
  }

  const unit = progress.unit ? ` ${progress.unit}` : '';
  const windowLabel = progress.windowDays
    ? ` за ${progress.windowDays} дн.`
    : '';
  reasons.push(
    `Прогресс задания: ${progress.current}/${progress.target}${unit}${windowLabel}`,
  );

  if (!progress.completed) {
    blockers.push(
      `Цель задания еще не выполнена: ${progress.current}/${progress.target}${unit}`,
    );
  }

  return progress;
}

function appendDryRunBudgetCheck(
  budgetAmount: number | null,
  projectedAmount: number,
  rewards: GuestGameReward[],
  blockers: string[],
  reasons: string[],
) {
  if (budgetAmount == null) {
    reasons.push('Бюджет не задан');
    return;
  }

  const spent = sum(rewards.map((reward) => reward.rewardAmount));
  const projected = spent + projectedAmount;
  reasons.push(`Бюджет: ${spent}/${budgetAmount} руб`);

  if (spent >= budgetAmount) {
    blockers.push('Бюджет правила уже исчерпан');
  } else if (projectedAmount > 0 && projected > budgetAmount) {
    blockers.push('Награда превысит бюджет правила');
  }
}

function appendDryRunLootBoxLimits(
  rule: GuestGameLootBox,
  context: DryRunContext,
  rewards: GuestGameReward[],
  entitlements: DryRunMissionRewardEntitlement[],
  blockers: string[],
  reasons: string[],
) {
  if (context.sourceFactId?.startsWith('guest-game-entitlement:')) {
    reasons.push(
      'Лимиты проверены при выдаче права на открытие и не применяются повторно при его использовании',
    );
    return;
  }

  const limits = dryRunRecord(rule.limits);
  const periodicLimit = lootBoxPeriodicLimitPeriod(limits.periodicLimit);
  const perGuestPerWeek = dryRunOptionalNumber(limits.perGuestPerWeek);
  const totalPerDay = dryRunOptionalNumber(limits.totalPerDay);
  const restartedAt = dryRunDateOrNull(limits.restartedAt);
  const limitRewards = restartedAt
    ? rewards.filter(
        (reward) =>
          new Date(reward.qualifiedAt).getTime() >= restartedAt.getTime(),
      )
    : rewards;
  const limitEntitlements = restartedAt
    ? entitlements.filter(
        (entitlement) => entitlement.qualifiedAt >= restartedAt,
      )
    : entitlements;
  const needsGuest = periodicLimit != null || perGuestPerWeek != null;
  const guestRewards = needsGuest
    ? limitRewards.filter((reward) => dryRunRewardMatchesGuest(reward, context))
    : [];
  const guestEntitlements = needsGuest
    ? limitEntitlements.filter(
        (entitlement) =>
          (context.profile && entitlement.profileId === context.profile.id) ||
          (context.guest && entitlement.guestId === context.guest.id),
      )
    : [];
  const entitlementRewardIds = new Set(
    guestEntitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const guestIssuanceTimes: Array<string | Date> = [
    ...guestRewards
      .filter((reward) => !entitlementRewardIds.has(reward.id))
      .map((reward) => reward.qualifiedAt),
    ...guestEntitlements.map((entitlement) => entitlement.qualifiedAt),
  ];
  const allEntitlementRewardIds = new Set(
    limitEntitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const allIssuanceTimes: Array<string | Date> = [
    ...limitRewards
      .filter((reward) => !allEntitlementRewardIds.has(reward.id))
      .map((reward) => reward.qualifiedAt),
    ...limitEntitlements.map((entitlement) => entitlement.qualifiedAt),
  ];

  if (needsGuest && !context.profile && !context.guest) {
    blockers.push('Для проверки лимита на гостя выберите профиль или гостя');
  } else if (periodicLimit != null) {
    const periodicCount = guestIssuanceTimes.filter((qualifiedAt) =>
      dryRunIsWithinLootBoxPeriod(
        qualifiedAt,
        context.limitOccurredAt,
        periodicLimit,
        context.timeZone,
      ),
    ).length;

    if (periodicCount >= 1) {
      const latestRewardAt = dryRunLatestLootBoxIssuanceAt(
        guestIssuanceTimes,
        periodicLimit,
        context,
      );
      blockers.push(
        latestRewardAt
          ? lootBoxPeriodicLimitBlocker(
              periodicLimit,
              periodicCount,
              latestRewardAt,
              context.timeZone,
            )
          : `Периодический лутбокс уже открыт ${lootBoxPeriodicLimitPastLabel(
              periodicLimit,
            )}: ${periodicCount}/1`,
      );
    } else {
      reasons.push(
        `Периодический лутбокс: 0/1 ${lootBoxPeriodicLimitReasonLabel(
          periodicLimit,
        )}`,
      );
    }
  }

  if (
    perGuestPerWeek != null &&
    (!needsGuest || context.profile || context.guest)
  ) {
    const weeklyCount = guestIssuanceTimes.filter((qualifiedAt) =>
      dryRunIsWithinLastDays(qualifiedAt, context.occurredAt, 7),
    ).length;

    if (weeklyCount >= perGuestPerWeek) {
      blockers.push(
        `Лимит на гостя за неделю исчерпан: ${weeklyCount}/${perGuestPerWeek}`,
      );
    } else {
      reasons.push(
        `Лимит на гостя за неделю: ${weeklyCount}/${perGuestPerWeek}`,
      );
    }
  }

  if (totalPerDay != null) {
    const dayCount = allIssuanceTimes.filter((qualifiedAt) =>
      dryRunIsSameDay(qualifiedAt, context.limitOccurredAt, context.timeZone),
    ).length;

    if (dayCount >= totalPerDay) {
      blockers.push(
        `Дневной лимит лутбокса исчерпан: ${dayCount}/${totalPerDay}`,
      );
    } else {
      reasons.push(`Дневной лимит лутбокса: ${dayCount}/${totalPerDay}`);
    }
  }
}

function lootBoxLimitEarliestRelevantAt(
  qualifiedAt: Date,
  limits: Record<string, unknown>,
) {
  const defaultFrom = new Date(
    qualifiedAt.getTime() - 40 * 24 * 60 * 60 * 1000,
  );
  const restartedAt = dryRunDateOrNull(limits.restartedAt);

  return restartedAt && restartedAt > defaultFrom ? restartedAt : defaultFrom;
}

function lootBoxEntitlementLimitGuard(input: {
  limits: Record<string, unknown>;
  profileId: string | null;
  guestId: string | null;
  qualifiedAt: Date;
  timeZone: string;
  rewards: LootBoxAtomicLimitReward[];
  entitlements: LootBoxAtomicLimitEntitlement[];
}): LootBoxAtomicLimitGuard {
  const periodicLimit = lootBoxPeriodicLimitPeriod(input.limits.periodicLimit);
  const perGuestPerWeek = dryRunOptionalNumber(input.limits.perGuestPerWeek);
  const totalPerDay = dryRunOptionalNumber(input.limits.totalPerDay);
  const restartedAt = dryRunDateOrNull(input.limits.restartedAt);
  const rewards = restartedAt
    ? input.rewards.filter(
        (reward) => reward.qualifiedAt.getTime() >= restartedAt.getTime(),
      )
    : input.rewards;
  const entitlements = restartedAt
    ? input.entitlements.filter(
        (entitlement) =>
          entitlement.qualifiedAt.getTime() >= restartedAt.getTime(),
      )
    : input.entitlements;
  const matchesGuest = (row: {
    profileId: string | null;
    guestId: string | null;
  }) =>
    (input.profileId != null && row.profileId === input.profileId) ||
    (input.guestId != null && row.guestId === input.guestId);
  const guestEntitlements = entitlements.filter(matchesGuest);
  const guestEntitlementRewardIds = new Set(
    guestEntitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const guestIssuanceTimes: Date[] = [
    ...rewards
      .filter(
        (reward) =>
          matchesGuest(reward) && !guestEntitlementRewardIds.has(reward.id),
      )
      .map((reward) => reward.qualifiedAt),
    ...guestEntitlements.map((entitlement) => entitlement.qualifiedAt),
  ];
  const allEntitlementRewardIds = new Set(
    entitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const allIssuanceTimes: Date[] = [
    ...rewards
      .filter((reward) => !allEntitlementRewardIds.has(reward.id))
      .map((reward) => reward.qualifiedAt),
    ...entitlements.map((entitlement) => entitlement.qualifiedAt),
  ];
  const codes: string[] = [];
  const counts: Record<string, number | string | null> = {};
  const needsGuest = periodicLimit != null || perGuestPerWeek != null;

  if (needsGuest && !input.profileId && !input.guestId) {
    codes.push('GUEST_IDENTITY_MISSING');
  }
  if (periodicLimit != null && (input.profileId || input.guestId)) {
    const periodicCount = guestIssuanceTimes.filter((issuedAt) =>
      dryRunIsWithinLootBoxPeriod(
        issuedAt,
        input.qualifiedAt,
        periodicLimit,
        input.timeZone,
      ),
    ).length;
    counts.periodicCount = periodicCount;
    counts.periodicLimit = 1;
    counts.periodicLimitPeriod = periodicLimit;
    if (periodicCount >= 1) codes.push('PERIODIC_LIMIT_EXHAUSTED');
  }
  if (perGuestPerWeek != null && (input.profileId || input.guestId)) {
    const weeklyCount = guestIssuanceTimes.filter((issuedAt) =>
      dryRunIsWithinLastDays(issuedAt, input.qualifiedAt, 7),
    ).length;
    counts.perGuestWeeklyCount = weeklyCount;
    counts.perGuestWeeklyLimit = perGuestPerWeek;
    if (weeklyCount >= perGuestPerWeek) {
      codes.push('PER_GUEST_WEEKLY_LIMIT_EXHAUSTED');
    }
  }
  if (totalPerDay != null) {
    const dayCount = allIssuanceTimes.filter((issuedAt) =>
      dryRunIsSameDay(issuedAt, input.qualifiedAt, input.timeZone),
    ).length;
    counts.totalDailyCount = dayCount;
    counts.totalDailyLimit = totalPerDay;
    if (dayCount >= totalPerDay) {
      codes.push('TOTAL_DAILY_LIMIT_EXHAUSTED');
    }
  }

  return { exhausted: codes.length > 0, codes, counts };
}

function appendDryRunMissionLimits(
  rule: GuestGameMission,
  context: DryRunContext,
  rewards: GuestGameReward[],
  entitlements: DryRunMissionRewardEntitlement[],
  blockers: string[],
  reasons: string[],
) {
  const antiFraudRules = dryRunRecord(rule.antiFraudRules);
  const denySameDayRepeat = antiFraudRules.denySameDayRepeat === true;
  const rewardConfig = dryRunRecord(dryRunRecord(rule.conditions).reward);
  const periodicity = lootBoxPeriodicLimitPeriod(rewardConfig.periodicity);
  const guestRewards = rewards.filter((reward) =>
    dryRunRewardMatchesGuest(reward, context),
  );
  const guestEntitlements = entitlements.filter(
    (entitlement) =>
      (context.profile && entitlement.profileId === context.profile.id) ||
      (context.guest && entitlement.guestId === context.guest.id),
  );
  const guestEntitlementRewardIds = new Set(
    guestEntitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const allEntitlementRewardIds = new Set(
    entitlements
      .map((entitlement) => entitlement.rewardId)
      .filter((rewardId): rewardId is string => Boolean(rewardId)),
  );
  const distinctGuestRewards = guestRewards.filter(
    (reward) => !guestEntitlementRewardIds.has(reward.id),
  );
  const distinctRewards = rewards.filter(
    (reward) => !allEntitlementRewardIds.has(reward.id),
  );
  const qualifiedAtValues = [
    ...distinctGuestRewards.map((reward) => reward.qualifiedAt),
    ...guestEntitlements.map((entitlement) => entitlement.qualifiedAt),
  ];

  if (denySameDayRepeat) {
    if (!context.profile && !context.guest) {
      blockers.push(
        'Для проверки повтора задания в календарный день выберите профиль или гостя',
      );
    } else {
      const dailyCount = qualifiedAtValues.filter((qualifiedAt) =>
        dryRunIsSameDay(qualifiedAt, context.limitOccurredAt, context.timeZone),
      ).length;

      if (dailyCount >= 1) {
        blockers.push(
          'Задание уже выполнено сегодня. Следующее выполнение будет доступно с начала нового календарного дня клуба.',
        );
      } else {
        reasons.push(
          'Повтор задания в текущий календарный день еще не использован',
        );
      }
    }
  }

  if (periodicity != null) {
    if (!context.profile && !context.guest) {
      blockers.push('Для проверки периодичности выберите профиль или гостя');
    } else {
      const periodicCount = qualifiedAtValues.filter((qualifiedAt) =>
        dryRunIsWithinLootBoxPeriod(
          qualifiedAt,
          context.limitOccurredAt,
          periodicity,
          context.timeZone,
        ),
      ).length;
      if (periodicCount >= 1) {
        blockers.push(
          `Задание уже выполнено ${lootBoxPeriodicLimitPastLabel(periodicity)}: ${periodicCount}/1`,
        );
      } else {
        reasons.push(
          `Периодичность задания: 0/1 ${lootBoxPeriodicLimitReasonLabel(periodicity)}`,
        );
      }
    }
  }

  if (rule.perGuestLimit != null) {
    const guestCount = distinctGuestRewards.length + guestEntitlements.length;

    if (!context.profile && !context.guest) {
      blockers.push('Для проверки лимита на гостя выберите профиль или гостя');
    } else if (guestCount >= rule.perGuestLimit) {
      blockers.push(
        `Лимит задания на гостя исчерпан: ${guestCount}/${rule.perGuestLimit}`,
      );
    } else {
      reasons.push(
        `Лимит задания на гостя: ${guestCount}/${rule.perGuestLimit}`,
      );
    }
  }

  if (rule.totalRewardLimit != null) {
    const totalIssued = distinctRewards.length + entitlements.length;
    if (totalIssued >= rule.totalRewardLimit) {
      blockers.push(
        `Общий лимит наград задания исчерпан: ${totalIssued}/${rule.totalRewardLimit}`,
      );
    } else {
      reasons.push(
        `Общий лимит наград задания: ${totalIssued}/${rule.totalRewardLimit}`,
      );
    }
  }
}

function dryRunRewardsForRule(
  rewards: GuestGameReward[],
  kind: 'lootBox' | 'mission' | 'season',
  id: string,
) {
  return rewards.filter((reward) => {
    if (kind === 'lootBox') {
      return reward.lootBox?.id === id;
    }
    if (kind === 'mission') {
      return reward.mission?.id === id;
    }
    return reward.season?.id === id;
  });
}

function dryRunRewardMatchesGuest(
  reward: GuestGameReward,
  context: DryRunContext,
) {
  return (
    (context.profile && reward.profile?.id === context.profile.id) ||
    (context.guest && reward.guest?.id === context.guest.id)
  );
}

type DryRunSeasonLevel = {
  level: number;
  sequence: number;
  title: string | null;
  condition: string | null;
  description: string | null;
  activationRules: Record<string, unknown>;
  freeReward: string | null;
  premiumReward: string | null;
  freeRewardDetails: Record<string, unknown>;
  premiumRewardDetails: Record<string, unknown>;
};

function dryRunSeasonLevels(value: unknown): DryRunSeasonLevel[] {
  const levels = Array.isArray(value) ? value : [];

  return levels
    .map((item, index) => {
      const record = dryRunRecord(item);
      const level = dryRunNumber(record.level, index + 1);

      if (level <= 0) {
        return null;
      }

      return {
        level,
        sequence: index + 1,
        title: dryRunString(record.title),
        condition: dryRunString(record.condition),
        description: dryRunString(record.description),
        activationRules: dryRunRecord(record.activationRules),
        freeReward: dryRunString(record.freeReward),
        premiumReward: dryRunString(record.premiumReward),
        freeRewardDetails: dryRunRecord(record.freeRewardDetails),
        premiumRewardDetails: dryRunRecord(record.premiumRewardDetails),
      };
    })
    .filter((item): item is DryRunSeasonLevel => Boolean(item))
    .sort((left, right) => left.level - right.level)
    .map((level, index) => ({ ...level, sequence: index + 1 }));
}

function appendDryRunSeasonStepActivationCheck(
  season: GuestGameSeason,
  step: DryRunSeasonLevel,
  context: DryRunContext,
  activatedAt: Date,
  blockers: string[],
  reasons: string[],
): GuestGameProgressResult | null {
  const rules = step.activationRules;
  const triggerKind = dryRunString(rules.triggerKind);
  const taskType = dryRunString(rules.taskType)?.toUpperCase() ?? null;
  const schemaVersion = dryRunNumber(rules.schemaVersion, 1);

  if (schemaVersion >= guestGameMissionDefinitionVersion && taskType) {
    if (!triggerKind) {
      blockers.push(`Для шага ${step.sequence} не выбран тип условия`);
      return null;
    }

    const metric = dryRunRecord(rules.metric);
    const progress = evaluateGuestGameProgress(
      {
        triggerKind,
        progressTarget: dryRunOptionalNumber(metric.target),
        progressUnit: dryRunString(metric.unit),
        conditions: rules,
        storeIds: season.storeIds,
        externalDomains: dryRunRuleExternalDomains(
          season.id,
          dryRunStringArray(rules.externalDomains),
          context,
        ),
        periodFrom: activatedAt,
        periodTo: season.periodTo,
        timeZone: context.timeZone,
      },
      currentEventToProgressEvent(context),
      context.progressEvents,
    );

    if (!progress.completed) {
      const unit = progress.unit ? ` ${progress.unit}` : '';
      blockers.push(
        `Прогресс шага ${step.sequence}: ${progress.current}/${progress.target}${unit}`,
      );
    } else {
      reasons.push(
        `Условие шага ${step.sequence} выполнено: ${progress.current}/${progress.target}`,
      );
    }
    if (taskType === 'BALANCE_TOPUP' && rules.domainScoped === true) {
      reasons.push('Пополнение проверяется в пределах домена Langame');
    }

    return progress;
  }

  if (!triggerKind) {
    blockers.push(`Для шага ${step.sequence} не выбрано событие активации`);
  } else {
    appendDryRunTriggerCheck(triggerKind, context.eventType, blockers);
  }

  appendDryRunSessionConditionCheck(
    rules.sessionType,
    context,
    blockers,
    reasons,
  );
  appendDryRunTariffConditionCheck(rules, context, blockers, reasons);
  appendDryRunGuestLogTypeCheck(rules, context, blockers, reasons);
  appendDryRunPeriodRules(
    rules,
    context.occurredAt,
    context.timeZone,
    blockers,
    reasons,
  );

  return null;
}

function dryRunRuleExternalDomains(
  ruleId: string,
  configuredDomains: string[],
  context: DryRunContext,
) {
  const routedDomains = context.ruleExternalDomains?.get(ruleId);
  return routedDomains === undefined ? configuredDomains : [...routedDomains];
}

function dryRunSeasonCurrentStepActivatedAt(
  season: GuestGameSeason,
  rewards: GuestGameReward[],
  context: DryRunContext,
) {
  const createdAt = new Date(season.createdAt);
  const periodFrom = season.periodFrom ? new Date(season.periodFrom) : null;
  let activatedAt =
    periodFrom && !Number.isNaN(periodFrom.getTime()) && periodFrom > createdAt
      ? periodFrom
      : createdAt;

  for (const reward of rewards) {
    if (
      !dryRunRewardMatchesGuest(reward, context) ||
      !dryRunSeasonRewardCountsAsStep(reward)
    ) {
      continue;
    }
    const qualifiedAt = new Date(reward.qualifiedAt);
    if (!Number.isNaN(qualifiedAt.getTime()) && qualifiedAt > activatedAt) {
      activatedAt = qualifiedAt;
    }
  }

  return activatedAt;
}

function guestGameShadowBattlePassStepActivatedAt(
  season: { id: string; createdAt: Date; periodFrom: Date | null },
  dryRun: Pick<GuestGameDryRunResult, 'profile' | 'guest'>,
  rewards: Array<{
    id: string;
    seasonId: string | null;
    profileId: string | null;
    guestId: string | null;
    status: string;
    qualifiedAt: Date;
    expiresAt: Date | null;
  }>,
  excludeRewardIds: string[] = [],
) {
  let activatedAt =
    season.periodFrom && season.periodFrom > season.createdAt
      ? season.periodFrom
      : season.createdAt;
  const now = Date.now();
  const excludedRewardIds = new Set(excludeRewardIds);

  for (const reward of rewards) {
    if (
      excludedRewardIds.has(reward.id) ||
      reward.seasonId !== season.id ||
      (reward.profileId !== dryRun.profile?.id &&
        reward.guestId !== dryRun.guest?.id)
    ) {
      continue;
    }
    const status = reward.status.toUpperCase();
    if (status === 'CANCELED' || status === 'EXPIRED') {
      continue;
    }
    if (reward.expiresAt && reward.expiresAt.getTime() < now) {
      continue;
    }
    if (reward.qualifiedAt > activatedAt) {
      activatedAt = reward.qualifiedAt;
    }
  }

  return activatedAt;
}

function dryRunSeasonCompletedLevelCount(
  levels: DryRunSeasonLevel[],
  rewards: GuestGameReward[],
  context: DryRunContext,
) {
  const reachedLevels = dryRunSeasonReachedLevelNumbers(
    levels,
    rewards,
    context,
  );
  let completedLevelCount = 0;

  for (const level of levels) {
    if (!reachedLevels.has(level.level)) {
      break;
    }
    completedLevelCount += 1;
  }

  return completedLevelCount;
}

function dryRunSeasonReachedLevelNumbers(
  levels: DryRunSeasonLevel[],
  rewards: GuestGameReward[],
  context: DryRunContext,
) {
  const reachedLevels = new Set<number>();

  rewards
    .filter((reward) => dryRunRewardMatchesGuest(reward, context))
    .filter(dryRunSeasonRewardCountsAsStep)
    .forEach((reward) => {
      const evidenceLevel = dryRunSeasonRewardLevelFromEvidence(
        reward.evidence,
      );
      const level =
        (typeof evidenceLevel === 'number'
          ? levels.find((item) => item.level === evidenceLevel)
          : null) ??
        dryRunSeasonLevelByRewardLabel(
          levels,
          reward.rewardLabel,
          reachedLevels,
        );

      if (level) {
        reachedLevels.add(level.level);
      }
    });

  return reachedLevels;
}

function dryRunSeasonRewardLevelFromEvidence(
  value: Prisma.JsonValue | null | undefined,
) {
  const evidence = dryRunRecord(value);
  const rule = dryRunRecord(evidence.rule);
  const source = dryRunRecord(evidence.source);
  const candidates = [
    evidence.level,
    evidence.levelNumber,
    evidence.battlePassLevel,
    evidence.battlePassLevelNumber,
    evidence.battlePassStep,
    evidence.battlePassStepNumber,
    evidence.step,
    evidence.stepNumber,
    rule.level,
    rule.levelNumber,
    rule.battlePassLevel,
    rule.battlePassLevelNumber,
    rule.battlePassStep,
    rule.battlePassStepNumber,
    rule.step,
    rule.stepNumber,
    source.level,
    source.levelNumber,
    source.battlePassLevel,
    source.battlePassLevelNumber,
    source.step,
    source.stepNumber,
  ];

  for (const candidate of candidates) {
    const level = dryRunOptionalNumber(candidate);

    if (typeof level === 'number' && level > 0) {
      return Math.trunc(level);
    }
  }

  return null;
}

function dryRunSeasonLevelByRewardLabel(
  levels: DryRunSeasonLevel[],
  rewardLabel: string,
  alreadyReached: Set<number>,
) {
  const normalizedRewardLabel = rewardLabel.trim();

  if (!normalizedRewardLabel) {
    return null;
  }

  return (
    levels.find((level) => {
      if (alreadyReached.has(level.level)) {
        return false;
      }

      const labels = [
        level.freeReward,
        level.premiumReward,
        level.freeReward && level.premiumReward
          ? `${level.freeReward} + ${level.premiumReward}`
          : null,
        level.title,
        dryRunSeasonStepRewardLabel(level),
      ].filter((item): item is string => Boolean(item?.trim()));

      return labels.includes(normalizedRewardLabel);
    }) ?? null
  );
}

function dryRunSeasonStepRewardLabel(level: DryRunSeasonLevel) {
  const rewardLabel = [level.freeReward, level.premiumReward]
    .filter((item): item is string => Boolean(item?.trim()))
    .join(' + ');

  return rewardLabel || level.title || `Battle Pass шаг ${level.sequence}`;
}

type DryRunSeasonFreeRewardPlan = {
  rewardType: 'BONUS_BALANCE' | 'LOOT_BOX_ENTITLEMENT';
  rewardAmount: number;
  rewardLabel: string;
  delivery: 'AUTO' | 'ADMIN';
  rewardTrack: 'FREE';
  rewardLootBoxId: string | null;
};

function dryRunSeasonFreeRewardPlan(
  level: DryRunSeasonLevel,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
): DryRunSeasonFreeRewardPlan | null {
  const premiumRewardConfigured = Boolean(
    level.premiumReward || Object.keys(level.premiumRewardDetails).length > 0,
  );
  const rewardType = dryRunString(level.freeRewardDetails.type)?.toUpperCase();
  const premiumRewardType = dryRunString(
    level.premiumRewardDetails.type,
  )?.toUpperCase();

  // Premium eligibility and multi-reward delivery are not represented by the
  // current season runtime. Keep those steps on the legacy generic path until
  // completion markers and per-track reward slots are implemented.
  if (rewardType === 'BONUS_BALANCE' && premiumRewardConfigured) {
    return null;
  }

  if (rewardType !== 'BONUS_BALANCE' && rewardType !== 'LOOT_BOX') {
    if (premiumRewardType === 'LOOT_BOX') {
      blockers.push(
        `Premium-награда шага ${level.sequence} не может быть выдана: источник premium-статуса гостя пока не подключен`,
      );
    }
    return null;
  }

  const rawDelivery =
    dryRunString(level.freeRewardDetails.delivery)?.toUpperCase() ?? 'AUTO';
  if (rawDelivery !== 'AUTO' && rawDelivery !== 'ADMIN') {
    blockers.push(
      `Для награды шага ${level.sequence} выберите автоматическую выдачу или подтверждение администратора`,
    );
    return null;
  }

  if (rewardType === 'LOOT_BOX') {
    const lootBox = dryRunRecord(level.freeRewardDetails.lootBox);
    const rewardLootBoxId =
      nullableId(lootBox.id) ??
      nullableId(level.freeRewardDetails.lootBoxId) ??
      null;
    if (!rewardLootBoxId) {
      blockers.push(
        `Для награды шага ${level.sequence} выберите конкретный наградной лутбокс`,
      );
      return null;
    }
    if (!context.rewardTemplateLootBoxIds.has(rewardLootBoxId)) {
      blockers.push(
        `Наградной лутбокс шага ${level.sequence} не опубликован или имеет режим STANDALONE`,
      );
      return null;
    }
    if (premiumRewardConfigured) {
      reasons.push(
        `Premium-награда шага ${level.sequence} не оценивалась: источник premium-статуса гостя пока не подключен`,
      );
    }

    return {
      rewardType: 'LOOT_BOX_ENTITLEMENT',
      rewardAmount: 0,
      rewardLabel:
        dryRunString(level.freeRewardDetails.label) ??
        dryRunString(lootBox.name) ??
        level.freeReward ??
        level.title ??
        `Battle Pass шаг ${level.sequence}`,
      delivery: rawDelivery,
      rewardTrack: 'FREE',
      rewardLootBoxId,
    };
  }

  const rewardAmount = dryRunOptionalNumber(level.freeRewardDetails.amount);
  if (rewardAmount === null || rewardAmount <= 0) {
    blockers.push(
      `Для бонусной награды шага ${level.sequence} укажите сумму больше нуля`,
    );
    return null;
  }

  return {
    rewardType: 'BONUS_BALANCE',
    rewardAmount,
    rewardLabel:
      dryRunString(level.freeRewardDetails.label) ??
      level.freeReward ??
      level.title ??
      `Battle Pass шаг ${level.sequence}`,
    delivery: rawDelivery,
    rewardTrack: 'FREE',
    rewardLootBoxId: null,
  };
}

function dryRunSeasonRewardCountsAsStep(reward: GuestGameReward) {
  const status = reward.status.toUpperCase();

  if (status === 'CANCELED' || status === 'EXPIRED') {
    return false;
  }

  const expiresAt = reward.expiresAt ? new Date(reward.expiresAt) : null;
  if (expiresAt && Number.isFinite(expiresAt.getTime())) {
    return expiresAt.getTime() >= Date.now();
  }

  return true;
}

function pickLootBoxReward(
  rule: GuestGameLootBox,
): GuestGameSelectedReward | null {
  const rewards = lootBoxRewards(rule);

  if (!rewards.length) {
    return null;
  }

  const totalWeight = sum(rewards.map((item) => Math.max(0, item.weight)));

  if (totalWeight <= 0) {
    return rewards[0];
  }

  const roll = Math.random() * totalWeight;
  let cursor = 0;

  for (const reward of rewards) {
    cursor += Math.max(0, reward.weight);

    if (roll < cursor) {
      return reward;
    }
  }

  return rewards.at(-1) ?? null;
}

function lootBoxRewards(rule: GuestGameLootBox): GuestGameSelectedReward[] {
  const source = dryRunRecord(rule.probabilityRules);
  const rawPrizes = dryRunArray(source.prizes);
  const rawItems = dryRunArray(source.items);
  const prizes = rawPrizes.length
    ? rawPrizes.map((item) => lootBoxRewardFromPrize(rule, item))
    : rawItems.map((item) => lootBoxRewardFromLegacyItem(rule, item));
  const validPrizes = prizes.filter(
    (item): item is GuestGameLootBoxRewardCandidate =>
      item !== null && Boolean(item.rewardLabel) && item.weight > 0,
  );
  const fallbackPrize = lootBoxFallbackReward(rule);
  const weightedPrizes = validPrizes.length
    ? validPrizes
    : fallbackPrize
      ? [fallbackPrize]
      : [];
  const totalWeight = sum(weightedPrizes.map((item) => item.weight));

  return weightedPrizes.map((item) => {
    const chancePercent =
      totalWeight > 0
        ? roundMoney((item.weight / totalWeight) * 100)
        : roundMoney(100 / weightedPrizes.length);
    const rarity = lootBoxRewardRarityFromChance(chancePercent);

    return {
      ...item,
      chancePercent,
      rewardRarity: rarity,
      rewardRarityLabel: lootBoxRewardRarityLabels[rarity],
    };
  });
}

function lootBoxRewardFromPrize(
  rule: GuestGameLootBox,
  value: unknown,
): GuestGameLootBoxRewardCandidate | null {
  const record = dryRunRecord(value);
  const rewardLabel =
    dryRunString(record.rewardLabel) ??
    dryRunString(record.label) ??
    rule.rewardLabel ??
    rule.name;

  if (!rewardLabel) {
    return null;
  }

  return {
    rewardType: canonicalLootBoxRewardType(
      dryRunString(record.rewardType) ??
        dryRunString(record.type) ??
        rule.rewardType ??
        'PROMOCODE',
    ),
    rewardAmount:
      dryRunOptionalNumber(record.rewardAmount) ??
      dryRunOptionalNumber(record.amount) ??
      rule.rewardAmount ??
      0,
    rewardLabel,
    weight: Math.max(
      0,
      dryRunOptionalNumber(record.weight) ??
        dryRunOptionalNumber(record.chancePercent) ??
        dryRunOptionalNumber(record.probability) ??
        0,
    ),
  };
}

function lootBoxRewardFromLegacyItem(
  rule: GuestGameLootBox,
  value: unknown,
): GuestGameLootBoxRewardCandidate | null {
  const record = dryRunRecord(value);
  const rewardLabel =
    dryRunString(record.label) ?? rule.rewardLabel ?? rule.name;

  if (!rewardLabel) {
    return null;
  }

  return {
    rewardType: canonicalLootBoxRewardType(rule.rewardType ?? 'PROMOCODE'),
    rewardAmount: rule.rewardAmount ?? 0,
    rewardLabel,
    weight: Math.max(0, dryRunNumber(record.weight, 0)),
  };
}

function lootBoxFallbackReward(
  rule: GuestGameLootBox,
): GuestGameLootBoxRewardCandidate | null {
  const rewardLabel = rule.rewardLabel ?? rule.name;

  if (!rewardLabel && !rule.rewardType && !rule.rewardAmount) {
    return null;
  }

  return {
    rewardType: canonicalLootBoxRewardType(rule.rewardType ?? 'PROMOCODE'),
    rewardAmount: rule.rewardAmount ?? 0,
    rewardLabel,
    weight: 100,
  };
}

function lootBoxRewardRarityFromChance(
  chancePercent: number,
): GuestGameRewardRarity {
  if (chancePercent <= 1) {
    return 'legendary';
  }

  if (chancePercent <= 4) {
    return 'epic';
  }

  if (chancePercent <= 15) {
    return 'rare';
  }

  return 'common';
}

function lootBoxRewardRarityCode(
  value: unknown,
): GuestGameRewardRarity | null | undefined {
  if (value === null) {
    return null;
  }

  const parsed = stringValue(value)?.toLowerCase();

  return parsed && parsed in lootBoxRewardRarityLabels
    ? (parsed as GuestGameRewardRarity)
    : undefined;
}

function dryRunGuestSummary(row: {
  id: string;
  externalDomain: string | null;
  externalGuestId: string;
  fullNameMasked: string | null;
  phoneMasked: string | null;
  emailMasked: string | null;
}): GuestGameProfile['guest'] {
  return {
    id: row.id,
    externalDomain: row.externalDomain,
    externalGuestId: row.externalGuestId,
    displayName: row.fullNameMasked ?? row.externalGuestId,
    contact: row.phoneMasked ?? row.emailMasked ?? 'нет контакта',
  };
}

function dryRunRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function dryRunArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dryRunStringArray(value: unknown) {
  return dryRunArray(value).filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

function dryRunStringValues(...values: unknown[]) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return dryRunStringArray(value);
    }

    const stringValue = dryRunString(value);
    return stringValue ? [stringValue] : [];
  });
}

function dryRunNumberArray(value: unknown) {
  return dryRunArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function dryRunString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isActionableSessionType(value: string) {
  return ['regular_session', 'packet_hours'].includes(
    normalizeSessionType(value),
  );
}

function normalizeSessionType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');

  if (
    [
      'packet_hours',
      'package_or_subscription',
      'packet',
      'package',
      'package_hours',
      'subscription',
      'membership',
      'abonement',
      'abonnement',
      'абонемент',
    ].includes(normalized)
  ) {
    return 'packet_hours';
  }

  if (
    ['hourly', 'regular_session', 'regular', 'common', 'default'].includes(
      normalized,
    )
  ) {
    return 'regular_session';
  }

  return normalized;
}

function dryRunOptionalNumber(
  value: unknown,
  fallback?: number,
): number | null {
  if (value === null || value === undefined || value === '') {
    return fallback ?? null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (fallback ?? null);
}

function dryRunNumber(value: unknown, fallback: number) {
  return dryRunOptionalNumber(value, fallback) ?? fallback;
}

function dryRunDateOrNull(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function guestGameTimeZone(value: string | null | undefined) {
  const normalized = nullableString(value) ?? defaultGuestGameTimeZone;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(
      new Date(),
    );

    return normalized;
  } catch {
    return defaultGuestGameTimeZone;
  }
}

function dryRunLocalTimeParts(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(value);
    const valueByType = new Map(parts.map((part) => [part.type, part.value]));
    const weekday = dryRunWeekdayNumber(valueByType.get('weekday'));
    const hour = Number(valueByType.get('hour'));
    const minute = Number(valueByType.get('minute'));

    return {
      weekday: weekday ?? value.getUTCDay(),
      minutesOfDay:
        (Number.isFinite(hour) ? hour % 24 : value.getUTCHours()) * 60 +
        (Number.isFinite(minute) ? minute : value.getUTCMinutes()),
    };
  } catch {
    return {
      weekday: value.getUTCDay(),
      minutesOfDay: value.getUTCHours() * 60 + value.getUTCMinutes(),
    };
  }
}

function dryRunLocalDateKey(value: Date, timeZone: string) {
  const parts = dryRunLocalDateParts(value, timeZone);

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

function dryRunLocalMonthKey(value: Date, timeZone: string) {
  const parts = dryRunLocalDateParts(value, timeZone);

  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function dryRunLocalDateParts(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const valueByType = new Map(parts.map((part) => [part.type, part.value]));

    return {
      year: Number(valueByType.get('year')),
      month: Number(valueByType.get('month')),
      day: Number(valueByType.get('day')),
    };
  } catch {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }
}

function dryRunNextLocalDayStart(value: Date, timeZone: string) {
  const parts = dryRunLocalDateParts(value, timeZone);
  const nextDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1),
  );
  const nextDayLabel = `${nextDay.getUTCFullYear()}-${String(
    nextDay.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;

  return (
    parseLangameDate(`${nextDayLabel} 00:00:00`, timeZone) ??
    new Date(nextDay.getTime())
  );
}

function dryRunWeekdayNumber(value: string | undefined) {
  switch (value) {
    case 'Sun':
      return 0;
    case 'Mon':
      return 1;
    case 'Tue':
      return 2;
    case 'Wed':
      return 3;
    case 'Thu':
      return 4;
    case 'Fri':
      return 5;
    case 'Sat':
      return 6;
    default:
      return null;
  }
}

function dryRunIsWithinTimeWindow(minutesOfDay: number, window: string) {
  const [from, to] = window.split('-').map((part) => part.trim());
  const fromMinutes = dryRunTimeToMinutes(from);
  const toMinutes = dryRunTimeToMinutes(to);

  if (fromMinutes == null || toMinutes == null) {
    return true;
  }

  if (fromMinutes <= toMinutes) {
    return minutesOfDay >= fromMinutes && minutesOfDay <= toMinutes;
  }

  return minutesOfDay >= fromMinutes || minutesOfDay <= toMinutes;
}

function dryRunTimeToMinutes(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(':').map((item) => Number(item));

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function dryRunIsSameDay(
  value: string | Date,
  reference: Date,
  timeZone: string,
) {
  const date = value instanceof Date ? value : new Date(value);

  return (
    dryRunLocalDateKey(date, timeZone) ===
    dryRunLocalDateKey(reference, timeZone)
  );
}

function dryRunIsWithinLastDays(
  value: string | Date,
  reference: Date,
  days: number,
) {
  const date = value instanceof Date ? value : new Date(value);
  const diff = reference.getTime() - date.getTime();

  return diff >= 0 && diff < days * 24 * 60 * 60 * 1000;
}

function dryRunIsSameMonth(
  value: string | Date,
  reference: Date,
  timeZone: string,
) {
  const date = value instanceof Date ? value : new Date(value);

  return (
    dryRunLocalMonthKey(date, timeZone) ===
    dryRunLocalMonthKey(reference, timeZone)
  );
}

function dryRunIsWithinLootBoxPeriod(
  value: string | Date,
  reference: Date,
  period: LootBoxPeriodicLimitPeriod,
  timeZone: string,
) {
  if (period === 'DAILY') {
    return dryRunIsSameDay(value, reference, timeZone);
  }

  if (period === 'MONTHLY') {
    return dryRunIsSameMonth(value, reference, timeZone);
  }

  return dryRunIsWithinLastDays(value, reference, 7);
}

function dryRunLatestLootBoxIssuanceAt(
  qualifiedAtValues: Array<string | Date>,
  period: LootBoxPeriodicLimitPeriod,
  context: DryRunContext,
) {
  const latest = qualifiedAtValues
    .filter((qualifiedAt) =>
      dryRunIsWithinLootBoxPeriod(
        qualifiedAt,
        context.limitOccurredAt,
        period,
        context.timeZone,
      ),
    )
    .map((qualifiedAt) =>
      qualifiedAt instanceof Date
        ? new Date(qualifiedAt.getTime())
        : new Date(qualifiedAt),
    )
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return latest ?? null;
}

function lootBoxPeriodicLimitBlocker(
  period: LootBoxPeriodicLimitPeriod,
  count: number,
  latestRewardAt: Date,
  timeZone: string,
) {
  if (period === 'DAILY') {
    return `Этот лутбокс можно открывать не чаще одного раза за календарный день клуба. Последнее открытие было ${formatDryRunLocalDateTime(
      latestRewardAt,
      timeZone,
    )}.`;
  }

  return `Периодический лутбокс уже открыт ${lootBoxPeriodicLimitPastLabel(
    period,
  )}: ${count}/1`;
}

function formatDryRunLocalDateTime(value: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function lootBoxPeriodicLimitPeriod(
  value: unknown,
): LootBoxPeriodicLimitPeriod | null {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';

  return normalized === 'DAILY' ||
    normalized === 'WEEKLY' ||
    normalized === 'MONTHLY'
    ? normalized
    : null;
}

function lootBoxPeriodicLimitLabel(period: LootBoxPeriodicLimitPeriod) {
  if (period === 'DAILY') {
    return 'Ежедневный';
  }

  if (period === 'MONTHLY') {
    return 'Ежемесячный';
  }

  return 'Еженедельный';
}

function lootBoxPeriodicLimitPastLabel(period: LootBoxPeriodicLimitPeriod) {
  if (period === 'DAILY') {
    return 'сегодня';
  }

  if (period === 'MONTHLY') {
    return 'в этом месяце';
  }

  return 'на этой неделе';
}

function lootBoxPeriodicLimitReasonLabel(period: LootBoxPeriodicLimitPeriod) {
  if (period === 'DAILY') {
    return 'на сегодня';
  }

  if (period === 'MONTHLY') {
    return 'на месяц';
  }

  return 'на неделю';
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function actorUserId(user: AuthenticatedUser) {
  const id = nullableId(user.id);

  return id && !id.startsWith('guest-portal:') ? id : null;
}

function requiredString(value: unknown, label: string, required: boolean) {
  const parsed = stringValue(value);

  if (required && !parsed) {
    throw new BadRequestException(`${label} обязательно`);
  }

  return parsed;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeGuestLogMappingPreset(value: unknown): GuestLogMappingPreset {
  const parsed = stringValue(value)?.toLowerCase();

  if (
    parsed &&
    guestLogMappingPresets.includes(parsed as GuestLogMappingPreset)
  ) {
    return parsed as GuestLogMappingPreset;
  }

  return 'custom';
}

function normalizeGuestLogMappingIntent(value: unknown): GuestLogMappingIntent {
  const parsed = stringValue(value)?.toLowerCase();

  if (
    parsed &&
    guestLogMappingIntents.includes(parsed as GuestLogMappingIntent)
  ) {
    return parsed as GuestLogMappingIntent;
  }

  return 'allow';
}

function nullableString(value: unknown) {
  if (value === null) {
    return null;
  }

  return stringValue(value);
}

function boundedString(value: unknown, maxLength: number) {
  const parsed = nullableString(value);

  if (!parsed) {
    return null;
  }

  return parsed.length > maxLength ? parsed.slice(0, maxLength) : parsed;
}

function nullableId(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  return stringValue(value);
}

function intValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new BadRequestException('Числовое поле заполнено неверно');
  }

  return Math.trunc(number);
}

function decimalValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new BadRequestException('Сумма заполнена неверно');
  }

  return new Prisma.Decimal(number);
}

function dateValue(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('Дата заполнена неверно');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Дата заполнена неверно');
  }

  return date;
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return Prisma.JsonNull;
  }

  return value;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number] | undefined,
) {
  const parsed = stringValue(value);

  if (!parsed) {
    return fallback;
  }

  if (!allowed.includes(parsed)) {
    throw new BadRequestException(`Недопустимый статус: ${parsed}`);
  }

  return parsed as T[number];
}

function integrationProviderValue(value: unknown) {
  if (value === null || value === '') {
    return null;
  }

  const parsed = stringValue(value);

  if (!parsed) {
    return undefined;
  }

  if (parsed !== IntegrationProvider.LANGAME) {
    throw new BadRequestException('Поддерживается только Langame provider');
  }

  return IntegrationProvider.LANGAME;
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function numberOrNull(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function numberValue(value: Prisma.Decimal) {
  return Number(value);
}

function stringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function percentOrNull(value: number, total: number) {
  if (total <= 0) {
    return null;
  }

  return Math.round((value / total) * 1000) / 10;
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function emptyGameEffect(): GuestGameEffect {
  return {
    windowDays: gameEffectWindowDays,
    summary: {
      eventsCount: 0,
      measuredEvents: 0,
      reachedGuests: 0,
      returnedGuests: 0,
      returnRatePercent: null,
      postSessions: 0,
      postPlayMinutes: 0,
      productRevenue: 0,
      balanceTopUps: 0,
      totalRevenue: 0,
      averageRevenuePerReturnedGuest: 0,
    },
    scenarios: [],
  };
}

function mergeGameEffectScenarios(
  scenarios: GuestGameEffectScenario[],
): GuestGameEffect['summary'] {
  const totalRevenue = sum(scenarios.map((scenario) => scenario.totalRevenue));
  const returnedCount = sum(
    scenarios.map((scenario) => scenario.returnedGuests),
  );

  return {
    eventsCount: sum(scenarios.map((scenario) => scenario.eventsCount)),
    measuredEvents: sum(scenarios.map((scenario) => scenario.measuredEvents)),
    reachedGuests: sum(scenarios.map((scenario) => scenario.reachedGuests)),
    returnedGuests: returnedCount,
    returnRatePercent: percentOrNull(
      returnedCount,
      sum(scenarios.map((scenario) => scenario.reachedGuests)),
    ),
    postSessions: sum(scenarios.map((scenario) => scenario.postSessions)),
    postPlayMinutes: sum(scenarios.map((scenario) => scenario.postPlayMinutes)),
    productRevenue: sum(scenarios.map((scenario) => scenario.productRevenue)),
    balanceTopUps: sum(scenarios.map((scenario) => scenario.balanceTopUps)),
    totalRevenue,
    averageRevenuePerReturnedGuest: returnedCount
      ? Math.round(totalRevenue / returnedCount)
      : 0,
  };
}

function effectRecommendation({
  status,
  eventsCount,
  reachedGuests,
  returnedGuests,
  totalRevenue,
}: {
  status: GuestGameEffectScenario['status'];
  eventsCount: number;
  reachedGuests: number;
  returnedGuests: number;
  totalRevenue: number;
}) {
  if (status === 'ACTIVE' && eventsCount === 0) {
    return 'Сценарий активен, но событий еще нет: проверьте dry-run и batch по snapshot-фактам.';
  }

  if (reachedGuests > 0 && returnedGuests === 0) {
    return 'События есть, возврата пока нет: проверьте ценность награды и условия повторного визита.';
  }

  if (returnedGuests > 0 && totalRevenue === 0) {
    return 'Гости возвращаются, но денежный эффект не виден: проверьте продажи бара и пополнения после визита.';
  }

  if (totalRevenue > 0) {
    return 'Есть измеримый денежный эффект: сравните его со стоимостью наград и масштабируйте аккуратно.';
  }

  return 'Эффект будет считаться по сессиям, продажам и пополнениям после игровых событий.';
}

function gameEconomyGuestKey(row: GuestGameReward | GuestGameEvent) {
  if (row.profile?.id) {
    return `profile:${row.profile.id}`;
  }

  if (row.guest?.id) {
    return `guest:${row.guest.id}`;
  }

  if ('guestExternalId' in row && row.guestExternalId) {
    return `external:${row.guestExternalId}`;
  }

  return null;
}

function economyRecommendation({
  status,
  plannedBudget,
  budgetUsagePercent,
  backlog,
  eventsCount,
  paidRewards,
}: {
  status: GuestGameEconomyScenario['status'];
  plannedBudget: number | null;
  budgetUsagePercent: number | null;
  backlog: number;
  eventsCount: number;
  paidRewards: number;
}) {
  if (status === 'ACTIVE' && !plannedBudget) {
    return 'Задайте бюджет до масштабного запуска, чтобы контролировать стоимость наград.';
  }

  if (budgetUsagePercent !== null && budgetUsagePercent >= 90) {
    return 'Бюджет почти выбран: проверьте лимиты, период действия и очередь выдач.';
  }

  if (backlog >= 10) {
    return 'В очереди накопились награды: проверьте подтверждения и кассирскую выдачу.';
  }

  if (status === 'ACTIVE' && eventsCount === 0) {
    return 'Активный сценарий еще не дал событий: запустите dry-run или batch по snapshot-фактам.';
  }

  if (paidRewards > 0) {
    return 'Есть погашенные награды: можно сверить фактический эффект с визитами и выручкой.';
  }

  return 'Контур под контролем: следите за бюджетом, очередью и XP-событиями.';
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(xp / 500) + 1);
}

function defaultProbabilityRules(): Prisma.InputJsonValue {
  return {
    type: 'weighted',
    prizes: [
      {
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 50,
        rewardLabel: '50 бонусов',
        weight: 85,
        chancePercent: 85,
      },
      {
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 100,
        rewardLabel: '100 бонусов',
        weight: 5,
        chancePercent: 5,
      },
      {
        rewardType: 'BONUS_BALANCE',
        rewardAmount: 200,
        rewardLabel: '200 бонусов',
        weight: 2,
        chancePercent: 2,
      },
      {
        rewardType: 'PROMOCODE',
        rewardAmount: 1000,
        rewardLabel: 'Промокод на 1000 рублей',
        weight: 1,
        chancePercent: 1,
      },
    ],
    items: [
      { label: '50 бонусов', weight: 85 },
      { label: '100 бонусов', weight: 5 },
      { label: '200 бонусов', weight: 2 },
      { label: 'Промокод на 1000 рублей', weight: 1 },
    ],
  };
}

function defaultMissionConditions(): Prisma.InputJsonValue {
  return {
    progress: '0/1',
    source: 'Langame facts',
    requiresManualReview: true,
  };
}

function defaultXpRules(): Prisma.InputJsonValue {
  return {
    visit: 20,
    checkIn: 20,
    playHour: 10,
    barPurchase: 25,
    missionCompletion: 50,
  };
}

function defaultLevels(): Prisma.InputJsonValue {
  return [
    { level: 1, xp: 0, freeReward: 'Старт сезона' },
    { level: 2, xp: 250, freeReward: 'Промокод бара' },
    {
      level: 3,
      xp: 500,
      freeReward: 'Бонус на следующий визит',
    },
    {
      level: 4,
      xp: 900,
      freeReward: 'Часы игры с подтверждением',
    },
  ];
}

function normalizeVisualEditorPayload(
  value: unknown,
): GuestGameVisualEditorPayload {
  const record = visualRecord(value);
  const battlePass = visualRecord(record.battlePass);
  const checkIn = visualRecord(record.checkIn);

  return {
    version: 1,
    battlePass: {
      id: visualId(battlePass.id),
      enabled: visualBool(battlePass.enabled, true),
      title: visualString(battlePass.title, 'Клубный сезон'),
      status: visualStatus(battlePass.status, 'DRAFT'),
      levelCount: visualInt(battlePass.levelCount, 6, 1, 60),
      xpPerLevel: visualInt(battlePass.xpPerLevel, 250, 1, 100000),
      mainPrize: visualNullableString(battlePass.mainPrize),
      levelRewards: visualArray(battlePass.levelRewards)
        .map((item, index) => {
          const itemRecord = visualRecord(item);
          return {
            level: visualInt(itemRecord.level, index + 1, 1, 60),
            reward: visualString(itemRecord.reward, ''),
          };
        })
        .filter((item) => item.reward.trim())
        .slice(0, 60),
    },
    lootBoxes: visualArray(record.lootBoxes)
      .map((item) => {
        const itemRecord = visualRecord(item);
        return {
          id: visualId(itemRecord.id),
          title: visualString(
            itemRecord.title,
            visualString(itemRecord.name, 'Лутбокс'),
          ),
          status: visualStatus(itemRecord.status, 'DRAFT'),
          triggerKind: visualString(
            itemRecord.triggerKind,
            'SESSION_START',
          ).toUpperCase(),
          rewardType: canonicalLootBoxRewardType(
            visualString(itemRecord.rewardType, 'PROMOCODE'),
          ),
          rewardAmount: visualNumberOrNull(itemRecord.rewardAmount),
          caseRarity: visualLootBoxCaseRarity(itemRecord),
          rewardLabel: visualString(itemRecord.rewardLabel, 'Награда клуба'),
          prizes: visualLootBoxPrizes(itemRecord),
          condition: visualString(itemRecord.condition, 'Активность в клубе'),
          limitPerGuest: visualIntOrNull(itemRecord.limitPerGuest, 1, 1000),
          periodicLimitEnabled: visualBool(
            itemRecord.periodicLimitEnabled,
            false,
          ),
          periodicLimitPeriod:
            lootBoxPeriodicLimitPeriod(itemRecord.periodicLimitPeriod) ??
            'DAILY',
          timeWindowMode: visualTimeWindowMode(itemRecord.timeWindowMode),
          weekdayMode: visualWeekdayMode(itemRecord.weekdayMode),
          weekdays: visualWeekdays(itemRecord.weekdays),
          hourFrom: visualTimeValue(itemRecord.hourFrom, '10:00'),
          hourTo: visualTimeValue(itemRecord.hourTo, '16:00'),
        };
      })
      .slice(0, 12),
    missions: visualArray(record.missions)
      .map((item) => {
        const itemRecord = visualRecord(item);
        return {
          id: visualId(itemRecord.id),
          title: visualString(
            itemRecord.title,
            visualString(itemRecord.name, 'Задание'),
          ),
          status: visualStatus(itemRecord.status, 'DRAFT'),
          missionType: visualString(
            itemRecord.missionType,
            'CUSTOM',
          ).toUpperCase(),
          triggerKind: visualString(
            itemRecord.triggerKind,
            'SESSION_START',
          ).toUpperCase(),
          xpReward: visualInt(itemRecord.xpReward, 50, 0, 100000),
          rewardType: visualString(
            itemRecord.rewardType,
            'PROMOCODE',
          ).toUpperCase(),
          rewardAmount: visualNumberOrNull(itemRecord.rewardAmount),
          rewardLabel: visualString(
            itemRecord.rewardLabel,
            'Награда за задание',
          ),
          progressTarget: visualIntOrNull(itemRecord.progressTarget, 1, 100000),
          progressUnit: visualNullableString(itemRecord.progressUnit),
          questSteps: visualArray(itemRecord.questSteps)
            .map((step, index) => {
              const stepRecord = visualRecord(step);
              return {
                id: visualString(stepRecord.id, `step-${index + 1}`),
                title: visualString(stepRecord.title, ''),
                target: visualInt(stepRecord.target, index + 1, 1, 100000),
              };
            })
            .filter((step) => step.title.trim())
            .slice(0, 12),
        };
      })
      .slice(0, 24),
    promoCards: visualArray(record.promoCards)
      .map((item) => {
        const itemRecord = visualRecord(item);
        return {
          id: visualId(itemRecord.id),
          label: visualNullableString(itemRecord.label),
          title: visualString(itemRecord.title, 'Событие клуба'),
          description: visualNullableString(itemRecord.description),
          tag: visualNullableString(itemRecord.tag),
          status: visualStatus(itemRecord.status, 'DRAFT'),
          targetAnchor: visualNullableString(itemRecord.targetAnchor),
          periodFrom: visualDateString(itemRecord.periodFrom),
          periodTo: visualDateString(itemRecord.periodTo),
          metadata: (jsonValue(itemRecord.metadata) ??
            null) as Prisma.JsonValue | null,
        };
      })
      .slice(0, 12),
    checkIn: {
      enabled: visualBool(checkIn.enabled, false),
      rewardMode: visualRewardMode(checkIn.rewardMode),
      xp: visualIntOrNull(checkIn.xp, 1, 100000),
      bonusAmount: visualNumberOrNull(checkIn.bonusAmount),
      rewardLabel: visualNullableString(checkIn.rewardLabel),
    },
  };
}

function validateVisualEditorPublish(payload: GuestGameVisualEditorPayload) {
  if (!payload.checkIn.enabled) {
    return;
  }

  if (payload.checkIn.rewardMode === 'XP') {
    if (!payload.checkIn.xp || payload.checkIn.xp <= 0) {
      throw new BadRequestException('Для чек-ина выберите количество XP');
    }
    return;
  }

  if (payload.checkIn.rewardMode === 'BONUS') {
    if (!payload.checkIn.bonusAmount || payload.checkIn.bonusAmount <= 0) {
      throw new BadRequestException('Для чек-ина выберите сумму бонусов');
    }
    return;
  }

  throw new BadRequestException(
    'Для включенного чек-ина выберите награду: XP или бонусы',
  );
}

function visualBattlePassFromSeason(
  season: GuestGameSeason | null,
): GuestGameVisualEditorBattlePass {
  const levels = visualArray(season?.levels).map((item) => visualRecord(item));
  const xpPerLevel =
    levels.length > 1
      ? Math.max(1, Number(levels[1]?.xp ?? 250) - Number(levels[0]?.xp ?? 0))
      : 250;
  const levelRewards = levels
    .map((item) => ({
      level: visualInt(item.level, 1, 1, 60),
      reward: visualString(item.freeReward ?? item.premiumReward, ''),
    }))
    .filter((item) => item.reward.trim());

  return {
    id: season?.id ?? null,
    enabled: Boolean(season),
    title: season?.name ?? 'Клубный сезон',
    status: season?.status ?? 'DRAFT',
    levelCount: levels.length || 6,
    xpPerLevel,
    mainPrize: levelRewards.at(-1)?.reward ?? null,
    levelRewards,
  };
}

function visualLootBoxFromRule(
  rule: GuestGameLootBox,
): GuestGameVisualEditorLootBox {
  const limits = visualRecord(rule.limits);
  const periodRules = visualRecord(rule.periodRules);
  const probabilityRules = visualRecord(rule.probabilityRules);
  const periodicLimit = lootBoxPeriodicLimitPeriod(limits.periodicLimit);

  return {
    id: rule.id,
    title: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    rewardType: canonicalLootBoxRewardType(rule.rewardType),
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel ?? rule.name,
    caseRarity: visualLootBoxCaseRarity(probabilityRules),
    prizes: visualLootBoxPrizes({
      rewardType: rule.rewardType,
      rewardAmount: rule.rewardAmount,
      rewardLabel: rule.rewardLabel ?? rule.name,
      prizes: probabilityRules.prizes,
      items: probabilityRules.items,
    }),
    condition: visualLootBoxCondition(
      visualString(periodRules.condition, ''),
      rule.triggerKind,
    ),
    limitPerGuest: visualIntOrNull(
      limits.perGuest ?? limits.perGuestPerWeek,
      1,
      1000,
    ),
    periodicLimitEnabled: periodicLimit != null,
    periodicLimitPeriod: periodicLimit ?? 'DAILY',
    timeWindowMode: visualTimeWindowMode(
      periodRules.timeWindowMode ?? inferVisualTimeWindowMode(periodRules),
    ),
    weekdayMode: visualWeekdayMode(
      periodRules.weekdayMode ?? inferVisualWeekdayMode(periodRules),
    ),
    weekdays: visualWeekdays(periodRules.weekdays),
    hourFrom: visualPeriodHour(periodRules, 0, '10:00'),
    hourTo: visualPeriodHour(periodRules, 1, '16:00'),
  };
}

function visualMissionFromRule(
  rule: GuestGameMission,
): GuestGameVisualEditorMission {
  const conditions = visualRecord(rule.conditions);

  return {
    id: rule.id,
    title: rule.name,
    status: rule.status,
    missionType: rule.missionType,
    triggerKind: rule.triggerKind,
    xpReward: rule.xpReward,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel ?? rule.name,
    progressTarget: rule.progressTarget,
    progressUnit: rule.progressUnit,
    questSteps: visualArray(conditions.questSteps)
      .map((item, index) => {
        const record = visualRecord(item);
        return {
          id: visualString(record.id, `step-${index + 1}`),
          title: visualString(record.title, ''),
          target: visualInt(record.target, index + 1, 1, 100000),
        };
      })
      .filter((item) => item.title.trim()),
  };
}

function visualPromoFromRule(
  rule: GuestGamePromoCard,
): GuestGameVisualEditorPromoCard {
  return {
    id: rule.id,
    label: rule.label,
    title: rule.title,
    description: rule.description,
    tag: rule.tag,
    status: rule.status,
    targetAnchor: rule.targetAnchor,
    periodFrom: rule.periodFrom,
    periodTo: rule.periodTo,
    metadata: rule.metadata,
  };
}

function visualCheckInFromMission(
  mission: GuestGameMission | null,
): GuestGameVisualEditorCheckIn {
  if (!mission) {
    return {
      enabled: false,
      rewardMode: '',
      xp: null,
      bonusAmount: null,
      rewardLabel: null,
    };
  }

  const bonusMode = isBonusLedgerRewardType(mission.rewardType);

  return {
    enabled: mission.status === 'ACTIVE',
    rewardMode: bonusMode ? 'BONUS' : mission.xpReward > 0 ? 'XP' : '',
    xp: mission.xpReward || null,
    bonusAmount: bonusMode ? mission.rewardAmount : null,
    rewardLabel: mission.rewardLabel,
  };
}

function matchPersistedBattlePassLevels(
  incomingValue: unknown,
  persistedValue: unknown,
) {
  const incomingLevels = Array.isArray(incomingValue) ? incomingValue : [];
  const persistedLevels = Array.isArray(persistedValue) ? persistedValue : [];
  const incomingEntries = incomingLevels.map((item, index) =>
    battlePassLevelIdentity(item, index),
  );
  const persistedEntries = persistedLevels.map((item, index) =>
    battlePassLevelIdentity(item, index),
  );
  const matches = new Map<number, Record<string, unknown>>();

  const duplicateIncomingId = duplicateBattlePassLevelIdentity(
    incomingEntries,
    (entry) => entry.id,
  );
  const duplicatePersistedId = duplicateBattlePassLevelIdentity(
    persistedEntries,
    (entry) => entry.id,
  );
  const duplicateIncomingIdlessLevel = duplicateBattlePassLevelIdentity(
    incomingEntries.filter((entry) => !entry.id),
    (entry) => entry.level,
  );
  const duplicatePersistedIdlessLevel = duplicateBattlePassLevelIdentity(
    persistedEntries.filter((entry) => !entry.id),
    (entry) => entry.level,
  );
  if (
    duplicateIncomingId != null ||
    duplicatePersistedId != null ||
    duplicateIncomingIdlessLevel != null ||
    duplicatePersistedIdlessLevel != null
  ) {
    throw new ConflictException(
      'Шаги Battle Pass имеют неоднозначные id или номера уровней. Сначала устраните дубли.',
    );
  }

  for (const incoming of incomingEntries) {
    let persisted: (typeof persistedEntries)[number] | null = null;
    if (incoming.id) {
      persisted =
        persistedEntries.find((entry) => entry.id === incoming.id) ?? null;
    }

    if (!incoming.id && incoming.level != null) {
      persisted =
        persistedEntries.find(
          (entry) => !entry.id && entry.level === incoming.level,
        ) ?? null;
    }

    if (persisted) {
      matches.set(incoming.index, persisted.record);
    }
  }

  return matches;
}

function duplicateBattlePassLevelIdentity<T>(
  entries: T[],
  identity: (entry: T) => string | number | null,
) {
  const seen = new Set<string | number>();
  for (const entry of entries) {
    const value = identity(entry);
    if (value == null) {
      continue;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}

function battlePassLevelIdentity(value: unknown, index: number) {
  const record = jsonRecord(value as Prisma.JsonValue | null);
  const level = dryRunOptionalNumber(record.level);
  return {
    index,
    record,
    id: nullableString(record.id) ?? null,
    level: level != null && level > 0 ? level : null,
  };
}

function persistedBattlePassPlayTimeEvaluationPolicy(
  persistedLevel: Record<string, unknown> | undefined,
  incomingTaskType: GuestGameMissionTaskType,
) {
  if (!persistedLevel || incomingTaskType !== 'PLAY_TIME') {
    return null;
  }

  const rules = jsonRecord(
    persistedLevel.activationRules as Prisma.JsonValue | null,
  );
  if (
    dryRunNumber(rules.schemaVersion, 1) !==
      guestGameMissionDefinitionVersion ||
    nullableString(rules.taskType)?.toUpperCase() !== 'PLAY_TIME'
  ) {
    return null;
  }

  const policy = nullableString(rules.evaluationPolicy)?.toUpperCase();
  return policy === 'LIVE_PRIMARY' || policy === 'LIVE_WITH_LEDGER_FALLBACK'
    ? policy
    : null;
}

function buildVisualSeasonData(
  user: AuthenticatedUser,
  storeIds: string[],
  payload: GuestGameVisualEditorPayload,
  currentLevels: Prisma.JsonValue | null = null,
) {
  const battlePass = payload.battlePass;

  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    name: battlePass.title,
    status: battlePass.status,
    seasonType: 'CLUB_SEASON',
    xpRules: {
      source: 'visual_editor',
      visit: 20,
      checkIn: 0,
      playHour: 10,
      missionCompletion: 50,
    },
    levels: currentLevels ?? buildVisualSeasonLevels(battlePass),
    freeRewards: buildVisualSeasonRewards(battlePass),
    premiumRewards: [],
    premiumEnabled: false,
    premiumUpgradeMode: null,
    storeIds,
    manualApprovalRequired: true,
    note: 'Опубликовано из визуального редактора.',
  });
}

function buildVisualLootBoxData(
  user: AuthenticatedUser,
  storeIds: string[],
  item: GuestGameVisualEditorLootBox,
  currentLimits: Prisma.JsonValue | null = null,
) {
  const preservedOperationalLimits = { ...jsonRecord(currentLimits) };
  delete preservedOperationalLimits.source;
  delete preservedOperationalLimits.periodicLimit;
  delete preservedOperationalLimits.perGuest;
  delete preservedOperationalLimits.perGuestPerWeek;
  const hasActivationBoundary = Boolean(
    dryRunDateOrNull(preservedOperationalLimits.restartedAt) ??
    dryRunDateOrNull(preservedOperationalLimits.activatedAt),
  );
  const rewardType = canonicalLootBoxRewardType(item.rewardType);
  const prizes = visualLootBoxPrizes({
    rewardType,
    rewardAmount: item.rewardAmount,
    rewardLabel: item.rewardLabel,
    prizes: item.prizes,
  });
  const probabilityPrizes = prizes.length
    ? prizes
    : [
        {
          id: 'visual-prize-fallback',
          rewardType,
          rewardAmount: item.rewardAmount,
          rewardLabel: item.rewardLabel,
          chancePercent: 100,
        },
      ];
  const totalChancePercent = probabilityPrizes.reduce(
    (total, prize) => total + prize.chancePercent,
    0,
  );
  const probabilityType = probabilityPrizes.length > 1 ? 'weighted' : 'single';

  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    name: item.title,
    status: item.status,
    triggerKind: item.triggerKind,
    rewardType,
    rewardAmount:
      item.rewardAmount == null ? null : new Prisma.Decimal(item.rewardAmount),
    rewardLabel: item.rewardLabel,
    storeIds,
    periodRules: {
      source: 'visual_editor',
      condition: visualLootBoxCondition(item.condition, item.triggerKind),
      ...buildVisualLootBoxPeriodRules(item),
    },
    limits: {
      ...preservedOperationalLimits,
      source: 'visual_editor',
      ...(item.status === 'ACTIVE' && !hasActivationBoundary
        ? { activatedAt: new Date().toISOString() }
        : {}),
      ...(item.periodicLimitEnabled
        ? { periodicLimit: item.periodicLimitPeriod }
        : {}),
      ...(!item.periodicLimitEnabled && item.limitPerGuest != null
        ? {
            perGuest: item.limitPerGuest,
            perGuestPerWeek: item.limitPerGuest,
          }
        : {}),
    },
    probabilityRules: {
      type: probabilityType,
      source: 'visual_editor',
      caseRarity: visualLootBoxCaseRarity({ caseRarity: item.caseRarity }),
      totalChancePercent: Math.round(totalChancePercent * 100) / 100,
      prizes: probabilityPrizes.map((prize) => ({
        rewardType: canonicalLootBoxRewardType(prize.rewardType),
        rewardAmount: prize.rewardAmount ?? 0,
        rewardLabel: prize.rewardLabel,
        weight: prize.chancePercent,
        chancePercent: prize.chancePercent,
      })),
      items: probabilityPrizes.map((prize) => ({
        label: prize.rewardLabel,
        weight: prize.chancePercent,
      })),
    },
    manualApprovalRequired: false,
    note: 'Опубликовано из визуального редактора.',
  });
}

function buildVisualMissionData(
  user: AuthenticatedUser,
  storeIds: string[],
  item: GuestGameVisualEditorMission,
) {
  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    name: item.title,
    status: item.status,
    missionType: item.missionType,
    triggerKind: item.triggerKind,
    rewardType: item.rewardType,
    rewardAmount:
      item.rewardAmount == null ? null : new Prisma.Decimal(item.rewardAmount),
    rewardLabel: item.rewardLabel,
    xpReward: item.xpReward,
    progressTarget: item.progressTarget,
    progressUnit: item.progressUnit,
    storeIds,
    conditions: {
      source: 'visual_editor',
      questEnabled: item.questSteps.length > 0,
      questMode: item.questSteps.length > 1 ? 'CHAIN' : 'SINGLE',
      questSteps: item.questSteps,
      progressTarget: item.progressTarget,
      progressUnit: item.progressUnit,
    },
    manualApprovalRequired: false,
    note: 'Опубликовано из визуального редактора.',
  });
}

function buildVisualPromoCardData(
  user: AuthenticatedUser,
  storeIds: string[],
  item: GuestGameVisualEditorPromoCard,
) {
  const metadata = normalizePromoCardMetadata(jsonRecord(item.metadata));

  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    title: item.title,
    label: item.label,
    description: item.description,
    tag: item.tag,
    status: item.status,
    targetAnchor: item.targetAnchor,
    storeIds,
    periodFrom: item.periodFrom ? new Date(item.periodFrom) : null,
    periodTo: item.periodTo ? new Date(item.periodTo) : null,
    metadata: {
      ...metadata,
      source: metadata.source ?? 'visual_editor',
    },
  });
}

function normalizePromoCardMetadata(metadata: Record<string, unknown>) {
  const nextMetadata = { ...metadata };
  const actionUrl = normalizeExternalActionUrl(nextMetadata.actionUrl);

  if (actionUrl) {
    nextMetadata.actionUrl = actionUrl;
  } else {
    delete nextMetadata.actionUrl;
  }

  return nextMetadata;
}

function buildVisualCheckInMissionData(
  user: AuthenticatedUser,
  storeIds: string[],
  checkIn: GuestGameVisualEditorCheckIn,
) {
  const bonusMode = checkIn.rewardMode === 'BONUS';
  const amount = bonusMode ? (checkIn.bonusAmount ?? 0) : 0;
  const xp = Math.max(0, checkIn.xp ?? 0);

  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    name: 'Чекин в клубе',
    status: 'ACTIVE',
    missionType: 'CHECK_IN',
    triggerKind: 'CHECK_IN',
    rewardType: bonusMode ? 'BONUS_BALANCE' : 'XP',
    rewardAmount: new Prisma.Decimal(amount),
    rewardLabel:
      checkIn.rewardLabel ?? (bonusMode ? 'Бонусы за чекин' : 'XP за чекин'),
    xpReward: xp,
    progressTarget: 1,
    progressUnit: 'check-in',
    storeIds,
    conditions: {
      source: 'visual_editor',
      checkIn: true,
      progressTarget: 1,
      progressUnit: 'check-in',
    },
    manualApprovalRequired: false,
    note: 'Управляемое правило CHECK_IN из визуального редактора.',
  });
}

function buildVisualSeasonLevels(
  battlePass: GuestGameVisualEditorBattlePass,
): Prisma.InputJsonValue {
  const rewardByLevel = new Map(
    battlePass.levelRewards.map((item) => [item.level, item.reward]),
  );

  return Array.from({ length: battlePass.levelCount }, (_, index) => {
    const level = index + 1;
    const reward =
      rewardByLevel.get(level) ??
      (level === battlePass.levelCount ? battlePass.mainPrize : null);

    return {
      level,
      xp: index * battlePass.xpPerLevel,
      freeReward: reward,
      premiumReward: null,
    };
  });
}

function buildVisualSeasonRewards(
  battlePass: GuestGameVisualEditorBattlePass,
): Prisma.InputJsonValue {
  return visualArray(buildVisualSeasonLevels(battlePass))
    .map((item) => visualRecord(item))
    .filter(
      (item) => typeof item.freeReward === 'string' && item.freeReward.trim(),
    )
    .map((item) => ({
      level: Number(item.level) || 1,
      reward: String(item.freeReward),
    }));
}

function buildVisualEditorPreviewSummary(
  user: AuthenticatedUser,
  store: PilotStoreRow,
  payload: GuestGameVisualEditorPayload,
): GuestPortalGameSummary {
  const now = new Date().toISOString();
  const activeBattlePass = payload.battlePass.enabled
    ? buildVisualPreviewBattlePass(payload.battlePass)
    : null;
  const missions = payload.missions.slice(0, 6).map((mission) => ({
    id: mission.id ?? `preview-mission-${mission.title}`,
    name: mission.title,
    triggerKind: mission.triggerKind,
    sessionType: null,
    rewardLabel: mission.rewardLabel,
    xpReward: mission.xpReward,
    progressCurrent: 0,
    progressTarget: mission.progressTarget,
    progressUnit: mission.progressUnit,
    progressPercent: 0,
    questSteps: mission.questSteps.map((step) => ({
      ...step,
      progressCurrent: 0,
      completed: false,
      current: step.target === 1,
    })),
    periodTo: null,
    manualApprovalRequired: false,
    description: null,
    actionText: null,
    icon: 'Игровой контроллер',
    theme: 'CLASSIC' as const,
    coverUrl: null,
    conditionLabel: 'Выполните условие задания',
    productNames: [],
    productMode: null,
    minimumAmount: null,
    rewardStatus: {
      state: 'IN_PROGRESS',
      label: 'Награда впереди',
      hint: 'Задание доступно в выбранном клубе.',
      rewardLabel: mission.rewardLabel,
      rewardAmount: mission.rewardAmount,
      rewardWalletState: null,
      ledgerStatus: null,
      balanceAfter: null,
      occurredAt: null,
    },
  }));
  const nextActions = [
    ...(payload.checkIn.enabled
      ? [
          {
            id: 'check-in',
            kind: 'CHECK_IN',
            title: 'Сделайте чекин в клубе',
            description:
              payload.checkIn.rewardLabel ??
              (payload.checkIn.rewardMode === 'BONUS'
                ? 'Получите бонусы за подтверждение визита.'
                : 'Получите XP за подтверждение визита.'),
            priority: 'HIGH',
            statusLabel: 'доступно',
            progressPercent: 0,
            anchor: 'progress',
          },
        ]
      : []),
    ...(activeBattlePass?.nextLevel
      ? [
          {
            id: 'battle-pass-preview',
            kind: 'BATTLE_PASS',
            title: `Дойдите до уровня ${activeBattlePass.nextLevel}`,
            description: activeBattlePass.nextRewardLabel ?? 'Награда сезона',
            priority: payload.checkIn.enabled ? 'MEDIUM' : 'HIGH',
            statusLabel: `${activeBattlePass.xpToNextLevel ?? 0} XP`,
            progressPercent: activeBattlePass.progressPercent,
            anchor: 'battlePass',
          },
        ]
      : []),
  ];

  return {
    generatedAt: now,
    tenant: {
      name: user.tenantSlug ?? 'LeetPlus',
      slug: user.tenantSlug,
      gameLogoUrl: null,
    },
    store: {
      id: store.id,
      name: store.name,
      publicSlug: store.publicSlug,
      city: store.city,
      address: store.address,
      latitude: store.latitude == null ? null : Number(store.latitude),
      longitude: store.longitude == null ? null : Number(store.longitude),
      yandexMapsUrl: null,
      gameLogoUrl: null,
      gamificationEnabled: store.gamificationEnabled,
      isActive: store.isActive,
    },
    profile: {
      id: null,
      displayName: 'Гость клуба',
      contactMasked: null,
      isStaffTest: false,
      xp: 0,
      level: 1,
      nextLevelXp: 500,
      levelProgressPercent: 0,
      frame: 'starter',
    },
    referral: {
      status: 'READY',
      code: 'PREVIEW',
      link: '',
      shareText: '',
      channelHint: 'Предпросмотр без реферальной отправки.',
      stats: { acceptedCount: 0, eligibleCount: 0, latestAcceptedAt: null },
    },
    account: {
      guestFound: true,
      state: 'GAME_PROFILE',
      stateLabel: 'Игровой профиль LeetPlus',
      readinessPercent: 80,
      langameLinked: false,
    },
    loyalty: {
      groupName: null,
      discountPercent: null,
      bonusBalance: null,
      bonusBalanceSource: null,
      bonusBalanceSyncedAt: null,
    },
    rewards: {
      summary: {
        total: 0,
        ready: 0,
        waitingApproval: 0,
        redeemed: 0,
        expired: 0,
        nextExpiresAt: null,
      },
      ready: [],
      recent: [],
      latestBonus: null,
      bonusHistory: {
        summary: {
          total: 0,
          confirmedAmount: 0,
          pendingAmount: 0,
          failed: 0,
          latestAt: null,
        },
        items: [],
      },
    },
    completionNotifications: {
      pending: [],
    },
    promoCards: {
      total: payload.promoCards.length,
      featured: visualEditorVisiblePromoCards(payload).map((item, index) => {
        const metadata = jsonRecord(item.metadata);

        return {
          id: item.id ?? `preview-promo-${index}`,
          label: item.label,
          title: item.title,
          description: item.description,
          tag: item.tag,
          targetAnchor: item.targetAnchor,
          imageUrl: nullableString(metadata.imageUrl),
          actionLabel: nullableString(metadata.actionLabel),
          actionUrl: normalizeExternalActionUrl(metadata.actionUrl),
          periodTo: item.periodTo,
        };
      }),
    },
    lootBoxes: {
      total: payload.lootBoxes.length,
      featured: payload.lootBoxes.slice(0, 3).map((item, index) => ({
        id: item.id ?? `preview-loot-${index}`,
        name: item.title,
        triggerKind: item.triggerKind,
        sessionType: null,
        schedule: (() => {
          const periodRules = buildVisualLootBoxPeriodRules(item);

          return {
            timeWindowMode: periodRules.timeWindowMode,
            weekdayMode: periodRules.weekdayMode,
            weekdays: periodRules.weekdays,
            hours: periodRules.hours,
          };
        })(),
        rewardLabel: item.rewardLabel,
        rewardType: canonicalLootBoxRewardType(item.rewardType),
        caseRarity: visualLootBoxCaseRarity({ caseRarity: item.caseRarity }),
        caseRarityLabel:
          lootBoxCaseRarityLabels[
            visualLootBoxCaseRarity({ caseRarity: item.caseRarity })
          ],
        manualApprovalRequired: false,
        note: null,
        openState: 'WAITING_EVENT',
        openable: false,
        openBlocker: 'Предпросмотр не открывает лутбоксы.',
        weeklyOpenedCount: 0,
        weeklyLimit: null,
        dailyOpenedCount: 0,
        dailyLimit: null,
        periodicLimitPeriod: item.periodicLimitEnabled
          ? item.periodicLimitPeriod
          : null,
        periodicOpenedCount: 0,
        openedCount: 0,
        readyRewards: 0,
        waitingApprovalRewards: 0,
        redeemedRewards: 0,
        latestReward: null,
      })),
    },
    missions: {
      total: payload.missions.length,
      featured: missions,
      history: missions,
    },
    battlePass: { active: activeBattlePass },
    progress: {
      summary: {
        xp: 0,
        level: 1,
        levelProgressPercent: 0,
        xpToNextLevel: 500,
        missionsTotal: payload.missions.length,
        missionsCompleted: 0,
        missionsAlmostDone: 0,
        rewardsReady: 0,
        rewardsWaitingApproval: 0,
        confirmedBonusAmount: 0,
        pendingBonusAmount: 0,
        lastActivityAt: null,
      },
      timeline: [],
    },
    journey: {
      summary: {
        completed: 1,
        total: payload.checkIn.enabled ? 6 : 5,
        readyPercent: payload.checkIn.enabled ? 16 : 20,
        nextStepId: payload.checkIn.enabled ? 'CHECK_IN' : 'MISSION',
        nextStepLabel: payload.checkIn.enabled ? 'Чекин' : 'Задание',
      },
      steps: [
        {
          id: 'PROFILE',
          label: 'Регистрация',
          status: 'DONE',
          hint: 'Профиль создан.',
          anchor: 'profile',
        },
        {
          id: 'LANGAME',
          label: 'Связь с Langame',
          status: 'WAITING',
          hint: 'Связь выполняется по телефону.',
          anchor: 'langame-match',
        },
        ...(payload.checkIn.enabled
          ? [
              {
                id: 'CHECK_IN',
                label: 'Чекин',
                status: 'CURRENT',
                hint: 'Чекин включен для клуба.',
                anchor: 'progress',
              },
            ]
          : []),
        {
          id: 'MISSION',
          label: 'Задание',
          status: payload.missions.length ? 'CURRENT' : 'WAITING',
          hint: 'Задания показываются после публикации.',
          anchor: 'missions',
        },
        {
          id: 'REWARD',
          label: 'Награда',
          status: 'WAITING',
          hint: 'Награда появится после выполнения.',
          anchor: 'rewards',
        },
        {
          id: 'BONUS',
          label: 'Бонус в Langame',
          status: 'WAITING',
          hint: 'Бонусы уходят через ledger.',
          anchor: 'rewards',
        },
      ],
    },
    checkIn: {
      enabled: payload.checkIn.enabled,
      ready: payload.checkIn.enabled,
      title: 'Чекин в клубе',
      description:
        payload.checkIn.rewardLabel ??
        (payload.checkIn.rewardMode === 'BONUS'
          ? 'Бонусы за ежедневный чекин в клубе.'
          : 'XP за ежедневный чекин в клубе.'),
      rewardLabel: payload.checkIn.rewardLabel,
      xpReward: Math.max(0, payload.checkIn.xp ?? 0),
      blockedReason: null,
    },
    nextActions: nextActions.slice(0, 5),
    activity: {
      sessionsCount: 0,
      playMinutes: 0,
      gameEventsCount: 0,
      lastActivityAt: null,
      recent: [],
    },
    communications: {
      phoneConsentStatus: 'GRANTED',
      telegram: {
        connected: false,
        readyForRewards: false,
        status: 'NOT_CONNECTED',
      },
      max: {
        connected: false,
        readyForRewards: false,
        status: 'NOT_CONNECTED',
      },
    },
  } as GuestPortalGameSummary;
}

function buildVisualPreviewBattlePass(
  battlePass: GuestGameVisualEditorBattlePass,
): NonNullable<GuestPortalGameSummary['battlePass']['active']> {
  const levels = visualArray(buildVisualSeasonLevels(battlePass)).map(
    (item) => {
      const record = visualRecord(item);
      const level = visualInt(record.level, 1, 1, 60);

      return {
        level,
        xp: visualInt(record.xp, 0, 0, 1000000),
        freeReward: visualNullableString(record.freeReward),
        premiumReward: visualNullableString(record.premiumReward),
        reached: false,
        current: level === 1,
        next: level === 2,
      };
    },
  );
  const next = levels.find((item) => item.next) ?? null;

  return {
    id: battlePass.id ?? 'preview-season',
    name: battlePass.title,
    periodTo: null,
    currentLevel: 1,
    nextLevel: next?.level ?? null,
    progressPercent: 0,
    xpToNextLevel: next?.xp ?? null,
    nextRewardLabel: next?.freeReward ?? battlePass.mainPrize,
    readyRewards: 0,
    waitingApprovalRewards: 0,
    rewardOverview: {
      ranges: [],
      guaranteed: [],
      possible: [],
      unresolved: [],
    },
    levels,
  };
}

function ruleMatchesStoreIds(storeIds: string[], storeId: string | null) {
  return !storeIds.length || Boolean(storeId && storeIds.includes(storeId));
}

function mergeVisualEditorRuleItems<
  TItem extends { id: string | null; status: StatusValue },
  TRule extends { id: string; status: StatusValue },
>(
  baseItems: TItem[],
  liveItems: TItem[],
  allRules: TRule[],
  limit: number,
): TItem[] {
  const liveById = new Map(
    liveItems
      .filter((item): item is TItem & { id: string } => Boolean(item.id))
      .map((item) => [item.id, item]),
  );
  const allRuleIds = new Set(allRules.map((rule) => rule.id));
  const seenIds = new Set<string>();
  const result: TItem[] = [];

  for (const baseItem of baseItems) {
    if (!baseItem.id) {
      result.push(baseItem);
      continue;
    }

    const liveItem = liveById.get(baseItem.id);
    if (liveItem) {
      result.push(liveItem);
      seenIds.add(baseItem.id);
      continue;
    }

    if (!allRuleIds.has(baseItem.id)) {
      continue;
    }

    if (baseItem.status !== 'ACTIVE') {
      result.push(baseItem);
    }
  }

  for (const liveItem of liveItems) {
    if (liveItem.id && !seenIds.has(liveItem.id)) {
      result.push(liveItem);
      seenIds.add(liveItem.id);
    }
  }

  return result.slice(0, limit);
}

function mergeVisualBattlePassFromLive(
  baseBattlePass: GuestGameVisualEditorBattlePass,
  liveBattlePass: GuestGameVisualEditorBattlePass | null,
  seasons: GuestGameSeason[],
): GuestGameVisualEditorBattlePass {
  if (liveBattlePass?.enabled && liveBattlePass.id) {
    return liveBattlePass;
  }

  if (!baseBattlePass.id) {
    return liveBattlePass ?? visualBattlePassFromSeason(null);
  }

  const seasonExists = seasons.some(
    (season) => season.id === baseBattlePass.id,
  );
  if (!seasonExists || baseBattlePass.status === 'ACTIVE') {
    return liveBattlePass ?? visualBattlePassFromSeason(null);
  }

  return baseBattlePass;
}

function visualStoreIdsForExistingRule(
  currentStoreIds: string[],
  storeId: string,
) {
  if (!currentStoreIds.length) {
    return [];
  }

  return uniqueStrings([...currentStoreIds, storeId]);
}

function visualStoreDetachData(
  currentStoreIds: string[],
  storeId: string,
  allStoreIds: string[],
): { storeIds: string[]; status?: StatusValue } {
  const nextStoreIds = currentStoreIds.length
    ? currentStoreIds.filter((id) => id !== storeId)
    : allStoreIds.filter((id) => id !== storeId);

  if (nextStoreIds.length) {
    return { storeIds: uniqueStrings(nextStoreIds) };
  }

  return { storeIds: [], status: 'PAUSED' };
}

function visualStoreDetachManyData(
  currentStoreIds: string[],
  removedStoreIds: string[],
  allStoreIds: string[],
): { storeIds: string[]; status?: StatusValue } {
  const removed = new Set(removedStoreIds);
  const expandedStoreIds = currentStoreIds.length
    ? currentStoreIds
    : allStoreIds;
  const nextStoreIds = expandedStoreIds.filter((id) => !removed.has(id));

  if (nextStoreIds.length) {
    return { storeIds: uniqueStrings(nextStoreIds) };
  }

  return { storeIds: [], status: 'PAUSED' };
}

function ruleStoreSetsOverlap(
  currentStoreIds: string[],
  targetStoreIds: string[],
  allStoreIds: string[],
) {
  const current = new Set(
    currentStoreIds.length ? currentStoreIds : allStoreIds,
  );

  return targetStoreIds.some((id) => current.has(id));
}

function isoPeriodIsActive(from: string | null, to: string | null) {
  const now = Date.now();
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() : null;

  return (
    (fromTime === null || fromTime <= now) && (toTime === null || toTime >= now)
  );
}

function databasePeriodIsActive(from: Date | null, to: Date | null) {
  const now = Date.now();

  return (!from || from.getTime() <= now) && (!to || to.getTime() >= now);
}

function visualRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function visualArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function visualLootBoxPrizes(
  value: Record<string, unknown>,
): GuestGameVisualEditorLootBoxPrize[] {
  const fallbackType = canonicalLootBoxRewardType(
    visualString(value.rewardType, 'PROMOCODE'),
  );
  const fallbackAmount = visualNumberOrNull(value.rewardAmount);
  const fallbackLabel = visualString(value.rewardLabel, 'Награда клуба');
  const source = visualArray(value.prizes).length
    ? visualArray(value.prizes)
    : visualArray(value.items);
  const prizes = source
    .map((item, index) => {
      const record = visualRecord(item);
      const rewardLabel = visualString(
        record.rewardLabel ?? record.label,
        fallbackLabel,
      );

      return {
        id: visualString(record.id, `prize-${index + 1}`),
        rewardType: canonicalLootBoxRewardType(
          visualString(record.rewardType ?? record.type, fallbackType),
        ),
        rewardAmount: visualNumberOrNull(
          record.rewardAmount ?? record.amount ?? fallbackAmount,
        ),
        rewardLabel,
        chancePercent: visualChancePercent(
          record.chancePercent ?? record.weight ?? record.probability,
          source.length > 1 ? 0 : 100,
        ),
      };
    })
    .filter(
      (prize) =>
        prize.rewardLabel.trim() ||
        prize.rewardAmount != null ||
        prize.rewardType,
    )
    .slice(0, 20);

  if (prizes.length) {
    return prizes;
  }

  return [
    {
      id: 'prize-1',
      rewardType: fallbackType,
      rewardAmount: fallbackAmount,
      rewardLabel: fallbackLabel,
      chancePercent: 100,
    },
  ];
}

function visualChancePercent(value: unknown, fallback: number) {
  const parsed = visualNumberOrNull(value);
  const safe = parsed == null ? fallback : parsed;

  return Math.round(Math.min(100, Math.max(0, safe)) * 100) / 100;
}

function visualLootBoxCaseRarity(
  value: Record<string, unknown>,
): GuestGameRewardRarity {
  const raw = value.caseRarity ?? value.skinRarity ?? value.lootBoxRarity;
  const parsed = typeof raw === 'string' ? raw.toLowerCase() : null;

  return parsed === 'rare' ||
    parsed === 'epic' ||
    parsed === 'legendary' ||
    parsed === 'common'
    ? parsed
    : 'common';
}

function visualString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function visualNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function visualId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function visualBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function visualTimeWindowMode(value: unknown) {
  const parsed = visualString(value, 'ANY').toUpperCase();

  return ['ANY', 'QUIET_HOURS', 'CUSTOM'].includes(parsed) ? parsed : 'ANY';
}

function visualWeekdayMode(value: unknown) {
  const parsed = visualString(value, 'ANY').toUpperCase();

  return ['ANY', 'WEEKDAYS', 'WEEKENDS', 'CUSTOM'].includes(parsed)
    ? parsed
    : 'ANY';
}

function visualWeekdays(value: unknown) {
  const weekdays = Array.from(
    new Set(
      visualArray(value)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6),
    ),
  );
  const order = new Map(
    [1, 2, 3, 4, 5, 6, 0].map((item, index) => [item, index]),
  );

  return weekdays.sort(
    (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
  );
}

function visualTimeValue(value: unknown, fallback: string) {
  const parsed = visualString(value, fallback);

  return /^\d{2}:\d{2}$/.test(parsed) ? parsed : fallback;
}

function visualPeriodHour(
  periodRules: Record<string, unknown>,
  part: 0 | 1,
  fallback: string,
) {
  const hours = visualArray(periodRules.hours).filter(
    (item): item is string => typeof item === 'string' && item.includes('-'),
  );
  const raw = hours[0]?.split('-')[part]?.trim();

  return visualTimeValue(raw, fallback);
}

function inferVisualTimeWindowMode(periodRules: Record<string, unknown>) {
  const hours = visualArray(periodRules.hours);

  if (!hours.length && periodRules.quietHoursEnabled !== true) {
    return 'ANY';
  }

  return periodRules.quietHoursEnabled === true ? 'QUIET_HOURS' : 'CUSTOM';
}

function inferVisualWeekdayMode(periodRules: Record<string, unknown>) {
  const weekdays = visualWeekdays(periodRules.weekdays);
  const same = (expected: number[]) =>
    weekdays.length === expected.length &&
    weekdays.every((item, index) => item === expected[index]);

  if (same([1, 2, 3, 4, 5])) {
    return 'WEEKDAYS';
  }

  if (same([6, 0])) {
    return 'WEEKENDS';
  }

  if (!weekdays.length || same([1, 2, 3, 4, 5, 6, 0])) {
    return periodRules.weekdaysOnly === true ? 'WEEKDAYS' : 'ANY';
  }

  return 'CUSTOM';
}

function buildVisualLootBoxPeriodRules(item: GuestGameVisualEditorLootBox) {
  const timeWindowMode = visualTimeWindowMode(item.timeWindowMode);
  const weekdayMode = visualWeekdayMode(item.weekdayMode);
  const hours =
    timeWindowMode === 'ANY'
      ? []
      : [
          `${visualTimeValue(item.hourFrom, '10:00')}-${visualTimeValue(
            item.hourTo,
            '16:00',
          )}`,
        ];
  const weekdays =
    weekdayMode === 'CUSTOM'
      ? visualWeekdays(item.weekdays)
      : weekdayMode === 'WEEKDAYS'
        ? [1, 2, 3, 4, 5]
        : weekdayMode === 'WEEKENDS'
          ? [0, 6]
          : [];

  return {
    timeWindowMode,
    weekdayMode,
    quietHoursEnabled: timeWindowMode !== 'ANY',
    weekdaysOnly: weekdayMode === 'WEEKDAYS',
    weekdays,
    hours,
  };
}

function visualStatus(value: unknown, fallback: StatusValue): StatusValue {
  const parsed = visualString(value, fallback).toUpperCase();
  return statusValues.includes(parsed as StatusValue)
    ? (parsed as StatusValue)
    : fallback;
}

function visualRewardMode(value: unknown): GuestGameVisualEditorRewardMode {
  const parsed = visualString(value, '').toUpperCase();
  return parsed === 'XP' || parsed === 'BONUS' ? parsed : '';
}

function visualLootBoxCondition(
  value: string | null | undefined,
  triggerKind: string,
) {
  const normalized = value?.trim();
  const triggerLabel = rewardApprovalEventLabels[triggerKind] ?? triggerKind;

  if (
    !normalized ||
    normalized === triggerKind ||
    rewardApprovalEventLabels[normalized] != null
  ) {
    return triggerLabel;
  }

  return normalized;
}

function visualNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function visualInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = visualNumberOrNull(value);
  if (parsed == null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function visualIntOrNull(value: unknown, min: number, max: number) {
  const parsed = visualNumberOrNull(value);
  if (parsed == null) {
    return null;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function visualDateString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
