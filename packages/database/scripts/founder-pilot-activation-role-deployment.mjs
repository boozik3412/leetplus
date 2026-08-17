import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import pg from "pg";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE,
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_READY,
  assertFounderPilotRestoredCopyDatabaseUrl,
  assertFounderPilotRestoredCopyPreflightReceipt,
  founderPilotRestoredCopyManifestDigest,
} from "./founder-pilot-restored-copy-preflight.mjs";

export const FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT =
  "FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_V1";
export const FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_MODES = Object.freeze([
  "apply",
  "check",
  "plan",
  "rollback",
]);
export const FOUNDER_PILOT_ACTIVATION_ROLE_CONNECTION_LIMIT = 4;

const WRAPPER_SIGNATURE =
  'public."founder_operator_beta_tenant_activate_v2"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)';
const WRAPPER_GRANT_SIGNATURE =
  'public."founder_operator_beta_tenant_activate_v2"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP WITH TIME ZONE)';
const LOCK_DOMAIN = "leetplus:founder-pilot:activation-role-deployment:v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/u;
const SCRAM =
  /^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2}):([A-Za-z0-9+/]+={0,2})$/u;
const SCRAM_ITERATIONS = 4096;
const adapters = new WeakSet();

export class FounderPilotActivationRoleDeploymentError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "FounderPilotActivationRoleDeploymentError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new FounderPilotActivationRoleDeploymentError(reasonCode);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT}\0${domain}\0`)
    .update(stableJson(value))
    .digest("hex");
}

function exactRecord(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactBoolean(value, reasonCode) {
  if (typeof value !== "boolean") fail(reasonCode);
  return value;
}

function assertOperationId(value) {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_OPERATION_ID_INVALID");
  }
  return value;
}

function assertSecret(value) {
  if (typeof value !== "string" || !SECRET.test(value)) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_SECRET_INVALID");
  }
  return value;
}

function hashBuffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function scramParts(secret, salt, iterations = SCRAM_ITERATIONS) {
  const saltedPassword = pbkdf2Sync(
    Buffer.from(secret, "utf8"),
    salt,
    iterations,
    32,
    "sha256",
  );
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key", "utf8")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key", "utf8")
    .digest();
  saltedPassword.fill(0);
  clientKey.fill(0);
  return { serverKey, storedKey };
}

export function createFounderPilotActivationRoleScramVerifier(
  secret,
  salt = randomBytes(16),
) {
  assertSecret(secret);
  if (!Buffer.isBuffer(salt) || salt.length !== 16) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_SALT_INVALID");
  }
  const { serverKey, storedKey } = scramParts(secret, salt);
  try {
    return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
  } finally {
    storedKey.fill(0);
    serverKey.fill(0);
  }
}

export function verifyFounderPilotActivationRoleSecret(secret, verifier) {
  assertSecret(secret);
  if (typeof verifier !== "string") return false;
  const match = SCRAM.exec(verifier);
  if (match === null || Number(match[1]) !== SCRAM_ITERATIONS) return false;
  let salt;
  let expectedStored;
  let expectedServer;
  try {
    salt = Buffer.from(match[2], "base64");
    expectedStored = Buffer.from(match[3], "base64");
    expectedServer = Buffer.from(match[4], "base64");
  } catch {
    return false;
  }
  if (
    salt.length !== 16 ||
    expectedStored.length !== 32 ||
    expectedServer.length !== 32
  ) {
    return false;
  }
  const { serverKey, storedKey } = scramParts(secret, salt, SCRAM_ITERATIONS);
  try {
    return (
      timingSafeEqual(storedKey, expectedStored) &&
      timingSafeEqual(serverKey, expectedServer)
    );
  } finally {
    salt.fill(0);
    expectedStored.fill(0);
    expectedServer.fill(0);
    storedKey.fill(0);
    serverKey.fill(0);
  }
}

export const FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL = `
WITH runtime_role AS MATERIALIZED (
  SELECT role.*
  FROM pg_catalog.pg_authid AS role
  WHERE role.rolname = $1
),
required_function AS MATERIALIZED (
  SELECT routine.*
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure($2)::OID
),
current_database_record AS MATERIALIZED (
  SELECT database_object.*
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database()
),
public_schema AS MATERIALIZED (
  SELECT namespace.*
  FROM pg_catalog.pg_namespace AS namespace
  WHERE namespace.nspname = 'public'
)
SELECT
  pg_catalog.current_database() AS "currentDatabase",
  current_user AS "currentUser",
  pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
  pg_catalog.inet_server_port()::INTEGER AS "serverPort",
  (pg_catalog.pg_control_system()).system_identifier::TEXT AS "systemIdentifier",
  COALESCE((
    SELECT role.rolsuper
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
  ), FALSE) AS "ownerSuperuser",
  COALESCE((
    SELECT pg_catalog.bool_or(
      privilege.grantee = 0
      AND privilege.privilege_type = 'TEMPORARY'
    )
    FROM current_database_record AS database_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        database_object.datacl,
        pg_catalog.acldefault('d', database_object.datdba)
      )
    ) AS privilege
  ), FALSE) AS "publicDatabaseTemporary",
  COALESCE((
    SELECT pg_catalog.bool_or(
      privilege.grantee = 0
      AND privilege.privilege_type = 'CREATE'
    )
    FROM public_schema AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        namespace.nspacl,
        pg_catalog.acldefault('n', namespace.nspowner)
      )
    ) AS privilege
  ), FALSE) AS "publicSchemaCreate",
  (SELECT pg_catalog.count(*)::INTEGER FROM runtime_role) AS "roleCount",
  (SELECT role.oid::TEXT FROM runtime_role AS role) AS "roleOid",
  (SELECT role.rolcanlogin FROM runtime_role AS role) AS "roleCanLogin",
  (SELECT role.rolinherit FROM runtime_role AS role) AS "roleInherit",
  (SELECT role.rolsuper FROM runtime_role AS role) AS "roleSuperuser",
  (SELECT role.rolcreatedb FROM runtime_role AS role) AS "roleCreateDb",
  (SELECT role.rolcreaterole FROM runtime_role AS role) AS "roleCreateRole",
  (SELECT role.rolreplication FROM runtime_role AS role) AS "roleReplication",
  (SELECT role.rolbypassrls FROM runtime_role AS role) AS "roleBypassRls",
  (SELECT role.rolconnlimit FROM runtime_role AS role) AS "roleConnectionLimit",
  (SELECT visible_role.rolconfig
   FROM pg_catalog.pg_roles AS visible_role
   CROSS JOIN runtime_role AS role
   WHERE visible_role.oid = role.oid) AS "roleConfig",
  (SELECT role.rolpassword FROM runtime_role AS role) AS "rolePassword",
  (SELECT
    (EXTRACT(EPOCH FROM role.rolvaliduntil) * 1000)::BIGINT::TEXT
   FROM runtime_role AS role) AS "roleValidUntilEpochMs",
  (SELECT pg_catalog.shobj_description(role.oid, 'pg_authid')
   FROM runtime_role AS role) AS "roleComment",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_auth_members AS membership
   CROSS JOIN runtime_role AS role
   WHERE membership.roleid = role.oid
      OR membership.member = role.oid
      OR membership.grantor = role.oid) AS "membershipCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_db_role_setting AS setting
   CROSS JOIN runtime_role AS role
   WHERE setting.setrole = role.oid) AS "roleSettingCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_default_acl AS default_acl
   CROSS JOIN runtime_role AS role
   WHERE default_acl.defaclrole = role.oid) AS "defaultAclCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_database AS object
   CROSS JOIN runtime_role AS role
   WHERE object.datdba = role.oid) AS "ownedDatabaseCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_tablespace AS object
   CROSS JOIN runtime_role AS role
   WHERE object.spcowner = role.oid) AS "ownedTablespaceCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_namespace AS object
   CROSS JOIN runtime_role AS role
   WHERE object.nspowner = role.oid) AS "ownedSchemaCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_class AS object
   CROSS JOIN runtime_role AS role
   WHERE object.relowner = role.oid) AS "ownedRelationCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_proc AS object
   CROSS JOIN runtime_role AS role
   WHERE object.proowner = role.oid) AS "ownedRoutineCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_type AS object
   CROSS JOIN runtime_role AS role
   WHERE object.typowner = role.oid) AS "ownedTypeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_largeobject_metadata AS object
   CROSS JOIN runtime_role AS role
   WHERE object.lomowner = role.oid) AS "ownedLargeObjectCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_shdepend AS dependency
   CROSS JOIN runtime_role AS role
   CROSS JOIN current_database_record AS database_object
   WHERE dependency.refclassid = 'pg_catalog.pg_authid'::REGCLASS
     AND dependency.refobjid = role.oid
      AND dependency.dbid NOT IN (0, database_object.oid))
     AS "crossDatabaseDependencyCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_database AS database_object
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(
       database_object.datacl,
       pg_catalog.acldefault('d', database_object.datdba)
     )
   ) AS privilege
   WHERE database_object.datname <> pg_catalog.current_database()
     AND privilege.grantee = role.oid) AS "otherDatabaseDirectPrivilegeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM current_database_record AS database_object
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(
       database_object.datacl,
       pg_catalog.acldefault('d', database_object.datdba)
     )
   ) AS privilege
   WHERE privilege.grantee = role.oid) AS "directDatabasePrivilegeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM current_database_record AS database_object
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(
       database_object.datacl,
       pg_catalog.acldefault('d', database_object.datdba)
     )
   ) AS privilege
   WHERE privilege.grantee = role.oid
     AND privilege.privilege_type = 'CONNECT'
     AND privilege.is_grantable IS FALSE) AS "directDatabaseConnectCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM public_schema AS namespace
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(
       namespace.nspacl,
       pg_catalog.acldefault('n', namespace.nspowner)
     )
   ) AS privilege
   WHERE privilege.grantee = role.oid) AS "directSchemaPrivilegeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM public_schema AS namespace
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(
       namespace.nspacl,
       pg_catalog.acldefault('n', namespace.nspowner)
     )
   ) AS privilege
   WHERE privilege.grantee = role.oid
     AND privilege.privilege_type = 'USAGE'
     AND privilege.is_grantable IS FALSE) AS "directSchemaUsageCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_proc AS routine
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
   ) AS privilege
   WHERE privilege.grantee = role.oid) AS "directRoutinePrivilegeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM required_function AS routine
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
   ) AS privilege
   WHERE privilege.grantee = role.oid
     AND privilege.privilege_type = 'EXECUTE'
     AND privilege.is_grantable IS FALSE) AS "directRequiredExecuteCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_class AS relation
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
   ) AS privilege
   WHERE privilege.grantee = role.oid) AS "directRelationPrivilegeCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_type AS type_object
   CROSS JOIN runtime_role AS role
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(type_object.typacl, pg_catalog.acldefault('T', type_object.typowner))
   ) AS privilege
   WHERE privilege.grantee = role.oid) AS "directTypePrivilegeCount",
  COALESCE((SELECT pg_catalog.has_database_privilege(
    role.oid, pg_catalog.current_database(), 'CONNECT')
    FROM runtime_role AS role), FALSE) AS "effectiveDatabaseConnect",
  COALESCE((SELECT pg_catalog.has_database_privilege(
    role.oid, pg_catalog.current_database(), 'CREATE')
    FROM runtime_role AS role), FALSE) AS "effectiveDatabaseCreate",
  COALESCE((SELECT pg_catalog.has_database_privilege(
    role.oid, pg_catalog.current_database(), 'TEMPORARY')
    FROM runtime_role AS role), FALSE) AS "effectiveDatabaseTemporary",
  COALESCE((SELECT pg_catalog.has_schema_privilege(role.oid, 'public', 'USAGE')
    FROM runtime_role AS role), FALSE) AS "effectiveSchemaUsage",
  COALESCE((SELECT pg_catalog.has_schema_privilege(role.oid, 'public', 'CREATE')
    FROM runtime_role AS role), FALSE) AS "effectiveSchemaCreate",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_proc AS routine
   CROSS JOIN runtime_role AS role
   WHERE routine.prosecdef
     AND routine.oid >= 16384
     AND pg_catalog.has_function_privilege(role.oid, routine.oid, 'EXECUTE'))
    AS "effectiveSecurityDefinerCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM required_function AS routine
   CROSS JOIN runtime_role AS role
   WHERE routine.prosecdef
     AND pg_catalog.has_function_privilege(role.oid, routine.oid, 'EXECUTE'))
    AS "effectiveRequiredSecurityDefinerCount",
  (SELECT pg_catalog.count(*)::INTEGER FROM required_function)
    AS "requiredFunctionCount",
  COALESCE((SELECT routine.prosecdef FROM required_function AS routine), FALSE)
    AS "requiredFunctionSecurityDefiner",
  COALESCE((SELECT routine.provolatile = 'v' FROM required_function AS routine), FALSE)
    AS "requiredFunctionVolatile",
  COALESCE((SELECT routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    FROM required_function AS routine), FALSE) AS "requiredFunctionSearchPathExact",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM required_function AS routine
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
   ) AS privilege
   WHERE privilege.grantee = 0
     AND privilege.privilege_type = 'EXECUTE') AS "requiredFunctionPublicExecuteCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.datname = pg_catalog.current_database()
     AND activity.pid <> pg_catalog.pg_backend_pid()) AS "otherTargetSessionCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.usename = $1) AS "runtimeSessionCount"
`;

const MIGRATIONS_SQL = `
SELECT
  migration."migration_name" AS "migrationName",
  migration."checksum",
  migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL AS "applied"
FROM public."_prisma_migrations" AS migration
ORDER BY migration."migration_name" COLLATE "C", migration."started_at"
`;

function migrationDigest(rows) {
  return createHash("sha256")
    .update(
      rows
        .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
        .join("\n"),
      "utf8",
    )
    .digest("hex");
}

function numberField(value, key) {
  const number = Number(value[key]);
  if (!Number.isSafeInteger(number) || number < 0) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_CATALOG_INVALID");
  }
  return number;
}

async function collectState(adapter) {
  const stateResult = await adapter.query(
    FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL,
    [FOUNDER_PILOT_ACTIVATION_ROLE, WRAPPER_SIGNATURE],
  );
  const migrationResult = await adapter.query(MIGRATIONS_SQL, []);
  if (
    stateResult?.rows?.length !== 1 ||
    !Array.isArray(migrationResult?.rows)
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_CATALOG_INVALID");
  }
  const raw = stateResult.rows[0];
  const applied = migrationResult.rows.filter((row) => row.applied === true);
  const numericKeys = [
    "crossDatabaseDependencyCount",
    "otherDatabaseDirectPrivilegeCount",
    "defaultAclCount",
    "directDatabaseConnectCount",
    "directDatabasePrivilegeCount",
    "directRelationPrivilegeCount",
    "directRequiredExecuteCount",
    "directRoutinePrivilegeCount",
    "directSchemaPrivilegeCount",
    "directSchemaUsageCount",
    "directTypePrivilegeCount",
    "effectiveRequiredSecurityDefinerCount",
    "effectiveSecurityDefinerCount",
    "membershipCount",
    "otherTargetSessionCount",
    "ownedDatabaseCount",
    "ownedLargeObjectCount",
    "ownedRelationCount",
    "ownedRoutineCount",
    "ownedSchemaCount",
    "ownedTablespaceCount",
    "ownedTypeCount",
    "requiredFunctionCount",
    "roleCount",
    "roleSettingCount",
    "runtimeSessionCount",
    "serverPort",
  ];
  const normalized = { ...raw };
  for (const key of numericKeys) normalized[key] = numberField(raw, key);
  normalized.migrationCount = applied.length;
  normalized.migrationManifestDigest = migrationDigest(applied);
  normalized.nonAppliedMigrationCount =
    migrationResult.rows.length - applied.length;
  normalized.schemaHead = applied.at(-1)?.migrationName ?? null;
  return normalized;
}

function assertTargetState(state, manifest) {
  if (
    state.currentDatabase !== manifest.target.databaseName ||
    state.currentUser !== manifest.target.ownerRoleName ||
    state.serverAddress !== manifest.target.host ||
    state.serverPort !== manifest.target.port ||
    state.systemIdentifier !== manifest.target.expectedSystemIdentifier ||
    state.ownerSuperuser !== true
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_TARGET_IDENTITY_MISMATCH");
  }
  if (
    state.migrationCount !== manifest.target.sourceMigrationCount ||
    state.schemaHead !== manifest.target.sourceSchemaHead ||
    state.migrationManifestDigest !==
      manifest.target.sourceMigrationManifestDigest ||
    state.nonAppliedMigrationCount !== 0
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MIGRATION_STATE_MISMATCH");
  }
  if (
    state.requiredFunctionCount !== 1 ||
    state.requiredFunctionSecurityDefiner !== true ||
    state.requiredFunctionVolatile !== true ||
    state.requiredFunctionSearchPathExact !== true ||
    state.requiredFunctionPublicExecuteCount !== 0
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_FUNCTION_BOUNDARY_INVALID");
  }
}

function safeCatalogState(state) {
  const result = { ...state };
  result.rolePasswordDigest =
    typeof state.rolePassword === "string"
      ? hashBuffer(state.rolePassword)
      : null;
  delete result.rolePassword;
  delete result.roleComment;
  return result;
}

function catalogDigest(state) {
  return digest("catalog", safeCatalogState(state));
}

function buildPlan(state, manifest, operationId) {
  const core = Object.freeze({
    actions: Object.freeze([
      ...(state.publicDatabaseTemporary
        ? ["REVOKE_TEMPORARY_ON_TARGET_DATABASE_FROM_PUBLIC"]
        : []),
      ...(state.publicSchemaCreate
        ? ["REVOKE_CREATE_ON_PUBLIC_SCHEMA_FROM_PUBLIC"]
        : []),
      "CREATE_EXACT_NOINHERIT_LOGIN_ROLE_WITH_SCRAM_VERIFIER",
      "GRANT_TARGET_DATABASE_CONNECT",
      "GRANT_PUBLIC_SCHEMA_USAGE",
      "GRANT_EXACT_ACTIVATION_WRAPPER_EXECUTE",
      "PERSIST_EXACT_ROLE_COMMENT_MARKER",
      "ATTEST_EXACT_CATALOG",
    ]),
    manifestDigest: founderPilotRestoredCopyManifestDigest(manifest),
    operationId,
    publicDatabaseTemporaryBefore: state.publicDatabaseTemporary,
    publicSchemaCreateBefore: state.publicSchemaCreate,
    releaseSha: manifest.release.releaseSha,
    targetDatabase: manifest.target.databaseName,
    validUntil: manifest.retention.deleteBy,
  });
  return Object.freeze({ ...core, planDigest: digest("plan", core) });
}

function parseMarker(value) {
  if (typeof value !== "string" || value.length > 8192) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID");
  }
  let marker;
  try {
    marker = JSON.parse(value);
  } catch {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID");
  }
  const exact = exactRecord(
    marker,
    [
      "appliedAt",
      "catalogDigest",
      "contractVersion",
      "manifestDigest",
      "operationId",
      "planDigest",
      "preflightEvidenceDigest",
      "publicDatabaseTemporaryBefore",
      "publicSchemaCreateBefore",
      "releaseSha",
      "roleOid",
      "sourceMigrationManifestDigest",
      "targetIdentityDigest",
      "validUntil",
      "verifierDigest",
    ],
    "FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID",
  );
  for (const key of [
    "catalogDigest",
    "manifestDigest",
    "planDigest",
    "preflightEvidenceDigest",
    "sourceMigrationManifestDigest",
    "targetIdentityDigest",
    "verifierDigest",
  ]) {
    if (typeof exact[key] !== "string" || !SHA256.test(exact[key])) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID");
    }
  }
  if (
    exact.contractVersion !==
      FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT ||
    !UUID.test(exact.operationId) ||
    typeof exact.roleOid !== "string" ||
    !/^\d{1,20}$/u.test(exact.roleOid) ||
    typeof exact.releaseSha !== "string" ||
    !/^[0-9a-f]{40}$/u.test(exact.releaseSha) ||
    typeof exact.appliedAt !== "string" ||
    typeof exact.validUntil !== "string"
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID");
  }
  const appliedAt = new Date(exact.appliedAt);
  const validUntil = new Date(exact.validUntil);
  if (
    Number.isNaN(appliedAt.valueOf()) ||
    Number.isNaN(validUntil.valueOf()) ||
    appliedAt.toISOString() !== exact.appliedAt ||
    validUntil.toISOString() !== exact.validUntil ||
    appliedAt >= validUntil
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID");
  }
  exactBoolean(
    exact.publicDatabaseTemporaryBefore,
    "FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID",
  );
  exactBoolean(
    exact.publicSchemaCreateBefore,
    "FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_INVALID",
  );
  return Object.freeze({ ...exact });
}

function receiptFromMarker(marker) {
  const core = Object.freeze({ ...marker });
  return Object.freeze({
    ...core,
    receiptDigest: digest("apply-receipt", core),
  });
}

export function normalizeFounderPilotActivationRoleReceipt(value) {
  const receipt = exactRecord(
    value,
    [
      "appliedAt",
      "catalogDigest",
      "contractVersion",
      "manifestDigest",
      "operationId",
      "planDigest",
      "preflightEvidenceDigest",
      "publicDatabaseTemporaryBefore",
      "publicSchemaCreateBefore",
      "receiptDigest",
      "releaseSha",
      "roleOid",
      "sourceMigrationManifestDigest",
      "targetIdentityDigest",
      "validUntil",
      "verifierDigest",
    ],
    "FOUNDER_PILOT_ACTIVATION_ROLE_RECEIPT_INVALID",
  );
  const { receiptDigest, ...markerValue } = receipt;
  const marker = parseMarker(stableJson(markerValue));
  const normalized = receiptFromMarker(marker);
  if (normalized.receiptDigest !== receiptDigest) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_RECEIPT_INVALID");
  }
  return normalized;
}

function assertMarkerBinding(marker, manifest, operationId) {
  if (
    marker.operationId !== operationId ||
    marker.manifestDigest !==
      founderPilotRestoredCopyManifestDigest(manifest) ||
    marker.releaseSha !== manifest.release.releaseSha ||
    marker.sourceMigrationManifestDigest !==
      manifest.target.sourceMigrationManifestDigest ||
    marker.validUntil !== manifest.retention.deleteBy
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MARKER_BINDING_MISMATCH");
  }
}

function assertExactRoleState(state, marker) {
  const validUntilEpochMs = new Date(marker.validUntil).valueOf().toString();
  if (
    state.roleCount !== 1 ||
    state.roleOid !== marker.roleOid ||
    state.roleCanLogin !== true ||
    state.roleInherit !== false ||
    state.roleSuperuser !== false ||
    state.roleCreateDb !== false ||
    state.roleCreateRole !== false ||
    state.roleReplication !== false ||
    state.roleBypassRls !== false ||
    state.roleConnectionLimit !==
      FOUNDER_PILOT_ACTIVATION_ROLE_CONNECTION_LIMIT ||
    state.roleConfig !== null ||
    state.roleValidUntilEpochMs !== validUntilEpochMs ||
    state.membershipCount !== 0 ||
    state.roleSettingCount !== 0 ||
    state.defaultAclCount !== 0 ||
    state.ownedDatabaseCount !== 0 ||
    state.ownedTablespaceCount !== 0 ||
    state.ownedSchemaCount !== 0 ||
    state.ownedRelationCount !== 0 ||
    state.ownedRoutineCount !== 0 ||
    state.ownedTypeCount !== 0 ||
    state.ownedLargeObjectCount !== 0 ||
    state.crossDatabaseDependencyCount !== 0 ||
    state.otherDatabaseDirectPrivilegeCount !== 0 ||
    state.directDatabasePrivilegeCount !== 1 ||
    state.directDatabaseConnectCount !== 1 ||
    state.directSchemaPrivilegeCount !== 1 ||
    state.directSchemaUsageCount !== 1 ||
    state.directRoutinePrivilegeCount !== 1 ||
    state.directRequiredExecuteCount !== 1 ||
    state.directRelationPrivilegeCount !== 0 ||
    state.directTypePrivilegeCount !== 0 ||
    state.effectiveDatabaseConnect !== true ||
    state.effectiveDatabaseCreate !== false ||
    state.effectiveDatabaseTemporary !== false ||
    state.effectiveSchemaUsage !== true ||
    state.effectiveSchemaCreate !== false ||
    state.effectiveSecurityDefinerCount !== 1 ||
    state.effectiveRequiredSecurityDefinerCount !== 1 ||
    state.publicDatabaseTemporary !== false ||
    state.publicSchemaCreate !== false ||
    state.otherTargetSessionCount !== 0 ||
    state.runtimeSessionCount !== 0 ||
    typeof state.rolePassword !== "string" ||
    hashBuffer(state.rolePassword) !== marker.verifierDigest ||
    state.roleComment !== stableJson(marker) ||
    catalogDigest(state) !== marker.catalogDigest
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_ATTESTATION_FAILED");
  }
}

function assertRoleAbsent(state) {
  if (state.roleCount !== 0) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_ALREADY_PRESENT");
  }
}

function normalizeOptions(value) {
  const options = exactRecord(
    value,
    [
      "adapter",
      "manifest",
      "mode",
      "now",
      "operationId",
      "preflightReceipt",
      "receipt",
      "salt",
      "secret",
    ],
    "FOUNDER_PILOT_ACTIVATION_ROLE_ARGUMENTS_INVALID",
  );
  if (!FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_MODES.includes(options.mode)) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_MODE_INVALID");
  }
  assertOperationId(options.operationId);
  if (!adapters.has(options.adapter)) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_ADAPTER_INVALID");
  }
  if (typeof options.now !== "function") {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_CLOCK_INVALID");
  }
  return options;
}

function blocked(reasonCode) {
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
    decision: "BLOCKED_MANUAL",
    reasonCode,
  });
}

function preflightRequired(mode) {
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
    decision: "RESTORED_COPY_PREFLIGHT_REQUIRED",
    mode,
    reasonCode: "FOUNDER_PILOT_PREFLIGHT_RECEIPT_REQUIRED",
  });
}

function validateReceiptBinding(receipt, manifest, operationId) {
  const normalized = normalizeFounderPilotActivationRoleReceipt(receipt);
  assertMarkerBinding(normalized, manifest, operationId);
  return normalized;
}

function roleCommentStatement(marker) {
  const role = quoteIdentifier(FOUNDER_PILOT_ACTIVATION_ROLE);
  return `COMMENT ON ROLE ${role} IS ${quoteLiteral(stableJson(marker))}`;
}

function rollbackStatements(manifest, receipt) {
  const database = quoteIdentifier(manifest.target.databaseName);
  const role = quoteIdentifier(FOUNDER_PILOT_ACTIVATION_ROLE);
  return [
    `ALTER ROLE ${role} NOLOGIN`,
    `REVOKE EXECUTE ON FUNCTION ${WRAPPER_GRANT_SIGNATURE} FROM ${role}`,
    `REVOKE USAGE ON SCHEMA public FROM ${role}`,
    `REVOKE CONNECT ON DATABASE ${database} FROM ${role}`,
    `DROP ROLE ${role}`,
    receipt.publicDatabaseTemporaryBefore
      ? `GRANT TEMPORARY ON DATABASE ${database} TO PUBLIC`
      : `REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
    receipt.publicSchemaCreateBefore
      ? "GRANT CREATE ON SCHEMA public TO PUBLIC"
      : "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
  ];
}

async function executeStatements(adapter, statements) {
  for (const statement of statements) await adapter.query(statement, []);
}

async function withLockedTransaction(adapter, callback) {
  return adapter.transaction(async (transaction) => {
    await transaction.query("SET LOCAL lock_timeout = '5s'", []);
    await transaction.query("SET LOCAL statement_timeout = '30s'", []);
    await transaction.query(
      "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
      [LOCK_DOMAIN],
    );
    return callback(transaction);
  });
}

async function apply(options, initialState) {
  const {
    adapter,
    manifest,
    now,
    operationId,
    preflightReceipt,
    salt,
    secret,
  } = options;
  if (initialState.roleCount === 1) {
    const marker = parseMarker(initialState.roleComment);
    assertMarkerBinding(marker, manifest, operationId);
    assertExactRoleState(initialState, marker);
    if (
      !verifyFounderPilotActivationRoleSecret(secret, initialState.rolePassword)
    ) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_SECRET_MISMATCH");
    }
    return Object.freeze({
      contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
      decision: "ACTIVATION_ROLE_APPLY_RECONCILED",
      reasonCode: null,
      receipt: receiptFromMarker(marker),
    });
  }
  assertRoleAbsent(initialState);
  if (preflightReceipt === null) return preflightRequired("apply");
  assertFounderPilotRestoredCopyPreflightReceipt(preflightReceipt, manifest);
  assertSecret(secret);
  const currentTime = now();
  if (!(currentTime instanceof Date) || Number.isNaN(currentTime.valueOf())) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_CLOCK_INVALID");
  }
  if (currentTime >= new Date(manifest.retention.deleteBy)) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_WINDOW_EXPIRED");
  }
  const verifier = createFounderPilotActivationRoleScramVerifier(secret, salt);
  const plan = buildPlan(initialState, manifest, operationId);
  const initialDigest = catalogDigest(initialState);
  return withLockedTransaction(adapter, async (transaction) => {
    const before = await collectState(transaction);
    assertTargetState(before, manifest);
    assertRoleAbsent(before);
    if (
      before.otherTargetSessionCount !== 0 ||
      catalogDigest(before) !== initialDigest
    ) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_PREFLIGHT_STALE");
    }
    const role = quoteIdentifier(FOUNDER_PILOT_ACTIVATION_ROLE);
    const database = quoteIdentifier(manifest.target.databaseName);
    await executeStatements(transaction, [
      `REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`,
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
      `CREATE ROLE ${role} WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT ${FOUNDER_PILOT_ACTIVATION_ROLE_CONNECTION_LIMIT} VALID UNTIL ${quoteLiteral(manifest.retention.deleteBy)} PASSWORD ${quoteLiteral(verifier)}`,
      `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
      `GRANT USAGE ON SCHEMA public TO ${role}`,
      `GRANT EXECUTE ON FUNCTION ${WRAPPER_GRANT_SIGNATURE} TO ${role}`,
    ]);
    const provisioned = await collectState(transaction);
    if (provisioned.roleCount !== 1 || provisioned.roleComment !== null) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_APPLY_POSTCONDITION_FAILED");
    }
    const marker = Object.freeze({
      appliedAt: currentTime.toISOString(),
      catalogDigest: catalogDigest(provisioned),
      contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
      manifestDigest: plan.manifestDigest,
      operationId,
      planDigest: plan.planDigest,
      preflightEvidenceDigest: preflightReceipt.evidenceDigest,
      publicDatabaseTemporaryBefore: plan.publicDatabaseTemporaryBefore,
      publicSchemaCreateBefore: plan.publicSchemaCreateBefore,
      releaseSha: manifest.release.releaseSha,
      roleOid: provisioned.roleOid,
      sourceMigrationManifestDigest:
        manifest.target.sourceMigrationManifestDigest,
      targetIdentityDigest: preflightReceipt.evidence.targetIdentityDigest,
      validUntil: manifest.retention.deleteBy,
      verifierDigest: hashBuffer(verifier),
    });
    await executeStatements(transaction, [roleCommentStatement(marker)]);
    const after = await collectState(transaction);
    assertTargetState(after, manifest);
    assertExactRoleState(after, marker);
    return Object.freeze({
      contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
      decision: "ACTIVATION_ROLE_APPLIED",
      reasonCode: null,
      receipt: receiptFromMarker(marker),
    });
  });
}

async function rollback(options, initialState) {
  const { adapter, manifest, operationId } = options;
  const receipt = validateReceiptBinding(
    options.receipt,
    manifest,
    operationId,
  );
  if (initialState.roleCount === 0) {
    if (
      initialState.publicDatabaseTemporary ===
        receipt.publicDatabaseTemporaryBefore &&
      initialState.publicSchemaCreate === receipt.publicSchemaCreateBefore
    ) {
      return Object.freeze({
        contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
        decision: "ACTIVATION_ROLE_ROLLBACK_RECONCILED",
        reasonCode: null,
        receiptDigest: receipt.receiptDigest,
      });
    }
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_ROLLBACK_AMBIGUOUS");
  }
  const marker = parseMarker(initialState.roleComment);
  assertMarkerBinding(marker, manifest, operationId);
  assertExactRoleState(initialState, marker);
  if (receiptFromMarker(marker).receiptDigest !== receipt.receiptDigest) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_RECEIPT_MISMATCH");
  }
  return withLockedTransaction(adapter, async (transaction) => {
    const before = await collectState(transaction);
    assertTargetState(before, manifest);
    const lockedMarker = parseMarker(before.roleComment);
    assertExactRoleState(before, lockedMarker);
    if (
      receiptFromMarker(lockedMarker).receiptDigest !== receipt.receiptDigest ||
      before.runtimeSessionCount !== 0 ||
      before.otherTargetSessionCount !== 0
    ) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_ROLLBACK_PREFLIGHT_FAILED");
    }
    await executeStatements(transaction, rollbackStatements(manifest, receipt));
    const after = await collectState(transaction);
    assertTargetState(after, manifest);
    assertRoleAbsent(after);
    if (
      after.publicDatabaseTemporary !== receipt.publicDatabaseTemporaryBefore ||
      after.publicSchemaCreate !== receipt.publicSchemaCreateBefore ||
      after.runtimeSessionCount !== 0
    ) {
      fail("FOUNDER_PILOT_ACTIVATION_ROLE_ROLLBACK_POSTCONDITION_FAILED");
    }
    return Object.freeze({
      contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
      decision: "ACTIVATION_ROLE_ROLLED_BACK",
      reasonCode: null,
      receiptDigest: receipt.receiptDigest,
    });
  });
}

export async function runFounderPilotActivationRoleDeployment(value) {
  try {
    const options = normalizeOptions(value);
    const state = await collectState(options.adapter);
    assertTargetState(state, options.manifest);
    if (options.mode === "plan") {
      if (state.roleCount === 1) {
        const marker = parseMarker(state.roleComment);
        assertMarkerBinding(marker, options.manifest, options.operationId);
        assertExactRoleState(state, marker);
        return Object.freeze({
          contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
          decision: "ACTIVATION_ROLE_ALREADY_APPLIED",
          reasonCode: null,
          receiptDigest: receiptFromMarker(marker).receiptDigest,
        });
      }
      assertRoleAbsent(state);
      if (options.preflightReceipt === null) return preflightRequired("plan");
      assertFounderPilotRestoredCopyPreflightReceipt(
        options.preflightReceipt,
        options.manifest,
      );
      return Object.freeze({
        contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
        decision: "ACTIVATION_ROLE_DEPLOYMENT_PLAN",
        plan: buildPlan(state, options.manifest, options.operationId),
        reasonCode: null,
      });
    }
    if (options.mode === "apply") return await apply(options, state);
    if (options.mode === "check") {
      const marker = parseMarker(state.roleComment);
      assertMarkerBinding(marker, options.manifest, options.operationId);
      assertExactRoleState(state, marker);
      return Object.freeze({
        catalogDigest: marker.catalogDigest,
        contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
        decision: "ACTIVATION_ROLE_ATTESTED",
        reasonCode: null,
        receiptDigest: receiptFromMarker(marker).receiptDigest,
      });
    }
    return await rollback(options, state);
  } catch (error) {
    return blocked(
      error instanceof FounderPilotActivationRoleDeploymentError ||
        error?.safeContractError === true
        ? error.reasonCode
        : "FOUNDER_PILOT_ACTIVATION_ROLE_UNEXPECTED_FAILURE",
    );
  }
}

function assertAdapterDependencies(value) {
  const dependencies = exactRecord(
    value,
    ["close", "query", "transaction"],
    "FOUNDER_PILOT_ACTIVATION_ROLE_ADAPTER_INVALID",
  );
  if (
    typeof dependencies.query !== "function" ||
    typeof dependencies.transaction !== "function" ||
    typeof dependencies.close !== "function"
  ) {
    fail("FOUNDER_PILOT_ACTIVATION_ROLE_ADAPTER_INVALID");
  }
  return dependencies;
}

export function createFounderPilotActivationRoleAdapterForTestOnly(value) {
  const dependencies = assertAdapterDependencies(value);
  const adapter = Object.freeze({
    close: dependencies.close,
    query: dependencies.query,
    transaction: async (callback) => {
      const transaction = Object.freeze({ query: dependencies.query });
      return dependencies.transaction(() => callback(transaction));
    },
  });
  adapters.add(adapter);
  return adapter;
}

export async function createFounderPilotActivationRolePgAdapter(
  databaseUrl,
  target,
) {
  assertFounderPilotRestoredCopyDatabaseUrl(databaseUrl, target);
  const { Client } = pg;
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  let closed = false;
  let inTransaction = false;
  const query = async (sql, parameters) => {
    if (closed) fail("FOUNDER_PILOT_ACTIVATION_ROLE_ADAPTER_CLOSED");
    return client.query(sql, parameters);
  };
  const adapter = Object.freeze({
    close: async () => {
      if (!closed) {
        closed = true;
        await client.end();
      }
    },
    query,
    transaction: async (callback) => {
      if (closed || inTransaction) {
        fail("FOUNDER_PILOT_ACTIVATION_ROLE_TRANSACTION_INVALID");
      }
      inTransaction = true;
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const transaction = Object.freeze({ query });
      try {
        const result = await callback(transaction);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The caller receives the original fail-closed error.
        }
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  });
  adapters.add(adapter);
  return adapter;
}

export const founderPilotActivationRoleDeploymentInternals = Object.freeze({
  WRAPPER_GRANT_SIGNATURE,
  WRAPPER_SIGNATURE,
  buildPlan,
  catalogDigest,
  parseMarker,
  receiptFromMarker,
  safeCatalogState,
});
