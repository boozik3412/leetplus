import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createInertOutbound, verifiedPlanActor } from './support-recovery.cli';
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

function renderedSql(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('strings' in value) ||
    !Array.isArray(value.strings) ||
    !value.strings.every((part) => typeof part === 'string')
  )
    throw new Error('Expected a Prisma SQL query.');
  return value.strings.join('?');
}

const actorMarkers = [
  ['508fbd17-6283-4b34-be5d-811075676097', 'LP-BUG-73CC9DFC'],
  ['8a84f807-53c1-4f74-8028-ba184662b93a', 'LP-BUG-AD120ECF'],
  ['b072ee9d-6de9-404a-a6b0-9fbc558c9a75', 'LP-BUG-CB2114CE'],
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
    ticketNumberOverride?: string;
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
      findMany: jest.fn().mockResolvedValue(
        actorMarkers.map(([id, ticketNumber], index) => ({
          id,
          tenantId,
          ticketNumber:
            index === 0 && options.ticketNumberOverride
              ? options.ticketNumberOverride
              : ticketNumber,
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

  it('keeps the inert outbound outside Nest lifecycle discovery', () => {
    const outbound = createInertOutbound();
    expect(outbound.then).toBeUndefined();
    expect(outbound.onModuleInit).toBeUndefined();
    expect(outbound.onApplicationBootstrap).toBeUndefined();
    expect(outbound.beforeApplicationShutdown).toBeUndefined();
    expect(outbound.onModuleDestroy).toBeUndefined();
    expect(outbound.onApplicationShutdown).toBeUndefined();
    expect(outbound[Symbol.iterator]).toBeUndefined();
  });

  it('fails closed if recovery code reaches the inert outbound', () => {
    const outbound = createInertOutbound();
    expect(() => outbound.searchGuests?.()).toThrow(
      'Outbound dependency is inert in support recovery CLI.',
    );
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

  it.each([
    ['DA', reconcileDaSupportRecovery],
    ['C61', reconcileC61SupportRecovery],
  ])(
    'uses schema-backed reward links for %s reconcile rather than GuestGameReward.eventId',
    async (_name, reconcile) => {
      const queryRaw = jest.fn<Promise<never[]>, [unknown]>(() =>
        Promise.resolve([]),
      );
      const db = { $queryRaw: queryRaw };
      await expect(reconcile(db)).rejects.toThrow(
        'partial or conflicting terminal chain',
      );

      const sql = renderedSql(queryRaw.mock.calls[0]?.[0]);
      expect(sql).not.toContain('g."eventId"');
      expect(sql).toContain('g."tenantId"=');
      expect(sql).toContain('g."originKey"=');
      expect(sql).toContain('"GuestGameRewardIntent" i');
    },
  );

  it('keeps C61 reconcile bound to the admitted blocked decision', async () => {
    const queryRaw = jest.fn<Promise<never[]>, [unknown]>(() =>
      Promise.resolve([]),
    );
    const db = { $queryRaw: queryRaw };
    await expect(reconcileC61SupportRecovery(db)).rejects.toThrow(
      'partial or conflicting terminal chain',
    );

    const sql = renderedSql(queryRaw.mock.calls[0]?.[0]);
    expect(sql).toContain('d.id=?');
    expect(sql).toContain('d."tenantId"=r."tenantId"');
    expect(sql).toContain('d."profileId"=n."profileId"');
    expect(sql).toContain('d."ruleId"=?');
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
        intents: 1n,
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
        intents: 1n,
        xp: 0n,
      },
    ],
  ])(
    'rejects %s chains with an unexpected reward intent',
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

  it('loads an exact root-owned API-group-readable support plan', () => {
    const payload = {
      operation: 'DA_SUPPORT_RECOVERY' as const,
      mode: 'preview' as const,
      actorUserId,
      runtimeProfileSha256: 'a'.repeat(64),
    };
    const input = profileInput(payload);
    expect(
      loadSupportRecoveryPlan(
        '/run/support-recovery/plan.json',
        input.fileSystem,
      ),
    ).toEqual(payload);
  });

  it.each([
    ['wrong owner', { uid: 12010 }],
    ['wrong group', { gid: 12011 }],
    ['old root-only mode', { mode: 0o100600 }],
    ['group-writable mode', { mode: 0o100640 }],
    ['multiple links', { nlink: 2 }],
  ])('rejects invalid support plan metadata: %s', (_name, overrides) => {
    const payload = {
      operation: 'DA_SUPPORT_RECOVERY' as const,
      mode: 'preview' as const,
      actorUserId,
      runtimeProfileSha256: 'a'.repeat(64),
    };
    const input = profileInput(payload, overrides);
    expect(() =>
      loadSupportRecoveryPlan(
        '/run/support-recovery/plan.json',
        input.fileSystem,
      ),
    ).toThrow();
  });

  it('rejects a support plan whose mode changes after open', () => {
    const payload = {
      operation: 'DA_SUPPORT_RECOVERY' as const,
      mode: 'preview' as const,
      actorUserId,
      runtimeProfileSha256: 'a'.repeat(64),
    };
    const input = profileInput(payload);
    const fileSystem = {
      ...input.fileSystem,
      fstat: (fd: number) => ({
        ...input.fileSystem.fstat(fd),
        mode: 0o100400,
      }),
    };
    expect(() =>
      loadSupportRecoveryPlan('/run/support-recovery/plan.json', fileSystem),
    ).toThrow('changed after lstat');
  });

  it('binds the real active platform actor to every exact comment marker', async () => {
    const db = actorDb();
    await expect(
      verifiedPlanActor(db as never, actorUserId),
    ).resolves.toMatchObject({
      id: actorUserId,
      tenantId: 'tenant-1',
      isPlatformAdmin: true,
      platformTenantContext: true,
    });
    expect(db.guestSupportTicket.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: actorMarkers.map(([id]) => id) },
        status: 'CLOSED',
      },
      select: { id: true, tenantId: true, ticketNumber: true },
    });
    expect(db.guestSupportTicketAuditEvent.findMany).toHaveBeenCalledWith({
      where: {
        actorUserId,
        action: 'COMMENT_ADDED',
        ticketId: { in: actorMarkers.map(([id]) => id) },
      },
      select: { ticketId: true },
    });
  });

  it.each([
    ['inactive', actorDb({ active: false })],
    ['non-admin', actorDb({ platform: false })],
    [
      'missing comment marker',
      actorDb({ auditTicketIds: actorMarkers.slice(0, 3).map(([id]) => id) }),
    ],
    ['ticket number mismatch', actorDb({ ticketNumberOverride: 'LP-BUG-CB' })],
  ])('rejects %s plan actor authority', async (_name, db) => {
    await expect(verifiedPlanActor(db as never, actorUserId)).rejects.toThrow();
  });
});
