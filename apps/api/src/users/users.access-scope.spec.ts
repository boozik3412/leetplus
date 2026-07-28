import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantCustomerStage, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { UsersService } from './users.service';

const tenantId = 'tenant-a';
const now = new Date('2026-07-27T00:00:00.000Z');

const storeActor = {
  id: 'manager-a1-a2',
  email: 'manager@example.test',
  fullName: 'A1 A2 Manager',
  role: UserRole.MANAGER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'STORES',
  allowedStoreIds: ['a1', 'a2'],
} satisfies AuthenticatedUser;

const networkAdminActor = {
  ...storeActor,
  id: 'network-admin',
  email: 'network-admin@example.test',
  role: UserRole.ADMIN,
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const networkOwnerActor = {
  ...networkAdminActor,
  id: 'network-owner-actor',
  email: 'network-owner@example.test',
  role: UserRole.OWNER,
} satisfies AuthenticatedUser;

function userRow(
  id: string,
  accessScope: 'NETWORK' | 'STORES',
  storeIds: string[],
) {
  return {
    id,
    tenantId,
    email: `${id}@example.test`,
    fullName: id,
    passwordHash: 'hash',
    role: id === storeActor.id ? UserRole.MANAGER : UserRole.CLUB_ADMINISTRATOR,
    customRoleId: null,
    customRole: null,
    isActive: true,
    isPlatformAdmin: false,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
    accessScope,
    storeAccesses: storeIds.map((storeId) => ({
      storeId,
      store: {
        id: storeId,
        tenantId,
        name: storeId.toUpperCase(),
        isActive: true,
      },
    })),
  };
}

function inviteRow(
  id: string,
  accessScope: 'NETWORK' | 'STORES',
  storeIds: string[],
) {
  return {
    id,
    tenantId,
    email: `${id}@example.test`,
    fullName: id,
    role: UserRole.CLUB_ADMINISTRATOR,
    customRoleId: null,
    customRole: null,
    accessScope,
    storeIds,
    tokenHash: `${id}-token`,
    expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    acceptedAt: null,
    acceptedByUserId: null,
    createdByUserId: storeActor.id,
    createdAt: now,
    updatedAt: now,
  };
}

function createService(overrides: {
  users?: unknown[];
  invites?: unknown[];
  stores?: Array<{ id: string; name: string; isActive: boolean }>;
  tenantCustomerStage?: TenantCustomerStage;
}) {
  const stores =
    overrides.stores ??
    ['a1', 'a2', 'a3'].map((id) => ({
      id,
      name: id.toUpperCase(),
      isActive: true,
    }));
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        customerStage:
          overrides.tenantCustomerStage ?? TenantCustomerStage.INTERNAL,
      }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(overrides.users ?? []),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    store: {
      findMany: jest.fn((args?: { where?: { id?: { in?: string[] } } }) => {
        const requestedIds = args?.where?.id?.in;
        return Promise.resolve(
          requestedIds
            ? stores.filter((store) => requestedIds.includes(store.id))
            : stores,
        );
      }),
    },
    userAccessRole: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    userInvite: {
      findMany: jest.fn().mockResolvedValue(overrides.invites ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    userRoleOverride: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userStoreAccess: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  const tenantContextService = {
    resolve: jest.fn().mockReturnValue({
      tenantId,
      tenantSlug: 'tenant-a',
    }),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'WEB_URL') {
        return 'https://example.test';
      }
      return undefined;
    }),
  };
  const service = new UsersService(
    prisma as never,
    { hash: jest.fn() } as never,
    tenantContextService,
    configService as never,
    new AccessScopeService(),
  );

  return { prisma, service };
}

describe('UsersService AccessScope boundary', () => {
  it('returns only users, invites and stores fully contained in actor scope', async () => {
    const { service } = createService({
      users: [
        userRow(storeActor.id, 'STORES', ['a1', 'a2']),
        userRow('employee-a1', 'STORES', ['a1']),
        userRow('employee-a1-a3', 'STORES', ['a1', 'a3']),
        userRow('network-owner', 'NETWORK', []),
        {
          ...userRow('platform-admin', 'NETWORK', []),
          isPlatformAdmin: true,
        },
      ],
      invites: [
        inviteRow('invite-a1', 'STORES', ['a1']),
        inviteRow('invite-a3', 'STORES', ['a3']),
        inviteRow('invite-network', 'NETWORK', []),
      ],
    });

    const result = await service.getUsers(storeActor);

    expect(result.stores.map((store) => store.id)).toEqual(['a1', 'a2']);
    expect(result.users.map((user) => user.id)).toEqual([
      storeActor.id,
      'employee-a1',
    ]);
    expect(result.invites.map((invite) => invite.id)).toEqual(['invite-a1']);
    expect(result.invites[0]).not.toHaveProperty('registrationUrl');
  });

  it('does not allow a store-scoped manager to issue network access', async () => {
    const { service } = createService({});

    await expect(
      service.createUser(storeActor, {
        email: 'new-user@example.test',
        password: 'strong-password',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'NETWORK',
        storeIds: [],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires external tenants to create users through email-bound invites', async () => {
    const { prisma, service } = createService({
      tenantCustomerStage: TenantCustomerStage.PILOT,
    });

    await expect(
      service.createUser(networkOwnerActor, {
        email: 'new-user@example.test',
        password: 'strong-password',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'NETWORK',
        storeIds: [],
      }),
    ).rejects.toThrow(
      'External tenants must create users through email-bound invites',
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('keeps external invitations fail-closed until verified email delivery is available', async () => {
    const { prisma, service } = createService({
      tenantCustomerStage: TenantCustomerStage.PILOT,
    });

    await expect(
      service.createInvite(networkOwnerActor, {
        email: 'new-user@example.test',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'NETWORK',
        storeIds: [],
      }),
    ).rejects.toThrow(
      'External tenant invitations require the verified email-delivery workflow',
    );
    expect(prisma.userInvite.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps external email changes fail-closed until mailbox verification is available', async () => {
    const target = userRow('employee-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({
      tenantCustomerStage: TenantCustomerStage.PILOT,
    });
    prisma.user.findFirst.mockResolvedValue(target);

    await expect(
      service.updateUser(networkOwnerActor, target.id, {
        email: 'unverified@example.test',
      }),
    ).rejects.toThrow(
      'External tenant email changes require the verified email-change workflow',
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not allow a store-scoped manager to issue a sibling store', async () => {
    const { service } = createService({
      stores: [{ id: 'a3', name: 'A3', isActive: true }],
    });

    await expect(
      service.createInvite(storeActor, {
        email: 'new-user@example.test',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'STORES',
        storeIds: ['a3'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['network ADMIN', networkAdminActor],
    ['network OWNER', networkOwnerActor],
  ])(
    'requires a dedicated owner-transfer workflow when %s tries to add another OWNER',
    async (_label, actor) => {
      const { service } = createService({});

      await expect(
        service.createInvite(actor, {
          email: 'second-owner@example.test',
          role: UserRole.OWNER,
          scope: 'NETWORK',
          storeIds: [],
        }),
      ).rejects.toThrow(
        'OWNER assignment requires the dedicated owner-transfer workflow',
      );
    },
  );

  it('requires an explicit, internally consistent scope', async () => {
    const { service } = createService({});

    await expect(
      service.createInvite(storeActor, {
        email: 'new-user@example.test',
        role: UserRole.CLUB_ADMINISTRATOR,
        storeIds: ['a1'],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createInvite(storeActor, {
        email: 'new-user@example.test',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'STORES',
        storeIds: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires every invite to be bound to email', async () => {
    const { service } = createService({});

    await expect(
      service.createInvite(storeActor, {
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'STORES',
        storeIds: ['a1'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rotates the opaque token and conditionally updates an active invite', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({});
    let updateCall:
      | {
          where: {
            id: string;
            tenantId: string;
            acceptedAt: null;
            updatedAt: Date;
          };
          data: { tokenHash: string };
        }
      | undefined;
    prisma.userInvite.findFirst.mockResolvedValue(existing);
    prisma.userInvite.updateMany.mockImplementation((args: unknown) => {
      updateCall = args as typeof updateCall;
      return Promise.resolve({ count: 1 });
    });
    prisma.userInvite.findUniqueOrThrow.mockResolvedValue({
      ...existing,
      email: 'updated@example.test',
    });

    const result = await service.updateInvite(storeActor, existing.id, {
      email: 'updated@example.test',
    });
    expect(result.id).toBe(existing.id);
    expect(result.registrationUrl).toMatch(
      /^https:\/\/example\.test\/register\?invite=/,
    );
    expect(updateCall?.where).toMatchObject({
      id: existing.id,
      tenantId,
      acceptedAt: null,
      updatedAt: existing.updatedAt,
    });
    expect(updateCall?.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not update an invite that changed or was accepted concurrently', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);
    prisma.userInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateInvite(storeActor, existing.id, {
        email: 'updated@example.test',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.userInvite.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  describe('last active NETWORK OWNER invariant', () => {
    function ownerRow(id = 'network-owner') {
      return {
        ...userRow(id, 'NETWORK', []),
        role: UserRole.OWNER,
        customRoleId: null,
        customRole: null,
      };
    }

    it.each([
      ['deactivate', { isActive: false }],
      ['remove the OWNER role', { role: UserRole.ADMIN }],
      ['restrict to stores', { scope: 'STORES', storeIds: ['a1'] }],
    ] as const)(
      'does not %s when this is the last active network owner',
      async (_label, dto) => {
        const target = ownerRow();
        const { prisma, service } = createService({});
        prisma.user.findFirst.mockResolvedValue(target);
        prisma.user.count.mockResolvedValue(0);

        await expect(
          service.updateUser(networkOwnerActor, target.id, dto),
        ).rejects.toThrow(
          'Tenant must retain at least one active NETWORK OWNER',
        );

        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
        expect(prisma.user.count).toHaveBeenCalledWith({
          where: {
            tenantId,
            id: { not: target.id },
            role: UserRole.OWNER,
            customRoleId: null,
            accessScope: 'NETWORK',
            isActive: true,
          },
        });
        expect(prisma.user.update).not.toHaveBeenCalled();
      },
    );

    it('treats assignment of a custom role as removal of the system OWNER role', async () => {
      const target = ownerRow();
      const customRole = {
        id: 'custom-owner-label',
        name: 'Owner',
        description: null,
        permissions: [],
        createdAt: now,
        updatedAt: now,
      };
      const { prisma, service } = createService({});
      prisma.user.findFirst.mockResolvedValue(target);
      prisma.userAccessRole.findFirst.mockResolvedValue(customRole);
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.updateUser(networkOwnerActor, target.id, {
          customRoleId: customRole.id,
        }),
      ).rejects.toThrow('Tenant must retain at least one active NETWORK OWNER');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('serializes the invariant check and allows removal when another active network owner exists', async () => {
      const target = ownerRow();
      const updated = { ...target, role: UserRole.ADMIN };
      const events: string[] = [];
      let lockQuery:
        | { strings?: readonly string[]; values?: readonly unknown[] }
        | undefined;
      const { prisma, service } = createService({});
      prisma.user.findFirst.mockResolvedValue(target);
      prisma.$queryRaw.mockImplementation((query: unknown) => {
        const sql = query as typeof lockQuery;
        const sqlText = sql?.strings?.join(' ') ?? '';

        if (sqlText.includes('FOR UPDATE')) {
          events.push('user-lock');
          return Promise.resolve([{ id: target.id }]);
        }

        events.push('owner-lock');
        lockQuery = sql;
        return Promise.resolve([{ pg_advisory_xact_lock: null }]);
      });
      prisma.user.count.mockImplementation(() => {
        events.push('count');
        return Promise.resolve(1);
      });
      prisma.user.update.mockImplementation(() => {
        events.push('update');
        return Promise.resolve(updated);
      });

      await expect(
        service.updateUser(networkOwnerActor, target.id, {
          role: UserRole.ADMIN,
        }),
      ).resolves.toMatchObject({
        id: target.id,
        role: UserRole.ADMIN,
        scope: 'NETWORK',
      });

      expect(events).toEqual(['user-lock', 'owner-lock', 'count', 'update']);
      expect(lockQuery?.strings?.join(' ')).toContain('pg_advisory_xact_lock');
      expect(lockQuery?.values).toContain(
        `users:last-active-network-owner:${tenantId}`,
      );
    });

    it('fails closed when the target changes before the locked check', async () => {
      const target = ownerRow();
      const changedTarget = {
        ...target,
        updatedAt: new Date(now.getTime() + 1_000),
      };
      const { prisma, service } = createService({});
      prisma.user.findFirst
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(changedTarget);

      await expect(
        service.updateUser(networkOwnerActor, target.id, {
          isActive: false,
        }),
      ).rejects.toThrow('User changed while the update was being prepared');

      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
