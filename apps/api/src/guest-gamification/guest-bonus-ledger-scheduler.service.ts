import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestBonusLedgerService,
  type GuestGameScheduledBonusLedgerDispatchDto,
  type GuestGameScheduledBonusLedgerDispatchResult,
} from './guest-bonus-ledger.service';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 50;

export type GuestBonusLedgerSchedulerRunOutcome = 'SUCCESS' | 'ERROR';

export type GuestBonusLedgerSchedulerRuntimeResult = Pick<
  GuestGameScheduledBonusLedgerDispatchResult,
  | 'mode'
  | 'dryRun'
  | 'checkedTenants'
  | 'processedTenants'
  | 'skippedTenants'
  | 'erroredTenants'
  | 'queued'
  | 'checked'
  | 'confirmed'
  | 'failed'
  | 'skipped'
  | 'blocked'
>;

export type GuestBonusLedgerSchedulerRuntimeStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOutcome: GuestBonusLedgerSchedulerRunOutcome | null;
  lastError: string | null;
  lastResult: GuestBonusLedgerSchedulerRuntimeResult | null;
  lastSkippedAt: string | null;
  lastSkipReason: string | null;
};

@Injectable()
export class GuestBonusLedgerSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GuestBonusLedgerSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private enabled = false;
  private intervalMs: number | null = null;
  private lastStartedAt: string | null = null;
  private lastFinishedAt: string | null = null;
  private lastOutcome: GuestBonusLedgerSchedulerRunOutcome | null = null;
  private lastError: string | null = null;
  private lastResult: GuestBonusLedgerSchedulerRuntimeResult | null = null;
  private lastSkippedAt: string | null = null;
  private lastSkipReason: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly bonusLedgerService: GuestBonusLedgerService,
  ) {}

  onModuleInit() {
    this.enabled = this.isSchedulerEnabled();

    if (!this.enabled) {
      this.intervalMs = null;
      this.logger.log('Guest bonus ledger scheduler is disabled');
      return;
    }

    this.intervalMs = this.getPositiveInt(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
    );
    this.logger.log(
      `Guest bonus ledger scheduler is enabled with ${this.intervalMs}ms interval`,
    );

    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getRuntimeStatus(): GuestBonusLedgerSchedulerRuntimeStatus {
    return {
      enabled: this.enabled,
      running: this.isRunning,
      intervalMs: this.intervalMs,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastOutcome: this.lastOutcome,
      lastError: this.lastError,
      lastResult: this.lastResult ? { ...this.lastResult } : null,
      lastSkippedAt: this.lastSkippedAt,
      lastSkipReason: this.lastSkipReason,
    };
  }

  async runOnce(): Promise<GuestGameScheduledBonusLedgerDispatchResult | null> {
    if (this.isRunning) {
      this.lastSkippedAt = new Date().toISOString();
      this.lastSkipReason = 'previous dispatch is still running';
      this.logger.warn(
        'Guest bonus ledger scheduler tick skipped: still running',
      );
      return null;
    }

    this.isRunning = true;
    this.lastStartedAt = new Date().toISOString();
    this.lastFinishedAt = null;
    this.lastOutcome = null;
    this.lastError = null;
    this.lastResult = null;

    try {
      const result = await this.bonusLedgerService.runScheduledDispatch(
        this.buildDispatchDto(),
      );
      this.lastOutcome = 'SUCCESS';
      this.lastResult = compactScheduledDispatchResult(result);
      this.logger.log(
        [
          'Guest bonus ledger scheduler finished:',
          `mode=${result.mode}`,
          `dryRun=${result.dryRun}`,
          `tenants=${result.processedTenants}/${result.checkedTenants}`,
          `queued=${result.queued}`,
          `confirmed=${result.confirmed}`,
          `failed=${result.failed}`,
          `blocked=${result.blocked}`,
        ].join(' '),
      );

      return result;
    } catch (error) {
      this.lastOutcome = 'ERROR';
      this.lastError = schedulerErrorMessage(error);
      this.logger.error(
        'Guest bonus ledger scheduler failed',
        error instanceof Error ? error.stack : String(error),
      );

      return null;
    } finally {
      this.lastFinishedAt = new Date().toISOString();
      this.isRunning = false;
    }
  }

  private buildDispatchDto(): GuestGameScheduledBonusLedgerDispatchDto {
    const dryRun = this.getOptionalBoolean(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN',
    );
    const queueApprovedRewards = this.getOptionalBoolean(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS',
    );
    const tenantId = this.getOptionalString(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_ID',
    );
    const tenantSlug = this.getOptionalString(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG',
    );
    const rewardTypes = this.getOptionalStringList(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES',
    );
    const dto: GuestGameScheduledBonusLedgerDispatchDto = {
      limit: this.getPositiveInt(
        'GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT',
        DEFAULT_LIMIT,
      ),
    };

    if (dryRun !== undefined) {
      dto.dryRun = dryRun;
    }

    if (queueApprovedRewards !== undefined) {
      dto.queueApprovedRewards = queueApprovedRewards;
    }

    if (tenantId) {
      dto.tenantId = tenantId;
    }

    if (tenantSlug) {
      dto.tenantSlug = tenantSlug;
    }

    if (rewardTypes.length > 0) {
      dto.rewardTypes = rewardTypes;
    }

    return dto;
  }

  private isSchedulerEnabled() {
    const explicit = this.getOptionalBoolean(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
    );

    if (explicit !== undefined) {
      return explicit;
    }

    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim();
    const syncToken = this.configService
      .get<string>('SYNC_SERVICE_TOKEN')
      ?.trim();

    return nodeEnv === 'production' && Boolean(syncToken);
  }

  private getOptionalBoolean(key: string): boolean | undefined {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return undefined;
    }

    if (['1', 'true', 'yes', 'on'].includes(value)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(value)) {
      return false;
    }

    return undefined;
  }

  private getOptionalString(key: string) {
    return this.configService.get<string>(key)?.trim() || null;
  }

  private getOptionalStringList(key: string) {
    const value = this.getOptionalString(key);

    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  private getPositiveInt(key: string, fallback: number) {
    const parsed = Number(this.configService.get<string>(key));
    const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;

    return value > 0 ? value : fallback;
  }
}

function compactScheduledDispatchResult(
  result: GuestGameScheduledBonusLedgerDispatchResult,
): GuestBonusLedgerSchedulerRuntimeResult {
  return {
    mode: result.mode,
    dryRun: result.dryRun,
    checkedTenants: result.checkedTenants,
    processedTenants: result.processedTenants,
    skippedTenants: result.skippedTenants,
    erroredTenants: result.erroredTenants,
    queued: result.queued,
    checked: result.checked,
    confirmed: result.confirmed,
    failed: result.failed,
    skipped: result.skipped,
    blocked: result.blocked,
  };
}

function schedulerErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);

  return (message || 'unknown error').slice(0, 500);
}
