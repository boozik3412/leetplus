import type { ConfigService } from '@nestjs/config';
import { TenantCustomerStage, TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import type { BusinessSnapshotService } from './business-snapshot.service';
import type { GuestDataFoundationService } from './guest-data-foundation.service';
import { LangameDailySyncService } from './langame-daily-sync.service';
import type { LangameSyncService } from './langame-sync.service';
import { BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE } from './langame.types';

type RunnableDailySyncService = {
  runTenantDailySync(input: {
    tenantId: string;
    slug: string;
    businessDate: Date;
    dateInput: string;
    force: boolean;
  }): Promise<unknown>;
};

describe('LangameDailySyncService tenant execution admission', () => {
  function createSubject() {
    const configService = {
      get: jest.fn(),
    };
    const prisma = {
      tenant: {
        findMany: jest.fn(),
      },
      dailyDataCoverage: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const langameSyncService = {
      syncTenantById: jest.fn(),
    };
    const guestDataFoundationService = {
      syncTenantById: jest.fn(),
    };
    const businessSnapshotService = {
      runSnapshotsForTenant: jest.fn(),
    };
    const admissionService = {
      evaluate: jest.fn(),
    };
    const service = new LangameDailySyncService(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      langameSyncService as unknown as LangameSyncService,
      guestDataFoundationService as unknown as GuestDataFoundationService,
      businessSnapshotService as unknown as BusinessSnapshotService,
      admissionService as unknown as TenantExecutionAdmissionService,
    );

    return {
      service,
      prisma,
      langameSyncService,
      guestDataFoundationService,
      businessSnapshotService,
      admissionService,
    };
  }

  it('skips a denied tenant and continues the daily orchestration for an allowed tenant', async () => {
    const subject = createSubject();
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-denied', slug: 'denied' },
      { id: 'tenant-allowed', slug: 'allowed' },
    ]);
    subject.admissionService.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve(
        tenantId === 'tenant-denied'
          ? {
              allowed: false,
              tenantId,
              reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
              failedRequirement: {
                module: TenantModule.ASSORTMENT,
                action: 'OUTBOUND',
              },
            }
          : {
              allowed: true,
              tenantId,
              reasonCode: 'ALLOWED',
              failedRequirement: null,
              customerStage: TenantCustomerStage.INTERNAL,
            },
      ),
    );
    const runTenantDailySync = jest
      .spyOn(
        subject.service as unknown as RunnableDailySyncService,
        'runTenantDailySync',
      )
      .mockResolvedValue({
        tenantId: 'tenant-allowed',
        slug: 'allowed',
        date: '2026-07-27',
        status: 'PROCESSED',
        skipped: false,
        reasonCode: null,
        failedRequirement: null,
        scopes: [],
      });

    await expect(
      subject.service.runDailySync({ date: '2026-07-27' }),
    ).resolves.toMatchObject({
      date: '2026-07-27',
      tenants: 2,
      processedTenants: 1,
      skippedTenants: 1,
      results: [
        {
          tenantId: 'tenant-denied',
          status: 'SKIPPED',
          skipped: true,
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
          failedRequirement: {
            module: TenantModule.ASSORTMENT,
            action: 'OUTBOUND',
          },
        },
        {
          tenantId: 'tenant-allowed',
          status: 'PROCESSED',
          skipped: false,
        },
      ],
    });
    expect(runTenantDailySync).toHaveBeenCalledTimes(1);
    expect(subject.admissionService.evaluate).toHaveBeenNthCalledWith(
      1,
      'tenant-denied',
      [
        { module: TenantModule.INTEGRATIONS, action: 'OUTBOUND' },
        { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
        { module: TenantModule.GAMIFICATION, action: 'OUTBOUND' },
        { module: TenantModule.STAFF, action: 'OUTBOUND' },
      ],
    );
    expect(runTenantDailySync).toHaveBeenCalledWith({
      tenantId: 'tenant-allowed',
      slug: 'allowed',
      businessDate: new Date('2026-07-27T00:00:00.000Z'),
      dateInput: '2026-07-27',
      force: false,
    });
  });

  it('does not enter any daily sync scope when every tenant is denied', async () => {
    const subject = createSubject();
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-denied-a', slug: 'denied-a' },
      { id: 'tenant-denied-b', slug: 'denied-b' },
    ]);
    subject.admissionService.evaluate.mockImplementation((tenantId: string) =>
      Promise.resolve({
        allowed: false,
        tenantId,
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        failedRequirement: {
          module: TenantModule.ASSORTMENT,
          action: 'OUTBOUND',
        },
      }),
    );

    await expect(
      subject.service.runDailySync({ date: '2026-07-27' }),
    ).resolves.toMatchObject({
      tenants: 2,
      processedTenants: 0,
      skippedTenants: 2,
      results: [
        {
          tenantId: 'tenant-denied-a',
          status: 'SKIPPED',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
          failedRequirement: {
            module: TenantModule.ASSORTMENT,
            action: 'OUTBOUND',
          },
        },
        {
          tenantId: 'tenant-denied-b',
          status: 'SKIPPED',
          reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        },
      ],
    });
    expect(subject.langameSyncService.syncTenantById).not.toHaveBeenCalled();
    expect(
      subject.guestDataFoundationService.syncTenantById,
    ).not.toHaveBeenCalled();
    expect(
      subject.businessSnapshotService.runSnapshotsForTenant,
    ).not.toHaveBeenCalled();
  });

  it('skips an admitted external tenant before any daily scope or coverage mutation', async () => {
    const subject = createSubject();
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-pilot', slug: 'pilot' },
    ]);
    subject.admissionService.evaluate.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-pilot',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.PILOT,
    });
    const runTenantDailySync = jest.spyOn(
      subject.service as unknown as RunnableDailySyncService,
      'runTenantDailySync',
    );

    const result = await subject.service.runDailySync({ date: '2026-07-27' });

    expect(result).toMatchObject({
      tenants: 1,
      processedTenants: 0,
      skippedTenants: 1,
      results: [
        {
          tenantId: 'tenant-pilot',
          status: 'SKIPPED',
          skipped: true,
          reasonCode: BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
          failedRequirement: null,
        },
      ],
    });
    expect(result.results[0]?.scopes).toHaveLength(4);
    for (const scope of result.results[0]?.scopes ?? []) {
      expect(scope).toMatchObject({
        status: 'SKIPPED',
        skipped: true,
        errorMessage: expect.stringContaining(
          'BACKGROUND_EXTERNAL_EXECUTION_DENIED',
        ) as string,
      });
    }

    expect(runTenantDailySync).not.toHaveBeenCalled();
    expect(subject.prisma.dailyDataCoverage.upsert).not.toHaveBeenCalled();
    expect(subject.langameSyncService.syncTenantById).not.toHaveBeenCalled();
    expect(
      subject.guestDataFoundationService.syncTenantById,
    ).not.toHaveBeenCalled();
    expect(
      subject.businessSnapshotService.runSnapshotsForTenant,
    ).not.toHaveBeenCalled();
  });
});
