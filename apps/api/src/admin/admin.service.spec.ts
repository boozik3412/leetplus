import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantOnboardingStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { LangameSettingsService } from '../integrations/langame-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantExecutionPolicyService } from '../tenancy/tenant-execution-policy.service';
import { AdminService } from './admin.service';

type AdminPrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
  };
  platformAdminAuditEvent: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): AdminPrismaMock {
  const prisma: AdminPrismaMock = {
    tenant: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    platformAdminAuditEvent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: AdminPrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

const actor = {
  id: 'platform-admin-1',
} as AuthenticatedUser;

const suspendedTenant = {
  id: 'tenant-design-partner',
  name: 'Design Partner',
  slug: 'design-partner',
  status: TenantLifecycleStatus.SUSPENDED,
  customerStage: TenantCustomerStage.PILOT,
  onboardingStatus: TenantOnboardingStatus.OWNER_INVITED,
  trialStartsAt: new Date('2026-07-28T00:00:00.000Z'),
  trialEndsAt: new Date('2026-08-28T00:00:00.000Z'),
  entitlementProfileRevision: 1,
  statusChangedAt: new Date('2026-07-28T08:00:00.000Z'),
  statusReason: 'Awaiting Gate 1DP',
  updatedAt: new Date('2026-07-28T08:00:00.000Z'),
  moduleEntitlements: [],
};

describe('AdminService design-partner lifecycle guard', () => {
  let prisma: AdminPrismaMock;
  let service: AdminService;
  const tenantExecutionPolicy = {
    assertActivationAllowed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new AdminService(
      prisma as unknown as PrismaService,
      {} as LangameSettingsService,
      tenantExecutionPolicy as unknown as TenantExecutionPolicyService,
    );
    prisma.tenant.findUnique.mockResolvedValue(suspendedTenant);
  });

  it('blocks generic ACTIVATE when the design-partner provision marker exists', async () => {
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      id: 'design-partner-marker',
    });

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'ACTIVATE',
        confirmation: suspendedTenant.slug,
        reason: 'Attempt generic activation for the design partner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.platformAdminAuditEvent.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: suspendedTenant.id,
        action: 'SINGLE_DESIGN_PARTNER_PROVISIONED',
      },
      select: { id: true },
    });
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks generic SUSPEND because it would skip the complete emergency stop', async () => {
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      id: 'design-partner-marker',
    });
    prisma.tenant.findUnique.mockResolvedValue({
      ...suspendedTenant,
      status: TenantLifecycleStatus.ACTIVE,
    });

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'SUSPEND',
        confirmation: suspendedTenant.slug,
        reason: 'Use the incomplete generic suspend path',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('keeps generic ACTIVATE available for an ordinary tenant', async () => {
    const internalTenant = {
      ...suspendedTenant,
      customerStage: TenantCustomerStage.INTERNAL,
    };
    prisma.tenant.findUnique.mockResolvedValue(internalTenant);
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      ...suspendedTenant,
      status: TenantLifecycleStatus.ACTIVE,
      statusChangedAt: new Date('2026-07-28T09:00:00.000Z'),
      statusReason: 'Ordinary tenant activation',
    });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({
      id: 'audit-1',
    });

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'ACTIVATE',
        confirmation: suspendedTenant.slug,
        reason: 'Ordinary tenant activation',
      }),
    ).resolves.toMatchObject({
      ok: true,
      tenant: {
        id: suspendedTenant.id,
        status: TenantLifecycleStatus.ACTIVE,
      },
    });

    const updateManyMock = prisma.tenant.updateMany as jest.Mock<
      Promise<{ count: number }>,
      [
        {
          where: Record<string, unknown>;
          data: {
            status: TenantLifecycleStatus;
            statusChangedAt: unknown;
            statusReason: string;
          };
        },
      ]
    >;
    const updateManyCall = updateManyMock.mock.calls[0]?.[0];
    expect(updateManyCall).toMatchObject({
      where: {
        id: suspendedTenant.id,
        status: suspendedTenant.status,
        customerStage: TenantCustomerStage.INTERNAL,
        onboardingStatus: suspendedTenant.onboardingStatus,
        trialStartsAt: suspendedTenant.trialStartsAt,
        trialEndsAt: suspendedTenant.trialEndsAt,
        entitlementProfileRevision: suspendedTenant.entitlementProfileRevision,
        updatedAt: suspendedTenant.updatedAt,
      },
      data: {
        status: TenantLifecycleStatus.ACTIVE,
        statusReason: 'Ordinary tenant activation',
      },
    });
    expect(updateManyCall?.data.statusChangedAt).toBeInstanceOf(Date);
    expect(prisma.platformAdminAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(tenantExecutionPolicy.assertActivationAllowed).toHaveBeenCalledWith(
      internalTenant,
    );
  });

  it('blocks generic lifecycle actions for an external beta tenant', async () => {
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'ACTIVATE',
        confirmation: suspendedTenant.slug,
        reason: 'Attempt generic external activation',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
    expect(
      tenantExecutionPolicy.assertActivationAllowed,
    ).not.toHaveBeenCalled();
  });

  it('rolls back a lifecycle action when the admitted snapshot loses its CAS', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      ...suspendedTenant,
      customerStage: TenantCustomerStage.INTERNAL,
    });
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);
    prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'ACTIVATE',
        confirmation: suspendedTenant.slug,
        reason: 'Ordinary tenant activation',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.tenant.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('returns the top-level request ID in audit API responses and CSV exports', async () => {
    const auditEvent = {
      id: 'audit-entitlement-1',
      tenantId: suspendedTenant.id,
      actorUserId: actor.id,
      requestId: 'profile-request-1',
      action: 'TENANT_ENTITLEMENT_PROFILE_REPLACED',
      targetType: 'Tenant',
      targetId: suspendedTenant.id,
      reason: 'Initial beta profile',
      before: null,
      after: null,
      metadata: null,
      createdAt: new Date('2026-07-28T10:00:00.000Z'),
      tenant: {
        id: suspendedTenant.id,
        name: suspendedTenant.name,
        slug: suspendedTenant.slug,
      },
      actor: {
        id: actor.id,
        email: 'platform-admin@example.test',
        fullName: 'Platform Admin',
      },
    };
    prisma.platformAdminAuditEvent.findMany.mockResolvedValue([auditEvent]);

    await expect(
      service.getAuditEvents({ requestId: auditEvent.requestId }),
    ).resolves.toMatchObject({
      events: [
        {
          id: auditEvent.id,
          requestId: auditEvent.requestId,
        },
      ],
    });
    expect(prisma.platformAdminAuditEvent.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          requestId: auditEvent.requestId,
        },
      }),
    );

    const exported = await service.exportAuditEvents({});
    const csv = exported.buffer.toString('utf8');
    expect(csv).toContain('Request ID');
    expect(csv).toContain(auditEvent.requestId);
  });
});
