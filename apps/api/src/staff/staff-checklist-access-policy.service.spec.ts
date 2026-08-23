import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffChecklistAccessPolicyService } from './staff-checklist-access-policy.service';

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
    policy: new StaffChecklistAccessPolicyService({ resolve } as never),
    resolve,
  };
}

describe('StaffChecklistAccessPolicyService', () => {
  const managerPermissions: AuthenticatedUser['permissions'] = [
    'view_staff_standards',
    'manage_staff_standards',
  ];

  it('keeps NETWORK template and run management tenant-wide', async () => {
    const { policy } = subject('NETWORK');
    const access = await policy.resolve(user('NETWORK', managerPermissions));

    expect(policy.readableTemplateWhere(access)).toEqual({});
    expect(policy.readableRunWhere(access)).toEqual({});
    expect(policy.canManageTemplate(access, { storeId: null })).toBe(true);
    expect(() => policy.assertWritableStore(access, null)).not.toThrow();
  });

  it('limits STORES management to explicit allowed-store rows', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.readableTemplateWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] } },
        {
          storeId: null,
          status: 'ACTIVE',
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
    expect(policy.readableRunWhere(access)).toEqual({
      storeId: { in: ['store-a1'] },
    });
    expect(policy.canManageTemplate(access, { storeId: 'store-a1' })).toBe(
      true,
    );
    expect(policy.canManageTemplate(access, { storeId: null })).toBe(false);
    expect(() => policy.assertWritableStore(access, 'store-a2')).toThrow(
      ForbiddenException,
    );
  });

  it('limits a STORES reader to compatible active sources and own runs', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(
      user('STORES', ['view_staff_standards'], UserRole.CLUB_ADMINISTRATOR),
    );
    const activeForRole = {
      status: 'ACTIVE',
      roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
    };

    expect(policy.readableTemplateWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] }, ...activeForRole },
        { storeId: null, ...activeForRole },
      ],
    });
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: 'user-a1',
      isActive: true,
    });
  });

  it('scopes STORES selectors and exact attachment parents', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.visibleStoresWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: { in: ['store-a1'] },
    });
    expect(policy.readableRunIdsWhere(access, ['run-a1'])).toEqual({
      tenantId: 'tenant-a',
      id: { in: ['run-a1'] },
      AND: [{ storeId: { in: ['store-a1'] } }],
    });
    expect(() => policy.assertOperationalStore(access, null)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a fresh subject without standards visibility', async () => {
    const { policy } = subject('STORES');

    await expect(policy.resolve(user('STORES', []))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
