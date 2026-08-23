import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';

const DESIGN_PARTNER_ISOLATED_MODE = 'DESIGN_PARTNER_ISOLATED_MODE';
const DESIGN_PARTNER_PROFILE_VERSION = 'SINGLE_DESIGN_PARTNER_V1';
const DESIGN_PARTNER_PROVISION_ACTION = 'SINGLE_DESIGN_PARTNER_PROVISIONED';
const DESIGN_PARTNER_INVITE_ROTATE_ACTION =
  'SINGLE_DESIGN_PARTNER_INVITE_ROTATED';
const DESIGN_PARTNER_MANIFEST_HMAC_KEY_VERSION = 'v1';
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const DESIGN_PARTNER_BOOTSTRAP_OWNER_CAPABILITIES = [
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

function resolveIsolatedMode(configured: unknown) {
  return typeof configured === 'string'
    ? configured.trim().toLowerCase()
    : configured === true
      ? 'true'
      : configured === false || configured == null
        ? ''
        : 'invalid';
}

/**
 * Token-only scheduled HTTP routes are intentionally unavailable in the
 * isolated design-partner contour. A malformed non-empty marker also denies
 * access so a typo cannot silently re-enable an all-tenant execution path.
 */
export function assertScheduledHttpAllowed(
  configService: Pick<ConfigService, 'get'>,
): void {
  const configured = configService.get<unknown>(DESIGN_PARTNER_ISOLATED_MODE);
  const mode = resolveIsolatedMode(configured);

  if (!mode || mode === 'false') {
    return;
  }

  throw new ServiceUnavailableException(
    'Scheduled HTTP execution is disabled in design-partner isolated mode',
  );
}

export function assertStandaloneProcessAllowed(
  env: Record<string, string | undefined>,
  enabledKey: string,
  requiredSettings: Readonly<Record<string, string>> = {},
  isolatedApiUrlKey?: string,
): void {
  const mode = resolveIsolatedMode(env[DESIGN_PARTNER_ISOLATED_MODE]);

  if (!mode || mode === 'false') {
    return;
  }
  if (mode !== 'true') {
    throw new Error(
      'Standalone process blocked by invalid DESIGN_PARTNER_ISOLATED_MODE',
    );
  }
  if (env.DESIGN_PARTNER_MANIFEST_HMAC_KEY?.trim()) {
    throw new Error(
      'Standalone process blocked: DESIGN_PARTNER_MANIFEST_HMAC_KEY must be absent from design-partner runtime',
    );
  }
  if (env[enabledKey]?.trim() !== 'true') {
    throw new Error(
      `Standalone process blocked: ${enabledKey}=true requires a separate design-partner GO`,
    );
  }

  for (const [key, expected] of Object.entries(requiredSettings)) {
    if (env[key]?.trim() !== expected) {
      throw new Error(
        `Standalone process blocked: ${key} must equal ${expected}`,
      );
    }
  }

  if (isolatedApiUrlKey) {
    const tenantSlug = env.DESIGN_PARTNER_TENANT_SLUG?.trim();
    if (!tenantSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) {
      throw new Error(
        'Standalone process blocked: DESIGN_PARTNER_TENANT_SLUG must be an exact lowercase slug',
      );
    }
    const expectedOrigin = `https://api-${tenantSlug}.leetplus.ru`;
    const configuredUrl = env[isolatedApiUrlKey]?.trim();
    let configuredOrigin: URL;
    try {
      configuredOrigin = new URL(configuredUrl ?? '');
    } catch {
      throw new Error(
        `Standalone process blocked: ${isolatedApiUrlKey} must equal ${expectedOrigin}`,
      );
    }
    if (
      configuredOrigin.origin !== expectedOrigin ||
      configuredOrigin.protocol !== 'https:' ||
      configuredOrigin.username ||
      configuredOrigin.password ||
      configuredOrigin.pathname !== '/' ||
      configuredOrigin.search ||
      configuredOrigin.hash
    ) {
      throw new Error(
        `Standalone process blocked: ${isolatedApiUrlKey} must equal ${expectedOrigin}`,
      );
    }
  }
}

/**
 * Binds the isolated runtime marker to the database it is about to serve.
 * The mode may start against an empty database before provisioning, or against
 * exactly one provisioned-but-suspended design-partner tenant. Any shared,
 * partially provisioned or accidentally activated topology aborts startup.
 */
export async function assertDesignPartnerDatabaseAdmission(
  prisma: Pick<PrismaService, 'platformAdminAuditEvent' | 'tenant'>,
  configService: Pick<ConfigService, 'get'>,
  now = new Date(),
): Promise<void> {
  const mode = resolveIsolatedMode(
    configService.get<unknown>(DESIGN_PARTNER_ISOLATED_MODE),
  );
  const expectedTenantSlug = configService
    .get<string>('DESIGN_PARTNER_TENANT_SLUG')
    ?.trim();
  const expectedTenantDomain = configService
    .get<string>('DESIGN_PARTNER_TENANT_DOMAIN')
    ?.trim();
  const markers = await prisma.platformAdminAuditEvent.findMany({
    where: { action: DESIGN_PARTNER_PROVISION_ACTION },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: {
      tenantId: true,
      metadata: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          domain: true,
          status: true,
          stores: {
            select: {
              isActive: true,
              gamificationEnabled: true,
            },
          },
          userRoleOverrides: {
            select: {
              role: true,
              permissions: true,
            },
          },
          userAccessRoles: {
            select: { id: true },
          },
          users: {
            select: {
              role: true,
              accessScope: true,
              customRoleId: true,
              isActive: true,
              isPlatformAdmin: true,
              storeAccesses: {
                select: { storeId: true },
              },
            },
          },
          userInvites: {
            select: {
              id: true,
              email: true,
              role: true,
              accessScope: true,
              customRoleId: true,
              storeIds: true,
              tokenHash: true,
              acceptedAt: true,
              acceptedByUserId: true,
              expiresAt: true,
            },
          },
          platformAdminAuditEvents: {
            where: { action: DESIGN_PARTNER_INVITE_ROTATE_ACTION },
            select: {
              targetId: true,
              metadata: true,
            },
          },
          integrationSources: {
            select: { id: true },
          },
          integrationCredentials: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (mode !== 'true' && markers.length === 0) {
    return;
  }
  if (mode !== 'true') {
    throw new Error(
      'Design-partner provisioning marker requires DESIGN_PARTNER_ISOLATED_MODE=true',
    );
  }

  const tenantCount = await prisma.tenant.count();
  if (markers.length === 0) {
    if (tenantCount !== 0) {
      throw new Error(
        'Design-partner isolated mode may bootstrap only an empty tenant database',
      );
    }
    return;
  }

  const marker = markers[0];
  const metadata =
    marker.metadata &&
    typeof marker.metadata === 'object' &&
    !Array.isArray(marker.metadata)
      ? (marker.metadata as Record<string, unknown>)
      : null;
  const tenant = marker.tenant;
  const ownerOverride = tenant?.userRoleOverrides?.[0];
  const liveOwnerInvites =
    tenant?.userInvites?.filter(
      (invite) =>
        invite.role === 'OWNER' &&
        invite.accessScope === 'NETWORK' &&
        invite.customRoleId === null &&
        invite.storeIds.length === 0 &&
        invite.acceptedAt === null &&
        invite.acceptedByUserId === null &&
        invite.expiresAt > now,
    ) ?? [];
  const allInvitesAreExpected =
    tenant?.userInvites?.every(
      (invite) =>
        invite.role === 'OWNER' &&
        invite.accessScope === 'NETWORK' &&
        invite.customRoleId === null &&
        invite.storeIds.length === 0 &&
        invite.acceptedAt === null &&
        invite.acceptedByUserId === null,
    ) ?? false;
  const exactOwnerCapabilities =
    ownerOverride?.permissions?.length ===
      DESIGN_PARTNER_BOOTSTRAP_OWNER_CAPABILITIES.length &&
    [...(ownerOverride?.permissions ?? [])]
      .sort()
      .every(
        (permission, index) =>
          permission ===
          [...DESIGN_PARTNER_BOOTSTRAP_OWNER_CAPABILITIES].sort()[index],
      );
  const accessExpiresAt =
    typeof metadata?.accessExpiresAt === 'string'
      ? new Date(metadata.accessExpiresAt)
      : null;
  const initialInviteExpiresAt =
    typeof metadata?.ownerInviteExpiresAt === 'string'
      ? new Date(metadata.ownerInviteExpiresAt)
      : null;
  const initialInviteId =
    typeof metadata?.ownerInviteId === 'string' ? metadata.ownerInviteId : null;
  const inviteReceiptExpiries = new Map<string, Date>();
  if (
    initialInviteId &&
    initialInviteExpiresAt &&
    Number.isFinite(initialInviteExpiresAt.getTime()) &&
    metadata?.manifestHmacKeyVersion ===
      DESIGN_PARTNER_MANIFEST_HMAC_KEY_VERSION &&
    typeof metadata?.ownerInviteDigest === 'string' &&
    SHA256_HEX_PATTERN.test(metadata.ownerInviteDigest)
  ) {
    inviteReceiptExpiries.set(initialInviteId, initialInviteExpiresAt);
  }
  let rotationReceiptsAreExact = true;
  const rotationRequestIds = new Set<string>();
  for (const rotation of tenant?.platformAdminAuditEvents ?? []) {
    const rotationMetadata =
      rotation.metadata &&
      typeof rotation.metadata === 'object' &&
      !Array.isArray(rotation.metadata)
        ? (rotation.metadata as Record<string, unknown>)
        : null;
    const inviteExpiresAt =
      typeof rotationMetadata?.inviteExpiresAt === 'string'
        ? new Date(rotationMetadata.inviteExpiresAt)
        : null;
    if (
      typeof rotation.targetId !== 'string' ||
      !inviteExpiresAt ||
      !Number.isFinite(inviteExpiresAt.getTime()) ||
      rotationMetadata?.profileVersion !== DESIGN_PARTNER_PROFILE_VERSION ||
      rotationMetadata?.manifestHmacKeyVersion !==
        DESIGN_PARTNER_MANIFEST_HMAC_KEY_VERSION ||
      typeof rotationMetadata?.requestId !== 'string' ||
      rotationMetadata.requestId.length < 8 ||
      rotationRequestIds.has(rotationMetadata.requestId) ||
      typeof rotationMetadata?.rotationDigest !== 'string' ||
      !SHA256_HEX_PATTERN.test(rotationMetadata.rotationDigest) ||
      inviteReceiptExpiries.has(rotation.targetId)
    ) {
      rotationReceiptsAreExact = false;
      continue;
    }
    rotationRequestIds.add(rotationMetadata.requestId);
    inviteReceiptExpiries.set(rotation.targetId, inviteExpiresAt);
  }
  const expectedOwnerEmail = tenant?.userInvites?.[0]?.email;
  const allInvitesHaveExactReceipt =
    rotationReceiptsAreExact &&
    typeof expectedOwnerEmail === 'string' &&
    expectedOwnerEmail === expectedOwnerEmail.trim().toLowerCase() &&
    tenant?.userInvites?.length === inviteReceiptExpiries.size &&
    tenant.userInvites.every((invite) => {
      const signedExpiry = inviteReceiptExpiries.get(invite.id);
      return (
        invite.email === expectedOwnerEmail &&
        SHA256_HEX_PATTERN.test(invite.tokenHash) &&
        signedExpiry !== undefined &&
        invite.expiresAt <= signedExpiry
      );
    });
  const allReceiptExpiriesWithinAccessWindow =
    accessExpiresAt !== null &&
    [...inviteReceiptExpiries.values()].every(
      (receiptExpiry) => receiptExpiry <= accessExpiresAt,
    );
  if (
    markers.length !== 1 ||
    tenantCount !== 1 ||
    !tenant ||
    marker.tenantId !== tenant.id ||
    !expectedTenantSlug ||
    !expectedTenantDomain ||
    tenant.slug !== expectedTenantSlug ||
    tenant.domain !== expectedTenantDomain ||
    metadata?.profileVersion !== DESIGN_PARTNER_PROFILE_VERSION ||
    typeof metadata.manifestDigest !== 'string' ||
    !SHA256_HEX_PATTERN.test(metadata.manifestDigest) ||
    !accessExpiresAt ||
    !Number.isFinite(accessExpiresAt.getTime()) ||
    accessExpiresAt <= now ||
    tenant.status !== 'SUSPENDED' ||
    tenant.stores.length !== 1 ||
    tenant.stores[0].isActive ||
    tenant.stores[0].gamificationEnabled ||
    tenant.userRoleOverrides?.length !== 1 ||
    ownerOverride?.role !== 'OWNER' ||
    !exactOwnerCapabilities ||
    tenant.userAccessRoles?.length !== 0 ||
    tenant.users?.length !== 0 ||
    !allInvitesAreExpected ||
    !allInvitesHaveExactReceipt ||
    !allReceiptExpiriesWithinAccessWindow ||
    liveOwnerInvites.length !== 1 ||
    tenant.integrationSources?.length !== 0 ||
    tenant.integrationCredentials?.length !== 0
  ) {
    throw new Error(
      'Design-partner database admission requires one exact suspended tenant and one inactive store',
    );
  }
}
