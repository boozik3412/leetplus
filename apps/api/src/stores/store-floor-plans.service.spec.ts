import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoreFloorPlansService } from './store-floor-plans.service';

const layout = {
  template: 'apex-holmogorova-17',
  v: 2,
  items: [{ id: 'i1', kind: 'sofa', x: 1, z: 2 }],
  pcs: { '17': { x: 3, z: 4 } },
};

describe('StoreFloorPlansService', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: null,
    role: UserRole.OWNER,
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
    isPlatformAdmin: false,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
  let prisma: {
    store: { findFirst: jest.Mock };
    storeFloorPlan: { create: jest.Mock; updateMany: jest.Mock };
  };
  let scope: { assertNetwork: jest.Mock; resolveRequestedStoreIds: jest.Mock };
  let service: StoreFloorPlansService;

  beforeEach(() => {
    prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'store-kh',
          name: 'Холмогорова 17',
          floorPlan: null,
        }),
      },
      storeFloorPlan: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    scope = {
      assertNetwork: jest.fn().mockResolvedValue({ tenantId: 'tenant-demo' }),
      resolveRequestedStoreIds: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-demo' }),
    };
    service = new StoreFloorPlansService(prisma as never, scope as never);
  });

  it('reads the plan of a club inside the fresh store scope', async () => {
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-kh',
      name: 'Холмогорова 17',
      floorPlan: {
        layout,
        revision: 3,
        updatedAt: new Date('2026-11-10T06:00:00.000Z'),
      },
    });

    await expect(service.get('store-kh', user)).resolves.toEqual({
      storeId: 'store-kh',
      storeName: 'Холмогорова 17',
      plan: {
        layout,
        revision: 3,
        updatedAt: '2026-11-10T06:00:00.000Z',
      },
    });
    expect(scope.resolveRequestedStoreIds).toHaveBeenCalledWith(user, [
      'store-kh',
    ]);
    expect(prisma.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-demo', id: 'store-kh' },
      }),
    );
  });

  it('answers 404 for a club of another network', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(service.get('store-x', user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates the first plan from revision 0 after a NETWORK check', async () => {
    await service.save('store-kh', { layout, revision: 0 }, user);

    expect(scope.assertNetwork).toHaveBeenCalledWith(user);
    expect(prisma.storeFloorPlan.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-demo',
        storeId: 'store-kh',
        layout,
        revision: 1,
        updatedByUserId: 'user-1',
      },
    });
    expect(prisma.storeFloorPlan.updateMany).not.toHaveBeenCalled();
  });

  it('updates only the revision the editor started from', async () => {
    await service.save('store-kh', { layout, revision: 4 }, user);

    expect(prisma.storeFloorPlan.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-demo', storeId: 'store-kh', revision: 4 },
      data: {
        layout,
        revision: { increment: 1 },
        updatedByUserId: 'user-1',
      },
    });
  });

  it('refuses a save over a newer revision', async () => {
    prisma.storeFloorPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.save('store-kh', { layout, revision: 2 }, user),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second first plan', async () => {
    prisma.storeFloorPlan.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.save('store-kh', { layout, revision: 0 }, user),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not save to a club outside the network', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(
      service.save('store-x', { layout, revision: 0 }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.storeFloorPlan.create).not.toHaveBeenCalled();
  });

  it('keeps only the known layout fields', () => {
    expect(
      service.normalizeLayout({ ...layout, extra: 'dropped', savedAt: 1 }),
    ).toEqual(layout);
  });

  it.each([
    ['not an object', []],
    ['bad template', { ...layout, template: '../x' }],
    ['bad version', { ...layout, v: 0 }],
    ['items not objects', { ...layout, items: [1] }],
    ['too many items', { ...layout, items: Array(401).fill({}) }],
    ['seat not an object', { ...layout, pcs: { '1': 'x' } }],
    ['too large', { ...layout, items: [{ note: 'x'.repeat(90_001) }] }],
  ])('rejects a layout: %s', (_label, value) => {
    expect(() => service.normalizeLayout(value)).toThrow(BadRequestException);
  });

  it('requires a whole non-negative revision', async () => {
    await expect(
      service.save('store-kh', { layout, revision: -1 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save('store-kh', { layout }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
