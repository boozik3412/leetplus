import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

type PrismaMock = {
  tenant: {
    findUnique: jest.Mock;
  };
};

describe('TenantContextService', () => {
  let prisma: PrismaMock;
  let service: TenantContextService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    };
    service = new TenantContextService(prisma as unknown as PrismaService);
  });

  it('uses authenticated user tenant when available', async () => {
    await expect(
      service.resolve({
        id: 'user-1',
        email: 'owner@example.com',
        fullName: null,
        role: UserRole.OWNER,
        tenantId: 'tenant-user',
        tenantSlug: 'club-a',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant-user',
      tenantSlug: 'club-a',
    });

    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to demo tenant for public MVP requests', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-demo',
      slug: 'demo',
    });

    await expect(service.resolve()).resolves.toEqual({
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
    });
  });

  it('throws when demo tenant fallback is missing', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.resolve()).rejects.toBeInstanceOf(NotFoundException);
  });
});
