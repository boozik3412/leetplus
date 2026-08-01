import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION =
  'hourly-session-expand-v1';

const sessionFactTypes = new Set([
  'SESSION_STARTED',
  'HOURLY_SESSION_STARTED',
  'PACKAGE_OR_SUBSCRIPTION_USED',
  'SESSION_PLAY_TIME_ACCUMULATED',
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
]);

export type SessionFactHourlyReplayReadiness =
  | 'NOT_APPLICABLE'
  | 'READY'
  | 'PENDING'
  | 'RECLASSIFIED'
  | 'INCOHERENT';

/**
 * Checks the exact persisted fact behind a legacy event. Unlike the queue
 * gate below, this intentionally keeps superseded rows visible: there is a
 * short interval between fact reclassification and event remediation where
 * treating a disappeared typed fact as ready would reopen the old reward.
 */
export async function sessionFactHourlyReplayReadiness(
  prisma: PrismaService,
  input: { tenantId: string; factId: string; eventType?: string | null },
): Promise<SessionFactHourlyReplayReadiness> {
  const rows = await prisma.$queryRaw<
    Array<{
      lifecycleStatus: string;
      supersededAt: Date | null;
      factType: string;
      confidence: string;
      syncStatus: string | null;
      replayVersion: string | null;
    }>
  >(Prisma.sql`
    SELECT
      fact."lifecycleStatus",
      fact."supersededAt",
      fact."factType",
      fact."confidence",
      sync_state."status" AS "syncStatus",
      sync_state."diagnostics" ->> 'replayVersion' AS "replayVersion"
    FROM "GuestActivityFact" fact
    LEFT JOIN "GuestActivitySyncState" sync_state
      ON sync_state."tenantId" = fact."tenantId"
      AND sync_state."externalProvider" = fact."externalProvider"
      AND sync_state."externalDomain" = fact."externalDomain"
      AND sync_state."externalGuestId" = fact."externalGuestId"
    WHERE fact."tenantId" = ${input.tenantId}
      AND fact."id" = ${input.factId}
      AND fact."factType" IN (${Prisma.join([...sessionFactTypes])})
      AND fact."externalProvider" = 'LANGAME'
      AND fact."sourceKind" IN (
        'LANGAME_GUEST_SESSION',
        'LANGAME_GUEST_LOG',
        'GUEST_SESSION',
        'GUEST_LOG'
      )
    LIMIT 2
  `);
  if (!Array.isArray(rows)) return 'NOT_APPLICABLE';
  const row = rows[0] ?? null;
  if (rows.length !== 1 || !row || typeof row.lifecycleStatus !== 'string') {
    return 'NOT_APPLICABLE';
  }
  if (row.lifecycleStatus !== 'ACTIVE' || row.supersededAt) {
    return 'RECLASSIFIED';
  }
  if (
    row.syncStatus !== 'SUCCESS' ||
    row.replayVersion !== GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION
  ) {
    return 'PENDING';
  }
  const expectedFactType =
    input.eventType === 'SESSION_START'
      ? 'HOURLY_SESSION_STARTED'
      : input.eventType === 'PLAY_HOUR'
        ? 'HOURLY_PLAY_TIME_ACCUMULATED'
        : null;
  if (
    row.confidence !== 'EXACT' ||
    (expectedFactType !== null && row.factType !== expectedFactType)
  ) {
    return 'INCOHERENT';
  }
  return 'READY';
}

/**
 * Fail closed while a source can still expose v4 facts created before the
 * expanded-session replay. Advancing a fallback/recovery watermark past such
 * a fact would make the later replay unable to correct the decision.
 */
export async function hasSessionFactsPendingHourlyReplay(
  prisma: PrismaService,
  input: {
    tenantId: string;
    factTypes: readonly string[];
    factId?: string | null;
    profileId?: string | null;
    happenedAtGte?: Date | null;
  },
) {
  const factTypes = [...new Set(input.factTypes)].filter((factType) =>
    sessionFactTypes.has(factType),
  );
  if (!factTypes.length) return false;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT fact."id"
    FROM "GuestActivityFact" fact
    LEFT JOIN "GuestActivitySyncState" sync_state
      ON sync_state."tenantId" = fact."tenantId"
      AND sync_state."externalProvider" = fact."externalProvider"
      AND sync_state."externalDomain" = fact."externalDomain"
      AND sync_state."externalGuestId" = fact."externalGuestId"
    WHERE fact."tenantId" = ${input.tenantId}
      AND fact."factType" IN (${Prisma.join(factTypes)})
      AND fact."externalProvider" = 'LANGAME'
      AND fact."sourceKind" IN (
        'LANGAME_GUEST_SESSION',
        'LANGAME_GUEST_LOG',
        'GUEST_SESSION',
        'GUEST_LOG'
      )
      AND fact."lifecycleStatus" = 'ACTIVE'
      AND fact."confidence" = 'EXACT'
      AND fact."supersededAt" IS NULL
      AND fact."happenedAt" IS NOT NULL
      ${input.factId ? Prisma.sql`AND fact."id" = ${input.factId}` : Prisma.empty}
      ${
        input.profileId
          ? Prisma.sql`AND fact."profileId" = ${input.profileId}`
          : Prisma.empty
      }
      ${
        input.happenedAtGte
          ? Prisma.sql`AND fact."happenedAt" >= ${input.happenedAtGte}`
          : Prisma.empty
      }
      AND (
        sync_state."id" IS NULL
        OR sync_state."status" <> 'SUCCESS'
        OR COALESCE(
          sync_state."diagnostics" ->> 'replayVersion',
          ''
        ) <> ${GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION}
      )
    ORDER BY fact."validFrom", fact."id"
    LIMIT 1
  `);

  return Array.isArray(rows) && rows.length > 0;
}

export function hourlySessionReplayReady(
  status: string | null | undefined,
  diagnostics: unknown,
) {
  return (
    status === 'SUCCESS' &&
    replayVersionFromDiagnostics(diagnostics) ===
      GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION
  );
}

export function replayVersionFromDiagnostics(value: unknown) {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const replayVersion = record.replayVersion;
  return typeof replayVersion === 'string' && replayVersion.trim()
    ? replayVersion.trim()
    : null;
}
