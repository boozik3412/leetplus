import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GuestPortalCurrent190ApplicationBoundary,
  type GuestPortalCurrent190ApplicationSessionPort,
  type GuestPortalCurrent190TenantMediaPort,
} from './guest-portal-current190-application-boundary';

describe('GuestPortalCurrent190ApplicationBoundary', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const tenantId = '22222222-2222-4222-8222-222222222222';
  const assetId = '33333333-3333-4333-8333-333333333333';
  const revokedAt = new Date('2026-08-05T12:00:00.000Z');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  let session: jest.Mocked<GuestPortalCurrent190ApplicationSessionPort>;
  let media: jest.Mocked<GuestPortalCurrent190TenantMediaPort>;
  let boundary: GuestPortalCurrent190ApplicationBoundary;

  beforeEach(() => {
    session = {
      revoke: jest.fn().mockResolvedValue({
        sessionId,
        status: 'REVOKED',
        revokedAt,
        replayed: false,
      }),
      authorizeMedia: jest.fn().mockResolvedValue({
        assetId,
        tenantId,
        contentType: 'image/png',
        byteSize: bytes.length,
      }),
    };
    media = {
      readForTenant: jest.fn().mockResolvedValue({
        assetId,
        tenantId,
        contentType: 'image/png',
        buffer: bytes,
      }),
    };
    boundary = new GuestPortalCurrent190ApplicationBoundary(session, media);
  });

  it('is explicitly dormant and does not claim HTTP activation', () => {
    expect(boundary.readiness()).toEqual({
      status: 'DORMANT_APPLICATION_BOUNDARY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      logoutRouteActive: false,
      protectedMediaRouteActive: false,
      legacyPublicMediaRemoved: false,
      cachePolicy: 'private, no-store, max-age=0',
    });
  });

  it('completes persisted revoke and returns a PII/token-free response', async () => {
    const response = await boundary.logout(
      'Bearer guest-token',
      'logout-request-0001',
    );

    expect(session.revoke.mock.calls).toEqual([
      ['Bearer guest-token', 'logout-request-0001'],
    ]);
    expect(response).toEqual({
      ok: true,
      status: 'REVOKED',
      replayed: false,
      revokedAt: revokedAt.toISOString(),
    });
    expect(JSON.stringify(response)).not.toContain(sessionId);
    expect(JSON.stringify(response)).not.toContain('guest-token');
  });

  it('fails closed on an expanded or malformed revoke receipt', async () => {
    session.revoke.mockResolvedValueOnce({
      sessionId,
      status: 'REVOKED',
      revokedAt,
      replayed: false,
      token: 'must-not-cross',
    } as never);

    await expect(
      boundary.logout('Bearer guest-token', 'logout-request-0001'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([undefined, '', 'short', 'contains spaces 0001'])(
    'rejects a missing or unstable replay request id before revoke: %s',
    async (requestId) => {
      await expect(
        boundary.logout('Bearer guest-token', requestId as string),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(session.revoke.mock.calls).toHaveLength(0);
    },
  );

  it('authorizes media before the exact tenant-bound byte read', async () => {
    const response = await boundary.readMedia('Bearer guest-token', assetId);

    expect(session.authorizeMedia.mock.calls).toEqual([
      ['Bearer guest-token', assetId],
    ]);
    expect(media.readForTenant.mock.calls).toEqual([[tenantId, assetId]]);
    expect(response).toEqual({
      contentType: 'image/png',
      byteLength: bytes.length,
      buffer: bytes,
      cacheControl: 'private, no-store, max-age=0',
    });
  });

  it('copies admitted bytes before returning them to the HTTP adapter', async () => {
    const portBuffer = Buffer.from(bytes);
    media.readForTenant.mockResolvedValueOnce({
      assetId,
      tenantId,
      contentType: 'image/png',
      buffer: portBuffer,
    });

    const response = await boundary.readMedia('Bearer guest-token', assetId);
    expect(response.buffer).not.toBe(portBuffer);

    portBuffer.fill(0);
    expect(response.buffer).toEqual(bytes);
  });

  it.each([
    ['asset substitution', { assetId: `${assetId}-other` }],
    ['tenant substitution', { tenantId: `${tenantId}-other` }],
    ['content-type substitution', { contentType: 'image/webp' }],
    ['byte-size substitution', { buffer: Buffer.from([1, 2, 3]) }],
    ['expanded receipt', { unexpected: true }],
  ])('fails closed on %s after admission', async (_label, override) => {
    media.readForTenant.mockResolvedValueOnce({
      assetId,
      tenantId,
      contentType: 'image/png',
      buffer: bytes,
      ...override,
    });

    await expect(
      boundary.readMedia('Bearer guest-token', assetId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not read media when persisted session admission fails', async () => {
    session.authorizeMedia.mockRejectedValueOnce(
      new UnauthorizedException('denied'),
    );

    await expect(
      boundary.readMedia('Bearer guest-token', assetId),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(media.readForTenant.mock.calls).toHaveLength(0);
  });

  it.each([
    [{ assetId: `${assetId}-other` }, 'asset mismatch'],
    [{ contentType: 'application/octet-stream' }, 'non-image content type'],
    [{ contentType: 'image/svg+xml' }, 'active image content type'],
    [{ byteSize: 0 }, 'zero byte size'],
    [{ byteSize: 2 * 1024 * 1024 + 1 }, 'oversized media'],
    [{ extra: true }, 'expanded permit'],
  ])('denies invalid permit: %s', async (override) => {
    session.authorizeMedia.mockResolvedValueOnce({
      assetId,
      tenantId,
      contentType: 'image/png',
      byteSize: bytes.length,
      ...override,
    });

    await expect(
      boundary.readMedia('Bearer guest-token', assetId),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(media.readForTenant.mock.calls).toHaveLength(0);
  });
});
