import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

export const CURRENT187_POSTGRES_SESSION_COLLECTOR_SLICE =
  "CURRENT187_J1_POSTGRES_BACKEND_SESSION_COLLECTOR";
export const CURRENT187_POSTGRES_SESSION_COLLECTOR_PROFILE =
  "CURRENT187_POSTGRES_BACKEND_SESSION_OBSERVATION_DENY_ONLY_V1";
export const CURRENT187_POSTGRES_SESSION_RECEIPT_KIND =
  "CURRENT187_POSTGRES_BACKEND_SESSION_OBSERVATION_DENY_ONLY_RECEIPT";
export const CURRENT187_POSTGRES_SESSION_STATUS =
  "BACKEND_SESSION_OBSERVED_DENY_ONLY";
export const CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION =
  "collect-current187-postgres-session-production-observation-deny-only";
export const CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION =
  "collect-current187-postgres-session-loopback-ci-observation-only";
export const CURRENT187_POSTGRES_SESSION_MAX_STATEMENT_TIMEOUT_MS = 10_000;
export const CURRENT187_POSTGRES_SESSION_MAX_TRANSACTION_TIMEOUT_MS = 30_000;

const INPUT_KEYS = Object.freeze([
  "applicationName",
  "clusterIdentityDigest",
  "databaseUniverseDigest",
  "databaseUrl",
  "environment",
  "expectedDatabaseName",
  "expectedDatabaseOid",
  "expectedRoleName",
  "expectedRoleOid",
  "explicitConfirmation",
  "purpose",
  "releaseSha",
  "secretReferenceDigest",
  "statementTimeoutMs",
  "transactionTimeoutMs",
  "verificationChallengeDigest",
]);
const DEPENDENCY_KEYS = Object.freeze(["createClient", "now"]);
const CLIENT_KEYS = Object.freeze(["disconnect", "transaction"]);
const TRANSACTION_KEYS = Object.freeze(["execute", "query"]);
const ROW_KEYS = Object.freeze([
  "applicationName",
  "backendPid",
  "clientAddress",
  "clientPort",
  "currentRoleBypassRls",
  "currentRoleCanLogin",
  "currentRoleConnectionLimit",
  "currentRoleCreateDatabase",
  "currentRoleCreateRole",
  "currentRoleInherit",
  "currentRoleName",
  "currentRoleOid",
  "currentRoleReplication",
  "currentRoleSuperuser",
  "databaseConnect",
  "databaseCreate",
  "databaseName",
  "databaseOid",
  "databaseTemporary",
  "incomingMembershipCount",
  "outgoingMembershipCount",
  "postmasterStartTime",
  "recovery",
  "roleSettingCount",
  "serverAddress",
  "serverPort",
  "serverVersionNum",
  "sessionRoleName",
  "sessionRoleOid",
  "tlsBits",
  "tlsCipher",
  "tlsClientDn",
  "tlsIssuerDn",
  "tlsSerial",
  "tlsVersion",
  "transactionReadOnly",
  "transportTls",
]);
const POSITIVE_ROW_KEYS = Object.freeze([
  "databaseName",
  "sessionRoleName",
  "transactionReadOnly",
  "value",
]);

const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SAFE_APPLICATION_NAME_PATTERN = /^[a-z0-9][a-z0-9_.:-]{7,127}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const POSITIVE_OID_PATTERN = /^[1-9][0-9]{0,9}$/u;
const POSITIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/u;
const PORT_PATTERN = /^[1-9][0-9]{0,4}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYNTHETIC_DATABASE_PATTERN = /(?:^|_)(?:ci|test)$/u;
const TLS_VERSIONS = new Set(["TLSv1.2", "TLSv1.3"]);
const ALLOWED_URL_QUERY_KEYS = new Set([
  "application_name",
  "connect_timeout",
  "connection_limit",
  "pool_timeout",
  "schema",
  "sslaccept",
  "sslcert",
  "sslidentity",
  "sslmode",
]);
const MAX_POSTGRES_OID = 4_294_967_295;
const MAX_DATABASE_URL_BYTES = 8_192;

const BACKEND_IDENTITY_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_POSTGRES_BACKEND_IDENTITY_V1";
const ENDPOINT_OBSERVATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_POSTGRES_ENDPOINT_OBSERVATION_V1";
const TLS_OBSERVATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_POSTGRES_TLS_OBSERVATION_V1";
const ROLE_POLICY_OBSERVATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_POSTGRES_ROLE_POLICY_OBSERVATION_V1";
const POSITIVE_PROBE_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_POSTGRES_POSITIVE_PROBE_V1";
const RECEIPT_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_POSTGRES_SESSION_RECEIPT_V1";

const SESSION_OBSERVATION_SQL = `
SELECT
  pg_catalog.current_database()::TEXT AS "databaseName",
  database_row.oid::TEXT AS "databaseOid",
  session_user::TEXT AS "sessionRoleName",
  session_role.oid::TEXT AS "sessionRoleOid",
  current_user::TEXT AS "currentRoleName",
  current_role_row.oid::TEXT AS "currentRoleOid",
  pg_catalog.current_setting('application_name')::TEXT AS "applicationName",
  pg_catalog.pg_backend_pid()::TEXT AS "backendPid",
  pg_catalog.inet_server_addr()::TEXT AS "serverAddress",
  pg_catalog.inet_server_port()::TEXT AS "serverPort",
  pg_catalog.inet_client_addr()::TEXT AS "clientAddress",
  pg_catalog.inet_client_port()::TEXT AS "clientPort",
  pg_catalog.pg_postmaster_start_time()::TEXT AS "postmasterStartTime",
  pg_catalog.current_setting('server_version_num')::TEXT AS "serverVersionNum",
  pg_catalog.pg_is_in_recovery() AS "recovery",
  pg_catalog.current_setting('transaction_read_only') = 'on' AS "transactionReadOnly",
  COALESCE(transport.ssl, FALSE) AS "transportTls",
  transport.version::TEXT AS "tlsVersion",
  transport.cipher::TEXT AS "tlsCipher",
  transport.bits::TEXT AS "tlsBits",
  transport.client_dn::TEXT AS "tlsClientDn",
  transport.issuer_dn::TEXT AS "tlsIssuerDn",
  transport.serial::TEXT AS "tlsSerial",
  current_role_row.rolcanlogin AS "currentRoleCanLogin",
  current_role_row.rolinherit AS "currentRoleInherit",
  current_role_row.rolsuper AS "currentRoleSuperuser",
  current_role_row.rolcreaterole AS "currentRoleCreateRole",
  current_role_row.rolcreatedb AS "currentRoleCreateDatabase",
  current_role_row.rolreplication AS "currentRoleReplication",
  current_role_row.rolbypassrls AS "currentRoleBypassRls",
  current_role_row.rolconnlimit AS "currentRoleConnectionLimit",
  pg_catalog.has_database_privilege(session_user, database_row.oid, 'CONNECT') AS "databaseConnect",
  pg_catalog.has_database_privilege(session_user, database_row.oid, 'CREATE') AS "databaseCreate",
  pg_catalog.has_database_privilege(session_user, database_row.oid, 'TEMPORARY') AS "databaseTemporary",
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = current_role_row.oid
  ) AS "incomingMembershipCount",
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = current_role_row.oid
  ) AS "outgoingMembershipCount",
  (
    SELECT pg_catalog.count(*)::TEXT
    FROM pg_catalog.pg_db_role_setting AS setting
    WHERE setting.setrole = current_role_row.oid
  ) AS "roleSettingCount"
FROM pg_catalog.pg_database AS database_row
INNER JOIN pg_catalog.pg_roles AS session_role
  ON session_role.rolname = session_user
INNER JOIN pg_catalog.pg_roles AS current_role_row
  ON current_role_row.rolname = current_user
LEFT JOIN pg_catalog.pg_stat_ssl AS transport
  ON transport.pid = pg_catalog.pg_backend_pid()
WHERE database_row.datname = pg_catalog.current_database()
`.trim();

const POSITIVE_PROBE_SQL = `
SELECT
  '1'::TEXT AS "value",
  pg_catalog.current_database()::TEXT AS "databaseName",
  session_user::TEXT AS "sessionRoleName",
  pg_catalog.current_setting('transaction_read_only') = 'on' AS "transactionReadOnly"
`.trim();

const VERIFIED_CURRENT187_POSTGRES_SESSION_RECEIPTS = new WeakSet();

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
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    fail(reasonCode, "Collector dependencies must be an exact local record.");
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "Collector dependencies must be an exact local record.");
  }
  const keys = Reflect.ownKeys(descriptors);
  const wanted = [...expectedKeys].sort();
  if (
    prototype !== Object.prototype ||
    keys.some((key) => typeof key !== "string") ||
    keys.length !== wanted.length ||
    wanted.some((key) => {
      const descriptor = descriptors[key];
      return (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true
      );
    })
  ) {
    fail(reasonCode, "Collector dependencies must be an exact local record.");
  }
  keys.sort();
  if (keys.some((key, index) => key !== wanted[index])) {
    fail(reasonCode, "Collector dependencies must be an exact local record.");
  }
  return Object.freeze(
    Object.fromEntries(wanted.map((key) => [key, descriptors[key].value])),
  );
}

function canonicalIso(value, reasonCode) {
  if (typeof value !== "string") {
    fail(reasonCode, "Collector time must be one canonical UTC timestamp.");
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(reasonCode, "Collector time must be one canonical UTC timestamp.");
  }
  return value;
}

function validOid(value) {
  if (typeof value !== "string" || !POSITIVE_OID_PATTERN.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_POSTGRES_OID;
}

function validPort(value) {
  return (
    typeof value === "string" &&
    PORT_PATTERN.test(value) &&
    Number(value) <= 65_535
  );
}

function validateBoundedInteger(value, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(reasonCode, "Collector timeout is outside the exact bounded range.");
  }
}

function decodeUrlComponent(value, reasonCode) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(reasonCode, "Database URL identity is malformed.");
  }
}

function normalizeDatabaseUrl(source, syntheticOnly) {
  const reasonCode = "CURRENT187_POSTGRES_SESSION_DATABASE_URL_DENIED";
  if (
    typeof source.databaseUrl !== "string" ||
    Buffer.byteLength(source.databaseUrl, "utf8") > MAX_DATABASE_URL_BYTES
  ) {
    fail(reasonCode, "Database URL does not satisfy the collector boundary.");
  }
  let url;
  try {
    url = new URL(source.databaseUrl);
  } catch {
    fail(reasonCode, "Database URL does not satisfy the collector boundary.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash !== "" ||
    url.hostname.length === 0 ||
    !validPort(url.port) ||
    decodeUrlComponent(url.username, reasonCode) !== source.expectedRoleName ||
    decodeUrlComponent(url.password, reasonCode).length === 0 ||
    decodeUrlComponent(url.pathname.slice(1), reasonCode) !==
      source.expectedDatabaseName
  ) {
    fail(reasonCode, "Database URL does not satisfy the collector boundary.");
  }
  const counts = new Map();
  for (const key of url.searchParams.keys()) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (
    [...counts.entries()].some(
      ([key, count]) => !ALLOWED_URL_QUERY_KEYS.has(key) || count !== 1,
    ) ||
    url.searchParams.get("application_name") !== source.applicationName ||
    url.searchParams.get("connection_limit") !== "1"
  ) {
    fail(reasonCode, "Database URL query policy is not exact.");
  }
  if (syntheticOnly) {
    if (
      !LOOPBACK_HOSTS.has(url.hostname) ||
      url.searchParams.get("sslmode") !== "disable" ||
      url.searchParams.has("sslaccept")
    ) {
      fail(
        reasonCode,
        "Synthetic Database URL requires exact loopback plaintext CI transport.",
      );
    }
  } else if (
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.get("sslaccept") !== "strict"
  ) {
    fail(
      reasonCode,
      "Production Database URL requires verify-full strict TLS.",
    );
  }
  return Object.freeze({
    databaseUrl: url.toString(),
    endpointHost: url.hostname,
    endpointPort: url.port,
  });
}

function normalizeInput(value, syntheticOnly) {
  const source = current187AdmissionExactDataRecord(
    value,
    INPUT_KEYS,
    "CURRENT187_POSTGRES_SESSION_INPUT_INVALID",
    "PostgreSQL session collection requires one exact input record.",
  );
  if (
    source.environment !== (syntheticOnly ? "ci" : "production") ||
    source.explicitConfirmation !==
      (syntheticOnly
        ? CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION
        : CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION) ||
    !CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.includes(source.purpose) ||
    !RELEASE_SHA_PATTERN.test(source.releaseSha) ||
    !SAFE_DATABASE_PATTERN.test(source.expectedDatabaseName) ||
    (syntheticOnly &&
      !SYNTHETIC_DATABASE_PATTERN.test(source.expectedDatabaseName)) ||
    !validOid(source.expectedDatabaseOid) ||
    !SAFE_ROLE_PATTERN.test(source.expectedRoleName) ||
    !validOid(source.expectedRoleOid) ||
    !SAFE_APPLICATION_NAME_PATTERN.test(source.applicationName) ||
    ![
      source.clusterIdentityDigest,
      source.databaseUniverseDigest,
      source.secretReferenceDigest,
      source.verificationChallengeDigest,
    ].every(current187AdmissionValidDigest)
  ) {
    fail(
      "CURRENT187_POSTGRES_SESSION_BINDING_INVALID",
      "PostgreSQL session collection binding is invalid.",
    );
  }
  validateBoundedInteger(
    source.statementTimeoutMs,
    CURRENT187_POSTGRES_SESSION_MAX_STATEMENT_TIMEOUT_MS,
    "CURRENT187_POSTGRES_SESSION_BINDING_INVALID",
  );
  validateBoundedInteger(
    source.transactionTimeoutMs,
    CURRENT187_POSTGRES_SESSION_MAX_TRANSACTION_TIMEOUT_MS,
    "CURRENT187_POSTGRES_SESSION_BINDING_INVALID",
  );
  const url = normalizeDatabaseUrl(source, syntheticOnly);
  return Object.freeze({ ...source, ...url });
}

function normalizeNullableString(value, maximum, reasonCode) {
  if (
    value !== null &&
    (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maximum)
  ) {
    fail(reasonCode, "PostgreSQL session evidence contains an invalid string.");
  }
  return value;
}

function normalizeCount(value, reasonCode) {
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    fail(reasonCode, "PostgreSQL session evidence count is invalid.");
  }
  return value;
}

function normalizePositiveIntegerString(value, reasonCode) {
  normalizeCount(value, reasonCode);
  if (value === "0") {
    fail(reasonCode, "PostgreSQL session evidence integer must be positive.");
  }
  return value;
}

function normalizeBoolean(value, reasonCode) {
  if (typeof value !== "boolean") {
    fail(reasonCode, "PostgreSQL session evidence boolean is invalid.");
  }
  return value;
}

function normalizeObservationRow(value, input, syntheticOnly) {
  const reasonCode = "CURRENT187_POSTGRES_SESSION_OBSERVATION_INVALID";
  const row = current187AdmissionExactDataRecord(
    value,
    ROW_KEYS,
    reasonCode,
    "PostgreSQL returned an unexpected session evidence shape.",
  );
  for (const key of [
    "currentRoleBypassRls",
    "currentRoleCanLogin",
    "currentRoleCreateDatabase",
    "currentRoleCreateRole",
    "currentRoleInherit",
    "currentRoleReplication",
    "currentRoleSuperuser",
    "databaseConnect",
    "databaseCreate",
    "databaseTemporary",
    "recovery",
    "transactionReadOnly",
    "transportTls",
  ]) {
    normalizeBoolean(row[key], reasonCode);
  }
  for (const key of [
    "incomingMembershipCount",
    "outgoingMembershipCount",
    "roleSettingCount",
  ]) {
    normalizeCount(row[key], reasonCode);
  }
  for (const key of ["backendPid", "serverVersionNum"]) {
    normalizePositiveIntegerString(row[key], reasonCode);
  }
  if (
    row.databaseName !== input.expectedDatabaseName ||
    row.databaseOid !== input.expectedDatabaseOid ||
    row.sessionRoleName !== input.expectedRoleName ||
    row.sessionRoleOid !== input.expectedRoleOid ||
    row.currentRoleName !== input.expectedRoleName ||
    row.currentRoleOid !== input.expectedRoleOid ||
    row.applicationName !== input.applicationName ||
    row.databaseConnect !== true ||
    row.transactionReadOnly !== true ||
    typeof row.serverAddress !== "string" ||
    row.serverAddress.length === 0 ||
    !validPort(row.serverPort) ||
    typeof row.clientAddress !== "string" ||
    row.clientAddress.length === 0 ||
    !validPort(row.clientPort) ||
    !validOid(row.databaseOid) ||
    !validOid(row.sessionRoleOid) ||
    !validOid(row.currentRoleOid) ||
    !Number.isSafeInteger(row.currentRoleConnectionLimit) ||
    typeof row.postmasterStartTime !== "string" ||
    !Number.isFinite(Date.parse(row.postmasterStartTime))
  ) {
    fail(
      reasonCode,
      "PostgreSQL session identity does not match the exact expected binding.",
    );
  }
  for (const key of [
    "tlsCipher",
    "tlsClientDn",
    "tlsIssuerDn",
    "tlsSerial",
    "tlsVersion",
  ]) {
    normalizeNullableString(row[key], 4_096, reasonCode);
  }
  normalizeNullableString(row.tlsBits, 32, reasonCode);
  if (syntheticOnly) {
    if (
      row.transportTls !== false ||
      [
        row.tlsBits,
        row.tlsCipher,
        row.tlsClientDn,
        row.tlsIssuerDn,
        row.tlsSerial,
        row.tlsVersion,
      ].some((entry) => entry !== null)
    ) {
      fail(
        reasonCode,
        "Synthetic plaintext evidence is internally inconsistent.",
      );
    }
  } else if (
    row.transportTls !== true ||
    !TLS_VERSIONS.has(row.tlsVersion) ||
    typeof row.tlsCipher !== "string" ||
    row.tlsCipher.length === 0 ||
    typeof row.tlsBits !== "string" ||
    !POSITIVE_INTEGER_PATTERN.test(row.tlsBits) ||
    Number(row.tlsBits) < 128
  ) {
    fail(reasonCode, "Production PostgreSQL transport TLS evidence is unsafe.");
  }
  return Object.freeze({ ...row });
}

function normalizePositiveProbe(value, input) {
  const reasonCode = "CURRENT187_POSTGRES_SESSION_POSITIVE_PROBE_INVALID";
  const row = current187AdmissionExactDataRecord(
    value,
    POSITIVE_ROW_KEYS,
    reasonCode,
    "PostgreSQL returned an unexpected positive probe shape.",
  );
  if (
    row.value !== "1" ||
    row.databaseName !== input.expectedDatabaseName ||
    row.sessionRoleName !== input.expectedRoleName ||
    row.transactionReadOnly !== true
  ) {
    fail(reasonCode, "The PostgreSQL positive read-only probe did not match.");
  }
  return Object.freeze({ ...row });
}

function exactSingleRow(value, reasonCode) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(reasonCode, "PostgreSQL collector expected exactly one row.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "PostgreSQL collector expected exactly one row.");
  }
  if (
    descriptors.length?.value !== 1 ||
    Reflect.ownKeys(descriptors).length !== 2 ||
    !Object.hasOwn(descriptors["0"] ?? {}, "value") ||
    descriptors["0"].enumerable !== true
  ) {
    fail(reasonCode, "PostgreSQL collector expected exactly one row.");
  }
  return descriptors["0"].value;
}

async function querySessionEvidence(transaction, input, syntheticOnly) {
  await transaction.execute("SET TRANSACTION READ ONLY");
  await transaction.query(
    "SELECT pg_catalog.set_config('statement_timeout', $1, TRUE)",
    [`${input.statementTimeoutMs}ms`],
  );
  await transaction.query(
    "SELECT pg_catalog.set_config('lock_timeout', $1, TRUE)",
    [`${Math.min(input.statementTimeoutMs, 5_000)}ms`],
  );
  await transaction.query(
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, TRUE)",
    [`${input.transactionTimeoutMs}ms`],
  );
  const observationRows = await transaction.query(SESSION_OBSERVATION_SQL, []);
  const positiveRows = await transaction.query(POSITIVE_PROBE_SQL, []);
  return Object.freeze({
    observation: normalizeObservationRow(
      exactSingleRow(
        observationRows,
        "CURRENT187_POSTGRES_SESSION_OBSERVATION_INVALID",
      ),
      input,
      syntheticOnly,
    ),
    positiveProbe: normalizePositiveProbe(
      exactSingleRow(
        positiveRows,
        "CURRENT187_POSTGRES_SESSION_POSITIVE_PROBE_INVALID",
      ),
      input,
    ),
  });
}

function prismaDependencies() {
  return Object.freeze({
    createClient(databaseUrl) {
      const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
      return Object.freeze({
        async disconnect() {
          await prisma.$disconnect();
        },
        async transaction(callback, options) {
          return prisma.$transaction(
            async (transaction) =>
              callback(
                Object.freeze({
                  async execute(statement) {
                    return transaction.$executeRawUnsafe(statement);
                  },
                  async query(statement, parameters) {
                    return transaction.$queryRawUnsafe(
                      statement,
                      ...parameters,
                    );
                  },
                }),
              ),
            options,
          );
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
    "CURRENT187_POSTGRES_SESSION_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.createClient !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    fail(
      "CURRENT187_POSTGRES_SESSION_DEPENDENCIES_INVALID",
      "Collector dependencies must expose exact functions.",
    );
  }

  let client;
  let evidence;
  let collectedAt;
  let primaryFailed = false;
  let disconnectFailed = false;
  try {
    client = exactOperationalRecord(
      dependencies.createClient(input.databaseUrl),
      CLIENT_KEYS,
      "CURRENT187_POSTGRES_SESSION_CLIENT_INVALID",
    );
    if (
      typeof client.disconnect !== "function" ||
      typeof client.transaction !== "function"
    ) {
      fail(
        "CURRENT187_POSTGRES_SESSION_CLIENT_INVALID",
        "Collector client must expose exact functions.",
      );
    }
    evidence = await client.transaction(
      async (transactionValue) => {
        const transaction = exactOperationalRecord(
          transactionValue,
          TRANSACTION_KEYS,
          "CURRENT187_POSTGRES_SESSION_TRANSACTION_INVALID",
        );
        if (
          typeof transaction.execute !== "function" ||
          typeof transaction.query !== "function"
        ) {
          fail(
            "CURRENT187_POSTGRES_SESSION_TRANSACTION_INVALID",
            "Collector transaction must expose exact functions.",
          );
        }
        return querySessionEvidence(transaction, input, syntheticOnly);
      },
      Object.freeze({
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: input.transactionTimeoutMs,
      }),
    );
    collectedAt = canonicalIso(
      dependencies.now(),
      "CURRENT187_POSTGRES_SESSION_TIME_INVALID",
    );
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
  if (primaryFailed || disconnectFailed || !evidence || !collectedAt) {
    fail(
      disconnectFailed
        ? "CURRENT187_POSTGRES_SESSION_DISCONNECT_FAILED"
        : "CURRENT187_POSTGRES_SESSION_COLLECTION_FAILED",
      "PostgreSQL session evidence collection failed closed.",
    );
  }

  const observation = evidence.observation;
  const backendIdentityProjection = {
    applicationName: observation.applicationName,
    backendPid: observation.backendPid,
    databaseName: observation.databaseName,
    databaseOid: observation.databaseOid,
    postmasterStartTime: observation.postmasterStartTime,
    recovery: observation.recovery,
    serverVersionNum: observation.serverVersionNum,
    sessionRoleName: observation.sessionRoleName,
    sessionRoleOid: observation.sessionRoleOid,
  };
  const endpointProjection = {
    clientAddress: observation.clientAddress,
    clientPort: observation.clientPort,
    configuredEndpointHost: input.endpointHost,
    configuredEndpointPort: input.endpointPort,
    serverAddress: observation.serverAddress,
    serverPort: observation.serverPort,
  };
  const tlsProjection = {
    tlsBits: observation.tlsBits,
    tlsCipher: observation.tlsCipher,
    tlsClientDn: observation.tlsClientDn,
    tlsIssuerDn: observation.tlsIssuerDn,
    tlsSerial: observation.tlsSerial,
    tlsVersion: observation.tlsVersion,
    transportTls: observation.transportTls,
  };
  const rolePolicyProjection = {
    currentRoleBypassRls: observation.currentRoleBypassRls,
    currentRoleCanLogin: observation.currentRoleCanLogin,
    currentRoleConnectionLimit: observation.currentRoleConnectionLimit,
    currentRoleCreateDatabase: observation.currentRoleCreateDatabase,
    currentRoleCreateRole: observation.currentRoleCreateRole,
    currentRoleInherit: observation.currentRoleInherit,
    currentRoleReplication: observation.currentRoleReplication,
    currentRoleSuperuser: observation.currentRoleSuperuser,
    databaseConnect: observation.databaseConnect,
    databaseCreate: observation.databaseCreate,
    databaseTemporary: observation.databaseTemporary,
    incomingMembershipCount: observation.incomingMembershipCount,
    outgoingMembershipCount: observation.outgoingMembershipCount,
    roleSettingCount: observation.roleSettingCount,
    transactionReadOnly: observation.transactionReadOnly,
  };
  const publicReceipt = {
    applicationNameDigest: digest(BACKEND_IDENTITY_DIGEST_DOMAIN, {
      applicationName: input.applicationName,
    }),
    authorization: false,
    backendIdentityDigest: digest(
      BACKEND_IDENTITY_DIGEST_DOMAIN,
      backendIdentityProjection,
    ),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: input.clusterIdentityDigest,
    collectedAt,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseIdentityMatched: true,
    databaseUniverseDigest: input.databaseUniverseDigest,
    endpointIdentityAttested: false,
    endpointObservationDigest: digest(
      ENDPOINT_OBSERVATION_DIGEST_DOMAIN,
      endpointProjection,
    ),
    hbaRuleMatched: false,
    hostControlEvidenceMatched: false,
    kind: CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
    negativeProbePerformed: false,
    policyAllowlistEvaluated: false,
    poolerIdentityObserved: false,
    positiveProbeDigest: digest(
      POSITIVE_PROBE_DIGEST_DOMAIN,
      evidence.positiveProbe,
    ),
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    purpose: input.purpose,
    releaseSha: input.releaseSha,
    rolePolicyObservationDigest: digest(
      ROLE_POLICY_OBSERVATION_DIGEST_DOMAIN,
      rolePolicyProjection,
    ),
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    secretReferenceDigest: input.secretReferenceDigest,
    sessionIdentityMatched: true,
    sharedBetaAccess: false,
    slice: CURRENT187_POSTGRES_SESSION_COLLECTOR_SLICE,
    sourceDatabaseIoPerformed: true,
    status: CURRENT187_POSTGRES_SESSION_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
    tlsObservationDigest: digest(TLS_OBSERVATION_DIGEST_DOMAIN, tlsProjection),
    transactionReadOnlyObserved: true,
    transportTlsObserved: observation.transportTls,
    verificationChallengeDigest: input.verificationChallengeDigest,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    postgresSessionReceiptDigest: digest(RECEIPT_DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_CURRENT187_POSTGRES_SESSION_RECEIPTS.add(receipt);
  return receipt;
}

export async function collectCurrent187PostgresSessionEvidence(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_POSTGRES_SESSION_ARGUMENTS_INVALID",
      "Production PostgreSQL session collection accepts exactly one input.",
    );
  }
  return collectInternal(input, prismaDependencies(), false);
}

export async function collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_POSTGRES_SESSION_ARGUMENTS_INVALID",
      "Production-mode dependency-backed collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, false);
}

export async function collectSyntheticCurrent187PostgresSessionEvidenceWithPrismaForTestOnly(
  input,
) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_POSTGRES_SESSION_ARGUMENTS_INVALID",
      "Synthetic PostgreSQL session collection accepts exactly one input.",
    );
  }
  return collectInternal(input, prismaDependencies(), true);
}

export async function collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_POSTGRES_SESSION_ARGUMENTS_INVALID",
      "Synthetic dependency-backed collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, true);
}

export function isVerifiedCurrent187PostgresSessionReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_CURRENT187_POSTGRES_SESSION_RECEIPTS.has(value)
  );
}

export const CURRENT187_POSTGRES_SESSION_OBSERVATION_SQL_FOR_TEST_ONLY =
  SESSION_OBSERVATION_SQL;
