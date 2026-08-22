import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import {
  FreshStoreScopeService,
  type FreshStoreScope,
} from '../tenancy/fresh-store-scope.service';

type ShiftRegulationRoleScope =
  | 'ADMINISTRATOR'
  | 'SENIOR_ADMINISTRATOR'
  | 'MANAGER'
  | 'ALL_STAFF';

export type StaffShiftRegulationAccess = FreshStoreScope & {
  role: UserRole;
  visibleRoleScopes: readonly ShiftRegulationRoleScope[];
  canManageStandards: boolean;
};

@Injectable()
export class StaffShiftRegulationAccessPolicyService {
  constructor(
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async resolve(user: AuthenticatedUser): Promise<StaffShiftRegulationAccess> {
    const scope = await this.freshStoreScopeService.resolve(user);

    if (!hasCapability(user, 'view_staff_standards')) {
      throw new ForbiddenException('Shift regulation access is not allowed');
    }

    return {
      ...scope,
      role: user.role,
      visibleRoleScopes: this.visibleRoleScopes(user.role),
      canManageStandards: hasCapability(user, 'manage_staff_standards'),
    };
  }

  readableRegulationWhere(
    access: StaffShiftRegulationAccess,
  ): Prisma.StaffShiftRegulationWhereInput {
    const publishedForRole: Prisma.StaffShiftRegulationWhereInput = {
      status: 'PUBLISHED',
      roleScope: { in: [...access.visibleRoleScopes] },
    };

    if (access.mode === 'NETWORK') {
      return access.canManageStandards ? {} : publishedForRole;
    }

    return {
      OR: [
        {
          storeId: { in: [...access.allowedStoreIds] },
          ...(access.canManageStandards ? {} : publishedForRole),
        },
        { storeId: null, ...publishedForRole },
      ],
    };
  }

  readableRegulationIdsWhere(
    access: StaffShiftRegulationAccess,
    resourceIds: readonly string[],
  ): Prisma.StaffShiftRegulationWhereInput {
    return {
      tenantId: access.tenantId,
      id: { in: [...resourceIds] },
      AND: [this.readableRegulationWhere(access)],
    };
  }

  visibleUsersWhere(access: StaffShiftRegulationAccess): Prisma.UserWhereInput {
    if (!access.canManageStandards) {
      return {
        tenantId: access.tenantId,
        id: access.userId,
        isActive: true,
      };
    }

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

  visibleStoresWhere(
    access: StaffShiftRegulationAccess,
  ): Prisma.StoreWhereInput {
    return {
      tenantId: access.tenantId,
      ...(access.mode === 'STORES'
        ? { id: { in: [...access.allowedStoreIds] } }
        : {}),
    };
  }

  visibleAssessmentsWhere(
    access: StaffShiftRegulationAccess,
  ): Prisma.StaffAssessmentWhereInput {
    if (!access.canManageStandards) {
      return { tenantId: access.tenantId, id: { in: [] } };
    }

    return {
      tenantId: access.tenantId,
      status: 'ACTIVE',
      ...(access.mode === 'STORES'
        ? {
            OR: [
              { storeId: null },
              { storeId: { in: [...access.allowedStoreIds] } },
            ],
          }
        : {}),
    };
  }

  canManageRegulation(
    access: StaffShiftRegulationAccess,
    regulation: { storeId: string | null },
  ): boolean {
    return (
      access.canManageStandards &&
      (access.mode === 'NETWORK' ||
        (regulation.storeId !== null &&
          access.allowedStoreIds.includes(regulation.storeId)))
    );
  }

  canReadVersion(
    access: StaffShiftRegulationAccess,
    version: { storeId: string | null },
  ): boolean {
    return (
      access.mode === 'NETWORK' ||
      version.storeId === null ||
      access.allowedStoreIds.includes(version.storeId)
    );
  }

  assertWritableStore(
    access: StaffShiftRegulationAccess,
    storeId: string | null,
  ): void {
    if (!access.canManageStandards) {
      throw new ForbiddenException('Shift regulation editing is not allowed');
    }

    if (access.mode === 'NETWORK') {
      return;
    }

    if (storeId === null || !access.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException(
        'Shift regulation is outside your store access scope',
      );
    }
  }

  assertRequestedStore(
    access: StaffShiftRegulationAccess,
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

  private visibleRoleScopes(role: UserRole): ShiftRegulationRoleScope[] {
    if (role === UserRole.SENIOR_ADMINISTRATOR) {
      return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'ALL_STAFF'];
    }

    if (role === UserRole.CLUB_ADMINISTRATOR || role === UserRole.TRAINEE) {
      return ['ADMINISTRATOR', 'ALL_STAFF'];
    }

    return ['ADMINISTRATOR', 'SENIOR_ADMINISTRATOR', 'MANAGER', 'ALL_STAFF'];
  }
}
