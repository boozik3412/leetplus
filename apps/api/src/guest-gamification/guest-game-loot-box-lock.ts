import { Prisma } from '@prisma/client';

type LootBoxLockTransaction = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Serializes semantic changes to a loot-box rule with issuance/backfill of
 * rights for that same rule. The transaction-scoped lock is released by
 * PostgreSQL automatically on commit or rollback.
 */
export async function acquireGuestGameLootBoxRuleLock(
  tx: LootBoxLockTransaction,
  tenantId: string,
  lootBoxId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`guest-game:loot-box:${tenantId}:${lootBoxId}`}, 0)
      )
    `,
  );
}
