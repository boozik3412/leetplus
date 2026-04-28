import type { AuthenticatedUser } from '../auth/auth.types';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';
import type {
  AssortmentReport,
  OperationalReport,
  ReplenishmentReport,
  SkuPerformanceReport,
  SuppliersPerformanceReport,
} from './reports.service';

type ReportsServiceMock = {
  getAssortmentReport: jest.Mock;
  getOperationalReport: jest.Mock;
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
  marginPercent: 30,
  soldQuantity: 10,
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
      revenueSharePercent: 100,
      profitSharePercent: 100,
    },
    {
      group: 'B',
      productsCount: 0,
      assortmentSharePercent: 0,
      revenueSharePercent: 0,
      profitSharePercent: 0,
    },
    {
      group: 'C',
      productsCount: 0,
      assortmentSharePercent: 0,
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
      article: 'DRK-001',
      name: 'Cola',
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
  ],
};

describe('ReportsExportService', () => {
  let reportsService: ReportsServiceMock;
  let service: ReportsExportService;

  beforeEach(() => {
    reportsService = {
      getAssortmentReport: jest.fn().mockResolvedValue(assortmentReport),
      getOperationalReport: jest.fn().mockResolvedValue(operationalReport),
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
    expect(content).toContain('Operations summary');
    expect(content).toContain('ABC by revenue');
    expect(content).toContain('Top SKU by revenue');
    expect(content).toContain('Replenishment');
    expect(content).toContain('LOW_STOCK;DRK-001;Cola');
    expect(content).toContain('Top suppliers');
    expect(content).toContain('Supplier A;2;10;1000');
    expect(content).toContain('Assortment summary');
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
});
