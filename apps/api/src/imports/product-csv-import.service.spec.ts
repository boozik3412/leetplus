import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ProductCsvImportService } from './product-csv-import.service';

type PrismaMock = {
  category: {
    findMany: jest.Mock;
  };
  supplier: {
    findMany: jest.Mock;
  };
  product: {
    upsert: jest.Mock;
  };
  importJob: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type ImportJobCreateArgs = {
  data: {
    tenantId: string;
    sourceFileName: string | null;
    status: string;
    importedRows: number;
    errorsCount: number;
  };
};

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: null,
  role: UserRole.OWNER,
  tenantId: 'tenant-1',
  tenantSlug: 'club-a',
};

function createPrismaMock(): PrismaMock {
  return {
    category: {
      findMany: jest.fn(),
    },
    supplier: {
      findMany: jest.fn(),
    },
    product: {
      upsert: jest.fn((args: unknown) => args),
    },
    importJob: {
      create: jest.fn((args: unknown) => Promise.resolve(args)),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((operations: unknown[]) =>
      Promise.resolve(operations),
    ),
  };
}

function lastImportJobCreateData(prisma: PrismaMock) {
  const calls = prisma.importJob.create.mock.calls as unknown as [
    ImportJobCreateArgs,
  ][];
  const lastCall = calls.at(-1);

  if (!lastCall) {
    throw new Error('Expected import job create to be called');
  }

  return lastCall[0].data;
}

describe('ProductCsvImportService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let service: ProductCsvImportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      }),
    };
    prisma.category.findMany.mockResolvedValue([
      { id: 'category-1', name: 'Энергетики' },
    ]);
    prisma.supplier.findMany.mockResolvedValue([
      { id: 'supplier-1', name: 'Напитки Pro' },
    ]);
    service = new ProductCsvImportService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
  });

  it('previews valid CSV rows with relation lookup', async () => {
    const preview = await service.preview(
      [
        'Артикул,Наименование,Категория,Поставщик,Входящая цена,Цена продажи,Фейсинг',
        'DRK-001,Adrenaline Rush,Энергетики,Напитки Pro,62,139,4',
      ].join('\n'),
      user,
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows).toEqual([
      expect.objectContaining({
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        purchasePrice: '62',
        salePrice: '139',
        facing: 4,
        categoryId: 'category-1',
        supplierId: 'supplier-1',
      }),
    ]);
  });

  it('returns validation errors for unknown relations and bad prices', async () => {
    const preview = await service.preview(
      [
        'article,name,category,supplier,purchasePrice,salePrice',
        'DRK-001,Adrenaline Rush,Unknown,Missing,-1,abc',
      ].join('\n'),
      user,
    );

    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'category' }),
        expect.objectContaining({ field: 'supplier' }),
        expect.objectContaining({ field: 'purchasePrice' }),
        expect.objectContaining({ field: 'salePrice' }),
      ]),
    );
  });

  it('rejects import when preview has errors', async () => {
    await expect(
      service.import(
        'article,name,purchasePrice,salePrice\nDRK-001,,62,139',
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const data = lastImportJobCreateData(prisma);
    expect(data.status).toBe('FAILED');
    expect(data.errorsCount).toBe(1);
    expect(data.importedRows).toBe(0);
    expect(data.tenantId).toBe('tenant-1');
  });

  it('upserts valid rows by tenant and article', async () => {
    const result = await service.import(
      'article,name,purchasePrice,salePrice\nDRK-001,Adrenaline Rush,62,139',
      user,
      'products.csv',
    );

    expect(prisma.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_article: {
            tenantId: 'tenant-1',
            article: 'DRK-001',
          },
        },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    const data = lastImportJobCreateData(prisma);
    expect(data.sourceFileName).toBe('products.csv');
    expect(data.status).toBe('COMPLETED');
    expect(data.importedRows).toBe(1);
    expect(data.errorsCount).toBe(0);
    expect(result.importedRows).toBe(1);
  });

  it('returns recent import jobs for tenant', async () => {
    prisma.importJob.findMany.mockResolvedValue([
      {
        id: 'import-1',
        status: 'COMPLETED',
      },
    ]);

    await expect(service.findRecent(user)).resolves.toEqual([
      {
        id: 'import-1',
        status: 'COMPLETED',
      },
    ]);
    expect(prisma.importJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        take: 20,
      }),
    );
  });
});
