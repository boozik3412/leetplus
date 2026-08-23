import {
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import {
  EmployeeInviteDeliveryCoordinator,
  type EmployeeInviteCoordinatorResult,
} from './employee-invite-delivery-coordinator';

/**
 * Dormant route/application policy for the non-canonical CURRENT189 employee
 * invite candidate.
 *
 * This file is deliberately undecorated, absent from UsersModule and unused by
 * UsersController. It must not be interpreted as production route activation.
 */

const ROUTE_CONTRACT = 'EMPLOYEE_INVITE_CURRENT189_ROUTE_V1' as const;
const COORDINATOR_CONTRACT =
  'EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type EmployeeInviteCurrent189HttpMethod = 'POST' | 'PATCH' | 'DELETE';
export type EmployeeInviteCurrent189RouteOperation =
  | 'ISSUE_EMPLOYEE_INVITE'
  | 'REISSUE_EMPLOYEE_INVITE'
  | 'REVOKE_EMPLOYEE_INVITE';
export type EmployeeInviteCurrent189CoordinatorMethod =
  | 'issue'
  | 'reissue'
  | 'revoke';

export type EmployeeInviteCurrent189RouteEntry = Readonly<{
  handler: 'createInvite' | 'updateInvite' | 'cancelInvite';
  method: EmployeeInviteCurrent189HttpMethod;
  path: '/users/invites' | '/users/invites/:id';
  operation: EmployeeInviteCurrent189RouteOperation;
  coordinatorMethod: EmployeeInviteCurrent189CoordinatorMethod;
  requiredRole: 'OWNER';
  requiredCapability: 'manage_users';
  requiredScope: 'NETWORK';
  requiredFreshness: 'DATABASE_RECHECK';
  productionDecision: 'BLOCKED';
}>;

const route = (
  handler: EmployeeInviteCurrent189RouteEntry['handler'],
  method: EmployeeInviteCurrent189HttpMethod,
  path: EmployeeInviteCurrent189RouteEntry['path'],
  operation: EmployeeInviteCurrent189RouteOperation,
  coordinatorMethod: EmployeeInviteCurrent189CoordinatorMethod,
): EmployeeInviteCurrent189RouteEntry =>
  Object.freeze({
    handler,
    method,
    path,
    operation,
    coordinatorMethod,
    requiredRole: 'OWNER',
    requiredCapability: 'manage_users',
    requiredScope: 'NETWORK',
    requiredFreshness: 'DATABASE_RECHECK',
    productionDecision: 'BLOCKED',
  });

export const EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST = Object.freeze([
  route(
    'createInvite',
    'POST',
    '/users/invites',
    'ISSUE_EMPLOYEE_INVITE',
    'issue',
  ),
  route(
    'updateInvite',
    'PATCH',
    '/users/invites/:id',
    'REISSUE_EMPLOYEE_INVITE',
    'reissue',
  ),
  route(
    'cancelInvite',
    'DELETE',
    '/users/invites/:id',
    'REVOKE_EMPLOYEE_INVITE',
    'revoke',
  ),
] as const satisfies readonly EmployeeInviteCurrent189RouteEntry[]);

export const EMPLOYEE_INVITE_CURRENT189_DORMANT_ROUTE_POLICY = Object.freeze({
  enabled: false,
  executionMode: 'DORMANT_TEST_ONLY' as const,
  environment: 'test' as const,
});

export type EmployeeInviteCurrent189DormantRoutePolicy = Readonly<{
  enabled: boolean;
  executionMode: 'DORMANT_TEST_ONLY';
  environment: 'test' | 'ci';
}>;

export type EmployeeInviteCurrent189RouteInput = Readonly<{
  handler: string;
  method: string;
  path: string;
  actor: AuthenticatedUser;
  inviteId?: unknown;
  body: unknown;
}>;

export type EmployeeInviteCurrent189SafeResponse = Readonly<{
  ok: true;
  routeContract: typeof ROUTE_CONTRACT;
  operation: EmployeeInviteCurrent189RouteOperation;
  decision: 'CREATED' | 'REISSUED' | 'REVOKED' | 'REPLAYED';
  replayed: boolean;
  invite: Readonly<{
    id: string;
    deliveryStatus: 'PENDING' | 'CANCELED';
    expiresAt: string | null;
  }>;
  replacedInviteId: string | null;
}>;

type EmployeeInviteCurrent189CoordinatorPort = Pick<
  EmployeeInviteDeliveryCoordinator,
  'issue' | 'reissue' | 'revoke'
>;

const routeByExactMetadata = new Map(
  EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.map((entry) => [
    `${entry.handler}\u0000${entry.method}\u0000${entry.path}`,
    entry,
  ]),
);

export const findEmployeeInviteCurrent189Route = (
  handler: string,
  method: string,
  path: string,
): EmployeeInviteCurrent189RouteEntry | null =>
  routeByExactMetadata.get(`${handler}\u0000${method}\u0000${path}`) ?? null;

/**
 * Candidate-only exact dispatcher over EmployeeInviteDeliveryCoordinator.
 * The coordinator remains responsible for the authoritative PostgreSQL scope
 * reread immediately before issue/reissue/revoke.
 */
export class EmployeeInviteCurrent189DormantRouteApplication {
  constructor(
    private readonly coordinator: EmployeeInviteCurrent189CoordinatorPort,
    private readonly policy: EmployeeInviteCurrent189DormantRoutePolicy = EMPLOYEE_INVITE_CURRENT189_DORMANT_ROUTE_POLICY,
  ) {}

  readiness() {
    return {
      status: 'DORMANT_APPLICATION_ROUTE_POLICY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      productionRoutesChanged: false,
      routeActivationAllowed: false,
      inventoryCount: EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.length,
      blockedProductionRouteCount:
        EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.length,
    } as const;
  }

  async dispatch(
    input: EmployeeInviteCurrent189RouteInput,
  ): Promise<EmployeeInviteCurrent189SafeResponse> {
    this.assertDormantPolicy();
    const routeEntry = findEmployeeInviteCurrent189Route(
      input.handler,
      input.method,
      input.path,
    );
    if (!routeEntry) {
      throw denied('EMPLOYEE_INVITE_CURRENT189_UNKNOWN_ROUTE');
    }

    this.assertActor(input.actor);
    const inviteId = this.routeInviteId(routeEntry, input.inviteId);
    try {
      const result = await this.executeExact(
        routeEntry,
        input.actor,
        inviteId,
        input.body,
      );
      return this.safeResponse(routeEntry, input.actor, inviteId, result);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw unavailable('EMPLOYEE_INVITE_CURRENT189_COORDINATOR_FAILURE');
    }
  }

  private async executeExact(
    routeEntry: EmployeeInviteCurrent189RouteEntry,
    actor: AuthenticatedUser,
    inviteId: string | null,
    body: unknown,
  ): Promise<EmployeeInviteCoordinatorResult> {
    switch (routeEntry.coordinatorMethod) {
      case 'issue':
        return this.coordinator.issue(actor, body);
      case 'reissue':
        return this.coordinator.reissue(actor, inviteId, body);
      case 'revoke':
        return this.coordinator.revoke(actor, inviteId, body);
    }
  }

  private safeResponse(
    routeEntry: EmployeeInviteCurrent189RouteEntry,
    actor: AuthenticatedUser,
    routeInviteId: string | null,
    result: EmployeeInviteCoordinatorResult,
  ): EmployeeInviteCurrent189SafeResponse {
    const expectedPending = routeEntry.coordinatorMethod !== 'revoke';
    const decisionAllowed =
      result.decision === 'REPLAYED' ||
      (routeEntry.coordinatorMethod === 'issue' &&
        result.decision === 'CREATED') ||
      (routeEntry.coordinatorMethod === 'reissue' &&
        result.decision === 'REISSUED') ||
      (routeEntry.coordinatorMethod === 'revoke' &&
        result.decision === 'REVOKED');
    const expectedReplacedInviteId =
      routeEntry.coordinatorMethod === 'reissue' ? routeInviteId : null;
    const validExpiration = expectedPending
      ? canonicalTimestamp(result.invite.expiresAt)
      : result.invite.expiresAt === null;
    const validInviteBinding =
      routeEntry.coordinatorMethod === 'revoke'
        ? result.invite.id === routeInviteId
        : routeEntry.coordinatorMethod === 'reissue'
          ? uuid(result.invite.id) && result.invite.id !== routeInviteId
          : uuid(result.invite.id);

    if (
      result.ok !== true ||
      result.coordinatorContract !== COORDINATOR_CONTRACT ||
      result.operation !== routeEntry.operation ||
      result.tenantId !== actor.tenantId ||
      !decisionAllowed ||
      result.replayed !== (result.decision === 'REPLAYED') ||
      !validInviteBinding ||
      result.invite.deliveryStatus !==
        (expectedPending ? 'PENDING' : 'CANCELED') ||
      !validExpiration ||
      result.replacedInviteId !== expectedReplacedInviteId
    ) {
      throw unavailable('EMPLOYEE_INVITE_CURRENT189_RESULT_BINDING_INVALID');
    }

    return Object.freeze({
      ok: true,
      routeContract: ROUTE_CONTRACT,
      operation: routeEntry.operation,
      decision: result.decision,
      replayed: result.replayed,
      invite: Object.freeze({
        id: result.invite.id,
        deliveryStatus: result.invite.deliveryStatus,
        expiresAt: result.invite.expiresAt,
      }),
      replacedInviteId: result.replacedInviteId,
    });
  }

  private routeInviteId(
    routeEntry: EmployeeInviteCurrent189RouteEntry,
    value: unknown,
  ): string | null {
    if (routeEntry.coordinatorMethod === 'issue') {
      if (value !== undefined) {
        throw denied('EMPLOYEE_INVITE_CURRENT189_ROUTE_BINDING_INVALID');
      }
      return null;
    }
    if (!uuid(value)) {
      throw denied('EMPLOYEE_INVITE_CURRENT189_ROUTE_BINDING_INVALID');
    }
    return value;
  }

  private assertActor(actor: AuthenticatedUser): void {
    if (
      !actor ||
      actor.isPlatformAdmin ||
      actor.isActive === false ||
      actor.role !== UserRole.OWNER ||
      actor.accessScope !== 'NETWORK' ||
      !Array.isArray(actor.allowedStoreIds) ||
      actor.allowedStoreIds.length !== 0 ||
      !hasCapability(actor, 'manage_users') ||
      !uuid(actor.id) ||
      !uuid(actor.tenantId)
    ) {
      throw denied('EMPLOYEE_INVITE_CURRENT189_NETWORK_OWNER_REQUIRED');
    }
  }

  private assertDormantPolicy(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      this.policy.enabled !== true ||
      this.policy.executionMode !== 'DORMANT_TEST_ONLY' ||
      !['test', 'ci'].includes(this.policy.environment)
    ) {
      throw unavailable('EMPLOYEE_INVITE_CURRENT189_ROUTE_DORMANT');
    }
  }
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function canonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    CANONICAL_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

function denied(reasonCode: string): ForbiddenException {
  return new ForbiddenException({
    message: 'Employee invite route is unavailable',
    reasonCode,
  });
}

function unavailable(reasonCode: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: 'Employee invite route is unavailable',
    reasonCode,
  });
}
