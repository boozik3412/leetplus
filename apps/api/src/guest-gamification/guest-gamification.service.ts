import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  DailyDataCoverageScope,
  DailyDataCoverageStatus,
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type { LangameGuestSession } from '../integrations/langame.types';
import type { GuestPortalGameSummary } from '../guest-portal/guest-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffTeamChatService } from '../staff/staff-team-chat.service';
import {
  GuestBonusLedgerSchedulerService,
  type GuestBonusLedgerSchedulerRuntimeStatus,
} from './guest-bonus-ledger-scheduler.service';
import { GuestBonusLedgerService } from './guest-bonus-ledger.service';
import {
  evaluateGuestGameProgress,
  guestGameTriggerMatches,
  type GuestGameProgressEvent,
  type GuestGameProgressResult,
} from './guest-game-progress';

const statusValues = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'FINISHED',
  'ARCHIVED',
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
const gameEffectWindowDays = 14;
const tariffSnapshotDefinitions = [
  {
    endpointKey: 'tariffsByDays',
    endpointPath: '/tariffs/by_days/list',
    title: 'Тарифы по дням',
    description: 'Дни недели и ограничения периода для миссий и loot box.',
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
  MISSION_COMPLETED: 'Квест выполнен',
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
  CUSTOM: 'Своя миссия',
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
  regular_session: 'обычная сессия',
  packet_hours: 'пакет часов',
};

type StatusValue = (typeof statusValues)[number];
type ProfileStatus = (typeof profileStatuses)[number];
type RewardStatus = (typeof rewardStatuses)[number];
type RewardSource = (typeof rewardSources)[number];
type EventSource = (typeof eventSources)[number];
type GuestLogMappingPreset = (typeof guestLogMappingPresets)[number];
type GuestLogMappingIntent = (typeof guestLogMappingIntents)[number];
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

export type GuestGameLootBox = GuestGameRuleBase & {
  triggerKind: string;
  segment: string | null;
  sessionType: string | null;
  periodRules: Prisma.JsonValue | null;
  limits: Prisma.JsonValue | null;
  probabilityRules: Prisma.JsonValue;
  antiFraudRules: Prisma.JsonValue | null;
};

export type GuestGameMission = GuestGameRuleBase & {
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

export type GuestGameVisualEditorRewardMode = 'XP' | 'BONUS' | '';

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
  condition: string;
  limitPerGuest: number | null;
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
export type GuestGameReward = {
  id: string;
  status: RewardStatus;
  walletState:
    | 'WAITING_APPROVAL'
    | 'READY'
    | 'REDEEMED'
    | 'CANCELED'
    | 'EXPIRED';
  source: RewardSource;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
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
    xpReward: number;
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
  profileId?: string | null;
  guestId?: string | null;
  lootBoxId?: string | null;
  storeId?: string | null;
  eventType?: string | null;
  occurredAt?: string | null;
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
  categoryId?: string | null;
  productName?: string | null;
  categoryName?: string | null;
  supplierName?: string | null;
  quantity?: number | string | null;
};

export type GuestGameProcessEventDto = GuestGameDryRunDto & {
  sourceFactId?: string | null;
  sourceFactKind?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  note?: string | null;
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
  store: { id: string; name: string } | null;
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
  spendAmount: number | null;
  tariffGroupId: string | null;
  tariffPeriodId: string | null;
  tariffTypeId: string | null;
  guestLogType?: string | null;
  productId?: string | null;
  externalProductId?: string | null;
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
  store: { id: string; name: string } | null;
  raw: LangameGuestSession;
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

@Injectable()
export class GuestGamificationService {
  private readonly logger = new Logger(GuestGamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
    private readonly configService: ConfigService,
    private readonly bonusLedgerSchedulerService: GuestBonusLedgerSchedulerService,
    private readonly bonusLedgerService: GuestBonusLedgerService,
    @Optional()
    private readonly staffTeamChatService?: StaffTeamChatService,
  ) {}

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
              : '/guests/gamification',
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
        note: 'Регистрация не создает общий Guest, а создает отдельный GuestGameProfile для XP, миссий и наград.',
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
        note: 'Пилоту нужен хотя бы один активный лутбокс, миссия или Battle Pass, применимый к клубу.',
        nextAction: activeRuleCount
          ? 'Запустить dry-run по тестовому профилю и пилотному клубу.'
          : 'Создать простую миссию или лутбокс для клуба 1337.',
        actionHref: '/guests/gamification?mode=advanced&tab=lootBoxes',
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
            : `Каталог событий сохранен для будущих квестов и anti-fraud: ${guestLogDomains} источников, последнее событие ${guestLogLatestAt ?? 'без даты'}. Текущие правила могут идти без guests/logs.`
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? `Диагностика guests/logs закрыта: последний успешный foundation sync за ${guestLogLastSync?.businessDate ?? 'последнюю дату'} проверил endpoint и вернул 0 логов. Пилот можно продолжать на правилах без guests/logs, а guests/logs-зависимости считать ожидающими подтверждения payload Langame.`
              : 'Активные правила используют типы guests/logs, но сохраненных фактов пока нет: dry-run по этим правилам будет неполным.'
            : guestLogMappings
              ? 'Словарь типов уже настроен, но текущие активные правила не требуют guests/logs.'
              : guestLogsCheckedEmpty
                ? `Текущие активные правила не требуют guests/logs; последний успешный foundation sync за ${guestLogLastSync?.businessDate ?? 'последнюю дату'} уже проверил endpoint и вернул 0 логов.`
                : 'Текущие активные правила не требуют guests/logs; каталог нужен для будущих квестов и anti-fraud.',
        nextAction: guestLogsReady
          ? 'Скачать CSV каталога и выбрать реальные типы для правил 1337.'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? 'Хвост закрыт: endpoint уже проверен и вернул 0 строк. Для первого бонуса используйте правила без guests/logs; к guests/logs вернуться после подтверждения payload Langame.'
              : 'На /sync включить расширенную проверку guests/logs и дождаться сохраненных фактов перед dry-run.'
            : guestLogsCheckedEmpty
              ? 'Можно запускать dry-run текущих правил; для guests/logs-квестов сначала подтвердить у Langame, почему endpoint возвращает 0 строк.'
              : 'Можно запускать dry-run текущих правил; для расширенных квестов позже заполнить guests/logs на /sync.',
        actionHref: guestLogsReady
          ? '/api/guests/gamification/guest-log-catalog/export'
          : guestLogsRequiredByRules && guestLogsCheckedEmpty
            ? '/guests/gamification?mode=advanced&tab=lootBoxes'
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
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
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
        where: { tenantId: user.tenantId, isCanceled: false },
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
      ...productExpenses.flatMap(mapProductExpenseFact),
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

  async runSnapshotPipeline(
    user: AuthenticatedUser,
    dto: GuestGamePipelineRunDto,
  ): Promise<GuestGamePipelineRunResult> {
    const source = pipelineSourceValue(dto.source);
    const limit = Math.min(30, Math.max(1, intValue(dto.limit) ?? 20));
    const dryRunOnly = booleanValue(dto.dryRunOnly);
    const factsResult = await this.getSnapshotFacts(user);
    const candidates = factsResult.facts
      .filter((fact) => !source || fact.source === source)
      .slice(0, limit);
    const facts: GuestGamePipelineFactResult[] = [];

    for (const fact of candidates) {
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
        const dryRun = await this.dryRun(user, processDto);
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

        if (dryRunOnly) {
          facts.push({
            ...pipelineFactBase(fact),
            status: 'DRY_RUN',
            reason: `${activeEligibleRules.length} активных правил сработает, ${dryRun.summary.blockedRules} правил заблокировано.`,
            dryRun,
            process: null,
          });
          continue;
        }

        if (!activeEligibleRules.length && activeXpDelta === 0) {
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

        if (nonActiveEligibleRules.length) {
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
      availableFacts: factsResult.facts.length,
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
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
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
    await this.assertLootBox(user, id);
    const data = await this.buildLootBoxData(user, dto, false);
    const row = await this.prisma.guestGameLootBox.update({
      where: { id },
      data,
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

  async getMissions(user: AuthenticatedUser): Promise<GuestGameMission[]> {
    const rows = await this.prisma.guestGameMission.findMany({
      where: { tenantId: user.tenantId },
      include: missionInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(mapMission);
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
    await this.assertMission(user, id);
    const data = await this.buildMissionData(user, dto, false);
    const row = await this.prisma.guestGameMission.update({
      where: { id },
      data,
      include: missionInclude,
    });

    return mapMission(row);
  }

  async getSeasons(user: AuthenticatedUser): Promise<GuestGameSeason[]> {
    const rows = await this.prisma.guestGameSeason.findMany({
      where: { tenantId: user.tenantId },
      include: seasonInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
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

    return mapSeason(row);
  }

  async updateSeason(
    user: AuthenticatedUser,
    id: string,
    dto: GuestGameSeasonUpdateDto,
  ): Promise<GuestGameSeason> {
    await this.assertSeason(user, id);
    const data = await this.buildSeasonData(user, dto, false);
    const row = await this.prisma.guestGameSeason.update({
      where: { id },
      data,
      include: seasonInclude,
    });

    return mapSeason(row);
  }

  async getPromoCards(user: AuthenticatedUser): Promise<GuestGamePromoCard[]> {
    const rows = await this.prisma.guestGamePromoCard.findMany({
      where: { tenantId: user.tenantId },
      include: promoCardInclude,
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return rows.map(mapPromoCard);
  }

  async getVisualEditorDraft(
    user: AuthenticatedUser,
    dto: Pick<GuestGameVisualDraftDto, 'id' | 'storeId'> = {},
  ): Promise<GuestGameVisualDraft> {
    if (dto.id) {
      return mapVisualDraft(await this.assertVisualDraft(user, dto.id));
    }

    const store = await this.resolveVisualEditorStore(user, dto.storeId);
    const row = await this.prisma.guestGameVisualDraft.findFirst({
      where: {
        tenantId: user.tenantId,
        storeId: store.id,
        status: 'DRAFT',
      },
      include: visualDraftInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (row) {
      return mapVisualDraft(row);
    }

    return mapVisualDraft(await this.createVisualEditorDraft(user, store));
  }

  async updateVisualEditorDraft(
    user: AuthenticatedUser,
    dto: GuestGameVisualDraftDto,
  ): Promise<GuestGameVisualDraft> {
    const store = await this.resolveVisualEditorStore(user, dto.storeId);
    const payload = normalizeVisualEditorPayload(dto.payload);
    const note = nullableString(dto.note) ?? null;
    const updatedByUserId = actorUserId(user);
    const row = dto.id
      ? await this.prisma.guestGameVisualDraft.update({
          where: { id: (await this.assertVisualDraft(user, dto.id)).id },
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
    await this.applyVisualEditorPayload(user, store, payload);

    const row = await this.prisma.guestGameVisualDraft.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        payload: payload,
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
      summary: this.buildVisualEditorPreviewSummary(user, store, payload),
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
      seasons.find((item) => ruleMatchesPilotStore(item, storeId)) ?? null;
    const checkInMission = missions.find(
      (item) =>
        item.status === 'ACTIVE' &&
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
            ruleMatchesPilotStore(item, storeId),
        )
        .slice(0, 8)
        .map(visualMissionFromRule),
      promoCards: promoCards
        .filter(
          (item) =>
            item.status === 'ACTIVE' &&
            ruleMatchesStoreIds(item.storeIds, storeId),
        )
        .slice(0, 6)
        .map(visualPromoFromRule),
      checkIn: visualCheckInFromMission(checkInMission ?? null),
    });
  }

  private async applyVisualEditorPayload(
    user: AuthenticatedUser,
    store: PilotStoreRow,
    payload: GuestGameVisualEditorPayload,
  ): Promise<void> {
    const storeIds = [store.id];

    if (payload.battlePass.enabled) {
      const seasonData = buildVisualSeasonData(user, storeIds, payload);
      if (payload.battlePass.id) {
        await this.assertSeason(user, payload.battlePass.id);
        await this.prisma.guestGameSeason.update({
          where: { id: payload.battlePass.id },
          data: seasonData,
        });
      } else {
        await this.prisma.guestGameSeason.create({
          data: seasonData,
        });
      }
    }

    for (const lootBox of payload.lootBoxes) {
      const data = buildVisualLootBoxData(user, storeIds, lootBox);
      if (lootBox.id) {
        await this.assertLootBox(user, lootBox.id);
        await this.prisma.guestGameLootBox.update({
          where: { id: lootBox.id },
          data,
        });
      } else {
        await this.prisma.guestGameLootBox.create({
          data: data,
        });
      }
    }

    for (const mission of payload.missions) {
      const data = buildVisualMissionData(user, storeIds, mission);
      if (mission.id) {
        await this.assertMission(user, mission.id);
        await this.prisma.guestGameMission.update({
          where: { id: mission.id },
          data,
        });
      } else {
        await this.prisma.guestGameMission.create({
          data: data,
        });
      }
    }

    for (const promoCard of payload.promoCards) {
      const data = buildVisualPromoCardData(user, storeIds, promoCard);
      if (promoCard.id) {
        await this.assertPromoCard(user, promoCard.id);
        await this.prisma.guestGamePromoCard.update({
          where: { id: promoCard.id },
          data,
        });
      } else {
        await this.prisma.guestGamePromoCard.create({
          data: data,
        });
      }
    }

    await this.applyVisualCheckInRule(user, store.id, payload.checkIn);
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
        await this.prisma.guestGameMission.update({
          where: { id: existing.id },
          data: { status: 'PAUSED' },
        });
      }
      return;
    }

    const data = buildVisualCheckInMissionData(user, storeId, checkIn);
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
  ): Promise<GuestGameReward> {
    const data = (await this.buildRewardData(
      user,
      dto,
      true,
    )) as Prisma.GuestGameRewardUncheckedCreateInput;
    const row = await this.prisma.guestGameReward.create({
      data,
      include: rewardInclude,
    });

    await this.createSystemEvent(user, {
      profileId: row.profileId,
      guestId: row.guestId,
      lootBoxId: row.lootBoxId,
      missionId: row.missionId,
      seasonId: row.seasonId,
      eventType: 'REWARD_QUALIFIED',
      xpDelta: 0,
      note: row.rewardLabel,
    });

    if (row.status === 'PENDING') {
      await this.notifyRewardApprovalRequired(row);
    }
    await this.queueAndDispatchApprovedReward(user, row);

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

    const row = await this.prisma.guestGameReward.update({
      where: { id },
      data,
      include: rewardInclude,
    });

    if (dto.status && dto.status !== current.status) {
      await this.createSystemEvent(user, {
        profileId: row.profileId,
        guestId: row.guestId,
        lootBoxId: row.lootBoxId,
        missionId: row.missionId,
        seasonId: row.seasonId,
        eventType: rewardStatusEventType(dto.status),
        xpDelta: 0,
        note: row.rewardLabel,
      });
    }
    await this.queueAndDispatchApprovedReward(user, row);

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
  ): Promise<GuestGameEvent> {
    const data = await this.buildEventData(user, dto);
    const row = await this.prisma.guestGameEvent.create({
      data,
      include: eventInclude,
    });

    if (row.profileId && row.xpDelta !== 0) {
      await this.applyXp(user, row.profileId, row.xpDelta);
      const updated = await this.prisma.guestGameEvent.findUnique({
        where: { id: row.id },
        include: eventInclude,
      });

      return mapEvent(updated ?? row);
    }

    return mapEvent(row);
  }

  async dryRun(
    user: AuthenticatedUser,
    dto: GuestGameDryRunDto,
  ): Promise<GuestGameDryRunResult> {
    const eventType = stringValue(dto.eventType) ?? 'SESSION_START';
    const lootBoxId = nullableId(dto.lootBoxId);
    const occurredAt = dateValue(dto.occurredAt) ?? new Date();
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
    const categoryId = nullableString(dto.categoryId) ?? null;
    const productName = nullableString(dto.productName) ?? null;
    const categoryName = nullableString(dto.categoryName) ?? null;
    const supplierName = nullableString(dto.supplierName) ?? null;
    const quantity = dryRunOptionalNumber(dto.quantity);
    const [profile, lootBoxes, missions, seasons, rewards] = await Promise.all([
      this.resolveDryRunProfile(user, dto),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getSeasons(user),
      this.getDryRunRewards(user),
    ]);
    const guest =
      profile?.guest ??
      (dto.guestId
        ? dryRunGuestSummary(await this.getTenantGuest(user, dto.guestId))
        : null);
    const store = dto.storeId
      ? await this.assertStore(user, dto.storeId)
      : null;
    const progressEvents = await this.getDryRunProgressEvents(user, {
      profileId: profile?.id ?? null,
      guestId: guest?.id ?? null,
    });
    const context: DryRunContext = {
      eventType,
      occurredAt,
      profile,
      guest,
      storeId: store?.id ?? null,
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
      categoryId,
      productName,
      categoryName,
      supplierName,
      quantity,
      rewards,
      progressEvents,
    };
    const targetLootBoxes = lootBoxId
      ? lootBoxes.filter((item) => item.id === lootBoxId)
      : lootBoxes;

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
      store: store ? { id: store.id, name: store.name } : null,
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

  async processEvent(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
  ): Promise<GuestGameProcessEventResult> {
    const { profile, profileCreated } = await this.ensureProcessProfile(
      user,
      dto,
    );
    const dryRun = await this.dryRun(user, {
      ...dto,
      profileId: profile.id,
      guestId: nullableId(dto.guestId) ?? profile.guest?.id ?? null,
    });
    const eventReference = buildProcessExternalReference(dto, dryRun.eventType);
    const processPayload = buildProcessPayload(dto, dryRun);
    const existingEvent = eventReference
      ? await this.findProcessEventByReference(user, eventReference)
      : null;

    if (eventReference && existingEvent) {
      const rewards = await this.findProcessRewardsByReference(
        user,
        eventReference,
      );
      const repairedRewards = shouldRecoverProcessRewards(dryRun, rewards)
        ? await this.createProcessRewards(
            user,
            dto,
            dryRun,
            profile.id,
            eventReference,
          )
        : [];
      const processRewards =
        repairedRewards.length > 0 ? repairedRewards : rewards;

      return {
        processed: true,
        dryRun,
        event: mapEvent(existingEvent),
        rewards: processRewards,
        summary: {
          profileCreated: false,
          appliedXpDelta: 0,
          createdRewards: repairedRewards.length,
          queuedRewardAmount: sum(
            processRewards.map((reward) => reward.rewardAmount),
          ),
          idempotencyKey: eventReference.externalId,
          idempotent: true,
          langameWrite: false,
        },
        note:
          repairedRewards.length > 0
            ? 'Snapshot-событие уже было обработано ранее; LeetPlus восстановил отсутствующие награды без повторного XP или события.'
            : 'Snapshot-событие уже было обработано ранее; повторный запуск не создал XP, события или награды.',
      };
    }

    const source: EventSource =
      nullableString(dto.sourceFactKind) === 'LIVE_CHECK_IN'
        ? 'CHECK_IN'
        : 'API_IMPORT';
    let event: GuestGameEvent;

    try {
      event = await this.createProcessEvent(user, {
        profileId: profile.id,
        guestId: profile.guest?.id ?? dryRun.guest?.id ?? null,
        lootBoxId: nullableId(dto.lootBoxId),
        eventType: dryRun.eventType,
        source,
        externalProvider: eventReference?.externalProvider ?? null,
        externalDomain: eventReference?.externalDomain ?? null,
        externalId: eventReference?.externalId ?? null,
        xpDelta: dryRun.summary.projectedXpDelta,
        occurredAt: dryRun.occurredAt,
        payload: processPayload,
        note:
          nullableString(dto.note) ??
          'Подтвержденный запуск события геймификации в LeetPlus.',
      });
    } catch (error) {
      if (eventReference && error instanceof ConflictException) {
        const duplicateEvent = await this.findProcessEventByReference(
          user,
          eventReference,
        );

        if (duplicateEvent) {
          const rewards = await this.findProcessRewardsByReference(
            user,
            eventReference,
          );
          const repairedRewards = shouldRecoverProcessRewards(dryRun, rewards)
            ? await this.createProcessRewards(
                user,
                dto,
                dryRun,
                profile.id,
                eventReference,
              )
            : [];
          const processRewards =
            repairedRewards.length > 0 ? repairedRewards : rewards;

          return {
            processed: true,
            dryRun,
            event: mapEvent(duplicateEvent),
            rewards: processRewards,
            summary: {
              profileCreated: false,
              appliedXpDelta: 0,
              createdRewards: repairedRewards.length,
              queuedRewardAmount: sum(
                processRewards.map((reward) => reward.rewardAmount),
              ),
              idempotencyKey: eventReference.externalId,
              idempotent: true,
              langameWrite: false,
            },
            note:
              repairedRewards.length > 0
                ? 'Событие уже было обработано параллельным запросом; LeetPlus восстановил отсутствующие награды без повторного XP или события.'
                : 'Событие уже было обработано параллельным запросом; повторный запуск не создал XP, события или награды.',
          };
        }
      }

      throw error;
    }
    const rewards = await this.createProcessRewards(
      user,
      dto,
      dryRun,
      profile.id,
      eventReference,
    );

    return {
      processed: true,
      dryRun,
      event,
      rewards,
      summary: {
        profileCreated,
        appliedXpDelta: dryRun.summary.projectedXpDelta,
        createdRewards: rewards.length,
        queuedRewardAmount: sum(rewards.map((reward) => reward.rewardAmount)),
        idempotencyKey: eventReference?.externalId ?? null,
        idempotent: false,
        langameWrite: false,
      },
      note: 'Событие и очередь наград созданы внутри LeetPlus. Запись в Langame не выполнялась.',
    };
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

    let liveSession: CheckInLiveSession | null;

    try {
      liveSession = await this.findActiveCheckInSession(user.tenantId, guest);
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

    const expectedStoreId = nullableId(dto.storeId);

    if (
      expectedStoreId &&
      (!liveSession.store || liveSession.store.id !== expectedStoreId)
    ) {
      throw new BadRequestException(
        'Не удалось подтвердить, что активная сессия гостя открыта в этом клубе.',
      );
    }

    const checkedAt = new Date();
    const eventExternalId = [
      'check-in',
      liveSession.externalDomain,
      liveSession.externalSessionId,
      guest.externalGuestId,
    ].join(':');
    const processResult = await this.processEvent(user, {
      guestId: guest.id,
      storeId: liveSession.store?.id ?? null,
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
        store: liveSession.store,
      },
      processResult,
      note: 'Чекин подтвержден активной сессией Langame и обработан правилами геймификации.',
    };
  }

  private async createProcessEvent(
    user: AuthenticatedUser,
    dto: GuestGameEventDto,
  ): Promise<GuestGameEvent> {
    try {
      return await this.createEvent(user, dto);
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

  private async findProcessRewardsByReference(
    user: AuthenticatedUser,
    eventReference: ProcessExternalReference,
  ): Promise<GuestGameReward[]> {
    const rows = await this.prisma.guestGameReward.findMany({
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

  private async createProcessRewards(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
    dryRun: GuestGameDryRunResult,
    profileId: string,
    eventReference: ProcessExternalReference | null,
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
      );
    const staffTestBlocked = Boolean(
      staffTestReason && !staffTestRewardAccrualEnabled,
    );

    for (const rule of eligibleRules) {
      const link = rewardRuleLink(rule);
      const externalId = eventReference
        ? `${eventReference.externalId}:reward:${rule.kind}:${rule.id}`
        : null;

      try {
        const reward = await this.createReward(user, {
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
            rule.kind === 'LOOT_BOX' ? rule.selectedReward?.rewardRarity : null,
          rewardRarityLabel:
            rule.kind === 'LOOT_BOX'
              ? rule.selectedReward?.rewardRarityLabel
              : null,
          rewardDropChance:
            rule.kind === 'LOOT_BOX'
              ? rule.selectedReward?.chancePercent
              : null,
          qualifiedAt: dryRun.occurredAt,
          note: staffTestBlocked
            ? 'Создано как тест сотрудника; автоматическое начисление в Langame заблокировано.'
            : staffTestReason
              ? 'Создано как тест сотрудника; автоматическое начисление в Langame разрешено пилотным флагом.'
              : 'Создано подтвержденным запуском события геймификации.',
          evidence: {
            source: 'guest_gamification_process_event',
            langameWrite: false,
            sourceFactId: nullableString(dto.sourceFactId),
            sourceFactKind: nullableString(dto.sourceFactKind),
            eventType: dryRun.eventType,
            occurredAt: dryRun.occurredAt,
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
        });
        rewards.push(reward);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          if (eventReference && externalId) {
            const existingReward = await this.findProcessRewardByExternalId(
              user,
              eventReference,
              externalId,
            );

            if (existingReward) {
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
          : { guestId: dto.guestId ?? undefined }),
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
  ): Promise<GuestGameReward[]> {
    const rows = await this.prisma.guestGameReward.findMany({
      where: {
        tenantId: user.tenantId,
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      },
      include: rewardInclude,
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });

    return rows.map(mapReward);
  }

  private async getDryRunProgressEvents(
    user: AuthenticatedUser,
    scope: { profileId?: string | null; guestId?: string | null },
  ): Promise<GuestGameProgressEvent[]> {
    const conditions: Prisma.GuestGameEventWhereInput[] = [
      ...(scope.profileId ? [{ profileId: scope.profileId }] : []),
      ...(scope.guestId ? [{ guestId: scope.guestId }] : []),
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

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(dto.name, 'Название лутбокса', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
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
      limits: jsonValue(dto.limits),
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

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(dto.name, 'Название миссии', isCreate),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
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
        jsonValue(dto.conditions) ??
        (isCreate ? defaultMissionConditions() : undefined),
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
  ): Promise<
    | Prisma.GuestGameSeasonUncheckedCreateInput
    | Prisma.GuestGameSeasonUncheckedUpdateInput
  > {
    if (dto.audienceId) {
      await this.assertAudience(user, dto.audienceId);
    }

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
      levels: jsonValue(dto.levels) ?? (isCreate ? defaultLevels() : undefined),
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

  private async buildRewardData(
    user: AuthenticatedUser,
    dto: GuestGameRewardDto,
    isCreate: boolean,
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
      xpDelta: intValue(dto.xpDelta) ?? 0,
      occurredAt: dateValue(dto.occurredAt) ?? new Date(),
      payload: jsonValue(dto.payload),
      note: nullableString(dto.note),
    }) as Prisma.GuestGameEventUncheckedCreateInput;
  }

  private async notifyRewardApprovalRequired(row: RewardRow) {
    if (!this.staffTeamChatService) {
      return;
    }

    try {
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
          actionHref: `/guests/gamification?tab=rewards&rewardId=${encodeURIComponent(row.id)}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send gamification reward approval chat message for ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async queueAndDispatchApprovedReward(
    user: AuthenticatedUser,
    row: RewardRow,
  ) {
    if (row.status !== 'APPROVED') {
      return;
    }

    try {
      await this.bonusLedgerService.queueApprovedRewards(user, {
        rewardId: row.id,
        rewardTypes: [row.rewardType],
        limit: 1,
      });
      await this.bonusLedgerService.dispatch(user, {
        rewardId: row.id,
        rewardTypes: [row.rewardType],
        limit: 1,
        queueApprovedRewards: false,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to queue/dispatch approved gamification reward ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private rewardActivityType(row: RewardRow) {
    if (row.lootBoxId) {
      return 'Лутбокс';
    }

    if (row.missionId) {
      return 'Квест';
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

  private async applyXp(
    user: AuthenticatedUser,
    profileId: string,
    xpDelta: number,
  ) {
    const profile = await this.assertProfile(user, profileId);
    const nextXp = Math.max(0, profile.xp + xpDelta);

    await this.prisma.guestGameProfile.update({
      where: { id: profileId },
      data: {
        xp: nextXp,
        level: levelFromXp(nextXp),
        lastActivityAt: new Date(),
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
      throw new NotFoundException('Игровая миссия не найдена');
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

  private async findActiveCheckInSession(
    tenantId: string,
    guest: {
      externalDomain: string | null;
      externalGuestId: string;
    },
  ): Promise<CheckInLiveSession | null> {
    const externalGuestId = nullableString(guest.externalGuestId);

    if (!externalGuestId) {
      return null;
    }

    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(tenantId);
    const preferredDomain = nullableString(guest.externalDomain);
    const orderedSources = preferredDomain
      ? [
          ...sources.filter((source) => source.domain === preferredDomain),
          ...sources.filter((source) => source.domain !== preferredDomain),
        ]
      : sources;
    const period = this.checkInLookupPeriod(new Date());

    for (const source of orderedSources) {
      try {
        const session = await this.findCheckInSessionInSource({
          apiKey,
          source,
          externalGuestId,
          period,
        });

        if (session) {
          return {
            ...session,
            store: await this.resolveCheckInStore(
              tenantId,
              source.id,
              source.domain,
              session.externalClubId,
            ),
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async findCheckInSessionInSource(params: {
    apiKey: string;
    source: { id: string; domain: string; baseUrl: string };
    externalGuestId: string;
    period: { dateFrom: string; dateTo: string };
  }): Promise<CheckInLiveSession | null> {
    const pageLimit = 200;
    const maxPages = 5;

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
      );

      for (const row of rows) {
        if (
          this.checkInScalar(row.guest_id) === params.externalGuestId &&
          this.isOpenCheckInSessionStop(row.date_stop)
        ) {
          const session = this.toCheckInLiveSession(params.source.domain, row);

          if (session.externalSessionId) {
            return session;
          }
        }
      }

      if (rows.length < pageLimit) {
        break;
      }
    }

    return null;
  }

  private toCheckInLiveSession(
    externalDomain: string,
    row: LangameGuestSession,
  ): CheckInLiveSession {
    const startedAt = this.parseCheckInLangameDate(
      this.checkInScalar(row.date_start),
    );
    const packet = this.checkInBoolean(row.packet);

    return {
      externalDomain,
      externalSessionId: this.checkInScalar(row.id) ?? '',
      externalGuestId: this.checkInScalar(row.guest_id),
      externalClubId: this.checkInScalar(row.club_id ?? row.list_clubs_id),
      externalUuid: this.checkInScalar(row.UUID),
      startedAt,
      durationMinutes: this.checkInDurationMinutes(startedAt),
      sessionType: packet ? 'packet_hours' : 'regular_session',
      sessionPacket: packet,
      store: null,
      raw: row,
    };
  }

  private async resolveCheckInStore(
    tenantId: string,
    integrationSourceId: string,
    externalDomain: string,
    externalClubId: string | null,
  ): Promise<CheckInLiveSession['store']> {
    if (externalClubId) {
      const store = await this.prisma.store.findFirst({
        where: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
          externalClubId,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      if (store) {
        return store;
      }
    }

    const sourceStores = await this.prisma.store.findMany({
      where: { tenantId, integrationSourceId, isActive: true },
      take: 2,
      select: { id: true, name: true },
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
      select: { id: true, name: true },
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
    if (value === true || value === 'true' || value === '1' || value === 1) {
      return true;
    }

    if (value === false || value === 'false' || value === '0' || value === 0) {
      return false;
    }

    return null;
  }

  private parseCheckInLangameDate(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    const ruDate =
      /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
        trimmed,
      );

    if (ruDate) {
      return new Date(
        Date.UTC(
          Number(ruDate[3]),
          Number(ruDate[2]) - 1,
          Number(ruDate[1]),
          Number(ruDate[4] ?? 0),
          Number(ruDate[5] ?? 0),
          Number(ruDate[6] ?? 0),
        ),
      );
    }

    const normalized = trimmed.includes('T')
      ? trimmed
      : trimmed.replace(' ', 'T');
    const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
      ? normalized
      : `${normalized}Z`;
    const date = new Date(withTimezone);

    return Number.isNaN(date.getTime()) ? null : date;
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

function mapLootBox(row: LootBoxRow): GuestGameLootBox {
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
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
  return {
    id: row.id,
    name: row.name,
    status: row.status as StatusValue,
    missionType: row.missionType,
    triggerKind: row.triggerKind,
    rewardType: row.rewardType,
    rewardAmount: numberOrNull(row.rewardAmount),
    rewardLabel: row.rewardLabel,
    xpReward: row.xpReward,
    progressTarget: row.progressTarget,
    progressUnit: row.progressUnit,
    conditions: row.conditions,
    storeIds: stringArray(row.storeIds),
    periodFrom: iso(row.periodFrom),
    periodTo: iso(row.periodTo),
    budgetAmount: numberOrNull(row.budgetAmount),
    perGuestLimit: row.perGuestLimit,
    totalRewardLimit: row.totalRewardLimit,
    antiFraudRules: row.antiFraudRules,
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
  };
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
function mapReward(row: RewardRow): GuestGameReward {
  const walletState = rewardWalletState(row.status, row.expiresAt);

  return {
    id: row.id,
    status: row.status as RewardStatus,
    walletState,
    source: row.source as RewardSource,
    externalProvider: row.externalProvider,
    externalDomain: row.externalDomain,
    externalId: row.externalId,
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
    lootBox: row.lootBox,
    mission: row.mission,
    season: row.season,
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
    return `Миссия: ${reward.mission.name}`;
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
      return 'Миссия';
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

  const sessionMinutes =
    row.durationMinutes ??
    durationMinutes(row.startedAt, row.stoppedAt) ??
    null;
  const sessionPacket = row.packet ?? null;
  const sessionType = sessionPacket ? 'packet_hours' : 'regular_session';
  const guestName = snapshotGuestName(row.guest, row.externalGuestId);
  const facts: GuestGameSnapshotFact[] = [
    {
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
        row.packet ? 'пакет' : null,
        row.normalStop === false ? 'нестандартное завершение' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];

  if (sessionMinutes && sessionMinutes >= 30) {
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
      sessionMinutes,
      spendAmount: null,
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      label: `Игровое время: ${guestName}`,
      details: [
        row.store?.name,
        `${Math.round((sessionMinutes / 60) * 10) / 10} ч`,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  return facts;
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

function mapProductExpenseFact(
  row: SnapshotProductExpenseRow,
): GuestGameSnapshotFact[] {
  const revenue = numberValue(row.revenue);
  const cost = numberValue(row.cost);
  const quantity = numberValue(row.quantity);
  const productName =
    row.productNameAtSale ?? row.product?.name ?? row.externalProductId;
  const categoryName = row.product?.category?.name ?? null;
  const supplierName = row.product?.supplier?.name ?? null;
  const guestName = snapshotGuestName(row.guest, row.externalGuestId);

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
      spendAmount: Math.abs(revenue),
      tariffGroupId: null,
      tariffPeriodId: null,
      tariffTypeId: null,
      productId: row.productId,
      externalProductId: row.externalProductId,
      categoryId: row.product?.category?.id ?? null,
      productName,
      categoryName,
      supplierName,
      quantity,
      label: `Товарная покупка: ${productName ?? 'товар'} · ${guestName}`,
      details: [
        row.storeNameAtSale ?? row.store?.name,
        productName,
        categoryName,
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

  const minutes = Math.round(
    (stoppedAt.getTime() - startedAt.getTime()) / 60_000,
  );

  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
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

function booleanValue(value: unknown) {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }

  return false;
}

function nullableBooleanValue(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
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

function pipelineErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Не удалось обработать snapshot-факт.';
}

function buildProcessPayload(
  dto: GuestGameProcessEventDto,
  dryRun: GuestGameDryRunResult,
): Prisma.InputJsonObject {
  return {
    source: 'guest_gamification_process_event',
    langameWrite: false,
    sourceFactId: nullableString(dto.sourceFactId),
    sourceFactKind: nullableString(dto.sourceFactKind),
    externalProvider: nullableString(dto.externalProvider),
    externalDomain: nullableString(dto.externalDomain),
    externalId: nullableString(dto.externalId),
    store: dryRun.store,
    input: dryRun.input,
    summary: dryRun.summary,
    rules: dryRun.rules.map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      name: rule.name,
      eligible: rule.eligible,
      rewardType: rule.rewardType,
      rewardAmount: rule.rewardAmount,
      rewardLabel: rule.rewardLabel,
      selectedRewardLabel: rule.selectedRewardLabel,
      selectedReward: rule.selectedReward,
      xpDelta: rule.xpDelta,
      progress: rule.progress,
      blockers: rule.blockers,
    })),
  };
}

function shouldQueueProcessReward(rule: GuestGameDryRunRule) {
  if (!rule.eligible) {
    return false;
  }

  if (rule.kind === 'MISSION') {
    return Boolean(rule.rewardLabel || (rule.rewardAmount ?? 0) > 0);
  }

  if (rule.kind === 'SEASON') {
    return Boolean(
      rule.selectedRewardLabel ||
      rule.rewardLabel ||
      (rule.rewardAmount ?? 0) > 0,
    );
  }

  return Boolean(
    rule.rewardType ||
    rule.rewardLabel ||
    rule.selectedRewardLabel ||
    (rule.rewardAmount ?? 0) > 0,
  );
}

function shouldRecoverProcessRewards(
  dryRun: GuestGameDryRunResult,
  rewards: GuestGameReward[],
) {
  return rewards.length === 0 && dryRun.rules.some(shouldQueueProcessReward);
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
    ...rewardApprovalSessionRuleLines(lootBox.sessionType, periodRules),
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
      ? `Тип квеста: ${rewardApprovalMissionTypeLabel(mission.missionType)}`
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

function rewardApprovalSessionRuleLines(
  sessionType: string | null,
  rules: Record<string, unknown>,
) {
  const values: Array<string | null> = [];
  const normalizedSessionType = sessionType
    ? normalizeSessionType(sessionType)
    : null;
  const packetMode = nullableString(rules.packetMode)?.toUpperCase();

  if (normalizedSessionType && normalizedSessionType !== 'any') {
    values.push(
      `Тип сессии: ${
        rewardApprovalSessionTypeLabels[normalizedSessionType] ??
        rewardApprovalHumanToken(normalizedSessionType)
      }`,
    );
  }

  if (packetMode === 'PACKET_ONLY') {
    values.push('Пакет часов: только пакет');
  } else if (packetMode === 'NON_PACKET_ONLY') {
    values.push('Пакет часов: без пакета');
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
  const perGuestPerWeek = dryRunOptionalNumber(rules.perGuestPerWeek);
  const totalPerDay = dryRunOptionalNumber(rules.totalPerDay);
  const values: Array<string | null> = [];

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
    'Пакет часов не ограничен',
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
    return 'Миссия';
  }

  return 'Battle Pass';
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
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
  payload: Prisma.JsonValue | null;
}): GuestGameProgressEvent {
  const payload = jsonRecord(row.payload);
  const input = jsonRecord(payload.input as Prisma.JsonValue | null);
  const store = jsonRecord(payload.store as Prisma.JsonValue | null);

  return {
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    storeId: nullableString(store.id),
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
    storeId: context.storeId,
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
  profile: GuestGameProfile | null;
  guest: GuestGameProfile['guest'];
  storeId: string | null;
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
  categoryId: string | null;
  productName: string | null;
  categoryName: string | null;
  supplierName: string | null;
  quantity: number | null;
  rewards: GuestGameReward[];
  progressEvents: GuestGameProgressEvent[];
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
  appendDryRunStoreCheck(rule.storeIds, context.storeId, blockers, reasons);
  appendDryRunPeriodRules(
    rule.periodRules,
    context.occurredAt,
    blockers,
    reasons,
  );
  appendDryRunSessionConditionCheck(
    rule.sessionType,
    dryRunRecord(rule.periodRules).packetMode,
    context,
    blockers,
    reasons,
  );
  appendDryRunTariffConditionCheck(
    rule.periodRules,
    context,
    blockers,
    reasons,
  );
  appendDryRunGuestLogTypeCheck(rule.periodRules, context, blockers, reasons);
  appendDryRunBudgetCheck(
    rule.budgetAmount,
    rewardAmount,
    ruleRewards,
    blockers,
    reasons,
  );
  appendDryRunLootBoxLimits(rule, context, ruleRewards, blockers, reasons);

  if (rule.audience) {
    reasons.push(`Аудитория: ${rule.audience.name}`);
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
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType,
    rewardAmount,
    rewardLabel,
    selectedRewardLabel,
    selectedReward,
    xpDelta: 0,
    budgetAmount: rule.budgetAmount,
    progress: null,
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

  appendDryRunProfileCheck(context, blockers, reasons);
  appendDryRunStatusCheck(rule.status, blockers, reasons);
  appendDryRunTriggerCheck(rule.triggerKind, context.eventType, blockers);
  appendDryRunStoreCheck(rule.storeIds, context.storeId, blockers, reasons);
  appendDryRunDateBounds(
    rule.periodFrom,
    rule.periodTo,
    context.occurredAt,
    blockers,
    reasons,
  );
  appendDryRunMissionConditions(rule, context, blockers, reasons);
  const progress = appendDryRunMissionProgress(
    rule,
    context,
    blockers,
    reasons,
  );
  appendDryRunBudgetCheck(
    rule.budgetAmount,
    rule.rewardAmount ?? 0,
    ruleRewards,
    blockers,
    reasons,
  );
  appendDryRunMissionLimits(rule, context, ruleRewards, blockers, reasons);

  if (rule.audience) {
    reasons.push(`Аудитория: ${rule.audience.name}`);
  }
  if (rule.manualApprovalRequired) {
    reasons.push('Выдача требует подтверждения сотрудником');
  }

  return dryRunRuleResult({
    id: rule.id,
    kind: 'MISSION',
    name: rule.name,
    status: rule.status,
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel,
    selectedRewardLabel: rule.rewardLabel ?? rule.name,
    selectedReward: null,
    xpDelta: rule.xpReward,
    budgetAmount: rule.budgetAmount,
    progress,
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
  const xpDelta = dryRunSeasonXp(rule.xpRules, context);
  const selectedRewardLabel = dryRunSeasonRewardLabel(rule, context, xpDelta);

  appendDryRunProfileCheck(context, blockers, reasons);
  appendDryRunStatusCheck(rule.status, blockers, reasons);
  appendDryRunStoreCheck(rule.storeIds, context.storeId, blockers, reasons);
  appendDryRunDateBounds(
    rule.periodFrom,
    rule.periodTo,
    context.occurredAt,
    blockers,
    reasons,
  );
  appendDryRunSeasonXpRules(rule.xpRules, context, blockers, reasons);
  appendDryRunBudgetCheck(rule.budgetAmount, 0, ruleRewards, blockers, reasons);

  if (rule.audience) {
    reasons.push(`Аудитория: ${rule.audience.name}`);
  }
  if (rule.premiumEnabled) {
    reasons.push('Есть premium-дорожка');
  }
  if (rule.manualApprovalRequired) {
    reasons.push('Награды сезона требуют подтверждения сотрудником');
  }

  return dryRunRuleResult({
    id: rule.id,
    kind: 'SEASON',
    name: rule.name,
    status: rule.status,
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType: selectedRewardLabel ? 'BATTLE_PASS_REWARD' : null,
    rewardAmount: 0,
    rewardLabel: selectedRewardLabel,
    selectedRewardLabel,
    selectedReward: null,
    xpDelta,
    budgetAmount: rule.budgetAmount,
    progress: null,
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

function appendDryRunStoreCheck(
  storeIds: string[],
  storeId: string | null,
  blockers: string[],
  reasons: string[],
) {
  if (!storeIds.length) {
    reasons.push('Доступно для всей сети');
    return;
  }
  if (!storeId) {
    reasons.push(
      'Правило ограничено клубами, выберите клуб для точной проверки',
    );
    return;
  }
  if (!storeIds.includes(storeId)) {
    blockers.push('Выбранный клуб не входит в область правила');
    return;
  }

  reasons.push('Выбранный клуб входит в область правила');
}

function appendDryRunPeriodRules(
  value: unknown,
  occurredAt: Date,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);
  const weekdays = dryRunNumberArray(rules.weekdays);
  const weekday = occurredAt.getDay();
  const weekdaysOnly = rules.weekdaysOnly === true;

  if (weekdays.length && !weekdays.includes(weekday)) {
    blockers.push('День недели не входит в период правила');
  } else if (weekdaysOnly && (weekday === 0 || weekday === 6)) {
    blockers.push('Правило доступно только по будням');
  } else if (weekdays.length || weekdaysOnly) {
    reasons.push('День недели подходит');
  }

  const hours = dryRunStringArray(rules.hours);
  if (!hours.length) {
    return;
  }

  if (hours.some((window) => dryRunIsWithinTimeWindow(occurredAt, window))) {
    reasons.push(`Время входит в окно ${hours.join(', ')}`);
  } else {
    blockers.push(`Время не входит в окно ${hours.join(', ')}`);
  }
}

function appendDryRunSessionConditionCheck(
  sessionTypeValue: unknown,
  packetModeValue: unknown,
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

  const packetMode = dryRunString(packetModeValue)?.toUpperCase() ?? 'ANY';
  if (packetMode === 'ANY' || packetMode === 'ALL') {
    reasons.push('Пакет часов не ограничен');
    return;
  }

  if (context.sessionPacket == null) {
    blockers.push('Факт сессии не содержит признак пакета часов');
    return;
  }

  if (packetMode === 'PACKET_ONLY') {
    if (context.sessionPacket) {
      reasons.push('Сессия проходит по пакету часов');
    } else {
      blockers.push('Правило доступно только для пакетов часов');
    }
    return;
  }

  if (packetMode === 'NON_PACKET_ONLY') {
    if (!context.sessionPacket) {
      reasons.push('Сессия обычная, без пакета часов');
    } else {
      blockers.push('Правило доступно только для обычных сессий');
    }
  }
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
    conditions.packetMode,
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

  if (
    conditions.weekdaysOnly === true &&
    [0, 6].includes(context.occurredAt.getDay())
  ) {
    blockers.push('Миссия доступна только по будням');
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
  const progress = evaluateGuestGameProgress(
    {
      triggerKind: rule.triggerKind,
      progressTarget: rule.progressTarget,
      progressUnit: rule.progressUnit,
      conditions: rule.conditions,
      storeIds: rule.storeIds,
      periodFrom: rule.periodFrom,
      periodTo: rule.periodTo,
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
    `Прогресс миссии: ${progress.current}/${progress.target}${unit}${windowLabel}`,
  );

  if (!progress.completed) {
    blockers.push(
      `Цель миссии еще не выполнена: ${progress.current}/${progress.target}${unit}`,
    );
  }

  return progress;
}

function appendDryRunSeasonXpRules(
  value: unknown,
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  const rules = dryRunRecord(value);

  appendDryRunSessionConditionCheck(
    rules.sessionType,
    rules.packetMode,
    context,
    blockers,
    reasons,
  );
  appendDryRunTariffConditionCheck(rules, context, blockers, reasons);
  appendDryRunGuestLogTypeCheck(rules, context, blockers, reasons);

  if (dryRunOptionalNumber(rules.packetSessionBonus) != null) {
    reasons.push('Battle Pass учитывает бонус за пакет часов');
  }
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
  blockers: string[],
  reasons: string[],
) {
  const limits = dryRunRecord(rule.limits);
  const perGuestPerWeek = dryRunOptionalNumber(limits.perGuestPerWeek);
  const totalPerDay = dryRunOptionalNumber(limits.totalPerDay);
  const restartedAt = dryRunDateOrNull(limits.restartedAt);
  const limitRewards = restartedAt
    ? rewards.filter(
        (reward) =>
          new Date(reward.qualifiedAt).getTime() >= restartedAt.getTime(),
      )
    : rewards;

  if (perGuestPerWeek != null) {
    const guestRewards = limitRewards.filter((reward) =>
      dryRunRewardMatchesGuest(reward, context),
    );
    const weeklyCount = guestRewards.filter((reward) =>
      dryRunIsWithinLastDays(reward.qualifiedAt, context.occurredAt, 7),
    ).length;

    if (!context.profile && !context.guest) {
      blockers.push('Для проверки лимита на гостя выберите профиль или гостя');
    } else if (weeklyCount >= perGuestPerWeek) {
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
    const dayCount = limitRewards.filter((reward) =>
      dryRunIsSameDay(reward.qualifiedAt, context.occurredAt),
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

function appendDryRunMissionLimits(
  rule: GuestGameMission,
  context: DryRunContext,
  rewards: GuestGameReward[],
  blockers: string[],
  reasons: string[],
) {
  if (rule.perGuestLimit != null) {
    const guestCount = rewards.filter((reward) =>
      dryRunRewardMatchesGuest(reward, context),
    ).length;

    if (!context.profile && !context.guest) {
      blockers.push('Для проверки лимита на гостя выберите профиль или гостя');
    } else if (guestCount >= rule.perGuestLimit) {
      blockers.push(
        `Лимит миссии на гостя исчерпан: ${guestCount}/${rule.perGuestLimit}`,
      );
    } else {
      reasons.push(
        `Лимит миссии на гостя: ${guestCount}/${rule.perGuestLimit}`,
      );
    }
  }

  if (rule.totalRewardLimit != null) {
    if (rewards.length >= rule.totalRewardLimit) {
      blockers.push(
        `Общий лимит наград миссии исчерпан: ${rewards.length}/${rule.totalRewardLimit}`,
      );
    } else {
      reasons.push(
        `Общий лимит наград миссии: ${rewards.length}/${rule.totalRewardLimit}`,
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

function dryRunSeasonXp(value: unknown, context: DryRunContext) {
  const rules = dryRunRecord(value);
  const eventType = context.eventType.toUpperCase();
  const packetBonus =
    context.sessionPacket === true
      ? dryRunNumber(rules.packetSessionBonus, 0)
      : 0;

  if (eventType === 'PLAY_HOUR' || eventType === 'SESSION_STOP') {
    return Math.round(
      dryRunNumber(rules.playHour, 0) *
        Math.max(1, context.sessionMinutes / 60) +
        packetBonus,
    );
  }
  if (eventType === 'BAR_PURCHASE' || eventType === 'PRODUCT_PURCHASE') {
    return Math.round(dryRunNumber(rules.barPurchase, 0));
  }
  if (eventType === 'MISSION_COMPLETED') {
    return Math.round(dryRunNumber(rules.missionCompletion, 0));
  }
  if (eventType === 'CHECK_IN') {
    return Math.round(
      dryRunNumber(rules.checkIn, dryRunNumber(rules.visit, 0)) + packetBonus,
    );
  }
  if (eventType === 'SESSION_START' || eventType === 'VISIT') {
    return Math.round(dryRunNumber(rules.visit, 0) + packetBonus);
  }
  if (eventType === 'GUEST_LOG' && context.guestLogType) {
    return Math.round(dryRunNumber(rules.guestLog, 0));
  }

  return 0;
}

function dryRunSeasonRewardLabel(
  rule: GuestGameSeason,
  context: DryRunContext,
  xpDelta: number,
) {
  const levels = Array.isArray(rule.levels) ? rule.levels : [];
  const currentXp = context.profile?.xp ?? 0;
  const nextXp = currentXp + xpDelta;
  const nextLevel = levels
    .map((item) => dryRunRecord(item))
    .map((item) => ({
      level: dryRunNumber(item.level, 0),
      xp: dryRunNumber(item.xp, 0),
      freeReward: dryRunString(item.freeReward),
      premiumReward: dryRunString(item.premiumReward),
    }))
    .filter((item) => item.xp > currentXp && item.xp <= nextXp)
    .sort((left, right) => left.xp - right.xp)[0];

  if (!nextLevel) {
    return null;
  }

  return [nextLevel.freeReward, nextLevel.premiumReward]
    .filter(Boolean)
    .join(' + ');
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
  return value.trim().toLowerCase().replace(/\s+/g, '_');
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

function dryRunIsWithinTimeWindow(date: Date, window: string) {
  const [from, to] = window.split('-').map((part) => part.trim());
  const fromMinutes = dryRunTimeToMinutes(from);
  const toMinutes = dryRunTimeToMinutes(to);

  if (fromMinutes == null || toMinutes == null) {
    return true;
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (fromMinutes <= toMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  }

  return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
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

function dryRunIsSameDay(value: string, reference: Date) {
  const date = new Date(value);

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function dryRunIsWithinLastDays(value: string, reference: Date, days: number) {
  const date = new Date(value);
  const diff = reference.getTime() - date.getTime();

  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
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
          rewardLabel: visualString(itemRecord.rewardLabel, 'Награда клуба'),
          condition: visualString(itemRecord.condition, 'Активность в клубе'),
          limitPerGuest: visualIntOrNull(itemRecord.limitPerGuest, 1, 1000),
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
            visualString(itemRecord.name, 'Квест'),
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
          rewardLabel: visualString(itemRecord.rewardLabel, 'Награда за квест'),
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

  return {
    id: rule.id,
    title: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    rewardType: canonicalLootBoxRewardType(rule.rewardType),
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel ?? rule.name,
    condition: visualLootBoxCondition(
      visualString(periodRules.condition, ''),
      rule.triggerKind,
    ),
    limitPerGuest: visualIntOrNull(
      limits.perGuest ?? limits.perGuestPerWeek,
      1,
      1000,
    ),
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

function buildVisualSeasonData(
  user: AuthenticatedUser,
  storeIds: string[],
  payload: GuestGameVisualEditorPayload,
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
    levels: buildVisualSeasonLevels(battlePass),
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
) {
  const rewardType = canonicalLootBoxRewardType(item.rewardType);

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
      source: 'visual_editor',
      ...(item.limitPerGuest == null
        ? {}
        : {
            perGuest: item.limitPerGuest,
            perGuestPerWeek: item.limitPerGuest,
          }),
    },
    probabilityRules: {
      type: 'single',
      source: 'visual_editor',
      prizes: [
        {
          rewardType,
          rewardAmount: item.rewardAmount ?? 0,
          rewardLabel: item.rewardLabel,
          weight: 100,
          chancePercent: 100,
        },
      ],
      items: [{ label: item.rewardLabel, weight: 100 }],
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
    metadata: { source: 'visual_editor' },
  });
}

function buildVisualCheckInMissionData(
  user: AuthenticatedUser,
  storeId: string,
  checkIn: GuestGameVisualEditorCheckIn,
) {
  const bonusMode = checkIn.rewardMode === 'BONUS';
  const amount = bonusMode ? (checkIn.bonusAmount ?? 0) : 0;
  const xp = checkIn.rewardMode === 'XP' ? (checkIn.xp ?? 0) : 0;

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
    storeIds: [storeId],
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
    rewardStatus: {
      state: 'IN_PROGRESS',
      label: 'Награда впереди',
      hint: 'Квест доступен в выбранном клубе.',
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
    tenant: { name: user.tenantSlug ?? 'LeetPlus', slug: user.tenantSlug },
    store: {
      id: store.id,
      name: store.name,
      publicSlug: store.publicSlug,
      city: store.city,
      address: store.address,
      latitude: store.latitude == null ? null : Number(store.latitude),
      longitude: store.longitude == null ? null : Number(store.longitude),
      yandexMapsUrl: null,
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
    promoCards: {
      total: payload.promoCards.length,
      featured: payload.promoCards.slice(0, 3).map((item, index) => ({
        id: item.id ?? `preview-promo-${index}`,
        label: item.label,
        title: item.title,
        description: item.description,
        tag: item.tag,
        targetAnchor: item.targetAnchor,
        periodTo: item.periodTo,
      })),
    },
    lootBoxes: {
      total: payload.lootBoxes.length,
      featured: payload.lootBoxes.slice(0, 3).map((item, index) => ({
        id: item.id ?? `preview-loot-${index}`,
        name: item.title,
        triggerKind: item.triggerKind,
        rewardLabel: item.rewardLabel,
        rewardType: canonicalLootBoxRewardType(item.rewardType),
        manualApprovalRequired: false,
        note: null,
        openState: 'WAITING_EVENT',
        openable: false,
        openBlocker: 'Предпросмотр не открывает лутбоксы.',
        weeklyOpenedCount: 0,
        weeklyLimit: null,
        dailyOpenedCount: 0,
        dailyLimit: null,
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
        nextStepLabel: payload.checkIn.enabled ? 'Чекин' : 'Квест',
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
          label: 'Квест',
          status: payload.missions.length ? 'CURRENT' : 'WAITING',
          hint: 'Квесты показываются после публикации.',
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
        reached: level === 1,
        current: level === 1,
        next: level === 2,
      };
    },
  );
  const next = levels.find((item) => item.next) ?? null;

  return {
    id: battlePass.id ?? 'preview-season',
    name: battlePass.title,
    currentLevel: 1,
    nextLevel: next?.level ?? null,
    progressPercent: 0,
    xpToNextLevel: next?.xp ?? null,
    nextRewardLabel: next?.freeReward ?? battlePass.mainPrize,
    readyRewards: 0,
    waitingApprovalRewards: 0,
    levels,
  };
}

function ruleMatchesStoreIds(storeIds: string[], storeId: string | null) {
  return !storeIds.length || Boolean(storeId && storeIds.includes(storeId));
}

function visualRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function visualArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
