import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { StaffDirectoryService } from './staff-directory.service';

const tenantId = 'tenant-a';
const now = new Date('2026-07-27T10:00:00.000Z');

const networkActor = {
  id: 'network-owner',
  email: 'network-owner@example.test',
  fullName: 'Network Owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
} satisfies AuthenticatedUser;

const storeActorA1 = {
  ...networkActor,
  id: 'manager-a1',
  email: 'manager-a1@example.test',
  fullName: 'A1 Manager',
  role: UserRole.MANAGER,
  accessScope: 'STORES',
  allowedStoreIds: ['a1'],
} satisfies AuthenticatedUser;

const storeActorA1A2 = {
  ...storeActorA1,
  id: 'manager-a1-a2',
  email: 'manager-a1-a2@example.test',
  allowedStoreIds: ['a1', 'a2'],
} satisfies AuthenticatedUser;

function staffMemberRow(
  id: string,
  storeId: string | null,
  externalIdentity?: { domain: string; userId: string },
) {
  return {
    id,
    tenantId,
    userId: null,
    storeId,
    createdByUserId: null,
    displayName: `Staff ${id}`,
    role: UserRole.CLUB_ADMINISTRATOR,
    status: 'ACTIVE',
    position: null,
    employmentType: null,
    compensationType: null,
    compensationAmount: null,
    email: `${id}@example.test`,
    phone: null,
    hiredAt: null,
    dismissedAt: null,
    externalProvider: externalIdentity ? IntegrationProvider.LANGAME : null,
    externalDomain: externalIdentity?.domain ?? null,
    externalUserId: externalIdentity?.userId ?? null,
    note: null,
    createdAt: now,
    updatedAt: now,
    store: storeId
      ? { id: storeId, name: storeId.toUpperCase(), isActive: true }
      : null,
    user: null,
    createdByUser: null,
  };
}

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
    role: UserRole.CLUB_ADMINISTRATOR,
    accessScope,
    isActive: true,
    isPlatformAdmin: false,
    storeAccesses: storeIds.map((storeId) => ({
      storeId,
      store: { tenantId },
    })),
  };
}

type HarnessOptions = {
  directoryRows?: Array<ReturnType<typeof staffMemberRow>>;
  directMember?: ReturnType<typeof staffMemberRow> | null;
  users?: Array<ReturnType<typeof userRow>>;
  stores?: Array<{ id: string; name: string; isActive: boolean }>;
};

type StaffMemberFindManyArgs = {
  where?: {
    tenantId?: string;
    storeId?: string | { in?: string[] };
  };
};

type UserFindManyArgs = {
  where?: {
    staffMember?: unknown;
    accessScope?: string;
    storeAccesses?: {
      some?: { storeId?: { in?: string[] } };
      every?: { storeId?: { in?: string[] } };
    };
  };
};

function createHarness(options: HarnessOptions = {}) {
  const stores =
    options.stores ??
    ['a1', 'a2'].map((id) => ({
      id,
      name: id.toUpperCase(),
      isActive: true,
    }));
  const staffMemberFindMany = jest.fn((args?: StaffMemberFindManyArgs) => {
    void args;
    return Promise.resolve(options.directoryRows ?? []);
  });
  const staffMemberFindFirst = jest
    .fn()
    .mockResolvedValue(
      options.directMember === undefined ? null : options.directMember,
    );
  const staffMemberCreate = jest.fn(
    ({ data }: { data: Record<string, unknown> }) => {
      const storeId = typeof data.storeId === 'string' ? data.storeId : null;
      return Promise.resolve({
        ...staffMemberRow('created-member', storeId),
        ...data,
      });
    },
  );
  const staffMemberUpdate = jest.fn(
    ({
      data,
    }: {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    }) => {
      const storeId = typeof data.storeId === 'string' ? data.storeId : null;
      return Promise.resolve({
        ...(options.directMember ?? staffMemberRow('member-a1', storeId)),
        ...data,
        store: storeId
          ? { id: storeId, name: storeId.toUpperCase(), isActive: true }
          : null,
      });
    },
  );
  const userFindMany = jest.fn((args?: UserFindManyArgs) =>
    Promise.resolve(args?.where?.staffMember ? [] : (options.users ?? [])),
  );
  const storeFindFirst = jest.fn(
    ({ where }: { where: { id: string; tenantId: string } }) => {
      const store = stores.find((candidate) => candidate.id === where.id);
      return Promise.resolve(
        store
          ? {
              ...store,
              externalDomain: null,
              externalClubId: null,
              city: null,
              timeZone: null,
              integrationSourceId: null,
            }
          : null,
      );
    },
  );
  const storeFindMany = jest.fn(
    (args?: { where?: { id?: { in?: string[] } } }) => {
      const ids = args?.where?.id?.in;
      return Promise.resolve(
        ids ? stores.filter((store) => ids.includes(store.id)) : stores,
      );
    },
  );
  const langameStaffUserFindFirst = jest.fn().mockResolvedValue(null);
  const prisma = {
    staffMember: {
      findMany: staffMemberFindMany,
      findFirst: staffMemberFindFirst,
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: staffMemberCreate,
      update: staffMemberUpdate,
    },
    user: {
      findMany: userFindMany,
      findFirst: jest.fn().mockResolvedValue(null),
    },
    store: {
      findMany: storeFindMany,
      findFirst: storeFindFirst,
    },
    guestStaffIdentityMapping: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    langameStaffUser: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: langameStaffUserFindFirst,
    },
    guestWorkingShift: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const tenantContextService = {
    resolve: jest.fn().mockReturnValue({
      tenantId,
      tenantSlug: 'tenant-a',
    }),
  };
  const langameSettingsService = {
    resolveTenantAccess: jest.fn(),
  };
  const langameClient = {
    listWorkingShifts: jest.fn(),
  };
  const service = new StaffDirectoryService(
    prisma as never,
    tenantContextService,
    langameSettingsService as never,
    langameClient as never,
    new AccessScopeService(),
  );

  return {
    prisma,
    service,
    staffMemberFindMany,
    staffMemberFindFirst,
    staffMemberCreate,
    staffMemberUpdate,
    storeFindMany,
    storeFindFirst,
    userFindMany,
    langameStaffUserFindFirst,
  };
}

describe('StaffDirectoryService AccessScope', () => {
  it('scopes STORES list, summary, stores and user selectors to A1', async () => {
    const a1Member = staffMemberRow('member-a1', 'a1');
    const harness = createHarness({
      directoryRows: [a1Member],
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
      users: [
        userRow('user-a1', 'STORES', ['a1']),
        userRow('user-a2', 'STORES', ['a2']),
        userRow('network-user', 'NETWORK', []),
      ],
    });

    const report = await harness.service.getDirectory(storeActorA1, {
      status: 'all',
    });

    expect(report.rows.map((row) => row.id)).toEqual(['member-a1']);
    expect(report.summary).toMatchObject({ total: 1, active: 1 });
    expect(report.stores.map((store) => store.id)).toEqual(['a1']);
    expect(report.users.map((user) => user.id)).toEqual(['user-a1']);
    expect(report.legacyMappings).toEqual([]);
    expect(report.langameUsers).toEqual([]);
    expect(harness.staffMemberFindMany.mock.calls[0]?.[0]?.where).toMatchObject(
      {
        tenantId,
        storeId: { in: ['a1'] },
      },
    );
    expect(harness.storeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, id: { in: ['a1'] } },
      }),
    );
    expect(harness.userFindMany.mock.calls[1]?.[0]?.where).toMatchObject({
      accessScope: 'STORES',
      storeAccesses: {
        some: { storeId: { in: ['a1'] } },
        every: { storeId: { in: ['a1'] } },
      },
    });
    expect(
      harness.prisma.guestStaffIdentityMapping.findMany,
    ).not.toHaveBeenCalled();
    expect(harness.prisma.langameStaffUser.findMany).not.toHaveBeenCalled();
  });

  it('keeps NETWORK directory rows and selectors tenant-wide', async () => {
    const networkMember = staffMemberRow('network-member', null);
    const harness = createHarness({
      directoryRows: [networkMember],
      users: [
        userRow('user-a1', 'STORES', ['a1']),
        userRow('network-user', 'NETWORK', []),
      ],
    });

    const report = await harness.service.getDirectory(networkActor, {
      status: 'all',
    });

    expect(report.rows[0]?.store).toBeNull();
    expect(report.users.map((user) => user.id)).toEqual([
      'user-a1',
      'network-user',
    ]);
    expect(harness.staffMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
      }),
    );
    expect(harness.storeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
    expect(
      harness.prisma.guestStaffIdentityMapping.findMany,
    ).toHaveBeenCalled();
    expect(harness.prisma.langameStaffUser.findMany).toHaveBeenCalled();
  });

  it('returns 403 for an explicit foreign store in list and active shifts', async () => {
    const listHarness = createHarness();

    await expect(
      listHarness.service.getDirectory(storeActorA1, { storeId: 'a2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listHarness.staffMemberFindMany).not.toHaveBeenCalled();

    const shiftsHarness = createHarness();
    await expect(
      shiftsHarness.service.getActiveShiftCandidates(storeActorA1, {
        storeId: 'a2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(shiftsHarness.storeFindFirst).not.toHaveBeenCalled();

    const networkHarness = createHarness();
    await expect(
      networkHarness.service.getDirectory(networkActor, { storeId: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(networkHarness.staffMemberFindMany).not.toHaveBeenCalled();
  });

  it('allows current-shift lookup for an explicitly allowed store', async () => {
    const harness = createHarness({
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
    });

    const report = await harness.service.getActiveShiftCandidates(
      storeActorA1,
      { storeId: 'a1' },
    );

    expect(report.store.id).toBe('a1');
    expect(report.candidates).toEqual([]);
    expect(harness.storeFindFirst).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for a direct A2 or network member outside STORES[A1]', async () => {
    const a2Harness = createHarness({
      directMember: staffMemberRow('member-a2', 'a2'),
    });

    await expect(
      a2Harness.service.getMember(storeActorA1, 'member-a2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const networkHarness = createHarness({
      directMember: staffMemberRow('network-member', null),
    });
    await expect(
      networkHarness.service.getMember(storeActorA1, 'network-member'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const allowedHarness = createHarness({
      directMember: staffMemberRow('member-a1', 'a1'),
    });
    await expect(
      allowedHarness.service.getMember(storeActorA1, 'member-a1'),
    ).resolves.toMatchObject({ id: 'member-a1', store: { id: 'a1' } });
  });

  it('limits the current staff profile lookup to the actor store scope', async () => {
    const harness = createHarness({
      directoryRows: [staffMemberRow('member-a1', 'a1')],
    });

    await harness.service.getCurrentMember(storeActorA1);

    expect(harness.staffMemberFindMany.mock.calls[0]?.[0]?.where).toMatchObject(
      {
        tenantId,
        storeId: { in: ['a1'] },
      },
    );
  });

  it('allows STORES[A1] create only with an A1 assignment', async () => {
    const allowedHarness = createHarness({
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
    });

    await expect(
      allowedHarness.service.createMember(storeActorA1, {
        displayName: 'A1 Employee',
        storeId: 'a1',
      }),
    ).resolves.toMatchObject({ store: { id: 'a1' } });
    expect(allowedHarness.staffMemberCreate).toHaveBeenCalled();

    const foreignHarness = createHarness();
    await expect(
      foreignHarness.service.createMember(storeActorA1, {
        displayName: 'A2 Employee',
        storeId: 'a2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(foreignHarness.staffMemberCreate).not.toHaveBeenCalled();

    const networkMemberHarness = createHarness();
    await expect(
      networkMemberHarness.service.createMember(storeActorA1, {
        displayName: 'Network Employee',
        storeId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(networkMemberHarness.staffMemberCreate).not.toHaveBeenCalled();

    const networkHarness = createHarness();
    await expect(
      networkHarness.service.createMember(networkActor, {
        displayName: 'Network Employee',
        storeId: null,
      }),
    ).resolves.toMatchObject({ store: null });
    expect(networkHarness.staffMemberCreate).toHaveBeenCalled();
  });

  it('denies STORES[A1] creation with a Langame identity before any write or PII lookup', async () => {
    const harness = createHarness({
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
    });

    await expect(
      harness.service.createMember(storeActorA1, {
        displayName: 'Linked employee',
        storeId: 'a1',
        externalDomain: 'tenant-a.langame.test',
        externalUserId: 'langame-user-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.staffMemberCreate).not.toHaveBeenCalled();
    expect(harness.langameStaffUserFindFirst).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: 'rebind',
      identity: {
        externalDomain: 'other.langame.test',
        externalUserId: 'langame-user-2',
      },
    },
    {
      scenario: 'clear',
      identity: {
        externalDomain: null,
        externalUserId: null,
      },
    },
  ])(
    'denies STORES[A1] Langame identity $scenario before any write or PII lookup',
    async ({ identity }) => {
      const current = staffMemberRow('member-a1', 'a1', {
        domain: 'tenant-a.langame.test',
        userId: 'langame-user-1',
      });
      const harness = createHarness({ directMember: current });

      await expect(
        harness.service.updateMember(storeActorA1, current.id, {
          displayName: 'Unchanged employee',
          ...identity,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(harness.staffMemberUpdate).not.toHaveBeenCalled();
      expect(harness.langameStaffUserFindFirst).not.toHaveBeenCalled();
    },
  );

  it('keeps existing Langame identity on an ordinary STORES update without exposing Langame detail', async () => {
    const current = staffMemberRow('member-a1', 'a1', {
      domain: 'tenant-a.langame.test',
      userId: 'langame-user-1',
    });
    const harness = createHarness({ directMember: current });

    const updated = await harness.service.updateMember(
      storeActorA1,
      current.id,
      {
        displayName: 'Updated employee',
        position: 'Senior administrator',
      },
    );

    expect(updated).toMatchObject({
      id: current.id,
      displayName: 'Updated employee',
      position: 'Senior administrator',
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain: 'tenant-a.langame.test',
      externalUserId: 'langame-user-1',
      langameUser: null,
    });
    const updateData = harness.staffMemberUpdate.mock.calls[0]?.[0]?.data;
    expect(updateData).not.toHaveProperty('externalProvider');
    expect(updateData).not.toHaveProperty('externalDomain');
    expect(updateData).not.toHaveProperty('externalUserId');
    expect(harness.langameStaffUserFindFirst).not.toHaveBeenCalled();
  });

  it('never exposes full Langame detail in STORES direct or current member responses', async () => {
    const current = {
      ...staffMemberRow('member-a1', 'a1', {
        domain: 'tenant-a.langame.test',
        userId: 'langame-user-1',
      }),
      email: storeActorA1.email,
    };
    const directHarness = createHarness({ directMember: current });
    const direct = await directHarness.service.getMember(
      storeActorA1,
      current.id,
    );

    expect(direct.langameUser).toBeNull();
    expect(directHarness.langameStaffUserFindFirst).not.toHaveBeenCalled();

    const currentHarness = createHarness({ directoryRows: [current] });
    const profile = await currentHarness.service.getCurrentMember(storeActorA1);

    expect(profile.staffMember?.langameUser).toBeNull();
    expect(currentHarness.langameStaffUserFindFirst).not.toHaveBeenCalled();
  });

  it('uses tenant, store and updatedAt CAS and masks a failed update as 404', async () => {
    const current = staffMemberRow('member-a1', 'a1');
    const harness = createHarness({ directMember: current });
    harness.staffMemberUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Record changed before conditional update',
        {
          code: 'P2025',
          clientVersion: 'test',
        },
      ),
    );

    await expect(
      harness.service.updateMember(storeActorA1, current.id, {
        displayName: 'Concurrent update',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.staffMemberUpdate).toHaveBeenCalledTimes(1);
    expect(harness.staffMemberUpdate.mock.calls[0]?.[0]?.where).toEqual({
      id: current.id,
      tenantId,
      storeId: current.storeId,
      updatedAt: current.updatedAt,
    });
    expect(harness.langameStaffUserFindFirst).not.toHaveBeenCalled();
  });

  it('checks both current and next store and requires NETWORK to reassign', async () => {
    const scopedHarness = createHarness({
      directMember: staffMemberRow('member-a1', 'a1'),
    });

    await expect(
      scopedHarness.service.updateMember(storeActorA1A2, 'member-a1', {
        displayName: 'Moved employee',
        storeId: 'a2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scopedHarness.staffMemberUpdate).not.toHaveBeenCalled();

    const sameStoreHarness = createHarness({
      directMember: staffMemberRow('member-a1', 'a1'),
      stores: [{ id: 'a1', name: 'A1', isActive: true }],
    });
    await expect(
      sameStoreHarness.service.updateMember(storeActorA1, 'member-a1', {
        displayName: 'Updated employee',
      }),
    ).resolves.toMatchObject({ id: 'member-a1' });
    expect(
      sameStoreHarness.staffMemberUpdate.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ storeId: 'a1' });

    const networkHarness = createHarness({
      directMember: staffMemberRow('member-a1', 'a1'),
    });
    await expect(
      networkHarness.service.updateMember(networkActor, 'member-a1', {
        displayName: 'Moved by owner',
        storeId: 'a2',
      }),
    ).resolves.toMatchObject({ store: { id: 'a2' } });
    expect(networkHarness.staffMemberUpdate).toHaveBeenCalled();
  });
});
