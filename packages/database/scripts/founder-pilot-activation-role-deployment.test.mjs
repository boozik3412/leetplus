import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE_CONNECTION_LIMIT,
  FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
  FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL,
  createFounderPilotActivationRoleAdapterForTestOnly,
  createFounderPilotActivationRoleScramVerifier,
  founderPilotActivationRoleDeploymentInternals,
  normalizeFounderPilotActivationRoleReceipt,
  runFounderPilotActivationRoleDeployment,
  verifyFounderPilotActivationRoleSecret,
} from "./founder-pilot-activation-role-deployment.mjs";
import {
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
  runFounderPilotRestoredCopyPreflight,
} from "./founder-pilot-restored-copy-preflight.mjs";

const OPERATION_ID = "12345678-1234-4123-8123-123456789abc";
const SECRET = "FounderPilotActivationRoleSecret_2026_A1";
const OTHER_SECRET = "FounderPilotActivationRoleSecret_2026_B2";
const NOW = new Date("2026-08-17T12:00:00.000Z");
const VALID_UNTIL = "2026-08-18T12:00:00.000Z";
const SYSTEM_IDENTIFIER = "7612345678901234567";
const RELEASE_SHA = "a".repeat(40);
const ARTIFACT_SHA = "b".repeat(64);
const BACKUP_SHA = "c".repeat(64);
const MIGRATION_NAME = "20260818020000_identity_mail_delivery_current_head_v1";
const MIGRATION_CHECKSUM = "d".repeat(64);
const MIGRATION_DIGEST = createHash("sha256")
  .update(`${MIGRATION_NAME}\0${MIGRATION_CHECKSUM}`, "utf8")
  .digest("hex");

function manifest() {
  return {
    backup: {
      backupPath: path.join(os.tmpdir(), "founder-backup.dump"),
      backupSha256: BACKUP_SHA,
      capturedAt: "2026-08-17T11:00:00.000Z",
    },
    contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
    isolation: {
      apiStarted: false,
      databaseOnly: true,
      langameEnabled: false,
      productionServiceTokensMounted: false,
      schedulersEnabled: false,
      smtpEnabled: false,
      telegramEnabled: false,
      workersStarted: false,
    },
    release: {
      artifactPath: path.join(os.tmpdir(), "founder-artifact.tgz"),
      artifactSha256: ARTIFACT_SHA,
      releaseSha: RELEASE_SHA,
    },
    retention: {
      deleteBy: VALID_UNTIL,
      rpoSeconds: 7200,
      rtoSeconds: 3600,
    },
    target: {
      databaseName: "leetplus_restored_role_test",
      expectedSystemIdentifier: SYSTEM_IDENTIFIER,
      host: "127.0.0.1",
      ownerRoleName: "postgres",
      port: 55439,
      sourceMigrationCount: 1,
      sourceMigrationManifestDigest: MIGRATION_DIGEST,
      sourceSchemaHead: MIGRATION_NAME,
    },
  };
}

function absentRoleFields() {
  return {
    crossDatabaseDependencyCount: 0,
    otherDatabaseDirectPrivilegeCount: 0,
    defaultAclCount: 0,
    directDatabaseConnectCount: 0,
    directDatabasePrivilegeCount: 0,
    directRelationPrivilegeCount: 0,
    directRequiredExecuteCount: 0,
    directRoutinePrivilegeCount: 0,
    directSchemaPrivilegeCount: 0,
    directSchemaUsageCount: 0,
    directTypePrivilegeCount: 0,
    effectiveDatabaseConnect: false,
    effectiveDatabaseCreate: false,
    effectiveDatabaseTemporary: false,
    effectiveRequiredSecurityDefinerCount: 0,
    effectiveSchemaCreate: false,
    effectiveSchemaUsage: false,
    effectiveSecurityDefinerCount: 0,
    membershipCount: 0,
    ownedDatabaseCount: 0,
    ownedLargeObjectCount: 0,
    ownedRelationCount: 0,
    ownedRoutineCount: 0,
    ownedSchemaCount: 0,
    ownedTablespaceCount: 0,
    ownedTypeCount: 0,
    roleBypassRls: null,
    roleCanLogin: null,
    roleComment: null,
    roleConfig: null,
    roleConnectionLimit: null,
    roleCount: 0,
    roleCreateDb: null,
    roleCreateRole: null,
    roleInherit: null,
    roleOid: null,
    rolePassword: null,
    roleReplication: null,
    roleSettingCount: 0,
    roleSuperuser: null,
    roleValidUntilEpochMs: null,
    runtimeSessionCount: 0,
  };
}

function initialState() {
  return {
    ...absentRoleFields(),
    currentDatabase: "leetplus_restored_role_test",
    currentUser: "postgres",
    otherTargetSessionCount: 0,
    ownerSuperuser: true,
    publicDatabaseTemporary: true,
    publicSchemaCreate: true,
    requiredFunctionCount: 1,
    requiredFunctionPublicExecuteCount: 0,
    requiredFunctionSearchPathExact: true,
    requiredFunctionSecurityDefiner: true,
    requiredFunctionVolatile: true,
    serverAddress: "127.0.0.1",
    serverPort: 55439,
    systemIdentifier: SYSTEM_IDENTIFIER,
  };
}

function targetEvidence() {
  return {
    currentDatabase: "leetplus_restored_role_test",
    currentUser: "postgres",
    founderActivationRoleCount: 0,
    migrationCount: 1,
    migrationManifestDigest: MIGRATION_DIGEST,
    nonAppliedMigrationCount: 0,
    otherTargetSessionCount: 0,
    schemaHead: MIGRATION_NAME,
    serverAddress: "127.0.0.1",
    serverPort: 55439,
    systemIdentifier: SYSTEM_IDENTIFIER,
  };
}

async function livePreflight(value = manifest()) {
  return runFounderPilotRestoredCopyPreflight({
    inspectFile: async ({ kind }) => ({
      actualSha256: kind === "artifact" ? ARTIFACT_SHA : BACKUP_SHA,
      identityDigest: kind === "artifact" ? "e".repeat(64) : "f".repeat(64),
      sizeBytes: kind === "artifact" ? "100" : "200",
    }),
    inspectTarget: async () => targetEvidence(),
    manifest: value,
    now: () => NOW,
  });
}

function sqlLiteralAtEnd(statement) {
  const match = / IS '(.*)'$/u.exec(statement);
  assert.ok(match, `Expected SQL literal in ${statement}`);
  return match[1].replaceAll("''", "'");
}

function verifierFromCreateRole(statement) {
  const match = / PASSWORD '([^']+)'$/u.exec(statement);
  assert.ok(match, "Expected SCRAM verifier in CREATE ROLE");
  return match[1];
}

function createFakeDatabase() {
  const state = initialState();
  const statements = [];
  const migrations = [
    {
      applied: true,
      checksum: MIGRATION_CHECKSUM,
      migrationName: MIGRATION_NAME,
    },
  ];

  function makeRole(verifier) {
    Object.assign(state, {
      crossDatabaseDependencyCount: 0,
      otherDatabaseDirectPrivilegeCount: 0,
      defaultAclCount: 0,
      directDatabaseConnectCount: 0,
      directDatabasePrivilegeCount: 0,
      directRelationPrivilegeCount: 0,
      directRequiredExecuteCount: 0,
      directRoutinePrivilegeCount: 0,
      directSchemaPrivilegeCount: 0,
      directSchemaUsageCount: 0,
      directTypePrivilegeCount: 0,
      effectiveDatabaseConnect: false,
      effectiveDatabaseCreate: false,
      effectiveDatabaseTemporary: false,
      effectiveRequiredSecurityDefinerCount: 0,
      effectiveSchemaCreate: false,
      effectiveSchemaUsage: false,
      effectiveSecurityDefinerCount: 0,
      membershipCount: 0,
      ownedDatabaseCount: 0,
      ownedLargeObjectCount: 0,
      ownedRelationCount: 0,
      ownedRoutineCount: 0,
      ownedSchemaCount: 0,
      ownedTablespaceCount: 0,
      ownedTypeCount: 0,
      roleBypassRls: false,
      roleCanLogin: true,
      roleComment: null,
      roleConfig: null,
      roleConnectionLimit: FOUNDER_PILOT_ACTIVATION_ROLE_CONNECTION_LIMIT,
      roleCount: 1,
      roleCreateDb: false,
      roleCreateRole: false,
      roleInherit: false,
      roleOid: "4242",
      rolePassword: verifier,
      roleReplication: false,
      roleSettingCount: 0,
      roleSuperuser: false,
      roleValidUntilEpochMs: new Date(VALID_UNTIL).valueOf().toString(),
      runtimeSessionCount: 0,
    });
  }

  async function query(sql) {
    if (sql === FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL) {
      return { rows: [{ ...state }] };
    }
    if (sql.includes('FROM public."_prisma_migrations"')) {
      return { rows: migrations.map((row) => ({ ...row })) };
    }
    statements.push(sql);
    if (sql.startsWith("REVOKE TEMPORARY ON DATABASE")) {
      state.publicDatabaseTemporary = false;
    } else if (sql === "REVOKE CREATE ON SCHEMA public FROM PUBLIC") {
      state.publicSchemaCreate = false;
    } else if (sql.startsWith("CREATE ROLE")) {
      makeRole(verifierFromCreateRole(sql));
    } else if (sql.startsWith("GRANT CONNECT ON DATABASE")) {
      state.directDatabaseConnectCount = 1;
      state.directDatabasePrivilegeCount = 1;
      state.effectiveDatabaseConnect = true;
    } else if (sql.startsWith("GRANT USAGE ON SCHEMA")) {
      state.directSchemaPrivilegeCount = 1;
      state.directSchemaUsageCount = 1;
      state.effectiveSchemaUsage = true;
    } else if (sql.startsWith("GRANT EXECUTE ON FUNCTION")) {
      state.directRequiredExecuteCount = 1;
      state.directRoutinePrivilegeCount = 1;
      state.effectiveRequiredSecurityDefinerCount = 1;
      state.effectiveSecurityDefinerCount = 1;
    } else if (sql.startsWith("COMMENT ON ROLE")) {
      state.roleComment = sqlLiteralAtEnd(sql);
    } else if (sql.startsWith("DROP ROLE")) {
      Object.assign(state, absentRoleFields());
    } else if (sql.startsWith("GRANT TEMPORARY ON DATABASE")) {
      state.publicDatabaseTemporary = true;
    } else if (sql === "GRANT CREATE ON SCHEMA public TO PUBLIC") {
      state.publicSchemaCreate = true;
    }
    return { rows: [] };
  }

  const adapter = createFounderPilotActivationRoleAdapterForTestOnly({
    close: async () => undefined,
    query,
    transaction: async (callback) => callback(),
  });
  return { adapter, state, statements };
}

function options(database, overrides = {}) {
  return {
    adapter: database.adapter,
    manifest: manifest(),
    mode: "plan",
    now: () => NOW,
    operationId: OPERATION_ID,
    preflightReceipt: null,
    receipt: null,
    salt: Buffer.alloc(16, 7),
    secret: null,
    ...overrides,
  };
}

test("builds a deterministic PostgreSQL SCRAM verifier without exposing the password", () => {
  const verifier = createFounderPilotActivationRoleScramVerifier(
    SECRET,
    Buffer.alloc(16, 7),
  );
  assert.match(verifier, /^SCRAM-SHA-256\$4096:/u);
  assert.doesNotMatch(verifier, new RegExp(SECRET, "u"));
  assert.equal(verifyFounderPilotActivationRoleSecret(SECRET, verifier), true);
  assert.equal(
    verifyFounderPilotActivationRoleSecret(OTHER_SECRET, verifier),
    false,
  );
  assert.equal(
    verifier,
    createFounderPilotActivationRoleScramVerifier(SECRET, Buffer.alloc(16, 7)),
  );
});

test("requires a live in-process preflight brand before plan or first apply", async () => {
  const database = createFakeDatabase();
  const required = await runFounderPilotActivationRoleDeployment(
    options(database),
  );
  assert.equal(required.decision, "RESTORED_COPY_PREFLIGHT_REQUIRED");

  const receipt = await livePreflight();
  const forged = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "apply",
      preflightReceipt: structuredClone(receipt),
      secret: SECRET,
    }),
  );
  assert.deepEqual(
    { decision: forged.decision, reasonCode: forged.reasonCode },
    {
      decision: "BLOCKED_MANUAL",
      reasonCode: "FOUNDER_PILOT_PREFLIGHT_RECEIPT_NOT_LIVE",
    },
  );
  assert.equal(database.state.roleCount, 0);

  const plan = await runFounderPilotActivationRoleDeployment(
    options(database, { preflightReceipt: receipt }),
  );
  assert.equal(plan.decision, "ACTIVATION_ROLE_DEPLOYMENT_PLAN");
  assert.deepEqual(plan.plan.actions.slice(0, 2), [
    "REVOKE_TEMPORARY_ON_TARGET_DATABASE_FROM_PUBLIC",
    "REVOKE_CREATE_ON_PUBLIC_SCHEMA_FROM_PUBLIC",
  ]);
  assert.match(plan.plan.planDigest, /^[0-9a-f]{64}$/u);
  assert.equal(database.state.roleCount, 0);
});

test("applies, attests, reconciles, rolls back, and reconciles rollback", async () => {
  const database = createFakeDatabase();
  const preflightReceipt = await livePreflight();
  const applied = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "apply",
      preflightReceipt,
      secret: SECRET,
    }),
  );
  assert.equal(applied.decision, "ACTIVATION_ROLE_APPLIED");
  assert.equal(applied.reasonCode, null);
  assert.equal(database.state.roleCount, 1);
  assert.equal(database.state.publicDatabaseTemporary, false);
  assert.equal(database.state.publicSchemaCreate, false);
  assert.equal(database.state.roleInherit, false);
  assert.equal(database.state.directRoutinePrivilegeCount, 1);
  assert.equal(database.state.effectiveSecurityDefinerCount, 1);
  assert.doesNotMatch(JSON.stringify(applied), new RegExp(SECRET, "u"));
  assert.doesNotMatch(JSON.stringify(applied), /SCRAM-SHA-256/u);
  assert.ok(
    database.statements.every((statement) => !statement.includes(SECRET)),
    "raw secret must never enter SQL text",
  );
  assert.ok(
    database.statements.some((statement) =>
      statement.includes("SCRAM-SHA-256"),
    ),
    "CREATE ROLE must receive only a SCRAM verifier",
  );

  const normalized = normalizeFounderPilotActivationRoleReceipt(
    structuredClone(applied.receipt),
  );
  assert.equal(normalized.receiptDigest, applied.receipt.receiptDigest);

  const attested = await runFounderPilotActivationRoleDeployment(
    options(database, { mode: "check" }),
  );
  assert.equal(attested.decision, "ACTIVATION_ROLE_ATTESTED");
  assert.equal(attested.receiptDigest, applied.receipt.receiptDigest);

  const reconciledApply = await runFounderPilotActivationRoleDeployment(
    options(database, { mode: "apply", secret: SECRET }),
  );
  assert.equal(reconciledApply.decision, "ACTIVATION_ROLE_APPLY_RECONCILED");

  const wrongSecret = await runFounderPilotActivationRoleDeployment(
    options(database, { mode: "apply", secret: OTHER_SECRET }),
  );
  assert.equal(wrongSecret.decision, "BLOCKED_MANUAL");
  assert.equal(
    wrongSecret.reasonCode,
    "FOUNDER_PILOT_ACTIVATION_ROLE_SECRET_MISMATCH",
  );

  const rolledBack = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "rollback",
      receipt: structuredClone(applied.receipt),
    }),
  );
  assert.equal(rolledBack.decision, "ACTIVATION_ROLE_ROLLED_BACK");
  assert.equal(database.state.roleCount, 0);
  assert.equal(database.state.publicDatabaseTemporary, true);
  assert.equal(database.state.publicSchemaCreate, true);

  const reconciledRollback = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "rollback",
      receipt: structuredClone(applied.receipt),
    }),
  );
  assert.equal(
    reconciledRollback.decision,
    "ACTIVATION_ROLE_ROLLBACK_RECONCILED",
  );
});

test("fails closed on live catalog drift and preserves the role", async () => {
  const database = createFakeDatabase();
  const preflightReceipt = await livePreflight();
  const applied = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "apply",
      preflightReceipt,
      secret: SECRET,
    }),
  );
  assert.equal(applied.decision, "ACTIVATION_ROLE_APPLIED");
  database.state.roleInherit = true;
  const check = await runFounderPilotActivationRoleDeployment(
    options(database, { mode: "check" }),
  );
  assert.equal(check.decision, "BLOCKED_MANUAL");
  assert.equal(
    check.reasonCode,
    "FOUNDER_PILOT_ACTIVATION_ROLE_ATTESTATION_FAILED",
  );
  const rollback = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "rollback",
      receipt: applied.receipt,
    }),
  );
  assert.equal(rollback.decision, "BLOCKED_MANUAL");
  assert.equal(database.state.roleCount, 1);
});

test("catalog SQL covers attributes, memberships, ownership, ACL, sessions, and function posture", () => {
  for (const fragment of [
    "pg_authid",
    "pg_auth_members",
    "pg_db_role_setting",
    "pg_default_acl",
    "pg_shdepend",
    "pg_largeobject_metadata",
    "aclexplode",
    "has_database_privilege",
    "has_schema_privilege",
    "has_function_privilege",
    "pg_stat_activity",
    "pg_control_system",
    "requiredFunctionPublicExecuteCount",
    "crossDatabaseDependencyCount",
    "otherDatabaseDirectPrivilegeCount",
  ]) {
    assert.match(
      FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL,
      new RegExp(fragment, "u"),
    );
  }
  assert.doesNotMatch(
    FOUNDER_PILOT_ACTIVATION_ROLE_STATE_SQL,
    /CREATE ROLE|DROP ROLE/u,
  );
});

test("marker, receipt, and plan use separate domain-separated digests", async () => {
  const database = createFakeDatabase();
  const preflightReceipt = await livePreflight();
  const applied = await runFounderPilotActivationRoleDeployment(
    options(database, {
      mode: "apply",
      preflightReceipt,
      secret: SECRET,
    }),
  );
  assert.equal(
    applied.receipt.contractVersion,
    FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
  );
  assert.notEqual(applied.receipt.planDigest, applied.receipt.catalogDigest);
  assert.notEqual(applied.receipt.receiptDigest, applied.receipt.catalogDigest);
  assert.notEqual(applied.receipt.receiptDigest, applied.receipt.planDigest);
  assert.equal(
    founderPilotActivationRoleDeploymentInternals.parseMarker(
      database.state.roleComment,
    ).operationId,
    OPERATION_ID,
  );
});
