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
    idempotent: boolean;
    langameWrite: false;
  };
  note: string;
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
    | "GUEST_SESSION"
    | "GUEST_LOG"
    | "GUEST_TRANSACTION"
    | "GUEST_OPERATION_LOG"
    | "GUEST_BALANCE"
    | "GUEST_BONUS_BALANCE"
    | "GUEST_LOYALTY_GROUP"
    | "PRODUCT_EXPENSE"
    | "GUEST_GAME_REFERRAL";
  eventType: string;
  occurredAt: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  profileId?: string | null;
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
    referrals: number;
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

export type GuestGameRunbookLink = {
  label: string;
  path: string;
  href: string;
};

export type GuestGameBotConsumerStatus = {
  mode: "BLOCKED" | "DRY_RUN" | "READY";
  modeLabel: string;
  dryRun: boolean;
  configured: boolean;
  limit: number;
  canaryLimit: boolean;
  canaryRequired: boolean;
  channels: Array<"TELEGRAM" | "MAX">;
  requiredEnv: string[];
  runbook: GuestGameRunbookLink;
  pendingReady: number;
  pendingTelegram: number;
  pendingMax: number;
  sentAck: number;
  failedAck: number;
  blockedAck: number;
  lastAckAt: string | null;
  nextAction: string;
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
  botConsumer: GuestGameBotConsumerStatus;
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
    | "USER_CALL_AUTH"
    | "INCOMING_CALL_LAST4_AUTH"
    | "TELEGRAM_LINK"
    | "TELEGRAM_WEBHOOK"
    | "TELEGRAM_AUTH_REPLY_SENDER"
    | "TELEGRAM_MINI_APP"
    | "TELEGRAM_DELIVERY"
    | "MAX_DELIVERY"
    | "BONUS_LEDGER_SCHEDULER"
    | "LANGAME_WRITE_API";
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
    | "CLUB"
    | "GEOSEARCH"
    | "PUBLIC_REGISTRATION"
    | "OTP"
    | "GAME_PROFILE"
    | "LANGAME_MATCH"
    | "ACTIVE_RULES"
    | "GUEST_LOGS"
    | "TEST_EVENT"
    | "REWARD_QUEUE"
    | "BONUS_LEDGER"
    | "BALANCE_RECONCILIATION";
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
  | "NO_STORE"
  | "EMPTY"
  | "READY"
  | "MULTIPLE"
  | "PROCESSING"
  | "WAITING_RETRY";

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
  | "NO_STORE"
  | "WAITING_LIVE"
  | "WAITING_SYNC"
  | "MATCHED"
  | "MISMATCH";

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
    reconciliation: GuestGameBonusLedgerAuditItem["reconciliation"];
  } | null;
  metric: string;
  note: string;
  nextAction: string;
};

export type GuestGamePilotRunbookStage =
  | "BLOCKED"
  | "DRY_RUN"
  | "CANARY"
  | "LIVE_WRITE"
  | "RECONCILIATION"
  | "READY";

export type GuestGamePilotRunbookActionKey =
  | "OPEN_DRY_RUN"
  | "QUEUE_BONUS_LEDGER"
  | "DRY_RUN_BONUS_LEDGER"
  | "DISPATCH_BONUS_LEDGER"
  | "RECONCILE_BALANCE";

export type GuestGamePilotRunbookAction = {
  key: GuestGamePilotRunbookActionKey;
  label: string;
  enabled: boolean;
  tone: "PRIMARY" | "SECONDARY";
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

export type GuestGameBonusLedgerMode = "DISABLED" | "DRY_RUN" | "READY";

export type GuestGameBonusLedgerItemStatus =
  | "QUEUED"
  | "DRY_RUN"
  | "CONFIRMED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELED"
  | "BLOCKED";

export type GuestGameBonusLedgerStatus = {
  mode: GuestGameBonusLedgerMode;
  modeLabel: string;
  ready: boolean;
  langamePath: string | null;
  rewardTypes: string[];
  pendingApprovedRewards: number;
  pending: number;
  processing: number;
  confirmed: number;
  failed: number;
  canceled: number;
  total: number;
  note: string;
};

export type GuestGameBonusLedgerQueueItem = {
  rewardId: string;
  status: "QUEUED" | "SKIPPED";
  reason: string | null;
  externalDomain: string | null;
  externalGuestId: string | null;
  amount: number;
};

export type GuestGameBonusLedgerQueueResult = {
  checkedRewards: number;
  queued: number;
  skipped: number;
  rewardTypes: string[];
  items: GuestGameBonusLedgerQueueItem[];
  note: string;
};

export type GuestGameBonusLedgerDispatchItem = {
  ledgerEntryId: string;
  rewardId: string | null;
  status: GuestGameBonusLedgerItemStatus;
  amount: number;
  externalDomain: string | null;
  externalGuestId: string | null;
  note: string;
};

export type GuestGameBonusLedgerDispatchResult = {
  mode: GuestGameBonusLedgerMode;
  dryRun: boolean;
  canary: boolean;
  ready: boolean;
  queued: GuestGameBonusLedgerQueueResult | null;
  checked: number;
  confirmed: number;
  failed: number;
  skipped: number;
  blocked: number;
  items: GuestGameBonusLedgerDispatchItem[];
  status: GuestGameBonusLedgerStatus;
  note: string;
};

export type GuestGameBonusLedgerReconciliationState =
  | "NOT_READY"
  | "WAITING_SYNC"
  | "MATCHED"
  | "MISMATCH"
  | "NOT_APPLICABLE";

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
  | "MATCHED"
  | "MISMATCH"
  | "WAITING_SYNC"
  | "NO_SNAPSHOT";

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
    lastSuccessfulSync: {
      businessDate: string;
      updatedAt: string;
      guestLogs: number;
      sources: number | null;
      failedSources: number | null;
    } | null;
  };
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

export async function checkInGuestGame(
  guestId: string,
  options: { storeId?: string | null; note?: string | null } = {},
): Promise<GuestGameCheckInResult> {
  const response = await fetch(`${getApiUrl()}/guests/gamification/check-ins`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...(await getAuthHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      guestId,
      storeId: options.storeId ?? null,
      note: options.note ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to check in guest");
  }

  return response.json() as Promise<GuestGameCheckInResult>;
}
