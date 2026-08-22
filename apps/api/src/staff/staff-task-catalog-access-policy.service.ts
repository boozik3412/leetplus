import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AccessScopeService,
  type ResolvedAccessScope,
} from '../tenancy/access-scope.service';

const serverOwnedTaskLabelKeys = [
  'assignmentMode',
  'candidateUserIds',
  'originalAssignedToUserIds',
  'bulkTaskGroupId',
] as const;

type CatalogScopeTransactionClient = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'user'
>;

@Injectable()
export class StaffTaskCatalogAccessPolicyService {
  constructor(private readonly accessScopeService: AccessScopeService) {}

  resolve(user: AuthenticatedUser): ResolvedAccessScope {
    return this.accessScopeService.resolve(user);
  }

  async resolveFreshForMutation(
    tx: CatalogScopeTransactionClient,
    user: AuthenticatedUser,
  ): Promise<ResolvedAccessScope> {
    if (!user.id || !user.tenantId || !user.tenantSlug) {
      throw new UnauthorizedException('Authenticated access scope is required');
    }

    const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT subject."id"
      FROM "User" AS subject
      WHERE subject."id" = ${user.id}
        AND subject."tenantId" = ${user.tenantId}
        AND subject."isActive" = true
      FOR SHARE
    `);

    if (lockedUsers.length !== 1) {
      throw new UnauthorizedException(
        'Authenticated access scope is no longer active',
      );
    }

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT access."id"
      FROM "UserStoreAccess" AS access
      WHERE access."userId" = ${user.id}
      ORDER BY access."storeId", access."id"
      FOR SHARE
    `);

    const subject = await tx.user.findFirst({
      where: {
        id: user.id,
        tenantId: user.tenantId,
        isActive: true,
      },
      select: {
        tenantId: true,
        accessScope: true,
        storeAccesses: {
          select: {
            storeId: true,
            store: { select: { tenantId: true } },
          },
        },
      },
    });

    if (!subject) {
      throw new UnauthorizedException(
        'Authenticated access scope is no longer active',
      );
    }

    const persisted = this.accessScopeService.fromPersisted(subject);

    return {
      tenantId: subject.tenantId,
      tenantSlug: user.tenantSlug,
      mode: persisted.mode,
      allowedStoreIds: persisted.storeIds,
    };
  }

  assertExplicitStoreFilterAllowed(
    scope: ResolvedAccessScope,
    storeId: string | null | undefined,
  ): void {
    if (
      storeId &&
      scope.mode === 'STORES' &&
      !scope.allowedStoreIds.includes(storeId)
    ) {
      throw new ForbiddenException('Store is outside your access scope');
    }
  }

  assertStoreMutationAllowed(
    scope: ResolvedAccessScope,
    storeId: string | null,
  ): void {
    if (scope.mode === 'NETWORK') {
      return;
    }

    if (!storeId || !scope.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'A store-scoped catalog resource must belong to an allowed store',
      );
    }
  }

  assertTaskLabelsWritable(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    const labels = value as Record<string, unknown>;
    const forbiddenKey = serverOwnedTaskLabelKeys.find((key) =>
      Object.prototype.hasOwnProperty.call(labels, key),
    );

    if (forbiddenKey) {
      throw new BadRequestException(
        `Task label "${forbiddenKey}" is managed by the server`,
      );
    }
  }

  buildTemplateWhere(
    scope: ResolvedAccessScope,
    where: Prisma.StaffTaskTemplateWhereInput = {},
  ): Prisma.StaffTaskTemplateWhereInput {
    return {
      AND: [
        { tenantId: scope.tenantId },
        where,
        ...(scope.mode === 'STORES'
          ? [{ storeId: { in: [...scope.allowedStoreIds] } }]
          : []),
      ],
    };
  }

  buildTemplateLookupWhere(
    scope: ResolvedAccessScope,
    id: string,
  ): Prisma.StaffTaskTemplateWhereInput {
    return this.buildTemplateWhere(scope, { id });
  }

  buildRuleWhere(
    scope: ResolvedAccessScope,
    where: Prisma.StaffTaskRecurringRuleWhereInput = {},
  ): Prisma.StaffTaskRecurringRuleWhereInput {
    return {
      AND: [
        { tenantId: scope.tenantId },
        where,
        ...(scope.mode === 'STORES'
          ? [{ storeId: { in: [...scope.allowedStoreIds] } }]
          : []),
      ],
    };
  }

  buildRuleLookupWhere(
    scope: ResolvedAccessScope,
    id: string,
  ): Prisma.StaffTaskRecurringRuleWhereInput {
    return this.buildRuleWhere(scope, { id });
  }

  buildRunWhere(
    scope: ResolvedAccessScope,
    where: Prisma.StaffTaskRecurringRuleRunWhereInput = {},
  ): Prisma.StaffTaskRecurringRuleRunWhereInput {
    return {
      AND: [
        { tenantId: scope.tenantId },
        where,
        {
          rule: {
            is: {
              tenantId: scope.tenantId,
              ...(scope.mode === 'STORES'
                ? { storeId: { in: [...scope.allowedStoreIds] } }
                : {}),
            },
          },
        },
        {
          OR: [
            { createdTaskId: null },
            {
              createdTask: {
                is: {
                  tenantId: scope.tenantId,
                  ...(scope.mode === 'STORES'
                    ? { storeId: { in: [...scope.allowedStoreIds] } }
                    : {}),
                },
              },
            },
          ],
        },
      ],
    };
  }

  buildRunLookupWhere(
    scope: ResolvedAccessScope,
    id: string,
  ): Prisma.StaffTaskRecurringRuleRunWhereInput {
    return this.buildRunWhere(scope, { id });
  }

  buildStoreSelectorWhere(scope: ResolvedAccessScope): Prisma.StoreWhereInput {
    if (scope.mode === 'NETWORK') {
      return { tenantId: scope.tenantId };
    }

    return {
      tenantId: scope.tenantId,
      id: { in: [...scope.allowedStoreIds] },
    };
  }

  buildParticipantUserWhere(
    scope: ResolvedAccessScope,
    requiredStoreId?: string | null,
  ): Prisma.UserWhereInput {
    if (scope.mode === 'NETWORK') {
      const where: Prisma.UserWhereInput = {
        tenantId: scope.tenantId,
        isActive: true,
        isPlatformAdmin: false,
      };

      if (requiredStoreId === null) {
        return {
          ...where,
          accessScope: 'NETWORK',
          storeAccesses: { none: {} },
        };
      }

      if (requiredStoreId) {
        return {
          ...where,
          OR: [
            {
              accessScope: 'NETWORK',
              storeAccesses: { none: {} },
            },
            {
              accessScope: 'STORES',
              storeAccesses: {
                some: { storeId: requiredStoreId },
                none: {
                  store: { tenantId: { not: scope.tenantId } },
                },
              },
            },
          ],
        };
      }

      return {
        ...where,
        OR: [
          {
            accessScope: 'NETWORK',
            storeAccesses: { none: {} },
          },
          {
            accessScope: 'STORES',
            storeAccesses: {
              some: { store: { tenantId: scope.tenantId } },
              none: {
                store: { tenantId: { not: scope.tenantId } },
              },
            },
          },
        ],
      };
    }

    if (requiredStoreId !== undefined) {
      this.assertStoreMutationAllowed(scope, requiredStoreId);
    }

    return {
      tenantId: scope.tenantId,
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      storeAccesses: {
        some: {
          storeId: requiredStoreId
            ? requiredStoreId
            : { in: [...scope.allowedStoreIds] },
        },
        none: {
          storeId: { notIn: [...scope.allowedStoreIds] },
        },
      },
    };
  }
}
