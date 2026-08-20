import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { serializeSafeFailureMetadata } from "./n-minus-one-restored-copy-smoke.cli.mjs";
import {
  N_MINUS_ONE_CRITICAL_READS,
  N_MINUS_ONE_FORCED_RUNTIME_POLICY,
  N_MINUS_ONE_LEGACY_SHA,
  N_MINUS_ONE_LEGACY_SCHEDULER_EFFECTIVE_FLAGS,
  N_MINUS_ONE_SCHEDULER_CONTRACT,
  assertNMinusOneSchedulerCompatibilityEvidence,
  assertNMinusOneDatabaseUrl,
  assertNMinusOneRuntimePorts,
  buildLoopbackNetworkGuardSource,
  buildNMinusOnePrepareEnvironment,
  buildNMinusOneRuntimeEnvironment,
  buildNMinusOneSchedulerCompatibilityEnvironment,
  captureNMinusOneSchedulerDatabaseSnapshot,
  cleanupNMinusOneFixture,
  createNMinusOneRuntimeLogCollector,
  diffNMinusOneSchedulerDatabaseSnapshots,
  executeNMinusOneHttpSmoke,
  inspectNMinusOneDatabase,
  normalizeNMinusOneExpectedTarget,
  runBoundedCommand,
} from "./n-minus-one-restored-copy-smoke.mjs";

const DATABASE_URL =
  "postgresql://smoke:local-secret@127.0.0.1:55439/leetplus_restored_nminus1?schema=public&sslmode=disable";
const SCHEDULER_DATABASE_URL =
  "postgresql://smoke:local-secret@127.0.0.1:55439/leetplus_restored_scheduler_nminus1?schema=public&sslmode=disable";
const EXPECTED = Object.freeze({
  expectedMigrationCount: 187,
  expectedMigrationHead: "20260820090000_controlled_beta_release_v1",
  expectedSystemIdentifier: "7612345678901234567",
  tenantSlug: "tenant-a",
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

function captureChild(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr, stdout }));
  });
}

test("pins the exact currently deployed legacy SHA", () => {
  assert.equal(
    N_MINUS_ONE_LEGACY_SHA,
    "7de04ff4ccc814494810730be3fa6bf661097b07",
  );
  assert.equal(
    N_MINUS_ONE_SCHEDULER_CONTRACT,
    "LEETPLUS_N_MINUS_ONE_SCHEDULER_COMPATIBILITY_V1",
  );
});

test("accepts only an explicit non-5432 loopback restored-copy database URL", () => {
  assert.deepEqual(assertNMinusOneDatabaseUrl(DATABASE_URL), {
    databaseName: "leetplus_restored_nminus1",
    host: "127.0.0.1",
    port: 55439,
  });

  const cases = [
    [
      "postgresql://smoke:secret@192.0.2.10:55439/leetplus_restored_nminus1",
      "N_MINUS_ONE_DATABASE_HOST_NOT_LOOPBACK",
    ],
    [
      "postgresql://smoke:secret@localhost:55439/leetplus_restored_nminus1",
      "N_MINUS_ONE_DATABASE_HOST_NOT_LOOPBACK",
    ],
    [
      "postgresql://smoke:secret@127.0.0.1:5432/leetplus_restored_nminus1",
      "N_MINUS_ONE_DATABASE_PORT_NOT_ISOLATED",
    ],
    [
      "postgresql://smoke:secret@127.0.0.1:55439/leetplus",
      "N_MINUS_ONE_DATABASE_NAME_NOT_ALLOWLISTED",
    ],
    [
      "postgresql://smoke:secret@127.0.0.1:55439/leetplus_restored_nminus1?hostaddr=192.0.2.10",
      "N_MINUS_ONE_DATABASE_OPTION_NOT_ALLOWLISTED",
    ],
    [
      "postgresql://smoke@127.0.0.1:55439/leetplus_restored_nminus1",
      "N_MINUS_ONE_DATABASE_CREDENTIALS_REQUIRED",
    ],
  ];
  for (const [value, reasonCode] of cases) {
    assert.throws(() => assertNMinusOneDatabaseUrl(value), { reasonCode });
  }
});

test("requires alternate API and exact migrated-target identity", () => {
  assert.deepEqual(
    assertNMinusOneRuntimePorts({ apiPort: 44100, databasePort: 55439 }),
    { apiPort: 44100 },
  );
  for (const apiPort of [3000, 4000, 5432, 55439]) {
    assert.throws(
      () => assertNMinusOneRuntimePorts({ apiPort, databasePort: 55439 }),
      { reasonCode: "N_MINUS_ONE_API_PORT_NOT_ISOLATED" },
    );
  }
  assert.deepEqual(normalizeNMinusOneExpectedTarget(EXPECTED), EXPECTED);
  assert.throws(
    () =>
      normalizeNMinusOneExpectedTarget({
        ...EXPECTED,
        expectedMigrationHead: "latest",
      }),
    { reasonCode: "N_MINUS_ONE_MIGRATION_HEAD_INVALID" },
  );
});

test("constructs a minimal environment and overrides every side-effect flag", () => {
  const environment = buildNMinusOneRuntimeEnvironment({
    apiPort: 44100,
    databaseUrl: DATABASE_URL,
    hostEnvironment: {
      AWS_SECRET_ACCESS_KEY: "must-not-pass",
      GUEST_GAME_TELEGRAM_BOT_TOKEN: "must-not-pass",
      LANGAME_API_KEY: "must-not-pass",
      PATH: "/safe/path",
      SMTP_PASSWORD: "must-not-pass",
    },
  });
  assert.equal(environment.PATH, "/safe/path");
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.SMTP_PASSWORD, undefined);
  assert.equal(environment.LANGAME_API_KEY, "");
  assert.equal(environment.GUEST_GAME_TELEGRAM_BOT_TOKEN, "");
  assert.equal(environment.FOUNDER_OPERATOR_BETA_MODE, "DISABLED");
  for (const [key, value] of Object.entries(
    N_MINUS_ONE_FORCED_RUNTIME_POLICY,
  )) {
    assert.equal(environment[key], value, key);
  }
  assert.equal(environment.DATABASE_URL, DATABASE_URL);
  assert.match(environment.JWT_SECRET, /^n-minus-one-[0-9a-f]{96}$/u);
});

test("prepares Windows pnpm with validated local app-data paths and typed stage failures", async () => {
  const environment = buildNMinusOnePrepareEnvironment({
    hostEnvironment: {
      APPDATA: "C:\\Users\\operator\\AppData\\Roaming",
      AWS_SECRET_ACCESS_KEY: "must-not-pass",
      LOCALAPPDATA: "C:\\Users\\operator\\AppData\\Local",
      PATH: "C:\\Windows\\System32",
      PNPM_HOME: "C:\\must-not-pass",
    },
    platform: "win32",
  });
  assert.equal(environment.APPDATA, "C:\\Users\\operator\\AppData\\Roaming");
  assert.equal(environment.LOCALAPPDATA, "C:\\Users\\operator\\AppData\\Local");
  assert.equal(environment.PNPM_HOME, undefined);
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.npm_config_offline, "true");
  assert.throws(
    () =>
      buildNMinusOnePrepareEnvironment({
        hostEnvironment: {
          APPDATA: "relative\\roaming",
          LOCALAPPDATA: "C:\\Users\\operator\\AppData\\Local",
        },
        platform: "win32",
      }),
    { reasonCode: "N_MINUS_ONE_PREPARE_WINDOWS_APPDATA_INVALID" },
  );
  assert.throws(
    () =>
      buildNMinusOnePrepareEnvironment({
        hostEnvironment: {
          APPDATA: "\\\\server\\profile\\roaming",
          LOCALAPPDATA: "C:\\Users\\operator\\AppData\\Local",
        },
        platform: "win32",
      }),
    { reasonCode: "N_MINUS_ONE_PREPARE_WINDOWS_APPDATA_INVALID" },
  );
  assert.throws(
    () =>
      buildNMinusOnePrepareEnvironment({
        hostEnvironment: {
          APPDATA: "C:\\Users\\operator\\AppData\\Roaming",
        },
        platform: "win32",
      }),
    { reasonCode: "N_MINUS_ONE_PREPARE_WINDOWS_LOCALAPPDATA_REQUIRED" },
  );

  const stages = Object.freeze({
    API_BUILD: "N_MINUS_ONE_PREPARE_API_BUILD_COMMAND_FAILED",
    GIT_OBJECT: "N_MINUS_ONE_PREPARE_GIT_OBJECT_COMMAND_FAILED",
    PNPM_INSTALL: "N_MINUS_ONE_PREPARE_PNPM_INSTALL_COMMAND_FAILED",
    PRISMA_GENERATE: "N_MINUS_ONE_PREPARE_PRISMA_GENERATE_COMMAND_FAILED",
    WORKTREE_ADD: "N_MINUS_ONE_PREPARE_WORKTREE_ADD_COMMAND_FAILED",
  });
  for (const [stage, reasonCode] of Object.entries(stages)) {
    await assert.rejects(
      runBoundedCommand(
        process.execPath,
        ["--eval", "process.stderr.write('sensitive-output');process.exit(7)"],
        {
          environment: {},
          prepareStage: stage,
          timeoutMs: 5_000,
        },
      ),
      (error) => {
        assert.equal(error.reasonCode, reasonCode);
        assert.deepEqual(
          {
            exitCode: error.safeMetadata.exitCode,
            failureKind: error.safeMetadata.failureKind,
            outputBytes: error.safeMetadata.outputBytes,
            stage: error.safeMetadata.stage,
          },
          {
            exitCode: 7,
            failureKind: "EXIT",
            outputBytes: Buffer.byteLength("sensitive-output"),
            stage,
          },
        );
        assert.match(error.safeMetadata.outputDigest, /^[0-9a-f]{64}$/u);
        assert.doesNotMatch(JSON.stringify(error), /sensitive-output/u);
        return true;
      },
    );
  }
  assert.deepEqual(
    serializeSafeFailureMetadata({
      safeContractError: true,
      safeMetadata: {
        exitCode: 7,
        failureKind: "EXIT",
        leakedValue: "must-not-pass",
        outputBytes: 16,
        outputDigest: "a".repeat(64),
        platformCode: null,
        signal: null,
        stage: "PNPM_INSTALL",
      },
    }),
    {
      exitCode: 7,
      failureKind: "EXIT",
      outputBytes: 16,
      outputDigest: "a".repeat(64),
      platformCode: null,
      signal: null,
      stage: "PNPM_INSTALL",
    },
  );
});

test("scheduler mode reproduces exact legacy enablement while forcing available safeguards", () => {
  const environment = buildNMinusOneSchedulerCompatibilityEnvironment({
    apiPort: 44100,
    databaseUrl: SCHEDULER_DATABASE_URL,
    hostEnvironment: { PATH: "/safe/path" },
  });
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(N_MINUS_ONE_LEGACY_SCHEDULER_EFFECTIVE_FLAGS).map(
        ([key, value]) => [key, value.effective],
      ),
    ),
    {
      GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED: true,
      GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED: true,
      GUEST_GAME_PIPELINE_SCHEDULER_ENABLED: true,
      GUEST_GAME_RETENTION_SCHEDULER_ENABLED: true,
      LANGAME_DAILY_SYNC_SCHEDULER_ENABLED: true,
      REPORT_DIGEST_SCHEDULER_ENABLED: true,
    },
  );
  for (const key of [
    "GUEST_ACTIVITY_LEDGER_SCHEDULER_ENABLED",
    "GUEST_GAME_PIPELINE_SCHEDULER_ENABLED",
    "GUEST_GAME_RETENTION_SCHEDULER_ENABLED",
    "LANGAME_DAILY_SYNC_SCHEDULER_ENABLED",
    "REPORT_DIGEST_SCHEDULER_ENABLED",
  ]) {
    assert.equal(environment[key], undefined, key);
  }
  assert.equal(environment.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED, "true");
  assert.equal(environment.GUEST_GAME_BONUS_LEDGER_SCHEDULER_DRY_RUN, "true");
  assert.equal(
    environment.GUEST_GAME_BONUS_LEDGER_SCHEDULER_QUEUE_APPROVED_REWARDS,
    "false",
  );
  assert.equal(environment.GUEST_GAME_RETENTION_LIVE_ENABLED, "false");
  assert.equal(environment.FOUNDER_OPERATOR_BETA_MODE, "DISABLED");
  assert.equal(environment.LANGAME_DAILY_SYNC_LOCAL_TIME, "00:00");
  assert.equal(environment.REPORT_DIGEST_DAILY_TIME, "00:00");
  assert.equal(environment.REPORT_DIGEST_SCHEDULER_WINDOW_MINUTES, "1440");
  assert.throws(
    () =>
      buildNMinusOneSchedulerCompatibilityEnvironment({
        apiPort: 44100,
        databaseUrl: DATABASE_URL,
      }),
    { reasonCode: "N_MINUS_ONE_SCHEDULER_DATABASE_NAME_NOT_ALLOWLISTED" },
  );
});

test("network preload forces loopback binding and blocks every non-DB connect", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lp-nminus-guard-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const apiPort = await freePort();
  let databasePort = await freePort();
  while (databasePort === apiPort) databasePort = await freePort();
  const guardPath = path.join(directory, "guard.cjs");
  await writeFile(
    guardPath,
    buildLoopbackNetworkGuardSource({ apiPort, databasePort }),
    "utf8",
  );
  const source = `
    const http = require("node:http");
    const net = require("node:net");
    const server = http.createServer((_request, response) => response.end("ok"));
    server.listen(${apiPort}, () => {
      const address = server.address();
      let blocked = false;
      try { net.connect({ host: "203.0.113.1", port: 443 }); }
      catch (error) { blocked = error.message === "N_MINUS_ONE_NETWORK_CONNECT_BLOCKED"; }
      process.stdout.write(address.address + "|" + blocked);
      server.close();
    });
  `;
  const result = await captureChild(process.execPath, [
    "--require",
    guardPath,
    "--eval",
    source,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "127.0.0.1|true");
});

test("scheduler preload reports aggregate schema-query coverage without SQL or parameters", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lp-nminus-query-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const moduleDirectory = path.join(
    directory,
    "node_modules",
    "@prisma",
    "client",
  );
  await mkdir(moduleDirectory, { recursive: true });
  await writeFile(
    path.join(moduleDirectory, "index.js"),
    `class PrismaClient {
      constructor(options) { this.options = options; }
      $on(name, callback) { if (name === "query") this.callback = callback; }
      emit(query) { this.callback({ query, params: "must-not-appear" }); }
    }
    module.exports = { PrismaClient };`,
    "utf8",
  );
  const apiPort = await freePort();
  let databasePort = await freePort();
  while (databasePort === apiPort) databasePort = await freePort();
  const guardPath = path.join(directory, "guard.cjs");
  await writeFile(
    guardPath,
    buildLoopbackNetworkGuardSource({
      apiPort,
      databasePort,
      schedulerCompatibility: true,
    }),
    "utf8",
  );
  const source = `
    const { PrismaClient } = require("@prisma/client");
    const client = new PrismaClient();
    for (const query of [
      'SELECT * FROM "GuestActivitySyncJob" WHERE secret = $1',
      'SELECT * FROM "GuestBonusLedgerEntry"',
      'INSERT INTO "SalesFact" DEFAULT VALUES',
      'SELECT * FROM "GuestGameDataRetentionPolicy"',
      'SELECT * FROM "IntegrationCredential"',
      'UPDATE "ReportDigestScheduleRun" SET status = $1'
    ]) client.emit(query);
  `;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--require", guardPath, "--eval", source],
      {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stderr, stdout }));
  });
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(
    result.stdout,
    /must-not-appear|secret|SELECT|INSERT|UPDATE/u,
  );
  const collector = createNMinusOneRuntimeLogCollector({
    schedulerCompatibility: true,
  });
  collector.observe(Buffer.from(result.stdout), "stdout");
  const evidence = collector.evidence();
  assert.deepEqual(
    {
      activity: evidence.queryCoverage.activity,
      bonusLedger: evidence.queryCoverage.bonusLedger,
      langameDaily: evidence.queryCoverage.langameDaily,
      pipeline: evidence.queryCoverage.pipeline,
      reportDigest: evidence.queryCoverage.reportDigest,
      retention: evidence.queryCoverage.retention,
      total: evidence.queryCoverage.total,
    },
    {
      activity: 1,
      bonusLedger: 1,
      langameDaily: 1,
      pipeline: 1,
      reportDigest: 1,
      retention: 1,
      total: 6,
    },
  );
});

test("runs health, tenant login, critical reads and exact reversible API fixture", async () => {
  const calls = [];
  let fixtureTitle = null;
  let fixtureId = "fixture-id-1";
  const fakeFetch = async (url, init) => {
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      authorization: init.headers.Authorization ? "present" : "absent",
      body,
      method: init.method,
      path: `${parsed.pathname}${parsed.search}`,
    });
    let responseBody = {};
    let status = 200;
    if (parsed.pathname === "/auth/login") {
      responseBody = {
        accessToken: "x".repeat(80),
        user: { tenantSlug: "tenant-a" },
      };
      status = 201;
    } else if (parsed.pathname === "/auth/me") {
      responseBody = { isPlatformAdmin: false, tenantSlug: "tenant-a" };
    } else if (
      parsed.pathname === "/staff/checklist-templates" &&
      init.method === "POST"
    ) {
      fixtureTitle = body.title;
      responseBody = { id: fixtureId, title: fixtureTitle };
      status = 201;
    } else if (
      parsed.pathname === `/staff/checklist-templates/${fixtureId}` &&
      init.method === "DELETE"
    ) {
      responseBody = { deleted: true, id: fixtureId };
    }
    return new Response(JSON.stringify(responseBody), {
      headers: { "content-type": "application/json" },
      status,
    });
  };
  const observedFixtures = [];
  const result = await executeNMinusOneHttpSmoke({
    apiPort: 44100,
    fetchImpl: fakeFetch,
    loginEmail: "owner@example.test",
    loginPassword: "fixture-password",
    onFixtureCreated: async (fixture) => {
      observedFixtures.push(fixture);
    },
    tenantSlug: "tenant-a",
  });
  assert.equal(result.probes.length, 5 + N_MINUS_ONE_CRITICAL_READS.length);
  assert.deepEqual(observedFixtures, [
    { id: null, title: fixtureTitle },
    { id: fixtureId, title: fixtureTitle },
  ]);
  assert.match(fixtureTitle, /^__n_minus_one_[0-9a-f]{32}$/u);
  assert.deepEqual(
    calls.map(({ method, path: requestPath }) => `${method} ${requestPath}`),
    [
      "GET /health",
      "POST /auth/login",
      "GET /auth/me",
      ...N_MINUS_ONE_CRITICAL_READS.map(
        ({ path: requestPath }) => `GET ${requestPath}`,
      ),
      "POST /staff/checklist-templates",
      `DELETE /staff/checklist-templates/${fixtureId}`,
    ],
  );
  assert.equal(calls[0].authorization, "absent");
  assert.equal(calls[1].authorization, "absent");
  assert.ok(calls.slice(2).every((call) => call.authorization === "present"));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /fixture-password|owner@example|x{20}/u);
});

test("fails tenant-crossed login before any business read or write", async () => {
  let callCount = 0;
  const fakeFetch = async (url) => {
    callCount += 1;
    const pathname = new URL(url).pathname;
    const body =
      pathname === "/auth/login"
        ? { accessToken: "x".repeat(80), user: { tenantSlug: "tenant-b" } }
        : {};
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  await assert.rejects(
    executeNMinusOneHttpSmoke({
      apiPort: 44100,
      fetchImpl: fakeFetch,
      loginEmail: "owner@example.test",
      loginPassword: "fixture-password",
      tenantSlug: "tenant-a",
    }),
    { reasonCode: "N_MINUS_ONE_LOGIN_TENANT_MISMATCH" },
  );
  assert.equal(callCount, 2);
});

test("attests exact database identity, migrations, exclusivity and active tenant", async () => {
  const replies = [
    {
      rows: [
        {
          databaseName: "leetplus_restored_nminus1",
          databaseUser: "smoke",
          serverAddress: "127.0.0.1",
          serverPort: 55439,
          systemIdentifier: EXPECTED.expectedSystemIdentifier,
          transactionReadOnly: "off",
        },
      ],
    },
    {
      rowCount: EXPECTED.expectedMigrationCount,
      rows: Array.from(
        { length: EXPECTED.expectedMigrationCount },
        (_, index) => ({
          migrationName:
            index === EXPECTED.expectedMigrationCount - 1
              ? EXPECTED.expectedMigrationHead
              : `202608${String(index + 1).padStart(8, "0")}_fixture`,
        }),
      ),
    },
    { rows: [{ count: 0 }] },
    { rows: [{ count: 0 }] },
    { rowCount: 1, rows: [{ id: "tenant-id-a" }] },
  ];
  const client = {
    query: async () => replies.shift(),
  };
  const result = await inspectNMinusOneDatabase(
    client,
    normalizeNMinusOneExpectedTarget(EXPECTED),
    assertNMinusOneDatabaseUrl(DATABASE_URL),
  );
  assert.deepEqual(
    {
      databaseName: result.databaseName,
      migrationCount: result.migrationCount,
      migrationHead: result.migrationHead,
      serverAddress: result.serverAddress,
      serverPort: result.serverPort,
    },
    {
      databaseName: "leetplus_restored_nminus1",
      migrationCount: 187,
      migrationHead: EXPECTED.expectedMigrationHead,
      serverAddress: "127.0.0.1",
      serverPort: 55439,
    },
  );
  assert.match(result.systemIdentifierDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.tenantIdentityDigest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(JSON.stringify(result), /tenant-id-a|761234/u);
});

test("cleans a lost-response create by exact random title when no id was returned", async () => {
  const calls = [];
  const replies = [
    { rowCount: 1, rows: [{ id: "tenant-id-a" }] },
    { rows: [{ count: 1 }] },
    { rowCount: 1, rows: [] },
    { rows: [{ count: 0 }] },
  ];
  const client = {
    query: async (text, parameters) => {
      calls.push({ parameters, text });
      return replies.shift();
    },
  };
  const result = await cleanupNMinusOneFixture(client, "tenant-a", {
    id: null,
    title: "__n_minus_one_0123456789abcdef0123456789abcdef",
  });
  assert.deepEqual(result, { directCleanupRequired: true, residue: 0 });
  assert.match(calls[2].text, /DELETE FROM "StaffChecklistTemplate"/u);
  assert.match(calls[2].text, /"tenantId" = \$1 AND title = \$2/u);
  assert.deepEqual(calls[2].parameters, [
    "tenant-id-a",
    "__n_minus_one_0123456789abcdef0123456789abcdef",
  ]);
});

function schedulerSnapshotClient({ dailyCount, statsBase, timestamp }) {
  return {
    async query(text) {
      if (text.includes("FROM pg_stat_database")) {
        return {
          rowCount: 1,
          rows: [
            {
              otherSessions: "0",
              statsReset: "2026-08-20 00:00:00+00",
              tuplesDeleted: String(statsBase + 1),
              tuplesFetched: String(statsBase + 2),
              tuplesInserted: String(statsBase + 3),
              tuplesReturned: String(statsBase + 4),
              tuplesUpdated: String(statsBase + 5),
              xactCommit: String(statsBase + 6),
              xactRollback: String(statsBase + 7),
            },
          ],
        };
      }
      if (text.includes("FROM pg_stat_user_tables")) {
        return {
          rowCount: 2,
          rows: [
            {
              tableName: "DailyDataCoverage",
              tuplesDeleted: "0",
              tuplesInserted: String(statsBase),
              tuplesUpdated: "0",
            },
            {
              tableName: "Tenant",
              tuplesDeleted: "0",
              tuplesInserted: "4",
              tuplesUpdated: "2",
            },
          ],
        };
      }
      const table = /FROM "([A-Za-z0-9]+)"/u.exec(text)?.[1];
      assert.ok(table, text);
      const isDaily = table === "DailyDataCoverage";
      if (text.includes("GROUP BY status")) {
        return {
          rowCount: isDaily && dailyCount > 0 ? 1 : 0,
          rows:
            isDaily && dailyCount > 0
              ? [{ count: String(dailyCount), status: "COMPLETE" }]
              : [],
        };
      }
      return {
        rowCount: 1,
        rows: [
          {
            maxTimestamp: isDaily && dailyCount > 0 ? timestamp : null,
            rowCount: isDaily ? String(dailyCount) : "0",
          },
        ],
      };
    },
  };
}

test("captures aggregate scheduler DB snapshots and produces an exact delta", async () => {
  const before = await captureNMinusOneSchedulerDatabaseSnapshot(
    schedulerSnapshotClient({
      dailyCount: 1,
      statsBase: 100,
      timestamp: "2026-08-20 08:00:00+00",
    }),
  );
  const after = await captureNMinusOneSchedulerDatabaseSnapshot(
    schedulerSnapshotClient({
      dailyCount: 2,
      statsBase: 110,
      timestamp: "2026-08-20 08:01:00+00",
    }),
  );
  const diff = diffNMinusOneSchedulerDatabaseSnapshots(before, after);
  assert.equal(diff.databaseStatsDelta.xactCommit, "10");
  assert.deepEqual(diff.tableWriteStatsDelta, {
    DailyDataCoverage: { tuplesInserted: "10" },
  });
  assert.equal(diff.tableChangeDetected, true);
  assert.deepEqual(diff.tables.DailyDataCoverage, {
    afterMaxTimestamp: "2026-08-20 08:01:00+00",
    beforeMaxTimestamp: "2026-08-20 08:00:00+00",
    maxTimestampChanged: true,
    rowCountDelta: "1",
    statusCountsDelta: { COMPLETE: "1" },
  });
  assert.match(before.snapshotDigest, /^[0-9a-f]{64}$/u);
  assert.match(diff.diffDigest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify({ before, after, diff }),
    /tenant-id|secret/u,
  );
  await assert.rejects(
    captureNMinusOneSchedulerDatabaseSnapshot({
      query: async () => {
        throw new Error("relation secret_table does not exist");
      },
    }),
    { reasonCode: "N_MINUS_ONE_SCHEDULER_SNAPSHOT_QUERY_FAILED" },
  );
});

test("scheduler evidence requires all six starts, schema query families, and bounded terminals", () => {
  const runtimeEvidence = {
    invalidCoverageMarkers: 0,
    prismaErrors: 0,
    queryCoverage: {
      activity: 1,
      bonusLedger: 1,
      delete: 0,
      insert: 1,
      langameDaily: 1,
      pipeline: 1,
      reportDigest: 1,
      retention: 1,
      select: 5,
      total: 6,
      update: 0,
    },
    runtimeErrors: 0,
    schedulerStarted: {
      activity: 1,
      bonusLedger: 1,
      langameDaily: 1,
      pipeline: 1,
      reportDigest: 1,
      retention: 1,
    },
    schedulerTerminal: {
      activity: 0,
      bonusLedger: 1,
      langameDaily: 0,
      pipeline: 1,
      reportDigest: 0,
      retention: 1,
    },
  };
  assert.deepEqual(
    assertNMinusOneSchedulerCompatibilityEvidence(runtimeEvidence, {
      diffDigest: "a".repeat(64),
    }),
    { accepted: true },
  );
  assert.throws(
    () =>
      assertNMinusOneSchedulerCompatibilityEvidence(
        {
          ...runtimeEvidence,
          queryCoverage: {
            ...runtimeEvidence.queryCoverage,
            reportDigest: 0,
          },
        },
        { diffDigest: "a".repeat(64) },
      ),
    { reasonCode: "N_MINUS_ONE_SCHEDULER_QUERY_FAMILY_NOT_COVERED" },
  );
  assert.throws(
    () =>
      assertNMinusOneSchedulerCompatibilityEvidence(
        { ...runtimeEvidence, prismaErrors: 1 },
        { diffDigest: "a".repeat(64) },
      ),
    { reasonCode: "N_MINUS_ONE_SCHEDULER_RUNTIME_ERRORS_DETECTED" },
  );
});
