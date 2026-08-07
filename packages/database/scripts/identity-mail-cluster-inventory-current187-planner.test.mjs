import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CLUSTER_IDENTITY_DIGEST_DOMAIN,
  CURRENT187_CLUSTER_INVENTORY_KIND,
  CURRENT187_CLUSTER_INVENTORY_PROFILE,
  CURRENT187_CLUSTER_INVENTORY_SLICE,
  CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN,
  isVerifiedCurrent187ClusterInventoryReceipt,
  planCurrent187ClusterInventoryAdmission,
} from "./identity-mail-cluster-inventory-current187-planner.mjs";

const DIGESTS = Object.freeze({
  catalogApp: "1".repeat(64),
  catalogPostgres: "2".repeat(64),
  clusterFence: "3".repeat(64),
  endpoint: "4".repeat(64),
  scanApp: "5".repeat(64),
  scanPostgres: "6".repeat(64),
  topology: "7".repeat(64),
});

const CLUSTER_IDENTITY = Object.freeze({
  catalogVersionNo: 202307071,
  controlVersion: 1300,
  endpointDigest: DIGESTS.endpoint,
  serverVersionNum: 160_009,
  systemIdentifier: "7412345678901234567",
  topologyDigest: DIGESTS.topology,
});

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
    ownerName: "leetplus_database_owner",
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

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function clusterIdentityDigest() {
  return digest(CURRENT187_CLUSTER_IDENTITY_DIGEST_DOMAIN, CLUSTER_IDENTITY);
}

function databaseIdentityDigest(database) {
  return digest(CURRENT187_DATABASE_UNIVERSE_DIGEST_DOMAIN, database);
}

function scanFor(database, overrides = {}) {
  const isConnected = database.datallowconn;
  return {
    catalogDigest: isConnected
      ? database.name === "postgres"
        ? DIGESTS.catalogPostgres
        : DIGESTS.catalogApp
      : null,
    catalogSurfaceStatus: isConnected
      ? "COMPLETE"
      : "NOT_READ_NON_CONNECTABLE_ALLOWLIST",
    clusterIdentityDigest: clusterIdentityDigest(),
    completedAt: "2026-08-05T10:02:00.000Z",
    connectionStatus: isConnected ? "CONNECTED" : "NON_CONNECTABLE_PROVEN",
    databaseIdentityDigest: databaseIdentityDigest(database),
    databaseName: database.name,
    databaseOid: database.oid,
    ddlFenceDigest: DIGESTS.clusterFence,
    scanEvidenceDigest:
      database.name === "postgres" ? DIGESTS.scanPostgres : DIGESTS.scanApp,
    startedAt: "2026-08-05T10:01:00.000Z",
    ...overrides,
  };
}

function baseRequest() {
  const databaseUniverse = [
    DATABASES.template1,
    DATABASES.app,
    DATABASES.postgres,
    DATABASES.template0,
  ];
  return {
    clusterIdentity: { ...CLUSTER_IDENTITY },
    contract: CURRENT187_ADMISSION_CONTRACT,
    ddlFence: {
      active: true,
      clusterDdlBlocked: true,
      creatorPrincipalsDisabled: true,
      databaseDdlBlocked: true,
      evidenceDigest: DIGESTS.clusterFence,
      fenceEpoch: "7",
      migrationPrincipalsDisabled: true,
      validFrom: "2026-08-05T10:00:00.000Z",
      validUntil: "2026-08-05T10:10:00.000Z",
    },
    environment: "ci",
    evaluatedAt: "2026-08-05T10:04:00.000Z",
    expectedCatalog: {
      catalogRowsComplete: true,
      nonTemplateDatabases: [DATABASES.app, DATABASES.postgres],
      templateDatabases: [DATABASES.template1, DATABASES.template0],
    },
    finalCatalogSnapshot: {
      capturedAt: "2026-08-05T10:03:00.000Z",
      catalogRowsComplete: true,
      clusterIdentityDigest: clusterIdentityDigest(),
      databases: databaseUniverse.map((entry) => ({ ...entry })),
      ddlFenceDigest: DIGESTS.clusterFence,
      snapshotKind: "FINAL",
    },
    initialCatalogSnapshot: {
      capturedAt: "2026-08-05T10:00:30.000Z",
      catalogRowsComplete: true,
      clusterIdentityDigest: clusterIdentityDigest(),
      databases: [...databaseUniverse].reverse().map((entry) => ({ ...entry })),
      ddlFenceDigest: DIGESTS.clusterFence,
      snapshotKind: "INITIAL",
    },
    kind: CURRENT187_CLUSTER_INVENTORY_KIND,
    perDatabaseScans: [scanFor(DATABASES.postgres), scanFor(DATABASES.app)],
    profile: CURRENT187_CLUSTER_INVENTORY_PROFILE,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    slice: CURRENT187_CLUSTER_INVENTORY_SLICE,
  };
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function plan(overrides = {}) {
  return planCurrent187ClusterInventoryAdmission({
    ...baseRequest(),
    ...overrides,
  });
}

test("matched exhaustive projection still returns an immutable deny-only receipt", () => {
  const receipt = plan();
  assert.equal(receipt.inventoryStatus, "MATCHED");
  assert.equal(receipt.inventoryProjectionMatched, true);
  assert.equal(receipt.nonTemplateDatabaseCount, 2);
  assert.equal(receipt.templateDatabaseCount, 2);
  assert.equal(receipt.perDatabaseScanCount, 2);
  assert.deepEqual(receipt.reasonCodes, []);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.persistedConsumptionVerified, false);
  assert.equal(receipt.liveClusterScanVerified, false);
  assert.equal(receipt.externalDdlFenceAttested, false);
  assert.equal(receipt.sourceIoPerformed, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.reasonCodes), true);
  assert.equal(isVerifiedCurrent187ClusterInventoryReceipt(receipt), true);
  assert.equal(
    isVerifiedCurrent187ClusterInventoryReceipt({ ...receipt }),
    false,
  );
});

test("digests are stable across caller array ordering", () => {
  const first = plan();
  const reordered = baseRequest();
  reordered.expectedCatalog.nonTemplateDatabases.reverse();
  reordered.expectedCatalog.templateDatabases.reverse();
  reordered.finalCatalogSnapshot.databases.reverse();
  reordered.initialCatalogSnapshot.databases.reverse();
  reordered.perDatabaseScans.reverse();
  const second = planCurrent187ClusterInventoryAdmission(reordered);
  assert.equal(second.inventoryStatus, "MATCHED");
  assert.equal(second.planDigest, first.planDigest);
  assert.equal(
    second.expectedDatabaseUniverseDigest,
    first.expectedDatabaseUniverseDigest,
  );
  assert.equal(second.perDatabaseScanSetDigest, first.perDatabaseScanSetDigest);
});

test("an unknown non-template database fails closed even when both snapshots contain it", () => {
  const request = baseRequest();
  const hostile = {
    ...DATABASES.app,
    name: "hostile_second_ci",
    oid: 20_001,
  };
  request.initialCatalogSnapshot.databases.push(hostile);
  request.finalCatalogSnapshot.databases.push(hostile);
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.equal(receipt.inventoryStatus, "DENIED");
  assert.equal(receipt.inventoryProjectionMatched, false);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_UNKNOWN_DATABASE",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_EXPECTED_BASELINE_MISMATCH",
    ),
  );
});

test("a missing allowlisted database fails closed", () => {
  const request = baseRequest();
  request.initialCatalogSnapshot.databases =
    request.initialCatalogSnapshot.databases.filter(
      (database) => database.name !== DATABASES.app.name,
    );
  request.finalCatalogSnapshot.databases =
    request.finalCatalogSnapshot.databases.filter(
      (database) => database.name !== DATABASES.app.name,
    );
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_MISSING_DATABASE",
    ),
  );
  assert.equal(receipt.authorization, false);
});

test("a partial cluster snapshot and partial per-database scan fail closed", () => {
  const request = baseRequest();
  request.initialCatalogSnapshot.catalogRowsComplete = false;
  request.perDatabaseScans = [scanFor(DATABASES.postgres)];
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_PARTIAL_CLUSTER_SNAPSHOT",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_PARTIAL_DATABASE_SCAN",
    ),
  );
});

test("concurrent catalog drift and same-name OID replacement fail closed", () => {
  const request = baseRequest();
  request.finalCatalogSnapshot.databases =
    request.finalCatalogSnapshot.databases.map((database) =>
      database.name === DATABASES.app.name
        ? { ...database, oid: database.oid + 100 }
        : database,
    );
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_CONCURRENT_CATALOG_DRIFT",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_UNKNOWN_DATABASE",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_MISSING_DATABASE",
    ),
  );
});

test("owner and template policy drift are part of the exact baseline", () => {
  const ownerDrift = baseRequest();
  ownerDrift.finalCatalogSnapshot.databases =
    ownerDrift.finalCatalogSnapshot.databases.map((database) =>
      database.name === DATABASES.postgres.name
        ? { ...database, ownerOid: 42 }
        : database,
    );
  assert.ok(
    planCurrent187ClusterInventoryAdmission(ownerDrift).reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_CONCURRENT_CATALOG_DRIFT",
    ),
  );

  const templateDrift = baseRequest();
  templateDrift.finalCatalogSnapshot.databases =
    templateDrift.finalCatalogSnapshot.databases.map((database) =>
      database.name === DATABASES.template0.name
        ? { ...database, datallowconn: true }
        : database,
    );
  const receipt = planCurrent187ClusterInventoryAdmission(templateDrift);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_EXPECTED_BASELINE_MISMATCH",
    ),
  );
});

test("unread catalog for a connectable database fails closed", () => {
  const request = baseRequest();
  request.perDatabaseScans = request.perDatabaseScans.map((scan) =>
    scan.databaseName === DATABASES.app.name
      ? {
          ...scan,
          catalogDigest: null,
          catalogSurfaceStatus: "NOT_READ_NON_CONNECTABLE_ALLOWLIST",
          connectionStatus: "NON_CONNECTABLE_PROVEN",
        }
      : scan,
  );
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes("CURRENT187_CLUSTER_INVENTORY_UNREAD_CATALOG"),
  );
});

test("an explicitly allowlisted non-connectable non-template database is not silently skipped", () => {
  const request = baseRequest();
  const archive = {
    ...DATABASES.app,
    datallowconn: false,
    name: "archive_ci",
    oid: 20_002,
  };
  request.expectedCatalog.nonTemplateDatabases.push(archive);
  request.initialCatalogSnapshot.databases.push(archive);
  request.finalCatalogSnapshot.databases.push(archive);
  request.perDatabaseScans.push(
    scanFor(archive, { scanEvidenceDigest: "8".repeat(64) }),
  );
  const matched = planCurrent187ClusterInventoryAdmission(request);
  assert.equal(matched.inventoryStatus, "MATCHED");

  request.perDatabaseScans = request.perDatabaseScans.filter(
    (scan) => scan.databaseName !== archive.name,
  );
  const skipped = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    skipped.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_PARTIAL_DATABASE_SCAN",
    ),
  );
});

test("cluster binding, fence status, and scan timeline mismatches fail closed", () => {
  const request = baseRequest();
  request.finalCatalogSnapshot.clusterIdentityDigest = "9".repeat(64);
  request.ddlFence.databaseDdlBlocked = false;
  request.perDatabaseScans[0].completedAt = "2026-08-05T10:09:00.000Z";
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_CLUSTER_IDENTITY_MISMATCH",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_DDL_FENCE_OR_TIMELINE_INVALID",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_SCAN_TIMELINE_INVALID",
    ),
  );
});

test("scan identity and unknown scan rows fail closed", () => {
  const request = baseRequest();
  request.perDatabaseScans[0].databaseIdentityDigest = "a".repeat(64);
  request.perDatabaseScans.push({
    ...scanFor(DATABASES.app),
    databaseName: "unlisted_scan_ci",
    databaseOid: 24_000,
    scanEvidenceDigest: "b".repeat(64),
  });
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_SCAN_IDENTITY_MISMATCH",
    ),
  );
  assert.ok(
    receipt.reasonCodes.includes(
      "CURRENT187_CLUSTER_INVENTORY_UNKNOWN_DATABASE_SCAN",
    ),
  );
});

test("malformed shape, accessor, proxy, symbol, and production discriminator are rejected", () => {
  const extra = baseRequest();
  extra.connectionUrl = "postgresql://should-never-be-accepted";
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(extra),
    /exact and data-only/u,
  );

  const accessor = baseRequest();
  Object.defineProperty(accessor.clusterIdentity, "systemIdentifier", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(accessor),
    /exact and data-only/u,
  );

  const proxy = new Proxy(baseRequest(), {});
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(proxy),
    /exact and data-only/u,
  );

  const symbol = baseRequest();
  symbol.expectedCatalog.nonTemplateDatabases[Symbol("hidden")] = true;
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(symbol),
    /dense data-only array/u,
  );

  const production = baseRequest();
  production.environment = "production";
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(production),
    /contract discriminator/u,
  );

  const oversized = baseRequest();
  oversized.perDatabaseScans = new Array(1_025);
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(oversized),
    /dense data-only array/u,
  );

  const invalidSystemIdentifier = baseRequest();
  invalidSystemIdentifier.clusterIdentity.systemIdentifier =
    "18446744073709551616";
  assert.throws(
    () => planCurrent187ClusterInventoryAdmission(invalidSystemIdentifier),
    /cluster identity contains an invalid/u,
  );
});

test("receipt is PII/secret-free and never echoes catalog identifiers", () => {
  const request = baseRequest();
  request.clusterIdentity.systemIdentifier = "7999999999999999999";
  request.expectedCatalog.nonTemplateDatabases[0] = {
    ...request.expectedCatalog.nonTemplateDatabases[0],
    name: "private_database_ci",
  };
  request.initialCatalogSnapshot.databases =
    request.initialCatalogSnapshot.databases.map((database) =>
      database.name === DATABASES.app.name
        ? { ...database, name: "private_database_ci" }
        : database,
    );
  request.finalCatalogSnapshot.databases =
    request.finalCatalogSnapshot.databases.map((database) =>
      database.name === DATABASES.app.name
        ? { ...database, name: "private_database_ci" }
        : database,
    );
  request.perDatabaseScans = request.perDatabaseScans.map((scan) =>
    scan.databaseName === DATABASES.app.name
      ? {
          ...scan,
          databaseIdentityDigest: databaseIdentityDigest({
            ...DATABASES.app,
            name: "private_database_ci",
          }),
          databaseName: "private_database_ci",
        }
      : scan,
  );
  const serialized = JSON.stringify(
    planCurrent187ClusterInventoryAdmission(request),
  );
  assert.doesNotMatch(serialized, /private_database_ci/u);
  assert.doesNotMatch(serialized, /7999999999999999999/u);
  assert.doesNotMatch(
    serialized,
    /(?:password|token|ciphertext|postgresql:\/\/|@example\.com)/iu,
  );
});

test("pure planner source has no filesystem, database, network, provider, or runtime-env I/O", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-inventory-current187-planner.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /from\s+["']node:(?:fs|net|http|https|tls|dns)/u);
  assert.doesNotMatch(source, /from\s+["'](?:pg|@prisma|@nestjs)/u);
  assert.doesNotMatch(source, /\b(?:fetch|PrismaClient|process\.env)\b/u);
  assert.doesNotMatch(source, /(?:smtp|providerPayload|secretManager)/iu);
});

test("caller mutation after planning cannot alter the receipt or its digest", () => {
  const request = baseRequest();
  const receipt = planCurrent187ClusterInventoryAdmission(request);
  const before = jsonClone(receipt);
  request.clusterIdentity.systemIdentifier = "7111111111111111111";
  request.perDatabaseScans[0].catalogDigest = "f".repeat(64);
  assert.deepEqual(receipt, before);
});
