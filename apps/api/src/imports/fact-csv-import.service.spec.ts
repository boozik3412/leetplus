import { BadRequestException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { FactCsvImportService } from './fact-csv-import.service';

type PrismaMock = {
  store: {
    findMany: jest.Mock;
  };
  product: {
    findMany: jest.Mock;
  };
  inventorySnapshot: {
    upsert: jest.Mock;
  };
  salesFact: {
    upsert: jest.Mock;
  };
  stockMovement: {
    upsert: jest.Mock;
  };
  importJob: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type UpsertCall = {
  where: {
    tenantId_storeId_productId_snapshotDate?: {
      tenantId: string;
      storeId: string;
      productId: string;
    };
    tenantId_storeId_productId_saleDate?: {
      tenantId: string;
      storeId: string;
      productId: string;
    };
    tenantId_storeId_productId_movementDate_type?: {
      tenantId: string;
      storeId: string;
      productId: string;
      type: string;
    };
  };
  create: {
    tenantId: string;
    storeId: string;
    productId: string;
    quantity: Prisma.Decimal;
    revenue?: Prisma.Decimal;
    cost?: Prisma.Decimal;
    amount?: Prisma.Decimal;
    type?: string;
  };
};

type ImportJobCreateArgs = {
  data: {
    type: string;
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
    store: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
    },
    inventorySnapshot: {
      upsert: jest.fn((args: unknown) => args),
    },
    salesFact: {
      upsert: jest.fn((args: unknown) => args),
    },
    stockMovement: {
      upsert: jest.fn((args: unknown) => args),
    },
    importJob: {
      create: jest.fn((args: unknown) => Promise.resolve(args)),
    },
    $transaction: jest.fn((operations: unknown[]) =>
      Promise.resolve(operations),
    ),
  };
}

function firstUpsertCall(mock: jest.Mock) {
  const calls = mock.mock.calls as unknown as [UpsertCall][];
  const firstCall = calls[0];

  if (!firstCall) {
    throw new Error('Expected upsert to be called');
  }

  return firstCall[0];
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

describe('FactCsvImportService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let service: FactCsvImportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      }),
    };
    prisma.store.findMany.mockResolvedValue([
      { id: 'store-1', name: 'Club A' },
      { id: 'store-2', name: 'LeetPlus Arena Центр' },
      { id: 'store-3', name: 'LeetPlus Arena Север' },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Adrenaline Rush',
        purchasePrice: new Prisma.Decimal(62),
        salePrice: new Prisma.Decimal(139),
      },
      {
        id: 'product-2',
        article: 'SNK-001',
        name: "Lay's Сметана и зелень 140 г",
        purchasePrice: new Prisma.Decimal(81),
        salePrice: new Prisma.Decimal(179),
      },
      {
        id: 'product-3',
        article: 'COF-002',
        name: 'Капучино 250 мл',
        purchasePrice: new Prisma.Decimal(26),
        salePrice: new Prisma.Decimal(139),
      },
      {
        id: 'product-4',
        article: 'FST-001',
        name: 'Ролл Цезарь охлажденный',
        purchasePrice: new Prisma.Decimal(112),
        salePrice: new Prisma.Decimal(249),
      },
    ]);
    service = new FactCsvImportService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
    );
  });

  it('previews valid inventory rows with store and product lookup', async () => {
    const preview = await service.previewInventory(
      'Дата,Торговая точка,Артикул,Остаток\n2026-04-28,Club A,DRK-001,12',
      user,
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows).toEqual([
      {
        row: 2,
        date: '2026-04-28T00:00:00.000Z',
        storeName: 'Club A',
        article: 'DRK-001',
        productName: 'Adrenaline Rush',
        quantity: '12',
        storeId: 'store-1',
        productId: 'product-1',
      },
    ]);
  });

  it('previews sales rows and calculates cost from purchase price', async () => {
    const preview = await service.previewSales(
      'Дата,Торговая точка,Артикул,Количество,Выручка\n28.04.2026,Club A,DRK-001,2,278',
      user,
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]?.cost).toBe('124');
  });

  it('previews downloadable fact templates without errors', async () => {
    const inventory = await service.previewInventory(
      [
        'Дата,Торговая точка,Артикул,Остаток',
        '2026-04-28,LeetPlus Arena Центр,DRK-001,24',
        '2026-04-28,LeetPlus Arena Центр,SNK-001,16',
        '2026-04-28,LeetPlus Arena Север,COF-002,8',
      ].join('\n'),
      user,
    );
    const sales = await service.previewSales(
      [
        'Дата,Торговая точка,Артикул,Количество,Выручка,Себестоимость',
        '2026-04-28,LeetPlus Arena Центр,DRK-001,4,556,248',
        '2026-04-28,LeetPlus Arena Центр,SNK-001,2,358,162',
        '2026-04-28,LeetPlus Arena Север,COF-002,6,834,156',
      ].join('\n'),
      user,
    );
    const movements = await service.previewStockMovements(
      [
        'Дата,Торговая точка,Артикул,Тип,Количество,Сумма,Причина',
        '2026-04-28,LeetPlus Arena Центр,FST-001,списание,2,224,Истёк срок годности',
        '2026-04-28,LeetPlus Arena Центр,DRK-001,списание,1,62,Повреждение упаковки',
        '2026-04-28,LeetPlus Arena Север,SNK-001,возврат,1,179,Возврат гостя',
      ].join('\n'),
      user,
    );

    expect(inventory.errors).toEqual([]);
    expect(inventory.validRows).toBe(3);
    expect(sales.errors).toEqual([]);
    expect(sales.validRows).toBe(3);
    expect(movements.errors).toEqual([]);
    expect(movements.validRows).toBe(3);
  });

  it('previews stock movement rows and calculates default amount', async () => {
    const preview = await service.previewStockMovements(
      'Дата,Торговая точка,Артикул,Тип,Количество,Причина\n28.04.2026,Club A,DRK-001,списание,2,Брак',
      user,
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({
      type: 'WRITEOFF',
      quantity: '2',
      amount: '124',
      reason: 'Брак',
    });
  });

  it('returns validation errors for unknown store and product', async () => {
    const preview = await service.previewInventory(
      'Дата,Торговая точка,Артикул,Остаток\n2026-04-28,Missing,UNKNOWN,5',
      user,
    );

    expect(preview.errors.map((error) => error.field)).toEqual([
      'store',
      'article',
    ]);
  });

  it('upserts inventory rows and writes completed import job', async () => {
    const result = await service.importInventory(
      'Дата,Торговая точка,Артикул,Остаток\n2026-04-28,Club A,DRK-001,12',
      user,
      'inventory.csv',
    );

    const upsert = firstUpsertCall(prisma.inventorySnapshot.upsert);
    expect(upsert.where.tenantId_storeId_productId_snapshotDate).toMatchObject({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      productId: 'product-1',
    });
    expect(upsert.create.quantity).toEqual(new Prisma.Decimal(12));
    expect(result.importedRows).toBe(1);

    const importJob = lastImportJobCreateData(prisma);
    expect(importJob.type).toBe('INVENTORY_CSV');
    expect(importJob.status).toBe('COMPLETED');
    expect(importJob.errorsCount).toBe(0);
  });

  it('upserts stock movement rows and writes completed import job', async () => {
    const result = await service.importStockMovements(
      'Дата,Торговая точка,Артикул,Тип,Количество,Сумма\n2026-04-28,Club A,DRK-001,возврат,1,139',
      user,
      'movements.csv',
    );

    const upsert = firstUpsertCall(prisma.stockMovement.upsert);
    expect(
      upsert.where.tenantId_storeId_productId_movementDate_type,
    ).toMatchObject({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      productId: 'product-1',
      type: 'RETURN',
    });
    expect(upsert.create.quantity).toEqual(new Prisma.Decimal(1));
    expect(upsert.create.amount).toEqual(new Prisma.Decimal(139));
    expect(result.importedRows).toBe(1);

    const importJob = lastImportJobCreateData(prisma);
    expect(importJob.type).toBe('STOCK_MOVEMENT_CSV');
    expect(importJob.status).toBe('COMPLETED');
  });

  it('rejects sales import with validation errors and writes failed import job', async () => {
    await expect(
      service.importSales(
        'Дата,Торговая точка,Артикул,Количество,Выручка\n2026-04-28,Club A,DRK-001,2,-1',
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const importJob = lastImportJobCreateData(prisma);
    expect(importJob.type).toBe('SALES_CSV');
    expect(importJob.status).toBe('FAILED');
    expect(importJob.importedRows).toBe(0);
    expect(importJob.errorsCount).toBe(1);
  });
});
