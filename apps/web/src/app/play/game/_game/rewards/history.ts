import type {
  GuestPortalGameSummary,
  GuestPortalRewardWalletHistoryItem,
  GuestPortalLootBoxRarity,
} from "@/lib/guest-portal";
import type {
  GameRewardHistoryItem,
  GameRewardWalletState,
  GameBonusHistoryItem,
  RewardHistorySource,
  RewardHistorySourceFilter,
  RewardHistoryRarityFilter,
} from "../types";
import { gameRewardWallet } from "./wallet";
import { normalizeLootboxRarity } from "../lootbox/rarity";
import {
  REWARD_HISTORY_SOURCE_LABELS,
  REWARD_HISTORY_RARITY_LABELS,
} from "../constants";

export function rewardHistoryAmountFromLabel(label: string) {
  const match = label
    .replace(/\u00a0/gu, " ")
    .match(/[+-]?\d[\d\s]*(?:[.,]\d+)?/u)?.[0];

  if (!match) {
    return 0;
  }

  const amount = Number(match.replace(/\s/gu, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : 0;
}

export function rewardHistoryTypeFromLabel(label: string) {
  const normalized = label.toLocaleUpperCase("ru-RU");

  if (normalized.includes("XP")) {
    return "XP";
  }

  if (normalized.includes("БОНУС")) {
    return "BONUS";
  }

  if (normalized.includes("МИНУТ") || normalized.includes("ЧАС")) {
    return "PLAY_TIME";
  }

  return "REWARD";
}

export function normalizeRecentRewardHistoryItem(
  item: GuestPortalGameSummary["rewards"]["recent"][number],
): GameRewardHistoryItem {
  return {
    ...item,
    sourceKind: item.sourceKind,
    storeId: item.storeId ?? null,
    storeName: item.storeName?.trim() || null,
    claimedAt: item.claimedAt ?? null,
  };
}

export function normalizeWalletRewardHistoryItem(
  item: GuestPortalRewardWalletHistoryItem,
): GameRewardHistoryItem {
  return {
    id: item.id,
    status: item.status,
    walletState: walletHistoryWalletState(item.status),
    rewardType: rewardHistoryTypeFromLabel(item.rewardLabel),
    rewardAmount: rewardHistoryAmountFromLabel(item.rewardLabel),
    rewardLabel: item.rewardLabel,
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    sourceLabel: item.title,
    storeId: item.storeId,
    storeName: item.storeName?.trim() || null,
    rewardCode: null,
    claimPayload: null,
    qualifiedAt: item.availableAt,
    claimedAt: item.claimedAt ?? null,
    expiresAt: item.expiresAt,
  };
}

export function walletHistoryWalletState(
  status: GuestPortalRewardWalletHistoryItem["status"],
): GameRewardWalletState {
  if (status === "CLAIMED") {
    return "REDEEMED";
  }

  if (status === "PENDING" || status === "FAILED") {
    return "WAITING_CLAIM";
  }

  if (status === "PROCESSING" || status === "OPENING") {
    return "DELIVERY_PROCESSING";
  }

  return "DELIVERY_PROCESSING";
}

export function bonusHistoryWalletState(
  status: GameBonusHistoryItem["status"],
): GameRewardWalletState {
  if (status === "CONFIRMED") {
    return "REDEEMED";
  }

  if (status === "PENDING" || status === "PROCESSING" || status === "UNKNOWN") {
    return "DELIVERY_PROCESSING";
  }

  return "CANCELED";
}

export function normalizeBonusRewardHistoryItem(
  item: GameBonusHistoryItem,
): GameRewardHistoryItem {
  return {
    // A payout shares the reward's id, so the history shows the reward once
    // (with its rarity) instead of a second "Обычное" row for the payout.
    id: item.rewardId ?? item.id,
    status: item.status,
    walletState: bonusHistoryWalletState(item.status),
    rewardType: "BONUS",
    rewardAmount: item.amount,
    rewardLabel: item.title,
    rewardRarity: null,
    rewardRarityLabel: null,
    rewardDropChance: null,
    sourceId: null,
    sourceKind: item.sourceKind,
    sourceLabel: item.sourceLabel,
    storeId: item.storeId ?? null,
    storeName: item.storeName?.trim() || null,
    rewardCode: null,
    claimPayload: null,
    qualifiedAt: item.occurredAt,
    claimedAt: item.confirmedAt,
    expiresAt: null,
  };
}

export function mergeRewardHistoryItems(
  current: GameRewardHistoryItem,
  next: GameRewardHistoryItem,
) {
  const settledItem =
    next.walletState === "REDEEMED"
      ? next
      : current.walletState === "REDEEMED"
        ? current
        : null;

  return {
    ...current,
    ...next,
    status: settledItem?.status ?? next.status,
    walletState: settledItem?.walletState ?? next.walletState,
    rewardType:
      next.rewardType === "REWARD" ? current.rewardType : next.rewardType,
    rewardAmount:
      next.rewardAmount === 0 ? current.rewardAmount : next.rewardAmount,
    rewardRarity: next.rewardRarity ?? current.rewardRarity,
    rewardRarityLabel: next.rewardRarityLabel ?? current.rewardRarityLabel,
    rewardDropChance: next.rewardDropChance ?? current.rewardDropChance,
    sourceId: next.sourceId ?? current.sourceId,
    sourceLabel: next.sourceLabel ?? current.sourceLabel,
    storeId: next.storeId ?? current.storeId,
    storeName: next.storeName ?? current.storeName,
    rewardCode: next.rewardCode ?? current.rewardCode,
    claimPayload: next.claimPayload ?? current.claimPayload,
    claimedAt: settledItem?.claimedAt ?? next.claimedAt ?? current.claimedAt,
    expiresAt: next.expiresAt ?? current.expiresAt,
  } satisfies GameRewardHistoryItem;
}

export function buildCanonicalRewardHistory(summary: GuestPortalGameSummary) {
  const byStableId = new Map<string, GameRewardHistoryItem>();

  function upsert(item: GameRewardHistoryItem) {
    const current = byStableId.get(item.id);
    byStableId.set(
      item.id,
      current ? mergeRewardHistoryItems(current, item) : item,
    );
  }

  for (const item of summary.rewards.bonusHistory.items) {
    upsert(normalizeBonusRewardHistoryItem(item));
  }

  for (const item of summary.rewards.recent) {
    upsert(normalizeRecentRewardHistoryItem(item));
  }

  for (const item of gameRewardWallet(summary).history ?? []) {
    upsert(normalizeWalletRewardHistoryItem(item));
  }

  return [...byStableId.values()].sort(
    (left, right) =>
      Date.parse(right.claimedAt ?? right.qualifiedAt) -
      Date.parse(left.claimedAt ?? left.qualifiedAt),
  );
}

export function rewardHistoryClubKey(
  item: Pick<GameRewardHistoryItem, "storeId" | "storeName">,
) {
  if (item.storeId) {
    return `store:${item.storeId}`;
  }

  const storeName = item.storeName?.trim();
  if (storeName) {
    return `store-name:${storeName.toLocaleLowerCase("ru-RU")}`;
  }

  return "network";
}

export function rewardHistoryClubLabel(
  item: Pick<GameRewardHistoryItem, "storeId" | "storeName">,
) {
  const storeName = item.storeName?.trim();

  if (storeName) {
    return storeName;
  }

  return item.storeId ? "Клуб без названия" : "Вся сеть";
}

export function buildRewardHistoryClubOptions(items: GameRewardHistoryItem[]) {
  const byId = new Map<string, { id: string; label: string; scope: string }>();

  for (const item of items) {
    const id = rewardHistoryClubKey(item);
    const label = rewardHistoryClubLabel(item);

    if (!byId.has(id)) {
      byId.set(id, { id, label, scope: label });
    }
  }

  return [
    {
      id: "all",
      label: "Все клубы",
      scope: "Итого по всем клубам",
    },
    ...[...byId.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "ru-RU"),
    ),
  ];
}

export function rewardHistorySource(item: GameRewardHistoryItem): RewardHistorySource {
  if (item.sourceKind === "CHECK_IN") {
    return "checkin";
  }

  if (item.sourceKind === "LOOT_BOX") {
    return "lootbox";
  }

  if (item.sourceKind === "BATTLE_PASS") {
    return "battlepass";
  }

  if (item.sourceKind === "MISSION") {
    return "quest";
  }

  return "promo";
}

export function rewardHistoryRarity(
  item: Pick<GameRewardHistoryItem, "rewardRarity">,
): GuestPortalLootBoxRarity {
  return normalizeLootboxRarity(item.rewardRarity) ?? "common";
}

export function rewardHistoryOccurredAt(item: GameRewardHistoryItem) {
  return item.claimedAt ?? item.qualifiedAt;
}

export function buildRewardHistoryTotals(items: GameRewardHistoryItem[]) {
  const source = {
    checkin: 0,
    lootbox: 0,
    battlepass: 0,
    quest: 0,
    promo: 0,
  } satisfies Record<RewardHistorySource, number>;
  const rarity = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  } satisfies Record<GuestPortalLootBoxRarity, number>;

  for (const item of items) {
    source[rewardHistorySource(item)] += 1;
    rarity[rewardHistoryRarity(item)] += 1;
  }

  return {
    total: items.length,
    source,
    rarity,
  };
}

export function filterRewardHistory(
  items: GameRewardHistoryItem[],
  filters: {
    sourceFilter: RewardHistorySourceFilter;
    rarityFilter: RewardHistoryRarityFilter;
    query: string;
  },
) {
  const query = filters.query.trim().toLocaleLowerCase("ru-RU");

  return items.filter((item) => {
    const source = rewardHistorySource(item);
    const rarity = rewardHistoryRarity(item);
    const sourceMatches =
      filters.sourceFilter === "all" || filters.sourceFilter === source;
    const rarityMatches =
      filters.rarityFilter === "all" || filters.rarityFilter === rarity;
    const queryMatches =
      !query ||
      [
        item.rewardLabel,
        item.sourceLabel,
        item.rewardType,
        REWARD_HISTORY_SOURCE_LABELS[source],
        REWARD_HISTORY_RARITY_LABELS[rarity],
        item.storeName,
        rewardHistoryClubLabel(item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(query);

    return sourceMatches && rarityMatches && queryMatches;
  });
}

export function groupRewardHistory(items: GameRewardHistoryItem[]) {
  const groups = new Map<string, GameRewardHistoryItem[]>();
  for (const item of items) {
    const key = formatRewardHistoryDay(rewardHistoryOccurredAt(item));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([key, groupItems]) => ({
      key,
      title: key,
      items: groupItems,
    }))
    .sort(
      (left, right) =>
        Date.parse(
          right.items[0] ? rewardHistoryOccurredAt(right.items[0]) : "",
        ) -
        Date.parse(left.items[0] ? rewardHistoryOccurredAt(left.items[0]) : ""),
    );
}

export function formatRewardHistoryDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  if (isSameLocalDate(date, today)) {
    return "Сегодня";
  }

  if (isSameLocalDate(date, yesterday)) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatRewardHistoryTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
