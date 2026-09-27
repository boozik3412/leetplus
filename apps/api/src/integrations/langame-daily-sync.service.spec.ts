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
import { createLangameExternalPilotAuthority } from './langame-external-pilot-authority';

jest.mock('./langame-external-import-lock', () => ({
  withExactExternalImportLock: <T>(_tenantId: string, work: () => Promise<T>) =>
    work(),
  assertExactExternalImportLockHeld: () => Promise.resolve(),
}));

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
      $transaction: jest.fn(),
      tenant: {
        findMany: jest.fn(),
      },
      dailyDataCoverage: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      integrationSyncJob: {
        create: jest.fn().mockResolvedValue({ id: 'daily-aggregate' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      integrationSource: {
        findUnique: jest.fn().mockResolvedValue({ lastSyncedDate: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ domain: 'club.example' }]),
      },
    };
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );
    const langameSyncService = {
      syncTenantById: jest.fn(),
      assertExternalPilotBindings: jest.fn(),
    };
    const guestDataFoundationService = {
      syncTenantById: jest.fn(),
    };
    const businessSnapshotService = {
      runSnapshotsForTenant: jest.fn(),
    };
    const admissionService = {
      evaluate: jest.fn(),
      assertAllowed: jest.fn(),
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

  it('admits only the exact revision-bound external pilot before data scopes', async () => {
    const subject = createSubject();
    const externalPilot = createLangameExternalPilotAuthority({
      tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
      tenantSlug: 'set-1',
      sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
      storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
      externalDomain: '1171.langame.ru',
      externalClubId: '1',
      profileRevision: 1,
      storeRevision: 0,
      executionRevision: 7,
      customerStage: TenantCustomerStage.LIVE,
    });
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: externalPilot.tenantId, slug: externalPilot.tenantSlug },
    ]);
    subject.admissionService.evaluate.mockResolvedValue({
      allowed: true,
      tenantId: externalPilot.tenantId,
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 1,
      executionRevision: 7,
    });
    subject.admissionService.assertAllowed.mockResolvedValue({
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 1,
      executionRevision: 7,
    });
    const runTenantDailySync = jest
      .spyOn(
        subject.service as unknown as RunnableDailySyncService,
        'runTenantDailySync',
      )
      .mockResolvedValue({
        tenantId: externalPilot.tenantId,
        slug: externalPilot.tenantSlug,
        date: '2026-09-26',
        status: 'PROCESSED',
        skipped: false,
        reasonCode: null,
        failedRequirement: null,
        scopes: [],
      });

    const result = await subject.service.runDailySync({
      tenantSlug: 'set-1',
      date: '2026-09-26',
      externalPilot,
    });

    expect(result).toMatchObject({ tenants: 1, processedTenants: 1 });
    expect(
      subject.langameSyncService.assertExternalPilotBindings,
    ).toHaveBeenCalledWith(externalPilot);
    expect(runTenantDailySync).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: externalPilot.tenantId,
        externalPilot,
      }),
    );
    expect(subject.admissionService.evaluate).toHaveBeenCalledWith(
      externalPilot.tenantId,
      expect.any(Array),
    );

    subject.prisma.integrationSyncJob.findFirst.mockResolvedValueOnce({
      id: 'manual-running',
    });
    await expect(
      subject.service.runDailySync({
        tenantSlug: 'set-1',
        date: '2026-09-26',
        externalPilot,
      }),
    ).rejects.toThrow('cannot overlap');
    expect(runTenantDailySync).toHaveBeenCalledTimes(1);

    subject.admissionService.evaluate.mockResolvedValueOnce({
      allowed: true,
      tenantId: externalPilot.tenantId,
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 1,
      executionRevision: 8,
    });
    await expect(
      subject.service.runDailySync({
        tenantSlug: 'set-1',
        date: '2026-09-26',
        externalPilot,
      }),
    ).resolves.toMatchObject({ processedTenants: 0, skippedTenants: 1 });
    expect(runTenantDailySync).toHaveBeenCalledTimes(1);
  });

  it('rejects a pilot context with a different slug before provider or coverage access', async () => {
    const subject = createSubject();
    const externalPilot = createLangameExternalPilotAuthority({
      tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
      tenantSlug: 'set-1',
      sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
      storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
      externalDomain: '1171.langame.ru',
      externalClubId: '1',
      profileRevision: 1,
      storeRevision: 0,
      executionRevision: 7,
      customerStage: TenantCustomerStage.LIVE,
    });
    await expect(
      subject.service.runDailySync({
        tenantSlug: 'demo',
        externalPilot,
      }),
    ).rejects.toThrow('tenant scope is invalid');
    expect(subject.prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('continues external guest reads after denied catalog sections while retaining the goods result', async () => {
    const subject = createSubject();
    const externalPilot = createLangameExternalPilotAuthority({
      tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
      tenantSlug: 'set-1',
      sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
      storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
      externalDomain: '1171.langame.ru',
      externalClubId: '1',
      profileRevision: 1,
      storeRevision: 0,
      executionRevision: 7,
      customerStage: TenantCustomerStage.LIVE,
    });
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: externalPilot.tenantId, slug: externalPilot.tenantSlug },
    ]);
    subject.admissionService.evaluate.mockResolvedValue({
      allowed: true,
      tenantId: externalPilot.tenantId,
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 1,
      executionRevision: 7,
    });
    subject.admissionService.assertAllowed.mockResolvedValue({
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 1,
      executionRevision: 7,
    });
    subject.langameSyncService.syncTenantById
      .mockResolvedValueOnce({
        sources: 1,
        failedSources: 0,
        partialSources: 1,
        products: 470,
        sourceResults: [{ domain: '1171.langame.ru', status: 'PARTIAL' }],
      })
      .mockResolvedValueOnce({
        sources: 1,
        failedSources: 0,
        partialSources: 0,
        sourceResults: [],
      });
    subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 0,
      sourceResults: [],
    });

    const result = await subject.service.runDailySync({
      tenantSlug: 'set-1',
      date: '2026-09-26',
      externalPilot,
    });

    expect(subject.langameSyncService.syncTenantById).toHaveBeenNthCalledWith(
      1,
      externalPilot.tenantId,
      { mode: 'CATALOG', trigger: 'AUTO' },
      'LANGAME_DAILY_SYNC',
      externalPilot,
    );
    expect(
      subject.guestDataFoundationService.syncTenantById,
    ).toHaveBeenCalledTimes(1);
    expect(result.results[0].scopes).toContainEqual(
      expect.objectContaining({
        scope: DailyDataCoverageScope.BUSINESS_FACTS,
        status: DailyDataCoverageStatus.FAILED,
        partial: true,
      }),
    );
    expect(result.results[0].scopes).toContainEqual(
      expect.objectContaining({
        scope: DailyDataCoverageScope.GUEST_FOUNDATION,
        status: DailyDataCoverageStatus.SUCCESS,
      }),
    );
    expect(
      subject.businessSnapshotService.runSnapshotsForTenant,
    ).not.toHaveBeenCalled();
    expect(subject.prisma.integrationSource.updateMany).not.toHaveBeenCalled();
    const aggregateCalls = subject.prisma.integrationSyncJob.create.mock
      .calls as unknown as Array<
      [{ data: { mode: string; status: string; errorMessage: string | null } }]
    >;
    expect(aggregateCalls[0][0].data).toMatchObject({
      mode: 'FULL',
      status: 'FAILED',
    });
    expect(aggregateCalls[0][0].data.errorMessage).toContain(
      'LANGAME_SYNC_PARTIAL:',
    );
    const upsert = subject.prisma.dailyDataCoverage.upsert as jest.Mock<
      unknown,
      [
        {
          update?: { sourceCounts?: { catalog?: { products?: number } } };
        },
      ]
    >;
    expect(
      upsert.mock.calls.some(
        ([call]) => call.update?.sourceCounts?.catalog?.products === 470,
      ),
    ).toBe(true);
  });

  it('advances the external source cursor once only after complete catalog, sales and inventory', async () => {
    const subject = createSubject();
    const authority = createLangameExternalPilotAuthority({
      tenantId: '8cc79086-ed43-44fa-83d3-20207ec48758',
      tenantSlug: 'set-1',
      sourceId: '94a3842b-847e-4c4d-89b0-7cb8976a9f17',
      storeId: 'ecee16ef-f0cb-4307-b079-e2f0303c3a16',
      externalDomain: '1171.langame.ru',
      externalClubId: '1',
      profileRevision: 2,
      storeRevision: 0,
      executionRevision: 3,
      customerStage: TenantCustomerStage.LIVE,
    });
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: authority.tenantId, slug: authority.tenantSlug },
    ]);
    subject.admissionService.evaluate.mockResolvedValue({
      allowed: true,
      tenantId: authority.tenantId,
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 2,
      executionRevision: 3,
    });
    subject.admissionService.assertAllowed.mockResolvedValue({
      customerStage: TenantCustomerStage.LIVE,
      entitlementProfileRevision: 2,
      executionRevision: 3,
    });
    const source = {
      tenantId: authority.tenantId,
      sources: 1,
      failedSources: 0,
      partialSources: 0,
      stores: 1,
      products: 470,
      productGroups: 5,
      productConfigurations: 5,
      inventorySnapshots: 464,
      salesFacts: 2704,
      clubRevenueFacts: 30,
      discrepancies: 0,
      sourceResults: [],
    };
    subject.langameSyncService.syncTenantById.mockResolvedValue(source);
    subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 0,
      sourceResults: [],
    });
    subject.businessSnapshotService.runSnapshotsForTenant.mockResolvedValue({
      runs: [],
    });
    subject.prisma.integrationSource.findUnique.mockResolvedValue({
      lastSyncedDate: new Date('2026-09-24T00:00:00.000Z'),
    });

    const result = await subject.service.runDailySync({
      tenantSlug: authority.tenantSlug,
      externalBusinessDate: '2026-09-26',
      externalPilot: authority,
    });

    expect(result.results[0].scopes[0].status).toBe(
      DailyDataCoverageStatus.SUCCESS,
    );
    expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledTimes(3);
    expect(subject.prisma.integrationSource.updateMany).toHaveBeenCalledTimes(
      1,
    );
    const sourceUpdates = subject.prisma.integrationSource
      .updateMany as jest.Mock<unknown, [{ data: { lastSyncedDate: Date } }]>;
    const sourceUpdate = sourceUpdates.mock.calls[0][0];
    expect(sourceUpdate.data.lastSyncedDate).toEqual(
      new Date('2026-09-26T00:00:00.000Z'),
    );
    const aggregateCreates = subject.prisma.integrationSyncJob
      .create as jest.Mock<
      unknown,
      [{ data: { mode: string; status: string; errorMessage: string | null } }]
    >;
    const aggregate = aggregateCreates.mock.calls[0][0];
    expect(aggregate.data).toMatchObject({
      mode: 'FULL',
      status: 'SUCCESS',
      errorMessage: null,
    });
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
        partialSources: 0,
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

  it('keeps an incomplete guest import out of complete daily coverage and dependent snapshots', async () => {
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
    subject.langameSyncService.syncTenantById.mockResolvedValue({
      failedSources: 0,
      partialSources: 0,
    });
    subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 1,
      sourceResults: [],
    });
    subject.businessSnapshotService.runSnapshotsForTenant.mockResolvedValue({
      runs: [],
    });

    const result = await subject.service.runDailySync({ date: '2026-09-20' });

    expect(result.results[0]?.scopes).toContainEqual(
      expect.objectContaining({
        scope: DailyDataCoverageScope.GUEST_FOUNDATION,
        status: DailyDataCoverageStatus.FAILED,
      }),
    );
    expect(
      subject.businessSnapshotService.runSnapshotsForTenant,
    ).not.toHaveBeenCalled();
  });

  it('identifies permission-only guest degradation without hiding source failure', async () => {
    const subject = createSubject();
    subject.prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-internal', slug: 'internal' },
    ]);
    subject.admissionService.evaluate.mockResolvedValue({
      allowed: true,
      tenantId: 'tenant-internal',
      customerStage: TenantCustomerStage.INTERNAL,
    });
    subject.langameSyncService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 0,
      sourceResults: [],
    });
    subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 1,
      sourceResults: [
        {
          domain: '1171.langame.ru',
          status: 'PARTIAL',
          endpointErrors: {
            'guest/groups': 'Langame не предоставил доступ к этому разделу.',
          },
        },
      ],
    });

    const partial = await subject.service.runDailySync({ date: '2026-09-20' });
    expect(partial.results[0].scopes).toContainEqual(
      expect.objectContaining({
        scope: DailyDataCoverageScope.GUEST_FOUNDATION,
        status: DailyDataCoverageStatus.FAILED,
        partial: true,
      }),
    );
    subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
      sources: 1,
      failedSources: 0,
      partialSources: 1,
      sourceResults: [
        {
          domain: '1171.langame.ru',
          status: 'PARTIAL',
          endpointErrors: {
            'guest/groups': 'Не удалось получить данные этого раздела Langame.',
          },
        },
      ],
    });
    const unknown = await subject.service.runDailySync({ date: '2026-09-20' });
    expect(unknown.results[0].scopes).toContainEqual(
      expect.objectContaining({
        scope: DailyDataCoverageScope.GUEST_FOUNDATION,
        status: DailyDataCoverageStatus.FAILED,
        partial: false,
      }),
    );
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
        partialSources: 0,
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

  it('runs inventory on two ordinary daily runs 24 hours apart', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-09-14T09:00:00.000Z');
    jest.setSystemTime(now);

    try {
      const subject = createSubject();
      subject.prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-internal', slug: 'internal' },
      ]);
      subject.prisma.integrationSource.findMany.mockResolvedValue([
        { domain: 'club.example' },
      ]);
      const successfulInventoryJobs = [] as {
        domain: string;
        finishedAt: Date;
      }[];
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
      subject.guestDataFoundationService.syncTenantById.mockResolvedValue({
        sources: 0,
        failedSources: 0,
        partialSources: 0,
        sourceResults: [],
      });
      subject.businessSnapshotService.runSnapshotsForTenant.mockResolvedValue({
        runs: [],
      });

      await subject.service.runDailySync();
      successfulInventoryJobs.push({
        domain: 'club.example',
        finishedAt: now,
      });
      jest.setSystemTime(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      await subject.service.runDailySync();

      expect(subject.langameSyncService.syncTenantById).toHaveBeenNthCalledWith(
        2,
        'tenant-internal',
        {
          mode: 'INVENTORY',
          trigger: 'AUTO',
        },
        'LANGAME_DAILY_SYNC',
      );
      expect(subject.langameSyncService.syncTenantById).toHaveBeenNthCalledWith(
        4,
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

  it('suppresses a repeated inventory run only after recent success for every active domain', async () => {
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
      subject.prisma.integrationSyncJob.findMany.mockResolvedValue([
        { domain: 'first.example' },
        { domain: 'second.example' },
      ]);
      subject.admissionService.evaluate.mockResolvedValue({
        allowed: true,
        tenantId: 'tenant-internal',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        customerStage: TenantCustomerStage.INTERNAL,
      });

      const result = await subject.service.runDailySync();

      expect(result.results[0]?.inventoryRequested).toBe(false);
      expect(subject.langameSyncService.syncTenantById).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refreshes inventory when any active domain lacks recent AUTO coverage', async () => {
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
      subject.prisma.integrationSyncJob.findMany.mockResolvedValue([
        { domain: 'first.example' },
      ]);
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

      const result = await subject.service.runDailySync();

      expect(result.results[0]?.inventoryRequested).toBe(true);
      expect(subject.langameSyncService.syncTenantById).toHaveBeenCalledWith(
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
});
