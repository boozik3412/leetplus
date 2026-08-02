import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION,
  identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint,
} from "./identity-mail-tenant-enrollment-authority-v2.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
  identityMailDutyRoleManifestV2PublicKeyFingerprint,
} from "./identity-mail-duty-role-manifest-v2.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
  IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES,
  identityMailDutyRoleGrantsCurrent185Digest,
} from "./identity-mail-duty-role-grants-current185.mjs";
import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE,
  IdentityMailTenantEnrollmentManifestBoundV2Error,
  composePinnedIdentityMailTenantEnrollmentManifestBoundV2,
  identityMailTenantEnrollmentManifestBoundV2Evidence,
  isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2,
} from "./identity-mail-tenant-enrollment-manifest-bound-v2.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
const FIXTURE_DIRECTORIES = [];
after(async () => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  await Promise.all(
    FIXTURE_DIRECTORIES.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const MARKER_ID = "44444444-4444-4444-8444-444444444444";
const MANIFEST_ID = "55555555-5555-4555-8555-555555555555";
const DATABASE_NAME = "leetplus_manifest_bound_ci";
const DATABASE_OID = 16_384;
const DATABASE_IDENTITY_DIGEST = "1".repeat(64);
const DEPLOYMENT_MARKER_DIGEST = "2".repeat(64);
const ACTUAL_CONTEXT_DIGEST = "3".repeat(64);
const RUNTIME_CONFIG_DIGEST = "4".repeat(64);
const PROVIDER_AUTHORITY_DIGEST = "5".repeat(64);
const CONFIGURATION_DIGEST = "6".repeat(64);
const ACTOR_DIGEST = "7".repeat(64);
const APPLICATION_RELEASE_SHA = "a".repeat(40);
const APPLICATION_ARTIFACT_SHA256 = "8".repeat(64);
const COMMAND_KEY_ID = "identity-mail-command-v2-ci-1";
const MANIFEST_KEY_ID = "identity-mail-manifest-v2-ci-1";
const COORDINATOR = Object.freeze({
  name: "identity_mail_enrollment_coordinator",
  oid: 16_387,
});
const WORKER = Object.freeze({ name: "identity_mail_worker_v2", oid: 16_388 });
const BASE_ROLE_ATTRIBUTES = Object.freeze({
  bypassRls: false,
  connectionLimit: -1,
  createDatabase: false,
  createRole: false,
  inherit: false,
  replication: false,
  superuser: false,
  validUntil: null,
});

const DATABASE_ARGUMENT_KEYS = Object.freeze([
  "id", "tenantId", "requestId", "action", "intent", "contractVersion",
  "signatureDomain", "rollbackOfCommandId", "proposalContentDigest",
  "proposalCanonicalJson", "authorizationEnvelopeDigest",
  "authorizationEnvelopeCanonicalJson", "expectedState", "targetState",
  "expectedPolicyRevision", "nextPolicyRevision", "stateRevisionBefore",
  "drainStateRevision", "finalStateRevision", "previousWorkerRoleName",
  "previousWorkerRoleOid", "previousProviderAuthorityDigest",
  "previousMaxAttempts", "previousLeaseSeconds",
  "previousAcknowledgeSeconds", "previousBaseRetrySeconds",
  "previousMaxRetrySeconds", "previousConfigurationDigest",
  "targetWorkerRoleName", "targetWorkerRoleOid",
  "targetProviderAuthorityDigest", "targetMaxAttempts", "targetLeaseSeconds",
  "targetAcknowledgeSeconds", "targetBaseRetrySeconds",
  "targetMaxRetrySeconds", "targetConfigurationDigest", "runtimeConfigDigest",
  "expectedDatabaseName", "expectedDatabaseOid", "databaseIdentityDigest",
  "deploymentMarkerId", "deploymentMarkerDigest", "actualContextDigest",
  "releaseSha", "actorDigest", "signatureAlgorithm", "signingKeyId",
  "publicKeyFingerprint", "signatureBase64url", "requestedAt", "expiresAt",
  "dutyManifestContract", "dutyManifestProfile", "dutyManifestId",
  "dutyManifestRevision", "dutyManifestPayloadDigest",
  "dutyManifestSigningKeyId", "dutyManifestPublicKeyFingerprint",
  "dutyCoordinatorRoleName", "dutyCoordinatorRoleOid", "dutyWorkerRoleName",
  "dutyWorkerRoleOid", "dutyExactGrantsProfile", "dutyExactGrantsDigest",
  "dutyPredecessorManifestDigest", "dutyApplicationContract",
  "dutyApplicationReleaseSha", "dutyApplicationArtifactSha256",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function keyMaterial(kind) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    kind === "command"
      ? identityMailTenantEnrollmentAuthorityV2PublicKeyFingerprint(publicKeyPem)
      : identityMailDutyRoleManifestV2PublicKeyFingerprint(publicKeyPem);
  return { privateKey, publicKeyFingerprint, publicKeyPem };
}

function timeline() {
  const now = Date.now();
  return {
    issuedAt: new Date(now - 10_000).toISOString(),
    validUntil: new Date(now + 8 * 60_000).toISOString(),
    rootNotBefore: new Date(now - 60_000).toISOString(),
    rootNotAfter: new Date(now + 60 * 60_000).toISOString(),
  };
}

function roles() {
  return {
    coordinator: { ...BASE_ROLE_ATTRIBUTES, ...COORDINATOR, canLogin: true },
    schemaOwner: {
      ...BASE_ROLE_ATTRIBUTES,
      canLogin: false,
      name: "identity_mail_schema_owner",
      oid: 16_386,
    },
    worker: { ...BASE_ROLE_ATTRIBUTES, ...WORKER, canLogin: true },
  };
}

function acl(grantor, grantee, objectKind, objectIdentity, privilege) {
  return {
    grantorName: grantor.name,
    grantorOid: grantor.oid,
    granteeName: grantee.name,
    granteeOid: grantee.oid,
    isGrantable: false,
    objectIdentity,
    objectKind,
    privilege,
  };
}

function effective(role, objectKind, objectIdentity, privilege) {
  return {
    objectIdentity,
    objectKind,
    privilege,
    roleName: role.name,
    roleOid: role.oid,
  };
}

function grantsSnapshot() {
  const dutyRoles = roles();
  const databaseOwner = { name: "leetplus_database_owner", oid: 16_385 };
  const routines = IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map(
    (signature, index) => ({
      language: "plpgsql",
      oid: 20_000 + index,
      ownerName: dutyRoles.schemaOwner.name,
      ownerOid: dutyRoles.schemaOwner.oid,
      parallelSafety: "u",
      returnType: "jsonb",
      searchPath: "pg_catalog",
      securityDefiner: true,
      signature,
      volatility: "v",
    }),
  );
  return {
    contract: "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1",
    database: {
      identityDigest: DATABASE_IDENTITY_DIGEST,
      name: DATABASE_NAME,
      oid: DATABASE_OID,
      ownerName: databaseOwner.name,
      ownerOid: databaseOwner.oid,
    },
    databaseRoleSettings: [],
    defaultAcls: [],
    effectivePrivileges: [
      effective(COORDINATOR, "DATABASE", DATABASE_NAME, "CONNECT"),
      effective(COORDINATOR, "SCHEMA", "public", "USAGE"),
      effective(
        COORDINATOR,
        "ROUTINE",
        IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
        "EXECUTE",
      ),
      effective(WORKER, "DATABASE", DATABASE_NAME, "CONNECT"),
      effective(WORKER, "SCHEMA", "public", "USAGE"),
      ...IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES.map((signature) =>
        effective(WORKER, "ROUTINE", signature, "EXECUTE"),
      ),
    ],
    memberships: [],
    nonOwnerRoutineAcls: IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map(
      (signature) =>
        acl(
          dutyRoles.schemaOwner,
          signature === IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE
            ? COORDINATOR
            : WORKER,
          "ROUTINE",
          signature,
          "EXECUTE",
        ),
    ),
    profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
    roles: dutyRoles,
    roleSettings: [],
    routines,
    schema: {
      name: "public",
      oid: 2_200,
      ownerName: dutyRoles.schemaOwner.name,
      ownerOid: dutyRoles.schemaOwner.oid,
    },
    schemaVersion: 1,
    supportAcls: [
      acl(databaseOwner, COORDINATOR, "DATABASE", DATABASE_NAME, "CONNECT"),
      acl(databaseOwner, WORKER, "DATABASE", DATABASE_NAME, "CONNECT"),
      acl(
        dutyRoles.schemaOwner,
        { name: "public", oid: 0 },
        "SCHEMA",
        "public",
        "USAGE",
      ),
    ],
    unexpectedDutyRoleOwnerships: [],
  };
}

function manifestEnvelope(material, times, grantsDigest, overrides = {}) {
  const payload = {
    actualContextDigest: ACTUAL_CONTEXT_DIGEST,
    authorization: false,
    canMutate: false,
    canSend: false,
    chain: {
      head: {
        artifactSha256: APPLICATION_ARTIFACT_SHA256,
        contract: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_CONTRACT,
        kind: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_KIND,
        ordinal: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_APPLICATION_ORDINAL,
        releaseSha: APPLICATION_RELEASE_SHA,
      },
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PREDECESSOR },
    },
    contract: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_CONTRACT,
    database: {
      identityDigest: DATABASE_IDENTITY_DIGEST,
      name: DATABASE_NAME,
      oid: DATABASE_OID,
    },
    deploymentMarkerDigest: DEPLOYMENT_MARKER_DIGEST,
    deploymentMarkerId: MARKER_ID,
    exactGrants: {
      digest: grantsDigest,
      profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
    },
    issuedAt: times.issuedAt,
    kind: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_KIND,
    manifestId: MANIFEST_ID,
    manifestRevision: 1,
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
    publicKeyFingerprint: material.publicKeyFingerprint,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
    roles: { coordinator: { ...COORDINATOR }, worker: { ...WORKER } },
    schemaVersion: 2,
    signingKeyId: MANIFEST_KEY_ID,
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
    validUntil: times.validUntil,
    ...overrides,
  };
  const canonical = canonicalStringify(payload);
  return {
    payload,
    payloadDigest: sha256(canonical),
    publicKeyFingerprint: material.publicKeyFingerprint,
    signature: signPayload(null, Buffer.from(canonical, "utf8"), material.privateKey)
      .toString("base64url"),
    signatureAlgorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
    signingKeyId: MANIFEST_KEY_ID,
  };
}

function commandDocument(
  material,
  times,
  manifest,
  grantsDigest,
  dutyOverrides = {},
  envelopeOverrides = {},
) {
  const duty = {
    applicationArtifactSha256: APPLICATION_ARTIFACT_SHA256,
    applicationContract:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_APPLICATION_CONTRACT,
    applicationReleaseSha: APPLICATION_RELEASE_SHA,
    coordinatorRoleName: COORDINATOR.name,
    coordinatorRoleOid: COORDINATOR.oid,
    exactGrantsDigest: grantsDigest,
    exactGrantsProfile:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_GRANTS_PROFILE,
    manifestContract:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_CONTRACT,
    manifestId: manifest.payload.manifestId,
    manifestPayloadDigest: manifest.payloadDigest,
    manifestProfile:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DUTY_MANIFEST_PROFILE,
    manifestPublicKeyFingerprint: manifest.publicKeyFingerprint,
    manifestRevision: manifest.payload.manifestRevision,
    manifestSigningKeyId: manifest.signingKeyId,
    predecessorManifestDigest:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PREDECESSOR_MANIFEST_DIGEST,
    workerRoleName: WORKER.name,
    workerRoleOid: WORKER.oid,
    ...dutyOverrides,
  };
  const policy = {
    acknowledgeSeconds: 60,
    baseRetrySeconds: 30,
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 900,
  };
  const targetConfiguration = {
    ...policy,
    configurationDigest: CONFIGURATION_DIGEST,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    workerRoleName: duty.workerRoleName,
    workerRoleOid: duty.workerRoleOid,
  };
  const proposal = {
    action: "ENABLE",
    authorization: false,
    canMutate: false,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
    deploymentMarkerDigest: DEPLOYMENT_MARKER_DIGEST,
    dutyRoleBinding: duty,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: DATABASE_OID,
    expectedRevision: 0,
    expectedState: "ABSENT",
    expiresAt: times.validUntil,
    nextRevision: 1,
    policy,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    releaseSha: duty.applicationReleaseSha,
    requestId: REQUEST_ID,
    requestedAt: times.issuedAt,
    runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
    tenantId: TENANT_ID,
    workerRoleName: duty.workerRoleName,
    workerRoleOid: duty.workerRoleOid,
  };
  const proposalCanonicalJson = canonicalStringify(proposal);
  const proposalContentDigest = sha256(proposalCanonicalJson);
  const envelope = {
    action: "ENABLE",
    actorDigest: ACTOR_DIGEST,
    actualContextDigest: ACTUAL_CONTEXT_DIGEST,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
    authorization: true,
    canMutate: true,
    commandId: COMMAND_ID,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_CONTRACT,
    databaseIdentityDigest: DATABASE_IDENTITY_DIGEST,
    deploymentMarkerDigest: DEPLOYMENT_MARKER_DIGEST,
    deploymentMarkerId: MARKER_ID,
    drainStateRevision: null,
    dutyRoleBinding: duty,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: DATABASE_OID,
    expectedPolicyRevision: 0,
    expectedState: "ABSENT",
    expiresAt: times.validUntil,
    finalStateRevision: 1,
    intent: "FORWARD",
    nextPolicyRevision: 1,
    previousConfiguration: null,
    proposalContentDigest,
    publicKeyFingerprint: material.publicKeyFingerprint,
    releaseSha: duty.applicationReleaseSha,
    requestId: REQUEST_ID,
    requestedAt: times.issuedAt,
    rollbackOfCommandId: null,
    runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
    schemaVersion: 2,
    signatureAlgorithm:
      IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
    signingKeyId: COMMAND_KEY_ID,
    stateRevisionBefore: 0,
    targetConfiguration,
    targetState: "ACTIVE",
    tenantId: TENANT_ID,
    ...envelopeOverrides,
  };
  const envelopeCanonicalJson = canonicalStringify(envelope);
  const signedPayload = Buffer.from(
    `${IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN}\n${envelopeCanonicalJson}\n`,
    "utf8",
  );
  return {
    authorizationEnvelope: envelope,
    authorizationEnvelopeDigest: sha256(signedPayload),
    proposal,
    proposalContentDigest,
    signatureBase64url: signPayload(null, signedPayload, material.privateKey)
      .toString("base64url"),
  };
}

function commandRoot(material, times) {
  return {
    algorithm: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SIGNATURE_ALGORITHM,
    authorityDomain: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_DOMAIN,
    keyId: COMMAND_KEY_ID,
    notAfter: times.rootNotAfter,
    notBefore: times.rootNotBefore,
    profile: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PROFILE,
    publicKeyFingerprint: material.publicKeyFingerprint,
    publicKeyPem: material.publicKeyPem,
    purpose: IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_PURPOSE,
    status: "ACTIVE",
  };
}

function manifestRoot(material, times) {
  return {
    algorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SIGNATURE_ALGORITHM,
    keyId: MANIFEST_KEY_ID,
    notAfter: times.rootNotAfter,
    notBefore: times.rootNotBefore,
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PROFILE,
    publicKeyFingerprint: material.publicKeyFingerprint,
    publicKeyPem: material.publicKeyPem,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_PURPOSE,
    status: "ACTIVE",
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_TRUST_DOMAIN,
  };
}

async function fixtureModules(commandAuthorityRoot, dutyManifestRoot) {
  const directory = await mkdtemp(join(tmpdir(), "leetplus-manifest-bound-v2-"));
  FIXTURE_DIRECTORIES.push(directory);
  const files = [
    "identity-mail-tenant-enrollment-authority-v2.mjs",
    "identity-mail-duty-role-manifest-v2.mjs",
    "identity-mail-duty-role-grants-current185.mjs",
    "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",
    "staff-task-integrity-canonical-json.mjs",
  ];
  for (const file of files) {
    let source = await readFile(join(SCRIPT_DIRECTORY, file), "utf8");
    if (file === "identity-mail-tenant-enrollment-authority-v2.mjs") {
      const pattern =
        /export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS =\r?\n  Object\.freeze\(\{\}\);/u;
      assert.match(source, pattern);
      source = source.replace(
        pattern,
        `export const PINNED_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ROOTS =\n  Object.freeze(${canonicalStringify({ [COMMAND_KEY_ID]: commandAuthorityRoot })});`,
      );
    }
    if (file === "identity-mail-duty-role-manifest-v2.mjs") {
      const pattern =
        /export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS =\r?\n  Object\.freeze\(\{\}\);/u;
      assert.match(source, pattern);
      source = source.replace(
        pattern,
        `export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_ROOTS =\n  Object.freeze(${canonicalStringify({ [MANIFEST_KEY_ID]: dutyManifestRoot })});`,
      );
    }
    await writeFile(join(directory, file), source, { encoding: "utf8", flag: "wx" });
  }
  return {
    authority: await import(pathToFileURL(join(directory, files[0])).href),
    manifest: await import(pathToFileURL(join(directory, files[1])).href),
    composition: await import(pathToFileURL(join(directory, files[3])).href),
  };
}

async function pinnedScenario() {
  const times = timeline();
  const commandMaterial = keyMaterial("command");
  const manifestMaterial = keyMaterial("manifest");
  const grants = grantsSnapshot();
  const grantsDigest = identityMailDutyRoleGrantsCurrent185Digest(grants);
  const manifest = manifestEnvelope(
    manifestMaterial,
    times,
    grantsDigest,
  );
  const command = commandDocument(
    commandMaterial,
    times,
    manifest,
    grantsDigest,
  );
  const modules = await fixtureModules(
    commandRoot(commandMaterial, times),
    manifestRoot(manifestMaterial, times),
  );
  return {
    command,
    commandMaterial,
    grants,
    grantsDigest,
    manifest,
    manifestMaterial,
    modules,
    times,
  };
}

function expectCompositionCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailTenantEnrollmentManifestBoundV2Error &&
      error.code === code &&
      error.reasonCode === code &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

test("composes two exact PINNED brands and exposes frozen importer evidence", async () => {
  const scenario = await pinnedScenario();
  const { authority, composition, manifest } = scenario.modules;
  const commandVerified =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  const manifestVerified =
    manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  const composed =
    composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
      commandVerified,
      manifestVerified,
      scenario.grants,
    );
  assert.equal(
    composition.isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2(
      composed,
    ),
    true,
  );
  assert(Object.isFrozen(composed));
  assert.equal(composed.contract, IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_CONTRACT);
  assert.equal(composed.profile, IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE);
  assert.equal(composed.authorization, false);
  assert.equal(composed.canMutate, false);
  assert.equal(composed.canSend, false);
  assert.equal(composed.exactGrantsDigest, scenario.grantsDigest);
  const evidence =
    composition.identityMailTenantEnrollmentManifestBoundV2Evidence(composed);
  assert(Object.isFrozen(evidence));
  assert(Object.isFrozen(evidence.exactGrants));
  assert(Object.isFrozen(evidence.exactGrants.projection));
  const databaseArguments =
    authority.identityMailTenantEnrollmentCommandV2DatabaseArguments(
      commandVerified,
    );
  assert.equal(evidence.commandDatabaseArguments, databaseArguments);
  assert.deepEqual(Object.keys(evidence.commandDatabaseArguments), DATABASE_ARGUMENT_KEYS);
  assert.equal(DATABASE_ARGUMENT_KEYS.length, 69);
  assert.equal(evidence.authorization, false);
  assert.equal(evidence.canMutate, false);
  assert.equal(evidence.canSend, false);
});

test("binding matrix rejects every mutable command/manifest/grants mismatch", async () => {
  const scenario = await pinnedScenario();
  const { authority, composition, manifest } = scenario.modules;
  const baselineManifest =
    manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(scenario.manifest);
  const mutations = [
    { manifestId: "66666666-6666-4666-8666-666666666666" },
    { manifestRevision: 2 },
    { manifestPayloadDigest: "0".repeat(64) },
    { manifestSigningKeyId: "identity-mail-other-manifest-key" },
    { manifestPublicKeyFingerprint: "1".repeat(64) },
    { coordinatorRoleName: "identity_mail_other_coordinator" },
    { coordinatorRoleOid: COORDINATOR.oid + 100 },
    { workerRoleName: "identity_mail_other_worker" },
    { workerRoleOid: WORKER.oid + 100 },
    { exactGrantsDigest: "9".repeat(64) },
    { applicationReleaseSha: "b".repeat(40) },
    { applicationArtifactSha256: "c".repeat(64) },
  ];
  for (const dutyMutation of mutations) {
    const command = commandDocument(
      scenario.commandMaterial,
      scenario.times,
      scenario.manifest,
      scenario.grantsDigest,
      dutyMutation,
    );
    const verified =
      authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(command);
    assert.throws(
      () =>
        composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
          verified,
          baselineManifest,
          scenario.grants,
        ),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_BINDING_MISMATCH",
    );
  }

  for (const payloadMutation of [
    { database: { ...scenario.manifest.payload.database, name: "other_ci" } },
    { database: { ...scenario.manifest.payload.database, oid: DATABASE_OID + 1 } },
    {
      database: {
        ...scenario.manifest.payload.database,
        identityDigest: "d".repeat(64),
      },
    },
    { deploymentMarkerId: "77777777-7777-4777-8777-777777777777" },
    { deploymentMarkerDigest: "e".repeat(64) },
    { actualContextDigest: "f".repeat(64) },
    {
      roles: {
        coordinator: {
          name: "identity_mail_other_coordinator",
          oid: COORDINATOR.oid + 100,
        },
        worker: { ...WORKER },
      },
    },
    {
      roles: {
        coordinator: { ...COORDINATOR },
        worker: {
          name: "identity_mail_other_worker",
          oid: WORKER.oid + 100,
        },
      },
    },
    {
      exactGrants: {
        digest: "a".repeat(64),
        profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
      },
    },
    {
      chain: {
        head: {
          ...scenario.manifest.payload.chain.head,
          releaseSha: "b".repeat(40),
        },
        predecessor: { ...scenario.manifest.payload.chain.predecessor },
      },
    },
    {
      chain: {
        head: {
          ...scenario.manifest.payload.chain.head,
          artifactSha256: "c".repeat(64),
        },
        predecessor: { ...scenario.manifest.payload.chain.predecessor },
      },
    },
  ]) {
    const changedManifest = manifestEnvelope(
      scenario.manifestMaterial,
      scenario.times,
      scenario.grantsDigest,
      payloadMutation,
    );
    const verifiedManifest =
      manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(changedManifest);
    const verifiedCommand =
      authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
        scenario.command,
      );
    assert.throws(
      () =>
        composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
          verifiedCommand,
          verifiedManifest,
          scenario.grants,
        ),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_BINDING_MISMATCH",
    );
  }

  for (const staticDowngrade of [
    {
      contract: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V1",
    },
    {
      profile: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V1",
    },
    {
      exactGrants: {
        digest: scenario.grantsDigest,
        profile: "IDENTITY_MAIL_DUTY_GRANTS_PG15_V1",
      },
    },
    {
      chain: {
        head: { ...scenario.manifest.payload.chain.head },
        predecessor: {
          ...scenario.manifest.payload.chain.predecessor,
          manifestDigest: "d".repeat(64),
        },
      },
    },
    {
      chain: {
        head: {
          ...scenario.manifest.payload.chain.head,
          contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1",
        },
        predecessor: { ...scenario.manifest.payload.chain.predecessor },
      },
    },
  ]) {
    const downgraded = manifestEnvelope(
      scenario.manifestMaterial,
      scenario.times,
      scenario.grantsDigest,
      staticDowngrade,
    );
    assert.throws(
      () =>
        manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(downgraded),
      (error) => error?.code?.startsWith("IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_"),
    );
  }

  const recreatedGrantCatalog = structuredClone(scenario.grants);
  recreatedGrantCatalog.routines[0].oid += 1_000;
  const verifiedCommand =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        verifiedCommand,
        baselineManifest,
        recreatedGrantCatalog,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_BINDING_MISMATCH",
  );

  const grantsDatabaseDrifts = [];
  const identityDrift = structuredClone(scenario.grants);
  identityDrift.database.identityDigest = "e".repeat(64);
  grantsDatabaseDrifts.push(identityDrift);
  const oidDrift = structuredClone(scenario.grants);
  oidDrift.database.oid += 1;
  grantsDatabaseDrifts.push(oidDrift);
  const nameDrift = structuredClone(scenario.grants);
  nameDrift.database.name = "leetplus_manifest_bound_other_ci";
  for (const row of nameDrift.supportAcls) {
    if (row.objectKind === "DATABASE") {
      row.objectIdentity = nameDrift.database.name;
    }
  }
  for (const row of nameDrift.effectivePrivileges) {
    if (row.objectKind === "DATABASE") {
      row.objectIdentity = nameDrift.database.name;
    }
  }
  grantsDatabaseDrifts.push(nameDrift);
  for (const driftedGrants of grantsDatabaseDrifts) {
    assert.throws(
      () =>
        composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
          verifiedCommand,
          baselineManifest,
          driftedGrants,
        ),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_BINDING_MISMATCH",
    );
  }
});

test("rejects synthetic, plain, clone and cross-module brands before grants reads", async () => {
  const scenario = await pinnedScenario();
  const { authority, composition, manifest } = scenario.modules;
  const commandPinned =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  const manifestPinned =
    manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  let observed = false;
  const hostileGrants = {};
  Object.defineProperty(hostileGrants, "profile", {
    enumerable: true,
    get() {
      observed = true;
      throw new Error("must not run");
    },
  });
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        { ...commandPinned },
        manifestPinned,
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_COMMAND_NOT_PINNED",
  );
  assert.equal(observed, false);
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandPinned,
        { ...manifestPinned },
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_MANIFEST_NOT_PINNED",
  );
  assert.equal(observed, false);

  const now = new Date().toISOString();
  const commandSynthetic =
    authority.verifySyntheticIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
      { [COMMAND_KEY_ID]: commandRoot(scenario.commandMaterial, scenario.times) },
      {
        databaseName: DATABASE_NAME,
        environment: "ci",
        explicitConfirmation:
          IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_SYNTHETIC_CONFIRMATION,
        hostname: "127.0.0.1",
        nodeEnv: "test",
      },
      now,
    );
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandSynthetic,
        manifestPinned,
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_COMMAND_NOT_PINNED",
  );
  assert.equal(observed, false);

  const manifestSynthetic =
    manifest.verifySyntheticIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
      {
        [MANIFEST_KEY_ID]: manifestRoot(
          scenario.manifestMaterial,
          scenario.times,
        ),
      },
      {
        databaseName: DATABASE_NAME,
        environment: "ci",
        explicitConfirmation:
          IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2_SYNTHETIC_CONFIRMATION,
        hostname: "127.0.0.1",
        nodeEnv: "test",
      },
      now,
    );
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandPinned,
        manifestSynthetic,
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_MANIFEST_NOT_PINNED",
  );
  assert.equal(observed, false);

  const other = await fixtureModules(
    commandRoot(scenario.commandMaterial, scenario.times),
    manifestRoot(scenario.manifestMaterial, scenario.times),
  );
  assert.throws(
    () =>
      other.composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandPinned,
        manifestPinned,
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_COMMAND_NOT_PINNED",
  );
  assert.equal(observed, false);
  const otherManifest =
    other.manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandPinned,
        otherManifest,
        hostileGrants,
      ),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_MANIFEST_NOT_PINNED",
  );
  assert.equal(observed, false);

  const transparent = new Proxy(scenario.grants, {});
  assert.throws(
    () =>
      composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
        commandPinned,
        manifestPinned,
        transparent,
      ),
    (error) =>
      error?.code === "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SNAPSHOT_INVALID",
  );
});

test("grants row order is canonical and composed brands are nonforgeable", async () => {
  const scenario = await pinnedScenario();
  const { authority, composition, manifest } = scenario.modules;
  const command =
    authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
      scenario.command,
    );
  const dutyManifest =
    manifest.verifyPinnedIdentityMailDutyRoleManifestV2Envelope(
      scenario.manifest,
    );
  const first =
    composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
      command,
      dutyManifest,
      scenario.grants,
    );
  const reordered = structuredClone(scenario.grants);
  for (const key of [
    "effectivePrivileges",
    "nonOwnerRoutineAcls",
    "routines",
    "supportAcls",
  ]) {
    reordered[key].reverse();
  }
  const second =
    composition.composePinnedIdentityMailTenantEnrollmentManifestBoundV2(
      command,
      dutyManifest,
      reordered,
    );
  assert.equal(first.exactGrantsDigest, second.exactGrantsDigest);
  assert.equal(first.bindingDigest, second.bindingDigest);
  assert.equal(
    composition.isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2({
      ...first,
    }),
    false,
  );
  assert.throws(
    () =>
      composition.identityMailTenantEnrollmentManifestBoundV2Evidence({
        ...first,
      }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_NOT_COMPOSED",
  );
  assert.equal(
    isComposedPinnedIdentityMailTenantEnrollmentManifestBoundV2(first),
    false,
  );
  expectCompositionCode(
    () => identityMailTenantEnrollmentManifestBoundV2Evidence(first),
    "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_NOT_COMPOSED",
  );
});

test("equal command/manifest signer claim is rejected before composition", async () => {
  const times = timeline();
  const shared = keyMaterial("command");
  const grants = grantsSnapshot();
  const grantsDigest = identityMailDutyRoleGrantsCurrent185Digest(grants);
  const manifest = manifestEnvelope(shared, times, grantsDigest);
  const command = commandDocument(shared, times, manifest, grantsDigest);
  const modules = await fixtureModules(
    commandRoot(shared, times),
    manifestRoot(
      {
        ...shared,
        publicKeyFingerprint:
          identityMailDutyRoleManifestV2PublicKeyFingerprint(shared.publicKeyPem),
      },
      times,
    ),
  );
  assert.throws(
    () =>
      modules.authority.verifyPinnedIdentityMailTenantEnrollmentCommandAuthorityV2(
        command,
      ),
    (error) =>
      error?.code === "IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V2_ENVELOPE_INVALID",
  );
});

test("composition source is pure and normalizes raw grants exactly once", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "identity-mail-tenant-enrollment-manifest-bound-v2.mjs",
    ),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(imports, [
    "node:crypto",
    "./identity-mail-tenant-enrollment-authority-v2.mjs",
    "./identity-mail-duty-role-manifest-v2.mjs",
    "./identity-mail-duty-role-grants-current185.mjs",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.equal(
    [...source.matchAll(/identityMailDutyRoleGrantsCurrent185Projection\(grantsSnapshot\)/gu)]
      .length,
    1,
  );
  assert.doesNotMatch(source, /identityMailDutyRoleGrantsCurrent185Digest/u);
  assert.doesNotMatch(
    source,
    /@prisma|PrismaClient|@nestjs|process\.|DATABASE_URL|\$queryRaw|\$executeRaw|fetch\s*\(|node:https?|node:net|nodemailer|\bGRANT\b|\bREVOKE\b/iu,
  );
  assert.match(source, /const COMPOSED_PINNED_BINDINGS = new WeakSet\(\)/u);
  assert.match(source, /const COMPOSED_PINNED_EVIDENCE = new WeakMap\(\)/u);
});
