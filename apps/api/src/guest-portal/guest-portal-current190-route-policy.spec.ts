import {
  GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS,
  GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST,
  GuestPortalCurrent190DormantRoutePolicy,
  type GuestPortalCurrent190SessionAuthorizationPort,
} from './guest-portal-current190-route-policy';

describe('GuestPortalCurrent190DormantRoutePolicy', () => {
  const makePolicy = () => {
    const session: jest.Mocked<GuestPortalCurrent190SessionAuthorizationPort> =
      {
        authorize: jest.fn().mockResolvedValue({ permit: 'persisted' }),
      };
    return {
      policy: new GuestPortalCurrent190DormantRoutePolicy(session),
      session,
    };
  };

  it('stays explicitly dormant and non-deployable', () => {
    const { policy } = makePolicy();

    expect(policy.readiness()).toEqual({
      status: 'DORMANT_APPLICATION_ROUTE_POLICY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      productionRoutesChanged: false,
      routeActivationAllowed: false,
      outboundAllowed: false,
      publicBootstrapAllowed: false,
      inventoryCount: 30,
      blockerCount: 3,
    });
  });

  it.each(
    GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.filter(
      (entry) => entry.classification === 'READ',
    ),
  )('maps $handler to exact persisted READ admission', async (entry) => {
    const { policy, session } = makePolicy();
    const expectedScope = { tenantId: 'tenant-a', storeId: 'store-a1' };

    await expect(
      policy.admit({
        handler: entry.handler,
        method: entry.method,
        path: entry.path,
        authorization: 'Bearer candidate-token',
        expectedScope,
      }),
    ).resolves.toMatchObject({ allowed: true, action: 'READ', route: entry });
    expect(session.authorize).toHaveBeenCalledWith(
      'Bearer candidate-token',
      'READ',
      expectedScope,
    );
  });

  it.each(
    GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.filter(
      (entry) =>
        entry.classification === 'WRITE' &&
        entry.requiredBinding === 'PERSISTED_WRITE',
    ),
  )('maps $handler to exact persisted WRITE admission', async (entry) => {
    const { policy, session } = makePolicy();

    await expect(
      policy.admit({
        handler: entry.handler,
        method: entry.method,
        path: entry.path,
        authorization: 'Bearer candidate-token',
      }),
    ).resolves.toMatchObject({ allowed: true, action: 'WRITE', route: entry });
    expect(session.authorize).toHaveBeenCalledWith(
      'Bearer candidate-token',
      'WRITE',
      undefined,
    );
  });

  it('blocks club selection until persisted rotation is wired', async () => {
    const { policy, session } = makePolicy();
    const entry = GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.find(
      (candidate) => candidate.handler === 'selectGameClub',
    );
    expect(entry).toBeDefined();

    await expect(
      policy.admit({
        handler: entry!.handler,
        method: entry!.method,
        path: entry!.path,
        authorization: 'Bearer candidate-token',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'PERSISTED_ROTATION_NOT_WIRED',
    });
    expect(session.authorize).not.toHaveBeenCalled();
  });

  it.each(
    GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.filter(
      (entry) => entry.classification === 'OUTBOUND',
    ),
  )('fails closed for outbound handler $handler', async (entry) => {
    const { policy, session } = makePolicy();

    await expect(
      policy.admit({
        handler: entry.handler,
        method: entry.method,
        path: entry.path,
        authorization: 'Bearer candidate-token',
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'OUTBOUND_DISABLED',
    });
    expect(session.authorize).not.toHaveBeenCalled();
  });

  it.each(
    GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.filter(
      (entry) => entry.classification === 'PUBLIC_BOOTSTRAP',
    ),
  )(
    'keeps bootstrap handler $handler blocked before promotion',
    async (entry) => {
      const { policy, session } = makePolicy();

      await expect(
        policy.admit({
          handler: entry.handler,
          method: entry.method,
          path: entry.path,
        }),
      ).resolves.toMatchObject({
        allowed: false,
        reason: 'PUBLIC_BOOTSTRAP_NOT_PROMOTED',
      });
      expect(session.authorize).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      handler: 'unknownHandler',
      method: 'POST',
      path: '/guest-portal/session/unknown',
    },
    {
      handler: 'getSession',
      method: 'POST',
      path: '/guest-portal/session',
    },
    {
      handler: 'getSession',
      method: 'GET',
      path: '/guest-portal/session/changed',
    },
  ])('fails closed for unknown or inexact route metadata', async (input) => {
    const { policy, session } = makePolicy();

    await expect(policy.admit(input)).resolves.toEqual({
      allowed: false,
      route: null,
      reason: 'UNKNOWN_ROUTE',
    });
    expect(session.authorize).not.toHaveBeenCalled();
  });

  it('fails closed when persisted session authorization rejects or is empty', async () => {
    const { policy, session } = makePolicy();
    const entry = GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.find(
      (candidate) => candidate.handler === 'getSession',
    );
    expect(entry).toBeDefined();

    session.authorize.mockRejectedValueOnce(new Error('denied'));
    await expect(
      policy.admit({
        handler: entry!.handler,
        method: entry!.method,
        path: entry!.path,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'SESSION_ADMISSION_DENIED',
    });

    session.authorize.mockResolvedValueOnce(undefined);
    await expect(
      policy.admit({
        handler: entry!.handler,
        method: entry!.method,
        path: entry!.path,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'SESSION_ADMISSION_DENIED',
    });
  });

  it('keeps dormant session routes and legacy media cutover as blockers', () => {
    expect(GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS).toEqual([
      expect.objectContaining({
        id: 'LOGOUT_PERSISTED_REVOKE',
        method: 'POST',
        path: '/guest-portal/session/logout',
        currentState: 'DORMANT_CONTROLLER_UNREGISTERED',
        requiredBinding: 'PERSISTED_REVOKE',
        decision: 'BLOCKED',
      }),
      expect.objectContaining({
        id: 'MEDIA_TENANT_SCOPED_BEARER',
        method: 'GET',
        path: '/guest-portal/session/media/:id',
        currentState: 'DORMANT_CONTROLLER_UNREGISTERED',
        requiredBinding: 'PERSISTED_MEDIA_ASSERT',
        decision: 'BLOCKED',
      }),
      expect.objectContaining({
        id: 'LEGACY_PUBLIC_MEDIA_ID_ONLY',
        method: 'GET',
        path: '/public/guest-game/media/:id',
        currentState: 'LEGACY_PUBLIC_ID_ONLY',
        requiredBinding: 'PROTECTED_MEDIA_CUTOVER',
        decision: 'BLOCKED',
      }),
    ]);
  });
});
