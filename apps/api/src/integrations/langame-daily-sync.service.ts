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
  IntegrationSyncMode,
  IntegrationSyncStatus,
  IntegrationSyncTrigger,
  Prisma,
  TenantModule,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantExecutionAdmissionDecision,
  TenantExecutionAdmissionService,
} from '../tenancy/tenant-execution-admission.service';
import {
  evaluateTenantBackgroundExecutionPolicy,
  tenantBackgroundExecutionNote,
  tenantBackgroundStageForCustomerStage,
} from '../tenancy/tenant-background-execution-policy';
import {
  BusinessSnapshotService,
  type BusinessSnapshotRunResult,
} from './business-snapshot.service';
import {
  GuestDataFoundationService,
  type GuestDataFoundationSyncResult,
} from './guest-data-foundation.service';
import { LangameSyncService } from './langame-sync.service';
import {
  externalLangamePilotAllows,
  externalLangameDataRequirements,
  isLangameExternalPilotAuthority,
  type LangameExternalPilotAuthority,
} from './langame-external-pilot-authority';
import {
  BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
  type BackgroundExecutionFencePendingReasonCode,
  type LangameSyncResult,
} from './langame.types';

const DEFAULT_DAILY_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_DAILY_SYNC_LOCAL_TIME = '04:30';
const DEFAULT_UTC_OFFSET_MINUTES = 5 * 60;
const AUTO_INVENTORY_REPEAT_SUPPRESSION_MS = 60 * 60 * 1000;
const DAILY_SYNC_OUTBOUND_REQUIREMENTS = [
  { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
  { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
  { module: TenantModule.GAMIFICATION, action: 'OUTBOUND' },
  { module: TenantModule.STAFF, action: 'OUTBOUND' },
] as const;

export type DailySyncInput = {
  date?: string;
  force?: boolean;
  tenantSlug?: string;
  externalPilot?: LangameExternalPilotAuthority;
  externalBusinessDate?: string;
};

type DailySyncScopeResult = {
  scope: DailyDataCoverageScope;
  status: DailyDataCoverageStatus;
  skipped: boolean;
  inventoryRequested?: boolean;
  partial?: boolean;
  errorMessage: string | null;
};

type DailySyncTenantResult = {
  tenantId: string;
  slug: string;
  date: string;
  status: 'PROCESSED' | 'SKIPPED';
  skipped: boolean;
  reasonCode:
    | TenantExecutionAdmissionDecision['reasonCode']
    | BackgroundExecutionFencePendingReasonCode
    | null;
  failedRequirement:
    | TenantExecutionAdmissionDecision['failedRequirement']
    | null;
  inventoryRequested: boolean;
  scopes: DailySyncScopeResult[];
};

class IncompleteDailyFactsScopeError extends Error {
  constructor(
    message: string,
    readonly sourceCounts: Record<string, unknown>,
    readonly summary: Record<string, unknown>,
    readonly partial = false,
  ) {
    super(message);
  }
}

export type DailySyncResult = {
  date: string;
  force: boolean;
  tenants: number;
  processedTenants: number;
  skippedTenants: number;
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
    private readonly tenantExecutionAdmissionService: TenantExecutionAdmissionService,
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
    if (input.externalBusinessDate && !input.externalPilot) {
      throw new BadRequestException(
        'External business date requires worker authority',
      );
    }
    if (
      input.externalBusinessDate &&
      input.date &&
      input.externalBusinessDate !== input.date
    ) {
      throw new BadRequestException(
        'External business date conflicts with canary date',
      );
    }
    const requestedDate = input.externalBusinessDate ?? input.date;
    const businessDate = requestedDate
      ? this.parseBusinessDateInput(requestedDate)
      : this.previousBusinessDate(new Date());
    const dateInput = this.toDateInputValue(businessDate);
    const force = Boolean(input.force);
    const includeCurrentInventory = !input.date;
    const tenantSlug = input.tenantSlug?.trim();
    if (tenantSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      throw new BadRequestException('tenantSlug must be a lowercase slug');
    }
    const externalPilot = input.externalPilot;
    if (externalPilot && input.force) {
      throw new BadRequestException(
        'External worker cannot force or replay a daily effect',
      );
    }
    if (
      externalPilot &&
      (!isLangameExternalPilotAuthority(
        externalPilot,
        externalPilot.tenantId,
      ) ||
        tenantSlug !== externalPilot.tenantSlug)
    ) {
      throw new BadRequestException(
        'External Langame pilot tenant scope is invalid',
      );
    }
    const tenants = await this.findConfiguredTenants(tenantSlug);
    if (
      externalPilot &&
      (tenants.length !== 1 || tenants[0].id !== externalPilot.tenantId)
    ) {
      throw new BadRequestException(
        'External Langame pilot tenant is unavailable',
      );
    }
    const results: DailySyncTenantResult[] = [];

    for (const tenant of tenants) {
      const admission = await this.tenantExecutionAdmissionService.evaluate(
        tenant.id,
        externalPilot
          ? externalLangameDataRequirements(
              DAILY_SYNC_OUTBOUND_REQUIREMENTS.map(({ module }) => module),
            )
          : DAILY_SYNC_OUTBOUND_REQUIREMENTS,
      );
      if (!admission.allowed) {
        results.push(
          this.admissionSkippedTenant({
            tenantId: tenant.id,
            slug: tenant.slug,
            dateInput,
            admission,
          }),
        );
        continue;
      }

      const backgroundExecution = evaluateTenantBackgroundExecutionPolicy({
        stage: tenantBackgroundStageForCustomerStage(admission.customerStage),
        jobKind: 'LANGAME_DAILY_SYNC',
      });
      if (
        !backgroundExecution.allowed &&
        !externalLangamePilotAllows(externalPilot, {
          tenantId: tenant.id,
          customerStage: admission.customerStage,
          profileRevision: admission.entitlementProfileRevision,
          executionRevision: admission.executionRevision,
          jobKind: 'LANGAME_DAILY_SYNC',
        })
      ) {
        results.push(
          this.backgroundExecutionSkippedTenant({
            tenantId: tenant.id,
            slug: tenant.slug,
            dateInput,
            errorMessage: tenantBackgroundExecutionNote(backgroundExecution),
          }),
        );
        continue;
      }

      if (externalPilot) {
        const activeSync = await this.prisma.integrationSyncJob.findFirst({
          where: {
            tenantId: tenant.id,
            provider: IntegrationProvider.LANGAME,
            finishedAt: null,
          },
          select: { id: true },
        });
        if (activeSync) {
          throw new BadRequestException(
            'External worker cannot overlap an active Langame import',
          );
        }
        if (
          admission.customerStage !== externalPilot.customerStage ||
          !admission.allowed
        ) {
          throw new BadRequestException(
            'External Langame pilot admission changed',
          );
        }
        await this.langameSyncService.assertExternalPilotBindings(
          externalPilot,
        );
      }

      results.push(
        await this.runTenantDailySync({
          tenantId: tenant.id,
          slug: tenant.slug,
          businessDate,
          dateInput,
          force,
          includeCurrentInventory,
          externalPilot,
        }),
      );
    }

    return {
      date: dateInput,
      force,
      tenants: tenants.length,
      processedTenants: results.filter(
        (tenant) => tenant.status === 'PROCESSED',
      ).length,
      skippedTenants: results.filter((tenant) => tenant.status === 'SKIPPED')
        .length,
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
    includeCurrentInventory: boolean;
    externalPilot?: LangameExternalPilotAuthority;
  }): Promise<DailySyncTenantResult> {
    const scopes: DailySyncScopeResult[] = [];
    let sourceFailed = false;

    await this.assertExternalPilotCurrent(input.externalPilot);

    const businessFactsResult = await this.runBusinessFactsScope(input);
    scopes.push(businessFactsResult);
    sourceFailed =
      sourceFailed ||
      businessFactsResult.status === DailyDataCoverageStatus.FAILED;

    await this.assertExternalPilotCurrent(input.externalPilot);

    const guestStaffResults = await this.runGuestAndStaffScopes(input);
    scopes.push(...guestStaffResults);
    sourceFailed =
      sourceFailed ||
      guestStaffResults.some(
        (result) => result.status === DailyDataCoverageStatus.FAILED,
      );

    await this.assertExternalPilotCurrent(input.externalPilot);

    const snapshotsResult = sourceFailed
      ? await this.skipBlockedSnapshotsScope(input)
      : await this.runBusinessSnapshotsScope(input);
    scopes.push(snapshotsResult);

    return {
      tenantId: input.tenantId,
      slug: input.slug,
      date: input.dateInput,
      status: 'PROCESSED',
      skipped: scopes.every((scope) => scope.skipped),
      reasonCode: null,
      failedRequirement: null,
      inventoryRequested: businessFactsResult.inventoryRequested === true,
      scopes,
    };
  }

  private async assertExternalPilotCurrent(
    authority?: LangameExternalPilotAuthority,
  ) {
    if (!authority) return;
    const admission = await this.tenantExecutionAdmissionService.assertAllowed(
      authority.tenantId,
      externalLangameDataRequirements(
        DAILY_SYNC_OUTBOUND_REQUIREMENTS.map(({ module }) => module),
      ),
    );
    if (
      admission.customerStage !== authority.customerStage ||
      admission.entitlementProfileRevision !== authority.profileRevision ||
      admission.executionRevision !== authority.executionRevision
    ) {
      throw new BadRequestException(
        'External Langame pilot execution revision changed',
      );
    }
    await this.langameSyncService.assertExternalPilotBindings(authority);
  }

  private admissionSkippedTenant(input: {
    tenantId: string;
    slug: string;
    dateInput: string;
    admission: TenantExecutionAdmissionDecision;
  }): DailySyncTenantResult {
    const errorMessage = `Tenant execution is not admitted: ${input.admission.reasonCode}`;
    const scopes = [
      DailyDataCoverageScope.BUSINESS_FACTS,
      DailyDataCoverageScope.GUEST_FOUNDATION,
      DailyDataCoverageScope.STAFF_SHIFTS,
      DailyDataCoverageScope.BUSINESS_SNAPSHOTS,
    ].map((scope) => ({
      scope,
      status: DailyDataCoverageStatus.SKIPPED,
      skipped: true,
      errorMessage,
    }));

    return {
      tenantId: input.tenantId,
      slug: input.slug,
      date: input.dateInput,
      status: 'SKIPPED',
      skipped: true,
      reasonCode: input.admission.reasonCode,
      failedRequirement: input.admission.failedRequirement,
      inventoryRequested: false,
      scopes,
    };
  }

  private backgroundExecutionSkippedTenant(input: {
    tenantId: string;
    slug: string;
    dateInput: string;
    errorMessage: string;
  }): DailySyncTenantResult {
    const scopes = [
      DailyDataCoverageScope.BUSINESS_FACTS,
      DailyDataCoverageScope.GUEST_FOUNDATION,
      DailyDataCoverageScope.STAFF_SHIFTS,
      DailyDataCoverageScope.BUSINESS_SNAPSHOTS,
    ].map((scope) => ({
      scope,
      status: DailyDataCoverageStatus.SKIPPED,
      skipped: true,
      errorMessage: input.errorMessage,
    }));

    return {
      tenantId: input.tenantId,
      slug: input.slug,
      date: input.dateInput,
      status: 'SKIPPED',
      skipped: true,
      reasonCode: BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
      failedRequirement: null,
      inventoryRequested: false,
      scopes,
    };
  }

  private async runBusinessFactsScope(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
    includeCurrentInventory: boolean;
    externalPilot?: LangameExternalPilotAuthority;
  }) {
    const scope = DailyDataCoverageScope.BUSINESS_FACTS;
    const shouldRunQuick = await this.shouldRunScope(input, scope);
    const shouldRunInventory =
      input.includeCurrentInventory &&
      (await this.shouldRunCurrentInventory(input.tenantId));

    if (!shouldRunQuick) {
      if (shouldRunInventory) {
        return this.runCurrentInventoryWithoutChangingQuickCoverage(
          input.tenantId,
          scope,
          input.externalPilot,
        );
      }
      return this.skippedScope(
        scope,
        input.includeCurrentInventory
          ? null
          : 'Current inventory is not loaded for an explicit historical canary date.',
      );
    }

    const quickScope = await this.runScope(input, scope, async () => {
      // Refresh product identities before resolving dated sales and stock.
      // Category/club-price permission denials leave the goods that succeeded.
      const catalog = input.externalPilot
        ? await this.langameSyncService.syncTenantById(
            input.tenantId,
            { mode: 'CATALOG', trigger: 'AUTO' },
            'LANGAME_DAILY_SYNC',
            input.externalPilot,
          )
        : null;
      const quickQuery = {
        dateFrom: input.dateInput,
        dateTo: input.dateInput,
        mode: 'QUICK',
        trigger: 'AUTO',
      } as const;
      const quick = input.externalPilot
        ? await this.langameSyncService.syncTenantById(
            input.tenantId,
            quickQuery,
            'LANGAME_DAILY_SYNC',
            input.externalPilot,
          )
        : await this.langameSyncService.syncTenantById(
            input.tenantId,
            quickQuery,
            'LANGAME_DAILY_SYNC',
          );

      const inventory = shouldRunInventory
        ? await this.syncCurrentInventory(input.tenantId, input.externalPilot)
        : null;
      const sourceCounts = {
        ...this.langameSourceCounts(quick),
        quick: this.langameSourceCounts(quick),
        catalog: catalog ? this.langameSourceCounts(catalog) : null,
        inventory: inventory ? this.langameSourceCounts(inventory) : null,
      };
      const summary = {
        ...this.langameSummary(quick),
        quick: this.langameSummary(quick),
        catalog: catalog ? this.langameSummary(catalog) : null,
        inventory: inventory
          ? this.langameSummary(inventory)
          : {
              status: 'SKIPPED',
              reason: input.includeCurrentInventory
                ? 'RECENT_AUTO_INVENTORY_JOB'
                : 'EXPLICIT_HISTORICAL_DATE',
            },
      };

      const incomplete = [quick, catalog, inventory].some(
        (result) =>
          result !== null &&
          (result.failedSources > 0 || result.partialSources > 0),
      );
      if (incomplete) {
        throw new IncompleteDailyFactsScopeError(
          'Langame daily facts source is incomplete',
          sourceCounts,
          summary,
          [quick, catalog, inventory].every(
            (result) => result === null || result.failedSources === 0,
          ),
        );
      }

      return { sourceCounts, summary };
    });

    return {
      ...quickScope,
      inventoryRequested: shouldRunInventory,
    };
  }

  private async runCurrentInventoryWithoutChangingQuickCoverage(
    tenantId: string,
    scope: DailyDataCoverageScope,
    externalPilot?: LangameExternalPilotAuthority,
  ) {
    try {
      const inventory = await this.syncCurrentInventory(
        tenantId,
        externalPilot,
      );
      this.assertCompleteLangameSources(inventory, 'Langame current inventory');
      return this.finishedScope(
        scope,
        DailyDataCoverageStatus.SUCCESS,
        null,
        true,
      );
    } catch (error) {
      const errorMessage = externalPilot
        ? 'External Langame inventory is incomplete; inspect the source receipt.'
        : this.errorMessage(error);
      return this.finishedScope(
        scope,
        DailyDataCoverageStatus.FAILED,
        errorMessage,
        true,
      );
    }
  }

  private syncCurrentInventory(
    tenantId: string,
    externalPilot?: LangameExternalPilotAuthority,
  ) {
    const query = { mode: 'INVENTORY', trigger: 'AUTO' } as const;
    return externalPilot
      ? this.langameSyncService.syncTenantById(
          tenantId,
          query,
          'LANGAME_DAILY_SYNC',
          externalPilot,
        )
      : this.langameSyncService.syncTenantById(
          tenantId,
          query,
          'LANGAME_DAILY_SYNC',
        );
  }

  private assertCompleteLangameSources(
    result: LangameSyncResult,
    label: string,
  ) {
    if (result.failedSources === 0 && result.partialSources === 0) {
      return;
    }

    throw new Error(
      `${label} sync incomplete: failed=${result.failedSources}, partial=${result.partialSources}`,
    );
  }

  private async shouldRunCurrentInventory(tenantId: string) {
    const repeatSuppressionCutoff = new Date(
      Date.now() - AUTO_INVENTORY_REPEAT_SUPPRESSION_MS,
    );
    const [sources, successfulJobs] = await Promise.all([
      this.prisma.integrationSource.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
          isActive: true,
        },
        select: { domain: true },
      }),
      this.prisma.integrationSyncJob.findMany({
        where: {
          tenantId,
          provider: IntegrationProvider.LANGAME,
          mode: IntegrationSyncMode.INVENTORY,
          trigger: IntegrationSyncTrigger.AUTO,
          status: IntegrationSyncStatus.SUCCESS,
          finishedAt: { gte: repeatSuppressionCutoff },
        },
        select: { domain: true },
      }),
    ]);
    const freshDomains = new Set(successfulJobs.map((job) => job.domain));

    return sources.some((source) => !freshDomains.has(source.domain));
  }

  private async runGuestAndStaffScopes(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
    externalPilot?: LangameExternalPilotAuthority;
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
      const guestQuery = {
        dateFrom: input.dateInput,
        dateTo: input.dateInput,
        includeGuestLogs: true,
        includeOperationLog: true,
        includeCashTransactions: true,
        includeWorkingShifts: true,
      };
      const result = input.externalPilot
        ? await this.guestDataFoundationService.syncTenantById(
            input.tenantId,
            guestQuery,
            'OUTBOUND',
            input.externalPilot,
          )
        : await this.guestDataFoundationService.syncTenantById(
            input.tenantId,
            guestQuery,
            'OUTBOUND',
          );

      if (result.failedSources > 0 || result.partialSources > 0) {
        throw new IncompleteDailyFactsScopeError(
          `Langame guest foundation sync incomplete: failed=${result.failedSources}, partial=${result.partialSources}`,
          this.guestFoundationCounts(result),
          this.guestFoundationSummary(result),
          result.failedSources === 0 &&
            result.sourceResults.length === result.sources &&
            result.sourceResults.every(
              (source) =>
                source.status === 'SUCCESS' ||
                (source.status === 'PARTIAL' &&
                  Object.keys(source.endpointErrors).length > 0 &&
                  Object.values(source.endpointErrors).every(
                    (message) =>
                      message ===
                      'Langame не предоставил доступ к этому разделу.',
                  )),
            ),
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
      const incomplete =
        error instanceof IncompleteDailyFactsScopeError ? error : null;
      const errorMessage =
        input.externalPilot && !incomplete
          ? 'External Langame guest foundation failed; inspect the source receipt.'
          : this.errorMessage(error);

      await Promise.all([
        this.markCoverageFinished(input, guestScope, {
          status: DailyDataCoverageStatus.FAILED,
          ...(incomplete
            ? {
                sourceCounts: incomplete.sourceCounts,
                summary: {
                  ...incomplete.summary,
                  partial: incomplete.partial,
                },
              }
            : {}),
          errorMessage,
        }),
        this.markCoverageFinished(input, staffScope, {
          status: DailyDataCoverageStatus.FAILED,
          ...(incomplete
            ? {
                summary: { ...incomplete.summary, partial: incomplete.partial },
              }
            : {}),
          errorMessage,
        }),
      ]);

      return [
        {
          ...this.finishedScope(
            guestScope,
            DailyDataCoverageStatus.FAILED,
            errorMessage,
          ),
          partial: incomplete?.partial ?? false,
        },
        {
          ...this.finishedScope(
            staffScope,
            DailyDataCoverageStatus.FAILED,
            errorMessage,
          ),
          partial: incomplete?.partial ?? false,
        },
      ];
    }
  }

  private async runBusinessSnapshotsScope(input: {
    tenantId: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
    externalPilot?: LangameExternalPilotAuthority;
  }) {
    const scope = DailyDataCoverageScope.BUSINESS_SNAPSHOTS;

    if (!(await this.shouldRunScope(input, scope))) {
      return this.skippedScope(scope);
    }

    return this.runScope(input, scope, async () => {
      const snapshotQuery = {
        type: 'ALL' as const,
        dateFrom: input.dateInput,
        dateTo: input.dateInput,
      };
      const result = input.externalPilot
        ? await this.businessSnapshotService.runSnapshotsForTenant(
            input.tenantId,
            snapshotQuery,
            'OUTBOUND',
            input.externalPilot,
          )
        : await this.businessSnapshotService.runSnapshotsForTenant(
            input.tenantId,
            snapshotQuery,
            'OUTBOUND',
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
      externalPilot?: LangameExternalPilotAuthority;
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
      const incomplete =
        error instanceof IncompleteDailyFactsScopeError ? error : null;
      const errorMessage =
        input.externalPilot && !incomplete
          ? 'External Langame daily scope failed; inspect the source receipt.'
          : this.errorMessage(error);
      await this.markCoverageFinished(input, scope, {
        status: DailyDataCoverageStatus.FAILED,
        ...(incomplete
          ? {
              sourceCounts: incomplete.sourceCounts,
              summary: { ...incomplete.summary, partial: incomplete.partial },
            }
          : {}),
        errorMessage,
      });

      return {
        ...this.finishedScope(
          scope,
          DailyDataCoverageStatus.FAILED,
          errorMessage,
        ),
        partial: incomplete?.partial ?? false,
      };
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

  private async findConfiguredTenants(tenantSlug?: string) {
    return this.prisma.tenant.findMany({
      where: {
        ...(tenantSlug ? { slug: tenantSlug } : {}),
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

    const businessDate = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    if (this.toDateInputValue(businessDate) !== value) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD');
    }

    return businessDate;
  }

  private toDateInputValue(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private skippedScope(
    scope: DailyDataCoverageScope,
    errorMessage: string | null = null,
  ): DailySyncScopeResult {
    return {
      scope,
      status: DailyDataCoverageStatus.SUCCESS,
      skipped: true,
      inventoryRequested: false,
      errorMessage,
    };
  }

  private finishedScope(
    scope: DailyDataCoverageScope,
    status: DailyDataCoverageStatus,
    errorMessage: string | null = null,
    inventoryRequested = false,
  ): DailySyncScopeResult {
    return {
      scope,
      status,
      skipped: false,
      inventoryRequested,
      errorMessage,
    };
  }

  private langameSourceCounts(result: LangameSyncResult) {
    return {
      sources: result.sources,
      failedSources: result.failedSources,
      partialSources: result.partialSources,
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
        discrepancyLogStatus: source.discrepancyLogStatus,
        discrepancyLogError: source.discrepancyLogError,
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
      partialSources: result.partialSources,
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
