import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
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
    };
  }

  function taskRow(status: string, assignedToUserId = 'admin-1') {
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
      labels: null,
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

  function createService(currentStatus: string, assignedToUserId = 'admin-1') {
    const currentTask = {
      id: 'task-1',
      status: currentStatus,
      assignedToUserId,
    };
    const responseTask = taskRow(currentStatus, assignedToUserId);
    const tx = {
      staffTask: {
        update: jest.fn() as StaffTaskUpdateMock,
      },
      staffTaskComment: {
        create: jest.fn(),
      },
      staffTaskAuditEvent: {
        create: jest.fn(),
      },
    };
    const prisma = {
      staffTask: {
        findFirst: jest.fn().mockResolvedValue(currentTask),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          callback(tx),
        ),
    };
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId }),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService as never,
    );

    (
      service as unknown as {
        fetchTaskOrThrow: jest.Mock;
      }
    ).fetchTaskOrThrow = jest.fn().mockResolvedValue(responseTask);

    return { prisma, service, tx };
  }

  function createTaskPolicyService(
    users: Array<{ id: string; role: UserRole }>,
  ) {
    const usersById = new Map(users.map((user) => [user.id, user]));
    const findFirst = jest.fn(
      (args: { where?: { id?: string }; select?: { role?: boolean } }) => {
        const userId = args.where?.id;
        const found = userId ? usersById.get(userId) : null;

        if (!found) {
          return Promise.resolve(null);
        }

        return Promise.resolve(
          args.select?.role
            ? { id: found.id, role: found.role }
            : { id: found.id },
        );
      },
    );
    const findMany = jest.fn(
      (args: {
        where?: { id?: { in?: string[] } };
        select?: { role?: boolean };
      }) => {
        const ids = args.where?.id?.in ?? [];
        const found = ids
          .map((id) => usersById.get(id))
          .filter((user): user is { id: string; role: UserRole } =>
            Boolean(user),
          );

        return Promise.resolve(
          found.map((user) =>
            args.select?.role
              ? { id: user.id, role: user.role }
              : { id: user.id },
          ),
        );
      },
    );
    const tx = {
      staffTask: {
        create: jest.fn().mockResolvedValue({ id: 'task-created' }),
      },
      staffTaskAuditEvent: {
        create: jest.fn(),
      },
      staffTaskObserver: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
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
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          callback(tx),
        ),
    };
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId }),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService as never,
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
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId }),
    };
    const service = new StaffTasksService(
      prisma as never,
      tenantContextService as never,
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
});
