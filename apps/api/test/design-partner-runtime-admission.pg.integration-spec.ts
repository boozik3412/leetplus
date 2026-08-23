import { randomUUID } from 'node:crypto';
import { assertDesignPartnerDatabaseAdmission } from '../src/config/design-partner-runtime-policy';
import { PrismaService } from '../src/prisma/prisma.service';

const REQUIRED_CONFIRMATION =
  'run-design-partner-runtime-admission-postgres-fixture';
const integrationEnabled =
  process.env.DESIGN_PARTNER_RUNTIME_ADMISSION_PG_CONFIRM ===
  REQUIRED_CONFIRMATION;
const describePostgres = integrationEnabled ? describe : describe.skip;
const OWNER_CAPABILITIES = [
  'view_dashboard',
  'view_reports',
  'view_assortment_reports',
  'view_assortment_products',
  'view_assortment_catalog',
  'view_assortment_stores',
  'view_staff_knowledge',
  'edit_staff_knowledge',
  'review_staff_knowledge',
  'publish_staff_knowledge',
  'manage_users',
] as const;

describePostgres('design-partner runtime PostgreSQL admission', () => {
  let prisma: PrismaService;
  let tenantId: string | null = null;

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
    expect(await prisma.tenant.count()).toBe(0);
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.platformAdminAuditEvent.deleteMany({ where: { tenantId } });
      await prisma.userInvite.deleteMany({ where: { tenantId } });
      await prisma.userRoleOverride.deleteMany({ where: { tenantId } });
      await prisma.store.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma?.$disconnect();
  });

  it('admits the exact suspended receipt topology and rejects malformed token evidence', async () => {
    const suffix = randomUUID();
    const tenantSlug = `dp-runtime-admission-${suffix}`;
    const tenantDomain = `${tenantSlug}.leetplus.ru`;
    const now = new Date();
    const inviteExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const accessExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Design Partner Runtime Admission',
        slug: tenantSlug,
        domain: tenantDomain,
        status: 'SUSPENDED',
      },
      select: { id: true },
    });
    tenantId = tenant.id;
    const store = await prisma.store.create({
      data: {
        tenantId,
        name: 'Design Partner Store',
        publicSlug: `dp-store-${suffix}`,
        isActive: false,
        gamificationEnabled: false,
      },
      select: { id: true },
    });
    await prisma.userRoleOverride.create({
      data: {
        tenantId,
        role: 'OWNER',
        permissions: [...OWNER_CAPABILITIES],
      },
    });
    const invite = await prisma.userInvite.create({
      data: {
        tenantId,
        email: 'runtime-admission-owner@invalid.example',
        fullName: 'Synthetic Owner',
        role: 'OWNER',
        accessScope: 'NETWORK',
        storeIds: [],
        tokenHash: 'c'.repeat(64),
        expiresAt: inviteExpiresAt,
      },
      select: { id: true },
    });
    await prisma.platformAdminAuditEvent.create({
      data: {
        tenantId,
        action: 'SINGLE_DESIGN_PARTNER_PROVISIONED',
        targetType: 'TENANT',
        targetId: tenantId,
        reason: 'Disposable runtime admission fixture',
        metadata: {
          profileVersion: 'SINGLE_DESIGN_PARTNER_V1',
          partnerAlias: 'DP_RUNTIME_ADMISSION',
          storeId: store.id,
          dataMode: 'MANUAL_ONLY',
          accessExpiresAt: accessExpiresAt.toISOString(),
          manifestDigest: 'a'.repeat(64),
          manifestHmacKeyVersion: 'v1',
          ownerInviteId: invite.id,
          ownerInviteExpiresAt: inviteExpiresAt.toISOString(),
          ownerInviteDigest: 'b'.repeat(64),
        },
      },
    });

    await expect(
      assertDesignPartnerDatabaseAdmission(
        prisma,
        isolatedModeConfig(tenantSlug, tenantDomain),
        now,
      ),
    ).resolves.toBeUndefined();

    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { tokenHash: 'not-a-sha256-token-hash' },
    });
    await expect(
      assertDesignPartnerDatabaseAdmission(
        prisma,
        isolatedModeConfig(tenantSlug, tenantDomain),
        now,
      ),
    ).rejects.toThrow(/one exact suspended tenant/);
  });
});

function isolatedModeConfig(tenantSlug: string, tenantDomain: string) {
  return {
    get: (key: string) => {
      if (key === 'DESIGN_PARTNER_ISOLATED_MODE') return 'true';
      if (key === 'DESIGN_PARTNER_TENANT_SLUG') return tenantSlug;
      if (key === 'DESIGN_PARTNER_TENANT_DOMAIN') return tenantDomain;
      return undefined;
    },
  };
}

function assertSafeIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for design-partner PostgreSQL admission smoke',
    );
  }
  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  if (
    !localHosts.has(parsed.hostname) ||
    !/(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName)
  ) {
    throw new Error(
      'Refusing design-partner admission fixtures outside a local CI/test database',
    );
  }
}
