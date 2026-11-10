import { IntegrationProvider, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StoreFloorPlanLiveService,
  seatNumberFromName,
} from './store-floor-plan-live.service';

const TZ = 'Asia/Yekaterinburg';
const NOW = new Date('2026-11-10T08:00:00.000Z'); // 13:00 in the club

describe('StoreFloorPlanLiveService', () => {
  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
    fullName: null,
    role: UserRole.OWNER,
    tenantId: 'tenant-demo',
    tenantSlug: 'demo',
    isPlatformAdmin: false,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
  const store = {
    id: 'store-kh',
    tenantId: 'tenant-demo',
    timeZone: TZ,
    externalProvider: IntegrationProvider.LANGAME,
    externalDomain: '46.langamepro.ru',
    externalClubId: '2',
    integrationSourceId: 'source-46',
  };
  let prisma: {
    store: { findFirst: jest.Mock };
    staffMember: { findFirst: jest.Mock };
    langameStaffUser: { findFirst: jest.Mock };
    product: { findMany: jest.Mock };
  };
  let scope: { resolveRequestedStoreIds: jest.Mock };
  let settings: { resolveTenantAccess: jest.Mock };
  let client: Record<string, jest.Mock>;
  let service: StoreFloorPlanLiveService;

  beforeEach(() => {
    prisma = {
      store: { findFirst: jest.fn().mockResolvedValue(store) },
      staffMember: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ displayName: 'Иванова Мария Сергеевна' }),
      },
      langameStaffUser: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'Red Bull 0,25',
            externalProductId: '5',
            category: { name: 'Энергетики' },
          },
        ]),
      },
    };
    scope = {
      resolveRequestedStoreIds: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-demo' }),
    };
    settings = {
      resolveTenantAccess: jest.fn().mockResolvedValue({
        apiKey: 'key',
        sources: [
          {
            id: 'source-46',
            domain: '46.langamepro.ru',
            baseUrl: 'https://46.langamepro.ru/public_api',
          },
        ],
      }),
    };
    client = {
      listPcTypesInClubs: jest.fn().mockResolvedValue([
        { id: 1, name: 'Standart' },
        { id: 2, name: 'VIP' },
      ]),
      listPcTypeLinks: jest.fn().mockResolvedValue([
        {
          id: 10,
          name: 'ПК 17',
          UUID: 'aaa-17',
          club_id: 2,
          packets_type_PC: 1,
        },
        {
          id: 11,
          name: 'ПК 40',
          UUID: 'aaa-40',
          club_id: 2,
          packets_type_PC: 2,
        },
        {
          id: 12,
          name: 'ПК 5',
          UUID: 'bbb-05',
          club_id: 1,
          packets_type_PC: 1,
        },
      ]),
      listGuestSessions: jest.fn().mockResolvedValue([
        // running on PC 17
        {
          id: 1,
          guest_id: 501,
          UUID: 'AAA-17',
          date_start: '2026-11-10 12:10:00',
          date_stop: '2026-11-10 15:10:00',
        },
        // finished on PC 40
        {
          id: 2,
          guest_id: 502,
          UUID: 'aaa-40',
          date_start: '2026-11-10 09:00:00',
          date_stop: '2026-11-10 11:00:00',
        },
        // other club
        {
          id: 3,
          guest_id: 503,
          UUID: 'bbb-05',
          date_start: '2026-11-10 12:00:00',
          date_stop: null,
        },
      ]),
      listWorkingShifts: jest.fn().mockResolvedValue([
        {
          id: 900,
          list_clubs_id: 2,
          user_id: 77,
          date_start: '2026-11-10 10:00:00',
          date_stop: null,
        },
        {
          id: 899,
          list_clubs_id: 2,
          user_id: 76,
          date_start: '2026-11-09 22:00:00',
          date_stop: '2026-11-10 10:00:00',
        },
        {
          id: 901,
          list_clubs_id: 1,
          user_id: 78,
          date_start: '2026-11-10 10:30:00',
          date_stop: null,
        },
      ]),
      listAllOperationsLog: jest.fn().mockResolvedValue([
        {
          date_normal: '2026-11-10 09:59:00',
          club_id: 2,
          type: 'plus',
          sum: 1000,
        },
        {
          date_normal: '2026-11-10 11:00:00',
          club_id: 2,
          type: 'plus',
          sum: '450.50',
        },
        {
          date_normal: '2026-11-10 11:30:00',
          club_id: 2,
          type: 'minus',
          sum: 300,
        },
        {
          date_normal: '2026-11-10 12:00:00',
          club_id: 1,
          type: 'plus',
          sum: 700,
        },
      ]),
      listProductExpenses: jest.fn().mockResolvedValue([
        {
          id: 1,
          date: '2026-11-10 11:00:00',
          list_goods_id: 5,
          list_clubs_id: 2,
          working_shift_id: 900,
          price_sale: 120,
          count: 2,
          cancel: 0,
        },
        {
          id: 4,
          date: '2026-11-10 12:40:00',
          list_goods_id: 7,
          list_clubs_id: 2,
          working_shift_id: 900,
          price_sale: 150,
          count: 1,
          cancel: 0,
        },
        // other club, same shift window
        {
          id: 5,
          date: '2026-11-10 12:50:00',
          list_goods_id: 5,
          list_clubs_id: 1,
          working_shift_id: 901,
          price_sale: 120,
          count: 1,
          cancel: 0,
        },
        {
          id: 2,
          date: '2026-11-10 11:10:00',
          list_goods_id: 6,
          list_clubs_id: 2,
          working_shift_id: 900,
          price_sale: 90,
          count: 1,
          cancel: 1,
        },
        {
          id: 3,
          date: '2026-11-10 09:00:00',
          list_goods_id: 6,
          list_clubs_id: 2,
          working_shift_id: 899,
          price_sale: 90,
          count: 1,
          cancel: 0,
        },
      ]),
    };
    service = new StoreFloorPlanLiveService(
      prisma as never,
      scope as never,
      settings as never,
      client as never,
    );
  });

  it('builds the live club state for the open shift', async () => {
    const view = await service.get('store-kh', user, NOW);

    expect(scope.resolveRequestedStoreIds).toHaveBeenCalledWith(user, [
      'store-kh',
    ]);
    expect(view.status).toBe('LIVE');
    expect(view.pcs).toEqual([
      {
        name: 'ПК 17',
        number: 17,
        type: 'Standart',
        busy: true,
        busyUntil: '2026-11-10T10:10:00.000Z',
      },
      { name: 'ПК 40', number: 40, type: 'VIP', busy: false, busyUntil: null },
    ]);
    expect(view.guests).toBe(1);
    expect(view.shift).toEqual({
      adminName: 'Иванова Мария Сергеевна',
      startedAt: '2026-11-10T05:00:00.000Z',
    });
    expect(view.revenue).toEqual({
      period: 'SHIFT',
      since: '2026-11-10T05:00:00.000Z',
      total: 450.5,
      goods: 390,
      goodsCount: 3,
    });
    // Newest first; a product missing from the assortment keeps its id.
    expect(view.purchases).toEqual([
      {
        at: '2026-11-10T07:40:00.000Z',
        title: 'Товар №7',
        category: null,
        quantity: 1,
        sum: 150,
      },
      {
        at: '2026-11-10T06:00:00.000Z',
        title: 'Red Bull 0,25',
        category: 'Энергетики',
        quantity: 2,
        sum: 240,
      },
    ]);
    const [productQuery] = prisma.product.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(productQuery.where).toMatchObject({
      tenantId: 'tenant-demo',
      externalDomain: '46.langamepro.ru',
      externalProductId: { in: ['7', '5'] },
    });
    expect(view.warnings).toEqual([]);
    const [staffQuery] = prisma.staffMember.findFirst.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(staffQuery.where).toMatchObject({
      tenantId: 'tenant-demo',
      externalDomain: '46.langamepro.ru',
      externalUserId: '77',
    });
  });

  it('shares one Langame read between viewers inside the window', async () => {
    await service.get('store-kh', user, NOW);
    await service.get('store-kh', user, new Date(NOW.getTime() + 5_000));
    expect(client.listGuestSessions).toHaveBeenCalledTimes(1);

    await service.get('store-kh', user, new Date(NOW.getTime() + 20_000));
    expect(client.listGuestSessions).toHaveBeenCalledTimes(2);
    // The computer list is kept longer than the live state.
    expect(client.listPcTypeLinks).toHaveBeenCalledTimes(1);
  });

  it('keeps the other parts when one Langame read fails', async () => {
    client.listAllOperationsLog.mockRejectedValue(new Error('timeout'));
    const view = await service.get('store-kh', user, NOW);

    expect(view.status).toBe('LIVE');
    expect(view.revenue?.total).toBeNull();
    expect(view.revenue?.goods).toBe(390);
    expect(view.warnings).toEqual(['Не удалось получить выручку из Langame.']);
  });

  it('shows the purchases even when the assortment cannot be read', async () => {
    prisma.product.findMany.mockRejectedValue(new Error('db down'));
    const view = await service.get('store-kh', user, NOW);

    expect(view.purchases?.map((purchase) => purchase.title)).toEqual([
      'Товар №7',
      'Товар №5',
    ]);
    expect(view.warnings).toEqual([]);
  });

  it('has no purchases list when Langame sales fail', async () => {
    client.listProductExpenses.mockRejectedValue(new Error('timeout'));
    const view = await service.get('store-kh', user, NOW);

    expect(view.purchases).toBeNull();
    expect(view.warnings).toEqual([
      'Не удалось получить продажи товаров из Langame.',
    ]);
  });

  it('reports a club without Langame without calling it', async () => {
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      externalProvider: null,
    });
    const view = await service.get('store-kh', user, NOW);

    expect(view.status).toBe('NOT_CONNECTED');
    expect(settings.resolveTenantAccess).not.toHaveBeenCalled();
  });

  it('counts today since club midnight when no shift is open', async () => {
    client.listWorkingShifts.mockResolvedValue([]);
    const view = await service.get('store-kh', user, NOW);

    expect(view.shift).toBeNull();
    expect(view.revenue).toEqual(
      expect.objectContaining({
        period: 'TODAY',
        since: '2026-11-09T19:00:00.000Z',
        total: 1450.5,
      }),
    );
  });

  it.each([
    ['ПК 17', 17],
    ['PC-05', 5],
    ['VIP 2-40', 40],
    ['Консоль', null],
  ])('reads the seat number from %s', (name, number) => {
    expect(seatNumberFromName(name)).toBe(number);
  });
});
