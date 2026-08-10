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
  CURRENT187_CLUSTER_INVENTORY_KIND,
  CURRENT187_CLUSTER_INVENTORY_PROFILE,
  CURRENT187_CLUSTER_INVENTORY_SLICE,
  attachVerifiedCurrent187DdlFenceAttestation,
  current187ClusterIdentityDigest,
  current187DatabaseIdentityDigest,
  isVerifiedCurrent187ClusterInventoryReceipt,
  planCurrent187ClusterInventoryAdmission,
} from "./identity-mail-cluster-inventory-current187-planner.mjs";
import {
  CURRENT187_DDL_FENCE_ATTESTATION_KIND,
  CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
  CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
  CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
  CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
  CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
  CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
  PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS,
  current187DdlFenceAttestationCanonicalJson,
  normalizeCurrent187DdlFenceAttestationPayload,
} from "./identity-mail-ddl-fence-attestation-current187-contract.mjs";
import {
  createSyntheticCurrent187DdlFenceAttestationVerifier,
  current187DdlFenceAttestationPayloadDigest,
  current187DdlFenceAttestationPublicKeyFingerprint,
  isVerifiedCurrent187DdlFenceAttestationReceipt,
  verifyPinnedCurrent187DdlFenceAttestationEnvelope,
} from "./identity-mail-ddl-fence-attestation-current187-authority.mjs";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
test.after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-attestation-current187-contract.mjs",
);
const AUTHORITY_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-ddl-fence-attestation-current187-authority.mjs",
);
const NOW = "2026-08-05T10:01:20.000Z";

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

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const publicKeyFingerprint =
  current187DdlFenceAttestationPublicKeyFingerprint(publicKeyPem);
const KEY_ID = "current187-ddl-fence-ci-1";
const APPLICATION_AUTHORITY_FINGERPRINT = digest("application-authority");
const SCANNER_ROLE_BINDING_DIGEST = digest("scanner-role-binding");

const POSTGRES = Object.freeze({
  collate: "C.UTF-8",
  connectionLimit: -1,
  ctype: "C.UTF-8",
  datallowconn: true,
  encoding: "UTF8",
  isTemplate: false,
  localeProvider: "libc",
  name: "postgres",
  oid: 5,
  ownerName: "postgres",
  ownerOid: 10,
});
const TEMPLATE1 = Object.freeze({
  ...POSTGRES,
  isTemplate: true,
  name: "template1",
  oid: 1,
});

function plannerRequest() {
  const clusterIdentity = {
    catalogVersionNo: 202307071,
    controlVersion: 1300,
    endpointDigest: digest("endpoint"),
    serverVersionNum: 160_009,
    systemIdentifier: "7412345678901234567",
    topologyDigest: digest("topology"),
  };
  const clusterIdentityDigest =
    current187ClusterIdentityDigest(clusterIdentity);
  const fenceDigest = digest("fence-evidence");
  return {
    clusterIdentity,
    contract: CURRENT187_ADMISSION_CONTRACT,
    ddlFence: {
      active: true,
      clusterDdlBlocked: true,
      creatorPrincipalsDisabled: true,
      databaseDdlBlocked: true,
      evidenceDigest: fenceDigest,
      fenceEpoch: "9",
      migrationPrincipalsDisabled: true,
      validFrom: "2026-08-05T10:00:00.000Z",
      validUntil: "2026-08-05T10:10:00.000Z",
    },
    environment: "ci",
    evaluatedAt: "2026-08-05T10:01:05.000Z",
    expectedCatalog: {
      catalogRowsComplete: true,
      nonTemplateDatabases: [POSTGRES],
      templateDatabases: [TEMPLATE1],
    },
    finalCatalogSnapshot: {
      capturedAt: "2026-08-05T10:01:00.000Z",
      catalogRowsComplete: true,
      clusterIdentityDigest,
      databases: [POSTGRES, TEMPLATE1],
      ddlFenceDigest: fenceDigest,
      snapshotKind: "FINAL",
    },
    initialCatalogSnapshot: {
      capturedAt: "2026-08-05T10:00:10.000Z",
      catalogRowsComplete: true,
      clusterIdentityDigest,
      databases: [POSTGRES, TEMPLATE1],
      ddlFenceDigest: fenceDigest,
      snapshotKind: "INITIAL",
    },
    kind: CURRENT187_CLUSTER_INVENTORY_KIND,
    perDatabaseScans: [
      {
        catalogDigest: digest("postgres-catalog"),
        catalogSurfaceStatus: "COMPLETE",
        clusterIdentityDigest,
        completedAt: "2026-08-05T10:00:50.000Z",
        connectionStatus: "CONNECTED",
        currentAclPolicyDigest: digest("postgres-current-acl"),
        databaseIdentityDigest: current187DatabaseIdentityDigest(POSTGRES),
        databaseName: POSTGRES.name,
        databaseOid: POSTGRES.oid,
        defaultAclPolicyDigest: digest("postgres-default-acl"),
        ddlFenceDigest: fenceDigest,
        roleBindingsDigest: digest("postgres-role-bindings"),
        scanEvidenceDigest: digest("postgres-scan"),
        semanticRiskFactsDigest: digest("postgres-semantic-risk-facts"),
        semanticRiskFactsStatus: "FACTS_EXTRACTED_DENY_ONLY",
        startedAt: "2026-08-05T10:00:20.000Z",
      },
    ],
    profile: CURRENT187_CLUSTER_INVENTORY_PROFILE,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    slice: CURRENT187_CLUSTER_INVENTORY_SLICE,
  };
}

function rootFor(overrides = {}) {
  return {
    algorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
    keyId: KEY_ID,
    notAfter: "2026-08-05T11:00:00.000Z",
    notBefore: "2026-08-05T09:00:00.000Z",
    profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    publicKeyPem,
    purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
    status: "ACTIVE",
    trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
    ...overrides,
  };
}

function rootsFor(root = rootFor()) {
  return { [root.keyId]: root };
}

function syntheticContext(overrides = {}) {
  return {
    applicationAuthorityFingerprint: APPLICATION_AUTHORITY_FINGERPRINT,
    databaseName: "leetplus_current187_ci",
    endpointHost: "127.0.0.1",
    environment: "ci",
    explicitConfirmation:
      CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
    nodeEnv: "test",
    scannerRoleBindingDigest: SCANNER_ROLE_BINDING_DIGEST,
    ...overrides,
  };
}

function bindingFor(plannerReceipt, overrides = {}) {
  return {
    acquisitionDigest: digest("acquisition-before-attestation"),
    applicationAuthorityFingerprint: APPLICATION_AUTHORITY_FINGERPRINT,
    attestorArtifactDigest: digest("ddl-fence-attestor-artifact"),
    clusterIdentityDigest: plannerReceipt.clusterIdentityDigest,
    databaseUniverseDigest: plannerReceipt.expectedDatabaseUniverseDigest,
    ddlFenceEvidenceDigest: plannerReceipt.ddlFenceEvidenceDigest,
    ddlFenceStateDigest: plannerReceipt.ddlFenceStateDigest,
    environment: plannerReceipt.environment,
    fenceEpoch: plannerReceipt.ddlFenceEpoch,
    fenceValidFrom: plannerReceipt.ddlFenceValidFrom,
    fenceValidUntil: plannerReceipt.ddlFenceValidUntil,
    finalDatabaseUniverseDigest: plannerReceipt.finalDatabaseUniverseDigest,
    finalSnapshotCapturedAt: plannerReceipt.finalCatalogSnapshotCapturedAt,
    finalSnapshotDigest: plannerReceipt.finalCatalogSnapshotDigest,
    immutableArtifactDigest: digest("immutable-release-artifact"),
    inventoryPlanDigest: plannerReceipt.planDigest,
    nonce: digest("ddl-fence-operation-nonce"),
    operationId: "44444444-4444-4444-8444-444444444444",
    purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
    releasePolicyDigest: digest("release-policy"),
    releasePolicyId: "current187-ddl-fence-ci-policy-v1",
    releaseSha: "a".repeat(40),
    scannerRoleBindingDigest: SCANNER_ROLE_BINDING_DIGEST,
    ...overrides,
  };
}

function payloadFor(binding, overrides = {}) {
  return {
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-05T10:01:10.000Z",
    kind: CURRENT187_DDL_FENCE_ATTESTATION_KIND,
    profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: KEY_ID,
    slice: CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
    trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
    validUntil: "2026-08-05T10:02:30.000Z",
    ...overrides,
  };
}

function envelopeFor(payload, signingKey = privateKey) {
  const normalized = normalizeCurrent187DdlFenceAttestationPayload(payload);
  return {
    payload,
    payloadDigest: current187DdlFenceAttestationPayloadDigest(normalized),
    publicKeyFingerprint: normalized.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(
        current187DdlFenceAttestationCanonicalJson(normalized),
        "utf8",
      ),
      signingKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
    signingKeyId: normalized.signingKeyId,
  };
}

function fixture() {
  const plannerReceipt =
    planCurrent187ClusterInventoryAdmission(plannerRequest());
  const binding = bindingFor(plannerReceipt);
  const payload = payloadFor(binding);
  return {
    binding,
    envelope: envelopeFor(payload),
    plannerReceipt,
    verifier: createSyntheticCurrent187DdlFenceAttestationVerifier(
      rootsFor(),
      syntheticContext(),
    ),
  };
}

test("independent signature produces only a branded deny-only fence receipt and planner projection", () => {
  const { binding, envelope, plannerReceipt, verifier } = fixture();
  const receipt = verifier.verify(envelope, binding, NOW);
  assert.equal(isVerifiedCurrent187DdlFenceAttestationReceipt(receipt), true);
  assert.equal(receipt.ddlFenceAttestationVerified, true);
  assert.equal(receipt.externalDdlFenceAttested, true);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canApply, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.persistedConsumptionVerified, false);
  assert.equal(receipt.sourceIoPerformed, false);
  assert.equal(receipt.networkIoPerformed, false);
  assert.equal(receipt.ddlIoPerformed, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(
    isVerifiedCurrent187DdlFenceAttestationReceipt({ ...receipt }),
    false,
  );

  const attestedPlanner = attachVerifiedCurrent187DdlFenceAttestation(
    plannerReceipt,
    binding.acquisitionDigest,
    receipt,
  );
  assert.equal(attestedPlanner.externalDdlFenceAttested, true);
  assert.equal(
    attestedPlanner.externalDdlFenceAttestationDigest,
    receipt.attestationDigest,
  );
  assert.equal(attestedPlanner.authorization, false);
  assert.equal(attestedPlanner.canMutate, false);
  assert.equal(attestedPlanner.canSend, false);
  assert.equal(attestedPlanner.testAccessAuthorized, false);
  assert.equal(
    isVerifiedCurrent187ClusterInventoryReceipt(attestedPlanner),
    true,
  );
  assert.equal(plannerReceipt.externalDdlFenceAttested, false);
});

test("byte-exact process-local replay returns the same receipt", () => {
  const { binding, envelope, verifier } = fixture();
  const first = verifier.verify(envelope, binding, NOW);
  const replay = verifier.verify(envelope, binding, "2026-08-05T10:01:30.000Z");
  assert.equal(replay, first);
  assert.equal(replay.processLocalReplayProtected, true);
  assert.equal(replay.persistedConsumptionVerified, false);
});

test("operation and nonce reuse with a different signed envelope fail closed", () => {
  const operationFixture = fixture();
  operationFixture.verifier.verify(
    operationFixture.envelope,
    operationFixture.binding,
    NOW,
  );
  const changedOperationBinding = {
    ...operationFixture.binding,
    acquisitionDigest: digest("different-acquisition"),
    nonce: digest("different-nonce"),
  };
  expectCode(
    () =>
      operationFixture.verifier.verify(
        envelopeFor(payloadFor(changedOperationBinding)),
        changedOperationBinding,
        NOW,
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_REPLAY_CONFLICT",
  );

  const nonceFixture = fixture();
  nonceFixture.verifier.verify(
    nonceFixture.envelope,
    nonceFixture.binding,
    NOW,
  );
  const changedNonceBinding = {
    ...nonceFixture.binding,
    acquisitionDigest: digest("third-acquisition"),
    operationId: "55555555-5555-4555-8555-555555555555",
  };
  expectCode(
    () =>
      nonceFixture.verifier.verify(
        envelopeFor(payloadFor(changedNonceBinding)),
        changedNonceBinding,
        NOW,
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_REPLAY_CONFLICT",
  );
});

test("acquisition, final snapshot, release, policy, and fence mutations are signature- or binding-denied", () => {
  const { binding, envelope, verifier } = fixture();
  for (const [key, value] of [
    ["acquisitionDigest", digest("wrong-acquisition")],
    ["finalSnapshotDigest", digest("wrong-final-snapshot")],
    ["ddlFenceStateDigest", digest("wrong-fence")],
    ["releaseSha", "b".repeat(40)],
    ["releasePolicyDigest", digest("wrong-policy")],
  ]) {
    expectCode(
      () => verifier.verify(envelope, { ...binding, [key]: value }, NOW),
      "CURRENT187_DDL_FENCE_ATTESTATION_EXPECTED_BINDING_MISMATCH",
    );
  }
  expectCode(
    () =>
      verifier.verify(
        envelope,
        {
          ...binding,
          databaseUniverseDigest: digest("wrong-universe"),
          finalDatabaseUniverseDigest: digest("wrong-universe"),
        },
        NOW,
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_EXPECTED_BINDING_MISMATCH",
  );

  const mutatedPayload = {
    ...envelope.payload,
    acquisitionDigest: digest("unsigned-acquisition-mutation"),
  };
  expectCode(
    () =>
      verifier.verify({ ...envelope, payload: mutatedPayload }, binding, NOW),
    "CURRENT187_DDL_FENCE_ATTESTATION_ENVELOPE_BINDING_INVALID",
  );
});

test("expired, future, overlong, and inactive-root envelopes are denied", () => {
  const { binding, envelope, verifier } = fixture();
  expectCode(
    () => verifier.verify(envelope, binding, "2026-08-05T10:02:30.000Z"),
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
  );

  const futurePayload = payloadFor(binding, {
    issuedAt: "2026-08-05T10:01:25.000Z",
    validUntil: "2026-08-05T10:02:00.000Z",
  });
  expectCode(
    () =>
      verifier.verify(
        envelopeFor(futurePayload),
        binding,
        "2026-08-05T10:01:05.000Z",
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
  );

  const overlongPayload = payloadFor(binding, {
    validUntil: "2026-08-05T10:04:00.000Z",
  });
  expectCode(
    () => verifier.verify(envelopeFor(overlongPayload), binding, NOW),
    "CURRENT187_DDL_FENCE_ATTESTATION_TIMELINE_INVALID",
  );

  const inactiveVerifier = createSyntheticCurrent187DdlFenceAttestationVerifier(
    rootsFor(rootFor({ notAfter: "2026-08-05T10:01:15.000Z" })),
    syntheticContext(),
  );
  expectCode(
    () => inactiveVerifier.verify(envelope, binding, NOW),
    "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INACTIVE",
  );
});

test("synthetic roots are exact loopback CI-only and independent from application/scanner identity", () => {
  for (const overrides of [
    { endpointHost: "db.example.com" },
    { databaseName: "postgres" },
    { databaseName: "leetplus_production" },
    { environment: "production" },
    { explicitConfirmation: "wrong" },
  ]) {
    expectCode(
      () =>
        createSyntheticCurrent187DdlFenceAttestationVerifier(
          rootsFor(),
          syntheticContext(overrides),
        ),
      "CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONTEXT_DENIED",
    );
  }
  expectCode(
    () =>
      createSyntheticCurrent187DdlFenceAttestationVerifier(
        rootsFor(),
        syntheticContext({
          applicationAuthorityFingerprint: publicKeyFingerprint,
        }),
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_INDEPENDENT",
  );
  expectCode(
    () =>
      createSyntheticCurrent187DdlFenceAttestationVerifier(
        rootsFor(
          rootFor({
            purpose: "CURRENT187_PRODUCTION_DEPLOY_GO_V1",
          }),
        ),
        syntheticContext(),
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_ROOT_INVALID",
  );
});

test("production registry is frozen-empty and caller/env roots cannot enroll it", () => {
  assert.equal(
    Object.isFrozen(PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS),
    true,
  );
  assert.deepEqual(
    Object.keys(PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS),
    [],
  );
  assert.throws(() => {
    PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS[KEY_ID] = rootFor();
  }, TypeError);

  const plannerReceipt =
    planCurrent187ClusterInventoryAdmission(plannerRequest());
  const productionBinding = bindingFor(plannerReceipt, {
    environment: "production",
  });
  const productionEnvelope = envelopeFor(payloadFor(productionBinding));
  expectCode(
    () =>
      verifyPinnedCurrent187DdlFenceAttestationEnvelope(
        productionEnvelope,
        productionBinding,
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_AUTHORITY_NOT_ENROLLED",
  );
});

test("getter, proxy, symbol, custom prototype, extra key, and clone attacks fail closed", () => {
  const { binding, envelope, verifier } = fixture();
  const getterEnvelope = { ...envelope };
  Object.defineProperty(getterEnvelope, "signature", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  expectContractError(() => verifier.verify(getterEnvelope, binding, NOW));
  expectContractError(() =>
    verifier.verify(new Proxy(envelope, {}), binding, NOW),
  );
  expectContractError(() =>
    verifier.verify({ ...envelope, [Symbol("hostile")]: true }, binding, NOW),
  );
  expectContractError(() =>
    verifier.verify(
      Object.assign(Object.create({ inherited: true }), envelope),
      binding,
      NOW,
    ),
  );
  expectContractError(() =>
    verifier.verify({ ...envelope, extra: true }, binding, NOW),
  );
  const receipt = verifier.verify(envelope, binding, NOW);
  const clone = structuredClone(receipt);
  assert.equal(isVerifiedCurrent187DdlFenceAttestationReceipt(clone), false);
  expectCode(
    () =>
      attachVerifiedCurrent187DdlFenceAttestation(
        fixture().plannerReceipt,
        binding.acquisitionDigest,
        clone,
      ),
    "CURRENT187_DDL_FENCE_ATTESTATION_RECEIPT_UNVERIFIED",
  );
});

test("planner consumes only the exact branded acquisition/final-snapshot binding", () => {
  const { binding, envelope, plannerReceipt, verifier } = fixture();
  const receipt = verifier.verify(envelope, binding, NOW);
  expectCode(
    () =>
      attachVerifiedCurrent187DdlFenceAttestation(
        plannerReceipt,
        digest("another-acquisition"),
        receipt,
      ),
    "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_BINDING_MISMATCH",
  );

  const deniedRequest = plannerRequest();
  deniedRequest.finalCatalogSnapshot.databases = [
    { ...POSTGRES, ownerName: "different_owner" },
    TEMPLATE1,
  ];
  const deniedPlanner = planCurrent187ClusterInventoryAdmission(deniedRequest);
  assert.equal(deniedPlanner.inventoryStatus, "DENIED");
  expectCode(
    () =>
      attachVerifiedCurrent187DdlFenceAttestation(
        deniedPlanner,
        binding.acquisitionDigest,
        receipt,
      ),
    "CURRENT187_CLUSTER_INVENTORY_ATTESTATION_BASE_INVALID",
  );
});

test("receipt is secret-free and does not expose signature, PEM, URL, email, password, or token", () => {
  const { binding, envelope, verifier } = fixture();
  const receipt = verifier.verify(envelope, binding, NOW);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /BEGIN PUBLIC KEY/u);
  assert.doesNotMatch(serialized, /signature/u);
  assert.doesNotMatch(serialized, /https?:\/\//u);
  assert.doesNotMatch(serialized, /@/u);
  assert.doesNotMatch(serialized, /password|secret|token/u);
});

test("contract and authority source perform no filesystem, database, DDL, network, provider, or enrollment I/O", async () => {
  const source = `${await readFile(CONTRACT_PATH, "utf8")}\n${await readFile(
    AUTHORITY_PATH,
    "utf8",
  )}`;
  assert.doesNotMatch(
    source,
    /from\s+["'](?:node:fs|node:net|node:http|node:https|pg|@prisma\/client|nodemailer)/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:fetch|connect|query|execute|sendMail)\s*\(/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\s+(?:ROLE|DATABASE|TABLE|SCHEMA|FUNCTION)\b/iu,
  );
  assert.doesNotMatch(source, /process\.env\.(?!NODE_ENV\b)/u);
  assert.equal(
    (
      source.match(
        /export const PINNED_CURRENT187_DDL_FENCE_PRODUCTION_ROOTS =/gu,
      ) ?? []
    ).length,
    1,
  );
  assert.doesNotMatch(
    source,
    /(?:set|add|enroll|register)Current187DdlFence(?:Production)?Root/iu,
  );
});
