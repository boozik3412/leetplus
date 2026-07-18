import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { parseLangameDate } from '../integrations/langame-date';
import {
  buildLangameTariffTypeGroupIndex,
  resolveLangameSessionTariff,
  type LangameTariffTypeGroupIndex,
} from '../integrations/langame-session-tariff';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameBalanceTopup,
  LangameGuestLog,
  LangameGuestSession,
  LangameProductExpense,
  LangameTransaction,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_LIMIT = 200;
const MAX_SYNC_PAGES_PER_SOURCE = 20;
const DEFAULT_BASELINE_DAYS = 7;
const SYNC_OVERLAP_DAYS = 1;
const RUNNING_SYNC_STALE_MS = 5 * 60 * 1000;
const SYNC_JOB_LOCK_STALE_MS = 10 * 60 * 1000;
const SYNC_JOB_MAX_ATTEMPTS = 5;
const SYNC_JOB_BASE_BACKOFF_MS = 15 * 1000;
const INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS = 30;
const INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS = 15 * 60 * 1000;
const GUEST_ACTIVITY_PARSER_VERSION = 'guest-activity-v3';

const SOURCE_GUEST_LOG = 'LANGAME_GUEST_LOG';
const SOURCE_GUEST_SESSION = 'LANGAME_GUEST_SESSION';
const SOURCE_TRANSACTION = 'LANGAME_TRANSACTION';
const SOURCE_PRODUCT_EXPENSE = 'LANGAME_PRODUCT_EXPENSE';
const SOURCE_BALANCE_TOPUP = 'LANGAME_BALANCE_TOPUP';

type GuestActivityFactType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'PACKAGE_OR_SUBSCRIPTION_PURCHASED'
  | 'PACKAGE_OR_SUBSCRIPTION_USED'
  | 'HOURLY_SESSION_STARTED'
  | 'HOURLY_PLAY_TIME_ACCUMULATED'
  | 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
  | 'PRODUCT_PURCHASED'
  | 'BALANCE_TOPUP'
  | 'BALANCE_WRITE_OFF'
  | 'BONUS_TOPUP'
  | 'VISIT'
  | 'REWARD_TRACE';

type GuestActivityConfidence = 'EXACT' | 'TEXT_MATCH' | 'INFERRED' | 'UNKNOWN';

type GuestActivitySyncStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'STALE_BINDING'
  | 'SKIPPED';

export type GuestActivitySyncFailureClass =
  | 'STALE_EXTERNAL_GUEST'
  | 'AUTH_CONFIGURATION'
  | 'RATE_LIMITED'
  | 'TRANSIENT_UPSTREAM'
  | 'UNKNOWN';

export type LedgerSyncInput = {
  tenantId: string;
  profileId: string;
  storeId?: string | null;
  guestId?: string | null;
  reason?: string;
};

type LedgerSyncContext = {
  tenantId: string;
  profile: {
    id: string;
    guestId: string | null;
    phoneHash: string | null;
  };
  guest: {
    id: string;
    externalProvider: IntegrationProvider | null;
    externalDomain: string | null;
    externalGuestId: string | null;
  } | null;
  store: {
    id: string;
    name: string;
    externalDomain: string | null;
    externalClubId: string | null;
    integrationSourceId: string | null;
    timeZone: string | null;
  } | null;
  stores: Array<{
    id: string;
    externalDomain: string | null;
    externalClubId: string | null;
    integrationSourceId: string | null;
    timeZone: string | null;
  }>;
  source: {
    id: string;
    domain: string;
    baseUrl: string;
  };
  apiKey: string;
  externalGuestId: string;
  externalDomain: string;
  timeZone: string;
  tariffTypeGroups: LangameTariffTypeGroupIndex;
};

type RawRecordDraft = {
  sourceKind: string;
  sourceKey: string;
  sourceHash: string;
  sourceExternalId: string | null;
  rawType: string | null;
  rawText: string | null;
  happenedAt: Date | null;
  sourceLocalDate: string | null;
  externalClubId: string | null;
  storeId: string | null;
  sessionExternalId: string | null;
  amount: number | null;
  bonusAmount: number | null;
  rawPayload: Prisma.InputJsonValue;
};

type ProductNamesByClub = Map<string, Map<string, string>>;
type ProductCategoriesByClub = Map<
  string,
  Map<
    string,
    {
      categoryId: string | null;
      categoryName: string | null;
      externalCategoryKey: string | null;
      externalCategoryId: string | null;
      externalCategoryName: string | null;
    }
  >
>;

type FactDraft = {
  factType: GuestActivityFactType;
  happenedAt: Date | null;
  sourceLocalDate: string | null;
  externalClubId: string | null;
  storeId: string | null;
  sessionExternalId: string | null;
  tariffName: string | null;
  tariffType: string | null;
  amount: number | null;
  bonusAmount: number | null;
  durationMinutes: number | null;
  confidence: GuestActivityConfidence;
  evidence: Prisma.InputJsonValue;
};

type SyncWindow = {
  from: Date;
  to: Date;
  initial: boolean;
  earliestRuleAt: Date | null;
};

type SourceSyncWindow = SyncWindow & {
  startPage: number;
};

type SourceFetchResult<T> = {
  rows: T[];
  partial: boolean;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  pagesFetched: number;
  rowsFetched: number;
  nextPage: number | null;
  window: SourceSyncWindow;
  errorMessage: string | null;
};

export type GuestActivityLedgerDiagnostics = {
  syncState: unknown;
  sourceSyncStates: unknown[];
  syncJobs: unknown[];
  rawRecords: unknown[];
  facts: unknown[];
  activeRuleWindow: {
    earliestRuleAt: string | null;
    syncFrom: string | null;
    storeId: string | null;
  };
  potentialMatches: Array<{
    ruleType: string;
    ruleId: string;
    title: string;
    status: string;
    storeIds: string[];
    relevantFactTypes: string[];
    matchingFacts: number;
  }>;
};

@Injectable()
export class GuestActivityLedgerService {
  private readonly logger = new Logger(GuestActivityLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
  ) {}

  scheduleProfileSync(input: LedgerSyncInput): void {
    void this.enqueueProfileSync(input).catch((error) => {
      this.logger.warn(
        `Guest activity ledger sync was not queued for profile ${input.profileId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async enqueueProfileSync(input: LedgerSyncInput): Promise<unknown> {
    const jobKey = this.syncJobKey(input);
    const existing = await this.prisma.guestActivitySyncJob.findUnique({
      where: { jobKey },
      select: { id: true, status: true },
    });

    if (existing?.status === 'RUNNING') {
      return this.prisma.guestActivitySyncJob.update({
        where: { id: existing.id },
        data: {
          rerunRequested: true,
          reason: input.reason ?? null,
          payload: this.syncJobPayload(input),
        },
      });
    }

    const now = new Date();

    if (existing) {
      const alreadyQueued = ['PENDING', 'RETRY'].includes(existing.status);

      return this.prisma.guestActivitySyncJob.update({
        where: { id: existing.id },
        data: {
          guestId: input.guestId ?? null,
          storeId: input.storeId ?? null,
          reason: input.reason ?? null,
          payload: this.syncJobPayload(input),
          ...(alreadyQueued
            ? {}
            : {
                status: 'PENDING',
                attempts: 0,
                nextAttemptAt: now,
                lockedAt: null,
                lockedBy: null,
                rerunRequested: false,
                lastError: null,
                lastFinishedAt: null,
              }),
        },
      });
    }

    try {
      return await this.prisma.guestActivitySyncJob.create({
        data: {
          tenantId: input.tenantId,
          profileId: input.profileId,
          guestId: input.guestId ?? null,
          storeId: input.storeId ?? null,
          jobKey,
          reason: input.reason ?? null,
          status: 'PENDING',
          maxAttempts: SYNC_JOB_MAX_ATTEMPTS,
          nextAttemptAt: now,
          payload: this.syncJobPayload(input),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.enqueueProfileSync(input);
      }
      throw error;
    }
  }

  async processQueuedSyncJobs(limit = 5, workerId = `api-${process.pid}`) {
    const results: Array<{
      jobId: string;
      status: string;
      errorMessage?: string;
    }> = [];

    for (let index = 0; index < limit; index += 1) {
      const job = await this.claimNextSyncJob(workerId);

      if (!job) {
        break;
      }

      try {
        const syncResult = await this.syncProfile({
          tenantId: job.tenantId,
          profileId: job.profileId,
          guestId: job.guestId,
          storeId: job.storeId,
          reason: job.reason ?? 'QUEUED_SYNC',
        });
        const status = await this.completeSyncJob(
          job.id,
          syncResult.status === 'STALE_BINDING' ? 'SKIPPED' : 'SUCCESS',
        );
        results.push({ jobId: job.id, status });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const status = await this.failSyncJob(job.id, errorMessage);
        results.push({ jobId: job.id, status, errorMessage });
      }
    }

    return {
      processed: results.length,
      success: results.filter((result) => result.status === 'SUCCESS').length,
      retried: results.filter((result) => result.status === 'RETRY').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      rerun: results.filter((result) => result.status === 'PENDING').length,
      results,
    };
  }

  async enqueueDueRecoverySyncs(limit = 20, now = new Date()) {
    const retryBefore = new Date(now.getTime() - 5 * 60 * 1_000);
    const states = await this.prisma.guestActivitySyncState.findMany({
      where: {
        status: { in: ['PARTIAL', 'FAILED'] },
        profileId: { not: null },
        OR: [
          { lastFinishedAt: { lte: retryBefore } },
          { lastFinishedAt: null, updatedAt: { lte: retryBefore } },
        ],
      },
      select: {
        id: true,
        profileId: true,
        guestId: true,
        storeId: true,
        tenantId: true,
        status: true,
        errorMessage: true,
        diagnostics: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.max(limit * 3, limit),
    });
    let queued = 0;
    let skipped = 0;

    for (const state of states) {
      if (queued >= limit) break;
      if (syncStateHasStaleExternalGuest(state)) {
        await this.prisma.guestActivitySyncState.update({
          where: { id: state.id },
          data: { status: 'STALE_BINDING' },
        });
        skipped += 1;
        continue;
      }
      if (!state.profileId || !isRecoverableSyncState(state)) {
        skipped += 1;
        continue;
      }
      await this.enqueueProfileSync({
        tenantId: state.tenantId,
        profileId: state.profileId,
        guestId: state.guestId,
        storeId: state.storeId,
        reason: `AUTOMATIC_RECOVERY_${state.status}`,
      });
      queued += 1;
    }

    return { scanned: states.length, queued, skipped };
  }

  private async claimNextSyncJob(workerId: string) {
    const now = new Date();
    const staleAt = new Date(now.getTime() - SYNC_JOB_LOCK_STALE_MS);
    const availableWhere = {
      OR: [
        {
          status: { in: ['PENDING', 'RETRY'] },
          nextAttemptAt: { lte: now },
        },
        { status: 'RUNNING', lockedAt: { lt: staleAt } },
      ],
    };
    const candidate = await this.prisma.guestActivitySyncJob.findFirst({
      where: availableWhere,
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!candidate) {
      return null;
    }

    const claimed = await this.prisma.guestActivitySyncJob.updateMany({
      where: {
        id: candidate.id,
        updatedAt: candidate.updatedAt,
        ...availableWhere,
      },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: workerId,
        lastStartedAt: now,
        lastError: null,
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    return this.prisma.guestActivitySyncJob.findUnique({
      where: { id: candidate.id },
    });
  }

  private async completeSyncJob(
    jobId: string,
    completedStatus: 'SUCCESS' | 'SKIPPED' = 'SUCCESS',
  ) {
    const job = await this.prisma.guestActivitySyncJob.findUnique({
      where: { id: jobId },
      select: { rerunRequested: true },
    });
    const now = new Date();

    if (job?.rerunRequested) {
      await this.prisma.guestActivitySyncJob.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: now,
          lockedAt: null,
          lockedBy: null,
          rerunRequested: false,
          lastFinishedAt: now,
        },
      });
      return 'PENDING';
    }

    await this.prisma.guestActivitySyncJob.update({
      where: { id: jobId },
      data: {
        status: completedStatus,
        lockedAt: null,
        lockedBy: null,
        lastFinishedAt: now,
      },
    });
    return completedStatus;
  }

  private async failSyncJob(jobId: string, errorMessage: string) {
    const job = await this.prisma.guestActivitySyncJob.findUnique({
      where: { id: jobId },
      select: { attempts: true, maxAttempts: true },
    });
    const attempts = job?.attempts ?? SYNC_JOB_MAX_ATTEMPTS;
    const maxAttempts = job?.maxAttempts ?? SYNC_JOB_MAX_ATTEMPTS;
    const exhausted = attempts >= maxAttempts;
    const now = new Date();
    const backoffMs = Math.min(
      SYNC_JOB_BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1),
      30 * 60 * 1000,
    );

    await this.prisma.guestActivitySyncJob.update({
      where: { id: jobId },
      data: {
        status: exhausted ? 'FAILED' : 'RETRY',
        nextAttemptAt: exhausted ? now : new Date(now.getTime() + backoffMs),
        lockedAt: null,
        lockedBy: null,
        lastError: errorMessage.slice(0, 2000),
        lastFinishedAt: now,
      },
    });

    return exhausted ? 'FAILED' : 'RETRY';
  }

  private syncJobKey(input: LedgerSyncInput) {
    return [input.tenantId, input.profileId, input.storeId ?? 'any-store'].join(
      ':',
    );
  }

  private syncJobPayload(input: LedgerSyncInput): Prisma.InputJsonValue {
    return {
      tenantId: input.tenantId,
      profileId: input.profileId,
      guestId: input.guestId ?? null,
      storeId: input.storeId ?? null,
      reason: input.reason ?? null,
    };
  }

  async syncProfile(input: LedgerSyncInput) {
    const context = await this.resolveContext(input);

    if (!context) {
      return { status: 'SKIPPED' as GuestActivitySyncStatus };
    }

    const state = await this.prisma.guestActivitySyncState.findUnique({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId: {
          tenantId: context.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
        },
      },
    });

    if (this.isFreshRunningSync(state?.status, state?.lastStartedAt)) {
      return { status: 'SKIPPED' as GuestActivitySyncStatus };
    }

    const window = await this.resolveSyncWindow(context, state);

    await this.upsertSyncState(context, {
      status: 'RUNNING',
      window,
      rawRecordsCount: state?.rawRecordsCount ?? 0,
      factsCount: state?.factsCount ?? 0,
      diagnostics: {
        reason: input.reason ?? null,
        startedAt: new Date().toISOString(),
      },
    });

    try {
      const result = await this.fetchAndPersist(context, window);
      await this.reconcileHistoricalSessionFactVersions(context);
      const status: GuestActivitySyncStatus = result.staleBinding
        ? 'STALE_BINDING'
        : result.partial
          ? 'PARTIAL'
          : 'SUCCESS';

      await this.upsertSyncState(context, {
        status,
        window,
        rawRecordsCount: result.rawRecordsCount,
        factsCount: result.factsCount,
        diagnostics: {
          reason: input.reason ?? null,
          sourceCounts: result.sourceCounts,
          sourceResults: result.sourceResults,
          partial: result.partial,
          staleBinding: result.staleBinding,
          failureClass: result.failureClass,
          earliestRuleAt: window.earliestRuleAt?.toISOString() ?? null,
        },
        errorMessage: result.errorMessage ?? undefined,
      });

      return { status, ...result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const failureClass = classifyGuestActivitySyncFailure(errorMessage);
      const staleBinding = failureClass === 'STALE_EXTERNAL_GUEST';
      await this.upsertSyncState(context, {
        status: staleBinding ? 'STALE_BINDING' : 'FAILED',
        window,
        rawRecordsCount: state?.rawRecordsCount ?? 0,
        factsCount: state?.factsCount ?? 0,
        errorMessage,
        diagnostics: {
          reason: input.reason ?? null,
          failedAt: new Date().toISOString(),
          failureClass,
          recoverable: isRecoverableFailureClass(failureClass),
        },
      });
      if (staleBinding) {
        return {
          status: 'STALE_BINDING' as GuestActivitySyncStatus,
          errorMessage,
          failureClass,
        };
      }
      throw error;
    }
  }

  async getDiagnostics(
    user: AuthenticatedUser,
    query: {
      profileId?: string;
      guestId?: string;
      externalGuestId?: string;
      limit?: string | number;
    },
  ): Promise<GuestActivityLedgerDiagnostics> {
    const tenantId = this.requireTenantId(user);
    const limit = clampNumber(Number(query.limit ?? 30), 5, 100);
    const profile = query.profileId
      ? await this.prisma.guestGameProfile.findFirst({
          where: { id: query.profileId, tenantId },
          select: { id: true, guestId: true },
        })
      : null;
    const guestId = query.guestId ?? profile?.guestId ?? null;
    const guest = guestId
      ? await this.prisma.guest.findFirst({
          where: { id: guestId, tenantId },
          select: {
            id: true,
            externalDomain: true,
            externalGuestId: true,
          },
        })
      : query.externalGuestId
        ? await this.prisma.guest.findFirst({
            where: { tenantId, externalGuestId: query.externalGuestId },
            select: {
              id: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : null;

    if (!profile && !guest && !query.externalGuestId) {
      throw new BadRequestException(
        'Укажите profileId, guestId или externalGuestId для диагностики.',
      );
    }

    const externalGuestId =
      guest?.externalGuestId ?? nullableString(query.externalGuestId);
    const externalDomain = guest?.externalDomain ?? undefined;

    const baseWhere = {
      tenantId,
      ...(profile?.id ? { profileId: profile.id } : {}),
      ...(guest?.id ? { guestId: guest.id } : {}),
      ...(externalGuestId && !guest?.id ? { externalGuestId } : {}),
      ...(externalDomain ? { externalDomain } : {}),
    };

    const [
      syncState,
      sourceSyncStates,
      syncJobs,
      rawRecords,
      facts,
      activeRuleWindow,
    ] = await Promise.all([
      externalGuestId
        ? this.prisma.guestActivitySyncState.findFirst({
            where: baseWhere,
            orderBy: { updatedAt: 'desc' },
          })
        : null,
      this.prisma.guestActivitySourceSyncState.findMany({
        where: baseWhere,
        orderBy: [{ sourceKind: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.guestActivitySyncJob.findMany({
        where: {
          tenantId,
          ...(profile?.id ? { profileId: profile.id } : {}),
          ...(guest?.id ? { guestId: guest.id } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.guestActivityRawRecord.findMany({
        where: baseWhere,
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.guestActivityFact.findMany({
        where: { ...baseWhere, lifecycleStatus: 'ACTIVE' },
        orderBy: [{ happenedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.resolveEarliestActiveRuleDate(tenantId, null),
    ]);

    return {
      syncState,
      sourceSyncStates,
      syncJobs,
      rawRecords,
      facts,
      activeRuleWindow: {
        earliestRuleAt: activeRuleWindow?.toISOString() ?? null,
        syncFrom: syncState?.syncFrom?.toISOString() ?? null,
        storeId: null,
      },
      potentialMatches: await this.resolvePotentialMatches(
        tenantId,
        null,
        facts.map((fact) => fact.factType),
      ),
    };
  }

  async rebuildProfileFacts(input: LedgerSyncInput) {
    const context = await this.resolveContext(input);
    if (!context) {
      throw new BadRequestException(
        'Профиль не связан с гостем Langame или для него не настроен источник.',
      );
    }

    const normalizationRunId = randomUUID();
    const rawRecords = await this.prisma.guestActivityRawRecord.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
      },
      orderBy: [{ happenedAt: 'asc' }, { createdAt: 'asc' }],
    });
    let factsCreated = 0;

    for (const record of rawRecords) {
      const row = jsonObjectRecord(record.rawPayload);
      const raw: RawRecordDraft = {
        sourceKind: record.sourceKind,
        sourceKey: record.sourceKey,
        sourceHash: record.sourceHash,
        sourceExternalId: record.sourceExternalId,
        rawType: record.rawType,
        rawText: record.rawText,
        happenedAt: record.happenedAt,
        sourceLocalDate: record.sourceLocalDate,
        externalClubId: record.externalClubId,
        storeId: record.storeId,
        sessionExternalId: record.sessionExternalId,
        amount: decimalValue(record.amount),
        bonusAmount: decimalValue(record.bonusAmount),
        rawPayload: sanitizePayload(record.rawPayload),
      };

      factsCreated += await this.persistNormalizedFacts(
        context,
        record.id,
        record.sourceKind,
        row,
        raw,
        normalizationRunId,
      );
    }

    const happenedAtValues = rawRecords
      .map((record) => record.happenedAt)
      .filter((value): value is Date => Boolean(value));
    if (happenedAtValues.length > 0) {
      const from = new Date(
        Math.min(...happenedAtValues.map((value) => value.getTime())),
      );
      const to = new Date(
        Math.max(
          Date.now(),
          ...happenedAtValues.map((value) => value.getTime()),
        ),
      );
      factsCreated += await this.inferPackageSubscriptionUsageFacts(
        context,
        { from, to, initial: false, earliestRuleAt: null },
        normalizationRunId,
      );
    }

    await this.reconcileHistoricalSessionFactVersions(context);

    return {
      normalizationRunId,
      parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
      rawRecordsProcessed: rawRecords.length,
      factsCreated,
    };
  }

  private async resolveContext(
    input: LedgerSyncInput,
  ): Promise<LedgerSyncContext | null> {
    const profile = await this.prisma.guestGameProfile.findFirst({
      where: { id: input.profileId, tenantId: input.tenantId },
      select: {
        id: true,
        guestId: true,
        phoneHash: true,
        guest: {
          select: {
            id: true,
            externalProvider: true,
            externalDomain: true,
            externalGuestId: true,
          },
        },
      },
    });

    if (!profile) {
      return null;
    }

    const guest =
      profile.guest ??
      (profile.guestId
        ? await this.prisma.guest.findFirst({
            where: { id: profile.guestId, tenantId: input.tenantId },
            select: {
              id: true,
              externalProvider: true,
              externalDomain: true,
              externalGuestId: true,
            },
          })
        : null);
    const externalGuestId = nullableString(guest?.externalGuestId);

    if (!guest || !externalGuestId) {
      return null;
    }

    const store = input.storeId
      ? await this.prisma.store.findFirst({
          where: { id: input.storeId, tenantId: input.tenantId },
          select: {
            id: true,
            name: true,
            externalDomain: true,
            externalClubId: true,
            integrationSourceId: true,
            timeZone: true,
          },
        })
      : null;
    const { apiKey, sources } =
      await this.langameSettingsService.resolveTenantAccess(input.tenantId);
    const externalDomain =
      nullableString(store?.externalDomain) ??
      nullableString(guest.externalDomain) ??
      nullableString(sources[0]?.domain);
    const source =
      sources.find((item) => item.id === store?.integrationSourceId) ??
      sources.find((item) => item.domain === externalDomain) ??
      sources[0];

    if (!source) {
      return null;
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: input.tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: source.domain,
      },
      select: {
        id: true,
        externalDomain: true,
        externalClubId: true,
        integrationSourceId: true,
        timeZone: true,
      },
    });
    let tariffTypeGroups: LangameTariffTypeGroupIndex = new Map();

    try {
      tariffTypeGroups = buildLangameTariffTypeGroupIndex(
        await this.langameClient.listTariffTypeGroups(source.baseUrl, apiKey),
      );
    } catch (error) {
      this.logger.warn(
        `Langame tariff type groups are unavailable for ${source.domain}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      tenantId: input.tenantId,
      profile: {
        id: profile.id,
        guestId: guest.id,
        phoneHash: profile.phoneHash,
      },
      guest,
      store,
      stores,
      source: {
        id: source.id,
        domain: source.domain,
        baseUrl: source.baseUrl,
      },
      apiKey,
      externalGuestId,
      externalDomain: source.domain,
      timeZone: store?.timeZone ?? 'Asia/Yekaterinburg',
      tariffTypeGroups,
    };
  }

  private async resolveSyncWindow(
    context: LedgerSyncContext,
    state: { lastSuccessfulTo: Date | null; syncFrom: Date | null } | null,
  ): Promise<SyncWindow> {
    const to = new Date();

    if (state?.lastSuccessfulTo) {
      return {
        from: subtractDays(state.lastSuccessfulTo, SYNC_OVERLAP_DAYS),
        to,
        initial: false,
        earliestRuleAt: state.syncFrom,
      };
    }

    const earliestRuleAt = await this.resolveEarliestActiveRuleDate(
      context.tenantId,
      context.store?.id ?? null,
    );

    return {
      from: earliestRuleAt
        ? subtractDays(earliestRuleAt, SYNC_OVERLAP_DAYS)
        : subtractDays(to, DEFAULT_BASELINE_DAYS),
      to,
      initial: true,
      earliestRuleAt,
    };
  }

  private async resolveEarliestActiveRuleDate(
    tenantId: string,
    storeId: string | null,
  ) {
    const [lootBoxes, missions, seasons, promoCards] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
      this.prisma.guestGamePromoCard.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          createdAt: true,
          periodFrom: true,
          storeIds: true,
        },
      }),
    ]);
    const dates = [
      ...lootBoxes
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.createdAt),
      ...missions
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
      ...seasons
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
      ...promoCards
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => rule.periodFrom ?? rule.createdAt),
    ];

    if (dates.length === 0) {
      return null;
    }

    return dates.reduce((earliest, date) =>
      date.getTime() < earliest.getTime() ? date : earliest,
    );
  }

  private async fetchAndPersist(
    context: LedgerSyncContext,
    window: SyncWindow,
  ) {
    const normalizationRunId = randomUUID();
    const sourceCounts = {
      guestLogs: 0,
      sessions: 0,
      transactions: 0,
      productExpenses: 0,
      balanceTopups: 0,
    };
    const guestLogs = await this.fetchSourceRows(
      context,
      SOURCE_GUEST_LOG,
      window,
      (page, dateFrom, dateTo) =>
        this.langameClient.listGuestLogs(
          context.source.baseUrl,
          context.apiKey,
          {
            page,
            pageLimit: DEFAULT_PAGE_LIMIT,
            dateFrom,
            dateTo,
            guestId: context.externalGuestId,
          },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId, true),
    );
    sourceCounts.guestLogs = guestLogs.rows.length;

    const sessions = await this.fetchSourceRows(
      context,
      SOURCE_GUEST_SESSION,
      window,
      (page, dateFrom, dateTo) =>
        this.langameClient.listGuestSessions(
          context.source.baseUrl,
          context.apiKey,
          { page, pageLimit: DEFAULT_PAGE_LIMIT, dateFrom, dateTo },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.sessions = sessions.rows.length;

    const transactions = await this.fetchSourceRows(
      context,
      SOURCE_TRANSACTION,
      window,
      (page, dateFrom, dateTo) =>
        this.langameClient.listTransactions(
          context.source.baseUrl,
          context.apiKey,
          { page, pageLimit: DEFAULT_PAGE_LIMIT, dateFrom, dateTo },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.transactions = transactions.rows.length;

    const productExpenses = await this.fetchSourceRows(
      context,
      SOURCE_PRODUCT_EXPENSE,
      window,
      (page, dateFrom, dateTo) =>
        this.langameClient.listProductExpenses(
          context.source.baseUrl,
          context.apiKey,
          { page, pageLimit: DEFAULT_PAGE_LIMIT, dateFrom, dateTo },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.productExpenses = productExpenses.rows.length;
    const productNamesByClub = await this.fetchProductNamesByClub(
      context,
      productExpenses.rows,
    );
    const productCategoriesByClub = await this.fetchProductCategoriesByClub(
      context,
      productExpenses.rows,
    );

    const balanceTopups = await this.fetchSourceRows(
      context,
      SOURCE_BALANCE_TOPUP,
      window,
      (page, dateFrom, dateTo) =>
        this.langameClient.listBalanceTopups(
          context.source.baseUrl,
          context.apiKey,
          { page, pageLimit: DEFAULT_PAGE_LIMIT, dateFrom, dateTo },
        ),
      (row) => this.rowMatchesGuest(row, context.externalGuestId),
    );
    sourceCounts.balanceTopups = balanceTopups.rows.length;

    let rawRecordsCount = 0;
    let factsCount = 0;

    for (const row of guestLogs.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_GUEST_LOG,
        row,
        this.buildRawRecordFromGuestLog(context, row),
        normalizationRunId,
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of sessions.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_GUEST_SESSION,
        row,
        this.buildRawRecordFromSession(context, row),
        normalizationRunId,
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of transactions.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_TRANSACTION,
        row,
        this.buildRawRecordFromTransaction(context, row),
        normalizationRunId,
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of productExpenses.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_PRODUCT_EXPENSE,
        row,
        this.buildRawRecordFromProductExpense(
          context,
          row,
          productNamesByClub,
          productCategoriesByClub,
        ),
        normalizationRunId,
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    for (const row of balanceTopups.rows) {
      const persisted = await this.persistRow(
        context,
        SOURCE_BALANCE_TOPUP,
        row,
        this.buildRawRecordFromBalanceTopup(context, row),
        normalizationRunId,
      );
      rawRecordsCount += persisted.rawRecordCreated ? 1 : 0;
      factsCount += persisted.factsCreated;
    }

    const inferredPackageUsageFacts =
      await this.inferPackageSubscriptionUsageFacts(
        context,
        window,
        normalizationRunId,
      );
    factsCount += inferredPackageUsageFacts;

    const sourceResults = {
      guestLogs: sourceResultDiagnostics(guestLogs),
      sessions: sourceResultDiagnostics(sessions),
      transactions: sourceResultDiagnostics(transactions),
      productExpenses: sourceResultDiagnostics(productExpenses),
      balanceTopups: sourceResultDiagnostics(balanceTopups),
    };
    const failedSources = Object.values(sourceResults).filter(
      (result) => result.status === 'FAILED',
    );
    const failureClasses = failedSources
      .map((source) =>
        classifyGuestActivitySyncFailure(source.errorMessage ?? ''),
      )
      .filter((value, index, values) => values.indexOf(value) === index);
    const staleBinding = failureClasses.includes('STALE_EXTERNAL_GUEST');
    const partial = Object.values(sourceResults).some(
      (result) => result.status !== 'SUCCESS',
    );

    if (
      failedSources.length === Object.keys(sourceResults).length &&
      !staleBinding
    ) {
      throw new Error(
        `All Langame activity sources failed: ${failedSources
          .map((source) => source.errorMessage)
          .filter(Boolean)
          .join('; ')}`,
      );
    }

    return {
      rawRecordsCount,
      factsCount,
      sourceCounts,
      sourceResults,
      inferredPackageUsageFacts,
      partial,
      staleBinding,
      failureClass: staleBinding
        ? ('STALE_EXTERNAL_GUEST' as const)
        : (failureClasses[0] ?? null),
      errorMessage:
        failedSources
          .map((source) => source.errorMessage)
          .find((message): message is string => Boolean(message)) ?? null,
    };
  }

  private async inferPackageSubscriptionUsageFacts(
    context: LedgerSyncContext,
    window: SyncWindow,
    normalizationRunId: string,
  ) {
    const sessionSignals = await this.prisma.guestActivityRawRecord.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        sourceKind: SOURCE_GUEST_LOG,
        rawType: { in: ['start_session_on', 'expand_session_on'] },
        happenedAt: {
          gte: window.from,
          lte: window.to,
        },
      },
      orderBy: { happenedAt: 'asc' },
      select: {
        id: true,
        sourceHash: true,
        sourceExternalId: true,
        rawType: true,
        rawText: true,
        happenedAt: true,
        sourceLocalDate: true,
        externalClubId: true,
        storeId: true,
        sessionExternalId: true,
      },
    });

    if (sessionSignals.length === 0) {
      return 0;
    }

    const purchaseFacts = await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        factType: 'PACKAGE_OR_SUBSCRIPTION_PURCHASED',
        lifecycleStatus: 'ACTIVE',
        happenedAt: {
          gte: subtractDays(window.from, INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS),
          lte: window.to,
        },
      },
      orderBy: { happenedAt: 'desc' },
      select: {
        id: true,
        happenedAt: true,
        sourceLocalDate: true,
        storeId: true,
        tariffName: true,
        tariffType: true,
        confidence: true,
        evidence: true,
      },
    });

    const nearbyRawSignals = await this.prisma.guestActivityRawRecord.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        happenedAt: {
          gte: new Date(
            window.from.getTime() - INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS,
          ),
          lte: new Date(
            window.to.getTime() + INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS,
          ),
        },
        OR: [
          { sourceKind: SOURCE_TRANSACTION },
          {
            sourceKind: SOURCE_GUEST_LOG,
            rawType: {
              in: [
                'success_subscription_buy_log',
                'widrawed_rubbles_and_bonuses',
              ],
            },
          },
        ],
      },
      orderBy: { happenedAt: 'asc' },
      select: {
        id: true,
        sourceKind: true,
        rawType: true,
        rawText: true,
        happenedAt: true,
        storeId: true,
        amount: true,
        bonusAmount: true,
      },
    });

    let factsCreated = 0;

    for (const signal of sessionSignals) {
      if (!signal.happenedAt) {
        continue;
      }

      const purchase = purchaseFacts.find(
        (fact) =>
          Boolean(fact.happenedAt) &&
          fact.happenedAt!.getTime() <= signal.happenedAt!.getTime() &&
          signal.happenedAt!.getTime() - fact.happenedAt!.getTime() <=
            INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000 &&
          storesMatchOrUnknown(fact.storeId, signal.storeId),
      );
      const nearbyRawSignal = nearbyRawSignals.find((raw) =>
        isPackageUsageRawSignalNearSession(raw, signal),
      );

      if (!purchase && !nearbyRawSignal) {
        continue;
      }

      const beforeFact = await this.prisma.guestActivityFact.findUnique({
        where: {
          tenantId_factType_sourceHash_parserVersion: {
            tenantId: context.tenantId,
            factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
            sourceHash: signal.sourceHash,
            parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          },
        },
        select: { id: true },
      });

      await this.prisma.guestActivityFact.upsert({
        where: {
          tenantId_factType_sourceHash_parserVersion: {
            tenantId: context.tenantId,
            factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
            sourceHash: signal.sourceHash,
            parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          },
        },
        create: {
          tenantId: context.tenantId,
          rawRecordId: signal.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: signal.storeId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
          externalClubId: signal.externalClubId,
          sourceKind: SOURCE_GUEST_LOG,
          sourceHash: signal.sourceHash,
          sourceExternalId: signal.sourceExternalId,
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          happenedAt: signal.happenedAt,
          sourceLocalDate: signal.sourceLocalDate,
          sessionExternalId: signal.sessionExternalId,
          tariffName: purchase?.tariffName ?? null,
          tariffType: 'package_or_subscription',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'INFERRED',
          parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          normalizationRunId,
          lifecycleStatus: 'ACTIVE',
          evidence: buildInferredPackageUsageEvidence(
            signal,
            purchase,
            nearbyRawSignal,
          ),
        },
        update: {
          rawRecordId: signal.id,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: signal.storeId,
          happenedAt: signal.happenedAt,
          sourceLocalDate: signal.sourceLocalDate,
          sessionExternalId: signal.sessionExternalId,
          sourceExternalId: signal.sourceExternalId,
          tariffName: purchase?.tariffName ?? null,
          tariffType: 'package_or_subscription',
          confidence: 'INFERRED',
          normalizationRunId,
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          evidence: buildInferredPackageUsageEvidence(
            signal,
            purchase,
            nearbyRawSignal,
          ),
        },
      });

      await this.prisma.guestActivityRawRecord.update({
        where: { id: signal.id },
        data: { parseStatus: 'FACTS_CREATED' },
      });

      if (!beforeFact) {
        factsCreated += 1;
      }
    }

    return factsCreated;
  }

  private async fetchSourceRows<T>(
    context: LedgerSyncContext,
    sourceKind: string,
    fallbackWindow: SyncWindow,
    loadPage: (page: number, dateFrom: string, dateTo: string) => Promise<T[]>,
    filterRow: (row: T) => boolean,
  ): Promise<SourceFetchResult<T>> {
    const window = await this.resolveSourceSyncWindow(
      context,
      sourceKind,
      fallbackWindow,
    );

    await this.upsertSourceSyncState(context, sourceKind, window, {
      status: 'RUNNING',
      pagesFetched: 0,
      rowsFetched: 0,
      rowsMatched: 0,
      nextPage: window.startPage,
      errorMessage: null,
    });

    try {
      const result = await this.fetchPaged(
        (page) =>
          loadPage(
            page,
            formatDateParam(window.from),
            formatDateParam(window.to),
          ),
        filterRow,
        window.startPage,
      );
      const status = result.partial ? 'PARTIAL' : 'SUCCESS';

      await this.upsertSourceSyncState(context, sourceKind, window, {
        status,
        pagesFetched: result.pagesFetched,
        rowsFetched: result.rowsFetched,
        rowsMatched: result.rows.length,
        nextPage: result.nextPage,
        errorMessage: null,
      });

      return {
        ...result,
        status,
        window,
        errorMessage: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.upsertSourceSyncState(context, sourceKind, window, {
        status: 'FAILED',
        pagesFetched: 0,
        rowsFetched: 0,
        rowsMatched: 0,
        nextPage: null,
        errorMessage,
      });
      this.logger.warn(
        `Langame activity source ${sourceKind} failed for profile ${context.profile.id}: ${errorMessage}`,
      );

      return {
        rows: [],
        partial: true,
        status: 'FAILED',
        pagesFetched: 0,
        rowsFetched: 0,
        nextPage: null,
        window,
        errorMessage,
      };
    }
  }

  private async resolveSourceSyncWindow(
    context: LedgerSyncContext,
    sourceKind: string,
    fallbackWindow: SyncWindow,
  ): Promise<SourceSyncWindow> {
    const state = await this.prisma.guestActivitySourceSyncState.findUnique({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId_sourceKind: {
          tenantId: context.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
          sourceKind,
        },
      },
    });

    if (
      state?.status === 'PARTIAL' &&
      state.nextPage &&
      state.lastRequestedFrom &&
      state.lastRequestedTo
    ) {
      return {
        from: state.lastRequestedFrom,
        to: state.lastRequestedTo,
        initial: !state.lastSuccessfulTo,
        earliestRuleAt: state.syncFrom,
        startPage: state.nextPage,
      };
    }

    if (state?.lastSuccessfulTo) {
      return {
        from: subtractDays(state.lastSuccessfulTo, SYNC_OVERLAP_DAYS),
        to: fallbackWindow.to,
        initial: false,
        earliestRuleAt: state.syncFrom,
        startPage: 1,
      };
    }

    return { ...fallbackWindow, startPage: 1 };
  }

  private async upsertSourceSyncState(
    context: LedgerSyncContext,
    sourceKind: string,
    window: SourceSyncWindow,
    params: {
      status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
      pagesFetched: number;
      rowsFetched: number;
      rowsMatched: number;
      nextPage: number | null;
      errorMessage: string | null;
    },
  ) {
    const now = new Date();
    const identity = {
      tenantId: context.tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      sourceKind,
    };
    const data = {
      guestId: context.guest?.id ?? null,
      profileId: context.profile.id,
      storeId: context.store?.id ?? null,
      integrationSourceId: context.source.id,
      status: params.status,
      syncFrom: window.earliestRuleAt ?? window.from,
      lastRequestedFrom: window.from,
      lastRequestedTo: window.to,
      ...(params.status === 'SUCCESS' ? { lastSuccessfulTo: window.to } : {}),
      ...(params.status === 'RUNNING' ? { lastStartedAt: now } : {}),
      lastFinishedAt: params.status === 'RUNNING' ? null : now,
      lastPage:
        params.pagesFetched > 0
          ? window.startPage + params.pagesFetched - 1
          : null,
      nextPage: params.nextPage,
      rowsFetched: params.rowsFetched,
      rowsMatched: params.rowsMatched,
      diagnostics: {
        startPage: window.startPage,
        partial: params.status === 'PARTIAL',
      },
      errorMessage: params.errorMessage,
    };

    await this.prisma.guestActivitySourceSyncState.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId_sourceKind:
          identity,
      },
      create: { ...identity, ...data },
      update: data,
    });
  }

  private async fetchPaged<T>(
    loadPage: (page: number) => Promise<T[]>,
    filterRow: (row: T) => boolean,
    startPage = 1,
  ) {
    const rows: T[] = [];
    let pagesFetched = 0;
    let rowsFetched = 0;

    for (
      let page = startPage;
      page < startPage + MAX_SYNC_PAGES_PER_SOURCE;
      page += 1
    ) {
      const pageRows = await loadPage(page);
      pagesFetched += 1;
      rowsFetched += pageRows.length;
      rows.push(...pageRows.filter(filterRow));

      if (pageRows.length < DEFAULT_PAGE_LIMIT) {
        return {
          rows,
          partial: false,
          pagesFetched,
          rowsFetched,
          nextPage: null,
        };
      }
    }

    return {
      rows,
      partial: true,
      pagesFetched,
      rowsFetched,
      nextPage: startPage + pagesFetched,
    };
  }

  private buildRawRecordFromGuestLog(
    context: LedgerSyncContext,
    row: LangameGuestLog,
  ): RawRecordDraft {
    const hashPayload = sanitizePayload(row);
    const payload = sanitizeGuestActivityRawPayload(row);
    const sourceText = extractText(row);
    const text = sanitizeGuestActivityText(sourceText);
    const happenedAt = parseLangameDate(
      firstString(row.date, row.date_normal, row.created_at, row.created),
      context.timeZone,
    );
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const rawType = nullableString(row.type);
    const amount = firstNumber(row.sum, row.amount, row.balance);
    const bonusAmount = firstNumber(row.bonus_balance, row.bonus, row.bonuses);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_GUEST_LOG,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      rawType,
      text: sourceText,
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      amount,
      bonusAmount,
      payload: hashPayload,
    });

    return {
      sourceKind: SOURCE_GUEST_LOG,
      sourceKey: `${SOURCE_GUEST_LOG}:${context.externalGuestId}:${sourceHash.slice(
        0,
        16,
      )}`,
      sourceHash,
      sourceExternalId: firstString(row.id, row.UUID),
      rawType,
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromSession(
    context: LedgerSyncContext,
    row: LangameGuestSession,
  ): RawRecordDraft {
    const hashPayload = sanitizePayload(row);
    const payload = sanitizeGuestActivityRawPayload(row);
    const startedAt = parseLangameDate(row.date_start, context.timeZone);
    const stoppedAt = parseLangameDate(row.date_stop, context.timeZone);
    const happenedAt = startedAt ?? stoppedAt;
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_GUEST_SESSION,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      externalSessionId: firstString(row.id, row.UUID),
      startedAt: startedAt?.toISOString() ?? null,
      stoppedAt: stoppedAt?.toISOString() ?? null,
      externalClubId,
      payload: hashPayload,
    });

    return {
      sourceKind: SOURCE_GUEST_SESSION,
      sourceKey: `${SOURCE_GUEST_SESSION}:${context.externalGuestId}:${sourceHash.slice(
        0,
        16,
      )}`,
      sourceHash,
      sourceExternalId: firstString(row.id, row.UUID),
      rawType: nullableString(row.packet) ? 'SESSION' : null,
      rawText: sanitizeGuestActivityText(extractText(row)),
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.id, row.UUID),
      amount: null,
      bonusAmount: null,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromTransaction(
    context: LedgerSyncContext,
    row: LangameTransaction,
  ): RawRecordDraft {
    const hashPayload = sanitizePayload(row);
    const payload = sanitizeGuestActivityRawPayload(row);
    const sourceText = extractText(row);
    const text = sanitizeGuestActivityText(sourceText);
    const happenedAt = parseLangameDate(
      firstString(
        row.date_normal,
        row.date,
        row.date_insert,
        row.date_update,
        row.created_at,
        row.created,
        row.time,
        row.datetime,
      ),
      context.timeZone,
    );
    const externalClubId = firstString(row.club_id, row.list_clubs_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const amount = firstNumber(row.sum, row.amount, row.balance);
    const bonusAmount = firstNumber(row.bonus_balance);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_TRANSACTION,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      transactionId: firstString(row.id),
      rawType: nullableString(row.type),
      text: sourceText,
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      payload: hashPayload,
    });

    return {
      sourceKind: SOURCE_TRANSACTION,
      sourceKey: `${SOURCE_TRANSACTION}:${
        firstString(row.id) ?? context.externalGuestId
      }:${sourceHash.slice(0, 16)}`,
      sourceHash,
      sourceExternalId: firstString(row.id, row.UUID),
      rawType: nullableString(row.type),
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount,
      bonusAmount,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromProductExpense(
    context: LedgerSyncContext,
    row: LangameProductExpense,
    productNamesByClub: ProductNamesByClub,
    productCategoriesByClub: ProductCategoriesByClub,
  ): RawRecordDraft {
    const externalClubId = firstString(row.list_clubs_id, row.club_id);
    const storeId = this.resolveStoreId(context, externalClubId);
    const productId = firstString(
      row.list_goods_id,
      row.goods_id,
      row.good_id,
      row.product_id,
    );
    const productName =
      firstString(row.name, row.good_name, row.goods_name, row.product_name) ??
      resolveProductName(productNamesByClub, externalClubId, productId);
    const productCategory =
      externalClubId && productId
        ? (productCategoriesByClub.get(externalClubId)?.get(productId) ?? null)
        : null;
    const quantity = firstNumber(row.count, row.quantity, row.qty);
    const unitPrice = firstNumber(row.price_sale, row.price, row.unit_price);
    const totalAmount =
      firstNumber(row.total, row.sum, row.amount) ??
      (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);
    const hashPayload = sanitizePayload({
      ...row,
      product_name_resolved: productName,
    });
    const payload = sanitizeGuestActivityRawPayload({
      ...row,
      product_name_resolved: productName,
      category_id: productCategory?.categoryId ?? null,
      category_name: productCategory?.categoryName ?? null,
      external_category_key: productCategory?.externalCategoryKey ?? null,
      external_category_id: productCategory?.externalCategoryId ?? null,
      external_category_name: productCategory?.externalCategoryName ?? null,
    });
    const happenedAt = parseLangameDate(
      firstString(
        row.date,
        row.date_normal,
        row.date_insert,
        row.created_at,
        row.created,
        row.time,
        row.datetime,
      ),
      context.timeZone,
    );
    const text = productName ?? extractText(row);
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_PRODUCT_EXPENSE,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      expenseId: firstString(row.id),
      happenedAt: happenedAt?.toISOString() ?? null,
      externalClubId,
      productId,
      productName,
      quantity,
      unitPrice,
      totalAmount,
      canceled: isTruthyLangameFlag(row.cancel),
      payload: hashPayload,
    });

    return {
      sourceKind: SOURCE_PRODUCT_EXPENSE,
      sourceKey: `${SOURCE_PRODUCT_EXPENSE}:${
        firstString(row.id) ?? context.externalGuestId
      }:${sourceHash.slice(0, 16)}`,
      sourceHash,
      sourceExternalId: firstString(row.id),
      rawType: 'PRODUCT_PURCHASE',
      rawText: text,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId,
      storeId,
      sessionExternalId: firstString(row.session_id, row.UUID),
      amount: totalAmount,
      bonusAmount: null,
      rawPayload: payload,
    };
  }

  private buildRawRecordFromBalanceTopup(
    context: LedgerSyncContext,
    row: LangameBalanceTopup,
  ): RawRecordDraft {
    const operationId = firstString(row.id);
    const amount = firstNumber(row.amount);
    const happenedAt = parseLangameDate(
      firstString(row.date),
      context.timeZone,
    );
    const safePayload = {
      id: row.id,
      guest_id: row.guest_id,
      amount: row.amount,
      date: row.date,
    };
    const sourceHash = buildSourceHash({
      sourceKind: SOURCE_BALANCE_TOPUP,
      externalDomain: context.externalDomain,
      externalGuestId: context.externalGuestId,
      operationId,
      amount,
      happenedAt: happenedAt?.toISOString() ?? null,
      payload: safePayload,
    });

    return {
      sourceKind: SOURCE_BALANCE_TOPUP,
      sourceKey: `${SOURCE_BALANCE_TOPUP}:${
        operationId ?? context.externalGuestId
      }:${sourceHash.slice(0, 16)}`,
      sourceHash,
      sourceExternalId: operationId,
      rawType: 'BALANCE_TOPUP',
      rawText:
        amount === null
          ? 'Пополнение баланса'
          : `Пополнение баланса на ${amount} ₽`,
      happenedAt,
      sourceLocalDate: sourceLocalDate(happenedAt, context.timeZone),
      externalClubId: null,
      storeId: null,
      sessionExternalId: null,
      amount,
      bonusAmount: null,
      rawPayload: sanitizeGuestActivityRawPayload(safePayload),
    };
  }

  private async persistRow(
    context: LedgerSyncContext,
    sourceKind: string,
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    normalizationRunId: string,
  ) {
    const before = await this.prisma.guestActivityRawRecord.findUnique({
      where: {
        tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
          tenantId: context.tenantId,
          sourceKind,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          sourceHash: raw.sourceHash,
        },
      },
      select: { id: true },
    });
    const rawRecord = await this.prisma.guestActivityRawRecord.upsert({
      where: {
        tenantId_sourceKind_externalProvider_externalDomain_sourceHash: {
          tenantId: context.tenantId,
          sourceKind,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          sourceHash: raw.sourceHash,
        },
      },
      create: {
        tenantId: context.tenantId,
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: raw.storeId,
        integrationSourceId: context.source.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        externalGuestId: context.externalGuestId,
        externalClubId: raw.externalClubId,
        sourceKind,
        sourceKey: raw.sourceKey,
        sourceHash: raw.sourceHash,
        sourceExternalId: raw.sourceExternalId,
        rawType: raw.rawType,
        rawText: raw.rawText,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        sessionExternalId: raw.sessionExternalId,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        rawPayload: raw.rawPayload,
      },
      update: {
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: raw.storeId,
        integrationSourceId: context.source.id,
        sourceExternalId: raw.sourceExternalId,
        rawType: raw.rawType,
        rawText: raw.rawText,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        sessionExternalId: raw.sessionExternalId,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        rawPayload: raw.rawPayload,
      },
      select: { id: true },
    });
    const factsCreated = await this.persistNormalizedFacts(
      context,
      rawRecord.id,
      sourceKind,
      row,
      raw,
      normalizationRunId,
    );

    return {
      rawRecordCreated: !before,
      factsCreated,
    };
  }

  private async persistNormalizedFacts(
    context: LedgerSyncContext,
    rawRecordId: string,
    sourceKind: string,
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    normalizationRunId: string,
  ) {
    const facts = this.normalizeFacts(
      sourceKind,
      row,
      raw,
      context.timeZone,
      context.tariffTypeGroups,
    );
    let factsCreated = 0;

    for (const fact of facts) {
      const beforeFact = await this.prisma.guestActivityFact.findUnique({
        where: {
          tenantId_factType_sourceHash_parserVersion: {
            tenantId: context.tenantId,
            factType: fact.factType,
            sourceHash: raw.sourceHash,
            parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          },
        },
        select: { id: true },
      });

      const persistedFact = await this.prisma.guestActivityFact.upsert({
        where: {
          tenantId_factType_sourceHash_parserVersion: {
            tenantId: context.tenantId,
            factType: fact.factType,
            sourceHash: raw.sourceHash,
            parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          },
        },
        create: {
          tenantId: context.tenantId,
          rawRecordId,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: fact.storeId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
          externalClubId: fact.externalClubId,
          sourceKind,
          sourceHash: raw.sourceHash,
          sourceExternalId: raw.sourceExternalId,
          factType: fact.factType,
          happenedAt: fact.happenedAt,
          sourceLocalDate: fact.sourceLocalDate,
          sessionExternalId: fact.sessionExternalId,
          tariffName: fact.tariffName,
          tariffType: fact.tariffType,
          amount: fact.amount,
          bonusAmount: fact.bonusAmount,
          durationMinutes: fact.durationMinutes,
          confidence: fact.confidence,
          parserVersion: GUEST_ACTIVITY_PARSER_VERSION,
          normalizationRunId,
          lifecycleStatus: 'ACTIVE',
          evidence: fact.evidence,
        },
        update: {
          rawRecordId,
          guestId: context.guest?.id ?? null,
          profileId: context.profile.id,
          storeId: fact.storeId,
          happenedAt: fact.happenedAt,
          sourceLocalDate: fact.sourceLocalDate,
          sessionExternalId: fact.sessionExternalId,
          sourceExternalId: raw.sourceExternalId,
          tariffName: fact.tariffName,
          tariffType: fact.tariffType,
          amount: fact.amount,
          bonusAmount: fact.bonusAmount,
          durationMinutes: fact.durationMinutes,
          confidence: fact.confidence,
          normalizationRunId,
          lifecycleStatus: 'ACTIVE',
          supersededAt: null,
          evidence: fact.evidence,
        },
        select: { id: true },
      });

      if (sourceKind === SOURCE_GUEST_SESSION && fact.sessionExternalId) {
        await this.reconcileSessionFactVersions(
          context,
          fact.factType,
          fact.sessionExternalId,
          persistedFact.id,
        );
      }

      if (!beforeFact) {
        factsCreated += 1;
      }
    }

    const activeFactTypes = facts.map((fact) => fact.factType);
    await this.prisma.guestActivityFact.updateMany({
      where: {
        tenantId: context.tenantId,
        rawRecordId,
        lifecycleStatus: 'ACTIVE',
        OR: [
          { parserVersion: { not: GUEST_ACTIVITY_PARSER_VERSION } },
          ...(activeFactTypes.length > 0
            ? [{ factType: { notIn: activeFactTypes } }]
            : [{}]),
        ],
      },
      data: {
        lifecycleStatus: 'SUPERSEDED',
        supersededAt: new Date(),
      },
    });

    await this.prisma.guestActivityRawRecord.update({
      where: { id: rawRecordId },
      data: { parseStatus: facts.length > 0 ? 'FACTS_CREATED' : 'NO_FACTS' },
    });

    return factsCreated;
  }

  private async reconcileSessionFactVersions(
    context: LedgerSyncContext,
    factType: GuestActivityFactType,
    sessionExternalId: string,
    persistedFactId: string,
  ) {
    const stableIdentity = {
      tenantId: context.tenantId,
      profileId: context.profile.id,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: context.externalDomain,
      sourceKind: SOURCE_GUEST_SESSION,
      factType,
      sessionExternalId,
    } satisfies Prisma.GuestActivityFactWhereInput;
    const versions = await this.prisma.guestActivityFact.findMany({
      where: stableIdentity,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const activeVersionId = versions[0]?.id ?? persistedFactId;
    const supersededAt = new Date();

    await this.prisma.guestActivityFact.updateMany({
      where: {
        ...stableIdentity,
        id: { not: activeVersionId },
        lifecycleStatus: 'ACTIVE',
      },
      data: {
        lifecycleStatus: 'SUPERSEDED',
        supersededAt,
      },
    });
    await this.prisma.guestActivityFact.updateMany({
      where: { id: activeVersionId },
      data: {
        lifecycleStatus: 'ACTIVE',
        supersededAt: null,
      },
    });
  }

  private async reconcileHistoricalSessionFactVersions(
    context: LedgerSyncContext,
  ) {
    const versions = await this.prisma.guestActivityFact.findMany({
      where: {
        tenantId: context.tenantId,
        profileId: context.profile.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        sourceKind: SOURCE_GUEST_SESSION,
      },
      select: {
        id: true,
        factType: true,
        sessionExternalId: true,
        createdAt: true,
        lifecycleStatus: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const groups = new Map<string, typeof versions>();

    for (const version of versions) {
      if (!version.sessionExternalId) {
        continue;
      }
      const key = `${version.factType}:${version.sessionExternalId}`;
      const group = groups.get(key) ?? [];
      group.push(version);
      groups.set(key, group);
    }

    const supersededAt = new Date();
    for (const group of groups.values()) {
      if (group.length < 2) {
        continue;
      }
      const activeVersionId = group[0].id;
      const staleActiveIds = group
        .slice(1)
        .filter((version) => version.lifecycleStatus === 'ACTIVE')
        .map((version) => version.id);
      if (staleActiveIds.length > 0) {
        await this.prisma.guestActivityFact.updateMany({
          where: { id: { in: staleActiveIds } },
          data: {
            lifecycleStatus: 'SUPERSEDED',
            supersededAt,
          },
        });
      }
      if (group[0].lifecycleStatus !== 'ACTIVE') {
        await this.prisma.guestActivityFact.updateMany({
          where: { id: activeVersionId },
          data: {
            lifecycleStatus: 'ACTIVE',
            supersededAt: null,
          },
        });
      }
    }
  }

  private normalizeFacts(
    sourceKind: string,
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    timeZone: string,
    tariffTypeGroups: LangameTariffTypeGroupIndex,
  ): FactDraft[] {
    if (sourceKind === SOURCE_GUEST_SESSION) {
      return this.normalizeSessionFacts(row, raw, timeZone, tariffTypeGroups);
    }

    if (sourceKind === SOURCE_PRODUCT_EXPENSE) {
      return this.normalizeProductExpenseFacts(row, raw);
    }

    if (sourceKind === SOURCE_BALANCE_TOPUP) {
      return this.normalizeBalanceTopupFacts(row, raw);
    }

    const text = normalizeSearchText(raw.rawText);
    const tariffName = extractTariffName(raw.rawText);
    const durationMinutes = extractDurationMinutes(raw.rawText);
    const facts: FactDraft[] = [];
    const addTextFact = (
      factType: GuestActivityFactType,
      tariffType: string | null = null,
      confidence: GuestActivityConfidence = 'TEXT_MATCH',
    ) => {
      facts.push({
        factType,
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId: raw.sessionExternalId,
        tariffName,
        tariffType,
        amount: raw.amount,
        bonusAmount: raw.bonusAmount,
        durationMinutes,
        confidence,
        evidence: {
          text: raw.rawText,
          sourceKind,
        },
      });
    };

    const hasSessionStart =
      /старт\s+сесс|начал[аи]?\s+сесс|session\s+start|start\s+session/.test(
        text,
      );
    const hasSessionEnd =
      /завершени[ея]\s+сесс|конец\s+сесс|session\s+(end|stop)|stop\s+session/.test(
        text,
      );
    const hasSessionExtend = /продлени[ея]\s+сесс|extend|extension/.test(text);
    const hasPurchase = /покупк|купил|куплен|purchase|buy/.test(text);
    const hasWriteOff = /списан|списано|write[- ]?off|withdraw|debit/.test(
      text,
    );
    const hasBonusTopup = /пополнени|начислен|bonus|бонус/.test(text);
    const hasReward = /награда|лутбокс|квест|задани|reward|loot/.test(text);
    const packageLike = isPackageOrSubscriptionText(text);

    if (hasSessionStart) {
      addTextFact('SESSION_STARTED');

      if (packageLike) {
        addTextFact('PACKAGE_OR_SUBSCRIPTION_USED', 'package_or_subscription');
      } else {
        addTextFact('HOURLY_SESSION_STARTED', 'hourly', 'INFERRED');
      }
    }

    if (hasSessionExtend && packageLike) {
      addTextFact('PACKAGE_OR_SUBSCRIPTION_USED', 'package_or_subscription');
    }

    if (hasSessionEnd) {
      addTextFact('SESSION_ENDED');
    }

    if (hasPurchase && packageLike) {
      addTextFact(
        'PACKAGE_OR_SUBSCRIPTION_PURCHASED',
        'package_or_subscription',
      );
    }

    if (hasWriteOff) {
      addTextFact('BALANCE_WRITE_OFF', null, 'TEXT_MATCH');
    }

    if (hasBonusTopup && !hasWriteOff) {
      addTextFact('BONUS_TOPUP', null, 'TEXT_MATCH');
    }

    if (hasReward) {
      addTextFact('REWARD_TRACE', null, 'TEXT_MATCH');
    }

    return facts;
  }

  private normalizeProductExpenseFacts(
    row: Record<string, unknown>,
    raw: RawRecordDraft,
  ): FactDraft[] {
    if (isTruthyLangameFlag(row.cancel)) {
      return [];
    }

    const productId = firstString(
      row.list_goods_id,
      row.goods_id,
      row.good_id,
      row.product_id,
    );
    const productName = firstString(
      row.product_name_resolved,
      row.name,
      row.good_name,
      row.goods_name,
      row.product_name,
      raw.rawText,
    );
    const quantity = firstNumber(row.count, row.quantity, row.qty);
    const unitPrice = firstNumber(row.price_sale, row.price, row.unit_price);
    if (
      quantity === null ||
      quantity <= 0 ||
      raw.amount === null ||
      raw.amount <= 0
    ) {
      return [];
    }
    const rawPayload =
      raw.rawPayload &&
      typeof raw.rawPayload === 'object' &&
      !Array.isArray(raw.rawPayload)
        ? (raw.rawPayload as Record<string, unknown>)
        : {};

    return [
      {
        factType: 'PRODUCT_PURCHASED',
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId: raw.sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: raw.amount,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: sanitizeGuestActivityEvidencePayload({
          sourceKind: SOURCE_PRODUCT_EXPENSE,
          productId,
          productName,
          quantity,
          unitPrice,
          totalAmount: raw.amount,
          categoryId: firstString(rawPayload.category_id),
          categoryName: firstString(rawPayload.category_name),
          externalCategoryKey: firstString(rawPayload.external_category_key),
          externalCategoryId: firstString(rawPayload.external_category_id),
          externalCategoryName: firstString(rawPayload.external_category_name),
        }),
      },
    ];
  }

  private normalizeBalanceTopupFacts(
    row: Record<string, unknown>,
    raw: RawRecordDraft,
  ): FactDraft[] {
    const operationId = firstString(row.id);
    if (
      !operationId ||
      !raw.happenedAt ||
      raw.amount === null ||
      raw.amount <= 0
    ) {
      return [];
    }

    return [
      {
        factType: 'BALANCE_TOPUP',
        happenedAt: raw.happenedAt,
        sourceLocalDate: raw.sourceLocalDate,
        externalClubId: null,
        storeId: null,
        sessionExternalId: null,
        tariffName: null,
        tariffType: null,
        amount: raw.amount,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: sanitizeGuestActivityEvidencePayload({
          sourceKind: SOURCE_BALANCE_TOPUP,
          operationId,
          amount: raw.amount,
          scope: 'LANGAME_DOMAIN',
        }),
      },
    ];
  }
  private normalizeSessionFacts(
    row: Record<string, unknown>,
    raw: RawRecordDraft,
    timeZone: string,
    tariffTypeGroups: LangameTariffTypeGroupIndex,
  ): FactDraft[] {
    const facts: FactDraft[] = [];
    const startedAt = parseLangameDate(firstString(row.date_start), timeZone);
    const stoppedAt = parseLangameDate(firstString(row.date_stop), timeZone);
    const sessionExternalId = firstString(row.id, row.UUID);
    const tariff = resolveLangameSessionTariff(row.packet, tariffTypeGroups);
    const playedMinutes = playedDurationMinutes(startedAt, stoppedAt);

    if (startedAt) {
      facts.push({
        factType: 'SESSION_STARTED',
        happenedAt: startedAt,
        sourceLocalDate: sourceLocalDate(startedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: null,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: { sourceKind: SOURCE_GUEST_SESSION },
      });
      if (tariff.kind === 'package_or_subscription') {
        facts.push({
          factType: 'PACKAGE_OR_SUBSCRIPTION_USED',
          happenedAt: startedAt,
          sourceLocalDate: sourceLocalDate(startedAt, timeZone),
          externalClubId: raw.externalClubId,
          storeId: raw.storeId,
          sessionExternalId,
          tariffName: null,
          tariffType: 'package_or_subscription',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'EXACT',
          evidence: sanitizeGuestActivityEvidencePayload({
            sourceKind: SOURCE_GUEST_SESSION,
            packet: row.packet,
            tariffGroupId: tariff.tariffGroupId,
            tariffType: tariff.tariffType,
            tariffName: tariff.tariffName,
          }),
        });
      } else if (tariff.kind === 'hourly') {
        facts.push({
          factType: 'HOURLY_SESSION_STARTED',
          happenedAt: startedAt,
          sourceLocalDate: sourceLocalDate(startedAt, timeZone),
          externalClubId: raw.externalClubId,
          storeId: raw.storeId,
          sessionExternalId,
          tariffName: null,
          tariffType: 'hourly',
          amount: null,
          bonusAmount: null,
          durationMinutes: null,
          confidence: 'EXACT',
          evidence: sanitizeGuestActivityEvidencePayload({
            sourceKind: SOURCE_GUEST_SESSION,
            packet: row.packet,
            tariffGroupId: tariff.tariffGroupId,
            tariffType: tariff.tariffType,
            tariffName: tariff.tariffName,
          }),
        });
      }
    }

    if (stoppedAt) {
      facts.push({
        factType: 'SESSION_ENDED',
        happenedAt: stoppedAt,
        sourceLocalDate: sourceLocalDate(stoppedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType: null,
        amount: null,
        bonusAmount: null,
        durationMinutes: null,
        confidence: 'EXACT',
        evidence: { sourceKind: SOURCE_GUEST_SESSION },
      });
    }

    if (playedMinutes !== null && tariff.kind !== 'unknown') {
      const packageOrSubscription = tariff.kind === 'package_or_subscription';
      const playTimeFactType: GuestActivityFactType = packageOrSubscription
        ? 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED'
        : 'HOURLY_PLAY_TIME_ACCUMULATED';
      const tariffType = packageOrSubscription
        ? 'package_or_subscription'
        : 'hourly';

      facts.push({
        factType: playTimeFactType,
        happenedAt: stoppedAt,
        sourceLocalDate: sourceLocalDate(stoppedAt, timeZone),
        externalClubId: raw.externalClubId,
        storeId: raw.storeId,
        sessionExternalId,
        tariffName: null,
        tariffType,
        amount: null,
        bonusAmount: null,
        durationMinutes: playedMinutes,
        confidence: 'EXACT',
        evidence: sanitizeGuestActivityEvidencePayload({
          sourceKind: SOURCE_GUEST_SESSION,
          startedAt: startedAt?.toISOString() ?? null,
          stoppedAt: stoppedAt?.toISOString() ?? null,
          packet: row.packet,
          tariffGroupId: tariff.tariffGroupId,
          tariffTypeGroup: tariff.tariffType,
          tariffName: tariff.tariffName,
          calculation: 'date_stop - date_start',
        }),
      });
    }

    return facts;
  }

  private async resolvePotentialMatches(
    tenantId: string,
    storeId: string | null,
    factTypes: string[],
  ) {
    const factTypeSet = new Set(factTypes);
    const [lootBoxes, missions, seasons] = await Promise.all([
      this.prisma.guestGameLootBox.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          triggerKind: true,
          sessionType: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guestGameMission.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          triggerKind: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.guestGameSeason.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          status: true,
          storeIds: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return [
      ...lootBoxes
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = relevantFactsForRule(
            rule.triggerKind,
            rule.sessionType,
          );
          return {
            ruleType: 'lootBox',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
      ...missions
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = relevantFactsForRule(rule.triggerKind);
          return {
            ruleType: 'mission',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
      ...seasons
        .filter((rule) => ruleAppliesToStore(rule.storeIds, storeId))
        .map((rule) => {
          const relevantFactTypes = [
            'SESSION_STARTED',
            'VISIT',
            'REWARD_TRACE',
          ];
          return {
            ruleType: 'battlePass',
            ruleId: rule.id,
            title: rule.name,
            status: rule.status,
            storeIds: storeIdsFromJson(rule.storeIds),
            relevantFactTypes,
            matchingFacts: relevantFactTypes.filter((type) =>
              factTypeSet.has(type),
            ).length,
          };
        }),
    ];
  }

  private async upsertSyncState(
    context: LedgerSyncContext,
    params: {
      status: GuestActivitySyncStatus;
      window: SyncWindow;
      rawRecordsCount: number;
      factsCount: number;
      diagnostics: Prisma.InputJsonValue;
      errorMessage?: string;
    },
  ) {
    await this.prisma.guestActivitySyncState.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalGuestId: {
          tenantId: context.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: context.externalDomain,
          externalGuestId: context.externalGuestId,
        },
      },
      create: {
        tenantId: context.tenantId,
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: context.store?.id ?? null,
        integrationSourceId: context.source.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: context.externalDomain,
        externalGuestId: context.externalGuestId,
        status: params.status,
        syncFrom: params.window.earliestRuleAt ?? params.window.from,
        lastRequestedFrom: params.window.from,
        lastRequestedTo: params.window.to,
        lastSuccessfulTo: params.status === 'SUCCESS' ? params.window.to : null,
        lastStartedAt: params.status === 'RUNNING' ? new Date() : null,
        lastFinishedAt: params.status === 'RUNNING' ? null : new Date(),
        rawRecordsCount: params.rawRecordsCount,
        factsCount: params.factsCount,
        diagnostics: params.diagnostics,
        errorMessage: params.errorMessage ?? null,
      },
      update: {
        guestId: context.guest?.id ?? null,
        profileId: context.profile.id,
        storeId: context.store?.id ?? null,
        integrationSourceId: context.source.id,
        status: params.status,
        syncFrom: params.window.earliestRuleAt ?? params.window.from,
        lastRequestedFrom: params.window.from,
        lastRequestedTo: params.window.to,
        lastSuccessfulTo:
          params.status === 'SUCCESS' ? params.window.to : undefined,
        lastStartedAt: params.status === 'RUNNING' ? new Date() : undefined,
        lastFinishedAt: params.status === 'RUNNING' ? null : new Date(),
        rawRecordsCount: params.rawRecordsCount,
        factsCount: params.factsCount,
        diagnostics: params.diagnostics,
        errorMessage: params.errorMessage ?? null,
      },
    });
  }

  private async fetchProductNamesByClub(
    context: LedgerSyncContext,
    rows: LangameProductExpense[],
  ): Promise<ProductNamesByClub> {
    const externalClubIds = Array.from(
      new Set(
        rows
          .map((row) => firstString(row.list_clubs_id, row.club_id))
          .filter((clubId): clubId is string => Boolean(clubId)),
      ),
    );
    const productNamesByClub: ProductNamesByClub = new Map();

    for (const externalClubId of externalClubIds) {
      const clubId = Number(externalClubId);
      if (!Number.isFinite(clubId)) {
        continue;
      }

      try {
        const goods = await this.langameClient.listGoods(
          context.source.baseUrl,
          context.apiKey,
          clubId,
        );
        productNamesByClub.set(
          externalClubId,
          new Map(
            goods
              .map(
                (good) =>
                  [firstString(good.id), nullableString(good.name)] as const,
              )
              .filter(
                (item): item is readonly [string, string] =>
                  Boolean(item[0]) && Boolean(item[1]),
              ),
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Langame goods for club ${externalClubId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return productNamesByClub;
  }

  private async fetchProductCategoriesByClub(
    context: LedgerSyncContext,
    rows: LangameProductExpense[],
  ): Promise<ProductCategoriesByClub> {
    const externalClubIds = Array.from(
      new Set(
        rows
          .map((row) => firstString(row.list_clubs_id, row.club_id))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const externalProductIds = Array.from(
      new Set(
        rows
          .map((row) =>
            firstString(
              row.list_goods_id,
              row.goods_id,
              row.good_id,
              row.product_id,
            ),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (!externalClubIds.length || !externalProductIds.length) {
      return new Map();
    }

    const configurations =
      await this.prisma.langameClubProductConfiguration.findMany({
        where: {
          tenantId: context.tenantId,
          externalDomain: context.externalDomain,
          externalClubId: { in: externalClubIds },
          externalProductId: { in: externalProductIds },
          isActive: true,
        },
        select: {
          externalClubId: true,
          externalProductId: true,
          externalGroupId: true,
          product: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });
    const groupIds = Array.from(
      new Set(
        configurations
          .map((row) => row.externalGroupId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const groups = groupIds.length
      ? await this.prisma.langameProductGroup.findMany({
          where: {
            tenantId: context.tenantId,
            externalDomain: context.externalDomain,
            externalGroupId: { in: groupIds },
          },
          select: { externalGroupId: true, name: true },
        })
      : [];
    const groupNames = new Map(
      groups.map((group) => [group.externalGroupId, group.name]),
    );
    const result: ProductCategoriesByClub = new Map();
    configurations.forEach((row) => {
      const products =
        result.get(row.externalClubId) ??
        new Map<
          string,
          {
            categoryId: string | null;
            categoryName: string | null;
            externalCategoryKey: string | null;
            externalCategoryId: string | null;
            externalCategoryName: string | null;
          }
        >();
      products.set(row.externalProductId, {
        categoryId: row.product?.category?.id ?? null,
        categoryName: row.product?.category?.name ?? null,
        externalCategoryKey: row.externalGroupId
          ? `${context.externalDomain}:${row.externalGroupId}`
          : null,
        externalCategoryId: row.externalGroupId,
        externalCategoryName: row.externalGroupId
          ? (groupNames.get(row.externalGroupId) ?? null)
          : null,
      });
      result.set(row.externalClubId, products);
    });

    return result;
  }

  private rowMatchesGuest(
    row: Record<string, unknown>,
    externalGuestId: string,
    allowMissingGuestId = false,
  ) {
    const rowGuestId = firstString(row.guest_id, row.real_guest_id);
    return allowMissingGuestId
      ? !rowGuestId || rowGuestId === externalGuestId
      : rowGuestId === externalGuestId;
  }

  private resolveStoreId(
    context: LedgerSyncContext,
    externalClubId: string | null,
  ) {
    if (!externalClubId) {
      return context.store?.id ?? null;
    }

    return (
      context.stores.find(
        (store) => nullableString(store.externalClubId) === externalClubId,
      )?.id ??
      context.store?.id ??
      null
    );
  }

  private isFreshRunningSync(status?: string | null, startedAt?: Date | null) {
    if (status !== 'RUNNING' || !startedAt) {
      return false;
    }

    return Date.now() - startedAt.getTime() < RUNNING_SYNC_STALE_MS;
  }

  private requireTenantId(user: AuthenticatedUser) {
    if (!user.tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    return user.tenantId;
  }
}

function ruleAppliesToStore(
  value: Prisma.JsonValue | null,
  storeId: string | null,
) {
  if (!storeId || value === null || value === undefined) {
    return true;
  }

  const storeIds = storeIdsFromJson(value);
  return storeIds.length === 0 || storeIds.includes(storeId);
}

function storeIdsFromJson(value: Prisma.JsonValue | null): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => primitiveString(item))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === 'object') {
    const maybeStoreIds = (value as Record<string, unknown>).storeIds;
    if (Array.isArray(maybeStoreIds)) {
      return maybeStoreIds
        .map((item) => primitiveString(item))
        .filter((item): item is string => Boolean(item));
    }
  }

  return [];
}

function relevantFactsForRule(
  triggerKind: string | null,
  sessionType?: string | null,
) {
  const trigger = normalizeSearchText(triggerKind);
  const session = normalizeSearchText(sessionType);

  if (
    trigger.includes('play_time') ||
    trigger.includes('time_played') ||
    trigger.includes('minute') ||
    trigger.includes('hour')
  ) {
    return [
      'HOURLY_PLAY_TIME_ACCUMULATED',
      'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
    ];
  }

  if (trigger.includes('session')) {
    return session.includes('package') ||
      session.includes('packet') ||
      session.includes('subscription') ||
      session.includes('abonement')
      ? ['SESSION_STARTED', 'PACKAGE_OR_SUBSCRIPTION_USED']
      : ['SESSION_STARTED', 'HOURLY_SESSION_STARTED'];
  }

  if (
    trigger.includes('balance_topup') ||
    trigger.includes('balance_top_up') ||
    trigger.includes('topup') ||
    trigger.includes('deposit')
  ) {
    return ['BALANCE_TOPUP'];
  }

  if (
    trigger.includes('product') ||
    trigger.includes('goods') ||
    trigger.includes('purchase') ||
    trigger.includes('bar') ||
    trigger.includes('assortment')
  ) {
    return ['PRODUCT_PURCHASED'];
  }

  if (trigger.includes('check')) {
    return ['CHECK_IN_PERFORMED'];
  }

  if (trigger.includes('visit') || trigger.includes('app')) {
    return trigger.includes('app') ? ['APP_OPENED'] : ['VISIT'];
  }

  return ['SESSION_STARTED', 'REWARD_TRACE'];
}

function resolveProductName(
  productNamesByClub: ProductNamesByClub,
  externalClubId: string | null,
  productId: string | null,
) {
  if (!externalClubId || !productId) {
    return null;
  }

  return productNamesByClub.get(externalClubId)?.get(productId) ?? null;
}

function jsonObjectRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return {};
  }

  return value;
}

function decimalValue(value: Prisma.Decimal | null) {
  return value === null ? null : value.toNumber();
}

function sanitizePayload(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([itemKey, item]) => [itemKey, sanitizeJson(item, itemKey)],
      ),
    );
  }

  if (typeof value === 'string' && /(phone|тел|mobile|contact)/i.test(key)) {
    return maskPossiblePhone(value);
  }

  if (typeof value === 'number' && /(phone|тел|mobile|contact)/i.test(key)) {
    return '[redacted]';
  }

  return value ?? null;
}

function maskPossiblePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) {
    return '[redacted]';
  }

  return `***${digits.slice(-4)}`;
}

const RAW_PAYLOAD_ALLOWED_KEY =
  /^(?:id|uuid|type|status|state|date(?:_normal|_insert|_update|_start|_stop)?|created(?:_at)?|updated(?:_at)?|time|datetime|start(?:ed)?_at|stop(?:ped)?_at|duration(?:_minutes)?|minutes|packet|tarif(?:f)?(?:_id|_name|_title|_type)?|session(?:_id|_type|_packet|_minutes)?|club_id|list_clubs_id|guest_id|real_guest_id|amount|sum|total|balance|bonus(?:_balance|es)?|product(?:_id|_name|_name_resolved)?|goods?(?:_id|_name)?|list_goods_id|category(?:_id|_name)?|external_category(?:_key|_id|_name)?|supplier(?:_id|_name)?|quantity|count|qty|price(?:_sale)?|unit_price|cancel|operation|source|comment|text|message|title|description|data|items|rows|result)$/i;
const RAW_PAYLOAD_SENSITIVE_KEY =
  /(?:phone|тел|mobile|contact|email|mail|fio|full.?name|first.?name|last.?name|middle.?name|passport|document|address|birth|card.?number)/i;

export function sanitizeGuestActivityRawPayload(
  value: unknown,
): Prisma.InputJsonValue {
  return sanitizeGuestActivityRawJson(value) as Prisma.InputJsonValue;
}

export function sanitizeGuestActivityEvidencePayload(
  value: unknown,
): Prisma.InputJsonValue {
  return sanitizeGuestActivityEvidenceJson(value) as Prisma.InputJsonValue;
}

export function sanitizeGuestActivityText(value: string | null) {
  if (!value) {
    return value;
  }

  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/(?:\+?\d[\s()-]*){7,}/g, (match) => maskPossiblePhone(match));
}

function sanitizeGuestActivityRawJson(value: unknown, key = ''): unknown {
  if (RAW_PAYLOAD_SENSITIVE_KEY.test(key)) {
    return typeof value === 'string'
      ? sanitizeSensitiveValue(value, key)
      : '[redacted]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((item) => sanitizeGuestActivityRawJson(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([itemKey]) =>
            RAW_PAYLOAD_ALLOWED_KEY.test(itemKey) ||
            RAW_PAYLOAD_SENSITIVE_KEY.test(itemKey),
        )
        .map(([itemKey, item]) => [
          itemKey,
          sanitizeGuestActivityRawJson(item, itemKey),
        ]),
    );
  }

  return typeof value === 'string'
    ? sanitizeGuestActivityText(value)
    : (value ?? null);
}

function sanitizeGuestActivityEvidenceJson(value: unknown, key = ''): unknown {
  if (RAW_PAYLOAD_SENSITIVE_KEY.test(key)) {
    return typeof value === 'string'
      ? sanitizeSensitiveValue(value, key)
      : '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGuestActivityEvidenceJson(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([itemKey, item]) => [
          itemKey,
          sanitizeGuestActivityEvidenceJson(item, itemKey),
        ],
      ),
    );
  }
  return typeof value === 'string'
    ? sanitizeGuestActivityText(value)
    : (value ?? null);
}

function sanitizeSensitiveValue(value: string, key: string) {
  if (/(phone|тел|mobile|contact)/i.test(key)) {
    return maskPossiblePhone(value);
  }
  return '[redacted]';
}

function extractText(row: Record<string, unknown>) {
  const preferredKeys = [
    'type',
    'comment',
    'name',
    'title',
    'description',
    'message',
    'text',
    'tariff',
    'tarif',
    'tariff_name',
    'tarif_name',
    'tariff_title',
    'tarif_title',
    'operation',
    'source',
  ];
  const parts = new Set<string>();

  for (const key of preferredKeys) {
    const value = nullableString(row[key]);
    if (value) {
      parts.add(value);
    }
  }

  for (const [key, value] of Object.entries(row)) {
    if (/(phone|тел|mobile|contact)/i.test(key)) {
      continue;
    }

    if (typeof value === 'string' && value.length <= 500) {
      parts.add(value);
    }
  }

  return Array.from(parts).join(' · ') || null;
}

function extractTariffName(text: string | null) {
  if (!text) {
    return null;
  }

  const match =
    /по\s+тарифу\s+(.+?)(?:\s+длительностью|[,.;]|$)/i.exec(text) ??
    /тариф\s+(.+?)(?:\s+длительностью|[,.;]|$)/i.exec(text);

  return match?.[1]?.trim() ?? null;
}

function extractDurationMinutes(text: string | null) {
  if (!text) {
    return null;
  }

  const match = /длительностью\s+(\d+)\s*мин/i.exec(text);
  return match ? Number(match[1]) : null;
}

function isPackageOrSubscriptionText(text: string) {
  return (
    /(абонемент|абонимент|пакет|subscription|package|membership)/.test(text) ||
    /по\s+тарифу\s+[^.]*\d+\s*час/.test(text) ||
    /\b\d+\s*час(?:ов|а)?\b/.test(text)
  );
}

function storesMatchOrUnknown(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return !left || !right || left === right;
}

function isPackageUsageRawSignalNearSession(
  raw: {
    sourceKind: string;
    rawType: string | null;
    rawText: string | null;
    happenedAt: Date | null;
    storeId: string | null;
    amount: Prisma.Decimal | number | string | null;
    bonusAmount: Prisma.Decimal | number | string | null;
  },
  session: {
    happenedAt: Date | null;
    storeId: string | null;
  },
) {
  if (!raw.happenedAt || !session.happenedAt) {
    return false;
  }

  if (!storesMatchOrUnknown(raw.storeId, session.storeId)) {
    return false;
  }

  const deltaMs = Math.abs(
    raw.happenedAt.getTime() - session.happenedAt.getTime(),
  );

  if (deltaMs > INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS) {
    return false;
  }

  const rawType = normalizeSearchText(raw.rawType);
  const rawText = normalizeSearchText(raw.rawText);

  return (
    rawType === 'success_subscription_buy_log' ||
    rawType === 'widrawed_rubbles_and_bonuses' ||
    isPackageOrSubscriptionText(rawText) ||
    isNegativeAmount(raw.amount) ||
    isNegativeAmount(raw.bonusAmount)
  );
}

function isNegativeAmount(value: Prisma.Decimal | number | string | null) {
  if (value === null || value === undefined) {
    return false;
  }

  return Number(value) < 0;
}

function buildInferredPackageUsageEvidence(
  signal: {
    id: string;
    rawType: string | null;
    rawText: string | null;
    happenedAt: Date | null;
  },
  purchase:
    | {
        id: string;
        happenedAt: Date | null;
        sourceLocalDate: string | null;
        tariffName: string | null;
        tariffType: string | null;
        confidence: string;
        evidence: Prisma.JsonValue | null;
      }
    | undefined,
  nearbyRawSignal:
    | {
        id: string;
        sourceKind: string;
        rawType: string | null;
        rawText: string | null;
        happenedAt: Date | null;
        amount: Prisma.Decimal | number | string | null;
        bonusAmount: Prisma.Decimal | number | string | null;
      }
    | undefined,
): Prisma.InputJsonValue {
  return {
    sourceKind: SOURCE_GUEST_LOG,
    inference: 'recent_package_or_subscription_signal_near_session',
    confidenceNote:
      'Langame guest logs expose start/extend technical events separately from subscription purchase events, so usage is inferred for diagnostics only.',
    sessionSignal: {
      rawRecordId: signal.id,
      rawType: signal.rawType,
      rawText: signal.rawText,
      happenedAt: signal.happenedAt?.toISOString() ?? null,
    },
    matchedPurchase: purchase
      ? {
          factId: purchase.id,
          happenedAt: purchase.happenedAt?.toISOString() ?? null,
          sourceLocalDate: purchase.sourceLocalDate,
          tariffName: purchase.tariffName,
          tariffType: purchase.tariffType,
          confidence: purchase.confidence,
        }
      : null,
    nearbySignal: nearbyRawSignal
      ? {
          rawRecordId: nearbyRawSignal.id,
          sourceKind: nearbyRawSignal.sourceKind,
          rawType: nearbyRawSignal.rawType,
          rawText: nearbyRawSignal.rawText,
          happenedAt: nearbyRawSignal.happenedAt?.toISOString() ?? null,
          amount:
            nearbyRawSignal.amount === null
              ? null
              : String(nearbyRawSignal.amount),
          bonusAmount:
            nearbyRawSignal.bonusAmount === null
              ? null
              : String(nearbyRawSignal.bonusAmount),
        }
      : null,
    lookbackDays: INFERRED_PACKAGE_USAGE_LOOKBACK_DAYS,
    signalWindowMinutes: INFERRED_PACKAGE_USAGE_SIGNAL_WINDOW_MS / 1000 / 60,
  };
}

function normalizeSearchText(value: unknown) {
  return (primitiveString(value) ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = nullableString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = primitiveString(value)?.trim() ?? '';
  return normalized ? normalized : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const normalized = primitiveString(value);
    if (!normalized) {
      continue;
    }

    const number = Number(normalized.replace(',', '.'));
    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function isTruthyLangameFlag(value: unknown) {
  return parseLangameFlag(value) === true;
}

function parseLangameFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value > 0 : null;
  }

  const normalized = primitiveString(value)?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['1', 'true', 'yes', 'y', 'да'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'нет'].includes(normalized)) {
    return false;
  }

  const numeric = Number(normalized.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric > 0 : null;
}

function playedDurationMinutes(startedAt: Date | null, stoppedAt: Date | null) {
  if (!startedAt || !stoppedAt) {
    return null;
  }

  const minutes = Math.round(
    (stoppedAt.getTime() - startedAt.getTime()) / 60000,
  );
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function primitiveString(value: unknown) {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return null;
  }
}

function buildSourceHash(payload: unknown) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sourceLocalDate(date: Date | null, timeZone: string) {
  if (!date) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sourceResultDiagnostics<T>(result: SourceFetchResult<T>) {
  return {
    status: result.status,
    pagesFetched: result.pagesFetched,
    rowsFetched: result.rowsFetched,
    rowsMatched: result.rows.length,
    nextPage: result.nextPage,
    from: result.window.from.toISOString(),
    to: result.window.to.toISOString(),
    errorMessage: result.errorMessage,
  };
}

export function classifyGuestActivitySyncFailure(
  errorMessage: string,
): GuestActivitySyncFailureClass {
  const message = errorMessage.trim().toLowerCase();

  if (
    message.includes('guest not found') ||
    (message.includes('guest_id') && message.includes('not found'))
  ) {
    return 'STALE_EXTERNAL_GUEST';
  }
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid api key') ||
    message.includes('invalid credential')
  ) {
    return 'AUTH_CONFIGURATION';
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return 'RATE_LIMITED';
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('service unavailable')
  ) {
    return 'TRANSIENT_UPSTREAM';
  }
  return 'UNKNOWN';
}

export function isRecoverableFailureClass(
  failureClass: GuestActivitySyncFailureClass,
) {
  return !['STALE_EXTERNAL_GUEST', 'AUTH_CONFIGURATION'].includes(failureClass);
}

export function isRecoverableSyncState(state: {
  status: string;
  errorMessage: string | null;
  diagnostics: unknown;
}) {
  const messages = [
    ...(state.errorMessage ? [state.errorMessage] : []),
    ...collectDiagnosticErrors(state.diagnostics),
  ];

  if (state.status === 'PARTIAL' && messages.length === 0) {
    return true;
  }
  if (!['PARTIAL', 'FAILED'].includes(state.status) || messages.length === 0) {
    return false;
  }
  return messages.every((message) =>
    isRecoverableFailureClass(classifyGuestActivitySyncFailure(message)),
  );
}

function syncStateHasStaleExternalGuest(state: {
  errorMessage: string | null;
  diagnostics: unknown;
}) {
  return [
    ...(state.errorMessage ? [state.errorMessage] : []),
    ...collectDiagnosticErrors(state.diagnostics),
  ].some(
    (message) =>
      classifyGuestActivitySyncFailure(message) === 'STALE_EXTERNAL_GUEST',
  );
}

function collectDiagnosticErrors(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDiagnosticErrors(item));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, item]) => {
      if (
        typeof item === 'string' &&
        ['error', 'errormessage', 'lasterror'].includes(key.toLowerCase())
      ) {
        return item.trim() ? [item] : [];
      }
      return collectDiagnosticErrors(item);
    },
  );
}
