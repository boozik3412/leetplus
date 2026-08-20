import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
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

function createHarness() {
  const recordFindMany: RecordFindManyMock = jest.fn();
  recordFindMany.mockResolvedValue([]);
  const prisma = {
    staffDisciplineRule: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffDisciplineRecord: {
      findMany: recordFindMany,
    },
    store: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffDisciplinePolicy: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const tenantContext = {
    resolve: jest.fn().mockResolvedValue({ tenantId }),
  } as unknown as TenantContextService;

  return {
    service: new StaffDisciplineService(prisma, tenantContext),
    recordFindMany,
  };
}

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
      dateFrom: '2026-01-01',
      dateTo: '2026-02-28',
      status: 'ACTIVE',
    });
  });
});
