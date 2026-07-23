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
import { guestGameRuleActivationAt } from './guest-game-rule-evaluator';
import { buildGuestGameOriginKey } from './guest-game-origin-key';
import { guestGamePolicyAllowsEvaluation } from './guest-game-source-policy';

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
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
  'PRODUCT_PURCHASED',
] as const;

const defaultFallbackFactTypes = [
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
        !profileId ||
        !seasonId ||
        battlePassStep === null ||
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
  ) {
    const [allMissions, allSeasons, stores] = await Promise.all([
      this.prisma.guestGameMission.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          evaluationPolicy: 'LIVE_WITH_LEDGER_FALLBACK',
        },
        select: {
          id: true,
          createdAt: true,
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
          periodFrom: true,
          levels: true,
          storeIds: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, externalDomain: true, timeZone: true },
      }),
    ]);
    const missions =
      mode === 'LIVE'
        ? missionsAllowAllProfiles
          ? allMissions
          : []
        : allMissions;
    const seasons =
      mode === 'LIVE'
        ? allSeasons.filter((season) => season.id === seasonId)
        : allSeasons;
    const fallbackSeasons = seasons.filter((season) =>
      seasonHasFallbackStep(
        season.levels,
        mode === 'LIVE' ? battlePassStep : null,
      ),
    );
    if (!missions.length && !fallbackSeasons.length) {
      return emptyTenantResult(
        user.tenantId,
        user.tenantSlug,
        'SKIPPED',
        'No active rules use LIVE_WITH_LEDGER_FALLBACK.',
      );
    }
    const ruleExternalDomains = fallbackRuleExternalDomains(
      [...missions, ...fallbackSeasons],
      stores,
    );
    const ruleDomainTimeZones = fallbackRuleDomainTimeZones(
      [...missions, ...fallbackSeasons],
      stores,
    );

    const earliestRuleActivation = [
      ...missions.map((mission) =>
        guestGameRuleActivationAt(mission.createdAt, mission.conditions),
      ),
      ...fallbackSeasons.map((season) => season.periodFrom ?? season.createdAt),
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
    const factPageSize = Math.max(limit * 4, 100);
    let factCursor: { id: string } | undefined;

    while (result.checkedFacts < limit) {
      const facts = await this.prisma.guestActivityFact.findMany({
        where: {
          tenantId: user.tenantId,
          profileId:
            mode === 'LIVE' && missionsAllowAllProfiles
              ? undefined
              : (profileId ?? undefined),
          factType: { in: factTypes },
          lifecycleStatus: 'ACTIVE',
          confidence: 'EXACT',
          supersededAt: null,
          happenedAt: { gte: earliestActivation },
          AND: [
            {
              OR: [{ guestId: { not: null } }, { profileId: { not: null } }],
            },
            {
              OR: [
                { sourceExternalId: { not: null } },
                {
                  factType: {
                    in: [
                      'HOURLY_PLAY_TIME_ACCUMULATED',
                      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
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
                    ],
                  },
                  durationMinutes: { gt: 0 },
                },
                { factType: 'PRODUCT_PURCHASED' },
              ],
            },
          ],
        },
        orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
        take: factPageSize,
        ...(factCursor ? { cursor: factCursor, skip: 1 } : {}),
      });
      if (!facts.length) break;

      for (const fact of facts) {
        if (result.checkedFacts >= limit) break;
        const stableExternalId = fallbackStableExternalId(fact);
        const processDto = fallbackProcessDto(fact, stableExternalId);
        if (!processDto || !fact.happenedAt || !stableExternalId) continue;
        const originKey = buildGuestGameOriginKey({
          externalProvider: fact.externalProvider,
          externalDomain: fact.externalDomain,
          eventType: processDto.eventType,
          stableExternalId,
        });
        if (!originKey) continue;

        let routedDryRun: GuestGameDryRunResult;
        try {
          routedDryRun = routedFallbackDryRun(
            await this.gamification.dryRun(user, processDto, {
              ruleDomainTimeZones,
              ruleExternalDomains,
            }),
            mode === 'LIVE'
              ? {
                  profileId: profileId!,
                  factProfileId: fact.profileId,
                  seasonId: seasonId!,
                  battlePassStep: battlePassStep!,
                  missionsAllowAllProfiles,
                }
              : null,
          );
        } catch {
          result.failedFacts += 1;
          continue;
        }
        if (!routedDryRun.rules.length) continue;
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
        const receipt = await this.prisma.guestGameOriginReceipt.upsert({
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

        if (receipt.factId && receipt.factId !== fact.id) {
          result.duplicateFacts += 1;
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
                { originKey },
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
            select: { id: true },
          });
          if (liveEvent) {
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

      factCursor = { id: facts[facts.length - 1].id };
      if (facts.length < factPageSize) break;
    }

    return result;
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
    suppressLootBoxRewards: true,
    payload: {
      fallback: true,
      factType: fact.factType,
      confidence: fact.confidence,
    },
  } satisfies GuestGameProcessEventDto;

  if (
    fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED' ||
    fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
  ) {
    return {
      ...common,
      eventType: 'PLAY_HOUR',
      sessionMinutes: fact.durationMinutes,
      sessionType:
        fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED'
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

/**
 * Langame session rows do not consistently expose a generic row id, but the
 * session id is stable across sync, parser reruns and API restarts. It is safe
 * to use only for play-time facts. Purchases deliberately keep requiring the
 * sale/expense id so a receipt cannot be confused with an unrelated session.
 */
function fallbackStableExternalId(
  fact: Prisma.GuestActivityFactGetPayload<Record<string, never>>,
) {
  const sourceExternalId = normalizedString(fact.sourceExternalId);
  if (
    fact.factType === 'HOURLY_PLAY_TIME_ACCUMULATED' ||
    fact.factType === 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
  ) {
    return normalizedString(fact.sessionExternalId) ?? sourceExternalId;
  }
  return sourceExternalId;
}

function routedFallbackDryRun(
  dryRun: GuestGameDryRunResult,
  liveBattlePassScope: {
    profileId: string;
    factProfileId: string | null;
    seasonId: string;
    battlePassStep: number;
    missionsAllowAllProfiles: boolean;
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
    return (
      normalizedString(activationRules.evaluationPolicy)?.toUpperCase() ===
      'LIVE_WITH_LEDGER_FALLBACK'
    );
  });
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
