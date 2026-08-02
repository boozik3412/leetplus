import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AccessScopeService,
  type ResolvedAccessScope,
} from '../tenancy/access-scope.service';
import { StaffTaskCatalogAccessPolicyService } from './staff-task-catalog-access-policy.service';

describe('StaffTaskCatalogAccessPolicyService', () => {
  const tenantId = 'tenant-a';
  const allowedStoreIds = ['store-a1', 'store-a2'] as const;
  const foreignStoreId = 'store-b1';

  const networkScope: ResolvedAccessScope = {
    tenantId,
    tenantSlug: 'network-a',
    mode: 'NETWORK',
    allowedStoreIds: [],
  };
  const storesScope: ResolvedAccessScope = {
    tenantId,
    tenantSlug: 'network-a',
    mode: 'STORES',
    allowedStoreIds,
  };

  function actor(
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser {
    return {
      id: 'user-a1',
      email: 'manager-a1@example.test',
      fullName: 'Store manager',
      role: UserRole.MANAGER,
      isPlatformAdmin: false,
      tenantId,
      tenantSlug: 'network-a',
      accessScope: 'STORES',
      allowedStoreIds,
      ...overrides,
    };
  }

  function createService(accessScopeService = new AccessScopeService()) {
    return new StaffTaskCatalogAccessPolicyService(accessScopeService);
  }

  describe('persisted scope resolution', () => {
    it('delegates resolution to AccessScopeService', () => {
      const accessScopeService = {
        resolve: jest.fn().mockReturnValue(storesScope),
      };
      const service = createService(accessScopeService as never);
      const user = actor();

      expect(service.resolve(user)).toBe(storesScope);
      expect(accessScopeService.resolve).toHaveBeenCalledWith(user);
    });

    it('does not accept an invalid empty STORES scope', () => {
      const service = createService();

      expect(() => service.resolve(actor({ allowedStoreIds: [] }))).toThrow(
        UnauthorizedException,
      );
    });

    it('locks and reloads the persisted mutation scope', async () => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'user-a1' }])
          .mockResolvedValueOnce([{ id: 'access-a1' }]),
        user: {
          findFirst: jest.fn().mockResolvedValue({
            tenantId,
            accessScope: 'STORES',
            storeAccesses: [
              {
                storeId: allowedStoreIds[0],
                store: { tenantId },
              },
            ],
          }),
        },
      };
      const service = createService();

      await expect(
        service.resolveFreshForMutation(tx as never, actor()),
      ).resolves.toEqual({
        tenantId,
        tenantSlug: 'network-a',
        mode: 'STORES',
        allowedStoreIds: [allowedStoreIds[0]],
      });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(tx.user.findFirst).toHaveBeenCalledTimes(1);
    });

    it('fails closed when the actor is inactive before mutation', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: { findFirst: jest.fn() },
      };
      const service = createService();

      await expect(
        service.resolveFreshForMutation(tx as never, actor()),
      ).rejects.toThrow(UnauthorizedException);
      expect(tx.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('NETWORK scope', () => {
    const service = createService();

    it('keeps tenant-global and store-bound templates and rules visible', () => {
      expect(
        service.buildTemplateWhere(networkScope, {
          OR: [{ storeId: null }, { storeId: 'store-a1' }],
        }),
      ).toEqual({
        AND: [
          { tenantId },
          { OR: [{ storeId: null }, { storeId: 'store-a1' }] },
        ],
      });
      expect(
        service.buildRuleWhere(networkScope, {
          status: 'ACTIVE',
        }),
      ).toEqual({
        AND: [{ tenantId }, { status: 'ACTIVE' }],
      });
    });

    it('scopes direct lookup and run history by tenant without store limits', () => {
      expect(
        service.buildTemplateLookupWhere(networkScope, 'template-1'),
      ).toEqual({
        AND: [{ tenantId }, { id: 'template-1' }],
      });
      expect(service.buildRuleLookupWhere(networkScope, 'rule-1')).toEqual({
        AND: [{ tenantId }, { id: 'rule-1' }],
      });
      expect(
        service.buildRunWhere(networkScope, {
          status: 'SUCCESS',
        }),
      ).toEqual({
        AND: [
          { tenantId },
          { status: 'SUCCESS' },
          { rule: { is: { tenantId } } },
          {
            OR: [
              { createdTaskId: null },
              { createdTask: { is: { tenantId } } },
            ],
          },
        ],
      });
      expect(service.buildRunLookupWhere(networkScope, 'run-1')).toEqual({
        AND: [
          { tenantId },
          { id: 'run-1' },
          { rule: { is: { tenantId } } },
          {
            OR: [
              { createdTaskId: null },
              { createdTask: { is: { tenantId } } },
            ],
          },
        ],
      });
    });

    it('allows network-global and concrete-store writes', () => {
      expect(() =>
        service.assertStoreMutationAllowed(networkScope, null),
      ).not.toThrow();
      expect(() =>
        service.assertStoreMutationAllowed(networkScope, foreignStoreId),
      ).not.toThrow();
      expect(() =>
        service.assertExplicitStoreFilterAllowed(networkScope, foreignStoreId),
      ).not.toThrow();
    });

    it('returns all tenant stores and all active non-platform participants', () => {
      expect(service.buildStoreSelectorWhere(networkScope)).toEqual({
        tenantId,
      });
      expect(
        service.buildParticipantUserWhere(networkScope, 'store-a1'),
      ).toEqual({
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        OR: [
          {
            accessScope: 'NETWORK',
            storeAccesses: { none: {} },
          },
          {
            accessScope: 'STORES',
            storeAccesses: {
              some: { storeId: 'store-a1' },
              none: {
                store: { tenantId: { not: tenantId } },
              },
            },
          },
        ],
      });
      expect(service.buildParticipantUserWhere(networkScope, null)).toEqual({
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        accessScope: 'NETWORK',
        storeAccesses: { none: {} },
      });
    });
  });

  describe('STORES scope', () => {
    const service = createService();

    it('uses AND-safe store predicates for templates and rules', () => {
      expect(
        service.buildTemplateWhere(storesScope, {
          OR: [{ status: 'ACTIVE' }, { status: 'DRAFT' }],
        }),
      ).toEqual({
        AND: [
          { tenantId },
          { OR: [{ status: 'ACTIVE' }, { status: 'DRAFT' }] },
          { storeId: { in: [...allowedStoreIds] } },
        ],
      });
      expect(
        service.buildRuleWhere(storesScope, {
          OR: [{ cadence: 'DAILY' }, { cadence: 'WEEKLY' }],
        }),
      ).toEqual({
        AND: [
          { tenantId },
          { OR: [{ cadence: 'DAILY' }, { cadence: 'WEEKLY' }] },
          { storeId: { in: [...allowedStoreIds] } },
        ],
      });
    });

    it('excludes tenant-global and foreign resources from direct UUID lookups', () => {
      expect(
        service.buildTemplateLookupWhere(storesScope, 'hidden-template'),
      ).toEqual({
        AND: [
          { tenantId },
          { id: 'hidden-template' },
          { storeId: { in: [...allowedStoreIds] } },
        ],
      });
      expect(service.buildRuleLookupWhere(storesScope, 'hidden-rule')).toEqual({
        AND: [
          { tenantId },
          { id: 'hidden-rule' },
          { storeId: { in: [...allowedStoreIds] } },
        ],
      });
    });

    it('scopes run history through its recurring rule store', () => {
      expect(
        service.buildRunWhere(storesScope, {
          status: { in: ['SUCCESS', 'FAILED'] },
        }),
      ).toEqual({
        AND: [
          { tenantId },
          { status: { in: ['SUCCESS', 'FAILED'] } },
          {
            rule: {
              is: {
                tenantId,
                storeId: { in: [...allowedStoreIds] },
              },
            },
          },
          {
            OR: [
              { createdTaskId: null },
              {
                createdTask: {
                  is: {
                    tenantId,
                    storeId: { in: [...allowedStoreIds] },
                  },
                },
              },
            ],
          },
        ],
      });
      expect(service.buildRunLookupWhere(storesScope, 'hidden-run')).toEqual({
        AND: [
          { tenantId },
          { id: 'hidden-run' },
          {
            rule: {
              is: {
                tenantId,
                storeId: { in: [...allowedStoreIds] },
              },
            },
          },
          {
            OR: [
              { createdTaskId: null },
              {
                createdTask: {
                  is: {
                    tenantId,
                    storeId: { in: [...allowedStoreIds] },
                  },
                },
              },
            ],
          },
        ],
      });
    });

    it('accepts an allowed or absent list filter and rejects a foreign one', () => {
      expect(() =>
        service.assertExplicitStoreFilterAllowed(
          storesScope,
          allowedStoreIds[0],
        ),
      ).not.toThrow();
      expect(() =>
        service.assertExplicitStoreFilterAllowed(storesScope, null),
      ).not.toThrow();
      expect(() =>
        service.assertExplicitStoreFilterAllowed(storesScope, undefined),
      ).not.toThrow();
      expect(() =>
        service.assertExplicitStoreFilterAllowed(storesScope, foreignStoreId),
      ).toThrow(ForbiddenException);
    });

    it('requires every create or update result to keep an allowed concrete store', () => {
      expect(() =>
        service.assertStoreMutationAllowed(storesScope, allowedStoreIds[1]),
      ).not.toThrow();
      expect(() =>
        service.assertStoreMutationAllowed(storesScope, null),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertStoreMutationAllowed(storesScope, foreignStoreId),
      ).toThrow(ForbiddenException);
    });

    it('limits store selectors to the persisted allowed set', () => {
      expect(service.buildStoreSelectorWhere(storesScope)).toEqual({
        tenantId,
        id: { in: [...allowedStoreIds] },
      });
    });

    it('selects only active non-platform store-scoped participants within the actor subset', () => {
      expect(
        service.buildParticipantUserWhere(storesScope, allowedStoreIds[0]),
      ).toEqual({
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        accessScope: 'STORES',
        storeAccesses: {
          some: { storeId: allowedStoreIds[0] },
          none: {
            storeId: { notIn: [...allowedStoreIds] },
          },
        },
      });
    });

    it('rejects a foreign concrete store and supports an actor-wide option selector', () => {
      expect(() =>
        service.buildParticipantUserWhere(storesScope, foreignStoreId),
      ).toThrow(ForbiddenException);
      expect(service.buildParticipantUserWhere(storesScope)).toEqual({
        tenantId,
        isActive: true,
        isPlatformAdmin: false,
        accessScope: 'STORES',
        storeAccesses: {
          some: { storeId: { in: [...allowedStoreIds] } },
          none: {
            storeId: { notIn: [...allowedStoreIds] },
          },
        },
      });
    });
  });

  describe('server-owned task labels', () => {
    const service = createService();

    it('allows ordinary catalog metadata', () => {
      expect(() =>
        service.assertTaskLabelsWritable({ source: 'template' }),
      ).not.toThrow();
      expect(() => service.assertTaskLabelsWritable(null)).not.toThrow();
    });

    it.each([
      'assignmentMode',
      'candidateUserIds',
      'originalAssignedToUserIds',
      'bulkTaskGroupId',
    ] as const)('rejects %s', (key) => {
      expect(() =>
        service.assertTaskLabelsWritable({ [key]: 'spoofed' }),
      ).toThrow(BadRequestException);
    });
  });
});
