import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from './users.service';

describe('UsersService role override permissions', () => {
  const tenantId = 'tenant-1';
  const updatedAt = new Date('2026-06-08T00:00:00.000Z');
  const actor = {
    id: 'standards-manager-1',
    email: 'standards@example.com',
    fullName: 'Standards Manager',
    role: UserRole.STANDARDS_MANAGER,
    tenantId,
    tenantSlug: 'demo',
    isActive: true,
    isPlatformAdmin: false,
    permissions: [],
  } satisfies AuthenticatedUser;

  function createService() {
    const prisma = {
      userRoleOverride: {
        upsert: jest.fn().mockResolvedValue({
          role: UserRole.CLUB_ADMINISTRATOR,
          permissions: ['view_staff_tasks', 'view_staff_standards'],
          updatedAt,
        }),
      },
      userAccessRole: {
        create: jest.fn(),
      },
    };
    const tenantContextService = {
      resolve: jest.fn().mockResolvedValue({ tenantId }),
    };

    const service = new UsersService(
      prisma as never,
      {} as never,
      tenantContextService as never,
      {} as never,
    );

    return { prisma, service, tenantContextService };
  }

  it('allows standards manager to save tenant-scoped overrides for assignable roles', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateSystemRole(actor, UserRole.CLUB_ADMINISTRATOR, {
        permissions: ['view_staff_tasks', 'view_staff_standards'],
      }),
    ).resolves.toMatchObject({
      role: UserRole.CLUB_ADMINISTRATOR,
      permissions: ['view_staff_tasks', 'view_staff_standards'],
      isOverridden: true,
      updatedAt: updatedAt.toISOString(),
    });

    expect(prisma.userRoleOverride.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_role: {
          tenantId,
          role: UserRole.CLUB_ADMINISTRATOR,
        },
      },
      create: {
        tenantId,
        role: UserRole.CLUB_ADMINISTRATOR,
        permissions: ['view_staff_tasks', 'view_staff_standards'],
      },
      update: {
        permissions: ['view_staff_tasks', 'view_staff_standards'],
      },
      select: {
        role: true,
        permissions: true,
        updatedAt: true,
      },
    });
  });

  it('does not allow standards manager to override roles outside the standards scope', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateSystemRole(actor, UserRole.MARKETER, {
        permissions: ['view_marketing'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.userRoleOverride.upsert).not.toHaveBeenCalled();
  });

  it('does not allow standards manager to create custom roles outside the standards capability scope', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createAccessRole(actor, {
        name: 'Маркетинг и синхронизация',
        permissions: ['view_marketing', 'run_sync'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.userAccessRole.create).not.toHaveBeenCalled();
  });

  it('does not allow standards manager to override assignable roles with excessive permissions', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateSystemRole(actor, UserRole.CLUB_ADMINISTRATOR, {
        permissions: ['view_staff_tasks', 'view_marketing'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.userRoleOverride.upsert).not.toHaveBeenCalled();
  });
});
