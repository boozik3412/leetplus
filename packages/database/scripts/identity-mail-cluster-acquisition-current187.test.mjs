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
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
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

const DIGESTS = Object.freeze({
  fence: "1".repeat(64),
  topology: "2".repeat(64),
});

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
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
          return [
            {
              evidence: JSON.stringify({
                database: databaseName,
                payload:
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

test("only a signed independent fence receipt can attest the exact branded acquisition", async () => {
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
});
