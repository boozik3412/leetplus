export type IdentityMailWorkerEnvironment = Record<string, string | undefined>;

export type IdentityMailSmtpTlsMode = 'IMPLICIT_TLS' | 'STARTTLS';

export type IdentityMailWorkerSmtpConfig = {
  host: string;
  port: number;
  tlsMode: IdentityMailSmtpTlsMode;
  servername: string;
  username: string;
  password: string;
  from: string;
  messageIdDomain: string;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
};

export type DisabledIdentityMailWorkerConfig = {
  enabled: false;
  realSendEnabled: false;
  liveCanaryEnabled: false;
};

export type EnabledIdentityMailWorkerConfig = {
  enabled: true;
  realSendEnabled: true;
  liveCanaryEnabled: true;
  databaseUrl: string;
  databaseTlsRequired: boolean;
  databaseConnectTimeoutSeconds: number;
  databaseSocketTimeoutSeconds: number;
  expectedDatabase: string;
  expectedRole: string;
  expectedMigration: string;
  expectedMigrationCount: number;
  releaseSha: string;
  canaryTenantIds: readonly string[];
  publicWebOrigin: string;
  encryptionKey: string;
  encryptionKeyVersion: 'v1';
  aadEnvironment: string;
  pollIntervalMs: number;
  leaseMs: number;
  batchSize: number;
  maxAttempts: number;
  baseRetryMs: number;
  maxRetryMs: number;
  healthHost: '127.0.0.1';
  healthPort: number;
  smtp: IdentityMailWorkerSmtpConfig;
};

export type IdentityMailWorkerConfig =
  | DisabledIdentityMailWorkerConfig
  | EnabledIdentityMailWorkerConfig;

export type IdentityMailSecretEnvelope = {
  tenantId: string;
  workflowLocator: string;
  inviteId: string;
  outboxId: string;
  template: 'INITIAL_OWNER_INVITE';
  messageKey: string;
  requestDigest: string;
  recipientEmail: string;
  tokenHash: string;
  digestVersion: 'sha256-v1';
  secretCiphertext: Buffer;
  envelopeVersion: 1;
  keyVersion: 'v1';
  aadEnvironment: string;
  expiresAt: Date;
};

export type ClaimedIdentityMailDelivery = IdentityMailSecretEnvelope & {
  leaseVersion: bigint;
  transitionRevision: number;
  attemptNumber: number;
};

export type ClaimIdentityMailDeliveryInput = {
  tenantId: string;
  leaseOwnerDigest: string;
  leaseTokenDigest: string;
  workerConfigDigest: string;
};

export type IdentityMailDeliveryLeaseInput = {
  tenantId: string;
  outboxId: string;
  leaseVersion: bigint;
  expectedTransitionRevision: number;
  leaseOwnerDigest: string;
  leaseToken: string;
  workerConfigDigest: string;
};

export type MarkIdentityMailProviderAttemptInput =
  IdentityMailDeliveryLeaseInput & {
    inviteId: string;
    messageId: string;
    providerAttemptKey: string;
  };

export type IdentityMailProviderAttemptOutcome = 'MARKED' | 'CANCELED';

export type MarkIdentityMailSentInput = IdentityMailDeliveryLeaseInput & {
  providerReceiptDigest: string;
  providerOutcomeCode: string;
};

export type MarkIdentityMailFailureInput = IdentityMailDeliveryLeaseInput & {
  reasonCode: string;
};

export type IdentityMailPreProviderFailureOutcome =
  | 'RETRY'
  | 'DEAD'
  | 'CANCELED';

export type ReapIdentityMailDeliveryInput = {
  tenantId: string;
  workerConfigDigest: string;
  workerActorDigest: string;
  batchLimit: number;
};

export type AssertIdentityMailWorkerReadyInput = {
  expectedDatabase: string;
  expectedRole: string;
  databaseTlsRequired: boolean;
  expectedMigration: string;
  expectedMigrationCount: number;
  releaseSha: string;
  canaryTenantIds: readonly string[];
  workerConfigDigest: string;
  expectedPolicy: {
    maxAttempts: number;
    leaseSeconds: number;
    minimumAcknowledgeSeconds: number;
    baseRetrySeconds: number;
    maxRetrySeconds: number;
  };
};

export interface IdentityMailWorkerRepository {
  assertReady(input: AssertIdentityMailWorkerReadyInput): Promise<void>;
  claimOne(
    input: ClaimIdentityMailDeliveryInput,
  ): Promise<ClaimedIdentityMailDelivery | null>;
  reapExpired(input: ReapIdentityMailDeliveryInput): Promise<number>;
  markProviderAttempt(
    input: MarkIdentityMailProviderAttemptInput,
  ): Promise<IdentityMailProviderAttemptOutcome>;
  markSent(input: MarkIdentityMailSentInput): Promise<void>;
  markPreProviderFailure(
    input: MarkIdentityMailFailureInput,
  ): Promise<IdentityMailPreProviderFailureOutcome>;
  markReconciliationRequired(
    input: MarkIdentityMailFailureInput,
  ): Promise<void>;
}

export interface IdentityMailSecretOpener {
  openInitialOwnerInviteToken(input: IdentityMailSecretEnvelope): string;
}

export type IdentityMailMessage = {
  to: string;
  from: string;
  messageId: string;
  subject: string;
  text: string;
  html: string;
};

export type IdentityMailSmtpReceipt = {
  receiptDigest: string;
  outcomeCode: 'SMTP_ACCEPTED';
};

export interface IdentityMailSmtpProvider {
  verify(): Promise<void>;
  send(message: IdentityMailMessage): Promise<IdentityMailSmtpReceipt>;
  close(): void;
}

export type IdentityMailWorkerLogEvent = {
  event:
    | 'IDENTITY_MAIL_WORKER_READY'
    | 'IDENTITY_MAIL_DELIVERY_SENT'
    | 'IDENTITY_MAIL_DELIVERY_RETRY'
    | 'IDENTITY_MAIL_DELIVERY_DEAD'
    | 'IDENTITY_MAIL_DELIVERY_CANCELED'
    | 'IDENTITY_MAIL_DELIVERY_RECONCILIATION_REQUIRED';
  reasonCode?: string;
};

export interface IdentityMailWorkerLogger {
  log(event: IdentityMailWorkerLogEvent): void;
  warn(event: IdentityMailWorkerLogEvent): void;
  error(event: IdentityMailWorkerLogEvent): void;
}

export type IdentityMailWorkerRunResult = {
  claimed: number;
  sent: number;
  retry: number;
  dead: number;
  canceled: number;
  reconciliationRequired: number;
};
