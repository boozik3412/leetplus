import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { platform, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { spawn } from "node:child_process";
import { isProxy } from "node:util/types";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT,
  buildCurrent180Current190PostgresqlRehearsalChildEnvironment,
  buildCurrent180Current190PostgresqlRehearsalOwnershipMarker,
  inspectCurrent180Current190PostgresqlRehearsalEnvironment,
  validateCurrent180Current190PostgresqlRehearsalDatabaseNames,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY,
  buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest,
  quoteCurrent180Current190PostgresqlIdentifier,
  quoteCurrent180Current190PostgresqlLiteral,
} from "./current180-current190-disposable-postgresql-rehearsal-sql.mjs";
import {
  CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_RUNNER_VERIFICATION_CONTRACT,
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt,
  assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-materializer.mjs";

export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_V1";

const NODE_EXECUTABLE_SHA256 =
  "39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636";
const PRISMA_EXECUTABLE_SHA256 =
  "c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0";
const SOURCE_DATABASE_NAME = "leetplus_current180_ci";
const MAINTENANCE_DATABASE_NAME = "postgres";
const OWNER_ROLE = "postgres";
const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PORT = 55_432;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RUN_TOKEN_PATTERN = /^[0-9a-f]{32}$/u;
const OWNERSHIP_MARKER_PATTERN =
  /^LEETPLUS_CURRENT180190_REHEARSAL_V1:[0-9a-f]{64}$/u;
const MATERIALIZER_ROOT_PATTERN = /^lp-c180190-[0-9a-f]{64}-[A-Za-z0-9]{6}$/u;
const JOURNAL_ROOT_PATTERN =
  /^lp-c180190-journal-[0-9a-f]{32}-[A-Za-z0-9]{6}$/u;
const ADVISORY_LOCK_KEY = 5_498_909_006_068_439_344n;
const MAX_OID = 4_294_967_295;
const MAX_DEPLOY_OUTPUT_BYTES = 131_072;
const DEPLOY_TIMEOUT_MILLISECONDS = 330_000;
const CHILD_TERMINATION_ESCALATION_MILLISECONDS = 1_000;
const CHILD_EXIT_PROOF_TIMEOUT_MILLISECONDS = 5_000;
const PINNED_WINDOWS_SYSTEM_ROOT = "C:\\Windows";
const ISOLATED_NODE_BOOTSTRAP = `const decode = (value) => Buffer.from(value, "base64url").toString("utf8");
const allowedKeys = JSON.parse(decode(process.argv[1]));
const allowed = new Set(allowedKeys);
for (const key of Object.keys(process.env)) {
  if (!allowed.has(key)) delete process.env[key];
}
if (JSON.stringify(Object.keys(process.env).sort()) !== JSON.stringify(allowedKeys)) process.exit(86);
const mode = process.argv[2];
if (mode === "prisma") {
  const prismaPath = process.argv[3];
  const schemaPath = process.argv[4];
  const { readFileSync } = await import("node:fs");
  const { default: Module } = await import("node:module");
  const { dirname } = await import("node:path");
  process.argv = [process.execPath, prismaPath, "migrate", "deploy", "--schema", schemaPath];
  const prismaModule = new Module(prismaPath, null);
  prismaModule.filename = prismaPath;
  prismaModule.paths = Module._nodeModulePaths(dirname(prismaPath));
  process.mainModule = prismaModule;
  prismaModule._compile(readFileSync(prismaPath, "utf8"), prismaPath);
} else if (mode === "eval") {
  await import(\`data:text/javascript;base64,\${process.argv[3]}\`);
} else {
  process.exit(87);
}`;
const ADAPTER_KEYS = Object.freeze([
  "acquireClusterLock",
  "attestExecutableRuntime",
  "cleanup",
  "contract",
  "deploy",
  "executeStatement",
  "liveQuery",
  "releaseClusterLock",
]);
const DEPENDENCY_KEYS = Object.freeze([
  "attestExecutables",
  "createPrismaClient",
  "inspectSchemaPath",
  "listTemporaryEntries",
  "spawnPrisma",
]);
const EXPECTED_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  "CURRENT180_CURRENT190_REHEARSAL_AUTHORIZATION_RECEIPT_SHA256",
  "CURRENT180_CURRENT190_REHEARSAL_DATABASE_URL_SHA256",
  "DATABASE_URL",
  "NODE_ENV",
  "NO_COLOR",
  "PGOPTIONS",
  "PRISMA_HIDE_UPDATE_MESSAGE",
]);
const SAFE_CLEANUP_REASONS = new Set([
  "COMPLETED_RELEASE_RUNTIME_RESOURCES",
  "FAIL_CLOSED_AMBIGUOUS_EFFECT_JANITOR",
  "RELEASE_RUNTIME_RESOURCES_AFTER_FAILED_CLEAN",
]);
const PRISMA_DECIMAL_PROTOTYPE = Prisma.Decimal.prototype;
const PRISMA_DECIMAL_TO_STRING = Object.getOwnPropertyDescriptor(
  PRISMA_DECIMAL_PROTOTYPE,
  "toString",
)?.value;
const consumedMaterializerVerificationReceipts = new WeakSet();

const LOCK_ACQUIRE_SQL = `SELECT
  pg_catalog.pg_backend_pid()::integer AS "backendPid",
  pg_catalog.current_database()::text AS "databaseName",
  CURRENT_USER::text AS "roleName",
  pg_catalog.pg_try_advisory_lock($1::bigint) AS "acquired";`;

const LOCK_STATUS_SQL = `SELECT
  pg_catalog.pg_backend_pid()::integer AS "backendPid",
  pg_catalog.current_database()::text AS "databaseName",
  CURRENT_USER::text AS "roleName",
  (
    SELECT pg_catalog.count(*)::integer
    FROM pg_catalog.pg_locks AS held_lock
    WHERE held_lock.locktype = 'advisory'
      AND held_lock.pid = pg_catalog.pg_backend_pid()
      AND held_lock.classid = (($1::bigint >> 32)::integer::oid)
      AND held_lock.objid = (($1::bigint & 4294967295)::bigint::oid)
      AND held_lock.objsubid = 1
      AND held_lock.granted
  ) AS "lockCount";`;

const LOCK_RELEASE_SQL = `SELECT
  pg_catalog.pg_backend_pid()::integer AS "backendPid",
  pg_catalog.current_database()::text AS "databaseName",
  CURRENT_USER::text AS "roleName",
  pg_catalog.pg_advisory_unlock($1::bigint) AS "released";`;

const CONNECTION_IDENTITY_SQL = `SELECT
  pg_catalog.pg_backend_pid()::integer AS "backendPid",
  pg_catalog.current_database()::text AS "databaseName",
  CURRENT_USER::text AS "roleName";`;

const CRASH_RECOVERY_CLUSTER_SQL = `SELECT
  pg_catalog.count(*) FILTER (
    WHERE database.datname ~ '^lp_imtec_[0-9a-f]{32}_ci$'
       OR database.datname ~ '^lp_c180190_[0-9a-f]{32}_ci$'
       OR COALESCE(
         pg_catalog.shobj_description(database.oid, 'pg_database'),
         ''
       ) ~ '^LEETPLUS_CURRENT180190_REHEARSAL_V1:[0-9a-f]{64}$'
       OR pg_catalog.shobj_description(database.oid, 'pg_database') IN (
         $1::text,
         $2::text
       )
  )::integer AS "clusterResidueCount"
FROM pg_catalog.pg_database AS database;`;

const CATALOG_RECONCILIATION_SQL = `WITH scope AS (
  SELECT
    $1::name AS "workingDatabaseName",
    $2::name AS "finalDatabaseName",
    $3::oid AS "expectedOid",
    $4::text AS "expectedMarker",
    $5::text AS "attemptOneOwnershipMarker",
    $6::text AS "attemptTwoOwnershipMarker"
)
SELECT
  database.datname::text AS "databaseName",
  database.oid AS "databaseOid",
  owner.rolname::text AS "ownerName",
  owner.oid AS "ownerOid",
  database.datistemplate AS "isTemplate",
  database.datallowconn AS "allowConnections",
  pg_catalog.shobj_description(database.oid, 'pg_database') AS "marker",
  (
    SELECT pg_catalog.count(*)::integer
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datid = database.oid
      AND activity.pid <> pg_catalog.pg_backend_pid()
  ) AS "activeSessionCount"
FROM pg_catalog.pg_database AS database
INNER JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = database.datdba
CROSS JOIN scope
WHERE database.datname IN (scope."workingDatabaseName", scope."finalDatabaseName")
   OR (scope."expectedOid" IS NOT NULL AND database.oid = scope."expectedOid")
   OR (
     scope."expectedMarker" IS NOT NULL
     AND pg_catalog.shobj_description(database.oid, 'pg_database') = scope."expectedMarker"
   )
   OR (
     pg_catalog.shobj_description(database.oid, 'pg_database') IN (
       scope."attemptOneOwnershipMarker",
       scope."attemptTwoOwnershipMarker"
     )
   )
ORDER BY database.datname COLLATE "C", database.oid;`;

export class Current180Current190DisposablePostgresqlRehearsalRuntimeError extends Error {
  constructor(code, findings = []) {
    super("CURRENT180-CURRENT190 PostgreSQL rehearsal runtime failed closed.");
    this.name = "Current180Current190DisposablePostgresqlRehearsalRuntimeError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, findings = []) {
  throw new Current180Current190DisposablePostgresqlRehearsalRuntimeError(
    code,
    findings,
  );
}

function lostResponse(findings = []) {
  return new Current180Current190DisposablePostgresqlRehearsalRuntimeError(
    "RUNTIME_EFFECT_RESPONSE_LOST",
    findings,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function isPlainData(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype &&
    prototype !== null
  ) {
    return false;
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(descriptors[key], "value") ||
        (key !== "length" && descriptors[key].enumerable !== true),
    )
  ) {
    return false;
  }
  if (Array.isArray(value)) {
    if (keys.length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(descriptors, String(index))) return false;
      if (!isPlainData(descriptors[String(index)].value, seen)) return false;
    }
  } else {
    for (const key of Object.keys(descriptors)) {
      if (!isPlainData(descriptors[key].value, seen)) return false;
    }
  }
  seen.delete(value);
  return true;
}

function exactKeys(value, expectedKeys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    return false;
  }
  return (
    Object.keys(descriptors).sort(compareText).join("\n") ===
    [...expectedKeys].sort(compareText).join("\n")
  );
}

function positiveOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_OID;
}

function assertSha256(value, finding) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("RUNTIME_INPUT_INVALID", [finding]);
  }
}

function assertNamesAndToken(names, runToken) {
  if (typeof runToken !== "string" || !RUN_TOKEN_PATTERN.test(runToken)) {
    fail("RUNTIME_INPUT_INVALID", ["EXACT_RUN_TOKEN_REQUIRED"]);
  }
  let validated;
  try {
    validated =
      validateCurrent180Current190PostgresqlRehearsalDatabaseNames(names);
  } catch {
    fail("RUNTIME_INPUT_INVALID", ["EXACT_DERIVED_DATABASE_NAMES_REQUIRED"]);
  }
  if (validated.runToken !== runToken) {
    fail("RUNTIME_INPUT_INVALID", ["RUN_TOKEN_AND_NAMES_MISMATCH"]);
  }
  return validated;
}

function snapshotEnvironment(environmentSnapshot) {
  if (
    !isPlainData(environmentSnapshot) ||
    Array.isArray(environmentSnapshot) ||
    !Object.isFrozen(environmentSnapshot) ||
    Object.entries(environmentSnapshot).some(
      ([, value]) => typeof value !== "string",
    )
  ) {
    fail("RUNTIME_ENVIRONMENT_INVALID", [
      "EXACT_DEEP_FROZEN_STRING_ENVIRONMENT_SNAPSHOT_REQUIRED",
    ]);
  }
  if (
    Object.keys(environmentSnapshot).some((key) => key.toUpperCase() === "PATH")
  ) {
    fail("RUNTIME_ENVIRONMENT_INVALID", ["AMBIENT_PATH_DENIED"]);
  }
  try {
    inspectCurrent180Current190PostgresqlRehearsalEnvironment(
      environmentSnapshot,
    );
  } catch {
    fail("RUNTIME_ENVIRONMENT_INVALID", [
      "EXPLICIT_REHEARSAL_ENVIRONMENT_REVALIDATION_FAILED",
    ]);
  }
  return deepFreeze({ ...environmentSnapshot });
}

function normalizedNativePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameNativePath(left, right) {
  return normalizedNativePath(left) === normalizedNativePath(right);
}

function pathInside(parent, candidate) {
  const relation = relative(resolve(parent), resolve(candidate));
  return (
    relation !== "" &&
    relation !== ".." &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}

function filesystemIdentity(value) {
  return Object.freeze({ dev: String(value.dev), ino: String(value.ino) });
}

function validFilesystemIdentity(value) {
  return (
    exactKeys(value, ["dev", "ino"]) &&
    typeof value.dev === "string" &&
    typeof value.ino === "string" &&
    /^\d+$/u.test(value.dev) &&
    /^\d+$/u.test(value.ino)
  );
}

function sameFilesystemIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function databaseUrl(environment, databaseName, runToken, purpose) {
  const source = new URL(
    environment[
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SOURCE_URL_ENVIRONMENT
    ],
  );
  source.pathname = `/${databaseName}`;
  source.search = "";
  source.searchParams.set("schema", "public");
  source.searchParams.set("connection_limit", "1");
  source.searchParams.set("connect_timeout", "5");
  source.searchParams.set("socket_timeout", "300");
  source.searchParams.set(
    "application_name",
    `lp-current180190-${runToken}-${purpose}`,
  );
  return source.toString();
}

function normalizePrismaValue(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("RUNTIME_QUERY_RESULT_INVALID", ["FINITE_NUMBER_REQUIRED"]);
    }
    return value;
  }
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString(10);
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    fail("RUNTIME_QUERY_RESULT_INVALID", ["ACYCLIC_JSON_VALUE_REQUIRED"]);
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) {
      fail("RUNTIME_QUERY_RESULT_INVALID", ["VALID_DATE_REQUIRED"]);
    }
    return value.toISOString();
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  const prototype = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (prototype === PRISMA_DECIMAL_PROTOTYPE) {
    const decimalKeys = Reflect.ownKeys(descriptors);
    const digits = descriptors.d?.value;
    if (
      typeof PRISMA_DECIMAL_TO_STRING !== "function" ||
      decimalKeys.some(
        (key) =>
          typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
      ) ||
      !exactKeys(
        Object.fromEntries(
          Object.entries(descriptors).map(([key, descriptor]) => [
            key,
            descriptor.value,
          ]),
        ),
        ["constructor", "d", "e", "s"],
      ) ||
      descriptors.constructor.value !== Prisma.Decimal ||
      !Number.isSafeInteger(descriptors.s.value) ||
      ![-1, 1].includes(descriptors.s.value) ||
      !Number.isSafeInteger(descriptors.e.value) ||
      !isPlainData(digits) ||
      !Array.isArray(digits) ||
      digits.some((digit) => !Number.isSafeInteger(digit) || digit < 0)
    ) {
      fail("RUNTIME_QUERY_RESULT_INVALID", [
        "EXACT_PRISMA_DECIMAL_DATA_REQUIRED",
      ]);
    }
    return Reflect.apply(PRISMA_DECIMAL_TO_STRING, value, []);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizePrismaValue(entry, seen));
    seen.delete(value);
    return normalized;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("RUNTIME_QUERY_RESULT_INVALID", [
      "SUPPORTED_PRISMA_SCALAR_OR_PLAIN_OBJECT_REQUIRED",
    ]);
  }
  if (
    Reflect.ownKeys(descriptors).some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    fail("RUNTIME_QUERY_RESULT_INVALID", [
      "ACCESSOR_AND_SYMBOL_RESULTS_DENIED",
    ]);
  }
  const normalized = {};
  for (const key of Object.keys(descriptors).sort(compareText)) {
    normalized[key] = normalizePrismaValue(descriptors[key].value, seen);
  }
  seen.delete(value);
  return normalized;
}

function normalizeRows(rawRows) {
  if (!Array.isArray(rawRows)) {
    fail("RUNTIME_QUERY_RESULT_INVALID", ["PRISMA_ROWS_ARRAY_REQUIRED"]);
  }
  return rawRows.map((row) => normalizePrismaValue(row));
}

function validateConnection(connection, names) {
  if (!exactKeys(connection, ["databaseName", "kind"])) {
    fail("RUNTIME_CONNECTION_INVALID", ["EXACT_CONNECTION_REQUIRED"]);
  }
  const valid =
    (connection.kind === "MAINTENANCE" &&
      connection.databaseName === MAINTENANCE_DATABASE_NAME) ||
    (connection.kind === "SOURCE" &&
      connection.databaseName === SOURCE_DATABASE_NAME) ||
    (connection.kind === "TARGET" &&
      [names.workingDatabaseName, names.finalDatabaseName].includes(
        connection.databaseName,
      ));
  if (!valid) {
    fail("RUNTIME_CONNECTION_INVALID", [
      "PINNED_SOURCE_MAINTENANCE_OR_DERIVED_TARGET_REQUIRED",
    ]);
  }
  return connection;
}

function assertConnectionIdentity(row, expectedDatabaseName) {
  const normalized = normalizePrismaValue(row);
  if (
    !exactKeys(normalized, ["backendPid", "databaseName", "roleName"]) ||
    !Number.isSafeInteger(normalized.backendPid) ||
    normalized.backendPid < 1 ||
    normalized.databaseName !== expectedDatabaseName ||
    normalized.roleName !== OWNER_ROLE
  ) {
    fail("RUNTIME_CONNECTION_IDENTITY_INVALID", [
      "EXACT_LIVE_POSTGRESQL_CONNECTION_IDENTITY_REQUIRED",
    ]);
  }
  return normalized;
}

function publicConnectionIdentity(identity) {
  return deepFreeze({
    backendPid: identity.backendPid,
    databaseName: identity.databaseName,
    host: LOOPBACK_HOST,
    port: LOOPBACK_PORT,
    roleName: identity.roleName,
  });
}

function validateQueryProjection(rows, querySpec) {
  const expected = [...querySpec.resultColumns].sort(compareText).join("\n");
  for (const row of rows) {
    if (
      !exactKeys(row, querySpec.resultColumns) ||
      Object.keys(row).sort(compareText).join("\n") !== expected
    ) {
      fail("RUNTIME_QUERY_RESULT_INVALID", [
        "EXACT_QUERY_SPEC_PROJECTION_REQUIRED",
      ]);
    }
  }
}

function assertQueryConnection(querySpec, connection) {
  const allowed =
    (querySpec.connection === "MAINTENANCE" &&
      connection.kind === "MAINTENANCE") ||
    (querySpec.connection === "SOURCE" && connection.kind === "SOURCE") ||
    (querySpec.connection === "SOURCE_OR_TARGET" &&
      ["SOURCE", "TARGET"].includes(connection.kind));
  if (!allowed) {
    fail("RUNTIME_QUERY_INVALID", ["QUERY_SPEC_AND_CONNECTION_KIND_MISMATCH"]);
  }
}

function exactFalseAuthority(value) {
  const keys = [
    "callerSuppliedRowsAuthorized",
    "databaseMutationAuthorized",
    "moduleReceiptAuthorized",
    "productionApplyAuthorized",
    "roleOrGrantMutationAuthorized",
  ];
  return exactKeys(value, keys) && keys.every((key) => value[key] === false);
}

function statementDigestValid(statementSpec) {
  if (
    typeof statementSpec.statementSpecDigest !== "string" ||
    !SHA256_PATTERN.test(statementSpec.statementSpecDigest)
  ) {
    return false;
  }
  const document = { ...statementSpec };
  delete document.statementSpecDigest;
  return statementSpec.statementSpecDigest === sha256(canonicalJson(document));
}

function commonStatementValid(statementSpec) {
  return (
    exactKeys(statementSpec, [
      "authority",
      "connection",
      "contract",
      "effects",
      "executionBoundary",
      "kind",
      "parameters",
      "preconditions",
      "requiresAutocommit",
      "sql",
      "statementSpecDigest",
    ]) &&
    exactFalseAuthority(statementSpec.authority) &&
    statementSpec.connection === "MAINTENANCE" &&
    statementSpec.contract ===
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_STATEMENT_V1" &&
    exactKeys(statementSpec.effects, [
      "databaseMutationPossibleIfExecuted",
      "executed",
    ]) &&
    statementSpec.effects.databaseMutationPossibleIfExecuted === true &&
    statementSpec.effects.executed === false &&
    canonicalJson(statementSpec.executionBoundary) ===
      canonicalJson(
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY,
      ) &&
    Array.isArray(statementSpec.parameters) &&
    statementSpec.parameters.length === 0 &&
    statementSpec.requiresAutocommit === true &&
    typeof statementSpec.sql === "string" &&
    Buffer.byteLength(statementSpec.sql, "utf8") <= 4_096 &&
    !statementSpec.sql.includes("\u0000") &&
    statementDigestValid(statementSpec)
  );
}

function identityPreconditionsValid(value) {
  return (
    exactKeys(value, [
      "activeSessionCount",
      "catalogReconciliationMustImmediatelyPrecedeExecution",
      "identityReceiptDigest",
      "receiptIsExecutionAuthority",
    ]) &&
    value.activeSessionCount === 0 &&
    value.catalogReconciliationMustImmediatelyPrecedeExecution === true &&
    typeof value.identityReceiptDigest === "string" &&
    SHA256_PATTERN.test(value.identityReceiptDigest) &&
    value.receiptIsExecutionAuthority === false
  );
}

function validateStatementSpec(statementSpec, names) {
  if (!commonStatementValid(statementSpec)) {
    fail("RUNTIME_STATEMENT_INVALID", [
      "EXACT_INTEGRITY_BOUND_STATEMENT_SPEC_REQUIRED",
    ]);
  }
  const working = quoteCurrent180Current190PostgresqlIdentifier(
    names.workingDatabaseName,
  );
  const final = quoteCurrent180Current190PostgresqlIdentifier(
    names.finalDatabaseName,
  );
  const source =
    quoteCurrent180Current190PostgresqlIdentifier(SOURCE_DATABASE_NAME);
  if (statementSpec.kind === "CREATE_DATABASE_FROM_FIXED_CURRENT180") {
    const expectedSql = `CREATE DATABASE ${working} WITH TEMPLATE = ${source} OWNER = "postgres" ALLOW_CONNECTIONS = false IS_TEMPLATE = false;`;
    if (
      statementSpec.sql !== expectedSql ||
      !exactKeys(statementSpec.preconditions, [
        "catalogAbsenceReconciliationMustImmediatelyPrecedeExecution",
        "exactSourceTemplate",
        "sourceConnectionsMustBeZero",
        "targetNamesMustBeAbsent",
      ]) ||
      statementSpec.preconditions
        .catalogAbsenceReconciliationMustImmediatelyPrecedeExecution !== true ||
      statementSpec.preconditions.exactSourceTemplate !==
        SOURCE_DATABASE_NAME ||
      statementSpec.preconditions.sourceConnectionsMustBeZero !== true ||
      statementSpec.preconditions.targetNamesMustBeAbsent !== true
    ) {
      fail("RUNTIME_STATEMENT_INVALID", ["EXACT_SAFE_CREATE_SQL_REQUIRED"]);
    }
    return { kind: "CREATE", databaseName: names.workingDatabaseName };
  }
  if (statementSpec.kind === "COMMENT_OWNERSHIP_MARKER") {
    if (!identityPreconditionsValid(statementSpec.preconditions)) {
      fail("RUNTIME_STATEMENT_INVALID", [
        "EXACT_IDENTITY_PRECONDITIONS_REQUIRED",
      ]);
    }
    for (const databaseName of [
      names.workingDatabaseName,
      names.finalDatabaseName,
    ]) {
      const prefix = `COMMENT ON DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(databaseName)} IS `;
      if (statementSpec.sql.startsWith(prefix)) {
        const literal = statementSpec.sql.slice(prefix.length, -1);
        const markerMatch = /^E'([^']+)'$/u.exec(literal);
        if (markerMatch === null) break;
        const marker = markerMatch[1];
        if (
          OWNERSHIP_MARKER_PATTERN.test(marker) &&
          statementSpec.sql ===
            `${prefix}${quoteCurrent180Current190PostgresqlLiteral(marker)};`
        ) {
          return { kind: "COMMENT", databaseName, marker };
        }
      }
    }
    fail("RUNTIME_STATEMENT_INVALID", ["EXACT_SAFE_COMMENT_SQL_REQUIRED"]);
  }
  if (statementSpec.kind === "ALTER_ALLOW_CONNECTIONS") {
    if (!identityPreconditionsValid(statementSpec.preconditions)) {
      fail("RUNTIME_STATEMENT_INVALID", [
        "EXACT_IDENTITY_PRECONDITIONS_REQUIRED",
      ]);
    }
    for (const databaseName of [
      names.workingDatabaseName,
      names.finalDatabaseName,
    ]) {
      for (const allowConnections of [false, true]) {
        const expectedSql = `ALTER DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(databaseName)} WITH ALLOW_CONNECTIONS = ${allowConnections ? "true" : "false"};`;
        if (statementSpec.sql === expectedSql) {
          return { kind: "ALLOW_CONNECTIONS", allowConnections, databaseName };
        }
      }
    }
    fail("RUNTIME_STATEMENT_INVALID", ["EXACT_SAFE_ALLOW_SQL_REQUIRED"]);
  }
  if (statementSpec.kind === "RENAME_SAME_TOKEN_DATABASE") {
    if (!identityPreconditionsValid(statementSpec.preconditions)) {
      fail("RUNTIME_STATEMENT_INVALID", [
        "EXACT_IDENTITY_PRECONDITIONS_REQUIRED",
      ]);
    }
    const directions = [
      [names.workingDatabaseName, names.finalDatabaseName],
      [names.finalDatabaseName, names.workingDatabaseName],
    ];
    for (const [fromDatabaseName, toDatabaseName] of directions) {
      const expectedSql = `ALTER DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(fromDatabaseName)} RENAME TO ${quoteCurrent180Current190PostgresqlIdentifier(toDatabaseName)};`;
      if (statementSpec.sql === expectedSql) {
        return { kind: "RENAME", fromDatabaseName, toDatabaseName };
      }
    }
    fail("RUNTIME_STATEMENT_INVALID", ["EXACT_SAFE_RENAME_SQL_REQUIRED"]);
  }
  if (statementSpec.kind === "DROP_EXACT_OWNED_SEALED_TARGET") {
    const preconditions = statementSpec.preconditions;
    if (
      !exactKeys(preconditions, [
        "activeSessionCount",
        "catalogReconciliationMustImmediatelyPrecedeExecution",
        "exactDatabaseOid",
        "exactMarker",
        "exactOwnerName",
        "exactOwnerOid",
        "identityReceiptDigest",
        "receiptIsExecutionAuthority",
      ]) ||
      preconditions.activeSessionCount !== 0 ||
      preconditions.catalogReconciliationMustImmediatelyPrecedeExecution !==
        true ||
      !positiveOid(preconditions.exactDatabaseOid) ||
      typeof preconditions.exactMarker !== "string" ||
      !OWNERSHIP_MARKER_PATTERN.test(preconditions.exactMarker) ||
      preconditions.exactOwnerName !== OWNER_ROLE ||
      !positiveOid(preconditions.exactOwnerOid) ||
      typeof preconditions.identityReceiptDigest !== "string" ||
      !SHA256_PATTERN.test(preconditions.identityReceiptDigest) ||
      preconditions.receiptIsExecutionAuthority !== false
    ) {
      fail("RUNTIME_STATEMENT_INVALID", [
        "EXACT_DROP_IDENTITY_PRECONDITIONS_REQUIRED",
      ]);
    }
    for (const databaseName of [
      names.workingDatabaseName,
      names.finalDatabaseName,
    ]) {
      const expectedSql = `DROP DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(databaseName)};`;
      if (statementSpec.sql === expectedSql) {
        return {
          databaseName,
          expectedMarker: preconditions.exactMarker,
          expectedOid: preconditions.exactDatabaseOid,
          expectedOwnerOid: preconditions.exactOwnerOid,
          kind: "DROP",
        };
      }
    }
    fail("RUNTIME_STATEMENT_INVALID", ["EXACT_SAFE_DROP_SQL_REQUIRED"]);
  }
  fail("RUNTIME_STATEMENT_INVALID", ["STATEMENT_KIND_NOT_ALLOWED"]);
}

function validCatalogRow(row) {
  return (
    exactKeys(row, [
      "activeSessionCount",
      "allowConnections",
      "databaseName",
      "databaseOid",
      "isTemplate",
      "marker",
      "ownerName",
      "ownerOid",
    ]) &&
    Number.isSafeInteger(row.activeSessionCount) &&
    row.activeSessionCount >= 0 &&
    typeof row.allowConnections === "boolean" &&
    typeof row.databaseName === "string" &&
    positiveOid(row.databaseOid) &&
    row.isTemplate === false &&
    (row.marker === null ||
      (typeof row.marker === "string" &&
        OWNERSHIP_MARKER_PATTERN.test(row.marker))) &&
    typeof row.ownerName === "string" &&
    positiveOid(row.ownerOid)
  );
}

function assertCatalogRows(rows) {
  const normalized = normalizeRows(rows);
  if (
    normalized.some((row) => !validCatalogRow(row)) ||
    new Set(normalized.map((row) => `${row.databaseName}\n${row.databaseOid}`))
      .size !== normalized.length
  ) {
    fail("RUNTIME_CATALOG_RECONCILIATION_INVALID", [
      "EXACT_EXHAUSTIVE_CATALOG_ROWS_REQUIRED",
    ]);
  }
  return normalized;
}

function expectedIdentitySnapshot(value, authorizationReceiptDigest, names) {
  if (value === null) return null;
  if (
    !exactKeys(value, [
      "attempt",
      "authorizationReceiptDigest",
      "identityDigest",
      "marker",
      "oid",
      "ownerName",
      "ownerOid",
      "runToken",
    ]) ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1 ||
    value.attempt > 2 ||
    value.authorizationReceiptDigest !== authorizationReceiptDigest ||
    value.runToken !== names.runToken ||
    !positiveOid(value.oid) ||
    value.ownerName !== OWNER_ROLE ||
    !positiveOid(value.ownerOid) ||
    typeof value.marker !== "string" ||
    !OWNERSHIP_MARKER_PATTERN.test(value.marker) ||
    typeof value.identityDigest !== "string" ||
    !SHA256_PATTERN.test(value.identityDigest)
  ) {
    fail("RUNTIME_CLEANUP_IDENTITY_INVALID", [
      "EXACT_OWNERSHIP_IDENTITY_REQUIRED",
    ]);
  }
  let expectedMarker;
  try {
    expectedMarker =
      buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
        attempt: value.attempt,
        authorizationReceiptDigest,
        runToken: names.runToken,
      });
  } catch {
    fail("RUNTIME_CLEANUP_IDENTITY_INVALID", [
      "OWNERSHIP_MARKER_RECONSTRUCTION_FAILED",
    ]);
  }
  const identityDocument = {
    attempt: value.attempt,
    authorizationReceiptDigest,
    marker: expectedMarker,
    oid: value.oid,
    ownerName: value.ownerName,
    ownerOid: value.ownerOid,
    runToken: value.runToken,
  };
  if (
    value.marker !== expectedMarker ||
    value.identityDigest !== sha256(canonicalJson(identityDocument))
  ) {
    fail("RUNTIME_CLEANUP_IDENTITY_INVALID", [
      "OWNERSHIP_IDENTITY_DIGEST_OR_MARKER_MISMATCH",
    ]);
  }
  return deepFreeze({ ...value });
}

function verifyExpectedOwnedCatalogRow(row, identity, names) {
  if (
    ![names.workingDatabaseName, names.finalDatabaseName].includes(
      row.databaseName,
    ) ||
    row.databaseName === SOURCE_DATABASE_NAME ||
    row.databaseOid !== identity.oid ||
    row.ownerName !== identity.ownerName ||
    row.ownerOid !== identity.ownerOid ||
    row.marker !== identity.marker ||
    row.isTemplate !== false ||
    row.activeSessionCount !== 0
  ) {
    fail("RUNTIME_CLEANUP_FOREIGN_IDENTITY", [
      "EXACT_NAME_OID_OWNER_MARKER_IDENTITY_REQUIRED",
      "SOURCE_AND_FOREIGN_DATABASE_MUTATION_DENIED",
    ]);
  }
}

async function defaultAttestExecutables() {
  const require = createRequire(import.meta.url);
  const nodeExecutablePath = await realpath(process.execPath);
  const prismaExecutablePath = await realpath(
    require.resolve("prisma/build/index.js"),
  );
  if (!isAbsolute(nodeExecutablePath) || !isAbsolute(prismaExecutablePath)) {
    fail("RUNTIME_EXECUTABLE_ATTESTATION_FAILED", [
      "ABSOLUTE_EXECUTABLE_PATHS_REQUIRED",
    ]);
  }
  const [nodeBytes, prismaBytes] = await Promise.all([
    readFile(nodeExecutablePath),
    readFile(prismaExecutablePath),
  ]);
  return {
    nodeExecutablePath,
    nodeExecutableSha256: sha256(nodeBytes),
    prismaExecutablePath,
    prismaExecutableSha256: sha256(prismaBytes),
  };
}

function defaultCreatePrismaClient({ url }) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });
}

async function defaultListTemporaryEntries() {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  return entries.map((entry) => ({
    isDirectory: entry.isDirectory(),
    isSymbolicLink: entry.isSymbolicLink(),
    name: entry.name,
  }));
}

async function defaultInspectSchemaPath(schemaPath) {
  if (
    typeof schemaPath !== "string" ||
    !isAbsolute(schemaPath) ||
    basename(schemaPath) !== "schema.prisma"
  ) {
    return { verified: false };
  }
  const lexicalTemporaryRoot = resolve(tmpdir());
  const lexicalArtifactRoot = dirname(schemaPath);
  if (
    !MATERIALIZER_ROOT_PATTERN.test(basename(lexicalArtifactRoot)) ||
    !pathInside(lexicalTemporaryRoot, schemaPath)
  ) {
    return { verified: false };
  }
  const [physicalTemporaryRoot, physicalArtifactRoot, physicalSchemaPath] =
    await Promise.all([
      realpath(lexicalTemporaryRoot),
      realpath(lexicalArtifactRoot),
      realpath(schemaPath),
    ]);
  if (
    !sameNativePath(physicalSchemaPath, schemaPath) ||
    !sameNativePath(physicalArtifactRoot, lexicalArtifactRoot) ||
    !sameNativePath(dirname(physicalArtifactRoot), physicalTemporaryRoot)
  ) {
    return { verified: false };
  }
  const [systemTempStat, artifactRootStat, schemaStat] = await Promise.all([
    stat(physicalTemporaryRoot, { bigint: true }),
    stat(physicalArtifactRoot, { bigint: true }),
    stat(physicalSchemaPath, { bigint: true }),
  ]);
  if (
    !systemTempStat.isDirectory() ||
    !artifactRootStat.isDirectory() ||
    !schemaStat.isFile() ||
    schemaStat.size < 1n ||
    schemaStat.size > 16n * 1024n * 1024n
  ) {
    return { verified: false };
  }
  return {
    artifactRootIdentity: filesystemIdentity(artifactRootStat),
    artifactRootPath: physicalArtifactRoot,
    schemaIdentity: filesystemIdentity(schemaStat),
    schemaPath: physicalSchemaPath,
    systemTempIdentity: filesystemIdentity(systemTempStat),
    systemTempRealPath: physicalTemporaryRoot,
    verified: true,
  };
}

async function capturePinnedWindowsChildEnvironment() {
  if (platform() !== "win32") return Object.freeze({});
  const lexicalRoot = resolve(PINNED_WINDOWS_SYSTEM_ROOT);
  const kernelPath = join(lexicalRoot, "System32", "kernel32.dll");
  let rootRealPath;
  let rootStat;
  let kernelRealPath;
  let kernelStat;
  try {
    [rootRealPath, rootStat, kernelRealPath, kernelStat] = await Promise.all([
      realpath(lexicalRoot),
      lstat(lexicalRoot, { bigint: true }),
      realpath(kernelPath),
      lstat(kernelPath, { bigint: true }),
    ]);
  } catch {
    fail("RUNTIME_DEPLOY_INVALID", ["PINNED_WINDOWS_SYSTEM_ROOT_UNAVAILABLE"]);
  }
  if (
    !sameNativePath(rootRealPath, lexicalRoot) ||
    !sameNativePath(kernelRealPath, kernelPath) ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    !kernelStat.isFile() ||
    kernelStat.isSymbolicLink()
  ) {
    fail("RUNTIME_DEPLOY_INVALID", [
      "PINNED_WINDOWS_SYSTEM_ROOT_PROVENANCE_INVALID",
    ]);
  }
  return Object.freeze({
    SystemRoot: rootRealPath,
    WINDIR: rootRealPath,
  });
}

async function spawnBoundedChild(input) {
  return new Promise((resolvePromise, rejectPromise) => {
    let responseSettled = false;
    let spawned = false;
    let outputBytes = 0;
    let terminationKind = null;
    let escalationTimeout = null;
    let exitProofTimeout = null;
    const child = spawn(input.executablePath, input.arguments, {
      cwd: input.cwd,
      env: { ...input.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (callback, value) => {
      if (responseSettled) return;
      responseSettled = true;
      clearTimeout(timeout);
      clearTimeout(escalationTimeout);
      clearTimeout(exitProofTimeout);
      callback(value);
    };
    const requestTermination = (kind) => {
      if (responseSettled || terminationKind !== null) return;
      terminationKind = kind;
      child.kill();
      escalationTimeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, CHILD_TERMINATION_ESCALATION_MILLISECONDS);
      exitProofTimeout = setTimeout(() => {
        finish(rejectPromise, {
          effectMayHaveCommitted: spawned,
          hardQuarantine: true,
          kind: `${kind}_CHILD_EXIT_UNPROVEN`,
          processExitObserved: false,
        });
      }, CHILD_EXIT_PROOF_TIMEOUT_MILLISECONDS);
    };
    const timeout = setTimeout(
      () => requestTermination("DEPLOY_TIMEOUT"),
      input.timeoutMilliseconds,
    );
    const collect = (chunk) => {
      if (responseSettled || terminationKind !== null) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > input.maxOutputBytes) {
        requestTermination("DEPLOY_OUTPUT_LIMIT_EXCEEDED");
      }
    };
    child.once("spawn", () => {
      spawned = true;
    });
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.once("error", () => {
      if (spawned) {
        requestTermination("DEPLOY_PROCESS_ERROR");
      } else {
        finish(rejectPromise, {
          effectMayHaveCommitted: false,
          hardQuarantine: false,
          kind: "DEPLOY_PROCESS_ERROR_BEFORE_SPAWN",
          processExitObserved: true,
        });
      }
    });
    child.once("close", (code, signal) => {
      if (terminationKind !== null) {
        finish(rejectPromise, {
          effectMayHaveCommitted: spawned,
          exitCode: code,
          hardQuarantine: false,
          kind: terminationKind,
          processExitObserved: true,
          signal,
        });
        return;
      }
      if (code === 0 && signal === null) {
        finish(resolvePromise, { exitCode: 0, responseObserved: true });
        return;
      }
      finish(rejectPromise, {
        effectMayHaveCommitted: spawned,
        exitCode: code,
        hardQuarantine: false,
        kind: "DEPLOY_EXIT_NONZERO",
        processExitObserved: true,
        signal,
      });
    });
  });
}

function isolatedNodeArguments(environment, mode, payloadArguments) {
  const allowedKeys = Object.keys(environment).sort(compareText);
  return [
    "--input-type=module",
    "--eval",
    ISOLATED_NODE_BOOTSTRAP,
    Buffer.from(JSON.stringify(allowedKeys), "utf8").toString("base64url"),
    mode,
    ...payloadArguments,
  ];
}

async function defaultSpawnPrisma(input) {
  return spawnBoundedChild({
    arguments: isolatedNodeArguments(input.env, "prisma", [
      input.prismaExecutablePath,
      input.schemaPath,
    ]),
    cwd: dirname(input.schemaPath),
    env: input.env,
    executablePath: input.nodeExecutablePath,
    maxOutputBytes: input.maxOutputBytes,
    timeoutMilliseconds: input.timeoutMilliseconds,
  });
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  attestExecutables: defaultAttestExecutables,
  createPrismaClient: defaultCreatePrismaClient,
  inspectSchemaPath: defaultInspectSchemaPath,
  listTemporaryEntries: defaultListTemporaryEntries,
  spawnPrisma: defaultSpawnPrisma,
});

function validateDependencies(dependencies) {
  if (
    !exactKeys(dependencies, DEPENDENCY_KEYS) ||
    DEPENDENCY_KEYS.some((key) => typeof dependencies[key] !== "function")
  ) {
    fail("RUNTIME_TEST_DEPENDENCIES_INVALID", [
      "EXACT_TEST_DEPENDENCIES_REQUIRED",
    ]);
  }
  return dependencies;
}

function createAdapter(environmentSnapshot, dependencies, testOnly) {
  const environment = snapshotEnvironment(environmentSnapshot);
  const dependencySet = validateDependencies(dependencies);
  const lockReceipts = new WeakSet();
  const state = {
    binding: null,
    executableAttestation: null,
    lock: null,
    maintenanceClient: null,
    quarantined: false,
    resourcesReleased: false,
  };

  function validateCommonInput(input, expectedKeys) {
    if (state.quarantined) {
      fail("RUNTIME_MANUAL_RECOVERY_REQUIRED", [
        "UNPROVEN_CHILD_PROCESS_EXIT_QUARANTINES_RUNTIME",
      ]);
    }
    if (!exactKeys(input, expectedKeys)) {
      fail("RUNTIME_INPUT_INVALID", ["EXACT_METHOD_INPUT_REQUIRED"]);
    }
    const names = assertNamesAndToken(input.names, input.runToken);
    assertSha256(input.journalRecordDigest, "JOURNAL_RECORD_DIGEST_REQUIRED");
    if (
      state.binding !== null &&
      (state.binding.runToken !== input.runToken ||
        canonicalJson(state.binding.names) !== canonicalJson(names))
    ) {
      fail("RUNTIME_BINDING_INVALID", [
        "ADAPTER_RUN_TOKEN_AND_NAMES_ARE_IMMUTABLY_BOUND",
      ]);
    }
    return names;
  }

  function bindAuthorization(input, names) {
    assertSha256(
      input.authorizationReceiptDigest,
      "AUTHORIZATION_RECEIPT_DIGEST_REQUIRED",
    );
    if (state.binding === null) {
      state.binding = deepFreeze({
        authorizationReceiptDigest: input.authorizationReceiptDigest,
        names,
        runToken: input.runToken,
      });
    } else if (
      state.binding.authorizationReceiptDigest !==
      input.authorizationReceiptDigest
    ) {
      fail("RUNTIME_BINDING_INVALID", [
        "AUTHORIZATION_RECEIPT_DIGEST_IS_IMMUTABLY_BOUND",
      ]);
    }
  }

  function requireBinding(executableAttestationRequired = true) {
    if (
      state.binding === null ||
      (executableAttestationRequired && state.executableAttestation === null)
    ) {
      fail("RUNTIME_BINDING_INVALID", [
        "SUCCESSFUL_EXECUTABLE_ATTESTATION_REQUIRED",
      ]);
    }
    return state.binding;
  }

  function ownershipMarkers(binding) {
    return [1, 2].map((attempt) =>
      buildCurrent180Current190PostgresqlRehearsalOwnershipMarker({
        attempt,
        authorizationReceiptDigest: binding.authorizationReceiptDigest,
        runToken: binding.runToken,
      }),
    );
  }

  function consumeMaterializerVerificationReceipt(
    verificationReceipt,
    schemaPath,
    schemaInspection,
  ) {
    let assertedReceipt;
    try {
      assertedReceipt = testOnly
        ? assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly(
            verificationReceipt,
          )
        : assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
            verificationReceipt,
          );
    } catch {
      fail("RUNTIME_DEPLOY_INVALID", [
        "FRESH_MODULE_BRANDED_MATERIALIZER_VERIFICATION_REQUIRED",
      ]);
    }
    if (
      assertedReceipt !== verificationReceipt ||
      consumedMaterializerVerificationReceipts.has(verificationReceipt) ||
      verificationReceipt.contract !==
        CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_RUNNER_VERIFICATION_CONTRACT ||
      verificationReceipt.status !==
        "FRESH_WHOLE_TREE_VERIFIED_FOR_DISPOSABLE_RUNNER_NOT_PROCESS_AUTHORITY" ||
      verificationReceipt.schemaPath !== schemaPath ||
      verificationReceipt.artifactRootPath !== dirname(schemaPath) ||
      verificationReceipt.systemTempRealPath !==
        dirname(verificationReceipt.artifactRootPath) ||
      !sameNativePath(schemaInspection.schemaPath, schemaPath) ||
      !sameNativePath(
        schemaInspection.artifactRootPath,
        verificationReceipt.artifactRootPath,
      ) ||
      !sameNativePath(
        schemaInspection.systemTempRealPath,
        verificationReceipt.systemTempRealPath,
      ) ||
      !validFilesystemIdentity(verificationReceipt.rootIdentity) ||
      !validFilesystemIdentity(verificationReceipt.schemaIdentity) ||
      !validFilesystemIdentity(verificationReceipt.systemTempIdentity) ||
      !sameFilesystemIdentity(
        schemaInspection.artifactRootIdentity,
        verificationReceipt.rootIdentity,
      ) ||
      !sameFilesystemIdentity(
        schemaInspection.systemTempIdentity,
        verificationReceipt.systemTempIdentity,
      ) ||
      !sameFilesystemIdentity(
        schemaInspection.schemaIdentity,
        verificationReceipt.schemaIdentity,
      ) ||
      !Number.isSafeInteger(verificationReceipt.generation) ||
      verificationReceipt.generation < 1 ||
      !SHA256_PATTERN.test(
        String(verificationReceipt.materializationReceiptDigest ?? ""),
      ) ||
      !SHA256_PATTERN.test(
        String(verificationReceipt.recoveryLocatorDigest ?? ""),
      ) ||
      !SHA256_PATTERN.test(String(verificationReceipt.verificationDigest ?? ""))
    ) {
      fail("RUNTIME_DEPLOY_INVALID", [
        consumedMaterializerVerificationReceipts.has(verificationReceipt)
          ? "MATERIALIZER_VERIFICATION_RECEIPT_ALREADY_CONSUMED"
          : "EXACT_MATERIALIZER_TREE_SCHEMA_AND_ROOT_BINDING_REQUIRED",
      ]);
    }
    consumedMaterializerVerificationReceipts.add(verificationReceipt);
  }

  async function createClient(
    databaseName,
    kind,
    purpose,
    executableAttestationRequired = true,
  ) {
    const binding = requireBinding(executableAttestationRequired);
    const url = databaseUrl(
      environment,
      databaseName,
      binding.runToken,
      purpose,
    );
    const client = dependencySet.createPrismaClient({
      databaseName,
      kind,
      url,
    });
    if (
      client === null ||
      typeof client !== "object" ||
      typeof client.$connect !== "function" ||
      typeof client.$disconnect !== "function" ||
      typeof client.$queryRawUnsafe !== "function" ||
      typeof client.$executeRawUnsafe !== "function" ||
      typeof client.$transaction !== "function"
    ) {
      fail("RUNTIME_PRISMA_CLIENT_INVALID", [
        "EXACT_PRISMA_RAW_SQL_CLIENT_REQUIRED",
      ]);
    }
    await client.$connect();
    return client;
  }

  async function disconnectBestEffort(client) {
    if (client === null) return true;
    try {
      await client.$disconnect();
      return true;
    } catch {
      return false;
    }
  }

  async function queryPinnedLockStatus(allowedLockCounts) {
    if (state.maintenanceClient === null || state.lock === null) {
      fail("RUNTIME_CLUSTER_LOCK_INVALID", ["ACTIVE_CLUSTER_LOCK_REQUIRED"]);
    }
    const rows = normalizeRows(
      await state.maintenanceClient.$queryRawUnsafe(
        LOCK_STATUS_SQL,
        ADVISORY_LOCK_KEY,
      ),
    );
    if (rows.length !== 1) {
      fail("RUNTIME_CLUSTER_LOCK_INVALID", ["EXACT_LOCK_STATUS_ROW_REQUIRED"]);
    }
    const row = rows[0];
    if (
      !exactKeys(row, [
        "backendPid",
        "databaseName",
        "lockCount",
        "roleName",
      ]) ||
      !Number.isSafeInteger(row.backendPid) ||
      row.backendPid < 1 ||
      row.databaseName !== MAINTENANCE_DATABASE_NAME ||
      row.roleName !== OWNER_ROLE ||
      !allowedLockCounts.includes(row.lockCount) ||
      row.backendPid !== state.lock.backendPid
    ) {
      fail("RUNTIME_CLUSTER_LOCK_DRIFT", [
        "PINNED_BACKEND_PID_AND_EXACT_ADVISORY_LOCK_REQUIRED",
      ]);
    }
    return row;
  }

  async function queryLockStatus() {
    return queryPinnedLockStatus([1]);
  }

  async function releaseActiveClusterLock(errorCode, failureFinding) {
    await queryLockStatus();
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let releaseReceiptValid = false;
      try {
        const rows = normalizeRows(
          await state.maintenanceClient.$queryRawUnsafe(
            LOCK_RELEASE_SQL,
            ADVISORY_LOCK_KEY,
          ),
        );
        releaseReceiptValid =
          rows.length === 1 &&
          exactKeys(rows[0], [
            "backendPid",
            "databaseName",
            "released",
            "roleName",
          ]) &&
          rows[0].backendPid === state.lock.backendPid &&
          rows[0].databaseName === MAINTENANCE_DATABASE_NAME &&
          rows[0].roleName === OWNER_ROLE &&
          rows[0].released === true;
      } catch {
        releaseReceiptValid = false;
      }
      let status;
      try {
        status = await queryPinnedLockStatus([0, 1]);
      } catch {
        throw lostResponse([
          "ADVISORY_UNLOCK_RESPONSE_AND_FRESH_LOCK_STATUS_AMBIGUOUS",
        ]);
      }
      if (status.lockCount === 0) {
        state.lock = null;
        return;
      }
      if (releaseReceiptValid) {
        throw lostResponse([
          "ADVISORY_UNLOCK_RECEIPT_CONTRADICTS_FRESH_LOCK_STATUS",
        ]);
      }
    }
    fail(errorCode, [failureFinding]);
  }

  async function queryCatalog(expectedOid = null, expectedMarker = null) {
    if (state.maintenanceClient === null) {
      state.maintenanceClient = await createClient(
        MAINTENANCE_DATABASE_NAME,
        "MAINTENANCE",
        "maintenance",
      );
    }
    const binding = requireBinding();
    const { names } = binding;
    return assertCatalogRows(
      await state.maintenanceClient.$queryRawUnsafe(
        CATALOG_RECONCILIATION_SQL,
        names.workingDatabaseName,
        names.finalDatabaseName,
        expectedOid,
        expectedMarker,
        ...ownershipMarkers(binding),
      ),
    );
  }

  function exactTargetRow(rows, databaseName) {
    const matching = rows.filter((row) => row.databaseName === databaseName);
    if (matching.length !== 1) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "EXACTLY_ONE_TARGET_DATABASE_REQUIRED",
      ]);
    }
    return matching[0];
  }

  function assertOwnedRuntimeTarget(row) {
    if (
      row.ownerName !== OWNER_ROLE ||
      row.isTemplate !== false ||
      row.activeSessionCount !== 0 ||
      row.databaseName === SOURCE_DATABASE_NAME
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "OWNED_IDLE_NON_TEMPLATE_TARGET_REQUIRED",
      ]);
    }
  }

  async function assertStatementPrecondition(operation) {
    const expectedOid = operation.expectedOid ?? null;
    const expectedMarker = operation.expectedMarker ?? null;
    const rows = await queryCatalog(expectedOid, expectedMarker);
    if (operation.kind === "CREATE") {
      if (rows.length !== 0) {
        fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
          "TARGET_NAMES_MUST_BE_ABSENT_BEFORE_CREATE",
        ]);
      }
      return { rows };
    }
    const databaseName =
      operation.kind === "RENAME"
        ? operation.fromDatabaseName
        : operation.databaseName;
    const row = exactTargetRow(rows, databaseName);
    assertOwnedRuntimeTarget(row);
    if (operation.kind === "COMMENT" && row.marker !== null) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "UNMARKED_TARGET_REQUIRED_BEFORE_COMMENT",
      ]);
    }
    if (
      ["ALLOW_CONNECTIONS", "RENAME", "DROP"].includes(operation.kind) &&
      (typeof row.marker !== "string" ||
        !OWNERSHIP_MARKER_PATTERN.test(row.marker))
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "OWNERSHIP_MARKER_REQUIRED_BEFORE_DDL",
      ]);
    }
    if (
      operation.kind === "ALLOW_CONNECTIONS" &&
      row.allowConnections === operation.allowConnections
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "OPPOSITE_ALLOW_CONNECTIONS_STATE_REQUIRED",
      ]);
    }
    if (operation.kind === "RENAME" && row.allowConnections !== false) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "SEALED_TARGET_REQUIRED_BEFORE_RENAME",
      ]);
    }
    if (
      operation.kind === "DROP" &&
      (row.allowConnections !== false ||
        row.databaseOid !== operation.expectedOid ||
        row.ownerOid !== operation.expectedOwnerOid ||
        row.marker !== operation.expectedMarker)
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "EXACT_SEALED_DROP_IDENTITY_REQUIRED",
      ]);
    }
    return { row, rows };
  }

  async function assertStatementPostcondition(operation, before) {
    const expectedOid =
      before.row?.databaseOid ?? operation.expectedOid ?? null;
    const expectedMarker = operation.marker ?? before.row?.marker ?? null;
    const rows = await queryCatalog(expectedOid, expectedMarker);
    if (operation.kind === "CREATE") {
      const row = exactTargetRow(rows, operation.databaseName);
      assertOwnedRuntimeTarget(row);
      if (row.allowConnections !== false || row.marker !== null) {
        fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
          "EXACT_SEALED_UNMARKED_CREATE_RESULT_REQUIRED",
        ]);
      }
      return;
    }
    if (operation.kind === "DROP") {
      if (rows.length !== 0) {
        fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
          "EXHAUSTIVE_DROP_ABSENCE_REQUIRED",
        ]);
      }
      return;
    }
    const databaseName =
      operation.kind === "RENAME"
        ? operation.toDatabaseName
        : operation.databaseName;
    const row = exactTargetRow(rows, databaseName);
    assertOwnedRuntimeTarget(row);
    if (row.databaseOid !== before.row.databaseOid) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "DATABASE_OID_MUST_NOT_DRIFT",
      ]);
    }
    if (operation.kind === "COMMENT" && row.marker !== operation.marker) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "EXACT_OWNERSHIP_MARKER_REQUIRED_AFTER_COMMENT",
      ]);
    }
    if (
      operation.kind === "ALLOW_CONNECTIONS" &&
      row.allowConnections !== operation.allowConnections
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "ALLOW_CONNECTIONS_RESULT_MISMATCH",
      ]);
    }
    if (
      operation.kind === "RENAME" &&
      (row.allowConnections !== false || row.marker !== before.row.marker)
    ) {
      fail("RUNTIME_DDL_RECONCILIATION_FAILED", [
        "SEALED_OWNED_RENAME_RESULT_REQUIRED",
      ]);
    }
  }

  async function executeMaintenanceDdl(sql, operation) {
    await queryLockStatus();
    const before = await assertStatementPrecondition(operation);
    await queryLockStatus();
    try {
      await state.maintenanceClient.$executeRawUnsafe(sql);
    } catch {
      throw lostResponse(["DDL_RESPONSE_NOT_RECONCILED"]);
    }
    try {
      await queryLockStatus();
      await assertStatementPostcondition(operation, before);
      await queryLockStatus();
    } catch (error) {
      if (error?.code === "RUNTIME_EFFECT_RESPONSE_LOST") throw error;
      throw lostResponse(["DDL_POST_EFFECT_IDENTITY_OR_LOCK_DRIFT"]);
    }
  }

  async function attestExecutableRuntime(input) {
    const names = validateCommonInput(input, [
      "authorizationReceiptDigest",
      "journalRecordDigest",
      "names",
      "runToken",
    ]);
    bindAuthorization(input, names);
    const binding = requireBinding(false);
    let executable;
    try {
      executable = await dependencySet.attestExecutables();
    } catch {
      fail("RUNTIME_EXECUTABLE_ATTESTATION_FAILED", [
        "EXECUTABLE_BYTES_COULD_NOT_BE_ATTESTED",
      ]);
    }
    if (
      !exactKeys(executable, [
        "nodeExecutablePath",
        "nodeExecutableSha256",
        "prismaExecutablePath",
        "prismaExecutableSha256",
      ]) ||
      !isAbsolute(executable.nodeExecutablePath) ||
      !isAbsolute(executable.prismaExecutablePath) ||
      executable.nodeExecutableSha256 !== NODE_EXECUTABLE_SHA256 ||
      executable.prismaExecutableSha256 !== PRISMA_EXECUTABLE_SHA256
    ) {
      fail("RUNTIME_EXECUTABLE_ATTESTATION_FAILED", [
        "PINNED_NODE_AND_PRISMA_EXECUTABLE_HASHES_REQUIRED",
      ]);
    }
    let maintenanceClient;
    let clusterResidueCount;
    try {
      maintenanceClient = await createClient(
        MAINTENANCE_DATABASE_NAME,
        "MAINTENANCE",
        "admission",
        false,
      );
      const rawRows = normalizeRows(
        await maintenanceClient.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          return transaction.$queryRawUnsafe(
            CRASH_RECOVERY_CLUSTER_SQL,
            ...ownershipMarkers(binding),
          );
        }),
      );
      if (
        rawRows.length !== 1 ||
        !exactKeys(rawRows[0], ["clusterResidueCount"]) ||
        !Number.isSafeInteger(rawRows[0].clusterResidueCount) ||
        rawRows[0].clusterResidueCount < 0
      ) {
        fail("RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED", [
          "EXACT_CLUSTER_RESIDUE_COUNT_REQUIRED",
        ]);
      }
      clusterResidueCount = rawRows[0].clusterResidueCount;
    } finally {
      await disconnectBestEffort(maintenanceClient ?? null);
    }
    let temporaryEntries;
    try {
      temporaryEntries = await dependencySet.listTemporaryEntries();
    } catch {
      fail("RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED", [
        "OPERATING_SYSTEM_TEMP_ROOT_INVENTORY_REQUIRED",
      ]);
    }
    if (
      !Array.isArray(temporaryEntries) ||
      temporaryEntries.some(
        (entry) =>
          !exactKeys(entry, ["isDirectory", "isSymbolicLink", "name"]) ||
          typeof entry.isDirectory !== "boolean" ||
          typeof entry.isSymbolicLink !== "boolean" ||
          typeof entry.name !== "string",
      )
    ) {
      fail("RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED", [
        "EXACT_TEMPORARY_ENTRY_INVENTORY_REQUIRED",
      ]);
    }
    const residueNames = temporaryEntries.filter(
      ({ isDirectory, isSymbolicLink }) => isDirectory || isSymbolicLink,
    );
    const currentJournalPattern = new RegExp(
      `^lp-c180190-journal-${input.runToken}-[A-Za-z0-9]{6}$`,
      "u",
    );
    const currentJournalEntries = temporaryEntries.filter(({ name }) =>
      currentJournalPattern.test(name),
    );
    if (
      currentJournalEntries.length !== 1 ||
      currentJournalEntries[0].isDirectory !== true ||
      currentJournalEntries[0].isSymbolicLink !== false
    ) {
      fail("RUNTIME_CRASH_RECOVERY_ATTESTATION_FAILED", [
        "EXACT_ONE_CURRENT_RUN_NON_LINK_JOURNAL_ROOT_REQUIRED",
      ]);
    }
    const currentJournalEntry = currentJournalEntries[0];
    const journalResidueCount = residueNames.filter(
      (entry) =>
        entry !== currentJournalEntry && JOURNAL_ROOT_PATTERN.test(entry.name),
    ).length;
    const materializerResidueCount = residueNames.filter(({ name }) =>
      MATERIALIZER_ROOT_PATTERN.test(name),
    ).length;
    const crashRecoveryAdmission = {
      clusterResidueCount,
      journalResidueCount,
      materializerResidueCount,
      recoveryRequired:
        clusterResidueCount + journalResidueCount + materializerResidueCount >
        0,
      verified: true,
    };
    const document = {
      adapterContract:
        CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
      crashRecoveryAdmission,
      nodeExecutablePath: executable.nodeExecutablePath,
      nodeExecutableSha256: executable.nodeExecutableSha256,
      prismaExecutablePath: executable.prismaExecutablePath,
      prismaExecutableSha256: executable.prismaExecutableSha256,
      verified: true,
    };
    const attestation = deepFreeze({
      ...document,
      runtimeDigest: sha256(canonicalJson(document)),
    });
    state.executableAttestation = attestation;
    return attestation;
  }

  async function acquireClusterLock(input) {
    const names = validateCommonInput(input, [
      "authorizationReceiptDigest",
      "journalRecordDigest",
      "names",
      "runToken",
    ]);
    bindAuthorization(input, names);
    requireBinding();
    if (
      state.lock !== null ||
      state.maintenanceClient !== null ||
      state.resourcesReleased
    ) {
      fail("RUNTIME_CLUSTER_LOCK_INVALID", [
        "SINGLE_CLUSTER_LOCK_LIFECYCLE_REQUIRED",
      ]);
    }
    state.maintenanceClient = await createClient(
      MAINTENANCE_DATABASE_NAME,
      "MAINTENANCE",
      "maintenance",
    );
    let rows;
    try {
      rows = normalizeRows(
        await state.maintenanceClient.$queryRawUnsafe(
          LOCK_ACQUIRE_SQL,
          ADVISORY_LOCK_KEY,
        ),
      );
    } catch {
      await disconnectBestEffort(state.maintenanceClient);
      state.maintenanceClient = null;
      fail("RUNTIME_CLUSTER_LOCK_FAILED", [
        "SESSION_ADVISORY_LOCK_ACQUISITION_FAILED",
      ]);
    }
    if (
      rows.length === 1 &&
      exactKeys(rows[0], [
        "acquired",
        "backendPid",
        "databaseName",
        "roleName",
      ]) &&
      rows[0].acquired === false &&
      Number.isSafeInteger(rows[0].backendPid) &&
      rows[0].backendPid >= 1 &&
      rows[0].databaseName === MAINTENANCE_DATABASE_NAME &&
      rows[0].roleName === OWNER_ROLE
    ) {
      await disconnectBestEffort(state.maintenanceClient);
      state.maintenanceClient = null;
      fail("RUNTIME_CLUSTER_LOCK_NOT_ACQUIRED", [
        "ADVISORY_LOCK_DEFINITIVELY_HELD_BY_ANOTHER_SESSION",
      ]);
    }
    if (
      rows.length !== 1 ||
      !exactKeys(rows[0], [
        "acquired",
        "backendPid",
        "databaseName",
        "roleName",
      ]) ||
      rows[0].acquired !== true ||
      !Number.isSafeInteger(rows[0].backendPid) ||
      rows[0].backendPid < 1 ||
      rows[0].databaseName !== MAINTENANCE_DATABASE_NAME ||
      rows[0].roleName !== OWNER_ROLE
    ) {
      await disconnectBestEffort(state.maintenanceClient);
      state.maintenanceClient = null;
      fail("RUNTIME_CLUSTER_LOCK_FAILED", [
        "EXACT_PINNED_SESSION_ADVISORY_LOCK_REQUIRED",
      ]);
    }
    const publicReceipt = deepFreeze({
      backendPid: rows[0].backendPid,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_CLUSTER_LOCK_RECEIPT_V1",
      lockBindingDigest: sha256(
        canonicalJson({
          authorizationReceiptDigest: input.authorizationReceiptDigest,
          backendPid: rows[0].backendPid,
          names,
          runToken: input.runToken,
        }),
      ),
      runToken: input.runToken,
    });
    state.lock = {
      backendPid: rows[0].backendPid,
      receipt: publicReceipt,
    };
    lockReceipts.add(publicReceipt);
    await queryLockStatus();
    return publicReceipt;
  }

  async function releaseClusterLock(input) {
    validateCommonInput(input, [
      "journalRecordDigest",
      "lockReceipt",
      "names",
      "runToken",
    ]);
    requireBinding();
    if (
      state.lock === null ||
      input.lockReceipt !== state.lock.receipt ||
      !lockReceipts.has(input.lockReceipt)
    ) {
      fail("RUNTIME_CLUSTER_LOCK_RELEASE_FAILED", [
        "EXACT_ACTIVE_LOCK_RECEIPT_REQUIRED",
      ]);
    }
    await releaseActiveClusterLock(
      "RUNTIME_CLUSTER_LOCK_RELEASE_FAILED",
      "PINNED_SESSION_LOCK_RELEASE_NOT_OBSERVED_AFTER_BOUNDED_RETRY",
    );
    return deepFreeze({ released: true });
  }

  async function liveQuery(input) {
    const names = validateCommonInput(input, [
      "connection",
      "journalRecordDigest",
      "names",
      "querySpec",
      "runToken",
    ]);
    requireBinding();
    const connection = validateConnection(input.connection, names);
    let request;
    try {
      request = buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
        querySpec: input.querySpec,
      });
    } catch {
      fail("RUNTIME_QUERY_INVALID", [
        "EXACT_MODULE_ISSUED_LIVE_QUERY_SPEC_REQUIRED",
      ]);
    }
    if (
      request.exactQuerySpec !== input.querySpec ||
      request.transactionMode !== "READ ONLY" ||
      input.querySpec.readOnly !== true ||
      input.querySpec.transactionMode !== "READ ONLY"
    ) {
      fail("RUNTIME_QUERY_INVALID", ["READ_ONLY_QUERY_SPEC_REQUIRED"]);
    }
    assertQueryConnection(input.querySpec, connection);
    let client;
    let shouldDisconnect = false;
    if (connection.kind === "MAINTENANCE") {
      await queryLockStatus();
      client = state.maintenanceClient;
    } else {
      client = await createClient(
        connection.databaseName,
        connection.kind,
        "query",
      );
      shouldDisconnect = true;
    }
    try {
      const result = await client.$transaction(
        async (transaction) => {
          await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          const identityRows = normalizeRows(
            await transaction.$queryRawUnsafe(CONNECTION_IDENTITY_SQL),
          );
          if (identityRows.length !== 1) {
            fail("RUNTIME_CONNECTION_IDENTITY_INVALID", [
              "EXACTLY_ONE_CONNECTION_IDENTITY_ROW_REQUIRED",
            ]);
          }
          const identity = assertConnectionIdentity(
            identityRows[0],
            connection.databaseName,
          );
          const rows = normalizeRows(
            await transaction.$queryRawUnsafe(
              input.querySpec.sql,
              ...input.querySpec.parameters,
            ),
          );
          validateQueryProjection(rows, input.querySpec);
          return { identity, rows };
        },
        { maxWait: 5_000, timeout: 300_000 },
      );
      if (connection.kind === "MAINTENANCE") await queryLockStatus();
      return deepFreeze({
        connectionIdentity: publicConnectionIdentity(result.identity),
        rows: result.rows,
      });
    } catch (error) {
      if (
        error instanceof
        Current180Current190DisposablePostgresqlRehearsalRuntimeError
      ) {
        throw error;
      }
      fail("RUNTIME_LIVE_QUERY_FAILED", [
        "PRISMA_READ_ONLY_TRANSACTION_FAILED",
      ]);
    } finally {
      if (shouldDisconnect) await disconnectBestEffort(client);
    }
  }

  async function executeStatement(input) {
    const names = validateCommonInput(input, [
      "connection",
      "journalRecordDigest",
      "names",
      "runToken",
      "statementSpec",
    ]);
    requireBinding();
    const connection = validateConnection(input.connection, names);
    if (connection.kind !== "MAINTENANCE") {
      fail("RUNTIME_STATEMENT_INVALID", [
        "MAINTENANCE_CONNECTION_REQUIRED_FOR_DDL",
      ]);
    }
    const operation = validateStatementSpec(input.statementSpec, names);
    await executeMaintenanceDdl(input.statementSpec.sql, operation);
    return deepFreeze({ responseObserved: true });
  }

  async function deploy(input) {
    const names = validateCommonInput(input, [
      "databaseUrl",
      "env",
      "journalRecordDigest",
      "materializerVerificationReceipt",
      "names",
      "runToken",
      "schemaPath",
    ]);
    const binding = requireBinding();
    await queryLockStatus();
    if (
      !isPlainData(input.env) ||
      Array.isArray(input.env) ||
      !Object.isFrozen(input.env) ||
      !exactKeys(input.env, EXPECTED_CHILD_ENVIRONMENT_KEYS) ||
      Object.values(input.env).some((value) => typeof value !== "string") ||
      typeof input.databaseUrl !== "string" ||
      input.databaseUrl !== input.env.DATABASE_URL
    ) {
      fail("RUNTIME_DEPLOY_INVALID", [
        "EXACT_ISOLATED_CHILD_ENVIRONMENT_REQUIRED",
      ]);
    }
    let parsed;
    try {
      parsed = new URL(input.databaseUrl);
    } catch {
      fail("RUNTIME_DEPLOY_INVALID", ["EXACT_TARGET_DATABASE_URL_REQUIRED"]);
    }
    const databaseName = parsed.pathname.slice(1);
    const target =
      databaseName === names.workingDatabaseName
        ? "working"
        : databaseName === names.finalDatabaseName
          ? "final"
          : null;
    if (target === null) {
      fail("RUNTIME_DEPLOY_INVALID", ["EXACT_DERIVED_TARGET_REQUIRED"]);
    }
    const expectedEnvironment =
      buildCurrent180Current190PostgresqlRehearsalChildEnvironment({
        authorizationReceiptDigest: binding.authorizationReceiptDigest,
        environment,
        names,
        target,
      });
    if (
      canonicalJson(input.env) !== canonicalJson(expectedEnvironment) ||
      input.databaseUrl !== expectedEnvironment.DATABASE_URL
    ) {
      fail("RUNTIME_DEPLOY_INVALID", [
        "EXACT_CONTRACT_DERIVED_URL_AND_ENVIRONMENT_REQUIRED",
      ]);
    }
    let currentExecutable;
    try {
      currentExecutable = await dependencySet.attestExecutables();
    } catch {
      fail("RUNTIME_DEPLOY_INVALID", ["EXECUTABLE_REATTESTATION_FAILED"]);
    }
    if (
      canonicalJson(currentExecutable) !==
      canonicalJson({
        nodeExecutablePath: state.executableAttestation.nodeExecutablePath,
        nodeExecutableSha256: state.executableAttestation.nodeExecutableSha256,
        prismaExecutablePath: state.executableAttestation.prismaExecutablePath,
        prismaExecutableSha256:
          state.executableAttestation.prismaExecutableSha256,
      })
    ) {
      fail("RUNTIME_DEPLOY_INVALID", ["EXECUTABLE_IDENTITY_DRIFT"]);
    }
    let schemaInspection;
    try {
      schemaInspection = await dependencySet.inspectSchemaPath(
        input.schemaPath,
      );
    } catch {
      fail("RUNTIME_DEPLOY_INVALID", [
        "MATERIALIZER_SCHEMA_PATH_INSPECTION_FAILED",
      ]);
    }
    if (
      !isPlainData(schemaInspection) ||
      !exactKeys(schemaInspection, [
        "artifactRootIdentity",
        "artifactRootPath",
        "schemaIdentity",
        "schemaPath",
        "systemTempIdentity",
        "systemTempRealPath",
        "verified",
      ]) ||
      schemaInspection.verified !== true ||
      !validFilesystemIdentity(schemaInspection.artifactRootIdentity) ||
      !validFilesystemIdentity(schemaInspection.schemaIdentity) ||
      !validFilesystemIdentity(schemaInspection.systemTempIdentity)
    ) {
      fail("RUNTIME_DEPLOY_INVALID", [
        "EXACT_OS_TEMP_MATERIALIZER_SCHEMA_PATH_REQUIRED",
      ]);
    }
    const windowsChildEnvironment =
      await capturePinnedWindowsChildEnvironment();
    consumeMaterializerVerificationReceipt(
      input.materializerVerificationReceipt,
      input.schemaPath,
      schemaInspection,
    );
    const spawnEnvironment = {
      ...expectedEnvironment,
      ...windowsChildEnvironment,
      TEMP: schemaInspection.systemTempRealPath,
      TMP: schemaInspection.systemTempRealPath,
      TMPDIR: schemaInspection.systemTempRealPath,
    };
    try {
      const result = await dependencySet.spawnPrisma({
        env: spawnEnvironment,
        maxOutputBytes: MAX_DEPLOY_OUTPUT_BYTES,
        nodeExecutablePath: currentExecutable.nodeExecutablePath,
        prismaExecutablePath: currentExecutable.prismaExecutablePath,
        schemaPath: input.schemaPath,
        timeoutMilliseconds: DEPLOY_TIMEOUT_MILLISECONDS,
      });
      if (
        !exactKeys(result, ["exitCode", "responseObserved"]) ||
        result.exitCode !== 0 ||
        result.responseObserved !== true
      ) {
        fail("RUNTIME_DEPLOY_FAILED", [
          "EXACT_ZERO_EXIT_DEPLOY_RECEIPT_REQUIRED",
        ]);
      }
      try {
        await queryLockStatus();
      } catch {
        throw lostResponse(["DEPLOY_POST_EFFECT_CLUSTER_LOCK_DRIFT"]);
      }
      return deepFreeze({ responseObserved: true });
    } catch (error) {
      if (
        error instanceof
        Current180Current190DisposablePostgresqlRehearsalRuntimeError
      ) {
        throw error;
      }
      if (
        error?.hardQuarantine === true ||
        error?.processExitObserved === false
      ) {
        state.quarantined = true;
        fail("RUNTIME_MANUAL_RECOVERY_REQUIRED", [
          "CHILD_PROCESS_EXIT_COULD_NOT_BE_PROVEN",
          "AUTOMATIC_QUERY_DDL_AND_CLEANUP_DENIED",
        ]);
      }
      if (error?.effectMayHaveCommitted === true) {
        throw lostResponse(["PRISMA_DEPLOY_RESPONSE_LOST"]);
      }
      fail("RUNTIME_DEPLOY_FAILED", ["PRISMA_DEPLOY_FAILED"]);
    }
  }

  async function cleanup(input) {
    const names = validateCommonInput(input, [
      "authorizationReceiptDigest",
      "expectedIdentity",
      "journalRecordDigest",
      "names",
      "reason",
      "runToken",
    ]);
    bindAuthorization(input, names);
    requireBinding();
    if (
      typeof input.reason !== "string" ||
      !SAFE_CLEANUP_REASONS.has(input.reason)
    ) {
      fail("RUNTIME_CLEANUP_INVALID", ["EXACT_CLEANUP_REASON_REQUIRED"]);
    }
    const identity = expectedIdentitySnapshot(
      input.expectedIdentity,
      input.authorizationReceiptDigest,
      names,
    );
    let responseObserved = true;
    let targetAbsentVerified = false;
    try {
      const rows = await queryCatalog(
        identity?.oid ?? null,
        identity?.marker ?? null,
      );
      if (rows.length === 0) {
        targetAbsentVerified = true;
      } else {
        if (identity === null || rows.length !== 1 || state.lock === null) {
          fail("RUNTIME_CLEANUP_FOREIGN_IDENTITY", [
            "ACTIVE_LOCK_AND_EXACT_EXPECTED_IDENTITY_REQUIRED_FOR_MUTATION",
          ]);
        }
        const row = rows[0];
        verifyExpectedOwnedCatalogRow(row, identity, names);
        await queryLockStatus();
        if (row.allowConnections) {
          const sealSql = `ALTER DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(row.databaseName)} WITH ALLOW_CONNECTIONS = false;`;
          try {
            await state.maintenanceClient.$executeRawUnsafe(sealSql);
          } catch {
            throw lostResponse(["JANITOR_SEAL_RESPONSE_LOST"]);
          }
          await queryLockStatus();
          const sealedRows = await queryCatalog(identity.oid, identity.marker);
          if (
            sealedRows.length !== 1 ||
            sealedRows[0].allowConnections !== false
          ) {
            throw lostResponse(["JANITOR_SEAL_RECONCILIATION_FAILED"]);
          }
          verifyExpectedOwnedCatalogRow(sealedRows[0], identity, names);
        }
        await queryLockStatus();
        const dropSql = `DROP DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(row.databaseName)};`;
        try {
          await state.maintenanceClient.$executeRawUnsafe(dropSql);
        } catch {
          throw lostResponse(["JANITOR_DROP_RESPONSE_LOST"]);
        }
        await queryLockStatus();
        const absentRows = await queryCatalog(identity.oid, identity.marker);
        if (absentRows.length !== 0) {
          throw lostResponse(["JANITOR_DROP_ABSENCE_NOT_RECONCILED"]);
        }
        targetAbsentVerified = true;
      }
    } catch (error) {
      if (error?.code === "RUNTIME_EFFECT_RESPONSE_LOST") {
        responseObserved = false;
      }
      throw error;
    }
    if (state.lock !== null) {
      await releaseActiveClusterLock(
        "RUNTIME_CLEANUP_FAILED",
        "JANITOR_CLUSTER_LOCK_RELEASE_NOT_OBSERVED_AFTER_BOUNDED_RETRY",
      );
    }
    const runtimeResourcesReleased = await disconnectBestEffort(
      state.maintenanceClient,
    );
    state.maintenanceClient = null;
    state.resourcesReleased = runtimeResourcesReleased;
    if (!runtimeResourcesReleased) {
      fail("RUNTIME_CLEANUP_FAILED", [
        "PRISMA_RUNTIME_RESOURCE_RELEASE_REQUIRED",
      ]);
    }
    return deepFreeze({
      responseObserved,
      runtimeResourcesReleased: true,
      targetAbsentVerified,
    });
  }

  const adapter = {
    acquireClusterLock,
    attestExecutableRuntime,
    cleanup,
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_RUNTIME_ADAPTER_CONTRACT,
    deploy,
    executeStatement,
    liveQuery,
    releaseClusterLock,
  };
  if (!exactKeys(adapter, ADAPTER_KEYS)) {
    fail("RUNTIME_ADAPTER_CONSTRUCTION_FAILED", [
      "EXACT_ADAPTER_INTERFACE_REQUIRED",
    ]);
  }
  return Object.freeze(adapter);
}

export function createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapter(
  environmentSnapshot,
) {
  if (arguments.length !== 1) {
    fail("RUNTIME_FACTORY_INVALID", ["EXACTLY_ONE_ENVIRONMENT_REQUIRED"]);
  }
  return createAdapter(environmentSnapshot, DEFAULT_DEPENDENCIES, false);
}

export function createCurrent180Current190DisposablePostgresqlRehearsalRuntimeAdapterForTestOnly(
  environmentSnapshot,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail("RUNTIME_TEST_FACTORY_INVALID", [
      "EXACT_ENVIRONMENT_AND_DEPENDENCIES_REQUIRED",
    ]);
  }
  return createAdapter(environmentSnapshot, dependencies, true);
}

export async function runCurrent180Current190IsolatedNodeSpawnForTestOnly(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, [
      "environment",
      "maxOutputBytes",
      "nodeExecutablePath",
      "script",
      "timeoutMilliseconds",
    ]) ||
    !isPlainData(input.environment) ||
    Array.isArray(input.environment) ||
    Object.values(input.environment).some(
      (value) => typeof value !== "string",
    ) ||
    typeof input.nodeExecutablePath !== "string" ||
    !isAbsolute(input.nodeExecutablePath) ||
    typeof input.script !== "string" ||
    Buffer.byteLength(input.script, "utf8") > 4_096 ||
    !Number.isSafeInteger(input.maxOutputBytes) ||
    input.maxOutputBytes < 1 ||
    input.maxOutputBytes > 65_536 ||
    !Number.isSafeInteger(input.timeoutMilliseconds) ||
    input.timeoutMilliseconds < 10 ||
    input.timeoutMilliseconds > 10_000
  ) {
    fail("RUNTIME_TEST_SPAWN_INVALID", [
      "EXACT_BOUNDED_ISOLATED_NODE_SPAWN_INPUT_REQUIRED",
    ]);
  }
  return spawnBoundedChild({
    arguments: isolatedNodeArguments(input.environment, "eval", [
      Buffer.from(input.script, "utf8").toString("base64"),
    ]),
    cwd: resolve(tmpdir()),
    env: { ...input.environment },
    executablePath: input.nodeExecutablePath,
    maxOutputBytes: input.maxOutputBytes,
    timeoutMilliseconds: input.timeoutMilliseconds,
  });
}

export async function runCurrent180Current190IsolatedCommonJsMainSpawnForTestOnly(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, [
      "environment",
      "maxOutputBytes",
      "modulePath",
      "nodeExecutablePath",
      "schemaPath",
      "timeoutMilliseconds",
    ]) ||
    !isPlainData(input.environment) ||
    Array.isArray(input.environment) ||
    Object.values(input.environment).some(
      (value) => typeof value !== "string",
    ) ||
    typeof input.nodeExecutablePath !== "string" ||
    !isAbsolute(input.nodeExecutablePath) ||
    typeof input.modulePath !== "string" ||
    !isAbsolute(input.modulePath) ||
    typeof input.schemaPath !== "string" ||
    !isAbsolute(input.schemaPath) ||
    !Number.isSafeInteger(input.maxOutputBytes) ||
    input.maxOutputBytes < 1 ||
    input.maxOutputBytes > 65_536 ||
    !Number.isSafeInteger(input.timeoutMilliseconds) ||
    input.timeoutMilliseconds < 10 ||
    input.timeoutMilliseconds > 10_000
  ) {
    fail("RUNTIME_TEST_COMMONJS_MAIN_SPAWN_INVALID", [
      "EXACT_BOUNDED_ISOLATED_COMMONJS_MAIN_INPUT_REQUIRED",
    ]);
  }
  const [physicalTemporaryRoot, physicalModulePath] = await Promise.all([
    realpath(tmpdir()),
    realpath(input.modulePath),
  ]);
  if (
    !sameNativePath(physicalModulePath, input.modulePath) ||
    !pathInside(physicalTemporaryRoot, physicalModulePath)
  ) {
    fail("RUNTIME_TEST_COMMONJS_MAIN_SPAWN_INVALID", [
      "EXACT_SYSTEM_TEMP_COMMONJS_MODULE_REQUIRED",
    ]);
  }
  return spawnBoundedChild({
    arguments: isolatedNodeArguments(input.environment, "prisma", [
      physicalModulePath,
      input.schemaPath,
    ]),
    cwd: dirname(physicalModulePath),
    env: { ...input.environment },
    executablePath: input.nodeExecutablePath,
    maxOutputBytes: input.maxOutputBytes,
    timeoutMilliseconds: input.timeoutMilliseconds,
  });
}
