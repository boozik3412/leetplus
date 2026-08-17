import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { GuestsService } from '../src/guests/guests.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshNetworkScopeGuard } from '../src/tenancy/fresh-network-scope.guard';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const CURRENT_MIGRATION_COUNT = 180;
const CURRENT_MIGRATION_HEAD = '20260804120000_guest_game_max_pending_rewards';
const integrationConfirmation =
  'run-pilot-crm-communications-postgres-fixtures';
const integrationEnabled =
  process.env.PILOT_CRM_COMMUNICATIONS_PG_CONFIRM === integrationConfirmation;
const describePostgres = integrationEnabled ? describe : describe.skip;

type Fixture = {
  tenantAId: string;
  tenantASlug: string;
  tenantBId: string;
  tenantBSlug: string;
  storeA1Id: string;
  storeA2Id: string;
  storeB1Id: string;
  userANetworkId: string;
  userA1Id: string;
  userBNetworkId: string;
  guestAId: string;
  guestBId: string;
  taskAId: string;
  taskBId: string;
  eventAId: string;
  eventBId: string;
  marker: string;
};

type Boundary = ReturnType<typeof buildBoundary>;

describePostgres(
  'Gate 1MT CRM communications CURRENT179 PostgreSQL matrix',
  () => {
    let prisma: PrismaService;
    const fixtureTenantIds = new Set<string>();

    beforeAll(async () => {
      assertSafeIntegrationDatabase();
      prisma = new PrismaService();
      await prisma.$connect();
    });

    afterEach(async () => {
      for (const tenantId of fixtureTenantIds) {
        await cleanupFixture(prisma, tenantId);
      }
      fixtureTenantIds.clear();
    });

    afterAll(async () => {
      const [tenantResidue, userResidue, taskResidue, eventResidue] =
        await Promise.all([
          prisma.tenant.count({
            where: { slug: { startsWith: 'pilot-crm-communications-' } },
          }),
          prisma.user.count({
            where: {
              email: { endsWith: '@crm-communications.integration.invalid' },
            },
          }),
          prisma.guestCrmTask.count({
            where: { title: { startsWith: 'PG CRM communications ' } },
          }),
          prisma.guestCrmContactEvent.count({
            where: { note: { startsWith: 'PG CRM communications ' } },
          }),
        ]);

      expect({ tenantResidue, userResidue, taskResidue, eventResidue }).toEqual(
        {
          tenantResidue: 0,
          userResidue: 0,
          taskResidue: 0,
          eventResidue: 0,
        },
      );
      await prisma?.$disconnect();
    });

    it('runs only on the exact canonical CURRENT179 migration baseline', async () => {
      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        ORDER BY migration_name
      `;

      const current179Prefix = migrations.slice(0, CURRENT_MIGRATION_COUNT);
      expect(current179Prefix).toHaveLength(CURRENT_MIGRATION_COUNT);
      expect(current179Prefix.at(-1)?.migration_name).toBe(
        CURRENT_MIGRATION_HEAD,
      );
    });

    it('executes all eight service paths with A/B NETWORK isolation and denies cross-tenant IDs before mutation', async () => {
      const fixture = await createFixture(prisma);
      rememberFixture(fixtureTenantIds, fixture);
      const boundary = buildBoundary(prisma);
      const userA = buildUser(fixture, 'A_NETWORK');
      const userB = buildUser(fixture, 'B_NETWORK');

      const createdTaskA = await executeNetwork(boundary, userA, (service) =>
        service.createGuestCrmTask(userA, {
          guestId: fixture.guestAId,
          title: `PG CRM communications created A ${fixture.marker}`,
        }),
      );
      const createdTaskB = await executeNetwork(boundary, userB, (service) =>
        service.createGuestCrmTask(userB, {
          guestId: fixture.guestBId,
          title: `PG CRM communications created B ${fixture.marker}`,
        }),
      );
      const createdEventA = await executeNetwork(boundary, userA, (service) =>
        service.createGuestCrmContactEvent(userA, {
          guestId: fixture.guestAId,
          channel: 'phone',
          note: `PG CRM communications created event A ${fixture.marker}`,
        }),
      );
      const createdEventB = await executeNetwork(boundary, userB, (service) =>
        service.createGuestCrmContactEvent(userB, {
          guestId: fixture.guestBId,
          channel: 'phone',
          note: `PG CRM communications created event B ${fixture.marker}`,
        }),
      );

      const tasksA = await executeNetwork(boundary, userA, (service) =>
        service.getGuestCrmTasks(userA),
      );
      expect(tasksA.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.taskAId, createdTaskA.id]),
      );
      expect(tasksA.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.taskBId, createdTaskB.id]),
      );

      const reportA = await executeNetwork(boundary, userA, (service) =>
        service.getGuestCrmTaskReport(userA, { pageSize: '1000' }),
      );
      expect(reportA.rows.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.taskAId, createdTaskA.id]),
      );
      expect(reportA.rows.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.taskBId, createdTaskB.id]),
      );

      const exportA = await executeNetwork(boundary, userA, (service) =>
        service.exportGuestCrmTasks(userA, { pageSize: '1000' }),
      );
      const exportTextA = exportA.buffer.toString('utf8');
      expect(exportTextA).toContain(createdTaskA.title);
      expect(exportTextA).not.toContain(createdTaskB.title);

      const usersA = await executeNetwork(boundary, userA, (service) =>
        service.getGuestCrmUsers(userA),
      );
      expect(usersA.map(({ id }) => id).sort()).toEqual(
        [fixture.userANetworkId, fixture.userA1Id].sort(),
      );
      expect(usersA.map(({ id }) => id)).not.toContain(fixture.userBNetworkId);

      const eventsA = await executeNetwork(boundary, userA, (service) =>
        service.getGuestCrmContactEvents(userA),
      );
      expect(eventsA.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.eventAId, createdEventA.id]),
      );
      expect(eventsA.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.eventBId, createdEventB.id]),
      );

      const tasksB = await executeNetwork(boundary, userB, (service) =>
        service.getGuestCrmTasks(userB),
      );
      expect(tasksB.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.taskBId, createdTaskB.id]),
      );
      expect(tasksB.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.taskAId, createdTaskA.id]),
      );

      const reportB = await executeNetwork(boundary, userB, (service) =>
        service.getGuestCrmTaskReport(userB, { pageSize: '1000' }),
      );
      expect(reportB.rows.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.taskBId, createdTaskB.id]),
      );
      expect(reportB.rows.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.taskAId, createdTaskA.id]),
      );

      const exportB = await executeNetwork(boundary, userB, (service) =>
        service.exportGuestCrmTasks(userB, { pageSize: '1000' }),
      );
      const exportTextB = exportB.buffer.toString('utf8');
      expect(exportTextB).toContain(createdTaskB.title);
      expect(exportTextB).not.toContain(createdTaskA.title);

      const usersB = await executeNetwork(boundary, userB, (service) =>
        service.getGuestCrmUsers(userB),
      );
      expect(usersB.map(({ id }) => id)).toEqual([fixture.userBNetworkId]);
      expect(usersB.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.userANetworkId, fixture.userA1Id]),
      );

      const eventsB = await executeNetwork(boundary, userB, (service) =>
        service.getGuestCrmContactEvents(userB),
      );
      expect(eventsB.map(({ id }) => id)).toEqual(
        expect.arrayContaining([fixture.eventBId, createdEventB.id]),
      );
      expect(eventsB.map(({ id }) => id)).not.toEqual(
        expect.arrayContaining([fixture.eventAId, createdEventA.id]),
      );

      await expect(
        executeNetwork(boundary, userA, (service) =>
          service.createGuestCrmTask(userA, {
            guestId: fixture.guestBId,
            title: `PG CRM communications forbidden task ${fixture.marker}`,
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        executeNetwork(boundary, userA, (service) =>
          service.createGuestCrmContactEvent(userA, {
            guestId: fixture.guestBId,
            channel: 'phone',
            note: `PG CRM communications forbidden event ${fixture.marker}`,
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        executeNetwork(boundary, userA, (service) =>
          service.updateGuestCrmTask(userA, fixture.taskBId, {
            status: 'DONE',
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      const updatedTaskA = await executeNetwork(boundary, userA, (service) =>
        service.updateGuestCrmTask(userA, fixture.taskAId, {
          status: 'IN_PROGRESS',
        }),
      );
      expect(updatedTaskA.status).toBe('IN_PROGRESS');

      await expect(
        prisma.guestCrmTask.findUniqueOrThrow({
          where: { id: fixture.taskBId },
          select: { tenantId: true, status: true },
        }),
      ).resolves.toEqual({ tenantId: fixture.tenantBId, status: 'OPEN' });

      const updatedTaskB = await executeNetwork(boundary, userB, (service) =>
        service.updateGuestCrmTask(userB, fixture.taskBId, {
          status: 'IN_PROGRESS',
        }),
      );
      expect(updatedTaskB.status).toBe('IN_PROGRESS');
      expect(
        await prisma.guestCrmTask.count({
          where: {
            title: {
              startsWith: 'PG CRM communications forbidden task',
            },
          },
        }),
      ).toBe(0);
      expect(
        await prisma.guestCrmContactEvent.count({
          where: {
            note: {
              startsWith: 'PG CRM communications forbidden event',
            },
          },
        }),
      ).toBe(0);
    });

    it('fails all eight routes closed for a fresh STORES subject before side effects', async () => {
      const fixture = await createFixture(prisma);
      rememberFixture(fixtureTenantIds, fixture);
      const boundary = buildBoundary(prisma);
      const userA1 = buildUser(fixture, 'A1');
      const before = await effectCounts(prisma, fixture);

      for (const operation of allEightOperations(fixture, userA1)) {
        await expect(
          executeNetwork(boundary, userA1, operation),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }

      await expect(effectCounts(prisma, fixture)).resolves.toEqual(before);
    });

    it('fails all eight routes closed when a NETWORK JWT is stale after a persisted STORES downgrade', async () => {
      const fixture = await createFixture(prisma);
      rememberFixture(fixtureTenantIds, fixture);
      const boundary = buildBoundary(prisma);
      const staleUserA = buildUser(fixture, 'A_NETWORK');
      const before = await effectCounts(prisma, fixture);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: fixture.userANetworkId },
          data: { accessScope: 'STORES' },
        }),
        prisma.userStoreAccess.create({
          data: {
            userId: fixture.userANetworkId,
            storeId: fixture.storeA1Id,
          },
        }),
      ]);

      for (const operation of allEightOperations(fixture, staleUserA)) {
        await expect(
          executeNetwork(boundary, staleUserA, operation),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }

      await expect(effectCounts(prisma, fixture)).resolves.toEqual(before);
    });
  },
);

function buildBoundary(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );
  const guard = new FreshNetworkScopeGuard(freshStoreScopeService);
  const service = new GuestsService(
    prisma,
    new TenantContextService(),
    new ConfigService(),
    null as never,
    null as never,
    null as never,
  );

  return { guard, service };
}

async function executeNetwork<T>(
  boundary: Boundary,
  user: AuthenticatedUser,
  operation: (service: GuestsService) => Promise<T>,
): Promise<T> {
  await boundary.guard.canActivate(executionContext(user));
  return operation(boundary.service);
}

function executionContext(user: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function allEightOperations(
  fixture: Fixture,
  user: AuthenticatedUser,
): ReadonlyArray<(service: GuestsService) => Promise<unknown>> {
  return [
    (service) => service.getGuestCrmTasks(user),
    (service) => service.getGuestCrmTaskReport(user, { pageSize: '1000' }),
    (service) => service.exportGuestCrmTasks(user, { pageSize: '1000' }),
    (service) =>
      service.createGuestCrmTask(user, {
        guestId: fixture.guestAId,
        title: `PG CRM communications denied task ${fixture.marker}`,
      }),
    (service) => service.getGuestCrmUsers(user),
    (service) => service.getGuestCrmContactEvents(user),
    (service) =>
      service.createGuestCrmContactEvent(user, {
        guestId: fixture.guestAId,
        channel: 'phone',
        note: `PG CRM communications denied event ${fixture.marker}`,
      }),
    (service) =>
      service.updateGuestCrmTask(user, fixture.taskAId, {
        status: 'DONE',
      }),
  ];
}

function buildUser(
  fixture: Fixture,
  kind: 'A_NETWORK' | 'A1' | 'B_NETWORK',
): AuthenticatedUser {
  if (kind === 'A1') {
    return {
      id: fixture.userA1Id,
      email: `a1-${fixture.userA1Id}@crm-communications.integration.invalid`,
      fullName: 'A1 manager',
      role: UserRole.CLUB_MANAGER,
      permissions: resolveUserCapabilities({ role: UserRole.CLUB_MANAGER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantAId,
      tenantSlug: fixture.tenantASlug,
      accessScope: 'STORES',
      allowedStoreIds: [fixture.storeA1Id],
    };
  }

  if (kind === 'B_NETWORK') {
    return {
      id: fixture.userBNetworkId,
      email: `b-${fixture.userBNetworkId}@crm-communications.integration.invalid`,
      fullName: 'Tenant B owner',
      role: UserRole.OWNER,
      permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantBId,
      tenantSlug: fixture.tenantBSlug,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
  }

  return {
    id: fixture.userANetworkId,
    email: `a-${fixture.userANetworkId}@crm-communications.integration.invalid`,
    fullName: 'Tenant A owner',
    role: UserRole.OWNER,
    permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
    isPlatformAdmin: false,
    tenantId: fixture.tenantAId,
    tenantSlug: fixture.tenantASlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const marker = randomUUID();
  const fixture: Fixture = {
    tenantAId: randomUUID(),
    tenantASlug: `pilot-crm-communications-a-${marker}`,
    tenantBId: randomUUID(),
    tenantBSlug: `pilot-crm-communications-b-${marker}`,
    storeA1Id: randomUUID(),
    storeA2Id: randomUUID(),
    storeB1Id: randomUUID(),
    userANetworkId: randomUUID(),
    userA1Id: randomUUID(),
    userBNetworkId: randomUUID(),
    guestAId: randomUUID(),
    guestBId: randomUUID(),
    taskAId: randomUUID(),
    taskBId: randomUUID(),
    eventAId: randomUUID(),
    eventBId: randomUUID(),
    marker,
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          name: `Pilot CRM communications A ${marker}`,
          slug: fixture.tenantASlug,
        },
        {
          id: fixture.tenantBId,
          name: `Pilot CRM communications B ${marker}`,
          slug: fixture.tenantBSlug,
        },
      ],
    });
    await tx.store.createMany({
      data: [
        { id: fixture.storeA1Id, tenantId: fixture.tenantAId, name: 'A1' },
        { id: fixture.storeA2Id, tenantId: fixture.tenantAId, name: 'A2' },
        { id: fixture.storeB1Id, tenantId: fixture.tenantBId, name: 'B1' },
      ],
    });
    await tx.user.createMany({
      data: [
        {
          id: fixture.userANetworkId,
          tenantId: fixture.tenantAId,
          email: `a-${marker}@crm-communications.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.userA1Id,
          tenantId: fixture.tenantAId,
          email: `a1-${marker}@crm-communications.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'A1 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.userBNetworkId,
          tenantId: fixture.tenantBId,
          email: `b-${marker}@crm-communications.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant B owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
      ],
    });
    await tx.userStoreAccess.create({
      data: { userId: fixture.userA1Id, storeId: fixture.storeA1Id },
    });
    await tx.guest.createMany({
      data: [
        {
          id: fixture.guestAId,
          tenantId: fixture.tenantAId,
          externalGuestId: `guest-a-${marker}`,
          fullNameMasked: 'Guest A',
        },
        {
          id: fixture.guestBId,
          tenantId: fixture.tenantBId,
          externalGuestId: `guest-b-${marker}`,
          fullNameMasked: 'Guest B',
        },
      ],
    });
    await tx.guestCrmTask.createMany({
      data: [
        {
          id: fixture.taskAId,
          tenantId: fixture.tenantAId,
          guestId: fixture.guestAId,
          createdByUserId: fixture.userANetworkId,
          title: `PG CRM communications seed task A ${marker}`,
        },
        {
          id: fixture.taskBId,
          tenantId: fixture.tenantBId,
          guestId: fixture.guestBId,
          createdByUserId: fixture.userBNetworkId,
          title: `PG CRM communications seed task B ${marker}`,
        },
      ],
    });
    await tx.guestCrmContactEvent.createMany({
      data: [
        {
          id: fixture.eventAId,
          tenantId: fixture.tenantAId,
          guestId: fixture.guestAId,
          createdByUserId: fixture.userANetworkId,
          channel: 'phone',
          note: `PG CRM communications seed event A ${marker}`,
        },
        {
          id: fixture.eventBId,
          tenantId: fixture.tenantBId,
          guestId: fixture.guestBId,
          createdByUserId: fixture.userBNetworkId,
          channel: 'phone',
          note: `PG CRM communications seed event B ${marker}`,
        },
      ],
    });
  });

  return fixture;
}

function rememberFixture(tenantIds: Set<string>, fixture: Fixture) {
  tenantIds.add(fixture.tenantAId);
  tenantIds.add(fixture.tenantBId);
}

async function effectCounts(prisma: PrismaClient, fixture: Fixture) {
  const [taskCount, eventCount, taskA] = await Promise.all([
    prisma.guestCrmTask.count({
      where: {
        tenantId: fixture.tenantAId,
        title: { startsWith: 'PG CRM communications ' },
      },
    }),
    prisma.guestCrmContactEvent.count({
      where: {
        tenantId: fixture.tenantAId,
        note: { startsWith: 'PG CRM communications ' },
      },
    }),
    prisma.guestCrmTask.findUniqueOrThrow({
      where: { id: fixture.taskAId },
      select: { status: true, completedAt: true },
    }),
  ]);

  return { taskCount, eventCount, taskA };
}

async function cleanupFixture(prisma: PrismaClient, tenantId: string) {
  await prisma.$transaction([
    prisma.guestCrmContactEvent.deleteMany({ where: { tenantId } }),
    prisma.guestCrmTask.deleteMany({ where: { tenantId } }),
    prisma.guest.deleteMany({ where: { tenantId } }),
    prisma.userStoreAccess.deleteMany({ where: { user: { tenantId } } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.store.deleteMany({ where: { tenantId } }),
    prisma.tenant.deleteMany({ where: { id: tenantId } }),
  ]);
}

function assertSafeIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for Gate 1MT CRM communications PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^pilot_crm_communications_test_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    process.env.NODE_ENV === 'production' ||
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing CRM communications fixtures outside a local CI/test database or isolated test schema',
    );
  }
}
