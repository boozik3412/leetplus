import type { GuestGameScheduledBonusLedgerDispatchResult } from './guest-bonus-ledger.service';
import {
  loadGuestBonusLedgerWorkerConfig,
  runGuestBonusLedgerWorkerOnce,
} from './guest-bonus-ledger-worker';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL:
      'postgresql://leetplus_runtime:test-password@127.0.0.1:5432/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5',
    GUEST_BONUS_LEDGER_WORKER_ENABLED: 'true',
    GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG: 'demo',
    GUEST_BONUS_LEDGER_WORKER_DRY_RUN: 'true',
    GUEST_BONUS_LEDGER_WORKER_CANARY: 'true',
    GUEST_BONUS_LEDGER_WORKER_LIMIT: '1',
    GUEST_BONUS_LEDGER_WORKER_QUEUE_APPROVED_REWARDS: 'true',
    GUEST_BONUS_LEDGER_WORKER_REWARD_TYPES: 'BONUS_BALANCE',
    LANGAME_BONUS_ACCRUAL_ENABLED: 'false',
  };
}

function result(
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
    checked: 1,
    confirmed: 0,
    failed: 0,
    skipped: 1,
    blocked: 0,
    tenants: [],
    note: 'ok',
    ...overrides,
  };
}

describe('guest bonus ledger worker', () => {
  it('is fail-closed until the dedicated worker switch is enabled', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        GUEST_BONUS_LEDGER_WORKER_ENABLED: 'false',
      }),
    ).toThrow('GUEST_BONUS_LEDGER_WORKER_ENABLED=true is required');
  });

  it('fails closed when the worker database pool is not explicitly bounded', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        DATABASE_URL:
          'postgresql://leetplus_runtime:test-password@127.0.0.1:5432/leetplus?schema=public',
      }),
    ).toThrow('connection_limit=2');
  });

  it('rejects duplicate or broader worker database pool options', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        DATABASE_URL:
          'postgresql://leetplus_runtime:test-password@127.0.0.1:5432/leetplus?schema=public&connection_limit=2&connection_limit=2&pool_timeout=5&connect_timeout=5',
      }),
    ).toThrow('connection_limit=2');

    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        DATABASE_URL:
          'postgresql://leetplus_runtime:test-password@127.0.0.1:5432/leetplus?schema=public&connection_limit=3&pool_timeout=5&connect_timeout=5',
      }),
    ).toThrow('connection_limit=2');
  });

  it('requires exactly one bounded tenant scope', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        GUEST_BONUS_LEDGER_WORKER_TENANT_ID:
          '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow('Exactly one');
  });

  it('requires the Langame write gate for a live tick', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        GUEST_BONUS_LEDGER_WORKER_DRY_RUN: 'false',
      }),
    ).toThrow('LANGAME_BONUS_ACCRUAL_ENABLED=true');
  });

  it('forces a single item in canary mode', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        GUEST_BONUS_LEDGER_WORKER_LIMIT: '2',
      }),
    ).toThrow('must equal 1 in canary mode');
  });

  it('rejects an exact reward scope outside canary mode', () => {
    expect(() =>
      loadGuestBonusLedgerWorkerConfig({
        ...baseEnv(),
        GUEST_BONUS_LEDGER_WORKER_CANARY: 'false',
        GUEST_BONUS_LEDGER_WORKER_REWARD_ID:
          '00000000-0000-4000-8000-000000000002',
      }),
    ).toThrow('allowed only in canary mode');
  });

  it('runs one tenant-scoped dry-run and logs aggregates only', async () => {
    const service = {
      runScheduledDispatch: jest.fn().mockResolvedValue(result()),
    };
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await runGuestBonusLedgerWorkerOnce(service, baseEnv(), logger);

    expect(service.runScheduledDispatch).toHaveBeenCalledWith({
      dryRun: true,
      canary: true,
      queueApprovedRewards: true,
      limit: 1,
      rewardTypes: ['BONUS_BALANCE'],
      tenantSlug: 'demo',
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('confirmed=0'),
    );
    expect(logger.log.mock.calls.join(' ')).not.toContain('externalGuestId');
  });

  it('fails the systemd tick when the provider dispatch reports an error', async () => {
    const service = {
      runScheduledDispatch: jest
        .fn()
        .mockResolvedValue(result({ failed: 1, skipped: 0 })),
    };

    await expect(
      runGuestBonusLedgerWorkerOnce(service, baseEnv()),
    ).rejects.toThrow('Worker tick reported failures');
  });

  it('accepts a live canary only when the service enters READY mode', async () => {
    const env = {
      ...baseEnv(),
      GUEST_BONUS_LEDGER_WORKER_DRY_RUN: 'false',
      GUEST_BONUS_LEDGER_WORKER_REWARD_ID:
        '00000000-0000-4000-8000-000000000002',
      LANGAME_BONUS_ACCRUAL_ENABLED: 'true',
    };
    const service = {
      runScheduledDispatch: jest.fn().mockResolvedValue(
        result({
          mode: 'READY',
          dryRun: false,
          checked: 1,
          confirmed: 1,
          skipped: 0,
        }),
      ),
    };

    await expect(
      runGuestBonusLedgerWorkerOnce(service, env),
    ).resolves.toMatchObject({ confirmed: 1 });
    expect(service.runScheduledDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        canary: true,
        limit: 1,
        rewardId: '00000000-0000-4000-8000-000000000002',
      }),
    );
  });
});
