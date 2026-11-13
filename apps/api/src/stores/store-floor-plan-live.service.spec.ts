import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
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
    guestGameMission: { findMany: jest.Mock };
    guestGameLootBox: { findMany: jest.Mock };
    guestGameSeason: { findMany: jest.Mock };
    guestGamePromoCard: { findMany: jest.Mock };
    guestGameReward: { count: jest.Mock; findMany?: jest.Mock };
    guest: { findFirst: jest.Mock };
  };
  let guests: { getGuest: jest.Mock; floorPlanGuestContacts?: jest.Mock };
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
      guestGameMission: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: '7 дней в клубе',
            rewardLabel: '2 часа в VIP',
            xpReward: 300,
            periodTo: new Date('2026-11-16T18:59:59.000Z'),
            storeIds: [],
            audienceId: null,
          },
          {
            name: 'Только для другого клуба',
            rewardLabel: null,
            xpReward: 50,
            periodTo: null,
            storeIds: ['store-other'],
            audienceId: null,
          },
          {
            name: 'Возвращайся',
            rewardLabel: ' ',
            xpReward: 0,
            periodTo: null,
            storeIds: ['store-kh'],
            audienceId: 'aud-1',
          },
        ]),
      },
      guestGameLootBox: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'Кейс «Минуты»',
            rewardLabel: 'до 3 часов игры',
            storeIds: null,
            audienceId: null,
          },
        ]),
      },
      guestGameSeason: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: 'Осенний пропуск',
            periodTo: new Date('2026-11-30T18:59:59.000Z'),
            levels: [{}, {}, {}],
            storeIds: [],
          },
        ]),
      },
      guestGamePromoCard: {
        findMany: jest.fn().mockResolvedValue([
          {
            title: 'Ночной пакет −20%',
            label: null,
            periodTo: null,
            storeIds: ['store-kh'],
          },
        ]),
      },
      guestGameReward: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(where.missionId ? 4 : where.lootBoxId ? 2 : 7),
          ),
      },
    };
    prisma.guest = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'guest-501', isStaff: false }),
    };
    guests = {
      getGuest: jest.fn().mockResolvedValue({
        id: 'guest-501',
        displayName: 'Иван П.',
        segment: 'repeat',
        rfm: { segment: 'LOYAL' },
        crmStatus: 'NONE',
        crmNote: null,
        nextAction: null,
        insertedAt: '2025-03-02T10:00:00.000Z',
        visitsDays: 48,
        playHours: 120.5,
        ltv: { totalRevenue: 31400 },
        recommendedAction: {
          key: 'REMIND_REWARD',
          label: 'Напомнить о награде',
          reason: '2 награды ждут',
        },
        // The running session is already synced: it is not the previous visit.
        sessions: [
          {
            startedAt: '2026-11-10T07:10:00.000Z',
            storeName: 'APEKS',
          },
          {
            startedAt: '2026-11-07T12:00:00.000Z',
            storeName: '1337 Пушкинская',
          },
        ],
        transactions: [
          { balance: null, bonusBalance: null },
          { balance: 240, bonusBalance: 85 },
        ],
        gameAccess: 'AVAILABLE',
        gameProfile: {
          level: 7,
          xp: 3320,
          xpToNextLevel: 180,
          pendingRewards: 2,
          rewardsExpiringSoon: 1,
          nearestRewardExpiresAt: '2026-11-11T10:00:00.000Z',
          rewardsPaidTotal: 5,
        },
        gamification: null,
      }),
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
      getDiagnosticEndpoint: jest.fn().mockResolvedValue({
        status: true,
        data: { guest_id: 501, fio: '  Новиков   Пётр ', phone: '79990001122' },
      }),
      listTariffTypeGroups: jest.fn().mockResolvedValue([
        { id: 1, name: 'Поминутный' },
        { id: 9, name: '3 часа' },
      ]),
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
          packet: 9,
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
          real_guest_id: 501,
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
          real_guest_id: 501,
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
      guests as never,
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

  it('finds the LeetPlus account of the shift administrator', async () => {
    prisma.staffMember.findFirst.mockResolvedValue({
      displayName: 'Иванова Мария Сергеевна',
      userId: 'user-admin',
    });
    const shift = await service.shiftAdminOf('store-kh', user, NOW);

    expect(shift).toMatchObject({
      status: 'LIVE',
      admin: { name: 'Иванова Мария Сергеевна', userId: 'user-admin' },
      failed: false,
    });
    const view = await service.get('store-kh', user, NOW);
    expect(JSON.stringify(view)).not.toContain('user-admin');
  });

  it('lists the game mechanics running in the club now', async () => {
    const view = await service.get('store-kh', user, NOW);

    expect(view.game).toEqual({
      completed: { missions: 4, cases: 2, rewards: 7 },
      season: {
        name: 'Осенний пропуск',
        endsAt: '2026-11-30T18:59:59.000Z',
        levels: 3,
      },
      items: [
        {
          kind: 'MISSION',
          title: '7 дней в клубе',
          reward: '2 часа в VIP',
          xp: 300,
          endsAt: '2026-11-16T18:59:59.000Z',
          segment: false,
        },
        {
          kind: 'MISSION',
          title: 'Возвращайся',
          reward: null,
          xp: null,
          endsAt: null,
          segment: true,
        },
        {
          kind: 'CASE',
          title: 'Кейс «Минуты»',
          reward: 'до 3 часов игры',
          xp: null,
          endsAt: null,
          segment: false,
        },
        {
          kind: 'PROMO',
          title: 'Ночной пакет −20%',
          reward: null,
          xp: null,
          endsAt: null,
          segment: false,
        },
      ],
    });
    const [missionQuery] = prisma.guestGameMission.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(missionQuery.where).toMatchObject({
      tenantId: 'tenant-demo',
      status: 'ACTIVE',
    });
    // Rewards are counted for this club since the shift start only.
    const [rewardQuery] = prisma.guestGameReward.count.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(rewardQuery.where).toMatchObject({
      tenantId: 'tenant-demo',
      storeId: 'store-kh',
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      qualifiedAt: { gte: new Date('2026-11-10T05:00:00.000Z'), lte: NOW },
    });
  });

  it('keeps the club view when the game module cannot be read', async () => {
    prisma.guestGameSeason.findMany.mockRejectedValue(new Error('db down'));
    const view = await service.get('store-kh', user, NOW);

    expect(view.status).toBe('LIVE');
    expect(view.game).toBeNull();
    expect(view.warnings).toEqual([
      'Не удалось получить активности игрового модуля.',
    ]);
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
    // The game module does not need Langame.
    expect(view.game?.items).toHaveLength(4);
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

  it('shows the guest at a busy computer to a role that sees guests', async () => {
    const seat = await service.getSeat('store-kh', 17, user, NOW);

    expect(seat).toMatchObject({
      storeId: 'store-kh',
      number: 17,
      busy: true,
      guestAccess: 'AVAILABLE',
      session: {
        startedAt: '2026-11-10T07:10:00.000Z',
        endsAt: '2026-11-10T10:10:00.000Z',
        tariff: '3 часа',
      },
    });
    const [guestQuery] = prisma.guest.findFirst.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(guestQuery.where).toEqual({
      tenantId: 'tenant-demo',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: '46.langamepro.ru',
      externalGuestId: '501',
    });
    expect(guests.getGuest).toHaveBeenCalledWith(user, 'guest-501');
    expect(seat.guest).toMatchObject({
      id: 'guest-501',
      displayName: 'Иван П.',
      visitsDays: 48,
      totalRevenue: 31400,
      previousVisit: {
        at: '2026-11-07T12:00:00.000Z',
        storeName: '1337 Пушкинская',
      },
      balance: 240,
      bonusBalance: 85,
      recommendedAction: { key: 'REMIND_REWARD' },
      game: { level: 7, pendingRewards: 2 },
    });
    // Only this guest's purchases of the open shift.
    expect(seat.guest?.purchases).toEqual([
      {
        at: '2026-11-10T06:00:00.000Z',
        title: 'Red Bull 0,25',
        category: 'Энергетики',
        quantity: 2,
        sum: 240,
      },
    ]);
    // The club view does not carry guests.
    const view = await service.get('store-kh', user, NOW);
    expect(JSON.stringify(view)).not.toContain('501');
  });

  it('shows only the session to a role without the guests section', async () => {
    const manager: AuthenticatedUser = {
      ...user,
      role: UserRole.STANDARDS_MANAGER,
      permissions: ['view_club_scheme'],
    };
    const seat = await service.getSeat('store-kh', 17, manager, NOW);

    expect(seat.guestAccess).toBe('NO_CAPABILITY');
    expect(seat.session?.tariff).toBe('3 часа');
    expect(seat.guest).toBeNull();
    expect(seat.newGuest).toBeNull();
    expect(prisma.guest.findFirst).not.toHaveBeenCalled();
    expect(guests.getGuest).not.toHaveBeenCalled();
    expect(client.getDiagnosticEndpoint).not.toHaveBeenCalled();
  });

  describe('game completions («Подробнее»)', () => {
    const reward = (overrides: Record<string, unknown>) => ({
      id: 'reward-1',
      guestId: null,
      qualifiedAt: new Date('2026-11-10T07:40:00.000Z'),
      status: 'PENDING',
      source: 'MISSION',
      rewardType: 'BONUS_BALANCE',
      rewardAmount: new Prisma.Decimal(500),
      rewardLabel: '500 бонусов на баланс',
      rewardRarityLabel: null,
      paidAt: null,
      expiresAt: null,
      claimExpiresAt: null,
      note: null,
      profile: null,
      mission: null,
      lootBox: null,
      season: null,
      ...overrides,
    });

    beforeEach(() => {
      prisma.store.findFirst.mockImplementation(
        ({ select }: { select: Record<string, unknown> }) =>
          Promise.resolve(select.name ? { name: '1337-Пушкинская' } : store),
      );
      prisma.guestGameReward.findMany = jest.fn().mockResolvedValue([
        reward({
          id: 'reward-mission',
          guestId: 'guest-501',
          mission: {
            name: '7 ДНЕЙ',
            missionType: 'VISIT_STREAK',
            triggerKind: 'CHECK_IN',
            conditions: {
              presentation: { description: 'Приходи 7 дней подряд' },
            },
          },
        }),
        reward({
          id: 'reward-case',
          qualifiedAt: new Date('2026-11-10T07:00:00.000Z'),
          status: 'PAID',
          paidAt: new Date('2026-11-10T07:05:00.000Z'),
          source: 'LOOT_BOX',
          rewardLabel: '100 бонусов',
          rewardAmount: new Prisma.Decimal(100),
          rewardRarityLabel: 'Редкая',
          profile: {
            guestId: null,
            displayName: 'Пётр',
            contactMasked: '+7 *** ***-12-34',
          },
          lootBox: { name: 'КЕЙС «WEEKEND»', triggerKind: 'MANUAL_OPEN' },
        }),
      ]);
      guests.floorPlanGuestContacts = jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['guest-501', { name: 'Иванов Иван', phone: '+79120000000' }],
          ]),
        );
      service = new StoreFloorPlanLiveService(
        prisma as never,
        scope as never,
        settings as never,
        client as never,
        guests as never,
      );
    });

    it('lists the rewards of the open shift with the guest', async () => {
      const list = await service.getGameCompletions('store-kh', user, NOW);

      const [query] = prisma.guestGameReward.findMany!.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(query.where).toEqual({
        tenantId: 'tenant-demo',
        storeId: 'store-kh',
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        qualifiedAt: {
          gte: new Date('2026-11-10T05:00:00.000Z'),
          lte: NOW,
        },
      });
      expect(list).toMatchObject({
        storeId: 'store-kh',
        storeName: '1337-Пушкинская',
        timeZone: TZ,
        period: 'SHIFT',
        since: '2026-11-10T05:00:00.000Z',
        guestAccess: 'AVAILABLE',
        truncated: false,
      });
      expect(guests.floorPlanGuestContacts).toHaveBeenCalledWith(
        'tenant-demo',
        ['guest-501'],
      );
      expect(list.items).toEqual([
        {
          id: 'reward-mission',
          qualifiedAt: '2026-11-10T07:40:00.000Z',
          kind: 'MISSION',
          triggerKind: 'CHECK_IN',
          title: '7 ДНЕЙ',
          description: 'Приходи 7 дней подряд',
          reward: {
            label: '500 бонусов на баланс',
            type: 'BONUS_BALANCE',
            amount: 500,
            status: 'PENDING',
            paidAt: null,
            expiresAt: null,
          },
          guest: {
            id: 'guest-501',
            name: 'Иванов Иван',
            phone: '+79120000000',
          },
        },
        {
          id: 'reward-case',
          qualifiedAt: '2026-11-10T07:00:00.000Z',
          kind: 'CASE',
          triggerKind: 'MANUAL_OPEN',
          title: 'КЕЙС «WEEKEND»',
          description: 'Выпало из кейса · Редкая',
          reward: {
            label: '100 бонусов',
            type: 'BONUS_BALANCE',
            amount: 100,
            status: 'PAID',
            paidAt: '2026-11-10T07:05:00.000Z',
            expiresAt: null,
          },
          guest: { id: null, name: 'Пётр', phone: '+7 *** ***-12-34' },
        },
      ]);
    });

    it('hides guest names and phones from a role without guests', async () => {
      const manager: AuthenticatedUser = {
        ...user,
        role: UserRole.STANDARDS_MANAGER,
        permissions: ['view_club_scheme'],
      };
      const list = await service.getGameCompletions('store-kh', manager, NOW);

      expect(list.guestAccess).toBe('NO_CAPABILITY');
      expect(list.items.map((item) => item.guest)).toEqual([null, null]);
      expect(guests.floorPlanGuestContacts).not.toHaveBeenCalled();
      expect(JSON.stringify(list)).not.toContain('Пётр');
    });
  });

  it('has no session for a free computer', async () => {
    const seat = await service.getSeat('store-kh', 40, user, NOW);

    expect(seat).toEqual({
      storeId: 'store-kh',
      number: 40,
      busy: false,
      session: null,
      guestAccess: 'AVAILABLE',
      guest: null,
      newGuest: null,
    });
  });

  it('names a guest who has no card yet from Langame', async () => {
    prisma.guest.findFirst.mockResolvedValue(null);
    const seat = await service.getSeat('store-kh', 17, user, NOW);

    expect(seat.guest).toBeNull();
    expect(guests.getGuest).not.toHaveBeenCalled();
    expect(client.getDiagnosticEndpoint).toHaveBeenCalledWith(
      'https://46.langamepro.ru/public_api',
      expect.any(String),
      '/guests/501',
    );
    expect(seat.newGuest?.displayName).toBe('Новиков Пётр');
    expect(seat.newGuest?.purchases.length).toBeGreaterThan(0);
    // The phone of the Langame card is not passed on.
    expect(JSON.stringify(seat)).not.toContain('7999');

    // The name is remembered between polls.
    await service.getSeat('store-kh', 17, user, NOW);
    expect(client.getDiagnosticEndpoint).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when Langame does not name the new guest', async () => {
    prisma.guest.findFirst.mockResolvedValue(null);
    client.getDiagnosticEndpoint.mockRejectedValue(new Error('timeout'));
    client.listTariffTypeGroups.mockRejectedValue(new Error('timeout'));
    const seat = await service.getSeat('store-kh', 17, user, NOW);

    expect(seat.busy).toBe(true);
    expect(seat.session?.tariff).toBeNull();
    expect(seat.guest).toBeNull();
    expect(seat.newGuest).toMatchObject({ displayName: null });
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
