import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { StaffAdminRatingAdjustmentsService } from './staff-admin-rating-adjustments.service';

const tenantId = 'tenant-a';

function user(
  role: UserRole,
  permissions: AuthenticatedUser['permissions'] = ['manage_staff_control'],
): AuthenticatedUser {
  return {
    id: `${role.toLowerCase()}-1`,
    email: `${role.toLowerCase()}@example.test`,
    fullName: role,
    role,
    isPlatformAdmin: false,
    tenantId,
    tenantSlug: 'tenant-a',
    accessScope: 'NETWORK',
    allowedStoreIds: [],
    permissions,
  };
}

const manager = user(UserRole.CLUB_MANAGER);

function harness() {
  const created = (data: Record<string, unknown>) => ({
    id: 'adj-1',
    userId: data.userId,
    kind: data.kind,
    points: data.points,
    targetKind: data.targetKind ?? null,
    targetId: data.targetId ?? null,
    reason: data.reason,
    occurredAt: (data.occurredAt as Date | undefined) ?? new Date(),
    status: 'ACTIVE',
  });
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'admin-1' }),
    },
    staffTask: { findFirst: jest.fn().mockResolvedValue({ id: 'task-1' }) },
    staffChecklistRun: { findFirst: jest.fn().mockResolvedValue(null) },
    staffDisciplineRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    staffAdminRatingAdjustment: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(created(data)),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tenantContext = {
    resolve: jest.fn().mockReturnValue({ tenantId }),
  } as unknown as TenantContextService;
  const service = new StaffAdminRatingAdjustmentsService(
    prisma as unknown as PrismaService,
    tenantContext,
  );
  return { prisma, service };
}

describe('StaffAdminRatingAdjustmentsService', () => {
  it('forgives an overdue task of the administrator', async () => {
    const { prisma, service } = harness();

    const result = await service.create(manager, {
      userId: 'admin-1',
      kind: 'FORGIVE',
      targetKind: 'TASK_OVERDUE',
      targetId: 'task-1',
      reason: '  Ждали поставщика  ',
    });

    expect(prisma.staffTask.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', tenantId, assignedToUserId: 'admin-1' },
      select: { id: true },
    });
    expect(prisma.staffAdminRatingAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId,
          userId: 'admin-1',
          createdByUserId: manager.id,
          kind: 'FORGIVE',
          points: 0,
          targetKind: 'TASK_OVERDUE',
          targetId: 'task-1',
          reason: 'Ждали поставщика',
        },
      }),
    );
    expect(result).toMatchObject({ kind: 'FORGIVE', points: 0 });
  });

  it('only looks for the target among administrators of this tenant', async () => {
    const { prisma, service } = harness();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.create(manager, {
        userId: 'manager-2',
        kind: 'BONUS',
        points: 3,
        reason: 'Помог',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'manager-2',
        tenantId,
        role: {
          in: [UserRole.SENIOR_ADMINISTRATOR, UserRole.CLUB_ADMINISTRATOR],
        },
      },
      select: { id: true },
    });
    expect(prisma.staffAdminRatingAdjustment.create).not.toHaveBeenCalled();
  });

  it('refuses to forgive an item of another administrator', async () => {
    const { prisma, service } = harness();

    await expect(
      service.create(manager, {
        userId: 'admin-1',
        kind: 'FORGIVE',
        targetKind: 'FINE',
        targetId: 'record-of-someone-else',
        reason: 'Ошибка',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffDisciplineRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'record-of-someone-else',
        tenantId,
        userId: 'admin-1',
        level: { startsWith: 'FINE' },
      },
      select: { id: true },
    });
    expect(prisma.staffAdminRatingAdjustment.create).not.toHaveBeenCalled();
  });

  it('stores a penalty as negative points and a bare date at midday', async () => {
    const { prisma, service } = harness();

    await service.create(manager, {
      userId: 'admin-1',
      kind: 'PENALTY',
      points: 4,
      reason: 'Грубость гостю',
      occurredAt: '2026-11-10',
    });

    expect(prisma.staffAdminRatingAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'PENALTY',
          points: -4,
          occurredAt: new Date('2026-11-10T12:00:00.000Z'),
        }) as unknown,
      }),
    );
  });

  it.each([0, 11, 2.5, 'x', undefined])('rejects %p points', async (points) => {
    const { service } = harness();
    await expect(
      service.create(manager, {
        userId: 'admin-1',
        kind: 'BONUS',
        points,
        reason: 'Причина',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason and a known kind', async () => {
    const { service } = harness();
    await expect(
      service.create(manager, {
        userId: 'admin-1',
        kind: 'BONUS',
        points: 1,
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(manager, {
        userId: 'admin-1',
        kind: 'SET',
        points: 1,
        reason: 'Причина',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 409 when the item is already forgiven', async () => {
    const { prisma, service } = harness();
    prisma.staffAdminRatingAdjustment.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(manager, {
        userId: 'admin-1',
        kind: 'FORGIVE',
        targetKind: 'TASK_OVERDUE',
        targetId: 'task-1',
        reason: 'Повтор',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['a senior administrator', user(UserRole.SENIOR_ADMINISTRATOR)],
    ['a club administrator', user(UserRole.CLUB_ADMINISTRATOR)],
    [
      'a manager with view only',
      user(UserRole.MANAGER, ['view_staff_control']),
    ],
  ])('forbids %s', async (_label, caller) => {
    const { prisma, service } = harness();

    await expect(
      service.create(caller, {
        userId: 'admin-1',
        kind: 'BONUS',
        points: 1,
        reason: 'Причина',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.cancel(caller, 'adj-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.staffAdminRatingAdjustment.create).not.toHaveBeenCalled();
    expect(prisma.staffAdminRatingAdjustment.updateMany).not.toHaveBeenCalled();
  });

  it('does not let a reviewer change their own rating', async () => {
    const { service } = harness();
    await expect(
      service.create(manager, {
        userId: manager.id,
        kind: 'BONUS',
        points: 1,
        reason: 'Себе',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancels an active decision of this tenant only', async () => {
    const { prisma, service } = harness();

    await expect(service.cancel(manager, 'adj-1')).resolves.toEqual({
      id: 'adj-1',
      canceled: true,
    });
    expect(prisma.staffAdminRatingAdjustment.updateMany).toHaveBeenCalledWith({
      where: { id: 'adj-1', tenantId, status: 'ACTIVE' },
      data: {
        status: 'CANCELED',
        canceledAt: expect.any(Date) as Date,
        canceledByUserId: manager.id,
      },
    });

    prisma.staffAdminRatingAdjustment.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(service.cancel(manager, 'adj-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
