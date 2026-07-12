import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RAW_RETENTION_DAYS = 365;
const DEFAULT_DERIVED_RETENTION_DAYS = 3 * 365;
const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 20;

type RetentionCounts = {
  rawRecords: number;
  facts: number;
  decisions: number;
  auditEvents: number;
  protectedRewards: number;
  protectedEntitlements: number;
};

@Injectable()
export class GuestGameDataRetentionService {
  private readonly logger = new Logger(GuestGameDataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async runAll(options: { now?: Date; liveRequested?: boolean } = {}) {
    const now = options.now ?? new Date();
    const [tenants, policies] = await Promise.all([
      this.prisma.tenant.findMany({ select: { id: true } }),
      this.prisma.guestGameDataRetentionPolicy.findMany(),
    ]);
    const policyByTenant = new Map(
      policies.map((policy) => [policy.tenantId, policy]),
    );
    const results: Array<Record<string, unknown> & { status: string }> = [];

    for (const tenant of tenants) {
      results.push(
        await this.runTenant({
          tenantId: tenant.id,
          now,
          liveRequested: options.liveRequested ?? false,
          policy: policyByTenant.get(tenant.id) ?? null,
        }),
      );
    }

    return {
      now: now.toISOString(),
      tenants: results.length,
      completed: results.filter((result) => result.status !== 'SKIPPED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      results,
    };
  }

  async runTenant(options: {
    tenantId: string;
    now?: Date;
    liveRequested?: boolean;
    policy?: {
      rawRetentionDays: number;
      factRetentionDays: number;
      decisionRetentionDays: number;
      auditRetentionDays: number;
      liveCleanupEnabled: boolean;
    } | null;
  }) {
    const now = options.now ?? new Date();
    const policy =
      options.policy ??
      (await this.prisma.guestGameDataRetentionPolicy.findUnique({
        where: { tenantId: options.tenantId },
      }));
    const effectivePolicy = {
      rawRetentionDays: positiveDays(
        policy?.rawRetentionDays,
        DEFAULT_RAW_RETENTION_DAYS,
      ),
      factRetentionDays: positiveDays(
        policy?.factRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      decisionRetentionDays: positiveDays(
        policy?.decisionRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      auditRetentionDays: positiveDays(
        policy?.auditRetentionDays,
        DEFAULT_DERIVED_RETENTION_DAYS,
      ),
      liveCleanupEnabled: policy?.liveCleanupEnabled ?? false,
    };
    const live =
      Boolean(options.liveRequested) &&
      this.liveCleanupGloballyEnabled() &&
      effectivePolicy.liveCleanupEnabled;
    const mode = live ? 'LIVE' : 'DRY_RUN';
    const dayKey = now.toISOString().slice(0, 10);
    const runKey = `${options.tenantId}:${dayKey}:${mode}`;
    const cutoffs = {
      rawCutoff: subtractDays(now, effectivePolicy.rawRetentionDays),
      factCutoff: subtractDays(now, effectivePolicy.factRetentionDays),
      decisionCutoff: subtractDays(now, effectivePolicy.decisionRetentionDays),
      auditCutoff: subtractDays(now, effectivePolicy.auditRetentionDays),
    };

    let run: { id: string };
    try {
      run = await this.prisma.guestGameDataRetentionRun.create({
        data: {
          tenantId: options.tenantId,
          runKey,
          mode,
          ...cutoffs,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { tenantId: options.tenantId, mode, status: 'SKIPPED' as const };
      }
      throw error;
    }

    try {
      const candidates = await this.countCandidates(options.tenantId, cutoffs);
      const deleted = live
        ? await this.deleteCandidates(options.tenantId, cutoffs)
        : emptyDeletedCounts(candidates);

      await this.prisma.guestGameDataRetentionRun.update({
        where: { id: run.id },
        data: {
          status: live ? 'LIVE_COMPLETE' : 'DRY_RUN_COMPLETE',
          candidates,
          deleted,
          finishedAt: new Date(),
        },
      });

      return {
        tenantId: options.tenantId,
        mode,
        status: live
          ? ('LIVE_COMPLETE' as const)
          : ('DRY_RUN_COMPLETE' as const),
        policy: effectivePolicy,
        cutoffs: mapDates(cutoffs),
        candidates,
        deleted,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.guestGameDataRetentionRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      this.logger.error(
        `Guest game retention failed for tenant ${options.tenantId}: ${message}`,
      );
      throw error;
    }
  }

  private async countCandidates(
    tenantId: string,
    cutoffs: {
      rawCutoff: Date;
      factCutoff: Date;
      decisionCutoff: Date;
      auditCutoff: Date;
    },
  ): Promise<RetentionCounts> {
    const [
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards,
      protectedEntitlements,
    ] = await Promise.all([
      this.prisma.guestActivityRawRecord.count({
        where: {
          tenantId,
          ...nullableEventCutoff('happenedAt', cutoffs.rawCutoff),
        },
      }),
      this.prisma.guestActivityFact.count({
        where: {
          tenantId,
          ...nullableEventCutoff('happenedAt', cutoffs.factCutoff),
        },
      }),
      this.prisma.guestGameRuleDecision.count({
        where: { tenantId, evaluatedAt: { lt: cutoffs.decisionCutoff } },
      }),
      this.prisma.guestGameAuditEvent.count({
        where: { tenantId, happenedAt: { lt: cutoffs.auditCutoff } },
      }),
      this.prisma.guestGameReward.count({ where: { tenantId } }),
      this.prisma.guestGameEntitlement.count({ where: { tenantId } }),
    ]);

    return {
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards,
      protectedEntitlements,
    };
  }

  private async deleteCandidates(
    tenantId: string,
    cutoffs: {
      rawCutoff: Date;
      factCutoff: Date;
      decisionCutoff: Date;
      auditCutoff: Date;
    },
  ) {
    const facts = await this.deleteFactBatches(tenantId, cutoffs.factCutoff);
    const decisions = await this.deleteDecisionBatches(
      tenantId,
      cutoffs.decisionCutoff,
    );
    const auditEvents = await this.deleteAuditBatches(
      tenantId,
      cutoffs.auditCutoff,
    );
    const rawRecords = await this.deleteRawBatches(tenantId, cutoffs.rawCutoff);

    return {
      rawRecords,
      facts,
      decisions,
      auditEvents,
      protectedRewards: 0,
      protectedEntitlements: 0,
    };
  }

  private async deleteRawBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestActivityRawRecord.findMany({
          where: { tenantId, ...nullableEventCutoff('happenedAt', cutoff) },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestActivityRawRecord.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteFactBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestActivityFact.findMany({
          where: { tenantId, ...nullableEventCutoff('happenedAt', cutoff) },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestActivityFact.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteDecisionBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestGameRuleDecision.findMany({
          where: { tenantId, evaluatedAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { evaluatedAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestGameRuleDecision.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteAuditBatches(tenantId: string, cutoff: Date) {
    return this.deleteIdBatches(
      () =>
        this.prisma.guestGameAuditEvent.findMany({
          where: { tenantId, happenedAt: { lt: cutoff } },
          select: { id: true },
          orderBy: { happenedAt: 'asc' },
          take: this.batchSize(),
        }),
      (ids) =>
        this.prisma.guestGameAuditEvent.deleteMany({
          where: { id: { in: ids } },
        }),
    );
  }

  private async deleteIdBatches(
    findIds: () => Promise<Array<{ id: string }>>,
    deleteIds: (ids: string[]) => Promise<{ count: number }>,
  ) {
    let deleted = 0;
    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const rows = await findIds();
      if (rows.length === 0) {
        break;
      }
      const result = await deleteIds(rows.map((row) => row.id));
      deleted += result.count;
      if (rows.length < this.batchSize()) {
        break;
      }
    }
    return deleted;
  }

  private liveCleanupGloballyEnabled() {
    return envFlag(
      this.config.get<string>('GUEST_GAME_RETENTION_LIVE_ENABLED'),
    );
  }

  private batchSize() {
    return boundedInteger(
      this.config.get<string>('GUEST_GAME_RETENTION_BATCH_SIZE'),
      DEFAULT_BATCH_SIZE,
      10,
      5_000,
    );
  }

  private maxBatches() {
    return boundedInteger(
      this.config.get<string>('GUEST_GAME_RETENTION_MAX_BATCHES'),
      DEFAULT_MAX_BATCHES,
      1,
      500,
    );
  }
}

function nullableEventCutoff(field: 'happenedAt', cutoff: Date) {
  return {
    OR: [
      { [field]: { lt: cutoff } },
      { [field]: null, createdAt: { lt: cutoff } },
    ],
  };
}

function emptyDeletedCounts(candidates: RetentionCounts): RetentionCounts {
  return Object.fromEntries(
    Object.keys(candidates).map((key) => [key, 0]),
  ) as RetentionCounts;
}

function subtractDays(value: Date, days: number) {
  return new Date(value.getTime() - days * 24 * 60 * 60 * 1_000);
}

function positiveDays(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.trunc(parsed)))
    : fallback;
}

function envFlag(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function mapDates(value: Record<string, Date>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, date]) => [key, date.toISOString()]),
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
