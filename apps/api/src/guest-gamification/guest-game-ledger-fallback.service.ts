import { Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  Prisma,
  TenantLifecycleStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuestGamificationService,
  type GuestGameDryRunResult,
  type GuestGameProcessEventDto,
} from './guest-gamification.service';
import { guestGameTriggerMatches } from './guest-game-progress';
import { guestGameRuleActivationAt } from './guest-game-rule-evaluator';
import {
  buildGuestGameOriginKey,
  buildGuestGamePhysicalProgressIdentity,
  buildGuestGamePhysicalSessionStartIdentity,
  buildGuestGamePlayTimeOriginKey,
} from './guest-game-origin-key';
import {
  guestGameBattlePassStepEvaluationPolicy,
  guestGameLootBoxEvaluationPolicy,
  guestGameMissionEvaluationPolicy,
  guestGamePolicyAllowsEvaluation,
} from './guest-game-source-policy';
import {
  EXACT_CANONICAL_OWNER_QUARANTINED_CODE,
  reconcileExactCanonicalEventOwner,
} from './guest-game-exact-owner-reconciler';

export type GuestGameLedgerFallbackMode = 'OFF' | 'SHADOW' | 'LIVE';

export type GuestGameLedgerFallbackRunDto = {
  mode?: GuestGameLedgerFallbackMode;
  factTypes?: string[];
  tenantId?: string | null;
  tenantSlug?: string | null;
  profileId?: string | null;
  seasonId?: string | null;
  battlePassStep?: number | string | null;
  liveNotBefore?: Date | string | null;
  allowAllTenants?: boolean;
  missionsAllowAllProfiles?: boolean;
  playTimeAllowAllProfiles?: boolean;
  limit?: number | string | null;
  graceMs?: number | string | null;
  claimLeaseMs?: number | string | null;
};

export type GuestGameLedgerFallbackTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  checkedFacts: number;
  deferredFacts: number;
  liveHandledFacts: number;
  shadowFacts: number;
  fallbackFacts: number;
  duplicateFacts: number;
  failedFacts: number;
  createdEvents: number;
  createdRewards: number;
};

export type GuestGameLedgerFallbackRunResult = {
  mode: GuestGameLedgerFallbackMode;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  checkedFacts: number;
  deferredFacts: number;
  liveHandledFacts: number;
  shadowFacts: number;
  fallbackFacts: number;
  duplicateFacts: number;
  failedFacts: number;
  createdEvents: number;
  createdRewards: number;
  tenants: GuestGameLedgerFallbackTenantResult[];
};

const fallbackFactTypes = [
  'SESSION_STARTED',
  'HOURLY_SESSION_STARTED',
  'PACKAGE_OR_SUBSCRIPTION_USED',
  'SESSION_PLAY_TIME_ACCUMULATED',
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
  'PRODUCT_PURCHASED',
] as const;

const sessionStartFallbackFactTypes = [
  'SESSION_STARTED',
  'HOURLY_SESSION_STARTED',
  'PACKAGE_OR_SUBSCRIPTION_USED',
] as const;

const defaultFallbackFactTypes = [
  'SESSION_PLAY_TIME_ACCUMULATED',
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
] as const;

type FallbackFactType = (typeof fallbackFactTypes)[number];

@Injectable()
export class GuestGameLedgerFallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GuestGamificationService,
  ) {}

  async runScheduled(
    dto: GuestGameLedgerFallbackRunDto = {},
  ): Promise<GuestGameLedgerFallbackRunResult> {
    const mode = fallbackMode(dto.mode);
    const factTypes = requestedFallbackFactTypes(dto.factTypes, mode);
    const limit = boundedInteger(dto.limit, 30, 1, 100);
    const graceMs = boundedInteger(dto.graceMs, 60_000, 15_000, 10 * 60_000);
    const claimLeaseMs = boundedInteger(
      dto.claimLeaseMs,
      120_000,
      30_000,
      10 * 60_000,
    );
    const tenantId = normalizedString(dto.tenantId);
    const tenantSlug = normalizedString(dto.tenantSlug);
    const profileId = normalizedString(dto.profileId);
    const seasonId = normalizedString(dto.seasonId);
    const battlePassStep = optionalPositiveInteger(dto.battlePassStep);
    const liveNotBefore = validDate(dto.liveNotBefore);
    const missionsAllowAllProfiles = dto.missionsAllowAllProfiles === true;
    const playTimeAllowAllProfiles = dto.playTimeAllowAllProfiles === true;
    if (
      mode !== 'OFF' &&
      !tenantId &&
      !tenantSlug &&
      dto.allowAllTenants !== true
    ) {
      return summarize(mode, []);
    }
    if (
      mode === 'LIVE' &&
      (dto.allowAllTenants === true ||
        (!playTimeAllowAllProfiles &&
          (!profileId || !seasonId || battlePassStep === null)) ||
        !liveNotBefore)
    ) {
      return summarize(mode, []);
    }
    const tenants = await this.prisma.tenant.findMany({
      where: compact({
        id: tenantId ?? undefined,
        slug: tenantSlug ?? undefined,
      }),
      select: {
        id: true,
        slug: true,
        status: true,
        users: {
          where: { isActive: true },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            customRoleId: true,
            isPlatformAdmin: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { slug: 'asc' },
    });
    const results: GuestGameLedgerFallbackTenantResult[] = [];

    for (const tenant of tenants) {
      if (mode === 'OFF' || tenant.status !== TenantLifecycleStatus.ACTIVE) {
        results.push(
          emptyTenantResult(
            tenant.id,
            tenant.slug,
            'SKIPPED',
            mode === 'OFF'
              ? 'Ledger fallback is disabled.'
              : 'Tenant is not active.',
          ),
        );
        continue;
      }
      const actor = tenant.users[0];
      if (!actor) {
        results.push(
          emptyTenantResult(
            tenant.id,
            tenant.slug,
            'SKIPPED',
            'No audit-safe tenant actor is available.',
          ),
        );
        continue;
      }

      try {
        results.push(
          await this.runForTenant(
            {
              ...actor,
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              tenantStatus: tenant.status,
            },
            mode,
            factTypes,
            limit,
            graceMs,
            claimLeaseMs,
            profileId,
            seasonId,
            battlePassStep,
            liveNotBefore,
            missionsAllowAllProfiles,
            playTimeAllowAllProfiles,
          ),
        );
      } catch (error) {
        results.push(
          emptyTenantResult(
            tenant.id,
            tenant.slug,
            'ERROR',
            safeErrorMessage(error),
          ),
        );
      }
    }

    return summarize(mode, results);
  }

  private async runForTenant(
    user: AuthenticatedUser,
    mode: Exclude<GuestGameLedgerFallbackMode, 'OFF'>,
    factTypes: FallbackFactType[],
    limit: number,
    graceMs: number,
    claimLeaseMs: number,
    profileId: string | null,
    seasonId: string | null,
    battlePassStep: number | null,
    liveNotBefore: Date | null,
    missionsAllowAllProfiles: boolean,
    playTimeAllowAllProfiles: boolean,
  ) {
    const supportsPlayHour = factTypes.some((factType) =>
      isPlayTimeFactType(factType),
    );
    const supportsSessionStart = factTypes.some((factType) =>
      isSessionStartFactType(factType),
    );
    const [allMissions, allSeasons, allLootBoxes, stores] = await Promise.all([
      this.prisma.guestGameMission.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          definitionVersion: true,
          missionType: true,
          triggerKind: true,
          evaluationPolicy: true,
          conditions: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          periodFrom: true,
          levels: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameLootBox.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          triggerKind: true,
          periodRules: true,
          limits: true,
          storeIds: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, externalDomain: true, timeZone: true },
      }),
    ]);
    const fallbackMissions = allMissions.filter((mission) =>
      guestGamePolicyAllowsEvaluation(
        guestGameMissionEvaluationPolicy(
          mission.definitionVersion,
          mission.conditions,
          mission.missionType,
          mission.evaluationPolicy,
          mission.triggerKind,
        ),
        'LIVE_LEDGER_FALLBACK',
      ),
    );
    const missions =
      mode === 'LIVE'
        ? missionsAllowAllProfiles || playTimeAllowAllProfiles
          ? fallbackMissions
          : []
        : fallbackMissions;
    const seasons =
      mode === 'LIVE'
        ? playTimeAllowAllProfiles
          ? allSeasons
          : allSeasons.filter((season) => season.id === seasonId)
        : allSeasons;
    const fallbackLootBoxes =
      mode === 'LIVE' && !playTimeAllowAllProfiles
        ? []
        : allLootBoxes.filter((lootBox) => {
            const triggerKind = normalizedString(lootBox.triggerKind);
            return (
              Boolean(triggerKind) &&
              ((supportsPlayHour &&
                guestGameTriggerMatches(triggerKind, 'PLAY_HOUR')) ||
                (supportsSessionStart &&
                  guestGameTriggerMatches(triggerKind, 'SESSION_START'))) &&
              guestGamePolicyAllowsEvaluation(
                guestGameLootBoxEvaluationPolicy(
                  triggerKind,
                  lootBox.periodRules,
                ),
                'LIVE_LEDGER_FALLBACK',
              )
            );
          });
    const fallbackSeasons = seasons.filter((season) =>
      seasonHasFallbackStep(
        season.levels,
        mode === 'LIVE' && !playTimeAllowAllProfiles ? battlePassStep : null,
      ),
    );
    if (
      !missions.length &&
      !fallbackSeasons.length &&
      !fallbackLootBoxes.length
    ) {
      return emptyTenantResult(
        user.tenantId,
        user.tenantSlug,
        'SKIPPED',
        'No active rules use LIVE_WITH_LEDGER_FALLBACK.',
      );
    }
    const ruleExternalDomains = fallbackRuleExternalDomains(
      [...missions, ...fallbackSeasons, ...fallbackLootBoxes],
      stores,
    );
    const ruleDomainTimeZones = fallbackRuleDomainTimeZones(
      [...missions, ...fallbackSeasons, ...fallbackLootBoxes],
      stores,
    );
    const fallbackRuleVersions = new Map([
      ...missions.map(
        (rule) => [`MISSION:${rule.id}`, rule.updatedAt] as const,
      ),
      ...fallbackSeasons.map(
        (rule) => [`SEASON:${rule.id}`, rule.updatedAt] as const,
      ),
      ...fallbackLootBoxes.map(
        (rule) => [`LOOT_BOX:${rule.id}`, rule.updatedAt] as const,
      ),
    ]);

    const earliestRuleActivation = [
      ...missions.map((mission) =>
        guestGameRuleActivationAt(mission.createdAt, mission.conditions),
      ),
      ...fallbackSeasons.map((season) => season.periodFrom ?? season.createdAt),
      ...fallbackLootBoxes.map((lootBox) =>
        guestGameRuleActivationAt(lootBox.createdAt, lootBox.limits),
      ),
    ].reduce((earliest, value) => (value < earliest ? value : earliest));
    const earliestActivation =
      mode === 'LIVE' && liveNotBefore && liveNotBefore > earliestRuleActivation
        ? liveNotBefore
        : earliestRuleActivation;
    const result = emptyTenantResult(
      user.tenantId,
      user.tenantSlug,
      'PROCESSED',
      null,
    );
    const profileScope =
      mode === 'LIVE' && (missionsAllowAllProfiles || playTimeAllowAllProfiles)
        ? undefined
        : (profileId ?? undefined);
    const factAnd: Prisma.GuestActivityFactWhereInput[] = [
      {
        OR: [{ guestId: { not: null } }, { profileId: { not: null } }],
      },
      {
        OR: [
          { sourceExternalId: { not: null } },
          {
            factType: {
              in: [
                'SESSION_STARTED',
                'HOURLY_SESSION_STARTED',
                'PACKAGE_OR_SUBSCRIPTION_USED',
                'HOURLY_PLAY_TIME_ACCUMULATED',
                'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
                'SESSION_PLAY_TIME_ACCUMULATED',
              ],
            },
            sessionExternalId: { not: null },
          },
        ],
      },
      {
        OR: [
          {
            factType: {
              in: [
                'HOURLY_PLAY_TIME_ACCUMULATED',
                'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
                'SESSION_PLAY_TIME_ACCUMULATED',
              ],
            },
            durationMinutes: { gt: 0 },
          },
          {
            factType: {
              in: [
                'SESSION_STARTED',
                'HOURLY_SESSION_STARTED',
                'PACKAGE_OR_SUBSCRIPTION_USED',
              ],
            },
            sessionExternalId: { not: null },
          },
          { factType: 'PRODUCT_PURCHASED' },
        ],
      },
    ];
    const baseFactWhere: Prisma.GuestActivityFactWhereInput = {
      tenantId: user.tenantId,
      profileId: profileScope,
      factType: { in: factTypes },
      lifecycleStatus: 'ACTIVE',
      confidence: 'EXACT',
      supersededAt: null,
      happenedAt: { gte: earliestActivation },
      AND: factAnd,
    };
    const factPageSize = Math.max(limit * 4, 100);
    const useDurableCursor =
      playTimeAllowAllProfiles &&
      factTypes.some((factType) => isSessionRuleFactType(factType));
    const useExactReconciliationCursor =
      playTimeAllowAllProfiles && supportsPlayHour;
    const watermarkOriginKey = useDurableCursor
      ? fallbackWatermarkOriginKey(factTypes, liveNotBefore)
      : null;
    const exactReconciliationWatermarkOriginKey = useExactReconciliationCursor
      ? fallbackExactReconciliationWatermarkOriginKey(liveNotBefore)
      : null;
    const retryableFallbackEventTypes = fallbackEventTypes(factTypes);
    const retryableReceiptWhere: Prisma.GuestGameOriginReceiptWhereInput = {
      tenantId: user.tenantId,
      factId: { not: null },
      OR: [
        {
          policy: 'LIVE_WITH_LEDGER_FALLBACK',
          eventType: { in: retryableFallbackEventTypes },
          OR: [
            {
              status: {
                in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'],
              },
            },
            {
              status: 'PROCESSING',
              OR: [
                { claimExpiresAt: null },
                { claimExpiresAt: { lte: new Date() } },
              ],
            },
          ],
        },
        ...(useExactReconciliationCursor
          ? [
              {
                policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
                eventType: 'PLAY_HOUR',
                OR: [
                  {
                    status: {
                      in: ['WAITING_LIVE', 'FAILED'],
                    },
                  },
                  {
                    status: 'PROCESSING',
                    OR: [
                      { claimExpiresAt: null },
                      { claimExpiresAt: { lte: new Date() } },
                    ],
                  },
                ],
              } satisfies Prisma.GuestGameOriginReceiptWhereInput,
            ]
          : []),
      ],
    };
    const [watermark, exactReconciliationWatermark, retryableReceipts] =
      useDurableCursor
        ? await Promise.all([
            this.prisma.guestGameOriginReceipt.findUnique({
              where: {
                tenantId_originKey: {
                  tenantId: user.tenantId,
                  originKey: watermarkOriginKey!,
                },
              },
              select: { factId: true, ledgerFirstSeenAt: true },
            }),
            useExactReconciliationCursor
              ? this.prisma.guestGameOriginReceipt.findUnique({
                  where: {
                    tenantId_originKey: {
                      tenantId: user.tenantId,
                      originKey: exactReconciliationWatermarkOriginKey!,
                    },
                  },
                  select: { factId: true, ledgerFirstSeenAt: true },
                })
              : Promise.resolve(null),
            this.prisma.guestGameOriginReceipt.findMany({
              where: retryableReceiptWhere,
              select: { factId: true, eventId: true, policy: true },
              orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
              // Retry work has its own budget and must not consume discovery
              // capacity for newly arrived exact receipts.
              take: Math.max(limit * 2, 100),
            }),
          ])
        : [null, null, []];
    const exactRetryEventIds = uniqueStrings(
      retryableReceipts
        .filter(
          (receipt) => receipt.policy === 'EXACT_CANONICAL_RULE_RECONCILIATION',
        )
        .map((receipt) => receipt.eventId),
    );
    const exactReceiptsToReconcile = useExactReconciliationCursor
      ? await this.prisma.guestGameOriginReceipt.findMany({
          where: {
            tenantId: user.tenantId,
            eventType: 'PLAY_HOUR',
            policy: 'EXACT_OPERATOR_CANONICALIZATION',
            status: 'PROCESSED',
            claimedSource: {
              in: ['EXACT_CANONICALIZATION', 'EXACT_OPERATOR_CANONICALIZATION'],
            },
            factId: { not: null },
            eventId: { not: null },
            ...(exactReconciliationWatermark
              ? {
                  AND: [
                    {
                      OR: [
                        {
                          updatedAt: {
                            gt: exactReconciliationWatermark.ledgerFirstSeenAt,
                          },
                        },
                        {
                          updatedAt:
                            exactReconciliationWatermark.ledgerFirstSeenAt,
                          id: {
                            gt: exactReconciliationWatermark.factId ?? '',
                          },
                        },
                        ...(exactRetryEventIds.length
                          ? [{ eventId: { in: exactRetryEventIds } }]
                          : []),
                      ],
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            originKey: true,
            factId: true,
            eventId: true,
            eventType: true,
            externalProvider: true,
            externalDomain: true,
            policy: true,
            status: true,
            claimedSource: true,
            ledgerFirstSeenAt: true,
            graceUntil: true,
            attempts: true,
            claimExpiresAt: true,
            processedAt: true,
            lastError: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: limit + exactRetryEventIds.length,
        })
      : [];
    const exactDiscoveryReceiptsToReconcile = exactReceiptsToReconcile.filter(
      (receipt) =>
        receiptComesAfterWatermark(receipt, exactReconciliationWatermark),
    );
    const durablyHandledExactReceiptIds = new Set<string>();
    const exactReceiptFactIds = uniqueStrings(
      exactReceiptsToReconcile.map((receipt) => receipt.factId),
    );
    const exactReceiptFacts = exactReceiptFactIds.length
      ? await this.prisma.guestActivityFact.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: exactReceiptFactIds },
          },
        })
      : [];
    const exactFactById = new Map(
      exactReceiptFacts.map((fact) => [fact.id, fact] as const),
    );
    const staleSessionExternalIds = uniqueStrings(
      exactReceiptFacts
        .filter(
          (fact) =>
            isPlayTimeFactType(fact.factType) &&
            (fact.lifecycleStatus !== 'ACTIVE' ||
              fact.supersededAt !== null ||
              fact.confidence !== 'EXACT'),
        )
        .map((fact) => fact.sessionExternalId),
    );
    const activeReplacementFacts = staleSessionExternalIds.length
      ? await this.prisma.guestActivityFact.findMany({
          where: {
            tenantId: user.tenantId,
            sessionExternalId: { in: staleSessionExternalIds },
            factType: {
              in: [
                'HOURLY_PLAY_TIME_ACCUMULATED',
                'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
                'SESSION_PLAY_TIME_ACCUMULATED',
              ],
            },
            lifecycleStatus: 'ACTIVE',
            confidence: 'EXACT',
            supersededAt: null,
          },
        })
      : [];
    const activeReplacementFactsBySession = new Map<
      string,
      typeof activeReplacementFacts
    >();
    for (const fact of activeReplacementFacts) {
      if (!fact.sessionExternalId) continue;
      const key = playTimeSessionKey(
        fact.externalProvider,
        fact.externalDomain,
        fact.sourceKind,
        fact.sessionExternalId,
      );
      const values = activeReplacementFactsBySession.get(key) ?? [];
      values.push(fact);
      activeReplacementFactsBySession.set(key, values);
    }
    const resolvedExactReceiptByFactId = new Map<
      string,
      (typeof exactReceiptsToReconcile)[number]
    >();
    for (const receipt of exactReceiptsToReconcile) {
      const sourceFact = receipt.factId
        ? exactFactById.get(receipt.factId)
        : null;
      let resolvedFact = sourceFact ?? null;
      let skipReason: string | null = null;
      if (!sourceFact) {
        skipReason =
          'Exact canonical source fact no longer exists; reconciliation was quarantined.';
      } else if (
        sourceFact.lifecycleStatus !== 'ACTIVE' ||
        sourceFact.supersededAt !== null ||
        sourceFact.confidence !== 'EXACT'
      ) {
        const sessionKey = sourceFact.sessionExternalId
          ? playTimeSessionKey(
              sourceFact.externalProvider,
              sourceFact.externalDomain,
              sourceFact.sourceKind,
              sourceFact.sessionExternalId,
            )
          : null;
        const replacements = sessionKey
          ? (activeReplacementFactsBySession.get(sessionKey) ?? [])
          : [];
        if (replacements.length === 1) {
          resolvedFact = replacements[0]!;
        } else {
          resolvedFact = null;
          skipReason =
            replacements.length === 0
              ? 'Superseded exact fact has no unique active physical-session replacement.'
              : 'Superseded exact fact has multiple active physical-session replacements.';
        }
      }
      if (resolvedFact) {
        const validationError =
          exactReconciliationFactValidationError(resolvedFact);
        if (validationError) {
          resolvedFact = null;
          skipReason = validationError;
        }
      }
      if (!resolvedFact) {
        const quarantined = await this.persistExactReconciliationQuarantine(
          user.tenantId,
          receipt,
          skipReason ?? 'Exact reconciliation source could not be resolved.',
        );
        if (quarantined) {
          durablyHandledExactReceiptIds.add(receipt.id);
        }
        continue;
      }
      const collision = resolvedExactReceiptByFactId.get(resolvedFact.id);
      if (collision && collision.id !== receipt.id) {
        const reason =
          'Multiple exact receipts resolve to one active physical session.';
        const receiptQuarantined =
          await this.persistExactReconciliationQuarantine(
            user.tenantId,
            receipt,
            reason,
          );
        const collisionQuarantined =
          await this.persistExactReconciliationQuarantine(
            user.tenantId,
            collision,
            reason,
          );
        if (receiptQuarantined) {
          durablyHandledExactReceiptIds.add(receipt.id);
        }
        if (collisionQuarantined) {
          durablyHandledExactReceiptIds.add(collision.id);
        }
        resolvedExactReceiptByFactId.delete(resolvedFact.id);
        continue;
      }
      resolvedExactReceiptByFactId.set(resolvedFact.id, receipt);
    }
    const retryFactIds = uniqueStrings([
      ...retryableReceipts.map((receipt) => receipt.factId),
      ...resolvedExactReceiptByFactId.keys(),
    ]);
    const retryFacts = retryFactIds.length
      ? await this.prisma.guestActivityFact.findMany({
          where: {
            ...baseFactWhere,
            id: { in: retryFactIds },
          },
          orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
        })
      : [];
    let durableCursorConsumed = false;
    let factCursor: { id: string } | undefined;

    const maxFactsThisRun = limit + retryFacts.length;
    while (result.checkedFacts < maxFactsThisRun) {
      if (useDurableCursor && durableCursorConsumed) break;
      const discoveryCapacity = limit;
      const discoveryFacts =
        useDurableCursor && discoveryCapacity === 0
          ? []
          : await this.prisma.guestActivityFact.findMany({
              where:
                useDurableCursor && watermark
                  ? {
                      ...baseFactWhere,
                      AND: [
                        ...factAnd,
                        {
                          OR: [
                            {
                              validFrom: {
                                gt: watermark.ledgerFirstSeenAt,
                              },
                            },
                            {
                              validFrom: watermark.ledgerFirstSeenAt,
                              id: { gt: watermark.factId ?? '' },
                            },
                          ],
                        },
                      ],
                    }
                  : baseFactWhere,
              orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
              take: useDurableCursor ? discoveryCapacity : factPageSize,
              ...(!useDurableCursor && factCursor
                ? { cursor: factCursor, skip: 1 }
                : {}),
            });
      const candidateFacts = useDurableCursor
        ? uniqueFacts([...retryFacts, ...discoveryFacts])
        : discoveryFacts;
      durableCursorConsumed = useDurableCursor;
      if (!candidateFacts.length) break;
      const sessionStartSessions = uniqueStrings(
        candidateFacts
          .filter((fact) => isSessionStartFactType(fact.factType))
          .map((fact) => fact.sessionExternalId),
      );
      const activeSessionStartFamilyFacts = sessionStartSessions.length
        ? await this.prisma.guestActivityFact.findMany({
            where: {
              ...baseFactWhere,
              sessionExternalId: { in: sessionStartSessions },
              factType: {
                // Conflict detection is deliberately independent from the
                // rollout allow-list. A hidden exact marker of another type
                // must fail closed instead of granting an incompatible rule.
                in: [...sessionStartFallbackFactTypes],
              },
            },
            orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
          })
        : [];
      const sessionStartCandidates = sessionStartCandidateSelection(
        activeSessionStartFamilyFacts,
      );
      const candidateSessionStartKeys = new Set(
        candidateFacts.flatMap((fact) => {
          if (
            !isSessionStartFactType(fact.factType) ||
            !fact.sessionExternalId
          ) {
            return [];
          }
          return [
            sessionStartSessionKey(
              fact.externalProvider,
              fact.externalDomain,
              fact.sourceKind,
              fact.sessionExternalId,
              fact.profileId,
              fact.guestId,
              fact.happenedAt,
            ),
          ];
        }),
      );
      const facts = uniqueFacts([
        ...candidateFacts.filter(
          (fact) => !isSessionStartFactType(fact.factType),
        ),
        ...[...candidateSessionStartKeys].flatMap((key) => {
          const selected = sessionStartCandidates.get(key);
          return selected ? [selected.preferred] : [];
        }),
      ]).sort(
        (left, right) =>
          left.validFrom.getTime() - right.validFrom.getTime() ||
          left.id.localeCompare(right.id),
      );
      const playTimeSessions = uniqueStrings(
        facts
          .filter((fact) => isPlayTimeFactType(fact.factType))
          .map((fact) => fact.sessionExternalId),
      );
      const activePlayTimeFamilyFacts = playTimeSessions.length
        ? await this.prisma.guestActivityFact.findMany({
            where: {
              tenantId: user.tenantId,
              sessionExternalId: { in: playTimeSessions },
              factType: {
                in: [
                  'HOURLY_PLAY_TIME_ACCUMULATED',
                  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
                  'SESSION_PLAY_TIME_ACCUMULATED',
                ],
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
              validFrom: true,
            },
          })
        : [];
      const conflictingPlayTimeSessions = playTimeConflictCandidates(
        activePlayTimeFamilyFacts,
      );

      for (const fact of facts) {
        if (result.checkedFacts >= maxFactsThisRun) break;
        const resolvedExactReceipt = resolvedExactReceiptByFactId.get(fact.id);
        if (isSessionStartFactType(fact.factType) && fact.sessionExternalId) {
          const startKey = sessionStartSessionKey(
            fact.externalProvider,
            fact.externalDomain,
            fact.sourceKind,
            fact.sessionExternalId,
            fact.profileId,
            fact.guestId,
            fact.happenedAt,
          );
          if (sessionStartCandidates.get(startKey)?.conflicting) {
            const processDto = fallbackProcessDto(
              fact,
              fallbackStableExternalId(fact),
            );
            const originKeys = processDto
              ? fallbackOriginKeys(fact, processDto)
              : null;
            const existingReceipt = originKeys
              ? await this.findOriginReceiptByCandidates(
                  user.tenantId,
                  originKeys.all,
                )
              : null;
            const originKey =
              existingReceipt?.originKey ?? originKeys?.canonical ?? null;
            if (originKey && !existingReceipt) {
              await this.prisma.guestGameOriginReceipt.upsert({
                where: {
                  tenantId_originKey: {
                    tenantId: user.tenantId,
                    originKey,
                  },
                },
                create: {
                  tenantId: user.tenantId,
                  originKey,
                  factId: fact.id,
                  eventType: 'SESSION_START',
                  externalProvider: fact.externalProvider,
                  externalDomain: fact.externalDomain,
                  policy: 'LIVE_WITH_LEDGER_FALLBACK',
                  status: 'FAILED',
                  ledgerFirstSeenAt: new Date(),
                  graceUntil: new Date(),
                  lastError:
                    'Conflicting exact session-start classifications for one session.',
                },
                update: {},
              });
            }
            result.failedFacts += 1;
            continue;
          }
        }
        if (
          isPlayTimeFactType(fact.factType) &&
          fact.sessionExternalId &&
          conflictingPlayTimeSessions.has(
            playTimeSessionKey(
              fact.externalProvider,
              fact.externalDomain,
              fact.sourceKind,
              fact.sessionExternalId,
            ),
          )
        ) {
          if (resolvedExactReceipt) {
            const quarantined = await this.persistExactReconciliationQuarantine(
              user.tenantId,
              resolvedExactReceipt,
              'Conflicting exact play-time classifications for one physical session.',
            );
            if (quarantined) {
              durablyHandledExactReceiptIds.add(resolvedExactReceipt.id);
            }
          }
          const conflictKey = playTimeSessionKey(
            fact.externalProvider,
            fact.externalDomain,
            fact.sourceKind,
            fact.sessionExternalId,
          );
          if (conflictingPlayTimeSessions.get(conflictKey)?.id === fact.id) {
            const processDto = fallbackProcessDto(
              fact,
              fallbackStableExternalId(fact),
            );
            const originKeys = processDto
              ? fallbackOriginKeys(fact, processDto)
              : null;
            const existingReceipt = originKeys
              ? await this.findOriginReceiptByCandidates(
                  user.tenantId,
                  originKeys.all,
                )
              : null;
            const originKey =
              existingReceipt?.originKey ?? originKeys?.canonical ?? null;
            if (originKey) {
              if (!existingReceipt) {
                await this.prisma.guestGameOriginReceipt.upsert({
                  where: {
                    tenantId_originKey: {
                      tenantId: user.tenantId,
                      originKey,
                    },
                  },
                  create: {
                    tenantId: user.tenantId,
                    originKey,
                    factId: fact.id,
                    eventType: 'PLAY_HOUR',
                    externalProvider: fact.externalProvider,
                    externalDomain: fact.externalDomain,
                    policy: 'LIVE_WITH_LEDGER_FALLBACK',
                    status: 'FAILED',
                    ledgerFirstSeenAt: new Date(),
                    graceUntil: new Date(),
                    lastError:
                      'Conflicting exact play-time classifications for one session.',
                  },
                  update: {},
                });
              }
            }
          }
          result.failedFacts += 1;
          continue;
        }
        const stableExternalId = fallbackStableExternalId(fact);
        const processDto = fallbackProcessDto(fact, stableExternalId);
        if (!processDto || !fact.happenedAt || !stableExternalId) continue;
        const originKeys = fallbackOriginKeys(fact, processDto);
        let receipt =
          (resolvedExactReceipt?.policy === 'EXACT_OPERATOR_CANONICALIZATION' &&
          resolvedExactReceipt.status === 'PROCESSED'
            ? resolvedExactReceipt
            : null) ??
          (await this.findOriginReceiptByCandidates(
            user.tenantId,
            originKeys.all,
          ));
        const originKey = receipt?.originKey ?? originKeys.canonical;

        let routedDryRun: GuestGameDryRunResult;
        try {
          routedDryRun = routedFallbackDryRun(
            await this.gamification.dryRun(user, processDto, {
              ruleDomainTimeZones,
              ruleExternalDomains,
            }),
            mode === 'LIVE'
              ? {
                  profileId,
                  factProfileId: fact.profileId,
                  seasonId,
                  battlePassStep,
                  missionsAllowAllProfiles,
                  playTimeAllowAllProfiles,
                }
              : null,
          );
        } catch (error) {
          if (resolvedExactReceipt) {
            const durableMarker =
              await this.persistExactReconciliationRetryMarker(
                user.tenantId,
                {
                  ...resolvedExactReceipt,
                  // A reparsed exact receipt may still point at a superseded
                  // parser fact. The retry marker must follow the active
                  // physical-session fact or discovery cannot safely advance.
                  factId: fact.id,
                },
                safeErrorMessage(error),
              );
            if (durableMarker) {
              durablyHandledExactReceiptIds.add(resolvedExactReceipt.id);
            }
          } else {
            await this.persistRetryableFactFailure(
              user.tenantId,
              fact,
              originKey,
              processDto.eventType,
              safeErrorMessage(error),
            );
          }
          result.failedFacts += 1;
          continue;
        }
        if (!routedDryRun.rules.length) {
          const plannedExactRetry = Boolean(
            resolvedExactReceipt?.eventId &&
            exactRetryEventIds.includes(resolvedExactReceipt.eventId),
          );
          if (resolvedExactReceipt && !plannedExactRetry) {
            durablyHandledExactReceiptIds.add(resolvedExactReceipt.id);
          }
          if (!plannedExactRetry) continue;
        }
        const allowedRuleIds = new Set(
          routedDryRun.rules.map((rule) => rule.id),
        );
        const allowedBattlePassSteps = new Map(
          routedDryRun.rules.flatMap((rule) =>
            rule.kind === 'SEASON' && rule.battlePassStep != null
              ? [[rule.id, rule.battlePassStep] as const]
              : [],
          ),
        );

        const ledgerFirstSeenAt = new Date();
        receipt ??= await this.prisma.guestGameOriginReceipt.upsert({
          where: {
            tenantId_originKey: { tenantId: user.tenantId, originKey },
          },
          create: {
            tenantId: user.tenantId,
            originKey,
            factId: fact.id,
            eventType: processDto.eventType ?? fact.factType,
            externalProvider: fact.externalProvider,
            externalDomain: fact.externalDomain,
            policy: 'LIVE_WITH_LEDGER_FALLBACK',
            status: 'WAITING_LIVE',
            ledgerFirstSeenAt,
            graceUntil: new Date(ledgerFirstSeenAt.getTime() + graceMs),
          },
          // An origin receipt is an immutable ownership record. In particular,
          // fallback must never repoint a receipt currently owned by exact
          // operator canonicalization to a different parser fact.
          update: {},
        });
        const receiptOwnsResolvedExactFact =
          resolvedExactReceipt?.id === receipt.id &&
          receipt.policy === 'EXACT_OPERATOR_CANONICALIZATION' &&
          receipt.status === 'PROCESSED' &&
          [
            'EXACT_CANONICALIZATION',
            'EXACT_OPERATOR_CANONICALIZATION',
          ].includes(receipt.claimedSource ?? '') &&
          Boolean(normalizedString(receipt.eventId));

        if (
          receipt.factId &&
          receipt.factId !== fact.id &&
          !receiptOwnsResolvedExactFact
        ) {
          const reclassified = await this.repointFallbackReceiptToActiveFact(
            receipt,
            fact,
            ledgerFirstSeenAt,
            graceMs,
          );
          if (!reclassified) {
            result.duplicateFacts += 1;
            continue;
          }
          receipt = {
            ...receipt,
            factId: fact.id,
            status: 'WAITING_LIVE',
            claimedSource: null,
            attempts: 0,
            claimExpiresAt: null,
            ledgerFirstSeenAt,
            graceUntil: reclassified.graceUntil,
            processedAt: null,
            lastError: null,
          };
        }

        if (
          mode === 'LIVE' &&
          processedExactCanonicalReceiptMatches(
            receipt,
            fact,
            resolvedExactReceipt?.id,
          )
        ) {
          result.checkedFacts += 1;
          const reconciliation =
            await this.reconcileProcessedExactCanonicalReceipt({
              user,
              fact,
              receipt,
              processDto,
              originKey,
              allowedRuleIds,
              allowedBattlePassSteps,
              fallbackRuleVersions,
              ruleDomainTimeZones,
              ruleExternalDomains,
              claimLeaseMs,
            });
          if (reconciliation.durableMarker) {
            if (resolvedExactReceipt) {
              durablyHandledExactReceiptIds.add(resolvedExactReceipt.id);
            }
          }
          if (reconciliation.status === 'PROCESSED') {
            result.liveHandledFacts += 1;
            result.createdRewards += reconciliation.createdRewards;
          } else if (reconciliation.status === 'FAILED') {
            result.failedFacts += 1;
          } else {
            result.duplicateFacts += 1;
          }
          continue;
        }

        if (fallbackReceiptIsTerminal(mode, receipt, ledgerFirstSeenAt)) {
          result.duplicateFacts += 1;
          continue;
        }
        if (mode === 'SHADOW') {
          result.checkedFacts += 1;
          if (
            ['SHADOWED', 'PROCESSED', 'LIVE_PROCESSED', 'PROCESSING'].includes(
              receipt.status,
            )
          ) {
            result.duplicateFacts += 1;
            continue;
          }
          await this.gamification.recordRuleDecisions(user, routedDryRun, {
            originKey,
            sourceFactId: fact.id,
            sourceFactKind: 'LEDGER_FALLBACK',
            evaluationMode: 'SHADOW_LEDGER_FALLBACK',
            evaluatorVersion: 'ledger-fallback-v1',
            evidence: fallbackEvidence(fact),
            suppressLedgerShadow: true,
          });
          await this.prisma.guestGameOriginReceipt.updateMany({
            where: { id: receipt.id, status: 'WAITING_LIVE' },
            data: { status: 'SHADOWED', processedAt: new Date() },
          });
          result.shadowFacts += 1;
          continue;
        }

        if (receipt.graceUntil.getTime() > Date.now()) {
          result.checkedFacts += 1;
          result.deferredFacts += 1;
          continue;
        }

        try {
          const legacyReference = fallbackLegacyExternalReference(processDto);
          const liveEvent = await this.prisma.guestGameEvent.findFirst({
            where: {
              tenantId: user.tenantId,
              OR: [
                // Probe both the new source-aware SESSION_START identity and
                // the legacy source-neutral identity during the transition.
                { originKey: { in: originKeys.all } },
                ...(legacyReference
                  ? [
                      {
                        externalProvider: legacyReference.externalProvider,
                        externalDomain: legacyReference.externalDomain,
                        externalId: legacyReference.externalId,
                      },
                    ]
                  : []),
              ],
            },
            select: { id: true, eventType: true, payload: true },
          });
          if (liveEvent) {
            const sessionStartReclassification =
              sessionStartEventNeedsTypedReclassification(liveEvent, fact);
            const sessionStartReclassificationScope =
              sessionStartReclassification
                ? {
                    sourceFactId: fact.id,
                    sourceFactUpdatedAt: fact.updatedAt,
                    physicalSessionKey:
                      buildGuestGamePhysicalSessionStartIdentity({
                        externalProvider: fact.externalProvider,
                        externalDomain: fact.externalDomain,
                        sourceKind: fact.sourceKind,
                        sessionExternalId: fact.sessionExternalId,
                        eventType: fact.factType,
                      })?.key ??
                      (() => {
                        throw new Error(
                          'Typed session-start fact has no stable physical identity.',
                        );
                      })(),
                    rules: routedDryRun.rules.map((rule) => {
                      const ruleKind = rule.kind;
                      const ruleId = rule.id;
                      const ruleUpdatedAt = fallbackRuleVersions.get(
                        `${ruleKind}:${ruleId}`,
                      );
                      if (!ruleUpdatedAt) {
                        throw new Error(
                          `Missing active ${ruleKind} version for session-start reclassification.`,
                        );
                      }
                      return {
                        ruleKind,
                        ruleId,
                        battlePassStep:
                          rule.kind === 'SEASON'
                            ? (rule.battlePassStep ?? null)
                            : null,
                        battlePassStepId:
                          rule.kind === 'SEASON'
                            ? (rule.battlePassStepId ?? null)
                            : null,
                        ruleUpdatedAt,
                      };
                    }),
                  }
                : undefined;
            const liveClaimStartedAt = new Date();
            const liveClaimAttempt = receipt.attempts + 1;
            const liveClaim =
              await this.prisma.guestGameOriginReceipt.updateMany({
                where: {
                  id: receipt.id,
                  attempts: receipt.attempts,
                  policy: { not: 'EXACT_OPERATOR_CANONICALIZATION' },
                  OR: [
                    {
                      status: {
                        in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'],
                      },
                      OR: [
                        { claimedSource: null },
                        {
                          claimedSource: {
                            not: 'EXACT_CANONICALIZATION',
                          },
                        },
                      ],
                    },
                    {
                      status: 'PROCESSING',
                      OR: [
                        { claimedSource: null },
                        {
                          claimedSource: {
                            not: 'EXACT_CANONICALIZATION',
                          },
                        },
                      ],
                      AND: [
                        {
                          OR: [
                            { claimExpiresAt: { lte: liveClaimStartedAt } },
                            { claimExpiresAt: null },
                          ],
                        },
                      ],
                    },
                  ],
                },
                data: {
                  status: 'PROCESSING',
                  claimedSource: 'LIVE_RECONCILIATION',
                  attempts: { increment: 1 },
                  claimExpiresAt: new Date(
                    liveClaimStartedAt.getTime() + claimLeaseMs,
                  ),
                  lastError: null,
                },
              });
            if (liveClaim.count !== 1) {
              result.checkedFacts += 1;
              result.duplicateFacts += 1;
              continue;
            }
            let reconciled: Awaited<
              ReturnType<GuestGamificationService['processEvent']>
            >;
            try {
              reconciled = await this.gamification.processEvent(
                user,
                { ...processDto, activeRulesOnly: true },
                {
                  evaluationMode: 'LIVE_LEDGER_FALLBACK',
                  evaluatorVersion: 'ledger-fallback-v1',
                  originKey,
                  ruleDomainTimeZones,
                  ruleExternalDomains,
                  allowedRuleIds,
                  allowedBattlePassSteps,
                  sessionStartReclassificationScope,
                  suppressLedgerShadow: true,
                },
              );
            } catch (error) {
              await this.prisma.guestGameOriginReceipt.updateMany({
                where: {
                  id: receipt.id,
                  status: 'PROCESSING',
                  claimedSource: 'LIVE_RECONCILIATION',
                  attempts: liveClaimAttempt,
                },
                data: {
                  status: 'FAILED',
                  claimExpiresAt: null,
                  lastError: safeErrorMessage(error).slice(0, 500),
                },
              });
              throw error;
            }
            if (
              sessionStartReclassificationScope &&
              reconciled.summary.exactReconciliation?.complete !== true
            ) {
              await this.prisma.guestGameOriginReceipt.updateMany({
                where: {
                  id: receipt.id,
                  status: 'PROCESSING',
                  claimedSource: 'LIVE_RECONCILIATION',
                  attempts: liveClaimAttempt,
                },
                data: {
                  status: 'FAILED',
                  claimExpiresAt: null,
                  lastError:
                    'Session-start reclassification effects are not durably complete yet.',
                },
              });
              result.checkedFacts += 1;
              result.failedFacts += 1;
              continue;
            }
            const liveFinalized =
              await this.prisma.guestGameOriginReceipt.updateMany({
                where: {
                  id: receipt.id,
                  status: 'PROCESSING',
                  claimedSource: 'LIVE_RECONCILIATION',
                  attempts: liveClaimAttempt,
                },
                data: {
                  status: 'LIVE_PROCESSED',
                  claimedSource: 'LIVE',
                  eventId: liveEvent.id,
                  claimExpiresAt: null,
                  processedAt: new Date(),
                },
              });
            if (liveFinalized.count !== 1) {
              result.checkedFacts += 1;
              result.duplicateFacts += 1;
              continue;
            }
            result.checkedFacts += 1;
            result.liveHandledFacts += 1;
            result.createdRewards += reconciled.summary.createdRewards;
            continue;
          }
        } catch {
          result.failedFacts += 1;
          continue;
        }

        if (receipt.attempts >= 3) {
          const deadLettered =
            await this.prisma.guestGameOriginReceipt.updateMany({
              where: {
                id: receipt.id,
                attempts: { equals: receipt.attempts, gte: 3 },
                policy: { not: 'EXACT_OPERATOR_CANONICALIZATION' },
                OR: [
                  {
                    status: {
                      in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'],
                    },
                    OR: [
                      { claimedSource: null },
                      {
                        claimedSource: {
                          not: 'EXACT_CANONICALIZATION',
                        },
                      },
                    ],
                  },
                  {
                    status: 'PROCESSING',
                    AND: [
                      {
                        OR: [
                          { claimedSource: null },
                          {
                            claimedSource: {
                              not: 'EXACT_CANONICALIZATION',
                            },
                          },
                        ],
                      },
                      {
                        OR: [
                          { claimExpiresAt: { lte: new Date() } },
                          { claimExpiresAt: null },
                        ],
                      },
                    ],
                  },
                ],
              },
              data: {
                status: 'DEAD_LETTER',
                claimExpiresAt: null,
                processedAt: new Date(),
                lastError:
                  'Ledger fallback exhausted the maximum number of attempts.',
              },
            });
          if (deadLettered.count > 0) {
            result.failedFacts += deadLettered.count;
          } else {
            result.duplicateFacts += 1;
          }
          continue;
        }

        result.checkedFacts += 1;
        const claimStartedAt = new Date();
        const claimAttempt = receipt.attempts + 1;
        const claim = await this.prisma.guestGameOriginReceipt.updateMany({
          where: {
            id: receipt.id,
            graceUntil: { lte: new Date() },
            attempts: { equals: receipt.attempts, lt: 3 },
            policy: { not: 'EXACT_OPERATOR_CANONICALIZATION' },
            OR: [
              {
                status: { in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'] },
                OR: [
                  { claimedSource: null },
                  {
                    claimedSource: { not: 'EXACT_CANONICALIZATION' },
                  },
                ],
              },
              {
                status: 'PROCESSING',
                AND: [
                  {
                    OR: [
                      { claimedSource: null },
                      {
                        claimedSource: {
                          not: 'EXACT_CANONICALIZATION',
                        },
                      },
                    ],
                  },
                  {
                    OR: [
                      { claimExpiresAt: { lte: claimStartedAt } },
                      { claimExpiresAt: null },
                    ],
                  },
                ],
              },
            ],
          },
          data: {
            status: 'PROCESSING',
            claimedSource: 'LEDGER_FALLBACK',
            attempts: { increment: 1 },
            claimExpiresAt: new Date(claimStartedAt.getTime() + claimLeaseMs),
            lastError: null,
          },
        });
        if (claim.count === 0) {
          result.duplicateFacts += 1;
          continue;
        }

        try {
          const processed = await this.gamification.processEvent(
            user,
            { ...processDto, activeRulesOnly: true },
            {
              evaluationMode: 'LIVE_LEDGER_FALLBACK',
              evaluatorVersion: 'ledger-fallback-v1',
              originKey,
              ruleDomainTimeZones,
              ruleExternalDomains,
              allowedRuleIds,
              allowedBattlePassSteps,
              suppressLedgerShadow: true,
            },
          );
          const finalized = await this.prisma.guestGameOriginReceipt.updateMany(
            {
              where: {
                id: receipt.id,
                status: 'PROCESSING',
                attempts: claimAttempt,
                claimedSource: 'LEDGER_FALLBACK',
              },
              data: {
                status: 'PROCESSED',
                eventId: processed.event.id,
                claimExpiresAt: null,
                processedAt: new Date(),
              },
            },
          );
          if (finalized.count === 0) {
            result.duplicateFacts += 1;
            continue;
          }
          result.fallbackFacts += 1;
          result.createdEvents += processed.summary.idempotent ? 0 : 1;
          result.createdRewards += processed.summary.createdRewards;
        } catch (error) {
          const failed = await this.prisma.guestGameOriginReceipt.updateMany({
            where: {
              id: receipt.id,
              status: 'PROCESSING',
              attempts: claimAttempt,
              claimedSource: 'LEDGER_FALLBACK',
            },
            data: {
              status: 'FAILED',
              claimExpiresAt: null,
              lastError: safeErrorMessage(error).slice(0, 500),
            },
          });
          if (failed.count > 0) {
            result.failedFacts += 1;
          } else {
            result.duplicateFacts += 1;
          }
        }
      }

      if (useDurableCursor) {
        const lastDiscoveryFact = discoveryFacts.at(-1);
        if (lastDiscoveryFact && watermarkOriginKey) {
          const watermarkReceipt =
            await this.prisma.guestGameOriginReceipt.upsert({
              where: {
                tenantId_originKey: {
                  tenantId: user.tenantId,
                  originKey: watermarkOriginKey,
                },
              },
              create: {
                tenantId: user.tenantId,
                originKey: watermarkOriginKey,
                factId: lastDiscoveryFact.id,
                eventType: 'SYSTEM_WATERMARK',
                externalProvider: IntegrationProvider.LANGAME,
                externalDomain: 'guest-activity-ledger',
                policy: 'SYSTEM_WATERMARK',
                status: 'PROCESSED',
                ledgerFirstSeenAt: lastDiscoveryFact.validFrom,
                graceUntil: lastDiscoveryFact.validFrom,
                processedAt: new Date(),
              },
              update: {},
            });
          await this.prisma.guestGameOriginReceipt.updateMany({
            where: {
              id: watermarkReceipt.id,
              policy: 'SYSTEM_WATERMARK',
              OR: [
                {
                  ledgerFirstSeenAt: { lt: lastDiscoveryFact.validFrom },
                },
                {
                  ledgerFirstSeenAt: lastDiscoveryFact.validFrom,
                  OR: [
                    { factId: null },
                    { factId: { lt: lastDiscoveryFact.id } },
                  ],
                },
              ],
            },
            data: {
              factId: lastDiscoveryFact.id,
              ledgerFirstSeenAt: lastDiscoveryFact.validFrom,
              graceUntil: lastDiscoveryFact.validFrom,
              processedAt: new Date(),
            },
          });
        }
        break;
      }

      factCursor = { id: facts[facts.length - 1].id };
      if (facts.length < factPageSize) break;
    }

    const firstUnhandledExactReceiptIndex =
      exactDiscoveryReceiptsToReconcile.findIndex(
        (receipt) => !durablyHandledExactReceiptIds.has(receipt.id),
      );
    const lastExactReceipt = exactDiscoveryReceiptsToReconcile
      .slice(
        0,
        firstUnhandledExactReceiptIndex === -1
          ? exactDiscoveryReceiptsToReconcile.length
          : firstUnhandledExactReceiptIndex,
      )
      .at(-1);
    if (
      useExactReconciliationCursor &&
      lastExactReceipt &&
      exactReconciliationWatermarkOriginKey
    ) {
      const exactWatermark = await this.prisma.guestGameOriginReceipt.upsert({
        where: {
          tenantId_originKey: {
            tenantId: user.tenantId,
            originKey: exactReconciliationWatermarkOriginKey,
          },
        },
        create: {
          tenantId: user.tenantId,
          originKey: exactReconciliationWatermarkOriginKey,
          // The cursor tracks the exact receipt row, not the parser fact.
          factId: lastExactReceipt.id,
          eventType: 'SYSTEM_WATERMARK',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'guest-activity-ledger',
          policy: 'SYSTEM_WATERMARK',
          status: 'PROCESSED',
          ledgerFirstSeenAt: lastExactReceipt.updatedAt,
          graceUntil: lastExactReceipt.updatedAt,
          processedAt: new Date(),
        },
        update: {},
      });
      await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: exactWatermark.id,
          policy: 'SYSTEM_WATERMARK',
          OR: [
            { ledgerFirstSeenAt: { lt: lastExactReceipt.updatedAt } },
            {
              ledgerFirstSeenAt: lastExactReceipt.updatedAt,
              OR: [{ factId: null }, { factId: { lt: lastExactReceipt.id } }],
            },
          ],
        },
        data: {
          factId: lastExactReceipt.id,
          ledgerFirstSeenAt: lastExactReceipt.updatedAt,
          graceUntil: lastExactReceipt.updatedAt,
          processedAt: new Date(),
        },
      });
    }

    return result;
  }

  private async persistExactReconciliationQuarantine(
    tenantId: string,
    receipt: {
      id: string;
      factId: string | null;
      eventId: string | null;
      eventType: string;
      externalProvider: IntegrationProvider;
      externalDomain: string;
    },
    reason: string,
  ) {
    const eventId = normalizedString(receipt.eventId);
    if (!eventId) return false;
    const markerOriginKey = buildGuestGameOriginKey({
      externalProvider: receipt.externalProvider,
      externalDomain: receipt.externalDomain,
      eventType: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      stableExternalId: eventId,
    });
    if (!markerOriginKey) return false;

    const now = new Date();
    const marker = await this.prisma.guestGameOriginReceipt.upsert({
      where: {
        tenantId_originKey: {
          tenantId,
          originKey: markerOriginKey,
        },
      },
      create: {
        tenantId,
        originKey: markerOriginKey,
        factId: receipt.factId,
        eventId,
        eventType: receipt.eventType,
        externalProvider: receipt.externalProvider,
        externalDomain: receipt.externalDomain,
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        status: 'QUARANTINED',
        claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
        ledgerFirstSeenAt: now,
        graceUntil: now,
        processedAt: null,
        lastError: reason.slice(0, 500),
      },
      update: {},
    });
    if (
      marker.policy !== 'EXACT_CANONICAL_RULE_RECONCILIATION' ||
      marker.eventId !== eventId
    ) {
      return false;
    }
    if (
      ['PROCESSED', 'LIVE_PROCESSED', 'DEAD_LETTER'].includes(marker.status)
    ) {
      return true;
    }
    if (
      marker.status === 'PROCESSING' &&
      marker.claimExpiresAt &&
      marker.claimExpiresAt > now
    ) {
      return false;
    }

    const terminal = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: marker.id,
        tenantId,
        eventId,
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        OR: [
          { status: { in: ['WAITING_LIVE', 'FAILED', 'QUARANTINED'] } },
          {
            status: 'PROCESSING',
            OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
          },
        ],
      },
      data: {
        factId: receipt.factId,
        status: 'QUARANTINED',
        claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
        claimExpiresAt: null,
        processedAt: null,
        lastError: reason.slice(0, 500),
      },
    });
    return terminal.count === 1;
  }

  private async persistExactReconciliationRetryMarker(
    tenantId: string,
    receipt: {
      factId: string | null;
      eventId: string | null;
      eventType: string;
      externalProvider: IntegrationProvider;
      externalDomain: string;
    },
    reason: string,
  ) {
    const eventId = normalizedString(receipt.eventId);
    if (!eventId) return false;
    const markerOriginKey = buildGuestGameOriginKey({
      externalProvider: receipt.externalProvider,
      externalDomain: receipt.externalDomain,
      eventType: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      stableExternalId: eventId,
    });
    if (!markerOriginKey) return false;

    const markerCreatedAt = new Date();
    let marker = await this.prisma.guestGameOriginReceipt.upsert({
      where: {
        tenantId_originKey: {
          tenantId,
          originKey: markerOriginKey,
        },
      },
      create: {
        tenantId,
        originKey: markerOriginKey,
        factId: receipt.factId,
        eventId,
        eventType: receipt.eventType,
        externalProvider: receipt.externalProvider,
        externalDomain: receipt.externalDomain,
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        status: 'FAILED',
        ledgerFirstSeenAt: markerCreatedAt,
        graceUntil: markerCreatedAt,
        processedAt: null,
        lastError: reason.slice(0, 500),
      },
      update: {},
    });
    if (
      marker.policy !== 'EXACT_CANONICAL_RULE_RECONCILIATION' ||
      marker.eventId !== eventId
    ) {
      return false;
    }

    const terminalStatuses = [
      'PROCESSED',
      'LIVE_PROCESSED',
      'DEAD_LETTER',
      'TERMINAL_SKIPPED',
      'QUARANTINED',
    ];
    if (terminalStatuses.includes(marker.status)) {
      return true;
    }

    if (marker.factId !== receipt.factId) {
      const rebound = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: marker.id,
          tenantId,
          eventId,
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          factId: marker.factId,
          OR: [
            { status: { in: ['WAITING_LIVE', 'FAILED'] } },
            {
              status: 'PROCESSING',
              OR: [
                { claimExpiresAt: null },
                { claimExpiresAt: { lte: markerCreatedAt } },
              ],
            },
          ],
        },
        data: {
          factId: receipt.factId,
          status: 'FAILED',
          claimedSource: null,
          claimExpiresAt: null,
          processedAt: null,
          lastError: reason.slice(0, 500),
        },
      });
      if (rebound.count !== 1) {
        // In particular, an active PROCESSING lease owned by another run is
        // not a durable retry for the active parser fact. Keep the exact
        // discovery cursor behind it until the lease expires and can rebind.
        return false;
      }
      marker = {
        ...marker,
        factId: receipt.factId,
        status: 'FAILED',
        claimedSource: null,
        claimExpiresAt: null,
        processedAt: null,
        lastError: reason.slice(0, 500),
      };
    }

    // A non-terminal marker bound to the active parser fact is the durable
    // retry owner. Expired leases are reclaimed by the marker retry query.
    if (['WAITING_LIVE', 'FAILED', 'PROCESSING'].includes(marker.status)) {
      return true;
    }
    return false;
  }

  private async reconcileProcessedExactCanonicalReceipt(input: {
    user: AuthenticatedUser;
    fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>;
    receipt: {
      id: string;
      factId: string | null;
      eventId: string | null;
      policy: string;
      status: string;
      claimedSource: string | null;
    };
    processDto: GuestGameProcessEventDto;
    originKey: string;
    allowedRuleIds: Set<string>;
    allowedBattlePassSteps: Map<string, number>;
    fallbackRuleVersions: Map<string, Date>;
    ruleDomainTimeZones: Map<string, Map<string, string | null>>;
    ruleExternalDomains: Map<string, string[]>;
    claimLeaseMs: number;
  }): Promise<
    | {
        status: 'PROCESSED';
        createdRewards: number;
        durableMarker: true;
      }
    | {
        status: 'DUPLICATE' | 'FAILED';
        createdRewards: 0;
        durableMarker: boolean;
      }
  > {
    const eventId = normalizedString(input.receipt.eventId);
    if (!eventId) {
      return {
        status: 'FAILED',
        createdRewards: 0,
        durableMarker: false,
      };
    }

    const markerOriginKey = buildGuestGameOriginKey({
      externalProvider: input.fact.externalProvider,
      externalDomain: input.fact.externalDomain,
      eventType: 'EXACT_CANONICAL_RULE_RECONCILIATION',
      stableExternalId: eventId,
    });
    if (!markerOriginKey) {
      return {
        status: 'FAILED',
        createdRewards: 0,
        durableMarker: false,
      };
    }

    const markerCreatedAt = new Date();
    let marker = await this.prisma.guestGameOriginReceipt.upsert({
      where: {
        tenantId_originKey: {
          tenantId: input.user.tenantId,
          originKey: markerOriginKey,
        },
      },
      create: {
        tenantId: input.user.tenantId,
        originKey: markerOriginKey,
        factId: input.fact.id,
        eventId,
        eventType: 'PLAY_HOUR',
        externalProvider: input.fact.externalProvider,
        externalDomain: input.fact.externalDomain,
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        status: 'WAITING_LIVE',
        ledgerFirstSeenAt: markerCreatedAt,
        graceUntil: markerCreatedAt,
      },
      update: {},
    });
    if (
      marker.policy !== 'EXACT_CANONICAL_RULE_RECONCILIATION' ||
      marker.eventId !== eventId
    ) {
      return {
        status: 'FAILED',
        createdRewards: 0,
        durableMarker: false,
      };
    }
    const terminalMarker = [
      'PROCESSED',
      'LIVE_PROCESSED',
      'DEAD_LETTER',
      'TERMINAL_SKIPPED',
      'QUARANTINED',
    ].includes(marker.status);
    if (terminalMarker && marker.factId !== input.fact.id) {
      const canonicalOwner = await this.prisma.guestGameEvent.findFirst({
        where: {
          id: eventId,
          tenantId: input.user.tenantId,
          originKey: input.originKey,
        },
        select: { profileId: true, guestId: true },
      });
      if (!canonicalOwner) {
        return {
          status: 'FAILED',
          createdRewards: 0,
          durableMarker: false,
        };
      }
      const ownerMatches =
        canonicalOwner.profileId === input.fact.profileId &&
        canonicalOwner.guestId === input.fact.guestId;
      if (!ownerMatches) {
        try {
          const ownerReconciliation = await reconcileExactCanonicalEventOwner(
            this.prisma,
            {
              tenantId: input.user.tenantId,
              eventId,
              originKey: input.originKey,
              expectedEventType: 'PLAY_HOUR',
              targetProfileId: input.fact.profileId!,
              targetGuestId: input.fact.guestId,
              sourceFactId: input.fact.id,
              sourceFactUpdatedAt: input.fact.updatedAt,
            },
          );
          if (ownerReconciliation.status === 'QUARANTINED') {
            return {
              status: 'FAILED',
              createdRewards: 0,
              durableMarker: true,
            };
          }
        } catch {
          // Ownership validation is fail-closed. The exact receipt remains
          // behind the durable cursor and is retried after the race settles.
          return {
            status: 'FAILED',
            createdRewards: 0,
            durableMarker: false,
          };
        }
      }
    }
    if (terminalMarker) {
      return {
        status: 'DUPLICATE',
        createdRewards: 0,
        durableMarker: true,
      };
    }
    if (marker.factId !== input.fact.id) {
      const rebound = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: marker.id,
          tenantId: input.user.tenantId,
          eventId,
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          factId: marker.factId,
          OR: [
            { status: { in: ['WAITING_LIVE', 'FAILED'] } },
            {
              status: 'PROCESSING',
              OR: [
                { claimExpiresAt: null },
                { claimExpiresAt: { lte: markerCreatedAt } },
              ],
            },
          ],
        },
        data: { factId: input.fact.id },
      });
      if (rebound.count !== 1) {
        return {
          status: 'DUPLICATE',
          createdRewards: 0,
          // A live lease still tied to a superseded parser fact is not
          // discoverable by the active-fact retry query. Do not advance the
          // exact cursor; a later run can rebind after the lease expires.
          durableMarker: false,
        };
      }
      marker = { ...marker, factId: input.fact.id };
    }
    if (
      marker.status === 'PROCESSING' &&
      marker.claimExpiresAt &&
      marker.claimExpiresAt > markerCreatedAt
    ) {
      return {
        status: 'DUPLICATE',
        createdRewards: 0,
        durableMarker: true,
      };
    }
    if (marker.attempts >= 3) {
      await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: marker.id,
          tenantId: input.user.tenantId,
          factId: input.fact.id,
          eventId,
          policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
          status: { in: ['WAITING_LIVE', 'FAILED', 'QUARANTINED'] },
          attempts: { gte: 3 },
        },
        data: {
          status: 'DEAD_LETTER',
          claimExpiresAt: null,
          processedAt: new Date(),
          lastError:
            marker.lastError ??
            'Exact reconciliation exhausted deterministic retry attempts.',
        },
      });
      return { status: 'FAILED', createdRewards: 0, durableMarker: true };
    }

    const claimAttempt = marker.attempts + 1;
    const claim = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: marker.id,
        tenantId: input.user.tenantId,
        factId: input.fact.id,
        eventId,
        policy: 'EXACT_CANONICAL_RULE_RECONCILIATION',
        attempts: { equals: marker.attempts, lt: 3 },
        OR: [
          { status: { in: ['WAITING_LIVE', 'FAILED', 'QUARANTINED'] } },
          {
            status: 'PROCESSING',
            OR: [
              { claimExpiresAt: null },
              { claimExpiresAt: { lte: markerCreatedAt } },
            ],
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
        attempts: { increment: 1 },
        claimExpiresAt: new Date(
          markerCreatedAt.getTime() + input.claimLeaseMs,
        ),
        lastError: null,
      },
    });
    if (claim.count !== 1) {
      return {
        status: 'DUPLICATE',
        createdRewards: 0,
        durableMarker: true,
      };
    }

    try {
      const canonicalEvent = await this.prisma.guestGameEvent.findFirst({
        where: {
          id: eventId,
          tenantId: input.user.tenantId,
          originKey: input.originKey,
        },
        select: { id: true },
      });
      if (!canonicalEvent) {
        throw new Error(
          'The canonical event bound to the exact receipt was not found.',
        );
      }
      const processed = await this.gamification.processEvent(
        input.user,
        { ...input.processDto, activeRulesOnly: true },
        {
          evaluationMode: 'LIVE_LEDGER_FALLBACK',
          evaluatorVersion: 'ledger-fallback-v1',
          originKey: input.originKey,
          ruleDomainTimeZones: input.ruleDomainTimeZones,
          ruleExternalDomains: input.ruleExternalDomains,
          allowedRuleIds: input.allowedRuleIds,
          allowedBattlePassSteps: input.allowedBattlePassSteps,
          exactReconciliationScope: {
            sourceFactId: input.fact.id,
            sourceFactUpdatedAt: input.fact.updatedAt,
            physicalSessionKey:
              buildGuestGamePhysicalProgressIdentity({
                externalProvider: input.fact.externalProvider,
                externalDomain: input.fact.externalDomain,
                sourceKind: input.fact.sourceKind,
                sessionExternalId: input.fact.sessionExternalId,
                eventType: input.fact.factType,
              })?.key ??
              (() => {
                throw new Error(
                  'Exact reconciliation fact has no stable physical session identity.',
                );
              })(),
            rules: [...input.allowedRuleIds].map((ruleId) => {
              const seasonStep =
                input.allowedBattlePassSteps.get(ruleId) ?? null;
              const ruleKind = seasonStep
                ? ('SEASON' as const)
                : input.fallbackRuleVersions.has(`MISSION:${ruleId}`)
                  ? ('MISSION' as const)
                  : ('LOOT_BOX' as const);
              const ruleUpdatedAt = input.fallbackRuleVersions.get(
                `${ruleKind}:${ruleId}`,
              );
              if (!ruleUpdatedAt) {
                throw new Error(
                  `Missing active ${ruleKind} version for exact reconciliation.`,
                );
              }
              return {
                ruleKind,
                ruleId,
                battlePassStep: seasonStep,
                ruleUpdatedAt,
              };
            }),
          },
          suppressLedgerShadow: true,
        },
      );
      if (
        processed.event.id !== eventId ||
        processed.summary.idempotent !== true
      ) {
        throw new Error(
          'Exact canonical reconciliation returned a different canonical event.',
        );
      }
      if (
        processed.summary.exactReconciliation?.complete !== true &&
        processed.summary.exactReconciliation?.waitingForDelivery === true
      ) {
        await this.prisma.guestGameOriginReceipt.updateMany({
          where: {
            id: marker.id,
            factId: input.fact.id,
            status: 'PROCESSING',
            claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
            attempts: claimAttempt,
          },
          data: {
            status: 'WAITING_LIVE',
            attempts: marker.attempts,
            claimExpiresAt: null,
            processedAt: null,
            lastError:
              'Exact effects are persisted and waiting for reward materialization.',
          },
        });
        return {
          status: 'DUPLICATE',
          createdRewards: 0,
          durableMarker: true,
        };
      }
      if (processed.summary.exactReconciliation?.complete !== true) {
        throw new Error(
          'Exact canonical reconciliation did not durably finalize every planned effect.',
        );
      }
      const finalized = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: marker.id,
          factId: input.fact.id,
          status: 'PROCESSING',
          claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
          attempts: claimAttempt,
        },
        data: {
          status: 'PROCESSED',
          eventId,
          claimExpiresAt: null,
          processedAt: new Date(),
          lastError: null,
        },
      });
      return finalized.count === 1
        ? {
            status: 'PROCESSED',
            createdRewards: processed.summary.createdRewards,
            durableMarker: true,
          }
        : {
            status: 'DUPLICATE',
            createdRewards: 0,
            durableMarker: true,
          };
    } catch (error) {
      const ownerQuarantined = exactOwnerQuarantineError(error);
      const deadLetter = ownerQuarantined || claimAttempt >= 3;
      await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: marker.id,
          factId: input.fact.id,
          status: 'PROCESSING',
          claimedSource: 'LEDGER_FALLBACK_EXACT_RECONCILIATION',
          attempts: claimAttempt,
        },
        data: {
          status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
          claimExpiresAt: null,
          processedAt: deadLetter ? new Date() : null,
          lastError: safeErrorMessage(error).slice(0, 500),
        },
      });
      return {
        status: 'FAILED',
        createdRewards: 0,
        durableMarker: true,
      };
    }
  }

  private async persistRetryableFactFailure(
    tenantId: string,
    fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
    originKey: string,
    eventType: string | null | undefined,
    errorMessage: string,
  ) {
    const now = new Date();
    await this.prisma.guestGameOriginReceipt.upsert({
      where: {
        tenantId_originKey: { tenantId, originKey },
      },
      create: {
        tenantId,
        originKey,
        factId: fact.id,
        eventType: normalizedString(eventType) ?? fact.factType,
        externalProvider: fact.externalProvider,
        externalDomain: fact.externalDomain,
        policy: 'LIVE_WITH_LEDGER_FALLBACK',
        status: 'FAILED',
        ledgerFirstSeenAt: now,
        graceUntil: now,
        lastError: errorMessage.slice(0, 500),
      },
      update: {},
    });
  }

  private async findOriginReceiptByCandidates(
    tenantId: string,
    originKeys: readonly string[],
  ) {
    for (const originKey of originKeys) {
      const receipt = await this.prisma.guestGameOriginReceipt.findFirst({
        where: { tenantId, originKey },
      });
      if (receipt) return receipt;
    }
    return null;
  }

  private async repointFallbackReceiptToActiveFact(
    receipt: {
      id: string;
      factId: string | null;
      policy: string;
      status: string;
      claimedSource: string | null;
      attempts: number;
      claimExpiresAt: Date | null;
      eventId?: string | null;
    },
    fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
    now: Date,
    graceMs: number,
  ) {
    const isTypedSessionStart =
      isSessionStartFactType(fact.factType) &&
      fact.factType !== 'SESSION_STARTED';
    if (
      (!isPlayTimeFactType(fact.factType) && !isTypedSessionStart) ||
      !receipt.factId ||
      receipt.policy !== 'LIVE_WITH_LEDGER_FALLBACK' ||
      ['EXACT_CANONICALIZATION', 'EXACT_OPERATOR_CANONICALIZATION'].includes(
        receipt.claimedSource ?? '',
      )
    ) {
      return null;
    }

    let processedGenericSessionStartUpgrade = false;
    if (
      isTypedSessionStart &&
      ['PROCESSED', 'LIVE_PROCESSED'].includes(receipt.status) &&
      normalizedString(receipt.eventId)
    ) {
      const previousFact = await this.prisma.guestActivityFact.findUnique({
        where: { id: receipt.factId },
        select: {
          factType: true,
          profileId: true,
          guestId: true,
          externalProvider: true,
          externalDomain: true,
          sourceKind: true,
          sessionExternalId: true,
          happenedAt: true,
        },
      });
      processedGenericSessionStartUpgrade =
        previousFact?.factType === 'SESSION_STARTED' &&
        Boolean(fact.profileId) &&
        Boolean(fact.guestId) &&
        previousFact.profileId === fact.profileId &&
        previousFact.guestId === fact.guestId &&
        previousFact.externalProvider === fact.externalProvider &&
        normalizedString(previousFact.externalDomain) ===
          normalizedString(fact.externalDomain) &&
        normalizedString(previousFact.sourceKind) ===
          normalizedString(fact.sourceKind) &&
        normalizedString(previousFact.sessionExternalId) ===
          normalizedString(fact.sessionExternalId) &&
        previousFact.happenedAt?.getTime() === fact.happenedAt?.getTime();
    }

    const graceUntil = processedGenericSessionStartUpgrade
      ? now
      : new Date(now.getTime() + graceMs);
    const repointed = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: receipt.id,
        factId: receipt.factId,
        policy: 'LIVE_WITH_LEDGER_FALLBACK',
        ...(isTypedSessionStart
          ? processedGenericSessionStartUpgrade
            ? {
                status: receipt.status,
                claimedSource: receipt.claimedSource,
                eventId: receipt.eventId,
              }
            : {
                claimedSource: null,
                eventId: null,
                status: { in: ['WAITING_LIVE', 'FAILED', 'SHADOWED'] },
              }
          : {
              claimedSource: { not: 'EXACT_CANONICALIZATION' },
              OR: [
                {
                  status: {
                    in: [
                      'WAITING_LIVE',
                      'FAILED',
                      'SHADOWED',
                      'PROCESSED',
                      'LIVE_PROCESSED',
                    ],
                  },
                },
                {
                  status: 'PROCESSING',
                  OR: [
                    { claimExpiresAt: null },
                    { claimExpiresAt: { lte: now } },
                  ],
                },
              ],
            }),
      },
      data: {
        factId: fact.id,
        status: 'WAITING_LIVE',
        claimedSource: null,
        attempts: 0,
        claimExpiresAt: null,
        ledgerFirstSeenAt: now,
        graceUntil,
        processedAt: null,
        lastError: null,
      },
    });
    if (repointed.count !== 1) {
      return null;
    }

    return { graceUntil };
  }
}

function fallbackRuleExternalDomains(
  rules: Array<{ id: string; storeIds: Prisma.JsonValue }>,
  stores: Array<{ id: string; externalDomain: string | null }>,
) {
  const domainByStoreId = new Map(
    stores.flatMap((store) => {
      const domain = normalizedString(store.externalDomain);
      return domain ? [[store.id, domain] as const] : [];
    }),
  );

  return new Map(
    rules.map((rule) => [
      rule.id,
      [
        ...new Set(
          jsonStringArray(rule.storeIds)
            .map((storeId) => domainByStoreId.get(storeId))
            .filter((domain): domain is string => Boolean(domain)),
        ),
      ],
    ]),
  );
}

function fallbackRuleDomainTimeZones(
  rules: Array<{ id: string; storeIds: Prisma.JsonValue }>,
  stores: Array<{
    id: string;
    externalDomain: string | null;
    timeZone: string | null;
  }>,
) {
  return new Map(
    rules.map((rule) => {
      const selectedStoreIds = new Set(jsonStringArray(rule.storeIds));
      const scopedStores = selectedStoreIds.size
        ? stores.filter((store) => selectedStoreIds.has(store.id))
        : stores;
      const storesByDomain = new Map<string, typeof scopedStores>();

      for (const store of scopedStores) {
        const domain = normalizedString(store.externalDomain);
        if (!domain) continue;
        const domainStores = storesByDomain.get(domain) ?? [];
        domainStores.push(store);
        storesByDomain.set(domain, domainStores);
      }

      return [
        rule.id,
        new Map(
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
            ];
          }),
        ),
      ] as const;
    }),
  );
}

function fallbackReceiptIsTerminal(
  mode: Exclude<GuestGameLedgerFallbackMode, 'OFF'>,
  receipt: {
    status: string;
    policy: string;
    claimedSource: string | null;
    attempts: number;
    claimExpiresAt: Date | null;
  },
  now: Date,
) {
  if (receipt.policy === 'EXACT_OPERATOR_CANONICALIZATION') {
    return true;
  }
  if (mode === 'SHADOW') {
    return [
      'SHADOWED',
      'PROCESSED',
      'LIVE_PROCESSED',
      'PROCESSING',
      'DEAD_LETTER',
    ].includes(receipt.status);
  }
  if (['PROCESSED', 'LIVE_PROCESSED', 'DEAD_LETTER'].includes(receipt.status)) {
    return true;
  }
  if (
    receipt.status === 'PROCESSING' &&
    receipt.claimedSource === 'EXACT_CANONICALIZATION'
  ) {
    return true;
  }
  return (
    receipt.status === 'PROCESSING' &&
    Boolean(receipt.claimExpiresAt && receipt.claimExpiresAt > now)
  );
}

function processedExactCanonicalReceiptMatches(
  receipt: {
    id: string;
    factId: string | null;
    eventId: string | null;
    policy: string;
    status: string;
    claimedSource: string | null;
  },
  fact: { id: string },
  expectedReceiptId?: string,
) {
  return (
    receipt.policy === 'EXACT_OPERATOR_CANONICALIZATION' &&
    receipt.status === 'PROCESSED' &&
    ['EXACT_CANONICALIZATION', 'EXACT_OPERATOR_CANONICALIZATION'].includes(
      receipt.claimedSource ?? '',
    ) &&
    (receipt.factId === fact.id ||
      (Boolean(expectedReceiptId) && receipt.id === expectedReceiptId)) &&
    Boolean(normalizedString(receipt.eventId))
  );
}

function fallbackLegacyExternalReference(dto: GuestGameProcessEventDto) {
  const stableExternalId = normalizedString(dto.externalId);
  const eventType = normalizedString(dto.eventType);
  if (!stableExternalId || !eventType) return null;
  return {
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain:
      normalizedString(dto.externalDomain) ?? 'guest-gamification-snapshot',
    externalId: [
      'guest-game',
      normalizedString(dto.sourceFactKind) ?? 'snapshot',
      eventType,
      stableExternalId,
    ].join(':'),
  };
}

function fallbackOriginKeys(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
  dto: GuestGameProcessEventDto,
) {
  const legacy = buildGuestGameOriginKey({
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    eventType: dto.eventType,
    stableExternalId: dto.externalId,
  });
  const canonical = isPlayTimeFactType(fact.factType)
    ? buildGuestGamePlayTimeOriginKey({
        externalProvider: fact.externalProvider,
        externalDomain: fact.externalDomain,
        sourceKind: fact.sourceKind,
        sessionExternalId: fact.sessionExternalId,
        eventType: dto.eventType,
      })
    : isSessionStartFactType(fact.factType)
      ? (buildGuestGamePhysicalSessionStartIdentity({
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          sourceKind: fact.sourceKind,
          sessionExternalId: fact.sessionExternalId,
          eventType: dto.eventType,
        })?.key ?? null)
      : legacy;
  const all = uniqueStrings([canonical, legacy]);
  if (!canonical || !legacy || !all.length) {
    throw new Error('Could not build canonical fallback origin keys.');
  }
  return { canonical, legacy, all };
}

function fallbackProcessDto(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
  stableExternalId: string | null = fallbackStableExternalId(fact),
): GuestGameProcessEventDto | null {
  const evidence = jsonRecord(fact.evidence);
  const legacySourceFactKind =
    fact.factType === 'PRODUCT_PURCHASED' ? 'PRODUCT_EXPENSE' : 'GUEST_SESSION';
  const common = {
    profileId: fact.profileId,
    guestId: fact.guestId,
    storeId: fact.storeId,
    occurredAt: fact.happenedAt?.toISOString() ?? null,
    sourceFactId: fact.id,
    sourceFactKind: legacySourceFactKind,
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    externalId: stableExternalId,
    sourceKind: fact.sourceKind,
    sessionExternalId: fact.sessionExternalId,
    suppressLootBoxRewards: true,
    payload: {
      fallback: true,
      factType: fact.factType,
      confidence: fact.confidence,
      sourceKind: fact.sourceKind,
      sessionExternalId: fact.sessionExternalId,
    },
  } satisfies GuestGameProcessEventDto;

  if (isSessionStartFactType(fact.factType)) {
    return {
      ...common,
      eventType: 'SESSION_START',
      sessionType:
        fact.factType === 'SESSION_STARTED'
          ? null
          : fact.factType === 'HOURLY_SESSION_STARTED'
            ? 'HOURLY'
            : 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket: fact.factType === 'PACKAGE_OR_SUBSCRIPTION_USED',
    };
  }
  if (
    fact.factType === 'SESSION_PLAY_TIME_ACCUMULATED' ||
    fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED' ||
    fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
  ) {
    return {
      ...common,
      eventType: 'PLAY_HOUR',
      sessionMinutes: fact.durationMinutes,
      sessionType:
        fact.factType === 'SESSION_PLAY_TIME_ACCUMULATED'
          ? null
          : fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED'
            ? 'HOURLY'
            : 'PACKAGE_OR_SUBSCRIPTION',
      sessionPacket:
        fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    };
  }
  if (fact.factType === 'PRODUCT_PURCHASED') {
    return {
      ...common,
      eventType: 'PRODUCT_PURCHASE',
      spendAmount: fact.amount?.toString() ?? null,
      productId: normalizedString(evidence.productId),
      externalProductId: normalizedString(evidence.productId),
      externalCategoryKey: normalizedString(evidence.externalCategoryKey),
      externalCategoryId: normalizedString(evidence.externalCategoryId),
      categoryId: normalizedString(evidence.categoryId),
      productName: normalizedString(evidence.productName),
      categoryName: normalizedString(evidence.categoryName),
      quantity: numericValue(evidence.quantity),
    };
  }
  return null;
}

function sessionStartEventNeedsTypedReclassification(
  event: { eventType: string; payload: Prisma.JsonValue | null },
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
) {
  if (
    event.eventType !== 'SESSION_START' ||
    !isSessionStartFactType(fact.factType) ||
    fact.factType === 'SESSION_STARTED'
  ) {
    return false;
  }
  const payload = jsonRecord(event.payload);
  const input = jsonRecord(payload.input);
  return (
    numericValue(payload.processSchemaVersion) === 2 &&
    normalizedString(payload.source) === 'guest_gamification_process_event' &&
    normalizedString(input.sessionType) === null &&
    normalizedString(payload.sourceFactId) !== fact.id
  );
}

/**
 * Langame session rows do not consistently expose a generic row id, but the
 * session id is stable across sync, parser reruns and API restarts. It is safe
 * to use for canonical session-start and play-time facts. Purchases
 * deliberately keep requiring the sale/expense id so a receipt cannot be
 * confused with an unrelated session.
 */
function fallbackStableExternalId(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
) {
  const sourceExternalId = normalizedString(fact.sourceExternalId);
  if (isSessionRuleFactType(fact.factType)) {
    return normalizedString(fact.sessionExternalId) ?? sourceExternalId;
  }
  return sourceExternalId;
}

function exactReconciliationFactValidationError(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
) {
  if (!isPlayTimeFactType(fact.factType)) {
    return 'Exact reconciliation source is not a supported play-time fact.';
  }
  if (!fact.profileId || !fact.guestId) {
    return 'Exact reconciliation source has no trusted profile and guest owner.';
  }
  if (!fact.happenedAt || !fact.durationMinutes || fact.durationMinutes <= 0) {
    return 'Exact reconciliation source has no positive duration or occurrence time.';
  }
  const stableExternalId = fallbackStableExternalId(fact);
  if (
    !stableExternalId ||
    !buildGuestGamePhysicalProgressIdentity({
      externalProvider: fact.externalProvider,
      externalDomain: fact.externalDomain,
      sourceKind: fact.sourceKind,
      sessionExternalId: fact.sessionExternalId,
      eventType: fact.factType,
    }) ||
    !fallbackProcessDto(fact, stableExternalId)
  ) {
    return 'Exact reconciliation source has no stable physical-session identity.';
  }
  return null;
}

function routedFallbackDryRun(
  dryRun: GuestGameDryRunResult,
  liveBattlePassScope: {
    profileId: string | null;
    factProfileId: string | null;
    seasonId: string | null;
    battlePassStep: number | null;
    missionsAllowAllProfiles: boolean;
    playTimeAllowAllProfiles: boolean;
  } | null = null,
): GuestGameDryRunResult {
  const rules = dryRun.rules.filter(
    (rule) =>
      rule.status === 'ACTIVE' &&
      guestGamePolicyAllowsEvaluation(
        rule.evaluationPolicy,
        'LIVE_LEDGER_FALLBACK',
      ) &&
      (!liveBattlePassScope ||
        liveBattlePassScope.playTimeAllowAllProfiles ||
        (rule.kind === 'MISSION' &&
          liveBattlePassScope.missionsAllowAllProfiles) ||
        (rule.kind === 'SEASON' &&
          liveBattlePassScope.factProfileId === liveBattlePassScope.profileId &&
          rule.id === liveBattlePassScope.seasonId &&
          rule.battlePassStep === liveBattlePassScope.battlePassStep &&
          rule.rewardType === 'BONUS_BALANCE' &&
          (rule.rewardAmount ?? 0) > 0 &&
          rule.xpDelta === 0 &&
          !rule.manualApprovalRequired)),
  );
  const eligible = rules.filter((rule) => rule.eligible);
  return {
    ...dryRun,
    rules,
    summary: {
      checkedRules: rules.length,
      eligibleRules: eligible.length,
      blockedRules: rules.length - eligible.length,
      estimatedRewardAmount: eligible.reduce(
        (sum, rule) => sum + (rule.rewardAmount ?? 0),
        0,
      ),
      projectedXpDelta: eligible.reduce((sum, rule) => sum + rule.xpDelta, 0),
    },
  };
}

function seasonHasFallbackStep(
  value: Prisma.JsonValue,
  expectedStep: number | null = null,
) {
  if (!Array.isArray(value)) return false;
  return value.some((level, index) => {
    const record = jsonRecord(level);
    const sequence =
      optionalPositiveInteger(record.sequence) ??
      optionalPositiveInteger(record.order) ??
      index + 1;
    if (expectedStep !== null && sequence !== expectedStep) return false;
    const activationRules = jsonRecord(record.activationRules);
    return guestGamePolicyAllowsEvaluation(
      guestGameBattlePassStepEvaluationPolicy(activationRules),
      'LIVE_LEDGER_FALLBACK',
    );
  });
}

function isPlayTimeFactType(value: string) {
  return [
    'HOURLY_PLAY_TIME_ACCUMULATED',
    'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    'SESSION_PLAY_TIME_ACCUMULATED',
  ].includes(value);
}

function isSessionStartFactType(value: string) {
  return [
    'SESSION_STARTED',
    'HOURLY_SESSION_STARTED',
    'PACKAGE_OR_SUBSCRIPTION_USED',
  ].includes(value);
}

function isSessionRuleFactType(value: string) {
  return isPlayTimeFactType(value) || isSessionStartFactType(value);
}

function fallbackEventTypes(factTypes: readonly string[]) {
  return uniqueStrings([
    factTypes.some((factType) => isPlayTimeFactType(factType))
      ? 'PLAY_HOUR'
      : null,
    factTypes.some((factType) => isSessionStartFactType(factType))
      ? 'SESSION_START'
      : null,
    factTypes.includes('PRODUCT_PURCHASED') ? 'PRODUCT_PURCHASE' : null,
  ]);
}

function fallbackWatermarkOriginKey(
  factTypes: readonly string[],
  liveNotBefore: Date | null,
) {
  return [
    'system',
    'ledger-fallback',
    'watermark',
    'v3',
    liveNotBefore?.toISOString() ?? 'no-cutoff',
    [...factTypes].sort().join(','),
  ].join(':');
}

function fallbackExactReconciliationWatermarkOriginKey(
  liveNotBefore: Date | null,
) {
  return [
    'system',
    'ledger-fallback',
    'exact-reconciliation-watermark',
    'v1',
    liveNotBefore?.toISOString() ?? 'no-cutoff',
  ].join(':');
}

function receiptComesAfterWatermark(
  receipt: { id: string; updatedAt: Date },
  watermark: {
    factId: string | null;
    ledgerFirstSeenAt: Date;
  } | null,
) {
  if (!watermark) return true;
  const timestampDelta =
    receipt.updatedAt.getTime() - watermark.ledgerFirstSeenAt.getTime();
  return (
    timestampDelta > 0 ||
    (timestampDelta === 0 && receipt.id > (watermark.factId ?? ''))
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function uniqueFacts<T extends { id: string }>(facts: T[]) {
  return [...new Map(facts.map((fact) => [fact.id, fact])).values()];
}

function playTimeSessionKey(
  externalProvider: string,
  externalDomain: string,
  sourceKind: string,
  sessionExternalId: string,
) {
  const identity = buildGuestGamePhysicalProgressIdentity({
    externalProvider,
    externalDomain,
    sourceKind,
    sessionExternalId,
    eventType: 'PLAY_HOUR',
  });
  if (!identity) {
    throw new Error('Play-time fact has no stable physical session identity.');
  }
  return identity.key;
}

function sessionStartSessionKey(
  externalProvider: string,
  externalDomain: string,
  sourceKind: string,
  sessionExternalId: string,
  profileId: string | null,
  guestId: string | null,
  happenedAt: Date | null,
) {
  const identity = buildGuestGamePhysicalSessionStartIdentity({
    externalProvider,
    externalDomain,
    sourceKind,
    eventType: 'SESSION_START',
    sessionExternalId,
  });
  const ownerId = normalizedString(profileId) ?? normalizedString(guestId);
  if (!identity || !ownerId || !happenedAt) {
    throw new Error(
      'Session-start fact has no stable physical identity, owner or occurrence time.',
    );
  }
  return [identity.key, ownerId, happenedAt.toISOString()].join(':');
}

function sessionStartCandidateSelection<
  T extends {
    id: string;
    externalProvider: string;
    externalDomain: string;
    sourceKind: string;
    sessionExternalId: string | null;
    factType: string;
    validFrom: Date;
    profileId: string | null;
    guestId: string | null;
    happenedAt: Date | null;
  },
>(facts: T[]) {
  const factsBySession = new Map<string, T[]>();
  for (const fact of facts) {
    if (!fact.sessionExternalId) continue;
    const key = sessionStartSessionKey(
      fact.externalProvider,
      fact.externalDomain,
      fact.sourceKind,
      fact.sessionExternalId,
      fact.profileId,
      fact.guestId,
      fact.happenedAt,
    );
    const sessionFacts = factsBySession.get(key) ?? [];
    sessionFacts.push(fact);
    factsBySession.set(key, sessionFacts);
  }

  return new Map(
    [...factsBySession.entries()].flatMap(([key, sessionFacts]) => {
      const specificFacts = sessionFacts.filter(
        (fact) => fact.factType !== 'SESSION_STARTED',
      );
      const specificTypes = new Set(specificFacts.map((fact) => fact.factType));
      const conflicting = specificTypes.size > 1;
      const candidates = specificFacts.length
        ? specificFacts
        : sessionFacts.filter((fact) => fact.factType === 'SESSION_STARTED');
      const preferred = [...candidates].sort(
        (left, right) =>
          right.validFrom.getTime() - left.validFrom.getTime() ||
          right.id.localeCompare(left.id),
      )[0];
      return preferred ? [[key, { preferred, conflicting }] as const] : [];
    }),
  );
}

function playTimeConflictCandidates(
  facts: Array<{
    id: string;
    externalProvider: string;
    externalDomain: string;
    sourceKind: string;
    sessionExternalId: string | null;
    factType: string;
    validFrom: Date;
  }>,
) {
  const factsBySession = new Map<string, typeof facts>();
  for (const fact of facts) {
    if (!fact.sessionExternalId) continue;
    const key = playTimeSessionKey(
      fact.externalProvider,
      fact.externalDomain,
      fact.sourceKind,
      fact.sessionExternalId,
    );
    const sessionFacts = factsBySession.get(key) ?? [];
    sessionFacts.push(fact);
    factsBySession.set(key, sessionFacts);
  }
  return new Map(
    [...factsBySession.entries()]
      .filter(
        ([, sessionFacts]) =>
          new Set(sessionFacts.map((fact) => fact.factType)).size > 1,
      )
      .map(([key, sessionFacts]) => [
        key,
        [...sessionFacts].sort(
          (left, right) =>
            right.validFrom.getTime() - left.validFrom.getTime() ||
            right.id.localeCompare(left.id),
        )[0],
      ]),
  );
}

function fallbackEvidence(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
): Prisma.InputJsonObject {
  return {
    source: 'guest_activity_fact',
    factType: fact.factType,
    confidence: fact.confidence,
    happenedAt: fact.happenedAt?.toISOString() ?? null,
    durationMinutes: fact.durationMinutes,
    amount: fact.amount?.toString() ?? null,
  };
}

function requestedFallbackFactTypes(
  value: unknown,
  mode: GuestGameLedgerFallbackMode,
): FallbackFactType[] {
  const requested = Array.isArray(value)
    ? value
        .map((item) => normalizedString(item)?.toUpperCase())
        .filter((item): item is string => Boolean(item))
    : [];
  const effective = new Set<string>(
    requested.length ? requested : [...defaultFallbackFactTypes],
  );
  const allowed = fallbackFactTypes.filter((factType) =>
    effective.has(factType),
  );
  return mode === 'LIVE'
    ? allowed.filter((factType) => factType !== 'PRODUCT_PURCHASED')
    : allowed;
}

function fallbackMode(value: unknown): GuestGameLedgerFallbackMode {
  const normalized = normalizedString(value)?.toUpperCase();
  return normalized === 'LIVE' || normalized === 'SHADOW' ? normalized : 'OFF';
}

function validDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const normalized = normalizedString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function optionalPositiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function emptyTenantResult(
  tenantId: string,
  tenantSlug: string,
  status: GuestGameLedgerFallbackTenantResult['status'],
  reason: string | null,
): GuestGameLedgerFallbackTenantResult {
  return {
    tenantId,
    tenantSlug,
    status,
    reason,
    checkedFacts: 0,
    deferredFacts: 0,
    liveHandledFacts: 0,
    shadowFacts: 0,
    fallbackFacts: 0,
    duplicateFacts: 0,
    failedFacts: 0,
    createdEvents: 0,
    createdRewards: 0,
  };
}

function summarize(
  mode: GuestGameLedgerFallbackMode,
  tenants: GuestGameLedgerFallbackTenantResult[],
): GuestGameLedgerFallbackRunResult {
  const total = (key: keyof GuestGameLedgerFallbackTenantResult) =>
    tenants.reduce(
      (sum, tenant) =>
        sum + (typeof tenant[key] === 'number' ? tenant[key] : 0),
      0,
    );
  return {
    mode,
    checkedTenants: tenants.length,
    processedTenants: tenants.filter((item) => item.status === 'PROCESSED')
      .length,
    skippedTenants: tenants.filter((item) => item.status === 'SKIPPED').length,
    erroredTenants: tenants.filter((item) => item.status === 'ERROR').length,
    checkedFacts: total('checkedFacts'),
    deferredFacts: total('deferredFacts'),
    liveHandledFacts: total('liveHandledFacts'),
    shadowFacts: total('shadowFacts'),
    fallbackFacts: total('fallbackFacts'),
    duplicateFacts: total('duplicateFacts'),
    failedFacts: total('failedFacts'),
    createdEvents: total('createdEvents'),
    createdRewards: total('createdRewards'),
    tenants,
  };
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(normalizedString)
        .filter((item): item is string => Boolean(item))
    : [];
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value).trim() || null;
}

function numericValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Ledger fallback failed.';
}

function exactOwnerQuarantineError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const getResponse = (error as { getResponse?: unknown }).getResponse;
  if (typeof getResponse !== 'function') return false;
  const response: unknown = (getResponse as () => unknown).call(error);
  return jsonRecord(response).code === EXACT_CANONICAL_OWNER_QUARANTINED_CODE;
}
