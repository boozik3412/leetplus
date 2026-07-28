import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
    const service = new ReportsDigestSchedulerService(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      reportsDigestService as unknown as ReportsDigestService,
    );

    await (
      service as unknown as RunnableReportsDigestScheduler
    ).runTenantDigest({
      tenant: { id: 'tenant-denied', slug: 'denied' },
      type: 'DAILY',
      dateKey: '2026-07-28',
    });

    expect(prisma.reportDigestScheduleRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: 'SKIPPED',
        sentCount: 0,
        completedAt: expect.any(Date) as Date,
        errorMessage: 'ENTITLEMENT_OUTBOUND_DISABLED',
      },
    });
  });
});
