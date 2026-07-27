import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StaffTasksService } from './staff-tasks.service';

describe('StaffTasksService catalog materializer', () => {
  type TaskCreateArgs = {
    data: Record<string, unknown>;
  };
  type AuditCreateArgs = {
    data: {
      tenantId: string;
      taskId: string;
      actorUserId: string | null;
      action: string;
      metadata: Record<string, unknown>;
    };
  };
  type UserFindManyArgs = {
    where?: {
      tenantId?: string;
      accessScope?: string;
      id?: { in?: string[] };
    };
  };
  const tenantId = 'tenant-1';
  const storeId = 'store-1';
  const now = new Date('2026-07-27T09:00:00.000Z');

  function actor(
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: 'manager-1',
      email: 'manager-1@example.com',
      fullName: 'Manager',
      role: UserRole.CLUB_MANAGER,
      tenantId,
      tenantSlug: 'network-a',
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
      permissions: ['manage_staff_tasks'],
      ...overrides,
    };
  }

  function taskRow() {
    return {
      id: 'task-created',
      tenantId,
      storeId,
      shiftId: null,
      sourceTemplateId: 'template-1',
      sourceRecurringRuleId: null,
      createdByUserId: 'manager-1',
      assignedToUserId: 'employee-1',
      title: 'Open the club',
      description: null,
      type: 'SHIFT',
      status: 'OPEN',
      priority: 'HIGH',
      dueAt: null,
      completedAt: null,
      labels: { source: 'template' },
      checklist: null,
      createdAt: now,
      updatedAt: now,
      store: { id: storeId, name: 'Club 1', isActive: true },
      shift: null,
      createdByUser: null,
      assignedToUser: {
        id: 'employee-1',
        email: 'employee-1@example.com',
        fullName: null,
        role: UserRole.CLUB_ADMINISTRATOR,
      },
      observers: [],
      comments: [],
      auditEvents: [],
    };
  }

  function createService() {
    const staffTeamChatService = {
      createSystemNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new StaffTasksService(
      {} as never,
      new TenantContextService(),
      staffTeamChatService as never,
      new AccessScopeService(),
      {
        bindPendingResourceAttachments: jest.fn(),
      } as never,
    );

    (
      service as unknown as {
        fetchTaskOrThrow: jest.Mock;
      }
    ).fetchTaskOrThrow = jest.fn().mockResolvedValue(taskRow());

    return { service, staffTeamChatService };
  }

  function createTransaction(userRows: Array<{ id: string }>) {
    const userFindMany: jest.MockedFunction<
      (args: UserFindManyArgs) => Promise<Array<{ id: string }>>
    > = jest.fn().mockResolvedValue(userRows);
    const taskCreate: jest.MockedFunction<
      (args: TaskCreateArgs) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'task-created' });
    const auditCreate: jest.MockedFunction<
      (args: AuditCreateArgs) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'audit-1' });

    return {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: storeId }),
      },
      guestWorkingShift: {
        findFirst: jest.fn(),
      },
      user: {
        findMany: userFindMany,
      },
      staffTask: {
        create: taskCreate,
      },
      staffTaskAuditEvent: {
        create: auditCreate,
      },
      staffTaskObserver: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  it('creates a source-linked OPEN task and audit inside the caller transaction', async () => {
    const { service, staffTeamChatService } = createService();
    const tx = createTransaction([{ id: 'employee-1' }]);

    const result = await service.createCatalogTaskInTransaction(
      tx as never,
      actor(),
      {
        title: 'Open the club',
        type: 'SHIFT',
        priority: 'HIGH',
        storeId,
        assignedToUserId: 'employee-1',
        labels: { source: 'template' },
      },
      {
        kind: 'TEMPLATE',
        templateId: 'template-1',
        templateTitle: 'Opening',
      },
    );

    expect(result.id).toBe('task-created');
    const taskData = tx.staffTask.create.mock.calls[0]?.[0].data;
    expect(taskData).toMatchObject({
      tenantId,
      storeId,
      status: 'OPEN',
      assignedToUserId: 'employee-1',
      sourceTemplateId: 'template-1',
      sourceRecurringRuleId: null,
      createdByUserId: 'manager-1',
    });
    const auditData = tx.staffTaskAuditEvent.create.mock.calls[0]?.[0].data;
    expect(auditData).toMatchObject({
      tenantId,
      taskId: 'task-created',
      actorUserId: 'manager-1',
      action: 'CREATED_FROM_TEMPLATE',
    });
    expect(auditData?.metadata).toMatchObject({
      templateId: 'template-1',
      templateTitle: 'Opening',
    });
    expect(staffTeamChatService.createSystemNotification).toHaveBeenCalledWith(
      tenantId,
      expect.any(Object),
      tx,
    );
  });

  it('uses authoritative scoped participants and fails closed before task creation', async () => {
    const { service } = createService();
    const tx = createTransaction([]);

    await expect(
      service.createCatalogTaskInTransaction(
        tx as never,
        actor({
          accessScope: 'STORES',
          allowedStoreIds: [storeId],
        }),
        {
          title: 'Scoped task',
          storeId,
          assignedToUserId: 'foreign-user',
        },
        {
          kind: 'TEMPLATE',
          templateId: 'template-1',
          templateTitle: 'Scoped',
        },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.user.findMany.mock.calls[0]?.[0].where).toMatchObject({
      tenantId,
      accessScope: 'STORES',
      id: { in: ['foreign-user'] },
    });
    expect(tx.staffTask.create).not.toHaveBeenCalled();
  });

  it('preserves template tag arrays for a single catalog assignment', async () => {
    const { service } = createService();
    const tx = createTransaction([{ id: 'employee-1' }]);

    await service.createCatalogTaskInTransaction(
      tx as never,
      actor(),
      {
        title: 'Tagged task',
        storeId,
        assignedToUserId: 'employee-1',
        labels: ['opening', 'standard'],
      },
      {
        kind: 'TEMPLATE',
        templateId: 'template-1',
        templateTitle: 'Opening',
      },
    );

    expect(tx.staffTask.create.mock.calls[0]?.[0].data.labels).toEqual([
      'opening',
      'standard',
    ]);
  });

  it.each([
    'assignmentMode',
    'candidateUserIds',
    'originalAssignedToUserIds',
    'bulkTaskGroupId',
  ] as const)('rejects catalog label spoofing for %s', async (key) => {
    const { service } = createService();
    const tx = createTransaction([]);

    await expect(
      service.createCatalogTaskInTransaction(
        tx as never,
        actor(),
        {
          title: 'Spoofed catalog task',
          labels: { [key]: 'spoofed' },
        },
        {
          kind: 'TEMPLATE',
          templateId: 'template-1',
          templateTitle: 'Unsafe',
        },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTask.create).not.toHaveBeenCalled();
  });
});
