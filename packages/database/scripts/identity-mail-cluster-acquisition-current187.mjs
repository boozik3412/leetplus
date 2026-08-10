import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CLUSTER_INVENTORY_KIND,
  CURRENT187_CLUSTER_INVENTORY_PROFILE,
  CURRENT187_CLUSTER_INVENTORY_SLICE,
  current187ClusterIdentityDigest,
  current187DatabaseIdentityDigest,
  attachVerifiedCurrent187DdlFenceAttestation,
  normalizeCurrent187DatabaseIdentity,
  normalizeCurrent187DdlFence,
  normalizeCurrent187ExpectedDatabaseCatalog,
  planCurrent187ClusterInventoryAdmission,
} from "./identity-mail-cluster-inventory-current187-planner.mjs";
import {
  CURRENT187_BACKEND_IDENTITY_SQL,
  CURRENT187_CONTROL_IDENTITY_SQL,
  CURRENT187_DATABASE_SNAPSHOT_SQL,
  CURRENT187_PER_DATABASE_CATALOG_SURFACES,
} from "./identity-mail-cluster-acquisition-current187-sql.mjs";

export const CURRENT187_CLUSTER_ACQUISITION_SLICE =
  "CURRENT187_C_READ_ONLY_POSTGRES_ACQUISITION_ADAPTER";
export const CURRENT187_CLUSTER_ACQUISITION_KIND =
  "CURRENT187_CLUSTER_ACQUISITION_REQUEST";
export const CURRENT187_CLUSTER_ACQUISITION_PROFILE =
  "CURRENT187_LOOPBACK_CI_READ_ONLY_POSTGRES_ACQUISITION_V1";
export const CURRENT187_CLUSTER_ACQUISITION_RECEIPT_KIND =
  "CURRENT187_CLUSTER_ACQUISITION_DENY_ONLY_RECEIPT";
export const CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND =
  "CURRENT187_EXTERNAL_DDL_FENCE_DECLARATION_V1";
export const CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION =
  "run-current187-read-only-cluster-acquisition-loopback-ci-only";

export const CURRENT187_CLUSTER_ACQUISITION_MAX_STATEMENT_TIMEOUT_MS = 10_000;
export const CURRENT187_CLUSTER_ACQUISITION_MAX_CONNECTION_TIMEOUT_MS = 5_000;
export const CURRENT187_CLUSTER_ACQUISITION_MAX_ROWS_PER_SURFACE = 250_000;
export const CURRENT187_CLUSTER_ACQUISITION_MAX_EVIDENCE_BYTES_PER_ROW =
  4 * 1_024 * 1_024;
export const CURRENT187_CLUSTER_ACQUISITION_MAX_EVIDENCE_BYTES_PER_SURFACE =
  64 * 1_024 * 1_024;

const CURRENT187_CLUSTER_ENDPOINT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_ACQUIRED_CLUSTER_ENDPOINT_V1";
const CURRENT187_CATALOG_SURFACE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_CATALOG_SURFACE_V1";
const CURRENT187_CATALOG_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_CATALOG_V1";
const CURRENT187_ROLE_BINDINGS_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_ROLE_BINDINGS_V1";
const CURRENT187_CURRENT_ACL_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_CURRENT_ACL_POLICY_V1";
const CURRENT187_DEFAULT_ACL_POLICY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_DEFAULT_ACL_POLICY_V1";
const CURRENT187_SCAN_EVIDENCE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_PER_DATABASE_SCAN_EVIDENCE_V1";
const CURRENT187_ACQUISITION_RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_CLUSTER_ACQUISITION_RECEIPT_V1";

const REQUEST_KEYS = [
  "contract",
  "expectedCatalog",
  "externalDdlFenceReceipt",
  "kind",
  "profile",
  "schemaVersion",
  "slice",
  "syntheticContext",
  "topologyDigest",
];

const SYNTHETIC_CONTEXT_KEYS = [
  "connectionTimeoutMs",
  "databaseName",
  "endpointHost",
  "environment",
  "explicitConfirmation",
  "nodeEnv",
  "scannerRoleName",
  "statementTimeoutMs",
];

const EXTERNAL_FENCE_RECEIPT_KEYS = ["attestationStatus", "fence", "kind"];
const DEPENDENCY_KEYS = ["connect", "now"];
const CLIENT_KEYS = ["close", "query"];

const CONTROL_IDENTITY_ROW_KEYS = [
  "catalogVersionNo",
  "controlVersion",
  "currentUser",
  "databaseName",
  "scannerBypassRls",
  "scannerCanLogin",
  "scannerCreateDatabase",
  "scannerCreateRole",
  "scannerReplication",
  "scannerSuperuser",
  "serverAddress",
  "serverPort",
  "serverVersionNum",
  "sessionUser",
  "systemIdentifier",
];

const BACKEND_IDENTITY_ROW_KEYS = [
  "currentUser",
  "databaseName",
  "databaseOid",
  "scannerBypassRls",
  "scannerCanLogin",
  "scannerCreateDatabase",
  "scannerCreateRole",
  "scannerReplication",
  "scannerSuperuser",
  "serverAddress",
  "serverPort",
  "sessionUser",
];

const DATABASE_ROW_KEYS = [
  "collate",
  "connectionLimit",
  "ctype",
  "datallowconn",
  "encoding",
  "isTemplate",
  "localeProvider",
  "name",
  "oid",
  "ownerName",
  "ownerOid",
];

const LOOPBACK_CONTEXT_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const LOOPBACK_SERVER_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const CI_DATABASE_PATTERN = /_(?:ci|test)$/u;
const PRODUCTION_DATABASE_PATTERN = /(?:^|_)(?:live|prod|production)(?:_|$)/u;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const VERIFIED_CURRENT187_CLUSTER_ACQUISITION_RECEIPTS = new WeakSet();

const ROLE_BINDING_SURFACES = new Set([
  "effectiveObjectPrivileges",
  "memberships",
  "ownedObjects",
  "roleDatabaseSettings",
  "roles",
]);
const CURRENT_ACL_POLICY_SURFACES = new Set([
  "columnAclAllGrantees",
  "databaseSecurity",
  "effectiveObjectPrivileges",
  "relationAclAllGrantees",
  "routineAclAllGrantees",
  "schemaAclAllGrantees",
  "typeAclAllGrantees",
]);
const DEFAULT_ACL_POLICY_SURFACES = new Set(["defaultAclAllGrantees"]);

class Current187ClusterAcquisitionError extends Error {
  constructor(reasonCode) {
    super("CURRENT187 read-only acquisition failed closed.");
    this.name = "Current187ClusterAcquisitionError";
    this.reasonCode = reasonCode;
  }
}

class Current187ClusterAcquisitionTimeoutError extends Error {
  constructor() {
    super("CURRENT187 read-only acquisition exceeded its bounded timeout.");
    this.name = "Current187ClusterAcquisitionTimeoutError";
  }
}

function acquisitionFail(reasonCode) {
  throw new Current187ClusterAcquisitionError(reasonCode);
}

function digestCurrent187Value(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function exactOperationalRecord(value, expectedKeys, reasonCode) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    current187AdmissionFail(
      reasonCode,
      "CURRENT187 acquisition dependencies must be an exact local record.",
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(descriptors);
  const wantedKeys = [...expectedKeys].sort();
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== wantedKeys.length ||
    wantedKeys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true
      );
    })
  ) {
    current187AdmissionFail(
      reasonCode,
      "CURRENT187 acquisition dependencies must be an exact local record.",
    );
  }
  actualKeys.sort();
  if (actualKeys.some((key, index) => key !== wantedKeys[index])) {
    current187AdmissionFail(
      reasonCode,
      "CURRENT187 acquisition dependencies must be an exact local record.",
    );
  }
  return Object.freeze(
    Object.fromEntries(wantedKeys.map((key) => [key, descriptors[key].value])),
  );
}

function canonicalIso(value, reasonCode) {
  if (typeof value !== "string") {
    acquisitionFail(reasonCode);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    acquisitionFail(reasonCode);
  }
  return value;
}

function normalizePositiveInteger(value, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    current187AdmissionFail(
      reasonCode,
      "A CURRENT187 acquisition bound is invalid.",
    );
  }
  return value;
}

function normalizeSyntheticContext(value) {
  const context = current187AdmissionExactDataRecord(
    value,
    SYNTHETIC_CONTEXT_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_SYNTHETIC_CONTEXT_DENIED",
    "CURRENT187 acquisition requires an exact loopback CI context.",
  );
  if (
    context.environment !== "ci" ||
    context.nodeEnv !== "test" ||
    process.env.NODE_ENV !== "test" ||
    context.explicitConfirmation !==
      CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION ||
    typeof context.endpointHost !== "string" ||
    !LOOPBACK_CONTEXT_HOSTS.has(context.endpointHost) ||
    typeof context.databaseName !== "string" ||
    !SAFE_DATABASE_PATTERN.test(context.databaseName) ||
    !CI_DATABASE_PATTERN.test(context.databaseName) ||
    PRODUCTION_DATABASE_PATTERN.test(context.databaseName) ||
    SYSTEM_DATABASES.has(context.databaseName) ||
    typeof context.scannerRoleName !== "string" ||
    !SAFE_ROLE_PATTERN.test(context.scannerRoleName) ||
    context.scannerRoleName.startsWith("pg_")
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_SYNTHETIC_CONTEXT_DENIED",
      "CURRENT187 acquisition is restricted to explicit loopback CI databases.",
    );
  }
  normalizePositiveInteger(
    context.connectionTimeoutMs,
    CURRENT187_CLUSTER_ACQUISITION_MAX_CONNECTION_TIMEOUT_MS,
    "CURRENT187_CLUSTER_ACQUISITION_SYNTHETIC_CONTEXT_DENIED",
  );
  normalizePositiveInteger(
    context.statementTimeoutMs,
    CURRENT187_CLUSTER_ACQUISITION_MAX_STATEMENT_TIMEOUT_MS,
    "CURRENT187_CLUSTER_ACQUISITION_SYNTHETIC_CONTEXT_DENIED",
  );
  return Object.freeze({ ...context });
}

function normalizeExternalFenceReceipt(value) {
  const receipt = current187AdmissionExactDataRecord(
    value,
    EXTERNAL_FENCE_RECEIPT_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_EXTERNAL_FENCE_INVALID",
    "CURRENT187 acquisition requires one explicit external fence declaration.",
  );
  if (
    receipt.kind !== CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND ||
    receipt.attestationStatus !== "DECLARED_UNVERIFIED"
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_EXTERNAL_FENCE_INVALID",
      "CURRENT187 acquisition cannot claim an internally acquired DDL fence.",
    );
  }
  return Object.freeze({
    attestationStatus: receipt.attestationStatus,
    fence: normalizeCurrent187DdlFence(receipt.fence),
    kind: receipt.kind,
  });
}

function normalizeRequest(value) {
  const request = current187AdmissionExactDataRecord(
    value,
    REQUEST_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_REQUEST_INVALID",
    "The CURRENT187 acquisition request must be exact and data-only.",
  );
  if (
    request.contract !== CURRENT187_ADMISSION_CONTRACT ||
    request.slice !== CURRENT187_CLUSTER_ACQUISITION_SLICE ||
    request.schemaVersion !== CURRENT187_ADMISSION_SCHEMA_VERSION ||
    request.kind !== CURRENT187_CLUSTER_ACQUISITION_KIND ||
    request.profile !== CURRENT187_CLUSTER_ACQUISITION_PROFILE ||
    !current187AdmissionValidDigest(request.topologyDigest)
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_CONTRACT_INVALID",
      "The CURRENT187 acquisition contract discriminator is invalid.",
    );
  }
  const syntheticContext = normalizeSyntheticContext(request.syntheticContext);
  const expectedCatalog = normalizeCurrent187ExpectedDatabaseCatalog(
    request.expectedCatalog,
  );
  const externalDdlFenceReceipt = normalizeExternalFenceReceipt(
    request.externalDdlFenceReceipt,
  );
  if (
    !expectedCatalog.nonTemplateDatabases.some(
      (database) =>
        database.name === syntheticContext.databaseName &&
        database.datallowconn === true,
    )
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_SYNTHETIC_CONTEXT_DENIED",
      "The loopback control database must be an exact connectable allowlist entry.",
    );
  }
  return current187AdmissionDeepFreeze({
    ...request,
    expectedCatalog,
    externalDdlFenceReceipt,
    syntheticContext,
  });
}

function normalizeDependencies(value) {
  const dependencies = exactOperationalRecord(
    value,
    DEPENDENCY_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.connect !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_DEPENDENCIES_INVALID",
      "CURRENT187 acquisition dependencies must expose connect and now.",
    );
  }
  return dependencies;
}

function normalizeClient(value) {
  const client = exactOperationalRecord(
    value,
    CLIENT_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_CLIENT_INVALID",
  );
  if (
    typeof client.query !== "function" ||
    typeof client.close !== "function"
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CLIENT_INVALID");
  }
  return client;
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Current187ClusterAcquisitionTimeoutError()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function denseRows(value, maximum, reasonCode) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    value.length > maximum ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== "string" ||
        (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)),
    ) ||
    Array.from({ length: value.length }, (_, index) => index).some(
      (index) => !Object.hasOwn(value, index),
    )
  ) {
    acquisitionFail(reasonCode);
  }
  return value;
}

function assertReadOnlyStatement(sql) {
  if (typeof sql !== "string") {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_SQL_POLICY_DENIED");
  }
  const normalized = sql.replace(/\/\*[\s\S]*?\*\//gu, "").trimStart();
  if (
    !/^(?:SELECT|WITH|BEGIN\b|SET LOCAL\b|COMMIT\b|ROLLBACK\b)/iu.test(
      normalized,
    )
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_SQL_POLICY_DENIED");
  }
}

async function queryRows(client, sql, timeoutMs, maximum, reasonCode) {
  assertReadOnlyStatement(sql);
  const result = await withTimeout(
    Promise.resolve().then(() => client.query(sql)),
    timeoutMs,
  );
  return denseRows(result, maximum, reasonCode);
}

async function closeClient(client, timeoutMs) {
  try {
    await withTimeout(
      Promise.resolve().then(() => client.close()),
      timeoutMs,
    );
  } catch {
    // A failed close cannot turn a failed-closed receipt into an authorization.
  }
}

async function runReadOnlySession(
  dependencies,
  databaseName,
  context,
  callback,
) {
  const connected = await withTimeout(
    Promise.resolve().then(() =>
      dependencies.connect(databaseName, context.connectionTimeoutMs),
    ),
    context.connectionTimeoutMs,
  );
  const client = normalizeClient(connected);
  let transactionStarted = false;
  try {
    await queryRows(
      client,
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      context.statementTimeoutMs,
      0,
      "CURRENT187_CLUSTER_ACQUISITION_TRANSACTION_FAILED",
    );
    transactionStarted = true;
    await queryRows(
      client,
      `SET LOCAL statement_timeout = '${context.statementTimeoutMs}ms'`,
      context.statementTimeoutMs,
      0,
      "CURRENT187_CLUSTER_ACQUISITION_TRANSACTION_FAILED",
    );
    await queryRows(
      client,
      `SET LOCAL lock_timeout = '${context.statementTimeoutMs}ms'`,
      context.statementTimeoutMs,
      0,
      "CURRENT187_CLUSTER_ACQUISITION_TRANSACTION_FAILED",
    );
    const result = await callback(client);
    await queryRows(
      client,
      "COMMIT",
      context.statementTimeoutMs,
      0,
      "CURRENT187_CLUSTER_ACQUISITION_TRANSACTION_FAILED",
    );
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await queryRows(
          client,
          "ROLLBACK",
          context.statementTimeoutMs,
          0,
          "CURRENT187_CLUSTER_ACQUISITION_TRANSACTION_FAILED",
        );
      } catch {
        // The original safe failure is retained.
      }
    }
    throw error;
  } finally {
    await closeClient(client, context.connectionTimeoutMs);
  }
}

function parseOid(value, reasonCode) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/u.test(value)) {
    acquisitionFail(reasonCode);
  }
  const oid = Number(value);
  if (!Number.isSafeInteger(oid) || oid > 4_294_967_295) {
    acquisitionFail(reasonCode);
  }
  return oid;
}

function normalizeDatabaseRow(value) {
  const row = current187AdmissionExactDataRecord(
    value,
    DATABASE_ROW_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_DATABASE_ROW_INVALID",
    "A CURRENT187 pg_database row is malformed.",
  );
  return normalizeCurrent187DatabaseIdentity({
    ...row,
    oid: parseOid(
      row.oid,
      "CURRENT187_CLUSTER_ACQUISITION_DATABASE_ROW_INVALID",
    ),
    ownerOid: parseOid(
      row.ownerOid,
      "CURRENT187_CLUSTER_ACQUISITION_DATABASE_ROW_INVALID",
    ),
  });
}

function normalizeDatabaseRows(rows) {
  const databases = denseRows(
    rows,
    1_024,
    "CURRENT187_CLUSTER_ACQUISITION_DATABASE_SNAPSHOT_PARTIAL",
  ).map(normalizeDatabaseRow);
  if (databases.length === 0) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_DATABASE_SNAPSHOT_PARTIAL");
  }
  return Object.freeze(
    [...databases].sort((left, right) =>
      left.name < right.name
        ? -1
        : left.name > right.name
          ? 1
          : left.oid - right.oid,
    ),
  );
}

function assertScannerIdentity(
  row,
  context,
  expectedDatabaseName,
  expectedOid,
) {
  if (
    row.databaseName !== expectedDatabaseName ||
    (expectedOid !== undefined &&
      parseOid(
        row.databaseOid,
        "CURRENT187_CLUSTER_ACQUISITION_BACKEND_IDENTITY_DENIED",
      ) !== expectedOid)
  ) {
    acquisitionFail(
      "CURRENT187_CLUSTER_ACQUISITION_BACKEND_DATABASE_BINDING_DENIED",
    );
  }
  if (
    row.sessionUser !== context.scannerRoleName ||
    row.currentUser !== context.scannerRoleName
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_SCANNER_ROLE_DENIED");
  }
  if (
    row.scannerCanLogin !== true ||
    row.scannerSuperuser !== false ||
    row.scannerCreateRole !== false ||
    row.scannerCreateDatabase !== false ||
    row.scannerReplication !== false ||
    row.scannerBypassRls !== false
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_SCANNER_ATTRIBUTES_DENIED");
  }
  if (
    typeof row.serverAddress !== "string" ||
    !LOOPBACK_SERVER_ADDRESSES.has(row.serverAddress)
  ) {
    acquisitionFail(
      "CURRENT187_CLUSTER_ACQUISITION_BACKEND_ADDRESS_NOT_LOOPBACK",
    );
  }
  if (
    context.endpointHost !== "localhost" &&
    row.serverAddress !== context.endpointHost
  ) {
    acquisitionFail(
      "CURRENT187_CLUSTER_ACQUISITION_BACKEND_ADDRESS_BINDING_DENIED",
    );
  }
  if (
    !Number.isSafeInteger(row.serverPort) ||
    row.serverPort < 1 ||
    row.serverPort > 65_535
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_BACKEND_PORT_DENIED");
  }
  return Object.freeze({
    databaseName: row.databaseName,
    databaseOid: expectedOid,
    scannerRoleName: row.sessionUser,
    serverAddress: row.serverAddress,
    serverPort: row.serverPort,
  });
}

function normalizeControlIdentityRow(value, request) {
  const row = current187AdmissionExactDataRecord(
    value,
    CONTROL_IDENTITY_ROW_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_CONTROL_IDENTITY_INVALID",
    "The CURRENT187 control identity row is malformed.",
  );
  const backend = assertScannerIdentity(
    row,
    request.syntheticContext,
    request.syntheticContext.databaseName,
  );
  const clusterIdentity = {
    catalogVersionNo: row.catalogVersionNo,
    controlVersion: row.controlVersion,
    endpointDigest: digestCurrent187Value(
      CURRENT187_CLUSTER_ENDPOINT_DIGEST_DOMAIN,
      {
        serverAddress: backend.serverAddress,
        serverPort: backend.serverPort,
      },
    ),
    serverVersionNum: row.serverVersionNum,
    systemIdentifier: row.systemIdentifier,
    topologyDigest: request.topologyDigest,
  };
  return current187AdmissionDeepFreeze({
    backend,
    clusterIdentity,
    clusterIdentityDigest: current187ClusterIdentityDigest(clusterIdentity),
  });
}

function normalizeBackendIdentityRow(value, request, database) {
  const row = current187AdmissionExactDataRecord(
    value,
    BACKEND_IDENTITY_ROW_KEYS,
    "CURRENT187_CLUSTER_ACQUISITION_BACKEND_IDENTITY_INVALID",
    "The CURRENT187 backend identity row is malformed.",
  );
  return assertScannerIdentity(
    row,
    request.syntheticContext,
    database.name,
    database.oid,
  );
}

async function readExactlyOneRow(client, sql, context, reasonCode) {
  const rows = await queryRows(
    client,
    sql,
    context.statementTimeoutMs,
    1,
    reasonCode,
  );
  if (rows.length !== 1) {
    acquisitionFail(reasonCode);
  }
  return rows[0];
}

async function acquireControlSnapshot(dependencies, request) {
  return runReadOnlySession(
    dependencies,
    request.syntheticContext.databaseName,
    request.syntheticContext,
    async (client) => {
      const controlRow = await readExactlyOneRow(
        client,
        CURRENT187_CONTROL_IDENTITY_SQL,
        request.syntheticContext,
        "CURRENT187_CLUSTER_ACQUISITION_CONTROL_IDENTITY_UNREAD",
      );
      const identity = normalizeControlIdentityRow(controlRow, request);
      const databaseRows = await queryRows(
        client,
        CURRENT187_DATABASE_SNAPSHOT_SQL,
        request.syntheticContext.statementTimeoutMs,
        1_024,
        "CURRENT187_CLUSTER_ACQUISITION_DATABASE_SNAPSHOT_PARTIAL",
      );
      return current187AdmissionDeepFreeze({
        ...identity,
        databases: normalizeDatabaseRows(databaseRows),
      });
    },
  );
}

function validateEvidenceJson(value, depth = 0) {
  if (depth > 16) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 8_192) {
      acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
    }
    for (const entry of value) {
      validateEvidenceJson(entry, depth + 1);
    }
    return;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length > 512
  ) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.length > 128) {
      acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
    }
    validateEvidenceJson(entry, depth + 1);
  }
}

function digestCatalogSurface(surface, rows) {
  let totalBytes = 0;
  const canonicalRows = rows.map((value) => {
    const row = current187AdmissionExactDataRecord(
      value,
      ["evidence"],
      "CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID",
      "A CURRENT187 catalog evidence row is malformed.",
    );
    if (
      typeof row.evidence !== "string" ||
      Buffer.byteLength(row.evidence, "utf8") >
        CURRENT187_CLUSTER_ACQUISITION_MAX_EVIDENCE_BYTES_PER_ROW
    ) {
      acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
    }
    totalBytes += Buffer.byteLength(row.evidence, "utf8");
    if (
      totalBytes > CURRENT187_CLUSTER_ACQUISITION_MAX_EVIDENCE_BYTES_PER_SURFACE
    ) {
      acquisitionFail(
        "CURRENT187_CLUSTER_ACQUISITION_CATALOG_SURFACE_TOO_LARGE",
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(row.evidence);
    } catch {
      acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CATALOG_ROW_INVALID");
    }
    validateEvidenceJson(parsed);
    return current187AdmissionCanonicalJson(parsed);
  });
  canonicalRows.sort();
  return Object.freeze({
    digest: digestCurrent187Value(CURRENT187_CATALOG_SURFACE_DIGEST_DOMAIN, {
      rows: canonicalRows,
      surface: surface.name,
    }),
    rowCount: canonicalRows.length,
    surface: surface.name,
  });
}

function digestCatalogPolicySurfaceGroup(domain, surfaces, allowlist) {
  const selected = surfaces.filter((surface) => allowlist.has(surface.surface));
  if (selected.length !== allowlist.size) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_POLICY_SURFACE_PARTIAL");
  }
  return digestCurrent187Value(domain, selected);
}

async function acquirePerDatabaseCatalog(dependencies, request, database) {
  const startedAt = canonicalIso(
    dependencies.now(),
    "CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID",
  );
  const acquired = await runReadOnlySession(
    dependencies,
    database.name,
    request.syntheticContext,
    async (client) => {
      const backendRow = await readExactlyOneRow(
        client,
        CURRENT187_BACKEND_IDENTITY_SQL,
        request.syntheticContext,
        "CURRENT187_CLUSTER_ACQUISITION_BACKEND_IDENTITY_UNREAD",
      );
      const backend = normalizeBackendIdentityRow(
        backendRow,
        request,
        database,
      );
      const surfaces = [];
      for (const surface of CURRENT187_PER_DATABASE_CATALOG_SURFACES) {
        const rows = await queryRows(
          client,
          surface.sql,
          request.syntheticContext.statementTimeoutMs,
          CURRENT187_CLUSTER_ACQUISITION_MAX_ROWS_PER_SURFACE,
          "CURRENT187_CLUSTER_ACQUISITION_CATALOG_SURFACE_PARTIAL",
        );
        surfaces.push(digestCatalogSurface(surface, rows));
      }
      return current187AdmissionDeepFreeze({ backend, surfaces });
    },
  );
  const completedAt = canonicalIso(
    dependencies.now(),
    "CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID",
  );
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    acquisitionFail("CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID");
  }
  const databaseIdentityDigest = current187DatabaseIdentityDigest(database);
  const catalogDigest = digestCurrent187Value(
    CURRENT187_CATALOG_DIGEST_DOMAIN,
    {
      databaseIdentityDigest,
      surfaces: acquired.surfaces,
    },
  );
  const roleBindingsDigest = digestCatalogPolicySurfaceGroup(
    CURRENT187_ROLE_BINDINGS_DIGEST_DOMAIN,
    acquired.surfaces,
    ROLE_BINDING_SURFACES,
  );
  const currentAclPolicyDigest = digestCatalogPolicySurfaceGroup(
    CURRENT187_CURRENT_ACL_POLICY_DIGEST_DOMAIN,
    acquired.surfaces,
    CURRENT_ACL_POLICY_SURFACES,
  );
  const defaultAclPolicyDigest = digestCatalogPolicySurfaceGroup(
    CURRENT187_DEFAULT_ACL_POLICY_DIGEST_DOMAIN,
    acquired.surfaces,
    DEFAULT_ACL_POLICY_SURFACES,
  );
  return current187AdmissionDeepFreeze({
    catalogDigest,
    catalogSurfaceStatus: "COMPLETE",
    clusterIdentityDigest: null,
    completedAt,
    connectionStatus: "CONNECTED",
    currentAclPolicyDigest,
    databaseIdentityDigest,
    databaseName: database.name,
    databaseOid: database.oid,
    defaultAclPolicyDigest,
    ddlFenceDigest: request.externalDdlFenceReceipt.fence.evidenceDigest,
    roleBindingsDigest,
    scanEvidenceDigest: digestCurrent187Value(
      CURRENT187_SCAN_EVIDENCE_DIGEST_DOMAIN,
      {
        backend: acquired.backend,
        catalogDigest,
        completedAt,
        databaseIdentityDigest,
        startedAt,
      },
    ),
    startedAt,
  });
}

function sameDatabaseUniverse(left, right) {
  return (
    current187AdmissionCanonicalJson(left) ===
    current187AdmissionCanonicalJson(right)
  );
}

function expectedUniverse(expectedCatalog) {
  return Object.freeze(
    [
      ...expectedCatalog.nonTemplateDatabases,
      ...expectedCatalog.templateDatabases,
    ].sort((left, right) =>
      left.name < right.name
        ? -1
        : left.name > right.name
          ? 1
          : left.oid - right.oid,
    ),
  );
}

function buildDenyReceipt(reasonCode, sourceIoPerformed) {
  const reasonCodes = Object.freeze([reasonCode]);
  const publicReceipt = {
    acquisitionStatus: "DENIED",
    authorization: false,
    canMutate: false,
    canSend: false,
    catalogSurfaceCount: CURRENT187_PER_DATABASE_CATALOG_SURFACES.length,
    contract: CURRENT187_ADMISSION_CONTRACT,
    externalDdlFenceAttestationDigest: null,
    externalDdlFenceAttested: false,
    kind: CURRENT187_CLUSTER_ACQUISITION_RECEIPT_KIND,
    liveClusterScanAcquired: false,
    persistedConsumptionVerified: false,
    plannerReceipt: null,
    preAttestationAcquisitionDigest: null,
    productionRootEnrolled: false,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_CLUSTER_ACQUISITION_SLICE,
    sourceIoPerformed,
    testAccessAuthorized: false,
    topologyExternallyAttested: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    acquisitionDigest: digestCurrent187Value(
      CURRENT187_ACQUISITION_RECEIPT_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_CURRENT187_CLUSTER_ACQUISITION_RECEIPTS.add(receipt);
  return receipt;
}

function buildCompletedReceipt(plannerReceipt) {
  const reasonCodes = plannerReceipt.reasonCodes;
  const acquisitionStatus =
    plannerReceipt.inventoryStatus === "MATCHED" ? "ACQUIRED" : "DENIED";
  const publicReceipt = {
    acquisitionStatus,
    authorization: false,
    canMutate: false,
    canSend: false,
    catalogSurfaceCount: CURRENT187_PER_DATABASE_CATALOG_SURFACES.length,
    contract: CURRENT187_ADMISSION_CONTRACT,
    externalDdlFenceAttestationDigest: null,
    externalDdlFenceAttested: false,
    kind: CURRENT187_CLUSTER_ACQUISITION_RECEIPT_KIND,
    liveClusterScanAcquired: acquisitionStatus === "ACQUIRED",
    persistedConsumptionVerified: false,
    plannerReceipt,
    preAttestationAcquisitionDigest: null,
    productionRootEnrolled: false,
    reasonCodes,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_CLUSTER_ACQUISITION_SLICE,
    sourceIoPerformed: true,
    testAccessAuthorized: false,
    topologyExternallyAttested: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    acquisitionDigest: digestCurrent187Value(
      CURRENT187_ACQUISITION_RECEIPT_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_CURRENT187_CLUSTER_ACQUISITION_RECEIPTS.add(receipt);
  return receipt;
}

export async function acquireCurrent187ClusterInventory(
  requestValue,
  dependenciesValue,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_ARGUMENTS_INVALID",
      "CURRENT187 acquisition requires request and local dependencies.",
    );
  }
  const request = normalizeRequest(requestValue);
  const dependencies = normalizeDependencies(dependenciesValue);
  let sourceIoPerformed = false;
  try {
    sourceIoPerformed = true;
    const initial = await acquireControlSnapshot(dependencies, request);
    const expected = expectedUniverse(request.expectedCatalog);
    if (!sameDatabaseUniverse(initial.databases, expected)) {
      return buildDenyReceipt(
        "CURRENT187_CLUSTER_ACQUISITION_INITIAL_UNIVERSE_MISMATCH",
        true,
      );
    }
    if (
      request.expectedCatalog.nonTemplateDatabases.some(
        (database) => database.datallowconn !== true,
      )
    ) {
      return buildDenyReceipt(
        "CURRENT187_CLUSTER_ACQUISITION_NON_CONNECTABLE_DATABASE_UNREAD",
        true,
      );
    }

    const initialCapturedAt = canonicalIso(
      dependencies.now(),
      "CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID",
    );
    const scans = [];
    for (const database of request.expectedCatalog.nonTemplateDatabases) {
      const scan = await acquirePerDatabaseCatalog(
        dependencies,
        request,
        database,
      );
      scans.push({
        ...scan,
        clusterIdentityDigest: initial.clusterIdentityDigest,
      });
    }

    const final = await acquireControlSnapshot(dependencies, request);
    const finalCapturedAt = canonicalIso(
      dependencies.now(),
      "CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID",
    );
    if (
      final.clusterIdentityDigest !== initial.clusterIdentityDigest ||
      final.backend.serverAddress !== initial.backend.serverAddress ||
      final.backend.serverPort !== initial.backend.serverPort
    ) {
      return buildDenyReceipt(
        "CURRENT187_CLUSTER_ACQUISITION_CONTROL_IDENTITY_DRIFT",
        true,
      );
    }

    const evaluatedAt = canonicalIso(
      dependencies.now(),
      "CURRENT187_CLUSTER_ACQUISITION_CLOCK_INVALID",
    );
    const plannerReceipt = planCurrent187ClusterInventoryAdmission({
      clusterIdentity: initial.clusterIdentity,
      contract: CURRENT187_ADMISSION_CONTRACT,
      ddlFence: Object.fromEntries(
        [
          "active",
          "clusterDdlBlocked",
          "creatorPrincipalsDisabled",
          "databaseDdlBlocked",
          "evidenceDigest",
          "fenceEpoch",
          "migrationPrincipalsDisabled",
          "validFrom",
          "validUntil",
        ].map((key) => [key, request.externalDdlFenceReceipt.fence[key]]),
      ),
      environment: "ci",
      evaluatedAt,
      expectedCatalog: request.expectedCatalog,
      finalCatalogSnapshot: {
        capturedAt: finalCapturedAt,
        catalogRowsComplete: true,
        clusterIdentityDigest: final.clusterIdentityDigest,
        databases: final.databases,
        ddlFenceDigest: request.externalDdlFenceReceipt.fence.evidenceDigest,
        snapshotKind: "FINAL",
      },
      initialCatalogSnapshot: {
        capturedAt: initialCapturedAt,
        catalogRowsComplete: true,
        clusterIdentityDigest: initial.clusterIdentityDigest,
        databases: initial.databases,
        ddlFenceDigest: request.externalDdlFenceReceipt.fence.evidenceDigest,
        snapshotKind: "INITIAL",
      },
      kind: CURRENT187_CLUSTER_INVENTORY_KIND,
      perDatabaseScans: scans,
      profile: CURRENT187_CLUSTER_INVENTORY_PROFILE,
      schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
      slice: CURRENT187_CLUSTER_INVENTORY_SLICE,
    });
    return buildCompletedReceipt(plannerReceipt);
  } catch (error) {
    const reasonCode =
      error instanceof Current187ClusterAcquisitionTimeoutError
        ? "CURRENT187_CLUSTER_ACQUISITION_TIMEOUT"
        : error instanceof Current187ClusterAcquisitionError
          ? error.reasonCode
          : "CURRENT187_CLUSTER_ACQUISITION_UNREAD_OR_PARTIAL";
    return buildDenyReceipt(reasonCode, sourceIoPerformed);
  }
}

export function attachVerifiedCurrent187DdlFenceAttestationToAcquisition(
  acquisitionReceipt,
  attestationReceipt,
) {
  if (arguments.length !== 2) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_ATTESTATION_ARGUMENTS_INVALID",
      "Acquisition attestation requires one branded acquisition and one branded DDL-fence receipt.",
    );
  }
  if (
    !isVerifiedCurrent187ClusterAcquisitionReceipt(acquisitionReceipt) ||
    acquisitionReceipt.acquisitionStatus !== "ACQUIRED" ||
    acquisitionReceipt.liveClusterScanAcquired !== true ||
    acquisitionReceipt.plannerReceipt === null ||
    acquisitionReceipt.externalDdlFenceAttested !== false ||
    acquisitionReceipt.externalDdlFenceAttestationDigest !== null ||
    acquisitionReceipt.preAttestationAcquisitionDigest !== null
  ) {
    current187AdmissionFail(
      "CURRENT187_CLUSTER_ACQUISITION_ATTESTATION_BASE_INVALID",
      "Only one branded, acquired, unattested CURRENT187 acquisition can consume a DDL-fence attestation.",
    );
  }
  const plannerReceipt = attachVerifiedCurrent187DdlFenceAttestation(
    acquisitionReceipt.plannerReceipt,
    acquisitionReceipt.acquisitionDigest,
    attestationReceipt,
  );
  const { acquisitionDigest: ignoredAcquisitionDigest, ...priorPublicReceipt } =
    acquisitionReceipt;
  void ignoredAcquisitionDigest;
  const publicReceipt = {
    ...priorPublicReceipt,
    externalDdlFenceAttestationDigest:
      plannerReceipt.externalDdlFenceAttestationDigest,
    externalDdlFenceAttested: true,
    plannerReceipt,
    preAttestationAcquisitionDigest: acquisitionReceipt.acquisitionDigest,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    acquisitionDigest: digestCurrent187Value(
      CURRENT187_ACQUISITION_RECEIPT_DIGEST_DOMAIN,
      publicReceipt,
    ),
  });
  VERIFIED_CURRENT187_CLUSTER_ACQUISITION_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187ClusterAcquisitionReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_CLUSTER_ACQUISITION_RECEIPTS.has(value)
  );
}
