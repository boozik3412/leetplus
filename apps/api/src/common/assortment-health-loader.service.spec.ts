import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssortmentHealthLoaderService } from './assortment-health-loader.service';

describe('AssortmentHealthLoaderService', () => {
  it('keeps the daily snapshot key while using its observed time and excluding a future observation', async () => {
    const prisma = {
      store: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'store-a',
            name: 'A',
            tenantId: 'tenant-1',
            externalDomain: 'a.example',
            externalClubId: '1',
            isActive: true,
          },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-a',
            article: 'A',
            name: 'A',
            categoryId: null,
            isActive: true,
            purchasePrice: new Prisma.Decimal(10),
            category: null,
            supplier: { name: 'Supplier A', orderMultiplicity: 6 },
          },
        ]),
      },
      inventorySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            snapshotDate: new Date('2026-09-12T00:00:00.000Z'),
            updatedAt: new Date('2026-09-14T12:30:00.000Z'),
            quantity: new Prisma.Decimal(9),
          },
          {
            storeId: 'store-a',
            productId: 'product-a',
            snapshotDate: new Date('2026-09-12T00:00:00.000Z'),
            updatedAt: new Date('2026-09-14T11:45:00.000Z'),
            quantity: new Prisma.Decimal(4),
          },
        ]),
      },
      salesFact: { findMany: jest.fn().mockResolvedValue([]) },
      productOosExclusion: { findMany: jest.fn().mockResolvedValue([]) },
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'writeoff-1',
            storeId: 'store-a',
            productId: 'product-a',
            movementDate: new Date('2026-09-13T12:00:00.000Z'),
            quantity: new Prisma.Decimal(1),
            amount: new Prisma.Decimal(10),
          },
        ]),
      },
      dailyDataCoverage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AssortmentHealthLoaderService(
      prisma as unknown as PrismaService,
    );

    const result = await service.load({
      tenantId: 'tenant-1',
      storeIds: null,
      categoryIds: null,
      period: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-13T23:59:59.999Z'),
      },
      asOf: new Date('2026-09-14T12:00:00.000Z'),
    });

    const row = result.health.rows.find(
      (item) => item.storeId === 'store-a' && item.productId === 'product-a',
    );

    expect(row).toBeDefined();
    expect(row?.inventory.value).toBe(4);
    expect(row?.inventory.state).toBe('AVAILABLE');
    expect(row?.inventory.asOf).toBe('2026-09-14');
    expect(result.productsById.get('product-a')?.orderMultiplicity).toBe(6);
    expect(result.writeOffMovements).toEqual([
      {
        id: 'writeoff-1',
        storeId: 'store-a',
        productId: 'product-a',
        movementDate: new Date('2026-09-13T12:00:00.000Z'),
        quantity: 1,
        amount: 10,
      },
    ]);
  });

  it('keeps the requested turnover horizon, cost-only club valuation, and observed write-offs', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-04-30T23:59:59.999Z');
    const coverageDays = Array.from({ length: 120 }, (_, index) => ({
      businessDate: new Date(Date.UTC(2026, 0, index + 1)),
      status: 'SUCCESS',
      sourceCounts: {},
      summary: { domains: [{ domain: 'a.example', status: 'SUCCESS' }] },
    }));
    const prisma = {
      store: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'store-a',
            name: 'A',
            tenantId: 'tenant-1',
            externalDomain: 'a.example',
            externalClubId: '1',
            isActive: true,
          },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-a',
            article: 'A',
            name: 'A',
            categoryId: null,
            isActive: true,
            purchasePrice: new Prisma.Decimal(0),
            category: null,
            supplier: null,
          },
        ]),
      },
      inventorySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            snapshotDate: new Date('2026-04-30T00:00:00.000Z'),
            updatedAt: new Date('2026-04-30T12:00:00.000Z'),
            quantity: new Prisma.Decimal(5),
          },
        ]),
      },
      salesFact: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            saleDate: new Date('2026-01-10T00:00:00.000Z'),
            quantity: new Prisma.Decimal(10),
            revenue: new Prisma.Decimal(100),
            cost: new Prisma.Decimal(40),
          },
        ]),
      },
      productOosExclusion: { findMany: jest.fn().mockResolvedValue([]) },
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            externalDomain: 'a.example',
            externalClubId: '1',
            priceSale: null,
            purchasePrice: new Prisma.Decimal(7),
            updatedAt: new Date('2026-04-30T12:00:00.000Z'),
          },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            movementDate: new Date('2026-04-20T00:00:00.000Z'),
            quantity: new Prisma.Decimal(2),
            amount: new Prisma.Decimal(14),
          },
        ]),
      },
      dailyDataCoverage: {
        findMany: jest.fn().mockResolvedValue(coverageDays),
      },
    };
    const service = new AssortmentHealthLoaderService(
      prisma as unknown as PrismaService,
    );

    const result = await service.load({
      tenantId: 'tenant-1',
      storeIds: null,
      categoryIds: null,
      period: { from, to },
      asOf: to,
    });
    const row = result.health.rows[0];
    expect(row?.turnoverDays.value).toBe(60);
    expect(row?.frozenValue).toMatchObject({
      value: 35,
      basis: 'CLUB_PURCHASE_PRICE',
    });
    expect(row?.writeOffQuantity).toMatchObject({ value: 2, state: 'PARTIAL' });
  });

  it("keeps two domain-specific assortments out of each other's store scope", async () => {
    const prisma = {
      store: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'store-a',
            name: 'A',
            tenantId: 'tenant-1',
            externalDomain: 'a.example',
            externalClubId: '1',
            isActive: true,
          },
          {
            id: 'store-b',
            name: 'B',
            tenantId: 'tenant-1',
            externalDomain: 'b.example',
            externalClubId: '2',
            isActive: true,
          },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-a',
            article: 'A',
            name: 'A',
            categoryId: null,
            isActive: true,
            purchasePrice: new Prisma.Decimal(10),
            category: null,
            supplier: null,
          },
          {
            id: 'product-b',
            article: 'B',
            name: 'B',
            categoryId: null,
            isActive: true,
            purchasePrice: new Prisma.Decimal(10),
            category: null,
            supplier: null,
          },
        ]),
      },
      inventorySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            storeId: 'store-a',
            productId: 'product-a',
            snapshotDate: new Date('2026-09-14T10:00:00.000Z'),
            quantity: new Prisma.Decimal(4),
          },
          {
            storeId: 'store-b',
            productId: 'product-b',
            snapshotDate: new Date('2026-09-14T10:00:00.000Z'),
            quantity: new Prisma.Decimal(4),
          },
        ]),
      },
      salesFact: { findMany: jest.fn().mockResolvedValue([]) },
      productOosExclusion: { findMany: jest.fn().mockResolvedValue([]) },
      langameClubProductConfiguration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      dailyDataCoverage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AssortmentHealthLoaderService(
      prisma as unknown as PrismaService,
    );

    const result = await service.load({
      tenantId: 'tenant-1',
      storeIds: null,
      categoryIds: null,
      period: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-13T23:59:59.999Z'),
      },
      asOf: new Date('2026-09-14T12:00:00.000Z'),
    });

    expect(
      result.health.rows.map((row) => `${row.storeId}:${row.productId}`),
    ).toEqual(['store-a:product-a', 'store-b:product-b']);
  });
});
