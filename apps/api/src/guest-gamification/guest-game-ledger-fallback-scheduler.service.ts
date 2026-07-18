import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestGameLedgerFallbackService,
  type GuestGameLedgerFallbackMode,
  type GuestGameLedgerFallbackRunDto,
  type GuestGameLedgerFallbackRunResult,
} from './guest-game-ledger-fallback.service';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_GRACE_MS = 60_000;
const DEFAULT_CLAIM_LEASE_MS = 120_000;
const ALLOWED_FACT_TYPES = [
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
  'PRODUCT_PURCHASED',
] as const;

const DEFAULT_FACT_TYPES = [
  'HOURLY_PLAY_TIME_ACCUMULATED',
  'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
] as const;

type AllowedFactType = (typeof ALLOWED_FACT_TYPES)[number];

@Injectable()
export class GuestGameLedgerFallbackSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGameLedgerFallbackSchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly fallbackService: GuestGameLedgerFallbackService,
  ) {}

  onModuleInit() {
    const mode = this.mode();
    const factTypes = this.factTypes();
    if (
      mode === 'OFF' ||
      this.killSwitchEnabled() ||
      factTypes.length === 0 ||
      !this.scopeConfigured()
    ) {
      this.logger.log('Guest game ledger fallback scheduler is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      [
        'Guest game ledger fallback scheduler started:',
        `mode=${mode}`,
        `interval=${intervalMs}ms`,
        `batch=${this.batchSize()}`,
        `grace=${this.graceMs()}ms`,
        `lease=${this.claimLeaseMs()}ms`,
        `facts=${factTypes.join(',')}`,
      ].join(' '),
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<GuestGameLedgerFallbackRunResult | null> {
    if (this.running) {
      this.logger.warn(
        'Guest game ledger fallback tick skipped: still running.',
      );
      return null;
    }
    const factTypes = this.factTypes();
    if (
      this.mode() === 'OFF' ||
      this.killSwitchEnabled() ||
      factTypes.length === 0 ||
      !this.scopeConfigured()
    ) {
      return null;
    }

    this.running = true;
    try {
      const result = await this.fallbackService.runScheduled(
        this.runDto(factTypes),
      );
      if (
        result.checkedFacts > 0 ||
        result.failedFacts > 0 ||
        result.createdRewards > 0
      ) {
        this.logger.log(
          [
            'Guest game ledger fallback finished:',
            `mode=${result.mode}`,
            `tenants=${result.processedTenants}/${result.checkedTenants}`,
            `checked=${result.checkedFacts}`,
            `deferred=${result.deferredFacts}`,
            `live=${result.liveHandledFacts}`,
            `fallback=${result.fallbackFacts}`,
            `duplicates=${result.duplicateFacts}`,
            `rewards=${result.createdRewards}`,
            `failed=${result.failedFacts}`,
          ].join(' '),
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        'Guest game ledger fallback failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  private runDto(factTypes: AllowedFactType[]): GuestGameLedgerFallbackRunDto {
    const dto: GuestGameLedgerFallbackRunDto = {
      mode: this.mode(),
      factTypes,
      limit: this.batchSize(),
      graceMs: this.graceMs(),
      claimLeaseMs: this.claimLeaseMs(),
    };
    const tenantId = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_TENANT_ID',
    );
    const tenantSlug = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG',
    );
    if (tenantId) dto.tenantId = tenantId;
    if (tenantSlug) dto.tenantSlug = tenantSlug;
    if (this.allowAllTenants()) dto.allowAllTenants = true;
    return dto;
  }

  private scopeConfigured() {
    return Boolean(
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_TENANT_ID') ||
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG') ||
      this.allowAllTenants(),
    );
  }

  private allowAllTenants() {
    return this.optionalBoolean('GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS');
  }

  private mode(): GuestGameLedgerFallbackMode {
    const value = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_MODE',
    )?.toUpperCase();
    return value === 'LIVE' || value === 'SHADOW' ? value : 'OFF';
  }

  private factTypes(): AllowedFactType[] {
    const configured =
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES') ??
      DEFAULT_FACT_TYPES.join(',');
    const requested = new Set(
      configured
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    );
    return ALLOWED_FACT_TYPES.filter((factType) => requested.has(factType));
  }

  private killSwitchEnabled() {
    return this.optionalBoolean('GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH');
  }

  private intervalMs() {
    return this.positiveInteger(
      'GUEST_GAME_LEDGER_FALLBACK_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
      5_000,
      5 * 60_000,
    );
  }

  private batchSize() {
    return this.positiveInteger(
      'GUEST_GAME_LEDGER_FALLBACK_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
  }

  private graceMs() {
    return this.positiveInteger(
      'GUEST_GAME_LEDGER_FALLBACK_GRACE_MS',
      DEFAULT_GRACE_MS,
      15_000,
      10 * 60_000,
    );
  }

  private claimLeaseMs() {
    return this.positiveInteger(
      'GUEST_GAME_LEDGER_FALLBACK_CLAIM_LEASE_MS',
      DEFAULT_CLAIM_LEASE_MS,
      30_000,
      10 * 60_000,
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
