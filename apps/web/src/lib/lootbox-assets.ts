export type LootboxSkinRarity = "common" | "rare" | "epic" | "legendary";

export const LOOTBOX_SKIN_URLS: Record<LootboxSkinRarity, string> = {
  common: "/assets/lootboxes/lootbox-common.png?v=2",
  rare: "/assets/lootboxes/lootbox-rare.png?v=2",
  epic: "/assets/lootboxes/lootbox-epic.png?v=2",
  legendary: "/assets/lootboxes/lootbox-legendary.png?v=2",
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
