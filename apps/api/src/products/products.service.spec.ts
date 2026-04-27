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

function createPrismaMock(): ProductsPrismaMock {
  return {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
