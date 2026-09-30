import { ForbiddenException } from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import { BusinessSnapshotService } from './business-snapshot.service';
import { BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE } from './langame.types';

const snapshotModules = [
  TenantModule.INTEGRATIONS,
  TenantModule.ASSORTMENT,
  TenantModule.GAMIFICATION,
  TenantModule.STAFF,
] as const;

describe('BusinessSnapshotService tenant execution admission', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const prisma = {
    businessSnapshotRun: {
      findMany,
      create,
    },
  } as unknown as PrismaService;
  const assertAllowed = jest.fn();
  const admission = {
    assertAllowed,
  } as unknown as TenantExecutionAdmissionService;
  const service = new BusinessSnapshotService(prisma, admission);

  beforeEach(() => {
    findMany.mockReset();
    create.mockReset();
    assertAllowed.mockReset();
  });

  it('requires every affected module before reading snapshot status', async () => {
    assertAllowed.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_READ_DISABLED',
      }),
    );

    await expect(service.getStatusForTenant('tenant-a')).rejects.toThrow(
      ForbiddenException,
    );

    expect(assertAllowed).toHaveBeenCalledWith(
      'tenant-a',
      snapshotModules.map((module) => ({ module, action: 'READ' })),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('requires write access to every affected module before a scheduled snapshot write', async () => {
    assertAllowed.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_WRITE_DISABLED',
      }),
    );

    await expect(
      service.runSnapshotsForTenant('tenant-a', { type: 'ALL' }, 'OUTBOUND'),
    ).rejects.toThrow(ForbiddenException);

    // Snapshots are built from the network's own data; no OUTBOUND needed.
    expect(assertAllowed).toHaveBeenCalledWith(
      'tenant-a',
      snapshotModules.map((module) => ({ module, action: 'WRITE' })),
    );
    expect(create).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('fences a scheduled snapshot of a tenant without a known stage before creating a run', async () => {
    assertAllowed.mockResolvedValueOnce({
      allowed: true,
      tenantId: 'tenant-unknown',
      reasonCode: 'ALLOWED',
      failedRequirement: null,
      customerStage: null,
    });

    await expect(
      service.runSnapshotsForTenant(
        'tenant-unknown',
        { type: 'ALL' },
        'OUTBOUND',
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        reasonCode: BACKGROUND_EXECUTION_FENCE_PENDING_REASON_CODE,
        message: expect.stringContaining(
          'BACKGROUND_EXECUTION_STAGE_REQUIRED',
        ) as string,
      },
    });

    expect(create).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
