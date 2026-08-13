import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import type { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { LangameInitialSyncExecutionCurrent192Coordinator } from './langame-initial-sync-execution-current192.coordinator';
import { createLangameInitialSyncPlanCurrent191 } from './langame-initial-sync-plan-current191';

const tenantId = 'tenant-current192';
const userId = 'owner-current192';
const executionId = 'execution-current192';
const plan = createLangameInitialSyncPlanCurrent191({
  current188ContractVersion: 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  approvalDigest: 'a'.repeat(64),
  preflightReadSetDigest: 'b'.repeat(64),
  tenantId,
  storeId: 'store-current192',
  sourceId: 'source-current192',
  domain: '443.langame.ru',
  externalClubId: '42',
  readSet: { selectedClubs: 1, products: 1, inventoryItems: 1 },
  products: [{ id: 10, name: 'Water', active: 1 }],
  inventory: [{ id: 10, name: 'Water', count: 5 }],
});
const claimToken = 'claim-token-current192-abcdefghijklmnopqrstuvwxyz';
const dto = {
  executionId,
  approvalId: 'approval-current192',
  claimRequestId: 'claim-request-current192',
  claimRequestDigest: 'c'.repeat(64),
  claimToken,
  executionRequestId: 'execute-request-current192',
  executionRequestDigest: 'd'.repeat(64),
  plan,
} as const;
const user = { id: userId, tenantId } as never;

function claimReceipt(overrides: Record<string, unknown> = {}) {
  return [
    {
      executionId,
      status: 'CLAIMED',
      leaseExpiresAt: new Date('2026-08-13T09:00:00.000Z'),
      planDigest: plan.planDigest,
      replayed: false,
      ...overrides,
    },
  ];
}

function executionReceipt(overrides: Record<string, unknown> = {}) {
  return [
    {
      executionId,
      status: 'COMPLETED',
      snapshotDate: new Date('2026-08-13T00:00:00.000Z'),
      productsCount: 1,
      inventoryCount: 1,
      resultDigest: 'e'.repeat(64),
      replayed: false,
      ...overrides,
    },
  ];
}

function reconciliationReceipt(status: 'CLAIMED' | 'COMPLETED' | 'EXPIRED') {
  return [
    {
      executionId,
      status,
      productsCount: 1,
      inventoryCount: 1,
      resultDigest: status === 'COMPLETED' ? 'e'.repeat(64) : null,
      businessWritesCommitted: status === 'COMPLETED',
    },
  ];
}

describe('LangameInitialSyncExecutionCurrent192Coordinator', () => {
  let queryRaw: jest.Mock;
  let assertNetwork: jest.Mock;
  let configValues: Record<string, string | undefined>;
  let coordinator: LangameInitialSyncExecutionCurrent192Coordinator;

  beforeEach(() => {
    queryRaw = jest.fn();
    assertNetwork = jest.fn().mockResolvedValue({ tenantId, userId });
    configValues = {
      NODE_ENV: 'test',
      LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED: 'true',
    };
    coordinator = new LangameInitialSyncExecutionCurrent192Coordinator(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { assertNetwork } as unknown as FreshStoreScopeService,
      {
        get: jest.fn((key: string) => configValues[key]),
      } as unknown as ConfigService,
    );
  });

  it('remains absent from the active Nest module and controller', () => {
    for (const filename of [
      'integrations.module.ts',
      'langame.controller.ts',
    ]) {
      const source = readFileSync(join(__dirname, filename), 'utf8');
      expect(source).not.toContain(
        'LangameInitialSyncExecutionCurrent192Coordinator',
      );
      expect(source).not.toContain(
        'langame_initial_sync_execute_current192_v1',
      );
    }
  });

  it('is default-off before plan serialization or database access', async () => {
    configValues.LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED = undefined;

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution is disabled',
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('is unconditionally denied in production', async () => {
    configValues.NODE_ENV = 'production';

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution is not production-authorized',
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('claims and atomically executes one branded selected-Store plan', async () => {
    queryRaw
      .mockResolvedValueOnce(claimReceipt())
      .mockResolvedValueOnce(executionReceipt());

    const result = await coordinator.execute(user, dto);

    expect(result).toEqual({
      contractVersion: 'LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_V1',
      status: 'COMPLETED',
      executionId,
      snapshotDate: '2026-08-13T00:00:00.000Z',
      productsCount: 1,
      inventoryCount: 1,
      resultDigest: 'e'.repeat(64),
      replayed: false,
      reconciled: false,
      retried: false,
      providerWritesStarted: false,
      productionExecutionAllowed: false,
    });
    expect(assertNetwork).toHaveBeenCalledTimes(2);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(claimToken);
  });

  it('replays an ambiguous claim exactly once before execution', async () => {
    queryRaw
      .mockRejectedValueOnce(new Error('claim response lost'))
      .mockResolvedValueOnce(claimReceipt({ replayed: true }))
      .mockResolvedValueOnce(executionReceipt());

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('returns durable completion after an execution response is lost', async () => {
    queryRaw
      .mockResolvedValueOnce(claimReceipt())
      .mockRejectedValueOnce(new Error('execute response lost'))
      .mockResolvedValueOnce(reconciliationReceipt('COMPLETED'));

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
      replayed: true,
      reconciled: true,
      retried: false,
      snapshotDate: null,
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('retries execute only after reconciliation proves no committed writes', async () => {
    queryRaw
      .mockResolvedValueOnce(claimReceipt())
      .mockRejectedValueOnce(new Error('execute failed before commit'))
      .mockResolvedValueOnce(reconciliationReceipt('CLAIMED'))
      .mockResolvedValueOnce(executionReceipt());

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
      reconciled: false,
      retried: true,
    });
    expect(queryRaw).toHaveBeenCalledTimes(4);
  });

  it('fails closed after bounded retry without a terminal durable receipt', async () => {
    queryRaw
      .mockResolvedValueOnce(claimReceipt())
      .mockRejectedValueOnce(new Error('first execute failed'))
      .mockResolvedValueOnce(reconciliationReceipt('CLAIMED'))
      .mockRejectedValueOnce(new Error('retry response lost'))
      .mockResolvedValueOnce(reconciliationReceipt('CLAIMED'));

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution requires operator review',
    );
    expect(queryRaw).toHaveBeenCalledTimes(5);
  });

  it('rejects a cloned plan before any database effect', async () => {
    await expect(
      coordinator.execute(user, { ...dto, plan: structuredClone(plan) }),
    ).rejects.toThrow('Untrusted initial sync plan');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('stops after claim when fresh network authority changes', async () => {
    queryRaw.mockResolvedValueOnce(claimReceipt());
    assertNetwork
      .mockResolvedValueOnce({ tenantId, userId })
      .mockResolvedValueOnce({ tenantId, userId: 'different-owner' });

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync authority changed before execution',
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed database receipts without exposing raw data', async () => {
    queryRaw.mockResolvedValueOnce([
      { ...claimReceipt()[0], extra: 'untrusted' },
    ]);

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution claim is unavailable',
    );
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
