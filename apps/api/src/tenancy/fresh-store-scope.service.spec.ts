import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from './access-scope.service';
import { FreshStoreScopeService } from './fresh-store-scope.service';

describe('FreshStoreScopeService', () => {
  const userFindUnique = jest.fn();
  const storeFindMany = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    store: { findMany: storeFindMany },
  } as unknown as PrismaService;
  const service = new FreshStoreScopeService(prisma, new AccessScopeService());

  const requestUser = (
    overrides: Partial<AuthenticatedUser> = {},
  ): AuthenticatedUser => ({
    id: 'user-1',
    email: 'owner@example.com',
    fullName: 'Owner',
    role: UserRole.OWNER,
    isPlatformAdmin: false,
    tenantId: 'tenant-1',
    tenantSlug: 'network-one',
    accessScope: 'STORES',
    allowedStoreIds: ['store-1'],
    ...overrides,
  });

  const persistedUser = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 'user-1',
    tenantId: 'tenant-1',
    accessScope: 'STORES',
    isActive: true,
    isPlatformAdmin: false,
    tenant: { slug: 'network-one' },
    storeAccesses: [{ storeId: 'store-1', store: { tenantId: 'tenant-1' } }],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue(persistedUser());
    storeFindMany.mockResolvedValue([]);
  });

  it('accepts a matching fresh Tenant A NETWORK authority', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({
        tenantId: 'tenant-a',
        accessScope: 'NETWORK',
        tenant: { slug: 'network-a' },
        storeAccesses: [],
      }),
    );
    const user = requestUser({
      tenantId: 'tenant-a',
      tenantSlug: 'network-a',
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    });

    await expect(service.assertNetwork(user)).resolves.toMatchObject({
      tenantId: 'tenant-a',
      tenantSlug: 'network-a',
      mode: 'NETWORK',
      allowedStoreIds: [],
    });
  });

  it('rejects a stale Tenant A NETWORK JWT after a DB downgrade to store A1', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({
        tenantId: 'tenant-a',
        tenant: { slug: 'network-a' },
        accessScope: 'STORES',
        storeAccesses: [
          { storeId: 'store-a1', store: { tenantId: 'tenant-a' } },
        ],
      }),
    );

    await expect(
      service.assertNetwork(
        requestUser({
          tenantId: 'tenant-a',
          tenantSlug: 'network-a',
          accessScope: 'NETWORK',
          allowedStoreIds: [],
        }),
      ),
    ).rejects.toThrow('Authorization scope is stale');
  });

  it('rejects Tenant A when it requests foreign store B1', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({
        tenantId: 'tenant-a',
        tenant: { slug: 'network-a' },
        accessScope: 'NETWORK',
        storeAccesses: [],
      }),
    );

    await expect(
      service.resolveRequestedStoreIds(
        requestUser({
          tenantId: 'tenant-a',
          tenantSlug: 'network-a',
          accessScope: 'NETWORK',
          allowedStoreIds: [],
        }),
        ['store-b1'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['store-b1'] } },
      select: { id: true },
    });
  });

  it('rejects a store A1 JWT when the persisted relation crosses to tenant B store B1', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({
        tenantId: 'tenant-a',
        tenant: { slug: 'network-a' },
        accessScope: 'STORES',
        storeAccesses: [
          { storeId: 'store-b1', store: { tenantId: 'tenant-b' } },
        ],
      }),
    );

    await expect(
      service.resolve(
        requestUser({
          tenantId: 'tenant-a',
          tenantSlug: 'network-a',
          accessScope: 'STORES',
          allowedStoreIds: ['store-a1'],
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a Tenant B actor absent from the claimed tenant boundary', async () => {
    userFindUnique.mockResolvedValue(null);
    const user = requestUser({
      id: 'user-b',
      tenantId: 'tenant-b',
      tenantSlug: 'network-b',
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    });

    await expect(service.assertNetwork(user)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_id: { tenantId: 'tenant-b', id: 'user-b' },
        },
      }),
    );
  });

  it('returns the full fresh allow-list when a store-scoped request has no filter', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({
        storeAccesses: [
          { storeId: 'store-2', store: { tenantId: 'tenant-1' } },
          { storeId: 'store-1', store: { tenantId: 'tenant-1' } },
        ],
      }),
    );

    const result = await service.resolveRequestedStoreIds(
      requestUser({ allowedStoreIds: ['store-1', 'store-2'] }),
    );

    expect(result.effectiveStoreIds).toEqual(['store-1', 'store-2']);
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_id: { tenantId: 'tenant-1', id: 'user-1' },
        },
      }),
    );
  });

  it('denies a requested store outside the fresh store allow-list', async () => {
    await expect(
      service.resolveRequestedStoreIds(requestUser(), ['store-2']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storeFindMany).not.toHaveBeenCalled();
  });

  it('validates a network-owner filter against stores in the same tenant', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({ accessScope: 'NETWORK', storeAccesses: [] }),
    );
    storeFindMany.mockResolvedValue([{ id: 'store-1' }]);

    await expect(
      service.resolveRequestedStoreIds(
        requestUser({ accessScope: 'NETWORK', allowedStoreIds: [] }),
        ['store-1'],
      ),
    ).resolves.toMatchObject({ effectiveStoreIds: ['store-1'] });
    expect(storeFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: { in: ['store-1'] } },
      select: { id: true },
    });
  });

  it('denies a cross-tenant store requested by a network owner', async () => {
    userFindUnique.mockResolvedValue(
      persistedUser({ accessScope: 'NETWORK', storeAccesses: [] }),
    );
    storeFindMany.mockResolvedValue([]);

    await expect(
      service.resolveRequestedStoreIds(
        requestUser({ accessScope: 'NETWORK', allowedStoreIds: [] }),
        ['foreign-store'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['an empty persisted store scope', { storeAccesses: [] }],
    [
      'a cross-tenant persisted store relation',
      {
        storeAccesses: [
          { storeId: 'store-1', store: { tenantId: 'tenant-2' } },
        ],
      },
    ],
    ['store rows attached to NETWORK scope', { accessScope: 'NETWORK' }],
  ])('denies %s', async (_label, override) => {
    userFindUnique.mockResolvedValue(persistedUser(override));

    await expect(service.resolve(requestUser())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    [
      'changed allowed stores',
      persistedUser({
        storeAccesses: [
          { storeId: 'store-2', store: { tenantId: 'tenant-1' } },
        ],
      }),
    ],
    [
      'changed access mode',
      persistedUser({ accessScope: 'NETWORK', storeAccesses: [] }),
    ],
    ['changed tenant slug', persistedUser({ tenant: { slug: 'renamed' } })],
  ])('denies TOCTOU when the DB has %s', async (_label, freshSubject) => {
    userFindUnique.mockResolvedValue(freshSubject);

    await expect(service.resolve(requestUser())).rejects.toThrow(
      'Authorization scope is stale',
    );
  });

  it.each([[[]], [['']], [['store-1', 'store-1']]])(
    'denies an empty or malformed bulk filter: %j',
    async (storeIds) => {
      await expect(
        service.resolveRequestedStoreIds(requestUser(), storeIds),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each([
    null,
    persistedUser({ isActive: false }),
    persistedUser({ isPlatformAdmin: true }),
  ])('denies an unavailable tenant-scoped DB subject', async (subject) => {
    userFindUnique.mockResolvedValue(subject);

    await expect(service.resolve(requestUser())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
