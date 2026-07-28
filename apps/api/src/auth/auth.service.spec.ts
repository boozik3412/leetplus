import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { TenantExecutionPolicyService } from '../tenancy/tenant-execution-policy.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    count: jest.Mock;
  };
  userRoleOverride: {
    findUnique: jest.Mock;
  };
  tenant: {
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
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
  };
}

function createMemberInvite(onboardingStatus = TenantOnboardingStatus.ACTIVE) {
  return {
    id: 'invite-member-1',
    tenantId: 'tenant-1',
    email: 'invitee@example.test',
    fullName: 'Invitee',
    role: UserRole.CLUB_ADMINISTRATOR,
    customRoleId: null,
    customRole: null,
    accessScope: UserAccessScope.NETWORK,
    storeIds: [],
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    updatedAt: new Date(),
    tenant: createInviteTenant(onboardingStatus),
  };
}

function createOwnerInvite() {
  return {
    ...createMemberInvite(TenantOnboardingStatus.OWNER_INVITED),
    id: 'invite-owner-1',
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
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      userRoleOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
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
    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService,
      jwtService as unknown as JwtService,
      emailVerificationService as unknown as EmailVerificationService,
      { get: jest.fn() } as never,
      new AccessScopeService(),
      new TenantExecutionPolicyService(),
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

    await expect(
      service.getInvite('opaque-bearer-token'),
    ).resolves.toMatchObject({
      email: 'invitee@example.test',
      scope: 'NETWORK',
    });
    expect(prisma.userInvite.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256')
            .update('opaque-bearer-token')
            .digest('hex'),
        },
      }),
    );
  });

  it('transitions the first owner invite into ONBOARDING atomically', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.userInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue(createUserWithTenant());

    await expect(
      service.acceptInvite('opaque-owner-token', {
        password: 'strong-password',
        confirmPassword: 'strong-password',
      }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        role: UserRole.OWNER,
      },
    });

    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'tenant-1',
        status: TenantLifecycleStatus.ACTIVE,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        entitlementProfileRevision: 1,
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
      actorUserId: 'user-1',
      action: 'TENANT_OWNER_INVITE_ACCEPTED',
      before: {
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      },
      after: {
        onboardingStatus: TenantOnboardingStatus.ONBOARDING,
      },
    });
  });

  it('rejects a bootstrap invite that is not the exact NETWORK OWNER shape', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(
      createMemberInvite(TenantOnboardingStatus.OWNER_INVITED),
    );

    await expect(service.getInvite('opaque-member-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an additional OWNER without an owner-transfer workflow', async () => {
    prisma.userInvite.findUnique.mockResolvedValue({
      ...createOwnerInvite(),
      tenant: createInviteTenant(TenantOnboardingStatus.ACTIVE),
    });

    await expect(service.getInvite('opaque-owner-token')).rejects.toThrow(
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
      await service.acceptInvite('opaque-owner-token', {
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

  it('rejects owner bootstrap when any owner record already exists', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(createOwnerInvite());
    prisma.$queryRaw.mockResolvedValue([
      createInviteTenant(TenantOnboardingStatus.OWNER_INVITED),
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.acceptInvite('opaque-owner-token', {
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

    await expect(service.getInvite('opaque-member-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not expose invites while tenant onboarding is PROVISIONING', async () => {
    prisma.userInvite.findUnique.mockResolvedValue(
      createMemberInvite(TenantOnboardingStatus.PROVISIONING),
    );

    await expect(service.getInvite('opaque-bearer-token')).rejects.toThrow(
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

    await expect(service.getInvite('opaque-bearer-token')).rejects.toThrow(
      BadRequestException,
    );
  });
});
