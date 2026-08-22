import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import {
  FreshStoreScopeService,
  type FreshStoreScope,
} from '../tenancy/fresh-store-scope.service';

export type StaffKnowledgeRoleScope =
  | 'ALL_STAFF'
  | 'ADMINISTRATOR'
  | 'SENIOR_ADMINISTRATOR'
  | 'CLUB_MANAGER'
  | 'MANAGER'
  | 'STANDARDS_MANAGER';

export type StaffKnowledgeAccess = FreshStoreScope & {
  role: UserRole;
  visibleRoleScopes: readonly StaffKnowledgeRoleScope[];
  canEditKnowledge: boolean;
  canReviewKnowledge: boolean;
  canPublishKnowledge: boolean;
  canManageKnowledge: boolean;
};

@Injectable()
export class StaffKnowledgeAccessPolicyService {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<StaffKnowledgeAccess> {
    const scope = await this.freshStoreScopeService.resolve(user);

    if (!hasCapability(user, 'view_staff_knowledge')) {
      throw new ForbiddenException('Knowledge base access is not allowed');
    }

    const canEditKnowledge = hasCapability(user, 'edit_staff_knowledge');
    const canReviewKnowledge = hasCapability(user, 'review_staff_knowledge');
    const canPublishKnowledge = hasCapability(user, 'publish_staff_knowledge');

    return {
      ...scope,
      role: user.role,
      visibleRoleScopes: this.visibleRoleScopes(user.role),
      canEditKnowledge,
      canReviewKnowledge,
      canPublishKnowledge,
      canManageKnowledge:
        canEditKnowledge || canReviewKnowledge || canPublishKnowledge,
    };
  }

  readableArticleWhere(
    access: StaffKnowledgeAccess,
  ): Prisma.StaffKnowledgeArticleWhereInput {
    const publishedForRole: Prisma.StaffKnowledgeArticleWhereInput = {
      status: 'PUBLISHED',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return access.canManageKnowledge ? {} : publishedForRole;
    }

    const allowedStoreArticles: Prisma.StaffKnowledgeArticleWhereInput = {
      storeId: { in: [...access.allowedStoreIds] },
      ...(access.canManageKnowledge ? {} : publishedForRole),
    };

    return {
      OR: [
        allowedStoreArticles,
        {
          storeId: null,
          ...publishedForRole,
        },
      ],
    };
  }

  readableArticleIdsWhere(
    access: StaffKnowledgeAccess,
    resourceIds: readonly string[],
  ): Prisma.StaffKnowledgeArticleWhereInput {
    return {
      tenantId: access.tenantId,
      id: { in: [...resourceIds] },
      AND: [this.readableArticleWhere(access)],
    };
  }

  visibleUsersWhere(access: StaffKnowledgeAccess): Prisma.UserWhereInput {
    if (access.mode === 'NETWORK') {
      return { tenantId: access.tenantId, isActive: true };
    }

    return {
      tenantId: access.tenantId,
      isActive: true,
      OR: [
        { accessScope: 'NETWORK' },
        {
          accessScope: 'STORES',
          storeAccesses: {
            some: { storeId: { in: [...access.allowedStoreIds] } },
          },
        },
      ],
    };
  }

  canManageArticle(
    access: StaffKnowledgeAccess,
    article: { storeId: string | null },
  ): boolean {
    if (!access.canManageKnowledge) {
      return false;
    }

    return (
      access.mode === 'NETWORK' ||
      (article.storeId !== null &&
        access.allowedStoreIds.includes(article.storeId))
    );
  }

  assertWritableStore(
    access: StaffKnowledgeAccess,
    storeId: string | null,
  ): void {
    if (!access.canManageKnowledge) {
      throw new ForbiddenException('Knowledge base editing is not allowed');
    }

    if (access.mode === 'NETWORK') {
      return;
    }

    if (storeId === null || !access.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Knowledge article is outside your store access scope',
      );
    }
  }

  assertRequestedStore(
    access: StaffKnowledgeAccess,
    storeId: string | null,
  ): void {
    if (
      access.mode === 'STORES' &&
      storeId !== null &&
      !access.allowedStoreIds.includes(storeId)
    ) {
      throw new ForbiddenException('Store is outside your access scope');
    }
  }

  private visibleRoleScopes(role: UserRole): StaffKnowledgeRoleScope[] {
    const scopes: StaffKnowledgeRoleScope[] = ['ALL_STAFF'];

    if (role === UserRole.CLUB_ADMINISTRATOR || role === UserRole.TRAINEE) {
      scopes.push('ADMINISTRATOR');
    }

    if (role === UserRole.SENIOR_ADMINISTRATOR) {
      scopes.push('ADMINISTRATOR', 'SENIOR_ADMINISTRATOR');
    }

    if (role === UserRole.CLUB_MANAGER) {
      scopes.push('ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'CLUB_MANAGER');
    }

    if (
      role === UserRole.MANAGER ||
      role === UserRole.OWNER ||
      role === UserRole.ADMIN
    ) {
      scopes.push(
        'ADMINISTRATOR',
        'SENIOR_ADMINISTRATOR',
        'CLUB_MANAGER',
        'MANAGER',
        'STANDARDS_MANAGER',
      );
    }

    if (role === UserRole.STANDARDS_MANAGER) {
      scopes.push(
        'ADMINISTRATOR',
        'SENIOR_ADMINISTRATOR',
        'CLUB_MANAGER',
        'STANDARDS_MANAGER',
      );
    }

    return Array.from(new Set(scopes));
  }
}
