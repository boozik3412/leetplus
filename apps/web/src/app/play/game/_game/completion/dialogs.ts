import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import type {
  CompletionDialogQueueItem,
  QuestCompletionDialog,
  GameMission,
  GameMissionHistoryItem,
} from "../types";
import {
  battlePassLevelLootBoxPreview,
  findNewBattlePassLevelCompletions,
} from "../battle-pass/rewards";
import { formatNumber } from "../format";

export function completionDialogsFromPendingNotifications(
  summary: GuestPortalGameSummary,
): CompletionDialogQueueItem[] {
  return sortCompletionDialogs(
    (
      summary.completionNotifications?.pending ?? []
    ).flatMap<CompletionDialogQueueItem>((notification) => {
      if (notification.kind === "MISSION") {
        const mission = [
          ...summary.missions.featured,
          ...summary.missions.history,
        ].find((item) => item.id === notification.sourceId);
        return [
          {
            key: `quest:${notification.sourceId}:${notification.occurredAt}`,
            kind: "QUEST" as const,
            occurredAt: notification.occurredAt,
            notificationId: notification.id,
            completion: {
              id: notification.sourceId,
              title: notification.title,
              rewardLabel: notification.rewardLabel,
              statusLabel: notification.statusLabel,
              receivedAt: notification.occurredAt,
              rewardLootBox: mission?.rewardLootBox ?? null,
            },
          },
        ];
      }

      const completedLevel = notification.completedLevel ?? 1;
      const rewardLootBox = summary.battlePass.active?.levels.find(
        (level) => level.level === completedLevel,
      );

      return [
        {
          key: `battle-pass:${notification.sourceId}:${completedLevel}`,
          kind: "BATTLE_PASS" as const,
          occurredAt: notification.occurredAt,
          notificationId: notification.id,
          completion: {
            seasonId: notification.seasonId ?? notification.sourceId,
            seasonName: notification.seasonName ?? notification.title,
            completedLevel,
            completedTitle: notification.completedTitle ?? "",
            rewardLabel: notification.rewardLabel,
            nextLevel: notification.nextLevel,
            nextTitle: notification.nextTitle,
            nextCondition: notification.nextCondition,
            rewardLootBox: rewardLootBox
              ? battlePassLevelLootBoxPreview(
                  rewardLootBox,
                  notification.rewardLabel,
                )
              : null,
          },
        },
      ];
    }),
  );
}

export function findNewCompletionDialogs(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): CompletionDialogQueueItem[] {
  const questCompletions = findNewQuestCompletions(
    previousSummary,
    nextSummary,
  ).map(
    (completion): CompletionDialogQueueItem => ({
      key: `quest:${completion.id}:${completion.receivedAt}`,
      kind: "QUEST",
      occurredAt: completion.receivedAt,
      completion,
    }),
  );
  const battlePassCompletions = findNewBattlePassLevelCompletions(
    previousSummary,
    nextSummary,
  ).map(
    (completion): CompletionDialogQueueItem => ({
      key: `battle-pass:${completion.seasonId}:${completion.completedLevel}`,
      kind: "BATTLE_PASS",
      occurredAt: nextSummary.generatedAt,
      completion,
    }),
  );

  return sortCompletionDialogs([...questCompletions, ...battlePassCompletions]);
}

export function sortCompletionDialogs(items: CompletionDialogQueueItem[]) {
  return [...items].sort((left, right) => {
    const timeDifference =
      completionDialogTimestamp(left.occurredAt) -
      completionDialogTimestamp(right.occurredAt);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    if (left.kind !== right.kind) {
      const kindOrder: Record<CompletionDialogQueueItem["kind"], number> = {
        CHECK_IN: 0,
        QUEST: 1,
        BATTLE_PASS: 2,
      };

      return kindOrder[left.kind] - kindOrder[right.kind];
    }

    if (left.kind === "BATTLE_PASS" && right.kind === "BATTLE_PASS") {
      return left.completion.completedLevel - right.completion.completedLevel;
    }

    return left.key.localeCompare(right.key);
  });
}

export function completionDialogTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

export function findNewQuestCompletions(
  previousSummary: GuestPortalGameSummary,
  nextSummary: GuestPortalGameSummary,
): QuestCompletionDialog[] {
  const previousMissions = new Map(
    [
      ...previousSummary.missions.featured,
      ...previousSummary.missions.history,
    ].map((mission) => [mission.id, mission]),
  );
  const seen = new Set<string>();
  const nextMissions = [
    ...nextSummary.missions.featured,
    ...nextSummary.missions.history,
  ];
  const completions: QuestCompletionDialog[] = [];

  for (const mission of nextMissions) {
    if (seen.has(mission.id)) {
      continue;
    }

    seen.add(mission.id);

    const previousMission = previousMissions.get(mission.id);
    if (
      !isMissionCompletedForDialog(mission) ||
      (previousMission && isMissionCompletedForDialog(previousMission))
    ) {
      continue;
    }

    completions.push({
      id: mission.id,
      title: mission.name,
      rewardLabel: missionCompletionRewardLabel(mission),
      statusLabel: mission.rewardStatus.label,
      receivedAt: mission.rewardStatus.occurredAt ?? nextSummary.generatedAt,
      rewardLootBox: mission.rewardLootBox,
    });
  }

  return completions;
}

export function isMissionCompletedForDialog(
  mission: GameMission | GameMissionHistoryItem,
) {
  return (
    mission.progressPercent >= 100 ||
    mission.rewardStatus.state === "COMPLETED" ||
    mission.rewardStatus.state === "WAITING_APPROVAL" ||
    mission.rewardStatus.state === "READY" ||
    mission.rewardStatus.state === "QUEUED" ||
    mission.rewardStatus.state === "SENDING" ||
    mission.rewardStatus.state === "CONFIRMED" ||
    mission.rewardStatus.state === "REDEEMED"
  );
}

export function missionCompletionRewardLabel(
  mission: GameMission | GameMissionHistoryItem,
) {
  if (mission.rewardStatus.rewardLabel) {
    return mission.rewardStatus.rewardLabel;
  }

  if (mission.rewardStatus.rewardAmount !== null) {
    return `${formatNumber(mission.rewardStatus.rewardAmount)} бонусов`;
  }

  if (mission.rewardLabel) {
    return mission.rewardLabel;
  }

  if (mission.xpReward > 0) {
    return `${formatNumber(mission.xpReward)} XP`;
  }

  return "Награда клуба";
}
