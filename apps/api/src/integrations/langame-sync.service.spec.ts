import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import { LangameSyncService } from './langame-sync.service';

type PrismaMock = {
  integrationCredential: {
    upsert: jest.Mock;
  };
  integrationSource: {
    upsert: jest.Mock;
    update: jest.Mock;
  };
  integrationSyncJob: {
    create: jest.Mock;
    update: jest.Mock;
  };
  product: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
  store: {
    upsert: jest.Mock;
    findMany: jest.Mock;
  };
  inventorySnapshot: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  salesFact: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  clubRevenueFact: {
    deleteMany: jest.Mock;
    upsert: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type LangameClientMock = {
  listClubs: jest.Mock;
  listProducts: jest.Mock;
  listGoods: jest.Mock;
  listProductExpenses: jest.Mock;
  listAllOperationsLog: jest.Mock;
};

type LangameSettingsMock = {
  resolveTenantAccess: jest.Mock;
};

type StoreUpsertCall = [
  {
    create: {
      tenantId: string;
      externalDomain: string | null;
      externalClubId: string | null;
    };
    update: Record<string, unknown>;
  },
];

type ProductUpsertCall = [
  {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  },
];

type SalesFactUpsertCall = [
  {
    create: {
      tenantId: string;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
    };
  },
];

type ClubRevenueFactUpsertCall = [
  {
    create: {
      tenantId: string;
      storeId: string | null;
      externalClubId: string | null;
      totalRevenue: Prisma.Decimal;
    };
  },
];

type SyncJobUpdateCall = [
  {
    where: {
      id: string;
    };
    data: {
      status: string;
      storesCount: number;
      productsCount: number;
      inventoryCount: number;
      salesCount: number;
      discrepancyCount: number;
      discrepancyLogPath?: string | null;
    };
  },
];

const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@example.com',
  fullName: null,
  role: UserRole.OWNER,
  tenantId: 'tenant-1',
  tenantSlug: 'demo',
};

function createPrismaMock(): PrismaMock {
  return {
    integrationCredential: {
      upsert: jest.fn(),
    },
    integrationSource: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    integrationSyncJob: {
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    store: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    inventorySnapshot: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    salesFact: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    clubRevenueFact: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe('LangameSyncService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let client: LangameClientMock;
  let settings: LangameSettingsMock;
  let service: LangameSyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    };
    client = {
      listClubs: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: '1337',
          address: '',
          active: 1,
        },
      ]),
      listProducts: jest.fn().mockResolvedValue([
        {
          id: 10,
          name: 'Cola',
          active: 1,
        },
      ]),
      listGoods: jest.fn().mockResolvedValue([
        {
          id: 10,
          name: 'Cola',
          count: 7,
        },
      ]),
      listProductExpenses: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 100,
            date: '2026-04-29 10:12:16',
            list_goods_id: 10,
            list_clubs_id: 1,
            price_purchase: '50.00',
            price_sale: 100,
            count: 2,
            cancel: 0,
          },
        ])
        .mockResolvedValueOnce([]),
      listAllOperationsLog: jest.fn().mockResolvedValue([
        {
          date_normal: '2026-04-29 10:12:16',
          club_id: 1,
          type: 'plus',
          sum: 500,
        },
        {
          date_normal: '2026-04-29 11:12:16',
          club_id: 1,
          type: 'minus',
          sum: 100,
        },
        {
          date_normal: '2026-04-29 12:12:16',
          club_id: 0,
          type: 'plus',
          sum: 300,
        },
      ]),
    };
    prisma.integrationCredential.upsert.mockResolvedValue({
      id: 'credential-1',
    });
    prisma.integrationSource.upsert.mockResolvedValue({
      id: 'source-1',
      domain: '443.langame.ru',
      baseUrl: 'https://443.langame.ru/public_api',
    });
    prisma.integrationSyncJob.create.mockResolvedValue({
      id: 'sync-job-1',
    });
    settings = {
      resolveTenantAccess: jest.fn().mockResolvedValue({
        apiKey: 'test-key',
        sources: [
          {
            id: 'source-1',
            domain: '443.langame.ru',
            baseUrl: 'https://443.langame.ru/public_api',
          },
        ],
      }),
    };
    prisma.product.upsert.mockResolvedValue({
      id: 'product-1',
      name: 'Cola',
    });
    prisma.product.updateMany.mockResolvedValue({ count: 0 });
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.store.upsert.mockResolvedValue({
      id: 'store-1',
    });
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        externalClubId: '1',
        name: '1337',
      },
    ]);
    prisma.inventorySnapshot.findUnique.mockResolvedValue(null);
    prisma.salesFact.findUnique.mockResolvedValue(null);
    service = new LangameSyncService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      client as unknown as LangameClient,
      settings as unknown as LangameSettingsService,
    );
  });

  it('syncs Langame data into resolved tenant scope', async () => {
    await expect(
      service.syncTenant(user, {
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant-1',
      sources: 1,
      failedSources: 0,
      stores: 1,
      products: 1,
      inventorySnapshots: 1,
      salesFacts: 1,
      clubRevenueFacts: 2,
      discrepancies: 0,
      sourceResults: [
        {
          domain: '443.langame.ru',
          status: 'SUCCESS',
          stores: 1,
          products: 1,
          inventorySnapshots: 1,
          salesFacts: 1,
          clubRevenueFacts: 2,
          discrepancies: 0,
          discrepancyLogPath: null,
          errorMessage: null,
        },
      ],
    });
    expect(settings.resolveTenantAccess).toHaveBeenCalledWith('tenant-1');
    const [storeUpsert] = prisma.store.upsert.mock.calls[0] as StoreUpsertCall;
    expect(storeUpsert.create.tenantId).toBe('tenant-1');
    expect(storeUpsert.create.externalDomain).toBe('443.langame.ru');
    expect(storeUpsert.create.externalClubId).toBe('1');
    expect(storeUpsert.update).not.toHaveProperty('name');
    expect(prisma.inventorySnapshot.upsert).toHaveBeenCalled();
    const [salesUpsert] = prisma.salesFact.upsert.mock
      .calls[0] as SalesFactUpsertCall;
    expect(salesUpsert.create.tenantId).toBe('tenant-1');
    expect(salesUpsert.create.revenue).toEqual(new Prisma.Decimal(100).mul(2));
    expect(salesUpsert.create.cost).toEqual(new Prisma.Decimal('50.00').mul(2));
    expect(prisma.clubRevenueFact.deleteMany).toHaveBeenCalled();
    expect(client.listAllOperationsLog).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        dateFrom: '29.04.2026',
        dateTo: '29.04.2026',
      },
    );
    const [clubRevenueUpsert] = prisma.clubRevenueFact.upsert.mock
      .calls[0] as ClubRevenueFactUpsertCall;
    expect(clubRevenueUpsert.create.tenantId).toBe('tenant-1');
    expect(clubRevenueUpsert.create.storeId).toBe('store-1');
    expect(clubRevenueUpsert.create.totalRevenue).toEqual(
      new Prisma.Decimal(500),
    );
    const [networkRevenueUpsert] = prisma.clubRevenueFact.upsert.mock
      .calls[1] as ClubRevenueFactUpsertCall;
    expect(networkRevenueUpsert.create.storeId).toBeNull();
    expect(networkRevenueUpsert.create.externalClubId).toBe('0');
    expect(networkRevenueUpsert.create.totalRevenue).toEqual(
      new Prisma.Decimal(300),
    );
    const [syncJobUpdate] = prisma.integrationSyncJob.update.mock
      .calls[0] as SyncJobUpdateCall;
    expect(syncJobUpdate.where.id).toBe('sync-job-1');
    expect(syncJobUpdate.data.status).toBe('SUCCESS');
    expect(syncJobUpdate.data.storesCount).toBe(1);
    expect(syncJobUpdate.data.productsCount).toBe(1);
    expect(syncJobUpdate.data.inventoryCount).toBe(1);
    expect(syncJobUpdate.data.salesCount).toBe(1);
    expect(syncJobUpdate.data.discrepancyCount).toBe(0);
  });

  it('does not auto-link synced products to canonical groups', async () => {
    await service.syncTenant(user, {
      dateFrom: '2026-04-29',
      dateTo: '2026-04-29',
    });

    for (const [productUpsert] of prisma.product.upsert.mock
      .calls as ProductUpsertCall[]) {
      expect(productUpsert.create).not.toHaveProperty('canonicalProductId');
      expect(productUpsert.update).not.toHaveProperty('canonicalProductId');
    }
  });

  it('rejects sync without API key', async () => {
    settings.resolveTenantAccess.mockRejectedValue(
      new Error('Langame API key is not configured'),
    );

    await expect(service.syncTenant(user, {})).rejects.toThrow(
      'Langame API key is not configured',
    );
  });

  it('keeps the current day in catch-up sync when a source was already synced today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-29T12:00:00.000Z'));
    settings.resolveTenantAccess.mockResolvedValueOnce({
      apiKey: 'test-key',
      sources: [
        {
          id: 'source-1',
          domain: '443.langame.ru',
          baseUrl: 'https://443.langame.ru/public_api',
          lastSyncedDate: new Date('2026-04-29T08:00:00.000Z'),
        },
      ],
    });

    try {
      await service.syncTenant(user, {
        mode: 'BACKFILL',
        catchUp: true,
      });
    } finally {
      jest.useRealTimers();
    }

    expect(client.listProductExpenses).toHaveBeenCalledWith(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        page: 1,
        pageLimit: 200,
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      },
    );
  });
});
