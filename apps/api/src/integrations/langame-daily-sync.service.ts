import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DailyDataCoverageScope,
  DailyDataCoverageStatus,
  IntegrationProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BusinessSnapshotService,
  type BusinessSnapshotRunResult,
} from './business-snapshot.service';
import {
  GuestDataFoundationService,
  type GuestDataFoundationSyncResult,
} from './guest-data-foundation.service';
import { LangameSyncService } from './langame-sync.service';
import type { LangameSyncResult } from './langame.types';

const DEFAULT_DAILY_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_DAILY_SYNC_LOCAL_TIME = '04:30';
const DEFAULT_UTC_OFFSET_MINUTES = 5 * 60;

type DailySyncInput = {
  date?: string;
  force?: boolean;
};

type DailySyncScopeResult = {
  scope: DailyDataCoverageScope;
  status: DailyDataCoverageStatus;
  skipped: boolean;
  errorMessage: string | null;
};

type DailySyncTenantResult = {
  tenantId: string;
  slug: string;
  date: string;
  skipped: boolean;
  scopes: DailySyncScopeResult[];
};

type DailySyncResult = {
  date: string;
  force: boolean;
  tenants: number;
  results: DailySyncTenantResult[];
};

@Injectable()
export class LangameDailySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangameDailySyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly langameSyncService: LangameSyncService,
    private readonly guestDataFoundationService: GuestDataFoundationService,
    private readonly businessSnapshotService: BusinessSnapshotService,
  ) {}

  onModuleInit() {
    if (!this.isSchedulerEnabled()) {
      this.logger.log('Langame daily sync scheduler is disabled');
      return;
    }

    const intervalMs = this.getPositiveInt(
      'LANGAME_DAILY_SYNC_INTERVAL_MS',
      DEFAULT_DAILY_SYNC_INTERVAL_MS,
    );
    this.logger.log(
      `Langame daily sync scheduler is enabled with ${intervalMs}ms interval`,
    );

    void this.tick(new Date());
    this.timer = setInterval(() => void this.tick(new Date()), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runDailySync(input: DailySyncInput = {}): Promise<DailySyncResult> {
    const businessDate = input.date
      ? this.parseBusinessDateInput(input.date)
      : this.previousBusinessDate(new Date());
    const dateInput = this.toDateInputValue(businessDate);
    const force = Boolean(input.force);
    const tenants = await this.findConfiguredTenants();
    const results: DailySyncTenantResult[] = [];

    for (const tenant of tenants) {
      results.push(
        await this.runTenantDailySync({
          tenantId: tenant.id,
          slug: tenant.slug,
          businessDate,
          dateInput,
          force,
        }),
      );
    }

    return {
      date: dateInput,
      force,
      tenants: tenants.length,
      results,
    };
  }

  private async tick(now: Date) {
    if (this.isRunning || !this.isPastScheduledLocalTime(now)) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.runDailySync();
      const changed = result.results.filter((tenant) => !tenant.skipped).length;

      if (changed > 0) {
        this.logger.log(
          `Langame daily sync ${result.date}: tenants=${result.tenants}, changed=${changed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Langame daily sync failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async runTenantDailySync(input: {
    tenantId: string;
    slug: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }): Promise<DailySyncTenantResult> {
    const scopes: DailySyncScopeResult[] = [];
    let sourceFailed = false;

    const businessFactsResult = await this.runBusinessFactsScope(input);
    scopes.push(businessFactsResult);
    sourceFailed =
      sourceFailed ||
      businessFactsResult.status === DailyDataCoverageStatus.FAILED;

    const guestStaffResults = await this.runGuestAndStaffScopes(input);
    scopes.push(...guestStaffResults);
    sourceFailed =
      sourceFailed ||
      guestStaffResults.some(
        (result) => result.status === DailyDataCoverageStatus.FAILED,
      );

    const snapshotsResult = sourceFailed
      ? await this.skipBlockedSnapshotsScope(input)
      : await this.runBusinessSnapshotsScope(input);
    scopes.push(snapshotsResult);

    return {
      tenantId: input.tenantId,
      slug: input.slug,
      date: input.dateInput,
      skipped: scopes.every((scope) => scope.skipped),
      scopes,
    };
  }

  private async runBusinessFactsScope(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }) {
    const scope = DailyDataCoverageScope.BUSINESS_FACTS;

    if (!(await this.shouldRunScope(input, scope))) {
      return this.skippedScope(scope);
    }

    return this.runScope(input, scope, async () => {
      const result = await this.langameSyncService.syncTenantById(
        input.tenantId,
        {
          dateFrom: input.dateInput,
          dateTo: input.dateInput,
          mode: 'QUICK',
          trigger: 'AUTO',
        },
      );

      if (result.failedSources > 0) {
        throw new Error(
          `Langame facts sync failed for ${result.failedSources} source(s)`,
        );
      }

      return {
        sourceCounts: this.langameSourceCounts(result),
        summary: this.langameSummary(result),
      };
    });
  }

  private async runGuestAndStaffScopes(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }): Promise<DailySyncScopeResult[]> {
    const guestScope = DailyDataCoverageScope.GUEST_FOUNDATION;
    const staffScope = DailyDataCoverageScope.STAFF_SHIFTS;
    const shouldRunGuest = await this.shouldRunScope(input, guestScope);
    const shouldRunStaff = await this.shouldRunScope(input, staffScope);

    if (!shouldRunGuest && !shouldRunStaff) {
      return [this.skippedScope(guestScope), this.skippedScope(staffScope)];
    }

    await Promise.all([
      this.markCoverageRunning(input, guestScope),
      this.markCoverageRunning(input, staffScope),
    ]);

    try {
      const result = await this.guestDataFoundationService.syncTenantById(
        input.tenantId,
        {
          dateFrom: input.dateInput,
          dateTo: input.dateInput,
          includeGuestLogs: true,
          includeOperationLog: true,
          includeCashTransactions: true,
          includeWorkingShifts: true,
        },
      );

      if (result.failedSources > 0) {
        throw new Error(
          `Langame guest foundation sync failed for ${result.failedSources} source(s)`,
        );
      }

      await Promise.all([
        this.markCoverageFinished(input, guestScope, {
          status: DailyDataCoverageStatus.SUCCESS,
          sourceCounts: this.guestFoundationCounts(result),
          summary: this.guestFoundationSummary(result),
        }),
        this.markCoverageFinished(input, staffScope, {
          status: DailyDataCoverageStatus.SUCCESS,
          sourceCounts: this.staffShiftCounts(result),
          summary: this.staffShiftSummary(result),
        }),
      ]);

      return [
        this.finishedScope(guestScope, DailyDataCoverageStatus.SUCCESS),
        this.finishedScope(staffScope, DailyDataCoverageStatus.SUCCESS),
      ];
    } catch (error) {
      const errorMessage = this.errorMessage(error);

      await Promise.all([
        this.markCoverageFinished(input, guestScope, {
          status: DailyDataCoverageStatus.FAILED,
          errorMessage,
        }),
        this.markCoverageFinished(input, staffScope, {
          status: DailyDataCoverageStatus.FAILED,
          errorMessage,
        }),
      ]);

      return [
        this.finishedScope(
          guestScope,
          DailyDataCoverageStatus.FAILED,
          errorMessage,
        ),
        this.finishedScope(
          staffScope,
          DailyDataCoverageStatus.FAILED,
          errorMessage,
        ),
      ];
    }
  }

  private async runBusinessSnapshotsScope(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }) {
    const scope = DailyDataCoverageScope.BUSINESS_SNAPSHOTS;

    if (!(await this.shouldRunScope(input, scope))) {
      return this.skippedScope(scope);
    }

    return this.runScope(input, scope, async () => {
      const result = await this.businessSnapshotService.runSnapshotsForTenant(
        input.tenantId,
        {
          type: 'ALL',
          dateFrom: input.dateInput,
          dateTo: input.dateInput,
        },
      );
      const failedRuns = result.runs.filter((run) => run.status === 'FAILED');

      if (failedRuns.length > 0) {
        throw new Error(
          `Business snapshots failed: ${failedRuns
            .map((run) => run.type)
            .join(', ')}`,
        );
      }

      return {
        sourceCounts: this.businessSnapshotCounts(result),
        summary: this.businessSnapshotSummary(result),
      };
    });
  }

  private async skipBlockedSnapshotsScope(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }) {
    const scope = DailyDataCoverageScope.BUSINESS_SNAPSHOTS;

    if (!(await this.shouldRunScope(input, scope))) {
      return this.skippedScope(scope);
    }

    const errorMessage =
      'Business snapshots were skipped because source Langame sync failed';
    await this.markCoverageFinished(input, scope, {
      status: DailyDataCoverageStatus.SKIPPED,
      errorMessage,
      summary: { reason: 'SOURCE_SYNC_FAILED' },
    });

    return this.finishedScope(
      scope,
      DailyDataCoverageStatus.SKIPPED,
      errorMessage,
    );
  }

  private async runScope(
    input: {
      tenantId: string;
      businessDate: Date;
      dateInput: string;
      force: boolean;
    },
    scope: DailyDataCoverageScope,
    task: () => Promise<{
      sourceCounts: Record<string, unknown>;
      summary: Record<string, unknown>;
    }>,
  ) {
    await this.markCoverageRunning(input, scope);

    try {
      const result = await task();
      await this.markCoverageFinished(input, scope, {
        status: DailyDataCoverageStatus.SUCCESS,
        sourceCounts: result.sourceCounts,
        summary: result.summary,
      });

      return this.finishedScope(scope, DailyDataCoverageStatus.SUCCESS);
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      await this.markCoverageFinished(input, scope, {
        status: DailyDataCoverageStatus.FAILED,
        errorMessage,
      });

      return this.finishedScope(
        scope,
        DailyDataCoverageStatus.FAILED,
        errorMessage,
      );
    }
  }

  private async shouldRunScope(
    input: {
      tenantId: string;
      businessDate: Date;
      force: boolean;
    },
    scope: DailyDataCoverageScope,
  ) {
    if (input.force) {
      return true;
    }

    const coverage = await this.prisma.dailyDataCoverage.findUnique({
      where: {
        tenantId_businessDate_scope: {
          tenantId: input.tenantId,
          businessDate: input.businessDate,
          scope,
        },
      },
      select: { status: true },
    });

    return coverage?.status !== DailyDataCoverageStatus.SUCCESS;
  }

  private async markCoverageRunning(
    input: { tenantId: string; businessDate: Date },
    scope: DailyDataCoverageScope,
  ) {
    const now = new Date();

    await this.prisma.dailyDataCoverage.upsert({
      where: {
        tenantId_businessDate_scope: {
          tenantId: input.tenantId,
          businessDate: input.businessDate,
          scope,
        },
      },
      create: {
        tenantId: input.tenantId,
        businessDate: input.businessDate,
        scope,
        status: DailyDataCoverageStatus.RUNNING,
        startedAt: now,
        finishedAt: null,
        sourceCounts: this.toInputJson({}),
        summary: this.toInputJson({}),
        errorMessage: null,
      },
      update: {
        status: DailyDataCoverageStatus.RUNNING,
        startedAt: now,
        finishedAt: null,
        sourceCounts: this.toInputJson({}),
        summary: this.toInputJson({}),
        errorMessage: null,
      },
    });
  }

  private async markCoverageFinished(
    input: { tenantId: string; businessDate: Date },
    scope: DailyDataCoverageScope,
    data: {
      status: DailyDataCoverageStatus;
      sourceCounts?: Record<string, unknown>;
      summary?: Record<string, unknown>;
      errorMessage?: string | null;
    },
  ) {
    const now = new Date();
    const sourceCounts = this.toInputJson(data.sourceCounts ?? {});
    const summary = this.toInputJson(data.summary ?? {});

    await this.prisma.dailyDataCoverage.upsert({
      where: {
        tenantId_businessDate_scope: {
          tenantId: input.tenantId,
          businessDate: input.businessDate,
          scope,
        },
      },
      create: {
        tenantId: input.tenantId,
        businessDate: input.businessDate,
        scope,
        status: data.status,
        startedAt: now,
        finishedAt: now,
        sourceCounts,
        summary,
        errorMessage: data.errorMessage ?? null,
      },
      update: {
        status: data.status,
        finishedAt: now,
        sourceCounts,
        summary,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  private async findConfiguredTenants() {
    return this.prisma.tenant.findMany({
      where: {
        integrationCredentials: {
          some: {
            provider: IntegrationProvider.LANGAME,
            isActive: true,
            apiKeyEncrypted: { not: null },
          },
        },
        integrationSources: {
          some: {
            provider: IntegrationProvider.LANGAME,
            isActive: true,
          },
        },
      },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
  }

  private isSchedulerEnabled() {
    const explicit = this.configService
      .get<string>('LANGAME_DAILY_SYNC_SCHEDULER_ENABLED')
      ?.trim()
      .toLowerCase();

    if (explicit) {
      return ['1', 'true', 'yes', 'on'].includes(explicit);
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim();
    const syncToken = this.configService
      .get<string>('SYNC_SERVICE_TOKEN')
      ?.trim();

    return nodeEnv === 'production' && Boolean(syncToken);
  }

  private isPastScheduledLocalTime(now: Date) {
    return this.localMinutesOfDay(now) >= this.scheduledLocalMinutes();
  }

  private previousBusinessDate(now: Date) {
    const shifted = new Date(
      now.getTime() + this.utcOffsetMinutes() * 60 * 1000,
    );
    shifted.setUTCDate(shifted.getUTCDate() - 1);

    return new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
      ),
    );
  }

  private localMinutesOfDay(now: Date) {
    const shifted = new Date(
      now.getTime() + this.utcOffsetMinutes() * 60 * 1000,
    );

    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  }

  private scheduledLocalMinutes() {
    const value =
      this.configService.get<string>('LANGAME_DAILY_SYNC_LOCAL_TIME') ??
      DEFAULT_DAILY_SYNC_LOCAL_TIME;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

    if (!match) {
      return 4 * 60 + 30;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return 4 * 60 + 30;
    }

    return hours * 60 + minutes;
  }

  private utcOffsetMinutes() {
    return this.getInt(
      'LANGAME_DAILY_SYNC_UTC_OFFSET_MINUTES',
      DEFAULT_UTC_OFFSET_MINUTES,
    );
  }

  private getPositiveInt(key: string, fallback: number) {
    const value = this.getInt(key, fallback);

    return value > 0 ? value : fallback;
  }

  private getInt(key: string, fallback: number) {
    const value = Math.trunc(Number(this.configService.get<string>(key)));

    return Number.isFinite(value) ? value : fallback;
  }

  private parseBusinessDateInput(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private toDateInputValue(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private skippedScope(scope: DailyDataCoverageScope): DailySyncScopeResult {
    return {
      scope,
      status: DailyDataCoverageStatus.SUCCESS,
      skipped: true,
      errorMessage: null,
    };
  }

  private finishedScope(
    scope: DailyDataCoverageScope,
    status: DailyDataCoverageStatus,
    errorMessage: string | null = null,
  ): DailySyncScopeResult {
    return {
      scope,
      status,
      skipped: false,
      errorMessage,
    };
  }

  private langameSourceCounts(result: LangameSyncResult) {
    return {
      sources: result.sources,
      failedSources: result.failedSources,
      stores: result.stores,
      products: result.products,
      productGroups: result.productGroups,
      productConfigurations: result.productConfigurations,
      inventorySnapshots: result.inventorySnapshots,
      salesFacts: result.salesFacts,
      clubRevenueFacts: result.clubRevenueFacts,
      discrepancies: result.discrepancies,
    };
  }

  private langameSummary(result: LangameSyncResult) {
    return {
      domains: result.sourceResults.map((source) => ({
        domain: source.domain,
        status: source.status,
        errorMessage: source.errorMessage,
      })),
    };
  }

  private guestFoundationCounts(result: GuestDataFoundationSyncResult) {
    return this.sumGuestSourceResults(result, [
      'guests',
      'groups',
      'balances',
      'bonusBalances',
      'sessions',
      'transactions',
      'guestLogs',
      'operationLogs',
      'cashTransactions',
      'productSalesLinked',
    ]);
  }

  private guestFoundationSummary(result: GuestDataFoundationSyncResult) {
    return {
      sources: result.sources,
      failedSources: result.failedSources,
      domains: result.sourceResults.map((source) => ({
        domain: source.domain,
        status: source.status,
        errorMessage: source.errorMessage,
      })),
    };
  }

  private staffShiftCounts(result: GuestDataFoundationSyncResult) {
    return this.sumGuestSourceResults(result, [
      'langameUsers',
      'workingShifts',
      'operationLogs',
      'cashTransactions',
    ]);
  }

  private staffShiftSummary(result: GuestDataFoundationSyncResult) {
    return {
      sources: result.sources,
      failedSources: result.failedSources,
      domains: result.sourceResults.map((source) => ({
        domain: source.domain,
        status: source.status,
        workingShifts: source.workingShifts,
        langameUsers: source.langameUsers,
        errorMessage: source.errorMessage,
      })),
    };
  }

  private sumGuestSourceResults(
    result: GuestDataFoundationSyncResult,
    keys: Array<keyof GuestDataFoundationSyncResult['sourceResults'][number]>,
  ) {
    const counts: Record<string, number> = {
      sources: result.sources,
      failedSources: result.failedSources,
    };

    for (const key of keys) {
      counts[key] = result.sourceResults.reduce((sum, source) => {
        const value = source[key];
        return sum + (typeof value === 'number' ? value : 0);
      }, 0);
    }

    return counts;
  }

  private businessSnapshotCounts(result: BusinessSnapshotRunResult) {
    return {
      runs: result.runs.length,
      failedRuns: result.runs.filter((run) => run.status === 'FAILED').length,
      emptyRuns: result.runs.filter((run) => run.status === 'EMPTY').length,
      successfulRuns: result.runs.filter((run) => run.status === 'SUCCESS')
        .length,
      rows: result.runs.reduce((sum, run) => sum + run.rowCount, 0),
    };
  }

  private businessSnapshotSummary(result: BusinessSnapshotRunResult) {
    return {
      runs: result.runs.map((run) => ({
        type: run.type,
        status: run.status,
        rowCount: run.rowCount,
        errorMessage: run.errorMessage,
      })),
    };
  }

  private toInputJson(value: Record<string, unknown>) {
    return value as Prisma.InputJsonObject;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
