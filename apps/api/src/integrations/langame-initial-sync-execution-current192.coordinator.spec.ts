import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import {
  LangameInitialSyncExecutionCurrent192Coordinator,
  type LangameInitialSyncCurrent192Database,
} from './langame-initial-sync-execution-current192.coordinator';
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
  let claimCurrent192: jest.MockedFunction<
    LangameInitialSyncCurrent192Database['claimCurrent192']
  >;
  let executeCurrent192: jest.MockedFunction<
    LangameInitialSyncCurrent192Database['executeCurrent192']
  >;
  let reconcileCurrent192: jest.MockedFunction<
    LangameInitialSyncCurrent192Database['reconcileCurrent192']
  >;
  let assertNetwork: jest.Mock;
  let configValues: Record<string, string | undefined>;
  let coordinator: LangameInitialSyncExecutionCurrent192Coordinator;

  beforeEach(() => {
    claimCurrent192 = jest.fn();
    executeCurrent192 = jest.fn();
    reconcileCurrent192 = jest.fn();
    assertNetwork = jest.fn().mockResolvedValue({ tenantId, userId });
    configValues = {
      NODE_ENV: 'test',
      LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED: 'true',
    };
    coordinator = new LangameInitialSyncExecutionCurrent192Coordinator(
      { claimCurrent192, executeCurrent192, reconcileCurrent192 },
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
    const coordinatorSource = readFileSync(
      join(
        __dirname,
        'langame-initial-sync-execution-current192.coordinator.ts',
      ),
      'utf8',
    );
    expect(coordinatorSource).not.toContain('PrismaService');
    expect(coordinatorSource).not.toContain('$queryRaw');
    expect(coordinatorSource).toContain(
      'LANGAME_INITIAL_SYNC_CURRENT192_DATABASE',
    );
    expect(coordinatorSource).not.toContain("from '@prisma/client'");
    expect(coordinatorSource).toContain('claimCurrent192');
    expect(coordinatorSource).toContain('executeCurrent192');
    expect(coordinatorSource).toContain('reconcileCurrent192');
  });

  it('is default-off before plan serialization or database access', async () => {
    configValues.LANGAME_INITIAL_SYNC_EXECUTION_CURRENT192_ENABLED = undefined;

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution is disabled',
    );
    expect(databaseEffectCount()).toBe(0);
  });

  it('is unconditionally denied in production', async () => {
    configValues.NODE_ENV = 'production';

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution is not production-authorized',
    );
    expect(databaseEffectCount()).toBe(0);
  });

  it('claims and atomically executes one branded selected-Store plan', async () => {
    claimCurrent192.mockResolvedValueOnce(claimReceipt());
    executeCurrent192.mockResolvedValueOnce(executionReceipt());

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
    expect(databaseEffectCount()).toBe(2);
    expect(claimCurrent192.mock.calls[0]?.[0]).toEqual({
      executionId,
      tenantId,
      actorUserId: userId,
      approvalId: dto.approvalId,
      claimRequestId: dto.claimRequestId,
      claimRequestDigest: dto.claimRequestDigest,
      claimToken,
      planDigest: plan.planDigest,
    });
    expect(Object.isFrozen(claimCurrent192.mock.calls[0]?.[0])).toBe(true);
    expect(JSON.stringify(result)).not.toContain(claimToken);
  });

  it('replays an ambiguous claim exactly once before execution', async () => {
    claimCurrent192
      .mockRejectedValueOnce(new Error('claim response lost'))
      .mockResolvedValueOnce(claimReceipt({ replayed: true }));
    executeCurrent192.mockResolvedValueOnce(executionReceipt());

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(databaseEffectCount()).toBe(3);
    expect(claimCurrent192.mock.calls[0]?.[0]).toBe(
      claimCurrent192.mock.calls[1]?.[0],
    );
  });

  it('returns durable completion after an execution response is lost', async () => {
    claimCurrent192.mockResolvedValueOnce(claimReceipt());
    executeCurrent192.mockRejectedValueOnce(new Error('execute response lost'));
    reconcileCurrent192.mockResolvedValueOnce(
      reconciliationReceipt('COMPLETED'),
    );

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
      replayed: true,
      reconciled: true,
      retried: false,
      snapshotDate: null,
    });
    expect(databaseEffectCount()).toBe(3);
  });

  it('retries execute only after reconciliation proves no committed writes', async () => {
    claimCurrent192.mockResolvedValueOnce(claimReceipt());
    executeCurrent192
      .mockRejectedValueOnce(new Error('execute failed before commit'))
      .mockResolvedValueOnce(executionReceipt());
    reconcileCurrent192.mockResolvedValueOnce(reconciliationReceipt('CLAIMED'));

    await expect(coordinator.execute(user, dto)).resolves.toMatchObject({
      status: 'COMPLETED',
      reconciled: false,
      retried: true,
    });
    expect(databaseEffectCount()).toBe(4);
    expect(executeCurrent192.mock.calls[0]?.[0]).toBe(
      executeCurrent192.mock.calls[1]?.[0],
    );
  });

  it('fails closed after bounded retry without a terminal durable receipt', async () => {
    claimCurrent192.mockResolvedValueOnce(claimReceipt());
    executeCurrent192
      .mockRejectedValueOnce(new Error('first execute failed'))
      .mockRejectedValueOnce(new Error('retry response lost'));
    reconcileCurrent192
      .mockResolvedValueOnce(reconciliationReceipt('CLAIMED'))
      .mockResolvedValueOnce(reconciliationReceipt('CLAIMED'));

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution requires operator review',
    );
    expect(databaseEffectCount()).toBe(5);
  });

  it('rejects a cloned plan before any database effect', async () => {
    await expect(
      coordinator.execute(user, { ...dto, plan: structuredClone(plan) }),
    ).rejects.toThrow('Untrusted initial sync plan');
    expect(databaseEffectCount()).toBe(0);
  });

  it('stops after claim when fresh network authority changes', async () => {
    claimCurrent192.mockResolvedValueOnce(claimReceipt());
    assertNetwork
      .mockResolvedValueOnce({ tenantId, userId })
      .mockResolvedValueOnce({ tenantId, userId: 'different-owner' });

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync authority changed before execution',
    );
    expect(databaseEffectCount()).toBe(1);
  });

  it('rejects malformed database receipts without exposing raw data', async () => {
    claimCurrent192.mockResolvedValueOnce([
      { ...claimReceipt()[0], extra: 'untrusted' },
    ]);

    await expect(coordinator.execute(user, dto)).rejects.toThrow(
      'CURRENT192 initial sync execution claim is unavailable',
    );
    expect(claimCurrent192).toHaveBeenCalledTimes(2);
    expect(databaseEffectCount()).toBe(2);
  });

  function databaseEffectCount() {
    return (
      claimCurrent192.mock.calls.length +
      executeCurrent192.mock.calls.length +
      reconcileCurrent192.mock.calls.length
    );
  }
});
