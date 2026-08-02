import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  AssertIdentityMailWorkerReadyInput,
  ClaimedIdentityMailDelivery,
  ClaimIdentityMailDeliveryInput,
  IdentityMailDeliveryLeaseInput,
  IdentityMailPreProviderFailureOutcome,
  IdentityMailProviderAttemptOutcome,
  IdentityMailWorkerRepository,
  MarkIdentityMailFailureInput,
  MarkIdentityMailProviderAttemptInput,
  MarkIdentityMailSentInput,
  ReapIdentityMailDeliveryInput,
} from './identity-mail-worker.types';

export const IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION =
  '20260802020000_identity_mail_worker_v2_lost_response_replay' as const;
export const IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT = 184 as const;

export const IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256 =
  'd889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424' as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENTITY_MAIL_TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const IDENTITY_MAIL_TENANT_LOCK_SEED = 180;
const IDENTITY_MAIL_STATEMENT_TIMEOUT = '25s';
const IDENTITY_MAIL_LOCK_TIMEOUT = '5s';
const IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS = 2;
const IDENTITY_MAIL_TENANT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 30_000,
} as const;
const SECRET_ENVELOPE_BYTES = 71;
const MAX_LEASE_VERSION = 2_147_483_647n;

const READINESS_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'authorization',
  'canSend',
  'tenantId',
  'migrationHead',
  'migrationCount',
  'candidateChecksum',
  'state',
  'stateRevision',
  'policyRevision',
  'currentConfigurationDigest',
  'maxAttempts',
  'leaseSeconds',
  'acknowledgeSeconds',
  'baseRetrySeconds',
  'maxRetrySeconds',
  'providerAuthorityDigest',
] as const;
const CLAIM_EMPTY_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'tenantId',
] as const;
const CLAIMED_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'outboxId',
  'tenantId',
  'inviteId',
  'workflowLocator',
  'aadEnvironment',
  'template',
  'messageKey',
  'requestDigest',
  'tokenHash',
  'digestVersion',
  'secretCiphertextBase64',
  'envelopeVersion',
  'keyVersion',
  'recipientEmail',
  'expiresAt',
  'attemptNumber',
  'leaseVersion',
  'transitionRevision',
  'claimEnrollmentStateRevision',
  'claimPolicyRevision',
  'claimProviderAuthorityDigest',
] as const;
const PROVIDER_CANCELED_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'outboxId',
  'tenantId',
  'leaseVersion',
  'transitionRevision',
] as const;
const PROVIDER_MARKED_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'outboxId',
  'tenantId',
  'leaseVersion',
  'transitionRevision',
  'providerAttemptKey',
  'settlementState',
] as const;
const PROVIDER_HANDOFF_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'outboxId',
  'tenantId',
  'leaseVersion',
  'transitionRevision',
  'settlementState',
  'handoffReason',
  'durableEvidenceEventId',
] as const;
const COMPLETION_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'outboxId',
  'leaseVersion',
  'transitionRevision',
  'settlementState',
] as const;
const REAP_RECEIPT_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'settlementState',
  'processed',
] as const;

type RuntimeIdentityRow = {
  databaseName: string;
  sessionRole: string;
  currentRole: string;
  transportTls: boolean;
  transportTlsVersion: string | null;
  transportTlsCipher: string | null;
};

type RpcRow = { result: unknown };

type IdentityMailTenantTransactionSettingsRow = {
  isolationLevel: string;
  readOnly: string;
  statementTimeout: string;
  lockTimeout: string;
};

type IdentityMailTenantLockRow = {
  tenantId: string;
  backendPid: number;
};

type IdentityMailWorkerRpcClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export type IdentityMailWorkerV2SettlementState = 'ACTIVE' | 'DRAINING';

export type ClaimedIdentityMailDeliveryV2Candidate =
  ClaimedIdentityMailDelivery & {
    readonly claimEnrollmentStateRevision: bigint;
    readonly claimPolicyRevision: number;
    readonly claimProviderAuthorityDigest: string;
  };

type IdentityMailV2ClaimBinding = {
  readonly tenantId: string;
  readonly inviteId: string;
  readonly leaseVersion: bigint;
  readonly leaseOwnerDigest: string;
  readonly leaseTokenDigest: string;
  readonly transitionRevision: number;
  readonly claimEnrollmentStateRevision: bigint;
  readonly claimPolicyRevision: number;
  readonly claimProviderAuthorityDigest: string;
};

export class IdentityMailWorkerV2CandidateRepositoryError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailWorkerV2CandidateRepositoryError';
  }
}

export type IdentityMailWorkerV2AmbiguousSettlementOperation =
  | 'PROVIDER_MARK'
  | 'COMPLETE';

export class IdentityMailWorkerV2AmbiguousSettlementError extends IdentityMailWorkerV2CandidateRepositoryError {
  readonly attempts = IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS;

  constructor(
    readonly operation: IdentityMailWorkerV2AmbiguousSettlementOperation,
  ) {
    super('IDENTITY_MAIL_WORKER_V2_SETTLEMENT_RESPONSE_UNKNOWN');
    this.name = 'IdentityMailWorkerV2AmbiguousSettlementError';
  }
}

/**
 * Dormant CURRENT184 adapter. It intentionally has no Injectable decorator,
 * module provider, config switch or CLI import.
 */
export class PrismaIdentityMailWorkerV2CandidateRepository implements IdentityMailWorkerRepository {
  private readonly claimBindings = new Map<
    string,
    IdentityMailV2ClaimBinding
  >();

  constructor(private readonly prisma: PrismaClient) {}

  async assertReady(input: AssertIdentityMailWorkerReadyInput): Promise<void> {
    if (
      input.expectedMigration !== IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION ||
      input.expectedMigrationCount !==
        IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT ||
      !RELEASE_SHA_PATTERN.test(input.releaseSha) ||
      !SHA256_PATTERN.test(input.providerAuthorityDigest) ||
      typeof input.databaseTlsRequired !== 'boolean' ||
      input.canaryTenantIds.length === 0 ||
      new Set(input.canaryTenantIds).size !== input.canaryTenantIds.length ||
      input.canaryTenantIds.some((tenantId) => !UUID_PATTERN.test(tenantId)) ||
      !validExpectedPolicy(input.expectedPolicy)
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_RELEASE_CONTRACT_MISMATCH');
    }

    const rows = await this.prisma.$queryRaw<RuntimeIdentityRow[]>(Prisma.sql`
      SELECT
        pg_catalog.current_database()::TEXT AS "databaseName",
        session_user::TEXT AS "sessionRole",
        current_user::TEXT AS "currentRole",
        COALESCE(
          (
            SELECT transport.ssl
            FROM pg_catalog.pg_stat_ssl AS transport
            WHERE transport.pid = pg_catalog.pg_backend_pid()
          ),
          false
        ) AS "transportTls",
        (
          SELECT transport.version::TEXT
          FROM pg_catalog.pg_stat_ssl AS transport
          WHERE transport.pid = pg_catalog.pg_backend_pid()
        ) AS "transportTlsVersion",
        (
          SELECT transport.cipher::TEXT
          FROM pg_catalog.pg_stat_ssl AS transport
          WHERE transport.pid = pg_catalog.pg_backend_pid()
        ) AS "transportTlsCipher"
    `);
    const runtime = rows[0];
    if (
      rows.length !== 1 ||
      !runtime ||
      runtime.databaseName !== input.expectedDatabase ||
      runtime.sessionRole !== input.expectedRole ||
      runtime.currentRole !== input.expectedRole ||
      typeof runtime.transportTls !== 'boolean' ||
      (runtime.transportTls &&
        (!validTransportDetail(runtime.transportTlsVersion) ||
          !validTransportDetail(runtime.transportTlsCipher))) ||
      (!runtime.transportTls &&
        (runtime.transportTlsVersion !== null ||
          runtime.transportTlsCipher !== null)) ||
      (input.databaseTlsRequired && !runtime.transportTls)
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_RUNTIME_IDENTITY_MISMATCH');
    }

    for (const tenantId of input.canaryTenantIds) {
      const receipt = await this.tenantRpc(
        tenantId,
        Prisma.sql`
          SELECT public."identity_mail_delivery_worker_assert_v2"(
            ${tenantId}::TEXT,
            ${input.providerAuthorityDigest}::TEXT
          ) AS result
        `,
      );
      assertReadinessReceipt(receipt, tenantId, input);
    }
  }

  async claimOne(
    input: ClaimIdentityMailDeliveryInput,
  ): Promise<ClaimedIdentityMailDeliveryV2Candidate | null> {
    if (
      !UUID_PATTERN.test(input.tenantId) ||
      !SHA256_PATTERN.test(input.leaseOwnerDigest) ||
      !SHA256_PATTERN.test(input.leaseTokenDigest) ||
      !SHA256_PATTERN.test(input.providerAuthorityDigest) ||
      input.leaseOwnerDigest === input.leaseTokenDigest
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_INPUT_INVALID');
    }

    const result = await this.tenantRpc(
      input.tenantId,
      Prisma.sql`
        SELECT public."identity_initial_owner_mail_claim_v2"(
          ${input.tenantId}::TEXT,
          ${input.leaseOwnerDigest}::TEXT,
          ${input.leaseTokenDigest}::TEXT,
          ${input.providerAuthorityDigest}::TEXT
        ) AS result
      `,
    );
    const untrustedRecord = recordValue(result);
    if (untrustedRecord.decision === 'EMPTY') {
      const record = exactRecordValue(
        untrustedRecord,
        CLAIM_EMPTY_RECEIPT_KEYS,
        'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
      );
      if (
        record.schemaVersion !== 2 ||
        record.operation !== 'CLAIM_INITIAL_OWNER_MAIL_V2' ||
        record.decision !== 'EMPTY' ||
        record.tenantId !== input.tenantId
      ) {
        fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
      }
      return null;
    }

    const record = exactRecordValue(
      untrustedRecord,
      CLAIMED_RECEIPT_KEYS,
      'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
    );
    if (
      record.schemaVersion !== 2 ||
      record.operation !== 'CLAIM_INITIAL_OWNER_MAIL_V2' ||
      record.decision !== 'CLAIMED' ||
      record.candidateStatus !== 'NOT_DEPLOYABLE'
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
    }

    const delivery: ClaimedIdentityMailDeliveryV2Candidate = {
      tenantId: stringValue(record.tenantId),
      workflowLocator: stringValue(record.workflowLocator),
      inviteId: stringValue(record.inviteId),
      outboxId: stringValue(record.outboxId),
      template: exactValue(record.template, 'INITIAL_OWNER_INVITE'),
      messageKey: stringValue(record.messageKey),
      requestDigest: stringValue(record.requestDigest),
      tokenHash: stringValue(record.tokenHash),
      digestVersion: exactValue(record.digestVersion, 'sha256-v1'),
      envelopeVersion: exactNumber(record.envelopeVersion, 1),
      keyVersion: exactValue(record.keyVersion, 'v1'),
      aadEnvironment: stringValue(record.aadEnvironment),
      expiresAt: dateValue(record.expiresAt),
      recipientEmail: stringValue(record.recipientEmail),
      leaseVersion: positiveBigInt(record.leaseVersion),
      transitionRevision: positiveInteger(record.transitionRevision),
      attemptNumber: positiveInteger(record.attemptNumber),
      claimEnrollmentStateRevision: positiveBigInt(
        record.claimEnrollmentStateRevision,
      ),
      claimPolicyRevision: positiveInteger(record.claimPolicyRevision),
      claimProviderAuthorityDigest: stringValue(
        record.claimProviderAuthorityDigest,
      ),
      secretCiphertext: base64Buffer(record.secretCiphertextBase64),
    };

    if (
      delivery.tenantId !== input.tenantId ||
      !UUID_PATTERN.test(delivery.tenantId) ||
      !UUID_PATTERN.test(delivery.workflowLocator) ||
      !UUID_PATTERN.test(delivery.inviteId) ||
      !UUID_PATTERN.test(delivery.outboxId) ||
      !UUID_PATTERN.test(delivery.messageKey) ||
      !SHA256_PATTERN.test(delivery.requestDigest) ||
      !SHA256_PATTERN.test(delivery.tokenHash) ||
      delivery.secretCiphertext.length !== SECRET_ENVELOPE_BYTES ||
      delivery.leaseVersion > MAX_LEASE_VERSION ||
      delivery.leaseVersion !== BigInt(delivery.attemptNumber) ||
      delivery.claimEnrollmentStateRevision <
        BigInt(delivery.claimPolicyRevision) ||
      delivery.claimProviderAuthorityDigest !== input.providerAuthorityDigest
    ) {
      delivery.secretCiphertext.fill(0);
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
    }

    this.claimBindings.set(
      delivery.outboxId,
      Object.freeze({
        tenantId: delivery.tenantId,
        inviteId: delivery.inviteId,
        leaseVersion: delivery.leaseVersion,
        leaseOwnerDigest: input.leaseOwnerDigest,
        leaseTokenDigest: input.leaseTokenDigest,
        transitionRevision: delivery.transitionRevision,
        claimEnrollmentStateRevision: delivery.claimEnrollmentStateRevision,
        claimPolicyRevision: delivery.claimPolicyRevision,
        claimProviderAuthorityDigest: delivery.claimProviderAuthorityDigest,
      }),
    );
    return delivery;
  }

  async reapExpired(input: ReapIdentityMailDeliveryInput): Promise<number> {
    if (
      !UUID_PATTERN.test(input.tenantId) ||
      !SHA256_PATTERN.test(input.providerAuthorityDigest) ||
      !SHA256_PATTERN.test(input.workerActorDigest) ||
      input.providerAuthorityDigest === input.workerActorDigest ||
      !Number.isSafeInteger(input.batchLimit) ||
      input.batchLimit < 1 ||
      input.batchLimit > 100
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_REAP_INPUT_INVALID');
    }
    const result = await this.tenantRpc(
      input.tenantId,
      Prisma.sql`
        SELECT public."identity_initial_owner_mail_reap_v2"(
          ${input.tenantId}::TEXT,
          ${input.providerAuthorityDigest}::TEXT,
          ${input.workerActorDigest}::TEXT,
          ${input.batchLimit}::INTEGER
        ) AS result
      `,
    );
    const record = exactRecordValue(
      result,
      REAP_RECEIPT_KEYS,
      'IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID',
    );
    const processed = nonNegativeInteger(record.processed);
    if (
      record.schemaVersion !== 2 ||
      record.operation !== 'REAP_INITIAL_OWNER_MAIL_V2' ||
      record.decision !== 'COMPLETED' ||
      record.candidateStatus !== 'NOT_DEPLOYABLE' ||
      record.tenantId !== input.tenantId ||
      !settlementState(record.settlementState) ||
      processed > input.batchLimit
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
    }
    return processed;
  }

  async markProviderAttempt(
    input: MarkIdentityMailProviderAttemptInput,
  ): Promise<IdentityMailProviderAttemptOutcome> {
    const binding = this.requireClaimBinding(input);
    if (
      binding.inviteId !== input.inviteId ||
      binding.claimProviderAuthorityDigest !== input.providerAuthorityDigest ||
      !UUID_PATTERN.test(input.inviteId) ||
      !UUID_PATTERN.test(input.providerAttemptKey) ||
      !SHA256_PATTERN.test(input.providerAuthorityDigest) ||
      typeof input.messageId !== 'string' ||
      input.messageId.length < 3
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_BINDING_MISMATCH');
    }

    const result = await this.settlementRpc(
      input.tenantId,
      Prisma.sql`
        SELECT public."identity_initial_owner_mail_provider_mark_v2"(
          ${input.tenantId}::TEXT,
          ${input.outboxId}::TEXT,
          ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
          ${input.leaseOwnerDigest}::TEXT,
          ${digest(input.leaseToken)}::TEXT,
          ${input.providerAttemptKey}::TEXT,
          ${input.providerAuthorityDigest}::TEXT,
          ${digest(input.messageId)}::TEXT
        ) AS result
      `,
      'PROVIDER_MARK',
    );
    const untrustedRecord = recordValue(result);
    if (untrustedRecord.decision === 'HANDOFF') {
      const record = exactRecordValue(
        untrustedRecord,
        PROVIDER_HANDOFF_RECEIPT_KEYS,
        'IDENTITY_MAIL_WORKER_V2_PROVIDER_HANDOFF_INVALID',
      );
      assertProviderHandoffReceipt(record, input);
      this.releaseClaimBinding(input.outboxId, binding);
      return 'HANDOFF';
    }
    if (untrustedRecord.decision === 'CANCELED') {
      const record = exactRecordValue(
        untrustedRecord,
        PROVIDER_CANCELED_RECEIPT_KEYS,
        'IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID',
      );
      assertProviderMarkerReceipt(record, input, 'CANCELED');
      this.releaseClaimBinding(input.outboxId, binding);
      return 'CANCELED';
    }

    const record = exactRecordValue(
      untrustedRecord,
      PROVIDER_MARKED_RECEIPT_KEYS,
      'IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID',
    );
    assertProviderMarkerReceipt(record, input, 'MARKED');
    if (
      record.candidateStatus !== 'NOT_DEPLOYABLE' ||
      record.providerAttemptKey !== input.providerAttemptKey ||
      !settlementState(record.settlementState)
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
    }
    this.claimBindings.set(
      input.outboxId,
      Object.freeze({
        ...binding,
        transitionRevision: input.expectedTransitionRevision + 1,
      }),
    );
    return 'MARKED';
  }

  async markSent(input: MarkIdentityMailSentInput): Promise<void> {
    if (
      input.providerOutcomeCode !== 'SMTP_ACCEPTED' ||
      !SHA256_PATTERN.test(input.providerReceiptDigest)
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_PROVIDER_RECEIPT_INVALID');
    }
    const { binding, result } = await this.complete(
      input,
      'PROVIDER_ACCEPTED',
      input.providerReceiptDigest,
      terminalAckDigest(input, input.providerOutcomeCode),
    );
    assertCompletionReceipt(result, input, 'SENT');
    this.releaseClaimBinding(input.outboxId, binding);
  }

  async markPreProviderFailure(
    input: MarkIdentityMailFailureInput,
  ): Promise<IdentityMailPreProviderFailureOutcome> {
    const outcome = permanentPreProviderReason(input.reasonCode)
      ? 'PRE_PROVIDER_DEAD'
      : 'PRE_PROVIDER_RETRY';
    const { binding, result } = await this.complete(input, outcome, null, null);
    const record = assertCompletionReceipt(result, input, [
      'RETRY',
      'DEAD',
      'CANCELED',
    ] as const);
    this.releaseClaimBinding(input.outboxId, binding);
    return record.decision as IdentityMailPreProviderFailureOutcome;
  }

  async markReconciliationRequired(
    input: MarkIdentityMailFailureInput,
  ): Promise<void> {
    const { binding, result } = await this.complete(
      input,
      'PROVIDER_AMBIGUOUS',
      null,
      terminalAckDigest(input, input.reasonCode),
    );
    assertCompletionReceipt(result, input, 'RECONCILIATION_REQUIRED');
    this.releaseClaimBinding(input.outboxId, binding);
  }

  async disconnect(): Promise<void> {
    this.claimBindings.clear();
    await this.prisma.$disconnect();
  }

  private async complete(
    input: IdentityMailDeliveryLeaseInput,
    outcomeCode:
      | 'PRE_PROVIDER_RETRY'
      | 'PRE_PROVIDER_DEAD'
      | 'PROVIDER_ACCEPTED'
      | 'PROVIDER_AMBIGUOUS',
    providerReceiptDigest: string | null,
    terminalAck: string | null,
  ): Promise<{ binding: IdentityMailV2ClaimBinding; result: unknown }> {
    const binding = this.requireClaimBinding(input);
    const result = await this.settlementRpc(
      input.tenantId,
      Prisma.sql`
        SELECT public."identity_initial_owner_mail_complete_v2"(
          ${input.tenantId}::TEXT,
          ${input.outboxId}::TEXT,
          ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
          ${input.leaseOwnerDigest}::TEXT,
          ${digest(input.leaseToken)}::TEXT,
          ${binding.claimProviderAuthorityDigest}::TEXT,
          ${outcomeCode}::TEXT,
          ${providerReceiptDigest}::TEXT,
          ${terminalAck}::TEXT
        ) AS result
      `,
      'COMPLETE',
    );
    return { binding, result };
  }

  private requireClaimBinding(
    input: IdentityMailDeliveryLeaseInput,
  ): IdentityMailV2ClaimBinding {
    if (!UUID_PATTERN.test(input.tenantId)) {
      fail('IDENTITY_MAIL_WORKER_V2_TENANT_ID_INVALID');
    }
    if (!UUID_PATTERN.test(input.outboxId)) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_BINDING_MISMATCH');
    }
    const binding = this.claimBindings.get(input.outboxId);
    if (!binding) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_BINDING_REQUIRED');
    }
    if (
      binding.tenantId !== input.tenantId ||
      binding.leaseVersion !== input.leaseVersion ||
      binding.leaseOwnerDigest !== input.leaseOwnerDigest ||
      binding.leaseTokenDigest !== digest(input.leaseToken) ||
      binding.transitionRevision !== input.expectedTransitionRevision
    ) {
      fail('IDENTITY_MAIL_WORKER_V2_CLAIM_BINDING_MISMATCH');
    }
    return binding;
  }

  private releaseClaimBinding(
    outboxId: string,
    binding: IdentityMailV2ClaimBinding,
  ): void {
    if (this.claimBindings.get(outboxId) === binding) {
      this.claimBindings.delete(outboxId);
    }
  }

  private async tenantRpc(
    tenantId: string,
    query: Prisma.Sql,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(tenantId)) {
      fail('IDENTITY_MAIL_WORKER_V2_TENANT_ID_INVALID');
    }

    for (
      let attempt = 0;
      attempt < IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.tenantRpcAttempt(tenantId, query);
      } catch (error) {
        if (!retryableTenantTransactionError(error)) {
          throw error;
        }
        if (attempt === IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS - 1) {
          fail('IDENTITY_MAIL_WORKER_V2_TRANSACTION_RETRY_REQUIRED');
        }
      }
    }
    return fail('IDENTITY_MAIL_WORKER_V2_TRANSACTION_RETRY_REQUIRED');
  }

  private async settlementRpc(
    tenantId: string,
    query: Prisma.Sql,
    operation: IdentityMailWorkerV2AmbiguousSettlementOperation,
  ): Promise<unknown> {
    let unknownResponseObserved = false;
    for (
      let attempt = 0;
      attempt < IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.tenantRpcAttempt(tenantId, query);
      } catch (error) {
        const responseUnknown = unknownDatabaseResponse(error);
        const transactionRetryable = retryableTenantTransactionError(error);
        unknownResponseObserved ||= responseUnknown;
        if (!responseUnknown && !transactionRetryable) {
          if (unknownResponseObserved) {
            throw new IdentityMailWorkerV2AmbiguousSettlementError(operation);
          }
          throw error;
        }
        if (attempt === IDENTITY_MAIL_RPC_TRANSACTION_ATTEMPTS - 1) {
          if (unknownResponseObserved) {
            throw new IdentityMailWorkerV2AmbiguousSettlementError(operation);
          }
          fail('IDENTITY_MAIL_WORKER_V2_TRANSACTION_RETRY_REQUIRED');
        }
      }
    }
    return fail('IDENTITY_MAIL_WORKER_V2_TRANSACTION_RETRY_REQUIRED');
  }

  private async tenantRpcAttempt(
    tenantId: string,
    query: Prisma.Sql,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(tenantId)) {
      fail('IDENTITY_MAIL_WORKER_V2_TENANT_ID_INVALID');
    }

    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.$queryRaw<
        IdentityMailTenantTransactionSettingsRow[]
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('transaction_isolation')
            AS "isolationLevel",
          pg_catalog.current_setting('transaction_read_only') AS "readOnly",
          pg_catalog.set_config(
            'statement_timeout',
            ${IDENTITY_MAIL_STATEMENT_TIMEOUT},
            true
          ) AS "statementTimeout",
          pg_catalog.set_config(
            'lock_timeout',
            ${IDENTITY_MAIL_LOCK_TIMEOUT},
            true
          ) AS "lockTimeout"
      `);
      if (
        settings.length !== 1 ||
        settings[0]?.isolationLevel !== 'read committed' ||
        settings[0]?.readOnly !== 'off' ||
        settings[0]?.statementTimeout !== IDENTITY_MAIL_STATEMENT_TIMEOUT ||
        settings[0]?.lockTimeout !== IDENTITY_MAIL_LOCK_TIMEOUT
      ) {
        fail('IDENTITY_MAIL_WORKER_V2_TENANT_LOCK_PROTOCOL_INVALID');
      }

      // The lock and RPC must remain separate statements. READ COMMITTED
      // gives the RPC a fresh snapshot after any advisory-lock wait.
      const locks = await tx.$queryRaw<IdentityMailTenantLockRow[]>(Prisma.sql`
        WITH tenant_lock AS MATERIALIZED (
          SELECT pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
              ${IDENTITY_MAIL_TENANT_LOCK_DOMAIN} || ${tenantId}::TEXT,
              ${IDENTITY_MAIL_TENANT_LOCK_SEED}
            )
          ) AS acquired
        )
        SELECT
          ${tenantId}::TEXT AS "tenantId",
          pg_catalog.pg_backend_pid()::INTEGER AS "backendPid"
        FROM tenant_lock
      `);
      if (
        locks.length !== 1 ||
        locks[0]?.tenantId !== tenantId ||
        !Number.isInteger(locks[0]?.backendPid)
      ) {
        fail('IDENTITY_MAIL_WORKER_V2_TENANT_LOCK_PROTOCOL_INVALID');
      }

      return this.rpc(tx, query);
    }, IDENTITY_MAIL_TENANT_TRANSACTION_OPTIONS);
  }

  private async rpc(
    client: IdentityMailWorkerRpcClient,
    query: Prisma.Sql,
  ): Promise<unknown> {
    const rows = await client.$queryRaw<RpcRow[]>(query);
    if (rows.length !== 1 || !rows[0]) {
      fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
    }
    return rows[0].result;
  }
}

function assertReadinessReceipt(
  value: unknown,
  tenantId: string,
  input: AssertIdentityMailWorkerReadyInput,
): void {
  const record = exactRecordValue(
    value,
    READINESS_RECEIPT_KEYS,
    'IDENTITY_MAIL_WORKER_V2_READINESS_RECEIPT_INVALID',
  );
  const stateRevision = positiveBigInt(
    record.stateRevision,
    'IDENTITY_MAIL_WORKER_V2_READINESS_RECEIPT_INVALID',
  );
  const policyRevision = positiveInteger(
    record.policyRevision,
    'IDENTITY_MAIL_WORKER_V2_READINESS_RECEIPT_INVALID',
  );
  if (
    record.schemaVersion !== 2 ||
    record.operation !== 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER_V2' ||
    record.decision !== 'REHEARSAL_READY' ||
    record.candidateStatus !== 'NOT_DEPLOYABLE' ||
    record.authorization !== false ||
    record.canSend !== false ||
    record.tenantId !== tenantId ||
    record.migrationHead !== IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION ||
    record.migrationCount !==
      IDENTITY_MAIL_WORKER_V2_CANDIDATE_MIGRATION_COUNT ||
    record.candidateChecksum !== IDENTITY_MAIL_WORKER_V2_CANDIDATE_SHA256 ||
    record.state !== 'ACTIVE' ||
    stateRevision < BigInt(policyRevision) ||
    typeof record.currentConfigurationDigest !== 'string' ||
    !SHA256_PATTERN.test(record.currentConfigurationDigest) ||
    record.maxAttempts !== input.expectedPolicy.maxAttempts ||
    record.leaseSeconds !== input.expectedPolicy.leaseSeconds ||
    !positiveSafeInteger(record.acknowledgeSeconds) ||
    Number(record.acknowledgeSeconds) <
      input.expectedPolicy.minimumAcknowledgeSeconds ||
    Number(record.acknowledgeSeconds) > 900 ||
    record.baseRetrySeconds !== input.expectedPolicy.baseRetrySeconds ||
    record.maxRetrySeconds !== input.expectedPolicy.maxRetrySeconds ||
    record.providerAuthorityDigest !== input.providerAuthorityDigest
  ) {
    fail('IDENTITY_MAIL_WORKER_V2_READINESS_RECEIPT_INVALID');
  }
}

function assertProviderMarkerReceipt(
  record: Record<string, unknown>,
  input: MarkIdentityMailProviderAttemptInput,
  expectedDecision: 'MARKED' | 'CANCELED',
): void {
  if (
    record.schemaVersion !== 2 ||
    record.operation !== 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2' ||
    record.decision !== expectedDecision ||
    record.outboxId !== input.outboxId ||
    record.tenantId !== input.tenantId ||
    record.leaseVersion !== leaseVersionNumber(input.leaseVersion) ||
    record.transitionRevision !== input.expectedTransitionRevision + 1
  ) {
    fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
  }
}

function assertProviderHandoffReceipt(
  record: Record<string, unknown>,
  input: MarkIdentityMailProviderAttemptInput,
): void {
  const transitionRevision = positiveInteger(
    record.transitionRevision,
    'IDENTITY_MAIL_WORKER_V2_PROVIDER_HANDOFF_INVALID',
  );
  if (
    record.schemaVersion !== 2 ||
    record.operation !== 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2' ||
    record.decision !== 'HANDOFF' ||
    record.candidateStatus !== 'NOT_DEPLOYABLE' ||
    record.outboxId !== input.outboxId ||
    record.tenantId !== input.tenantId ||
    record.leaseVersion !== leaseVersionNumber(input.leaseVersion) ||
    transitionRevision < input.expectedTransitionRevision + 1 ||
    !settlementState(record.settlementState) ||
    record.handoffReason !== 'MARKER_NOT_REUSABLE' ||
    record.durableEvidenceEventId !==
      `${input.outboxId}:${input.expectedTransitionRevision + 1}`
  ) {
    fail('IDENTITY_MAIL_WORKER_V2_PROVIDER_HANDOFF_INVALID');
  }
}

function assertCompletionReceipt(
  value: unknown,
  input: IdentityMailDeliveryLeaseInput,
  expectedDecision: string | readonly string[],
): Record<string, unknown> {
  const record = exactRecordValue(
    value,
    COMPLETION_RECEIPT_KEYS,
    'IDENTITY_MAIL_WORKER_V2_COMPLETION_RESPONSE_INVALID',
  );
  const allowedDecisions = Array.isArray(expectedDecision)
    ? expectedDecision
    : [expectedDecision];
  if (
    record.schemaVersion !== 2 ||
    record.operation !== 'COMPLETE_INITIAL_OWNER_MAIL_V2' ||
    !allowedDecisions.includes(
      typeof record.decision === 'string' ? record.decision : '',
    ) ||
    record.candidateStatus !== 'NOT_DEPLOYABLE' ||
    record.tenantId !== input.tenantId ||
    record.outboxId !== input.outboxId ||
    record.leaseVersion !== leaseVersionNumber(input.leaseVersion) ||
    record.transitionRevision !== input.expectedTransitionRevision + 1 ||
    !settlementState(record.settlementState)
  ) {
    fail('IDENTITY_MAIL_WORKER_V2_COMPLETION_RESPONSE_INVALID');
  }
  return record;
}

function validExpectedPolicy(
  value: AssertIdentityMailWorkerReadyInput['expectedPolicy'],
): boolean {
  return (
    positiveSafeInteger(value.maxAttempts) &&
    value.maxAttempts <= 20 &&
    positiveSafeInteger(value.leaseSeconds) &&
    value.leaseSeconds >= 30 &&
    value.leaseSeconds <= 900 &&
    positiveSafeInteger(value.minimumAcknowledgeSeconds) &&
    value.minimumAcknowledgeSeconds >= 10 &&
    value.minimumAcknowledgeSeconds <= 900 &&
    positiveSafeInteger(value.baseRetrySeconds) &&
    value.baseRetrySeconds <= 3_600 &&
    positiveSafeInteger(value.maxRetrySeconds) &&
    value.maxRetrySeconds >= value.baseRetrySeconds &&
    value.maxRetrySeconds <= 86_400
  );
}

function validTransportDetail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value === value.trim()
  );
}

function settlementState(
  value: unknown,
): value is IdentityMailWorkerV2SettlementState {
  return value === 'ACTIVE' || value === 'DRAINING';
}

function positiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function exactRecordValue(
  value: unknown,
  expectedKeys: readonly string[],
  reasonCode: string,
): Record<string, unknown> {
  if (!recordValueOrNull(value)) {
    return fail(reasonCode);
  }
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function recordValue(value: unknown): Record<string, unknown> {
  return recordValueOrNull(value)
    ? value
    : fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
}

function stringValue(value: unknown): string {
  return typeof value === 'string'
    ? value
    : fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
}

function exactValue<T extends string>(value: unknown, expected: T): T {
  return value === expected
    ? expected
    : fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
}

function exactNumber<T extends number>(value: unknown, expected: T): T {
  return value === expected
    ? expected
    : fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
}

function dateValue(value: unknown): Date {
  if (typeof value !== 'string') {
    return fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
  }
  return result;
}

function positiveInteger(
  value: unknown,
  reasonCode = 'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    return fail(reasonCode);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return fail('IDENTITY_MAIL_WORKER_V2_DATABASE_RESPONSE_INVALID');
  }
  return Number(value);
}

function positiveBigInt(
  value: unknown,
  reasonCode = 'IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID',
): bigint {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d*$/u.test(String(value))
  ) {
    return fail(reasonCode);
  }
  return BigInt(value);
}

function base64Buffer(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > 128) {
    return fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
  }
  const canonical = value.replace(/\s/gu, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(canonical)) {
    fail('IDENTITY_MAIL_WORKER_V2_CLAIM_RESPONSE_INVALID');
  }
  return Buffer.from(canonical, 'base64');
}

function leaseVersionNumber(value: bigint): number {
  if (value < 1n || value > MAX_LEASE_VERSION) {
    return fail('IDENTITY_MAIL_WORKER_V2_LEASE_VERSION_INVALID');
  }
  return Number(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function terminalAckDigest(
  input: IdentityMailDeliveryLeaseInput,
  outcome: string,
): string {
  return digest(
    [
      'leetplus:identity-mail-terminal-ack:v1',
      input.tenantId,
      input.outboxId,
      input.leaseVersion.toString(),
      outcome,
    ].join('\n'),
  );
}

function permanentPreProviderReason(reasonCode: string): boolean {
  return (
    reasonCode === 'ENVELOPE_INVALID' ||
    reasonCode === 'ENVELOPE_BINDING_MISMATCH' ||
    reasonCode === 'RECIPIENT_INVALID'
  );
}

function retryableTenantTransactionError(error: unknown): boolean {
  const errorCode = databaseErrorCode(error);
  const sqlState = databaseSqlState(error);
  return (
    errorCode === 'P2034' ||
    sqlState === '40001' ||
    sqlState === '40P01' ||
    sqlState === '55P03' ||
    sqlState === '57014'
  );
}

function unknownDatabaseResponse(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const errorCode = databaseErrorCode(current);
    const sqlState = databaseSqlState(current);
    if (
      errorCode === 'P1001' ||
      errorCode === 'P1002' ||
      errorCode === 'P1008' ||
      errorCode === 'P1017' ||
      errorCode === 'ECONNABORTED' ||
      errorCode === 'ECONNRESET' ||
      errorCode === 'ENETRESET' ||
      errorCode === 'EPIPE' ||
      errorCode === 'ETIMEDOUT' ||
      (sqlState !== null && /^08[0-9A-Z]{3}$/u.test(sqlState)) ||
      sqlState === '40003' ||
      sqlState === '57P01' ||
      sqlState === '57P02' ||
      sqlState === '57P03'
    ) {
      return true;
    }
    if (!recordValueOrNull(current)) {
      return false;
    }
    current = current.cause ?? current.originalError;
    if (current === undefined) {
      return false;
    }
  }
  return false;
}

function databaseSqlState(error: unknown): string | null {
  if (!recordValueOrNull(error)) {
    return null;
  }
  const errorCode = databaseErrorCode(error);
  if (
    errorCode === 'P2010' &&
    recordValueOrNull(error.meta) &&
    typeof error.meta.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(error.meta.code)
  ) {
    return error.meta.code;
  }
  return errorCode && /^[0-9A-Z]{5}$/u.test(errorCode) ? errorCode : null;
}

function databaseErrorCode(error: unknown): string | null {
  return recordValueOrNull(error) && typeof error.code === 'string'
    ? error.code
    : null;
}

function recordValueOrNull(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reasonCode: string): never {
  throw new IdentityMailWorkerV2CandidateRepositoryError(reasonCode);
}
