import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import type {
  BattlePassRewardCard,
  GameMission,
  GameMissionHistoryItem,
  HomeBattleQuest,
  BattlePassDetailProgress,
  GameRewardHistoryItem,
  HomeBattlePassLevel,
  HomeBattlePassSeason,
  BattlePassRewardStatus,
  BattlePassEventName,
  BattlePassRewardType,
  BattlePassLevelCompletionDialog,
} from "../types";
import { formatNumber, clampPercent } from "../format";
import { playerQuestProgressLabel } from "../quest-progress";
import { inferBattlePassRewardRarity } from "../lootbox/rarity";
import { lootboxSkinForRarity } from "@/lib/lootbox-assets";

export function findBattlePassQuestMission(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
): GameMission | GameMissionHistoryItem | null {
  const quest = reward.quest;

  if (quest?.sourceKind !== "mission") {
    return null;
  }

  return (
    [...summary.missions.featured, ...summary.missions.history].find(
      (mission) => mission.id === quest.sourceId,
    ) ?? null
  );
}

export function battlePassDetailProgress(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
  condition: string,
  quest: HomeBattleQuest | null,
  mission: GameMission | GameMissionHistoryItem | null,
  activeStep: GameMission["questSteps"][number] | null,
): BattlePassDetailProgress {
  if (quest?.progress) {
    return quest.progress;
  }

  if (activeStep) {
    const total = Math.max(1, activeStep.target);
    const current = activeStep.completed
      ? total
      : Math.min(total, Math.max(0, activeStep.progressCurrent));

    return {
      current,
      total,
      label: `${formatNumber(current)} / ${formatNumber(total)}`,
      percent: clampPercent((current / total) * 100),
    };
  }

  if (mission) {
    const lastStep = mission.questSteps[mission.questSteps.length - 1] ?? null;
    const total = Math.max(1, mission.progressTarget ?? lastStep?.target ?? 1);
    const current = Math.min(total, Math.max(0, mission.progressCurrent));

    return {
      current,
      total,
      label: playerQuestProgressLabel(current, total, mission.progressUnit),
      percent: clampPercent(mission.progressPercent),
    };
  }

  const done = reward.status === "claimed" || reward.status === "ready";

  return {
    current: done ? 1 : 0,
    total: 1,
    label: done ? "Выполнено" : "Ожидает выполнения",
    percent: done ? 100 : 0,
  };
}

export function findBattlePassQuestReward(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
): GameRewardHistoryItem | null {
  const quest = reward.quest;

  if (!quest) {
    return findLatestRewardBySource(
      summary.rewards.recent,
      "BATTLE_PASS",
      reward.id,
    );
  }

  if (quest.sourceKind !== "mission") {
    return null;
  }

  const candidates = summary.rewards.recent
    .filter((item) => item.sourceKind === "MISSION")
    .sort(compareRewardsByQualifiedAtDesc);
  const titleKey = normalizeRewardLookupText(quest.title);

  return (
    candidates.find((item) => item.sourceId === quest.sourceId) ??
    candidates.find((item) => {
      const sourceKey = normalizeRewardLookupText(item.sourceLabel);

      return Boolean(sourceKey && titleKey && sourceKey.includes(titleKey));
    }) ??
    candidates.find((item) => {
      const sourceKey = normalizeRewardLookupText(item.sourceLabel);

      return Boolean(sourceKey && titleKey && titleKey.includes(sourceKey));
    }) ??
    null
  );
}

export function findLatestRewardBySource(
  rewards: GameRewardHistoryItem[],
  sourceKind: GameRewardHistoryItem["sourceKind"],
  sourceId: string,
) {
  return (
    rewards
      .filter(
        (item) => item.sourceKind === sourceKind && item.sourceId === sourceId,
      )
      .sort(compareRewardsByQualifiedAtDesc)[0] ?? null
  );
}

export function findBattlePassQuestLootBoxDrop(
  summary: GuestPortalGameSummary,
  reward: BattlePassRewardCard,
  actualReward: GameRewardHistoryItem | null,
  mission: GameMission | GameMissionHistoryItem | null,
): GameRewardHistoryItem | null {
  if (actualReward?.sourceKind === "LOOT_BOX") {
    return actualReward;
  }

  if (!battlePassRewardLooksLikeLootBox(reward, actualReward)) {
    return null;
  }

  const candidates = summary.rewards.recent
    .filter((item) => item.sourceKind === "LOOT_BOX")
    .sort(compareRewardsByQualifiedAtDesc);

  if (!candidates.length) {
    return null;
  }

  const lookupKeys = [
    reward.title,
    reward.rewardValue,
    reward.quest?.reward,
    actualReward?.rewardLabel,
    actualReward?.sourceLabel,
  ]
    .map(normalizeRewardLookupText)
    .filter(Boolean);
  const directMatch = candidates.find((item) => {
    const sourceKey = normalizeRewardLookupText(item.sourceLabel);

    if (!sourceKey) {
      return false;
    }

    return lookupKeys.some(
      (key) => key.includes(sourceKey) || sourceKey.includes(key),
    );
  });

  if (directMatch) {
    return directMatch;
  }

  const completedAt = Date.parse(
    actualReward?.qualifiedAt ?? mission?.rewardStatus.occurredAt ?? "",
  );

  if (!Number.isFinite(completedAt)) {
    return null;
  }

  return (
    candidates.find(
      (item) => Date.parse(item.qualifiedAt) >= completedAt - 60_000,
    ) ?? null
  );
}

export function compareRewardsByQualifiedAtDesc(
  left: GameRewardHistoryItem,
  right: GameRewardHistoryItem,
) {
  return Date.parse(right.qualifiedAt) - Date.parse(left.qualifiedAt);
}

export function battlePassRewardLooksLikeLootBox(
  reward: BattlePassRewardCard,
  actualReward: GameRewardHistoryItem | null,
) {
  return [
    reward.type,
    reward.title,
    reward.rewardValue,
    reward.quest?.reward,
    actualReward?.rewardLabel,
  ]
    .filter(Boolean)
    .some((value) =>
      /lootbox|case|кейс|лутбокс|контейнер/i.test(String(value)),
    );
}

export function normalizeRewardLookupText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

export function stripBattlePassDetailPrefix(value: string, prefix: string) {
  return value
    .replace(new RegExp(`^${prefix}:\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
}

export function battlePassTokenDensity(label: string) {
  const length = Array.from(label.trim()).length;

  if (length > 18) {
    return "long";
  }

  if (length > 9) {
    return "medium";
  }

  return "short";
}

export function buildBattlePassRewardCards(
  battlePass: GuestPortalGameSummary["battlePass"]["active"],
  quests: HomeBattleQuest[],
): BattlePassRewardCard[] {
  if (!battlePass?.levels.length) {
    return quests.map((quest, index) =>
      battlePassRewardFromQuest(quest, index, quests.length),
    );
  }

  return battlePass.levels.map((level) =>
    battlePassRewardFromLevel(level, battlePass),
  );
}

export function battlePassRewardFromLevel(
  level: HomeBattlePassLevel,
  battlePass: HomeBattlePassSeason,
): BattlePassRewardCard {
  const orderedLevels = [...battlePass.levels].sort(
    (left, right) => left.level - right.level,
  );
  const levelIndex = orderedLevels.findIndex(
    (item) => item.level === level.level,
  );
  const previousLevel = levelIndex > 0 ? orderedLevels[levelIndex - 1] : null;
  const rewardLabel =
    level.freeReward ??
    level.premiumReward ??
    level.title ??
    `Боевой пропуск, шаг ${formatNumber(level.level)}`;
  const title = level.title ?? rewardLabel;
  const rarity = inferBattlePassRewardRarity(rewardLabel);
  const type = inferBattlePassRewardType(rewardLabel);

  return {
    id: `${battlePass.id}:${level.level}`,
    level: level.level,
    title: battlePassRewardTitle(title, type),
    subtitle:
      level.condition ??
      level.description ??
      battlePassRewardSubtitle(level, type),
    condition: level.condition,
    executionCondition: level.executionCondition,
    description: level.description,
    plannedReward: rewardLabel,
    type,
    rarity,
    status: battlePassRewardStatus(level),
    image: type === "lootbox" ? lootboxSkinForRarity(rarity) : undefined,
    lootBoxPreview: battlePassLevelLootBoxPreview(level, rewardLabel),
    rewardValue: battlePassRewardValue(rewardLabel, type, level.level),
    xpThreshold: 0,
    previousXpThreshold: previousLevel ? 0 : 0,
  };
}

export function battlePassRewardFromQuest(
  quest: HomeBattleQuest,
  index: number,
  total: number,
): BattlePassRewardCard {
  const rawTitle = quest.reward.replace(/^Награда:\s*/i, "") || quest.title;
  const type = inferBattlePassRewardType(rawTitle);
  const rarity = inferBattlePassRewardRarity(rawTitle);
  const status =
    quest.state === "complete"
      ? "claimed"
      : quest.state === "current"
        ? "current"
        : "locked";

  return {
    id: `fallback:${quest.id}`,
    level: index + 1,
    title: battlePassRewardTitle(rawTitle, type),
    subtitle: index + 1 === total ? "Финальная награда" : quest.title,
    type,
    rarity,
    status,
    image: type === "lootbox" ? lootboxSkinForRarity(rarity) : undefined,
    rewardValue: battlePassRewardValue(rawTitle, type, index + 1),
    quest,
  };
}

export function battlePassRewardStatus(
  level: HomeBattlePassLevel,
): BattlePassRewardStatus {
  if (level.reached) {
    return "claimed";
  }

  if (level.current) {
    return "current";
  }

  return "locked";
}

export function battlePassLevelLootBoxPreview(
  level: HomeBattlePassLevel,
  rewardLabel?: string | null,
) {
  const normalizedRewardLabel = rewardLabel?.trim() ?? "";

  if (
    normalizedRewardLabel &&
    normalizedRewardLabel === level.premiumReward?.trim()
  ) {
    return level.premiumRewardLootBox;
  }

  if (
    normalizedRewardLabel &&
    normalizedRewardLabel === level.freeReward?.trim()
  ) {
    return level.freeRewardLootBox;
  }

  return level.freeRewardLootBox ?? level.premiumRewardLootBox ?? null;
}

export function battlePassRewardEventDetail(
  reward: BattlePassRewardCard,
  battlePass: GuestPortalGameSummary["battlePass"]["active"],
) {
  return {
    seasonId: battlePass?.id ?? null,
    seasonName: battlePass?.name ?? null,
    rewardId: reward.id,
    level: reward.level,
    title: reward.title,
    subtitle: reward.subtitle,
    type: reward.type,
    rarity: reward.rarity,
    status: reward.status,
    rewardValue: reward.rewardValue ?? null,
  };
}

export function emitBattlePassEvent(
  name: BattlePassEventName,
  detail: Record<string, unknown> = {},
) {
  window.dispatchEvent(
    new CustomEvent(`battlepass_${name}`, {
      detail,
    }),
  );
}

export function battlePassRewardTitle(value: string, type: BattlePassRewardType) {
  const cleanValue = value.trim();

  if (type === "lootbox" && !/контейнер|кейс|лутбокс/i.test(cleanValue)) {
    return "Сезонный контейнер";
  }

  return cleanValue || battlePassRewardTypeLabel(type);
}

export function battlePassRewardSubtitle(
  level: HomeBattlePassLevel,
  type: BattlePassRewardType,
) {
  const typeLabel = battlePassRewardTypeLabel(type);

  if (level.freeReward && level.premiumReward) {
    return `${typeLabel} · premium: ${level.premiumReward}`;
  }

  return level.condition ?? level.description ?? typeLabel;
}

export function battlePassRewardValue(
  value: string,
  type: BattlePassRewardType,
  fallback: number,
) {
  if (type === "xp") {
    const match = value.match(/\d[\d\s.,]*/);
    return match ? `${match[0].trim()} XP` : `${formatNumber(fallback)} XP`;
  }

  if (type === "coins") {
    const match = value.match(/\d[\d\s.,]*(?:\s?₽|\s?руб|\s?бонус)/i);
    return match ? match[0].trim() : value;
  }

  if (type === "discount") {
    const match = value.match(/\d[\d\s.,]*%/);
    return match ? match[0].trim() : "Промо";
  }

  if (type === "boost") {
    return "Boost";
  }

  if (type === "avatar") {
    return "Avatar";
  }

  if (type === "rank") {
    return "Rank";
  }

  return undefined;
}

export function inferBattlePassRewardType(value: string): BattlePassRewardType {
  const normalized = value.toLocaleLowerCase("ru-RU");

  if (/лутбокс|кейс|контейнер|lootbox|case/.test(normalized)) {
    return "lootbox";
  }

  if (/xp|хр|опыт/.test(normalized)) {
    return "xp";
  }

  if (/скид|discount|промокод|promo/.test(normalized)) {
    return "discount";
  }

  if (/аватар|avatar/.test(normalized)) {
    return "avatar";
  }

  if (/буст|boost|множител|ускор/.test(normalized)) {
    return "boost";
  }

  if (/ранг|rank|лига/.test(normalized)) {
    return "rank";
  }

  return "coins";
}

export function battlePassRewardStatusLabel(status: BattlePassRewardStatus) {
  if (status === "ready") {
    return "Забрать";
  }

  if (status === "current") {
    return "Сейчас";
  }

  if (status === "claimed") {
    return "Получено";
  }

  return "Закрыто";
}

export function battlePassRewardTypeLabel(type: BattlePassRewardType) {
  const labels = {
    xp: "XP",
    coins: "Бонусы",
    discount: "Промо",
    lootbox: "Кейс",
    avatar: "Аватар",
    boost: "Буст",
    rank: "Ранг",
  } satisfies Record<BattlePassRewardType, string>;

  return labels[type];
}

export function battlePassSeasonTimeLabel(value: string | null | undefined) {
  if (!value) {
    return " · сезон активен";
  }

  const diff = new Date(value).getTime() - Date.now();

  if (!Number.isFinite(diff)) {
    return " · сезон активен";
  }

  if (diff <= 0) {
    return " · сезон завершен";
  }

  const totalHours = Math.ceil(diff / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return ` · до конца ${formatNumber(days)} дн. ${formatNumber(hours)} ч`;
  }

  return ` · до конца ${formatNumber(totalHours)} ч`;
}

export function findNewBattlePassLevelCompletions(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): BattlePassLevelCompletionDialog[] {
  const previousSeason = previousSummary.battlePass.active;
  const nextSeason = nextSummary.battlePass.active;

  if (!previousSeason || !nextSeason || previousSeason.id !== nextSeason.id) {
    return [];
  }

  const previouslyReachedLevels = new Set(
    previousSeason.levels
      .filter((level) => level.reached)
      .map((level) => level.level),
  );
  const orderedLevels = [...nextSeason.levels].sort(
    (left, right) => left.level - right.level,
  );
  const completedLevels = orderedLevels.filter(
    (level) => level.reached && !previouslyReachedLevels.has(level.level),
  );

  return completedLevels.map((completedLevel) => {
    const nextLevel =
      orderedLevels.find((level) => level.level > completedLevel.level) ?? null;

    return {
      seasonId: nextSeason.id,
      seasonName: nextSeason.name,
      completedLevel: completedLevel.level,
      completedTitle: completedLevel.title?.trim() ?? "",
      rewardLabel:
        completedLevel.freeReward?.trim() ||
        completedLevel.premiumReward?.trim() ||
        completedLevel.title?.trim() ||
        "Награда уровня",
      nextLevel: nextLevel?.level ?? null,
      nextTitle: nextLevel
        ? nextLevel.title?.trim() || `Уровень ${nextLevel.level}`
        : null,
      nextCondition: nextLevel
        ? stripBattlePassDetailPrefix(
            nextLevel.condition?.trim() ||
              nextLevel.description?.trim() ||
              "продолжить участие в активностях клуба",
            "Условие",
          )
        : null,
      rewardLootBox: battlePassLevelLootBoxPreview(
        completedLevel,
        completedLevel.freeReward?.trim() ||
          completedLevel.premiumReward?.trim() ||
          null,
      ),
    };
  });
}
