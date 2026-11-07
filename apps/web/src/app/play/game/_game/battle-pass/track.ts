import type { GameMission, HomeBattleQuest, GameJourneyStep } from "../types";
import { playerQuestProgress, missionConditionHint } from "../quest-progress";
import { formatNumber } from "../format";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";

export function missionBattlePassDescription(mission: GameMission) {
  const activeStep =
    mission.questSteps.find((step) => step.current) ??
    mission.questSteps.find((step) => !step.completed) ??
    null;
  const progress = playerQuestProgress(mission);
  const parts = [
    missionConditionHint(mission),
    activeStep ? `Текущий шаг: ${activeStep.title}` : null,
    progress ? `Прогресс: ${progress.label}` : null,
    mission.rewardStatus.hint,
  ].filter(Boolean);

  return parts.join(". ");
}

export function missionBattlePassReward(mission: GameMission) {
  if (mission.rewardStatus.rewardLabel) {
    return `Награда: ${mission.rewardStatus.rewardLabel}.`;
  }

  if (mission.rewardStatus.rewardAmount !== null) {
    return `Награда: ${formatNumber(mission.rewardStatus.rewardAmount)} бонусов.`;
  }

  if (mission.rewardLabel) {
    return `Награда: ${mission.rewardLabel}.`;
  }

  if (mission.xpReward > 0) {
    return `Награда: ${formatNumber(mission.xpReward)} XP.`;
  }

  return "Награда: прогресс сезона.";
}

export function buildHomeBattleQuests(
  summary: GuestPortalGameSummary,
): HomeBattleQuest[] {
  const journeyQuests = summary.journey.steps
    .filter((step) => !isGuestInternalJourneyStep(step))
    .map((step) => ({
      id: step.id,
      sourceKind: "journey" as const,
      sourceId: step.id,
      title: step.label,
      description: guestJourneyHint(step),
      state: homeQuestState(step.status),
      label: homeQuestStateLabel(step.status),
      reward: "Награда: прогресс сезона и доступ к следующему этапу.",
    }));
  const missionQuests = summary.missions.featured.map((mission) => {
    const progress = playerQuestProgress(mission);

    return {
      id: mission.id,
      sourceKind: "mission" as const,
      sourceId: mission.id,
      title: mission.name,
      description: missionBattlePassDescription(mission),
      state: mission.progressPercent >= 100 ? "complete" : "locked",
      label: mission.progressPercent >= 100 ? "готово" : "квест",
      reward: missionBattlePassReward(mission),
      progress,
      periodTo: mission.periodTo,
    };
  });
  const fallback = [
    {
      id: "promo",
      sourceKind: "fallback" as const,
      sourceId: "promo",
      title: "Промокод",
      description: "Активировать клубный код.",
      state: "locked" as const,
      label: "следующий",
      reward: "Награда: бонус бара или скидка на следующую сессию.",
    },
    {
      id: "season-final",
      sourceKind: "fallback" as const,
      sourceId: "season-final",
      title: "Финальный чек",
      description: "Забрать сезонный дроп.",
      state: "locked" as const,
      label: "главная награда",
      reward: "Награда: главный приз сезона.",
    },
  ];

  const quests = [...journeyQuests, ...missionQuests, ...fallback].slice(0, 6);
  const firstOpenIndex = quests.findIndex(
    (quest) => quest.state !== "complete",
  );
  const currentIndex = quests.findIndex((quest) => quest.state === "current");
  const resolvedCurrentIndex =
    currentIndex >= 0 ? currentIndex : Math.max(0, firstOpenIndex);

  return quests.map((quest, index) => {
    const state =
      index < resolvedCurrentIndex
        ? "complete"
        : index === resolvedCurrentIndex
          ? "current"
          : "locked";
    const coordinates = homeBattlePassCoordinates(index, quests.length);
    const status = homeBattlePassStatusLabel(state);
    const condition = quest.description.startsWith("Условие:")
      ? quest.description
      : `Условие: ${quest.description}`;
    const reward = quest.reward.startsWith("Награда:")
      ? quest.reward
      : `Награда: ${quest.reward}`;

    return {
      ...quest,
      state,
      label:
        state === "current"
          ? "текущая задача"
          : state === "complete"
            ? "готово"
            : quest.label,
      step: String(index + 1).padStart(2, "0"),
      status,
      condition,
      reward,
      preview: homeBattlePassPreview(condition),
      x: coordinates.x,
      y: coordinates.y,
    };
  });
}

export function homeBattlePassCoordinates(index: number, total: number) {
  const preset = [
    { x: "11%", y: "72%" },
    { x: "28%", y: "38%" },
    { x: "45%", y: "58%" },
    { x: "63%", y: "70%" },
    { x: "78%", y: "38%" },
    { x: "86%", y: "54%" },
  ];

  if (index < preset.length) {
    return preset[index];
  }

  const safeTotal = Math.max(1, total - 1);
  const x = 9 + (index / safeTotal) * 82;
  const y = index % 2 === 0 ? 64 : 38;

  return { x: `${Math.round(x)}%`, y: `${y}%` };
}

export function homeBattlePassStatusLabel(state: HomeBattleQuest["state"]) {
  if (state === "complete") {
    return "выполнено";
  }

  if (state === "current") {
    return "текущая задача";
  }

  return "следующий этап";
}

export function homeBattlePassPreview(condition: string) {
  return condition
    .replace(/^Условие:\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 118);
}

export function isGuestInternalJourneyStep(step: GameJourneyStep) {
  return step.id === "LANGAME" || step.id === "BONUS";
}

export function guestJourneyHint(step: GameJourneyStep) {
  if (step.hint.toLocaleLowerCase("ru-RU").includes("langame")) {
    return "Мы сверяем профиль автоматически. Когда данные будут готовы, задание откроется.";
  }

  return step.hint;
}

export function homeQuestState(
  status: GameJourneyStep["status"],
): HomeBattleQuest["state"] {
  if (status === "DONE") {
    return "complete";
  }

  return status === "CURRENT" || status === "ATTENTION" ? "current" : "locked";
}

export function homeQuestStateLabel(status: GameJourneyStep["status"]) {
  if (status === "DONE") {
    return "готово";
  }

  if (status === "CURRENT") {
    return "сейчас";
  }

  return status === "ATTENTION" ? "проверить" : "locked";
}
