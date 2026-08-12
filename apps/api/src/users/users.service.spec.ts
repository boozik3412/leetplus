import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
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
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  } satisfies AuthenticatedUser;

  function createService() {
    const prisma = {
      userRoleOverride: {
        upsert: jest
          .fn()
          .mockImplementation(
            (args: {
              create: { role: UserRole };
              update: { permissions: string[] };
            }) => ({
              role: args.create.role,
              permissions: args.update.permissions,
              updatedAt,
            }),
          ),
      },
      userAccessRole: {
        create: jest.fn(),
      },
    };
    const freshStoreScopeService = {
      assertNetwork: jest
        .fn()
        .mockImplementation((subject: AuthenticatedUser) => {
          if (subject.accessScope !== 'NETWORK') {
            return Promise.reject(
              new ForbiddenException('Network access is required'),
            );
          }
          return Promise.resolve({
            tenantId: subject.tenantId,
            tenantSlug: subject.tenantSlug,
            mode: subject.accessScope,
            allowedStoreIds: [...subject.allowedStoreIds],
            userId: subject.id,
          });
        }),
      resolve: jest.fn().mockImplementation((subject: AuthenticatedUser) =>
        Promise.resolve({
          tenantId: subject.tenantId,
          tenantSlug: subject.tenantSlug,
          mode: subject.accessScope,
          allowedStoreIds: [...subject.allowedStoreIds],
          userId: subject.id,
        }),
      ),
    };

    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      new AccessScopeService(),
      freshStoreScopeService as never,
      {} as never,
    );

    return { freshStoreScopeService, prisma, service };
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

  it('allows standards manager to save trainee role overrides', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateSystemRole(actor, UserRole.TRAINEE, {
        permissions: [
          'view_staff_shift_workspace',
          'view_staff_tasks',
          'view_staff_standards',
          'view_staff_training',
          'view_staff_knowledge',
        ],
      }),
    ).resolves.toMatchObject({
      role: UserRole.TRAINEE,
      permissions: [
        'view_staff_shift_workspace',
        'view_staff_tasks',
        'view_staff_standards',
        'view_staff_training',
        'view_staff_knowledge',
      ],
      isOverridden: true,
      updatedAt: updatedAt.toISOString(),
    });

    expect(prisma.userRoleOverride.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_role: {
          tenantId,
          role: UserRole.TRAINEE,
        },
      },
      create: {
        tenantId,
        role: UserRole.TRAINEE,
        permissions: [
          'view_staff_shift_workspace',
          'view_staff_tasks',
          'view_staff_standards',
          'view_staff_training',
          'view_staff_knowledge',
        ],
      },
      update: {
        permissions: [
          'view_staff_shift_workspace',
          'view_staff_tasks',
          'view_staff_standards',
          'view_staff_training',
          'view_staff_knowledge',
        ],
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

  it('does not allow a store-scoped manager to mutate tenant-global roles', async () => {
    const { prisma, service } = createService();
    const storeActor = {
      ...actor,
      accessScope: 'STORES',
      allowedStoreIds: ['store-1'],
    } satisfies AuthenticatedUser;

    await expect(
      service.updateSystemRole(storeActor, UserRole.CLUB_ADMINISTRATOR, {
        permissions: ['view_staff_tasks'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.userRoleOverride.upsert).not.toHaveBeenCalled();
  });
});
