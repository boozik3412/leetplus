import type { ConfigService } from '@nestjs/config';
import {
  DailyDataCoverageScope,
  DailyDataCoverageStatus,
  TenantCustomerStage,
  TenantModule,
} from '@prisma/client';
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
      integrationSyncJob: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      integrationSource: {
        findMany: jest.fn().mockResolvedValue([{ domain: 'club.example' }]),
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

  it('rejects calendar dates that JavaScript would silently normalize', async () => {
    const subject = createSubject();

    await expect(
      subject.service.runDailySync({ date: '2026-02-31' }),
    ).rejects.toThrow('date must be a valid YYYY-MM-DD');
    expect(subject.prisma.tenant.findMany).not.toHaveBeenCalled();
  });

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
      includeCurrentInventory: false,
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

  it('limits an unattended caller to one exact configured tenant slug', async () => {
    const subject = createSubject();
    subject.prisma.tenant.findMany.mockResolvedValue([]);

    await expect(
      subject.service.runDailySync({
        date: '2026-07-27',
        tenantSlug: 'demo',
      }),
    ).resolves.toMatchObject({
      tenants: 0,
      processedTenants: 0,
      skippedTenants: 0,
    });

    expect(subject.prisma.tenant.findMany).toHaveBeenCalledWith({
      where: {
        slug: 'demo',
        integrationCredentials: {
          some: {
            provider: 'LANGAME',
            isActive: true,
            apiKeyEncrypted: { not: null },
          },
        },
        integrationSources: {
          some: { provider: 'LANGAME', isActive: true },
        },
      },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
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

  it('adds an actual-date inventory read before closing the daily QUICK facts coverage', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T09:00:00.000Z'));

    try {
      const subject = createSubject();
      subject.prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-internal', slug: 'internal' },
      ]);
      subject.admissionService.evaluate.mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-internal',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      });
      subject.langameSyncService.syncTenantById
        .mockResolvedValueOnce({ failedSources: 0, partialSources: 0 })
        .mockResolvedValueOnce({ failedSources: 0, partialSources: 0 });
      subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
        sources: 0,
        failedSources: 0,
        sourceResults: [],
      });
      subject.businessSnapshotService.runSnapshotsForTenant.mockResolvedValue({
        runs: [],
      });

      await subject.service.runDailySync();

      expect(subject.langameSyncService.syncTenantById).toHaveBeenNthCalledWith(
        1,
        'tenant-internal',
        {
          dateFrom: '2026-09-13',
          dateTo: '2026-09-13',
          mode: 'QUICK',
          trigger: 'AUTO',
        },
        'LANGAME_DAILY_SYNC',
      );
      expect(subject.langameSyncService.syncTenantById).toHaveBeenNthCalledWith(
        2,
        'tenant-internal',
        {
          mode: 'INVENTORY',
          trigger: 'AUTO',
        },
        'LANGAME_DAILY_SYNC',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('refreshes current inventory after legacy QUICK coverage closes without rewriting sales coverage', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T09:00:00.000Z'));

    try {
      const subject = createSubject();
      subject.prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-internal', slug: 'internal' },
      ]);
      subject.prisma.dailyDataCoverage.findUnique.mockResolvedValue({
        status: 'SUCCESS',
      });
      subject.prisma.integrationSyncJob.findMany.mockResolvedValue([]);
      subject.admissionService.evaluate.mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-internal',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      });
      subject.langameSyncService.syncTenantById.mockResolvedValue({
        failedSources: 0,
        partialSources: 0,
      });

      await subject.service.runDailySync();

      expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledTimes(
        1,
      );
      expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledWith(
        'tenant-internal',
        {
          mode: 'INVENTORY',
          trigger: 'AUTO',
        },
        'LANGAME_DAILY_SYNC',
      );
      expect(subject.prisma.dailyDataCoverage.upsert).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps successful QUICK domain evidence when the current inventory source fails', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T09:00:00.000Z'));

    try {
      const subject = createSubject();
      subject.prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-internal', slug: 'internal' },
      ]);
      subject.admissionService.evaluate.mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-internal',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      });
      subject.langameSyncService.syncTenantById
        .mockResolvedValueOnce({
          sources: 1,
          failedSources: 0,
          partialSources: 0,
          sourceResults: [
            {
              domain: 'club.example',
              status: 'SUCCESS',
              discrepancyLogStatus: 'NOT_REQUIRED',
              discrepancyLogError: null,
              errorMessage: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          sources: 1,
          failedSources: 1,
          partialSources: 0,
          sourceResults: [
            {
              domain: 'club.example',
              status: 'FAILED',
              discrepancyLogStatus: 'NOT_REQUIRED',
              discrepancyLogError: null,
              errorMessage: 'inventory unavailable',
            },
          ],
        });
      subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
        sources: 0,
        failedSources: 0,
        sourceResults: [],
      });

      const result = await subject.service.runDailySync();

      expect(result.results[0]?.scopes).toContainEqual(
        expect.objectContaining({
          scope: DailyDataCoverageScope.BUSINESS_FACTS,
          status: DailyDataCoverageStatus.FAILED,
          skipped: false,
          errorMessage: 'Langame daily facts source is incomplete',
        }) as unknown,
      );
      const failedCoverage = subject.prisma.dailyDataCoverage.upsert.mock.calls
        .map(
          ([call]: [
            {
              create: Record<string, unknown>;
              update: Record<string, unknown>;
            },
          ]) => call.update ?? call.create,
        )
        .find((data: Record<string, unknown>) => data.status === 'FAILED');
      expect(failedCoverage).toMatchObject({
        summary: {
          domains: [expect.objectContaining({ domain: 'club.example' })],
          quick: {
            domains: [expect.objectContaining({ domain: 'club.example' })],
          },
          inventory: {
            domains: [
              expect.objectContaining({
                domain: 'club.example',
                status: 'FAILED',
              }),
            ],
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('requests inventory for a stale active domain and skips it only when every domain is fresh', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-09-14T09:00:00.000Z');
    jest.setSystemTime(now);

    try {
      const subject = createSubject();
      subject.prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-internal', slug: 'internal' },
      ]);
      subject.prisma.dailyDataCoverage.findUnique.mockResolvedValue({
        status: 'SUCCESS',
      });
      subject.prisma.integrationSource.findMany.mockResolvedValue([
        { domain: 'first.example' },
        { domain: 'second.example' },
      ]);
      const successfulInventoryJobs = [
        {
          domain: 'first.example',
          finishedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000 - 1),
        },
        {
          domain: 'second.example',
          finishedAt: new Date(now.getTime() - 35 * 60 * 60 * 1000),
        },
      ];
      subject.prisma.integrationSyncJob.findMany.mockImplementation(
        ({ where }: { where: { finishedAt: { gte: Date } } }) =>
          Promise.resolve(
            successfulInventoryJobs
              .filter((job) => job.finishedAt >= where.finishedAt.gte)
              .map(({ domain }) => ({ domain })),
          ),
      );
      subject.admissionService.evaluate.mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-internal',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      });
      subject.langameSyncService.syncTenantById.mockResolvedValue({
        failedSources: 0,
        partialSources: 0,
      });

      const stale = await subject.service.runDailySync();
      const staleTenant = stale.results[0] as unknown as {
        inventoryRequested: boolean;
      };
      expect(staleTenant.inventoryRequested).toBe(true);
      expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledTimes(
        1,
      );

      successfulInventoryJobs[0].finishedAt = new Date(
        now.getTime() - 35 * 60 * 60 * 1000,
      );
      const fresh = await subject.service.runDailySync();
      const freshTenant = fresh.results[0] as unknown as {
        inventoryRequested: boolean;
      };
      expect(freshTenant.inventoryRequested).toBe(false);
      expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
