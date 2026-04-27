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
import { ProductsModule } from '../src/products/products.module';
import { ProductsService } from '../src/products/products.service';

describe('API routes (e2e)', () => {
  let app: INestApplication<App>;

  const productsService = {
    findAll: jest.fn(),
    findById: jest.fn(),
  };

  const dashboardService = {
    getSummary: jest.fn(),
  };

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    me: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, ProductsModule, DashboardModule],
      controllers: [AppController],
      providers: [AppService],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(ProductsService)
      .useValue(productsService)
      .overrideProvider(DashboardService)
      .useValue(dashboardService)
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
            role: UserRole.OWNER,
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
          tenantId: 'tenant-1',
          tenantSlug: 'club-a',
        },
      });
  });

  it('/auth/me (GET)', () => {
    authService.me.mockResolvedValue({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      fullName: 'Owner',
      role: 'OWNER',
      tenantId: 'tenant-1',
      tenantSlug: 'club-a',
    });

    return request(app.getHttpServer()).get('/auth/me').expect(200).expect({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      fullName: 'Owner',
      role: 'OWNER',
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

  it('/dashboard/summary (GET)', () => {
    dashboardService.getSummary.mockResolvedValue({
      tenantId: 'tenant-demo',
      tenantSlug: 'demo',
      totalSku: 30,
      activeSku: 30,
      categoriesCount: 13,
      suppliersCount: 10,
      averageMarginPercent: 55.5,
      averageFacing: 2.4,
    });

    return request(app.getHttpServer())
      .get('/dashboard/summary')
      .expect(200)
      .expect({
        tenantId: 'tenant-demo',
        tenantSlug: 'demo',
        totalSku: 30,
        activeSku: 30,
        categoriesCount: 13,
        suppliersCount: 10,
        averageMarginPercent: 55.5,
        averageFacing: 2.4,
      });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });
});
