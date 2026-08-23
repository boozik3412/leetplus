import {
  Prisma,
  TenantCustomerStage,
  TenantModule,
  UserRole,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import { LangameClient } from './langame.client';
import { LangameSettingsService } from './langame-settings.service';
import {
  EXTERNAL_LEGACY_LANGAME_SYNC_DENIAL_REASON_CODE,
  LangameSyncService,
} from './langame-sync.service';
import {
  BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
  type LangameSyncResult,
} from './langame.types';

type PrismaMock = {
  tenant: {
    findMany: jest.Mock;
  };
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
  langameProductGroup: {
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  langameClubProductConfiguration: {
    upsert: jest.Mock;
    updateMany: jest.Mock;
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
  listActiveProductGroups: jest.Mock;
  listClubProductConfiguration: jest.Mock;
  listGoods: jest.Mock;
  listProductExpenses: jest.Mock;
  listAllOperationsLog: jest.Mock;
};

type LangameSettingsMock = {
  resolveTenantAccess: jest.Mock;
};

type TenantExecutionAdmissionMock = {
  evaluate: jest.Mock;
  assertAllowed: jest.Mock;
};

type ConfigMock = {
  get: jest.Mock;
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

type ProductGroupUpsertCall = [
  {
    create: {
      externalDomain: string;
      externalGroupId: string;
      name: string;
    };
  },
];

type ClubProductConfigurationUpsertCall = [
  {
    create: {
      storeId: string;
      productId: string | null;
      externalProductId: string;
      externalGroupId: string | null;
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
    tenant: {
      findMany: jest.fn(),
    },
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
    langameProductGroup: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    langameClubProductConfiguration: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
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

function emptySyncResult(tenantId: string): LangameSyncResult {
  return {
    tenantId,
    sources: 0,
    failedSources: 0,
    stores: 0,
    products: 0,
    productGroups: 0,
    productConfigurations: 0,
    inventorySnapshots: 0,
    salesFacts: 0,
    clubRevenueFacts: 0,
    discrepancies: 0,
    sourceResults: [],
  };
}

describe('LangameSyncService', () => {
  let prisma: PrismaMock;
  let tenantContext: TenantContextMock;
  let client: LangameClientMock;
  let settings: LangameSettingsMock;
  let admission: TenantExecutionAdmissionMock;
  let config: ConfigMock;
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
      listActiveProductGroups: jest.fn().mockResolvedValue([
        {
          id: 5,
          name: 'Напитки',
          active: 1,
          deleted: 0,
        },
      ]),
      listClubProductConfiguration: jest.fn().mockResolvedValue([
        {
          id: 50,
          product_id: 10,
          product_name: 'Cola',
          club_id: 1,
          group_id: 5,
          price_sale: 100,
          purchase_price: 50,
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
    admission = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-1',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      }),
      assertAllowed: jest.fn().mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-1',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      }),
    };
    config = {
      get: jest.fn().mockReturnValue(undefined),
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
      // Keep the test adapter async to cover the compatible resolve contract.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      tenantContext as unknown as TenantContextService,
      client as unknown as LangameClient,
      settings as unknown as LangameSettingsService,
      admission as unknown as TenantExecutionAdmissionService,
      config as unknown as ConfigService,
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
      productGroups: 1,
      productConfigurations: 1,
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
          productGroups: 1,
          productConfigurations: 1,
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
    expect(admission.assertAllowed).toHaveBeenCalledWith('tenant-1', [
      { module: TenantModule.INTEGRATIONS, action: 'WRITE' },
      { module: TenantModule.ASSORTMENT, action: 'WRITE' },
    ]);
    const [storeUpsert] = prisma.store.upsert.mock.calls[0] as StoreUpsertCall;
    expect(storeUpsert.create.tenantId).toBe('tenant-1');
    expect(storeUpsert.create.externalDomain).toBe('443.langame.ru');
    expect(storeUpsert.create.externalClubId).toBe('1');
    expect(storeUpsert.update).not.toHaveProperty('name');
    expect(prisma.inventorySnapshot.upsert).toHaveBeenCalled();
    const [groupUpsert] = prisma.langameProductGroup.upsert.mock
      .calls[0] as ProductGroupUpsertCall;
    expect(groupUpsert.create).toMatchObject({
      externalDomain: '443.langame.ru',
      externalGroupId: '5',
      name: 'Напитки',
    });
    const [configurationUpsert] = prisma.langameClubProductConfiguration.upsert
      .mock.calls[0] as ClubProductConfigurationUpsertCall;
    expect(configurationUpsert.create).toMatchObject({
      storeId: 'store-1',
      productId: 'product-1',
      externalProductId: '10',
      externalGroupId: '5',
    });
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
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
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

  it('writes manual discrepancy logs under the configured persistent absolute root', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'leetplus-langame-discrepancy-'),
    );
    const persistentRoot = join(temporaryRoot, 'persistent');
    config.get.mockImplementation((key: string) =>
      key === 'LANGAME_DISCREPANCY_LOG_ROOT' ? persistentRoot : undefined,
    );
    prisma.product.findUnique.mockResolvedValue({
      name: 'Old product name',
      isActive: true,
    });

    try {
      await service.syncTenant(user, {
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      });

      const successfulUpdate = (
        prisma.integrationSyncJob.update.mock.calls as SyncJobUpdateCall[]
      )
        .map(([call]) => call)
        .find((call) => call.data.status === 'SUCCESS');
      const logPath = successfulUpdate?.data.discrepancyLogPath;
      expect(logPath).toBeTruthy();
      expect(isAbsolute(logPath ?? '')).toBe(true);
      expect(logPath).toContain(join(persistentRoot, 'tenant-1'));
      const payload = JSON.parse(await readFile(logPath ?? '', 'utf8')) as {
        tenantId: string;
        discrepancies: Array<{ field: string }>;
      };
      expect(payload.tenantId).toBe('tenant-1');
      expect(payload.discrepancies).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
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

  it('rejects manual sync before credentials, provider calls or mutations when assortment write is denied', async () => {
    admission.assertAllowed.mockRejectedValueOnce(
      new Error('ENTITLEMENT_WRITE_DISABLED'),
    );

    await expect(
      service.syncTenant(user, {
        mode: 'FULL',
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      }),
    ).rejects.toThrow('ENTITLEMENT_WRITE_DISABLED');

    expect(admission.assertAllowed).toHaveBeenCalledWith('tenant-1', [
      { module: TenantModule.INTEGRATIONS, action: 'WRITE' },
      { module: TenantModule.ASSORTMENT, action: 'WRITE' },
    ]);
    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.store.upsert).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('rejects legacy external sync before credentials, provider calls or mutations', async () => {
    admission.assertAllowed.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-1',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.PILOT,
    });

    await expect(
      service.syncTenant(user, {
        mode: 'FULL',
        dateFrom: '2026-04-29',
        dateTo: '2026-04-29',
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: EXTERNAL_LEGACY_LANGAME_SYNC_DENIAL_REASON_CODE,
      },
    });

    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.store.upsert).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
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

  it('skips a denied configured tenant and continues syncing an allowed tenant', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-denied' },
      { id: 'tenant-allowed' },
    ]);
    admission.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === 'tenant-denied'
          ? {
              allowed: false,
              tenantId,
              reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
              failedRequirement: {
                module: TenantModule.INTEGRATIONS,
                action: 'OUTBOUND',
              },
            }
          : {
              allowed: true,
              tenantId,
              reasonCode: 'ALLOWED',
              failedRequirement: null,
              customerStage: TenantCustomerStage.INTERNAL,
            },
      ),
    );
    const syncTenantById = jest
      .spyOn(service, 'syncTenantById')
      .mockResolvedValue(emptySyncResult('tenant-allowed'));

    await expect(
      service.syncConfiguredTenants({ mode: 'QUICK' }),
    ).resolves.toEqual({
      mode: 'QUICK',
      tenants: 2,
      processedTenants: 1,
      skippedTenants: 1,
      results: [emptySyncResult('tenant-allowed')],
      skips: [
        {
          status: 'SKIPPED',
          tenantId: 'tenant-denied',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
          failedRequirement: {
            module: TenantModule.INTEGRATIONS,
            action: 'OUTBOUND',
          },
        },
      ],
    });
    expect(syncTenantById).toHaveBeenCalledTimes(1);
    expect(syncTenantById).toHaveBeenCalledWith(
      'tenant-allowed',
      {
        mode: 'QUICK',
        trigger: 'AUTO',
      },
      'LANGAME_SCHEDULED_SYNC',
    );
    expect(admission.evaluate).toHaveBeenCalledWith('tenant-denied', [
      { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
      { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
    ]);
    expect(admission.evaluate).toHaveBeenCalledWith('tenant-allowed', [
      { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
      { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
    ]);
  });

  it('does not resolve credentials or call Langame when every tenant is denied', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-denied-a' },
      { id: 'tenant-denied-b' },
    ]);
    admission.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve({
        allowed: false,
        tenantId,
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        failedRequirement: {
          module: TenantModule.INTEGRATIONS,
          action: 'OUTBOUND',
        },
      }),
    );

    await expect(service.syncConfiguredTenants({})).resolves.toMatchObject({
      mode: 'QUICK',
      tenants: 2,
      processedTenants: 0,
      skippedTenants: 2,
      results: [],
      skips: [
        {
          status: 'SKIPPED',
          tenantId: 'tenant-denied-a',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        },
        {
          status: 'SKIPPED',
          tenantId: 'tenant-denied-b',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        },
      ],
    });
    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('skips an admitted external tenant before the scheduled child resolves credentials', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-pilot' }]);
    admission.evaluate.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-pilot',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.PILOT,
    });
    const syncTenantById = jest.spyOn(service, 'syncTenantById');

    await expect(
      service.syncConfiguredTenants({ mode: 'QUICK' }),
    ).resolves.toMatchObject({
      tenants: 1,
      processedTenants: 0,
      skippedTenants: 1,
      results: [],
      skips: [
        {
          status: 'SKIPPED',
          tenantId: 'tenant-pilot',
          reasonCode: BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
          failedRequirement: null,
        },
      ],
    });

    expect(syncTenantById).not.toHaveBeenCalled();
    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('rechecks both outbound modules in the scheduled child before credentials and provider calls', async () => {
    admission.assertAllowed.mockRejectedValueOnce(
      new Error('ENTITLEMENT_OUTBOUND_DISABLED'),
    );

    await expect(
      service.syncTenantById('tenant-1', {
        mode: 'FULL',
        trigger: 'AUTO',
      }),
    ).rejects.toThrow('ENTITLEMENT_OUTBOUND_DISABLED');

    expect(admission.assertAllowed).toHaveBeenCalledWith('tenant-1', [
      { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
      { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
    ]);
    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('fences an admitted external AUTO child before credentials, jobs or provider calls', async () => {
    admission.assertAllowed.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-pilot',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.PILOT,
    });

    await expect(
      service.syncTenantById('tenant-pilot', {
        mode: 'FULL',
        trigger: 'AUTO',
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        reasonCode: BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
        message: expect.stringContaining(
          'BACKGROUND_EXTERNAL_EXECUTION_DENIED',
        ) as string,
      },
    });

    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('rejects a direct authenticated external manual sync before credentials or effects', async () => {
    admission.assertAllowed.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-pilot',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.PILOT,
    });
    await expect(
      service.syncTenantById('tenant-pilot', {
        mode: 'QUICK',
        trigger: 'MANUAL',
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        reasonCode: EXTERNAL_LEGACY_LANGAME_SYNC_DENIAL_REASON_CODE,
      },
    });

    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
    expect(prisma.integrationSyncJob.create).not.toHaveBeenCalled();
    expect(prisma.store.upsert).not.toHaveBeenCalled();
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});
