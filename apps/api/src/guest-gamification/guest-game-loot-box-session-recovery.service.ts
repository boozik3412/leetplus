import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TenantLifecycleStatus,
  type IntegrationProvider,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuestGamificationService,
  type GuestGameDryRunResult,
  type GuestGameProcessEventDto,
} from './guest-gamification.service';
import { buildGuestGameOriginKey } from './guest-game-origin-key';
import { guestGameTriggerMatches } from './guest-game-progress';
import { guestGameRuleActivationAt } from './guest-game-rule-evaluator';

export type GuestGameLootBoxSessionRecoveryMode = 'OFF' | 'SHADOW' | 'LIVE';

export type GuestGameLootBoxSessionRecoveryRunDto = {
  mode?: GuestGameLootBoxSessionRecoveryMode;
  tenantId?: string | null;
  tenantSlug?: string | null;
  profileId?: string | null;
  liveNotBefore?: Date | string | null;
  allowAllTenants?: boolean;
  limit?: number | string | null;
  correlationWindowMs?: number | string | null;
  graceMs?: number | string | null;
  claimLeaseMs?: number | string | null;
  retryLimit?: number | string | null;
  maxAttempts?: number | string | null;
  lookbackMs?: number | string | null;
  overlapLimit?: number | string | null;
};

export type GuestGameLootBoxSessionRecoveryTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  checkedSessions: number;
  unmatchedSessions: number;
  ambiguousSessions: number;
  correlatedSessions: number;
  deferredSessions: number;
  shadowSessions: number;
  recoveredSessions: number;
  duplicateSessions: number;
  failedSessions: number;
  deadLetterSessions: number;
  matchedRules: number;
};

export type GuestGameLootBoxSessionRecoveryRunResult = {
  mode: GuestGameLootBoxSessionRecoveryMode;
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  checkedSessions: number;
  unmatchedSessions: number;
  ambiguousSessions: number;
  correlatedSessions: number;
  deferredSessions: number;
  shadowSessions: number;
  recoveredSessions: number;
  duplicateSessions: number;
  failedSessions: number;
  deadLetterSessions: number;
  matchedRules: number;
  tenants: GuestGameLootBoxSessionRecoveryTenantResult[];
};

export type SessionCorrelationFact = {
  id: string;
  tenantId: string;
  profileId: string | null;
  guestId: string | null;
  storeId: string | null;
  externalProvider: IntegrationProvider;
  externalDomain: string;
  externalGuestId: string;
  sourceHash: string;
  sourceExternalId: string | null;
  sessionExternalId: string | null;
  factType: string;
  happenedAt: Date | null;
  confidence: string;
  lifecycleStatus: string;
  supersededAt: Date | null;
  createdAt: Date;
};

export type GuestGamePackageSessionCorrelation = {
  status: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
  anchor: SessionCorrelationFact;
  marker: SessionCorrelationFact | null;
  candidateIds: string[];
  deltaMs: number | null;
};

const supportedSessionTypes = new Set([
  '',
  'ANY',
  'HOURLY',
  'REGULAR_SESSION',
  'PACKAGE_OR_SUBSCRIPTION',
  'PACKAGE',
  'SUBSCRIPTION',
  'PACKET_HOURS',
]);

type RecoverySessionClass = 'ANY' | 'HOURLY' | 'PACKAGE_OR_SUBSCRIPTION';

const RECOVERY_POLICY = 'LOOT_BOX_SESSION_RECOVERY';
const RECOVERY_WATERMARK_POLICY = 'LOOT_BOX_SESSION_RECOVERY_WATERMARK';
const RECOVERY_WATERMARK_ORIGIN_PREFIX =
  'guest-game:loot-box-session-recovery:watermark:v1';

type RecoveryReceipt = {
  id: string;
  factId: string | null;
  eventType: string;
  status: string;
  policy: string;
  claimedSource: string | null;
  attempts: number;
  graceUntil: Date;
  claimExpiresAt: Date | null;
};

type RecoveryRuleScope = {
  id: string;
  storeIds: Prisma.JsonValue;
};

@Injectable()
export class GuestGameLootBoxSessionRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GuestGamificationService,
  ) {}

  async runScheduled(
    dto: GuestGameLootBoxSessionRecoveryRunDto = {},
  ): Promise<GuestGameLootBoxSessionRecoveryRunResult> {
    const mode = recoveryMode(dto.mode);
    const tenantId = normalizedString(dto.tenantId);
    const tenantSlug = normalizedString(dto.tenantSlug);
    const profileId = normalizedString(dto.profileId);
    const limit = boundedInteger(dto.limit, 30, 1, 100);
    const correlationWindowMs = boundedInteger(
      dto.correlationWindowMs,
      60_000,
      1_000,
      60_000,
    );
    const graceMs = boundedInteger(dto.graceMs, 60_000, 0, 10 * 60_000);
    const claimLeaseMs = boundedInteger(
      dto.claimLeaseMs,
      120_000,
      30_000,
      10 * 60_000,
    );
    const retryLimit = boundedInteger(dto.retryLimit, 30, 1, 100);
    const maxAttempts = boundedInteger(dto.maxAttempts, 5, 1, 20);
    const lookbackMs = boundedInteger(
      dto.lookbackMs,
      24 * 60 * 60_000,
      60_000,
      7 * 24 * 60 * 60_000,
    );
    const overlapLimit = boundedInteger(dto.overlapLimit, limit, 1, 100);
    const liveNotBefore = validDate(dto.liveNotBefore);

    if (
      mode !== 'OFF' &&
      !tenantId &&
      !tenantSlug &&
      dto.allowAllTenants !== true
    ) {
      return summarize(mode, []);
    }
    // LIVE is deliberately canary-only. Expanding beyond one tenant/profile is
    // an explicit rollout decision rather than a permissive environment typo.
    if (
      mode === 'LIVE' &&
      (!liveNotBefore || !profileId || (!tenantId && !tenantSlug))
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
    const results: GuestGameLootBoxSessionRecoveryTenantResult[] = [];

    for (const tenant of tenants) {
      if (mode === 'OFF' || tenant.status !== TenantLifecycleStatus.ACTIVE) {
        results.push(
          emptyTenantResult(
            tenant.id,
            tenant.slug,
            'SKIPPED',
            mode === 'OFF'
              ? 'Loot-box session recovery is disabled.'
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
            profileId,
            liveNotBefore,
            limit,
            correlationWindowMs,
            graceMs,
            claimLeaseMs,
            retryLimit,
            maxAttempts,
            lookbackMs,
            overlapLimit,
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
    mode: Exclude<GuestGameLootBoxSessionRecoveryMode, 'OFF'>,
    profileId: string | null,
    liveNotBefore: Date | null,
    limit: number,
    correlationWindowMs: number,
    graceMs: number,
    claimLeaseMs: number,
    retryLimit: number,
    maxAttempts: number,
    lookbackMs: number,
    overlapLimit: number,
  ): Promise<GuestGameLootBoxSessionRecoveryTenantResult> {
    const [lootBoxes, stores] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          usageKind: { in: ['STANDALONE', 'BOTH'] },
        },
        select: {
          id: true,
          createdAt: true,
          triggerKind: true,
          sessionType: true,
          storeIds: true,
          limits: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, externalDomain: true, timeZone: true },
      }),
    ]);
    const supportedRules = lootBoxes.filter(
      (rule) =>
        guestGameTriggerMatches(rule.triggerKind, 'SESSION_START') &&
        supportedSessionTypes.has(
          normalizedString(rule.sessionType)?.toUpperCase() ?? '',
        ),
    );
    if (!supportedRules.length) {
      return emptyTenantResult(
        user.tenantId,
        user.tenantSlug,
        'SKIPPED',
        'No active standalone loot boxes support session start.',
      );
    }

    const earliestRuleActivation = supportedRules
      .map((rule) => guestGameRuleActivationAt(rule.createdAt, rule.limits))
      .reduce((earliest, current) => (current < earliest ? current : earliest));
    const cutoff =
      liveNotBefore && liveNotBefore > earliestRuleActivation
        ? liveNotBefore
        : earliestRuleActivation;
    const ruleIdsBySessionClass = new Map<RecoverySessionClass, Set<string>>([
      ['ANY', new Set<string>()],
      ['HOURLY', new Set<string>()],
      ['PACKAGE_OR_SUBSCRIPTION', new Set<string>()],
    ]);
    for (const rule of supportedRules) {
      const sessionClass = recoveryRuleSessionClass(rule.sessionType);
      if (sessionClass) ruleIdsBySessionClass.get(sessionClass)?.add(rule.id);
    }
    const ruleExternalDomains = recoveryRuleExternalDomains(
      supportedRules,
      stores,
    );
    const ruleDomainTimeZones = recoveryRuleDomainTimeZones(
      supportedRules,
      stores,
    );
    const domainOnlyRuleScopes = recoveryDomainOnlyRuleScopes(
      supportedRules,
      stores,
    );
    const result = emptyTenantResult(
      user.tenantId,
      user.tenantSlug,
      'PROCESSED',
      null,
    );
    const now = new Date();
    const retryProfileScope = profileId
      ? Prisma.sql`fact."profileId" = ${profileId}`
      : Prisma.sql`fact."profileId" IS NOT NULL`;
    const retryStatusScope =
      mode === 'LIVE'
        ? Prisma.sql`
            (
              (
                receipt."status" IN ('WAITING_LIVE', 'FAILED', 'SHADOWED')
                AND receipt."graceUntil" <= ${now}
              )
              OR (
                receipt."status" = 'WAITING_CORRELATION'
                AND receipt."graceUntil" <= ${now}
              )
              OR (
                receipt."status" = 'PROCESSING'
                AND (
                  receipt."claimExpiresAt" <= ${now}
                  OR receipt."claimExpiresAt" IS NULL
                )
              )
            )
          `
        : Prisma.sql`
            (
              receipt."status" IN ('WAITING_LIVE', 'FAILED')
              OR (
                receipt."status" = 'WAITING_CORRELATION'
                AND receipt."graceUntil" <= ${now}
              )
              OR (
                receipt."status" = 'PROCESSING'
                AND (
                  receipt."claimExpiresAt" <= ${now}
                  OR receipt."claimExpiresAt" IS NULL
                )
              )
            )
          `;
    // Receipt has no Prisma relation to its source fact. Keep the profile and
    // anchor eligibility predicate inside PostgreSQL so unrelated tenant
    // receipts cannot occupy the bounded retry batch before profile scoping.
    const retryReceipts = await this.prisma.$queryRaw<RecoveryReceipt[]>(
      Prisma.sql`
        SELECT
          receipt."id",
          receipt."factId",
          receipt."eventType",
          receipt."status",
          receipt."policy",
          receipt."claimedSource",
          receipt."attempts",
          receipt."graceUntil",
          receipt."claimExpiresAt"
        FROM "GuestGameOriginReceipt" AS receipt
        WHERE receipt."tenantId" = ${user.tenantId}
          AND receipt."policy" = ${RECOVERY_POLICY}
          AND ${retryStatusScope}
          AND EXISTS (
            SELECT 1
            FROM "GuestActivityFact" AS fact
            WHERE fact."id" = receipt."factId"
              AND fact."tenantId" = receipt."tenantId"
              AND ${retryProfileScope}
              AND fact."guestId" IS NOT NULL
              AND fact."factType" = 'SESSION_STARTED'
              AND fact."lifecycleStatus" = 'ACTIVE'
              AND fact."confidence" = 'EXACT'
              AND fact."supersededAt" IS NULL
              AND fact."happenedAt" >= ${cutoff}
              AND (
                fact."sessionExternalId" IS NOT NULL
                OR fact."sourceExternalId" IS NOT NULL
              )
          )
        ORDER BY receipt."updatedAt" ASC, receipt."id" ASC
        LIMIT ${retryLimit}
      `,
    );
    const retryableReceipts: RecoveryReceipt[] = [];
    const deadLetterReceiptKeys = new Set<string>();
    for (const receipt of retryReceipts) {
      if (
        receipt.status === 'WAITING_CORRELATION' ||
        receipt.attempts < maxAttempts
      ) {
        retryableReceipts.push(receipt);
        continue;
      }
      const deadLettered = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          policy: RECOVERY_POLICY,
          attempts: { gte: maxAttempts },
          status: receipt.status,
        },
        data: {
          status: 'DEAD_LETTER',
          claimExpiresAt: null,
          processedAt: now,
          lastError:
            'Loot-box session recovery exhausted the maximum number of attempts.',
        },
      });
      if (deadLettered.count > 0) {
        if (receipt.factId) {
          deadLetterReceiptKeys.add(`${receipt.factId}:${receipt.eventType}`);
        }
        result.deadLetterSessions += 1;
        result.failedSessions += 1;
      }
    }

    const retryFactIds = uniqueStrings(
      retryableReceipts.map((receipt) => receipt.factId),
    );
    const retryAnchors = retryFactIds.length
      ? ((await this.prisma.guestActivityFact.findMany({
          where: {
            id: { in: retryFactIds },
            tenantId: user.tenantId,
            profileId: profileId ?? { not: null },
            guestId: { not: null },
            factType: 'SESSION_STARTED',
            lifecycleStatus: 'ACTIVE',
            confidence: 'EXACT',
            supersededAt: null,
            happenedAt: { gte: cutoff },
            OR: [
              { sessionExternalId: { not: null } },
              { sourceExternalId: { not: null } },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })) as SessionCorrelationFact[])
      : [];

    const watermark = await this.prisma.guestGameOriginReceipt.findUnique({
      where: {
        tenantId_originKey: {
          tenantId: user.tenantId,
          originKey: recoveryWatermarkOriginKey(mode, profileId),
        },
      },
      select: { factId: true, ledgerFirstSeenAt: true },
    });
    const watermarkAt = watermark?.ledgerFirstSeenAt ?? null;
    const watermarkId = watermark?.factId ?? null;
    const discoveryAnchors = (await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: user.tenantId,
        profileId: profileId ?? { not: null },
        guestId: { not: null },
        factType: 'SESSION_STARTED',
        lifecycleStatus: 'ACTIVE',
        confidence: 'EXACT',
        supersededAt: null,
        happenedAt: { gte: cutoff },
        OR: [
          { sessionExternalId: { not: null } },
          { sourceExternalId: { not: null } },
        ],
        ...(watermarkAt
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { gt: watermarkAt } },
                    {
                      createdAt: watermarkAt,
                      id: { gt: watermarkId ?? '' },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    })) as SessionCorrelationFact[];
    const overlapAnchors = (await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: user.tenantId,
        profileId: profileId ?? { not: null },
        guestId: { not: null },
        factType: 'SESSION_STARTED',
        lifecycleStatus: 'ACTIVE',
        confidence: 'EXACT',
        supersededAt: null,
        happenedAt: { gte: cutoff },
        createdAt: { gte: new Date(now.getTime() - lookbackMs) },
        OR: [
          { sessionExternalId: { not: null } },
          { sourceExternalId: { not: null } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: overlapLimit,
    })) as SessionCorrelationFact[];
    const anchors = uniqueFacts([
      ...retryAnchors,
      ...discoveryAnchors,
      ...overlapAnchors,
    ]);
    const evaluableFactIds = new Set(
      [...discoveryAnchors, ...overlapAnchors].map((fact) => fact.id),
    );
    const retryReceiptByFactAndEventType = new Map(
      retryableReceipts.flatMap((receipt) =>
        receipt.factId
          ? [[`${receipt.factId}:${receipt.eventType}`, receipt] as const]
          : [],
      ),
    );
    const claimedMarkerIds = new Set<string>();
    if (anchors.length) {
      const happenedAt = anchors
        .map((fact) => fact.happenedAt)
        .filter((value): value is Date => Boolean(value));
      if (happenedAt.length) {
        const markerFrom = new Date(
          Math.min(...happenedAt.map((value) => value.getTime())) -
            correlationWindowMs,
        );
        const markerTo = new Date(
          Math.max(...happenedAt.map((value) => value.getTime())) +
            correlationWindowMs,
        );
        const markers = (await this.prisma.guestActivityFact.findMany({
          where: {
            tenantId: user.tenantId,
            profileId: profileId ?? {
              in: uniqueStrings(anchors.map((anchor) => anchor.profileId)),
            },
            externalDomain: {
              in: uniqueStrings(
                anchors.flatMap((anchor) => [
                  normalizedString(anchor.externalDomain),
                  normalizedDomain(anchor.externalDomain),
                ]),
              ),
            },
            factType: {
              in: ['PACKAGE_OR_SUBSCRIPTION_USED', 'HOURLY_SESSION_STARTED'],
            },
            lifecycleStatus: 'ACTIVE',
            confidence:
              mode === 'LIVE' ? 'EXACT' : { in: ['EXACT', 'INFERRED'] },
            supersededAt: null,
            happenedAt: { gte: markerFrom, lte: markerTo },
          },
          orderBy: [{ happenedAt: 'asc' }, { id: 'asc' }],
        })) as SessionCorrelationFact[];
        // SHADOW may compare a unique proximity-only inference with LIVE, but
        // an inferred tariff marker is not strong enough to unlock a case.
        // Keep this runtime guard as well as the query constraint so a mocked,
        // cached or otherwise preloaded marker cannot cross the LIVE boundary.
        const unclaimedMarkers = markers.filter(
          (marker) =>
            !claimedMarkerIds.has(marker.id) &&
            (mode !== 'LIVE' || marker.confidence === 'EXACT'),
        );
        const packageCorrelations = correlatePackageSessionFacts(
          anchors,
          unclaimedMarkers,
          correlationWindowMs,
          mode === 'LIVE',
        );
        const hourlyCorrelations = correlateHourlySessionFacts(
          anchors,
          unclaimedMarkers,
          correlationWindowMs,
          mode === 'LIVE',
        );

        for (const anchor of anchors) {
          result.checkedSessions += 1;
          const stableSessionId = sessionStableExternalId(anchor);
          if (!stableSessionId || !anchor.happenedAt) {
            result.failedSessions += 1;
            continue;
          }
          const attempts: Array<{
            sessionClass: RecoverySessionClass;
            correlation: GuestGamePackageSessionCorrelation;
            ruleIds: ReadonlySet<string>;
          }> = [];
          const anyRuleIds = ruleIdsBySessionClass.get('ANY')!;
          const scopedAnyRuleIds = recoveryRuleIdsForAnchor(
            anyRuleIds,
            anchor,
            domainOnlyRuleScopes,
          );
          if (scopedAnyRuleIds.size) {
            attempts.push({
              sessionClass: 'ANY',
              correlation: exactSessionAnchorCorrelation(anchor),
              ruleIds: scopedAnyRuleIds,
            });
          }

          const packageRuleIds = ruleIdsBySessionClass.get(
            'PACKAGE_OR_SUBSCRIPTION',
          )!;
          const scopedPackageRuleIds = recoveryRuleIdsForAnchor(
            packageRuleIds,
            anchor,
            domainOnlyRuleScopes,
          );
          const scopedHourlyRuleIds = recoveryRuleIdsForAnchor(
            ruleIdsBySessionClass.get('HOURLY')!,
            anchor,
            domainOnlyRuleScopes,
          );
          const packageCorrelation =
            packageCorrelations.get(anchor.id) ?? unmatchedCorrelation(anchor);
          const hourlyCorrelation =
            hourlyCorrelations.get(anchor.id) ?? unmatchedCorrelation(anchor);
          const classificationConflict =
            (scopedPackageRuleIds.size > 0 || scopedHourlyRuleIds.size > 0) &&
            packageCorrelation.status === 'MATCHED' &&
            hourlyCorrelation.status === 'MATCHED';

          if (classificationConflict) {
            result.ambiguousSessions += 1;
            for (const [sessionClass, ruleIds, correlation] of [
              [
                'PACKAGE_OR_SUBSCRIPTION',
                scopedPackageRuleIds,
                ambiguousCorrelation(
                  anchor,
                  [packageCorrelation.marker, hourlyCorrelation.marker].filter(
                    (value): value is SessionCorrelationFact => Boolean(value),
                  ),
                ),
              ],
              [
                'HOURLY',
                scopedHourlyRuleIds,
                ambiguousCorrelation(
                  anchor,
                  [packageCorrelation.marker, hourlyCorrelation.marker].filter(
                    (value): value is SessionCorrelationFact => Boolean(value),
                  ),
                ),
              ],
            ] as const) {
              if (!ruleIds.size) continue;
              const eventType = `SESSION_${sessionClass}_CORRELATION`;
              if (deadLetterReceiptKeys.has(`${anchor.id}:${eventType}`)) {
                continue;
              }
              const retryReceipt = retryReceiptByFactAndEventType.get(
                `${anchor.id}:${eventType}`,
              );
              if (evaluableFactIds.has(anchor.id) || retryReceipt) {
                await this.deferCorrelationReceipt({
                  user,
                  anchor,
                  stableSessionId,
                  sessionClass,
                  correlation,
                  graceMs,
                  lookbackMs,
                  result,
                  existingReceipt: retryReceipt,
                });
              }
            }
          }

          const packageReceiptKey = `${anchor.id}:SESSION_PACKAGE_OR_SUBSCRIPTION_CORRELATION`;
          if (
            scopedPackageRuleIds.size &&
            !classificationConflict &&
            !deadLetterReceiptKeys.has(packageReceiptKey)
          ) {
            if (packageCorrelation.status === 'MATCHED') {
              if (packageCorrelation.marker) {
                claimedMarkerIds.add(packageCorrelation.marker.id);
              }
              attempts.push({
                sessionClass: 'PACKAGE_OR_SUBSCRIPTION',
                correlation: packageCorrelation,
                ruleIds: scopedPackageRuleIds,
              });
            } else if (packageCorrelation.status === 'AMBIGUOUS') {
              result.ambiguousSessions += 1;
              await this.deferPendingCorrelationIfEvaluable({
                user,
                anchor,
                stableSessionId,
                sessionClass: 'PACKAGE_OR_SUBSCRIPTION',
                correlation: packageCorrelation,
                retryReceiptByFactAndEventType,
                evaluableFactIds,
                graceMs,
                lookbackMs,
                result,
              });
            } else {
              result.unmatchedSessions += 1;
              await this.deferPendingCorrelationIfEvaluable({
                user,
                anchor,
                stableSessionId,
                sessionClass: 'PACKAGE_OR_SUBSCRIPTION',
                correlation: packageCorrelation,
                retryReceiptByFactAndEventType,
                evaluableFactIds,
                graceMs,
                lookbackMs,
                result,
              });
            }
          }

          const hourlyReceiptKey = `${anchor.id}:SESSION_HOURLY_CORRELATION`;
          if (
            scopedHourlyRuleIds.size &&
            !classificationConflict &&
            !deadLetterReceiptKeys.has(hourlyReceiptKey)
          ) {
            if (hourlyCorrelation.status === 'MATCHED') {
              if (hourlyCorrelation.marker) {
                claimedMarkerIds.add(hourlyCorrelation.marker.id);
              }
              attempts.push({
                sessionClass: 'HOURLY',
                correlation: hourlyCorrelation,
                ruleIds: scopedHourlyRuleIds,
              });
            } else if (hourlyCorrelation.status === 'AMBIGUOUS') {
              result.ambiguousSessions += 1;
              await this.deferPendingCorrelationIfEvaluable({
                user,
                anchor,
                stableSessionId,
                sessionClass: 'HOURLY',
                correlation: hourlyCorrelation,
                retryReceiptByFactAndEventType,
                evaluableFactIds,
                graceMs,
                lookbackMs,
                result,
              });
            } else {
              result.unmatchedSessions += 1;
              await this.deferPendingCorrelationIfEvaluable({
                user,
                anchor,
                stableSessionId,
                sessionClass: 'HOURLY',
                correlation: hourlyCorrelation,
                retryReceiptByFactAndEventType,
                evaluableFactIds,
                graceMs,
                lookbackMs,
                result,
              });
            }
          }

          let attempted = false;
          for (const attempt of attempts) {
            const recoveryEventType = `SESSION_${attempt.sessionClass}_CORRELATION`;
            if (
              deadLetterReceiptKeys.has(`${anchor.id}:${recoveryEventType}`)
            ) {
              continue;
            }
            const retryReceipt = retryReceiptByFactAndEventType.get(
              `${anchor.id}:${recoveryEventType}`,
            );
            if (!evaluableFactIds.has(anchor.id) && !retryReceipt) continue;
            attempted = true;
            await this.processRecoveryEvaluation({
              user,
              mode,
              anchor,
              stableSessionId,
              sessionClass: attempt.sessionClass,
              correlation: attempt.correlation,
              supportedRuleIds: attempt.ruleIds,
              ruleDomainTimeZones,
              ruleExternalDomains,
              graceMs,
              lookbackMs,
              claimLeaseMs,
              maxAttempts,
              result,
              existingReceipt: retryReceipt,
            });
          }
          if (attempted) result.correlatedSessions += 1;
        }
      }
    }

    const lastDiscoveryAnchor = discoveryAnchors.at(-1);
    if (lastDiscoveryAnchor) {
      await this.prisma.guestGameOriginReceipt.upsert({
        where: {
          tenantId_originKey: {
            tenantId: user.tenantId,
            originKey: recoveryWatermarkOriginKey(mode, profileId),
          },
        },
        create: {
          tenantId: user.tenantId,
          originKey: recoveryWatermarkOriginKey(mode, profileId),
          factId: lastDiscoveryAnchor.id,
          eventType: 'SESSION_RECOVERY_WATERMARK',
          externalProvider: lastDiscoveryAnchor.externalProvider,
          externalDomain: lastDiscoveryAnchor.externalDomain,
          policy: RECOVERY_WATERMARK_POLICY,
          status: 'PROCESSED',
          ledgerFirstSeenAt: lastDiscoveryAnchor.createdAt,
          graceUntil: lastDiscoveryAnchor.createdAt,
          processedAt: new Date(),
        },
        update: {
          factId: lastDiscoveryAnchor.id,
          ledgerFirstSeenAt: lastDiscoveryAnchor.createdAt,
          processedAt: new Date(),
        },
      });
    }

    return result;
  }

  private async deferPendingCorrelationIfEvaluable(input: {
    user: AuthenticatedUser;
    anchor: SessionCorrelationFact;
    stableSessionId: string;
    sessionClass: Exclude<RecoverySessionClass, 'ANY'>;
    correlation: GuestGamePackageSessionCorrelation;
    retryReceiptByFactAndEventType: ReadonlyMap<string, RecoveryReceipt>;
    evaluableFactIds: ReadonlySet<string>;
    graceMs: number;
    lookbackMs: number;
    result: GuestGameLootBoxSessionRecoveryTenantResult;
  }) {
    const recoveryEventType = `SESSION_${input.sessionClass}_CORRELATION`;
    const existingReceipt = input.retryReceiptByFactAndEventType.get(
      `${input.anchor.id}:${recoveryEventType}`,
    );
    if (!input.evaluableFactIds.has(input.anchor.id) && !existingReceipt) {
      return;
    }
    await this.deferCorrelationReceipt({
      user: input.user,
      anchor: input.anchor,
      stableSessionId: input.stableSessionId,
      sessionClass: input.sessionClass,
      correlation: input.correlation,
      graceMs: input.graceMs,
      lookbackMs: input.lookbackMs,
      result: input.result,
      existingReceipt,
    });
  }

  private async deferCorrelationReceipt(input: {
    user: AuthenticatedUser;
    anchor: SessionCorrelationFact;
    stableSessionId: string;
    sessionClass: Exclude<RecoverySessionClass, 'ANY'>;
    correlation: GuestGamePackageSessionCorrelation;
    graceMs: number;
    lookbackMs: number;
    result: GuestGameLootBoxSessionRecoveryTenantResult;
    existingReceipt?: RecoveryReceipt;
  }) {
    const now = new Date();
    const recoveryEventType = `SESSION_${input.sessionClass}_CORRELATION`;
    const recoveryOriginKey = buildGuestGameOriginKey({
      externalProvider: input.anchor.externalProvider,
      externalDomain: input.anchor.externalDomain,
      eventType: recoveryEventType,
      stableExternalId: input.stableSessionId,
    });
    if (!recoveryOriginKey) {
      input.result.failedSessions += 1;
      return;
    }
    const expiresAt = new Date(
      (input.anchor.happenedAt ?? input.anchor.createdAt).getTime() +
        input.lookbackMs,
    );
    const expired = expiresAt <= now;
    const status = expired ? 'DEAD_LETTER' : 'WAITING_CORRELATION';
    const reason =
      input.correlation.status === 'AMBIGUOUS'
        ? `Typed session classification remains ambiguous (${input.correlation.candidateIds.length} candidates).`
        : 'Typed session marker has not arrived yet.';

    if (input.existingReceipt) {
      const updated = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: input.existingReceipt.id,
          policy: RECOVERY_POLICY,
          status: 'WAITING_CORRELATION',
          attempts: input.existingReceipt.attempts,
        },
        data: {
          status,
          // Correlation wait cycles are not processing failures. Reset legacy
          // counters so a late exact marker still receives a full claim budget.
          attempts: 0,
          graceUntil: new Date(now.getTime() + input.graceMs),
          claimExpiresAt: null,
          ...(expired ? { processedAt: now } : {}),
          lastError: reason,
        },
      });
      if (updated.count !== 1) {
        input.result.duplicateSessions += 1;
      } else if (expired) {
        input.result.deadLetterSessions += 1;
        input.result.failedSessions += 1;
      }
      return;
    }

    await this.prisma.guestGameOriginReceipt.upsert({
      where: {
        tenantId_originKey: {
          tenantId: input.user.tenantId,
          originKey: recoveryOriginKey,
        },
      },
      create: {
        tenantId: input.user.tenantId,
        originKey: recoveryOriginKey,
        factId: input.anchor.id,
        eventType: recoveryEventType,
        externalProvider: input.anchor.externalProvider,
        externalDomain: input.anchor.externalDomain,
        policy: RECOVERY_POLICY,
        status,
        attempts: 0,
        ledgerFirstSeenAt: input.anchor.createdAt,
        graceUntil: new Date(now.getTime() + input.graceMs),
        claimExpiresAt: null,
        ...(expired ? { processedAt: now } : {}),
        lastError: reason,
      },
      update: {},
    });
    if (expired) {
      input.result.deadLetterSessions += 1;
      input.result.failedSessions += 1;
    }
  }

  private async processRecoveryEvaluation(input: {
    user: AuthenticatedUser;
    mode: Exclude<GuestGameLootBoxSessionRecoveryMode, 'OFF'>;
    anchor: SessionCorrelationFact;
    stableSessionId: string;
    sessionClass: RecoverySessionClass;
    correlation: GuestGamePackageSessionCorrelation;
    supportedRuleIds: ReadonlySet<string>;
    ruleDomainTimeZones: ReadonlyMap<
      string,
      ReadonlyMap<string, string | null>
    >;
    ruleExternalDomains: ReadonlyMap<string, readonly string[]>;
    graceMs: number;
    lookbackMs: number;
    claimLeaseMs: number;
    maxAttempts: number;
    result: GuestGameLootBoxSessionRecoveryTenantResult;
    existingReceipt?: RecoveryReceipt;
  }): Promise<boolean> {
    const {
      user,
      mode,
      anchor,
      stableSessionId,
      sessionClass,
      correlation,
      supportedRuleIds,
      ruleDomainTimeZones,
      ruleExternalDomains,
      graceMs,
      lookbackMs,
      claimLeaseMs,
      maxAttempts,
      result,
      existingReceipt,
    } = input;
    const originKey = buildGuestGameOriginKey({
      externalProvider: anchor.externalProvider,
      externalDomain: anchor.externalDomain,
      eventType: 'SESSION_START',
      stableExternalId: stableSessionId,
    });
    const recoveryEventType = `SESSION_${sessionClass}_CORRELATION`;
    const recoveryOriginKey = buildGuestGameOriginKey({
      externalProvider: anchor.externalProvider,
      externalDomain: anchor.externalDomain,
      eventType: recoveryEventType,
      stableExternalId: stableSessionId,
    });
    if (!originKey || !recoveryOriginKey) {
      result.failedSessions += 1;
      return true;
    }

    const firstSeenAt = new Date();
    const receipt =
      existingReceipt ??
      (await this.prisma.guestGameOriginReceipt.upsert({
        where: {
          tenantId_originKey: {
            tenantId: user.tenantId,
            originKey: recoveryOriginKey,
          },
        },
        create: {
          tenantId: user.tenantId,
          originKey: recoveryOriginKey,
          factId: anchor.id,
          eventType: recoveryEventType,
          externalProvider: anchor.externalProvider,
          externalDomain: anchor.externalDomain,
          policy: RECOVERY_POLICY,
          status: 'WAITING_LIVE',
          ledgerFirstSeenAt: firstSeenAt,
          graceUntil: new Date(firstSeenAt.getTime() + graceMs),
        },
        update: {},
      }));
    if (receipt.factId && receipt.factId !== anchor.id) {
      result.duplicateSessions += 1;
      return false;
    }
    if (recoveryReceiptIsTerminal(mode, receipt, firstSeenAt)) {
      result.duplicateSessions += 1;
      return false;
    }
    if (mode === 'LIVE' && receipt.graceUntil > firstSeenAt) {
      result.deferredSessions += 1;
      return false;
    }
    const processingAttempts =
      receipt.status === 'WAITING_CORRELATION' ? 0 : receipt.attempts;
    if (
      receipt.status === 'WAITING_CORRELATION' &&
      (anchor.happenedAt ?? anchor.createdAt).getTime() + lookbackMs <=
        firstSeenAt.getTime()
    ) {
      const deadLettered = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          policy: RECOVERY_POLICY,
          status: 'WAITING_CORRELATION',
          attempts: receipt.attempts,
        },
        data: {
          status: 'DEAD_LETTER',
          attempts: 0,
          claimExpiresAt: null,
          processedAt: firstSeenAt,
          lastError:
            'Typed session correlation expired before an exact marker arrived.',
        },
      });
      if (deadLettered.count > 0) {
        result.deadLetterSessions += 1;
        result.failedSessions += 1;
      } else {
        result.duplicateSessions += 1;
      }
      return false;
    }
    if (processingAttempts >= maxAttempts) {
      const deadLettered = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          policy: RECOVERY_POLICY,
          attempts: { gte: maxAttempts },
        },
        data: {
          status: 'DEAD_LETTER',
          claimExpiresAt: null,
          processedAt: new Date(),
          lastError:
            'Loot-box session recovery exhausted the maximum number of attempts.',
        },
      });
      if (deadLettered.count > 0) {
        result.deadLetterSessions += 1;
        result.failedSessions += 1;
      }
      return false;
    }

    const claimStartedAt = new Date();
    const claimAttempt = processingAttempts + 1;
    const claimedSource =
      mode === 'SHADOW'
        ? 'LEDGER_LOOT_BOX_RECOVERY_SHADOW'
        : 'LEDGER_LOOT_BOX_RECOVERY';
    const claim = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: receipt.id,
        ...(mode === 'LIVE' ? { graceUntil: { lte: claimStartedAt } } : {}),
        policy: RECOVERY_POLICY,
        attempts:
          receipt.status === 'WAITING_CORRELATION'
            ? { equals: receipt.attempts }
            : { equals: receipt.attempts, lt: maxAttempts },
        OR: [
          {
            status: {
              in:
                mode === 'LIVE'
                  ? [
                      'WAITING_LIVE',
                      'WAITING_CORRELATION',
                      'FAILED',
                      'SHADOWED',
                    ]
                  : ['WAITING_LIVE', 'WAITING_CORRELATION', 'FAILED'],
            },
          },
          {
            status: 'PROCESSING',
            OR: [
              { claimExpiresAt: { lte: claimStartedAt } },
              { claimExpiresAt: null },
            ],
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        claimedSource,
        attempts: claimAttempt,
        claimExpiresAt: new Date(claimStartedAt.getTime() + claimLeaseMs),
        lastError: null,
      },
    });
    if (claim.count !== 1) {
      result.duplicateSessions += 1;
      return false;
    }

    const processDto = sessionRecoveryProcessDto(
      anchor,
      stableSessionId,
      sessionClass,
    );
    let dryRun: GuestGameDryRunResult;
    try {
      dryRun = routeLootBoxSessionRecoveryDryRun(
        await this.gamification.dryRun(user, processDto, {
          ruleDomainTimeZones,
          ruleExternalDomains,
        }),
        supportedRuleIds,
      );
    } catch (error) {
      await this.failClaimedReceipt(
        receipt.id,
        claimAttempt,
        claimedSource,
        maxAttempts,
        error,
        result,
      );
      return true;
    }
    if (!dryRun.rules.length) {
      await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          status: 'PROCESSING',
          attempts: claimAttempt,
          claimedSource,
        },
        data: {
          status: mode === 'SHADOW' ? 'SHADOWED' : 'PROCESSED',
          ...(mode === 'SHADOW' ? { attempts: 0 } : {}),
          claimExpiresAt: null,
          processedAt: new Date(),
        },
      });
      return true;
    }

    const evidence = recoveryEvidence(
      correlation,
      stableSessionId,
      sessionClass,
    );
    const sourceFactKind = `LEDGER_SESSION_${sessionClass}_CORRELATION`;
    if (mode === 'SHADOW') {
      try {
        await this.gamification.recordRuleDecisions(user, dryRun, {
          originKey,
          sourceFactId: anchor.id,
          sourceFactKind,
          evaluationMode: 'SHADOW_LOOT_BOX_RECOVERY',
          evaluatorVersion: 'loot-box-session-recovery-v1',
          evaluationRunId: recoveryEvaluationRunId(receipt.id, mode),
          replaceExistingRun: true,
          evidence,
          suppressLedgerShadow: true,
        });
      } catch (error) {
        await this.failClaimedReceipt(
          receipt.id,
          claimAttempt,
          claimedSource,
          maxAttempts,
          error,
          result,
        );
        return true;
      }
      const shadowFinalized =
        await this.prisma.guestGameOriginReceipt.updateMany({
          where: {
            id: receipt.id,
            status: 'PROCESSING',
            attempts: claimAttempt,
            claimedSource,
          },
          data: {
            status: 'SHADOWED',
            claimedSource: 'LEDGER_LOOT_BOX_RECOVERY_SHADOW',
            attempts: 0,
            claimExpiresAt: null,
            processedAt: new Date(),
          },
        });
      if (shadowFinalized.count !== 1) {
        result.duplicateSessions += 1;
        return false;
      }
      result.shadowSessions += 1;
      result.matchedRules += dryRun.rules.filter(
        (rule) => rule.eligible,
      ).length;
      return true;
    }

    try {
      const decisionResult = await this.gamification.recordRuleDecisions(
        user,
        dryRun,
        {
          originKey,
          sourceFactId: anchor.id,
          sourceFactKind,
          evaluationMode: 'LIVE_LOOT_BOX_RECOVERY',
          evaluatorVersion: 'loot-box-session-recovery-v1',
          evaluationRunId: recoveryEvaluationRunId(receipt.id, mode),
          replaceExistingRun: true,
          evidence,
          suppressLedgerShadow: true,
        },
      );
      const eligibleRuleIds = dryRun.rules
        .filter((rule) => rule.eligible)
        .map((rule) => rule.id);
      const legitimateLimitSkips = new Set(
        (decisionResult?.lootBoxEntitlements ?? [])
          .filter(
            (outcome) =>
              outcome.status === 'LIMIT_EXHAUSTED' ||
              outcome.status === 'RULE_INACTIVE',
          )
          .map((outcome) => outcome.ruleId),
      );
      const persistenceFailures = (
        decisionResult?.lootBoxEntitlements ?? []
      ).filter((outcome) => outcome.status === 'PERSISTENCE_FAILED');
      if (persistenceFailures.length) {
        throw new Error(
          `Loot-box entitlement persistence failed for ${persistenceFailures.length} rule(s).`,
        );
      }
      const entitlementRuleIds = eligibleRuleIds.filter(
        (ruleId) => !legitimateLimitSkips.has(ruleId),
      );
      if (entitlementRuleIds.length) {
        if (!dryRun.profile?.id) {
          throw new Error(
            'Loot-box entitlement persistence cannot be verified without a resolved guest profile.',
          );
        }
        const entitlements = await this.prisma.guestGameEntitlement.findMany({
          where: {
            tenantId: user.tenantId,
            profileId: dryRun.profile.id,
            ruleType: 'LOOT_BOX',
            ruleId: { in: entitlementRuleIds },
            originKey,
            status: { in: ['AVAILABLE', 'CONSUMED', 'CANCELED'] },
          },
          select: { ruleId: true, status: true, evidence: true },
        });
        const persistedLimitSkips = new Set(
          entitlements
            .filter(
              (entitlement) =>
                entitlement.status === 'CANCELED' &&
                recoveryCanceledEntitlementIsTerminal(entitlement.evidence),
            )
            .map((entitlement) => entitlement.ruleId),
        );
        const persistedRuleIds = new Set(
          entitlements
            .filter(
              (entitlement) =>
                entitlement.status === 'AVAILABLE' ||
                entitlement.status === 'CONSUMED',
            )
            .map((entitlement) => entitlement.ruleId),
        );
        const missingRuleIds = entitlementRuleIds.filter(
          (ruleId) =>
            !persistedRuleIds.has(ruleId) && !persistedLimitSkips.has(ruleId),
        );
        if (missingRuleIds.length) {
          throw new Error(
            `Loot-box entitlement persistence was not confirmed for ${missingRuleIds.length} rule(s).`,
          );
        }
      }
      const finalized = await this.prisma.guestGameOriginReceipt.updateMany({
        where: {
          id: receipt.id,
          status: 'PROCESSING',
          attempts: claimAttempt,
          claimedSource,
        },
        data: {
          status: 'PROCESSED',
          claimExpiresAt: null,
          processedAt: new Date(),
        },
      });
      if (finalized.count !== 1) {
        result.duplicateSessions += 1;
        return false;
      }
      result.recoveredSessions += 1;
      result.matchedRules += dryRun.rules.filter(
        (rule) => rule.eligible,
      ).length;
    } catch (error) {
      return this.failClaimedReceipt(
        receipt.id,
        claimAttempt,
        claimedSource,
        maxAttempts,
        error,
        result,
      );
    }
    return true;
  }

  private async failClaimedReceipt(
    receiptId: string,
    claimAttempt: number,
    claimedSource: string,
    maxAttempts: number,
    error: unknown,
    result: GuestGameLootBoxSessionRecoveryTenantResult,
  ) {
    const deadLetter = claimAttempt >= maxAttempts;
    const failed = await this.prisma.guestGameOriginReceipt.updateMany({
      where: {
        id: receiptId,
        status: 'PROCESSING',
        attempts: claimAttempt,
        claimedSource,
      },
      data: {
        status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
        claimExpiresAt: null,
        ...(deadLetter ? { processedAt: new Date() } : {}),
        lastError: safeErrorMessage(error).slice(0, 500),
      },
    });
    if (failed.count > 0) {
      result.failedSessions += 1;
      if (deadLetter) result.deadLetterSessions += 1;
    } else {
      result.duplicateSessions += 1;
    }
    return failed.count > 0;
  }
}

export function correlatePackageSessionFact(
  anchor: SessionCorrelationFact,
  markers: readonly SessionCorrelationFact[],
  windowMs = 60_000,
  requireStableIdentity = false,
): GuestGamePackageSessionCorrelation {
  return (
    correlatePackageSessionFacts(
      [anchor],
      markers,
      windowMs,
      requireStableIdentity,
    ).get(anchor.id) ?? unmatchedCorrelation(anchor)
  );
}

export function correlatePackageSessionFacts(
  anchors: readonly SessionCorrelationFact[],
  markers: readonly SessionCorrelationFact[],
  windowMs = 60_000,
  requireStableIdentity = false,
): ReadonlyMap<string, GuestGamePackageSessionCorrelation> {
  return correlateTypedSessionMarkers(
    anchors,
    markers,
    'PACKAGE_OR_SUBSCRIPTION_USED',
    new Set(['EXACT', 'INFERRED']),
    windowMs,
    requireStableIdentity,
  );
}

export function correlateHourlySessionFact(
  anchor: SessionCorrelationFact,
  markers: readonly SessionCorrelationFact[],
  windowMs = 60_000,
  requireStableIdentity = false,
): GuestGamePackageSessionCorrelation {
  return (
    correlateHourlySessionFacts(
      [anchor],
      markers,
      windowMs,
      requireStableIdentity,
    ).get(anchor.id) ?? unmatchedCorrelation(anchor)
  );
}

export function correlateHourlySessionFacts(
  anchors: readonly SessionCorrelationFact[],
  markers: readonly SessionCorrelationFact[],
  windowMs = 60_000,
  requireStableIdentity = false,
): ReadonlyMap<string, GuestGamePackageSessionCorrelation> {
  return correlateTypedSessionMarkers(
    anchors,
    markers,
    'HOURLY_SESSION_STARTED',
    new Set(['EXACT', 'INFERRED']),
    windowMs,
    requireStableIdentity,
  );
}

function exactSessionAnchorCorrelation(
  anchor: SessionCorrelationFact,
): GuestGamePackageSessionCorrelation {
  const valid =
    anchor.factType === 'SESSION_STARTED' &&
    anchor.confidence === 'EXACT' &&
    anchor.lifecycleStatus === 'ACTIVE' &&
    !anchor.supersededAt &&
    Boolean(
      anchor.profileId &&
      anchor.guestId &&
      anchor.happenedAt &&
      normalizedDomain(anchor.externalDomain),
    );
  return {
    status: valid ? 'MATCHED' : 'UNMATCHED',
    anchor,
    marker: null,
    candidateIds: [],
    deltaMs: valid ? 0 : null,
  };
}

function correlateTypedSessionMarkers(
  anchors: readonly SessionCorrelationFact[],
  markers: readonly SessionCorrelationFact[],
  markerFactType: string,
  allowedConfidences: ReadonlySet<string>,
  windowMs: number,
  requireStableIdentity: boolean,
): ReadonlyMap<string, GuestGamePackageSessionCorrelation> {
  const results = new Map<string, GuestGamePackageSessionCorrelation>();
  const validAnchors = anchors.filter((anchor) => {
    const valid = exactSessionAnchorCorrelation(anchor).status === 'MATCHED';
    if (!valid) results.set(anchor.id, unmatchedCorrelation(anchor));
    return valid;
  });
  const validMarkers = markers.filter(
    (marker) =>
      marker.factType === markerFactType &&
      allowedConfidences.has(marker.confidence) &&
      marker.lifecycleStatus === 'ACTIVE' &&
      !marker.supersededAt &&
      Number.isFinite(marker.happenedAt?.getTime()),
  );
  const candidatesByAnchor = new Map<string, SessionCorrelationFact[]>();
  for (const anchor of validAnchors) {
    candidatesByAnchor.set(
      anchor.id,
      validMarkers.filter((marker) =>
        scopedSessionMarkerMatches(anchor, marker, windowMs),
      ),
    );
  }

  const assignedAnchorIds = new Set<string>();
  const assignedMarkerIds = new Set<string>();
  const reservedExactMarkerIds = new Set<string>();
  const exactCandidatesByAnchor = new Map<string, SessionCorrelationFact[]>();
  for (const anchor of validAnchors) {
    const exactCandidates = (candidatesByAnchor.get(anchor.id) ?? []).filter(
      (marker) =>
        marker.confidence === 'EXACT' &&
        exactSessionIdentityMatches(anchor, marker),
    );
    exactCandidatesByAnchor.set(anchor.id, exactCandidates);
    for (const marker of exactCandidates) reservedExactMarkerIds.add(marker.id);
  }
  const exactAnchorIdsByMarker = invertMarkerCandidates(
    validAnchors,
    exactCandidatesByAnchor,
  );

  // A structured EXACT marker with the same stable session/source identity is
  // authoritative. It wins over every proximity-only candidate.
  for (const anchor of validAnchors) {
    const exactCandidates = exactCandidatesByAnchor.get(anchor.id) ?? [];
    if (exactCandidates.length === 1) {
      const marker = exactCandidates[0];
      if ((exactAnchorIdsByMarker.get(marker.id) ?? []).length === 1) {
        results.set(anchor.id, matchedCorrelation(anchor, marker));
        assignedAnchorIds.add(anchor.id);
        assignedMarkerIds.add(marker.id);
        continue;
      }
    }
    if (exactCandidates.length > 0) {
      results.set(anchor.id, ambiguousCorrelation(anchor, exactCandidates));
      assignedAnchorIds.add(anchor.id);
    }
  }

  const fallbackAnchors = validAnchors.filter(
    (anchor) => !assignedAnchorIds.has(anchor.id),
  );
  const fallbackCandidatesByAnchor = new Map<
    string,
    SessionCorrelationFact[]
  >();
  for (const anchor of fallbackAnchors) {
    fallbackCandidatesByAnchor.set(
      anchor.id,
      requireStableIdentity
        ? []
        : (candidatesByAnchor.get(anchor.id) ?? []).filter(
            (marker) =>
              !assignedMarkerIds.has(marker.id) &&
              !reservedExactMarkerIds.has(marker.id),
          ),
    );
  }
  const fallbackAnchorIdsByMarker = invertMarkerCandidates(
    fallbackAnchors,
    fallbackCandidatesByAnchor,
  );

  // INFERRED markers (and EXACT markers without an identity) are accepted only
  // when both sides are unique inside the correlation window. This makes the
  // fallback one-to-one and prevents one log line unlocking two sessions.
  for (const anchor of fallbackAnchors) {
    const candidates = fallbackCandidatesByAnchor.get(anchor.id) ?? [];
    if (
      candidates.length === 1 &&
      (fallbackAnchorIdsByMarker.get(candidates[0].id) ?? []).length === 1
    ) {
      results.set(anchor.id, matchedCorrelation(anchor, candidates[0]));
    } else if (candidates.length > 0) {
      results.set(anchor.id, ambiguousCorrelation(anchor, candidates));
    } else {
      results.set(anchor.id, unmatchedCorrelation(anchor));
    }
  }
  return results;
}

function scopedSessionMarkerMatches(
  anchor: SessionCorrelationFact,
  marker: SessionCorrelationFact,
  windowMs: number,
) {
  const anchorAt = anchor.happenedAt?.getTime();
  const markerAt = marker.happenedAt?.getTime();
  return Boolean(
    anchor.profileId &&
    anchor.guestId &&
    normalizedDomain(anchor.externalDomain) &&
    anchorAt !== undefined &&
    Number.isFinite(anchorAt) &&
    marker.profileId === anchor.profileId &&
    marker.guestId === anchor.guestId &&
    (!anchor.storeId || marker.storeId === anchor.storeId) &&
    normalizedDomain(marker.externalDomain) ===
      normalizedDomain(anchor.externalDomain) &&
    marker.externalGuestId === anchor.externalGuestId &&
    markerAt !== undefined &&
    Number.isFinite(markerAt) &&
    Math.abs(markerAt - anchorAt) <= windowMs,
  );
}

function exactSessionIdentityMatches(
  anchor: SessionCorrelationFact,
  marker: SessionCorrelationFact,
) {
  const anchorIdentities = new Set(sessionIdentityValues(anchor));
  return sessionIdentityValues(marker).some((value) =>
    anchorIdentities.has(value),
  );
}

function sessionIdentityValues(fact: SessionCorrelationFact) {
  return [fact.sessionExternalId, fact.sourceExternalId]
    .map(normalizedString)
    .filter((value): value is string => Boolean(value));
}

function invertMarkerCandidates(
  anchors: readonly SessionCorrelationFact[],
  candidatesByAnchor: ReadonlyMap<string, readonly SessionCorrelationFact[]>,
) {
  const anchorIdsByMarker = new Map<string, string[]>();
  for (const anchor of anchors) {
    for (const marker of candidatesByAnchor.get(anchor.id) ?? []) {
      const anchorIds = anchorIdsByMarker.get(marker.id) ?? [];
      anchorIds.push(anchor.id);
      anchorIdsByMarker.set(marker.id, anchorIds);
    }
  }
  return anchorIdsByMarker;
}

function matchedCorrelation(
  anchor: SessionCorrelationFact,
  marker: SessionCorrelationFact,
): GuestGamePackageSessionCorrelation {
  return {
    status: 'MATCHED',
    anchor,
    marker,
    candidateIds: [marker.id],
    deltaMs: marker.happenedAt!.getTime() - anchor.happenedAt!.getTime(),
  };
}

function ambiguousCorrelation(
  anchor: SessionCorrelationFact,
  candidates: readonly SessionCorrelationFact[],
): GuestGamePackageSessionCorrelation {
  return {
    status: 'AMBIGUOUS',
    anchor,
    marker: null,
    candidateIds: candidates.map((candidate) => candidate.id).sort(),
    deltaMs: null,
  };
}

function unmatchedCorrelation(
  anchor: SessionCorrelationFact,
): GuestGamePackageSessionCorrelation {
  return {
    status: 'UNMATCHED',
    anchor,
    marker: null,
    candidateIds: [],
    deltaMs: null,
  };
}

function sessionRecoveryProcessDto(
  fact: SessionCorrelationFact,
  stableSessionId: string,
  sessionClass: RecoverySessionClass,
): GuestGameProcessEventDto {
  const sessionType = sessionClass === 'ANY' ? null : sessionClass;
  return {
    profileId: fact.profileId,
    guestId: fact.guestId,
    storeId: fact.storeId,
    externalProvider: fact.externalProvider,
    externalDomain: fact.externalDomain,
    externalId: stableSessionId,
    occurredAt: fact.happenedAt?.toISOString() ?? null,
    limitOccurredAt: fact.happenedAt?.toISOString() ?? null,
    eventType: 'SESSION_START',
    sessionType,
    sessionPacket:
      sessionClass === 'ANY'
        ? null
        : sessionClass === 'PACKAGE_OR_SUBSCRIPTION',
    sourceFactId: fact.id,
    sourceFactKind: `LEDGER_SESSION_${sessionClass}_CORRELATION`,
  };
}

export function routeLootBoxSessionRecoveryDryRun(
  dryRun: GuestGameDryRunResult,
  supportedRuleIds: ReadonlySet<string>,
): GuestGameDryRunResult {
  const rules = dryRun.rules.filter(
    (rule) =>
      rule.kind === 'LOOT_BOX' &&
      rule.status === 'ACTIVE' &&
      supportedRuleIds.has(rule.id) &&
      guestGameTriggerMatches(rule.triggerKind, 'SESSION_START'),
  );
  const eligibleRules = rules.filter((rule) => rule.eligible);
  return {
    ...dryRun,
    rules,
    summary: {
      checkedRules: rules.length,
      eligibleRules: eligibleRules.length,
      blockedRules: rules.length - eligibleRules.length,
      estimatedRewardAmount: eligibleRules.reduce(
        (sum, rule) => sum + (rule.rewardAmount ?? 0),
        0,
      ),
      projectedXpDelta: 0,
    },
  };
}

function recoveryEvidence(
  correlation: GuestGamePackageSessionCorrelation,
  stableSessionId: string,
  sessionClass: RecoverySessionClass,
): Prisma.InputJsonObject {
  return {
    source: 'guest_activity_fact_correlation',
    correlationStatus: correlation.status,
    anchorFactId: correlation.anchor.id,
    markerFactId: correlation.marker?.id ?? null,
    anchorFactType: correlation.anchor.factType,
    markerFactType: correlation.marker?.factType ?? null,
    anchorConfidence: correlation.anchor.confidence,
    markerConfidence: correlation.marker?.confidence ?? null,
    anchorHappenedAt: correlation.anchor.happenedAt?.toISOString() ?? null,
    markerHappenedAt: correlation.marker?.happenedAt?.toISOString() ?? null,
    deltaMs: correlation.deltaMs,
    storeId: correlation.anchor.storeId,
    externalDomain: normalizedDomain(correlation.anchor.externalDomain),
    sessionExternalId: stableSessionId,
    sessionClass,
    entitlementOnly: true,
  };
}

function recoveryRuleSessionClass(value: unknown): RecoverySessionClass | null {
  const normalized = normalizedString(value)?.toUpperCase() ?? '';
  if (!normalized || normalized === 'ANY') return 'ANY';
  if (['HOURLY', 'REGULAR_SESSION'].includes(normalized)) return 'HOURLY';
  if (
    [
      'PACKAGE_OR_SUBSCRIPTION',
      'PACKAGE',
      'SUBSCRIPTION',
      'PACKET_HOURS',
    ].includes(normalized)
  ) {
    return 'PACKAGE_OR_SUBSCRIPTION';
  }
  return null;
}

function recoveryRuleExternalDomains(
  rules: Array<{ id: string; storeIds: Prisma.JsonValue }>,
  stores: Array<{ id: string; externalDomain: string | null }>,
) {
  const domainByStoreId = new Map(
    stores.flatMap((store) => {
      const domain = normalizedDomain(store.externalDomain);
      return domain ? [[store.id, domain] as const] : [];
    }),
  );
  return new Map(
    rules.map((rule) => [
      rule.id,
      uniqueStrings(
        jsonStringArray(rule.storeIds).map((id) => domainByStoreId.get(id)),
      ),
    ]),
  );
}

function recoveryDomainOnlyRuleScopes(
  rules: RecoveryRuleScope[],
  stores: Array<{
    id: string;
    externalDomain: string | null;
    timeZone: string | null;
  }>,
) {
  const storesByDomain = new Map<string, typeof stores>();
  for (const store of stores) {
    const domain = normalizedDomain(store.externalDomain);
    if (!domain) continue;
    const current = storesByDomain.get(domain) ?? [];
    current.push(store);
    storesByDomain.set(domain, current);
  }

  return new Map(
    rules.map((rule) => {
      const selectedStoreIds = new Set(jsonStringArray(rule.storeIds));
      const allowedDomains = new Set<string>();
      for (const [domain, domainStores] of storesByDomain) {
        const coversEntireDomain =
          selectedStoreIds.size === 0 ||
          domainStores.every((store) => selectedStoreIds.has(store.id));
        const timeZones = new Set(
          domainStores
            .map((store) => normalizedString(store.timeZone))
            .filter((value): value is string => Boolean(value)),
        );
        const timeZoneIsUnambiguous =
          domainStores.length > 0 &&
          domainStores.every((store) => normalizedString(store.timeZone)) &&
          timeZones.size === 1;
        if (coversEntireDomain && timeZoneIsUnambiguous) {
          allowedDomains.add(domain);
        }
      }
      return [rule.id, allowedDomains] as const;
    }),
  );
}

function recoveryRuleIdsForAnchor(
  ruleIds: ReadonlySet<string>,
  anchor: SessionCorrelationFact,
  domainOnlyRuleScopes: ReadonlyMap<string, ReadonlySet<string>>,
) {
  if (anchor.storeId) return new Set(ruleIds);
  const domain = normalizedDomain(anchor.externalDomain);
  if (!domain) return new Set<string>();
  return new Set(
    [...ruleIds].filter((ruleId) =>
      domainOnlyRuleScopes.get(ruleId)?.has(domain),
    ),
  );
}

function recoveryRuleDomainTimeZones(
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
      const scoped = selectedStoreIds.size
        ? stores.filter((store) => selectedStoreIds.has(store.id))
        : stores;
      const domains = new Map<string, typeof scoped>();
      for (const store of scoped) {
        const domain = normalizedDomain(store.externalDomain);
        if (!domain) continue;
        const current = domains.get(domain) ?? [];
        current.push(store);
        domains.set(domain, current);
      }
      return [
        rule.id,
        new Map(
          [...domains.entries()].map(([domain, domainStores]) => {
            const timeZones = new Set(
              domainStores
                .map((store) => normalizedString(store.timeZone))
                .filter((value): value is string => Boolean(value)),
            );
            return [
              domain,
              domainStores.every((store) => normalizedString(store.timeZone)) &&
              timeZones.size === 1
                ? [...timeZones][0]
                : null,
            ] as const;
          }),
        ),
      ] as const;
    }),
  );
}

function recoveryReceiptIsTerminal(
  mode: Exclude<GuestGameLootBoxSessionRecoveryMode, 'OFF'>,
  receipt: {
    status: string;
    policy: string;
    claimedSource: string | null;
    claimExpiresAt: Date | null;
  },
  now: Date,
) {
  if (receipt.policy !== 'LOOT_BOX_SESSION_RECOVERY') return true;
  if (mode === 'SHADOW') {
    if (['SHADOWED', 'PROCESSED', 'DEAD_LETTER'].includes(receipt.status)) {
      return true;
    }
    return (
      receipt.status === 'PROCESSING' &&
      Boolean(receipt.claimExpiresAt && receipt.claimExpiresAt > now)
    );
  }
  if (['PROCESSED', 'DEAD_LETTER'].includes(receipt.status)) return true;
  return (
    receipt.status === 'PROCESSING' &&
    Boolean(receipt.claimExpiresAt && receipt.claimExpiresAt > now)
  );
}

function recoveryCanceledEntitlementIsTerminal(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const issuanceOutcome = normalizedString(
    value.issuanceOutcome,
  )?.toUpperCase();
  return (
    issuanceOutcome === 'LIMIT_EXHAUSTED' || issuanceOutcome === 'RULE_INACTIVE'
  );
}

function sessionStableExternalId(fact: SessionCorrelationFact) {
  return (
    normalizedString(fact.sessionExternalId) ??
    normalizedString(fact.sourceExternalId)
  );
}

function normalizedDomain(value: unknown) {
  const normalized = normalizedString(value)?.toLowerCase();
  if (!normalized) return null;
  try {
    return new URL(
      normalized.includes('://') ? normalized : `https://${normalized}`,
    ).hostname.replace(/\.$/, '');
  } catch {
    return normalized.replace(/^https?:\/\//, '').split(/[/?#]/, 1)[0];
  }
}

function recoveryMode(value: unknown): GuestGameLootBoxSessionRecoveryMode {
  const mode = normalizedString(value)?.toUpperCase();
  return mode === 'LIVE' || mode === 'SHADOW' ? mode : 'OFF';
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

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value).trim() || null;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(normalizedString)
        .filter((item): item is string => Boolean(item))
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((item): item is string => Boolean(item)))];
}

function uniqueFacts(facts: SessionCorrelationFact[]) {
  return [...new Map(facts.map((fact) => [fact.id, fact])).values()].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}

function recoveryEvaluationRunId(
  receiptId: string,
  mode: Exclude<GuestGameLootBoxSessionRecoveryMode, 'OFF'>,
) {
  return `loot-box-session-recovery:${receiptId}:${mode.toLowerCase()}`;
}

function recoveryWatermarkOriginKey(
  mode: Exclude<GuestGameLootBoxSessionRecoveryMode, 'OFF'>,
  profileId: string | null,
) {
  return `${RECOVERY_WATERMARK_ORIGIN_PREFIX}:${mode.toLowerCase()}:${profileId ?? 'all'}`;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function emptyTenantResult(
  tenantId: string,
  tenantSlug: string,
  status: GuestGameLootBoxSessionRecoveryTenantResult['status'],
  reason: string | null,
): GuestGameLootBoxSessionRecoveryTenantResult {
  return {
    tenantId,
    tenantSlug,
    status,
    reason,
    checkedSessions: 0,
    unmatchedSessions: 0,
    ambiguousSessions: 0,
    correlatedSessions: 0,
    deferredSessions: 0,
    shadowSessions: 0,
    recoveredSessions: 0,
    duplicateSessions: 0,
    failedSessions: 0,
    deadLetterSessions: 0,
    matchedRules: 0,
  };
}

function summarize(
  mode: GuestGameLootBoxSessionRecoveryMode,
  tenants: GuestGameLootBoxSessionRecoveryTenantResult[],
): GuestGameLootBoxSessionRecoveryRunResult {
  const total = (key: keyof GuestGameLootBoxSessionRecoveryTenantResult) =>
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
    checkedSessions: total('checkedSessions'),
    unmatchedSessions: total('unmatchedSessions'),
    ambiguousSessions: total('ambiguousSessions'),
    correlatedSessions: total('correlatedSessions'),
    deferredSessions: total('deferredSessions'),
    shadowSessions: total('shadowSessions'),
    recoveredSessions: total('recoveredSessions'),
    duplicateSessions: total('duplicateSessions'),
    failedSessions: total('failedSessions'),
    deadLetterSessions: total('deadLetterSessions'),
    matchedRules: total('matchedRules'),
    tenants,
  };
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Loot-box session recovery failed.';
}
