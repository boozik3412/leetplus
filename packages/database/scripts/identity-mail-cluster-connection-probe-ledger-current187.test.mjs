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
  CURRENT187_ADMISSION_PURPOSES,
  CURRENT187_ADMISSION_PURPOSE_DEFINITIONS,
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
  CURRENT187_ADMISSION_SLICE,
  CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
  CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
  current187AdmissionBindingProjection,
  current187AdmissionCanonicalJson,
  normalizeCurrent187AdmissionPayload,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  current187AdmissionPayloadDigest,
  current187AdmissionPublicKeyFingerprint,
  verifySyntheticCurrent187AdmissionEnvelope,
} from "./identity-mail-cluster-application-admission-current187-authority.mjs";
import {
  CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_KIND,
  CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_PROFILE,
  CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_SLICE,
  bindPersistedCurrent187ConnectionProbeToDeploymentAuthority,
  isVerifiedCurrent187ConnectionProbeDeployBindingReceipt,
} from "./identity-mail-cluster-connection-probe-deploy-binding-current187.mjs";
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
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
after(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});
const NOW = "2026-08-12T12:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY_PEM = publicKey.export({ format: "pem", type: "spki" });
const PUBLIC_KEY_FINGERPRINT =
  current187ConnectionProbePublicKeyFingerprint(PUBLIC_KEY_PEM);
const KEY_ID = "current187-connection-probe-ledger-ci-1";
const ADMISSION_SIGNERS = Object.fromEntries(
  CURRENT187_ADMISSION_PURPOSES.map((purpose, index) => {
    const pair = generateKeyPairSync("ed25519");
    const publicKeyPem = pair.publicKey.export({
      format: "pem",
      type: "spki",
    });
    return [
      purpose,
      {
        keyId: `current187-j5-r4-${index + 1}`,
        privateKey: pair.privateKey,
        publicKeyFingerprint:
          current187AdmissionPublicKeyFingerprint(publicKeyPem),
        publicKeyPem,
      },
    ];
  }),
);

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

function persistedProbeFixture() {
  const signed = envelope();
  const sourceReceipt = verified(signed);
  const bundle = createCurrent187ConnectionProbeConsumptionBundle(
    signed,
    sourceReceipt,
    NOW,
  );
  return attachPersistedCurrent187ConnectionProbeConsumption(
    signed,
    sourceReceipt,
    bundle,
    persistedConsumptionText(bundle),
  );
}

function deploymentAuthorityReceipt(persistedProbe, overrides = {}) {
  const purpose = CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE;
  const definition = CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
  const signer = ADMISSION_SIGNERS[purpose];
  const binding = {
    beforeImageDigest: digest("deploy-before-image"),
    clusterCatalogDigest: digest("deploy-cluster-catalog"),
    clusterIdentityDigest: persistedProbe.clusterIdentityDigest,
    currentAclPolicyDigest: digest("deploy-current-acl"),
    databaseUniverseDigest: persistedProbe.databaseUniverseDigest,
    ddlFenceDigest: digest("deploy-ddl-fence"),
    defaultAclPolicyDigest: digest("deploy-default-acl"),
    emergencyPlanDigest: digest("deploy-emergency-plan"),
    enrollmentReceiptDigest: digest("deploy-enrollment-receipt"),
    environment: "production",
    executableDigest: digest("deploy-executable"),
    expectedPriorAuthorityEpoch: "1",
    hbaDigest: digest("deploy-hba"),
    immutableArtifactDigest: digest("deploy-immutable-artifact"),
    liveScanDigest: digest("deploy-live-scan"),
    migrationManifestDigest: digest("deploy-migration-manifest"),
    networkEndpointDigest: digest("deploy-network-endpoint"),
    nonce: digest("deploy-nonce"),
    normalizedSqlDigest: digest("deploy-normalized-sql"),
    operationId: "33333333-3333-4333-8333-333333333333",
    outboundKillSwitchEvidenceDigest: digest("deploy-outbound-kill-switch"),
    perDatabaseCatalogDigest: digest("deploy-per-database-catalog"),
    poolerDigest: digest("deploy-pooler"),
    postgresMajorVersion: 16,
    predecessorChainDigest: digest("deploy-predecessor-chain"),
    providerRecoveryEvidenceDigest: digest("deploy-provider-recovery"),
    purpose,
    releaseSha: persistedProbe.releaseSha,
    roleBindingsDigest: digest("deploy-role-bindings"),
    rollbackPlanDigest: digest("deploy-rollback-plan"),
    runtimeConfigDigest: digest("deploy-runtime-config"),
    serviceAccountMappingDigest: digest("deploy-service-account-mapping"),
    tlsDigest: digest("deploy-tls"),
    zeroDiffProofDigest: digest("deploy-zero-diff"),
    ...overrides,
  };
  const payloadValue = {
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-12T11:59:00.000Z",
    kind: definition.kind,
    profile: definition.profile,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: signer.keyId,
    slice: CURRENT187_ADMISSION_SLICE,
    trustDomain: definition.trustDomain,
    validUntil: "2026-08-12T12:04:00.000Z",
  };
  const normalized = normalizeCurrent187AdmissionPayload(payloadValue);
  const authorityEnvelope = {
    payload: payloadValue,
    payloadDigest: current187AdmissionPayloadDigest(normalized),
    publicKeyFingerprint: signer.publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(current187AdmissionCanonicalJson(normalized), "utf8"),
      signer.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
    signingKeyId: signer.keyId,
  };
  const roots = Object.fromEntries(
    CURRENT187_ADMISSION_PURPOSES.map((rootPurpose) => {
      const rootSigner = ADMISSION_SIGNERS[rootPurpose];
      const rootDefinition =
        CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[rootPurpose];
      return [
        rootPurpose,
        {
          [rootSigner.keyId]: {
            algorithm: CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
            keyId: rootSigner.keyId,
            notAfter: "2026-08-12T13:00:00.000Z",
            notBefore: "2026-08-12T11:00:00.000Z",
            profile: rootDefinition.profile,
            publicKeyFingerprint: rootSigner.publicKeyFingerprint,
            publicKeyPem: rootSigner.publicKeyPem,
            purpose: rootPurpose,
            status: "ACTIVE",
            trustDomain: rootDefinition.trustDomain,
          },
        },
      ];
    }),
  );
  return verifySyntheticCurrent187AdmissionEnvelope(
    authorityEnvelope,
    purpose,
    current187AdmissionBindingProjection(payloadValue),
    roots,
    {
      databaseName: "lp_current187_j5_r4_ci",
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
    NOW,
  );
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

test("persisted J5 receipt binds exact matrix, envelope, root, receipt, and release beside immutable deployment authority deny-only", () => {
  const persisted = persistedProbeFixture();
  const authority = deploymentAuthorityReceipt(persisted);
  const binding = bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
    persisted,
    authority,
  );

  assert.equal(binding.kind, CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_KIND);
  assert.equal(
    binding.profile,
    CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_PROFILE,
  );
  assert.equal(binding.slice, CURRENT187_CONNECTION_PROBE_DEPLOY_BINDING_SLICE);
  assert.equal(binding.status, "SCOPE_BOUND_DENY_ONLY");
  assert.equal(binding.connectionProbeBindingsMatched, true);
  assert.deepEqual(binding.reasonCodes, []);
  assert.equal(binding.persistedConnectionProbeConsumptionVerified, true);
  assert.equal(binding.productionBindingSatisfied, false);
  assert.equal(binding.deploymentGoConsumable, false);
  assert.equal(binding.authorization, false);
  assert.equal(binding.canApply, false);
  assert.equal(binding.canMutate, false);
  assert.equal(binding.canSend, false);
  assert.equal(binding.productionRootEnrolled, false);
  assert.equal(binding.productionRuntimeAttested, false);
  assert.equal(binding.testAccessAuthorized, false);
  assert.equal(binding.sharedBetaAccess, false);
  assert.equal(
    binding.sourceAuthorityPayloadDigest,
    authority.envelope.payloadDigest,
  );
  assert.equal(
    binding.sourceConnectionProbeEnvelopeDigest,
    persisted.envelopeDigest,
  );
  assert.equal(
    binding.sourceConnectionProbeMatrixDigest,
    persisted.connectionProbeMatrixDigest,
  );
  assert.equal(
    binding.sourceConnectionProbeRootFingerprint,
    persisted.persistedConnectionProbeRootFingerprint,
  );
  assert.equal(
    binding.sourceConnectionProbeVerificationReceiptDigest,
    persisted.verificationReceiptDigest,
  );
  assert.equal(
    binding.sourcePersistedConnectionProbeReceiptDigest,
    persisted.persistedConnectionProbeReceiptDigest,
  );
  assert.equal(Object.isFrozen(binding), true);
  assert.equal(Object.isFrozen(binding.reasonCodes), true);
  assert.equal(
    isVerifiedCurrent187ConnectionProbeDeployBindingReceipt(binding),
    true,
  );
  assert.equal(
    isVerifiedCurrent187ConnectionProbeDeployBindingReceipt({ ...binding }),
    false,
  );
});

test("deployment authority release, cluster, and universe drift is denied without authority", () => {
  const persisted = persistedProbeFixture();
  const cases = [
    [
      "clusterIdentityDigest",
      "CURRENT187_CONNECTION_PROBE_DEPLOY_CLUSTER_MISMATCH",
    ],
    [
      "databaseUniverseDigest",
      "CURRENT187_CONNECTION_PROBE_DEPLOY_UNIVERSE_MISMATCH",
    ],
  ];
  for (const [key, reasonCode] of cases) {
    const authority = deploymentAuthorityReceipt(persisted, {
      [key]: digest(`drift:${key}`),
    });
    const binding = bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persisted,
      authority,
    );
    assert.equal(binding.status, "SCOPE_BINDING_DENIED", key);
    assert.equal(binding.connectionProbeBindingsMatched, false, key);
    assert.deepEqual(binding.reasonCodes, [reasonCode], key);
    assert.equal(binding.deploymentGoConsumable, false, key);
  }

  const releaseAuthority = deploymentAuthorityReceipt(persisted, {
    releaseSha: "b".repeat(40),
  });
  const releaseBinding =
    bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persisted,
      releaseAuthority,
    );
  assert.deepEqual(releaseBinding.reasonCodes, [
    "CURRENT187_CONNECTION_PROBE_DEPLOY_RELEASE_MISMATCH",
  ]);
});

test("deployment binding rejects cloned persisted and authority receipts", () => {
  const persisted = persistedProbeFixture();
  const authority = deploymentAuthorityReceipt(persisted);
  assert.throws(
    () =>
      bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
        { ...persisted },
        authority,
      ),
    expectCode("CURRENT187_CONNECTION_PROBE_DEPLOY_PERSISTED_RECEIPT_INVALID"),
  );
  assert.throws(
    () =>
      bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(persisted, {
        ...authority,
      }),
    expectCode("CURRENT187_CONNECTION_PROBE_DEPLOY_AUTHORITY_RECEIPT_INVALID"),
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

test("ledger and deploy binding sources have no database, network, filesystem-write, process, env, tenant, invite, or provider capability", async () => {
  const sources = await Promise.all(
    [
      "identity-mail-cluster-connection-probe-ledger-current187.mjs",
      "identity-mail-cluster-connection-probe-deploy-binding-current187.mjs",
    ].map((name) => readFile(join(SCRIPT_DIRECTORY, name), "utf8")),
  );
  const forbiddenPatterns = [
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
  ];
  for (const source of sources) {
    for (const forbidden of forbiddenPatterns) {
      assert.doesNotMatch(source, forbidden);
    }
  }
  assert.equal(CURRENT187_CONNECTION_PROBE_LEDGER_SLICE.includes("R3"), true);
  assert.equal(
    CURRENT187_CONNECTION_PROBE_LEDGER_PROFILE.includes("SYNTHETIC_CI"),
    true,
  );
});
