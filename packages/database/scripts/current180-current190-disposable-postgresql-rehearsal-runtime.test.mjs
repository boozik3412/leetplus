import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { Prisma } from "@prisma/client";

import {
  CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
  assembleCurrent180Current190InMemoryArtifact,
  inspectCurrent180Current190DisposableReleaseAssembly,
} from "./current180-current190-disposable-release-assembler.mjs";

import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
  buildCurrent180Current190PostgresqlRehearsalChildEnvironment,
  buildCurrent180Current190PostgresqlRehearsalOwnershipMarker,
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
import {
  createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly,
  issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";
import {
  cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
  materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly,
  verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-materializer.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES,
  buildCurrent180Current190PostgresqlCreateDatabaseSql,
} from "./current180-current190-disposable-postgresql-rehearsal-sql.mjs";
import {
  CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
  Current180Current190DisposablePostgresqlRehearsalRuntimeError,
  createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapter,
  createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapterForTestOnly,
  runCurrent180Current190IsolatedCommonJsMainSpawnForTestOnly,
  runCurrent180Current190IsolatedNodeSpawnForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-runtime.mjs";

const NODE_SHA256 =
  "39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636";
const PRISMA_SHA256 =
  "c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0";
const RUN_TOKEN = "1".repeat(32);
const AUTHORIZATION_DIGEST = "a".repeat(64);
const JOURNAL_DIGEST = "b".repeat(64);
const ADAPTER_KEYS = [
  "acquireClusterLock",
  "attestExecutableRuntime",
  "cleanup",
  "contract",
  "deploy",
  "executeStatement",
  "liveQuery",
  "releaseClusterLock",
];
let assembledArtifactPromise;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function filesystemIdentity(value) {
  return { dev: String(value.dev), ino: String(value.ino) };
}

async function assembledArtifact() {
  assembledArtifactPromise ??= (async () => {
    const inspection =
      await inspectCurrent180Current190DisposableReleaseAssembly();
    assert.equal(inspection.verified, true);
    return assembleCurrent180Current190InMemoryArtifact({
      allowContract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT,
      assemblyPlanDigest: inspection.assemblyPlanDigest,
    });
  })();
  return assembledArtifactPromise;
}

async function freshDeployMaterialization(testContext) {
  const authority =
    createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly();
  const binding =
    await issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
      authority,
      {
        authorizationReceiptDigest: AUTHORIZATION_DIGEST,
        runToken: RUN_TOKEN,
      },
    );
  const materialization =
    await materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      await assembledArtifact(),
      authority,
      binding,
    );
  testContext.after(async () => {
    await cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
      materialization,
    ).catch(() => undefined);
  });
  const verification =
    await verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly(
      materialization,
    );
  return { materialization, verification };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

function environment(extra = {}) {
  return deepFreeze({
    CURRENT180_CURRENT190_PG_REHEARSAL_CONFIRM:
      "run-current180-current190-disposable-postgresql16-rehearsal",
    CURRENT180_CURRENT190_PG_REHEARSAL_PROFILE: "local-pinned",
    [CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT]:
      "postgresql://postgres@127.0.0.1:55432/leetplus_current179_ci?schema=public",
    NODE_ENV: "test",
    ...extra,
  });
}

function context() {
  const names =
    deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(RUN_TOKEN);
  return {
    attest: deepFreeze({
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      journalRecordDigest: JOURNAL_DIGEST,
      names,
      runToken: RUN_TOKEN,
    }),
    names,
  };
}

function catalogRow(overrides = {}) {
  return {
    activeSessionCount: 0,
    allowConnections: false,
    databaseName: `lp_imtec_${RUN_TOKEN}_ci`,
    databaseOid: 777,
    isTemplate: false,
    marker: null,
    ownerName: "postgres",
    ownerOid: 10,
    ...overrides,
  };
}

function runOwnershipMarkers() {
  return [1, 2].map((attempt) =>
    buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
      attempt,
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      runToken: RUN_TOKEN,
    }),
  );
}

function testHarness() {
  const runtime = {
    catalog: [],
    clusterResidueCount: 0,
    clusterResidueMarkers: null,
    clusterResidueSql: null,
    connectedClients: 0,
    ddlCount: 0,
    disconnectedClients: 0,
    executable: {
      nodeExecutablePath: resolve("fixtures", "node.exe"),
      nodeExecutableSha256: NODE_SHA256,
      prismaExecutablePath: resolve("fixtures", "prisma", "build", "index.js"),
      prismaExecutableSha256: PRISMA_SHA256,
    },
    lockAcquired: true,
    lockHeld: false,
    lockStatusFailureCount: 0,
    maintenancePid: 4_100,
    queryResults: new Map(),
    responseLostAfterDdl: false,
    spawnError: null,
    spawnCount: 0,
    spawnInput: null,
    temporaryEntries: [
      {
        isDirectory: true,
        isSymbolicLink: false,
        name: `lp-c180190-journal-${RUN_TOKEN}-OWN123`,
      },
    ],
    unlockCallCount: 0,
    unlockFailureBeforeApplyCount: 0,
    unlockStatusFailureAfterLostApplyCount: 0,
    unlockResponseLostAfterApplyCount: 0,
  };

  function databaseNameFromUrl(url) {
    return new URL(url).pathname.slice(1);
  }

  function findCatalog(databaseName) {
    return runtime.catalog.find((row) => row.databaseName === databaseName);
  }

  function createPrismaClient({ databaseName, kind, url }) {
    assert.equal(databaseNameFromUrl(url), databaseName);
    const client = {
      async $connect() {
        runtime.connectedClients += 1;
      },
      async $disconnect() {
        runtime.disconnectedClients += 1;
      },
      async $executeRawUnsafe(sql) {
        if (sql === "SET TRANSACTION READ ONLY") return 0;
        runtime.ddlCount += 1;
        if (sql.startsWith("CREATE DATABASE ")) {
          runtime.catalog.push(catalogRow());
          if (runtime.responseLostAfterDdl) throw new Error("response lost");
          return 0;
        }
        if (sql.startsWith("COMMENT ON DATABASE ")) {
          const marker = / IS E'([^']+)';$/u.exec(sql)?.[1];
          assert.ok(marker);
          const target = runtime.catalog.find((row) =>
            sql.includes(`"${row.databaseName}"`),
          );
          assert.ok(target);
          target.marker = marker;
          return 0;
        }
        if (sql.includes(" WITH ALLOW_CONNECTIONS = ")) {
          const target = runtime.catalog.find((row) =>
            sql.includes(`"${row.databaseName}"`),
          );
          assert.ok(target);
          target.allowConnections = sql.includes(" = true;");
          return 0;
        }
        if (sql.includes(" RENAME TO ")) {
          const target = runtime.catalog.find((row) =>
            sql.includes(`DATABASE "${row.databaseName}" RENAME`),
          );
          assert.ok(target);
          const renamed = / RENAME TO "([^"]+)";$/u.exec(sql)?.[1];
          assert.ok(renamed);
          target.databaseName = renamed;
          return 0;
        }
        if (sql.startsWith("DROP DATABASE ")) {
          const index = runtime.catalog.findIndex((row) =>
            sql.includes(`"${row.databaseName}"`),
          );
          assert.notEqual(index, -1);
          runtime.catalog.splice(index, 1);
          return 0;
        }
        throw new Error("unexpected mock DDL");
      },
      async $queryRawUnsafe(sql) {
        const parameters = [...arguments].slice(1);
        if (sql.includes("pg_try_advisory_lock")) {
          runtime.lockHeld = runtime.lockAcquired;
          return [
            {
              acquired: runtime.lockAcquired,
              backendPid: runtime.maintenancePid,
              databaseName: "postgres",
              roleName: "postgres",
            },
          ];
        }
        if (sql.includes('AS "lockCount"')) {
          if (runtime.lockStatusFailureCount > 0) {
            runtime.lockStatusFailureCount -= 1;
            throw new Error("lock status response lost");
          }
          return [
            {
              backendPid: runtime.maintenancePid,
              databaseName: "postgres",
              lockCount: runtime.lockHeld ? 1 : 0,
              roleName: "postgres",
            },
          ];
        }
        if (sql.includes("pg_advisory_unlock")) {
          runtime.unlockCallCount += 1;
          if (runtime.unlockFailureBeforeApplyCount > 0) {
            runtime.unlockFailureBeforeApplyCount -= 1;
            throw new Error("unlock response lost before apply");
          }
          const released = runtime.lockHeld;
          runtime.lockHeld = false;
          if (runtime.unlockResponseLostAfterApplyCount > 0) {
            runtime.unlockResponseLostAfterApplyCount -= 1;
            runtime.lockStatusFailureCount +=
              runtime.unlockStatusFailureAfterLostApplyCount;
            runtime.unlockStatusFailureAfterLostApplyCount = 0;
            throw new Error("unlock response lost after apply");
          }
          return [
            {
              backendPid: runtime.maintenancePid,
              databaseName: "postgres",
              released,
              roleName: "postgres",
            },
          ];
        }
        if (sql.includes('AS "clusterResidueCount"')) {
          runtime.clusterResidueMarkers = parameters;
          runtime.clusterResidueSql = sql;
          return [{ clusterResidueCount: runtime.clusterResidueCount }];
        }
        if (sql.includes("WITH scope AS (") && sql.includes("pg_database")) {
          const [
            workingName,
            finalName,
            expectedOid,
            expectedMarker,
            ...ownershipMarkers
          ] = parameters;
          return runtime.catalog
            .filter(
              (row) =>
                [workingName, finalName].includes(row.databaseName) ||
                (expectedOid !== null && row.databaseOid === expectedOid) ||
                (expectedMarker !== null && row.marker === expectedMarker) ||
                ownershipMarkers.includes(row.marker),
            )
            .map((row) => ({ ...row }));
        }
        if (
          sql.includes('AS "backendPid"') &&
          !sql.includes('AS "databaseOid"')
        ) {
          return [
            {
              backendPid:
                kind === "MAINTENANCE"
                  ? runtime.maintenancePid
                  : runtime.maintenancePid + 1,
              databaseName,
              roleName: "postgres",
            },
          ];
        }
        if (runtime.queryResults.has(sql)) {
          const result = runtime.queryResults.get(sql);
          return typeof result === "function"
            ? result({ databaseName, parameters })
            : result;
        }
        throw new Error(`unexpected mock query for ${databaseName}`);
      },
      async $transaction(callback) {
        return callback(client);
      },
    };
    return client;
  }

  const dependencies = {
    async attestExecutables() {
      return { ...runtime.executable };
    },
    createPrismaClient,
    async inspectSchemaPath(schemaPath) {
      const artifactRootPath = await realpath(dirname(schemaPath));
      const schemaRealPath = await realpath(schemaPath);
      const systemTempRealPath = await realpath(tmpdir());
      const [artifactRootStat, schemaStat, systemTempStat] = await Promise.all([
        stat(artifactRootPath, { bigint: true }),
        stat(schemaRealPath, { bigint: true }),
        stat(systemTempRealPath, { bigint: true }),
      ]);
      return {
        artifactRootIdentity: filesystemIdentity(artifactRootStat),
        artifactRootPath,
        schemaIdentity: filesystemIdentity(schemaStat),
        schemaPath: schemaRealPath,
        systemTempIdentity: filesystemIdentity(systemTempStat),
        systemTempRealPath,
        verified: true,
      };
    },
    async listTemporaryEntries() {
      return runtime.temporaryEntries.map((entry) => ({ ...entry }));
    },
    async spawnPrisma(input) {
      runtime.spawnCount += 1;
      runtime.spawnInput = input;
      if (runtime.spawnError !== null) throw runtime.spawnError;
      return { exitCode: 0, responseObserved: true };
    },
  };
  return { dependencies, runtime };
}

function adapterFrom(harness, explicitEnvironment = environment()) {
  return createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapterForTestOnly(
    explicitEnvironment,
    harness.dependencies,
  );
}

async function attest(adapter, ctx = context()) {
  return adapter.attestExecutableRuntime(ctx.attest);
}

async function attestAndLock(adapter, ctx = context()) {
  await attest(adapter, ctx);
  const lockReceipt = await adapter.acquireClusterLock(ctx.attest);
  return { ctx, lockReceipt };
}

function methodInput(ctx, extra) {
  return deepFreeze({
    journalRecordDigest: JOURNAL_DIGEST,
    names: ctx.names,
    runToken: RUN_TOKEN,
    ...extra,
  });
}

function assertRuntimeError(error, code) {
  assert.ok(
    error instanceof
      Current180Current190DisposablePostgresqlRehearsalRuntimeError,
  );
  assert.equal(error.code, code);
  return true;
}

test("adapter exposes the exact runner interface and a deterministic pinned runtime attestation", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  assert.deepEqual(Object.keys(adapter).sort(compareText), ADAPTER_KEYS);
  assert.equal(
    adapter.contract,
    CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
  );
  assert.ok(Object.isFrozen(adapter));

  const result = await attest(adapter);
  assert.equal(result.nodeExecutableSha256, NODE_SHA256);
  assert.equal(result.prismaExecutableSha256, PRISMA_SHA256);
  assert.deepEqual(result.crashRecoveryAdmission, {
    clusterResidueCount: 0,
    journalResidueCount: 0,
    materializerResidueCount: 0,
    recoveryRequired: false,
    verified: true,
  });
  const document = { ...result };
  delete document.runtimeDigest;
  assert.equal(result.runtimeDigest, sha256(canonicalJson(document)));
  assert.deepEqual(
    harness.runtime.clusterResidueMarkers,
    runOwnershipMarkers(),
  );
  assert.match(
    harness.runtime.clusterResidueSql,
    /\^LEETPLUS_CURRENT180190_REHEARSAL_V1:\[0-9a-f\]\{64\}\$/u,
  );
  assert.match(harness.runtime.clusterResidueSql, /OR COALESCE\(/u);
  assert.doesNotMatch(
    harness.runtime.clusterResidueSql,
    /pg_catalog\.coalesce/iu,
  );
});

test("attestation counts a prior-run database renamed outside the derived names by its exact ownership marker", async () => {
  const harness = testHarness();
  harness.runtime.clusterResidueCount = 1;

  const result = await attest(adapterFrom(harness));

  assert.deepEqual(result.crashRecoveryAdmission, {
    clusterResidueCount: 1,
    journalResidueCount: 0,
    materializerResidueCount: 0,
    recoveryRequired: true,
    verified: true,
  });
  assert.deepEqual(
    harness.runtime.clusterResidueMarkers,
    runOwnershipMarkers(),
  );
  assert.match(
    harness.runtime.clusterResidueSql,
    /\^LEETPLUS_CURRENT180190_REHEARSAL_V1:\[0-9a-f\]\{64\}\$/u,
  );
  assert.equal(harness.runtime.ddlCount, 0);
});

test("attestation reports exact cluster, journal, and materializer residue without mutating it", async () => {
  const harness = testHarness();
  harness.runtime.clusterResidueCount = 2;
  harness.runtime.temporaryEntries = [
    {
      isDirectory: true,
      isSymbolicLink: false,
      name: `lp-c180190-journal-${RUN_TOKEN}-OWN123`,
    },
    {
      isDirectory: true,
      isSymbolicLink: false,
      name: `lp-c180190-journal-${"2".repeat(32)}-ABC123`,
    },
    {
      isDirectory: true,
      isSymbolicLink: false,
      name: `lp-c180190-${"d".repeat(64)}-DEF456`,
    },
    {
      isDirectory: true,
      isSymbolicLink: false,
      name: "lp-c180190-journal-not-exact",
    },
  ];
  const result = await attest(adapterFrom(harness));
  assert.deepEqual(result.crashRecoveryAdmission, {
    clusterResidueCount: 2,
    journalResidueCount: 1,
    materializerResidueCount: 1,
    recoveryRequired: true,
    verified: true,
  });
  assert.equal(harness.runtime.ddlCount, 0);
});

test("attestation requires exactly one non-symlink journal root for its own current run", async () => {
  const missing = testHarness();
  missing.runtime.temporaryEntries = [];
  await assert.rejects(
    () => attest(adapterFrom(missing)),
    (error) =>
      assertRuntimeError(error, "RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED"),
  );

  const linked = testHarness();
  linked.runtime.temporaryEntries = [
    {
      isDirectory: false,
      isSymbolicLink: true,
      name: `lp-c180190-journal-${RUN_TOKEN}-OWN123`,
    },
  ];
  await assert.rejects(
    () => attest(adapterFrom(linked)),
    (error) =>
      assertRuntimeError(error, "RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED"),
  );
});

test("factory rejects an ambient PATH even when the planning environment remains otherwise valid", () => {
  assert.throws(
    () =>
      createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapter(
        environment({ Path: "C:\\ambient" }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_ENVIRONMENT_INVALID"),
  );
});

test("the shared Windows spawn primitive starts absolute Node with the exact isolated environment", async () => {
  const result = await runCurrent180Current190IsolatedNodeSpawnForTestOnly({
    environment: { LP_RUNTIME_ISOLATION: "exact" },
    maxOutputBytes: 1_024,
    nodeExecutablePath: process.execPath,
    script: `const keys = Object.keys(process.env).sort();
if (JSON.stringify(keys) !== '["LP_RUNTIME_ISOLATION"]' || process.env.LP_RUNTIME_ISOLATION !== 'exact') process.exit(23);`,
    timeoutMilliseconds: 5_000,
  });
  assert.deepEqual(result, { exitCode: 0, responseObserved: true });
});

test("the Prisma bootstrap activates the pinned bundle as the same-process CommonJS main", async () => {
  const source = await readFile(
    new URL(
      "./current180-current190-disposable-postgresql-rehearsal-runtime.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /for \(const key of Object\.keys\(process\.env\)\)[\s\S]*delete process\.env\[key\]/u,
  );
  assert.match(source, /process\.mainModule = prismaModule/u);
  assert.match(
    source,
    /prismaModule\._compile\(readFileSync\(prismaPath, "utf8"\), prismaPath\)/u,
  );
  assert.doesNotMatch(source, /import\(pathToFileURL\(prismaPath\)\.href\)/u);
  assert.doesNotMatch(source, /process\.env\.(?:SystemRoot|WINDIR)/u);
});

test("the isolated CommonJS bootstrap actually executes the exact module as main", async () => {
  const fixtureRoot = await mkdtemp(
    join(await realpath(tmpdir()), "lp-c180190-commonjs-main-test-"),
  );
  const modulePath = join(fixtureRoot, "fixture.cjs");
  const schemaPath = join(fixtureRoot, "schema.prisma");
  try {
    await writeFile(
      modulePath,
      `if (require.main !== module) process.exit(31);
const expected = [process.execPath, __filename, "migrate", "deploy", "--schema", ${JSON.stringify(schemaPath)}];
if (JSON.stringify(process.argv) !== JSON.stringify(expected)) process.exit(32);
if (JSON.stringify(Object.keys(process.env).sort()) !== '["LP_RUNTIME_ISOLATION"]') process.exit(33);
`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    const result =
      await runCurrent180Current190IsolatedCommonJsMainSpawnForTestOnly({
        environment: { LP_RUNTIME_ISOLATION: "exact" },
        maxOutputBytes: 1_024,
        modulePath,
        nodeExecutablePath: process.execPath,
        schemaPath,
        timeoutMilliseconds: 5_000,
      });
    assert.deepEqual(result, { exitCode: 0, responseObserved: true });
  } finally {
    await unlink(modulePath).catch(() => undefined);
    await rmdir(fixtureRoot).catch(() => undefined);
  }
});

test("timeout and output-limit termination wait until child close is observed", async () => {
  for (const candidate of [
    {
      maxOutputBytes: 1_024,
      script: "setInterval(() => {}, 1000);",
      timeoutMilliseconds: 30,
    },
    {
      maxOutputBytes: 64,
      script:
        "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000);",
      timeoutMilliseconds: 5_000,
    },
  ]) {
    await assert.rejects(
      () =>
        runCurrent180Current190IsolatedNodeSpawnForTestOnly({
          environment: { LP_RUNTIME_ISOLATION: "exact" },
          nodeExecutablePath: process.execPath,
          ...candidate,
        }),
      (error) => {
        assert.equal(error.effectMayHaveCommitted, true);
        assert.equal(error.hardQuarantine, false);
        assert.equal(error.processExitObserved, true);
        return true;
      },
    );
  }
});

test("runtime attestation fails closed on Node or Prisma executable drift", async () => {
  const harness = testHarness();
  harness.runtime.executable.prismaExecutableSha256 = "0".repeat(64);
  await assert.rejects(
    () => attest(adapterFrom(harness)),
    (error) =>
      assertRuntimeError(error, "RUNTIME_EXECUTABLE_ATTESTATION_FAILED"),
  );
});

test("session advisory lock receipt is plain data and backend PID drift blocks DDL", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx, lockReceipt } = await attestAndLock(adapter);
  assert.equal(Object.getPrototypeOf(lockReceipt), Object.prototype);
  assert.ok(Object.isFrozen(lockReceipt));
  assert.equal(
    Object.values(lockReceipt).some((value) => typeof value === "function"),
    false,
  );

  harness.runtime.maintenancePid += 1;
  const statementSpec = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: RUN_TOKEN,
    workingDatabaseName: ctx.names.workingDatabaseName,
  });
  await assert.rejects(
    () =>
      adapter.executeStatement(
        methodInput(ctx, {
          connection: { kind: "MAINTENANCE", databaseName: "postgres" },
          statementSpec,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_CLUSTER_LOCK_DRIFT"),
  );
  assert.equal(harness.runtime.ddlCount, 0);
});

test("a definitive pg_try_advisory_lock false result uses the runner-compatible no-effect code", async () => {
  const harness = testHarness();
  harness.runtime.lockAcquired = false;
  const adapter = adapterFrom(harness);
  const ctx = context();
  await attest(adapter, ctx);
  await assert.rejects(
    () => adapter.acquireClusterLock(ctx.attest),
    (error) => assertRuntimeError(error, "RUNTIME_CLUSTER_LOCK_NOT_ACQUIRED"),
  );
  assert.equal(harness.runtime.lockHeld, false);
  assert.equal(harness.runtime.ddlCount, 0);
});

test("a cloned query spec is rejected because only the SQL module-issued object is executable", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  const issued =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.migrationRows;
  const forged = deepFreeze({ ...issued });
  await assert.rejects(
    () =>
      adapter.liveQuery(
        methodInput(ctx, {
          connection: {
            kind: "SOURCE",
            databaseName: "leetplus_current179_ci",
          },
          querySpec: forged,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_QUERY_INVALID"),
  );
});

test("a digest-recomputed statement with source-destructive SQL is rejected before Prisma DDL", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  const issued = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: RUN_TOKEN,
    workingDatabaseName: ctx.names.workingDatabaseName,
  });
  const forgedDocument = {
    ...issued,
    sql: 'DROP DATABASE "leetplus_current179_ci";',
  };
  delete forgedDocument.statementSpecDigest;
  const forged = deepFreeze({
    ...forgedDocument,
    statementSpecDigest: sha256(canonicalJson(forgedDocument)),
  });
  await assert.rejects(
    () =>
      adapter.executeStatement(
        methodInput(ctx, {
          connection: { kind: "MAINTENANCE", databaseName: "postgres" },
          statementSpec: forged,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_STATEMENT_INVALID"),
  );
  assert.equal(harness.runtime.ddlCount, 0);
});

test("source and target live queries run in READ ONLY transactions and normalize Date and BigInt", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  const querySpec =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.migrationRows;
  harness.runtime.queryResults.set(querySpec.sql, [
    {
      appliedStepsCount: 1n,
      checksum: "c".repeat(64),
      finishedAt: new Date("2026-08-06T00:00:00.000Z"),
      migrationName: "20260731120000_identity_mail_delivery_release_head",
      rolledBackAt: null,
    },
  ]);
  const result = await adapter.liveQuery(
    methodInput(ctx, {
      connection: {
        kind: "SOURCE",
        databaseName: "leetplus_current179_ci",
      },
      querySpec,
    }),
  );
  assert.deepEqual(result.rows, [
    {
      appliedStepsCount: 1,
      checksum: "c".repeat(64),
      finishedAt: "2026-08-06T00:00:00.000Z",
      migrationName: "20260731120000_identity_mail_delivery_release_head",
      rolledBackAt: null,
    },
  ]);
  assert.deepEqual(result.connectionIdentity, {
    backendPid: 4_101,
    databaseName: "leetplus_current179_ci",
    host: "127.0.0.1",
    port: 55_432,
    roleName: "postgres",
  });
});

test("Prisma normalization accepts the pinned Decimal prototype and never invokes accessor bombs", async () => {
  const decimalHarness = testHarness();
  const decimalAdapter = adapterFrom(decimalHarness);
  const { ctx: decimalContext } = await attestAndLock(decimalAdapter);
  const querySpec =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES.migrationRows;
  decimalHarness.runtime.queryResults.set(querySpec.sql, [
    {
      appliedStepsCount: 1,
      checksum: new Prisma.Decimal("1.25"),
      finishedAt: null,
      migrationName: "20260731120000_identity_mail_delivery_release_head",
      rolledBackAt: null,
    },
  ]);
  const decimalResult = await decimalAdapter.liveQuery(
    methodInput(decimalContext, {
      connection: {
        kind: "SOURCE",
        databaseName: "leetplus_current179_ci",
      },
      querySpec,
    }),
  );
  assert.equal(decimalResult.rows[0].checksum, "1.25");

  const bombHarness = testHarness();
  const bombAdapter = adapterFrom(bombHarness);
  const { ctx: bombContext } = await attestAndLock(bombAdapter);
  let getterCalls = 0;
  const accessorBomb = {};
  Object.defineProperty(accessorBomb, "constructor", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("getter must never execute");
    },
  });
  bombHarness.runtime.queryResults.set(querySpec.sql, [
    {
      appliedStepsCount: 1,
      checksum: accessorBomb,
      finishedAt: null,
      migrationName: "20260731120000_identity_mail_delivery_release_head",
      rolledBackAt: null,
    },
  ]);
  await assert.rejects(
    () =>
      bombAdapter.liveQuery(
        methodInput(bombContext, {
          connection: {
            kind: "SOURCE",
            databaseName: "leetplus_current179_ci",
          },
          querySpec,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_QUERY_RESULT_INVALID"),
  );
  assert.equal(getterCalls, 0);
});

test("safe CREATE is reconciled immediately before and after DDL and lock release verifies the pinned receipt", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx, lockReceipt } = await attestAndLock(adapter);
  const statementSpec = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: RUN_TOKEN,
    workingDatabaseName: ctx.names.workingDatabaseName,
  });
  const result = await adapter.executeStatement(
    methodInput(ctx, {
      connection: { kind: "MAINTENANCE", databaseName: "postgres" },
      statementSpec,
    }),
  );
  assert.deepEqual(result, { responseObserved: true });
  assert.equal(harness.runtime.catalog.length, 1);
  assert.equal(harness.runtime.catalog[0].marker, null);
  assert.equal(harness.runtime.ddlCount, 1);

  const released = await adapter.releaseClusterLock(
    methodInput(ctx, { lockReceipt }),
  );
  assert.deepEqual(released, { released: true });
  assert.equal(harness.runtime.lockHeld, false);
});

test("lost advisory-unlock responses reconcile applied state and boundedly retry unapplied state", async () => {
  for (const scenario of ["APPLIED", "NOT_APPLIED"]) {
    const harness = testHarness();
    const adapter = adapterFrom(harness);
    const { ctx, lockReceipt } = await attestAndLock(adapter);
    if (scenario === "APPLIED") {
      harness.runtime.unlockResponseLostAfterApplyCount = 1;
    } else {
      harness.runtime.unlockFailureBeforeApplyCount = 1;
    }
    const result = await adapter.releaseClusterLock(
      methodInput(ctx, { lockReceipt }),
    );
    assert.deepEqual(result, { released: true });
    assert.equal(harness.runtime.lockHeld, false);
    assert.equal(
      harness.runtime.unlockCallCount,
      scenario === "APPLIED" ? 1 : 2,
    );
  }
});

test("an unlock response plus same-session status ambiguity is preserved as a lost effect response", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx, lockReceipt } = await attestAndLock(adapter);
  harness.runtime.unlockResponseLostAfterApplyCount = 1;
  harness.runtime.unlockStatusFailureAfterLostApplyCount = 1;
  await assert.rejects(
    () => adapter.releaseClusterLock(methodInput(ctx, { lockReceipt })),
    (error) => assertRuntimeError(error, "RUNTIME_EFFECT_RESPONSE_LOST"),
  );
  assert.equal(harness.runtime.lockHeld, false);
  assert.equal(harness.runtime.unlockCallCount, 1);
});

test("an ambiguous Prisma DDL response is classified for bounded catalog reconciliation", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  harness.runtime.responseLostAfterDdl = true;
  const statementSpec = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: RUN_TOKEN,
    workingDatabaseName: ctx.names.workingDatabaseName,
  });
  await assert.rejects(
    () =>
      adapter.executeStatement(
        methodInput(ctx, {
          connection: { kind: "MAINTENANCE", databaseName: "postgres" },
          statementSpec,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_EFFECT_RESPONSE_LOST"),
  );
  assert.equal(harness.runtime.catalog.length, 1);
});

test("deploy accepts only a fresh branded materialization, the contract-derived target URL, and isolated child environment", async (testContext) => {
  const harness = testHarness();
  const explicitEnvironment = environment();
  const adapter = adapterFrom(harness, explicitEnvironment);
  const { ctx } = await attestAndLock(adapter);
  const { verification } = await freshDeployMaterialization(testContext);
  const childEnvironment =
    buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      environment: explicitEnvironment,
      names: ctx.names,
      target: "working",
    });
  const schemaPath = verification.schemaPath;
  const deployInput = methodInput(ctx, {
    databaseUrl: childEnvironment.DATABASE_URL,
    env: childEnvironment,
    materializerVerificationReceipt: verification,
    schemaPath,
  });
  await assert.rejects(
    () =>
      adapter.deploy(
        methodInput(ctx, {
          databaseUrl: childEnvironment.DATABASE_URL,
          env: childEnvironment,
          materializerVerificationReceipt: deepFreeze({ ...verification }),
          schemaPath,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_DEPLOY_INVALID"),
  );
  assert.equal(harness.runtime.spawnCount, 0);
  const result = await adapter.deploy(deployInput);
  assert.deepEqual(result, { responseObserved: true });
  await assert.rejects(
    () => adapter.deploy(deployInput),
    (error) => assertRuntimeError(error, "RUNTIME_DEPLOY_INVALID"),
  );
  assert.equal(harness.runtime.spawnCount, 1);
  assert.equal(
    harness.runtime.spawnInput.nodeExecutablePath,
    resolve("fixtures", "node.exe"),
  );
  assert.equal(
    harness.runtime.spawnInput.prismaExecutablePath,
    resolve("fixtures", "prisma", "build", "index.js"),
  );
  assert.equal(Object.hasOwn(harness.runtime.spawnInput.env, "PATH"), false);
  assert.deepEqual(
    Object.keys(harness.runtime.spawnInput.env).sort(compareText),
    [
      "CURRENT180_CURRENT190_REHEARSAL_AUTHORIZATION_RECEIPT_SHA256",
      "CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256",
      "DATABASE_URL",
      "NODE_ENV",
      "NO_COLOR",
      "PGOPTIONS",
      "PRISMA_HIDE_UPDATE_MESSAGE",
      "TEMP",
      "TMP",
      "TMPDIR",
      ...(platform() === "win32" ? ["SystemRoot", "WINDIR"] : []),
    ].sort(compareText),
  );
  assert.equal(
    harness.runtime.spawnInput.env.TEMP,
    verification.systemTempRealPath,
  );
  assert.equal(
    harness.runtime.spawnInput.env.TMP,
    verification.systemTempRealPath,
  );
  assert.equal(
    harness.runtime.spawnInput.env.TMPDIR,
    verification.systemTempRealPath,
  );
  if (platform() === "win32") {
    const pinnedSystemRoot = await realpath("C:\\Windows");
    assert.equal(harness.runtime.spawnInput.env.SystemRoot, pinnedSystemRoot);
    assert.equal(harness.runtime.spawnInput.env.WINDIR, pinnedSystemRoot);
  }
});

test("deploy rejects a same-path schema replacement by exact materializer inode before spawn", async (testContext) => {
  const harness = testHarness();
  const explicitEnvironment = environment();
  const adapter = adapterFrom(harness, explicitEnvironment);
  const { ctx } = await attestAndLock(adapter);
  const { verification } = await freshDeployMaterialization(testContext);
  const childEnvironment =
    buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      environment: explicitEnvironment,
      names: ctx.names,
      target: "working",
    });
  const backupPath = `${verification.schemaPath}.original`;
  await rename(verification.schemaPath, backupPath);
  await writeFile(verification.schemaPath, "malicious replacement\n", {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await assert.rejects(
      () =>
        adapter.deploy(
          methodInput(ctx, {
            databaseUrl: childEnvironment.DATABASE_URL,
            env: childEnvironment,
            materializerVerificationReceipt: verification,
            schemaPath: verification.schemaPath,
          }),
        ),
      (error) => assertRuntimeError(error, "RUNTIME_DEPLOY_INVALID"),
    );
    assert.equal(harness.runtime.spawnCount, 0);
  } finally {
    await unlink(verification.schemaPath);
    await rename(backupPath, verification.schemaPath);
  }
  const result = await adapter.deploy(
    methodInput(ctx, {
      databaseUrl: childEnvironment.DATABASE_URL,
      env: childEnvironment,
      materializerVerificationReceipt: verification,
      schemaPath: verification.schemaPath,
    }),
  );
  assert.deepEqual(result, { responseObserved: true });
  assert.equal(harness.runtime.spawnCount, 1);
});

test("an ambiguous spawned deploy response uses the same lost-response classification", async (testContext) => {
  const harness = testHarness();
  const explicitEnvironment = environment();
  const adapter = adapterFrom(harness, explicitEnvironment);
  const { ctx } = await attestAndLock(adapter);
  const { verification } = await freshDeployMaterialization(testContext);
  harness.runtime.spawnError = {
    effectMayHaveCommitted: true,
    hardQuarantine: false,
    processExitObserved: true,
  };
  const childEnvironment =
    buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      environment: explicitEnvironment,
      names: ctx.names,
      target: "working",
    });
  await assert.rejects(
    () =>
      adapter.deploy(
        methodInput(ctx, {
          databaseUrl: childEnvironment.DATABASE_URL,
          env: childEnvironment,
          materializerVerificationReceipt: verification,
          schemaPath: verification.schemaPath,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_EFFECT_RESPONSE_LOST"),
  );
});

test("an unproven child exit hard-quarantines every subsequent query, DDL, lock release, and cleanup", async (testContext) => {
  const harness = testHarness();
  const explicitEnvironment = environment();
  const adapter = adapterFrom(harness, explicitEnvironment);
  const { ctx, lockReceipt } = await attestAndLock(adapter);
  const { verification } = await freshDeployMaterialization(testContext);
  harness.runtime.spawnError = {
    effectMayHaveCommitted: true,
    hardQuarantine: true,
    processExitObserved: false,
  };
  const childEnvironment =
    buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      environment: explicitEnvironment,
      names: ctx.names,
      target: "working",
    });
  await assert.rejects(
    () =>
      adapter.deploy(
        methodInput(ctx, {
          databaseUrl: childEnvironment.DATABASE_URL,
          env: childEnvironment,
          materializerVerificationReceipt: verification,
          schemaPath: verification.schemaPath,
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_MANUAL_RECOVERY_REQUIRED"),
  );
  await assert.rejects(
    () => adapter.releaseClusterLock(methodInput(ctx, { lockReceipt })),
    (error) => assertRuntimeError(error, "RUNTIME_MANUAL_RECOVERY_REQUIRED"),
  );
  await assert.rejects(
    () =>
      adapter.cleanup(
        methodInput(ctx, {
          authorizationReceiptDigest: AUTHORIZATION_DIGEST,
          expectedIdentity: null,
          reason: "FAIL_CLOSED_AMBIGUOUS_EFFECT_JANITOR",
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_MANUAL_RECOVERY_REQUIRED"),
  );
});

test("cleanup never seals or drops a derived-name database whose OID/owner/marker identity is foreign", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  const marker = buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION_DIGEST,
    runToken: RUN_TOKEN,
  });
  const identityDocument = {
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION_DIGEST,
    marker,
    oid: 777,
    ownerName: "postgres",
    ownerOid: 10,
    runToken: RUN_TOKEN,
  };
  const expectedIdentity = deepFreeze({
    ...identityDocument,
    identityDigest: sha256(canonicalJson(identityDocument)),
  });
  harness.runtime.catalog = [catalogRow({ marker, ownerOid: 11 })];
  await assert.rejects(
    () =>
      adapter.cleanup(
        methodInput(ctx, {
          authorizationReceiptDigest: AUTHORIZATION_DIGEST,
          expectedIdentity,
          reason: "FAIL_CLOSED_AMBIGUOUS_EFFECT_JANITOR",
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_CLEANUP_FOREIGN_IDENTITY"),
  );
  assert.equal(harness.runtime.ddlCount, 0);
  assert.equal(
    findCatalogForAssertion(harness.runtime, ctx.names.workingDatabaseName)
      .ownerOid,
    11,
  );
});

test("cleanup treats an owned-marker database renamed outside both derived names as present and preserves it", async () => {
  const harness = testHarness();
  harness.runtime.clusterResidueCount = 1;
  const renamedDatabaseName = "renamed_owned_rehearsal";
  harness.runtime.catalog = [
    catalogRow({
      databaseName: renamedDatabaseName,
      marker: runOwnershipMarkers()[0],
    }),
  ];
  const adapter = adapterFrom(harness);
  const ctx = context();
  await attest(adapter, ctx);
  await assert.rejects(
    () =>
      adapter.cleanup(
        methodInput(ctx, {
          authorizationReceiptDigest: AUTHORIZATION_DIGEST,
          expectedIdentity: null,
          reason: "RELEASE_RUNTIME_RESOURCES_AFTER_FAILED_CLEAN",
        }),
      ),
    (error) => assertRuntimeError(error, "RUNTIME_CLEANUP_FOREIGN_IDENTITY"),
  );
  assert.equal(harness.runtime.ddlCount, 0);
  assert.equal(
    findCatalogForAssertion(harness.runtime, renamedDatabaseName).marker,
    runOwnershipMarkers()[0],
  );
});

test("cleanup seals and drops only an exact owned identity, reconciles a lost unlock response, proves absence, and releases runtime resources", async () => {
  const harness = testHarness();
  const adapter = adapterFrom(harness);
  const { ctx } = await attestAndLock(adapter);
  const marker = buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION_DIGEST,
    runToken: RUN_TOKEN,
  });
  const identityDocument = {
    attempt: 1,
    authorizationReceiptDigest: AUTHORIZATION_DIGEST,
    marker,
    oid: 777,
    ownerName: "postgres",
    ownerOid: 10,
    runToken: RUN_TOKEN,
  };
  const expectedIdentity = deepFreeze({
    ...identityDocument,
    identityDigest: sha256(canonicalJson(identityDocument)),
  });
  harness.runtime.catalog = [catalogRow({ allowConnections: true, marker })];
  harness.runtime.unlockResponseLostAfterApplyCount = 1;
  const result = await adapter.cleanup(
    methodInput(ctx, {
      authorizationReceiptDigest: AUTHORIZATION_DIGEST,
      expectedIdentity,
      reason: "FAIL_CLOSED_AMBIGUOUS_EFFECT_JANITOR",
    }),
  );
  assert.deepEqual(result, {
    responseObserved: true,
    runtimeResourcesReleased: true,
    targetAbsentVerified: true,
  });
  assert.equal(harness.runtime.catalog.length, 0);
  assert.equal(harness.runtime.ddlCount, 2);
  assert.equal(harness.runtime.lockHeld, false);
  assert.equal(harness.runtime.unlockCallCount, 1);
  assert.ok(harness.runtime.disconnectedClients >= 2);
});

function findCatalogForAssertion(runtime, databaseName) {
  const row = runtime.catalog.find(
    (candidate) => candidate.databaseName === databaseName,
  );
  assert.ok(row);
  return row;
}
