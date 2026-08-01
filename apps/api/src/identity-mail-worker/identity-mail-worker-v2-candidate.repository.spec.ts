import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256,
  IdentityMailWorkerV2CandidateRepositoryError,
  PrismaIdentityMailWorkerV2CandidateRepository,
} from './identity-mail-worker-v2-candidate.repository';
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
const LEASE_TOKEN_DIGEST = digest(LEASE_TOKEN);
const PROVIDER_AUTHORITY_DIGEST = 'c'.repeat(64);
const PROVIDER_RECEIPT_DIGEST = 'd'.repeat(64);
const WORKER_ACTOR_DIGEST = 'e'.repeat(64);

type PrismaMock = {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
  transactionQueryRaw: jest.Mock;
  rpcQueryRaw: jest.Mock;
};

function prismaMock(): PrismaMock {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([runtimeIdentity()]),
    $transaction: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    transactionQueryRaw: jest.fn(),
    rpcQueryRaw: jest.fn(),
  };
  prisma.transactionQueryRaw.mockImplementation((query: Prisma.Sql) => {
    const sql = query.strings.join('');
    if (sql.includes("current_setting('transaction_isolation')")) {
      return Promise.resolve([
        {
          isolationLevel: 'read committed',
          readOnly: 'off',
          statementTimeout: '25s',
          lockTimeout: '5s',
        },
      ]);
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
    repository: new PrismaIdentityMailWorkerV2CandidateRepository(
      prisma as unknown as PrismaClient,
    ),
  };
}

function runtimeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    databaseName: 'leetplus_candidate',
    sessionRole: 'leetplus_identity_mail_worker_v2',
    currentRole: 'leetplus_identity_mail_worker_v2',
    transportTls: true,
    transportTlsVersion: 'TLSv1.3',
    transportTlsCipher: 'TLS_AES_256_GCM_SHA384',
    ...overrides,
  };
}

function readinessInput() {
  return {
    expectedDatabase: 'leetplus_candidate',
    expectedRole: 'leetplus_identity_mail_worker_v2',
    databaseTlsRequired: true,
    expectedMigration: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
    expectedMigrationCount: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
    releaseSha: 'f'.repeat(40),
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

function readinessReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operation: 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER_V2',
    decision: 'REHEARSAL_READY',
    candidateStatus: 'NOT_DEPLOYABLE',
    authorization: false,
    canSend: false,
    tenantId: TENANT_ID,
    migrationHead: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
    migrationCount: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
    candidateChecksum: IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256,
    state: 'ACTIVE',
    stateRevision: 3,
    policyRevision: 2,
    currentConfigurationDigest: '1'.repeat(64),
    maxAttempts: 5,
    leaseSeconds: 120,
    acknowledgeSeconds: 60,
    baseRetrySeconds: 60,
    maxRetrySeconds: 3600,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    ...overrides,
  };
}

function claimReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
    decision: 'CLAIMED',
    candidateStatus: 'NOT_DEPLOYABLE',
    outboxId: OUTBOX_ID,
    tenantId: TENANT_ID,
    inviteId: INVITE_ID,
    workflowLocator: WORKFLOW_LOCATOR,
    aadEnvironment: 'production',
    template: 'INITIAL_OWNER_INVITE',
    messageKey: MESSAGE_KEY,
    requestDigest: '2'.repeat(64),
    tokenHash: '3'.repeat(64),
    digestVersion: 'sha256-v1',
    secretCiphertextBase64: Buffer.alloc(71, 7).toString('base64'),
    envelopeVersion: 1,
    keyVersion: 'v1',
    recipientEmail: 'owner@example.test',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attemptNumber: 1,
    leaseVersion: 1,
    transitionRevision: 2,
    claimEnrollmentStateRevision: 3,
    claimPolicyRevision: 2,
    claimProviderAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    ...overrides,
  };
}

function providerMarkedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
    decision: 'MARKED',
    candidateStatus: 'NOT_DEPLOYABLE',
    outboxId: OUTBOX_ID,
    tenantId: TENANT_ID,
    leaseVersion: 1,
    transitionRevision: 3,
    providerAttemptKey: PROVIDER_ATTEMPT_KEY,
    settlementState: 'ACTIVE',
    ...overrides,
  };
}

function completionReceipt(
  decision: string,
  transitionRevision = 3,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 2,
    operation: 'COMPLETE_INITIAL_OWNER_MAIL_V2',
    decision,
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_ID,
    outboxId: OUTBOX_ID,
    leaseVersion: 1,
    transitionRevision,
    settlementState: 'ACTIVE',
    ...overrides,
  };
}

function reapReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    operation: 'REAP_INITIAL_OWNER_MAIL_V2',
    decision: 'COMPLETED',
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_ID,
    settlementState: 'DRAINING',
    processed: 2,
    ...overrides,
  };
}

function claimInput() {
  return {
    tenantId: TENANT_ID,
    leaseOwnerDigest: LEASE_OWNER_DIGEST,
    leaseTokenDigest: LEASE_TOKEN_DIGEST,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
  };
}

function leaseInput(
  expectedTransitionRevision = 2,
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

async function primeClaim(
  prisma: PrismaMock,
  repository: PrismaIdentityMailWorkerV2CandidateRepository,
): Promise<void> {
  prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: claimReceipt() }]);
  await repository.claimOne(claimInput());
  clearTransactionMocks(prisma);
}

function clearTransactionMocks(prisma: PrismaMock): void {
  prisma.$transaction.mockClear();
  prisma.transactionQueryRaw.mockClear();
  prisma.rpcQueryRaw.mockClear();
}

function rpcQuery(prisma: PrismaMock): Prisma.Sql {
  const query = (prisma.rpcQueryRaw.mock.calls as unknown[][])[0]?.[0];
  if (!query) throw new Error('Expected a candidate RPC query');
  return query as Prisma.Sql;
}

function transactionQuery(prisma: PrismaMock, index: number): Prisma.Sql {
  const query = (prisma.transactionQueryRaw.mock.calls as unknown[][])[
    index
  ]?.[0];
  if (!query) throw new Error(`Expected transaction query ${index + 1}`);
  return query as Prisma.Sql;
}

function expectTenantEnvelope(prisma: PrismaMock, rpcName: string): void {
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect((prisma.$transaction.mock.calls as unknown[][])[0]?.[1]).toEqual({
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 30_000,
  });
  expect(prisma.transactionQueryRaw).toHaveBeenCalledTimes(3);
  const settings = transactionQuery(prisma, 0);
  const lock = transactionQuery(prisma, 1);
  const rpc = transactionQuery(prisma, 2);
  expect(settings.strings.join('')).toContain(
    "current_setting('transaction_isolation')",
  );
  expect(settings.values).toEqual(['25s', '5s']);
  expect(lock.strings.join('')).toContain('pg_advisory_xact_lock');
  expect(lock.strings.join('')).toContain('hashtextextended');
  expect(lock.values).toEqual([
    'leetplus:identity-mail-tenant:v1:',
    TENANT_ID,
    180,
    TENANT_ID,
  ]);
  expect(rpc.strings.join('')).toContain(rpcName);
  expect(rpc.strings.join('')).not.toMatch(
    /identity_(?:initial_owner_mail|mail_delivery_worker)_.*_v1/iu,
  );
  expect(rpc.values[0]).toBe(TENANT_ID);
  expect(rpcQuery(prisma)).toBe(rpc);
  expect(
    prisma.transactionQueryRaw.mock.invocationCallOrder.slice(0, 3),
  ).toEqual(
    [...prisma.transactionQueryRaw.mock.invocationCallOrder.slice(0, 3)].sort(
      (left, right) => left - right,
    ),
  );
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
  expect(error).toBeInstanceOf(IdentityMailWorkerV2CandidateRepositoryError);
  expect(
    (error as IdentityMailWorkerV2CandidateRepositoryError).reasonCode,
  ).toBe(reasonCode);
}

describe('PrismaIdentityMailWorkerV2CandidateRepository', () => {
  it('keeps readiness dormant and invokes only the exact CURRENT183 assert_v2 RPC', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: readinessReceipt() }]);

    await repository.assertReady(readinessInput());

    expectTenantEnvelope(prisma, 'identity_mail_delivery_worker_assert_v2');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('parses the exact claim authority binding and keeps tenantId first', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: claimReceipt() }]);

    const delivery = await repository.claimOne(claimInput());

    expect(delivery).toMatchObject({
      tenantId: TENANT_ID,
      outboxId: OUTBOX_ID,
      claimEnrollmentStateRevision: 3n,
      claimPolicyRevision: 2,
      claimProviderAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    });
    expectTenantEnvelope(prisma, 'identity_initial_owner_mail_claim_v2');
    expect(rpcQuery(prisma).values.slice(0, 4)).toEqual([
      TENANT_ID,
      LEASE_OWNER_DIGEST,
      LEASE_TOKEN_DIGEST,
      PROVIDER_AUTHORITY_DIGEST,
    ]);
  });

  it('accepts only a fully shaped tenant-bound EMPTY claim receipt', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 2,
          operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
          decision: 'EMPTY',
          tenantId: TENANT_ID,
        },
      },
    ]);
    await expect(repository.claimOne(claimInput())).resolves.toBeNull();

    clearTransactionMocks(prisma);
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 2,
          operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
          decision: 'EMPTY',
          tenantId: OTHER_TENANT_ID,
        },
      },
    ]);
    await expect(repository.claimOne(claimInput())).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
    });
  });

  it('passes tenantId first to provider_mark_v2 and validates its exact receipt', async () => {
    const { prisma, repository } = harness();
    await primeClaim(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: providerMarkedReceipt() },
    ]);

    await expect(
      repository.markProviderAttempt(providerAttemptInput()),
    ).resolves.toBe('MARKED');

    expectTenantEnvelope(
      prisma,
      'identity_initial_owner_mail_provider_mark_v2',
    );
    expect(rpcQuery(prisma).values.slice(0, 8)).toEqual([
      TENANT_ID,
      OUTBOX_ID,
      1,
      LEASE_OWNER_DIGEST,
      LEASE_TOKEN_DIGEST,
      PROVIDER_ATTEMPT_KEY,
      PROVIDER_AUTHORITY_DIGEST,
      digest(MESSAGE_ID),
    ]);
  });

  it('passes DB-enforced tenant authority to complete_v2', async () => {
    const { prisma, repository } = harness();
    await primeClaim(prisma, repository);
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: completionReceipt('SENT') },
    ]);

    await repository.markSent({
      ...leaseInput(),
      providerReceiptDigest: PROVIDER_RECEIPT_DIGEST,
      providerOutcomeCode: 'SMTP_ACCEPTED',
    });

    expectTenantEnvelope(prisma, 'identity_initial_owner_mail_complete_v2');
    expect(rpcQuery(prisma).values.slice(0, 7)).toEqual([
      TENANT_ID,
      OUTBOX_ID,
      1,
      LEASE_OWNER_DIGEST,
      LEASE_TOKEN_DIGEST,
      PROVIDER_AUTHORITY_DIGEST,
      'PROVIDER_ACCEPTED',
    ]);
  });

  it('passes tenantId first to DRAINING-capable reap_v2', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: reapReceipt() }]);

    await expect(
      repository.reapExpired({
        tenantId: TENANT_ID,
        providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
        workerActorDigest: WORKER_ACTOR_DIGEST,
        batchLimit: 10,
      }),
    ).resolves.toBe(2);

    expectTenantEnvelope(prisma, 'identity_initial_owner_mail_reap_v2');
    expect(rpcQuery(prisma).values).toEqual([
      TENANT_ID,
      PROVIDER_AUTHORITY_DIGEST,
      WORKER_ACTOR_DIGEST,
      10,
    ]);
  });

  it.each([
    ['P2034', { code: 'P2034' }],
    ['40001', { code: '40001' }],
    ['40P01', { code: '40P01' }],
    ['55P03', { code: 'P2010', meta: { code: '55P03' } }],
    ['57014', { code: 'P2010', meta: { code: '57014' } }],
  ])('retries the whole transaction once for %s', async (_label, failure) => {
    const { prisma, repository } = harness();
    const normalTransaction = prisma.$transaction.getMockImplementation();
    if (!normalTransaction) throw new Error('Missing transaction mock');
    prisma.$transaction
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(normalTransaction);
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      {
        result: {
          schemaVersion: 2,
          operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
          decision: 'EMPTY',
          tenantId: TENANT_ID,
        },
      },
    ]);

    await expect(repository.claimOne(claimInput())).resolves.toBeNull();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after exactly two retryable whole-transaction attempts', async () => {
    const { prisma, repository } = harness();
    prisma.$transaction.mockRejectedValue({ code: '40P01' });

    const error = await rejectionOf(repository.claimOne(claimInput()));

    expectReason(error, 'IDENTITY_MAIL_WORKER_V2_TRANSACTION_RETRY_REQUIRED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry a receipt or business-contract failure', async () => {
    const { prisma, repository } = harness();
    prisma.rpcQueryRaw.mockResolvedValueOnce([
      { result: claimReceipt({ unexpected: true }) },
    ]);

    await expect(repository.claimOne(claimInput())).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['readiness', readinessReceipt(), 'candidateStatus'],
    ['claim', claimReceipt(), 'claimPolicyRevision'],
    ['provider marker', providerMarkedReceipt(), 'settlementState'],
    ['completion', completionReceipt('SENT'), 'candidateStatus'],
    ['reap', reapReceipt(), 'processed'],
  ])(
    'fails closed for extra and missing keys in the %s receipt',
    async (kind, fixture, missingKey) => {
      const extraHarness = harness();
      const missingHarness = harness();
      const extra = { ...fixture, unexpected: true };
      const missing = { ...fixture };
      delete missing[missingKey];

      const invoke = async (
        target: ReturnType<typeof harness>,
        receipt: Record<string, unknown>,
      ) => {
        if (kind === 'readiness') {
          target.prisma.rpcQueryRaw.mockResolvedValueOnce([
            { result: receipt },
          ]);
          return target.repository.assertReady(readinessInput());
        }
        if (kind === 'claim') {
          target.prisma.rpcQueryRaw.mockResolvedValueOnce([
            { result: receipt },
          ]);
          return target.repository.claimOne(claimInput());
        }
        if (kind === 'provider marker') {
          await primeClaim(target.prisma, target.repository);
          target.prisma.rpcQueryRaw.mockResolvedValueOnce([
            { result: receipt },
          ]);
          return target.repository.markProviderAttempt(providerAttemptInput());
        }
        if (kind === 'completion') {
          await primeClaim(target.prisma, target.repository);
          target.prisma.rpcQueryRaw.mockResolvedValueOnce([
            { result: receipt },
          ]);
          return target.repository.markSent({
            ...leaseInput(),
            providerReceiptDigest: PROVIDER_RECEIPT_DIGEST,
            providerOutcomeCode: 'SMTP_ACCEPTED',
          });
        }
        target.prisma.rpcQueryRaw.mockResolvedValueOnce([{ result: receipt }]);
        return target.repository.reapExpired({
          tenantId: TENANT_ID,
          providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
          workerActorDigest: WORKER_ACTOR_DIGEST,
          batchLimit: 10,
        });
      };

      await expect(invoke(extraHarness, extra)).rejects.toBeInstanceOf(
        IdentityMailWorkerV2CandidateRepositoryError,
      );
      await expect(invoke(missingHarness, missing)).rejects.toBeInstanceOf(
        IdentityMailWorkerV2CandidateRepositoryError,
      );
      expect(extraHarness.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(missingHarness.prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects cross-tenant completion before opening a transaction', async () => {
    const { prisma, repository } = harness();
    await primeClaim(prisma, repository);

    await expect(
      repository.markPreProviderFailure({
        ...leaseInput(),
        tenantId: OTHER_TENANT_ID,
        reasonCode: 'SMTP_TRANSIENT',
      }),
    ).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_WORKER_V2_CLAIM_BINDING_MISMATCH',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
