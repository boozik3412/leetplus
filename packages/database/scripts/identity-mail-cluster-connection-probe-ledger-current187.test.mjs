import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
  CURRENT187_CONNECTION_PROBE_SLICE,
  CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
  CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  current187ConnectionProbePayloadDigest,
  current187ConnectionProbePublicKeyFingerprint,
  verifySyntheticCurrent187ConnectionProbeEnvelope,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
  CURRENT187_CONNECTION_PROBE_LEDGER_CONTRACT,
  CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE,
  CURRENT187_CONNECTION_PROBE_LEDGER_SLICE,
  CURRENT187_CONNECTION_PROBE_REVOCATION_CONFIRMATION,
  CURRENT187_CONNECTION_PROBE_REVOCATION_KIND,
  attachPersistedCurrent187ConnectionProbeConsumption,
  attachPersistedCurrent187ConnectionProbeRevocation,
  createCurrent187ConnectionProbeConsumptionBundle,
  createSyntheticCurrent187ConnectionProbeRevocationBundle,
  current187ConnectionProbeLedgerDatabaseArguments,
  isVerifiedPersistedCurrent187ConnectionProbeReceipt,
  isVerifiedPersistedCurrent187ConnectionProbeRevocationReceipt,
} from "./identity-mail-cluster-connection-probe-ledger-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-08-12T12:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY_PEM = publicKey.export({ format: "pem", type: "spki" });
const PUBLIC_KEY_FINGERPRINT =
  current187ConnectionProbePublicKeyFingerprint(PUBLIC_KEY_PEM);
const KEY_ID = "current187-connection-probe-ledger-ci-1";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function domainDigest(domain, value) {
  return createHash("sha256")
    .update(domain + "\n", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function negativeProbes(purpose) {
  return CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.map((scenario) => ({
    evidenceDigest: digest(purpose + ":" + scenario),
    observedOutcome:
      CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario],
    scenario,
  }));
}

function service(purpose, index) {
  return {
    allowedOperationsDigest: digest(purpose + ":operations"),
    applicationNameDigest: digest(purpose + ":application"),
    backendIdentityDigest: digest(purpose + ":backend"),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceiptDigest: digest(purpose + ":j2"),
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(purpose + ":hba"),
    negativeProbes: negativeProbes(purpose),
    poolerMappingDigest: digest(purpose + ":pooler"),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    positiveOutcome: "ALLOWED",
    positiveProbeDigest: digest(purpose + ":positive"),
    postgresSessionReceiptDigest: digest(purpose + ":j1"),
    purpose,
    secretReferenceDigest: digest(purpose + ":secret-reference"),
    tlsMode: "VERIFY_FULL",
  };
}

function payload(overrides = {}) {
  return {
    clusterIdentityDigest: digest("cluster"),
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: digest("universe"),
    environment: "ci",
    hbaControlReceiptDigest: digest("j3"),
    hostControlChallengeDigest: digest("host-control"),
    issuedAt: "2026-08-12T11:59:00.000Z",
    kind: CURRENT187_CONNECTION_PROBE_KIND,
    nonce: digest("nonce"),
    operationId: OPERATION_ID,
    pgbouncerControlReceiptDigest: digest("j4"),
    probeRunnerArtifactDigest: digest("runner"),
    probeTranscriptDigest: digest("transcript"),
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: PUBLIC_KEY_FINGERPRINT,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    releaseSha: RELEASE_SHA,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(service),
    signingKeyId: KEY_ID,
    slice: CURRENT187_CONNECTION_PROBE_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: "2026-08-12T12:04:00.000Z",
    ...overrides,
  };
}

function envelope(payloadValue = payload()) {
  return {
    payload: payloadValue,
    payloadDigest: current187ConnectionProbePayloadDigest(payloadValue),
    publicKeyFingerprint: PUBLIC_KEY_FINGERPRINT,
    signature: signPayload(
      null,
      Buffer.from(current187AdmissionCanonicalJson(payloadValue), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    signingKeyId: KEY_ID,
  };
}

function root() {
  return {
    algorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2026-08-12T13:00:00.000Z",
    notBefore: "2026-08-12T11:00:00.000Z",
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: PUBLIC_KEY_FINGERPRINT,
    publicKeyPem: PUBLIC_KEY_PEM,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    status: "ACTIVE",
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  };
}

function verified(envelopeValue = envelope()) {
  return verifySyntheticCurrent187ConnectionProbeEnvelope(
    envelopeValue,
    { [KEY_ID]: root() },
    {
      databaseName: "leetplus_ci",
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
    NOW,
  );
}

function persistedConsumptionText(bundle, overrides = {}) {
  const value = {
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    connectionProbeMatrixDigest: bundle.command.connectionProbeMatrixDigest,
    consumedAt: NOW,
    envelopeDigest: bundle.command.envelopeDigest,
    kind: "CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT",
    nonce: bundle.command.nonce,
    noncanonical: true,
    operationId: bundle.command.operationId,
    persistedConsumptionVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    receiptDigest: "",
    sharedBetaAccess: false,
    status: "CONSUMED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "12345",
    verificationReceiptDigest: bundle.command.verificationReceiptDigest,
    ...overrides,
  };
  const projected = { ...value };
  delete projected.receiptDigest;
  value.receiptDigest = domainDigest(
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT_V1",
    current187AdmissionCanonicalJson(projected),
  );
  return current187AdmissionCanonicalJson(value);
}

function revocationInput(scope = "ENVELOPE") {
  return {
    actorDigest: digest("actor"),
    eventId: "22222222-2222-4222-8222-222222222222",
    explicitConfirmation: CURRENT187_CONNECTION_PROBE_REVOCATION_CONFIRMATION,
    reasonDigest: digest("reason"),
    revokedAt: NOW,
    scope,
  };
}

function persistedRevocationText(bundle, overrides = {}) {
  const value = {
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    connectionProbeMatrixDigest: bundle.command.connectionProbeMatrixDigest,
    envelopeDigest: bundle.command.envelopeDigest,
    eventId: bundle.command.eventId,
    kind: "CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT",
    noncanonical: true,
    persistedRevocationVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    receiptDigest: "",
    revokedAt: bundle.command.revokedAt,
    scope: bundle.command.scope,
    scopeDigest: bundle.command.scopeDigest,
    sharedBetaAccess: false,
    status: "REVOKED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "12346",
    ...overrides,
  };
  const projected = { ...value };
  delete projected.receiptDigest;
  value.receiptDigest = domainDigest(
    "LEETPLUS_CURRENT187_CONNECTION_PROBE_REVOCATION_RECEIPT_V1",
    current187AdmissionCanonicalJson(projected),
  );
  return current187AdmissionCanonicalJson(value);
}

function expectCode(code) {
  return (error) =>
    error?.safeContractError === true &&
    error.code === code &&
    error.reasonCode === code;
}

test("exact verified J5 envelope creates a bounded one-time consumption command", () => {
  const signed = envelope();
  const receipt = verified(signed);
  const bundle = createCurrent187ConnectionProbeConsumptionBundle(
    signed,
    receipt,
    NOW,
  );
  assert.equal(bundle.kind, CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND);
  assert.equal(
    bundle.command.kind,
    CURRENT187_CONNECTION_PROBE_CONSUMPTION_KIND,
  );
  assert.equal(bundle.command.operationId, OPERATION_ID);
  assert.equal(bundle.command.envelopeDigest, receipt.envelopeDigest);
  assert.equal(
    bundle.command.connectionProbeMatrixDigest,
    receipt.connectionProbeMatrixDigest,
  );
  assert.deepEqual(current187ConnectionProbeLedgerDatabaseArguments(bundle), [
    bundle.commandCanonicalJson,
    bundle.commandDigest,
  ]);
  assert.doesNotMatch(
    bundle.commandCanonicalJson,
    /postgresql:\/\/|password|privateKey|BEGIN [A-Z ]+KEY/iu,
  );
  assert.equal(
    CURRENT187_CONNECTION_PROBE_LEDGER_CONTRACT.authorization,
    false,
  );
  assert.equal(CURRENT187_CONNECTION_PROBE_LEDGER_CONTRACT.canApply, false);
  assert.equal(
    CURRENT187_CONNECTION_PROBE_LEDGER_CONTRACT.productionRootsFrozenEmpty,
    true,
  );
});

test("byte-exact persisted consumption replay attaches once without granting authority", () => {
  const signed = envelope();
  const receipt = verified(signed);
  const bundle = createCurrent187ConnectionProbeConsumptionBundle(
    signed,
    receipt,
    NOW,
  );
  const databaseReceipt = persistedConsumptionText(bundle);
  const first = attachPersistedCurrent187ConnectionProbeConsumption(
    signed,
    receipt,
    bundle,
    databaseReceipt,
  );
  const lostResponseReplay =
    attachPersistedCurrent187ConnectionProbeConsumption(
      signed,
      receipt,
      bundle,
      databaseReceipt,
    );
  for (const attached of [first, lostResponseReplay]) {
    assert.equal(
      isVerifiedPersistedCurrent187ConnectionProbeReceipt(attached),
      true,
    );
    assert.equal(attached.persistedConnectionProbeConsumptionVerified, true);
    assert.equal(attached.authorization, false);
    assert.equal(attached.canApply, false);
    assert.equal(attached.canMutate, false);
    assert.equal(attached.canSend, false);
    assert.equal(attached.testAccessAuthorized, false);
    assert.equal(attached.sharedBetaAccess, false);
  }
  assert.equal(
    first.persistedConnectionProbeReceiptDigest,
    lostResponseReplay.persistedConnectionProbeReceiptDigest,
  );
  assert.equal(
    isVerifiedPersistedCurrent187ConnectionProbeReceipt({ ...first }),
    false,
  );
});

test("ENVELOPE, MATRIX, and ROOT revocations bind distinct exact scopes", () => {
  const signed = envelope();
  const receipt = verified(signed);
  const expected = {
    ENVELOPE: receipt.envelopeDigest,
    MATRIX: receipt.connectionProbeMatrixDigest,
    ROOT: PUBLIC_KEY_FINGERPRINT,
  };
  const scopeDigests = new Set();
  for (const [scope, expectedDigest] of Object.entries(expected)) {
    const bundle = createSyntheticCurrent187ConnectionProbeRevocationBundle(
      signed,
      receipt,
      revocationInput(scope),
    );
    assert.equal(bundle.kind, CURRENT187_CONNECTION_PROBE_REVOCATION_KIND);
    assert.equal(bundle.command.scopeDigest, expectedDigest);
    scopeDigests.add(bundle.command.scopeDigest);
    const attached = attachPersistedCurrent187ConnectionProbeRevocation(
      bundle,
      persistedRevocationText(bundle),
    );
    assert.equal(
      isVerifiedPersistedCurrent187ConnectionProbeRevocationReceipt(attached),
      true,
    );
    assert.equal(attached.authorization, false);
    assert.equal(attached.canApply, false);
    assert.equal(attached.canMutate, false);
    assert.equal(attached.canSend, false);
  }
  assert.equal(scopeDigests.size, 3);
});

test("expiry, clone, envelope mismatch, bundle tamper, and receipt tamper fail closed", () => {
  const signed = envelope();
  const receipt = verified(signed);
  assert.throws(
    () =>
      createCurrent187ConnectionProbeConsumptionBundle(
        signed,
        receipt,
        "2026-08-12T12:05:00.000Z",
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_EXPIRED"),
  );
  assert.throws(
    () =>
      createCurrent187ConnectionProbeConsumptionBundle(
        signed,
        { ...receipt },
        NOW,
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_LEDGER_SOURCE_RECEIPT_DENIED"),
  );
  const differentEnvelope = envelope(
    payload({
      nonce: digest("different-nonce"),
      operationId: "33333333-3333-4333-8333-333333333333",
    }),
  );
  assert.throws(
    () =>
      createCurrent187ConnectionProbeConsumptionBundle(
        differentEnvelope,
        receipt,
        NOW,
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_LEDGER_ENVELOPE_MISMATCH"),
  );
  const bundle = createCurrent187ConnectionProbeConsumptionBundle(
    signed,
    receipt,
    NOW,
  );
  assert.throws(
    () =>
      current187ConnectionProbeLedgerDatabaseArguments({
        ...bundle,
        commandDigest: digest("tampered"),
      }),
    expectCode("CURRENT187_CONNECTION_PROBE_LEDGER_BUNDLE_INVALID"),
  );
  assert.throws(
    () =>
      attachPersistedCurrent187ConnectionProbeConsumption(
        signed,
        receipt,
        bundle,
        persistedConsumptionText(bundle, { commandDigest: digest("wrong") }),
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_LEDGER_RECEIPT_INVALID"),
  );
});

test("revocation confirmation, scope, timeline, proxy, and accessor boundaries fail closed", () => {
  const signed = envelope();
  const receipt = verified(signed);
  for (const input of [
    { ...revocationInput(), explicitConfirmation: "wrong" },
    { ...revocationInput(), scope: "UNKNOWN" },
    { ...revocationInput(), revokedAt: "2026-08-12T11:00:00.000Z" },
  ]) {
    assert.throws(
      () =>
        createSyntheticCurrent187ConnectionProbeRevocationBundle(
          signed,
          receipt,
          input,
        ),
      expectCode("CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID"),
    );
  }
  assert.throws(
    () =>
      createSyntheticCurrent187ConnectionProbeRevocationBundle(
        signed,
        receipt,
        new Proxy(revocationInput(), {}),
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID"),
  );
  let calls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "scope", {
    enumerable: true,
    get() {
      calls += 1;
      return "ROOT";
    },
  });
  assert.throws(
    () =>
      createSyntheticCurrent187ConnectionProbeRevocationBundle(
        signed,
        receipt,
        accessor,
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_REVOCATION_INPUT_INVALID"),
  );
  assert.equal(calls, 0);
});

test("ledger source has no database, network, filesystem-write, process, env, tenant, invite, or provider capability", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "identity-mail-cluster-connection-probe-ledger-current187.mjs",
    ),
    "utf8",
  );
  for (const forbidden of [
    /process\.env/u,
    /node:child_process/u,
    /node:(?:net|tls|http|https)/u,
    /from\s+["']pg["']/u,
    /Prisma/u,
    /\bfetch\s*\(/u,
    /writeFile|appendFile|unlink|rmdir|rename/u,
    /Tenant|UserInvite|Langame|Telegram|SMTP/iu,
    /authorization:\s*true/u,
    /canApply:\s*true/u,
    /canMutate:\s*true/u,
    /canSend:\s*true/u,
    /sharedBetaAccess:\s*true/u,
    /testAccessAuthorized:\s*true/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.equal(CURRENT187_CONNECTION_PROBE_LEDGER_SLICE.includes("R3"), true);
  assert.equal(
    CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE.includes("SYNTHETIC_CI"),
    true,
  );
});
