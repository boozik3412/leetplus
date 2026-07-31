export type IdentityMailWorkerEnvironment = Record<string, string | undefined>;

export type IdentityMailSmtpTlsMode = 'IMPLICIT_TLS' | 'STARTTLS';

export type IdentityMailWorkerSmtpConfig = {
  readonly host: string;
  readonly port: number;
  readonly tlsMode: IdentityMailSmtpTlsMode;
  readonly servername: string;
  readonly username: string;
  readonly password: string;
  readonly from: string;
  readonly messageIdDomain: string;
  readonly connectionTimeoutMs: number;
  readonly greetingTimeoutMs: number;
  readonly socketTimeoutMs: number;
};

export type DisabledIdentityMailWorkerConfig = {
  readonly enabled: false;
  readonly realSendEnabled: false;
  readonly liveCanaryEnabled: false;
};

export type EnabledIdentityMailWorkerConfig = {
  readonly enabled: true;
  readonly realSendEnabled: true;
  readonly liveCanaryEnabled: true;
  readonly databaseUrl: string;
  readonly databaseTlsRequired: boolean;
  readonly databaseConnectTimeoutSeconds: number;
  readonly databaseSocketTimeoutSeconds: number;
  readonly expectedDatabase: string;
  readonly expectedRole: string;
  readonly expectedMigration: string;
  readonly expectedMigrationCount: number;
  readonly releaseSha: string;
  readonly canaryTenantIds: readonly string[];
  readonly publicWebOrigin: string;
  readonly encryptionKey: string;
  readonly encryptionKeyVersion: 'v1';
  readonly aadEnvironment: string;
  readonly pollIntervalMs: number;
  readonly leaseMs: number;
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly baseRetryMs: number;
  readonly maxRetryMs: number;
  readonly healthHost: '127.0.0.1';
  readonly healthPort: number;
  readonly smtp: IdentityMailWorkerSmtpConfig;
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
  providerAuthorityDigest: string;
};

export type IdentityMailDeliveryLeaseInput = {
  tenantId: string;
  outboxId: string;
  leaseVersion: bigint;
  expectedTransitionRevision: number;
  leaseOwnerDigest: string;
  leaseToken: string;
};

export type MarkIdentityMailProviderAttemptInput =
  IdentityMailDeliveryLeaseInput & {
    inviteId: string;
    messageId: string;
    providerAttemptKey: string;
    providerAuthorityDigest: string;
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
  providerAuthorityDigest: string;
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
  providerAuthorityDigest: string;
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
