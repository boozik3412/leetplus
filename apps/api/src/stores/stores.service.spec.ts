import { UserRole } from '@prisma/client';
import { StoresService } from './stores.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ConfigService } from '@nestjs/config';

type StoresPrismaMock = {
  store: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

function createPrismaMock(): StoresPrismaMock {
  return {
    store: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('StoresService', () => {
  let prisma: StoresPrismaMock;
  let tenantContext: TenantContextMock;
  let service: StoresService;
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: null,
    role: UserRole.OWNER,
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
      }),
    };
    service = new StoresService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('filters stores by resolved tenant', async () => {
    prisma.store.findMany.mockResolvedValue([]);

    await service.findAll(user);

    expect(tenantContext.resolve).toHaveBeenCalledWith(user);
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-demo' },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  });

  it('creates store in resolved tenant', async () => {
    prisma.store.create.mockResolvedValue({ id: 'store-1' });

    await service.create(
      {
        name: '  Club A  ',
        address: '  Main street  ',
        city: 'Екатеринбург',
      },
      user,
    );

    expect(prisma.store.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-demo',
        name: 'Club A',
        publicSlug: 'club-a',
        address: 'Main street',
        city: 'Екатеринбург',
        cityFiasId: null,
        cityKladrId: null,
        timeZone: 'Asia/Yekaterinburg',
        gamificationEnabled: false,
      },
    });
  });

  it('updates explicit gamification flag inside tenant', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });
    prisma.store.update.mockResolvedValue({
      id: 'store-1',
      gamificationEnabled: true,
    });

    await service.update('store-1', { gamificationEnabled: true }, user);

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { gamificationEnabled: true },
    });
  });

  it('archives store only after resolving it inside tenant', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Club A',
    });
    prisma.store.update.mockResolvedValue({ id: 'store-1', isActive: false });

    await service.archive('store-1', user);

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-1', tenantId: 'tenant-demo' },
    });
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { isActive: false },
    });
  });
});
