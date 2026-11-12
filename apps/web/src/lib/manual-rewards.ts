import type { MarketingMission, MarketingMissionType } from "./marketing";

/**
 * «Ручные награды»: the staff picks a reason for a one-off reward. A reason is
 * either an existing marketing mission (the reward is attached to it) or a
 * preset that becomes a MANUAL mission the first time somebody uses it.
 * Scenarios driven by Langame facts (visits, hours, bar, top-ups) live in the
 * game-mission wizard, not here.
 */
export type RewardReason = {
  key: string;
  label: string;
  missionId: string | null;
  missionType: MarketingMissionType;
};

export const REWARD_REASON_PRESETS: ReadonlyArray<{
  label: string;
  missionType: MarketingMissionType;
}> = [
  { label: "Привёл друга", missionType: "REFERRAL" },
  { label: "Турнир", missionType: "TOURNAMENT" },
  { label: "День рождения", missionType: "BIRTHDAY_EVENT" },
  { label: "Другое", missionType: "CUSTOM" },
];

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

export function buildRewardReasons(
  missions: ReadonlyArray<
    Pick<
      MarketingMission,
      "id" | "name" | "status" | "missionType" | "updatedAt"
    >
  >,
): RewardReason[] {
  const seen = new Set<string>();
  const reasons: RewardReason[] = [];
  const usable = missions
    .filter((mission) => mission.status !== "ARCHIVED" && mission.name.trim())
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  for (const mission of usable) {
    const name = normalizeName(mission.name);
    if (seen.has(name)) continue;
    seen.add(name);
    reasons.push({
      key: `mission:${mission.id}`,
      label: mission.name.trim(),
      missionId: mission.id,
      missionType: mission.missionType,
    });
  }

  for (const preset of REWARD_REASON_PRESETS) {
    if (seen.has(normalizeName(preset.label))) continue;
    seen.add(normalizeName(preset.label));
    reasons.push({
      key: `preset:${preset.missionType}`,
      label: preset.label,
      missionId: null,
      missionType: preset.missionType,
    });
  }

  return reasons;
}

export function rewardReasonPreset(missionType: MarketingMissionType) {
  return { missionType };
}
