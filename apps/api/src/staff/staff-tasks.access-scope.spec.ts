import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StaffTasksService } from './staff-tasks.service';

describe('StaffTasksService access scope', () => {
  type QueryArgs = { where?: unknown };
  type QueryMock<T> = jest.MockedFunction<(args: QueryArgs) => Promise<T>>;

  const tenantId = 'tenant-1';
  const allowedStoreId = 'store-1';
  const foreignStoreId = 'store-2';

  function actor(
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: 'user-1',
      email: 'user-1@example.com',
      fullName: 'Scoped manager',
      role: UserRole.CLUB_MANAGER,
      tenantId,
      tenantSlug: 'demo',
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      allowedStoreIds: [allowedStoreId],
      permissions: ['view_staff_tasks'],
      ...overrides,
    };
  }

  function createService(prisma: object) {
    const tenantContextService = new TenantContextService();
    const staffTeamChatService = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };

    return new StaffTasksService(
      prisma as never,
      tenantContextService,
      staffTeamChatService as never,
      new AccessScopeService(),
      {
        bindPendingResourceAttachments: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  }

  function expectScopedTaskWhere(value: unknown) {
    const serialized = JSON.stringify(value);

    expect(serialized).toContain(`"storeId":{"in":["${allowedStoreId}"]}`);
    expect(serialized).toContain('"shiftId":null');
    expect(serialized).toContain(
      `"shift":{"is":{"storeId":{"in":["${allowedStoreId}"]}}}`,
    );
    expect(serialized).toContain('"assignedToUserId":"user-1"');
    expect(serialized).toContain('"observers":{"some":{"userId":"user-1"}}');
  }

  function expectScopedUserWhere(value: unknown, userId: string) {
    const serialized = JSON.stringify(value);

    expect(serialized).toContain(`"tenantId":"${tenantId}"`);
    expect(serialized).toContain('"isActive":true');
    expect(serialized).toContain('"isPlatformAdmin":false');
    expect(serialized).toContain('"accessScope":"STORES"');
    expect(serialized).toContain(`"some":{"storeId":"${allowedStoreId}"}`);
    expect(serialized).toContain(
      `"none":{"storeId":{"notIn":["${allowedStoreId}"]}}`,
    );
    expect(serialized).toContain(`"id":{"in":["${userId}"]}`);
  }

  it('applies one visibility predicate to rows, summary, quick views and groups', async () => {
    const staffTaskFindMany: QueryMock<unknown[]> = jest
      .fn()
      .mockResolvedValue([]);
    const userFindMany: QueryMock<unknown[]> = jest.fn().mockResolvedValue([
      {
        id: 'user-1',
        email: 'user-1@example.com',
        fullName: 'Scoped manager',
        role: UserRole.CLUB_MANAGER,
        staffMember: {
          store: {
            id: allowedStoreId,
            name: 'Allowed club',
            isActive: true,
          },
        },
        storeAccesses: [
          {
            store: {
              id: allowedStoreId,
              name: 'Allowed club',
              isActive: true,
            },
          },
          {
            store: {
              id: foreignStoreId,
              name: 'Foreign club',
              isActive: true,
            },
          },
        ],
      },
    ]);
    const storeFindMany: QueryMock<unknown[]> = jest
      .fn()
      .mockResolvedValue([
        { id: allowedStoreId, name: 'Allowed club', isActive: true },
      ]);
    const service = createService({
      staffTask: { findMany: staffTaskFindMany },
      user: { findMany: userFindMany },
      store: { findMany: storeFindMany },
    });

    const report = await service.getTasks(actor(), { status: 'all' });

    expect(staffTaskFindMany).toHaveBeenCalledTimes(5);
    staffTaskFindMany.mock.calls.forEach(([args]) => {
      expectScopedTaskWhere(args.where);
    });
    expect(userFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      storeAccesses: {
        some: {
          storeId: { in: [allowedStoreId] },
        },
        none: { storeId: { notIn: [allowedStoreId] } },
      },
    });
    expect(storeFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
      id: { in: [allowedStoreId] },
    });
    expect(report.users[0]?.stores).toEqual([
      { id: allowedStoreId, name: 'Allowed club', isActive: true },
    ]);
  });

  it('applies the same visibility predicate to export', async () => {
    const staffTaskFindMany: QueryMock<unknown[]> = jest
      .fn()
      .mockResolvedValue([]);
    const service = createService({
      staffTask: { findMany: staffTaskFindMany },
    });

    await service.exportTasks(actor(), { status: 'all', format: 'csv' });

    expect(staffTaskFindMany).toHaveBeenCalledTimes(2);
    staffTaskFindMany.mock.calls.forEach(([args]) => {
      expectScopedTaskWhere(args.where);
    });
  });

  it.each(['list', 'export'] as const)(
    'rejects an explicit foreign store filter for %s',
    async (operation) => {
      const staffTaskFindMany = jest.fn();
      const service = createService({
        staffTask: { findMany: staffTaskFindMany },
      });

      const result =
        operation === 'list'
          ? service.getTasks(actor(), { storeId: foreignStoreId })
          : service.exportTasks(actor(), { storeId: foreignStoreId });

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(staffTaskFindMany).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for a direct update outside the visibility predicate', async () => {
    const staffTaskFindFirst: QueryMock<null> = jest
      .fn()
      .mockResolvedValue(null);
    const service = createService({
      staffTask: { findFirst: staffTaskFindFirst },
    });

    await expect(
      service.updateTask(actor(), 'foreign-task', { title: 'Hidden task' }),
    ).rejects.toThrow(NotFoundException);
    const where = staffTaskFindFirst.mock.calls[0]?.[0];
    expectScopedTaskWhere(where);
    expect(
      JSON.stringify(where).match(
        new RegExp(`"storeId":\\{"in":\\["${allowedStoreId}"\\]\\}`, 'g'),
      )?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('returns 404 for a direct comment outside the visibility predicate', async () => {
    const staffTaskFindFirst: QueryMock<null> = jest
      .fn()
      .mockResolvedValue(null);
    const service = createService({
      staffTask: { findFirst: staffTaskFindFirst },
    });

    await expect(
      service.createTaskComment(actor(), 'foreign-task', { body: 'Hidden' }),
    ).rejects.toThrow(NotFoundException);
    expectScopedTaskWhere(staffTaskFindFirst.mock.calls[0]?.[0]);
  });

  it.each([
    ['a network-level task', null],
    ['a foreign-store task', foreignStoreId],
  ])('does not let a store-scoped user create %s', async (_label, storeId) => {
    const transaction = jest.fn();
    const service = createService({
      store: {
        findFirst: jest
          .fn()
          .mockResolvedValue(storeId ? { id: storeId } : null),
      },
      $transaction: transaction,
    });

    await expect(
      service.createTask(actor(), {
        title: 'Scoped task',
        storeId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['network level', null],
    ['a foreign store', foreignStoreId],
  ])(
    'does not let a store-scoped user move a task to %s',
    async (_label, storeId) => {
      const transaction = jest.fn();
      const service = createService({
        staffTask: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'task-1',
            storeId: allowedStoreId,
            status: 'OPEN',
            assignedToUserId: 'user-1',
            labels: null,
          }),
        },
        store: {
          findFirst: jest
            .fn()
            .mockResolvedValue(storeId ? { id: storeId } : null),
        },
        $transaction: transaction,
      });

      await expect(
        service.updateTask(actor(), 'task-1', { storeId }),
      ).rejects.toThrow(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('does not let a store-scoped user assign a new task outside their stores', async () => {
    const userFindMany: QueryMock<never[]> = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn();
    const service = createService({
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      user: { findMany: userFindMany },
      $transaction: transaction,
    });

    await expect(
      service.createTask(actor(), {
        title: 'Scoped task',
        storeId: allowedStoreId,
        assignedToUserIds: ['foreign-user'],
      }),
    ).rejects.toThrow(BadRequestException);

    expectScopedUserWhere(
      userFindMany.mock.calls[0]?.[0].where,
      'foreign-user',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not let a store-scoped user add an observer outside their stores', async () => {
    const userFindMany: QueryMock<never[]> = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn();
    const service = createService({
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      user: { findMany: userFindMany },
      $transaction: transaction,
    });

    await expect(
      service.createTask(actor(), {
        title: 'Scoped task',
        storeId: allowedStoreId,
        observerUserIds: ['foreign-observer'],
      }),
    ).rejects.toThrow(BadRequestException);

    expectScopedUserWhere(
      userFindMany.mock.calls[0]?.[0].where,
      'foreign-observer',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not let a store-scoped user reassign a task outside their stores', async () => {
    const userFindMany: QueryMock<never[]> = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn();
    const service = createService({
      staffTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          storeId: allowedStoreId,
          shiftId: null,
          status: 'OPEN',
          assignedToUserId: 'user-1',
          labels: null,
        }),
      },
      user: { findMany: userFindMany },
      $transaction: transaction,
    });

    await expect(
      service.updateTask(actor(), 'task-1', {
        assignedToUserId: 'foreign-user',
      }),
    ).rejects.toThrow(BadRequestException);

    expectScopedUserWhere(
      userFindMany.mock.calls[0]?.[0].where,
      'foreign-user',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not expose a foreign-store shift through an allowed-store task', async () => {
    const transaction = jest.fn();
    const service = createService({
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      guestWorkingShift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-foreign',
          storeId: foreignStoreId,
        }),
      },
      $transaction: transaction,
    });

    await expect(
      service.createTask(actor(), {
        title: 'Scoped task',
        storeId: allowedStoreId,
        shiftId: 'shift-foreign',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires task and shift to belong to the same allowed store', async () => {
    const transaction = jest.fn();
    const service = createService({
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      guestWorkingShift: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shift-store-2',
          storeId: foreignStoreId,
        }),
      },
      $transaction: transaction,
    });

    await expect(
      service.createTask(
        actor({ allowedStoreIds: [allowedStoreId, foreignStoreId] }),
        {
          title: 'Scoped task',
          storeId: allowedStoreId,
          shiftId: 'shift-store-2',
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('revalidates existing participants with the transaction client when moving a task', async () => {
    type UserFindManyArgs = {
      where: {
        tenantId: string;
        id: { in: string[] };
      };
    };
    const currentTask = {
      id: 'task-1',
      storeId: allowedStoreId,
      shiftId: null,
      status: 'OPEN',
      assignedToUserId: 'store-1-user',
      labels: {
        assignmentMode: 'ANY_OF',
        candidateUserIds: ['store-1-candidate'],
        originalAssignedToUserIds: ['store-1-user'],
      },
      observers: [{ userId: 'store-1-observer' }],
    };
    const rootUserFindMany = jest.fn();
    const txUserFindMany: jest.MockedFunction<
      (args: UserFindManyArgs) => Promise<never[]>
    > = jest.fn().mockResolvedValue([]);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: currentTask.id }]),
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
        update: jest.fn(),
      },
      user: { findMany: txUserFindMany },
      staffTaskAuditEvent: { create: jest.fn() },
    };
    const service = createService({
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: foreignStoreId }),
      },
      user: { findMany: rootUserFindMany },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.updateTask(
        actor({ allowedStoreIds: [allowedStoreId, foreignStoreId] }),
        currentTask.id,
        { storeId: foreignStoreId },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(rootUserFindMany).not.toHaveBeenCalled();
    expect(txUserFindMany).toHaveBeenCalledTimes(1);
    const transactionUserWhere = txUserFindMany.mock.calls[0]?.[0].where;
    expect(transactionUserWhere?.tenantId).toBe(tenantId);
    expect(transactionUserWhere?.id.in).toEqual(
      expect.arrayContaining(['store-1-user', 'store-1-candidate']),
    );
    expect(tx.staffTask.update).not.toHaveBeenCalled();
  });

  it('rechecks shift and task store equality with the transaction client', async () => {
    const currentTask = {
      id: 'task-1',
      storeId: allowedStoreId,
      shiftId: null,
      status: 'OPEN',
      assignedToUserId: null,
      labels: null,
      observers: [],
    };
    const rootShiftFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'shift-race', storeId: allowedStoreId });
    const txShiftFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'shift-race', storeId: foreignStoreId });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: currentTask.id }]),
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
        update: jest.fn(),
      },
      guestWorkingShift: { findFirst: txShiftFindFirst },
      staffTaskAuditEvent: { create: jest.fn() },
    };
    const service = createService({
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
      },
      guestWorkingShift: { findFirst: rootShiftFindFirst },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.updateTask(
        actor({ allowedStoreIds: [allowedStoreId, foreignStoreId] }),
        currentTask.id,
        { shiftId: 'shift-race' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(rootShiftFindFirst).toHaveBeenCalledTimes(2);
    expect(txShiftFindFirst).toHaveBeenCalledTimes(1);
    expect(tx.staffTask.update).not.toHaveBeenCalled();
  });

  it('uses view_staff_tasks with manage alias and the same predicate for attachments', async () => {
    const taskFindFirst: QueryMock<{ id: string }> = jest
      .fn()
      .mockResolvedValue({ id: 'task-1' });
    const service = createService({});

    await expect(
      service.canReadAnyAttachmentTask(
        actor({ permissions: ['manage_staff_tasks'] }),
        ['task-1', 'task-1', '  '],
        { staffTask: { findFirst: taskFindFirst } } as never,
      ),
    ).resolves.toBe(true);

    expect(taskFindFirst).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(taskFindFirst.mock.calls[0]?.[0].where)).toContain(
      `"id":{"in":["task-1"]},"tenantId":"${tenantId}"`,
    );
    expectScopedTaskWhere(taskFindFirst.mock.calls[0]?.[0]);
  });

  it('denies attachment lookup without view_staff_tasks', async () => {
    const taskFindFirst = jest.fn();
    const service = createService({});

    await expect(
      service.canReadAnyAttachmentTask(actor({ permissions: [] }), ['task-1'], {
        staffTask: { findFirst: taskFindFirst },
      } as never),
    ).resolves.toBe(false);
    expect(taskFindFirst).not.toHaveBeenCalled();
  });
});
