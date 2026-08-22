import { Prisma } from '@prisma/client';

type RewardDeliveryLockTransaction = Pick<
  Prisma.TransactionClient,
  '$queryRaw'
>;

type RewardDeliveryLockRow = {
  claimRequired: boolean;
};

/**
 * Acquires the migration-166 single-reward lock order before runtime DML:
 * advisory key, canonical Reward, then VERIFIED provider Deliveries by id.
 *
 * Batch or reward-rebind writers must remain fail-closed until they acquire
 * every affected reward boundary in one deterministic order before any DML.
 */
export async function acquireGuestGameRewardDeliveryLock(
  tx: RewardDeliveryLockTransaction,
  tenantId: string,
  rewardId: string,
): Promise<RewardDeliveryLockRow> {
  const rows = await tx.$queryRaw<RewardDeliveryLockRow[]>(
    Prisma.sql`
      SELECT public."guest_game_reward_delivery_lock_v1"(
        CAST(${tenantId} AS TEXT),
        CAST(${rewardId} AS TEXT)
      ) AS "claimRequired"
    `,
  );
  const row = rows[0];

  if (!row || typeof row.claimRequired !== 'boolean') {
    throw new Error('Reward-delivery lock boundary returned no result.');
  }

  return row;
}
