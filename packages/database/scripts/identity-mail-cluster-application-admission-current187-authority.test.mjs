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
  CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE,
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_PURPOSES,
  CURRENT187_ADMISSION_PURPOSE_DEFINITIONS,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
  CURRENT187_ADMISSION_SLICE,
  CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
  CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
  CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE,
  CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE,
  Current187AdmissionContractError,
  PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE,
  current187AdmissionBindingProjection,
  current187AdmissionCanonicalJson,
  normalizeCurrent187AdmissionPayload,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  current187AdmissionPayloadDigest,
  current187AdmissionPublicKeyFingerprint,
  isVerifiedCurrent187AdmissionReceipt,
  verifyPinnedCurrent187AdmissionEnvelope,
  verifySyntheticCurrent187AdmissionEnvelope,
} from "./identity-mail-cluster-application-admission-current187-authority.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-cluster-application-admission-current187-contract.mjs",
);
const AUTHORITY_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-cluster-application-admission-current187-authority.mjs",
);
const NOW = "2026-08-05T09:00:00.000Z";

const PURPOSE_ALIASES = Object.freeze({
  [CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE]: "rehearsal",
  [CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE]: "enrollment",
  [CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE]: "deploy",
  [CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE]: "semantic",
});

const OPERATION_IDS = Object.freeze({
  [CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE]:
    "11111111-1111-4111-8111-111111111111",
  [CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE]:
    "22222222-2222-4222-8222-222222222222",
  [CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE]:
    "33333333-3333-4333-8333-333333333333",
  [CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE]:
    "44444444-4444-4444-8444-444444444444",
});

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof Current187AdmissionContractError &&
      error.reasonCode === reasonCode &&
      error.code === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function expectContractError(action) {
  assert.throws(
    action,
    (error) =>
      error instanceof Current187AdmissionContractError &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

const SIGNERS = Object.fromEntries(
  CURRENT187_ADMISSION_PURPOSES.map((purpose) => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
    return [
      purpose,
      Object.freeze({
        keyId: `current187-${PURPOSE_ALIASES[purpose]}-ci-1`,
        privateKey,
        publicKeyFingerprint:
          current187AdmissionPublicKeyFingerprint(publicKeyPem),
        publicKeyPem,
      }),
    ];
  }),
);

function rootFor(purpose, overrides) {
  const signer = SIGNERS[purpose];
  const definition = CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
  return {
    algorithm: CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
    keyId: signer.keyId,
    notAfter: "2026-08-05T10:00:00.000Z",
    notBefore: "2026-08-05T08:00:00.000Z",
    profile: definition.profile,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    publicKeyPem: signer.publicKeyPem,
    purpose,
    status: "ACTIVE",
    trustDomain: definition.trustDomain,
    ...overrides,
  };
}

function rootsFixture() {
  return Object.fromEntries(
    CURRENT187_ADMISSION_PURPOSES.map((purpose) => {
      const signer = SIGNERS[purpose];
      return [purpose, { [signer.keyId]: rootFor(purpose, {}) }];
    }),
  );
}

function bindingFor(purpose, overrides) {
  const common = {
    nonce: digest(`${purpose}:nonce`),
    operationId: OPERATION_IDS[purpose],
    purpose,
  };
  let specific;
  if (purpose === CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE) {
    specific = {
      bootstrapChallengeDigest: digest("bootstrap-challenge"),
      ceremonyTranscriptDigest: digest("bootstrap-transcript"),
      clusterIdentityDigest: digest("synthetic-cluster"),
      environment: "ci",
      expectedPriorAuthorityEpoch: "0",
      runtimeConfigDigest: digest("bootstrap-runtime-config"),
      syntheticRootSetDigest: digest("synthetic-root-set"),
      verifierArtifactDigest: digest("bootstrap-verifier"),
    };
  } else if (purpose === CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE) {
    specific = {
      ceremonyTranscriptDigest: digest("enrollment-transcript"),
      challengeDigest: digest("enrollment-challenge"),
      clusterIdentityDigest: digest("production-cluster"),
      engineeringGreenEvidenceDigest: digest("engineering-green"),
      environment: "production",
      executableDigest: digest("enrollment-executable"),
      expectedPriorAuthorityEpoch: "0",
      initialRevocationStateDigest: digest("initial-revocation-state"),
      operatorApprovalEvidenceDigest: digest("operator-approval"),
      runtimeConfigDigest: digest("enrollment-runtime-config"),
      signaturePolicyDigest: digest("signature-policy"),
      trustedRootSetDigest: digest("trusted-root-set"),
      verifierArtifactDigest: digest("enrollment-verifier"),
    };
  } else if (purpose === CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE) {
    specific = {
      beforeImageDigest: digest("before-image"),
      clusterCatalogDigest: digest("cluster-catalog"),
      clusterIdentityDigest: digest("production-cluster"),
      currentAclPolicyDigest: digest("current-acl-policy"),
      databaseUniverseDigest: digest("database-universe"),
      ddlFenceDigest: digest("ddl-fence"),
      defaultAclPolicyDigest: digest("default-acl-policy"),
      emergencyPlanDigest: digest("emergency-plan"),
      enrollmentReceiptDigest: digest("enrollment-receipt"),
      environment: "production",
      executableDigest: digest("deploy-executable"),
      expectedPriorAuthorityEpoch: "1",
      hbaDigest: digest("hba"),
      immutableArtifactDigest: digest("immutable-artifact"),
      liveScanDigest: digest("live-scan"),
      migrationManifestDigest: digest("migration-manifest"),
      networkEndpointDigest: digest("network-endpoint"),
      normalizedSqlDigest: digest("normalized-sql"),
      outboundKillSwitchEvidenceDigest: digest("outbound-kill-switch"),
      perDatabaseCatalogDigest: digest("per-database-catalog"),
      poolerDigest: digest("pooler"),
      postgresMajorVersion: 16,
      predecessorChainDigest: digest("predecessor-chain"),
      providerRecoveryEvidenceDigest: digest("provider-recovery"),
      releaseSha: "a".repeat(40),
      roleBindingsDigest: digest("role-bindings"),
      rollbackPlanDigest: digest("rollback-plan"),
      runtimeConfigDigest: digest("deploy-runtime-config"),
      serviceAccountMappingDigest: digest("service-account-mapping"),
      tlsDigest: digest("tls"),
      zeroDiffProofDigest: digest("zero-diff-proof"),
    };
  } else {
    specific = {
      clusterIdentityDigest: digest("semantic-cluster"),
      databaseUniverseDigest: digest("semantic-database-universe"),
      environment: "production",
      reviewEvidenceDigest: digest("semantic-review-evidence"),
      semanticAllowlistDocumentDigest: digest("semantic-allowlist-document"),
      semanticRiskFactsDigest: digest("semantic-risk-facts"),
    };
  }
  return { ...common, ...specific, ...overrides };
}

function payloadFor(purpose, bindingOverrides, payloadOverrides) {
  const definition = CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
  const signer = SIGNERS[purpose];
  return {
    ...bindingFor(purpose, bindingOverrides),
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-05T08:59:00.000Z",
    kind: definition.kind,
    profile: definition.profile,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: signer.keyId,
    slice: CURRENT187_ADMISSION_SLICE,
    trustDomain: definition.trustDomain,
    validUntil: "2026-08-05T09:04:00.000Z",
    ...payloadOverrides,
  };
}

function envelopeFor(payload, privateKey) {
  const normalized = normalizeCurrent187AdmissionPayload(payload);
  const payloadDigest = current187AdmissionPayloadDigest(normalized);
  return {
    payload,
    payloadDigest,
    publicKeyFingerprint: normalized.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(current187AdmissionCanonicalJson(normalized), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
    signingKeyId: normalized.signingKeyId,
  };
}

function fixture(purpose) {
  const payload = payloadFor(purpose, {}, {});
  return {
    envelope: envelopeFor(payload, SIGNERS[purpose].privateKey),
    expected: current187AdmissionBindingProjection(payload),
    purpose,
    roots: rootsFixture(),
  };
}

const SYNTHETIC_CONTEXT = Object.freeze({
  databaseName: "lp_current187_authority_ci",
  endpointHost: "127.0.0.1",
  environment: "ci",
  explicitConfirmation: CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
  nodeEnv: "test",
});

function verify(value) {
  return verifySyntheticCurrent187AdmissionEnvelope(
    value.envelope,
    value.purpose,
    value.expected,
    value.roots,
    SYNTHETIC_CONTEXT,
    NOW,
  );
}

test("verifies all four purpose domains into deep-frozen deny-only receipts", () => {
  const observedFingerprints = new Set();
  for (const purpose of CURRENT187_ADMISSION_PURPOSES) {
    const verified = verify(fixture(purpose));
    assert.equal(verified.authorization, false);
    assert.equal(verified.canMutate, false);
    assert.equal(verified.canSend, false);
    assert.equal(verified.testAccessAuthorized, false);
    assert.equal(verified.sharedBetaAccess, false);
    assert.equal(verified.productionRootEnrolled, false);
    assert.equal(verified.persistedConsumptionVerified, false);
    assert.equal(verified.envelope.payload.purpose, purpose);
    assert.equal(isVerifiedCurrent187AdmissionReceipt(verified), true);
    assert.equal(isVerifiedCurrent187AdmissionReceipt({ ...verified }), false);
    assert.equal(
      isVerifiedCurrent187AdmissionReceipt(
        JSON.parse(JSON.stringify(verified)),
      ),
      false,
    );
    assert(Object.isFrozen(verified));
    assert(Object.isFrozen(verified.envelope));
    assert(Object.isFrozen(verified.envelope.payload));
    observedFingerprints.add(verified.envelope.publicKeyFingerprint);
  }
  assert.equal(observedFingerprints.size, 4);
  assert.equal(isVerifiedCurrent187AdmissionReceipt(null), false);
  assert.equal(isVerifiedCurrent187AdmissionReceipt({}, true), false);
});

test("canonical JSON ignores key order while exact shapes reject drift", () => {
  const value = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  value.envelope.payload = Object.fromEntries(
    Object.entries(value.envelope.payload).reverse(),
  );
  value.expected = Object.fromEntries(Object.entries(value.expected).reverse());
  assert.equal(verify(value).authorization, false);

  const extraPayload = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  extraPayload.envelope.payload.extra = true;
  expectCode(
    () => verify(extraPayload),
    "CURRENT187_ADMISSION_PAYLOAD_INVALID",
  );

  const missingPayload = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  delete missingPayload.envelope.payload.clusterIdentityDigest;
  expectCode(
    () => verify(missingPayload),
    "CURRENT187_ADMISSION_PAYLOAD_INVALID",
  );

  const extraEnvelope = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  extraEnvelope.envelope.extra = true;
  expectCode(
    () => verify(extraEnvelope),
    "CURRENT187_ADMISSION_ENVELOPE_INVALID",
  );

  const extraExpected = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  extraExpected.expected = { ...extraExpected.expected };
  extraExpected.expected.extra = true;
  expectCode(
    () => verify(extraExpected),
    "CURRENT187_ADMISSION_EXPECTED_BINDING_INVALID",
  );
});

test("rejects prototype, accessor, proxy, symbol and array inputs without reading getters", () => {
  const inherited = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  Object.setPrototypeOf(inherited.envelope.payload, { inherited: true });
  expectCode(() => verify(inherited), "CURRENT187_ADMISSION_PAYLOAD_INVALID");

  const accessor = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  accessor.expected = { ...accessor.expected };
  let observed = false;
  Object.defineProperty(accessor.expected, "nonce", {
    enumerable: true,
    get() {
      observed = true;
      return digest("hostile-getter");
    },
  });
  expectCode(
    () => verify(accessor),
    "CURRENT187_ADMISSION_EXPECTED_BINDING_INVALID",
  );
  assert.equal(observed, false);

  const proxied = fixture(CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE);
  proxied.roots[CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE] = new Proxy(
    proxied.roots[CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE],
    {},
  );
  expectCode(
    () => verify(proxied),
    "CURRENT187_ADMISSION_ROOT_REGISTRY_INVALID",
  );

  const symbol = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  symbol.envelope[Symbol("extra")] = true;
  expectCode(() => verify(symbol), "CURRENT187_ADMISSION_ENVELOPE_INVALID");

  const arrayRoots = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  arrayRoots.roots = [];
  expectCode(
    () => verify(arrayRoots),
    "CURRENT187_ADMISSION_ROOT_REGISTRIES_INVALID",
  );
});

test("every purpose binding is signed, canonical and mutation-sensitive", () => {
  for (const purpose of CURRENT187_ADMISSION_PURPOSES) {
    const baseline = fixture(purpose);
    for (const field of CURRENT187_ADMISSION_BINDING_KEYS_BY_PURPOSE[purpose]) {
      const payload = { ...baseline.envelope.payload };
      if (field === "purpose") {
        payload[field] =
          purpose === CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE
            ? CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE
            : CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE;
      } else if (field === "operationId") {
        payload[field] = "99999999-9999-4999-8999-999999999999";
      } else if (field === "environment") {
        payload[field] = payload[field] === "ci" ? "production" : "ci";
      } else if (field === "expectedPriorAuthorityEpoch") {
        payload[field] = payload[field] === "0" ? "1" : "2";
      } else if (field === "postgresMajorVersion") {
        payload[field] = 17;
      } else if (field === "releaseSha") {
        payload[field] = "b".repeat(40);
      } else {
        payload[field] = digest(`mutated:${purpose}:${field}`);
      }
      let envelope;
      try {
        envelope = envelopeFor(payload, SIGNERS[purpose].privateKey);
      } catch (error) {
        assert(error instanceof Current187AdmissionContractError);
        continue;
      }
      const changed = { ...baseline, envelope };
      expectContractError(() => verify(changed));
    }
  }
});

test("contract discriminator, digest, fingerprint and signature mutations fail closed", () => {
  const purpose = CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE;
  for (const mutation of [
    { contract: "CURRENT187_CLUSTER_APPLICATION_ADMISSION_V2" },
    { schemaVersion: 2 },
    { slice: "CURRENT187_B" },
    { kind: "CURRENT187_PRODUCTION_DEPLOY_GO" },
    { profile: "CURRENT187_PRODUCTION_DEPLOY_GO_PROFILE_V1" },
    { trustDomain: "LEETPLUS_CURRENT187_OTHER_AUTHORITY_V1" },
  ]) {
    const value = fixture(purpose);
    value.envelope.payload = { ...value.envelope.payload, ...mutation };
    expectCode(() => verify(value), "CURRENT187_ADMISSION_CONTRACT_INVALID");
  }

  const digestMismatch = fixture(purpose);
  digestMismatch.envelope.payloadDigest = "f".repeat(64);
  expectCode(
    () => verify(digestMismatch),
    "CURRENT187_ADMISSION_ENVELOPE_BINDING_INVALID",
  );

  const fingerprintMismatch = fixture(purpose);
  fingerprintMismatch.envelope.publicKeyFingerprint = "e".repeat(64);
  expectCode(
    () => verify(fingerprintMismatch),
    "CURRENT187_ADMISSION_ENVELOPE_BINDING_INVALID",
  );

  const malformedSignature = fixture(purpose);
  malformedSignature.envelope.signature = "AA";
  expectCode(
    () => verify(malformedSignature),
    "CURRENT187_ADMISSION_SIGNATURE_INVALID",
  );
});

test("cross-purpose keys, signatures and relabeled roots are never accepted", () => {
  const bootstrap = fixture(
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE,
  );
  bootstrap.purpose = CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE;
  bootstrap.expected = bindingFor(
    CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE,
    {},
  );
  expectCode(
    () => verify(bootstrap),
    "CURRENT187_ADMISSION_ENVELOPE_BINDING_INVALID",
  );

  const enrollment = fixture(CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE);
  const bootstrapSigner =
    SIGNERS[CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE];
  enrollment.envelope.signature = signPayload(
    null,
    Buffer.from(
      current187AdmissionCanonicalJson(enrollment.envelope.payload),
      "utf8",
    ),
    bootstrapSigner.privateKey,
  ).toString("base64url");
  expectCode(
    () => verify(enrollment),
    "CURRENT187_ADMISSION_SIGNATURE_INVALID",
  );

  const relabeled = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  const deployPurpose = CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE;
  const deployKeyId = SIGNERS[deployPurpose].keyId;
  relabeled.roots[deployPurpose][deployKeyId] = rootFor(deployPurpose, {
    publicKeyFingerprint: bootstrapSigner.publicKeyFingerprint,
    publicKeyPem: bootstrapSigner.publicKeyPem,
  });
  expectCode(() => verify(relabeled), "CURRENT187_ADMISSION_ROOT_INVALID");
});

test("root shape, algorithm, domain, validity and key type are exact", () => {
  const purpose = CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE;
  const keyId = SIGNERS[purpose].keyId;
  const { publicKey: rsaPublicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const rsaPem = rsaPublicKey.export({ type: "spki", format: "pem" });
  const mutations = [
    { algorithm: "ECDSA" },
    { keyId: "wrong-key-id" },
    { notAfter: "2026-08-05T08:00:00.000Z" },
    { notBefore: "2026-08-05T10:00:00.000Z" },
    { profile: "CURRENT187_OTHER_PROFILE_V1" },
    { publicKeyFingerprint: "f".repeat(64) },
    { publicKeyPem: rsaPem },
    { purpose: CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE },
    { status: "REVOKED" },
    { trustDomain: "LEETPLUS_CURRENT187_OTHER_AUTHORITY_V1" },
  ];
  for (const mutation of mutations) {
    const value = fixture(purpose);
    value.roots[purpose][keyId] = rootFor(purpose, mutation);
    expectContractError(() => verify(value));
  }

  const extra = fixture(purpose);
  extra.roots[purpose][keyId].extra = true;
  expectCode(() => verify(extra), "CURRENT187_ADMISSION_ROOT_INVALID");
});

test("timeline and explicit verification time are bounded and canonical", () => {
  const purpose = CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE;
  for (const mutation of [
    { issuedAt: "2026-08-05T09:00:30.001Z" },
    { validUntil: NOW },
    {
      issuedAt: "2026-08-05T08:50:00.000Z",
      validUntil: "2026-08-05T08:55:00.001Z",
    },
  ]) {
    const value = fixture(purpose);
    const payload = { ...value.envelope.payload, ...mutation };
    value.envelope = envelopeFor(payload, SIGNERS[purpose].privateKey);
    expectCode(() => verify(value), "CURRENT187_ADMISSION_TIMELINE_INVALID");
  }

  const value = fixture(purpose);
  expectCode(
    () =>
      verifySyntheticCurrent187AdmissionEnvelope(
        value.envelope,
        value.purpose,
        value.expected,
        value.roots,
        SYNTHETIC_CONTEXT,
        "2026-08-05T09:00:00Z",
      ),
    "CURRENT187_ADMISSION_CURRENT_TIME_INVALID",
  );
});

test("synthetic roots require exact loopback test/CI context", () => {
  const value = fixture(CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE);
  for (const override of [
    { databaseName: "postgres" },
    { databaseName: "leetplus_prod_ci" },
    { databaseName: "leetplus_sandbox" },
    { endpointHost: "db.internal" },
    { endpointHost: "LOCALHOST" },
    { environment: "staging" },
    { explicitConfirmation: "yes" },
    { nodeEnv: "development" },
  ]) {
    expectCode(
      () =>
        verifySyntheticCurrent187AdmissionEnvelope(
          value.envelope,
          value.purpose,
          value.expected,
          value.roots,
          { ...SYNTHETIC_CONTEXT, ...override },
          NOW,
        ),
      "CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_DENIED",
    );
  }

  process.env.NODE_ENV = "production";
  try {
    expectCode(
      () => verify(value),
      "CURRENT187_ADMISSION_SYNTHETIC_CONTEXT_DENIED",
    );
  } finally {
    process.env.NODE_ENV = "test";
  }
});

test("all pinned production registries are frozen-empty and caller injection is impossible", () => {
  assert.deepEqual(
    Object.keys(PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE).sort(),
    [...CURRENT187_ADMISSION_PURPOSES].sort(),
  );
  assert(Object.isFrozen(PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE));
  for (const purpose of CURRENT187_ADMISSION_PURPOSES) {
    const registry = PINNED_CURRENT187_PRODUCTION_ROOTS_BY_PURPOSE[purpose];
    assert(Object.isFrozen(registry));
    assert.deepEqual(Object.keys(registry), []);
    assert.throws(() => {
      registry.injected = rootFor(purpose, {});
    }, TypeError);
  }

  const value = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  expectCode(
    () =>
      verifyPinnedCurrent187AdmissionEnvelope(
        value.envelope,
        value.purpose,
        value.expected,
      ),
    "CURRENT187_ADMISSION_AUTHORITY_NOT_ENROLLED",
  );
  expectCode(
    () =>
      verifyPinnedCurrent187AdmissionEnvelope(
        value.envelope,
        value.purpose,
        value.expected,
        value.roots,
      ),
    "CURRENT187_ADMISSION_ARGUMENTS_INVALID",
  );

  process.env.CURRENT187_ADMISSION_ROOTS = current187AdmissionCanonicalJson(
    value.roots,
  );
  try {
    expectCode(
      () =>
        verifyPinnedCurrent187AdmissionEnvelope(
          value.envelope,
          value.purpose,
          value.expected,
        ),
      "CURRENT187_ADMISSION_AUTHORITY_NOT_ENROLLED",
    );
  } finally {
    delete process.env.CURRENT187_ADMISSION_ROOTS;
  }
});

test("synthetic registry bundle is exact, complete and independently keyed", () => {
  const value = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  delete value.roots[CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE];
  expectCode(
    () => verify(value),
    "CURRENT187_ADMISSION_ROOT_REGISTRIES_INVALID",
  );

  const empty = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  empty.roots[CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE] = {};
  expectCode(
    () => verify(empty),
    "CURRENT187_ADMISSION_SYNTHETIC_ROOTS_INCOMPLETE",
  );

  const duplicate = fixture(CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE);
  const rehearsalPurpose =
    CURRENT187_PRE_GREEN_ROOT_BOOTSTRAP_REHEARSAL_PURPOSE;
  const enrollmentPurpose = CURRENT187_PRODUCTION_ROOT_ENROLLMENT_GO_PURPOSE;
  const rehearsalSigner = SIGNERS[rehearsalPurpose];
  const enrollmentSigner = SIGNERS[enrollmentPurpose];
  duplicate.roots[enrollmentPurpose][enrollmentSigner.keyId] = rootFor(
    enrollmentPurpose,
    {
      publicKeyFingerprint: rehearsalSigner.publicKeyFingerprint,
      publicKeyPem: rehearsalSigner.publicKeyPem,
    },
  );
  expectCode(() => verify(duplicate), "CURRENT187_ADMISSION_ROOT_INVALID");
});

test("pure source has no database, framework, network, provider or filesystem I/O", async () => {
  const [contractSource, authoritySource] = await Promise.all([
    readFile(CONTRACT_PATH, "utf8"),
    readFile(AUTHORITY_PATH, "utf8"),
  ]);
  const contractImports = [
    ...contractSource.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  const authorityImports = [
    ...authoritySource.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  assert.deepEqual(contractImports, [
    "node:util",
    "./staff-task-integrity-canonical-json.mjs",
  ]);
  assert.deepEqual(authorityImports, [
    "node:crypto",
    "./identity-mail-cluster-application-admission-current187-contract.mjs",
  ]);

  const forbidden =
    /@prisma|PrismaClient|@nestjs|nodemailer|smtp|provider\s*\.|fetch\s*\(|node:fs|node:net|node:http|node:https|node:tls|node:dns|node:child_process|DATABASE_URL|\$executeRaw|\$queryRaw|createConnection|createServer|readFile|writeFile/iu;
  assert.doesNotMatch(contractSource, forbidden);
  assert.doesNotMatch(authoritySource, forbidden);
  assert.doesNotMatch(
    `${contractSource}\n${authoritySource}`,
    /tenantProvision|createTenant|createInvite|sharedBetaAccess:\s*true|testAccessAuthorized:\s*true/iu,
  );
  for (const denyFlag of [
    "authorization",
    "canMutate",
    "canSend",
    "testAccessAuthorized",
    "sharedBetaAccess",
    "productionRootEnrolled",
  ]) {
    assert.match(authoritySource, new RegExp(`${denyFlag}:\\s*false`, "u"));
  }
  assert.match(authoritySource, /new WeakSet\(\)/u);
  assert.match(authoritySource, /current187AdmissionDeepFreeze/u);
  assert.doesNotMatch(
    `${contractSource}\n${authoritySource}`,
    /function\s+[a-zA-Z0-9_]+\([^)]*=/u,
  );
});

test("receipts remain PII/secret-free and never claim persisted one-time semantics", () => {
  for (const purpose of CURRENT187_ADMISSION_PURPOSES) {
    const serialized = current187AdmissionCanonicalJson(
      verify(fixture(purpose)),
    );
    assert.doesNotMatch(
      serialized,
      /@|email|password|connectionUrl|token|ciphertext|providerPayload|secretManagerReference/iu,
    );
    assert.match(serialized, /"persistedConsumptionVerified":false/u);
  }
});
