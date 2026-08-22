import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffKnowledgeAccessPolicyService } from './staff-knowledge-access-policy.service';

function user(
  accessScope: 'NETWORK' | 'STORES',
  permissions: AuthenticatedUser['permissions'],
): AuthenticatedUser {
  return {
    id: 'user-a1',
    email: 'user-a1@example.test',
    fullName: 'A1 manager',
    role: UserRole.CLUB_MANAGER,
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
    policy: new StaffKnowledgeAccessPolicyService({ resolve } as never),
    resolve,
  };
}

describe('StaffKnowledgeAccessPolicyService', () => {
  const managerPermissions: AuthenticatedUser['permissions'] = [
    'view_staff_knowledge',
    'edit_staff_knowledge',
    'review_staff_knowledge',
    'publish_staff_knowledge',
  ];

  it('keeps NETWORK management tenant-wide', async () => {
    const { policy } = subject('NETWORK');
    const access = await policy.resolve(user('NETWORK', managerPermissions));

    expect(policy.readableArticleWhere(access)).toEqual({});
    expect(policy.canManageArticle(access, { storeId: null })).toBe(true);
    expect(policy.canManageArticle(access, { storeId: 'store-a2' })).toBe(true);
    expect(() => policy.assertWritableStore(access, null)).not.toThrow();
  });

  it('limits STORES management to explicit allowed-store parents', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

    expect(policy.readableArticleWhere(access)).toEqual({
      OR: [
        { storeId: { in: ['store-a1'] } },
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
    expect(policy.canManageArticle(access, { storeId: 'store-a1' })).toBe(true);
    expect(policy.canManageArticle(access, { storeId: null })).toBe(false);
    expect(policy.canManageArticle(access, { storeId: 'store-a2' })).toBe(
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

  it('shows a STORES reader only published role-compatible parents', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(
      user('STORES', ['view_staff_knowledge']),
    );

    expect(policy.readableArticleWhere(access)).toEqual({
      OR: [
        {
          storeId: { in: ['store-a1'] },
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
  });

  it('scopes audience details to network users and overlapping store users', async () => {
    const { policy } = subject('STORES');
    const access = await policy.resolve(user('STORES', managerPermissions));

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
  });

  it('rejects a fresh subject without knowledge visibility', async () => {
    const { policy } = subject('STORES');

    await expect(policy.resolve(user('STORES', []))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
