import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PlatformNetworkService } from '../src/admin/platform-network.service';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { EmailVerificationService } from '../src/auth/email-verification.service';
import { IdentityEmailClaimService } from '../src/auth/identity-email-claim.service';
import { InitialOwnerInviteDeliveryGateService } from '../src/auth/initial-owner-invite-delivery-gate.service';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { TenantExecutionPolicyService } from '../src/tenancy/tenant-execution-policy.service';

const REQUIRED_CONFIRMATION = 'run-platform-network-postgres-fixtures';
const integrationEnabled =
  process.env.PLATFORM_NETWORK_PG_CONFIRM === REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const FINGERPRINT_KEY = 'platform-network-postgres-fingerprint-key-aaaaaaaa';
const PASSWORD = 'Strong-network-owner-2026!';

jest.setTimeout(30_000);

describePostgres('platform network PostgreSQL workflow', () => {
  let prisma: PrismaService;
  let networks: PlatformNetworkService;
  let auth: AuthService;
  let actor: AuthenticatedUser;
  const runId = randomUUID().slice(0, 8);
  const slugPrefix = `platform-network-pg-${runId}`;
  const config = {
    get: (key: string) =>
      ({
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: FINGERPRINT_KEY,
        IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY_VERSION: 'v1',
        WEB_URL: 'https://leetplus.test',
      })[key],
  } as ConfigService;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    await prisma.$connect();

    const adminTenant = await prisma.tenant.create({
      data: {
        name: 'Platform network authority',
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
        email: `${slugPrefix}-admin@example.test`,
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
      tenantId: adminTenant.id,
      isPlatformAdmin: true,
      isActive: true,
    } as AuthenticatedUser;

    networks = new PlatformNetworkService(prisma, config);
    auth = new AuthService(
      prisma,
      new PasswordService(),
      new JwtService({ secret: randomBytes(32).toString('base64url') }),
      {} as EmailVerificationService,
      config,
      new AccessScopeService(),
      new TenantExecutionPolicyService(),
      new IdentityEmailClaimService(config),
      new InitialOwnerInviteDeliveryGateService(prisma),
    );
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
    // Deleted networks keep their audit rows with tenantId NULL; remove them by
    // actor before the actor row is gone, so the shared smoke database stays
    // empty for the later clean-database checks in the same CI job.
    if (actor?.id) {
      await prisma.platformAdminAuditEvent.deleteMany({
        where: { actorUserId: actor.id },
      });
    }
    if (tenantIds.length > 0) {
      await prisma.$transaction([
        prisma.identityEmailClaim.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.platformAdminAuditEvent.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.userInvite.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.store.deleteMany({ where: { tenantId: { in: tenantIds } } }),
        prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } }),
        prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      ]);
    }
    await prisma.$disconnect();
  });

  it('creates an onboarding network whose open owner link seats exactly one owner', async () => {
    const tenantSlug = `${slugPrefix}-owner`;
    const created = await networks.create(actor, {
      tenantName: 'Тестовая сеть',
      tenantSlug,
      linkExpiresInDays: 7,
    });

    expect(created.tenant).toMatchObject({
      slug: tenantSlug,
      status: 'ACTIVE',
      customerStage: 'PILOT',
      onboardingStatus: 'ONBOARDING',
      trialEndsAt: '9999-12-31T00:00:00.000Z',
    });
    const token = new URL(created.ownerLink.registrationUrl).hash.replace(
      '#invite=',
      '',
    );
    expect(created.ownerLink.registrationUrl).toBe(
      `https://leetplus.test/register#invite=${token}`,
    );

    const [invite, entitlements, audit] = await Promise.all([
      prisma.userInvite.findUniqueOrThrow({
        where: { id: created.ownerLink.inviteId },
      }),
      prisma.tenantModuleEntitlement.findMany({
        where: { tenantId: created.tenant.id },
      }),
      prisma.platformAdminAuditEvent.findFirstOrThrow({
        where: {
          tenantId: created.tenant.id,
          action: 'PLATFORM_NETWORK_CREATED',
        },
      }),
    ]);
    expect(invite).toMatchObject({
      email: null,
      role: 'OWNER',
      accessScope: 'NETWORK',
      deliveryMode: 'LINK',
      createdByUserId: actor.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    });
    expect(entitlements).toHaveLength(6);
    await expect(
      prisma.store.findMany({
        where: { tenantId: created.tenant.id },
        select: {
          name: true,
          timeZone: true,
          isActive: true,
          gamificationEnabled: true,
          backgroundExecutionEnabled: true,
        },
      }),
    ).resolves.toEqual([
      {
        name: 'Компьютерный клуб 1',
        timeZone: 'Europe/Moscow',
        isActive: true,
        gamificationEnabled: false,
        backgroundExecutionEnabled: false,
      },
    ]);
    expect(
      entitlements.every(
        (row) => row.readEnabled && row.writeEnabled && !row.outboundEnabled,
      ),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(token);

    await expect(auth.getInvite(token)).resolves.toMatchObject({
      email: null,
      role: 'OWNER',
      scope: 'NETWORK',
      tenant: { slug: tenantSlug },
    });
    const ownerEmail = `${slugPrefix}-owner@example.test`;
    await auth.acceptInvite(token, {
      email: ownerEmail,
      fullName: 'Владелец Тестовый',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });

    const [owner, claim, tenant] = await Promise.all([
      prisma.user.findFirstOrThrow({
        where: { tenantId: created.tenant.id, role: 'OWNER' },
      }),
      prisma.identityEmailClaim.findFirstOrThrow({
        where: { tenantId: created.tenant.id, claimType: 'USER' },
      }),
      prisma.tenant.findUniqueOrThrow({ where: { id: created.tenant.id } }),
    ]);
    expect(owner).toMatchObject({
      email: ownerEmail,
      accessScope: 'NETWORK',
      isPlatformAdmin: false,
    });
    expect(claim.subjectId).toBe(owner.id);
    expect(tenant.onboardingStatus).toBe('ONBOARDING');

    // The network now has an owner: no new owner link, and the old one is spent.
    await expect(
      networks.issueOwnerLink(actor, created.tenant.id, {
        confirmation: tenantSlug,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(auth.getInvite(token)).rejects.toThrow();

    // A registered owner holds an identity claim the runtime may not drop.
    await expect(
      networks.delete(actor, created.tenant.id, {
        confirmation: `DELETE ${tenantSlug}`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reissues the owner link, refusing the revoked one and a non-admin issuer', async () => {
    const tenantSlug = `${slugPrefix}-reissue`;
    const created = await networks.create(actor, {
      tenantName: 'Сеть для перевыпуска',
      tenantSlug,
      accessDays: 30,
    });
    const firstToken = new URL(created.ownerLink.registrationUrl).hash.slice(
      '#invite='.length,
    );
    const reissued = await networks.issueOwnerLink(actor, created.tenant.id, {
      confirmation: tenantSlug,
      linkExpiresInDays: 3,
    });
    expect(reissued.revokedInviteIds).toEqual([created.ownerLink.inviteId]);
    await expect(auth.getInvite(firstToken)).rejects.toThrow();

    // A forged OWNER link written by someone other than a platform admin.
    const forgedToken = randomBytes(32).toString('base64url');
    await prisma.userInvite.updateMany({
      where: { id: reissued.ownerLink.inviteId },
      data: { revokedAt: new Date() },
    });
    await prisma.userInvite.create({
      data: {
        tenantId: created.tenant.id,
        email: null,
        role: 'OWNER',
        accessScope: 'NETWORK',
        tokenHash: createHash('sha256').update(forgedToken).digest('hex'),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdByUserId: null,
        deliveryMode: 'LINK',
      },
    });
    await expect(
      auth.acceptInvite(forgedToken, {
        email: `${slugPrefix}-forged@example.test`,
        fullName: 'Чужой Владелец',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      await prisma.user.count({ where: { tenantId: created.tenant.id } }),
    ).toBe(0);
  });

  it('deletes an empty network with its accounts and refuses one with products', async () => {
    const legacy = await prisma.tenant.create({
      data: {
        name: 'Пустая сеть',
        slug: `${slugPrefix}-empty`,
        status: 'ACTIVE',
        customerStage: 'INTERNAL',
        onboardingStatus: 'ACTIVE',
      },
      select: { id: true, slug: true },
    });
    await prisma.user.create({
      data: {
        tenantId: legacy.id,
        email: `${slugPrefix}-legacy@example.test`,
        passwordHash: 'not-a-login-fixture',
        role: 'OWNER',
        accessScope: 'NETWORK',
        isActive: true,
      },
    });
    await expect(
      networks.delete(actor, legacy.id, { confirmation: legacy.slug }),
    ).rejects.toThrow('DELETE');
    await expect(
      networks.delete(actor, legacy.id, {
        confirmation: `DELETE ${legacy.slug}`,
      }),
    ).resolves.toMatchObject({ ok: true, deletedUsers: 1 });
    expect(await prisma.tenant.count({ where: { id: legacy.id } })).toBe(0);
    expect(
      await prisma.platformAdminAuditEvent.count({
        where: { action: 'PLATFORM_NETWORK_DELETED', targetId: legacy.id },
      }),
    ).toBe(1);

    // A fresh network (temporary club, pending owner link) deletes whole.
    const fresh = await networks.create(actor, {
      tenantName: 'Свежая сеть',
      tenantSlug: `${slugPrefix}-fresh`,
    });
    await expect(
      networks.delete(actor, fresh.tenant.id, {
        confirmation: `DELETE ${slugPrefix}-fresh`,
      }),
    ).resolves.toMatchObject({
      ok: true,
      deletedUsers: 0,
      deletedInvites: 1,
      deletedStores: 1,
    });

    const withProducts = await networks.create(actor, {
      tenantName: 'Сеть с товарами',
      tenantSlug: `${slugPrefix}-goods`,
    });
    await prisma.product.create({
      data: {
        tenantId: withProducts.tenant.id,
        article: 'A-1',
        name: 'Энергетик',
        purchasePrice: 50,
        salePrice: 120,
      },
    });
    await expect(
      networks.delete(actor, withProducts.tenant.id, {
        confirmation: `DELETE ${slugPrefix}-goods`,
      }),
    ).rejects.toThrow('товары: 1');
    await prisma.product.deleteMany({
      where: { tenantId: withProducts.tenant.id },
    });

    await expect(
      networks.delete(actor, actor.tenantId, {
        confirmation: `DELETE ${slugPrefix}-authority`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function assertSafeIntegrationDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const host = new URL(databaseUrl).hostname;
  if (!['127.0.0.1', 'localhost', 'postgres'].includes(host)) {
    throw new Error('Platform network fixtures run only on a local database');
  }
}
