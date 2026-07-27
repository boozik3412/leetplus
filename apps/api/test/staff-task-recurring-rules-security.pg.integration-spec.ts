import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAttachmentBindingsService } from '../src/staff/staff-attachment-bindings.service';
import { StaffTaskCatalogAccessPolicyService } from '../src/staff/staff-task-catalog-access-policy.service';
import { StaffTaskRecurringRulesService } from '../src/staff/staff-task-recurring-rules.service';
import type { StaffTeamChatService } from '../src/staff/staff-team-chat.service';
import { StaffTasksService } from '../src/staff/staff-tasks.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const integrationConfirmation = 'run-staff-task-recurring-postgres-fixtures';
const integrationEnabled =
  process.env.STAFF_TASK_RECURRING_PG_CONFIRM === integrationConfirmation;
const describePostgres = integrationEnabled ? describe : describe.skip;

type Fixture = {
  tenantId: string;
  tenantSlug: string;
  actorUserId: string;
  assigneeUserId: string;
  allowedStoreId: string;
  otherStoreId: string;
  templateId: string;
  ruleId: string;
};

type HeldMutation = {
  blockerPid: number;
  release: () => void;
  finished: Promise<void>;
};

type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

describePostgres(
  'StaffTaskRecurringRulesService PostgreSQL concurrency integration',
  () => {
    jest.setTimeout(30_000);

    let prisma: PrismaService;
    let concurrentPrisma: PrismaClient;
    const fixtureTenantIds = new Set<string>();

    beforeAll(async () => {
      assertSafeIntegrationDatabase();
      prisma = new PrismaService();
      concurrentPrisma = new PrismaClient();
      await Promise.all([prisma.$connect(), concurrentPrisma.$connect()]);
    });

    afterEach(async () => {
      for (const tenantId of fixtureTenantIds) {
        await cleanupFixture(prisma, tenantId);
      }
      fixtureTenantIds.clear();
    });

    afterAll(async () => {
      await Promise.allSettled([
        prisma?.$disconnect(),
        concurrentPrisma?.$disconnect(),
      ]);
    });

    it('serializes create against a concurrent template archive and rolls the rule back', async () => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      const held = await holdMutation(concurrentPrisma, async (tx) => {
        await tx.staffTaskTemplate.update({
          where: { id: fixture.templateId },
          data: { status: 'ARCHIVED' },
        });
      });
      const operation = observeOperation(
        buildRecurringService(prisma).createRule(buildActor(fixture), {
          templateId: fixture.templateId,
          storeId: fixture.allowedStoreId,
          status: 'ACTIVE',
        }),
      );

      try {
        await expect(
          waitForBlockedBy(prisma, held.blockerPid, operation),
        ).resolves.toBe(true);
      } finally {
        held.release();
        await held.finished;
      }

      const result = await operation.result;
      expectRejectedAsBadRequest(result);
      await expect(
        prisma.staffTaskRecurringRule.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).resolves.toBe(1);
      await expect(catalogMutationCounts(prisma, fixture)).resolves.toEqual({
        tasks: 0,
        taskAudits: 0,
        catalogAudits: 0,
      });
    });

    it('serializes activation against a concurrent template rebind and preserves the paused rule', async () => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      const held = await holdMutation(concurrentPrisma, async (tx) => {
        await tx.staffTaskTemplate.update({
          where: { id: fixture.templateId },
          data: { storeId: fixture.otherStoreId },
        });
      });
      const operation = observeOperation(
        buildRecurringService(prisma).updateRule(
          buildActor(fixture),
          fixture.ruleId,
          { status: 'ACTIVE' },
        ),
      );

      try {
        await expect(
          waitForBlockedBy(prisma, held.blockerPid, operation),
        ).resolves.toBe(true);
      } finally {
        held.release();
        await held.finished;
      }

      const result = await operation.result;
      expectRejectedAsBadRequest(result);
      await expect(ruleMutationState(prisma, fixture.ruleId)).resolves.toEqual({
        status: 'PAUSED',
        storeId: fixture.allowedStoreId,
        templateId: fixture.templateId,
        lastCreatedTaskId: null,
        lastManualRunAt: null,
      });
      await expect(catalogMutationCounts(prisma, fixture)).resolves.toEqual({
        tasks: 0,
        taskAudits: 0,
        catalogAudits: 0,
      });
    });

    it('serializes manual launch against a concurrent template archive and creates no task', async () => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      await prisma.staffTaskRecurringRule.update({
        where: { id: fixture.ruleId },
        data: { status: 'ACTIVE' },
      });
      const held = await holdMutation(concurrentPrisma, async (tx) => {
        await tx.staffTaskTemplate.update({
          where: { id: fixture.templateId },
          data: { status: 'ARCHIVED' },
        });
      });
      const operation = observeOperation(
        buildRecurringService(prisma).createTaskFromRule(
          buildActor(fixture),
          fixture.ruleId,
          {},
        ),
      );

      try {
        await expect(
          waitForBlockedBy(prisma, held.blockerPid, operation),
        ).resolves.toBe(true);
      } finally {
        held.release();
        await held.finished;
      }

      const result = await operation.result;
      expectRejectedAsBadRequest(result);
      await expect(ruleMutationState(prisma, fixture.ruleId)).resolves.toEqual({
        status: 'ACTIVE',
        storeId: fixture.allowedStoreId,
        templateId: fixture.templateId,
        lastCreatedTaskId: null,
        lastManualRunAt: null,
      });
      await expect(catalogMutationCounts(prisma, fixture)).resolves.toEqual({
        tasks: 0,
        taskAudits: 0,
        catalogAudits: 0,
      });
    });

    it('serializes an ACTIVE rule launch against store archival and creates no task', async () => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      await prisma.staffTaskRecurringRule.update({
        where: { id: fixture.ruleId },
        data: {
          status: 'ACTIVE',
          templateId: null,
        },
      });
      const held = await holdMutation(concurrentPrisma, async (tx) => {
        await tx.store.update({
          where: { id: fixture.allowedStoreId },
          data: { isActive: false },
        });
      });
      const operation = observeOperation(
        buildRecurringService(prisma).createTaskFromRule(
          buildActor(fixture),
          fixture.ruleId,
          {},
        ),
      );

      try {
        await expect(
          waitForBlockedBy(prisma, held.blockerPid, operation),
        ).resolves.toBe(true);
      } finally {
        held.release();
        await held.finished;
      }

      const result = await operation.result;
      expectRejectedAsBadRequest(result);
      await expect(ruleMutationState(prisma, fixture.ruleId)).resolves.toEqual({
        status: 'ACTIVE',
        storeId: fixture.allowedStoreId,
        templateId: null,
        lastCreatedTaskId: null,
        lastManualRunAt: null,
      });
      await expect(catalogMutationCounts(prisma, fixture)).resolves.toEqual({
        tasks: 0,
        taskAudits: 0,
        catalogAudits: 0,
      });
    });

    it('serializes task materialization against assignee store-access revocation and rolls back', async () => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      await prisma.staffTaskRecurringRule.update({
        where: { id: fixture.ruleId },
        data: {
          status: 'ACTIVE',
          templateId: null,
          assignedToUserId: fixture.assigneeUserId,
        },
      });
      const held = await holdMutation(concurrentPrisma, async (tx) => {
        await tx.userStoreAccess.delete({
          where: {
            userId_storeId: {
              userId: fixture.assigneeUserId,
              storeId: fixture.allowedStoreId,
            },
          },
        });
      });
      const operation = observeOperation(
        buildRecurringService(prisma).createTaskFromRule(
          buildActor(fixture),
          fixture.ruleId,
          {},
        ),
      );

      try {
        await expect(
          waitForBlockedBy(prisma, held.blockerPid, operation),
        ).resolves.toBe(true);
      } finally {
        held.release();
        await held.finished;
      }

      const result = await operation.result;
      expectRejectedAsBadRequest(result);
      await expect(ruleMutationState(prisma, fixture.ruleId)).resolves.toEqual({
        status: 'ACTIVE',
        storeId: fixture.allowedStoreId,
        templateId: null,
        lastCreatedTaskId: null,
        lastManualRunAt: null,
      });
      await expect(catalogMutationCounts(prisma, fixture)).resolves.toEqual({
        tasks: 0,
        taskAudits: 0,
        catalogAudits: 0,
      });
    });
  },
);

function buildRecurringService(prismaClient: PrismaService) {
  const accessScopeService = new AccessScopeService();
  const staffTeamChatService = {
    createSystemNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as StaffTeamChatService;
  const staffTasksService = new StaffTasksService(
    prismaClient,
    new TenantContextService(),
    staffTeamChatService,
    accessScopeService,
    new StaffAttachmentBindingsService(),
  );

  return new StaffTaskRecurringRulesService(
    prismaClient,
    new ConfigService({ RELEASE_SHA: 'pg-integration' }),
    new StaffTaskCatalogAccessPolicyService(accessScopeService),
    staffTasksService,
  );
}

function buildActor(fixture: Fixture): AuthenticatedUser {
  return {
    id: fixture.actorUserId,
    email: `actor-${fixture.actorUserId}@integration.invalid`,
    fullName: 'Network owner',
    role: UserRole.OWNER,
    permissions: ['view_staff_tasks', 'manage_staff_tasks'],
    isPlatformAdmin: false,
    tenantId: fixture.tenantId,
    tenantSlug: fixture.tenantSlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

async function createFixture(prismaClient: PrismaClient): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture: Fixture = {
    tenantId: randomUUID(),
    tenantSlug: `staff-task-recurring-pg-${suffix}`,
    actorUserId: randomUUID(),
    assigneeUserId: randomUUID(),
    allowedStoreId: randomUUID(),
    otherStoreId: randomUUID(),
    templateId: randomUUID(),
    ruleId: randomUUID(),
  };

  await prismaClient.$transaction(async (tx) => {
    await tx.tenant.create({
      data: {
        id: fixture.tenantId,
        name: `Staff recurring PG ${suffix}`,
        slug: fixture.tenantSlug,
      },
    });
    await tx.store.createMany({
      data: [
        {
          id: fixture.allowedStoreId,
          tenantId: fixture.tenantId,
          name: 'A1',
        },
        {
          id: fixture.otherStoreId,
          tenantId: fixture.tenantId,
          name: 'A2',
        },
      ],
    });
    await tx.user.createMany({
      data: [
        {
          id: fixture.actorUserId,
          tenantId: fixture.tenantId,
          email: `owner-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Network owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.assigneeUserId,
          tenantId: fixture.tenantId,
          email: `assignee-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Store assignee',
          role: UserRole.CLUB_ADMINISTRATOR,
          accessScope: 'STORES',
        },
      ],
    });
    await tx.userStoreAccess.create({
      data: {
        userId: fixture.assigneeUserId,
        storeId: fixture.allowedStoreId,
      },
    });
    await tx.staffTaskTemplate.create({
      data: {
        id: fixture.templateId,
        tenantId: fixture.tenantId,
        storeId: fixture.allowedStoreId,
        createdByUserId: fixture.actorUserId,
        title: 'Opening checklist',
        status: 'ACTIVE',
        type: 'SHIFT',
      },
    });
    await tx.staffTaskRecurringRule.create({
      data: {
        id: fixture.ruleId,
        tenantId: fixture.tenantId,
        templateId: fixture.templateId,
        storeId: fixture.allowedStoreId,
        createdByUserId: fixture.actorUserId,
        title: 'Opening recurring rule',
        cadence: 'DAILY',
        status: 'PAUSED',
        taskType: 'RECURRING',
      },
    });
  });

  return fixture;
}

async function holdMutation(
  prismaClient: PrismaClient,
  mutate: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<HeldMutation> {
  let releaseMutation: () => void = () => undefined;
  let resolveReady: (pid: number) => void = () => undefined;
  let rejectReady: (reason?: unknown) => void = () => undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  const readyPromise = new Promise<number>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const finished = prismaClient
    .$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<Array<{ pid: number }>>(
          Prisma.sql`SELECT pg_backend_pid()::int AS pid`,
        );
        await mutate(tx);
        resolveReady(backend.pid);
        await releasePromise;
      },
      { timeout: 15_000 },
    )
    .catch((error: unknown) => {
      rejectReady(error);
      throw error;
    });

  return {
    blockerPid: await readyPromise,
    release: releaseMutation,
    finished,
  };
}

function observeOperation<T>(promise: Promise<T>) {
  let settled = false;
  const result = promise.then<OperationResult<T>>(
    (value) => {
      settled = true;
      return { ok: true, value };
    },
    (error: unknown) => {
      settled = true;
      return { ok: false, error };
    },
  );

  return {
    isSettled: () => settled,
    result,
  };
}

async function waitForBlockedBy(
  prismaClient: PrismaClient,
  blockerPid: number,
  operation: { isSettled: () => boolean },
) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (operation.isSettled()) {
      return false;
    }

    const [row] = await prismaClient.$queryRaw<Array<{ blocked: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity AS activity
          WHERE activity.datname = current_database()
            AND ${blockerPid} = ANY(pg_blocking_pids(activity.pid))
        ) AS blocked
      `,
    );

    if (row.blocked) {
      return true;
    }

    await delay(25);
  }

  return false;
}

function expectRejectedAsBadRequest<T>(result: OperationResult<T>) {
  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error).toBeInstanceOf(BadRequestException);
  }
}

async function ruleMutationState(prismaClient: PrismaClient, ruleId: string) {
  return prismaClient.staffTaskRecurringRule.findUniqueOrThrow({
    where: { id: ruleId },
    select: {
      status: true,
      storeId: true,
      templateId: true,
      lastCreatedTaskId: true,
      lastManualRunAt: true,
    },
  });
}

async function catalogMutationCounts(
  prismaClient: PrismaClient,
  fixture: Fixture,
) {
  const [tasks, taskAudits, catalogAudits] = await Promise.all([
    prismaClient.staffTask.count({
      where: {
        tenantId: fixture.tenantId,
        sourceRecurringRuleId: fixture.ruleId,
      },
    }),
    prismaClient.staffTaskAuditEvent.count({
      where: {
        tenantId: fixture.tenantId,
        task: { sourceRecurringRuleId: fixture.ruleId },
      },
    }),
    prismaClient.staffTaskCatalogAuditEvent.count({
      where: {
        tenantId: fixture.tenantId,
        entityKind: 'RULE',
        entityId: fixture.ruleId,
      },
    }),
  ]);

  return { tasks, taskAudits, catalogAudits };
}

async function cleanupFixture(prismaClient: PrismaClient, tenantId: string) {
  await prismaClient.$transaction(async (tx) => {
    await tx.staffTaskRecurringRuleRun.deleteMany({ where: { tenantId } });
    await tx.staffTaskCatalogAuditEvent.deleteMany({ where: { tenantId } });
    await tx.staffTaskComment.deleteMany({ where: { tenantId } });
    await tx.staffTaskAuditEvent.deleteMany({ where: { tenantId } });
    await tx.staffTaskObserver.deleteMany({ where: { tenantId } });
    await tx.staffTaskRecurringRule.updateMany({
      where: { tenantId },
      data: { lastCreatedTaskId: null },
    });
    await tx.staffTaskRecurringRule.deleteMany({ where: { tenantId } });
    await tx.staffTask.deleteMany({ where: { tenantId } });
    await tx.staffTaskTemplate.deleteMany({ where: { tenantId } });
    await tx.userStoreAccess.deleteMany({
      where: { user: { tenantId } },
    });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.store.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function assertSafeIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for PostgreSQL integration tests',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^staff_task_test_recurring_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing to run recurring-rule fixtures outside a local CI/test database or isolated recurring test schema',
    );
  }
}
