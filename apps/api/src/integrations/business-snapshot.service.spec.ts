import { ForbiddenException } from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantExecutionAdmissionService } from '../tenancy/tenant-execution-admission.service';
import { BusinessSnapshotService } from './business-snapshot.service';

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

  it('requires every affected outbound module before a scheduled snapshot write', async () => {
    assertAllowed.mockRejectedValueOnce(
      new ForbiddenException({
        reasonCode: 'ENTITLEMENT_OUTBOUND_DISABLED',
      }),
    );

    await expect(
      service.runSnapshotsForTenant('tenant-a', { type: 'ALL' }, 'OUTBOUND'),
    ).rejects.toThrow(ForbiddenException);

    expect(assertAllowed).toHaveBeenCalledWith(
      'tenant-a',
      snapshotModules.map((module) => ({ module, action: 'OUTBOUND' })),
    );
    expect(create).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
