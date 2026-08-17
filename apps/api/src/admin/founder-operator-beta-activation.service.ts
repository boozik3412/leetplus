import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { IdentityMailSecretEnvelopeService } from '../auth/identity-mail-secret-envelope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  resolveFounderOperatorBetaMode,
  resolveIdentityMailAadEnvironment,
} from '../config/environment-validation';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';
import { FOUNDER_OPERATOR_BETA_GO_CONTRACT } from './founder-operator-beta-go.service';
import {
  FounderOperatorBetaActivationDatabaseService,
  type FounderOperatorBetaActivationTransactionClient,
} from './founder-operator-beta-activation.database';
import type {
  SharedTenantProvisioningService,
  ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

export const FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT =
  'FOUNDER_OPERATOR_BETA_ACTIVATION_V2' as const;
const OPERATION = 'ACTIVATE_AND_RELEASE_OWNER_INVITE' as const;
const OWNER_TEMPLATE = 'INITIAL_OWNER_INVITE' as const;
const MINIMUM_INVITE_LIFETIME_MS = 15 * 60 * 1_000;
const MAXIMUM_INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const TOP_LEVEL_FIELDS = new Set(['shell', 'activation']);
const ACTIVATION_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'tenantId',
  'tenantSlug',
  'goId',
  'expectedExecutionRevision',
  'expectedEntitlementProfileRevision',
  'inviteExpiresAt',
]);

export const FOUNDER_OPERATOR_BETA_ACTIVATION_TRANSACTION_OPTIONS =
  Object.freeze({
    maxWait: 5_000,
    timeout: 15_000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

type ParsedActivation = Readonly<{
  requestId: string;
  reason: string;
  supportTicket: string | null;
  tenantId: string;
  tenantSlug: string;
  goId: string;
  expectedExecutionRevision: number;
  expectedEntitlementProfileRevision: number;
  inviteExpiresAt: Date;
}>;

type ActivationDriverInput = Readonly<{
  activationCommandId: string;
  goId: string;
  tenantId: string;
  activationRequestId: string;
  activationRequestDigest: string;
  releaseSha: string;
  environment: string;
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

type ActivationReceipt = Readonly<{
  schemaVersion: 2;
  operation: typeof OPERATION;
  decision: 'ACTIVATED' | 'REPLAYED';
  tenantId: string;
  activationCommandId: string;
  goId: string;
  releaseSha: string;
  environment: string;
  tenantStatus: 'ACTIVE';
  onboardingStatus: 'OWNER_INVITED';
  executionRevision: number;
  trialStartsAtEpochMs: number;
  trialEndsAtEpochMs: number;
  inviteId: string;
  outboxId: string;
  outboxStatus: 'PENDING';
  createdTransactionId: string;
}>;

export type FounderOperatorBetaActivationResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT;
  decision: 'ACTIVATED' | 'REPLAYED';
  replayed: boolean;
  shellReplayed: boolean;
  tenant: {
    id: string;
    slug: string;
    status: 'ACTIVE';
    onboardingStatus: 'OWNER_INVITED';
    executionRevision: number;
    trialStartsAt: string;
    trialEndsAt: string;
  };
  ownerInvite: {
    id: string;
    deliveryStatus: 'PENDING';
  };
  authority: {
    goId: string;
    releaseSha: string;
    environment: string;
  };
}>;

@Injectable()
export class FounderOperatorBetaActivationService {
  constructor(
    @Inject(FounderOperatorBetaActivationDatabaseService)
    private readonly prisma: FounderOperatorBetaActivationTransactionClient,
    private readonly config: ConfigService,
    private readonly shellProvisioning: SharedTenantProvisioningService,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly uuidFactory: () => string = randomUUID,
  ) {}

  async activate(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<FounderOperatorBetaActivationResult> {
    this.assertActiveMode();
    this.assertPlatformAdministrator(actor);
    const tenantId = this.uuid(routeTenantId, 'routeTenantId');
    const command = this.parseCommand(body);
    if (command.activation.tenantId !== tenantId) {
      throw invalidActivationCommand(
        'FOUNDER_OPERATOR_BETA_ACTIVATION_TENANT_BINDING_INVALID',
      );
    }
    const ownerEmail = this.ownerEmail(command.shell);
    this.assertOwnerIdentityNotCopiedIntoMetadata(
      ownerEmail,
      command.activation,
    );

    const shell = await this.shellForActivation(actor, command.shell);
    this.assertShell(shell, command.activation);
    const releaseSha = this.releaseSha();
    const environment = this.environment();
    const activationRequestDigest = this.digest('founder-beta-activation', {
      contractVersion: FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT,
      goAuthority: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      operation: OPERATION,
      requestId: command.activation.requestId,
      goId: command.activation.goId,
      tenantId,
      tenantSlug: command.activation.tenantSlug,
      releaseSha,
      environment,
      activatedByUserId: actor.id,
      expectedExecutionRevision: command.activation.expectedExecutionRevision,
      expectedEntitlementProfileRevision:
        command.activation.expectedEntitlementProfileRevision,
      workflowLocator: shell.ownerIdentity.reservationId,
      reservationClaimRevision: shell.ownerIdentity.claimRevision,
      inviteExpiresAt: command.activation.inviteExpiresAt.toISOString(),
      reasonDigest: this.textDigest(
        'founder-beta-activation-reason',
        command.activation.reason,
      ),
      supportTicketDigest: command.activation.supportTicket
        ? this.textDigest(
            'founder-beta-activation-support-ticket',
            command.activation.supportTicket,
          )
        : null,
    });
    const issueRequestId = this.derivedUuid(
      'founder-initial-owner-issue',
      tenantId,
      command.activation.requestId,
      command.activation.goId,
    );
    const issueRequestDigest = this.digest('founder-owner-issue', {
      contractVersion: FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT,
      activationRequestId: command.activation.requestId,
      activationRequestDigest,
      goId: command.activation.goId,
      tenantId,
      workflowLocator: shell.ownerIdentity.reservationId,
      reservationSubjectId: shell.ownerIdentity.reservationId,
      reservationClaimRevision: shell.ownerIdentity.claimRevision,
      releaseSha,
      environment,
      inviteExpiresAt: command.activation.inviteExpiresAt.toISOString(),
    });
    const identifiers = this.candidateIdentifiers();
    const envelopeService = new IdentityMailSecretEnvelopeService(this.config);
    const sealed = envelopeService.sealInitialOwnerInviteToken({
      tenantId,
      workflowLocator: shell.ownerIdentity.reservationId,
      inviteId: identifiers.inviteId,
      outboxId: identifiers.outboxId,
      template: OWNER_TEMPLATE,
      messageKey: identifiers.messageKey,
      requestDigest: issueRequestDigest,
      recipientEmail: ownerEmail,
      expiresAt: command.activation.inviteExpiresAt,
    });

    try {
      const input: ActivationDriverInput = Object.freeze({
        activationCommandId: identifiers.activationCommandId,
        goId: command.activation.goId,
        tenantId,
        activationRequestId: command.activation.requestId,
        activationRequestDigest,
        releaseSha,
        environment,
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
      const receipt = await this.activateWithBoundedReplay(input);
      this.assertReceipt(receipt, input);
      return this.result(shell, command.activation.tenantSlug, receipt);
    } finally {
      sealed.secretCiphertext.fill(0);
    }
  }

  private async activateWithBoundedReplay(
    input: ActivationDriverInput,
  ): Promise<ActivationReceipt> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.callActivationRpc(input);
      } catch (error) {
        if (!this.ambiguousFailure(error)) {
          throw this.safeFailure(error);
        }
        if (attempt === 1) {
          throw new ServiceUnavailableException({
            message: 'Founder beta activation requires reconciliation',
            reasonCode:
              'FOUNDER_OPERATOR_BETA_ACTIVATION_RECONCILIATION_REQUIRED',
          });
        }
      }
    }
    throw new ServiceUnavailableException({
      message: 'Founder beta activation requires reconciliation',
      reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_RECONCILIATION_REQUIRED',
    });
  }

  private callActivationRpc(
    input: ActivationDriverInput,
  ): Promise<ActivationReceipt> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
        Prisma.sql`
          SELECT public."founder_operator_beta_tenant_activate_v2"(
            ${input.activationCommandId}::TEXT,
            ${input.goId}::TEXT,
            ${input.tenantId}::TEXT,
            ${input.activationRequestId}::TEXT,
            ${input.activationRequestDigest}::TEXT,
            ${input.releaseSha}::TEXT,
            ${input.environment}::TEXT,
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
      if (rows.length !== 1) throw invalidActivationReceipt();
      return parseActivationReceipt(rows[0]?.receipt);
    }, FOUNDER_OPERATOR_BETA_ACTIVATION_TRANSACTION_OPTIONS);
  }

  private async shellForActivation(
    actor: AuthenticatedUser,
    shellCommand: unknown,
  ): Promise<ShellProvisioningResult> {
    try {
      return await this.shellProvisioning.provision(actor, shellCommand);
    } catch (error) {
      if (!this.progressedShell(error)) throw error;
      return this.shellProvisioning.recoverProtectedActivationShell(
        actor,
        shellCommand,
      );
    }
  }

  private progressedShell(error: unknown): boolean {
    if (!(error instanceof ConflictException)) return false;
    const response = error.getResponse();
    return (
      record(response) &&
      [
        'IDENTITY_CLAIM_STATE_MISMATCH',
        'IDENTITY_CLAIM_PRECONDITION_FAILED',
      ].includes(String(response.reasonCode))
    );
  }

  private parseCommand(body: unknown): {
    shell: Record<string, unknown>;
    activation: ParsedActivation;
  } {
    if (!record(body) || !hasExactKeys(body, TOP_LEVEL_FIELDS)) {
      throw invalidActivationCommand();
    }
    if (!record(body.shell) || !record(body.activation)) {
      throw invalidActivationCommand();
    }
    if (!hasExactKeys(body.activation, ACTIVATION_FIELDS)) {
      throw invalidActivationCommand();
    }
    const input = body.activation;
    const tenantId = this.uuid(input.tenantId, 'tenantId');
    const tenantSlug = this.text(input.tenantSlug, 'tenantSlug', 3, 63);
    if (
      tenantSlug !== tenantSlug.toLowerCase() ||
      !TENANT_SLUG_PATTERN.test(tenantSlug)
    ) {
      throw invalidActivationCommand();
    }
    const confirmation = this.text(input.confirmation, 'confirmation', 1, 120);
    if (confirmation !== `ACTIVATE ${tenantSlug}`) {
      throw new BadRequestException(
        `confirmation must exactly equal "ACTIVATE ${tenantSlug}"`,
      );
    }
    return {
      shell: body.shell,
      activation: {
        requestId: this.uuid(input.requestId, 'requestId'),
        reason: this.text(input.reason, 'reason', 10, 500),
        supportTicket: this.optionalText(input.supportTicket, 200),
        tenantId,
        tenantSlug,
        goId: this.uuid(input.goId, 'goId'),
        expectedExecutionRevision: this.revision(
          input.expectedExecutionRevision,
          0,
        ),
        expectedEntitlementProfileRevision: this.revision(
          input.expectedEntitlementProfileRevision,
          1,
        ),
        inviteExpiresAt: this.futureTimestamp(input.inviteExpiresAt),
      },
    };
  }

  private assertShell(
    shell: ShellProvisioningResult,
    activation: ParsedActivation,
  ): void {
    const modules = Array.isArray(shell.modules) ? shell.modules : [];
    const actualModules = new Set(modules.map((entry) => entry.module));
    if (
      shell.ok !== true ||
      shell.activationRequired !== true ||
      shell.tenant.id !== activation.tenantId ||
      shell.tenant.slug !== activation.tenantSlug ||
      shell.tenant.status !== 'SUSPENDED' ||
      shell.tenant.onboardingStatus !== 'PROVISIONING' ||
      shell.tenant.trialStartsAt !== null ||
      shell.tenant.trialEndsAt !== null ||
      shell.tenant.executionRevision !== activation.expectedExecutionRevision ||
      shell.tenant.profileRevision !==
        activation.expectedEntitlementProfileRevision ||
      shell.store.isActive !== false ||
      shell.store.gamificationEnabled !== false ||
      shell.store.backgroundExecutionEnabled !== false ||
      shell.ownerIdentity.claimType !== 'INVITE' ||
      shell.ownerIdentity.claimRevision !== 1 ||
      !UUID_PATTERN.test(shell.ownerIdentity.reservationId) ||
      modules.length !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      actualModules.size !== COMPLETE_TENANT_MODULE_PROFILE.length ||
      COMPLETE_TENANT_MODULE_PROFILE.some(
        (module) => !actualModules.has(module),
      ) ||
      modules.some(
        (entry) =>
          entry.readEnabled !== true ||
          entry.writeEnabled !== true ||
          entry.outboundEnabled !== false ||
          entry.profileRevision !==
            activation.expectedEntitlementProfileRevision,
      )
    ) {
      throw new ConflictException({
        message: 'Founder beta shell does not match activation request',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_SHELL_MISMATCH',
      });
    }
  }

  private assertReceipt(
    receipt: ActivationReceipt,
    input: ActivationDriverInput,
  ): void {
    if (
      receipt.tenantId !== input.tenantId ||
      receipt.goId !== input.goId ||
      receipt.releaseSha !== input.releaseSha ||
      receipt.environment !== input.environment ||
      (receipt.decision === 'ACTIVATED' &&
        (receipt.activationCommandId !== input.activationCommandId ||
          receipt.inviteId !== input.inviteId ||
          receipt.outboxId !== input.outboxId))
    ) {
      throw invalidActivationReceipt();
    }
  }

  private result(
    shell: ShellProvisioningResult,
    tenantSlug: string,
    receipt: ActivationReceipt,
  ): FounderOperatorBetaActivationResult {
    return {
      ok: true,
      contractVersion: FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT,
      decision: receipt.decision,
      replayed: receipt.decision === 'REPLAYED',
      shellReplayed: shell.replayed,
      tenant: {
        id: receipt.tenantId,
        slug: tenantSlug,
        status: 'ACTIVE',
        onboardingStatus: 'OWNER_INVITED',
        executionRevision: receipt.executionRevision,
        trialStartsAt: new Date(receipt.trialStartsAtEpochMs).toISOString(),
        trialEndsAt: new Date(receipt.trialEndsAtEpochMs).toISOString(),
      },
      ownerInvite: {
        id: receipt.inviteId,
        deliveryStatus: 'PENDING',
      },
      authority: {
        goId: receipt.goId,
        releaseSha: receipt.releaseSha,
        environment: receipt.environment,
      },
    };
  }

  private assertActiveMode(): void {
    const mode = resolveFounderOperatorBetaMode(
      this.config.get<unknown>('FOUNDER_OPERATOR_BETA_MODE'),
    );
    if (mode !== 'ACTIVE') {
      throw new ServiceUnavailableException({
        message: 'Founder beta activation is disabled',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_DISABLED',
      });
    }
  }

  private assertPlatformAdministrator(actor: AuthenticatedUser): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    this.uuid(actor.id, 'actorId');
  }

  private releaseSha(): string {
    const value = this.config.get<string>('RELEASE_SHA')?.trim().toLowerCase();
    if (!value || !SHA1_PATTERN.test(value)) {
      throw new ServiceUnavailableException({
        message: 'Founder beta activation release SHA is unavailable',
        reasonCode: 'FOUNDER_OPERATOR_BETA_RELEASE_SHA_INVALID',
      });
    }
    return value;
  }

  private environment(): string {
    const value = resolveIdentityMailAadEnvironment(
      this.config.get<unknown>('IDENTITY_MAIL_AAD_ENVIRONMENT'),
    );
    if (!value) {
      throw new ServiceUnavailableException({
        message: 'Founder beta activation environment is unavailable',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ENVIRONMENT_INVALID',
      });
    }
    return value;
  }

  private ownerEmail(shell: Record<string, unknown>): string {
    if (typeof shell.ownerEmail !== 'string') throw invalidActivationCommand();
    const canonical = shell.ownerEmail.trim().toLowerCase();
    if (!isCanonicalIdentityEmail(canonical)) throw invalidActivationCommand();
    return canonical;
  }

  private assertOwnerIdentityNotCopiedIntoMetadata(
    ownerEmail: string,
    activation: ParsedActivation,
  ): void {
    if (
      [activation.reason, activation.supportTicket].some((value) =>
        value?.toLowerCase().includes(ownerEmail),
      )
    ) {
      throw new BadRequestException({
        message: 'Owner identity must not be copied into activation metadata',
        reasonCode: 'FOUNDER_OPERATOR_BETA_OWNER_IDENTITY_FORBIDDEN',
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
      this.uuid(this.uuidFactory(), 'generatedId'),
    );
    if (new Set(values).size !== values.length) {
      throw new ServiceUnavailableException({
        message: 'Founder beta activation identifier generation failed',
        reasonCode:
          'FOUNDER_OPERATOR_BETA_ACTIVATION_IDENTIFIER_GENERATION_FAILED',
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
        message: 'Founder beta activation identifier generation failed',
        reasonCode:
          'FOUNDER_OPERATOR_BETA_ACTIVATION_IDENTIFIER_GENERATION_FAILED',
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

  private futureTimestamp(value: unknown): Date {
    if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) {
      throw invalidActivationCommand();
    }
    const parsed = new Date(value);
    const now = this.clock();
    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString() !== value ||
      parsed.getTime() < now.getTime() + MINIMUM_INVITE_LIFETIME_MS ||
      parsed.getTime() > now.getTime() + MAXIMUM_INVITE_LIFETIME_MS
    ) {
      throw invalidActivationCommand();
    }
    return parsed;
  }

  private safeFailure(error: unknown): Error {
    const state = this.sqlState(error);
    if (state === '23505') {
      return new ConflictException({
        message: 'Founder beta activation conflicts with existing state',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_CONFLICT',
      });
    }
    if (state === '22023') return invalidActivationCommand();
    if (['23503', '23514', '25001', '40001', '55000'].includes(state ?? '')) {
      return new ConflictException({
        message: 'Founder beta activation preconditions are not satisfied',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_PRECONDITION_FAILED',
      });
    }
    if (state === '42501') {
      return new ServiceUnavailableException({
        message: 'Founder beta activation boundary is not enrolled',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_BOUNDARY_NOT_ENROLLED',
      });
    }
    return new ServiceUnavailableException({
      message: 'Founder beta activation failed closed',
      reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_CONTAINED',
    });
  }

  private ambiguousFailure(error: unknown): boolean {
    if (error instanceof ServiceUnavailableException) {
      const response = error.getResponse();
      if (
        record(response) &&
        response.reasonCode ===
          'FOUNDER_OPERATOR_BETA_ACTIVATION_RECEIPT_INVALID'
      ) {
        return true;
      }
    }
    const code = this.errorCode(error);
    const state = this.sqlState(error);
    return (
      ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034'].includes(
        code ?? '',
      ) ||
      state?.startsWith('08') === true ||
      ['40001', '40P01', '55P03', '57014'].includes(state ?? '')
    );
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

  private uuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${field} must be a canonical UUID`);
    }
    return value;
  }

  private revision(value: unknown, minimum: number): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < minimum
    ) {
      throw invalidActivationCommand();
    }
    return value;
  }

  private text(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): string {
    if (typeof value !== 'string' || value !== value.trim()) {
      throw invalidActivationCommand();
    }
    const bytes = Buffer.byteLength(value, 'utf8');
    const control = Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    });
    if (bytes < minimum || bytes > maximum || control) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return value;
  }

  private optionalText(value: unknown, maximum: number): string | null {
    if (value === null || value === undefined) return null;
    return this.text(value, 'supportTicket', 1, maximum);
  }

  private digest(domain: string, value: unknown): string {
    return createHash('sha256')
      .update(`${domain}\0${stableJson(value)}`, 'utf8')
      .digest('hex');
  }

  private textDigest(domain: string, value: string): string {
    return createHash('sha256')
      .update(`${domain}\0${value}`, 'utf8')
      .digest('hex');
  }

  private derivedUuid(domain: string, ...parts: string[]): string {
    const bytes = createHash('sha256')
      .update(`${FOUNDER_OPERATOR_BETA_ACTIVATION_CONTRACT}\0${domain}\0`)
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
}

function parseActivationReceipt(
  value: Prisma.JsonValue | undefined,
): ActivationReceipt {
  if (!record(value)) throw invalidActivationReceipt();
  const fields = new Set([
    'schemaVersion',
    'operation',
    'decision',
    'tenantId',
    'activationCommandId',
    'goId',
    'releaseSha',
    'environment',
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
  if (
    !hasExactKeys(value, fields) ||
    value.schemaVersion !== 2 ||
    value.operation !== OPERATION ||
    (value.decision !== 'ACTIVATED' && value.decision !== 'REPLAYED') ||
    !canonicalUuid(value.tenantId) ||
    !canonicalUuid(value.activationCommandId) ||
    !canonicalUuid(value.goId) ||
    typeof value.releaseSha !== 'string' ||
    !SHA1_PATTERN.test(value.releaseSha) ||
    typeof value.environment !== 'string' ||
    value.environment.length < 1 ||
    value.tenantStatus !== 'ACTIVE' ||
    value.onboardingStatus !== 'OWNER_INVITED' ||
    !positiveInteger(value.executionRevision) ||
    !positiveInteger(value.trialStartsAtEpochMs) ||
    !positiveInteger(value.trialEndsAtEpochMs) ||
    value.trialEndsAtEpochMs <= value.trialStartsAtEpochMs ||
    !canonicalUuid(value.inviteId) ||
    !canonicalUuid(value.outboxId) ||
    value.outboxStatus !== 'PENDING' ||
    typeof value.createdTransactionId !== 'string' ||
    !/^[1-9][0-9]*$/u.test(value.createdTransactionId)
  ) {
    throw invalidActivationReceipt();
  }
  return value as unknown as ActivationReceipt;
}

function invalidActivationCommand(
  reasonCode = 'FOUNDER_OPERATOR_BETA_ACTIVATION_COMMAND_INVALID',
): BadRequestException {
  return new BadRequestException({
    message: 'Founder beta activation command is invalid',
    reasonCode,
  });
}

function invalidActivationReceipt(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Founder beta activation receipt is invalid',
    reasonCode: 'FOUNDER_OPERATOR_BETA_ACTIVATION_RECEIPT_INVALID',
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function canonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}
