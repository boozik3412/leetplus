import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  TenantCustomerStage,
  TenantLifecycleStatus,
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
});
