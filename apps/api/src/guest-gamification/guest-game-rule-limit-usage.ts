import { Prisma } from '@prisma/client';

// Global (all-guest) issuance limits, counted the way the engine counts them,
// so the guest game module stops advertising a mission or a case the engine
// would block anyway: a mission's lifetime totalRewardLimit and a case's
// network-wide totalPerDay for the club's current day.

type RawQueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export type GuestGameMissionLimitRule = {
  id: string;
  totalRewardLimit: number | null;
};

export type GuestGameLootBoxLimitRule = {
  id: string;
  limits: Prisma.JsonValue | null;
};

export type GuestGameRuleLimitUsage = {
  missionIssued: Map<string, number>;
  lootBoxIssuedToday: Map<string, number>;
};

export async function loadGuestGameRuleLimitUsage(
  db: RawQueryClient,
  tenantId: string,
  rules: {
    missions?: readonly GuestGameMissionLimitRule[];
    lootBoxes?: readonly GuestGameLootBoxLimitRule[];
    timeZone: string;
  },
): Promise<GuestGameRuleLimitUsage> {
  const missionIds = (rules.missions ?? [])
    .filter((mission) => mission.totalRewardLimit != null)
    .map((mission) => mission.id);
  const dailyLootBoxes = (rules.lootBoxes ?? []).filter(
    (lootBox) => lootBoxTotalPerDay(lootBox) != null,
  );
  const lootBoxIds = dailyLootBoxes.map((lootBox) => lootBox.id);
  // '' stands for "never restarted" so the array stays text[].
  const restartedAt = dailyLootBoxes.map(
    (lootBox) => lootBoxRestartedAt(lootBox)?.toISOString() ?? '',
  );

  const [missionRows, lootBoxRows] = await Promise.all([
    missionIds.length
      ? db.$queryRaw<Array<{ id: string; issued: number }>>(Prisma.sql`
          SELECT m.id,
            (
              (SELECT count(*) FROM "GuestGameReward" r
                WHERE r."tenantId" = ${tenantId} AND r."missionId" = m.id
                  AND r.status IN ('PENDING', 'APPROVED', 'PAID'))
              -- a case reward and its case are one issuance
              - (SELECT count(*) FROM "GuestGameEntitlement" e
                  JOIN "GuestGameReward" r ON r.id = e."sourceRewardId"
                  WHERE e."tenantId" = ${tenantId} AND e."ruleType" = 'LOOT_BOX'
                    AND e.status IN ('AVAILABLE', 'OPENING', 'CONSUMED', 'EXPIRED')
                    AND r."missionId" = m.id AND r."rewardType" = 'LOOT_BOX_ENTITLEMENT'
                    AND r.status IN ('PENDING', 'APPROVED', 'PAID'))
              + (SELECT count(*) FROM "GuestGameEntitlement" e
                  LEFT JOIN "GuestGameReward" r ON r.id = e."sourceRewardId"
                  WHERE e."tenantId" = ${tenantId} AND e."ruleType" = 'LOOT_BOX'
                    AND e.status IN ('AVAILABLE', 'OPENING', 'CONSUMED', 'EXPIRED')
                    AND ((r."missionId" = m.id AND r."rewardType" = 'LOOT_BOX_ENTITLEMENT')
                      OR e.evidence->>'missionId' = m.id))
            )::int AS issued
          FROM unnest(${missionIds}::text[]) AS m(id)
        `)
      : Promise.resolve([]),
    lootBoxIds.length
      ? db.$queryRaw<Array<{ id: string; issued: number }>>(Prisma.sql`
          WITH box AS (
            SELECT b.id, NULLIF(b.restarted, '')::timestamptz AT TIME ZONE 'UTC' AS restarted_at,
                   (now() AT TIME ZONE ${rules.timeZone})::date AS today
            FROM unnest(${lootBoxIds}::text[], ${restartedAt}::text[]) AS b(id, restarted)
          )
          SELECT box.id,
            (
              (SELECT count(*) FROM "GuestGameReward" r
                WHERE r."tenantId" = ${tenantId} AND r."lootBoxId" = box.id
                  AND r.status IN ('PENDING', 'APPROVED', 'PAID')
                  AND (r."qualifiedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${rules.timeZone})::date = box.today
                  AND (box.restarted_at IS NULL OR r."qualifiedAt" >= box.restarted_at)
                  AND NOT EXISTS (
                    SELECT 1 FROM "GuestGameEntitlement" e
                    WHERE e."tenantId" = ${tenantId} AND e."ruleType" = 'LOOT_BOX' AND e."ruleId" = box.id
                      AND e.status IN ('AVAILABLE', 'OPENING', 'CONSUMED')
                      AND (e."sourceRewardId" = r.id OR (e.status = 'CONSUMED' AND e."rewardId" = r.id))))
              + (SELECT count(*) FROM "GuestGameEntitlement" e
                  WHERE e."tenantId" = ${tenantId} AND e."ruleType" = 'LOOT_BOX' AND e."ruleId" = box.id
                    AND e.status IN ('AVAILABLE', 'OPENING', 'CONSUMED')
                    AND (e."qualifiedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${rules.timeZone})::date = box.today
                    AND (box.restarted_at IS NULL OR e."qualifiedAt" >= box.restarted_at))
            )::int AS issued
          FROM box
        `)
      : Promise.resolve([]),
  ]);

  return {
    missionIssued: issuedMap(missionRows),
    lootBoxIssuedToday: issuedMap(lootBoxRows),
  };
}

export function guestGameMissionTotalLimitExhausted(
  mission: GuestGameMissionLimitRule,
  usage: GuestGameRuleLimitUsage,
) {
  return (
    mission.totalRewardLimit != null &&
    (usage.missionIssued.get(mission.id) ?? 0) >= mission.totalRewardLimit
  );
}

export function guestGameLootBoxDailyLimitExhausted(
  lootBox: GuestGameLootBoxLimitRule,
  usage: GuestGameRuleLimitUsage,
) {
  const totalPerDay = lootBoxTotalPerDay(lootBox);
  return (
    totalPerDay != null &&
    (usage.lootBoxIssuedToday.get(lootBox.id) ?? 0) >= totalPerDay
  );
}

function issuedMap(rows: unknown) {
  const issued = new Map<string, number>();
  if (!Array.isArray(rows)) return issued;
  for (const row of rows as Array<{ id?: unknown; issued?: unknown }>) {
    if (typeof row.id === 'string') issued.set(row.id, Number(row.issued ?? 0));
  }
  return issued;
}

function lootBoxLimits(lootBox: GuestGameLootBoxLimitRule) {
  return lootBox.limits &&
    typeof lootBox.limits === 'object' &&
    !Array.isArray(lootBox.limits)
    ? (lootBox.limits as Record<string, unknown>)
    : {};
}

function lootBoxTotalPerDay(lootBox: GuestGameLootBoxLimitRule) {
  const value = Number(lootBoxLimits(lootBox).totalPerDay);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function lootBoxRestartedAt(lootBox: GuestGameLootBoxLimitRule) {
  const value = lootBoxLimits(lootBox).restartedAt;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
