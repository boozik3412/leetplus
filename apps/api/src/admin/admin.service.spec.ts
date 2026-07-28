import { ForbiddenException } from '@nestjs/common';
import { TenantLifecycleStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { LangameSettingsService } from '../integrations/langame-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

type AdminPrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  platformAdminAuditEvent: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): AdminPrismaMock {
  const prisma: AdminPrismaMock = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformAdminAuditEvent: {
      findFirst: jest.fn(),
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
  statusChangedAt: new Date('2026-07-28T08:00:00.000Z'),
  statusReason: 'Awaiting Gate 1DP',
};

describe('AdminService design-partner lifecycle guard', () => {
  let prisma: AdminPrismaMock;
  let service: AdminService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AdminService(
      prisma as unknown as PrismaService,
      {} as LangameSettingsService,
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
    expect(prisma.tenant.update).not.toHaveBeenCalled();
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

    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('keeps generic ACTIVATE available for an ordinary tenant', async () => {
    prisma.platformAdminAuditEvent.findFirst.mockResolvedValue(null);
    prisma.tenant.update.mockResolvedValue({
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

    expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
    expect(prisma.platformAdminAuditEvent.create).toHaveBeenCalledTimes(1);
  });
});
