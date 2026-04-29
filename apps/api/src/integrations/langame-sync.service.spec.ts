import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LangameClient } from './langame.client';
import { LangameSyncService } from './langame-sync.service';

type PrismaMock = {
  integrationCredential: {
    upsert: jest.Mock;
  };
  integrationSource: {
    upsert: jest.Mock;
    update: jest.Mock;
  };
  product: {
    upsert: jest.Mock;
  };
  store: {
    upsert: jest.Mock;
    findMany: jest.Mock;
  };
  inventorySnapshot: {
    upsert: jest.Mock;
  };
  salesFact: {
    upsert: jest.Mock;
  };
};

type TenantContextMock = {
  resolve: jest.Mock;
};

type ConfigMock = {
  get: jest.Mock;
};

type LangameClientMock = {
  listClubs: jest.Mock;
  listProducts: jest.Mock;
  listGoods: jest.Mock;
  listProductExpenses: jest.Mock;
};

type StoreUpsertCall = [
  {
    create: {
      tenantId: string;
      externalDomain: string | null;
      externalClubId: string | null;
    };
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
    product: {
      upsert: jest.fn(),
    },
    store: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    inventorySnapshot: {
      upsert: jest.fn(),
    },
    salesFact: {
      upsert: jest.fn(),
    },
  };
}

describe('LangameSyncService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let config: ConfigMock;
  let client: LangameClientMock;
  let service: LangameSyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tenantContext = {
      resolve: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'demo',
      }),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          LANGAME_API_KEY: 'test-key',
          LANGAME_DOMAINS: '443.langame.ru',
        };

        return values[key];
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
    };
    prisma.integrationCredential.upsert.mockResolvedValue({
      id: 'credential-1',
    });
    prisma.integrationSource.upsert.mockResolvedValue({
      id: 'source-1',
      domain: '443.langame.ru',
      baseUrl: 'https://443.langame.ru/public_api',
    });
    prisma.product.upsert.mockResolvedValue({
      id: 'product-1',
    });
    prisma.store.upsert.mockResolvedValue({
      id: 'store-1',
    });
    prisma.store.findMany.mockResolvedValue([
      {
        id: 'store-1',
        externalClubId: '1',
      },
    ]);
    service = new LangameSyncService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      config as unknown as ConfigService,
      client as unknown as LangameClient,
    );
  });

  it('syncs LAngame data into resolved tenant scope', async () => {
    await expect(
      service.syncTenant(user, {
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant-1',
      sources: 1,
      stores: 1,
      products: 1,
      inventorySnapshots: 1,
      salesFacts: 1,
    });
    expect(prisma.integrationCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_provider_name: {
            tenantId: 'tenant-1',
            provider: IntegrationProvider.LANGAME,
            name: 'LAngame env key',
          },
        },
      }),
    );
    const [storeUpsert] = prisma.store.upsert.mock.calls[0] as StoreUpsertCall;
    expect(storeUpsert.create.tenantId).toBe('tenant-1');
    expect(storeUpsert.create.externalDomain).toBe('443.langame.ru');
    expect(storeUpsert.create.externalClubId).toBe('1');
    expect(prisma.inventorySnapshot.upsert).toHaveBeenCalled();
    const [salesUpsert] = prisma.salesFact.upsert.mock
      .calls[0] as SalesFactUpsertCall;
    expect(salesUpsert.create.tenantId).toBe('tenant-1');
    expect(salesUpsert.create.revenue).toEqual(new Prisma.Decimal(100).mul(2));
    expect(salesUpsert.create.cost).toEqual(new Prisma.Decimal('50.00').mul(2));
  });

  it('rejects sync without API key', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'LANGAME_DOMAINS' ? '443.langame.ru' : '',
    );

    await expect(service.syncTenant(user, {})).rejects.toThrow(
      'LANGAME_API_KEY is not configured',
    );
  });
});
