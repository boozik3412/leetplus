import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { IdentityMailSmtpProviderError } from './identity-mail-smtp-provider';
import { isCanonicalIdentityMailRecipient } from './identity-mail-recipient';
import {
  buildInitialOwnerInviteMessage,
  IdentityMailTemplateError,
} from './identity-mail-worker-template';
import type {
  ClaimedIdentityMailDelivery,
  EnabledIdentityMailWorkerConfig,
  IdentityMailDeliveryLeaseInput,
  IdentityMailPreProviderFailureOutcome,
  IdentityMailSecretOpener,
  IdentityMailSmtpProvider,
  IdentityMailWorkerLogger,
  IdentityMailWorkerRepository,
  IdentityMailWorkerRunResult,
} from './identity-mail-worker.types';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONFIG_BINDING_HKDF_SALT =
  'leetplus:identity-mail-worker:config-binding:salt:v1';
const SMTP_PASSWORD_BINDING_HKDF_INFO =
  'leetplus:identity-mail-worker:smtp-password-hmac:v1';
const neverStop = () => false;

type IdentityMailWorkerEntropy = {
  randomBytes(size: number): Buffer;
  randomUuid(): string;
};

type DeliveryOutcome =
  | 'SENT'
  | 'CANCELED'
  | IdentityMailPreProviderFailureOutcome
  | 'RECONCILIATION_REQUIRED';

const silentLogger: IdentityMailWorkerLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export class IdentityMailWorkerProcessingError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'IdentityMailWorkerProcessingError';
  }
}

export class IdentityMailWorkerService {
  readonly workerConfigDigest: string;
  private readonly leaseOwnerDigest: string;

  constructor(
    private readonly config: EnabledIdentityMailWorkerConfig,
    private readonly repository: IdentityMailWorkerRepository,
    private readonly secretOpener: IdentityMailSecretOpener,
    private readonly smtpProvider: IdentityMailSmtpProvider,
    private readonly logger: IdentityMailWorkerLogger = silentLogger,
    private readonly entropy: IdentityMailWorkerEntropy = {
      randomBytes,
      randomUuid: randomUUID,
    },
  ) {
    this.workerConfigDigest = this.configDigest(config);
    this.leaseOwnerDigest = createHash('sha256')
      .update(this.entropy.randomBytes(32))
      .digest('hex');
  }

  async assertReady(): Promise<void> {
    await this.repository.assertReady(this.readinessInput());
    await this.smtpProvider.verify();
    this.logger.log({ event: 'IDENTITY_MAIL_WORKER_READY' });
  }

  async runOnce(
    shouldStop: () => boolean = neverStop,
  ): Promise<IdentityMailWorkerRunResult> {
    const result: IdentityMailWorkerRunResult = {
      claimed: 0,
      sent: 0,
      retry: 0,
      dead: 0,
      canceled: 0,
      reconciliationRequired: 0,
    };
    if (shouldStop()) {
      return result;
    }

    // Readiness is a per-cycle admission condition. Authority or enrollment
    // drift must stop the worker before any reaping or claiming RPC.
    await this.repository.assertReady(this.readinessInput());
    if (shouldStop()) {
      return result;
    }
    await this.smtpProvider.verify();
    if (shouldStop()) {
      return result;
    }

    for (const tenantId of this.config.canaryTenantIds) {
      if (shouldStop()) {
        return result;
      }
      await this.repository.reapExpired({
        tenantId,
        workerConfigDigest: this.workerConfigDigest,
        workerActorDigest: this.leaseOwnerDigest,
        batchLimit: this.config.batchSize,
      });
    }

    for (const tenantId of this.config.canaryTenantIds) {
      if (shouldStop()) {
        return result;
      }
      let tenantClaimed = 0;
      while (tenantClaimed < this.config.batchSize) {
        if (shouldStop()) {
          return result;
        }
        const leaseToken = this.entropy.randomBytes(32).toString('base64url');
        if (!TOKEN_PATTERN.test(leaseToken)) {
          throw new IdentityMailWorkerProcessingError(
            'IDENTITY_MAIL_WORKER_ENTROPY_INVALID',
          );
        }
        const claim = await this.repository.claimOne({
          tenantId,
          leaseOwnerDigest: this.leaseOwnerDigest,
          leaseTokenDigest: createHash('sha256')
            .update(leaseToken)
            .digest('hex'),
          workerConfigDigest: this.workerConfigDigest,
        });
        if (!claim) {
          break;
        }
        // A stop observed after claimOne returns must not abandon the leased
        // row. Finish this claim, then the loop-level predicate prevents every
        // subsequent claim and tenant batch.
        result.claimed += 1;
        tenantClaimed += 1;
        const outcome = await this.processClaim(tenantId, claim, leaseToken);
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
          // An ambiguous provider boundary commonly indicates a provider or
          // acknowledgement outage. Stop the entire cycle after durably
          // quarantining the first affected delivery so one degraded cycle
          // cannot quarantine batchSize * tenantCount deliveries.
          return result;
        }
      }
    }

    return result;
  }

  close(): void {
    this.smtpProvider.close();
  }

  private async processClaim(
    expectedTenantId: string,
    claim: ClaimedIdentityMailDelivery,
    leaseToken: string,
  ): Promise<DeliveryOutcome> {
    let providerBoundaryEntered = false;
    const lease = this.leaseInput(claim, leaseToken);
    const providerLease = {
      ...lease,
      expectedTransitionRevision: claim.transitionRevision + 1,
    };

    try {
      this.assertClaim(expectedTenantId, claim);
      const token = this.secretOpener.openInitialOwnerInviteToken(claim);
      const message = buildInitialOwnerInviteMessage({
        recipientEmail: claim.recipientEmail,
        token,
        messageKey: claim.messageKey,
        publicWebOrigin: this.config.publicWebOrigin,
        smtp: this.config.smtp,
      });
      const providerAttemptKey = this.entropy.randomUuid();
      if (!UUID_PATTERN.test(providerAttemptKey)) {
        throw new IdentityMailWorkerProcessingError(
          'IDENTITY_MAIL_WORKER_ENTROPY_INVALID',
        );
      }

      // Crossing this boundary is deliberately marked before awaiting the
      // database call. A lost response may mean the durable marker committed.
      providerBoundaryEntered = true;
      const providerAttemptOutcome = await this.repository.markProviderAttempt({
        ...lease,
        inviteId: claim.inviteId,
        expectedTransitionRevision: claim.transitionRevision,
        messageId: message.messageId,
        providerAttemptKey,
      });
      if (providerAttemptOutcome === 'CANCELED') {
        providerBoundaryEntered = false;
        this.logger.warn({ event: 'IDENTITY_MAIL_DELIVERY_CANCELED' });
        return 'CANCELED';
      }
      if (providerAttemptOutcome !== 'MARKED') {
        throw new IdentityMailWorkerProcessingError(
          'IDENTITY_MAIL_PROVIDER_MARK_RESPONSE_INVALID',
        );
      }
      const smtpReceipt = await this.smtpProvider.send(message);
      await this.repository.markSent({
        ...providerLease,
        providerReceiptDigest: smtpReceipt.receiptDigest,
        providerOutcomeCode: smtpReceipt.outcomeCode,
      });
      this.logger.log({ event: 'IDENTITY_MAIL_DELIVERY_SENT' });
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
          // A reaper must quarantine a persisted marker if this response is
          // also lost. Blind retry is forbidden after entering the boundary.
        }
        this.logger.error({
          event: 'IDENTITY_MAIL_DELIVERY_RECONCILIATION_REQUIRED',
          reasonCode,
        });
        return 'RECONCILIATION_REQUIRED';
      }

      const outcome = await this.repository.markPreProviderFailure({
        ...lease,
        reasonCode,
      });
      if (outcome === 'RETRY') {
        this.logger.warn({
          event: 'IDENTITY_MAIL_DELIVERY_RETRY',
          reasonCode,
        });
      } else if (outcome === 'DEAD') {
        this.logger.error({
          event: 'IDENTITY_MAIL_DELIVERY_DEAD',
          reasonCode,
        });
      } else {
        this.logger.warn({
          event: 'IDENTITY_MAIL_DELIVERY_CANCELED',
          reasonCode,
        });
      }
      return outcome;
    } finally {
      claim.secretCiphertext.fill(0);
    }
  }

  private leaseInput(
    claim: ClaimedIdentityMailDelivery,
    leaseToken: string,
  ): IdentityMailDeliveryLeaseInput {
    return {
      tenantId: claim.tenantId,
      outboxId: claim.outboxId,
      leaseVersion: claim.leaseVersion,
      expectedTransitionRevision: claim.transitionRevision,
      leaseOwnerDigest: this.leaseOwnerDigest,
      leaseToken,
      workerConfigDigest: this.workerConfigDigest,
    };
  }

  private readinessInput() {
    return {
      expectedDatabase: this.config.expectedDatabase,
      expectedRole: this.config.expectedRole,
      databaseTlsRequired: this.config.databaseTlsRequired,
      expectedMigration: this.config.expectedMigration,
      expectedMigrationCount: this.config.expectedMigrationCount,
      releaseSha: this.config.releaseSha,
      canaryTenantIds: this.config.canaryTenantIds,
      workerConfigDigest: this.workerConfigDigest,
      expectedPolicy: {
        maxAttempts: this.config.maxAttempts,
        leaseSeconds: Math.ceil(this.config.leaseMs / 1000),
        minimumAcknowledgeSeconds: Math.ceil(
          (this.config.smtp.connectionTimeoutMs +
            this.config.smtp.greetingTimeoutMs +
            this.config.smtp.socketTimeoutMs) /
            1000,
        ),
        baseRetrySeconds: Math.ceil(this.config.baseRetryMs / 1000),
        maxRetrySeconds: Math.ceil(this.config.maxRetryMs / 1000),
      },
    };
  }

  private assertClaim(
    expectedTenantId: string,
    claim: ClaimedIdentityMailDelivery,
  ): void {
    if (
      claim.tenantId !== expectedTenantId ||
      !this.config.canaryTenantIds.includes(claim.tenantId) ||
      claim.template !== 'INITIAL_OWNER_INVITE' ||
      !isCanonicalIdentityMailRecipient(claim.recipientEmail) ||
      !UUID_PATTERN.test(claim.workflowLocator) ||
      !UUID_PATTERN.test(claim.inviteId) ||
      !UUID_PATTERN.test(claim.outboxId) ||
      !UUID_PATTERN.test(claim.messageKey) ||
      !SHA256_PATTERN.test(claim.requestDigest) ||
      !SHA256_PATTERN.test(claim.tokenHash) ||
      claim.digestVersion !== 'sha256-v1' ||
      !Buffer.isBuffer(claim.secretCiphertext) ||
      claim.secretCiphertext.length === 0 ||
      claim.envelopeVersion !== 1 ||
      claim.keyVersion !== 'v1' ||
      claim.aadEnvironment !== this.config.aadEnvironment ||
      !(claim.expiresAt instanceof Date) ||
      !Number.isFinite(claim.expiresAt.getTime()) ||
      claim.expiresAt.getTime() <= Date.now() ||
      typeof claim.leaseVersion !== 'bigint' ||
      claim.leaseVersion < 1n ||
      !Number.isSafeInteger(claim.transitionRevision) ||
      claim.transitionRevision < 1 ||
      !Number.isSafeInteger(claim.attemptNumber) ||
      claim.attemptNumber < 1
    ) {
      throw new IdentityMailWorkerProcessingError(
        'IDENTITY_MAIL_CLAIM_INVALID',
      );
    }
  }

  private configDigest(config: EnabledIdentityMailWorkerConfig): string {
    const keyBytes = Buffer.from(config.encryptionKey, 'base64url');
    let configBindingKey: Buffer | undefined;

    try {
      const encryptionKeyFingerprint = createHash('sha256')
        .update(keyBytes)
        .digest('hex');
      configBindingKey = Buffer.from(
        hkdfSync(
          'sha256',
          keyBytes,
          CONFIG_BINDING_HKDF_SALT,
          SMTP_PASSWORD_BINDING_HKDF_INFO,
          32,
        ),
      );
      const smtpPasswordBindingHmac = createHmac('sha256', configBindingKey)
        .update(config.smtp.password, 'utf8')
        .digest('hex');

      return createHash('sha256')
        .update(
          JSON.stringify({
            schemaVersion: 4,
            expectedDatabase: config.expectedDatabase,
            expectedRole: config.expectedRole,
            databaseTlsRequired: config.databaseTlsRequired,
            databaseConnectTimeoutSeconds: config.databaseConnectTimeoutSeconds,
            databaseSocketTimeoutSeconds: config.databaseSocketTimeoutSeconds,
            expectedMigration: config.expectedMigration,
            expectedMigrationCount: config.expectedMigrationCount,
            releaseSha: config.releaseSha,
            canaryTenantIds: config.canaryTenantIds,
            publicWebOrigin: config.publicWebOrigin,
            encryptionKeyVersion: config.encryptionKeyVersion,
            encryptionKeyFingerprint,
            aadEnvironment: config.aadEnvironment,
            pollIntervalMs: config.pollIntervalMs,
            leaseMs: config.leaseMs,
            batchSize: config.batchSize,
            maxAttempts: config.maxAttempts,
            baseRetryMs: config.baseRetryMs,
            maxRetryMs: config.maxRetryMs,
            smtp: {
              host: config.smtp.host,
              port: config.smtp.port,
              tlsMode: config.smtp.tlsMode,
              servername: config.smtp.servername,
              usernameDigest: createHash('sha256')
                .update(config.smtp.username)
                .digest('hex'),
              passwordBindingHmac: smtpPasswordBindingHmac,
              from: config.smtp.from,
              messageIdDomain: config.smtp.messageIdDomain,
              connectionTimeoutMs: config.smtp.connectionTimeoutMs,
              greetingTimeoutMs: config.smtp.greetingTimeoutMs,
              socketTimeoutMs: config.smtp.socketTimeoutMs,
            },
          }),
        )
        .digest('hex');
    } finally {
      configBindingKey?.fill(0);
      keyBytes.fill(0);
    }
  }
}

function safeReasonCode(error: unknown): string {
  if (
    error instanceof IdentityMailWorkerProcessingError ||
    error instanceof IdentityMailTemplateError ||
    error instanceof IdentityMailSmtpProviderError
  ) {
    return error.reasonCode;
  }
  return 'IDENTITY_MAIL_DELIVERY_FAILED';
}
