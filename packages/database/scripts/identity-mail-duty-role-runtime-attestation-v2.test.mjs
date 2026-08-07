import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_EPOCH_DIGEST_DOMAIN,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_REASON_CODES,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_GRANTS_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_KIND,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_LIFETIME_MS,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MIGRATION_COUNT,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROLE_NAMES,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONFIRMATION,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256,
  IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN,
  IdentityMailDutyRoleRuntimeAttestationV2Error,
  PINNED_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS,
  identityMailDutyRoleRuntimeAttestationV2PayloadDigest,
  identityMailDutyRoleRuntimeAttestationV2PublicKeyFingerprint,
  identityMailDutyRoleRuntimeAttestationV2StateDigest,
  isVerifiedIdentityMailDutyRoleRuntimeAttestationV2,
  verifyPinnedIdentityMailDutyRoleRuntimeAttestationV2Envelope,
  verifySyntheticIdentityMailDutyRoleRuntimeAttestationV2Envelope,
} from "./identity-mail-duty-role-runtime-attestation-v2.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  SCRIPT_DIR,
  "identity-mail-duty-role-runtime-attestation-v2.mjs",
);
const CANDIDATES_DIRECTORY = join(SCRIPT_DIR, "..", "migration-candidates");
const NOW = "2026-08-03T09:00:00.000Z";
const DATABASE_NAME = `lp_imdrra_${"a".repeat(30)}_ci`;
const KEY_ID = "identity-mail-duty-runtime-ci-1";
const DIGESTS = Object.freeze({
  aclEpochPayload: "f".repeat(64),
  actualContext: "1".repeat(64),
  applyReceipt: "0a".repeat(32),
  beforeCatalog: "0b".repeat(32),
  plan: "0c".repeat(32),
  evidence: "0d".repeat(32),
  directDutyAcl: "0e".repeat(32),
  databaseIdentity: "2".repeat(64),
  deploymentMarker: "3".repeat(64),
  exactGrants: "4".repeat(64),
  catalog: "5".repeat(64),
  ownerSurface: "6".repeat(64),
  applicationArtifact: "7".repeat(64),
  runtimeConfig: "8".repeat(64),
  verificationChallenge: "9".repeat(64),
  workerArtifact: "a".repeat(64),
  workerExecutable: "b".repeat(64),
});

const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: DATABASE_NAME,
  environment: "ci",
  explicitConfirmation:
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailDutyRoleRuntimeAttestationV2Error &&
      error.reasonCode === reasonCode &&
      error.code === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function roles(overrides = {}) {
  const value = {
    coordinator: {
      name: "identity_mail_enrollment_coordinator",
      oid: 16_387,
    },
    schemaOwner: {
      name: "identity_mail_schema_owner",
      oid: 16_386,
    },
    worker: {
      name: "identity_mail_worker_v2",
      oid: 16_388,
    },
  };
  for (const [key, override] of Object.entries(overrides)) {
    value[key] = { ...value[key], ...override };
  }
  return value;
}

function runtimeState(binding) {
  return {
    aclEpoch: binding.aclEpoch,
    aclEpochDigestDomain: binding.aclEpochDigestDomain,
    aclEpochPayloadDigest: binding.aclEpochPayloadDigest,
    aclReasonCode: binding.aclReasonCode,
    applicationRoleAllowlistBound: binding.applicationRoleAllowlistBound,
    applyReceiptDigest: binding.applyReceiptDigest,
    authorityScope: binding.authorityScope,
    beforeCatalogDigest: binding.beforeCatalogDigest,
    operationId: binding.operationId,
    catalogContract: binding.catalogContract,
    databaseIdentityDigest: binding.databaseIdentityDigest,
    databaseName: binding.databaseName,
    databaseOid: binding.databaseOid,
    catalogDigest: binding.catalogDigest,
    catalogProfile: binding.catalogProfile,
    crossDatabaseAuthorityControlled: binding.crossDatabaseAuthorityControlled,
    definitionManifestDigest: binding.definitionManifestDigest,
    deploymentRoleName: binding.deploymentRoleName,
    deploymentRoleOid: binding.deploymentRoleOid,
    directDutyAclDigest: binding.directDutyAclDigest,
    evidenceDigest: binding.evidenceDigest,
    exactGrantsDigest: binding.exactGrantsDigest,
    exactGrantsProfile: binding.exactGrantsProfile,
    futureCreatorDefaultPrivilegesControlled:
      binding.futureCreatorDefaultPrivilegesControlled,
    ownerSurfaceDigest: binding.ownerSurfaceDigest,
    planDigest: binding.planDigest,
    productionApplyAuthorized: binding.productionApplyAuthorized,
    roles: binding.roles,
    systemPublicAclBaselineDigest: binding.systemPublicAclBaselineDigest,
  };
}

function withStateDigest(binding) {
  return {
    ...binding,
    runtimeStateDigest: identityMailDutyRoleRuntimeAttestationV2StateDigest(
      runtimeState(binding),
    ),
  };
}

function expectedBindings(overrides = {}) {
  return withStateDigest({
    ...IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE,
    actualContextDigest: DIGESTS.actualContext,
    aclEpoch: "11",
    aclEpochDigestDomain:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_EPOCH_DIGEST_DOMAIN,
    aclEpochPayloadDigest: DIGESTS.aclEpochPayload,
    aclReasonCode: "APPLY",
    operationId: "11111111-1111-4111-8111-111111111111",
    applicationContract:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_APPLICATION_CONTRACT,
    catalogContract:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_CONTRACT,
    databaseIdentityDigest: DIGESTS.databaseIdentity,
    databaseName: DATABASE_NAME,
    databaseOid: 16_384,
    deploymentRoleName: "leetplus_owner",
    deploymentRoleOid: 16_385,
    deploymentMarkerDigest: DIGESTS.deploymentMarker,
    deploymentMarkerId: "22222222-2222-4222-8222-222222222222",
    applyReceiptDigest: DIGESTS.applyReceipt,
    beforeCatalogDigest: DIGESTS.beforeCatalog,
    planDigest: DIGESTS.plan,
    definitionManifestDigest:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256,
    evidenceDigest: DIGESTS.evidence,
    directDutyAclDigest: DIGESTS.directDutyAcl,
    systemPublicAclBaselineDigest:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256,
    exactGrantsDigest: DIGESTS.exactGrants,
    exactGrantsProfile:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_GRANTS_PROFILE,
    migrationManifestDigest:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256,
    migrationHeadChecksum:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256,
    catalogDigest: DIGESTS.catalog,
    catalogProfile:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CATALOG_PROFILE,
    migrationCount:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MIGRATION_COUNT,
    ownerSurfaceDigest: DIGESTS.ownerSurface,
    applicationArtifactSha256: DIGESTS.applicationArtifact,
    applicationReleaseSha: "c".repeat(40),
    roles: roles(),
    runtimeConfigDigest: DIGESTS.runtimeConfig,
    schemaHead: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD,
    verificationChallengeDigest: DIGESTS.verificationChallenge,
    workerArtifactSha256: DIGESTS.workerArtifact,
    workerExecutableSha256: DIGESTS.workerExecutable,
    ...overrides,
  });
}

function authority(rootOverrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    identityMailDutyRoleRuntimeAttestationV2PublicKeyFingerprint(publicKeyPem);
  const root = {
    algorithm:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2026-08-04T00:00:00.000Z",
    notBefore: "2026-08-03T00:00:00.000Z",
    profile: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE,
    status: "ACTIVE",
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN,
    ...rootOverrides,
  };
  return {
    privateKey,
    publicKeyFingerprint,
    roots: { [KEY_ID]: root },
  };
}

function payloadFor(signer, expected, overrides = {}) {
  return {
    ...expected,
    roles: {
      coordinator: { ...expected.roles.coordinator },
      schemaOwner: { ...expected.roles.schemaOwner },
      worker: { ...expected.roles.worker },
    },
    attestationId: "33333333-3333-4333-8333-333333333333",
    contract: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CONTRACT,
    issuedAt: "2026-08-03T08:59:00.000Z",
    kind: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_KIND,
    profile: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PROFILE,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    purpose: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PURPOSE,
    schemaVersion: 2,
    signingKeyId: KEY_ID,
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TRUST_DOMAIN,
    validUntil: "2026-08-03T09:03:00.000Z",
    ...overrides,
  };
}

function envelopeFor(payload, privateKey, overrides = {}) {
  return {
    payload,
    payloadDigest:
      identityMailDutyRoleRuntimeAttestationV2PayloadDigest(payload),
    publicKeyFingerprint: payload.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
    ...overrides,
  };
}

function fixture(bindingOverrides = {}) {
  const signer = authority();
  const expected = expectedBindings(bindingOverrides);
  const payload = payloadFor(signer, expected);
  return {
    envelope: envelopeFor(payload, signer.privateKey),
    expected,
    signer,
  };
}

function verify(value, expected = value.expected, context = SYNTHETIC_CONTEXT) {
  return verifySyntheticIdentityMailDutyRoleRuntimeAttestationV2Envelope(
    value.envelope,
    expected,
    value.signer.roots,
    context,
    NOW,
  );
}

function resign(value, payloadOverrides) {
  const payload = { ...value.envelope.payload, ...payloadOverrides };
  return {
    ...value,
    envelope: envelopeFor(payload, value.signer.privateKey),
  };
}

function resignWithState(value, payloadOverrides) {
  const payload = { ...value.envelope.payload, ...payloadOverrides };
  payload.runtimeStateDigest =
    identityMailDutyRoleRuntimeAttestationV2StateDigest(runtimeState(payload));
  return resign(value, payload);
}

test("verifies one role-level CURRENT186 snapshot without granting authority", () => {
  const verified = verify(fixture());
  assert.equal(
    isVerifiedIdentityMailDutyRoleRuntimeAttestationV2(verified),
    true,
  );
  assert.equal(verified.authorization, false);
  assert.equal(verified.canMutate, false);
  assert.equal(verified.canSend, false);
  assert.equal(verified.liveDatabaseAssertionRequired, true);
  assert.equal(verified.tenantReadinessRequired, true);
  assert.equal(verified.verifiedAt, NOW);
  assert.equal(verified.envelope.payload.applicationRoleAllowlistBound, false);
  assert.equal(
    verified.envelope.payload.authorityScope,
    "CURRENT_DATABASE_ONLY",
  );
  assert.equal(
    verified.envelope.payload.crossDatabaseAuthorityControlled,
    false,
  );
  assert.equal(
    verified.envelope.payload.futureCreatorDefaultPrivilegesControlled,
    false,
  );
  assert.equal(verified.envelope.payload.productionApplyAuthorized, false);
  assert(Object.isFrozen(verified));
  assert(Object.isFrozen(verified.envelope));
  assert(Object.isFrozen(verified.envelope.payload));
  assert(Object.isFrozen(verified.envelope.payload.roles));
  assert(Object.isFrozen(verified.envelope.payload.roles.worker));
  assert.equal(Object.hasOwn(verified, "tenantIds"), false);
  assert.equal(
    Object.hasOwn(verified.envelope.payload, "tenantBindings"),
    false,
  );
});

test("pins exact CURRENT186 head, count, normalized SQL and manifest digests", async () => {
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD,
    "20260803010000_identity_mail_duty_role_runtime_boundary_v2",
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MIGRATION_COUNT,
    186,
  );
  assert.deepEqual(IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROLE_NAMES, {
    coordinator: "identity_mail_enrollment_coordinator",
    schemaOwner: "identity_mail_schema_owner",
    worker: "identity_mail_worker_v2",
  });
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ACL_REASON_CODES,
    ["APPLY", "EMERGENCY_CONTAINMENT", "ROLLBACK", "ROTATE"],
  );
  assert.deepEqual(IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE, {
    applicationRoleAllowlistBound: false,
    authorityScope: "CURRENT_DATABASE_ONLY",
    crossDatabaseAuthorityControlled: false,
    futureCreatorDefaultPrivilegesControlled: false,
    productionApplyAuthorized: false,
  });
  assert(Object.isFrozen(IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCOPE));
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256,
    /^(?!0{64}$)[0-9a-f]{64}$/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256,
    /^(?!0{64}$)[0-9a-f]{64}$/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256,
    /^(?!0{64}$)[0-9a-f]{64}$/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256,
    /^(?!0{64}$)[0-9a-f]{64}$/u,
  );
  assert.equal(
    sha256(
      Buffer.from(
        normalizeSql(
          await readFile(
            join(
              CANDIDATES_DIRECTORY,
              IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SCHEMA_HEAD,
              "migration.sql",
            ),
            "utf8",
          ),
        ),
        "utf8",
      ),
    ),
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256,
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MIGRATION_SHA256,
    "83c5df307d60548ffe3b009ec35b2faba5a37b1618d8dd88a1c571ce697d48b4",
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_HEAD_MANIFEST_SHA256,
    "cf354d5bb94069978b4b63b35e2fec1464822c682513b5c3c982f63fc472dc8e",
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256,
    "46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be",
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256,
    "ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117",
  );

  for (const mutation of [
    { aclEpochDigestDomain: "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_V1" },
    { aclEpochPayloadDigest: "0".repeat(64) },
    { aclReasonCode: "DEPLOY" },
    { migrationCount: 185 },
    {
      schemaHead: "20260802030000_identity_mail_enrollment_evidence_ledger_v2",
    },
    { migrationHeadChecksum: "d".repeat(64) },
    { migrationManifestDigest: "e".repeat(64) },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }
});

test("binds the exact CURRENT186 deployment receipt, live ACL and scope evidence", () => {
  const verified = verify(fixture());
  const payload = verified.envelope.payload;
  assert.equal(payload.deploymentRoleName, "leetplus_owner");
  assert.equal(payload.deploymentRoleOid, 16_385);
  assert.equal(payload.applyReceiptDigest, DIGESTS.applyReceipt);
  assert.equal(payload.beforeCatalogDigest, DIGESTS.beforeCatalog);
  assert.equal(payload.planDigest, DIGESTS.plan);
  assert.equal(
    payload.definitionManifestDigest,
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_DEFINITION_MANIFEST_SHA256,
  );
  assert.equal(payload.evidenceDigest, DIGESTS.evidence);
  assert.equal(payload.directDutyAclDigest, DIGESTS.directDutyAcl);
  assert.equal(
    payload.systemPublicAclBaselineDigest,
    IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYSTEM_PUBLIC_ACL_BASELINE_SHA256,
  );

  for (const mutation of [
    { applicationRoleAllowlistBound: true },
    { authorityScope: "CLUSTER_WIDE" },
    { crossDatabaseAuthorityControlled: true },
    { futureCreatorDefaultPrivilegesControlled: true },
    { productionApplyAuthorized: true },
    { definitionManifestDigest: "d".repeat(64) },
    { systemPublicAclBaselineDigest: "e".repeat(64) },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }

  for (const field of [
    "applyReceiptDigest",
    "beforeCatalogDigest",
    "planDigest",
    "evidenceDigest",
    "directDutyAclDigest",
  ]) {
    expectCode(
      () => verify(resign(fixture(), { [field]: "0".repeat(64) })),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }

  for (const [field, digest] of [
    ["applyReceiptDigest", "1a".repeat(32)],
    ["beforeCatalogDigest", "1b".repeat(32)],
    ["planDigest", "1c".repeat(32)],
    ["evidenceDigest", "1d".repeat(32)],
    ["directDutyAclDigest", "1e".repeat(32)],
  ]) {
    const value = fixture();
    expectCode(
      () => verify(resignWithState(value, { [field]: digest })),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }
});

test("deployment role and expanded runtime-state shapes are exact", () => {
  const postgresOwner = verify(
    fixture({ deploymentRoleName: "postgres", deploymentRoleOid: 20_000 }),
  );
  assert.equal(postgresOwner.envelope.payload.deploymentRoleName, "postgres");
  assert.equal(postgresOwner.envelope.payload.deploymentRoleOid, 20_000);

  for (const mutation of [
    { deploymentRoleName: "leetplus_runtime_owner" },
    { deploymentRoleOid: 20_001 },
  ]) {
    const value = fixture();
    expectCode(
      () => verify(resignWithState(value, mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }

  for (const mutation of [
    { deploymentRoleName: "identity_mail_schema_owner" },
    { deploymentRoleName: "public" },
    { deploymentRoleName: "pg_database_owner" },
    { deploymentRoleOid: 16_386 },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }

  const expandedFields = [
    "applicationRoleAllowlistBound",
    "applyReceiptDigest",
    "authorityScope",
    "beforeCatalogDigest",
    "crossDatabaseAuthorityControlled",
    "definitionManifestDigest",
    "deploymentRoleName",
    "deploymentRoleOid",
    "directDutyAclDigest",
    "evidenceDigest",
    "futureCreatorDefaultPrivilegesControlled",
    "planDigest",
    "productionApplyAuthorized",
    "systemPublicAclBaselineDigest",
  ];
  for (const field of expandedFields) {
    const missingExpected = fixture();
    delete missingExpected.expected[field];
    expectCode(
      () => verify(missingExpected),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
    );

    const missingPayload = fixture();
    const payload = { ...missingPayload.envelope.payload };
    delete payload[field];
    missingPayload.envelope = envelopeFor(
      payload,
      missingPayload.signer.privateKey,
    );
    expectCode(
      () => verify(missingPayload),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PAYLOAD_INVALID",
    );
  }

  const extraState = runtimeState(expectedBindings());
  extraState.unexpected = true;
  expectCode(
    () => identityMailDutyRoleRuntimeAttestationV2StateDigest(extraState),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_STATE_INVALID",
  );
  const missingState = runtimeState(expectedBindings());
  delete missingState.evidenceDigest;
  expectCode(
    () => identityMailDutyRoleRuntimeAttestationV2StateDigest(missingState),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_STATE_INVALID",
  );
});

test("canonical JSON is key-order independent while shapes stay exact", () => {
  const value = fixture();
  value.envelope.payload = Object.fromEntries(
    Object.entries(value.envelope.payload).reverse(),
  );
  assert.equal(verify(value).canSend, false);

  const extraPayload = fixture();
  extraPayload.envelope.payload.extra = true;
  expectCode(
    () => verify(extraPayload),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_PAYLOAD_INVALID",
  );

  const missingExpected = fixture();
  delete missingExpected.expected.workerArtifactSha256;
  expectCode(
    () => verify(missingExpected),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );
});

test("rejects hostile prototypes, accessors, symbols and transparent proxies", () => {
  const inherited = fixture();
  Object.setPrototypeOf(inherited.envelope.payload.roles.worker, {
    inherited: true,
  });
  expectCode(
    () => verify(inherited),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
  );

  const accessor = fixture();
  let observed = false;
  Object.defineProperty(accessor.expected.roles.worker, "oid", {
    enumerable: true,
    get() {
      observed = true;
      return 16_388;
    },
  });
  expectCode(
    () => verify(accessor),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );
  assert.equal(observed, false);

  const symbol = fixture();
  symbol.envelope[Symbol("extra")] = true;
  expectCode(
    () => verify(symbol),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ENVELOPE_INVALID",
  );

  const proxied = fixture();
  proxied.expected.roles = new Proxy(proxied.expected.roles, {});
  expectCode(
    () => verify(proxied),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );

  const sparse = fixture();
  sparse.expected.roles = new Array(3);
  expectCode(
    () => verify(sparse),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );

  const extraRoleKey = fixture();
  extraRoleKey.expected.roles.unexpected = {
    name: "identity_mail_unexpected",
    oid: 20_000,
  };
  expectCode(
    () => verify(extraRoleKey),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );
});

test("challenge and short timeline reject replay and expiry", () => {
  const prior = fixture();
  const nextExpected = expectedBindings({
    verificationChallengeDigest: "c".repeat(64),
  });
  expectCode(
    () => verify(prior, nextExpected),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
  );

  for (const mutation of [
    { validUntil: NOW },
    { issuedAt: "2026-08-03T09:00:30.001Z" },
    {
      issuedAt: "2026-08-03T08:50:00.000Z",
      validUntil: new Date(
        Date.parse("2026-08-03T08:50:00.000Z") +
          IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_MAX_LIFETIME_MS +
          1,
      ).toISOString(),
    },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_TIMELINE_INVALID",
    );
  }
});

test("binds deployment marker, actual context and database identity", () => {
  for (const mutation of [
    { actualContextDigest: "c".repeat(64) },
    { deploymentMarkerDigest: "d".repeat(64) },
    { deploymentMarkerId: "44444444-4444-4444-8444-444444444444" },
    { databaseIdentityDigest: "e".repeat(64) },
    { databaseName: `lp_imdrra_${"b".repeat(30)}_ci` },
    { databaseOid: 16_389 },
  ]) {
    const base = fixture();
    const changed = { ...base.envelope.payload, ...mutation };
    if (
      Object.hasOwn(mutation, "databaseIdentityDigest") ||
      Object.hasOwn(mutation, "databaseName") ||
      Object.hasOwn(mutation, "databaseOid")
    ) {
      changed.runtimeStateDigest =
        identityMailDutyRoleRuntimeAttestationV2StateDigest(
          runtimeState(changed),
        );
    }
    expectCode(
      () => verify(resign(base, changed)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }

  const wrongSyntheticDatabase = {
    ...SYNTHETIC_CONTEXT,
    databaseName: `lp_imdrra_${"b".repeat(30)}_ci`,
  };
  expectCode(
    () => verify(fixture(), fixture().expected, wrongSyntheticDatabase),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONTEXT_DENIED",
  );
});

test("drop/recreate role and database OID changes are detected", () => {
  for (const [roleKey, oid] of [
    ["schemaOwner", 20_002],
    ["coordinator", 20_003],
    ["worker", 20_004],
  ]) {
    const value = fixture();
    const changed = {
      ...value.envelope.payload,
      roles: roles({ [roleKey]: { oid } }),
    };
    changed.runtimeStateDigest =
      identityMailDutyRoleRuntimeAttestationV2StateDigest(
        runtimeState(changed),
      );
    expectCode(
      () => verify(resign(value, changed)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }

  for (const invalidRoles of [
    roles({ worker: { oid: 16_387 } }),
    roles({ worker: { name: "identity_mail_enrollment_coordinator" } }),
    roles({ worker: { name: "postgres" } }),
    roles({ worker: { name: "pg_monitor" } }),
  ]) {
    expectCode(
      () => verify(resign(fixture(), { roles: invalidRoles })),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }
});

test("ACL epoch, operation and catalog drift are exact and fail closed", () => {
  for (const mutation of [
    { applicationContract: "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_V1" },
    { catalogContract: "IDENTITY_MAIL_DUTY_ROLE_ACL_CATALOG_CURRENT186_V1" },
    { catalogProfile: "IDENTITY_MAIL_DUTY_ROLE_ACL_PG16_V1" },
    { exactGrantsProfile: "IDENTITY_MAIL_DUTY_GRANTS_PG16_V2" },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }

  for (const mutation of [
    { aclEpoch: "12" },
    { operationId: "55555555-5555-4555-8555-555555555555" },
    { catalogDigest: "c".repeat(64) },
    { exactGrantsDigest: "d".repeat(64) },
    { ownerSurfaceDigest: "e".repeat(64) },
  ]) {
    const value = fixture();
    const changed = { ...value.envelope.payload, ...mutation };
    changed.runtimeStateDigest =
      identityMailDutyRoleRuntimeAttestationV2StateDigest(
        runtimeState(changed),
      );
    expectCode(
      () => verify(resign(value, changed)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }

  for (const aclEpoch of [0, 1, "0", "01", "-1", "9223372036854775808"]) {
    expectCode(
      () => verify(resign(fixture(), { aclEpoch })),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
    );
  }
});

test("torn signed or observed state is rejected before comparison", () => {
  const signedTorn = resign(fixture(), {
    catalogDigest: "c".repeat(64),
  });
  expectCode(
    () => verify(signedTorn),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_RELEASE_BINDING_INVALID",
  );

  const observedTorn = fixture();
  observedTorn.expected.ownerSurfaceDigest = "d".repeat(64);
  expectCode(
    () => verify(observedTorn),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDINGS_INVALID",
  );
});

test("binds release, artifact, executable and runtime configuration", () => {
  for (const mutation of [
    { applicationReleaseSha: "d".repeat(40) },
    { applicationArtifactSha256: "c".repeat(64) },
    { workerArtifactSha256: "d".repeat(64) },
    { workerExecutableSha256: "e".repeat(64) },
    { runtimeConfigDigest: "f".repeat(64) },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_EXPECTED_BINDING_MISMATCH",
    );
  }
});

test("rejects cross-purpose roots, malformed signatures and envelope drift", () => {
  for (const rootMutation of [
    { status: "REVOKED" },
    { purpose: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND" },
    { profile: "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE_V1" },
    { trustDomain: "LEETPLUS_SHARED_BETA_DEPLOYMENT_AUTHORITY_V1" },
    { publicKeyFingerprint: "f".repeat(64) },
  ]) {
    const value = fixture();
    value.signer.roots[KEY_ID] = {
      ...value.signer.roots[KEY_ID],
      ...rootMutation,
    };
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
    );
  }

  const malformed = fixture();
  malformed.envelope.signature = "AA";
  expectCode(
    () => verify(malformed),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SIGNATURE_INVALID",
  );

  const digestMismatch = fixture();
  digestMismatch.envelope.payloadDigest = "f".repeat(64);
  expectCode(
    () => verify(digestMismatch),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ENVELOPE_BINDING_INVALID",
  );

  const proxiedRoots = fixture();
  proxiedRoots.signer.roots = new Proxy(proxiedRoots.signer.roots, {});
  expectCode(
    () => verify(proxiedRoots),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
  );

  const accessorRoot = fixture();
  let rootAccessorObserved = false;
  Object.defineProperty(accessorRoot.signer.roots[KEY_ID], "status", {
    enumerable: true,
    get() {
      rootAccessorObserved = true;
      return "ACTIVE";
    },
  });
  expectCode(
    () => verify(accessorRoot),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOT_INVALID",
  );
  assert.equal(rootAccessorObserved, false);

  const symbolRoots = fixture();
  symbolRoots.signer.roots[Symbol("extra")] = true;
  expectCode(
    () => verify(symbolRoots),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
  );

  const sparseRoots = fixture();
  sparseRoots.signer.roots = new Array(1);
  expectCode(
    () => verify(sparseRoots),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS_INVALID",
  );
});

test("production roots are frozen-empty and cannot be caller-injected", () => {
  const value = fixture();
  assert.deepEqual(
    Object.keys(PINNED_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS),
    [],
  );
  assert(
    Object.isFrozen(
      PINNED_IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ROOTS,
    ),
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailDutyRoleRuntimeAttestationV2Envelope(
        value.envelope,
        value.expected,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailDutyRoleRuntimeAttestationV2Envelope(
        value.envelope,
        value.expected,
        value.signer.roots,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
  );
});

test("synthetic roots require exact confirmed loopback CI context and now", () => {
  for (const overrides of [
    { hostname: "worker.example.com" },
    { hostname: "LOCALHOST" },
    { environment: "production" },
    { nodeEnv: "production" },
    { explicitConfirmation: "yes" },
    { databaseName: "leetplus_prod" },
  ]) {
    expectCode(
      () =>
        verify(fixture(), fixture().expected, {
          ...SYNTHETIC_CONTEXT,
          ...overrides,
        }),
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_SYNTHETIC_CONTEXT_DENIED",
    );
  }

  const value = fixture();
  expectCode(
    () =>
      verifySyntheticIdentityMailDutyRoleRuntimeAttestationV2Envelope(
        value.envelope,
        value.expected,
        value.signer.roots,
        SYNTHETIC_CONTEXT,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_ARGUMENTS_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticIdentityMailDutyRoleRuntimeAttestationV2Envelope(
        value.envelope,
        value.expected,
        value.signer.roots,
        SYNTHETIC_CONTEXT,
        "2026-08-03T09:00:00Z",
      ),
    "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_ATTESTATION_V2_CURRENT_TIME_INVALID",
  );
});

test("brands only verified objects and exposes no implicit authority path", async () => {
  const verified = verify(fixture());
  assert.equal(
    isVerifiedIdentityMailDutyRoleRuntimeAttestationV2(verified),
    true,
  );
  assert.equal(
    isVerifiedIdentityMailDutyRoleRuntimeAttestationV2({ ...verified }),
    false,
  );
  assert.equal(isVerifiedIdentityMailDutyRoleRuntimeAttestationV2(null), false);
  assert.equal(
    isVerifiedIdentityMailDutyRoleRuntimeAttestationV2(verified, true),
    false,
  );

  const serialized = canonicalStringify(verified);
  assert.doesNotMatch(
    serialized,
    /@|email|password|token|tenantId|tenantBindings/iu,
  );

  const source = await readFile(CONTRACT_PATH, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  assert.deepEqual(importSpecifiers, [
    "node:crypto",
    "node:util",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.doesNotMatch(source, /tenantBindings|tenantIds|maxTenants/iu);
  assert.doesNotMatch(source, /function\s+[a-zA-Z0-9_]+\([^)]*=/u);
  assert.doesNotMatch(
    source,
    /@prisma|PrismaClient|@nestjs|nodemailer|smtp|fetch\s*\(|node:net|node:http|node:https|DATABASE_URL|\$executeRaw|\$queryRaw/iu,
  );
  assert.match(source, /authorization:\s*false/u);
  assert.match(source, /canMutate:\s*false/u);
  assert.match(source, /canSend:\s*false/u);
  assert.match(source, /liveDatabaseAssertionRequired:\s*true/u);
  assert.match(source, /tenantReadinessRequired:\s*true/u);
});
