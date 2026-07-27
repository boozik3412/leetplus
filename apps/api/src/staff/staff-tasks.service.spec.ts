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

describe('StaffTasksService status review workflow', () => {
  const tenantId = 'tenant-1';
  const now = new Date('2026-06-08T10:00:00.000Z');
  type StaffTaskUpdateArgs = {
    data: {
      status?: string;
      completedAt?: Date | null;
    };
  };
  type StaffTaskUpdateMock = jest.MockedFunction<
    (args: StaffTaskUpdateArgs) => void
  >;
  type StaffTaskCommentCreateArgs = {
    data: {
      taskId: string;
      evidenceUrl: string | null;
    };
  };
  type StaffTaskCommentCreateMock = jest.MockedFunction<
    (args: StaffTaskCommentCreateArgs) => void
  >;
  type TestWhereInput = {
    AND?: TestWhereInput[];
    status?: unknown;
  };
  type StaffTaskFindManyArgs = {
    where?: TestWhereInput;
  };
  type TestStatusFilter = {
    in?: string[];
    notIn?: string[];
  };

  function actor(
    role: UserRole,
    id = `${role.toLowerCase()}-1`,
  ): AuthenticatedUser {
    return {
      id,
      email: `${id}@example.com`,
      fullName: null,
      role,
      tenantId,
      tenantSlug: 'demo',
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
      permissions: ['manage_staff_tasks'],
    };
  }

  function taskRow(
    status: string,
    assignedToUserId: string | null = 'admin-1',
    labels: Record<string, unknown> | null = null,
  ) {
    return {
      id: 'task-1',
      tenantId,
      storeId: null,
      shiftId: null,
      sourceTemplateId: null,
      sourceRecurringRuleId: null,
      createdByUserId: null,
      assignedToUserId,
      title: 'Проверить полки',
      description: null,
      type: 'ONE_TIME',
      status,
      priority: 'NORMAL',
      dueAt: null,
      completedAt: status === 'DONE' ? now : null,
      labels,
      checklist: null,
      createdAt: now,
      updatedAt: now,
      store: null,
      shift: null,
      createdByUser: null,
      assignedToUser: assignedToUserId
        ? {
            id: assignedToUserId,
            email: `${assignedToUserId}@example.com`,
            fullName: null,
            role: UserRole.CLUB_ADMINISTRATOR,
          }
        : null,
      observers: [],
      comments: [],
      auditEvents: [],
    };
  }

  function createService(
    currentStatus: string,
    assignedToUserId: string | null = 'admin-1',
    labels: Record<string, unknown> | null = null,
  ) {
    const currentTask = {
      id: 'task-1',
      storeId: null,
      shiftId: null,
      status: currentStatus,
      assignedToUserId,
      labels,
      observers: [],
    };
    const responseTask = taskRow(currentStatus, assignedToUserId, labels);
    const userFindMany = jest.fn(
      (args: { where?: { id?: { in?: string[] } } }) =>
        args.where?.id?.in?.map((id) => ({ id })) ?? [],
    );
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: currentTask.id }]),
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
        update: jest.fn() as StaffTaskUpdateMock,
      },
      staffTaskComment: {
        create: jest.fn() as StaffTaskCommentCreateMock,
      },
      staffTaskAuditEvent: {
        create: jest.fn(),
      },
      user: {
        findMany: userFindMany,
      },
    };
    const prisma = {
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
      },
      user: {
        findMany: userFindMany,
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          callback(tx),
        ),
    };
    const tenantContextService = new TenantContextService();
    const staffTeamChatService = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };
    const staffAttachmentBindingsService = {
      bindPendingResourceAttachments: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService,
      staffTeamChatService as never,
      new AccessScopeService(),
      staffAttachmentBindingsService as never,
    );

    (
      service as unknown as {
        fetchTaskOrThrow: jest.Mock;
      }
    ).fetchTaskOrThrow = jest.fn().mockResolvedValue(responseTask);

    return { prisma, service, staffAttachmentBindingsService, tx };
  }

  function createTaskPolicyService(
    users: Array<{
      id: string;
      role: UserRole;
      storeAccesses?: Array<{ storeId: string }>;
    }>,
  ) {
    const usersById = new Map(users.map((user) => [user.id, user]));
    const findFirst = jest.fn(
      (args: {
        where?: { id?: string };
        select?: { role?: boolean; storeAccesses?: unknown };
      }) => {
        const userId = args.where?.id;
        const found = userId ? usersById.get(userId) : null;

        if (!found) {
          return Promise.resolve(null);
        }

        return Promise.resolve(
          args.select?.storeAccesses
            ? {
                id: found.id,
                role: found.role,
                storeAccesses: found.storeAccesses ?? [],
              }
            : args.select?.role
              ? { id: found.id, role: found.role }
              : { id: found.id },
        );
      },
    );
    const findMany = jest.fn(
      (args: {
        where?: { id?: { in?: string[] } };
        select?: { role?: boolean; storeAccesses?: unknown };
      }) => {
        const ids = args.where?.id?.in ?? [];
        const found = ids
          .map((id) => usersById.get(id))
          .filter(
            (
              user,
            ): user is {
              id: string;
              role: UserRole;
              storeAccesses?: Array<{ storeId: string }>;
            } => Boolean(user),
          );

        return Promise.resolve(
          found.map((user) =>
            args.select?.storeAccesses
              ? {
                  id: user.id,
                  role: user.role,
                  storeAccesses: user.storeAccesses ?? [],
                }
              : args.select?.role
                ? { id: user.id, role: user.role }
                : { id: user.id },
          ),
        );
      },
    );
    const createTask = jest.fn(
      (args: { data: { status?: string; completedAt?: Date | null } }) => {
        void args;
        return Promise.resolve({ id: 'task-created' });
      },
    );
    const tx = {
      staffTask: {
        create: createTask,
      },
      staffTaskAuditEvent: {
        create: jest.fn(),
      },
      staffTaskObserver: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      user: { findFirst, findMany },
    };
    const responseTask = {
      ...taskRow('OPEN', 'admin-2'),
      id: 'task-created',
      assignedToUser: {
        id: 'admin-2',
        email: 'admin-2@example.com',
        fullName: null,
        role: UserRole.CLUB_ADMINISTRATOR,
      },
    };
    const prisma = {
      user: { findFirst, findMany },
      store: {
        findFirst: jest.fn(({ where }: { where?: { id?: string } }) =>
          where?.id ? Promise.resolve({ id: where.id }) : Promise.resolve(null),
        ),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          callback(tx),
        ),
    };
    const tenantContextService = new TenantContextService();
    const staffTeamChatService = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService,
      staffTeamChatService as never,
      new AccessScopeService(),
      {
        bindPendingResourceAttachments: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    (
      service as unknown as {
        fetchTaskOrThrow: jest.Mock;
      }
    ).fetchTaskOrThrow = jest.fn().mockResolvedValue(responseTask);

    return { prisma, service, tx };
  }

  function expectTaskStatusUpdate(
    tx: { staffTask: { update: StaffTaskUpdateMock } },
    status: string,
    completedAt: 'date' | null,
  ) {
    const data = tx.staffTask.update.mock.calls.at(-1)?.[0].data;

    expect(data?.status).toBe(status);

    if (completedAt === 'date') {
      expect(data?.completedAt).toBeInstanceOf(Date);
    } else {
      expect(data?.completedAt).toBeNull();
    }
  }

  function hasStatusFilter(args: StaffTaskFindManyArgs, key: 'in' | 'notIn') {
    const filter = findStatusFilter(args.where);

    return key === 'in' ? Boolean(filter?.in) : Boolean(filter?.notIn);
  }

  function findStatusFilter(where?: TestWhereInput): TestStatusFilter | null {
    if (isStatusFilter(where?.status)) {
      return where.status;
    }

    for (const child of where?.AND ?? []) {
      const nested = findStatusFilter(child);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  function isStatusFilter(value: unknown): value is TestStatusFilter {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  it('keeps active tasks above closed tasks in the all statuses list', async () => {
    const activeTask = {
      ...taskRow('IN_PROGRESS', 'admin-1'),
      id: 'task-active',
    };
    const closedTask = {
      ...taskRow('DONE', 'admin-1'),
      id: 'task-closed',
    };
    const staffTaskFindMany = jest.fn((args: StaffTaskFindManyArgs = {}) => {
      if (hasStatusFilter(args, 'notIn')) {
        return Promise.resolve([activeTask]);
      }

      if (hasStatusFilter(args, 'in')) {
        return Promise.resolve([closedTask]);
      }

      return Promise.resolve([]);
    });
    const prisma = {
      staffTask: { findMany: staffTaskFindMany },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      store: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const tenantContextService = new TenantContextService();
    const staffTeamChatService = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService,
      staffTeamChatService as never,
      new AccessScopeService(),
      {
        bindPendingResourceAttachments: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    const report = await service.getTasks(actor(UserRole.CLUB_MANAGER), {
      status: 'all',
      sort: 'dueAt',
      pageSize: '200',
    });

    expect(report.rows.map((row) => row.id)).toEqual([
      'task-active',
      'task-closed',
    ]);
  });

  it('requires confirmation when an administrator creates a task', async () => {
    const { prisma, service } = createTaskPolicyService([
      { id: 'admin-2', role: UserRole.CLUB_ADMINISTRATOR },
    ]);

    await expect(
      service.createTask(actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'), {
        title: 'Проверить кассу',
        assignedToUserId: 'admin-2',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow an administrator to assign a task above administrator roles', async () => {
    const { prisma, service } = createTaskPolicyService([
      { id: 'manager-1', role: UserRole.CLUB_MANAGER },
      { id: 'senior-1', role: UserRole.SENIOR_ADMINISTRATOR },
    ]);

    await expect(
      service.createTask(actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'), {
        title: 'Проверить кассу',
        assignedToUserId: 'manager-1',
        observerUserIds: ['senior-1'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow an administrator to confirm a task through owner roles', async () => {
    const { prisma, service } = createTaskPolicyService([
      { id: 'admin-2', role: UserRole.CLUB_ADMINISTRATOR },
      { id: 'owner-1', role: UserRole.OWNER },
    ]);

    await expect(
      service.createTask(actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'), {
        title: 'Проверить кассу',
        assignedToUserId: 'admin-2',
        observerUserIds: ['owner-1'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow a senior administrator to assign tasks to managers', async () => {
    const { prisma, service } = createTaskPolicyService([
      { id: 'manager-1', role: UserRole.CLUB_MANAGER },
    ]);

    await expect(
      service.createTask(actor(UserRole.SENIOR_ADMINISTRATOR, 'senior-1'), {
        title: 'Проверить кассу',
        assignedToUserId: 'manager-1',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow a senior administrator to assign tasks outside their club', async () => {
    const { prisma, service } = createTaskPolicyService([
      {
        id: 'senior-1',
        role: UserRole.SENIOR_ADMINISTRATOR,
        storeAccesses: [{ storeId: 'store-1' }],
      },
      {
        id: 'admin-2',
        role: UserRole.CLUB_ADMINISTRATOR,
        storeAccesses: [{ storeId: 'store-2' }],
      },
    ]);

    await expect(
      service.createTask(actor(UserRole.SENIOR_ADMINISTRATOR, 'senior-1'), {
        title: 'Проверить кассу',
        storeId: 'store-1',
        assignedToUserId: 'admin-2',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a senior administrator to assign tasks inside their club', async () => {
    const { service, tx } = createTaskPolicyService([
      {
        id: 'senior-1',
        role: UserRole.SENIOR_ADMINISTRATOR,
        storeAccesses: [{ storeId: 'store-1' }],
      },
      {
        id: 'admin-2',
        role: UserRole.CLUB_ADMINISTRATOR,
        storeAccesses: [{ storeId: 'store-1' }],
      },
    ]);

    await expect(
      service.createTask(actor(UserRole.SENIOR_ADMINISTRATOR, 'senior-1'), {
        title: 'Проверить кассу',
        storeId: 'store-1',
        assignedToUserId: 'admin-2',
      }),
    ).resolves.toMatchObject({ id: 'task-created' });

    expect(tx.staffTask.create).toHaveBeenCalled();
  });

  it('allows an administrator to create a task for another administrator with confirmation', async () => {
    const { service, tx } = createTaskPolicyService([
      { id: 'admin-2', role: UserRole.CLUB_ADMINISTRATOR },
      { id: 'senior-1', role: UserRole.SENIOR_ADMINISTRATOR },
    ]);

    await expect(
      service.createTask(actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'), {
        title: 'Проверить кассу',
        assignedToUserId: 'admin-2',
        observerUserIds: ['senior-1'],
      }),
    ).resolves.toMatchObject({ id: 'task-created' });

    expect(tx.staffTask.create).toHaveBeenCalled();
    expect(tx.staffTaskObserver.createMany).toHaveBeenCalledWith({
      data: [{ tenantId, taskId: 'task-created', userId: 'senior-1' }],
      skipDuplicates: true,
    });
  });

  it.each(['IN_PROGRESS', 'ON_REVIEW', 'DONE', 'CANCELED'] as const)(
    'rejects explicit %s status during ordinary task creation',
    async (status) => {
      const { prisma, service } = createTaskPolicyService([]);

      await expect(
        service.createTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), {
          title: 'New task',
          status,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('allows explicit OPEN status during ordinary task creation', async () => {
    const { service, tx } = createTaskPolicyService([]);

    await expect(
      service.createTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), {
        title: 'New task',
        status: 'OPEN',
      }),
    ).resolves.toMatchObject({ id: 'task-created' });

    const create = tx.staffTask.create.mock.calls[0]?.[0];
    expect(create.data).toMatchObject({
      status: 'OPEN',
      completedAt: null,
    });
  });

  it.each([
    'assignmentMode',
    'candidateUserIds',
    'originalAssignedToUserIds',
    'bulkTaskGroupId',
  ] as const)(
    'rejects client-owned creation input for server task label %s',
    async (key) => {
      const { prisma, service } = createTaskPolicyService([]);

      await expect(
        service.createTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), {
          title: 'Spoofed task',
          labels: {
            source: 'client',
            [key]: 'spoofed',
          },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    'assignmentMode',
    'candidateUserIds',
    'originalAssignedToUserIds',
    'bulkTaskGroupId',
  ] as const)('rejects update input for server task label %s', async (key) => {
    const { prisma, service } = createService('OPEN');

    await expect(
      service.updateTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), 'task-1', {
        labels: {
          source: 'client',
          [key]: 'spoofed',
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves canonical assignment metadata when user labels are updated', async () => {
    const assignmentLabels = {
      source: 'old-source',
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
      bulkTaskGroupId: 'task-group-1',
    };
    const { service, tx } = createService('OPEN', 'admin-1', assignmentLabels);

    await service.updateTask(
      actor(UserRole.CLUB_MANAGER, 'manager-1'),
      'task-1',
      {
        labels: {
          source: 'new-source',
          note: 'safe client metadata',
        },
      },
    );

    const update = tx.staffTask.update.mock.calls[0]?.[0] as {
      data: { labels?: unknown };
    };
    expect(update.data.labels).toEqual({
      source: 'new-source',
      note: 'safe client metadata',
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
      bulkTaskGroupId: 'task-group-1',
    });
  });

  it('keeps canonical assignment metadata when user labels are cleared', async () => {
    const assignmentLabels = {
      source: 'old-source',
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
    };
    const { service, tx } = createService('OPEN', 'admin-1', assignmentLabels);

    await service.updateTask(
      actor(UserRole.CLUB_MANAGER, 'manager-1'),
      'task-1',
      { labels: null },
    );

    const update = tx.staffTask.update.mock.calls[0]?.[0] as {
      data: { labels?: unknown };
    };
    expect(update.data.labels).toEqual({
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
    });
  });

  it('rejects single-assignee PATCH for a grouped task', async () => {
    const assignmentLabels = {
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
    };
    const { service, tx } = createService('OPEN', 'admin-1', assignmentLabels);

    await expect(
      service.updateTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), 'task-1', {
        assignedToUserId: 'admin-3',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTask.update).not.toHaveBeenCalled();
  });

  it('does not allow an ANY_OF candidate to be removed from observers', async () => {
    const assignmentLabels = {
      assignmentMode: 'ANY_OF',
      candidateUserIds: ['admin-1', 'admin-2'],
      originalAssignedToUserIds: ['admin-1', 'admin-2'],
    };
    const { service, tx } = createService('OPEN', null, assignmentLabels);

    await expect(
      service.updateTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), 'task-1', {
        observerUserIds: ['admin-1'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTask.update).not.toHaveBeenCalled();
  });

  it('does not allow an assigned administrator to approve their own task', async () => {
    const { prisma, service } = createService('ON_REVIEW', 'admin-1');

    await expect(
      service.updateTask(
        actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'),
        'task-1',
        {
          status: 'DONE',
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a club manager to approve a submitted administrator task', async () => {
    const { service, tx } = createService('ON_REVIEW', 'admin-1');

    await expect(
      service.updateTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), 'task-1', {
        status: 'DONE',
      }),
    ).resolves.toMatchObject({ id: 'task-1' });

    expectTaskStatusUpdate(tx, 'DONE', 'date');
  });

  it('allows an assignee to return their own submitted task to work', async () => {
    const { service, tx } = createService('ON_REVIEW', 'admin-1');

    await expect(
      service.updateTask(
        actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'),
        'task-1',
        {
          status: 'IN_PROGRESS',
        },
      ),
    ).resolves.toMatchObject({ id: 'task-1' });

    expectTaskStatusUpdate(tx, 'IN_PROGRESS', null);
  });

  it('does not allow direct completion before review', async () => {
    const { prisma, service } = createService('IN_PROGRESS', 'admin-1');

    await expect(
      service.updateTask(actor(UserRole.CLUB_MANAGER, 'manager-1'), 'task-1', {
        status: 'DONE',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows an assigned trainee to submit their task through a status-only comment action', async () => {
    const { service, tx } = createService('IN_PROGRESS', 'trainee-1');

    await expect(
      service.createTaskComment(
        actor(UserRole.TRAINEE, 'trainee-1'),
        'task-1',
        {
          status: 'ON_REVIEW',
        },
      ),
    ).resolves.toMatchObject({ id: 'task-1' });

    expect(tx.staffTaskComment.create).not.toHaveBeenCalled();
    expectTaskStatusUpdate(tx, 'ON_REVIEW', null);
  });

  it('does not allow an assigned administrator to approve their own task through comments', async () => {
    const { prisma, service } = createService('ON_REVIEW', 'admin-1');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_ADMINISTRATOR, 'admin-1'),
        'task-1',
        { status: 'DONE' },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not grant manager status powers to a view-only role override', async () => {
    const { prisma, service } = createService('ON_REVIEW', 'admin-1');
    const viewOnlyManager: AuthenticatedUser = {
      ...actor(UserRole.CLUB_MANAGER, 'manager-1'),
      hasRoleOverride: true,
      permissions: ['view_staff_tasks'],
    };

    await expect(
      service.createTaskComment(viewOnlyManager, 'task-1', {
        status: 'DONE',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps own task execution available with view-only task access', async () => {
    const { service, tx } = createService('OPEN', 'trainee-1');
    const viewOnlyAssignee: AuthenticatedUser = {
      ...actor(UserRole.TRAINEE, 'trainee-1'),
      hasRoleOverride: true,
      permissions: ['view_staff_tasks'],
    };

    await expect(
      service.createTaskComment(viewOnlyAssignee, 'task-1', {
        status: 'IN_PROGRESS',
      }),
    ).resolves.toMatchObject({ id: 'task-1' });

    expectTaskStatusUpdate(tx, 'IN_PROGRESS', null);
  });

  it('allows a club manager to return a submitted task to work', async () => {
    const { service, tx } = createService('ON_REVIEW', 'admin-1');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          status: 'IN_PROGRESS',
        },
      ),
    ).resolves.toMatchObject({ id: 'task-1' });

    expectTaskStatusUpdate(tx, 'IN_PROGRESS', null);
  });

  it('does not allow an unrelated trainee to move someone else task status', async () => {
    const { prisma, service } = createService('OPEN', 'trainee-1');

    await expect(
      service.createTaskComment(
        actor(UserRole.TRAINEE, 'trainee-2'),
        'task-1',
        {
          status: 'IN_PROGRESS',
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow an assigned trainee to cancel a task through comments', async () => {
    const { prisma, service } = createService('IN_PROGRESS', 'trainee-1');

    await expect(
      service.createTaskComment(
        actor(UserRole.TRAINEE, 'trainee-1'),
        'task-1',
        {
          status: 'CANCELED',
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates task evidence and binds a fresh attachment in one transaction', async () => {
    const { service, staffAttachmentBindingsService, tx } =
      createService('OPEN');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          body: 'Фото выполненной работы',
          evidenceUrl: 'https://ignored.example/evidence',
          attachmentIds: ['attachment-1'],
        },
      ),
    ).resolves.toMatchObject({ id: 'task-1' });

    expect(tx.staffTaskComment.create.mock.calls[0]?.[0].data).toMatchObject({
      taskId: 'task-1',
      evidenceUrl: '/staff/attachments/attachment-1',
    });
    expect(
      staffAttachmentBindingsService.bindPendingResourceAttachments,
    ).toHaveBeenCalledWith(tx, {
      tenantId,
      actorUserId: 'manager-1',
      resourceKind: 'STAFF_TASK',
      resourceId: 'task-1',
      attachmentIds: ['attachment-1'],
    });
    expect(tx.staffTaskComment.create.mock.invocationCallOrder[0]).toBeLessThan(
      staffAttachmentBindingsService.bindPendingResourceAttachments.mock
        .invocationCallOrder[0],
    );
    expect(
      staffAttachmentBindingsService.bindPendingResourceAttachments.mock
        .invocationCallOrder[0],
    ).toBeLessThan(tx.staffTaskAuditEvent.create.mock.invocationCallOrder[0]);
  });

  it('keeps external task evidence links outside the attachment binding flow', async () => {
    const { service, staffAttachmentBindingsService, tx } =
      createService('OPEN');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          evidenceUrl: 'https://evidence.example/photo.jpg',
        },
      ),
    ).resolves.toMatchObject({ id: 'task-1' });

    expect(tx.staffTaskComment.create.mock.calls[0]?.[0].data).toMatchObject({
      evidenceUrl: 'https://evidence.example/photo.jpg',
    });
    expect(
      staffAttachmentBindingsService.bindPendingResourceAttachments,
    ).not.toHaveBeenCalled();
  });

  it.each([
    '/staff/attachments/attachment-1',
    '/api/staff/attachments/attachment-1',
    'https://leetplus.ru/api/staff/attachments/attachment-1',
  ])('rejects an unbound internal evidence link: %s', async (evidenceUrl) => {
    const { prisma, service } = createService('OPEN');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        { evidenceUrl },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects more than one attachment for the scalar task evidence field', async () => {
    const { prisma, service } = createService('OPEN');

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          attachmentIds: ['attachment-1', 'attachment-2'],
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not write the audit event when attachment binding fails', async () => {
    const { service, staffAttachmentBindingsService, tx } =
      createService('OPEN');
    staffAttachmentBindingsService.bindPendingResourceAttachments.mockRejectedValueOnce(
      new BadRequestException('Attachment is not available'),
    );

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          attachmentIds: ['attachment-1'],
        },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTaskComment.create).toHaveBeenCalled();
    expect(tx.staffTaskAuditEvent.create).not.toHaveBeenCalled();
  });

  it('rechecks task scope after the parent row lock before binding evidence', async () => {
    const { service, staffAttachmentBindingsService, tx } =
      createService('OPEN');
    tx.staffTask.findFirst
      .mockResolvedValueOnce({
        id: 'task-1',
        storeId: null,
        shiftId: null,
        status: 'OPEN',
        assignedToUserId: 'admin-1',
        labels: null,
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.createTaskComment(
        actor(UserRole.CLUB_MANAGER, 'manager-1'),
        'task-1',
        {
          body: 'Must not survive a scope change',
          attachmentIds: ['attachment-1'],
        },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.staffTaskComment.create).not.toHaveBeenCalled();
    expect(tx.staffTaskAuditEvent.create).not.toHaveBeenCalled();
    expect(
      staffAttachmentBindingsService.bindPendingResourceAttachments,
    ).not.toHaveBeenCalled();
  });
});
