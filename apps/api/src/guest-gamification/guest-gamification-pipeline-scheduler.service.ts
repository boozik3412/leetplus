import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestGamificationService,
  type GuestGameScheduledPipelineRunDto,
  type GuestGameScheduledPipelineRunResult,
} from './guest-gamification.service';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_LIMIT = 30;

@Injectable()
export class GuestGamificationPipelineSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGamificationPipelineSchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly gamificationService: GuestGamificationService,
  ) {}

  onModuleInit() {
    if (!this.enabled()) {
      this.logger.log('Guest gamification pipeline scheduler is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Guest gamification pipeline scheduler started: interval=${intervalMs}ms, limit=${this.limit()}.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<GuestGameScheduledPipelineRunResult | null> {
    if (this.running) {
      this.logger.warn(
        'Guest gamification pipeline scheduler tick skipped: still running.',
      );
      return null;
    }

    this.running = true;

    try {
      const result =
        await this.gamificationService.runSnapshotPipelineScheduled(
          this.pipelineDto(),
        );

      if (
        result.processedFacts > 0 ||
        result.erroredFacts > 0 ||
        result.queuedRewards > 0
      ) {
        this.logger.log(
          [
            'Guest gamification pipeline scheduler finished:',
            `tenants=${result.processedTenants}/${result.checkedTenants}`,
            `facts=${result.processedFacts}/${result.checkedFacts}`,
            `rewards=${result.queuedRewards}`,
            `errors=${result.erroredFacts}`,
          ].join(' '),
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        'Guest gamification pipeline scheduler failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  private pipelineDto(): GuestGameScheduledPipelineRunDto {
    const dto: GuestGameScheduledPipelineRunDto = {
      dryRunOnly: false,
      limit: this.limit(),
    };
    const tenantId = this.optionalString(
      'GUEST_GAME_PIPELINE_SCHEDULER_TENANT_ID',
    );
    const tenantSlug = this.optionalString(
      'GUEST_GAME_PIPELINE_SCHEDULER_TENANT_SLUG',
    );

    if (tenantId) {
      dto.tenantId = tenantId;
    }

    if (tenantSlug) {
      dto.tenantSlug = tenantSlug;
    }

    return dto;
  }

  private enabled() {
    const explicit = this.optionalBoolean(
      'GUEST_GAME_PIPELINE_SCHEDULER_ENABLED',
    );

    if (explicit !== undefined) {
      return explicit;
    }

    return (
      this.config.get<string>('NODE_ENV')?.trim() === 'production' &&
      Boolean(this.config.get<string>('SYNC_SERVICE_TOKEN')?.trim())
    );
  }

  private intervalMs() {
    return this.positiveInteger(
      'GUEST_GAME_PIPELINE_SCHEDULER_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
      5_000,
      5 * 60 * 1_000,
    );
  }

  private limit() {
    return this.positiveInteger(
      'GUEST_GAME_PIPELINE_SCHEDULER_LIMIT',
      DEFAULT_LIMIT,
      1,
      30,
    );
  }

  private optionalBoolean(key: string): boolean | undefined {
    const value = this.config.get<string>(key)?.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(value ?? '')) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(value ?? '')) {
      return false;
    }

    return undefined;
  }

  private optionalString(key: string) {
    return this.config.get<string>(key)?.trim() || null;
  }

  private positiveInteger(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(this.config.get<string>(key));

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }
}
