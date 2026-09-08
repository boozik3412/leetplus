import { Prisma } from '@prisma/client';
import { DashboardService, type DashboardPeriod } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { bindReceiptIdentityToSourceHash } from '../common/receipt-source-identity';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';

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
  store: {
    findMany: jest.Mock;
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
  guestSession: {
    findMany: jest.Mock;
  };
  guestTransaction: {
    findMany: jest.Mock;
  };
  guestOperationLog: {
    findMany: jest.Mock;
  };
  guestWorkingShift: {
    findMany: jest.Mock;
  };
  businessSnapshotRun: {
    findFirst: jest.Mock;
  };
  integrationSyncJob: {
    findFirst: jest.Mock;
  };
};

type FreshStoreScopeMock = {
  resolveRequestedStoreIds: jest.Mock;
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
    trendFrom: '2026-02-17T00:00:00.000Z',
  },
  {
    period: 'month',
    labels: [
      'сен.25',
      'окт.25',
      'ноя.25',
      'дек.25',
      'янв.26',
      'фев.26',
      'мар.26',
      'апр.26',
    ],
    trendFrom: '2025-08-12T00:00:00.000Z',
  },
  {
    period: 'quarter',
    labels: [
      'Q3.24',
      'Q4.24',
      'Q1.25',
      'Q2.25',
      'Q3.25',
      'Q4.25',
      'Q1.26',
      'Q2.26',
    ],
    trendFrom: '2024-06-11T00:00:00.000Z',
  },
  {
    period: 'year',
    labels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
    trendFrom: '2018-12-12T00:00:00.000Z',
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
    store: {
      findMany: jest.fn(),
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
    guestSession: {
      findMany: jest.fn(),
    },
    guestTransaction: {
      findMany: jest.fn(),
    },
    guestOperationLog: {
      findMany: jest.fn(),
    },
    guestWorkingShift: {
      findMany: jest.fn(),
    },
    businessSnapshotRun: {
      findFirst: jest.fn(),
    },
    integrationSyncJob: {
      findFirst: jest.fn(),
    },
  };
}

describe('DashboardService', () => {
  let prisma: DashboardPrismaMock;
  let freshStoreScope: FreshStoreScopeMock;
  let service: DashboardService;
  const user = {
    id: 'user-1',
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
    isPlatformAdmin: false,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  } as AuthenticatedUser;

  beforeEach(() => {
    prisma = createPrismaMock();
    freshStoreScope = {
      resolveRequestedStoreIds: jest
        .fn()
        .mockImplementation(
          (_user: AuthenticatedUser, requested?: readonly string[]) =>
            Promise.resolve({
              userId: 'user-1',
              tenantId: 'tenant-demo',
              tenantSlug: 'demo',
              mode: 'NETWORK',
              allowedStoreIds: [],
              effectiveStoreIds: requested ?? null,
            }),
        ),
    };
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Demo Cyber Club',
    });
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        name: 'Club A',
        externalClubId: '1',
      },
    ]);
    prisma.guestSession.findMany.mockResolvedValue([]);
    prisma.guestTransaction.findMany.mockResolvedValue([]);
    prisma.guestOperationLog.findMany.mockResolvedValue([]);
    prisma.guestWorkingShift.findMany.mockResolvedValue([]);
    prisma.businessSnapshotRun.findFirst.mockResolvedValue(null);
    prisma.integrationSyncJob.findFirst.mockResolvedValue(null);
    service = new DashboardService(
      prisma as unknown as PrismaService,
      freshStoreScope as unknown as FreshStoreScopeService,
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
    prisma.product.count.mockResolvedValueOnce(2);
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
        sourcePayloadHash: bindReceiptIdentityToSourceHash(
          'receipt-1',
          'a'.repeat(64),
        ),
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
        sourcePayloadHash: bindReceiptIdentityToSourceHash(
          'receipt-1',
          'b'.repeat(64),
        ),
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
        snapshotDate: new Date(),
        quantity: new Prisma.Decimal(1),
      },
      {
        storeId: 'store-1',
        productId: 'product-2',
        snapshotDate: new Date(),
        quantity: new Prisma.Decimal(20),
      },
    ]);
    prisma.clubRevenueFact.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        revenueDate: new Date(),
        totalRevenue: new Prisma.Decimal(1000),
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

    const summary = await service.getSummary(user, { period: 'day' });

    expect(summary).toMatchObject({
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
      tenantName: 'Demo Cyber Club',
      periodLabel: 'Текущие сутки',
      skuGrouping: 'network',
      selectedStoreIds: [],
      totalSku: 2,
      activeSku: 2,
      categoriesCount: 3,
      suppliersCount: 4,
      averageMarginPercent: 50,
      averageFacing: 3,
      totalRevenue: 1240,
      clubRevenue: 1240,
      grossProfit: 620,
      adjustedGrossProfit: 550,
      marginPercent: 50,
      adjustedMarginPercent: 44.4,
      soldQuantity: 12,
      writeOffAmount: 50,
      returnAmount: 20,
      stockQuantity: 21,
      outOfStockRiskCount: 1,
      recommendedOrderQuantity: 6,
    });
    expect(summary.periodFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.periodTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.assortmentGrowth).toMatchObject({
      visits: { value: 0 },
      saleOperations: { value: 2, per100Visits: null },
      averageSaleOperationAmount: { value: 620 },
      drivers: {
        identifiedActiveGuests: 0,
        guestIdentificationCoveragePercent: null,
        sessionsPerIdentifiedGuest: null,
        stockTrackedSkuCount: 2,
        stockCoveragePercent: 100,
        availabilityPercent: 50,
        itemsPerSaleOperation: 6,
        averageItemPrice: 103.3,
        costCoveragePercent: 100,
        productMarginPercent: 50,
      },
      revenue: { value: 1240 },
      methodology: {
        visitUnit: 'GAME_SESSION',
        saleUnit: 'PRODUCT_SALE_OPERATION',
        saleUnitIsExact: true,
        receiptMetrics: {
          state: 'READY',
          requiredField: 'RECEIPT_OR_ORDER_ID',
          coveragePercent: 100,
          coveredRevenuePercent: 100,
          purchaseCount: 1,
          averageCheck: 1240,
          itemsPerCheck: 12,
          topBasketPair: {
            firstProductName: 'Chips',
            secondProductName: 'Energy Drink',
            receiptsCount: 1,
          },
        },
      },
    });
    expect(summary.assortmentGrowth.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'visits', state: 'MISSING' }),
        expect.objectContaining({ key: 'sales', state: 'FRESH' }),
      ]),
    );
    expect(summary.assortmentGrowth.actions[0]).toMatchObject({
      key: 'restore-data-sources',
      title: 'Восстановить загрузку визитов',
      href: '/sync',
    });
    expect(
      summary.assortmentGrowth.calculations.find(
        (calculation) => calculation.key === 'saleOperationsPer100Visits',
      ),
    ).toMatchObject({ state: 'SOURCE_CONFLICT' });
    expect(summary.assortmentGrowth.calculations).toHaveLength(23);
    expect(summary.salesTrend).toHaveLength(8);
    expect(summary.salesTrend.some((segment) => segment.clubRevenue > 0)).toBe(
      true,
    );
    expect(summary.topSkuByRevenue).toEqual([
      {
        productId: 'network:energy drink',
        article: 'DRK-001',
        name: 'Energy Drink',
        isCanonical: false,
        canonicalProductName: null,
        storeId: null,
        storeName: null,
        revenue: 1000,
        grossProfit: 500,
        soldQuantity: 10,
      },
      {
        productId: 'network:chips',
        article: 'SNK-001',
        name: 'Chips',
        isCanonical: false,
        canonicalProductName: null,
        storeId: null,
        storeName: null,
        revenue: 240,
        grossProfit: 120,
        soldQuantity: 2,
      },
    ]);

    expect(freshStoreScope.resolveRequestedStoreIds).toHaveBeenCalledWith(
      user,
      undefined,
    );
    expect(prisma.product.count).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-demo' },
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

    const summary = await service.getSummary(user);

    expect(summary).toMatchObject({
      averageMarginPercent: 0,
      averageFacing: 0,
      totalRevenue: 0,
      topSkuByRevenue: [],
    });
    expect(summary.outOfStockRiskCount).toBe(0);
    expect(
      summary.assortmentGrowth.averageSaleOperationAmount.value,
    ).toBeNull();
    expect(summary.assortmentGrowth.drivers.availabilityPercent).toBeNull();
    expect(
      summary.assortmentGrowth.calculations.find(
        (metric) => metric.key === 'averageSaleOperationAmount',
      ),
    ).toMatchObject({ state: 'NO_DATA' });
    expect(summary.salesTrend).toHaveLength(8);
  });

  it('counts identified guests once across clubs and reports identity coverage', async () => {
    mockEmptyDashboardData();
    prisma.store.findMany.mockResolvedValue([
      { id: 'store-1', name: 'Club A', externalClubId: '1' },
      { id: 'store-2', name: 'Club B', externalClubId: '2' },
    ]);
    prisma.guestSession.findMany
      .mockResolvedValueOnce([
        {
          id: 'session-1',
          storeId: 'store-1',
          externalClubId: '1',
          externalSessionId: 'external-session-1',
          guestId: 'guest-1',
          externalGuestId: '101',
          startedAt: new Date(),
        },
        {
          id: 'session-2',
          storeId: 'store-2',
          externalClubId: '2',
          externalSessionId: 'external-session-2',
          guestId: 'guest-1',
          externalGuestId: '101',
          startedAt: new Date(),
        },
        {
          id: 'session-3',
          storeId: 'store-2',
          externalClubId: '2',
          externalSessionId: 'external-session-3',
          guestId: null,
          externalGuestId: null,
          startedAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await service.getSummary(user);

    expect(summary.assortmentGrowth.visits.value).toBe(3);
    expect(summary.assortmentGrowth.drivers).toMatchObject({
      identifiedActiveGuests: 1,
      guestIdentificationCoveragePercent: 66.7,
      sessionsPerIdentifiedGuest: 2,
    });
    expect(
      summary.assortmentGrowth.calculations.find(
        (metric) => metric.key === 'identifiedActiveGuests',
      ),
    ).toMatchObject({ state: 'PARTIAL_COVERAGE' });
  });

  it('does not publish margin when sale cost coverage is incomplete', async () => {
    mockEmptyDashboardData();
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'A',
        name: 'A',
        purchasePrice: new Prisma.Decimal(0),
        salePrice: new Prisma.Decimal(100),
        facing: 1,
        categoryId: null,
        category: null,
        supplier: null,
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValueOnce([
      {
        productId: 'product-1',
        storeId: 'store-1',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(1),
        revenue: new Prisma.Decimal(100),
        cost: new Prisma.Decimal(0),
        product: {
          id: 'product-1',
          article: 'A',
          name: 'A',
          categoryId: null,
          category: null,
          canonicalProduct: null,
        },
        store: { id: 'store-1', name: 'Club A' },
      },
    ]);

    const summary = await service.getSummary(user);

    expect(summary.assortmentGrowth.drivers).toMatchObject({
      costCoveragePercent: 0,
      productMarginPercent: null,
    });
    expect(
      summary.assortmentGrowth.calculations.find(
        (metric) => metric.key === 'productMarginPercent',
      ),
    ).toMatchObject({
      state: 'NO_DATA',
      note: 'Положительная себестоимость есть у 0% товарных операций.',
    });
  });

  it('uses the fresh club-owner allow-list and never reads network snapshots', async () => {
    mockEmptyDashboardData();
    freshStoreScope.resolveRequestedStoreIds.mockResolvedValueOnce({
      userId: 'user-1',
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
      mode: 'STORES',
      allowedStoreIds: ['store-1'],
      effectiveStoreIds: ['store-1'],
    });

    const summary = await service.getSummary(user, { period: 'day' });

    expect(summary.selectedStoreIds).toEqual(['store-1']);
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-demo', id: { in: ['store-1'] } },
      }),
    );
    for (const [query] of prisma.salesFact.findMany.mock
      .calls as SalesFactFindManyCall[]) {
      expect(query.where.storeId).toEqual({ in: ['store-1'] });
    }
    expect(prisma.businessSnapshotRun.findFirst).not.toHaveBeenCalled();
  });

  it('applies selected categories to every assortment fact query', async () => {
    mockEmptyDashboardData();

    const summary = await service.getSummary(user, {
      period: 'full-day',
      categoryIds: ['category-drinks', 'category-snacks'],
    });

    expect(summary.selectedCategoryIds).toEqual([
      'category-drinks',
      'category-snacks',
    ]);
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-demo',
        categoryId: { in: ['category-drinks', 'category-snacks'] },
      },
    });
    for (const [query] of prisma.salesFact.findMany.mock
      .calls as SalesFactFindManyCall[]) {
      expect(query.where.product).toEqual({
        categoryId: { in: ['category-drinks', 'category-snacks'] },
      });
    }
  });

  it('compares the latest full day with the previous 30 full-day average', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));

    try {
      const averageFacts = Array.from({ length: 30 }, (_, index) => ({
        saleDate: new Date(Date.UTC(2026, 4, 9 + index, 12)),
        revenue: new Prisma.Decimal(100),
      }));

      mockEmptyDashboardData();
      prisma.salesFact.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            saleDate: new Date('2026-06-08T12:00:00.000Z'),
            revenue: new Prisma.Decimal(150),
          },
          ...averageFacts,
        ])
        .mockResolvedValueOnce([]);

      const summary = await service.getSummary(user, {
        period: 'full-day',
      });

      expect(summary.fullDayRevenueDate).toBe('2026-06-08');
      expect(summary.fullDayRevenue).toBe(150);
      expect(summary.averageDailyRevenue).toBe(100);
      expect(summary.fullDayRevenueToAveragePercent).toBe(50);
    } finally {
      jest.useRealTimers();
    }
  });

  it('compares adjusted gross profit with the previous comparable period', async () => {
    mockEmptyDashboardData();
    prisma.salesFact.findMany
      .mockResolvedValueOnce([
        {
          productId: 'product-1',
          saleDate: new Date(),
          quantity: new Prisma.Decimal(1),
          revenue: new Prisma.Decimal(1000),
          cost: new Prisma.Decimal(400),
          product: {
            id: 'product-1',
            article: 'DRK-001',
            name: 'Energy Drink',
            canonicalProduct: null,
            categoryId: null,
            category: null,
          },
          store: {
            id: 'store-1',
            name: 'Club A',
          },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          revenue: new Prisma.Decimal(800),
          cost: new Prisma.Decimal(500),
        },
      ]);
    prisma.stockMovement.findMany
      .mockResolvedValueOnce([
        {
          type: 'WRITEOFF',
          amount: new Prisma.Decimal(100),
        },
        {
          type: 'RETURN',
          amount: new Prisma.Decimal(50),
        },
      ])
      .mockResolvedValueOnce([
        {
          type: 'WRITEOFF',
          amount: new Prisma.Decimal(50),
        },
      ]);

    const summary = await service.getSummary(user, { period: 'day' });

    expect(summary.adjustedGrossProfit).toBe(450);
    expect(summary.previousAdjustedGrossProfit).toBe(250);
    expect(summary.adjustedGrossProfitToPreviousPercent).toBe(80);
  });

  it('uses balance spend as store revenue and adds unallocated top-ups to network revenue', async () => {
    mockEmptyDashboardData();
    prisma.guestOperationLog.findMany.mockResolvedValue([
      {
        storeId: null,
        externalClubId: '0',
        type: 'plus',
        operationSource: 'Приложение',
        operationForm: null,
        amount: new Prisma.Decimal(50_000),
      },
      {
        storeId: 'store-1',
        externalClubId: '1',
        type: 'Списание',
        operationSource: null,
        operationForm: null,
        amount: new Prisma.Decimal(2_000),
      },
    ]);
    prisma.guestTransaction.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        externalClubId: '1',
        guestId: null,
        externalGuestId: null,
        type: 'plus',
        amount: new Prisma.Decimal(100_000),
      },
      {
        storeId: 'store-1',
        externalClubId: '1',
        guestId: null,
        externalGuestId: null,
        type: null,
        amount: new Prisma.Decimal(-3_000),
      },
      {
        storeId: 'store-1',
        externalClubId: '1',
        guestId: null,
        externalGuestId: null,
        type: '1',
        amount: new Prisma.Decimal(4_200),
      },
    ]);

    const summary = await service.getSummary(user);

    expect(summary.totalRevenue).toBe(0);
    expect(summary.clubRevenue).toBe(57200);
    expect(summary.unallocatedTopupRevenue).toBe(50000);
    expect(summary.revenueBreakdown).toMatchObject({
      networkRevenue: 57200,
      allocatedClubRevenue: 7200,
      balanceOperationRevenue: 2000,
      transactionSpendRevenue: 7200,
      unallocatedTopupRevenue: 50000,
      primarySource: 'TRANSACTIONS',
    });
    expect(summary.revenueSnapshot.status).toBe('MISSING');
    expect(summary.revenueDataQuality.level).toBe('MEDIUM');
    expect(summary.storeRevenueBreakdown[0]).toMatchObject({
      storeId: 'store-1',
      totalRevenue: 7200,
      totalRevenueSource: 'TRANSACTIONS',
      productRevenue: 0,
    });
  });

  it('calculates the club opportunity only from confirmed total-revenue denominators', async () => {
    mockEmptyDashboardData();
    prisma.store.findMany.mockResolvedValue([
      { id: 'store-1', name: 'Club A', externalClubId: '1' },
      { id: 'store-2', name: 'Club B', externalClubId: '2' },
      { id: 'store-3', name: 'Club C', externalClubId: '3' },
    ]);
    prisma.salesFact.findMany.mockResolvedValueOnce([
      {
        productId: 'product-1',
        storeId: 'store-1',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(1),
        revenue: new Prisma.Decimal(100),
        cost: new Prisma.Decimal(50),
        product: {
          id: 'product-1',
          article: 'A',
          name: 'A',
          categoryId: null,
          category: null,
          canonicalProduct: null,
        },
        store: { id: 'store-1', name: 'Club A' },
      },
      {
        productId: 'product-2',
        storeId: 'store-2',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(1),
        revenue: new Prisma.Decimal(400),
        cost: new Prisma.Decimal(200),
        product: {
          id: 'product-2',
          article: 'B',
          name: 'B',
          categoryId: null,
          category: null,
          canonicalProduct: null,
        },
        store: { id: 'store-2', name: 'Club B' },
      },
      {
        productId: 'product-3',
        storeId: 'store-3',
        saleDate: new Date(),
        quantity: new Prisma.Decimal(1),
        revenue: new Prisma.Decimal(600),
        cost: new Prisma.Decimal(300),
        product: {
          id: 'product-3',
          article: 'C',
          name: 'C',
          categoryId: null,
          category: null,
          canonicalProduct: null,
        },
        store: { id: 'store-3', name: 'Club C' },
      },
    ]);
    prisma.guestTransaction.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        externalClubId: '1',
        guestId: null,
        externalGuestId: null,
        type: '1',
        amount: new Prisma.Decimal(1000),
      },
      {
        storeId: 'store-2',
        externalClubId: '2',
        guestId: null,
        externalGuestId: null,
        type: '1',
        amount: new Prisma.Decimal(1000),
      },
      {
        storeId: 'store-3',
        externalClubId: '3',
        guestId: null,
        externalGuestId: null,
        type: '1',
        amount: new Prisma.Decimal(1000),
      },
    ]);

    const summary = await service.getSummary(user);

    expect(summary.assortmentGrowth.opportunity).toEqual({
      state: 'READY',
      storeId: 'store-1',
      storeName: 'Club A',
      currentSharePercent: 10,
      benchmarkSharePercent: 40,
      gapPoints: 30,
      revenueOpportunity: 300,
      reason: null,
    });
  });

  it('returns revenue diagnostics scenarios and source inclusion rules', async () => {
    mockEmptyDashboardData();
    prisma.salesFact.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        revenue: new Prisma.Decimal(1_000),
        guestId: 'guest-1',
        externalGuestId: null,
      },
    ]);
    prisma.guestOperationLog.findMany.mockResolvedValue([
      {
        storeId: null,
        externalClubId: '0',
        type: 'plus',
        operationName: 'mobile top-up',
        operationSource: 'mobile',
        operationForm: 'app',
        amount: new Prisma.Decimal(10_000),
      },
      {
        storeId: 'store-1',
        externalClubId: '1',
        type: 'plus',
        operationName: 'desk top-up',
        operationSource: 'cash desk',
        operationForm: 'cash',
        amount: new Prisma.Decimal(5_000),
      },
      {
        storeId: 'store-1',
        externalClubId: '1',
        type: 'spend',
        operationName: 'session spend',
        operationSource: 'club',
        operationForm: 'balance',
        amount: new Prisma.Decimal(-4_000),
      },
    ]);
    prisma.guestTransaction.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        externalClubId: '1',
        guestId: 'guest-1',
        externalGuestId: null,
        type: '1',
        amount: new Prisma.Decimal(3_000),
      },
    ]);
    prisma.guestWorkingShift.findMany.mockResolvedValue([
      {
        storeId: 'store-1',
        externalClubId: '1',
        cashAmount: new Prisma.Decimal(1_500),
        cashlessAmount: new Prisma.Decimal(700),
        mobilePay: new Prisma.Decimal(300),
        refundsCash: new Prisma.Decimal(100),
        refundsCashless: new Prisma.Decimal(0),
      },
    ]);

    const diagnostics = await service.getRevenueDiagnostics(user, {
      period: 'full-day',
    });

    expect(diagnostics.totals.productRevenue).toBe(1000);
    expect(diagnostics.totals.balanceSpendRevenueCandidate).toBe(4000);
    expect(diagnostics.unallocatedTopups.amount).toBe(10000);
    expect(diagnostics.revenueScenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'dashboard-network-revenue',
          amount: 14000,
          recommendation: 'PRIMARY',
        }),
        expect.objectContaining({
          key: 'allocated-club-revenue',
          amount: 4000,
          recommendation: 'PRIMARY',
        }),
        expect.objectContaining({
          key: 'balance-topup-flow',
          amount: 15000,
          recommendation: 'EXCLUDED',
        }),
      ]),
    );
    expect(diagnostics.sourceMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'unallocated-topups',
          amount: 10000,
          includedInNetworkRevenue: true,
          includedInClubRevenue: false,
        }),
        expect.objectContaining({
          key: 'balances',
          amount: null,
          includedInNetworkRevenue: false,
          role: 'EXCLUDED',
        }),
      ]),
    );
  });

  it.each(calendarTrendCases)(
    'builds one trend bar per selected $period period',
    async ({ period, labels, trendFrom }) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));

      try {
        mockEmptyDashboardData();

        const summary = await service.getSummary(user, { period });

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
      prisma.product.count.mockResolvedValueOnce(1);
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
          storeId: 'store-1',
          revenueDate: new Date('2026-04-29T00:00:00.000Z'),
          totalRevenue: new Prisma.Decimal(1000),
        },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([]);

      const summary = await service.getSummary(user, { period: 'day' });

      expect(summary.totalRevenue).toBe(300);
      expect(summary.soldQuantity).toBe(3);
      expect(summary.outOfStockRiskCount).toBe(0);
      expect(summary.assortmentGrowth.drivers).toMatchObject({
        stockTrackedSkuCount: 0,
        availabilityPercent: null,
      });
      expect(summary.periodFrom).toBe('2026-04-29');
      expect(summary.periodTo).toBe('2026-04-29');
      expect(summary.salesTrend[7]).toMatchObject({
        label: '29.04',
        revenue: 300,
        clubRevenue: 300,
        revenueSharePercent: 100,
        soldQuantity: 3,
        noSalesSkuCount: 0,
        outOfStockSkuCount: 0,
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
        '2026-04-02T00:00:00.000Z',
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
