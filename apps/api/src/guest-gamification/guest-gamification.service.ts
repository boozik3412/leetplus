import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type { LangameGuestSession } from '../integrations/langame.types';
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
  budgetAmount: number | null;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
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
  items: GuestGameDelivery[];
  note: string;
};

export type GuestGameIntegrationReadinessStatus =
  | 'READY'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'MANUAL_ONLY';

export type GuestGameIntegrationReadinessItem = {
  key:
    | 'PUBLIC_PORTAL'
    | 'OTP'
    | 'OTP_SMS'
    | 'OTP_TELEGRAM'
    | 'OTP_MAX'
    | 'TELEGRAM_LINK'
    | 'TELEGRAM_WEBHOOK'
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
    | 'PUBLIC_REGISTRATION'
    | 'OTP'
    | 'GAME_PROFILE'
    | 'LANGAME_MATCH'
    | 'ACTIVE_RULES'
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
    | 'PRODUCT_EXPENSE';
  eventType: string;
  occurredAt: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
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
  'PUBLIC_REGISTRATION',
  'OTP',
  'GAME_PROFILE',
  'LANGAME_MATCH',
  'ACTIVE_RULES',
]);

function buildPilotRunbookActions({
  stage,
  canRunDryRun,
  canRunCanary,
  canRunLive,
  canReconcile,
  bonusRewards,
}: {
  stage: GuestGamePilotRunbookStage;
  canRunDryRun: boolean;
  canRunCanary: boolean;
  canRunLive: boolean;
  canReconcile: boolean;
  bonusRewards: number;
}): GuestGamePilotRunbookAction[] {
  const canQueueLedger =
    canRunCanary &&
    bonusRewards > 0 &&
    stage !== 'RECONCILIATION' &&
    stage !== 'READY';
  const ledgerDisabledReason = !canRunCanary
    ? 'Сначала нужен тестовый event/process-event или approved reward.'
    : bonusRewards <= 0
      ? 'Нужна approved bonus-награда, которая попадет в bonus ledger.'
      : stage === 'RECONCILIATION'
        ? 'Первое начисление уже подтверждено: сначала завершите сверку баланса.'
        : stage === 'READY'
          ? 'Пилот уже прошел live-write и сверку.'
          : null;

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
      enabled: canQueueLedger,
      tone: 'SECONDARY',
      disabledReason: ledgerDisabledReason,
    },
    {
      key: 'DRY_RUN_BONUS_LEDGER',
      label: 'Dry-run ledger',
      enabled: canQueueLedger,
      tone: 'SECONDARY',
      disabledReason: ledgerDisabledReason,
    },
    {
      key: 'DISPATCH_BONUS_LEDGER',
      label: 'Live dispatch',
      enabled: canRunLive && stage === 'LIVE_WRITE',
      tone: 'PRIMARY',
      disabledReason:
        canRunLive && stage === 'LIVE_WRITE'
          ? null
          : canRunLive
            ? 'Live-write уже не является текущей стадией пилота.'
            : 'Нужны canary-награда, готовый scheduler и включенный Langame write-флаг.',
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
  ledgerConfirmed,
  ledgerReconciliationPending,
  ledgerReconciliationMismatch,
}: {
  items: GuestGamePilotReadinessItem[];
  activeRuleCount: number;
  events: number;
  approvedRewards: number;
  readyWalletRewards: number;
  bonusRewards: number;
  bonusLedgerAutonomousReady: boolean;
  ledgerConfirmed: number;
  ledgerReconciliationPending: number;
  ledgerReconciliationMismatch: number;
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
    canRunCanary && bonusLedgerAutonomousReady && bonusRewards > 0;
  const canReconcile = ledgerConfirmed > 0;

  const safeguards = [
    'До live-стадии используются только сохраненные факты LeetPlus и dry-run без записи в Langame.',
    'Первый live-write должен идти как canary: одна бонусная награда, один гость, один клуб 1337.',
    'Raw phone и токены не попадают в UI; ledger и delivery показывают маски и безопасные статусы.',
    'После подтверждения Langame обязательна сверка GuestBonusBalanceCurrent с новым snapshot.',
  ];
  const withActions = (
    runbook: Omit<GuestGamePilotRunbook, 'actions'>,
  ): GuestGamePilotRunbook => ({
    ...runbook,
    actions: buildPilotRunbookActions({
      stage: runbook.stage,
      canRunDryRun: runbook.canRunDryRun,
      canRunCanary: runbook.canRunCanary,
      canRunLive: runbook.canRunLive,
      canReconcile: runbook.canReconcile,
      bonusRewards,
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
      note: 'Пилотный прогон первого бонуса нельзя запускать, пока не закрыты базовые условия регистрации, OTP, профиля, связки с Langame и активного правила.',
    });
  }

  if (ledgerConfirmed > 0) {
    if (ledgerReconciliationMismatch > 0 || ledgerReconciliationPending > 0) {
      return withActions({
        stage: 'RECONCILIATION',
        stageLabel: 'Сверка',
        canRunDryRun,
        canRunCanary,
        canRunLive: false,
        canReconcile,
        blockers: downstreamBlockerTitles,
        safeguards,
        nextAction:
          ledgerReconciliationMismatch > 0
            ? 'Разобрать расхождения ledger и Langame snapshot до следующего live-write.'
            : 'Дождаться свежего guest foundation sync и bonus balance snapshot после первого начисления.',
        note: 'Первое начисление уже подтверждено Langame; следующий обязательный этап - сверка баланса и отсутствие расхождений.',
      });
    }

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
      note: 'Путь первого бонуса прошел до подтверждения Langame и последующей сверки баланса.',
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
      nextAction: bonusRewards
        ? 'Поставить одну approved bonus-награду в ledger и выполнить dry-run dispatcher перед включением live-write.'
        : 'Подготовить approved reward с бонусным rewardType, чтобы он попал в bonus ledger, а не в ручную выдачу.',
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

@Injectable()
export class GuestGamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
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
      this.getRewards(user),
      this.getDeliveries(user),
      this.getEvents(user),
      this.getTariffSnapshots(user),
      this.getGuestLogCatalog(user),
      this.getPilotStores(user),
      this.getBonusLedgerAudit(user),
      this.getBonusBalanceCurrentReconciliation(user),
    ]);

    const effect = await this.buildEffect(
      user,
      lootBoxes,
      missions,
      seasons,
      events,
    );
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
        bonusLedgerAudit,
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
    bonusLedgerAudit,
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
    bonusLedgerAudit: GuestGameBonusLedgerAudit;
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
    const activeSeasons = seasons.filter((item) => item.status === 'ACTIVE');
    const activeRuleCount =
      activeLootBoxes.length + activeMissions.length + activeSeasons.length;
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
    const bonusLedgerAutonomousReady = Boolean(
      langameWriteItem?.ready && bonusLedgerSchedulerItem?.ready,
    );
    const ledgerConfirmed = bonusLedgerAudit.summary.confirmed;
    const ledgerReconciliationPending =
      bonusLedgerAudit.summary.reconciliationPending;
    const ledgerReconciliationMismatch =
      bonusLedgerAudit.summary.reconciliationMismatch;
    const registrationReady = Boolean(
      targetStore && (targetStore.gamificationEnabled || activeRuleCount > 0),
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
          playPath: '/play',
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
          ? 'Оставить клуб включенным в публичном каталоге /play.'
          : 'Включить флаг геймификации у пилотного клуба на странице клубов.',
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
        metric: registrationReady ? '/play' : 'нужна настройка',
        note: 'Гость должен пройти путь /play -> выбор клуба -> согласие -> OTP без сотруднической авторизации.',
        nextAction: registrationReady
          ? 'Проверить путь на тестовом телефоне и открыть гостевой кабинет клуба.'
          : 'Включить клуб в каталог /play через флаг геймификации или активное игровое правило.',
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
          : 'Зарегистрировать тестового участника через /play.',
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
          ? bonusRewards.length
            ? 'READY'
            : 'PARTIAL'
          : langameWriteItem?.ready || bonusLedgerSchedulerItem?.enabled
            ? 'PARTIAL'
            : cashierReady || approvedRewards.length
              ? 'MANUAL_ONLY'
              : 'BLOCKED',
        statusLabel: bonusLedgerAutonomousReady
          ? bonusRewards.length
            ? 'авто готово'
            : 'ждет бонус'
          : langameWriteItem?.ready
            ? 'нужен scheduler'
            : bonusLedgerSchedulerItem?.enabled
              ? 'нужен write API'
              : 'ручной режим',
        ready: Boolean(bonusLedgerAutonomousReady && bonusRewards.length),
        metric: `${bonusRewards.length} bonus rewards`,
        note: 'Автономный scheduler должен поставить approved bonus rewards в ledger и отправить их через master endpoint Langame по телефону гостя без админского клика.',
        nextAction: bonusLedgerAutonomousReady
          ? bonusRewards.length
            ? 'Дождаться ближайшего scheduler tick на тестовой записи и проверить ответ Langame.'
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
        status: ledgerConfirmed
          ? ledgerReconciliationMismatch
            ? 'BLOCKED'
            : ledgerReconciliationPending
              ? 'PARTIAL'
              : 'READY'
          : langameWriteItem?.ready && bonusRewards.length
            ? 'PARTIAL'
            : 'MANUAL_ONLY',
        statusLabel: ledgerConfirmed
          ? ledgerReconciliationMismatch
            ? 'расхождение'
            : ledgerReconciliationPending
              ? 'ждет snapshot'
              : 'сверено'
          : 'после пилота',
        ready: Boolean(
          ledgerConfirmed &&
          !ledgerReconciliationPending &&
          !ledgerReconciliationMismatch,
        ),
        metric: ledgerConfirmed
          ? `${ledgerConfirmed} confirmed / ${ledgerReconciliationMismatch} mismatch`
          : 'snapshot vs current',
        note: 'Финальный production-сигнал: после первого начисления сверить ledger balanceAfter с ночным snapshot Langame.',
        nextAction: ledgerConfirmed
          ? ledgerReconciliationMismatch
            ? 'Разобрать записи расхождений в журнале bonus ledger и сверить гостя в Langame.'
            : ledgerReconciliationPending
              ? 'Дождаться guest foundation sync и нового bonus balance snapshot после начисления.'
              : 'Сохранить эту операцию как эталон пилотного начисления.'
          : 'После боевого начисления дождаться guest foundation sync и сравнить текущий live-баланс с новым snapshot.',
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
      ledgerConfirmed,
      ledgerReconciliationPending,
      ledgerReconciliationMismatch,
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
    const telegramBotUsername = envString('GUEST_GAME_TELEGRAM_BOT_USERNAME');
    const telegramLinkSecret =
      envString('GUEST_GAME_TELEGRAM_LINK_SECRET') ??
      envString('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET');
    const telegramWebhookSecret =
      envString('GUEST_GAME_TELEGRAM_WEBHOOK_SECRET') ??
      envString('GUEST_GAME_TELEGRAM_LINK_SECRET');
    const publicApiUrl =
      envString('PUBLIC_API_URL') ??
      envString('NEXT_PUBLIC_API_URL') ??
      envString('API_PUBLIC_URL') ??
      'https://api.leetplus.ru';
    const telegramLinkConfigured = Boolean(
      telegramBotUsername && telegramLinkSecret,
    );
    const telegramWebhookConfigured = Boolean(telegramWebhookSecret);
    const telegramDeliveryConfigured = Boolean(
      telegramProvider?.configured && telegramProvider.enabledByEnv,
    );
    const maxDeliveryConfigured = Boolean(
      maxProvider?.configured && maxProvider.enabledByEnv,
    );
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
        note: otp.sms.note,
        nextAction: otp.sms.nextAction,
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
          ? 'Проверить deep link в гостевом кабинете и webhook consumer.'
          : 'Настроить username бота и link secret до публичного запуска привязки.',
      },
      {
        key: 'TELEGRAM_WEBHOOK',
        title: 'Telegram webhook consumer',
        status: telegramWebhookConfigured ? 'READY' : 'BLOCKED',
        statusLabel: telegramWebhookConfigured ? 'секрет есть' : 'секрет нужен',
        ready: telegramWebhookConfigured,
        configured: telegramWebhookConfigured,
        enabled: telegramWebhookConfigured,
        requiredEnv: ['GUEST_GAME_TELEGRAM_WEBHOOK_SECRET'],
        note: 'Webhook принимает /start link-code и команды отписки, не хранит raw update и не отправляет внешние ответы.',
        nextAction: telegramWebhookConfigured
          ? `Убедиться, что webhook бота указывает на ${publicApiUrl.replace(/\/$/, '')}/guest-portal/telegram/webhook.`
          : 'Задать webhook secret и только потом подключать внешний бот к production webhook.',
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
        status: maxDeliveryConfigured ? 'MANUAL_ONLY' : 'BLOCKED',
        statusLabel: maxDeliveryConfigured ? 'ожидает API' : 'не настроено',
        ready: false,
        configured: Boolean(maxProvider?.configured),
        enabled: Boolean(maxProvider?.enabledByEnv),
        requiredEnv: maxProvider?.requiredEnv ?? [
          'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
          'GUEST_GAME_MAX_DELIVERY_ENABLED',
          'GUEST_GAME_MAX_BOT_TOKEN',
          'GUEST_GAME_MAX_DELIVERY_ENDPOINT',
        ],
        note: 'MAX остается вторым адаптером: нужна юридическая подготовка и подтвержденный API-контракт.',
        nextAction:
          'Не включать автоматизацию MAX до утвержденного endpoint, токена, согласий и обработки отписок.',
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
    const [rows, mappings] = await Promise.all([
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

    return {
      items,
      mappings: mappedMappings,
      summary: {
        types: items.length,
        logs: items.reduce((sum, item) => sum + item.count, 0),
        domains: domains.size,
        latestAt: latestAt?.toISOString() ?? null,
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
    ]);
    const guestGroupMap = new Map(
      guestGroups.map((group) => [snapshotGroupKey(group), group]),
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
      if (!fact.guest?.id) {
        facts.push({
          ...pipelineFactBase(fact),
          status: 'SKIPPED',
          reason:
            'Факт не привязан к гостю Langame, автоматический запуск пропущен.',
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
          note: 'Автоматический batch pipeline обработал сохраненный Langame snapshot-факт внутри LeetPlus. Запись в Langame не выполнялась.',
        });

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
        id: tenantId,
        slug: tenantSlug,
      }) as Prisma.TenantWhereInput,
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
        id: tenantId,
        slug: tenantSlug,
      }) as Prisma.TenantWhereInput,
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
            : await sendMaxDeliveryPlaceholder();
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
    const now = new Date();
    const data = clean({
      status: nextStatus,
      note: nullableString(dto.note),
      sentAt: nextStatus === 'SENT' ? (current.sentAt ?? now) : current.sentAt,
      failedAt:
        nextStatus === 'FAILED' ? (current.failedAt ?? now) : current.failedAt,
      canceledAt:
        nextStatus === 'CANCELED'
          ? (current.canceledAt ?? now)
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
        'Подтвержденный запуск события геймификации в LeetPlus.',
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
          note: 'Создано подтвержденным запуском события геймификации.',
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
      note: 'Это внутренняя готовность LeetPlus: Telegram/MAX, SMS и Langame write API здесь не вызываются. После подключения бота этот слой можно использовать как безопасную очередь отправки и выдачи.',
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
      items: deliveries.slice(0, 12),
      note: 'Outbox хранит подготовленные снимки выдачи наград. Внешний Telegram/MAX-бот пока не отправляет эти сообщения.',
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
      rewardType: requiredString(dto.rewardType, 'Тип награды', isCreate),
      rewardAmount:
        decimalValue(dto.rewardAmount) ??
        (isCreate ? new Prisma.Decimal(0) : undefined),
      rewardLabel: requiredString(
        dto.rewardLabel,
        'Название награды',
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

function resolveProfileCommunication(row: ProfileRow): {
  phoneConsentStatus: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUBSCRIBED';
  phoneConsentSource: string | null;
  phoneConsentAt: Date | null;
  unsubscribedAt: Date | null;
} {
  if (
    row.guest &&
    (row.guest.phoneConsentStatus !== 'UNKNOWN' ||
      !row.lead ||
      row.lead.phoneConsentStatus === 'UNKNOWN')
  ) {
    return {
      phoneConsentStatus: row.guest.phoneConsentStatus,
      phoneConsentSource: row.guest.phoneConsentSource,
      phoneConsentAt: row.guest.phoneConsentAt,
      unsubscribedAt: row.guest.unsubscribedAt,
    };
  }

  if (row.lead) {
    return {
      phoneConsentStatus: row.lead.phoneConsentStatus,
      phoneConsentSource: row.lead.phoneConsentSource,
      phoneConsentAt: row.lead.phoneConsentAt,
      unsubscribedAt: row.lead.unsubscribedAt,
    };
  }

  return {
    phoneConsentStatus: 'UNKNOWN',
    phoneConsentSource: null,
    phoneConsentAt: null,
    unsubscribedAt: null,
  };
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
    budgetAmount: numberOrNull(row.budgetAmount),
    manualApprovalRequired: row.manualApprovalRequired,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    audience: mapAudience(row.audience),
    createdBy: mapUser(row.createdByUser),
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
  const smsConfigured = Boolean(
    envString('GUEST_PORTAL_OTP_SMS_ENDPOINT') &&
    envString('GUEST_PORTAL_OTP_SMS_TOKEN'),
  );
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
      'GUEST_PORTAL_OTP_SMS_ENDPOINT',
      'GUEST_PORTAL_OTP_SMS_TOKEN',
    ],
    configuredNote:
      'SMS provider имеет endpoint и token; внешний вызов включится только при общем флаге реальной отправки.',
    blockedNote:
      'SMS OTP не готов: нужен provider endpoint, token и явное включение канала.',
    nextAction:
      'После выбора SMS-провайдера задать endpoint/token на VDS, включить канал на тестовом госте и проверить audit без раскрытия кода.',
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
      'Telegram token найден; OTP можно отправить только гостю с уже подтвержденным numeric chat_id.',
    blockedNote:
      'Telegram OTP не готов: нужен bot token, включенный канал и заранее привязанный гостем Telegram.',
    nextAction:
      'Сначала проверить deep link и webhook привязки бота, затем включать OTP только для профилей с сохраненным chat:<id>.',
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

function guestPortalOtpProviderReadiness({
  channelLabel,
  realSendEnabled,
  channelEnabled,
  configured,
  requiredEnv,
  configuredNote,
  blockedNote,
  nextAction,
}: {
  channelLabel: string;
  realSendEnabled: boolean;
  channelEnabled: boolean;
  configured: boolean;
  requiredEnv: string[];
  configuredNote: string;
  blockedNote: string;
  nextAction: string;
}): GuestPortalOtpProviderReadiness {
  const ready = realSendEnabled && channelEnabled && configured;
  const status: GuestGameIntegrationReadinessStatus = ready
    ? 'READY'
    : realSendEnabled || channelEnabled || configured
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
    requiredEnv,
    note: ready
      ? configuredNote
      : status === 'PARTIAL'
        ? `${channelLabel} OTP настроен частично: проверьте общий флаг реальной отправки, флаг канала и provider-секреты.`
        : blockedNote,
    nextAction,
  };
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
  };
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
    },
  };
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

  return {
    channel,
    channelLabel: 'MAX',
    pendingReady,
    enabledByEnv,
    configured,
    canAttemptSend: false,
    dryRunOnly: true,
    requiredEnv: [
      'GUEST_GAME_DELIVERY_REAL_SEND_ENABLED',
      'GUEST_GAME_MAX_DELIVERY_ENABLED',
      'GUEST_GAME_MAX_BOT_TOKEN',
      'GUEST_GAME_MAX_DELIVERY_ENDPOINT',
    ],
    note:
      configured && enabledByEnv
        ? 'MAX provider ожидает утвержденный API-контракт; автоматическая отправка пока заблокирована.'
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

function sendMaxDeliveryPlaceholder(): Promise<Prisma.InputJsonValue> {
  return Promise.reject(
    new Error(
      'MAX delivery provider is not implemented until confirmed API contract is configured.',
    ),
  );
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
          ? `диапазон ${hoursFrom ?? 0}-${hoursTo ?? '∞'} ч`
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
      label: `Товарная покупка: ${productName ?? 'товар'} · ${guestName}`,
      details: [
        row.storeNameAtSale ?? row.store?.name,
        productName,
        row.product?.category?.name,
        row.product?.supplier?.name,
        quantity ? `${quantity} шт` : null,
        revenue ? `${Math.abs(revenue)} руб` : null,
        cost ? `себестоимость ${Math.abs(cost)} руб` : null,
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

  if (perGuestPerWeek != null) {
    const guestRewards = rewards.filter((reward) =>
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
    const dayCount = rewards.filter((reward) =>
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
    items: [
      { label: 'XP battle pass', weight: 50 },
      { label: 'Промокод бара', weight: 30 },
      { label: 'Миссия на повторный визит', weight: 20 },
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
    { level: 3, xp: 500, freeReward: 'Бонус на следующий визит' },
    { level: 4, xp: 900, freeReward: 'Часы игры с подтверждением' },
  ];
}
