import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GuestPortalSessionCurrent190Coordinator } from './guest-portal-session-current190.coordinator';
import {
  GuestPortalSessionCurrent190Binding,
  GuestPortalSessionCurrent190IssueInput,
  GuestPortalSessionCurrent190Repository,
} from './guest-portal-session-current190.repository';

const jwtSecret = 'j'.repeat(64);
const hmacSecret = 'h'.repeat(64);
const identityA = {
  tenantId: 'tenant-a',
  storeId: 'store-a1',
  profileId: 'profile-a',
  guestId: 'guest-a',
};
const identityB = {
  tenantId: 'tenant-b',
  storeId: 'store-b1',
  profileId: 'profile-b',
  guestId: 'guest-b',
};

describe('GuestPortalSessionCurrent190Coordinator', () => {
  const configValues = new Map<string, string>();
  const config = {
    get: jest.fn((key: string) => configValues.get(key)),
  };
  let memory: ReturnType<typeof memoryRepository>;
  let coordinator: GuestPortalSessionCurrent190Coordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    configValues.clear();
    configValues.set(
      'GUEST_PORTAL_SESSION_CURRENT190_FOUNDATION_ENABLED',
      'true',
    );
    configValues.set('GUEST_PORTAL_SESSION_CURRENT190_JWT_SECRET', jwtSecret);
    configValues.set('GUEST_PORTAL_SESSION_CURRENT190_HMAC_SECRET', hmacSecret);
    configValues.set('NODE_ENV', 'test');
    memory = memoryRepository();
    coordinator = new GuestPortalSessionCurrent190Coordinator(
      memory.repository as unknown as GuestPortalSessionCurrent190Repository,
      config as never,
      new JwtService(),
    );
  });

  it('reports an explicitly dormant and non-deployable readiness surface', () => {
    expect(coordinator.readiness()).toEqual({
      contractVersion: 'GUEST_PORTAL_SESSION_CURRENT190_V1',
      status: 'DORMANT_FOUNDATION',
      canonical: false,
      deployable: false,
      foundationReady: true,
      routeActivationAllowed: false,
      applicationRoleAllowlistBound: false,
      publicMediaAllowed: false,
      outboundAllowed: false,
      otpAllowed: false,
      telegramAllowed: false,
      messengerAllowed: false,
      langameAllowed: false,
      schedulersAllowed: false,
    });
  });

  it('is default-off and performs no database call', async () => {
    configValues.delete('GUEST_PORTAL_SESSION_CURRENT190_FOUNDATION_ENABLED');

    await expect(
      coordinator.issue('issue-request-0001', identityA),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(memory.repository.issue).not.toHaveBeenCalled();
  });

  it('cannot be enabled in production even with valid secrets', async () => {
    configValues.set('NODE_ENV', 'production');

    await expect(
      coordinator.issue('issue-request-0001', identityA),
    ).rejects.toThrow('not production-authorized');
    expect(coordinator.readiness().foundationReady).toBe(false);
    expect(memory.repository.issue).not.toHaveBeenCalled();
  });

  it('requires two distinct strong candidate secrets', async () => {
    configValues.set('GUEST_PORTAL_SESSION_CURRENT190_HMAC_SECRET', jwtSecret);

    await expect(
      coordinator.issue('issue-request-0001', identityA),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(memory.repository.issue).not.toHaveBeenCalled();
  });

  it('issues and replays one persisted sid/ver/jti-bound token exactly', async () => {
    const first = await coordinator.issue('issue-request-0001', identityA);
    const replay = await coordinator.issue('issue-request-0001', identityA);

    expect(first).toMatchObject({
      contractVersion: 'GUEST_PORTAL_SESSION_CURRENT190_V1',
      tokenVersion: 1,
      tenantId: 'tenant-a',
      storeId: 'store-a1',
      profileId: 'profile-a',
      guestId: 'guest-a',
      replayed: false,
      routeActivationAllowed: false,
    });
    expect(replay).toMatchObject({
      sessionId: first.sessionId,
      tokenVersion: 1,
      replayed: true,
    });
    expect(replay.token).toBe(first.token);
    expect(memory.repository.issue).toHaveBeenCalledTimes(2);

    await expect(
      coordinator.authorize(`Bearer ${first.token}`, 'READ', {
        tenantId: 'tenant-a',
        storeId: 'store-a1',
        profileId: 'profile-a',
        guestId: 'guest-a',
      }),
    ).resolves.toMatchObject({
      permit: {
        tenantId: 'tenant-a',
        storeId: 'store-a1',
      },
    });
  });

  it('keeps contact correlators out of decoded JWTs and all coordinator responses', async () => {
    const first = await coordinator.issue('privacy-request-0001', identityA);
    const second = await coordinator.issue('privacy-request-0002', identityA);
    const decoder = new JwtService();
    const firstClaims = decoder.decode<Record<string, unknown>>(first.token);
    const secondClaims = decoder.decode<Record<string, unknown>>(second.token);
    const forbiddenKeys = [
      'phoneHash',
      'phone',
      'phoneBindingDigest',
      'email',
      'bindingDigest',
    ];

    for (const value of [first, second, firstClaims, secondClaims]) {
      for (const key of forbiddenKeys) {
        expect(value).not.toHaveProperty(key);
      }
      const serialized = JSON.stringify(value);
      expect(serialized).not.toContain('+79990000000');
      expect(serialized).not.toContain('phone-hash-a');
      expect(serialized).not.toContain('@example.test');
    }

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(firstClaims.jti).not.toBe(secondClaims.jti);
    expect(first.token).not.toBe(second.token);
    expect(memory.repository.issue.mock.calls[0]?.[0].bindingDigest).not.toBe(
      memory.repository.issue.mock.calls[1]?.[0].bindingDigest,
    );
  });

  it('denies A/A1 token reuse against B/B1 and the inverse before SQL', async () => {
    const sessionA = await coordinator.issue('issue-request-a001', identityA);
    const sessionB = await coordinator.issue('issue-request-b001', identityB);
    const assertCallsBefore = memory.repository.assertSession.mock.calls.length;

    await expect(
      coordinator.authorize(`Bearer ${sessionA.token}`, 'READ', {
        tenantId: 'tenant-b',
        storeId: 'store-b1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      coordinator.authorize(`Bearer ${sessionB.token}`, 'WRITE', {
        tenantId: 'tenant-a',
        storeId: 'store-a1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(memory.repository.assertSession).toHaveBeenCalledTimes(
      assertCallsBefore,
    );
  });

  it('rejects OUTBOUND before SQL even through an untyped caller', async () => {
    const session = await coordinator.issue('issue-request-0002', identityA);
    const assertCallsBefore = memory.repository.assertSession.mock.calls.length;

    await expect(
      coordinator.authorize(`Bearer ${session.token}`, 'OUTBOUND' as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memory.repository.assertSession).toHaveBeenCalledTimes(
      assertCallsBefore,
    );
  });

  it('rotates A/A1 to exact B/B1 atomically and rejects old-token replay', async () => {
    const source = await coordinator.issue('issue-request-0003', identityA);

    await expect(
      coordinator.rotate(`Bearer ${source.token}`, 'rotation-request-0001', {
        ...identityB,
        profileId: identityA.profileId,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    memory.livePhoneBindings.set(scopeKey(identityB), 'phone-binding-b');
    await expect(
      coordinator.rotate(
        `Bearer ${source.token}`,
        'rotation-request-0001',
        identityB,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    memory.livePhoneBindings.set(scopeKey(identityB), 'phone-binding-a');

    const rotated = await coordinator.rotate(
      `Bearer ${source.token}`,
      'rotation-request-0001',
      identityB,
    );
    expect(rotated).toMatchObject({
      tokenVersion: 2,
      tenantId: 'tenant-b',
      storeId: 'store-b1',
      profileId: 'profile-b',
      previousSessionInvalidated: true,
      replayed: false,
    });

    await expect(
      coordinator.authorize(`Bearer ${source.token}`, 'READ'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      coordinator.authorize(`Bearer ${rotated.token}`, 'WRITE', {
        tenantId: 'tenant-b',
        storeId: 'store-b1',
      }),
    ).resolves.toMatchObject({
      permit: { tokenVersion: 2, tenantId: 'tenant-b' },
    });

    memory.livePhoneBindings.set(scopeKey(identityB), 'phone-binding-b');
    await expect(
      coordinator.rotate(
        `Bearer ${source.token}`,
        'rotation-request-0001',
        identityB,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    memory.livePhoneBindings.set(scopeKey(identityB), 'phone-binding-a');

    const replay = await coordinator.rotate(
      `Bearer ${source.token}`,
      'rotation-request-0001',
      identityB,
    );
    expect(replay).toMatchObject({
      sessionId: rotated.sessionId,
      tokenVersion: 2,
      replayed: true,
    });
    expect(replay.token).toBe(rotated.token);
  });

  it('revokes idempotently and rejects the revoked session afterwards', async () => {
    const session = await coordinator.issue('issue-request-0004', identityA);

    await expect(
      coordinator.revoke(`Bearer ${session.token}`, 'revoke-request-0001'),
    ).resolves.toMatchObject({ status: 'REVOKED', replayed: false });
    await expect(
      coordinator.revoke(`Bearer ${session.token}`, 'revoke-request-0001'),
    ).resolves.toMatchObject({ status: 'REVOKED', replayed: true });
    await expect(
      coordinator.authorize(`Bearer ${session.token}`, 'READ'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authorizes public media only inside the session tenant', async () => {
    const sessionA = await coordinator.issue('issue-request-0005', identityA);

    await expect(
      coordinator.authorizeMedia(`Bearer ${sessionA.token}`, 'asset-a'),
    ).resolves.toEqual({
      assetId: 'asset-a',
      tenantId: 'tenant-a',
      contentType: 'image/png',
      byteSize: 42,
    });
    await expect(
      coordinator.authorizeMedia(`Bearer ${sessionA.token}`, 'asset-b'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects signature tampering without touching SQL', async () => {
    const session = await coordinator.issue('issue-request-0006', identityA);
    const tampered = `${session.token.slice(0, -1)}${
      session.token.endsWith('a') ? 'b' : 'a'
    }`;
    const assertCallsBefore = memory.repository.assertSession.mock.calls.length;

    await expect(
      coordinator.authorize(`Bearer ${tampered}`, 'READ'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(memory.repository.assertSession).toHaveBeenCalledTimes(
      assertCallsBefore,
    );
  });
});

function memoryRepository() {
  type Stored = GuestPortalSessionCurrent190IssueInput & {
    tokenVersion: number;
    issuedAt: Date;
    expiresAt: Date;
    status: 'ACTIVE' | 'ROTATED' | 'REVOKED';
    rotatedTo: string | null;
    rotationRequestDigest: string | null;
    revocationRequestDigest: string | null;
    revokedAt: Date | null;
    phoneBindingDigest: string;
  };
  const sessions = new Map<string, Stored>();
  const exactIdentities = new Map([
    [scopeKey(identityA), identityA],
    [scopeKey(identityB), identityB],
  ]);
  const livePhoneBindings = new Map([
    [scopeKey(identityA), 'phone-binding-a'],
    [scopeKey(identityB), 'phone-binding-a'],
  ]);

  const repository = {
    assertPublicStore: jest.fn(),
    issue: jest.fn((input: GuestPortalSessionCurrent190IssueInput) => {
      assertExactIdentity(input, exactIdentities);
      const phoneBindingDigest = livePhoneBinding(input, livePhoneBindings);
      const existing = sessions.get(input.sessionId);
      if (existing) {
        assertBinding(existing, input);
        assertLivePhone(existing, phoneBindingDigest);
        return issueResult(existing, true);
      }
      const issuedAt = new Date();
      const stored: Stored = {
        ...input,
        tokenVersion: 1,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + input.ttlSeconds * 1_000),
        status: 'ACTIVE',
        rotatedTo: null,
        rotationRequestDigest: null,
        revocationRequestDigest: null,
        revokedAt: null,
        phoneBindingDigest,
      };
      sessions.set(input.sessionId, stored);
      return issueResult(stored, false);
    }),
    assertSession: jest.fn((binding: GuestPortalSessionCurrent190Binding) => {
      const stored = sessions.get(binding.sessionId);
      if (!stored || stored.status !== 'ACTIVE') throw new Error('denied');
      assertBinding(stored, binding);
      assertExactIdentity(binding, exactIdentities);
      assertLivePhone(stored, livePhoneBinding(binding, livePhoneBindings));
      return {
        sessionId: stored.sessionId,
        tenantId: stored.tenantId,
        storeId: stored.storeId,
        profileId: stored.profileId,
        guestId: stored.guestId,
        tokenVersion: stored.tokenVersion,
        expiresAt: stored.expiresAt,
        executionRevision: 1,
        entitlementProfileRevision: 1,
      };
    }),
    rotate: jest.fn(
      (input: {
        source: GuestPortalSessionCurrent190Binding;
        rotationRequestDigest: string;
        target: GuestPortalSessionCurrent190IssueInput;
      }) => {
        const source = sessions.get(input.source.sessionId);
        if (!source) throw new Error('denied');
        assertBinding(source, input.source);
        assertExactIdentity(input.target, exactIdentities);
        const sourcePhoneBinding = livePhoneBinding(
          input.source,
          livePhoneBindings,
        );
        const targetPhoneBinding = livePhoneBinding(
          input.target,
          livePhoneBindings,
        );
        assertLivePhone(source, sourcePhoneBinding);
        if (sourcePhoneBinding !== targetPhoneBinding) {
          throw new Error('identity continuity denied');
        }
        if (source.status === 'ROTATED') {
          const target = sessions.get(input.target.sessionId);
          if (
            source.rotatedTo !== input.target.sessionId ||
            source.rotationRequestDigest !== input.rotationRequestDigest ||
            !target
          ) {
            throw new Error('replay mismatch');
          }
          assertBinding(target, input.target);
          assertLivePhone(target, targetPhoneBinding);
          return issueResult(target, true);
        }
        if (source.status !== 'ACTIVE') throw new Error('denied');
        const issuedAt = new Date();
        const target: Stored = {
          ...input.target,
          tokenVersion: source.tokenVersion + 1,
          issuedAt,
          expiresAt: new Date(
            issuedAt.getTime() + input.target.ttlSeconds * 1_000,
          ),
          status: 'ACTIVE',
          rotatedTo: null,
          rotationRequestDigest: input.rotationRequestDigest,
          revocationRequestDigest: null,
          revokedAt: null,
          phoneBindingDigest: targetPhoneBinding,
        };
        source.status = 'ROTATED';
        source.rotatedTo = target.sessionId;
        source.rotationRequestDigest = input.rotationRequestDigest;
        sessions.set(target.sessionId, target);
        return issueResult(target, false);
      },
    ),
    revoke: jest.fn(
      (binding: GuestPortalSessionCurrent190Binding, requestDigest: string) => {
        const stored = sessions.get(binding.sessionId);
        if (!stored) throw new Error('denied');
        assertBinding(stored, binding);
        assertLivePhone(stored, livePhoneBinding(binding, livePhoneBindings));
        if (stored.status === 'REVOKED') {
          if (stored.revocationRequestDigest !== requestDigest) {
            throw new Error('replay mismatch');
          }
          return {
            sessionId: stored.sessionId,
            status: 'REVOKED',
            revokedAt: stored.revokedAt,
            replayed: true,
          };
        }
        if (stored.status !== 'ACTIVE') throw new Error('denied');
        stored.status = 'REVOKED';
        stored.revocationRequestDigest = requestDigest;
        stored.revokedAt = new Date();
        return {
          sessionId: stored.sessionId,
          status: 'REVOKED',
          revokedAt: stored.revokedAt,
          replayed: false,
        };
      },
    ),
    assertMedia: jest.fn(
      (binding: GuestPortalSessionCurrent190Binding, assetId: string) => {
        const stored = sessions.get(binding.sessionId);
        if (!stored || stored.status !== 'ACTIVE') throw new Error('denied');
        assertBinding(stored, binding);
        assertLivePhone(stored, livePhoneBinding(binding, livePhoneBindings));
        const assetTenant =
          assetId === 'asset-a'
            ? 'tenant-a'
            : assetId === 'asset-b'
              ? 'tenant-b'
              : null;
        if (assetTenant !== stored.tenantId) throw new Error('denied');
        return {
          assetId,
          tenantId: assetTenant,
          contentType: 'image/png',
          byteSize: 42,
        };
      },
    ),
  };

  return { livePhoneBindings, repository, sessions };
}

function scopeKey(input: {
  tenantId: string;
  storeId: string;
  profileId: string;
}) {
  return [input.tenantId, input.storeId, input.profileId].join('|');
}

function assertExactIdentity(
  input: {
    tenantId: string;
    storeId: string;
    profileId: string;
    guestId: string | null;
  },
  identities: Map<string, typeof identityA>,
) {
  const expected = identities.get(scopeKey(input));
  if (!expected || expected.guestId !== input.guestId) {
    throw new Error('cross-scope identity denied');
  }
}

function assertBinding(
  stored: {
    sessionId: string;
    tenantId: string;
    storeId: string;
    profileId: string;
    guestId: string | null;
    jtiDigest: string;
    bindingDigest: string;
    tokenVersion: number;
  },
  expected: Partial<typeof stored> & { sessionId: string },
) {
  for (const key of [
    'sessionId',
    'tenantId',
    'storeId',
    'profileId',
    'guestId',
    'jtiDigest',
    'bindingDigest',
  ] as const) {
    if (expected[key] !== undefined && stored[key] !== expected[key]) {
      throw new Error(`binding mismatch: ${key}`);
    }
  }
  if (
    expected.tokenVersion !== undefined &&
    stored.tokenVersion !== expected.tokenVersion
  ) {
    throw new Error('binding mismatch: tokenVersion');
  }
}

function livePhoneBinding(
  input: { tenantId: string; storeId: string; profileId: string },
  livePhoneBindings: Map<string, string>,
) {
  const binding = livePhoneBindings.get(scopeKey(input));
  if (!binding) throw new Error('phone binding unavailable');
  return binding;
}

function assertLivePhone(
  stored: { phoneBindingDigest: string },
  livePhoneBindingDigest: string,
) {
  if (stored.phoneBindingDigest !== livePhoneBindingDigest) {
    throw new Error('live phone binding denied');
  }
}

function issueResult(
  stored: {
    sessionId: string;
    tokenVersion: number;
    issuedAt: Date;
    expiresAt: Date;
  },
  replayed: boolean,
) {
  return {
    sessionId: stored.sessionId,
    tokenVersion: stored.tokenVersion,
    issuedAt: stored.issuedAt,
    expiresAt: stored.expiresAt,
    executionRevision: 1,
    entitlementProfileRevision: 1,
    replayed,
  };
}
