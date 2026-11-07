import type {
  GuestPortalRewardWalletItem,
  GuestPortalGameSummary,
} from "@/lib/guest-portal";
import type { HomeLootCard, GuestPortalLootBoxOpenResponse } from "../types";
import {
  EMPTY_LOOTBOX_SCHEDULE,
  LOOTBOX_CASE_RARITY_LABELS,
  LOOTBOX_RARITY_LABELS,
} from "../constants";
import { normalizeLootboxRarity, inferBattlePassRewardRarity } from "./rarity";

export function rewardWalletLootboxCard(
  item: GuestPortalRewardWalletItem,
  summary: GuestPortalGameSummary,
): HomeLootCard {
  const lootBoxId =
    item.lootBoxId ?? (item.sourceKind === "LOOT_BOX" ? item.sourceId : null);
  const lootBox = lootBoxId
    ? (summary.lootBoxes.featured.find(
        (candidate) => candidate.id === lootBoxId,
      ) ?? null)
    : null;
  const caseRarity =
    normalizeLootboxRarity(lootBox?.caseRarity) ??
    inferBattlePassRewardRarity(`${item.title} ${item.rewardLabel}`);

  return {
    id: lootBoxId ?? `wallet-${item.id}`,
    title: lootBox?.name ?? item.title,
    description:
      lootBox?.latestReward?.rewardLabel ??
      lootBox?.rewardLabel ??
      item.rewardLabel,
    triggerKind: lootBox?.triggerKind ?? item.sourceKind,
    sessionType: lootBox?.sessionType ?? null,
    schedule: lootBox?.schedule ?? EMPTY_LOOTBOX_SCHEDULE,
    status: "можно открыть",
    active: false,
    openable: true,
    openState: "OPENABLE",
    openBlocker: null,
    rewardLabel: lootBox?.rewardLabel ?? item.rewardLabel,
    possibleRewards: lootBox?.possibleRewards ?? [],
    caseRarity,
    caseRarityLabel:
      lootBox?.caseRarityLabel ?? LOOTBOX_CASE_RARITY_LABELS[caseRarity],
    rewardRarity: lootBox?.latestReward?.rewardRarity ?? null,
    rewardRarityLabel: lootBox?.latestReward?.rewardRarityLabel ?? null,
    rewardDropChance: lootBox?.latestReward?.rewardDropChance ?? null,
    weeklyOpenedCount: lootBox?.weeklyOpenedCount ?? 0,
    weeklyLimit: lootBox?.weeklyLimit ?? null,
    dailyOpenedCount: lootBox?.dailyOpenedCount ?? 0,
    dailyLimit: lootBox?.dailyLimit ?? null,
    periodicLimitPeriod: lootBox?.periodicLimitPeriod ?? null,
    periodicOpenedCount: lootBox?.periodicOpenedCount ?? 0,
    walletItemId: item.id,
    walletReady: true,
    walletStatus: item.status,
  };
}

export function openedLootboxCard(
  currentCard: HomeLootCard,
  result: GuestPortalLootBoxOpenResponse,
): HomeLootCard {
  const updatedLootBox = result.summary.lootBoxes.featured.find(
    (item) => item.id === currentCard.id,
  );
  const openedReward = result.rewards[0] ?? null;
  const rewardLabel =
    openedReward?.rewardLabel ??
    updatedLootBox?.latestReward?.rewardLabel ??
    updatedLootBox?.rewardLabel ??
    currentCard.rewardLabel ??
    currentCard.description;
  const rewardRarity =
    normalizeLootboxRarity(openedReward?.rewardRarity) ??
    normalizeLootboxRarity(updatedLootBox?.latestReward?.rewardRarity) ??
    normalizeLootboxRarity(currentCard.rewardRarity) ??
    null;
  const rewardRarityLabel =
    openedReward?.rewardRarityLabel ??
    updatedLootBox?.latestReward?.rewardRarityLabel ??
    currentCard.rewardRarityLabel ??
    (rewardRarity ? LOOTBOX_RARITY_LABELS[rewardRarity] : null);
  const rewardDropChance =
    openedReward?.rewardDropChance ??
    updatedLootBox?.latestReward?.rewardDropChance ??
    currentCard.rewardDropChance ??
    null;

  return {
    ...currentCard,
    description: rewardLabel,
    rewardLabel,
    rewardRarity,
    rewardRarityLabel,
    rewardDropChance,
    walletReady: false,
    walletStatus: "PROCESSING",
  };
}
