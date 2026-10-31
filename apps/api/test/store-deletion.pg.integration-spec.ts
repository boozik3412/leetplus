import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PlatformNetworkService } from '../src/admin/platform-network.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  STORE_DELETED_ACTION,
  STORE_REFERENCES,
  STORE_REFERENCES_HANDLED_SEPARATELY,
  StoreDeletionService,
} from '../src/stores/store-deletion.service';

const REQUIRED_CONFIRMATION = 'run-store-deletion-postgres-fixtures';
const integrationEnabled =
  process.env.STORE_DELETION_PG_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;

jest.setTimeout(30_000);

describePostgres('club deletion PostgreSQL boundary', () => {
  let prisma: PrismaService;
  let deletion: StoreDeletionService;
  let networks: PlatformNetworkService;
  let admin: AuthenticatedUser;
  const runId = randomUUID().slice(0, 8);
  const slugPrefix = `store-deletion-pg-${runId}`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    deletion = new StoreDeletionService(prisma);
    networks = new PlatformNetworkService(
      prisma,
      { get: () => undefined } as unknown as ConfigService,
      deletion,
    );

    const adminTenant = await createTenant('authority');
    const adminUser = await createUser(adminTenant, 'admin', {
      isPlatformAdmin: true,
    });
    admin = {
      id: adminUser,
      tenantId: adminTenant,
      isPlatformAdmin: true,
      isActive: true,
    } as AuthenticatedUser;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const tenants = await prisma.tenant.findMany({
      where: { slug: { startsWith: slugPrefix } },
      select: { id: true },
    });
    const tenantIds = tenants.map(({ id }) => id);
    // Audit rows are removed by actor before the actors themselves, so the
    // shared smoke database is left exactly as it was found.
    await prisma.platformAdminAuditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: createdUserIds } },
          { tenantId: { in: tenantIds } },
        ],
      },
    });
    if (tenantIds.length > 0) {
      await prisma.$transaction([
        prisma.storeClosure.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.userInvite.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.userStoreAccess.deleteMany({
          where: { user: { tenantId: { in: tenantIds } } },
        }),
        prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } }),
        prisma.store.deleteMany({ where: { tenantId: { in: tenantIds } } }),
        prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      ]);
    }
    await prisma.$disconnect();
  });

  it('knows every column that can point at a club', async () => {
    const foreignKeys = await prisma.$queryRaw<Array<{ ref: string }>>(
      Prisma.sql`
        SELECT DISTINCT referencing.relname || '.' || attribute.attname AS ref
        FROM pg_catalog.pg_constraint AS fk
        JOIN pg_catalog.pg_class AS referencing ON referencing.oid = fk.conrelid
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = fk.conrelid
         AND attribute.attnum = ANY(fk.conkey)
        WHERE fk.contype = 'f'
          AND fk.confrelid = 'public."Store"'::regclass
          AND attribute.attname <> 'tenantId'
      `,
    );
    const namedColumns = await prisma.$queryRaw<Array<{ ref: string }>>(
      Prisma.sql`
        SELECT table_name || '.' || column_name AS ref
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name <> 'Store'
          AND (column_name ILIKE '%storeid' OR column_name ILIKE '%storeids')
      `,
    );
    const known = new Set([
      ...STORE_REFERENCES.map(
        (reference) => `${reference.table}.${reference.column}`,
      ),
      ...STORE_REFERENCES_HANDLED_SEPARATELY,
    ]);
    const catalog = new Set(
      [...foreignKeys, ...namedColumns].map((row) => row.ref),
    );

    expect([...catalog].filter((ref) => !known.has(ref)).sort()).toEqual([]);
    expect([...known].filter((ref) => !catalog.has(ref)).sort()).toEqual([]);
  });

  it('lets a network owner delete an empty club and refuses everything else', async () => {
    const tenantId = await createTenant('owner');
    const keep = await createStore(tenantId, 'Основной клуб');
    const empty = await createStore(tenantId, 'Пустой клуб');
    const withClosure = await createStore(tenantId, 'Клуб с закрытием');
    const withStaff = await createStore(tenantId, 'Клуб с сотрудником');
    const withInvite = await createStore(tenantId, 'Клуб с приглашением');
    const langame = await createStore(tenantId, 'Клуб из Langame', {
      externalClubId: `${runId}-langame`,
    });
    const owner = await createUser(tenantId, 'owner', { role: 'OWNER' });
    const networkAdmin = await createUser(tenantId, 'network-admin', {
      role: 'ADMIN',
    });
    const storeManager = await createUser(tenantId, 'store-manager', {
      role: 'MANAGER',
      accessScope: 'STORES',
    });
    await prisma.userStoreAccess.create({
      data: { userId: storeManager, storeId: withStaff },
    });
    await prisma.storeClosure.create({
      data: {
        tenantId,
        storeId: withClosure,
        closedFrom: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    await prisma.userInvite.create({
      data: {
        tenantId,
        role: 'MANAGER',
        accessScope: 'STORES',
        storeIds: [withInvite],
        tokenHash: `${runId}-store-invite`,
        expiresAt: new Date(Date.now() + 86_400_000),
        deliveryMode: 'LINK',
      },
    });

    const asOwner = (storeId: string, confirmation: unknown = 'УДАЛИТЬ') =>
      deletion.deleteStore({
        tenantId,
        storeId,
        actorUserId: owner,
        actorKind: 'NETWORK_OWNER',
        confirmation,
        authorize: (tx) =>
          deletion.assertFreshNetworkOwner(tx, owner, tenantId),
      });

    const candidates = await deletion.listCandidates(tenantId);
    const blockersOf = (storeId: string) =>
      candidates.find((candidate) => candidate.id === storeId)?.blockers;
    expect(blockersOf(empty)).toEqual([]);
    expect(blockersOf(keep)).toEqual([]);
    expect(blockersOf(withClosure)).toEqual(['дни закрытия']);
    expect(blockersOf(withStaff)).toEqual([
      'сотрудники с доступом только к этому клубу',
    ]);
    expect(blockersOf(withInvite)).toEqual(['неиспользованные приглашения']);
    expect(blockersOf(langame)).toEqual(['подключение к Langame']);

    await expect(asOwner(empty, 'удалить')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      deletion.deleteStore({
        tenantId,
        storeId: empty,
        actorUserId: networkAdmin,
        actorKind: 'NETWORK_OWNER',
        confirmation: 'УДАЛИТЬ',
        authorize: (tx) =>
          deletion.assertFreshNetworkOwner(tx, networkAdmin, tenantId),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    for (const blocked of [withClosure, withStaff, withInvite, langame]) {
      await expect(asOwner(blocked)).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(asOwner(randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await expect(asOwner(empty)).resolves.toMatchObject({
      ok: true,
      storeId: empty,
      storeName: 'Пустой клуб',
    });
    expect(await prisma.store.count({ where: { id: empty } })).toBe(0);
    expect(
      await prisma.platformAdminAuditEvent.count({
        where: {
          tenantId,
          actorUserId: owner,
          action: STORE_DELETED_ACTION,
          targetId: empty,
        },
      }),
    ).toBe(1);

    // Other clubs stay untouched by the refused attempts.
    expect(
      await prisma.store.count({
        where: {
          id: { in: [keep, withClosure, withStaff, withInvite, langame] },
        },
      }),
    ).toBe(5);
  });

  it('never deletes the last active club and stays inside the network', async () => {
    const tenantId = await createTenant('last');
    const only = await createStore(tenantId, 'Единственный клуб');
    const archived = await createStore(tenantId, 'Архивный клуб', {
      isActive: false,
    });
    const otherTenant = await createTenant('foreign');
    const foreign = await createStore(otherTenant, 'Чужой клуб');
    await createStore(otherTenant, 'Второй чужой клуб');

    const candidates = await networks.listStores(admin, tenantId);
    expect(
      candidates.stores.find((store) => store.id === only)?.blockers,
    ).toEqual(['это единственный действующий клуб сети']);

    await expect(
      networks.deleteStore(admin, tenantId, only, { confirmation: 'УДАЛИТЬ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      networks.deleteStore(admin, tenantId, foreign, {
        confirmation: 'УДАЛИТЬ',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      networks.deleteStore(admin, tenantId, archived, {
        confirmation: 'УДАЛИТЬ',
        extra: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      networks.deleteStore(admin, tenantId, archived, {
        confirmation: 'УДАЛИТЬ',
      }),
    ).resolves.toMatchObject({ ok: true, storeId: archived });
    expect(await prisma.store.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.store.count({ where: { id: foreign } })).toBe(1);

    const notAdmin = { ...admin, isPlatformAdmin: false };
    await expect(
      networks.deleteStore(notAdmin, tenantId, only, {
        confirmation: 'УДАЛИТЬ',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  async function createTenant(suffix: string): Promise<string> {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Store deletion ${suffix}`,
        slug: `${slugPrefix}-${suffix}`,
        status: 'ACTIVE',
        customerStage: 'INTERNAL',
        onboardingStatus: 'ACTIVE',
      },
      select: { id: true },
    });
    return tenant.id;
  }

  async function createStore(
    tenantId: string,
    name: string,
    data: { isActive?: boolean; externalClubId?: string } = {},
  ): Promise<string> {
    const store = await prisma.store.create({
      data: { tenantId, name, ...data },
      select: { id: true },
    });
    return store.id;
  }

  async function createUser(
    tenantId: string,
    suffix: string,
    data: {
      role?: 'OWNER' | 'ADMIN' | 'MANAGER';
      accessScope?: 'NETWORK' | 'STORES';
      isPlatformAdmin?: boolean;
    } = {},
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `${slugPrefix}-${suffix}@example.test`,
        passwordHash: 'not-a-login-fixture',
        role: data.role ?? 'OWNER',
        accessScope: data.accessScope ?? 'NETWORK',
        isActive: true,
        isPlatformAdmin: data.isPlatformAdmin ?? false,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }
});

function assertSafeIntegrationDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const host = new URL(databaseUrl).hostname;
  if (!['127.0.0.1', 'localhost', 'postgres'].includes(host)) {
    throw new Error('Club deletion fixtures run only on a local database');
  }
}
