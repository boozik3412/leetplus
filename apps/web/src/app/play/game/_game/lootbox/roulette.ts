import type {
  GuestPortalLootBoxRarity,
  GuestPortalGameSummary,
} from "@/lib/guest-portal";
import {
  LOOTBOX_ROULETTE_MS,
  LOOTBOX_ROULETTE_FALLBACK_REWARDS,
  LOOTBOX_CASE_RARITY_LABELS,
  LOOTBOX_RARITY_LABELS,
} from "../constants";
import type {
  HomeLootCard,
  GuestPortalLootBoxOpenResponse,
  LootboxRouletteState,
  LootboxRouletteReward,
  LootboxOpenReward,
  GameRewardHistoryItem,
} from "../types";
import { formatChancePercent } from "../format";
import { normalizeLootboxRarity } from "./rarity";

export function preloadLootboxPrizeImages(
  rewards: Array<{ imageUrl?: string | null }>,
) {
  const urls = Array.from(
    new Set(
      rewards
        .map((reward) => reward.imageUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  );

  if (!urls.length || typeof window === "undefined") {
    return Promise.resolve();
  }

  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new window.Image();
          const timeout = window.setTimeout(resolve, 1200);
          const finish = () => {
            window.clearTimeout(timeout);
            resolve();
          };

          image.onload = finish;
          image.onerror = finish;
          image.src = url;

          if (image.complete) {
            finish();
          }
        }),
    ),
  ).then(() => undefined);
}

export function emitLootboxEvent(name: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(
    new CustomEvent(`leetplus:lootbox:${name}`, {
      detail,
    }),
  );
}

export function lootboxRouletteMs(rarity: GuestPortalLootBoxRarity | null) {
  return rarity ? LOOTBOX_ROULETTE_MS[rarity] : LOOTBOX_ROULETTE_MS.common;
}

export function buildLootboxRouletteState({
  currentCard,
  nextCard,
  previousSummary,
  result,
  runId,
}: {
  currentCard: HomeLootCard;
  nextCard: HomeLootCard;
  previousSummary: GuestPortalGameSummary;
  result: GuestPortalLootBoxOpenResponse;
  runId: number;
}): LootboxRouletteState {
  const openedReward = result.rewards[0] ?? null;
  const winningReward = lootboxRouletteRewardFromOpenReward(
    openedReward,
    nextCard,
    `winner-${runId}`,
  );
  const fallbackRewards = LOOTBOX_ROULETTE_FALLBACK_REWARDS.map(
    (item, index) => ({
      ...item,
      id: `fallback-${index}`,
    }),
  );
  const resultRewards = result.rewards.map((item, index) =>
    lootboxRouletteRewardFromOpenReward(item, nextCard, `result-${index}`),
  );
  const recentRewards = [
    ...result.summary.rewards.recent,
    ...previousSummary.rewards.recent,
  ]
    .filter((item) => item.sourceKind === "LOOT_BOX")
    .slice(0, 14)
    .map((item, index) =>
      lootboxRouletteRewardFromHistory(item, `recent-${index}`),
    );
  const configuredRewards = currentCard.possibleRewards.map(
    (item, index): LootboxRouletteReward => ({
      id: `configured-${index}`,
      reward: item.rewardLabel,
      caption: `${item.rarityLabel} / ${formatChancePercent(item.chancePercent)}`,
      rarity: item.rarity,
      rarityLabel: item.rarityLabel,
      dropChance: item.chancePercent,
      rewardType: item.rewardType,
      visualMode: item.visualMode,
      iconKey: item.iconKey,
      imageUrl: item.imageUrl,
      borderColor: item.borderColor,
      textColor: item.textColor,
      backgroundColor: item.backgroundColor,
    }),
  );
  const lootBoxRewards = result.summary.lootBoxes.featured.map((item, index) =>
    lootboxRouletteRewardFromCard(
      {
        id: item.id,
        title: item.name,
        description:
          item.latestReward?.rewardLabel ??
          item.rewardLabel ??
          currentCard.description,
        triggerKind: item.triggerKind ?? currentCard.triggerKind,
        sessionType: item.sessionType ?? currentCard.sessionType,
        schedule: item.schedule ?? currentCard.schedule,
        status: "",
        active: false,
        openable: item.openable,
        openState: item.openState,
        openBlocker: item.openBlocker,
        rewardLabel: item.rewardLabel,
        possibleRewards: item.possibleRewards,
        caseRarity: normalizeLootboxRarity(item.caseRarity) ?? "common",
        caseRarityLabel:
          item.caseRarityLabel ?? LOOTBOX_CASE_RARITY_LABELS[item.caseRarity],
        rewardRarity: item.latestReward?.rewardRarity ?? null,
        rewardRarityLabel: item.latestReward?.rewardRarityLabel ?? null,
        rewardDropChance: item.latestReward?.rewardDropChance ?? null,
        weeklyOpenedCount: item.weeklyOpenedCount,
        weeklyLimit: item.weeklyLimit,
        dailyOpenedCount: item.dailyOpenedCount,
        dailyLimit: item.dailyLimit,
        periodicLimitPeriod: item.periodicLimitPeriod,
        periodicOpenedCount: item.periodicOpenedCount,
        walletItemId: null,
        walletReady: false,
        walletStatus: null,
      },
      `lootbox-${index}`,
    ),
  );
  const candidates = dedupeLootboxRouletteRewards([
    ...resultRewards,
    ...configuredRewards,
    ...recentRewards,
    ...lootBoxRewards,
    ...fallbackRewards,
  ]);
  const pool = candidates.filter(
    (item) => !sameLootboxRouletteReward(item, winningReward),
  );
  const fallbackPool = fallbackRewards.filter(
    (item) => !sameLootboxRouletteReward(item, winningReward),
  );
  const spinPool = pool.length
    ? pool
    : fallbackPool.length
      ? fallbackPool
      : fallbackRewards;
  const items: LootboxRouletteReward[] = [];
  const cycleCount = Math.max(7, Math.ceil(44 / Math.max(1, spinPool.length)));

  for (let cycle = 0; cycle < cycleCount; cycle += 1) {
    spinPool.forEach((_, itemIndex) => {
      const shiftedIndex = (itemIndex + cycle * 2) % spinPool.length;
      const reward = spinPool[shiftedIndex];

      items.push({
        ...reward,
        id: `${reward.id}-${cycle}-${itemIndex}`,
        isWinner: false,
      });
    });
  }

  const winningIndex = Math.min(items.length, Math.max(30, items.length - 12));

  items.splice(winningIndex, 0, {
    ...winningReward,
    isWinner: true,
  });
  items.push(
    ...spinPool.slice(0, 7).map((item, index) => ({
      ...item,
      id: `${item.id}-tail-${index}`,
      isWinner: false,
    })),
  );

  return {
    runId,
    lootBoxId: currentCard.id,
    items,
    winningIndex,
    durationMs: lootboxRouletteMs(winningReward.rarity),
    reward: winningReward.reward,
    caption: winningReward.caption,
    rarity: winningReward.rarity,
    rarityLabel: winningReward.rarityLabel,
    dropChance: winningReward.dropChance,
    message: result.message,
    skipped: false,
  };
}

export function lootboxRouletteRewardFromOpenReward(
  reward: LootboxOpenReward | null,
  card: HomeLootCard,
  id: string,
): LootboxRouletteReward {
  const rarity =
    normalizeLootboxRarity(reward?.rewardRarity) ??
    normalizeLootboxRarity(card.rewardRarity);
  const rarityLabel =
    reward?.rewardRarityLabel ??
    card.rewardRarityLabel ??
    (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);
  const dropChance = reward?.rewardDropChance ?? card.rewardDropChance ?? null;
  const rewardLabel =
    reward?.rewardLabel ?? card.rewardLabel ?? card.description;
  const configuredVisual = lootboxConfiguredPrizeVisual(card, rewardLabel);

  return {
    id,
    reward: rewardLabel,
    caption: lootboxRouletteCaption(rarityLabel, dropChance, card.title),
    rarity,
    rarityLabel,
    dropChance,
    rewardType: reward?.rewardType ?? configuredVisual?.rewardType ?? null,
    visualMode: reward?.visualMode ?? configuredVisual?.visualMode ?? "AUTO",
    iconKey: reward?.iconKey ?? configuredVisual?.iconKey ?? "gift",
    imageUrl: reward?.imageUrl ?? configuredVisual?.imageUrl ?? null,
    borderColor: reward?.borderColor ?? configuredVisual?.borderColor ?? null,
    textColor: reward?.textColor ?? configuredVisual?.textColor ?? null,
    backgroundColor:
      reward?.backgroundColor ?? configuredVisual?.backgroundColor ?? null,
  };
}

export function lootboxRouletteRewardFromHistory(
  item: GameRewardHistoryItem,
  id: string,
): LootboxRouletteReward {
  const rarity = normalizeLootboxRarity(item.rewardRarity);
  const rarityLabel =
    item.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);

  return {
    id,
    reward: item.rewardLabel,
    caption: lootboxRouletteCaption(
      rarityLabel,
      item.rewardDropChance,
      item.sourceLabel ?? "club reward",
    ),
    rarity,
    rarityLabel,
    dropChance: item.rewardDropChance,
    rewardType: item.rewardType,
    visualMode: item.visualMode ?? "AUTO",
    iconKey: item.iconKey ?? "gift",
    imageUrl: item.imageUrl ?? null,
    borderColor: item.borderColor ?? null,
    textColor: item.textColor ?? null,
    backgroundColor: item.backgroundColor ?? null,
  };
}

export function lootboxRouletteRewardFromCard(
  card: HomeLootCard,
  id: string,
): LootboxRouletteReward {
  const rarity = normalizeLootboxRarity(card.rewardRarity);
  const rarityLabel =
    card.rewardRarityLabel ?? (rarity ? LOOTBOX_RARITY_LABELS[rarity] : null);
  const configuredVisual = lootboxConfiguredPrizeVisual(
    card,
    card.rewardLabel ?? card.description,
  );

  return {
    id,
    reward: card.rewardLabel ?? card.description,
    caption: lootboxRouletteCaption(
      rarityLabel,
      card.rewardDropChance ?? null,
      card.title,
    ),
    rarity,
    rarityLabel,
    dropChance: card.rewardDropChance ?? null,
    rewardType: configuredVisual?.rewardType ?? null,
    visualMode: configuredVisual?.visualMode ?? "AUTO",
    iconKey: configuredVisual?.iconKey ?? "gift",
    imageUrl: configuredVisual?.imageUrl ?? null,
    borderColor: configuredVisual?.borderColor ?? null,
    textColor: configuredVisual?.textColor ?? null,
    backgroundColor: configuredVisual?.backgroundColor ?? null,
  };
}

export function lootboxConfiguredPrizeVisual(card: HomeLootCard, rewardLabel: string) {
  return (
    card.possibleRewards.find((item) => item.rewardLabel === rewardLabel) ??
    card.possibleRewards[0] ??
    null
  );
}

export function lootboxRouletteCaption(
  rarityLabel: string | null,
  dropChance: number | null,
  fallback: string,
) {
  const label = rarityLabel ?? fallback;

  if (typeof dropChance === "number" && Number.isFinite(dropChance)) {
    return `${label} / ${formatChancePercent(dropChance)}`;
  }

  return label;
}

export function dedupeLootboxRouletteRewards(items: LootboxRouletteReward[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.reward}::${item.rarity ?? "unknown"}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function sameLootboxRouletteReward(
  first: LootboxRouletteReward,
  second: LootboxRouletteReward,
) {
  return first.reward === second.reward && first.rarity === second.rarity;
}

export function lootboxRouletteEventDetail(
  roulette: LootboxRouletteState,
  skipped: boolean,
) {
  return {
    lootBoxId: roulette.lootBoxId,
    rarity: roulette.rarity,
    reward: roulette.reward,
    caption: roulette.caption,
    rarityLabel: roulette.rarityLabel,
    chancePercent: roulette.dropChance,
    winningIndex: roulette.winningIndex,
    skipped,
  };
}
