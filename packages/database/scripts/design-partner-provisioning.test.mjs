import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DESIGN_PARTNER_FORBIDDEN_CAPABILITIES,
  DESIGN_PARTNER_OWNER_CAPABILITIES,
  DESIGN_PARTNER_PROFILE_VERSION,
  DESIGN_PARTNER_REQUIRED_ENV,
  DESIGN_PARTNER_TARGET_CAPABILITIES,
} from "./design-partner-access-profile.mjs";
import {
  assertDesignPartnerRuntimeSafetyOverlay,
  buildInviteUrl,
  computeDesignPartnerProvisionedInviteDigest,
  computeDesignPartnerManifestDigest,
  DesignPartnerProvisioningError,
  hashInviteToken,
  normalizeDesignPartnerManifest,
  previewDesignPartnerProvisioning,
  provisionDesignPartner,
  rotateDesignPartnerInvite,
} from "./design-partner-provisioning.mjs";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const MANIFEST_HMAC_KEY = "unit-test-design-partner-manifest-hmac-key-aaaaaaaa";
const OWNER_INVITE_TOKEN_HASH = hashInviteToken(
  "unit-test-owner-invite-token-000000000000000000000000",
);
const OWNER_INVITE_EXPIRES_AT = new Date("2026-07-31T12:00:00.000Z");

function manifest(overrides = {}) {
  return {
    partnerAlias: "DP1",
    tenantName: "Partner Network",
    tenantSlug: "partner-club",
    storeName: "Partner Store",
    storeAddress: "Partner address",
    storeCity: "Yekaterinburg",
    storeTimeZone: "Asia/Yekaterinburg",
    dataMode: "MANUAL_ONLY",
    langameDomain: null,
    langameClubId: null,
    ownerEmail: "owner@example.com",
    ownerFullName: "Owner",
    supportOwnerAlias: "SUPPORT_PRIMARY",
    reason: "Supervised isolated design-partner test",
    supportTicket: "DP-1",
    accessExpiresAt: "2026-08-15T12:00:00.000Z",
    ...overrides,
  };
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof DesignPartnerProvisioningError);
    assert.equal(error.code, code);
    return true;
  });
}

function provisioningAuditMetadata(
  normalized,
  storeId = "store-d1",
  ownerInviteId = "invite-owner",
  tenantId = "tenant-d",
  ownerInviteTokenHash = OWNER_INVITE_TOKEN_HASH,
  ownerInviteExpiresAt = OWNER_INVITE_EXPIRES_AT,
) {
  const manifestDigest = computeDesignPartnerManifestDigest(
    normalized,
    MANIFEST_HMAC_KEY,
  );
  return {
    profileVersion: DESIGN_PARTNER_PROFILE_VERSION,
    partnerAlias: normalized.partnerAlias,
    storeId,
    dataMode: normalized.dataMode,
    accessExpiresAt: normalized.accessExpiresAt.toISOString(),
    manifestDigest,
    manifestHmacKeyVersion: "v1",
    ownerInviteId,
    ownerInviteExpiresAt: ownerInviteExpiresAt.toISOString(),
    ownerInviteDigest: computeDesignPartnerProvisionedInviteDigest(
      manifestDigest,
      tenantId,
      storeId,
      ownerInviteId,
      ownerInviteTokenHash,
      ownerInviteExpiresAt,
      MANIFEST_HMAC_KEY,
    ),
  };
}

test("documented runtime overlay matches the provisioning safety contract", async () => {
  const source = await readFile(
    new URL(
      "../../../docs/open-beta/design-partner-runtime.env.example",
      import.meta.url,
    ),
    "utf8",
  );
  const documented = Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
      .filter(
        ([key]) =>
          key !== "DESIGN_PARTNER_TENANT_SLUG" &&
          key !== "DESIGN_PARTNER_TENANT_DOMAIN",
      ),
  );

  assert.deepEqual(documented, DESIGN_PARTNER_REQUIRED_ENV);
});

test("normalizes the pinned one-tenant/one-store manifest", () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  assert.equal(normalized.profileVersion, DESIGN_PARTNER_PROFILE_VERSION);
  assert.equal(normalized.tenantSlug, "partner-club");
  assert.equal(normalized.ownerEmail, "owner@example.com");
  assert.equal(normalized.storePublicSlug, "club");
  assert.equal(
    normalized.accessExpiresAt.toISOString(),
    "2026-08-15T12:00:00.000Z",
  );
});

test("canonical manifest digest is key-bound and changes with signed fields", () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  const baseline = computeDesignPartnerManifestDigest(
    normalized,
    MANIFEST_HMAC_KEY,
  );
  const changed = normalizeDesignPartnerManifest(
    manifest({ storeName: "Changed Partner Store" }),
    NOW,
  );

  assert.match(baseline, /^[0-9a-f]{64}$/);
  assert.notEqual(
    computeDesignPartnerManifestDigest(changed, MANIFEST_HMAC_KEY),
    baseline,
  );
  assert.notEqual(
    computeDesignPartnerManifestDigest(
      normalized,
      "different-unit-test-design-partner-hmac-key-bbbbbbbb",
    ),
    baseline,
  );
  expectCode(
    () => computeDesignPartnerManifestDigest(normalized, "short"),
    "MANIFEST_HMAC_KEY_INVALID",
  );
});

test("requires an exact Langame mapping only in LANGAME mode", () => {
  expectCode(
    () =>
      normalizeDesignPartnerManifest(manifest({ dataMode: "LANGAME" }), NOW),
    "INVALID_MANIFEST",
  );
  expectCode(
    () =>
      normalizeDesignPartnerManifest(
        manifest({
          dataMode: "MANUAL_ONLY",
          langameDomain: "partner.langame.example",
          langameClubId: "club-1",
        }),
        NOW,
      ),
    "INVALID_MANIFEST",
  );

  const normalized = normalizeDesignPartnerManifest(
    manifest({
      dataMode: "LANGAME",
      langameDomain: "PARTNER.LANGAME.EXAMPLE",
      langameClubId: "club-1",
    }),
    NOW,
  );
  assert.equal(normalized.langameDomain, "partner.langame.example");
  assert.equal(normalized.langameClubId, "club-1");
});

test("rejects reserved tenants, invalid email, invalid timezone and long access", () => {
  expectCode(
    () => normalizeDesignPartnerManifest(manifest({ tenantSlug: "demo" }), NOW),
    "INVALID_MANIFEST",
  );
  expectCode(
    () =>
      normalizeDesignPartnerManifest(
        manifest({ ownerEmail: "not-an-email" }),
        NOW,
      ),
    "INVALID_MANIFEST",
  );
  expectCode(
    () =>
      normalizeDesignPartnerManifest(
        manifest({ storeTimeZone: "Moon/Base" }),
        NOW,
      ),
    "INVALID_MANIFEST",
  );
  expectCode(
    () =>
      normalizeDesignPartnerManifest(
        manifest({ accessExpiresAt: "2027-12-31T00:00:00.000Z" }),
        NOW,
      ),
    "INVALID_MANIFEST",
  );
});

test("status and emergency suspend may load an expired access manifest", () => {
  const expired = manifest({
    accessExpiresAt: "2026-07-27T12:00:00.000Z",
  });
  expectCode(
    () => normalizeDesignPartnerManifest(expired, NOW),
    "INVALID_MANIFEST",
  );
  assert.equal(
    normalizeDesignPartnerManifest(expired, NOW, {
      allowExpiredAccess: true,
    }).accessExpiresAt.toISOString(),
    "2026-07-27T12:00:00.000Z",
  );
});

test("target profile includes agreed modules and excludes CRM, marketing and store creation", () => {
  for (const capability of [
    "view_guest_gamification",
    "operate_guest_game_ledger",
    "view_assortment_products",
    "edit_products",
    "view_staff",
    "manage_staff_salary",
    "view_communications",
    "manage_users",
  ]) {
    assert.ok(DESIGN_PARTNER_TARGET_CAPABILITIES.includes(capability));
  }

  for (const capability of DESIGN_PARTNER_FORBIDDEN_CAPABILITIES) {
    assert.ok(!DESIGN_PARTNER_TARGET_CAPABILITIES.includes(capability));
  }
});

test("bootstrap OWNER profile is a least-privilege subset of the target", () => {
  for (const capability of DESIGN_PARTNER_OWNER_CAPABILITIES) {
    assert.ok(DESIGN_PARTNER_TARGET_CAPABILITIES.includes(capability));
  }
  assert.ok(DESIGN_PARTNER_OWNER_CAPABILITIES.includes("view_staff_knowledge"));

  for (const withheldCapability of [
    "export_reports",
    "edit_products",
    "import_data",
    "manage_integrations",
    "run_sync",
    "view_guest_gamification",
    "view_guest_game_pii",
    "view_communications",
    "view_staff",
    "manage_staff_salary",
  ]) {
    assert.ok(!DESIGN_PARTNER_OWNER_CAPABILITIES.includes(withheldCapability));
  }
});

test("runtime safety overlay is exact and fails closed", () => {
  assert.equal(
    assertDesignPartnerRuntimeSafetyOverlay({
      ...DESIGN_PARTNER_REQUIRED_ENV,
    }),
    true,
  );

  expectCode(
    () =>
      assertDesignPartnerRuntimeSafetyOverlay({
        ...DESIGN_PARTNER_REQUIRED_ENV,
        LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: "true",
      }),
    "UNSAFE_RUNTIME_ENVIRONMENT",
  );
  expectCode(
    () => assertDesignPartnerRuntimeSafetyOverlay({}),
    "UNSAFE_RUNTIME_ENVIRONMENT",
  );
});

test("invite token hashing is deterministic while invite URL requires HTTPS", () => {
  assert.equal(
    hashInviteToken("secret"),
    "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
  );
  assert.equal(
    buildInviteUrl(
      "https://partner-club.leetplus.ru/",
      "a token",
      "https://partner-club.leetplus.ru",
    ),
    "https://partner-club.leetplus.ru/register?invite=a%20token",
  );
  expectCode(
    () => buildInviteUrl("http://pilot.leetplus.ru", "token"),
    "UNSAFE_RUNTIME_ENVIRONMENT",
  );
  expectCode(
    () =>
      buildInviteUrl(
        "https://partner-club.leetplus.ru@evil.example",
        "token",
        "https://partner-club.leetplus.ru",
      ),
    "UNSAFE_RUNTIME_ENVIRONMENT",
  );
  expectCode(
    () =>
      buildInviteUrl(
        "https://partner-club.leetplus.ru/path?redirect=evil",
        "token",
        "https://partner-club.leetplus.ru",
      ),
    "UNSAFE_RUNTIME_ENVIRONMENT",
  );
});

test("preview allows only an empty dedicated database", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  const emptyClient = {
    tenant: { findMany: async () => [] },
  };
  await assert.doesNotReject(async () => {
    const result = await previewDesignPartnerProvisioning(
      emptyClient,
      normalized,
      {
        now: NOW,
        manifestHmacKey: MANIFEST_HMAC_KEY,
      },
    );
    assert.equal(result.decision, "READY_TO_PROVISION");
    assert.equal(result.emptyTenantDatabase, true);
    assert.equal(result.physicalIsolationEvidenceRequired, true);
    assert.equal(result.initialTenantStatus, "SUSPENDED");
  });

  const sharedClient = {
    tenant: {
      findMany: async () => [
        {
          id: "incumbent",
          name: "Current Network",
          slug: "current",
          domain: "current.leetplus.ru",
          status: "ACTIVE",
          stores: [],
          userRoleOverrides: [],
          userAccessRoles: [],
          platformAdminAuditEvents: [],
          users: [],
          userInvites: [],
          integrationSources: [],
          integrationCredentials: [],
        },
      ],
    },
  };
  await assert.rejects(
    previewDesignPartnerProvisioning(sharedClient, normalized, {
      now: NOW,
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "TOPOLOGY_MISMATCH",
  );
});

test("preview pins the suspended tenant, store, owner and audit evidence", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  const topology = {
    id: "tenant-d",
    name: normalized.tenantName,
    slug: normalized.tenantSlug,
    domain: normalized.tenantDomain,
    status: "SUSPENDED",
    stores: [
      {
        id: "store-d1",
        name: normalized.storeName,
        publicSlug: normalized.storePublicSlug,
        address: normalized.storeAddress,
        city: normalized.storeCity,
        timeZone: normalized.storeTimeZone,
        isActive: false,
        gamificationEnabled: false,
        externalProvider: null,
        externalDomain: null,
        externalClubId: null,
      },
    ],
    userRoleOverrides: [
      {
        id: "override-owner",
        role: "OWNER",
        permissions: [...DESIGN_PARTNER_OWNER_CAPABILITIES],
      },
    ],
    userAccessRoles: [],
    platformAdminAuditEvents: [
      {
        id: "audit-provision",
        action: "SINGLE_DESIGN_PARTNER_PROVISIONED",
        metadata: provisioningAuditMetadata(normalized),
        createdAt: NOW,
      },
    ],
    users: [],
    userInvites: [
      {
        id: "invite-owner",
        email: normalized.ownerEmail,
        role: "OWNER",
        accessScope: "NETWORK",
        customRoleId: null,
        storeIds: [],
        tokenHash: OWNER_INVITE_TOKEN_HASH,
        expiresAt: OWNER_INVITE_EXPIRES_AT,
        acceptedAt: null,
        acceptedByUserId: null,
      },
    ],
    integrationSources: [],
    integrationCredentials: [],
  };
  const client = {
    tenant: { findMany: async () => [topology] },
  };

  const result = await previewDesignPartnerProvisioning(client, normalized, {
    now: NOW,
    manifestHmacKey: MANIFEST_HMAC_KEY,
  });
  assert.equal(result.decision, "ALREADY_PROVISIONED");
  assert.equal(result.tenant.status, "SUSPENDED");
  assert.equal(result.owner.pendingInvites, 1);
  assert.equal(result.accessExpired, false);

  await assert.rejects(
    previewDesignPartnerProvisioning(
      {
        tenant: {
          findMany: async () => [
            {
              ...topology,
              stores: [{ ...topology.stores[0], isActive: true }],
            },
          ],
        },
      },
      normalized,
      { now: NOW, manifestHmacKey: MANIFEST_HMAC_KEY },
    ),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "TOPOLOGY_MISMATCH",
  );

  await assert.rejects(
    previewDesignPartnerProvisioning(
      {
        tenant: {
          findMany: async () => [
            {
              ...topology,
              users: [
                {
                  id: "owner-user",
                  email: normalized.ownerEmail,
                  role: "OWNER",
                  accessScope: "NETWORK",
                  customRoleId: null,
                  isActive: true,
                  isPlatformAdmin: false,
                  storeAccesses: [],
                },
              ],
              userInvites: [],
            },
          ],
        },
      },
      normalized,
      { now: NOW, manifestHmacKey: MANIFEST_HMAC_KEY },
    ),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "OWNER_IDENTITY_MISMATCH",
  );

  const accepted = await previewDesignPartnerProvisioning(
    {
      tenant: {
        findMany: async () => [
          {
            ...topology,
            users: [
              {
                id: "owner-user",
                email: normalized.ownerEmail,
                role: "OWNER",
                accessScope: "NETWORK",
                customRoleId: null,
                isActive: true,
                isPlatformAdmin: false,
                storeAccesses: [],
              },
            ],
            userInvites: [
              {
                ...topology.userInvites[0],
                acceptedAt: new Date("2026-07-28T12:30:00.000Z"),
                acceptedByUserId: "owner-user",
              },
            ],
          },
        ],
      },
    },
    normalized,
    { now: NOW, manifestHmacKey: MANIFEST_HMAC_KEY },
  );
  assert.equal(accepted.owner.activeUsers, 1);
  assert.equal(accepted.owner.pendingInvites, 0);

  for (const evidenceDrift of [
    {
      platformAdminAuditEvents: [
        ...topology.platformAdminAuditEvents,
        {
          ...topology.platformAdminAuditEvents[0],
          id: "duplicate-audit",
        },
      ],
    },
    {
      userInvites: [
        {
          ...topology.userInvites[0],
          tokenHash: "0".repeat(64),
        },
      ],
    },
    {
      userInvites: [
        {
          ...topology.userInvites[0],
          expiresAt: new Date("2026-08-01T12:00:00.000Z"),
        },
      ],
    },
    { integrationSources: [{ id: "inactive-source" }] },
    {
      platformAdminAuditEvents: [
        {
          ...topology.platformAdminAuditEvents[0],
          metadata: {
            ...topology.platformAdminAuditEvents[0].metadata,
            manifestDigest: "0".repeat(64),
          },
        },
      ],
    },
  ]) {
    await assert.rejects(
      previewDesignPartnerProvisioning(
        {
          tenant: {
            findMany: async () => [{ ...topology, ...evidenceDrift }],
          },
        },
        normalized,
        { now: NOW, manifestHmacKey: MANIFEST_HMAC_KEY },
      ),
      (error) =>
        error instanceof DesignPartnerProvisioningError &&
        ["PROVISIONING_EVIDENCE_MISSING", "UNSAFE_INTEGRATION_STATE"].includes(
          error.code,
        ),
    );
  }
});

test("preview rejects every extra IAM principal, custom role and role override", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  const exact = {
    id: "tenant-d",
    name: normalized.tenantName,
    slug: normalized.tenantSlug,
    domain: normalized.tenantDomain,
    status: "SUSPENDED",
    stores: [
      {
        id: "store-d1",
        name: normalized.storeName,
        publicSlug: normalized.storePublicSlug,
        address: normalized.storeAddress,
        city: normalized.storeCity,
        timeZone: normalized.storeTimeZone,
        isActive: false,
        gamificationEnabled: false,
        externalProvider: null,
        externalDomain: null,
        externalClubId: null,
      },
    ],
    userRoleOverrides: [
      {
        id: "override-owner",
        role: "OWNER",
        permissions: [...DESIGN_PARTNER_OWNER_CAPABILITIES],
      },
    ],
    userAccessRoles: [],
    platformAdminAuditEvents: [
      {
        id: "audit-provision",
        action: "SINGLE_DESIGN_PARTNER_PROVISIONED",
        metadata: provisioningAuditMetadata(normalized),
        createdAt: NOW,
      },
    ],
    users: [],
    userInvites: [
      {
        id: "invite-owner",
        email: normalized.ownerEmail,
        role: "OWNER",
        accessScope: "NETWORK",
        customRoleId: null,
        storeIds: [],
        tokenHash: OWNER_INVITE_TOKEN_HASH,
        expiresAt: OWNER_INVITE_EXPIRES_AT,
        acceptedAt: null,
        acceptedByUserId: null,
      },
    ],
    integrationSources: [],
    integrationCredentials: [],
  };

  for (const drift of [
    {
      userAccessRoles: [{ id: "custom-role" }],
    },
    {
      userRoleOverrides: [
        ...exact.userRoleOverrides,
        { id: "override-admin", role: "ADMIN", permissions: [] },
      ],
    },
    {
      users: [
        {
          id: "rogue-user",
          email: "rogue@example.com",
          role: "ADMIN",
          accessScope: "NETWORK",
          customRoleId: null,
          isActive: true,
          isPlatformAdmin: false,
          storeAccesses: [],
        },
      ],
    },
    {
      userInvites: [
        ...exact.userInvites,
        {
          id: "rogue-invite",
          email: "rogue@example.com",
          role: "ADMIN",
          accessScope: "NETWORK",
          customRoleId: null,
          storeIds: [],
          expiresAt: new Date("2026-07-31T12:00:00.000Z"),
          acceptedAt: null,
          acceptedByUserId: null,
        },
      ],
    },
  ]) {
    await assert.rejects(
      previewDesignPartnerProvisioning(
        {
          tenant: {
            findMany: async () => [{ ...exact, ...drift }],
          },
        },
        normalized,
        { now: NOW, manifestHmacKey: MANIFEST_HMAC_KEY },
      ),
      (error) =>
        error instanceof DesignPartnerProvisioningError &&
        ["OWNER_IDENTITY_MISMATCH", "PROFILE_MISMATCH"].includes(error.code),
    );
  }
});

test("provision requires explicit confirmation before any database read", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  let read = false;
  const client = {
    tenant: {
      findMany: async () => {
        read = true;
        return [];
      },
    },
  };

  await assert.rejects(
    provisionDesignPartner(client, normalized, {
      now: NOW,
      webUrl: "https://partner-club.leetplus.ru",
      confirmation: "wrong",
    }),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "CONFIRMATION_REQUIRED",
  );
  assert.equal(read, false);
});

test("provision requires the exact isolated runtime overlay before any database read", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  let read = false;
  const client = {
    tenant: {
      findMany: async () => {
        read = true;
        return [];
      },
    },
  };

  await assert.rejects(
    provisionDesignPartner(client, normalized, {
      now: NOW,
      webUrl: "https://partner-club.leetplus.ru",
      confirmation: `PROVISION ${normalized.tenantSlug}`,
      runtimeEnv: {},
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "UNSAFE_RUNTIME_ENVIRONMENT",
  );
  assert.equal(read, false);
});

test("invite rotation is confirmed, hash-only, audited and keeps one live invite", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  const topology = {
    id: "tenant-d",
    name: normalized.tenantName,
    slug: normalized.tenantSlug,
    domain: normalized.tenantDomain,
    status: "SUSPENDED",
    stores: [
      {
        id: "store-d1",
        name: normalized.storeName,
        publicSlug: normalized.storePublicSlug,
        address: normalized.storeAddress,
        city: normalized.storeCity,
        timeZone: normalized.storeTimeZone,
        isActive: false,
        gamificationEnabled: false,
        externalProvider: null,
        externalDomain: null,
        externalClubId: null,
      },
    ],
    userRoleOverrides: [
      {
        id: "override-owner",
        role: "OWNER",
        permissions: [...DESIGN_PARTNER_OWNER_CAPABILITIES],
      },
    ],
    userAccessRoles: [],
    platformAdminAuditEvents: [
      {
        id: "audit-provision",
        action: "SINGLE_DESIGN_PARTNER_PROVISIONED",
        metadata: provisioningAuditMetadata(
          normalized,
          "store-d1",
          "old-invite",
        ),
        createdAt: NOW,
      },
    ],
    users: [],
    userInvites: [
      {
        id: "old-invite",
        email: normalized.ownerEmail,
        role: "OWNER",
        accessScope: "NETWORK",
        customRoleId: null,
        storeIds: [],
        tokenHash: OWNER_INVITE_TOKEN_HASH,
        expiresAt: OWNER_INVITE_EXPIRES_AT,
        acceptedAt: null,
        acceptedByUserId: null,
      },
    ],
    integrationSources: [],
    integrationCredentials: [],
  };
  const writes = [];
  const tx = {
    $queryRawUnsafe: async (query, lockKey) => {
      assert.equal(
        query,
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock_result",
      );
      assert.equal(
        lockKey,
        `leetplus-design-partner-invite-rotation:${normalized.tenantSlug}`,
      );
      return [{ lock_result: "" }];
    },
    tenant: { findMany: async () => [topology] },
    userInvite: {
      updateMany: async (operation) => {
        writes.push({ type: "expire", operation });
        return { count: 1 };
      },
      create: async (operation) => {
        writes.push({ type: "create", operation });
        return {
          id: "new-invite",
          tokenHash: operation.data.tokenHash,
          expiresAt: new Date("2026-07-31T12:00:00.000Z"),
        };
      },
    },
    platformAdminAuditEvent: {
      findMany: async () => [],
      create: async (operation) => {
        writes.push({ type: "audit", operation });
        return { id: "audit-rotate" };
      },
    },
  };
  const client = {
    $transaction: async (operation) => operation(tx),
  };
  const rawToken = "rotated-token-0000000000000000000000000000";

  const result = await rotateDesignPartnerInvite(client, normalized, {
    now: NOW,
    confirmation: `ROTATE_INVITE ${normalized.tenantSlug}`,
    manifestHmacKey: MANIFEST_HMAC_KEY,
    operationReason: "Rotate expired onboarding invitation",
    operationTicket: "DP-ROTATE-1",
    requestId: "UNIT-ROTATE-0001",
    runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
    tokenFactory: () => rawToken,
    webUrl: "https://partner-club.leetplus.ru",
  });

  assert.equal(result.decision, "INVITE_ROTATED");
  assert.equal(result.previousPendingInvitesRevoked, 1);
  assert.match(result.ownerInvite.url, /invite=rotated-token/);
  assert.equal(
    writes.find((write) => write.type === "create").operation.data.tokenHash,
    hashInviteToken(rawToken),
  );
  const auditPayload = JSON.stringify(
    writes.find((write) => write.type === "audit").operation,
  );
  assert.ok(!auditPayload.includes(rawToken));
  assert.ok(!auditPayload.includes(normalized.ownerEmail));
});

test("invite rotation requires confirmation before generating a token or reading the database", async () => {
  const normalized = normalizeDesignPartnerManifest(manifest(), NOW);
  let generated = false;
  let transacted = false;

  await assert.rejects(
    rotateDesignPartnerInvite(
      {
        $transaction: async () => {
          transacted = true;
        },
      },
      normalized,
      {
        now: NOW,
        confirmation: "wrong",
        manifestHmacKey: MANIFEST_HMAC_KEY,
        operationReason: "Rotate expired onboarding invitation",
        requestId: "UNIT-ROTATE-0002",
        runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
        tokenFactory: () => {
          generated = true;
          return "should-not-be-generated-000000000000000000000";
        },
        webUrl: "https://partner-club.leetplus.ru",
      },
    ),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === "CONFIRMATION_REQUIRED",
  );
  assert.equal(generated, false);
  assert.equal(transacted, false);
});
