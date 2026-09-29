import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantCustomerStage, TenantLifecycleStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { OPEN_ENDED_TENANT_ACCESS_ENDS_AT } from '../tenancy/tenant-access-window';
import {
  TENANT_ACCESS_WINDOW_AUDIT_ACTION,
  TenantAccessWindowService,
} from './tenant-access-window.service';

type PrismaMock = {
  tenant: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    updateMany: jest.Mock;
  };
  platformAdminAuditEvent: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    tenant: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    platformAdminAuditEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (tx: PrismaMock) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

type UpdateManyArgs = { data: { trialEndsAt: Date } };
type AuditCreateArgs = { data: { metadata: Record<string, unknown> } };

function updateManyCall(prisma: PrismaMock, index = 0): UpdateManyArgs {
  return (prisma.tenant.updateMany.mock.calls[index] as [UpdateManyArgs])[0];
}

function auditCreateCall(prisma: PrismaMock): AuditCreateArgs {
  return (
    prisma.platformAdminAuditEvent.create.mock.calls[0] as [AuditCreateArgs]
  )[0];
}

const actor = {
  id: 'platform-admin-1',
  isPlatformAdmin: true,
  isActive: true,
} as AuthenticatedUser;

const now = new Date('2026-09-29T12:00:00.000Z');
const requestId = '3f1c2b8e-6a47-4d0b-9f55-2d7b1c9e4a10';

const expiredPilot = {
  id: 'tenant-ez',
  name: 'EZ GAME',
  slug: 'set-1',
  status: TenantLifecycleStatus.ACTIVE,
  customerStage: TenantCustomerStage.PILOT,
  trialStartsAt: new Date('2026-08-27T09:42:25.466Z'),
  trialEndsAt: new Date('2026-09-26T09:42:25.466Z'),
  executionRevision: 2,
  updatedAt: new Date('2026-09-08T11:42:36.097Z'),
};

function command(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'OPEN_ENDED',
    expectedExecutionRevision: 2,
    reason: 'Тестовая сеть: доступ без срока до отдельного решения',
    confirmation: 'set-1',
    requestId,
    ...overrides,
  };
}

describe('TenantAccessWindowService', () => {
  let prisma: PrismaMock;
  let service: TenantAccessWindowService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TenantAccessWindowService(prisma as unknown as PrismaService);
    prisma.tenant.findUnique.mockResolvedValue(expiredPilot);
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue(null);
    prisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    prisma.tenant.findUniqueOrThrow.mockImplementation(() =>
      Promise.resolve({
        ...expiredPilot,
        trialEndsAt: updateManyCall(prisma).data.trialEndsAt,
        executionRevision: expiredPilot.executionRevision + 1,
      }),
    );
  });

  it('reopens an expired pilot until further notice with CAS and audit', async () => {
    const result = await service.update(actor, expiredPilot.id, command(), now);

    expect(prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        id: expiredPilot.id,
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: expiredPilot.trialStartsAt,
        trialEndsAt: expiredPilot.trialEndsAt,
        executionRevision: 2,
        updatedAt: expiredPilot.updatedAt,
      },
      data: { trialEndsAt: OPEN_ENDED_TENANT_ACCESS_ENDS_AT },
    });
    expect(result).toEqual({
      ok: true,
      tenantId: expiredPilot.id,
      tenantSlug: 'set-1',
      mode: 'OPEN_ENDED',
      access: {
        state: 'OPEN_ENDED',
        manageable: true,
        startsAt: '2026-08-27T09:42:25.466Z',
        endsAt: null,
        daysLeft: null,
        executionRevision: 3,
      },
    });
    const audit = auditCreateCall(prisma).data;
    expect(audit).toMatchObject({
      tenantId: expiredPilot.id,
      actorUserId: actor.id,
      requestId,
      action: TENANT_ACCESS_WINDOW_AUDIT_ACTION,
      targetType: 'TENANT',
      before: { trialEndsAt: '2026-09-26T09:42:25.466Z', executionRevision: 2 },
      after: { trialEndsAt: '9999-12-31T00:00:00.000Z', executionRevision: 3 },
      metadata: { mode: 'OPEN_ENDED', confirmationRule: 'tenant_slug', result },
    });
  });

  it('sets a dated window and closes access immediately', async () => {
    await service.update(
      actor,
      expiredPilot.id,
      command({ mode: 'UNTIL', accessUntil: '2026-12-31T21:00:00.000Z' }),
      now,
    );
    expect(updateManyCall(prisma).data).toEqual({
      trialEndsAt: new Date('2026-12-31T21:00:00.000Z'),
    });

    prisma.tenant.updateMany.mockClear();
    prisma.tenant.findUnique.mockResolvedValue({
      ...expiredPilot,
      trialEndsAt: OPEN_ENDED_TENANT_ACCESS_ENDS_AT,
    });
    const closed = await service.update(
      actor,
      expiredPilot.id,
      command({
        mode: 'CLOSE_NOW',
        requestId: '9b0e7f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      }),
      now,
    );
    expect(updateManyCall(prisma).data).toEqual({
      trialEndsAt: now,
    });
    expect(closed.access.state).toBe('EXPIRED');
  });

  it('returns the stored result for an idempotent replay', async () => {
    const first = await service.update(actor, expiredPilot.id, command(), now);
    const storedMetadata = auditCreateCall(prisma).data.metadata;
    prisma.platformAdminAuditEvent.findUnique.mockResolvedValue({
      metadata: storedMetadata,
    });
    prisma.tenant.updateMany.mockClear();

    await expect(
      service.update(actor, expiredPilot.id, command(), now),
    ).resolves.toEqual(first);
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();

    await expect(
      service.update(
        actor,
        expiredPilot.id,
        command({ mode: 'UNTIL', accessUntil: '2026-12-31T21:00:00.000Z' }),
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never changes internal or live networks', async () => {
    for (const customerStage of [
      TenantCustomerStage.INTERNAL,
      TenantCustomerStage.LIVE,
    ]) {
      prisma.tenant.findUnique.mockResolvedValue({
        ...expiredPilot,
        customerStage,
        trialStartsAt: null,
        trialEndsAt: null,
      });
      await expect(
        service.update(actor, expiredPilot.id, command(), now),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('leaves an unactivated pilot shell to its activation workflow', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      ...expiredPilot,
      status: TenantLifecycleStatus.SUSPENDED,
      trialStartsAt: null,
      trialEndsAt: null,
    });
    await expect(
      service.update(actor, expiredPilot.id, command(), now),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale form and a lost compare-and-swap', async () => {
    await expect(
      service.update(
        actor,
        expiredPilot.id,
        command({ expectedExecutionRevision: 1 }),
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();

    prisma.tenant.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update(actor, expiredPilot.id, command(), now),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a result when the database fence does not advance once', async () => {
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({
      ...expiredPilot,
      trialEndsAt: OPEN_ENDED_TENANT_ACCESS_ENDS_AT,
      executionRevision: 5,
    });
    await expect(
      service.update(actor, expiredPilot.id, command(), now),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformAdminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('validates the command before touching the tenant', async () => {
    const invalid: Array<Record<string, unknown>> = [
      { mode: 'FOREVER' },
      { mode: 'UNTIL' },
      { mode: 'UNTIL', accessUntil: '2026-12-31' },
      { accessUntil: '2026-12-31T21:00:00.000Z' },
      { reason: 'short' },
      { requestId: 'not-a-uuid' },
      { expectedExecutionRevision: '2' },
    ];
    for (const overrides of invalid) {
      await expect(
        service.update(actor, expiredPilot.id, command(overrides), now),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      service.update(
        actor,
        expiredPilot.id,
        command({ confirmation: 'other-slug' }),
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        actor,
        expiredPilot.id,
        command({ mode: 'UNTIL', accessUntil: '2026-09-28T00:00:00.000Z' }),
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        actor,
        expiredPilot.id,
        command({ mode: 'CLOSE_NOW' }),
        now,
      ),
    ).rejects.toThrow('Tenant access is already closed');
    expect(prisma.tenant.updateMany).not.toHaveBeenCalled();
  });

  it('requires an active platform administrator', async () => {
    await expect(
      service.update(
        { ...actor, isPlatformAdmin: false },
        expiredPilot.id,
        command(),
        now,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
