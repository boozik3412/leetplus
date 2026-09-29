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
    store: {
      findMany: storeFindMany,
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
    },
  };
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
    permissions: ['view_support_tickets', 'manage_support_tickets'],
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
    await withoutCapability.service.getReport(networkActor);
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
      permissions: ['view_support_tickets'],
    });
    expect(
      storeScoped.staffNotificationFindMany.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
  });

  it('keeps the support restriction on acknowledge writes', async () => {
    const harness = createHarness();

    await harness.service.acknowledge(networkActor, 'notification-a1');

    expect(
      harness.staffNotificationFindFirst.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
    expect(
      harness.staffNotificationUpdate.mock.calls[0]?.[0].where?.NOT,
    ).toEqual([{ sourceType: 'SUPPORT_TICKET' }]);
  });
});
