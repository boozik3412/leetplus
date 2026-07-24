import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestGameLootBoxSessionRecoveryService,
  type GuestGameLootBoxSessionRecoveryMode,
  type GuestGameLootBoxSessionRecoveryRunDto,
  type GuestGameLootBoxSessionRecoveryRunResult,
} from './guest-game-loot-box-session-recovery.service';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 30;
const DEFAULT_CORRELATION_WINDOW_MS = 60_000;
const DEFAULT_GRACE_MS = 60_000;
const DEFAULT_CLAIM_LEASE_MS = 120_000;
const DEFAULT_RETRY_BATCH_SIZE = 30;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60_000;
const SESSION_START_FALLBACK_FACT_TYPES = new Set([
  'SESSION_STARTED',
  'HOURLY_SESSION_STARTED',
  'PACKAGE_OR_SUBSCRIPTION_USED',
]);
const LEDGER_FALLBACK_LIVE_CONFLICT_REASON =
  'Generic guest game ledger fallback is LIVE for session-start facts in an overlapping scope. Disable the dedicated loot-box recovery pipeline.';

export type GuestGameLootBoxSessionRecoverySchedulerRuntimeStatus = {
  mode: GuestGameLootBoxSessionRecoveryMode;
  backgroundReady: boolean;
  disabledReason: string | null;
  blockedByLedgerFallback: boolean;
};

@Injectable()
export class GuestGameLootBoxSessionRecoverySchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    GuestGameLootBoxSessionRecoverySchedulerService.name,
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly recovery: GuestGameLootBoxSessionRecoveryService,
  ) {}

  onModuleInit() {
    const readiness = this.readiness();
    if (!readiness.ready) {
      this.logger.log(
        `Guest loot-box session recovery scheduler is disabled: ${readiness.disabledReason}`,
      );
      return;
    }
    const intervalMs = this.intervalMs();
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    this.logger.log(
      [
        'Guest loot-box session recovery scheduler started:',
        `mode=${this.mode()}`,
        `interval=${intervalMs}ms`,
        `batch=${this.batchSize()}`,
        `window=${this.correlationWindowMs()}ms`,
        `grace=${this.graceMs()}ms`,
        `retryBatch=${this.retryBatchSize()}`,
        `maxAttempts=${this.maxAttempts()}`,
        `lookback=${this.lookbackMs()}ms`,
      ].join(' '),
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<GuestGameLootBoxSessionRecoveryRunResult | null> {
    if (this.running || !this.backgroundReady()) return null;
    this.running = true;
    try {
      const result = await this.recovery.runScheduled(this.runDto());
      if (
        result.checkedSessions > 0 ||
        result.failedSessions > 0 ||
        result.recoveredSessions > 0
      ) {
        this.logger.log(
          [
            'Guest loot-box session recovery finished:',
            `mode=${result.mode}`,
            `tenants=${result.processedTenants}/${result.checkedTenants}`,
            `checked=${result.checkedSessions}`,
            `correlated=${result.correlatedSessions}`,
            `ambiguous=${result.ambiguousSessions}`,
            `shadow=${result.shadowSessions}`,
            `recovered=${result.recoveredSessions}`,
            `duplicates=${result.duplicateSessions}`,
            `failed=${result.failedSessions}`,
          ].join(' '),
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        'Guest loot-box session recovery failed',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  getRuntimeStatus(): GuestGameLootBoxSessionRecoverySchedulerRuntimeStatus {
    const readiness = this.readiness();
    return {
      mode: this.mode(),
      backgroundReady: readiness.ready,
      disabledReason: readiness.disabledReason,
      blockedByLedgerFallback: readiness.blockedByLedgerFallback,
    };
  }

  private runDto(): GuestGameLootBoxSessionRecoveryRunDto {
    const dto: GuestGameLootBoxSessionRecoveryRunDto = {
      mode: this.mode(),
      limit: this.batchSize(),
      correlationWindowMs: this.correlationWindowMs(),
      graceMs: this.graceMs(),
      claimLeaseMs: this.claimLeaseMs(),
      retryLimit: this.retryBatchSize(),
      maxAttempts: this.maxAttempts(),
      lookbackMs: this.lookbackMs(),
      overlapLimit: this.overlapLimit(),
    };
    const tenantId = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID',
    );
    const tenantSlug = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_SLUG',
    );
    const profileId = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID',
    );
    const liveNotBefore = this.liveNotBefore();
    if (tenantId) dto.tenantId = tenantId;
    if (tenantSlug) dto.tenantSlug = tenantSlug;
    if (profileId) dto.profileId = profileId;
    if (liveNotBefore) dto.liveNotBefore = liveNotBefore.toISOString();
    if (this.allowAllTenants()) dto.allowAllTenants = true;
    return dto;
  }

  private backgroundReady() {
    return this.readiness().ready;
  }

  private readiness(): {
    ready: boolean;
    disabledReason: string | null;
    blockedByLedgerFallback: boolean;
  } {
    const mode = this.mode();
    if (mode === 'OFF') {
      return this.disabledReadiness('Recovery mode is OFF.');
    }
    if (this.killSwitchEnabled()) {
      return this.disabledReadiness(
        'The dedicated recovery kill switch is enabled or not explicitly false.',
      );
    }
    const tenantConfigured = Boolean(
      this.optionalString('GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID') ||
      this.optionalString('GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_SLUG'),
    );
    if (mode === 'SHADOW') {
      return tenantConfigured || this.allowAllTenants()
        ? this.readyReadiness()
        : this.disabledReadiness(
            'SHADOW mode requires a tenant scope or allow-all-tenants.',
          );
    }
    if (!tenantConfigured) {
      return this.disabledReadiness('LIVE mode requires a tenant scope.');
    }
    if (!this.optionalString('GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID')) {
      return this.disabledReadiness('LIVE mode requires a profile scope.');
    }
    if (!this.liveNotBefore()) {
      return this.disabledReadiness('LIVE mode requires a valid cutoff.');
    }
    if (this.allowAllTenants()) {
      return this.disabledReadiness('LIVE mode cannot use allow-all-tenants.');
    }
    if (!this.entitlementReadReady()) {
      return this.disabledReadiness(
        'LIVE mode requires entitlement reads for the exact canary scope.',
      );
    }
    if (this.overlapsLiveLedgerSessionStartFallback()) {
      return this.disabledReadiness(LEDGER_FALLBACK_LIVE_CONFLICT_REASON, true);
    }
    return this.readyReadiness();
  }

  private readyReadiness() {
    return {
      ready: true,
      disabledReason: null,
      blockedByLedgerFallback: false,
    };
  }

  private disabledReadiness(
    disabledReason: string,
    blockedByLedgerFallback = false,
  ) {
    return {
      ready: false,
      disabledReason,
      blockedByLedgerFallback,
    };
  }

  private overlapsLiveLedgerSessionStartFallback() {
    if (
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_MODE')?.toUpperCase() !==
        'LIVE' ||
      this.optionalBoolean('GUEST_GAME_LEDGER_FALLBACK_KILL_SWITCH') ||
      !this.ledgerFallbackHasSessionStartFacts() ||
      !this.ledgerFallbackLiveReady()
    ) {
      return false;
    }

    return (
      this.ledgerFallbackTenantScopeOverlaps() &&
      this.ledgerFallbackProfileScopeOverlaps()
    );
  }

  private ledgerFallbackHasSessionStartFacts() {
    const configured = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_FACT_TYPES',
    );
    // The generic scheduler's safe default contains duration facts only.
    // Missing/empty configuration therefore cannot overlap this dedicated
    // session-start recovery worker.
    if (!configured) return false;
    return configured
      .split(',')
      .map((factType) => factType.trim().toUpperCase())
      .some((factType) => SESSION_START_FALLBACK_FACT_TYPES.has(factType));
  }

  private ledgerFallbackLiveReady() {
    const tenantConfigured = Boolean(
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_TENANT_ID') ||
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG'),
    );
    const canaryConfigured = Boolean(
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_PROFILE_ID') &&
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_SEASON_ID') &&
      this.optionalPositiveInteger(
        'GUEST_GAME_LEDGER_FALLBACK_BATTLE_PASS_STEP',
      ) !== null,
    );
    return Boolean(
      tenantConfigured &&
      (this.optionalBoolean(
        'GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES',
      ) ||
        canaryConfigured) &&
      !this.optionalBoolean('GUEST_GAME_LEDGER_FALLBACK_ALLOW_ALL_TENANTS') &&
      this.validDate(
        this.optionalString('GUEST_GAME_LEDGER_FALLBACK_LIVE_NOT_BEFORE'),
      ),
    );
  }

  private ledgerFallbackTenantScopeOverlaps() {
    const recoveryTenantId = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID',
    );
    const fallbackTenantId = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_TENANT_ID',
    );
    if (
      recoveryTenantId &&
      fallbackTenantId &&
      recoveryTenantId !== fallbackTenantId
    ) {
      return false;
    }

    const recoveryTenantSlug = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_SLUG',
    )?.toLowerCase();
    const fallbackTenantSlug = this.optionalString(
      'GUEST_GAME_LEDGER_FALLBACK_TENANT_SLUG',
    )?.toLowerCase();
    if (
      recoveryTenantSlug &&
      fallbackTenantSlug &&
      recoveryTenantSlug !== fallbackTenantSlug
    ) {
      return false;
    }

    // An ID-only scope cannot be proven disjoint from a slug-only scope using
    // static configuration. Treat the ambiguous case as overlapping.
    return true;
  }

  private ledgerFallbackProfileScopeOverlaps() {
    if (
      this.optionalBoolean(
        'GUEST_GAME_LEDGER_FALLBACK_PLAY_TIME_ALLOW_ALL_PROFILES',
      )
    ) {
      return true;
    }
    return (
      this.optionalString('GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID') ===
      this.optionalString('GUEST_GAME_LEDGER_FALLBACK_PROFILE_ID')
    );
  }

  private optionalPositiveInteger(key: string) {
    const value = this.optionalString(key);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private validDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  /**
   * Recovery persists an entitlement rather than a legacy unlock event. LIVE
   * must therefore stay disabled unless the guest portal can actually consume
   * that entitlement for the exact canary scope.
   */
  private entitlementReadReady() {
    const mode = this.optionalString(
      'GUEST_GAME_ENTITLEMENT_READ_MODE',
    )?.toUpperCase();
    if (mode === 'PRIMARY') return true;
    if (mode !== 'CANARY') return false;

    const tenantId = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_TENANT_ID',
    );
    const profileId = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_PROFILE_ID',
    );
    const tenantIds = this.idSet('GUEST_GAME_ENTITLEMENT_CANARY_TENANT_IDS');
    const profileIds = this.idSet('GUEST_GAME_ENTITLEMENT_CANARY_PROFILE_IDS');
    const storeIds = this.idSet('GUEST_GAME_ENTITLEMENT_CANARY_STORE_IDS');
    const lootBoxIds = this.idSet('GUEST_GAME_ENTITLEMENT_CANARY_LOOT_BOX_IDS');
    const hasScope =
      tenantIds.size > 0 ||
      profileIds.size > 0 ||
      storeIds.size > 0 ||
      lootBoxIds.size > 0;

    // This scheduler is scoped by tenant/profile, not by one store or one
    // lootbox. Store/lootbox read scopes would make only part of a recovery
    // batch openable, so fail closed instead of producing invisible rights.
    return Boolean(
      hasScope &&
      profileId &&
      storeIds.size === 0 &&
      lootBoxIds.size === 0 &&
      (tenantIds.size === 0 || (tenantId && tenantIds.has(tenantId))) &&
      (profileIds.size === 0 || profileIds.has(profileId)),
    );
  }

  private mode(): GuestGameLootBoxSessionRecoveryMode {
    const mode = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_MODE',
    )?.toUpperCase();
    return mode === 'LIVE' || mode === 'SHADOW' ? mode : 'OFF';
  }

  private liveNotBefore() {
    const value = this.optionalString(
      'GUEST_GAME_LOOT_BOX_RECOVERY_LIVE_NOT_BEFORE',
    );
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  private allowAllTenants() {
    return this.optionalBoolean(
      'GUEST_GAME_LOOT_BOX_RECOVERY_ALLOW_ALL_TENANTS',
    );
  }

  private killSwitchEnabled() {
    // Recovery may create a guest-visible entitlement. Require an explicitly
    // disabled kill switch before the worker can run; missing or malformed
    // values fail closed instead of being interpreted as `false`.
    return (
      this.strictBoolean('GUEST_GAME_LOOT_BOX_RECOVERY_KILL_SWITCH') !== false
    );
  }

  private intervalMs() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_INTERVAL_MS',
      DEFAULT_INTERVAL_MS,
      5_000,
      5 * 60_000,
    );
  }

  private batchSize() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
  }

  private correlationWindowMs() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_CORRELATION_WINDOW_MS',
      DEFAULT_CORRELATION_WINDOW_MS,
      1_000,
      60_000,
    );
  }

  private graceMs() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_GRACE_MS',
      DEFAULT_GRACE_MS,
      0,
      10 * 60_000,
    );
  }

  private claimLeaseMs() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_CLAIM_LEASE_MS',
      DEFAULT_CLAIM_LEASE_MS,
      30_000,
      10 * 60_000,
    );
  }

  private retryBatchSize() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_RETRY_BATCH_SIZE',
      DEFAULT_RETRY_BATCH_SIZE,
      1,
      100,
    );
  }

  private maxAttempts() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
      1,
      20,
    );
  }

  private lookbackMs() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_LOOKBACK_MS',
      DEFAULT_LOOKBACK_MS,
      60_000,
      7 * 24 * 60 * 60_000,
    );
  }

  private overlapLimit() {
    return this.positiveInteger(
      'GUEST_GAME_LOOT_BOX_RECOVERY_OVERLAP_BATCH_SIZE',
      this.batchSize(),
      1,
      100,
    );
  }

  private optionalBoolean(key: string) {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value ?? '');
  }

  private strictBoolean(key: string): boolean | null {
    const value = this.config.get<string>(key)?.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value ?? '')) return true;
    if (['0', 'false', 'no', 'off'].includes(value ?? '')) return false;
    return null;
  }

  private optionalString(key: string) {
    return this.config.get<string>(key)?.trim() || null;
  }

  private idSet(key: string) {
    return new Set(
      (this.config.get<string>(key) ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
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
