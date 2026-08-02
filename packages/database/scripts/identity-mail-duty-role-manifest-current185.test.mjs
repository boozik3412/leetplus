import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_KIND,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_LIFETIME_MS,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONFIRMATION,
  IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN,
  IdentityMailDutyRoleManifestError,
  PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS,
  identityMailDutyRoleManifestPayload,
  identityMailDutyRoleManifestPayloadDigest,
  identityMailDutyRoleManifestPublicKeyFingerprint,
  isVerifiedIdentityMailDutyRoleManifest,
  isVerifiedSyntheticIdentityMailDutyRoleManifest,
  verifyPinnedIdentityMailDutyRoleManifestEnvelope,
  verifySyntheticIdentityMailDutyRoleManifestEnvelope,
} from "./identity-mail-duty-role-manifest-current185.mjs";
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
const DATABASE_DIR = dirname(SCRIPT_DIR);
const CONTRACT_PATH = join(
  SCRIPT_DIR,
  "identity-mail-duty-role-manifest-current185.mjs",
);
const NOW = "2026-08-02T10:00:00.000Z";
const DATABASE_NAME = "lp_identity_mail_duty_roles_ci";
const KEY_ID = "identity-mail-duty-role-ci-1";
const DIGESTS = Object.freeze({
  actualContext: "0".repeat(64),
  database: "1".repeat(64),
  deploymentMarker: "3".repeat(64),
  grants: "2".repeat(64),
});
const PAYLOAD_KEYS = Object.freeze(
  [
    "authorization",
    "actualContextDigest",
    "canMutate",
    "canSend",
    "chain",
    "contract",
    "database",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "exactGrants",
    "issuedAt",
    "kind",
    "manifestId",
    "manifestRevision",
    "profile",
    "publicKeyFingerprint",
    "purpose",
    "roles",
    "schemaVersion",
    "signingKeyId",
    "trustDomain",
    "validUntil",
  ].sort(),
);
const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: DATABASE_NAME,
  environment: "ci",
  explicitConfirmation:
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailDutyRoleManifestError &&
      error.reasonCode === reasonCode &&
      error.code === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function authority(rootOverrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    identityMailDutyRoleManifestPublicKeyFingerprint(publicKeyPem);
  const root = {
    algorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2026-08-03T00:00:00.000Z",
    notBefore: "2026-08-02T00:00:00.000Z",
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE,
    status: "ACTIVE",
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN,
    ...rootOverrides,
  };
  return {
    privateKey,
    publicKeyFingerprint,
    root,
    roots: { [KEY_ID]: root },
  };
}

function payloadFor(signer, overrides = {}) {
  return {
    actualContextDigest: DIGESTS.actualContext,
    authorization: false,
    canMutate: false,
    canSend: false,
    chain: {
      head: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD },
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR },
    },
    contract: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT,
    database: {
      identityDigest: DIGESTS.database,
      name: DATABASE_NAME,
      oid: 16_384,
    },
    deploymentMarkerDigest: DIGESTS.deploymentMarker,
    deploymentMarkerId: "44444444-4444-4444-8444-444444444444",
    exactGrants: {
      digest: DIGESTS.grants,
      profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE,
    },
    issuedAt: "2026-08-02T09:59:00.000Z",
    kind: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_KIND,
    manifestId: "11111111-1111-4111-8111-111111111111",
    manifestRevision: 1,
    profile: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    purpose: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PURPOSE,
    roles: {
      coordinator: { name: "identity_mail_enrollment_coordinator", oid: 16_385 },
      worker: { name: "identity_mail_worker_v2", oid: 16_386 },
    },
    schemaVersion: 1,
    signingKeyId: KEY_ID,
    trustDomain: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TRUST_DOMAIN,
    validUntil: "2026-08-02T10:10:00.000Z",
    ...overrides,
  };
}

function envelopeFor(payload, privateKey, overrides = {}) {
  return {
    payload,
    payloadDigest: identityMailDutyRoleManifestPayloadDigest(payload),
    publicKeyFingerprint: payload.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
    ...overrides,
  };
}

function fixture(payloadOverrides = {}, rootOverrides = {}) {
  const signer = authority(rootOverrides);
  const payload = payloadFor(signer, payloadOverrides);
  return {
    envelope: envelopeFor(payload, signer.privateKey),
    signer,
  };
}

function verify(value, context = SYNTHETIC_CONTEXT, now = NOW) {
  return verifySyntheticIdentityMailDutyRoleManifestEnvelope(
    value.envelope,
    value.signer.roots,
    context,
    now,
  );
}

function resign(value, payloadOverrides) {
  const payload = { ...value.envelope.payload, ...payloadOverrides };
  return {
    ...value,
    envelope: envelopeFor(payload, value.signer.privateKey),
  };
}

test("verifies an exact dormant synthetic duty-role manifest with a separate brand", () => {
  const value = fixture();
  const verified = verify(value);
  assert.equal(isVerifiedSyntheticIdentityMailDutyRoleManifest(verified), true);
  assert.equal(isVerifiedIdentityMailDutyRoleManifest(verified), false);
  assert.equal(verified.verificationMode, "SYNTHETIC");
  assert.equal(verified.authorization, false);
  assert.equal(verified.canMutate, false);
  assert.equal(verified.canSend, false);
  assert.equal(verified.databaseName, DATABASE_NAME);
  assert.equal(verified.databaseIdentityDigest, DIGESTS.database);
  assert.equal(
    verified.exactGrantsProfile,
    IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE,
  );
  assert.equal(
    verified.predecessorManifestDigest,
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR.manifestDigest,
  );
  assert.equal(
    verified.applicationReleaseSha,
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD.releaseSha,
  );
  assert.equal(verified.actualContextDigest, DIGESTS.actualContext);
  assert.equal(verified.deploymentMarkerDigest, DIGESTS.deploymentMarker);
  assert.equal(
    verified.deploymentMarkerId,
    "44444444-4444-4444-8444-444444444444",
  );
  assert.equal(verified.manifestRevision, 1);
  assert.equal(verified.coordinatorRoleOid, 16_385);
  assert.equal(verified.workerRoleOid, 16_386);
  assert.equal(Object.hasOwn(verified, "payload"), false);
  assert(Object.isFrozen(verified));
  expectCode(
    () => identityMailDutyRoleManifestPayload(verified),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_NOT_VERIFIED",
  );
  assert.equal(isVerifiedSyntheticIdentityMailDutyRoleManifest({ ...verified }), false);
});

test("pins every discriminator and the exact CURRENT184/185 chain", () => {
  const value = fixture();
  assert.deepEqual(Object.keys(value.envelope.payload).sort(), PAYLOAD_KEYS);
  assert.equal(verify(value).manifestId, value.envelope.payload.manifestId);
  assert.deepEqual(IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR, {
    count: 184,
    head: "20260802020000_identity_mail_worker_v2_lost_response_replay",
    headChecksum:
      "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424",
    manifestDigest:
      "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819",
  });
  assert.deepEqual(IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD, {
    artifactSha256:
      "4b8f6087c286bfd3c3a9073ba1fe446331a58d87583831ca9d93d6aaa38709d6",
    contract: "IDENTITY_MAIL_TENANT_ENROLLMENT_COORDINATOR_CURRENT185_V1",
    kind: "APPLICATION_BOUNDARY",
    ordinal: 185,
    releaseSha: "5ee3228931f92d282f82a3607117f3955b973962",
  });

  for (const mutation of [
    { schemaVersion: 2 },
    { kind: "LEETPLUS_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION" },
    { contract: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2" },
    { trustDomain: "LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_AUTHORITY_V1" },
    { purpose: "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION" },
    { profile: "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2" },
    { authorization: true },
    { canMutate: true },
    { canSend: true },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT_INVALID",
    );
  }
});

test("recomputes the CURRENT184 manifest and CURRENT185 coordinator artifact", async () => {
  const canonicalDirectory = join(DATABASE_DIR, "prisma", "migrations");
  const candidateDirectory = join(DATABASE_DIR, "migration-candidates");
  const candidateNames = [
    "20260801010000_identity_mail_tenant_enrollment_control_plane",
    "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
    "20260801030000_identity_mail_tenant_first_claim_protocol",
    "20260802010000_identity_mail_worker_v2_freshness_protocol",
    "20260802020000_identity_mail_worker_v2_lost_response_replay",
  ];
  const canonicalNames = (await readdir(canonicalDirectory, {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const entries = await Promise.all(
    [
      ...canonicalNames.map((name) => ({ directory: canonicalDirectory, name })),
      ...candidateNames.map((name) => ({ directory: candidateDirectory, name })),
    ].map(async ({ directory, name }) => ({
      checksum: createHash("sha256")
        .update(
          (await readFile(join(directory, name, "migration.sql"), "utf8"))
            .replaceAll("\r\n", "\n")
            .replaceAll("\r", "\n"),
          "utf8",
        )
        .digest("hex"),
      name,
    })),
  );
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  const manifest = entries
    .map(({ name, checksum }) => `${name} ${checksum}`)
    .join("\n");
  const manifestDigest = createHash("sha256")
    .update(`${manifest}\n`, "utf8")
    .digest("hex");
  assert.equal(entries.length, IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR.count);
  assert.equal(entries.at(-1)?.name, IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR.head);
  assert.equal(
    entries.at(-1)?.checksum,
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR.headChecksum,
  );
  assert.equal(
    manifestDigest,
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR.manifestDigest,
  );

  const coordinatorArtifact = await readFile(
    join(
      SCRIPT_DIR,
      "identity-mail-tenant-enrollment-coordinator-current185.mjs",
    ),
  );
  assert.equal(
    createHash("sha256").update(coordinatorArtifact).digest("hex"),
    IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD.artifactSha256,
  );
  assert.match(IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD.releaseSha, /^[0-9a-f]{40}$/u);
});

test("rejects hostile envelope, payload, descriptor, prototype, symbol and proxy shapes", () => {
  const extraEnvelope = fixture();
  extraEnvelope.envelope.extra = true;
  expectCode(
    () => verify(extraEnvelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_INVALID",
  );

  const inheritedPayload = fixture();
  Object.setPrototypeOf(inheritedPayload.envelope.payload, { inherited: true });
  expectCode(
    () => verify(inheritedPayload),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PAYLOAD_INVALID",
  );

  const accessorPayload = fixture();
  let getterCalls = 0;
  Object.defineProperty(accessorPayload.envelope.payload, "manifestId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "11111111-1111-4111-8111-111111111111";
    },
  });
  expectCode(
    () => verify(accessorPayload),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PAYLOAD_INVALID",
  );
  assert.equal(getterCalls, 0);

  const symbolDatabase = fixture();
  symbolDatabase.envelope.payload.database[Symbol("extra")] = true;
  expectCode(
    () => verify(symbolDatabase),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DATABASE_INVALID",
  );

  const proxyEnvelope = fixture();
  proxyEnvelope.envelope = new Proxy(proxyEnvelope.envelope, {
    getOwnPropertyDescriptor() {
      throw new Error("trap must be contained");
    },
  });
  expectCode(
    () => verify(proxyEnvelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_INVALID",
  );

  const revokedEnvelope = fixture();
  const envelopeRevocable = Proxy.revocable(revokedEnvelope.envelope, {});
  revokedEnvelope.envelope = envelopeRevocable.proxy;
  envelopeRevocable.revoke();
  expectCode(
    () => verify(revokedEnvelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_INVALID",
  );
});

test("rejects invalid database bindings", () => {
  for (const database of [
    { identityDigest: DIGESTS.database, name: "postgres", oid: 16_384 },
    { identityDigest: DIGESTS.database, name: "Prod_DB", oid: 16_384 },
    { identityDigest: DIGESTS.database, name: "9database", oid: 16_384 },
    { identityDigest: DIGESTS.database, name: DATABASE_NAME, oid: 0 },
    { identityDigest: "A".repeat(64), name: DATABASE_NAME, oid: 16_384 },
  ]) {
    expectCode(
      () => verify(resign(fixture(), { database })),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DATABASE_INVALID",
    );
  }
});

test("binds manifest revision, deployment marker, and actual runtime context", () => {
  for (const overrides of [
    { manifestRevision: 0 },
    { manifestRevision: 1.5 },
    { manifestRevision: 2_147_483_648 },
  ]) {
    expectCode(
      () => verify(resign(fixture(), overrides)),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CONTRACT_INVALID",
    );
  }
  for (const overrides of [
    { actualContextDigest: "x".repeat(64) },
    { deploymentMarkerDigest: "x".repeat(64) },
    { deploymentMarkerId: "not-a-uuid" },
  ]) {
    expectCode(
      () => verify(resign(fixture(), overrides)),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_DEPLOYMENT_BINDING_INVALID",
    );
  }
});

test("requires distinct safe non-system coordinator and worker roles", () => {
  const validCoordinator = {
    name: "identity_mail_enrollment_coordinator",
    oid: 16_385,
  };
  const validWorker = { name: "identity_mail_worker_v2", oid: 16_386 };
  for (const roles of [
    { coordinator: { name: "postgres", oid: 16_385 }, worker: validWorker },
    { coordinator: { name: "pg_monitor", oid: 16_385 }, worker: validWorker },
    { coordinator: { name: "rds_admin", oid: 16_385 }, worker: validWorker },
    { coordinator: validCoordinator, worker: { name: "ab", oid: 16_386 } },
    { coordinator: validCoordinator, worker: { ...validCoordinator } },
    {
      coordinator: validCoordinator,
      worker: { name: validWorker.name, oid: validCoordinator.oid },
    },
  ]) {
    expectCode(
      () => verify(resign(fixture(), { roles })),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
    );
  }

  const accessorRole = fixture();
  Object.defineProperty(
    accessorRole.envelope.payload.roles.coordinator,
    "name",
    { enumerable: true, get: () => validCoordinator.name },
  );
  expectCode(
    () => verify(accessorRole),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROLES_INVALID",
  );
});

test("binds the exact PostgreSQL grants profile and digest", () => {
  for (const exactGrants of [
    { digest: DIGESTS.grants, profile: "IDENTITY_MAIL_DUTY_GRANTS_PG15_V1" },
    { digest: "x".repeat(64), profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE },
    {
      digest: DIGESTS.grants,
      profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_PROFILE,
      extra: true,
    },
  ]) {
    expectCode(
      () => verify(resign(fixture(), { exactGrants })),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_GRANTS_INVALID",
    );
  }
});

test("rejects every CURRENT184 predecessor or CURRENT185 head drift", () => {
  const chainMutations = [
    {
      head: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD },
      predecessor: {
        ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR,
        count: 183,
      },
    },
    {
      head: {
        ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD,
        artifactSha256: "0".repeat(64),
      },
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR },
    },
    {
      head: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_HEAD, ordinal: 186 },
      predecessor: { ...IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PREDECESSOR },
    },
  ];
  for (const chain of chainMutations) {
    expectCode(
      () => verify(resign(fixture(), { chain })),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CHAIN_INVALID",
    );
  }
});

test("rejects envelope digest, fingerprint and signature substitution", () => {
  const digestMismatch = fixture();
  digestMismatch.envelope.payloadDigest = "f".repeat(64);
  expectCode(
    () => verify(digestMismatch),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_BINDING_INVALID",
  );

  const fingerprintMismatch = fixture();
  fingerprintMismatch.envelope.publicKeyFingerprint = "e".repeat(64);
  expectCode(
    () => verify(fingerprintMismatch),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ENVELOPE_BINDING_INVALID",
  );

  const malformed = fixture();
  malformed.envelope.signature = "AA";
  expectCode(
    () => verify(malformed),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
  );

  const oversized = fixture();
  oversized.envelope.signature = "A".repeat(87);
  expectCode(
    () => verify(oversized),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
  );

  const corrupted = fixture();
  const signature = Buffer.from(corrupted.envelope.signature, "base64url");
  signature[0] ^= 0xff;
  corrupted.envelope.signature = signature.toString("base64url");
  expectCode(
    () => verify(corrupted),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SIGNATURE_INVALID",
  );
});

test("rejects cross-domain, malformed, inactive and accessor authority roots", () => {
  for (const rootMutation of [
    { purpose: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND" },
    { profile: "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE_V1" },
    { trustDomain: "LEETPLUS_IDENTITY_MAIL_WORKER_RUNTIME_AUTHORITY_V1" },
    { status: "REVOKED" },
    { publicKeyFingerprint: "0".repeat(64) },
    { algorithm: "EdDSA" },
  ]) {
    const value = fixture();
    value.signer.roots[KEY_ID] = {
      ...value.signer.roots[KEY_ID],
      ...rootMutation,
    };
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
    );
  }

  const inactive = fixture();
  inactive.signer.roots[KEY_ID] = {
    ...inactive.signer.roots[KEY_ID],
    notAfter: NOW,
  };
  expectCode(
    () => verify(inactive),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INACTIVE",
  );

  const accessorRoot = fixture();
  let getterCalls = 0;
  Object.defineProperty(accessorRoot.signer.roots[KEY_ID], "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "ACTIVE";
    },
  });
  expectCode(
    () => verify(accessorRoot),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOT_INVALID",
  );
  assert.equal(getterCalls, 0);

  const revokedRegistry = fixture();
  const rootsRevocable = Proxy.revocable(revokedRegistry.signer.roots, {});
  revokedRegistry.signer.roots = rootsRevocable.proxy;
  rootsRevocable.revoke();
  expectCode(
    () => verify(revokedRegistry),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS_INVALID",
  );
});

test("enforces canonical timestamps, one-minute skew and fifteen-minute lifetime", () => {
  const timelineMutations = [
    { issuedAt: "2026-08-02T10:01:00.001Z" },
    { issuedAt: "2026-08-02T09:59:00Z" },
    { validUntil: NOW },
    {
      issuedAt: "2026-08-02T09:50:00.000Z",
      validUntil: new Date(
        Date.parse("2026-08-02T09:50:00.000Z") +
          IDENTITY_MAIL_DUTY_ROLE_MANIFEST_MAX_LIFETIME_MS +
          1,
      ).toISOString(),
    },
  ];
  for (const mutation of timelineMutations) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    );
  }
  const value = fixture();
  expectCode(
    () =>
      verifySyntheticIdentityMailDutyRoleManifestEnvelope(
        value.envelope,
        value.signer.roots,
        SYNTHETIC_CONTEXT,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ARGUMENTS_INVALID",
  );
  expectCode(
    () => verify(value, SYNTHETIC_CONTEXT, "2026-08-02T10:00:00Z"),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_CURRENT_TIME_INVALID",
  );

  let nestedTimestampObservation = 0;
  const timestampAccessor = {};
  Object.defineProperty(timestampAccessor, "value", {
    get() {
      nestedTimestampObservation += 1;
      return NOW;
    },
  });
  const timestampProxy = new Proxy(Object.create(null), {
    get() {
      nestedTimestampObservation += 1;
      throw new Error("timestamp proxy must not be observed");
    },
    ownKeys() {
      nestedTimestampObservation += 1;
      throw new Error("timestamp proxy must not be observed");
    },
  });
  for (const mutation of [
    { issuedAt: timestampAccessor },
    { validUntil: timestampProxy },
  ]) {
    const hostileTimestamp = fixture();
    Object.assign(hostileTimestamp.envelope.payload, mutation);
    expectCode(
      () => verify(hostileTimestamp),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_TIMELINE_INVALID",
    );
  }
  assert.equal(nestedTimestampObservation, 0);
});

test("production roots are frozen, empty and pinned verification is noninjectable", () => {
  const value = fixture();
  assert(Object.isFrozen(PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS));
  assert.deepEqual(Object.keys(PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS), []);
  expectCode(
    () => verifyPinnedIdentityMailDutyRoleManifestEnvelope(value.envelope),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailDutyRoleManifestEnvelope(
        value.envelope,
        value.signer.roots,
      ),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ARGUMENTS_INVALID",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailDutyRoleManifestEnvelope(value.envelope, NOW),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ARGUMENTS_INVALID",
  );
});

test("synthetic roots require exact loopback CI context and explicit ambient test mode", () => {
  for (const overrides of [
    { hostname: "worker.example.com" },
    { hostname: "LOCALHOST" },
    { environment: "production" },
    { nodeEnv: "production" },
    { explicitConfirmation: "yes" },
    { databaseName: "leetplus_prod" },
  ]) {
    expectCode(
      () => verify(fixture(), { ...SYNTHETIC_CONTEXT, ...overrides }),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
    );
  }

  const symbolContext = { ...SYNTHETIC_CONTEXT };
  symbolContext[Symbol("extra")] = true;
  expectCode(
    () => verify(fixture(), symbolContext),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
  );

  const revokedContext = Proxy.revocable({ ...SYNTHETIC_CONTEXT }, {});
  revokedContext.revoke();
  expectCode(
    () => verify(fixture(), revokedContext.proxy),
    "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
  );

  const activeNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    expectCode(
      () => verify(fixture()),
      "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_SYNTHETIC_CONTEXT_DENIED",
    );
  } finally {
    process.env.NODE_ENV = activeNodeEnv;
  }
});

test("fixture-substituted pinned roots expose only the exact frozen pinned payload", async () => {
  const fixtureNow = Date.now();
  const signer = authority({
    notAfter: new Date(fixtureNow + 60 * 60_000).toISOString(),
    notBefore: new Date(fixtureNow - 60 * 60_000).toISOString(),
  });
  const payload = payloadFor(signer, {
    issuedAt: new Date(fixtureNow - 10_000).toISOString(),
    validUntil: new Date(fixtureNow + 5 * 60_000).toISOString(),
  });
  const envelope = envelopeFor(payload, signer.privateKey);
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), "leetplus-duty-role-manifest-pinned-"),
  );
  try {
    const moduleSource = await readFile(CONTRACT_PATH, "utf8");
    const registryPattern =
      /export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS =\r?\n  Object\.freeze\(\{\}\);/gu;
    assert.equal([...moduleSource.matchAll(registryPattern)].length, 1);
    const fixtureRegistry = `export const PINNED_IDENTITY_MAIL_DUTY_ROLE_MANIFEST_ROOTS =
  Object.freeze({ ${JSON.stringify(KEY_ID)}: Object.freeze(${JSON.stringify(signer.root)}) });`;
    const fixtureModuleSource = moduleSource.replace(
      registryPattern,
      fixtureRegistry,
    );
    const fixtureModulePath = join(
      fixtureDirectory,
      "identity-mail-duty-role-manifest-current185.mjs",
    );
    await Promise.all([
      writeFile(fixtureModulePath, fixtureModuleSource, "utf8"),
      writeFile(
        join(fixtureDirectory, "staff-task-integrity-canonical-json.mjs"),
        await readFile(
          join(SCRIPT_DIR, "staff-task-integrity-canonical-json.mjs"),
          "utf8",
        ),
        "utf8",
      ),
    ]);
    const fixtureModule = await import(pathToFileURL(fixtureModulePath).href);
    const verified =
      fixtureModule.verifyPinnedIdentityMailDutyRoleManifestEnvelope(envelope);
    assert.equal(
      fixtureModule.isVerifiedIdentityMailDutyRoleManifest(verified),
      true,
    );
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailDutyRoleManifest(verified),
      false,
    );
    assert.equal(verified.verificationMode, "PINNED");
    const pinnedPayload =
      fixtureModule.identityMailDutyRoleManifestPayload(verified);
    assert.deepEqual(pinnedPayload, payload);
    assert(Object.isFrozen(pinnedPayload));
    assert(Object.isFrozen(pinnedPayload.database));
    assert(Object.isFrozen(pinnedPayload.roles));
    assert(Object.isFrozen(pinnedPayload.roles.coordinator));
    assert(Object.isFrozen(pinnedPayload.roles.worker));
    assert(Object.isFrozen(pinnedPayload.exactGrants));
    assert(Object.isFrozen(pinnedPayload.chain));
    assert(Object.isFrozen(pinnedPayload.chain.predecessor));
    assert(Object.isFrozen(pinnedPayload.chain.head));
    assert.notEqual(pinnedPayload, payload);
    assert.notEqual(pinnedPayload.roles, payload.roles);
    assert.equal(
      fixtureModule.isVerifiedIdentityMailDutyRoleManifest({ ...verified }),
      false,
    );
    assert.throws(
      () => fixtureModule.identityMailDutyRoleManifestPayload({ ...verified }),
      (error) =>
        error?.code === "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_NOT_VERIFIED",
    );

    const synthetic =
      fixtureModule.verifySyntheticIdentityMailDutyRoleManifestEnvelope(
        envelope,
        signer.roots,
        SYNTHETIC_CONTEXT,
        new Date(fixtureNow).toISOString(),
      );
    assert.equal(
      fixtureModule.isVerifiedSyntheticIdentityMailDutyRoleManifest(synthetic),
      true,
    );
    assert.throws(
      () => fixtureModule.identityMailDutyRoleManifestPayload(synthetic),
      (error) =>
        error?.code === "IDENTITY_MAIL_DUTY_ROLE_MANIFEST_NOT_VERIFIED",
    );
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
});

test("the dormant verifier has no database, network, env-root or runtime wiring", async () => {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  assert.equal([...source.matchAll(/^\s*import\b/gmu)].length, 2);
  assert.deepEqual(importSpecifiers, [
    "node:crypto",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.match(
    source,
    /String\(process\.env\.NODE_ENV \?\? ""\)\.toLowerCase\(\) !== "test"/u,
  );
  assert.doesNotMatch(
    source,
    /(?:@prisma\/client|PrismaClient|@nestjs|nodemailer|smtp|fetch\(|axios|node:net|node:http|node:https|DATABASE_URL|\$executeRaw|\$queryRaw|\bGRANT\b|\bREVOKE\b)/iu,
  );
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.match(source, /authorization:\s*false/u);
  assert.match(source, /canMutate:\s*false/u);
  assert.match(source, /canSend:\s*false/u);
  assert.match(source, /const VERIFIED_PINNED_MANIFESTS = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_SYNTHETIC_MANIFESTS = new WeakSet\(\)/u);
  assert.match(source, /const VERIFIED_PINNED_PAYLOADS = new WeakMap\(\)/u);
});
