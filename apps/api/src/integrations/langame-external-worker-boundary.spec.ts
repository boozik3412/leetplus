import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AdminController } from '../admin/admin.controller';
import { ExternalLangameWorkerTenantService } from '../admin/external-langame-worker-tenant.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { apiRuntimeAllowsPath } from '../config/api-runtime-perimeter';
import { PrismaService } from '../prisma/prisma.service';
import { LangameDailySyncService } from './langame-daily-sync.service';
import { LangameExternalWorkerModule } from './langame-external-daily-worker.cli';
import { loadLangameExternalWorkerConfig } from './langame-external-daily-worker';

describe('external data worker and administration runtime separation', () => {
  it('keeps activation guarded by both corporate JWT and platform administrator', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, PlatformAdminGuard]);
    const route = '/admin/tenants/tenant-id/external-langame-worker/apply';
    expect(apiRuntimeAllowsPath('CORPORATE', route)).toBe(true);
    expect(apiRuntimeAllowsPath('GUEST', route)).toBe(false);
    expect(apiRuntimeAllowsPath('CORPORATE', '/guest-portal/me')).toBe(false);
  });

  it('compiles the worker data graph without HTTP, corporate auth, or its own activation writer', async () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      LangameExternalWorkerModule,
    ) as unknown[] | undefined;
    expect(controllers ?? []).toEqual([]);
    const moduleRef = await Test.createTestingModule({
      imports: [LangameExternalWorkerModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(moduleRef.get(LangameDailySyncService)).toBeInstanceOf(
      LangameDailySyncService,
    );
    expect(() => moduleRef.get(AuthService, { strict: false })).toThrow();
    expect(() =>
      moduleRef.get(ExternalLangameWorkerTenantService, { strict: false }),
    ).toThrow();
    await moduleRef.close();
  });

  it('refuses a corporate/worker profile that tries to enable rewards or a scheduler', () => {
    expect(() => loadLangameExternalWorkerConfig({})).toThrow('ENABLED=true');
    expect(() =>
      loadLangameExternalWorkerConfig({
        LANGAME_EXTERNAL_WORKER_ENABLED: 'true',
        LANGAME_EXTERNAL_WORKER_LIVE: 'true',
        LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: 'true',
      }),
    ).toThrow('SCHEDULER_ENABLED=false');
  });
});
