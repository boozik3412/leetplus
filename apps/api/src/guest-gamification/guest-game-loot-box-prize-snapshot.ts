import { Prisma } from '@prisma/client';

type LootBoxPrizeSnapshotTransaction = Pick<
  Prisma.TransactionClient,
  '$executeRaw'
>;

export const LOOT_BOX_PRIZE_SNAPSHOT_KEY = 'lootBoxPrizeSnapshot';

export type GuestGameLootBoxPrizeSnapshot = {
  rewardType: string | null;
  rewardAmount: number | null;
  rewardLabel: string | null;
  probabilityRules: Prisma.JsonValue | null;
  capturedAt: string | null;
};

/**
 * Freezes what an earned, unopened case can drop. Each right of the rule that
 * is still unopened and has no snapshot yet gets the rule's current prizes in
 * evidence.lootBoxPrizeSnapshot; opening then draws from that snapshot, so a
 * later prize edit only applies to cases earned after it.
 *
 * Callers hold acquireGuestGameLootBoxRuleLock: issuance sites call this right
 * after creating a right (snapshot at the moment of receipt), and prize edits
 * call it before writing the new prizes, which covers rights created before
 * snapshots existed.
 */
export async function stampGuestGameLootBoxPrizeSnapshots(
  tx: LootBoxPrizeSnapshotTransaction,
  tenantId: string,
  lootBoxId: string,
): Promise<number> {
  return tx.$executeRaw(
    Prisma.sql`
      UPDATE "GuestGameEntitlement" AS entitlement
      SET
        "evidence" = (
          CASE
            WHEN jsonb_typeof(entitlement."evidence") = 'object'
              THEN entitlement."evidence"
            ELSE '{}'::jsonb
          END
        ) || jsonb_build_object(
          ${LOOT_BOX_PRIZE_SNAPSHOT_KEY}::text,
          jsonb_build_object(
            'rewardType', rule."rewardType",
            'rewardAmount', rule."rewardAmount",
            'rewardLabel', rule."rewardLabel",
            'probabilityRules', rule."probabilityRules",
            'capturedAt', to_jsonb(now())
          )
        ),
        "updatedAt" = now()
      FROM "GuestGameLootBox" AS rule
      WHERE rule."id" = ${lootBoxId}
        AND rule."tenantId" = ${tenantId}
        AND entitlement."tenantId" = ${tenantId}
        AND entitlement."ruleType" = 'LOOT_BOX'
        AND entitlement."ruleId" = ${lootBoxId}
        AND entitlement."consumedAt" IS NULL
        AND entitlement."canceledAt" IS NULL
        AND entitlement."status" IN ('AVAILABLE', 'OPENING', 'EXPIRED')
        AND (
          jsonb_typeof(entitlement."evidence") IS DISTINCT FROM 'object'
          OR entitlement."evidence" -> ${LOOT_BOX_PRIZE_SNAPSHOT_KEY}::text
            IS NULL
        )
    `,
  );
}

export function readGuestGameLootBoxPrizeSnapshot(
  evidence: Prisma.JsonValue | null | undefined,
): GuestGameLootBoxPrizeSnapshot | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return null;
  }
  const raw = evidence[LOOT_BOX_PRIZE_SNAPSHOT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const snapshot = raw;
  const rewardAmount =
    snapshot.rewardAmount === null || snapshot.rewardAmount === undefined
      ? null
      : Number(snapshot.rewardAmount);

  return {
    rewardType:
      typeof snapshot.rewardType === 'string' ? snapshot.rewardType : null,
    rewardAmount:
      rewardAmount !== null && Number.isFinite(rewardAmount)
        ? rewardAmount
        : null,
    rewardLabel:
      typeof snapshot.rewardLabel === 'string' ? snapshot.rewardLabel : null,
    probabilityRules: snapshot.probabilityRules ?? null,
    capturedAt:
      typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : null,
  };
}
