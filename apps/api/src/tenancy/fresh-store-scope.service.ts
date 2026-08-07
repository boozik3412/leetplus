import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScopeService,
  type ResolvedAccessScope,
} from './access-scope.service';

export type FreshStoreScope = ResolvedAccessScope & {
  userId: string;
};

export type FreshRequestedStoreScope = FreshStoreScope & {
  /** `null` means every store in this tenant; it is only valid for NETWORK. */
  effectiveStoreIds: readonly string[] | null;
};

@Injectable()
export class FreshStoreScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  /**
   * Re-reads the narrow authorization projection from PostgreSQL and rejects a
   * request whose guard-produced scope is no longer identical to DB authority.
   */
  async resolve(user: AuthenticatedUser): Promise<FreshStoreScope> {
    if (
      !user?.id ||
      !user.tenantId ||
      !user.tenantSlug ||
      user.isPlatformAdmin
    ) {
      throw new UnauthorizedException('Fresh tenant store scope is required');
    }

    const subject = await this.prisma.user.findUnique({
      where: {
        tenantId_id: {
          tenantId: user.tenantId,
          id: user.id,
        },
      },
      select: {
        id: true,
        tenantId: true,
        accessScope: true,
        isActive: true,
        isPlatformAdmin: true,
        tenant: {
          select: {
            slug: true,
          },
        },
        storeAccesses: {
          select: {
            storeId: true,
            store: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!subject || !subject.isActive || subject.isPlatformAdmin) {
      throw new UnauthorizedException('Fresh tenant store scope is required');
    }

    const persisted = this.accessScopeService.fromPersisted(subject);
    const guardScope = this.accessScopeService.resolve(user);
    const freshStoreIds = this.sorted(persisted.storeIds);
    const guardStoreIds = this.sorted(guardScope.allowedStoreIds);

    if (
      subject.id !== user.id ||
      subject.tenantId !== guardScope.tenantId ||
      subject.tenant.slug !== guardScope.tenantSlug ||
      persisted.mode !== guardScope.mode ||
      !this.sameIds(freshStoreIds, guardStoreIds)
    ) {
      throw new UnauthorizedException('Authorization scope is stale');
    }

    return {
      userId: subject.id,
      tenantId: subject.tenantId,
      tenantSlug: subject.tenant.slug,
      mode: persisted.mode,
      allowedStoreIds: freshStoreIds,
    };
  }

  async assertNetwork(user: AuthenticatedUser): Promise<FreshStoreScope> {
    const scope = await this.resolve(user);

    if (scope.mode !== 'NETWORK') {
      throw new ForbiddenException('Network access is required');
    }

    return scope;
  }

  async resolveRequestedStoreIds(
    user: AuthenticatedUser,
    requestedStoreIds?: readonly string[] | null,
  ): Promise<FreshRequestedStoreScope> {
    const scope = await this.resolve(user);

    if (requestedStoreIds === undefined || requestedStoreIds === null) {
      return {
        ...scope,
        effectiveStoreIds:
          scope.mode === 'NETWORK' ? null : scope.allowedStoreIds,
      };
    }

    const requested = this.normalizeRequestedStoreIds(requestedStoreIds);

    if (scope.mode === 'STORES') {
      const allowed = new Set(scope.allowedStoreIds);

      if (requested.some((storeId) => !allowed.has(storeId))) {
        throw new ForbiddenException('Store is outside your access scope');
      }

      return { ...scope, effectiveStoreIds: requested };
    }

    const stores = await this.prisma.store.findMany({
      where: {
        tenantId: scope.tenantId,
        id: { in: [...requested] },
      },
      select: { id: true },
    });
    const found = new Set(stores.map((store) => store.id));

    if (requested.some((storeId) => !found.has(storeId))) {
      throw new ForbiddenException('Store is outside your tenant');
    }

    return { ...scope, effectiveStoreIds: requested };
  }

  private normalizeRequestedStoreIds(
    storeIds: readonly string[],
  ): readonly string[] {
    const normalized = storeIds.map((storeId) =>
      typeof storeId === 'string' ? storeId.trim() : '',
    );

    if (
      normalized.length === 0 ||
      normalized.some((storeId) => !storeId) ||
      new Set(normalized).size !== normalized.length
    ) {
      throw new ForbiddenException('Invalid store scope');
    }

    return normalized;
  }

  private sorted(storeIds: readonly string[]): readonly string[] {
    return [...storeIds].sort((left, right) => left.localeCompare(right));
  }

  private sameIds(left: readonly string[], right: readonly string[]): boolean {
    return (
      left.length === right.length &&
      left.every((storeId, index) => storeId === right[index])
    );
  }
}
