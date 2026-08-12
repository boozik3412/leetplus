import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { types as utilTypes } from "node:util";

import pg from "pg";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export const CURRENT187_PGBOUNCER_COLLECTOR_SLICE =
  "CURRENT187_J4_PGBOUNCER_CONTROL_PLANE_COLLECTOR";
export const CURRENT187_PGBOUNCER_COLLECTOR_PROFILE =
  "CURRENT187_PGBOUNCER_CONTROL_PLANE_OBSERVATION_DENY_ONLY_V1";
export const CURRENT187_PGBOUNCER_RECEIPT_KIND =
  "CURRENT187_PGBOUNCER_CONTROL_PLANE_OBSERVATION_DENY_ONLY_RECEIPT";
export const CURRENT187_PGBOUNCER_STATUS =
  "PGBOUNCER_CONTROL_PLANE_OBSERVED_DENY_ONLY";
export const CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION =
  "collect-current187-pgbouncer-production-control-plane-deny-only";
export const CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION =
  "collect-current187-pgbouncer-synthetic-control-plane-deny-only";
export const CURRENT187_PGBOUNCER_MAX_QUERY_TIMEOUT_MS = 10_000;
export const CURRENT187_PGBOUNCER_MAX_CONNECT_TIMEOUT_MS = 10_000;

const INPUT_KEYS = Object.freeze([
  "adminUrl",
  "applicationDatabaseName",
  "applicationUserName",
  "caCertificatePem",
  "caCertificateSha256",
  "clusterIdentityDigest",
  "connectTimeoutMs",
  "databaseUniverseDigest",
  "endpointTlsPeerReceiptDigest",
  "environment",
  "expectedBackendAddress",
  "expectedBackendDatabaseName",
  "expectedBackendHost",
  "expectedBackendPort",
  "expectedPoolerConfigurationDigest",
  "explicitConfirmation",
  "hbaReloadReceiptDigest",
  "queryTimeoutMs",
  "releaseSha",
  "serverName",
  "verificationChallengeDigest",
]);
const DEPENDENCY_KEYS = Object.freeze(["createClient", "now"]);
const CLIENT_KEYS = Object.freeze(["connect", "disconnect", "query"]);
const SAFE_CONFIG_KEYS = Object.freeze([
  "auth_type",
  "client_tls_sslmode",
  "ignore_startup_parameters",
  "max_client_conn",
  "max_prepared_statements",
  "pool_mode",
  "server_reset_query_always",
  "server_tls_sslmode",
]);

const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_NAME_PATTERN = /^[a-z_][a-z0-9_.-]{2,127}$/u;
const SAFE_HOST_PATTERN =
  /^(?=.{1,253}$)(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_AUTH_TYPES = new Set(["scram-sha-256", "hba"]);
const ADMIN_DATABASE_NAME = "pgbouncer";
const MAX_URL_BYTES = 4_096;
const MAX_PEM_BYTES = 32_768;
const MAX_ROWS = 4_096;
const MAX_KEYS = 96;
const MAX_TEXT_BYTES = 4_096;
const CONFIG_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_PGBOUNCER_CONFIGURATION_V1";
const RECEIPT_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_PGBOUNCER_RECEIPT_V1";
const VERSION_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_PGBOUNCER_VERSION_V1";
const BACKEND_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_PGBOUNCER_BACKEND_V1";
const USER_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_PGBOUNCER_USER_V1";

const VERIFIED_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function exactOperationalRecord(value, expectedKeys, reasonCode) {
  if (!value || typeof value !== "object" || utilTypes.isProxy(value)) {
    fail(reasonCode, "Operational value must be one exact non-proxy record.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "Operational value must be one exact non-proxy record.");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(descriptors, key)) ||
    keys.some((key) => !expectedKeys.includes(key)) ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode, "Operational value must expose only exact data fields.");
  }
  return Object.freeze(
    Object.fromEntries(
      expectedKeys.map((key) => [key, descriptors[key].value]),
    ),
  );
}

function canonicalIso(value, reasonCode) {
  if (utilTypes.isProxy(value)) fail(reasonCode, "Timestamp is invalid.");
  const date = value instanceof Date ? value : new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    (!(value instanceof Date) &&
      (typeof value !== "string" || date.toISOString() !== value))
  ) {
    fail(reasonCode, "Timestamp is invalid.");
  }
  return date.toISOString();
}

function boundedInteger(value, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(reasonCode, "Integer is outside the bounded collector policy.");
  }
  return value;
}

function normalizeText(value, nullable, reasonCode) {
  if (value === null && nullable) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES
  ) {
    fail(reasonCode, "PgBouncer text evidence is invalid.");
  }
  return value;
}

function normalizeScalar(value, reasonCode) {
  if (value === null) return null;
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES) {
      fail(reasonCode, "PgBouncer scalar evidence is invalid.");
    }
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "boolean") return value;
  fail(reasonCode, "PgBouncer scalar evidence is invalid.");
}

function normalizeRow(value, reasonCode) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    fail(reasonCode, "PgBouncer row must be one non-proxy data record.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "PgBouncer row must be one non-proxy data record.");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length === 0 ||
    keys.length > MAX_KEYS ||
    keys.some((key) => typeof key !== "string") ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode, "PgBouncer row contains an invalid property shape.");
  }
  return Object.freeze(
    Object.fromEntries(
      [...keys]
        .sort()
        .map((key) => [
          key,
          normalizeScalar(descriptors[key].value, reasonCode),
        ]),
    ),
  );
}

function normalizeRows(value, reasonCode) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    value.length > MAX_ROWS
  ) {
    fail(reasonCode, "PgBouncer result must be one bounded array.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "PgBouncer result must be one bounded array.");
  }
  const keys = Array.from({ length: value.length }, (_, index) =>
    String(index),
  );
  const actual = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index]) ||
    keys.some((key) => !Object.hasOwn(descriptors[key] ?? {}, "value"))
  ) {
    fail(reasonCode, "PgBouncer result must be one exact dense array.");
  }
  return Object.freeze(
    keys.map((key) => normalizeRow(descriptors[key].value, reasonCode)),
  );
}

function requireField(row, key, reasonCode, nullable = false) {
  if (!Object.hasOwn(row, key)) {
    fail(reasonCode, `PgBouncer row is missing ${key}.`);
  }
  return normalizeText(row[key], nullable, reasonCode);
}

function normalizeBooleanFlag(value, reasonCode) {
  if ([0, "0", false, "no"].includes(value)) return false;
  if ([1, "1", true, "yes"].includes(value)) return true;
  fail(reasonCode, "PgBouncer boolean flag is invalid.");
}

function normalizePort(value, reasonCode) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    fail(reasonCode, "PgBouncer port is invalid.");
  }
  return port;
}

function normalizeAdminUrl(source, syntheticOnly) {
  const reasonCode = "CURRENT187_PGBOUNCER_ADMIN_URL_DENIED";
  if (
    typeof source.adminUrl !== "string" ||
    Buffer.byteLength(source.adminUrl, "utf8") > MAX_URL_BYTES
  ) {
    fail(reasonCode, "PgBouncer admin URL is invalid.");
  }
  let url;
  try {
    url = new URL(source.adminUrl);
  } catch {
    fail(reasonCode, "PgBouncer admin URL is invalid.");
  }
  let database;
  let user;
  let password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    fail(reasonCode, "PgBouncer admin URL encoding is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash !== "" ||
    database !== ADMIN_DATABASE_NAME ||
    user.length === 0 ||
    password.length === 0 ||
    normalizePort(url.port || "6432", reasonCode) < 1 ||
    url.searchParams.size !== 0 ||
    url.hostname !== source.serverName ||
    (syntheticOnly
      ? !LOOPBACK_HOSTS.has(url.hostname)
      : LOOPBACK_HOSTS.has(url.hostname) ||
        !SAFE_HOST_PATTERN.test(url.hostname))
  ) {
    fail(reasonCode, "PgBouncer admin URL is outside the exact boundary.");
  }
  return Object.freeze({
    database: ADMIN_DATABASE_NAME,
    host: url.hostname,
    password,
    port: Number(url.port || "6432"),
    user,
  });
}

function normalizeInput(value, syntheticOnly) {
  const source = current187AdmissionExactDataRecord(
    value,
    INPUT_KEYS,
    "CURRENT187_PGBOUNCER_INPUT_INVALID",
    "PgBouncer collection requires one exact data-only input.",
  );
  if (
    source.environment !== (syntheticOnly ? "ci" : "production") ||
    source.explicitConfirmation !==
      (syntheticOnly
        ? CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION
        : CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION) ||
    !RELEASE_SHA_PATTERN.test(source.releaseSha) ||
    !SAFE_NAME_PATTERN.test(source.applicationDatabaseName) ||
    !SAFE_NAME_PATTERN.test(source.applicationUserName) ||
    !SAFE_NAME_PATTERN.test(source.expectedBackendDatabaseName) ||
    isIP(source.expectedBackendAddress) === 0 ||
    !SAFE_HOST_PATTERN.test(source.expectedBackendHost) ||
    !SAFE_HOST_PATTERN.test(source.serverName) ||
    ![
      source.caCertificateSha256,
      source.clusterIdentityDigest,
      source.databaseUniverseDigest,
      source.endpointTlsPeerReceiptDigest,
      source.expectedPoolerConfigurationDigest,
      source.hbaReloadReceiptDigest,
      source.verificationChallengeDigest,
    ].every(current187AdmissionValidDigest)
  ) {
    fail(
      "CURRENT187_PGBOUNCER_BINDING_INVALID",
      "PgBouncer binding is invalid.",
    );
  }
  const caCertificatePem = normalizeText(
    source.caCertificatePem,
    syntheticOnly,
    "CURRENT187_PGBOUNCER_BINDING_INVALID",
  );
  if (
    (!syntheticOnly &&
      (Buffer.byteLength(caCertificatePem, "utf8") > MAX_PEM_BYTES ||
        !caCertificatePem.startsWith("-----BEGIN CERTIFICATE-----\n") ||
        createHash("sha256").update(caCertificatePem, "utf8").digest("hex") !==
          source.caCertificateSha256)) ||
    (syntheticOnly && caCertificatePem !== null)
  ) {
    fail(
      "CURRENT187_PGBOUNCER_BINDING_INVALID",
      "PgBouncer CA binding is invalid.",
    );
  }
  return Object.freeze({
    ...source,
    adminConnection: normalizeAdminUrl(source, syntheticOnly),
    connectTimeoutMs: boundedInteger(
      source.connectTimeoutMs,
      CURRENT187_PGBOUNCER_MAX_CONNECT_TIMEOUT_MS,
      "CURRENT187_PGBOUNCER_BINDING_INVALID",
    ),
    expectedBackendPort: normalizePort(
      source.expectedBackendPort,
      "CURRENT187_PGBOUNCER_BINDING_INVALID",
    ),
    queryTimeoutMs: boundedInteger(
      source.queryTimeoutMs,
      CURRENT187_PGBOUNCER_MAX_QUERY_TIMEOUT_MS,
      "CURRENT187_PGBOUNCER_BINDING_INVALID",
    ),
  });
}

function mapBy(rows, key, reasonCode) {
  const map = new Map();
  for (const row of rows) {
    const value = requireField(row, key, reasonCode);
    if (map.has(value))
      fail(reasonCode, "PgBouncer rows contain duplicate identity.");
    map.set(value, row);
  }
  return map;
}

function stableProjection(input, results, syntheticOnly) {
  const reasonCode = "CURRENT187_PGBOUNCER_OBSERVATION_INVALID";
  const versionRows = normalizeRows(results.version, reasonCode);
  const stateRows = normalizeRows(results.state, reasonCode);
  const configRows = normalizeRows(results.config, reasonCode);
  const databaseRows = normalizeRows(results.databases, reasonCode);
  const userRows = normalizeRows(results.users, reasonCode);
  const poolRows = normalizeRows(results.pools, reasonCode);
  const serverRows = normalizeRows(results.servers, reasonCode);
  if (versionRows.length !== 1 || stateRows.length !== 3) {
    fail(reasonCode, "PgBouncer version/state result cardinality is invalid.");
  }
  const version = requireField(versionRows[0], "version", reasonCode);
  const states = mapBy(stateRows, "key", reasonCode);
  const active = states.get("active");
  const paused = states.get("paused");
  const suspended = states.get("suspended");
  if (
    !/^PgBouncer [0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][A-Za-z0-9.-]+)?$/u.test(
      version,
    ) ||
    states.size !== 3 ||
    !active ||
    !paused ||
    !suspended ||
    requireField(active, "value", reasonCode).toLowerCase() !== "yes" ||
    requireField(paused, "value", reasonCode).toLowerCase() !== "no" ||
    requireField(suspended, "value", reasonCode).toLowerCase() !== "no"
  ) {
    fail(reasonCode, "PgBouncer version or state is unsafe.");
  }
  const config = mapBy(configRows, "key", reasonCode);
  const selectedConfig = Object.fromEntries(
    SAFE_CONFIG_KEYS.map((key) => {
      const row = config.get(key);
      if (!row) fail(reasonCode, `PgBouncer config is missing ${key}.`);
      return [key, requireField(row, "value", reasonCode, true)];
    }),
  );
  if (
    selectedConfig.pool_mode !== "transaction" ||
    !SAFE_AUTH_TYPES.has(selectedConfig.auth_type) ||
    selectedConfig.max_prepared_statements !== "0" ||
    selectedConfig.server_reset_query_always !== "0" ||
    !/^[1-9][0-9]{0,6}$/u.test(selectedConfig.max_client_conn) ||
    (!syntheticOnly &&
      (selectedConfig.client_tls_sslmode !== "verify-full" ||
        selectedConfig.server_tls_sslmode !== "verify-full")) ||
    (syntheticOnly &&
      (selectedConfig.client_tls_sslmode !== "disable" ||
        selectedConfig.server_tls_sslmode !== "disable"))
  ) {
    fail(reasonCode, "PgBouncer global configuration is unsafe.");
  }
  const databases = mapBy(databaseRows, "name", reasonCode);
  const database = databases.get(input.applicationDatabaseName);
  if (!database)
    fail(reasonCode, "PgBouncer application database mapping is absent.");
  const databaseProjection = {
    backendDatabase: requireField(database, "database", reasonCode),
    disabled: normalizeBooleanFlag(database.disabled, reasonCode),
    forceUser: requireField(database, "force_user", reasonCode, true),
    host: requireField(database, "host", reasonCode),
    name: requireField(database, "name", reasonCode),
    paused: normalizeBooleanFlag(database.paused, reasonCode),
    poolMode: requireField(database, "pool_mode", reasonCode, true),
    port: normalizePort(database.port, reasonCode),
  };
  if (
    databaseProjection.backendDatabase !== input.expectedBackendDatabaseName ||
    databaseProjection.host !== input.expectedBackendHost ||
    databaseProjection.port !== input.expectedBackendPort ||
    databaseProjection.forceUser !== null ||
    databaseProjection.disabled ||
    databaseProjection.paused ||
    ![null, "transaction"].includes(databaseProjection.poolMode)
  ) {
    fail(reasonCode, "PgBouncer application database mapping is unsafe.");
  }
  const users = mapBy(userRows, "name", reasonCode);
  const user = users.get(input.applicationUserName);
  if (
    !user ||
    ![null, "transaction"].includes(
      requireField(user, "pool_mode", reasonCode, true),
    )
  ) {
    fail(reasonCode, "PgBouncer application user mapping is absent or unsafe.");
  }
  const matchingPools = poolRows.filter(
    (row) =>
      row.database === input.applicationDatabaseName &&
      row.user === input.applicationUserName,
  );
  if (
    matchingPools.length !== 1 ||
    requireField(matchingPools[0], "pool_mode", reasonCode) !== "transaction"
  ) {
    fail(
      reasonCode,
      "PgBouncer runtime pool mode did not match transaction mode.",
    );
  }
  const matchingServers = serverRows.filter(
    (row) =>
      row.database === input.applicationDatabaseName &&
      row.user === input.applicationUserName,
  );
  if (
    matchingServers.length === 0 ||
    matchingServers.some(
      (row) =>
        requireField(row, "addr", reasonCode) !==
          input.expectedBackendAddress ||
        normalizePort(row.port, reasonCode) !== input.expectedBackendPort ||
        normalizeBooleanFlag(row.close_needed, reasonCode) ||
        (!syntheticOnly && requireField(row, "tls", reasonCode).length === 0),
    )
  ) {
    fail(reasonCode, "PgBouncer server mapping is absent, stale, or unsafe.");
  }
  return Object.freeze({
    backend: databaseProjection,
    config: selectedConfig,
    pool: {
      database: input.applicationDatabaseName,
      poolMode: "transaction",
      user: input.applicationUserName,
    },
    serverMapping: {
      address: input.expectedBackendAddress,
      database: input.applicationDatabaseName,
      port: input.expectedBackendPort,
      tlsRequired: !syntheticOnly,
      user: input.applicationUserName,
    },
    state: "active",
    user: {
      name: input.applicationUserName,
      poolMode: requireField(user, "pool_mode", reasonCode, true),
    },
    version,
  });
}

function pgDependencies() {
  return Object.freeze({
    createClient(connection) {
      const client = new pg.Client({
        application_name: "leetplus-current187-pgbouncer-control",
        connectionTimeoutMillis: connection.connectTimeoutMs,
        database: connection.database,
        host: connection.host,
        password: connection.password,
        port: connection.port,
        query_timeout: connection.queryTimeoutMs,
        ssl: connection.ssl,
        user: connection.user,
      });
      return Object.freeze({
        async connect() {
          await client.connect();
        },
        async disconnect() {
          await client.end();
        },
        async query(statement) {
          const result = await client.query({
            queryMode: "simple",
            text: statement,
          });
          return result.rows;
        },
      });
    },
    now() {
      return new Date().toISOString();
    },
  });
}

async function collectInternal(value, dependenciesValue, syntheticOnly) {
  const input = normalizeInput(value, syntheticOnly);
  const dependencies = exactOperationalRecord(
    dependenciesValue,
    DEPENDENCY_KEYS,
    "CURRENT187_PGBOUNCER_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.createClient !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    fail(
      "CURRENT187_PGBOUNCER_DEPENDENCIES_INVALID",
      "Collector dependencies are invalid.",
    );
  }
  const connection = Object.freeze({
    ...input.adminConnection,
    connectTimeoutMs: input.connectTimeoutMs,
    queryTimeoutMs: input.queryTimeoutMs,
    ssl: syntheticOnly
      ? false
      : Object.freeze({
          ca: input.caCertificatePem,
          rejectUnauthorized: true,
          servername: input.serverName,
        }),
  });
  let client;
  let projection;
  let primaryFailed = false;
  let disconnectFailed = false;
  try {
    client = exactOperationalRecord(
      dependencies.createClient(connection),
      CLIENT_KEYS,
      "CURRENT187_PGBOUNCER_CLIENT_INVALID",
    );
    if (
      typeof client.connect !== "function" ||
      typeof client.disconnect !== "function" ||
      typeof client.query !== "function"
    ) {
      fail(
        "CURRENT187_PGBOUNCER_CLIENT_INVALID",
        "Collector client is invalid.",
      );
    }
    await client.connect();
    const results = {};
    for (const [key, statement] of [
      ["version", "SHOW VERSION"],
      ["state", "SHOW STATE"],
      ["config", "SHOW CONFIG"],
      ["databases", "SHOW DATABASES"],
      ["users", "SHOW USERS"],
      ["pools", "SHOW POOLS"],
      ["servers", "SHOW SERVERS"],
    ]) {
      results[key] = await client.query(statement);
    }
    projection = stableProjection(input, results, syntheticOnly);
  } catch {
    primaryFailed = true;
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        disconnectFailed = true;
      }
    }
  }
  if (primaryFailed || disconnectFailed || !projection) {
    fail(
      disconnectFailed
        ? "CURRENT187_PGBOUNCER_DISCONNECT_FAILED"
        : "CURRENT187_PGBOUNCER_COLLECTION_FAILED",
      "PgBouncer control-plane collection failed closed.",
    );
  }
  const poolerConfigurationDigest = digest(CONFIG_DIGEST_DOMAIN, projection);
  if (poolerConfigurationDigest !== input.expectedPoolerConfigurationDigest) {
    fail(
      "CURRENT187_PGBOUNCER_BASELINE_MISMATCH",
      "PgBouncer configuration baseline did not match.",
    );
  }
  const collectedAt = canonicalIso(
    dependencies.now(),
    "CURRENT187_PGBOUNCER_TIME_INVALID",
  );
  const publicReceipt = {
    authorization: false,
    backendMappingDigest: digest(BACKEND_DIGEST_DOMAIN, projection.backend),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: input.clusterIdentityDigest,
    collectedAt,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: input.databaseUniverseDigest,
    endpointTlsPeerReceiptDigest: input.endpointTlsPeerReceiptDigest,
    hbaReloadReceiptDigest: input.hbaReloadReceiptDigest,
    kind: CURRENT187_PGBOUNCER_RECEIPT_KIND,
    negativeProbePerformed: false,
    poolModeObserved: true,
    poolerConfigurationDigest,
    poolerIdentityAttested: false,
    poolerIdentityObserved: true,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    releaseSha: input.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_PGBOUNCER_COLLECTOR_SLICE,
    sourceNetworkIoPerformed: true,
    status: CURRENT187_PGBOUNCER_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
    transactionPoolModeObserved: true,
    userCollapseAbsentAttested: false,
    userCollapseAbsentObserved: true,
    userMappingDigest: digest(USER_DIGEST_DOMAIN, projection.user),
    verificationChallengeDigest: input.verificationChallengeDigest,
    versionDigest: digest(VERSION_DIGEST_DOMAIN, projection.version),
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    pgbouncerReceiptDigest: digest(RECEIPT_DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_RECEIPTS.add(receipt);
  return receipt;
}

export async function collectCurrent187PgBouncerControlPlaneEvidence(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Production collection accepts exactly one input.",
    );
  }
  return collectInternal(input, pgDependencies(), false);
}

export async function collectCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Dependency-backed collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, false);
}

export async function collectSyntheticCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Synthetic collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, true);
}

export async function collectSyntheticCurrent187PgBouncerControlPlaneEvidenceForTestOnly(
  input,
) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Synthetic actual collection accepts exactly one input.",
    );
  }
  return collectInternal(input, pgDependencies(), true);
}

export function computeSyntheticCurrent187PgBouncerConfigurationDigestForTestOnly(
  input,
  results,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Digest helper accepts exact input and results.",
    );
  }
  const normalized = normalizeInput(input, true);
  return digest(
    CONFIG_DIGEST_DOMAIN,
    stableProjection(normalized, results, true),
  );
}

export function computeCurrent187PgBouncerConfigurationDigestForTestOnly(
  input,
  results,
  syntheticOnly,
) {
  if (arguments.length !== 3 || typeof syntheticOnly !== "boolean") {
    fail(
      "CURRENT187_PGBOUNCER_ARGUMENTS_INVALID",
      "Mode-aware digest helper accepts exact input, results, and synthetic flag.",
    );
  }
  const normalized = normalizeInput(input, syntheticOnly);
  return digest(
    CONFIG_DIGEST_DOMAIN,
    stableProjection(normalized, results, syntheticOnly),
  );
}

export function isVerifiedCurrent187PgBouncerReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_RECEIPTS.has(value)
  );
}
