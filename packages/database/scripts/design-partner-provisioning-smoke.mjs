import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { DESIGN_PARTNER_REQUIRED_ENV } from "./design-partner-access-profile.mjs";
import {
  hashInviteToken,
  normalizeDesignPartnerManifest,
  previewDesignPartnerProvisioning,
  provisionDesignPartner,
  rotateDesignPartnerInvite,
  suspendDesignPartner,
} from "./design-partner-provisioning.mjs";

const REQUIRED_CONFIRMATION = "run-design-partner-provisioning-smoke";
const MANIFEST_HMAC_KEY = "synthetic-design-partner-manifest-hmac-key-aaaaaaaa";

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
}

try {
  assert.equal(
    await prisma.tenant.count(),
    0,
    "Smoke requires the clean dedicated migration database.",
  );
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
      reason: "Disposable design-partner provisioning smoke",
      supportTicket: "CI-DP",
      accessExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    },
    now,
  );

  const preview = await previewDesignPartnerProvisioning(prisma, manifest, {
    manifestHmacKey: MANIFEST_HMAC_KEY,
  });
  assert.equal(preview.decision, "READY_TO_PROVISION");

  const provisioned = await provisionDesignPartner(prisma, manifest, {
    now,
    confirmation: `PROVISION ${manifest.tenantSlug}`,
    manifestHmacKey: MANIFEST_HMAC_KEY,
    runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
    tokenFactory: () => "ci-design-partner-token-000000000000000000000000",
    webUrl: "https://design-partner-smoke.leetplus.ru",
  });
  assert.equal(provisioned.decision, "PROVISIONED_SUSPENDED");
  assert.equal(provisioned.tenant.status, "SUSPENDED");
  assert.equal(provisioned.store.isActive, false);
  assert.equal(provisioned.store.gamificationEnabled, false);
  assert.equal(
    provisioned.ownerInvite.expiresAt,
    manifest.accessExpiresAt.toISOString(),
  );
  assert.match(
    provisioned.ownerInvite.url,
    /^https:\/\/design-partner-smoke\.leetplus\.ru/,
  );
  tenantId = provisioned.tenant.id;

  const repeated = await provisionDesignPartner(prisma, manifest, {
    now,
    confirmation: `PROVISION ${manifest.tenantSlug}`,
    manifestHmacKey: MANIFEST_HMAC_KEY,
    runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
    tokenFactory: () => {
      throw new Error("An idempotent repeat must not generate another token.");
    },
    webUrl: "https://design-partner-smoke.leetplus.ru",
  });
  assert.equal(repeated.decision, "ALREADY_PROVISIONED");
  assert.equal(repeated.inviteUrl, null);

  const rotatedAt = new Date(now.getTime() + 500);
  const generatedRotationTokens = [];
  const rotationAttempts = await Promise.all(
    [
      "ci-rotated-design-partner-token-a-000000000000000000",
      "ci-rotated-design-partner-token-b-000000000000000000",
    ].map((candidateToken) =>
      rotateDesignPartnerInvite(prisma, manifest, {
        now: rotatedAt,
        confirmation: `ROTATE_INVITE ${manifest.tenantSlug}`,
        manifestHmacKey: MANIFEST_HMAC_KEY,
        operationReason: "Rotate synthetic onboarding invite in CI smoke",
        operationTicket: "CI-DP-ROTATE",
        requestId: "CI-DP-ROTATE-0001",
        runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
        tokenFactory: () => {
          generatedRotationTokens.push(candidateToken);
          return candidateToken;
        },
        webUrl: "https://design-partner-smoke.leetplus.ru",
      }),
    ),
  );
  const rotated = rotationAttempts.find(
    (attempt) => attempt.decision === "INVITE_ROTATED",
  );
  const concurrentReplay = rotationAttempts.find(
    (attempt) => attempt.decision === "INVITE_ROTATION_ALREADY_APPLIED",
  );
  assert.ok(rotated);
  assert.ok(concurrentReplay);
  assert.equal(generatedRotationTokens.length, 1);
  assert.equal(rotated.decision, "INVITE_ROTATED");
  assert.equal(rotated.previousPendingInvitesRevoked, 1);
  assert.match(
    rotated.ownerInvite.url,
    /^https:\/\/design-partner-smoke\.leetplus\.ru/,
  );
  const inviteStateAfterRotation = await prisma.userInvite.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { tokenHash: true, expiresAt: true, acceptedAt: true },
  });
  assert.equal(inviteStateAfterRotation.length, 2);
  assert.equal(
    inviteStateAfterRotation.filter(
      (invite) => invite.acceptedAt === null && invite.expiresAt > rotatedAt,
    ).length,
    1,
  );
  assert.equal(
    inviteStateAfterRotation[1].tokenHash,
    hashInviteToken(generatedRotationTokens[0]),
  );
  assert.notEqual(
    inviteStateAfterRotation[1].tokenHash,
    generatedRotationTokens[0],
  );

  const repeatedRotation = await rotateDesignPartnerInvite(prisma, manifest, {
    now: new Date(rotatedAt.getTime() + 100),
    confirmation: `ROTATE_INVITE ${manifest.tenantSlug}`,
    manifestHmacKey: MANIFEST_HMAC_KEY,
    operationReason: "Retry synthetic onboarding invite rotation",
    operationTicket: "CI-DP-ROTATE",
    requestId: "CI-DP-ROTATE-0001",
    runtimeEnv: DESIGN_PARTNER_REQUIRED_ENV,
    tokenFactory: () => {
      throw new Error(
        "An idempotent invite rotation repeat must not generate a token.",
      );
    },
    webUrl: "https://design-partner-smoke.leetplus.ru",
  });
  assert.equal(repeatedRotation.decision, "INVITE_ROTATION_ALREADY_APPLIED");
  assert.equal(await prisma.userInvite.count({ where: { tenantId } }), 2);

  const postRotationPreview = await previewDesignPartnerProvisioning(
    prisma,
    manifest,
    {
      now: new Date(rotatedAt.getTime() + 200),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    },
  );
  assert.equal(postRotationPreview.decision, "ALREADY_PROVISIONED");

  const rotationAudit = await prisma.platformAdminAuditEvent.findFirstOrThrow({
    where: {
      tenantId,
      action: "SINGLE_DESIGN_PARTNER_INVITE_ROTATED",
    },
    select: {
      action: true,
      targetType: true,
      targetId: true,
      reason: true,
      metadata: true,
    },
  });
  const duplicateRotationAudit = await prisma.platformAdminAuditEvent.create({
    data: {
      tenantId,
      ...rotationAudit,
    },
    select: { id: true },
  });
  await assert.rejects(
    previewDesignPartnerProvisioning(prisma, manifest, {
      now: new Date(rotatedAt.getTime() + 250),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) => error?.code === "PROVISIONING_EVIDENCE_MISSING",
  );
  await prisma.platformAdminAuditEvent.delete({
    where: { id: duplicateRotationAudit.id },
  });

  const latestInvite = await prisma.userInvite.findFirstOrThrow({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, tokenHash: true, expiresAt: true },
  });
  await prisma.userInvite.update({
    where: { id: latestInvite.id },
    data: { tokenHash: "0".repeat(64) },
  });
  await assert.rejects(
    previewDesignPartnerProvisioning(prisma, manifest, {
      now: new Date(rotatedAt.getTime() + 300),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) => error?.code === "PROVISIONING_EVIDENCE_MISSING",
  );
  await prisma.userInvite.update({
    where: { id: latestInvite.id },
    data: { tokenHash: latestInvite.tokenHash },
  });

  await prisma.userInvite.update({
    where: { id: latestInvite.id },
    data: {
      expiresAt: new Date(manifest.accessExpiresAt.getTime() + 60 * 1000),
    },
  });
  await assert.rejects(
    previewDesignPartnerProvisioning(prisma, manifest, {
      now: new Date(rotatedAt.getTime() + 400),
      manifestHmacKey: MANIFEST_HMAC_KEY,
    }),
    (error) => error?.code === "PROVISIONING_EVIDENCE_MISSING",
  );
  await prisma.userInvite.update({
    where: { id: latestInvite.id },
    data: { expiresAt: latestInvite.expiresAt },
  });

  assert.ok(Object.keys(DESIGN_PARTNER_REQUIRED_ENV).length > 10);

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
    where: { id: provisioned.store.id },
    data: { isActive: true, gamificationEnabled: true },
  });

  const suspended = await suspendDesignPartner(prisma, manifest, {
    now: new Date(now.getTime() + 1000),
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
    finalState.userInvites.every(
      (invite) => invite.expiresAt <= new Date(now.getTime() + 1000),
    ),
  );

  process.stdout.write(
    "Design-partner provisioning PostgreSQL smoke passed: empty-database guard, suspended bootstrap, idempotent concurrent invite rotation, HMAC-bound invite receipts and drift-tolerant emergency suspend.\n",
  );
} finally {
  await cleanup();
  await prisma.$disconnect();
}
