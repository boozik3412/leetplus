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
