import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  StaffAttachmentState,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { StaffAdminRatingAdjustmentsService } from '../src/staff/staff-admin-rating-adjustments.service';
import { StaffAdminRatingService } from '../src/staff/staff-admin-rating.service';
import { StaffAttachmentBindingsService } from '../src/staff/staff-attachment-bindings.service';
import { StaffTasksService } from '../src/staff/staff-tasks.service';
import type { StaffTeamChatService } from '../src/staff/staff-team-chat.service';

const integrationConfirmation = 'run-staff-task-security-postgres-fixtures';
const integrationEnabled =
  process.env.STAFF_TASK_SECURITY_PG_CONFIRM === integrationConfirmation;
const describePostgres = integrationEnabled ? describe : describe.skip;

type Fixture = {
  tenantId: string;
  tenantSlug: string;
  actorUserId: string;
  otherUserId: string;
  allowedStoreId: string;
  deniedStoreId: string;
  taskId: string;
  attachmentId: string;
};

type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

describePostgres('StaffTasksService PostgreSQL security integration', () => {
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

  it('rechecks store scope after locking a task moved concurrently from A1 to A2', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantId);
    const user = buildActor(fixture);
    let raceHookCalls = 0;
    const interceptedPrisma = interceptFirstTransactionRawQuery(
      prisma,
      async () => {
        raceHookCalls += 1;
        await concurrentPrisma.staffTask.update({
          where: { id: fixture.taskId },
          data: { storeId: fixture.deniedStoreId },
        });
      },
    );
    const service = buildService(interceptedPrisma);

    await expect(
      service.createTaskComment(user, fixture.taskId, {
        body: 'Must not survive the scope race',
        attachmentIds: [fixture.attachmentId],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(raceHookCalls).toBe(1);
    await expect(
      prisma.staffTask.findUniqueOrThrow({
        where: { id: fixture.taskId },
        select: { storeId: true },
      }),
    ).resolves.toEqual({ storeId: fixture.deniedStoreId });
    await expect(mutationCounts(prisma, fixture)).resolves.toEqual({
      comments: 0,
      auditEvents: 0,
      bindings: 0,
    });
    await expect(attachmentState(prisma, fixture.attachmentId)).resolves.toBe(
      StaffAttachmentState.PENDING,
    );
  });

  it('deletes a task with its comments and quarantines its only attachment', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantId);
    const user = buildActor(fixture);
    const service = buildService(prisma);

    await service.createTaskComment(user, fixture.taskId, {
      body: 'Photo of the shelf',
      attachmentIds: [fixture.attachmentId],
    });
    await expect(attachmentState(prisma, fixture.attachmentId)).resolves.toBe(
      StaffAttachmentState.BOUND,
    );

    await expect(service.deleteTask(user, fixture.taskId)).resolves.toEqual({
      id: fixture.taskId,
      deleted: true,
    });

    await expect(
      prisma.staffTask.count({ where: { id: fixture.taskId } }),
    ).resolves.toBe(0);
    await expect(mutationCounts(prisma, fixture)).resolves.toEqual({
      comments: 0,
      auditEvents: 0,
      bindings: 0,
    });
    await expect(attachmentState(prisma, fixture.attachmentId)).resolves.toBe(
      StaffAttachmentState.QUARANTINED,
    );
  });

  it('does not delete a task of a club outside the manager scope', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantId);
    await prisma.staffTask.update({
      where: { id: fixture.taskId },
      data: { storeId: fixture.deniedStoreId },
    });

    await expect(
      buildService(prisma).deleteTask(buildActor(fixture), fixture.taskId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      prisma.staffTask.count({ where: { id: fixture.taskId } }),
    ).resolves.toBe(1);
  });

  it('forgives an overdue task in the administrator rating once, until canceled', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantId);
    const now = new Date();
    await prisma.user.update({
      where: { id: fixture.otherUserId },
      data: { role: UserRole.CLUB_ADMINISTRATOR },
    });
    await prisma.staffTask.update({
      where: { id: fixture.taskId },
      data: {
        assignedToUserId: fixture.otherUserId,
        dueAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
    });
    const reviewer: AuthenticatedUser = {
      ...buildActor(fixture),
      permissions: ['view_staff_control', 'manage_staff_control'],
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
    const adjustments = new StaffAdminRatingAdjustmentsService(
      prisma,
      new TenantContextService(),
    );
    const ratings = new StaffAdminRatingService(prisma);
    const ratingOf = async () => {
      const rows = await ratings.getRatings(fixture.tenantId, {
        start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        dateFrom: '2026-11-01',
        dateTo: '2026-11-30',
        storeId: null,
        search: null,
        now,
      });
      return rows.find((row) => row.id === fixture.otherUserId);
    };
    const forgive = {
      userId: fixture.otherUserId,
      kind: 'FORGIVE',
      targetKind: 'TASK_OVERDUE',
      targetId: fixture.taskId,
      reason: 'Ждали поставку',
    };

    await expect(ratingOf()).resolves.toMatchObject({ score: 97 });

    const first = await adjustments.create(reviewer, forgive);
    await expect(adjustments.create(reviewer, forgive)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await adjustments.create(reviewer, {
      userId: fixture.otherUserId,
      kind: 'BONUS',
      points: 4,
      reason: 'Вышел на подмену',
    });

    const rated = await ratingOf();
    expect(rated).toMatchObject({ score: 100, rawScore: 104 });
    expect(
      rated?.items.find((item) => item.kind === 'TASK_OVERDUE'),
    ).toMatchObject({
      points: 0,
      basePoints: -3,
      forgiven: { adjustmentId: first.id, authorName: 'Store A1 actor' },
    });

    await adjustments.cancel(reviewer, first.id);
    await expect(ratingOf()).resolves.toMatchObject({ rawScore: 101 });
    await expect(adjustments.create(reviewer, forgive)).resolves.toMatchObject({
      kind: 'FORGIVE',
    });

    // The table refuses inconsistent rows even without the service.
    await expect(
      prisma.staffAdminRatingAdjustment.create({
        data: {
          tenantId: fixture.tenantId,
          userId: fixture.otherUserId,
          kind: 'FORGIVE',
          points: 5,
          targetKind: 'FINE',
          targetId: randomUUID(),
          reason: 'points on forgiveness',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.staffAdminRatingAdjustment.create({
        data: {
          tenantId: fixture.tenantId,
          userId: fixture.otherUserId,
          kind: 'BONUS',
          points: -2,
          reason: 'negative bonus',
        },
      }),
    ).rejects.toThrow();
  });

  it.each([
    {
      label: 'attachment uploaded by another user',
      attachment: (fixture: Fixture) => ({
        uploadedByUserId: fixture.otherUserId,
        pendingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }),
    },
    {
      label: 'expired attachment',
      attachment: (fixture: Fixture) => ({
        uploadedByUserId: fixture.actorUserId,
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        pendingExpiresAt: new Date(Date.now() - 60 * 1000),
      }),
    },
  ])(
    'rolls back task writes when the binder rejects an $label',
    async ({ attachment }) => {
      const fixture = await createFixture(prisma);
      fixtureTenantIds.add(fixture.tenantId);
      await prisma.staffAttachment.update({
        where: { id: fixture.attachmentId },
        data: attachment(fixture),
      });
      const service = buildService(prisma);

      await expect(
        service.createTaskComment(buildActor(fixture), fixture.taskId, {
          body: 'This comment must roll back',
          attachmentIds: [fixture.attachmentId],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(mutationCounts(prisma, fixture)).resolves.toEqual({
        comments: 0,
        auditEvents: 0,
        bindings: 0,
      });
      await expect(attachmentState(prisma, fixture.attachmentId)).resolves.toBe(
        StaffAttachmentState.PENDING,
      );
    },
  );
});

function buildService(prismaClient: PrismaService) {
  const staffTeamChatService = {
    createSystemNotification: jest.fn(),
  } as unknown as StaffTeamChatService;

  return new StaffTasksService(
    prismaClient,
    new TenantContextService(),
    staffTeamChatService,
    new AccessScopeService(),
    new StaffAttachmentBindingsService(),
  );
}

function buildActor(fixture: Fixture): AuthenticatedUser {
  return {
    id: fixture.actorUserId,
    email: `actor-${fixture.actorUserId}@integration.invalid`,
    fullName: 'Store A1 actor',
    role: UserRole.CLUB_MANAGER,
    permissions: ['view_staff_tasks', 'manage_staff_tasks'],
    isPlatformAdmin: false,
    tenantId: fixture.tenantId,
    tenantSlug: fixture.tenantSlug,
    accessScope: 'STORES',
    allowedStoreIds: [fixture.allowedStoreId],
  };
}

async function createFixture(prismaClient: PrismaClient): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture: Fixture = {
    tenantId: randomUUID(),
    tenantSlug: `staff-task-pg-${suffix}`,
    actorUserId: randomUUID(),
    otherUserId: randomUUID(),
    allowedStoreId: randomUUID(),
    deniedStoreId: randomUUID(),
    taskId: randomUUID(),
    attachmentId: randomUUID(),
  };

  await prismaClient.$transaction(async (tx) => {
    await tx.tenant.create({
      data: {
        id: fixture.tenantId,
        name: `Staff task PG ${suffix}`,
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
          id: fixture.deniedStoreId,
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
          email: `actor-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Store A1 actor',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.otherUserId,
          tenantId: fixture.tenantId,
          email: `other-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Other uploader',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
      ],
    });
    await tx.userStoreAccess.createMany({
      data: [
        {
          userId: fixture.actorUserId,
          storeId: fixture.allowedStoreId,
        },
        {
          userId: fixture.otherUserId,
          storeId: fixture.deniedStoreId,
        },
      ],
    });
    await tx.staffTask.create({
      data: {
        id: fixture.taskId,
        tenantId: fixture.tenantId,
        storeId: fixture.allowedStoreId,
        createdByUserId: fixture.actorUserId,
        title: 'Security race fixture',
      },
    });
    await tx.staffAttachment.create({
      data: {
        id: fixture.attachmentId,
        tenantId: fixture.tenantId,
        uploadedByUserId: fixture.actorUserId,
        fileName: 'evidence.txt',
        contentType: 'text/plain',
        byteSize: 8,
        data: Buffer.from('evidence'),
        state: StaffAttachmentState.PENDING,
        pendingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        stateReasonCode: null,
      },
    });
  });

  return fixture;
}

function interceptFirstTransactionRawQuery(
  prismaClient: PrismaService,
  beforeFirstRawQuery: () => Promise<void>,
): PrismaService {
  const originalTransaction = prismaClient.$transaction.bind(prismaClient) as <
    T,
  >(
    callback: TransactionCallback<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ) => Promise<T>;
  let intercepted = false;

  return new Proxy(prismaClient, {
    get(target, property) {
      if (property === '$transaction') {
        return async <T>(
          callback: TransactionCallback<T>,
          options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
          },
        ) =>
          originalTransaction(async (tx) => {
            const transactionProxy = new Proxy(tx, {
              get(transactionTarget, transactionProperty) {
                if (transactionProperty === '$queryRaw') {
                  return async (query: Prisma.Sql) => {
                    if (!intercepted) {
                      intercepted = true;
                      await beforeFirstRawQuery();
                    }

                    return transactionTarget.$queryRaw(query);
                  };
                }

                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionTarget,
                ) as unknown;
              },
            });

            return callback(transactionProxy);
          }, options);
      }

      return Reflect.get(target, property, target) as unknown;
    },
  });
}

async function mutationCounts(prismaClient: PrismaClient, fixture: Fixture) {
  const [comments, auditEvents, bindings] = await Promise.all([
    prismaClient.staffTaskComment.count({
      where: { tenantId: fixture.tenantId, taskId: fixture.taskId },
    }),
    prismaClient.staffTaskAuditEvent.count({
      where: { tenantId: fixture.tenantId, taskId: fixture.taskId },
    }),
    prismaClient.staffAttachmentBinding.count({
      where: {
        tenantId: fixture.tenantId,
        resourceKind: 'STAFF_TASK',
        resourceId: fixture.taskId,
      },
    }),
  ]);

  return { comments, auditEvents, bindings };
}

async function attachmentState(
  prismaClient: PrismaClient,
  attachmentId: string,
) {
  const attachment = await prismaClient.staffAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    select: { state: true },
  });
  return attachment.state;
}

async function cleanupFixture(prismaClient: PrismaClient, tenantId: string) {
  await prismaClient.$transaction([
    prismaClient.staffAdminRatingAdjustment.deleteMany({ where: { tenantId } }),
    prismaClient.staffAttachmentBinding.deleteMany({ where: { tenantId } }),
    prismaClient.staffTaskComment.deleteMany({ where: { tenantId } }),
    prismaClient.staffTaskAuditEvent.deleteMany({ where: { tenantId } }),
    prismaClient.staffTaskObserver.deleteMany({ where: { tenantId } }),
    prismaClient.staffAttachment.deleteMany({ where: { tenantId } }),
    prismaClient.staffTask.deleteMany({ where: { tenantId } }),
    prismaClient.userStoreAccess.deleteMany({
      where: { user: { tenantId } },
    }),
    prismaClient.user.deleteMany({ where: { tenantId } }),
    prismaClient.store.deleteMany({ where: { tenantId } }),
    prismaClient.tenant.deleteMany({ where: { id: tenantId } }),
  ]);
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
  const safeTemporarySchema = /^staff_task_test_[a-z0-9_]+$/.test(schemaName);

  if (
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing to run staff task fixtures outside a local CI/test database or isolated test schema',
    );
  }
}
