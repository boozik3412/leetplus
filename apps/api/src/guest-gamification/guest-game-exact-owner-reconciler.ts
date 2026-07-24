import {
  IntegrationProvider,
  Prisma,
  type GuestGameOriginReceipt,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildGuestGamePhysicalProgressIdentity,
  buildGuestGameOriginKey,
  canonicalGuestGameEventType,
  normalizeGuestGameExternalDomain,
} from './guest-game-origin-key';

const exactPlayTimeFactTypes = [
  'SESSION_PLAY_TIME_ACCUMULATED',
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
] as const;

const exactOperatorClaimedSources = [
  'EXACT_CANONICALIZATION',
  'EXACT_OPERATOR_CANONICALIZATION',
] as const;

export const EXACT_CANONICAL_OWNER_QUARANTINED_CODE =
  'EXACT_CANONICAL_OWNER_QUARANTINED';

type ExactPlayTimeFactType = (typeof exactPlayTimeFactTypes)[number];

type LockedCanonicalEvent = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  lootBoxId: string | null;
  missionId: string | null;
  seasonId: string | null;
  eventType: string;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  originKey: string | null;
  xpDelta: number;
  payload: Prisma.JsonValue | null;
};

type LockedExactFact = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  externalProvider: IntegrationProvider;
  externalDomain: string;
  sourceKind: string;
  sessionExternalId: string | null;
  factType: string;
  confidence: string;
  lifecycleStatus: string;
  supersededAt: Date | null;
  updatedAt: Date;
};

type LockedOriginReceipt = Pick<
  GuestGameOriginReceipt,
  | 'id'
  | 'factId'
  | 'eventId'
  | 'eventType'
  | 'externalProvider'
  | 'externalDomain'
  | 'policy'
  | 'status'
  | 'claimedSource'
>;

type MaterialEffectSummary = {
  xpPostingCount: number | bigint;
  rewardIntentCount: number | bigint;
  entitlementCount: number | bigint;
  supplementalReceiptCount: number | bigint;
  rewardCount: number | bigint;
  ruleDecisionCount: number | bigint;
};

export type ExactCanonicalOwnerReconcileInput = {
  tenantId: string;
  eventId: string;
  originKey: string;
  expectedEventType: string;
  targetProfileId: string;
  targetGuestId: string | null;
  sourceFactId: string;
  sourceFactUpdatedAt: Date;
};

export type ExactCanonicalOwnerReconcileOutcome =
  | { status: 'UNCHANGED' }
  | {
      status: 'REBOUND';
      previousProfileId: string | null;
      previousGuestId: string | null;
    }
  | {
      status: 'QUARANTINED';
      quarantineOriginKey: string;
      reasonCode: 'MATERIAL_EFFECTS_EXIST' | 'OWNER_PROVENANCE_CONFLICT';
    };

/**
 * Repairs ownership only for a pristine exact canonical play-time event.
 *
 * Exact facts may be re-normalized from a stale profile to the single active
 * profile that owns the same physical session. The event and its operator
 * receipt are rebound atomically before any mission, Battle Pass or loot-box
 * effect is allowed to materialize. Once an effect exists, ownership becomes
 * immutable and the discrepancy is durably quarantined for manual review.
 */
export async function reconcileExactCanonicalEventOwner(
  prisma: PrismaService,
  input: ExactCanonicalOwnerReconcileInput,
): Promise<ExactCanonicalOwnerReconcileOutcome> {
  if (!input.targetGuestId) {
    throw new ConflictException(
      'Exact canonical ownership cannot be changed without a trusted guest.',
    );
  }
  if (canonicalGuestGameEventType(input.expectedEventType) !== 'PLAY_HOUR') {
    throw new ConflictException(
      'Exact canonical ownership recovery is limited to play-time events.',
    );
  }

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => reconcileExactCanonicalEventOwnerInTransaction(tx, input),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isSerializationConflict(error) && attempt < maxAttempts) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Exact canonical owner reconciliation retry exhausted.');
}

export async function reconcileExactCanonicalEventOwnerInTransaction(
  tx: Prisma.TransactionClient,
  input: ExactCanonicalOwnerReconcileInput,
): Promise<ExactCanonicalOwnerReconcileOutcome> {
  const eventRows = await tx.$queryRaw<LockedCanonicalEvent[]>(Prisma.sql`
    SELECT
      "id",
      "profileId",
      "guestId",
      "lootBoxId",
      "missionId",
      "seasonId",
      "eventType",
      "externalProvider",
      "externalDomain",
      "originKey",
      "xpDelta",
      "payload"
    FROM "GuestGameEvent"
    WHERE "tenantId" = ${input.tenantId}
      AND "id" = ${input.eventId}
      AND "originKey" = ${input.originKey}
    FOR UPDATE
  `);
  const event = singleRow(
    eventRows,
    'The exact canonical event changed before ownership reconciliation.',
  );

  const sourceFactRows = await tx.$queryRaw<LockedExactFact[]>(Prisma.sql`
    SELECT
      "id",
      "profileId",
      "guestId",
      "externalProvider",
      "externalDomain",
      "sourceKind",
      "sessionExternalId",
      "factType",
      "confidence",
      "lifecycleStatus",
      "supersededAt",
      "updatedAt"
    FROM "GuestActivityFact"
    WHERE "tenantId" = ${input.tenantId}
      AND "id" = ${input.sourceFactId}
      AND "lifecycleStatus" = 'ACTIVE'
      AND "confidence" = 'EXACT'
      AND "supersededAt" IS NULL
    FOR SHARE
  `);
  const sourceFact = singleRow(
    sourceFactRows,
    'The exact source fact is no longer active and uniquely trusted.',
  );
  if (
    sourceFact.updatedAt.getTime() !== input.sourceFactUpdatedAt.getTime() ||
    sourceFact.profileId !== input.targetProfileId ||
    sourceFact.guestId !== input.targetGuestId ||
    !isExactPlayTimeFactType(sourceFact.factType) ||
    !sourceFact.sessionExternalId
  ) {
    throw new ConflictException(
      'The exact source fact identity or version changed before ownership reconciliation.',
    );
  }
  const sourceIdentity = buildGuestGamePhysicalProgressIdentity({
    externalProvider: sourceFact.externalProvider,
    externalDomain: sourceFact.externalDomain,
    sourceKind: sourceFact.sourceKind,
    sessionExternalId: sourceFact.sessionExternalId,
    eventType: sourceFact.factType,
  });
  if (!sourceIdentity) {
    throw new ConflictException(
      'The active exact fact does not identify one physical play-time session.',
    );
  }

  const activePhysicalFactCandidates = await tx.$queryRaw<LockedExactFact[]>(
    Prisma.sql`
    SELECT
      "id",
      "profileId",
      "guestId",
      "externalProvider",
      "externalDomain",
      "sourceKind",
      "sessionExternalId",
      "factType",
      "confidence",
      "lifecycleStatus",
      "supersededAt",
      "updatedAt"
    FROM "GuestActivityFact"
    WHERE "tenantId" = ${input.tenantId}
      AND "externalProvider" = ${sourceFact.externalProvider}
      AND "sessionExternalId" = ${sourceFact.sessionExternalId}
      AND "factType" IN (${Prisma.join([...exactPlayTimeFactTypes])})
      AND "lifecycleStatus" = 'ACTIVE'
      AND "confidence" = 'EXACT'
      AND "supersededAt" IS NULL
    ORDER BY "id"
    FOR SHARE
  `,
  );
  const activePhysicalFacts = activePhysicalFactCandidates.filter(
    (candidate) =>
      buildGuestGamePhysicalProgressIdentity({
        externalProvider: candidate.externalProvider,
        externalDomain: candidate.externalDomain,
        sourceKind: candidate.sourceKind,
        sessionExternalId: candidate.sessionExternalId,
        eventType: candidate.factType,
      })?.key === sourceIdentity.key,
  );
  if (
    activePhysicalFacts.length !== 1 ||
    activePhysicalFacts[0]?.id !== sourceFact.id
  ) {
    throw new ConflictException(
      'The physical session does not have a single active exact owner.',
    );
  }

  const receiptRows = await tx.$queryRaw<LockedOriginReceipt[]>(Prisma.sql`
    SELECT
      "id",
      "factId",
      "eventId",
      "eventType",
      "externalProvider",
      "externalDomain",
      "policy",
      "status",
      "claimedSource"
    FROM "GuestGameOriginReceipt"
    WHERE "tenantId" = ${input.tenantId}
      AND "originKey" = ${input.originKey}
    FOR UPDATE
  `);
  const receipt = singleRow(
    receiptRows,
    'The exact operator receipt is missing or ambiguous.',
  );
  if (
    receipt.eventId !== event.id ||
    receipt.policy !== 'EXACT_OPERATOR_CANONICALIZATION' ||
    receipt.status !== 'PROCESSED' ||
    !exactOperatorClaimedSources.includes(
      receipt.claimedSource as (typeof exactOperatorClaimedSources)[number],
    )
  ) {
    throw new ConflictException(
      'The canonical receipt is not a completed exact operator receipt.',
    );
  }

  let provenanceConflict =
    canonicalGuestGameEventType(event.eventType) !== 'PLAY_HOUR' ||
    canonicalGuestGameEventType(receipt.eventType) !== 'PLAY_HOUR' ||
    canonicalGuestGameEventType(input.expectedEventType) !==
      canonicalGuestGameEventType(event.eventType) ||
    !sameProviderAndDomain(event, sourceFact) ||
    !sameProviderAndDomain(receipt, sourceFact);
  const receiptAlreadyTargetsSource = receipt.factId === sourceFact.id;

  if (receiptAlreadyTargetsSource) {
    provenanceConflict ||=
      (event.profileId !== null && event.profileId !== input.targetProfileId) ||
      (event.guestId !== null && event.guestId !== input.targetGuestId);
  } else if (!receipt.factId) {
    provenanceConflict = true;
  } else {
    const previousFactRows = await tx.$queryRaw<LockedExactFact[]>(Prisma.sql`
      SELECT
        "id",
        "profileId",
        "guestId",
        "externalProvider",
        "externalDomain",
        "sourceKind",
        "sessionExternalId",
        "factType",
        "confidence",
        "lifecycleStatus",
        "supersededAt",
        "updatedAt"
      FROM "GuestActivityFact"
      WHERE "tenantId" = ${input.tenantId}
        AND "id" = ${receipt.factId}
      FOR SHARE
    `);
    const previousFact = previousFactRows[0] ?? null;
    provenanceConflict ||=
      previousFactRows.length !== 1 ||
      !previousFact ||
      previousFact.lifecycleStatus !== 'SUPERSEDED' ||
      previousFact.supersededAt === null ||
      previousFact.confidence !== 'EXACT' ||
      !samePhysicalSession(previousFact, sourceFact) ||
      (event.profileId !== null &&
        event.profileId !== previousFact.profileId) ||
      (event.guestId !== null && event.guestId !== previousFact.guestId);
  }

  const ownerAlreadyMatches =
    event.profileId === input.targetProfileId &&
    event.guestId === input.targetGuestId;
  if (
    ownerAlreadyMatches &&
    receiptAlreadyTargetsSource &&
    !provenanceConflict
  ) {
    return { status: 'UNCHANGED' };
  }

  const materialEffects = await materialEffectSummary(
    tx,
    input.tenantId,
    event.id,
    input.originKey,
  );
  const eventHasEffects =
    event.xpDelta !== 0 ||
    event.lootBoxId !== null ||
    event.missionId !== null ||
    event.seasonId !== null ||
    hasExactReconciliationPlan(event.payload);
  const hasMaterialEffects =
    eventHasEffects ||
    positiveCount(materialEffects.xpPostingCount) ||
    positiveCount(materialEffects.rewardIntentCount) ||
    positiveCount(materialEffects.entitlementCount) ||
    positiveCount(materialEffects.supplementalReceiptCount) ||
    positiveCount(materialEffects.rewardCount);

  if (provenanceConflict || hasMaterialEffects) {
    const reasonCode = provenanceConflict
      ? 'OWNER_PROVENANCE_CONFLICT'
      : 'MATERIAL_EFFECTS_EXIST';
    return quarantineOwnerConflict(tx, {
      input,
      event,
      sourceFact,
      receipt,
      materialEffects,
      eventHasEffects,
      reasonCode,
    });
  }

  const reboundEvent = await tx.guestGameEvent.updateMany({
    where: {
      tenantId: input.tenantId,
      id: event.id,
      originKey: input.originKey,
      profileId: event.profileId,
      guestId: event.guestId,
      eventType: event.eventType,
      externalProvider: event.externalProvider,
      externalDomain: event.externalDomain,
      xpDelta: 0,
      lootBoxId: null,
      missionId: null,
      seasonId: null,
    },
    data: {
      profileId: input.targetProfileId,
      guestId: input.targetGuestId,
    },
  });
  if (reboundEvent.count !== 1) {
    throw new ConflictException(
      'The canonical event changed during ownership reconciliation.',
    );
  }

  const reboundReceipt = await tx.guestGameOriginReceipt.updateMany({
    where: {
      id: receipt.id,
      tenantId: input.tenantId,
      originKey: input.originKey,
      factId: receipt.factId,
      eventId: event.id,
      policy: 'EXACT_OPERATOR_CANONICALIZATION',
      status: 'PROCESSED',
      claimedSource: { in: [...exactOperatorClaimedSources] },
    },
    data: { factId: sourceFact.id },
  });
  if (reboundReceipt.count !== 1) {
    throw new ConflictException(
      'The exact operator receipt changed during ownership reconciliation.',
    );
  }

  await tx.guestGameRuleDecision.updateMany({
    where: { tenantId: input.tenantId, eventId: event.id },
    data: {
      profileId: input.targetProfileId,
      guestId: input.targetGuestId,
    },
  });
  await tx.guestGameAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      profileId: input.targetProfileId,
      guestId: input.targetGuestId,
      entityType: 'GUEST_GAME_EVENT',
      entityId: event.id,
      action: 'EXACT_CANONICAL_OWNER_REBOUND',
      status: 'COMPLETED',
      reasonCode: 'ACTIVE_EXACT_FACT_REPLACED_STALE_OWNER',
      reasonText:
        'A pristine exact canonical play-time event was rebound to its single active exact owner.',
      payload: {
        eventId: event.id,
        originKey: input.originKey,
        previousFactId: receipt.factId,
        activeFactId: sourceFact.id,
        previousProfileId: event.profileId,
        targetProfileId: input.targetProfileId,
        previousGuestId: event.guestId,
        targetGuestId: input.targetGuestId,
      },
    },
  });

  return {
    status: 'REBOUND',
    previousProfileId: event.profileId,
    previousGuestId: event.guestId,
  };
}

async function materialEffectSummary(
  tx: Prisma.TransactionClient,
  tenantId: string,
  eventId: string,
  originKey: string,
): Promise<MaterialEffectSummary> {
  const rows = await tx.$queryRaw<MaterialEffectSummary[]>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "GuestGameXpPosting"
        WHERE "tenantId" = ${tenantId} AND "eventId" = ${eventId})
        AS "xpPostingCount",
      (SELECT COUNT(*) FROM "GuestGameRewardIntent"
        WHERE "tenantId" = ${tenantId}
          AND ("eventId" = ${eventId} OR "originKey" = ${originKey}))
        AS "rewardIntentCount",
      (SELECT COUNT(*) FROM "GuestGameEntitlement"
        WHERE "tenantId" = ${tenantId}
          AND ("eventId" = ${eventId} OR "originKey" = ${originKey}))
        AS "entitlementCount",
      (SELECT COUNT(*) FROM "GuestGameSupplementalFactReceipt"
        WHERE "tenantId" = ${tenantId} AND "eventId" = ${eventId})
        AS "supplementalReceiptCount",
      (SELECT COUNT(*) FROM "GuestGameReward"
        WHERE "tenantId" = ${tenantId} AND "originKey" = ${originKey})
        AS "rewardCount",
      (SELECT COUNT(*) FROM "GuestGameRuleDecision"
        WHERE "tenantId" = ${tenantId} AND "eventId" = ${eventId})
        AS "ruleDecisionCount"
  `);
  return singleRow(rows, 'Could not verify canonical event material effects.');
}

async function quarantineOwnerConflict(
  tx: Prisma.TransactionClient,
  context: {
    input: ExactCanonicalOwnerReconcileInput;
    event: LockedCanonicalEvent;
    sourceFact: LockedExactFact;
    receipt: LockedOriginReceipt;
    materialEffects: MaterialEffectSummary;
    eventHasEffects: boolean;
    reasonCode: 'MATERIAL_EFFECTS_EXIST' | 'OWNER_PROVENANCE_CONFLICT';
  },
): Promise<ExactCanonicalOwnerReconcileOutcome> {
  const {
    input,
    event,
    sourceFact,
    receipt,
    materialEffects,
    eventHasEffects,
    reasonCode,
  } = context;
  const quarantineOriginKey = buildGuestGameOriginKey({
    externalProvider: sourceFact.externalProvider,
    externalDomain: sourceFact.externalDomain,
    eventType: 'EXACT_CANONICAL_OWNER_QUARANTINE',
    stableExternalId: event.id,
  });
  if (!quarantineOriginKey) {
    throw new ConflictException(
      'Could not derive the exact owner quarantine receipt.',
    );
  }

  const existingMarker = await tx.guestGameOriginReceipt.findUnique({
    where: {
      tenantId_originKey: {
        tenantId: input.tenantId,
        originKey: quarantineOriginKey,
      },
    },
    select: {
      id: true,
      factId: true,
      eventId: true,
      policy: true,
      status: true,
    },
  });
  let markerBecameDurable = false;
  if (!existingMarker) {
    const now = new Date();
    await tx.guestGameOriginReceipt.create({
      data: {
        tenantId: input.tenantId,
        originKey: quarantineOriginKey,
        factId: sourceFact.id,
        eventId: event.id,
        eventType: 'EXACT_CANONICAL_OWNER_QUARANTINE',
        externalProvider: sourceFact.externalProvider,
        externalDomain: sourceFact.externalDomain,
        policy: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE',
        status: 'DEAD_LETTER',
        claimedSource: 'SYSTEM_OWNER_GUARD',
        ledgerFirstSeenAt: now,
        graceUntil: now,
        processedAt: now,
        attempts: 1,
        lastError:
          reasonCode === 'MATERIAL_EFFECTS_EXIST'
            ? 'Owner transfer blocked because material effects already exist.'
            : 'Owner transfer blocked because exact provenance is inconsistent.',
      },
    });
    markerBecameDurable = true;
  } else {
    if (
      existingMarker.eventId !== event.id ||
      existingMarker.policy !== 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE'
    ) {
      throw new ConflictException(
        'The exact owner quarantine key is already owned by another record.',
      );
    }
    if (existingMarker.status !== 'DEAD_LETTER') {
      const now = new Date();
      const transitioned = await tx.guestGameOriginReceipt.updateMany({
        where: {
          id: existingMarker.id,
          tenantId: input.tenantId,
          eventId: event.id,
          policy: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINE',
          status: existingMarker.status,
        },
        data: {
          factId: sourceFact.id,
          status: 'DEAD_LETTER',
          claimedSource: 'SYSTEM_OWNER_GUARD',
          claimExpiresAt: null,
          processedAt: now,
          attempts: { increment: 1 },
          lastError:
            reasonCode === 'MATERIAL_EFFECTS_EXIST'
              ? 'Owner transfer blocked because material effects already exist.'
              : 'Owner transfer blocked because exact provenance is inconsistent.',
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException(
          'The exact owner quarantine marker changed concurrently.',
        );
      }
      markerBecameDurable = true;
    }
  }
  if (markerBecameDurable) {
    await tx.guestGameAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        profileId: event.profileId,
        guestId: event.guestId,
        entityType: 'GUEST_GAME_EVENT',
        entityId: event.id,
        action: 'EXACT_CANONICAL_OWNER_TRANSFER_QUARANTINED',
        status: 'BLOCKED',
        reasonCode,
        reasonText:
          'An exact canonical ownership mismatch was quarantined without transferring prior effects.',
        payload: {
          eventId: event.id,
          originKey: input.originKey,
          canonicalReceiptId: receipt.id,
          previousFactId: receipt.factId,
          activeFactId: sourceFact.id,
          previousProfileId: event.profileId,
          targetProfileId: input.targetProfileId,
          previousGuestId: event.guestId,
          targetGuestId: input.targetGuestId,
          materialEffects: {
            event: eventHasEffects,
            xpPostings: numericCount(materialEffects.xpPostingCount),
            rewardIntents: numericCount(materialEffects.rewardIntentCount),
            entitlements: numericCount(materialEffects.entitlementCount),
            supplementalReceipts: numericCount(
              materialEffects.supplementalReceiptCount,
            ),
            rewards: numericCount(materialEffects.rewardCount),
            ruleDecisions: numericCount(materialEffects.ruleDecisionCount),
          },
        },
      },
    });
  }

  return { status: 'QUARANTINED', quarantineOriginKey, reasonCode };
}

function sameProviderAndDomain(
  left: {
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
  },
  right: {
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
  },
): boolean {
  return (
    left.externalProvider === right.externalProvider &&
    normalizeGuestGameExternalDomain(left.externalDomain) ===
      normalizeGuestGameExternalDomain(right.externalDomain)
  );
}

function samePhysicalSession(
  left: LockedExactFact,
  right: LockedExactFact,
): boolean {
  if (
    !isExactPlayTimeFactType(left.factType) ||
    !isExactPlayTimeFactType(right.factType)
  ) {
    return false;
  }
  const leftIdentity = buildGuestGamePhysicalProgressIdentity({
    externalProvider: left.externalProvider,
    externalDomain: left.externalDomain,
    sourceKind: left.sourceKind,
    sessionExternalId: left.sessionExternalId,
    eventType: left.factType,
  });
  const rightIdentity = buildGuestGamePhysicalProgressIdentity({
    externalProvider: right.externalProvider,
    externalDomain: right.externalDomain,
    sourceKind: right.sourceKind,
    sessionExternalId: right.sessionExternalId,
    eventType: right.factType,
  });
  return Boolean(
    leftIdentity && rightIdentity && leftIdentity.key === rightIdentity.key,
  );
}

function isExactPlayTimeFactType(
  value: string,
): value is ExactPlayTimeFactType {
  return exactPlayTimeFactTypes.includes(value as ExactPlayTimeFactType);
}

function singleRow<T>(rows: T[], message: string): T {
  if (rows.length !== 1 || !rows[0]) {
    throw new ConflictException(message);
  }
  return rows[0];
}

function positiveCount(value: number | bigint): boolean {
  return numericCount(value) > 0;
}

function numericCount(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function hasExactReconciliationPlan(payload: Prisma.JsonValue | null): boolean {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'exactReconciliationPlan' in payload
  );
}

function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2034' || code === '40001' || code === '40P01';
}
