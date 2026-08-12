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
  CURRENT187_ADMISSION_PURPOSES,
  CURRENT187_ADMISSION_PURPOSE_DEFINITIONS,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
  CURRENT187_ADMISSION_SLICE,
  CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
  CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
  CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE,
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
import { bindPersistedCurrent187ConnectionProbeToDeploymentAuthority } from "./identity-mail-cluster-connection-probe-deploy-binding-current187.mjs";
import {
  attachPersistedCurrent187ConnectionProbeConsumption,
  createCurrent187ConnectionProbeConsumptionBundle,
} from "./identity-mail-cluster-connection-probe-ledger-current187.mjs";
import {
  CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION,
  CURRENT187_CLUSTER_ACQUISITION_KIND,
  CURRENT187_CLUSTER_ACQUISITION_PROFILE,
  CURRENT187_CLUSTER_ACQUISITION_SLICE,
  CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND,
  acquireCurrent187ClusterInventory,
  attachVerifiedCurrent187DdlFenceAttestationToAcquisition,
  isVerifiedCurrent187ClusterAcquisitionReceipt,
} from "./identity-mail-cluster-acquisition-current187.mjs";
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
  CURRENT187_BACKEND_IDENTITY_SQL,
  CURRENT187_CONTROL_IDENTITY_SQL,
  CURRENT187_DATABASE_SNAPSHOT_SQL,
  CURRENT187_PER_DATABASE_CATALOG_SURFACES,
} from "./identity-mail-cluster-acquisition-current187-sql.mjs";
import {
  evaluateCurrent187ClusterPolicy,
  isVerifiedCurrent187ClusterPolicyReceipt,
} from "./identity-mail-cluster-policy-current187.mjs";
import {
  CURRENT187_CLUSTER_POLICY_SUCCESSOR_KIND,
  CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROFILE,
  CURRENT187_CLUSTER_POLICY_SUCCESSOR_SLICE,
  evaluateCurrent187ClusterPolicySuccessor,
  isVerifiedCurrent187ClusterPolicySuccessorReceipt,
} from "./identity-mail-cluster-policy-successor-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import {
  CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_KIND,
  CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_PROFILE,
  CURRENT187_SEMANTIC_ALLOWLIST_SLICE,
  current187SemanticAllowlistDocumentDigest,
  evaluateCurrent187SemanticAllowlist,
  isVerifiedCurrent187SemanticAllowlistReceipt,
} from "./identity-mail-cluster-semantic-allowlist-current187.mjs";
import {
  CURRENT187_SEMANTIC_APPROVAL_REVOCATION_CONFIRMATION,
  attachPersistedCurrent187SemanticApprovalConsumption,
  attachPersistedCurrent187SemanticApprovalRevocation,
  createCurrent187SemanticApprovalConsumptionBundle,
  createSyntheticCurrent187SemanticApprovalRevocationBundle,
  current187SemanticApprovalLedgerDatabaseArguments,
  isVerifiedPersistedCurrent187SemanticApprovalReceipt,
  isVerifiedPersistedCurrent187SemanticApprovalRevocationReceipt,
} from "./identity-mail-cluster-semantic-approval-ledger-current187.mjs";

const DIGESTS = Object.freeze({
  fence: "1".repeat(64),
  topology: "2".repeat(64),
});
const CURRENT187_J5_RELEASE_SHA = "c".repeat(40);
const CURRENT187_J5_OPERATION_ID = "99999999-9999-4999-8999-999999999999";
const CURRENT187_J5_NOW = "2026-08-05T10:03:00.000Z";
const CURRENT187_J5_KEY_ID = "current187-policy-successor-j5-ci-1";
const {
  privateKey: CURRENT187_J5_PRIVATE_KEY,
  publicKey: CURRENT187_J5_PUBLIC_KEY,
} = generateKeyPairSync("ed25519");
const CURRENT187_J5_PUBLIC_KEY_PEM = CURRENT187_J5_PUBLIC_KEY.export({
  format: "pem",
  type: "spki",
});
const CURRENT187_J5_PUBLIC_KEY_FINGERPRINT =
  current187ConnectionProbePublicKeyFingerprint(CURRENT187_J5_PUBLIC_KEY_PEM);

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function domainDigest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function current187J5NegativeProbes(purpose) {
  return CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.map((scenario) => ({
    evidenceDigest: digest(`successor:${purpose}:${scenario}`),
    observedOutcome:
      CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario],
    scenario,
  }));
}

function current187J5Service(purpose, index) {
  return {
    allowedOperationsDigest: digest(`successor:${purpose}:operations`),
    applicationNameDigest: digest(`successor:${purpose}:application`),
    backendIdentityDigest: digest(`successor:${purpose}:backend`),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceiptDigest: digest(`successor:${purpose}:j2`),
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(`successor:${purpose}:hba`),
    negativeProbes: current187J5NegativeProbes(purpose),
    poolerMappingDigest: digest(`successor:${purpose}:pooler`),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    positiveOutcome: "ALLOWED",
    positiveProbeDigest: digest(`successor:${purpose}:positive`),
    postgresSessionReceiptDigest: digest(`successor:${purpose}:j1`),
    purpose,
    secretReferenceDigest: digest(`successor:${purpose}:secret-reference`),
    tlsMode: "VERIFY_FULL",
  };
}

function persistedCurrent187J5ProbeFixture(attested) {
  const planner = attested.plannerReceipt;
  const payload = {
    clusterIdentityDigest: planner.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: planner.expectedDatabaseUniverseDigest,
    environment: "ci",
    hbaControlReceiptDigest: digest("successor:j3"),
    hostControlChallengeDigest: digest("successor:host-control"),
    issuedAt: "2026-08-05T10:02:40.000Z",
    kind: CURRENT187_CONNECTION_PROBE_KIND,
    nonce: digest("successor:j5-nonce"),
    operationId: CURRENT187_J5_OPERATION_ID,
    pgbouncerControlReceiptDigest: digest("successor:j4"),
    probeRunnerArtifactDigest: digest("successor:runner"),
    probeTranscriptDigest: digest("successor:transcript"),
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: CURRENT187_J5_PUBLIC_KEY_FINGERPRINT,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    releaseSha: CURRENT187_J5_RELEASE_SHA,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services:
      CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(current187J5Service),
    signingKeyId: CURRENT187_J5_KEY_ID,
    slice: CURRENT187_CONNECTION_PROBE_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: "2026-08-05T10:04:30.000Z",
  };
  const envelope = {
    payload,
    payloadDigest: current187ConnectionProbePayloadDigest(payload),
    publicKeyFingerprint: CURRENT187_J5_PUBLIC_KEY_FINGERPRINT,
    signature: signPayload(
      null,
      Buffer.from(current187AdmissionCanonicalJson(payload), "utf8"),
      CURRENT187_J5_PRIVATE_KEY,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    signingKeyId: CURRENT187_J5_KEY_ID,
  };
  const root = {
    algorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    keyId: CURRENT187_J5_KEY_ID,
    notAfter: "2026-08-05T11:00:00.000Z",
    notBefore: "2026-08-05T09:00:00.000Z",
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: CURRENT187_J5_PUBLIC_KEY_FINGERPRINT,
    publicKeyPem: CURRENT187_J5_PUBLIC_KEY_PEM,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    status: "ACTIVE",
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  };
  const verificationReceipt = verifySyntheticCurrent187ConnectionProbeEnvelope(
    envelope,
    { [CURRENT187_J5_KEY_ID]: root },
    {
      databaseName: DATABASES.app.name,
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
    CURRENT187_J5_NOW,
  );
  const bundle = createCurrent187ConnectionProbeConsumptionBundle(
    envelope,
    verificationReceipt,
    CURRENT187_J5_NOW,
  );
  const persistedBase = {
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    connectionProbeMatrixDigest: bundle.command.connectionProbeMatrixDigest,
    consumedAt: CURRENT187_J5_NOW,
    envelopeDigest: bundle.command.envelopeDigest,
    kind: "CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT",
    nonce: bundle.command.nonce,
    noncanonical: true,
    operationId: bundle.command.operationId,
    persistedConsumptionVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    sharedBetaAccess: false,
    status: "CONSUMED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "43",
    verificationReceiptDigest: bundle.command.verificationReceiptDigest,
  };
  const persisted = {
    ...persistedBase,
    receiptDigest: domainDigest(
      "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONSUMPTION_RECEIPT_V1",
      current187AdmissionCanonicalJson(persistedBase),
    ),
  };
  return attachPersistedCurrent187ConnectionProbeConsumption(
    envelope,
    verificationReceipt,
    bundle,
    current187AdmissionCanonicalJson(persisted),
  );
}

const DATABASES = Object.freeze({
  app: Object.freeze({
    collate: "C.UTF-8",
    connectionLimit: 40,
    ctype: "C.UTF-8",
    datallowconn: true,
    encoding: "UTF8",
    isTemplate: false,
    localeProvider: "libc",
    name: "leetplus_current187_ci",
    oid: 16_384,
    ownerName: "database_owner",
    ownerOid: 16_390,
  }),
  postgres: Object.freeze({
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
  }),
  template0: Object.freeze({
    collate: "C.UTF-8",
    connectionLimit: -1,
    ctype: "C.UTF-8",
    datallowconn: false,
    encoding: "UTF8",
    isTemplate: true,
    localeProvider: "libc",
    name: "template0",
    oid: 4,
    ownerName: "postgres",
    ownerOid: 10,
  }),
  template1: Object.freeze({
    collate: "C.UTF-8",
    connectionLimit: -1,
    ctype: "C.UTF-8",
    datallowconn: true,
    encoding: "UTF8",
    isTemplate: true,
    localeProvider: "libc",
    name: "template1",
    oid: 1,
    ownerName: "postgres",
    ownerOid: 10,
  }),
});

const BASE_UNIVERSE = Object.freeze([
  DATABASES.app,
  DATABASES.postgres,
  DATABASES.template0,
  DATABASES.template1,
]);

function baseRequest() {
  return {
    contract: CURRENT187_ADMISSION_CONTRACT,
    expectedCatalog: {
      catalogRowsComplete: true,
      nonTemplateDatabases: [DATABASES.postgres, DATABASES.app],
      templateDatabases: [DATABASES.template1, DATABASES.template0],
    },
    externalDdlFenceReceipt: {
      attestationStatus: "DECLARED_UNVERIFIED",
      fence: {
        active: true,
        clusterDdlBlocked: true,
        creatorPrincipalsDisabled: true,
        databaseDdlBlocked: true,
        evidenceDigest: DIGESTS.fence,
        fenceEpoch: "9",
        migrationPrincipalsDisabled: true,
        validFrom: "2026-08-05T10:00:00.000Z",
        validUntil: "2026-08-05T10:10:00.000Z",
      },
      kind: CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND,
    },
    kind: CURRENT187_CLUSTER_ACQUISITION_KIND,
    profile: CURRENT187_CLUSTER_ACQUISITION_PROFILE,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    slice: CURRENT187_CLUSTER_ACQUISITION_SLICE,
    syntheticContext: {
      connectionTimeoutMs: 50,
      databaseName: DATABASES.app.name,
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION,
      nodeEnv: "test",
      scannerRoleName: "current187_scanner",
      statementTimeoutMs: 50,
    },
    topologyDigest: DIGESTS.topology,
  };
}

function databaseQueryRows(universe) {
  return universe.map((database) => ({
    ...database,
    oid: String(database.oid),
    ownerOid: String(database.ownerOid),
  }));
}

function scannerFlags(overrides = {}) {
  return {
    currentUser: "current187_scanner",
    scannerBypassRls: false,
    scannerCanLogin: true,
    scannerCreateDatabase: false,
    scannerCreateRole: false,
    scannerReplication: false,
    scannerSuperuser: false,
    serverAddress: "127.0.0.1",
    serverPort: 55_432,
    sessionUser: "current187_scanner",
    ...overrides,
  };
}

function controlIdentityRow(overrides = {}) {
  return {
    catalogVersionNo: 202307071,
    controlVersion: 1300,
    databaseName: DATABASES.app.name,
    serverVersionNum: 160_009,
    systemIdentifier: "7412345678901234567",
    ...scannerFlags(),
    ...overrides,
  };
}

function backendIdentityRow(database, overrides = {}) {
  return {
    databaseName: database.name,
    databaseOid: String(database.oid),
    ...scannerFlags(),
    ...overrides,
  };
}

function clock() {
  const timeline = [
    "2026-08-05T10:00:30.000Z",
    "2026-08-05T10:00:40.000Z",
    "2026-08-05T10:01:00.000Z",
    "2026-08-05T10:01:10.000Z",
    "2026-08-05T10:01:30.000Z",
    "2026-08-05T10:02:00.000Z",
    "2026-08-05T10:02:10.000Z",
  ];
  let index = 0;
  return () => timeline[index++] ?? timeline.at(-1);
}

function surfaceName(sql) {
  const match = /current187:surface:([a-z0-9_]+)/u.exec(sql);
  return match?.[1];
}

function semanticSurfaceRows(name, databaseName, payload) {
  const label = payload ?? `semantic-${name}`;
  const rows = {
    column_acl_all_grantees: {
      columnName: "email",
      columnNumber: 2,
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      privilege: "SELECT",
      relationName: label,
      relationOid: "200",
      schemaName: "public",
    },
    database_security: {
      databaseName,
      databaseOid: "100",
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      kind: "DIRECT",
      ownerName: "owner_role",
      ownerOid: "10",
      privilege: "CONNECT",
    },
    default_acl_all_grantees: {
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      objectType: label,
      ownerName: "owner_role",
      ownerOid: "10",
      privilege: "SELECT",
      schemaName: null,
      schemaOid: "0",
    },
    effective_object_privileges: {
      kind: "TYPE",
      objectName: label,
      objectOid: "400",
      roleName: "app_role",
      roleOid: "20",
      schemaName: "public",
      usage: true,
    },
    memberships: {
      adminOption: false,
      grantorName: "owner_role",
      grantorOid: "10",
      inheritOption: true,
      kind: "DIRECT",
      memberName: "app_role",
      memberOid: "20",
      roleName: label,
      roleOid: "21",
      setOption: false,
    },
    owned_objects: {
      classOid: "1259",
      databaseName,
      databaseOid: "100",
      dependencyType: "o",
      identity: label,
      objectOid: "200",
      objectSubId: 0,
      ownerName: "owner_role",
      ownerOid: "10",
    },
    relation_acl_all_grantees: {
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "SELECT",
      relationKind: "r",
      relationName: label,
      relationOid: "200",
      schemaName: "public",
    },
    role_database_settings: {
      databaseName,
      databaseOid: "100",
      roleName: "app_role",
      roleOid: "20",
      setting: label,
    },
    roles: {
      bypassRls: false,
      canLogin: true,
      config: null,
      connectionLimit: 10,
      createDatabase: false,
      createRole: false,
      inherit: true,
      name: label,
      oid: "20",
      replication: false,
      superuser: false,
      validUntil: null,
    },
    routine_acl_all_grantees: {
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      identityArguments: "",
      ownerOid: "10",
      privilege: "EXECUTE",
      routineName: label,
      routineOid: "300",
      schemaName: "public",
    },
    schema_acl_all_grantees: {
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "USAGE",
      schemaName: label,
      schemaOid: "2200",
    },
    type_acl_all_grantees: {
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "USAGE",
      schemaName: "public",
      typeName: label,
      typeOid: "400",
    },
  };
  const row = rows[name];
  return row ? [{ evidence: JSON.stringify(row) }] : null;
}

function fakeDependencies(options = {}) {
  const queryLog = [];
  const connectLog = [];
  const closeLog = [];
  let controlConnectionCount = 0;
  const now = options.now ?? clock();
  const connect = async (databaseName) => {
    connectLog.push(databaseName);
    const isControl = databaseName === DATABASES.app.name;
    const controlOrdinal = isControl ? controlConnectionCount++ : -1;
    const database = BASE_UNIVERSE.find((entry) => entry.name === databaseName);
    return {
      close: async () => {
        closeLog.push(databaseName);
      },
      query: async (sql) => {
        queryLog.push({ databaseName, sql });
        if (options.neverResolvePattern?.test(sql)) {
          return new Promise(() => undefined);
        }
        if (options.throwPattern?.test(sql)) {
          throw new Error("unsafe provider detail must never escape");
        }
        if (/^(?:BEGIN|SET LOCAL|COMMIT|ROLLBACK)/u.test(sql.trimStart())) {
          return [];
        }
        if (sql === CURRENT187_CONTROL_IDENTITY_SQL) {
          return [
            controlIdentityRow(
              controlOrdinal > 0
                ? options.finalControlOverrides
                : options.initialControlOverrides,
            ),
          ];
        }
        if (sql === CURRENT187_DATABASE_SNAPSHOT_SQL) {
          const universe =
            controlOrdinal > 0
              ? (options.finalUniverse ?? BASE_UNIVERSE)
              : (options.initialUniverse ?? BASE_UNIVERSE);
          return databaseQueryRows(universe);
        }
        if (sql === CURRENT187_BACKEND_IDENTITY_SQL) {
          return [
            backendIdentityRow(
              database,
              options.backendOverrides?.[databaseName],
            ),
          ];
        }
        const name = surfaceName(sql);
        if (name) {
          const semanticRows = semanticSurfaceRows(
            name,
            databaseName,
            options.surfacePayloadByName?.[name] ?? options.surfacePayload,
          );
          if (semanticRows) {
            return semanticRows;
          }
          return [
            {
              evidence: JSON.stringify({
                database: databaseName,
                payload:
                  options.surfacePayloadByName?.[name] ??
                  options.surfacePayload ??
                  `normalized-${name}-without-raw-receipt-output`,
                surface: name,
              }),
            },
          ];
        }
        throw new Error("unexpected SQL");
      },
    };
  };
  return {
    dependencies: { connect, now },
    logs: { closeLog, connectLog, queryLog },
  };
}

let previousNodeEnv;

test.beforeEach(() => {
  previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
});

test.afterEach(() => {
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("acquires every allowlisted database and returns only a deny-only matched receipt", async () => {
  const { dependencies, logs } = fakeDependencies();
  const receipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    dependencies,
  );
  assert.equal(receipt.acquisitionStatus, "ACQUIRED");
  assert.equal(receipt.liveClusterScanAcquired, true);
  assert.equal(receipt.plannerReceipt.inventoryStatus, "MATCHED");
  assert.equal(receipt.plannerReceipt.liveClusterScanVerified, false);
  assert.deepEqual(receipt.reasonCodes, []);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.externalDdlFenceAttested, false);
  assert.equal(receipt.topologyExternallyAttested, false);
  assert.equal(
    receipt.plannerReceipt.semanticRiskFactsStatus,
    "FACTS_EXTRACTED_DENY_ONLY",
  );
  assert.match(
    receipt.plannerReceipt.semanticRiskFactsDigest,
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(isVerifiedCurrent187ClusterAcquisitionReceipt(receipt), true);
  assert.equal(
    isVerifiedCurrent187ClusterAcquisitionReceipt({ ...receipt }),
    false,
  );
  assert.deepEqual(logs.connectLog, [
    DATABASES.app.name,
    DATABASES.app.name,
    DATABASES.postgres.name,
    DATABASES.app.name,
  ]);
  assert.deepEqual(logs.closeLog, logs.connectLog);
  for (const databaseName of [DATABASES.app.name, DATABASES.postgres.name]) {
    for (const surface of CURRENT187_PER_DATABASE_CATALOG_SURFACES) {
      assert.ok(
        logs.queryLog.some(
          (entry) =>
            entry.databaseName === databaseName && entry.sql === surface.sql,
        ),
        `${databaseName}:${surface.name}`,
      );
    }
  }
});

async function attestedAcquisitionFixture() {
  const { dependencies } = fakeDependencies();
  const acquisition = await acquireCurrent187ClusterInventory(
    baseRequest(),
    dependencies,
  );
  const planner = acquisition.plannerReceipt;
  const applicationAuthorityFingerprint = digest("application-authority");
  const scannerRoleBindingDigest = digest("scanner-role-binding");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint =
    current187DdlFenceAttestationPublicKeyFingerprint(publicKeyPem);
  const keyId = "current187-ddl-fence-acquisition-ci-1";
  const binding = {
    acquisitionDigest: acquisition.acquisitionDigest,
    applicationAuthorityFingerprint,
    attestorArtifactDigest: digest("attestor-artifact"),
    clusterIdentityDigest: planner.clusterIdentityDigest,
    databaseUniverseDigest: planner.expectedDatabaseUniverseDigest,
    ddlFenceEvidenceDigest: planner.ddlFenceEvidenceDigest,
    ddlFenceStateDigest: planner.ddlFenceStateDigest,
    environment: planner.environment,
    fenceEpoch: planner.ddlFenceEpoch,
    fenceValidFrom: planner.ddlFenceValidFrom,
    fenceValidUntil: planner.ddlFenceValidUntil,
    finalDatabaseUniverseDigest: planner.finalDatabaseUniverseDigest,
    finalSnapshotCapturedAt: planner.finalCatalogSnapshotCapturedAt,
    finalSnapshotDigest: planner.finalCatalogSnapshotDigest,
    immutableArtifactDigest: digest("immutable-artifact"),
    inventoryPlanDigest: planner.planDigest,
    nonce: digest("acquisition-attestation-nonce"),
    operationId: "66666666-6666-4666-8666-666666666666",
    purpose: CURRENT187_DDL_FENCE_ATTESTATION_PURPOSE,
    releasePolicyDigest: digest("release-policy"),
    releasePolicyId: "current187-acquisition-ci-policy-v1",
    releaseSha: "b".repeat(40),
    scannerRoleBindingDigest,
  };
  const payload = {
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-05T10:02:20.000Z",
    kind: CURRENT187_DDL_FENCE_ATTESTATION_KIND,
    profile: CURRENT187_DDL_FENCE_ATTESTATION_PROFILE,
    publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: keyId,
    slice: CURRENT187_DDL_FENCE_ATTESTATION_SLICE,
    trustDomain: CURRENT187_DDL_FENCE_ATTESTATION_TRUST_DOMAIN,
    validUntil: "2026-08-05T10:03:30.000Z",
  };
  const normalizedPayload =
    normalizeCurrent187DdlFenceAttestationPayload(payload);
  const envelope = {
    payload,
    payloadDigest:
      current187DdlFenceAttestationPayloadDigest(normalizedPayload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(
        current187DdlFenceAttestationCanonicalJson(normalizedPayload),
        "utf8",
      ),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
    signingKeyId: keyId,
  };
  const verifier = createSyntheticCurrent187DdlFenceAttestationVerifier(
    {
      [keyId]: {
        algorithm: CURRENT187_DDL_FENCE_ATTESTATION_SIGNATURE_ALGORITHM,
        keyId,
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
      databaseName: DATABASES.app.name,
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation:
        CURRENT187_DDL_FENCE_ATTESTATION_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
      scannerRoleBindingDigest,
    },
  );
  const attestation = verifier.verify(
    envelope,
    binding,
    "2026-08-05T10:02:30.000Z",
  );
  const attested = attachVerifiedCurrent187DdlFenceAttestationToAcquisition(
    acquisition,
    attestation,
  );

  return { acquisition, attestation, attested };
}

function signedAdmissionAuthorityFixture(purpose, binding) {
  const signers = Object.fromEntries(
    CURRENT187_ADMISSION_PURPOSES.map((purpose, index) => {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
      return [
        purpose,
        {
          keyId: `current187-policy-${index + 1}-ci`,
          privateKey,
          publicKeyFingerprint:
            current187AdmissionPublicKeyFingerprint(publicKeyPem),
          publicKeyPem,
        },
      ];
    }),
  );
  const roots = Object.fromEntries(
    CURRENT187_ADMISSION_PURPOSES.map((purpose) => {
      const signer = signers[purpose];
      const definition = CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
      return [
        purpose,
        {
          [signer.keyId]: {
            algorithm: CURRENT187_ADMISSION_SIGNATURE_ALGORITHM,
            keyId: signer.keyId,
            notAfter: "2026-08-05T11:00:00.000Z",
            notBefore: "2026-08-05T09:00:00.000Z",
            profile: definition.profile,
            publicKeyFingerprint: signer.publicKeyFingerprint,
            publicKeyPem: signer.publicKeyPem,
            purpose,
            status: "ACTIVE",
            trustDomain: definition.trustDomain,
          },
        },
      ];
    }),
  );
  const definition = CURRENT187_ADMISSION_PURPOSE_DEFINITIONS[purpose];
  const signer = signers[purpose];
  const payload = {
    ...binding,
    contract: CURRENT187_ADMISSION_CONTRACT,
    issuedAt: "2026-08-05T10:02:40.000Z",
    kind: definition.kind,
    profile: definition.profile,
    publicKeyFingerprint: signer.publicKeyFingerprint,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    signingKeyId: signer.keyId,
    slice: CURRENT187_ADMISSION_SLICE,
    trustDomain: definition.trustDomain,
    validUntil: "2026-08-05T10:04:30.000Z",
  };
  const normalized = normalizeCurrent187AdmissionPayload(payload);
  const envelope = {
    payload,
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
  return verifySyntheticCurrent187AdmissionEnvelope(
    envelope,
    purpose,
    current187AdmissionBindingProjection(payload),
    roots,
    {
      databaseName: DATABASES.app.name,
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_ADMISSION_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
    "2026-08-05T10:03:00.000Z",
  );
}

function deploymentAuthorityFixture(attested, bindingOverrides = {}) {
  const planner = attested.plannerReceipt;
  const binding = {
    beforeImageDigest: digest("policy-before-image"),
    clusterCatalogDigest: planner.clusterCatalogDigest,
    clusterIdentityDigest: planner.clusterIdentityDigest,
    currentAclPolicyDigest: planner.currentAclPolicyDigest,
    databaseUniverseDigest: planner.expectedDatabaseUniverseDigest,
    ddlFenceDigest: attested.externalDdlFenceAttestationDigest,
    defaultAclPolicyDigest: planner.defaultAclPolicyDigest,
    emergencyPlanDigest: digest("policy-emergency-plan"),
    enrollmentReceiptDigest: digest("policy-enrollment-receipt"),
    environment: "production",
    executableDigest: digest("policy-executable"),
    expectedPriorAuthorityEpoch: "1",
    hbaDigest: digest("policy-hba"),
    immutableArtifactDigest: digest("policy-immutable-artifact"),
    liveScanDigest: attested.acquisitionDigest,
    migrationManifestDigest: digest("policy-migration-manifest"),
    networkEndpointDigest: digest("policy-network-endpoint"),
    nonce: digest("policy-deploy-nonce"),
    normalizedSqlDigest: digest("policy-normalized-sql"),
    operationId: "77777777-7777-4777-8777-777777777777",
    outboundKillSwitchEvidenceDigest: digest("policy-outbound-kill-switch"),
    perDatabaseCatalogDigest: planner.perDatabaseCatalogDigest,
    poolerDigest: digest("policy-pooler"),
    postgresMajorVersion: 16,
    predecessorChainDigest: digest("policy-predecessor-chain"),
    providerRecoveryEvidenceDigest: digest("policy-provider-recovery"),
    purpose: CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
    releaseSha: "c".repeat(40),
    roleBindingsDigest: planner.roleBindingsDigest,
    rollbackPlanDigest: digest("policy-rollback-plan"),
    runtimeConfigDigest: digest("policy-runtime-config"),
    serviceAccountMappingDigest: digest("policy-service-account-mapping"),
    tlsDigest: digest("policy-tls"),
    zeroDiffProofDigest: digest("policy-zero-diff"),
    ...bindingOverrides,
  };
  return signedAdmissionAuthorityFixture(
    CURRENT187_PRODUCTION_DEPLOY_GO_PURPOSE,
    binding,
  );
}

function semanticAllowlistFixture(
  attested,
  documentOverrides = {},
  bindingOverrides = {},
) {
  const planner = attested.plannerReceipt;
  const document = {
    approvedAt: "2026-08-05T09:00:00.000Z",
    clusterIdentityDigest: planner.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: planner.expectedDatabaseUniverseDigest,
    kind: CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_KIND,
    policyRevision: 1,
    profile: CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_PROFILE,
    reviewEvidenceDigest: digest("semantic-allowlist-review-evidence"),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticRiskFactsDigest: planner.semanticRiskFactsDigest,
    slice: CURRENT187_SEMANTIC_ALLOWLIST_SLICE,
    validUntil: "2026-08-06T09:00:00.000Z",
    ...documentOverrides,
  };
  const binding = {
    clusterIdentityDigest: document.clusterIdentityDigest,
    databaseUniverseDigest: document.databaseUniverseDigest,
    environment: "production",
    nonce: digest("semantic-allowlist-nonce"),
    operationId: "88888888-8888-4888-8888-888888888888",
    purpose: CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE,
    reviewEvidenceDigest: document.reviewEvidenceDigest,
    semanticAllowlistDocumentDigest:
      current187SemanticAllowlistDocumentDigest(document),
    semanticRiskFactsDigest: document.semanticRiskFactsDigest,
    ...bindingOverrides,
  };
  const authority = signedAdmissionAuthorityFixture(
    CURRENT187_SEMANTIC_ALLOWLIST_APPROVAL_PURPOSE,
    binding,
  );
  return {
    authority,
    document,
    receipt: evaluateCurrent187SemanticAllowlist(planner, document, authority),
  };
}

function persistSemanticApprovalForPolicy(receipt) {
  const bundle = createCurrent187SemanticApprovalConsumptionBundle(
    receipt,
    "2026-08-05T10:03:10.000Z",
  );
  const persistedBase = {
    approvalDigest: bundle.command.approvalDigest,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: bundle.commandDigest,
    consumedAt: "2026-08-05T10:03:11.000Z",
    documentDigest: bundle.command.documentDigest,
    evaluationDigest: bundle.command.evaluationDigest,
    kind: "CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_RECEIPT",
    nonce: bundle.command.nonce,
    noncanonical: true,
    operationId: bundle.command.operationId,
    persistedConsumptionVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    sharedBetaAccess: false,
    status: "CONSUMED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "41",
  };
  const persisted = {
    ...persistedBase,
    receiptDigest: domainDigest(
      "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_V1",
      current187AdmissionCanonicalJson(persistedBase),
    ),
  };
  return attachPersistedCurrent187SemanticApprovalConsumption(
    receipt,
    bundle,
    JSON.stringify(persisted),
  );
}

test("only a signed independent fence receipt can attest the exact branded acquisition", async () => {
  const { acquisition, attestation, attested } =
    await attestedAcquisitionFixture();

  assert.equal(acquisition.externalDdlFenceAttested, false);
  assert.equal(attested.externalDdlFenceAttested, true);
  assert.equal(attested.plannerReceipt.externalDdlFenceAttested, true);
  assert.equal(
    attested.preAttestationAcquisitionDigest,
    acquisition.acquisitionDigest,
  );
  assert.notEqual(attested.acquisitionDigest, acquisition.acquisitionDigest);
  assert.equal(attested.authorization, false);
  assert.equal(attested.canMutate, false);
  assert.equal(attested.canSend, false);
  assert.equal(attested.testAccessAuthorized, false);
  assert.equal(attested.sharedBetaAccess, false);
  assert.equal(attested.productionRootEnrolled, false);
  assert.equal(isVerifiedCurrent187ClusterAcquisitionReceipt(attested), true);
  assert.equal(
    isVerifiedCurrent187ClusterAcquisitionReceipt({ ...attested }),
    false,
  );
  assert.throws(() =>
    attachVerifiedCurrent187DdlFenceAttestationToAcquisition(
      { ...acquisition },
      attestation,
    ),
  );
});

test("signed deployment policy matches stable role, ACL, and multi-database catalog digests deny-only", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const authority = deploymentAuthorityFixture(attested);
  const semantic = semanticAllowlistFixture(attested);
  const persistedSemantic = persistSemanticApprovalForPolicy(semantic.receipt);
  const receipt = evaluateCurrent187ClusterPolicy(
    attested,
    authority,
    persistedSemantic,
  );

  assert.equal(receipt.policyStatus, "BINDINGS_MATCHED");
  assert.equal(receipt.policyBindingsMatched, true);
  assert.deepEqual(receipt.reasonCodes, []);
  assert.equal(receipt.externalDdlFenceAttested, true);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.deploymentGoConsumable, false);
  assert.equal(receipt.persistedConsumptionVerified, false);
  assert.equal(receipt.policyAllowlistEvaluated, true);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(
    receipt.sourceSemanticRiskFactsDigest,
    attested.plannerReceipt.semanticRiskFactsDigest,
  );
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(isVerifiedCurrent187ClusterPolicyReceipt(receipt), true);
  assert.equal(isVerifiedCurrent187ClusterPolicyReceipt({ ...receipt }), false);
  assert.equal(semantic.receipt.semanticAllowlistStatus, "MATCHED_DENY_ONLY");
  assert.equal(semantic.receipt.semanticAllowlistMatched, true);
  assert.equal(
    semantic.receipt.sourceAuthorityVerificationMode,
    "SYNTHETIC_LOOPBACK_CI",
  );
  assert.equal(
    semantic.receipt.sourceOperationId,
    "88888888-8888-4888-8888-888888888888",
  );
  assert.equal(
    semantic.receipt.sourceNonce,
    digest("semantic-allowlist-nonce"),
  );
  assert.equal(semantic.receipt.authorization, false);
  assert.equal(
    isVerifiedCurrent187SemanticAllowlistReceipt(semantic.receipt),
    true,
  );
});

test("CURRENT187-F and persisted J5-R4 compose into one branded deny-only successor", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const authority = deploymentAuthorityFixture(attested);
  const semantic = semanticAllowlistFixture(attested);
  const persistedSemantic = persistSemanticApprovalForPolicy(semantic.receipt);
  const policyReceipt = evaluateCurrent187ClusterPolicy(
    attested,
    authority,
    persistedSemantic,
  );
  const persistedProbe = persistedCurrent187J5ProbeFixture(attested);
  const probeBinding =
    bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persistedProbe,
      authority,
    );
  const successor = evaluateCurrent187ClusterPolicySuccessor(
    policyReceipt,
    probeBinding,
  );

  assert.equal(successor.kind, CURRENT187_CLUSTER_POLICY_SUCCESSOR_KIND);
  assert.equal(successor.profile, CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROFILE);
  assert.equal(successor.slice, CURRENT187_CLUSTER_POLICY_SUCCESSOR_SLICE);
  assert.equal(successor.status, "SUCCESSOR_BINDINGS_MATCHED_DENY_ONLY");
  assert.equal(successor.successorPolicyBindingsMatched, true);
  assert.equal(successor.legacyPolicyBindingsMatched, true);
  assert.equal(successor.connectionProbeBindingsMatched, true);
  assert.deepEqual(successor.reasonCodes, []);
  assert.equal(
    successor.sourceAuthorityPayloadDigest,
    authority.envelope.payloadDigest,
  );
  assert.equal(
    successor.sourcePolicyEvaluationDigest,
    policyReceipt.policyEvaluationDigest,
  );
  assert.equal(
    successor.sourceConnectionProbeDeployBindingDigest,
    probeBinding.connectionProbeDeployBindingDigest,
  );
  assert.equal(successor.authorization, false);
  assert.equal(successor.canApply, false);
  assert.equal(successor.canMutate, false);
  assert.equal(successor.canSend, false);
  assert.equal(successor.deploymentGoConsumable, false);
  assert.equal(successor.productionBindingSatisfied, false);
  assert.equal(successor.productionRootEnrolled, false);
  assert.equal(successor.productionRuntimeAttested, false);
  assert.equal(successor.testAccessAuthorized, false);
  assert.equal(successor.sharedBetaAccess, false);
  assert.equal(Object.isFrozen(successor), true);
  assert.equal(Object.isFrozen(successor.reasonCodes), true);
  assert.equal(
    isVerifiedCurrent187ClusterPolicySuccessorReceipt(successor),
    true,
  );
  assert.equal(
    isVerifiedCurrent187ClusterPolicySuccessorReceipt({ ...successor }),
    false,
  );
});

test("policy successor denies a different branded deployment authority and rejects clones", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const policyAuthority = deploymentAuthorityFixture(attested);
  const semantic = semanticAllowlistFixture(attested);
  const policyReceipt = evaluateCurrent187ClusterPolicy(
    attested,
    policyAuthority,
    persistSemanticApprovalForPolicy(semantic.receipt),
  );
  const persistedProbe = persistedCurrent187J5ProbeFixture(attested);
  const otherAuthority = deploymentAuthorityFixture(attested, {
    nonce: digest("policy-successor-other-authority"),
  });
  const otherProbeBinding =
    bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persistedProbe,
      otherAuthority,
    );
  const denied = evaluateCurrent187ClusterPolicySuccessor(
    policyReceipt,
    otherProbeBinding,
  );

  assert.equal(denied.status, "SUCCESSOR_BINDINGS_DENIED");
  assert.equal(denied.successorPolicyBindingsMatched, false);
  assert.deepEqual(denied.reasonCodes, [
    "CURRENT187_CLUSTER_POLICY_SUCCESSOR_AUTHORITY_MISMATCH",
  ]);
  assert.equal(denied.deploymentGoConsumable, false);
  assert.throws(
    () =>
      evaluateCurrent187ClusterPolicySuccessor(
        { ...policyReceipt },
        otherProbeBinding,
      ),
    (error) =>
      error?.reasonCode ===
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_POLICY_RECEIPT_INVALID",
  );
  assert.throws(
    () =>
      evaluateCurrent187ClusterPolicySuccessor(policyReceipt, {
        ...otherProbeBinding,
      }),
    (error) =>
      error?.reasonCode ===
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROBE_RECEIPT_INVALID",
  );
  assert.throws(
    () => evaluateCurrent187ClusterPolicySuccessor(policyReceipt),
    (error) =>
      error?.reasonCode ===
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_ARGUMENTS_INVALID",
  );

  let proxyTrapCalls = 0;
  const hostilePolicy = new Proxy(policyReceipt, {
    get() {
      proxyTrapCalls += 1;
      throw new Error("hostile getter must not run");
    },
  });
  assert.throws(
    () =>
      evaluateCurrent187ClusterPolicySuccessor(
        hostilePolicy,
        otherProbeBinding,
      ),
    (error) =>
      error?.reasonCode ===
      "CURRENT187_CLUSTER_POLICY_SUCCESSOR_POLICY_RECEIPT_INVALID",
  );
  assert.equal(proxyTrapCalls, 0);
});

test("policy successor preserves branded legacy-policy and probe-binding denials", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const semantic = semanticAllowlistFixture(attested);
  const persistedSemantic = persistSemanticApprovalForPolicy(semantic.receipt);
  const persistedProbe = persistedCurrent187J5ProbeFixture(attested);

  const policyDriftAuthority = deploymentAuthorityFixture(attested, {
    roleBindingsDigest: digest("successor-policy-role-binding-drift"),
  });
  const deniedPolicy = evaluateCurrent187ClusterPolicy(
    attested,
    policyDriftAuthority,
    persistedSemantic,
  );
  const matchingProbeBinding =
    bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persistedProbe,
      policyDriftAuthority,
    );
  const deniedByPolicy = evaluateCurrent187ClusterPolicySuccessor(
    deniedPolicy,
    matchingProbeBinding,
  );
  assert.deepEqual(deniedByPolicy.reasonCodes, [
    "CURRENT187_CLUSTER_POLICY_SUCCESSOR_LEGACY_POLICY_DENIED",
  ]);
  assert.equal(deniedByPolicy.successorPolicyBindingsMatched, false);

  const releaseDriftAuthority = deploymentAuthorityFixture(attested, {
    releaseSha: "d".repeat(40),
  });
  const matchedPolicy = evaluateCurrent187ClusterPolicy(
    attested,
    releaseDriftAuthority,
    persistedSemantic,
  );
  const deniedProbeBinding =
    bindPersistedCurrent187ConnectionProbeToDeploymentAuthority(
      persistedProbe,
      releaseDriftAuthority,
    );
  const deniedByProbe = evaluateCurrent187ClusterPolicySuccessor(
    matchedPolicy,
    deniedProbeBinding,
  );
  assert.deepEqual(deniedByProbe.reasonCodes, [
    "CURRENT187_CLUSTER_POLICY_SUCCESSOR_PROBE_BINDING_DENIED",
  ]);
  assert.equal(deniedByProbe.successorPolicyBindingsMatched, false);
  assert.equal(deniedByProbe.authorization, false);
  assert.equal(deniedByProbe.deploymentGoConsumable, false);
});

test("semantic approval ledger binds one-time consumption and scoped revocation deny-only", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const semantic = semanticAllowlistFixture(attested);
  const bundle = createCurrent187SemanticApprovalConsumptionBundle(
    semantic.receipt,
    "2026-08-05T10:03:10.000Z",
  );
  const [commandCanonicalJson, commandDigest] =
    current187SemanticApprovalLedgerDatabaseArguments(bundle);
  assert.equal(commandCanonicalJson, bundle.commandCanonicalJson);
  assert.equal(commandDigest, bundle.commandDigest);
  assert.equal(bundle.command.operationId, semantic.receipt.sourceOperationId);
  assert.equal(bundle.command.nonce, semantic.receipt.sourceNonce);
  assert.equal(bundle.command.syntheticVerification, true);
  assert.equal(bundle.command.environment, "ci");

  const persistedBase = {
    approvalDigest: bundle.command.approvalDigest,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest,
    consumedAt: "2026-08-05T10:03:11.000Z",
    documentDigest: bundle.command.documentDigest,
    evaluationDigest: bundle.command.evaluationDigest,
    kind: "CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_RECEIPT",
    nonce: bundle.command.nonce,
    noncanonical: true,
    operationId: bundle.command.operationId,
    persistedConsumptionVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: bundle.command.publicKeyFingerprint,
    sharedBetaAccess: false,
    status: "CONSUMED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "42",
  };
  const persisted = {
    ...persistedBase,
    receiptDigest: domainDigest(
      "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_V1",
      current187AdmissionCanonicalJson(persistedBase),
    ),
  };
  const attached = attachPersistedCurrent187SemanticApprovalConsumption(
    semantic.receipt,
    bundle,
    JSON.stringify(persisted),
  );
  assert.equal(attached.persistedConsumptionVerified, true);
  assert.equal(attached.authorization, false);
  assert.equal(attached.canApply, false);
  assert.equal(
    isVerifiedPersistedCurrent187SemanticApprovalReceipt(attached),
    true,
  );
  assert.equal(
    isVerifiedPersistedCurrent187SemanticApprovalReceipt({ ...attached }),
    false,
  );

  const revocation = createSyntheticCurrent187SemanticApprovalRevocationBundle(
    semantic.receipt,
    {
      actorDigest: digest("semantic-revocation-actor"),
      eventId: "99999999-9999-4999-8999-999999999999",
      explicitConfirmation:
        CURRENT187_SEMANTIC_APPROVAL_REVOCATION_CONFIRMATION,
      reasonDigest: digest("semantic-revocation-reason"),
      revokedAt: "2026-08-05T10:03:20.000Z",
      scope: "DOCUMENT",
    },
  );
  assert.equal(
    revocation.command.scopeDigest,
    semantic.receipt.sourceDocumentDigest,
  );
  const revocationBase = {
    approvalDigest: revocation.command.approvalDigest,
    authorization: false,
    canApply: false,
    canMutate: false,
    canSend: false,
    commandDigest: revocation.commandDigest,
    documentDigest: revocation.command.documentDigest,
    evaluationDigest: revocation.command.evaluationDigest,
    eventId: revocation.command.eventId,
    kind: "CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT",
    noncanonical: true,
    persistedRevocationVerified: true,
    productionRootEnrolled: false,
    publicKeyFingerprint: revocation.command.publicKeyFingerprint,
    revokedAt: revocation.command.revokedAt,
    scope: revocation.command.scope,
    scopeDigest: revocation.command.scopeDigest,
    sharedBetaAccess: false,
    status: "REVOKED",
    syntheticLoopbackCiOnly: true,
    testAccessAuthorized: false,
    transactionId: "43",
  };
  const revocationReceipt = {
    ...revocationBase,
    receiptDigest: domainDigest(
      "LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT_V1",
      current187AdmissionCanonicalJson(revocationBase),
    ),
  };
  const attachedRevocation =
    attachPersistedCurrent187SemanticApprovalRevocation(
      revocation,
      JSON.stringify(revocationReceipt),
    );
  assert.equal(
    isVerifiedPersistedCurrent187SemanticApprovalRevocationReceipt(
      attachedRevocation,
    ),
    true,
  );

  assert.throws(() =>
    createCurrent187SemanticApprovalConsumptionBundle(
      { ...semantic.receipt },
      "2026-08-05T10:03:10.000Z",
    ),
  );
  assert.throws(() =>
    createCurrent187SemanticApprovalConsumptionBundle(
      semantic.receipt,
      "2026-08-06T10:03:10.000Z",
    ),
  );
  assert.throws(() =>
    attachPersistedCurrent187SemanticApprovalConsumption(
      semantic.receipt,
      bundle,
      JSON.stringify({ ...persisted, commandDigest: digest("forged") }),
    ),
  );
  const otherSemantic = semanticAllowlistFixture(attested, {
    reviewEvidenceDigest: digest("other-valid-semantic-review"),
  });
  const otherBundle = createCurrent187SemanticApprovalConsumptionBundle(
    otherSemantic.receipt,
    "2026-08-05T10:03:10.000Z",
  );
  assert.throws(
    () =>
      attachPersistedCurrent187SemanticApprovalConsumption(
        semantic.receipt,
        otherBundle,
        "{}",
      ),
    /does not belong to the supplied semantic approval receipt/u,
  );
});

test("signed policy drift and cloned receipts fail closed", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const driftedAuthority = deploymentAuthorityFixture(attested, {
    roleBindingsDigest: digest("hostile-role-binding-drift"),
  });
  const semantic = semanticAllowlistFixture(attested);
  const persistedSemantic = persistSemanticApprovalForPolicy(semantic.receipt);
  const denied = evaluateCurrent187ClusterPolicy(
    attested,
    driftedAuthority,
    persistedSemantic,
  );
  assert.equal(denied.policyStatus, "DENIED");
  assert.equal(denied.policyBindingsMatched, false);
  assert.deepEqual(denied.reasonCodes, [
    "CURRENT187_CLUSTER_POLICY_ROLE_BINDINGS_MISMATCH",
  ]);
  assert.equal(denied.authorization, false);

  const exactAuthority = deploymentAuthorityFixture(attested);
  assert.throws(() =>
    evaluateCurrent187ClusterPolicy(
      { ...attested },
      exactAuthority,
      persistedSemantic,
    ),
  );
  assert.throws(() =>
    evaluateCurrent187ClusterPolicy(
      attested,
      { ...exactAuthority },
      persistedSemantic,
    ),
  );
  assert.throws(() =>
    evaluateCurrent187ClusterPolicy(attested, exactAuthority, {
      ...persistedSemantic,
    }),
  );
});

test("semantic allowlist drift is denied and cannot become deployment policy", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const semantic = semanticAllowlistFixture(attested, {
    semanticRiskFactsDigest: digest("hostile-semantic-facts-drift"),
  });
  assert.equal(semantic.receipt.semanticAllowlistStatus, "DENIED");
  assert.equal(semantic.receipt.semanticAllowlistMatched, false);
  assert.deepEqual(semantic.receipt.reasonCodes, [
    "CURRENT187_SEMANTIC_ALLOWLIST_FACTS_DIGEST_MISMATCH",
  ]);

  assert.throws(
    () =>
      evaluateCurrent187ClusterPolicy(
        attested,
        deploymentAuthorityFixture(attested),
        semantic.receipt,
      ),
    /one-time persisted semantic approval/u,
  );
});

test("semantic allowlist document, authority, timeline, and brands fail closed", async () => {
  const { attested } = await attestedAcquisitionFixture();
  const baseline = semanticAllowlistFixture(attested);
  const reviewDrift = semanticAllowlistFixture(
    attested,
    {},
    {
      reviewEvidenceDigest: digest("hostile-independent-review-drift"),
    },
  );
  assert.deepEqual(reviewDrift.receipt.reasonCodes, [
    "CURRENT187_SEMANTIC_ALLOWLIST_REVIEW_EVIDENCE_MISMATCH",
  ]);

  const inactive = semanticAllowlistFixture(attested, {
    approvedAt: "2026-08-05T08:00:00.000Z",
    validUntil: "2026-08-05T09:30:00.000Z",
  });
  assert.deepEqual(inactive.receipt.reasonCodes, [
    "CURRENT187_SEMANTIC_ALLOWLIST_DOCUMENT_INACTIVE",
  ]);

  assert.throws(() =>
    evaluateCurrent187SemanticAllowlist(
      { ...attested.plannerReceipt },
      baseline.document,
      baseline.authority,
    ),
  );
  assert.throws(() =>
    evaluateCurrent187SemanticAllowlist(
      attested.plannerReceipt,
      { ...baseline.document, extra: true },
      baseline.authority,
    ),
  );
  assert.throws(() =>
    evaluateCurrent187SemanticAllowlist(
      attested.plannerReceipt,
      baseline.document,
      { ...baseline.authority },
    ),
  );

  let getterCalls = 0;
  const accessor = { ...baseline.document };
  Object.defineProperty(accessor, "clusterIdentityDigest", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return baseline.document.clusterIdentityDigest;
    },
  });
  assert.throws(() => current187SemanticAllowlistDocumentDigest(accessor));
  assert.equal(getterCalls, 0);
  assert.throws(() =>
    current187SemanticAllowlistDocumentDigest(
      new Proxy(baseline.document, {
        ownKeys() {
          throw new Error("proxy trap must not become policy input");
        },
      }),
    ),
  );
});

test("unknown initial database fails before any per-database scan", async () => {
  const hostile = {
    ...DATABASES.app,
    name: "hostile_second_ci",
    oid: 22_222,
  };
  const { dependencies, logs } = fakeDependencies({
    initialUniverse: [...BASE_UNIVERSE, hostile],
  });
  const receipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    dependencies,
  );
  assert.equal(receipt.acquisitionStatus, "DENIED");
  assert.deepEqual(receipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_INITIAL_UNIVERSE_MISMATCH",
  ]);
  assert.equal(receipt.plannerReceipt, null);
  assert.deepEqual(logs.connectLog, [DATABASES.app.name]);
});

test("final same-name OID replacement is denied by the pure planner", async () => {
  const finalUniverse = BASE_UNIVERSE.map((database) =>
    database.name === DATABASES.postgres.name
      ? { ...database, oid: database.oid + 100 }
      : database,
  );
  const { dependencies } = fakeDependencies({ finalUniverse });
  const receipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    dependencies,
  );
  assert.equal(receipt.acquisitionStatus, "DENIED");
  assert.equal(receipt.liveClusterScanAcquired, false);
  assert.ok(
    receipt.plannerReceipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_CONCURRENT_CATALOG_DRIFT",
    ),
  );
});

test("catalog query error and timeout become secret-free fail-closed receipts", async () => {
  const failed = fakeDependencies({
    throwPattern: /current187:surface:default_acl_all_grantees/u,
  });
  const failedReceipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    failed.dependencies,
  );
  assert.deepEqual(failedReceipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_UNREAD_OR_PARTIAL",
  ]);
  assert.doesNotMatch(JSON.stringify(failedReceipt), /unsafe provider detail/u);

  const timedRequest = baseRequest();
  timedRequest.syntheticContext.statementTimeoutMs = 5;
  const timed = fakeDependencies({
    neverResolvePattern: /current187:surface:rls_policies/u,
  });
  const timedReceipt = await acquireCurrent187ClusterInventory(
    timedRequest,
    timed.dependencies,
  );
  assert.deepEqual(timedReceipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_TIMEOUT",
  ]);
  assert.equal(timedReceipt.authorization, false);
  assert.ok(timed.logs.closeLog.length >= 1);
});

test("remote backend, superuser scanner, and identity drift fail closed", async () => {
  const remote = fakeDependencies({
    initialControlOverrides: { serverAddress: "10.0.0.8" },
  });
  const remoteReceipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    remote.dependencies,
  );
  assert.deepEqual(remoteReceipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_BACKEND_ADDRESS_NOT_LOOPBACK",
  ]);

  const superuser = fakeDependencies({
    initialControlOverrides: { scannerSuperuser: true },
  });
  const superuserReceipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    superuser.dependencies,
  );
  assert.deepEqual(superuserReceipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_SCANNER_ATTRIBUTES_DENIED",
  ]);

  const drift = fakeDependencies({
    finalControlOverrides: { systemIdentifier: "7412345678901234568" },
  });
  const driftReceipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    drift.dependencies,
  );
  assert.deepEqual(driftReceipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_CONTROL_IDENTITY_DRIFT",
  ]);
});

test("non-connectable non-template baseline fails instead of silently skipping", async () => {
  const request = baseRequest();
  const archive = {
    ...DATABASES.app,
    datallowconn: false,
    name: "archive_ci",
    oid: 23_000,
  };
  request.expectedCatalog.nonTemplateDatabases.push(archive);
  const { dependencies, logs } = fakeDependencies({
    initialUniverse: [...BASE_UNIVERSE, archive],
  });
  const receipt = await acquireCurrent187ClusterInventory(
    request,
    dependencies,
  );
  assert.deepEqual(receipt.reasonCodes, [
    "CURRENT187_CLUSTER_ACQUISITION_NON_CONNECTABLE_DATABASE_UNREAD",
  ]);
  assert.deepEqual(logs.connectLog, [DATABASES.app.name]);
});

test("production, remote context, wrong confirmation, and system control DB are denied before I/O", async () => {
  const variants = [
    (request) => {
      request.syntheticContext.environment = "production";
    },
    (request) => {
      request.syntheticContext.endpointHost = "db.example.com";
    },
    (request) => {
      request.syntheticContext.explicitConfirmation = "wrong";
    },
    (request) => {
      request.syntheticContext.databaseName = "postgres";
    },
  ];
  for (const mutate of variants) {
    const request = baseRequest();
    mutate(request);
    const { dependencies, logs } = fakeDependencies();
    await assert.rejects(
      acquireCurrent187ClusterInventory(request, dependencies),
      /loopback CI|restricted to explicit/u,
    );
    assert.deepEqual(logs.connectLog, []);
  }
});

test("external fence must remain an explicitly unverified declaration", async () => {
  const request = baseRequest();
  request.externalDdlFenceReceipt.attestationStatus = "ATTESTED";
  const { dependencies, logs } = fakeDependencies();
  await assert.rejects(
    acquireCurrent187ClusterInventory(request, dependencies),
    /cannot claim an internally acquired DDL fence/u,
  );
  assert.deepEqual(logs.connectLog, []);
});

test("catalog contents can contain sensitive text but receipts expose only digests", async () => {
  const marker = "person@example.com password=top-secret token=abc";
  const { dependencies } = fakeDependencies({ surfacePayload: marker });
  const receipt = await acquireCurrent187ClusterInventory(
    baseRequest(),
    dependencies,
  );
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /person@example\.com/u);
  assert.doesNotMatch(serialized, /top-secret/u);
  assert.doesNotMatch(serialized, /token=abc/u);
});

test("stable policy digests are scoped to role, current ACL, and default ACL surfaces", async () => {
  const acquire = async (surfacePayloadByName = {}) => {
    const { dependencies } = fakeDependencies({ surfacePayloadByName });
    return acquireCurrent187ClusterInventory(baseRequest(), dependencies);
  };
  const baseline = await acquire();
  const roleDrift = await acquire({ roles: "changed-role-policy" });
  const currentAclDrift = await acquire({
    relation_acl_all_grantees: "changed-current-acl-policy",
  });
  const defaultAclDrift = await acquire({
    default_acl_all_grantees: "changed-default-acl-policy",
  });
  const baselinePlan = baseline.plannerReceipt;

  assert.notEqual(
    roleDrift.plannerReceipt.roleBindingsDigest,
    baselinePlan.roleBindingsDigest,
  );
  assert.equal(
    roleDrift.plannerReceipt.currentAclPolicyDigest,
    baselinePlan.currentAclPolicyDigest,
  );
  assert.equal(
    roleDrift.plannerReceipt.defaultAclPolicyDigest,
    baselinePlan.defaultAclPolicyDigest,
  );

  assert.notEqual(
    currentAclDrift.plannerReceipt.currentAclPolicyDigest,
    baselinePlan.currentAclPolicyDigest,
  );
  assert.equal(
    currentAclDrift.plannerReceipt.roleBindingsDigest,
    baselinePlan.roleBindingsDigest,
  );
  assert.equal(
    currentAclDrift.plannerReceipt.defaultAclPolicyDigest,
    baselinePlan.defaultAclPolicyDigest,
  );

  assert.notEqual(
    defaultAclDrift.plannerReceipt.defaultAclPolicyDigest,
    baselinePlan.defaultAclPolicyDigest,
  );
  assert.equal(
    defaultAclDrift.plannerReceipt.roleBindingsDigest,
    baselinePlan.roleBindingsDigest,
  );
  assert.equal(
    defaultAclDrift.plannerReceipt.currentAclPolicyDigest,
    baselinePlan.currentAclPolicyDigest,
  );
  for (const changed of [roleDrift, currentAclDrift, defaultAclDrift]) {
    assert.notEqual(
      changed.plannerReceipt.perDatabaseCatalogDigest,
      baselinePlan.perDatabaseCatalogDigest,
    );
    assert.notEqual(
      changed.plannerReceipt.clusterCatalogDigest,
      baselinePlan.clusterCatalogDigest,
    );
    assert.notEqual(
      changed.plannerReceipt.semanticRiskFactsDigest,
      baselinePlan.semanticRiskFactsDigest,
    );
  }
});

test("SQL catalog is exhaustive by contract and every executable statement is read-only", () => {
  assert.ok(CURRENT187_PER_DATABASE_CATALOG_SURFACES.length >= 20);
  const names = new Set(
    CURRENT187_PER_DATABASE_CATALOG_SURFACES.map((surface) => surface.name),
  );
  for (const required of [
    "roles",
    "memberships",
    "roleDatabaseSettings",
    "ownedObjects",
    "databaseSecurity",
    "schemaAclAllGrantees",
    "relationAclAllGrantees",
    "columnAclAllGrantees",
    "routineAclAllGrantees",
    "defaultAclAllGrantees",
    "rlsPolicies",
    "triggersAndDefinitions",
    "constraintsAndDefinitions",
    "indexesAndDefinitions",
    "effectiveObjectPrivileges",
  ]) {
    assert.ok(names.has(required), required);
  }
  for (const sql of [
    CURRENT187_CONTROL_IDENTITY_SQL,
    CURRENT187_BACKEND_IDENTITY_SQL,
    CURRENT187_DATABASE_SNAPSHOT_SQL,
    ...CURRENT187_PER_DATABASE_CATALOG_SURFACES.map((surface) => surface.sql),
  ]) {
    const normalized = sql.replace(/\/\*[\s\S]*?\*\//gu, "").trimStart();
    assert.match(normalized, /^(?:SELECT|WITH)\b/u);
    assert.doesNotMatch(
      normalized,
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\s+(?:TABLE|INTO|FROM|DATABASE|ROLE|SCHEMA|FUNCTION|PROCEDURE)?/iu,
    );
  }
});

test("adapter has no URL, password, provider, tenant, invite, or outbound integration", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-acquisition-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:DATABASE_URL|postgresql:\/\/|password|smtp|providerPayload|secretManager)/iu,
  );
  assert.doesNotMatch(source, /(?:tenant|invite|tester|fetch\s*\()/iu);

  const policySource = await readFile(
    new URL("./identity-mail-cluster-policy-current187.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    policySource,
    /(?:node:fs|node:child_process|DATABASE_URL|postgresql:\/\/|password|smtp|providerPayload|secretManager|fetch\s*\(|process\.env)/iu,
  );
  assert.doesNotMatch(policySource, /(?:tenant|invite|tester)/iu);

  const successorSource = await readFile(
    new URL(
      "./identity-mail-cluster-policy-successor-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    successorSource,
    /(?:node:fs|node:child_process|node:net|node:tls|DATABASE_URL|postgresql:\/\/|password|smtp|providerPayload|secretManager|fetch\s*\(|process\.env)/iu,
  );
  assert.doesNotMatch(successorSource, /(?:tenant|invite|tester)/iu);
  assert.doesNotMatch(
    successorSource,
    /(?:authorization|canApply|canMutate|canSend|deploymentGoConsumable|productionBindingSatisfied|productionRootEnrolled|productionRuntimeAttested|sharedBetaAccess|testAccessAuthorized):\s*true/u,
  );

  const allowlistSource = await readFile(
    new URL(
      "./identity-mail-cluster-semantic-allowlist-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    allowlistSource,
    /(?:node:fs|node:child_process|DATABASE_URL|postgresql:\/\/|password|smtp|providerPayload|secretManager|fetch\s*\(|process\.env)/iu,
  );
  assert.doesNotMatch(allowlistSource, /(?:tenant|invite|tester)/iu);
});
