import type {
  GuestPortalGameSummary,
  GuestPortalRewardWalletItem,
} from "@/lib/guest-portal";
import type { HomeLootCard } from "../types";
import {
  gameRewardWallet,
  isRewardWalletItemActionable,
} from "../rewards/wallet";
import { normalizeLootboxRarity } from "./rarity";
import { LOOTBOX_CASE_RARITY_LABELS } from "../constants";
import { formatNumber } from "../format";

export function buildHomeLootCards(
  summary: GuestPortalGameSummary,
  selectedLootId: string | null,
): HomeLootCard[] {
  const walletLootBoxItems = new Map<string, GuestPortalRewardWalletItem>();

  for (const item of gameRewardWallet(summary).items) {
    if (item.kind !== "LOOT_BOX_ENTITLEMENT") {
      continue;
    }

    const lootBoxId =
      item.lootBoxId ?? (item.sourceKind === "LOOT_BOX" ? item.sourceId : null);

    if (!lootBoxId) {
      continue;
    }

    const currentItem = walletLootBoxItems.get(lootBoxId);
    if (
      !currentItem ||
      (!isRewardWalletItemActionable(currentItem) &&
        isRewardWalletItemActionable(item)) ||
      (currentItem.status === "FAILED" && item.status === "PENDING")
    ) {
      walletLootBoxItems.set(lootBoxId, item);
    }
  }

  const realCards = summary.lootBoxes.featured.slice(0, 3).map((lootBox) => {
    const walletItem = walletLootBoxItems.get(lootBox.id) ?? null;
    const walletReady = walletItem?.action === "OPEN_LOOT_BOX";
    const walletStatus = walletItem?.status ?? null;

    return {
      id: lootBox.id,
      title: lootBox.name,
      description:
        lootBox.latestReward?.rewardLabel ??
        lootBox.rewardLabel ??
        "Лутбокс с наградой за активность в клубе.",
      triggerKind: lootBox.triggerKind,
      sessionType: lootBox.sessionType,
      schedule: lootBox.schedule,
      status: lootboxCardStatus(lootBox, walletReady, walletStatus),
      active: false,
      openable: walletReady || lootBox.openable,
      openState: walletReady ? "OPENABLE" : lootBox.openState,
      openBlocker: walletReady ? null : lootBox.openBlocker,
      rewardLabel: lootBox.rewardLabel,
      possibleRewards: lootBox.possibleRewards,
      caseRarity: normalizeLootboxRarity(lootBox.caseRarity) ?? "common",
      caseRarityLabel:
        lootBox.caseRarityLabel ??
        LOOTBOX_CASE_RARITY_LABELS[lootBox.caseRarity],
      rewardRarity: lootBox.latestReward?.rewardRarity ?? null,
      rewardRarityLabel: lootBox.latestReward?.rewardRarityLabel ?? null,
      rewardDropChance: lootBox.latestReward?.rewardDropChance ?? null,
      weeklyOpenedCount: lootBox.weeklyOpenedCount,
      weeklyLimit: lootBox.weeklyLimit,
      dailyOpenedCount: lootBox.dailyOpenedCount,
      dailyLimit: lootBox.dailyLimit,
      periodicLimitPeriod: lootBox.periodicLimitPeriod,
      periodicOpenedCount: lootBox.periodicOpenedCount,
      walletItemId: walletItem?.id ?? null,
      walletReady,
      walletStatus,
    };
  });
  const activeId = selectedLootId ?? realCards[0]?.id ?? null;

  return realCards.map((card) => ({
    ...card,
    active: card.id === activeId,
  }));
}

export function lootboxCardStatus(
  lootBox: GuestPortalGameSummary["lootBoxes"]["featured"][number],
  walletReady: boolean,
  walletStatus: GuestPortalRewardWalletItem["status"] | null,
) {
  if (walletStatus === "OPENING") {
    return "открываем";
  }

  if (walletStatus === "PROCESSING") {
    return "начисляем";
  }

  if (walletStatus === "FAILED") {
    return walletReady ? "повторить" : "ошибка открытия";
  }

  if (walletReady) {
    return "можно открыть";
  }

  if (!lootBox.openable && lootBox.openState === "LIMIT_REACHED") {
    return "лимит";
  }

  if (!lootBox.openable) {
    return "ждет событие";
  }

  if (lootBox.readyRewards > 0) {
    return "доступен";
  }

  if (lootBox.openedCount > 0) {
    return `открыт ${formatNumber(lootBox.openedCount)}`;
  }

  return "доступен";
}
