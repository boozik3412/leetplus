import type { ConfigService } from '@nestjs/config';
import { TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import type { BusinessSnapshotService } from './business-snapshot.service';
import type { GuestDataFoundationService } from './guest-data-foundation.service';
import { LangameDailySyncService } from './langame-daily-sync.service';
import type { LangameSyncService } from './langame-sync.service';

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
});
