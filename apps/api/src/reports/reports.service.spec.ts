import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
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
};

type TenantContextMock = {
  resolve: jest.Mock;
};

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
} as AuthenticatedUser;

function createPrismaMock(): ReportsPrismaMock {
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
  };
}

describe('ReportsService', () => {
  let prisma: ReportsPrismaMock;
  let tenantContext: TenantContextMock;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      }),
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
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

  it('builds operational report from sales and latest stock', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany.mockResolvedValue([
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
        },
      },
    ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(2),
      },
      {
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(20),
      },
    ]);
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
      marginPercent: 15,
      soldQuantity: 10,
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
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        stockQuantity: 2,
        averageDailySales: 1,
        stockDays: 2,
      },
    ]);
    expect(report.productsWithoutSales[0]).toMatchObject({
      productId: 'product-2',
      article: 'SNK-001',
      stockQuantity: 0,
    });
  });

  it('rejects unknown store filter for operational report', async () => {
    prisma.store.findFirst.mockResolvedValue(null);

    await expect(
      service.getOperationalReport(user, {
        from: '2026-04-01',
        to: '2026-04-10',
        storeId: 'missing-store',
      }),
    ).rejects.toThrow('Store not found');
  });

  it('builds SKU performance report with ABC groups', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.salesFact.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
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
        revenueSharePercent: 80,
        profitSharePercent: 83.3,
      },
      {
        group: 'B',
        productsCount: 1,
        assortmentSharePercent: 33.3,
        revenueSharePercent: 15,
        profitSharePercent: 13.9,
      },
      {
        group: 'C',
        productsCount: 1,
        assortmentSharePercent: 33.3,
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
      { supplierId: 'supplier-1' },
      { supplierId: 'supplier-1' },
      { supplierId: null },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(10),
        revenue: new Prisma.Decimal(1000),
        cost: new Prisma.Decimal(700),
        product: {
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
        productId: 'product-2',
        quantity: new Prisma.Decimal(2),
        revenue: new Prisma.Decimal(200),
        cost: new Prisma.Decimal(100),
        product: {
          supplierId: null,
          supplier: null,
        },
      },
    ]);

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
        category: { name: 'Снеки' },
        supplier: null,
      },
    ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(1),
      },
      {
        storeId: 'store-1',
        productId: 'product-1',
        quantity: new Prisma.Decimal(12),
      },
      {
        storeId: 'store-1',
        productId: 'product-2',
        quantity: new Prisma.Decimal(5),
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        quantity: new Prisma.Decimal(30),
      },
    ]);

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
      totalDailyNeed: 2,
      totalRecommendedOrder: 6,
    });
    expect(report.rows).toEqual([
      {
        productId: 'product-1',
        article: 'DRK-001',
        name: 'Energy Drink',
        categoryName: 'Напитки',
        supplierName: 'Supplier A',
        stockQuantity: 1,
        soldQuantity: 30,
        averageDailySales: 3,
        stockDays: 0.3,
        dailyNeed: 2,
        recommendedOrder: 6,
        orderMultiplicity: 6,
        risk: 'LOW_STOCK',
      },
      {
        productId: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
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
