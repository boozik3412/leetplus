import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
  TenantModule,
  TenantOnboardingStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessScopeService } from '../tenancy/access-scope.service';
import { TenantExecutionPolicyService } from '../tenancy/tenant-execution-policy.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class TestJwtAuthGuard extends JwtAuthGuard {
  verify(token: string) {
    return this.verifyToken(token);
  }
}

function createHttpContext(request: {
  headers: { authorization: string };
  method: string;
  path: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard access scope', () => {
  const admittedTenant = {
    id: 'tenant-a',
    slug: 'tenant-a',
    status: TenantLifecycleStatus.ACTIVE,
    customerStage: TenantCustomerStage.INTERNAL,
    onboardingStatus: TenantOnboardingStatus.ACTIVE,
    trialStartsAt: null,
    trialEndsAt: null,
    entitlementProfileRevision: 0,
    moduleEntitlements: [],
  };
  const jwtService = {
    verifyAsync: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    userRoleOverride: {
      findUnique: jest.fn(),
    },
  };
  let guard: TestJwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-a',
      email: 'stale@example.test',
      role: UserRole.OWNER,
      isPlatformAdmin: false,
      tenantId: 'stale-tenant',
      tenantSlug: 'stale-tenant',
      accessScope: 'NETWORK',
      allowedStoreIds: ['foreign-store'],
    });
    prisma.userRoleOverride.findUnique.mockResolvedValue(null);
    guard = new TestJwtAuthGuard(
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
      new AccessScopeService(),
      new TenantExecutionPolicyService(),
      new ConfigService({
        ACCESS_SCOPE_ENFORCEMENT_MODE: 'ENFORCED',
        RELEASE_SHA: 'a'.repeat(40),
      }),
    );
  });

  it('reloads the current scope from PostgreSQL instead of trusting JWT grants', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.MANAGER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'STORES',
      storeAccesses: [
        {
          storeId: 'a1',
          store: {
            tenantId: 'tenant-a',
          },
        },
      ],
      tenant: admittedTenant,
    });

    await expect(guard.verify('token')).resolves.toMatchObject({
      id: 'user-a',
      tenantId: 'tenant-a',
      accessScope: 'STORES',
      allowedStoreIds: ['a1'],
    });
  });

  it('keeps missing persisted scope fail-closed in SHADOW mode', async () => {
    guard = new TestJwtAuthGuard(
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
      new AccessScopeService(),
      new TenantExecutionPolicyService(),
      new ConfigService({
        ACCESS_SCOPE_ENFORCEMENT_MODE: 'SHADOW',
        RELEASE_SHA: 'a'.repeat(40),
      }),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.MANAGER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: null,
      storeAccesses: [],
      tenant: admittedTenant,
    });

    await expect(guard.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    {
      accessScope: null,
      storeAccesses: [],
    },
    {
      accessScope: 'STORES',
      storeAccesses: [],
    },
    {
      accessScope: 'NETWORK',
      storeAccesses: [
        {
          storeId: 'a1',
          store: {
            tenantId: 'tenant-a',
          },
        },
      ],
    },
    {
      accessScope: 'STORES',
      storeAccesses: [
        {
          storeId: 'b1',
          store: {
            tenantId: 'tenant-b',
          },
        },
      ],
    },
  ])('rejects an invalid persisted scope: %p', async (persistedScope) => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.MANAGER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      ...persistedScope,
      tenant: admittedTenant,
    });

    await expect(guard.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a valid JWT while its tenant is still provisioning', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.OWNER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'NETWORK',
      storeAccesses: [],
      tenant: {
        ...admittedTenant,
        onboardingStatus: TenantOnboardingStatus.PROVISIONING,
      },
    });

    await expect(guard.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enforces module read access for an external tenant from fresh persisted entitlements', async () => {
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.OWNER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'NETWORK',
      storeAccesses: [],
      tenant: {
        ...admittedTenant,
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date(now - 60_000),
        trialEndsAt: new Date(now + 60_000),
        entitlementProfileRevision: 1,
        moduleEntitlements: Object.values(TenantModule).map((module) => ({
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: new Date(now - 60_000),
          validUntil: new Date(now + 60_000),
          profileRevision: 1,
        })),
      },
    });

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'GET',
          path: '/products',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('blocks external outbound effects even when the role capability allows the route', async () => {
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.OWNER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'NETWORK',
      storeAccesses: [],
      tenant: {
        ...admittedTenant,
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date(now - 60_000),
        trialEndsAt: new Date(now + 60_000),
        entitlementProfileRevision: 1,
        moduleEntitlements: Object.values(TenantModule).map((module) => ({
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: new Date(now - 60_000),
          validUntil: new Date(now + 60_000),
          profileRevision: 1,
        })),
      },
    });

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          path: '/reports/email',
        }),
      ),
    ).rejects.toThrow(
      'Tenant module action is not admitted: ENTITLEMENT_OUTBOUND_DISABLED',
    );
    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          path: '/guests/gamification/bonus-ledger/dispatch',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          path: '/integrations/langame/sync',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects every unclassified authenticated route for an external tenant', async () => {
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.OWNER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'NETWORK',
      storeAccesses: [],
      tenant: {
        ...admittedTenant,
        customerStage: TenantCustomerStage.PILOT,
        trialStartsAt: new Date(now - 60_000),
        trialEndsAt: new Date(now + 60_000),
        entitlementProfileRevision: 1,
        moduleEntitlements: Object.values(TenantModule).map((module) => ({
          module,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: new Date(now - 60_000),
          validUntil: new Date(now + 60_000),
          profileRevision: 1,
        })),
      },
    });

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'GET',
          path: '/marketing',
        }),
      ),
    ).rejects.toThrow(
      'Tenant module route is not admitted: TENANT_MODULE_ROUTE_UNCLASSIFIED',
    );
    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'GET',
          path: '/auth/me',
        }),
      ),
    ).resolves.toBe(true);
  });

  it('does not require module rows from the existing INTERNAL tenant during migration adoption', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      email: 'current@example.test',
      fullName: 'Current User',
      role: UserRole.OWNER,
      customRoleId: null,
      customRole: null,
      isActive: true,
      isPlatformAdmin: false,
      tenantId: 'tenant-a',
      accessScope: 'NETWORK',
      storeAccesses: [],
      tenant: admittedTenant,
    });

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          path: '/products',
        }),
      ),
    ).resolves.toBe(true);
  });
});
