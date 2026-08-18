import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, TenantCustomerStage, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { CategoriesService } from '../src/categories/categories.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsService } from '../src/products/products.service';
import { StoresService } from '../src/stores/stores.service';
import { SuppliersService } from '../src/suppliers/suppliers.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const integrationConfirmation =
  'run-pilot-assortment-store-scope-postgres-fixtures';
const integrationEnabled =
  process.env.PILOT_ASSORTMENT_SCOPE_PG_CONFIRM === integrationConfirmation;
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
  productA1Id: string;
  productA2Id: string;
  productB1Id: string;
  categoryA1Id: string;
  categoryA2Id: string;
  categoryB1Id: string;
  supplierA1Id: string;
  supplierB1Id: string;
};

describePostgres('Gate 1MT assortment PostgreSQL tenant/store matrix', () => {
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
    const [tenantResidue, userResidue] = await Promise.all([
      prisma.tenant.count({
        where: { slug: { startsWith: 'pilot-assortment-' } },
      }),
      prisma.user.count({
        where: { email: { endsWith: '@integration.invalid' } },
      }),
    ]);
    expect({ tenantResidue, userResidue }).toEqual({
      tenantResidue: 0,
      userResidue: 0,
    });
    await prisma?.$disconnect();
  });

  it('keeps A/A1/A2 and B/B1 reads and explicit store filters isolated', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildProductsService(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(service.findAll(userA1)).resolves.toEqual([
      expect.objectContaining({ id: fixture.productA1Id }),
    ]);

    const tenantAProducts = await service.findAll(userANetwork);
    expect(tenantAProducts.map(({ id }) => id).sort()).toEqual(
      [fixture.productA1Id, fixture.productA2Id].sort(),
    );
    expect(tenantAProducts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.productB1Id }),
      ]),
    );

    await expect(service.findAll(userBNetwork)).resolves.toEqual([
      expect.objectContaining({ id: fixture.productB1Id }),
    ]);

    await expect(
      service.getCatalog({ storeId: fixture.storeA2Id }, userA1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getCatalog({ storeId: fixture.storeB1Id }, userANetwork),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getCatalog({ storeId: fixture.storeA1Id }, userBNetwork),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows fresh NETWORK writes but rejects store-only, cross-tenant and stale subjects', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildProductsService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');
    const article = `PG-${randomUUID()}`;

    const created = await service.create(
      {
        article,
        name: 'Tenant A network product',
        purchasePrice: 10,
        salePrice: 20,
      },
      userANetwork,
    );
    expect(created.tenantId).toBe(fixture.tenantAId);

    await expect(
      service.create(
        {
          article: `STORE-${randomUUID()}`,
          name: 'Forbidden store-scoped product',
          purchasePrice: 10,
          salePrice: 20,
        },
        userA1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.update(
        created.id,
        { name: 'Cross-tenant overwrite' },
        userBNetwork,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.archive(created.id, userBNetwork),
    ).rejects.toBeInstanceOf(NotFoundException);

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

    await expect(
      service.update(created.id, { name: 'Stale JWT overwrite' }, userANetwork),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: created.id },
        select: { tenantId: true, name: true, isActive: true },
      }),
    ).resolves.toEqual({
      tenantId: fixture.tenantAId,
      name: 'Tenant A network product',
      isActive: true,
    });
  });

  it('guards store lifecycle by fresh network scope and keeps external creation on the provisioning path', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildStoresService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(
      service.update(fixture.storeA1Id, { name: 'A1 updated' }, userANetwork),
    ).resolves.toEqual(expect.objectContaining({ name: 'A1 updated' }));
    await expect(
      service.update(
        fixture.storeA1Id,
        { name: 'Cross-tenant overwrite' },
        userBNetwork,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.archive(fixture.storeA2Id, userA1),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.archive(fixture.storeA2Id, userANetwork),
    ).resolves.toEqual(expect.objectContaining({ isActive: false }));

    await prisma.tenant.update({
      where: { id: fixture.tenantBId },
      data: { customerStage: TenantCustomerStage.PILOT },
    });
    await expect(
      service.create({ name: 'B2 must use provisioning' }, userBNetwork),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.store.count({ where: { tenantId: fixture.tenantBId } }),
    ).resolves.toBe(1);

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
    await expect(
      service.update(
        fixture.storeA1Id,
        { name: 'Stale network scope' },
        userANetwork,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps category reads and merge mutations tenant-bound and network-only', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildCategoriesService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(service.findAll(userA1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.findAll(userANetwork)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.categoryA1Id }),
        expect.objectContaining({ id: fixture.categoryA2Id }),
      ]),
    );
    await expect(service.findAll(userBNetwork)).resolves.toEqual([
      expect.objectContaining({ id: fixture.categoryB1Id }),
    ]);

    await expect(
      service.update(
        fixture.categoryA1Id,
        { name: 'Cross-tenant category overwrite' },
        userBNetwork,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.merge(
        {
          categoryIds: [fixture.categoryA1Id, fixture.categoryB1Id],
          targetCategoryId: fixture.categoryA1Id,
        },
        userANetwork,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.merge(
        {
          categoryIds: [fixture.categoryA1Id, fixture.categoryA2Id],
          targetCategoryId: fixture.categoryA1Id,
        },
        userANetwork,
      ),
    ).resolves.toEqual({
      targetCategory: {
        id: fixture.categoryA1Id,
        name: 'Tenant A category 1',
      },
      mergedCategories: 1,
      productsUpdated: 1,
      mappingsUpdated: 0,
    });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: { id: fixture.productA2Id },
        select: { categoryId: true, tenantId: true },
      }),
    ).resolves.toEqual({
      categoryId: fixture.categoryA1Id,
      tenantId: fixture.tenantAId,
    });
    await expect(
      prisma.category.findUnique({ where: { id: fixture.categoryB1Id } }),
    ).resolves.toEqual(
      expect.objectContaining({ tenantId: fixture.tenantBId }),
    );

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
    await expect(
      service.create({ name: 'Stale category write' }, userANetwork),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps supplier lifecycle tenant-bound and rejects store-only or stale writers', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildSuppliersService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(service.findAll(userA1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.findAll(userANetwork)).resolves.toEqual([
      expect.objectContaining({ id: fixture.supplierA1Id }),
    ]);
    await expect(service.findAll(userBNetwork)).resolves.toEqual([
      expect.objectContaining({ id: fixture.supplierB1Id }),
    ]);

    const created = await service.create(
      { name: 'Tenant A supplier 2' },
      userANetwork,
    );
    expect(created.tenantId).toBe(fixture.tenantAId);
    await expect(
      service.update(
        created.id,
        { name: 'Cross-tenant supplier overwrite' },
        userBNetwork,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.archive(created.id, userBNetwork),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(
        created.id,
        { name: 'Tenant A supplier updated' },
        userANetwork,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ name: 'Tenant A supplier updated' }),
    );
    await expect(service.archive(created.id, userANetwork)).resolves.toEqual(
      expect.objectContaining({ isActive: false }),
    );

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
    await expect(
      service.create({ name: 'Stale supplier write' }, userANetwork),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      prisma.supplier.findUniqueOrThrow({
        where: { id: fixture.supplierB1Id },
        select: { tenantId: true, name: true, isActive: true },
      }),
    ).resolves.toEqual({
      tenantId: fixture.tenantBId,
      name: 'Tenant B supplier 1',
      isActive: true,
    });
  });
});

function buildProductsService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new ProductsService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

function buildStoresService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new StoresService(
    prisma,
    new TenantContextService(),
    new ConfigService(),
    freshStoreScopeService,
  );
}

function buildCategoriesService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new CategoriesService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

function buildSuppliersService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new SuppliersService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

function buildUser(
  fixture: Fixture,
  kind: 'A_NETWORK' | 'A1' | 'B_NETWORK',
): AuthenticatedUser {
  if (kind === 'A1') {
    return {
      id: fixture.userA1Id,
      email: `a1-${fixture.userA1Id}@integration.invalid`,
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
      email: `b-network-${fixture.userBNetworkId}@integration.invalid`,
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
    email: `a-network-${fixture.userANetworkId}@integration.invalid`,
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
  const suffix = randomUUID();
  const fixture: Fixture = {
    tenantAId: randomUUID(),
    tenantASlug: `pilot-assortment-a-${suffix}`,
    tenantBId: randomUUID(),
    tenantBSlug: `pilot-assortment-b-${suffix}`,
    storeA1Id: randomUUID(),
    storeA2Id: randomUUID(),
    storeB1Id: randomUUID(),
    userANetworkId: randomUUID(),
    userA1Id: randomUUID(),
    userBNetworkId: randomUUID(),
    productA1Id: randomUUID(),
    productA2Id: randomUUID(),
    productB1Id: randomUUID(),
    categoryA1Id: randomUUID(),
    categoryA2Id: randomUUID(),
    categoryB1Id: randomUUID(),
    supplierA1Id: randomUUID(),
    supplierB1Id: randomUUID(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          name: `Pilot assortment A ${suffix}`,
          slug: fixture.tenantASlug,
        },
        {
          id: fixture.tenantBId,
          name: `Pilot assortment B ${suffix}`,
          slug: fixture.tenantBSlug,
        },
      ],
    });
    await tx.store.createMany({
      data: [
        {
          id: fixture.storeA1Id,
          tenantId: fixture.tenantAId,
          name: 'A1',
        },
        {
          id: fixture.storeA2Id,
          tenantId: fixture.tenantAId,
          name: 'A2',
        },
        {
          id: fixture.storeB1Id,
          tenantId: fixture.tenantBId,
          name: 'B1',
        },
      ],
    });
    await tx.user.createMany({
      data: [
        {
          id: fixture.userANetworkId,
          tenantId: fixture.tenantAId,
          email: `a-network-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.userA1Id,
          tenantId: fixture.tenantAId,
          email: `a1-${suffix}@integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'A1 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.userBNetworkId,
          tenantId: fixture.tenantBId,
          email: `b-network-${suffix}@integration.invalid`,
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
    await tx.category.createMany({
      data: [
        {
          id: fixture.categoryA1Id,
          tenantId: fixture.tenantAId,
          name: 'Tenant A category 1',
        },
        {
          id: fixture.categoryA2Id,
          tenantId: fixture.tenantAId,
          name: 'Tenant A category 2',
        },
        {
          id: fixture.categoryB1Id,
          tenantId: fixture.tenantBId,
          name: 'Tenant B category 1',
        },
      ],
    });
    await tx.supplier.createMany({
      data: [
        {
          id: fixture.supplierA1Id,
          tenantId: fixture.tenantAId,
          name: 'Tenant A supplier 1',
        },
        {
          id: fixture.supplierB1Id,
          tenantId: fixture.tenantBId,
          name: 'Tenant B supplier 1',
        },
      ],
    });
    await tx.product.createMany({
      data: [
        {
          id: fixture.productA1Id,
          tenantId: fixture.tenantAId,
          article: `A1-${suffix}`,
          name: 'A1 product',
          purchasePrice: 10,
          salePrice: 20,
          categoryId: fixture.categoryA1Id,
          supplierId: fixture.supplierA1Id,
        },
        {
          id: fixture.productA2Id,
          tenantId: fixture.tenantAId,
          article: `A2-${suffix}`,
          name: 'A2 product',
          purchasePrice: 10,
          salePrice: 20,
          categoryId: fixture.categoryA2Id,
        },
        {
          id: fixture.productB1Id,
          tenantId: fixture.tenantBId,
          article: `B1-${suffix}`,
          name: 'B1 product',
          purchasePrice: 10,
          salePrice: 20,
          categoryId: fixture.categoryB1Id,
          supplierId: fixture.supplierB1Id,
        },
      ],
    });
    const snapshotDate = new Date();
    await tx.inventorySnapshot.createMany({
      data: [
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          productId: fixture.productA1Id,
          snapshotDate,
          quantity: 5,
        },
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          productId: fixture.productA2Id,
          snapshotDate,
          quantity: 5,
        },
        {
          tenantId: fixture.tenantBId,
          storeId: fixture.storeB1Id,
          productId: fixture.productB1Id,
          snapshotDate,
          quantity: 5,
        },
      ],
    });
  });

  return fixture;
}

async function cleanupFixture(prisma: PrismaClient, tenantId: string) {
  await prisma.$transaction([
    prisma.inventorySnapshot.deleteMany({ where: { tenantId } }),
    prisma.product.deleteMany({ where: { tenantId } }),
    prisma.categorySourceMappingEvent.deleteMany({ where: { tenantId } }),
    prisma.categorySourceMapping.deleteMany({ where: { tenantId } }),
    prisma.category.deleteMany({ where: { tenantId } }),
    prisma.supplier.deleteMany({ where: { tenantId } }),
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
      'DATABASE_URL is required for Gate 1MT PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^pilot_assortment_test_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing Gate 1MT fixtures outside a local CI/test database or isolated test schema',
    );
  }
}
