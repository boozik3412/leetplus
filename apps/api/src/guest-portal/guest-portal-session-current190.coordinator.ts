import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { isProductionConfig } from '../config/environment-validation';
import {
  GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
  GuestPortalSessionCurrent190Action,
  GuestPortalSessionCurrent190Binding,
  GuestPortalSessionCurrent190IssueResult,
  GuestPortalSessionCurrent190Repository,
} from './guest-portal-session-current190.repository';

const ENABLED_ENV = 'GUEST_PORTAL_SESSION_CURRENT190_FOUNDATION_ENABLED';
const JWT_SECRET_ENV = 'GUEST_PORTAL_SESSION_CURRENT190_JWT_SECRET';
const HMAC_SECRET_ENV = 'GUEST_PORTAL_SESSION_CURRENT190_HMAC_SECRET';
const TOKEN_ISSUER = 'leetplus-guest-portal-current190';
const TOKEN_AUDIENCE = 'leetplus-public-game-current190';
const TOKEN_TTL_SECONDS = 15 * 60;
const MAX_TOKEN_TTL_SECONDS = 60 * 60;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GuestPortalSessionCurrent190Identity = {
  tenantId: string;
  storeId: string;
  profileId: string;
  guestId: string | null;
};

type GuestPortalSessionCurrent190Claims =
  GuestPortalSessionCurrent190Identity & {
    purpose: typeof GUEST_PORTAL_SESSION_CURRENT190_CONTRACT;
    sub: string;
    sid: string;
    ver: number;
    jti: string;
    iat: number;
    exp: number;
  };

type GuestPortalSessionCurrent190ExpectedScope = Partial<
  Pick<
    GuestPortalSessionCurrent190Identity,
    'tenantId' | 'storeId' | 'profileId' | 'guestId'
  >
>;

type FoundationConfiguration = {
  jwtSecret: string;
  hmacSecret: string;
};

@Injectable()
export class GuestPortalSessionCurrent190Coordinator {
  constructor(
    private readonly repository: GuestPortalSessionCurrent190Repository,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  readiness() {
    const production = this.isProduction();
    const enabled = this.config.get<string>(ENABLED_ENV)?.trim() === 'true';
    const jwtSecret = this.config.get<string>(JWT_SECRET_ENV)?.trim() ?? '';
    const hmacSecret = this.config.get<string>(HMAC_SECRET_ENV)?.trim() ?? '';
    const secretsReady =
      jwtSecret.length >= 64 &&
      hmacSecret.length >= 32 &&
      jwtSecret !== hmacSecret;

    return {
      contractVersion: GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      status: 'DORMANT_FOUNDATION',
      canonical: false,
      deployable: false,
      foundationReady: enabled && secretsReady && !production,
      routeActivationAllowed: false,
      applicationRoleAllowlistBound: false,
      publicMediaAllowed: false,
      outboundAllowed: false,
      otpAllowed: false,
      telegramAllowed: false,
      messengerAllowed: false,
      langameAllowed: false,
      schedulersAllowed: false,
    } as const;
  }

  async assertPublicStore(tenantSlug: string, storeLocator: string) {
    this.requireConfiguration();
    return this.repository.assertPublicStore(
      this.requiredText(tenantSlug, 'tenantSlug', 128),
      this.requiredText(storeLocator, 'storeLocator', 128),
    );
  }

  async issue(
    requestId: string,
    identityInput: GuestPortalSessionCurrent190Identity,
  ) {
    const configuration = this.requireConfiguration();
    const identity = this.identity(identityInput);
    const normalizedRequestId = this.requestId(requestId);
    const sessionId = this.deterministicUuid(
      configuration.hmacSecret,
      'ISSUE_SID',
      identity.profileId,
      normalizedRequestId,
    );
    const jti = this.deterministicUuid(
      configuration.hmacSecret,
      'ISSUE_JTI',
      identity.profileId,
      normalizedRequestId,
    );
    const jtiDigest = this.hmac(configuration.hmacSecret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'JTI',
      jti,
    ]);
    const bindingDigest = this.bindingDigest(
      configuration.hmacSecret,
      sessionId,
      1,
      identity,
      jtiDigest,
    );
    const result = await this.repository.issue({
      sessionId,
      ...identity,
      jtiDigest,
      bindingDigest,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });

    if (result.sessionId !== sessionId || result.tokenVersion !== 1) {
      throw this.unavailable();
    }

    const claims = this.claims(
      sessionId,
      result.tokenVersion,
      jti,
      identity,
      result.issuedAt,
      result.expiresAt,
    );
    const token = await this.sign(claims, configuration.jwtSecret);

    return {
      contractVersion: GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      token,
      sessionId,
      tokenVersion: result.tokenVersion,
      tenantId: identity.tenantId,
      storeId: identity.storeId,
      profileId: identity.profileId,
      guestId: identity.guestId,
      expiresAt: result.expiresAt.toISOString(),
      executionRevision: result.executionRevision,
      entitlementProfileRevision: result.entitlementProfileRevision,
      replayed: result.replayed,
      routeActivationAllowed: false,
    } as const;
  }

  async authorize(
    authorization: string | undefined,
    action: GuestPortalSessionCurrent190Action,
    expectedScope: GuestPortalSessionCurrent190ExpectedScope = {},
  ) {
    const configuration = this.requireConfiguration();
    if (action !== 'READ' && action !== 'WRITE') {
      throw this.unauthorized();
    }
    const claims = await this.verify(authorization, configuration.jwtSecret);
    this.assertExpectedScope(claims, expectedScope);
    const binding = this.binding(claims, configuration.hmacSecret);

    try {
      const permit = await this.repository.assertSession(binding, action);
      this.assertPermitMatchesClaims(permit, claims);
      return { claims, permit };
    } catch {
      throw this.unauthorized();
    }
  }

  async rotate(
    authorization: string | undefined,
    requestId: string,
    targetIdentityInput: GuestPortalSessionCurrent190Identity,
  ) {
    const configuration = this.requireConfiguration();
    const sourceClaims = await this.verify(
      authorization,
      configuration.jwtSecret,
    );
    const source = this.binding(sourceClaims, configuration.hmacSecret);
    const targetIdentity = this.identity(targetIdentityInput);
    const normalizedRequestId = this.requestId(requestId);
    const targetSessionId = this.deterministicUuid(
      configuration.hmacSecret,
      'ROTATE_SID',
      sourceClaims.sid,
      normalizedRequestId,
    );
    const targetJti = this.deterministicUuid(
      configuration.hmacSecret,
      'ROTATE_JTI',
      sourceClaims.sid,
      normalizedRequestId,
    );
    const targetVersion = sourceClaims.ver + 1;
    if (!Number.isSafeInteger(targetVersion) || targetVersion > 2_147_483_647) {
      throw this.unauthorized();
    }
    const targetJtiDigest = this.hmac(configuration.hmacSecret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'JTI',
      targetJti,
    ]);
    const targetBindingDigest = this.bindingDigest(
      configuration.hmacSecret,
      targetSessionId,
      targetVersion,
      targetIdentity,
      targetJtiDigest,
    );
    const rotationRequestDigest = this.hmac(configuration.hmacSecret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'ROTATE',
      normalizedRequestId,
      source.bindingDigest,
      targetBindingDigest,
    ]);

    let result: GuestPortalSessionCurrent190IssueResult;
    try {
      result = await this.repository.rotate({
        source,
        rotationRequestDigest,
        target: {
          sessionId: targetSessionId,
          ...targetIdentity,
          jtiDigest: targetJtiDigest,
          bindingDigest: targetBindingDigest,
          ttlSeconds: TOKEN_TTL_SECONDS,
        },
      });
    } catch {
      throw this.unauthorized();
    }

    if (
      result.sessionId !== targetSessionId ||
      result.tokenVersion !== targetVersion
    ) {
      throw this.unavailable();
    }

    const targetClaims = this.claims(
      targetSessionId,
      targetVersion,
      targetJti,
      targetIdentity,
      result.issuedAt,
      result.expiresAt,
    );

    return {
      contractVersion: GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      token: await this.sign(targetClaims, configuration.jwtSecret),
      sessionId: targetSessionId,
      tokenVersion: targetVersion,
      tenantId: targetIdentity.tenantId,
      storeId: targetIdentity.storeId,
      profileId: targetIdentity.profileId,
      guestId: targetIdentity.guestId,
      expiresAt: result.expiresAt.toISOString(),
      executionRevision: result.executionRevision,
      entitlementProfileRevision: result.entitlementProfileRevision,
      replayed: result.replayed,
      previousSessionInvalidated: true,
      routeActivationAllowed: false,
    } as const;
  }

  async revoke(authorization: string | undefined, requestId: string) {
    const configuration = this.requireConfiguration();
    const claims = await this.verify(authorization, configuration.jwtSecret);
    const binding = this.binding(claims, configuration.hmacSecret);
    const revocationRequestDigest = this.hmac(configuration.hmacSecret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'REVOKE',
      this.requestId(requestId),
      binding.bindingDigest,
    ]);

    try {
      return await this.repository.revoke(binding, revocationRequestDigest);
    } catch {
      throw this.unauthorized();
    }
  }

  async authorizeMedia(
    authorization: string | undefined,
    assetIdInput: string,
  ) {
    const configuration = this.requireConfiguration();
    const claims = await this.verify(authorization, configuration.jwtSecret);
    const binding = this.binding(claims, configuration.hmacSecret);
    const assetId = this.requiredText(assetIdInput, 'assetId', 128);

    try {
      const permit = await this.repository.assertMedia(binding, assetId);
      if (permit.assetId !== assetId || permit.tenantId !== claims.tenantId) {
        throw this.unauthorized();
      }
      return permit;
    } catch {
      throw this.unauthorized();
    }
  }

  private requireConfiguration(): FoundationConfiguration {
    if (this.config.get<string>(ENABLED_ENV)?.trim() !== 'true') {
      throw new ServiceUnavailableException(
        'Persisted guest portal session foundation is disabled',
      );
    }
    if (this.isProduction()) {
      throw new ServiceUnavailableException(
        'Persisted guest portal session candidate is not production-authorized',
      );
    }

    const jwtSecret = this.config.get<string>(JWT_SECRET_ENV)?.trim() ?? '';
    const hmacSecret = this.config.get<string>(HMAC_SECRET_ENV)?.trim() ?? '';
    if (
      jwtSecret.length < 64 ||
      hmacSecret.length < 32 ||
      jwtSecret === hmacSecret
    ) {
      throw this.unavailable();
    }
    return { jwtSecret, hmacSecret };
  }

  private isProduction() {
    return isProductionConfig(this.config);
  }

  private identity(
    input: GuestPortalSessionCurrent190Identity,
  ): GuestPortalSessionCurrent190Identity {
    return {
      tenantId: this.requiredText(input.tenantId, 'tenantId', 128),
      storeId: this.requiredText(input.storeId, 'storeId', 128),
      profileId: this.requiredText(input.profileId, 'profileId', 128),
      guestId:
        input.guestId === null
          ? null
          : this.requiredText(input.guestId, 'guestId', 128),
    };
  }

  private claims(
    sessionId: string,
    tokenVersion: number,
    jti: string,
    identity: GuestPortalSessionCurrent190Identity,
    issuedAt: Date,
    expiresAt: Date,
  ): GuestPortalSessionCurrent190Claims {
    const iat = Math.floor(issuedAt.getTime() / 1_000);
    const exp = Math.floor(expiresAt.getTime() / 1_000);
    if (
      !Number.isSafeInteger(iat) ||
      !Number.isSafeInteger(exp) ||
      exp <= iat ||
      exp - iat > MAX_TOKEN_TTL_SECONDS
    ) {
      throw this.unavailable();
    }
    return {
      purpose: GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      sub: identity.profileId,
      sid: sessionId,
      ver: tokenVersion,
      jti,
      ...identity,
      iat,
      exp,
    };
  }

  private async sign(
    claims: GuestPortalSessionCurrent190Claims,
    secret: string,
  ) {
    return this.jwt.signAsync(claims, {
      secret,
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  }

  private async verify(
    authorization: string | undefined,
    secret: string,
  ): Promise<GuestPortalSessionCurrent190Claims> {
    const token = this.bearerToken(authorization);
    try {
      const value = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
      return this.parseClaims(value);
    } catch {
      throw this.unauthorized();
    }
  }

  private parseClaims(value: unknown): GuestPortalSessionCurrent190Claims {
    if (!this.record(value)) {
      throw this.unauthorized();
    }
    const guestId = value.guestId;
    if (
      value.purpose !== GUEST_PORTAL_SESSION_CURRENT190_CONTRACT ||
      typeof value.sub !== 'string' ||
      typeof value.sid !== 'string' ||
      !UUID_PATTERN.test(value.sid) ||
      typeof value.jti !== 'string' ||
      !UUID_PATTERN.test(value.jti) ||
      typeof value.ver !== 'number' ||
      !Number.isSafeInteger(value.ver) ||
      value.ver < 1 ||
      typeof value.tenantId !== 'string' ||
      typeof value.storeId !== 'string' ||
      typeof value.profileId !== 'string' ||
      value.sub !== value.profileId ||
      (guestId !== null && typeof guestId !== 'string') ||
      typeof value.iat !== 'number' ||
      !Number.isSafeInteger(value.iat) ||
      typeof value.exp !== 'number' ||
      !Number.isSafeInteger(value.exp) ||
      value.exp <= value.iat ||
      value.exp - value.iat > MAX_TOKEN_TTL_SECONDS
    ) {
      throw this.unauthorized();
    }
    return {
      purpose: GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      sub: value.sub,
      sid: value.sid,
      ver: value.ver,
      jti: value.jti,
      tenantId: value.tenantId,
      storeId: value.storeId,
      profileId: value.profileId,
      guestId,
      iat: value.iat,
      exp: value.exp,
    };
  }

  private binding(
    claims: GuestPortalSessionCurrent190Claims,
    hmacSecret: string,
  ): GuestPortalSessionCurrent190Binding {
    const identity: GuestPortalSessionCurrent190Identity = {
      tenantId: claims.tenantId,
      storeId: claims.storeId,
      profileId: claims.profileId,
      guestId: claims.guestId,
    };
    const jtiDigest = this.hmac(hmacSecret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'JTI',
      claims.jti,
    ]);
    return {
      sessionId: claims.sid,
      tokenVersion: claims.ver,
      ...identity,
      jtiDigest,
      bindingDigest: this.bindingDigest(
        hmacSecret,
        claims.sid,
        claims.ver,
        identity,
        jtiDigest,
      ),
    };
  }

  private bindingDigest(
    secret: string,
    sessionId: string,
    tokenVersion: number,
    identity: GuestPortalSessionCurrent190Identity,
    jtiDigest: string,
  ) {
    return this.hmac(secret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      'BINDING',
      sessionId,
      String(tokenVersion),
      identity.tenantId,
      identity.storeId,
      identity.profileId,
      identity.guestId ?? '',
      jtiDigest,
    ]);
  }

  private hmac(secret: string, parts: readonly string[]) {
    const hmac = createHmac('sha256', secret);
    for (const part of parts) {
      hmac.update(String(Buffer.byteLength(part)));
      hmac.update(':');
      hmac.update(part);
      hmac.update('|');
    }
    return hmac.digest('hex');
  }

  private deterministicUuid(
    secret: string,
    purpose: string,
    sessionId: string,
    requestId: string,
  ) {
    const digest = this.hmac(secret, [
      GUEST_PORTAL_SESSION_CURRENT190_CONTRACT,
      purpose,
      sessionId,
      requestId,
    ]);
    const hex = `${digest.slice(0, 12)}4${digest.slice(13, 16)}8${digest.slice(
      17,
      32,
    )}`;
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }

  private assertExpectedScope(
    claims: GuestPortalSessionCurrent190Claims,
    expected: GuestPortalSessionCurrent190ExpectedScope,
  ) {
    for (const key of [
      'tenantId',
      'storeId',
      'profileId',
      'guestId',
    ] as const) {
      if (key in expected && expected[key] !== claims[key]) {
        throw this.unauthorized();
      }
    }
  }

  private assertPermitMatchesClaims(
    permit: {
      sessionId: string;
      tenantId: string;
      storeId: string;
      profileId: string;
      guestId: string | null;
      tokenVersion: number;
    },
    claims: GuestPortalSessionCurrent190Claims,
  ) {
    if (
      permit.sessionId !== claims.sid ||
      permit.tokenVersion !== claims.ver ||
      permit.tenantId !== claims.tenantId ||
      permit.storeId !== claims.storeId ||
      permit.profileId !== claims.profileId ||
      permit.guestId !== claims.guestId
    ) {
      throw this.unauthorized();
    }
  }

  private bearerToken(authorization: string | undefined) {
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') ||
      authorization.slice(7).length < 16 ||
      authorization.slice(7).includes(' ')
    ) {
      throw this.unauthorized();
    }
    return authorization.slice(7);
  }

  private requestId(value: string) {
    if (!REQUEST_ID_PATTERN.test(value)) {
      throw this.unauthorized();
    }
    return value;
  }

  private requiredText(
    value: unknown,
    field: string,
    maxLength: number,
    minLength = 1,
  ) {
    if (typeof value !== 'string') {
      throw this.unauthorized();
    }
    const normalized = value.trim();
    if (
      normalized.length < minLength ||
      normalized.length > maxLength ||
      Array.from(normalized).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    ) {
      throw this.unauthorized();
    }
    void field;
    return normalized;
  }

  private record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private unauthorized() {
    return new UnauthorizedException('Invalid persisted guest portal session');
  }

  private unavailable() {
    return new ServiceUnavailableException(
      'Persisted guest portal session candidate is unavailable',
    );
  }
}
