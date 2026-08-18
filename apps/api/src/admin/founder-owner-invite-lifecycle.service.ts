import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdentityMailOutboxStatus,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { IdentityMailSecretEnvelopeService } from '../auth/identity-mail-secret-envelope.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
} from '../auth/identity-email-claim.service';
import { resolveIdentityMailAadEnvironment } from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';

export const FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT =
  'FOUNDER_OWNER_INVITE_LIFECYCLE_V1' as const;

const REVOKE_ACTION = 'FOUNDER_OWNER_INVITE_REVOKED' as const;
const REISSUE_ACTION = 'FOUNDER_OWNER_INVITE_REISSUED' as const;
const REVOKE_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'expectedInviteId',
]);
const REISSUE_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'expectedInviteId',
  'expiresAt',
]);
const MINIMUM_INVITE_LIFETIME_MS = 15 * 60 * 1_000;
const MAXIMUM_INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const OWNER_TEMPLATE = 'INITIAL_OWNER_INVITE' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type InviteState = 'ACTIVE' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
type DeliveryDisposition =
  | 'CANCELED_BEFORE_PROVIDER'
  | 'PROVIDER_ATTEMPT_PRESERVED'
  | 'TERMINAL_PRESERVED';

type ParsedRevoke = Readonly<{
  expectedInviteId: string;
  reason: string;
  requestId: string;
  supportTicket: string | null;
}>;

type ParsedReissue = ParsedRevoke &
  Readonly<{
    expiresAt: Date;
  }>;

type OwnerInviteAggregate = Readonly<{
  tenant: {
    id: string;
    status: TenantLifecycleStatus;
    customerStage: TenantCustomerStage;
    onboardingStatus: TenantOnboardingStatus;
  };
  invite: {
    id: string;
    email: string | null;
    role: UserRole;
    accessScope: UserAccessScope | null;
    customRoleId: string | null;
    storeIds: string[];
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    revokedByUserId: string | null;
    identityClaimRevision: number | null;
    updatedAt: Date;
  };
  outbox: {
    id: string;
    status: IdentityMailOutboxStatus;
    providerAttemptKey: string | null;
  };
}>;

export type FounderOwnerInviteStatusResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT;
  tenant: {
    id: string;
    status: TenantLifecycleStatus;
    onboardingStatus: TenantOnboardingStatus;
  };
  ownerInvite: {
    id: string;
    state: InviteState;
    deliveryStatus: IdentityMailOutboxStatus;
    expiresAt: string;
  };
  actions: {
    revokeAllowed: boolean;
    reissueRequired: boolean;
  };
}>;

export type FounderOwnerInviteRevokeResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT;
  decision: 'REVOKED' | 'REPLAYED';
  replayed: boolean;
  tenantId: string;
  inviteId: string;
  inviteState: 'REVOKED';
  deliveryStatus: IdentityMailOutboxStatus;
  deliveryDisposition: DeliveryDisposition;
  revokedAt: string;
}>;

export type FounderOwnerInviteReissueResult = Readonly<{
  ok: true;
  contractVersion: typeof FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT;
  decision: 'REISSUED' | 'REPLAYED';
  replayed: boolean;
  tenantId: string;
  commandId: string;
  sequence: number;
  predecessorInviteId: string;
  inviteId: string;
  outboxId: string;
  deliveryStatus: typeof IdentityMailOutboxStatus.PENDING;
  expiresAt: string;
}>;

type ReissueDatabaseReceipt = Readonly<{
  schemaVersion: 1;
  operation: 'REISSUE_INITIAL_OWNER_INVITE';
  decision: 'REISSUED' | 'REPLAYED';
  tenantId: string;
  commandId: string;
  sequence: number;
  predecessorInviteId: string;
  inviteId: string;
  outboxId: string;
  outboxStatus: 'PENDING';
  expiresAtEpochMs: number;
  createdTransactionId: string;
}>;

@Injectable()
export class FounderOwnerInviteLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityClaimBoundary: IdentityEmailClaimService,
    private readonly config: ConfigService,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly uuidFactory: () => string = randomUUID,
  ) {}

  async status(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
  ): Promise<FounderOwnerInviteStatusResult> {
    this.assertPlatformAdmin(actor);
    const tenantId = this.uuid(routeTenantId, 'tenantId');
    return this.prisma.$transaction(async (tx) => {
      await this.identityClaimBoundary.lockTenantTransaction(tx, tenantId);
      await this.assertFreshPlatformAuthority(tx, actor.id);
      const aggregate = await this.loadAggregate(tx, tenantId);
      const state = this.inviteState(aggregate.invite, new Date());
      return {
        ok: true,
        contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
        tenant: {
          id: tenantId,
          status: aggregate.tenant.status,
          onboardingStatus: aggregate.tenant.onboardingStatus,
        },
        ownerInvite: {
          id: aggregate.invite.id,
          state,
          deliveryStatus: aggregate.outbox.status,
          expiresAt: aggregate.invite.expiresAt.toISOString(),
        },
        actions: {
          revokeAllowed:
            state === 'ACTIVE' && this.ownerInviteStage(aggregate.tenant),
          reissueRequired:
            (state === 'REVOKED' || state === 'EXPIRED') &&
            this.ownerInviteStage(aggregate.tenant),
        },
      };
    }, IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  }

  async revoke(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<FounderOwnerInviteRevokeResult> {
    this.assertPlatformAdmin(actor);
    const tenantId = this.uuid(routeTenantId, 'tenantId');
    const parsed = this.parseRevoke(tenantId, body);
    const requestDigest = this.revokeDigest(actor.id, tenantId, parsed);

    return this.prisma.$transaction(async (tx) => {
      const identityTx = await this.identityClaimBoundary.lockTenantTransaction(
        tx,
        tenantId,
      );
      await this.assertFreshPlatformAuthority(tx, actor.id);

      const replay = await tx.platformAdminAuditEvent.findUnique({
        where: {
          tenantId_action_requestId: {
            tenantId,
            action: REVOKE_ACTION,
            requestId: parsed.requestId,
          },
        },
        select: { after: true, metadata: true },
      });
      if (replay) {
        return this.revokeReplay(replay, requestDigest, tenantId, parsed);
      }

      const aggregate = await this.loadAggregate(tx, tenantId);
      if (!this.ownerInviteStage(aggregate.tenant)) {
        throw new ConflictException({
          message: 'Tenant is not awaiting its initial owner',
          reasonCode: 'FOUNDER_OWNER_INVITE_TENANT_STATE_INVALID',
        });
      }
      if (aggregate.invite.id !== parsed.expectedInviteId) {
        throw new ConflictException({
          message: 'Initial owner invite changed before revoke',
          reasonCode: 'FOUNDER_OWNER_INVITE_CHANGED',
        });
      }
      if (this.inviteState(aggregate.invite, new Date()) !== 'ACTIVE') {
        throw new ConflictException({
          message: 'Initial owner invite is no longer active',
          reasonCode: 'FOUNDER_OWNER_INVITE_NOT_ACTIVE',
        });
      }
      if (
        !aggregate.invite.email ||
        !Number.isInteger(aggregate.invite.identityClaimRevision) ||
        (aggregate.invite.identityClaimRevision ?? 0) < 1
      ) {
        throw new ConflictException({
          message: 'Initial owner invite identity provenance is invalid',
          reasonCode: 'FOUNDER_OWNER_INVITE_PROVENANCE_INVALID',
        });
      }
      this.assertOwnerIdentityNotCopied(parsed, aggregate.invite.email);

      const revokedAt = new Date();
      const terminalExpiresAt =
        aggregate.invite.expiresAt.getTime() <= revokedAt.getTime()
          ? aggregate.invite.expiresAt
          : revokedAt;
      const revoked = await tx.userInvite.updateMany({
        where: {
          id: aggregate.invite.id,
          tenantId,
          acceptedAt: null,
          revokedAt: null,
          updatedAt: aggregate.invite.updatedAt,
        },
        data: {
          expiresAt: terminalExpiresAt,
          revokedAt,
          revokedByUserId: actor.id,
        },
      });
      if (revoked.count !== 1) {
        throw new ConflictException({
          message: 'Initial owner invite changed before revoke',
          reasonCode: 'FOUNDER_OWNER_INVITE_CHANGED',
        });
      }

      const delivery = await this.stopDelivery(
        tx,
        aggregate.outbox,
        tenantId,
        revokedAt,
      );
      await this.identityClaimBoundary.releaseInvite(identityTx, {
        email: aggregate.invite.email,
        tenantId,
        expectedSubjectId: aggregate.invite.id,
        expectedRevision: aggregate.invite.identityClaimRevision!,
      });

      const result: FounderOwnerInviteRevokeResult = {
        ok: true,
        contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
        decision: 'REVOKED',
        replayed: false,
        tenantId,
        inviteId: aggregate.invite.id,
        inviteState: 'REVOKED',
        deliveryStatus: delivery.status,
        deliveryDisposition: delivery.disposition,
        revokedAt: revokedAt.toISOString(),
      };
      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId,
          actorUserId: actor.id,
          requestId: parsed.requestId,
          action: REVOKE_ACTION,
          targetType: 'UserInvite',
          targetId: aggregate.invite.id,
          reason: parsed.reason,
          before: {
            inviteState: 'ACTIVE',
            deliveryStatus: aggregate.outbox.status,
          },
          after: result,
          metadata: {
            contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
            requestDigest,
            supportTicket: parsed.supportTicket,
            expectedInviteId: parsed.expectedInviteId,
            deliveryDisposition: delivery.disposition,
            identityClaimReleased: true,
          },
        },
      });
      return result;
    }, IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  }

  async reissue(
    actor: AuthenticatedUser,
    routeTenantId: unknown,
    body: unknown,
  ): Promise<FounderOwnerInviteReissueResult> {
    this.assertPlatformAdmin(actor);
    const tenantId = this.uuid(routeTenantId, 'tenantId');
    const parsed = this.parseReissue(tenantId, body);
    const environment = this.environment();
    const requestDigest = this.reissueDigest(actor.id, tenantId, parsed);
    const identifiers = this.reissueIdentifiers(tenantId, parsed.requestId);
    const issueRequestDigest = this.digest({
      contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
      operation: 'ISSUE_REPLACEMENT_INITIAL_OWNER_INVITE',
      tenantId,
      reissueRequestId: parsed.requestId,
      reissueRequestDigest: requestDigest,
      workflowLocator: identifiers.reservationSubjectId,
      expiresAt: parsed.expiresAt.toISOString(),
      environment,
    });
    const envelopeService = new IdentityMailSecretEnvelopeService(this.config);

    return this.prisma.$transaction(async (tx) => {
      await this.identityClaimBoundary.lockTenantTransaction(tx, tenantId);
      await this.assertFreshPlatformAuthority(tx, actor.id);
      const aggregate = await this.loadAggregate(tx, tenantId);
      const state = this.inviteState(aggregate.invite, this.clock());
      if (!this.ownerInviteStage(aggregate.tenant)) {
        throw new ConflictException({
          message: 'Tenant is not awaiting its initial owner',
          reasonCode: 'FOUNDER_OWNER_INVITE_TENANT_STATE_INVALID',
        });
      }
      if (aggregate.invite.id !== parsed.expectedInviteId) {
        throw new ConflictException({
          message: 'Initial owner invite changed before reissue',
          reasonCode: 'FOUNDER_OWNER_INVITE_CHANGED',
        });
      }
      if (state !== 'REVOKED' && state !== 'EXPIRED') {
        throw new ConflictException({
          message: 'Initial owner invite is not eligible for reissue',
          reasonCode: 'FOUNDER_OWNER_INVITE_REISSUE_NOT_ALLOWED',
        });
      }
      if (!aggregate.invite.email) {
        throw new ConflictException({
          message: 'Initial owner invite identity provenance is invalid',
          reasonCode: 'FOUNDER_OWNER_INVITE_PROVENANCE_INVALID',
        });
      }
      this.assertOwnerIdentityNotCopied(parsed, aggregate.invite.email);

      const sealed = envelopeService.sealInitialOwnerInviteToken({
        tenantId,
        workflowLocator: identifiers.reservationSubjectId,
        inviteId: identifiers.inviteId,
        outboxId: identifiers.outboxId,
        template: OWNER_TEMPLATE,
        messageKey: identifiers.messageKey,
        requestDigest: issueRequestDigest,
        recipientEmail: aggregate.invite.email,
        expiresAt: parsed.expiresAt,
      });
      try {
        const rows = await tx.$queryRaw<Array<{ receipt: Prisma.JsonValue }>>(
          Prisma.sql`
            SELECT public."founder_owner_invite_reissue_v1"(
              ${tenantId}::TEXT,
              ${parsed.requestId}::TEXT,
              ${requestDigest}::TEXT,
              ${parsed.expectedInviteId}::TEXT,
              ${actor.id}::TEXT,
              ${parsed.reason}::TEXT,
              ${this.textDigest(parsed.reason)}::TEXT,
              ${parsed.supportTicket}::TEXT,
              ${parsed.supportTicket ? this.textDigest(parsed.supportTicket) : null}::TEXT,
              ${environment}::TEXT,
              ${identifiers.commandId}::TEXT,
              ${identifiers.reservationSubjectId}::TEXT,
              ${identifiers.issueRequestId}::TEXT,
              ${issueRequestDigest}::TEXT,
              ${identifiers.issueCommandId}::TEXT,
              ${identifiers.inviteId}::TEXT,
              ${identifiers.outboxId}::TEXT,
              ${identifiers.messageKey}::TEXT,
              ${sealed.tokenHash}::TEXT,
              ${sealed.secretCiphertext}::BYTEA,
              ${parsed.expiresAt}::TIMESTAMP(3) WITH TIME ZONE
            ) AS receipt
          `,
        );
        return this.reissueResult(this.reissueReceipt(rows), tenantId, parsed);
      } catch (error) {
        throw this.reissueFailure(error);
      } finally {
        sealed.secretCiphertext.fill(0);
      }
    }, IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
  }

  private async stopDelivery(
    tx: Prisma.TransactionClient,
    outbox: OwnerInviteAggregate['outbox'],
    tenantId: string,
    revokedAt: Date,
  ): Promise<{
    status: IdentityMailOutboxStatus;
    disposition: DeliveryDisposition;
  }> {
    const cancelable =
      (outbox.status === IdentityMailOutboxStatus.PENDING ||
        outbox.status === IdentityMailOutboxStatus.RETRY ||
        outbox.status === IdentityMailOutboxStatus.CLAIMED) &&
      outbox.providerAttemptKey === null;
    if (cancelable) {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_catalog.set_config(
          'leetplus.identity_mail_delivery_event',
          'CANCELED',
          true
        ) AS event
      `);
      const canceled = await tx.identityMailOutbox.updateMany({
        where: {
          id: outbox.id,
          tenantId,
          status: outbox.status,
          providerAttemptKey: null,
        },
        data: {
          status: IdentityMailOutboxStatus.CANCELED,
          transitionRevision: { increment: BigInt(1) },
          availableAt: null,
          leaseOwnerDigest: null,
          leaseTokenDigest: null,
          claimedAt: null,
          leaseExpiresAt: null,
          providerAttemptKey: null,
          providerAttemptedAt: null,
          providerAcknowledgeUntil: null,
          providerAuthorityDigest: null,
          messageIdDigest: null,
          secretCiphertext: null,
          ciphertextClearedAt: null,
          providerOutcomeClass: 'CANCELED',
          providerObservedAt: revokedAt,
          providerReceiptDigest: null,
          terminalAckDigest: null,
          sentAt: null,
          terminalAt: revokedAt,
          stateReasonCode: 'OWNER_INVITE_REVOKED',
          updatedAt: revokedAt,
        },
      });
      if (canceled.count !== 1) {
        throw new ConflictException({
          message: 'Initial owner delivery changed before revoke',
          reasonCode: 'FOUNDER_OWNER_INVITE_DELIVERY_CHANGED',
        });
      }
      return {
        status: IdentityMailOutboxStatus.CANCELED,
        disposition: 'CANCELED_BEFORE_PROVIDER',
      };
    }

    if (
      (outbox.status === IdentityMailOutboxStatus.CLAIMED &&
        outbox.providerAttemptKey !== null) ||
      outbox.status === IdentityMailOutboxStatus.RECONCILIATION_REQUIRED
    ) {
      return {
        status: outbox.status,
        disposition: 'PROVIDER_ATTEMPT_PRESERVED',
      };
    }
    if (
      outbox.status === IdentityMailOutboxStatus.SENT ||
      outbox.status === IdentityMailOutboxStatus.DEAD
    ) {
      return {
        status: outbox.status,
        disposition: 'TERMINAL_PRESERVED',
      };
    }
    throw new ConflictException({
      message: 'Initial owner delivery state cannot be revoked safely',
      reasonCode: 'FOUNDER_OWNER_INVITE_DELIVERY_STATE_INVALID',
    });
  }

  private async loadAggregate(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<OwnerInviteAggregate> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        customerStage: true,
        onboardingStatus: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const reissues = await tx.$queryRaw<
      Array<{ inviteId: string; outboxId: string }>
    >(Prisma.sql`
      SELECT "inviteId", "outboxId"
      FROM public."FounderOwnerInviteReissueCommand"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "sequence" DESC
      LIMIT 1
    `);
    const activation = reissues[0]
      ? reissues[0]
      : await tx.founderOperatorBetaActivationCommand.findUnique({
          where: { tenantId },
          select: { inviteId: true, outboxId: true },
        });
    if (!activation) {
      throw new NotFoundException('Initial owner invite not found');
    }
    const [invite, outbox] = await Promise.all([
      tx.userInvite.findFirst({
        where: { id: activation.inviteId, tenantId },
        select: {
          id: true,
          email: true,
          role: true,
          accessScope: true,
          customRoleId: true,
          storeIds: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          revokedByUserId: true,
          identityClaimRevision: true,
          updatedAt: true,
        },
      }),
      tx.identityMailOutbox.findFirst({
        where: { id: activation.outboxId, tenantId },
        select: { id: true, status: true, providerAttemptKey: true },
      }),
    ]);
    if (!invite || !outbox) {
      throw new ConflictException({
        message: 'Initial owner invite aggregate is incomplete',
        reasonCode: 'FOUNDER_OWNER_INVITE_AGGREGATE_INVALID',
      });
    }
    if (
      invite.role !== UserRole.OWNER ||
      invite.accessScope !== UserAccessScope.NETWORK ||
      invite.customRoleId !== null ||
      invite.storeIds.length !== 0
    ) {
      throw new ConflictException({
        message: 'Initial owner invite authority is invalid',
        reasonCode: 'FOUNDER_OWNER_INVITE_AGGREGATE_INVALID',
      });
    }
    return { tenant, invite, outbox };
  }

  private async assertFreshPlatformAuthority(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM public."User"
      WHERE "id" = ${actorUserId}
      FOR SHARE
    `);
    const actor = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { isActive: true, isPlatformAdmin: true },
    });
    if (!actor?.isActive || !actor.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform administrator authority is no longer active',
      );
    }
  }

  private revokeReplay(
    event: {
      after: Prisma.JsonValue | null;
      metadata: Prisma.JsonValue | null;
    },
    requestDigest: string,
    tenantId: string,
    parsed: ParsedRevoke,
  ): FounderOwnerInviteRevokeResult {
    if (
      !this.record(event.metadata) ||
      event.metadata.requestDigest !== requestDigest ||
      event.metadata.expectedInviteId !== parsed.expectedInviteId ||
      !this.record(event.after)
    ) {
      throw new ConflictException(
        'requestId was already used with a different operation payload',
      );
    }
    const result = event.after;
    if (
      !this.hasExactKeys(result, [
        'ok',
        'contractVersion',
        'decision',
        'replayed',
        'tenantId',
        'inviteId',
        'inviteState',
        'deliveryStatus',
        'deliveryDisposition',
        'revokedAt',
      ]) ||
      result.ok !== true ||
      result.contractVersion !== FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT ||
      result.decision !== 'REVOKED' ||
      result.replayed !== false ||
      result.tenantId !== tenantId ||
      result.inviteId !== parsed.expectedInviteId ||
      result.inviteState !== 'REVOKED' ||
      !Object.values(IdentityMailOutboxStatus).includes(
        result.deliveryStatus as IdentityMailOutboxStatus,
      ) ||
      ![
        'CANCELED_BEFORE_PROVIDER',
        'PROVIDER_ATTEMPT_PRESERVED',
        'TERMINAL_PRESERVED',
      ].includes(
        typeof result.deliveryDisposition === 'string'
          ? result.deliveryDisposition
          : '',
      ) ||
      typeof result.revokedAt !== 'string' ||
      !Number.isFinite(Date.parse(result.revokedAt))
    ) {
      throw new ConflictException(
        'Stored owner invite revoke receipt is invalid',
      );
    }
    return {
      ...(result as unknown as FounderOwnerInviteRevokeResult),
      decision: 'REPLAYED',
      replayed: true,
    };
  }

  private parseRevoke(tenantId: string, body: unknown): ParsedRevoke {
    if (!this.record(body)) {
      throw new BadRequestException(
        'Owner invite revoke body must be an object',
      );
    }
    const unexpected = Object.keys(body).filter(
      (field) => !REVOKE_FIELDS.has(field),
    );
    if (unexpected.length > 0) {
      throw new BadRequestException({
        message: 'Owner invite revoke body contains unsupported fields',
        reasonCode: 'FOUNDER_OWNER_INVITE_FIELD_NOT_ALLOWED',
      });
    }
    const expectedConfirmation = `REVOKE OWNER INVITE ${tenantId}`;
    if (body.confirmation !== expectedConfirmation) {
      throw new BadRequestException(
        `confirmation must exactly equal "${expectedConfirmation}"`,
      );
    }
    return {
      requestId: this.requiredText(body.requestId, 'requestId', 8, 200),
      reason: this.requiredText(body.reason, 'reason', 10, 500),
      supportTicket: this.optionalText(
        body.supportTicket,
        'supportTicket',
        200,
      ),
      expectedInviteId: this.uuid(body.expectedInviteId, 'expectedInviteId'),
    };
  }

  private parseReissue(tenantId: string, body: unknown): ParsedReissue {
    if (!this.record(body)) {
      throw new BadRequestException(
        'Owner invite reissue body must be an object',
      );
    }
    const unexpected = Object.keys(body).filter(
      (field) => !REISSUE_FIELDS.has(field),
    );
    if (unexpected.length > 0) {
      throw new BadRequestException({
        message: 'Owner invite reissue body contains unsupported fields',
        reasonCode: 'FOUNDER_OWNER_INVITE_FIELD_NOT_ALLOWED',
      });
    }
    const expectedConfirmation = `REISSUE OWNER INVITE ${tenantId}`;
    if (body.confirmation !== expectedConfirmation) {
      throw new BadRequestException(
        `confirmation must exactly equal "${expectedConfirmation}"`,
      );
    }
    const expiresAt = this.futureTimestamp(body.expiresAt);
    return {
      requestId: this.uuid(body.requestId, 'requestId'),
      reason: this.requiredText(body.reason, 'reason', 10, 500),
      supportTicket: this.optionalText(
        body.supportTicket,
        'supportTicket',
        200,
      ),
      expectedInviteId: this.uuid(body.expectedInviteId, 'expectedInviteId'),
      expiresAt,
    };
  }

  private revokeDigest(
    actorUserId: string,
    tenantId: string,
    input: ParsedRevoke,
  ): string {
    return this.digest({
      contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
      operation: REVOKE_ACTION,
      actorUserId,
      tenantId,
      expectedInviteId: input.expectedInviteId,
      requestId: input.requestId,
      reasonDigest: this.textDigest(input.reason),
      supportTicketDigest: input.supportTicket
        ? this.textDigest(input.supportTicket)
        : null,
    });
  }

  private reissueDigest(
    actorUserId: string,
    tenantId: string,
    input: ParsedReissue,
  ): string {
    return this.digest({
      contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
      operation: REISSUE_ACTION,
      actorUserId,
      tenantId,
      expectedInviteId: input.expectedInviteId,
      requestId: input.requestId,
      expiresAt: input.expiresAt.toISOString(),
      reasonDigest: this.textDigest(input.reason),
      supportTicketDigest: input.supportTicket
        ? this.textDigest(input.supportTicket)
        : null,
    });
  }

  private reissueIdentifiers(
    tenantId: string,
    requestId: string,
  ): {
    commandId: string;
    reservationSubjectId: string;
    issueRequestId: string;
    issueCommandId: string;
    inviteId: string;
    outboxId: string;
    messageKey: string;
  } {
    const generated = Array.from({ length: 6 }, () =>
      this.uuid(this.uuidFactory(), 'generatedId'),
    );
    const issueRequestId = this.derivedUuid(
      'owner-invite-reissue-issue',
      tenantId,
      requestId,
    );
    const values = [...generated, issueRequestId];
    if (new Set(values).size !== values.length) {
      throw new ServiceUnavailableException({
        message: 'Owner invite reissue identifier generation failed',
        reasonCode: 'FOUNDER_OWNER_INVITE_IDENTIFIER_GENERATION_FAILED',
      });
    }
    const [
      commandId,
      reservationSubjectId,
      issueCommandId,
      inviteId,
      outboxId,
      messageKey,
    ] = generated;
    if (
      !commandId ||
      !reservationSubjectId ||
      !issueCommandId ||
      !inviteId ||
      !outboxId ||
      !messageKey
    ) {
      throw new ServiceUnavailableException({
        message: 'Owner invite reissue identifier generation failed',
        reasonCode: 'FOUNDER_OWNER_INVITE_IDENTIFIER_GENERATION_FAILED',
      });
    }
    return {
      commandId,
      reservationSubjectId,
      issueRequestId,
      issueCommandId,
      inviteId,
      outboxId,
      messageKey,
    };
  }

  private reissueReceipt(
    rows: Array<{ receipt: Prisma.JsonValue }>,
  ): ReissueDatabaseReceipt {
    if (
      rows.length !== 1 ||
      !this.record(rows[0]?.receipt) ||
      !this.hasExactKeys(rows[0].receipt, [
        'schemaVersion',
        'operation',
        'decision',
        'tenantId',
        'commandId',
        'sequence',
        'predecessorInviteId',
        'inviteId',
        'outboxId',
        'outboxStatus',
        'expiresAtEpochMs',
        'createdTransactionId',
      ])
    ) {
      throw new ServiceUnavailableException(
        'Owner invite reissue receipt is invalid',
      );
    }
    const receipt = rows[0].receipt;
    if (
      receipt.schemaVersion !== 1 ||
      receipt.operation !== 'REISSUE_INITIAL_OWNER_INVITE' ||
      (receipt.decision !== 'REISSUED' && receipt.decision !== 'REPLAYED') ||
      receipt.outboxStatus !== 'PENDING' ||
      typeof receipt.sequence !== 'number' ||
      !Number.isSafeInteger(receipt.sequence) ||
      receipt.sequence < 1 ||
      typeof receipt.expiresAtEpochMs !== 'number' ||
      !Number.isSafeInteger(receipt.expiresAtEpochMs) ||
      typeof receipt.createdTransactionId !== 'string' ||
      !/^[1-9][0-9]*$/u.test(receipt.createdTransactionId)
    ) {
      throw new ServiceUnavailableException(
        'Owner invite reissue receipt is invalid',
      );
    }
    return {
      schemaVersion: 1,
      operation: 'REISSUE_INITIAL_OWNER_INVITE',
      decision: receipt.decision,
      tenantId: this.uuid(receipt.tenantId, 'receipt.tenantId'),
      commandId: this.uuid(receipt.commandId, 'receipt.commandId'),
      sequence: receipt.sequence,
      predecessorInviteId: this.uuid(
        receipt.predecessorInviteId,
        'receipt.predecessorInviteId',
      ),
      inviteId: this.uuid(receipt.inviteId, 'receipt.inviteId'),
      outboxId: this.uuid(receipt.outboxId, 'receipt.outboxId'),
      outboxStatus: 'PENDING',
      expiresAtEpochMs: receipt.expiresAtEpochMs,
      createdTransactionId: receipt.createdTransactionId,
    };
  }

  private reissueResult(
    receipt: ReissueDatabaseReceipt,
    tenantId: string,
    input: ParsedReissue,
  ): FounderOwnerInviteReissueResult {
    if (
      receipt.tenantId !== tenantId ||
      receipt.predecessorInviteId !== input.expectedInviteId ||
      receipt.expiresAtEpochMs !== input.expiresAt.getTime()
    ) {
      throw new ServiceUnavailableException(
        'Owner invite reissue receipt is invalid',
      );
    }
    return {
      ok: true,
      contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
      decision: receipt.decision,
      replayed: receipt.decision === 'REPLAYED',
      tenantId,
      commandId: receipt.commandId,
      sequence: receipt.sequence,
      predecessorInviteId: receipt.predecessorInviteId,
      inviteId: receipt.inviteId,
      outboxId: receipt.outboxId,
      deliveryStatus: IdentityMailOutboxStatus.PENDING,
      expiresAt: new Date(receipt.expiresAtEpochMs).toISOString(),
    };
  }

  private reissueFailure(error: unknown): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }
    const state = this.sqlState(error);
    if (state === '22023') {
      return new BadRequestException({
        message: 'Owner invite reissue command is invalid',
        reasonCode: 'FOUNDER_OWNER_INVITE_REISSUE_INVALID',
      });
    }
    if (
      ['23503', '23505', '23514', '40001', '40P01', '55000'].includes(state)
    ) {
      return new ConflictException({
        message: 'Owner invite reissue preconditions are not satisfied',
        reasonCode: 'FOUNDER_OWNER_INVITE_REISSUE_PRECONDITION_FAILED',
      });
    }
    if (state === '42501') {
      return new ForbiddenException(
        'Owner invite reissue authority is no longer active',
      );
    }
    return new ServiceUnavailableException({
      message: 'Owner invite reissue failed closed',
      reasonCode: 'FOUNDER_OWNER_INVITE_REISSUE_CONTAINED',
    });
  }

  private sqlState(error: unknown): string {
    if (!this.record(error) || typeof error.code !== 'string') return '';
    if (
      error.code === 'P2010' &&
      this.record(error.meta) &&
      typeof error.meta.code === 'string'
    ) {
      return error.meta.code;
    }
    return error.code;
  }

  private futureTimestamp(value: unknown): Date {
    if (typeof value !== 'string') {
      throw new BadRequestException('expiresAt must be an ISO timestamp');
    }
    const expiresAt = new Date(value);
    const now = this.clock();
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.toISOString() !== value ||
      expiresAt.getTime() < now.getTime() + MINIMUM_INVITE_LIFETIME_MS ||
      expiresAt.getTime() > now.getTime() + MAXIMUM_INVITE_LIFETIME_MS
    ) {
      throw new BadRequestException('expiresAt is outside the allowed window');
    }
    return expiresAt;
  }

  private environment(): string {
    const environment = resolveIdentityMailAadEnvironment(
      this.config.get<unknown>('IDENTITY_MAIL_AAD_ENVIRONMENT'),
    );
    if (!environment) {
      throw new ServiceUnavailableException({
        message: 'Owner invite reissue environment is unavailable',
        reasonCode: 'FOUNDER_OWNER_INVITE_ENVIRONMENT_INVALID',
      });
    }
    return environment;
  }

  private derivedUuid(domain: string, ...parts: string[]): string {
    const bytes = createHash('sha256')
      .update(`${FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT}\0${domain}\0`)
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

  private assertOwnerIdentityNotCopied(
    input: ParsedRevoke,
    ownerEmail: string,
  ): void {
    const canonicalEmail = ownerEmail.trim().toLowerCase();
    if (
      [input.requestId, input.reason, input.supportTicket]
        .filter((value): value is string => value !== null)
        .some((value) => value.toLowerCase().includes(canonicalEmail))
    ) {
      throw new BadRequestException({
        message: 'Owner identity must not be copied into operational metadata',
        reasonCode: 'FOUNDER_OWNER_INVITE_IDENTITY_METADATA_FORBIDDEN',
      });
    }
  }

  private inviteState(
    invite: OwnerInviteAggregate['invite'],
    now: Date,
  ): InviteState {
    if (invite.acceptedAt) return 'ACCEPTED';
    if (invite.revokedAt) return 'REVOKED';
    if (invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
    return 'ACTIVE';
  }

  private ownerInviteStage(tenant: OwnerInviteAggregate['tenant']): boolean {
    return (
      tenant.status === TenantLifecycleStatus.ACTIVE &&
      tenant.customerStage === TenantCustomerStage.PILOT &&
      tenant.onboardingStatus === TenantOnboardingStatus.OWNER_INVITED
    );
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor?.id || !actor.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access is required');
    }
  }

  private uuid(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a UUID`);
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== value || !UUID_PATTERN.test(normalized)) {
      throw new BadRequestException(`${field} must be a canonical UUID`);
    }
    return normalized;
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
    const normalized = value.trim();
    if (
      normalized !== value ||
      normalized.length < minimum ||
      normalized.length > maximum ||
      this.hasControlCharacter(normalized)
    ) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return normalized;
  }

  private optionalText(
    value: unknown,
    field: string,
    maximum: number,
  ): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredText(value, field, 1, maximum);
  }

  private digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private textDigest(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private hasControlCharacter(value: string): boolean {
    for (const character of value) {
      const code = character.charCodeAt(0);
      if (code <= 31 || code === 127) return true;
    }
    return false;
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private hasExactKeys(
    value: Record<string, unknown>,
    expected: string[],
  ): boolean {
    const actual = Object.keys(value).sort();
    return (
      actual.length === expected.length &&
      expected
        .slice()
        .sort()
        .every((key, index) => actual[index] === key)
    );
  }
}
