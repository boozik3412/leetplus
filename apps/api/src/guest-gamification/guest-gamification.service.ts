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
import { PrismaService } from '../prisma/prisma.service';

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
const eventSources = ['MANUAL', 'LANGAME', 'API_IMPORT', 'SYSTEM'] as const;
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
    },
  },
  lead: {
    select: {
      id: true,
      fullNameMasked: true,
      phoneMasked: true,
      emailMasked: true,
      matchedGuestId: true,
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

export type GuestGamificationWorkspace = {
  summary: GuestGamificationSummary;
  economy: GuestGameEconomy;
  effect: GuestGameEffect;
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

@Injectable()
export class GuestGamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(
    user: AuthenticatedUser,
  ): Promise<GuestGamificationWorkspace> {
    const [
      profiles,
      lootBoxes,
      missions,
      seasons,
      rewards,
      events,
      tariffSnapshots,
      guestLogCatalog,
    ] = await Promise.all([
      this.getProfiles(user),
      this.getLootBoxes(user),
      this.getMissions(user),
      this.getSeasons(user),
      this.getRewards(user),
      this.getEvents(user),
      this.getTariffSnapshots(user),
      this.getGuestLogCatalog(user),
    ]);

    const effect = await this.buildEffect(
      user,
      lootBoxes,
      missions,
      seasons,
      events,
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

  private async getGuestLogCatalog(
    user: AuthenticatedUser,
  ): Promise<GuestGameGuestLogCatalog> {
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

    const items = [...itemMap.values()]
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }

        return (
          (right.latestAt?.getTime() ?? 0) - (left.latestAt?.getTime() ?? 0)
        );
      })
      .slice(0, 80)
      .map((item) => ({
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
        createdByUserId: user.id,
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

  async getRewards(user: AuthenticatedUser): Promise<GuestGameReward[]> {
    const rows = await this.prisma.guestGameReward.findMany({
      where: { tenantId: user.tenantId },
      include: rewardInclude,
      orderBy: [{ qualifiedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
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

  async getEvents(user: AuthenticatedUser): Promise<GuestGameEvent[]> {
    const rows = await this.prisma.guestGameEvent.findMany({
      where: { tenantId: user.tenantId },
      include: eventInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
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
    const event = await this.createProcessEvent(user, {
      profileId: profile.id,
      guestId: profile.guest?.id ?? dryRun.guest?.id ?? null,
      eventType: dryRun.eventType,
      source: 'API_IMPORT',
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
          status: 'PENDING',
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

  private buildEconomy(
    lootBoxes: GuestGameLootBox[],
    missions: GuestGameMission[],
    seasons: GuestGameSeason[],
    rewards: GuestGameReward[],
    events: GuestGameEvent[],
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
        .slice(0, 12),
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
        .slice(0, 12),
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
      createdByUserId: isCreate ? user.id : undefined,
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
      createdByUserId: isCreate ? user.id : undefined,
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
      createdByUserId: isCreate ? user.id : undefined,
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
      createdByUserId: isCreate ? user.id : undefined,
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
      createdByUserId: isCreate ? user.id : undefined,
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
      createdByUserId: user.id,
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
        createdByUserId: user.id,
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
    createdBy: mapUser(row.createdByUser),
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
    (expected === 'VISIT' && actual === 'SESSION_START') ||
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
