import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  APPLICATION_RUNTIME_FUNCTIONS,
  EXCLUDED_WORKER_FUNCTIONS,
  expectedApplyConfirmation,
} from "./runtime-function-enrollment.mjs";

const REQUIRED_CONFIRMATION = "run-runtime-function-enrollment-smoke";
const SAFE_LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
]);
const ROLE_PREFIX = "lp_runtime_acl_smoke_";
const CLI_PATH = fileURLToPath(
  new URL("./runtime-function-enrollment.cli.mjs", import.meta.url),
);

const HELP = `LeetPlus runtime function ACL enrollment PostgreSQL smoke

Usage:
  node scripts/runtime-function-enrollment-smoke.mjs
  node scripts/runtime-function-enrollment-smoke.mjs --self-test
  node scripts/runtime-function-enrollment-smoke.mjs --help

Required environment:
  DATABASE_URL
  RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}

Safety:
  - PostgreSQL 16, loopback and a dedicated *_ci database are mandatory.
  - Exact latest migration 166 and exact completed count 166 are mandatory.
  - Only one generated disposable LOGIN NOINHERIT role is created.
  - Production is prohibited.
  - The generated role and every grant are removed in finally.
`;

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseSafeSmokeDatabaseUrl(rawValue) {
  assert.ok(rawValue, "DATABASE_URL is required.");
  const parsed = new URL(rawValue);
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "DATABASE_URL must use PostgreSQL.",
  );
  assert.ok(
    SAFE_LOOPBACK_HOSTS.has(parsed.hostname),
    "Runtime function enrollment smoke requires loopback PostgreSQL.",
  );
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+/u, ""),
  );
  assert.match(
    databaseName,
    /^[a-z][a-z0-9_]*_ci$/u,
    "Runtime function enrollment smoke requires a dedicated *_ci database.",
  );
  assert.notEqual(databaseName, "postgres");
  assert.deepEqual(
    [...parsed.searchParams.keys()],
    ["schema"],
    "DATABASE_URL may contain only schema=public.",
  );
  assert.equal(parsed.searchParams.get("schema"), "public");
  return { databaseName, parsed };
}

function runtimeDatabaseUrl(sourceUrl, roleName, password) {
  const result = new URL(sourceUrl);
  result.username = roleName;
  result.password = password;
  return result.toString();
}

function extractErrorText(error) {
  const messages = new Set();
  const visited = new Set();
  const pending = [error];
  while (pending.length > 0 && visited.size < 64) {
    const candidate = pending.shift();
    if (typeof candidate === "string") {
      messages.add(candidate);
      continue;
    }
    if (
      candidate === null ||
      (typeof candidate !== "object" &&
        typeof candidate !== "function") ||
      visited.has(candidate)
    ) {
      continue;
    }
    visited.add(candidate);
    for (const property of Reflect.ownKeys(candidate)) {
      try {
        pending.push(candidate[property]);
      } catch {
        // Other nested driver properties still carry the server diagnostic.
      }
    }
  }
  return [...messages].join("\n");
}

function extractSqlStates(error) {
  return new Set(
    [...extractErrorText(error).matchAll(/\b([0-9A-Z]{5})\b/gu)].map(
      (match) => match[1],
    ),
  );
}

function sanitizeErrorText(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s")]+/giu, "<redacted-postgresql-url>")
    .replace(/password=[^\s;]+/giu, "password=<redacted>")
    .replace(/\bPASSWORD\s+'[^']*'/giu, "PASSWORD '<redacted>'");
}

async function expectSqlState(expected, operation, messagePattern) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected SQLSTATE ${expected}.`);
  const states = extractSqlStates(caught);
  assert.ok(
    states.has(expected),
    `Expected SQLSTATE ${expected}; observed ${JSON.stringify([...states])}.`,
  );
  assert.match(extractErrorText(caught), messagePattern);
}

function runCli(mode, environment) {
  return spawnSync(process.execPath, [CLI_PATH, `--${mode}`], {
    env: {
      ...process.env,
      ...environment,
    },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
}

function parseCliReceipt(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]);
}

function assertNoSecretLeak(result, secrets) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  for (const secret of secrets) {
    assert.ok(secret);
    assert.doesNotMatch(output, new RegExp(escapeRegExp(secret), "u"));
  }
  assert.doesNotMatch(output, /postgres(?:ql)?:\/\//iu);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function callTransitionKey(runtime) {
  const rows = await runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_delivery_transition_key_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT),
        CAST($3 AS TEXT),
        CAST($4 AS BIGINT),
        CAST($5 AS INTEGER),
        CAST($6 AS TEXT),
        CAST($7 AS INTEGER),
        CAST($8 AS TEXT),
        CAST($9 AS TEXT),
        CAST($10 AS TEXT),
        CAST($11 AS TEXT)
      ) AS transition_key
    `,
    "tenant-smoke",
    "delivery-smoke",
    "reward-smoke",
    1,
    0,
    "DELIVERY_RETRIED",
    null,
    null,
    null,
    "FAILED",
    "READY",
  );
  return rows[0]?.transition_key;
}

function callRewardDeliveryLock(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_reward_delivery_lock_v1"(
        CAST($1 AS TEXT),
        CAST($2 AS TEXT)
      )
    `,
    "",
    "",
  );
}

function callWorkerEventBoundary(runtime) {
  return runtime.$queryRawUnsafe(
    `
      SELECT public."guest_game_delivery_record_event_v1"(
        CAST($1 AS JSON)
      )
    `,
    "{}",
  );
}

async function runSmoke() {
  assert.notEqual(
    process.env.NODE_ENV,
    "production",
    "Runtime function enrollment smoke is prohibited in production.",
  );
  assert.equal(
    process.env.RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM,
    REQUIRED_CONFIRMATION,
    `Set RUNTIME_FUNCTION_ENROLLMENT_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );

  const rawDatabaseUrl = process.env.DATABASE_URL;
  const { databaseName, parsed } =
    parseSafeSmokeDatabaseUrl(rawDatabaseUrl);
  const suffix = randomBytes(8).toString("hex");
  const roleName = `${ROLE_PREFIX}${suffix}`;
  const password = randomBytes(32).toString("hex");
  const role = quoteIdentifier(roleName);
  const admin = new PrismaClient({ log: [] });
  let runtime = null;
  let roleCreated = false;

  try {
    const [server] = await admin.$queryRaw`
      SELECT
        current_database() AS database_name,
        current_setting('server_version_num')::integer
          AS server_version_number,
        (
          SELECT rolsuper
          FROM pg_roles
          WHERE rolname = CURRENT_USER
        ) AS is_superuser
    `;
    assert.equal(server.database_name, databaseName);
    assert.equal(Math.floor(server.server_version_number / 10_000), 16);
    assert.equal(
      server.is_superuser,
      true,
      "Disposable smoke requires the CI administrative identity.",
    );

    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    roleCreated = true;
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${role}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${role}`,
    );

    const runtimeUrl = runtimeDatabaseUrl(parsed, roleName, password);
    runtime = new PrismaClient({
      datasources: { db: { url: runtimeUrl } },
      log: [],
    });

    await expectSqlState(
      "42501",
      () => callTransitionKey(runtime),
      /permission denied for function guest_game_delivery_transition_key_v1/iu,
    );
    await expectSqlState(
      "42501",
      () => callRewardDeliveryLock(runtime),
      /permission denied for function guest_game_reward_delivery_lock_v1/iu,
    );
    await expectSqlState(
      "42501",
      () => callWorkerEventBoundary(runtime),
      /permission denied for function guest_game_delivery_record_event_v1/iu,
    );

    const cliEnvironment = {
      DATABASE_URL: rawDatabaseUrl,
      RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: databaseName,
      RUNTIME_FUNCTION_ENROLLMENT_ROLE: roleName,
    };
    const beforeCheck = runCli("check", cliEnvironment);
    assert.notEqual(beforeCheck.status, 0);
    assert.match(
      beforeCheck.stderr,
      /RUNTIME_FUNCTION_ENROLLMENT_DRIFT/u,
    );
    assertNoSecretLeak(beforeCheck, [rawDatabaseUrl, password]);

    const apply = runCli("apply", {
      ...cliEnvironment,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        databaseName,
        roleName,
      ),
    });
    const applyReceipt = parseCliReceipt(apply);
    assert.equal(applyReceipt.decision, "ENROLLED");
    assert.equal(applyReceipt.changed, true);
    assert.equal(
      applyReceipt.postconditions.applicationExecuteCount,
      APPLICATION_RUNTIME_FUNCTIONS.length,
    );
    assert.equal(
      applyReceipt.postconditions.excludedWorkerExecuteCount,
      0,
    );
    assertNoSecretLeak(apply, [rawDatabaseUrl, password]);

    const transitionKey = await callTransitionKey(runtime);
    assert.match(transitionKey, /^v1:[0-9a-f]{64}$/u);
    await expectSqlState(
      "22023",
      () => callRewardDeliveryLock(runtime),
      /requires tenant and reward identifiers/iu,
    );
    await expectSqlState(
      "42501",
      () => callWorkerEventBoundary(runtime),
      /permission denied for function guest_game_delivery_record_event_v1/iu,
    );

    const replay = runCli("apply", {
      ...cliEnvironment,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        databaseName,
        roleName,
      ),
    });
    const replayReceipt = parseCliReceipt(replay);
    assert.equal(replayReceipt.decision, "ALREADY_ENROLLED");
    assert.equal(replayReceipt.changed, false);
    assertNoSecretLeak(replay, [rawDatabaseUrl, password]);

    const afterCheck = runCli("check", cliEnvironment);
    const checkReceipt = parseCliReceipt(afterCheck);
    assert.equal(checkReceipt.decision, "COMPLIANT");
    assert.equal(checkReceipt.changed, false);
    assert.equal(checkReceipt.applicationFunctions.length, 2);
    assert.equal(checkReceipt.excludedWorkerFunctions.length, 1);
    assertNoSecretLeak(afterCheck, [rawDatabaseUrl, password]);

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        schemaVersion: 1,
        database: databaseName,
        preEnrollmentPermissionDenials: 3,
        applicationFunctionGrants:
          APPLICATION_RUNTIME_FUNCTIONS.length,
        excludedWorkerFunctionGrants: 0,
        excludedWorkerFunctionsDenied:
          EXCLUDED_WORKER_FUNCTIONS.length,
        idempotentReplay: true,
        postEnrollmentCheck: "COMPLIANT",
      })}\n`,
    );
  } finally {
    let cleanupError = null;
    if (runtime) {
      await runtime.$disconnect().catch((error) => {
        cleanupError ??= error;
      });
    }
    if (roleCreated) {
      await admin
        .$executeRawUnsafe(`DROP OWNED BY ${role}`)
        .catch((error) => {
          cleanupError ??= error;
        });
      await admin
        .$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`)
        .catch((error) => {
          cleanupError ??= error;
        });
    }
    await admin.$disconnect().catch((error) => {
      cleanupError ??= error;
    });
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

function runSelfTest() {
  const safe = parseSafeSmokeDatabaseUrl(
    "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  assert.throws(
    () =>
      parseSafeSmokeDatabaseUrl(
        "postgresql://postgres:test@db.internal:5432/leetplus_ci?schema=public",
      ),
    /loopback/u,
  );
  assert.throws(
    () =>
      parseSafeSmokeDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus?schema=public",
      ),
    /dedicated \*_ci/u,
  );
  assert.equal(
    escapeRegExp("postgresql://user:p[a]ss"),
    "postgresql://user:p\\[a\\]ss",
  );
  assert.equal(
    sanitizeErrorText("CREATE ROLE test PASSWORD 'secret-value'"),
    "CREATE ROLE test PASSWORD '<redacted>'",
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      decision: "SELF_TEST_PASSED",
    })}\n`,
  );
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(HELP);
} else if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest();
} else if (args.length === 0) {
  runSmoke().catch((error) => {
    process.stderr.write(
      `${sanitizeErrorText(extractErrorText(error))}\n`,
    );
    process.exitCode = 1;
  });
} else {
  process.stderr.write("Use --help, --self-test, or no arguments.\n");
  process.exitCode = 1;
}
