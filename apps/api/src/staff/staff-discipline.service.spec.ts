import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { StaffDisciplineService } from './staff-discipline.service';

const tenantId = 'tenant-a';

type RecordFindManyArgs = {
  where?: unknown;
  take?: number;
  [key: string]: unknown;
};

type RecordFindManyMock = jest.MockedFunction<
  (args: RecordFindManyArgs) => Promise<unknown[]>
>;

const owner = {
  id: 'owner-a',
  email: 'owner-a@example.test',
  fullName: 'Owner A',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const clubAdministrator = {
  id: 'admin-a',
  email: 'admin-a@example.test',
  fullName: 'Admin A',
  role: UserRole.CLUB_ADMINISTRATOR,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'STORES',
  allowedStoreIds: ['store-a'],
} satisfies AuthenticatedUser;

function createHarness(
  scope: { mode: 'NETWORK' | 'STORES'; allowedStoreIds: string[] } = {
    mode: 'NETWORK',
    allowedStoreIds: [],
  },
) {
  const recordFindMany: RecordFindManyMock = jest.fn();
  recordFindMany.mockResolvedValue([]);
  const storeFindMany = jest.fn().mockResolvedValue([]);
  const userFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    staffDisciplineRule: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffDisciplineRecord: {
      findMany: recordFindMany,
    },
    store: {
      findMany: storeFindMany,
    },
    user: {
      findMany: userFindMany,
    },
    staffDisciplinePolicy: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const tenantContext = {
    resolve: jest.fn().mockResolvedValue({ tenantId }),
  } as unknown as TenantContextService;
  const freshStoreScope = {
    resolve: jest.fn((user: AuthenticatedUser) =>
      Promise.resolve({
        userId: user.id,
        tenantId,
        tenantSlug: 'tenant-a',
        ...scope,
      }),
    ),
  };

  return {
    service: new StaffDisciplineService(
      prisma,
      tenantContext,
      freshStoreScope as unknown as FreshStoreScopeService,
    ),
    recordFindMany,
    storeFindMany,
    userFindMany,
    freshStoreScope,
  };
}

describe('StaffDisciplineService own motivation report', () => {
  it('pins a STORES administrator to their own records and in-scope clubs', async () => {
    const harness = createHarness({
      mode: 'STORES',
      allowedStoreIds: ['store-a'],
    });
    harness.recordFindMany.mockImplementation((args) =>
      Promise.resolve(
        (args as { distinct?: unknown }).distinct
          ? [{ storeId: 'store-old' }]
          : [],
      ),
    );

    const report = await harness.service.getOwnReport(clubAdministrator, {
      userId: 'someone-else',
    });

    expect(harness.freshStoreScope.resolve).toHaveBeenCalledWith(
      clubAdministrator,
    );
    expect(harness.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, userId: 'admin-a', status: 'ACTIVE' },
      }),
    );
    expect(harness.storeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, id: { in: ['store-a', 'store-old'] } },
      }),
    );
    expect(harness.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, id: 'admin-a', isActive: true },
      }),
    );
    expect(report.access).toEqual({
      mode: 'SELF',
      canManage: false,
      canExport: false,
    });
    expect(report.filters.userId).toBe('admin-a');
  });

  it('keeps every club visible for a NETWORK administrator', async () => {
    const harness = createHarness();

    await harness.service.getOwnReport({
      ...clubAdministrator,
      role: UserRole.SENIOR_ADMINISTRATOR,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    });

    expect(harness.storeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it('refuses managers, who use the network workspace instead', async () => {
    const harness = createHarness();

    await expect(harness.service.getOwnReport(owner)).rejects.toThrow(
      'Personal motivation is available to administrators only',
    );
    expect(harness.freshStoreScope.resolve).not.toHaveBeenCalled();
  });
});

describe('StaffDisciplineService report period', () => {
  it('shows every active record by default without an implicit date range or row cap', async () => {
    const harness = createHarness();

    const report = await harness.service.getReport(owner);

    expect(harness.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
    );
    expect(harness.recordFindMany.mock.calls[0]?.[0]).not.toHaveProperty(
      'take',
    );
    expect(report.filters).toMatchObject({
      period: 'all',
      dateFrom: null,
      dateTo: null,
      status: 'ACTIVE',
    });
  });

  it('keeps explicit period filtering available', async () => {
    const harness = createHarness();

    const report = await harness.service.getReport(owner, {
      dateFrom: '2026-01-01',
      dateTo: '2026-02-28',
    });

    expect(harness.recordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          occurredAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-02-28T23:59:59.999Z'),
          },
          status: 'ACTIVE',
        },
      }),
    );
    expect(report.filters).toMatchObject({
      period: 'range',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-28',
      status: 'ACTIVE',
    });
  });
});

describe('Staff discipline period filters', () => {
  function createService() {
    return new StaffDisciplineService({} as never, {} as never, {} as never);
  }

  function resolveFilters(
    service: StaffDisciplineService,
    query: {
      dateFrom?: string;
      dateTo?: string;
      period?: 'all' | 'range';
      status?: 'ACTIVE' | 'CANCELED' | 'RESET' | 'all';
    },
    defaultPeriod: 'all' | 'range',
  ) {
    return (
      service as unknown as {
        resolveFilters: (
          value: typeof query,
          forcedUserId: string | null,
          defaultValue: 'all' | 'range',
        ) => {
          period: 'all' | 'range';
          status: 'ACTIVE' | 'CANCELED' | 'RESET' | 'all';
          start: Date | null;
          end: Date | null;
          userId: string | null;
        };
      }
    ).resolveFilters(query, 'user-1', defaultPeriod);
  }

  it('defaults the motivation report to all active records', () => {
    const service = createService();
    const filters = resolveFilters(service, {}, 'all');
    const where = (
      service as unknown as {
        buildRecordWhere: (
          tenantId: string,
          value: typeof filters,
        ) => Record<string, unknown>;
      }
    ).buildRecordWhere('tenant-1', filters);

    expect(filters).toEqual(
      expect.objectContaining({
        period: 'all',
        status: 'ACTIVE',
        userId: 'user-1',
      }),
    );
    expect(where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: 'ACTIVE',
      }),
    );
    expect(where).not.toHaveProperty('occurredAt');
  });

  it('uses a date range when dates are selected', () => {
    const service = createService();
    const filters = resolveFilters(
      service,
      { dateFrom: '2026-08-01', dateTo: '2026-08-20' },
      'all',
    );
    const where = (
      service as unknown as {
        buildRecordWhere: (
          tenantId: string,
          value: typeof filters,
        ) => Record<string, unknown>;
      }
    ).buildRecordWhere('tenant-1', filters);

    expect(filters.period).toBe('range');
    expect(where).toEqual(
      expect.objectContaining({
        occurredAt: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-20T23:59:59.999Z'),
        },
      }),
    );
  });
});
