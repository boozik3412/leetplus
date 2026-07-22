import { IntegrationProvider } from '@prisma/client';
import { GuestIdentityResolverService } from './guest-identity-resolver.service';

const tenantId = 'tenant-1';
const profileId = 'profile-1';
const guestId = 'guest-1';
const previousGuestId = 'guest-old';
const externalDomain = '46.langamepro.ru';
const phoneHash = 'phone-hash';
const verifiedAt = new Date('2026-07-22T08:00:00.000Z');

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: profileId,
  guestId: null,
  phoneHash,
  contactMasked: '***0646',
  displayName: 'Guest ***0646',
  guest: null,
  ...overrides,
});

const guest = (overrides: Record<string, unknown> = {}) => ({
  id: guestId,
  phoneHash,
  phoneMasked: '***0646',
  emailMasked: null,
  fullNameMasked: 'Guest ***0646',
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain,
  externalGuestId: 'external-guest-1',
  ...overrides,
});

const activeLink = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-active',
  tenantId,
  profileId,
  guestId: previousGuestId,
  externalProvider: IntegrationProvider.LANGAME,
  externalDomain,
  externalGuestId: 'external-guest-old',
  status: 'ACTIVE',
  matchSource: 'TEST',
  confidence: 'EXACT',
  consecutiveMatches: 5,
  verifiedAt,
  lastSeenAt: verifiedAt,
  supersededAt: null,
  createdAt: verifiedAt,
  updatedAt: verifiedAt,
  ...overrides,
});

function firstCallArgument(mock: unknown): unknown {
  const typedMock = mock as { mock: { calls: unknown[][] } };
  return typedMock.mock.calls[0]?.[0];
}

function callArgument(
  mock: unknown,
  callIndex: number,
  argumentIndex: number,
): unknown {
  const typedMock = mock as { mock: { calls: unknown[][] } };
  return typedMock.mock.calls[callIndex]?.[argumentIndex];
}

describe('GuestIdentityResolverService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    guestGameProfile: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    guest: {
      findFirst: jest.fn(),
    },
    guestGameProfileIdentityLink: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    guestGameReward: { updateMany: jest.fn() },
    guestGameEvent: {
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    guestGameDelivery: { updateMany: jest.fn() },
    guestBonusLedgerEntry: { updateMany: jest.fn() },
    guestActivityRawRecord: { updateMany: jest.fn() },
    guestActivityFact: { updateMany: jest.fn() },
    guestActivitySyncState: { updateMany: jest.fn() },
    guestActivitySourceSyncState: { updateMany: jest.fn() },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    guestGameProfile: {
      ...tx.guestGameProfile,
      findMany: jest.fn(),
    },
  };

  let service: GuestIdentityResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuestIdentityResolverService(prisma as never);

    tx.$queryRaw.mockResolvedValue([]);
    tx.guestGameProfile.findFirst.mockResolvedValue(profile());
    tx.guest.findFirst.mockResolvedValue(guest());
    tx.guestGameProfileIdentityLink.findFirst.mockResolvedValue(null);
    tx.guestGameProfileIdentityLink.findMany.mockResolvedValue([]);
    tx.guestGameProfileIdentityLink.findUnique.mockResolvedValue(null);
    tx.guestGameProfileIdentityLink.update.mockResolvedValue({});
    tx.guestGameProfileIdentityLink.updateMany.mockResolvedValue({ count: 0 });
    tx.guestGameProfileIdentityLink.create.mockResolvedValue({
      id: 'link-new',
    });
    tx.guestGameProfileIdentityLink.upsert.mockResolvedValue({
      id: 'link-new',
    });
    tx.guestGameProfile.update.mockResolvedValue({});

    for (const delegate of [
      tx.guestGameReward,
      tx.guestGameEvent,
      tx.guestGameDelivery,
      tx.guestBonusLedgerEntry,
      tx.guestActivityRawRecord,
      tx.guestActivityFact,
      tx.guestActivitySyncState,
      tx.guestActivitySourceSyncState,
    ]) {
      delegate.updateMany.mockResolvedValue({ count: 0 });
    }
    tx.guestGameEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.guestGameProfile.findMany.mockResolvedValue([]);
  });

  it('creates the first domain-scoped link and backfills only exact external activity identity', async () => {
    tx.guestActivityFact.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'PORTAL_EXACT_MATCH',
      verifiedAt,
    });

    expect(result).toMatchObject({
      status: 'LINKED',
      profileId,
      guestId,
      previousGuestId: null,
      linkedNow: true,
      backfilled: {
        rewards: 0,
        events: 0,
        deliveries: 0,
        bonusLedgerEntries: 0,
        activityFacts: 3,
      },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(callArgument(tx.$queryRaw, 1, 1)).toBe(
      `${tenantId}:guest:${guestId}`,
    );
    expect(
      firstCallArgument(tx.guestGameProfileIdentityLink.upsert),
    ).toMatchObject({
      create: {
        status: 'ACTIVE',
        consecutiveMatches: 1,
        verifiedAt,
      },
    });
    expect(firstCallArgument(tx.guestGameProfile.update)).toMatchObject({
      where: { id: profileId },
      data: { guestId },
    });
    expect(
      firstCallArgument(tx.guestGameProfile.update).data,
    ).not.toHaveProperty('lastActivityAt');
    expect(tx.guestGameReward.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameDelivery.updateMany).not.toHaveBeenCalled();
    expect(tx.guestBonusLedgerEntry.updateMany).not.toHaveBeenCalled();
    expect(tx.guestGameEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it('supersedes an inactive profile owner before checking active guest ownership', async () => {
    tx.guestGameProfileIdentityLink.updateMany.mockResolvedValueOnce({
      count: 1,
    });

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'PORTAL_EXACT_MATCH',
      verifiedAt,
    });

    expect(result.status).toBe('LINKED');
    expect(tx.guestGameProfileIdentityLink.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          tenantId,
          guestId,
          status: 'ACTIVE',
          profile: { status: { not: 'ACTIVE' } },
        },
        data: {
          status: 'SUPERSEDED',
          supersededAt: verifiedAt,
        },
      },
    );
    expect(tx.guestGameProfileIdentityLink.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          guestId,
          status: 'ACTIVE',
          profile: { status: 'ACTIVE' },
        }) as Record<string, unknown>,
      }),
    );
  });

  it('adds a second domain link without replacing the legacy primary guest', async () => {
    tx.guestGameProfile.findFirst.mockResolvedValue(
      profile({
        guestId: 'guest-primary-domain',
        guest: {
          id: 'guest-primary-domain',
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: 'other.langamepro.ru',
        },
      }),
    );

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'PORTAL_EXACT_MATCH',
      verifiedAt,
    });

    expect(result.status).toBe('LINKED');
    expect(firstCallArgument(tx.guestGameProfile.update)).toMatchObject({
      where: { id: profileId },
      data: expect.not.objectContaining({ guestId }) as Record<string, unknown>,
    });
  });

  it('keeps the first different domain candidate as PENDING_REBIND', async () => {
    const currentLink = activeLink();
    tx.guestGameProfile.findFirst.mockResolvedValue(
      profile({
        guestId: previousGuestId,
        guest: {
          id: previousGuestId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
        },
      }),
    );
    tx.guestGameProfileIdentityLink.findFirst
      .mockResolvedValueOnce(currentLink)
      .mockResolvedValueOnce(null);

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'GUEST_FOUNDATION_COMPLETE_SYNC',
      verifiedAt,
      requiredRebindConfirmations: 2,
    });

    expect(result).toMatchObject({
      status: 'PENDING_REBIND',
      guestId,
      previousGuestId,
      linkedNow: false,
    });
    expect(
      firstCallArgument(tx.guestGameProfileIdentityLink.upsert),
    ).toMatchObject({
      create: {
        status: 'PENDING_REBIND',
        consecutiveMatches: 1,
      },
    });
    expect(tx.guestGameProfileIdentityLink.update).not.toHaveBeenCalled();
    expect(tx.guestGameProfile.update).not.toHaveBeenCalled();
    expect(tx.guestGameEvent.createMany).not.toHaveBeenCalled();
  });

  it('promotes the second confirmation to ACTIVE and supersedes the previous link', async () => {
    const currentLink = activeLink();
    const pendingLink = activeLink({
      id: 'link-pending',
      guestId,
      externalGuestId: 'external-guest-1',
      status: 'PENDING_REBIND',
      consecutiveMatches: 1,
    });
    tx.guestGameProfile.findFirst.mockResolvedValue(
      profile({
        guestId: previousGuestId,
        guest: {
          id: previousGuestId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain,
        },
      }),
    );
    tx.guestGameProfileIdentityLink.findFirst
      .mockResolvedValueOnce(currentLink)
      .mockResolvedValueOnce(null);
    tx.guestGameProfileIdentityLink.findUnique.mockResolvedValue(pendingLink);
    tx.guestGameProfileIdentityLink.upsert.mockResolvedValue({
      ...pendingLink,
      status: 'ACTIVE',
      consecutiveMatches: 2,
    });

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'GUEST_FOUNDATION_COMPLETE_SYNC',
      verifiedAt,
      requiredRebindConfirmations: 2,
    });

    expect(result).toMatchObject({
      status: 'REBOUND',
      guestId,
      previousGuestId,
      linkedNow: true,
    });
    expect(tx.guestGameProfileIdentityLink.update).toHaveBeenCalledWith({
      where: { id: currentLink.id },
      data: {
        status: 'SUPERSEDED',
        supersededAt: verifiedAt,
        lastSeenAt: verifiedAt,
      },
    });
    expect(
      firstCallArgument(tx.guestGameProfileIdentityLink.upsert),
    ).toMatchObject({
      update: {
        status: 'ACTIVE',
        consecutiveMatches: 2,
        supersededAt: null,
      },
    });
    expect(firstCallArgument(tx.guestGameProfile.update)).toMatchObject({
      data: { guestId },
    });
  });

  it('records CONFLICT when the guest is already active on another profile', async () => {
    tx.guestGameProfileIdentityLink.findFirst
      .mockResolvedValueOnce(activeLink())
      .mockResolvedValueOnce({ id: 'owner-link', profileId: 'profile-other' });

    const result = await service.resolveExactMatch({
      tenantId,
      profileId,
      guestId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      externalGuestId: 'external-guest-1',
      acceptedPhoneHashes: [phoneHash],
      phoneMasked: '***0646',
      matchSource: 'PORTAL_EXACT_MATCH',
      verifiedAt,
    });

    expect(result).toMatchObject({
      status: 'CONFLICT',
      profileId,
      guestId,
      previousGuestId,
      linkedNow: false,
    });
    expect(
      firstCallArgument(tx.guestGameProfileIdentityLink.create),
    ).toMatchObject({
      data: {
        guestId,
        status: 'CONFLICT',
        consecutiveMatches: 1,
      },
    });
    expect(tx.guestGameProfileIdentityLink.upsert).not.toHaveBeenCalled();
    expect(tx.guestGameProfile.update).not.toHaveBeenCalled();
  });

  it('does not auto-link an ambiguous complete snapshot', async () => {
    prisma.guestGameProfile.findMany.mockResolvedValue([
      { id: profileId, phoneHash },
    ]);
    const resolveSpy = jest.spyOn(service, 'resolveExactMatch');

    const result = await service.reconcileDomainSnapshot({
      tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      syncedAt: verifiedAt,
      complete: true,
      candidates: [
        {
          guestId: 'guest-a',
          externalGuestId: 'external-a',
          phoneHashes: [phoneHash],
          phoneMasked: '***0646',
        },
        {
          guestId: 'guest-b',
          externalGuestId: 'external-b',
          phoneHashes: [phoneHash],
          phoneMasked: '***0646',
        },
      ],
    });

    expect(result).toMatchObject({
      candidates: 2,
      profiles: 1,
      ambiguous: 1,
      linked: 0,
      rebound: 0,
    });
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('supersedes a pending rebind when the next complete snapshot no longer confirms it', async () => {
    tx.guestGameProfileIdentityLink.findMany.mockResolvedValue([
      {
        id: 'pending-stale',
        profileId,
        guestId: 'guest-missing',
      },
    ]);

    await service.reconcileDomainSnapshot({
      tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      syncedAt: verifiedAt,
      complete: true,
      candidates: [
        {
          guestId,
          externalGuestId: 'external-guest-1',
          phoneHashes: [phoneHash],
          phoneMasked: '***0646',
        },
      ],
    });

    expect(tx.guestGameProfileIdentityLink.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['pending-stale'] },
        status: 'PENDING_REBIND',
        lastSeenAt: { lte: verifiedAt },
      },
      data: {
        status: 'SUPERSEDED',
        supersededAt: verifiedAt,
      },
    });
  });

  it('resets pending rebind confirmations after a complete empty snapshot', async () => {
    await service.reconcileDomainSnapshot({
      tenantId,
      externalProvider: IntegrationProvider.LANGAME,
      externalDomain,
      syncedAt: verifiedAt,
      complete: true,
      candidates: [],
    });

    expect(tx.guestGameProfileIdentityLink.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain,
        status: 'PENDING_REBIND',
        lastSeenAt: { lte: verifiedAt },
      },
      data: {
        status: 'SUPERSEDED',
        supersededAt: verifiedAt,
      },
    });
    expect(prisma.guestGameProfile.findMany).not.toHaveBeenCalled();
  });
});
