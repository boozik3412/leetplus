import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isCanonicalIdentityMailRecipient } from '../identity-mail-worker/identity-mail-recipient';
import {
  EMPLOYEE_INVITE_DIGEST_VERSION,
  EMPLOYEE_INVITE_ENVELOPE_VERSION,
  EMPLOYEE_INVITE_MAIL_TEMPLATE,
  EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES,
  type EmployeeInviteSecretBinding,
  type SealedEmployeeInviteToken,
} from './employee-invite-secret-envelope';
import {
  buildEmployeeInviteMessage,
  EmployeeInviteMailTemplateError,
} from './employee-invite-mail-template';
import { EmployeeInviteMailProviderCurrent189Error } from './employee-invite-mail-provider-current189';
import { EmployeeInviteMailWorkerCurrent189RepositoryError } from './employee-invite-mail-worker-current189.repository';
import type {
  EmployeeInviteMailClaimCurrent189,
  EmployeeInviteMailLeaseCurrent189,
  EmployeeInviteMailPreProviderOutcome,
  EmployeeInviteMailProviderCurrent189,
  EmployeeInviteMailTokenOpener,
  EmployeeInviteMailWorkerBoundary,
  EmployeeInviteMailWorkerControl,
  EmployeeInviteMailWorkerControlContext,
  EmployeeInviteMailWorkerCurrent189Config,
  EmployeeInviteMailWorkerCurrent189Repository,
  EmployeeInviteMailWorkerLogEvent,
  EmployeeInviteMailWorkerLogger,
  EmployeeInviteMailWorkerMode,
  EmployeeInviteMailWorkerRunResult,
} from './employee-invite-mail-worker-current189.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MODE_PRIORITY: Readonly<Record<EmployeeInviteMailWorkerMode, number>> =
  Object.freeze({ ACTIVE: 0, DRAINING: 1, KILLED: 2 });

type WorkerEntropy = Readonly<{
  randomBytes(size: number): Buffer;
  randomUuid(): string;
}>;

type DeliveryOutcome =
  | 'SENT'
  | EmployeeInviteMailPreProviderOutcome
  | 'RECONCILIATION_REQUIRED';

const silentLogger: EmployeeInviteMailWorkerLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const activeControl: EmployeeInviteMailWorkerControl = {
  modeAt: () => 'ACTIVE',
};

export class EmployeeInviteMailWorkerCurrent189Error extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailWorkerCurrent189Error';
  }
}

/**
 * Process-local monotonic seam for the dormant acceptance harness. It stores
 * tenant UUIDs and modes only; no invitation or provider material is retained.
 */
export class DormantEmployeeInviteMailWorkerCurrent189Control implements EmployeeInviteMailWorkerControl {
  private globalMode: EmployeeInviteMailWorkerMode = 'ACTIVE';
  private readonly tenantModes = new Map<
    string,
    EmployeeInviteMailWorkerMode
  >();

  beginGlobalDrain(): void {
    this.globalMode = advance(this.globalMode, 'DRAINING');
  }

  killGlobal(): void {
    this.globalMode = 'KILLED';
  }

  beginTenantDrain(tenantId: string): void {
    this.setTenantMode(tenantId, 'DRAINING');
  }

  killTenant(tenantId: string): void {
    this.setTenantMode(tenantId, 'KILLED');
  }

  modeAt(
    context: EmployeeInviteMailWorkerControlContext,
  ): EmployeeInviteMailWorkerMode {
    if (context.tenantId === null) {
      return this.globalMode;
    }
    assertUuid(context.tenantId, 'EMPLOYEE_INVITE_MAIL_CONTROL_TENANT_INVALID');
    const tenantMode = this.tenantModes.get(context.tenantId) ?? 'ACTIVE';
    return MODE_PRIORITY[this.globalMode] >= MODE_PRIORITY[tenantMode]
      ? this.globalMode
      : tenantMode;
  }

  snapshot(): Readonly<{
    globalMode: EmployeeInviteMailWorkerMode;
    tenants: readonly Readonly<{
      tenantId: string;
      mode: EmployeeInviteMailWorkerMode;
    }>[];
  }> {
    return Object.freeze({
      globalMode: this.globalMode,
      tenants: Object.freeze(
        [...this.tenantModes.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([tenantId, mode]) => Object.freeze({ tenantId, mode })),
      ),
    });
  }

  private setTenantMode(
    tenantId: string,
    requested: Exclude<EmployeeInviteMailWorkerMode, 'ACTIVE'>,
  ): void {
    assertUuid(tenantId, 'EMPLOYEE_INVITE_MAIL_CONTROL_TENANT_INVALID');
    const current = this.tenantModes.get(tenantId) ?? 'ACTIVE';
    this.tenantModes.set(tenantId, advance(current, requested));
  }
}

/**
 * Dormant CURRENT189 worker. There is deliberately no Injectable decorator,
 * module provider, CLI, scheduler or startup import.
 */
export class EmployeeInviteMailWorkerCurrent189 {
  private readonly config: EmployeeInviteMailWorkerCurrent189Config;
  private readonly leaseOwnerDigest: string;

  constructor(
    config: EmployeeInviteMailWorkerCurrent189Config,
    private readonly repository: EmployeeInviteMailWorkerCurrent189Repository,
    private readonly tokenOpener: EmployeeInviteMailTokenOpener,
    private readonly provider: EmployeeInviteMailProviderCurrent189,
    private readonly logger: EmployeeInviteMailWorkerLogger = silentLogger,
    private readonly entropy: WorkerEntropy = {
      randomBytes,
      randomUuid: randomUUID,
    },
  ) {
    this.config = snapshotConfig(config);
    this.assertDormantPolicy();
    const ownerEntropy = this.entropy.randomBytes(32);
    try {
      if (!Buffer.isBuffer(ownerEntropy) || ownerEntropy.length !== 32) {
        fail('EMPLOYEE_INVITE_MAIL_ENTROPY_INVALID');
      }
      this.leaseOwnerDigest = createHash('sha256')
        .update(ownerEntropy)
        .digest('hex');
    } finally {
      if (Buffer.isBuffer(ownerEntropy)) {
        ownerEntropy.fill(0);
      }
    }
  }

  async assertRehearsalReady(): Promise<void> {
    this.assertDormantPolicy();
    for (const tenantId of this.config.tenantIds) {
      await this.repository.assertRehearsalReady({
        tenantId,
        providerAuthorityDigest: this.config.providerAuthorityDigest,
        expectedPolicy: this.config.expectedPolicy,
      });
    }
    await this.provider.verify();
    this.logger.log({ event: 'EMPLOYEE_INVITE_MAIL_WORKER_READY' });
  }

  async runOnce(
    control: EmployeeInviteMailWorkerControl = activeControl,
  ): Promise<EmployeeInviteMailWorkerRunResult> {
    this.assertDormantPolicy();
    const result = emptyResult();
    if (this.mode(control, 'BEFORE_CYCLE', null) === 'KILLED') {
      return result;
    }

    let providerRequired = false;
    for (const tenantId of this.config.tenantIds) {
      if (
        this.mode(control, 'BEFORE_TENANT_READINESS', tenantId) !== 'ACTIVE'
      ) {
        continue;
      }
      await this.repository.assertRehearsalReady({
        tenantId,
        providerAuthorityDigest: this.config.providerAuthorityDigest,
        expectedPolicy: this.config.expectedPolicy,
      });
      if (this.mode(control, 'BEFORE_PROVIDER_VERIFY', tenantId) === 'ACTIVE') {
        providerRequired = true;
      }
    }
    if (providerRequired) {
      await this.provider.verify();
    }

    for (const tenantId of this.config.tenantIds) {
      if (this.mode(control, 'BEFORE_REAP', tenantId) === 'KILLED') {
        continue;
      }
      await this.repository.reapExpired({
        tenantId,
        providerAuthorityDigest: this.config.providerAuthorityDigest,
        batchLimit: this.config.batchSize,
      });
    }

    for (const tenantId of this.config.tenantIds) {
      let examined = 0;
      while (examined < this.config.batchSize) {
        if (this.mode(control, 'BEFORE_CLAIM', tenantId) !== 'ACTIVE') {
          break;
        }
        const leaseToken = this.leaseToken();
        const claimOutcome = await this.repository.claimOne({
          tenantId,
          leaseOwnerDigest: this.leaseOwnerDigest,
          leaseTokenDigest: digest(leaseToken),
          providerAuthorityDigest: this.config.providerAuthorityDigest,
        });
        if (claimOutcome.decision === 'EMPTY') {
          break;
        }
        examined += 1;
        if (claimOutcome.decision === 'CANCELED') {
          result.canceled += 1;
          this.logger.warn({ event: 'EMPLOYEE_INVITE_MAIL_CANCELED' });
          continue;
        }
        result.claimed += 1;
        const outcome = await this.processClaim(
          tenantId,
          claimOutcome.claim,
          leaseToken,
          control,
        );
        recordOutcome(result, outcome);
        if (outcome === 'RECONCILIATION_REQUIRED') {
          return result;
        }
      }
    }
    return result;
  }

  close(): void {
    this.provider.close();
  }

  private async processClaim(
    expectedTenantId: string,
    claim: EmployeeInviteMailClaimCurrent189,
    leaseToken: string,
    control: EmployeeInviteMailWorkerControl,
  ): Promise<DeliveryOutcome> {
    let providerBoundaryEntered = false;
    const lease = this.lease(claim, leaseToken);
    const providerLease = {
      ...lease,
      expectedTransitionRevision: claim.transitionRevision + 1,
    };
    try {
      this.assertClaim(expectedTenantId, claim);
      this.assertNotKilled(control, 'AFTER_CLAIM', claim);
      const token = this.tokenOpener.open(
        secretBinding(claim),
        sealedToken(claim),
      );
      const message = buildEmployeeInviteMessage({
        recipientEmail: claim.recipientEmail,
        token,
        messageKey: claim.messageKey,
        publicWebOrigin: this.config.publicWebOrigin,
        from: this.config.from,
        messageIdDomain: this.config.messageIdDomain,
      });
      const providerAttemptKey = this.entropy.randomUuid();
      if (!uuid(providerAttemptKey)) {
        fail('EMPLOYEE_INVITE_MAIL_ENTROPY_INVALID');
      }
      this.assertNotKilled(control, 'BEFORE_PROVIDER_MARK', claim);

      // From this line onward any error may follow a committed durable marker.
      // Only exact settlement replay or reconciliation is allowed; never send
      // a second provider request for this claim.
      providerBoundaryEntered = true;
      const mark = await this.repository.markProviderAttempt({
        ...lease,
        inviteId: claim.inviteId,
        messageId: message.messageId,
        providerAttemptKey,
        providerAuthorityDigest: this.config.providerAuthorityDigest,
      });
      if (mark === 'HANDOFF') {
        providerBoundaryEntered = false;
        this.logger.warn({ event: 'EMPLOYEE_INVITE_MAIL_HANDOFF' });
        return 'RECONCILIATION_REQUIRED';
      }
      if (mark !== 'MARKED') {
        fail('EMPLOYEE_INVITE_MAIL_PROVIDER_MARK_RESPONSE_INVALID');
      }
      this.assertNotKilled(control, 'AFTER_PROVIDER_MARK', claim);
      const providerReceipt = await this.provider.send(message);
      // A kill observed after a confirmed provider acceptance cannot discard
      // the terminal acknowledgement. Completion must still be attempted.
      this.mode(
        control,
        'AFTER_PROVIDER_ACCEPTED',
        claim.tenantId,
        claim.outboxId,
      );
      await this.repository.markSent({
        ...providerLease,
        providerReceiptDigest: providerReceipt.receiptDigest,
        providerOutcomeCode: providerReceipt.outcomeCode,
      });
      this.logger.log({ event: 'EMPLOYEE_INVITE_MAIL_SENT' });
      return 'SENT';
    } catch (error) {
      const reasonCode = safeReasonCode(error);
      if (providerBoundaryEntered) {
        try {
          await this.repository.markReconciliationRequired({
            ...providerLease,
            reasonCode,
          });
        } catch {
          // The bounded DB reaper will quarantine a durable marker if this
          // exact terminal acknowledgement also lost its response.
        }
        this.logger.error({
          event: 'EMPLOYEE_INVITE_MAIL_RECONCILIATION_REQUIRED',
          reasonCode,
        });
        return 'RECONCILIATION_REQUIRED';
      }

      const outcome = await this.repository.markPreProviderFailure({
        ...lease,
        reasonCode,
      });
      logPreProviderOutcome(this.logger, outcome, reasonCode);
      return outcome;
    } finally {
      claim.secretCiphertext.fill(0);
    }
  }

  private assertClaim(
    expectedTenantId: string,
    claim: EmployeeInviteMailClaimCurrent189,
  ): void {
    if (
      claim.tenantId !== expectedTenantId ||
      !this.config.tenantIds.includes(claim.tenantId) ||
      claim.template !== EMPLOYEE_INVITE_MAIL_TEMPLATE ||
      !uuid(claim.deliveryLocator) ||
      !uuid(claim.inviteId) ||
      !uuid(claim.outboxId) ||
      !uuid(claim.messageKey) ||
      !sha256(claim.requestDigest) ||
      !isCanonicalIdentityMailRecipient(claim.recipientEmail) ||
      !sha256(claim.tokenHash) ||
      claim.digestVersion !== EMPLOYEE_INVITE_DIGEST_VERSION ||
      !Buffer.isBuffer(claim.secretCiphertext) ||
      claim.secretCiphertext.length !== EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES ||
      claim.envelopeVersion !== EMPLOYEE_INVITE_ENVELOPE_VERSION ||
      claim.keyVersion !== this.config.keyVersion ||
      claim.aadEnvironment !== this.config.aadEnvironment ||
      !(claim.expiresAt instanceof Date) ||
      !Number.isFinite(claim.expiresAt.getTime()) ||
      claim.expiresAt.getTime() <= Date.now() ||
      claim.leaseVersion < 1n ||
      !positiveInteger(claim.transitionRevision) ||
      !positiveInteger(claim.attemptNumber) ||
      claim.claimEnrollmentStateRevision < 1n ||
      !positiveInteger(claim.claimPolicyRevision) ||
      claim.claimProviderAuthorityDigest !== this.config.providerAuthorityDigest
    ) {
      fail('EMPLOYEE_INVITE_MAIL_CLAIM_INVALID');
    }
  }

  private assertNotKilled(
    control: EmployeeInviteMailWorkerControl,
    boundary: 'AFTER_CLAIM' | 'BEFORE_PROVIDER_MARK' | 'AFTER_PROVIDER_MARK',
    claim: EmployeeInviteMailClaimCurrent189,
  ): void {
    if (
      this.mode(control, boundary, claim.tenantId, claim.outboxId) === 'KILLED'
    ) {
      fail(
        boundary === 'AFTER_PROVIDER_MARK'
          ? 'EMPLOYEE_INVITE_MAIL_EMERGENCY_STOP_AFTER_PROVIDER_MARK'
          : 'EMPLOYEE_INVITE_MAIL_EMERGENCY_STOP_PRE_PROVIDER',
      );
    }
  }

  private lease(
    claim: EmployeeInviteMailClaimCurrent189,
    leaseToken: string,
  ): EmployeeInviteMailLeaseCurrent189 {
    return {
      tenantId: claim.tenantId,
      outboxId: claim.outboxId,
      leaseVersion: claim.leaseVersion,
      expectedTransitionRevision: claim.transitionRevision,
      leaseOwnerDigest: this.leaseOwnerDigest,
      leaseToken,
    };
  }

  private leaseToken(): string {
    const bytes = this.entropy.randomBytes(32);
    try {
      if (!Buffer.isBuffer(bytes) || bytes.length !== 32) {
        fail('EMPLOYEE_INVITE_MAIL_ENTROPY_INVALID');
      }
      const token = bytes.toString('base64url');
      if (!TOKEN_PATTERN.test(token)) {
        fail('EMPLOYEE_INVITE_MAIL_ENTROPY_INVALID');
      }
      return token;
    } finally {
      if (Buffer.isBuffer(bytes)) {
        bytes.fill(0);
      }
    }
  }

  private mode(
    control: EmployeeInviteMailWorkerControl,
    boundary: EmployeeInviteMailWorkerBoundary,
    tenantId: string | null,
    outboxId?: string,
  ): EmployeeInviteMailWorkerMode {
    const mode = control.modeAt({ boundary, tenantId, outboxId });
    if (mode !== 'ACTIVE' && mode !== 'DRAINING' && mode !== 'KILLED') {
      fail('EMPLOYEE_INVITE_MAIL_CONTROL_RESPONSE_INVALID');
    }
    return mode;
  }

  private assertDormantPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.config.enabled !== true ||
      this.config.realProviderEnabled !== true ||
      this.config.production !== false ||
      this.config.candidateStatus !== 'NOT_DEPLOYABLE'
    ) {
      fail('EMPLOYEE_INVITE_MAIL_CURRENT189_PRODUCTION_FORBIDDEN');
    }
  }
}

function snapshotConfig(
  input: EmployeeInviteMailWorkerCurrent189Config,
): EmployeeInviteMailWorkerCurrent189Config {
  if (
    !input ||
    input.enabled !== true ||
    input.realProviderEnabled !== true ||
    input.production !== false ||
    input.candidateStatus !== 'NOT_DEPLOYABLE' ||
    input.publicWebOrigin !== 'https://leetplus.ru' ||
    !validLabel(input.aadEnvironment, 64) ||
    input.keyVersion !== 'v1' ||
    !Array.isArray(input.tenantIds) ||
    input.tenantIds.length < 1 ||
    input.tenantIds.length > 100 ||
    new Set(input.tenantIds).size !== input.tenantIds.length ||
    input.tenantIds.some((tenantId) => !uuid(tenantId)) ||
    !positiveInteger(input.batchSize) ||
    input.batchSize > 100 ||
    !sha256(input.providerAuthorityDigest) ||
    !isCanonicalIdentityMailRecipient(input.from) ||
    !DNS_NAME_PATTERN.test(input.messageIdDomain) ||
    !validPolicy(input.expectedPolicy)
  ) {
    fail('EMPLOYEE_INVITE_MAIL_CURRENT189_CONFIGURATION_INVALID');
  }
  return Object.freeze({
    ...input,
    tenantIds: Object.freeze(
      input.tenantIds.map((tenantId: string) => tenantId),
    ),
    expectedPolicy: Object.freeze({ ...input.expectedPolicy }),
  });
}

function validPolicy(
  policy: EmployeeInviteMailWorkerCurrent189Config['expectedPolicy'],
): boolean {
  return (
    policy !== null &&
    typeof policy === 'object' &&
    positiveInteger(policy.maxAttempts) &&
    positiveInteger(policy.leaseSeconds) &&
    positiveInteger(policy.acknowledgeSeconds) &&
    positiveInteger(policy.baseRetrySeconds) &&
    positiveInteger(policy.maxRetrySeconds) &&
    policy.baseRetrySeconds <= policy.maxRetrySeconds
  );
}

function secretBinding(
  claim: EmployeeInviteMailClaimCurrent189,
): EmployeeInviteSecretBinding {
  return {
    tenantId: claim.tenantId,
    deliveryLocator: claim.deliveryLocator,
    inviteId: claim.inviteId,
    outboxId: claim.outboxId,
    template: claim.template,
    messageKey: claim.messageKey,
    requestDigest: claim.requestDigest,
    recipientEmail: claim.recipientEmail,
    expiresAt: claim.expiresAt,
  };
}

function sealedToken(
  claim: EmployeeInviteMailClaimCurrent189,
): SealedEmployeeInviteToken {
  return {
    tokenHash: claim.tokenHash,
    digestVersion: claim.digestVersion,
    secretCiphertext: claim.secretCiphertext,
    envelopeVersion: claim.envelopeVersion,
    keyVersion: claim.keyVersion,
    aadEnvironment: claim.aadEnvironment,
  };
}

function emptyResult(): EmployeeInviteMailWorkerRunResult {
  return {
    claimed: 0,
    sent: 0,
    retry: 0,
    dead: 0,
    canceled: 0,
    reconciliationRequired: 0,
  };
}

function recordOutcome(
  result: EmployeeInviteMailWorkerRunResult,
  outcome: DeliveryOutcome,
): void {
  if (outcome === 'SENT') {
    result.sent += 1;
  } else if (outcome === 'RETRY') {
    result.retry += 1;
  } else if (outcome === 'DEAD') {
    result.dead += 1;
  } else if (outcome === 'CANCELED') {
    result.canceled += 1;
  } else {
    result.reconciliationRequired += 1;
  }
}

function logPreProviderOutcome(
  logger: EmployeeInviteMailWorkerLogger,
  outcome: EmployeeInviteMailPreProviderOutcome,
  reasonCode: string,
): void {
  const event: EmployeeInviteMailWorkerLogEvent = {
    event:
      outcome === 'RETRY'
        ? 'EMPLOYEE_INVITE_MAIL_RETRY'
        : outcome === 'DEAD'
          ? 'EMPLOYEE_INVITE_MAIL_DEAD'
          : 'EMPLOYEE_INVITE_MAIL_CANCELED',
    reasonCode,
  };
  if (outcome === 'RETRY') {
    logger.warn(event);
  } else if (outcome === 'DEAD') {
    logger.error(event);
  } else {
    logger.warn(event);
  }
}

function safeReasonCode(error: unknown): string {
  if (
    error instanceof EmployeeInviteMailWorkerCurrent189Error ||
    error instanceof EmployeeInviteMailWorkerCurrent189RepositoryError ||
    error instanceof EmployeeInviteMailTemplateError ||
    error instanceof EmployeeInviteMailProviderCurrent189Error
  ) {
    return error.reasonCode;
  }
  const response = hasGetResponse(error) ? error.getResponse() : null;
  const responseRecord = record(response);
  if (
    responseRecord?.reasonCode === 'EMPLOYEE_INVITE_SECRET_ENVELOPE_INVALID'
  ) {
    return responseRecord.reasonCode;
  }
  return 'EMPLOYEE_INVITE_MAIL_DELIVERY_FAILED';
}

function advance(
  current: EmployeeInviteMailWorkerMode,
  requested: EmployeeInviteMailWorkerMode,
): EmployeeInviteMailWorkerMode {
  return MODE_PRIORITY[current] >= MODE_PRIORITY[requested]
    ? current
    : requested;
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

function validLabel(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= max &&
    value === value.trim() &&
    /^[A-Za-z0-9._-]+$/u.test(value)
  );
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function assertUuid(
  value: unknown,
  reasonCode: string,
): asserts value is string {
  if (!uuid(value)) {
    fail(reasonCode);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasGetResponse(value: unknown): value is { getResponse(): unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getResponse' in value &&
    typeof value.getResponse === 'function'
  );
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailWorkerCurrent189Error(reasonCode);
}
