import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

type ProductsPrismaMock = {
  product: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  inventorySnapshot: {
    findMany: jest.Mock;
  };
  salesFact: {
    findMany: jest.Mock;
  };
  category: {
    findFirst: jest.Mock;
  };
  supplier: {
    findFirst: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type ProductInventoryQuery = {
  where: {
    tenantId: string;
    snapshotDate: {
      lte: Date;
    };
  };
  orderBy: {
    snapshotDate: 'desc';
  };
};

type ProductSalesFactQuery = {
  where: {
    tenantId: string;
    isCanceled: false;
    saleDate: {
      gte: Date;
      lte: Date;
    };
  };
  distinct: ['productId'];
};

function createPrismaMock(): ProductsPrismaMock {
  return {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventorySnapshot: {
      findMany: jest.fn(),
    },
    salesFact: {
      findMany: jest.fn(),
    },
    category: {
      findFirst: jest.fn(),
    },
    supplier: {
      findFirst: jest.fn(),
    },
  };
}

describe('ProductsService', () => {
  let prisma: ProductsPrismaMock;
  let tenantContext: TenantContextMock;
  let service: ProductsService;
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: null,
    role: UserRole.OWNER,
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
      }),
    };
    service = new ProductsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
  });

  it('filters product list by resolved tenant and active status', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.salesFact.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(tenantContext.resolve).toHaveBeenCalledWith(undefined);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-demo',
          isActive: true,
        },
      }),
    );
    const [inventoryQuery] = prisma.inventorySnapshot.findMany.mock
      .calls[0] as [ProductInventoryQuery];
    expect(inventoryQuery.where.tenantId).toBe('tenant-demo');
    expect(inventoryQuery.where.snapshotDate.lte).toBeInstanceOf(Date);
    expect(inventoryQuery.orderBy).toEqual({ snapshotDate: 'desc' });

    const [salesQuery] = prisma.salesFact.findMany.mock.calls[0] as [
      ProductSalesFactQuery,
    ];
    expect(salesQuery.where.tenantId).toBe('tenant-demo');
    expect(salesQuery.where.isCanceled).toBe(false);
    expect(salesQuery.where.saleDate.gte).toBeInstanceOf(Date);
    expect(salesQuery.where.saleDate.lte).toBeInstanceOf(Date);
    expect(salesQuery.distinct).toEqual(['productId']);
  });

  it('marks operational active products by current stock or recent sales', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'stocked-product' },
      { id: 'recently-sold-product' },
      { id: 'stale-product' },
    ]);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        productId: 'stocked-product',
        storeId: 'store-1',
        snapshotDate: new Date(),
        quantity: new Prisma.Decimal(3),
        store: { name: 'Club A' },
      },
      {
        productId: 'stale-product',
        storeId: 'store-1',
        snapshotDate: new Date(),
        quantity: new Prisma.Decimal(0),
        store: { name: 'Club A' },
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      { productId: 'recently-sold-product' },
    ]);

    const products = await service.findAll();

    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'stocked-product',
          isOperationalActive: true,
        }),
        expect.objectContaining({
          id: 'recently-sold-product',
          isOperationalActive: true,
        }),
        expect.objectContaining({
          id: 'stale-product',
          isOperationalActive: false,
        }),
      ]),
    );
  });

  it('filters product details by id and resolved tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await service.findById('product-1');

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'product-1',
          tenantId: 'tenant-demo',
        },
      }),
    );
  });

  it('creates product in resolved tenant with validated relations', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.supplier.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.product.create.mockResolvedValue({ id: 'product-1' });

    await service.create(
      {
        article: '  BAR-001  ',
        name: '  Батончик  ',
        purchasePrice: '50.00',
        salePrice: '90.00',
        facing: 2,
        categoryId: 'category-1',
        supplierId: 'supplier-1',
      },
      user,
    );

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'category-1', tenantId: 'tenant-demo' },
      select: { id: true },
    });
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-1', tenantId: 'tenant-demo' },
      select: { id: true },
    });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-demo',
          article: 'BAR-001',
          name: 'Батончик',
          purchasePrice: new Prisma.Decimal('50.00'),
          salePrice: new Prisma.Decimal('90.00'),
          facing: 2,
          categoryId: 'category-1',
          supplierId: 'supplier-1',
        },
      }),
    );
  });

  it('archives product only after resolving it inside tenant', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'product-1',
      article: 'BAR-001',
    });
    prisma.product.update.mockResolvedValue({
      id: 'product-1',
      isActive: false,
    });

    await service.archive('product-1', user);

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'product-1', tenantId: 'tenant-demo' },
    });
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: { isActive: false },
      }),
    );
  });
});
