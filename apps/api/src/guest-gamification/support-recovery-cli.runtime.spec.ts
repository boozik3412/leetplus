import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { verifiedPlanActor } from './support-recovery.cli';
import {
  executeSupportRecoveryPlan,
  loadSupportRecoveryRuntimeProfile,
  loadSupportRecoveryPlan,
  reconcileC61SupportRecovery,
  reconcileDaSupportRecovery,
  reconcileLp571SupportRecovery,
  type SupportRecoveryRuntime,
} from './support-recovery-cli.runtime';

const runtime = (): SupportRecoveryRuntime => ({
  user: { id: 'operator' },
  da: {
    previewSupportRewardRecovery: jest.fn().mockResolvedValue({
      actionCount: 1,
      digest: 'da-digest',
      allowedRuleIds: ['weekend-rule'],
      secret: 'must-not-output',
    }),
    applySupportRewardRecovery: jest.fn().mockResolvedValue({
      outcome: 'APPLIED',
      digest: 'da-digest',
      secret: 'must-not-output',
    }),
  },
  c61: {
    execute: jest.fn().mockResolvedValue({
      outcome: 'READY',
      digest: 'c61-digest',
      secret: 'must-not-output',
    }),
  } as never,
  lp571: {
    preview: jest.fn().mockResolvedValue({
      confirmationHash: 'lp-digest',
      secret: 'must-not-output',
    }),
    reconcile: jest.fn(),
    apply: jest.fn().mockResolvedValue({ confirmationHash: 'lp-digest' }),
  },
  reconcile: {
    da: jest.fn().mockResolvedValue({ outcome: 'RECONCILED', actionCount: 1 }),
    c61: jest.fn().mockResolvedValue({ outcome: 'RECONCILED', actionCount: 1 }),
    lp571: jest
      .fn()
      .mockResolvedValue({ outcome: 'RECONCILED', actionCount: 1 }),
  },
});
const actorUserId = '11111111-1111-4111-8111-111111111111';
const actorMarkers = [
  ['508fbd17-6283-4b34-be5d-811075676097', 'LP-BUG-73CC9DFC'],
  ['8a84f807-53c1-4f74-8028-ba184662b93a', 'LP-BUG-AD120ECF'],
  ['b072ee9d-6de9-404a-a6b0-9fbc558c9a75', 'LP-BUG-CB'],
  ['70b685c7-aabe-46db-85be-59aaa13202ae', 'LP-BUG-79714142'],
] as const;
const profileInput = (
  profile: Record<string, unknown>,
  overrides: Partial<{
    isFile(): boolean;
    isSymbolicLink(): boolean;
    uid: number;
    gid: number;
    mode: number;
    nlink: number;
    size: number;
  }> = {},
) => {
  const bytes = Buffer.from(JSON.stringify(profile));
  const metadata = {
    isFile: () => true,
    isSymbolicLink: () => false,
    uid: 0,
    gid: process.getgid?.(),
    mode: 0o100440,
    nlink: 1,
    size: bytes.length,
    ...overrides,
  };
  return {
    expected: createHash('sha256').update(bytes).digest('hex'),
    fileSystem: {
      lstat: () => metadata,
      open: () => 7,
      fstat: () => metadata,
      read: (_fd: number, buffer: Buffer) => {
        bytes.copy(buffer);
        return bytes.length;
      },
      close: () => undefined,
    },
  };
};
const actorDb = (
  options: {
    active?: boolean;
    platform?: boolean;
    tenant?: string;
    auditTicketIds?: string[];
  } = {},
) => {
  const ticketIds = actorMarkers.map(([id]) => id);
  const tenantId = options.tenant ?? 'tenant-1';
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: actorUserId,
        tenantId,
        role: 'ADMIN',
        isActive: options.active ?? true,
        isPlatformAdmin: options.platform ?? true,
      }),
    },
    guestSupportTicket: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          actorMarkers.map(([id, ticketNumber]) => ({
            id,
            tenantId,
            ticketNumber,
          })),
        ),
    },
    guestSupportTicketAuditEvent: {
      findMany: jest.fn().mockResolvedValue(
        (options.auditTicketIds ?? ticketIds).map((ticketId) => ({
          ticketId,
        })),
      ),
    },
  };
};

describe('support recovery CLI runtime router', () => {
  const previous = process.env.LEETPLUS_SUPPORT_RECOVERY_CLI;
  beforeEach(() => {
    process.env.LEETPLUS_SUPPORT_RECOVERY_CLI = '1';
  });
  afterEach(() => {
    if (previous === undefined)
      delete process.env.LEETPLUS_SUPPORT_RECOVERY_CLI;
    else process.env.LEETPLUS_SUPPORT_RECOVERY_CLI = previous;
  });

  it('defaults DA to preview and emits only allowlisted fields', async () => {
    const value = await executeSupportRecoveryPlan(runtime(), {
      operation: 'DA_SUPPORT_RECOVERY',
      actorUserId,
    });
    expect(value).toEqual({
      operation: 'DA_SUPPORT_RECOVERY',
      mode: 'preview',
      outcome: null,
      digest: 'da-digest',
      confirmationHash: null,
      actionCount: 1,
    });
  });

  it('requires the explicit environment gate', async () => {
    delete process.env.LEETPLUS_SUPPORT_RECOVERY_CLI;
    await expect(
      executeSupportRecoveryPlan(runtime(), {
        operation: 'LP571_BATTLE_PASS',
        actorUserId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('routes reconcile to read-only LP571 terminal-chain verification', async () => {
    const r = runtime();
    await executeSupportRecoveryPlan(r, {
      operation: 'LP571_BATTLE_PASS',
      mode: 'reconcile',
      actorUserId,
    });
    expect((r.reconcile.lp571 as jest.Mock).mock.calls).toHaveLength(1);
    expect((r.lp571.preview as jest.Mock).mock.calls).toHaveLength(0);
    expect((r.lp571.apply as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('reconciles DA after a lost response without calling non-pristine preview', async () => {
    const r = runtime();
    r.da.previewSupportRewardRecovery = jest
      .fn()
      .mockRejectedValue(new Error('non-pristine preview'));
    await expect(
      executeSupportRecoveryPlan(r, {
        operation: 'DA_SUPPORT_RECOVERY',
        mode: 'reconcile',
        actorUserId,
      }),
    ).resolves.toMatchObject({ outcome: 'RECONCILED' });
    expect(
      (r.da.previewSupportRewardRecovery as jest.Mock).mock.calls,
    ).toHaveLength(0);
    expect((r.reconcile.da as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('requires complete exact LP571 apply material', async () => {
    await expect(
      executeSupportRecoveryPlan(runtime(), {
        operation: 'LP571_BATTLE_PASS',
        mode: 'apply',
        digest: 'lp-digest',
        actorUserId,
      }),
    ).rejects.toThrow('exact versions');
  });

  it('routes the sealed C61 plan without exposing profile data', async () => {
    const r = runtime();
    const value = await executeSupportRecoveryPlan(r, {
      operation: 'C61_BUDGET_REFILL',
      actorUserId,
    });
    expect(value).toEqual({
      operation: 'C61_BUDGET_REFILL',
      mode: 'preview',
      outcome: 'READY',
      digest: 'c61-digest',
      confirmationHash: null,
      actionCount: null,
    });
    expect((r.c61.execute as jest.Mock).mock.calls).toEqual([
      [
        r.user,
        expect.objectContaining({
          operation: 'C61_BUDGET_REFILL',
          mode: 'preview',
        }),
      ],
    ]);
  });

  it.each([
    [
      'DA',
      reconcileDaSupportRecovery,
      {
        events: 1n,
        receipts: 1n,
        entitlements: 1n,
        wallets: 1n,
        rewards: 0n,
        xp: 0n,
      },
    ],
    [
      'C61',
      reconcileC61SupportRecovery,
      {
        receipts: 1n,
        entitlements: 1n,
        wallets: 1n,
        audits: 1n,
        blocked: 1n,
        rewards: 0n,
        xp: 0n,
      },
    ],
    [
      'LP571',
      reconcileLp571SupportRecovery,
      { intents: 1n, rewards: 1n, wallets: 1n, xp: 0n, ledgers: 1n },
    ],
  ])(
    'reconciles an after-apply exact %s terminal chain read-only',
    async (_name, reconcile, row) => {
      const db = { $queryRaw: jest.fn().mockResolvedValue([row]) };
      await expect(reconcile(db)).resolves.toMatchObject({
        outcome: 'RECONCILED',
        actionCount: 1,
      });
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      'DA',
      reconcileDaSupportRecovery,
      {
        events: 1n,
        receipts: 1n,
        entitlements: 1n,
        wallets: 0n,
        rewards: 0n,
        xp: 0n,
      },
    ],
    [
      'C61',
      reconcileC61SupportRecovery,
      {
        receipts: 1n,
        entitlements: 2n,
        wallets: 1n,
        audits: 1n,
        blocked: 1n,
        rewards: 0n,
        xp: 0n,
      },
    ],
    [
      'LP571',
      reconcileLp571SupportRecovery,
      { intents: 1n, rewards: 1n, wallets: 1n, xp: 1n, ledgers: 0n },
    ],
  ])(
    'rejects partial or conflicting %s terminal chains',
    async (_name, reconcile, row) => {
      await expect(
        reconcile({ $queryRaw: jest.fn().mockResolvedValue([row]) }),
      ).rejects.toThrow('partial or conflicting');
    },
  );

  it('loads only a private direct runtime profile and never returns secret output', () => {
    const input = profileInput({
      DATABASE_URL: 'postgresql://private',
      API_SECRET: 'private',
    });
    expect(
      loadSupportRecoveryRuntimeProfile(
        '/run/secrets/runtime.json',
        input.fileSystem,
        input.expected,
      ),
    ).toEqual({
      DATABASE_URL: 'postgresql://private',
      API_SECRET: 'private',
    });
  });

  it.each([
    ['symlink', { isSymbolicLink: () => true }],
    ['wrong owner', { uid: 1000 }],
    ['wrong mode', { mode: 0o100400 }],
    ['multiple links', { nlink: 2 }],
  ])('rejects invalid runtime profile %s', (_name, overrides) => {
    const input = profileInput({ DATABASE_URL: 'x' }, overrides);
    expect(() =>
      loadSupportRecoveryRuntimeProfile(
        '/run/secrets/runtime.json',
        input.fileSystem,
        input.expected,
      ),
    ).toThrow();
  });

  it('rejects a mismatched runtime profile hash and nested envelope', () => {
    const input = profileInput({ DATABASE_URL: 'x', env: {} });
    expect(() =>
      loadSupportRecoveryRuntimeProfile(
        '/run/secrets/runtime.json',
        input.fileSystem,
        '0'.repeat(64),
      ),
    ).toThrow('SHA-256 mismatch');
    expect(() =>
      loadSupportRecoveryRuntimeProfile(
        '/run/secrets/runtime.json',
        input.fileSystem,
        input.expected,
      ),
    ).toThrow('Nested');
  });

  it.each([
    [
      '/run/support-recovery/../secrets/plan.json',
      { isSymbolicLink: () => false },
    ],
    ['/run/support-recovery/plan.json', { isSymbolicLink: () => true }],
  ])('rejects unsafe plan path %s', (path, overrides) => {
    const payload = {
      operation: 'LP571_BATTLE_PASS',
      actorUserId,
      runtimeProfileSha256: 'a'.repeat(64),
    };
    const input = profileInput(payload, overrides);
    expect(() => loadSupportRecoveryPlan(path, input.fileSystem)).toThrow();
  });

  it('binds the real active platform actor to every exact comment marker', async () => {
    await expect(
      verifiedPlanActor(actorDb() as never, actorUserId),
    ).resolves.toMatchObject({
      id: actorUserId,
      tenantId: 'tenant-1',
      isPlatformAdmin: true,
      platformTenantContext: true,
    });
  });

  it.each([
    ['inactive', actorDb({ active: false })],
    ['non-admin', actorDb({ platform: false })],
    [
      'missing comment marker',
      actorDb({ auditTicketIds: actorMarkers.slice(0, 3).map(([id]) => id) }),
    ],
  ])('rejects %s plan actor authority', async (_name, db) => {
    await expect(verifiedPlanActor(db as never, actorUserId)).rejects.toThrow();
  });
});
