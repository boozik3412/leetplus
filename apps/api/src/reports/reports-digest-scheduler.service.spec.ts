import type { ConfigService } from '@nestjs/config';
import { TenantCustomerStage, TenantModule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import { ReportsDigestSchedulerService } from './reports-digest-scheduler.service';
import { ReportsDigestService } from './reports-digest.service';

type RunnableReportsDigestScheduler = {
  runTenantDigest(input: {
    tenant: { id: string; slug: string };
    type: 'DAILY' | 'WEEKLY';
    dateKey: string;
  }): Promise<void>;
};

describe('ReportsDigestSchedulerService admission result handling', () => {
  it('persists an admission denial as SKIPPED rather than FAILED', async () => {
    const configService = {
      get: jest.fn(),
    };
    const prisma = {
      reportDigestScheduleRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const reportsDigestService = {
      sendScheduledDigests: jest.fn().mockResolvedValue({
        ok: true,
        type: 'DAILY',
        dryRun: false,
        sent: 0,
        skipped: 1,
        results: [],
        skippedResults: [
          {
            status: 'SKIPPED',
            tenantId: 'tenant-denied',
            tenantSlug: 'denied',
            recipientEmail: 'owner@denied.example',
            reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
            failedRequirement: {
              module: 'ASSORTMENT',
              action: 'OUTBOUND',
            },
          },
        ],
      }),
    };
    const permitAcquisition = {
      decision: {
        allowed: false,
        tenantId: 'tenant-denied',
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
        failedRequirement: {
          module: TenantModule.ASSORTMENT,
          action: 'OUTBOUND',
        },
        entitlementProfileRevision: 4,
        executionRevision: 7,
        customerStage: TenantCustomerStage.BETA,
        internalEntitlementBypass: false,
      },
      permit: null,
    };
    const tenantExecutionAdmissionService = {
      acquirePermit: jest.fn().mockResolvedValue(permitAcquisition),
    };
    const service = new ReportsDigestSchedulerService(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      reportsDigestService as unknown as ReportsDigestService,
      tenantExecutionAdmissionService as unknown as TenantExecutionAdmissionService,
    );

    await (
      service as unknown as RunnableReportsDigestScheduler
    ).runTenantDigest({
      tenant: { id: 'tenant-denied', slug: 'denied' },
      type: 'DAILY',
      dateKey: '2026-07-28',
    });

    expect(tenantExecutionAdmissionService.acquirePermit).toHaveBeenCalledWith(
      'tenant-denied',
      [
        { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
        { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
      ],
    );
    expect(prisma.reportDigestScheduleRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'run-1' },
      data: {
        executionRevision: 7,
      },
    });
    expect(reportsDigestService.sendScheduledDigests).toHaveBeenCalledWith(
      { type: 'DAILY' },
      {
        tenantId: 'tenant-denied',
        permitAcquisition,
      },
    );
    expect(prisma.reportDigestScheduleRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'SKIPPED',
        sentCount: 0,
        completedAt: expect.any(Date) as Date,
        errorMessage: 'ENTITLEMENT_OUTBOUND_DISABLED',
      },
    });
    expect(
      prisma.reportDigestScheduleRun.update.mock.invocationCallOrder[0],
    ).toBeLessThan(
      reportsDigestService.sendScheduledDigests.mock.invocationCallOrder[0],
    );
  });

  it('persists a background policy denial before invoking digest generation', async () => {
    const configService = {
      get: jest.fn(),
    };
    const prisma = {
      reportDigestScheduleRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-2' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const reportsDigestService = {
      sendScheduledDigests: jest.fn(),
    };
    const permitAcquisition = {
      decision: {
        allowed: true,
        tenantId: 'tenant-malformed-stage',
        reasonCode: 'ALLOWED',
        failedRequirement: null,
        entitlementProfileRevision: 4,
        executionRevision: 8,
        customerStage: null,
        internalEntitlementBypass: false,
      },
      permit: {
        tenantId: 'tenant-malformed-stage',
        executionRevision: 8,
        requirements: [
          { module: TenantModule.ASSORTMENT, action: 'OUTBOUND' },
          { module: TenantModule.COMMUNICATIONS, action: 'OUTBOUND' },
        ],
      },
    };
    const tenantExecutionAdmissionService = {
      acquirePermit: jest.fn().mockResolvedValue(permitAcquisition),
    };
    const service = new ReportsDigestSchedulerService(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      reportsDigestService as unknown as ReportsDigestService,
      tenantExecutionAdmissionService as unknown as TenantExecutionAdmissionService,
    );

    await (
      service as unknown as RunnableReportsDigestScheduler
    ).runTenantDigest({
      tenant: { id: 'tenant-malformed-stage', slug: 'malformed-stage' },
      type: 'DAILY',
      dateKey: '2026-07-28',
    });

    expect(prisma.reportDigestScheduleRun.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'run-2' },
      data: {
        executionRevision: 8,
      },
    });
    expect(prisma.reportDigestScheduleRun.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'run-2' },
      data: {
        status: 'SKIPPED',
        sentCount: 0,
        completedAt: expect.any(Date) as Date,
        errorMessage: 'BACKGROUND_EXECUTION_STAGE_REQUIRED',
      },
    });
    expect(reportsDigestService.sendScheduledDigests).not.toHaveBeenCalled();
  });
});
