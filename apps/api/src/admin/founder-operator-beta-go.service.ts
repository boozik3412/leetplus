import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdentityEmailClaimType,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
  type IdentityEmailClaimTransaction,
} from '../auth/identity-email-claim.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import type {
  SharedTenantProvisioningService,
  ShellProvisioningResult,
} from './shared-tenant-provisioning.service';

export const FOUNDER_OPERATOR_BETA_GO_CONTRACT =
  'FOUNDER_OPERATOR_BETA_GO_V1' as const;
export const FOUNDER_OPERATOR_BETA_TRIAL_POLICY =
  'FOUNDER_OPERATOR_BETA_TRIAL_V1' as const;
export const FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const FOUNDER_OPERATOR_BETA_STOP_CONDITIONS = Object.freeze([
  'CROSS_TENANT_ACCESS',
  'OWNER_INVITE_DELIVERY_FAILURE',
  'LANGAME_CREDENTIAL_SCOPE_VIOLATION',
  'UNBOUNDED_BACKGROUND_EFFECT',
  'ROLLBACK_UNAVAILABLE',
] as const);

const ISSUE_ACTION = 'FOUNDER_OPERATOR_BETA_GO_ISSUED';
const REVOKE_ACTION = 'FOUNDER_OPERATOR_BETA_GO_REVOKED';
const MINIMUM_GO_LIFETIME_MS = 15 * 60 * 1_000;
const MAXIMUM_GO_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const TOP_LEVEL_FIELDS = new Set(['shell', 'go']);
const GO_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'tenantId',
  'tenantSlug',
  'expectedExecutionRevision',
  'expectedEntitlementProfileRevision',
  'validUntil',
  'singleFounderRiskAcceptance',
]);
const REVOKE_FIELDS = new Set(['confirmation', 'requestId', 'goId', 'reason']);

export type FounderOperatorBetaMode = 'DISABLED' | 'PREPARE' | 'ACTIVE';

type ParsedGo = Readonly<{
  requestId: string;
  reason: string;
  supportTicket: string | null;
  tenantId: string;
  tenantSlug: string;
  expectedExecutionRevision: number;
  expectedEntitlementProfileRevision: number;
  validUntil: Date;
}>;

export type FounderOperatorBetaGoResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OPERATOR_BETA_GO_CONTRACT;
  decision: 'ISSUED' | 'REPLAYED';
  replayed: boolean;
  goId: string;
  tenantId: string;
  tenantSlug: string;
  releaseSha: string;
  environment: string;
  expectedExecutionRevision: number;
  expectedEntitlementProfileRevision: number;
  trialPolicyVersion: typeof FOUNDER_OPERATOR_BETA_TRIAL_POLICY;
  trialDurationSeconds: typeof FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS;
  validUntil: string;
  stateRevision: 1;
  stopConditions: typeof FOUNDER_OPERATOR_BETA_STOP_CONDITIONS;
  activationRequired: true;
}>;

export type FounderOperatorBetaGoRevocationResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OPERATOR_BETA_GO_CONTRACT;
  decision: 'REVOKED' | 'ALREADY_REVOKED';
  replayed: boolean;
  goId: string;
  tenantId: string;
  stateRevision: 3;
  revokedAt: string;
}>;

@Injectable()
export class FounderOperatorBetaGoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shellProvisioning: SharedTenantProvisioningService,
    private readonly config: ConfigService,
    private readonly identityEmailClaims: IdentityEmailClaimService,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly uuidFactory: () => string = randomUUID,
  ) {}

  assertPreparationEnabled(): void {
    const mode = this.mode();
    if (mode === 'DISABLED') {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta preparation is disabled',
        reasonCode: 'FOUNDER_OPERATOR_BETA_PREPARATION_DISABLED',
      });
    }
  }

  async issue(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<FounderOperatorBetaGoResult> {
    this.assertPreparationEnabled();
    this.assertPlatformAdmin(actor);
    const expectedTenantId = this.uuid(routeTenantId, 'routeTenantId');
    const command = this.parseIssue(body);
    if (command.go.tenantId !== expectedTenantId) {
      throw invalidCommand('FOUNDER_OPERATOR_BETA_GO_TENANT_BINDING_INVALID');
    }

    const shell = await this.shellProvisioning.recoverProtectedActivationShell(
      actor,
      command.shell,
    );
    this.assertShellBinding(shell, command.go);
    this.assertOwnerIdentityNotCopiedIntoMetadata(command.shell, command.go);

    const now = this.canonicalNow();
    this.assertValidityWindow(command.go.validUntil, now);
    const releaseSha = this.releaseSha();
    const environment = this.environment();
    const stopConditions = [...FOUNDER_OPERATOR_BETA_STOP_CONDITIONS];
    const shellEvidenceDigest = this.digest('founder-operator-shell', {
      profileVersion: shell.profileVersion,
      tenant: shell.tenant,
      store: shell.store,
      ownerIdentity: shell.ownerIdentity,
      modules: shell.modules,
    });
    const stopConditionsDigest = this.digest(
      'founder-operator-stop-conditions',
      stopConditions,
    );
    const reasonDigest = this.textDigest(
      'founder-operator-reason',
      command.go.reason,
    );
    const supportTicketDigest = command.go.supportTicket
      ? this.textDigest(
          'founder-operator-support-ticket',
          command.go.supportTicket,
        )
      : null;
    const payload = {
      contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      decision: 'GO',
      tenantId: command.go.tenantId,
      tenantSlug: command.go.tenantSlug,
      requestId: command.go.requestId,
      releaseSha,
      environment,
      workflowLocator: shell.ownerIdentity.reservationId,
      reservationSubjectId: shell.ownerIdentity.reservationId,
      expectedClaimRevision: shell.ownerIdentity.claimRevision,
      shellEvidenceDigest,
      expectedEntitlementProfileRevision:
        command.go.expectedEntitlementProfileRevision,
      expectedExecutionRevision: command.go.expectedExecutionRevision,
      trialPolicyVersion: FOUNDER_OPERATOR_BETA_TRIAL_POLICY,
      trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
      approvedByUserId: actor.id,
      rollbackOwnerUserId: actor.id,
      singleFounderRiskAccepted: true,
      stopConditions,
      stopConditionsDigest,
      reasonDigest,
      supportTicketDigest,
      approvedAt: now.toISOString(),
      validUntil: command.go.validUntil.toISOString(),
    };
    const payloadDigest = this.digest('founder-operator-beta-go', payload);
    const requestDigest = this.digest('founder-operator-beta-go-request', {
      ...payload,
      approvedAt: null,
    });

    return this.prisma.$transaction(
      async (tx) => {
        await this.lockTenant(tx, command.go.tenantId);
        const identityTx = await this.identityEmailClaims.lockTenantTransaction(
          tx,
          command.go.tenantId,
        );
        await this.assertFreshShellAndAuthority(
          tx,
          identityTx,
          actor.id,
          shell,
          command.go,
        );

        const replay = await tx.founderOperatorBetaGo.findUnique({
          where: {
            tenantId_requestId: {
              tenantId: command.go.tenantId,
              requestId: command.go.requestId,
            },
          },
        });
        if (replay) {
          if (
            replay.requestDigest !== requestDigest ||
            replay.stateRevision !== 1 ||
            replay.revokedAt !== null ||
            replay.consumedAt !== null ||
            replay.validUntil <= now
          ) {
            throw new ConflictException({
              message: 'Founder-operator beta GO request conflicts',
              reasonCode: 'FOUNDER_OPERATOR_BETA_GO_REPLAY_CONFLICT',
            });
          }
          return this.issueResult(replay, command.go.tenantSlug, true);
        }

        const active = await tx.founderOperatorBetaGo.findFirst({
          where: {
            tenantId: command.go.tenantId,
            stateRevision: 1,
          },
          select: { id: true },
        });
        if (active) {
          throw new ConflictException({
            message: 'Tenant already has an active founder-operator beta GO',
            reasonCode: 'FOUNDER_OPERATOR_BETA_GO_ALREADY_ACTIVE',
          });
        }

        const goId = this.uuid(this.uuidFactory(), 'goId');
        const created = await tx.founderOperatorBetaGo.create({
          data: {
            id: goId,
            tenantId: command.go.tenantId,
            requestId: command.go.requestId,
            requestDigest,
            contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
            decision: 'GO',
            releaseSha,
            environment,
            workflowLocator: shell.ownerIdentity.reservationId,
            reservationSubjectId: shell.ownerIdentity.reservationId,
            expectedClaimRevision: shell.ownerIdentity.claimRevision,
            shellEvidenceDigest,
            expectedEntitlementProfileRevision:
              command.go.expectedEntitlementProfileRevision,
            expectedExecutionRevision: command.go.expectedExecutionRevision,
            trialPolicyVersion: FOUNDER_OPERATOR_BETA_TRIAL_POLICY,
            trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
            approvedByUserId: actor.id,
            rollbackOwnerUserId: actor.id,
            singleFounderRiskAccepted: true,
            stopConditions,
            stopConditionsDigest,
            payload,
            payloadDigest,
            approvedAt: now,
            validUntil: command.go.validUntil,
            stateRevision: 1,
            createdAt: now,
          },
        });

        await tx.platformAdminAuditEvent.create({
          data: {
            id: goId,
            tenantId: command.go.tenantId,
            actorUserId: actor.id,
            requestId: command.go.requestId,
            action: ISSUE_ACTION,
            targetType: 'TENANT',
            targetId: command.go.tenantId,
            reason: null,
            before: Prisma.JsonNull,
            after: this.issueResult(created, command.go.tenantSlug, false),
            metadata: {
              schemaVersion: 1,
              authority: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
              payloadDigest,
              requestDigest,
              reasonDigest,
              supportTicketDigest,
              singleFounderRiskAccepted: true,
              offlineKeyCeremonyRequired: false,
              activationRequired: true,
            },
          },
        });

        return this.issueResult(created, command.go.tenantSlug, false);
      },
      {
        ...IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
      },
    );
  }

  async revoke(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<FounderOperatorBetaGoRevocationResult> {
    this.assertPreparationEnabled();
    this.assertPlatformAdmin(actor);
    const tenantId = this.uuid(routeTenantId, 'routeTenantId');
    const command = this.parseRevoke(body, tenantId);
    const now = this.canonicalNow();
    const reasonDigest = this.textDigest(
      'founder-operator-beta-go-revoke',
      command.reason,
    );

    return this.prisma.$transaction(
      async (tx) => {
        await this.lockTenant(tx, tenantId);
        await this.assertFreshAdministrator(tx, actor.id);
        const current = await tx.founderOperatorBetaGo.findUnique({
          where: { id: command.goId },
        });
        if (!current || current.tenantId !== tenantId) {
          throw new ConflictException({
            message: 'Founder-operator beta GO is unavailable',
            reasonCode: 'FOUNDER_OPERATOR_BETA_GO_NOT_FOUND',
          });
        }
        if (current.stateRevision === 2 || current.consumedAt !== null) {
          throw new ConflictException({
            message: 'Consumed founder-operator beta GO cannot be revoked',
            reasonCode: 'FOUNDER_OPERATOR_BETA_GO_ALREADY_CONSUMED',
          });
        }
        if (current.stateRevision === 3 && current.revokedAt) {
          if (current.revocationReasonDigest !== reasonDigest) {
            throw new ConflictException({
              message: 'Founder-operator beta GO revoke request conflicts',
              reasonCode: 'FOUNDER_OPERATOR_BETA_GO_REVOKE_CONFLICT',
            });
          }
          return this.revokeResult(current, true);
        }

        const revoked = await tx.founderOperatorBetaGo.update({
          where: { id: command.goId },
          data: {
            stateRevision: 3,
            revokedAt: now,
            revocationReasonDigest: reasonDigest,
          },
        });
        await tx.platformAdminAuditEvent.create({
          data: {
            tenantId,
            actorUserId: actor.id,
            requestId: command.requestId,
            action: REVOKE_ACTION,
            targetType: 'FOUNDER_OPERATOR_BETA_GO',
            targetId: command.goId,
            reason: null,
            before: {
              stateRevision: 1,
              revokedAt: null,
            },
            after: this.revokeResult(revoked, false),
            metadata: {
              schemaVersion: 1,
              authority: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
              reasonDigest,
            },
          },
        });
        return this.revokeResult(revoked, false);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  }

  private async assertFreshShellAndAuthority(
    tx: Prisma.TransactionClient,
    identityTx: IdentityEmailClaimTransaction,
    actorUserId: string,
    shell: ShellProvisioningResult,
    command: ParsedGo,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM public."Tenant"
        WHERE "id" = ${command.tenantId}
        FOR UPDATE
      `,
    );
    const tenant = await tx.tenant.findUnique({
      where: { id: command.tenantId },
      select: {
        slug: true,
        status: true,
        customerStage: true,
        onboardingStatus: true,
        supportOwnerUserId: true,
        trialStartsAt: true,
        trialEndsAt: true,
        entitlementProfileRevision: true,
        executionRevision: true,
        stores: {
          select: {
            id: true,
            isActive: true,
            gamificationEnabled: true,
            backgroundExecutionEnabled: true,
          },
        },
        moduleEntitlements: {
          where: {
            profileRevision: command.expectedEntitlementProfileRevision,
          },
          select: {
            module: true,
            readEnabled: true,
            writeEnabled: true,
            outboundEnabled: true,
            profileRevision: true,
          },
        },
      },
    });
    const claim = await this.identityEmailClaims.assertInviteLocator(
      identityTx,
      {
        workflowLocator: shell.ownerIdentity.reservationId,
        tenantId: command.tenantId,
        subjectId: shell.ownerIdentity.reservationId,
        expectedRevision: shell.ownerIdentity.claimRevision,
      },
    );
    if (
      !tenant ||
      tenant.slug !== command.tenantSlug ||
      tenant.status !== TenantLifecycleStatus.SUSPENDED ||
      tenant.customerStage !== TenantCustomerStage.PILOT ||
      tenant.onboardingStatus !== TenantOnboardingStatus.PROVISIONING ||
      tenant.trialStartsAt !== null ||
      tenant.trialEndsAt !== null ||
      tenant.entitlementProfileRevision !==
        command.expectedEntitlementProfileRevision ||
      tenant.executionRevision !== command.expectedExecutionRevision ||
      tenant.stores.length !== 1 ||
      tenant.stores[0]?.id !== shell.store.id ||
      tenant.stores[0]?.isActive !== false ||
      tenant.stores[0]?.gamificationEnabled !== false ||
      tenant.stores[0]?.backgroundExecutionEnabled !== false ||
      tenant.moduleEntitlements.length !==
        COMPLETE_TENANT_MODULE_PROFILE.length ||
      tenant.moduleEntitlements.some(
        (entry) =>
          !COMPLETE_TENANT_MODULE_PROFILE.includes(entry.module) ||
          entry.readEnabled !== true ||
          entry.writeEnabled !== true ||
          entry.outboundEnabled !== false ||
          entry.profileRevision !== command.expectedEntitlementProfileRevision,
      ) ||
      !claim ||
      claim.claimType !== IdentityEmailClaimType.INVITE ||
      claim.subjectId !== shell.ownerIdentity.reservationId ||
      claim.revision !== shell.ownerIdentity.claimRevision
    ) {
      throw new ConflictException({
        message: 'Founder-operator beta shell changed before GO persistence',
        reasonCode: 'FOUNDER_OPERATOR_BETA_SHELL_CHANGED',
      });
    }
    if (!tenant.supportOwnerUserId) {
      throw new ConflictException({
        message: 'Founder-operator beta support owner is unavailable',
        reasonCode: 'FOUNDER_OPERATOR_BETA_SUPPORT_OWNER_UNAVAILABLE',
      });
    }
    await this.assertFreshAdministrator(tx, actorUserId);
    await this.assertFreshAdministrator(tx, tenant.supportOwnerUserId);
  }

  private async assertFreshAdministrator(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM public."User"
        WHERE "id" = ${userId}
        FOR SHARE
      `,
    );
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { isActive: true, isPlatformAdmin: true },
    });
    if (!user || !user.isActive || !user.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform administrator authority is no longer active',
      );
    }
  }

  private assertShellBinding(
    shell: ShellProvisioningResult,
    command: ParsedGo,
  ): void {
    if (
      shell.tenant.id !== command.tenantId ||
      shell.tenant.slug !== command.tenantSlug ||
      shell.tenant.executionRevision !== command.expectedExecutionRevision ||
      shell.tenant.profileRevision !==
        command.expectedEntitlementProfileRevision ||
      shell.activationRequired !== true
    ) {
      throw new ConflictException({
        message: 'Founder-operator beta shell does not match GO request',
        reasonCode: 'FOUNDER_OPERATOR_BETA_SHELL_MISMATCH',
      });
    }
  }

  private parseIssue(body: unknown): { shell: unknown; go: ParsedGo } {
    if (!record(body) || !hasExactKeys(body, TOP_LEVEL_FIELDS)) {
      throw invalidCommand();
    }
    if (!record(body.shell) || !record(body.go)) {
      throw invalidCommand();
    }
    if (!hasExactKeys(body.go, GO_FIELDS)) {
      throw invalidCommand();
    }
    const input = body.go;
    const tenantId = this.uuid(input.tenantId, 'tenantId');
    const tenantSlug = this.text(input.tenantSlug, 'tenantSlug', 3, 63);
    if (
      tenantSlug !== tenantSlug.toLowerCase() ||
      !TENANT_SLUG_PATTERN.test(tenantSlug)
    ) {
      throw invalidCommand();
    }
    const confirmation = this.text(input.confirmation, 'confirmation', 1, 120);
    if (confirmation !== `AUTHORIZE BETA ${tenantSlug}`) {
      throw new BadRequestException(
        `confirmation must exactly equal "AUTHORIZE BETA ${tenantSlug}"`,
      );
    }
    if (
      input.singleFounderRiskAcceptance !==
      'I ACCEPT SINGLE-FOUNDER BETA OPERATIONAL RISK'
    ) {
      throw new BadRequestException({
        message: 'Single-founder beta risk acceptance is required',
        reasonCode: 'FOUNDER_OPERATOR_BETA_RISK_ACCEPTANCE_REQUIRED',
      });
    }
    return {
      shell: body.shell,
      go: {
        requestId: this.uuid(input.requestId, 'requestId'),
        reason: this.text(input.reason, 'reason', 10, 500),
        supportTicket: this.optionalText(input.supportTicket, 200),
        tenantId,
        tenantSlug,
        expectedExecutionRevision: this.revision(
          input.expectedExecutionRevision,
          0,
        ),
        expectedEntitlementProfileRevision: this.revision(
          input.expectedEntitlementProfileRevision,
          1,
        ),
        validUntil: this.timestamp(input.validUntil),
      },
    };
  }

  private parseRevoke(
    body: unknown,
    tenantId: string,
  ): { requestId: string; goId: string; reason: string } {
    if (!record(body) || !hasExactKeys(body, REVOKE_FIELDS)) {
      throw invalidCommand();
    }
    const goId = this.uuid(body.goId, 'goId');
    if (body.confirmation !== `REVOKE BETA GO ${goId}`) {
      throw new BadRequestException(
        `confirmation must exactly equal "REVOKE BETA GO ${goId}"`,
      );
    }
    void tenantId;
    return {
      requestId: this.uuid(body.requestId, 'requestId'),
      goId,
      reason: this.text(body.reason, 'reason', 10, 500),
    };
  }

  private assertOwnerIdentityNotCopiedIntoMetadata(
    shell: unknown,
    go: ParsedGo,
  ): void {
    if (!record(shell) || typeof shell.ownerEmail !== 'string') {
      throw invalidCommand();
    }
    const ownerEmail = shell.ownerEmail.trim().toLowerCase();
    if (
      [go.reason, go.supportTicket].some((value) =>
        value?.toLowerCase().includes(ownerEmail),
      )
    ) {
      throw new BadRequestException({
        message: 'Owner identity must not be copied into GO metadata',
        reasonCode: 'FOUNDER_OPERATOR_BETA_OWNER_IDENTITY_FORBIDDEN',
      });
    }
  }

  private assertValidityWindow(validUntil: Date, now: Date): void {
    const lifetime = validUntil.getTime() - now.getTime();
    if (
      lifetime < MINIMUM_GO_LIFETIME_MS ||
      lifetime > MAXIMUM_GO_LIFETIME_MS
    ) {
      throw new BadRequestException({
        message:
          'Founder-operator beta GO validity must be 15 minutes to 24 hours',
        reasonCode: 'FOUNDER_OPERATOR_BETA_GO_VALIDITY_INVALID',
      });
    }
  }

  private issueResult(
    go: {
      id: string;
      tenantId: string;
      releaseSha: string;
      environment: string;
      expectedExecutionRevision: number;
      expectedEntitlementProfileRevision: number;
      validUntil: Date;
    },
    tenantSlug: string,
    replayed: boolean,
  ): FounderOperatorBetaGoResult {
    return {
      ok: true,
      contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      decision: replayed ? 'REPLAYED' : 'ISSUED',
      replayed,
      goId: go.id,
      tenantId: go.tenantId,
      tenantSlug,
      releaseSha: go.releaseSha,
      environment: go.environment,
      expectedExecutionRevision: go.expectedExecutionRevision,
      expectedEntitlementProfileRevision: go.expectedEntitlementProfileRevision,
      trialPolicyVersion: FOUNDER_OPERATOR_BETA_TRIAL_POLICY,
      trialDurationSeconds: FOUNDER_OPERATOR_BETA_TRIAL_DURATION_SECONDS,
      validUntil: go.validUntil.toISOString(),
      stateRevision: 1,
      stopConditions: FOUNDER_OPERATOR_BETA_STOP_CONDITIONS,
      activationRequired: true,
    };
  }

  private revokeResult(
    go: {
      id: string;
      tenantId: string;
      revokedAt: Date | null;
    },
    replayed: boolean,
  ): FounderOperatorBetaGoRevocationResult {
    if (!go.revokedAt) {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta GO revocation receipt is invalid',
        reasonCode: 'FOUNDER_OPERATOR_BETA_GO_REVOCATION_RECEIPT_INVALID',
      });
    }
    return {
      ok: true,
      contractVersion: FOUNDER_OPERATOR_BETA_GO_CONTRACT,
      decision: replayed ? 'ALREADY_REVOKED' : 'REVOKED',
      replayed,
      goId: go.id,
      tenantId: go.tenantId,
      stateRevision: 3,
      revokedAt: go.revokedAt.toISOString(),
    };
  }

  private lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${'founder-operator-beta-go:' + tenantId}, 0)
        )::TEXT AS acquired
      `,
    );
  }

  private mode(): FounderOperatorBetaMode {
    const value =
      this.config.get<string>('FOUNDER_OPERATOR_BETA_MODE')?.trim() ||
      'DISABLED';
    if (!['DISABLED', 'PREPARE', 'ACTIVE'].includes(value)) {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta mode is invalid',
        reasonCode: 'FOUNDER_OPERATOR_BETA_MODE_INVALID',
      });
    }
    return value as FounderOperatorBetaMode;
  }

  private releaseSha(): string {
    const value = this.config.get<string>('RELEASE_SHA')?.trim() ?? '';
    if (!RELEASE_SHA_PATTERN.test(value)) {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta release identity is unavailable',
        reasonCode: 'FOUNDER_OPERATOR_BETA_RELEASE_SHA_INVALID',
      });
    }
    return value;
  }

  private environment(): string {
    const value =
      this.config.get<string>('IDENTITY_MAIL_AAD_ENVIRONMENT')?.trim() ?? '';
    if (!ENVIRONMENT_PATTERN.test(value)) {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta environment identity is unavailable',
        reasonCode: 'FOUNDER_OPERATOR_BETA_ENVIRONMENT_INVALID',
      });
    }
    return value;
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    this.uuid(actor.id, 'actorUserId');
  }

  private canonicalNow(): Date {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new ServiceUnavailableException({
        message: 'Founder-operator beta clock is invalid',
        reasonCode: 'FOUNDER_OPERATOR_BETA_CLOCK_INVALID',
      });
    }
    return new Date(Math.trunc(now.getTime()));
  }

  private timestamp(value: unknown): Date {
    if (typeof value !== 'string' || !CANONICAL_TIMESTAMP_PATTERN.test(value)) {
      throw invalidCommand();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      throw invalidCommand();
    }
    return parsed;
  }

  private uuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        message: `Founder-operator beta ${field} is invalid`,
        reasonCode: 'FOUNDER_OPERATOR_BETA_GO_COMMAND_INVALID',
      });
    }
    return value;
  }

  private revision(value: unknown, minimum: number): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
      throw invalidCommand();
    }
    return value as number;
  }

  private text(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
  ): string {
    if (typeof value !== 'string' || value !== value.trim()) {
      throw invalidCommand();
    }
    const bytes = Buffer.byteLength(value, 'utf8');
    const hasControlCharacter = Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    });
    if (bytes < minimum || bytes > maximum || hasControlCharacter) {
      throw new BadRequestException({
        message: `Founder-operator beta ${field} is invalid`,
        reasonCode: 'FOUNDER_OPERATOR_BETA_GO_COMMAND_INVALID',
      });
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
}

function invalidCommand(
  reasonCode = 'FOUNDER_OPERATOR_BETA_GO_COMMAND_INVALID',
): BadRequestException {
  return new BadRequestException({
    message: 'Founder-operator beta GO command is invalid',
    reasonCode,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function stableJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidCommand();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (record(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  throw invalidCommand();
}
