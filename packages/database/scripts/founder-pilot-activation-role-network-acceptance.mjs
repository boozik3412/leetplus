import { createHash } from "node:crypto";
import { checkServerIdentity } from "node:tls";
import pg from "pg";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE,
  assertFounderPilotRestoredCopyDatabaseUrl,
  founderPilotRestoredCopyManifestDigest,
} from "./founder-pilot-restored-copy-preflight.mjs";
import {
  FOUNDER_PILOT_ACTIVATION_WRAPPER_SIGNATURE,
  createFounderPilotActivationRolePgAdapter,
  normalizeFounderPilotActivationRoleReceipt,
  runFounderPilotActivationRoleDeployment,
} from "./founder-pilot-activation-role-deployment.mjs";

export const FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT =
  "FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTANCE_V1";
export const FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTED =
  "ACTIVATION_ROLE_NETWORK_ACCEPTED";
export const FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED = "BLOCKED_MANUAL";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_DATABASE = /^[a-z][a-z0-9_]{0,62}$/u;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/u;
const adapters = new WeakSet();

export class FounderPilotActivationRoleNetworkError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotActivationRoleNetworkError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotActivationRoleNetworkError(reasonCode);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT}\0${domain}\0`)
    .update(stableJson(value))
    .digest("hex");
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactStringArray(value, reasonCode) {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" || entry.length === 0 || entry.length > 256,
    )
  ) {
    fail(reasonCode);
  }
  return [...value];
}

function normalizeHbaRow(value) {
  const row = exactRecord(
    value,
    [
      "address",
      "authMethod",
      "databases",
      "error",
      "lineNumber",
      "netmask",
      "options",
      "type",
      "users",
    ],
    "FOUNDER_PILOT_NETWORK_HBA_ROW_INVALID",
  );
  if (
    !Number.isSafeInteger(row.lineNumber) ||
    row.lineNumber <= 0 ||
    typeof row.type !== "string" ||
    typeof row.authMethod !== "string" ||
    (row.address !== null && typeof row.address !== "string") ||
    (row.netmask !== null && typeof row.netmask !== "string") ||
    (row.error !== null && typeof row.error !== "string")
  ) {
    fail("FOUNDER_PILOT_NETWORK_HBA_ROW_INVALID");
  }
  return Object.freeze({
    address: row.address,
    authMethod: row.authMethod,
    databases: Object.freeze(
      exactStringArray(row.databases, "FOUNDER_PILOT_NETWORK_HBA_ROW_INVALID"),
    ),
    error: row.error,
    lineNumber: row.lineNumber,
    netmask: row.netmask,
    options:
      row.options === null
        ? null
        : Object.freeze(
            exactStringArray(
              row.options,
              "FOUNDER_PILOT_NETWORK_HBA_ROW_INVALID",
            ),
          ),
    type: row.type,
    users: Object.freeze(
      exactStringArray(row.users, "FOUNDER_PILOT_NETWORK_HBA_ROW_INVALID"),
    ),
  });
}

function sameArray(left, right) {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

function exactLoopbackRule(row, { authMethod, database, type }) {
  return (
    row.type === type &&
    sameArray(row.databases, [database]) &&
    sameArray(row.users, [FOUNDER_PILOT_ACTIVATION_ROLE]) &&
    row.address === "127.0.0.1" &&
    row.netmask === "255.255.255.255" &&
    row.authMethod === authMethod &&
    (row.options === null || row.options.length === 0) &&
    row.error === null
  );
}

function assertExactHbaBoundary(rows, targetDatabase) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 2048) {
    fail("FOUNDER_PILOT_NETWORK_HBA_CATALOG_INVALID");
  }
  const normalized = rows.map(normalizeHbaRow);
  if (normalized.some((row) => row.error !== null)) {
    fail("FOUNDER_PILOT_NETWORK_HBA_CATALOG_ERROR");
  }
  const allow = normalized.filter((row) =>
    exactLoopbackRule(row, {
      authMethod: "scram-sha-256",
      database: targetDatabase,
      type: "hostssl",
    }),
  );
  const denyOtherDatabase = normalized.filter((row) =>
    exactLoopbackRule(row, {
      authMethod: "reject",
      database: "all",
      type: "hostssl",
    }),
  );
  const denyPlaintext = normalized.filter((row) =>
    exactLoopbackRule(row, {
      authMethod: "reject",
      database: "all",
      type: "hostnossl",
    }),
  );
  if (
    allow.length !== 1 ||
    denyOtherDatabase.length !== 1 ||
    denyPlaintext.length !== 1 ||
    allow[0].lineNumber >= denyOtherDatabase[0].lineNumber
  ) {
    fail("FOUNDER_PILOT_NETWORK_HBA_BOUNDARY_INVALID");
  }
  const potentiallyMatchingEarlierRule = normalized.some(
    (row) =>
      row.lineNumber < allow[0].lineNumber &&
      ["host", "hostssl"].includes(row.type) &&
      ["127.0.0.1", "0.0.0.0"].includes(row.address) &&
      row.users.some((user) =>
        ["all", FOUNDER_PILOT_ACTIVATION_ROLE].includes(user),
      ) &&
      row.databases.some((database) =>
        ["all", targetDatabase].includes(database),
      ),
  );
  if (potentiallyMatchingEarlierRule) {
    fail("FOUNDER_PILOT_NETWORK_HBA_PRECEDENCE_INVALID");
  }
  return Object.freeze({
    allowLineNumber: allow[0].lineNumber,
    catalogDigest: digest("hba-catalog", normalized),
    denyOtherDatabaseLineNumber: denyOtherDatabase[0].lineNumber,
    denyPlaintextLineNumber: denyPlaintext[0].lineNumber,
    ruleCount: normalized.length,
  });
}

function normalizeSuccessfulProbe(value, manifest) {
  const probe = exactRecord(
    value,
    [
      "certificateSha256",
      "cipherName",
      "currentDatabase",
      "currentUser",
      "directRelationReadRejected",
      "effectiveDatabaseConnect",
      "effectiveDatabaseCreate",
      "effectiveDatabaseTemporary",
      "effectiveRequiredFunctionExecute",
      "effectiveSchemaCreate",
      "effectiveSchemaUsage",
      "serverAddress",
      "serverPort",
      "sessionUser",
      "tlsAuthorized",
      "tlsProtocol",
    ],
    "FOUNDER_PILOT_NETWORK_RUNTIME_PROBE_INVALID",
  );
  if (
    probe.currentDatabase !== manifest.target.databaseName ||
    probe.currentUser !== FOUNDER_PILOT_ACTIVATION_ROLE ||
    probe.sessionUser !== FOUNDER_PILOT_ACTIVATION_ROLE ||
    probe.serverAddress !== manifest.target.host ||
    probe.serverPort !== manifest.target.port ||
    probe.tlsAuthorized !== true ||
    !["TLSv1.2", "TLSv1.3"].includes(probe.tlsProtocol) ||
    typeof probe.cipherName !== "string" ||
    probe.cipherName.length === 0 ||
    !SHA256.test(probe.certificateSha256) ||
    probe.directRelationReadRejected !== true ||
    probe.effectiveDatabaseConnect !== true ||
    probe.effectiveDatabaseCreate !== false ||
    probe.effectiveDatabaseTemporary !== false ||
    probe.effectiveSchemaUsage !== true ||
    probe.effectiveSchemaCreate !== false ||
    probe.effectiveRequiredFunctionExecute !== true
  ) {
    fail("FOUNDER_PILOT_NETWORK_RUNTIME_PROBE_MISMATCH");
  }
  return Object.freeze({ ...probe });
}

function assertRejectedProbe(value, expectedCode, reasonCode) {
  const probe = exactRecord(value, ["code", "rejected"], reasonCode);
  if (probe.rejected !== true || probe.code !== expectedCode) fail(reasonCode);
  return Object.freeze({ code: probe.code, rejected: true });
}

function assertDeniedDatabaseExists(value) {
  const evidence = exactRecord(
    value,
    ["allowConnections", "databaseCount", "isTemplate"],
    "FOUNDER_PILOT_NETWORK_DENIED_DATABASE_EVIDENCE_INVALID",
  );
  if (
    evidence.databaseCount !== 1 ||
    evidence.allowConnections !== true ||
    evidence.isTemplate !== false
  ) {
    fail("FOUNDER_PILOT_NETWORK_DENIED_DATABASE_NOT_USABLE");
  }
}

function normalizeOptions(value) {
  const options = exactRecord(
    value,
    [
      "adapter",
      "caCertificateSha256",
      "deniedDatabaseName",
      "manifest",
      "now",
      "operationId",
      "roleReceipt",
    ],
    "FOUNDER_PILOT_NETWORK_ARGUMENTS_INVALID",
  );
  if (
    !adapters.has(options.adapter) ||
    typeof options.now !== "function" ||
    !UUID.test(options.operationId) ||
    !SHA256.test(options.caCertificateSha256) ||
    !SAFE_DATABASE.test(options.deniedDatabaseName) ||
    options.deniedDatabaseName === options.manifest?.target?.databaseName
  ) {
    fail("FOUNDER_PILOT_NETWORK_ARGUMENTS_INVALID");
  }
  return options;
}

function blocked(reasonCode) {
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT,
    decision: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED,
    reasonCode,
  });
}

async function callAdapter(adapter, method, reasonCode, ...args) {
  try {
    return await adapter[method](...args);
  } catch (error) {
    if (error instanceof FounderPilotActivationRoleNetworkError) throw error;
    fail(reasonCode);
  }
}

export async function runFounderPilotActivationRoleNetworkAcceptance(value) {
  try {
    const options = normalizeOptions(value);
    const roleReceipt = normalizeFounderPilotActivationRoleReceipt(
      options.roleReceipt,
    );
    const manifestDigest = founderPilotRestoredCopyManifestDigest(
      options.manifest,
    );
    if (
      roleReceipt.manifestDigest !== manifestDigest ||
      roleReceipt.operationId !== options.operationId ||
      roleReceipt.releaseSha !== options.manifest.release.releaseSha
    ) {
      fail("FOUNDER_PILOT_NETWORK_ROLE_RECEIPT_BINDING_MISMATCH");
    }
    const before = await callAdapter(
      options.adapter,
      "attestRole",
      "FOUNDER_PILOT_NETWORK_ROLE_PRE_ATTESTATION_QUERY_FAILED",
    );
    if (
      before?.decision !== "ACTIVATION_ROLE_ATTESTED" ||
      before?.reasonCode !== null ||
      before?.receiptDigest !== roleReceipt.receiptDigest
    ) {
      fail("FOUNDER_PILOT_NETWORK_ROLE_PRE_ATTESTATION_FAILED");
    }
    const hba = assertExactHbaBoundary(
      await callAdapter(
        options.adapter,
        "inspectHba",
        "FOUNDER_PILOT_NETWORK_HBA_INSPECTION_FAILED",
      ),
      options.manifest.target.databaseName,
    );
    const runtime = normalizeSuccessfulProbe(
      await callAdapter(
        options.adapter,
        "probeRuntime",
        "FOUNDER_PILOT_NETWORK_RUNTIME_PROBE_FAILED",
      ),
      options.manifest,
    );
    assertDeniedDatabaseExists(
      await callAdapter(
        options.adapter,
        "inspectDeniedDatabase",
        "FOUNDER_PILOT_NETWORK_DENIED_DATABASE_INSPECTION_FAILED",
        options.deniedDatabaseName,
      ),
    );
    assertRejectedProbe(
      await callAdapter(
        options.adapter,
        "probeWrongSecret",
        "FOUNDER_PILOT_NETWORK_WRONG_SECRET_PROBE_FAILED",
      ),
      "28P01",
      "FOUNDER_PILOT_NETWORK_WRONG_SECRET_NOT_REJECTED",
    );
    assertRejectedProbe(
      await callAdapter(
        options.adapter,
        "probeDeniedDatabase",
        "FOUNDER_PILOT_NETWORK_OTHER_DATABASE_PROBE_FAILED",
        options.deniedDatabaseName,
      ),
      "28000",
      "FOUNDER_PILOT_NETWORK_OTHER_DATABASE_NOT_REJECTED",
    );
    assertRejectedProbe(
      await callAdapter(
        options.adapter,
        "probePlaintext",
        "FOUNDER_PILOT_NETWORK_PLAINTEXT_PROBE_FAILED",
      ),
      "28000",
      "FOUNDER_PILOT_NETWORK_PLAINTEXT_NOT_REJECTED",
    );
    const after = await callAdapter(
      options.adapter,
      "attestRole",
      "FOUNDER_PILOT_NETWORK_ROLE_POST_ATTESTATION_QUERY_FAILED",
    );
    if (
      after?.decision !== "ACTIVATION_ROLE_ATTESTED" ||
      after?.reasonCode !== null ||
      after?.receiptDigest !== roleReceipt.receiptDigest ||
      after?.catalogDigest !== before.catalogDigest
    ) {
      fail("FOUNDER_PILOT_NETWORK_ROLE_POST_ATTESTATION_FAILED");
    }
    const checkedAt = options.now();
    if (
      !(checkedAt instanceof Date) ||
      Number.isNaN(checkedAt.valueOf()) ||
      checkedAt.toISOString() <= roleReceipt.appliedAt ||
      checkedAt.toISOString() >= roleReceipt.validUntil
    ) {
      fail("FOUNDER_PILOT_NETWORK_CLOCK_INVALID");
    }
    const evidence = Object.freeze({
      caCertificateSha256: options.caCertificateSha256,
      certificateSha256: runtime.certificateSha256,
      deniedDatabaseName: options.deniedDatabaseName,
      hbaCatalogDigest: hba.catalogDigest,
      hbaRuleCount: hba.ruleCount,
      manifestDigest,
      operationId: options.operationId,
      releaseSha: options.manifest.release.releaseSha,
      roleCatalogDigest: before.catalogDigest,
      roleReceiptDigest: roleReceipt.receiptDigest,
      targetDatabaseName: options.manifest.target.databaseName,
      tlsCipherName: runtime.cipherName,
      tlsProtocol: runtime.tlsProtocol,
    });
    return Object.freeze({
      checkedAt: checkedAt.toISOString(),
      contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT,
      decision: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTED,
      evidence,
      evidenceDigest: digest("accepted-evidence", evidence),
      reasonCode: null,
    });
  } catch (error) {
    return blocked(
      error instanceof FounderPilotActivationRoleNetworkError ||
        error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PILOT_NETWORK_UNEXPECTED_FAILURE",
    );
  }
}

function assertDependencies(value) {
  const dependencies = exactRecord(
    value,
    [
      "attestRole",
      "close",
      "inspectHba",
      "inspectDeniedDatabase",
      "probeDeniedDatabase",
      "probePlaintext",
      "probeRuntime",
      "probeWrongSecret",
    ],
    "FOUNDER_PILOT_NETWORK_ADAPTER_INVALID",
  );
  if (
    Object.values(dependencies).some((entry) => typeof entry !== "function")
  ) {
    fail("FOUNDER_PILOT_NETWORK_ADAPTER_INVALID");
  }
  return dependencies;
}

export function createFounderPilotActivationRoleNetworkAdapterForTestOnly(
  value,
) {
  const dependencies = assertDependencies(value);
  const adapter = Object.freeze({ ...dependencies });
  adapters.add(adapter);
  return adapter;
}

const HBA_SQL = `
SELECT
  line_number::INTEGER AS "lineNumber",
  type,
  database AS "databases",
  user_name AS "users",
  address,
  netmask,
  auth_method AS "authMethod",
  options,
  error
FROM pg_catalog.pg_hba_file_rules
ORDER BY line_number
`;

const RUNTIME_SQL = `
SELECT
  pg_catalog.current_database() AS "currentDatabase",
  current_user AS "currentUser",
  session_user AS "sessionUser",
  pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
  pg_catalog.inet_server_port()::INTEGER AS "serverPort",
  ssl.ssl AS "tlsAuthorized",
  ssl.version AS "tlsProtocol",
  ssl.cipher AS "cipherName",
  pg_catalog.has_database_privilege(
    current_user,
    pg_catalog.current_database(),
    'CONNECT'
  ) AS "effectiveDatabaseConnect",
  pg_catalog.has_database_privilege(
    current_user,
    pg_catalog.current_database(),
    'CREATE'
  ) AS "effectiveDatabaseCreate",
  pg_catalog.has_database_privilege(
    current_user,
    pg_catalog.current_database(),
    'TEMPORARY'
  ) AS "effectiveDatabaseTemporary",
  pg_catalog.has_schema_privilege(
    current_user,
    'public',
    'USAGE'
  ) AS "effectiveSchemaUsage",
  pg_catalog.has_schema_privilege(
    current_user,
    'public',
    'CREATE'
  ) AS "effectiveSchemaCreate",
  pg_catalog.has_function_privilege(
    current_user,
    pg_catalog.to_regprocedure($1),
    'EXECUTE'
  ) AS "effectiveRequiredFunctionExecute"
FROM pg_catalog.pg_stat_ssl AS ssl
WHERE ssl.pid = pg_catalog.pg_backend_pid()
`;

function normalizeRuntimeDatabaseUrl(databaseUrl, target) {
  if (
    typeof databaseUrl !== "string" ||
    Buffer.byteLength(databaseUrl, "utf8") > 4096
  ) {
    fail("FOUNDER_PILOT_NETWORK_RUNTIME_DATABASE_URL_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("FOUNDER_PILOT_NETWORK_RUNTIME_DATABASE_URL_INVALID");
  }
  let username;
  let password;
  let database;
  try {
    username = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    fail("FOUNDER_PILOT_NETWORK_RUNTIME_DATABASE_URL_INVALID");
  }
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== target.host ||
    Number(parsed.port) !== target.port ||
    database !== target.databaseName ||
    username !== FOUNDER_PILOT_ACTIVATION_ROLE ||
    !SECRET.test(password) ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("FOUNDER_PILOT_NETWORK_RUNTIME_DATABASE_URL_INVALID");
  }
  return {
    database,
    host: parsed.hostname,
    password,
    port: Number(parsed.port),
    user: username,
  };
}

function deriveWrongSecret(secret) {
  const replacement = secret[0] === "A" ? "B" : "A";
  return `${replacement}${secret.slice(1)}`;
}

function normalizeCa(caCertificate, expectedSha256) {
  if (
    !Buffer.isBuffer(caCertificate) ||
    caCertificate.length === 0 ||
    caCertificate.length > 64 * 1024 ||
    !SHA256.test(expectedSha256) ||
    createHash("sha256").update(caCertificate).digest("hex") !== expectedSha256
  ) {
    fail("FOUNDER_PILOT_NETWORK_CA_INVALID");
  }
  return Buffer.from(caCertificate);
}

function normalizeProbeFailure(error) {
  return Object.freeze({
    code: typeof error?.code === "string" ? error.code : "UNCLASSIFIED",
    rejected: true,
  });
}

export async function createFounderPilotActivationRoleNetworkPgAdapter(value) {
  const input = exactRecord(
    value,
    [
      "caCertificate",
      "caCertificateSha256",
      "manifest",
      "operationId",
      "ownerDatabaseUrl",
      "runtimeDatabaseUrl",
    ],
    "FOUNDER_PILOT_NETWORK_ADAPTER_ARGUMENTS_INVALID",
  );
  assertFounderPilotRestoredCopyDatabaseUrl(
    input.ownerDatabaseUrl,
    input.manifest.target,
  );
  if (!UUID.test(input.operationId)) {
    fail("FOUNDER_PILOT_NETWORK_ADAPTER_ARGUMENTS_INVALID");
  }
  const runtime = normalizeRuntimeDatabaseUrl(
    input.runtimeDatabaseUrl,
    input.manifest.target,
  );
  const ca = normalizeCa(input.caCertificate, input.caCertificateSha256);
  const owner = await createFounderPilotActivationRolePgAdapter(
    input.ownerDatabaseUrl,
    input.manifest.target,
  );
  let closed = false;
  const connect = async ({ database, password, ssl }) => {
    if (closed) fail("FOUNDER_PILOT_NETWORK_ADAPTER_CLOSED");
    const client = new pg.Client({
      connectionTimeoutMillis: 5000,
      database,
      host: runtime.host,
      password,
      port: runtime.port,
      ssl,
      user: runtime.user,
    });
    await client.connect();
    return client;
  };
  const rejectedProbe = async (configuration) => {
    let client = null;
    try {
      client = await connect(configuration);
      return Object.freeze({ code: "CONNECTED", rejected: false });
    } catch (error) {
      return normalizeProbeFailure(error);
    } finally {
      await client?.end().catch(() => undefined);
    }
  };
  const tls = Object.freeze({
    ca: ca.toString("utf8"),
    checkServerIdentity: (_hostname, certificate) =>
      checkServerIdentity(runtime.host, certificate),
    rejectUnauthorized: true,
  });
  const adapter = Object.freeze({
    attestRole: () =>
      runFounderPilotActivationRoleDeployment({
        adapter: owner,
        manifest: input.manifest,
        mode: "check",
        now: () => new Date(),
        operationId: input.operationId,
        preflightReceipt: null,
        receipt: null,
        salt: undefined,
        secret: null,
      }),
    close: async () => {
      if (!closed) {
        closed = true;
        ca.fill(0);
        await owner.close();
      }
    },
    inspectHba: async () => {
      if (closed) fail("FOUNDER_PILOT_NETWORK_ADAPTER_CLOSED");
      const result = await owner.query(HBA_SQL, []);
      return result.rows;
    },
    inspectDeniedDatabase: async (databaseName) => {
      if (closed) fail("FOUNDER_PILOT_NETWORK_ADAPTER_CLOSED");
      const result = await owner.query(
        `
          SELECT
            pg_catalog.count(*)::INTEGER AS "databaseCount",
            COALESCE(pg_catalog.bool_and(database_object.datallowconn), FALSE)
              AS "allowConnections",
            COALESCE(pg_catalog.bool_or(database_object.datistemplate), FALSE)
              AS "isTemplate"
          FROM pg_catalog.pg_database AS database_object
          WHERE database_object.datname = $1
        `,
        [databaseName],
      );
      return result.rows[0];
    },
    probeDeniedDatabase: (deniedDatabaseName) =>
      rejectedProbe({
        database: deniedDatabaseName,
        password: runtime.password,
        ssl: tls,
      }),
    probePlaintext: () =>
      rejectedProbe({
        database: runtime.database,
        password: runtime.password,
        ssl: false,
      }),
    probeRuntime: async () => {
      const client = await connect({
        database: runtime.database,
        password: runtime.password,
        ssl: tls,
      });
      try {
        const stream = client.connection.stream;
        const certificate = stream.getPeerCertificate(true);
        const cipher = stream.getCipher();
        const result = await client.query(RUNTIME_SQL, [
          FOUNDER_PILOT_ACTIVATION_WRAPPER_SIGNATURE,
        ]);
        let directRelationReadRejected = false;
        try {
          await client.query('SELECT 1 FROM public."Tenant" LIMIT 0', []);
        } catch (error) {
          directRelationReadRejected = error?.code === "42501";
        }
        return {
          ...result.rows[0],
          certificateSha256:
            Buffer.isBuffer(certificate?.raw) && certificate.raw.length > 0
              ? createHash("sha256").update(certificate.raw).digest("hex")
              : null,
          cipherName: cipher?.name ?? null,
          directRelationReadRejected,
          tlsAuthorized:
            stream.authorized === true &&
            result.rows[0]?.tlsAuthorized === true,
          tlsProtocol: stream.getProtocol(),
        };
      } finally {
        await client.end();
      }
    },
    probeWrongSecret: () =>
      rejectedProbe({
        database: runtime.database,
        password: deriveWrongSecret(runtime.password),
        ssl: tls,
      }),
  });
  adapters.add(adapter);
  return adapter;
}

export const founderPilotActivationRoleNetworkInternals = Object.freeze({
  HBA_SQL,
  RUNTIME_SQL,
  assertExactHbaBoundary,
  normalizeRuntimeDatabaseUrl,
});
