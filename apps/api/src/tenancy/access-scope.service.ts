import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';

export const ACCESS_SCOPE_MODES = ['NETWORK', 'STORES'] as const;

export type AccessScopeMode = (typeof ACCESS_SCOPE_MODES)[number];

export type ResolvedAccessScope = {
  tenantId: string;
  tenantSlug: string;
  mode: AccessScopeMode;
  allowedStoreIds: readonly string[];
};

type PersistedStoreAccess = {
  storeId: string;
  store?: {
    tenantId?: string | null;
  } | null;
};

export type PersistedAccessSubject = {
  tenantId: string;
  accessScope: unknown;
  storeAccesses: readonly PersistedStoreAccess[];
};

export type RequestedAccessScope = {
  mode: AccessScopeMode;
  storeIds: readonly string[];
};

@Injectable()
export class AccessScopeService {
  fromPersisted(subject: PersistedAccessSubject): RequestedAccessScope {
    const storeIds = this.validatePersistedStoreIds(subject);
    const mode = this.parsePersistedMode(subject.accessScope);

    if (mode === 'NETWORK' && storeIds.length > 0) {
      throw new UnauthorizedException('Invalid authorization scope');
    }

    if (mode === 'STORES' && storeIds.length === 0) {
      throw new UnauthorizedException('Invalid authorization scope');
    }

    return { mode, storeIds };
  }

  resolve(user?: AuthenticatedUser): ResolvedAccessScope {
    if (!user || !user.tenantId || !user.tenantSlug) {
      throw new UnauthorizedException('Authenticated access scope is required');
    }

    const persisted = this.fromPersisted({
      tenantId: user.tenantId,
      accessScope: user.accessScope,
      storeAccesses: user.allowedStoreIds.map((storeId) => ({ storeId })),
    });

    return {
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      mode: persisted.mode,
      allowedStoreIds: persisted.storeIds,
    };
  }

  assertNetwork(user?: AuthenticatedUser): ResolvedAccessScope {
    const scope = this.resolve(user);

    if (scope.mode !== 'NETWORK') {
      throw new ForbiddenException('Network access is required');
    }

    return scope;
  }

  assertStoreAllowed(user: AuthenticatedUser, storeId: string): void {
    const scope = this.resolve(user);

    if (scope.mode === 'NETWORK') {
      return;
    }

    if (!scope.allowedStoreIds.includes(storeId)) {
      throw new ForbiddenException('Store is outside your access scope');
    }
  }

  assertResourceStoreAllowed(user: AuthenticatedUser, storeId: string): void {
    const scope = this.resolve(user);

    if (scope.mode === 'STORES' && !scope.allowedStoreIds.includes(storeId)) {
      throw new NotFoundException('Resource not found');
    }
  }

  resolveRequestedStoreIds(
    user: AuthenticatedUser,
    requestedStoreIds?: readonly string[] | null,
  ): readonly string[] | null {
    const scope = this.resolve(user);

    if (requestedStoreIds === undefined || requestedStoreIds === null) {
      return scope.mode === 'NETWORK' ? null : scope.allowedStoreIds;
    }

    const normalized = this.normalizeRequestedStoreIds(requestedStoreIds);

    if (scope.mode === 'NETWORK') {
      return normalized;
    }

    this.assertSubset(normalized, scope.allowedStoreIds);
    return normalized;
  }

  assertCanDelegate(
    actor: AuthenticatedUser,
    target: RequestedAccessScope,
  ): void {
    const actorScope = this.resolve(actor);

    if (target.mode === 'NETWORK') {
      if (target.storeIds.length > 0) {
        throw new ForbiddenException(
          'Network scope cannot contain explicit stores',
        );
      }

      if (actorScope.mode !== 'NETWORK') {
        throw new ForbiddenException(
          'Store-scoped users cannot grant network access',
        );
      }

      return;
    }

    if (target.storeIds.length === 0) {
      throw new ForbiddenException(
        'A delegated store scope must contain at least one store',
      );
    }

    if (actorScope.mode === 'STORES') {
      this.assertSubset(target.storeIds, actorScope.allowedStoreIds);
    }
  }

  assertCanManageTarget(
    actor: AuthenticatedUser,
    target: RequestedAccessScope,
  ): void {
    if (target.mode === 'STORES' && target.storeIds.length === 0) {
      this.assertNetwork(actor);
      return;
    }

    this.assertCanDelegate(actor, target);
  }

  isVisibleTarget(
    actor: AuthenticatedUser,
    target: RequestedAccessScope,
  ): boolean {
    try {
      this.assertCanManageTarget(actor, target);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }

      throw error;
    }
  }

  private parsePersistedMode(value: unknown): AccessScopeMode {
    if (value === 'NETWORK' || value === 'STORES') {
      return value;
    }

    throw new UnauthorizedException('Invalid authorization scope');
  }

  private validatePersistedStoreIds(subject: PersistedAccessSubject): string[] {
    const storeIds: string[] = [];
    const seen = new Set<string>();

    for (const access of subject.storeAccesses) {
      const storeId =
        typeof access?.storeId === 'string' ? access.storeId.trim() : '';

      if (
        !storeId ||
        seen.has(storeId) ||
        (access.store?.tenantId !== undefined &&
          access.store?.tenantId !== subject.tenantId)
      ) {
        throw new UnauthorizedException('Invalid authorization scope');
      }

      seen.add(storeId);
      storeIds.push(storeId);
    }

    return storeIds;
  }

  private normalizeRequestedStoreIds(storeIds: readonly string[]): string[] {
    const normalized = storeIds
      .map((storeId) => (typeof storeId === 'string' ? storeId.trim() : ''))
      .filter(Boolean);

    if (
      normalized.length !== storeIds.length ||
      new Set(normalized).size !== normalized.length
    ) {
      throw new ForbiddenException('Invalid store scope');
    }

    return normalized;
  }

  private assertSubset(
    requestedStoreIds: readonly string[],
    allowedStoreIds: readonly string[],
  ): void {
    const allowed = new Set(allowedStoreIds);

    if (requestedStoreIds.some((storeId) => !allowed.has(storeId))) {
      throw new ForbiddenException('Store is outside your access scope');
    }
  }
}
