import { createHash } from "node:crypto";
import pg from "pg";

export const TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT =
  "TELEGRAM_UPDATE_LEDGER_RUNTIME_ACL_RECONCILIATION_V1";
export const TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION =
  "20260820010000_guest_portal_telegram_update_ledger";
export const TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION_COUNT = 187;
export const TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE = "leetplus_runtime";
export const TELEGRAM_UPDATE_LEDGER_ACL_TABLE =
  "GuestPortalTelegramUpdateLedger";
export const TELEGRAM_UPDATE_LEDGER_ACL_MODES = Object.freeze([
  "apply",
  "check",
  "plan",
]);

const EXPECTED_PRIVILEGES = Object.freeze(["INSERT", "SELECT", "UPDATE"]);
const SAFE_DATABASE = /^[a-z][a-z0-9_]{0,62}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const adapters = new WeakSet();

export class TelegramUpdateLedgerAclReconciliationError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "TelegramUpdateLedgerAclReconciliationError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new TelegramUpdateLedgerAclReconciliationError(reasonCode);
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
    .update(`${TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT}\0${domain}\0`, "utf8")
    .update(stableJson(value), "utf8")
    .digest("hex");
}

export const TELEGRAM_UPDATE_LEDGER_ACL_STATE_SQL = `
WITH target_role AS MATERIALIZED (
  SELECT role.*
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = '${TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE}'
),
target_relation AS MATERIALIZED (
  SELECT relation.*
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = '${TELEGRAM_UPDATE_LEDGER_ACL_TABLE}'
    AND relation.relkind IN ('r', 'p')
),
role_acl AS MATERIALIZED (
  SELECT privilege.privilege_type, privilege.is_grantable
  FROM target_relation AS relation
  CROSS JOIN target_role AS role
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS privilege
  WHERE privilege.grantee = role.oid
),
public_acl AS MATERIALIZED (
  SELECT privilege.privilege_type, privilege.is_grantable
  FROM target_relation AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) AS privilege
  WHERE privilege.grantee = 0
)
SELECT
  pg_catalog.current_database() AS "currentDatabase",
  current_user AS "currentUser",
  (SELECT pg_catalog.count(*)::INTEGER FROM target_role) AS "roleCount",
  (SELECT role.oid::TEXT FROM target_role AS role) AS "roleOid",
  (SELECT role.rolcanlogin FROM target_role AS role) AS "roleCanLogin",
  (SELECT role.rolinherit FROM target_role AS role) AS "roleInherit",
  (SELECT role.rolsuper FROM target_role AS role) AS "roleSuperuser",
  (SELECT role.rolcreatedb FROM target_role AS role) AS "roleCreateDatabase",
  (SELECT role.rolcreaterole FROM target_role AS role) AS "roleCreateRole",
  (SELECT role.rolreplication FROM target_role AS role) AS "roleReplication",
  (SELECT role.rolbypassrls FROM target_role AS role) AS "roleBypassRls",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_auth_members AS membership
   CROSS JOIN target_role AS role
   WHERE membership.roleid = role.oid OR membership.member = role.oid)
    AS "membershipCount",
  (SELECT pg_catalog.count(*)::INTEGER
   FROM pg_catalog.pg_class AS owned
   CROSS JOIN target_role AS role
   WHERE owned.relowner = role.oid) AS "ownedRelationCount",
  (SELECT pg_catalog.count(*)::INTEGER FROM target_relation) AS "tableCount",
  (SELECT relation.oid::TEXT FROM target_relation AS relation) AS "tableOid",
  COALESCE((SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'privilege', privilege_type,
      'isGrantable', is_grantable
    ) ORDER BY privilege_type, is_grantable
  ) FROM role_acl), '[]'::JSONB) AS "roleAcl",
  COALESCE((SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'privilege', privilege_type,
      'isGrantable', is_grantable
    ) ORDER BY privilege_type, is_grantable
  ) FROM public_acl), '[]'::JSONB) AS "publicAcl",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'SELECT')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveSelect",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'INSERT')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveInsert",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'UPDATE')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveUpdate",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'DELETE')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveDelete",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'TRUNCATE')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveTruncate",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'REFERENCES')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveReferences",
  COALESCE((SELECT pg_catalog.has_table_privilege(
    role.oid, relation.oid, 'TRIGGER')
    FROM target_role AS role CROSS JOIN target_relation AS relation), FALSE)
    AS "effectiveTrigger",
  COALESCE((SELECT
    relation.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
    OR COALESCE((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), FALSE)
    FROM target_relation AS relation), FALSE) AS "actorCanAlter"
`;

export const TELEGRAM_UPDATE_LEDGER_ACL_MIGRATIONS_SQL = `
SELECT
  migration."migration_name" AS "migrationName",
  migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL AS "applied",
  migration."rolled_back_at" IS NOT NULL AS "rolledBack"
FROM public."_prisma_migrations" AS migration
ORDER BY migration."migration_name" COLLATE "C", migration."started_at"
`;

const APPLY_STATEMENTS = Object.freeze([
  `REVOKE ALL PRIVILEGES ON TABLE public."${TELEGRAM_UPDATE_LEDGER_ACL_TABLE}" FROM PUBLIC`,
  `REVOKE ALL PRIVILEGES ON TABLE public."${TELEGRAM_UPDATE_LEDGER_ACL_TABLE}" FROM ${TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE}`,
  `GRANT SELECT, INSERT, UPDATE ON TABLE public."${TELEGRAM_UPDATE_LEDGER_ACL_TABLE}" TO ${TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE}`,
]);

function numberField(value, key) {
  const parsed = Number(value[key]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
  }
  return parsed;
}

function booleanField(value, key) {
  if (typeof value[key] !== "boolean") {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
  }
  return value[key];
}

function aclField(value, key) {
  if (!Array.isArray(value[key])) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
  }
  const normalized = value[key].map((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.privilege !== "string" ||
      typeof entry.isGrantable !== "boolean"
    ) {
      fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
    }
    return {
      isGrantable: entry.isGrantable,
      privilege: entry.privilege,
    };
  });
  normalized.sort((left, right) =>
    `${left.privilege}:${left.isGrantable}`.localeCompare(
      `${right.privilege}:${right.isGrantable}`,
      "en",
    ),
  );
  return normalized;
}

async function collectState(adapter) {
  const [stateResult, migrationResult] = await Promise.all([
    adapter.query(TELEGRAM_UPDATE_LEDGER_ACL_STATE_SQL, []),
    adapter.query(TELEGRAM_UPDATE_LEDGER_ACL_MIGRATIONS_SQL, []),
  ]);
  if (stateResult?.rows?.length !== 1 || !Array.isArray(migrationResult?.rows)) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
  }
  const raw = stateResult.rows[0];
  const applied = migrationResult.rows.filter((row) => row.applied === true);
  const unfinished = migrationResult.rows.filter(
    (row) => row.applied !== true && row.rolledBack !== true,
  );
  const migrationHead = applied.at(-1)?.migrationName ?? null;
  const state = {
    actorCanAlter: booleanField(raw, "actorCanAlter"),
    currentDatabase: raw.currentDatabase,
    currentUser: raw.currentUser,
    effectiveDelete: booleanField(raw, "effectiveDelete"),
    effectiveInsert: booleanField(raw, "effectiveInsert"),
    effectiveReferences: booleanField(raw, "effectiveReferences"),
    effectiveSelect: booleanField(raw, "effectiveSelect"),
    effectiveTrigger: booleanField(raw, "effectiveTrigger"),
    effectiveTruncate: booleanField(raw, "effectiveTruncate"),
    effectiveUpdate: booleanField(raw, "effectiveUpdate"),
    membershipCount: numberField(raw, "membershipCount"),
    migrationCount: applied.length,
    migrationHead,
    ownedRelationCount: numberField(raw, "ownedRelationCount"),
    publicAcl: aclField(raw, "publicAcl"),
    roleAcl: aclField(raw, "roleAcl"),
    roleBypassRls: booleanField(raw, "roleBypassRls"),
    roleCanLogin: booleanField(raw, "roleCanLogin"),
    roleCount: numberField(raw, "roleCount"),
    roleCreateDatabase: booleanField(raw, "roleCreateDatabase"),
    roleCreateRole: booleanField(raw, "roleCreateRole"),
    roleInherit: booleanField(raw, "roleInherit"),
    roleOid: raw.roleOid,
    roleReplication: booleanField(raw, "roleReplication"),
    roleSuperuser: booleanField(raw, "roleSuperuser"),
    tableCount: numberField(raw, "tableCount"),
    tableOid: raw.tableOid,
    unfinishedMigrationCount: unfinished.length,
  };
  if (
    typeof state.currentDatabase !== "string" ||
    typeof state.currentUser !== "string" ||
    (state.roleOid !== null && !/^\d+$/u.test(state.roleOid)) ||
    (state.tableOid !== null && !/^\d+$/u.test(state.tableOid))
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CATALOG_INVALID");
  }
  return Object.freeze(state);
}

function assertFoundation(state, requireAuthority) {
  if (
    state.migrationCount !==
      TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION_COUNT ||
    state.migrationHead !== TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION ||
    state.unfinishedMigrationCount !== 0
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_MIGRATION_MISMATCH");
  }
  if (state.tableCount !== 1 || state.tableOid === null) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_TABLE_MISMATCH");
  }
  if (
    state.roleCount !== 1 ||
    state.roleOid === null ||
    state.roleCanLogin !== true ||
    state.roleInherit !== false ||
    state.roleSuperuser !== false ||
    state.roleCreateDatabase !== false ||
    state.roleCreateRole !== false ||
    state.roleReplication !== false ||
    state.roleBypassRls !== false ||
    state.membershipCount !== 0 ||
    state.ownedRelationCount !== 0
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE_UNSAFE");
  }
  if (requireAuthority && !state.actorCanAlter) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_OWNER_AUTHORITY_REQUIRED");
  }
}

function isCompliant(state) {
  return (
    stableJson(state.roleAcl) ===
      stableJson(
        EXPECTED_PRIVILEGES.map((privilege) => ({
          isGrantable: false,
          privilege,
        })),
      ) &&
    state.publicAcl.length === 0 &&
    state.effectiveSelect &&
    state.effectiveInsert &&
    state.effectiveUpdate &&
    !state.effectiveDelete &&
    !state.effectiveTruncate &&
    !state.effectiveReferences &&
    !state.effectiveTrigger
  );
}

function buildPlan(state) {
  assertFoundation(state, false);
  const actions = isCompliant(state) ? [] : [...APPLY_STATEMENTS];
  const sourceGraph = {
    migrationCount: state.migrationCount,
    migrationHead: state.migrationHead,
    publicAcl: state.publicAcl,
    roleAcl: state.roleAcl,
    roleOid: state.roleOid,
    tableOid: state.tableOid,
  };
  const sourceGraphDigest = digest("source-graph", sourceGraph);
  const plan = {
    actionCount: actions.length,
    actions,
    expectedPrivileges: [...EXPECTED_PRIVILEGES],
    migrationCount: state.migrationCount,
    migrationHead: state.migrationHead,
    runtimeRole: TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE,
    sourceGraphDigest,
    table: `public.${TELEGRAM_UPDATE_LEDGER_ACL_TABLE}`,
  };
  return Object.freeze({
    ...plan,
    actions: Object.freeze(actions),
    expectedPrivileges: Object.freeze([...EXPECTED_PRIVILEGES]),
    planDigest: digest("plan", plan),
  });
}

export function exactTelegramUpdateLedgerAclApplyConfirmation(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    !SHA256.test(plan.planDigest ?? "") ||
    !Number.isSafeInteger(plan.actionCount)
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_PLAN_INVALID");
  }
  return `I_ACCEPT_EXACT_TELEGRAM_UPDATE_LEDGER_ACL_APPLY planDigest=${plan.planDigest} actionCount=${plan.actionCount}`;
}

export async function runTelegramUpdateLedgerAclReconciliation({
  adapter,
  confirmation = null,
  mode,
}) {
  if (!adapters.has(adapter)) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_ADAPTER_INVALID");
  }
  if (!TELEGRAM_UPDATE_LEDGER_ACL_MODES.includes(mode)) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_MODE_INVALID");
  }

  const initialState = await collectState(adapter);
  const initialPlan = buildPlan(initialState);
  if (mode === "plan") {
    return result("PLAN_READY", initialPlan, initialState);
  }
  if (mode === "check") {
    return result(
      isCompliant(initialState) ? "COMPLIANT" : "DRIFT_DETECTED",
      initialPlan,
      initialState,
    );
  }
  if (initialPlan.actionCount === 0) {
    return result("NOOP", initialPlan, initialState);
  }
  if (confirmation !== exactTelegramUpdateLedgerAclApplyConfirmation(initialPlan)) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_CONFIRMATION_MISMATCH");
  }
  assertFoundation(initialState, true);

  await adapter.transaction(async (transaction) => {
    await transaction.query("SET LOCAL lock_timeout = '5s'", []);
    await transaction.query("SET LOCAL statement_timeout = '15s'", []);
    await transaction.query(
      "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
      [TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT],
    );
    const lockedState = await collectState(transaction);
    const lockedPlan = buildPlan(lockedState);
    if (lockedPlan.planDigest !== initialPlan.planDigest) {
      fail("TELEGRAM_UPDATE_LEDGER_ACL_LIVE_DRIFT");
    }
    assertFoundation(lockedState, true);
    for (const statement of APPLY_STATEMENTS) {
      await transaction.query(statement, []);
    }
    const appliedState = await collectState(transaction);
    assertFoundation(appliedState, true);
    if (!isCompliant(appliedState)) {
      fail("TELEGRAM_UPDATE_LEDGER_ACL_POSTCONDITION_FAILED");
    }
  });

  const finalState = await collectState(adapter);
  assertFoundation(finalState, false);
  if (!isCompliant(finalState)) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_COMMIT_VERIFICATION_FAILED");
  }
  return result("APPLIED", initialPlan, finalState);
}

function result(decision, plan, state) {
  return Object.freeze({
    actionCount: plan.actionCount,
    contractVersion: TELEGRAM_UPDATE_LEDGER_ACL_CONTRACT,
    decision,
    migrationCount: state.migrationCount,
    migrationHead: state.migrationHead,
    planDigest: plan.planDigest,
    runtimeRole: TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE,
    sourceGraphDigest: plan.sourceGraphDigest,
    table: plan.table,
  });
}

export function createTelegramUpdateLedgerAclAdapterForTestOnly(database) {
  const adapter = Object.freeze({
    query: (sql, parameters) => database.query(sql, parameters),
    transaction: (callback) => database.transaction(callback),
  });
  adapters.add(adapter);
  return adapter;
}

export async function createTelegramUpdateLedgerAclPgAdapter(
  databaseUrl,
  expectedDatabase,
) {
  assertLoopbackDatabaseUrl(databaseUrl, expectedDatabase);
  const client = new pg.Client({
    application_name: "leetplus-telegram-ledger-acl-v1",
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  let closed = false;
  let inTransaction = false;
  const query = (sql, parameters) => {
    if (closed) fail("TELEGRAM_UPDATE_LEDGER_ACL_ADAPTER_CLOSED");
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
        fail("TELEGRAM_UPDATE_LEDGER_ACL_TRANSACTION_INVALID");
      }
      inTransaction = true;
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const transaction = Object.freeze({ query });
      adapters.add(transaction);
      try {
        const value = await callback(transaction);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  });
  adapters.add(adapter);
  return adapter;
}

function assertLoopbackDatabaseUrl(value, expectedDatabase) {
  if (
    typeof expectedDatabase !== "string" ||
    !SAFE_DATABASE.test(expectedDatabase)
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_DATABASE_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_DATABASE_URL_INVALID");
  }
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    database !== expectedDatabase ||
    !parsed.username ||
    !parsed.password ||
    parsed.search !== "" ||
    parsed.hash
  ) {
    fail("TELEGRAM_UPDATE_LEDGER_ACL_DATABASE_URL_INVALID");
  }
}

export const telegramUpdateLedgerAclReconciliationInternals = Object.freeze({
  APPLY_STATEMENTS,
  assertLoopbackDatabaseUrl,
  buildPlan,
  isCompliant,
});
