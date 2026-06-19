import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import {
  GuestBonusLedgerSchedulerService,
  type GuestBonusLedgerSchedulerRuntimeStatus,
} from './guest-bonus-ledger-scheduler.service';

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
    title: 'РўР°СЂРёС„С‹ РїРѕ РґРЅСЏРј',
    description:
      'Р”РЅРё РЅРµРґРµР»Рё Рё РѕРіСЂР°РЅРёС‡РµРЅРёСЏ РїРµСЂРёРѕРґР° РґР»СЏ РјРёСЃСЃРёР№ Рё loot box.',
  },
  {
    endpointKey: 'tariffsGroups',
    endpointPath: '/tariffs/groups/list',
    title: 'Р“СЂСѓРїРїС‹ С‚Р°СЂРёС„РѕРІ',
    description:
      'Р“СЂСѓРїРїС‹ С‚Р°СЂРёС„РѕРІ Рё РїР°РєРµС‚РѕРІ РґР»СЏ СѓСЃР»РѕРІРёР№ СЃРµСЃСЃРёР№.',
  },
  {
    endpointKey: 'tariffsTimePeriod',
    endpointPath: '/tariffs/time_period/list',
    title: 'РўР°СЂРёС„РЅС‹Рµ РїРµСЂРёРѕРґС‹',
    description:
      'РћРєРЅР° С‚РёС…РёС… С‡Р°СЃРѕРІ, РЅРѕС‡РЅС‹С… РїР°РєРµС‚РѕРІ Рё СЃРїРµС†РёР°Р»СЊРЅС‹С… РїРµСЂРёРѕРґРѕРІ.',
  },
  {
    endpointKey: 'tariffsTypesGroups',
    endpointPath: '/tariffs/types_groups/list',
    title: 'РўРёРїС‹ С‚Р°СЂРёС„РЅС‹С… РіСЂСѓРїРї',
    description:
      'РўРёРїС‹ С‚Р°СЂРёС„РѕРІ РґР»СЏ СЂР°Р·РґРµР»РµРЅРёСЏ РѕР±С‹С‡РЅРѕР№ РёРіСЂС‹ Рё РїР°РєРµС‚РѕРІ С‡Р°СЃРѕРІ.',
  },
] as const;

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
  lootBox: { select: { id: true, name: true, status: true } },
  mission: { select: { id: true, name: true, status: true, xpReward: true } },
  season: { select: { id: true, name: true, status: true } },
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
  category: { select: { name: true } },
  supplier: { select: { name: true } },
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
};

export type GuestGameProcessEventDto = GuestGameDryRunDto & {
  sourceFactId?: string | null;
  sourceFactKind?: string | null;
  externalProvider?: string | null;
  externalDomain?: string | null;
  externalId?: string | null;
  note?: string | null;
};

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
  xpDelta: number;
  budgetAmount: number | null;
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
      return 'РСЃС‚РѕС‡РЅРёРє РіРѕС‚РѕРІ: РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РєР°Рє РїСЂРѕРІРµСЂРµРЅРЅС‹Р№ С‚Р°СЂРёС„РЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚ РґР»СЏ РїСЂР°РІРёР».';
    case 'PARTIAL':
      return 'Р§Р°СЃС‚СЊ РєР»СѓР±РѕРІ РµС‰Рµ РЅРµ РґР°Р»Р° СѓСЃРїРµС€РЅС‹Р№ snapshot. РћР±РЅРѕРІРёС‚Рµ endpoint РІ /sync РїРµСЂРµРґ С‚РѕС‡РЅС‹Рј Р·Р°РїСѓСЃРєРѕРј.';
    case 'STALE':
      return 'Snapshot СѓСЃС‚Р°СЂРµР» СЃС‚Р°СЂС€Рµ СЃСѓС‚РѕРє. РџРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј РїСЂР°РІРёР» РѕР±РЅРѕРІРёС‚Рµ С‚Р°СЂРёС„РЅС‹Рµ endpoints РІ /sync.';
    case 'FAILED':
      return 'РџРѕСЃР»РµРґРЅРёР№ snapshot РЅРµСѓСЃРїРµС€РµРЅ. РЎРЅР°С‡Р°Р»Р° СЂР°Р·Р±РµСЂРёС‚Рµ РѕС€РёР±РєСѓ endpoint РІ /sync.';
    case 'UNPROFILED':
    default:
      return 'Snapshot РµС‰Рµ РЅРµ СЃРѕР·РґР°РЅ. РЎРЅР°С‡Р°Р»Р° РїСЂРѕС„РёР»РёСЂСѓР№С‚Рµ Рё СЃРѕС…СЂР°РЅРёС‚Рµ endpoint РІ /sync.';
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
      ? 'РџРµСЂРІРѕРµ РЅР°С‡РёСЃР»РµРЅРёРµ СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ: СЃРЅР°С‡Р°Р»Р° Р·Р°РІРµСЂС€РёС‚Рµ СЃРІРµСЂРєСѓ Р±Р°Р»Р°РЅСЃР°.'
      : stage === 'READY'
        ? 'РџРёР»РѕС‚ СѓР¶Рµ РїСЂРѕС€РµР» live-write Рё СЃРІРµСЂРєСѓ.'
        : null;
  const ledgerBaseDisabledReason = !canRunCanary
    ? 'РЎРЅР°С‡Р°Р»Р° РЅСѓР¶РµРЅ С‚РµСЃС‚РѕРІС‹Р№ event/process-event РёР»Рё approved reward.'
    : bonusRewards <= 0
      ? 'РќСѓР¶РЅР° approved bonus-РЅР°РіСЂР°РґР°, РєРѕС‚РѕСЂР°СЏ РїРѕРїР°РґРµС‚ РІ bonus ledger.'
      : stageClosedReason;
  const queueLedgerDisabledReason =
    ledgerBaseDisabledReason ??
    (ledgerPreflight.readyCount > 0
      ? 'Р’ pilot ledger СѓР¶Рµ РµСЃС‚СЊ РіРѕС‚РѕРІР°СЏ Р·Р°РїРёСЃСЊ: РЅРµ СЃС‚Р°РІСЊС‚Рµ РЅРѕРІСѓСЋ РїРµСЂРµРґ canary.'
      : null);
  const dryRunLedgerDisabledReason =
    ledgerBaseDisabledReason ??
    (ledgerPreflight.readyCount === 0
      ? 'РЎРЅР°С‡Р°Р»Р° РїРѕСЃС‚Р°РІСЊС‚Рµ СЂРѕРІРЅРѕ РѕРґРЅСѓ approved bonus-РЅР°РіСЂР°РґСѓ 1337 РІ ledger.'
      : ledgerPreflight.readyCount > 1
        ? 'РџРµСЂРµРґ dry-run/canary РѕСЃС‚Р°РІСЊС‚Рµ СЂРѕРІРЅРѕ РѕРґРЅСѓ РіРѕС‚РѕРІСѓСЋ ledger-Р·Р°РїРёСЃСЊ РїРѕ 1337.'
        : null);
  const liveDisabledReason =
    ledgerPreflight.readyCount === 0
      ? 'Р’ pilot ledger РЅРµС‚ РіРѕС‚РѕРІРѕР№ Р·Р°РїРёСЃРё РїРѕ 1337 РґР»СЏ canary.'
      : ledgerPreflight.readyCount > 1
        ? 'Р’ pilot ledger Р±РѕР»СЊС€Рµ РѕРґРЅРѕР№ РіРѕС‚РѕРІРѕР№ Р·Р°РїРёСЃРё РїРѕ 1337: canary Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ.'
        : 'РќСѓР¶РЅС‹ canary-РЅР°РіСЂР°РґР°, РіРѕС‚РѕРІС‹Р№ scheduler Рё РІРєР»СЋС‡РµРЅРЅС‹Р№ Langame write-С„Р»Р°Рі.';

  return [
    {
      key: 'OPEN_DRY_RUN',
      label: 'РћС‚РєСЂС‹С‚СЊ dry-run',
      enabled: canRunDryRun && stage !== 'READY',
      tone: 'SECONDARY',
      disabledReason:
        canRunDryRun && stage !== 'READY'
          ? null
          : canRunDryRun
            ? 'РџРёР»РѕС‚ СѓР¶Рµ РїСЂРѕС€РµР» Р±Р°Р·РѕРІС‹Р№ dry-run.'
            : 'РЎРЅР°С‡Р°Р»Р° Р·Р°РєСЂРѕР№С‚Рµ Р±Р°Р·РѕРІС‹Рµ СѓСЃР»РѕРІРёСЏ СЂРµРіРёСЃС‚СЂР°С†РёРё, OTP, РїСЂРѕС„РёР»СЏ, Langame-СЃРІСЏР·РєРё Рё Р°РєС‚РёРІРЅРѕРіРѕ РїСЂР°РІРёР»Р°.',
    },
    {
      key: 'QUEUE_BONUS_LEDGER',
      label: 'РџРѕСЃС‚Р°РІРёС‚СЊ РІ ledger',
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
            ? 'Live-write СѓР¶Рµ РЅРµ СЏРІР»СЏРµС‚СЃСЏ С‚РµРєСѓС‰РµР№ СЃС‚Р°РґРёРµР№ РїРёР»РѕС‚Р°.'
            : liveDisabledReason,
    },
    {
      key: 'RECONCILE_BALANCE',
      label: 'РћС‚РєСЂС‹С‚СЊ СЃРІРµСЂРєСѓ',
      enabled: canReconcile,
      tone: 'SECONDARY',
      disabledReason: canReconcile
        ? null
        : 'РЎРІРµСЂРєР° РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ confirmed ledger-РЅР°С‡РёСЃР»РµРЅРёСЏ Langame.',
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
    ? 'РџРѕРґРіРѕС‚РѕРІРёС‚СЊ approved reward СЃ Р±РѕРЅСѓСЃРЅС‹Рј rewardType, С‡С‚РѕР±С‹ РѕРЅ РїРѕРїР°Р» РІ bonus ledger, Р° РЅРµ РІ СЂСѓС‡РЅСѓСЋ РІС‹РґР°С‡Сѓ.'
    : ledgerPreflight.readyCount === 0
      ? 'РџРѕСЃС‚Р°РІРёС‚СЊ СЂРѕРІРЅРѕ РѕРґРЅСѓ approved bonus-РЅР°РіСЂР°РґСѓ 1337 РІ ledger Рё РІС‹РїРѕР»РЅРёС‚СЊ dry-run dispatcher.'
      : ledgerPreflight.readyCount > 1
        ? 'РџРµСЂРµРґ live-write РѕС‚РјРµРЅРёС‚СЊ РёР»Рё СЂР°Р·РѕР±СЂР°С‚СЊ Р»РёС€РЅРёРµ pending/retry ledger-Р·Р°РїРёСЃРё 1337, РѕСЃС‚Р°РІРёРІ СЂРѕРІРЅРѕ РѕРґРЅСѓ.'
        : bonusLedgerAutonomousReady
          ? 'Р’С‹РїРѕР»РЅРёС‚СЊ dry-run ledger РїРѕ РµРґРёРЅСЃС‚РІРµРЅРЅРѕР№ Р·Р°РїРёСЃРё 1337, Р·Р°С‚РµРј Р·Р°РїСѓСЃРєР°С‚СЊ canary live dispatch.'
          : 'РџСЂРѕРІРµСЂРёС‚СЊ scheduler/write-С„Р»Р°РіРё Рё РІС‹РїРѕР»РЅРёС‚СЊ dry-run ledger РїРѕ РµРґРёРЅСЃС‚РІРµРЅРЅРѕР№ Р·Р°РїРёСЃРё 1337.';

  const safeguards = [
    'Р”Рѕ live-СЃС‚Р°РґРёРё РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ С‚РѕР»СЊРєРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рµ С„Р°РєС‚С‹ LeetPlus Рё dry-run Р±РµР· Р·Р°РїРёСЃРё РІ Langame.',
    'РџРµСЂРІС‹Р№ live-write РґРѕР»Р¶РµРЅ РёРґС‚Рё РєР°Рє canary: РѕРґРЅР° Р±РѕРЅСѓСЃРЅР°СЏ РЅР°РіСЂР°РґР°, РѕРґРёРЅ РіРѕСЃС‚СЊ, РѕРґРёРЅ РєР»СѓР± 1337.',
    'Live canary СЂР°Р·Р±Р»РѕРєРёСЂСѓРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РµСЃР»Рё preflight РІРёРґРёС‚ СЂРѕРІРЅРѕ РѕРґРЅСѓ РіРѕС‚РѕРІСѓСЋ ledger-Р·Р°РїРёСЃСЊ РІ scope РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р°.',
    'Raw phone Рё С‚РѕРєРµРЅС‹ РЅРµ РїРѕРїР°РґР°СЋС‚ РІ UI; ledger Рё delivery РїРѕРєР°Р·С‹РІР°СЋС‚ РјР°СЃРєРё Рё Р±РµР·РѕРїР°СЃРЅС‹Рµ СЃС‚Р°С‚СѓСЃС‹.',
    'РџРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Langame РѕР±СЏР·Р°С‚РµР»СЊРЅР° СЃРІРµСЂРєР° GuestBonusBalanceCurrent СЃ РЅРѕРІС‹Рј snapshot.',
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
      stageLabel: 'РЎС‚РѕРї',
      canRunDryRun,
      canRunCanary,
      canRunLive,
      canReconcile,
      blockers: prerequisiteBlockerTitles,
      safeguards,
      nextAction:
        prerequisiteBlockers[0]?.nextAction ??
        'Р—Р°РєСЂС‹С‚СЊ Р±Р»РѕРєРµСЂС‹ РїРёР»РѕС‚РЅРѕРіРѕ С‡РµРє-Р»РёСЃС‚Р°.',
      note: 'РџРёР»РѕС‚РЅС‹Р№ РїСЂРѕРіРѕРЅ РїРµСЂРІРѕРіРѕ Р±РѕРЅСѓСЃР° РЅРµР»СЊР·СЏ Р·Р°РїСѓСЃРєР°С‚СЊ, РїРѕРєР° РЅРµ Р·Р°РєСЂС‹С‚С‹ Р±Р°Р·РѕРІС‹Рµ СѓСЃР»РѕРІРёСЏ СЂРµРіРёСЃС‚СЂР°С†РёРё, OTP, РїСЂРѕС„РёР»СЏ, СЃРІСЏР·РєРё СЃ Langame, Р°РєС‚РёРІРЅРѕРіРѕ РїСЂР°РІРёР»Р° Рё РѕР±СЏР·Р°С‚РµР»СЊРЅС‹С… snapshot-С„Р°РєС‚РѕРІ.',
    });
  }

  if (firstBonusReconciliation.status === 'MATCHED') {
    return withActions({
      stage: 'READY',
      stageLabel: 'Р“РѕС‚РѕРІРѕ',
      canRunDryRun,
      canRunCanary,
      canRunLive: false,
      canReconcile,
      blockers: [],
      safeguards,
      nextAction:
        'РЎРѕС…СЂР°РЅРёС‚СЊ РїРёР»РѕС‚ 1337 РєР°Рє СЌС‚Р°Р»РѕРЅРЅС‹Р№ СЃС†РµРЅР°СЂРёР№ Рё СЂР°СЃС€РёСЂСЏС‚СЊ Р»РёРјРёС‚ РЅР°С‡РёСЃР»РµРЅРёР№ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё Р¶СѓСЂРЅР°Р»Р°.',
      note: 'РџСѓС‚СЊ РїРµСЂРІРѕРіРѕ bonus_balance РЅР°С‡РёСЃР»РµРЅРёСЏ РїСЂРѕС€РµР» РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Langame Рё РїРѕСЃР»РµРґСѓСЋС‰РµР№ СЃРІРµСЂРєРё Р±Р°Р»Р°РЅСЃР°.',
    });
  }

  if (
    firstBonusReconciliation.status === 'WAITING_SYNC' ||
    firstBonusReconciliation.status === 'MISMATCH'
  ) {
    return withActions({
      stage: 'RECONCILIATION',
      stageLabel: 'РЎРІРµСЂРєР°',
      canRunDryRun,
      canRunCanary,
      canRunLive: false,
      canReconcile,
      blockers: downstreamBlockerTitles,
      safeguards,
      nextAction: firstBonusReconciliation.nextAction,
      note: 'РџРµСЂРІРѕРµ РЅР°С‡РёСЃР»РµРЅРёРµ СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ Langame; СЃР»РµРґСѓСЋС‰РёР№ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ СЌС‚Р°Рї - СЃРІРµСЂРєР° Р±Р°Р»Р°РЅСЃР° Рё РѕС‚СЃСѓС‚СЃС‚РІРёРµ СЂР°СЃС…РѕР¶РґРµРЅРёР№.',
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
        'РџСЂРѕРіРЅР°С‚СЊ dry-run/process-event РЅР° С‚РµСЃС‚РѕРІРѕРј РіРѕСЃС‚Рµ 1337 Рё СѓР±РµРґРёС‚СЊСЃСЏ, С‡С‚Рѕ РїСЂР°РІРёР»Рѕ СЃРѕР·РґР°РµС‚ РѕР¶РёРґР°РµРјСѓСЋ Р±РѕРЅСѓСЃРЅСѓСЋ РЅР°РіСЂР°РґСѓ Р±РµР· Р·Р°РїРёСЃРё РІ Langame.',
      note: 'Р‘Р°Р·РѕРІС‹Рµ СѓСЃР»РѕРІРёСЏ РіРѕС‚РѕРІС‹; С‚РµРїРµСЂСЊ РЅСѓР¶РµРЅ РєРѕРЅС‚СЂРѕР»РёСЂСѓРµРјС‹Р№ С‚РµСЃС‚ СЃРѕР±С‹С‚РёСЏ Рё РїСЂРѕРІРµСЂРєР° idempotency РґРѕ РѕС‡РµСЂРµРґРё Р±РѕРЅСѓСЃРѕРІ.',
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
      note: 'Р•СЃС‚СЊ С‚РµСЃС‚РѕРІР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ РёР»Рё РЅР°РіСЂР°РґР°, РЅРѕ РґРѕ live-write РЅСѓР¶РµРЅ Р±РµР·РѕРїР°СЃРЅС‹Р№ canary С‡РµСЂРµР· ledger dry-run Рё РїСЂРѕРІРµСЂРєСѓ scheduler/write-С„Р»Р°РіРѕРІ.',
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
      'Р—Р°РїСѓСЃС‚РёС‚СЊ РїРµСЂРІС‹Р№ live-write С‚РѕР»СЊРєРѕ РЅР° РѕРґРЅРѕР№ Р±РѕРЅСѓСЃРЅРѕР№ РЅР°РіСЂР°РґРµ 1337, Р·Р°С‚РµРј СЃСЂР°Р·Сѓ РїСЂРѕРІРµСЂРёС‚СЊ ledger status Рё Р¶РґР°С‚СЊ СЃРІРµР¶РёР№ snapshot Р±Р°Р»Р°РЅСЃР°.',
    note: 'Р’СЃРµ СѓСЃР»РѕРІРёСЏ РґР»СЏ РїРµСЂРІРѕРіРѕ Р±РѕРµРІРѕРіРѕ РЅР°С‡РёСЃР»РµРЅРёСЏ РµСЃС‚СЊ; СЂРµР¶РёРј РґРѕР»Р¶РµРЅ РѕСЃС‚Р°РІР°С‚СЊСЃСЏ canary РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕР№ СЃРІРµСЂРєРё Р±Р°Р»Р°РЅСЃР°.',
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
      statusLabel: 'РЅРµС‚ РєР»СѓР±Р°',
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
      note: 'Preflight РЅРµ РјРѕР¶РµС‚ РїСЂРѕРІРµСЂРёС‚СЊ bonus ledger Р±РµР· РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р°.',
      nextAction:
        'Р’С‹Р±СЂР°С‚СЊ Р°РєС‚РёРІРЅС‹Р№ РєР»СѓР± 1337 РёР»Рё РІРєР»СЋС‡РёС‚СЊ РіРµР№РјРёС„РёРєР°С†РёСЋ Сѓ РїРёР»РѕС‚РЅРѕР№ С‚РѕС‡РєРё.',
    };
  }

  if (readyCount === 1) {
    return {
      status: 'READY',
      statusLabel: '1 РіРѕС‚РѕРІР°',
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
      note: 'Р’ pilot ledger РµСЃС‚СЊ СЂРѕРІРЅРѕ РѕРґРЅР° Р·Р°РїРёСЃСЊ, РєРѕС‚РѕСЂСѓСЋ canary dispatch РјРѕР¶РµС‚ Р·Р°Р±СЂР°С‚СЊ РїРѕ scope РєР»СѓР±Р°.',
      nextAction:
        'Р’С‹РїРѕР»РЅРёС‚СЊ ledger dry-run Рё Р·Р°РїСѓСЃРєР°С‚СЊ canary live dispatch С‚РѕР»СЊРєРѕ РґР»СЏ СЌС‚РѕР№ Р·Р°РїРёСЃРё.',
    };
  }

  if (readyCount > 1) {
    return {
      status: 'MULTIPLE',
      statusLabel: 'РґСѓР±Р»РёРєР°С‚С‹',
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
      note: 'Р’ scope РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р° Р±РѕР»СЊС€Рµ РѕРґРЅРѕР№ РіРѕС‚РѕРІРѕР№ ledger-Р·Р°РїРёСЃРё: РїРµСЂРІС‹Р№ Langame write РїРµСЂРµСЃС‚Р°РµС‚ Р±С‹С‚СЊ canary.',
      nextAction:
        'РћС‚РјРµРЅРёС‚СЊ РёР»Рё СЂР°Р·РѕР±СЂР°С‚СЊ Р»РёС€РЅРёРµ pending/retry Р·Р°РїРёСЃРё РїРѕ 1337, РѕСЃС‚Р°РІРёРІ СЂРѕРІРЅРѕ РѕРґРЅСѓ РґР»СЏ РїРµСЂРІРѕРіРѕ write.',
    };
  }

  if (freshProcessingCount > 0) {
    return {
      status: 'PROCESSING',
      statusLabel: 'РѕР±СЂР°Р±РѕС‚РєР°',
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
      note: 'РџРѕ РїРёР»РѕС‚РЅРѕРјСѓ РєР»СѓР±Сѓ СѓР¶Рµ РµСЃС‚СЊ СЃРІРµР¶Р°СЏ PROCESSING-Р·Р°РїРёСЃСЊ; live canary Р¶РґРµС‚ Р·Р°РІРµСЂС€РµРЅРёСЏ РёР»Рё stale-lock.',
      nextAction:
        'Р”РѕР¶РґР°С‚СЊСЃСЏ Р·Р°РІРµСЂС€РµРЅРёСЏ worker РёР»Рё РїСЂРѕС‚СѓС…Р°РЅРёСЏ lock РїРµСЂРµРґ РЅРѕРІС‹Рј canary-РґРµР№СЃС‚РІРёРµРј.',
    };
  }

  if (failedWaitingRetryCount > 0) {
    return {
      status: 'WAITING_RETRY',
      statusLabel: 'Р¶РґРµС‚ retry',
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
      note: 'Р•СЃС‚СЊ failed ledger-Р·Р°РїРёСЃСЊ РїРѕ 1337, РЅРѕ nextAttemptAt РµС‰Рµ РЅРµ РЅР°СЃС‚СѓРїРёР» РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕРіРѕ retry.',
      nextAction:
        'Р”РѕР¶РґР°С‚СЊСЃСЏ nextAttemptAt РёР»Рё РІСЂСѓС‡РЅСѓСЋ РѕС‚РјРµРЅРёС‚СЊ РѕС€РёР±РѕС‡РЅСѓСЋ Р·Р°РїРёСЃСЊ РїРµСЂРµРґ РїРѕСЃС‚Р°РЅРѕРІРєРѕР№ РЅРѕРІРѕР№.',
    };
  }

  return {
    status: 'EMPTY',
    statusLabel: 'РїСѓСЃС‚Рѕ',
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
    note: 'Р’ pilot ledger РїРѕРєР° РЅРµС‚ РіРѕС‚РѕРІРѕР№ Р·Р°РїРёСЃРё РїРѕ РєР»СѓР±Сѓ 1337 РґР»СЏ РїРµСЂРІРѕРіРѕ Langame write.',
    nextAction:
      'РџРѕСЃС‚Р°РІРёС‚СЊ РѕРґРЅСѓ approved bonus-РЅР°РіСЂР°РґСѓ РІ ledger, Р·Р°С‚РµРј РІС‹РїРѕР»РЅРёС‚СЊ dry-run Рё canary.',
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
      statusLabel: 'РЅРµС‚ РєР»СѓР±Р°',
      ready: false,
      scopedStoreId: null,
      scopedStoreName: null,
      ledgerEntry: null,
      metric: 'РєР»СѓР± РЅРµ РІС‹Р±СЂР°РЅ',
      note: 'РџРµСЂРІСѓСЋ СЃРІРµСЂРєСѓ bonus_balance РЅРµР»СЊР·СЏ РїСЂРѕРІРµСЂРёС‚СЊ Р±РµР· РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р°.',
      nextAction:
        'Р’С‹Р±СЂР°С‚СЊ Р°РєС‚РёРІРЅС‹Р№ РєР»СѓР± 1337 РёР»Рё РІРєР»СЋС‡РёС‚СЊ РіРµР№РјРёС„РёРєР°С†РёСЋ Сѓ РїРёР»РѕС‚РЅРѕР№ С‚РѕС‡РєРё.',
    };
  }

  if (!ledgerEntry) {
    return {
      status: 'WAITING_LIVE',
      statusLabel: 'Р¶РґРµС‚ live',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: null,
      metric: '0 confirmed bonus_balance',
      note: 'Р’ scope РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р° РµС‰Рµ РЅРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ РїРѕР»РѕР¶РёС‚РµР»СЊРЅРѕРіРѕ bonus_balance РЅР°С‡РёСЃР»РµРЅРёСЏ С‡РµСЂРµР· Langame.',
      nextAction:
        'Р”РѕРІРµСЃС‚Рё canary РґРѕ РѕРґРЅРѕРіРѕ confirmed bonus_balance РЅР°С‡РёСЃР»РµРЅРёСЏ РїРѕ 1337, Р·Р°С‚РµРј Р¶РґР°С‚СЊ СЃРІРµР¶РёР№ snapshot Р±Р°Р»Р°РЅСЃР°.',
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
      statusLabel: 'СЃРІРµСЂРµРЅРѕ',
      ready: true,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: ledgerPayload,
      metric: `${ledgerEntry.amount} Р±РѕРЅСѓСЃРѕРІ / snapshot СЃРѕРІРїР°Р»`,
      note: 'РџРµСЂРІР°СЏ bonus_balance РѕРїРµСЂР°С†РёСЏ РїРёР»РѕС‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР° Langame Рё СЃРѕРІРїР°Р»Р° СЃ РїРѕСЃР»РµРґСѓСЋС‰РёРј snapshot Р±Р°Р»Р°РЅСЃР°.',
      nextAction:
        'РЎРѕС…СЂР°РЅРёС‚СЊ СЌС‚Сѓ ledger-Р·Р°РїРёСЃСЊ РєР°Рє СЌС‚Р°Р»РѕРЅ РїРёР»РѕС‚РЅРѕРіРѕ РЅР°С‡РёСЃР»РµРЅРёСЏ РїРµСЂРµРґ СЂР°СЃС€РёСЂРµРЅРёРµРј Р»РёРјРёС‚РѕРІ.',
    };
  }

  if (status === 'MISMATCH') {
    return {
      status,
      statusLabel: 'СЂР°СЃС…РѕР¶РґРµРЅРёРµ',
      ready: false,
      scopedStoreId: targetStore.id,
      scopedStoreName: targetStore.name,
      ledgerEntry: ledgerPayload,
      metric: `${ledgerEntry.amount} Р±РѕРЅСѓСЃРѕРІ / diff ${reconciliation.diff ?? 'n/a'}`,
      note: 'РџРµСЂРІР°СЏ bonus_balance РѕРїРµСЂР°С†РёСЏ РїРёР»РѕС‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР°, РЅРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Р№ Langame snapshot РЅРµ СЃРѕРІРїР°Р» СЃ РѕР¶РёРґР°РµРјС‹Рј balanceAfter.',
      nextAction:
        'Р Р°Р·РѕР±СЂР°С‚СЊ РїРµСЂРІСѓСЋ ledger-Р·Р°РїРёСЃСЊ 1337 РІ Р¶СѓСЂРЅР°Р»Рµ, СЃРІРµСЂРёС‚СЊ РіРѕСЃС‚СЏ РІ Langame Рё РЅРµ СЂР°СЃС€РёСЂСЏС‚СЊ live-write РґРѕ СѓСЃС‚СЂР°РЅРµРЅРёСЏ СЂР°СЃС…РѕР¶РґРµРЅРёСЏ.',
    };
  }

  return {
    status,
    statusLabel: 'Р¶РґРµС‚ snapshot',
    ready: false,
    scopedStoreId: targetStore.id,
    scopedStoreName: targetStore.name,
    ledgerEntry: ledgerPayload,
    metric: `${ledgerEntry.amount} Р±РѕРЅСѓСЃРѕРІ / snapshot РЅСѓР¶РµРЅ`,
    note: 'РџРµСЂРІР°СЏ bonus_balance РѕРїРµСЂР°С†РёСЏ РїРёР»РѕС‚Р° СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР° Langame, РЅРѕ РµС‰Рµ РЅРµС‚ СЃРІРµР¶РµРіРѕ snapshot РїРѕСЃР»Рµ confirmedAt.',
    nextAction:
      'Р”РѕР¶РґР°С‚СЊСЃСЏ guest foundation sync Рё РЅРѕРІРѕРіРѕ bonus balance snapshot РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ РЅР°С‡РёСЃР»РµРЅРёСЏ.',
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
    private readonly configService: ConfigService,
    private readonly bonusLedgerSchedulerService: GuestBonusLedgerSchedulerService,
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
    const deliveryOutbox = this.buildDeliveryOutbox(deliveries);

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
      publicAuthChannels.push('Р·РІРѕРЅРѕРє');
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
          playPath: `/play?storeId=${encodeURIComponent(targetStore.id)}`,
        }
      : null;
    const items: GuestGamePilotReadinessItem[] = [
      {
        key: 'CLUB',
        title: 'РљР»СѓР± РїРёР»РѕС‚Р°',
        status: targetStore
          ? targetStore.gamificationEnabled
            ? 'READY'
            : 'PARTIAL'
          : 'BLOCKED',
        statusLabel: targetStore
          ? targetStore.gamificationEnabled
            ? 'РІ РєР°С‚Р°Р»РѕРіРµ'
            : 'РЅСѓР¶РµРЅ С„Р»Р°Рі'
          : 'РЅРµС‚ РєР»СѓР±Р°',
        ready: Boolean(targetStore?.gamificationEnabled),
        metric: targetStore?.name ?? 'РєР»СѓР± РЅРµ РІС‹Р±СЂР°РЅ',
        note: targetStore
          ? 'РџРёР»РѕС‚ РІС‹Р±РёСЂР°РµС‚ РєР»СѓР± 1337, РµСЃР»Рё РѕРЅ РЅР°Р№РґРµРЅ СЃСЂРµРґРё Р°РєС‚РёРІРЅС‹С… РєР»СѓР±РѕРІ; РёРЅР°С‡Рµ Р±РµСЂРµС‚СЃСЏ РїРµСЂРІС‹Р№ РєР»СѓР± СЃ РІРєР»СЋС‡РµРЅРЅРѕР№ РіРµР№РјРёС„РёРєР°С†РёРµР№.'
          : 'Р’ tenant РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ РєР»СѓР±Р° РґР»СЏ РїРёР»РѕС‚РЅРѕРіРѕ Р·Р°РїСѓСЃРєР° РіРµР№РјРёС„РёРєР°С†РёРё.',
        nextAction: targetStore?.gamificationEnabled
          ? 'РћСЃС‚Р°РІРёС‚СЊ РєР»СѓР± РІРєР»СЋС‡РµРЅРЅС‹Рј РІ РїСѓР±Р»РёС‡РЅРѕРј РєР°С‚Р°Р»РѕРіРµ /play.'
          : 'Р’РєР»СЋС‡РёС‚СЊ С„Р»Р°Рі РіРµР№РјРёС„РёРєР°С†РёРё Сѓ РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р° РЅР° СЃС‚СЂР°РЅРёС†Рµ РєР»СѓР±РѕРІ.',
        actionHref: '/stores',
        actionLabel: 'РћС‚РєСЂС‹С‚СЊ РєР»СѓР±С‹',
      },
      {
        key: 'GEOSEARCH',
        title: 'РљР°СЂС‚Р° Рё РїРѕРёСЃРє СЂСЏРґРѕРј',
        status: targetStore
          ? targetStoreCoordinatesReady
            ? 'READY'
            : 'BLOCKED'
          : 'BLOCKED',
        statusLabel: targetStore
          ? targetStoreCoordinatesReady
            ? 'РєРѕРѕСЂРґРёРЅР°С‚С‹ РµСЃС‚СЊ'
            : targetStoreCoordinatesPartial
              ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
              : 'РЅРµС‚ РєРѕРѕСЂРґРёРЅР°С‚'
          : 'РЅРµС‚ РєР»СѓР±Р°',
        ready: targetStoreCoordinatesReady,
        metric: targetStore
          ? targetStoreCoordinatesReady
            ? 'С€РёСЂРѕС‚Р° Рё РґРѕР»РіРѕС‚Р°'
            : targetStoreCoordinatesPartial
              ? 'Р·Р°РїРѕР»РЅРµРЅР° РѕРґРЅР° РєРѕРѕСЂРґРёРЅР°С‚Р°'
              : 'РєРѕРѕСЂРґРёРЅР°С‚ РЅРµС‚'
          : 'РєР»СѓР± РЅРµ РІС‹Р±СЂР°РЅ',
        note: 'РџРµСЂРµРґ production QA РїРµСЂРІРѕРіРѕ Р±РѕРЅСѓСЃР° РїРёР»РѕС‚РЅС‹Р№ РєР»СѓР± РґРѕР»Р¶РµРЅ СѓС‡Р°СЃС‚РІРѕРІР°С‚СЊ РІ РєР°СЂС‚Рµ Рё РїРѕРёСЃРєРµ СЂСЏРґРѕРј РЅР° /game/clubs Рё /play.',
        nextAction: targetStoreCoordinatesReady
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ /game/clubs Рё /play СЃ С„РёР»СЊС‚СЂРѕРј СЂСЏРґРѕРј РЅР° СЂРµР°Р»СЊРЅРѕР№ РіРµРѕР»РѕРєР°С†РёРё.'
          : 'Р—Р°РїРѕР»РЅРёС‚СЊ С€РёСЂРѕС‚Сѓ Рё РґРѕР»РіРѕС‚Сѓ РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р° РІ /stores РІСЂСѓС‡РЅСѓСЋ РёР»Рё С‡РµСЂРµР· bulk-РґРµР№СЃС‚РІРёРµ Р—Р°РїРѕР»РЅРёС‚СЊ РєРѕРѕСЂРґРёРЅР°С‚С‹.',
        actionHref: '/stores',
        actionLabel: targetStoreCoordinatesReady
          ? 'РћС‚РєСЂС‹С‚СЊ РєР»СѓР±С‹'
          : 'Р—Р°РїРѕР»РЅРёС‚СЊ РєРѕРѕСЂРґРёРЅР°С‚С‹',
      },
      {
        key: 'PUBLIC_REGISTRATION',
        title: 'РџСѓР±Р»РёС‡РЅР°СЏ СЂРµРіРёСЃС‚СЂР°С†РёСЏ',
        status: registrationReady
          ? 'READY'
          : targetStore
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: registrationReady ? 'РіРѕС‚РѕРІРѕ' : 'РЅРµ РіРѕС‚РѕРІРѕ',
        ready: registrationReady,
        metric: registrationReady ? '/play' : 'РЅСѓР¶РЅР° РЅР°СЃС‚СЂРѕР№РєР°',
        note: 'Р“РѕСЃС‚СЊ РґРѕР»Р¶РµРЅ РїСЂРѕР№С‚Рё РїСѓС‚СЊ /play -> РІС‹Р±РѕСЂ РєР»СѓР±Р° -> СЃРѕРіР»Р°СЃРёРµ -> OTP Р±РµР· СЃРѕС‚СЂСѓРґРЅРёС‡РµСЃРєРѕР№ Р°РІС‚РѕСЂРёР·Р°С†РёРё.',
        nextAction: registrationReady
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ РїСѓС‚СЊ РЅР° С‚РµСЃС‚РѕРІРѕРј С‚РµР»РµС„РѕРЅРµ Рё РѕС‚РєСЂС‹С‚СЊ РіРѕСЃС‚РµРІРѕР№ РєР°Р±РёРЅРµС‚ РєР»СѓР±Р°.'
          : 'Р’РєР»СЋС‡РёС‚СЊ РєР»СѓР± РІ РєР°С‚Р°Р»РѕРі /play С‡РµСЂРµР· С„Р»Р°Рі РіРµР№РјРёС„РёРєР°С†РёРё РёР»Рё Р°РєС‚РёРІРЅРѕРµ РёРіСЂРѕРІРѕРµ РїСЂР°РІРёР»Рѕ.',
        actionHref: targetStorePayload?.playPath ?? '/play',
        actionLabel: 'РћС‚РєСЂС‹С‚СЊ /play',
      },
      {
        key: 'PUBLIC_GAME_QA',
        title: 'РџСѓР±Р»РёС‡РЅС‹Р№ QA-РїСѓС‚СЊ',
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
            ? 'РіРѕС‚РѕРІ Рє QA'
            : !targetStore
              ? 'РЅРµС‚ РєР»СѓР±Р°'
              : !registrationReady
                ? 'РЅСѓР¶РµРЅ РєР°С‚Р°Р»РѕРі'
                : !publicAuthReady && !publicAuthPartial
                  ? 'РЅРµС‚ РІС…РѕРґР°'
                  : 'С‡Р°СЃС‚РёС‡РЅРѕ',
        ready: Boolean(
          registrationReady && targetStoreCoordinatesReady && publicAuthReady,
        ),
        metric: publicAuthChannels.length
          ? `РІС…РѕРґ: ${publicAuthChannels.join(' / ')}`
          : 'РЅРµС‚ РіРѕС‚РѕРІРѕРіРѕ РІС…РѕРґР°',
        note: 'РџСЂРѕРІРµСЂСЏРµС‚ РѕСЃРЅРѕРІРЅРѕР№ РіРѕСЃС‚РµРІРѕР№ РїСѓС‚СЊ /game/auth -> Telegram contact-share РёР»Рё Р±РµСЃРїР»Р°С‚РЅС‹Р№ Р·РІРѕРЅРѕРє/SMS -> /game/clubs -> /play/game Р±РµР· СЃРѕС‚СЂСѓРґРЅРёС‡РµСЃРєРѕР№ СЃРµСЃСЃРёРё, live Langame reads Рё РџР”РЅ.',
        nextAction:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'РџСЂРѕР№С‚Рё production QA: /game/auth -> РІС…РѕРґ -> /game/clubs -> /play/game РЅР° С‚РµСЃС‚РѕРІРѕРј С‚РµР»РµС„РѕРЅРµ.'
            : !targetStore
              ? 'РЎРѕР·РґР°С‚СЊ РёР»Рё РІРєР»СЋС‡РёС‚СЊ РїРёР»РѕС‚РЅС‹Р№ РєР»СѓР± РІ LeetPlus Game.'
              : !registrationReady
                ? 'Р’РєР»СЋС‡РёС‚СЊ РєР»СѓР± РІ РїСѓР±Р»РёС‡РЅС‹Р№ РёРіСЂРѕРІРѕР№ РєР°С‚Р°Р»РѕРі С‡РµСЂРµР· С„Р»Р°Рі РіРµР№РјРёС„РёРєР°С†РёРё РёР»Рё Р°РєС‚РёРІРЅРѕРµ РїСЂР°РІРёР»Рѕ.'
                : !targetStoreCoordinatesReady
                  ? 'Р—Р°РїРѕР»РЅРёС‚СЊ РєРѕРѕСЂРґРёРЅР°С‚С‹ РїРёР»РѕС‚РЅРѕРіРѕ РєР»СѓР±Р° РїРµСЂРµРґ РїСЂРѕРІРµСЂРєРѕР№ /game/clubs Рё РїРѕРёСЃРєР° СЂСЏРґРѕРј.'
                  : publicAuthPartial
                    ? 'Р—Р°РІРµСЂС€РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєСѓ Telegram polling edge, Р±РµСЃРїР»Р°С‚РЅРѕРіРѕ Р·РІРѕРЅРєР° РёР»Рё SMS-СЂРµР·РµСЂРІР° Рё Р·Р°С‚РµРј РїСЂРѕР№С‚Рё /game/auth.'
                    : 'РќР°СЃС‚СЂРѕРёС‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РєР°РЅР°Р» РІС…РѕРґР°: Telegram-Р±РѕС‚, Р±РµСЃРїР»Р°С‚РЅС‹Р№ Р·РІРѕРЅРѕРє РёР»Рё SMS-СЂРµР·РµСЂРІ.',
        actionHref:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? '/game/auth'
            : !targetStoreCoordinatesReady
              ? '/stores'
              : '/guests/gamification',
        actionLabel:
          registrationReady && targetStoreCoordinatesReady && publicAuthReady
            ? 'РћС‚РєСЂС‹С‚СЊ /game/auth'
            : !targetStoreCoordinatesReady
              ? 'Р—Р°РїРѕР»РЅРёС‚СЊ РєРѕРѕСЂРґРёРЅР°С‚С‹'
              : 'РћС‚РєСЂС‹С‚СЊ readiness',
      },
      {
        key: 'OTP',
        title: 'OTP-РґРѕСЃС‚Р°РІРєР°',
        status: otpItem?.status ?? 'BLOCKED',
        statusLabel: otpItem?.statusLabel ?? 'РЅРµС‚ РґР°РЅРЅС‹С…',
        ready: Boolean(otpItem?.ready),
        metric: otpItem?.enabled ? 'РІРєР»СЋС‡РµРЅРѕ' : 'РІС‹РєР»СЋС‡РµРЅРѕ',
        note:
          otpItem?.note ??
          'Р”Р»СЏ production-РїРёР»РѕС‚Р° РЅСѓР¶РµРЅ СЏРІРЅС‹Р№ OTP-РєР°РЅР°Р» РёР»Рё РєРѕРЅС‚СЂРѕР»РёСЂСѓРµРјС‹Р№ dev-СЂРµР¶РёРј.',
        nextAction:
          otpItem?.nextAction ??
          'РќР°СЃС‚СЂРѕРёС‚СЊ SMS/Telegram/MAX provider РёР»Рё РІСЂРµРјРµРЅРЅРѕ СЃРѕРіР»Р°СЃРѕРІР°С‚СЊ dev OTP.',
      },
      {
        key: 'GAME_PROFILE',
        title: 'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ',
        status: activeProfiles.length
          ? 'READY'
          : registrationReady
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: activeProfiles.length
          ? 'РµСЃС‚СЊ РїСЂРѕС„РёР»СЊ'
          : 'РѕР¶РёРґР°РµС‚ РіРѕСЃС‚СЏ',
        ready: activeProfiles.length > 0,
        metric: `${activeProfiles.length} Р°РєС‚РёРІРЅС‹С…`,
        note: 'Р РµРіРёСЃС‚СЂР°С†РёСЏ РЅРµ СЃРѕР·РґР°РµС‚ РѕР±С‰РёР№ Guest, Р° СЃРѕР·РґР°РµС‚ РѕС‚РґРµР»СЊРЅС‹Р№ GuestGameProfile РґР»СЏ XP, РјРёСЃСЃРёР№ Рё РЅР°РіСЂР°Рґ.',
        nextAction: activeProfiles.length
          ? 'РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚РµСЃС‚РѕРІС‹Р№ РїСЂРѕС„РёР»СЊ РґР»СЏ dry-run Рё РїРµСЂРІРѕРіРѕ СЃРѕР±С‹С‚РёСЏ.'
          : 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊ С‚РµСЃС‚РѕРІРѕРіРѕ СѓС‡Р°СЃС‚РЅРёРєР° С‡РµСЂРµР· /play.',
        actionHref: targetStorePayload?.playPath ?? '/play',
        actionLabel: 'РћС‚РєСЂС‹С‚СЊ /play',
      },
      {
        key: 'LANGAME_MATCH',
        title: 'РЎРІСЏР·РєР° СЃ Langame',
        status: linkedProfiles.length
          ? 'READY'
          : activeProfiles.length
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: linkedProfiles.length
          ? 'СЃРІСЏР·Р°РЅ'
          : 'РЅСѓР¶РЅР° СЃРІРµСЂРєР°',
        ready: linkedProfiles.length > 0,
        metric: `${linkedProfiles.length}/${activeProfiles.length}`,
        note: 'Р”Р»СЏ Р±РѕРЅСѓСЃРЅРѕР№ Р·Р°РїРёСЃРё РЅСѓР¶РµРЅ СЃРІСЏР·Р°РЅРЅС‹Р№ Langame-РіРѕСЃС‚СЊ РёР»Рё СЃР»РµРґСѓСЋС‰РёР№ guest foundation sync РїРѕ phoneHash.',
        nextAction: linkedProfiles.length
          ? 'РџРµСЂРµР№С‚Рё Рє РїСЂРѕРІРµСЂРєРµ С„Р°РєС‚Р° СЃРµСЃСЃРёРё Рё СЃРѕР±С‹С‚РёСЏ.'
          : 'Р’ РіРѕСЃС‚РµРІРѕРј РєР°Р±РёРЅРµС‚Рµ РЅР°Р¶Р°С‚СЊ СЂСѓС‡РЅСѓСЋ РїСЂРѕРІРµСЂРєСѓ Langame РёР»Рё РґРѕР¶РґР°С‚СЊСЃСЏ foundation sync.',
        actionHref: targetStorePayload?.guestPortalPath ?? '/play',
        actionLabel: targetStorePayload
          ? 'РћС‚РєСЂС‹С‚СЊ РєР°Р±РёРЅРµС‚'
          : 'РћС‚РєСЂС‹С‚СЊ /play',
      },
      {
        key: 'ACTIVE_RULES',
        title: 'РђРєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р°',
        status: activeRuleCount ? 'READY' : targetStore ? 'PARTIAL' : 'BLOCKED',
        statusLabel: activeRuleCount
          ? 'РµСЃС‚СЊ СЃС†РµРЅР°СЂРёРё'
          : 'РЅРµС‚ РїСЂР°РІРёР»',
        ready: activeRuleCount > 0,
        metric: `${activeRuleCount} РїСЂР°РІРёР»`,
        note: 'РџРёР»РѕС‚Сѓ РЅСѓР¶РµРЅ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ Р°РєС‚РёРІРЅС‹Р№ Р»СѓС‚Р±РѕРєСЃ, РјРёСЃСЃРёСЏ РёР»Рё Battle Pass, РїСЂРёРјРµРЅРёРјС‹Р№ Рє РєР»СѓР±Сѓ.',
        nextAction: activeRuleCount
          ? 'Р—Р°РїСѓСЃС‚РёС‚СЊ dry-run РїРѕ С‚РµСЃС‚РѕРІРѕРјСѓ РїСЂРѕС„РёР»СЋ Рё РїРёР»РѕС‚РЅРѕРјСѓ РєР»СѓР±Сѓ.'
          : 'РЎРѕР·РґР°С‚СЊ РїСЂРѕСЃС‚СѓСЋ РјРёСЃСЃРёСЋ РёР»Рё Р»СѓС‚Р±РѕРєСЃ РґР»СЏ РєР»СѓР±Р° 1337.',
        actionHref: '/guests/gamification',
        actionLabel: 'РћС‚РєСЂС‹С‚СЊ РїСЂР°РІРёР»Р°',
      },
      {
        key: 'GUEST_LOGS',
        title: 'Р¤Р°РєС‚С‹ guests/logs',
        status: guestLogsReady
          ? 'READY'
          : guestLogsRequiredByRules
            ? 'BLOCKED'
            : guestLogMappings
              ? 'PARTIAL'
              : 'MANUAL_ONLY',
        statusLabel: guestLogsReady
          ? 'С‚РёРїС‹ РЅР°Р№РґРµРЅС‹'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? '0 РїРѕСЃР»Рµ sync'
              : 'РЅСѓР¶РµРЅ sync'
            : guestLogMappings
              ? 'Р¶РґРµС‚ sync'
              : guestLogsCheckedEmpty
                ? 'РїСЂРѕРІРµСЂРµРЅРѕ: 0'
                : 'РЅРµ С‚СЂРµР±СѓРµС‚СЃСЏ',
        ready: guestLogsReady,
        metric: guestLogsReady
          ? guestLogsRequiredByRules
            ? `${guestLogRows} Р»РѕРіРѕРІ / ${guestLogTypes} С‚РёРїРѕРІ / ${guestLogRuleDependencies} РїСЂР°РІРёР»`
            : `${guestLogRows} Р»РѕРіРѕРІ / ${guestLogTypes} С‚РёРїРѕРІ`
          : guestLogsRequiredByRules
            ? `0 Р»РѕРіРѕРІ / ${guestLogRuleDependencies} РїСЂР°РІРёР»`
            : guestLogMappings
              ? `${guestLogMappings} СЃРѕРїРѕСЃС‚Р°РІР»РµРЅРёР№`
              : 'С‚РµРєСѓС‰РёРµ РїСЂР°РІРёР»Р° Р±РµР· guests/logs',
        note: guestLogsReady
          ? guestLogsRequiredByRules
            ? `РљР°С‚Р°Р»РѕРі СЃРѕР±С‹С‚РёР№ РіРѕС‚РѕРІ РґР»СЏ ${guestLogRuleDependencies} РїСЂР°РІРёР» guests/logs: ${guestLogDomains} РёСЃС‚РѕС‡РЅРёРєРѕРІ, РїРѕСЃР»РµРґРЅРµРµ СЃРѕР±С‹С‚РёРµ ${guestLogLatestAt ?? 'Р±РµР· РґР°С‚С‹'}.`
            : `РљР°С‚Р°Р»РѕРі СЃРѕР±С‹С‚РёР№ СЃРѕС…СЂР°РЅРµРЅ РґР»СЏ Р±СѓРґСѓС‰РёС… РєРІРµСЃС‚РѕРІ Рё anti-fraud: ${guestLogDomains} РёСЃС‚РѕС‡РЅРёРєРѕРІ, РїРѕСЃР»РµРґРЅРµРµ СЃРѕР±С‹С‚РёРµ ${guestLogLatestAt ?? 'Р±РµР· РґР°С‚С‹'}. РўРµРєСѓС‰РёРµ РїСЂР°РІРёР»Р° РјРѕРіСѓС‚ РёРґС‚Рё Р±РµР· guests/logs.`
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? `РђРєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р° РёСЃРїРѕР»СЊР·СѓСЋС‚ guests/logs, РЅРѕ РїРѕСЃР»РµРґРЅРёР№ СѓСЃРїРµС€РЅС‹Р№ foundation sync Р·Р° ${guestLogLastSync?.businessDate ?? 'РїРѕСЃР»РµРґРЅСЋСЋ РґР°С‚Сѓ'} РїСЂРѕРІРµСЂРёР» endpoint Рё РІРµСЂРЅСѓР» 0 Р»РѕРіРѕРІ. РџРѕРІС‚РѕСЂ sync Р±РµР· СЂР°Р·Р±РѕСЂР° Langame payload РЅРµ СЃРЅРёРјРµС‚ СЂРёСЃРє.`
              : 'РђРєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р° РёСЃРїРѕР»СЊР·СѓСЋС‚ С‚РёРїС‹ guests/logs, РЅРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… С„Р°РєС‚РѕРІ РїРѕРєР° РЅРµС‚: dry-run РїРѕ СЌС‚РёРј РїСЂР°РІРёР»Р°Рј Р±СѓРґРµС‚ РЅРµРїРѕР»РЅС‹Рј.'
            : guestLogMappings
              ? 'РЎР»РѕРІР°СЂСЊ С‚РёРїРѕРІ СѓР¶Рµ РЅР°СЃС‚СЂРѕРµРЅ, РЅРѕ С‚РµРєСѓС‰РёРµ Р°РєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р° РЅРµ С‚СЂРµР±СѓСЋС‚ guests/logs.'
              : guestLogsCheckedEmpty
                ? `РўРµРєСѓС‰РёРµ Р°РєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р° РЅРµ С‚СЂРµР±СѓСЋС‚ guests/logs; РїРѕСЃР»РµРґРЅРёР№ СѓСЃРїРµС€РЅС‹Р№ foundation sync Р·Р° ${guestLogLastSync?.businessDate ?? 'РїРѕСЃР»РµРґРЅСЋСЋ РґР°С‚Сѓ'} СѓР¶Рµ РїСЂРѕРІРµСЂРёР» endpoint Рё РІРµСЂРЅСѓР» 0 Р»РѕРіРѕРІ.`
                : 'РўРµРєСѓС‰РёРµ Р°РєС‚РёРІРЅС‹Рµ РїСЂР°РІРёР»Р° РЅРµ С‚СЂРµР±СѓСЋС‚ guests/logs; РєР°С‚Р°Р»РѕРі РЅСѓР¶РµРЅ РґР»СЏ Р±СѓРґСѓС‰РёС… РєРІРµСЃС‚РѕРІ Рё anti-fraud.',
        nextAction: guestLogsReady
          ? 'РЎРєР°С‡Р°С‚СЊ CSV РєР°С‚Р°Р»РѕРіР° Рё РІС‹Р±СЂР°С‚СЊ СЂРµР°Р»СЊРЅС‹Рµ С‚РёРїС‹ РґР»СЏ РїСЂР°РІРёР» 1337.'
          : guestLogsRequiredByRules
            ? guestLogsCheckedEmpty
              ? 'РћС‚РєСЂС‹С‚СЊ РґРёР°РіРЅРѕСЃС‚РёРєСѓ /sync, РїСЂРѕРІРµСЂРёС‚СЊ СЃС‚СЂРѕРєРё РїРѕСЃР»РµРґРЅРµРіРѕ foundation-run Рё РІСЂРµРјРµРЅРЅРѕ СѓР±СЂР°С‚СЊ Р·Р°РІРёСЃРёРјРѕСЃС‚СЊ rules РѕС‚ guests/logs РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ payload Langame.'
              : 'РќР° /sync РІРєР»СЋС‡РёС‚СЊ СЂР°СЃС€РёСЂРµРЅРЅСѓСЋ РїСЂРѕРІРµСЂРєСѓ guests/logs Рё РґРѕР¶РґР°С‚СЊСЃСЏ СЃРѕС…СЂР°РЅРµРЅРЅС‹С… С„Р°РєС‚РѕРІ РїРµСЂРµРґ dry-run.'
            : guestLogsCheckedEmpty
              ? 'РњРѕР¶РЅРѕ Р·Р°РїСѓСЃРєР°С‚СЊ dry-run С‚РµРєСѓС‰РёС… РїСЂР°РІРёР»; РґР»СЏ guests/logs-РєРІРµСЃС‚РѕРІ СЃРЅР°С‡Р°Р»Р° РїРѕРґС‚РІРµСЂРґРёС‚СЊ Сѓ Langame, РїРѕС‡РµРјСѓ endpoint РІРѕР·РІСЂР°С‰Р°РµС‚ 0 СЃС‚СЂРѕРє.'
              : 'РњРѕР¶РЅРѕ Р·Р°РїСѓСЃРєР°С‚СЊ dry-run С‚РµРєСѓС‰РёС… РїСЂР°РІРёР»; РґР»СЏ СЂР°СЃС€РёСЂРµРЅРЅС‹С… РєРІРµСЃС‚РѕРІ РїРѕР·Р¶Рµ Р·Р°РїРѕР»РЅРёС‚СЊ guests/logs РЅР° /sync.',
        actionHref: guestLogsReady
          ? '/api/guests/gamification/guest-log-catalog/export'
          : '/sync?includeGuestLogs=1',
        actionLabel: guestLogsReady
          ? 'РЎРєР°С‡Р°С‚СЊ CSV'
          : guestLogsCheckedEmpty
            ? 'РћС‚РєСЂС‹С‚СЊ РґРёР°РіРЅРѕСЃС‚РёРєСѓ'
            : 'РћС‚РєСЂС‹С‚СЊ /sync',
      },
      {
        key: 'TEST_EVENT',
        title: 'РўРµСЃС‚РѕРІРѕРµ СЃРѕР±С‹С‚РёРµ',
        status: events.length
          ? 'READY'
          : activeRuleCount && linkedProfiles.length
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: events.length
          ? 'РµСЃС‚СЊ РёСЃС‚РѕСЂРёСЏ'
          : 'РЅСѓР¶РµРЅ dry-run',
        ready: events.length > 0,
        metric: `${events.length} СЃРѕР±С‹С‚РёР№`,
        note: 'РџРµСЂРµРґ Р±РѕРµРІС‹Рј РЅР°С‡РёСЃР»РµРЅРёРµРј РЅСѓР¶РЅРѕ РїРѕРґС‚РІРµСЂРґРёС‚СЊ dry-run/process-event РЅР° СЃРѕС…СЂР°РЅРµРЅРЅРѕРј snapshot-С„Р°РєС‚Рµ РёР»Рё СЂСѓС‡РЅРѕРј СЃРѕР±С‹С‚РёРё.',
        nextAction: events.length
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ СЃРѕР·РґР°РЅРЅС‹Рµ РЅР°РіСЂР°РґС‹ Рё idempotency РїРѕ СЃРѕР±С‹С‚РёСЋ.'
          : 'Р’Рѕ РІРєР»Р°РґРєРµ С‚РµСЃС‚РѕРІРѕРіРѕ Р·Р°РїСѓСЃРєР° РІС‹РїРѕР»РЅРёС‚СЊ dry-run Рё РїРѕРґС‚РІРµСЂРґРёС‚СЊ РѕРґРЅРѕ СЃРѕР±С‹С‚РёРµ.',
      },
      {
        key: 'REWARD_QUEUE',
        title: 'РћС‡РµСЂРµРґСЊ РЅР°РіСЂР°Рґ',
        status: readyWalletRewards.length
          ? 'READY'
          : pendingRewards.length || activeRuleCount
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: readyWalletRewards.length
          ? 'РіРѕС‚РѕРІРѕ Рє РІС‹РґР°С‡Рµ'
          : pendingRewards.length
            ? 'Р¶РґРµС‚ РїСЂРѕРІРµСЂРєРё'
            : 'РїСѓСЃС‚Рѕ',
        ready: readyWalletRewards.length > 0,
        metric: `${readyWalletRewards.length} РіРѕС‚РѕРІРѕ`,
        note: 'РќР°РіСЂР°РґР° РґРѕР»Р¶РЅР° РїРѕСЏРІРёС‚СЊСЃСЏ РІ РєРѕС€РµР»СЊРєРµ СЃ РєРѕРґРѕРј РєР°СЃСЃРёСЂСѓ РёР»Рё РєР°Рє approved bonus reward РґР»СЏ ledger.',
        nextAction: readyWalletRewards.length
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ РєРѕРґ РІС‹РґР°С‡Рё РёР»Рё РїРѕРґРіРѕС‚РѕРІРєСѓ ledger-Р·Р°РїРёСЃРё.'
          : pendingRewards.length
            ? 'РџРѕРґС‚РІРµСЂРґРёС‚СЊ С‚РµСЃС‚РѕРІСѓСЋ РЅР°РіСЂР°РґСѓ РёР»Рё РІРєР»СЋС‡РёС‚СЊ auto-approve РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕРіРѕ РїСЂР°РІРёР»Р°.'
            : 'РЎРѕР·РґР°С‚СЊ СЃРѕР±С‹С‚РёРµ, РєРѕС‚РѕСЂРѕРµ С„РѕСЂРјРёСЂСѓРµС‚ РЅР°РіСЂР°РґСѓ.',
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
              ? 'Р»РёС€РЅРёРµ Р·Р°РїРёСЃРё'
              : bonusRewards.length
                ? 'Р¶РґРµС‚ ledger'
                : 'Р¶РґРµС‚ Р±РѕРЅСѓСЃ'
          : langameWriteItem?.ready
            ? 'РЅСѓР¶РµРЅ scheduler'
            : bonusLedgerSchedulerItem?.enabled
              ? 'РЅСѓР¶РµРЅ write API'
              : 'СЂСѓС‡РЅРѕР№ СЂРµР¶РёРј',
        ready: Boolean(
          bonusLedgerAutonomousReady &&
          bonusRewards.length &&
          pilotLedgerPreflight.ready,
        ),
        metric: `${bonusRewards.length} bonus rewards / ${pilotLedgerPreflight.readyCount} ledger ready`,
        note: 'РђРІС‚РѕРЅРѕРјРЅС‹Р№ scheduler РґРѕР»Р¶РµРЅ РїРѕСЃС‚Р°РІРёС‚СЊ approved bonus rewards РІ ledger Рё РѕС‚РїСЂР°РІРёС‚СЊ РёС… С‡РµСЂРµР· master endpoint Langame РїРѕ С‚РµР»РµС„РѕРЅСѓ РіРѕСЃС‚СЏ Р±РµР· Р°РґРјРёРЅСЃРєРѕРіРѕ РєР»РёРєР°.',
        nextAction: bonusLedgerAutonomousReady
          ? bonusRewards.length
            ? pilotLedgerPreflight.nextAction
            : 'РЎРѕР·РґР°С‚СЊ approved-РЅР°РіСЂР°РґСѓ СЃ Р±РѕРЅСѓСЃРЅС‹Рј rewardType РґР»СЏ ledger.'
          : langameWriteItem?.ready
            ? 'Р’РєР»СЋС‡РёС‚СЊ GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED Рё СЃРЅР°С‡Р°Р»Р° РїСЂРѕРіРЅР°С‚СЊ dry-run/canary РґР»СЏ 1337.'
            : bonusLedgerSchedulerItem?.enabled
              ? 'РџРѕСЃР»Рµ dry-run РІРєР»СЋС‡РёС‚СЊ LANGAME_BONUS_ACCRUAL_ENABLED=true РґР»СЏ СЂРµР°Р»СЊРЅРѕР№ Р·Р°РїРёСЃРё РІ Langame.'
              : 'Р”Рѕ РІРєР»СЋС‡РµРЅРёСЏ LANGAME_BONUS_ACCRUAL_ENABLED РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ claim-РєРѕРґ РёР»Рё СЂСѓС‡РЅСѓСЋ РІС‹РґР°С‡Сѓ.',
      },
      {
        key: 'BALANCE_RECONCILIATION',
        title: 'РЎРІРµСЂРєР° РїРѕСЃР»Рµ РЅР°С‡РёСЃР»РµРЅРёСЏ',
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
          ? 'РћС‚РєСЂС‹С‚СЊ СЃРІРµСЂРєСѓ'
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
      note: 'РџРёР»РѕС‚РЅС‹Р№ С‡РµРє-Р»РёСЃС‚ РїРѕРєР°Р·С‹РІР°РµС‚ РїСѓС‚СЊ РѕС‚ РїСѓР±Р»РёС‡РЅРѕР№ СЂРµРіРёСЃС‚СЂР°С†РёРё РґРѕ РїРµСЂРІРѕРіРѕ Р±РѕРЅСѓСЃР° РІ Langame РїРѕ СѓР¶Рµ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рј РґР°РЅРЅС‹Рј LeetPlus. РћРЅ РЅРµ РґРµР»Р°РµС‚ live-Р·Р°РїСЂРѕСЃРѕРІ Рё РЅРµ СЂР°СЃРєСЂС‹РІР°РµС‚ РџР”РЅ.',
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
    const telegramWebhookReplyRequiredEnv = [
      ...(telegramWebhookSecret ? [] : ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET']),
      ...(telegramWebhookReplyEnabled
        ? []
        : ['GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_ENABLED']),
      ...(telegramWebhookReplyToken
        ? []
        : [
            'GUEST_GAME_TELEGRAM_WEBHOOK_REPLY_BOT_TOKEN or GUEST_GAME_TELEGRAM_BOT_TOKEN',
          ]),
    ];
    const telegramWebhookReplyStatus: GuestGameIntegrationReadinessStatus =
      telegramWebhookReplyReady
        ? 'READY'
        : !telegramWebhookSecret
          ? 'BLOCKED'
          : telegramWebhookReplyEnabled || telegramWebhookReplyToken
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
        title: 'РџСѓР±Р»РёС‡РЅС‹Р№ РіРѕСЃС‚РµРІРѕР№ РєР°Р±РёРЅРµС‚',
        status: 'READY',
        statusLabel: 'РіРѕС‚РѕРІ',
        ready: true,
        configured: true,
        enabled: true,
        requiredEnv: [],
        note: 'РњР°СЂС€СЂСѓС‚ /guest/[tenantSlug]/[storeId] СЂР°Р±РѕС‚Р°РµС‚ РѕС‚РґРµР»СЊРЅРѕ РѕС‚ РІРЅСѓС‚СЂРµРЅРЅРµРіРѕ РєР°Р±РёРЅРµС‚Р° Рё РёСЃРїРѕР»СЊР·СѓРµС‚ guest-token.',
        nextAction:
          'РџСЂРѕРІРµСЂСЏР№С‚Рµ РіРѕСЃС‚РµРІС‹Рµ СЃСЃС‹Р»РєРё РїРѕ РєР»СѓР±Р°Рј РёР· Р±Р»РѕРєР° РїСѓР±Р»РёС‡РЅС‹С… СЃСЃС‹Р»РѕРє РЅРёР¶Рµ.',
      },
      {
        key: 'OTP',
        title: 'OTP-РІС…РѕРґ РіРѕСЃС‚СЏ',
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
        title: 'Telegram OTP provider',
        status: otp.telegram.status,
        statusLabel: otp.telegram.statusLabel,
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
        title: 'РџСЂРёРІСЏР·РєР° Telegram-Р±РѕС‚Р°',
        status: telegramLinkConfigured
          ? 'READY'
          : telegramBotUsername || telegramLinkSecret
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: telegramLinkConfigured
          ? 'РіРѕС‚РѕРІРѕ'
          : telegramBotUsername || telegramLinkSecret
            ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
            : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅРѕ',
        ready: telegramLinkConfigured,
        configured: telegramLinkConfigured,
        enabled: Boolean(telegramBotUsername || telegramLinkSecret),
        requiredEnv: [
          'GUEST_GAME_TELEGRAM_BOT_USERNAME',
          'GUEST_GAME_TELEGRAM_LINK_SECRET',
        ],
        note: 'Р“РѕСЃС‚СЊ РїРѕСЃР»Рµ OTP РјРѕР¶РµС‚ СЃРѕР·РґР°С‚СЊ РѕРґРЅРѕСЂР°Р·РѕРІС‹Р№ link-code Рё РѕС‚РєСЂС‹С‚СЊ deep link Р±РѕС‚Р°; LeetPlus С…СЂР°РЅРёС‚ С‚РѕР»СЊРєРѕ chat:<id>.',
        nextAction: telegramLinkConfigured
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ deep link РІ РіРѕСЃС‚РµРІРѕРј РєР°Р±РёРЅРµС‚Рµ Рё 1337 polling edge.'
          : 'РќР°СЃС‚СЂРѕРёС‚СЊ username Р±РѕС‚Р° Рё link secret РґРѕ РїСѓР±Р»РёС‡РЅРѕРіРѕ Р·Р°РїСѓСЃРєР° РїСЂРёРІСЏР·РєРё.',
      },
      {
        key: 'TELEGRAM_WEBHOOK',
        title: 'Telegram update consumer (polling edge)',
        status: telegramWebhookConfigured ? 'READY' : 'BLOCKED',
        statusLabel: telegramWebhookConfigured
          ? 'СЃРµРєСЂРµС‚ РµСЃС‚СЊ'
          : 'СЃРµРєСЂРµС‚ РЅСѓР¶РµРЅ',
        ready: telegramWebhookConfigured,
        configured: telegramWebhookConfigured,
        enabled: telegramWebhookConfigured,
        requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'],
        note: 'РћСЃРЅРѕРІРЅРѕР№ API РїСЂРёРЅРёРјР°РµС‚ /start link-code Рё РєРѕРјР°РЅРґС‹ РѕС‚РїРёСЃРєРё РѕС‚ 1337 polling edge, РЅРµ С…СЂР°РЅРёС‚ raw update Рё РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚ РІРЅРµС€РЅРёРµ РѕС‚РІРµС‚С‹.',
        nextAction: telegramWebhookConfigured
          ? 'РќР° 1337 РїСЂРѕРІРµСЂРёС‚СЊ telegram-poller: webhook url=-, Р·Р°С‚РµРј РїСЂРѕР№С‚Рё Telegram canary.'
          : 'Р—Р°РґР°С‚СЊ update secret Рё С‚РѕР»СЊРєРѕ РїРѕС‚РѕРј РїРѕРґРєР»СЋС‡Р°С‚СЊ 1337 polling edge Рє production API.',
      },
      {
        key: 'TELEGRAM_AUTH_REPLY_SENDER',
        title: 'Telegram reply sender РґР»СЏ РІС…РѕРґР°',
        status: telegramWebhookReplyStatus,
        statusLabel: telegramWebhookReplyReady
          ? 'sender ready'
          : telegramWebhookReplyStatus === 'MANUAL_ONLY'
            ? 'adapter-only'
            : telegramWebhookReplyStatus === 'PARTIAL'
              ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
              : 'secret РЅСѓР¶РµРЅ',
        ready: telegramWebhookReplyReady,
        configured: Boolean(telegramWebhookReplyToken),
        enabled: telegramWebhookReplyEnabled,
        requiredEnv: telegramWebhookReplyRequiredEnv,
        details: [
          {
            label: 'Update secret',
            value: telegramWebhookSecret
              ? 'СЃРµРєСЂРµС‚ РµСЃС‚СЊ'
              : 'СЃРµРєСЂРµС‚ РЅСѓР¶РµРЅ',
          },
          {
            label: 'Sender',
            value: telegramWebhookReplyEnabled
              ? 'РІРєР»СЋС‡РµРЅ'
              : 'РІС‹РєР»СЋС‡РµРЅ',
          },
          {
            label: 'Bot token',
            value: telegramWebhookReplyToken
              ? 'РЅР°СЃС‚СЂРѕРµРЅ'
              : 'РЅСѓР¶РµРЅ РґР»СЏ API-side send',
          },
        ],
        note: telegramWebhookReplyReady
          ? 'API СЃР°Рј РѕС‚РїСЂР°РІР»СЏРµС‚ Telegram reply payload РёР· С‚РµРєСѓС‰РµРіРѕ update: РєРЅРѕРїРєСѓ request_contact РїРѕСЃР»Рµ /start Рё remove_keyboard РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ. Raw chat_id РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РёР· С‚РµРєСѓС‰РµРіРѕ update РІ РїР°РјСЏС‚Рё.'
          : 'РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ LeetPlus РІРѕР·РІСЂР°С‰Р°РµС‚ safe reply payload РґР»СЏ 1337 edge adapter. Р”Р»СЏ РїСЂСЏРјРѕР№ РѕС‚РїСЂР°РІРєРё РЅСѓР¶РЅС‹ update secret, env-С„Р»Р°Рі sender Рё bot token.',
        nextAction: telegramWebhookReplyReady
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ /play -> Telegram deep link -> contact-share РЅР° С‚РµСЃС‚РѕРІРѕРј РіРѕСЃС‚Рµ Рё СЃРјРѕС‚СЂРµС‚СЊ replyDispatch=SENT Р±РµР· raw chat id.'
          : 'Р”РѕР±Р°РІРёС‚СЊ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ env РёР»Рё РѕСЃС‚Р°РІРёС‚СЊ 1337 polling edge, РєРѕС‚РѕСЂС‹Р№ РѕС‚РїСЂР°РІР»СЏРµС‚ reply payload.',
        runbook: telegramAuthRunbook,
      },
      {
        key: 'TELEGRAM_MINI_APP',
        title: 'Telegram Mini App',
        status: telegramMiniAppStatus,
        statusLabel: telegramMiniAppReady
          ? 'РіРѕС‚РѕРІ'
          : telegramMiniAppStatus === 'PARTIAL'
            ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
            : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅРѕ',
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
            value: telegramMiniAppUrl ? '/game/app' : 'РЅСѓР¶РµРЅ URL',
          },
          {
            label: 'Bot username',
            value: telegramBotUsername ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
          },
          {
            label: 'initData token',
            value: telegramMiniAppToken ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'edge/shared',
          },
          {
            label: 'Edge assertion',
            value: telegramMiniAppEdgeSecret
              ? 'РЅР°СЃС‚СЂРѕРµРЅ'
              : 'РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ',
          },
        ],
        note: 'Mini App РѕС‚РєСЂС‹РІР°РµС‚ /game/app Рё РІС‹РґР°РµС‚ РѕР±С‹С‡РЅСѓСЋ guest-session РґР»СЏ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ GuestGameProfile. InitData РјРѕР¶РЅРѕ РІР°Р»РёРґРёСЂРѕРІР°С‚СЊ РЅР° API bot token-РѕРј РёР»Рё РЅР° РѕС‚РґРµР»СЊРЅРѕР№ edge VDS СЃ РїРµСЂРµРґР°С‡РµР№ edge assertion.',
        nextAction: telegramMiniAppReady
          ? 'РџСЂРѕРІРµСЂРёС‚СЊ РєРЅРѕРїРєСѓ Open Mini App РїРѕСЃР»Рµ Telegram contact-share Рё mobile WebView /game/app РЅР° С‚РµСЃС‚РѕРІРѕРј РіРѕСЃС‚Рµ.'
          : 'РќР°СЃС‚СЂРѕРёС‚СЊ bot username, Mini App URL Рё bot token РЅР° edge VDS РёР»Рё shared secret РґР»СЏ edge assertion.',
        runbook: telegramAuthRunbook,
      },
      {
        key: 'TELEGRAM_DELIVERY',
        title: 'РћС‚РїСЂР°РІРєР° РЅР°РіСЂР°Рґ РІ Telegram',
        status: telegramDeliveryConfigured
          ? 'READY'
          : deliveryConfig.realSendEnabled || telegramProvider?.configured
            ? 'PARTIAL'
            : 'BLOCKED',
        statusLabel: telegramDeliveryConfigured
          ? 'provider РіРѕС‚РѕРІ'
          : deliveryConfig.realSendEnabled || telegramProvider?.configured
            ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
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
          'Telegram delivery provider РµС‰Рµ РЅРµ РЅР°СЃС‚СЂРѕРµРЅ; dispatcher СЂР°Р±РѕС‚Р°РµС‚ Р±РµР·РѕРїР°СЃРЅРѕ.',
        nextAction:
          'Р’РєР»СЋС‡Р°С‚СЊ СЂРµР°Р»СЊРЅСѓСЋ РѕС‚РїСЂР°РІРєСѓ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СЃРѕРіР»Р°СЃРёР№, numeric chat_id, bot token Рё production-Р°СѓРґРёС‚Р° outbox.',
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
          ? 'canary СЂР°Р·СЂРµС€РµРЅ'
          : maxDeliveryConfigured
            ? 'РЅСѓР¶РµРЅ canary'
            : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅРѕ',
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
          'MAX РѕСЃС‚Р°РµС‚СЃСЏ РІС‚РѕСЂС‹Рј Р°РґР°РїС‚РµСЂРѕРј: РЅСѓР¶РЅР° СЋСЂРёРґРёС‡РµСЃРєР°СЏ РїРѕРґРіРѕС‚РѕРІРєР° Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ API-РєРѕРЅС‚СЂР°РєС‚.',
        nextAction: maxDeliveryCanAttempt
          ? 'РџСЂРѕРІРµСЃС‚Рё РѕРґРёРЅ MAX canary РЅР° СЃРѕРіР»Р°СЃРѕРІР°РЅРЅРѕРј РіРѕСЃС‚Рµ Рё РїСЂРѕРІРµСЂРёС‚СЊ SENT/FAILED/BLOCKED audit Р±РµР· raw payload.'
          : maxDeliveryConfigured
            ? 'Р’РєР»СЋС‡Р°С‚СЊ GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СѓС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ endpoint, С‚РѕРєРµРЅР°, СЃРѕРіР»Р°СЃРёР№ Рё РѕР±СЂР°Р±РѕС‚РєРё РѕС‚РїРёСЃРѕРє.'
            : 'РќРµ РІРєР»СЋС‡Р°С‚СЊ Р°РІС‚РѕРјР°С‚РёР·Р°С†РёСЋ MAX РґРѕ СѓС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ endpoint, С‚РѕРєРµРЅР°, СЃРѕРіР»Р°СЃРёР№ Рё РѕР±СЂР°Р±РѕС‚РєРё РѕС‚РїРёСЃРѕРє.',
      },
      bonusLedgerScheduler,
      {
        key: 'LANGAME_WRITE_API',
        title: 'Р—Р°РїРёСЃСЊ Р±РѕРЅСѓСЃРѕРІ РІ Langame',
        status: langameBonusAccrualEnabled ? 'READY' : 'MANUAL_ONLY',
        statusLabel: langameBonusAccrualEnabled
          ? 'master endpoint РіРѕС‚РѕРІ'
          : 'РІС‹РєР»СЋС‡РµРЅРѕ',
        ready: langameBonusAccrualEnabled,
        configured: true,
        enabled: langameBonusAccrualEnabled,
        requiredEnv: ['LANGAME_BONUS_ACCRUAL_ENABLED'],
        note: langameBonusAccrualEnabled
          ? 'Р‘РѕРЅСѓСЃРЅС‹Р№ ledger РјРѕР¶РµС‚ РЅР°С‡РёСЃР»СЏС‚СЊ bonus_balance РёР»Рё balance С‡РµСЂРµР· /master_api/guests/balance/phone РїРѕ С‚РµР»РµС„РѕРЅСѓ РіРѕСЃС‚СЏ.'
          : 'Р‘РѕРЅСѓСЃРЅС‹Р№ ledger РіРѕС‚РѕРІ Рє Langame master balance endpoint, РЅРѕ Р±РѕРµРІС‹Рµ СЃРїРёСЃР°РЅРёСЏ Рё РЅР°С‡РёСЃР»РµРЅРёСЏ РІС‹РєР»СЋС‡РµРЅС‹ env-С„Р»Р°РіРѕРј.',
        nextAction:
          'Р’РєР»СЋС‡Р°С‚СЊ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё dry-run, tenant Langame РєР»СЋС‡Р° Рё СЂР°СЃРїРёСЃР°РЅРёСЏ ledger-РґРёСЃРїРµС‚С‡РµСЂР°.',
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
      note: 'Р“РѕС‚РѕРІРЅРѕСЃС‚СЊ РёРЅС‚РµРіСЂР°С†РёР№ РїРѕРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ СѓР¶Рµ РјРѕР¶РЅРѕ С‚РµСЃС‚РёСЂРѕРІР°С‚СЊ, Р° С‡С‚Рѕ С‚СЂРµР±СѓРµС‚ РІРЅРµС€РЅРµРіРѕ РїСЂРѕРІР°Р№РґРµСЂР°, СЃРµРєСЂРµС‚Р°, СЃРѕРіР»Р°СЃРёР№ РёР»Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ API. Р—РЅР°С‡РµРЅРёСЏ СЃРµРєСЂРµС‚РѕРІ РЅРµ СЂР°СЃРєСЂС‹РІР°СЋС‚СЃСЏ.',
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
      'Р Р°Р·РґРµР»',
      'Raw С‚РёРї guests/logs',
      'РќРѕСЂРјР°Р»РёР·РѕРІР°РЅРЅС‹Р№ С‚РёРї',
      'РќР°Р·РІР°РЅРёРµ РІ LeetPlus',
      'Р‘РёР·РЅРµСЃ-РїСЂРµСЃРµС‚',
      'РџСЂРёРјРµРЅРµРЅРёРµ',
      'Р›РѕРіРё РІСЃРµРіРѕ',
      'Р”РѕРјРµРЅ',
      'РџСЂРѕРІР°Р№РґРµСЂ',
      'Р›РѕРіРё РІ РёСЃС‚РѕС‡РЅРёРєРµ',
      'РџРѕСЃР»РµРґРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ',
      'Р—Р°РјРµС‚РєР°',
      'РњР°РїРїРёРЅРі РѕР±РЅРѕРІР»РµРЅ',
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
          'Р¤Р°РєС‚ guests/logs',
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
        'РњР°РїРїРёРЅРі Р±РµР· С„Р°РєС‚Р°',
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
      throw new BadRequestException(
        'РЈРєР°Р¶РёС‚Рµ raw-С‚РёРї СЃРѕР±С‹С‚РёСЏ guests/logs',
      );
    }

    const normalizedType = normalizeGuestLogType(rawType);

    if (!normalizedType) {
      throw new BadRequestException(
        'РќРµ СѓРґР°Р»РѕСЃСЊ РЅРѕСЂРјР°Р»РёР·РѕРІР°С‚СЊ С‚РёРї СЃРѕР±С‹С‚РёСЏ',
      );
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
      throw new NotFoundException(
        'РЎРѕРїРѕСЃС‚Р°РІР»РµРЅРёРµ С‚РёРїР° СЃРѕР±С‹С‚РёСЏ РЅРµ РЅР°Р№РґРµРЅРѕ',
      );
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
            'Р¤Р°РєС‚ РЅРµ РїСЂРёРІСЏР·Р°РЅ Рє РіРѕСЃС‚СЋ Langame РёР»Рё РёРіСЂРѕРІРѕРјСѓ РїСЂРѕС„РёР»СЋ, Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ Р·Р°РїСѓСЃРє РїСЂРѕРїСѓС‰РµРЅ.',
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
            reason: `${activeEligibleRules.length} Р°РєС‚РёРІРЅС‹С… РїСЂР°РІРёР» СЃСЂР°Р±РѕС‚Р°РµС‚, ${dryRun.summary.blockedRules} РїСЂР°РІРёР» Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅРѕ.`,
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
              'РќРµС‚ Р°РєС‚РёРІРЅС‹С… СЃСЂР°Р±РѕС‚Р°РІС€РёС… РїСЂР°РІРёР» РёР»Рё XP РґР»СЏ Р·Р°РїРёСЃРё СЃРѕР±С‹С‚РёСЏ.',
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
              'Р•СЃС‚СЊ СЃСЂР°Р±РѕС‚Р°РІС€РёРµ РїСЂР°РІРёР»Р° РЅРµ РІ ACTIVE-СЃС‚Р°С‚СѓСЃРµ. РџРѕРґС‚РІРµСЂРґРёС‚Рµ С‚Р°РєРѕР№ С„Р°РєС‚ РІСЂСѓС‡РЅСѓСЋ РІ С‚РµСЃС‚РѕРІРѕРј Р·Р°РїСѓСЃРєРµ.',
            dryRun,
            process: null,
          });
          continue;
        }

        const process = await this.processEvent(user, {
          ...processDto,
          note: 'РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ batch pipeline РѕР±СЂР°Р±РѕС‚Р°Р» СЃРѕС…СЂР°РЅРµРЅРЅС‹Р№ LeetPlus/Langame С„Р°РєС‚ РІРЅСѓС‚СЂРё LeetPlus. Р—Р°РїРёСЃСЊ РІ Langame РЅРµ РІС‹РїРѕР»РЅСЏР»Р°СЃСЊ.',
        });

        if (process.summary.idempotent) {
          facts.push({
            ...pipelineFactBase(fact),
            status: 'DUPLICATE',
            reason:
              'Snapshot-С„Р°РєС‚ СѓР¶Рµ Р±С‹Р» РѕР±СЂР°Р±РѕС‚Р°РЅ СЂР°РЅРµРµ.',
            dryRun: process.dryRun,
            process,
          });
          continue;
        }

        facts.push({
          ...pipelineFactBase(fact),
          status: 'PROCESSED',
          reason: `${process.summary.createdRewards} РЅР°РіСЂР°Рґ РІ РѕС‡РµСЂРµРґРё, XP ${process.summary.appliedXpDelta}.`,
          dryRun: process.dryRun,
          process,
        });
      } catch (error) {
        facts.push({
          ...pipelineFactBase(fact),
          status: error instanceof ConflictException ? 'DUPLICATE' : 'ERROR',
          reason:
            error instanceof ConflictException
              ? 'Snapshot-С„Р°РєС‚ СѓР¶Рµ Р±С‹Р» РѕР±СЂР°Р±РѕС‚Р°РЅ СЂР°РЅРµРµ.'
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
        ? 'РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ batch: СЃРѕР±С‹С‚РёСЏ, XP, РЅР°РіСЂР°РґС‹ Рё Langame-Р·Р°РїРёСЃРё РЅРµ СЃРѕР·РґР°РІР°Р»РёСЃСЊ.'
        : 'Batch РѕР±СЂР°Р±РѕС‚Р°Р» С‚РѕР»СЊРєРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рµ snapshot-С„Р°РєС‚С‹ РІРЅСѓС‚СЂРё LeetPlus. Р—Р°РїРёСЃСЊ РІ Langame РЅРµ РІС‹РїРѕР»РЅСЏР»Р°СЃСЊ.',
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
      note: 'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ СЃРѕР·РґР°РЅ РІ LeetPlus.',
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
      'РЎС‚Р°С‚СѓСЃ',
      'РЎРѕСЃС‚РѕСЏРЅРёРµ РєРѕС€РµР»СЊРєР°',
      'Р“РѕСЃС‚СЊ',
      'РљРѕРЅС‚Р°РєС‚',
      'РљР»СѓР±',
      'РўРёРї РЅР°РіСЂР°РґС‹',
      'РќР°Р·РІР°РЅРёРµ РЅР°РіСЂР°РґС‹',
      'РЎСѓРјРјР°',
      'РљРѕРґ',
      'QR payload',
      'РЎРѕР·РґР°РЅРѕ',
      'РЎРіРѕСЂР°РµС‚',
      'Р’С‹РґР°РЅРѕ',
      'РСЃС‚РѕС‡РЅРёРє',
      'РЎРІСЏР·Р°РЅРЅС‹Р№ СЃС†РµРЅР°СЂРёР№',
      'Р—Р°РјРµС‚РєР°',
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
          note: 'Dispatcher РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚ С‚РѕР»СЊРєРѕ Telegram/MAX outbox.',
        });
        continue;
      }

      if (row.readinessStatus !== 'READY_FOR_BOT') {
        const note =
          'Delivery РЅРµ РіРѕС‚РѕРІР° Рє Р±РѕС‚-РґРѕСЃС‚Р°РІРєРµ: СЃРЅР°С‡Р°Р»Р° РЅСѓР¶РЅС‹ СЃРѕРіР»Р°СЃРёРµ, РєР°РЅР°Р» Рё РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅР°СЏ РЅР°РіСЂР°РґР°.';
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
          'Dry-run dispatcher: СЃРѕРѕР±С‰РµРЅРёРµ РїСЂРѕРІРµСЂРµРЅРѕ, РІРЅРµС€РЅСЏСЏ РѕС‚РїСЂР°РІРєР° РЅРµ РІС‹РїРѕР»РЅСЏР»Р°СЃСЊ.';
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
            note: `${communicationQueueChannelLabel(channel)} dispatcher: РѕС‚РїСЂР°РІР»РµРЅРѕ.`,
          },
          include: deliveryInclude,
        });
        sent += 1;
        items.push({
          deliveryId: row.id,
          rewardId: row.rewardId,
          channel,
          status: 'SENT',
          note: 'РЎРѕРѕР±С‰РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ С‡РµСЂРµР· РЅР°СЃС‚СЂРѕРµРЅРЅС‹Р№ provider.',
        });
        await this.createDeliveryEvent(user, updated.id, updated.rewardId, {
          eventType: 'DELIVERY_SENT_BY_PROVIDER',
          fromStatus: row.status,
          toStatus: updated.status,
          channel,
          note: 'РЎРѕРѕР±С‰РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ С‡РµСЂРµР· РЅР°СЃС‚СЂРѕРµРЅРЅС‹Р№ provider.',
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
        ? 'Dispatcher Р·Р°РїСѓС‰РµРЅ РІ Р±РµР·РѕРїР°СЃРЅРѕРј dry-run: СЃРѕР±С‹С‚РёСЏ Р·Р°РїРёСЃР°РЅС‹, РІРЅРµС€РЅРёС… Telegram/MAX-РѕС‚РїСЂР°РІРѕРє РЅРµ Р±С‹Р»Рѕ.'
        : 'Dispatcher РѕР±СЂР°Р±РѕС‚Р°Р» РіРѕС‚РѕРІС‹Рµ Telegram/MAX delivery С‡РµСЂРµР· РЅР°СЃС‚СЂРѕРµРЅРЅС‹Рµ providers.',
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
      'РЎС‚Р°С‚СѓСЃ outbox',
      'Р“РѕС‚РѕРІРЅРѕСЃС‚СЊ',
      'РљР°РЅР°Р»',
      'Р“РѕСЃС‚СЊ',
      'РљРѕРЅС‚Р°РєС‚',
      'РљР»СѓР±',
      'РќР°РіСЂР°РґР°',
      'РЎСѓРјРјР°',
      'Р‘Р»РѕРєРёСЂРѕРІРєРё',
      'РџРѕРґРіРѕС‚РѕРІР»РµРЅРѕ',
      'РћС‚РїСЂР°РІР»РµРЅРѕ',
      'Р—Р°РјРµС‚РєР°',
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
      throw new NotFoundException('Р—Р°РїРёСЃСЊ outbox РЅРµ РЅР°Р№РґРµРЅР°');
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
      'Р Р°Р·РґРµР»',
      'РўРёРї',
      'РЎС†РµРЅР°СЂРёР№',
      'РЎС‚Р°С‚СѓСЃ',
      'РЎРѕР±С‹С‚РёСЏ',
      'РЈРЅРёРєР°Р»СЊРЅС‹Рµ РіРѕСЃС‚Рё',
      'РќР°РіСЂР°РґС‹ РІСЃРµРіРѕ',
      'РћС‡РµСЂРµРґСЊ РЅР°РіСЂР°Рґ',
      'РџР»Р°РЅРѕРІС‹Р№ Р±СЋРґР¶РµС‚',
      'РСЃРїРѕР»СЊР·РѕРІР°РЅРѕ Р±СЋРґР¶РµС‚Р°',
      'РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ Р±СЋРґР¶РµС‚Р°, %',
      'РџРѕРіР°С€РµРЅРѕ РЅР°РіСЂР°Рґ',
      'РџРѕРіР°С€РµРЅРѕ, СЃСѓРјРјР°',
      'XP',
      'РР·РјРµСЂСЏРµРјС‹Рµ СЃРѕР±С‹С‚РёСЏ',
      'Р’РµСЂРЅСѓРІС€РёРµСЃСЏ РіРѕСЃС‚Рё',
      'Р’РѕР·РІСЂР°С‚, %',
      'РЎРµСЃСЃРёРё РїРѕСЃР»Рµ СЃРѕР±С‹С‚РёСЏ',
      'РРіСЂРѕРІС‹Рµ РјРёРЅСѓС‚С‹ РїРѕСЃР»Рµ СЃРѕР±С‹С‚РёСЏ',
      'Р‘Р°СЂ/С‚РѕРІР°СЂС‹ РїРѕСЃР»Рµ СЃРѕР±С‹С‚РёСЏ',
      'РџРѕРїРѕР»РЅРµРЅРёСЏ РїРѕСЃР»Рµ СЃРѕР±С‹С‚РёСЏ',
      'РС‚РѕРіРѕ РІС‹СЂСѓС‡РєР° РїРѕСЃР»Рµ СЃРѕР±С‹С‚РёСЏ',
      'РЎСЂРµРґРЅСЏСЏ РІС‹СЂСѓС‡РєР° РЅР° РІРµСЂРЅСѓРІС€РµРіРѕСЃСЏ',
      'РћРєРЅРѕ СЌС„С„РµРєС‚Р°, РґРЅРµР№',
      'Р РµРєРѕРјРµРЅРґР°С†РёСЏ',
    ];
    const rows: unknown[][] = [
      [
        'Р­РєРѕРЅРѕРјРёРєР°',
        'РЎРІРѕРґРєР°',
        'Р’СЃРµ СЃС†РµРЅР°СЂРёРё',
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
          ? `РђРєС‚РёРІРЅС‹С… СЃС†РµРЅР°СЂРёРµРІ Р±РµР· Р±СЋРґР¶РµС‚Р°: ${economy.summary.rulesWithoutBudget}`
          : '',
      ],
      ...economy.scenarios.map((scenario) => [
        'Р­РєРѕРЅРѕРјРёРєР°',
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
        'Р­С„С„РµРєС‚',
        'РЎРІРѕРґРєР°',
        'Р’СЃРµ СЃС†РµРЅР°СЂРёРё',
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
        'Р­С„С„РµРєС‚',
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

    if (dto.status) {
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

    return mapReward(row);
  }

  async redeemReward(
    user: AuthenticatedUser,
    dto: GuestGameRewardRedeemDto,
  ): Promise<GuestGameReward> {
    const claim = parseRewardClaimInput(dto);

    if (!claim.code) {
      throw new BadRequestException(
        'РЈРєР°Р¶РёС‚Рµ РєРѕРґ РЅР°РіСЂР°РґС‹ РёР»Рё QR payload',
      );
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
      throw new NotFoundException(
        'РќР°РіСЂР°РґР° СЃ С‚Р°РєРёРј РєРѕРґРѕРј РЅРµ РЅР°Р№РґРµРЅР°',
      );
    }

    if (dto.storeId && row.storeId && row.storeId !== dto.storeId) {
      throw new BadRequestException(
        'Р­С‚Р° РЅР°РіСЂР°РґР° РїСЂРёРІСЏР·Р°РЅР° Рє РґСЂСѓРіРѕРјСѓ РєР»СѓР±Сѓ',
      );
    }

    if (row.status === 'PENDING') {
      throw new BadRequestException(
        'РќР°РіСЂР°РґР° РµС‰Рµ РЅРµ СЃРѕРіР»Р°СЃРѕРІР°РЅР°',
      );
    }

    if (row.status === 'PAID') {
      throw new ConflictException('РќР°РіСЂР°РґР° СѓР¶Рµ РїРѕРіР°С€РµРЅР°');
    }

    if (row.status === 'CANCELED') {
      throw new BadRequestException('РќР°РіСЂР°РґР° РѕС‚РјРµРЅРµРЅР°');
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

      throw new BadRequestException(
        'РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ РЅР°РіСЂР°РґС‹ РёСЃС‚РµРє',
      );
    }

    if (row.status !== 'APPROVED') {
      throw new BadRequestException(
        'РџРѕРіР°СЃРёС‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ СЃРѕРіР»Р°СЃРѕРІР°РЅРЅСѓСЋ РЅР°РіСЂР°РґСѓ',
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
      note: `${redeemed.rewardLabel} В· ${redeemed.rewardCode ?? claim.code}`,
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
    const occurredAt = dateValue(dto.occurredAt) ?? new Date();
    const sessionType = nullableString(dto.sessionType) ?? null;
    const sessionPacket = nullableBooleanValue(dto.sessionPacket);
    const sessionMinutes = Math.max(0, intValue(dto.sessionMinutes) ?? 120);
    const spendAmount = Math.max(0, dryRunNumber(dto.spendAmount, 0));
    const tariffGroupId = nullableString(dto.tariffGroupId) ?? null;
    const tariffPeriodId = nullableString(dto.tariffPeriodId) ?? null;
    const tariffTypeId = nullableString(dto.tariffTypeId) ?? null;
    const guestLogType = nullableString(dto.guestLogType) ?? null;
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
      rewards,
    };
    const rules = [
      ...lootBoxes.map((item) => evaluateLootBoxDryRun(item, context)),
      ...missions.map((item) => evaluateMissionDryRun(item, context)),
      ...seasons.map((item) => evaluateSeasonDryRun(item, context)),
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
      guestId: null,
    });
    const eventReference = buildProcessExternalReference(dto, dryRun.eventType);
    const processPayload = buildProcessPayload(dto, dryRun);
    const existingEvent = eventReference
      ? await this.prisma.guestGameEvent.findFirst({
          where: {
            tenantId: user.tenantId,
            externalProvider: eventReference.externalProvider,
            externalDomain: eventReference.externalDomain,
            externalId: eventReference.externalId,
          },
          include: eventInclude,
        })
      : null;

    if (eventReference && existingEvent) {
      return {
        processed: true,
        dryRun,
        event: mapEvent(existingEvent),
        rewards: [],
        summary: {
          profileCreated: false,
          appliedXpDelta: 0,
          createdRewards: 0,
          queuedRewardAmount: 0,
          idempotencyKey: eventReference.externalId,
          idempotent: true,
          langameWrite: false,
        },
        note: 'Snapshot-СЃРѕР±С‹С‚РёРµ СѓР¶Рµ Р±С‹Р»Рѕ РѕР±СЂР°Р±РѕС‚Р°РЅРѕ СЂР°РЅРµРµ; РїРѕРІС‚РѕСЂРЅС‹Р№ Р·Р°РїСѓСЃРє РЅРµ СЃРѕР·РґР°Р» XP, СЃРѕР±С‹С‚РёСЏ РёР»Рё РЅР°РіСЂР°РґС‹.',
      };
    }

    const source: EventSource =
      nullableString(dto.sourceFactKind) === 'LIVE_CHECK_IN'
        ? 'CHECK_IN'
        : 'API_IMPORT';
    const event = await this.createProcessEvent(user, {
      profileId: profile.id,
      guestId: profile.guest?.id ?? dryRun.guest?.id ?? null,
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
        'РџРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ Р·Р°РїСѓСЃРє СЃРѕР±С‹С‚РёСЏ РіРµР№РјРёС„РёРєР°С†РёРё РІ LeetPlus.',
    });
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
      note: 'РЎРѕР±С‹С‚РёРµ Рё РѕС‡РµСЂРµРґСЊ РЅР°РіСЂР°Рґ СЃРѕР·РґР°РЅС‹ РІРЅСѓС‚СЂРё LeetPlus. Р—Р°РїРёСЃСЊ РІ Langame РЅРµ РІС‹РїРѕР»РЅСЏР»Р°СЃСЊ.',
    };
  }

  async checkIn(
    user: AuthenticatedUser,
    dto: GuestGameCheckInDto,
  ): Promise<GuestGameCheckInResult> {
    const guestId = nullableId(dto.guestId);

    if (!guestId) {
      throw new BadRequestException(
        'Р’С‹Р±РµСЂРёС‚Рµ РіРѕСЃС‚СЏ РґР»СЏ С‡РµРєРёРЅР°',
      );
    }

    const guest = await this.getTenantGuest(user, guestId);

    if (!nullableString(guest.externalGuestId)) {
      throw new BadRequestException(
        'РЈ РіРѕСЃС‚СЏ РЅРµС‚ Langame guest_id, РїРѕСЌС‚РѕРјСѓ РїСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІРЅСѓСЋ СЃРµСЃСЃРёСЋ РЅРµР»СЊР·СЏ.',
      );
    }

    let liveSession: CheckInLiveSession | null;

    try {
      liveSession = await this.findActiveCheckInSession(user.tenantId, guest);
    } catch (error) {
      throw new BadRequestException(
        `РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ Р°РєС‚РёРІРЅСѓСЋ СЃРµСЃСЃРёСЋ Langame: ${this.checkInErrorMessage(error)}`,
      );
    }

    if (!liveSession) {
      throw new BadRequestException(
        'РђРєС‚РёРІРЅР°СЏ СЃРµСЃСЃРёСЏ РіРѕСЃС‚СЏ РІ Langame РЅРµ РЅР°Р№РґРµРЅР°. Р§РµРєРёРЅ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РіРѕСЃС‚СЋ, РєРѕС‚РѕСЂС‹Р№ СЃРµР№С‡Р°СЃ РЅР°С…РѕРґРёС‚СЃСЏ РІ РєР»СѓР±Рµ.',
      );
    }

    const expectedStoreId = nullableId(dto.storeId);

    if (
      expectedStoreId &&
      (!liveSession.store || liveSession.store.id !== expectedStoreId)
    ) {
      throw new BadRequestException(
        'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ, С‡С‚Рѕ Р°РєС‚РёРІРЅР°СЏ СЃРµСЃСЃРёСЏ РіРѕСЃС‚СЏ РѕС‚РєСЂС‹С‚Р° РІ СЌС‚РѕРј РєР»СѓР±Рµ.',
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
        'Р“РѕСЃС‚СЊ РїСЂРѕС€РµР» С‡РµРєРёРЅ РІ Р°РєС‚РёРІРЅРѕР№ СЃРµСЃСЃРёРё Langame.',
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
      note: 'Р§РµРєРёРЅ РїРѕРґС‚РІРµСЂР¶РґРµРЅ Р°РєС‚РёРІРЅРѕР№ СЃРµСЃСЃРёРµР№ Langame Рё РѕР±СЂР°Р±РѕС‚Р°РЅ РїСЂР°РІРёР»Р°РјРё РіРµР№РјРёС„РёРєР°С†РёРё.',
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
          'Р­С‚Рѕ СЃРѕР±С‹С‚РёРµ snapshot СѓР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅРѕ. РћР±РЅРѕРІРёС‚Рµ СЃРїРёСЃРѕРє СЃРѕР±С‹С‚РёР№ РёР»Рё РІС‹Р±РµСЂРёС‚Рµ РґСЂСѓРіРѕР№ С„Р°РєС‚.',
        );
      }

      throw error;
    }
  }

  private async createProcessRewards(
    user: AuthenticatedUser,
    dto: GuestGameProcessEventDto,
    dryRun: GuestGameDryRunResult,
    profileId: string,
    eventReference: ProcessExternalReference | null,
  ): Promise<GuestGameReward[]> {
    const guestId = dryRun.guest?.id ?? null;
    const guestExternalId = dryRun.guest?.externalGuestId ?? null;
    const eligibleRules = dryRun.rules.filter(shouldQueueProcessReward);
    const rewards: GuestGameReward[] = [];

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
          status: rule.manualApprovalRequired ? 'PENDING' : 'APPROVED',
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
          qualifiedAt: dryRun.occurredAt,
          note: 'РЎРѕР·РґР°РЅРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рј Р·Р°РїСѓСЃРєРѕРј СЃРѕР±С‹С‚РёСЏ РіРµР№РјРёС„РёРєР°С†РёРё.',
          evidence: {
            source: 'guest_gamification_process_event',
            langameWrite: false,
            sourceFactId: nullableString(dto.sourceFactId),
            sourceFactKind: nullableString(dto.sourceFactKind),
            eventType: dryRun.eventType,
            occurredAt: dryRun.occurredAt,
            input: dryRun.input,
            rule,
          },
          ...link,
        });
        rewards.push(reward);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(
            'РћРґРЅР° РёР· РЅР°РіСЂР°Рґ РїРѕ СЌС‚РѕРјСѓ snapshot СѓР¶Рµ СЃРѕР·РґР°РЅР°. РћР±РЅРѕРІРёС‚Рµ РѕС‡РµСЂРµРґСЊ РЅР°РіСЂР°Рґ.',
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
        throw new NotFoundException(
          'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ',
        );
      }

      return { profile, profileCreated: false };
    }

    if (!dto.guestId) {
      throw new BadRequestException(
        'Р”Р»СЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ Р·Р°РїСѓСЃРєР° РІС‹Р±РµСЂРёС‚Рµ РёРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ РёР»Рё РіРѕСЃС‚СЏ Langame.',
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
        note: 'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ СЃРѕР·РґР°РЅ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рј Р·Р°РїСѓСЃРєРѕРј СЃРѕР±С‹С‚РёСЏ.',
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
      throw new NotFoundException(
        'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ',
      );
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
      note: 'Р­С‚Рѕ РІРЅСѓС‚СЂРµРЅРЅСЏСЏ РіРѕС‚РѕРІРЅРѕСЃС‚СЊ LeetPlus: Telegram/MAX, SMS Рё Langame write API Р·РґРµСЃСЊ РЅРµ РІС‹Р·С‹РІР°СЋС‚СЃСЏ. РџРѕСЃР»Рµ РїРѕРґРєР»СЋС‡РµРЅРёСЏ Р±РѕС‚Р° СЌС‚РѕС‚ СЃР»РѕР№ РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РєР°Рє Р±РµР·РѕРїР°СЃРЅСѓСЋ РѕС‡РµСЂРµРґСЊ РѕС‚РїСЂР°РІРєРё Рё РІС‹РґР°С‡Рё.',
    };
  }

  private buildDeliveryOutbox(
    deliveries: GuestGameDelivery[],
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
      botConsumer: this.buildBotConsumerStatus(deliveries),
      items: deliveries.slice(0, 12),
      note: 'Outbox С…СЂР°РЅРёС‚ РїРѕРґРіРѕС‚РѕРІР»РµРЅРЅС‹Рµ СЃРЅРёРјРєРё РІС‹РґР°С‡Рё РЅР°РіСЂР°Рґ. Р’РЅРµС€РЅРёР№ Telegram/MAX-Р±РѕС‚ РїРѕРєР° РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚ СЌС‚Рё СЃРѕРѕР±С‰РµРЅРёСЏ.',
    };
  }

  private buildBotConsumerStatus(
    deliveries: GuestGameDelivery[],
  ): GuestGameBotConsumerStatus {
    const config = botConsumerConfig();
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
        ? 'РЅСѓР¶РµРЅ canary LIMIT=1'
        : mode === 'READY'
          ? 'РіРѕС‚РѕРІ Рє real-send'
          : mode === 'DRY_RUN'
            ? 'dry-run'
            : 'РЅСѓР¶РЅР° РЅР°СЃС‚СЂРѕР№РєР°',
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
      note: 'РЎС‚Р°С‚СѓСЃ СЃРѕР±СЂР°РЅ РёР· API-visible env, С‚РµРєСѓС‰РµРіРѕ outbox Рё СЃРѕС…СЂР°РЅРµРЅРЅС‹С… ack-СЃРѕР±С‹С‚РёР№. Р•СЃР»Рё runner Р·Р°РїСѓС‰РµРЅ РѕС‚РґРµР»СЊРЅС‹Рј systemd unit СЃРѕ СЃРІРѕРёРј EnvironmentFile, С„Р°РєС‚РёС‡РµСЃРєРёР№ Р·Р°РїСѓСЃРє РїРѕРґС‚РІРµСЂР¶РґР°РµС‚СЃСЏ РїРѕ РЅРѕРІС‹Рј ack-СЃРѕР±С‹С‚РёСЏРј.',
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
          ? 'РіРѕС‚РѕРІ Рє РѕС‚РїСЂР°РІРєРµ'
          : mode === 'DRY_RUN'
            ? 'dry-run'
            : 'РѕС‚РєР»СЋС‡РµРЅ',
      realSendEnabled: config.realSendEnabled,
      providers,
      note:
        mode === 'READY'
          ? 'Dispatcher РјРѕР¶РµС‚ РѕС‚РїСЂР°РІР»СЏС‚СЊ С‚РѕР»СЊРєРѕ РіРѕС‚РѕРІС‹Рµ Telegram/MAX delivery СЃ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рј numeric chat_id РёР»Рё РЅР°СЃС‚СЂРѕРµРЅРЅС‹Рј provider.'
          : mode === 'DRY_RUN'
            ? 'Р‘РµР·РѕРїР°СЃРЅС‹Р№ СЂРµР¶РёРј: dispatcher РїСЂРѕРІРµСЂСЏРµС‚ outbox Рё РїРёС€РµС‚ audit-СЃРѕР±С‹С‚РёСЏ, РЅРѕ РЅРµ РѕС‚РїСЂР°РІР»СЏРµС‚ РІРЅРµС€РЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ.'
            : 'Р’РЅРµС€РЅРёРµ providers РЅРµ РіРѕС‚РѕРІС‹: РІРєР»СЋС‡РёС‚Рµ env-С„Р»Р°РіРё Рё РЅР°СЃС‚СЂРѕР№С‚Рµ С‚РѕРєРµРЅС‹ РїРѕСЃР»Рµ СЋСЂРёРґРёС‡РµСЃРєРѕР№ Рё С‚РµС…РЅРёС‡РµСЃРєРѕР№ РїРѕРґРіРѕС‚РѕРІРєРё.',
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
          name: 'Р СѓС‡РЅС‹Рµ РЅР°РіСЂР°РґС‹ Рё СЃРѕР±С‹С‚РёСЏ',
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
          name: 'Р СѓС‡РЅС‹Рµ СЃРѕР±С‹С‚РёСЏ',
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

    return clean({
      tenantId: isCreate ? user.tenantId : undefined,
      audienceId: nullableId(dto.audienceId),
      createdByUserId: isCreate ? actorUserId(user) : undefined,
      name: requiredString(
        dto.name,
        'РќР°Р·РІР°РЅРёРµ Р»СѓС‚Р±РѕРєСЃР°',
        isCreate,
      ),
      status: enumValue(
        dto.status,
        statusValues,
        isCreate ? 'DRAFT' : undefined,
      ),
      triggerKind:
        stringValue(dto.triggerKind) ??
        (isCreate ? 'SESSION_START' : undefined),
      rewardType:
        stringValue(dto.rewardType) ?? (isCreate ? 'PROMOCODE' : undefined),
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
      name: requiredString(dto.name, 'РќР°Р·РІР°РЅРёРµ РјРёСЃСЃРёРё', isCreate),
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
      name: requiredString(dto.name, 'РќР°Р·РІР°РЅРёРµ СЃРµР·РѕРЅР°', isCreate),
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
        status === 'APPROVED' || status === 'PAID' ? user.id : undefined,
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
      rewardType: requiredString(
        dto.rewardType,
        'РўРёРї РЅР°РіСЂР°РґС‹',
        isCreate,
      ),
      rewardAmount:
        decimalValue(dto.rewardAmount) ??
        (isCreate ? new Prisma.Decimal(0) : undefined),
      rewardLabel: requiredString(
        dto.rewardLabel,
        'РќР°Р·РІР°РЅРёРµ РЅР°РіСЂР°РґС‹',
        isCreate,
      ),
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
      eventType: requiredString(dto.eventType, 'РўРёРї СЃРѕР±С‹С‚РёСЏ', true),
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
      throw new NotFoundException(
        'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ',
      );
    }

    return row;
  }

  private async assertLootBox(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameLootBox.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('Р›СѓС‚Р±РѕРєСЃ РЅРµ РЅР°Р№РґРµРЅ');
    }

    return row;
  }

  private async assertMission(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameMission.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException(
        'РРіСЂРѕРІР°СЏ РјРёСЃСЃРёСЏ РЅРµ РЅР°Р№РґРµРЅР°',
      );
    }

    return row;
  }

  private async assertSeason(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameSeason.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('РЎРµР·РѕРЅ РЅРµ РЅР°Р№РґРµРЅ');
    }

    return row;
  }

  private async assertReward(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestGameReward.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('РќР°РіСЂР°РґР° РЅРµ РЅР°Р№РґРµРЅР°');
    }

    return row;
  }

  private async assertAudience(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.guestAudience.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException(
        'Р“СЂСѓРїРїР° РіРѕСЃС‚РµР№ РЅРµ РЅР°Р№РґРµРЅР°',
      );
    }

    return row;
  }

  private async assertStore(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.store.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!row) {
      throw new NotFoundException('РљР»СѓР± РЅРµ РЅР°Р№РґРµРЅ');
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
        : 'РЅРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°';

    if (message.toLowerCase().includes('not configured')) {
      return 'РёРЅС‚РµРіСЂР°С†РёСЏ Langame РЅРµ РЅР°СЃС‚СЂРѕРµРЅР°';
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
      throw new NotFoundException('Р“РѕСЃС‚СЊ РЅРµ РЅР°Р№РґРµРЅ');
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
      throw new NotFoundException('CRM-РіРѕСЃС‚СЊ РЅРµ РЅР°Р№РґРµРЅ');
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
      'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ',
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
            row.guest.phoneMasked ??
            row.guest.emailMasked ??
            'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
        }
      : null,
    lead: row.lead
      ? {
          id: row.lead.id,
          displayName: row.lead.fullNameMasked ?? 'CRM-РіРѕСЃС‚СЊ',
          contact:
            row.lead.phoneMasked ??
            row.lead.emailMasked ??
            'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
            row.guest.phoneMasked ??
            row.guest.emailMasked ??
            'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
    note: 'РЎРІРµСЂРєР° СЃСЂР°РІРЅРёРІР°РµС‚ С‚РµРєСѓС‰РёР№ GuestBonusBalanceCurrent СЃ РїРѕСЃР»РµРґРЅРёРј СЃРѕС…СЂР°РЅРµРЅРЅС‹Рј GuestBonusBalanceSnapshot РїРѕ guestId РёР»Рё РІРЅРµС€РЅРµРјСѓ Langame-id. Live-Р·Р°РїСЂРѕСЃС‹ РІ Langame РїСЂРё РѕС‚РєСЂС‹С‚РёРё СЃС‚СЂР°РЅРёС†С‹ РЅРµ РІС‹РїРѕР»РЅСЏСЋС‚СЃСЏ.',
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
    row.guest?.fullNameMasked ??
    row.externalGuestId ??
    'РіРѕСЃС‚СЊ Р±РµР· РїСЂРѕС„РёР»СЏ';
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
      stateLabel: 'РЅРµС‚ snapshot',
      note: 'Р”Р»СЏ С‚РµРєСѓС‰РµРіРѕ Р±РѕРЅСѓСЃРЅРѕРіРѕ Р±Р°Р»Р°РЅСЃР° РµС‰Рµ РЅРµС‚ РёСЃС‚РѕСЂРёС‡РµСЃРєРѕРіРѕ Langame snapshot. РќСѓР¶РµРЅ СЃР»РµРґСѓСЋС‰РёР№ guest foundation sync.',
    };
  }

  if (!snapshotIsFresh) {
    return {
      state: 'WAITING_SYNC',
      stateLabel: 'Р¶РґРµС‚ sync',
      note:
        source === 'LANGAME_LEDGER'
          ? 'Р‘Р°Р»Р°РЅСЃ СѓР¶Рµ РѕР±РЅРѕРІР»РµРЅ ledger-РЅР°С‡РёСЃР»РµРЅРёРµРј, РЅРѕ РЅРѕС‡РЅРѕР№ Langame snapshot РµС‰Рµ РЅРµ РїРѕРґС‚РІРµСЂРґРёР» РЅРѕРІРѕРµ Р·РЅР°С‡РµРЅРёРµ.'
          : 'РўРµРєСѓС‰Р°СЏ Р·Р°РїРёСЃСЊ СЃРІРµР¶РµРµ РїРѕСЃР»РµРґРЅРµРіРѕ РЅР°Р№РґРµРЅРЅРѕРіРѕ snapshot: РґРѕР¶РґРёС‚РµСЃСЊ СЃР»РµРґСѓСЋС‰РµР№ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё Р±Р°Р»Р°РЅСЃРѕРІ.',
    };
  }

  if (diff !== null && Math.abs(diff) <= 0.01) {
    return {
      state: 'MATCHED',
      stateLabel: 'СЃРѕС€Р»РѕСЃСЊ',
      note: 'РџРѕСЃР»РµРґРЅРёР№ Langame snapshot СЃРѕРІРїР°РґР°РµС‚ СЃ С‚РµРєСѓС‰РёРј Р±РѕРЅСѓСЃРЅС‹Рј Р±Р°Р»Р°РЅСЃРѕРј LeetPlus.',
    };
  }

  return {
    state: 'MISMATCH',
    stateLabel: 'СЂР°СЃС…РѕР¶РґРµРЅРёРµ',
    note: 'РўРµРєСѓС‰РёР№ Р±РѕРЅСѓСЃРЅС‹Р№ Р±Р°Р»Р°РЅСЃ LeetPlus РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РїРѕСЃР»РµРґРЅРµРіРѕ Langame snapshot: РЅСѓР¶РЅР° СЂСѓС‡РЅР°СЏ СЃРІРµСЂРєР° РіРѕСЃС‚СЏ Рё ledger-РѕРїРµСЂР°С†РёР№.',
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
    note: 'Р–СѓСЂРЅР°Р» РїРѕРєР°Р·С‹РІР°РµС‚ РїРѕСЃР»РµРґРЅРёРµ bonus-ledger РѕРїРµСЂР°С†РёРё РіРµР№РјРёС„РёРєР°С†РёРё Р±РµР· raw phone, С‚РѕРєРµРЅРѕРІ Рё РїРѕР»РЅРѕРіРѕ Langame payload. РЎРІРµСЂРєР° СЃС‡РёС‚Р°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїРѕ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рј GuestBonusBalanceSnapshot РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ РЅР°С‡РёСЃР»РµРЅРёСЏ.',
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
    'Р“РѕСЃС‚СЊ РЅРµ СЃРІСЏР·Р°РЅ';
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
      stateLabel: 'РЅРµ С‚СЂРµР±СѓРµС‚СЃСЏ',
      latestSnapshotAt: null,
      latestSnapshotBalance: null,
      expectedBalance,
      diff: null,
      note: 'Р—Р°РїРёСЃСЊ РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅР° РІ Langame, СЃРІРµСЂРєР° Р±Р°Р»Р°РЅСЃР° РЅРµ С‚СЂРµР±СѓРµС‚СЃСЏ.',
    };
  }

  if (row.status !== 'CONFIRMED') {
    return {
      state: 'NOT_READY',
      stateLabel: 'СЂР°РЅРѕ СЃРІРµСЂСЏС‚СЊ',
      latestSnapshotAt: null,
      latestSnapshotBalance: null,
      expectedBalance,
      diff: null,
      note: 'РЎРЅР°С‡Р°Р»Р° РЅСѓР¶РЅРѕ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РЅР°С‡РёСЃР»РµРЅРёРµ С‡РµСЂРµР· bonus ledger dispatcher.',
    };
  }

  if (
    !snapshot ||
    !row.confirmedAt ||
    snapshot.snapshotDate.getTime() < row.confirmedAt.getTime()
  ) {
    return {
      state: 'WAITING_SYNC',
      stateLabel: 'Р¶РґРµС‚ snapshot',
      latestSnapshotAt: snapshot ? snapshot.snapshotDate.toISOString() : null,
      latestSnapshotBalance: snapshot
        ? numberValue(snapshot.bonusBalance)
        : null,
      expectedBalance,
      diff: null,
      note: 'РќР°С‡РёСЃР»РµРЅРёРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ, РЅРѕ РµС‰Рµ РЅРµС‚ СЃРІРµР¶РµРіРѕ Langame snapshot РїРѕСЃР»Рµ РѕРїРµСЂР°С†РёРё.',
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
    stateLabel: matched ? 'СЃРѕС€Р»РѕСЃСЊ' : 'СЂР°СЃС…РѕР¶РґРµРЅРёРµ',
    latestSnapshotAt: snapshot.snapshotDate.toISOString(),
    latestSnapshotBalance,
    expectedBalance,
    diff,
    note: matched
      ? 'РџРѕСЃР»РµРґРЅРёР№ Langame snapshot СЃРѕРІРїР°РґР°РµС‚ СЃ РѕР¶РёРґР°РµРјС‹Рј Р±Р°Р»Р°РЅСЃРѕРј РїРѕСЃР»Рµ ledger-РЅР°С‡РёСЃР»РµРЅРёСЏ.'
      : 'Langame snapshot РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ РѕР¶РёРґР°РµРјРѕРіРѕ Р±Р°Р»Р°РЅСЃР°: РЅСѓР¶РЅР° СЂСѓС‡РЅР°СЏ СЃРІРµСЂРєР° РїРѕ РіРѕСЃС‚СЋ Рё РѕРїРµСЂР°С†РёРё.',
  };
}

function bonusLedgerNextAction(
  row: BonusLedgerAuditRow,
  retryReady: boolean,
  reconciliation: GuestGameBonusLedgerAuditItem['reconciliation'],
) {
  if (row.status === 'PENDING') {
    return 'Р—Р°РїСѓСЃС‚РёС‚СЊ bonus-ledger dispatch РёР»Рё РґРѕР¶РґР°С‚СЊСЃСЏ scheduled dispatcher.';
  }

  if (row.status === 'PROCESSING') {
    return 'РџСЂРѕРІРµСЂРёС‚СЊ, РЅРµ Р·Р°РІРёСЃ Р»Рё worker; stale-lock РІРµСЂРЅРµС‚ Р·Р°РїРёСЃСЊ РІ РѕР±СЂР°Р±РѕС‚РєСѓ РїРѕ СЂР°СЃРїРёСЃР°РЅРёСЋ.';
  }

  if (row.status === 'FAILED') {
    return retryReady
      ? 'РџРѕРІС‚РѕСЂРёС‚СЊ dispatch РїРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё Langame-РєР»СЋС‡Р°, С‚РµР»РµС„РѕРЅР° РіРѕСЃС‚СЏ Рё РґРѕРјРµРЅР° РєР»СѓР±Р°.'
      : 'Р”РѕР¶РґР°С‚СЊСЃСЏ nextAttemptAt РёР»Рё РІСЂСѓС‡РЅСѓСЋ СЂР°Р·РѕР±СЂР°С‚СЊ РѕС€РёР±РєСѓ РїРµСЂРµРґ РїРѕРІС‚РѕСЂРѕРј.';
  }

  if (row.status === 'CONFIRMED') {
    if (reconciliation.state === 'MATCHED') {
      return 'РћРїРµСЂР°С†РёСЏ Р·Р°РєСЂС‹С‚Р°: РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РµРµ РєР°Рє СЌС‚Р°Р»РѕРЅ РїРёР»РѕС‚РЅРѕРіРѕ РЅР°С‡РёСЃР»РµРЅРёСЏ.';
    }

    if (reconciliation.state === 'MISMATCH') {
      return 'РЎРІРµСЂРёС‚СЊ РіРѕСЃС‚СЏ РІ Langame Рё РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РѕС„РѕСЂРјРёС‚СЊ РѕР±СЂР°С‚РЅСѓСЋ/РєРѕСЂСЂРµРєС‚РёСЂСѓСЋС‰СѓСЋ РѕРїРµСЂР°С†РёСЋ.';
    }

    return 'Р”РѕР¶РґР°С‚СЊСЃСЏ guest foundation sync Рё РЅРѕС‡РЅРѕРіРѕ bonus balance snapshot РґР»СЏ С„РёРЅР°Р»СЊРЅРѕР№ СЃРІРµСЂРєРё.';
  }

  if (row.status === 'CANCELED') {
    return 'РћСЃС‚Р°РІРёС‚СЊ РѕС‚РјРµРЅСѓ РІ Р°СѓРґРёС‚Рµ; РґР»СЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹С… РѕРїРµСЂР°С†РёР№ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РѕС‚РґРµР»СЊРЅСѓСЋ РѕР±СЂР°С‚РЅСѓСЋ Р·Р°РїРёСЃСЊ.';
  }

  return 'РџСЂРѕРІРµСЂРёС‚СЊ СЃС‚Р°С‚СѓСЃ ledger-Р·Р°РїРёСЃРё РїРµСЂРµРґ СЃР»РµРґСѓСЋС‰РµР№ РѕРїРµСЂР°С†РёРµР№.';
}

function bonusLedgerStatusLabel(status: string) {
  switch (status) {
    case 'PENDING':
      return 'РІ РѕС‡РµСЂРµРґРё';
    case 'PROCESSING':
      return 'РѕР±СЂР°Р±РѕС‚РєР°';
    case 'CONFIRMED':
      return 'РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ';
    case 'FAILED':
      return 'РѕС€РёР±РєР°';
    case 'CANCELED':
      return 'РѕС‚РјРµРЅРµРЅРѕ';
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
            row.guest.phoneMasked ??
            row.guest.emailMasked ??
            'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
    blockers.push(
      'РќРµС‚ СЃРІСЏР·Р°РЅРЅРѕРіРѕ РёРіСЂРѕРІРѕРіРѕ РїСЂРѕС„РёР»СЏ РіРѕСЃС‚СЏ.',
    );
  }

  if (reward.walletState === 'WAITING_APPROVAL') {
    blockers.push(
      'РќР°РіСЂР°РґСѓ РЅСѓР¶РЅРѕ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РїРµСЂРµРґ РІС‹РґР°С‡РµР№ РёР»Рё СѓРІРµРґРѕРјР»РµРЅРёРµРј.',
    );
  }

  if (reward.walletState === 'READY') {
    if (consentStatus === 'UNSUBSCRIBED') {
      blockers.push(
        'Р“РѕСЃС‚СЊ РѕС‚РїРёСЃР°Р»СЃСЏ РѕС‚ РёРіСЂРѕРІС‹С… РєРѕРјРјСѓРЅРёРєР°С†РёР№.',
      );
    } else if (consentStatus === 'DENIED') {
      blockers.push(
        'Р“РѕСЃС‚СЊ РѕС‚РєР°Р·Р°Р»СЃСЏ РѕС‚ РёРіСЂРѕРІС‹С… РєРѕРјРјСѓРЅРёРєР°С†РёР№.',
      );
    } else if (consentStatus !== 'GRANTED') {
      blockers.push(
        'РќРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ СЃРѕРіР»Р°СЃРёСЏ РЅР° РёРіСЂРѕРІС‹Рµ РєРѕРјРјСѓРЅРёРєР°С†РёРё.',
      );
    }

    if (!telegramReady && !maxReady) {
      blockers.push('Telegram/MAX alias РµС‰Рµ РЅРµ РїСЂРёРІСЏР·Р°РЅ.');
    }

    if (!rewardCodeReady) {
      blockers.push(
        'РљРѕРґ РєР°СЃСЃРёСЂР° РµС‰Рµ РЅРµ СЃРѕР·РґР°РЅ РґР»СЏ СЂСѓС‡РЅРѕР№ РІС‹РґР°С‡Рё.',
      );
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
      'Р“РѕСЃС‚СЊ',
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
    READY_FOR_BOT: 'РіРѕС‚РѕРІРѕ Рє Р±РѕС‚Сѓ',
    READY_FOR_CASHIER: 'РіРѕС‚РѕРІРѕ РєР°СЃСЃРёСЂСѓ',
    NEEDS_APPROVAL: 'РЅСѓР¶РЅРѕ РїРѕРґС‚РІРµСЂРґРёС‚СЊ',
    NEEDS_CONSENT: 'РЅРµС‚ СЃРѕРіР»Р°СЃРёСЏ',
    NEEDS_CHANNEL: 'РЅРµС‚ РєР°РЅР°Р»Р°',
    UNSUBSCRIBED: 'РѕС‚РїРёСЃР°Р»СЃСЏ',
    EXPIRED: 'СЃСЂРѕРє РёСЃС‚РµРє',
    REDEEMED: 'РїРѕРіР°С€РµРЅРѕ',
    CANCELED: 'РѕС‚РјРµРЅРµРЅРѕ',
  };

  return labels[status];
}

function communicationQueueNextAction(
  status: GuestGameCommunicationQueueStatus,
) {
  const actions: Record<GuestGameCommunicationQueueStatus, string> = {
    READY_FOR_BOT:
      'РџРѕСЃР»Рµ РїРѕРґРєР»СЋС‡РµРЅРёСЏ Telegram/MAX-Р±РѕС‚Р° РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ РёРіСЂРѕРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ.',
    READY_FOR_CASHIER:
      'Р’С‹РґР°Р№С‚Рµ РЅР°РіСЂР°РґСѓ РїРѕ РєРѕРґСѓ РєР°СЃСЃРёСЂР° РёР»Рё РїРѕРїСЂРѕСЃРёС‚Рµ РіРѕСЃС‚СЏ РїСЂРёРІСЏР·Р°С‚СЊ Telegram/MAX.',
    NEEDS_APPROVAL:
      'РџРѕРґС‚РІРµСЂРґРёС‚Рµ РЅР°РіСЂР°РґСѓ РІ РєРѕС€РµР»СЊРєРµ.',
    NEEDS_CONSENT:
      'РџРѕР»СѓС‡РёС‚Рµ СЃРѕРіР»Р°СЃРёРµ РіРѕСЃС‚СЏ РІ РїСѓР±Р»РёС‡РЅРѕРј РєР°Р±РёРЅРµС‚Рµ РёР»Рё РїСЂРё СЂСѓС‡РЅРѕРј РєРѕРЅС‚Р°РєС‚Рµ.',
    NEEDS_CHANNEL:
      'РџСЂРёРІСЏР¶РёС‚Рµ Telegram/MAX alias РёР»Рё РІС‹РґР°Р№С‚Рµ РЅР°РіСЂР°РґСѓ С‡РµСЂРµР· СЂСѓС‡РЅРѕР№ РєРѕРґ.',
    UNSUBSCRIBED:
      'РќРµ РѕС‚РїСЂР°РІР»СЏР№С‚Рµ СЃРѕРѕР±С‰РµРЅРёСЏ; РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ СЂСѓС‡РЅР°СЏ РѕР±СЂР°Р±РѕС‚РєР°.',
    EXPIRED:
      'РџСЂРѕРІРµСЂСЊС‚Рµ СЃСЂРѕРє Рё РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё СЃРѕР·РґР°Р№С‚Рµ РЅРѕРІСѓСЋ РЅР°РіСЂР°РґСѓ.',
    REDEEMED: 'Р”РµР№СЃС‚РІРёР№ РЅРµ С‚СЂРµР±СѓРµС‚СЃСЏ.',
    CANCELED: 'Р”РµР№СЃС‚РІРёР№ РЅРµ С‚СЂРµР±СѓРµС‚СЃСЏ.',
  };

  return actions[status];
}

function communicationQueueChannelLabel(
  channel: GuestGameCommunicationQueueItem['channel'],
) {
  const labels: Record<GuestGameCommunicationQueueItem['channel'], string> = {
    TELEGRAM: 'Telegram',
    MAX: 'MAX',
    CASHIER: 'РљР°СЃСЃРёСЂ',
    MANUAL: 'Р СѓС‡РЅР°СЏ РІС‹РґР°С‡Р°',
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
    return `Р›СѓС‚Р±РѕРєСЃ: ${reward.lootBox.name}`;
  }

  if (reward.mission) {
    return `РњРёСЃСЃРёСЏ: ${reward.mission.name}`;
  }

  if (reward.season) {
    return `Battle Pass: ${reward.season.name}`;
  }

  return 'Р СѓС‡РЅР°СЏ РЅР°РіСЂР°РґР°';
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
    READY: 'РіРѕС‚РѕРІРѕ',
    BLOCKED: 'РЅСѓР¶РЅРѕ РґРµР№СЃС‚РІРёРµ',
    SENT: 'РѕС‚РїСЂР°РІР»РµРЅРѕ/РІС‹РґР°РЅРѕ',
    FAILED: 'РѕС€РёР±РєР°',
    CANCELED: 'РѕС‚РјРµРЅРµРЅРѕ',
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
  return `Р’Р°С€Р° РЅР°РіСЂР°РґР°: ${item.rewardLabel}`;
}

function buildDeliveryMessageBody(item: GuestGameCommunicationQueueItem) {
  const amount =
    item.rewardAmount > 0 ? ` РЅР° ${item.rewardAmount} СЂСѓР±.` : '';
  const club = item.store ? ` РІ РєР»СѓР±Рµ ${item.store.name}` : '';
  const expires = item.expiresAt
    ? ` Р”РµР№СЃС‚РІСѓРµС‚ РґРѕ ${new Date(item.expiresAt).toLocaleDateString('ru-RU')}.`
    : '';

  return `Р’ LeetPlus РґР»СЏ РІР°СЃ РїРѕРґРіРѕС‚РѕРІР»РµРЅР° РЅР°РіСЂР°РґР°${amount}${club}: ${item.rewardLabel}.${expires} РџРѕРєР°Р¶РёС‚Рµ РєРѕРґ РєР°СЃСЃРёСЂСѓ РёР»Рё РѕС‚РєСЂРѕР№С‚Рµ Р»РёС‡РЅС‹Р№ РєР°Р±РёРЅРµС‚ РіРѕСЃС‚СЏ.`;
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
      : 'provider РЅРµ РЅР°СЃС‚СЂРѕРµРЅ';
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
        value: realSendEnabled ? 'РІРєР»СЋС‡РµРЅ' : 'РІС‹РєР»СЋС‡РµРЅ',
      },
      {
        label: 'РљР°РЅР°Р» SMS',
        value: smsEnabled ? 'РІРєР»СЋС‡РµРЅ' : 'РІС‹РєР»СЋС‡РµРЅ',
      },
      {
        label: 'Provider',
        value: smsProviderLabel,
      },
      {
        label: 'SMS.ru api_id',
        value: smsRuConfigured
          ? 'РЅР°СЃС‚СЂРѕРµРЅ'
          : 'РЅСѓР¶РµРЅ РёР»Рё fallback Callcheck',
      },
      {
        label: 'Generic provider',
        value: genericSmsConfigured
          ? 'РЅР°СЃС‚СЂРѕРµРЅ'
          : 'РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ',
      },
      {
        label: 'SMS.ru test-mode',
        value: smsRuTestMode ? 'test=1' : 'РІС‹РєР»СЋС‡РµРЅ',
      },
      {
        label: 'SMS.ru live canary',
        value: smsRuConfigured
          ? smsRuLiveCanaryReady
            ? smsRuTestMode
              ? 'staged test-mode'
              : 'canary РІРєР»СЋС‡РµРЅ'
            : 'РЅСѓР¶РµРЅ canary'
          : 'РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ',
      },
      ...smsRateLimits.details,
    ],
    configuredNote:
      'SMS-РєРѕРґ РіРѕС‚РѕРІ РєР°Рє СЂРµР·РµСЂРІРЅС‹Р№ РєР°РЅР°Р»: backend РѕС‚РїСЂР°РІРёС‚ OTP С‡РµСЂРµР· SMS.ru /sms/send РёР»Рё СЃРѕРІРјРµСЃС‚РёРјС‹Р№ generic SMS provider С‚РѕР»СЊРєРѕ РїСЂРё РІРєР»СЋС‡РµРЅРЅРѕРј real-send Рё Р°РєС‚РёРІРЅС‹С… rate-limit/budget guards.',
    blockedNote:
      'SMS OTP РЅРµ РіРѕС‚РѕРІ: РЅСѓР¶РµРЅ real-send, С„Р»Р°Рі SMS-РєР°РЅР°Р»Р° Рё SMS.ru api_id Р»РёР±Рѕ generic endpoint/token.',
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
      ? 'SMS.ru provider РЅР°СЃС‚СЂРѕРµРЅ, РЅРѕ live-СЂРµР¶РёРј РЅРµР»СЊР·СЏ СЃС‡РёС‚Р°С‚СЊ РіРѕС‚РѕРІС‹Рј Р±РµР· staged test-mode РёР»Рё РѕС‚РґРµР»СЊРЅРѕРіРѕ controlled canary-С„Р»Р°РіР°.'
      : smsRateLimits.ready
        ? undefined
        : 'SMS OTP provider РЅР°СЃС‚СЂРѕРµРЅ, РЅРѕ live-СЂРµР¶РёРј РЅРµР»СЊР·СЏ СЃС‡РёС‚Р°С‚СЊ РіРѕС‚РѕРІС‹Рј: РѕРґРёРЅ РёР»Рё РЅРµСЃРєРѕР»СЊРєРѕ rate-limit/budget env РѕС‚РєР»СЋС‡РµРЅС‹.',
    nextAction:
      'РџСЂРѕРІРµСЃС‚Рё staged QA СЃ GUEST_PORTAL_OTP_SMS_RU_TEST_MODE=true, Р·Р°С‚РµРј РІРєР»СЋС‡Р°С‚СЊ live SMS С‚РѕР»СЊРєРѕ С‡РµСЂРµР· GUEST_PORTAL_OTP_SMS_RU_LIVE_CANARY_ENABLED=true, Р°РєС‚РёРІРЅС‹Рµ Р»РёРјРёС‚С‹, provider-Р±СЋРґР¶РµС‚ Рё delivery audit Р±РµР· СЂР°СЃРєСЂС‹С‚РёСЏ РєРѕРґР°.',
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
      'Telegram token РЅР°Р№РґРµРЅ; OTP РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ С‚РѕР»СЊРєРѕ РіРѕСЃС‚СЋ СЃ СѓР¶Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Рј numeric chat_id.',
    blockedNote:
      'Telegram OTP РЅРµ РіРѕС‚РѕРІ: РЅСѓР¶РµРЅ bot token, РІРєР»СЋС‡РµРЅРЅС‹Р№ РєР°РЅР°Р» Рё Р·Р°СЂР°РЅРµРµ РїСЂРёРІСЏР·Р°РЅРЅС‹Р№ РіРѕСЃС‚РµРј Telegram.',
    nextAction:
      'РЎРЅР°С‡Р°Р»Р° РїСЂРѕРІРµСЂРёС‚СЊ deep link Рё webhook РїСЂРёРІСЏР·РєРё Р±РѕС‚Р°, Р·Р°С‚РµРј РІРєР»СЋС‡Р°С‚СЊ OTP С‚РѕР»СЊРєРѕ РґР»СЏ РїСЂРѕС„РёР»РµР№ СЃ СЃРѕС…СЂР°РЅРµРЅРЅС‹Рј chat:<id>.',
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
      'MAX provider РёРјРµРµС‚ endpoint Рё token, РЅРѕ РєР°РЅР°Р» РѕСЃС‚Р°РµС‚СЃСЏ РІС‚РѕСЂС‹Рј Р°РґР°РїС‚РµСЂРѕРј РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅРѕРіРѕ production-РєРѕРЅС‚СЂР°РєС‚Р°.',
    blockedNote:
      'MAX OTP РЅРµ РіРѕС‚РѕРІ: РЅСѓР¶РµРЅ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ provider endpoint/token, СЋСЂРёРґРёС‡РµСЃРєР°СЏ СЃС…РµРјР° Рё РѕС‚РїРёСЃРєРё.',
    nextAction:
      'MAX РІРєР»СЋС‡Р°С‚СЊ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СѓС‚РІРµСЂР¶РґРµРЅРёСЏ API-РєРѕРЅС‚СЂР°РєС‚Р°, consent-СЃС†РµРЅР°СЂРёСЏ, РѕР±СЂР°Р±РѕС‚РєРё РѕС‚РїРёСЃРѕРє Рё С‚РµСЃС‚Р° РЅР° РѕС‚РґРµР»СЊРЅРѕРј РіРѕСЃС‚Рµ.',
  });
  const providers = [sms, telegram, max];
  const readyProviders = providers.filter((provider) => provider.ready);
  const partialProviders = providers.filter(
    (provider) => provider.status === 'PARTIAL',
  );
  const ready = readyProviders.length > 0;
  const readyProviderLabels = readyProviders
    .map((provider) => provider.statusLabel.replace(' РіРѕС‚РѕРІ', ''))
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
      ? 'provider РіРѕС‚РѕРІ'
      : devEnabled
        ? 'demo-РєРѕРґ'
        : status === 'PARTIAL'
          ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
          : 'РЅСѓР¶РµРЅ provider',
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
      ? `Production OTP РёРјРµРµС‚ РіРѕС‚РѕРІС‹Р№ РєР°РЅР°Р»: ${readyProviderLabels}. Р“РѕСЃС‚РµРІРѕР№ РїРѕСЂС‚Р°Р» РЅРµ РїРѕРєР°Р·С‹РІР°РµС‚ РєРѕРґ Рё РёСЃРїРѕР»СЊР·СѓРµС‚ Р±РµР·РѕРїР°СЃРЅС‹Р№ guest-token.`
      : devEnabled
        ? 'Р’РєР»СЋС‡РµРЅ dev/demo OTP: РїРѕРґС…РѕРґРёС‚ РґР»СЏ С‚РµСЃС‚Р°, РЅРѕ РЅРµ РґР»СЏ production-РІРµСЂРёС„РёРєР°С†РёРё РіРѕСЃС‚РµР№.'
        : 'Р РµР°Р»СЊРЅР°СЏ SMS/Telegram/MAX-РґРѕСЃС‚Р°РІРєР° OTP РµС‰Рµ РЅРµ РїРѕРґРєР»СЋС‡РµРЅР°; Р±РµР· dev/demo-РєРѕРґР° РіРѕСЃС‚РµРІРѕР№ РІС…РѕРґ РЅРµ РїСЂРѕР№РґРµС‚.',
    nextAction: ready
      ? 'РџСЂРѕРІРµСЂРёС‚СЊ РѕРґРёРЅ С‚РµСЃС‚РѕРІС‹Р№ РІС…РѕРґ РіРѕСЃС‚СЏ Рё delivery audit РїРѕ РІС‹Р±СЂР°РЅРЅРѕРјСѓ РєР°РЅР°Р»Сѓ, РЅРµ РІРєР»СЋС‡Р°СЏ РјР°СЃСЃРѕРІС‹Рµ РєРѕРјРјСѓРЅРёРєР°С†РёРё.'
      : 'РЎРѕРіР»Р°СЃРѕРІР°С‚СЊ OTP-РїСЂРѕРІР°Р№РґРµСЂР° Рё consent-СЃС†РµРЅР°СЂРёР№; demo-РєРѕРґ РІРєР»СЋС‡Р°С‚СЊ С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµСЃС‚РѕРІ, production Р·Р°РїСѓСЃРєР°С‚СЊ РїРѕ РѕРґРЅРѕРјСѓ РєР°РЅР°Р»Сѓ.',
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
    provider === 'SMS_RU_CALLCHECK'
      ? 'SMS.ru Callcheck'
      : 'СЂСѓС‡РЅРѕР№ callback';

  return {
    key: 'USER_CALL_AUTH',
    title: 'Р—РІРѕРЅРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РґР»СЏ РІС…РѕРґР°',
    status,
    statusLabel: ready
      ? 'РіРѕС‚РѕРІ'
      : status === 'PARTIAL'
        ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
        : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅ',
    ready,
    configured,
    enabled,
    requiredEnv,
    details: [
      {
        label: 'Р¤Р»Р°Рі',
        value: enabled ? 'РІРєР»СЋС‡РµРЅ' : 'РІС‹РєР»СЋС‡РµРЅ',
      },
      {
        label: 'Provider',
        value: providerLabel,
      },
      ...(provider === 'SMS_RU_CALLCHECK'
        ? [
            {
              label: 'SMS.ru api_id',
              value: smsRuApiId ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
            },
          ]
        : [
            {
              label: 'РќРѕРјРµСЂ',
              value: phoneNumber ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
            },
            {
              label: 'Callback secret',
              value: secret ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
            },
          ]),
    ],
    note: ready
      ? provider === 'SMS_RU_CALLCHECK'
        ? 'Fallback-РІС…РѕРґ РїРѕ SMS.ru Callcheck РіРѕС‚РѕРІ: /play СЃРѕР·РґР°РµС‚ USER_CALL challenge, РіРѕСЃС‚СЊ Р·РІРѕРЅРёС‚ РЅР° РІС‹РґР°РЅРЅС‹Р№ SMS.ru РЅРѕРјРµСЂ, Р° LeetPlus РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ СЃС‚Р°С‚СѓСЃ polling-Р·Р°РїСЂРѕСЃРѕРј.'
        : 'Fallback-РІС…РѕРґ РїРѕ Р·РІРѕРЅРєСѓ РіРѕС‚РѕРІ: /play СЃРѕР·РґР°РµС‚ USER_CALL challenge, РіРѕСЃС‚СЊ Р·РІРѕРЅРёС‚ РЅР° РЅР°СЃС‚СЂРѕРµРЅРЅС‹Р№ РЅРѕРјРµСЂ, Р° call-provider РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ caller id СЃРµСЂРІРёСЃРЅС‹Рј callback.'
      : 'Р—РІРѕРЅРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕСЃС‚Р°РµС‚СЃСЏ РІС‚РѕСЂС‹Рј РєР°РЅР°Р»РѕРј РїРѕСЃР»Рµ Telegram-Р±РѕС‚Р°; СЃРµР№С‡Р°СЃ РїРѕРґРґРµСЂР¶Р°РЅС‹ СЂСѓС‡РЅРѕР№ callback provider Рё SMS.ru Callcheck.',
    nextAction: ready
      ? 'РџСЂРѕРІРµСЂРёС‚СЊ /play РЅР° С‚РµСЃС‚РѕРІРѕРј РіРѕСЃС‚Рµ: СЃРѕР·РґР°С‚СЊ РІС…РѕРґ РїРѕ Р·РІРѕРЅРєСѓ, РїРѕР·РІРѕРЅРёС‚СЊ СЃ РІРІРµРґРµРЅРЅРѕРіРѕ РЅРѕРјРµСЂР° Рё РїРѕРґС‚РІРµСЂРґРёС‚СЊ callback Р±РµР· СЂР°СЃРєСЂС‹С‚РёСЏ raw phone.'
      : 'Р—Р°РґР°С‚СЊ env GUEST_PORTAL_USER_CALL_ENABLED Рё Р»РёР±Рѕ GUEST_PORTAL_USER_CALL_SMS_RU_API_ID РґР»СЏ SMS.ru, Р»РёР±Рѕ GUEST_PORTAL_USER_CALL_PHONE_NUMBER/GUEST_PORTAL_USER_CALL_SECRET РґР»СЏ СЂСѓС‡РЅРѕРіРѕ provider.',
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
    title: 'Р’С…РѕРґСЏС‰РёР№ Р·РІРѕРЅРѕРє СЃ 4 С†РёС„СЂР°РјРё',
    status,
    statusLabel: ready
      ? 'РіРѕС‚РѕРІ'
      : status === 'PARTIAL'
        ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
        : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅ',
    ready,
    configured,
    enabled,
    requiredEnv,
    details: [
      {
        label: 'Р¤Р»Р°Рі',
        value: enabled ? 'РІРєР»СЋС‡РµРЅ' : 'РІС‹РєР»СЋС‡РµРЅ',
      },
      {
        label: 'Provider endpoint',
        value: endpoint ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
      },
      {
        label: 'Provider token',
        value: token ? 'РЅР°СЃС‚СЂРѕРµРЅ' : 'РЅСѓР¶РµРЅ',
      },
    ],
    note: ready
      ? 'Р РµР·РµСЂРІРЅС‹Р№ РІС…РѕРґ РіРѕС‚РѕРІ: /play СЃРѕР·РґР°РµС‚ challenge, provider Р·РІРѕРЅРёС‚ РіРѕСЃС‚СЋ СЃ РЅРѕРјРµСЂРѕРј, РїРѕСЃР»РµРґРЅРёРµ 4 С†РёС„СЂС‹ РєРѕС‚РѕСЂРѕРіРѕ РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ РІ LeetPlus.'
      : 'Р§РµС‚РІРµСЂС‚С‹Р№ РєР°РЅР°Р» РѕСЃС‚Р°РІР»РµРЅ СЂРµР·РµСЂРІРѕРј РїРѕСЃР»Рµ Telegram-Р±РѕС‚Р°, Р·РІРѕРЅРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅР° РЅРѕРјРµСЂ Рё SMS-РєРѕРґР°; РґР»СЏ Р·Р°РїСѓСЃРєР° РЅСѓР¶РµРЅ РѕС‚РґРµР»СЊРЅС‹Р№ call-provider РёСЃС…РѕРґСЏС‰РёС… Р·РІРѕРЅРєРѕРІ.',
    nextAction: ready
      ? 'РџСЂРѕРІРµСЂРёС‚СЊ РѕРґРёРЅ С‚РµСЃС‚РѕРІС‹Р№ РІС…РѕРґ: СЃРѕР·РґР°С‚СЊ Р·РІРѕРЅРѕРє, РІРІРµСЃС‚Рё РїРѕСЃР»РµРґРЅРёРµ 4 С†РёС„СЂС‹ РЅРѕРјРµСЂР° Рё СѓР±РµРґРёС‚СЊСЃСЏ, С‡С‚Рѕ raw phone РЅРµ РїРѕРїР°РґР°РµС‚ РІ UI.'
      : 'РџРѕРґРєР»СЋС‡Р°С‚СЊ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СЃС‚Р°Р±РёР»РёР·Р°С†РёРё РїРµСЂРІС‹С… С‚СЂРµС… РєР°РЅР°Р»РѕРІ: Р·Р°РґР°С‚СЊ GUEST_PORTAL_INCOMING_CALL_LAST4_ENABLED, endpoint Рё token.',
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
      ? `${channelLabel} РіРѕС‚РѕРІ`
      : status === 'PARTIAL'
        ? 'С‡Р°СЃС‚РёС‡РЅРѕ'
        : 'РЅРµ РЅР°СЃС‚СЂРѕРµРЅРѕ',
    ready,
    configured,
    enabled: realSendEnabled && channelEnabled,
    requiredEnv: [...requiredEnv, ...safetyRequiredEnv],
    details,
    note: ready
      ? configuredNote
      : status === 'PARTIAL'
        ? (partialNote ??
          `${channelLabel} OTP РЅР°СЃС‚СЂРѕРµРЅ С‡Р°СЃС‚РёС‡РЅРѕ: РїСЂРѕРІРµСЂСЊС‚Рµ РѕР±С‰РёР№ С„Р»Р°Рі СЂРµР°Р»СЊРЅРѕР№ РѕС‚РїСЂР°РІРєРё, С„Р»Р°Рі РєР°РЅР°Р»Р° Рё provider-СЃРµРєСЂРµС‚С‹.`)
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
        label: 'Р›РёРјРёС‚ С‚РµР»РµС„РѕРЅР°',
        value: rateLimitDetail(limits.phoneMax, limits.phoneWindowMinutes),
      },
      {
        label: 'Р›РёРјРёС‚ РєР»СѓР±Р°',
        value: rateLimitDetail(limits.storeMax, limits.storeWindowMinutes),
      },
      {
        label: 'Р›РёРјРёС‚ tenant',
        value: rateLimitDetail(limits.tenantMax, limits.tenantWindowMinutes),
      },
    ],
  };
}

function rateLimitDetail(max: number, windowMinutes: number) {
  if (max <= 0 || windowMinutes <= 0) {
    return 'РѕС‚РєР»СЋС‡РµРЅ';
  }

  return `${max} Р·Р° ${windowMinutes} РјРёРЅ`;
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
  label: 'Runbook Telegram-РІС…РѕРґР°',
  path: 'docs/deployment/telegram-auth.md',
  href: 'https://github.com/boozik3412/leetplus/blob/main/docs/deployment/telegram-auth.md',
};

const guestAuthFallbackRunbook = {
  label: 'Runbook fallback-РІС…РѕРґР°',
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

function botConsumerConfig(): BotConsumerConfig {
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
      'GUEST_GAME_BOT_CONSUMER_TENANT_ID or GUEST_GAME_BOT_CONSUMER_TENANT_SLUG',
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
    return `РќР°СЃС‚СЂРѕРёС‚СЊ env РІРЅРµС€РЅРµРіРѕ bot-consumer: ${config.requiredEnv.join(', ')}.`;
  }

  if (canaryRequired) {
    return 'РџРµСЂРµРґ РїРµСЂРІС‹Рј real-send РїРѕСЃС‚Р°РІРёС‚СЊ GUEST_GAME_BOT_CONSUMER_LIMIT=1, Р·Р°РїСѓСЃС‚РёС‚СЊ one-shot canary Рё РїСЂРѕРІРµСЂРёС‚СЊ РїРµСЂРІС‹Р№ SENT/FAILED/BLOCKED ack РІ Guest Game Hub.';
  }

  if (config.dryRun) {
    return pendingReady > 0
      ? 'Р—Р°РїСѓСЃС‚РёС‚СЊ VDS runner РІ dry-run Рё РїСЂРѕРІРµСЂРёС‚СЊ pull Р±РµР· РІРЅРµС€РЅРµР№ РѕС‚РїСЂР°РІРєРё Рё ack.'
      : 'РћР¶РёРґР°С‚СЊ READY_FOR_BOT РґРѕСЃС‚Р°РІРєСѓ РёР»Рё РїРѕРґРіРѕС‚РѕРІРёС‚СЊ outbox РёР· РіРѕС‚РѕРІС‹С… РЅР°РіСЂР°Рґ.';
  }

  if (pendingReady > 0) {
    return lastAckAt
      ? 'РџСЂРѕРІРµСЂРёС‚СЊ РЅРѕРІС‹Р№ tick runner Рё ack-СЃРѕР±С‹С‚РёСЏ; pending РґРѕСЃС‚Р°РІРєРё РµС‰Рµ Р¶РґСѓС‚ РѕР±СЂР°Р±РѕС‚РєРё.'
      : 'Р—Р°РїСѓСЃС‚РёС‚СЊ real Telegram runner Рё РґРѕР¶РґР°С‚СЊСЃСЏ РїРµСЂРІРѕРіРѕ SENT/FAILED ack.';
  }

  return lastAckAt
    ? 'РћС‡РµСЂРµРґСЊ РїСѓСЃС‚Р°; РєРѕРЅС‚СЂРѕР»РёСЂРѕРІР°С‚СЊ СЃР»РµРґСѓСЋС‰РёР№ ack РїРѕСЃР»Рµ РїРѕСЏРІР»РµРЅРёСЏ РЅРѕРІС‹С… READY_FOR_BOT РґРѕСЃС‚Р°РІРѕРє.'
    : 'РћС‡РµСЂРµРґСЊ РїСѓСЃС‚Р°; СЃРЅР°С‡Р°Р»Р° РїРѕРґРіРѕС‚РѕРІРёС‚СЊ outbox Рё РїРѕРґС‚РІРµСЂРґРёС‚СЊ Telegram-СЃРІСЏР·СЊ РіРѕСЃС‚СЏ.';
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
        ? 'Р‘РµР·РѕРїР°СЃРЅС‹Р№ dry-run: РІРєР»СЋС‡РёС‚Рµ GUEST_GAME_DELIVERY_REAL_SEND_ENABLED С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РЅР°СЃС‚СЂРѕР№РєРё СЃРѕРіР»Р°СЃРёР№ Рё Р±РѕС‚Р°.'
        : !config.telegram.enabled
          ? 'Telegram provider РІС‹РєР»СЋС‡РµРЅ env-С„Р»Р°РіРѕРј GUEST_GAME_TELEGRAM_DELIVERY_ENABLED.'
          : !configured
            ? 'Telegram bot token РЅРµ РЅР°СЃС‚СЂРѕРµРЅ.'
            : 'Telegram provider РЅР°СЃС‚СЂРѕРµРЅ; РѕС‚РїСЂР°РІРєР° С‚СЂРµР±СѓРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ numeric chat_id РіРѕСЃС‚СЏ.',
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
      ? 'MAX provider РЅР°СЃС‚СЂРѕРµРЅ С‡РµСЂРµР· generic delivery endpoint; real-send СЂР°Р·СЂРµС€РµРЅ С‚РѕР»СЊРєРѕ СЏРІРЅС‹Рј live-canary С„Р»Р°РіРѕРј.'
      : configured && enabledByEnv && !config.max.liveCanaryEnabled
        ? 'MAX provider РЅР°СЃС‚СЂРѕРµРЅ, РЅРѕ live-send Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ РґРѕ СЏРІРЅРѕРіРѕ GUEST_GAME_MAX_DELIVERY_LIVE_CANARY_ENABLED=true.'
        : 'MAX provider РЅРµ РЅР°СЃС‚СЂРѕРµРЅ РёР»Рё РЅРµ РІРєР»СЋС‡РµРЅ; РЅСѓР¶РµРЅ РїРѕРґС‚РІРµСЂР¶РґРµРЅРЅС‹Р№ endpoint Рё С‚РѕРєРµРЅ.',
  };
}

function deliveryProviderBlockerNote(
  channel: 'TELEGRAM' | 'MAX',
  provider: GuestGameDeliveryProviderStatus,
  options: { identityReady: boolean },
) {
  if (!options.identityReady) {
    return channel === 'TELEGRAM'
      ? 'Telegram alias РЅРµ СЏРІР»СЏРµС‚СЃСЏ numeric chat_id: РіРѕСЃС‚СЊ РґРѕР»Р¶РµРЅ РѕС‚РєСЂС‹С‚СЊ Р±РѕС‚Р°, С‡С‚РѕР±С‹ LeetPlus РїРѕР»СѓС‡РёР» Р±РµР·РѕРїР°СЃРЅС‹Р№ chat_id.'
      : 'MAX identity РіРѕСЃС‚СЏ РµС‰Рµ РЅРµ РїСЂРёРІСЏР·Р°РЅР° Рє РёРіСЂРѕРІРѕРјСѓ РїСЂРѕС„РёР»СЋ.';
  }

  if (provider.dryRunOnly) {
    return 'Dispatcher СЂР°Р±РѕС‚Р°РµС‚ РІ Р±РµР·РѕРїР°СЃРЅРѕРј dry-run РёР»Рё provider РїРѕРєР° РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ СЂРµР°Р»СЊРЅСѓСЋ РѕС‚РїСЂР°РІРєСѓ.';
  }

  if (!provider.enabledByEnv) {
    return `${provider.channelLabel} provider РІС‹РєР»СЋС‡РµРЅ env-РЅР°СЃС‚СЂРѕР№РєР°РјРё.`;
  }

  if (!provider.configured) {
    return `${provider.channelLabel} provider РЅРµ РЅР°СЃС‚СЂРѕРµРЅ С‚РѕРєРµРЅРѕРј/endpoint.`;
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
  const code = row.reward.rewardCode
    ? `\nРљРѕРґ: ${row.reward.rewardCode}`
    : '';

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
    'РІСЃРµ tenant';
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
    title: 'РђРІС‚РѕР·Р°РїСѓСЃРє bonus ledger',
    status,
    statusLabel: ready
      ? 'Р°РІС‚РѕРЅР°С‡РёСЃР»РµРЅРёРµ'
      : enabled
        ? forcedDryRun
          ? 'dry-run'
          : 'Р¶РґРµС‚ write API'
        : configured
          ? 'РІС‹РєР»СЋС‡РµРЅ'
          : 'РЅСѓР¶РµРЅ token',
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
      ? `Scheduler РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚ ledger РєР°Р¶РґС‹Рµ ${intervalMs} РјСЃ, Р»РёРјРёС‚ ${limit}, scope ${tenantScope}, reward types ${rewardTypes}. Queue approved rewards: ${queueApprovedRewards ? 'on' : 'off'}.`
      : enabled
        ? forcedDryRun
          ? `Scheduler РІРєР»СЋС‡РµРЅ РІ dry-run: РїСЂРѕРІРµСЂСЏРµС‚ РѕС‡РµСЂРµРґСЊ РєР°Р¶РґС‹Рµ ${intervalMs} РјСЃ Р±РµР· claim Рё Р·Р°РїРёСЃРё РІ Langame.`
          : 'Scheduler РІРєР»СЋС‡РµРЅ, РЅРѕ СЂРµР°Р»СЊРЅС‹Рµ РЅР°С‡РёСЃР»РµРЅРёСЏ Р¶РґСѓС‚ LANGAME_BONUS_ACCRUAL_ENABLED=true.'
        : configured
          ? 'Scheduler РЅР°СЃС‚СЂРѕРµРЅ С‡Р°СЃС‚РёС‡РЅРѕ РёР»Рё РІС‹РєР»СЋС‡РµРЅ СЏРІРЅРѕ; Р°РІС‚РѕРЅРѕРјРЅР°СЏ РѕР±СЂР°Р±РѕС‚РєР° bonus ledger РЅРµ Р·Р°РїСѓС‰РµРЅР°.'
          : 'Scheduler РЅРµ Р·Р°РїСѓС‰РµРЅ: РЅСѓР¶РµРЅ SYNC_SERVICE_TOKEN РёР»Рё СЏРІРЅРѕРµ РІРєР»СЋС‡РµРЅРёРµ РЅР° VDS.',
    nextAction: ready
      ? 'РџСЂРѕРІРµСЂРёС‚СЊ РїРµСЂРІС‹Р№ production batch РЅР° РѕРґРЅРѕР№ РЅР°РіСЂР°РґРµ Рё Р·Р°С‚РµРј СЃРІРµСЂРёС‚СЊ GuestBonusBalanceCurrent СЃ РЅРѕС‡РЅС‹Рј Langame snapshot.'
      : enabled
        ? forcedDryRun
          ? 'РЎРЅСЏС‚СЊ dry-run С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё РѕС‡РµСЂРµРґРё, tenant Langame РєР»СЋС‡Р° Рё С‚РµСЃС‚РѕРІРѕР№ Р·Р°РїРёСЃРё.'
          : 'Р’РєР»СЋС‡РёС‚СЊ LANGAME_BONUS_ACCRUAL_ENABLED=true С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ dry-run Рё РїСЂРѕРІРµСЂРєРё tenant Langame РєР»СЋС‡Р°.'
        : configured
          ? 'Р’РєР»СЋС‡РёС‚СЊ GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=true РёР»Рё СѓР±СЂР°С‚СЊ СЏРІРЅРѕРµ РІС‹РєР»СЋС‡РµРЅРёРµ РїРѕСЃР»Рµ СЃРѕРіР»Р°СЃРѕРІР°РЅРёСЏ VDS/env.'
          : 'Р—Р°РґР°С‚СЊ SYNC_SERVICE_TOKEN РЅР° VDS Рё РІРєР»СЋС‡РёС‚СЊ scheduler СЃРЅР°С‡Р°Р»Р° РІ dry-run/canary РґР»СЏ 1337.',
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
      label: 'РЎРѕСЃС‚РѕСЏРЅРёРµ',
      value: runtimeStatus?.running
        ? 'РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ'
        : enabled
          ? 'РІРєР»СЋС‡РµРЅ'
          : 'РІС‹РєР»СЋС‡РµРЅ',
    },
    { label: 'РРЅС‚РµСЂРІР°Р»', value: `${intervalMs} РјСЃ` },
    { label: 'Р›РёРјРёС‚', value: String(limit) },
    { label: 'Scope', value: tenantScope },
    { label: 'Reward types', value: rewardTypes },
    {
      label: 'Queue approved',
      value: queueApprovedRewards ? 'on' : 'off',
    },
    {
      label: 'РџРѕСЃР»РµРґРЅРёР№ Р·Р°РїСѓСЃРє',
      value: bonusLedgerSchedulerLastRunLabel(runtimeStatus),
    },
    {
      label: 'РџРѕСЃР»РµРґРЅРёР№ СЂРµР·СѓР»СЊС‚Р°С‚',
      value: bonusLedgerSchedulerLastResultLabel(runtimeStatus),
    },
  ];

  if (runtimeStatus?.lastSkippedAt) {
    details.push({
      label: 'РџРѕСЃР»РµРґРЅРёР№ skip',
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
    return runtimeStatus?.running
      ? 'РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ'
      : 'РµС‰Рµ РЅРµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ';
  }

  const outcome =
    runtimeStatus.lastOutcome === 'SUCCESS'
      ? 'СѓСЃРїРµС…'
      : runtimeStatus.lastOutcome === 'ERROR'
        ? 'РѕС€РёР±РєР°'
        : runtimeStatus.running
          ? 'РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ'
          : 'РЅРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚Р°';

  if (!runtimeStatus.lastFinishedAt) {
    return `${outcome} В· СЃС‚Р°СЂС‚ ${runtimeStatus.lastStartedAt}`;
  }

  return `${outcome} В· ${runtimeStatus.lastFinishedAt}`;
}

function bonusLedgerSchedulerLastResultLabel(
  runtimeStatus?: GuestBonusLedgerSchedulerRuntimeStatus | null,
) {
  const result = runtimeStatus?.lastResult;

  if (!result) {
    return runtimeStatus?.lastError
      ? `РѕС€РёР±РєР°: ${runtimeStatus.lastError}`
      : 'РЅРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚Р°';
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
      return 'Р›СѓС‚Р±РѕРєСЃ';
    case 'MISSION':
      return 'РњРёСЃСЃРёСЏ';
    case 'SEASON':
      return 'Battle Pass';
    case 'MANUAL':
    default:
      return 'Р СѓС‡РЅРѕРµ';
  }
}

function gameScenarioStatusLabel(status: StatusValue | 'ACTIVE') {
  switch (status) {
    case 'DRAFT':
      return 'Р§РµСЂРЅРѕРІРёРє';
    case 'ACTIVE':
      return 'РђРєС‚РёРІРЅРѕ';
    case 'PAUSED':
      return 'РџР°СѓР·Р°';
    case 'FINISHED':
      return 'Р—Р°РІРµСЂС€РµРЅРѕ';
    case 'ARCHIVED':
      return 'РђСЂС…РёРІ';
    default:
      return status;
  }
}

function guestLogMappingPresetLabel(
  preset: GuestLogMappingPreset | null | undefined,
) {
  switch (preset) {
    case 'visit_or_session_start':
      return 'Р’РёР·РёС‚ РёР»Рё СЃС‚Р°СЂС‚ СЃРµСЃСЃРёРё';
    case 'session_finish':
      return 'Р—Р°РІРµСЂС€РµРЅРёРµ СЃРµСЃСЃРёРё';
    case 'events_and_tournaments':
      return 'РЎРѕР±С‹С‚РёСЏ Рё С‚СѓСЂРЅРёСЂС‹';
    case 'balance_and_payment':
      return 'Р‘Р°Р»Р°РЅСЃ Рё РѕРїР»Р°С‚С‹';
    case 'manual_or_risk':
      return 'Р СѓС‡РЅС‹Рµ РёР»Рё СЂРёСЃРє-СЃРѕР±С‹С‚РёСЏ';
    case 'custom':
      return 'РљР°СЃС‚РѕРјРЅС‹Р№ С‚РёРї';
    default:
      return '';
  }
}

function guestLogMappingIntentLabel(
  intent: GuestLogMappingIntent | null | undefined,
) {
  switch (intent) {
    case 'allow':
      return 'РњРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РІ РїСЂР°РІРёР»Р°С…';
    case 'block':
      return 'Р‘Р»РѕРєРёСЂРѕРІР°С‚СЊ РєР°Рє anti-fraud';
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
          contact: row.guest.phoneMasked ?? 'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
      label: `РЎС‚Р°СЂС‚ СЃРµСЃСЃРёРё: ${guestName}`,
      details: [
        row.store?.name,
        sessionMinutes ? `${sessionMinutes} РјРёРЅ` : null,
        row.packet ? 'РїР°РєРµС‚' : null,
        row.normalStop === false
          ? 'РЅРµСЃС‚Р°РЅРґР°СЂС‚РЅРѕРµ Р·Р°РІРµСЂС€РµРЅРёРµ'
          : null,
      ]
        .filter(Boolean)
        .join(' В· '),
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
      label: `РРіСЂРѕРІРѕРµ РІСЂРµРјСЏ: ${guestName}`,
      details: [
        row.store?.name,
        `${Math.round((sessionMinutes / 60) * 10) / 10} С‡`,
      ]
        .filter(Boolean)
        .join(' В· '),
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
      label: `Р›РѕРі РіРѕСЃС‚СЏ: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: row.type ?? 'С‚РёРї РЅРµ СѓРєР°Р·Р°РЅ',
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
      label: `${eventType === 'BALANCE_TOPUP' ? 'РџРѕРїРѕР»РЅРµРЅРёРµ Р±Р°Р»Р°РЅСЃР°' : 'РџРѕРєСѓРїРєР°/СЃРїРёСЃР°РЅРёРµ'}: ${snapshotGuestName(
        row.guest,
        row.externalGuestId,
      )}`,
      details: [
        row.type,
        amount ? `${Math.abs(amount)} СЂСѓР±` : null,
        row.store?.name,
        row.balance ? `Р±Р°Р»Р°РЅСЃ ${numberValue(row.balance)} СЂСѓР±` : null,
        row.bonusBalance
          ? `Р±РѕРЅСѓСЃС‹ ${numberValue(row.bonusBalance)} СЂСѓР±`
          : null,
      ]
        .filter(Boolean)
        .join(' В· '),
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
          ? 'РћРїРµСЂР°С†РёСЏ РїРѕРїРѕР»РЅРµРЅРёСЏ'
          : 'РћРїРµСЂР°С†РёСЏ РїРѕРєСѓРїРєРё/СЃРїРёСЃР°РЅРёСЏ'),
      details: [
        row.type,
        row.operationSource,
        row.operationForm,
        amount ? `${Math.abs(amount)} СЂСѓР±` : null,
        row.store?.name,
      ]
        .filter(Boolean)
        .join(' В· '),
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
      label: `Р‘Р°Р»Р°РЅСЃ РіРѕСЃС‚СЏ: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: `Р‘Р°Р»Р°РЅСЃ ${balance} СЂСѓР±`,
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
      label: `Р‘РѕРЅСѓСЃРЅС‹Р№ Р±Р°Р»Р°РЅСЃ: ${snapshotGuestName(row.guest, row.externalGuestId)}`,
      details: `Р‘РѕРЅСѓСЃС‹ ${bonusBalance} СЂСѓР±`,
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
      label: `Р“СЂСѓРїРїР° Р»РѕСЏР»СЊРЅРѕСЃС‚Рё: ${groupName}`,
      details: [
        snapshotGuestName(row, row.externalGuestId),
        percent != null ? `СЃРєРёРґРєР° ${percent}%` : null,
        currentHours != null ? `${currentHours} С‡ Сѓ РіРѕСЃС‚СЏ` : null,
        hoursFrom != null || hoursTo != null
          ? `РґРёР°РїР°Р·РѕРЅ ${hoursFrom ?? 0}-${hoursTo ?? 'в€ћ'} С‡`
          : null,
        group?.lastSyncedAt
          ? `РіСЂСѓРїРїР° РѕР±РЅРѕРІР»РµРЅР° ${group.lastSyncedAt.toISOString()}`
          : null,
      ]
        .filter(Boolean)
        .join(' В· '),
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
      label: `РўРѕРІР°СЂРЅР°СЏ РїРѕРєСѓРїРєР°: ${productName ?? 'С‚РѕРІР°СЂ'} В· ${guestName}`,
      details: [
        row.storeNameAtSale ?? row.store?.name,
        productName,
        row.product?.category?.name,
        row.product?.supplier?.name,
        quantity ? `${quantity} С€С‚` : null,
        revenue ? `${Math.abs(revenue)} СЂСѓР±` : null,
        cost ? `СЃРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ ${Math.abs(cost)} СЂСѓР±` : null,
      ]
        .filter(Boolean)
        .join(' В· '),
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
    `РёРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ ${inviterProfileId.slice(0, 8)}`;
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
        channel ? `РєР°РЅР°Р» ${channel}` : null,
        referralCodeMasked ? `РєРѕРґ ${referralCodeMasked}` : null,
        acceptedAt ? `РїСЂРёРЅСЏС‚ ${acceptedAt}` : null,
      ]
        .filter(Boolean)
        .join(' В· '),
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
      contact: 'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
    };
  }

  return {
    id: row.id,
    externalDomain: row.externalDomain,
    externalGuestId: row.externalGuestId,
    displayName: row.fullNameMasked ?? row.externalGuestId,
    contact: row.phoneMasked ?? row.emailMasked ?? 'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
  return (
    row?.fullNameMasked ?? externalGuestId ?? 'РіРѕСЃС‚СЊ Р±РµР· РїСЂРѕС„РёР»СЏ'
  );
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
    normalized.includes('РІС…РѕРґ') ||
    normalized.includes('РІРёР·РёС‚')
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
    normalized.includes('РїРѕРїРѕР»РЅ') ||
    normalized.includes('Р·Р°С‡РёСЃР»')
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
      `РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РёСЃС‚РѕС‡РЅРёРє snapshot-С„Р°РєС‚РѕРІ: ${parsed}`,
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

  return 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ snapshot-С„Р°РєС‚.';
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
      xpDelta: rule.xpDelta,
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

function rewardRuleLink(rule: GuestGameDryRunRule) {
  if (rule.kind === 'LOOT_BOX') {
    return { lootBoxId: rule.id };
  }

  if (rule.kind === 'MISSION') {
    return { missionId: rule.id };
  }

  return { seasonId: rule.id };
}

function processRuleKindLabel(kind: GuestGameDryRunRule['kind']) {
  if (kind === 'LOOT_BOX') {
    return 'Р›СѓС‚Р±РѕРєСЃ';
  }

  if (kind === 'MISSION') {
    return 'РњРёСЃСЃРёСЏ';
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
    displayName: row.displayName ?? 'РРіСЂРѕРІРѕР№ РїСЂРѕС„РёР»СЊ',
    contactMasked: row.contactMasked,
    xp: row.xp,
    level: row.level,
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
  rewards: GuestGameReward[];
};

function evaluateLootBoxDryRun(
  rule: GuestGameLootBox,
  context: DryRunContext,
): GuestGameDryRunRule {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const ruleRewards = dryRunRewardsForRule(context.rewards, 'lootBox', rule.id);
  const selectedRewardLabel =
    dryRunWeightedReward(rule.probabilityRules) ??
    rule.rewardLabel ??
    rule.name;

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
    rule.rewardAmount ?? 0,
    ruleRewards,
    blockers,
    reasons,
  );
  appendDryRunLootBoxLimits(rule, context, ruleRewards, blockers, reasons);

  if (rule.audience) {
    reasons.push(`РђСѓРґРёС‚РѕСЂРёСЏ: ${rule.audience.name}`);
  }
  if (rule.segment) {
    reasons.push(`РЎРµРіРјРµРЅС‚: ${rule.segment}`);
  }
  if (rule.manualApprovalRequired) {
    reasons.push(
      'Р’С‹РґР°С‡Р° С‚СЂРµР±СѓРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРј',
    );
  }

  return dryRunRuleResult({
    id: rule.id,
    kind: 'LOOT_BOX',
    name: rule.name,
    status: rule.status,
    manualApprovalRequired: rule.manualApprovalRequired,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel,
    selectedRewardLabel,
    xpDelta: 0,
    budgetAmount: rule.budgetAmount,
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
  appendDryRunBudgetCheck(
    rule.budgetAmount,
    rule.rewardAmount ?? 0,
    ruleRewards,
    blockers,
    reasons,
  );
  appendDryRunMissionLimits(rule, context, ruleRewards, blockers, reasons);

  if (rule.audience) {
    reasons.push(`РђСѓРґРёС‚РѕСЂРёСЏ: ${rule.audience.name}`);
  }
  if (rule.manualApprovalRequired) {
    reasons.push(
      'Р’С‹РґР°С‡Р° С‚СЂРµР±СѓРµС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРј',
    );
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
    xpDelta: rule.xpReward,
    budgetAmount: rule.budgetAmount,
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
    reasons.push(`РђСѓРґРёС‚РѕСЂРёСЏ: ${rule.audience.name}`);
  }
  if (rule.premiumEnabled) {
    reasons.push('Р•СЃС‚СЊ premium-РґРѕСЂРѕР¶РєР°');
  }
  if (rule.manualApprovalRequired) {
    reasons.push(
      'РќР°РіСЂР°РґС‹ СЃРµР·РѕРЅР° С‚СЂРµР±СѓСЋС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРј',
    );
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
    xpDelta,
    budgetAmount: rule.budgetAmount,
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
    reasons.push('РџСЂР°РІРёР»Рѕ Р°РєС‚РёРІРЅРѕ');
    return;
  }
  if (status === 'DRAFT') {
    reasons.push(
      'Р§РµСЂРЅРѕРІРёРє РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РІ С‚РµСЃС‚РѕРІРѕРј СЂРµР¶РёРјРµ',
    );
    return;
  }

  blockers.push(
    `РЎС‚Р°С‚СѓСЃ РїСЂР°РІРёР»Р° РЅРµ РїРѕР·РІРѕР»СЏРµС‚ Р·Р°РїСѓСЃРє: ${status}`,
  );
}

function appendDryRunProfileCheck(
  context: DryRunContext,
  blockers: string[],
  reasons: string[],
) {
  if (!context.profile && !context.guest) {
    reasons.push(
      'Р“РѕСЃС‚СЊ РЅРµ РІС‹Р±СЂР°РЅ: РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РѕР±С‰РёРµ СѓСЃР»РѕРІРёСЏ',
    );
    return;
  }
  if (context.profile?.status && context.profile.status !== 'ACTIVE') {
    blockers.push(
      `РџСЂРѕС„РёР»СЊ РіРѕСЃС‚СЏ РЅРµ Р°РєС‚РёРІРµРЅ: ${context.profile.status}`,
    );
    return;
  }

  reasons.push('Р“РѕСЃС‚СЊ РІС‹Р±СЂР°РЅ РґР»СЏ РїСЂРѕРІРµСЂРєРё');
}

function appendDryRunTriggerCheck(
  triggerKind: string,
  eventType: string,
  blockers: string[],
) {
  const expected = triggerKind.trim().toUpperCase();
  const actual = eventType.trim().toUpperCase();

  if (
    !expected ||
    expected === actual ||
    (expected === 'VISIT' &&
      (actual === 'SESSION_START' || actual === 'CHECK_IN')) ||
    (expected === 'BAR_PURCHASE' && actual === 'PRODUCT_PURCHASE') ||
    (expected === 'PRODUCT_PURCHASE' && actual === 'BAR_PURCHASE')
  ) {
    return;
  }

  blockers.push(
    `РўСЂРёРіРіРµСЂ ${triggerKind} РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ СЃРѕР±С‹С‚РёРµРј ${eventType}`,
  );
}

function appendDryRunStoreCheck(
  storeIds: string[],
  storeId: string | null,
  blockers: string[],
  reasons: string[],
) {
  if (!storeIds.length) {
    reasons.push('Р”РѕСЃС‚СѓРїРЅРѕ РґР»СЏ РІСЃРµР№ СЃРµС‚Рё');
    return;
  }
  if (!storeId) {
    reasons.push(
      'РџСЂР°РІРёР»Рѕ РѕРіСЂР°РЅРёС‡РµРЅРѕ РєР»СѓР±Р°РјРё, РІС‹Р±РµСЂРёС‚Рµ РєР»СѓР± РґР»СЏ С‚РѕС‡РЅРѕР№ РїСЂРѕРІРµСЂРєРё',
    );
    return;
  }
  if (!storeIds.includes(storeId)) {
    blockers.push(
      'Р’С‹Р±СЂР°РЅРЅС‹Р№ РєР»СѓР± РЅРµ РІС…РѕРґРёС‚ РІ РѕР±Р»Р°СЃС‚СЊ РїСЂР°РІРёР»Р°',
    );
    return;
  }

  reasons.push(
    'Р’С‹Р±СЂР°РЅРЅС‹Р№ РєР»СѓР± РІС…РѕРґРёС‚ РІ РѕР±Р»Р°СЃС‚СЊ РїСЂР°РІРёР»Р°',
  );
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
    blockers.push(
      'Р”РµРЅСЊ РЅРµРґРµР»Рё РЅРµ РІС…РѕРґРёС‚ РІ РїРµСЂРёРѕРґ РїСЂР°РІРёР»Р°',
    );
  } else if (weekdaysOnly && (weekday === 0 || weekday === 6)) {
    blockers.push(
      'РџСЂР°РІРёР»Рѕ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РїРѕ Р±СѓРґРЅСЏРј',
    );
  } else if (weekdays.length || weekdaysOnly) {
    reasons.push('Р”РµРЅСЊ РЅРµРґРµР»Рё РїРѕРґС…РѕРґРёС‚');
  }

  const hours = dryRunStringArray(rules.hours);
  if (!hours.length) {
    return;
  }

  if (hours.some((window) => dryRunIsWithinTimeWindow(occurredAt, window))) {
    reasons.push(`Р’СЂРµРјСЏ РІС…РѕРґРёС‚ РІ РѕРєРЅРѕ ${hours.join(', ')}`);
  } else {
    blockers.push(
      `Р’СЂРµРјСЏ РЅРµ РІС…РѕРґРёС‚ РІ РѕРєРЅРѕ ${hours.join(', ')}`,
    );
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
      blockers.push(
        'РўРёРї СЃРµСЃСЃРёРё РЅРµ СѓРєР°Р·Р°РЅ РґР»СЏ РїСЂРѕРІРµСЂРєРё РїСЂР°РІРёР»Р°',
      );
    } else if (
      normalizeSessionType(expectedType) !== normalizeSessionType(actualType)
    ) {
      blockers.push(
        `РўРёРї СЃРµСЃСЃРёРё РЅРµ РїРѕРґС…РѕРґРёС‚: РЅСѓР¶РµРЅ ${expectedType}`,
      );
    } else {
      reasons.push(`РўРёРї СЃРµСЃСЃРёРё РїРѕРґС…РѕРґРёС‚: ${actualType}`);
    }
  } else if (expectedType) {
    reasons.push(`РўРёРї СЃРµСЃСЃРёРё РїСЂР°РІРёР»Р°: ${expectedType}`);
  }

  const packetMode = dryRunString(packetModeValue)?.toUpperCase() ?? 'ANY';
  if (packetMode === 'ANY' || packetMode === 'ALL') {
    reasons.push('РџР°РєРµС‚ С‡Р°СЃРѕРІ РЅРµ РѕРіСЂР°РЅРёС‡РµРЅ');
    return;
  }

  if (context.sessionPacket == null) {
    blockers.push(
      'Р¤Р°РєС‚ СЃРµСЃСЃРёРё РЅРµ СЃРѕРґРµСЂР¶РёС‚ РїСЂРёР·РЅР°Рє РїР°РєРµС‚Р° С‡Р°СЃРѕРІ',
    );
    return;
  }

  if (packetMode === 'PACKET_ONLY') {
    if (context.sessionPacket) {
      reasons.push(
        'РЎРµСЃСЃРёСЏ РїСЂРѕС…РѕРґРёС‚ РїРѕ РїР°РєРµС‚Сѓ С‡Р°СЃРѕРІ',
      );
    } else {
      blockers.push(
        'РџСЂР°РІРёР»Рѕ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РґР»СЏ РїР°РєРµС‚РѕРІ С‡Р°СЃРѕРІ',
      );
    }
    return;
  }

  if (packetMode === 'NON_PACKET_ONLY') {
    if (!context.sessionPacket) {
      reasons.push(
        'РЎРµСЃСЃРёСЏ РѕР±С‹С‡РЅР°СЏ, Р±РµР· РїР°РєРµС‚Р° С‡Р°СЃРѕРІ',
      );
    } else {
      blockers.push(
        'РџСЂР°РІРёР»Рѕ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РґР»СЏ РѕР±С‹С‡РЅС‹С… СЃРµСЃСЃРёР№',
      );
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
    'РўР°СЂРёС„РЅР°СЏ РіСЂСѓРїРїР°',
    dryRunStringValues(rules.tariffGroupIds, rules.tariffGroupId),
    context.tariffGroupId,
    blockers,
    reasons,
  );
  appendDryRunTariffSingleCheck(
    'РўР°СЂРёС„РЅС‹Р№ РїРµСЂРёРѕРґ',
    dryRunStringValues(rules.tariffPeriodIds, rules.tariffPeriodId),
    context.tariffPeriodId,
    blockers,
    reasons,
  );
  appendDryRunTariffSingleCheck(
    'РўРёРї С‚Р°СЂРёС„Р°',
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
    blockers.push(
      `${label}: Р·РЅР°С‡РµРЅРёРµ РЅРµ СѓРєР°Р·Р°РЅРѕ РґР»СЏ РїСЂРѕРІРµСЂРєРё РїСЂР°РІРёР»Р°`,
    );
    return;
  }

  if (!uniqueExpected.includes(actualValue)) {
    blockers.push(
      `${label} РЅРµ РїРѕРґС…РѕРґРёС‚: РЅСѓР¶РµРЅ ${uniqueExpected.join(', ')}`,
    );
    return;
  }

  reasons.push(`${label} РїРѕРґС…РѕРґРёС‚`);
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
    blockers.push(
      'РўРёРї СЃРѕР±С‹С‚РёСЏ guests/logs РЅРµ СѓРєР°Р·Р°РЅ РґР»СЏ РїСЂРѕРІРµСЂРєРё РїСЂР°РІРёР»Р°',
    );
    return;
  }

  if (blockedTypes.includes(actualType)) {
    blockers.push(
      `РўРёРї guests/logs Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ anti-fraud РїСЂР°РІРёР»РѕРј: ${context.guestLogType}`,
    );
    return;
  }

  if (blockedTypes.length) {
    reasons.push(
      'РўРёРї guests/logs РЅРµ РІС…РѕРґРёС‚ РІ anti-fraud Р±Р»РѕРєРёСЂРѕРІРєРё',
    );
  }

  if (!allowedTypes.length) {
    return;
  }

  if (!allowedTypes.includes(actualType)) {
    blockers.push(
      `РўРёРї guests/logs РЅРµ РїРѕРґС…РѕРґРёС‚: РЅСѓР¶РµРЅ ${allowedTypes.join(', ')}`,
    );
    return;
  }

  reasons.push(`РўРёРї guests/logs РїРѕРґС…РѕРґРёС‚: ${context.guestLogType}`);
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
    blockers.push(
      'РЎРѕР±С‹С‚РёРµ СЂР°РЅСЊС€Рµ РїРµСЂРёРѕРґР° РґРµР№СЃС‚РІРёСЏ',
    );
  }
  if (to && occurredAt > to) {
    blockers.push('РЎРѕР±С‹С‚РёРµ РїРѕР·Р¶Рµ РїРµСЂРёРѕРґР° РґРµР№СЃС‚РІРёСЏ');
  }
  if (from || to) {
    reasons.push('РџРµСЂРёРѕРґ РґРµР№СЃС‚РІРёСЏ РїСЂРѕРІРµСЂРµРЅ');
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
      `РЎРµСЃСЃРёСЏ РєРѕСЂРѕС‡Рµ СѓСЃР»РѕРІРёСЏ: ${context.sessionMinutes}/${minSessionMinutes} РјРёРЅ`,
    );
  } else if (minSessionMinutes != null) {
    reasons.push(
      `Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ СЃРµСЃСЃРёРё РїРѕРґС…РѕРґРёС‚: ${context.sessionMinutes} РјРёРЅ`,
    );
  }

  if (minSpendAmount != null && context.spendAmount < minSpendAmount) {
    blockers.push(
      `РЎСѓРјРјР° РїРѕРєСѓРїРєРё РЅРёР¶Рµ СѓСЃР»РѕРІРёСЏ: ${context.spendAmount}/${minSpendAmount} СЂСѓР±`,
    );
  } else if (minSpendAmount != null) {
    reasons.push(
      `РЎСѓРјРјР° РїРѕРєСѓРїРєРё РїРѕРґС…РѕРґРёС‚: ${context.spendAmount} СЂСѓР±`,
    );
  }

  if (
    conditions.weekdaysOnly === true &&
    [0, 6].includes(context.occurredAt.getDay())
  ) {
    blockers.push(
      'РњРёСЃСЃРёСЏ РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РїРѕ Р±СѓРґРЅСЏРј',
    );
  }
  if (conditions.requiresLangameFact === true) {
    reasons.push(
      'Р¤Р°РєС‚ Langame РѕР±СЏР·Р°С‚РµР»РµРЅ РґР»СЏ Р±РѕРµРІРѕРіРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ',
    );
  }
  if (windowDays != null) {
    reasons.push(`РћРєРЅРѕ РІС‹РїРѕР»РЅРµРЅРёСЏ: ${windowDays} РґРЅ.`);
  }
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
    reasons.push(
      'Battle Pass СѓС‡РёС‚С‹РІР°РµС‚ Р±РѕРЅСѓСЃ Р·Р° РїР°РєРµС‚ С‡Р°СЃРѕРІ',
    );
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
    reasons.push('Р‘СЋРґР¶РµС‚ РЅРµ Р·Р°РґР°РЅ');
    return;
  }

  const spent = sum(rewards.map((reward) => reward.rewardAmount));
  const projected = spent + projectedAmount;
  reasons.push(`Р‘СЋРґР¶РµС‚: ${spent}/${budgetAmount} СЂСѓР±`);

  if (spent >= budgetAmount) {
    blockers.push('Р‘СЋРґР¶РµС‚ РїСЂР°РІРёР»Р° СѓР¶Рµ РёСЃС‡РµСЂРїР°РЅ');
  } else if (projectedAmount > 0 && projected > budgetAmount) {
    blockers.push(
      'РќР°РіСЂР°РґР° РїСЂРµРІС‹СЃРёС‚ Р±СЋРґР¶РµС‚ РїСЂР°РІРёР»Р°',
    );
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

  if (perGuestPerWeek != null) {
    const guestRewards = rewards.filter((reward) =>
      dryRunRewardMatchesGuest(reward, context),
    );
    const weeklyCount = guestRewards.filter((reward) =>
      dryRunIsWithinLastDays(reward.qualifiedAt, context.occurredAt, 7),
    ).length;

    if (!context.profile && !context.guest) {
      blockers.push(
        'Р”Р»СЏ РїСЂРѕРІРµСЂРєРё Р»РёРјРёС‚Р° РЅР° РіРѕСЃС‚СЏ РІС‹Р±РµСЂРёС‚Рµ РїСЂРѕС„РёР»СЊ РёР»Рё РіРѕСЃС‚СЏ',
      );
    } else if (weeklyCount >= perGuestPerWeek) {
      blockers.push(
        `Р›РёРјРёС‚ РЅР° РіРѕСЃС‚СЏ Р·Р° РЅРµРґРµР»СЋ РёСЃС‡РµСЂРїР°РЅ: ${weeklyCount}/${perGuestPerWeek}`,
      );
    } else {
      reasons.push(
        `Р›РёРјРёС‚ РЅР° РіРѕСЃС‚СЏ Р·Р° РЅРµРґРµР»СЋ: ${weeklyCount}/${perGuestPerWeek}`,
      );
    }
  }

  if (totalPerDay != null) {
    const dayCount = rewards.filter((reward) =>
      dryRunIsSameDay(reward.qualifiedAt, context.occurredAt),
    ).length;

    if (dayCount >= totalPerDay) {
      blockers.push(
        `Р”РЅРµРІРЅРѕР№ Р»РёРјРёС‚ Р»СѓС‚Р±РѕРєСЃР° РёСЃС‡РµСЂРїР°РЅ: ${dayCount}/${totalPerDay}`,
      );
    } else {
      reasons.push(
        `Р”РЅРµРІРЅРѕР№ Р»РёРјРёС‚ Р»СѓС‚Р±РѕРєСЃР°: ${dayCount}/${totalPerDay}`,
      );
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
      blockers.push(
        'Р”Р»СЏ РїСЂРѕРІРµСЂРєРё Р»РёРјРёС‚Р° РЅР° РіРѕСЃС‚СЏ РІС‹Р±РµСЂРёС‚Рµ РїСЂРѕС„РёР»СЊ РёР»Рё РіРѕСЃС‚СЏ',
      );
    } else if (guestCount >= rule.perGuestLimit) {
      blockers.push(
        `Р›РёРјРёС‚ РјРёСЃСЃРёРё РЅР° РіРѕСЃС‚СЏ РёСЃС‡РµСЂРїР°РЅ: ${guestCount}/${rule.perGuestLimit}`,
      );
    } else {
      reasons.push(
        `Р›РёРјРёС‚ РјРёСЃСЃРёРё РЅР° РіРѕСЃС‚СЏ: ${guestCount}/${rule.perGuestLimit}`,
      );
    }
  }

  if (rule.totalRewardLimit != null) {
    if (rewards.length >= rule.totalRewardLimit) {
      blockers.push(
        `РћР±С‰РёР№ Р»РёРјРёС‚ РЅР°РіСЂР°Рґ РјРёСЃСЃРёРё РёСЃС‡РµСЂРїР°РЅ: ${rewards.length}/${rule.totalRewardLimit}`,
      );
    } else {
      reasons.push(
        `РћР±С‰РёР№ Р»РёРјРёС‚ РЅР°РіСЂР°Рґ РјРёСЃСЃРёРё: ${rewards.length}/${rule.totalRewardLimit}`,
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

function dryRunWeightedReward(value: unknown) {
  const items = dryRunArray(dryRunRecord(value).items)
    .map((item) => dryRunRecord(item))
    .map((item) => ({
      label: dryRunString(item.label),
      weight: dryRunNumber(item.weight, 0),
    }))
    .filter((item) => item.label);

  if (!items.length) {
    return null;
  }

  return items.sort((left, right) => right.weight - left.weight)[0].label;
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
    contact: row.phoneMasked ?? row.emailMasked ?? 'РЅРµС‚ РєРѕРЅС‚Р°РєС‚Р°',
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
    throw new BadRequestException(`${label} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ`);
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
    throw new BadRequestException(
      'Р§РёСЃР»РѕРІРѕРµ РїРѕР»Рµ Р·Р°РїРѕР»РЅРµРЅРѕ РЅРµРІРµСЂРЅРѕ',
    );
  }

  return Math.trunc(number);
}

function decimalValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new BadRequestException(
      'РЎСѓРјРјР° Р·Р°РїРѕР»РЅРµРЅР° РЅРµРІРµСЂРЅРѕ',
    );
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
    throw new BadRequestException('Р”Р°С‚Р° Р·Р°РїРѕР»РЅРµРЅР° РЅРµРІРµСЂРЅРѕ');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Р”Р°С‚Р° Р·Р°РїРѕР»РЅРµРЅР° РЅРµРІРµСЂРЅРѕ');
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
    throw new BadRequestException(
      `РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ СЃС‚Р°С‚СѓСЃ: ${parsed}`,
    );
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
    throw new BadRequestException(
      'РџРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ Langame provider',
    );
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
    return 'РЎС†РµРЅР°СЂРёР№ Р°РєС‚РёРІРµРЅ, РЅРѕ СЃРѕР±С‹С‚РёР№ РµС‰Рµ РЅРµС‚: РїСЂРѕРІРµСЂСЊС‚Рµ dry-run Рё batch РїРѕ snapshot-С„Р°РєС‚Р°Рј.';
  }

  if (reachedGuests > 0 && returnedGuests === 0) {
    return 'РЎРѕР±С‹С‚РёСЏ РµСЃС‚СЊ, РІРѕР·РІСЂР°С‚Р° РїРѕРєР° РЅРµС‚: РїСЂРѕРІРµСЂСЊС‚Рµ С†РµРЅРЅРѕСЃС‚СЊ РЅР°РіСЂР°РґС‹ Рё СѓСЃР»РѕРІРёСЏ РїРѕРІС‚РѕСЂРЅРѕРіРѕ РІРёР·РёС‚Р°.';
  }

  if (returnedGuests > 0 && totalRevenue === 0) {
    return 'Р“РѕСЃС‚Рё РІРѕР·РІСЂР°С‰Р°СЋС‚СЃСЏ, РЅРѕ РґРµРЅРµР¶РЅС‹Р№ СЌС„С„РµРєС‚ РЅРµ РІРёРґРµРЅ: РїСЂРѕРІРµСЂСЊС‚Рµ РїСЂРѕРґР°Р¶Рё Р±Р°СЂР° Рё РїРѕРїРѕР»РЅРµРЅРёСЏ РїРѕСЃР»Рµ РІРёР·РёС‚Р°.';
  }

  if (totalRevenue > 0) {
    return 'Р•СЃС‚СЊ РёР·РјРµСЂРёРјС‹Р№ РґРµРЅРµР¶РЅС‹Р№ СЌС„С„РµРєС‚: СЃСЂР°РІРЅРёС‚Рµ РµРіРѕ СЃРѕ СЃС‚РѕРёРјРѕСЃС‚СЊСЋ РЅР°РіСЂР°Рґ Рё РјР°СЃС€С‚Р°Р±РёСЂСѓР№С‚Рµ Р°РєРєСѓСЂР°С‚РЅРѕ.';
  }

  return 'Р­С„С„РµРєС‚ Р±СѓРґРµС‚ СЃС‡РёС‚Р°С‚СЊСЃСЏ РїРѕ СЃРµСЃСЃРёСЏРј, РїСЂРѕРґР°Р¶Р°Рј Рё РїРѕРїРѕР»РЅРµРЅРёСЏРј РїРѕСЃР»Рµ РёРіСЂРѕРІС‹С… СЃРѕР±С‹С‚РёР№.';
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
    return 'Р—Р°РґР°Р№С‚Рµ Р±СЋРґР¶РµС‚ РґРѕ РјР°СЃС€С‚Р°Р±РЅРѕРіРѕ Р·Р°РїСѓСЃРєР°, С‡С‚РѕР±С‹ РєРѕРЅС‚СЂРѕР»РёСЂРѕРІР°С‚СЊ СЃС‚РѕРёРјРѕСЃС‚СЊ РЅР°РіСЂР°Рґ.';
  }

  if (budgetUsagePercent !== null && budgetUsagePercent >= 90) {
    return 'Р‘СЋРґР¶РµС‚ РїРѕС‡С‚Рё РІС‹Р±СЂР°РЅ: РїСЂРѕРІРµСЂСЊС‚Рµ Р»РёРјРёС‚С‹, РїРµСЂРёРѕРґ РґРµР№СЃС‚РІРёСЏ Рё РѕС‡РµСЂРµРґСЊ РІС‹РґР°С‡.';
  }

  if (backlog >= 10) {
    return 'Р’ РѕС‡РµСЂРµРґРё РЅР°РєРѕРїРёР»РёСЃСЊ РЅР°РіСЂР°РґС‹: РїСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Рё РєР°СЃСЃРёСЂСЃРєСѓСЋ РІС‹РґР°С‡Сѓ.';
  }

  if (status === 'ACTIVE' && eventsCount === 0) {
    return 'РђРєС‚РёРІРЅС‹Р№ СЃС†РµРЅР°СЂРёР№ РµС‰Рµ РЅРµ РґР°Р» СЃРѕР±С‹С‚РёР№: Р·Р°РїСѓСЃС‚РёС‚Рµ dry-run РёР»Рё batch РїРѕ snapshot-С„Р°РєС‚Р°Рј.';
  }

  if (paidRewards > 0) {
    return 'Р•СЃС‚СЊ РїРѕРіР°С€РµРЅРЅС‹Рµ РЅР°РіСЂР°РґС‹: РјРѕР¶РЅРѕ СЃРІРµСЂРёС‚СЊ С„Р°РєС‚РёС‡РµСЃРєРёР№ СЌС„С„РµРєС‚ СЃ РІРёР·РёС‚Р°РјРё Рё РІС‹СЂСѓС‡РєРѕР№.';
  }

  return 'РљРѕРЅС‚СѓСЂ РїРѕРґ РєРѕРЅС‚СЂРѕР»РµРј: СЃР»РµРґРёС‚Рµ Р·Р° Р±СЋРґР¶РµС‚РѕРј, РѕС‡РµСЂРµРґСЊСЋ Рё XP-СЃРѕР±С‹С‚РёСЏРјРё.';
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
    items: [
      { label: 'XP battle pass', weight: 50 },
      { label: 'РџСЂРѕРјРѕРєРѕРґ Р±Р°СЂР°', weight: 30 },
      { label: 'РњРёСЃСЃРёСЏ РЅР° РїРѕРІС‚РѕСЂРЅС‹Р№ РІРёР·РёС‚', weight: 20 },
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
    { level: 1, xp: 0, freeReward: 'РЎС‚Р°СЂС‚ СЃРµР·РѕРЅР°' },
    { level: 2, xp: 250, freeReward: 'РџСЂРѕРјРѕРєРѕРґ Р±Р°СЂР°' },
    {
      level: 3,
      xp: 500,
      freeReward: 'Р‘РѕРЅСѓСЃ РЅР° СЃР»РµРґСѓСЋС‰РёР№ РІРёР·РёС‚',
    },
    {
      level: 4,
      xp: 900,
      freeReward: 'Р§Р°СЃС‹ РёРіСЂС‹ СЃ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµРј',
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
          rewardType: visualString(
            itemRecord.rewardType,
            'PROMOCODE',
          ).toUpperCase(),
          rewardAmount: visualNumberOrNull(itemRecord.rewardAmount),
          rewardLabel: visualString(itemRecord.rewardLabel, 'Награда клуба'),
          condition: visualString(itemRecord.condition, 'Активность в клубе'),
          limitPerGuest: visualIntOrNull(itemRecord.limitPerGuest, 1, 1000),
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

  return {
    id: rule.id,
    title: rule.name,
    status: rule.status,
    triggerKind: rule.triggerKind,
    rewardType: rule.rewardType,
    rewardAmount: rule.rewardAmount,
    rewardLabel: rule.rewardLabel ?? rule.name,
    condition: visualString(
      visualRecord(rule.periodRules).condition,
      rule.triggerKind,
    ),
    limitPerGuest: visualIntOrNull(
      limits.perGuest ?? limits.perGuestPerWeek,
      1,
      1000,
    ),
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
  return clean({
    tenantId: user.tenantId,
    createdByUserId: actorUserId(user),
    name: item.title,
    status: item.status,
    triggerKind: item.triggerKind,
    rewardType: item.rewardType,
    rewardAmount:
      item.rewardAmount == null ? null : new Prisma.Decimal(item.rewardAmount),
    rewardLabel: item.rewardLabel,
    storeIds,
    periodRules: {
      source: 'visual_editor',
      condition: item.condition,
    },
    limits: {
      source: 'visual_editor',
      perGuest: item.limitPerGuest,
    },
    probabilityRules: {
      type: 'single',
      source: 'visual_editor',
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
        rewardType: item.rewardType,
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
