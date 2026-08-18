import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  ProductOosExclusionType,
  RecommendationRole,
  RecommendationStatus,
  TenantCustomerStage,
  UserRole,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { CategoriesService } from '../src/categories/categories.service';
import { FactCsvImportService } from '../src/imports/fact-csv-import.service';
import { ProductCsvImportService } from '../src/imports/product-csv-import.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsService } from '../src/products/products.service';
import { ReportsExportService } from '../src/reports/reports-export.service';
import { ReportsService } from '../src/reports/reports.service';
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

  it('keeps product CSV imports tenant-bound and network-only', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildProductCsvImportService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');
    const sharedArticle = `SHARED-${randomUUID()}`;
    const csv = [
      'article,name,category,supplier,purchasePrice,salePrice',
      `${sharedArticle},Tenant A imported product,Tenant A category 1,Tenant A supplier 1,12,24`,
    ].join('\n');

    await prisma.product.create({
      data: {
        tenantId: fixture.tenantBId,
        article: sharedArticle,
        name: 'Tenant B same-article product',
        purchasePrice: 100,
        salePrice: 200,
      },
    });

    await expect(service.preview(csv, userA1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.import(csv, userANetwork, 'products-a.csv'),
    ).resolves.toEqual(expect.objectContaining({ importedRows: 1 }));
    await expect(
      prisma.product.findUniqueOrThrow({
        where: {
          tenantId_article: {
            tenantId: fixture.tenantAId,
            article: sharedArticle,
          },
        },
        select: {
          tenantId: true,
          name: true,
          categoryId: true,
          supplierId: true,
        },
      }),
    ).resolves.toEqual({
      tenantId: fixture.tenantAId,
      name: 'Tenant A imported product',
      categoryId: fixture.categoryA1Id,
      supplierId: fixture.supplierA1Id,
    });
    await expect(
      prisma.product.findUniqueOrThrow({
        where: {
          tenantId_article: {
            tenantId: fixture.tenantBId,
            article: sharedArticle,
          },
        },
        select: { tenantId: true, name: true },
      }),
    ).resolves.toEqual({
      tenantId: fixture.tenantBId,
      name: 'Tenant B same-article product',
    });

    const tenantBPreview = await service.preview(csv, userBNetwork);
    expect(tenantBPreview.validRows).toBe(1);
    expect(tenantBPreview.errors.map(({ field }) => field).sort()).toEqual([
      'category',
      'supplier',
    ]);
    expect(tenantBPreview.rows).toEqual([
      expect.objectContaining({ categoryId: null, supplierId: null }),
    ]);
    await expect(service.import(csv, userBNetwork)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      prisma.product.findUniqueOrThrow({
        where: {
          tenantId_article: {
            tenantId: fixture.tenantBId,
            article: sharedArticle,
          },
        },
        select: { name: true },
      }),
    ).resolves.toEqual({ name: 'Tenant B same-article product' });

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
      service.import(
        'article,name,purchasePrice,salePrice\nSTALE-1,Stale import,1,2',
        userANetwork,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps inventory, sales and movement CSV imports inside the tenant network', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildFactCsvImportService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');
    const { article } = await prisma.product.findUniqueOrThrow({
      where: { id: fixture.productA1Id },
      select: { article: true },
    });
    const date = '2030-01-02';
    const inventoryCsv = `date,store,article,quantity\n${date},A1,${article},17`;
    const salesCsv = `date,store,article,quantity,revenue,cost\n${date},A1,${article},2,48,24`;
    const movementCsv = `date,store,article,type,quantity,amount,reason\n${date},A1,${article},WRITEOFF,1,12,Damaged`;

    await expect(
      service.importInventory(inventoryCsv, userA1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.importInventory(inventoryCsv, userANetwork, 'inventory-a.csv'),
    ).resolves.toEqual(expect.objectContaining({ importedRows: 1 }));
    await expect(
      service.importSales(salesCsv, userANetwork, 'sales-a.csv'),
    ).resolves.toEqual(expect.objectContaining({ importedRows: 1 }));
    await expect(
      service.importStockMovements(
        movementCsv,
        userANetwork,
        'movements-a.csv',
      ),
    ).resolves.toEqual(expect.objectContaining({ importedRows: 1 }));

    await expect(
      Promise.all([
        prisma.inventorySnapshot.count({
          where: {
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            productId: fixture.productA1Id,
            snapshotDate: new Date(date),
          },
        }),
        prisma.salesFact.count({
          where: {
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            productId: fixture.productA1Id,
            saleDate: new Date(date),
          },
        }),
        prisma.stockMovement.count({
          where: {
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            productId: fixture.productA1Id,
            movementDate: new Date(date),
          },
        }),
      ]),
    ).resolves.toEqual([1, 1, 1]);
    await expect(
      Promise.all([
        prisma.inventorySnapshot.count({
          where: { tenantId: fixture.tenantBId, snapshotDate: new Date(date) },
        }),
        prisma.salesFact.count({
          where: { tenantId: fixture.tenantBId, saleDate: new Date(date) },
        }),
        prisma.stockMovement.count({
          where: { tenantId: fixture.tenantBId, movementDate: new Date(date) },
        }),
      ]),
    ).resolves.toEqual([0, 0, 0]);

    await expect(
      service.importInventory(inventoryCsv, userBNetwork),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      prisma.importJob.findFirstOrThrow({
        where: { tenantId: fixture.tenantBId, type: 'INVENTORY_CSV' },
        select: { tenantId: true, status: true, importedRows: true },
      }),
    ).resolves.toEqual({
      tenantId: fixture.tenantBId,
      status: 'FAILED',
      importedRows: 0,
    });

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
      service.importSales(salesCsv, userANetwork),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps assortment and sales reports inside fresh tenant/store scope', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildReportsService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(service.getAssortmentReport(userA1)).resolves.toEqual(
      expect.objectContaining({
        tenantId: fixture.tenantAId,
        totalSku: 1,
        activeSku: 1,
        categoryBreakdown: [
          expect.objectContaining({
            id: fixture.categoryA1Id,
            name: 'Tenant A category 1',
          }),
        ],
      }),
    );
    await expect(service.getAssortmentReport(userANetwork)).resolves.toEqual(
      expect.objectContaining({
        tenantId: fixture.tenantAId,
        totalSku: 2,
        activeSku: 2,
      }),
    );
    await expect(service.getAssortmentReport(userBNetwork)).resolves.toEqual(
      expect.objectContaining({
        tenantId: fixture.tenantBId,
        totalSku: 1,
        activeSku: 1,
      }),
    );

    const period = { from: '2030-02-01', to: '2030-02-28' };
    await expect(
      service.getSalesDetailReport(userA1, {
        ...period,
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getSalesDetailReport(userANetwork, {
        ...period,
        storeId: fixture.storeB1Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exports CSV without foreign tenant/store rows and rejects stale scope', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const exportService = new ReportsExportService(buildReportsService(prisma));
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');
    const saleDate = new Date('2030-02-03');

    await prisma.salesFact.createMany({
      data: [
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          productId: fixture.productA1Id,
          saleDate,
          quantity: 1,
          revenue: 20,
          cost: 10,
          productNameAtSale: 'A1 product',
          storeNameAtSale: 'A1',
        },
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          productId: fixture.productA2Id,
          saleDate,
          quantity: 2,
          revenue: 40,
          cost: 20,
          productNameAtSale: 'A2 product',
          storeNameAtSale: 'A2',
        },
        {
          tenantId: fixture.tenantBId,
          storeId: fixture.storeB1Id,
          productId: fixture.productB1Id,
          saleDate,
          quantity: 3,
          revenue: 60,
          cost: 30,
          productNameAtSale: 'B1 product',
          storeNameAtSale: 'B1',
        },
      ],
    });

    const query = {
      report: 'sales-detail',
      format: 'csv',
      from: '2030-02-01',
      to: '2030-02-28',
    };
    const a1Csv = (
      await exportService.exportReports(userA1, query)
    ).buffer.toString('utf8');
    expect(a1Csv).toContain('A1 product');
    expect(a1Csv).not.toContain('A2 product');
    expect(a1Csv).not.toContain('B1 product');

    const tenantACsv = (
      await exportService.exportReports(userANetwork, query)
    ).buffer.toString('utf8');
    expect(tenantACsv).toContain('A1 product');
    expect(tenantACsv).toContain('A2 product');
    expect(tenantACsv).not.toContain('B1 product');

    const tenantBCsv = (
      await exportService.exportReports(userBNetwork, query)
    ).buffer.toString('utf8');
    expect(tenantBCsv).toContain('B1 product');
    expect(tenantBCsv).not.toContain('A1 product');
    expect(tenantBCsv).not.toContain('A2 product');

    await prisma.$transaction([
      prisma.userStoreAccess.deleteMany({
        where: { userId: fixture.userA1Id },
      }),
      prisma.userStoreAccess.create({
        data: {
          userId: fixture.userA1Id,
          storeId: fixture.storeA2Id,
        },
      }),
    ]);
    await expect(
      exportService.exportReports(userA1, query),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps every local report variant inside fresh tenant/store scope', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildReportsService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const seeded = await seedReportFacts(prisma, fixture);

    const storeReports = [
      await service.getOperationalReport(userA1, seeded.query),
      await service.getInventoryTurnoverReport(userA1, seeded.query),
      await service.getAssortmentMatrixReport(userA1, seeded.query),
      await service.getPlanFactReport(userA1, seeded.query),
      await service.getSalesDetailReport(userA1, seeded.query),
      await service.getSkuPerformanceReport(userA1, seeded.query),
      await service.getSuppliersPerformanceReport(userA1, seeded.query),
      await service.getReplenishmentReport(userA1, seeded.query),
      await service.getNewProductsReport(userA1),
      await service.getLflReport(userA1, { period: 'day' }),
    ];
    storeReports.forEach((report) => {
      expect(report.tenantId).toBe(fixture.tenantAId);
    });
    const storeEvidence = JSON.stringify(storeReports);
    expect(storeEvidence).toContain(fixture.productA1Id);
    expect(storeEvidence).not.toContain(fixture.productA2Id);
    expect(storeEvidence).not.toContain(fixture.productB1Id);
    expect(storeEvidence).not.toContain(fixture.storeA2Id);
    expect(storeEvidence).not.toContain(fixture.storeB1Id);
    expect(storeEvidence).not.toContain('A2 product');
    expect(storeEvidence).not.toContain('B1 product');

    const networkReports = [
      await service.getInventoryTurnoverReport(userANetwork, seeded.query),
      await service.getAssortmentMatrixReport(userANetwork, seeded.query),
      await service.getSkuPerformanceReport(userANetwork, seeded.query),
      await service.getSuppliersPerformanceReport(userANetwork, seeded.query),
      await service.getReplenishmentReport(userANetwork, seeded.query),
      await service.getNewProductsReport(userANetwork),
      await service.getLflReport(userANetwork, { period: 'day' }),
    ];
    const networkEvidence = JSON.stringify(networkReports);
    expect(networkEvidence).toContain(fixture.productA1Id);
    expect(networkEvidence).toContain(fixture.productA2Id);
    expect(networkEvidence).not.toContain(fixture.productB1Id);
    expect(networkEvidence).not.toContain(fixture.storeB1Id);
    expect(networkEvidence).not.toContain('B1 product');
  });

  it('keeps every local CSV/XLSX export inside Store scope', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const exportService = new ReportsExportService(buildReportsService(prisma));
    const userA1 = buildUser(fixture, 'A1');
    const seeded = await seedReportFacts(prisma, fixture);
    const variants = [
      undefined,
      'lfl',
      'sales-detail',
      'replenishment',
      'product-movement',
    ] as const;

    for (const report of variants) {
      const csv = await exportService.exportReports(userA1, {
        ...seeded.query,
        format: 'csv',
        report,
        lflPeriod: 'day',
      });
      const csvEvidence = csv.buffer.toString('utf8');
      expect(csv.contentType).toBe('text/csv; charset=utf-8');
      expect(csv.tenantSlug).toBe(fixture.tenantASlug);
      expect(csvEvidence).toContain('A1 product');
      expect(csvEvidence).not.toContain('A2 product');
      expect(csvEvidence).not.toContain('B1 product');

      const xlsx = await exportService.exportReports(userA1, {
        ...seeded.query,
        format: 'xlsx',
        report,
        lflPeriod: 'day',
      });
      const xlsxEvidence = await workbookText(xlsx.buffer);
      expect(xlsx.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(xlsx.tenantSlug).toBe(fixture.tenantASlug);
      expect(xlsxEvidence).toContain('A1 product');
      expect(xlsxEvidence).not.toContain('A2 product');
      expect(xlsxEvidence).not.toContain('B1 product');
    }
  });

  it('keeps OOS exclusions and recommendation state network- and tenant-bound', async () => {
    const fixture = await createFixture(prisma);
    fixtureTenantIds.add(fixture.tenantAId);
    fixtureTenantIds.add(fixture.tenantBId);
    const service = buildReportsService(prisma);
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userA1 = buildUser(fixture, 'A1');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    await expect(service.getOosExclusions(userA1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const exclusion = await service.createOosExclusion(userANetwork, {
      productId: fixture.productA1Id,
      type: ProductOosExclusionType.SERVICE,
    });
    await expect(service.getOosExclusions(userANetwork)).resolves.toEqual([
      expect.objectContaining({
        id: exclusion.id,
        productId: fixture.productA1Id,
        type: ProductOosExclusionType.SERVICE,
      }),
    ]);
    await expect(service.getOosExclusions(userBNetwork)).resolves.toEqual([]);
    await expect(
      service.createOosExclusion(userBNetwork, {
        productId: fixture.productA1Id,
        type: ProductOosExclusionType.OOS_EXCLUDED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.deleteOosExclusion(userBNetwork, exclusion.id),
    ).rejects.toBeInstanceOf(BadRequestException);

    const recommendationKey = `shared:${randomUUID()}`;
    await service.updateRecommendationState(userANetwork, recommendationKey, {
      status: RecommendationStatus.IN_PROGRESS,
      role: RecommendationRole.BUYER,
      note: 'Tenant A state',
    });
    await service.updateRecommendationState(userBNetwork, recommendationKey, {
      status: RecommendationStatus.DONE,
      role: RecommendationRole.CLUB_MANAGER,
      note: 'Tenant B state',
    });
    await expect(
      service.updateRecommendationState(userA1, recommendationKey, {
        status: RecommendationStatus.DONE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      prisma.recommendationState.findMany({
        where: { recommendationKey },
        orderBy: { tenantId: 'asc' },
        select: { tenantId: true, status: true, note: true },
      }),
    ).resolves.toEqual(
      [
        {
          tenantId: fixture.tenantAId,
          status: RecommendationStatus.IN_PROGRESS,
          note: 'Tenant A state',
        },
        {
          tenantId: fixture.tenantBId,
          status: RecommendationStatus.DONE,
          note: 'Tenant B state',
        },
      ].sort((left, right) => left.tenantId.localeCompare(right.tenantId)),
    );
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

function buildProductCsvImportService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new ProductCsvImportService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

function buildFactCsvImportService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new FactCsvImportService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

function buildReportsService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );

  return new ReportsService(
    prisma,
    new TenantContextService(),
    freshStoreScopeService,
  );
}

async function seedReportFacts(prisma: PrismaClient, fixture: Fixture) {
  const currentDate = new Date();
  currentDate.setUTCDate(currentDate.getUTCDate() - 1);
  currentDate.setUTCHours(0, 0, 0, 0);
  const previousDate = new Date(currentDate);
  previousDate.setUTCFullYear(previousDate.getUTCFullYear() - 1);

  await prisma.$transaction([
    prisma.inventorySnapshot.createMany({
      data: [
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          productId: fixture.productA1Id,
          snapshotDate: currentDate,
          quantity: 11,
        },
        {
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          productId: fixture.productA2Id,
          snapshotDate: currentDate,
          quantity: 22,
        },
        {
          tenantId: fixture.tenantBId,
          storeId: fixture.storeB1Id,
          productId: fixture.productB1Id,
          snapshotDate: currentDate,
          quantity: 33,
        },
      ],
    }),
    prisma.salesFact.createMany({
      data: [
        ...[currentDate, previousDate].map((saleDate) => ({
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          productId: fixture.productA1Id,
          saleDate,
          quantity: 1,
          revenue: 20,
          cost: 10,
          productNameAtSale: 'A1 product',
          storeNameAtSale: 'A1',
        })),
        ...[currentDate, previousDate].map((saleDate) => ({
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          productId: fixture.productA2Id,
          saleDate,
          quantity: 2,
          revenue: 40,
          cost: 20,
          productNameAtSale: 'A2 product',
          storeNameAtSale: 'A2',
        })),
        ...[currentDate, previousDate].map((saleDate) => ({
          tenantId: fixture.tenantBId,
          storeId: fixture.storeB1Id,
          productId: fixture.productB1Id,
          saleDate,
          quantity: 3,
          revenue: 60,
          cost: 30,
          productNameAtSale: 'B1 product',
          storeNameAtSale: 'B1',
        })),
      ],
    }),
  ]);

  const date = currentDate.toISOString().slice(0, 10);
  return { query: { from: date, to: date } };
}

async function workbookText(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const values: string[] = [];
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        values.push(cell.text);
      });
    });
  });
  return values.join('\n');
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
    prisma.salesFact.deleteMany({ where: { tenantId } }),
    prisma.stockMovement.deleteMany({ where: { tenantId } }),
    prisma.importJob.deleteMany({ where: { tenantId } }),
    prisma.productOosExclusion.deleteMany({ where: { tenantId } }),
    prisma.recommendationState.deleteMany({ where: { tenantId } }),
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
