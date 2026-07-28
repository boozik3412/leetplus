import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import {
  COMPLETE_TENANT_MODULE_PROFILE,
  TenantEntitlementProfileService,
} from './tenant-entitlement-profile.service';

type PrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  tenantModuleEntitlement: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  platformAdminAuditEvent: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    tenant: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    tenantModuleEntitlement: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    platformAdminAuditEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: PrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

const platformAdmin = {
  id: 'platform-admin-1',
  email: 'platform-admin@example.test',
  fullName: 'Platform Admin',
  role: UserRole.OWNER,
  isPlatformAdmin: true,
  tenantId: 'internal-tenant',
  tenantSlug: 'internal-tenant',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const tenant = {
  id: 'tenant-b',
  name: 'Tenant B',
  slug: 'tenant-b',
  status: TenantLifecycleStatus.SUSPENDED,
  customerStage: TenantCustomerStage.PILOT,
  onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
  cohortKey: null,
  supportOwnerUserId: null,
  trialStartsAt: new Date('2026-08-31T00:00:00.000Z'),
  trialEndsAt: new Date('2026-09-30T00:00:00.000Z'),
  entitlementProfileRevision: 0,
  updatedAt: new Date('2026-07-28T09:00:00.000Z'),
  moduleEntitlements: [],
};

function modules() {
  return COMPLETE_TENANT_MODULE_PROFILE.map((module) => ({
    module,
    readEnabled: true,
    writeEnabled: true,
    outboundEnabled: false,
    validFrom: null,
    validUntil: '2026-09-30T00:00:00.000Z',
  }));
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: tenant.slug,
    expectedProfileRevision: 0,
    reason: 'Enable the complete first pilot module profile',
    requestId: 'request-shared-beta-001',
    supportTicket: 'BETA-001',
    customerStage: TenantCustomerStage.PILOT,
    onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
    cohortKey: 'shared-beta-2026-08',
    supportOwnerUserId: platformAdmin.id,
    trialStartsAt: '2026-08-31T00:00:00.000Z',
    trialEndsAt: '2026-09-30T00:00:00.000Z',
    modules: modules(),
    ...overrides,
  };
}

describe('TenantEntitlementProfileService', () => {
  let prisma: PrismaMock;
  let service: TenantEntitlementProfileService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TenantEntitlementProfileService(
      prisma as unknown as PrismaService,
    );
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    prisma.user.findUnique.mockResolvedValue({
      id: platformAdmin.id,
      isActive: true,
      isPlatformAdmin: true,
    });
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue(null);
    prisma.tenantModuleEntitlement.deleteMany.mockResolvedValue({ count: 0 });
    prisma.tenantModuleEntitlement.createMany.mockResolvedValue({
      count: COMPLETE_TENANT_MODULE_PROFILE.length,
    });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('atomically replaces all six module rows under one profile revision', async () => {
    const result = await service.replaceProfile(
      platformAdmin,
      tenant.id,
      request(),
    );
    expect(result).toMatchObject({
      ok: true,
      tenantId: tenant.id,
      profileRevision: 1,
    });
    expect(result.modules).toHaveLength(6);
    expect(
      result.modules.map(({ module, profileRevision }) => ({
        module,
        profileRevision,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          module: TenantModule.GAMIFICATION,
          profileRevision: 1,
        },
        {
          module: TenantModule.INTEGRATIONS,
          profileRevision: 1,
        },
      ]),
    );

    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        id: tenant.id,
        entitlementProfileRevision: 0,
        updatedAt: tenant.updatedAt,
      },
      data: {
        customerStage: TenantCustomerStage.PILOT,
        onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
        cohortKey: 'shared-beta-2026-08',
        supportOwnerUserId: platformAdmin.id,
        trialStartsAt: new Date('2026-08-31T00:00:00.000Z'),
        trialEndsAt: new Date('2026-09-30T00:00:00.000Z'),
        entitlementProfileRevision: 1,
      },
    });
    expect(prisma.tenantModuleEntitlement.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: tenant.id },
    });
    const createMany = prisma.tenantModuleEntitlement.createMany as jest.Mock<
      Promise<unknown>,
      [
        {
          data: Array<{
            profileRevision: number;
            reason: string;
          }>;
        },
      ]
    >;
    const createdRows = createMany.mock.calls[0]?.[0].data ?? [];
    expect(createdRows).toHaveLength(6);
    expect(
      createdRows.every(
        (row) => row.profileRevision === 1 && row.reason === request().reason,
      ),
    ).toBe(true);
    const auditCreate = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [{ data: Record<string, unknown> }]
    >;
    const auditCall = auditCreate.mock.calls[0];
    const auditData = auditCall?.[0].data;
    expect(auditData).toMatchObject({
      tenantId: tenant.id,
      actorUserId: platformAdmin.id,
      action: 'TENANT_ENTITLEMENT_PROFILE_CHANGED',
      before: { profileRevision: 0 },
      after: {
        profileRevision: 1,
      },
      metadata: {
        requestId: 'request-shared-beta-001',
        expectedProfileRevision: 0,
        nextProfileRevision: 1,
        moduleCount: 6,
      },
    });
    const auditAfter = auditData?.after as { modules?: unknown } | undefined;
    expect(Array.isArray(auditAfter?.modules)).toBe(true);
  });

  it('requires an active platform administrator as support owner', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: platformAdmin.id,
      isActive: false,
      isPlatformAdmin: true,
    });

    await expect(
      service.replaceProfile(platformAdmin, tenant.id, request()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(prisma.tenantModuleEntitlement.deleteMany).not.toHaveBeenCalled();
  });

  it('replays an identical requestId and rejects requestId payload reuse', async () => {
    const first = await service.replaceProfile(
      platformAdmin,
      tenant.id,
      request(),
    );
    const auditCreate = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [{ data: Record<string, unknown> }]
    >;
    const auditData = auditCreate.mock.calls[0]?.[0].data;
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      after: auditData?.after,
      metadata: auditData?.metadata,
    });
    prisma.$transaction.mockClear();

    await expect(
      service.replaceProfile(platformAdmin, tenant.id, request()),
    ).resolves.toEqual(first);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({ reason: 'Use the same request ID for a different profile' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects incomplete, duplicate and invalid module profiles before writes', async () => {
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({ modules: modules().slice(0, 5) }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({
          modules: modules().map((module) => ({
            ...module,
            outboundEnabled: module.module === TenantModule.INTEGRATIONS,
          })),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({
          modules: [
            ...modules().slice(0, 5),
            { ...modules()[0], module: TenantModule.GAMIFICATION },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({
          modules: modules().map((module) =>
            module.module === TenantModule.STAFF
              ? {
                  ...module,
                  readEnabled: false,
                  writeEnabled: true,
                }
              : module,
          ),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reserves onboarding advancement for dedicated workflows', async () => {
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({ onboardingStatus: TenantOnboardingStatus.ONBOARDING }),
      ),
    ).rejects.toThrow('Onboarding transition requires its dedicated workflow');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reserves customer-stage changes for dedicated workflows', async () => {
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({ customerStage: TenantCustomerStage.INTERNAL }),
      ),
    ).rejects.toThrow(
      'Customer-stage transition requires its dedicated workflow',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reserves every outbound enablement for a dedicated workflow', async () => {
    await expect(
      service.replaceProfile(
        platformAdmin,
        tenant.id,
        request({
          onboardingStatus: TenantOnboardingStatus.ONBOARDING,
          modules: modules().map((module) =>
            module.module === TenantModule.COMMUNICATIONS
              ? { ...module, outboundEnabled: true }
              : module,
          ),
        }),
      ),
    ).rejects.toThrow(
      'Outbound actions require the dedicated outbound-enablement workflow',
    );

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale revision before opening the transaction', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      ...tenant,
      entitlementProfileRevision: 2,
    });

    await expect(
      service.replaceProfile(platformAdmin, tenant.id, request()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses revision and tenant snapshot CAS to reject concurrent control-plane changes', async () => {
    prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.replaceProfile(platformAdmin, tenant.id, request()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.tenantModuleEntitlement.deleteMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
    expect(prisma.tenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: tenant.id,
          entitlementProfileRevision: 0,
          updatedAt: tenant.updatedAt,
        },
      }),
    );
  });

  it('does not rely only on the controller guard for platform authority', async () => {
    await expect(
      service.replaceProfile(
        { ...platformAdmin, isPlatformAdmin: false },
        tenant.id,
        request(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
