import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
  UserAccessScope,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SHARED_BETA_INITIAL_OWNER_CAPABILITIES } from '../auth/capabilities';
import type { PrismaService } from '../prisma/prisma.service';
import { COMPLETE_TENANT_MODULE_PROFILE } from '../tenancy/tenant-entitlement-profile.service';
import { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

type SharedProvisioningPrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  store: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
  };
  userInvite: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
  };
  userRoleOverride: {
    create: jest.Mock;
  };
  tenantModuleEntitlement: {
    createMany: jest.Mock;
  };
  integrationSource: {
    count: jest.Mock;
  };
  integrationCredential: {
    count: jest.Mock;
  };
  platformAdminAuditEvent: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

function createPrismaMock(): SharedProvisioningPrismaMock {
  const prisma: SharedProvisioningPrismaMock = {
    tenant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    store: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    userInvite: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    userRoleOverride: {
      create: jest.fn(),
    },
    tenantModuleEntitlement: {
      createMany: jest.fn(),
    },
    integrationSource: {
      count: jest.fn(),
    },
    integrationCredential: {
      count: jest.fn(),
    },
    platformAdminAuditEvent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: SharedProvisioningPrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstCallData(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown[][];
  const argument = calls[0]?.[0];
  if (!record(argument) || !record(argument.data)) {
    throw new Error('Expected the first mock call to contain a data object');
  }
  return argument.data;
}

const platformAdmin = {
  id: 'platform-admin-1',
  isPlatformAdmin: true,
} as AuthenticatedUser;

function provisioningDto(overrides: Record<string, unknown> = {}) {
  const trialStartsAt = new Date(Date.now() + 60 * 60 * 1000);
  const trialEndsAt = new Date(
    trialStartsAt.getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  return {
    confirmation: 'PROVISION friendly-club',
    requestId: 'provision-request-1',
    reason: 'Provision the first friendly external club',
    supportTicket: 'BETA-101',
    tenantName: 'Friendly Club',
    tenantSlug: 'friendly-club',
    cohortKey: 'friendly-club-1',
    supportOwnerUserId: platformAdmin.id,
    trialStartsAt: trialStartsAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    storeName: 'Friendly Club — Main',
    storeTimeZone: 'Asia/Yekaterinburg',
    ownerEmail: 'owner@example.test',
    ownerFullName: 'Friendly Owner',
    inviteExpiresInDays: 7,
    ...overrides,
  };
}

describe('SharedTenantProvisioningService', () => {
  let prisma: SharedProvisioningPrismaMock;
  let service: SharedTenantProvisioningService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new SharedTenantProvisioningService(
      prisma as unknown as PrismaService,
      {
        get: jest
          .fn()
          .mockImplementation((key: string) =>
            key === 'WEB_URL' ? 'https://leetplus.example' : undefined,
          ),
      } as unknown as ConfigService,
    );
    prisma.$queryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('provisions one suspended tenant, one inactive store and the exact six-row profile', async () => {
    prisma.tenant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: platformAdmin.id,
      isActive: true,
      isPlatformAdmin: true,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.userInvite.findFirst.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({
      id: 'tenant-b',
      slug: 'friendly-club',
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      entitlementProfileRevision: 1,
    });
    prisma.store.create.mockResolvedValue({
      id: 'store-b1',
      name: 'Friendly Club — Main',
      isActive: false,
      gamificationEnabled: false,
    });
    prisma.userInvite.create.mockResolvedValue({
      id: 'invite-owner-b',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await service.provision(platformAdmin, provisioningDto());

    expect(result).toMatchObject({
      ok: true,
      decision: 'PROVISIONED_SUSPENDED',
      replayed: false,
      activationRequired: true,
      tenant: {
        id: 'tenant-b',
        status: TenantLifecycleStatus.SUSPENDED,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        profileRevision: 1,
      },
      store: {
        id: 'store-b1',
        isActive: false,
        gamificationEnabled: false,
      },
      ownerInvite: {
        id: 'invite-owner-b',
        oneTimeSecretAvailable: true,
      },
    });
    expect(result.ownerInvite.registrationUrl).toMatch(
      /^https:\/\/leetplus\.example\/register\?invite=/,
    );
    expect(result.modules).toHaveLength(6);
    expect(result.modules.map((entry) => entry.module)).toEqual(
      COMPLETE_TENANT_MODULE_PROFILE,
    );
    expect(result.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          profileRevision: 1,
        }),
      ]),
    );

    expect(firstCallData(prisma.tenant.create)).toMatchObject({
      status: TenantLifecycleStatus.SUSPENDED,
      customerStage: TenantCustomerStage.PILOT,
      onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
      entitlementProfileRevision: 1,
    });
    expect(prisma.userRoleOverride.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-b',
        role: UserRole.OWNER,
        permissions: [...SHARED_BETA_INITIAL_OWNER_CAPABILITIES],
      },
    });
    const roleOverride = firstCallData(prisma.userRoleOverride.create);
    expect(roleOverride.permissions).not.toContain('view_marketing');
    expect(roleOverride.permissions).not.toContain('view_guests');
    expect(roleOverride.permissions).not.toContain('view_guest_game_pii');
    expect(firstCallData(prisma.userInvite.create)).toMatchObject({
      tenantId: 'tenant-b',
      email: 'owner@example.test',
      role: UserRole.OWNER,
      accessScope: UserAccessScope.NETWORK,
      storeIds: [],
      createdByUserId: platformAdmin.id,
    });
    expect(firstCallData(prisma.platformAdminAuditEvent.create)).toMatchObject({
      tenantId: 'tenant-b',
      requestId: 'provision-request-1',
      action: 'SHARED_BETA_TENANT_PROVISIONED',
    });
  });

  it('replays the same operation without exposing or regenerating the invite secret', async () => {
    const replayBaseTime = new Date('2026-07-28T10:00:00.000Z');
    jest.useFakeTimers();
    jest.setSystemTime(replayBaseTime);
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-b' });
    const initialDto = provisioningDto();

    const seedPrisma = createPrismaMock();
    const seedService = new SharedTenantProvisioningService(
      seedPrisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    seedPrisma.tenant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    seedPrisma.user.findUnique.mockResolvedValue({
      id: platformAdmin.id,
      isActive: true,
      isPlatformAdmin: true,
    });
    seedPrisma.user.findFirst.mockResolvedValue(null);
    seedPrisma.userInvite.findFirst.mockResolvedValue(null);
    seedPrisma.tenant.create.mockResolvedValue({
      id: 'tenant-b',
      slug: 'friendly-club',
      entitlementProfileRevision: 1,
    });
    seedPrisma.store.create.mockResolvedValue({
      id: 'store-b1',
      name: 'Friendly Club — Main',
    });
    seedPrisma.userInvite.create.mockResolvedValue({
      id: 'invite-owner-b',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    seedPrisma.$queryRaw.mockResolvedValue([]);

    await seedService.provision(platformAdmin, initialDto);
    const auditData = firstCallData(seedPrisma.platformAdminAuditEvent.create);
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: auditData.after,
      metadata: auditData.metadata,
    });

    jest.setSystemTime(
      replayBaseTime.getTime() + 26 * 60 * 60 * 1000,
    );
    await expect(
      service.provision(platformAdmin, initialDto),
    ).resolves.toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      ownerInvite: {
        id: 'invite-owner-b',
        registrationUrl: null,
        oneTimeSecretAvailable: false,
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    jest.setSystemTime(replayBaseTime);
    prisma.tenant.findFirst.mockReset();
    prisma.tenant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tenant-b' });
    prisma.$transaction.mockClear();

    await expect(
      service.provision(platformAdmin, initialDto),
    ).resolves.toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      ownerInvite: {
        registrationUrl: null,
        oneTimeSecretAvailable: false,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-b' });

    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          reason: 'A materially different provisioning reason',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects provisioning from a tenant user even if the controller guard is bypassed', async () => {
    await expect(
      service.provision(
        { id: 'tenant-owner', isPlatformAdmin: false } as AuthenticatedUser,
        provisioningDto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an invite that would not leave a full acceptance day after trial start', async () => {
    const trialStartsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const trialEndsAt = new Date(
      trialStartsAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          trialStartsAt: trialStartsAt.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
          inviteExpiresInDays: 1,
        }),
      ),
    ).rejects.toThrow(
      'Initial owner invite must remain valid for at least 24 hours after provisioning or trialStartsAt, whichever is later',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('measures the invite acceptance window from provisioning when trial already started', async () => {
    const trialStartsAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
    const trialEndsAt = new Date(
      trialStartsAt.getTime() + 24 * 60 * 60 * 1000,
    );

    await expect(
      service.provision(
        platformAdmin,
        provisioningDto({
          trialStartsAt: trialStartsAt.toISOString(),
          trialEndsAt: trialEndsAt.toISOString(),
          inviteExpiresInDays: 1,
        }),
      ),
    ).rejects.toThrow(
      'Initial owner invite must remain valid for at least 24 hours after provisioning or trialStartsAt, whichever is later',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revokes the exact pristine initial invite and returns the tenant to suspended provisioning', async () => {
    const trialStartsAt = new Date(Date.now() + 60 * 60 * 1000);
    const trialEndsAt = new Date(
      trialStartsAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const provisioningReceipt = {
      profileVersion: 'SHARED_MULTI_TENANT_BETA_V1',
      tenant: {
        id: 'tenant-b',
        slug: 'friendly-club',
        status: TenantLifecycleStatus.SUSPENDED,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        profileRevision: 1,
      },
      store: {
        id: 'store-b1',
        name: 'Friendly Club — Main',
        isActive: false,
        gamificationEnabled: false,
      },
      ownerInvite: {
        id: 'invite-owner-b',
        expiresAt: trialEndsAt.toISOString(),
      },
      modules: COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
        module,
        readEnabled: true,
        writeEnabled: true,
        outboundEnabled: false,
        profileRevision: 1,
      })),
    };
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-b',
      slug: 'friendly-club',
    });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'tenant-b',
        slug: 'friendly-club',
        status: TenantLifecycleStatus.ACTIVE,
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        entitlementProfileRevision: 1,
        updatedAt: new Date(),
      },
    ]);
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      after: provisioningReceipt,
    });
    prisma.userInvite.findUnique.mockResolvedValue({
      id: 'invite-owner-b',
      tenantId: 'tenant-b',
      role: UserRole.OWNER,
      accessScope: UserAccessScope.NETWORK,
      customRoleId: null,
      storeIds: [],
      acceptedAt: null,
      expiresAt: trialEndsAt,
    });
    prisma.user.count.mockResolvedValue(0);
    prisma.userInvite.count.mockResolvedValue(0);
    prisma.integrationSource.count.mockResolvedValue(0);
    prisma.integrationCredential.count.mockResolvedValue(0);
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-b1',
        isActive: false,
        gamificationEnabled: false,
        integrationSourceId: null,
        externalProvider: null,
        externalDomain: null,
        externalClubId: null,
      },
    ]);
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.revokeInitialOwnerInvite(platformAdmin, 'tenant-b', {
        confirmation: 'REVOKE friendly-club',
        requestId: 'revoke-request-1',
        reason: 'Revoke the leaked initial owner invite',
        supportTicket: 'INC-1',
      }),
    ).resolves.toMatchObject({
      ok: true,
      replayed: false,
      tenantId: 'tenant-b',
      revokedInviteId: 'invite-owner-b',
      lifecycleStatus: TenantLifecycleStatus.SUSPENDED,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
    });
    expect(prisma.userInvite.delete).toHaveBeenCalledWith({
      where: { id: 'invite-owner-b' },
    });
    expect(firstCallData(prisma.tenant.updateMany)).toMatchObject({
      status: TenantLifecycleStatus.SUSPENDED,
      onboardingStatus: TenantOnboardingStatus.PROVISIONING,
    });
    expect(firstCallData(prisma.platformAdminAuditEvent.create)).toMatchObject({
      requestId: 'revoke-request-1',
      action: 'SHARED_BETA_INITIAL_OWNER_INVITE_REVOKED',
      targetId: 'invite-owner-b',
    });
  });
});
