import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const GENERIC_SESSION_CLASSIFICATION_REMEDIATION_MARKER =
  'genericSessionClassificationRemediation';

const remediationStatuses = ['REMEDIATED', 'RECONCILIATION_REQUIRED'] as const;
const safeReceiptStatuses = new Set([
  'PROCESSED',
  'LIVE_PROCESSED',
  'DEAD_LETTER',
]);

type RemediationStatus = (typeof remediationStatuses)[number];

type CandidateRow = { eventId: string };

type LockedEvent = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  eventType: string;
  source: string;
  externalProvider: string | null;
  externalDomain: string | null;
  externalId: string | null;
  originKey: string | null;
  xpDelta: number;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
};

type ClassificationProof = {
  proofKind:
    | 'GUEST_SESSION'
    | 'LIVE_GUEST_SESSION_AMBIGUOUS'
    | 'GUEST_ACTIVITY_FACT';
  id: string;
  profileId: string | null;
  guestId: string | null;
  storeId: string | null;
  updatedAt: Date;
};

type LockedReceipt = {
  id: string;
  status: string;
  claimExpiresAt: Date | null;
};

type LockedMaterializationRow = {
  id: string;
  status: string;
  claimExpiresAt: Date | null;
};

type MaterialEffectSummary = {
  ruleDecisionCount: number | bigint;
  xpPostingCount: number | bigint;
  rewardIntentCount: number | bigint;
  rewardCount: number | bigint;
  rewardEffectCount: number | bigint;
  entitlementCount: number | bigint;
  walletCount: number | bigint;
};

export type GenericSessionClassificationRemediationOutcome = {
  status: 'NO_MATCH' | 'DEFERRED' | RemediationStatus;
  eventId: string;
  changed: boolean;
};

export type GenericSessionClassificationRemediationBatchResult = {
  scanned: number;
  remediated: number;
  quarantined: number;
  deferred: number;
  failed: number;
  hasMore: boolean;
  complete: boolean;
};

export type GenericSessionClassificationRemediationDrainResult =
  GenericSessionClassificationRemediationBatchResult & { batches: number };

export async function drainLegacyGenericSessionClassifications(
  prisma: PrismaService,
  input: {
    tenantId: string;
    limit: number;
    maxBatches: number;
    includeSessionStart: boolean;
    includePlayTime: boolean;
  },
): Promise<GenericSessionClassificationRemediationDrainResult> {
  const aggregate: GenericSessionClassificationRemediationDrainResult = {
    scanned: 0,
    remediated: 0,
    quarantined: 0,
    deferred: 0,
    failed: 0,
    hasMore: false,
    complete: false,
    batches: 0,
  };
  const maxBatches = Math.max(1, Math.min(Math.trunc(input.maxBatches), 100));
  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const batch = await remediateLegacyGenericSessionClassifications(prisma, {
      tenantId: input.tenantId,
      limit: input.limit,
      includeSessionStart: input.includeSessionStart,
      includePlayTime: input.includePlayTime,
    });
    aggregate.batches += 1;
    aggregate.scanned += batch.scanned;
    aggregate.remediated += batch.remediated;
    aggregate.quarantined += batch.quarantined;
    aggregate.deferred += batch.deferred;
    aggregate.failed += batch.failed;
    aggregate.hasMore = batch.hasMore;
    aggregate.complete = batch.complete;
    if (batch.complete || batch.failed > 0 || batch.deferred > 0) break;
  }
  if (aggregate.hasMore) aggregate.complete = false;
  return aggregate;
}

export async function remediateLegacyGenericSessionClassifications(
  prisma: PrismaService,
  input: {
    tenantId: string;
    limit: number;
    includeSessionStart: boolean;
    includePlayTime: boolean;
  },
): Promise<GenericSessionClassificationRemediationBatchResult> {
  const eventTypes = [
    ...(input.includeSessionStart ? ['SESSION_START'] : []),
    ...(input.includePlayTime ? ['PLAY_HOUR'] : []),
  ];
  if (!eventTypes.length) {
    return {
      scanned: 0,
      remediated: 0,
      quarantined: 0,
      deferred: 0,
      failed: 0,
      hasMore: false,
      complete: true,
    };
  }

  const batchLimit = Math.max(1, Math.min(Math.trunc(input.limit), 100));

  const candidates = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT event."id" AS "eventId"
    FROM "GuestGameEvent" event
    WHERE event."tenantId" = ${input.tenantId}
      AND event."eventType" IN (${Prisma.join(eventTypes)})
      AND event."payload" #>> '{source}' =
        'guest_gamification_process_event'
      AND event."payload" #>> '{processSchemaVersion}' = '2'
      AND event."payload" #> '{input,sessionPacket}' = 'false'::jsonb
      AND event."payload" #>>
        '{genericSessionClassificationRemediation,status}' IS NULL
      AND COALESCE(
        NULLIF(event."payload" ->> 'sessionExternalId', ''),
        NULLIF(event."payload" ->> 'externalId', '')
      ) IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM "GuestSession" session
          WHERE session."tenantId" = event."tenantId"
            AND session."externalSessionId" = COALESCE(
              NULLIF(event."payload" ->> 'sessionExternalId', ''),
              NULLIF(event."payload" ->> 'externalId', '')
            )
            AND COALESCE(
              session."externalProvider",
              'LANGAME'::"IntegrationProvider"
            ) = COALESCE(
              event."externalProvider",
              'LANGAME'::"IntegrationProvider"
            )
            AND COALESCE(
              session."externalDomain",
              'guest-gamification-snapshot'
            ) = COALESCE(
              event."externalDomain",
              'guest-gamification-snapshot'
            )
            AND session."expand" = true
            AND session."packet" = false
            AND (
              event."eventType" <> 'SESSION_START'
              OR session."updatedAt" <= event."createdAt"
            )
            AND (
              event."payload" ->> 'sourceFactId' = CONCAT(
                'session:',
                session."id",
                CASE event."eventType"
                  WHEN 'SESSION_START' THEN ':start'
                  WHEN 'PLAY_HOUR' THEN ':play'
                END
              )
              OR (
                event."payload" ->> 'sourceFactKind' = 'GUEST_SESSION'
                AND event."payload" ->> 'sourceFactId' =
                  session."externalSessionId"
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM "GuestActivityFact" fact
          WHERE fact."tenantId" = event."tenantId"
            AND fact."externalProvider" = COALESCE(
              event."externalProvider",
              'LANGAME'::"IntegrationProvider"
            )
            AND fact."externalDomain" = event."externalDomain"
            AND fact."sessionExternalId" = COALESCE(
              NULLIF(event."payload" ->> 'sessionExternalId', ''),
              NULLIF(event."payload" ->> 'externalId', '')
            )
            AND fact."factType" = CASE event."eventType"
              WHEN 'SESSION_START' THEN 'SESSION_STARTED'
              WHEN 'PLAY_HOUR' THEN 'SESSION_PLAY_TIME_ACCUMULATED'
            END
            AND fact."lifecycleStatus" = 'ACTIVE'
            AND fact."confidence" = 'EXACT'
            AND fact."supersededAt" IS NULL
            AND (
              fact."id" = event."payload" ->> 'sourceFactId'
              OR EXISTS (
                SELECT 1
                FROM "GuestActivityFact" superseded_typed_fact
                WHERE superseded_typed_fact."tenantId" = fact."tenantId"
                  AND superseded_typed_fact."id" =
                    event."payload" ->> 'sourceFactId'
                  AND superseded_typed_fact."externalProvider" =
                    fact."externalProvider"
                  AND superseded_typed_fact."externalDomain" =
                    fact."externalDomain"
                  AND superseded_typed_fact."sessionExternalId" =
                    fact."sessionExternalId"
                  AND superseded_typed_fact."sourceHash" = fact."sourceHash"
                  AND superseded_typed_fact."factType" =
                    CASE event."eventType"
                      WHEN 'SESSION_START' THEN 'HOURLY_SESSION_STARTED'
                      WHEN 'PLAY_HOUR' THEN
                        'HOURLY_PLAY_TIME_ACCUMULATED'
                    END
                  AND superseded_typed_fact."lifecycleStatus" = 'SUPERSEDED'
                  AND superseded_typed_fact."supersededAt" IS NOT NULL
              )
            )
            AND LOWER(COALESCE(
              fact."evidence" ->> 'sessionBillingKind',
              ''
            )) = 'unknown'
            AND LOWER(COALESCE(
              fact."evidence" ->> 'observedSessionBillingKind',
              ''
            )) = 'hourly'
            AND LOWER(COALESCE(
              fact."evidence" ->> 'expanded',
              fact."evidence" ->> 'expand',
              ''
            )) IN ('true', '1')
        )
      )
    ORDER BY event."createdAt", event."id"
    LIMIT ${batchLimit + 1}
  `);

  const selectedCandidates = candidates.slice(0, batchLimit);

  const result: GenericSessionClassificationRemediationBatchResult = {
    scanned: selectedCandidates.length,
    remediated: 0,
    quarantined: 0,
    deferred: 0,
    failed: 0,
    hasMore: candidates.length > batchLimit,
    complete: false,
  };
  for (const candidate of selectedCandidates) {
    try {
      const outcome = await remediateLegacyGenericSessionClassification(
        prisma,
        { tenantId: input.tenantId, eventId: candidate.eventId },
      );
      if (outcome.status === 'DEFERRED') result.deferred += 1;
      if (!outcome.changed) continue;
      if (outcome.status === 'REMEDIATED') result.remediated += 1;
      if (outcome.status === 'RECONCILIATION_REQUIRED') {
        result.quarantined += 1;
      }
    } catch {
      // Leave the legacy classification untouched and stop the caller's
      // current fallback pass. A later tick retries the same bounded row.
      result.failed += 1;
    }
  }
  result.complete =
    !result.hasMore && result.deferred === 0 && result.failed === 0;
  return result;
}

export async function remediateLegacyGenericSessionClassification(
  prisma: PrismaService,
  input: { tenantId: string; eventId: string },
): Promise<GenericSessionClassificationRemediationOutcome> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) =>
          remediateLegacyGenericSessionClassificationInTransaction(tx, input),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isSerializationConflict(error) && attempt < maxAttempts) continue;
      throw error;
    }
  }
  throw new Error('Generic session classification remediation exhausted.');
}

export async function remediateLegacyGenericSessionClassificationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; eventId: string },
): Promise<GenericSessionClassificationRemediationOutcome> {
  const events = await tx.$queryRaw<LockedEvent[]>(Prisma.sql`
    SELECT
      "id",
      "profileId",
      "guestId",
      "lootBoxId",
      "missionId",
      "seasonId",
      "eventType",
      "source",
      "externalProvider"::text AS "externalProvider",
      "externalDomain",
      "externalId",
      "originKey",
      "xpDelta",
      "payload",
      "createdAt"
    FROM "GuestGameEvent"
    WHERE "tenantId" = ${input.tenantId}
      AND "id" = ${input.eventId}
    FOR UPDATE
  `);
  const event = Array.isArray(events) ? (events[0] ?? null) : null;
  if (!Array.isArray(events) || events.length !== 1 || !event) {
    return { status: 'NO_MATCH', eventId: input.eventId, changed: false };
  }

  const payload = jsonRecord(event.payload);
  const markerStatus = genericSessionClassificationRemediationStatus(payload);
  if (markerStatus) {
    return { status: markerStatus, eventId: event.id, changed: false };
  }
  const processInput = jsonRecord(payload.input);
  const sessionExternalId =
    normalizedString(payload.sessionExternalId) ??
    normalizedString(payload.externalId);
  if (
    normalizedString(payload.source) !== 'guest_gamification_process_event' ||
    numberValue(payload.processSchemaVersion) !== 2 ||
    processInput.sessionPacket !== false ||
    !sessionExternalId ||
    !['SESSION_START', 'PLAY_HOUR'].includes(event.eventType)
  ) {
    return { status: 'NO_MATCH', eventId: event.id, changed: false };
  }

  const expectedGenericFactType =
    event.eventType === 'SESSION_START'
      ? 'SESSION_STARTED'
      : 'SESSION_PLAY_TIME_ACCUMULATED';
  const expectedPackageFactType =
    event.eventType === 'SESSION_START'
      ? 'PACKAGE_OR_SUBSCRIPTION_USED'
      : 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED';
  const sessionProofs = await tx.$queryRaw<ClassificationProof[]>(Prisma.sql`
    SELECT
      CASE
        WHEN ${normalizedString(payload.sourceFactId)} = CONCAT(
          'session:',
          session."id",
          ${event.eventType === 'SESSION_START' ? ':start' : ':play'}
        ) THEN 'GUEST_SESSION'
        ELSE 'LIVE_GUEST_SESSION_AMBIGUOUS'
      END::text AS "proofKind",
      session."id",
      NULL::text AS "profileId",
      session."guestId",
      session."storeId",
      session."updatedAt"
    FROM "GuestSession" session
    WHERE session."tenantId" = ${input.tenantId}
      AND session."externalSessionId" = ${sessionExternalId}
      AND COALESCE(
        session."externalProvider",
        'LANGAME'::"IntegrationProvider"
      ) = COALESCE(
        ${event.externalProvider}::"IntegrationProvider",
        'LANGAME'::"IntegrationProvider"
      )
      AND COALESCE(
        session."externalDomain",
        'guest-gamification-snapshot'
      ) = COALESCE(
        ${event.externalDomain},
        'guest-gamification-snapshot'
      )
      AND session."expand" = true
      AND session."packet" = false
      AND (
        ${event.eventType} <> 'SESSION_START'
        OR session."updatedAt" <= ${event.createdAt}
      )
      AND (
        ${normalizedString(payload.sourceFactId)} = CONCAT(
          'session:',
          session."id",
          ${event.eventType === 'SESSION_START' ? ':start' : ':play'}
        )
        OR (
          ${normalizedString(payload.sourceFactKind)} = 'GUEST_SESSION'
          AND ${normalizedString(payload.sourceFactId)} =
            session."externalSessionId"
        )
      )
    FOR SHARE
  `);
  const factProofs = await tx.$queryRaw<ClassificationProof[]>(Prisma.sql`
    SELECT
      'GUEST_ACTIVITY_FACT'::text AS "proofKind",
      fact."id",
      fact."profileId",
      fact."guestId",
      fact."storeId",
      fact."updatedAt"
    FROM "GuestActivityFact" fact
    WHERE fact."tenantId" = ${input.tenantId}
      AND fact."externalProvider" = COALESCE(
        ${event.externalProvider}::"IntegrationProvider",
        'LANGAME'::"IntegrationProvider"
      )
      AND fact."externalDomain" = ${event.externalDomain}
      AND fact."sessionExternalId" = ${sessionExternalId}
      AND (
        (
          fact."id" = ${normalizedString(payload.sourceFactId)}
          AND (
            fact."factType" IN (
              ${expectedGenericFactType},
              ${expectedPackageFactType}
            )
            OR fact."confidence" <> 'EXACT'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM "GuestActivityFact" superseded_typed_fact
          WHERE superseded_typed_fact."tenantId" = fact."tenantId"
            AND superseded_typed_fact."id" =
              ${normalizedString(payload.sourceFactId)}
            AND superseded_typed_fact."externalProvider" =
              fact."externalProvider"
            AND superseded_typed_fact."externalDomain" =
              fact."externalDomain"
            AND superseded_typed_fact."sessionExternalId" =
              fact."sessionExternalId"
            AND superseded_typed_fact."sourceHash" = fact."sourceHash"
            AND superseded_typed_fact."factType" = ${
              event.eventType === 'SESSION_START'
                ? 'HOURLY_SESSION_STARTED'
                : 'HOURLY_PLAY_TIME_ACCUMULATED'
            }
            AND superseded_typed_fact."lifecycleStatus" = 'SUPERSEDED'
            AND superseded_typed_fact."supersededAt" IS NOT NULL
            AND fact."factType" IN (
              ${expectedGenericFactType},
              ${expectedPackageFactType}
            )
        )
      )
      AND fact."lifecycleStatus" = 'ACTIVE'
      AND fact."supersededAt" IS NULL
    ORDER BY fact."id"
    FOR SHARE
  `);
  const proofs = [...sessionProofs, ...factProofs];
  if (!proofs.length) {
    return { status: 'NO_MATCH', eventId: event.id, changed: false };
  }

  const rewardExternalPrefix = event.externalId
    ? `${event.externalId}:reward:`
    : null;
  const lockedIntents = await tx.$queryRaw<LockedMaterializationRow[]>(
    Prisma.sql`
      SELECT intent."id", intent."status", intent."claimExpiresAt"
      FROM "GuestGameRewardIntent" intent
      WHERE intent."tenantId" = ${input.tenantId}
        AND (
          intent."eventId" = ${event.id}
          ${event.originKey ? Prisma.sql`OR intent."originKey" = ${event.originKey}` : Prisma.empty}
        )
        AND intent."effectKind" = 'REWARD'
        AND intent."status" IN ('PENDING', 'FAILED', 'PROCESSING')
      ORDER BY intent."id"
      FOR UPDATE
    `,
  );
  const lockedEffects = await tx.$queryRaw<LockedMaterializationRow[]>(
    Prisma.sql`
      WITH bound_intents AS (
        SELECT intent."rewardId"
        FROM "GuestGameRewardIntent" intent
        WHERE intent."tenantId" = ${input.tenantId}
          AND (
            intent."eventId" = ${event.id}
            ${event.originKey ? Prisma.sql`OR intent."originKey" = ${event.originKey}` : Prisma.empty}
          )
          AND intent."rewardId" IS NOT NULL
      ),
      bound_rewards AS (
        SELECT reward."id"
        FROM "GuestGameReward" reward
        WHERE reward."tenantId" = ${input.tenantId}
          AND (
            ${event.originKey ? Prisma.sql`reward."originKey" = ${event.originKey} OR` : Prisma.empty}
            ${
              rewardExternalPrefix &&
              event.externalProvider &&
              event.externalDomain
                ? Prisma.sql`(
                  reward."externalProvider"::text = ${event.externalProvider}
                  AND reward."externalDomain" = ${event.externalDomain}
                  AND LEFT(
                    reward."externalId",
                    LENGTH(${rewardExternalPrefix})
                  ) = ${rewardExternalPrefix}
                ) OR`
                : Prisma.empty
            }
            reward."id" IN (
              SELECT "rewardId" FROM bound_intents
            )
          )
      )
      SELECT effect."id", effect."status", effect."claimExpiresAt"
      FROM "GuestGameRewardEffect" effect
      WHERE effect."tenantId" = ${input.tenantId}
        AND effect."rewardId" IN (SELECT "id" FROM bound_rewards)
        AND effect."status" IN (
          'WAITING_CLAIM',
          'PENDING',
          'FAILED',
          'PROCESSING'
        )
      ORDER BY effect."id"
      FOR UPDATE OF effect
    `,
  );
  const lockObservedAt = new Date();
  if (
    [...lockedIntents, ...lockedEffects].some(
      (row) =>
        row.status === 'PROCESSING' &&
        row.claimExpiresAt !== null &&
        row.claimExpiresAt.getTime() > lockObservedAt.getTime(),
    )
  ) {
    // A worker won the row lock first. Let that already-started attempt reach a
    // durable terminal state, then retry remediation on the next drain pass.
    return { status: 'DEFERRED', eventId: event.id, changed: false };
  }

  const receipts = await tx.$queryRaw<LockedReceipt[]>(Prisma.sql`
    SELECT "id", "status", "claimExpiresAt"
    FROM "GuestGameOriginReceipt"
    WHERE "tenantId" = ${input.tenantId}
      AND (
        "eventId" = ${event.id}
        ${event.originKey ? Prisma.sql`OR "originKey" = ${event.originKey}` : Prisma.empty}
      )
    ORDER BY "id"
    FOR UPDATE
  `);
  const effects = await materialEffectSummary(
    tx,
    input.tenantId,
    event.id,
    event.originKey,
    normalizedString(payload.sourceFactId),
    event.externalProvider,
    event.externalDomain,
    event.externalId,
  );
  const payloadHasMaterialization =
    payloadMaterializationPresent(payload.rules) ||
    payloadMaterializationPresent(payload.rewardIntents);
  const ownerProvenanceMatches = proofs.some(
    (proof) =>
      (!event.profileId ||
        !proof.profileId ||
        event.profileId === proof.profileId) &&
      (!event.guestId || !proof.guestId || event.guestId === proof.guestId),
  );
  const receiptMayStillResume = receipts.some(
    (receipt) =>
      !safeReceiptStatuses.has(receipt.status) ||
      receipt.claimExpiresAt !== null,
  );
  const hasPersistedEffects = Object.values(effects).some(positiveCount);
  const eventHasMaterialization =
    event.xpDelta !== 0 ||
    event.lootBoxId !== null ||
    event.missionId !== null ||
    event.seasonId !== null;
  const liveObservationAmbiguous = proofs.some(
    (proof) => proof.proofKind === 'LIVE_GUEST_SESSION_AMBIGUOUS',
  );
  const reconciliationRequired =
    liveObservationAmbiguous ||
    !ownerProvenanceMatches ||
    receiptMayStillResume ||
    payloadHasMaterialization ||
    eventHasMaterialization ||
    hasPersistedEffects;
  const status: RemediationStatus = reconciliationRequired
    ? 'RECONCILIATION_REQUIRED'
    : 'REMEDIATED';
  const remediatedAt = new Date();
  const marker = {
    schemaVersion: 1,
    kind: 'GENERIC_SESSION_FAIL_CLOSED',
    status,
    remediatedAt: remediatedAt.toISOString(),
    activeEvidence: proofs.map((proof) => ({
      kind: proof.proofKind,
      id: proof.id,
      updatedAt: proof.updatedAt.toISOString(),
    })),
    originalClassification: {
      sessionPacket: false,
      sessionType: safeClassificationLabel(processInput.sessionType),
      sourceFactId: normalizedString(payload.sourceFactId),
      sourceFactKind: safeClassificationLabel(payload.sourceFactKind),
    },
    semanticClassification: {
      sessionPacket: null,
      sessionType: null,
    },
    materialEffects: {
      payload: payloadHasMaterialization,
      event: eventHasMaterialization,
      ownerProvenanceConflict: !ownerProvenanceMatches,
      liveObservationAmbiguous,
      receiptMayStillResume,
      ruleDecisions: numericCount(effects.ruleDecisionCount),
      xpPostings: numericCount(effects.xpPostingCount),
      rewardIntents: numericCount(effects.rewardIntentCount),
      rewards: numericCount(effects.rewardCount),
      rewardEffects: numericCount(effects.rewardEffectCount),
      entitlements: numericCount(effects.entitlementCount),
      walletItems: numericCount(effects.walletCount),
    },
  } satisfies Prisma.InputJsonObject;
  const nextPayload = {
    ...payload,
    input: {
      ...processInput,
      sessionPacket: null,
      sessionType: null,
    },
    [GENERIC_SESSION_CLASSIFICATION_REMEDIATION_MARKER]: marker,
  } satisfies Prisma.InputJsonObject;

  const updatedEvent = await tx.guestGameEvent.updateMany({
    where: { tenantId: input.tenantId, id: event.id },
    data: { payload: nextPayload },
  });
  if (updatedEvent.count !== 1) {
    throw new Error('The legacy generic session event changed during repair.');
  }

  if (lockedIntents.length) {
    const quarantinedIntents = await tx.guestGameRewardIntent.updateMany({
      where: {
        tenantId: input.tenantId,
        id: { in: lockedIntents.map((intent) => intent.id) },
        status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
      },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        claimExpiresAt: null,
        nextAttemptAt: null,
        processedAt: remediatedAt,
        lastError:
          'Legacy generic session classification requires explicit reconciliation.',
      },
    });
    if (quarantinedIntents.count !== lockedIntents.length) {
      throw new Error(
        'A legacy generic session reward intent changed during quarantine.',
      );
    }
  }
  if (lockedEffects.length) {
    const quarantinedEffects = await tx.guestGameRewardEffect.updateMany({
      where: {
        tenantId: input.tenantId,
        id: { in: lockedEffects.map((effect) => effect.id) },
        status: {
          in: ['WAITING_CLAIM', 'PENDING', 'FAILED', 'PROCESSING'],
        },
      },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        claimExpiresAt: null,
        nextAttemptAt: null,
        lastError:
          'Legacy generic session classification requires explicit reconciliation.',
      },
    });
    if (quarantinedEffects.count !== lockedEffects.length) {
      throw new Error(
        'A legacy generic session reward effect changed during quarantine.',
      );
    }
  }

  if (reconciliationRequired && receipts.length) {
    const quarantined = await tx.guestGameOriginReceipt.updateMany({
      where: {
        tenantId: input.tenantId,
        id: { in: receipts.map((receipt) => receipt.id) },
      },
      data: {
        status: 'QUARANTINED',
        claimedSource: 'GENERIC_SESSION_CLASSIFICATION_RECONCILIATION',
        claimExpiresAt: null,
        processedAt: remediatedAt,
        lastError:
          'Legacy generic session classification has materialized effects and requires explicit reconciliation.',
      },
    });
    if (quarantined.count !== receipts.length) {
      throw new Error(
        'A legacy generic session receipt changed during quarantine.',
      );
    }
  }

  const firstProof = proofs[0];
  await tx.guestGameAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      profileId: event.profileId,
      guestId: event.guestId,
      storeId: firstProof.storeId,
      entityType: 'GUEST_GAME_EVENT',
      entityId: event.id,
      action: reconciliationRequired
        ? 'GENERIC_SESSION_CLASSIFICATION_QUARANTINED'
        : 'GENERIC_SESSION_CLASSIFICATION_REMEDIATED',
      status: reconciliationRequired ? 'BLOCKED' : 'COMPLETED',
      reasonCode: reconciliationRequired
        ? liveObservationAmbiguous &&
          !payloadHasMaterialization &&
          !eventHasMaterialization &&
          !hasPersistedEffects
          ? 'LEGACY_LIVE_SESSION_OBSERVATION_AMBIGUOUS'
          : 'LEGACY_GENERIC_SESSION_MATERIALIZATION'
        : 'AMBIGUOUS_EXPANDED_SESSION_FAIL_CLOSED',
      reasonText: reconciliationRequired
        ? liveObservationAmbiguous &&
          !payloadHasMaterialization &&
          !eventHasMaterialization &&
          !hasPersistedEffects
          ? 'A legacy LIVE identity was neutralized fail-closed, but its mutable session timestamp cannot prove what the request originally observed.'
          : 'A legacy typed interpretation was neutralized, while its existing effects were preserved for explicit reconciliation.'
        : 'A pristine legacy typed interpretation was neutralized because the session source proves only an ambiguous extension.',
      payload: {
        eventId: event.id,
        originKey: event.originKey,
        sessionExternalId,
        remediationStatus: status,
        receiptIds: receipts.map((receipt) => receipt.id),
        marker,
      },
    },
  });

  return { status, eventId: event.id, changed: true };
}

export function genericSessionClassificationRemediationStatus(
  payload: unknown,
): RemediationStatus | null {
  const marker = jsonRecord(
    jsonRecord(payload)[GENERIC_SESSION_CLASSIFICATION_REMEDIATION_MARKER],
  );
  const semanticClassification = jsonRecord(marker.semanticClassification);
  const status = normalizedString(marker.status);
  return numberValue(marker.schemaVersion) === 1 &&
    normalizedString(marker.kind) === 'GENERIC_SESSION_FAIL_CLOSED' &&
    semanticClassification.sessionPacket === null &&
    semanticClassification.sessionType === null &&
    remediationStatuses.includes(status as RemediationStatus)
    ? (status as RemediationStatus)
    : null;
}

export function genericSessionClassificationRemediationSql(
  payload: Prisma.Sql,
) {
  // JSON path extraction returns SQL NULL when the marker is absent. Keep the
  // predicate two-valued so callers using `NOT <predicate>` do not accidentally
  // exclude every ordinary event from a claim query (`NOT NULL` is still NULL).
  return Prisma.sql`COALESCE((
      ${payload} #>>
        '{genericSessionClassificationRemediation,schemaVersion}' = '1'
      AND ${payload} #>>
        '{genericSessionClassificationRemediation,kind}' =
        'GENERIC_SESSION_FAIL_CLOSED'
      AND ${payload} #>>
        '{genericSessionClassificationRemediation,status}' IN (
          'REMEDIATED',
          'RECONCILIATION_REQUIRED'
        )
      AND ${payload} #>
        '{genericSessionClassificationRemediation,semanticClassification,sessionPacket}' =
        'null'::jsonb
      AND ${payload} #>
        '{genericSessionClassificationRemediation,semanticClassification,sessionType}' =
        'null'::jsonb
    ), FALSE)`;
}

async function materialEffectSummary(
  tx: Prisma.TransactionClient,
  tenantId: string,
  eventId: string,
  originKey: string | null,
  sourceFactId: string | null,
  externalProvider: string | null,
  externalDomain: string | null,
  externalId: string | null,
): Promise<MaterialEffectSummary> {
  const rewardExternalPrefix = externalId ? `${externalId}:reward:` : null;
  const rows = await tx.$queryRaw<MaterialEffectSummary[]>(Prisma.sql`
    WITH bound_intents AS (
      SELECT intent."id", intent."rewardId"
      FROM "GuestGameRewardIntent" intent
      WHERE intent."tenantId" = ${tenantId}
        AND (
          intent."eventId" = ${eventId}
          ${originKey ? Prisma.sql`OR intent."originKey" = ${originKey}` : Prisma.empty}
        )
    ),
    bound_rewards AS (
      SELECT reward."id"
      FROM "GuestGameReward" reward
      WHERE reward."tenantId" = ${tenantId}
        AND (
          ${originKey ? Prisma.sql`reward."originKey" = ${originKey} OR` : Prisma.empty}
          ${
            rewardExternalPrefix && externalProvider && externalDomain
              ? Prisma.sql`(
            reward."externalProvider"::text = ${externalProvider}
            AND reward."externalDomain" = ${externalDomain}
            AND LEFT(
              reward."externalId",
              LENGTH(${rewardExternalPrefix})
            ) = ${rewardExternalPrefix}
          ) OR`
              : Prisma.empty
          }
          reward."id" IN (
            SELECT "rewardId" FROM bound_intents WHERE "rewardId" IS NOT NULL
          )
        )
    ),
    bound_entitlements AS (
      SELECT entitlement."id"
      FROM "GuestGameEntitlement" entitlement
      WHERE entitlement."tenantId" = ${tenantId}
        AND (
          entitlement."eventId" = ${eventId}
          ${originKey ? Prisma.sql`OR entitlement."originKey" = ${originKey}` : Prisma.empty}
          ${sourceFactId ? Prisma.sql`OR entitlement."sourceFactId" = ${sourceFactId}` : Prisma.empty}
          OR entitlement."rewardId" IN (SELECT "id" FROM bound_rewards)
          OR entitlement."sourceRewardId" IN (SELECT "id" FROM bound_rewards)
        )
    )
    SELECT
      (SELECT COUNT(*) FROM "GuestGameRuleDecision" decision
        WHERE decision."tenantId" = ${tenantId}
          AND (
            decision."eventId" = ${eventId}
            ${originKey ? Prisma.sql`OR decision."originKey" = ${originKey}` : Prisma.empty}
            ${sourceFactId ? Prisma.sql`OR decision."sourceFactId" = ${sourceFactId}` : Prisma.empty}
          )) AS "ruleDecisionCount",
      (SELECT COUNT(*) FROM "GuestGameXpPosting" posting
        WHERE posting."tenantId" = ${tenantId}
          AND posting."eventId" = ${eventId}) AS "xpPostingCount",
      (SELECT COUNT(*) FROM bound_intents) AS "rewardIntentCount",
      (SELECT COUNT(*) FROM bound_rewards) AS "rewardCount",
      (SELECT COUNT(*) FROM "GuestGameRewardEffect" effect
        WHERE effect."tenantId" = ${tenantId}
          AND effect."rewardId" IN (SELECT "id" FROM bound_rewards))
        AS "rewardEffectCount",
      (SELECT COUNT(*) FROM bound_entitlements) AS "entitlementCount",
      (SELECT COUNT(*) FROM "GuestGameRewardWalletItem" wallet
        WHERE wallet."tenantId" = ${tenantId}
          AND (
            wallet."eventId" = ${eventId}
            OR wallet."rewardId" IN (SELECT "id" FROM bound_rewards)
            OR wallet."entitlementId" IN (
              SELECT "id" FROM bound_entitlements
            )
          )) AS "walletCount"
  `);
  const summary = rows[0];
  if (rows.length !== 1 || !summary) {
    throw new Error('Could not verify legacy generic session effects.');
  }
  return summary;
}

function payloadMaterializationPresent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeClassificationLabel(value: unknown) {
  return normalizedString(value)?.slice(0, 80) ?? null;
}

function positiveCount(value: number | bigint) {
  return typeof value === 'bigint' ? value > 0n : value > 0;
}

function numericCount(value: number | bigint) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function isSerializationConflict(error: unknown) {
  const record = jsonRecord(error);
  const code = normalizedString(record.code);
  const message = normalizedString(record.message)?.toLowerCase() ?? '';
  return (
    code === 'P2034' ||
    message.includes('could not serialize') ||
    message.includes('serialization failure') ||
    message.includes('deadlock detected')
  );
}
