import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from './access-scope.service';

const networkActor = {
  id: 'network-user',
  email: 'network@example.test',
  fullName: 'Network User',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const storeActor = {
  ...networkActor,
  id: 'store-user',
  role: UserRole.MANAGER,
  accessScope: 'STORES',
  allowedStoreIds: ['a1', 'a2'],
} satisfies AuthenticatedUser;

describe('AccessScopeService', () => {
  const service = new AccessScopeService();

  it('resolves explicit network and store scopes', () => {
    expect(service.resolve(networkActor)).toMatchObject({
      mode: 'NETWORK',
      allowedStoreIds: [],
    });
    expect(service.resolve(storeActor)).toMatchObject({
      mode: 'STORES',
      allowedStoreIds: ['a1', 'a2'],
    });
  });

  it('rejects an empty STORES scope at the authentication boundary', () => {
    const actor = {
      ...storeActor,
      allowedStoreIds: [],
    } satisfies AuthenticatedUser;

    expect(() => service.resolve(actor)).toThrow(UnauthorizedException);
  });

  it.each([undefined, null, 'ALL', ''])(
    'denies a missing or unknown persisted mode: %p',
    (accessScope) => {
      expect(() =>
        service.fromPersisted({
          tenantId: 'tenant-a',
          accessScope,
          storeAccesses: [],
        }),
      ).toThrow(UnauthorizedException);
    },
  );

  it('denies contradictory network store rows', () => {
    expect(() =>
      service.fromPersisted({
        tenantId: 'tenant-a',
        accessScope: 'NETWORK',
        storeAccesses: [{ storeId: 'a1' }],
      }),
    ).toThrow(UnauthorizedException);
  });

  it('denies duplicate and cross-tenant persisted store rows', () => {
    expect(() =>
      service.fromPersisted({
        tenantId: 'tenant-a',
        accessScope: 'STORES',
        storeAccesses: [{ storeId: 'a1' }, { storeId: 'a1' }],
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.fromPersisted({
        tenantId: 'tenant-a',
        accessScope: 'STORES',
        storeAccesses: [{ storeId: 'b1', store: { tenantId: 'tenant-b' } }],
      }),
    ).toThrow(UnauthorizedException);
  });

  it('uses all allowed stores when a store-scoped list has no filter', () => {
    expect(service.resolveRequestedStoreIds(storeActor)).toEqual(['a1', 'a2']);
    expect(service.resolveRequestedStoreIds(networkActor)).toBeNull();
  });

  it('rejects an explicit out-of-scope store instead of silently intersecting', () => {
    expect(() =>
      service.resolveRequestedStoreIds(storeActor, ['a1', 'a3']),
    ).toThrow(ForbiddenException);
  });

  it('hides an out-of-scope direct resource with 404 semantics', () => {
    expect(() => service.assertResourceStoreAllowed(storeActor, 'a3')).toThrow(
      NotFoundException,
    );
  });

  it('allows delegation only inside the actor scope', () => {
    expect(() =>
      service.assertCanDelegate(storeActor, {
        mode: 'STORES',
        storeIds: ['a1'],
      }),
    ).not.toThrow();

    expect(() =>
      service.assertCanDelegate(storeActor, {
        mode: 'NETWORK',
        storeIds: [],
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      service.assertCanDelegate(storeActor, {
        mode: 'STORES',
        storeIds: ['a3'],
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      service.assertCanDelegate(networkActor, {
        mode: 'STORES',
        storeIds: [],
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanManageTarget(storeActor, {
        mode: 'STORES',
        storeIds: [],
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanManageTarget(networkActor, {
        mode: 'STORES',
        storeIds: [],
      }),
    ).not.toThrow();
  });
});
