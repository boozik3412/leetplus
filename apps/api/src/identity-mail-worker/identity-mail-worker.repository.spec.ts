import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  IdentityMailWorkerRepositoryError,
  PrismaIdentityMailWorkerRepository,
} from './identity-mail-worker.repository';
import type {
  IdentityMailDeliveryLeaseInput,
  MarkIdentityMailProviderAttemptInput,
} from './identity-mail-worker.types';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';
const OUTBOX_ID = '44444444-4444-4444-8444-444444444444';
const WORKFLOW_LOCATOR = '55555555-5555-4555-8555-555555555555';
const MESSAGE_KEY = '66666666-6666-4666-8666-666666666666';
const PROVIDER_ATTEMPT_KEY = '77777777-7777-4777-8777-777777777777';
const LEASE_TOKEN = 'L'.repeat(43);
const MESSAGE_ID = `<initial-owner-${MESSAGE_KEY}@mail.leetplus.ru>`;
const LEASE_OWNER_DIGEST = 'a'.repeat(64);
const LEASE_TOKEN_DIGEST = createHash('sha256')
  .update(LEASE_TOKEN)
  .digest('hex');
const PROVIDER_AUTHORITY_DIGEST = 'c'.repeat(64);
const PROVIDER_RECEIPT_DIGEST = 'd'.repeat(64);
const TENANT_TRANSACTION_SETTINGS = {
  isolationLevel: 'serializable',
  readOnly: 'off',
  statementTimeout: '25s',
  lockTimeout: '5s',
} as const;
const ALLOWED_WORKER_RPC_SIGNATURES = [
  'public.identity_initial_owner_mail_claim_v1(text, text, text, text)',
  'public.identity_initial_owner_mail_complete_v1(text, integer, text, text, text, text, text)',
  'public.identity_initial_owner_mail_provider_mark_v1(text, integer, text, text, text, text, text)',
  'public.identity_initial_owner_mail_reap_v1(text, text, text, integer)',
  'public.identity_mail_delivery_worker_assert_v1(text)',
];

type PrismaMock = {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
  transactionQueryRaw: jest.Mock;
  rpcQueryRaw: jest.Mock;
};

function prismaMock(): PrismaMock {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    transactionQueryRaw: jest.fn(),
    rpcQueryRaw: jest.fn(),
  };
  prisma.transactionQueryRaw.mockImplementation((query: Prisma.Sql) => {
    const sql = query.strings.join('');
    if (sql.includes("current_setting('transaction_isolation')")) {
      return Promise.resolve([TENANT_TRANSACTION_SETTINGS]);
    }
    if (sql.includes('pg_catalog.pg_advisory_xact_lock')) {
      return Promise.resolve([{ tenantId: TENANT_ID, backendPid: 12_345 }]);
    }
    return prisma.rpcQueryRaw(query) as Promise<unknown>;
  });
  prisma.$transaction.mockImplementation(
    (operation: (tx: { $queryRaw: jest.Mock }) => Promise<unknown>) =>
      operation({ $queryRaw: prisma.transactionQueryRaw }),
  );
  return prisma;
}

function harness() {
  const prisma = prismaMock();
  return {
    prisma,
    repository: new PrismaIdentityMailWorkerRepository(
      prisma as unknown as PrismaClient,
    ),
  };
}

function clearRepositoryMocks(prisma: PrismaMock): void {
  prisma.$queryRaw.mockClear();
  prisma.$transaction.mockClear();
  prisma.transactionQueryRaw.mockClear();
  prisma.rpcQueryRaw.mockClear();
}

async function primeClaimBinding(
  prisma: PrismaMock,
  repository: PrismaIdentityMailWorkerRepository,
): Promise<void> {
  prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: claimResult() }]);
  await repository.claimOne({
    tenantId: TENANT_ID,
    leaseOwnerDigest: LEASE_OWNER_DIGEST,
    leaseTokenDigest: LEASE_TOKEN_DIGEST,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
  });
  clearRepositoryMocks(prisma);
}

async function primeProviderMarkedBinding(
  prisma: PrismaMock,
  repository: PrismaIdentityMailWorkerRepository,
): Promise<void> {
  await primeClaimBinding(prisma, repository);
  prisma.rpcQueryRaw.mockResolvedValueOnce([
    {
      result: {
        schemaVersion: 1,
        operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
        decision: 'MARKED',
        reasonCode: null,
        outboxId: OUTBOX_ID,
        tenantId: TENANT_ID,
        inviteId: INVITE_ID,
        leaseVersion: 1,
        transitionRevision: 2,
        providerAttemptKey: PROVIDER_ATTEMPT_KEY,
      },
    },
  ]);
  await repository.markProviderAttempt(providerAttemptInput());
  clearRepositoryMocks(prisma);
}

function readinessInput() {
  return {
    expectedDatabase: 'leetplus_beta',
    expectedRole: 'leetplus_identity_mail_worker',
    databaseTlsRequired: true,
    expectedMigration: '20260731120000_identity_mail_delivery_release_head',
    expectedMigrationCount: 179,
    releaseSha: 'e'.repeat(40),
    canaryTenantIds: [TENANT_ID],
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    expectedPolicy: {
      maxAttempts: 5,
      leaseSeconds: 120,
      minimumAcknowledgeSeconds: 10,
      baseRetrySeconds: 60,
      maxRetrySeconds: 3600,
    },
  };
}

function readinessRow(overrides: Record<string, unknown> = {}) {
  return {
    databaseName: 'leetplus_beta',
    sessionRole: 'leetplus_identity_mail_worker',
    currentRole: 'leetplus_identity_mail_worker',
    transportTls: true,
    transportTlsVersion: 'TLSv1.3',
    transportTlsCipher: 'TLS_AES_256_GCM_SHA384',
    effectiveDatabaseCreate: false,
    effectiveDatabaseTemporary: false,
    roleOid: 16_384n,
    canLogin: true,
    inherits: false,
    superuser: false,
    createRole: false,
    createDatabase: false,
    replication: false,
    bypassRls: false,
    membershipCount: 0n,
    roleSettingCount: 0n,
    ownedObjectCount: 0n,
    publicUsage: true,
    publicCreate: false,
    effectiveSchemaUsageCount: 1n,
    effectiveSchemaCreateCount: 0n,
    effectiveRelationPrivilegeCount: 0n,
    effectiveColumnPrivilegeCount: 0n,
    effectiveSequencePrivilegeCount: 0n,
    effectiveRoutineExecuteCount: 5n,
    directRoutineExecuteCount: 5n,
    directRoutineGrantOptionCount: 0n,
    publicRoutineExecuteCount: 0n,
    effectiveRoutineSignatures: ALLOWED_WORKER_RPC_SIGNATURES,
    ...overrides,
  };
}

function readinessReceipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    operation: 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER',
    decision: 'READY',
    tenantId: TENANT_ID,
    migrationHead: '20260731120000_identity_mail_delivery_release_head',
    migrationCount: 179,
    preterminalManifestDigest:
      '7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14',
    policyRevision: 1,
    maxAttempts: 5,
    leaseSeconds: 120,
    acknowledgeSeconds: 60,
    baseRetrySeconds: 60,
    maxRetrySeconds: 3600,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    ...overrides,
  };
}

function claimResult(tenantId = TENANT_ID) {
  return {
    schemaVersion: 1,
    operation: 'CLAIM_INITIAL_OWNER_MAIL',
    decision: 'CLAIMED',
    tenantId,
    workflowLocator: WORKFLOW_LOCATOR,
    inviteId: INVITE_ID,
    outboxId: OUTBOX_ID,
    template: 'INITIAL_OWNER_INVITE',
    messageKey: MESSAGE_KEY,
    requestDigest: 'f'.repeat(64),
    tokenHash: '1'.repeat(64),
    digestVersion: 'sha256-v1',
    secretCiphertextBase64: Buffer.alloc(71, 7).toString('base64'),
    envelopeVersion: 1,
    keyVersion: 'v1',
    aadEnvironment: 'production',
    expiresAt: '2099-01-01T00:00:00.000Z',
    recipientEmail: 'owner@example.test',
    leaseVersion: 1,
    transitionRevision: 1,
    attemptNumber: 1,
  };
}

function leaseInput(
  expectedTransitionRevision = 1,
): IdentityMailDeliveryLeaseInput {
  return {
    tenantId: TENANT_ID,
    outboxId: OUTBOX_ID,
    leaseVersion: 1n,
    expectedTransitionRevision,
    leaseOwnerDigest: LEASE_OWNER_DIGEST,
    leaseToken: LEASE_TOKEN,
  };
}

function providerAttemptInput(): MarkIdentityMailProviderAttemptInput {
  return {
    ...leaseInput(),
    inviteId: INVITE_ID,
    messageId: MESSAGE_ID,
    providerAttemptKey: PROVIDER_ATTEMPT_KEY,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
  };
}

function queryFrom(prisma: PrismaMock): Prisma.Sql {
  const query = (prisma.rpcQueryRaw.mock.calls as unknown[][])[0]?.[0];
  if (!query) {
    throw new Error('Expected a parameterized repository query');
  }
  return query as Prisma.Sql;
}

function transactionQueryFrom(prisma: PrismaMock, index: number): Prisma.Sql {
  const query = (prisma.transactionQueryRaw.mock.calls as unknown[][])[
    index
  ]?.[0];
  if (!query) {
    throw new Error(`Expected tenant transaction query ${index + 1}`);
  }
  return query as Prisma.Sql;
}

function expectTenantRpcEnvelope(
  prisma: PrismaMock,
  rpcName: string,
  rootQueryCount = 0,
): void {
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  const transactionCall = (prisma.$transaction.mock.calls as unknown[][])[0];
  expect(transactionCall?.[1]).toEqual({
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 30_000,
  });
  expect(prisma.transactionQueryRaw).toHaveBeenCalledTimes(3);

  const settingsQuery = transactionQueryFrom(prisma, 0);
  const lockQuery = transactionQueryFrom(prisma, 1);
  const rpcQuery = transactionQueryFrom(prisma, 2);
  expect(settingsQuery.strings.join('')).toContain(
    "current_setting('transaction_isolation')",
  );
  expect(settingsQuery.strings.join('')).toContain(
    "current_setting('transaction_read_only')",
  );
  expect(settingsQuery.strings.join('')).toContain(
    "set_config(\n            'statement_timeout'",
  );
  expect(settingsQuery.strings.join('')).toContain(
    "set_config(\n            'lock_timeout'",
  );
  expect(settingsQuery.values).toEqual(['25s', '5s']);
  expect(lockQuery.strings.join('')).toContain(
    'WITH tenant_lock AS MATERIALIZED',
  );
  expect(lockQuery.strings.join('')).toContain(
    'pg_catalog.pg_advisory_xact_lock',
  );
  expect(lockQuery.strings.join('')).toContain('pg_catalog.hashtextextended');
  expect(lockQuery.values).toEqual([
    'leetplus:identity-mail-tenant:v1:',
    TENANT_ID,
    180,
    TENANT_ID,
  ]);
  expect(rpcQuery.strings.join('')).toContain(rpcName);
  expect(queryFrom(prisma)).toBe(rpcQuery);
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(rootQueryCount);
  if (rootQueryCount > 0) {
    const rootQuery = (prisma.$queryRaw.mock.calls as unknown[][])[0]?.[0] as
      | Prisma.Sql
      | undefined;
    if (!rootQuery) {
      throw new Error('Expected the root readiness projection');
    }
    expect(rootQuery.strings.join('')).not.toContain(rpcName);
  }

  const callOrder = [
    prisma.transactionQueryRaw.mock.invocationCallOrder[0],
    prisma.transactionQueryRaw.mock.invocationCallOrder[1],
    prisma.transactionQueryRaw.mock.invocationCallOrder[2],
  ];
  expect(callOrder).toEqual([...callOrder].sort((left, right) => left - right));
}

async function rejectionOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

function expectReason(error: unknown, reasonCode: string): void {
  expect(error).toBeInstanceOf(IdentityMailWorkerRepositoryError);
  expect((error as IdentityMailWorkerRepositoryError).reasonCode).toBe(
    reasonCode,
  );
}

type TenantRpcCase = {
  label: string;
  rpcName: string;
  rootQueryCount?: number;
  binding?: 'CLAIMED' | 'PROVIDER_MARKED';
  arrange: (prisma: PrismaMock) => void;
  invoke: (repository: PrismaIdentityMailWorkerRepository) => Promise<unknown>;
};

const TENANT_RPC_CASES: TenantRpcCase[] = [
  {
    label: 'per-tenant readiness assertion',
    rpcName: 'identity_mail_delivery_worker_assert_v1',
    rootQueryCount: 1,
    arrange: (prisma) => {
      prisma.$queryRaw.mockResolvedValueOnce([readinessRow()]);
      prisma.rpcQueryRaw.mockResolvedValueOnce([
        { result: readinessReceipt() },
      ]);
    },
    invoke: (repository) => repository.assertReady(readinessInput()),
  },
  {
    label: 'claim',
    rpcName: 'identity_initial_owner_mail_claim_v1',
    arrange: (prisma) => {
      prisma.rpcQueryRaw.mockResolvedValueOnce([
        {
          result: {
            schemaVersion: 1,
            operation: 'CLAIM_INITIAL_OWNER_MAIL',
            decision: 'EMPTY',
          },
        },
      ]);
    },
    invoke: (repository) =>
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
  },
  {
    label: 'reap',
    rpcName: 'identity_initial_owner_mail_reap_v1',
    arrange: (prisma) => {
      prisma.rpcQueryRaw.mockResolvedValueOnce([
        {
          result: {
            schemaVersion: 1,
            operation: 'REAP_INITIAL_OWNER_MAIL',
            decision: 'COMPLETED',
            processed: 0,
          },
        },
      ]);
    },
    invoke: (repository) =>
      repository.reapExpired({
        tenantId: TENANT_ID,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        workerActorDigest: LEASE_OWNER_DIGEST,
        batchLimit: 1,
      }),
  },
  {
    label: 'provider mark',
    rpcName: 'identity_initial_owner_mail_provider_mark_v1',
    binding: 'CLAIMED',
    arrange: (prisma) => {
      prisma.rpcQueryRaw.mockResolvedValueOnce([
        {
          result: {
            schemaVersion: 1,
            operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
            decision: 'MARKED',
            reasonCode: null,
            outboxId: OUTBOX_ID,
            tenantId: TENANT_ID,
            inviteId: INVITE_ID,
            leaseVersion: 1,
            transitionRevision: 2,
            providerAttemptKey: PROVIDER_ATTEMPT_KEY,
          },
        },
      ]);
    },
    invoke: (repository) =>
      repository.markProviderAttempt(providerAttemptInput()),
  },
  {
    label: 'completion',
    rpcName: 'identity_initial_owner_mail_complete_v1',
    binding: 'CLAIMED',
    arrange: (prisma) => {
      prisma.rpcQueryRaw.mockResolvedValueOnce([
        {
          result: {
            schemaVersion: 1,
            operation: 'COMPLETE_INITIAL_OWNER_MAIL',
            decision: 'CANCELED',
            outboxId: OUTBOX_ID,
            leaseVersion: 1,
            transitionRevision: 2,
          },
        },
      ]);
    },
    invoke: (repository) =>
      repository.markPreProviderFailure({
        ...leaseInput(),
        reasonCode: 'IDENTITY_MAIL_CLAIM_INVALID',
      }),
  },
];

describe('PrismaIdentityMailWorkerRepository', () => {
  it.each(TENANT_RPC_CASES)(
    'executes $label as settings -> tenant lock -> CURRENT179 RPC on one bounded transaction',
    async ({ arrange, binding, invoke, rootQueryCount, rpcName }) => {
      const { prisma, repository } = harness();
      if (binding === 'CLAIMED') {
        await primeClaimBinding(prisma, repository);
      } else if (binding === 'PROVIDER_MARKED') {
        await primeProviderMarkedBinding(prisma, repository);
      }
      arrange(prisma);

      await invoke(repository);

      expectTenantRpcEnvelope(prisma, rpcName, rootQueryCount);
    },
  );

  it.each([
    [
      'claim',
      (repository: PrismaIdentityMailWorkerRepository) =>
        repository.claimOne({
          tenantId: 'NOT-A-UUID',
          leaseOwnerDigest: LEASE_OWNER_DIGEST,
          leaseTokenDigest: LEASE_TOKEN_DIGEST,
          providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        }),
    ],
    [
      'reap',
      (repository: PrismaIdentityMailWorkerRepository) =>
        repository.reapExpired({
          tenantId: 'NOT-A-UUID',
          providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
          workerActorDigest: LEASE_OWNER_DIGEST,
          batchLimit: 1,
        }),
    ],
    [
      'provider mark',
      (repository: PrismaIdentityMailWorkerRepository) =>
        repository.markProviderAttempt({
          ...providerAttemptInput(),
          tenantId: 'NOT-A-UUID',
        }),
    ],
    [
      'completion',
      (repository: PrismaIdentityMailWorkerRepository) =>
        repository.markPreProviderFailure({
          ...leaseInput(),
          tenantId: 'NOT-A-UUID',
          reasonCode: 'IDENTITY_MAIL_CLAIM_INVALID',
        }),
    ],
  ] as const)(
    'rejects an invalid tenant before opening a %s transaction',
    async (_label, invoke) => {
      const { prisma, repository } = harness();

      const rejection = await rejectionOf(invoke(repository));

      expectReason(rejection, 'IDENTITY_MAIL_WORKER_TENANT_ID_INVALID');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.transactionQueryRaw).not.toHaveBeenCalled();
      expect(prisma.rpcQueryRaw).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('requires a DB-derived claim binding and rejects a cross-tenant lease before opening a transaction', async () => {
    const { prisma, repository } = harness();

    const unbound = await rejectionOf(
      repository.markProviderAttempt(providerAttemptInput()),
    );
    expectReason(unbound, 'IDENTITY_MAIL_WORKER_CLAIM_BINDING_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await primeClaimBinding(prisma, repository);
    const mismatch = await rejectionOf(
      repository.markProviderAttempt({
        ...providerAttemptInput(),
        tenantId: OTHER_TENANT_ID,
      }),
    );
    expectReason(mismatch, 'IDENTITY_MAIL_WORKER_CLAIM_BINDING_MISMATCH');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.transactionQueryRaw).not.toHaveBeenCalled();
    expect(prisma.rpcQueryRaw).not.toHaveBeenCalled();
  });

  it('fails before the tenant lock and RPC when transaction settings drift', async () => {
    const { prisma, repository } = harness();
    prisma.transactionQueryRaw.mockResolvedValueOnce([
      { ...TENANT_TRANSACTION_SETTINGS, isolationLevel: 'read committed' },
    ]);

    const rejection = await rejectionOf(
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
    );

    expectReason(
      rejection,
      'IDENTITY_MAIL_WORKER_TENANT_LOCK_PROTOCOL_INVALID',
    );
    expect(prisma.transactionQueryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.rpcQueryRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('fails before the RPC when the tenant lock receipt is invalid', async () => {
    const { prisma, repository } = harness();
    prisma.transactionQueryRaw
      .mockResolvedValueOnce([TENANT_TRANSACTION_SETTINGS])
      .mockResolvedValueOnce([
        { tenantId: OTHER_TENANT_ID, backendPid: 12_345 },
      ]);

    const rejection = await rejectionOf(
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
    );

    expectReason(
      rejection,
      'IDENTITY_MAIL_WORKER_TENANT_LOCK_PROTOCOL_INVALID',
    );
    expect(prisma.transactionQueryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.rpcQueryRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('accepts only the exact least-privilege worker authority projection', async () => {
    const { prisma, repository } = harness();
    prisma.$queryRaw.mockResolvedValueOnce([readinessRow()]);
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: readinessReceipt() }]);

    await expect(
      repository.assertReady(readinessInput()),
    ).resolves.toBeUndefined();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const rootReadinessQuery = (
      prisma.$queryRaw.mock.calls as unknown[][]
    )[0]?.[0] as Prisma.Sql | undefined;
    if (!rootReadinessQuery) {
      throw new Error('Expected the root readiness projection');
    }
    const transportProjection = rootReadinessQuery.strings.join('');
    expect(transportProjection).toContain('pg_catalog.pg_stat_ssl');
    expect(transportProjection).toContain('pg_catalog.pg_backend_pid()');
    const sealedAssertion = queryFrom(prisma);
    if (!sealedAssertion) {
      throw new Error('Expected the sealed readiness RPC');
    }
    expect(sealedAssertion.values).toEqual([TENANT_ID]);
  });

  it('allows a proven plaintext session only for a loopback transport policy', async () => {
    const { prisma, repository } = harness();
    prisma.$queryRaw.mockResolvedValueOnce([
      readinessRow({
        transportTls: false,
        transportTlsVersion: null,
        transportTlsCipher: null,
      }),
    ]);
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: readinessReceipt() }]);

    await expect(
      repository.assertReady({
        ...readinessInput(),
        databaseTlsRequired: false,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'remote plaintext session',
      {
        transportTls: false,
        transportTlsVersion: null,
        transportTlsCipher: null,
      },
    ],
    ['missing TLS version', { transportTlsVersion: null }],
    ['empty TLS cipher', { transportTlsCipher: '' }],
    [
      'plaintext session with forged TLS details',
      {
        transportTls: false,
        transportTlsVersion: 'TLSv1.3',
        transportTlsCipher: 'TLS_AES_256_GCM_SHA384',
      },
    ],
    ['non-boolean TLS projection', { transportTls: 'true' }],
  ])('fails closed for %s transport drift', async (_case, override) => {
    const { prisma, repository } = harness();
    prisma.$queryRaw.mockResolvedValue([readinessRow(override)]);

    const rejection = await rejectionOf(
      repository.assertReady(readinessInput()),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_TRANSPORT_MISMATCH');
  });

  it.each([
    ['role membership', { membershipCount: 1n }],
    ['effective database CREATE', { effectiveDatabaseCreate: true }],
    ['effective database TEMPORARY', { effectiveDatabaseTemporary: true }],
    ['PUBLIC CREATE', { publicCreate: true }],
    ['extra effective routine', { effectiveRoutineExecuteCount: 6n }],
    [
      'unexpected routine signature',
      {
        effectiveRoutineSignatures: [
          ...ALLOWED_WORKER_RPC_SIGNATURES.slice(0, -1),
          'public.identity_initial_owner_mail_reconcile_v1(text, bigint, text, text, text)',
        ],
      },
    ],
    ['missing direct readiness grant', { directRoutineExecuteCount: 4n }],
    ['PUBLIC routine execution', { publicRoutineExecuteCount: 1n }],
    ['effective relation privilege', { effectiveRelationPrivilegeCount: 1n }],
    ['effective column privilege', { effectiveColumnPrivilegeCount: 1n }],
    ['non-boolean login projection', { canLogin: 'true' }],
    ['non-bigint role OID projection', { roleOid: '16384' }],
  ])('fails closed for %s authority drift', async (_case, override) => {
    const { prisma, repository } = harness();
    prisma.$queryRaw.mockResolvedValue([readinessRow(override)]);

    const rejection = await rejectionOf(
      repository.assertReady(readinessInput()),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_AUTHORITY_MISMATCH');
  });

  it.each([
    ['wrong tenant', { tenantId: OTHER_TENANT_ID }],
    ['wrong migration head', { migrationHead: '20260730000000_wrong' }],
    ['wrong migration count', { migrationCount: 175 }],
    [
      'wrong preterminal manifest digest',
      { preterminalManifestDigest: 'f'.repeat(64) },
    ],
    ['wrong config digest', { providerAuthorityDigest: 'f'.repeat(64) }],
    ['wrong policy', { maxAttempts: 6 }],
    ['too-short acknowledge window', { acknowledgeSeconds: 9 }],
    ['extra receipt authority', { unexpected: true }],
  ])('rejects sealed readiness receipt drift: %s', async (_case, override) => {
    const { prisma, repository } = harness();
    prisma.$queryRaw.mockResolvedValueOnce([readinessRow()]);
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: readinessReceipt(override) },
    ]);

    const rejection = await rejectionOf(
      repository.assertReady(readinessInput()),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_READINESS_RECEIPT_INVALID');
  });

  it('rejects a release contract mismatch before database access', async () => {
    const { prisma, repository } = harness();

    const rejection = await rejectionOf(
      repository.assertReady({
        ...readinessInput(),
        expectedMigrationCount: 175,
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_RELEASE_CONTRACT_MISMATCH');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    [
      'base retry above one hour',
      { baseRetrySeconds: 3_601, maxRetrySeconds: 3_601 },
    ],
    ['max retry above one day', { maxRetrySeconds: 86_401 }],
  ])('rejects %s before database access', async (_case, policyOverride) => {
    const { prisma, repository } = harness();
    const input = readinessInput();

    const rejection = await rejectionOf(
      repository.assertReady({
        ...input,
        expectedPolicy: {
          ...input.expectedPolicy,
          ...policyOverride,
        },
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_RELEASE_CONTRACT_MISMATCH');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('accepts only a fully shaped EMPTY claim response', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 1,
          operation: 'CLAIM_INITIAL_OWNER_MAIL',
          decision: 'EMPTY',
        },
      },
    ]);

    await expect(
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
    ).resolves.toBeNull();

    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: { decision: 'EMPTY' } },
    ]);
    const rejection = await rejectionOf(
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  });

  it.each([
    [
      'EMPTY',
      {
        schemaVersion: 1,
        operation: 'CLAIM_INITIAL_OWNER_MAIL',
        decision: 'EMPTY',
        recipientEmail: 'owner@example.test',
      },
    ],
    [
      'CLAIMED',
      {
        ...claimResult(),
        emailCanonical: 'owner@example.test',
      },
    ],
  ])(
    'rejects an undeclared field in a %s claim receipt',
    async (_case, result) => {
      const { prisma, repository } = harness();
      prisma.rpcQueryRaw.mockResolvedValueOnce([{ result }]);

      const rejection = await rejectionOf(
        repository.claimOne({
          tenantId: TENANT_ID,
          leaseOwnerDigest: LEASE_OWNER_DIGEST,
          leaseTokenDigest: LEASE_TOKEN_DIGEST,
          providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        }),
      );
      expectReason(rejection, 'IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
    },
  );

  it('parses a bounded claim and rejects a cross-tenant response', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: claimResult() }]);

    const delivery = await repository.claimOne({
      tenantId: TENANT_ID,
      leaseOwnerDigest: LEASE_OWNER_DIGEST,
      leaseTokenDigest: LEASE_TOKEN_DIGEST,
      providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    });
    expect(delivery).toMatchObject({
      tenantId: TENANT_ID,
      outboxId: OUTBOX_ID,
      leaseVersion: 1n,
      transitionRevision: 1,
      attemptNumber: 1,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    expect(delivery?.secretCiphertext).toEqual(Buffer.alloc(71, 7));

    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: claimResult(OTHER_TENANT_ID) },
    ]);
    const rejection = await rejectionOf(
      repository.claimOne({
        tenantId: TENANT_ID,
        leaseOwnerDigest: LEASE_OWNER_DIGEST,
        leaseTokenDigest: LEASE_TOKEN_DIGEST,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_CLAIM_RESPONSE_INVALID');
  });

  it('hashes lease and Message-ID secrets before marking provider intent', async () => {
    const { prisma, repository } = harness();
    await primeClaimBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
          decision: 'MARKED',
          reasonCode: null,
          outboxId: OUTBOX_ID,
          tenantId: TENANT_ID,
          inviteId: INVITE_ID,
          leaseVersion: 1,
          transitionRevision: 2,
          providerAttemptKey: PROVIDER_ATTEMPT_KEY,
        },
      },
    ]);

    await repository.markProviderAttempt(providerAttemptInput());

    const query = queryFrom(prisma);
    expect(query.values).toEqual([
      OUTBOX_ID,
      1,
      LEASE_OWNER_DIGEST,
      createHash('sha256').update(LEASE_TOKEN).digest('hex'),
      PROVIDER_ATTEMPT_KEY,
      PROVIDER_AUTHORITY_DIGEST,
      createHash('sha256').update(MESSAGE_ID).digest('hex'),
    ]);
    expect(query.values).not.toContain(LEASE_TOKEN);
    expect(query.values).not.toContain(MESSAGE_ID);
    expect(query.strings.join('')).toContain('::INTEGER');
  });

  it('returns the exact NOT_DELIVERABLE cancellation without inventing a marker', async () => {
    const { prisma, repository } = harness();
    await primeClaimBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
          decision: 'CANCELED',
          reasonCode: 'NOT_DELIVERABLE',
          outboxId: OUTBOX_ID,
          tenantId: TENANT_ID,
          inviteId: INVITE_ID,
          leaseVersion: 1,
          transitionRevision: 2,
        },
      },
    ]);

    await expect(
      repository.markProviderAttempt(providerAttemptInput()),
    ).resolves.toBe('CANCELED');

    clearRepositoryMocks(prisma);
    const replay = await rejectionOf(
      repository.markProviderAttempt(providerAttemptInput()),
    );
    expectReason(replay, 'IDENTITY_MAIL_WORKER_CLAIM_BINDING_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed provider cancellation receipt', async () => {
    const { prisma, repository } = harness();
    await primeClaimBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
          decision: 'CANCELED',
          reasonCode: 'OTHER',
          outboxId: OUTBOX_ID,
          tenantId: TENANT_ID,
          inviteId: INVITE_ID,
          leaseVersion: 1,
          transitionRevision: 2,
        },
      },
    ]);

    const rejection = await rejectionOf(
      repository.markProviderAttempt(providerAttemptInput()),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  });

  it('rejects a provider marker response bound to another attempt', async () => {
    const { prisma, repository } = harness();
    await primeClaimBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
          decision: 'MARKED',
          reasonCode: null,
          outboxId: OUTBOX_ID,
          tenantId: TENANT_ID,
          inviteId: INVITE_ID,
          leaseVersion: 1,
          transitionRevision: 2,
          providerAttemptKey: '88888888-8888-4888-8888-888888888888',
        },
      },
    ]);

    const rejection = await rejectionOf(
      repository.markProviderAttempt(providerAttemptInput()),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  });

  it('keeps historical completion authority-free and binds its acknowledgement to tenant, outbox, lease and outcome', async () => {
    const { prisma, repository } = harness();
    await primeProviderMarkedBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'COMPLETE_INITIAL_OWNER_MAIL',
          decision: 'SENT',
          outboxId: OUTBOX_ID,
          leaseVersion: 1,
          transitionRevision: 3,
        },
      },
    ]);

    await repository.markSent({
      ...leaseInput(2),
      providerReceiptDigest: PROVIDER_RECEIPT_DIGEST,
      providerOutcomeCode: 'SMTP_ACCEPTED',
    });

    const query = queryFrom(prisma);
    const expectedTerminalAck = createHash('sha256')
      .update(
        [
          'leetplus:identity-mail-terminal-ack:v1',
          TENANT_ID,
          OUTBOX_ID,
          '1',
          'SMTP_ACCEPTED',
        ].join('\n'),
      )
      .digest('hex');
    expect(query.values).toEqual([
      OUTBOX_ID,
      1,
      LEASE_OWNER_DIGEST,
      createHash('sha256').update(LEASE_TOKEN).digest('hex'),
      'PROVIDER_ACCEPTED',
      PROVIDER_RECEIPT_DIGEST,
      expectedTerminalAck,
    ]);
    expect(query.values).not.toContain(PROVIDER_AUTHORITY_DIGEST);
  });

  it.each([
    [
      'undeclared field',
      {
        schemaVersion: 1,
        operation: 'COMPLETE_INITIAL_OWNER_MAIL',
        decision: 'SENT',
        outboxId: OUTBOX_ID,
        leaseVersion: 1,
        transitionRevision: 3,
        recipientEmail: 'owner@example.test',
      },
    ],
    [
      'wrong transition revision',
      {
        schemaVersion: 1,
        operation: 'COMPLETE_INITIAL_OWNER_MAIL',
        decision: 'SENT',
        outboxId: OUTBOX_ID,
        leaseVersion: 1,
        transitionRevision: 2,
      },
    ],
  ])('rejects a completion receipt with %s', async (_case, result) => {
    const { prisma, repository } = harness();
    await primeProviderMarkedBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result }]);

    const rejection = await rejectionOf(
      repository.markSent({
        ...leaseInput(2),
        providerReceiptDigest: PROVIDER_RECEIPT_DIGEST,
        providerOutcomeCode: 'SMTP_ACCEPTED',
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');
  });

  it('preserves a pre-provider CANCELED lifecycle decision', async () => {
    const { prisma, repository } = harness();
    await primeClaimBinding(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          operation: 'COMPLETE_INITIAL_OWNER_MAIL',
          decision: 'CANCELED',
          outboxId: OUTBOX_ID,
          leaseVersion: 1,
          transitionRevision: 2,
        },
      },
    ]);

    await expect(
      repository.markPreProviderFailure({
        ...leaseInput(),
        reasonCode: 'IDENTITY_MAIL_CLAIM_INVALID',
      }),
    ).resolves.toBe('CANCELED');

    clearRepositoryMocks(prisma);
    const replay = await rejectionOf(
      repository.markPreProviderFailure({
        ...leaseInput(),
        reasonCode: 'IDENTITY_MAIL_CLAIM_INVALID',
      }),
    );
    expectReason(replay, 'IDENTITY_MAIL_WORKER_CLAIM_BINDING_REQUIRED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the reaper tenant-scoped and rejects malformed counters', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 1,
          operation: 'REAP_INITIAL_OWNER_MAIL',
          decision: 'COMPLETED',
          processed: 2,
        },
      },
    ]);

    await expect(
      repository.reapExpired({
        tenantId: TENANT_ID,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        workerActorDigest: LEASE_OWNER_DIGEST,
        batchLimit: 3,
      }),
    ).resolves.toBe(2);
    expect(queryFrom(prisma).values).toEqual([
      TENANT_ID,
      PROVIDER_AUTHORITY_DIGEST,
      LEASE_OWNER_DIGEST,
      3,
    ]);

    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 1,
          operation: 'REAP_INITIAL_OWNER_MAIL',
          decision: 'COMPLETED',
          processed: -1,
        },
      },
    ]);
    const rejection = await rejectionOf(
      repository.reapExpired({
        tenantId: TENANT_ID,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        workerActorDigest: LEASE_OWNER_DIGEST,
        batchLimit: 3,
      }),
    );
    expectReason(rejection, 'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID');

    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 1,
          operation: 'REAP_INITIAL_OWNER_MAIL',
          decision: 'COMPLETED',
          processed: 0,
          tenantId: TENANT_ID,
        },
      },
    ]);
    const extraFieldRejection = await rejectionOf(
      repository.reapExpired({
        tenantId: TENANT_ID,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        workerActorDigest: LEASE_OWNER_DIGEST,
        batchLimit: 3,
      }),
    );
    expectReason(
      extraFieldRejection,
      'IDENTITY_MAIL_WORKER_DATABASE_RESPONSE_INVALID',
    );
  });
});
