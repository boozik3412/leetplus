import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION,
  sessionFactHourlyReplayReadiness,
} from './guest-activity-hourly-replay';
import {
  genericSessionClassificationRemediationStatus,
  remediateLegacyGenericSessionClassification,
} from './guest-game-generic-session-remediation';

export type GenericSessionMaterializationReadiness = {
  status: 'READY' | 'BLOCKED' | 'DEFERRED';
  reason:
    | 'NOT_A_LEGACY_TYPED_SESSION'
    | 'SOURCE_REPLAY_READY'
    | 'SOURCE_REPLAY_PENDING'
    | 'SOURCE_FACT_RECLASSIFIED'
    | 'SOURCE_FACT_INCOHERENT'
    | 'SOURCE_FACT_MISSING'
    | 'CLASSIFICATION_REMEDIATED'
    | 'CLASSIFICATION_RECONCILIATION_REQUIRED'
    | 'REMEDIATION_BUSY'
    | 'NO_AMBIGUOUS_SOURCE_PROOF';
};

export const PREQUALIFIED_LOOT_BOX_ENTITLEMENT_MATERIALIZATION =
  'PREQUALIFIED_LOOT_BOX_ENTITLEMENT';

type PersistedMaterializationEvent = {
  id: string;
  eventType: string;
  payload: Prisma.JsonValue | null;
};

/**
 * Fail-closed preflight used before any reward intent/effect lease is claimed.
 * The exact source-fact lookup deliberately sees superseded facts so the
 * interval between fact replay and event remediation cannot reopen an old
 * typed reward. LIVE/snapshot events have no activity-fact id and are checked
 * synchronously by the exact GuestSession remediation proof instead.
 */
export async function prepareGenericSessionEventForMaterialization(
  prisma: PrismaService,
  input: { tenantId: string; event: PersistedMaterializationEvent },
): Promise<GenericSessionMaterializationReadiness> {
  const markerStatus = genericSessionClassificationRemediationStatus(
    input.event.payload,
  );
  if (markerStatus) {
    return {
      status: 'BLOCKED',
      reason:
        markerStatus === 'RECONCILIATION_REQUIRED'
          ? 'CLASSIFICATION_RECONCILIATION_REQUIRED'
          : 'CLASSIFICATION_REMEDIATED',
    };
  }

  const payload = jsonRecord(input.event.payload);
  const processInput = jsonRecord(payload.input);
  if (
    !isPotentialLegacyTypedSession(input.event.eventType, payload, processInput)
  ) {
    return { status: 'READY', reason: 'NOT_A_LEGACY_TYPED_SESSION' };
  }

  const sourceFactId = normalizedString(payload.sourceFactId);
  const remediation = await remediateLegacyGenericSessionClassification(
    prisma,
    { tenantId: input.tenantId, eventId: input.event.id },
  );
  if (remediation.status === 'DEFERRED') {
    return { status: 'DEFERRED', reason: 'REMEDIATION_BUSY' };
  }
  if (remediation.status === 'RECONCILIATION_REQUIRED') {
    return {
      status: 'BLOCKED',
      reason: 'CLASSIFICATION_RECONCILIATION_REQUIRED',
    };
  }
  if (remediation.status === 'REMEDIATED') {
    return { status: 'BLOCKED', reason: 'CLASSIFICATION_REMEDIATED' };
  }

  if (sourceFactId) {
    const sourceReadiness = await sessionFactHourlyReplayReadiness(prisma, {
      tenantId: input.tenantId,
      factId: sourceFactId,
      eventType: input.event.eventType,
    });
    if (sourceReadiness === 'READY') {
      return { status: 'READY', reason: 'SOURCE_REPLAY_READY' };
    }
    if (sourceReadiness === 'PENDING') {
      return { status: 'DEFERRED', reason: 'SOURCE_REPLAY_PENDING' };
    }
    if (sourceReadiness === 'RECLASSIFIED') {
      return { status: 'DEFERRED', reason: 'SOURCE_FACT_RECLASSIFIED' };
    }
    if (sourceReadiness === 'INCOHERENT') {
      return { status: 'BLOCKED', reason: 'SOURCE_FACT_INCOHERENT' };
    }
    if (!recognizableLiveOrSnapshotSource(payload, input.event.eventType)) {
      return { status: 'DEFERRED', reason: 'SOURCE_FACT_MISSING' };
    }
  } else if (ledgerBackedSource(payload)) {
    return { status: 'DEFERRED', reason: 'SOURCE_FACT_MISSING' };
  }
  return { status: 'READY', reason: 'NO_AMBIGUOUS_SOURCE_PROOF' };
}

/**
 * Final transactional fence for entitlement writes. It locks the immutable
 * event and, for ledger-backed sources, the exact fact plus its replay state.
 * A sync cannot move the fact to RUNNING/superseded between this check and the
 * entitlement commit.
 */
export async function assertGenericSessionEventMaterializationReadyInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; eventId: string | null },
) {
  if (!input.eventId) return;
  const events = await tx.$queryRaw<
    Array<{
      eventType: string;
      payload: Prisma.JsonValue | null;
      externalProvider: string | null;
      externalDomain: string | null;
      createdAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      event."eventType",
      event."payload",
      event."externalProvider"::text AS "externalProvider",
      event."externalDomain",
      event."createdAt"
    FROM "GuestGameEvent" event
    WHERE event."tenantId" = ${input.tenantId}
      AND event."id" = ${input.eventId}
    FOR SHARE OF event
  `);
  // Jest delegates do not execute raw SQL. Production Prisma always returns
  // an array and therefore follows the fail-closed checks below.
  if (!Array.isArray(events)) return;
  if (events.length !== 1 || !events[0]) {
    throw new Error(
      'The source event is unavailable for reward materialization.',
    );
  }
  const event = events[0];
  if (genericSessionClassificationRemediationStatus(event.payload)) {
    throw new Error(
      'Generic session classification blocks reward materialization.',
    );
  }
  const payload = jsonRecord(event.payload);
  const processInput = jsonRecord(payload.input);
  if (!isPotentialLegacyTypedSession(event.eventType, payload, processInput)) {
    return;
  }

  const sourceFactId = normalizedString(payload.sourceFactId);
  if (sourceFactId) {
    const facts = await tx.$queryRaw<
      Array<{
        lifecycleStatus: string;
        supersededAt: Date | null;
        factType: string;
        confidence: string;
        syncStatus: string;
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
      JOIN "GuestActivitySyncState" sync_state
        ON sync_state."tenantId" = fact."tenantId"
        AND sync_state."externalProvider" = fact."externalProvider"
        AND sync_state."externalDomain" = fact."externalDomain"
        AND sync_state."externalGuestId" = fact."externalGuestId"
      WHERE fact."tenantId" = ${input.tenantId}
        AND fact."id" = ${sourceFactId}
        AND fact."externalProvider" = 'LANGAME'
        AND fact."sourceKind" IN (
          'LANGAME_GUEST_SESSION',
          'LANGAME_GUEST_LOG',
          'GUEST_SESSION',
          'GUEST_LOG'
        )
      FOR SHARE OF fact, sync_state
    `);
    if (Array.isArray(facts) && facts.length === 1 && facts[0]) {
      const fact = facts[0];
      const expectedFactType =
        event.eventType === 'SESSION_START'
          ? 'HOURLY_SESSION_STARTED'
          : 'HOURLY_PLAY_TIME_ACCUMULATED';
      if (
        fact.lifecycleStatus !== 'ACTIVE' ||
        fact.supersededAt !== null ||
        fact.factType !== expectedFactType ||
        fact.confidence !== 'EXACT' ||
        fact.syncStatus !== 'SUCCESS' ||
        fact.replayVersion !== GUEST_ACTIVITY_HOURLY_SESSION_REPLAY_VERSION
      ) {
        throw new Error(
          'The exact session source is not ready for reward materialization.',
        );
      }
      return;
    }
    if (!recognizableLiveOrSnapshotSource(payload, event.eventType)) {
      throw new Error(
        'The exact session source is missing for reward materialization.',
      );
    }
    await assertLiveOrSnapshotSessionStableInTransaction(tx, {
      tenantId: input.tenantId,
      event,
      payload,
    });
  } else if (ledgerBackedSource(payload)) {
    throw new Error(
      'The ledger session source is missing for reward materialization.',
    );
  }
}

async function assertLiveOrSnapshotSessionStableInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    event: {
      eventType: string;
      externalProvider: string | null;
      externalDomain: string | null;
      createdAt: Date;
    };
    payload: Record<string, unknown>;
  },
) {
  const sourceFactId = normalizedString(input.payload.sourceFactId);
  const sourceFactKind = normalizedString(input.payload.sourceFactKind);
  const sessionExternalId =
    normalizedString(input.payload.sessionExternalId) ??
    normalizedString(input.payload.externalId);
  if (!sourceFactId || !sessionExternalId) {
    throw new Error(
      'The live session source is missing for reward materialization.',
    );
  }
  const suffix = input.event.eventType === 'SESSION_START' ? ':start' : ':play';
  const sessions = await tx.$queryRaw<
    Array<{
      id: string;
      packet: boolean | null;
      expand: boolean | null;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      session."id",
      session."packet",
      session."expand",
      session."updatedAt"
    FROM "GuestSession" session
    WHERE session."tenantId" = ${input.tenantId}
      AND session."externalSessionId" = ${sessionExternalId}
      AND COALESCE(
        session."externalProvider",
        'LANGAME'::"IntegrationProvider"
      ) = COALESCE(
        ${input.event.externalProvider}::"IntegrationProvider",
        'LANGAME'::"IntegrationProvider"
      )
      AND COALESCE(
        session."externalDomain",
        'guest-gamification-snapshot'
      ) = COALESCE(
        ${input.event.externalDomain},
        'guest-gamification-snapshot'
      )
      AND (
        ${sourceFactId} = CONCAT('session:', session."id", ${suffix})
        OR (
          ${sourceFactKind} = 'GUEST_SESSION'
          AND ${sourceFactId} = session."externalSessionId"
        )
      )
    FOR SHARE OF session
  `);
  // Missing snapshots remain acceptable for direct LIVE observations. When a
  // canonical snapshot exists, its lock closes the preflight-to-entitlement
  // race with session synchronization.
  if (!Array.isArray(sessions) || sessions.length === 0) return;
  if (sessions.length !== 1 || !sessions[0]) {
    throw new Error(
      'The live session source is ambiguous for reward materialization.',
    );
  }
  const session = sessions[0];
  if (session.expand !== true) return;
  if (
    input.event.eventType === 'PLAY_HOUR' ||
    session.updatedAt.getTime() <= input.event.createdAt.getTime()
  ) {
    throw new Error(
      'An expanded session cannot prove an hourly reward segment.',
    );
  }
}

function isPotentialLegacyTypedSession(
  eventType: string,
  payload: Record<string, unknown>,
  processInput = jsonRecord(payload.input),
) {
  if (
    payload.materializationQualification ===
      PREQUALIFIED_LOOT_BOX_ENTITLEMENT_MATERIALIZATION &&
    normalizedString(payload.sourceFactKind) === 'GUEST_LOOT_BOX_OPEN' &&
    normalizedString(payload.sourceFactId)?.startsWith(
      'guest-game-entitlement:',
    )
  ) {
    return false;
  }

  return (
    ['SESSION_START', 'PLAY_HOUR'].includes(eventType) &&
    normalizedString(payload.source) === 'guest_gamification_process_event' &&
    numberValue(payload.processSchemaVersion) === 2 &&
    processInput.sessionPacket === false
  );
}

function ledgerBackedSource(payload: Record<string, unknown>) {
  const extra = jsonRecord(payload.extra);
  const sourceFactKind = normalizedString(payload.sourceFactKind) ?? '';
  return (
    extra.fallback === true ||
    sourceFactKind === 'LEDGER_FALLBACK' ||
    sourceFactKind.startsWith('LEDGER_SESSION_')
  );
}

function recognizableLiveOrSnapshotSource(
  payload: Record<string, unknown>,
  eventType: string,
) {
  const sourceFactId = normalizedString(payload.sourceFactId);
  const sessionExternalId =
    normalizedString(payload.sessionExternalId) ??
    normalizedString(payload.externalId);
  if (!sourceFactId || !sessionExternalId) return false;
  if (
    normalizedString(payload.sourceFactKind) === 'GUEST_SESSION' &&
    sourceFactId === sessionExternalId
  ) {
    return true;
  }
  const suffix = eventType === 'SESSION_START' ? ':start' : ':play';
  return (
    normalizedString(payload.sourceFactKind) === 'GUEST_SESSION' &&
    sourceFactId.startsWith('session:') &&
    sourceFactId.endsWith(suffix) &&
    sourceFactId.length > `session:${suffix}`.length
  );
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedString(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
