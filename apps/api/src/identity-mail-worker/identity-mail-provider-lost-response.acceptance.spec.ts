import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DormantIdentityMailWorkerExecutionController } from './identity-mail-worker-execution-control';
import {
  StrictIdentityMailSmtpProvider,
  type IdentityMailSmtpTransport,
  type IdentityMailSmtpTransportMessage,
} from './identity-mail-smtp-provider';
import {
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256,
  PrismaIdentityMailWorkerV2CandidateRepository,
} from './identity-mail-worker-v2-candidate.repository';
import { IdentityMailWorkerService } from './identity-mail-worker.service';
import type {
  AssertIdentityMailWorkerReadyInput,
  ClaimedIdentityMailDelivery,
  ClaimIdentityMailDeliveryInput,
  EnabledIdentityMailWorkerConfig,
  IdentityMailPreProviderFailureOutcome,
  IdentityMailProviderAttemptOutcome,
  IdentityMailWorkerExecutionBoundary,
  IdentityMailWorkerExecutionContext,
  IdentityMailWorkerExecutionControl,
  IdentityMailWorkerLogger,
  IdentityMailWorkerRepository,
  MarkIdentityMailFailureInput,
  MarkIdentityMailProviderAttemptInput,
  MarkIdentityMailSentInput,
  ReapIdentityMailDeliveryInput,
} from './identity-mail-worker.types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '77777777-7777-4777-8777-777777777777';
const PROVIDER_ATTEMPT_KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RAW_TOKEN = 'T'.repeat(43);
const SMTP_PASSWORD = 'acceptance-only-smtp-password';

const DELIVERY_A = Object.freeze({
  tenantId: TENANT_A,
  inviteId: '33333333-3333-4333-8333-333333333333',
  outboxId: '44444444-4444-4444-8444-444444444444',
  workflowLocator: '55555555-5555-4555-8555-555555555555',
  messageKey: '66666666-6666-4666-8666-666666666666',
  recipientEmail: 'owner-a@example.test',
});

const DELIVERY_B = Object.freeze({
  tenantId: TENANT_B,
  inviteId: '88888888-8888-4888-8888-888888888888',
  outboxId: '99999999-9999-4999-8999-999999999999',
  workflowLocator: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  messageKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recipientEmail: 'owner-b@example.test',
});

type FixtureIdentity = typeof DELIVERY_A | typeof DELIVERY_B;
type FixtureDeliveryState =
  | 'PENDING'
  | 'CLAIMED'
  | 'MARKED'
  | 'SENT'
  | 'RECONCILIATION_REQUIRED'
  | 'DEAD';

type FixtureDelivery = {
  readonly identity: FixtureIdentity;
  state: FixtureDeliveryState;
  transitionRevision: number;
  persistedCiphertext: string | null;
  leaseOwnerDigest: string | null;
  leaseTokenDigest: string | null;
  providerAuthorityDigest: string | null;
  markerRequest: readonly unknown[] | null;
  markerReceipt: Record<string, unknown> | null;
  completionRequest: readonly unknown[] | null;
  completionReceipt: Record<string, unknown> | null;
};

type FixtureHooks = {
  readonly afterCompletionCommit?: () => void;
};

type DatabaseFixture = {
  readonly prisma: PrismaClient;
  readonly deliveries: FixtureDelivery[];
  readonly operationLog: { operation: string; tenantId: string }[];
  readonly settlementRequests: {
    operation: 'PROVIDER_MARK' | 'COMPLETE';
    values: readonly unknown[];
  }[];
  readonly disconnect: jest.Mock;
  readonly runtimeQuery: jest.Mock;
  readonly transaction: jest.Mock;
  readonly evidence: () => {
    openTransactions: number;
    connected: boolean;
    inflight: number;
    secretBearingAfterMarker: number;
    reusable: number;
  };
};

type AcceptanceHarnessOptions = {
  readonly identities?: readonly FixtureIdentity[];
  readonly tenantIds?: readonly string[];
  readonly batchSize?: number;
  readonly lostProviderMarkResponses?: number;
  readonly lostCompletionResponses?: number;
  readonly ambiguousSmtp?: boolean;
  readonly onSmtpBoundary?: () => void;
  readonly afterCompletionCommit?: () => void;
};

describe('CURRENT184 provider lost-response service acceptance', () => {
  it('replays post-commit provider mark and completion with exactly one SMTP invocation', async () => {
    const target = acceptanceHarness({
      lostProviderMarkResponses: 1,
      lostCompletionResponses: 1,
    });

    const result = await target.service.runOnce(target.control);

    expect(result).toEqual({
      claimed: 1,
      sent: 1,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    });
    expect(target.transport.sendMail.mock.calls).toHaveLength(1);
    expect(target.db.deliveries[0]?.state).toBe('SENT');
    expect(target.db.evidence()).toMatchObject({
      openTransactions: 0,
      inflight: 0,
      secretBearingAfterMarker: 0,
      reusable: 0,
    });
    expect(target.repository.claimedBuffers).toHaveLength(1);
    expect([...target.repository.claimedBuffers[0]]).toEqual(
      Array.from({ length: 71 }, () => 0),
    );

    const markerRequests = target.db.settlementRequests.filter(
      ({ operation }) => operation === 'PROVIDER_MARK',
    );
    const completionRequests = target.db.settlementRequests.filter(
      ({ operation }) => operation === 'COMPLETE',
    );
    expect(markerRequests).toHaveLength(2);
    expect(markerRequests[0]?.values).toEqual(markerRequests[1]?.values);
    expect(completionRequests).toHaveLength(2);
    expect(completionRequests[0]?.values).toEqual(
      completionRequests[1]?.values,
    );

    const evidence = {
      result,
      smtpInvocations: target.transport.sendMail.mock.calls.length,
      state: target.db.deliveries[0]?.state,
      database: target.db.evidence(),
      logs: target.loggerEvents,
      testAccessAuthorized: false,
      sharedBetaAccess: false,
    };
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(DELIVERY_A.recipientEmail);
    expect(serialized).not.toContain(RAW_TOKEN);
    expect(serialized).not.toContain(SMTP_PASSWORD);

    target.service.close();
    await target.repository.disconnect();
    expect(target.transportClose.mock.calls).toHaveLength(1);
    expect(target.db.disconnect).toHaveBeenCalledTimes(1);
    expect(target.db.evidence()).toMatchObject({
      openTransactions: 0,
      connected: false,
      inflight: 0,
    });
  });

  it('quarantines an ambiguous SMTP result and never performs a blind resend', async () => {
    const target = acceptanceHarness({ ambiguousSmtp: true });

    await expect(target.service.runOnce(target.control)).resolves.toMatchObject(
      {
        claimed: 1,
        sent: 0,
        retry: 0,
        reconciliationRequired: 1,
      },
    );
    expect(target.transport.sendMail.mock.calls).toHaveLength(1);
    expect(target.db.deliveries[0]?.state).toBe('RECONCILIATION_REQUIRED');
    expect(target.db.evidence()).toMatchObject({
      openTransactions: 0,
      inflight: 0,
      secretBearingAfterMarker: 0,
      reusable: 0,
    });

    await expect(target.service.runOnce(target.control)).resolves.toMatchObject(
      {
        claimed: 0,
        sent: 0,
        retry: 0,
        reconciliationRequired: 0,
      },
    );
    expect(target.transport.sendMail.mock.calls).toHaveLength(1);
  });

  it.each<{
    label: string;
    boundary:
      | IdentityMailWorkerExecutionBoundary
      | 'DURING_SMTP'
      | 'DURING_COMPLETION';
    expectedState: FixtureDeliveryState;
    smtpCalls: number;
    expected: Partial<{
      claimed: number;
      sent: number;
      dead: number;
      reconciliationRequired: number;
    }>;
  }>([
    {
      label: 'before claim',
      boundary: 'BEFORE_CLAIM',
      expectedState: 'PENDING',
      smtpCalls: 0,
      expected: { claimed: 0, sent: 0 },
    },
    {
      label: 'after claim',
      boundary: 'AFTER_CLAIM',
      expectedState: 'DEAD',
      smtpCalls: 0,
      expected: { claimed: 1, dead: 1, sent: 0 },
    },
    {
      label: 'after provider marker',
      boundary: 'AFTER_PROVIDER_MARK',
      expectedState: 'RECONCILIATION_REQUIRED',
      smtpCalls: 0,
      expected: { claimed: 1, reconciliationRequired: 1, sent: 0 },
    },
    {
      label: 'during SMTP',
      boundary: 'DURING_SMTP',
      expectedState: 'SENT',
      smtpCalls: 1,
      expected: { claimed: 1, sent: 1 },
    },
    {
      label: 'after provider acceptance',
      boundary: 'AFTER_SMTP_ACCEPTED',
      expectedState: 'SENT',
      smtpCalls: 1,
      expected: { claimed: 1, sent: 1 },
    },
    {
      label: 'during completion',
      boundary: 'DURING_COMPLETION',
      expectedState: 'SENT',
      smtpCalls: 1,
      expected: { claimed: 1, sent: 1 },
    },
  ])(
    'settles safely when emergency kill is injected $label',
    async ({ boundary, expectedState, smtpCalls, expected }) => {
      const controller = new DormantIdentityMailWorkerExecutionController();
      const controlled =
        boundary === 'DURING_SMTP' || boundary === 'DURING_COMPLETION'
          ? controller
          : new BoundaryInjectionControl(controller, boundary, TENANT_A, () =>
              controller.killTenant(TENANT_A),
            );
      const target = acceptanceHarness({
        onSmtpBoundary:
          boundary === 'DURING_SMTP'
            ? () => controller.killTenant(TENANT_A)
            : undefined,
        afterCompletionCommit:
          boundary === 'DURING_COMPLETION'
            ? () => controller.killTenant(TENANT_A)
            : undefined,
      });

      const result = await target.service.runOnce(controlled);

      expect(result).toMatchObject(expected);
      expect(target.transport.sendMail.mock.calls).toHaveLength(smtpCalls);
      expect(target.db.deliveries[0]?.state).toBe(expectedState);
      expect(target.db.evidence()).toMatchObject({
        openTransactions: 0,
        inflight: 0,
        secretBearingAfterMarker: 0,
      });
      if (expectedState !== 'PENDING') {
        expect(target.db.evidence().reusable).toBe(0);
      }
    },
  );

  it('distinguishes graceful global drain from emergency global kill', async () => {
    const gracefulController =
      new DormantIdentityMailWorkerExecutionController();
    const gracefulControl = new BoundaryInjectionControl(
      gracefulController,
      'AFTER_CLAIM',
      TENANT_A,
      () => gracefulController.beginGlobalDrain(),
    );
    const graceful = acceptanceHarness({
      identities: [DELIVERY_A, DELIVERY_B],
      tenantIds: [TENANT_A, TENANT_B],
      batchSize: 2,
    });

    await expect(
      graceful.service.runOnce(gracefulControl),
    ).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(graceful.transport.sendMail.mock.calls).toHaveLength(1);
    expect(graceful.db.deliveries.map(({ state }) => state)).toEqual([
      'SENT',
      'PENDING',
    ]);

    const killed = acceptanceHarness();
    killed.control.killGlobal();
    await expect(killed.service.runOnce(killed.control)).resolves.toEqual({
      claimed: 0,
      sent: 0,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    });
    expect(killed.db.runtimeQuery).toHaveBeenCalledTimes(0);
    expect(killed.db.transaction).toHaveBeenCalledTimes(0);
    expect(killed.transport.verify.mock.calls).toHaveLength(0);
    expect(killed.transport.sendMail.mock.calls).toHaveLength(0);
  });

  it('drains and kills one tenant without blocking an ACTIVE tenant', async () => {
    const target = acceptanceHarness({
      identities: [DELIVERY_B],
      tenantIds: [TENANT_A, TENANT_B],
    });
    target.control.beginTenantDrain(TENANT_A);

    await expect(target.service.runOnce(target.control)).resolves.toMatchObject(
      {
        claimed: 1,
        sent: 1,
      },
    );
    expect(
      target.db.operationLog.filter(
        ({ tenantId, operation }) =>
          tenantId === TENANT_A && operation === 'ASSERT',
      ),
    ).toHaveLength(0);
    expect(
      target.db.operationLog.filter(
        ({ tenantId, operation }) =>
          tenantId === TENANT_A && operation === 'REAP',
      ),
    ).toHaveLength(1);
    expect(
      target.db.operationLog.filter(
        ({ tenantId, operation }) =>
          tenantId === TENANT_A && operation === 'CLAIM',
      ),
    ).toHaveLength(0);

    target.control.killTenant(TENANT_A);
    const offset = target.db.operationLog.length;
    await target.service.runOnce(target.control);
    expect(
      target.db.operationLog
        .slice(offset)
        .filter(({ tenantId }) => tenantId === TENANT_A),
    ).toHaveLength(0);
    expect(target.control.snapshot()).toEqual({
      globalMode: 'ACTIVE',
      tenants: [{ tenantId: TENANT_A, mode: 'KILLED' }],
    });
  });

  it('keeps the CURRENT184 repository deny-only when accidentally wired to the service', async () => {
    const db = databaseFixture([DELIVERY_A]);
    const repository = new PrismaIdentityMailWorkerV2CandidateRepository(
      db.prisma,
    );
    const smtpVerify = jest.fn().mockResolvedValue(undefined);
    const smtpSend = jest.fn().mockResolvedValue({
      receiptDigest: 'd'.repeat(64),
      outcomeCode: 'SMTP_ACCEPTED' as const,
    });
    const service = new IdentityMailWorkerService(
      workerConfig([TENANT_A], 1),
      repository,
      { openInitialOwnerInviteToken: () => RAW_TOKEN },
      { verify: smtpVerify, send: smtpSend, close: jest.fn() },
      undefined,
      {
        randomBytes: () => Buffer.alloc(32, 7),
        randomUuid: () => PROVIDER_ATTEMPT_KEY,
      },
    );

    await expect(service.runOnce()).rejects.toMatchObject({
      reasonCode: 'IDENTITY_MAIL_WORKER_V2_CANDIDATE_NOT_DEPLOYABLE',
    });
    expect(db.operationLog).toContainEqual({
      operation: 'ASSERT',
      tenantId: TENANT_A,
    });
    expect(smtpVerify.mock.calls).toHaveLength(0);
    expect(smtpSend.mock.calls).toHaveLength(0);
    expect(
      db.operationLog.filter(({ operation }) => operation !== 'ASSERT'),
    ).toHaveLength(0);
  });
});

class DiagnosticCandidateAcceptanceRepository implements IdentityMailWorkerRepository {
  readonly claimedBuffers: Buffer[] = [];

  constructor(
    private readonly candidate: PrismaIdentityMailWorkerV2CandidateRepository,
  ) {}

  assertReady(input: AssertIdentityMailWorkerReadyInput): Promise<void> {
    return this.candidate.assertDiagnosticReady(input);
  }

  async claimOne(
    input: ClaimIdentityMailDeliveryInput,
  ): Promise<ClaimedIdentityMailDelivery | null> {
    const claim = await this.candidate.claimOne(input);
    if (claim) {
      this.claimedBuffers.push(claim.secretCiphertext);
    }
    return claim;
  }

  reapExpired(input: ReapIdentityMailDeliveryInput): Promise<number> {
    return this.candidate.reapExpired(input);
  }

  markProviderAttempt(
    input: MarkIdentityMailProviderAttemptInput,
  ): Promise<IdentityMailProviderAttemptOutcome> {
    return this.candidate.markProviderAttempt(input);
  }

  markSent(input: MarkIdentityMailSentInput): Promise<void> {
    return this.candidate.markSent(input);
  }

  markPreProviderFailure(
    input: MarkIdentityMailFailureInput,
  ): Promise<IdentityMailPreProviderFailureOutcome> {
    return this.candidate.markPreProviderFailure(input);
  }

  markReconciliationRequired(
    input: MarkIdentityMailFailureInput,
  ): Promise<void> {
    return this.candidate.markReconciliationRequired(input);
  }

  disconnect(): Promise<void> {
    return this.candidate.disconnect();
  }
}

class BoundaryInjectionControl implements IdentityMailWorkerExecutionControl {
  private injected = false;

  constructor(
    private readonly delegate: IdentityMailWorkerExecutionControl,
    private readonly target: IdentityMailWorkerExecutionBoundary,
    private readonly tenantId: string,
    private readonly inject: () => void,
  ) {}

  modeAt(context: IdentityMailWorkerExecutionContext) {
    if (
      !this.injected &&
      context.boundary === this.target &&
      context.tenantId === this.tenantId
    ) {
      this.injected = true;
      this.inject();
    }
    return this.delegate.modeAt(context);
  }
}

function acceptanceHarness(options: AcceptanceHarnessOptions = {}) {
  const identities = options.identities ?? [DELIVERY_A];
  const tenantIds = options.tenantIds ?? [TENANT_A];
  const db = databaseFixture(identities, {
    lostProviderMarkResponses: options.lostProviderMarkResponses ?? 0,
    lostCompletionResponses: options.lostCompletionResponses ?? 0,
    hooks: { afterCompletionCommit: options.afterCompletionCommit },
  });
  const candidate = new PrismaIdentityMailWorkerV2CandidateRepository(
    db.prisma,
  );
  const repository = new DiagnosticCandidateAcceptanceRepository(candidate);
  const transportClose = jest.fn();
  const transport: jest.Mocked<IdentityMailSmtpTransport> = {
    verify: jest.fn().mockResolvedValue(undefined),
    sendMail: jest.fn(
      (message: IdentityMailSmtpTransportMessage): Promise<unknown> => {
        options.onSmtpBoundary?.();
        if (options.ambiguousSmtp) {
          return Promise.reject(
            new Error('simulated socket loss after provider acceptance'),
          );
        }
        return Promise.resolve({
          accepted: [message.to],
          rejected: [],
          messageId: message.messageId,
        });
      },
    ),
    close: transportClose,
  };
  const smtpProvider = new StrictIdentityMailSmtpProvider(
    workerConfig(tenantIds, options.batchSize ?? 1).smtp,
    () => transport,
  );
  const loggerEvents: unknown[] = [];
  const logger: IdentityMailWorkerLogger = {
    log: (event) => loggerEvents.push(event),
    warn: (event) => loggerEvents.push(event),
    error: (event) => loggerEvents.push(event),
  };
  const service = new IdentityMailWorkerService(
    workerConfig(tenantIds, options.batchSize ?? 1),
    repository,
    {
      openInitialOwnerInviteToken: () => RAW_TOKEN,
    },
    smtpProvider,
    logger,
    {
      randomBytes: () => Buffer.alloc(32, 7),
      randomUuid: () => PROVIDER_ATTEMPT_KEY,
    },
  );
  return {
    db,
    repository,
    service,
    transport,
    transportClose,
    loggerEvents,
    control: new DormantIdentityMailWorkerExecutionController(),
  };
}

function workerConfig(
  tenantIds: readonly string[],
  batchSize: number,
): EnabledIdentityMailWorkerConfig {
  return {
    enabled: true,
    realSendEnabled: true,
    liveCanaryEnabled: true,
    databaseUrl:
      'postgresql://candidate:acceptance-only@db.example.test:5432/leetplus_candidate?schema=public&sslmode=require&connect_timeout=5&socket_timeout=30',
    databaseTlsRequired: true,
    databaseConnectTimeoutSeconds: 5,
    databaseSocketTimeoutSeconds: 30,
    expectedDatabase: 'leetplus_candidate',
    expectedRole: 'leetplus_identity_mail_worker_v2',
    expectedMigration: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION,
    expectedMigrationCount: IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT,
    releaseSha: 'f'.repeat(40),
    canaryTenantIds: tenantIds,
    publicWebOrigin: 'https://leetplus.ru',
    encryptionKey: Buffer.alloc(32, 9).toString('base64url'),
    encryptionKeyVersion: 'v1',
    aadEnvironment: 'production',
    pollIntervalMs: 5_000,
    leaseMs: 120_000,
    batchSize,
    maxAttempts: 5,
    baseRetryMs: 60_000,
    maxRetryMs: 3_600_000,
    healthHost: '127.0.0.1',
    healthPort: 4301,
    smtp: {
      host: 'smtp.example.test',
      port: 587,
      tlsMode: 'STARTTLS',
      servername: 'smtp.example.test',
      username: 'acceptance-only',
      password: SMTP_PASSWORD,
      from: 'no-reply@leetplus.ru',
      messageIdDomain: 'mail.leetplus.ru',
      connectionTimeoutMs: 10_000,
      greetingTimeoutMs: 10_000,
      socketTimeoutMs: 30_000,
    },
  };
}

function databaseFixture(
  identities: readonly FixtureIdentity[],
  options: {
    lostProviderMarkResponses?: number;
    lostCompletionResponses?: number;
    hooks?: FixtureHooks;
  } = {},
): DatabaseFixture {
  const deliveries = identities.map(createFixtureDelivery);
  const operationLog: { operation: string; tenantId: string }[] = [];
  const settlementRequests: DatabaseFixture['settlementRequests'][number][] =
    [];
  let lostProviderMarkResponses = options.lostProviderMarkResponses ?? 0;
  let lostCompletionResponses = options.lostCompletionResponses ?? 0;
  let openTransactions = 0;
  let connected = true;

  const runtimeQuery = jest.fn().mockResolvedValue([
    {
      databaseName: 'leetplus_candidate',
      sessionRole: 'leetplus_identity_mail_worker_v2',
      currentRole: 'leetplus_identity_mail_worker_v2',
      transportTls: true,
      transportTlsVersion: 'TLSv1.3',
      transportTlsCipher: 'TLS_AES_256_GCM_SHA384',
    },
  ]);
  const disconnect = jest.fn().mockImplementation(() => {
    connected = false;
    return Promise.resolve();
  });

  const transaction = jest.fn(
    async (
      operation: (client: {
        $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
      }) => Promise<unknown>,
    ): Promise<unknown> => {
      openTransactions += 1;
      let settlementOperation: 'PROVIDER_MARK' | 'COMPLETE' | null = null;
      try {
        const result = await operation({
          $queryRaw: (query: Prisma.Sql) => {
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
              const tenantId = query.values.find(
                (value) =>
                  typeof value === 'string' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
                    value,
                  ),
              );
              return Promise.resolve([{ tenantId, backendPid: 12_345 }]);
            }
            const rpcResult = dispatchRpc(
              query,
              deliveries,
              operationLog,
              settlementRequests,
              options.hooks,
            );
            if (sql.includes('provider_mark_v2')) {
              settlementOperation = 'PROVIDER_MARK';
            } else if (sql.includes('complete_v2')) {
              settlementOperation = 'COMPLETE';
            }
            return Promise.resolve([{ result: rpcResult }]);
          },
        });

        // The callback and durable mutation completed. Throwing here models a
        // transaction COMMIT whose response was lost on the client boundary.
        if (
          settlementOperation === 'PROVIDER_MARK' &&
          lostProviderMarkResponses > 0
        ) {
          lostProviderMarkResponses -= 1;
          throw databaseResponseLost('P1017');
        }
        if (settlementOperation === 'COMPLETE' && lostCompletionResponses > 0) {
          lostCompletionResponses -= 1;
          throw databaseResponseLost('P2010', '08006');
        }
        return result;
      } finally {
        openTransactions -= 1;
      }
    },
  );

  const prisma = {
    $queryRaw: runtimeQuery,
    $transaction: transaction,
    $disconnect: disconnect,
  } as unknown as PrismaClient;

  return {
    prisma,
    deliveries,
    operationLog,
    settlementRequests,
    disconnect,
    runtimeQuery,
    transaction,
    evidence: () => ({
      openTransactions,
      connected,
      inflight: deliveries.filter(({ state }) =>
        ['CLAIMED', 'MARKED'].includes(state),
      ).length,
      secretBearingAfterMarker: deliveries.filter(
        ({ state, persistedCiphertext }) =>
          ['MARKED', 'SENT', 'RECONCILIATION_REQUIRED', 'DEAD'].includes(
            state,
          ) && persistedCiphertext !== null,
      ).length,
      reusable: deliveries.filter(({ state }) => state === 'PENDING').length,
    }),
  };
}

function dispatchRpc(
  query: Prisma.Sql,
  deliveries: FixtureDelivery[],
  operationLog: { operation: string; tenantId: string }[],
  settlementRequests: DatabaseFixture['settlementRequests'][number][],
  hooks: FixtureHooks | undefined,
): unknown {
  const sql = query.strings.join('');
  const values = [...query.values];
  const tenantId = stringAt(values, 0);
  if (sql.includes('identity_mail_delivery_worker_assert_v2')) {
    operationLog.push({ operation: 'ASSERT', tenantId });
    return readinessReceipt(tenantId, stringAt(values, 1));
  }
  if (sql.includes('identity_initial_owner_mail_reap_v2')) {
    operationLog.push({ operation: 'REAP', tenantId });
    return {
      schemaVersion: 2,
      operation: 'REAP_INITIAL_OWNER_MAIL_V2',
      decision: 'COMPLETED',
      candidateStatus: 'NOT_DEPLOYABLE',
      tenantId,
      settlementState: 'DRAINING',
      processed: 0,
    };
  }
  if (sql.includes('identity_initial_owner_mail_claim_v2')) {
    operationLog.push({ operation: 'CLAIM', tenantId });
    const delivery = deliveries.find(
      ({ identity, state }) =>
        identity.tenantId === tenantId && state === 'PENDING',
    );
    if (!delivery) {
      return {
        schemaVersion: 2,
        operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
        decision: 'EMPTY',
        tenantId,
      };
    }
    delivery.state = 'CLAIMED';
    delivery.transitionRevision = 2;
    delivery.leaseOwnerDigest = stringAt(values, 1);
    delivery.leaseTokenDigest = stringAt(values, 2);
    delivery.providerAuthorityDigest = stringAt(values, 3);
    return claimReceipt(delivery);
  }
  if (sql.includes('identity_initial_owner_mail_provider_mark_v2')) {
    settlementRequests.push({ operation: 'PROVIDER_MARK', values });
    operationLog.push({ operation: 'PROVIDER_MARK', tenantId });
    return markProvider(deliveries, values);
  }
  if (sql.includes('identity_initial_owner_mail_complete_v2')) {
    settlementRequests.push({ operation: 'COMPLETE', values });
    operationLog.push({ operation: 'COMPLETE', tenantId });
    return completeDelivery(deliveries, values, hooks);
  }
  throw new Error('IDENTITY_MAIL_ACCEPTANCE_RPC_UNEXPECTED');
}

function markProvider(
  deliveries: FixtureDelivery[],
  values: readonly unknown[],
): Record<string, unknown> {
  const tenantId = stringAt(values, 0);
  const outboxId = stringAt(values, 1);
  const delivery = requiredDelivery(deliveries, tenantId, outboxId);
  if (delivery.markerReceipt) {
    assertReplay(delivery.markerRequest, values);
    return delivery.markerReceipt;
  }
  if (
    delivery.state !== 'CLAIMED' ||
    delivery.leaseOwnerDigest !== stringAt(values, 3) ||
    delivery.leaseTokenDigest !== stringAt(values, 4) ||
    delivery.providerAuthorityDigest !== stringAt(values, 6)
  ) {
    throw new Error('IDENTITY_MAIL_ACCEPTANCE_MARK_BINDING_INVALID');
  }
  delivery.state = 'MARKED';
  delivery.transitionRevision = 3;
  delivery.persistedCiphertext = null;
  delivery.markerRequest = values;
  delivery.markerReceipt = {
    schemaVersion: 2,
    operation: 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
    decision: 'MARKED',
    candidateStatus: 'NOT_DEPLOYABLE',
    outboxId,
    tenantId,
    leaseVersion: 1,
    transitionRevision: 3,
    providerAttemptKey: stringAt(values, 5),
    settlementState: 'ACTIVE',
  };
  return delivery.markerReceipt;
}

function completeDelivery(
  deliveries: FixtureDelivery[],
  values: readonly unknown[],
  hooks: FixtureHooks | undefined,
): Record<string, unknown> {
  const tenantId = stringAt(values, 0);
  const outboxId = stringAt(values, 1);
  const delivery = requiredDelivery(deliveries, tenantId, outboxId);
  if (delivery.completionReceipt) {
    assertReplay(delivery.completionRequest, values);
    return delivery.completionReceipt;
  }
  const outcome = stringAt(values, 6);
  const expectedState = outcome === 'PRE_PROVIDER_DEAD' ? 'CLAIMED' : 'MARKED';
  if (delivery.state !== expectedState) {
    throw new Error('IDENTITY_MAIL_ACCEPTANCE_COMPLETE_STATE_INVALID');
  }
  const decision =
    outcome === 'PROVIDER_ACCEPTED'
      ? 'SENT'
      : outcome === 'PROVIDER_AMBIGUOUS'
        ? 'RECONCILIATION_REQUIRED'
        : outcome === 'PRE_PROVIDER_DEAD'
          ? 'DEAD'
          : 'RETRY';
  delivery.state = decision as FixtureDeliveryState;
  delivery.transitionRevision = expectedState === 'MARKED' ? 4 : 3;
  if (decision !== 'RETRY') {
    delivery.persistedCiphertext = null;
  }
  delivery.completionRequest = values;
  delivery.completionReceipt = {
    schemaVersion: 2,
    operation: 'COMPLETE_INITIAL_OWNER_MAIL_V2',
    decision,
    candidateStatus: 'NOT_DEPLOYABLE',
    tenantId,
    outboxId,
    leaseVersion: 1,
    transitionRevision: delivery.transitionRevision,
    settlementState: 'ACTIVE',
  };
  hooks?.afterCompletionCommit?.();
  return delivery.completionReceipt;
}

function createFixtureDelivery(identity: FixtureIdentity): FixtureDelivery {
  return {
    identity,
    state: 'PENDING',
    transitionRevision: 1,
    persistedCiphertext: Buffer.alloc(71, 7).toString('base64'),
    leaseOwnerDigest: null,
    leaseTokenDigest: null,
    providerAuthorityDigest: null,
    markerRequest: null,
    markerReceipt: null,
    completionRequest: null,
    completionReceipt: null,
  };
}

function claimReceipt(delivery: FixtureDelivery): Record<string, unknown> {
  return {
    schemaVersion: 2,
    operation: 'CLAIM_INITIAL_OWNER_MAIL_V2',
    decision: 'CLAIMED',
    candidateStatus: 'NOT_DEPLOYABLE',
    outboxId: delivery.identity.outboxId,
    tenantId: delivery.identity.tenantId,
    inviteId: delivery.identity.inviteId,
    workflowLocator: delivery.identity.workflowLocator,
    aadEnvironment: 'production',
    template: 'INITIAL_OWNER_INVITE',
    messageKey: delivery.identity.messageKey,
    requestDigest: '2'.repeat(64),
    tokenHash: createHash('sha256').update(RAW_TOKEN).digest('hex'),
    digestVersion: 'sha256-v1',
    secretCiphertextBase64: delivery.persistedCiphertext,
    envelopeVersion: 1,
    keyVersion: 'v1',
    recipientEmail: delivery.identity.recipientEmail,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attemptNumber: 1,
    leaseVersion: 1,
    transitionRevision: delivery.transitionRevision,
    claimEnrollmentStateRevision: 3,
    claimPolicyRevision: 2,
    claimProviderAuthorityDigest: delivery.providerAuthorityDigest,
  };
}

function readinessReceipt(
  tenantId: string,
  providerAuthorityDigest: string,
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    operation: 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER_V2',
    decision: 'REHEARSAL_READY',
    candidateStatus: 'NOT_DEPLOYABLE',
    authorization: false,
    canSend: false,
    tenantId,
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
    maxRetrySeconds: 3_600,
    providerAuthorityDigest,
  };
}

function requiredDelivery(
  deliveries: FixtureDelivery[],
  tenantId: string,
  outboxId: string,
): FixtureDelivery {
  const delivery = deliveries.find(
    ({ identity }) =>
      identity.tenantId === tenantId && identity.outboxId === outboxId,
  );
  if (!delivery) {
    throw new Error('IDENTITY_MAIL_ACCEPTANCE_DELIVERY_NOT_FOUND');
  }
  return delivery;
}

function assertReplay(
  durable: readonly unknown[] | null,
  replay: readonly unknown[],
): void {
  if (
    !durable ||
    durable.length !== replay.length ||
    durable.some((value, index) => value !== replay[index])
  ) {
    throw new Error('IDENTITY_MAIL_ACCEPTANCE_REPLAY_MISMATCH');
  }
}

function stringAt(values: readonly unknown[], index: number): string {
  const value = values[index];
  if (typeof value !== 'string') {
    throw new Error('IDENTITY_MAIL_ACCEPTANCE_RPC_VALUE_INVALID');
  }
  return value;
}

function databaseResponseLost(code: string, sqlState?: string): Error {
  const error = new Error(
    'simulated response loss after durable commit',
  ) as Error & {
    code: string;
    meta?: { code: string };
  };
  error.code = code;
  if (sqlState) {
    error.meta = { code: sqlState };
  }
  return error;
}
