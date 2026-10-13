import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { StaffNotificationsService } from './staff-notifications.service';

const tenantId = 'tenant-a';
const now = new Date('2026-07-27T10:00:00.000Z');

type TestWhereInput = {
  id?: string;
  tenantId?: string;
  AND?: TestWhereInput[];
  OR?: TestWhereInput[];
  targetUserId?: string | null;
  storeId?: { in: string[] };
  NOT?: Array<{ sourceType: string }>;
};

type FindManyArgs = {
  where?: TestWhereInput;
};

type DirectArgs = {
  where?: TestWhereInput;
};

type UpdateArgs = DirectArgs & {
  data: Record<string, unknown>;
};

type StoreFindManyArgs = {
  where?: {
    tenantId?: string;
    id?: { in: string[] };
  };
};

type NotificationFindManyMock = jest.MockedFunction<
  (args: FindManyArgs) => Promise<unknown[]>
>;
type NotificationFindFirstMock = jest.MockedFunction<
  (args: DirectArgs) => Promise<ReturnType<typeof mutationSource> | null>
>;
type NotificationUpdateMock = jest.MockedFunction<
  (args: UpdateArgs) => Promise<ReturnType<typeof notificationRow>>
>;
type StoreFindManyMock = jest.MockedFunction<
  (
    args: StoreFindManyArgs,
  ) => Promise<Array<{ id: string; name: string; isActive: boolean }>>
>;

const networkActor = {
  id: 'network-owner',
  email: 'network-owner@example.test',
  fullName: 'Network Owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const storeActor = {
  ...networkActor,
  id: 'manager-a1',
  email: 'manager-a1@example.test',
  fullName: 'A1 Manager',
  role: UserRole.MANAGER,
  accessScope: 'STORES',
  allowedStoreIds: ['a1'],
} satisfies AuthenticatedUser;

function notificationRow(id: string, storeId: string | null) {
  return {
    id,
    sourceType: 'TASK',
    sourceId: `source-${id}`,
    severity: 'WARNING',
    status: 'OPEN',
    title: `Notification ${id}`,
    message: null,
    actionLabel: null,
    actionHref: null,
    metadata: null,
    targetUser: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    store: storeId
      ? { id: storeId, name: storeId.toUpperCase(), isActive: true }
      : null,
    acknowledgedByUser: null,
    resolvedByUser: null,
  };
}

function mutationSource(id: string) {
  return {
    id,
    status: 'OPEN',
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

function createHarness(options?: {
  rows?: ReturnType<typeof notificationRow>[];
  summaryRows?: Array<{ status: string; severity: string }>;
  stores?: Array<{ id: string; name: string; isActive: boolean }>;
  directNotification?: ReturnType<typeof mutationSource> | null;
  supportTickets?: Array<Record<string, unknown>>;
  guestRewards?: Array<Record<string, unknown>>;
  handOffReward?: Record<string, unknown> | null;
  openRewardIssues?: number;
}) {
  const rows = options?.rows ?? [];
  const summaryRows = options?.summaryRows ?? [];
  const stores =
    options?.stores ??
    ['a1', 'a2'].map((id) => ({
      id,
      name: id.toUpperCase(),
      isActive: true,
    }));
  const staffNotificationFindMany: NotificationFindManyMock = jest
    .fn()
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce(summaryRows);
  const staffNotificationFindFirst: NotificationFindFirstMock = jest
    .fn()
    .mockResolvedValue(
      options?.directNotification === undefined
        ? mutationSource('notification-a1')
        : options.directNotification,
    );
  const staffNotificationUpdate: NotificationUpdateMock = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({
        ...notificationRow('notification-a1', 'a1'),
        ...data,
        updatedAt: now,
      }),
    );
  const storeFindMany: StoreFindManyMock = jest.fn().mockResolvedValue(stores);
  const prisma = {
    staffNotification: {
      findMany: staffNotificationFindMany,
      findFirst: staffNotificationFindFirst,
      update: staffNotificationUpdate,
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(options?.openRewardIssues ?? 0),
    },
    staffTask: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffChecklistRun: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffTaskRecurringRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffChatMessage: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffKnowledgeArticle: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    guestSupportTicket: {
      findMany: jest.fn().mockResolvedValue(options?.supportTickets ?? []),
    },
    guestGameReward: {
      findMany: jest.fn().mockResolvedValue(options?.guestRewards ?? []),
      findFirst: jest.fn().mockResolvedValue(options?.handOffReward ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    guestGameEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    store: {
      findMany: storeFindMany,
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
    },
  };
  Object.assign(prisma, {
    $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    ),
  });
  const tenantContextService = {
    resolve: jest.fn().mockReturnValue({
      tenantId,
      tenantSlug: 'tenant-a',
    }),
  };
  const staffOperationsDashboardService = {
    getCurrentStaffControlSignals: jest.fn().mockResolvedValue({
      dateFrom: '2026-06-28',
      dateTo: '2026-07-27',
      anomalies: [],
    }),
  };
  const service = new StaffNotificationsService(
    prisma as never,
    tenantContextService,
    staffOperationsDashboardService as never,
    new AccessScopeService(),
  );

  return {
    prisma,
    service,
    staffOperationsDashboardService,
    staffNotificationFindFirst,
    staffNotificationFindMany,
    staffNotificationUpdate,
    storeFindMany,
  };
}

describe('StaffNotificationsService AccessScope', () => {
  it('scopes STORES list, summary and store options to the persisted allow-list', async () => {
    const a1Row = notificationRow('notification-a1', 'a1');
    const harness = createHarness({
      rows: [a1Row],
      summaryRows: [{ status: 'OPEN', severity: 'WARNING' }],
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
    });

    const report = await harness.service.getReport(storeActor);

    expect(report.rows).toHaveLength(1);
    expect(report.summary).toMatchObject({ total: 1, open: 1, warning: 1 });
    expect(report.stores).toEqual([{ id: 'a1', name: 'A1', isActive: true }]);
    expect(
      harness.staffNotificationFindMany.mock.calls[0]?.[0].where,
    ).toMatchObject({
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
    expect(
      harness.staffNotificationFindMany.mock.calls[1]?.[0].where,
    ).toMatchObject({
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
    expect(harness.storeFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
      id: { in: ['a1'] },
    });
    expect(harness.prisma.staffTask.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.guestGameReward.findMany).toHaveBeenCalled();
    expect(harness.prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: { in: ['a1'] },
        }) as unknown,
      }),
    );
    expect(harness.prisma.staffNotification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: { in: ['GUEST_REWARD_ISSUE'] },
          storeId: { in: ['a1'] },
        }) as unknown,
      }),
    );
  });

  it('keeps NETWORK list and options tenant-wide and refreshes current signals', async () => {
    const networkRow = notificationRow('notification-network', null);
    const harness = createHarness({
      rows: [networkRow],
      summaryRows: [{ status: 'OPEN', severity: 'INFO' }],
    });

    const report = await harness.service.getReport(networkActor);

    expect(report.rows[0]?.store).toBeNull();
    expect(harness.prisma.staffTask.findMany).toHaveBeenCalled();
    expect(
      harness.staffOperationsDashboardService.getCurrentStaffControlSignals,
    ).toHaveBeenCalledWith(tenantId);
    expect(harness.prisma.staffNotification.updateMany).toHaveBeenCalled();
    expect(harness.storeFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
    });

    const reportWhere =
      harness.staffNotificationFindMany.mock.calls[0]?.[0].where;
    expect(reportWhere?.AND).toEqual([
      { OR: [{ targetUserId: null }, { targetUserId: networkActor.id }] },
    ]);
  });

  it('returns 403 for an explicit foreign store filter', async () => {
    const harness = createHarness();

    await expect(
      harness.service.getReport(storeActor, { storeId: 'a2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.staffNotificationFindMany).not.toHaveBeenCalled();
    expect(harness.prisma.staffTask.findMany).not.toHaveBeenCalled();
  });

  it('acknowledges an allowed-store notification with scope on read and write', async () => {
    const harness = createHarness();

    await harness.service.acknowledge(storeActor, 'notification-a1');

    expect(
      harness.staffNotificationFindFirst.mock.calls[0]?.[0].where,
    ).toMatchObject({
      id: 'notification-a1',
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].where,
    ).toMatchObject({
      id: 'notification-a1',
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
  });

  it('returns 404 without mutating an untargeted notification from A2', async () => {
    const harness = createHarness({ directNotification: null });

    await expect(
      harness.service.resolve(storeActor, 'notification-a2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      harness.staffNotificationFindFirst.mock.calls[0]?.[0].where,
    ).toMatchObject({
      id: 'notification-a2',
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
    expect(harness.staffNotificationUpdate).not.toHaveBeenCalled();
  });

  it('resolves an allowed-store notification with the same scoped predicate', async () => {
    const harness = createHarness();

    await harness.service.resolve(storeActor, 'notification-a1');

    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].where,
    ).toMatchObject({
      id: 'notification-a1',
      tenantId,
      AND: [
        { OR: [{ targetUserId: null }, { targetUserId: storeActor.id }] },
        { storeId: { in: ['a1'] } },
      ],
    });
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].data,
    ).toMatchObject({ status: 'RESOLVED' });
  });

  it('requires NETWORK for interactive sync and keeps a separate system path', async () => {
    const storeHarness = createHarness();

    await expect(
      storeHarness.service.syncSignals(storeActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeHarness.prisma.staffTask.findMany).not.toHaveBeenCalled();

    const networkHarness = createHarness();
    const interactiveResult =
      await networkHarness.service.syncSignals(networkActor);
    expect(interactiveResult.activeSignals).toBe(0);
    expect(networkHarness.prisma.staffTask.findMany).toHaveBeenCalled();

    const systemHarness = createHarness();
    const systemResult =
      await systemHarness.service.syncTenantSignalsForSystem(tenantId);
    expect(systemResult.activeSignals).toBe(0);
    expect(systemHarness.prisma.staffTask.findMany).toHaveBeenCalled();
  });
});

describe('StaffNotificationsService support tickets', () => {
  const supportActor = {
    ...networkActor,
    id: 'support-admin',
    role: UserRole.ADMIN,
    permissions: [
      'view_support_tickets',
      'manage_support_tickets',
      'view_guest_gamification',
    ],
  } satisfies AuthenticatedUser;
  const rewardActor = {
    ...networkActor,
    permissions: ['view_guest_gamification'],
  } satisfies AuthenticatedUser;

  it('turns a NEW guest ticket into a signal that escalates after a day', async () => {
    const harness = createHarness({
      directNotification: null,
      supportTickets: [
        {
          id: 'ticket-old',
          ticketNumber: 'LP-BUG-571075E9',
          topic: 'LOOT_BOXES_AND_REWARDS',
          description: 'Не дали кейс   за 100 минут',
          storeId: 'a1',
          createdAt: new Date(Date.now() - 30 * 3600000),
          store: { name: 'A1' },
        },
        {
          id: 'ticket-fresh',
          ticketNumber: 'LP-BUG-01826E9C',
          topic: 'GAME_MODULE',
          description: 'Сбрасываются чекины',
          storeId: 'a2',
          createdAt: new Date(),
          store: { name: 'A2' },
        },
      ],
    });

    const result = await harness.service.syncTenantSignalsForSystem(tenantId);

    expect(result.activeSignals).toBe(2);
    expect(harness.prisma.guestSupportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, status: 'NEW' } }),
    );
    const created = harness.prisma.staffNotification.create.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    expect(created).toEqual([
      expect.objectContaining({
        sourceType: 'SUPPORT_TICKET',
        sourceId: 'ticket-old',
        dedupeKey: 'support-ticket:ticket-old:new',
        severity: 'CRITICAL',
        storeId: 'a1',
        targetUserId: null,
        title: 'Новое обращение гостя LP-BUG-571075E9: Лутбоксы и награды',
        message:
          'Источник: Поддержка — A1\nСитуация: ждёт ответа 30 часов\nНе дали кейс за 100 минут',
        actionLabel: 'Открыть обращение',
        actionHref: '/support?status=active&search=LP-BUG-571075E9',
      }),
      expect.objectContaining({
        sourceId: 'ticket-fresh',
        severity: 'WARNING',
        message:
          'Источник: Поддержка — A2\nСитуация: обращение только что поступило\nСбрасываются чекины',
      }),
    ]);
  });

  it('shows support signals only to staff who can open the support queue', async () => {
    const withoutCapability = createHarness();
    await withoutCapability.service.getReport(rewardActor);
    expect(
      withoutCapability.staffNotificationFindMany.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
    expect(
      withoutCapability.staffNotificationFindMany.mock.calls[1]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);

    const withCapability = createHarness();
    await withCapability.service.getReport(supportActor);
    expect(
      withCapability.staffNotificationFindMany.mock.calls[0]?.[0].where,
    ).not.toHaveProperty('NOT');

    const storeScoped = createHarness();
    await storeScoped.service.getReport({
      ...storeActor,
      permissions: ['view_support_tickets', 'approve_guest_game_rewards'],
    });
    expect(
      storeScoped.staffNotificationFindMany.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
  });

  it('keeps the support restriction on acknowledge writes', async () => {
    const harness = createHarness();

    await harness.service.acknowledge(rewardActor, 'notification-a1');

    expect(
      harness.staffNotificationFindFirst.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
  });
});

describe('StaffNotificationsService guest reward hand-off', () => {
  const clubAdministrator = {
    ...storeActor,
    id: 'club-admin-a1',
    role: UserRole.CLUB_ADMINISTRATOR,
    permissions: ['view_communications', 'approve_guest_game_rewards'],
  } satisfies AuthenticatedUser;

  function claimedReward(overrides: Record<string, unknown> = {}) {
    return {
      id: 'reward-drink',
      rewardType: 'BATTLE_PASS_REWARD',
      rewardLabel: 'Энергетик Adrenaline RUSH',
      storeId: 'a1',
      deliveryRequestedAt: new Date('2026-10-13T09:05:00.000Z'),
      store: { name: 'A1' },
      profile: { displayName: 'Данил', contactMasked: '***0086' },
      guest: null,
      season: { name: 'GAMEPASS vol.1' },
      mission: null,
      lootBox: null,
      walletItems: [{ storeId: 'a1', store: { name: 'A1' } }],
      ...overrides,
    };
  }

  it('asks the club to hand over a prize the guest accepted in the wallet', async () => {
    const harness = createHarness({
      directNotification: null,
      guestRewards: [
        claimedReward(),
        claimedReward({
          id: 'reward-bonus',
          rewardType: 'BONUS_BALANCE',
          rewardLabel: '100 бонусов',
        }),
      ],
    });

    const result = await harness.service.syncTenantSignalsForSystem(tenantId);

    expect(result.activeSignals).toBe(1);
    expect(harness.prisma.guestGameReward.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          status: 'APPROVED',
          paidAt: null,
          claimRequired: true,
          walletItems: {
            some: { tenantId, kind: 'REWARD', status: 'CLAIMED' },
          },
        }) as unknown,
      }),
    );
    const created = harness.prisma.staffNotification.create.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    expect(created).toEqual([
      expect.objectContaining({
        sourceType: 'GUEST_REWARD_ISSUE',
        sourceId: 'reward-drink',
        dedupeKey: 'guest-reward:reward-drink:issue',
        severity: 'WARNING',
        status: 'OPEN',
        storeId: 'a1',
        targetUserId: null,
        title: 'Выдайте награду гостю: Энергетик Adrenaline RUSH',
        message: [
          'Гость: Данил, ***0086',
          'Приз: Энергетик Adrenaline RUSH',
          'Источник: Battle Pass — GAMEPASS vol.1',
          'Клуб: A1',
          'Гость забрал награду в кошельке: 13.10, 14:05',
          'LeetPlus не выдаёт этот приз автоматически: передайте его гостю и нажмите «Выдано».',
        ].join('\n'),
        actionLabel: null,
        actionHref: null,
      }),
    ]);
  });

  it('refreshes reward hand-offs for club staff and shows them only to reward staff', async () => {
    const harness = createHarness({
      directNotification: null,
      guestRewards: [claimedReward()],
    });

    await harness.service.getReport(clubAdministrator);

    expect(harness.prisma.staffTask.findMany).not.toHaveBeenCalled();
    const created = harness.prisma.staffNotification.create.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    expect(created).toEqual([
      expect.objectContaining({ sourceType: 'GUEST_REWARD_ISSUE' }),
    ]);
    expect(
      harness.staffNotificationFindMany.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);

    const buyer = createHarness();
    await buyer.service.getReport({
      ...storeActor,
      role: UserRole.BUYER,
      permissions: ['view_communications'],
    });
    expect(
      buyer.staffNotificationFindMany.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([
      { sourceType: 'SUPPORT_TICKET' },
      { sourceType: 'GUEST_REWARD_ISSUE' },
    ]);
  });

  it('counts open hand-offs for the sidebar badge after refreshing them', async () => {
    const harness = createHarness({
      directNotification: null,
      guestRewards: [claimedReward()],
      openRewardIssues: 3,
    });

    await expect(
      harness.service.getSummary(clubAdministrator),
    ).resolves.toEqual({ rewardIssues: 3 });
    expect(harness.prisma.staffTask.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.staffNotification.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId,
        sourceType: 'GUEST_REWARD_ISSUE',
        status: { not: 'RESOLVED' },
        AND: [
          {
            OR: [
              { targetUserId: null },
              { targetUserId: clubAdministrator.id },
            ],
          },
          { storeId: { in: ['a1'] } },
        ],
      }) as unknown,
    });

    const buyer = createHarness({ guestRewards: [claimedReward()] });
    await expect(
      buyer.service.getSummary({
        ...storeActor,
        role: UserRole.BUYER,
        permissions: ['view_communications'],
      }),
    ).resolves.toEqual({ rewardIssues: 0 });
    expect(buyer.prisma.guestGameReward.findMany).not.toHaveBeenCalled();
  });

  it('skips rewriting a hand-off signal that did not change', async () => {
    const harness = createHarness({ guestRewards: [claimedReward()] });
    await harness.service.syncTenantSignalsForSystem(tenantId);
    const created = harness.prisma.staffNotification.create.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    expect(created).toHaveLength(0);
    const draft = (
      harness.prisma.staffNotification.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >
    )[0]?.[0].data;
    expect(draft).toBeDefined();

    const second = createHarness({ guestRewards: [claimedReward()] });
    second.staffNotificationFindFirst.mockResolvedValue({
      id: 'existing',
      ...draft,
    } as never);
    await second.service.syncTenantSignalsForSystem(tenantId);
    expect(second.prisma.staffNotification.update).not.toHaveBeenCalled();
  });

  function rewardNotification() {
    return {
      ...mutationSource('notification-a1'),
      sourceType: 'GUEST_REWARD_ISSUE',
      sourceId: 'reward-drink',
      storeId: 'a1',
    };
  }

  it('marks the prize as handed over when staff press «Выдано»', async () => {
    const harness = createHarness({
      directNotification: rewardNotification(),
      handOffReward: {
        id: 'reward-drink',
        rewardType: 'BATTLE_PASS_REWARD',
        rewardLabel: 'Энергетик Adrenaline RUSH',
        rewardCode: 'LP-1A2B3C4D',
        approvedByUserId: null,
        evidence: null,
        profileId: 'profile-1',
        guestId: null,
        lootBoxId: null,
        missionId: null,
        seasonId: 'season-1',
      },
    });

    await harness.service.resolve(clubAdministrator, 'notification-a1');

    expect(harness.prisma.guestGameReward.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reward-drink',
          tenantId,
          status: 'APPROVED',
          paidAt: null,
        }) as unknown,
      }),
    );
    expect(harness.prisma.guestGameReward.update).toHaveBeenCalledWith({
      where: { id: 'reward-drink' },
      data: expect.objectContaining({
        status: 'PAID',
        approvedByUserId: clubAdministrator.id,
        evidence: expect.objectContaining({
          source: 'staff_notification_handoff',
          redeemedByUserId: clubAdministrator.id,
          notificationId: 'notification-a1',
          storeId: 'a1',
        }) as unknown,
      }) as unknown,
    });
    expect(harness.prisma.guestGameEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'REWARD_PAID',
        profileId: 'profile-1',
        seasonId: 'season-1',
        createdByUserId: clubAdministrator.id,
        note: 'Энергетик Adrenaline RUSH · LP-1A2B3C4D · выдано по уведомлению',
      }) as unknown,
    });
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].data,
    ).toMatchObject({ status: 'RESOLVED' });
  });

  it('only closes the notification when the reward is no longer waiting', async () => {
    const harness = createHarness({
      directNotification: rewardNotification(),
      handOffReward: null,
    });

    await harness.service.resolve(clubAdministrator, 'notification-a1');

    expect(harness.prisma.guestGameReward.update).not.toHaveBeenCalled();
    expect(harness.prisma.guestGameEvent.create).not.toHaveBeenCalled();
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].data,
    ).toMatchObject({ status: 'RESOLVED' });
  });

  it('refuses to hand over a prize without the reward capability', async () => {
    const harness = createHarness({
      directNotification: rewardNotification(),
    });

    await expect(
      harness.service.resolve(
        { ...networkActor, permissions: ['view_guest_gamification'] },
        'notification-a1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.staffNotificationUpdate).not.toHaveBeenCalled();
  });
});
