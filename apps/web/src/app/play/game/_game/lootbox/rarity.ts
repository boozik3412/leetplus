import type { GuestPortalLootBoxRarity } from "@/lib/guest-portal";
import { LOOTBOX_RARITY_LABELS } from "../constants";
import { emitLootboxEvent } from "./roulette";

export function inferBattlePassRewardRarity(value: string): GuestPortalLootBoxRarity {
  const normalized = value.toLocaleLowerCase("ru-RU");

  if (/legendary|легендар/.test(normalized)) {
    return "legendary";
  }

  if (/epic|эпич/.test(normalized)) {
    return "epic";
  }

  if (/rare|редк/.test(normalized)) {
    return "rare";
  }

  return "common";
}

export function normalizeLootboxRarity(
  value: string | null | undefined,
): GuestPortalLootBoxRarity | null {
  return value === "common" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary"
    ? value
    : null;
}

export function lootboxRewardRarityLabel(value: {
  rewardRarity?: string | null;
  rewardRarityLabel?: string | null;
}) {
  const rarity = normalizeLootboxRarity(value.rewardRarity);

  return (
    value.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null)
  );
}

export function revealLootboxRarity({
  lootBoxId,
  rewardLabel,
  rewardRarity,
  rewardRarityLabel,
  rewardDropChance,
  caption,
  winningIndex,
  skipped,
}: {
  lootBoxId: string;
  rewardLabel: string;
  rewardRarity: GuestPortalLootBoxRarity | null;
  rewardRarityLabel: string | null;
  rewardDropChance: number | null;
  caption?: string;
  winningIndex?: number;
  skipped?: boolean;
}) {
  emitLootboxEvent("rarity-reveal", {
    lootBoxId,
    reward: rewardLabel,
    rewardLabel,
    caption,
    rarity: rewardRarity,
    rarityLabel: rewardRarityLabel,
    chancePercent: rewardDropChance,
    winningIndex,
    skipped,
  });
}
