import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestActivityLedgerService } from './guest-activity-ledger.service';

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_RECOVERY_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
const DEFAULT_RECOVERY_BATCH_SIZE = 20;

@Injectable()
export class GuestActivityLedgerSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestActivityLedgerSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRecoverySweepAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly ledgerService: GuestActivityLedgerService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) {
      this.logger.log('Guest activity ledger queue scheduler is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.tick(), 1_000).unref();
    this.logger.log(
      `Guest activity ledger queue scheduler started: interval=${intervalMs}ms, batch=${this.batchSize()}.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const now = Date.now();
      if (now - this.lastRecoverySweepAt >= this.recoverySweepIntervalMs()) {
        const recovery = await this.ledgerService.enqueueDueRecoverySyncs(
          this.recoveryBatchSize(),
          new Date(now),
        );
        this.lastRecoverySweepAt = now;
        if (recovery.scanned > 0) {
          this.logger.log(
            `Guest activity ledger recovery scanned=${recovery.scanned}, queued=${recovery.queued}, skipped=${recovery.skipped}.`,
          );
        }
      }
      const result = await this.ledgerService.processQueuedSyncJobs(
        this.batchSize(),
      );

      if (result.processed > 0) {
        this.logger.log(
          `Guest activity ledger queue processed=${result.processed}, success=${result.success}, retry=${result.retried}, failed=${result.failed}, skipped=${result.skipped}, rerun=${result.rerun}.`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Guest activity ledger queue tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private enabled() {
    const value = this.config
      .get<string>('GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED')
      ?.trim()
      .toLowerCase();

    return !['0', 'false', 'off', 'no'].includes(value ?? '');
  }

  private intervalMs() {
    return positiveInteger(
      this.config.get<string>('GUEST_ACTIVITY_LEDGER_SCHEDULER_INTERVAL_MS'),
      DEFAULT_INTERVAL_MS,
      1_000,
      5 * 60 * 1000,
    );
  }

  private batchSize() {
    return positiveInteger(
      this.config.get<string>('GUEST_ACTIVITY_LEDGER_SCHEDULER_BATCH_SIZE'),
      DEFAULT_BATCH_SIZE,
      1,
      50,
    );
  }

  private recoverySweepIntervalMs() {
    return positiveInteger(
      this.config.get<string>(
        'GUEST_ACTIVITY_LEDGER_RECOVERY_SWEEP_INTERVAL_MS',
      ),
      DEFAULT_RECOVERY_SWEEP_INTERVAL_MS,
      60_000,
      24 * 60 * 60 * 1_000,
    );
  }

  private recoveryBatchSize() {
    return positiveInteger(
      this.config.get<string>('GUEST_ACTIVITY_LEDGER_RECOVERY_BATCH_SIZE'),
      DEFAULT_RECOVERY_BATCH_SIZE,
      1,
      100,
    );
  }
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
