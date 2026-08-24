import { GuestsService } from './guests.service';

describe('GuestsService shift workspace', () => {
  it('builds and returns only the requested staff identity in its server-owned store', async () => {
    const service = new GuestsService(
      {} as never,
      {
        resolve: jest.fn().mockReturnValue({ tenantId: 'tenant-1' }),
      },
      null as never,
      null as never,
      null as never,
      null as never,
    );
    const internals = service as unknown as {
      resolveStoreId(
        tenantId: string,
        storeId?: string,
      ): Promise<string | null>;
      buildStaffOperatorRows(
        tenantId: string,
        period: unknown,
        storeId: string | null,
        identity: {
          externalDomain: string | null;
          externalUserId: string;
        },
      ): Promise<
        Array<{ externalDomain: string | null; externalUserId: string }>
      >;
    };
    const resolveStoreId = jest
      .spyOn(internals, 'resolveStoreId')
      .mockResolvedValue('store-1');
    const expected = {
      externalDomain: 'club.example.test',
      externalUserId: 'operator-1',
    };
    const buildRows = jest
      .spyOn(internals, 'buildStaffOperatorRows')
      .mockResolvedValue([
        { externalDomain: 'club.example.test', externalUserId: 'other' },
        expected,
      ]);

    await expect(
      service.getShiftWorkspaceOperator({} as never, {
        dateFrom: '2026-08-24',
        dateTo: '2026-08-24',
        storeId: 'store-1',
        externalDomain: 'club.example.test',
        externalUserId: 'operator-1',
      }),
    ).resolves.toBe(expected);

    expect(resolveStoreId).toHaveBeenCalledWith('tenant-1', 'store-1');
    expect(buildRows).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Object),
      'store-1',
      {
        externalDomain: 'club.example.test',
        externalUserId: 'operator-1',
      },
    );
  });
});
