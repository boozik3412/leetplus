import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantCustomerStage, UserRole } from '@prisma/client';
import { IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS } from '../auth/identity-email-claim.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { UsersService } from './users.service';

const tenantId = 'tenant-a';
const now = new Date('2026-07-27T00:00:00.000Z');

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function firstMockArgument<T>(
  callable: { mock: { calls: unknown } },
  argumentIndex = 0,
): T {
  const calls = callable.mock.calls;
  if (!isUnknownArray(calls)) {
    throw new Error('Expected mock call list');
  }
  const firstCall: unknown = calls[0];
  if (!isUnknownArray(firstCall) || argumentIndex >= firstCall.length) {
    throw new Error('Expected mock call argument');
  }
  return firstCall[argumentIndex] as T;
}

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
    revokedAt: null,
    revokedByUserId: null,
    identityClaimRevision: 1,
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
  const createdInvites = new Map<string, Record<string, unknown>>();
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
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) => {
          const row = {
            ...args.data,
            acceptedAt: null,
            acceptedByUserId: null,
            customRole: null,
            createdAt: now,
            updatedAt: now,
          };
          createdInvites.set(String(args.data.id), row);
          return Promise.resolve(row);
        }),
      update: jest
        .fn()
        .mockImplementation(
          (args: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = {
              ...(createdInvites.get(args.where.id) ?? {}),
              ...args.data,
              updatedAt: now,
            };
            createdInvites.set(args.where.id, row);
            return Promise.resolve(row);
          },
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
  const freshStoreScopeService = {
    resolve: jest.fn().mockImplementation((actor: AuthenticatedUser) =>
      Promise.resolve({
        userId: actor.id,
        tenantId: actor.tenantId,
        tenantSlug: actor.tenantSlug,
        mode: actor.accessScope,
        allowedStoreIds: [...actor.allowedStoreIds],
      }),
    ),
    assertNetwork: jest.fn().mockImplementation((actor: AuthenticatedUser) => {
      if (actor.accessScope !== 'NETWORK') {
        return Promise.reject(
          new ForbiddenException('Network access is required'),
        );
      }
      return Promise.resolve({
        userId: actor.id,
        tenantId: actor.tenantId,
        tenantSlug: actor.tenantSlug,
        mode: actor.accessScope,
        allowedStoreIds: [...actor.allowedStoreIds],
      });
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
  const identityClaimBoundary = {
    runTenantTransaction: jest.fn(
      async (
        host: typeof prisma,
        _transactionTenantId: string,
        operation: (tx: typeof prisma, identityTx: unknown) => Promise<unknown>,
      ): Promise<unknown> =>
        (await host.$transaction(
          (tx: typeof prisma) => operation(tx, tx),
          IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS,
        )) as unknown,
    ),
    reserveInvite: jest.fn(
      (
        _tx: unknown,
        input: { email: string; tenantId: string; subjectId: string },
      ) =>
        Promise.resolve({
          schemaVersion: 2,
          operation: 'RESERVE_INVITE',
          decision: 'CREATED',
          claimType: 'INVITE',
          tenantId: input.tenantId,
          subjectId: input.subjectId,
          revision: 1,
          fingerprint: 'fingerprint',
          keyVersion: 'v1',
        }),
    ),
    assertInvite: jest.fn(
      (
        _tx: unknown,
        input: {
          tenantId: string;
          subjectId: string;
          expectedRevision: number;
        },
      ) =>
        Promise.resolve({
          schemaVersion: 1,
          operation: 'ASSERT_INVITE',
          decision: 'MATCHED',
          claimType: 'INVITE',
          tenantId: input.tenantId,
          subjectId: input.subjectId,
          revision: input.expectedRevision,
        }),
    ),
    transitionInvite: jest.fn(
      (
        _tx: unknown,
        input: {
          tenantId: string;
          nextSubjectId: string;
          expectedRevision: number;
        },
      ) =>
        Promise.resolve({
          schemaVersion: 2,
          operation: 'TRANSITION_INVITE',
          decision: 'TRANSITIONED',
          claimType: 'INVITE',
          tenantId: input.tenantId,
          subjectId: input.nextSubjectId,
          revision: input.expectedRevision + 1,
        }),
    ),
    releaseInvite: jest.fn(
      (
        _tx: unknown,
        input: {
          tenantId: string;
          expectedSubjectId: string;
          expectedRevision: number;
        },
      ) =>
        Promise.resolve({
          schemaVersion: 2,
          operation: 'RELEASE_INVITE',
          decision: 'RELEASED',
          tenantId: input.tenantId,
          subjectId: input.expectedSubjectId,
          releasedRevision: input.expectedRevision,
        }),
    ),
  };
  const service = new UsersService(
    prisma as never,
    { hash: jest.fn() } as never,
    configService as never,
    new AccessScopeService(),
    freshStoreScopeService as never,
    identityClaimBoundary as never,
  );

  return {
    freshStoreScopeService,
    identityClaimBoundary,
    prisma,
    service,
  };
}

describe('UsersService AccessScope boundary', () => {
  it('returns only users, invites and stores fully contained in actor scope', async () => {
    const { freshStoreScopeService, service } = createService({
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
    expect(freshStoreScopeService.resolve).toHaveBeenCalledWith(storeActor);
  });

  it('rejects a stale actor before reading users, roles, invites or stores', async () => {
    const { freshStoreScopeService, prisma, service } = createService({});
    freshStoreScopeService.resolve.mockRejectedValueOnce(
      new UnauthorizedException('Authorization scope is stale'),
    );

    await expect(service.getUsers(storeActor)).rejects.toThrow(
      'Authorization scope is stale',
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.store.findMany).not.toHaveBeenCalled();
    expect(prisma.userAccessRole.findMany).not.toHaveBeenCalled();
    expect(prisma.userInvite.findMany).not.toHaveBeenCalled();
    expect(prisma.userRoleOverride.findMany).not.toHaveBeenCalled();
  });

  it('requires every direct user creation to use an email-bound invite', async () => {
    const { prisma, service } = createService({});

    await expect(
      service.createUser(storeActor, {
        email: 'new-user@example.test',
        password: 'strong-password',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'NETWORK',
        storeIds: [],
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'DIRECT_USER_CREATION_REQUIRES_INVITE',
      },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('also rejects direct creation for network owners without inspecting tenant data', async () => {
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
    ).rejects.toMatchObject({
      response: {
        message: 'Direct user creation requires an email-bound invite',
        reasonCode: 'DIRECT_USER_CREATION_REQUIRES_INVITE',
      },
    });
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
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

  it('keeps external invite cancellation on the same verified delivery boundary', async () => {
    const { identityClaimBoundary, prisma, service } = createService({
      tenantCustomerStage: TenantCustomerStage.PILOT,
    });

    await expect(
      service.cancelInvite(networkOwnerActor, 'external-invite'),
    ).rejects.toThrow(
      'External tenant invitations require the verified email-delivery workflow',
    );
    expect(prisma.userInvite.findFirst).not.toHaveBeenCalled();
    expect(identityClaimBoundary.releaseInvite).not.toHaveBeenCalled();
  });

  it('keeps every real user email change fail-closed until mailbox verification is available', async () => {
    const target = userRow('employee-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({
      tenantCustomerStage: TenantCustomerStage.PILOT,
    });
    prisma.user.findFirst.mockResolvedValue(target);

    await expect(
      service.updateUser(networkOwnerActor, target.id, {
        email: 'unverified@example.test',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'User email changes require the verified email-change workflow',
        reasonCode: 'USER_EMAIL_CHANGE_WORKFLOW_REQUIRED',
      },
    });
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('creates the invite and identity provenance atomically in boundary order', async () => {
    const { identityClaimBoundary, prisma, service } = createService({});

    const result = await service.createInvite(networkOwnerActor, {
      email: 'new-user@example.test',
      fullName: 'New User',
      role: UserRole.CLUB_ADMINISTRATOR,
      scope: 'NETWORK',
      storeIds: [],
    });

    const createArgs = firstMockArgument<{
      data: Record<string, unknown>;
    }>(prisma.userInvite.create);
    const inviteId = String(createArgs.data.id);
    const reserveInput = identityClaimBoundary.reserveInvite.mock.calls[0]?.[1];
    const transitionInput =
      identityClaimBoundary.transitionInvite.mock.calls[0]?.[1];
    const persistArgs = firstMockArgument<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(prisma.userInvite.update);
    const invocationOrder = [
      identityClaimBoundary.runTenantTransaction.mock.invocationCallOrder[0],
      identityClaimBoundary.reserveInvite.mock.invocationCallOrder[0],
      identityClaimBoundary.assertInvite.mock.invocationCallOrder[0],
      prisma.userInvite.create.mock.invocationCallOrder[0],
      identityClaimBoundary.transitionInvite.mock.invocationCallOrder[0],
      prisma.userInvite.update.mock.invocationCallOrder[0],
    ];

    expect(invocationOrder).toEqual(
      [...invocationOrder].sort((left, right) => left - right),
    );
    expect(identityClaimBoundary.runTenantTransaction).toHaveBeenCalledWith(
      prisma,
      tenantId,
      expect.any(Function),
    );
    expect(
      firstMockArgument<typeof IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS>(
        prisma.$transaction,
        1,
      ),
    ).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(inviteId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(reserveInput?.subjectId).not.toBe(inviteId);
    expect(createArgs.data).toMatchObject({
      id: inviteId,
      email: 'new-user@example.test',
      identityClaimRevision: null,
      revokedAt: null,
      revokedByUserId: null,
    });
    expect(transitionInput).toMatchObject({
      expectedSubjectId: reserveInput?.subjectId,
      expectedRevision: 1,
      nextClaimType: 'INVITE',
      nextSubjectId: inviteId,
    });
    expect(persistArgs).toMatchObject({
      where: { id: inviteId },
      data: { identityClaimRevision: 2 },
    });
    expect(result).toMatchObject({
      id: inviteId,
      email: 'new-user@example.test',
    });
    expect(result.registrationUrl).toMatch(
      /^https:\/\/example\.test\/register#invite=[A-Za-z0-9_-]{43}$/,
    );
    expect(result.registrationUrl).not.toContain('?invite=');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('propagates an identity transition failure without persisting provenance', async () => {
    const { identityClaimBoundary, prisma, service } = createService({});
    identityClaimBoundary.transitionInvite.mockRejectedValueOnce(
      new Error('transition failed'),
    );

    await expect(
      service.createInvite(networkOwnerActor, {
        email: 'new-user@example.test',
        role: UserRole.CLUB_ADMINISTRATOR,
        scope: 'NETWORK',
        storeIds: [],
      }),
    ).rejects.toThrow('transition failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.userInvite.create).toHaveBeenCalledTimes(1);
    expect(prisma.userInvite.update).not.toHaveBeenCalled();
  });

  it('rejects changing the canonical email of an existing invite', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    await expect(
      service.updateInvite(storeActor, existing.id, {
        email: 'updated@example.test',
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'INVITE_EMAIL_CHANGE_WORKFLOW_REQUIRED',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reissues a same-email invite as a new immutable subject', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    const result = await service.updateInvite(storeActor, existing.id, {
      email: existing.email.toUpperCase(),
      fullName: 'Reissued User',
    });

    const createArgs = firstMockArgument<{
      data: Record<string, unknown>;
    }>(prisma.userInvite.create);
    const reissuedInviteId = String(createArgs.data.id);
    const revokeArgs = firstMockArgument<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(prisma.userInvite.updateMany);
    const transitionInput =
      identityClaimBoundary.transitionInvite.mock.calls[0]?.[1];
    const persistArgs = firstMockArgument<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(prisma.userInvite.update);
    const invocationOrder = [
      identityClaimBoundary.runTenantTransaction.mock.invocationCallOrder[0],
      identityClaimBoundary.assertInvite.mock.invocationCallOrder[0],
      prisma.userInvite.create.mock.invocationCallOrder[0],
      prisma.userInvite.updateMany.mock.invocationCallOrder[0],
      identityClaimBoundary.transitionInvite.mock.invocationCallOrder[0],
      prisma.userInvite.update.mock.invocationCallOrder[0],
    ];

    expect(invocationOrder).toEqual(
      [...invocationOrder].sort((left, right) => left - right),
    );
    expect(identityClaimBoundary.runTenantTransaction).toHaveBeenCalledWith(
      prisma,
      tenantId,
      expect.any(Function),
    );
    expect(
      firstMockArgument<typeof IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS>(
        prisma.$transaction,
        1,
      ),
    ).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(reissuedInviteId).not.toBe(existing.id);
    expect(createArgs.data).toMatchObject({
      id: reissuedInviteId,
      email: existing.email,
      identityClaimRevision: null,
      revokedAt: null,
      revokedByUserId: null,
    });
    expect(revokeArgs.where).toMatchObject({
      id: existing.id,
      tenantId,
      acceptedAt: null,
      revokedAt: null,
      updatedAt: existing.updatedAt,
    });
    expect(revokeArgs.data).toMatchObject({
      revokedByUserId: storeActor.id,
    });
    expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(revokeArgs.data.expiresAt).toBe(revokeArgs.data.revokedAt);
    expect(transitionInput).toMatchObject({
      expectedSubjectId: existing.id,
      expectedRevision: existing.identityClaimRevision,
      nextSubjectId: reissuedInviteId,
    });
    expect(persistArgs).toMatchObject({
      where: { id: reissuedInviteId },
      data: { identityClaimRevision: 2 },
    });
    expect(result).toMatchObject({
      id: reissuedInviteId,
      email: existing.email,
      fullName: 'Reissued User',
    });
    expect(result.registrationUrl).toMatch(
      /^https:\/\/example\.test\/register#invite=[A-Za-z0-9_-]{43}$/,
    );
    expect(result.registrationUrl).not.toContain('?invite=');
  });

  it('does not transition identity when an invite changed concurrently', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);
    prisma.userInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateInvite(storeActor, existing.id, {
        email: existing.email,
      }),
    ).rejects.toThrow(ConflictException);
    expect(identityClaimBoundary.assertInvite).toHaveBeenCalledTimes(1);
    expect(prisma.userInvite.create).toHaveBeenCalledTimes(1);
    expect(identityClaimBoundary.transitionInvite).not.toHaveBeenCalled();
    expect(prisma.userInvite.update).not.toHaveBeenCalled();
  });

  it('rejects legacy invites that do not carry identity provenance', async () => {
    const existing = {
      ...inviteRow('invite-a1', 'STORES', ['a1']),
      identityClaimRevision: null,
    };
    const { prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    await expect(
      service.updateInvite(storeActor, existing.id, {
        email: existing.email,
      }),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_INVITE_PROVENANCE_REQUIRED',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revokes an invite and releases its identity claim in boundary order', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    await expect(
      service.cancelInvite(storeActor, existing.id),
    ).resolves.toEqual({ id: existing.id });

    const revokeArgs = firstMockArgument<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }>(prisma.userInvite.updateMany);
    const releaseInput = identityClaimBoundary.releaseInvite.mock.calls[0]?.[1];
    const invocationOrder = [
      identityClaimBoundary.runTenantTransaction.mock.invocationCallOrder[0],
      identityClaimBoundary.assertInvite.mock.invocationCallOrder[0],
      prisma.userInvite.updateMany.mock.invocationCallOrder[0],
      identityClaimBoundary.releaseInvite.mock.invocationCallOrder[0],
    ];

    expect(invocationOrder).toEqual(
      [...invocationOrder].sort((left, right) => left - right),
    );
    expect(identityClaimBoundary.runTenantTransaction).toHaveBeenCalledWith(
      prisma,
      tenantId,
      expect.any(Function),
    );
    expect(
      firstMockArgument<typeof IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS>(
        prisma.$transaction,
        1,
      ),
    ).toEqual(IDENTITY_EMAIL_CLAIM_TRANSACTION_OPTIONS);
    expect(revokeArgs.where).toMatchObject({
      id: existing.id,
      tenantId,
      acceptedAt: null,
      revokedAt: null,
      updatedAt: existing.updatedAt,
    });
    expect(revokeArgs.data).toMatchObject({
      revokedByUserId: storeActor.id,
    });
    expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(revokeArgs.data.expiresAt).toBe(revokeArgs.data.revokedAt);
    expect(releaseInput).toMatchObject({
      email: existing.email,
      tenantId,
      expectedSubjectId: existing.id,
      expectedRevision: existing.identityClaimRevision,
    });
  });

  it('explicitly revokes and releases a naturally expired invite', async () => {
    const expiredAt = new Date('2026-07-01T00:00:00.000Z');
    const existing = {
      ...inviteRow('invite-expired-a1', 'STORES', ['a1']),
      expiresAt: expiredAt,
    };
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    await expect(
      service.cancelInvite(storeActor, existing.id),
    ).resolves.toEqual({ id: existing.id });

    const revokeArgs = firstMockArgument<{
      data: Record<string, unknown>;
    }>(prisma.userInvite.updateMany);
    expect(revokeArgs.data.expiresAt).toBe(expiredAt);
    expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(identityClaimBoundary.assertInvite).toHaveBeenCalledTimes(1);
    expect(identityClaimBoundary.releaseInvite).toHaveBeenCalledTimes(1);
  });

  it('does not release identity when invite revocation loses its CAS', async () => {
    const existing = inviteRow('invite-a1', 'STORES', ['a1']);
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);
    prisma.userInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelInvite(storeActor, existing.id)).rejects.toThrow(
      ConflictException,
    );
    expect(identityClaimBoundary.assertInvite).toHaveBeenCalledTimes(1);
    expect(identityClaimBoundary.releaseInvite).not.toHaveBeenCalled();
  });

  it('rejects canceling a live legacy invite without identity provenance', async () => {
    const existing = {
      ...inviteRow('invite-a1', 'STORES', ['a1']),
      identityClaimRevision: null,
    };
    const { identityClaimBoundary, prisma, service } = createService({});
    prisma.userInvite.findFirst.mockResolvedValue(existing);

    await expect(
      service.cancelInvite(storeActor, existing.id),
    ).rejects.toMatchObject({
      response: {
        reasonCode: 'IDENTITY_INVITE_PROVENANCE_REQUIRED',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(identityClaimBoundary.releaseInvite).not.toHaveBeenCalled();
  });

  it('permits non-email updates when the supplied email has the same canonical form', async () => {
    const target = userRow('employee-a1', 'STORES', ['a1']);
    const { prisma, service } = createService({});
    prisma.user.findFirst.mockResolvedValue(target);
    prisma.user.update.mockResolvedValue({
      ...target,
      fullName: 'Updated Employee',
    });

    await expect(
      service.updateUser(networkOwnerActor, target.id, {
        email: target.email.toUpperCase(),
        fullName: 'Updated Employee',
      }),
    ).resolves.toMatchObject({
      id: target.id,
      email: target.email,
      fullName: 'Updated Employee',
    });

    const updateArgs = firstMockArgument<{
      data: Record<string, unknown>;
    }>(prisma.user.update);
    expect(updateArgs.data).toMatchObject({
      fullName: 'Updated Employee',
    });
    expect(updateArgs.data).not.toHaveProperty('email');
    expect(updateArgs.data).not.toHaveProperty('emailVerifiedAt');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
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
