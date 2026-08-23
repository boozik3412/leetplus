import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isCanonicalIdentityMailRecipient } from '../identity-mail-worker/identity-mail-recipient';
import {
  EMPLOYEE_INVITE_DIGEST_VERSION,
  EMPLOYEE_INVITE_ENVELOPE_VERSION,
  EMPLOYEE_INVITE_MAIL_TEMPLATE,
  EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES,
} from './employee-invite-secret-envelope';
import type {
  EmployeeInviteMailClaimCurrent189,
  EmployeeInviteMailClaimOutcomeCurrent189,
  EmployeeInviteMailLeaseCurrent189,
  EmployeeInviteMailPreProviderOutcome,
  EmployeeInviteMailProviderMarkOutcome,
  EmployeeInviteMailWorkerCurrent189Config,
  EmployeeInviteMailWorkerCurrent189Repository,
} from './employee-invite-mail-worker-current189.types';

export const EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_CANDIDATE =
  '20260805030000_identity_employee_invite_mail_boundary_current189' as const;
export const EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_SHA256 =
  '4bbf4d49847b82731aa2e235796b4b1a898914768c1f4f4e2cb7a8b084e5c751' as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TENANT_LOCK_DOMAIN = 'leetplus:identity-mail-tenant:v1:';
const TENANT_LOCK_SEED = 180;
const STATEMENT_TIMEOUT = '25s';
const LOCK_TIMEOUT = '5s';
const SETTLEMENT_ATTEMPTS = 2;
const MAX_LEASE_VERSION = 2_147_483_647n;
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

const READINESS_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'authorization',
  'canSend',
  'tenantId',
  'state',
  'stateRevision',
  'policyRevision',
  'maxAttempts',
  'leaseSeconds',
  'acknowledgeSeconds',
  'baseRetrySeconds',
  'maxRetrySeconds',
] as const;
const CLAIM_EMPTY_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
] as const;
const CLAIM_CANCELED_KEYS = [...CLAIM_EMPTY_KEYS, 'outboxId'] as const;
const CLAIMED_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'outboxId',
  'inviteId',
  'deliveryLocator',
  'template',
  'messageKey',
  'requestDigest',
  'recipientEmail',
  'tokenHash',
  'digestVersion',
  'secretCiphertextBase64',
  'envelopeVersion',
  'keyVersion',
  'aadEnvironment',
  'expiresAt',
  'attemptNumber',
  'leaseVersion',
  'transitionRevision',
  'claimEnrollmentStateRevision',
  'claimPolicyRevision',
  'claimProviderAuthorityDigest',
] as const;
const PROVIDER_MARKED_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'outboxId',
  'leaseVersion',
  'transitionRevision',
  'providerAttemptKey',
  'settlementState',
] as const;
const PROVIDER_HANDOFF_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'outboxId',
  'leaseVersion',
  'transitionRevision',
  'settlementState',
  'handoffReason',
] as const;
const COMPLETION_KEYS = [
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
const REAP_KEYS = [
  'schemaVersion',
  'operation',
  'decision',
  'candidateStatus',
  'tenantId',
  'processed',
  'retry',
  'dead',
  'reconciliationRequired',
] as const;

type RpcRow = { receipt: unknown };
type ClaimBinding = Readonly<{
  tenantId: string;
  inviteId: string;
  leaseVersion: bigint;
  leaseOwnerDigest: string;
  leaseTokenDigest: string;
  transitionRevision: number;
  providerAuthorityDigest: string;
}>;

export class EmployeeInviteMailWorkerCurrent189RepositoryError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailWorkerCurrent189RepositoryError';
  }
}

export class EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError extends EmployeeInviteMailWorkerCurrent189RepositoryError {
  readonly attempts = SETTLEMENT_ATTEMPTS;

  constructor(readonly operation: 'PROVIDER_MARK' | 'COMPLETE') {
    super('EMPLOYEE_INVITE_MAIL_SETTLEMENT_RESPONSE_UNKNOWN');
    this.name = 'EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError';
  }
}

/** Candidate-only exact RPC adapter. It has no Injectable decorator or module wiring. */
export class PrismaEmployeeInviteMailWorkerCurrent189Repository implements EmployeeInviteMailWorkerCurrent189Repository {
  private readonly claimBindings = new Map<string, ClaimBinding>();

  constructor(private readonly prisma: Pick<PrismaService, '$transaction'>) {}

  async assertRehearsalReady(input: {
    tenantId: string;
    providerAuthorityDigest: string;
    expectedPolicy: EmployeeInviteMailWorkerCurrent189Config['expectedPolicy'];
  }): Promise<void> {
    if (
      !uuid(input.tenantId) ||
      !sha256(input.providerAuthorityDigest) ||
      !validPolicy(input.expectedPolicy)
    ) {
      fail('EMPLOYEE_INVITE_MAIL_READINESS_INPUT_INVALID');
    }
    const receipt = exactRecord(
      await this.tenantRpc(
        input.tenantId,
        Prisma.sql`
          SELECT public."identity_employee_mail_worker_assert_current189_v1"(
            ${input.tenantId}::TEXT,
            ${input.providerAuthorityDigest}::TEXT
          ) AS receipt
        `,
      ),
      READINESS_KEYS,
      'EMPLOYEE_INVITE_MAIL_READINESS_RECEIPT_INVALID',
    );
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'ASSERT_EMPLOYEE_MAIL_WORKER' ||
      receipt.decision !== 'REHEARSAL_READY' ||
      receipt.candidateStatus !== 'NOT_DEPLOYABLE' ||
      receipt.authorization !== false ||
      receipt.canSend !== false ||
      receipt.tenantId !== input.tenantId ||
      receipt.state !== 'ACTIVE' ||
      positiveBigInt(receipt.stateRevision) < 1n ||
      positiveInteger(receipt.policyRevision) < 1 ||
      receipt.maxAttempts !== input.expectedPolicy.maxAttempts ||
      receipt.leaseSeconds !== input.expectedPolicy.leaseSeconds ||
      receipt.acknowledgeSeconds !== input.expectedPolicy.acknowledgeSeconds ||
      receipt.baseRetrySeconds !== input.expectedPolicy.baseRetrySeconds ||
      receipt.maxRetrySeconds !== input.expectedPolicy.maxRetrySeconds
    ) {
      fail('EMPLOYEE_INVITE_MAIL_READINESS_RECEIPT_INVALID');
    }
  }

  async reapExpired(input: {
    tenantId: string;
    providerAuthorityDigest: string;
    batchLimit: number;
  }): Promise<number> {
    if (
      !uuid(input.tenantId) ||
      !sha256(input.providerAuthorityDigest) ||
      !Number.isSafeInteger(input.batchLimit) ||
      input.batchLimit < 1 ||
      input.batchLimit > 100
    ) {
      fail('EMPLOYEE_INVITE_MAIL_REAP_INPUT_INVALID');
    }
    const receipt = exactRecord(
      await this.tenantRpc(
        input.tenantId,
        Prisma.sql`
          SELECT public."identity_employee_mail_reap_current189_v1"(
            ${input.tenantId}::TEXT,
            ${input.providerAuthorityDigest}::TEXT,
            ${input.batchLimit}::INTEGER
          ) AS receipt
        `,
      ),
      REAP_KEYS,
      'EMPLOYEE_INVITE_MAIL_REAP_RECEIPT_INVALID',
    );
    const processed = nonNegativeInteger(receipt.processed);
    const retry = nonNegativeInteger(receipt.retry);
    const dead = nonNegativeInteger(receipt.dead);
    const reconciliationRequired = nonNegativeInteger(
      receipt.reconciliationRequired,
    );
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'REAP_EMPLOYEE_MAIL' ||
      receipt.decision !== 'REAPED' ||
      receipt.candidateStatus !== 'NOT_DEPLOYABLE' ||
      receipt.tenantId !== input.tenantId ||
      processed > input.batchLimit ||
      retry + dead + reconciliationRequired !== processed
    ) {
      fail('EMPLOYEE_INVITE_MAIL_REAP_RECEIPT_INVALID');
    }
    return processed;
  }

  async claimOne(input: {
    tenantId: string;
    leaseOwnerDigest: string;
    leaseTokenDigest: string;
    providerAuthorityDigest: string;
  }): Promise<EmployeeInviteMailClaimOutcomeCurrent189> {
    if (
      !uuid(input.tenantId) ||
      !sha256(input.leaseOwnerDigest) ||
      !sha256(input.leaseTokenDigest) ||
      !sha256(input.providerAuthorityDigest) ||
      input.leaseOwnerDigest === input.leaseTokenDigest
    ) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_INPUT_INVALID');
    }
    const untrusted = record(
      await this.tenantRpc(
        input.tenantId,
        Prisma.sql`
          SELECT public."identity_employee_mail_claim_current189_v1"(
            ${input.tenantId}::TEXT,
            ${input.leaseOwnerDigest}::TEXT,
            ${input.leaseTokenDigest}::TEXT,
            ${input.providerAuthorityDigest}::TEXT
          ) AS receipt
        `,
      ),
    );
    if (!untrusted) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
    }
    if (untrusted.decision === 'EMPTY') {
      const receipt = exactRecord(
        untrusted,
        CLAIM_EMPTY_KEYS,
        'EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID',
      );
      assertClaimDecision(receipt, input.tenantId, 'EMPTY');
      return Object.freeze({ decision: 'EMPTY' });
    }
    if (untrusted.decision === 'CANCELED') {
      const receipt = exactRecord(
        untrusted,
        CLAIM_CANCELED_KEYS,
        'EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID',
      );
      assertClaimDecision(receipt, input.tenantId, 'CANCELED');
      const outboxId = requiredUuid(receipt.outboxId);
      return Object.freeze({ decision: 'CANCELED', outboxId });
    }

    const receipt = exactRecord(
      untrusted,
      CLAIMED_KEYS,
      'EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID',
    );
    assertClaimDecision(receipt, input.tenantId, 'CLAIMED');
    const ciphertext = base64Buffer(receipt.secretCiphertextBase64);
    try {
      const claim: EmployeeInviteMailClaimCurrent189 = Object.freeze({
        tenantId: requiredUuid(receipt.tenantId),
        deliveryLocator: requiredUuid(receipt.deliveryLocator),
        inviteId: requiredUuid(receipt.inviteId),
        outboxId: requiredUuid(receipt.outboxId),
        template: exactValue(receipt.template, EMPLOYEE_INVITE_MAIL_TEMPLATE),
        messageKey: requiredUuid(receipt.messageKey),
        requestDigest: requiredSha256(receipt.requestDigest),
        recipientEmail: requiredRecipient(receipt.recipientEmail),
        expiresAt: requiredDate(receipt.expiresAt),
        tokenHash: requiredSha256(receipt.tokenHash),
        digestVersion: exactValue(
          receipt.digestVersion,
          EMPLOYEE_INVITE_DIGEST_VERSION,
        ),
        secretCiphertext: ciphertext,
        envelopeVersion: exactInteger(
          receipt.envelopeVersion,
          EMPLOYEE_INVITE_ENVELOPE_VERSION,
        ),
        keyVersion: exactValue(receipt.keyVersion, 'v1'),
        aadEnvironment: requiredLabel(receipt.aadEnvironment, 64),
        attemptNumber: positiveInteger(receipt.attemptNumber),
        leaseVersion: positiveBigInt(receipt.leaseVersion),
        transitionRevision: positiveInteger(receipt.transitionRevision),
        claimEnrollmentStateRevision: positiveBigInt(
          receipt.claimEnrollmentStateRevision,
        ),
        claimPolicyRevision: positiveInteger(receipt.claimPolicyRevision),
        claimProviderAuthorityDigest: requiredSha256(
          receipt.claimProviderAuthorityDigest,
        ),
      });
      if (
        claim.tenantId !== input.tenantId ||
        claim.secretCiphertext.length !==
          EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES ||
        claim.leaseVersion > MAX_LEASE_VERSION ||
        claim.leaseVersion !== BigInt(claim.attemptNumber) ||
        claim.claimEnrollmentStateRevision <
          BigInt(claim.claimPolicyRevision) ||
        claim.claimProviderAuthorityDigest !== input.providerAuthorityDigest
      ) {
        fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
      }
      this.claimBindings.set(
        claim.outboxId,
        Object.freeze({
          tenantId: claim.tenantId,
          inviteId: claim.inviteId,
          leaseVersion: claim.leaseVersion,
          leaseOwnerDigest: input.leaseOwnerDigest,
          leaseTokenDigest: input.leaseTokenDigest,
          transitionRevision: claim.transitionRevision,
          providerAuthorityDigest: claim.claimProviderAuthorityDigest,
        }),
      );
      return Object.freeze({ decision: 'CLAIMED', claim });
    } catch (error) {
      ciphertext.fill(0);
      throw error;
    }
  }

  async markProviderAttempt(
    input: EmployeeInviteMailLeaseCurrent189 & {
      inviteId: string;
      messageId: string;
      providerAttemptKey: string;
      providerAuthorityDigest: string;
    },
  ): Promise<EmployeeInviteMailProviderMarkOutcome> {
    const binding = this.requireBinding(input);
    if (
      input.inviteId !== binding.inviteId ||
      !uuid(input.inviteId) ||
      !uuid(input.providerAttemptKey) ||
      !sha256(input.providerAuthorityDigest) ||
      input.providerAuthorityDigest !== binding.providerAuthorityDigest ||
      typeof input.messageId !== 'string' ||
      input.messageId.length < 3 ||
      input.messageId.length > 320
    ) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_BINDING_MISMATCH');
    }
    const untrusted = record(
      await this.settlementRpc(
        input.tenantId,
        Prisma.sql`
          SELECT public."identity_employee_mail_provider_mark_current189_v1"(
            ${input.tenantId}::TEXT,
            ${input.outboxId}::TEXT,
            ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
            ${input.leaseOwnerDigest}::TEXT,
            ${digest(input.leaseToken)}::TEXT,
            ${input.providerAttemptKey}::TEXT,
            ${input.providerAuthorityDigest}::TEXT,
            ${digest(input.messageId)}::TEXT
          ) AS receipt
        `,
        'PROVIDER_MARK',
      ),
    );
    if (!untrusted) {
      fail('EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID');
    }
    if (untrusted.decision === 'HANDOFF') {
      const receipt = exactRecord(
        untrusted,
        PROVIDER_HANDOFF_KEYS,
        'EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID',
      );
      assertProviderReceipt(receipt, input, 'HANDOFF');
      if (receipt.handoffReason !== 'MARKER_NOT_REUSABLE') {
        fail('EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID');
      }
      this.releaseBinding(input.outboxId, binding);
      return 'HANDOFF';
    }
    const receipt = exactRecord(
      untrusted,
      PROVIDER_MARKED_KEYS,
      'EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID',
    );
    assertProviderReceipt(receipt, input, 'MARKED');
    if (
      receipt.providerAttemptKey !== input.providerAttemptKey ||
      positiveInteger(receipt.transitionRevision) !==
        input.expectedTransitionRevision + 1
    ) {
      fail('EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID');
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

  async markSent(
    input: EmployeeInviteMailLeaseCurrent189 & {
      providerReceiptDigest: string;
      providerOutcomeCode: 'EMPLOYEE_SMTP_ACCEPTED';
    },
  ): Promise<void> {
    if (
      input.providerOutcomeCode !== 'EMPLOYEE_SMTP_ACCEPTED' ||
      !sha256(input.providerReceiptDigest)
    ) {
      fail('EMPLOYEE_INVITE_MAIL_PROVIDER_RECEIPT_INVALID');
    }
    const { binding, receipt } = await this.complete(
      input,
      'PROVIDER_ACCEPTED',
      input.providerReceiptDigest,
      terminalAckDigest(
        input,
        input.providerOutcomeCode,
        input.providerReceiptDigest,
      ),
    );
    assertCompletionReceipt(receipt, input, 'SENT');
    this.releaseBinding(input.outboxId, binding);
  }

  async markPreProviderFailure(
    input: EmployeeInviteMailLeaseCurrent189 & { reasonCode: string },
  ): Promise<EmployeeInviteMailPreProviderOutcome> {
    const outcome = permanentPreProviderFailure(input.reasonCode)
      ? 'PRE_PROVIDER_DEAD'
      : 'PRE_PROVIDER_RETRY';
    const { binding, receipt } = await this.complete(
      input,
      outcome,
      null,
      null,
    );
    const recordReceipt = assertCompletionReceipt(receipt, input, [
      'RETRY',
      'DEAD',
      'CANCELED',
    ] as const);
    this.releaseBinding(input.outboxId, binding);
    return recordReceipt.decision;
  }

  async markReconciliationRequired(
    input: EmployeeInviteMailLeaseCurrent189 & { reasonCode: string },
  ): Promise<void> {
    const { binding, receipt } = await this.complete(
      input,
      'PROVIDER_AMBIGUOUS',
      null,
      terminalAckDigest(input, 'PROVIDER_AMBIGUOUS', input.reasonCode),
      true,
    );
    assertCompletionReceipt(receipt, input, 'RECONCILIATION_REQUIRED');
    this.releaseBinding(input.outboxId, binding);
  }

  private async complete(
    input: EmployeeInviteMailLeaseCurrent189,
    outcome:
      | 'PRE_PROVIDER_RETRY'
      | 'PRE_PROVIDER_DEAD'
      | 'PROVIDER_ACCEPTED'
      | 'PROVIDER_AMBIGUOUS',
    providerReceiptDigest: string | null,
    terminalAck: string | null,
    allowUnobservedProviderMark = false,
  ): Promise<{ binding: ClaimBinding; receipt: unknown }> {
    const binding = this.requireBinding(input, allowUnobservedProviderMark);
    const receipt = await this.settlementRpc(
      input.tenantId,
      Prisma.sql`
        SELECT public."identity_employee_mail_complete_current189_v1"(
          ${input.tenantId}::TEXT,
          ${input.outboxId}::TEXT,
          ${leaseVersionNumber(input.leaseVersion)}::INTEGER,
          ${input.leaseOwnerDigest}::TEXT,
          ${digest(input.leaseToken)}::TEXT,
          ${binding.providerAuthorityDigest}::TEXT,
          ${outcome}::TEXT,
          ${providerReceiptDigest}::TEXT,
          ${terminalAck}::TEXT
        ) AS receipt
      `,
      'COMPLETE',
    );
    return { binding, receipt };
  }

  private requireBinding(
    input: EmployeeInviteMailLeaseCurrent189,
    allowUnobservedProviderMark = false,
  ): ClaimBinding {
    if (!uuid(input.tenantId) || !uuid(input.outboxId)) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_BINDING_MISMATCH');
    }
    const binding = this.claimBindings.get(input.outboxId);
    const expectedRevisionMatches =
      binding !== undefined &&
      (binding.transitionRevision === input.expectedTransitionRevision ||
        (allowUnobservedProviderMark &&
          binding.transitionRevision + 1 === input.expectedTransitionRevision));
    if (
      !binding ||
      binding.tenantId !== input.tenantId ||
      binding.leaseVersion !== input.leaseVersion ||
      binding.leaseOwnerDigest !== input.leaseOwnerDigest ||
      binding.leaseTokenDigest !== digest(input.leaseToken) ||
      !expectedRevisionMatches
    ) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_BINDING_MISMATCH');
    }
    return binding;
  }

  private releaseBinding(outboxId: string, binding: ClaimBinding): void {
    if (this.claimBindings.get(outboxId) === binding) {
      this.claimBindings.delete(outboxId);
    }
  }

  private async tenantRpc(
    tenantId: string,
    query: Prisma.Sql,
  ): Promise<unknown> {
    if (!uuid(tenantId)) {
      fail('EMPLOYEE_INVITE_MAIL_TENANT_INVALID');
    }
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.tenantRpcAttempt(tenantId, query);
      } catch (error) {
        if (!retryableTransactionFailure(error)) {
          throw error;
        }
        if (attempt === SETTLEMENT_ATTEMPTS - 1) {
          fail('EMPLOYEE_INVITE_MAIL_TRANSACTION_RETRY_REQUIRED');
        }
      }
    }
    return fail('EMPLOYEE_INVITE_MAIL_TRANSACTION_RETRY_REQUIRED');
  }

  private async settlementRpc(
    tenantId: string,
    query: Prisma.Sql,
    operation: 'PROVIDER_MARK' | 'COMPLETE',
  ): Promise<unknown> {
    let unknownObserved = false;
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.tenantRpcAttempt(tenantId, query);
      } catch (error) {
        const responseUnknown = unknownDatabaseResponse(error);
        const retryable = retryableTransactionFailure(error);
        unknownObserved ||= responseUnknown;
        if (!responseUnknown && !retryable) {
          if (unknownObserved) {
            throw new EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError(
              operation,
            );
          }
          throw error;
        }
        if (attempt === SETTLEMENT_ATTEMPTS - 1) {
          if (unknownObserved) {
            throw new EmployeeInviteMailWorkerCurrent189AmbiguousSettlementError(
              operation,
            );
          }
          fail('EMPLOYEE_INVITE_MAIL_TRANSACTION_RETRY_REQUIRED');
        }
      }
    }
    return fail('EMPLOYEE_INVITE_MAIL_TRANSACTION_RETRY_REQUIRED');
  }

  private async tenantRpcAttempt(
    tenantId: string,
    query: Prisma.Sql,
  ): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.$queryRaw<
        Array<{
          isolationLevel: string;
          readOnly: string;
          statementTimeout: string;
          lockTimeout: string;
        }>
      >(Prisma.sql`
        SELECT
          pg_catalog.current_setting('transaction_isolation') AS "isolationLevel",
          pg_catalog.current_setting('transaction_read_only') AS "readOnly",
          pg_catalog.set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)
            AS "statementTimeout",
          pg_catalog.set_config('lock_timeout', ${LOCK_TIMEOUT}, true)
            AS "lockTimeout"
      `);
      if (
        settings.length !== 1 ||
        settings[0]?.isolationLevel !== 'read committed' ||
        settings[0]?.readOnly !== 'off' ||
        settings[0]?.statementTimeout !== STATEMENT_TIMEOUT ||
        settings[0]?.lockTimeout !== LOCK_TIMEOUT
      ) {
        fail('EMPLOYEE_INVITE_MAIL_TENANT_LOCK_PROTOCOL_INVALID');
      }

      // Separate statements are required: after a tenant-lock wait,
      // READ COMMITTED gives the RPC a fresh authority/enrollment snapshot.
      const locks = await tx.$queryRaw<Array<{ tenantId: string }>>(Prisma.sql`
        WITH tenant_lock AS MATERIALIZED (
          SELECT pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(
              ${TENANT_LOCK_DOMAIN} || ${tenantId}::TEXT,
              ${TENANT_LOCK_SEED}
            )
          ) AS acquired
        )
        SELECT ${tenantId}::TEXT AS "tenantId" FROM tenant_lock
      `);
      if (locks.length !== 1 || locks[0]?.tenantId !== tenantId) {
        fail('EMPLOYEE_INVITE_MAIL_TENANT_LOCK_PROTOCOL_INVALID');
      }
      const rows = await tx.$queryRaw<RpcRow[]>(query);
      if (rows.length !== 1 || !rows[0]) {
        fail('EMPLOYEE_INVITE_MAIL_DATABASE_RESPONSE_INVALID');
      }
      return rows[0].receipt;
    }, TRANSACTION_OPTIONS);
  }
}

function assertClaimDecision(
  receipt: Record<string, unknown>,
  tenantId: string,
  decision: 'EMPTY' | 'CANCELED' | 'CLAIMED',
): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.operation !== 'CLAIM_EMPLOYEE_MAIL' ||
    receipt.decision !== decision ||
    receipt.candidateStatus !== 'NOT_DEPLOYABLE' ||
    receipt.tenantId !== tenantId
  ) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
}

function assertProviderReceipt(
  receipt: Record<string, unknown>,
  input: EmployeeInviteMailLeaseCurrent189,
  decision: 'MARKED' | 'HANDOFF',
): void {
  const transitionRevision = positiveInteger(receipt.transitionRevision);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.operation !== 'MARK_EMPLOYEE_MAIL_PROVIDER_ATTEMPT' ||
    receipt.decision !== decision ||
    receipt.candidateStatus !== 'NOT_DEPLOYABLE' ||
    receipt.tenantId !== input.tenantId ||
    receipt.outboxId !== input.outboxId ||
    positiveBigInt(receipt.leaseVersion) !== input.leaseVersion ||
    transitionRevision <= input.expectedTransitionRevision ||
    (decision === 'MARKED' &&
      transitionRevision !== input.expectedTransitionRevision + 1) ||
    !settlementState(receipt.settlementState)
  ) {
    fail('EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RECEIPT_INVALID');
  }
}

function assertCompletionReceipt<T extends string>(
  untrusted: unknown,
  input: EmployeeInviteMailLeaseCurrent189,
  decisions: T | readonly T[],
): Record<string, unknown> & { decision: T } {
  const receipt = exactRecord(
    untrusted,
    COMPLETION_KEYS,
    'EMPLOYEE_INVITE_MAIL_COMPLETION_RECEIPT_INVALID',
  );
  const allowed = Array.isArray(decisions) ? decisions : [decisions];
  if (
    receipt.schemaVersion !== 1 ||
    receipt.operation !== 'COMPLETE_EMPLOYEE_MAIL' ||
    typeof receipt.decision !== 'string' ||
    !allowed.includes(receipt.decision) ||
    receipt.candidateStatus !== 'NOT_DEPLOYABLE' ||
    receipt.tenantId !== input.tenantId ||
    receipt.outboxId !== input.outboxId ||
    positiveBigInt(receipt.leaseVersion) !== input.leaseVersion ||
    positiveInteger(receipt.transitionRevision) !==
      input.expectedTransitionRevision + 1 ||
    !settlementState(receipt.settlementState)
  ) {
    fail('EMPLOYEE_INVITE_MAIL_COMPLETION_RECEIPT_INVALID');
  }
  return receipt as Record<string, unknown> & { decision: T };
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  reasonCode: string,
): Record<string, unknown> {
  const candidate = record(value);
  if (
    !candidate ||
    Object.keys(candidate).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(candidate, key))
  ) {
    fail(reasonCode);
  }
  return candidate;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredUuid(value: unknown): string {
  if (!uuid(value)) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return value;
}

function requiredSha256(value: unknown): string {
  if (!sha256(value)) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return value;
}

function requiredRecipient(value: unknown): string {
  if (!isCanonicalIdentityMailRecipient(value)) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return value;
}

function requiredLabel(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > max ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._-]+$/u.test(value)
  ) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return value;
}

function requiredDate(value: unknown): Date {
  if (typeof value !== 'string') {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return result;
}

function exactValue<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return expected;
}

function exactInteger<T extends number>(value: unknown, expected: T): T {
  if (value !== expected) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return expected;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    fail('EMPLOYEE_INVITE_MAIL_DATABASE_RESPONSE_INVALID');
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('EMPLOYEE_INVITE_MAIL_DATABASE_RESPONSE_INVALID');
  }
  return Number(value);
}

function positiveBigInt(value: unknown): bigint {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^[1-9]\d*$/u.test(String(value))
  ) {
    fail('EMPLOYEE_INVITE_MAIL_DATABASE_RESPONSE_INVALID');
  }
  return BigInt(value);
}

function base64Buffer(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > 128) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  const canonical = value.replace(/\s/gu, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(canonical)) {
    fail('EMPLOYEE_INVITE_MAIL_CLAIM_RECEIPT_INVALID');
  }
  return Buffer.from(canonical, 'base64');
}

function leaseVersionNumber(value: bigint): number {
  if (value < 1n || value > MAX_LEASE_VERSION) {
    fail('EMPLOYEE_INVITE_MAIL_LEASE_VERSION_INVALID');
  }
  return Number(value);
}

function validPolicy(
  policy: EmployeeInviteMailWorkerCurrent189Config['expectedPolicy'],
): boolean {
  return (
    policy !== null &&
    typeof policy === 'object' &&
    positiveSafeInteger(policy.maxAttempts) &&
    positiveSafeInteger(policy.leaseSeconds) &&
    positiveSafeInteger(policy.acknowledgeSeconds) &&
    positiveSafeInteger(policy.baseRetrySeconds) &&
    positiveSafeInteger(policy.maxRetrySeconds) &&
    policy.baseRetrySeconds <= policy.maxRetrySeconds
  );
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function settlementState(value: unknown): value is 'ACTIVE' | 'DRAINING' {
  return value === 'ACTIVE' || value === 'DRAINING';
}

function terminalAckDigest(
  input: EmployeeInviteMailLeaseCurrent189,
  outcome: string,
  evidence: string,
): string {
  return digest(
    [
      'leetplus:employee-invite-mail-terminal-ack:v1',
      input.tenantId,
      input.outboxId,
      input.leaseVersion.toString(),
      outcome,
      evidence,
    ].join('\n'),
  );
}

function permanentPreProviderFailure(reasonCode: string): boolean {
  return (
    reasonCode === 'EMPLOYEE_INVITE_MAIL_CLAIM_INVALID' ||
    reasonCode === 'EMPLOYEE_INVITE_SECRET_ENVELOPE_INVALID' ||
    reasonCode === 'EMPLOYEE_INVITE_REGISTRATION_URL_INPUT_INVALID' ||
    reasonCode === 'EMPLOYEE_INVITE_MESSAGE_ID_INPUT_INVALID' ||
    reasonCode === 'EMPLOYEE_INVITE_SMTP_MESSAGE_INVALID'
  );
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function retryableTransactionFailure(error: unknown): boolean {
  const code = errorCode(error);
  const sqlState = databaseSqlState(error);
  return (
    code === 'P2034' ||
    sqlState === '40001' ||
    sqlState === '40P01' ||
    sqlState === '55P03' ||
    sqlState === '57014'
  );
}

function unknownDatabaseResponse(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const code = errorCode(current);
    const sqlState = databaseSqlState(current);
    if (
      code === 'P1001' ||
      code === 'P1002' ||
      code === 'P1008' ||
      code === 'P1017' ||
      code === 'ECONNABORTED' ||
      code === 'ECONNRESET' ||
      code === 'ENETRESET' ||
      code === 'EPIPE' ||
      code === 'ETIMEDOUT' ||
      (sqlState !== null && /^08[0-9A-Z]{3}$/u.test(sqlState)) ||
      sqlState === '40003' ||
      sqlState === '57P01' ||
      sqlState === '57P02' ||
      sqlState === '57P03'
    ) {
      return true;
    }
    const currentRecord = record(current);
    if (!currentRecord) {
      return false;
    }
    current = currentRecord.cause ?? currentRecord.originalError;
    if (current === undefined) {
      return false;
    }
  }
  return false;
}

function databaseSqlState(error: unknown): string | null {
  const candidate = record(error);
  if (!candidate) {
    return null;
  }
  const code = errorCode(error);
  if (
    code === 'P2010' &&
    record(candidate.meta) &&
    typeof record(candidate.meta)?.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(String(record(candidate.meta)?.code))
  ) {
    return String(record(candidate.meta)?.code);
  }
  return code && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
}

function errorCode(error: unknown): string | null {
  const candidate = record(error);
  return candidate && typeof candidate.code === 'string'
    ? candidate.code
    : null;
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailWorkerCurrent189RepositoryError(reasonCode);
}
