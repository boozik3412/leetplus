import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  RUN_CONFIRMATION,
  exitCodeForPlan,
  parseRuntimeContract,
  scanDatabase,
} from "./staff-task-integrity-reconciliation-plan.mjs";

const SCRIPT_NAME = "staff-task-integrity-reconciliation-catalog-smoke";
const SMOKE_CONFIRMATION =
  "run-staff-task-integrity-reconciliation-catalog-smoke";
const HMAC_KEY = "catalog-smoke-reconciliation-hmac-aaaaaaaa";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const NON_PRODUCTION_DATABASE_PATTERN =
  /(?:^|[_-])(?:dev|development|test|testing|ci|local)(?:$|[_-])/i;

const HELP = `
${SCRIPT_NAME}

Adversarial PostgreSQL smoke for the exact StaffTask reconciliation catalog
gate. It clones a local/CI database twice, introduces one FK drift and one
index drift, verifies fail-closed rejection, and drops the disposable clone.

Usage:
  node scripts/staff-task-integrity-reconciliation-catalog-smoke.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run local safety checks without reading the DB.

Required environment:
  DATABASE_URL
    Must target PostgreSQL on localhost and a database name carrying a
    dev/test/ci/local marker.
  RELEASE_SHA
    Exact 40-character lowercase hexadecimal release commit.
  STAFF_TASK_INTEGRITY_RECONCILIATION_CATALOG_SMOKE_CONFIRM
    Must equal: ${SMOKE_CONFIRMATION}

Safety:
  The source database is used only as a PostgreSQL template. All adversarial
  DDL is limited to a generated disposable database and the clone is dropped
  with FORCE in a finally block. Production and remote hosts are rejected.
`.trim();

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) {
    return { help: true, selfTest: false };
  }
  const supported = new Set(["--self-test"]);
  for (const argument of argv) {
    if (!supported.has(argument)) {
      contractError("CLI_ARGUMENT_UNSUPPORTED");
    }
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(value)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function parseSourceDatabaseUrl(rawUrl) {
  let sourceUrl;
  try {
    sourceUrl = new URL(String(rawUrl ?? ""));
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  if (
    !["postgresql:", "postgres:"].includes(sourceUrl.protocol) ||
    !LOCAL_HOSTS.has(sourceUrl.hostname)
  ) {
    contractError("LOCAL_POSTGRES_REQUIRED");
  }
  const databaseName = decodeURIComponent(sourceUrl.pathname.slice(1));
  if (
    !/^[A-Za-z0-9_]{1,40}$/.test(databaseName) ||
    !NON_PRODUCTION_DATABASE_PATTERN.test(databaseName) ||
    databaseName === "postgres"
  ) {
    contractError("NON_PRODUCTION_SOURCE_DATABASE_REQUIRED");
  }
  const schema = sourceUrl.searchParams.get("schema");
  if (schema !== null && schema !== "public") {
    contractError("PUBLIC_SCHEMA_REQUIRED");
  }
  return { sourceUrl, databaseName };
}

function databaseUrlFor(sourceUrl, databaseName) {
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  target.searchParams.set("schema", "public");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("connect_timeout", "5");
  target.searchParams.set("pool_timeout", "5");
  return target.toString();
}

function plannerEnvironment(environment, databaseUrl, databaseName) {
  return {
    DATABASE_URL: databaseUrl,
    RELEASE_SHA: environment.RELEASE_SHA,
    STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: "development",
    STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM: RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY: HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE: databaseName,
  };
}

async function executeStatements(databaseUrl, statements) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function readPlan(environment, databaseUrl, databaseName) {
  const scopedEnvironment = plannerEnvironment(
    environment,
    databaseUrl,
    databaseName,
  );
  const config = parseRuntimeContract(scopedEnvironment);
  return scanDatabase(scopedEnvironment, config);
}

function assertBaseline(plan) {
  assert.equal(plan.schema.ready, true);
  assert.equal(plan.summary.inventoryExecuted, true);
  assert.notEqual(exitCodeForPlan(plan), 3);
}

function assertSchemaDriftRejected(plan) {
  assert.equal(plan.schema.ready, false);
  assert.equal(plan.summary.decision, "SCHEMA_MISMATCH");
  assert.equal(plan.summary.inventoryExecuted, false);
  assert.equal(plan.summary.blockingTotal, null);
  assert.equal(plan.summary.reviewTotal, null);
  assert.deepEqual(plan.findings, []);
  assert.equal(exitCodeForPlan(plan), 3);
}

export function runSelfTest() {
  assert.deepEqual(parseArguments(["--apply", "--help"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });
  assert.equal(
    quoteIdentifier("lp_catalog_gate_ci_123"),
    '"lp_catalog_gate_ci_123"',
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres@db.example.com/leetplus_ci?schema=public",
      ),
    { code: "LOCAL_POSTGRES_REQUIRED" },
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres@127.0.0.1/leetplus?schema=public",
      ),
    { code: "NON_PRODUCTION_SOURCE_DATABASE_REQUIRED" },
  );
  return {
    script: SCRIPT_NAME,
    status: "PASS",
    checks: 6,
    sourceDatabaseWrites: false,
    disposableCloneOnly: true,
  };
}

export async function runSmoke(environment = process.env) {
  if (
    environment.STAFF_TASK_INTEGRITY_RECONCILIATION_CATALOG_SMOKE_CONFIRM !==
    SMOKE_CONFIRMATION
  ) {
    contractError("SMOKE_CONFIRMATION_REQUIRED");
  }
  if (!/^[0-9a-f]{40}$/.test(String(environment.RELEASE_SHA ?? ""))) {
    contractError("RELEASE_SHA_INVALID");
  }

  const { sourceUrl, databaseName: sourceDatabaseName } =
    parseSourceDatabaseUrl(environment.DATABASE_URL);
  const cloneDatabaseName = `lp_catalog_gate_ci_${process.pid}`;
  const cloneDatabaseUrl = databaseUrlFor(sourceUrl, cloneDatabaseName);
  const adminDatabaseUrl = databaseUrlFor(sourceUrl, "postgres");
  const admin = new PrismaClient({
    datasourceUrl: adminDatabaseUrl,
    log: [],
  });
  const quotedClone = quoteIdentifier(cloneDatabaseName);
  const quotedSource = quoteIdentifier(sourceDatabaseName);
  let cloneCreated = false;

  async function dropClone() {
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS ${quotedClone} WITH (FORCE)`,
    );
    cloneCreated = false;
  }

  async function resetClone() {
    await dropClone();
    await admin.$executeRawUnsafe(
      `CREATE DATABASE ${quotedClone} TEMPLATE ${quotedSource}`,
    );
    cloneCreated = true;
  }

  try {
    await resetClone();
    assertBaseline(
      await readPlan(environment, cloneDatabaseUrl, cloneDatabaseName),
    );
    await executeStatements(cloneDatabaseUrl, [
      `ALTER TABLE public."StaffTask"
         ADD CONSTRAINT "StaffTask_storeId_catalog_conflict_fkey"
         FOREIGN KEY ("storeId")
         REFERENCES public."Store" ("id")
         ON DELETE CASCADE
         ON UPDATE RESTRICT
         NOT VALID`,
    ]);
    const foreignKeyDrift = await readPlan(
      environment,
      cloneDatabaseUrl,
      cloneDatabaseName,
    );
    assertSchemaDriftRejected(foreignKeyDrift);
    assert.equal(
      foreignKeyDrift.schema.actual.foreignKeyContractMismatchCount,
      0,
    );
    assert.equal(
      foreignKeyDrift.schema.actual.unexpectedProtectedForeignKeyCount,
      1,
    );

    await resetClone();
    await executeStatements(cloneDatabaseUrl, [
      `ALTER INDEX public."store_tenant_id_uidx"
         RENAME TO "store_tenant_id_uidx_catalog_backup"`,
      `CREATE UNIQUE INDEX "store_tenant_id_uidx"
         ON public."Store" ("id", "tenantId")`,
    ]);
    const indexDrift = await readPlan(
      environment,
      cloneDatabaseUrl,
      cloneDatabaseName,
    );
    assertSchemaDriftRejected(indexDrift);
    assert.equal(indexDrift.schema.actual.parentIndexContractMismatchCount, 1);

    return {
      script: SCRIPT_NAME,
      status: "PASS",
      scenarios: 2,
      foreignKeyDriftRejected: true,
      indexDriftRejected: true,
      inventorySkippedOnSchemaMismatch: true,
      sourceDatabaseWrites: false,
    };
  } finally {
    try {
      if (cloneCreated) {
        await dropClone();
      }
    } finally {
      await admin.$disconnect();
    }
  }
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  let options;
  try {
    options = parseArguments(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const result = options.selfTest
      ? runSelfTest()
      : await runSmoke(environment);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "CATALOG_SMOKE_FAILED";
    process.stderr.write(
      `${JSON.stringify({
        script: SCRIPT_NAME,
        status: "ERROR",
        error: { code },
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}
