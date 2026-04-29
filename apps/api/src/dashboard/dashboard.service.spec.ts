import { Prisma } from '@prisma/client';
import { DashboardService, type DashboardPeriod } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type DashboardPrismaMock = {
  tenant: {
    findUnique: jest.Mock;
  };
  product: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  category: {
    count: jest.Mock;
  };
  supplier: {
    count: jest.Mock;
  };
  salesFact: {
    findMany: jest.Mock;
  };
  clubRevenueFact: {
    findMany: jest.Mock;
  };
  inventorySnapshot: {
    findMany: jest.Mock;
  };
  stockMovement: {
    findMany: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type SalesFactFindManyCall = [
  {
    where: {
      storeId?: unknown;
      saleDate: {
        gte: Date;
        lte: Date;
      };
    };
  },
];

const calendarTrendCases: {
  period: DashboardPeriod;
  labels: string[];
  trendFrom: string;
}[] = [
  {
    period: 'week',
    labels: [
      '11.2026',
      '12.2026',
      '13.2026',
      '14.2026',
      '15.2026',
      '16.2026',
      '17.2026',
      '18.2026',
    ],
    trendFrom: '2026-03-09T00:00:00.000Z',
  },
  {
    period: 'month',
    labels: [
      '09.2025',
      '10.2025',
      '11.2025',
      '12.2025',
      '01.2026',
      '02.2026',
      '03.2026',
      '04.2026',
    ],
    trendFrom: '2025-09-01T00:00:00.000Z',
  },
  {
    period: 'quarter',
    labels: [
      'Q3.2024',
      'Q4.2024',
      'Q1.2025',
      'Q2.2025',
      'Q3.2025',
      'Q4.2025',
      'Q1.2026',
      'Q2.2026',
    ],
    trendFrom: '2024-07-01T00:00:00.000Z',
  },
  {
    period: 'year',
    labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
    trendFrom: '2019-01-01T00:00:00.000Z',
  },
];

function createPrismaMock(): DashboardPrismaMock {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    category: {
      count: jest.fn(),
    },
    supplier: {
      count: jest.fn(),
    },
    salesFact: {
      findMany: jest.fn(),
    },
    clubRevenueFact: {
      findMany: jest.fn(),
    },
    inventorySnapshot: {
      findMany: jest.fn(),
    },
    stockMovement: {
      findMany: jest.fn(),
    },
  };
}

describe('DashboardService', () => {
  let prisma: DashboardPrismaMock;
  let tenantContext: TenantContextMock;
  let service: DashboardService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
      }),
    };
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Demo Cyber Club',
    });
    service = new DashboardService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
  });

  function mockEmptyDashboardData() {
    prisma.product.count.mockResolvedValue(0);
    prisma.category.count.mockResolvedValue(0);
    prisma.supplier.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.salesFact.findMany.mockResolvedValue([]);
    prisma.clubRevenueFact.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
  }

  it('returns summary calculated for resolved tenant', async () => {
    prisma.product.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.category.count.mockResolvedValue(3);
    prisma.supplier.count.mockResolvedValue(4);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Energy Drink',
        purchasePrice: new Prisma.Decimal(50),
        salePrice: new Prisma.Decimal(100),
        facing: 2,
        supplier: { orderMultiplicity: 6 },
      },
      {
        id: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
        purchasePrice: new Prisma.Decimal(60),
        salePrice: new Prisma.Decimal(120),
        facing: 4,
        supplier: null,
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      {
        productId: 'product-1',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(10),
        revenue: new Prisma.Decimal(1000),
        cost: new Prisma.Decimal(500),
        product: {
          id: 'product-1',
          article: 'DRK-001',
          name: 'Energy Drink',
        },
        store: {
          id: 'store-1',
          name: 'Club A',
        },
      },
      {
        productId: 'product-2',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(2),
        revenue: new Prisma.Decimal(240),
        cost: new Prisma.Decimal(120),
        product: {
          id: 'product-2',
          article: 'SNK-001',
          name: 'Chips',
        },
        store: {
          id: 'store-1',
          name: 'Club A',
        },
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
        productId: 'product-2',
        quantity: new Prisma.Decimal(20),
      },
    ]);
    prisma.clubRevenueFact.findMany.mockResolvedValue([
      {
        revenueDate: new Date(),
        totalRevenue: new Prisma.Decimal(2000),
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        type: 'WRITEOFF',
        amount: new Prisma.Decimal(50),
      },
      {
        type: 'RETURN',
        amount: new Prisma.Decimal(20),
      },
    ]);

    const summary = await service.getSummary();

    expect(summary).toMatchObject({
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
      tenantName: 'Demo Cyber Club',
      periodLabel: 'Текущий месяц',
      skuGrouping: 'club',
      selectedStoreIds: [],
      totalSku: 2,
      activeSku: 1,
      categoriesCount: 3,
      suppliersCount: 4,
      averageMarginPercent: 50,
      averageFacing: 3,
      totalRevenue: 1240,
      grossProfit: 620,
      adjustedGrossProfit: 550,
      marginPercent: 50,
      adjustedMarginPercent: 44.4,
      soldQuantity: 12,
      writeOffAmount: 50,
      returnAmount: 20,
      stockQuantity: 21,
      outOfStockRiskCount: 1,
      recommendedOrderQuantity: 0,
    });
    expect(summary.periodFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.periodTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.salesTrend).toHaveLength(8);
    expect(summary.salesTrend.some((segment) => segment.clubRevenue > 0)).toBe(
      true,
    );
    expect(summary.topSkuByRevenue).toEqual([
      {
        productId: 'product-1',
        article: 'DRK-001',
        name: 'Energy Drink',
        storeId: 'store-1',
        storeName: 'Club A',
        revenue: 1000,
        grossProfit: 500,
        soldQuantity: 10,
      },
      {
        productId: 'product-2',
        article: 'SNK-001',
        name: 'Chips',
        storeId: 'store-1',
        storeName: 'Club A',
        revenue: 240,
        grossProfit: 120,
        soldQuantity: 2,
      },
    ]);

    expect(tenantContext.resolve).toHaveBeenCalledWith(undefined);
    expect(prisma.product.count).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-demo' },
    });
    expect(prisma.product.count).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant-demo', isActive: true },
    });
    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-demo' },
    });
    expect(prisma.supplier.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-demo' },
    });
  });

  it('returns zero averages when tenant has no products', async () => {
    mockEmptyDashboardData();

    const summary = await service.getSummary();

    expect(summary).toMatchObject({
      averageMarginPercent: 0,
      averageFacing: 0,
      totalRevenue: 0,
      topSkuByRevenue: [],
    });
    expect(summary.salesTrend).toHaveLength(8);
  });

  it.each(calendarTrendCases)(
    'builds one trend bar per selected $period period',
    async ({ period, labels, trendFrom }) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

      try {
        mockEmptyDashboardData();

        const summary = await service.getSummary(undefined, { period });

        expect(summary.salesTrend.map((segment) => segment.label)).toEqual(
          labels,
        );
        const [trendSalesFactFindMany] = prisma.salesFact.findMany.mock
          .calls[1] as SalesFactFindManyCall;
        expect(trendSalesFactFindMany.where.saleDate.gte.toISOString()).toBe(
          trendFrom,
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('sums daily trend across all stores as separate days when network is selected', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

    try {
      prisma.product.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      prisma.category.count.mockResolvedValue(0);
      prisma.supplier.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'product-1',
          article: 'DRK-001',
          name: 'Energy Drink',
          purchasePrice: new Prisma.Decimal(50),
          salePrice: new Prisma.Decimal(100),
          facing: 2,
          supplier: null,
        },
      ]);
      prisma.salesFact.findMany.mockResolvedValue([
        {
          productId: 'product-1',
          saleDate: new Date('2026-04-29T01:00:00.000Z'),
          quantity: new Prisma.Decimal(1),
          revenue: new Prisma.Decimal(100),
          cost: new Prisma.Decimal(50),
          product: {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Energy Drink',
          },
          store: {
            id: 'store-1',
            name: 'Club A',
          },
        },
        {
          productId: 'product-1',
          saleDate: new Date('2026-04-29T01:30:00.000Z'),
          quantity: new Prisma.Decimal(2),
          revenue: new Prisma.Decimal(200),
          cost: new Prisma.Decimal(100),
          product: {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Energy Drink',
          },
          store: {
            id: 'store-2',
            name: 'Club B',
          },
        },
      ]);
      prisma.inventorySnapshot.findMany.mockResolvedValue([]);
      prisma.clubRevenueFact.findMany.mockResolvedValue([
        {
          revenueDate: new Date('2026-04-29T00:00:00.000Z'),
          totalRevenue: new Prisma.Decimal(1000),
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([]);

      const summary = await service.getSummary(undefined, { period: 'day' });

      expect(summary.totalRevenue).toBe(300);
      expect(summary.soldQuantity).toBe(3);
      expect(summary.periodFrom).toBe('2026-04-29');
      expect(summary.periodTo).toBe('2026-04-29');
      expect(summary.salesTrend[7]).toMatchObject({
        label: '29.04',
        revenue: 300,
        clubRevenue: 1000,
        revenueSharePercent: 30,
        soldQuantity: 3,
      });
      expect(summary.salesTrend.map((segment) => segment.label)).toEqual([
        '22.04',
        '23.04',
        '24.04',
        '25.04',
        '26.04',
        '27.04',
        '28.04',
        '29.04',
      ]);
      const [summarySalesFactFindMany] = prisma.salesFact.findMany.mock
        .calls[0] as SalesFactFindManyCall;
      const [trendSalesFactFindMany] = prisma.salesFact.findMany.mock
        .calls[1] as SalesFactFindManyCall;
      expect(summarySalesFactFindMany.where.storeId).toBeUndefined();
      expect(trendSalesFactFindMany.where.storeId).toBeUndefined();
      expect(summarySalesFactFindMany.where.saleDate.gte.toISOString()).toBe(
        '2026-04-29T00:00:00.000Z',
      );
      expect(trendSalesFactFindMany.where.saleDate.gte.toISOString()).toBe(
        '2026-04-22T00:00:00.000Z',
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
