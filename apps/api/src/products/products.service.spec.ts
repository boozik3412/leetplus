import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type ProductsPrismaMock = {
  product: {
    findMany: jest.Mock;
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
    },
  };
}

describe('ProductsService', () => {
  let prisma: ProductsPrismaMock;
  let tenantContext: TenantContextMock;
  let service: ProductsService;

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
});
