import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { AuthenticatedRequest } from '../src/auth/auth.types';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { DashboardModule } from '../src/dashboard/dashboard.module';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { FactCsvImportService } from '../src/imports/fact-csv-import.service';
import { ImportsModule } from '../src/imports/imports.module';
import { IntegrationsModule } from '../src/integrations/integrations.module';
import { LangameSettingsService } from '../src/integrations/langame-settings.service';
import { LangameSyncService } from '../src/integrations/langame-sync.service';
import { ProductCsvImportService } from '../src/imports/product-csv-import.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsModule } from '../src/products/products.module';
import { ProductsService } from '../src/products/products.service';
import { ReportsEmailService } from '../src/reports/reports-email.service';
import { ReportsExportService } from '../src/reports/reports-export.service';
import { ReportsModule } from '../src/reports/reports.module';
import { ReportsService } from '../src/reports/reports.service';
import { StoresModule } from '../src/stores/stores.module';
import { StoresService } from '../src/stores/stores.service';

describe('API routes (e2e)', () => {
  let app: INestApplication<App>;
  let currentRole: UserRole;

  const productsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };

  const dashboardService = {
    getSummary: jest.fn(),
  };

  const storesService = {
    findAll: jest.fn(),
  };

  const reportsService = {
    getAssortmentReport: jest.fn(),
    getOperationalReport: jest.fn(),
    getSkuPerformanceReport: jest.fn(),
    getReplenishmentReport: jest.fn(),
    getSuppliersPerformanceReport: jest.fn(),
  };

  const reportsExportService = {
    exportReports: jest.fn(),
  };

  const reportsEmailService = {
    sendReport: jest.fn(),
  };

  const productCsvImportService = {
    findRecent: jest.fn(),
    preview: jest.fn(),
    import: jest.fn(),
  };

  const factCsvImportService = {
    previewInventory: jest.fn(),
    importInventory: jest.fn(),
    previewSales: jest.fn(),
    importSales: jest.fn(),
    previewStockMovements: jest.fn(),
    importStockMovements: jest.fn(),
  };

  const langameSyncService = {
    syncTenant: jest.fn(),
    syncConfiguredTenants: jest.fn(),
  };

  const langameSettingsService = {
    getSettings: jest.fn(),
    saveSettings: jest.fn(),
  };

  const prismaService = {};

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    confirmEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    me: jest.fn(),
  };

  beforeEach(async () => {
    process.env.SYNC_SERVICE_TOKEN = 'test-sync-token';
    currentRole = UserRole.OWNER;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AuthModule,
        ProductsModule,
        StoresModule,
        ReportsModule,
        ImportsModule,
        IntegrationsModule,
        DashboardModule,
      ],
      controllers: [AppController],
      providers: [AppService],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(ProductsService)
      .useValue(productsService)
      .overrideProvider(DashboardService)
      .useValue(dashboardService)
      .overrideProvider(StoresService)
      .useValue(storesService)
      .overrideProvider(ReportsService)
      .useValue(reportsService)
      .overrideProvider(ReportsExportService)
      .useValue(reportsExportService)
      .overrideProvider(ReportsEmailService)
      .useValue(reportsEmailService)
      .overrideProvider(ProductCsvImportService)
      .useValue(productCsvImportService)
      .overrideProvider(FactCsvImportService)
      .useValue(factCsvImportService)
      .overrideProvider(LangameSettingsService)
      .useValue(langameSettingsService)
      .overrideProvider(LangameSyncService)
      .useValue(langameSyncService)
      .overrideProvider(PrismaService)
      .useValue(prismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
          request.user = {
            id: 'user-1',
            email: 'owner@club-a.leetplus.ru',
            fullName: 'Owner',
            role: currentRole,
            isPlatformAdmin: true,
            tenantId: 'tenant-1',
            tenantSlug: 'club-a',
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/auth/register (POST)', () => {
    authService.register.mockResolvedValue({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        email: 'owner@club-a.leetplus.ru',
        fullName: 'Owner',
        role: 'OWNER',
        isPlatformAdmin: false,
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      },
    });

    return request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
        organizationName: 'Club A',
        tenantSlug: 'club-a',
        fullName: 'Owner',
      })
      .expect(201)
      .expect({
        accessToken: 'signed-token',
        user: {
          id: 'user-1',
          email: 'owner@club-a.leetplus.ru',
          fullName: 'Owner',
          role: 'OWNER',
          isPlatformAdmin: false,
          tenantId: 'tenant-1',
          tenantSlug: 'club-a',
        },
      });
  });

  it('/auth/login (POST)', () => {
    authService.login.mockResolvedValue({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        email: 'owner@club-a.leetplus.ru',
        fullName: 'Owner',
        role: 'OWNER',
        isPlatformAdmin: false,
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      },
    });

    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
      })
      .expect(201)
      .expect({
        accessToken: 'signed-token',
        user: {
          id: 'user-1',
          email: 'owner@club-a.leetplus.ru',
          fullName: 'Owner',
          role: 'OWNER',
          isPlatformAdmin: false,
          tenantId: 'tenant-1',
          tenantSlug: 'club-a',
        },
      });
  });

  it('/auth/confirm-email (POST)', () => {
    authService.confirmEmail.mockResolvedValue({ ok: true });

    return request(app.getHttpServer())
      .post('/auth/confirm-email')
      .send({ token: 'verification-token' })
      .expect(201)
      .expect({ ok: true });
  });

  it('/auth/resend-verification (POST)', () => {
    authService.resendVerificationEmail.mockResolvedValue({ ok: true });

    return request(app.getHttpServer())
      .post('/auth/resend-verification')
      .send({ email: 'owner@club-a.leetplus.ru' })
      .expect(201)
      .expect({ ok: true });
  });

  it('/auth/me (GET)', () => {
    authService.me.mockResolvedValue({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      fullName: 'Owner',
      role: 'OWNER',
      isPlatformAdmin: true,
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
    });

    return request(app.getHttpServer()).get('/auth/me').expect(200).expect({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      fullName: 'Owner',
      role: 'OWNER',
      isPlatformAdmin: true,
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
    });
  });

  it('/products (GET)', () => {
    productsService.findAll.mockResolvedValue([
      {
        id: 'product-1',
        article: 'DRK-001',
        name: 'Adrenaline Rush 0.449',
      },
    ]);

    return request(app.getHttpServer())
      .get('/products')
      .expect(200)
      .expect([
        {
          id: 'product-1',
          article: 'DRK-001',
          name: 'Adrenaline Rush 0.449',
        },
      ]);
  });

  it('/stores (GET)', () => {
    storesService.findAll.mockResolvedValue([
      {
        id: 'store-1',
        name: 'Club A',
        address: 'Main street',
        isActive: true,
      },
    ]);

    return request(app.getHttpServer())
      .get('/stores')
      .expect(200)
      .expect([
        {
          id: 'store-1',
          name: 'Club A',
          address: 'Main street',
          isActive: true,
        },
      ]);
  });

  it('/dashboard/summary (GET)', () => {
    dashboardService.getSummary.mockResolvedValue({
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
      tenantName: 'Demo Cyber Club',
      periodLabel: 'Текущий месяц',
      skuGrouping: 'club',
      selectedStoreIds: [],
      periodFrom: '2026-04-01',
      periodTo: '2026-04-30',
      totalSku: 30,
      activeSku: 30,
      categoriesCount: 13,
      suppliersCount: 10,
      averageMarginPercent: 55.5,
      averageFacing: 2.4,
      totalRevenue: 100000,
      grossProfit: 52000,
      adjustedGrossProfit: 50000,
      marginPercent: 52,
      adjustedMarginPercent: 50,
      soldQuantity: 1200,
      writeOffAmount: 1500,
      returnAmount: 500,
      stockQuantity: 340,
      outOfStockRiskCount: 4,
      recommendedOrderQuantity: 24,
      salesTrend: [],
      topSkuByRevenue: [],
    });

    return request(app.getHttpServer())
      .get('/dashboard/summary')
      .expect(200)
      .expect({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
        tenantName: 'Demo Cyber Club',
        periodLabel: 'Текущий месяц',
        skuGrouping: 'club',
        selectedStoreIds: [],
        periodFrom: '2026-04-01',
        periodTo: '2026-04-30',
        totalSku: 30,
        activeSku: 30,
        categoriesCount: 13,
        suppliersCount: 10,
        averageMarginPercent: 55.5,
        averageFacing: 2.4,
        totalRevenue: 100000,
        grossProfit: 52000,
        adjustedGrossProfit: 50000,
        marginPercent: 52,
        adjustedMarginPercent: 50,
        soldQuantity: 1200,
        writeOffAmount: 1500,
        returnAmount: 500,
        stockQuantity: 340,
        outOfStockRiskCount: 4,
        recommendedOrderQuantity: 24,
        salesTrend: [],
        topSkuByRevenue: [],
      });
  });

  it('/reports/assortment (GET)', () => {
    reportsService.getAssortmentReport.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      totalSku: 3,
      activeSku: 2,
      inactiveSku: 1,
      averageMarginPercent: 35.5,
      averageMarkupPercent: 55.2,
      categoryBreakdown: [],
      supplierBreakdown: [],
      lowMarginProducts: [],
    });

    return request(app.getHttpServer())
      .get('/reports/assortment')
      .expect(200)
      .expect({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        totalSku: 3,
        activeSku: 2,
        inactiveSku: 1,
        averageMarginPercent: 35.5,
        averageMarkupPercent: 55.2,
        categoryBreakdown: [],
        supplierBreakdown: [],
        lowMarginProducts: [],
      });
  });

  it('/reports/operations (GET)', () => {
    reportsService.getOperationalReport.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-30',
      storeId: null,
      totalRevenue: 1000,
      totalCost: 600,
      grossProfit: 400,
      adjustedGrossProfit: 350,
      marginPercent: 40,
      adjustedMarginPercent: 35,
      soldQuantity: 10,
      writeOffQuantity: 1,
      writeOffAmount: 50,
      returnQuantity: 0,
      returnAmount: 0,
      averageDailyRevenue: 33.3,
      stockQuantity: 25,
      stockDays: 75,
      recommendations: [],
      outOfStockRiskProducts: [],
      productsWithoutSales: [],
    });

    return request(app.getHttpServer())
      .get('/reports/operations?from=2026-04-01&to=2026-04-30')
      .expect(200)
      .expect({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        from: '2026-04-01',
        to: '2026-04-30',
        storeId: null,
        totalRevenue: 1000,
        totalCost: 600,
        grossProfit: 400,
        adjustedGrossProfit: 350,
        marginPercent: 40,
        adjustedMarginPercent: 35,
        soldQuantity: 10,
        writeOffQuantity: 1,
        writeOffAmount: 50,
        returnQuantity: 0,
        returnAmount: 0,
        averageDailyRevenue: 33.3,
        stockQuantity: 25,
        stockDays: 75,
        recommendations: [],
        outOfStockRiskProducts: [],
        productsWithoutSales: [],
      });
  });

  it('/reports/sku-performance (GET)', () => {
    reportsService.getSkuPerformanceReport.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-30',
      storeId: null,
      rows: [],
      abcByRevenue: [],
      abcByProfit: [],
      topByRevenue: [],
      topByProfit: [],
      topByQuantity: [],
      topBySalesPerFacing: [],
      topByProfitPerFacing: [],
    });

    return request(app.getHttpServer())
      .get('/reports/sku-performance?from=2026-04-01&to=2026-04-30')
      .expect(200)
      .expect({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        from: '2026-04-01',
        to: '2026-04-30',
        storeId: null,
        rows: [],
        abcByRevenue: [],
        abcByProfit: [],
        topByRevenue: [],
        topByProfit: [],
        topByQuantity: [],
        topBySalesPerFacing: [],
        topByProfitPerFacing: [],
      });
  });

  it('/reports/suppliers-performance (GET)', () => {
    reportsService.getSuppliersPerformanceReport.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-30',
      storeId: null,
      totalRevenue: 1000,
      totalGrossProfit: 400,
      rows: [],
    });

    return request(app.getHttpServer())
      .get('/reports/suppliers-performance?from=2026-04-01&to=2026-04-30')
      .expect(200)
      .expect({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        from: '2026-04-01',
        to: '2026-04-30',
        storeId: null,
        totalRevenue: 1000,
        totalGrossProfit: 400,
        rows: [],
      });
  });

  it('/reports/replenishment (GET)', () => {
    reportsService.getReplenishmentReport.mockResolvedValue({
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
      from: '2026-04-01',
      to: '2026-04-30',
      storeId: null,
      totalStockQuantity: 5,
      totalDailyNeed: 2,
      totalRecommendedOrder: 6,
      rows: [],
    });

    return request(app.getHttpServer())
      .get('/reports/replenishment?from=2026-04-01&to=2026-04-30')
      .expect(200)
      .expect({
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
        from: '2026-04-01',
        to: '2026-04-30',
        storeId: null,
        totalStockQuantity: 5,
        totalDailyNeed: 2,
        totalRecommendedOrder: 6,
        rows: [],
      });
  });

  it('/reports/export (GET)', () => {
    reportsExportService.exportReports.mockResolvedValue({
      buffer: Buffer.from('report'),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'leetplus-reports-2026-04-01-2026-04-30.csv',
    });

    return request(app.getHttpServer())
      .get('/reports/export?format=csv&from=2026-04-01&to=2026-04-30')
      .expect(200)
      .expect('content-type', /text\/csv/)
      .expect(
        'content-disposition',
        'attachment; filename="leetplus-reports-2026-04-01-2026-04-30.csv"',
      )
      .expect('report');
  });

  it('/reports/email (POST)', () => {
    reportsEmailService.sendReport.mockResolvedValue({
      ok: true,
      recipientEmail: 'owner@club-a.leetplus.ru',
      fileName: 'leetplus-reports-2026-04-01-2026-04-30.xlsx',
    });

    return request(app.getHttpServer())
      .post('/reports/email')
      .send({
        format: 'xlsx',
        from: '2026-04-01',
        to: '2026-04-30',
      })
      .expect(201)
      .expect({
        ok: true,
        recipientEmail: 'owner@club-a.leetplus.ru',
        fileName: 'leetplus-reports-2026-04-01-2026-04-30.xlsx',
      });
  });

  it('/imports/inventory/preview (POST)', () => {
    factCsvImportService.previewInventory.mockResolvedValue({
      totalRows: 1,
      validRows: 1,
      errors: [],
      rows: [],
    });

    return request(app.getHttpServer())
      .post('/imports/inventory/preview')
      .send({ csv: 'Дата,Торговая точка,Артикул,Остаток' })
      .expect(201)
      .expect({
        totalRows: 1,
        validRows: 1,
        errors: [],
        rows: [],
      });
  });

  it('/imports/sales (POST) rejects buyer role', () => {
    currentRole = UserRole.BUYER;

    return request(app.getHttpServer())
      .post('/imports/sales')
      .send({ csv: 'Дата,Торговая точка,Артикул,Количество,Выручка' })
      .expect(403);
  });

  it('/imports/sales (POST)', () => {
    factCsvImportService.importSales.mockResolvedValue({
      importedRows: 1,
      preview: {
        totalRows: 1,
        validRows: 1,
        errors: [],
        rows: [],
      },
    });

    return request(app.getHttpServer())
      .post('/imports/sales')
      .send({ csv: 'Дата,Торговая точка,Артикул,Количество,Выручка' })
      .expect(201)
      .expect({
        importedRows: 1,
        preview: {
          totalRows: 1,
          validRows: 1,
          errors: [],
          rows: [],
        },
      });
  });

  it('/imports/movements/preview (POST)', () => {
    factCsvImportService.previewStockMovements.mockResolvedValue({
      totalRows: 1,
      validRows: 1,
      errors: [],
      rows: [],
    });

    return request(app.getHttpServer())
      .post('/imports/movements/preview')
      .send({ csv: 'Дата,Торговая точка,Артикул,Тип,Количество' })
      .expect(201)
      .expect({
        totalRows: 1,
        validRows: 1,
        errors: [],
        rows: [],
      });
  });

  it('/imports/movements (POST)', () => {
    factCsvImportService.importStockMovements.mockResolvedValue({
      importedRows: 1,
      preview: {
        totalRows: 1,
        validRows: 1,
        errors: [],
        rows: [],
      },
    });

    return request(app.getHttpServer())
      .post('/imports/movements')
      .send({ csv: 'Дата,Торговая точка,Артикул,Тип,Количество' })
      .expect(201)
      .expect({
        importedRows: 1,
        preview: {
          totalRows: 1,
          validRows: 1,
          errors: [],
          rows: [],
        },
      });
  });

  it('/integrations/langame/sync (POST)', () => {
    langameSyncService.syncTenant.mockResolvedValue({
      tenantId: 'tenant-1',
      sources: 3,
      failedSources: 1,
      stores: 4,
      products: 100,
      inventorySnapshots: 80,
      salesFacts: 25,
      discrepancies: 0,
      sourceResults: [],
    });

    return request(app.getHttpServer())
      .post('/integrations/langame/sync')
      .send({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      })
      .expect(201)
      .expect({
        tenantId: 'tenant-1',
        sources: 3,
        failedSources: 1,
        stores: 4,
        products: 100,
        inventorySnapshots: 80,
        salesFacts: 25,
        discrepancies: 0,
        sourceResults: [],
      });
  });

  it('/integrations/langame/sync (POST) rejects manager role', () => {
    currentRole = UserRole.MANAGER;

    return request(app.getHttpServer())
      .post('/integrations/langame/sync')
      .send({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      })
      .expect(403);
  });

  it('/integrations/langame/scheduled/sync (POST)', () => {
    langameSyncService.syncConfiguredTenants.mockResolvedValue({
      mode: 'QUICK',
      tenants: 1,
      results: [],
    });

    return request(app.getHttpServer())
      .post('/integrations/langame/scheduled/sync')
      .set('x-sync-service-token', 'test-sync-token')
      .send({
        mode: 'QUICK',
      })
      .expect(201)
      .expect({
        mode: 'QUICK',
        tenants: 1,
        results: [],
      });
  });

  it('/integrations/langame/settings (GET)', () => {
    langameSettingsService.getSettings.mockResolvedValue({
      tenantName: 'Demo Cyber Club',
      hasApiKey: true,
      domains: ['443.langame.ru'],
      sources: [],
      syncJobs: [],
    });

    return request(app.getHttpServer())
      .get('/integrations/langame/settings')
      .expect(200)
      .expect({
        hasApiKey: true,
        tenantName: 'Demo Cyber Club',
        domains: ['443.langame.ru'],
        sources: [],
        syncJobs: [],
      });
  });

  it('/integrations/langame/settings (PUT)', () => {
    langameSettingsService.saveSettings.mockResolvedValue({
      tenantName: 'Demo Cyber Club',
      hasApiKey: true,
      domains: ['443.langame.ru'],
      sources: [],
      syncJobs: [],
    });

    return request(app.getHttpServer())
      .put('/integrations/langame/settings')
      .send({
        apiKey: 'secret-key',
        domains: ['443.langame.ru'],
      })
      .expect(200)
      .expect({
        hasApiKey: true,
        tenantName: 'Demo Cyber Club',
        domains: ['443.langame.ru'],
        sources: [],
        syncJobs: [],
      });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });
});
