import assert from "node:assert/strict";
import {
  DESIGN_PARTNER_OWNER_CAPABILITIES,
  DESIGN_PARTNER_PROFILE_VERSION,
} from "./design-partner-access-profile.mjs";
import {
  computeDesignPartnerManifestDigest,
  computeDesignPartnerProvisionedInviteDigest,
  DesignPartnerProvisioningError,
  hashInviteToken,
  normalizeDesignPartnerManifest,
  previewDesignPartnerProvisioning,
  provisionDesignPartner,
  rotateDesignPartnerInvite,
  suspendDesignPartner,
} from "./design-partner-provisioning.mjs";
import { assertDesignPartnerSmokeDatabaseTarget } from "./design-partner-provisioning-smoke-target.mjs";

const REQUIRED_CONFIRMATION = "run-design-partner-provisioning-smoke";
const MANIFEST_HMAC_KEY = "synthetic-design-partner-manifest-hmac-key-aaaaaaaa";
const DISABLED_CODE = "DESIGN_PARTNER_IDENTITY_WRITER_DISABLED";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Design-partner smoke fixtures are prohibited in production.",
  );
}
if (
  process.env.DESIGN_PARTNER_PROVISIONING_SMOKE_CONFIRM !==
  REQUIRED_CONFIRMATION
) {
  throw new Error(
    `Set DESIGN_PARTNER_PROVISIONING_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );
}
assertDesignPartnerSmokeDatabaseTarget(process.env.DATABASE_URL);

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const now = new Date();
let tenantId = null;

async function cleanup() {
  if (!tenantId) return;

  await prisma.$transaction(async (tx) => {
    await tx.platformAdminAuditEvent.deleteMany({ where: { tenantId } });
    await tx.userInvite.deleteMany({ where: { tenantId } });
    await tx.userRoleOverride.deleteMany({ where: { tenantId } });
    await tx.integrationSource.deleteMany({ where: { tenantId } });
    await tx.integrationCredential.deleteMany({ where: { tenantId } });
    await tx.store.deleteMany({ where: { tenantId } });
    await tx.tenant.deleteMany({ where: { id: tenantId } });
  });
  const residue = await Promise.all([
    prisma.tenant.count({ where: { id: tenantId } }),
    prisma.userInvite.count({ where: { tenantId } }),
    prisma.platformAdminAuditEvent.count({ where: { tenantId } }),
    prisma.integrationSource.count({ where: { tenantId } }),
    prisma.integrationCredential.count({ where: { tenantId } }),
    prisma.store.count({ where: { tenantId } }),
  ]);
  assert.deepEqual(residue, [0, 0, 0, 0, 0, 0]);
  tenantId = null;
}

async function assertIdentityWriterDisabled(operation, manifest, confirmation) {
  let databaseAccessed = false;
  let tokenGenerated = false;
  const forbiddenClient = new Proxy(
    {},
    {
      get() {
        databaseAccessed = true;
        throw new Error("Disabled writer attempted database access");
      },
    },
  );

  await assert.rejects(
    operation(forbiddenClient, manifest, {
      confirmation,
      tokenFactory: () => {
        tokenGenerated = true;
        return "must-not-be-generated";
      },
    }),
    (error) =>
      error instanceof DesignPartnerProvisioningError &&
      error.code === DISABLED_CODE,
  );
  assert.equal(databaseAccessed, false);
  assert.equal(tokenGenerated, false);
}

try {
  assert.equal(
    await prisma.tenant.count(),
    0,
    "Smoke requires the clean dedicated migration database.",
  );
  assert.equal(await prisma.user.count(), 0);
  assert.equal(await prisma.userInvite.count(), 0);
  assert.equal(await prisma.identityEmailClaim.count(), 0);
  assert.equal(await prisma.platformAdminAuditEvent.count(), 0);
  const manifest = normalizeDesignPartnerManifest(
    {
      partnerAlias: "DP_SMOKE",
      tenantName: "Design Partner Smoke",
      tenantSlug: "design-partner-smoke",
      storeName: "Design Partner Store",
      storeAddress: "Synthetic address",
      storeCity: "Yekaterinburg",
      storeTimeZone: "Asia/Yekaterinburg",
      dataMode: "MANUAL_ONLY",
      ownerEmail: "design-partner-smoke@invalid.example",
      ownerFullName: "Synthetic Owner",
      supportOwnerAlias: "CI",
      reason: "Disposable design-partner isolation smoke",
      supportTicket: "CI-DP",
      accessExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    },
    now,
  );

  const emptyPreview = await previewDesignPartnerProvisioning(
    prisma,
    manifest,
    {
      manifestHmacKey: MANIFEST_HMAC_KEY,
    },
  );
  assert.equal(emptyPreview.decision, DISABLED_CODE);
  assert.equal(emptyPreview.sharedSealedIdentityActivationRequired, true);

  await assertIdentityWriterDisabled(
    provisionDesignPartner,
    manifest,
    `PROVISION ${manifest.tenantSlug}`,
  );
  await assertIdentityWriterDisabled(
    rotateDesignPartnerInvite,
    manifest,
    `ROTATE_INVITE ${manifest.tenantSlug}`,
  );
  assert.equal(await prisma.tenant.count(), 0);
  assert.equal(await prisma.userInvite.count(), 0);

  const fixture = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: manifest.tenantName,
        slug: manifest.tenantSlug,
        domain: manifest.tenantDomain,
        status: "SUSPENDED",
        statusChangedAt: now,
        statusReason: "Synthetic legacy isolation fixture",
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
      },
      select: { id: true, isActive: true, gamificationEnabled: true },
    });
    await tx.userRoleOverride.create({
      data: {
        tenantId: tenant.id,
        role: "OWNER",
        permissions: [...DESIGN_PARTNER_OWNER_CAPABILITIES],
      },
    });
    const inviteTokenHash = hashInviteToken(
      "synthetic-legacy-invite-token-for-disposable-smoke-only",
    );
    const invite = await tx.userInvite.create({
      data: {
        tenantId: tenant.id,
        email: manifest.ownerEmail,
        fullName: manifest.ownerFullName,
        role: "OWNER",
        accessScope: "NETWORK",
        storeIds: [],
        tokenHash: inviteTokenHash,
        expiresAt: manifest.accessExpiresAt,
      },
      select: { id: true, tokenHash: true, expiresAt: true },
    });
    const manifestDigest = computeDesignPartnerManifestDigest(
      manifest,
      MANIFEST_HMAC_KEY,
    );
    const ownerInviteDigest = computeDesignPartnerProvisionedInviteDigest(
      manifestDigest,
      tenant.id,
      store.id,
      invite.id,
      invite.tokenHash,
      invite.expiresAt,
      MANIFEST_HMAC_KEY,
    );
    await tx.platformAdminAuditEvent.create({
      data: {
        tenantId: tenant.id,
        action: "SINGLE_DESIGN_PARTNER_PROVISIONED",
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
          dedicatedDatabaseRequired: true,
          inviteEmailBound: true,
          initialTenantStatus: "SUSPENDED",
          outboundDefault: "OFF",
          manifestDigest,
          manifestHmacKeyVersion: "v1",
          ownerInviteId: invite.id,
          ownerInviteExpiresAt: invite.expiresAt.toISOString(),
          ownerInviteDigest,
        },
      },
    });
    return { tenant, store, invite };
  });
  tenantId = fixture.tenant.id;

  const legacyPreview = await previewDesignPartnerProvisioning(
    prisma,
    manifest,
    {
      now: new Date(now.getTime() + 100),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    },
  );
  assert.equal(legacyPreview.decision, "ALREADY_PROVISIONED");
  assert.equal(legacyPreview.tenant.status, "SUSPENDED");

  await prisma.userInvite.update({
    where: { id: fixture.invite.id },
    data: { tokenHash: "0".repeat(64) },
  });
  await assert.rejects(
    previewDesignPartnerProvisioning(prisma, manifest, {
      now: new Date(now.getTime() + 200),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) => error?.code === "PROVISIONING_EVIDENCE_MISSING",
  );
  await prisma.userInvite.update({
    where: { id: fixture.invite.id },
    data: { tokenHash: fixture.invite.tokenHash },
  });

  const credential = await prisma.integrationCredential.create({
    data: {
      tenantId,
      provider: "LANGAME",
      name: "Smoke credential",
      apiKeyEncrypted: "not-a-real-secret",
      isActive: true,
    },
  });
  await prisma.integrationSource.create({
    data: {
      tenantId,
      credentialId: credential.id,
      provider: "LANGAME",
      name: "Smoke source",
      baseUrl: "https://invalid.example",
      domain: "invalid.example",
      isActive: true,
    },
  });
  await prisma.store.update({
    where: { id: fixture.store.id },
    data: { isActive: true, gamificationEnabled: true },
  });

  const suspendedAt = new Date(now.getTime() + 1000);
  const suspended = await suspendDesignPartner(prisma, manifest, {
    now: suspendedAt,
    confirmation: `SUSPEND ${manifest.tenantSlug}`,
    manifestHmacKey: MANIFEST_HMAC_KEY,
    operationReason: "Exercise emergency design-partner suspension in CI",
    operationTicket: "CI-DP-SUSPEND",
  });
  assert.equal(suspended.decision, "SUSPENDED");
  assert.equal(suspended.effects.storesDisabled, 1);
  assert.equal(suspended.effects.integrationSourcesDisabled, 1);
  assert.equal(suspended.effects.integrationCredentialsDisabled, 1);
  assert.equal(suspended.effects.pendingInvitesRevoked, 1);

  const finalState = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      status: true,
      stores: { select: { isActive: true, gamificationEnabled: true } },
      integrationSources: { select: { isActive: true } },
      integrationCredentials: { select: { isActive: true } },
      userInvites: { select: { expiresAt: true } },
    },
  });
  assert.equal(finalState.status, "SUSPENDED");
  assert.deepEqual(finalState.stores, [
    { isActive: false, gamificationEnabled: false },
  ]);
  assert.deepEqual(finalState.integrationSources, [{ isActive: false }]);
  assert.deepEqual(finalState.integrationCredentials, [{ isActive: false }]);
  assert.ok(
    finalState.userInvites.every((invite) => invite.expiresAt <= suspendedAt),
  );

  process.stdout.write(
    "Design-partner writer-isolation PostgreSQL smoke passed: provision/rotate fail before DB/token, historical status stays read-only, and emergency suspend only narrows effects.\n",
  );
} finally {
  await cleanup();
  await prisma.$disconnect();
}
