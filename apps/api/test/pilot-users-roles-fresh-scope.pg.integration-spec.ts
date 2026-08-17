import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import { UsersService } from '../src/users/users.service';

const CURRENT_MIGRATION_COUNT = 180;
const CURRENT_MIGRATION_HEAD = '20260804120000_guest_game_max_pending_rewards';
const REQUIRED_CONFIRMATION = 'run-pilot-users-roles-postgres-fixtures';
const integrationEnabled =
  process.env.PILOT_USERS_ROLES_PG_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;

type Fixture = {
  marker: string;
  tenantAId: string;
  tenantASlug: string;
  tenantBId: string;
  tenantBSlug: string;
  storeA1Id: string;
  storeA2Id: string;
  storeB1Id: string;
  ownerAId: string;
  managerA1Id: string;
  managerA2Id: string;
  ownerBId: string;
};

describePostgres('Gate 1MT users/roles PostgreSQL tenant/store matrix', () => {
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
    const [tenantResidue, userResidue, roleResidue, overrideResidue] =
      await Promise.all([
        prisma.tenant.count({
          where: { slug: { startsWith: 'pilot-users-roles-' } },
        }),
        prisma.user.count({
          where: { email: { endsWith: '@users-roles.integration.invalid' } },
        }),
        prisma.userAccessRole.count({
          where: { name: { startsWith: 'PG users role ' } },
        }),
        prisma.userRoleOverride.count({
          where: { tenant: { slug: { startsWith: 'pilot-users-roles-' } } },
        }),
      ]);

    expect({
      tenantResidue,
      userResidue,
      roleResidue,
      overrideResidue,
    }).toEqual({
      tenantResidue: 0,
      userResidue: 0,
      roleResidue: 0,
      overrideResidue: 0,
    });
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

  it('keeps NETWORK and STORES user inventories inside their tenant/store authority', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const ownerA = buildActor(fixture, 'A_NETWORK');
    const managerA1 = buildActor(fixture, 'A1');
    const ownerB = buildActor(fixture, 'B_NETWORK');

    const networkA = await service.getUsers(ownerA);
    expect(networkA.users.map(({ id }) => id).sort()).toEqual(
      [fixture.ownerAId, fixture.managerA1Id, fixture.managerA2Id].sort(),
    );
    expect(networkA.users.map(({ id }) => id)).not.toContain(fixture.ownerBId);
    expect(networkA.stores.map(({ id }) => id).sort()).toEqual(
      [fixture.storeA1Id, fixture.storeA2Id].sort(),
    );

    const storeA1 = await service.getUsers(managerA1);
    expect(storeA1.users.map(({ id }) => id)).toEqual([fixture.managerA1Id]);
    expect(storeA1.stores.map(({ id }) => id)).toEqual([fixture.storeA1Id]);

    const networkB = await service.getUsers(ownerB);
    expect(networkB.users.map(({ id }) => id)).toEqual([fixture.ownerBId]);
    expect(networkB.stores.map(({ id }) => id)).toEqual([fixture.storeB1Id]);
  });

  it('isolates user and role mutations across tenants', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const ownerA = buildActor(fixture, 'A_NETWORK');
    const ownerB = buildActor(fixture, 'B_NETWORK');

    await expect(
      service.updateUser(ownerA, fixture.managerA1Id, {
        fullName: 'Tenant A1 updated',
      }),
    ).resolves.toMatchObject({
      id: fixture.managerA1Id,
      fullName: 'Tenant A1 updated',
    });
    await expect(
      service.updateUser(ownerB, fixture.managerA1Id, {
        fullName: 'Cross-tenant overwrite',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const role = await service.createAccessRole(ownerA, {
      name: `PG users role ${fixture.marker}`,
      permissions: ['view_staff_tasks'],
    });
    await expect(
      service.updateAccessRole(ownerB, role.id, {
        name: `PG users role foreign ${fixture.marker}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateAccessRole(ownerA, role.id, {
        name: `PG users role ${fixture.marker}`,
        description: 'Tenant A role update',
        permissions: ['view_staff_tasks'],
      }),
    ).resolves.toMatchObject({
      id: role.id,
      description: 'Tenant A role update',
    });

    await service.updateSystemRole(ownerA, UserRole.TRAINEE, {
      permissions: ['view_staff_tasks'],
    });
    const [afterA, afterB, persistedA1] = await Promise.all([
      service.getUsers(ownerA),
      service.getUsers(ownerB),
      prisma.user.findUniqueOrThrow({
        where: { id: fixture.managerA1Id },
        select: { tenantId: true, fullName: true },
      }),
    ]);
    expect(
      afterA.roleOptions.find(({ role: value }) => value === UserRole.TRAINEE),
    ).toMatchObject({ isOverridden: true });
    expect(
      afterB.roleOptions.find(({ role: value }) => value === UserRole.TRAINEE),
    ).toMatchObject({ isOverridden: false });
    expect(persistedA1).toEqual({
      tenantId: fixture.tenantAId,
      fullName: 'Tenant A1 updated',
    });
  });

  it('rejects stale role and capability authority before users/roles work', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const staleOwnerA = buildActor(fixture, 'A_NETWORK');

    await prisma.userRoleOverride.create({
      data: {
        tenantId: fixture.tenantAId,
        role: UserRole.OWNER,
        permissions: ['manage_users'],
      },
    });

    await expect(service.getUsers(staleOwnerA)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.createAccessRole(staleOwnerA, {
        name: `PG users role stale ${fixture.marker}`,
        permissions: ['view_staff_tasks'],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      await prisma.userAccessRole.count({
        where: { tenantId: fixture.tenantAId },
      }),
    ).toBe(0);

    await prisma.userRoleOverride.delete({
      where: {
        tenantId_role: {
          tenantId: fixture.tenantAId,
          role: UserRole.OWNER,
        },
      },
    });
    await prisma.user.update({
      where: { id: fixture.ownerAId },
      data: { role: UserRole.ADMIN },
    });

    await expect(service.getUsers(staleOwnerA)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function buildService(prisma: PrismaService): UsersService {
  const accessScopeService = new AccessScopeService();
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    accessScopeService,
  );

  return new UsersService(
    prisma,
    { hash: jest.fn() } as never,
    new ConfigService({ APP_URL: 'https://users-roles.integration.invalid' }),
    accessScopeService,
    freshStoreScopeService,
    {} as never,
  );
}

function buildActor(
  fixture: Fixture,
  kind: 'A_NETWORK' | 'A1' | 'B_NETWORK',
): AuthenticatedUser {
  if (kind === 'A1') {
    return {
      id: fixture.managerA1Id,
      email: `a1-${fixture.marker}@users-roles.integration.invalid`,
      fullName: 'Tenant A1 manager',
      role: UserRole.CLUB_MANAGER,
      customRoleId: null,
      permissions: resolveUserCapabilities({ role: UserRole.CLUB_MANAGER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantAId,
      tenantSlug: fixture.tenantASlug,
      accessScope: 'STORES',
      allowedStoreIds: [fixture.storeA1Id],
    };
  }

  const isTenantB = kind === 'B_NETWORK';
  return {
    id: isTenantB ? fixture.ownerBId : fixture.ownerAId,
    email: `${isTenantB ? 'b' : 'a'}-${fixture.marker}@users-roles.integration.invalid`,
    fullName: `Tenant ${isTenantB ? 'B' : 'A'} owner`,
    role: UserRole.OWNER,
    customRoleId: null,
    permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
    isPlatformAdmin: false,
    tenantId: isTenantB ? fixture.tenantBId : fixture.tenantAId,
    tenantSlug: isTenantB ? fixture.tenantBSlug : fixture.tenantASlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const marker = randomUUID();
  const fixture: Fixture = {
    marker,
    tenantAId: randomUUID(),
    tenantASlug: `pilot-users-roles-a-${marker}`,
    tenantBId: randomUUID(),
    tenantBSlug: `pilot-users-roles-b-${marker}`,
    storeA1Id: randomUUID(),
    storeA2Id: randomUUID(),
    storeB1Id: randomUUID(),
    ownerAId: randomUUID(),
    managerA1Id: randomUUID(),
    managerA2Id: randomUUID(),
    ownerBId: randomUUID(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          name: `Pilot users roles A ${marker}`,
          slug: fixture.tenantASlug,
        },
        {
          id: fixture.tenantBId,
          name: `Pilot users roles B ${marker}`,
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
          id: fixture.ownerAId,
          tenantId: fixture.tenantAId,
          email: `a-${marker}@users-roles.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.managerA1Id,
          tenantId: fixture.tenantAId,
          email: `a1-${marker}@users-roles.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A1 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.managerA2Id,
          tenantId: fixture.tenantAId,
          email: `a2-${marker}@users-roles.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A2 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.ownerBId,
          tenantId: fixture.tenantBId,
          email: `b-${marker}@users-roles.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant B owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
      ],
    });
    await tx.userStoreAccess.createMany({
      data: [
        { userId: fixture.managerA1Id, storeId: fixture.storeA1Id },
        { userId: fixture.managerA2Id, storeId: fixture.storeA2Id },
      ],
    });
  });

  return fixture;
}

function rememberFixture(tenantIds: Set<string>, fixture: Fixture): void {
  tenantIds.add(fixture.tenantAId);
  tenantIds.add(fixture.tenantBId);
}

async function cleanupFixture(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.userRoleOverride.deleteMany({ where: { tenantId } }),
    prisma.userInvite.deleteMany({ where: { tenantId } }),
    prisma.userStoreAccess.deleteMany({ where: { user: { tenantId } } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.userAccessRole.deleteMany({ where: { tenantId } }),
    prisma.store.deleteMany({ where: { tenantId } }),
    prisma.tenant.deleteMany({ where: { id: tenantId } }),
  ]);
}

function assertSafeIntegrationDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for Gate 1MT users/roles PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^pilot_users_roles_test_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    process.env.NODE_ENV === 'production' ||
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing users/roles fixtures outside a local CI/test database or isolated test schema',
    );
  }
}
