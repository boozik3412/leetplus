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
  Current187AdmissionContractError,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_DDL_FENCE_ATTESTATION_KIND,
  CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
  CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
  CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
  CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
  CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
  CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
  current187DdlFenceAttestationCanonicalJson,
  normalizeCurrent187DdlFenceAttestationPayload,
} from "./identity-mail-ddl-fence-attestation-current187-contract.mjs";
import {
  createSyntheticCurrent187DdlFenceAttestationVerifier,
  current187DdlFenceAttestationPayloadDigest,
  current187DdlFenceAttestationPublicKeyFingerprint,
} from "./identity-mail-ddl-fence-attestation-current187-authority.mjs";
import {
  CURRENT187_DDL_FENCE_CONSUMPTION_KIND,
  CURRENT187_DDL_FENCE_LEDGER_CONTRACT,
  CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION,
  CURRENT187_DDL_FENCE_REVOCATION_KIND,
  attachPersistedCurrent187DdlFenceConsumption,
  attachPersistedCurrent187DdlFenceRevocation,
  createCurrent187DdlFenceConsumptionBundle,
  createSyntheticCurrent187DdlFenceRevocationBundle,
  current187DdlFenceLedgerDatabaseArguments,
  isVerifiedPersistedCurrent187DdlFenceReceipt,
  isVerifiedPersistedCurrent187DdlFenceRevocationReceipt,
} from "./identity-mail-ddl-fence-ledger-current187.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
test.after(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-ledger-current187.mjs",
);
const NOW = "2026-08-05T10:01:20.000Z";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const publicKeyFingerprint =
  current187DdlFenceAttestationPublicKeyFingerprint(publicKeyPem);

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof Current187AdmissionContractError &&
      error.reasonCode === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

function fixture() {
  const applicationAuthorityFingerprint = digest("application-authority");
  const scannerRoleBindingDigest = digest("scanner-role-binding");
  const binding = {
    acquisitionDigest: digest("acquisition"),
    applicationAuthorityFingerprint,
    attestorArtifactDigest: digest("attestor-artifact"),
    clusterIdentityDigest: digest("cluster"),
    databaseUniverseDigest: digest("universe"),
    ddlFenceEvidenceDigest: digest("fence-evidence"),
    ddlFenceStateDigest: digest("fence-state"),
    environment: "ci",
    fenceEpoch: "9",
    fenceValidFrom: "2026-08-05T10:00:00.000Z",
    fenceValidUntil: "2026-08-05T10:10:00.000Z",
    finalDatabaseUniverseDigest: digest("universe"),
    finalSnapshotCapturedAt: "2026-08-05T10:01:00.000Z",
    finalSnapshotDigest: digest("final-snapshot"),
    immutableArtifactDigest: digest("artifact"),
    inventoryPlanDigest: digest("plan"),
    nonce: digest("nonce"),
    operationId: "44444444-4444-4444-8444-444444444444",
    purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
    releasePolicyDigest: digest("release-policy"),
    releasePolicyId: "current187-ddl-fence-ci-policy-v1",
    releaseSha: "a".repeat(40),
    scannerRoleBindingDigest,
  };
  const payload = normalizeCurrent187DdlFenceAttestationPayload({
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-05T10:01:10.000Z",
    kind: CURRENT187_DDL_FENCE_ATTESTATION_KIND,
    profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: "current187-ddl-fence-ci-1",
    slice: CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
    trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
    validUntil: "2026-08-05T10:02:30.000Z",
  });
  const envelope = {
    payload,
    payloadDigest: current187DdlFenceAttestationPayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(current187DdlFenceAttestationCanonicalJson(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
    signingKeyId: payload.signingKeyId,
  };
  const verifier = createSyntheticCurrent187DdlFenceAttestationVerifier(
    {
      [payload.signingKeyId]: {
        algorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
        keyId: payload.signingKeyId,
        notAfter: "2026-08-05T11:00:00.000Z",
        notBefore: "2026-08-05T09:00:00.000Z",
        profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
        publicKeyFingerprint,
        publicKeyPem,
        purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
        status: "ACTIVE",
        trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
      },
    },
    {
      applicationAuthorityFingerprint,
      databaseName: "leetplus_current187_ledger_ci",
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation:
        CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
      scannerRoleBindingDigest,
    },
  );
  return { binding, receipt: verifier.verify(envelope, binding, NOW) };
}

function revocationInput(overrides = {}) {
  return {
    actorDigest: digest("revoker"),
    eventId: "55555555-5555-4555-8555-555555555555",
    explicitConfirmation: CURRENT187_DDL_FENCE_REVOCATION_CONFIRMATION,
    reasonDigest: digest("reason"),
    revokedAt: "2026-08-05T10:01:30.000Z",
    scope: "ENVELOPE",
    ...overrides,
  };
}

function persistedReceipt(fixtureValue, bundle, overrides = {}) {
  const consumedAt = "2026-08-05T10:01:25.000Z";
  const transactionId = "123";
  const receipt = {
    attestationDigest: fixtureValue.receipt.attestationDigest,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    consumedAt,
    envelopeDigest: fixtureValue.receipt.envelopeDigest,
    kind: "CURRENT187_DDL_FENCE_CONSUMPTION_RECEIPT",
    nonce: fixtureValue.binding.nonce,
    noncanonical: true,
    operationId: fixtureValue.binding.operationId,
    persistedConsumptionVerified: true,
    productionRootEnrolled: false,
    receiptDigest: "",
    sharedBetaAccess: false,
    status: "CONSUMED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId,
    ...overrides,
  };
  receipt.receiptDigest = digestReceipt(receipt);
  return JSON.stringify(receipt);
}

function digestReceipt(receipt) {
  return createHash("sha256")
    .update("LEETPLUS_CURRENT187_DDL_FENCE_LEDGER_RECEIPT_V1\n", "utf8")
    .update(
      [
        receipt.kind,
        receipt.status,
        receipt.operationId,
        receipt.nonce,
        receipt.envelopeDigest,
        receipt.attestationDigest,
        receipt.commandDigest,
        receipt.consumedAt,
        receipt.transactionId,
        "false",
        "false",
        "false",
        "false",
        "false",
        "false",
        "false",
        "true",
        "true",
        "true",
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

function persistedRevocationReceipt(bundle, overrides = {}) {
  const transactionId = "124";
  const receipt = {
    attestationDigest: bundle.command.attestationDigest,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    eventId: bundle.command.eventId,
    kind: "CURRENT187_DDL_FENCE_REVOCATION_RECEIPT",
    noncanonical: true,
    persistedRevocationVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    receiptDigest: "",
    revokedAt: bundle.command.revokedAt,
    scope: bundle.command.scope,
    scopeDigest: bundle.command.scopeDigest,
    sharedBetaAccess: false,
    sourceEnvelopeDigest: bundle.command.sourceEnvelopeDigest,
    status: "REVOKED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId,
    ...overrides,
  };
  receipt.receiptDigest = createHash("sha256")
    .update("LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_RECEIPT_V1\n", "utf8")
    .update(
      [
        receipt.eventId,
        receipt.scope,
        receipt.scopeDigest,
        receipt.sourceEnvelopeDigest,
        receipt.attestationDigest,
        receipt.publicKeyFingerprint,
        receipt.commandDigest,
        receipt.revokedAt,
        receipt.transactionId,
        "false",
        "false",
        "false",
        "false",
        "false",
        "false",
        "false",
        "true",
        "true",
        "true",
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
  return JSON.stringify(receipt);
}

test("branded CURRENT187-D receipt produces one deterministic secret-free consumption bundle", () => {
  const { receipt } = fixture();
  const first = createCurrent187DdlFenceConsumptionBundle(receipt, NOW);
  const replay = createCurrent187DdlFenceConsumptionBundle(receipt, NOW);
  assert.deepEqual(replay, first);
  assert.equal(first.kind, CURRENT187_DDL_FENCE_CONSUMPTION_KIND);
  assert.equal(first.command.syntheticVerification, true);
  assert.equal(first.command.environment, "ci");
  assert.deepEqual(current187DdlFenceLedgerDatabaseArguments(first), [
    first.commandCanonicalJson,
    first.commandDigest,
  ]);
  assert.doesNotMatch(
    first.commandCanonicalJson,
    /(?:@|password|secret|token|https?:\/\/|BEGIN PUBLIC KEY)/iu,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.command), true);
});

test("clone, expiry, bundle mutation, and hostile exact-shape attacks fail closed", () => {
  const { receipt } = fixture();
  expectCode(
    () =>
      createCurrent187DdlFenceConsumptionBundle(structuredClone(receipt), NOW),
    "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_DENIED",
  );
  expectCode(
    () =>
      createCurrent187DdlFenceConsumptionBundle(
        receipt,
        "2026-08-05T10:02:30.000Z",
      ),
    "CURRENT187_DDL_FENCE_LEDGER_SOURCE_RECEIPT_EXPIRED",
  );
  const bundle = createCurrent187DdlFenceConsumptionBundle(receipt, NOW);
  expectCode(
    () =>
      current187DdlFenceLedgerDatabaseArguments({
        ...bundle,
        commandDigest: digest("wrong"),
      }),
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
  );
  expectCode(
    () => current187DdlFenceLedgerDatabaseArguments(new Proxy(bundle, {})),
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
  );
  expectCode(
    () =>
      current187DdlFenceLedgerDatabaseArguments({
        ...bundle,
        [Symbol("hostile")]: true,
      }),
    "CURRENT187_DDL_FENCE_LEDGER_BUNDLE_INVALID",
  );
});

test("revocation commands bind exact envelope, attestation, or root scope", () => {
  const { receipt } = fixture();
  for (const [scope, expected] of [
    ["ENVELOPE", receipt.envelopeDigest],
    ["ATTESTATION", receipt.attestationDigest],
    ["ROOT", receipt.publicKeyFingerprint],
  ]) {
    const revocation = createSyntheticCurrent187DdlFenceRevocationBundle(
      receipt,
      revocationInput({ scope }),
    );
    assert.equal(revocation.kind, CURRENT187_DDL_FENCE_REVOCATION_KIND);
    assert.equal(revocation.command.scopeDigest, expected);
    assert.deepEqual(current187DdlFenceLedgerDatabaseArguments(revocation), [
      revocation.commandCanonicalJson,
      revocation.commandDigest,
    ]);
  }
  expectCode(
    () =>
      createSyntheticCurrent187DdlFenceRevocationBundle(
        receipt,
        revocationInput({ explicitConfirmation: "wrong" }),
      ),
    "CURRENT187_DDL_FENCE_REVOCATION_INPUT_INVALID",
  );
});

test("byte-exact persisted receipt attaches a new deny-only non-transferable brand", () => {
  const fixtureValue = fixture();
  const bundle = createCurrent187DdlFenceConsumptionBundle(
    fixtureValue.receipt,
    NOW,
  );
  const databaseReceipt = persistedReceipt(fixtureValue, bundle);
  const attached = attachPersistedCurrent187DdlFenceConsumption(
    fixtureValue.receipt,
    bundle,
    databaseReceipt,
  );
  assert.equal(isVerifiedPersistedCurrent187DdlFenceReceipt(attached), true);
  assert.equal(attached.persistedConsumptionVerified, true);
  assert.equal(attached.authorization, false);
  assert.equal(attached.canApply, false);
  assert.equal(attached.canMutate, false);
  assert.equal(attached.canSend, false);
  assert.equal(attached.testAccessAuthorized, false);
  assert.equal(attached.sharedBetaAccess, false);
  assert.equal(attached.productionRootEnrolled, false);
  assert.equal(
    isVerifiedPersistedCurrent187DdlFenceReceipt(structuredClone(attached)),
    false,
  );
  expectCode(
    () =>
      attachPersistedCurrent187DdlFenceConsumption(
        fixtureValue.receipt,
        bundle,
        persistedReceipt(fixtureValue, bundle, { authorization: true }),
      ),
    "CURRENT187_DDL_FENCE_LEDGER_RECEIPT_INVALID",
  );
});

test("persisted revocation receipt is exact, deny-only, and non-transferable", () => {
  const { receipt } = fixture();
  const bundle = createSyntheticCurrent187DdlFenceRevocationBundle(
    receipt,
    revocationInput(),
  );
  const attached = attachPersistedCurrent187DdlFenceRevocation(
    bundle,
    persistedRevocationReceipt(bundle),
  );
  assert.equal(
    isVerifiedPersistedCurrent187DdlFenceRevocationReceipt(attached),
    true,
  );
  assert.equal(attached.persistedRevocationVerified, true);
  assert.equal(attached.authorization, false);
  assert.equal(attached.canApply, false);
  assert.equal(attached.canMutate, false);
  assert.equal(attached.canSend, false);
  assert.equal(attached.testAccessAuthorized, false);
  assert.equal(attached.sharedBetaAccess, false);
  assert.equal(attached.productionRootEnrolled, false);
  assert.equal(
    isVerifiedPersistedCurrent187DdlFenceRevocationReceipt(
      structuredClone(attached),
    ),
    false,
  );
  expectCode(
    () =>
      attachPersistedCurrent187DdlFenceRevocation(
        bundle,
        persistedRevocationReceipt(bundle, { canApply: true }),
      ),
    "CURRENT187_DDL_FENCE_LEDGER_REVOCATION_RECEIPT_INVALID",
  );
});

test("contract stays NONCANONICAL, deny-only, and production-root empty", () => {
  assert.equal(CURRENT187_DDL_FENCE_LEDGER_CONTRACT.authorization, false);
  assert.equal(CURRENT187_DDL_FENCE_LEDGER_CONTRACT.canApply, false);
  assert.equal(CURRENT187_DDL_FENCE_LEDGER_CONTRACT.canMutate, false);
  assert.equal(CURRENT187_DDL_FENCE_LEDGER_CONTRACT.canSend, false);
  assert.equal(
    CURRENT187_DDL_FENCE_LEDGER_CONTRACT.testAccessAuthorized,
    false,
  );
  assert.equal(CURRENT187_DDL_FENCE_LEDGER_CONTRACT.sharedBetaAccess, false);
  assert.equal(
    CURRENT187_DDL_FENCE_LEDGER_CONTRACT.productionRootEnrolled,
    false,
  );
  assert.equal(
    CURRENT187_DDL_FENCE_LEDGER_CONTRACT.productionRootsFrozenEmpty,
    true,
  );
});

test("pure bundle module performs no filesystem, PostgreSQL, Prisma, network, provider, or secret lookup", async () => {
  const source = await readFile(MODULE_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /from\s+["'](?:node:fs|node:net|node:http|node:https|pg|@prisma\/client|nodemailer)/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:fetch|connect|query|execute|sendMail)\s*\(/u,
  );
  assert.doesNotMatch(source, /process\.env/u);
  assert.doesNotMatch(
    source,
    /PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS\s*\[/u,
  );
});
