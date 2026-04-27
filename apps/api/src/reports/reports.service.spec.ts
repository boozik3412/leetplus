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
});
