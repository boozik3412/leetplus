import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import {
  FreshStoreScopeService,
  type FreshStoreScope,
} from '../tenancy/fresh-store-scope.service';

export type StaffChecklistRoleScope =
  | 'ADMINISTRATOR'
  | 'SENIOR_ADMINISTRATOR'
  | 'MANAGER'
  | 'ALL_STAFF';

export type StaffChecklistAccess = FreshStoreScope & {
  role: UserRole;
  visibleRoleScopes: readonly StaffChecklistRoleScope[];
  canManageStandards: boolean;
};

@Injectable()
export class StaffChecklistAccessPolicyService {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<StaffChecklistAccess> {
    const scope = await this.freshStoreScopeService.resolve(user);

    if (!hasCapability(user, 'view_staff_standards')) {
      throw new ForbiddenException('Checklist access is not allowed');
    }

    return {
      ...scope,
      role: user.role,
      visibleRoleScopes: this.visibleRoleScopes(user.role),
      canManageStandards: hasCapability(user, 'manage_staff_standards'),
    };
  }

  readableTemplateWhere(
    access: StaffChecklistAccess,
  ): Prisma.StaffChecklistTemplateWhereInput {
    const activeForRole: Prisma.StaffChecklistTemplateWhereInput = {
      status: 'ACTIVE',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return access.canManageStandards ? {} : activeForRole;
    }

    return {
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageStandards ? {} : activeForRole),
        },
        { storeId: null, ...activeForRole },
      ],
    };
  }

  readableRegulationWhere(
    access: StaffChecklistAccess,
  ): Prisma.StaffShiftRegulationWhereInput {
    const publishedForRole: Prisma.StaffShiftRegulationWhereInput = {
      status: 'PUBLISHED',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return access.canManageStandards
        ? { status: 'PUBLISHED' }
        : publishedForRole;
    }

    return {
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...publishedForRole,
        },
        { storeId: null, ...publishedForRole },
      ],
    };
  }

  readableRunWhere(
    access: StaffChecklistAccess,
  ): Prisma.StaffChecklistRunWhereInput {
    return access.mode === 'NETWORK'
      ? {}
      : { storeId: { in: [...access.allowedStoreIds] } };
  }

  readableRunIdsWhere(
    access: StaffChecklistAccess,
    resourceIds: readonly string[],
  ): Prisma.StaffChecklistRunWhereInput {
    return {
      tenantId: access.tenantId,
      id: { in: [...resourceIds] },
      AND: [this.readableRunWhere(access)],
    };
  }

  visibleStoresWhere(access: StaffChecklistAccess): Prisma.StoreWhereInput {
    return {
      tenantId: access.tenantId,
      ...(access.mode === 'STORES'
        ? { id: { in: [...access.allowedStoreIds] } }
        : {}),
    };
  }

  visibleUsersWhere(access: StaffChecklistAccess): Prisma.UserWhereInput {
    if (!access.canManageStandards) {
      return {
        tenantId: access.tenantId,
        id: access.userId,
        isActive: true,
        isPlatformAdmin: false,
      };
    }

    if (access.mode === 'NETWORK') {
      return {
        tenantId: access.tenantId,
        isActive: true,
        isPlatformAdmin: false,
      };
    }

    return {
      tenantId: access.tenantId,
      isActive: true,
      isPlatformAdmin: false,
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

  canManageTemplate(
    access: StaffChecklistAccess,
    template: { storeId: string | null },
  ): boolean {
    return (
      access.canManageStandards &&
      (access.mode === 'NETWORK' ||
        (template.storeId !== null &&
          access.allowedStoreIds.includes(template.storeId)))
    );
  }

  assertWritableStore(
    access: StaffChecklistAccess,
    storeId: string | null,
  ): void {
    if (!access.canManageStandards) {
      throw new ForbiddenException('Checklist template editing is not allowed');
    }

    this.assertOperationalStore(access, storeId);
  }

  assertOperationalStore(
    access: StaffChecklistAccess,
    storeId: string | null,
  ): void {
    if (access.mode === 'NETWORK') {
      return;
    }

    if (storeId === null || !access.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Checklist is outside your store access scope',
      );
    }
  }

  assertRequestedStore(
    access: StaffChecklistAccess,
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

  private visibleRoleScopes(role: UserRole): StaffChecklistRoleScope[] {
    if (role === UserRole.SENIOR_ADMINISTRATOR) {
      return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'ALL_STAFF'];
    }

    if (role === UserRole.CLUB_ADMINISTRATOR || role === UserRole.TRAINEE) {
      return ['ADMINISTRATOR', 'ALL_STAFF'];
    }

    return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'MANAGER', 'ALL_STAFF'];
  }
}
