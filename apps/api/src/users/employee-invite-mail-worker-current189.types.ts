import type { IdentityMailMessage } from '../identity-mail-worker/identity-mail-worker.types';
import type {
  EmployeeInviteSecretBinding,
  SealedEmployeeInviteToken,
} from './employee-invite-secret-envelope';

export type EmployeeInviteMailWorkerMode = 'ACTIVE' | 'DRAINING' | 'KILLED';

export type EmployeeInviteMailWorkerBoundary =
  | 'BEFORE_CYCLE'
  | 'BEFORE_TENANT_READINESS'
  | 'BEFORE_PROVIDER_VERIFY'
  | 'BEFORE_REAP'
  | 'BEFORE_CLAIM'
  | 'AFTER_CLAIM'
  | 'BEFORE_PROVIDER_MARK'
  | 'AFTER_PROVIDER_MARK'
  | 'AFTER_PROVIDER_ACCEPTED';

export type EmployeeInviteMailWorkerControlContext = Readonly<{
  boundary: EmployeeInviteMailWorkerBoundary;
  tenantId: string | null;
  outboxId?: string;
}>;

export interface EmployeeInviteMailWorkerControl {
  modeAt(
    context: EmployeeInviteMailWorkerControlContext,
  ): EmployeeInviteMailWorkerMode;
}

export type EmployeeInviteMailWorkerCurrent189Config = Readonly<{
  enabled: true;
  realProviderEnabled: true;
  production: false;
  candidateStatus: 'NOT_DEPLOYABLE';
  publicWebOrigin: 'https://leetplus.ru';
  aadEnvironment: string;
  keyVersion: 'v1';
  tenantIds: readonly string[];
  batchSize: number;
  providerAuthorityDigest: string;
  from: string;
  messageIdDomain: string;
  expectedPolicy: Readonly<{
    maxAttempts: number;
    leaseSeconds: number;
    acknowledgeSeconds: number;
    baseRetrySeconds: number;
    maxRetrySeconds: number;
  }>;
}>;

export type EmployeeInviteMailClaimCurrent189 = EmployeeInviteSecretBinding &
  SealedEmployeeInviteToken &
  Readonly<{
    leaseVersion: bigint;
    transitionRevision: number;
    attemptNumber: number;
    claimEnrollmentStateRevision: bigint;
    claimPolicyRevision: number;
    claimProviderAuthorityDigest: string;
  }>;

export type EmployeeInviteMailClaimOutcomeCurrent189 =
  | Readonly<{ decision: 'EMPTY' }>
  | Readonly<{ decision: 'CANCELED'; outboxId: string }>
  | Readonly<{
      decision: 'CLAIMED';
      claim: EmployeeInviteMailClaimCurrent189;
    }>;

export type EmployeeInviteMailLeaseCurrent189 = Readonly<{
  tenantId: string;
  outboxId: string;
  leaseVersion: bigint;
  expectedTransitionRevision: number;
  leaseOwnerDigest: string;
  leaseToken: string;
}>;

export type EmployeeInviteMailPreProviderOutcome =
  | 'RETRY'
  | 'DEAD'
  | 'CANCELED';

export type EmployeeInviteMailProviderMarkOutcome = 'MARKED' | 'HANDOFF';

export interface EmployeeInviteMailWorkerCurrent189Repository {
  assertRehearsalReady(input: {
    tenantId: string;
    providerAuthorityDigest: string;
    expectedPolicy: EmployeeInviteMailWorkerCurrent189Config['expectedPolicy'];
  }): Promise<void>;
  reapExpired(input: {
    tenantId: string;
    providerAuthorityDigest: string;
    batchLimit: number;
  }): Promise<number>;
  claimOne(input: {
    tenantId: string;
    leaseOwnerDigest: string;
    leaseTokenDigest: string;
    providerAuthorityDigest: string;
  }): Promise<EmployeeInviteMailClaimOutcomeCurrent189>;
  markProviderAttempt(
    input: EmployeeInviteMailLeaseCurrent189 & {
      inviteId: string;
      messageId: string;
      providerAttemptKey: string;
      providerAuthorityDigest: string;
    },
  ): Promise<EmployeeInviteMailProviderMarkOutcome>;
  markSent(
    input: EmployeeInviteMailLeaseCurrent189 & {
      providerReceiptDigest: string;
      providerOutcomeCode: 'EMPLOYEE_SMTP_ACCEPTED';
    },
  ): Promise<void>;
  markPreProviderFailure(
    input: EmployeeInviteMailLeaseCurrent189 & { reasonCode: string },
  ): Promise<EmployeeInviteMailPreProviderOutcome>;
  markReconciliationRequired(
    input: EmployeeInviteMailLeaseCurrent189 & { reasonCode: string },
  ): Promise<void>;
}

export interface EmployeeInviteMailTokenOpener {
  open(
    binding: EmployeeInviteSecretBinding,
    sealed: SealedEmployeeInviteToken,
  ): string;
}

export type EmployeeInviteMailProviderReceipt = Readonly<{
  outcomeCode: 'EMPLOYEE_SMTP_ACCEPTED';
  receiptDigest: string;
}>;

/**
 * Employee invitation transport is deliberately a separate provider boundary.
 * It does not extend or alias the initial-owner SMTP provider.
 */
export interface EmployeeInviteMailProviderCurrent189 {
  verify(): Promise<void>;
  send(
    message: IdentityMailMessage,
  ): Promise<EmployeeInviteMailProviderReceipt>;
  close(): void;
}

export type EmployeeInviteMailWorkerLogEvent = Readonly<{
  event:
    | 'EMPLOYEE_INVITE_MAIL_WORKER_READY'
    | 'EMPLOYEE_INVITE_MAIL_SENT'
    | 'EMPLOYEE_INVITE_MAIL_RETRY'
    | 'EMPLOYEE_INVITE_MAIL_DEAD'
    | 'EMPLOYEE_INVITE_MAIL_CANCELED'
    | 'EMPLOYEE_INVITE_MAIL_HANDOFF'
    | 'EMPLOYEE_INVITE_MAIL_RECONCILIATION_REQUIRED';
  reasonCode?: string;
}>;

export interface EmployeeInviteMailWorkerLogger {
  log(event: EmployeeInviteMailWorkerLogEvent): void;
  warn(event: EmployeeInviteMailWorkerLogEvent): void;
  error(event: EmployeeInviteMailWorkerLogEvent): void;
}

export type EmployeeInviteMailWorkerRunResult = {
  claimed: number;
  sent: number;
  retry: number;
  dead: number;
  canceled: number;
  reconciliationRequired: number;
};
