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

export const CURRENT187_HBA_RELOAD_COLLECTOR_SLICE =
  "CURRENT187_J3_HBA_RELOAD_CONTROL_PLANE_COLLECTOR";
export const CURRENT187_HBA_RELOAD_COLLECTOR_PROFILE =
  "CURRENT187_POSTGRES_HBA_RELOAD_OBSERVATION_DENY_ONLY_V1";
export const CURRENT187_HBA_RELOAD_RECEIPT_KIND =
  "CURRENT187_POSTGRES_HBA_RELOAD_OBSERVATION_DENY_ONLY_RECEIPT";
export const CURRENT187_HBA_RELOAD_STATUS =
  "HBA_FILE_AND_RELOAD_CLOCK_OBSERVED_DENY_ONLY";
export const CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION =
  "collect-current187-hba-reload-production-observation-deny-only";
export const CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION =
  "collect-current187-hba-reload-loopback-ci-observation-only";
export const CURRENT187_HBA_RELOAD_MAX_STATEMENT_TIMEOUT_MS = 10_000;
export const CURRENT187_HBA_RELOAD_MAX_TRANSACTION_TIMEOUT_MS = 30_000;
export const CURRENT187_HBA_RELOAD_MAX_RULES = 2_048;

const INPUT_KEYS = Object.freeze([
  "applicationName",
  "clusterIdentityDigest",
  "databaseUrl",
  "databaseUniverseDigest",
  "environment",
  "expectedControlDatabaseName",
  "expectedControlDatabaseOid",
  "expectedControlRoleName",
  "expectedControlRoleOid",
  "expectedHbaCatalogDigest",
  "explicitConfirmation",
  "releaseSha",
  "reloadChallengeDigest",
  "reloadNotBefore",
  "statementTimeoutMs",
  "transactionTimeoutMs",
]);
const DEPENDENCY_KEYS = Object.freeze(["createClient", "now"]);
const CLIENT_KEYS = Object.freeze(["disconnect", "transaction"]);
const TRANSACTION_KEYS = Object.freeze(["execute", "query"]);
const CONTROL_ROW_KEYS = Object.freeze([
  "applicationName",
  "configurationLoadTime",
  "controlDatabaseName",
  "controlDatabaseOid",
  "controlRoleName",
  "controlRoleOid",
  "postmasterStartTime",
  "transactionReadOnly",
]);
const HBA_ROW_KEYS = Object.freeze([
  "address",
  "authMethod",
  "databases",
  "error",
  "fileName",
  "lineNumber",
  "netmask",
  "options",
  "ruleNumber",
  "type",
  "users",
]);

const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SAFE_APPLICATION_NAME_PATTERN = /^[a-z0-9][a-z0-9_.:-]{7,127}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const POSITIVE_OID_PATTERN = /^[1-9][0-9]{0,9}$/u;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]{0,9}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SYNTHETIC_DATABASE_PATTERN = /(?:^|_)(?:ci|test)$/u;
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
const SAFE_LOCAL_AUTH_METHODS = new Set(["peer", "scram-sha-256", "reject"]);
const SAFE_HOSTSSL_AUTH_METHODS = new Set(["cert", "scram-sha-256", "reject"]);
const REMOTE_WILDCARDS = new Set([
  "0.0.0.0/0",
  "0.0.0.0",
  "::/0",
  "::0/0",
  "all",
  "samehost",
  "samenet",
]);
const MAX_DATABASE_URL_BYTES = 4_096;
const MAX_TEXT_BYTES = 1_024;
const MAX_ARRAY_LENGTH = 128;
const MAX_POSTGRES_OID = 4_294_967_295;
const HBA_CATALOG_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_HBA_CATALOG_V1";
const RELOAD_EPOCH_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_HBA_RELOAD_EPOCH_V1";
const RECEIPT_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_HBA_RELOAD_RECEIPT_V1";
const FILE_NAME_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_HBA_FILE_NAME_V1";

const VERIFIED_RECEIPTS = new WeakSet();
const VERIFIED_PRODUCTION_RECEIPTS = new WeakSet();

const CONTROL_SQL = `
SELECT
  current_database()::text AS "controlDatabaseName",
  (SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()) AS "controlDatabaseOid",
  session_user::text AS "controlRoleName",
  (SELECT oid::text FROM pg_catalog.pg_roles WHERE rolname = session_user) AS "controlRoleOid",
  current_setting('application_name', true)::text AS "applicationName",
  current_setting('transaction_read_only')::boolean AS "transactionReadOnly",
  pg_catalog.pg_postmaster_start_time() AS "postmasterStartTime",
  pg_catalog.pg_conf_load_time() AS "configurationLoadTime"
`;

const HBA_SQL = `
SELECT
  rule_number::text AS "ruleNumber",
  file_name::text AS "fileName",
  line_number::text AS "lineNumber",
  type::text AS "type",
  database::text[] AS "databases",
  user_name::text[] AS "users",
  address::text AS "address",
  netmask::text AS "netmask",
  auth_method::text AS "authMethod",
  options::text[] AS "options",
  error::text AS "error"
FROM pg_catalog.pg_hba_file_rules
ORDER BY rule_number
`;

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
  if (utilTypes.isProxy(value)) {
    fail(reasonCode, "Timestamp is invalid.");
  }
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

function normalizeText(value, nullable, reasonCode) {
  if (value === null && nullable) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES
  ) {
    fail(reasonCode, "HBA text evidence is invalid.");
  }
  return value;
}

function exactDenseArray(value, reasonCode) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    value.length > MAX_ARRAY_LENGTH
  ) {
    fail(reasonCode, "HBA array evidence is invalid.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "HBA array evidence is invalid.");
  }
  const expected = [...Array(value.length).keys()].map(String);
  const actual = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index]) ||
    descriptors.length?.value !== value.length ||
    expected.some(
      (key) =>
        !Object.hasOwn(descriptors[key] ?? {}, "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode, "HBA array evidence is invalid.");
  }
  return expected.map((key) => descriptors[key].value);
}

function normalizeTextArray(value, allowEmpty, reasonCode) {
  const rows = exactDenseArray(value, reasonCode).map((entry) =>
    normalizeText(entry, false, reasonCode),
  );
  if (
    (!allowEmpty && rows.length === 0) ||
    new Set(rows).size !== rows.length
  ) {
    fail(reasonCode, "HBA array evidence is empty or duplicated.");
  }
  return Object.freeze(rows);
}

function normalizePositiveInteger(value, reasonCode) {
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    fail(reasonCode, "HBA numeric evidence is invalid.");
  }
  return Number(value);
}

function normalizeRule(value) {
  const reasonCode = "CURRENT187_HBA_RELOAD_RULE_INVALID";
  const row = current187AdmissionExactDataRecord(
    value,
    HBA_ROW_KEYS,
    reasonCode,
    "Each HBA row must be one exact data-only record.",
  );
  const ruleNumber = normalizePositiveInteger(row.ruleNumber, reasonCode);
  const lineNumber = normalizePositiveInteger(row.lineNumber, reasonCode);
  const fileName = normalizeText(row.fileName, false, reasonCode);
  const databases = normalizeTextArray(row.databases, false, reasonCode);
  const users = normalizeTextArray(row.users, false, reasonCode);
  const options = normalizeTextArray(row.options ?? [], true, reasonCode);
  const address = normalizeText(row.address, true, reasonCode);
  const netmask = normalizeText(row.netmask, true, reasonCode);
  const error = normalizeText(row.error, true, reasonCode);
  const authMethod = normalizeText(row.authMethod, false, reasonCode);
  const type = normalizeText(row.type, false, reasonCode);
  if (
    error !== null ||
    authMethod === "trust" ||
    type === "hostnossl" ||
    type === "host"
  ) {
    fail(
      "CURRENT187_HBA_RELOAD_POLICY_DENIED",
      "Unsafe or invalid HBA rule was observed.",
    );
  }
  if (type === "local") {
    if (
      address !== null ||
      netmask !== null ||
      !SAFE_LOCAL_AUTH_METHODS.has(authMethod)
    ) {
      fail(
        "CURRENT187_HBA_RELOAD_POLICY_DENIED",
        "Unsafe local HBA rule was observed.",
      );
    }
  } else if (type === "hostssl") {
    if (
      address === null ||
      REMOTE_WILDCARDS.has(address.toLowerCase()) ||
      !SAFE_HOSTSSL_AUTH_METHODS.has(authMethod) ||
      users.some(
        (user) =>
          user === "all" || user.startsWith("+") || user.startsWith("/"),
      ) ||
      databases.some((database) =>
        ["all", "replication", "samegroup", "samerole", "sameuser"].includes(
          database,
        ),
      ) ||
      databases.some((database) => database.startsWith("/")) ||
      options.some((option) => option.startsWith("map="))
    ) {
      fail(
        "CURRENT187_HBA_RELOAD_POLICY_DENIED",
        "Unsafe hostssl HBA rule was observed.",
      );
    }
  } else {
    fail(
      "CURRENT187_HBA_RELOAD_POLICY_DENIED",
      "Unsupported HBA rule type was observed.",
    );
  }
  return Object.freeze({
    address,
    authMethod,
    databases,
    error,
    fileNameDigest: digest(FILE_NAME_DIGEST_DOMAIN, fileName),
    lineNumber,
    netmask,
    options,
    ruleNumber,
    type,
    users,
  });
}

function normalizeRules(value) {
  const reasonCode = "CURRENT187_HBA_RELOAD_RULES_INVALID";
  const values = exactDenseArray(value, reasonCode);
  if (values.length === 0 || values.length > CURRENT187_HBA_RELOAD_MAX_RULES) {
    fail(reasonCode, "HBA catalog must contain a bounded non-empty rule set.");
  }
  const rules = values.map(normalizeRule);
  const sourceLocations = new Set();
  for (let index = 0; index < rules.length; index += 1) {
    const sourceLocation = `${rules[index].fileNameDigest}:${rules[index].lineNumber}`;
    if (
      rules[index].ruleNumber !== index + 1 ||
      sourceLocations.has(sourceLocation)
    ) {
      fail(reasonCode, "HBA rules must retain exact catalog order.");
    }
    sourceLocations.add(sourceLocation);
  }
  return Object.freeze(rules);
}

function validOid(value) {
  return (
    typeof value === "string" &&
    POSITIVE_OID_PATTERN.test(value) &&
    Number(value) <= MAX_POSTGRES_OID
  );
}

function boundedInteger(value, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(reasonCode, "Timeout is outside the bounded collector policy.");
  }
}

function decodeUrlComponent(value, reasonCode) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(reasonCode, "Database URL encoding is invalid.");
  }
}

function validPort(value) {
  const port = Number(value || "5432");
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

function normalizeDatabaseUrl(source, syntheticOnly) {
  const reasonCode = "CURRENT187_HBA_RELOAD_DATABASE_URL_DENIED";
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
    decodeUrlComponent(url.username, reasonCode) !==
      source.expectedControlRoleName ||
    decodeUrlComponent(url.password, reasonCode).length === 0 ||
    decodeUrlComponent(url.pathname.slice(1), reasonCode) !==
      source.expectedControlDatabaseName
  ) {
    fail(reasonCode, "Database URL does not satisfy the collector boundary.");
  }
  const counts = new Map();
  for (const key of url.searchParams.keys())
    counts.set(key, (counts.get(key) ?? 0) + 1);
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
        "Synthetic collection requires loopback plaintext CI transport.",
      );
    }
  } else if (
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.get("sslaccept") !== "strict"
  ) {
    fail(reasonCode, "Production collection requires verify-full strict TLS.");
  }
  return url.toString();
}

function normalizeInput(value, syntheticOnly) {
  const source = current187AdmissionExactDataRecord(
    value,
    INPUT_KEYS,
    "CURRENT187_HBA_RELOAD_INPUT_INVALID",
    "HBA/reload collection requires one exact input record.",
  );
  if (
    source.environment !== (syntheticOnly ? "ci" : "production") ||
    source.explicitConfirmation !==
      (syntheticOnly
        ? CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION
        : CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION) ||
    !RELEASE_SHA_PATTERN.test(source.releaseSha) ||
    !SAFE_DATABASE_PATTERN.test(source.expectedControlDatabaseName) ||
    (syntheticOnly &&
      !SYNTHETIC_DATABASE_PATTERN.test(source.expectedControlDatabaseName)) ||
    !validOid(source.expectedControlDatabaseOid) ||
    !SAFE_ROLE_PATTERN.test(source.expectedControlRoleName) ||
    !validOid(source.expectedControlRoleOid) ||
    !SAFE_APPLICATION_NAME_PATTERN.test(source.applicationName) ||
    ![
      source.clusterIdentityDigest,
      source.databaseUniverseDigest,
      source.expectedHbaCatalogDigest,
      source.reloadChallengeDigest,
    ].every(current187AdmissionValidDigest)
  ) {
    fail(
      "CURRENT187_HBA_RELOAD_BINDING_INVALID",
      "HBA/reload binding is invalid.",
    );
  }
  boundedInteger(
    source.statementTimeoutMs,
    CURRENT187_HBA_RELOAD_MAX_STATEMENT_TIMEOUT_MS,
    "CURRENT187_HBA_RELOAD_BINDING_INVALID",
  );
  boundedInteger(
    source.transactionTimeoutMs,
    CURRENT187_HBA_RELOAD_MAX_TRANSACTION_TIMEOUT_MS,
    "CURRENT187_HBA_RELOAD_BINDING_INVALID",
  );
  const reloadNotBefore = canonicalIso(
    source.reloadNotBefore,
    "CURRENT187_HBA_RELOAD_BINDING_INVALID",
  );
  return Object.freeze({
    ...source,
    databaseUrl: normalizeDatabaseUrl(source, syntheticOnly),
    reloadNotBefore,
  });
}

function exactRows(value, reasonCode) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(reasonCode, "Collector query result must be an exact array.");
  }
  return exactDenseArray(value, reasonCode);
}

function exactSingleRow(value, reasonCode) {
  const rows = exactRows(value, reasonCode);
  if (rows.length !== 1)
    fail(reasonCode, "Collector expected exactly one row.");
  return rows[0];
}

function normalizeControlRow(value, input, collectedAt) {
  const reasonCode = "CURRENT187_HBA_RELOAD_CONTROL_ROW_INVALID";
  const row = current187AdmissionExactDataRecord(
    value,
    CONTROL_ROW_KEYS,
    reasonCode,
    "HBA control row must be one exact data-only record.",
  );
  const configurationLoadTime = canonicalIso(
    row.configurationLoadTime,
    reasonCode,
  );
  const postmasterStartTime = canonicalIso(row.postmasterStartTime, reasonCode);
  if (
    row.applicationName !== input.applicationName ||
    row.controlDatabaseName !== input.expectedControlDatabaseName ||
    row.controlDatabaseOid !== input.expectedControlDatabaseOid ||
    row.controlRoleName !== input.expectedControlRoleName ||
    row.controlRoleOid !== input.expectedControlRoleOid ||
    row.transactionReadOnly !== true ||
    configurationLoadTime < input.reloadNotBefore ||
    configurationLoadTime < postmasterStartTime ||
    configurationLoadTime > collectedAt
  ) {
    fail(reasonCode, "HBA control identity or reload freshness did not match.");
  }
  return Object.freeze({ configurationLoadTime, postmasterStartTime });
}

async function queryEvidence(transaction, input, collectedAt) {
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
  const control = normalizeControlRow(
    exactSingleRow(
      await transaction.query(CONTROL_SQL, []),
      "CURRENT187_HBA_RELOAD_CONTROL_ROW_INVALID",
    ),
    input,
    collectedAt,
  );
  const rules = normalizeRules(await transaction.query(HBA_SQL, []));
  return Object.freeze({ control, rules });
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

async function collectInternal(
  value,
  dependenciesValue,
  syntheticOnly,
  productionOrigin,
) {
  const input = normalizeInput(value, syntheticOnly);
  const dependencies = exactOperationalRecord(
    dependenciesValue,
    DEPENDENCY_KEYS,
    "CURRENT187_HBA_RELOAD_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.createClient !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    fail(
      "CURRENT187_HBA_RELOAD_DEPENDENCIES_INVALID",
      "Collector dependencies are invalid.",
    );
  }
  const collectedAt = canonicalIso(
    dependencies.now(),
    "CURRENT187_HBA_RELOAD_TIME_INVALID",
  );
  let client;
  let evidence;
  let primaryFailed = false;
  let disconnectFailed = false;
  try {
    client = exactOperationalRecord(
      dependencies.createClient(input.databaseUrl),
      CLIENT_KEYS,
      "CURRENT187_HBA_RELOAD_CLIENT_INVALID",
    );
    if (
      typeof client.disconnect !== "function" ||
      typeof client.transaction !== "function"
    ) {
      fail(
        "CURRENT187_HBA_RELOAD_CLIENT_INVALID",
        "Collector client is invalid.",
      );
    }
    evidence = await client.transaction(
      (transactionValue) => {
        const transaction = exactOperationalRecord(
          transactionValue,
          TRANSACTION_KEYS,
          "CURRENT187_HBA_RELOAD_TRANSACTION_INVALID",
        );
        if (
          typeof transaction.execute !== "function" ||
          typeof transaction.query !== "function"
        ) {
          fail(
            "CURRENT187_HBA_RELOAD_TRANSACTION_INVALID",
            "Collector transaction is invalid.",
          );
        }
        return queryEvidence(transaction, input, collectedAt);
      },
      Object.freeze({
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: input.transactionTimeoutMs,
      }),
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
  if (primaryFailed || disconnectFailed || !evidence) {
    fail(
      disconnectFailed
        ? "CURRENT187_HBA_RELOAD_DISCONNECT_FAILED"
        : "CURRENT187_HBA_RELOAD_COLLECTION_FAILED",
      "HBA/reload evidence collection failed closed.",
    );
  }
  const hbaCatalogDigest = digest(HBA_CATALOG_DIGEST_DOMAIN, evidence.rules);
  if (hbaCatalogDigest !== input.expectedHbaCatalogDigest) {
    fail(
      "CURRENT187_HBA_RELOAD_BASELINE_MISMATCH",
      "Observed HBA catalog did not match the expected digest.",
    );
  }
  const reloadEpochDigest = digest(RELOAD_EPOCH_DIGEST_DOMAIN, {
    configurationLoadTime: evidence.control.configurationLoadTime,
    hbaCatalogDigest,
    postmasterStartTime: evidence.control.postmasterStartTime,
    reloadChallengeDigest: input.reloadChallengeDigest,
  });
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: input.clusterIdentityDigest,
    collectedAt,
    configurationLoadTime: evidence.control.configurationLoadTime,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: input.databaseUniverseDigest,
    hbaBaselineDigestMatched: true,
    hbaCatalogDigest,
    hbaCatalogEffectiveAttested: false,
    hbaCatalogLoadedAttested: false,
    hbaCurrentFilePolicySafeObserved: true,
    hbaRuleMatched: false,
    hbaRulesObserved: true,
    kind: CURRENT187_HBA_RELOAD_RECEIPT_KIND,
    negativeProbePerformed: false,
    postmasterStartTime: evidence.control.postmasterStartTime,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    releaseSha: input.releaseSha,
    reloadChallengeDigest: input.reloadChallengeDigest,
    reloadEpochAttested: false,
    reloadEpochDigest,
    reloadClockFreshnessObserved: true,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    sharedBetaAccess: false,
    slice: CURRENT187_HBA_RELOAD_COLLECTOR_SLICE,
    sourceDatabaseIoPerformed: true,
    status: CURRENT187_HBA_RELOAD_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
    trustAuthenticationAbsentObserved: true,
    wildcardRemoteRulesAbsentObserved: true,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    hbaReloadReceiptDigest: digest(RECEIPT_DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_RECEIPTS.add(receipt);
  if (productionOrigin) VERIFIED_PRODUCTION_RECEIPTS.add(receipt);
  return receipt;
}

export async function collectCurrent187HbaReloadEvidence(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_HBA_RELOAD_ARGUMENTS_INVALID",
      "Production collection accepts exactly one input.",
    );
  }
  return collectInternal(input, prismaDependencies(), false, true);
}

export async function collectCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_HBA_RELOAD_ARGUMENTS_INVALID",
      "Dependency-backed collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, false, false);
}

export async function collectSyntheticCurrent187HbaReloadEvidenceWithPrismaForTestOnly(
  input,
) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_HBA_RELOAD_ARGUMENTS_INVALID",
      "Synthetic collection accepts exactly one input.",
    );
  }
  return collectInternal(input, prismaDependencies(), true, false);
}

export async function collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_HBA_RELOAD_ARGUMENTS_INVALID",
      "Synthetic dependency-backed collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, true, false);
}

export function computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rows) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_HBA_RELOAD_ARGUMENTS_INVALID",
      "Digest helper accepts exactly one rule array.",
    );
  }
  return digest(HBA_CATALOG_DIGEST_DOMAIN, normalizeRules(rows));
}

export function isVerifiedCurrent187HbaReloadReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_RECEIPTS.has(value)
  );
}

export function isVerifiedCurrent187ProductionHbaReloadReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PRODUCTION_RECEIPTS.has(value)
  );
}

export const CURRENT187_HBA_RELOAD_CONTROL_SQL_FOR_TEST_ONLY = CONTROL_SQL;
export const CURRENT187_HBA_RELOAD_RULES_SQL_FOR_TEST_ONLY = HBA_SQL;
