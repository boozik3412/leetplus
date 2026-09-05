import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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
  store: {
    findFirst: jest.Mock;
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
    store: {
      findFirst: jest.fn(),
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

const configService = {
  get: jest.fn((key: string) =>
    key === 'RELEASE_SHA' ? 'a'.repeat(40) : undefined,
  ),
} as unknown as ConfigService;

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
  executionRevision: 7,
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
      configService,
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
      executionRevision: suspendedTenant.executionRevision + 1,
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
        executionRevision: suspendedTenant.executionRevision,
        updatedAt: suspendedTenant.updatedAt,
      },
      data: {
        status: TenantLifecycleStatus.ACTIVE,
        statusReason: 'Ordinary tenant activation',
      },
    });
    expect(updateManyCall?.data.statusChangedAt).toBeInstanceOf(Date);
    expect(prisma.platformAdminAuditEvent.create).toHaveBeenCalledTimes(1);
    const auditCreateMock = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<unknown>,
      [
        {
          data: {
            before: { executionRevision: number };
            after: { executionRevision: number };
          };
        },
      ]
    >;
    const auditCreateCall = auditCreateMock.mock.calls[0]?.[0];
    expect(auditCreateCall?.data.before.executionRevision).toBe(
      suspendedTenant.executionRevision,
    );
    expect(auditCreateCall?.data.after.executionRevision).toBe(
      suspendedTenant.executionRevision + 1,
    );
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

  it('rejects a lifecycle result when the database fence does not advance', async () => {
    const internalTenant = {
      ...suspendedTenant,
      customerStage: TenantCustomerStage.INTERNAL,
    };
    prisma.tenant.findUnique.mockResolvedValue(internalTenant);
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      ...internalTenant,
      status: TenantLifecycleStatus.ACTIVE,
    });

    await expect(
      service.updateTenantLifecycle(actor, suspendedTenant.id, {
        action: 'ACTIVATE',
        confirmation: suspendedTenant.slug,
        reason: 'Ordinary tenant activation',
      }),
    ).rejects.toThrow(
      'Tenant execution revision changed during lifecycle update',
    );

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

describe('AdminService store background execution control plane', () => {
  let prisma: AdminPrismaMock;
  let service: AdminService;

  const store = {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: '1337-Пушкинская',
    isActive: true,
    gamificationEnabled: true,
    backgroundExecutionEnabled: false,
    executionRevision: 4,
    updatedAt: new Date('2026-09-06T08:00:00.000Z'),
    tenant: {
      id: 'tenant-1',
      slug: 'demo',
      status: TenantLifecycleStatus.ACTIVE,
      customerStage: TenantCustomerStage.INTERNAL,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new AdminService(
      prisma as unknown as PrismaService,
      {} as LangameSettingsService,
      {} as TenantExecutionPolicyService,
      configService,
    );
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);
  });

  it('enables one exact active store with revision fencing and an audit receipt', async () => {
    prisma.store.updateMany.mockResolvedValue({ count: 1 });
    prisma.store.findUniqueOrThrow.mockResolvedValue({
      ...store,
      backgroundExecutionEnabled: true,
      executionRevision: 5,
      updatedAt: new Date('2026-09-06T08:01:00.000Z'),
    });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({ id: 'audit-1' });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 4,
        reason: 'Restore autonomous gamification worker identity',
        requestId: 'bg-runtime-20260906',
        supportTicket: 'LP-BUG-2F3F9F62',
      }),
    ).resolves.toMatchObject({
      ok: true,
      replayed: false,
      store: {
        id: store.id,
        backgroundExecutionEnabled: true,
        executionRevision: 5,
      },
      audit: {
        id: 'audit-1',
        requestId: 'bg-runtime-20260906',
        releaseSha: 'a'.repeat(40),
      },
    });

    expect(prisma.store.updateMany).toHaveBeenCalledWith({
      where: {
        id: store.id,
        tenantId: store.tenantId,
        isActive: true,
        gamificationEnabled: true,
        backgroundExecutionEnabled: false,
        executionRevision: 4,
        updatedAt: store.updatedAt,
      },
      data: { backgroundExecutionEnabled: true },
    });
    const auditCreateMock = prisma.platformAdminAuditEvent.create as jest.Mock<
      Promise<{ id: string }>,
      [
        {
          data: {
            tenantId: string;
            actorUserId: string;
            requestId: string;
            action: string;
            targetType: string;
            targetId: string;
            metadata: {
              operation: string;
              expectedExecutionRevision: number;
              releaseSha: string;
            };
          };
          select: { id: true };
        },
      ]
    >;
    const auditCreateCall = auditCreateMock.mock.calls[0]?.[0];
    expect(auditCreateCall).toMatchObject({
      data: {
        tenantId: store.tenantId,
        actorUserId: actor.id,
        requestId: 'bg-runtime-20260906',
        action: 'STORE_BACKGROUND_EXECUTION_CHANGE',
        targetType: 'STORE',
        targetId: store.id,
        metadata: {
          operation: 'ENABLE',
          expectedExecutionRevision: 4,
          releaseSha: 'a'.repeat(40),
        },
      },
    });
  });

  it('returns an idempotent replay for the same persisted command', async () => {
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      backgroundExecutionEnabled: true,
      executionRevision: 5,
    });
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      id: 'audit-1',
      targetId: store.id,
      reason: 'Retry the same autonomous worker activation',
      after: {},
      metadata: {
        operation: 'ENABLE',
        expectedExecutionRevision: 4,
        releaseSha: 'b'.repeat(40),
        supportTicket: null,
      },
    });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 4,
        reason: 'Retry the same autonomous worker activation',
        requestId: 'bg-runtime-20260906',
      }),
    ).resolves.toMatchObject({
      ok: true,
      replayed: true,
      audit: { id: 'audit-1', releaseSha: 'b'.repeat(40) },
    });

    expect(prisma.store.updateMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a reused request ID when command details differ', async () => {
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      backgroundExecutionEnabled: true,
      executionRevision: 5,
    });
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      id: 'audit-1',
      targetId: store.id,
      reason: 'Original autonomous worker activation',
      after: {},
      metadata: {
        operation: 'ENABLE',
        expectedExecutionRevision: 4,
        releaseSha: 'b'.repeat(40),
        supportTicket: null,
      },
    });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 4,
        reason: 'Different autonomous worker activation reason',
        requestId: 'bg-runtime-20260906',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.store.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an idempotent replay after a later store policy change', async () => {
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      backgroundExecutionEnabled: true,
      executionRevision: 6,
    });
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue({
      id: 'audit-1',
      targetId: store.id,
      reason: 'Retry the same autonomous worker activation',
      after: {},
      metadata: {
        operation: 'ENABLE',
        expectedExecutionRevision: 4,
        releaseSha: 'b'.repeat(40),
        supportTicket: null,
      },
    });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 4,
        reason: 'Retry the same autonomous worker activation',
        requestId: 'bg-runtime-20260906',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.store.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale execution revisions before changing the store', async () => {
    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 3,
        reason: 'Attempt with a stale background execution revision',
        requestId: 'bg-runtime-stale',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.store.updateMany).not.toHaveBeenCalled();
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('keeps background execution fail-closed for external tenants', async () => {
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      tenant: {
        ...store.tenant,
        customerStage: TenantCustomerStage.PILOT,
      },
    });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'ENABLE',
        confirmation: `demo:${store.id}:ENABLE`,
        expectedExecutionRevision: 4,
        reason: 'Attempt external tenant activation without dedicated GO',
        requestId: 'bg-runtime-external',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.store.updateMany).not.toHaveBeenCalled();
  });

  it('allows an emergency disable after a tenant leaves the internal stage', async () => {
    const externallyStagedStore = {
      ...store,
      backgroundExecutionEnabled: true,
      executionRevision: 5,
      tenant: {
        ...store.tenant,
        customerStage: TenantCustomerStage.PILOT,
      },
    };
    prisma.store.findFirst.mockResolvedValue(externallyStagedStore);
    prisma.store.updateMany.mockResolvedValue({ count: 1 });
    prisma.store.findUniqueOrThrow.mockResolvedValue({
      ...externallyStagedStore,
      backgroundExecutionEnabled: false,
      executionRevision: 6,
      updatedAt: new Date('2026-09-06T08:02:00.000Z'),
    });
    prisma.platformAdminAuditEvent.create.mockResolvedValue({ id: 'audit-2' });

    await expect(
      service.setStoreBackgroundExecution(actor, store.tenantId, store.id, {
        action: 'DISABLE',
        confirmation: `demo:${store.id}:DISABLE`,
        expectedExecutionRevision: 5,
        reason: 'Emergency stop after tenant stage transition',
        requestId: 'bg-runtime-disable',
      }),
    ).resolves.toMatchObject({
      ok: true,
      store: {
        backgroundExecutionEnabled: false,
        executionRevision: 6,
      },
    });
  });
});
