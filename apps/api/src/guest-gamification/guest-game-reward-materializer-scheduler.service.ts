import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantLifecycleStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  type GuestGameEffectMaterializeResult,
  GuestGamificationService,
} from './guest-gamification.service';
import {
  guestGameRewardMaterializerClaimsAllowed,
  resolveGuestGameRewardMaterializerPolicy,
} from './guest-game-reward-materializer-policy';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_CLAIM_LEASE_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 5;

export type GuestGameRewardMaterializerTenantResult = {
  tenantId: string;
  tenantSlug: string;
  status: 'PROCESSED' | 'SKIPPED' | 'ERROR';
  reason: string | null;
  intents: GuestGameEffectMaterializeResult;
  effects: GuestGameEffectMaterializeResult;
};

export type GuestGameRewardMaterializerRunResult = {
  checkedTenants: number;
  processedTenants: number;
  skippedTenants: number;
  erroredTenants: number;
  intents: GuestGameEffectMaterializeResult;
  effects: GuestGameEffectMaterializeResult;
  tenants: GuestGameRewardMaterializerTenantResult[];
};

export type GuestGameRewardMaterializerRunOutcome =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'ERROR';

export type GuestGameRewardMaterializerRuntimeResult = Omit<
  GuestGameRewardMaterializerRunResult,
  'tenants'
>;

export type GuestGameRewardMaterializerRuntimeStatus = {
  enabled: boolean;
  backgroundReady: boolean;
  inlineClaimsAllowed: boolean;
  killSwitchEnabled: boolean;
  scope: {
    tenantId: string | null;
    tenantSlug: string | null;
    allowAllTenants: boolean;
    configured: boolean;
  };
  running: boolean;
  intervalMs: number | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOutcome: GuestGameRewardMaterializerRunOutcome | null;
  lastError: string | null;
  lastResult: GuestGameRewardMaterializerRuntimeResult | null;
  lastSkippedAt: string | null;
  lastSkipReason: string | null;
};

export type GuestGameRewardMaterializerQueueMetrics = {
  total: number;
  statusCounts: Record<string, number>;
  ready: number;
  processing: number;
  expiredLeases: number;
  deadLetters: number;
  oldestReadyCreatedAt: string | null;
  oldestReadyAgeMs: number | null;
};

export type GuestGameRewardMaterializerQueueSnapshot = {
  tenantId: string;
  observedAt: string;
  maxAttempts: number;
  intents: GuestGameRewardMaterializerQueueMetrics;
  effects: GuestGameRewardMaterializerQueueMetrics;
};

@Injectable()
export class GuestGameRewardMaterializerSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGameRewardMaterializerSchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private runtimeIntervalMs: number | null = null;
  private lastStartedAt: string | null = null;
  private lastFinishedAt: string | null = null;
  private lastOutcome: GuestGameRewardMaterializerRunOutcome | null = null;
  private lastError: string | null = null;
  private lastResult: GuestGameRewardMaterializerRuntimeResult | null = null;
  private lastSkippedAt: string | null = null;
  private lastSkipReason: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gamification: GuestGamificationService,
  ) {}

  onModuleInit() {
    const policy = resolveGuestGameRewardMaterializerPolicy(this.config);
    if (!policy.ready) {
      this.runtimeIntervalMs = null;
      this.logger.log('Guest game reward materializer scheduler is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    this.runtimeIntervalMs = intervalMs;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      [
        'Guest game reward materializer scheduler started:',
        `interval=${intervalMs}ms`,
        `batch=${this.batchSize()}`,
        `lease=${this.claimLeaseMs()}ms`,
        `attempts=${this.maxAttempts()}`,
      ].join(' '),
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.runtimeIntervalMs = null;
  }

  getRuntimeStatus(): GuestGameRewardMaterializerRuntimeStatus {
    const policy = resolveGuestGameRewardMaterializerPolicy(this.config);
    return {
      enabled: policy.enabled,
      backgroundReady: policy.ready,
      inlineClaimsAllowed: guestGameRewardMaterializerClaimsAllowed(policy),
      killSwitchEnabled: policy.killSwitchEnabled,
      scope: {
        tenantId: policy.tenantId,
        tenantSlug: policy.tenantSlug,
        allowAllTenants: policy.allowAllTenants,
        configured: policy.scopeConfigured,
      },
      running: this.running,
      intervalMs: this.runtimeIntervalMs,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastOutcome: this.lastOutcome,
      lastError: this.lastError,
      lastResult: this.lastResult ? cloneRuntimeResult(this.lastResult) : null,
      lastSkippedAt: this.lastSkippedAt,
      lastSkipReason: this.lastSkipReason,
    };
  }

  async getTenantQueueSnapshot(
    user: Pick<AuthenticatedUser, 'tenantId'>,
  ): Promise<GuestGameRewardMaterializerQueueSnapshot> {
    const scopedTenantId = user.tenantId.trim();
    if (!scopedTenantId) {
      throw new Error('A tenant id is required for the reward queue snapshot.');
    }

    const observedAt = new Date();
    const maxAttempts = this.maxAttempts();
    const readyWhere = {
      tenantId: scopedTenantId,
      attempts: { lt: maxAttempts },
      OR: [
        {
          status: { in: ['PENDING', 'FAILED'] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: observedAt } }],
        },
        {
          status: 'PROCESSING',
          OR: [
            { claimExpiresAt: null },
            { claimExpiresAt: { lte: observedAt } },
          ],
        },
      ],
    };
    const processingWhere = {
      tenantId: scopedTenantId,
      status: 'PROCESSING',
    };
    const expiredLeaseWhere = {
      ...processingWhere,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: observedAt } }],
    };
    const intentReadyWhere = {
      ...readyWhere,
      effectKind: 'REWARD',
    };
    const intentProcessingWhere = {
      ...processingWhere,
      effectKind: 'REWARD',
    };
    const intentExpiredLeaseWhere = {
      ...expiredLeaseWhere,
      effectKind: 'REWARD',
    };

    const [
      intentStatuses,
      intentReady,
      intentProcessing,
      intentExpiredLeases,
      oldestReadyIntent,
      effectStatuses,
      effectReady,
      effectProcessing,
      effectExpiredLeases,
      oldestReadyEffect,
    ] = await Promise.all([
      this.prisma.guestGameRewardIntent.groupBy({
        by: ['status'],
        where: { tenantId: scopedTenantId, effectKind: 'REWARD' },
        _count: { _all: true },
      }),
      this.prisma.guestGameRewardIntent.count({ where: intentReadyWhere }),
      this.prisma.guestGameRewardIntent.count({ where: intentProcessingWhere }),
      this.prisma.guestGameRewardIntent.count({
        where: intentExpiredLeaseWhere,
      }),
      this.prisma.guestGameRewardIntent.findFirst({
        where: intentReadyWhere,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true },
      }),
      this.prisma.guestGameRewardEffect.groupBy({
        by: ['status'],
        where: { tenantId: scopedTenantId },
        _count: { _all: true },
      }),
      this.prisma.guestGameRewardEffect.count({ where: readyWhere }),
      this.prisma.guestGameRewardEffect.count({ where: processingWhere }),
      this.prisma.guestGameRewardEffect.count({ where: expiredLeaseWhere }),
      this.prisma.guestGameRewardEffect.findFirst({
        where: readyWhere,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true },
      }),
    ]);

    return {
      tenantId: scopedTenantId,
      observedAt: observedAt.toISOString(),
      maxAttempts,
      intents: queueMetrics(
        intentStatuses,
        intentReady,
        intentProcessing,
        intentExpiredLeases,
        oldestReadyIntent?.createdAt ?? null,
        observedAt,
      ),
      effects: queueMetrics(
        effectStatuses,
        effectReady,
        effectProcessing,
        effectExpiredLeases,
        oldestReadyEffect?.createdAt ?? null,
        observedAt,
      ),
    };
  }

  async runOnce(): Promise<GuestGameRewardMaterializerRunResult | null> {
    if (this.running) {
      this.recordSkip('previous materializer run is still running');
      this.logger.warn(
        'Guest game reward materializer tick skipped: still running.',
      );
      return null;
    }
    const policy = resolveGuestGameRewardMaterializerPolicy(this.config);
    if (!policy.ready) {
      this.recordSkip(materializerNotReadyReason(policy));
      return null;
    }

    this.running = true;
    this.lastStartedAt = new Date().toISOString();
    this.lastFinishedAt = null;
    this.lastOutcome = null;
    this.lastError = null;
    this.lastResult = null;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...(policy.tenantId ? { id: policy.tenantId } : {}),
          ...(policy.tenantSlug ? { slug: policy.tenantSlug } : {}),
        },
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
      const results: GuestGameRewardMaterializerTenantResult[] = [];

      for (const tenant of tenants) {
        if (tenant.status !== TenantLifecycleStatus.ACTIVE) {
          results.push(
            emptyTenantResult(
              tenant.id,
              tenant.slug,
              'SKIPPED',
              'Tenant is not active.',
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

        const user = {
          ...actor,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
        };
        const dto = {
          limit: this.batchSize(),
          claimLeaseMs: this.claimLeaseMs(),
          maxAttempts: this.maxAttempts(),
        };
        let intents = emptyMaterializeResult();
        let effects = emptyMaterializeResult();
        const errors: string[] = [];

        try {
          intents = await this.gamification.materializeRewardIntents(user, dto);
        } catch (error) {
          errors.push(`intents: ${safeErrorMessage(error)}`);
        }
        try {
          // Intents may create rewards and their durable side-effect records,
          // therefore effects must be drained after intents in every tick.
          effects = await this.gamification.materializeRewardEffects(user, dto);
        } catch (error) {
          errors.push(`effects: ${safeErrorMessage(error)}`);
        }

        results.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          status: errors.length > 0 ? 'ERROR' : 'PROCESSED',
          reason: errors.length > 0 ? errors.join('; ').slice(0, 500) : null,
          intents,
          effects,
        });
      }

      const result = summarize(results);
      this.lastOutcome = runtimeOutcome(result);
      this.lastError = runtimeError(result);
      this.lastResult = compactRuntimeResult(result);
      if (
        result.intents.claimed > 0 ||
        result.effects.claimed > 0 ||
        result.erroredTenants > 0
      ) {
        this.logger.log(
          [
            'Guest game reward materializer finished:',
            `tenants=${result.processedTenants}/${result.checkedTenants}`,
            `intent_claimed=${result.intents.claimed}`,
            `intent_applied=${result.intents.applied}`,
            `effect_claimed=${result.effects.claimed}`,
            `effect_applied=${result.effects.applied}`,
            `failed=${result.intents.failed + result.effects.failed}`,
            `dead=${result.intents.deadLettered + result.effects.deadLettered}`,
          ].join(' '),
        );
      }
      return result;
    } catch (error) {
      this.lastOutcome = 'ERROR';
      this.lastError = safeErrorMessage(error).slice(0, 500);
      this.lastResult = null;
      this.logger.error(
        'Guest game reward materializer failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.lastFinishedAt = new Date().toISOString();
      this.running = false;
    }
  }

  private recordSkip(reason: string) {
    this.lastSkippedAt = new Date().toISOString();
    this.lastSkipReason = reason;
  }

  private intervalMs() {
    return this.positiveInteger(
      'GUEST_GAME_REWARD_MATERIALIZER_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
      5_000,
      5 * 60_000,
    );
  }

  private batchSize() {
    return this.positiveInteger(
      'GUEST_GAME_REWARD_MATERIALIZER_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
  }

  private claimLeaseMs() {
    return this.positiveInteger(
      'GUEST_GAME_REWARD_MATERIALIZER_CLAIM_LEASE_MS',
      DEFAULT_CLAIM_LEASE_MS,
      30_000,
      10 * 60_000,
    );
  }

  private maxAttempts() {
    return this.positiveInteger(
      'GUEST_GAME_REWARD_MATERIALIZER_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
      1,
      20,
    );
  }

  private positiveInteger(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(this.config.get<string>(key));
    return Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, Math.trunc(parsed)))
      : fallback;
  }
}

function emptyMaterializeResult(): GuestGameEffectMaterializeResult {
  return {
    claimed: 0,
    applied: 0,
    recovered: 0,
    canceled: 0,
    failed: 0,
    deadLettered: 0,
    staleFinalizations: 0,
    rewardIds: [],
  };
}

function emptyTenantResult(
  tenantId: string,
  tenantSlug: string,
  status: GuestGameRewardMaterializerTenantResult['status'],
  reason: string,
): GuestGameRewardMaterializerTenantResult {
  return {
    tenantId,
    tenantSlug,
    status,
    reason,
    intents: emptyMaterializeResult(),
    effects: emptyMaterializeResult(),
  };
}

function summarize(
  tenants: GuestGameRewardMaterializerTenantResult[],
): GuestGameRewardMaterializerRunResult {
  return {
    checkedTenants: tenants.length,
    processedTenants: tenants.filter((tenant) => tenant.status === 'PROCESSED')
      .length,
    skippedTenants: tenants.filter((tenant) => tenant.status === 'SKIPPED')
      .length,
    erroredTenants: tenants.filter((tenant) => tenant.status === 'ERROR')
      .length,
    intents: mergeResults(tenants.map((tenant) => tenant.intents)),
    effects: mergeResults(tenants.map((tenant) => tenant.effects)),
    tenants,
  };
}

function mergeResults(
  results: GuestGameEffectMaterializeResult[],
): GuestGameEffectMaterializeResult {
  return {
    claimed: sum(results, 'claimed'),
    applied: sum(results, 'applied'),
    recovered: sum(results, 'recovered'),
    canceled: sum(results, 'canceled'),
    failed: sum(results, 'failed'),
    deadLettered: sum(results, 'deadLettered'),
    staleFinalizations: sum(results, 'staleFinalizations'),
    rewardIds: [...new Set(results.flatMap((result) => result.rewardIds))],
  };
}

function sum(
  results: GuestGameEffectMaterializeResult[],
  key: Exclude<keyof GuestGameEffectMaterializeResult, 'rewardIds'>,
) {
  return results.reduce((total, result) => total + result[key], 0);
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

const queueStatuses = [
  'PENDING',
  'PROCESSING',
  'APPLIED',
  'FAILED',
  'DEAD_LETTER',
  'CANCELED',
] as const;

function queueMetrics(
  rows: Array<{ status: string; _count: { _all: number } }>,
  ready: number,
  processing: number,
  expiredLeases: number,
  oldestReadyCreatedAt: Date | null,
  observedAt: Date,
): GuestGameRewardMaterializerQueueMetrics {
  const statusCounts: Record<string, number> = Object.fromEntries(
    queueStatuses.map((status) => [status, 0]),
  );
  for (const row of rows) {
    statusCounts[row.status] = row._count._all;
  }
  const oldestReadyAt = validDate(oldestReadyCreatedAt);

  return {
    total: Object.values(statusCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    statusCounts,
    ready,
    processing,
    expiredLeases,
    deadLetters: statusCounts.DEAD_LETTER ?? 0,
    oldestReadyCreatedAt: oldestReadyAt?.toISOString() ?? null,
    oldestReadyAgeMs: oldestReadyAt
      ? Math.max(0, observedAt.getTime() - oldestReadyAt.getTime())
      : null,
  };
}

function validDate(value: Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compactRuntimeResult(
  result: GuestGameRewardMaterializerRunResult,
): GuestGameRewardMaterializerRuntimeResult {
  return {
    checkedTenants: result.checkedTenants,
    processedTenants: result.processedTenants,
    skippedTenants: result.skippedTenants,
    erroredTenants: result.erroredTenants,
    intents: cloneMaterializeResult(result.intents),
    effects: cloneMaterializeResult(result.effects),
  };
}

function cloneRuntimeResult(
  result: GuestGameRewardMaterializerRuntimeResult,
): GuestGameRewardMaterializerRuntimeResult {
  return {
    ...result,
    intents: cloneMaterializeResult(result.intents),
    effects: cloneMaterializeResult(result.effects),
  };
}

function cloneMaterializeResult(result: GuestGameEffectMaterializeResult) {
  return { ...result, rewardIds: [...result.rewardIds] };
}

function runtimeOutcome(
  result: GuestGameRewardMaterializerRunResult,
): GuestGameRewardMaterializerRunOutcome {
  if (result.erroredTenants === 0) return 'SUCCESS';
  return result.processedTenants > 0 ? 'PARTIAL' : 'ERROR';
}

function runtimeError(result: GuestGameRewardMaterializerRunResult) {
  const messages = result.tenants
    .filter((tenant) => tenant.status === 'ERROR' && tenant.reason)
    .map((tenant) => `${tenant.tenantSlug}: ${tenant.reason}`);
  return messages.length > 0 ? messages.join('; ').slice(0, 500) : null;
}

function materializerNotReadyReason(
  policy: ReturnType<typeof resolveGuestGameRewardMaterializerPolicy>,
) {
  if (policy.killSwitchEnabled) return 'global kill switch is enabled';
  if (!policy.enabled) return 'background materializer is disabled';
  if (!policy.scopeConfigured) return 'tenant scope is not configured';
  return 'background materializer policy is not ready';
}
