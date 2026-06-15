import { ConfigService } from '@nestjs/config';
import { GuestBonusLedgerSchedulerService } from './guest-bonus-ledger-scheduler.service';
import type {
  GuestBonusLedgerService,
  GuestGameScheduledBonusLedgerDispatchResult,
} from './guest-bonus-ledger.service';

function scheduledResult(
  overrides: Partial<GuestGameScheduledBonusLedgerDispatchResult> = {},
): GuestGameScheduledBonusLedgerDispatchResult {
  return {
    mode: 'DRY_RUN',
    dryRun: true,
    checkedTenants: 1,
    processedTenants: 1,
    skippedTenants: 0,
    erroredTenants: 0,
    queued: 0,
    checked: 2,
    confirmed: 0,
    failed: 0,
    skipped: 2,
    blocked: 0,
    tenants: [],
    note: 'dry-run',
    ...overrides,
  };
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const bonusLedgerService = {
    runScheduledDispatch: jest.fn().mockResolvedValue(scheduledResult()),
  };
  const service = new GuestBonusLedgerSchedulerService(
    configService,
    bonusLedgerService as unknown as GuestBonusLedgerService,
  );

  return { service, bonusLedgerService };
}

describe('GuestBonusLedgerSchedulerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stays disabled by default outside production', () => {
    const { service, bonusLedgerService } = createService();

    service.onModuleInit();

    expect(bonusLedgerService.runScheduledDispatch).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('starts automatically in production when sync token is configured', () => {
    const { service } = createService({
      NODE_ENV: 'production',
      SYNC_SERVICE_TOKEN: 'sync-token',
    });
    const runOnce = jest.spyOn(service, 'runOnce').mockResolvedValue(null);

    service.onModuleInit();

    expect(runOnce).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('passes scheduler env options to the scheduled bonus ledger dispatcher', async () => {
    const { service, bonusLedgerService } = createService({
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN: 'false',
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS: 'false',
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_LIMIT: '7',
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_TENANT_SLUG: 'demo',
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_REWARD_TYPES: 'BONUS,CASHBACK',
    });

    await service.runOnce();

    expect(bonusLedgerService.runScheduledDispatch).toHaveBeenCalledWith({
      dryRun: false,
      queueApprovedRewards: false,
      limit: 7,
      tenantSlug: 'demo',
      rewardTypes: ['BONUS', 'CASHBACK'],
    });
  });

  it('skips overlapping ticks while a previous dispatch is running', async () => {
    const { service, bonusLedgerService } = createService();
    let resolveDispatch:
      | ((result: GuestGameScheduledBonusLedgerDispatchResult) => void)
      | null = null;

    bonusLedgerService.runScheduledDispatch.mockReturnValue(
      new Promise<GuestGameScheduledBonusLedgerDispatchResult>((resolve) => {
        resolveDispatch = resolve;
      }),
    );

    const firstRun = service.runOnce();
    const secondRun = await service.runOnce();

    expect(secondRun).toBeNull();
    expect(bonusLedgerService.runScheduledDispatch).toHaveBeenCalledTimes(1);

    resolveDispatch?.(scheduledResult({ checked: 1 }));

    await expect(firstRun).resolves.toMatchObject({ checked: 1 });
  });
});
