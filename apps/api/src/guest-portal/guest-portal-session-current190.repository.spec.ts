import { ServiceUnavailableException } from '@nestjs/common';
import { GuestPortalSessionCurrent190Repository } from './guest-portal-session-current190.repository';

describe('GuestPortalSessionCurrent190Repository', () => {
  const prisma = { $queryRaw: jest.fn() };
  const repository = new GuestPortalSessionCurrent190Repository(
    prisma as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('accepts only the exact issue projection', async () => {
    prisma.$queryRaw.mockResolvedValue([issueRow()]);

    await expect(repository.issue(issueInput())).resolves.toEqual({
      ...issueRow(),
      issuedAt: new Date('2026-08-05T10:00:00.000Z'),
      expiresAt: new Date('2026-08-05T10:15:00.000Z'),
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects extra database fields that could leak session material', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { ...issueRow(), rawJti: 'must-not-leak' },
    ]);

    await expect(repository.issue(issueInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects missing, duplicate, malformed, and expired projections', async () => {
    for (const response of [
      [],
      [issueRow(), issueRow()],
      [{ ...issueRow(), tokenVersion: 0 }],
      [
        {
          ...issueRow(),
          issuedAt: '2026-08-05T10:15:00.000Z',
          expiresAt: '2026-08-05T10:00:00.000Z',
        },
      ],
    ]) {
      prisma.$queryRaw.mockResolvedValueOnce(response);
      await expect(repository.issue(issueInput())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('maps SQL denial and a missing candidate to one closed error', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('cross-tenant detail must not escape'),
    );

    await expect(
      repository.assertSession(
        {
          sessionId: 'session-a',
          tokenVersion: 1,
          tenantId: 'tenant-a',
          storeId: 'store-a1',
          profileId: 'profile-a',
          guestId: 'guest-a',
          jtiDigest: 'b'.repeat(64),
          bindingDigest: 'c'.repeat(64),
        },
        'READ',
      ),
    ).rejects.toThrow(
      'Persisted guest portal session candidate is unavailable',
    );
  });

  it('requires an exact tenant-scoped media projection', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        assetId: 'asset-a',
        tenantId: 'tenant-a',
        contentType: 'image/png',
        byteSize: 42,
      },
    ]);

    await expect(
      repository.assertMedia(
        {
          sessionId: 'session-a',
          tokenVersion: 1,
          tenantId: 'tenant-a',
          storeId: 'store-a1',
          profileId: 'profile-a',
          guestId: 'guest-a',
          jtiDigest: 'b'.repeat(64),
          bindingDigest: 'c'.repeat(64),
        },
        'asset-a',
      ),
    ).resolves.toEqual({
      assetId: 'asset-a',
      tenantId: 'tenant-a',
      contentType: 'image/png',
      byteSize: 42,
    });
  });
});

function issueInput() {
  return {
    sessionId: '00000000-0000-4000-8000-000000000001',
    tenantId: 'tenant-a',
    storeId: 'store-a1',
    profileId: 'profile-a',
    guestId: 'guest-a',
    jtiDigest: 'b'.repeat(64),
    bindingDigest: 'c'.repeat(64),
    ttlSeconds: 900,
  };
}

function issueRow() {
  return {
    sessionId: '00000000-0000-4000-8000-000000000001',
    tokenVersion: 1,
    issuedAt: '2026-08-05T10:00:00.000Z',
    expiresAt: '2026-08-05T10:15:00.000Z',
    executionRevision: 1,
    entitlementProfileRevision: 1,
    replayed: false,
  };
}
