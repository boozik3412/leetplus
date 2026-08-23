import { Prisma } from '@prisma/client';

export type UserRoleAuthorityLockTarget = {
  tenantId: string;
  role: string;
  customRoleId: string | null;
};

export async function lockUserRoleAuthority(
  tx: Prisma.TransactionClient,
  target: UserRoleAuthorityLockTarget,
) {
  const authorityKey = target.customRoleId
    ? `user-role-authority:custom:${target.tenantId}:${target.customRoleId}`
    : `user-role-authority:system:${target.tenantId}:${target.role}`;

  await tx.$queryRaw(Prisma.sql`
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(${authorityKey}, 0)
    )::text AS "lockResult"
  `);
}
