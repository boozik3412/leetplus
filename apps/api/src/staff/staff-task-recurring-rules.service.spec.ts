/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffTaskRecurringRulesService } from './staff-task-recurring-rules.service';

describe('StaffTaskRecurringRulesService actor access scope', () => {
  const tenantId = 'tenant-a';
  const allowedStoreId = 'store-a1';
  const foreignStoreId = 'store-a2';
  const actorId = 'manager-a1';
  const now = new Date('2026-07-27T09:00:00.000Z');
  const scheduledFor = new Date('2026-07-27T08:30:00.000Z');

  function actor(
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: actorId,
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

  function accessScope() {
    return {
      tenantId,
      tenantSlug: 'network-a',
      mode: 'STORES' as const,
      allowedStoreIds: [allowedStoreId],
    };
  }

  function ruleMutationRow() {
    return {
      id: 'rule-a1',
      tenantId,
      templateId: null,
      storeId: allowedStoreId,
      assignedToUserId: null,
      title: 'Opening control',
      description: 'Complete the opening checklist',
      cadence: 'DAILY',
      status: 'ACTIVE',
      taskType: 'RECURRING',
      priority: 'HIGH',
      timeOfDay: '09:00',
      dayOfWeek: null,
      dayOfMonth: null,
      dueOffsetMinutes: 30,
      nextRunAt: scheduledFor,
      labels: null,
      checklist: null,
    };
  }

  function ruleResponseRow() {
    return {
      ...ruleMutationRow(),
      createdByUserId: actorId,
      lastManualRunAt: null,
      lastAutomaticRunAt: null,
      lastCreatedTaskId: 'task-a0',
      createdAt: now,
      updatedAt: now,
      store: {
        id: allowedStoreId,
        tenantId,
        name: 'Club A1',
        isActive: true,
      },
      template: null,
      createdByUser: {
        id: actorId,
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        email: 'manager-a1@example.test',
        fullName: 'Store manager',
      },
      assignedToUser: null,
      lastCreatedTask: {
        id: 'task-a0',
        tenantId,
        storeId: allowedStoreId,
        title: 'Previous opening control',
        status: 'DONE',
        dueAt: scheduledFor,
        createdAt: scheduledFor,
      },
      _count: { generatedTasks: 7 },
    };
  }

  function templateMutationRow(
    overrides: Partial<{
      id: string;
      tenantId: string;
      storeId: string | null;
      title: string;
      description: string | null;
      status: string;
      type: string;
      priority: string;
      dueOffsetMinutes: number | null;
      labels: null;
      checklist: null;
    }> = {},
  ) {
    return {
      id: 'template-a1',
      tenantId,
      storeId: allowedStoreId,
      title: 'Opening template',
      description: 'Complete the opening checklist',
      status: 'ACTIVE',
      type: 'RECURRING',
      priority: 'HIGH',
      dueOffsetMinutes: 30,
      labels: null,
      checklist: null,
      ...overrides,
    };
  }

  function runResponseRow() {
    return {
      id: 'run-a0',
      tenantId,
      ruleId: 'rule-a1',
      createdTaskId: 'task-a0',
      scheduledFor,
      startedAt: scheduledFor,
      completedAt: now,
      status: 'SUCCESS',
      message: 'raw internal message',
      metadata: {
        trigger: 'INTERACTIVE_DUE',
        cadence: 'DAILY',
        templateId: 'must-not-leak',
        internalError: 'must-not-leak',
      },
      rule: {
        id: 'rule-a1',
        tenantId,
        storeId: allowedStoreId,
        title: 'Opening control',
      },
      createdTask: {
        id: 'task-a0',
        tenantId,
        storeId: allowedStoreId,
        title: 'Previous opening control',
        status: 'DONE',
        dueAt: scheduledFor,
        createdAt: scheduledFor,
      },
    };
  }

  function createPolicy() {
    const scope = accessScope();

    return {
      resolve: jest.fn().mockReturnValue(scope),
      resolveFreshForMutation: jest.fn().mockResolvedValue(scope),
      assertExplicitStoreFilterAllowed: jest.fn(),
      assertStoreMutationAllowed: jest.fn(),
      assertTaskLabelsWritable: jest.fn(),
      buildRuleWhere: jest.fn((_scope: unknown, where: unknown) => ({
        scopedRuleWhere: where,
      })),
      buildRunWhere: jest.fn((_scope: unknown, where: unknown) => ({
        scopedRunWhere: where,
      })),
      buildStoreSelectorWhere: jest
        .fn()
        .mockReturnValue({ scopedStoreWhere: true }),
      buildParticipantUserWhere: jest
        .fn()
        .mockReturnValue({ scopedParticipantWhere: true }),
      buildTemplateWhere: jest
        .fn()
        .mockReturnValue({ scopedTemplateWhere: true }),
      buildTemplateLookupWhere: jest.fn((_scope: unknown, id: string) => ({
        scopedTemplateId: id,
      })),
    };
  }

  function createPrisma() {
    return {
      staffTaskRecurringRule: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      staffTaskRecurringRuleRun: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      staffTaskTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      staffTask: {
        count: jest.fn().mockResolvedValue(0),
      },
      store: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      tenant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
  }

  function createService(
    options: {
      prisma?: ReturnType<typeof createPrisma>;
      policy?: ReturnType<typeof createPolicy>;
      materialize?: jest.Mock;
    } = {},
  ) {
    const prisma = options.prisma ?? createPrisma();
    const policy = options.policy ?? createPolicy();
    const staffTasksService = {
      createCatalogTaskInTransaction: options.materialize ?? jest.fn(),
    };
    const configService = {
      get: jest.fn().mockReturnValue('a'.repeat(40)),
    };
    const service = new StaffTaskRecurringRulesService(
      prisma as never,
      configService as never,
      policy as never,
      staffTasksService as never,
    );

    return {
      configService,
      policy,
      prisma,
      service,
      staffTasksService,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rejects a forbidden explicit store filter before any Prisma query', async () => {
    const policy = createPolicy();
    policy.assertExplicitStoreFilterAllowed.mockImplementation(() => {
      throw new ForbiddenException('Store is outside your access scope');
    });
    const { prisma, service } = createService({ policy });

    await expect(
      service.getRules(actor(), { storeId: foreignStoreId }),
    ).rejects.toThrow(ForbiddenException);

    expect(policy.assertExplicitStoreFilterAllowed).toHaveBeenCalledWith(
      accessScope(),
      foreignStoreId,
    );
    expect(prisma.staffTaskRecurringRule.findMany).not.toHaveBeenCalled();
    expect(prisma.staffTaskRecurringRuleRun.findMany).not.toHaveBeenCalled();
    expect(prisma.store.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('uses scoped predicates for rows, options and runs and builds a safe full summary', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findMany.mockResolvedValue([
      ruleResponseRow(),
    ]);
    prisma.staffTaskRecurringRuleRun.findMany.mockResolvedValue([
      runResponseRow(),
    ]);
    prisma.store.findMany.mockResolvedValue([
      { id: allowedStoreId, name: 'Club A1', isActive: true },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: actorId,
        email: 'manager-a1@example.test',
        fullName: 'Store manager',
      },
    ]);
    prisma.staffTaskTemplate.findMany.mockResolvedValue([]);
    prisma.staffTaskRecurringRule.groupBy.mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 225 } },
      { status: 'PAUSED', _count: { _all: 3 } },
      { status: 'ARCHIVED', _count: { _all: 2 } },
    ]);
    prisma.staffTaskRecurringRule.count = jest.fn().mockResolvedValue(11);
    prisma.staffTask.count.mockResolvedValue(999);
    const { policy, service } = createService({ prisma });

    const result = await service.getRules(actor(), {});

    const ruleWhere = policy.buildRuleWhere.mock.results[0]?.value;
    const runWhere = policy.buildRunWhere.mock.results[0]?.value;
    expect(prisma.staffTaskRecurringRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: ruleWhere, take: 200 }),
    );
    const generatedTaskCountWhere =
      prisma.staffTaskRecurringRule.findMany.mock.calls[0]?.[0].include._count
        .select.generatedTasks.where;
    expect(JSON.stringify(generatedTaskCountWhere)).toContain(
      `"tenantId":"${tenantId}"`,
    );
    expect(JSON.stringify(generatedTaskCountWhere)).toContain(
      `"storeId":{"in":["${allowedStoreId}"]}`,
    );
    expect(prisma.staffTaskRecurringRuleRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: runWhere, take: 25 }),
    );
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scopedStoreWhere: true } }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scopedParticipantWhere: true },
      }),
    );
    expect(prisma.staffTaskTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scopedTemplateWhere: true },
      }),
    );
    expect(
      JSON.stringify(
        prisma.staffTaskRecurringRule.count.mock.calls[0]?.[0].where,
      ),
    ).toContain('"status":"ACTIVE"');
    expect(
      JSON.stringify(prisma.staffTask.count.mock.calls[0]?.[0].where),
    ).toContain(`"storeId":{"in":["${allowedStoreId}"]}`);
    expect(result.summary).toEqual({
      total: 230,
      active: 225,
      paused: 3,
      archived: 2,
      dueNow: 11,
      tasksCreated: 999,
    });
    expect(result.rows[0]?.createdByUser?.id).toBe(actorId);
    expect(result.runs[0]).toMatchObject({
      status: 'SUCCESS',
      message: 'Task created',
      metadata: {
        trigger: 'INTERACTIVE_DUE',
        cadence: 'DAILY',
      },
    });
    expect(JSON.stringify(result.runs[0])).not.toContain('must-not-leak');
    expect(JSON.stringify(result.runs[0])).not.toContain(
      'raw internal message',
    );
  });

  it.each([
    ['PATCH', 'updateRule'] as const,
    ['manual launch', 'createTaskFromRule'] as const,
  ])(
    'masks a hidden UUID as 404 before transaction for %s',
    async (_label, method) => {
      const prisma = createPrisma();
      prisma.staffTaskRecurringRule.findFirst.mockResolvedValue(null);
      const { service } = createService({ prisma });

      const operation =
        method === 'updateRule'
          ? service.updateRule(actor(), 'rule-hidden', { title: 'Hidden' })
          : service.createTaskFromRule(actor(), 'rule-hidden', {});

      await expect(operation).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('requires a concrete allowed store through policy inside a fresh create transaction', async () => {
    const prisma = createPrisma();
    const policy = createPolicy();
    policy.assertStoreMutationAllowed.mockImplementation(
      (_scope: unknown, storeId: string | null) => {
        if (!storeId) {
          throw new ForbiddenException(
            'A store-scoped catalog resource must belong to an allowed store',
          );
        }
      },
    );
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: tenantId }]),
      staffTaskRecurringRule: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ policy, prisma });

    await expect(
      service.createRule(actor(), { title: 'Unsafe global rule' }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(policy.resolveFreshForMutation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: actorId }),
    );
    expect(policy.assertStoreMutationAllowed).toHaveBeenCalledWith(
      accessScope(),
      null,
    );
    expect(tx.staffTaskRecurringRule.create).not.toHaveBeenCalled();
  });

  it('locks the template FOR SHARE and rejects create when it becomes archived before the recheck', async () => {
    const prisma = createPrisma();
    const activeTemplate = templateMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: activeTemplate.id }]),
      staffTaskTemplate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(activeTemplate)
          .mockResolvedValueOnce({
            ...activeTemplate,
            status: 'ARCHIVED',
          }),
      },
      staffTaskRecurringRule: {
        create: jest.fn(),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ prisma });

    await expect(
      service.createRule(actor(), {
        templateId: activeTemplate.id,
        storeId: allowedStoreId,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTaskTemplate.findFirst).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.$queryRaw.mock.calls[0]?.[0])).toContain(
      'FOR SHARE',
    );
    expect(tx.staffTaskRecurringRule.create).not.toHaveBeenCalled();
    expect(tx.staffTaskCatalogAuditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['another store', foreignStoreId],
  ])(
    'rejects an explicit %s override for a store-bound manual launch before materialization',
    async (_label, requestedStoreId) => {
      const prisma = createPrisma();
      prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
        id: 'rule-a1',
      });
      const policy = createPolicy();
      policy.assertStoreMutationAllowed.mockImplementation(
        (_scope: unknown, storeId: string | null) => {
          if (storeId !== allowedStoreId) {
            throw new ForbiddenException(
              'A store-scoped catalog resource must belong to an allowed store',
            );
          }
        },
      );
      const rule = ruleMutationRow();
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
        staffTaskRecurringRule: {
          findFirst: jest.fn().mockResolvedValue(rule),
          update: jest.fn(),
        },
        store: {
          findFirst: jest.fn(),
        },
        user: {
          findFirst: jest.fn(),
        },
        staffTaskCatalogAuditEvent: {
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(
        (callback: (client: typeof tx) => unknown) => callback(tx),
      );
      const materialize = jest.fn();
      const { service } = createService({
        materialize,
        policy,
        prisma,
      });

      await expect(
        service.createTaskFromRule(actor(), rule.id, {
          storeId: requestedStoreId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(materialize).not.toHaveBeenCalled();
      expect(tx.staffTaskRecurringRule.update).not.toHaveBeenCalled();
      expect(tx.staffTaskCatalogAuditEvent.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a hidden template during update without domain or audit writes', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
      id: 'rule-a1',
    });
    const rule = ruleMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn(),
      },
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ prisma });

    await expect(
      service.updateRule(actor(), rule.id, {
        templateId: 'template-hidden',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTaskRecurringRule.update).not.toHaveBeenCalled();
    expect(tx.staffTaskCatalogAuditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a final template/store mismatch during update without domain or audit writes', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
      id: 'rule-a1',
    });
    const policy = createPolicy();
    const networkScope = {
      tenantId,
      tenantSlug: 'network-a',
      mode: 'NETWORK' as const,
      allowedStoreIds: [],
    };
    policy.resolve.mockReturnValue(networkScope);
    policy.resolveFreshForMutation.mockResolvedValue(networkScope);
    const rule = ruleMutationRow();
    const template = templateMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn(),
      },
      staffTaskTemplate: {
        findFirst: jest.fn().mockResolvedValue(template),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: foreignStoreId }),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ policy, prisma });

    await expect(
      service.updateRule(
        actor({
          accessScope: 'NETWORK',
          allowedStoreIds: [],
        }),
        rule.id,
        {
          templateId: template.id,
          storeId: foreignStoreId,
        },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.staffTaskTemplate.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.staffTaskRecurringRule.update).not.toHaveBeenCalled();
    expect(tx.staffTaskCatalogAuditEvent.create).not.toHaveBeenCalled();
  });

  it('uses an authoritative participant projection after status-only deactivation', async () => {
    const revokedUserId = 'revoked-assignee';
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
      id: 'rule-a1',
    });
    const rule = {
      ...ruleMutationRow(),
      assignedToUserId: revokedUserId,
    };
    const updated = {
      ...ruleResponseRow(),
      assignedToUserId: revokedUserId,
      status: 'PAUSED',
      assignedToUser: {
        id: revokedUserId,
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        email: 'revoked-secret@example.test',
        fullName: 'Revoked assignee',
      },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn().mockResolvedValue(updated),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({
          id: allowedStoreId,
          tenantId,
          isActive: true,
          timeZone: 'Asia/Yekaterinburg',
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: actorId }]),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-rule-pause' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { policy, service } = createService({ prisma });

    const result = await service.updateRule(actor(), rule.id, {
      status: 'PAUSED',
    });

    expect(result.assignedToUser).toBeNull();
    expect(JSON.stringify(result)).not.toContain('revoked-secret');
    expect(
      JSON.stringify(
        tx.staffTaskRecurringRule.update.mock.calls[0]?.[0].include._count
          .select.generatedTasks.where,
      ),
    ).toContain(`"storeId":{"in":["${allowedStoreId}"]}`);
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { scopedParticipantWhere: true },
            { id: { in: [actorId, revokedUserId] } },
          ],
        },
      }),
    );
    expect(policy.buildParticipantUserWhere).toHaveBeenCalledWith(
      accessScope(),
      allowedStoreId,
    );
    const projectionLockCalls = tx.$queryRaw.mock.calls as Array<
      [{ strings: readonly string[] }]
    >;
    expect(projectionLockCalls[3]?.[0].strings.join('')).toContain(
      'FROM "User"',
    );
    expect(projectionLockCalls[4]?.[0].strings.join('')).toContain(
      'FROM "UserStoreAccess"',
    );
  });

  it('preserves nextRunAt when submitted schedule fields equal the locked rule', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
      id: 'rule-a1',
    });
    const rule = ruleMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...ruleResponseRow(),
            ...data,
            nextRunAt: data.nextRunAt,
          }),
        ),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({
          id: allowedStoreId,
          tenantId,
          isActive: true,
          timeZone: 'Asia/Yekaterinburg',
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: actorId }]),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-rule-noop' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ prisma });

    await service.updateRule(actor(), rule.id, {
      cadence: 'DAILY',
      timeOfDay: '09:00',
      dayOfWeek: null,
      dayOfMonth: null,
    });

    expect(
      tx.staffTaskRecurringRule.update.mock.calls[0]?.[0].data.nextRunAt,
    ).toEqual(scheduledFor);
  });

  it('rejects create if the locked store becomes inactive before the post-lock recheck', async () => {
    const prisma = createPrisma();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: tenantId }]),
      staffTaskRecurringRule: {
        create: jest.fn(),
      },
      store: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: allowedStoreId,
            tenantId,
            isActive: true,
            timeZone: 'Asia/Yekaterinburg',
          })
          .mockResolvedValueOnce(null),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const { service } = createService({ prisma });

    await expect(
      service.createRule(actor(), {
        title: 'Opening control',
        storeId: allowedStoreId,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tx.$queryRaw.mock.calls[1]?.[0])).toContain(
      'FOR SHARE',
    );
    expect(tx.store.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.store.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        select: expect.objectContaining({ timeZone: true }),
      }),
    );
    expect(tx.staffTaskRecurringRule.create).not.toHaveBeenCalled();
    expect(tx.staffTaskCatalogAuditEvent.create).not.toHaveBeenCalled();
  });

  it('launches manually through the shared materializer and audits without rescheduling the rule', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findFirst.mockResolvedValue({
      id: 'rule-a1',
    });
    const rule = ruleMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn().mockResolvedValue({ id: rule.id }),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      user: {
        findFirst: jest.fn(),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-rule-launch' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const materialize = jest.fn().mockResolvedValue({
      id: 'task-a1',
      title: rule.title,
      dueAt: '2026-07-27T09:30:00.000Z',
    });
    const { service } = createService({ materialize, prisma });

    const result = await service.createTaskFromRule(actor(), rule.id, {});

    expect(result).toEqual({
      id: 'task-a1',
      title: rule.title,
      dueAt: '2026-07-27T09:30:00.000Z',
      ruleId: rule.id,
      templateId: null,
    });
    expect(materialize).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: actorId,
        accessScope: 'STORES',
        allowedStoreIds: [allowedStoreId],
      }),
      expect.objectContaining({
        title: rule.title,
        storeId: allowedStoreId,
        status: 'OPEN',
      }),
      expect.objectContaining({
        kind: 'RECURRING_RULE',
        ruleId: rule.id,
        automatic: false,
      }),
    );
    const updateData = tx.staffTaskRecurringRule.update.mock.calls[0]?.[0].data;
    expect(updateData).toEqual({
      lastManualRunAt: now,
      lastCreatedTaskId: 'task-a1',
    });
    expect(updateData).not.toHaveProperty('nextRunAt');
    expect(
      tx.staffTaskCatalogAuditEvent.create.mock.calls[0]?.[0].data,
    ).toMatchObject({
      tenantId,
      actorUserId: actorId,
      entityKind: 'RULE',
      entityId: rule.id,
      action: 'TASK_LAUNCHED',
      effectiveStoreId: allowedStoreId,
      changedFields: ['lastManualRunAt', 'lastCreatedTaskId'],
    });
  });

  it('calculates the next daily run in the club IANA time zone', () => {
    const { service } = createService();
    const scheduleService = service as unknown as {
      resolveNextRunAt: (
        input: {
          status: string;
          cadence: string;
          timeOfDay: string | null;
          dayOfWeek: number | null;
          dayOfMonth: number | null;
        },
        from: Date,
        timeZone: string,
      ) => Date | null;
    };

    const nextRunAt = scheduleService.resolveNextRunAt(
      {
        status: 'ACTIVE',
        cadence: 'DAILY',
        timeOfDay: '09:00',
        dayOfWeek: null,
        dayOfMonth: null,
      },
      new Date('2026-07-27T09:00:00.000Z'),
      'Asia/Yekaterinburg',
    );

    expect(nextRunAt?.toISOString()).toBe('2026-07-28T04:00:00.000Z');
  });

  it('shifts a nonexistent DST wall time forward by the gap', () => {
    const { service } = createService();
    const scheduleService = service as unknown as {
      resolveNextRunAt: (
        input: {
          status: string;
          cadence: string;
          timeOfDay: string | null;
          dayOfWeek: number | null;
          dayOfMonth: number | null;
        },
        from: Date,
        timeZone: string,
      ) => Date | null;
    };

    const nextRunAt = scheduleService.resolveNextRunAt(
      {
        status: 'ACTIVE',
        cadence: 'DAILY',
        timeOfDay: '02:30',
        dayOfWeek: null,
        dayOfMonth: null,
      },
      new Date('2026-03-29T00:00:00.000Z'),
      'Europe/Berlin',
    );

    expect(nextRunAt?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('uses only the earliest instant for a repeated DST wall time', () => {
    const { service } = createService();
    const scheduleService = service as unknown as {
      resolveNextRunAt: (
        input: {
          status: string;
          cadence: string;
          timeOfDay: string | null;
          dayOfWeek: number | null;
          dayOfMonth: number | null;
        },
        from: Date,
        timeZone: string,
      ) => Date | null;
    };
    const schedule = {
      status: 'ACTIVE',
      cadence: 'DAILY',
      timeOfDay: '02:30',
      dayOfWeek: null,
      dayOfMonth: null,
    };

    const firstRun = scheduleService.resolveNextRunAt(
      schedule,
      new Date('2026-10-24T23:00:00.000Z'),
      'Europe/Berlin',
    );
    const nextRun = scheduleService.resolveNextRunAt(
      schedule,
      firstRun ?? new Date(0),
      'Europe/Berlin',
    );

    expect(firstRun?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(nextRun?.toISOString()).toBe('2026-10-26T01:30:00.000Z');
  });

  it.each(['now', 'tenantId', 'unknown'])(
    'rejects interactive run-due field %s before resolving access',
    async (field) => {
      const { policy, prisma, service } = createService();

      await expect(
        service.runDueRulesForUser(actor(), {
          [field]: field === 'now' ? now.toISOString() : 'unexpected',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(policy.resolve).not.toHaveBeenCalled();
      expect(prisma.staffTaskRecurringRule.findMany).not.toHaveBeenCalled();
    },
  );

  it('uses server time and the actor-scoped rule predicate for dry-run', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findMany.mockResolvedValue([
      {
        id: 'rule-a1',
        title: 'Opening control',
        nextRunAt: scheduledFor,
      },
    ]);
    const { policy, service } = createService({ prisma });

    const result = await service.runDueRulesForUser(actor(), {
      limit: 10,
      dryRun: true,
    });

    expect(policy.buildRuleWhere).toHaveBeenCalledWith(
      accessScope(),
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            status: 'ACTIVE',
            nextRunAt: { lte: now },
          }),
        ]),
      }),
    );
    expect(prisma.staffTaskRecurringRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        take: 10,
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      now: now.toISOString(),
      dryRun: true,
      limit: 10,
      due: 1,
      created: 0,
      skipped: 0,
      failed: 0,
      runs: [
        {
          ruleId: 'rule-a1',
          ruleTitle: 'Opening control',
          scheduledFor: scheduledFor.toISOString(),
          status: 'DUE',
          taskId: null,
          message: null,
        },
      ],
    });
  });

  it('materializes an actor due rule and writes run, task, rule and audit atomically', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findMany.mockResolvedValue([
      {
        id: 'rule-a1',
        title: 'Opening control',
        nextRunAt: scheduledFor,
      },
    ]);
    const rule = ruleMutationRow();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: rule.id }]),
      staffTaskRecurringRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
        update: jest.fn().mockResolvedValue({ id: rule.id }),
      },
      staffTaskRecurringRuleRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-a1' }),
        update: jest.fn().mockResolvedValue({ id: 'run-a1' }),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: allowedStoreId }),
      },
      user: {
        findFirst: jest.fn(),
      },
      staffTaskCatalogAuditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-rule-run' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const materialize = jest.fn().mockResolvedValue({
      id: 'task-a1',
      title: rule.title,
      dueAt: '2026-07-27T09:30:00.000Z',
    });
    const { policy, service } = createService({ materialize, prisma });

    const result = await service.runDueRulesForUser(actor(), {
      limit: 1,
    });

    expect(policy.resolveFreshForMutation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: actorId }),
    );
    expect(tx.staffTaskRecurringRuleRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        ruleId: rule.id,
        scheduledFor,
        status: 'STARTED',
        metadata: expect.objectContaining({
          trigger: 'INTERACTIVE_DUE',
          cadence: 'DAILY',
        }),
      }),
      select: { id: true },
    });
    expect(materialize).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: actorId,
        tenantId,
        accessScope: 'STORES',
        allowedStoreIds: [allowedStoreId],
      }),
      expect.objectContaining({
        storeId: allowedStoreId,
        status: 'OPEN',
      }),
      expect.objectContaining({
        kind: 'RECURRING_RULE',
        automatic: true,
        scheduledFor: scheduledFor.toISOString(),
        ruleRunId: 'run-a1',
      }),
    );
    expect(tx.staffTaskRecurringRule.update).toHaveBeenCalledWith({
      where: { id: rule.id },
      data: expect.objectContaining({
        lastAutomaticRunAt: now,
        lastCreatedTaskId: 'task-a1',
        nextRunAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(tx.staffTaskRecurringRuleRun.update).toHaveBeenCalledWith({
      where: { id: 'run-a1' },
      data: expect.objectContaining({
        status: 'SUCCESS',
        createdTaskId: 'task-a1',
        completedAt: expect.any(Date),
        message: 'Task created',
      }),
      select: { id: true },
    });
    expect(
      tx.staffTaskCatalogAuditEvent.create.mock.calls[0]?.[0].data,
    ).toMatchObject({
      tenantId,
      actorUserId: actorId,
      entityKind: 'RULE',
      entityId: rule.id,
      action: 'TASK_LAUNCHED',
      effectiveStoreId: allowedStoreId,
      changedFields: ['lastAutomaticRunAt', 'lastCreatedTaskId', 'nextRunAt'],
    });
    expect(result).toMatchObject({
      now: now.toISOString(),
      due: 1,
      created: 1,
      skipped: 0,
      failed: 0,
      runs: [
        {
          ruleId: rule.id,
          status: 'SUCCESS',
          taskId: 'task-a1',
          message: 'Task created',
        },
      ],
    });
  });

  it('reports duplicate P2002 processing as skipped without exposing the raw error', async () => {
    const prisma = createPrisma();
    prisma.staffTaskRecurringRule.findMany.mockResolvedValue([
      {
        id: 'rule-a1',
        title: 'Opening control',
        nextRunAt: scheduledFor,
      },
    ]);
    prisma.$transaction.mockRejectedValue({
      code: 'P2002',
      message: 'duplicate secret rule key and internal table name',
    });
    const { service } = createService({ prisma });

    const result = await service.runDueRulesForUser(actor(), {
      limit: 1,
    });

    expect(result).toMatchObject({
      due: 1,
      created: 0,
      skipped: 1,
      failed: 0,
      runs: [
        {
          ruleId: 'rule-a1',
          status: 'SKIPPED',
          taskId: null,
          message: 'Rule is no longer eligible or was already processed',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('duplicate secret');
    expect(JSON.stringify(result)).not.toContain('internal table');
  });
});
