import { StaffDisciplineService } from './staff-discipline.service';

describe('Staff discipline period filters', () => {
  function createService() {
    return new StaffDisciplineService({} as never, {} as never);
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
          start: Date;
          end: Date;
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
