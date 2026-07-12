import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestGameDataRetentionService } from './guest-game-data-retention.service';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class GuestGameDataRetentionSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGameDataRetentionSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly retentionService: GuestGameDataRetentionService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) {
      this.logger.log('Guest game retention scheduler is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.tick(), 30_000).unref();
    this.logger.log(
      `Guest game retention scheduler started: interval=${intervalMs}ms, mode=${this.liveRequested() ? 'LIVE_REQUESTED' : 'DRY_RUN'}.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(now = new Date()) {
    return this.retentionService.runAll({
      now,
      liveRequested: this.liveRequested(),
    });
  }

  private async tick() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const result = await this.runOnce();
      this.logger.log(
        `Guest game retention finished: tenants=${result.tenants}, completed=${result.completed}, skipped=${result.skipped}.`,
      );
    } catch (error) {
      this.logger.error(
        `Guest game retention tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private enabled() {
    const value = this.config
      .get<string>('GUEST_GAME_RETENTION_SCHEDULER_ENABLED')
      ?.trim()
      .toLowerCase();
    return !['0', 'false', 'off', 'no'].includes(value ?? '');
  }

  private liveRequested() {
    const value = this.config
      .get<string>('GUEST_GAME_RETENTION_LIVE_ENABLED')
      ?.trim()
      .toLowerCase();
    return ['1', 'true', 'on', 'yes'].includes(value ?? '');
  }

  private intervalMs() {
    const value = Number(
      this.config.get<string>('GUEST_GAME_RETENTION_INTERVAL_MS'),
    );
    if (!Number.isFinite(value)) {
      return DEFAULT_INTERVAL_MS;
    }
    return Math.max(
      60_000,
      Math.min(7 * DEFAULT_INTERVAL_MS, Math.trunc(value)),
    );
  }
}
