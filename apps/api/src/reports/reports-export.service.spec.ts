import type { AuthenticatedUser } from '../auth/auth.types';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';
import type {
  AssortmentReport,
  OperationalReport,
  ReplenishmentReport,
  SalesDetailReport,
  SkuPerformanceReport,
  SuppliersPerformanceReport,
} from './reports.service';

type ReportsServiceMock = {
  getAssortmentReport: jest.Mock;
  getOperationalReport: jest.Mock;
  getSalesDetailReport: jest.Mock;
  getSkuPerformanceReport: jest.Mock;
  getReplenishmentReport: jest.Mock;
  getSuppliersPerformanceReport: jest.Mock;
};

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
} as AuthenticatedUser;

const assortmentReport: AssortmentReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  totalSku: 2,
  activeSku: 1,
  inactiveSku: 1,
  averageMarginPercent: 30,
  averageMarkupPercent: 42.9,
  categoryBreakdown: [
    {
      id: 'category-1',
      name: 'Напитки',
      productsCount: 1,
      averageMarginPercent: 30,
      averageSalePrice: 100,
      totalFacing: 2,
    },
  ],
  supplierBreakdown: [],
  lowMarginProducts: [
    {
      id: 'product-1',
      article: 'DRK-001',
      name: 'Cola',
      marginPercent: 15,
      purchasePrice: '85',
      salePrice: '100',
      categoryName: 'Напитки',
      supplierName: null,
    },
  ],
};

const operationalReport: OperationalReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  from: '2026-04-01',
  to: '2026-04-30',
  storeId: null,
  totalRevenue: 1000,
  totalCost: 700,
  grossProfit: 300,
  adjustedGrossProfit: 250,
  marginPercent: 30,
  adjustedMarginPercent: 25,
  soldQuantity: 10,
  writeOffQuantity: 1,
  writeOffAmount: 50,
  returnQuantity: 0,
  returnAmount: 0,
  averageDailyRevenue: 33.3,
  stockQuantity: 5,
  stockDays: 15,
  recommendations: [
    {
      id: 'margin:product-1',
      kind: 'LOW_MARGIN',
      severity: 'LOW',
      title: 'Пересмотреть маржу: Cola',
      description: 'Маржа продаж 15%.',
      action: 'Проверить цену.',
      productId: 'product-1',
      article: 'DRK-001',
      productName: 'Cola',
      metricLabel: 'Маржа',
      metricValue: '15%',
    },
  ],
  outOfStockRiskProducts: [],
  productsWithoutSales: [],
};

const skuPerformanceReport: SkuPerformanceReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  from: '2026-04-01',
  to: '2026-04-30',
  storeId: null,
  rows: [],
  abcByRevenue: [
    {
      group: 'A',
      productsCount: 1,
      assortmentSharePercent: 100,
      revenue: 1000,
      grossProfit: 300,
      revenueSharePercent: 100,
      profitSharePercent: 100,
    },
    {
      group: 'B',
      productsCount: 0,
      assortmentSharePercent: 0,
      revenue: 0,
      grossProfit: 0,
      revenueSharePercent: 0,
      profitSharePercent: 0,
    },
    {
      group: 'C',
      productsCount: 0,
      assortmentSharePercent: 0,
      revenue: 0,
      grossProfit: 0,
      revenueSharePercent: 0,
      profitSharePercent: 0,
    },
  ],
  abcByProfit: [],
  topByRevenue: [
    {
      productId: 'product-1',
      article: 'DRK-001',
      name: 'Cola',
      isCanonical: false,
      canonicalProductName: null,
      categoryName: 'Напитки',
      supplierName: null,
      facing: 2,
      soldQuantity: 10,
      revenue: 1000,
      cost: 700,
      grossProfit: 300,
      marginPercent: 30,
      revenueSharePercent: 100,
      profitSharePercent: 100,
      salesPerFacing: 5,
      profitPerFacing: 150,
      abcRevenueGroup: 'A',
      abcProfitGroup: 'A',
    },
  ],
  topByProfit: [],
  topByQuantity: [],
  topBySalesPerFacing: [],
  topByProfitPerFacing: [],
};

const salesDetailReport: SalesDetailReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  from: '2026-04-01',
  to: '2026-04-30',
  storeId: null,
  rows: [
    {
      id: 'sale-1',
      saleDate: '2026-04-10T12:00:00.000Z',
      productId: 'product-1',
      article: 'DRK-001',
      productName: 'Cola',
      productNameAtSale: null,
      storeId: 'store-1',
      storeName: 'Club A',
      storeNameAtSale: null,
      categoryName: 'Напитки',
      supplierName: 'Supplier A',
      quantity: 2,
      revenue: 200,
      cost: 140,
      unitSalePrice: 100,
      unitCost: 70,
      grossProfit: 60,
      marginPercent: 30,
      markupPercent: 42.9,
      purchasePrice: 70,
      salePrice: 100,
      facing: 2,
      source: 'LANGAME',
      externalProvider: 'LANGAME',
      externalDomain: 'club-a',
      externalSaleId: 'sale-ext-1',
      externalProductId: 'product-ext-1',
      externalClubId: 'club-ext-1',
      sourcePayloadHash: 'hash-1',
      isCanceled: false,
      canceledAt: null,
      createdAt: '2026-04-10T12:01:00.000Z',
      updatedAt: '2026-04-10T12:01:00.000Z',
    },
  ],
};

const suppliersPerformanceReport: SuppliersPerformanceReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  from: '2026-04-01',
  to: '2026-04-30',
  storeId: null,
  totalRevenue: 1000,
  totalGrossProfit: 300,
  rows: [
    {
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
      activeSku: 2,
      soldQuantity: 10,
      revenue: 1000,
      cost: 700,
      grossProfit: 300,
      marginPercent: 30,
      salesSharePercent: 100,
      profitSharePercent: 100,
      averageRevenuePerSku: 500,
      paymentDelayDays: 14,
      minOrderAmount: '5000',
      orderMultiplicity: 6,
    },
  ],
};

const replenishmentReport: ReplenishmentReport = {
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
  from: '2026-04-01',
  to: '2026-04-30',
  storeId: null,
  totalStockQuantity: 1,
  totalDailyNeed: 2,
  totalRecommendedOrder: 6,
  rows: [
    {
      productId: 'product-1',
      storeId: 'store-1',
      storeName: 'Club A',
      article: 'DRK-001',
      name: 'Cola',
      isCanonical: false,
      canonicalProductName: null,
      categoryName: 'Напитки',
      supplierName: 'Supplier A',
      stockQuantity: 1,
      soldQuantity: 90,
      averageDailySales: 3,
      stockDays: 0.3,
      dailyNeed: 2,
      recommendedOrder: 6,
      orderMultiplicity: 6,
      risk: 'LOW_STOCK',
    },
    {
      productId: 'product-2',
      storeId: 'store-2',
      storeName: 'Club B',
      article: 'SNK-002',
      name: 'Chips',
      isCanonical: false,
      canonicalProductName: null,
      categoryName: 'Снеки',
      supplierName: 'Supplier B',
      stockQuantity: 24,
      soldQuantity: 3,
      averageDailySales: 0.1,
      stockDays: 240,
      dailyNeed: 0,
      recommendedOrder: 0,
      orderMultiplicity: 12,
      risk: 'OK',
    },
  ],
};

describe('ReportsExportService', () => {
  let reportsService: ReportsServiceMock;
  let service: ReportsExportService;

  beforeEach(() => {
    reportsService = {
      getAssortmentReport: jest.fn().mockResolvedValue(assortmentReport),
      getOperationalReport: jest.fn().mockResolvedValue(operationalReport),
      getSalesDetailReport: jest.fn().mockResolvedValue(salesDetailReport),
      getSkuPerformanceReport: jest
        .fn()
        .mockResolvedValue(skuPerformanceReport),
      getReplenishmentReport: jest.fn().mockResolvedValue(replenishmentReport),
      getSuppliersPerformanceReport: jest
        .fn()
        .mockResolvedValue(suppliersPerformanceReport),
    };
    service = new ReportsExportService(
      reportsService as unknown as ReportsService,
    );
  });

  it('exports current reports as csv by default', async () => {
    const file = await service.exportReports(user, { from: '2026-04-01' });
    const content = file.buffer.toString('utf8');

    expect(file.fileName).toBe('leetplus-reports-2026-04-01-2026-04-30.csv');
    expect(file.contentType).toBe('text/csv; charset=utf-8');
    expect(content).toContain('Операционная сводка');
    expect(content).toContain('Общий отчет по продажам');
    expect(content).toContain('2026-04-10T12:00:00.000Z;Club A;');
    expect(content).toContain('Рекомендации');
    expect(content).toContain('Низкий;Низкая маржинальность;DRK-001;Cola');
    expect(content).toContain('ABC по выручке');
    expect(content).toContain('ТОП SKU по выручке');
    expect(content).toContain('Остатки и потребность');
    expect(content).toContain('Низкий остаток;DRK-001;Cola');
    expect(content).toContain('ТОП поставщиков');
    expect(content).toContain('Supplier A;2;10;1000');
    expect(content).toContain('Сводка ассортимента');
    expect(content).toContain('DRK-001;Cola');
    expect(reportsService.getOperationalReport).toHaveBeenCalledWith(user, {
      from: '2026-04-01',
    });
  });

  it('exports current reports as xlsx', async () => {
    const file = await service.exportReports(user, { format: 'xlsx' });

    expect(file.fileName).toBe('leetplus-reports-2026-04-01-2026-04-30.xlsx');
    expect(file.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(file.buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it('rejects unknown export format', async () => {
    await expect(
      service.exportReports(user, { format: 'pdf' }),
    ).rejects.toThrow('format must be csv or xlsx');
  });

  it('exports replenishment report with current table filters', async () => {
    const file = await service.exportReports(user, {
      report: 'replenishment',
      replenishmentRisk: 'Низкий остаток',
      replenishmentStoreName: 'Club A',
      replenishmentProductName: 'co',
      replenishmentSort: 'recommendedOrder',
      replenishmentSortDirection: 'desc',
    });
    const content = file.buffer.toString('utf8');

    expect(content).toContain('Низкий остаток;DRK-001;Cola;Club A;');
    expect(content).not.toContain('SNK-002');
  });
});
