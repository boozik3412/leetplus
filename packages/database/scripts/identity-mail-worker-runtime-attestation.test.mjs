import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_KIND,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_LIFETIME_MS,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SCHEMA_HEAD,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONFIRMATION,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_ORDER,
  IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN,
  IdentityMailWorkerRuntimeAttestationError,
  PINNED_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS,
  identityMailWorkerRuntimeAttestationPayloadDigest,
  identityMailWorkerRuntimeAttestationPublicKeyFingerprint,
  isVerifiedIdentityMailWorkerRuntimeAttestation,
  verifyPinnedIdentityMailWorkerRuntimeAttestationEnvelope,
  verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope,
} from "./identity-mail-worker-runtime-attestation.mjs";
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
  "identity-mail-worker-runtime-attestation.mjs",
);
const NOW = "2026-08-01T09:00:00.000Z";
const DATABASE_NAME = `lp_imwra_${"a".repeat(32)}_ci`;
const KEY_ID = "identity-mail-runtime-ci-1";
const DIGESTS = Object.freeze({
  actualContext: "1".repeat(64),
  artifact: "2".repeat(64),
  configuration: "3".repeat(64),
  databaseIdentity: "4".repeat(64),
  deploymentMarker: "5".repeat(64),
  executable: "6".repeat(64),
  provider: "7".repeat(64),
  runtimeConfig: "8".repeat(64),
});

const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: DATABASE_NAME,
  environment: "ci",
  explicitConfirmation:
    IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
  nodeEnv: "test",
});

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailWorkerRuntimeAttestationError &&
      error.reasonCode === reasonCode &&
      error.code === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function tenantId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function tenantBinding(index, overrides = {}) {
  return {
    currentConfigurationDigest: DIGESTS.configuration,
    policyRevision: 5,
    providerAuthorityDigest: DIGESTS.provider,
    stateRevision: 7,
    tenantId: tenantId(index),
    workerRoleName: "identity_mail_worker_v2",
    workerRoleOid: 16_385,
    ...overrides,
  };
}

function authority(rootOverrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    identityMailWorkerRuntimeAttestationPublicKeyFingerprint(publicKeyPem);
  const root = {
    algorithm: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2026-08-02T00:00:00.000Z",
    notBefore: "2026-08-01T00:00:00.000Z",
    profile: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE,
    status: "ACTIVE",
    trustDomain: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN,
    ...rootOverrides,
  };
  return {
    privateKey,
    publicKeyFingerprint,
    roots: { [KEY_ID]: root },
  };
}

function expectedBindings(tenantBindings = [tenantBinding(1)], overrides = {}) {
  return {
    actualContextDigest: DIGESTS.actualContext,
    databaseIdentityDigest: DIGESTS.databaseIdentity,
    databaseName: DATABASE_NAME,
    databaseOid: 16_384,
    deploymentMarkerDigest: DIGESTS.deploymentMarker,
    deploymentMarkerId: "11111111-1111-4111-8111-111111111111",
    migrationCount: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MIGRATION_COUNT,
    releaseSha: "a".repeat(40),
    runtimeConfigDigest: DIGESTS.runtimeConfig,
    schemaHead: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SCHEMA_HEAD,
    tenantBindings,
    workerArtifactDigest: DIGESTS.artifact,
    workerExecutableDigest: DIGESTS.executable,
    ...overrides,
  };
}

function payloadFor(authorityFixture, expected, overrides = {}) {
  return {
    actualContextDigest: expected.actualContextDigest,
    attestationId: "22222222-2222-4222-8222-222222222222",
    contract: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT,
    databaseIdentityDigest: expected.databaseIdentityDigest,
    databaseName: expected.databaseName,
    databaseOid: expected.databaseOid,
    deploymentMarkerDigest: expected.deploymentMarkerDigest,
    deploymentMarkerId: expected.deploymentMarkerId,
    issuedAt: "2026-08-01T08:59:00.000Z",
    kind: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_KIND,
    migrationCount: expected.migrationCount,
    profile: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PROFILE,
    publicKeyFingerprint: authorityFixture.publicKeyFingerprint,
    purpose: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PURPOSE,
    releaseSha: expected.releaseSha,
    runtimeConfigDigest: expected.runtimeConfigDigest,
    schemaHead: expected.schemaHead,
    schemaVersion: 1,
    signingKeyId: KEY_ID,
    tenantBindings: expected.tenantBindings,
    trustDomain: IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TRUST_DOMAIN,
    validUntil: "2026-08-01T09:10:00.000Z",
    workerArtifactDigest: expected.workerArtifactDigest,
    workerExecutableDigest: expected.workerExecutableDigest,
    ...overrides,
  };
}

function envelopeFor(payload, privateKey, overrides = {}) {
  return {
    payload,
    payloadDigest: identityMailWorkerRuntimeAttestationPayloadDigest(payload),
    publicKeyFingerprint: payload.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
    ...overrides,
  };
}

function fixture(tenantBindings = [tenantBinding(1)]) {
  const signer = authority();
  const expected = expectedBindings(tenantBindings);
  const payload = payloadFor(signer, expected);
  return {
    envelope: envelopeFor(payload, signer.privateKey),
    expected,
    signer,
  };
}

function verify(value) {
  return verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
    value.envelope,
    value.expected,
    value.signer.roots,
    SYNTHETIC_CONTEXT,
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

test("verifies branded non-authorizing attestations for one and two tenants", () => {
  for (const tenants of [
    [tenantBinding(1)],
    [tenantBinding(1), tenantBinding(2)],
  ]) {
    const value = fixture(tenants);
    const verified = verify(value);
    assert.equal(isVerifiedIdentityMailWorkerRuntimeAttestation(verified), true);
    assert.equal(verified.authorization, false);
    assert.equal(verified.canMutate, false);
    assert.equal(verified.canSend, false);
    assert.equal(verified.databaseReadinessRequiredPerTenant, true);
    assert.deepEqual(
      verified.tenantIds,
      tenants.map((tenant) => tenant.tenantId),
    );
    assert.equal(verified.verifiedAt, NOW);
    assert(Object.isFrozen(verified));
    assert(Object.isFrozen(verified.envelope));
    assert(Object.isFrozen(verified.envelope.payload));
    assert(Object.isFrozen(verified.envelope.payload.tenantBindings));
  }
});

test("uses canonical JSON while requiring strict signer tenant order", () => {
  const value = fixture([tenantBinding(1), tenantBinding(2)]);
  value.envelope.payload = Object.fromEntries(
    Object.entries(value.envelope.payload).reverse(),
  );
  assert.equal(verify(value).tenantIds.length, 2);
  assert.equal(
    IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_ORDER,
    "STRICT_ASCENDING_TENANT_ID",
  );

  for (const tenants of [
    [],
    [tenantBinding(2), tenantBinding(1)],
    [tenantBinding(1), tenantBinding(1)],
    [
      tenantBinding(1),
      tenantBinding(2),
      tenantBinding(3),
      tenantBinding(4),
      tenantBinding(5),
    ],
  ]) {
    const invalid = resign(fixture(), { tenantBindings: tenants });
    expectCode(
      () => verify(invalid),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
    );
  }
});

test("rejects hostile record, descriptor, prototype, array and symbol shapes", () => {
  const extraEnvelope = fixture();
  extraEnvelope.envelope.extra = true;
  expectCode(
    () => verify(extraEnvelope),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ENVELOPE_INVALID",
  );

  const inheritedPayload = fixture();
  Object.setPrototypeOf(inheritedPayload.envelope.payload, { inherited: true });
  expectCode(
    () => verify(inheritedPayload),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PAYLOAD_INVALID",
  );

  const accessorPayload = fixture();
  Object.defineProperty(accessorPayload.envelope.payload, "releaseSha", {
    enumerable: true,
    get: () => "a".repeat(40),
  });
  expectCode(
    () => verify(accessorPayload),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_PAYLOAD_INVALID",
  );

  const symbolTenant = fixture();
  const hostileTenant = { ...symbolTenant.envelope.payload.tenantBindings[0] };
  hostileTenant[Symbol("extra")] = true;
  const signedSymbolTenant = resign(symbolTenant, {
    tenantBindings: [hostileTenant],
  });
  expectCode(
    () => verify(signedSymbolTenant),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
  );

  const accessorExpected = fixture();
  Object.defineProperty(accessorExpected.expected, "databaseOid", {
    enumerable: true,
    get: () => 16_384,
  });
  expectCode(
    () => verify(accessorExpected),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDINGS_INVALID",
  );

  const sparseTenants = fixture();
  sparseTenants.envelope.payload.tenantBindings = new Array(1);
  expectCode(
    () => verify(sparseTenants),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
  );

  const oversizedSparseTenants = fixture();
  const oversized = [];
  oversized.length = 4_294_967_295;
  oversizedSparseTenants.envelope.payload.tenantBindings = oversized;
  expectCode(
    () => verify(oversizedSparseTenants),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
  );
});

test("enforces the CURRENT180 database and worker-role identifier patterns", () => {
  const invalidDatabases = ["_leetplus", "9leetplus", "Leetplus"];
  for (const databaseName of invalidDatabases) {
    const value = fixture();
    value.expected.databaseName = databaseName;
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDINGS_INVALID",
    );
  }

  for (const workerRoleName of ["a", "ab", "_a", "Public"]) {
    const tenants = [tenantBinding(1, { workerRoleName })];
    const value = resign(fixture(), { tenantBindings: tenants });
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TENANT_BINDINGS_INVALID",
    );
  }

  assert.equal(
    verify(fixture([tenantBinding(1, { workerRoleName: "_ab" })])).canSend,
    false,
  );
});

test("rejects cross-domain roots and payloads even when the Ed25519 key is reused", () => {
  const wrongRootFields = [
    {
      purpose: "IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND",
    },
    {
      profile: "SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1",
    },
    {
      trustDomain: "LEETPLUS_SHARED_BETA_DEPLOYMENT_AUTHORITY_V1",
    },
  ];
  for (const overrides of wrongRootFields) {
    const value = fixture();
    value.signer.roots[KEY_ID] = {
      ...value.signer.roots[KEY_ID],
      ...overrides,
    };
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
    );
  }

  const wrongPurpose = fixture();
  const resigned = resign(wrongPurpose, {
    purpose: "SHARED_BETA_DEPLOYMENT_PROVENANCE",
  });
  expectCode(
    () => verify(resigned),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CONTRACT_INVALID",
  );
});

test("rejects malformed, noncanonical and cryptographically invalid signatures", () => {
  const malformed = fixture();
  malformed.envelope.signature = "AA";
  expectCode(
    () => verify(malformed),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
  );

  const padded = fixture();
  padded.envelope.signature += "=";
  expectCode(
    () => verify(padded),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
  );

  const corrupted = fixture();
  const signature = Buffer.from(corrupted.envelope.signature, "base64url");
  signature[0] ^= 0xff;
  corrupted.envelope.signature = signature.toString("base64url");
  expectCode(
    () => verify(corrupted),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SIGNATURE_INVALID",
  );

  const digestMismatch = fixture();
  digestMismatch.envelope.payloadDigest = "f".repeat(64);
  expectCode(
    () => verify(digestMismatch),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ENVELOPE_BINDING_INVALID",
  );
});

test("enforces a fresh short finite timeline against explicit now and root window", () => {
  const timelineMutations = [
    {
      issuedAt: "2026-08-01T08:50:00.000Z",
      validUntil: new Date(
        Date.parse("2026-08-01T08:50:00.000Z") +
          IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_MAX_LIFETIME_MS +
          1,
      ).toISOString(),
    },
    { validUntil: NOW },
    { issuedAt: "2026-08-01T09:01:00.001Z" },
    { issuedAt: "2026-08-01T09:02:00Z" },
  ];
  for (const mutation of timelineMutations) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_TIMELINE_INVALID",
    );
  }

  const inactiveRoot = fixture();
  inactiveRoot.signer.roots[KEY_ID] = {
    ...inactiveRoot.signer.roots[KEY_ID],
    notAfter: "2026-08-01T09:00:00.000Z",
  };
  expectCode(
    () => verify(inactiveRoot),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INACTIVE",
  );

  const missingNow = fixture();
  expectCode(
    () =>
      verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
        missingNow.envelope,
        missingNow.expected,
        missingNow.signer.roots,
        SYNTHETIC_CONTEXT,
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ARGUMENTS_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
        missingNow.envelope,
        missingNow.expected,
        missingNow.signer.roots,
        SYNTHETIC_CONTEXT,
        "2026-08-01T09:00:00Z",
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_CURRENT_TIME_INVALID",
  );
});

test("binds every release, deployment, database, executable and runtime value", () => {
  const mutations = [
    { releaseSha: "b".repeat(40) },
    { deploymentMarkerId: "33333333-3333-4333-8333-333333333333" },
    { deploymentMarkerDigest: "9".repeat(64) },
    { databaseName: `lp_imwra_${"b".repeat(32)}_ci` },
    { databaseOid: 16_386 },
    { databaseIdentityDigest: "a".repeat(64) },
    { actualContextDigest: "b".repeat(64) },
    { runtimeConfigDigest: "c".repeat(64) },
    { workerExecutableDigest: "d".repeat(64) },
    { workerArtifactDigest: "e".repeat(64) },
  ];
  for (const mutation of mutations) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDING_MISMATCH",
    );
  }

  const tenantMutation = fixture();
  expectCode(
    () =>
      verify(
        resign(tenantMutation, {
          tenantBindings: [
            tenantBinding(1, { providerAuthorityDigest: "f".repeat(64) }),
          ],
        }),
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_EXPECTED_BINDING_MISMATCH",
  );

  for (const mutation of [
    { schemaHead: "20260731120000_identity_mail_delivery_release_head" },
    { migrationCount: 179 },
  ]) {
    expectCode(
      () => verify(resign(fixture(), mutation)),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_RELEASE_BINDING_INVALID",
    );
  }
});

test("checks root fingerprint, status, canonical key and authority window", () => {
  for (const rootMutation of [
    { status: "REVOKED" },
    { publicKeyFingerprint: "0".repeat(64) },
    { algorithm: "EdDSA" },
    { notAfter: "2026-07-31T00:00:00.000Z" },
  ]) {
    const value = fixture();
    value.signer.roots[KEY_ID] = {
      ...value.signer.roots[KEY_ID],
      ...rootMutation,
    };
    expectCode(
      () => verify(value),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
    );
  }

  const accessorRoot = fixture();
  Object.defineProperty(accessorRoot.signer.roots[KEY_ID], "status", {
    enumerable: true,
    get: () => "ACTIVE",
  });
  expectCode(
    () => verify(accessorRoot),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
  );

  const nonStringPem = fixture();
  nonStringPem.signer.roots[KEY_ID] = {
    ...nonStringPem.signer.roots[KEY_ID],
    publicKeyPem: Buffer.from("not-a-pem"),
  };
  expectCode(
    () => verify(nonStringPem),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOT_INVALID",
  );
});

test("production pinned verification is immutable, empty and not injectable", () => {
  const value = fixture();
  assert.deepEqual(Object.keys(PINNED_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS), []);
  assert(Object.isFrozen(PINNED_IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ROOTS));
  expectCode(
    () =>
      verifyPinnedIdentityMailWorkerRuntimeAttestationEnvelope(
        value.envelope,
        value.expected,
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailWorkerRuntimeAttestationEnvelope(
        value.envelope,
        value.expected,
        NOW,
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ARGUMENTS_INVALID",
  );
  expectCode(
    () =>
      verifyPinnedIdentityMailWorkerRuntimeAttestationEnvelope(
        value.envelope,
        value.expected,
        value.signer.roots,
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_ARGUMENTS_INVALID",
  );
});

test("synthetic roots require the exact confirmed loopback-CI context", () => {
  const invalidContexts = [
    { hostname: "worker.example.com" },
    { hostname: "LOCALHOST" },
    { environment: "production" },
    { nodeEnv: "production" },
    { explicitConfirmation: "yes" },
    { databaseName: "leetplus_prod" },
  ];
  for (const overrides of invalidContexts) {
    const value = fixture();
    expectCode(
      () =>
        verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
          value.envelope,
          value.expected,
          value.signer.roots,
          { ...SYNTHETIC_CONTEXT, ...overrides },
          NOW,
        ),
      "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
    );
  }

  const symbolContext = { ...SYNTHETIC_CONTEXT };
  symbolContext[Symbol("extra")] = true;
  const value = fixture();
  expectCode(
    () =>
      verifySyntheticIdentityMailWorkerRuntimeAttestationEnvelope(
        value.envelope,
        value.expected,
        value.signer.roots,
        symbolContext,
        NOW,
      ),
    "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
  );

  const activeNodeEnv = process.env.NODE_ENV;
  try {
    for (const ambientNodeEnv of [
      undefined,
      "development",
      "prod",
      "Production",
    ]) {
      if (ambientNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = ambientNodeEnv;
      }
      expectCode(
        () => verify(fixture()),
        "IDENTITY_MAIL_WORKER_RUNTIME_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
      );
    }
  } finally {
    process.env.NODE_ENV = activeNodeEnv;
  }
});

test("WeakSet branding rejects copies and the module has no mutation or sending path", async () => {
  const verified = verify(fixture());
  assert.equal(isVerifiedIdentityMailWorkerRuntimeAttestation(verified), true);
  assert.equal(
    isVerifiedIdentityMailWorkerRuntimeAttestation({ ...verified }),
    false,
  );
  assert.equal(isVerifiedIdentityMailWorkerRuntimeAttestation(null), false);

  const source = await readFile(CONTRACT_PATH, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
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
    /(?:@prisma\/client|nodemailer|smtp|fetch\(|node:net|node:http|node:https|\$executeRaw|\$queryRaw)/iu,
  );
  assert.match(source, /databaseReadinessRequiredPerTenant:\s*true/u);
  assert.match(source, /authorization:\s*false/u);
  assert.match(source, /canMutate:\s*false/u);
  assert.match(source, /canSend:\s*false/u);
});
