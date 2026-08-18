import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdentityMailOutboxStatus,
  Prisma,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
} from '../auth/identity-email-claim.service';
import { PrismaService } from '../prisma/prisma.service';

export const FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT =
  'FOUNDER_OWNER_INVITE_LIFECYCLE_V1' as const;

const REVOKE_ACTION = 'FOUNDER_OWNER_INVITE_REVOKED' as const;
const REVOKE_FIELDS = new Set([
  'confirmation',
  'requestId',
  'reason',
  'supportTicket',
  'expectedInviteId',
]);
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

@Injectable()
export class FounderOwnerInviteLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityClaimBoundary: IdentityEmailClaimService,
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
    const activation = await tx.founderOperatorBetaActivationCommand.findUnique(
      {
        where: { tenantId },
        select: { inviteId: true, outboxId: true },
      },
    );
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
      reasonDigest: this.digest(input.reason),
      supportTicketDigest: input.supportTicket
        ? this.digest(input.supportTicket)
        : null,
    });
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
