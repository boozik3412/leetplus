import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { GuestPortalSessionCurrent190MediaPermit } from './guest-portal-session-current190.repository';

const MAX_GUEST_MEDIA_BYTES = 2 * 1024 * 1024;
const REPLAY_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ALLOWED_GUEST_MEDIA_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type GuestPortalCurrent190RevokeReceipt = Readonly<{
  sessionId: string;
  status: 'REVOKED';
  revokedAt: Date;
  replayed: boolean;
}>;

export interface GuestPortalCurrent190ApplicationSessionPort {
  revoke(
    authorization: string | undefined,
    requestId: string,
  ): Promise<GuestPortalCurrent190RevokeReceipt>;
  authorizeMedia(
    authorization: string | undefined,
    assetId: string,
  ): Promise<GuestPortalSessionCurrent190MediaPermit>;
}

export type GuestPortalCurrent190TenantMedia = Readonly<{
  assetId: string;
  tenantId: string;
  contentType: string;
  buffer: Buffer;
}>;

export interface GuestPortalCurrent190TenantMediaPort {
  readForTenant(
    tenantId: string,
    assetId: string,
  ): Promise<GuestPortalCurrent190TenantMedia>;
}

export type GuestPortalCurrent190LogoutResponse = Readonly<{
  ok: true;
  status: 'REVOKED';
  replayed: boolean;
  revokedAt: string;
}>;

export type GuestPortalCurrent190MediaResponse = Readonly<{
  contentType: string;
  byteLength: number;
  buffer: Buffer;
  cacheControl: 'private, no-store, max-age=0';
}>;

/**
 * Candidate-only application seam for persisted logout and tenant-bound media.
 *
 * It deliberately has no Nest decorator. A candidate controller may consume
 * it only in isolated tests; both remain absent from every production module.
 * HTTP activation is a later, separately reviewed change after CURRENT190
 * becomes canonical and its runtime role is attested.
 */
export class GuestPortalCurrent190ApplicationBoundary {
  constructor(
    private readonly session: GuestPortalCurrent190ApplicationSessionPort,
    private readonly media: GuestPortalCurrent190TenantMediaPort,
  ) {}

  readiness() {
    return {
      status: 'DORMANT_APPLICATION_BOUNDARY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      logoutRouteActive: false,
      protectedMediaRouteActive: false,
      legacyPublicMediaRemoved: false,
      cachePolicy: 'private, no-store, max-age=0',
    } as const;
  }

  async logout(
    authorization: string | undefined,
    requestId: string,
  ): Promise<GuestPortalCurrent190LogoutResponse> {
    if (!REPLAY_REQUEST_ID_PATTERN.test(requestId)) {
      throw new UnauthorizedException('Guest logout request id is invalid');
    }
    const receipt = await this.session.revoke(authorization, requestId);
    if (
      !record(receipt) ||
      !exactKeys(receipt, ['replayed', 'revokedAt', 'sessionId', 'status']) ||
      typeof receipt.sessionId !== 'string' ||
      receipt.sessionId.length === 0 ||
      receipt.status !== 'REVOKED' ||
      !(receipt.revokedAt instanceof Date) ||
      !Number.isFinite(receipt.revokedAt.getTime()) ||
      typeof receipt.replayed !== 'boolean'
    ) {
      throw invalidApplicationReceipt();
    }

    return Object.freeze({
      ok: true as const,
      status: 'REVOKED' as const,
      replayed: receipt.replayed,
      revokedAt: receipt.revokedAt.toISOString(),
    });
  }

  async readMedia(
    authorization: string | undefined,
    assetId: string,
  ): Promise<GuestPortalCurrent190MediaResponse> {
    const permit = await this.session.authorizeMedia(authorization, assetId);
    if (!validMediaPermit(permit, assetId)) {
      throw new UnauthorizedException('Guest media admission denied');
    }

    const asset = await this.media.readForTenant(
      permit.tenantId,
      permit.assetId,
    );
    if (
      !record(asset) ||
      !exactKeys(asset, ['assetId', 'buffer', 'contentType', 'tenantId']) ||
      asset.assetId !== permit.assetId ||
      asset.tenantId !== permit.tenantId ||
      asset.contentType !== permit.contentType ||
      !Buffer.isBuffer(asset.buffer) ||
      asset.buffer.length !== permit.byteSize
    ) {
      throw invalidApplicationReceipt();
    }

    const safeBuffer = Buffer.from(asset.buffer);
    return Object.freeze({
      contentType: asset.contentType,
      byteLength: safeBuffer.length,
      buffer: safeBuffer,
      cacheControl: 'private, no-store, max-age=0' as const,
    });
  }
}

function validMediaPermit(
  value: unknown,
  expectedAssetId: string,
): value is GuestPortalSessionCurrent190MediaPermit {
  return (
    record(value) &&
    exactKeys(value, ['assetId', 'byteSize', 'contentType', 'tenantId']) &&
    typeof value.assetId === 'string' &&
    value.assetId === expectedAssetId &&
    typeof value.tenantId === 'string' &&
    value.tenantId.length > 0 &&
    typeof value.contentType === 'string' &&
    ALLOWED_GUEST_MEDIA_CONTENT_TYPES.has(value.contentType) &&
    typeof value.byteSize === 'number' &&
    Number.isSafeInteger(value.byteSize) &&
    value.byteSize > 0 &&
    value.byteSize <= MAX_GUEST_MEDIA_BYTES
  );
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidApplicationReceipt() {
  return new ServiceUnavailableException(
    'Persisted guest portal application receipt is invalid',
  );
}
