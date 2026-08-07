import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';
import type {
  SharedTenantProvisioningService,
  ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

const COORDINATOR_CONTRACT =
  'PROTECTED_INITIAL_OWNER_APPLICATION_COORDINATOR_V1' as const;
const PERSISTED_GO_AUTHORITY = 'PERSISTED_SIGNED_SHARED_BETA_GO_V1' as const;
const ACTIVATION_OPERATION = 'ACTIVATE_AND_RELEASE_OWNER_INVITE' as const;
const INITIAL_OWNER_TEMPLATE = 'INITIAL_OWNER_INVITE' as const;
const ACTIVE_STATUS = 'ACTIVE' as const;
const OWNER_INVITED_STATUS = 'OWNER_INVITED' as const;
const PENDING_STATUS = 'PENDING' as const;
const MINIMUM_INVITE_LIFETIME_MS = 15 * 60 * 1_000;
const MAXIMUM_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const TOP_LEVEL_FIELDS = new Set(['shell', 'activation']);
const ACTIVATION_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'tenantId',
  'tenantSlug',
  'expectedExecutionRevision',
  'expectedEntitlementProfileRevision',
  'inviteExpiresAt',
  'goEvidence',
]);
const GO_EVIDENCE_FIELDS = new Set([
  'authority',
  'admissionDecisionId',
  'deploymentMarkerId',
]);

export const SHARED_BETA_ACTIVATION_TRANSACTION_OPTIONS = Object.freeze({
  maxWait: 5_000,
  timeout: 15_000,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
});

export const SHARED_BETA_DORMANT_COORDINATOR_POLICY = Object.freeze({
  enabled: false,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
  lostResponseRetries: 1 as const,
});

export type SharedBetaDormantCoordinatorPolicy = Readonly<{
  enabled: boolean;
  executionMode: 'DORMANT_TEST_ONLY';
  environment: 'test' | 'ci';
  lostResponseRetries: 0 | 1;
}>;

type ParsedActivation = {
  confirmation: string;
  requestId: string;
  reason: string;
  supportTicket: string | null;
  tenantId: string;
  tenantSlug: string;
  expectedExecutionRevision: number;
  expectedEntitlementProfileRevision: number;
  inviteExpiresAt: Date;
  goEvidence: {
    authority: typeof PERSISTED_GO_AUTHORITY;
    admissionDecisionId: string;
    deploymentMarkerId: string;
  };
};

export type SharedBetaActivationDriverInput = Readonly<{
  activationCommandId: string;
  tenantId: string;
  activationRequestId: string;
  activationRequestDigest: string;
  admissionDecisionId: string;
  deploymentMarkerId: string;
  activatedByUserId: string;
  issueRequestId: string;
  issueRequestDigest: string;
  issueCommandId: string;
  inviteId: string;
  outboxId: string;
  messageKey: string;
  tokenHash: string;
  secretCiphertext: Buffer;
  inviteExpiresAt: Date;
}>;

export type SharedBetaActivationDriverReceipt = Readonly<{
  schemaVersion: 1;
  operation: typeof ACTIVATION_OPERATION;
  decision: 'ACTIVATED' | 'REPLAYED';
  tenantId: string;
  activationCommandId: string;
  admissionDecisionId: string;
  markerId: string;
  markerGeneration: number;
  tenantStatus: typeof ACTIVE_STATUS;
  onboardingStatus: typeof OWNER_INVITED_STATUS;
  executionRevision: number;
  trialStartsAtEpochMs: number;
  trialEndsAtEpochMs: number;
  inviteId: string;
  outboxId: string;
  outboxStatus: typeof PENDING_STATUS;
  createdTransactionId: string;
}>;

export interface SharedBetaActivationDriver {
  activate(
    input: SharedBetaActivationDriverInput,
  ): Promise<SharedBetaActivationDriverReceipt>;
}

export interface SharedBetaInitialOwnerEnvelope {
  sealInitialOwnerInviteToken(binding: {
    tenantId: string;
    workflowLocator: string;
    inviteId: string;
    outboxId: string;
    template: typeof INITIAL_OWNER_TEMPLATE;
    messageKey: string;
    requestDigest: string;
    recipientEmail: string;
    expiresAt: Date;
  }): {
    tokenHash: string;
    digestVersion: 'sha256-v1';
    secretCiphertext: Buffer;
    envelopeVersion: 1;
    keyVersion: 'v1';
    aadEnvironment: string;
  };
}

export type SharedBetaInitialOwnerCoordinatorResult = Readonly<{
  ok: true;
  coordinatorContract: typeof COORDINATOR_CONTRACT;
  decision: 'ACTIVATED' | 'REPLAYED';
  replayed: boolean;
  shellReplayed: boolean;
  tenant: {
    id: string;
    slug: string;
    status: typeof ACTIVE_STATUS;
    onboardingStatus: typeof OWNER_INVITED_STATUS;
    executionRevision: number;
    trialStartsAt: string;
    trialEndsAt: string;
  };
  ownerInvite: {
    id: string;
    deliveryStatus: typeof PENDING_STATUS;
  };
  authority: {
    admissionDecisionId: string;
    deploymentMarkerId: string;
  };
}>;

/**
 * Exact adapter for the owner-only activation RPC. It is intentionally not a
 * Nest provider: a future production composition must supply a dedicated,
 * attested coordinator-role connection instead of the normal application
 * Prisma connection.
 */
export class PrismaSharedBetaActivationDriver implements SharedBetaActivationDriver {
  constructor(
    private readonly coordinatorDatabase: Pick<PrismaService, '$transaction'>,
  ) {}

  async activate(
    input: SharedBetaActivationDriverInput,
  ): Promise<SharedBetaActivationDriverReceipt> {
    return this.coordinatorDatabase.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
        Prisma.sql`
          SELECT public."shared_beta_tenant_activate_v1"(
            ${input.activationCommandId}::TEXT,
            ${input.tenantId}::TEXT,
            ${input.activationRequestId}::TEXT,
            ${input.activationRequestDigest}::TEXT,
            ${input.admissionDecisionId}::TEXT,
            ${input.deploymentMarkerId}::TEXT,
            ${input.activatedByUserId}::TEXT,
            ${input.issueRequestId}::TEXT,
            ${input.issueRequestDigest}::TEXT,
            ${input.issueCommandId}::TEXT,
            ${input.inviteId}::TEXT,
            ${input.outboxId}::TEXT,
            ${input.messageKey}::TEXT,
            ${input.tokenHash}::TEXT,
            ${input.secretCiphertext}::BYTEA,
            ${input.inviteExpiresAt}::TIMESTAMP(3) WITH TIME ZONE
          ) AS receipt
        `,
      );
      if (rows.length !== 1) {
        throw invalidActivationReceipt();
      }
      return parseActivationReceipt(rows[0]?.receipt);
    }, SHARED_BETA_ACTIVATION_TRANSACTION_OPTIONS);
  }
}

/**
 * Bounded application orchestration for BETA-IAM-004L. This class is dormant:
 * it is not registered in AdminModule, its controller route remains a hard
 * 503, and its policy has no production execution mode.
 */
export class SharedBetaInitialOwnerCoordinator {
  constructor(
    private readonly shellProvisioning: SharedTenantProvisioningService,
    private readonly activationDriver: SharedBetaActivationDriver,
    private readonly secretEnvelope: SharedBetaInitialOwnerEnvelope,
    private readonly policy: SharedBetaDormantCoordinatorPolicy = SHARED_BETA_DORMANT_COORDINATOR_POLICY,
    private readonly clock: () => Date = () => new Date(),
    private readonly uuidFactory: () => string = randomUUID,
  ) {}

  async coordinate(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<SharedBetaInitialOwnerCoordinatorResult> {
    this.assertDormantExecutionPolicy();
    this.assertPlatformAdmin(actor);
    const expectedTenantId = this.requiredUuid(routeTenantId, 'routeTenantId');
    const command = this.parseCommand(body);
    if (command.activation.tenantId !== expectedTenantId) {
      throw new BadRequestException({
        message: 'Shared beta activation tenant binding is invalid',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_TENANT_BINDING_INVALID',
      });
    }
    const canonicalOwnerEmail = this.ownerEmailFromShell(command.shell);
    this.assertOwnerIdentityNotCopiedIntoActivation(
      canonicalOwnerEmail,
      command.activation,
    );

    const shell = await this.shellForActivation(actor, command.shell);
    this.assertShellMatchesActivation(shell, command.activation);

    const activationRequestDigest = this.digest({
      coordinatorContract: COORDINATOR_CONTRACT,
      operation: ACTIVATION_OPERATION,
      requestId: command.activation.requestId,
      tenantId: command.activation.tenantId,
      tenantSlug: command.activation.tenantSlug,
      activatedByUserId: actor.id,
      expectedExecutionRevision: command.activation.expectedExecutionRevision,
      expectedEntitlementProfileRevision:
        command.activation.expectedEntitlementProfileRevision,
      admissionDecisionId: command.activation.goEvidence.admissionDecisionId,
      deploymentMarkerId: command.activation.goEvidence.deploymentMarkerId,
      goAuthority: command.activation.goEvidence.authority,
      shellProfileVersion: shell.profileVersion,
      workflowLocator: shell.ownerIdentity.reservationId,
      reservationClaimRevision: shell.ownerIdentity.claimRevision,
      reasonDigest: this.textDigest(
        'activation-reason',
        command.activation.reason,
      ),
      supportTicketDigest: command.activation.supportTicket
        ? this.textDigest(
            'activation-support-ticket',
            command.activation.supportTicket,
          )
        : null,
    });
    const issueRequestId = this.derivedUuid(
      'initial-owner-issue-request',
      command.activation.tenantId,
      command.activation.requestId,
    );
    const issueRequestDigest = this.digest({
      coordinatorContract: COORDINATOR_CONTRACT,
      operation: 'ISSUE_INITIAL_OWNER_INVITE',
      activationRequestId: command.activation.requestId,
      activationRequestDigest,
      tenantId: command.activation.tenantId,
      workflowLocator: shell.ownerIdentity.reservationId,
      reservationSubjectId: shell.ownerIdentity.reservationId,
      expectedClaimRevision: shell.ownerIdentity.claimRevision,
      admissionDecisionId: command.activation.goEvidence.admissionDecisionId,
      deploymentMarkerId: command.activation.goEvidence.deploymentMarkerId,
    });

    const identifiers = this.candidateIdentifiers();
    const sealed = this.secretEnvelope.sealInitialOwnerInviteToken({
      tenantId: command.activation.tenantId,
      workflowLocator: shell.ownerIdentity.reservationId,
      inviteId: identifiers.inviteId,
      outboxId: identifiers.outboxId,
      template: INITIAL_OWNER_TEMPLATE,
      messageKey: identifiers.messageKey,
      requestDigest: issueRequestDigest,
      recipientEmail: canonicalOwnerEmail,
      expiresAt: command.activation.inviteExpiresAt,
    });

    try {
      this.assertSealedEnvelope(sealed);
      const driverInput: SharedBetaActivationDriverInput = Object.freeze({
        activationCommandId: identifiers.activationCommandId,
        tenantId: command.activation.tenantId,
        activationRequestId: command.activation.requestId,
        activationRequestDigest,
        admissionDecisionId: command.activation.goEvidence.admissionDecisionId,
        deploymentMarkerId: command.activation.goEvidence.deploymentMarkerId,
        activatedByUserId: actor.id,
        issueRequestId,
        issueRequestDigest,
        issueCommandId: identifiers.issueCommandId,
        inviteId: identifiers.inviteId,
        outboxId: identifiers.outboxId,
        messageKey: identifiers.messageKey,
        tokenHash: sealed.tokenHash,
        secretCiphertext: sealed.secretCiphertext,
        inviteExpiresAt: command.activation.inviteExpiresAt,
      });
      const receipt = await this.activateWithBoundedReplay(driverInput);
      this.assertReceiptBinding(receipt, driverInput);
      return this.result(shell, command.activation.tenantSlug, receipt);
    } finally {
      sealed.secretCiphertext.fill(0);
    }
  }

  private async activateWithBoundedReplay(
    input: SharedBetaActivationDriverInput,
  ): Promise<SharedBetaActivationDriverReceipt> {
    for (
      let attempt = 0;
      attempt <= this.policy.lostResponseRetries;
      attempt += 1
    ) {
      try {
        return await this.activationDriver.activate(input);
      } catch (error) {
        if (!this.ambiguousActivationFailure(error)) {
          throw this.safeActivationFailure(error);
        }
        if (attempt === this.policy.lostResponseRetries) {
          throw new ServiceUnavailableException({
            message: 'Shared beta activation requires reconciliation',
            reasonCode:
              'SHARED_BETA_INITIAL_OWNER_ACTIVATION_RECONCILIATION_REQUIRED',
          });
        }
      }
    }
    throw new ServiceUnavailableException({
      message: 'Shared beta activation requires reconciliation',
      reasonCode:
        'SHARED_BETA_INITIAL_OWNER_ACTIVATION_RECONCILIATION_REQUIRED',
    });
  }

  private async shellForActivation(
    actor: AuthenticatedUser,
    shellCommand: unknown,
  ): Promise<ShellProvisioningResult> {
    try {
      return await this.shellProvisioning.provision(actor, shellCommand);
    } catch (error) {
      if (!this.progressedShellReplayRequired(error)) {
        throw error;
      }
      return this.shellProvisioning.recoverProtectedActivationShell(
        actor,
        shellCommand,
      );
    }
  }

  private progressedShellReplayRequired(error: unknown): boolean {
    if (!(error instanceof ConflictException)) {
      return false;
    }
    const response = error.getResponse();
    return (
      record(response) &&
      response.reasonCode === 'IDENTITY_CLAIM_STATE_MISMATCH'
    );
  }

  private safeActivationFailure(error: unknown): Error {
    const sqlState = this.sqlState(error);
    if (sqlState === '23505') {
      return new ConflictException({
        message: 'Shared beta activation request conflicts with existing state',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTIVATION_CONFLICT',
      });
    }
    if (sqlState === '22023') {
      return new BadRequestException({
        message: 'Shared beta activation command is invalid',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTIVATION_INVALID',
      });
    }
    if (sqlState === '23503' || sqlState === '23514' || sqlState === '25001') {
      return new ConflictException({
        message: 'Shared beta activation preconditions are not satisfied',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTIVATION_PRECONDITION_FAILED',
      });
    }
    if (sqlState === '42501') {
      return new ServiceUnavailableException({
        message: 'Shared beta activation boundary is not enrolled',
        reasonCode:
          'SHARED_BETA_INITIAL_OWNER_ACTIVATION_BOUNDARY_NOT_ENROLLED',
      });
    }
    return new ServiceUnavailableException({
      message: 'Shared beta activation failed closed',
      reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTIVATION_CONTAINED',
    });
  }

  private ambiguousActivationFailure(error: unknown): boolean {
    if (error instanceof ServiceUnavailableException) {
      const response = error.getResponse();
      if (
        record(response) &&
        response.reasonCode === 'SHARED_BETA_ACTIVATION_RECEIPT_INVALID'
      ) {
        return true;
      }
    }
    const code = this.errorCode(error);
    const sqlState = this.sqlState(error);
    return (
      code === 'P1001' ||
      code === 'P1002' ||
      code === 'P1008' ||
      code === 'P1017' ||
      code === 'P2024' ||
      code === 'P2034' ||
      sqlState?.startsWith('08') === true ||
      sqlState === '40001' ||
      sqlState === '40P01' ||
      sqlState === '55P03' ||
      sqlState === '57014'
    );
  }

  private assertDormantExecutionPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.policy.enabled !== true ||
      this.policy.executionMode !== 'DORMANT_TEST_ONLY' ||
      !['test', 'ci'].includes(this.policy.environment) ||
      ![0, 1].includes(this.policy.lostResponseRetries)
    ) {
      throw new ServiceUnavailableException({
        message: 'Shared beta initial-owner coordinator is dormant',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_COORDINATOR_DORMANT',
      });
    }
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    if (!this.uuid(actor.id)) {
      throw new BadRequestException({
        message: 'Shared beta activation actor is invalid',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_ACTOR_INVALID',
      });
    }
  }

  private parseCommand(body: unknown): {
    shell: unknown;
    activation: ParsedActivation;
  } {
    if (!record(body) || !hasAllowedKeys(body, TOP_LEVEL_FIELDS)) {
      throw invalidCoordinatorCommand();
    }
    if (!record(body.shell) || !record(body.activation)) {
      throw invalidCoordinatorCommand();
    }
    if (!hasAllowedKeys(body.activation, ACTIVATION_FIELDS)) {
      throw invalidCoordinatorCommand();
    }
    const input = body.activation;
    if (!record(input.goEvidence)) {
      throw invalidCoordinatorCommand();
    }
    if (!hasExactKeys(input.goEvidence, GO_EVIDENCE_FIELDS)) {
      throw invalidCoordinatorCommand();
    }
    const tenantId = this.requiredUuid(input.tenantId, 'tenantId');
    const tenantSlug = this.requiredText(input.tenantSlug, 'tenantSlug', 3, 63);
    if (
      tenantSlug !== tenantSlug.toLowerCase() ||
      !TENANT_SLUG_PATTERN.test(tenantSlug)
    ) {
      throw invalidCoordinatorCommand();
    }
    const requestId = this.requiredUuid(input.requestId, 'requestId');
    const reason = this.requiredText(input.reason, 'reason', 10, 500);
    const supportTicket = this.optionalText(
      input.supportTicket,
      'supportTicket',
      200,
    );
    const expectedExecutionRevision = this.revision(
      input.expectedExecutionRevision,
      'expectedExecutionRevision',
      0,
    );
    const expectedEntitlementProfileRevision = this.revision(
      input.expectedEntitlementProfileRevision,
      'expectedEntitlementProfileRevision',
      1,
    );
    const inviteExpiresAt = this.futureTimestamp(input.inviteExpiresAt);
    const confirmation = this.requiredText(
      input.confirmation,
      'confirmation',
      1,
      120,
    );
    if (confirmation !== `ACTIVATE ${tenantSlug}`) {
      throw new BadRequestException(
        `confirmation must exactly equal "ACTIVATE ${tenantSlug}"`,
      );
    }
    const goEvidence = input.goEvidence;
    if (goEvidence.authority !== PERSISTED_GO_AUTHORITY) {
      throw invalidCoordinatorCommand();
    }
    return {
      shell: body.shell,
      activation: {
        confirmation,
        requestId,
        reason,
        supportTicket,
        tenantId,
        tenantSlug,
        expectedExecutionRevision,
        expectedEntitlementProfileRevision,
        inviteExpiresAt,
        goEvidence: {
          authority: PERSISTED_GO_AUTHORITY,
          admissionDecisionId: this.requiredUuid(
            goEvidence.admissionDecisionId,
            'admissionDecisionId',
          ),
          deploymentMarkerId: this.requiredUuid(
            goEvidence.deploymentMarkerId,
            'deploymentMarkerId',
          ),
        },
      },
    };
  }

  private ownerEmailFromShell(shell: unknown): string {
    if (!record(shell) || typeof shell.ownerEmail !== 'string') {
      throw invalidCoordinatorCommand();
    }
    if (!/^[ -~]+$/u.test(shell.ownerEmail)) {
      throw invalidCoordinatorCommand();
    }
    const canonical = shell.ownerEmail.trim().toLowerCase();
    if (!isCanonicalIdentityEmail(canonical)) {
      throw invalidCoordinatorCommand();
    }
    return canonical;
  }

  private assertShellMatchesActivation(
    shell: ShellProvisioningResult,
    activation: ParsedActivation,
  ): void {
    const modules = Array.isArray(shell.modules) ? shell.modules : [];
    const expectedModules = new Set(COMPLETE_TENANT_MODULE_PROFILE);
    const actualModules = new Set(modules.map((entry) => entry.module));
    if (
      shell.ok !== true ||
      shell.activationRequired !== true ||
      shell.tenant.id !== activation.tenantId ||
      shell.tenant.slug !== activation.tenantSlug ||
      shell.tenant.executionRevision !== activation.expectedExecutionRevision ||
      shell.tenant.profileRevision !==
        activation.expectedEntitlementProfileRevision ||
      shell.tenant.status !== 'SUSPENDED' ||
      shell.tenant.onboardingStatus !== 'PROVISIONING' ||
      shell.tenant.trialStartsAt !== null ||
      shell.tenant.trialEndsAt !== null ||
      shell.store.isActive !== false ||
      shell.store.gamificationEnabled !== false ||
      shell.store.backgroundExecutionEnabled !== false ||
      shell.ownerIdentity.claimType !== 'INVITE' ||
      shell.ownerIdentity.claimRevision !== 1 ||
      !this.uuid(shell.ownerIdentity.reservationId) ||
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      actualModules.size !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some(
        (module) => !actualModules.has(module),
      ) ||
      modules.some(
        (entry) =>
          !expectedModules.has(entry.module) ||
          entry.readEnabled !== true ||
          entry.writeEnabled !== true ||
          entry.outboundEnabled !== false ||
          entry.profileRevision !== 1,
      )
    ) {
      throw new ConflictException({
        message: 'Shared beta shell does not match activation authority',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_SHELL_MISMATCH',
      });
    }
  }

  private candidateIdentifiers(): {
    activationCommandId: string;
    issueCommandId: string;
    inviteId: string;
    outboxId: string;
    messageKey: string;
  } {
    const values = Array.from({ length: 5 }, () =>
      this.requiredUuid(this.uuidFactory(), 'generatedId'),
    );
    if (new Set(values).size !== values.length) {
      throw new ServiceUnavailableException({
        message: 'Shared beta activation identifier generation failed',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_IDENTIFIER_GENERATION_FAILED',
      });
    }
    const [
      activationCommandId,
      issueCommandId,
      inviteId,
      outboxId,
      messageKey,
    ] = values;
    if (
      !activationCommandId ||
      !issueCommandId ||
      !inviteId ||
      !outboxId ||
      !messageKey
    ) {
      throw new ServiceUnavailableException({
        message: 'Shared beta activation identifier generation failed',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_IDENTIFIER_GENERATION_FAILED',
      });
    }
    return {
      activationCommandId,
      issueCommandId,
      inviteId,
      outboxId,
      messageKey,
    };
  }

  private assertSealedEnvelope(sealed: {
    tokenHash: string;
    digestVersion: string;
    secretCiphertext: Buffer;
    envelopeVersion: number;
    keyVersion: string;
    aadEnvironment: string;
  }): void {
    if (
      !SHA256_PATTERN.test(sealed.tokenHash) ||
      sealed.digestVersion !== 'sha256-v1' ||
      !Buffer.isBuffer(sealed.secretCiphertext) ||
      sealed.secretCiphertext.length !== 71 ||
      sealed.envelopeVersion !== 1 ||
      sealed.keyVersion !== 'v1' ||
      typeof sealed.aadEnvironment !== 'string' ||
      sealed.aadEnvironment.length < 1
    ) {
      sealed.secretCiphertext?.fill(0);
      throw new ServiceUnavailableException({
        message: 'Shared beta initial-owner secret envelope is invalid',
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_SECRET_ENVELOPE_INVALID',
      });
    }
  }

  private assertReceiptBinding(
    receipt: SharedBetaActivationDriverReceipt,
    input: SharedBetaActivationDriverInput,
  ): void {
    if (
      receipt.tenantId !== input.tenantId ||
      receipt.admissionDecisionId !== input.admissionDecisionId ||
      receipt.markerId !== input.deploymentMarkerId ||
      (receipt.decision === 'ACTIVATED' &&
        (receipt.activationCommandId !== input.activationCommandId ||
          receipt.inviteId !== input.inviteId ||
          receipt.outboxId !== input.outboxId))
    ) {
      throw invalidActivationReceipt();
    }
  }

  private assertOwnerIdentityNotCopiedIntoActivation(
    canonicalOwnerEmail: string,
    activation: ParsedActivation,
  ): void {
    if (
      [activation.reason, activation.supportTicket].some((value) =>
        value?.toLowerCase().includes(canonicalOwnerEmail),
      )
    ) {
      throw new BadRequestException({
        message: 'Owner identity must not be copied into activation metadata',
        reasonCode: 'SHARED_BETA_OWNER_IDENTITY_METADATA_FORBIDDEN',
      });
    }
  }

  private result(
    shell: ShellProvisioningResult,
    tenantSlug: string,
    receipt: SharedBetaActivationDriverReceipt,
  ): SharedBetaInitialOwnerCoordinatorResult {
    return {
      ok: true,
      coordinatorContract: COORDINATOR_CONTRACT,
      decision: receipt.decision,
      replayed: receipt.decision === 'REPLAYED',
      shellReplayed: shell.replayed,
      tenant: {
        id: receipt.tenantId,
        slug: tenantSlug,
        status: ACTIVE_STATUS,
        onboardingStatus: OWNER_INVITED_STATUS,
        executionRevision: receipt.executionRevision,
        trialStartsAt: new Date(receipt.trialStartsAtEpochMs).toISOString(),
        trialEndsAt: new Date(receipt.trialEndsAtEpochMs).toISOString(),
      },
      ownerInvite: {
        id: receipt.inviteId,
        deliveryStatus: PENDING_STATUS,
      },
      authority: {
        admissionDecisionId: receipt.admissionDecisionId,
        deploymentMarkerId: receipt.markerId,
      },
    };
  }

  private futureTimestamp(value: unknown): Date {
    if (typeof value !== 'string' || !CANONICAL_TIMESTAMP_PATTERN.test(value)) {
      throw invalidCoordinatorCommand();
    }
    const parsed = new Date(value);
    const now = this.clock();
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString() !== value ||
      !Number.isFinite(now.getTime()) ||
      parsed.getTime() < now.getTime() + MINIMUM_INVITE_LIFETIME_MS ||
      parsed.getTime() > now.getTime() + MAXIMUM_INVITE_LIFETIME_MS
    ) {
      throw invalidCoordinatorCommand();
    }
    return parsed;
  }

  private revision(value: unknown, field: string, minimum: number): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minimum
    ) {
      throw new BadRequestException(`${field} must be a valid revision`);
    }
    return value;
  }

  private requiredUuid(value: unknown, field: string): string {
    if (!this.uuid(value)) {
      throw new BadRequestException(`${field} must be a canonical UUID`);
    }
    return value;
  }

  private requiredText(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length < minimum || trimmed.length > maximum) {
      throw new BadRequestException(
        `${field} must contain ${minimum}-${maximum} characters`,
      );
    }
    return trimmed;
  }

  private optionalText(
    value: unknown,
    field: string,
    maximum: number,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return this.requiredText(value, field, 1, maximum);
  }

  private uuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }

  private digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private textDigest(domain: string, value: string): string {
    return createHash('sha256')
      .update(COORDINATOR_CONTRACT)
      .update('\0')
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }

  private derivedUuid(domain: string, ...parts: string[]): string {
    const bytes = createHash('sha256')
      .update(COORDINATOR_CONTRACT)
      .update('\0')
      .update(domain)
      .update('\0')
      .update(parts.join('\0'))
      .digest()
      .subarray(0, 16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private errorCode(error: unknown): string | null {
    return record(error) && typeof error.code === 'string' ? error.code : null;
  }

  private sqlState(error: unknown): string | null {
    const code = this.errorCode(error);
    if (
      code === 'P2010' &&
      record(error) &&
      record(error.meta) &&
      typeof error.meta.code === 'string' &&
      /^[0-9A-Z]{5}$/u.test(error.meta.code)
    ) {
      return error.meta.code;
    }
    return code && /^[0-9A-Z]{5}$/u.test(code) ? code : null;
  }
}

function parseActivationReceipt(
  value: Prisma.JsonValue | undefined,
): SharedBetaActivationDriverReceipt {
  if (!record(value)) {
    throw invalidActivationReceipt();
  }
  const expectedFields = new Set([
    'schemaVersion',
    'operation',
    'decision',
    'tenantId',
    'activationCommandId',
    'admissionDecisionId',
    'markerId',
    'markerGeneration',
    'tenantStatus',
    'onboardingStatus',
    'executionRevision',
    'trialStartsAtEpochMs',
    'trialEndsAtEpochMs',
    'inviteId',
    'outboxId',
    'outboxStatus',
    'createdTransactionId',
  ]);
  if (!hasExactKeys(value, expectedFields)) {
    throw invalidActivationReceipt();
  }
  if (
    value.schemaVersion !== 1 ||
    value.operation !== ACTIVATION_OPERATION ||
    (value.decision !== 'ACTIVATED' && value.decision !== 'REPLAYED') ||
    !uuid(value.tenantId) ||
    !uuid(value.activationCommandId) ||
    !uuid(value.admissionDecisionId) ||
    !uuid(value.markerId) ||
    !positiveSafeInteger(value.markerGeneration) ||
    value.tenantStatus !== ACTIVE_STATUS ||
    value.onboardingStatus !== OWNER_INVITED_STATUS ||
    !positiveSafeInteger(value.executionRevision) ||
    !positiveSafeInteger(value.trialStartsAtEpochMs) ||
    !positiveSafeInteger(value.trialEndsAtEpochMs) ||
    value.trialEndsAtEpochMs <= value.trialStartsAtEpochMs ||
    !Number.isFinite(new Date(value.trialStartsAtEpochMs).getTime()) ||
    !Number.isFinite(new Date(value.trialEndsAtEpochMs).getTime()) ||
    !uuid(value.inviteId) ||
    !uuid(value.outboxId) ||
    value.outboxStatus !== PENDING_STATUS ||
    typeof value.createdTransactionId !== 'string' ||
    !/^[1-9][0-9]*$/u.test(value.createdTransactionId)
  ) {
    throw invalidActivationReceipt();
  }
  return {
    schemaVersion: 1,
    operation: ACTIVATION_OPERATION,
    decision: value.decision,
    tenantId: value.tenantId,
    activationCommandId: value.activationCommandId,
    admissionDecisionId: value.admissionDecisionId,
    markerId: value.markerId,
    markerGeneration: value.markerGeneration,
    tenantStatus: ACTIVE_STATUS,
    onboardingStatus: OWNER_INVITED_STATUS,
    executionRevision: value.executionRevision,
    trialStartsAtEpochMs: value.trialStartsAtEpochMs,
    trialEndsAtEpochMs: value.trialEndsAtEpochMs,
    inviteId: value.inviteId,
    outboxId: value.outboxId,
    outboxStatus: PENDING_STATUS,
    createdTransactionId: value.createdTransactionId,
  };
}

function invalidCoordinatorCommand(): BadRequestException {
  return new BadRequestException({
    message: 'Shared beta initial-owner coordinator command is invalid',
    reasonCode: 'SHARED_BETA_INITIAL_OWNER_COORDINATOR_COMMAND_INVALID',
  });
}

function invalidActivationReceipt(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Shared beta activation receipt is invalid',
    reasonCode: 'SHARED_BETA_ACTIVATION_RECEIPT_INVALID',
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.size && keys.every((key) => expected.has(key))
  );
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
