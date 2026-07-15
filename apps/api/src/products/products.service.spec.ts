import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

type ProductsPrismaMock = {
  product: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
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

type ProductCatalogFindManyQuery = {
  skip: number;
  take: number;
  orderBy: Array<Record<string, unknown>>;
  where: {
    tenantId: string;
    isActive: boolean;
    name: { contains: string; mode: string };
    inventorySnapshots: {
      some: {
        storeId: { in: string[] };
      };
    };
    categoryId?: null;
  };
};

function createPrismaMock(): ProductsPrismaMock {
  return {
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
      {
        id: 'stocked-product',
        purchasePrice: new Prisma.Decimal(100),
        salePrice: new Prisma.Decimal(150),
      },
      {
        id: 'recently-sold-product',
        purchasePrice: new Prisma.Decimal(0),
        salePrice: new Prisma.Decimal(0),
      },
      {
        id: 'stale-product',
        purchasePrice: new Prisma.Decimal(80),
        salePrice: new Prisma.Decimal(120),
      },
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
      {
        productId: 'recently-sold-product',
        quantity: new Prisma.Decimal(2),
        revenue: new Prisma.Decimal(200),
        cost: new Prisma.Decimal(120),
      },
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

  it('builds the product summary from latest stock per club and product', async () => {
    prisma.product.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(7);
    prisma.inventorySnapshot.findMany.mockResolvedValue([
      {
        productId: 'stocked-product',
        quantity: new Prisma.Decimal(2),
      },
      {
        productId: 'empty-product',
        quantity: new Prisma.Decimal(0),
      },
    ]);
    prisma.salesFact.findMany.mockResolvedValue([
      { productId: 'recently-sold-product' },
    ]);

    await expect(service.getSummary(user)).resolves.toEqual({
      totalSku: 12,
      operationalActiveSku: 2,
      categorizedSku: 9,
      suppliedSku: 7,
    });

    expect(prisma.inventorySnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['storeId', 'productId'],
        orderBy: [
          { storeId: 'asc' },
          { productId: 'asc' },
          { snapshotDate: 'desc' },
        ],
      }),
    );
  });

  it('paginates the catalog in the database and only loads its current page', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'BAR-001',
        name: 'Батончик',
        purchasePrice: new Prisma.Decimal(50),
        salePrice: new Prisma.Decimal(90),
        category: null,
        supplier: null,
      },
    ]);
    prisma.product.count.mockResolvedValue(151);
    prisma.inventorySnapshot.findMany.mockResolvedValue([]);
    prisma.salesFact.findMany.mockResolvedValue([]);

    const catalog = await service.getCatalog(
      {
        page: '2',
        pageSize: '50',
        name: 'батон',
        storeId: ['store-1', 'store-2'],
        sort: 'salePrice',
        direction: 'desc',
      },
      user,
    );

    const [catalogQuery] = prisma.product.findMany.mock.calls[0] as [
      ProductCatalogFindManyQuery,
    ];
    expect(catalogQuery.skip).toBe(50);
    expect(catalogQuery.take).toBe(50);
    expect(catalogQuery.orderBy).toEqual([
      { salePrice: 'desc' },
      { name: 'asc' },
      { id: 'asc' },
    ]);
    expect(catalogQuery.where).toMatchObject({
      tenantId: 'tenant-demo',
      isActive: true,
      name: { contains: 'батон', mode: 'insensitive' },
      inventorySnapshots: {
        some: {
          storeId: { in: ['store-1', 'store-2'] },
        },
      },
    });
    expect(catalog).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        total: 151,
        totalPages: 4,
        items: [
          expect.objectContaining({
            id: 'product-1',
            unitCost: 50,
            storeIds: [],
          }),
        ],
      }),
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

  it('limits the category triage queue to uncategorized active products', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(3);

    await service.getCatalog({ categoryStatus: 'unassigned' }, user);

    const [catalogQuery] = prisma.product.findMany.mock.calls[0] as [
      ProductCatalogFindManyQuery,
    ];
    expect(catalogQuery.where.tenantId).toBe('tenant-demo');
    expect(catalogQuery.where.isActive).toBe(true);
    expect(catalogQuery.where.categoryId).toBeNull();
  });

  it('assigns a LeetPlus category only to the selected uncategorized products', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.product.count.mockResolvedValue(2);
    prisma.product.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.assignCategoryToUncategorizedProducts(
        {
          productIds: ['product-1', 'product-2', 'product-1'],
          categoryId: 'category-1',
        },
        user,
      ),
    ).resolves.toEqual({ updated: 2 });

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'category-1', tenantId: 'tenant-demo' },
      select: { id: true },
    });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-demo',
        id: { in: ['product-1', 'product-2'] },
        isActive: true,
        categoryId: null,
      },
      data: { categoryId: 'category-1' },
    });
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
          assortmentRole: 'OPTIONAL',
          isMandatory: false,
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
