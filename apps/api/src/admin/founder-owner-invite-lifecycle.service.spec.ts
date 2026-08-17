import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  IdentityMailOutboxStatus,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
} from '../auth/identity-email-claim.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
  FounderOwnerInviteLifecycleService,
} from './founder-owner-invite-lifecycle.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';
const OUTBOX_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_EMAIL = 'owner@example.test';

type PrismaMock = {
  tenant: { findUnique: jest.Mock };
  founderOperatorBetaActivationCommand: { findUnique: jest.Mock };
  userInvite: { findFirst: jest.Mock; updateMany: jest.Mock };
  identityMailOutbox: { findFirst: jest.Mock; updateMany: jest.Mock };
  platformAdminAuditEvent: { findUnique: jest.Mock; create: jest.Mock };
  user: { findUnique: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const actor = {
  id: ACTOR_ID,
  isPlatformAdmin: true,
} as AuthenticatedUser;

function revokeBody(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: `REVOKE OWNER INVITE ${TENANT_ID}`,
    requestId: 'owner-revoke-request-1',
    reason: 'Owner mailbox must be replaced before onboarding',
    supportTicket: 'BETA-OWNER-1',
    expectedInviteId: INVITE_ID,
    ...overrides,
  };
}

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    tenant: { findUnique: jest.fn() },
    founderOperatorBetaActivationCommand: { findUnique: jest.fn() },
    userInvite: { findFirst: jest.fn(), updateMany: jest.fn() },
    identityMailOutbox: { findFirst: jest.fn(), updateMany: jest.fn() },
    platformAdminAuditEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: PrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

function callArgument(mock: jest.Mock, callIndex = 0): Record<string, unknown> {
  const calls = mock.mock.calls as unknown[][];
  const argument = calls[callIndex]?.[0];
  if (
    typeof argument !== 'object' ||
    argument === null ||
    Array.isArray(argument)
  ) {
    throw new Error('Expected a record mock argument');
  }
  return argument as Record<string, unknown>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const preservedDeliveryCases: Array<
  [IdentityMailOutboxStatus, string | null, string]
> = [
  [IdentityMailOutboxStatus.SENT, null, 'TERMINAL_PRESERVED'],
  [
    IdentityMailOutboxStatus.CLAIMED,
    'provider-attempt-1',
    'PROVIDER_ATTEMPT_PRESERVED',
  ],
  [
    IdentityMailOutboxStatus.RECONCILIATION_REQUIRED,
    'provider-attempt-1',
    'PROVIDER_ATTEMPT_PRESERVED',
  ],
];

describe('FounderOwnerInviteLifecycleService', () => {
  let prisma: PrismaMock;
  let identity: IdentityEmailClaimService;
  let lockTenantTransaction: jest.SpiedFunction<
    IdentityEmailClaimService['lockTenantTransaction']
  >;
  let releaseInvite: jest.SpiedFunction<
    IdentityEmailClaimService['releaseInvite']
  >;
  let service: FounderOwnerInviteLifecycleService;
  let invite: {
    id: string;
    email: string;
    role: UserRole;
    accessScope: UserAccessScope;
    customRoleId: null;
    storeIds: string[];
    expiresAt: Date;
    acceptedAt: null;
    revokedAt: null;
    revokedByUserId: null;
    identityClaimRevision: number;
    updatedAt: Date;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    identity = new IdentityEmailClaimService({
      get: jest.fn(),
    } as unknown as ConfigService);
    lockTenantTransaction = jest.spyOn(identity, 'lockTenantTransaction');
    lockTenantTransaction.mockImplementation((tx) =>
      Promise.resolve(tx as never),
    );
    releaseInvite = jest.spyOn(identity, 'releaseInvite');
    releaseInvite.mockResolvedValue({
      schemaVersion: 2,
      operation: 'RELEASE_INVITE',
      decision: 'RELEASED',
      tenantId: TENANT_ID,
      subjectId: INVITE_ID,
      releasedRevision: 2,
    });
    service = new FounderOwnerInviteLifecycleService(
      prisma as unknown as PrismaService,
      identity,
    );

    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      isPlatformAdmin: true,
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      status: TenantLifecycleStatus.ACTIVE,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
    });
    prisma.founderOperatorBetaActivationCommand.findUnique.mockResolvedValue({
      inviteId: INVITE_ID,
      outboxId: OUTBOX_ID,
    });
    invite = {
      id: INVITE_ID,
      email: OWNER_EMAIL,
      role: UserRole.OWNER,
      accessScope: UserAccessScope.NETWORK,
      customRoleId: null,
      storeIds: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      acceptedAt: null,
      revokedAt: null,
      revokedByUserId: null,
      identityClaimRevision: 2,
      updatedAt: new Date('2026-08-18T00:00:00.000Z'),
    };
    prisma.userInvite.findFirst.mockImplementation(() =>
      Promise.resolve(invite),
    );
    prisma.identityMailOutbox.findFirst.mockResolvedValue({
      id: OUTBOX_ID,
      status: IdentityMailOutboxStatus.PENDING,
      providerAttemptKey: null,
    });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.identityMailOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue(null);
  });

  it('returns a PII-free tenant-bound status under fresh database authority', async () => {
    const result = await service.status(actor, TENANT_ID);

    expect(result).toEqual({
      ok: true,
      contractVersion: FOUNDER_OWNER_INVITE_LIFECYCLE_CONTRACT,
      tenant: {
        id: TENANT_ID,
        status: TenantLifecycleStatus.ACTIVE,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      },
      ownerInvite: {
        id: INVITE_ID,
        state: 'ACTIVE',
        deliveryStatus: IdentityMailOutboxStatus.PENDING,
        expiresAt: invite.expiresAt.toISOString(),
      },
      actions: { revokeAllowed: true, reissueRequired: false },
    });
    expect(JSON.stringify(result)).not.toContain(OWNER_EMAIL);
    expect(lockTenantTransaction).toHaveBeenCalledWith(prisma, TENANT_ID);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: ACTOR_ID },
      select: { isActive: true, isPlatformAdmin: true },
    });
  });

  it('atomically revokes the invite, cancels pre-provider delivery and releases the claim', async () => {
    const result = await service.revoke(actor, TENANT_ID, revokeBody());

    expect(result).toMatchObject({
      ok: true,
      decision: 'REVOKED',
      replayed: false,
      tenantId: TENANT_ID,
      inviteId: INVITE_ID,
      inviteState: 'REVOKED',
      deliveryStatus: IdentityMailOutboxStatus.CANCELED,
      deliveryDisposition: 'CANCELED_BEFORE_PROVIDER',
    });
    expect(callArgument(prisma.userInvite.updateMany)).toMatchObject({
      where: {
        id: INVITE_ID,
        tenantId: TENANT_ID,
        acceptedAt: null,
        revokedAt: null,
        updatedAt: invite.updatedAt,
      },
      data: { revokedByUserId: ACTOR_ID },
    });
    expect(callArgument(prisma.identityMailOutbox.updateMany)).toMatchObject({
      where: {
        id: OUTBOX_ID,
        tenantId: TENANT_ID,
        status: IdentityMailOutboxStatus.PENDING,
        providerAttemptKey: null,
      },
      data: {
        status: IdentityMailOutboxStatus.CANCELED,
        stateReasonCode: 'OWNER_INVITE_REVOKED',
        secretCiphertext: null,
      },
    });
    expect(releaseInvite).toHaveBeenCalledWith(prisma, {
      email: OWNER_EMAIL,
      tenantId: TENANT_ID,
      expectedSubjectId: INVITE_ID,
      expectedRevision: 2,
    });
    expect(
      prisma.userInvite.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(releaseInvite.mock.invocationCallOrder[0] ?? 0);
    expect(releaseInvite.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.platformAdminAuditEvent.create.mock.invocationCallOrder[0] ?? 0,
    );
    const audit = callArgument(prisma.platformAdminAuditEvent.create);
    expect(audit).toMatchObject({
      data: {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_ID,
        requestId: 'owner-revoke-request-1',
        action: 'FOUNDER_OWNER_INVITE_REVOKED',
        targetType: 'UserInvite',
        targetId: INVITE_ID,
        metadata: {
          identityClaimReleased: true,
          expectedInviteId: INVITE_ID,
        },
      },
    });
    expect(JSON.stringify({ result, audit })).not.toContain(OWNER_EMAIL);
  });

  it.each(preservedDeliveryCases)(
    'preserves delivery evidence for %s while invalidating the invite',
    async (status, providerAttemptKey, disposition) => {
      prisma.identityMailOutbox.findFirst.mockResolvedValue({
        id: OUTBOX_ID,
        status,
        providerAttemptKey,
      });

      await expect(
        service.revoke(actor, TENANT_ID, revokeBody()),
      ).resolves.toMatchObject({
        deliveryStatus: status,
        deliveryDisposition: disposition,
      });
      expect(prisma.identityMailOutbox.updateMany).not.toHaveBeenCalled();
      expect(releaseInvite).toHaveBeenCalledTimes(1);
    },
  );

  it('replays only the exact immutable audit receipt without touching identity state', async () => {
    const created = await service.revoke(actor, TENANT_ID, revokeBody());
    const auditCall = callArgument(prisma.platformAdminAuditEvent.create);
    if (!record(auditCall.data)) {
      throw new Error('Expected audit data');
    }
    const auditData = auditCall.data;
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: auditData.after,
      metadata: auditData.metadata,
    });
    prisma.userInvite.updateMany.mockClear();
    prisma.identityMailOutbox.updateMany.mockClear();
    releaseInvite.mockClear();

    await expect(
      service.revoke(actor, TENANT_ID, revokeBody()),
    ).resolves.toEqual({
      ...created,
      decision: 'REPLAYED',
      replayed: true,
    });
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();
    expect(prisma.identityMailOutbox.updateMany).not.toHaveBeenCalled();
    expect(releaseInvite).not.toHaveBeenCalled();

    await expect(
      service.revoke(
        actor,
        TENANT_ID,
        revokeBody({ reason: 'A materially different revocation reason' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed on stale actor, tenant, invite and delivery state', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      isActive: false,
      isPlatformAdmin: true,
    });
    await expect(
      service.revoke(actor, TENANT_ID, revokeBody()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      isPlatformAdmin: true,
    });
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: TENANT_ID,
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
    });
    await expect(
      service.revoke(actor, TENANT_ID, revokeBody()),
    ).rejects.toMatchObject({
      response: { reasonCode: 'FOUNDER_OWNER_INVITE_TENANT_STATE_INVALID' },
    });

    await expect(
      service.revoke(
        actor,
        TENANT_ID,
        revokeBody({
          expectedInviteId: '55555555-5555-4555-8555-555555555555',
        }),
      ),
    ).rejects.toMatchObject({
      response: { reasonCode: 'FOUNDER_OWNER_INVITE_CHANGED' },
    });

    prisma.identityMailOutbox.findFirst.mockResolvedValueOnce({
      id: OUTBOX_ID,
      status: IdentityMailOutboxStatus.HOLD,
      providerAttemptKey: null,
    });
    await expect(
      service.revoke(actor, TENANT_ID, revokeBody()),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OWNER_INVITE_DELIVERY_STATE_INVALID',
      },
    });
  });

  it('rejects malformed authority before opening a transaction', async () => {
    await expect(
      service.revoke(actor, TENANT_ID, revokeBody({ confirmation: 'REVOKE' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.revoke(actor, TENANT_ID, revokeBody({ ownerEmail: OWNER_EMAIL })),
    ).rejects.toMatchObject({
      response: { reasonCode: 'FOUNDER_OWNER_INVITE_FIELD_NOT_ALLOWED' },
    });
    await expect(
      service.revoke(
        { id: ACTOR_ID } as AuthenticatedUser,
        TENANT_ID,
        revokeBody(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects copying the owner mailbox into persisted audit metadata', async () => {
    await expect(
      service.revoke(
        actor,
        TENANT_ID,
        revokeBody({
          reason: `Revoke the initial invite for ${OWNER_EMAIL}`,
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'FOUNDER_OWNER_INVITE_IDENTITY_METADATA_FORBIDDEN',
      },
    });
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('uses the common tenant-lock transaction options for status and revoke', async () => {
    await service.status(actor, TENANT_ID);
    await service.revoke(actor, TENANT_ID, revokeBody());

    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    );
    expect(prisma.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    );
  });
});
