import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IntegrationProvider, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { hasSessionFactsPendingHourlyReplay } from './guest-activity-hourly-replay';
import {
  buildGuestGamePhysicalProgressIdentity,
  buildGuestGamePhysicalSessionStartIdentity,
  buildGuestGameOriginKey,
  buildGuestGamePlayTimeOriginKey,
  canonicalGuestGameEventType,
  normalizeGuestGameExternalDomain,
  normalizeGuestGameSourceKind,
} from './guest-game-origin-key';
import {
  GuestGamificationService,
  type GuestGameDryRunRule,
  type GuestGameProcessEventDto,
} from './guest-gamification.service';
import {
  guestGameBattlePassStepEvaluationPolicy,
  guestGamePolicyAllowsEvaluation,
} from './guest-game-source-policy';

const replayFactTypes = new Set([
  'SESSION_PLAY_TIME_ACCUMULATED',
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
]);
const replayReceiptStatuses = new Set(['PROCESSED', 'LIVE_PROCESSED']);
const canonicalizationTerminalReceiptStatuses = new Set([
  'PROCESSED',
  'LIVE_PROCESSED',
]);
const canonicalizationClaimableReceiptStatuses = new Set([
  'SHADOWED',
  'WAITING',
  'WAITING_LIVE',
  'FAILED',
]);
const canonicalizationClaimLeaseMs = 120_000;
const canonicalizationMaxAttempts = 5;
const replayIntentStatuses = new Set([
  'PENDING',
  'PROCESSING',
  'FAILED',
  'APPLIED',
]);

type PhysicalPlayTimeProcessEventDto = GuestGameProcessEventDto & {
  sourceKind: string;
  sessionExternalId: string;
};

export type GuestGameBattlePassReplayPreviewDto = {
  factId?: string | null;
  profileId?: string | null;
  seasonId?: string | null;
  stepId?: string | null;
  stepSequence?: number | string | null;
};

export type GuestGameBattlePassReplayApplyDto =
  GuestGameBattlePassReplayPreviewDto & {
    expectedFactUpdatedAt?: string | null;
    expectedSeasonUpdatedAt?: string | null;
    confirmationHash?: string | null;
    confirmation?: string | null;
  };

export type GuestGameExactPlayTimeCanonicalizationPreviewDto = {
  factId?: string | null;
  profileId?: string | null;
};

export type GuestGameExactPlayTimeCanonicalizationApplyDto =
  GuestGameExactPlayTimeCanonicalizationPreviewDto & {
    expectedFactUpdatedAt?: string | null;
    confirmationHash?: string | null;
    confirmation?: string | null;
  };

export type GuestGameLootBoxEntitlementReconciliationPreviewDto = Record<
  string,
  never
>;

export type GuestGameLootBoxEntitlementReconciliationApplyDto = {
  expectedCount?: number | string | null;
  expectedDigest?: string | null;
  confirmation?: string | null;
};

export type GuestGameLootBoxEntitlementReconciliationResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome: 'READY' | 'APPLIED' | 'IDEMPOTENT';
  count: number;
  digest: string;
  candidateIds: Array<{
    entitlementId: string;
    rewardId: string;
    ruleId: string;
  }>;
  updatedCount: number;
  note: string;
};

export type GuestGameLootBoxEntitlementOverLimitRepairPreviewDto = Record<
  string,
  never
>;

export type GuestGameLootBoxEntitlementOverLimitRepairApplyDto = {
  expectedCount?: number | string | null;
  expectedDigest?: string | null;
  confirmation?: string | null;
};

export type GuestGameLootBoxEntitlementOverLimitRepairResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome: 'READY' | 'APPLIED' | 'IDEMPOTENT';
  count: number;
  digest: string;
  candidateIds: Array<{
    entitlementId: string;
    ruleId: string;
    preservedEntitlementId: string;
  }>;
  updatedCount: number;
  note: string;
};

export type GuestGameSupportRewardRecoveryActionDto = {
  factId?: string | null;
  ruleKind?: 'LOOT_BOX' | 'MISSION' | null;
  ruleId?: string | null;
};

export type GuestGameSupportRewardRecoveryPreviewDto = {
  ticketNumber?: string | null;
  actions?: GuestGameSupportRewardRecoveryActionDto[] | null;
};

export type GuestGameSupportRewardRecoveryApplyDto =
  GuestGameSupportRewardRecoveryPreviewDto & {
    expectedActionCount?: number | string | null;
    expectedDigest?: string | null;
    allowedRuleIds?: string[] | null;
    confirmation?: string | null;
  };

export type GuestGameSupportRewardRecoveryResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome: 'READY' | 'APPLIED';
  ticket: {
    id: string;
    ticketNumber: string;
    tenantId: string;
    profileId: string;
    guestId: string;
    storeId: string;
  };
  actionCount: number;
  digest: string;
  allowedRuleIds: string[];
  expectedEffects: {
    availableLootBoxEntitlements: number;
    directBonusAmount: 0;
    battlePassRewards: 0;
    xpDelta: number;
  };
  actions: Array<{
    factId: string;
    factUpdatedAt: string;
    factType: string;
    happenedAt: string;
    sourceLocalDate: string;
    sessionExternalId: string;
    physicalSessionKey: string;
    originKey: string;
    ruleKind: 'LOOT_BOX' | 'MISSION';
    ruleId: string;
    ruleUpdatedAt: string;
    ruleName: string;
    expectedXpDelta: number;
    expectedEntitlementCount: 1;
    directBonusAmount: 0;
    eventId: string | null;
    entitlementId: string | null;
  }>;
  note: string;
};

export type GuestGameExactPlayTimeCanonicalizationResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome: 'READY' | 'BUSY' | 'BLOCKED' | 'APPLIED' | 'IDEMPOTENT';
  confirmationHash: string;
  expectedFactUpdatedAt: string;
  fact: {
    id: string;
    profileId: string;
    factType: string;
    happenedAt: string;
    durationMinutes: number;
    confidence: string;
  };
  canonical: {
    eventType: 'PLAY_HOUR';
    originKey: string;
    stableExternalId: string;
    eventId: string | null;
    eventValidated: boolean;
  };
  receipt: {
    id: string | null;
    status: string | null;
    attempts: number;
    claimExpiresAt: string | null;
  };
  safety: {
    xpDelta: 0;
    allowedRuleIds: [];
    materializeRewards: false;
  };
  note: string;
};

export type GuestGameBattlePassReplayResult = {
  mode: 'PREVIEW' | 'APPLY';
  outcome:
    | 'READY'
    | 'BLOCKED'
    | 'UNSUPPORTED'
    | 'QUEUED'
    | 'APPLIED'
    | 'IDEMPOTENT';
  confirmationHash: string;
  expectedFactUpdatedAt: string;
  expectedSeasonUpdatedAt: string;
  fact: {
    id: string;
    factType: string;
    happenedAt: string;
    durationMinutes: number;
    confidence: string;
  };
  target: {
    seasonId: string;
    seasonName: string;
    stepId: string;
    stepSequence: number;
    stepTitle: string | null;
    slotKey: string;
    profileId: string;
  };
  source: {
    originKey: string;
    eventId: string | null;
    originReceiptStatus: string | null;
  };
  decision: {
    eligible: boolean;
    status: 'MATCHED' | 'BLOCKED';
    rewardType: string | null;
    rewardAmount: number | null;
    rewardLabel: string | null;
    selectedRewardLabel: string | null;
    manualApprovalRequired: boolean;
    xpDelta: number;
    reasons: string[];
    blockers: string[];
    progress: unknown;
  };
  intent: {
    id: string;
    status: string;
    eventId: string;
    rewardId: string | null;
  } | null;
  createdRewards: number;
  rewardIds: string[];
  note: string;
};

type PreparedReplay = {
  tenantId: string;
  fact: {
    id: string;
    profileId: string;
    guestId: string | null;
    storeId: string | null;
    factType: string;
    happenedAt: Date;
    durationMinutes: number;
    confidence: string;
    externalProvider: string;
    externalDomain: string;
    sourceKind: string;
    sessionExternalId: string;
    stableExternalId: string;
    updatedAt: Date;
  };
  season: {
    id: string;
    name: string;
    updatedAt: Date;
  };
  step: {
    id: string;
    sequence: number;
    title: string | null;
  };
  rule: GuestGameDryRunRule;
  processDto: PhysicalPlayTimeProcessEventDto;
  ruleDomainTimeZones: ReadonlyMap<string, ReadonlyMap<string, string | null>>;
  ruleExternalDomains: ReadonlyMap<string, readonly string[]>;
  originKey: string;
  eventId: string | null;
  originReceiptStatus: string | null;
  slotKey: string;
  claimKey: string;
  confirmationHash: string;
  existingIntent: {
    id: string;
    eventId: string;
    profileId: string | null;
    rewardId: string | null;
    originKey: string | null;
    ruleType: string;
    ruleId: string;
    effectKind: string;
    slotKey: string;
    claimKey: string | null;
    status: string;
    plan: Prisma.JsonValue;
    event: {
      profileId: string | null;
      eventType: string;
    };
    reward: {
      tenantId: string;
      profileId: string | null;
      seasonId: string | null;
      rewardType: string;
      rewardAmount: Prisma.Decimal;
      rewardLabel: string;
    } | null;
  } | null;
};

type ExactCanonicalEventRow = {
  id: string;
  profileId: string | null;
  guestId: string | null;
  eventType: string;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalId: string | null;
  originKey: string | null;
  xpDelta: number;
  occurredAt: Date;
  payload: Prisma.JsonValue | null;
};

type ExactCanonicalReceiptRow = {
  id: string;
  factId: string | null;
  eventId: string | null;
  eventType: string;
  externalProvider: IntegrationProvider;
  externalDomain: string;
  status: string;
  claimedSource: string | null;
  attempts: number;
  claimExpiresAt: Date | null;
  updatedAt: Date;
};

type ExactCanonicalReceiptBinding = {
  originKey: string;
  receipt: ExactCanonicalReceiptRow;
};

type ExactPlayTimeOriginKeys = {
  canonical: string;
  legacy: string;
  all: string[];
};

type ReplayOriginReceiptRow = {
  factId: string | null;
  eventId: string | null;
  eventType: string;
  status: string;
};

type ReplayOriginReceiptBinding = {
  originKey: string;
  receipt: ReplayOriginReceiptRow;
};

type PreparedExactCanonicalization = {
  tenantId: string;
  fact: {
    id: string;
    profileId: string;
    guestId: string | null;
    profileGuestId: string | null;
    storeId: string | null;
    factType: string;
    happenedAt: Date;
    durationMinutes: number;
    confidence: string;
    externalProvider: IntegrationProvider;
    externalDomain: string;
    externalGuestId: string;
    profileGuestExternalProvider: IntegrationProvider | null;
    profileGuestExternalDomain: string | null;
    profileGuestExternalId: string | null;
    sourceKind: string;
    sourceHash: string;
    sourceExternalId: string | null;
    sessionExternalId: string;
    stableExternalId: string;
    updatedAt: Date;
  };
  processDto: PhysicalPlayTimeProcessEventDto;
  originKey: string;
  externalEventId: string;
  expectedSessionType: 'HOURLY' | 'PACKAGE_OR_SUBSCRIPTION' | null;
  receipt: ExactCanonicalReceiptRow | null;
  event: ExactCanonicalEventRow | null;
  confirmationHash: string;
};

type PreparedSupportRewardRecoveryAction = {
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>> & {
    happenedAt: Date;
    profileId: string;
    guestId: string;
    storeId: string;
    sessionExternalId: string;
    sourceLocalDate: string;
  };
  rule: GuestGameDryRunRule & {
    kind: 'LOOT_BOX' | 'MISSION';
    ruleUpdatedAt: string;
  };
  processDto: GuestGameProcessEventDto;
  originKey: string;
  physicalSessionKey: string;
  expectedXpDelta: number;
  dependency: {
    kind: 'LOOT_BOX';
    id: string;
    updatedAt: Date;
  } | null;
  existingEffect: {
    eventId: string;
    entitlementId: string;
  } | null;
};

type PreparedSupportRewardRecovery = {
  ticket: {
    id: string;
    ticketNumber: string;
    tenantId: string;
    profileId: string;
    guestId: string;
    storeId: string;
  };
  authority: {
    ticketId: string;
    ticketNumber: string;
    ticketStatus: 'NEW' | 'IN_PROGRESS';
    gameActivatedAt: Date;
    storeTimeZone: string;
  };
  actions: PreparedSupportRewardRecoveryAction[];
  digest: string;
  allowedRuleIds: string[];
};

type PreparedSupportRewardRecoveryExactScope = {
  sourceFactId: string;
  sourceFactUpdatedAt: Date;
  physicalSessionKey: string;
  supportRecoveryAuthority: PreparedSupportRewardRecovery['authority'];
  rules: Array<{
    ruleKind: 'LOOT_BOX' | 'MISSION';
    ruleId: string;
    battlePassStep: null;
    ruleUpdatedAt: Date;
  }>;
};

type ExactEntitlementReconciliationCandidateRow = {
  entitlementId: string;
  rewardId: string;
  ruleId: string;
  profileId: string;
  guestId: string | null;
  storeId: string | null;
  rewardQualifiedAt: Date;
};

type ExactEntitlementReconciliationCandidateId = Pick<
  ExactEntitlementReconciliationCandidateRow,
  'entitlementId' | 'rewardId' | 'ruleId'
>;

type LootBoxEntitlementLimitRow = {
  entitlementId: string;
  ruleId: string;
  profileId: string;
  guestId: string | null;
  storeId: string | null;
  status: string;
  qualifiedAt: Date;
};

type LootBoxEntitlementOverLimitCandidate = LootBoxEntitlementLimitRow & {
  preservedEntitlementId: string;
};

type LootBoxEntitlementOverLimitCandidateId = Pick<
  LootBoxEntitlementOverLimitCandidate,
  'entitlementId' | 'ruleId' | 'preservedEntitlementId'
>;

@Injectable()
export class GuestGameRuleReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GuestGamificationService,
  ) {}

  async previewLootBoxEntitlementReconciliation(
    user: AuthenticatedUser,
    _dto: GuestGameLootBoxEntitlementReconciliationPreviewDto = {},
  ): Promise<GuestGameLootBoxEntitlementReconciliationResult> {
    void _dto;
    const candidates = await this.findExactEntitlementReconciliationCandidates(
      this.prisma,
      user.tenantId,
    );
    const candidateIds = exactEntitlementReconciliationCandidateIds(candidates);

    return {
      mode: 'PREVIEW',
      outcome: 'READY',
      count: candidateIds.length,
      digest: exactEntitlementReconciliationDigest(candidateIds),
      candidateIds,
      updatedCount: 0,
      note: 'Preview is read-only. Only one-to-one legacy guest loot-box opens inside an entitlement qualification window are included.',
    };
  }

  async applyLootBoxEntitlementReconciliation(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxEntitlementReconciliationApplyDto,
  ): Promise<GuestGameLootBoxEntitlementReconciliationResult> {
    const expectedCount = nonNegativeInteger(dto.expectedCount);
    const expectedDigest = normalizedString(dto.expectedDigest)?.toLowerCase();
    if (expectedCount === null) {
      throw new BadRequestException(
        'For apply pass the non-negative integer expectedCount from preview.',
      );
    }
    if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new BadRequestException(
        'For apply pass the expectedDigest SHA-256 value from preview.',
      );
    }
    if (
      normalizedString(dto.confirmation) !==
      'APPLY_LOOT_BOX_ENTITLEMENT_RECONCILIATION'
    ) {
      throw new BadRequestException(
        'For apply pass confirmation=APPLY_LOOT_BOX_ENTITLEMENT_RECONCILIATION.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Lock the rows that form both sides of the reconciliation window. The
        // SERIALIZABLE transaction also fails closed if a concurrent insert
        // changes the candidate predicate before commit.
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT e."id"
          FROM "GuestGameEntitlement" e
          WHERE e."tenantId" = ${user.tenantId}
            AND e."ruleType" = 'LOOT_BOX'
          ORDER BY e."id"
          FOR UPDATE
        `);
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT r."id"
          FROM "GuestGameReward" r
          WHERE r."tenantId" = ${user.tenantId}
            AND r."source" = 'API_IMPORT'
            AND r."evidence"->>'sourceFactKind' = 'GUEST_LOOT_BOX_OPEN'
          ORDER BY r."id"
          FOR UPDATE
        `);

        const candidates =
          await this.findExactEntitlementReconciliationCandidates(
            tx,
            user.tenantId,
          );
        const candidateIds =
          exactEntitlementReconciliationCandidateIds(candidates);
        const digest = exactEntitlementReconciliationDigest(candidateIds);
        if (
          candidateIds.length !== expectedCount ||
          digest !== expectedDigest
        ) {
          throw new ConflictException(
            'The reconciliation candidate set changed after preview. Run preview again and confirm the new count and digest.',
          );
        }

        const reconciledAt = new Date();
        let updatedCount = 0;
        for (const candidate of candidates) {
          const updated = await tx.$executeRaw(Prisma.sql`
            UPDATE "GuestGameEntitlement" e
            SET "status" = 'CONSUMED',
                "consumedAt" = ${candidate.rewardQualifiedAt},
                "rewardId" = ${candidate.rewardId},
                "updatedAt" = ${reconciledAt},
                "evidence" = COALESCE(e."evidence", '{}'::jsonb) ||
                  jsonb_build_object(
                    'reconciliation',
                    jsonb_build_object(
                      'kind', 'OFF_TO_PRIMARY_EXACT_REWARD_BINDING_V1',
                      'reconciledAt', ${reconciledAt.toISOString()},
                      'actorUserId', ${user.id},
                      'rewardId', ${candidate.rewardId},
                      'candidateDigest', ${digest}
                    )
                  )
            WHERE e."id" = ${candidate.entitlementId}
              AND e."tenantId" = ${user.tenantId}
              AND e."ruleType" = 'LOOT_BOX'
              AND e."ruleId" = ${candidate.ruleId}
              AND e."profileId" = ${candidate.profileId}
              AND e."status" = 'AVAILABLE'
              AND e."consumedAt" IS NULL
              AND e."canceledAt" IS NULL
              AND (
                e."rewardId" IS NULL
                OR (
                  e."sourceRewardId" IS NOT NULL
                  AND e."rewardId" = e."sourceRewardId"
                )
              )
              AND EXISTS (
                SELECT 1
                FROM "GuestGameReward" r
                WHERE r."id" = ${candidate.rewardId}
                  AND r."tenantId" = e."tenantId"
                  AND r."profileId" = e."profileId"
                  AND r."lootBoxId" = e."ruleId"
                  AND (e."storeId" IS NULL OR r."storeId" = e."storeId")
                  AND r."status" IN ('PENDING', 'APPROVED', 'PAID')
                  AND r."source" = 'API_IMPORT'
                  AND r."evidence"->>'sourceFactKind' = 'GUEST_LOOT_BOX_OPEN'
                  AND r."evidence"->>'eventType' = e."sourceEventType"
                  AND r."evidence"->'rule'->>'id' = e."ruleId"
                  AND r."evidence"->'rule'->>'kind' = 'LOOT_BOX'
                  AND r."evidence"->>'occurredAt' =
                    to_char(
                      e."qualifiedAt",
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    )
              )
          `);
          if (updated !== 1) {
            throw new ConflictException(
              'An entitlement or reward changed during reconciliation. No changes were committed.',
            );
          }

          await tx.guestGameAuditEvent.create({
            data: {
              tenantId: user.tenantId,
              profileId: candidate.profileId,
              guestId: candidate.guestId,
              storeId: candidate.storeId,
              entityType: 'LOOT_BOX_ENTITLEMENT',
              entityId: candidate.entitlementId,
              action: 'LOOT_BOX_ENTITLEMENT_RECONCILED',
              status: 'PROCESSED',
              reasonCode: 'OFF_TO_PRIMARY_EXACT_REWARD_BINDING_V1',
              reasonText:
                'An exact historical guest loot-box open was bound to its previously unconsumed entitlement before read-mode promotion.',
              payload: {
                actorUserId: user.id,
                entitlementId: candidate.entitlementId,
                rewardId: candidate.rewardId,
                ruleId: candidate.ruleId,
                candidateDigest: digest,
                reconciledAt: reconciledAt.toISOString(),
              },
            },
          });
          updatedCount += 1;
        }

        return {
          mode: 'APPLY' as const,
          outcome:
            updatedCount === 0 ? ('IDEMPOTENT' as const) : ('APPLIED' as const),
          count: candidateIds.length,
          digest,
          candidateIds,
          updatedCount,
          note:
            updatedCount === 0
              ? 'No exact historical entitlement bindings remain.'
              : 'Exact historical guest loot-box opens were bound atomically. Re-run preview; it must return zero candidates before read-mode promotion.',
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async previewLootBoxEntitlementOverLimitRepair(
    user: AuthenticatedUser,
    _dto: GuestGameLootBoxEntitlementOverLimitRepairPreviewDto = {},
  ): Promise<GuestGameLootBoxEntitlementOverLimitRepairResult> {
    void _dto;
    const candidates = await this.findLootBoxEntitlementOverLimitCandidates(
      this.prisma,
      user.tenantId,
    );
    const candidateIds = lootBoxEntitlementOverLimitCandidateIds(candidates);

    return {
      mode: 'PREVIEW',
      outcome: 'READY',
      count: candidateIds.length,
      digest: lootBoxEntitlementOverLimitDigest(candidateIds),
      candidateIds,
      updatedCount: 0,
      note: 'Preview is read-only. It keeps the earliest accepted entitlement in each rolling seven-day sequence and selects only later AVAILABLE excess entitlements for cancellation.',
    };
  }

  async applyLootBoxEntitlementOverLimitRepair(
    user: AuthenticatedUser,
    dto: GuestGameLootBoxEntitlementOverLimitRepairApplyDto,
  ): Promise<GuestGameLootBoxEntitlementOverLimitRepairResult> {
    const expectedCount = nonNegativeInteger(dto.expectedCount);
    const expectedDigest = normalizedString(dto.expectedDigest)?.toLowerCase();
    if (expectedCount === null) {
      throw new BadRequestException(
        'For apply pass the non-negative integer expectedCount from preview.',
      );
    }
    if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new BadRequestException(
        'For apply pass the expectedDigest SHA-256 value from preview.',
      );
    }
    if (
      normalizedString(dto.confirmation) !==
      'APPLY_LOOT_BOX_ENTITLEMENT_OVER_LIMIT_REPAIR'
    ) {
      throw new BadRequestException(
        'For apply pass confirmation=APPLY_LOOT_BOX_ENTITLEMENT_OVER_LIMIT_REPAIR.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Lock configuration first and entitlements second in stable ID order.
        // The transaction contains no external work and stays intentionally
        // short, so production issuance is blocked only for the update itself.
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT l."id"
          FROM "GuestGameLootBox" l
          WHERE l."tenantId" = ${user.tenantId}
            AND l."status" = 'ACTIVE'
            AND l."usageKind" IN ('STANDALONE', 'BOTH')
            AND l."limits"->>'perGuestPerWeek' = '1'
          ORDER BY l."id"
          FOR UPDATE
        `);
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT e."id"
          FROM "GuestGameEntitlement" e
          INNER JOIN "GuestGameLootBox" l
            ON l."tenantId" = e."tenantId"
           AND l."id" = e."ruleId"
          WHERE e."tenantId" = ${user.tenantId}
            AND e."ruleType" = 'LOOT_BOX'
            AND e."profileId" IS NOT NULL
            AND (
              (
                e."status" = 'AVAILABLE'
                AND e."consumedAt" IS NULL
                AND (
                  e."rewardId" IS NULL
                  OR (
                    e."sourceRewardId" IS NOT NULL
                    AND e."rewardId" = e."sourceRewardId"
                  )
                )
              )
              OR e."status" = 'CONSUMED'
            )
            AND e."canceledAt" IS NULL
            AND l."status" = 'ACTIVE'
            AND l."usageKind" IN ('STANDALONE', 'BOTH')
            AND l."limits"->>'perGuestPerWeek' = '1'
          ORDER BY e."id"
          FOR UPDATE OF e
        `);

        const candidates = await this.findLootBoxEntitlementOverLimitCandidates(
          tx,
          user.tenantId,
        );
        const candidateIds =
          lootBoxEntitlementOverLimitCandidateIds(candidates);
        const digest = lootBoxEntitlementOverLimitDigest(candidateIds);
        if (
          candidateIds.length !== expectedCount ||
          digest !== expectedDigest
        ) {
          throw new ConflictException(
            'The over-limit candidate set changed after preview. Run preview again and confirm the new count and digest.',
          );
        }

        if (candidates.length === 0) {
          return {
            mode: 'APPLY' as const,
            outcome: 'IDEMPOTENT' as const,
            count: 0,
            digest,
            candidateIds,
            updatedCount: 0,
            note: 'No rolling seven-day AVAILABLE excess entitlements remain.',
          };
        }

        const canceledAt = new Date();
        const candidateEntitlementIds = candidates.map(
          (candidate) => candidate.entitlementId,
        );
        const updatedRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            UPDATE "GuestGameEntitlement" e
            SET "status" = 'CANCELED',
                "canceledAt" = ${canceledAt},
                "updatedAt" = ${canceledAt},
                "evidence" = COALESCE(e."evidence", '{}'::jsonb) ||
                  jsonb_build_object(
                    'overLimitRepair',
                    jsonb_build_object(
                      'kind', 'ROLLING_7_DAY_GREEDY_REPAIR_V1',
                      'canceledAt', ${canceledAt.toISOString()},
                      'actorUserId', ${user.id},
                      'candidateDigest', ${digest}
                    )
                  )
            WHERE e."tenantId" = ${user.tenantId}
              AND e."id" IN (${Prisma.join(candidateEntitlementIds)})
              AND e."ruleType" = 'LOOT_BOX'
              AND e."status" = 'AVAILABLE'
              AND e."consumedAt" IS NULL
              AND e."canceledAt" IS NULL
              AND (
                e."rewardId" IS NULL
                OR (
                  e."sourceRewardId" IS NOT NULL
                  AND e."rewardId" = e."sourceRewardId"
                )
              )
            RETURNING e."id"
          `,
        );
        if (updatedRows.length !== candidates.length) {
          throw new ConflictException(
            'An entitlement changed during the over-limit repair. No changes were committed.',
          );
        }

        await tx.guestGameAuditEvent.createMany({
          data: candidates.map((candidate) => ({
            tenantId: user.tenantId,
            profileId: candidate.profileId,
            guestId: candidate.guestId,
            storeId: candidate.storeId,
            entityType: 'LOOT_BOX_ENTITLEMENT',
            entityId: candidate.entitlementId,
            action: 'LOOT_BOX_ENTITLEMENT_OVER_LIMIT_CANCELED',
            status: 'PROCESSED',
            reasonCode: 'ROLLING_7_DAY_GREEDY_REPAIR_V1',
            reasonText:
              'A later AVAILABLE entitlement inside the protected rolling seven-day window was canceled before entitlement read-mode promotion.',
            payload: {
              actorUserId: user.id,
              entitlementId: candidate.entitlementId,
              preservedEntitlementId: candidate.preservedEntitlementId,
              ruleId: candidate.ruleId,
              candidateDigest: digest,
              canceledAt: canceledAt.toISOString(),
            },
          })),
        });

        return {
          mode: 'APPLY' as const,
          outcome: 'APPLIED' as const,
          count: candidateIds.length,
          digest,
          candidateIds,
          updatedCount: updatedRows.length,
          note: 'Rolling seven-day AVAILABLE excess entitlements were canceled atomically. CONSUMED entitlements were never changed. Re-run preview; it must return zero candidates before read-mode promotion.',
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async previewExactPlayTimeCanonicalization(
    user: AuthenticatedUser,
    dto: GuestGameExactPlayTimeCanonicalizationPreviewDto,
  ): Promise<GuestGameExactPlayTimeCanonicalizationResult> {
    const prepared = await this.prepareExactCanonicalization(user, dto);
    const outcome = exactCanonicalizationPreviewOutcome(prepared);
    return this.exactCanonicalizationResult(
      prepared,
      'PREVIEW',
      outcome,
      outcome === 'IDEMPOTENT'
        ? 'The exact fact already owns a validated canonical PLAY_HOUR event.'
        : outcome === 'BUSY'
          ? 'Another worker currently owns the unexpired receipt lease.'
          : outcome === 'BLOCKED'
            ? 'The receipt is not safely claimable and requires operator review.'
            : 'Preview is read-only. Apply will recheck the fact version, claim the receipt and create only the canonical event.',
    );
  }

  async applyExactPlayTimeCanonicalization(
    user: AuthenticatedUser,
    dto: GuestGameExactPlayTimeCanonicalizationApplyDto,
  ): Promise<GuestGameExactPlayTimeCanonicalizationResult> {
    const prepared = await this.prepareExactCanonicalization(user, dto);
    this.assertExpectedVersion(
      dto.expectedFactUpdatedAt,
      prepared.fact.updatedAt,
      'GuestActivityFact',
    );
    if (normalizedString(dto.confirmation) !== 'APPLY_EXACT_CANONICALIZATION') {
      throw new BadRequestException(
        'For apply pass confirmation=APPLY_EXACT_CANONICALIZATION.',
      );
    }
    if (normalizedString(dto.confirmationHash) !== prepared.confirmationHash) {
      throw new ConflictException(
        'The canonicalization preview changed. Run preview again and confirm the new hash.',
      );
    }

    const previewOutcome = exactCanonicalizationPreviewOutcome(prepared);
    if (previewOutcome === 'IDEMPOTENT') {
      return this.exactCanonicalizationResult(
        prepared,
        'APPLY',
        'IDEMPOTENT',
        'The receipt and canonical event were already finalized for this exact fact.',
      );
    }
    if (previewOutcome === 'BUSY') {
      throw new ConflictException(
        'The receipt is currently leased by another worker.',
      );
    }
    if (previewOutcome === 'BLOCKED') {
      throw new ConflictException(
        'The receipt cannot be claimed safely in its current state.',
      );
    }

    const receipt = await this.ensureExactCanonicalizationReceipt(prepared);
    this.assertExactReceiptBinding(prepared, receipt);
    if (canonicalizationTerminalReceiptStatuses.has(receipt.status)) {
      const finalized = await this.prepareExactCanonicalization(user, dto);
      if (exactCanonicalizationPreviewOutcome(finalized) !== 'IDEMPOTENT') {
        throw new ConflictException(
          'The terminal receipt does not resolve to the validated canonical event.',
        );
      }
      return this.exactCanonicalizationResult(
        finalized,
        'APPLY',
        'IDEMPOTENT',
        'A concurrent worker already finalized this exact fact.',
      );
    }

    const claimStartedAt = new Date();
    const claimAttempt = receipt.attempts + 1;
    const claim = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: receipt.id,
        tenantId: prepared.tenantId,
        factId: prepared.fact.id,
        attempts: {
          equals: receipt.attempts,
          lt: canonicalizationMaxAttempts,
        },
        OR: [
          { status: { in: [...canonicalizationClaimableReceiptStatuses] } },
          {
            status: 'PROCESSING',
            claimExpiresAt: { lte: claimStartedAt },
          },
          { status: 'PROCESSING', claimExpiresAt: null },
        ],
      },
      data: {
        status: 'PROCESSING',
        claimedSource: 'EXACT_CANONICALIZATION',
        attempts: { increment: 1 },
        claimExpiresAt: new Date(
          claimStartedAt.getTime() + canonicalizationClaimLeaseMs,
        ),
        lastError: null,
      },
    });
    if (claim.count !== 1) {
      throw new ConflictException(
        'The receipt claim was lost to another worker. Run preview again.',
      );
    }

    try {
      await this.assertExactFactStillMatchesAfterClaim(prepared);
      const processed = await this.gamification.processEvent(
        user,
        { ...prepared.processDto, activeRulesOnly: true },
        {
          allowedRuleIds: [],
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          evaluatorVersion: 'exact-canonicalization-v1',
          materializeRewards: false,
          originKey: prepared.originKey,
          suppressLedgerShadow: true,
        },
      );
      if (
        processed.summary.appliedXpDelta !== 0 ||
        processed.summary.createdRewards !== 0 ||
        processed.rewards.length !== 0
      ) {
        throw new ConflictException(
          'Exact canonicalization produced an unexpected XP or reward side effect.',
        );
      }

      const event = await this.reconcileAndValidateExactCanonicalEvent(
        prepared,
        processed.event.id,
      );
      await this.assertExactCanonicalEventPristine(prepared, event);
      const finalizedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.guestGameOriginReceipt.updateMany({
          where: {
            id: receipt.id,
            tenantId: prepared.tenantId,
            factId: prepared.fact.id,
            status: 'PROCESSING',
            attempts: claimAttempt,
            claimedSource: 'EXACT_CANONICALIZATION',
          },
          data: {
            status: 'PROCESSED',
            eventId: event.id,
            claimExpiresAt: null,
            processedAt: finalizedAt,
            lastError: null,
          },
        });
        if (finalized.count !== 1) {
          throw new ConflictException(
            'The receipt lease changed before finalization.',
          );
        }
        await tx.guestGameAuditEvent.create({
          data: {
            tenantId: prepared.tenantId,
            profileId: prepared.fact.profileId,
            guestId: prepared.fact.guestId,
            storeId: prepared.fact.storeId,
            entityType: 'GUEST_GAME_EVENT',
            entityId: event.id,
            action: 'EXACT_FACT_CANONICALIZED',
            status: 'PROCESSED',
            reasonCode: 'PLAY_TIME_EXACT_CANONICALIZATION',
            reasonText:
              'An operator-confirmed exact play-time fact was canonicalized without rule or reward materialization.',
            payload: {
              actorUserId: user.id,
              sourceFactId: prepared.fact.id,
              factType: prepared.fact.factType,
              eventType: 'PLAY_HOUR',
              eventId: event.id,
              originKey: prepared.originKey,
              happenedAt: prepared.fact.happenedAt.toISOString(),
              durationMinutes: prepared.fact.durationMinutes,
              attempt: claimAttempt,
              idempotentEvent: processed.summary.idempotent,
              confirmationHash: prepared.confirmationHash,
            },
          },
        });
      });

      const completed: PreparedExactCanonicalization = {
        ...prepared,
        event,
        receipt: {
          ...receipt,
          eventId: event.id,
          status: 'PROCESSED',
          claimedSource: 'EXACT_CANONICALIZATION',
          attempts: claimAttempt,
          claimExpiresAt: null,
          updatedAt: finalizedAt,
        },
      };
      return this.exactCanonicalizationResult(
        completed,
        'APPLY',
        processed.summary.idempotent ? 'IDEMPOTENT' : 'APPLIED',
        processed.summary.idempotent
          ? 'An existing exact canonical event was validated and the receipt was finalized.'
          : 'Exactly one PLAY_HOUR event was created with XP=0 and no rule or reward materialization.',
      );
    } catch (error) {
      await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          tenantId: prepared.tenantId,
          factId: prepared.fact.id,
          status: 'PROCESSING',
          attempts: claimAttempt,
          claimedSource: 'EXACT_CANONICALIZATION',
        },
        data: {
          status: 'FAILED',
          claimExpiresAt: null,
          lastError: safeCanonicalizationError(error).slice(0, 500),
        },
      });
      throw error;
    }
  }

  async previewSupportRewardRecovery(
    user: AuthenticatedUser,
    dto: GuestGameSupportRewardRecoveryPreviewDto,
  ): Promise<GuestGameSupportRewardRecoveryResult> {
    const prepared = await this.prepareSupportRewardRecovery(user, dto);
    return this.supportRewardRecoveryResult(
      prepared,
      'PREVIEW',
      'READY',
      prepared.actions.map(
        (action) =>
          action.existingEffect ?? { eventId: null, entitlementId: null },
      ),
      prepared.actions.some((action) => action.existingEffect)
        ? 'Preview is read-only. Previously materialized exact actions will only have their missing support audit finalized; their rules will not run again.'
        : 'Preview is read-only. Apply is limited to the exact facts and rules in this digest and creates case entitlements only.',
    );
  }

  async applySupportRewardRecovery(
    user: AuthenticatedUser,
    dto: GuestGameSupportRewardRecoveryApplyDto,
  ): Promise<GuestGameSupportRewardRecoveryResult> {
    const prepared = await this.prepareSupportRewardRecovery(user, dto);
    const expectedActionCount = nonNegativeInteger(dto.expectedActionCount);
    const expectedDigest = normalizedString(dto.expectedDigest)?.toLowerCase();
    const allowedRuleIds = uniqueSortedIds(dto.allowedRuleIds);
    if (expectedActionCount === null) {
      throw new BadRequestException(
        'For apply pass the non-negative expectedActionCount from preview.',
      );
    }
    if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new BadRequestException(
        'For apply pass the expectedDigest SHA-256 value from preview.',
      );
    }
    if (
      normalizedString(dto.confirmation) !== 'APPLY_SUPPORT_REWARD_RECOVERY'
    ) {
      throw new BadRequestException(
        'For apply pass confirmation=APPLY_SUPPORT_REWARD_RECOVERY.',
      );
    }
    if (
      expectedActionCount !== prepared.actions.length ||
      expectedDigest !== prepared.digest ||
      !sameStringArray(allowedRuleIds, prepared.allowedRuleIds)
    ) {
      throw new ConflictException(
        'The support recovery plan changed after preview. Run preview again and confirm its exact action count, digest and rule allowlist.',
      );
    }

    const applied: Array<{ eventId: string; entitlementId: string }> = [];
    for (const action of prepared.actions) {
      if (action.existingEffect) {
        const postcondition = await this.assertSupportRecoveryPostcondition(
          user,
          action,
          action.existingEffect.eventId,
        );
        if (
          postcondition.entitlementId !== action.existingEffect.entitlementId
        ) {
          throw new ConflictException(
            'The previously materialized support recovery effect changed after preview.',
          );
        }
        applied.push(action.existingEffect);
        continue;
      }
      const exactScope: PreparedSupportRewardRecoveryExactScope = {
        sourceFactId: action.fact.id,
        sourceFactUpdatedAt: action.fact.updatedAt,
        physicalSessionKey: action.physicalSessionKey,
        supportRecoveryAuthority: prepared.authority,
        rules: [
          {
            ruleKind: action.rule.kind,
            ruleId: action.rule.id,
            battlePassStep: null,
            ruleUpdatedAt: new Date(action.rule.ruleUpdatedAt),
          },
        ],
      };
      const eventId = await this.ensureSupportRecoveryCanonicalEvent(
        user,
        prepared,
        action,
        exactScope,
      );
      const processed = await this.gamification.processEvent(
        user,
        action.processDto,
        {
          allowedRuleIds: [action.rule.id],
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          evaluatorVersion: 'support-reward-recovery-v1',
          originKey: action.originKey,
          exactReconciliationScope: exactScope,
          suppressLedgerShadow: true,
        },
      );
      if (
        processed.event.id !== eventId ||
        processed.summary.idempotent !== true ||
        processed.summary.appliedXpDelta !== action.expectedXpDelta ||
        processed.summary.queuedRewardAmount !== 0
      ) {
        throw new ConflictException(
          'Support recovery produced an effect outside the confirmed action plan.',
        );
      }
      const postcondition = await this.assertSupportRecoveryPostcondition(
        user,
        action,
        eventId,
      );
      const beforeReplay = await this.supportRecoveryEffectSnapshot(
        user.tenantId,
        action,
        eventId,
      );
      const replay = await this.gamification.processEvent(
        user,
        action.processDto,
        {
          allowedRuleIds: [action.rule.id],
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          evaluatorVersion: 'support-reward-recovery-v1',
          originKey: action.originKey,
          exactReconciliationScope: exactScope,
          suppressLedgerShadow: true,
        },
      );
      const afterReplay = await this.supportRecoveryEffectSnapshot(
        user.tenantId,
        action,
        eventId,
      );
      if (
        replay.event.id !== eventId ||
        replay.summary.idempotent !== true ||
        replay.summary.appliedXpDelta !== 0 ||
        replay.summary.createdRewards !== 0 ||
        sha256(beforeReplay) !== sha256(afterReplay)
      ) {
        throw new ConflictException(
          'Support recovery replay was not zero-diff.',
        );
      }
      applied.push({
        eventId,
        entitlementId: postcondition.entitlementId,
      });
    }

    await this.persistSupportRecoveryAppliedAudit(user, prepared, applied);

    return this.supportRewardRecoveryResult(
      prepared,
      'APPLY',
      'APPLIED',
      applied,
      prepared.actions.some((action) => action.existingEffect)
        ? 'The exact plan was finalized. Previously materialized actions were verified without rerunning their rules; every action has one AVAILABLE case, and direct bonuses and Battle Pass rewards remain zero.'
        : 'The exact plan was applied. Every action produced one AVAILABLE case entitlement; direct bonuses and Battle Pass rewards remained zero, and replay was zero-diff.',
    );
  }

  private async persistSupportRecoveryAppliedAudit(
    user: AuthenticatedUser,
    prepared: PreparedSupportRewardRecovery,
    applied: Array<{ eventId: string; entitlementId: string }>,
  ) {
    const eventIds = applied.map((item) => item.eventId);
    const entitlementIds = applied.map((item) => item.entitlementId);
    const traceId = `support-recovery:${sha256({
      ticketId: prepared.ticket.id,
      eventIds,
      entitlementIds,
      allowedRuleIds: prepared.allowedRuleIds,
    })}`;
    const existing = await this.prisma.guestGameAuditEvent.findFirst({
      where: {
        tenantId: user.tenantId,
        entityType: 'GUEST_SUPPORT_TICKET',
        entityId: prepared.ticket.id,
        action: 'SUPPORT_REWARD_RECOVERY_APPLIED',
        status: 'PROCESSED',
        traceId,
      },
      select: { id: true },
    });
    if (existing) return false;

    await this.prisma.guestGameAuditEvent.create({
      data: {
        tenantId: user.tenantId,
        profileId: prepared.ticket.profileId,
        guestId: prepared.ticket.guestId,
        storeId: prepared.ticket.storeId,
        entityType: 'GUEST_SUPPORT_TICKET',
        entityId: prepared.ticket.id,
        action: 'SUPPORT_REWARD_RECOVERY_APPLIED',
        status: 'PROCESSED',
        reasonCode: prepared.ticket.ticketNumber,
        reasonText:
          'An operator-confirmed exact support plan created or verified only the bounded case entitlements proved by active rules.',
        traceId,
        payload: {
          actorUserId: user.id,
          ticketNumber: prepared.ticket.ticketNumber,
          planDigest: prepared.digest,
          actionCount: prepared.actions.length,
          resumedActionCount: prepared.actions.filter(
            (action) => action.existingEffect,
          ).length,
          allowedRuleIds: prepared.allowedRuleIds,
          directBonusAmount: 0,
          battlePassRewards: 0,
          eventIds,
          entitlementIds,
        },
      },
    });
    return true;
  }

  async previewBattlePass(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayPreviewDto,
  ): Promise<GuestGameBattlePassReplayResult> {
    const prepared = await this.prepare(user, dto);
    if (prepared.existingIntent) this.assertExistingIntent(prepared);
    return this.result(
      prepared,
      'PREVIEW',
      prepared.existingIntent
        ? 'IDEMPOTENT'
        : !prepared.eventId
          ? 'UNSUPPORTED'
          : prepared.rule.eligible
            ? 'READY'
            : 'BLOCKED',
      0,
      prepared.existingIntent?.rewardId
        ? [prepared.existingIntent.rewardId]
        : [],
      prepared.existingIntent
        ? 'Для этого шага уже существует идемпотентный план награды; повторный apply не создаст дубль.'
        : !prepared.eventId
          ? 'Каноническое событие исходного факта не найдено; сначала его должен создать обычный fallback pipeline.'
          : prepared.rule.eligible
            ? 'Dry-run подтверждён. Перед apply повторно сверяются версии факта и сезона.'
            : 'Условие выбранного шага не выполнено; apply заблокирован.',
    );
  }

  async applyBattlePass(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayApplyDto,
  ): Promise<GuestGameBattlePassReplayResult> {
    const prepared = await this.prepare(user, dto);
    this.assertExpectedVersion(
      dto.expectedFactUpdatedAt,
      prepared.fact.updatedAt,
      'факта игрового журнала',
    );
    this.assertExpectedVersion(
      dto.expectedSeasonUpdatedAt,
      prepared.season.updatedAt,
      'сезона Battle Pass',
    );

    if (prepared.existingIntent) {
      this.assertExistingIntent(prepared);
      return this.result(
        prepared,
        'APPLY',
        'IDEMPOTENT',
        0,
        prepared.existingIntent.rewardId
          ? [prepared.existingIntent.rewardId]
          : [],
        'Replay уже был зафиксирован этим rule-scoped intent; повторная награда не создавалась.',
      );
    }

    if (normalizedString(dto.confirmation) !== 'APPLY_RULE_REPLAY') {
      throw new BadRequestException(
        'Для apply передайте confirmation=APPLY_RULE_REPLAY.',
      );
    }

    if (normalizedString(dto.confirmationHash) !== prepared.confirmationHash) {
      throw new ConflictException(
        'Результат dry-run изменился. Выполните preview ещё раз и подтвердите новый confirmationHash.',
      );
    }
    if (!prepared.eventId) {
      throw new ConflictException(
        'Каноническое событие исходного факта не найдено. Replay не создаёт второе физическое событие.',
      );
    }
    if (!prepared.rule.eligible) {
      throw new ConflictException(
        `Условие шага больше не выполнено: ${prepared.rule.blockers.join('; ')}`,
      );
    }
    if (prepared.rule.xpDelta !== 0) {
      throw new ConflictException(
        'BP-only replay не начисляет отдельный XP: для выбранного шага xpDelta должен быть равен нулю.',
      );
    }
    if (!prepared.rule.selectedRewardLabel) {
      throw new ConflictException(
        'Для выбранного шага не определена награда Battle Pass.',
      );
    }

    const processed = await this.gamification.processEvent(
      user,
      { ...prepared.processDto, activeRulesOnly: true },
      {
        allowedRuleIds: [prepared.season.id],
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        evaluatorVersion: 'ledger-rule-replay-v1',
        originKey: prepared.originKey,
        suppressLedgerShadow: true,
        ruleDomainTimeZones: prepared.ruleDomainTimeZones,
        ruleExternalDomains: prepared.ruleExternalDomains,
        replayRewardScope: {
          ruleKind: 'SEASON',
          ruleId: prepared.season.id,
          battlePassStep: prepared.step.sequence,
          stepId: prepared.step.id,
          sourceFactId: prepared.fact.id,
          sourceFactUpdatedAt: prepared.fact.updatedAt,
          seasonUpdatedAt: prepared.season.updatedAt,
          confirmationHash: prepared.confirmationHash,
        },
      },
    );
    if (processed.event.id !== prepared.eventId) {
      throw new ConflictException(
        'Apply использовал не то каноническое событие, которое было подтверждено preview.',
      );
    }
    const intent = await this.findIntent(user.tenantId, prepared.claimKey);
    if (!intent) {
      throw new ConflictException(
        'Rule-scoped intent не найден после apply; replay остановлен без предположения об успешной выдаче.',
      );
    }
    const finalized = { ...prepared, existingIntent: intent };
    this.assertExistingIntent(finalized);
    const rewardIds = intent?.rewardId ? [intent.rewardId] : [];

    return this.result(
      finalized,
      'APPLY',
      intent?.status === 'APPLIED' ? 'APPLIED' : 'QUEUED',
      processed.summary.createdRewards,
      [...new Set(rewardIds)],
      intent?.status === 'APPLIED'
        ? 'Rule-scoped intent применён через штатный reward/bonus-ledger pipeline.'
        : 'Rule-scoped intent создан; штатный materializer завершит выдачу идемпотентно.',
    );
  }

  private async findExactEntitlementReconciliationCandidates(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ) {
    return client.$queryRaw<ExactEntitlementReconciliationCandidateRow[]>(
      Prisma.sql`
        WITH entitlement_rows AS (
          SELECT
            e."id",
            e."tenantId",
            e."profileId",
            e."guestId",
            e."storeId",
            e."ruleId",
            e."status",
            e."qualifiedAt",
            e."consumedAt",
            e."canceledAt",
            e."rewardId",
            e."sourceRewardId",
            e."sourceEventType"
          FROM "GuestGameEntitlement" e
          WHERE e."tenantId" = ${tenantId}
            AND e."ruleType" = 'LOOT_BOX'
            AND e."profileId" IS NOT NULL
            AND e."status" IN ('AVAILABLE', 'CONSUMED')
            AND e."canceledAt" IS NULL
        ),
        candidate_pairs AS (
          SELECT
            e."id" AS "entitlementId",
            r."id" AS "rewardId",
            e."ruleId" AS "ruleId",
            e."profileId" AS "profileId",
            e."guestId" AS "guestId",
            e."storeId" AS "storeId",
            r."qualifiedAt" AS "rewardQualifiedAt"
          FROM entitlement_rows e
          INNER JOIN "GuestGameReward" r
            ON r."tenantId" = e."tenantId"
           AND r."profileId" = e."profileId"
           AND r."lootBoxId" = e."ruleId"
           AND (e."storeId" IS NULL OR r."storeId" = e."storeId")
          WHERE e."status" = 'AVAILABLE'
            AND e."consumedAt" IS NULL
            AND e."canceledAt" IS NULL
            AND (
              e."rewardId" IS NULL
              OR (
                e."sourceRewardId" IS NOT NULL
                AND e."rewardId" = e."sourceRewardId"
              )
            )
            AND r."status" IN ('PENDING', 'APPROVED', 'PAID')
            AND r."source" = 'API_IMPORT'
            AND r."evidence"->>'sourceFactKind' = 'GUEST_LOOT_BOX_OPEN'
            AND r."evidence"->>'eventType' = e."sourceEventType"
            AND r."evidence"->'rule'->>'id' = e."ruleId"
            AND r."evidence"->'rule'->>'kind' = 'LOOT_BOX'
            AND r."evidence"->>'occurredAt' =
              to_char(
                e."qualifiedAt",
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
              )
            AND NOT EXISTS (
              SELECT 1
              FROM "GuestGameEntitlement" bound
              WHERE bound."tenantId" = e."tenantId"
                AND bound."rewardId" = r."id"
            )
        ),
        exact_pairs AS (
          SELECT
            pairs.*,
            COUNT(*) OVER (
              PARTITION BY pairs."entitlementId"
            ) AS "rewardCountForEntitlement",
            COUNT(*) OVER (
              PARTITION BY pairs."rewardId"
            ) AS "entitlementCountForReward"
          FROM candidate_pairs pairs
        )
        SELECT
          exact."entitlementId",
          exact."rewardId",
          exact."ruleId",
          exact."profileId",
          exact."guestId",
          exact."storeId",
          exact."rewardQualifiedAt"
        FROM exact_pairs exact
        WHERE exact."rewardCountForEntitlement" = 1
          AND exact."entitlementCountForReward" = 1
        ORDER BY exact."entitlementId", exact."rewardId"
      `,
    );
  }

  private async findLootBoxEntitlementOverLimitCandidates(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ) {
    const rows = await client.$queryRaw<LootBoxEntitlementLimitRow[]>(
      Prisma.sql`
        SELECT
          e."id" AS "entitlementId",
          e."ruleId" AS "ruleId",
          e."profileId" AS "profileId",
          e."guestId" AS "guestId",
          e."storeId" AS "storeId",
          e."status" AS "status",
          e."qualifiedAt" AS "qualifiedAt"
        FROM "GuestGameEntitlement" e
        INNER JOIN "GuestGameLootBox" l
          ON l."tenantId" = e."tenantId"
         AND l."id" = e."ruleId"
        WHERE e."tenantId" = ${tenantId}
          AND e."ruleType" = 'LOOT_BOX'
          AND e."profileId" IS NOT NULL
          AND (
            (
              e."status" = 'AVAILABLE'
              AND e."consumedAt" IS NULL
              AND (
                e."rewardId" IS NULL
                OR (
                  e."sourceRewardId" IS NOT NULL
                  AND e."rewardId" = e."sourceRewardId"
                )
              )
            )
            OR e."status" = 'CONSUMED'
          )
          AND e."canceledAt" IS NULL
          AND l."status" = 'ACTIVE'
          AND l."usageKind" IN ('STANDALONE', 'BOTH')
          AND l."limits"->>'perGuestPerWeek' = '1'
        ORDER BY
          e."profileId",
          e."ruleId",
          e."qualifiedAt",
          e."id"
      `,
    );
    return rollingSevenDayOverLimitCandidates(rows);
  }

  private async prepareSupportRewardRecovery(
    user: AuthenticatedUser,
    dto: GuestGameSupportRewardRecoveryPreviewDto,
  ): Promise<PreparedSupportRewardRecovery> {
    if (!user.isPlatformAdmin || user.platformTenantContext !== true) {
      throw new ForbiddenException(
        'Support reward recovery requires a platform administrator with an explicitly selected tenant context.',
      );
    }
    const ticketNumber = requiredId(dto.ticketNumber, 'ticketNumber');
    if (!Array.isArray(dto.actions) || dto.actions.length < 1) {
      throw new BadRequestException(
        'Support reward recovery requires at least one exact fact/rule action.',
      );
    }
    if (dto.actions.length > 5) {
      throw new BadRequestException(
        'Support reward recovery is limited to five exact actions per confirmed plan.',
      );
    }
    const requestedActions = dto.actions.map((action, index) => {
      const ruleKind = normalizedString(action.ruleKind)?.toUpperCase();
      if (ruleKind !== 'LOOT_BOX' && ruleKind !== 'MISSION') {
        throw new BadRequestException(
          `actions[${index}].ruleKind must be LOOT_BOX or MISSION.`,
        );
      }
      return {
        factId: requiredId(action.factId, `actions[${index}].factId`),
        ruleKind,
        ruleId: requiredId(action.ruleId, `actions[${index}].ruleId`),
      };
    });
    if (
      new Set(requestedActions.map((action) => action.factId)).size !==
        requestedActions.length ||
      new Set(requestedActions.map((action) => action.ruleId)).size !==
        requestedActions.length
    ) {
      throw new BadRequestException(
        'Every recovery action must use a unique fact and a unique rule.',
      );
    }

    const ticket = await this.prisma.guestSupportTicket.findUnique({
      where: { ticketNumber },
      select: {
        id: true,
        ticketNumber: true,
        tenantId: true,
        profileId: true,
        guestId: true,
        storeId: true,
        status: true,
        profile: {
          select: {
            id: true,
            status: true,
            gameActivatedAt: true,
            guestId: true,
            guest: {
              select: {
                id: true,
                externalProvider: true,
                externalDomain: true,
                externalGuestId: true,
                isDisabled: true,
              },
            },
          },
        },
        store: {
          select: {
            id: true,
            isActive: true,
            externalDomain: true,
            timeZone: true,
          },
        },
      },
    });
    if (!ticket || ticket.tenantId !== user.tenantId) {
      throw new NotFoundException(
        'The support ticket was not found in the selected tenant context.',
      );
    }
    if (
      !ticket.guestId ||
      !['NEW', 'IN_PROGRESS'].includes(ticket.status) ||
      ticket.profile.status !== 'ACTIVE' ||
      !ticket.profile.gameActivatedAt ||
      ticket.profile.guestId !== ticket.guestId ||
      !ticket.profile.guest ||
      ticket.profile.guest.isDisabled ||
      ticket.profile.guest.id !== ticket.guestId ||
      !ticket.store.isActive ||
      !ticket.store.timeZone
    ) {
      throw new ConflictException(
        'The ticket no longer has one active guest, game profile, store and activation boundary.',
      );
    }

    const factRows = await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: user.tenantId,
        id: { in: requestedActions.map((action) => action.factId) },
      },
    });
    if (factRows.length !== requestedActions.length) {
      throw new NotFoundException(
        'One or more exact activity facts were not found in the selected tenant.',
      );
    }
    const factsById = new Map(factRows.map((fact) => [fact.id, fact]));
    const preparedActions: PreparedSupportRewardRecoveryAction[] = [];

    for (const requested of requestedActions) {
      const fact = factsById.get(requested.factId);
      if (!fact) {
        throw new NotFoundException('The exact activity fact was not found.');
      }
      const isPlayTime = replayFactTypes.has(fact.factType);
      const isTypedSessionStart = [
        'HOURLY_SESSION_STARTED',
        'PACKAGE_OR_SUBSCRIPTION_USED',
      ].includes(fact.factType);
      if (
        fact.lifecycleStatus !== 'ACTIVE' ||
        fact.confidence !== 'EXACT' ||
        fact.supersededAt ||
        !fact.happenedAt ||
        !fact.sourceLocalDate ||
        !fact.sessionExternalId ||
        fact.profileId !== ticket.profileId ||
        fact.guestId !== ticket.guestId ||
        fact.storeId !== ticket.storeId ||
        fact.externalProvider !== ticket.profile.guest.externalProvider ||
        normalizeGuestGameExternalDomain(fact.externalDomain) !==
          normalizeGuestGameExternalDomain(
            ticket.profile.guest.externalDomain,
          ) ||
        fact.externalGuestId !== ticket.profile.guest.externalGuestId ||
        normalizeGuestGameExternalDomain(fact.externalDomain) !==
          normalizeGuestGameExternalDomain(ticket.store.externalDomain) ||
        fact.happenedAt.getTime() < ticket.profile.gameActivatedAt.getTime() ||
        (!isPlayTime && !isTypedSessionStart) ||
        (requested.ruleKind === 'MISSION' && !isPlayTime) ||
        (requested.ruleKind === 'LOOT_BOX' && !isTypedSessionStart)
      ) {
        throw new ConflictException(
          `Fact ${fact.id} is outside the ticket identity, activation, store or supported exact event scope.`,
        );
      }
      if (
        await hasSessionFactsPendingHourlyReplay(this.prisma, {
          tenantId: user.tenantId,
          factId: fact.id,
          factTypes: [fact.factType],
          profileId: fact.profileId,
          happenedAtGte: fact.happenedAt,
        })
      ) {
        throw new ConflictException(
          `Fact ${fact.id} predates an incomplete hourly source replay.`,
        );
      }

      const physicalIdentity = isPlayTime
        ? buildGuestGamePhysicalProgressIdentity({
            externalProvider: fact.externalProvider,
            externalDomain: fact.externalDomain,
            sourceKind: fact.sourceKind,
            sessionExternalId: fact.sessionExternalId,
            eventType: fact.factType,
          })
        : buildGuestGamePhysicalSessionStartIdentity({
            externalProvider: fact.externalProvider,
            externalDomain: fact.externalDomain,
            sourceKind: fact.sourceKind,
            sessionExternalId: fact.sessionExternalId,
            eventType: fact.factType,
          });
      const originKey = isPlayTime
        ? buildGuestGamePlayTimeOriginKey({
            externalProvider: fact.externalProvider,
            externalDomain: fact.externalDomain,
            sourceKind: fact.sourceKind,
            sessionExternalId: fact.sessionExternalId,
            eventType: fact.factType,
          })
        : (physicalIdentity?.key ?? null);
      if (!physicalIdentity || !originKey) {
        throw new ConflictException(
          `Fact ${fact.id} has no stable physical-session identity.`,
        );
      }
      await this.assertSingleSupportRecoveryPhysicalFact(
        user.tenantId,
        fact,
        physicalIdentity.key,
        isPlayTime,
      );

      const processDto = supportRecoveryProcessDto(
        fact as PreparedSupportRewardRecoveryAction['fact'],
        ticket.ticketNumber,
      );
      const dryRun = await this.gamification.dryRun(user, processDto);
      const eligibleRules = dryRun.rules.filter(
        (rule) =>
          rule.status === 'ACTIVE' &&
          rule.eligible &&
          guestGamePolicyAllowsEvaluation(
            rule.evaluationPolicy,
            'LIVE_LEDGER_FALLBACK',
          ),
      );
      const matchingRules = dryRun.rules.filter(
        (rule) =>
          rule.status === 'ACTIVE' &&
          rule.id === requested.ruleId &&
          rule.kind === requested.ruleKind &&
          guestGamePolicyAllowsEvaluation(
            rule.evaluationPolicy,
            'LIVE_LEDGER_FALLBACK',
          ),
      );
      if (matchingRules.length !== 1) {
        throw new ConflictException(
          `Fact ${fact.id} no longer resolves to the confirmed active rule ${requested.ruleId}.`,
        );
      }
      const dryRule = matchingRules[0];
      const isFreshAction =
        eligibleRules.length === 1 && eligibleRules[0] === dryRule;
      if (dryRule.kind === 'SEASON') {
        throw new ConflictException(
          'Battle Pass rules are forbidden in support reward recovery.',
        );
      }
      const ruleUpdatedAt = dateValue(dryRule.ruleUpdatedAt);
      if (!ruleUpdatedAt) {
        throw new ConflictException(
          `Rule ${dryRule.id} has no immutable version in dry-run.`,
        );
      }

      let dependency: PreparedSupportRewardRecoveryAction['dependency'] = null;
      if (dryRule.kind === 'LOOT_BOX') {
        const config = await this.prisma.guestGameLootBox.findFirst({
          where: { id: dryRule.id, tenantId: user.tenantId },
          select: {
            status: true,
            usageKind: true,
            limits: true,
            manualApprovalRequired: true,
            updatedAt: true,
          },
        });
        const maxPendingRewards = Number(
          jsonRecord(config?.limits).maxPendingRewards,
        );
        if (
          !config ||
          config.status !== 'ACTIVE' ||
          !['STANDALONE', 'BOTH'].includes(config.usageKind) ||
          config.manualApprovalRequired ||
          config.updatedAt.getTime() !== ruleUpdatedAt.getTime() ||
          maxPendingRewards !== 1 ||
          dryRule.xpDelta !== 0 ||
          !dryRule.periodicLimitPeriod
        ) {
          throw new ConflictException(
            `Loot-box rule ${dryRule.id} is not a one-pending, automatic standalone case entitlement.`,
          );
        }
      } else {
        const config = await this.prisma.guestGameMission.findFirst({
          where: { id: dryRule.id, tenantId: user.tenantId },
          select: {
            status: true,
            rewardType: true,
            rewardAmount: true,
            xpReward: true,
            maxPendingRewards: true,
            manualApprovalRequired: true,
            conditions: true,
            updatedAt: true,
          },
        });
        const reward = jsonRecord(jsonRecord(config?.conditions).reward);
        const targetLootBoxId = normalizedString(
          dryRule.rewardLootBoxId ?? reward.lootBoxId,
        );
        const targetLootBox = targetLootBoxId
          ? await this.prisma.guestGameLootBox.findFirst({
              where: { id: targetLootBoxId, tenantId: user.tenantId },
              select: {
                id: true,
                status: true,
                usageKind: true,
                updatedAt: true,
              },
            })
          : null;
        if (
          !config ||
          config.status !== 'ACTIVE' ||
          config.rewardType !== 'LOOT_BOX_ENTITLEMENT' ||
          Number(config.rewardAmount ?? 0) !== 0 ||
          config.maxPendingRewards !== 1 ||
          config.manualApprovalRequired ||
          config.updatedAt.getTime() !== ruleUpdatedAt.getTime() ||
          dryRule.rewardType !== 'LOOT_BOX_ENTITLEMENT' ||
          (dryRule.rewardAmount ?? 0) !== 0 ||
          dryRule.xpDelta !== config.xpReward ||
          !targetLootBox ||
          targetLootBox.status !== 'ACTIVE' ||
          !['REWARD_TEMPLATE', 'BOTH'].includes(targetLootBox.usageKind)
        ) {
          throw new ConflictException(
            `Mission ${dryRule.id} is not an active one-pending automatic case reward with an active reward template.`,
          );
        }
        dependency = {
          kind: 'LOOT_BOX',
          id: targetLootBox.id,
          updatedAt: targetLootBox.updatedAt,
        };
      }

      const preparedAction: PreparedSupportRewardRecoveryAction = {
        fact: fact as PreparedSupportRewardRecoveryAction['fact'],
        rule: {
          ...dryRule,
          kind: dryRule.kind,
          ruleUpdatedAt: ruleUpdatedAt.toISOString(),
        },
        processDto,
        originKey,
        physicalSessionKey: physicalIdentity.key,
        expectedXpDelta: dryRule.xpDelta,
        dependency,
        existingEffect: null,
      };
      const existingEventId = await this.findExistingSupportRecoveryEventId(
        user.tenantId,
        ticket.ticketNumber,
        preparedAction,
      );
      if (existingEventId) {
        const postcondition = await this.assertSupportRecoveryPostcondition(
          user,
          preparedAction,
          existingEventId,
        );
        preparedAction.existingEffect = {
          eventId: existingEventId,
          entitlementId: postcondition.entitlementId,
        };
      } else if (!isFreshAction) {
        throw new ConflictException(
          `Fact ${fact.id} no longer resolves to the single confirmed active rule ${requested.ruleId}.`,
        );
      }
      preparedActions.push(preparedAction);
    }

    preparedActions.sort(
      (left, right) =>
        left.fact.happenedAt.getTime() - right.fact.happenedAt.getTime() ||
        left.fact.id.localeCompare(right.fact.id),
    );
    const allowedRuleIds = preparedActions
      .map((action) => action.rule.id)
      .sort();
    const digest = sha256({
      schemaVersion: 1,
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketStatus: ticket.status,
      profileId: ticket.profileId,
      guestId: ticket.guestId,
      storeId: ticket.storeId,
      gameActivatedAt: ticket.profile.gameActivatedAt.toISOString(),
      storeTimeZone: ticket.store.timeZone,
      allowedRuleIds,
      directBonusAmount: 0,
      battlePassRewards: 0,
      actions: preparedActions.map((action) => ({
        factId: action.fact.id,
        factUpdatedAt: action.fact.updatedAt.toISOString(),
        factType: action.fact.factType,
        happenedAt: action.fact.happenedAt.toISOString(),
        sourceLocalDate: action.fact.sourceLocalDate,
        sourceKind: normalizeGuestGameSourceKind(action.fact.sourceKind),
        sessionExternalId: action.fact.sessionExternalId,
        physicalSessionKey: action.physicalSessionKey,
        originKey: action.originKey,
        ruleKind: action.rule.kind,
        ruleId: action.rule.id,
        ruleUpdatedAt: action.rule.ruleUpdatedAt,
        ruleName: action.rule.name,
        evaluationPolicy: action.rule.evaluationPolicy,
        expectedXpDelta: action.expectedXpDelta,
        expectedEntitlementCount: 1,
        directBonusAmount: 0,
        existingEffect: action.existingEffect,
        dependency: action.dependency
          ? {
              kind: action.dependency.kind,
              id: action.dependency.id,
              updatedAt: action.dependency.updatedAt.toISOString(),
            }
          : null,
        reasons: action.rule.reasons,
        blockers: action.rule.blockers,
      })),
    });

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        tenantId: ticket.tenantId,
        profileId: ticket.profileId,
        guestId: ticket.guestId,
        storeId: ticket.storeId,
      },
      authority: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketStatus: ticket.status as 'NEW' | 'IN_PROGRESS',
        gameActivatedAt: ticket.profile.gameActivatedAt,
        storeTimeZone: ticket.store.timeZone,
      },
      actions: preparedActions,
      digest,
      allowedRuleIds,
    };
  }

  private async assertSingleSupportRecoveryPhysicalFact(
    tenantId: string,
    fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
    physicalSessionKey: string,
    playTime: boolean,
  ) {
    const candidates = await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId,
        externalProvider: fact.externalProvider,
        sessionExternalId: fact.sessionExternalId,
        factType: {
          in: playTime
            ? [...replayFactTypes]
            : ['HOURLY_SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED'],
        },
        lifecycleStatus: 'ACTIVE',
        confidence: 'EXACT',
        supersededAt: null,
      },
      select: {
        id: true,
        externalProvider: true,
        externalDomain: true,
        sourceKind: true,
        sessionExternalId: true,
        factType: true,
      },
    });
    const samePhysical = candidates.filter((candidate) => {
      const identity = playTime
        ? buildGuestGamePhysicalProgressIdentity({
            ...candidate,
            eventType: candidate.factType,
          })
        : buildGuestGamePhysicalSessionStartIdentity({
            ...candidate,
            eventType: candidate.factType,
          });
      return identity?.key === physicalSessionKey;
    });
    if (samePhysical.length !== 1 || samePhysical[0]?.id !== fact.id) {
      throw new ConflictException(
        `Physical session ${fact.sessionExternalId ?? 'unknown'} has conflicting active exact facts.`,
      );
    }
  }

  private async findExistingSupportRecoveryEventId(
    tenantId: string,
    ticketNumber: string,
    action: PreparedSupportRewardRecoveryAction,
  ): Promise<string | null> {
    const event = await this.prisma.guestGameEvent.findFirst({
      where: { tenantId, originKey: action.originKey },
      select: {
        id: true,
        profileId: true,
        guestId: true,
        eventType: true,
        source: true,
        externalProvider: true,
        externalDomain: true,
        externalId: true,
        originKey: true,
        xpDelta: true,
        occurredAt: true,
        payload: true,
      },
    });
    if (!event) return null;

    const payload = jsonRecord(event.payload);
    if (
      !Object.prototype.hasOwnProperty.call(payload, 'exactReconciliationPlan')
    ) {
      return null;
    }
    const plan = jsonRecord(payload.exactReconciliationPlan);
    const extra = jsonRecord(payload.extra);
    const store = jsonRecord(payload.store);
    const rawRules = Array.isArray(plan.rules) ? plan.rules : [];
    const rawRuleVersions = Array.isArray(plan.ruleVersions)
      ? plan.ruleVersions
      : [];
    const rawRewardIntents = Array.isArray(plan.rewardIntents)
      ? plan.rewardIntents
      : [];
    const planRule = jsonRecord(rawRules[0]);
    const planRuleVersion = jsonRecord(rawRuleVersions[0]);
    const planRewardIntent = jsonRecord(rawRewardIntents[0]);
    const planRewardIntentRule = jsonRecord(planRewardIntent.rule);
    const expectedEventType =
      action.rule.kind === 'MISSION' ? 'PLAY_HOUR' : 'SESSION_START';
    const expectedReconciliationKind =
      action.rule.kind === 'MISSION'
        ? 'EXACT_PLAY_TIME'
        : 'EXACT_SESSION_START';
    const expectedExternalId = [
      'guest-game',
      'GUEST_SESSION',
      expectedEventType,
      action.fact.sessionExternalId,
    ].join(':');
    const expectedRuleUpdatedAt = new Date(
      action.rule.ruleUpdatedAt,
    ).toISOString();
    const rewardIntentIsSafe =
      action.rule.kind === 'LOOT_BOX'
        ? rawRewardIntents.length === 0
        : rawRewardIntents.length === 1 &&
          numberValue(planRewardIntent.schemaVersion, -1) === 1 &&
          normalizedString(planRewardIntent.slotKey) ===
            'LOOT_BOX_ENTITLEMENT' &&
          normalizedString(planRewardIntent.claimKey) === null &&
          normalizedString(planRewardIntentRule.kind) === 'MISSION' &&
          normalizedString(planRewardIntentRule.id) === action.rule.id &&
          normalizedString(planRewardIntent.qualifiedAt) ===
            action.fact.happenedAt.toISOString();
    const ruleEffectIsSafe =
      action.rule.kind === 'LOOT_BOX'
        ? planRule.rewardMaterializationSuppressed === true &&
          Boolean(normalizedString(planRule.periodicLimitPeriod))
        : normalizedString(planRule.rewardType) === 'LOOT_BOX_ENTITLEMENT' &&
          (nullableNumber(planRule.rewardAmount) ?? 0) === 0 &&
          normalizedString(planRule.rewardLootBoxId) === action.dependency?.id;
    const receipt = await this.prisma.guestGameOriginReceipt.findUnique({
      where: {
        tenantId_originKey: { tenantId, originKey: action.originKey },
      },
      select: {
        factId: true,
        eventId: true,
        eventType: true,
        externalProvider: true,
        externalDomain: true,
        policy: true,
        status: true,
        claimedSource: true,
      },
    });
    if (
      event.profileId !== action.fact.profileId ||
      event.guestId !== action.fact.guestId ||
      canonicalGuestGameEventType(event.eventType) !== expectedEventType ||
      event.source !== 'API_IMPORT' ||
      normalizedString(event.externalProvider)?.toUpperCase() !==
        normalizedString(action.fact.externalProvider)?.toUpperCase() ||
      normalizeGuestGameExternalDomain(event.externalDomain) !==
        normalizeGuestGameExternalDomain(action.fact.externalDomain) ||
      event.externalId !== expectedExternalId ||
      event.originKey !== action.originKey ||
      event.occurredAt.getTime() !== action.fact.happenedAt.getTime() ||
      event.xpDelta !== action.expectedXpDelta ||
      numberValue(payload.processSchemaVersion, -1) !== 2 ||
      normalizedString(payload.source) !== 'guest_gamification_process_event' ||
      normalizedString(payload.sourceFactId) !== action.fact.id ||
      normalizedString(payload.sourceFactKind) !== 'GUEST_SESSION' ||
      normalizedString(payload.externalId) !== action.fact.sessionExternalId ||
      normalizeGuestGameExternalDomain(payload.externalDomain) !==
        normalizeGuestGameExternalDomain(action.fact.externalDomain) ||
      normalizeGuestGameSourceKind(payload.sourceKind) !==
        normalizeGuestGameSourceKind(action.fact.sourceKind) ||
      normalizedString(payload.sessionExternalId) !==
        action.fact.sessionExternalId ||
      normalizedString(store.id) !== action.fact.storeId ||
      extra.supportRewardRecovery !== true ||
      normalizedString(extra.ticketNumber) !== ticketNumber ||
      normalizedString(extra.factType) !== action.fact.factType ||
      normalizedString(extra.confidence) !== 'EXACT' ||
      normalizeGuestGameSourceKind(extra.sourceKind) !==
        normalizeGuestGameSourceKind(action.fact.sourceKind) ||
      normalizedString(extra.sessionExternalId) !==
        action.fact.sessionExternalId ||
      numberValue(plan.schemaVersion, -1) !== 1 ||
      normalizedString(plan.reconciliationKind) !==
        expectedReconciliationKind ||
      normalizedString(plan.eventId) !== event.id ||
      normalizedString(plan.originKey) !== action.originKey ||
      normalizedString(plan.profileId) !== action.fact.profileId ||
      normalizedString(plan.physicalSessionKey) !== action.physicalSessionKey ||
      normalizedString(plan.sourceFactId) !== action.fact.id ||
      dateValue(plan.sourceFactUpdatedAt)?.getTime() !==
        action.fact.updatedAt.getTime() ||
      !dateValue(plan.createdAt) ||
      dateValue(plan.occurredAt)?.getTime() !==
        action.fact.happenedAt.getTime() ||
      canonicalGuestGameEventType(normalizedString(plan.eventType)) !==
        expectedEventType ||
      numberValue(plan.expectedXpDelta, -1) !== action.expectedXpDelta ||
      rawRules.length !== 1 ||
      normalizedString(planRule.kind) !== action.rule.kind ||
      normalizedString(planRule.id) !== action.rule.id ||
      normalizedString(planRule.status) !== 'ACTIVE' ||
      planRule.eligible !== true ||
      !guestGamePolicyAllowsEvaluation(
        normalizedString(planRule.evaluationPolicy) ?? '',
        'LIVE_LEDGER_FALLBACK',
      ) ||
      planRule.manualApprovalRequired !== false ||
      dateValue(planRule.ruleUpdatedAt)?.toISOString() !==
        expectedRuleUpdatedAt ||
      numberValue(planRule.xpDelta, -1) !== action.expectedXpDelta ||
      nullableNumber(planRule.battlePassStep) !== null ||
      normalizedString(planRule.battlePassStepId) !== null ||
      !ruleEffectIsSafe ||
      rawRuleVersions.length !== 1 ||
      normalizedString(planRuleVersion.ruleKind) !== action.rule.kind ||
      normalizedString(planRuleVersion.ruleId) !== action.rule.id ||
      nullableNumber(planRuleVersion.battlePassStep) !== null ||
      normalizedString(planRuleVersion.battlePassStepId) !== null ||
      dateValue(planRuleVersion.ruleUpdatedAt)?.toISOString() !==
        expectedRuleUpdatedAt ||
      !rewardIntentIsSafe ||
      !receipt ||
      receipt.factId !== action.fact.id ||
      receipt.eventId !== event.id ||
      canonicalGuestGameEventType(receipt.eventType) !== expectedEventType ||
      normalizedString(receipt.externalProvider)?.toUpperCase() !==
        normalizedString(action.fact.externalProvider)?.toUpperCase() ||
      normalizeGuestGameExternalDomain(receipt.externalDomain) !==
        normalizeGuestGameExternalDomain(action.fact.externalDomain) ||
      receipt.policy !== 'EXACT_OPERATOR_CANONICALIZATION' ||
      receipt.status !== 'PROCESSED' ||
      !['EXACT_CANONICALIZATION', 'EXACT_OPERATOR_CANONICALIZATION'].includes(
        receipt.claimedSource ?? '',
      )
    ) {
      throw new ConflictException(
        'The existing support recovery event is not the exact immutable effect for this ticket action.',
      );
    }
    return event.id;
  }

  private async ensureSupportRecoveryCanonicalEvent(
    user: AuthenticatedUser,
    prepared: PreparedSupportRewardRecovery,
    action: PreparedSupportRewardRecoveryAction,
    exactScope: PreparedSupportRewardRecoveryExactScope,
  ): Promise<string> {
    const processed = await this.gamification.processEvent(
      user,
      action.processDto,
      {
        allowedRuleIds: [],
        evaluationMode: 'LIVE_LEDGER_FALLBACK',
        evaluatorVersion: 'support-reward-recovery-canonical-v1',
        materializeRewards: false,
        originKey: action.originKey,
        suppressLedgerShadow: true,
        supportRecoveryCanonicalizationScope: {
          exactReconciliationScope: exactScope,
          planDigest: prepared.digest,
          dependency: action.dependency,
        },
      },
    );
    if (
      processed.summary.appliedXpDelta !== 0 ||
      processed.summary.createdRewards !== 0 ||
      processed.rewards.length !== 0
    ) {
      throw new ConflictException(
        'Support recovery canonicalization created an unexpected material effect.',
      );
    }
    const eventId = processed.event.id;
    await this.prisma.$transaction(
      async (tx) => {
        const [facts, events, rules, dependencies] = await Promise.all([
          tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
            SELECT "id", "updatedAt"
            FROM "GuestActivityFact"
            WHERE "tenantId" = ${user.tenantId}
              AND "id" = ${action.fact.id}
              AND "profileId" = ${prepared.ticket.profileId}
              AND "guestId" = ${prepared.ticket.guestId}
              AND "storeId" = ${prepared.ticket.storeId}
              AND "lifecycleStatus" = 'ACTIVE'
              AND "confidence" = 'EXACT'
              AND "supersededAt" IS NULL
            FOR SHARE
          `),
          tx.$queryRaw<
            Array<{
              id: string;
              profileId: string | null;
              guestId: string | null;
              eventType: string;
              originKey: string | null;
              xpDelta: number;
              payload: Prisma.JsonValue | null;
            }>
          >(Prisma.sql`
            SELECT "id", "profileId", "guestId", "eventType", "originKey",
                   "xpDelta", "payload"
            FROM "GuestGameEvent"
            WHERE "tenantId" = ${user.tenantId}
              AND "id" = ${eventId}
              AND "originKey" = ${action.originKey}
            FOR UPDATE
          `),
          action.rule.kind === 'MISSION'
            ? tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
                SELECT "id", "updatedAt"
                FROM "GuestGameMission"
                WHERE "tenantId" = ${user.tenantId}
                  AND "id" = ${action.rule.id}
                  AND "status" = 'ACTIVE'
                FOR SHARE
              `)
            : tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
                SELECT "id", "updatedAt"
                FROM "GuestGameLootBox"
                WHERE "tenantId" = ${user.tenantId}
                  AND "id" = ${action.rule.id}
                  AND "status" = 'ACTIVE'
                FOR SHARE
              `),
          action.dependency
            ? tx.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
                SELECT "id", "updatedAt"
                FROM "GuestGameLootBox"
                WHERE "tenantId" = ${user.tenantId}
                  AND "id" = ${action.dependency.id}
                  AND "status" = 'ACTIVE'
                  AND "usageKind" IN ('REWARD_TEMPLATE', 'BOTH')
                FOR SHARE
              `)
            : Promise.resolve([] as Array<{ id: string; updatedAt: Date }>),
        ]);
        const fact = facts[0];
        const event = events[0];
        const rule = rules[0];
        const dependency = dependencies[0] ?? null;
        const payload = jsonRecord(event?.payload);
        if (
          facts.length !== 1 ||
          !fact ||
          fact.updatedAt.getTime() !== action.fact.updatedAt.getTime() ||
          events.length !== 1 ||
          !event ||
          event.profileId !== prepared.ticket.profileId ||
          event.guestId !== prepared.ticket.guestId ||
          canonicalGuestGameEventType(event.eventType) !==
            canonicalGuestGameEventType(action.processDto.eventType) ||
          event.originKey !== action.originKey ||
          event.xpDelta !== 0 ||
          normalizedString(payload.sourceFactId) !== action.fact.id ||
          rules.length !== 1 ||
          !rule ||
          rule.updatedAt.getTime() !==
            new Date(action.rule.ruleUpdatedAt).getTime() ||
          (action.dependency &&
            (!dependency ||
              dependency.updatedAt.getTime() !==
                action.dependency.updatedAt.getTime()))
        ) {
          throw new ConflictException(
            'A support recovery fact, event, rule or dependency changed before qualification.',
          );
        }
        const [xpPostingCount, intentCount, entitlementCount, rewardCount] =
          await Promise.all([
            tx.guestGameXpPosting.count({ where: { eventId } }),
            tx.guestGameRewardIntent.count({
              where: {
                tenantId: user.tenantId,
                OR: [{ eventId }, { originKey: action.originKey }],
              },
            }),
            tx.guestGameEntitlement.count({
              where: {
                tenantId: user.tenantId,
                OR: [{ eventId }, { originKey: action.originKey }],
              },
            }),
            tx.guestGameReward.count({
              where: { tenantId: user.tenantId, originKey: action.originKey },
            }),
          ]);
        if (
          xpPostingCount !== 0 ||
          intentCount !== 0 ||
          entitlementCount !== 0 ||
          rewardCount !== 0 ||
          'exactReconciliationPlan' in payload
        ) {
          throw new ConflictException(
            'The canonical event is not pristine; support recovery stopped without adding another effect.',
          );
        }

        const existingReceipt = await tx.guestGameOriginReceipt.findUnique({
          where: {
            tenantId_originKey: {
              tenantId: user.tenantId,
              originKey: action.originKey,
            },
          },
        });
        if (
          !existingReceipt ||
          existingReceipt.factId !== action.fact.id ||
          existingReceipt.eventId !== eventId ||
          canonicalGuestGameEventType(existingReceipt.eventType) !==
            canonicalGuestGameEventType(action.processDto.eventType) ||
          existingReceipt.policy !== 'EXACT_OPERATOR_CANONICALIZATION' ||
          existingReceipt.status !== 'PROCESSED' ||
          ![
            'EXACT_CANONICALIZATION',
            'EXACT_OPERATOR_CANONICALIZATION',
          ].includes(existingReceipt.claimedSource ?? '')
        ) {
          throw new ConflictException(
            'The atomic support canonicalization did not produce the exact completed origin receipt.',
          );
        }
      },
      { isolationLevel: 'Serializable' },
    );
    return eventId;
  }

  private async assertSupportRecoveryPostcondition(
    user: AuthenticatedUser,
    action: PreparedSupportRewardRecoveryAction,
    eventId: string,
  ): Promise<{ entitlementId: string }> {
    const snapshot = await this.supportRecoveryEffectSnapshot(
      user.tenantId,
      action,
      eventId,
    );
    const entitlements = snapshot.entitlements.filter((entitlement) =>
      action.rule.kind === 'LOOT_BOX'
        ? entitlement.ruleType === 'LOOT_BOX' &&
          entitlement.ruleId === action.rule.id &&
          entitlement.sourceFactId === action.fact.id
        : entitlement.sourceMissionId === action.rule.id,
    );
    const expectedRewardCount = action.rule.kind === 'MISSION' ? 1 : 0;
    const rewardsAreSafe = snapshot.rewards.every(
      (reward) =>
        action.rule.kind === 'MISSION' &&
        reward.missionId === action.rule.id &&
        reward.seasonId === null &&
        reward.lootBoxId === null &&
        reward.rewardType === 'LOOT_BOX_ENTITLEMENT' &&
        reward.rewardAmount === 0 &&
        reward.status === 'APPROVED',
    );
    const intentsAreSafe = snapshot.intents.every(
      (intent) =>
        intent.ruleType === action.rule.kind &&
        intent.ruleId === action.rule.id &&
        ['QUALIFICATION', 'REWARD', 'XP_POSTING'].includes(intent.effectKind),
    );
    const rewardEffectsAreSafe = snapshot.rewardEffects.every(
      (effect) =>
        effect.effectKind === 'LOOT_BOX_ENTITLEMENT' &&
        effect.status === 'APPLIED',
    );
    const xpIsSafe =
      action.expectedXpDelta === 0
        ? snapshot.event.xpDelta === 0 && snapshot.xpPosting === null
        : snapshot.event.xpDelta === action.expectedXpDelta &&
          snapshot.xpPosting?.requestedDelta === action.expectedXpDelta &&
          snapshot.xpPosting.appliedDelta === action.expectedXpDelta &&
          snapshot.xpPosting.balanceAfter - snapshot.xpPosting.balanceBefore ===
            action.expectedXpDelta;
    const entitlement = entitlements[0];
    const sourceLinksAreSafe =
      action.rule.kind === 'MISSION'
        ? entitlement?.sourceRewardId === snapshot.rewards[0]?.id &&
          entitlement.rewardId === null &&
          snapshot.rewardEffects.length === 1 &&
          snapshot.rewardEffects[0]?.rewardId === snapshot.rewards[0]?.id
        : entitlement?.sourceFactId === action.fact.id &&
          entitlement.sourceRewardId === null &&
          entitlement.rewardId === null &&
          snapshot.rewardEffects.length === 0;
    const walletItem = snapshot.walletItems[0];
    const walletItemIsSafe =
      snapshot.walletItems.length === 1 &&
      Boolean(entitlement) &&
      walletItem?.profileId === action.fact.profileId &&
      walletItem.storeId === action.fact.storeId &&
      walletItem.kind === 'LOOT_BOX_ENTITLEMENT' &&
      walletItem.sourceKind ===
        (action.rule.kind === 'MISSION' ? 'MISSION' : 'LOOT_BOX') &&
      walletItem.sourceId === action.rule.id &&
      walletItem.title === action.rule.name &&
      walletItem.rewardLabel === '1 попытка открытия' &&
      walletItem.status === 'PENDING' &&
      walletItem.claimXpDelta === 0 &&
      walletItem.rewardId === null &&
      walletItem.entitlementId === entitlement?.id &&
      walletItem.eventId === null &&
      walletItem.claimedAt === null &&
      walletItem.availableAt === entitlement?.qualifiedAt &&
      Date.parse(walletItem.expiresAt) > Date.parse(walletItem.availableAt);
    if (
      snapshot.entitlements.length !== 1 ||
      entitlements.length !== 1 ||
      entitlements[0]?.status !== 'AVAILABLE' ||
      entitlements[0].consumedAt !== null ||
      entitlements[0].canceledAt !== null ||
      snapshot.rewards.length !== expectedRewardCount ||
      !rewardsAreSafe ||
      !intentsAreSafe ||
      !rewardEffectsAreSafe ||
      !sourceLinksAreSafe ||
      snapshot.bonusLedgerEntries.length !== 0 ||
      !walletItemIsSafe ||
      !xpIsSafe
    ) {
      throw new ConflictException(
        'Support recovery postcondition failed: exactly one AVAILABLE case and only the configured XP were expected.',
      );
    }
    return { entitlementId: entitlements[0].id };
  }

  private async supportRecoveryEffectSnapshot(
    tenantId: string,
    action: PreparedSupportRewardRecoveryAction,
    eventId: string,
  ) {
    const [
      event,
      profile,
      intents,
      entitlements,
      rewards,
      rewardEffects,
      bonusLedgerEntries,
      walletItems,
      xpPosting,
    ] = await Promise.all([
      this.prisma.guestGameEvent.findFirst({
        where: { id: eventId, tenantId, originKey: action.originKey },
        select: { id: true, xpDelta: true },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: { id: action.fact.profileId, tenantId },
        select: { xp: true },
      }),
      this.prisma.guestGameRewardIntent.findMany({
        where: { tenantId, eventId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          ruleType: true,
          ruleId: true,
          effectKind: true,
          status: true,
          rewardId: true,
        },
      }),
      this.prisma.guestGameEntitlement.findMany({
        where: { tenantId, eventId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          ruleType: true,
          ruleId: true,
          status: true,
          sourceFactId: true,
          sourceRewardId: true,
          rewardId: true,
          consumedAt: true,
          canceledAt: true,
          qualifiedAt: true,
          evidence: true,
          sourceReward: { select: { missionId: true } },
        },
      }),
      this.prisma.guestGameReward.findMany({
        where: { tenantId, originKey: action.originKey },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          missionId: true,
          seasonId: true,
          lootBoxId: true,
          rewardType: true,
          rewardAmount: true,
          status: true,
        },
      }),
      this.prisma.guestGameRewardEffect.findMany({
        where: {
          tenantId,
          reward: { originKey: action.originKey },
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          effectKind: true,
          status: true,
          rewardId: true,
        },
      }),
      this.prisma.guestBonusLedgerEntry.findMany({
        where: {
          tenantId,
          reward: { originKey: action.originKey },
        },
        orderBy: { id: 'asc' },
        select: { id: true, rewardId: true, amount: true, status: true },
      }),
      this.prisma.guestGameRewardWalletItem.findMany({
        where: {
          tenantId,
          OR: [
            { eventId },
            { reward: { originKey: action.originKey } },
            { entitlement: { eventId } },
          ],
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          profileId: true,
          storeId: true,
          kind: true,
          sourceKind: true,
          sourceId: true,
          title: true,
          rewardLabel: true,
          status: true,
          claimXpDelta: true,
          rewardId: true,
          entitlementId: true,
          eventId: true,
          availableAt: true,
          expiresAt: true,
          claimedAt: true,
        },
      }),
      this.prisma.guestGameXpPosting.findUnique({
        where: { eventId },
        select: {
          requestedDelta: true,
          appliedDelta: true,
          balanceBefore: true,
          balanceAfter: true,
        },
      }),
    ]);
    if (!event || !profile) {
      throw new ConflictException(
        'The support recovery event or profile disappeared during verification.',
      );
    }
    return {
      event,
      profile,
      intents,
      entitlements: entitlements.map((entitlement) => ({
        id: entitlement.id,
        ruleType: entitlement.ruleType,
        ruleId: entitlement.ruleId,
        status: entitlement.status,
        sourceFactId: entitlement.sourceFactId,
        sourceRewardId: entitlement.sourceRewardId,
        rewardId: entitlement.rewardId,
        consumedAt: entitlement.consumedAt?.toISOString() ?? null,
        canceledAt: entitlement.canceledAt?.toISOString() ?? null,
        qualifiedAt: entitlement.qualifiedAt.toISOString(),
        sourceMissionId:
          entitlement.sourceReward?.missionId ??
          normalizedString(jsonRecord(entitlement.evidence).missionId),
      })),
      rewards: rewards.map((reward) => ({
        ...reward,
        rewardAmount: Number(reward.rewardAmount),
      })),
      rewardEffects,
      bonusLedgerEntries: bonusLedgerEntries.map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
      })),
      walletItems: walletItems.map((item) => ({
        ...item,
        availableAt: item.availableAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        claimedAt: item.claimedAt?.toISOString() ?? null,
      })),
      xpPosting,
    };
  }

  private supportRewardRecoveryResult(
    prepared: PreparedSupportRewardRecovery,
    mode: GuestGameSupportRewardRecoveryResult['mode'],
    outcome: GuestGameSupportRewardRecoveryResult['outcome'],
    effects: Array<{ eventId: string | null; entitlementId: string | null }>,
    note: string,
  ): GuestGameSupportRewardRecoveryResult {
    return {
      mode,
      outcome,
      ticket: prepared.ticket,
      actionCount: prepared.actions.length,
      digest: prepared.digest,
      allowedRuleIds: prepared.allowedRuleIds,
      expectedEffects: {
        availableLootBoxEntitlements: prepared.actions.length,
        directBonusAmount: 0,
        battlePassRewards: 0,
        xpDelta: prepared.actions.reduce(
          (sum, action) => sum + action.expectedXpDelta,
          0,
        ),
      },
      actions: prepared.actions.map((action, index) => ({
        factId: action.fact.id,
        factUpdatedAt: action.fact.updatedAt.toISOString(),
        factType: action.fact.factType,
        happenedAt: action.fact.happenedAt.toISOString(),
        sourceLocalDate: action.fact.sourceLocalDate,
        sessionExternalId: action.fact.sessionExternalId,
        physicalSessionKey: action.physicalSessionKey,
        originKey: action.originKey,
        ruleKind: action.rule.kind,
        ruleId: action.rule.id,
        ruleUpdatedAt: action.rule.ruleUpdatedAt,
        ruleName: action.rule.name,
        expectedXpDelta: action.expectedXpDelta,
        expectedEntitlementCount: 1,
        directBonusAmount: 0,
        eventId: effects[index]?.eventId ?? null,
        entitlementId: effects[index]?.entitlementId ?? null,
      })),
      note,
    };
  }

  private async prepareExactCanonicalization(
    user: AuthenticatedUser,
    dto: GuestGameExactPlayTimeCanonicalizationPreviewDto,
  ): Promise<PreparedExactCanonicalization> {
    const factId = requiredId(dto.factId, 'factId');
    const profileId = requiredId(dto.profileId, 'profileId');
    const [factRow, profile] = await Promise.all([
      this.prisma.guestActivityFact.findFirst({
        where: { id: factId, tenantId: user.tenantId },
      }),
      this.prisma.guestGameProfile.findFirst({
        where: { id: profileId, tenantId: user.tenantId },
        select: {
          id: true,
          guestId: true,
          guest: {
            select: {
              id: true,
              externalProvider: true,
              externalDomain: true,
              externalGuestId: true,
            },
          },
        },
      }),
    ]);
    if (!factRow) {
      throw new NotFoundException('GuestActivityFact was not found.');
    }
    if (!profile) {
      throw new NotFoundException('Guest game profile was not found.');
    }
    if (
      factRow.lifecycleStatus !== 'ACTIVE' ||
      factRow.supersededAt ||
      factRow.confidence !== 'EXACT'
    ) {
      throw new ConflictException(
        'Exact canonicalization requires an ACTIVE, EXACT and non-superseded fact.',
      );
    }
    if (!replayFactTypes.has(factRow.factType)) {
      throw new BadRequestException(
        'Exact canonicalization currently supports only play-time facts.',
      );
    }
    if (
      !factRow.profileId ||
      factRow.profileId !== profileId ||
      !factRow.happenedAt ||
      !factRow.durationMinutes ||
      factRow.durationMinutes <= 0
    ) {
      throw new ConflictException(
        'The fact must bind exactly to the requested profile and contain positive duration and happenedAt.',
      );
    }
    if (!factRow.guestId || !profile.guestId || !profile.guest) {
      throw new ConflictException(
        'Exact canonicalization requires a non-null fact and profile guest binding.',
      );
    }
    if (factRow.guestId !== profile.guestId) {
      throw new ConflictException(
        'The fact guestId does not exactly match the selected profile guestId.',
      );
    }
    if (
      profile.guest.id !== factRow.guestId ||
      profile.guest.externalProvider !== factRow.externalProvider ||
      profile.guest.externalDomain !== factRow.externalDomain ||
      profile.guest.externalGuestId !== factRow.externalGuestId
    ) {
      throw new ConflictException(
        'The fact external guest identity does not match the selected profile guest identity.',
      );
    }
    if (
      await hasSessionFactsPendingHourlyReplay(this.prisma, {
        tenantId: user.tenantId,
        factId: factRow.id,
        factTypes: [factRow.factType],
        profileId: factRow.profileId,
        happenedAtGte: factRow.happenedAt,
      })
    ) {
      throw new ConflictException(
        'The selected session fact predates the hourly-session source replay. Synchronize its source and retry preview.',
      );
    }
    const sessionExternalId = normalizedString(factRow.sessionExternalId);
    if (!sessionExternalId) {
      throw new ConflictException(
        'The play-time fact has no stable sessionExternalId.',
      );
    }
    const stableExternalId = sessionExternalId;
    const originKeys = exactPlayTimeOriginKeys({
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      sourceKind: factRow.sourceKind,
      sessionExternalId,
    });
    const expectedSessionType = replaySessionTypeFromFactType(factRow.factType);
    const processDto: PhysicalPlayTimeProcessEventDto = {
      profileId: factRow.profileId,
      guestId: factRow.guestId,
      storeId: factRow.storeId,
      eventType: 'PLAY_HOUR',
      occurredAt: factRow.happenedAt.toISOString(),
      sessionMinutes: factRow.durationMinutes,
      sessionType: expectedSessionType,
      sessionPacket: replaySessionPacket(expectedSessionType),
      sourceFactId: factRow.id,
      sourceFactKind: 'GUEST_SESSION',
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      externalId: stableExternalId,
      sourceKind: factRow.sourceKind,
      sessionExternalId,
      suppressLootBoxRewards: true,
      payload: {
        exactCanonicalization: true,
        factType: factRow.factType,
        confidence: 'EXACT',
        sourceKind: factRow.sourceKind,
        sessionExternalId,
      },
    };
    const externalEventId = [
      'guest-game',
      'GUEST_SESSION',
      'PLAY_HOUR',
      stableExternalId,
    ].join(':');
    const [receiptBinding, events] = await Promise.all([
      this.findExactCanonicalReceipt(user.tenantId, originKeys),
      this.prisma.guestGameEvent.findMany({
        where: {
          tenantId: user.tenantId,
          OR: [
            { originKey: { in: originKeys.all } },
            {
              externalProvider: factRow.externalProvider,
              externalDomain: factRow.externalDomain,
              externalId: externalEventId,
            },
          ],
        },
        select: exactCanonicalEventSelect,
        take: 3,
      }),
    ]);
    const uniqueEvents = new Map(events.map((event) => [event.id, event]));
    if (uniqueEvents.size > 1) {
      throw new ConflictException(
        'originKey and external reference resolve to different canonical events.',
      );
    }
    const event = [...uniqueEvents.values()][0] ?? null;
    const eventOriginKey =
      event?.originKey && originKeys.all.includes(event.originKey)
        ? event.originKey
        : null;
    if (
      receiptBinding &&
      eventOriginKey &&
      receiptBinding.originKey !== eventOriginKey
    ) {
      throw new ConflictException(
        'The receipt and canonical event resolve through different PLAY_TIME origins.',
      );
    }
    const originKey =
      receiptBinding?.originKey ?? eventOriginKey ?? originKeys.canonical;
    const prepared: PreparedExactCanonicalization = {
      tenantId: user.tenantId,
      fact: {
        id: factRow.id,
        profileId: factRow.profileId,
        guestId: factRow.guestId,
        profileGuestId: profile.guestId,
        storeId: factRow.storeId,
        factType: factRow.factType,
        happenedAt: factRow.happenedAt,
        durationMinutes: factRow.durationMinutes,
        confidence: factRow.confidence,
        externalProvider: factRow.externalProvider,
        externalDomain: factRow.externalDomain,
        externalGuestId: factRow.externalGuestId,
        profileGuestExternalProvider: profile.guest?.externalProvider ?? null,
        profileGuestExternalDomain: profile.guest?.externalDomain ?? null,
        profileGuestExternalId: profile.guest?.externalGuestId ?? null,
        sourceKind: factRow.sourceKind,
        sourceHash: factRow.sourceHash,
        sourceExternalId: factRow.sourceExternalId,
        sessionExternalId,
        stableExternalId,
        updatedAt: factRow.updatedAt,
      },
      processDto,
      originKey,
      externalEventId,
      expectedSessionType,
      receipt: receiptBinding?.receipt ?? null,
      event,
      confirmationHash: '',
    };
    if (prepared.receipt) {
      this.assertExactReceiptBinding(prepared, prepared.receipt);
    }
    if (prepared.event) {
      this.assertExactCanonicalEvent(prepared, prepared.event, {
        allowMissingOriginKey: !(
          prepared.receipt &&
          canonicalizationTerminalReceiptStatuses.has(prepared.receipt.status)
        ),
      });
      await this.assertExactCanonicalEventPristine(prepared, prepared.event);
    }
    if (
      prepared.receipt?.eventId &&
      (!prepared.event || prepared.event.id !== prepared.receipt.eventId)
    ) {
      throw new ConflictException(
        'The receipt eventId does not resolve to the exact canonical event.',
      );
    }
    prepared.confirmationHash = sha256({
      schemaVersion: 1,
      tenantId: prepared.tenantId,
      factId: prepared.fact.id,
      profileId: prepared.fact.profileId,
      factUpdatedAt: prepared.fact.updatedAt.toISOString(),
      factType: prepared.fact.factType,
      happenedAt: prepared.fact.happenedAt.toISOString(),
      durationMinutes: prepared.fact.durationMinutes,
      guestId: prepared.fact.guestId,
      profileGuestId: prepared.fact.profileGuestId,
      storeId: prepared.fact.storeId,
      externalProvider: prepared.fact.externalProvider,
      externalDomain: prepared.fact.externalDomain,
      externalGuestId: prepared.fact.externalGuestId,
      profileGuestExternalProvider: prepared.fact.profileGuestExternalProvider,
      profileGuestExternalDomain: prepared.fact.profileGuestExternalDomain,
      profileGuestExternalId: prepared.fact.profileGuestExternalId,
      sourceKind: prepared.fact.sourceKind,
      sourceHash: prepared.fact.sourceHash,
      sourceExternalId: prepared.fact.sourceExternalId,
      sessionExternalId: prepared.fact.sessionExternalId,
      stableExternalId: prepared.fact.stableExternalId,
      externalEventId: prepared.externalEventId,
      expectedSessionType: prepared.expectedSessionType,
      sessionPacket: replaySessionPacket(prepared.expectedSessionType),
      originKey: prepared.originKey,
      eventId: prepared.event?.id ?? null,
      receiptId: prepared.receipt?.id ?? null,
      receiptStatus: prepared.receipt?.status ?? null,
      receiptAttempts: prepared.receipt?.attempts ?? 0,
      receiptUpdatedAt: prepared.receipt?.updatedAt.toISOString() ?? null,
    });
    return prepared;
  }

  private async assertExactFactStillMatchesAfterClaim(
    prepared: PreparedExactCanonicalization,
  ) {
    const unchanged = await this.prisma.guestActivityFact.findFirst({
      where: {
        id: prepared.fact.id,
        tenantId: prepared.tenantId,
        profileId: prepared.fact.profileId,
        guestId: prepared.fact.guestId,
        storeId: prepared.fact.storeId,
        lifecycleStatus: 'ACTIVE',
        confidence: 'EXACT',
        supersededAt: null,
        updatedAt: prepared.fact.updatedAt,
        factType: prepared.fact.factType,
        happenedAt: prepared.fact.happenedAt,
        durationMinutes: prepared.fact.durationMinutes,
        externalProvider: prepared.fact.externalProvider,
        externalDomain: prepared.fact.externalDomain,
        externalGuestId: prepared.fact.externalGuestId,
        sourceKind: prepared.fact.sourceKind,
        sourceHash: prepared.fact.sourceHash,
        sourceExternalId: prepared.fact.sourceExternalId,
        sessionExternalId: prepared.fact.sessionExternalId,
      },
      select: { id: true },
    });
    if (!unchanged) {
      throw new ConflictException(
        'The exact fact changed after receipt claim; canonicalization was aborted.',
      );
    }
  }

  private async assertExactCanonicalEventPristine(
    prepared: PreparedExactCanonicalization,
    event: ExactCanonicalEventRow,
  ) {
    const payload = jsonRecord(event.payload);
    if (
      payloadMaterializationPresent(payload.rules) ||
      payloadMaterializationPresent(payload.rewardIntents)
    ) {
      throw new ConflictException(
        'The canonical event payload already contains rule or reward materialization.',
      );
    }

    const [rewardIntents, rewards, xpPostings, ruleDecisions] =
      await Promise.all([
        this.prisma.guestGameRewardIntent.findMany({
          where: {
            tenantId: prepared.tenantId,
            OR: [{ eventId: event.id }, { originKey: prepared.originKey }],
          },
          select: { id: true, rewardId: true },
          take: 2,
        }),
        this.prisma.guestGameReward.findMany({
          where: {
            tenantId: prepared.tenantId,
            OR: [
              { originKey: prepared.originKey },
              {
                externalProvider: prepared.fact.externalProvider,
                externalDomain: prepared.fact.externalDomain,
                externalId: {
                  startsWith: `${prepared.externalEventId}:reward:`,
                },
              },
            ],
          },
          select: { id: true },
          take: 2,
        }),
        this.prisma.guestGameXpPosting.count({
          where: { tenantId: prepared.tenantId, eventId: event.id },
        }),
        this.prisma.guestGameRuleDecision.count({
          where: { tenantId: prepared.tenantId, eventId: event.id },
        }),
      ]);
    const rewardIds = [
      ...new Set([
        ...rewards.map((reward) => reward.id),
        ...rewardIntents.flatMap((intent) =>
          intent.rewardId ? [intent.rewardId] : [],
        ),
      ]),
    ];
    const entitlementBindings: Prisma.GuestGameEntitlementWhereInput[] = [
      { eventId: event.id },
      { originKey: prepared.originKey },
    ];
    if (rewardIds.length) {
      entitlementBindings.push({ rewardId: { in: rewardIds } });
    }
    const [rewardEffects, entitlements] = await Promise.all([
      rewardIds.length
        ? this.prisma.guestGameRewardEffect.count({
            where: {
              tenantId: prepared.tenantId,
              rewardId: { in: rewardIds },
            },
          })
        : Promise.resolve(0),
      this.prisma.guestGameEntitlement.count({
        where: {
          tenantId: prepared.tenantId,
          OR: entitlementBindings,
        },
      }),
    ]);
    if (
      rewardIntents.length ||
      rewards.length ||
      rewardEffects ||
      entitlements ||
      xpPostings ||
      ruleDecisions
    ) {
      throw new ConflictException(
        'The canonical event already has persisted rule, XP, reward, effect or entitlement materialization.',
      );
    }
  }

  private async findExactCanonicalReceipt(
    tenantId: string,
    originKeys: ExactPlayTimeOriginKeys,
  ): Promise<ExactCanonicalReceiptBinding | null> {
    const candidates = await Promise.all(
      originKeys.all.map(async (originKey) => ({
        originKey,
        receipt: await this.prisma.guestGameOriginReceipt.findUnique({
          where: {
            tenantId_originKey: { tenantId, originKey },
          },
          select: exactCanonicalReceiptSelect,
        }),
      })),
    );
    const matches = candidates.filter(
      (
        candidate,
      ): candidate is {
        originKey: string;
        receipt: ExactCanonicalReceiptRow;
      } => Boolean(candidate.receipt),
    );
    const receiptIds = new Set(matches.map(({ receipt }) => receipt.id));
    if (receiptIds.size > 1) {
      throw new ConflictException(
        'Both v2 and legacy PLAY_TIME receipts exist for one physical session.',
      );
    }
    return matches[0] ?? null;
  }

  private async ensureExactCanonicalizationReceipt(
    prepared: PreparedExactCanonicalization,
  ): Promise<ExactCanonicalReceiptRow> {
    if (prepared.receipt) return prepared.receipt;
    try {
      return await this.prisma.guestGameOriginReceipt.create({
        data: {
          tenantId: prepared.tenantId,
          originKey: prepared.originKey,
          factId: prepared.fact.id,
          eventType: 'PLAY_HOUR',
          externalProvider: prepared.fact.externalProvider,
          externalDomain: prepared.fact.externalDomain,
          policy: 'EXACT_OPERATOR_CANONICALIZATION',
          status: 'WAITING_LIVE',
          claimedSource: null,
          ledgerFirstSeenAt: new Date(),
          graceUntil: new Date(0),
        },
        select: exactCanonicalReceiptSelect,
      });
    } catch {
      const concurrent = await this.prisma.guestGameOriginReceipt.findUnique({
        where: {
          tenantId_originKey: {
            tenantId: prepared.tenantId,
            originKey: prepared.originKey,
          },
        },
        select: exactCanonicalReceiptSelect,
      });
      if (!concurrent) throw new ConflictException('Receipt creation failed.');
      return concurrent;
    }
  }

  private assertExactReceiptBinding(
    prepared: PreparedExactCanonicalization,
    receipt: ExactCanonicalReceiptRow,
  ) {
    if (
      receipt.factId !== prepared.fact.id ||
      canonicalGuestGameEventType(receipt.eventType) !== 'PLAY_HOUR' ||
      receipt.externalProvider !== prepared.fact.externalProvider ||
      receipt.externalDomain !== prepared.fact.externalDomain
    ) {
      throw new ConflictException(
        'The origin receipt is already bound to a different fact, event type, provider or domain.',
      );
    }
  }

  private async reconcileAndValidateExactCanonicalEvent(
    prepared: PreparedExactCanonicalization,
    eventId: string,
  ): Promise<ExactCanonicalEventRow> {
    let event = await this.prisma.guestGameEvent.findFirst({
      where: { id: eventId, tenantId: prepared.tenantId },
      select: exactCanonicalEventSelect,
    });
    if (!event) {
      throw new ConflictException('The canonical event was not persisted.');
    }
    this.assertExactCanonicalEvent(prepared, event, {
      allowMissingOriginKey: true,
    });
    if (!event.originKey) {
      try {
        const reconciled = await this.prisma.guestGameEvent.updateMany({
          where: {
            id: event.id,
            tenantId: prepared.tenantId,
            originKey: null,
          },
          data: { originKey: prepared.originKey },
        });
        if (reconciled.count !== 1) {
          throw new ConflictException(
            'The canonical event originKey changed concurrently.',
          );
        }
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        throw new ConflictException(
          'Could not reconcile the canonical event originKey safely.',
        );
      }
      event = await this.prisma.guestGameEvent.findFirst({
        where: { id: event.id, tenantId: prepared.tenantId },
        select: exactCanonicalEventSelect,
      });
      if (!event) {
        throw new ConflictException(
          'The reconciled canonical event disappeared.',
        );
      }
    }
    this.assertExactCanonicalEvent(prepared, event);
    return event;
  }

  private assertExactCanonicalEvent(
    prepared: PreparedExactCanonicalization,
    event: ExactCanonicalEventRow,
    options: { allowMissingOriginKey?: boolean } = {},
  ) {
    const payload = jsonRecord(event.payload);
    const input = jsonRecord(payload.input);
    const payloadStore = jsonRecord(payload.store);
    const expectedPacket = replaySessionPacket(prepared.expectedSessionType);
    if (
      event.profileId !== prepared.fact.profileId ||
      event.guestId !== prepared.fact.guestId ||
      canonicalGuestGameEventType(event.eventType) !== 'PLAY_HOUR' ||
      event.externalProvider !== prepared.fact.externalProvider ||
      event.externalDomain !== prepared.fact.externalDomain ||
      event.externalId !== prepared.externalEventId ||
      (event.originKey !== prepared.originKey &&
        !(options.allowMissingOriginKey && event.originKey === null)) ||
      event.xpDelta !== 0 ||
      event.occurredAt.getTime() !== prepared.fact.happenedAt.getTime() ||
      normalizedString(payload.sourceFactId) !== prepared.fact.id ||
      normalizedString(payload.sourceFactKind) !== 'GUEST_SESSION' ||
      normalizedString(payloadStore.id) !== prepared.fact.storeId ||
      numberValue(input.sessionMinutes, -1) !== prepared.fact.durationMinutes ||
      normalizedString(input.sessionType) !== prepared.expectedSessionType ||
      input.sessionPacket !== expectedPacket
    ) {
      throw new ConflictException(
        'The canonical event does not exactly match the selected fact profile/type/domain/time/source/session fields.',
      );
    }
  }

  private exactCanonicalizationResult(
    prepared: PreparedExactCanonicalization,
    mode: GuestGameExactPlayTimeCanonicalizationResult['mode'],
    outcome: GuestGameExactPlayTimeCanonicalizationResult['outcome'],
    note: string,
  ): GuestGameExactPlayTimeCanonicalizationResult {
    return {
      mode,
      outcome,
      confirmationHash: prepared.confirmationHash,
      expectedFactUpdatedAt: prepared.fact.updatedAt.toISOString(),
      fact: {
        id: prepared.fact.id,
        profileId: prepared.fact.profileId,
        factType: prepared.fact.factType,
        happenedAt: prepared.fact.happenedAt.toISOString(),
        durationMinutes: prepared.fact.durationMinutes,
        confidence: prepared.fact.confidence,
      },
      canonical: {
        eventType: 'PLAY_HOUR',
        originKey: prepared.originKey,
        stableExternalId: prepared.fact.stableExternalId,
        eventId: prepared.event?.id ?? null,
        eventValidated: Boolean(prepared.event),
      },
      receipt: {
        id: prepared.receipt?.id ?? null,
        status: prepared.receipt?.status ?? null,
        attempts: prepared.receipt?.attempts ?? 0,
        claimExpiresAt: prepared.receipt?.claimExpiresAt?.toISOString() ?? null,
      },
      safety: {
        xpDelta: 0,
        allowedRuleIds: [],
        materializeRewards: false,
      },
      note,
    };
  }

  private async prepare(
    user: AuthenticatedUser,
    dto: GuestGameBattlePassReplayPreviewDto,
  ): Promise<PreparedReplay> {
    const factId = requiredId(dto.factId, 'factId');
    const profileId = requiredId(dto.profileId, 'profileId');
    const seasonId = requiredId(dto.seasonId, 'seasonId');
    const stepId = requiredId(dto.stepId, 'stepId');
    const stepSequence = positiveInteger(dto.stepSequence, 'stepSequence');
    const [factRow, seasonRow] = await Promise.all([
      this.prisma.guestActivityFact.findFirst({
        where: { id: factId, tenantId: user.tenantId },
      }),
      this.prisma.guestGameSeason.findFirst({
        where: { id: seasonId, tenantId: user.tenantId },
      }),
    ]);
    if (!factRow)
      throw new NotFoundException('Факт игрового журнала не найден.');
    if (!seasonRow) throw new NotFoundException('Сезон Battle Pass не найден.');
    if (
      factRow.lifecycleStatus !== 'ACTIVE' ||
      factRow.supersededAt ||
      factRow.confidence !== 'EXACT'
    ) {
      throw new ConflictException(
        'Replay разрешён только для ACTIVE, EXACT и не superseded факта.',
      );
    }
    if (!replayFactTypes.has(factRow.factType)) {
      throw new BadRequestException(
        'Первый безопасный replay поддерживает только факты игрового времени.',
      );
    }
    if (!factRow.profileId || !factRow.happenedAt || !factRow.durationMinutes) {
      throw new ConflictException(
        'Факт не содержит profileId, happenedAt или durationMinutes.',
      );
    }
    if (factRow.profileId !== profileId) {
      throw new NotFoundException(
        'Факт не принадлежит указанному игровому профилю.',
      );
    }
    if (
      await hasSessionFactsPendingHourlyReplay(this.prisma, {
        tenantId: user.tenantId,
        factId: factRow.id,
        factTypes: [factRow.factType],
        profileId: factRow.profileId,
        happenedAtGte: factRow.happenedAt,
      })
    ) {
      throw new ConflictException(
        'The selected session fact predates the hourly-session source replay. Synchronize its source and retry preview.',
      );
    }
    if (seasonRow.status !== 'ACTIVE') {
      throw new ConflictException(
        'Replay разрешён только для ACTIVE Battle Pass.',
      );
    }

    const sessionExternalId = normalizedString(factRow.sessionExternalId);
    if (!sessionExternalId) {
      throw new ConflictException('У факта нет стабильного sessionExternalId.');
    }
    const stableExternalId = sessionExternalId;
    const originKeys = exactPlayTimeOriginKeys({
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      sourceKind: factRow.sourceKind,
      sessionExternalId,
    });
    const steps = canonicalSteps(seasonRow.levels);
    const step = steps.find((item) => item.id === stepId);
    if (!step) {
      throw new NotFoundException('Стабильный stepId не найден в Battle Pass.');
    }
    if (step.sequence !== stepSequence) {
      throw new ConflictException(
        'stepId и canonical stepSequence больше не соответствуют друг другу.',
      );
    }
    const activationRules = jsonRecord(step.raw.activationRules);
    if (
      numberValue(activationRules.schemaVersion, 1) !== 2 ||
      normalizedString(activationRules.taskType)?.toUpperCase() !==
        'PLAY_TIME' ||
      !guestGamePolicyAllowsEvaluation(
        guestGameBattlePassStepEvaluationPolicy(activationRules),
        'LIVE_LEDGER_FALLBACK',
      )
    ) {
      throw new ConflictException(
        'Replay разрешён только для v2 PLAY_TIME шага с LIVE_WITH_LEDGER_FALLBACK.',
      );
    }
    if (
      factRow.factType === 'SESSION_PLAY_TIME_ACCUMULATED' &&
      normalizedString(activationRules.sessionType)?.toUpperCase() !== 'ANY'
    ) {
      throw new ConflictException(
        'Neutral play-time facts can be replayed only for a PLAY_TIME step with sessionType=ANY.',
      );
    }

    const selectedStoreIds = replayJsonStringArray(seasonRow.storeIds);
    const selectedStores = selectedStoreIds.length
      ? await this.prisma.store.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: selectedStoreIds },
            isActive: true,
          },
          select: { id: true, externalDomain: true, timeZone: true },
        })
      : [];
    const ruleRouting = replaySeasonRuleRouting(
      seasonRow.id,
      selectedStoreIds,
      selectedStores,
    );

    const processDto: PhysicalPlayTimeProcessEventDto = {
      profileId: factRow.profileId,
      guestId: factRow.guestId,
      storeId: factRow.storeId,
      eventType: 'PLAY_HOUR',
      occurredAt: factRow.happenedAt.toISOString(),
      sessionMinutes: factRow.durationMinutes,
      sessionType: replaySessionTypeFromFactType(factRow.factType),
      sessionPacket: replaySessionPacket(
        replaySessionTypeFromFactType(factRow.factType),
      ),
      sourceFactId: factRow.id,
      sourceFactKind: 'GUEST_SESSION',
      externalProvider: factRow.externalProvider,
      externalDomain: factRow.externalDomain,
      externalId: stableExternalId,
      sourceKind: factRow.sourceKind,
      sessionExternalId,
      suppressLootBoxRewards: true,
      payload: {
        replay: true,
        factType: factRow.factType,
        confidence: factRow.confidence,
        sourceKind: factRow.sourceKind,
        sessionExternalId,
      },
    };
    const originReceiptBinding = await this.findReplayOriginReceipt(
      user.tenantId,
      originKeys,
    );
    const originKey = originReceiptBinding?.originKey ?? originKeys.canonical;

    const claimKey = `season:${seasonRow.id}:profile:${factRow.profileId}:step:${step.sequence}`;
    const [dryRun, event, existingIntent] = await Promise.all([
      this.gamification.dryRun(user, processDto, {
        rewardScope: {
          seasonId: seasonRow.id,
          profileId: factRow.profileId,
          guestId: factRow.guestId,
        },
        ruleDomainTimeZones: ruleRouting.ruleDomainTimeZones,
        ruleExternalDomains: ruleRouting.ruleExternalDomains,
      }),
      this.findCanonicalEvent(
        user.tenantId,
        originKey,
        processDto,
        factRow.externalProvider,
      ),
      this.findIntent(user.tenantId, claimKey),
    ]);
    const originReceipt = originReceiptBinding?.receipt ?? null;
    const matchingRules = dryRun.rules.filter(
      (rule) =>
        rule.kind === 'SEASON' &&
        rule.id === seasonRow.id &&
        rule.battlePassStep === step.sequence,
    );
    const rule = existingIntent
      ? replayRuleFromIntent(existingIntent.plan)
      : matchingRules.length === 1
        ? matchingRules[0]
        : null;
    if (!rule) {
      throw new ConflictException(
        'Выбранный шаг не является текущим единственным шагом Battle Pass для гостя.',
      );
    }
    const slotKey = `${step.sequence}:${rule.rewardType ?? 'reward'}`;
    if (
      !originReceipt ||
      originReceipt.factId !== factRow.id ||
      originReceipt.eventType !== 'PLAY_HOUR' ||
      !replayReceiptStatuses.has(originReceipt.status)
    ) {
      throw new ConflictException(
        'Для факта нет согласованного terminal origin receipt, пригодного для rule-scoped replay.',
      );
    }
    if (
      event &&
      (!originReceipt.eventId || event.id !== originReceipt.eventId)
    ) {
      throw new ConflictException(
        'Origin receipt и каноническое событие расходятся; replay остановлен без записи.',
      );
    }
    if (
      event &&
      (event.profileId !== factRow.profileId || event.eventType !== 'PLAY_HOUR')
    ) {
      throw new ConflictException(
        'Каноническое событие связано с другим профилем или типом события.',
      );
    }
    const eventId = event?.id ?? null;
    const preparedForHash = {
      factId: factRow.id,
      factUpdatedAt: factRow.updatedAt.toISOString(),
      factType: factRow.factType,
      happenedAt: factRow.happenedAt.toISOString(),
      durationMinutes: factRow.durationMinutes,
      profileId: factRow.profileId,
      originKey,
      eventId,
      seasonId: seasonRow.id,
      seasonUpdatedAt: seasonRow.updatedAt.toISOString(),
      stepId: step.id,
      stepSequence: step.sequence,
      slotKey,
      routing: replaySeasonRuleRoutingSnapshot(seasonRow.id, ruleRouting),
      eligible: rule.eligible,
      rewardType: rule.rewardType,
      rewardAmount: rule.rewardAmount,
      rewardLabel: rule.rewardLabel,
      selectedRewardLabel: rule.selectedRewardLabel,
      manualApprovalRequired: rule.manualApprovalRequired,
      xpDelta: rule.xpDelta,
      reasons: rule.reasons,
      blockers: rule.blockers,
      progress: rule.progress,
    };

    return {
      tenantId: user.tenantId,
      fact: {
        id: factRow.id,
        profileId: factRow.profileId,
        guestId: factRow.guestId,
        storeId: factRow.storeId,
        factType: factRow.factType,
        happenedAt: factRow.happenedAt,
        durationMinutes: factRow.durationMinutes,
        confidence: factRow.confidence,
        externalProvider: factRow.externalProvider,
        externalDomain: factRow.externalDomain,
        sourceKind: factRow.sourceKind,
        sessionExternalId,
        stableExternalId,
        updatedAt: factRow.updatedAt,
      },
      season: {
        id: seasonRow.id,
        name: seasonRow.name,
        updatedAt: seasonRow.updatedAt,
      },
      step: { id: step.id, sequence: step.sequence, title: step.title },
      rule,
      processDto,
      ruleDomainTimeZones: ruleRouting.ruleDomainTimeZones,
      ruleExternalDomains: ruleRouting.ruleExternalDomains,
      originKey,
      eventId,
      originReceiptStatus: originReceipt?.status ?? null,
      slotKey,
      claimKey,
      confirmationHash: sha256(preparedForHash),
      existingIntent,
    };
  }

  private async findReplayOriginReceipt(
    tenantId: string,
    originKeys: ExactPlayTimeOriginKeys,
  ): Promise<ReplayOriginReceiptBinding | null> {
    const candidates = await Promise.all(
      originKeys.all.map(async (originKey) => ({
        originKey,
        receipt: await this.prisma.guestGameOriginReceipt.findUnique({
          where: {
            tenantId_originKey: { tenantId, originKey },
          },
          select: {
            factId: true,
            eventId: true,
            eventType: true,
            status: true,
          },
        }),
      })),
    );
    const matches = candidates.filter(
      (
        candidate,
      ): candidate is {
        originKey: string;
        receipt: ReplayOriginReceiptRow;
      } => Boolean(candidate.receipt),
    );
    const eventIds = new Set(
      matches
        .map(({ receipt }) => receipt.eventId)
        .filter((eventId): eventId is string => Boolean(eventId)),
    );
    if (matches.length > 1 && eventIds.size > 1) {
      throw new ConflictException(
        'The v2 and legacy PLAY_TIME receipts resolve to different events.',
      );
    }
    return matches[0] ?? null;
  }

  private async findCanonicalEvent(
    tenantId: string,
    originKey: string,
    dto: GuestGameProcessEventDto,
    externalProvider: IntegrationProvider,
  ) {
    const originEvent = await this.prisma.guestGameEvent.findFirst({
      where: { tenantId, originKey },
      select: { id: true, profileId: true, eventType: true },
    });
    if (originEvent) return originEvent;

    const externalId = [
      'guest-game',
      normalizedString(dto.sourceFactKind) ?? 'snapshot',
      'PLAY_HOUR',
      normalizedString(dto.externalId),
    ].join(':');
    return this.prisma.guestGameEvent.findFirst({
      where: {
        tenantId,
        externalProvider,
        externalDomain: normalizedString(dto.externalDomain),
        externalId,
      },
      select: { id: true, profileId: true, eventType: true },
    });
  }

  private assertExistingIntent(prepared: PreparedReplay) {
    const intent = prepared.existingIntent;
    if (!intent) return;
    if (!replayIntentStatuses.has(intent.status)) {
      throw new ConflictException(
        'Существующий rule-scoped intent имеет неподдерживаемый статус и требует отдельного guarded requeue.',
      );
    }
    const plan = jsonRecord(intent.plan);
    const rule = jsonRecord(plan.rule);
    const rewardType = normalizedString(rule.rewardType);
    const rewardAmount = nullableNumber(rule.rewardAmount);
    const rewardLabel = normalizedString(rule.rewardLabel);
    const expectedSlotKey = `${prepared.step.sequence}:${rewardType ?? 'reward'}`;
    if (
      numberValue(plan.schemaVersion, -1) !== 1 ||
      normalizedString(rule.kind) !== 'SEASON' ||
      normalizedString(rule.id) !== prepared.season.id ||
      numberValue(rule.battlePassStep, -1) !== prepared.step.sequence ||
      rule.eligible !== true ||
      numberValue(rule.xpDelta, -1) !== 0 ||
      !normalizedString(rule.selectedRewardLabel) ||
      normalizedString(plan.slotKey) !== expectedSlotKey ||
      prepared.slotKey !== expectedSlotKey ||
      intent.profileId !== prepared.fact.profileId ||
      intent.ruleType !== 'SEASON' ||
      intent.ruleId !== prepared.season.id ||
      intent.effectKind !== 'REWARD' ||
      intent.slotKey !== prepared.slotKey ||
      intent.claimKey !== prepared.claimKey ||
      intent.event.profileId !== prepared.fact.profileId ||
      intent.event.eventType !== 'PLAY_HOUR' ||
      (intent.rewardId &&
        (!intent.reward ||
          intent.reward.tenantId !== prepared.tenantId ||
          intent.reward.profileId !== prepared.fact.profileId ||
          intent.reward.seasonId !== prepared.season.id ||
          intent.reward.rewardType !== rewardType ||
          Number(intent.reward.rewardAmount) !== rewardAmount ||
          intent.reward.rewardLabel !== rewardLabel))
    ) {
      throw new ConflictException(
        'Существующий claimKey связан с несовместимым планом награды.',
      );
    }
  }

  private findIntent(tenantId: string, claimKey: string) {
    return this.prisma.guestGameRewardIntent.findUnique({
      where: {
        tenantId_claimKey: { tenantId, claimKey },
        effectKind: 'REWARD',
      },
      select: {
        id: true,
        eventId: true,
        profileId: true,
        rewardId: true,
        originKey: true,
        ruleType: true,
        ruleId: true,
        effectKind: true,
        slotKey: true,
        claimKey: true,
        status: true,
        plan: true,
        event: { select: { profileId: true, eventType: true } },
        reward: {
          select: {
            tenantId: true,
            profileId: true,
            seasonId: true,
            rewardType: true,
            rewardAmount: true,
            rewardLabel: true,
          },
        },
      },
    });
  }

  private assertExpectedVersion(value: unknown, actual: Date, label: string) {
    const expected = dateValue(value);
    if (!expected) {
      throw new BadRequestException(
        `Для apply укажите expectedUpdatedAt ${label}.`,
      );
    }
    if (expected.getTime() !== actual.getTime()) {
      throw new ConflictException(
        `Версия ${label} изменилась после preview. Выполните dry-run заново.`,
      );
    }
  }

  private result(
    prepared: PreparedReplay,
    mode: GuestGameBattlePassReplayResult['mode'],
    outcome: GuestGameBattlePassReplayResult['outcome'],
    createdRewards: number,
    rewardIds: string[],
    note: string,
  ): GuestGameBattlePassReplayResult {
    return {
      mode,
      outcome,
      confirmationHash: prepared.confirmationHash,
      expectedFactUpdatedAt: prepared.fact.updatedAt.toISOString(),
      expectedSeasonUpdatedAt: prepared.season.updatedAt.toISOString(),
      fact: {
        id: prepared.fact.id,
        factType: prepared.fact.factType,
        happenedAt: prepared.fact.happenedAt.toISOString(),
        durationMinutes: prepared.fact.durationMinutes,
        confidence: prepared.fact.confidence,
      },
      target: {
        seasonId: prepared.season.id,
        seasonName: prepared.season.name,
        stepId: prepared.step.id,
        stepSequence: prepared.step.sequence,
        stepTitle: prepared.step.title,
        slotKey: prepared.slotKey,
        profileId: prepared.fact.profileId,
      },
      source: {
        originKey: prepared.originKey,
        eventId: prepared.eventId,
        originReceiptStatus: prepared.originReceiptStatus,
      },
      decision: {
        eligible: prepared.rule.eligible,
        status: prepared.rule.eligible ? 'MATCHED' : 'BLOCKED',
        rewardType: prepared.rule.rewardType,
        rewardAmount: prepared.rule.rewardAmount,
        rewardLabel: prepared.rule.rewardLabel,
        selectedRewardLabel: prepared.rule.selectedRewardLabel,
        manualApprovalRequired: prepared.rule.manualApprovalRequired,
        xpDelta: prepared.rule.xpDelta,
        reasons: prepared.rule.reasons,
        blockers: prepared.rule.blockers,
        progress: prepared.rule.progress,
      },
      intent: prepared.existingIntent
        ? {
            id: prepared.existingIntent.id,
            status: prepared.existingIntent.status,
            eventId: prepared.existingIntent.eventId,
            rewardId: prepared.existingIntent.rewardId,
          }
        : null,
      createdRewards,
      rewardIds,
      note,
    };
  }
}

function canonicalSteps(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, originalIndex) => {
      const raw = jsonRecord(item);
      const level = numberValue(raw.level, originalIndex + 1);
      const id = normalizedString(raw.id);
      if (level <= 0) return null;
      return {
        id,
        level,
        originalIndex,
        title: normalizedString(raw.title),
        raw,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.level - right.level)
    .map((item, index) => ({ ...item, sequence: index + 1 }))
    .filter((item): item is typeof item & { id: string } => Boolean(item.id));
}

function replayJsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(normalizedString)
        .filter((item): item is string => Boolean(item))
    : [];
}

function replaySeasonRuleRouting(
  seasonId: string,
  selectedStoreIds: string[],
  stores: Array<{
    id: string;
    externalDomain: string | null;
    timeZone: string | null;
  }>,
) {
  const selectedStoreIdSet = new Set(selectedStoreIds);
  const scopedStores = stores.filter((store) =>
    selectedStoreIdSet.has(store.id),
  );
  const domains = [
    ...new Set(
      scopedStores
        .map((store) => normalizedString(store.externalDomain))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
  const storesByDomain = new Map<string, typeof scopedStores>();
  for (const store of scopedStores) {
    const domain = normalizedString(store.externalDomain);
    if (!domain) continue;
    const domainStores = storesByDomain.get(domain) ?? [];
    domainStores.push(store);
    storesByDomain.set(domain, domainStores);
  }
  const domainTimeZones = new Map(
    [...storesByDomain.entries()].map(([domain, domainStores]) => {
      const timeZones = new Set(
        domainStores
          .map((store) => normalizedString(store.timeZone))
          .filter((timeZone): timeZone is string => Boolean(timeZone)),
      );
      const everyStoreHasTimeZone = domainStores.every((store) =>
        Boolean(normalizedString(store.timeZone)),
      );
      return [
        domain,
        everyStoreHasTimeZone && timeZones.size === 1
          ? [...timeZones][0]
          : null,
      ] as const;
    }),
  );

  return {
    ruleExternalDomains: new Map([[seasonId, domains]]),
    ruleDomainTimeZones: new Map([[seasonId, domainTimeZones]]),
  };
}

function replaySeasonRuleRoutingSnapshot(
  seasonId: string,
  routing: {
    ruleExternalDomains: ReadonlyMap<string, readonly string[]>;
    ruleDomainTimeZones: ReadonlyMap<
      string,
      ReadonlyMap<string, string | null>
    >;
  },
) {
  const domains = [...(routing.ruleExternalDomains.get(seasonId) ?? [])].sort();
  const domainTimeZones = routing.ruleDomainTimeZones.get(seasonId);
  return {
    domains,
    domainTimeZones: domains.map((domain) => ({
      domain,
      timeZone: domainTimeZones?.get(domain) ?? null,
    })),
  };
}

const exactCanonicalReceiptSelect = {
  id: true,
  factId: true,
  eventId: true,
  eventType: true,
  externalProvider: true,
  externalDomain: true,
  status: true,
  claimedSource: true,
  attempts: true,
  claimExpiresAt: true,
  updatedAt: true,
} satisfies Prisma.GuestGameOriginReceiptSelect;

const exactCanonicalEventSelect = {
  id: true,
  profileId: true,
  guestId: true,
  eventType: true,
  externalProvider: true,
  externalDomain: true,
  externalId: true,
  originKey: true,
  xpDelta: true,
  occurredAt: true,
  payload: true,
} satisfies Prisma.GuestGameEventSelect;

function exactCanonicalizationPreviewOutcome(
  prepared: PreparedExactCanonicalization,
): GuestGameExactPlayTimeCanonicalizationResult['outcome'] {
  const receipt = prepared.receipt;
  if (receipt && canonicalizationTerminalReceiptStatuses.has(receipt.status)) {
    return receipt.eventId && prepared.event?.id === receipt.eventId
      ? 'IDEMPOTENT'
      : 'BLOCKED';
  }
  if (
    receipt?.status === 'PROCESSING' &&
    receipt.claimExpiresAt &&
    receipt.claimExpiresAt > new Date()
  ) {
    return 'BUSY';
  }
  if (
    receipt?.status === 'DEAD_LETTER' ||
    (receipt && receipt.attempts >= canonicalizationMaxAttempts)
  ) {
    return 'BLOCKED';
  }
  if (
    receipt &&
    receipt.status !== 'PROCESSING' &&
    !canonicalizationClaimableReceiptStatuses.has(receipt.status)
  ) {
    return 'BLOCKED';
  }
  return 'READY';
}

function safeCanonicalizationError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const allowlistedCodes: Array<[string, string]> = [
    ['changed after receipt claim', 'FACT_CHANGED_AFTER_CLAIM'],
    ['payload already contains', 'EVENT_PAYLOAD_MATERIALIZED'],
    ['already has persisted', 'EVENT_SIDE_EFFECTS_PRESENT'],
    ['does not exactly match', 'EVENT_BINDING_MISMATCH'],
    ['originKey changed concurrently', 'EVENT_ORIGIN_RACE'],
    ['receipt lease changed', 'RECEIPT_LEASE_CHANGED'],
    ['unexpected XP or reward', 'UNEXPECTED_SIDE_EFFECT'],
  ];
  const matched = allowlistedCodes.find(([fragment]) =>
    message.includes(fragment),
  );
  if (matched) return `EXACT_CANONICALIZATION_${matched[1]}`;
  if (error instanceof ConflictException) {
    return 'EXACT_CANONICALIZATION_CONFLICT';
  }
  if (error instanceof BadRequestException) {
    return 'EXACT_CANONICALIZATION_BAD_REQUEST';
  }
  if (error instanceof NotFoundException) {
    return 'EXACT_CANONICALIZATION_NOT_FOUND';
  }
  return 'EXACT_CANONICALIZATION_FAILED';
}

function payloadMaterializationPresent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return (
    value !== null && value !== undefined && value !== false && value !== ''
  );
}

function replayRuleFromIntent(
  value: Prisma.JsonValue,
): GuestGameDryRunRule | null {
  const plan = jsonRecord(value);
  const rule = jsonRecord(plan.rule);
  if (
    numberValue(plan.schemaVersion, -1) !== 1 ||
    normalizedString(rule.kind) !== 'SEASON'
  ) {
    return null;
  }

  return {
    id: normalizedString(rule.id) ?? '',
    kind: 'SEASON',
    name: normalizedString(rule.name) ?? '',
    status: normalizedString(rule.status) ?? 'ACTIVE',
    triggerKind: normalizedString(rule.triggerKind),
    evaluationPolicy:
      normalizedString(rule.evaluationPolicy) ?? 'LIVE_WITH_LEDGER_FALLBACK',
    manualApprovalRequired: rule.manualApprovalRequired === true,
    eligible: rule.eligible === true,
    rewardType: normalizedString(rule.rewardType),
    rewardAmount: nullableNumber(rule.rewardAmount),
    rewardLabel: normalizedString(rule.rewardLabel),
    selectedRewardLabel: normalizedString(rule.selectedRewardLabel),
    selectedReward: null,
    xpDelta: numberValue(rule.xpDelta, 0),
    budgetAmount: nullableNumber(rule.budgetAmount),
    progress: null,
    battlePassLevel: nullableNumber(rule.battlePassLevel),
    battlePassStep: nullableNumber(rule.battlePassStep),
    battlePassStepTitle: normalizedString(rule.battlePassStepTitle),
    periodicLimitPeriod: null,
    reasons: stringArray(rule.reasons),
    blockers: stringArray(rule.blockers),
  };
}

function exactEntitlementReconciliationCandidateIds(
  candidates: ExactEntitlementReconciliationCandidateRow[],
): ExactEntitlementReconciliationCandidateId[] {
  return candidates
    .map(({ entitlementId, rewardId, ruleId }) => ({
      entitlementId,
      rewardId,
      ruleId,
    }))
    .sort((left, right) =>
      `${left.entitlementId}:${left.rewardId}:${left.ruleId}`.localeCompare(
        `${right.entitlementId}:${right.rewardId}:${right.ruleId}`,
      ),
    );
}

function exactEntitlementReconciliationDigest(
  candidates: ExactEntitlementReconciliationCandidateId[],
) {
  return sha256(candidates);
}

function rollingSevenDayOverLimitCandidates(
  input: LootBoxEntitlementLimitRow[],
): LootBoxEntitlementOverLimitCandidate[] {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1_000;
  const sorted = [...input].sort((left, right) => {
    const scopeOrder = `${left.profileId}:${left.ruleId}`.localeCompare(
      `${right.profileId}:${right.ruleId}`,
    );
    if (scopeOrder !== 0) return scopeOrder;
    const timeOrder = left.qualifiedAt.getTime() - right.qualifiedAt.getTime();
    return timeOrder !== 0
      ? timeOrder
      : left.entitlementId.localeCompare(right.entitlementId);
  });
  const lastAcceptedByScope = new Map<string, LootBoxEntitlementLimitRow>();
  const candidates: LootBoxEntitlementOverLimitCandidate[] = [];

  for (const entitlement of sorted) {
    const scope = `${entitlement.profileId}:${entitlement.ruleId}`;
    const lastAccepted = lastAcceptedByScope.get(scope);
    if (
      !lastAccepted ||
      entitlement.qualifiedAt.getTime() >=
        lastAccepted.qualifiedAt.getTime() + sevenDaysMs
    ) {
      lastAcceptedByScope.set(scope, entitlement);
      continue;
    }

    if (entitlement.status === 'AVAILABLE') {
      candidates.push({
        ...entitlement,
        preservedEntitlementId: lastAccepted.entitlementId,
      });
      continue;
    }

    // A consumed entitlement is immutable. Keep it and make it the new
    // protected anchor so no later AVAILABLE row is kept inside its window.
    if (entitlement.status === 'CONSUMED') {
      lastAcceptedByScope.set(scope, entitlement);
    }
  }

  return candidates;
}

function lootBoxEntitlementOverLimitCandidateIds(
  candidates: LootBoxEntitlementOverLimitCandidate[],
): LootBoxEntitlementOverLimitCandidateId[] {
  return candidates
    .map(({ entitlementId, ruleId, preservedEntitlementId }) => ({
      entitlementId,
      ruleId,
      preservedEntitlementId,
    }))
    .sort((left, right) =>
      `${left.entitlementId}:${left.ruleId}:${left.preservedEntitlementId}`.localeCompare(
        `${right.entitlementId}:${right.ruleId}:${right.preservedEntitlementId}`,
      ),
    );
}

function lootBoxEntitlementOverLimitDigest(
  candidates: LootBoxEntitlementOverLimitCandidateId[],
) {
  return sha256(candidates);
}

function exactPlayTimeOriginKeys(input: {
  externalProvider: string;
  externalDomain: string;
  sourceKind: string;
  sessionExternalId: string;
}): ExactPlayTimeOriginKeys {
  const canonical = buildGuestGamePlayTimeOriginKey({
    externalProvider: input.externalProvider,
    externalDomain: input.externalDomain,
    sourceKind: input.sourceKind,
    sessionExternalId: input.sessionExternalId,
    eventType: 'PLAY_HOUR',
  });
  const legacy = buildGuestGameOriginKey({
    externalProvider: input.externalProvider,
    externalDomain: input.externalDomain,
    eventType: 'PLAY_HOUR',
    stableExternalId: input.sessionExternalId,
  });
  if (!canonical || !legacy) {
    throw new ConflictException(
      'Could not build canonical and legacy PLAY_TIME origins.',
    );
  }
  return {
    canonical,
    legacy,
    all: [...new Set([canonical, legacy])],
  };
}

function replaySessionTypeFromFactType(factType: string) {
  if (factType === 'SESSION_PLAY_TIME_ACCUMULATED') return null;
  if (factType === 'HOURLY_PLAY_TIME_ACCUMULATED') return 'HOURLY' as const;
  if (factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED') {
    return 'PACKAGE_OR_SUBSCRIPTION' as const;
  }
  throw new BadRequestException('Replay supports only exact play-time facts.');
}

function replaySessionPacket(
  sessionType: 'HOURLY' | 'PACKAGE_OR_SUBSCRIPTION' | null,
) {
  return sessionType === 'PACKAGE_OR_SUBSCRIPTION'
    ? true
    : sessionType === 'HOURLY'
      ? false
      : null;
}

function supportRecoveryProcessDto(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>> & {
    happenedAt: Date;
    profileId: string;
    guestId: string;
    storeId: string;
    sessionExternalId: string;
  },
  ticketNumber: string,
): GuestGameProcessEventDto {
  const playTime = replayFactTypes.has(fact.factType);
  const sessionType =
    fact.factType === 'HOURLY_SESSION_STARTED' ||
    fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED'
      ? 'HOURLY'
      : fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED' ||
          fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
        ? 'PACKAGE_OR_SUBSCRIPTION'
        : null;
  if (playTime && (!fact.durationMinutes || fact.durationMinutes <= 0)) {
    throw new ConflictException(
      `Play-time fact ${fact.id} has no positive exact duration.`,
    );
  }
  return {
    profileId: fact.profileId,
    guestId: fact.guestId,
    storeId: fact.storeId,
    eventType: playTime ? 'PLAY_HOUR' : 'SESSION_START',
    occurredAt: fact.happenedAt.toISOString(),
    limitOccurredAt: fact.happenedAt.toISOString(),
    sessionType,
    sessionPacket: replaySessionPacket(sessionType),
    sessionMinutes: playTime ? fact.durationMinutes : 0,
    sourceFactId: fact.id,
    sourceFactKind: 'GUEST_SESSION',
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    externalId: fact.sessionExternalId,
    sourceKind: fact.sourceKind,
    sessionExternalId: fact.sessionExternalId,
    activeRulesOnly: true,
    suppressLootBoxRewards: true,
    payload: {
      supportRewardRecovery: true,
      ticketNumber,
      factType: fact.factType,
      confidence: fact.confidence,
      sourceKind: fact.sourceKind,
      sessionExternalId: fact.sessionExternalId,
    },
  };
}

function uniqueSortedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => normalizedString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  ].sort();
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function requiredId(value: unknown, field: string) {
  const id = normalizedString(value);
  if (!id) throw new BadRequestException(`Укажите ${field}.`);
  return id;
}

function nonNegativeInteger(value: unknown) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`Укажите положительный ${field}.`);
  }
  return parsed;
}

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizedString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function dateValue(value: unknown) {
  const raw = normalizedString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
