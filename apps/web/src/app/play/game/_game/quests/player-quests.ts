import type { PlayerQuest, GameMission, QuestStatus } from "../types";
import {
  rewardWalletItemPriority,
  gameRewardWallet,
  rewardWalletItemActionLabel,
} from "../rewards/wallet";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import { playerQuestProgress, missionConditionHint } from "../quest-progress";
import { selectPreferredRewardWalletItem } from "../rewards/wallet-card";
import { formatNumber } from "../format";
import {
  normalizeGameRuleTrigger,
  normalizeGameRuleSessionType,
  withHourlySessionExtensionNotice,
  guestActionRequirementLabel,
  gameProgressUnitLabel,
} from "../game-rules";
import type {
  GuestMissionPreviewData,
} from "@/components/guest-mission-preview";

export function orderedPlayerQuests(quests: PlayerQuest[]) {
  return quests
    .map((quest, index) => ({ quest, index }))
    .sort((left, right) => {
      const leftPriority = left.quest.walletItem
        ? rewardWalletItemPriority(left.quest.walletItem)
        : 7;
      const rightPriority = right.quest.walletItem
        ? rewardWalletItemPriority(right.quest.walletItem)
        : 7;

      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ quest }) => quest);
}

export function buildPlayerQuests(
  summary: GuestPortalGameSummary,
  missions: GameMission[] = summary.missions.featured,
): PlayerQuest[] {
  const walletItems = gameRewardWallet(summary).items;

  return missions.map((mission) => {
    const status = playerQuestStatus(mission);
    const progress = playerQuestProgress(mission);
    const reward = playerQuestReward(mission);
    const walletItem = selectPreferredRewardWalletItem(
      walletItems,
      (item) => item.sourceKind === "MISSION" && item.sourceId === mission.id,
    );
    const preview = gameMissionPreviewData(mission);

    return {
      id: mission.id,
      title: mission.name,
      description: playerQuestDescription(mission, reward),
      condition: playerQuestCondition(mission, progress),
      status,
      progress,
      reward,
      walletItem,
      rewardLootBox: mission.rewardLootBox,
      preview: walletItem
        ? {
            ...preview,
            actionText: rewardWalletItemActionLabel(walletItem),
          }
        : preview,
    };
  });
}

export function buildQuestGroups(quests: PlayerQuest[]) {
  return [
    {
      id: "done" as const,
      title: "Выполнены",
      ariaLabel: "Выполненные квесты",
      items: quests.filter((quest) => quest.status === "done"),
    },
    {
      id: "live" as const,
      title: "В процессе",
      ariaLabel: "Квесты в процессе",
      items: quests.filter((quest) => quest.status === "live"),
    },
    {
      id: "next" as const,
      title: "Не начаты",
      ariaLabel: "Не начатые квесты",
      items: quests.filter((quest) => quest.status === "next"),
    },
  ];
}

export function playerQuestStatus(mission: GameMission): QuestStatus {
  const completedStates: Array<GameMission["rewardStatus"]["state"]> = [
    "COMPLETED",
    "WAITING_APPROVAL",
    "READY",
    "QUEUED",
    "SENDING",
    "CONFIRMED",
    "REDEEMED",
  ];

  if (
    mission.progressPercent >= 100 ||
    completedStates.includes(mission.rewardStatus.state)
  ) {
    return "done";
  }

  if (mission.progressCurrent > 0 || mission.progressPercent > 0) {
    return "live";
  }

  return "next";
}

export function playerQuestReward(mission: GameMission): PlayerQuest["reward"] {
  const rewardLabel = mission.rewardLabel?.trim() ?? "";
  const rewardLabelLower = rewardLabel.toLocaleLowerCase("ru-RU");

  if (
    mission.rewardLootBox ||
    /лутбокс|кейс|контейнер/.test(rewardLabelLower)
  ) {
    return { type: "lootbox", value: rewardLabel };
  }

  if (mission.xpReward > 0) {
    return { type: "xp", value: `${formatNumber(mission.xpReward)} XP` };
  }

  if (rewardLabel) {
    return { type: "promo", value: rewardLabel };
  }

  return undefined;
}

export function playerQuestDescription(
  mission: GameMission,
  reward: PlayerQuest["reward"],
) {
  if (mission.rewardStatus.state !== "IN_PROGRESS") {
    return mission.rewardStatus.hint;
  }

  const parts = [missionConditionHint(mission)];

  if (mission.rewardLabel) {
    parts.push(`Награда: ${mission.rewardLabel}.`);
  } else if (reward) {
    parts.push(`Награда: ${reward.value}.`);
  }

  return parts.join(" ");
}

export function playerQuestCondition(
  mission: GameMission,
  progress: PlayerQuest["progress"],
) {
  const isHourlyPlayTime =
    normalizeGameRuleTrigger(mission.triggerKind) === "PLAY_HOUR" &&
    normalizeGameRuleSessionType(mission.sessionType) === "regular_session";
  if (mission.conditionLabel) {
    return withHourlySessionExtensionNotice(
      mission.conditionLabel,
      isHourlyPlayTime ? mission.sessionType : null,
    );
  }

  if (normalizeGameRuleTrigger(mission.triggerKind) === "PLAY_HOUR") {
    const minutes = progress?.total ?? mission.progressTarget ?? 0;
    const sessionRequirement = isHourlyPlayTime
      ? "в отдельно начатой почасовой сессии"
      : "в игровой сессии";

    if (minutes === 60) {
      return withHourlySessionExtensionNotice(
        `Сыграйте один час ${sessionRequirement}.`,
        isHourlyPlayTime ? mission.sessionType : null,
      );
    }

    if (minutes > 0) {
      return withHourlySessionExtensionNotice(
        `Сыграйте ${formatNumber(minutes)} минут ${sessionRequirement}.`,
        isHourlyPlayTime ? mission.sessionType : null,
      );
    }
  }

  return guestActionRequirementLabel(mission.triggerKind, mission.sessionType);
}

export function gameMissionPreviewData(mission: GameMission): GuestMissionPreviewData {
  const progress = playerQuestProgress(mission);

  return {
    title: mission.name,
    description:
      mission.description ??
      "Выполните условие квеста и получите указанную награду.",
    condition: mission.conditionLabel || missionConditionHint(mission),
    reward:
      mission.rewardStatus.rewardLabel ??
      mission.rewardLabel ??
      (mission.xpReward > 0
        ? `${mission.xpReward} XP`
        : "Без основной награды"),
    xp: mission.xpReward,
    progressCurrent: progress?.current ?? 0,
    progressTarget: progress?.total ?? 1,
    progressUnit: gameProgressUnitLabel(mission.progressUnit) ?? "",
    actionText: mission.actionText ?? "Подробнее",
    icon: mission.icon,
    theme: mission.theme,
    coverUrl: mission.coverUrl,
    products: mission.productNames,
    productMode: mission.productMode ?? undefined,
    minimumAmount: mission.minimumAmount,
  };
}
