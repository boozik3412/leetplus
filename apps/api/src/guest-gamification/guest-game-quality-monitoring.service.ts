import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SYNC_LAG_SECONDS = 10 * 60;
const DEFAULT_PARTIAL_SECONDS = 60 * 60;
const DEFAULT_MISMATCH_RATE = 0.01;
const QUALITY_WINDOW_MS = 24 * 60 * 60 * 1_000;

type QualityAlertDraft = {
  code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  details: Prisma.InputJsonValue;
  scopeKey?: string;
};

@Injectable()
export class GuestGameQualityMonitoringService {
  private readonly logger = new Logger(GuestGameQualityMonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getDashboard(user: AuthenticatedUser) {
    const [latest, history, alerts] = await Promise.all([
      this.prisma.guestGameQualitySnapshot.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { measuredAt: 'desc' },
      }),
      this.prisma.guestGameQualitySnapshot.findMany({
        where: {
          tenantId: user.tenantId,
          measuredAt: { gte: new Date(Date.now() - QUALITY_WINDOW_MS) },
        },
        orderBy: { measuredAt: 'asc' },
        take: 288,
      }),
      this.prisma.guestGameQualityAlert.findMany({
        where: { tenantId: user.tenantId, status: 'OPEN' },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
        take: 50,
      }),
    ]);

    return {
      latest: latest ? mapPlain(latest) : null,
      history: history.map(mapPlain),
      alerts: alerts.map(mapPlain),
      thresholds: this.thresholds(),
      note: latest
        ? null
        : 'Мониторинг еще не сформировал первый снимок после применения миграции.',
    };
  }

  async runAll(now = new Date()) {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    const results: Array<Record<string, unknown> & { status: string }> = [];
    for (const tenant of tenants) {
      try {
        results.push(await this.collectTenant(tenant.id, now));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Guest game quality monitoring failed for ${tenant.id}: ${message}`,
        );
        results.push({ tenantId: tenant.id, status: 'FAILED', error: message });
      }
    }
    return {
      measuredAt: now.toISOString(),
      tenants: tenants.length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      results,
    };
  }

  async collectTenant(tenantId: string, now = new Date()) {
    const windowFrom = new Date(now.getTime() - QUALITY_WINDOW_MS);
    const [
      syncStates,
      jobGroups,
      confidenceGroups,
      decisions,
      eventGroups,
      previous,
    ] = await Promise.all([
      this.prisma.guestActivitySyncState.findMany({
        where: { tenantId },
        select: {
          status: true,
          lastSuccessfulTo: true,
          lastStartedAt: true,
        },
      }),
      this.prisma.guestActivitySyncJob.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.guestActivityFact.groupBy({
        by: ['confidence'],
        where: {
          tenantId,
          lifecycleStatus: 'ACTIVE',
          happenedAt: { gte: windowFrom },
        },
        _count: { _all: true },
      }),
      this.prisma.guestGameRuleDecision.findMany({
        where: { tenantId, evaluatedAt: { gte: windowFrom } },
        select: {
          evaluationRunId: true,
          evaluationMode: true,
          status: true,
        },
        orderBy: { evaluatedAt: 'desc' },
        take: 20_000,
      }),
      this.prisma.guestGameAuditEvent.groupBy({
        by: ['action'],
        where: { tenantId, happenedAt: { gte: windowFrom } },
        _count: { _all: true },
      }),
      this.prisma.guestGameQualitySnapshot.findFirst({
        where: { tenantId },
        orderBy: { measuredAt: 'desc' },
      }),
    ]);

    const thresholds = this.thresholds();
    const syncStatusCounts = countValues(
      syncStates.map((state) => state.status),
    );
    const jobStatusCounts = Object.fromEntries(
      jobGroups.map((group) => [group.status, group._count._all]),
    );
    const confidenceCounts = Object.fromEntries(
      confidenceGroups.map((group) => [group.confidence, group._count._all]),
    );
    const eventMix = Object.fromEntries(
      eventGroups.map((group) => [group.action, group._count._all]),
    );
    const lags = syncStates
      .map((state) =>
        state.lastSuccessfulTo
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - state.lastSuccessfulTo.getTime()) / 1_000,
              ),
            )
          : null,
      )
      .filter((value): value is number => value !== null);
    const syncLagSecondsMax = lags.length ? Math.max(...lags) : null;
    const staleSyncCount = syncStates.filter((state) => {
      if (!state.lastSuccessfulTo) return true;
      return (
        now.getTime() - state.lastSuccessfulTo.getTime() >
        thresholds.syncLagSeconds * 1_000
      );
    }).length;
    const longPartialCount = syncStates.filter(
      (state) =>
        state.status === 'PARTIAL' &&
        (!state.lastStartedAt ||
          now.getTime() - state.lastStartedAt.getTime() >
            thresholds.partialSeconds * 1_000),
    ).length;
    const decisionMetrics = decisionPairMetrics(decisions);
    const eventMixShift = detectEventMixShift(previous?.eventMix, eventMix);

    const snapshot = await this.prisma.guestGameQualitySnapshot.create({
      data: {
        tenantId,
        measuredAt: now,
        syncLagSecondsMax,
        staleSyncCount,
        failedSyncCount: syncStatusCounts.FAILED ?? 0,
        partialSyncCount: syncStatusCounts.PARTIAL ?? 0,
        pendingJobCount: jobStatusCounts.PENDING ?? 0,
        retryJobCount: jobStatusCounts.RETRY ?? 0,
        failedJobCount: jobStatusCounts.FAILED ?? 0,
        ...decisionMetrics,
        confidenceCounts,
        syncStatusCounts,
        jobStatusCounts,
        eventMix,
      },
    });
    const alerts = buildQualityAlerts({
      syncLagSecondsMax,
      staleSyncCount,
      failedSyncCount: syncStatusCounts.FAILED ?? 0,
      longPartialCount,
      failedJobCount: jobStatusCounts.FAILED ?? 0,
      missingDecisionCount: decisionMetrics.missingDecisionCount,
      mismatchedRunCount: decisionMetrics.mismatchedRunCount,
      shadowMismatchRate: decisionMetrics.shadowMismatchRate,
      eventMixShift,
      thresholds,
    });
    await this.reconcileAlerts(tenantId, alerts, now);

    return {
      tenantId,
      status: 'SUCCESS',
      snapshotId: snapshot.id,
      alerts: alerts.length,
    };
  }

  private async reconcileAlerts(
    tenantId: string,
    activeAlerts: QualityAlertDraft[],
    now: Date,
  ) {
    const activeKeys = activeAlerts.map(
      (alert) => `${alert.code}:${alert.scopeKey ?? 'TENANT'}`,
    );
    await Promise.all(
      activeAlerts.map((alert) =>
        this.prisma.guestGameQualityAlert.upsert({
          where: {
            tenantId_code_scopeKey: {
              tenantId,
              code: alert.code,
              scopeKey: alert.scopeKey ?? 'TENANT',
            },
          },
          create: {
            tenantId,
            code: alert.code,
            scopeKey: alert.scopeKey ?? 'TENANT',
            severity: alert.severity,
            status: 'OPEN',
            message: alert.message,
            details: alert.details,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          update: {
            severity: alert.severity,
            status: 'OPEN',
            message: alert.message,
            details: alert.details,
            occurrences: { increment: 1 },
            lastSeenAt: now,
            resolvedAt: null,
          },
        }),
      ),
    );

    const openAlerts = await this.prisma.guestGameQualityAlert.findMany({
      where: { tenantId, status: 'OPEN' },
      select: { id: true, code: true, scopeKey: true },
    });
    const resolvedIds = openAlerts
      .filter(
        (alert) => !activeKeys.includes(`${alert.code}:${alert.scopeKey}`),
      )
      .map((alert) => alert.id);
    if (resolvedIds.length) {
      await this.prisma.guestGameQualityAlert.updateMany({
        where: { id: { in: resolvedIds } },
        data: { status: 'RESOLVED', resolvedAt: now },
      });
    }
  }

  private thresholds() {
    return {
      syncLagSeconds: positiveNumber(
        this.config.get<string>('GUEST_GAME_MONITOR_SYNC_LAG_SECONDS'),
        DEFAULT_SYNC_LAG_SECONDS,
      ),
      partialSeconds: positiveNumber(
        this.config.get<string>('GUEST_GAME_MONITOR_PARTIAL_SECONDS'),
        DEFAULT_PARTIAL_SECONDS,
      ),
      mismatchRate: boundedRate(
        this.config.get<string>('GUEST_GAME_MONITOR_MISMATCH_RATE'),
        DEFAULT_MISMATCH_RATE,
      ),
    };
  }
}

export function decisionPairMetrics(
  decisions: Array<{
    evaluationRunId: string;
    evaluationMode: string;
    status: string;
  }>,
) {
  const runs = new Map<
    string,
    { live: string | null; shadow: string | null }
  >();
  for (const decision of decisions) {
    const run = runs.get(decision.evaluationRunId) ?? {
      live: null,
      shadow: null,
    };
    if (decision.evaluationMode === 'SHADOW') {
      run.shadow ??= decision.status;
    } else {
      run.live ??= decision.status;
    }
    runs.set(decision.evaluationRunId, run);
  }
  const values = [...runs.values()];
  const paired = values.filter((run) => run.live && run.shadow);
  const mismatched = paired.filter(
    (run) =>
      normalizeDecisionOutcome(run.live) !==
      normalizeDecisionOutcome(run.shadow),
  );

  return {
    decisionRunCount: values.length,
    pairedDecisionCount: paired.length,
    missingDecisionCount: values.length - paired.length,
    mismatchedRunCount: mismatched.length,
    decisionCoverage: values.length ? paired.length / values.length : 0,
    shadowMismatchRate: paired.length ? mismatched.length / paired.length : 0,
  };
}

function normalizeDecisionOutcome(status: string | null) {
  if (status === 'NO_MATCH') return 'BLOCKED';
  return status;
}

export function buildQualityAlerts(input: {
  syncLagSecondsMax: number | null;
  staleSyncCount: number;
  failedSyncCount: number;
  longPartialCount: number;
  failedJobCount: number;
  missingDecisionCount: number;
  mismatchedRunCount: number;
  shadowMismatchRate: number;
  eventMixShift: Record<string, unknown> | null;
  thresholds: {
    syncLagSeconds: number;
    partialSeconds: number;
    mismatchRate: number;
  };
}) {
  const alerts: QualityAlertDraft[] = [];
  if (
    input.syncLagSecondsMax !== null &&
    input.syncLagSecondsMax > input.thresholds.syncLagSeconds
  ) {
    alerts.push({
      code: 'SYNC_LAG',
      severity: 'WARNING',
      message: `Отставание синхронизации превышает ${input.thresholds.syncLagSeconds} секунд.`,
      details: {
        syncLagSecondsMax: input.syncLagSecondsMax,
        staleSyncCount: input.staleSyncCount,
      },
    });
  }
  if (input.failedSyncCount || input.failedJobCount) {
    alerts.push({
      code: 'SYNC_FAILED',
      severity: 'CRITICAL',
      message: 'Обнаружены повторные ошибки синхронизации Игрового журнала.',
      details: {
        failedSyncCount: input.failedSyncCount,
        failedJobCount: input.failedJobCount,
      },
    });
  }
  if (input.longPartialCount) {
    alerts.push({
      code: 'PARTIAL_TOO_LONG',
      severity: 'WARNING',
      message: 'Частичная синхронизация не завершается в пределах SLA.',
      details: { longPartialCount: input.longPartialCount },
    });
  }
  if (input.missingDecisionCount) {
    alerts.push({
      code: 'MISSING_DECISION',
      severity: 'WARNING',
      message: 'Есть evaluation run без парного LIVE или SHADOW решения.',
      details: { missingDecisionCount: input.missingDecisionCount },
    });
  }
  if (
    input.mismatchedRunCount &&
    input.shadowMismatchRate > input.thresholds.mismatchRate
  ) {
    alerts.push({
      code: 'SHADOW_MISMATCH_RATE',
      severity: 'CRITICAL',
      message: 'Доля расхождений LIVE/SHADOW выше допустимого порога.',
      details: {
        mismatchedRunCount: input.mismatchedRunCount,
        shadowMismatchRate: input.shadowMismatchRate,
        threshold: input.thresholds.mismatchRate,
      },
    });
  }
  if (input.eventMixShift) {
    alerts.push({
      code: 'EVENT_MIX_SHIFT',
      severity: 'WARNING',
      message:
        'Структура игровых событий резко изменилась относительно прошлого снимка.',
      details: input.eventMixShift as Prisma.InputJsonValue,
    });
  }
  return alerts;
}

export function detectEventMixShift(
  previousValue: Prisma.JsonValue | null | undefined,
  current: Record<string, number>,
) {
  const previous = jsonNumberRecord(previousValue);
  const previousTotal = sumValues(previous);
  const currentTotal = sumValues(current);
  if (previousTotal < 20 || currentTotal < 20) return null;

  for (const key of new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ])) {
    const before = (previous[key] ?? 0) / previousTotal;
    const after = (current[key] ?? 0) / currentTotal;
    if (Math.abs(after - before) >= 0.5) {
      return { action: key, before, after, previousTotal, currentTotal };
    }
  }
  return null;
}

function jsonNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function countValues(values: string[]) {
  const counts: Record<string, number> = {};
  values.forEach((value) => {
    counts[value] = (counts[value] ?? 0) + 1;
  });
  return counts;
}

function sumValues(value: Record<string, number>) {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function mapPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
