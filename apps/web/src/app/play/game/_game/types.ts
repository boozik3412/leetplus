import type {
  GuestPortalGameSummary,
  GuestPortalRewardWalletItem,
  GuestPortalGameMissionPage,
  GuestPortalLootBoxRarity,
  GuestPortalRewardLootBoxPreview,
} from "@/lib/guest-portal";
import type { CSSProperties } from "react";
import type {
  GuestMissionPreviewData,
} from "@/components/guest-mission-preview";

export type LoadState = "loading" | "ready" | "empty" | "error";

export type GameNextAction = GuestPortalGameSummary["nextActions"][number];

export type GameRewardWalletState =
  GuestPortalGameSummary["rewards"]["recent"][number]["walletState"];

export type GameRewardHistoryItem = Omit<
  GuestPortalGameSummary["rewards"]["recent"][number],
  "sourceKind"
> & {
  sourceKind: GuestPortalRewardWalletItem["sourceKind"];
  storeId: string | null;
  storeName: string | null;
  claimedAt: string | null;
};

export type GameBonusHistoryItem =
  GuestPortalGameSummary["rewards"]["bonusHistory"]["items"][number];

export type GameMission = GuestPortalGameMissionPage["items"][number];

export type GameMissionHistoryItem =
  GuestPortalGameSummary["missions"]["history"][number];

export type GameJourneyStep = GuestPortalGameSummary["journey"]["steps"][number];

export type HomeBanner = {
  id: string;
  label: string;
  title: string;
  description: string;
  tag: string;
  featured?: boolean;
  href: string;
  imageUrl?: string | null;
};

export type HomeLootCard = {
  id: string;
  title: string;
  description: string;
  triggerKind: string;
  sessionType: string | null;
  schedule: GuestPortalGameSummary["lootBoxes"]["featured"][number]["schedule"];
  status: string;
  active: boolean;
  openable: boolean;
  openState: GuestPortalGameSummary["lootBoxes"]["featured"][number]["openState"];
  openBlocker: string | null;
  rewardLabel: string | null;
  possibleRewards: GuestPortalGameSummary["lootBoxes"]["featured"][number]["possibleRewards"];
  caseRarity: GuestPortalLootBoxRarity;
  caseRarityLabel: string;
  rewardRarity?: GuestPortalLootBoxRarity | null;
  rewardRarityLabel?: string | null;
  rewardDropChance?: number | null;
  weeklyOpenedCount: number;
  weeklyLimit: number | null;
  dailyOpenedCount: number;
  dailyLimit: number | null;
  periodicLimitPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  periodicOpenedCount: number;
  walletItemId: string | null;
  walletReady: boolean;
  walletStatus: GuestPortalRewardWalletItem["status"] | null;
};

export type LootboxOverlayPhase =
  | "ready"
  | "charging"
  | "rolling"
  | "opening"
  | "open"
  | "collected";

export type GuestPortalLootBoxOpenResponse = {
  processed: true;
  idempotent: boolean;
  createdRewards: number;
  queuedRewardAmount: number;
  rewards: Array<{
    rewardType?: string | null;
    rewardLabel?: string | null;
    rewardRarity?: GuestPortalLootBoxRarity | null;
    rewardRarityLabel?: string | null;
    rewardDropChance?: number | null;
    visualMode?: "AUTO" | "ICON" | "IMAGE";
    iconKey?: "coins" | "discount" | "ticket" | "clock" | "gift" | "merch";
    imageUrl?: string | null;
    borderColor?: string | null;
    textColor?: string | null;
    backgroundColor?: string | null;
  }>;
  summary: GuestPortalGameSummary;
  message: string;
};

export type LootboxOpenReward = GuestPortalLootBoxOpenResponse["rewards"][number];

export type LootboxRouletteReward = {
  id: string;
  reward: string;
  caption: string;
  rarity: GuestPortalLootBoxRarity | null;
  rarityLabel: string | null;
  dropChance: number | null;
  rewardType: string | null;
  visualMode: "AUTO" | "ICON" | "IMAGE";
  iconKey: "coins" | "discount" | "ticket" | "clock" | "gift" | "merch";
  imageUrl: string | null;
  borderColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  isWinner?: boolean;
};

export type LootboxRouletteState = {
  runId: number;
  lootBoxId: string;
  items: LootboxRouletteReward[];
  winningIndex: number;
  durationMs: number;
  reward: string;
  caption: string;
  rarity: GuestPortalLootBoxRarity | null;
  rarityLabel: string | null;
  dropChance: number | null;
  message: string;
  skipped: boolean;
};

export type GuestPortalProfileUpdateResponse = {
  summary: GuestPortalGameSummary;
  message: string;
};

export type BannerTitleStyle = CSSProperties &
  Partial<
    Record<
      | "--banner-title-size"
      | "--banner-title-line-height"
      | "--banner-title-compact-size"
      | "--banner-title-compact-line-height",
      string
    >
  >;

export type HomeBattleQuest = {
  id: string;
  sourceKind: "journey" | "mission" | "fallback";
  sourceId: string;
  title: string;
  description: string;
  state: "complete" | "current" | "locked";
  label: string;
  step: string;
  status: string;
  condition: string;
  reward: string;
  preview: string;
  progress?: {
    current: number;
    total: number;
    label: string;
    percent: number;
  };
  periodTo?: string | null;
  x: string;
  y: string;
};

export type BattlePassDetailProgress = NonNullable<HomeBattleQuest["progress"]>;

export type HomeBattlePassSeason = NonNullable<
  GuestPortalGameSummary["battlePass"]["active"]
>;

export type HomeBattlePassLevel = HomeBattlePassSeason["levels"][number];

export type BattlePassRewardType =
  | "xp"
  | "coins"
  | "discount"
  | "lootbox"
  | "avatar"
  | "boost"
  | "rank";

export type BattlePassRewardStatus = "locked" | "current" | "ready" | "claimed";

export type BattlePassRewardCard = {
  id: string;
  level: number;
  title: string;
  subtitle: string;
  condition?: string | null;
  executionCondition?: string | null;
  description?: string | null;
  plannedReward?: string | null;
  type: BattlePassRewardType;
  rarity: GuestPortalLootBoxRarity;
  status: BattlePassRewardStatus;
  image?: string;
  lootBoxPreview?: GuestPortalRewardLootBoxPreview | null;
  rewardValue?: string;
  xpThreshold?: number;
  previousXpThreshold?: number;
  quest?: HomeBattleQuest;
};

export type BattlePassEventName =
  | "reward_click"
  | "reward_claim"
  | "help_click"
  | "track_scroll"
  | "level_focus";

export type QuestStatus = "done" | "live" | "next";

export type RewardHistorySource =
  | "checkin"
  | "lootbox"
  | "battlepass"
  | "quest"
  | "promo";

export type RewardHistorySourceFilter = RewardHistorySource | "all";

export type RewardHistoryRarityFilter = GuestPortalLootBoxRarity | "all";

export type PlayerQuest = {
  id: string;
  title: string;
  description: string;
  condition: string;
  status: QuestStatus;
  progress?: {
    current: number;
    total: number;
    label: string;
    percent: number;
  };
  reward?: {
    type: "xp" | "lootbox" | "rank" | "promo";
    value: string | number;
  };
  walletItem: GuestPortalRewardWalletItem | null;
  rewardLootBox: GuestPortalRewardLootBoxPreview | null;
  preview: GuestMissionPreviewData;
};

export type QuestCompletionDialog = {
  id: string;
  title: string;
  rewardLabel: string;
  statusLabel: string;
  receivedAt: string;
  rewardLootBox: GuestPortalRewardLootBoxPreview | null;
};

export type BattlePassLevelCompletionDialog = {
  seasonId: string;
  seasonName: string;
  completedLevel: number;
  completedTitle: string;
  rewardLabel: string;
  nextLevel: number | null;
  nextTitle: string | null;
  nextCondition: string | null;
  rewardLootBox: GuestPortalRewardLootBoxPreview | null;
};

export type CheckInCompletionDialog = {
  id: string;
  alreadyCounted: boolean;
  error: boolean;
  rewardLabel: string | null;
  receivedAt: string;
  note: string | null;
};

export type CompletionDialogQueueItem =
  | {
      key: string;
      kind: "CHECK_IN";
      occurredAt: string;
      completion: CheckInCompletionDialog;
    }
  | {
      key: string;
      kind: "QUEST";
      occurredAt: string;
      notificationId?: string;
      completion: QuestCompletionDialog;
    }
  | {
      key: string;
      kind: "BATTLE_PASS";
      occurredAt: string;
      notificationId?: string;
      completion: BattlePassLevelCompletionDialog;
    };

export type UnavailableLootboxMessage = string | null;

export type QuestBoardStyle = CSSProperties &
  Partial<
    Record<
      | "--quest-board-left"
      | "--quest-board-top"
      | "--quest-board-right"
      | "--quest-board-bottom",
      string
    >
  >;
