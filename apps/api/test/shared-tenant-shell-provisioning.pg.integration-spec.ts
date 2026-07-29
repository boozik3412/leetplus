import type { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { IdentityEmailClaimService } from '../src/auth/identity-email-claim.service';
import { SharedTenantProvisioningService } from '../src/admin/shared-tenant-provisioning.service';
import { PrismaService } from '../src/prisma/prisma.service';

const REQUIRED_CONFIRMATION =
  'run-shared-tenant-shell-provisioning-postgres-fixtures';
const integrationEnabled =
  process.env.SHARED_TENANT_SHELL_PROVISIONING_PG_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const FINGERPRINT_KEY =
  'shared-shell-postgres-fingerprint-key-aaaaaaaaaaaaaaaa';

describePostgres('shared tenant shell provisioning PostgreSQL boundary', () => {
  let prisma: PrismaService;
  let service: SharedTenantProvisioningService;
  let actor: AuthenticatedUser;
  const runId = randomUUID();
  const slugPrefix = `shared-shell-pg-${runId}`;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    await prisma.$connect();

    const existingFixtureCount = await prisma.tenant.count({
      where: { slug: { startsWith: slugPrefix } },
    });
    expect(existingFixtureCount).toBe(0);

    const adminTenant = await prisma.tenant.create({
      data: {
        name: 'Shared shell PostgreSQL fixture authority',
        slug: `${slugPrefix}-authority`,
        status: 'ACTIVE',
        customerStage: 'INTERNAL',
        onboardingStatus: 'ACTIVE',
      },
      select: { id: true },
    });
    const admin = await prisma.user.create({
      data: {
        tenantId: adminTenant.id,
        email: `${slugPrefix}-authority@example.test`,
        passwordHash: 'not-a-login-fixture',
        role: 'OWNER',
        accessScope: 'NETWORK',
        isActive: true,
        isPlatformAdmin: true,
      },
      select: { id: true },
    });
    actor = {
      id: admin.id,
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    const identityBoundary = new IdentityEmailClaimService({
      get: (key: string) => {
        if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY') {
          return FINGERPRINT_KEY;
        }
        if (key === 'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION') {
          return 'v1';
        }
        return undefined;
      },
    } as ConfigService);
    service = new SharedTenantProvisioningService(prisma, identityBoundary);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const tenants = await prisma.tenant.findMany({
      where: { slug: { startsWith: slugPrefix } },
      select: { id: true },
    });
    const tenantIds = tenants.map(({ id }) => id);
    if (tenantIds.length > 0) {
      await prisma.$transaction([
        prisma.identityEmailClaim.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.platformAdminAuditEvent.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.tenantModuleEntitlement.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.userInvite.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.userRoleOverride.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.store.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.user.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.tenant.deleteMany({
          where: { id: { in: tenantIds } },
        }),
      ]);
    }
    await prisma.$disconnect();
  });

  it('persists a replayable shell without invite, user, trial or raw identity output', async () => {
    const tenantSlug = `${slugPrefix}-single`;
    const email = `${slugPrefix}-owner@example.test`;
    const input = provisioningInput({
      tenantSlug,
      email,
      requestId: `${runId}-single`,
    });

    const created = await service.provision(actor, input);
    expect(created).toMatchObject({
      ok: true,
      decision: 'SHELL_PROVISIONED',
      replayed: false,
      tenant: {
        status: 'SUSPENDED',
        customerStage: 'PILOT',
        onboardingStatus: 'PROVISIONING',
        trialStartsAt: null,
        trialEndsAt: null,
      },
      store: {
        isActive: false,
        gamificationEnabled: false,
        backgroundExecutionEnabled: false,
      },
    });
    expect(JSON.stringify(created)).not.toContain(email);

    const replay = await service.provision(actor, {
      ...input,
      ownerEmail: `  ${email.toUpperCase()}  `,
    });
    expect(replay).toMatchObject({
      decision: 'ALREADY_PROVISIONED',
      replayed: true,
      tenant: { id: created.tenant.id },
      ownerIdentity: {
        reservationId: created.ownerIdentity.reservationId,
      },
    });

    const [
      tenant,
      storeCount,
      entitlementCount,
      overrideCount,
      userCount,
      inviteCount,
      claimCount,
      audit,
    ] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: created.tenant.id },
        select: {
          trialStartsAt: true,
          trialEndsAt: true,
          status: true,
          customerStage: true,
          onboardingStatus: true,
        },
      }),
      prisma.store.count({ where: { tenantId: created.tenant.id } }),
      prisma.tenantModuleEntitlement.count({
        where: {
          tenantId: created.tenant.id,
          readEnabled: true,
          writeEnabled: true,
          outboundEnabled: false,
          validFrom: null,
          validUntil: null,
          profileRevision: 1,
        },
      }),
      prisma.userRoleOverride.count({
        where: { tenantId: created.tenant.id, role: 'OWNER' },
      }),
      prisma.user.count({ where: { tenantId: created.tenant.id } }),
      prisma.userInvite.count({ where: { tenantId: created.tenant.id } }),
      prisma.identityEmailClaim.count({
        where: {
          tenantId: created.tenant.id,
          claimType: 'INVITE',
          subjectId: created.ownerIdentity.reservationId,
          revision: 1,
        },
      }),
      prisma.platformAdminAuditEvent.findFirstOrThrow({
        where: {
          tenantId: created.tenant.id,
          action: 'SHARED_BETA_TENANT_SHELL_PROVISIONED',
        },
        select: { after: true, metadata: true },
      }),
    ]);
    expect(tenant).toMatchObject({
      trialStartsAt: null,
      trialEndsAt: null,
      status: 'SUSPENDED',
      customerStage: 'PILOT',
      onboardingStatus: 'PROVISIONING',
    });
    expect({
      storeCount,
      entitlementCount,
      overrideCount,
      userCount,
      inviteCount,
      claimCount,
    }).toEqual({
      storeCount: 1,
      entitlementCount: 6,
      overrideCount: 1,
      userCount: 0,
      inviteCount: 0,
      claimCount: 1,
    });
    expect(JSON.stringify(audit)).not.toContain(email);
    expect(JSON.stringify(audit)).not.toMatch(
      /registrationUrl|tokenHash|ciphertext/u,
    );
  });

  it('serializes 100 case-variant reservations across two tenant shells with no loser residue', async () => {
    const sharedEmail = `${slugPrefix}-collision@example.test`;
    const leftSlug = `${slugPrefix}-left`;
    const rightSlug = `${slugPrefix}-right`;
    const commands = Array.from({ length: 100 }, (_, index) => {
      const left = index % 2 === 0;
      return service.provision(
        actor,
        provisioningInput({
          tenantSlug: left ? leftSlug : rightSlug,
          email: index % 4 < 2 ? sharedEmail : ` ${sharedEmail.toUpperCase()} `,
          requestId: `${runId}-${left ? 'left' : 'right'}`,
        }),
      );
    });

    const settlements = await Promise.allSettled(commands);
    const fulfilled = settlements.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = settlements.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(50);
    expect(rejected).toHaveLength(50);
    for (const rejection of rejected) {
      expect(rejection.reason).toBeInstanceOf(ConflictException);
      const response = (rejection.reason as ConflictException).getResponse();
      expect(response).toMatchObject({
        reasonCode: 'IDENTITY_EMAIL_UNAVAILABLE',
      });
      expect(JSON.stringify(response)).not.toContain(sharedEmail);
    }
    const fulfilledReceipts = fulfilled.map((result) => result.value);
    expect(
      fulfilledReceipts.filter(
        (receipt) => receipt.decision === 'SHELL_PROVISIONED',
      ),
    ).toHaveLength(1);
    expect(
      new Set(fulfilledReceipts.map((receipt) => receipt.tenant.id)).size,
    ).toBe(1);

    const persistedTenants = await prisma.tenant.findMany({
      where: { slug: { in: [leftSlug, rightSlug] } },
      select: { id: true, slug: true },
    });
    expect(persistedTenants).toHaveLength(1);
    const winner = persistedTenants[0];
    if (!winner) {
      throw new Error('Expected one winning tenant shell');
    }
    const loserSlug = winner.slug === leftSlug ? rightSlug : leftSlug;
    const [
      loserCount,
      storeCount,
      entitlementCount,
      overrideCount,
      userCount,
      inviteCount,
      claimCount,
      globalCanonicalClaimCount,
      auditCount,
      loserAuditCount,
    ] = await Promise.all([
      prisma.tenant.count({ where: { slug: loserSlug } }),
      prisma.store.count({ where: { tenantId: winner.id } }),
      prisma.tenantModuleEntitlement.count({
        where: { tenantId: winner.id },
      }),
      prisma.userRoleOverride.count({ where: { tenantId: winner.id } }),
      prisma.user.count({ where: { tenantId: winner.id } }),
      prisma.userInvite.count({ where: { tenantId: winner.id } }),
      prisma.identityEmailClaim.count({ where: { tenantId: winner.id } }),
      prisma.identityEmailClaim.count({
        where: { emailCanonical: sharedEmail },
      }),
      prisma.platformAdminAuditEvent.count({
        where: {
          tenantId: winner.id,
          action: 'SHARED_BETA_TENANT_SHELL_PROVISIONED',
        },
      }),
      prisma.platformAdminAuditEvent.count({
        where: {
          requestId: `${runId}-${winner.slug === leftSlug ? 'right' : 'left'}`,
          action: 'SHARED_BETA_TENANT_SHELL_PROVISIONED',
        },
      }),
    ]);
    expect({
      loserCount,
      storeCount,
      entitlementCount,
      overrideCount,
      userCount,
      inviteCount,
      claimCount,
      globalCanonicalClaimCount,
      auditCount,
      loserAuditCount,
    }).toEqual({
      loserCount: 0,
      storeCount: 1,
      entitlementCount: 6,
      overrideCount: 1,
      userCount: 0,
      inviteCount: 0,
      claimCount: 1,
      globalCanonicalClaimCount: 1,
      auditCount: 1,
      loserAuditCount: 0,
    });
  });

  function provisioningInput({
    tenantSlug,
    email,
    requestId,
  }: {
    tenantSlug: string;
    email: string;
    requestId: string;
  }) {
    return {
      confirmation: `PROVISION ${tenantSlug}`,
      requestId,
      reason: 'Exercise the shared tenant shell PostgreSQL boundary',
      supportTicket: 'PG-SHELL',
      tenantName: `Fixture ${tenantSlug}`,
      tenantSlug,
      cohortKey: 'shared-shell-pg',
      supportOwnerUserId: actor.id,
      storeName: 'Fixture Store',
      storeTimeZone: 'Asia/Yekaterinburg',
      ownerEmail: email,
    };
  }
});

function assertSafeIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for shared shell PostgreSQL fixtures',
    );
  }
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/u, '').toLowerCase();
  if (
    !localHosts.has(parsed.hostname) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/u.test(databaseName)
  ) {
    throw new Error(
      'Refusing shared shell fixtures outside a local CI/test database',
    );
  }
}
