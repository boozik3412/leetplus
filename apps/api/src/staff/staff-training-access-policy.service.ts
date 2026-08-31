import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import {
  FreshStoreScopeService,
  type FreshStoreScope,
} from '../tenancy/fresh-store-scope.service';

export type StaffTrainingRoleScope =
  | 'ALL_STAFF'
  | 'ADMINISTRATOR'
  | 'SENIOR_ADMINISTRATOR'
  | 'CLUB_MANAGER'
  | 'MANAGER'
  | 'STANDARDS_MANAGER';

export type StaffTrainingAccess = FreshStoreScope & {
  role: UserRole;
  visibleRoleScopes: readonly StaffTrainingRoleScope[];
  canManageTraining: boolean;
};

@Injectable()
export class StaffTrainingAccessPolicyService {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<StaffTrainingAccess> {
    const scope = await this.freshStoreScopeService.resolve(user);

    if (!hasCapability(user, 'view_staff_training')) {
      throw new ForbiddenException('Staff training access is not allowed');
    }

    return {
      ...scope,
      role: user.role,
      visibleRoleScopes: this.visibleRoleScopes(user.role),
      canManageTraining: hasCapability(user, 'manage_staff_training'),
    };
  }

  readableCourseWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffTrainingCourseWhereInput {
    const activeForRole = this.activeForRoleWhere(access);

    if (access.mode === 'NETWORK') {
      return access.canManageTraining ? {} : activeForRole;
    }

    return {
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageTraining ? {} : activeForRole),
        },
        { storeId: null, ...activeForRole },
      ],
    };
  }

  readableCourseIdsWhere(
    access: StaffTrainingAccess,
    resourceIds: readonly string[],
  ): Prisma.StaffTrainingCourseWhereInput {
    return {
      tenantId: access.tenantId,
      id: { in: [...resourceIds] },
      AND: [this.readableCourseWhere(access)],
    };
  }

  readableOnboardingPlanWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffOnboardingPlanWhereInput {
    const activeForRole: Prisma.StaffOnboardingPlanWhereInput = {
      status: 'ACTIVE',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return access.canManageTraining ? {} : activeForRole;
    }

    return {
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageTraining ? {} : activeForRole),
        },
        { storeId: null, ...activeForRole },
      ],
    };
  }

  readableOnboardingPlanIdsWhere(
    access: StaffTrainingAccess,
    resourceIds: readonly string[],
  ): Prisma.StaffOnboardingPlanWhereInput {
    return {
      tenantId: access.tenantId,
      id: { in: [...resourceIds] },
      AND: [this.readableOnboardingPlanWhere(access)],
    };
  }

  activeProfileCourseWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffTrainingCourseWhereInput {
    return {
      AND: [this.readableCourseWhere(access), this.activeForRoleWhere(access)],
    };
  }

  visibleAssessmentsWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffAssessmentWhereInput {
    const activeForRole: Prisma.StaffAssessmentWhereInput = {
      status: 'ACTIVE',
      ...(access.canManageTraining
        ? {}
        : { roleScope: { in: [...access.visibleRoleScopes] } }),
    };

    return {
      tenantId: access.tenantId,
      ...(access.mode === 'STORES'
        ? {
            OR: [
              { storeId: null, ...activeForRole },
              {
                storeId: { in: [...access.allowedStoreIds] },
                ...activeForRole,
              },
            ],
          }
        : activeForRole),
    };
  }

  visibleKnowledgeArticlesWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffKnowledgeArticleWhereInput {
    if (access.mode === 'NETWORK') {
      return {
        tenantId: access.tenantId,
        status: access.canManageTraining
          ? { in: ['PUBLISHED', 'DRAFT'] }
          : 'PUBLISHED',
      };
    }

    const publishedForRole: Prisma.StaffKnowledgeArticleWhereInput = {
      status: 'PUBLISHED',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    return {
      tenantId: access.tenantId,
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageTraining
            ? { status: { in: ['PUBLISHED', 'DRAFT'] } }
            : publishedForRole),
        },
        { storeId: null, ...publishedForRole },
      ],
    };
  }

  visibleTaskTemplatesWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffTaskTemplateWhereInput {
    return {
      tenantId: access.tenantId,
      status: 'ACTIVE',
      ...(access.mode === 'STORES'
        ? {
            OR: [
              { storeId: { in: [...access.allowedStoreIds] } },
              { storeId: null },
            ],
          }
        : {}),
    };
  }

  visibleChecklistTemplatesWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffChecklistTemplateWhereInput {
    const activeForRole: Prisma.StaffChecklistTemplateWhereInput = {
      status: 'ACTIVE',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return {
        tenantId: access.tenantId,
        ...(access.canManageTraining ? { status: 'ACTIVE' } : activeForRole),
      };
    }

    return {
      tenantId: access.tenantId,
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageTraining ? { status: 'ACTIVE' } : activeForRole),
        },
        { storeId: null, ...activeForRole },
      ],
    };
  }

  visibleRegulationsWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffShiftRegulationWhereInput {
    const publishedForRole: Prisma.StaffShiftRegulationWhereInput = {
      status: 'PUBLISHED',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return {
        tenantId: access.tenantId,
        ...(access.canManageTraining
          ? { status: 'PUBLISHED' }
          : publishedForRole),
      };
    }

    return {
      tenantId: access.tenantId,
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageTraining
            ? { status: 'PUBLISHED' }
            : publishedForRole),
        },
        { storeId: null, ...publishedForRole },
      ],
    };
  }

  visibleUsersWhere(access: StaffTrainingAccess): Prisma.UserWhereInput {
    if (!access.canManageTraining) {
      return {
        tenantId: access.tenantId,
        id: access.userId,
        isActive: true,
        isPlatformAdmin: false,
      };
    }

    if (access.mode === 'NETWORK') {
      return { tenantId: access.tenantId, isPlatformAdmin: false };
    }

    return {
      tenantId: access.tenantId,
      isPlatformAdmin: false,
      storeAccesses: {
        some: { storeId: { in: [...access.allowedStoreIds] } },
      },
    };
  }

  visibleStoresWhere(access: StaffTrainingAccess): Prisma.StoreWhereInput {
    return {
      tenantId: access.tenantId,
      ...(access.mode === 'STORES'
        ? { id: { in: [...access.allowedStoreIds] } }
        : {}),
    };
  }

  canManageCourse(
    access: StaffTrainingAccess,
    course: { storeId: string | null },
  ): boolean {
    return (
      access.canManageTraining &&
      (access.mode === 'NETWORK' ||
        (course.storeId !== null &&
          access.allowedStoreIds.includes(course.storeId)))
    );
  }

  canManageOnboardingPlan(
    access: StaffTrainingAccess,
    plan: { storeId: string | null },
  ): boolean {
    return (
      access.canManageTraining &&
      (access.mode === 'NETWORK' ||
        (plan.storeId !== null &&
          access.allowedStoreIds.includes(plan.storeId)))
    );
  }

  canManageUser(
    access: StaffTrainingAccess,
    target: { id: string; storeAccesses: Array<{ storeId: string }> },
  ): boolean {
    if (!access.canManageTraining) {
      return target.id === access.userId;
    }

    return (
      access.mode === 'NETWORK' ||
      target.storeAccesses.some((item) =>
        access.allowedStoreIds.includes(item.storeId),
      )
    );
  }

  assertWritableStore(
    access: StaffTrainingAccess,
    storeId: string | null,
  ): void {
    if (!access.canManageTraining) {
      throw new ForbiddenException('Training course editing is not allowed');
    }

    if (access.mode === 'NETWORK') {
      return;
    }

    if (storeId === null || !access.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Training course is outside your store access scope',
      );
    }
  }

  assertWritableOnboardingStore(
    access: StaffTrainingAccess,
    storeId: string | null,
  ): void {
    if (!access.canManageTraining) {
      throw new ForbiddenException('Onboarding plan editing is not allowed');
    }

    if (access.mode === 'NETWORK') {
      return;
    }

    if (storeId === null || !access.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Onboarding plan is outside your store access scope',
      );
    }
  }

  assertRequestedStore(
    access: StaffTrainingAccess,
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

  projectStoreAccesses<T extends { storeId: string }>(
    access: StaffTrainingAccess,
    storeAccesses: readonly T[],
  ): T[] {
    if (access.mode === 'NETWORK') {
      return [...storeAccesses];
    }

    return storeAccesses.filter((item) =>
      access.allowedStoreIds.includes(item.storeId),
    );
  }

  private activeForRoleWhere(
    access: StaffTrainingAccess,
  ): Prisma.StaffTrainingCourseWhereInput {
    return {
      status: 'ACTIVE',
      ...(access.canManageTraining
        ? {}
        : { roleScope: { in: [...access.visibleRoleScopes] } }),
    };
  }

  private visibleRoleScopes(role: UserRole): StaffTrainingRoleScope[] {
    const scopes: StaffTrainingRoleScope[] = ['ALL_STAFF'];

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
