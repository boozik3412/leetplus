import type {
  GuestPortalLootBoxRarity,
  GuestPortalRewardWallet,
} from "@/lib/guest-portal";
import type {
  HomeLootCard,
  RewardHistorySource,
  LootboxRouletteReward,
} from "./types";

export const LOOTBOX_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычная",
  rare: "Редкая",
  epic: "Эпическая",
  legendary: "Легендарная",
};

export const LOOTBOX_CASE_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export const LEVEL_XP_STEP = 500;

export const REWARD_WALLET_PULSE_STORAGE_VERSION = 1;

export const EMPTY_REWARD_WALLET: GuestPortalRewardWallet = {
  pendingCount: 0,
  nextExpiresAt: null,
  retentionDays: 30,
  items: [],
  history: [],
};

export const EMPTY_LOOTBOX_SCHEDULE: HomeLootCard["schedule"] = {
  timeWindowMode: "ANY",
  weekdayMode: "ANY",
  weekdays: [],
  hours: [],
};

export const REWARD_HISTORY_SOURCE_ORDER: RewardHistorySource[] = [
  "checkin",
  "lootbox",
  "battlepass",
  "quest",
  "promo",
];

export const REWARD_HISTORY_SOURCE_LABELS: Record<RewardHistorySource, string> = {
  checkin: "Чекины",
  lootbox: "Лутбоксы",
  battlepass: "Боевой пропуск",
  quest: "Квесты",
  promo: "Другие награды",
};

export const REWARD_HISTORY_SOURCE_ROW_LABELS: Record<RewardHistorySource, string> = {
  checkin: "Чекин",
  lootbox: "Лутбокс",
  battlepass: "Боевой пропуск",
  quest: "Квест",
  promo: "Награда",
};

export const REWARD_HISTORY_RARITY_ORDER: GuestPortalLootBoxRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
];

export const REWARD_HISTORY_RARITY_LABELS: Record<GuestPortalLootBoxRarity, string> = {
  common: "Обычные",
  rare: "Редкие",
  epic: "Эпические",
  legendary: "Легендарные",
};

export const REWARD_HISTORY_RARITY_ROW_LABELS: Record<
  GuestPortalLootBoxRarity,
  string
> = {
  common: "Обычное",
  rare: "Редкое",
  epic: "Эпическое",
  legendary: "Легендарное",
};

export const REWARD_HISTORY_SOURCE_TONES: Record<RewardHistorySource, string> = {
  checkin: "129 230 176",
  lootbox: "131 228 236",
  battlepass: "208 170 108",
  quest: "148 214 184",
  promo: "158 181 183",
};

export const REWARD_HISTORY_PAGE_SIZE = 20;

export const LOOTBOX_ROULETTE_MS: Record<GuestPortalLootBoxRarity, number> = {
  common: 5200,
  rare: 5400,
  epic: 5600,
  legendary: 5800,
};

export const LOOTBOX_CHARGE_MIN_MS = 760;

export const LOOTBOX_CASE_OPEN_MS = 1320;

export const LOOTBOX_ROULETTE_FALLBACK_REWARDS: ReadonlyArray<
  Omit<LootboxRouletteReward, "id">
> = [
  {
    reward: "50 бонусов",
    caption: "basic reward",
    rarity: "common",
    rarityLabel: LOOTBOX_RARITY_LABELS.common,
    dropChance: 85,
    rewardType: "BONUS_BALANCE",
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: null,
    borderColor: null,
    textColor: null,
    backgroundColor: null,
  },
  {
    reward: "100 бонусов",
    caption: "club reward",
    rarity: "rare",
    rarityLabel: LOOTBOX_RARITY_LABELS.rare,
    dropChance: 8,
    rewardType: "BONUS_BALANCE",
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: null,
    borderColor: null,
    textColor: null,
    backgroundColor: null,
  },
  {
    reward: "200 бонусов",
    caption: "epic reward",
    rarity: "epic",
    rarityLabel: LOOTBOX_RARITY_LABELS.epic,
    dropChance: 4,
    rewardType: "BONUS_BALANCE",
    visualMode: "AUTO",
    iconKey: "coins",
    imageUrl: null,
    borderColor: null,
    textColor: null,
    backgroundColor: null,
  },
  {
    reward: "Промокод",
    caption: "legend reward",
    rarity: "legendary",
    rarityLabel: LOOTBOX_RARITY_LABELS.legendary,
    dropChance: 1,
    rewardType: "PROMOCODE",
    visualMode: "AUTO",
    iconKey: "ticket",
    imageUrl: null,
    borderColor: null,
    textColor: null,
    backgroundColor: null,
  },
];

export const GUEST_GAME_AUTH_REQUIRED_MESSAGE =
  "Сессия входа не найдена или истекла. Подтвердите телефон заново.";

export const QUEST_BOARD_PAGE_SIZE = 10;
