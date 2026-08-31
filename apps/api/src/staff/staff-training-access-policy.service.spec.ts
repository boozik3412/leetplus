import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffTrainingAccessPolicyService } from './staff-training-access-policy.service';

function user(
  accessScope: 'NETWORK' | 'STORES',
  permissions: AuthenticatedUser['permissions'],
  role: UserRole = UserRole.CLUB_MANAGER,
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
    policy: new StaffTrainingAccessPolicyService({ resolve } as never),
    resolve,
  };
}

describe('StaffTrainingAccessPolicyService', () => {
  const managerPermissions: AuthenticatedUser['permissions'] = [
    'view_staff_training',
    'manage_staff_training',
  ];

  it('keeps NETWORK course and profile management tenant-wide', async () => {
    const { policy } = subject('NETWORK');
    const access = await policy.resolve(user('NETWORK', managerPermissions));

    expect(policy.readableCourseWhere(access)).toEqual({});
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      isPlatformAdmin: false,
    });
    expect(policy.canManageCourse(access, { storeId: null })).toBe(true);
    expect(policy.canManageCourse(access, { storeId: 'store-a2' })).toBe(true);
    expect(() => policy.assertWritableStore(access, null)).not.toThrow();
  });

  it('limits STORES management to explicit allowed-store courses and users', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.readableCourseWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] } },
        { storeId: null, status: 'ACTIVE' },
      ],
    });
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      isPlatformAdmin: false,
      storeAccesses: { some: { storeId: { in: ['store-a1'] } } },
    });
    expect(policy.canManageCourse(access, { storeId: 'store-a1' })).toBe(true);
    expect(policy.canManageCourse(access, { storeId: null })).toBe(false);
    expect(policy.canManageCourse(access, { storeId: 'store-a2' })).toBe(false);
    expect(
      policy.canManageUser(access, {
        id: 'employee-a1',
        storeAccesses: [{ storeId: 'store-a1' }],
      }),
    ).toBe(true);
    expect(
      policy.canManageUser(access, {
        id: 'employee-a2',
        storeAccesses: [{ storeId: 'store-a2' }],
      }),
    ).toBe(false);
    expect(() => policy.assertWritableStore(access, 'store-a1')).not.toThrow();
    expect(() => policy.assertWritableStore(access, null)).toThrow(
      ForbiddenException,
    );
  });

  it('limits a STORES reader to active role-compatible courses and self', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(
      user('STORES', ['view_staff_training'], UserRole.CLUB_ADMINISTRATOR),
    );
    const activeForRole = {
      status: 'ACTIVE',
      roleScope: { in: ['ALL_STAFF', 'ADMINISTRATOR'] },
    };

    expect(policy.readableCourseWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] }, ...activeForRole },
        { storeId: null, ...activeForRole },
      ],
    });
    expect(policy.visibleUsersWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: 'user-a1',
      isActive: true,
      isPlatformAdmin: false,
    });
  });

  it('scopes STORES stores, assessments, knowledge choices and projections', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.visibleStoresWhere(access)).toEqual({
      tenantId: 'tenant-a',
      id: { in: ['store-a1'] },
    });
    expect(policy.visibleAssessmentsWhere(access)).toEqual({
      tenantId: 'tenant-a',
      OR: [
        { storeId: null, status: 'ACTIVE' },
        { storeId: { in: ['store-a1'] }, status: 'ACTIVE' },
      ],
    });
    expect(policy.visibleKnowledgeArticlesWhere(access)).toEqual({
      tenantId: 'tenant-a',
      OR: [
        {
          storeId: { in: ['store-a1'] },
          status: { in: ['PUBLISHED', 'DRAFT'] },
        },
        {
          storeId: null,
          status: 'PUBLISHED',
          roleScope: {
            in: [
              'ALL_STAFF',
              'ADMINISTRATOR',
              'SENIOR_ADMINISTRATOR',
              'CLUB_MANAGER',
            ],
          },
        },
      ],
    });
    expect(
      policy.projectStoreAccesses(access, [
        { storeId: 'store-a1', label: 'A1' },
        { storeId: 'store-a2', label: 'A2' },
      ]),
    ).toEqual([{ storeId: 'store-a1', label: 'A1' }]);
  });

  it('keeps STORES onboarding writable only in allowed clubs and references active', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));
    const activeForRole = {
      status: 'ACTIVE',
      roleScope: {
        in: [
          'ALL_STAFF',
          'ADMINISTRATOR',
          'SENIOR_ADMINISTRATOR',
          'CLUB_MANAGER',
        ],
      },
    };

    expect(policy.readableOnboardingPlanWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] } },
        { storeId: null, ...activeForRole },
      ],
    });
    expect(
      policy.canManageOnboardingPlan(access, { storeId: 'store-a1' }),
    ).toBe(true);
    expect(policy.canManageOnboardingPlan(access, { storeId: null })).toBe(
      false,
    );
    expect(
      policy.canManageOnboardingPlan(access, { storeId: 'store-a2' }),
    ).toBe(false);
    expect(() =>
      policy.assertWritableOnboardingStore(access, 'store-a1'),
    ).not.toThrow();
    expect(() => policy.assertWritableOnboardingStore(access, null)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      policy.assertWritableOnboardingStore(access, 'store-a2'),
    ).toThrow(ForbiddenException);

    expect(policy.visibleTaskTemplatesWhere(access)).toEqual({
      tenantId: 'tenant-a',
      status: 'ACTIVE',
      OR: [{ storeId: { in: ['store-a1'] } }, { storeId: null }],
    });
    expect(policy.visibleChecklistTemplatesWhere(access)).toEqual({
      tenantId: 'tenant-a',
      OR: [
        { storeId: { in: ['store-a1'] }, status: 'ACTIVE' },
        { storeId: null, ...activeForRole },
      ],
    });
    expect(policy.visibleRegulationsWhere(access)).toEqual({
      tenantId: 'tenant-a',
      OR: [
        { storeId: { in: ['store-a1'] }, status: 'PUBLISHED' },
        {
          storeId: null,
          status: 'PUBLISHED',
          roleScope: activeForRole.roleScope,
        },
      ],
    });
  });

  it('rejects a fresh subject without training visibility', async () => {
    const { policy } = subject('STORES');

    await expect(policy.resolve(user('STORES', []))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
