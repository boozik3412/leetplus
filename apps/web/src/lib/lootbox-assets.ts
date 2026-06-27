export type LootboxSkinRarity = "common" | "rare" | "epic" | "legendary";

export const LOOTBOX_SKIN_URLS: Record<LootboxSkinRarity, string> = {
  common: "/assets/lootboxes/lootbox-common.png",
  rare: "/assets/lootboxes/lootbox-rare.png",
  epic: "/assets/lootboxes/lootbox-epic.png",
  legendary: "/assets/lootboxes/lootbox-legendary.png",
};

export function normalizeLootboxSkinRarity(
  value: unknown,
): LootboxSkinRarity {
  return value === "rare" ||
    value === "epic" ||
    value === "legendary" ||
    value === "common"
    ? value
    : "common";
}

export function lootboxSkinForRarity(value: unknown): string {
  return LOOTBOX_SKIN_URLS[normalizeLootboxSkinRarity(value)];
}
