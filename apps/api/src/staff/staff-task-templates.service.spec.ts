import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { StaffTaskCatalogAccessPolicyService } from './staff-task-catalog-access-policy.service';
import { StaffTaskTemplatesService } from './staff-task-templates.service';

describe('StaffTaskTemplatesService access scope', () => {
  type FindManyArgs = { where?: unknown };
  type EmptyFindManyMock = jest.MockedFunction<
    (args: FindManyArgs) => Promise<never[]>
  >;
  type CountMock = jest.MockedFunction<
    (args: { where?: unknown }) => Promise<number>
  >;
  type CatalogAuditCreateArgs = {
    data: {
      tenantId: string;
      actorUserId: string | null;
      entityKind: string;
      entityId: string;
      action: string;
      effectiveStoreId: string | null;
      changedFields: string[];
      releaseSha: string | null;
    };
  };
  type CatalogAuditCreateMock = jest.MockedFunction<
    (args: CatalogAuditCreateArgs) => Promise<{ id: string }>
  >;
  const tenantId = 'tenant-a';
  const allowedStoreId = 'store-a1';
  const foreignStoreId = 'store-a2';
  const now = new Date('2026-07-27T09:00:00.000Z');

  function actor(
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: 'manager-a1',
      email: 'manager-a1@example.test',
      fullName: 'Store manager',
      role: UserRole.CLUB_MANAGER,
      tenantId,
      tenantSlug: 'network-a',
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      allowedStoreIds: [allowedStoreId],
      permissions: ['manage_staff_tasks'],
      ...overrides,
    };
  }

  function templateRow(
    overrides: Partial<ReturnType<typeof baseTemplateRow>> = {},
  ) {
    return { ...baseTemplateRow(), ...overrides };
  }

  function baseTemplateRow() {
    return {
      id: 'template-a1',
      tenantId,
      storeId: allowedStoreId,
      createdByUserId: 'manager-a1',
      title: 'Opening',
      description: 'Open the club',
      type: 'SHIFT',
      priority: 'HIGH',
      status: 'ACTIVE',
      dueOffsetMinutes: 30,
      labels: { source: 'template' },
      checklist: null,
      createdAt: now,
      updatedAt: now,
      store: {
        id: allowedStoreId,
        tenantId,
        name: 'Club A1',
        isActive: true,
      },
      createdByUser: {
        id: 'manager-a1',
        tenantId,
        email: 'manager-a1@example.test',
        fullName: 'Store manager',
      },
      _count: { tasks: 0 },
    };
  }

  function createService(
    prisma: object,
    staffTasksService: {
      createCatalogTaskInTransaction: jest.Mock;
    } = {
      createCatalogTaskInTransaction: jest.fn(),
    },
  ) {
    const accessScopeService = new AccessScopeService();
    const service = new StaffTaskTemplatesService(
      prisma as never,
      new StaffTaskCatalogAccessPolicyService(accessScopeService),
      staffTasksService as never,
      { get: jest.fn().mockReturnValue('a'.repeat(40)) } as never,
    );

    return { service, staffTasksService };
  }

  function mutationScopeDelegates(mode: 'NETWORK' | 'STORES' = 'STORES') {
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'locked-row' }]),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          tenantId,
          accessScope: mode,
          storeAccesses:
            mode === 'STORES'
              ? [
                  {
                    storeId: allowedStoreId,
                    store: { tenantId },
                  },
                ]
              : [],
        }),
      },
    };
  }

  it('filters rows, stores and participant options for a STORES actor', async () => {
    const templateFindMany: EmptyFindManyMock = jest.fn().mockResolvedValue([]);
    const storeFindMany: EmptyFindManyMock = jest.fn().mockResolvedValue([]);
    const userFindMany: EmptyFindManyMock = jest.fn().mockResolvedValue([]);
    const templateGroupBy = jest.fn().mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 225 } },
      { status: 'ACTIVE', _count: { _all: 2 } },
    ]);
    const taskCount: CountMock = jest.fn().mockResolvedValue(123);
    const { service } = createService({
      staffTaskTemplate: {
        findMany: templateFindMany,
        groupBy: templateGroupBy,
      },
      staffTask: { count: taskCount },
      store: { findMany: storeFindMany },
      user: { findMany: userFindMany },
    });

    const report = await service.getTemplates(actor(), {});

    expect(JSON.stringify(templateFindMany.mock.calls[0]?.[0].where)).toContain(
      `"storeId":{"in":["${allowedStoreId}"]}`,
    );
    expect(storeFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
      id: { in: [allowedStoreId] },
    });
    expect(userFindMany.mock.calls[0]?.[0].where).toEqual({
      tenantId,
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      storeAccesses: {
        some: { storeId: { in: [allowedStoreId] } },
        none: { storeId: { notIn: [allowedStoreId] } },
      },
    });
    expect(
      JSON.stringify(templateFindMany.mock.calls[0]?.[0].include),
    ).toContain(`"storeId":{"in":["${allowedStoreId}"]}`);
    expect(JSON.stringify(taskCount.mock.calls[0]?.[0].where)).toContain(
      `"storeId":{"in":["${allowedStoreId}"]}`,
    );
    expect(report.summary).toEqual({
      total: 227,
      draft: 225,
      active: 2,
      archived: 0,
      tasksCreated: 123,
    });
  });

  it('keeps tenant-global templates visible for NETWORK actors', async () => {
    const templateFindMany: EmptyFindManyMock = jest.fn().mockResolvedValue([]);
    const { service } = createService({
      staffTaskTemplate: {
        findMany: templateFindMany,
        groupBy: jest.fn().mockResolvedValue([]),
      },
      staffTask: { count: jest.fn().mockResolvedValue(0) },
      store: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await service.getTemplates(
      actor({
        accessScope: 'NETWORK',
        allowedStoreIds: [],
      }),
      {},
    );

    expect(templateFindMany.mock.calls[0]?.[0].where).toEqual({
      AND: [{ tenantId }, {}],
    });
  });

  it('does not expose a creator outside the actor participant scope', async () => {
    const row = templateRow();
    const { service } = createService({
      staffTaskTemplate: {
        findMany: jest.fn().mockResolvedValue([row]),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 1 } }]),
      },
      staffTask: { count: jest.fn().mockResolvedValue(0) },
      store: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const report = await service.getTemplates(actor(), {});

    expect(report.rows[0]?.createdByUser).toBeNull();
  });

  it('rejects an explicit foreign store filter before querying', async () => {
    const templateFindMany = jest.fn();
    const { service } = createService({
      staffTaskTemplate: { findMany: templateFindMany },
    });

    await expect(
      service.getTemplates(actor(), { storeId: foreignStoreId }),
    ).rejects.toThrow(ForbiddenException);
    expect(templateFindMany).not.toHaveBeenCalled();
  });

  it('requires a concrete allowed store when a STORES actor creates a template', async () => {
    const tx = {
      ...mutationScopeDelegates(),
      staffTaskTemplate: { create: jest.fn() },
    };
    const { service } = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.createTemplate(actor(), { title: 'Unsafe global template' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.staffTaskTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects server-owned assignment labels on template writes', async () => {
    const tx = {
      ...mutationScopeDelegates('NETWORK'),
      staffTaskTemplate: { create: jest.fn() },
    };
    const { service } = createService({
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.createTemplate(
        actor({
          accessScope: 'NETWORK',
          allowedStoreIds: [],
        }),
        {
          title: 'Spoofed template',
          labels: { assignmentMode: 'ANY_OF' },
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tx.staffTaskTemplate.create).not.toHaveBeenCalled();
  });

  it('masks a direct foreign template UUID as 404', async () => {
    const transaction = jest.fn();
    const { service } = createService({
      staffTaskTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    });

    await expect(
      service.updateTemplate(actor(), 'template-a2', { title: 'Hidden' }),
    ).rejects.toThrow(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('locks and rechecks the scoped template before updating', async () => {
    const row = templateRow();
    const auditCreate: CatalogAuditCreateMock = jest
      .fn()
      .mockResolvedValue({ id: 'audit-template-update' });
    const tx = {
      ...mutationScopeDelegates(),
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest
          .fn()
          .mockResolvedValue({ ...row, title: 'Updated opening' }),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      staffTaskCatalogAuditEvent: {
        create: auditCreate,
      },
    };
    const { service } = createService({
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: row.id }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    const result = await service.updateTemplate(actor(), row.id, {
      title: 'Updated opening',
    });

    expect(result.title).toBe('Updated opening');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.staffTaskTemplate.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.staffTaskTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: row.id },
        data: { title: 'Updated opening' },
      }),
    );
    expect(auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      tenantId,
      actorUserId: 'manager-a1',
      entityKind: 'TEMPLATE',
      entityId: row.id,
      action: 'UPDATED',
      effectiveStoreId: allowedStoreId,
      changedFields: ['title'],
      releaseSha: 'a'.repeat(40),
    });
  });

  it('requires active recurring rules to be paused before changing template status', async () => {
    const row = templateRow();
    const tx = {
      ...mutationScopeDelegates(),
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-a1' }),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
    };
    const { service } = createService({
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: row.id }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.updateTemplate(actor(), row.id, { status: 'ARCHIVED' }),
    ).rejects.toThrow(ConflictException);
    expect(tx.staffTaskRecurringRule.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        templateId: row.id,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(tx.staffTaskTemplate.update).not.toHaveBeenCalled();
  });

  it('does not launch a draft template', async () => {
    const row = templateRow({ status: 'DRAFT' });
    const tx = {
      ...mutationScopeDelegates(),
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
    };
    const { service, staffTasksService } = createService({
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: row.id }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    });

    await expect(
      service.createTaskFromTemplate(actor(), row.id, {}),
    ).rejects.toThrow(BadRequestException);
    expect(
      staffTasksService.createCatalogTaskInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('launches an active template through the shared task materializer in the same transaction', async () => {
    const row = templateRow();
    const auditCreate: CatalogAuditCreateMock = jest
      .fn()
      .mockResolvedValue({ id: 'audit-template-launch' });
    const tx = {
      ...mutationScopeDelegates(),
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      staffTaskCatalogAuditEvent: {
        create: auditCreate,
      },
    };
    const staffTasksService = {
      createCatalogTaskInTransaction: jest.fn().mockResolvedValue({
        id: 'task-a1',
        title: row.title,
        dueAt: '2026-07-27T09:30:00.000Z',
      }),
    };
    const { service } = createService(
      {
        staffTaskTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: row.id }),
        },
        $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
      },
      staffTasksService,
    );

    const result = await service.createTaskFromTemplate(actor(), row.id, {
      assignedToUserId: 'employee-a1',
      observerUserIds: ['senior-a1'],
    });

    expect(result).toEqual({
      id: 'task-a1',
      title: row.title,
      dueAt: '2026-07-27T09:30:00.000Z',
      templateId: row.id,
    });
    expect(
      staffTasksService.createCatalogTaskInTransaction,
    ).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'manager-a1' }),
      expect.objectContaining({
        title: row.title,
        storeId: allowedStoreId,
        assignedToUserId: 'employee-a1',
        observerUserIds: ['senior-a1'],
        status: 'OPEN',
      }),
      {
        kind: 'TEMPLATE',
        templateId: row.id,
        templateTitle: row.title,
      },
    );
    expect(auditCreate.mock.calls[0]?.[0].data).toMatchObject({
      tenantId,
      actorUserId: 'manager-a1',
      entityKind: 'TEMPLATE',
      entityId: row.id,
      action: 'TASK_LAUNCHED',
      effectiveStoreId: allowedStoreId,
      changedFields: [],
    });
  });
});
