import { getApiUrl, getAuthHeaders } from "./api";

export type GuestGameStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "FINISHED"
  | "ARCHIVED";

export type GuestGameProfileStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

export type GuestGameRewardStatus =
  | "PENDING"
  | "APPROVED"
  | "PAID"
  | "CANCELED"
  | "EXPIRED";

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
  status: GuestGameProfileStatus;
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
    phoneConsentStatus: "UNKNOWN" | "GRANTED" | "DENIED" | "UNSUBSCRIBED";
    phoneConsentSource: string | null;
    phoneConsentAt: string | null;
    unsubscribedAt: string | null;
    telegramReady: boolean;
    maxReady: boolean;
    botReady: boolean;
  };
  createdBy: GuestGameUser | null;
};

export type GuestGameLootBox = {
  id: string;
  name: string;
  status: GuestGameStatus;
  triggerKind: string;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string | null;
  segment: string | null;
  sessionType: string | null;
  storeIds: string[];
  periodRules: unknown;
  limits: unknown;
  probabilityRules: unknown;
  budgetAmount: number | null;
  antiFraudRules: unknown;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameMission = {
  id: string;
  name: string;
  status: GuestGameStatus;
  missionType: string;
  triggerKind: string;
  rewardType: string;
  rewardAmount: number | null;
  rewardLabel: string | null;
  xpReward: number;
  progressTarget: number | null;
  progressUnit: string | null;
  conditions: unknown;
  storeIds: string[];
  periodFrom: string | null;
  periodTo: string | null;
  budgetAmount: number | null;
  perGuestLimit: number | null;
  totalRewardLimit: number | null;
  antiFraudRules: unknown;
  manualApprovalRequired: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  audience: GuestGameAudience | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameSeason = {
  id: string;
  name: string;
  status: GuestGameStatus;
  seasonType: string;
  periodFrom: string | null;
  periodTo: string | null;
  xpRules: unknown;
  levels: unknown;
  freeRewards: unknown;
  premiumRewards: unknown;
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
  status: GuestGameRewardStatus;
  walletState:
    | "WAITING_APPROVAL"
    | "READY"
    | "REDEEMED"
    | "CANCELED"
    | "EXPIRED";
  source: string;
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
  evidence: unknown;
  createdAt: string;
  updatedAt: string;
  profile: Pick<
    GuestGameProfile,
    "id" | "displayName" | "contactMasked" | "xp" | "level"
  > | null;
  guest: GuestGameProfile["guest"];
  lootBox: { id: string; name: string; status: string } | null;
  mission: { id: string; name: string; status: string; xpReward: number } | null;
  season: { id: string; name: string; status: string } | null;
  store: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
  approvedBy: GuestGameUser | null;
};

export type GuestGameEvent = {
  id: string;
  eventType: string;
  source: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  xpDelta: number;
  occurredAt: string;
  payload: unknown;
  note: string | null;
  createdAt: string;
  profile: Pick<
    GuestGameProfile,
    "id" | "displayName" | "contactMasked" | "xp" | "level"
  > | null;
  guest: GuestGameProfile["guest"];
  lootBox: { id: string; name: string } | null;
  mission: { id: string; name: string } | null;
  season: { id: string; name: string } | null;
  createdBy: GuestGameUser | null;
};

export type GuestGameDryRunRule = {
  id: string;
  kind: "LOOT_BOX" | "MISSION" | "SEASON";
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
    "id" | "displayName" | "contactMasked" | "xp" | "level" | "status"
  > | null;
  guest: GuestGameProfile["guest"];
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
    | "GUEST_SESSION"
    | "GUEST_LOG"
    | "GUEST_TRANSACTION"
    | "GUEST_OPERATION_LOG"
    | "GUEST_BALANCE"
    | "GUEST_BONUS_BALANCE"
    | "GUEST_LOYALTY_GROUP"
    | "PRODUCT_EXPENSE";
  eventType: string;
  occurredAt: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  guest: GuestGameProfile["guest"];
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

export type GuestGamePipelineFactStatus =
  | "DRY_RUN"
  | "PROCESSED"
  | "SKIPPED"
  | "DUPLICATE"
  | "ERROR";

export type GuestGamePipelineFactResult = {
  factId: string;
  source: GuestGameSnapshotFact["source"];
  label: string;
  eventType: string;
  occurredAt: string;
  guest: GuestGameProfile["guest"];
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
  kind: "LOOT_BOX" | "MISSION" | "SEASON" | "MANUAL";
  id: string;
  name: string;
  status: GuestGameStatus | "ACTIVE";
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
  kind: "LOOT_BOX" | "MISSION" | "SEASON" | "MANUAL";
  id: string;
  name: string;
  status: GuestGameStatus | "ACTIVE";
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
  | "READY_FOR_BOT"
  | "READY_FOR_CASHIER"
  | "NEEDS_APPROVAL"
  | "NEEDS_CONSENT"
  | "NEEDS_CHANNEL"
  | "UNSUBSCRIBED"
  | "EXPIRED"
  | "REDEEMED"
  | "CANCELED";

export type GuestGameCommunicationQueueItem = {
  id: string;
  rewardId: string;
  profileId: string | null;
  guestLabel: string;
  contactMasked: string | null;
  rewardLabel: string;
  rewardType: string;
  rewardAmount: number;
  walletState: GuestGameReward["walletState"];
  queueStatus: GuestGameCommunicationQueueStatus;
  queueStatusLabel: string;
  channel: "TELEGRAM" | "MAX" | "CASHIER" | "MANUAL";
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

export type GuestGameDeliveryStatus =
  | "READY"
  | "BLOCKED"
  | "SENT"
  | "FAILED"
  | "CANCELED";

export type GuestGameDeliveryChannel = "TELEGRAM" | "MAX" | "CASHIER" | "MANUAL";

export type GuestGameDeliveryProviderStatus = {
  channel: "TELEGRAM" | "MAX";
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
  mode: "DISABLED" | "DRY_RUN" | "READY";
  modeLabel: string;
  realSendEnabled: boolean;
  providers: GuestGameDeliveryProviderStatus[];
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
  items: Array<{
    deliveryId: string;
    rewardId: string;
    channel: GuestGameDeliveryChannel;
    status: "DRY_RUN" | "SENT" | "FAILED" | "SKIPPED" | "BLOCKED";
    note: string;
  }>;
  deliveries: GuestGameDelivery[];
  dispatcher: GuestGameDeliveryDispatcherStatus;
  note: string;
};

export type GuestGameDeliveryEvent = {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  channel: GuestGameDeliveryChannel | null;
  note: string | null;
  payload: unknown;
  createdAt: string;
  actor: { id: string; fullName: string | null; email: string } | null;
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
  metadata: unknown;
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
  guest: GuestGameProfile["guest"];
  store: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string | null; email: string } | null;
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
  | "READY"
  | "PARTIAL"
  | "BLOCKED"
  | "MANUAL_ONLY";

export type GuestGameIntegrationReadinessItem = {
  key:
    | "PUBLIC_PORTAL"
    | "OTP"
    | "OTP_SMS"
    | "OTP_TELEGRAM"
    | "OTP_MAX"
    | "TELEGRAM_LINK"
    | "TELEGRAM_WEBHOOK"
    | "TELEGRAM_DELIVERY"
    | "MAX_DELIVERY"
    | "LANGAME_WRITE_API";
  title: string;
  status: GuestGameIntegrationReadinessStatus;
  statusLabel: string;
  ready: boolean;
  configured: boolean;
  enabled: boolean;
  requiredEnv: string[];
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

export type GuestGameTariffSnapshotStatus =
  | "READY"
  | "PARTIAL"
  | "STALE"
  | "FAILED"
  | "UNPROFILED";

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

export type GuestGameGuestLogMappingPreset =
  | "visit_or_session_start"
  | "session_finish"
  | "events_and_tournaments"
  | "balance_and_payment"
  | "manual_or_risk"
  | "custom";

export type GuestGameGuestLogMappingIntent = "allow" | "block";

export type GuestGameGuestLogTypeMapping = {
  id: string;
  rawType: string;
  normalizedType: string;
  label: string;
  preset: GuestGameGuestLogMappingPreset;
  intent: GuestGameGuestLogMappingIntent;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: GuestGameUser | null;
  updatedBy: GuestGameUser | null;
};

export type GuestGameGuestLogCatalogItem = {
  type: string;
  normalizedType: string;
  count: number;
  latestAt: string | null;
  domains: GuestGameGuestLogCatalogDomain[];
  mapping: GuestGameGuestLogTypeMapping | null;
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

export type GuestGamificationWorkspace = {
  summary: GuestGamificationSummary;
  economy: GuestGameEconomy;
  effect: GuestGameEffect;
  integrationReadiness: GuestGameIntegrationReadiness;
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

export async function getGuestGamificationWorkspace(): Promise<GuestGamificationWorkspace> {
  const response = await fetch(`${getApiUrl()}/guests/gamification/workspace`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guest gamification workspace");
  }

  return response.json() as Promise<GuestGamificationWorkspace>;
}
