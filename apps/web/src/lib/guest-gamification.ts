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
  source: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  guestExternalId: string | null;
  rewardType: string;
  rewardAmount: number;
  rewardLabel: string;
  rewardCode: string | null;
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

export type GuestGamificationWorkspace = {
  summary: GuestGamificationSummary;
  profiles: GuestGameProfile[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  rewards: GuestGameReward[];
  events: GuestGameEvent[];
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
