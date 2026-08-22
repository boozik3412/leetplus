import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  IdentityEmailClaimType,
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import { TenantExecutionPolicyService } from '../tenancy/tenant-execution-policy.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import {
  IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
  IdentityEmailClaimService,
} from './identity-email-claim.service';
import { InitialOwnerInviteDeliveryGateService } from './initial-owner-invite-delivery-gate.service';

const BEARER_INVITE_TOKEN = 'A'.repeat(43);
const OWNER_INVITE_TOKEN = 'B'.repeat(43);
const MEMBER_INVITE_TOKEN = 'C'.repeat(43);
const LEGACY_INVITE_TOKEN = 'D'.repeat(43);

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    count: jest.Mock;
  };
  userRoleOverride: {
    findUnique: jest.Mock;
  };
  tenant: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  tenantModuleEntitlement: {
    findMany: jest.Mock;
  };
  userInvite: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  userStoreAccess: {
    createMany: jest.Mock;
  };
  platformAdminAuditEvent: {
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

function completeEntitlements(profileRevision = 1) {
  return COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
    module,
    readEnabled: true,
    writeEnabled: true,
    outboundEnabled: false,
    validFrom: null,
    validUntil: null,
    profileRevision,
  }));
}

type PasswordMock = {
  hash: jest.Mock;
  verify: jest.Mock;
};

type JwtMock = {
  signAsync: jest.Mock;
};

type EmailVerificationMock = {
  sendVerificationEmail: jest.Mock;
  confirmEmail: jest.Mock;
  resendByEmail: jest.Mock;
};

type IdentityEmailClaimMock = {
  runTenantTransaction: jest.Mock;
  assertInvite: jest.Mock;
  transitionInvite: jest.Mock;
};

type InitialOwnerInviteDeliveryGateMock = {
  assertSent: jest.Mock;
  assertSentInTransaction: jest.Mock;
};

function createUserWithTenant() {
  return {
    id: 'user-1',
    email: 'owner@club-a.leetplus.ru',
    fullName: 'Owner',
    role: UserRole.OWNER,
    customRoleId: null,
    isActive: true,
    isPlatformAdmin: false,
    passwordHash: 'hash',
    tenantId: 'tenant-1',
    accessScope: 'NETWORK',
    storeAccesses: [],
    tenant: {
      slug: 'club-a',
      status: TenantLifecycleStatus.ACTIVE,
      customerStage: TenantCustomerStage.INTERNAL,
      onboardingStatus: TenantOnboardingStatus.ACTIVE,
      trialStartsAt: null,
      trialEndsAt: null,
      entitlementProfileRevision: 0,
      executionRevision: 1,
      moduleEntitlements: [],
    },
  };
}

function createInviteTenant(onboardingStatus = TenantOnboardingStatus.ACTIVE) {
  return {
    id: 'tenant-1',
    name: 'Club A',
    slug: 'club-a',
    status: TenantLifecycleStatus.ACTIVE,
    customerStage: TenantCustomerStage.PILOT,
    onboardingStatus,
    trialStartsAt: new Date(Date.now() - 60_000),
    trialEndsAt: new Date(Date.now() + 3_600_000),
    entitlementProfileRevision: 1,
    executionRevision: 1,
    moduleEntitlements: completeEntitlements(),
  };
}

function createMemberInvite(onboardingStatus = TenantOnboardingStatus.ACTIVE) {
  return {
    id: 'invite-member-1',
    tenantId: 'tenant-1',
    tokenHash: createHash('sha256').update(MEMBER_INVITE_TOKEN).digest('hex'),
    email: 'invitee@example.test',
    fullName: 'Invitee',
    role: UserRole.CLUB_ADMINISTRATOR,
    customRoleId: null,
    customRole: null,
    accessScope: UserAccessScope.NETWORK,
    storeIds: [],
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    revokedAt: null,
    revokedByUserId: null,
    updatedAt: new Date(),
    identityClaimRevision: 2,
    tenant: createInviteTenant(onboardingStatus),
  };
}

function createOwnerInvite() {
  return {
    ...createMemberInvite(TenantOnboardingStatus.OWNER_INVITED),
    id: 'invite-owner-1',
    tokenHash: createHash('sha256').update(OWNER_INVITE_TOKEN).digest('hex'),
    email: 'owner@club-a.leetplus.ru',
    fullName: 'Owner',
    role: UserRole.OWNER,
  };
}

describe('AuthService', () => {
  let prisma: PrismaMock;
  let passwordService: PasswordMock;
  let jwtService: JwtMock;
  let emailVerificationService: EmailVerificationMock;
  let identityEmailClaim: IdentityEmailClaimMock;
  let initialOwnerInviteDeliveryGate: InitialOwnerInviteDeliveryGateMock;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      userRoleOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      tenantModuleEntitlement: {
        findMany: jest.fn().mockResolvedValue(completeEntitlements()),
      },
      userInvite: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      userStoreAccess: {
        createMany: jest.fn(),
      },
      platformAdminAuditEvent: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (operation: (tx: PrismaMock) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.$queryRaw.mockResolvedValue([createInviteTenant()]);
    prisma.user.count.mockResolvedValue(0);
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      onboardingStatus: TenantOnboardingStatus.ONBOARDING,
      executionRevision: 2,
    });
    passwordService = {
      hash: jest.fn().mockResolvedValue('hash'),
      verify: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    emailVerificationService = {
      sendVerificationEmail: jest.fn(),
      confirmEmail: jest.fn(),
      resendByEmail: jest.fn(),
    };
    identityEmailClaim = {
      runTenantTransaction: jest.fn(
        async (
          host: PrismaMock,
          _transactionTenantId: string,
          operation: (tx: PrismaMock, identityTx: unknown) => Promise<unknown>,
        ): Promise<unknown> =>
          (await host.$transaction(
            (tx: PrismaMock) => operation(tx, tx),
            IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
          )) as unknown,
      ),
      assertInvite: jest.fn().mockResolvedValue({
        schemaVersion: 1,
        operation: 'ASSERT_INVITE',
        decision: 'MATCHED',
        claimType: IdentityEmailClaimType.INVITE,
        tenantId: 'tenant-1',
        subjectId: 'invite-member-1',
        revision: 2,
      }),
      transitionInvite: jest.fn().mockResolvedValue({
        schemaVersion: 2,
        operation: 'TRANSITION_INVITE',
        decision: 'TRANSITIONED',
        claimType: IdentityEmailClaimType.USER,
        tenantId: 'tenant-1',
        subjectId: 'user-1',
        revision: 3,
      }),
    };
    initialOwnerInviteDeliveryGate = {
      assertSent: jest.fn().mockResolvedValue(undefined),
      assertSentInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService,
      jwtService as unknown as JwtService,
      emailVerificationService as unknown as EmailVerificationService,
      { get: jest.fn() } as never,
      new AccessScopeService(),
      new TenantExecutionPolicyService(),
      identityEmailClaim as unknown as IdentityEmailClaimService,
      initialOwnerInviteDeliveryGate as unknown as InitialOwnerInviteDeliveryGateService,
    );
  });

  it('keeps service-level self-registration fail-closed', () => {
    expect(() =>
      service.register({
        email: 'owner@example.com',
        password: 'strong-password',
        confirmPassword: 'strong-password',
        organizationName: 'Club A',
        tenantSlug: 'club-a',
      }),
    ).toThrow(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(passwordService.hash).not.toHaveBeenCalled();
  });

  it('logs in with valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());
    passwordService.verify.mockResolvedValue(true);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
      }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        tenantId: 'tenant-1',
      },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1' }),
      { expiresIn: '24h' },
    );
  });

  it('does not issue a session after the tenant trial expires', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...createUserWithTenant(),
      tenant: {
        ...createUserWithTenant().tenant,
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date('2026-01-01T00:00:00.000Z'),
        trialEndsAt: new Date('2026-01-31T00:00:00.000Z'),
      },
    });
    passwordService.verify.mockResolvedValue(true);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('does not issue a session for an external tenant with a partial profile', async () => {
    const tenant = createInviteTenant(TenantOnboardingStatus.ACTIVE);
    prisma.user.findUnique.mockResolvedValue({
      ...createUserWithTenant(),
      tenant: {
        ...tenant,
        moduleEntitlements: tenant.moduleEntitlements.slice(0, 5),
      },
    });
    passwordService.verify.mockResolvedValue(true);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());
    passwordService.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed login payload without querying users', async () => {
    await expect(
      service.login({ password: 'strong-password' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns current user by token subject', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());

    await expect(service.me('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      tenantSlug: 'club-a',
    });
  });

  it('confirms email by verification token', async () => {
    emailVerificationService.confirmEmail.mockResolvedValue({ ok: true });

    await expect(service.confirmEmail('token-1')).resolves.toEqual({
      ok: true,
    });
    expect(emailVerificationService.confirmEmail).toHaveBeenCalledWith(
      'token-1',
    );
  });

  it('resends verification email for normalized address', async () => {
    emailVerificationService.resendByEmail.mockResolvedValue({ ok: true });

    await expect(
      service.resendVerificationEmail(' OWNER@CLUB-A.LEETPLUS.RU '),
    ).resolves.toEqual({ ok: true });
    expect(emailVerificationService.resendByEmail).toHaveBeenCalledWith(
      'owner@club-a.leetplus.ru',
    );
  });

  it('resolves an invite only by the hash of its opaque bearer token', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createMemberInvite());

    await expect(service.getInvite(BEARER_INVITE_TOKEN)).resolves.toMatchObject(
      {
        email: 'invitee@example.test',
        scope: 'NETWORK',
      },
    );
    expect(prisma.userInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256')
            .update(BEARER_INVITE_TOKEN)
            .digest('hex'),
          revokedAt: null,
        },
      }),
    );
    expect(initialOwnerInviteDeliveryGate.assertSent).not.toHaveBeenCalled();
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('requires SENT evidence before exposing an initial owner invite', async () => {
    const ownerInvite = createOwnerInvite();
    prisma.userInvite.findUnique.mockResolvedValue(ownerInvite);

    await expect(service.getInvite(OWNER_INVITE_TOKEN)).resolves.toMatchObject({
      email: 'owner@club-a.leetplus.ru',
      role: UserRole.OWNER,
      scope: 'NETWORK',
    });

    expect(initialOwnerInviteDeliveryGate.assertSent).toHaveBeenCalledTimes(1);
    expect(initialOwnerInviteDeliveryGate.assertSent).toHaveBeenCalledWith({
      tenantId: ownerInvite.tenantId,
      inviteId: ownerInvite.id,
      tokenHash: ownerInvite.tokenHash,
    });
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', ` ${BEARER_INVITE_TOKEN}`],
    ['short', 'A'.repeat(42)],
    ['long', 'A'.repeat(44)],
    ['standard base64 plus', `${'A'.repeat(42)}+`],
    ['standard base64 slash', `${'A'.repeat(42)}/`],
    ['padded', `${'A'.repeat(42)}=`],
  ])(
    'rejects a %s invite token before database access',
    async (_case, token) => {
      await expect(service.getInvite(token)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.userInvite.findUnique).not.toHaveBeenCalled();
      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'duplicate',
      [...completeEntitlements().slice(0, 5), { ...completeEntitlements()[0] }],
    ],
    [
      'mixed revision',
      completeEntitlements().map((entry) =>
        entry.module === TenantModule.INTEGRATIONS
          ? { ...entry, profileRevision: 2 }
          : entry,
      ),
    ],
  ])(
    'does not expose an invite with a %s entitlement profile',
    async (_profileCase, moduleEntitlements) => {
      prisma.userInvite.findUnique.mockResolvedValue({
        ...createMemberInvite(),
        tenant: {
          ...createInviteTenant(),
          moduleEntitlements,
        },
      });

      await expect(
        service.getInvite(BEARER_INVITE_TOKEN),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('transitions the first owner invite into ONBOARDING atomically', async () => {
    const ownerInvite = createOwnerInvite();
    prisma.userInvite.findUnique.mockResolvedValue(ownerInvite);
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'ignored-generated-user' });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
    prisma.user.findUniqueOrThrow.mockImplementation(
      ({ where }: { where: { id: string } }) => ({
        ...createUserWithTenant(),
        id: where.id,
      }),
    );

    const response = await service.acceptInvite(OWNER_INVITE_TOKEN, {
      password: 'strong-password',
      confirmPassword: 'strong-password',
    });
    const userCreate = prisma.user.create as jest.Mock<
      Promise<unknown>,
      [{ data: Record<string, unknown> }]
    >;
    const generatedUserId = userCreate.mock.calls[0]?.[0].data.id;
    if (typeof generatedUserId !== 'string') {
      throw new Error('Expected acceptance to create a user with a string id');
    }
    expect(generatedUserId).toEqual(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(response).toMatchObject({
      accessToken: 'signed-token',
      user: {
        id: generatedUserId,
        role: UserRole.OWNER,
      },
    });
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(userCreate.mock.calls[0]?.[0].data).toMatchObject({
      id: generatedUserId,
      tenantId: 'tenant-1',
      email: 'owner@club-a.leetplus.ru',
      role: UserRole.OWNER,
      customRoleId: null,
      accessScope: UserAccessScope.NETWORK,
      isActive: true,
      identityClaimRevision: null,
    });
    expect(userCreate.mock.calls[0]?.[0].data.passwordHash).not.toBe(
      'strong-password',
    );

    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'tenant-1',
        status: TenantLifecycleStatus.ACTIVE,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        entitlementProfileRevision: 1,
        executionRevision: 1,
      },
      data: {
        onboardingStatus: TenantOnboardingStatus.ONBOARDING,
      },
    });
    const auditCreate = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [{ data: Record<string, unknown> }]
    >;
    const auditCall = auditCreate.mock.calls[0];
    expect(auditCall?.[0].data).toMatchObject({
      tenantId: 'tenant-1',
      actorUserId: generatedUserId,
      action: 'TENANT_OWNER_INVITE_ACCEPTED',
      before: {
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        executionRevision: 1,
      },
      after: {
        onboardingStatus: TenantOnboardingStatus.ONBOARDING,
        executionRevision: 2,
      },
      metadata: {
        inviteId: 'invite-owner-1',
        ownerUserId: generatedUserId,
        executionRevisionBefore: 1,
        executionRevisionAfter: 2,
      },
    });
    expect(JSON.stringify(auditCall?.[0].data)).not.toContain(
      OWNER_INVITE_TOKEN,
    );
    expect(JSON.stringify(auditCall?.[0].data)).not.toContain(
      'owner@club-a.leetplus.ru',
    );

    expect(identityEmailClaim.runTenantTransaction).toHaveBeenCalledWith(
      prisma,
      'tenant-1',
      expect.any(Function),
    );
    const transactionCalls = prisma.$transaction.mock.calls as unknown[][];
    expect(transactionCalls[0]?.[1]).toEqual(
      IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
    );
    expect(identityEmailClaim.assertInvite).toHaveBeenCalledWith(prisma, {
      email: 'owner@club-a.leetplus.ru',
      tenantId: 'tenant-1',
      subjectId: 'invite-owner-1',
      expectedRevision: 2,
    });
    const deliveryAssertionInput = {
      tenantId: ownerInvite.tenantId,
      inviteId: ownerInvite.id,
      tokenHash: ownerInvite.tokenHash,
    };
    expect(initialOwnerInviteDeliveryGate.assertSent).toHaveBeenCalledTimes(1);
    expect(initialOwnerInviteDeliveryGate.assertSent).toHaveBeenCalledWith(
      deliveryAssertionInput,
    );
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).toHaveBeenCalledWith(prisma, deliveryAssertionInput);
    const inviteUpdateMany = prisma.userInvite.updateMany as jest.Mock<
      Promise<unknown>,
      [
        {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        },
      ]
    >;
    const inviteUpdateCall = inviteUpdateMany.mock.calls[0]?.[0];
    if (!inviteUpdateCall) {
      throw new Error('Expected acceptance to update the invite');
    }
    const acceptedAt = inviteUpdateCall.data.acceptedAt;
    expect(acceptedAt).toBeInstanceOf(Date);
    expect(inviteUpdateCall).toEqual({
      where: {
        id: 'invite-owner-1',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: acceptedAt },
        updatedAt: ownerInvite.updatedAt,
      },
      data: {
        acceptedAt,
        acceptedByUserId: generatedUserId,
      },
    });
    expect(identityEmailClaim.transitionInvite).toHaveBeenCalledWith(prisma, {
      email: 'owner@club-a.leetplus.ru',
      tenantId: 'tenant-1',
      expectedSubjectId: 'invite-owner-1',
      expectedRevision: 2,
      nextClaimType: IdentityEmailClaimType.USER,
      nextSubjectId: generatedUserId,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: generatedUserId },
      data: { identityClaimRevision: 3 },
    });

    const firstInvocation = (mock: jest.Mock): number => {
      const invocationOrder = mock.mock.invocationCallOrder[0];
      if (invocationOrder === undefined) {
        throw new Error('Expected mock to have been invoked');
      }
      return invocationOrder;
    };
    expect(
      firstInvocation(identityEmailClaim.runTenantTransaction),
    ).toBeLessThan(firstInvocation(identityEmailClaim.assertInvite));
    expect(firstInvocation(identityEmailClaim.assertInvite)).toBeLessThan(
      firstInvocation(prisma.$queryRaw),
    );
    expect(firstInvocation(prisma.$queryRaw)).toBeLessThan(
      firstInvocation(initialOwnerInviteDeliveryGate.assertSentInTransaction),
    );
    expect(
      firstInvocation(initialOwnerInviteDeliveryGate.assertSentInTransaction),
    ).toBeLessThan(firstInvocation(prisma.user.count));
    expect(firstInvocation(prisma.user.count)).toBeLessThan(
      firstInvocation(prisma.user.create),
    );
    expect(firstInvocation(prisma.user.create)).toBeLessThan(
      firstInvocation(prisma.userInvite.updateMany),
    );
    expect(firstInvocation(prisma.userInvite.updateMany)).toBeLessThan(
      firstInvocation(identityEmailClaim.transitionInvite),
    );
    expect(firstInvocation(identityEmailClaim.transitionInvite)).toBeLessThan(
      firstInvocation(prisma.user.update),
    );
    expect(firstInvocation(prisma.user.update)).toBeLessThan(
      firstInvocation(prisma.user.findUniqueOrThrow),
    );
    expect(
      firstInvocation(initialOwnerInviteDeliveryGate.assertSent),
    ).toBeLessThan(firstInvocation(passwordService.hash));
  });

  it('fails before password hashing when the initial owner delivery is not SENT', async () => {
    const rejection = new UnauthorizedException({
      message: 'Initial owner invite delivery is not verified',
      reasonCode: 'INITIAL_OWNER_INVITE_DELIVERY_NOT_SENT',
    });
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    initialOwnerInviteDeliveryGate.assertSent.mockRejectedValue(rejection);

    await expect(
      service.acceptInvite(OWNER_INVITE_TOKEN, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      }),
    ).rejects.toBe(rejection);

    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(identityEmailClaim.assertInvite).not.toHaveBeenCalled();
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rechecks SENT inside the locked acceptance transaction before creating the owner', async () => {
    const rejection = new UnauthorizedException({
      message: 'Initial owner invite delivery is not verified',
      reasonCode: 'INITIAL_OWNER_INVITE_DELIVERY_NOT_SENT',
    });
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    initialOwnerInviteDeliveryGate.assertSentInTransaction.mockRejectedValue(
      rejection,
    );

    await expect(
      service.acceptInvite(OWNER_INVITE_TOKEN, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      }),
    ).rejects.toBe(rejection);

    expect(identityEmailClaim.assertInvite).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      initialOwnerInviteDeliveryGate.assertSentInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed for a legacy invite without identity provenance before writes', async () => {
    const token = LEGACY_INVITE_TOKEN;
    const email = 'invitee@example.test';
    prisma.userInvite.findUnique.mockResolvedValue({
      ...createMemberInvite(),
      email,
      identityClaimRevision: null,
    });

    let rejection: unknown;
    try {
      await service.acceptInvite(token, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(ServiceUnavailableException);
    const response = (rejection as ServiceUnavailableException).getResponse();
    expect(response).toMatchObject({
      reasonCode: 'IDENTITY_INVITE_PROVENANCE_REQUIRED',
    });
    expect(JSON.stringify(response)).not.toContain(token);
    expect(JSON.stringify(response)).not.toContain(email);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(identityEmailClaim.runTenantTransaction).not.toHaveBeenCalled();
    expect(identityEmailClaim.assertInvite).not.toHaveBeenCalled();
    expect(identityEmailClaim.transitionInvite).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();
    expect(prisma.userStoreAccess.createMany).not.toHaveBeenCalled();
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('propagates identity transition failure so the acceptance transaction rolls back', async () => {
    const transitionError = new ConflictException({
      message: 'Identity claim state changed',
      reasonCode: 'IDENTITY_CLAIM_STATE_MISMATCH',
    });
    prisma.userInvite.findUnique.mockResolvedValue(createMemberInvite());
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'ignored-generated-user' });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    identityEmailClaim.transitionInvite.mockRejectedValue(transitionError);
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();

    try {
      await expect(
        service.acceptInvite(MEMBER_INVITE_TOKEN, {
          password: 'strong-password',
          confirmPassword: 'strong-password',
        }),
      ).rejects.toBe(transitionError);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(prisma.userInvite.updateMany).toHaveBeenCalledTimes(1);
      expect(identityEmailClaim.transitionInvite).toHaveBeenCalledTimes(1);
      expect(initialOwnerInviteDeliveryGate.assertSent).not.toHaveBeenCalled();
      expect(
        initialOwnerInviteDeliveryGate.assertSentInTransaction,
      ).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  it('rejects a bootstrap invite that is not the exact NETWORK OWNER shape', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(
      createMemberInvite(TenantOnboardingStatus.OWNER_INVITED),
    );

    await expect(service.getInvite(MEMBER_INVITE_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an additional OWNER without an owner-transfer workflow', async () => {
    prisma.userInvite.findUnique.mockResolvedValue({
      ...createOwnerInvite(),
      tenant: createInviteTenant(TenantOnboardingStatus.ACTIVE),
    });

    await expect(service.getInvite(OWNER_INVITE_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rolls back owner acceptance when the onboarding transition loses its CAS', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

    let rejection: unknown;
    try {
      await service.acceptInvite(OWNER_INVITE_TOKEN, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(ConflictException);

    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('rolls back owner acceptance when the trigger does not advance the execution revision', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      onboardingStatus: TenantOnboardingStatus.ONBOARDING,
      executionRevision: 1,
    });

    await expect(
      service.acceptInvite(OWNER_INVITE_TOKEN, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('rejects owner bootstrap when any owner record already exists', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.acceptInvite(OWNER_INVITE_TOKEN, {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        role: UserRole.OWNER,
      },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userInvite.updateMany).not.toHaveBeenCalled();
  });

  it('does not expose an invite after the tenant trial expires', async () => {
    const expiredTenant = {
      ...createInviteTenant(),
      trialStartsAt: new Date('2026-01-01T00:00:00.000Z'),
      trialEndsAt: new Date('2026-01-31T00:00:00.000Z'),
    };
    prisma.userInvite.findUnique.mockResolvedValue({
      ...createMemberInvite(),
      tenant: expiredTenant,
    });

    await expect(service.getInvite(MEMBER_INVITE_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not expose invites while tenant onboarding is PROVISIONING', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(
      createMemberInvite(TenantOnboardingStatus.PROVISIONING),
    );

    await expect(service.getInvite(BEARER_INVITE_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a legacy invite that is not bound to email', async () => {
    prisma.userInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      tenantId: 'tenant-1',
      email: null,
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      tenant: createInviteTenant(),
    });

    await expect(service.getInvite(BEARER_INVITE_TOKEN)).rejects.toThrow(
      BadRequestException,
    );
  });
});
