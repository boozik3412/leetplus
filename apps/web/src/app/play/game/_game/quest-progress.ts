import {
  normalizeGameRuleTrigger,
  gameRuleSessionRequirement,
  withHourlySessionExtensionNotice,
  gameRuleEventLabel,
  gameProgressUnitLabel,
} from "./game-rules";
import type { GameMission, PlayerQuest } from "./types";
import { clampPercent, formatNumber } from "./format";

export function gameRuleConditionLabel(
  triggerKind: string,
  sessionType: string | null,
) {
  const normalized = normalizeGameRuleTrigger(triggerKind);
  const sessionRequirement = gameRuleSessionRequirement(sessionType);

  if (normalized === "SESSION_START") {
    return withHourlySessionExtensionNotice(
      `старт сессии${sessionRequirement ? ` ${sessionRequirement}` : ""}`,
      sessionType,
    );
  }

  if (normalized === "CHECK_IN") {
    return withHourlySessionExtensionNotice(
      `чекин в клубе${
        sessionRequirement
          ? ` во время активной сессии ${sessionRequirement}`
          : ""
      }`,
      sessionType,
    );
  }

  if (normalized === "PLAY_HOUR") {
    return withHourlySessionExtensionNotice(
      `игровое время${
        sessionRequirement ? ` в сессии ${sessionRequirement}` : ""
      }`,
      sessionType,
    );
  }

  return gameRuleEventLabel(triggerKind);
}

export function playerQuestProgress(mission: GameMission): PlayerQuest["progress"] {
  const lastStep = mission.questSteps[mission.questSteps.length - 1] ?? null;
  const total = Math.max(1, mission.progressTarget ?? lastStep?.target ?? 1);
  const current = Math.min(total, Math.max(0, mission.progressCurrent));
  const percent = clampPercent(mission.progressPercent);
  const hasProgress =
    mission.progressTarget !== null ||
    mission.questSteps.length > 0 ||
    current > 0 ||
    percent > 0;

  if (!hasProgress) {
    return undefined;
  }

  return {
    current,
    total,
    label: playerQuestProgressLabel(current, total, mission.progressUnit),
    percent,
  };
}

export function playerQuestProgressLabel(
  current: number,
  total: number,
  unit: string | null,
) {
  const formattedUnit = gameProgressUnitLabel(unit);
  const unitLabel = formattedUnit ? ` ${formattedUnit}` : "";

  return `${formatNumber(current)} / ${formatNumber(total)}${unitLabel}`;
}

export function missionConditionHint(mission: GameMission) {
  const condition = withHourlySessionExtensionNotice(
    mission.conditionLabel ||
      gameRuleConditionLabel(mission.triggerKind, mission.sessionType),
    mission.sessionType,
  );
  return `Условие: ${condition}${/[.!?]$/.test(condition.trim()) ? "" : "."}`;
}

export function formatMissionStepProgress(step: GameMission["questSteps"][number]) {
  return `${formatNumber(step.progressCurrent)} / ${formatNumber(step.target)}`;
}
