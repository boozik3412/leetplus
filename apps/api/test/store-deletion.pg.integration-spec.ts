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
      // Children first; every table a test writes to is listed here.
      for (const table of [
        'GuestSession',
        'StaffMember',
        'StaffChecklistTemplate',
        'StaffDisciplinePolicy',
        'ClubRevenueFact',
        'InventorySnapshot',
        'SalesFact',
        'StoreClosure',
        'Product',
        'UserInvite',
      ]) {
        await prisma.$executeRaw(
          Prisma.sql`
            DELETE FROM ${Prisma.raw(`public."${table}"`)}
            WHERE "tenantId" IN (${Prisma.join(tenantIds)})
          `,
        );
      }
      await prisma.$transaction([
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

  it('deletes a club with its data after both confirmations', async () => {
    const tenantId = await createTenant('owner');
    const keep = await createStore(tenantId, 'Основной клуб');
    const target = await createStore(tenantId, 'Клуб с историей');
    const owner = await createUser(tenantId, 'owner', { role: 'OWNER' });
    const networkAdmin = await createUser(tenantId, 'network-admin', {
      role: 'ADMIN',
    });
    const sharedManager = await createUser(tenantId, 'shared-manager', {
      role: 'MANAGER',
      accessScope: 'STORES',
    });
    const onlyHereManager = await createUser(tenantId, 'only-here', {
      role: 'MANAGER',
      accessScope: 'STORES',
    });
    await prisma.userStoreAccess.createMany({
      data: [
        { userId: sharedManager, storeId: keep },
        { userId: sharedManager, storeId: target },
        { userId: onlyHereManager, storeId: target },
      ],
    });
    const product = await prisma.product.create({
      data: {
        tenantId,
        article: `${runId}-cola`,
        name: 'Кола',
        purchasePrice: 50,
        salePrice: 100,
      },
      select: { id: true },
    });
    const day = new Date('2026-10-01T00:00:00.000Z');
    await prisma.salesFact.createMany({
      data: [keep, target].map((storeId) => ({
        tenantId,
        storeId,
        productId: product.id,
        saleDate: day,
        quantity: 1,
        revenue: 100,
        cost: 50,
      })),
    });
    await prisma.inventorySnapshot.create({
      data: {
        tenantId,
        storeId: target,
        productId: product.id,
        snapshotDate: day,
        quantity: 5,
      },
    });
    await prisma.storeClosure.create({
      data: { tenantId, storeId: target, closedFrom: day },
    });
    await prisma.clubRevenueFact.create({
      data: { tenantId, storeId: target, revenueDate: day, totalRevenue: 1000 },
    });
    await prisma.staffDisciplinePolicy.create({
      data: { tenantId, storeId: target },
    });
    const session = await prisma.guestSession.create({
      data: { tenantId, storeId: target, externalSessionId: `${runId}-s1` },
      select: { id: true },
    });
    const clubChecklist = await prisma.staffChecklistTemplate.create({
      data: {
        tenantId,
        storeId: target,
        title: 'Открытие клуба',
        sections: [],
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const invite = await prisma.userInvite.create({
      data: {
        tenantId,
        role: 'MANAGER',
        accessScope: 'STORES',
        storeIds: [target],
        tokenHash: `${runId}-store-invite`,
        expiresAt: new Date(Date.now() + 86_400_000),
        deliveryMode: 'LINK',
      },
      select: { id: true },
    });

    const asOwner = (
      storeId: string,
      storeName: unknown = 'Клуб с историей',
      confirmation: unknown = 'УДАЛИТЬ',
    ) =>
      deletion.deleteStore({
        tenantId,
        storeId,
        actorUserId: owner,
        actorKind: 'NETWORK_OWNER',
        storeName,
        confirmation,
        authorize: (tx) =>
          deletion.assertFreshNetworkOwner(tx, owner, tenantId),
      });

    const preview = await deletion.preview(tenantId, target);
    expect(preview.store).toMatchObject({
      id: target,
      name: 'Клуб с историей',
      langameLinked: false,
    });
    expect(preview.deletes).toEqual(
      expect.arrayContaining([
        { label: 'продажи', count: 1 },
        { label: 'остатки', count: 1 },
        { label: 'дни закрытия', count: 1 },
        { label: 'выручка', count: 1 },
        { label: 'правила дисциплины', count: 1 },
      ]),
    );
    expect(preview.archives).toEqual([{ label: 'чек-листы', count: 1 }]);
    expect(preview.detaches).toEqual([{ label: 'сеансы гостей', count: 1 }]);
    expect(preview.blockers).toEqual([
      'у сотрудников (1) это единственный клуб доступа, сначала дайте им другой клуб или отключите их',
    ]);

    // Both confirmations are required, and only the network owner may act.
    await expect(asOwner(target, 'Клуб')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      asOwner(target, 'Клуб с историей', 'удалить'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      deletion.deleteStore({
        tenantId,
        storeId: target,
        actorUserId: networkAdmin,
        actorKind: 'NETWORK_OWNER',
        storeName: 'Клуб с историей',
        confirmation: 'УДАЛИТЬ',
        authorize: (tx) =>
          deletion.assertFreshNetworkOwner(tx, networkAdmin, tenantId),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(asOwner(target)).rejects.toBeInstanceOf(ConflictException);
    await expect(asOwner(randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await prisma.salesFact.count({ where: { storeId: target } })).toBe(
      1,
    );

    // A disabled account no longer holds the club back.
    await prisma.user.update({
      where: { id: onlyHereManager },
      data: { isActive: false },
    });
    await expect(asOwner(target, '  Клуб с историей ')).resolves.toMatchObject({
      ok: true,
      storeId: target,
      storeName: 'Клуб с историей',
      revokedInvites: 1,
    });

    expect(await prisma.store.count({ where: { id: target } })).toBe(0);
    expect(
      await prisma.salesFact.count({ where: { tenantId, storeId: keep } }),
    ).toBe(1);
    expect(await prisma.salesFact.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.inventorySnapshot.count({ where: { tenantId } })).toBe(
      0,
    );
    expect(await prisma.storeClosure.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.clubRevenueFact.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.staffDisciplinePolicy.count({ where: { tenantId } }),
    ).toBe(0);
    await expect(
      prisma.guestSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ storeId: null });
    await expect(
      prisma.staffChecklistTemplate.findUniqueOrThrow({
        where: { id: clubChecklist.id },
      }),
    ).resolves.toMatchObject({ storeId: null, status: 'ARCHIVED' });
    const revoked = await prisma.userInvite.findUniqueOrThrow({
      where: { id: invite.id },
    });
    expect(revoked.revokedAt).not.toBeNull();
    expect(
      await prisma.userStoreAccess.findMany({
        where: { userId: { in: [sharedManager, onlyHereManager] } },
        select: { userId: true, storeId: true },
      }),
    ).toEqual([{ userId: sharedManager, storeId: keep }]);
    const audit = await prisma.platformAdminAuditEvent.findFirstOrThrow({
      where: {
        tenantId,
        actorUserId: owner,
        action: STORE_DELETED_ACTION,
        targetId: target,
      },
    });
    expect(audit.metadata).toMatchObject({
      actorKind: 'NETWORK_OWNER',
      revokedInvites: 1,
      archived: [{ label: 'чек-листы', count: 1 }],
    });
  });

  it('never deletes the last active club and stays inside the network', async () => {
    const tenantId = await createTenant('last');
    const only = await createStore(tenantId, 'Единственный клуб');
    const archived = await createStore(tenantId, 'Архивный клуб', {
      isActive: false,
      externalClubId: `${runId}-langame`,
    });
    const otherTenant = await createTenant('foreign');
    const foreign = await createStore(otherTenant, 'Чужой клуб');
    await createStore(otherTenant, 'Второй чужой клуб');

    const { stores } = await networks.listStores(admin, tenantId);
    expect(stores.map((store) => store.id)).toEqual([only, archived]);
    const onlyPreview = await networks.previewStoreDeletion(
      admin,
      tenantId,
      only,
    );
    expect(onlyPreview.blockers).toEqual([
      'это единственный действующий клуб сети, сначала добавьте другой',
    ]);
    const langamePreview = await networks.previewStoreDeletion(
      admin,
      tenantId,
      archived,
    );
    expect(langamePreview.store.langameLinked).toBe(true);
    expect(langamePreview.warnings).toHaveLength(1);
    await expect(
      networks.previewStoreDeletion(admin, tenantId, foreign),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      networks.deleteStore(admin, tenantId, only, {
        storeName: 'Единственный клуб',
        confirmation: 'УДАЛИТЬ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      networks.deleteStore(admin, tenantId, foreign, {
        storeName: 'Чужой клуб',
        confirmation: 'УДАЛИТЬ',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      networks.deleteStore(admin, tenantId, archived, {
        storeName: 'Архивный клуб',
        confirmation: 'УДАЛИТЬ',
        extra: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      networks.deleteStore(admin, tenantId, archived, {
        confirmation: 'УДАЛИТЬ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      networks.deleteStore(admin, tenantId, archived, {
        storeName: 'Архивный клуб',
        confirmation: 'УДАЛИТЬ',
      }),
    ).resolves.toMatchObject({ ok: true, storeId: archived });
    expect(await prisma.store.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.store.count({ where: { id: foreign } })).toBe(1);

    const notAdmin = { ...admin, isPlatformAdmin: false };
    await expect(
      networks.previewStoreDeletion(notAdmin, tenantId, only),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      networks.deleteStore(notAdmin, tenantId, only, {
        storeName: 'Единственный клуб',
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
