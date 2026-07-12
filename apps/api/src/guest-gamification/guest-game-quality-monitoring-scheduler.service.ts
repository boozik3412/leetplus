import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1_000;

@Injectable()
export class GuestGameQualityMonitoringSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGameQualityMonitoringSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly monitoring: GuestGameQualityMonitoringService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) {
      this.logger.log('Guest game quality monitoring is disabled.');
      return;
    }
    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.tick(), 15_000).unref();
    this.logger.log(
      `Guest game quality monitoring started: interval=${intervalMs}ms.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(now = new Date()) {
    return this.monitoring.runAll(now);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runOnce();
      this.logger.log(
        `Guest game quality monitoring finished: tenants=${result.tenants}, failed=${result.failed}.`,
      );
    } catch (error) {
      this.logger.error(
        `Guest game quality monitoring failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private enabled() {
    const value = this.config
      .get<string>('GUEST_GAME_MONITORING_ENABLED')
      ?.trim()
      .toLowerCase();
    return !['0', 'false', 'off', 'no'].includes(value ?? '');
  }

  private intervalMs() {
    const parsed = Number(
      this.config.get<string>('GUEST_GAME_MONITORING_INTERVAL_MS'),
    );
    return Number.isFinite(parsed)
      ? Math.max(60_000, Math.min(60 * 60 * 1_000, Math.trunc(parsed)))
      : DEFAULT_INTERVAL_MS;
  }
}
