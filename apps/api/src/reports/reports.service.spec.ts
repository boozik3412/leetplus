import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { ReportsService } from './reports.service';

type ReportsPrismaMock = {
  product: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  store: {
    findFirst: jest.Mock;
  };
  salesFact: {
    findMany: jest.Mock;
  };
  inventorySnapshot: {
    findMany: jest.Mock;
  };
  stockMovement: {
    findMany: jest.Mock;
  };
  productOosExclusion: {
    findMany: jest.Mock;
  };
  recommendationState: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type FreshStoreScopeMock = {
  assertNetwork: jest.Mock;
  resolveRequestedStoreIds: jest.Mock;
};

type AssortmentHealthLoaderMock = {
  load: jest.Mock;
};

function reportHealthRow(value: object) {
  return value as unknown as import('../common/assortment-health').AssortmentHealthRow;
}

type RecommendationStateUpsertArgs = {
  create: {
    tenantId: string;
    recommendationKey: string;
    role: string;
    status: string;
    note?: string | null;
    firstSeenAt?: Date;
    lastSeenAt?: Date;
    statusChangedAt?: Date;
    resolvedAt?: Date | null;
  };
};

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
} as AuthenticatedUser;

function createPrismaMock(): ReportsPrismaMock {
  const now = new Date('2026-04-10T00:00:00.000Z');

  return {
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    store: {
      findFirst: jest.fn(),
    },
    salesFact: {
      findMany: jest.fn(),
    },
    inventorySnapshot: {
      findMany: jest.fn(),
    },
    stockMovement: {
      findMany: jest.fn(),
    },
    productOosExclusion: {
      findMany: jest.fn(),
    },
    recommendationState: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn((args: RecommendationStateUpsertArgs) =>
        Promise.resolve({
          id: 'state-1',
          tenantId: args.create.tenantId,
          recommendationKey: args.create.recommendationKey,
          role: args.create.role,
          status: args.create.status,
          note: args.create.note ?? null,
          firstSeenAt: args.create.firstSeenAt ?? now,
          lastSeenAt: args.create.lastSeenAt ?? now,
          statusChangedAt: args.create.statusChangedAt ?? now,
          resolvedAt: args.create.resolvedAt ?? null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    },
  };
}

describe('ReportsService', () => {
  let prisma: ReportsPrismaMock;
  let tenantContext: TenantContextMock;
  let freshStoreScope: FreshStoreScopeMock;
  let assortmentHealthLoader: AssortmentHealthLoaderMock;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      }),
    };
    freshStoreScope = {
      assertNetwork: jest.fn().mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        mode: 'NETWORK',
        allowedStoreIds: [],
      }),
      resolveRequestedStoreIds: jest
        .fn()
        .mockImplementation(
          (_user: AuthenticatedUser, requested?: readonly string[]) =>
            Promise.resolve({
              userId: 'user-1',
              tenantId: 'tenant-1',
              tenantSlug: 'club-a',
              mode: 'NETWORK',
              allowedStoreIds: [],
              effectiveStoreIds: requested ?? null,
            }),
        ),
    };
    assortmentHealthLoader = {
      load: jest.fn().mockResolvedValue({
        health: { rows: [], summary: {} },
        productsById: new Map(),
        storesById: new Map(),
      }),
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      tenantContext,
      freshStoreScope as unknown as FreshStoreScopeService,
      assortmentHealthLoader as never,
    );
  });

  it('adds compact assortment health to the operational report contract', async () => {
    prisma.salesFact.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.productOosExclusion.findMany.mockResolvedValue([]);

    const report = await service.getOperationalReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
    });

    expect(report.assortmentHealth).toBeDefined();
  });

  it('builds assortment report for resolved tenant', async () => {
    prisma.product.count.mockResolvedValue(3);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        purchasePrice: new Prisma.Decimal(80),
        salePrice: new Prisma.Decimal(100),
        facing: 3,
        categoryId: 'category-1',
        supplierId: 'supplier-1',
        category: { name: 'Напитки' },
        supplier: { name: 'Поставщик A' },
      },
      {
        id: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
        purchasePrice: new Prisma.Decimal(45),
        salePrice: new Prisma.Decimal(50),
        facing: 2,
        categoryId: 'category-2',
        supplierId: null,
        category: { name: 'Снеки' },
        supplier: null,
      },
    ]);
    assortmentHealthLoader.load.mockResolvedValueOnce({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-1',
            risk: 'LOW_STOCK',
            inventory: { value: 2, reason: null },
            demand21d: { value: 1, reason: null },
            price: { value: 100, reason: null },
            turnoverDays: { value: 2 },
          }),
        ],
        summary: {
          writeOffQuantity: { value: 1 },
          writeOffAmount: { value: 80 },
        },
      },
      productsById: new Map([
        [
          'product-1',
          {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Adrenaline Rush',
            categoryId: null,
            categoryName: null,
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        productId: 'product-2',
        quantity: new Prisma.Decimal(5),
      },
    ]);

    const report = await service.getAssortmentReport(user);

    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      totalSku: 3,
      activeSku: 2,
      inactiveSku: 1,
      averageMarginPercent: 15,
      averageMarkupPercent: 18.1,
      categoryBreakdown: [
        {
          name: 'Напитки',
          productsCount: 1,
          totalFacing: 3,
        },
        {
          name: 'Снеки',
          productsCount: 1,
          totalFacing: 2,
        },
      ],
    });
    expect(report.supplierBreakdown.map((group) => group.name)).toContain(
      'Без поставщика',
    );
    expect(report.lowMarginProducts[0]).toMatchObject({
      article: 'SNK-001',
      marginPercent: 10,
    });
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', isActive: true },
      }),
    );
  });

  it('returns zero metrics without active products', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);

    await expect(service.getAssortmentReport(user)).resolves.toMatchObject({
      totalSku: 0,
      activeSku: 0,
      inactiveSku: 0,
      averageMarginPercent: 0,
      averageMarkupPercent: 0,
      categoryBreakdown: [],
      supplierBreakdown: [],
      lowMarginProducts: [],
    });
  });

  it('scopes assortment inventory to the fresh club-owner allow-list', async () => {
    freshStoreScope.resolveRequestedStoreIds.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      mode: 'STORES',
      allowedStoreIds: ['store-1'],
      effectiveStoreIds: ['store-1'],
    });
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);

    await service.getAssortmentReport(user);

    expect(prisma.inventorySnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          storeId: { in: ['store-1'] },
        },
      }),
    );
  });

  it('builds operational report from sales and latest stock', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany
      .mockResolvedValueOnce([
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          productId: 'product-1',
          quantity: new Prisma.Decimal(10),
          revenue: new Prisma.Decimal(1000),
          cost: new Prisma.Decimal(850),
          product: {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Adrenaline Rush',
            canonicalProduct: null,
          },
          store: { id: 'store-1', name: 'Club A' },
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          productId: 'product-1',
          quantity: new Prisma.Decimal(21),
          revenue: new Prisma.Decimal(2100),
          cost: new Prisma.Decimal(1700),
          product: {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Adrenaline Rush',
            canonicalProduct: null,
          },
          store: { id: 'store-1', name: 'Club A' },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-1',
        product: {
          article: 'DRK-001',
          name: 'Adrenaline Rush',
          canonicalProduct: null,
          category: null,
          supplier: null,
        },
        quantity: new Prisma.Decimal(2),
      },
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-1',
        product: {
          article: 'DRK-001',
          name: 'Adrenaline Rush',
          canonicalProduct: null,
          category: null,
          supplier: null,
        },
        quantity: new Prisma.Decimal(20),
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        type: 'WRITEOFF',
        quantity: new Prisma.Decimal(1),
        amount: new Prisma.Decimal(80),
      },
      {
        type: 'RETURN',
        quantity: new Prisma.Decimal(2),
        amount: new Prisma.Decimal(200),
      },
    ]);
    prisma.productOosExclusion.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        category: null,
        supplier: null,
      },
      {
        id: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
        category: { name: 'Снеки' },
        supplier: null,
      },
    ]);

    assortmentHealthLoader.load.mockResolvedValue({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-1',
            risk: 'LOW_STOCK',
            inventory: { value: 2, reason: null },
            demand21d: { value: 1, reason: null },
            price: { value: 100, reason: null },
            turnoverDays: { value: 2 },
            noSales: { 7: false, 14: false, 21: false, 30: false },
            writeOffQuantity: { value: null },
            writeOffAmount: { value: null },
          }),
        ],
        summary: {
          writeOffQuantity: { value: 1 },
          writeOffAmount: { value: 80 },
        },
      },
      productsById: new Map([
        [
          'product-1',
          {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Adrenaline Rush',
            categoryId: null,
            categoryName: null,
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });

    const report = await service.getOperationalReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
      totalRevenue: 1000,
      totalCost: 850,
      grossProfit: 150,
      adjustedGrossProfit: -130,
      marginPercent: 15,
      adjustedMarginPercent: -13,
      soldQuantity: 10,
      writeOffQuantity: 1,
      writeOffAmount: 80,
      returnQuantity: 2,
      returnAmount: 200,
      averageDailyRevenue: 100,
      stockQuantity: 2,
      stockDays: 2,
    });
    expect(report.recommendations.map((item) => item.kind)).toEqual([
      'REPLENISH_STOCK',
      'LOW_MARGIN',
    ]);
    expect(report.recommendations[0]).toMatchObject({
      severity: 'MEDIUM',
      productId: 'product-1',
      metricLabel: 'Дней запаса',
      metricValue: '2',
    });
    expect(report.outOfStockRiskProducts).toEqual([
      {
        productId: 'product-1',
        storeId: 'store-1',
        storeName: 'Club A',
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        isCanonical: false,
        canonicalProductName: null,
        categoryName: null,
        supplierId: null,
        supplierName: null,
        stockQuantity: 2,
        averageDailySales: 1,
        revenueAtRiskPerDay: 100,
        grossProfitAtRiskPerDay: null,
        grossProfitAtRiskForPeriod: null,
        stockDays: 2,
        state: 'LOW_STOCK',
        reason: null,
      },
    ]);
    expect(report.productsWithoutSales).toEqual([]);
    expect(report.marginCoverage).toEqual({
      state: 'READY',
      fullMarginPercent: 15,
      fullGrossProfit: 150,
      partialMarginPercent: 15,
      partialGrossProfit: 150,
      coveredRevenue: 1000,
      coveredOperations: 1,
      totalRevenue: 1000,
      totalOperations: 1,
    });
  });

  it('excludes zero stock and period arrivals from products without sales', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const stockSnapshot = (
      productId: string,
      name: string,
      quantity: number,
      snapshotDate: string,
      salePrice = 0,
    ) => ({
      storeId: 'store-1',
      store: { name: 'Club A' },
      productId,
      product: {
        article: productId,
        name,
        purchasePrice: new Prisma.Decimal(0),
        salePrice: new Prisma.Decimal(salePrice),
        canonicalProduct: null,
        category: null,
        supplier: null,
      },
      quantity: new Prisma.Decimal(quantity),
      snapshotDate: new Date(snapshotDate),
    });

    prisma.inventorySnapshot.findMany.mockResolvedValue([
      stockSnapshot('product-keep', 'Stable stock', 4, '2026-04-10', 120),
      stockSnapshot('product-arrival', 'New arrival', 5, '2026-04-10'),
      stockSnapshot('product-restock', 'Restocked product', 7, '2026-04-10'),
      stockSnapshot('product-zero', 'Zero stock', 0, '2026-04-10'),
      stockSnapshot('product-keep', 'Stable stock', 4, '2026-03-31'),
      stockSnapshot('product-arrival', 'New arrival', 0, '2026-03-31'),
      stockSnapshot('product-restock', 'Restocked product', 2, '2026-03-31'),
      stockSnapshot('product-zero', 'Zero stock', 3, '2026-03-31'),
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.productOosExclusion.findMany.mockResolvedValue([]);
    assortmentHealthLoader.load.mockResolvedValueOnce({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-keep',
            risk: 'NO_DEMAND',
            inventory: { value: 4, reason: null },
            noSales: { 7: true, 14: true, 21: true, 30: true },
            frozenValue: {
              value: 480,
              basis: 'SALE_PRICE_ESTIMATE',
              reason: null,
            },
          }),
        ],
        summary: {},
      },
      productsById: new Map([
        [
          'product-keep',
          {
            id: 'product-keep',
            article: 'product-keep',
            name: 'Stable stock',
            categoryId: null,
            categoryName: null,
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });

    const report = await service.getOperationalReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report.productsWithoutSales).toEqual([
      expect.objectContaining({
        productId: 'product-keep',
        stockQuantity: 4,
        frozenStockUnitValue: 120,
        frozenStockValuation: 'SALE_PRICE_ESTIMATE',
        frozenStockAmount: 480,
      }),
    ]);
  });

  it('keeps category and as-of scope identical for legacy operations and engine rows', async () => {
    prisma.salesFact.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    assortmentHealthLoader.load.mockResolvedValueOnce({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-oos',
            risk: 'OUT_OF_STOCK',
            inventory: { value: 0 },
            demand21d: { value: 2 },
            price: { value: 100 },
            turnoverDays: { value: 0 },
          }),
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-frozen',
            risk: 'NO_DEMAND',
            inventory: { value: 4 },
            noSales: { 7: false, 14: true, 21: true, 30: true },
            frozenValue: { value: 480, basis: 'SALE_PRICE_ESTIMATE' },
          }),
        ],
        summary: {},
      },
      productsById: new Map([
        [
          'product-oos',
          {
            id: 'product-oos',
            article: 'OOS-1',
            name: 'OOS item',
            categoryId: 'category-1',
            categoryName: 'Drinks',
            supplierName: null,
          },
        ],
        [
          'product-frozen',
          {
            id: 'product-frozen',
            article: 'FRZ-1',
            name: 'Frozen item',
            categoryId: 'category-1',
            categoryName: 'Drinks',
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });

    const report = await service.getOperationalReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      categoryIds: ['category-1'],
      asOf: '2026-04-05',
      noSalesDays: 14,
    });

    expect(report.categoryIds).toEqual(['category-1']);
    expect(report.asOf).toBe('2026-04-05');
    expect(report.outOfStockRiskProducts.map((row) => row.productId)).toEqual([
      'product-oos',
    ]);
    expect(report.productsWithoutSales.map((row) => row.productId)).toEqual([
      'product-frozen',
    ]);
    expect(report.recommendations.map((item) => item.id)).toEqual([
      'stock:store-1:product-oos',
      'no-sales:store-1:product-frozen',
    ]);
    expect(assortmentHealthLoader.load).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryIds: ['category-1'],
        asOf: new Date('2026-04-05T23:59:59.999Z'),
      }),
    );
    const salesQuery = (
      prisma.salesFact.findMany.mock.calls as unknown as Array<
        [
          {
            where: {
              product: { categoryId: { in: string[] } };
              saleDate: { lte: Date };
            };
          },
        ]
      >
    )[0]?.[0];
    expect(salesQuery).toBeDefined();
    if (!salesQuery) throw new Error('Expected scoped sales query');
    expect(salesQuery.where.product.categoryId.in).toEqual(['category-1']);
    expect(salesQuery.where.saleDate.lte).toEqual(
      new Date('2026-04-05T23:59:59.999Z'),
    );
  });

  it('rejects unknown store filter for operational report', async () => {
    freshStoreScope.resolveRequestedStoreIds.mockRejectedValueOnce(
      new ForbiddenException('Store is outside your tenant'),
    );

    await expect(
      service.getOperationalReport(user, {
        from: '2026-04-01',
        to: '2026-04-10',
        storeId: 'missing-store',
      }),
    ).rejects.toThrow('Store is outside your tenant');
  });

  it('builds inventory turnover report for slow and frozen stock', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany
      .mockResolvedValueOnce([
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          store: { id: 'store-1', name: 'Club A' },
          productId: 'product-slow',
          quantity: new Prisma.Decimal(2),
          revenue: new Prisma.Decimal(200),
          cost: new Prisma.Decimal(120),
          product: {
            article: 'DRK-001',
            name: 'Energy Drink',
            supplierId: 'supplier-1',
            canonicalProduct: null,
            supplier: { name: 'Supplier A' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          storeId: 'store-1',
          productId: 'product-slow',
          saleDate: new Date('2026-04-08T00:00:00.000Z'),
          quantity: new Prisma.Decimal(2),
          revenue: new Prisma.Decimal(200),
        },
      ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-slow',
        product: {
          id: 'product-slow',
          article: 'DRK-001',
          name: 'Energy Drink',
          purchasePrice: new Prisma.Decimal(10),
          salePrice: new Prisma.Decimal(100),
          canonicalProduct: null,
          categoryId: 'category-1',
          category: { name: 'Напитки' },
          supplierId: 'supplier-1',
          supplier: { id: 'supplier-1', name: 'Supplier A' },
        },
        quantity: new Prisma.Decimal(100),
        snapshotDate: new Date('2026-04-10T00:00:00.000Z'),
      },
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-frozen',
        product: {
          id: 'product-frozen',
          article: 'SNK-001',
          name: 'Chips',
          purchasePrice: new Prisma.Decimal(0),
          salePrice: new Prisma.Decimal(50),
          canonicalProduct: null,
          categoryId: 'category-2',
          category: { name: 'Снеки' },
          supplierId: null,
          supplier: null,
        },
        quantity: new Prisma.Decimal(5),
        snapshotDate: new Date('2026-04-10T00:00:00.000Z'),
      },
    ]);
    assortmentHealthLoader.load.mockResolvedValueOnce({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-slow',
            inventory: { value: 100 },
            demand21d: { value: 0.2 },
            turnoverDays: { value: 500 },
            frozenValue: { value: 1000, basis: 'PURCHASE_PRICE' },
          }),
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-frozen',
            inventory: { value: 5 },
            demand21d: { value: 0 },
            turnoverDays: { value: null },
            noSales: { 7: true, 14: true, 21: true, 30: true },
            frozenValue: { value: 250, basis: 'SALE_PRICE' },
          }),
        ],
        summary: {},
      },
      productsById: new Map([
        [
          'product-slow',
          {
            id: 'product-slow',
            article: 'DRK-001',
            name: 'Energy Drink',
            categoryId: 'category-1',
            categoryName: 'Напитки',
            supplierName: 'Supplier A',
          },
        ],
        [
          'product-frozen',
          {
            id: 'product-frozen',
            article: 'SNK-001',
            name: 'Chips',
            categoryId: 'category-2',
            categoryName: 'Снеки',
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });

    const report = await service.getInventoryTurnoverReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      totalStockQuantity: 105,
      totalFrozenStockAmount: 1250,
      slowSkuCount: 1,
      frozenSkuCount: 1,
    });
    expect(report.rows.map((row) => row.status)).toEqual(['FROZEN', 'SLOW']);
    expect(report.rows[0]).toMatchObject({
      productId: 'product-frozen',
      frozenStockUnitValue: 50,
      frozenStockValuation: 'SALE_PRICE',
      frozenStockAmount: 250,
    });
    expect(report.rows[1]).toMatchObject({
      productId: 'product-slow',
      stockDays: 500,
      turnoverRate: 0,
      frozenStockAmount: 1000,
    });
  });

  it('preserves an unknown frozen-stock valuation in turnover rows', async () => {
    assortmentHealthLoader.load.mockResolvedValueOnce({
      health: {
        rows: [
          reportHealthRow({
            storeId: 'store-1',
            productId: 'product-unknown',
            inventory: { value: 3 },
            demand21d: { value: 0 },
            turnoverDays: { value: null },
            noSales: { 7: true, 14: true, 21: true, 30: true },
            frozenValue: { value: null, basis: 'UNKNOWN' },
          }),
        ],
        summary: {},
      },
      productsById: new Map([
        [
          'product-unknown',
          {
            id: 'product-unknown',
            article: 'UNK-1',
            name: 'Unknown value',
            categoryId: null,
            categoryName: null,
            supplierName: null,
          },
        ],
      ]),
      storesById: new Map([['store-1', { id: 'store-1', name: 'Club A' }]]),
    });

    const report = await service.getInventoryTurnoverReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
    });

    expect(report.rows).toEqual([
      expect.objectContaining({
        productId: 'product-unknown',
        frozenStockValuation: 'UNKNOWN',
        frozenStockUnitValue: null,
        frozenStockAmount: null,
      }),
    ]);
  });

  it('builds plan fact report by network, store, category and supplier', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany
      .mockResolvedValueOnce([
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          store: { id: 'store-1', name: 'Club A' },
          productId: 'product-1',
          quantity: new Prisma.Decimal(10),
          revenue: new Prisma.Decimal(1000),
          cost: new Prisma.Decimal(700),
          product: {
            id: 'product-1',
            name: 'Energy Drink',
            purchasePrice: new Prisma.Decimal(70),
            categoryId: 'category-1',
            category: { name: 'Напитки' },
            supplierId: 'supplier-1',
            supplier: { name: 'Supplier A' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: 'tenant-1',
          storeId: 'store-1',
          store: { id: 'store-1', name: 'Club A' },
          productId: 'product-1',
          quantity: new Prisma.Decimal(8),
          revenue: new Prisma.Decimal(800),
          cost: new Prisma.Decimal(560),
          product: {
            id: 'product-1',
            name: 'Energy Drink',
            purchasePrice: new Prisma.Decimal(70),
            categoryId: 'category-1',
            category: { name: 'Напитки' },
            supplierId: 'supplier-1',
            supplier: { name: 'Supplier A' },
          },
        },
      ]);
    prisma.inventorySnapshot.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const report = await service.getPlanFactReport(user, {
      from: '2026-04-11',
      to: '2026-04-20',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      planFrom: '2026-04-01',
      planTo: '2026-04-10',
      summary: {
        currentRevenue: 1000,
        planRevenue: 800,
        revenueDelta: 200,
        revenueCompletionPercent: 125,
      },
    });
    expect(report.rows.map((row) => row.level)).toEqual([
      'store',
      'category',
      'supplier',
    ]);
  });

  it('builds SKU performance report with ABC groups', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        store: { id: 'store-1', name: 'Club A' },
        productId: 'product-1',
        quantity: new Prisma.Decimal(10),
        revenue: new Prisma.Decimal(800),
        cost: new Prisma.Decimal(500),
        product: {
          id: 'product-1',
          article: 'DRK-001',
          name: 'Energy Drink',
          facing: 2,
          category: { name: 'Напитки' },
          supplier: { name: 'Supplier A' },
        },
      },
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        store: { id: 'store-1', name: 'Club A' },
        productId: 'product-2',
        quantity: new Prisma.Decimal(5),
        revenue: new Prisma.Decimal(150),
        cost: new Prisma.Decimal(100),
        product: {
          id: 'product-2',
          article: 'SNK-001',
          name: 'Chips',
          facing: 1,
          category: { name: 'Снеки' },
          supplier: null,
        },
      },
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        productId: 'product-3',
        quantity: new Prisma.Decimal(2),
        revenue: new Prisma.Decimal(50),
        cost: new Prisma.Decimal(40),
        product: {
          id: 'product-3',
          article: 'SWT-001',
          name: 'Chocolate',
          facing: 2,
          category: { name: 'Сладости' },
          supplier: null,
        },
      },
    ]);
    prisma.productOosExclusion.findMany.mockResolvedValue([]);

    const report = await service.getSkuPerformanceReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });
    expect(report.rows.map((row) => row.article)).toEqual([
      'DRK-001',
      'SNK-001',
      'SWT-001',
    ]);
    expect(report.rows[0]).toMatchObject({
      revenue: 800,
      grossProfit: 300,
      marginPercent: 37.5,
      revenueSharePercent: 80,
      profitSharePercent: 83.3,
      salesPerFacing: 5,
      profitPerFacing: 150,
      abcRevenueGroup: 'A',
      abcProfitGroup: 'A',
    });
    expect(report.abcByRevenue).toEqual([
      {
        group: 'A',
        productsCount: 1,
        assortmentSharePercent: 33.3,
        revenue: 800,
        grossProfit: 300,
        revenueSharePercent: 80,
        profitSharePercent: 83.3,
      },
      {
        group: 'B',
        productsCount: 1,
        assortmentSharePercent: 33.3,
        revenue: 150,
        grossProfit: 50,
        revenueSharePercent: 15,
        profitSharePercent: 13.9,
      },
      {
        group: 'C',
        productsCount: 1,
        assortmentSharePercent: 33.3,
        revenue: 50,
        grossProfit: 10,
        revenueSharePercent: 5,
        profitSharePercent: 2.8,
      },
    ]);
    expect(report.topByQuantity[0].article).toBe('DRK-001');
    expect(report.topByProfitPerFacing[0].article).toBe('DRK-001');
  });

  it('builds suppliers performance report', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.product.findMany.mockResolvedValue([
      {
        supplierId: 'supplier-1',
        supplier: {
          id: 'supplier-1',
          name: 'Supplier A',
          paymentDelayDays: 14,
          minOrderAmount: new Prisma.Decimal(5000),
          orderMultiplicity: 6,
        },
      },
      {
        supplierId: 'supplier-1',
        supplier: {
          id: 'supplier-1',
          name: 'Supplier A',
          paymentDelayDays: 14,
          minOrderAmount: new Prisma.Decimal(5000),
          orderMultiplicity: 6,
        },
      },
      { supplierId: null, supplier: null },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        store: { id: 'store-1', name: 'Club A' },
        productId: 'product-1',
        quantity: new Prisma.Decimal(10),
        revenue: new Prisma.Decimal(1000),
        cost: new Prisma.Decimal(700),
        product: {
          article: 'DRK-001',
          name: 'Energy Drink',
          categoryId: 'category-1',
          category: { name: 'Напитки' },
          canonicalProduct: null,
          supplierId: 'supplier-1',
          supplier: {
            id: 'supplier-1',
            name: 'Supplier A',
            paymentDelayDays: 14,
            minOrderAmount: new Prisma.Decimal(5000),
            orderMultiplicity: 6,
          },
        },
      },
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        store: { id: 'store-1', name: 'Club A' },
        productId: 'product-2',
        quantity: new Prisma.Decimal(2),
        revenue: new Prisma.Decimal(200),
        cost: new Prisma.Decimal(100),
        product: {
          article: 'SNK-001',
          name: 'Chips',
          categoryId: null,
          category: null,
          canonicalProduct: null,
          supplierId: null,
          supplier: null,
        },
      },
    ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const report = await service.getSuppliersPerformanceReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
      totalRevenue: 1200,
      totalGrossProfit: 400,
    });
    expect(report.rows).toEqual([
      {
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
        activeSku: 2,
        soldQuantity: 10,
        revenue: 1000,
        cost: 700,
        grossProfit: 300,
        marginPercent: 30,
        salesSharePercent: 83.3,
        profitSharePercent: 75,
        averageRevenuePerSku: 500,
        paymentDelayDays: 14,
        minOrderAmount: '5000',
        orderMultiplicity: 6,
        writeOffQuantity: 0,
        writeOffAmount: 0,
        oosSkuCount: 1,
        slowSkuCount: 0,
        frozenSkuCount: 0,
        frozenStockAmount: 0,
        problemCategoryName: 'Напитки',
        deliveryQualityStatus: 'TERMS_CONFIGURED',
        deliveryQualityNote:
          'Условия поставки заполнены; фактические сроки и SLA поставок пока не импортируются.',
      },
      {
        supplierId: null,
        supplierName: 'Без поставщика',
        activeSku: 1,
        soldQuantity: 2,
        revenue: 200,
        cost: 100,
        grossProfit: 100,
        marginPercent: 50,
        salesSharePercent: 16.7,
        profitSharePercent: 25,
        averageRevenuePerSku: 200,
        paymentDelayDays: null,
        minOrderAmount: null,
        orderMultiplicity: null,
        writeOffQuantity: 0,
        writeOffAmount: 0,
        oosSkuCount: 1,
        slowSkuCount: 0,
        frozenSkuCount: 0,
        frozenStockAmount: 0,
        problemCategoryName: 'Без категории',
        deliveryQualityStatus: 'NO_DELIVERY_FACTS',
        deliveryQualityNote:
          'Фактические сроки и качество поставок пока не импортируются.',
      },
    ]);
  });

  it('builds replenishment report from latest stock and sales demand', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Energy Drink',
        canonicalProduct: null,
        category: { name: 'Напитки' },
        supplier: {
          name: 'Supplier A',
          orderMultiplicity: 6,
        },
      },
      {
        id: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
        canonicalProduct: null,
        category: { name: 'Снеки' },
        supplier: null,
      },
    ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-1',
        product: {
          article: 'DRK-001',
          name: 'Energy Drink',
          canonicalProduct: null,
          category: { name: 'Напитки' },
          supplier: { name: 'Supplier A' },
        },
        quantity: new Prisma.Decimal(1),
      },
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-1',
        product: {
          article: 'DRK-001',
          name: 'Energy Drink',
          canonicalProduct: null,
          category: { name: 'Напитки' },
          supplier: { name: 'Supplier A' },
        },
        quantity: new Prisma.Decimal(12),
      },
      {
        storeId: 'store-1',
        store: { name: 'Club A' },
        productId: 'product-2',
        product: {
          article: 'SNK-001',
          name: 'Chips',
          canonicalProduct: null,
          category: { name: 'Снеки' },
          supplier: null,
        },
        quantity: new Prisma.Decimal(5),
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(63),
      },
    ]);
    prisma.productOosExclusion.findMany.mockResolvedValue([]);

    const report = await service.getReplenishmentReport(user, {
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
    });

    expect(report).toMatchObject({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-10',
      storeId: 'store-1',
      totalStockQuantity: 6,
      totalDailyNeed: 20,
      totalRecommendedOrder: 24,
    });
    expect(report.rows).toEqual([
      {
        productId: 'product-1',
        storeId: 'store-1',
        storeName: 'Club A',
        article: 'DRK-001',
        name: 'Energy Drink',
        isCanonical: false,
        canonicalProductName: null,
        categoryName: 'Напитки',
        supplierName: 'Supplier A',
        stockQuantity: 1,
        soldQuantity: 63,
        averageDailySales: 3,
        stockDays: 0.3,
        dailyNeed: 20,
        recommendedOrder: 24,
        orderMultiplicity: 6,
        risk: 'LOW_STOCK',
      },
      {
        productId: 'product-2',
        storeId: 'store-1',
        storeName: 'Club A',
        article: 'SNK-001',
        name: 'Chips',
        isCanonical: false,
        canonicalProductName: null,
        categoryName: 'Снеки',
        supplierName: null,
        stockQuantity: 5,
        soldQuantity: 0,
        averageDailySales: 0,
        stockDays: null,
        dailyNeed: 0,
        recommendedOrder: 0,
        orderMultiplicity: null,
        risk: 'NO_SALES',
      },
    ]);
  });
});
