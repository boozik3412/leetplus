import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  EmployeeInviteDeliveryCoordinator,
  type EmployeeInviteCoordinatorResult,
  type EmployeeInviteDeliveryDriver,
  type EmployeeInviteEnvelope,
  type EmployeeInviteFreshNetworkAuthority,
} from './employee-invite-delivery-coordinator';
import {
  EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST,
  EmployeeInviteCurrent189DormantRouteApplication,
} from './employee-invite-current189-route-policy';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ROUTE_INVITE_ID = '33333333-3333-4333-8333-333333333333';
const CREATED_INVITE_ID = '44444444-4444-4444-8444-444444444444';
const EXPIRES_AT = '2026-08-20T12:00:00.000Z';

const enabledRoutePolicy = Object.freeze({
  enabled: true,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
});

const enabledCoordinatorPolicy = Object.freeze({
  enabled: true,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
  lostResponseRetries: 0 as const,
});

const actor: AuthenticatedUser = {
  id: ACTOR_ID,
  email: 'masked-owner@identity.invalid',
  fullName: null,
  role: UserRole.OWNER,
  permissions: ['manage_users'],
  isActive: true,
  isPlatformAdmin: false,
  tenantId: TENANT_ID,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

type CoordinatorPort = Pick<
  EmployeeInviteDeliveryCoordinator,
  'issue' | 'reissue' | 'revoke'
>;

const coordinatorResult = (
  operation: EmployeeInviteCoordinatorResult['operation'],
): EmployeeInviteCoordinatorResult => {
  if (operation === 'REVOKE_EMPLOYEE_INVITE') {
    return {
      ok: true,
      coordinatorContract: 'EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1',
      operation,
      decision: 'REVOKED',
      replayed: false,
      tenantId: TENANT_ID,
      invite: {
        id: ROUTE_INVITE_ID,
        deliveryStatus: 'CANCELED',
        expiresAt: null,
      },
      replacedInviteId: null,
    };
  }

  return {
    ok: true,
    coordinatorContract: 'EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1',
    operation,
    decision:
      operation === 'ISSUE_EMPLOYEE_INVITE' ? 'CREATED' : 'REISSUED',
    replayed: false,
    tenantId: TENANT_ID,
    invite: {
      id: CREATED_INVITE_ID,
      deliveryStatus: 'PENDING',
      expiresAt: EXPIRES_AT,
    },
    replacedInviteId:
      operation === 'REISSUE_EMPLOYEE_INVITE' ? ROUTE_INVITE_ID : null,
  };
};

const fixture = () => {
  const coordinator: jest.Mocked<CoordinatorPort> = {
    issue: jest
      .fn<ReturnType<CoordinatorPort['issue']>, Parameters<CoordinatorPort['issue']>>()
      .mockResolvedValue(coordinatorResult('ISSUE_EMPLOYEE_INVITE')),
    reissue: jest
      .fn<
        ReturnType<CoordinatorPort['reissue']>,
        Parameters<CoordinatorPort['reissue']>
      >()
      .mockResolvedValue(coordinatorResult('REISSUE_EMPLOYEE_INVITE')),
    revoke: jest
      .fn<
        ReturnType<CoordinatorPort['revoke']>,
        Parameters<CoordinatorPort['revoke']>
      >()
      .mockResolvedValue(coordinatorResult('REVOKE_EMPLOYEE_INVITE')),
  };
  return {
    coordinator,
    application: new EmployeeInviteCurrent189DormantRouteApplication(
      coordinator,
      enabledRoutePolicy,
    ),
  };
};

const issueInput = (override: Record<string, unknown> = {}) => ({
  handler: 'createInvite',
  method: 'POST',
  path: '/users/invites',
  actor,
  body: { requestId: 'request-body-owned-by-coordinator' },
  ...override,
});

const reissueInput = (override: Record<string, unknown> = {}) => ({
  handler: 'updateInvite',
  method: 'PATCH',
  path: '/users/invites/:id',
  actor,
  inviteId: ROUTE_INVITE_ID,
  body: { requestId: 'request-body-owned-by-coordinator' },
  ...override,
});

const revokeInput = (override: Record<string, unknown> = {}) => ({
  handler: 'cancelInvite',
  method: 'DELETE',
  path: '/users/invites/:id',
  actor,
  inviteId: ROUTE_INVITE_ID,
  body: { requestId: 'request-body-owned-by-coordinator' },
  ...override,
});

describe('EmployeeInviteCurrent189DormantRouteApplication', () => {
  it('is explicitly dormant, non-deployable and inventories only three blocked routes', () => {
    const { coordinator } = fixture();
    const application = new EmployeeInviteCurrent189DormantRouteApplication(
      coordinator,
    );

    expect(application.readiness()).toEqual({
      status: 'DORMANT_APPLICATION_ROUTE_POLICY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      productionRoutesChanged: false,
      routeActivationAllowed: false,
      inventoryCount: 3,
      blockedProductionRouteCount: 3,
    });
    expect(EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST).toHaveLength(3);
    expect(
      EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.every(
        (entry) => entry.productionDecision === 'BLOCKED',
      ),
    ).toBe(true);
  });

  it('fails before the coordinator under the default-disabled policy', async () => {
    const { coordinator } = fixture();
    const application = new EmployeeInviteCurrent189DormantRouteApplication(
      coordinator,
    );

    await expect(application.dispatch(issueInput())).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_CURRENT189_ROUTE_DORMANT' },
    });
    expect(coordinator.issue).not.toHaveBeenCalled();
  });

  it('cannot be enabled in a production process', async () => {
    const { application, coordinator } = fixture();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(application.dispatch(issueInput())).rejects.toMatchObject({
        response: { reasonCode: 'EMPLOYEE_INVITE_CURRENT189_ROUTE_DORMANT' },
      });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    expect(coordinator.issue).not.toHaveBeenCalled();
  });

  it('binds POST /users/invites only to issue and projects a safe response', async () => {
    const { application, coordinator } = fixture();
    const body = { requestId: 'opaque-command' };

    const response = await application.dispatch(issueInput({ body }));

    expect(coordinator.issue).toHaveBeenCalledWith(actor, body);
    expect(coordinator.reissue).not.toHaveBeenCalled();
    expect(coordinator.revoke).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: true,
      routeContract: 'EMPLOYEE_INVITE_CURRENT189_ROUTE_V1',
      operation: 'ISSUE_EMPLOYEE_INVITE',
      decision: 'CREATED',
      replayed: false,
      invite: {
        id: CREATED_INVITE_ID,
        deliveryStatus: 'PENDING',
        expiresAt: EXPIRES_AT,
      },
      replacedInviteId: null,
    });
  });

  it('binds PATCH /users/invites/:id only to immutable reissue', async () => {
    const { application, coordinator } = fixture();
    const body = { requestId: 'opaque-command' };

    await expect(
      application.dispatch(reissueInput({ body })),
    ).resolves.toMatchObject({
      operation: 'REISSUE_EMPLOYEE_INVITE',
      decision: 'REISSUED',
      replacedInviteId: ROUTE_INVITE_ID,
    });
    expect(coordinator.reissue).toHaveBeenCalledWith(
      actor,
      ROUTE_INVITE_ID,
      body,
    );
    expect(coordinator.issue).not.toHaveBeenCalled();
    expect(coordinator.revoke).not.toHaveBeenCalled();
  });

  it('binds DELETE /users/invites/:id only to revoke', async () => {
    const { application, coordinator } = fixture();
    const body = { requestId: 'opaque-command' };

    await expect(
      application.dispatch(revokeInput({ body })),
    ).resolves.toMatchObject({
      operation: 'REVOKE_EMPLOYEE_INVITE',
      decision: 'REVOKED',
      invite: {
        id: ROUTE_INVITE_ID,
        deliveryStatus: 'CANCELED',
        expiresAt: null,
      },
    });
    expect(coordinator.revoke).toHaveBeenCalledWith(
      actor,
      ROUTE_INVITE_ID,
      body,
    );
    expect(coordinator.issue).not.toHaveBeenCalled();
    expect(coordinator.reissue).not.toHaveBeenCalled();
  });

  it('whitelists response fields even if an adapter returns extra PII or secret fields', async () => {
    const { application, coordinator } = fixture();
    coordinator.issue.mockResolvedValueOnce({
      ...coordinatorResult('ISSUE_EMPLOYEE_INVITE'),
      email: 'must-not-escape@identity.invalid',
      fullName: 'Must Not Escape',
      registrationUrl: 'https://identity.invalid/invite#secret',
      rawToken: 'must-not-escape',
      password: 'must-not-escape',
    } as EmployeeInviteCoordinatorResult);

    const response = await application.dispatch(issueInput());
    const serialized = JSON.stringify(response);

    expect(serialized).not.toMatch(
      /email|fullName|registrationUrl|url|rawToken|token|password|must-not-escape/iu,
    );
    expect(Object.keys(response).sort()).toEqual(
      [
        'decision',
        'invite',
        'ok',
        'operation',
        'replacedInviteId',
        'replayed',
        'routeContract',
      ].sort(),
    );
  });

  it('redacts an unexpected coordinator failure instead of forwarding its details', async () => {
    const { application, coordinator } = fixture();
    coordinator.issue.mockRejectedValueOnce(
      new Error(
        'must-not-escape@identity.invalid rawToken=must-not-escape url=https://identity.invalid',
      ),
    );

    let error: unknown;
    try {
      await application.dispatch(issueInput());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error).toMatchObject({
      response: {
        message: 'Employee invite route is unavailable',
        reasonCode: 'EMPLOYEE_INVITE_CURRENT189_COORDINATOR_FAILURE',
      },
    });
    if (!(error instanceof ServiceUnavailableException)) {
      throw new Error('Expected a safe service unavailable response');
    }
    expect(JSON.stringify(error.getResponse())).not.toMatch(
      /identity\.invalid|rawToken|must-not-escape|https?:/iu,
    );
  });

  it.each([
    ['non-owner', { role: UserRole.ADMIN }],
    ['missing capability', { permissions: ['view_dashboard'] }],
    ['store scope', { accessScope: 'STORES', allowedStoreIds: [ROUTE_INVITE_ID] }],
    ['platform admin', { isPlatformAdmin: true }],
    ['inactive owner', { isActive: false }],
  ])('denies %s before coordinator dispatch', async (_label, actorOverride) => {
    const { application, coordinator } = fixture();

    await expect(
      application.dispatch(
        issueInput({ actor: { ...actor, ...actorOverride } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(coordinator.issue).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy create-user', issueInput({ handler: 'createUser', path: '/users' })],
    ['unknown handler', issueInput({ handler: 'unknownInvite' })],
    ['wrong method', issueInput({ method: 'PUT' })],
    ['changed path', issueInput({ path: '/users/invites/:inviteId' })],
  ])('fails closed for %s metadata', async (_label, input) => {
    const { application, coordinator } = fixture();

    await expect(application.dispatch(input)).rejects.toMatchObject({
      response: { reasonCode: 'EMPLOYEE_INVITE_CURRENT189_UNKNOWN_ROUTE' },
    });
    expect(coordinator.issue).not.toHaveBeenCalled();
    expect(coordinator.reissue).not.toHaveBeenCalled();
    expect(coordinator.revoke).not.toHaveBeenCalled();
  });

  it.each([
    ['issue with route id', issueInput({ inviteId: ROUTE_INVITE_ID })],
    ['reissue without route id', reissueInput({ inviteId: undefined })],
    ['reissue with malformed id', reissueInput({ inviteId: 'not-an-id' })],
    ['revoke without route id', revokeInput({ inviteId: undefined })],
  ])('rejects inexact %s binding before coordinator dispatch', async (_label, input) => {
    const { application, coordinator } = fixture();

    await expect(application.dispatch(input)).rejects.toMatchObject({
      response: {
        reasonCode: 'EMPLOYEE_INVITE_CURRENT189_ROUTE_BINDING_INVALID',
      },
    });
    expect(coordinator.issue).not.toHaveBeenCalled();
    expect(coordinator.reissue).not.toHaveBeenCalled();
    expect(coordinator.revoke).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong operation', { operation: 'REVOKE_EMPLOYEE_INVITE' }],
    ['foreign tenant', { tenantId: ROUTE_INVITE_ID }],
    ['wrong status', { invite: { ...coordinatorResult('ISSUE_EMPLOYEE_INVITE').invite, deliveryStatus: 'CANCELED' } }],
    ['missing expiration', { invite: { ...coordinatorResult('ISSUE_EMPLOYEE_INVITE').invite, expiresAt: null } }],
    ['wrong replay flag', { decision: 'REPLAYED', replayed: false }],
    ['unexpected replaced id', { replacedInviteId: ROUTE_INVITE_ID }],
  ])('rejects coordinator result with %s', async (_label, override) => {
    const { application, coordinator } = fixture();
    coordinator.issue.mockResolvedValueOnce({
      ...coordinatorResult('ISSUE_EMPLOYEE_INVITE'),
      ...override,
    } as EmployeeInviteCoordinatorResult);

    await expect(application.dispatch(issueInput())).rejects.toMatchObject({
      response: {
        reasonCode: 'EMPLOYEE_INVITE_CURRENT189_RESULT_BINDING_INVALID',
      },
    });
  });

  it('rejects reissue when the coordinator returns the replaced invite as the new invite', async () => {
    const { application, coordinator } = fixture();
    coordinator.reissue.mockResolvedValueOnce({
      ...coordinatorResult('REISSUE_EMPLOYEE_INVITE'),
      invite: {
        ...coordinatorResult('REISSUE_EMPLOYEE_INVITE').invite,
        id: ROUTE_INVITE_ID,
      },
    });

    await expect(application.dispatch(reissueInput())).rejects.toMatchObject({
      response: {
        reasonCode: 'EMPLOYEE_INVITE_CURRENT189_RESULT_BINDING_INVALID',
      },
    });
  });

  it('delegates fresh PostgreSQL NETWORK authority to the real coordinator before parsing or delivery', async () => {
    const assertNetwork = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('stale scope'));
    const issue = jest.fn();
    const reissue = jest.fn();
    const revoke = jest.fn();
    const seal = jest.fn();
    const authority: jest.Mocked<EmployeeInviteFreshNetworkAuthority> = {
      assertNetwork,
    };
    const driver: jest.Mocked<EmployeeInviteDeliveryDriver> = {
      issue,
      reissue,
      revoke,
    };
    const envelope: jest.Mocked<EmployeeInviteEnvelope> = {
      seal,
    };
    const coordinator = new EmployeeInviteDeliveryCoordinator(
      authority,
      driver,
      envelope,
      enabledCoordinatorPolicy,
    );
    const application = new EmployeeInviteCurrent189DormantRouteApplication(
      coordinator,
      enabledRoutePolicy,
    );

    await expect(application.dispatch(issueInput({ body: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(assertNetwork).toHaveBeenCalledWith(actor);
    expect(seal).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });
});
