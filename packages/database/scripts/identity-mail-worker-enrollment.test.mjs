import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
  IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
  IDENTITY_MAIL_WORKER_FUNCTIONS,
  IdentityMailWorkerEnrollmentError,
  buildIdentityMailWorkerEnrollmentStatements,
  expectedIdentityMailWorkerEnrollmentConfirmation,
  identityMailWorkerEnrollmentComplianceViolations,
  identityMailWorkerEnrollmentContractDigest,
  identityMailWorkerEnrollmentPreconditionViolations,
  parseIdentityMailWorkerEnrollmentConfig,
  runIdentityMailWorkerEnrollmentSelfTest,
} from "./identity-mail-worker-enrollment.mjs";

const BASE_ENVIRONMENT = Object.freeze({
  DATABASE_URL:
    "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public",
  IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE: "leetplus_ci",
  IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: "leetplus_identity_mail_worker",
  IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: "16384",
});

function checkConfig(overrides = {}) {
  return parseIdentityMailWorkerEnrollmentConfig(
    { ...BASE_ENVIRONMENT, ...overrides },
    "check",
  );
}

function functionSnapshot(entry, allowed) {
  return {
    ...entry,
    exists: true,
    ownerName: "migration_owner",
    actualSecurityDefiner: entry.securityDefiner,
    actualVolatility: entry.volatility,
    actualLanguage: entry.language,
    configuration: ["search_path=pg_catalog"],
    effectiveExecute: allowed,
    directExecute: allowed,
    directGrantOption: false,
    publicExecute: false,
  };
}

function compliantSnapshot(config = checkConfig()) {
  const remoteTls = config.transportPolicy === "REMOTE_STRICT_TLS";
  return {
    server: {
      databaseName: config.databaseName,
      currentUserName: "migration_owner",
      sessionUserName: "migration_owner",
      currentUserOid: 10n,
      sessionUserOid: 10n,
      databaseOwnerName: "migration_owner",
      databaseOwnerOid: 10n,
      serverVersionNumber: 160_014,
      tlsActive: remoteTls,
      tlsVersion: remoteTls ? "TLSv1.3" : null,
      tlsCipher: remoteTls ? "TLS_AES_256_GCM_SHA384" : null,
    },
    role: {
      oid: config.roleOid,
      canLogin: true,
      inherits: false,
      superuser: false,
      createsDatabase: false,
      createsRole: false,
      replication: false,
      bypassesRls: false,
      hasRoleConfiguration: false,
      databaseConnect: true,
      databaseCreate: false,
      databaseTemporary: false,
      publicSchemaUsage: true,
      publicSchemaCreate: false,
      membershipCount: 0,
      roleSettingCount: 0,
      ownershipCount: 0,
      directSchemaCreateCount: 0,
      effectiveSchemaUsageCount: 1,
      directRelationPrivilegeCount: 0,
      effectiveRelationPrivilegeCount: 0,
      directColumnPrivilegeCount: 0,
      effectiveColumnPrivilegeCount: 0,
      directSequencePrivilegeCount: 0,
      effectiveSequencePrivilegeCount: 0,
      directFunctionExecuteCount: 5,
      effectiveFunctionExecuteCount: 5,
      liveActivationBindingCount: 0,
      liveMarkerBindingCount: 0,
    },
    migration: {
      completedTargetCount: 1,
      completedCount: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
      unfinishedCount: 0,
      latestCompletedMigration: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
    },
    enrollment: {
      totalCount: 0,
      enabledCount: 0,
    },
    allowedFunctions: IDENTITY_MAIL_WORKER_FUNCTIONS.map((entry) =>
      functionSnapshot(entry, true),
    ),
    deniedFunctions: IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS.map((entry) =>
      functionSnapshot(entry, false),
    ),
  };
}

test("pins terminal CURRENT_184 and exactly five CURRENT_176 worker RPCs", () => {
  assert.equal(
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
    "20260818010000_founder_owner_invite_reissue_v1",
  );
  assert.equal(IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT, 184);
  assert.deepEqual(
    IDENTITY_MAIL_WORKER_FUNCTIONS.map(({ key }) => key),
    ["workerAssert", "claim", "providerMark", "complete", "reap"],
  );
  assert.equal(IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS.length, 9);
  assert.equal(
    IDENTITY_MAIL_WORKER_FUNCTIONS[0].catalogSignature,
    'public."identity_mail_delivery_worker_assert_v1"(text)',
  );
  assert.equal(
    IDENTITY_MAIL_WORKER_FUNCTIONS[1].catalogSignature,
    'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
  );
  assert.equal(
    IDENTITY_MAIL_WORKER_FUNCTIONS[4].catalogSignature,
    'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
  );
});

test("parses exact database, role name and role OID", () => {
  const config = checkConfig();
  assert.equal(config.databaseName, "leetplus_ci");
  assert.equal(config.roleName, "leetplus_identity_mail_worker");
  assert.equal(config.roleOid, 16_384n);
  assert.equal(config.databaseHost, "127.0.0.1");
  assert.equal(config.transportPolicy, "LOOPBACK_PLAINTEXT");
});

test("accepts exact IPv6 loopback and remote strict TLS transport", () => {
  const ipv6 = checkConfig({
    DATABASE_URL:
      "postgresql://migration:secret@[::1]:5432/leetplus_ci?schema=public",
  });
  assert.equal(ipv6.databaseHost, "[::1]");
  assert.equal(ipv6.transportPolicy, "LOOPBACK_PLAINTEXT");

  const remote = checkConfig({
    DATABASE_URL:
      "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict",
  });
  assert.equal(remote.databaseHost, "db.example.test");
  assert.equal(remote.transportPolicy, "REMOTE_STRICT_TLS");
});

test("requires an exact apply confirmation bound to role OID and head", () => {
  const confirmation = expectedIdentityMailWorkerEnrollmentConfirmation(
    "leetplus_ci",
    "leetplus_identity_mail_worker",
    16_384n,
  );
  const config = parseIdentityMailWorkerEnrollmentConfig(
    {
      ...BASE_ENVIRONMENT,
      IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM: confirmation,
    },
    "apply",
  );
  assert.equal(config.requiredConfirmation, confirmation);
  assert.match(confirmation, / 16384 /u);
  assert.match(confirmation, /founder_owner_invite_reissue_v1 184$/u);
});

for (const [name, overrides, code] of [
  [
    "system database",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/postgres?schema=public",
      IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE: "postgres",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_INVALID",
  ],
  [
    "malformed database percent encoding",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/leetplus_%ZZ_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_INVALID",
  ],
  [
    "unexpected URL option",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public&sslmode=require",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "duplicate schema option",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public&schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "loopback TLS option",
    {
      DATABASE_URL:
        "postgresql://migration:secret@[::1]:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "localhost plaintext alias",
    {
      DATABASE_URL:
        "postgresql://migration:secret@localhost:5432/leetplus_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "normalized IPv4 shorthand",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.1:5432/leetplus_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote plaintext transport",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote weaker TLS",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=verify-full&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote missing strict acceptance",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote prefer TLS",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=prefer&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote disabled TLS",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=disable&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote invalid certificate acceptance",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=accept_invalid",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "duplicate remote TLS option",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslmode=require&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "duplicate remote certificate policy",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "remote extra option",
    {
      DATABASE_URL:
        "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict&application_name=worker",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    "URL fragment",
    {
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public#fragment",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_TARGET_INVALID",
  ],
  [
    "missing username",
    {
      DATABASE_URL:
        "postgresql://:secret@127.0.0.1:5432/leetplus_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
  ],
  [
    "whitespace username",
    {
      DATABASE_URL:
        "postgresql://%20migration:secret@127.0.0.1:5432/leetplus_ci?schema=public",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
  ],
  [
    "remote missing password",
    {
      DATABASE_URL:
        "postgresql://migration@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict",
    },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
  ],
  [
    "PUBLIC role",
    { IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: "public" },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_INVALID",
  ],
  [
    "system role",
    { IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: "pg_worker" },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_INVALID",
  ],
  [
    "zero role OID",
    { IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: "0" },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_OID_INVALID",
  ],
  [
    "overflow role OID",
    { IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: "4294967296" },
    "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_OID_INVALID",
  ],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => checkConfig(overrides),
      (error) =>
        error instanceof IdentityMailWorkerEnrollmentError &&
        error.code === code,
    );
  });
}

test("builds a role-preserving least-privilege transaction payload", () => {
  const config = checkConfig();
  const sql = buildIdentityMailWorkerEnrollmentStatements(config).join("\n");
  assert.doesNotMatch(sql, /\bCREATE\s+ROLE\b/iu);
  assert.doesNotMatch(sql, /\bALTER\s+ROLE\b/iu);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b[\s\S]*IdentityMailDeliveryTenantEnrollment/iu,
  );
  assert.match(sql, /CURRENT_USER <> SESSION_USER/u);
  assert.match(sql, /worker\.oid::BIGINT <> 16384::BIGINT/u);
  assert.match(sql, /worker\.rolcanlogin = false/u);
  assert.match(sql, /worker\.rolinherit = true/u);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA/u);
  assert.match(
    sql,
    /GRANT USAGE ON SCHEMA public TO "leetplus_identity_mail_worker"/u,
  );
  assert.equal((sql.match(/\bGRANT EXECUTE ON FUNCTION\b/gu) ?? []).length, 5);
  assert.equal((sql.match(/\bFROM PUBLIC\b/gu) ?? []).length, 14);
  for (const entry of IDENTITY_MAIL_WORKER_FUNCTIONS) {
    assert.match(
      sql,
      new RegExp(
        entry.grantSignature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
        "u",
      ),
    );
  }
});

test("accepts only the exact compliant static snapshot", () => {
  const config = checkConfig();
  const snapshot = compliantSnapshot(config);
  assert.deepEqual(
    identityMailWorkerEnrollmentPreconditionViolations(snapshot, config),
    [],
  );
  assert.deepEqual(
    identityMailWorkerEnrollmentComplianceViolations(snapshot),
    [],
  );
});

test("binds preconditions to actual loopback plaintext or remote TLS evidence", () => {
  const localConfig = checkConfig();
  const localTlsDrift = compliantSnapshot(localConfig);
  localTlsDrift.server.tlsActive = true;
  localTlsDrift.server.tlsVersion = "TLSv1.3";
  localTlsDrift.server.tlsCipher = "TLS_AES_256_GCM_SHA384";
  assert.ok(
    identityMailWorkerEnrollmentPreconditionViolations(
      localTlsDrift,
      localConfig,
    ).includes("LOOPBACK_PLAINTEXT_CONNECTION_REQUIRED"),
  );

  const remoteConfig = checkConfig({
    DATABASE_URL:
      "postgresql://migration:secret@db.example.test:5432/leetplus_ci?schema=public&sslmode=require&sslaccept=strict",
  });
  const remoteNoTls = compliantSnapshot(remoteConfig);
  remoteNoTls.server.tlsActive = false;
  remoteNoTls.server.tlsVersion = null;
  remoteNoTls.server.tlsCipher = null;
  assert.deepEqual(
    identityMailWorkerEnrollmentPreconditionViolations(
      remoteNoTls,
      remoteConfig,
    ).filter((violation) => violation.includes("TLS")),
    ["REMOTE_TLS_CONNECTION_REQUIRED", "REMOTE_TLS_EVIDENCE_MISSING"],
  );
});

test("rejects changed session identity, role OID and non-empty tenant enrollment", () => {
  const config = checkConfig();
  const snapshot = compliantSnapshot(config);
  snapshot.server.sessionUserName = "set_role_actor";
  snapshot.role.oid = 16_385n;
  snapshot.enrollment.totalCount = 1;
  assert.deepEqual(
    identityMailWorkerEnrollmentPreconditionViolations(snapshot, config),
    [
      "SESSION_USER_CHANGED",
      "ROLE_OID_MISMATCH",
      "TENANT_ENROLLMENT_NOT_EMPTY",
    ],
  );
});

test("rejects role authority and catalog drift before ACL mutation", () => {
  const config = checkConfig();
  const snapshot = compliantSnapshot(config);
  snapshot.role.inherits = true;
  snapshot.role.membershipCount = 1;
  snapshot.role.ownershipCount = 1;
  snapshot.role.databaseCreate = true;
  snapshot.role.databaseTemporary = true;
  snapshot.allowedFunctions[1].actualLanguage = "sql";
  assert.deepEqual(
    identityMailWorkerEnrollmentPreconditionViolations(snapshot, config),
    [
      "ROLE_INHERITS",
      "DATABASE_CREATE_PRESENT",
      "DATABASE_TEMPORARY_PRESENT",
      "ROLE_MEMBERSHIP",
      "ROLE_OWNS_OBJECT",
      "claim:LANGUAGE_MISMATCH",
    ],
  );
});

test("detects any privilege outside the five-function allowlist", () => {
  const snapshot = compliantSnapshot();
  snapshot.role.publicSchemaCreate = true;
  snapshot.role.effectiveSchemaUsageCount = 2;
  snapshot.role.directRelationPrivilegeCount = 1;
  snapshot.role.effectiveRelationPrivilegeCount = 1;
  snapshot.role.directColumnPrivilegeCount = 1;
  snapshot.role.effectiveColumnPrivilegeCount = 1;
  snapshot.role.directSequencePrivilegeCount = 1;
  snapshot.role.effectiveSequencePrivilegeCount = 1;
  snapshot.role.directFunctionExecuteCount = 6;
  snapshot.role.effectiveFunctionExecuteCount = 6;
  snapshot.deniedFunctions[0].effectiveExecute = true;
  snapshot.allowedFunctions[0].directGrantOption = true;
  assert.deepEqual(identityMailWorkerEnrollmentComplianceViolations(snapshot), [
    "EFFECTIVE_SCHEMA_USAGE_ALLOWLIST_MISMATCH",
    "PUBLIC_SCHEMA_CREATE_PRESENT",
    "DIRECT_RELATION_PRIVILEGE_PRESENT",
    "EFFECTIVE_RELATION_PRIVILEGE_PRESENT",
    "DIRECT_COLUMN_PRIVILEGE_PRESENT",
    "EFFECTIVE_COLUMN_PRIVILEGE_PRESENT",
    "DIRECT_SEQUENCE_PRIVILEGE_PRESENT",
    "EFFECTIVE_SEQUENCE_PRIVILEGE_PRESENT",
    "DIRECT_FUNCTION_ALLOWLIST_MISMATCH",
    "EFFECTIVE_FUNCTION_ALLOWLIST_MISMATCH",
    "workerAssert:GRANT_OPTION_PRESENT",
    "deliveryEventGuard:EXECUTE_PRESENT",
  ]);
});

test("contract digest is stable, non-secret and domain-shaped", () => {
  const digest = identityMailWorkerEnrollmentContractDigest();
  assert.match(digest, /^[0-9a-f]{64}$/u);
  assert.equal(digest, identityMailWorkerEnrollmentContractDigest());
});

test("migration contains the exact five updated RPC signatures", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260731020000_initial_owner_mail_delivery_boundary/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /identity_initial_owner_mail_claim_v1"\(\s*p_tenant_id TEXT,\s*p_lease_owner_digest TEXT,\s*p_lease_token_digest TEXT,\s*p_worker_config_digest TEXT\s*\)/u,
  );
  assert.match(
    migration,
    /identity_initial_owner_mail_reap_v1"\(\s*p_tenant_id TEXT,\s*p_worker_config_digest TEXT,\s*p_worker_actor_digest TEXT,\s*p_batch_limit INTEGER\s*\)/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE[\s\S]*identity_initial_owner_mail_claim_v1/iu,
  );
});

test("standalone self-test passes", () => {
  assert.doesNotThrow(() => runIdentityMailWorkerEnrollmentSelfTest());
});
