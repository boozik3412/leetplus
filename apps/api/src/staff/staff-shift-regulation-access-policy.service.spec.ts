import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffShiftRegulationAccessPolicyService } from './staff-shift-regulation-access-policy.service';

function user(
  accessScope: 'NETWORK' | 'STORES',
  permissions: AuthenticatedUser['permissions'],
  role = UserRole.CLUB_MANAGER,
): AuthenticatedUser {
  return {
    id: 'user-a1',
    email: 'user-a1@example.test',
    fullName: 'A1 manager',
    role,
    permissions,
    isPlatformAdmin: false,
    tenantId: 'tenant-a',
    tenantSlug: 'tenant-a',
    accessScope,
    allowedStoreIds: accessScope === 'STORES' ? ['store-a1'] : [],
  };
}

function subject(accessScope: 'NETWORK' | 'STORES') {
  const resolve = jest.fn().mockResolvedValue({
    userId: 'user-a1',
    tenantId: 'tenant-a',
    tenantSlug: 'tenant-a',
    mode: accessScope,
    allowedStoreIds: accessScope === 'STORES' ? ['store-a1'] : [],
  });

  return {
    policy: new StaffShiftRegulationAccessPolicyService({ resolve } as never),
    resolve,
  };
}

describe('StaffShiftRegulationAccessPolicyService', () => {
  const managerPermissions: AuthenticatedUser['permissions'] = [
    'view_staff_standards',
    'manage_staff_standards',
  ];

  it('keeps NETWORK management tenant-wide', async () => {
    const { policy } = subject('NETWORK');
    const access = await policy.resolve(user('NETWORK', managerPermissions));

    expect(policy.readableRegulationWhere(access)).toEqual({});
    expect(policy.canManageRegulation(access, { storeId: null })).toBe(true);
    expect(policy.canManageRegulation(access, { storeId: 'store-a2' })).toBe(
      true,
    );
    expect(() => policy.assertWritableStore(access, null)).not.toThrow();
  });

  it('limits STORES management to explicit allowed-store regulations', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.readableRegulationWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] } },
        {
          storeId: null,
          status: 'PUBLISHED',
          roleScope: {
            in: [
              'ADMINISTRATOR',
              'SENIOR_ADMINISTRATOR',
              'MANAGER',
              'ALL_STAFF',
            ],
          },
        },
      ],
    });
    expect(policy.canManageRegulation(access, { storeId: 'store-a1' })).toBe(
      true,
    );
    expect(policy.canManageRegulation(access, { storeId: null })).toBe(false);
    expect(policy.canManageRegulation(access, { storeId: 'store-a2' })).toBe(
      false,
    );
    expect(() => policy.assertWritableStore(access, 'store-a1')).not.toThrow();
    expect(() => policy.assertWritableStore(access, null)).toThrow(
      ForbiddenException,
    );
    expect(() => policy.assertWritableStore(access, 'store-a2')).toThrow(
      ForbiddenException,
    );
  });

  it('limits a STORES reader to published role-compatible regulations', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(
      user('STORES', ['view_staff_standards'], UserRole.CLUB_ADMINISTRATOR),
    );

    const publishedForRole = {
      status: 'PUBLISHED',
      roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
    };
    expect(policy.readableRegulationWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] }, ...publishedForRole },
        { storeId: null, ...publishedForRole },
      ],
    });
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: 'user-a1',
      isActive: true,
    });
    expect(policy.visibleAssessmentsWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: { in: [] },
    });
  });

  it('scopes STORES users, stores, assessments and version history', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.visibleStoresWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: { in: ['store-a1'] },
    });
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      isActive: true,
      OR: [
        { accessScope: 'NETWORK' },
        {
          accessScope: 'STORES',
          storeAccesses: { some: { storeId: { in: ['store-a1'] } } },
        },
      ],
    });
    expect(policy.visibleAssessmentsWhere(access)).toEqual({
      tenantId: 'tenant-a',
      status: 'ACTIVE',
      OR: [{ storeId: null }, { storeId: { in: ['store-a1'] } }],
    });
    expect(policy.canReadVersion(access, { storeId: null })).toBe(true);
    expect(policy.canReadVersion(access, { storeId: 'store-a1' })).toBe(true);
    expect(policy.canReadVersion(access, { storeId: 'store-a2' })).toBe(false);
  });

  it('rejects a fresh subject without standards visibility', async () => {
    const { policy } = subject('STORES');

    await expect(policy.resolve(user('STORES', []))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
