import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO,
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS,
  CURRENT187_CONNECTION_PROBE_KIND,
  CURRENT187_CONNECTION_PROBE_PROFILE,
  CURRENT187_CONNECTION_PROBE_PURPOSE,
  CURRENT187_CONNECTION_PROBE_RECEIPT_KIND,
  CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
  CURRENT187_CONNECTION_PROBE_SLICE,
  CURRENT187_CONNECTION_PROBE_STATUS,
  CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
  CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS,
  Current187AdmissionContractError,
  current187ConnectionProbePayloadDigest,
  current187ConnectionProbePublicKeyFingerprint,
  isVerifiedCurrent187ConnectionProbeReceipt,
  verifyPinnedCurrent187ConnectionProbeEnvelope,
  verifySyntheticCurrent187ConnectionProbeEnvelope,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

const NOW = "2026-08-12T12:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function createSigner(keyId = "current187-connection-probe-ci-1") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return Object.freeze({
    keyId,
    privateKey,
    publicKeyFingerprint:
      current187ConnectionProbePublicKeyFingerprint(publicKeyPem),
    publicKeyPem,
  });
}

const SIGNER = createSigner();

function root(signer = SIGNER, overrides = {}) {
  return {
    algorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    keyId: signer.keyId,
    notAfter: "2026-08-12T13:00:00.000Z",
    notBefore: "2026-08-12T11:00:00.000Z",
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    publicKeyPem: signer.publicKeyPem,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    status: "ACTIVE",
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    ...overrides,
  };
}

function roots(signer = SIGNER) {
  return { [signer.keyId]: root(signer) };
}

function negativeProbes(purpose) {
  return CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.map((scenario) => ({
    evidenceDigest: digest(`${purpose}:${scenario}`),
    observedOutcome:
      CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario],
    scenario,
  }));
}

function service(purpose, index) {
  return {
    allowedOperationsDigest: digest(`${purpose}:operations`),
    applicationNameDigest: digest(`${purpose}:application`),
    backendIdentityDigest: digest(`${purpose}:backend`),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceiptDigest: digest(`${purpose}:j2`),
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(`${purpose}:hba`),
    negativeProbes: negativeProbes(purpose),
    poolerMappingDigest: digest(`${purpose}:pooler`),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    positiveOutcome: "ALLOWED",
    positiveProbeDigest: digest(`${purpose}:positive`),
    postgresSessionReceiptDigest: digest(`${purpose}:j1`),
    purpose,
    secretReferenceDigest: digest(`${purpose}:secret-reference`),
    tlsMode: "VERIFY_FULL",
  };
}

function payload(overrides = {}) {
  return {
    clusterIdentityDigest: digest("cluster"),
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: digest("universe"),
    environment: "ci",
    hbaControlReceiptDigest: digest("j3-control"),
    hostControlChallengeDigest: digest("host-challenge"),
    issuedAt: "2026-08-12T11:59:00.000Z",
    kind: CURRENT187_CONNECTION_PROBE_KIND,
    nonce: digest("nonce"),
    operationId: OPERATION_ID,
    pgbouncerControlReceiptDigest: digest("j4-control"),
    probeRunnerArtifactDigest: digest("probe-runner"),
    probeTranscriptDigest: digest("probe-transcript"),
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: SIGNER.publicKeyFingerprint,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    releaseSha: RELEASE_SHA,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(service),
    signingKeyId: SIGNER.keyId,
    slice: CURRENT187_CONNECTION_PROBE_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: "2026-08-12T12:04:00.000Z",
    ...overrides,
  };
}

function envelope(payloadValue = payload(), signer = SIGNER) {
  return {
    payload: payloadValue,
    payloadDigest: current187ConnectionProbePayloadDigest(payloadValue),
    publicKeyFingerprint: signer.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(current187AdmissionCanonicalJson(payloadValue), "utf8"),
      signer.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    signingKeyId: signer.keyId,
  };
}

function context(overrides = {}) {
  return {
    databaseName: "leetplus_ci",
    endpointHost: "127.0.0.1",
    environment: "ci",
    explicitConfirmation: CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
    nodeEnv: "test",
    ...overrides,
  };
}

function verify(envelopeValue = envelope(), overrides = {}) {
  return verifySyntheticCurrent187ConnectionProbeEnvelope(
    envelopeValue,
    overrides.roots ?? roots(),
    overrides.context ?? context(),
    overrides.now ?? NOW,
  );
}

function expectCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof Current187AdmissionContractError &&
      error.code === code &&
      error.reasonCode === code &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

test("independently signed four-service probe matrix verifies deny-only", () => {
  const receipt = verify();
  assert.equal(receipt.kind, CURRENT187_CONNECTION_PROBE_RECEIPT_KIND);
  assert.equal(receipt.status, CURRENT187_CONNECTION_PROBE_STATUS);
  assert.equal(receipt.signatureVerified, true);
  assert.equal(receipt.negativeProbeMatrixPassed, true);
  assert.equal(receipt.syntheticOnly, true);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.deepEqual(
    receipt.serviceEvidence.map((row) => row.purpose),
    CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES,
  );
  assert.equal(isVerifiedCurrent187ConnectionProbeReceipt(receipt), true);
  assert.equal(
    isVerifiedCurrent187ConnectionProbeReceipt({ ...receipt }),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /secret-reference|leetplus_ci|127\.0\.0\.1|password|postgresql:\/\//iu,
  );
});

test("exact eight-scenario order and denied outcome are mandatory per service", () => {
  for (const mutate of [
    (source) => source.services[0].negativeProbes.pop(),
    (source) => source.services[0].negativeProbes.reverse(),
    (source) => {
      source.services[0].negativeProbes[0].observedOutcome = "ALLOWED";
    },
    (source) => {
      source.services[0].negativeProbes[0].scenario = "UNKNOWN";
    },
    (source) => {
      source.services[0].negativeProbes[0].evidenceDigest = "0".repeat(64);
    },
  ]) {
    const candidate = structuredClone(payload());
    mutate(candidate);
    expectCode(
      () => current187ConnectionProbePayloadDigest(candidate),
      "CURRENT187_CONNECTION_PROBE_NEGATIVE_MATRIX_INVALID",
    );
  }
});

test("purpose order, endpoint class, pool mode, TLS, HBA, and positive probe fail closed", () => {
  for (const mutate of [
    (source) => source.services.reverse(),
    (source) => {
      source.services[0].endpointClass = "DIRECT_DATABASE";
    },
    (source) => {
      source.services[1].poolMode = "TRANSACTION";
    },
    (source) => {
      source.services[2].tlsMode = "DISABLE";
    },
    (source) => {
      source.services[3].hbaAuthMethod = "trust";
    },
    (source) => {
      source.services[0].positiveOutcome = "DENIED";
    },
  ]) {
    const candidate = structuredClone(payload());
    mutate(candidate);
    expectCode(
      () => current187ConnectionProbePayloadDigest(candidate),
      "CURRENT187_CONNECTION_PROBE_SERVICE_INVALID",
    );
  }
});

test("service identity collapse is rejected across four independent purposes", () => {
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "poolerMappingDigest",
    "positiveProbeDigest",
    "secretReferenceDigest",
  ]) {
    const candidate = structuredClone(payload());
    candidate.services[1][key] = candidate.services[0][key];
    expectCode(
      () => current187ConnectionProbePayloadDigest(candidate),
      "CURRENT187_CONNECTION_PROBE_SERVICE_COLLAPSE",
    );
  }
});

test("negative probe evidence cannot be reused across service paths", () => {
  const candidate = structuredClone(payload());
  candidate.services[1].negativeProbes[0].evidenceDigest =
    candidate.services[0].negativeProbes[0].evidenceDigest;
  expectCode(
    () => current187ConnectionProbePayloadDigest(candidate),
    "CURRENT187_CONNECTION_PROBE_EVIDENCE_REUSE",
  );
});

test("signature, payload digest, trusted origin, and root purpose are inseparable", () => {
  const good = envelope();
  expectCode(
    () => verify({ ...good, signature: "A".repeat(86) }),
    "CURRENT187_CONNECTION_PROBE_SIGNATURE_INVALID",
  );
  expectCode(
    () => verify({ ...good, payloadDigest: "f".repeat(64) }),
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_DIGEST_MISMATCH",
  );

  const attacker = createSigner("current187-connection-probe-attacker-1");
  const attackerPayload = payload({
    publicKeyFingerprint: attacker.publicKeyFingerprint,
    signingKeyId: attacker.keyId,
  });
  const attackerEnvelope = envelope(attackerPayload, attacker);
  assert.doesNotThrow(() =>
    verify(attackerEnvelope, { roots: roots(attacker) }),
  );
  expectCode(
    () => verify(attackerEnvelope),
    "CURRENT187_CONNECTION_PROBE_AUTHORITY_KEY_NOT_TRUSTED",
  );
  expectCode(
    () =>
      verify(good, {
        roots: {
          [SIGNER.keyId]: root(SIGNER, {
            purpose: "CURRENT187_WRONG_PURPOSE",
          }),
        },
      }),
    "CURRENT187_CONNECTION_PROBE_ROOT_INVALID",
  );
});

test("short freshness, root lifetime, release, and synthetic context fail closed", () => {
  expectCode(
    () => verify(envelope(), { now: "2026-08-12T12:04:00.000Z" }),
    "CURRENT187_CONNECTION_PROBE_BINDING_INVALID",
  );
  const longLived = payload({ validUntil: "2026-08-12T12:10:00.000Z" });
  expectCode(
    () => verify(envelope(longLived)),
    "CURRENT187_CONNECTION_PROBE_BINDING_INVALID",
  );
  expectCode(
    () => verify(envelope(), { context: context({ endpointHost: "db.prod" }) }),
    "CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONTEXT_DENIED",
  );
  expectCode(
    () =>
      current187ConnectionProbePayloadDigest(
        payload({ releaseSha: "not-a-release" }),
      ),
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
  );
  expectCode(
    () =>
      verify(envelope(), {
        roots: {
          [SIGNER.keyId]: root(SIGNER, {
            notAfter: "2026-08-12T11:30:00.000Z",
          }),
        },
      }),
    "CURRENT187_CONNECTION_PROBE_ROOT_INACTIVE",
  );
});

test("production verifier remains frozen-empty and cannot authorize access", () => {
  assert.deepEqual(PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS, {});
  assert.equal(
    Object.isFrozen(PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS),
    true,
  );
  const productionPayload = payload({ environment: "production" });
  expectCode(
    () =>
      verifyPinnedCurrent187ConnectionProbeEnvelope(
        envelope(productionPayload),
        NOW,
      ),
    "CURRENT187_CONNECTION_PROBE_AUTHORITY_NOT_ENROLLED",
  );
});

test("extra, proxy, accessor, sparse, cloned, and arity boundaries fail closed", () => {
  expectCode(
    () => current187ConnectionProbePayloadDigest({ ...payload(), extra: true }),
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
  );
  expectCode(
    () => current187ConnectionProbePayloadDigest(new Proxy(payload(), {})),
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
  );
  let getterCalls = 0;
  const accessor = payload();
  Object.defineProperty(accessor, "environment", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "ci";
    },
  });
  expectCode(
    () => current187ConnectionProbePayloadDigest(accessor),
    "CURRENT187_CONNECTION_PROBE_PAYLOAD_INVALID",
  );
  assert.equal(getterCalls, 0);
  const sparse = structuredClone(payload());
  delete sparse.services[1];
  expectCode(
    () => current187ConnectionProbePayloadDigest(sparse),
    "CURRENT187_CONNECTION_PROBE_SERVICES_INVALID",
  );
  expectCode(
    () =>
      verifySyntheticCurrent187ConnectionProbeEnvelope(
        envelope(),
        roots(),
        context(),
      ),
    "CURRENT187_CONNECTION_PROBE_ARGUMENTS_INVALID",
  );
});

test("verifier source has public verification only and no network, filesystem, signer, or effect capability", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-connection-probe-attestation-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /verify as verifySignature/u);
  assert.match(source, /PINNED_CURRENT187_CONNECTION_PROBE_PRODUCTION_ROOTS/u);
  assert.doesNotMatch(
    source,
    /sign as|generateKeyPair|createPrivateKey|privateKey|node:fs|node:net|node:tls|node:child_process|Prisma|process\.env|authorization:\s*true|canMutate:\s*true|canSend:\s*true/u,
  );
});
