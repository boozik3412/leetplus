import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  DESIGN_PARTNER_OWNER_CAPABILITIES,
  DESIGN_PARTNER_PROFILE_VERSION,
  DESIGN_PARTNER_INVITE_ROTATE_ACTION,
  DESIGN_PARTNER_PROVISION_ACTION,
  DESIGN_PARTNER_REQUIRED_ENV,
  DESIGN_PARTNER_SUSPEND_ACTION,
} from "./design-partner-access-profile.mjs";

const RESERVED_TENANT_SLUGS = new Set([
  "admin",
  "api",
  "demo",
  "game",
  "play",
  "public-demo",
  "www",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROTATION_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const DEFAULT_INVITE_TTL_HOURS = 72;
const MAX_HMAC_KEY_BYTES = 4096;
const MANIFEST_HMAC_KEY_VERSION = "v1";

export class DesignPartnerProvisioningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DesignPartnerProvisioningError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new DesignPartnerProvisioningError(code, message);
}

function requiredText(value, field, minimum = 1, maximum = 160) {
  if (typeof value !== "string") {
    fail("INVALID_MANIFEST", `${field} is required.`);
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    fail(
      "INVALID_MANIFEST",
      `${field} must contain ${minimum}-${maximum} characters.`,
    );
  }

  return normalized;
}

function optionalText(value, field, maximum = 500) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    fail("INVALID_MANIFEST", `${field} must be a string.`);
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length > maximum) {
    fail("INVALID_MANIFEST", `${field} must not exceed ${maximum} characters.`);
  }

  return normalized || null;
}

function normalizeTimeZone(value) {
  const timeZone = requiredText(value, "storeTimeZone", 3, 80);

  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone }).format(new Date());
  } catch {
    fail(
      "INVALID_MANIFEST",
      "storeTimeZone must be a supported IANA time zone.",
    );
  }

  return timeZone;
}

function normalizeExpiry(value, now, allowExpiredAccess) {
  const raw =
    value ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(raw);

  if (!Number.isFinite(expiresAt.getTime())) {
    fail("INVALID_MANIFEST", "accessExpiresAt must be an ISO timestamp.");
  }
  if (!allowExpiredAccess && expiresAt <= now) {
    fail("INVALID_MANIFEST", "accessExpiresAt must be a future ISO timestamp.");
  }

  if (expiresAt.getTime() - now.getTime() > 45 * 24 * 60 * 60 * 1000) {
    fail(
      "INVALID_MANIFEST",
      "accessExpiresAt must not be more than 45 days in the future.",
    );
  }

  return expiresAt;
}

export function normalizeDesignPartnerManifest(
  input,
  now = new Date(),
  { allowExpiredAccess = false } = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("INVALID_MANIFEST", "Manifest must be a JSON object.");
  }

  const tenantSlug = requiredText(input.tenantSlug, "tenantSlug", 3, 32)
    .toLowerCase()
    .trim();
  if (!SLUG_PATTERN.test(tenantSlug) || RESERVED_TENANT_SLUGS.has(tenantSlug)) {
    fail(
      "INVALID_MANIFEST",
      "tenantSlug must be a non-reserved lowercase slug.",
    );
  }

  const ownerEmail = requiredText(input.ownerEmail, "ownerEmail", 5, 254)
    .toLowerCase()
    .trim();
  if (!EMAIL_PATTERN.test(ownerEmail)) {
    fail("INVALID_MANIFEST", "ownerEmail must be a valid email address.");
  }

  const partnerAlias = requiredText(input.partnerAlias, "partnerAlias", 2, 48);
  if (!/^[A-Z0-9_-]+$/.test(partnerAlias)) {
    fail(
      "INVALID_MANIFEST",
      "partnerAlias must contain only A-Z, 0-9, underscore or hyphen.",
    );
  }

  const dataMode = requiredText(
    input.dataMode,
    "dataMode",
    7,
    16,
  ).toUpperCase();
  if (dataMode !== "MANUAL_ONLY" && dataMode !== "LANGAME") {
    fail("INVALID_MANIFEST", "dataMode must be MANUAL_ONLY or LANGAME.");
  }
  const langameDomain =
    optionalText(input.langameDomain, "langameDomain", 160)?.toLowerCase() ??
    null;
  const langameClubId = optionalText(input.langameClubId, "langameClubId", 160);
  if (
    dataMode === "LANGAME" &&
    (!langameDomain || !langameClubId || !/^[a-z0-9.-]+$/i.test(langameDomain))
  ) {
    fail(
      "INVALID_MANIFEST",
      "LANGAME dataMode requires langameDomain and langameClubId.",
    );
  }
  if (dataMode === "MANUAL_ONLY" && (langameDomain || langameClubId)) {
    fail(
      "INVALID_MANIFEST",
      "MANUAL_ONLY dataMode must not include Langame mapping.",
    );
  }

  return Object.freeze({
    profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
    partnerAlias,
    tenantName: requiredText(input.tenantName, "tenantName", 2, 120),
    tenantSlug,
    tenantDomain: `${tenantSlug}.leetplus.ru`,
    storeName: requiredText(input.storeName, "storeName", 2, 120),
    storePublicSlug: "club",
    storeAddress: optionalText(input.storeAddress, "storeAddress"),
    storeCity: optionalText(input.storeCity, "storeCity", 120),
    storeTimeZone: normalizeTimeZone(input.storeTimeZone),
    dataMode,
    langameDomain,
    langameClubId,
    ownerEmail,
    ownerFullName: optionalText(input.ownerFullName, "ownerFullName", 160),
    supportOwnerAlias: requiredText(
      input.supportOwnerAlias,
      "supportOwnerAlias",
      2,
      80,
    ),
    reason: requiredText(input.reason, "reason", 10, 500),
    supportTicket: optionalText(input.supportTicket, "supportTicket", 120),
    accessExpiresAt: normalizeExpiry(
      input.accessExpiresAt,
      now,
      allowExpiredAccess,
    ),
  });
}

export function assertDesignPartnerRuntimeSafetyOverlay(env) {
  const mismatches = [];

  for (const [key, expected] of Object.entries(DESIGN_PARTNER_REQUIRED_ENV)) {
    const actual = String(env[key] ?? "").trim();
    if (actual !== expected) {
      mismatches.push({ key, expected, actual: actual || "<missing>" });
    }
  }

  if (mismatches.length > 0) {
    fail(
      "UNSAFE_RUNTIME_ENVIRONMENT",
      `Design-partner runtime admission is blocked by ${mismatches.length} setting(s): ${mismatches
        .map(
          ({ key, expected, actual }) =>
            `${key}=${actual} (expected ${expected})`,
        )
        .join("; ")}`,
    );
  }

  return true;
}

export function hashInviteToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function requireManifestHmacKey(manifestHmacKey) {
  if (typeof manifestHmacKey !== "string") {
    fail(
      "MANIFEST_HMAC_KEY_INVALID",
      "DESIGN_PARTNER_MANIFEST_HMAC_KEY must be provided out of band.",
    );
  }
  const keyBytes = Buffer.byteLength(manifestHmacKey, "utf8");
  if (keyBytes < 32 || keyBytes > MAX_HMAC_KEY_BYTES) {
    fail(
      "MANIFEST_HMAC_KEY_INVALID",
      `DESIGN_PARTNER_MANIFEST_HMAC_KEY must contain 32-${MAX_HMAC_KEY_BYTES} UTF-8 bytes.`,
    );
  }
  return manifestHmacKey;
}

function manifestSigningPayload(manifest, manifestHmacKey) {
  const ownerIdentityDigest = createHmac(
    "sha256",
    requireManifestHmacKey(manifestHmacKey),
  )
    .update("leetplus-design-partner-owner-v1\0", "utf8")
    .update(manifest.ownerEmail, "utf8")
    .digest("hex");

  return {
    profileVersion: manifest.profileVersion,
    partnerAlias: manifest.partnerAlias,
    tenantName: manifest.tenantName,
    tenantSlug: manifest.tenantSlug,
    tenantDomain: manifest.tenantDomain,
    storeName: manifest.storeName,
    storePublicSlug: manifest.storePublicSlug,
    storeAddress: manifest.storeAddress,
    storeCity: manifest.storeCity,
    storeTimeZone: manifest.storeTimeZone,
    dataMode: manifest.dataMode,
    langameDomain: manifest.langameDomain,
    langameClubId: manifest.langameClubId,
    ownerIdentityDigest,
    ownerFullName: manifest.ownerFullName,
    supportOwnerAlias: manifest.supportOwnerAlias,
    reason: manifest.reason,
    supportTicket: manifest.supportTicket,
    accessExpiresAt: manifest.accessExpiresAt.toISOString(),
  };
}

export function computeDesignPartnerManifestDigest(manifest, manifestHmacKey) {
  const key = requireManifestHmacKey(manifestHmacKey);
  return createHmac("sha256", key)
    .update("leetplus-design-partner-manifest-v1\0", "utf8")
    .update(JSON.stringify(manifestSigningPayload(manifest, key)), "utf8")
    .digest("hex");
}

function manifestDigestMatches(actual, expected) {
  if (
    typeof actual !== "string" ||
    !/^[0-9a-f]{64}$/.test(actual) ||
    !/^[0-9a-f]{64}$/.test(expected)
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}

export function computeDesignPartnerProvisionedInviteDigest(
  manifestDigest,
  tenantId,
  storeId,
  inviteId,
  inviteTokenHash,
  inviteExpiresAt,
  manifestHmacKey,
) {
  return createHmac("sha256", requireManifestHmacKey(manifestHmacKey))
    .update("leetplus-design-partner-provisioned-invite-v1\0", "utf8")
    .update(
      JSON.stringify({
        manifestDigest,
        tenantId,
        storeId,
        inviteId,
        inviteTokenHash,
        inviteExpiresAt: inviteExpiresAt.toISOString(),
      }),
      "utf8",
    )
    .digest("hex");
}

export function computeDesignPartnerInviteRotationDigest(
  manifestDigest,
  requestId,
  inviteId,
  inviteTokenHash,
  inviteExpiresAt,
  manifestHmacKey,
) {
  return createHmac("sha256", requireManifestHmacKey(manifestHmacKey))
    .update("leetplus-design-partner-invite-rotation-v1\0", "utf8")
    .update(
      JSON.stringify({
        manifestDigest,
        requestId,
        inviteId,
        inviteTokenHash,
        inviteExpiresAt: inviteExpiresAt.toISOString(),
      }),
      "utf8",
    )
    .digest("hex");
}

export function buildInviteUrl(webUrl, token, expectedOrigin) {
  const base = requiredText(webUrl, "WEB_URL", 8, 500);
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    fail("UNSAFE_RUNTIME_ENVIRONMENT", "WEB_URL must be a valid HTTPS origin.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    fail(
      "UNSAFE_RUNTIME_ENVIRONMENT",
      "WEB_URL must be an HTTPS origin without credentials, path, query or hash.",
    );
  }
  if (expectedOrigin && parsed.origin !== expectedOrigin) {
    fail(
      "UNSAFE_RUNTIME_ENVIRONMENT",
      `WEB_URL must equal the pinned isolated origin ${expectedOrigin}.`,
    );
  }

  return `${parsed.origin}/register?invite=${encodeURIComponent(token)}`;
}

function sameStrings(left, right) {
  const sortedRight = [...right].sort();
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === sortedRight[index])
  );
}

function assertExactProvisionedShape(
  topology,
  manifest,
  now = new Date(),
  { allowMissingLiveOwner = false, manifestHmacKey } = {},
) {
  if (topology.tenants.length !== 1) {
    fail(
      "DEDICATED_DATABASE_REQUIRED",
      `Expected exactly one design-partner tenant, found ${topology.tenants.length}.`,
    );
  }

  const tenant = topology.tenants[0];
  if (
    tenant.slug !== manifest.tenantSlug ||
    tenant.name !== manifest.tenantName ||
    tenant.domain !== manifest.tenantDomain ||
    tenant.status !== "SUSPENDED"
  ) {
    fail(
      "TOPOLOGY_MISMATCH",
      "The only tenant must match the manifest and remain SUSPENDED.",
    );
  }

  const expectedProvider = manifest.dataMode === "LANGAME" ? "LANGAME" : null;
  const store = tenant.stores[0];
  if (
    tenant.stores.length !== 1 ||
    store.name !== manifest.storeName ||
    store.publicSlug !== manifest.storePublicSlug ||
    store.address !== manifest.storeAddress ||
    store.city !== manifest.storeCity ||
    store.timeZone !== manifest.storeTimeZone ||
    store.isActive ||
    store.gamificationEnabled ||
    store.externalProvider !== expectedProvider ||
    store.externalDomain !== manifest.langameDomain ||
    store.externalClubId !== manifest.langameClubId
  ) {
    fail(
      "TOPOLOGY_MISMATCH",
      "The design-partner tenant must contain exactly the declared inactive store.",
    );
  }

  if (
    tenant.userRoleOverrides.length !== 1 ||
    tenant.userRoleOverrides[0].role !== "OWNER" ||
    !sameStrings(
      tenant.userRoleOverrides[0].permissions,
      DESIGN_PARTNER_OWNER_CAPABILITIES,
    )
  ) {
    fail(
      "PROFILE_MISMATCH",
      "The tenant OWNER override does not match the pinned design-partner profile.",
    );
  }

  if (
    tenant.integrationSources.length !== 0 ||
    tenant.integrationCredentials.length !== 0
  ) {
    fail(
      "UNSAFE_INTEGRATION_STATE",
      "Provisioned design-partner integrations must contain no source or credential before admission.",
    );
  }

  if (tenant.users.some((user) => user.isPlatformAdmin)) {
    fail(
      "PLATFORM_ADMIN_FORBIDDEN",
      "A design-partner tenant user must never be a Platform Admin.",
    );
  }

  if (tenant.userAccessRoles.length !== 0) {
    fail(
      "PROFILE_MISMATCH",
      "Custom roles are forbidden during the design-partner bootstrap.",
    );
  }

  const ownerUsers = tenant.users.filter(
    (user) =>
      user.email === manifest.ownerEmail &&
      user.role === "OWNER" &&
      user.accessScope === "NETWORK" &&
      user.customRoleId === null &&
      user.isActive &&
      !user.isPlatformAdmin &&
      user.storeAccesses.length === 0,
  );
  const ownerInvites = tenant.userInvites.filter(
    (invite) =>
      invite.email === manifest.ownerEmail &&
      invite.role === "OWNER" &&
      invite.accessScope === "NETWORK" &&
      invite.customRoleId === null &&
      invite.storeIds.length === 0,
  );
  const liveOwnerInvites = ownerInvites.filter(
    (invite) => invite.acceptedAt === null && invite.expiresAt > now,
  );
  const acceptedOwnerInvites = ownerInvites.filter(
    (invite) => invite.acceptedAt !== null,
  );
  const acceptedInviteMatchesOwner =
    ownerUsers.length === 1 &&
    acceptedOwnerInvites.length === 1 &&
    acceptedOwnerInvites[0].acceptedByUserId === ownerUsers[0].id;
  if (
    tenant.users.length !== ownerUsers.length ||
    tenant.userInvites.length !== ownerInvites.length ||
    ownerUsers.length > 1 ||
    liveOwnerInvites.length > 1 ||
    (ownerUsers.length === 1 && liveOwnerInvites.length !== 0) ||
    (ownerUsers.length === 1 && !acceptedInviteMatchesOwner) ||
    (ownerUsers.length === 0 && acceptedOwnerInvites.length !== 0) ||
    (!allowMissingLiveOwner &&
      ownerUsers.length === 0 &&
      liveOwnerInvites.length !== 1)
  ) {
    fail(
      "OWNER_IDENTITY_MISMATCH",
      "The design-partner bootstrap must contain only one exact email-bound NETWORK OWNER identity.",
    );
  }

  const provisioningAudits = tenant.platformAdminAuditEvents.filter(
    (event) => event.action === DESIGN_PARTNER_PROVISION_ACTION,
  );
  const rotationAudits = tenant.platformAdminAuditEvents.filter(
    (event) => event.action === DESIGN_PARTNER_INVITE_ROTATE_ACTION,
  );
  const audit = provisioningAudits[0];
  const expectedManifestDigest = computeDesignPartnerManifestDigest(
    manifest,
    manifestHmacKey,
  );
  if (
    provisioningAudits.length !== 1 ||
    audit.action !== DESIGN_PARTNER_PROVISION_ACTION ||
    audit.metadata?.profileVersion !== DESIGN_PARTNER_PROFILE_VERSION ||
    audit.metadata?.partnerAlias !== manifest.partnerAlias ||
    audit.metadata?.storeId !== store.id ||
    audit.metadata?.dataMode !== manifest.dataMode ||
    audit.metadata?.accessExpiresAt !==
      manifest.accessExpiresAt.toISOString() ||
    audit.metadata?.manifestHmacKeyVersion !== MANIFEST_HMAC_KEY_VERSION ||
    typeof audit.metadata?.ownerInviteId !== "string" ||
    !manifestDigestMatches(
      audit.metadata?.manifestDigest,
      expectedManifestDigest,
    )
  ) {
    fail(
      "PROVISIONING_EVIDENCE_MISSING",
      "The design-partner provisioning audit marker is missing.",
    );
  }

  const authorizedInviteIds = new Set([audit.metadata.ownerInviteId]);
  const provisionedInvite = tenant.userInvites.find(
    (invite) => invite.id === audit.metadata.ownerInviteId,
  );
  const provisionedInviteExpiresAt = new Date(
    audit.metadata?.ownerInviteExpiresAt,
  );
  if (
    !provisionedInvite ||
    !Number.isFinite(provisionedInviteExpiresAt.getTime()) ||
    provisionedInviteExpiresAt > manifest.accessExpiresAt ||
    provisionedInvite.expiresAt > provisionedInviteExpiresAt ||
    !manifestDigestMatches(
      audit.metadata?.ownerInviteDigest,
      computeDesignPartnerProvisionedInviteDigest(
        expectedManifestDigest,
        tenant.id,
        store.id,
        provisionedInvite.id,
        provisionedInvite.tokenHash,
        provisionedInviteExpiresAt,
        manifestHmacKey,
      ),
    )
  ) {
    fail(
      "PROVISIONING_EVIDENCE_MISSING",
      "The initial design-partner OWNER invite is not bound to the provisioning receipt.",
    );
  }
  const seenRotationRequestIds = new Set();
  for (const rotation of rotationAudits) {
    const requestId = rotation.metadata?.requestId;
    const inviteExpiresAt = new Date(rotation.metadata?.inviteExpiresAt);
    const rotatedInvite = tenant.userInvites.find(
      (invite) => invite.id === rotation.targetId,
    );
    if (
      rotation.metadata?.profileVersion !== DESIGN_PARTNER_PROFILE_VERSION ||
      rotation.metadata?.partnerAlias !== manifest.partnerAlias ||
      rotation.metadata?.manifestHmacKeyVersion !== MANIFEST_HMAC_KEY_VERSION ||
      typeof requestId !== "string" ||
      !ROTATION_REQUEST_ID_PATTERN.test(requestId) ||
      seenRotationRequestIds.has(requestId) ||
      typeof rotation.targetId !== "string" ||
      !rotatedInvite ||
      !Number.isFinite(inviteExpiresAt.getTime()) ||
      inviteExpiresAt > manifest.accessExpiresAt ||
      rotatedInvite.expiresAt > inviteExpiresAt ||
      !manifestDigestMatches(
        rotation.metadata?.rotationDigest,
        computeDesignPartnerInviteRotationDigest(
          expectedManifestDigest,
          requestId,
          rotatedInvite.id,
          rotatedInvite.tokenHash,
          inviteExpiresAt,
          manifestHmacKey,
        ),
      )
    ) {
      fail(
        "PROVISIONING_EVIDENCE_MISSING",
        "A design-partner invite rotation audit marker is invalid.",
      );
    }
    seenRotationRequestIds.add(requestId);
    authorizedInviteIds.add(rotation.targetId);
  }
  if (
    tenant.userInvites.some((invite) => !authorizedInviteIds.has(invite.id))
  ) {
    fail(
      "OWNER_IDENTITY_MISMATCH",
      "Every design-partner OWNER invite must be authorized by HMAC-bound provisioning evidence.",
    );
  }

  return {
    tenant,
    accessExpired: manifest.accessExpiresAt <= now,
    ownerUsers,
    ownerInvites,
    liveOwnerInvites,
  };
}

export async function readDesignPartnerTopology(client) {
  return {
    tenants: await client.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        status: true,
        stores: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            publicSlug: true,
            address: true,
            city: true,
            timeZone: true,
            gamificationEnabled: true,
            isActive: true,
            externalProvider: true,
            externalDomain: true,
            externalClubId: true,
          },
        },
        userRoleOverrides: {
          select: { id: true, role: true, permissions: true },
        },
        userAccessRoles: {
          select: { id: true },
        },
        platformAdminAuditEvents: {
          where: {
            action: {
              in: [
                DESIGN_PARTNER_PROVISION_ACTION,
                DESIGN_PARTNER_INVITE_ROTATE_ACTION,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            action: true,
            targetId: true,
            metadata: true,
            createdAt: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
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
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            role: true,
            accessScope: true,
            customRoleId: true,
            storeIds: true,
            tokenHash: true,
            expiresAt: true,
            acceptedAt: true,
            acceptedByUserId: true,
          },
        },
        integrationSources: {
          select: { id: true },
        },
        integrationCredentials: {
          select: { id: true },
        },
      },
    }),
  };
}

function publicStatus(tenant, manifest, now = new Date()) {
  return {
    profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
    partnerAlias: manifest.partnerAlias,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
    },
    store: {
      id: tenant.stores[0].id,
      active: tenant.stores[0].isActive,
      gamificationEnabled: tenant.stores[0].gamificationEnabled,
    },
    owner: {
      activeUsers: tenant.users.filter(
        (user) =>
          user.role === "OWNER" &&
          user.accessScope === "NETWORK" &&
          user.isActive &&
          !user.isPlatformAdmin,
      ).length,
      pendingInvites: tenant.userInvites.filter(
        (invite) =>
          invite.role === "OWNER" &&
          invite.accessScope === "NETWORK" &&
          invite.acceptedAt === null &&
          invite.expiresAt > now,
      ).length,
    },
    accessExpiresAt: manifest.accessExpiresAt.toISOString(),
    accessExpired: manifest.accessExpiresAt <= now,
  };
}

export async function previewDesignPartnerProvisioning(
  client,
  manifest,
  { now = new Date(), manifestHmacKey } = {},
) {
  computeDesignPartnerManifestDigest(manifest, manifestHmacKey);
  const topology = await readDesignPartnerTopology(client);

  if (topology.tenants.length === 0) {
    return {
      decision: "READY_TO_PROVISION",
      emptyTenantDatabase: true,
      physicalIsolationEvidenceRequired: true,
      profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
      tenantSlug: manifest.tenantSlug,
      storeCount: 1,
      initialTenantStatus: "SUSPENDED",
    };
  }

  const { tenant, ownerUsers, liveOwnerInvites } = assertExactProvisionedShape(
    topology,
    manifest,
    now,
    {
      allowMissingLiveOwner: true,
      manifestHmacKey,
    },
  );
  return {
    decision:
      ownerUsers.length === 0 && liveOwnerInvites.length === 0
        ? "INVITE_ROTATION_REQUIRED"
        : "ALREADY_PROVISIONED",
    emptyTenantDatabase: false,
    physicalIsolationEvidenceRequired: true,
    ...publicStatus(tenant, manifest, now),
  };
}

export async function provisionDesignPartner(
  client,
  manifest,
  {
    now = new Date(),
    tokenFactory = () => randomBytes(32).toString("base64url"),
    webUrl,
    confirmation,
    runtimeEnv,
    manifestHmacKey,
  } = {},
) {
  if (confirmation !== `PROVISION ${manifest.tenantSlug}`) {
    fail(
      "CONFIRMATION_REQUIRED",
      `Set confirmation to PROVISION ${manifest.tenantSlug}.`,
    );
  }
  assertDesignPartnerRuntimeSafetyOverlay(runtimeEnv ?? {});
  const manifestDigest = computeDesignPartnerManifestDigest(
    manifest,
    manifestHmacKey,
  );

  const existing = await readDesignPartnerTopology(client);
  if (existing.tenants.length > 0) {
    const { tenant } = assertExactProvisionedShape(existing, manifest, now, {
      allowMissingLiveOwner: true,
      manifestHmacKey,
    });
    return {
      decision: "ALREADY_PROVISIONED",
      inviteUrl: null,
      ...publicStatus(tenant, manifest, now),
    };
  }

  const rawToken = tokenFactory();
  if (typeof rawToken !== "string" || rawToken.length < 32) {
    fail("TOKEN_GENERATION_FAILED", "Invite token generation failed closed.");
  }
  const inviteTokenHash = hashInviteToken(rawToken);
  const inviteUrl = buildInviteUrl(
    webUrl,
    rawToken,
    `https://${manifest.tenantDomain}`,
  );

  const inviteExpiresAt = new Date(
    Math.min(
      now.getTime() + DEFAULT_INVITE_TTL_HOURS * 60 * 60 * 1000,
      manifest.accessExpiresAt.getTime(),
    ),
  );
  const result = await client.$transaction(
    async (tx) => {
      const tenantCount = await tx.tenant.count();
      if (tenantCount !== 0) {
        fail(
          "DEDICATED_DATABASE_REQUIRED",
          "Provisioning requires a dedicated database with zero tenants.",
        );
      }

      const conflictingUser = await tx.user.findUnique({
        where: { email: manifest.ownerEmail },
        select: { id: true },
      });
      if (conflictingUser) {
        fail(
          "OWNER_EMAIL_CONFLICT",
          "The owner email already belongs to a user.",
        );
      }

      const tenant = await tx.tenant.create({
        data: {
          name: manifest.tenantName,
          slug: manifest.tenantSlug,
          domain: manifest.tenantDomain,
          status: "SUSPENDED",
          statusChangedAt: now,
          statusReason: `Awaiting Gate 1DP activation: ${manifest.reason}`,
        },
        select: { id: true, slug: true, status: true },
      });
      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: manifest.storeName,
          publicSlug: manifest.storePublicSlug,
          address: manifest.storeAddress,
          city: manifest.storeCity,
          timeZone: manifest.storeTimeZone,
          isActive: false,
          gamificationEnabled: false,
          externalProvider:
            manifest.dataMode === "LANGAME" ? "LANGAME" : undefined,
          externalDomain: manifest.langameDomain,
          externalClubId: manifest.langameClubId,
        },
        select: {
          id: true,
          isActive: true,
          gamificationEnabled: true,
        },
      });

      await tx.userRoleOverride.create({
        data: {
          tenantId: tenant.id,
          role: "OWNER",
          permissions: [...DESIGN_PARTNER_OWNER_CAPABILITIES],
        },
      });
      const invite = await tx.userInvite.create({
        data: {
          tenantId: tenant.id,
          email: manifest.ownerEmail,
          fullName: manifest.ownerFullName,
          role: "OWNER",
          accessScope: "NETWORK",
          storeIds: [],
          tokenHash: inviteTokenHash,
          expiresAt: inviteExpiresAt,
        },
        select: { id: true, tokenHash: true, expiresAt: true },
      });
      const ownerInviteDigest = computeDesignPartnerProvisionedInviteDigest(
        manifestDigest,
        tenant.id,
        store.id,
        invite.id,
        invite.tokenHash,
        invite.expiresAt,
        manifestHmacKey,
      );

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          action: DESIGN_PARTNER_PROVISION_ACTION,
          targetType: "TENANT",
          targetId: tenant.id,
          reason: manifest.reason,
          metadata: {
            profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
            partnerAlias: manifest.partnerAlias,
            supportOwnerAlias: manifest.supportOwnerAlias,
            supportTicket: manifest.supportTicket,
            storeId: store.id,
            accessExpiresAt: manifest.accessExpiresAt.toISOString(),
            dataMode: manifest.dataMode,
            langameMappingPinned: manifest.dataMode === "LANGAME",
            dedicatedDatabaseRequired: true,
            inviteEmailBound: true,
            initialTenantStatus: "SUSPENDED",
            outboundDefault: "OFF",
            manifestDigest,
            manifestHmacKeyVersion: MANIFEST_HMAC_KEY_VERSION,
            ownerInviteId: invite.id,
            ownerInviteExpiresAt: invite.expiresAt.toISOString(),
            ownerInviteDigest,
          },
        },
      });

      return { tenant, store, invite };
    },
    { isolationLevel: "Serializable" },
  );

  return {
    decision: "PROVISIONED_SUSPENDED",
    profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
    tenant: result.tenant,
    store: result.store,
    ownerInvite: {
      id: result.invite.id,
      expiresAt: result.invite.expiresAt.toISOString(),
      url: inviteUrl,
      oneTimeSecret: true,
    },
    activationRequired: true,
  };
}

export async function rotateDesignPartnerInvite(
  client,
  manifest,
  {
    now = new Date(),
    tokenFactory = () => randomBytes(32).toString("base64url"),
    webUrl,
    confirmation,
    runtimeEnv,
    manifestHmacKey,
    requestId,
    operationReason,
    operationTicket,
  } = {},
) {
  if (confirmation !== `ROTATE_INVITE ${manifest.tenantSlug}`) {
    fail(
      "CONFIRMATION_REQUIRED",
      `Set confirmation to ROTATE_INVITE ${manifest.tenantSlug}.`,
    );
  }
  assertDesignPartnerRuntimeSafetyOverlay(runtimeEnv ?? {});
  if (
    typeof requestId !== "string" ||
    !ROTATION_REQUEST_ID_PATTERN.test(requestId)
  ) {
    fail(
      "ROTATION_REQUEST_ID_INVALID",
      "DESIGN_PARTNER_ROTATION_REQUEST_ID must be an opaque 8-120 character operation id.",
    );
  }
  const manifestDigest = computeDesignPartnerManifestDigest(
    manifest,
    manifestHmacKey,
  );
  const normalizedOperationReason = requiredText(
    operationReason,
    "operationReason",
    10,
    500,
  );
  const normalizedOperationTicket = optionalText(
    operationTicket,
    "operationTicket",
    120,
  );
  if (manifest.accessExpiresAt <= now) {
    fail(
      "ACCESS_EXPIRED",
      "The design-partner access window has expired; approve a new manifest before rotating the invite.",
    );
  }

  buildInviteUrl(
    webUrl,
    "design-partner-origin-validation",
    `https://${manifest.tenantDomain}`,
  );
  const inviteExpiresAt = new Date(
    Math.min(
      now.getTime() + DEFAULT_INVITE_TTL_HOURS * 60 * 60 * 1000,
      manifest.accessExpiresAt.getTime(),
    ),
  );

  const result = await client.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock_result",
        `leetplus-design-partner-invite-rotation:${manifest.tenantSlug}`,
      );
      const topology = await readDesignPartnerTopology(tx);
      const { tenant, ownerUsers } = assertExactProvisionedShape(
        topology,
        manifest,
        now,
        { allowMissingLiveOwner: true, manifestHmacKey },
      );
      const priorRotations = tenant.platformAdminAuditEvents.filter(
        (event) => event.action === DESIGN_PARTNER_INVITE_ROTATE_ACTION,
      );
      const priorRotation = priorRotations.find(
        (event) => event.metadata?.requestId === requestId,
      );
      if (priorRotation) {
        return {
          tenant,
          priorRotation,
          invite: null,
          inviteUrl: null,
          expiredInvites: { count: 0 },
        };
      }
      if (ownerUsers.length !== 0) {
        fail(
          "OWNER_ALREADY_ACCEPTED",
          "The design-partner OWNER already exists; an invite must not be rotated.",
        );
      }

      const rawToken = tokenFactory();
      if (typeof rawToken !== "string" || rawToken.length < 32) {
        fail(
          "TOKEN_GENERATION_FAILED",
          "Invite token generation failed closed.",
        );
      }
      const inviteTokenHash = hashInviteToken(rawToken);
      const inviteUrl = buildInviteUrl(
        webUrl,
        rawToken,
        `https://${manifest.tenantDomain}`,
      );
      const expiredInvites = await tx.userInvite.updateMany({
        where: {
          tenantId: tenant.id,
          acceptedAt: null,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });
      const invite = await tx.userInvite.create({
        data: {
          tenantId: tenant.id,
          email: manifest.ownerEmail,
          fullName: manifest.ownerFullName,
          role: "OWNER",
          accessScope: "NETWORK",
          storeIds: [],
          tokenHash: inviteTokenHash,
          expiresAt: inviteExpiresAt,
        },
        select: { id: true, tokenHash: true, expiresAt: true },
      });
      const rotationDigest = computeDesignPartnerInviteRotationDigest(
        manifestDigest,
        requestId,
        invite.id,
        invite.tokenHash,
        invite.expiresAt,
        manifestHmacKey,
      );

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          action: DESIGN_PARTNER_INVITE_ROTATE_ACTION,
          targetType: "USER_INVITE",
          targetId: invite.id,
          reason: normalizedOperationReason,
          metadata: {
            profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
            partnerAlias: manifest.partnerAlias,
            supportOwnerAlias: manifest.supportOwnerAlias,
            operationTicket: normalizedOperationTicket,
            previousPendingInvitesRevoked: expiredInvites.count,
            inviteExpiresAt: invite.expiresAt.toISOString(),
            inviteEmailBound: true,
            requestId,
            manifestHmacKeyVersion: MANIFEST_HMAC_KEY_VERSION,
            rotationDigest,
          },
        },
      });

      return { tenant, invite, inviteUrl, expiredInvites, priorRotation: null };
    },
    { isolationLevel: "ReadCommitted" },
  );

  if (result.priorRotation) {
    return {
      decision: "INVITE_ROTATION_ALREADY_APPLIED",
      profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        status: result.tenant.status,
      },
      requestId,
      previousInviteId: result.priorRotation.targetId,
      ownerInvite: null,
    };
  }

  return {
    decision: "INVITE_ROTATED",
    profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
    tenant: {
      id: result.tenant.id,
      slug: result.tenant.slug,
      status: result.tenant.status,
    },
    previousPendingInvitesRevoked: result.expiredInvites.count,
    requestId,
    ownerInvite: {
      id: result.invite.id,
      expiresAt: result.invite.expiresAt.toISOString(),
      url: result.inviteUrl,
      oneTimeSecret: true,
    },
  };
}

export async function suspendDesignPartner(
  client,
  manifest,
  {
    now = new Date(),
    confirmation,
    manifestHmacKey,
    operationReason,
    operationTicket,
  } = {},
) {
  if (confirmation !== `SUSPEND ${manifest.tenantSlug}`) {
    fail(
      "CONFIRMATION_REQUIRED",
      `Set confirmation to SUSPEND ${manifest.tenantSlug}.`,
    );
  }
  const expectedManifestDigest = computeDesignPartnerManifestDigest(
    manifest,
    manifestHmacKey,
  );
  const normalizedOperationReason = requiredText(
    operationReason,
    "operationReason",
    10,
    500,
  );
  const normalizedOperationTicket = optionalText(
    operationTicket,
    "operationTicket",
    120,
  );

  return client.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { slug: manifest.tenantSlug },
        select: {
          id: true,
          slug: true,
          status: true,
          platformAdminAuditEvents: {
            where: { action: DESIGN_PARTNER_PROVISION_ACTION },
            orderBy: { createdAt: "desc" },
            select: { metadata: true },
          },
        },
      });
      const validProvisioningMarker =
        tenant?.platformAdminAuditEvents.find(
          (event) =>
            event.metadata?.profileVersion === DESIGN_PARTNER_PROFILE_VERSION &&
            event.metadata?.partnerAlias === manifest.partnerAlias &&
            event.metadata?.manifestHmacKeyVersion ===
              MANIFEST_HMAC_KEY_VERSION &&
            manifestDigestMatches(
              event.metadata?.manifestDigest,
              expectedManifestDigest,
            ),
        ) ?? null;
      if (!tenant || !validProvisioningMarker) {
        fail(
          "PROVISIONING_EVIDENCE_MISSING",
          "Emergency suspend requires the exact tenant and its immutable provisioning marker.",
        );
      }

      const [updated, stores, sources, credentials, invites] =
        await Promise.all([
          tx.tenant.update({
            where: { id: tenant.id },
            data: {
              status: "SUSPENDED",
              statusChangedAt: now,
              statusReason: `Emergency design-partner suspension: ${normalizedOperationReason}`,
            },
            select: { id: true, slug: true, status: true },
          }),
          tx.store.updateMany({
            where: { tenantId: tenant.id },
            data: { isActive: false, gamificationEnabled: false },
          }),
          tx.integrationSource.updateMany({
            where: { tenantId: tenant.id, isActive: true },
            data: {
              isActive: false,
              supportDisabledAt: now,
              supportDisabledReason: normalizedOperationReason,
            },
          }),
          tx.integrationCredential.updateMany({
            where: { tenantId: tenant.id, isActive: true },
            data: { isActive: false },
          }),
          tx.userInvite.updateMany({
            where: {
              tenantId: tenant.id,
              acceptedAt: null,
              expiresAt: { gt: now },
            },
            data: { expiresAt: now },
          }),
        ]);

      await tx.platformAdminAuditEvent.create({
        data: {
          tenantId: tenant.id,
          action: DESIGN_PARTNER_SUSPEND_ACTION,
          targetType: "TENANT",
          targetId: tenant.id,
          reason: normalizedOperationReason,
          metadata: {
            profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
            partnerAlias: manifest.partnerAlias,
            supportOwnerAlias: manifest.supportOwnerAlias,
            operationTicket: normalizedOperationTicket,
            storesDisabled: stores.count,
            integrationSourcesDisabled: sources.count,
            integrationCredentialsDisabled: credentials.count,
            pendingInvitesRevoked: invites.count,
            apiProcessStopRequiredForSev0: true,
          },
        },
      });

      return {
        decision: "SUSPENDED",
        tenant: updated,
        effects: {
          storesDisabled: stores.count,
          integrationSourcesDisabled: sources.count,
          integrationCredentialsDisabled: credentials.count,
          pendingInvitesRevoked: invites.count,
        },
      };
    },
    { isolationLevel: "Serializable" },
  );
}
