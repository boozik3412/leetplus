import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPLICATION_RUNTIME_FUNCTIONS,
  EXCLUDED_PENDING_FUNCTIONS,
  EXCLUDED_WORKER_FUNCTIONS,
  SEALED_RUNTIME_TABLES,
  RuntimeFunctionEnrollmentError,
  buildRuntimeFunctionEnrollmentStatements,
  expectedApplyConfirmation,
  parseRuntimeFunctionEnrollmentConfig,
  runRuntimeFunctionEnrollmentSelfTest,
  runtimeFunctionContractDigest,
  runtimeFunctionEnrollmentComplianceViolations,
  runtimeFunctionEnrollmentPreconditionViolations,
} from "./runtime-function-enrollment.mjs";

const SAFE_ENVIRONMENT = Object.freeze({
  DATABASE_URL:
    "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public",
  RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: "leetplus_ci",
  RUNTIME_FUNCTION_ENROLLMENT_ROLE: "leetplus_runtime",
});

function compliantSnapshot() {
  return {
    server: {
      databaseName: "leetplus_ci",
      currentUserName: "migration_owner",
      serverVersionNumber: 160014,
    },
    role: {
      canLogin: true,
      inherits: false,
      superuser: false,
      createsDatabase: false,
      createsRole: false,
      replication: false,
      bypassesRls: false,
      databaseConnect: true,
      schemaUsage: true,
      membershipCount: 0,
      ownershipCount: 0,
    },
    migration: {
      completedTargetCount: 1,
      completedRequiredCount: 1,
      completedCount: 168,
      unfinishedCount: 0,
      latestCompletedMigration:
        "20260729210000_identity_email_claim_write_boundary",
    },
    functions: [
      ...APPLICATION_RUNTIME_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        effectiveExecute: true,
        directExecute: true,
        targetGrantOption: false,
        publicExecute: false,
        grantorCanEnroll: true,
      })),
      ...EXCLUDED_WORKER_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        effectiveExecute: false,
        directExecute: false,
        targetGrantOption: false,
        publicExecute: false,
        grantorCanEnroll: true,
      })),
      ...EXCLUDED_PENDING_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        effectiveExecute: false,
        directExecute: false,
        targetGrantOption: false,
        publicExecute: false,
        grantorCanEnroll: true,
      })),
    ],
    sealedTables: SEALED_RUNTIME_TABLES.map((entry) => ({
      key: entry.key,
      catalogName: entry.catalogName,
      exists: true,
      ownerName: "migration_owner",
      canSelect: false,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      canTruncate: false,
      canReference: false,
      canTrigger: false,
      publicAnyPrivilege: false,
      grantorCanRevoke: true,
    })),
  };
}

test("parses a bounded check target without requiring mutation confirmation", () => {
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );
  assert.equal(config.mode, "check");
  assert.equal(config.databaseName, "leetplus_ci");
  assert.equal(config.roleName, "leetplus_runtime");
});

test("requires an exact database-and-role-bound confirmation for apply", () => {
  assert.throws(
    () =>
      parseRuntimeFunctionEnrollmentConfig(SAFE_ENVIRONMENT, "apply"),
    (error) =>
      error instanceof RuntimeFunctionEnrollmentError &&
      error.code === "RUNTIME_FUNCTION_ENROLLMENT_CONFIRMATION_INVALID",
  );

  const config = parseRuntimeFunctionEnrollmentConfig(
    {
      ...SAFE_ENVIRONMENT,
      RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
        "leetplus_ci",
        "leetplus_runtime",
      ),
    },
    "apply",
  );
  assert.equal(config.mode, "apply");
  assert.match(
    config.requiredConfirmation,
    /20260729210000_identity_email_claim_write_boundary 168$/u,
  );
});

for (const [environment, expectedCode] of [
  [
    {
      ...SAFE_ENVIRONMENT,
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public&options=-c%20search_path%3Devil",
    },
    "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
  ],
  [
    {
      ...SAFE_ENVIRONMENT,
      RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: "another_ci",
    },
    "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_MISMATCH",
  ],
  [
    {
      ...SAFE_ENVIRONMENT,
      RUNTIME_FUNCTION_ENROLLMENT_ROLE: "PUBLIC",
    },
    "RUNTIME_FUNCTION_ENROLLMENT_ROLE_INVALID",
  ],
  [
    {
      ...SAFE_ENVIRONMENT,
      RUNTIME_FUNCTION_ENROLLMENT_ROLE: "runtime-role",
    },
    "RUNTIME_FUNCTION_ENROLLMENT_ROLE_INVALID",
  ],
  [
    {
      ...SAFE_ENVIRONMENT,
      DATABASE_URL:
        "postgresql://migration:secret@127.0.0.1:5432/postgres?schema=public",
      RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: "postgres",
    },
    "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_INVALID",
  ],
]) {
  test(`rejects an unsafe enrollment target: ${expectedCode}`, () => {
    assert.throws(
      () => parseRuntimeFunctionEnrollmentConfig(environment, "check"),
      (error) =>
        error instanceof RuntimeFunctionEnrollmentError &&
        error.code === expectedCode,
    );
  });
}

test("builds only the exact application grants and worker exclusion", () => {
  const statements =
    buildRuntimeFunctionEnrollmentStatements("leetplus_runtime");
  assert.equal(statements.length, 15);
  assert.equal(
    statements.filter((statement) => statement.startsWith("GRANT EXECUTE"))
      .length,
    6,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE GRANT OPTION"),
    ).length,
    6,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE EXECUTE"),
    ).length,
    2,
  );

  const sql = statements.join("\n");
  assert.match(sql, /guest_game_delivery_transition_key_v1/u);
  assert.match(sql, /guest_game_reward_delivery_lock_v1/u);
  assert.match(sql, /guest_game_delivery_record_event_v1/u);
  assert.match(sql, /identity_email_claim_lock_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v1/u);
  assert.match(sql, /identity_email_claim_assert_invite_v1/u);
  assert.match(sql, /identity_email_claim_transition_v1/u);
  assert.match(sql, /identity_email_claim_release_v1/u);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityEmailClaim"/u,
  );
  assert.doesNotMatch(sql, /\bALL FUNCTIONS\b/iu);
  assert.doesNotMatch(sql, /\bALTER DEFAULT PRIVILEGES\b/iu);
  assert.doesNotMatch(sql, /\bTO PUBLIC\b/iu);
  assert.doesNotMatch(sql, /\bWITH GRANT OPTION\b/iu);
});

test("accepts the exact non-owner PostgreSQL 16 contract", () => {
  const snapshot = compliantSnapshot();
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );
  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    [],
  );
  assert.deepEqual(
    runtimeFunctionEnrollmentComplianceViolations(snapshot),
    [],
  );
});

test("detects authority, migration and function ACL drift independently", () => {
  const snapshot = compliantSnapshot();
  snapshot.role.inherits = true;
  snapshot.role.membershipCount = 1;
  snapshot.migration.unfinishedCount = 1;
  snapshot.functions.find(
    (entry) => entry.key === "deliveryTransitionKey",
  ).publicExecute = true;
  snapshot.functions.find(
    (entry) => entry.key === "rewardDeliveryLock",
  ).securityDefiner = true;
  snapshot.functions.find(
    (entry) => entry.key === "identityEmailClaimReserveInvite",
  ).searchPathPgCatalogOnly = false;
  snapshot.functions.find(
    (entry) => entry.key === "durableDeliveryEventWriter",
  ).effectiveExecute = true;
  snapshot.functions.find(
    (entry) => entry.key === "durableDeliveryEventWriter",
  ).directExecute = true;
  snapshot.functions.find(
    (entry) => entry.key === "identityEmailClaimDirectLock",
  ).effectiveExecute = true;
  snapshot.functions.find(
    (entry) => entry.key === "identityEmailClaimDirectLock",
  ).directExecute = true;
  snapshot.sealedTables[0].canSelect = true;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    [
      "RUNTIME_ROLE_MUST_NOINHERIT",
      "RUNTIME_ROLE_MEMBERSHIP_PRESENT",
      "DATABASE_HAS_UNFINISHED_MIGRATION",
      "deliveryTransitionKey:PUBLIC_EXECUTE_PRESENT",
      "rewardDeliveryLock:SECURITY_MODE_MISMATCH",
      "identityEmailClaimReserveInvite:SEARCH_PATH_MISMATCH",
    ],
  );
  assert.deepEqual(
    runtimeFunctionEnrollmentComplianceViolations(snapshot),
    [
      "durableDeliveryEventWriter:WORKER_EXECUTE_PRESENT",
      "identityEmailClaimDirectLock:PENDING_EXECUTE_PRESENT",
      "identityEmailClaim:DIRECT_TABLE_PRIVILEGE_PRESENT",
    ],
  );
});

test("binds enrollment to exact current migration 168 and exact count 168", () => {
  const snapshot = compliantSnapshot();
  snapshot.migration.latestCompletedMigration =
    "20260729120000_store_background_execution_fence";
  snapshot.migration.completedCount = 165;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    [
      "CURRENT_MIGRATION_MISMATCH",
      "CURRENT_MIGRATION_COUNT_MISMATCH",
    ],
  );
});

test("keeps the contract digest deterministic and runs the embedded self-test", () => {
  assert.match(runtimeFunctionContractDigest(), /^[0-9a-f]{64}$/u);
  assert.equal(
    runtimeFunctionContractDigest(),
    runtimeFunctionContractDigest(),
  );
  assert.doesNotThrow(() => runRuntimeFunctionEnrollmentSelfTest());
});

test("CLI source contains no role creation or broad function grant path", async () => {
  const source = await readFile(
    new URL("./runtime-function-enrollment.cli.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bCREATE ROLE\b/iu);
  assert.doesNotMatch(source, /\bALTER ROLE\b/iu);
  assert.doesNotMatch(source, /\bALL FUNCTIONS\b/iu);
  assert.doesNotMatch(source, /randomBytes|PASSWORD\s+/iu);
});
