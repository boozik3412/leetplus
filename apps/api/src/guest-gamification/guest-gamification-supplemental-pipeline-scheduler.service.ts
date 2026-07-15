import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestGamificationService,
  type GuestGameSupplementalPipelineMode,
  type GuestGameSupplementalPipelineRunDto,
  type GuestGameSupplementalPipelineRunResult,
} from './guest-gamification.service';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 30;

@Injectable()
export class GuestGamificationSupplementalPipelineSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGamificationSupplementalPipelineSchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly gamificationService: GuestGamificationService,
  ) {}

  onModuleInit() {
    if (this.mode() === 'OFF' || this.killSwitchEnabled()) {
      this.logger.log('Guest supplemental pipeline is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      `Guest supplemental pipeline started: mode=${this.mode()}, interval=${intervalMs}ms, batch=${this.batchSize()}.`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<GuestGameSupplementalPipelineRunResult | null> {
    if (this.running || this.mode() === 'OFF' || this.killSwitchEnabled()) {
      return null;
    }

    this.running = true;
    try {
      const result =
        await this.gamificationService.runSupplementalPipelineScheduled(
          this.pipelineDto(),
        );
      if (
        result.checkedFacts > 0 ||
        result.failedFacts > 0 ||
        result.createdRewards > 0
      ) {
        this.logger.log(
          [
            'Guest supplemental pipeline finished:',
            `mode=${result.mode}`,
            `tenants=${result.processedTenants}/${result.checkedTenants}`,
            `processed=${result.processedFacts}`,
            `shadow=${result.shadowFacts}`,
            `duplicates=${result.duplicateFacts}`,
            `rewards=${result.createdRewards}`,
            `failed=${result.failedFacts}`,
          ].join(' '),
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        'Guest supplemental pipeline failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  private pipelineDto(): GuestGameSupplementalPipelineRunDto {
    const dto: GuestGameSupplementalPipelineRunDto = {
      mode: this.mode(),
      factTypes: this.factTypes(),
      limit: this.batchSize(),
    };
    const tenantId = this.optionalString(
      'GUEST_GAME_SUPPLEMENTAL_PIPELINE_TENANT_ID',
    );
    const tenantSlug = this.optionalString(
      'GUEST_GAME_SUPPLEMENTAL_PIPELINE_TENANT_SLUG',
    );
    if (tenantId) dto.tenantId = tenantId;
    if (tenantSlug) dto.tenantSlug = tenantSlug;
    return dto;
  }

  private mode(): GuestGameSupplementalPipelineMode {
    const value = this.optionalString(
      'GUEST_GAME_SUPPLEMENTAL_PIPELINE_MODE',
    )?.toUpperCase();
    return value === 'LIVE' || value === 'SHADOW' ? value : 'OFF';
  }

  private factTypes() {
    const configured =
      this.optionalString('GUEST_GAME_SUPPLEMENTAL_FACT_TYPES') ??
      'BALANCE_TOPUP';
    return configured
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item === 'BALANCE_TOPUP');
  }

  private killSwitchEnabled() {
    return this.optionalBoolean('GUEST_GAME_SUPPLEMENTAL_PIPELINE_KILL_SWITCH');
  }

  private intervalMs() {
    return this.positiveInteger(
      'GUEST_GAME_SUPPLEMENTAL_PIPELINE_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
      5_000,
      5 * 60_000,
    );
  }

  private batchSize() {
    return this.positiveInteger(
      'GUEST_GAME_SUPPLEMENTAL_PIPELINE_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
  }

  private optionalBoolean(key: string) {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value ?? '');
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
    return Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, Math.trunc(parsed)))
      : fallback;
  }
}
