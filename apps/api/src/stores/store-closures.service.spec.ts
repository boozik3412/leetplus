import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoreClosuresService } from './store-closures.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const row = (
  id: string,
  closedFrom: string,
  reopenedOn: string | null = null,
  reason: string | null = null,
) => ({
  id,
  tenantId: 'tenant-demo',
  storeId: 'store-kh',
  closedFrom: day(closedFrom),
  reopenedOn: reopenedOn ? day(reopenedOn) : null,
  reason,
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: new Date('2026-10-04T05:00:00.000Z'),
  updatedAt: new Date('2026-10-04T05:00:00.000Z'),
});

describe('StoreClosuresService', () => {
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
  let tx: {
    $queryRaw: jest.Mock;
    storeClosure: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    storeClosure: { findMany: jest.Mock };
  };
  let freshStoreScope: { assertNetwork: jest.Mock };
  let service: StoreClosuresService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-04T05:00:00.000Z'));
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ timeZone: 'Europe/Samara' }]),
      storeClosure: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
      storeClosure: { findMany: jest.fn() },
    };
    freshStoreScope = { assertNetwork: jest.fn().mockResolvedValue({}) };
    service = new StoreClosuresService(
      prisma as never,
      {
        resolve: jest.fn().mockReturnValue({ tenantId: 'tenant-demo' }),
      },
      freshStoreScope as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists closures of the network as club-local days', async () => {
    prisma.storeClosure.findMany.mockResolvedValue([
      row('c1', '2026-09-29'),
      row('c2', '2026-05-01', '2026-05-10', 'Ремонт'),
    ]);

    await expect(service.list(user)).resolves.toMatchObject([
      { id: 'c1', closedFrom: '2026-09-29', reopenedOn: null, reason: null },
      {
        id: 'c2',
        closedFrom: '2026-05-01',
        reopenedOn: '2026-05-10',
        reason: 'Ремонт',
      },
    ]);
    expect(freshStoreScope.assertNetwork).toHaveBeenCalledWith(user);
    expect(prisma.storeClosure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-demo' } }),
    );
  });

  it('closes a club from a day, locks the store row and stores who did it', async () => {
    tx.storeClosure.create.mockImplementation(
      ({ data }: { data: { closedFrom: Date } }) =>
        Promise.resolve({ ...row('c1', '2026-09-29'), ...data }),
    );

    const closure = await service.create(
      'store-kh',
      { closedFrom: '2026-09-29', reason: '  Закрыт временно ' },
      user,
    );

    expect(closure).toMatchObject({
      closedFrom: '2026-09-29',
      reopenedOn: null,
      reason: 'Закрыт временно',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.storeClosure.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-demo',
        storeId: 'store-kh',
        closedFrom: day('2026-09-29'),
        reopenedOn: null,
        reason: 'Закрыт временно',
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1',
      },
    });
  });

  it('rejects dates that are not real, reversed, or too far away', async () => {
    const create = (dto: Parameters<StoreClosuresService['create']>[1]) =>
      service.create('store-kh', dto, user);

    await expect(create({ closedFrom: '29.09.2026' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(create({ closedFrom: '2026-02-30' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      create({ closedFrom: '2026-09-29', reopenedOn: '2026-09-29' }),
    ).rejects.toThrow(/позже даты закрытия/);
    await expect(
      create({ closedFrom: '2026-09-29', reopenedOn: 'скоро' }),
    ).rejects.toThrow(/ГГГГ-ММ-ДД/);
    await expect(create({ closedFrom: '2024-01-01' })).rejects.toThrow(
      /слишком далеко/,
    );
    await expect(create({ closedFrom: '2028-01-01' })).rejects.toThrow(
      /слишком далеко/,
    );
    await expect(
      create({ closedFrom: '2026-09-29', reason: 'x'.repeat(301) }),
    ).rejects.toThrow(/не длиннее 300/);
    expect(tx.storeClosure.create).not.toHaveBeenCalled();
  });

  it('refuses a closure that overlaps another one of the same club', async () => {
    tx.storeClosure.findMany.mockResolvedValue([
      { closedFrom: day('2026-09-25'), reopenedOn: day('2026-09-28') },
    ]);

    await expect(
      service.create('store-kh', { closedFrom: '2026-09-27' }, user),
    ).rejects.toBeInstanceOf(ConflictException);
    // Closing on the day the previous closure ended is fine.
    tx.storeClosure.create.mockResolvedValue(row('c2', '2026-09-28'));
    await expect(
      service.create('store-kh', { closedFrom: '2026-09-28' }, user),
    ).resolves.toMatchObject({ closedFrom: '2026-09-28' });
  });

  it('reopens a club by setting the first open day, ignoring the closure itself', async () => {
    tx.storeClosure.findFirst.mockResolvedValue(row('c1', '2026-09-29'));
    tx.storeClosure.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...row('c1', '2026-09-29'),
          reopenedOn: day('2026-10-12'),
          ...data,
        }),
    );

    const closure = await service.update(
      'store-kh',
      'c1',
      { reopenedOn: '2026-10-12' },
      user,
    );

    expect(closure).toMatchObject({
      closedFrom: '2026-09-29',
      reopenedOn: '2026-10-12',
    });
    const [[overlapQuery]] = tx.storeClosure.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(overlapQuery.where).toMatchObject({ id: { not: 'c1' } });
    const [[call]] = tx.storeClosure.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(call.data).not.toHaveProperty('reason');
    expect(call.data.updatedByUserId).toBe('user-1');
  });

  it('answers 404 for a store or a closure outside the network', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.create('foreign-store', { closedFrom: '2026-09-29' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.storeClosure.findFirst.mockResolvedValue(null);
    await expect(
      service.update('store-kh', 'missing', { reason: 'x' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('store-kh', 'missing', user),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a closure entered by mistake', async () => {
    tx.storeClosure.findFirst.mockResolvedValue(row('c1', '2026-09-29'));
    tx.storeClosure.delete.mockResolvedValue(row('c1', '2026-09-29'));

    await expect(service.remove('store-kh', 'c1', user)).resolves.toEqual({
      id: 'c1',
    });
    expect(tx.storeClosure.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });
});
