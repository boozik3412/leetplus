import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPLICATION_RUNTIME_FUNCTIONS,
  EXCLUDED_ADMISSION_FUNCTIONS,
  EXCLUDED_PENDING_FUNCTIONS,
  EXCLUDED_WORKER_FUNCTIONS,
  SEALED_RUNTIME_TABLES,
  SEALED_RUNTIME_TYPES,
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
      completedCount: 172,
      unfinishedCount: 0,
      latestCompletedMigration:
        "20260730020000_shared_beta_admission_provenance",
    },
    functions: [
      ...APPLICATION_RUNTIME_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        expectedLanguage: entry.language ?? null,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        language: entry.language ?? "plpgsql",
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
        expectedLanguage: entry.language ?? null,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        language: entry.language ?? "plpgsql",
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
        expectedLanguage: entry.language ?? null,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        language: entry.language ?? "plpgsql",
        effectiveExecute: false,
        directExecute: false,
        targetGrantOption: false,
        publicExecute: false,
        grantorCanEnroll: true,
      })),
      ...EXCLUDED_ADMISSION_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        expectedLanguage: entry.language,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        searchPathPgCatalogOnly: true,
        volatility: entry.volatility,
        language: entry.language,
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
      expectedColumns: [...entry.columns],
      columnManifestMatches: true,
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
      publicAnyColumnPrivilege: false,
      columns: entry.columns.map((name) => ({
        name,
        canSelect: false,
        canInsert: false,
        canUpdate: false,
        canReference: false,
        directSelect: false,
        directInsert: false,
        directUpdate: false,
        directReference: false,
        publicAnyPrivilege: false,
      })),
      grantorCanRevoke: true,
    })),
    sealedTypes: SEALED_RUNTIME_TYPES.map((entry) => ({
      key: entry.key,
      catalogName: entry.catalogName,
      expectedLabels: [...entry.labels],
      labelManifestMatches: true,
      labels: [...entry.labels],
      exists: true,
      ownerName: "migration_owner",
      effectiveUsage: false,
      directUsage: false,
      targetGrantOption: false,
      publicUsage: false,
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
    () => parseRuntimeFunctionEnrollmentConfig(SAFE_ENVIRONMENT, "apply"),
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
    /20260730020000_shared_beta_admission_provenance 172$/u,
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

test("builds only the exact application grants and sealed exclusions", () => {
  const statements =
    buildRuntimeFunctionEnrollmentStatements("leetplus_runtime");
  assert.equal(APPLICATION_RUNTIME_FUNCTIONS.length, 7);
  assert.equal(EXCLUDED_ADMISSION_FUNCTIONS.length, 9);
  assert.equal(SEALED_RUNTIME_TABLES.length, 6);
  assert.equal(
    SEALED_RUNTIME_TABLES.reduce(
      (count, entry) => count + entry.columns.length,
      0,
    ),
    109,
  );
  assert.equal(SEALED_RUNTIME_TYPES.length, 1);
  assert.equal(statements.length, 55);
  assert.equal(
    statements.filter((statement) => statement.startsWith("GRANT EXECUTE"))
      .length,
    7,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE GRANT OPTION"),
    ).length,
    7,
  );
  assert.equal(
    statements.filter((statement) => statement.startsWith("REVOKE EXECUTE"))
      .length,
    15,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ("),
    ).length,
    12,
  );
  assert.equal(
    statements.filter(
      (statement) =>
        statement.startsWith("REVOKE ALL PRIVILEGES ON TABLE") &&
        statement.endsWith("FROM PUBLIC"),
    ).length,
    6,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ON TYPE"),
    ).length,
    2,
  );

  const sql = statements.join("\n");
  assert.match(sql, /guest_game_delivery_transition_key_v1/u);
  assert.match(sql, /guest_game_reward_delivery_lock_v1/u);
  assert.match(sql, /guest_game_delivery_record_event_v1/u);
  assert.match(sql, /identity_email_claim_lock_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v2/u);
  assert.match(sql, /identity_email_claim_assert_invite_v1/u);
  assert.match(sql, /identity_email_claim_assert_invite_locator_v1/u);
  assert.match(sql, /identity_email_claim_transition_v1/u);
  assert.match(sql, /identity_email_claim_release_v1/u);
  assert.match(sql, /identity_email_claim_transition_v2/u);
  assert.match(sql, /identity_email_claim_release_v2/u);
  assert.match(sql, /identity_owner_invite_issue_hold_v1/u);
  for (const entry of EXCLUDED_ADMISSION_FUNCTIONS) {
    assert.ok(
      statements.includes(
        `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM "leetplus_runtime"`,
      ),
    );
  }
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityEmailClaim"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityOwnerInviteIssueCommand"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailOutbox"/u,
  );
  for (const entry of SEALED_RUNTIME_TABLES) {
    const exactColumns = entry.columns
      .map((columnName) => `"${columnName}"`)
      .join(", ");
    assert.ok(
      statements.includes(
        `REVOKE ALL PRIVILEGES (${exactColumns}) ON TABLE ${entry.grantName} FROM "leetplus_runtime"`,
      ),
    );
    assert.ok(
      statements.includes(
        `REVOKE ALL PRIVILEGES (${exactColumns}) ON TABLE ${entry.grantName} FROM PUBLIC`,
      ),
    );
  }
  for (const entry of SEALED_RUNTIME_TYPES) {
    assert.ok(
      statements.includes(
        `REVOKE ALL PRIVILEGES ON TYPE ${entry.grantName} FROM "leetplus_runtime"`,
      ),
    );
    assert.ok(
      statements.includes(
        `REVOKE ALL PRIVILEGES ON TYPE ${entry.grantName} FROM PUBLIC`,
      ),
    );
  }
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
  assert.deepEqual(runtimeFunctionEnrollmentComplianceViolations(snapshot), []);
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
    (entry) => entry.key === "identityEmailClaimAssertInviteLocator",
  ).securityDefiner = false;
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
  snapshot.functions.find(
    (entry) => entry.key === "identityOwnerInviteIssueHold",
  ).effectiveExecute = true;
  snapshot.functions.find(
    (entry) => entry.key === "identityOwnerInviteIssueHold",
  ).directExecute = true;
  const admissionFunction = snapshot.functions.find(
    (entry) => entry.key === EXCLUDED_ADMISSION_FUNCTIONS[0].key,
  );
  admissionFunction.effectiveExecute = true;
  admissionFunction.directExecute = true;
  const admissionLanguageDrift = snapshot.functions.find(
    (entry) => entry.key === EXCLUDED_ADMISSION_FUNCTIONS[1].key,
  );
  admissionLanguageDrift.language = "internal";
  snapshot.sealedTables[0].canSelect = true;
  snapshot.sealedTables.find(
    (entry) => entry.key === "identityOwnerInviteIssueCommand",
  ).canInsert = true;
  snapshot.sealedTables.find(
    (entry) => entry.key === "identityMailOutbox",
  ).canSelect = true;
  snapshot.sealedTables[0].columns[0].canSelect = true;
  snapshot.sealedTables[0].columns[0].directSelect = true;
  const commandTable = snapshot.sealedTables.find(
    (entry) => entry.key === "identityOwnerInviteIssueCommand",
  );
  commandTable.columns[1].canUpdate = true;
  commandTable.columns[1].directUpdate = true;
  const outboxTable = snapshot.sealedTables.find(
    (entry) => entry.key === "identityMailOutbox",
  );
  outboxTable.publicAnyPrivilege = true;
  outboxTable.columns[2].canSelect = true;
  outboxTable.columns[2].publicAnyPrivilege = true;
  outboxTable.publicAnyColumnPrivilege = true;
  const admissionTable = snapshot.sealedTables[3];
  admissionTable.canDelete = true;
  const sealedType = snapshot.sealedTypes[0];
  sealedType.labelManifestMatches = false;
  sealedType.effectiveUsage = true;
  sealedType.directUsage = true;
  sealedType.publicUsage = true;
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
      "identityEmailClaimAssertInviteLocator:SECURITY_MODE_MISMATCH",
      `${admissionLanguageDrift.key}:LANGUAGE_MISMATCH`,
      `${sealedType.key}:ENUM_LABEL_MANIFEST_MISMATCH`,
    ],
  );
  assert.deepEqual(runtimeFunctionEnrollmentComplianceViolations(snapshot), [
    "durableDeliveryEventWriter:WORKER_EXECUTE_PRESENT",
    "identityEmailClaimDirectLock:PENDING_EXECUTE_PRESENT",
    "identityOwnerInviteIssueHold:PENDING_EXECUTE_PRESENT",
    `${admissionFunction.key}:ADMISSION_EXECUTE_PRESENT`,
    "identityEmailClaim:DIRECT_TABLE_PRIVILEGE_PRESENT",
    "identityEmailClaim:EFFECTIVE_COLUMN_PRIVILEGE_PRESENT",
    "identityEmailClaim:DIRECT_COLUMN_PRIVILEGE_PRESENT",
    "identityOwnerInviteIssueCommand:DIRECT_TABLE_PRIVILEGE_PRESENT",
    "identityOwnerInviteIssueCommand:EFFECTIVE_COLUMN_PRIVILEGE_PRESENT",
    "identityOwnerInviteIssueCommand:DIRECT_COLUMN_PRIVILEGE_PRESENT",
    "identityMailOutbox:DIRECT_TABLE_PRIVILEGE_PRESENT",
    "identityMailOutbox:PUBLIC_TABLE_PRIVILEGE_PRESENT",
    "identityMailOutbox:EFFECTIVE_COLUMN_PRIVILEGE_PRESENT",
    "identityMailOutbox:PUBLIC_COLUMN_PRIVILEGE_PRESENT",
    `${admissionTable.key}:DIRECT_TABLE_PRIVILEGE_PRESENT`,
    `${sealedType.key}:RUNTIME_TYPE_USAGE_PRESENT`,
    `${sealedType.key}:PUBLIC_TYPE_USAGE_PRESENT`,
  ]);
});

test("rejects any exact sealed-column manifest drift before enrollment", () => {
  const snapshot = compliantSnapshot();
  snapshot.sealedTables[0].columnManifestMatches = false;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    ["identityEmailClaim:COLUMN_MANIFEST_MISMATCH"],
  );
});

test("binds enrollment to exact current migration 172 and exact count 172", () => {
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
    ["CURRENT_MIGRATION_MISMATCH", "CURRENT_MIGRATION_COUNT_MISMATCH"],
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
