import { createHash } from 'node:crypto';
import {
  EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE,
  EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_SHA256,
  EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError,
  PrismaEmployeeInviteMailWorkerCurrent189Repository,
} from './employee-invite-mail-worker-current189.repository';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';
const OUTBOX_ID = '44444444-4444-4444-8444-444444444444';
const DELIVERY_LOCATOR = '55555555-5555-4555-8555-555555555555';
const MESSAGE_KEY = '66666666-6666-4666-8666-666666666666';
const PROVIDER_ATTEMPT_KEY = '77777777-7777-4777-8777-777777777777';
const PROVIDER_DIGEST = 'a'.repeat(64);
const OWNER_DIGEST = 'b'.repeat(64);
const LEASE_TOKEN = 'c'.repeat(43);
const LEASE_TOKEN_DIGEST = digest(LEASE_TOKEN);
const PROVIDER_RECEIPT_DIGEST = 'd'.repeat(64);

describe('PrismaEmployeeInviteMailWorkerCurrent189Repository', () => {
  it('pins the noncanonical CURRENT189 artifact and performs lock/RPC as separate READ COMMITTED statements', async () => {
    expect(EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE).toBe(
      '20260805030000_identity_employee_invite_mail_boundary_current189',
    );
    expect(EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_SHA256).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);

    await repository.assertRehearsalReady(readinessInput());

    expect(database.transactions).toHaveLength(1);
    expect(database.transactions[0]?.queries).toHaveLength(3);
    expect(database.transactions[0]?.queries[0]?.text).toContain(
      "current_setting('transaction_isolation')",
    );
    expect(database.transactions[0]?.queries[1]?.text).toContain(
      'pg_advisory_xact_lock',
    );
    expect(database.transactions[0]?.queries[1]?.values).toContain(
      'leetplus:identity-mail-tenant:v1:',
    );
    expect(database.transactions[0]?.queries[1]?.values).toContain(180);
    expect(database.transactions[0]?.queries[2]?.text).toContain(
      'identity_employee_mail_worker_assert_current189_v1',
    );
    expect(database.transactions[0]?.options).toMatchObject({
      isolationLevel: 'ReadCommitted',
      maxWait: 5_000,
      timeout: 30_000,
    });
  });

  it('parses an exact claimed envelope and binds it to the tenant lease', async () => {
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);

    const result = await repository.claimOne(claimInput());

    expect(result.decision).toBe('CLAIMED');
    if (result.decision !== 'CLAIMED') {
      throw new Error('claim expected');
    }
    expect(result.claim).toMatchObject({
      tenantId: TENANT_A,
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
      deliveryLocator: DELIVERY_LOCATOR,
      messageKey: MESSAGE_KEY,
      template: 'EMPLOYEE_USER_INVITE',
      leaseVersion: 1n,
      transitionRevision: 4,
      attemptNumber: 1,
      claimProviderAuthorityDigest: PROVIDER_DIGEST,
    });
    expect(result.claim.secretCiphertext).toHaveLength(71);
  });

  it('replays the exact provider marker after a committed-but-lost response', async () => {
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);
    await repository.claimOne(claimInput());
    database.unknownAfterCommit.set('provider_mark', 1);

    await expect(repository.markProviderAttempt(markInput())).resolves.toBe(
      'MARKED',
    );

    const calls = database.rpcCalls.filter(
      (call) => call.name === 'provider_mark',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(database.transactions).toHaveLength(3);
  });

  it('replays exact terminal completion after a committed-but-lost response', async () => {
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);
    await repository.claimOne(claimInput());
    await repository.markProviderAttempt(markInput());
    database.unknownAfterCommit.set('complete', 1);

    await expect(
      repository.markSent({
        ...lease(5),
        providerReceiptDigest: PROVIDER_RECEIPT_DIGEST,
        providerOutcomeCode: 'EMPLOYEE_SMTP_ACCEPTED',
      }),
    ).resolves.toBeUndefined();

    const calls = database.rpcCalls.filter((call) => call.name === 'complete');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.values).toContain('PROVIDER_ACCEPTED');
    expect(calls[0]?.values).toContain(PROVIDER_RECEIPT_DIGEST);
    expect(calls[0]?.values).toContainEqual(
      expect.stringMatching(/^[0-9a-f]{64}$/u),
    );
  });

  it('bounds an unknown provider-marker response to two attempts', async () => {
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);
    await repository.claimOne(claimInput());
    database.unknownAfterCommit.set('provider_mark', 2);

    let failure: unknown;
    try {
      await repository.markProviderAttempt(markInput());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(
      EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError,
    );
    expect(failure).toMatchObject({ operation: 'PROVIDER_MARK', attempts: 2 });
    expect(
      database.rpcCalls.filter((call) => call.name === 'provider_mark'),
    ).toHaveLength(2);
  });

  it('fails closed on a cross-tenant or extended claim receipt', async () => {
    const crossTenant = new FakeEmployeeMailDatabase();
    crossTenant.overrides.set('claim', {
      ...claimedReceipt(),
      tenantId: TENANT_B,
    });
    await expect(
      repositoryFor(crossTenant).claimOne(claimInput()),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID',
    });

    const extended = new FakeEmployeeMailDatabase();
    extended.overrides.set('claim', {
      ...claimedReceipt(),
      rawToken: 'forbidden',
    });
    await expect(
      repositoryFor(extended).claimOne(claimInput()),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID',
    });
  });

  it('fails closed on a cross-tenant provider receipt before SMTP can rely on it', async () => {
    const database = new FakeEmployeeMailDatabase();
    const repository = repositoryFor(database);
    await repository.claimOne(claimInput());
    database.overrides.set('provider_mark', {
      ...providerMarkedReceipt(),
      tenantId: TENANT_B,
    });

    await expect(
      repository.markProviderAttempt(markInput()),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID',
    });
  });

  it('accepts only an exact bounded reaper receipt', async () => {
    const database = new FakeEmployeeMailDatabase();
    database.overrides.set('reap', {
      ...reapReceipt(),
      processed: 3,
      retry: 1,
      dead: 1,
      reconciliationRequired: 1,
    });
    await expect(
      repositoryFor(database).reapExpired({
        tenantId: TENANT_A,
        providerAuthorityDigest: PROVIDER_DIGEST,
        batchLimit: 3,
      }),
    ).resolves.toBe(3);

    const invalid = new FakeEmployeeMailDatabase();
    invalid.overrides.set('reap', {
      ...reapReceipt(),
      processed: 2,
      retry: 1,
    });
    await expect(
      repositoryFor(invalid).reapExpired({
        tenantId: TENANT_A,
        providerAuthorityDigest: PROVIDER_DIGEST,
        batchLimit: 3,
      }),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_MAIL_REAP_RECEIPT_INVALID',
    });
  });

  it('rejects a stale/non-READ-COMMITTED transaction protocol before the RPC', async () => {
    const database = new FakeEmployeeMailDatabase();
    database.isolationLevel = 'repeatable read';

    await expect(
      repositoryFor(database).assertRehearsalReady(readinessInput()),
    ).rejects.toMatchObject({
      reasonCode: 'EMPLOYEE_INVITE_MAIL_TENANT_LOCK_PROTOCOL_INVALID',
    });
    expect(database.rpcCalls).toHaveLength(0);
  });
});

type QueryCapture = Readonly<{ text: string; values: readonly unknown[] }>;
type TransactionCapture = {
  queries: QueryCapture[];
  options: unknown;
};

class FakeEmployeeMailDatabase {
  isolationLevel = 'read committed';
  readonly transactions: TransactionCapture[] = [];
  readonly rpcCalls: Array<QueryCapture & { name: RpcName }> = [];
  readonly overrides = new Map<RpcName, unknown>();
  readonly unknownAfterCommit = new Map<RpcName, number>();

  readonly $transaction = jest.fn(
    async (
      operation: (client: {
        $queryRaw(query: unknown): Promise<unknown>;
      }) => Promise<unknown>,
      options: unknown,
    ) => {
      const capture: TransactionCapture = { queries: [], options };
      this.transactions.push(capture);
      let currentRpc: RpcName | null = null;
      const result = await operation({
        $queryRaw: async (query: unknown) => {
          const normalized = await Promise.resolve(normalizeQuery(query));
          capture.queries.push(normalized);
          if (
            normalized.text.includes("current_setting('transaction_isolation')")
          ) {
            return [
              {
                isolationLevel: this.isolationLevel,
                readOnly: 'off',
                statementTimeout: '25s',
                lockTimeout: '5s',
              },
            ];
          }
          if (normalized.text.includes('pg_advisory_xact_lock')) {
            return [{ tenantId: TENANT_A }];
          }
          currentRpc = rpcName(normalized.text);
          this.rpcCalls.push({ ...normalized, name: currentRpc });
          return [
            {
              receipt:
                this.overrides.get(currentRpc) ?? defaultReceipt(currentRpc),
            },
          ];
        },
      });
      if (currentRpc) {
        const remaining = this.unknownAfterCommit.get(currentRpc) ?? 0;
        if (remaining > 0) {
          this.unknownAfterCommit.set(currentRpc, remaining - 1);
          throw Object.assign(new Error('response unknown'), { code: 'P1017' });
        }
      }
      return result;
    },
  );
}

type RpcName = 'readiness' | 'claim' | 'provider_mark' | 'complete' | 'reap';

function repositoryFor(database: FakeEmployeeMailDatabase) {
  return new PrismaEmployeeInviteMailWorkerCurrent189Repository(
    database as never,
  );
}

function readinessInput() {
  return {
    tenantId: TENANT_A,
    providerAuthorityDigest: PROVIDER_DIGEST,
    expectedPolicy: {
      maxAttempts: 3,
      leaseSeconds: 60,
      acknowledgeSeconds: 30,
      baseRetrySeconds: 15,
      maxRetrySeconds: 300,
    },
  };
}

function claimInput() {
  return {
    tenantId: TENANT_A,
    leaseOwnerDigest: OWNER_DIGEST,
    leaseTokenDigest: LEASE_TOKEN_DIGEST,
    providerAuthorityDigest: PROVIDER_DIGEST,
  };
}

function lease(expectedTransitionRevision: number) {
  return {
    tenantId: TENANT_A,
    outboxId: OUTBOX_ID,
    leaseVersion: 1n,
    expectedTransitionRevision,
    leaseOwnerDigest: OWNER_DIGEST,
    leaseToken: LEASE_TOKEN,
  };
}

function markInput() {
  return {
    ...lease(4),
    inviteId: INVITE_ID,
    messageId: `<employee-invite-${MESSAGE_KEY}@mail.leetplus.ru>`,
    providerAttemptKey: PROVIDER_ATTEMPT_KEY,
    providerAuthorityDigest: PROVIDER_DIGEST,
  };
}

function readinessReceipt() {
  return {
    schemaVersion: 1,
    operation: 'ASSERT_EMPLOYEE_MAIL_WORKER',
    decision: 'REHEARSAL_READY',
    candidateStatus: 'NOT_DEPLOYABLE',
    authorization: false,
    canSend: false,
    tenantId: TENANT_A,
    state: 'ACTIVE',
    stateRevision: 3,
    policyRevision: 2,
    maxAttempts: 3,
    leaseSeconds: 60,
    acknowledgeSeconds: 30,
    baseRetrySeconds: 15,
    maxRetrySeconds: 300,
  };
}

function claimedReceipt() {
  return {
    schemaVersion: 1,
    operation: 'CLAIM_EMPLOYEE_MAIL',
    decision: 'CLAIMED',
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_A,
    outboxId: OUTBOX_ID,
    inviteId: INVITE_ID,
    deliveryLocator: DELIVERY_LOCATOR,
    template: 'EMPLOYEE_USER_INVITE',
    messageKey: MESSAGE_KEY,
    requestDigest: 'e'.repeat(64),
    recipientEmail: 'employee@example.com',
    tokenHash: 'f'.repeat(64),
    digestVersion: 'sha256-v1',
    secretCiphertextBase64: Buffer.alloc(71, 9).toString('base64'),
    envelopeVersion: 1,
    keyVersion: 'v1',
    aadEnvironment: 'test',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attemptNumber: 1,
    leaseVersion: 1,
    transitionRevision: 4,
    claimEnrollmentStateRevision: 3,
    claimPolicyRevision: 2,
    claimProviderAuthorityDigest: PROVIDER_DIGEST,
  };
}

function providerMarkedReceipt() {
  return {
    schemaVersion: 1,
    operation: 'MARK_EMPLOYEE_MAIL_PROVIDER_ATTEMPT',
    decision: 'MARKED',
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_A,
    outboxId: OUTBOX_ID,
    leaseVersion: 1,
    transitionRevision: 5,
    providerAttemptKey: PROVIDER_ATTEMPT_KEY,
    settlementState: 'ACTIVE',
  };
}

function completionReceipt() {
  return {
    schemaVersion: 1,
    operation: 'COMPLETE_EMPLOYEE_MAIL',
    decision: 'SENT',
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_A,
    outboxId: OUTBOX_ID,
    leaseVersion: 1,
    transitionRevision: 6,
    settlementState: 'ACTIVE',
  };
}

function reapReceipt() {
  return {
    schemaVersion: 1,
    operation: 'REAP_EMPLOYEE_MAIL',
    decision: 'REAPED',
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId: TENANT_A,
    processed: 0,
    retry: 0,
    dead: 0,
    reconciliationRequired: 0,
  };
}

function defaultReceipt(name: RpcName): unknown {
  if (name === 'readiness') return readinessReceipt();
  if (name === 'claim') return claimedReceipt();
  if (name === 'provider_mark') return providerMarkedReceipt();
  if (name === 'complete') return completionReceipt();
  return reapReceipt();
}

function rpcName(text: string): RpcName {
  if (text.includes('worker_assert_current189')) return 'readiness';
  if (text.includes('mail_claim_current189')) return 'claim';
  if (text.includes('provider_mark_current189')) return 'provider_mark';
  if (text.includes('mail_complete_current189')) return 'complete';
  if (text.includes('mail_reap_current189')) return 'reap';
  throw new Error('unexpected RPC');
}

function normalizeQuery(value: unknown): QueryCapture {
  const query = value as {
    strings?: readonly string[];
    values?: readonly unknown[];
  };
  return {
    text: query.strings?.join('?').replace(/\s+/gu, ' ').trim() ?? '',
    values: query.values ? [...query.values] : [],
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
