import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPLICATION_RUNTIME_FUNCTIONS,
  EXCLUDED_ADMISSION_FUNCTIONS,
  EXCLUDED_PENDING_FUNCTIONS,
  EXCLUDED_RUNTIME_RELEASE_FUNCTIONS,
  EXCLUDED_WORKER_FUNCTIONS,
  RUNTIME_RELEASE_SEALED_RUNTIME_TABLES,
  RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
  RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
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
      schemaCreate: false,
      membershipCount: 0,
      ownershipCount: 0,
      liveActivationChallengeBindingCount: 0,
      unrevokedActivationMarkerBindingCount: 0,
    },
    migration: {
      completedTargetCount: 1,
      completedRequiredCount: 1,
      completedCount: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
      unfinishedCount: 0,
      latestCompletedMigration: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
    },
    functions: [
      ...APPLICATION_RUNTIME_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        expectedLanguage: entry.language ?? null,
        expectedSearchPath: entry.enrollmentSearchPath ?? "pg_catalog",
        allowLegacyUnsetSearchPath:
          entry.allowLegacyUnsetSearchPath === true,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        functionConfig: [
          `search_path=${entry.enrollmentSearchPath ?? "pg_catalog"}`,
        ],
        searchPathUnset: false,
        searchPathMatchesExpected: true,
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
        expectedSearchPath: "pg_catalog",
        allowLegacyUnsetSearchPath: false,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        functionConfig: ["search_path=pg_catalog"],
        searchPathUnset: false,
        searchPathMatchesExpected: true,
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
        expectedSearchPath: "pg_catalog",
        allowLegacyUnsetSearchPath: false,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        functionConfig: ["search_path=pg_catalog"],
        searchPathUnset: false,
        searchPathMatchesExpected: true,
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
        expectedSearchPath: "pg_catalog",
        allowLegacyUnsetSearchPath: false,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        functionConfig: ["search_path=pg_catalog"],
        searchPathUnset: false,
        searchPathMatchesExpected: true,
        volatility: entry.volatility,
        language: entry.language,
        effectiveExecute: false,
        directExecute: false,
        targetGrantOption: false,
        publicExecute: false,
        grantorCanEnroll: true,
      })),
      ...EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map((entry) => ({
        key: entry.key,
        catalogSignature: entry.catalogSignature,
        expectedSecurityDefiner: entry.securityDefiner,
        expectedVolatility: entry.volatility,
        expectedLanguage: entry.language,
        expectedSearchPath: "pg_catalog",
        allowLegacyUnsetSearchPath: false,
        exists: true,
        ownerName: "migration_owner",
        securityDefiner: entry.securityDefiner,
        functionConfig: ["search_path=pg_catalog"],
        searchPathUnset: false,
        searchPathMatchesExpected: true,
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
      expectedPersistence: entry.expectedPersistence ?? null,
      columnManifestMatches: true,
      exists: true,
      ownerName: "migration_owner",
      persistence: entry.expectedPersistence ?? "p",
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
    /20260828190000_guest_support_bug_reports 188$/u,
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
  assert.equal(APPLICATION_RUNTIME_FUNCTIONS.length, 10);
  assert.equal(EXCLUDED_WORKER_FUNCTIONS.length, 6);
  assert.equal(EXCLUDED_PENDING_FUNCTIONS.length, 13);
  assert.equal(EXCLUDED_ADMISSION_FUNCTIONS.length, 9);
  assert.equal(EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length, 20);
  assert.equal(
    APPLICATION_RUNTIME_FUNCTIONS.length +
      EXCLUDED_WORKER_FUNCTIONS.length +
      EXCLUDED_PENDING_FUNCTIONS.length +
      EXCLUDED_ADMISSION_FUNCTIONS.length +
      EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
    58,
  );
  const updatedAdmissionGuard = EXCLUDED_ADMISSION_FUNCTIONS.find(
    (entry) =>
      entry.catalogSignature ===
      'public."shared_beta_tenant_admission_decision_guard_v1"()',
  );
  assert.deepEqual(
    {
      catalogSignature: updatedAdmissionGuard?.catalogSignature,
      securityDefiner: updatedAdmissionGuard?.securityDefiner,
      volatility: updatedAdmissionGuard?.volatility,
      language: updatedAdmissionGuard?.language,
    },
    {
      catalogSignature:
        'public."shared_beta_tenant_admission_decision_guard_v1"()',
      securityDefiner: false,
      volatility: "v",
      language: "plpgsql",
    },
  );
  assert.equal(
    new Set([
      ...EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map(
        ({ catalogSignature }) => catalogSignature,
      ),
      updatedAdmissionGuard.catalogSignature,
    ]).size,
    21,
  );
  const instanceAnchorGuard = EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.find(
    (entry) => entry.key === "shared_beta_runtime_instance_anchor_guard_v1",
  );
  assert.deepEqual(instanceAnchorGuard, {
    key: "shared_beta_runtime_instance_anchor_guard_v1",
    catalogSignature: 'public."shared_beta_runtime_instance_anchor_guard_v1"()',
    grantSignature: 'public."shared_beta_runtime_instance_anchor_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  });
  const databaseIdentityDigest = EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.find(
    (entry) => entry.key === "shared_beta_runtime_database_identity_digest_v1",
  );
  assert.equal(databaseIdentityDigest?.language, "plpgsql");
  assert.equal(RUNTIME_RELEASE_SEALED_RUNTIME_TABLES.length, 6);
  assert.equal(SEALED_RUNTIME_TABLES.length, 14);
  assert.equal(
    SEALED_RUNTIME_TABLES.reduce(
      (count, entry) => count + entry.columns.length,
      0,
    ),
    291,
  );
  const instanceAnchor = RUNTIME_RELEASE_SEALED_RUNTIME_TABLES.find(
    (entry) => entry.key === "sharedBetaRuntimeInstanceAnchor",
  );
  assert.deepEqual(instanceAnchor, {
    key: "sharedBetaRuntimeInstanceAnchor",
    catalogName: 'public."SharedBetaRuntimeInstanceAnchor"',
    grantName: 'public."SharedBetaRuntimeInstanceAnchor"',
    expectedPersistence: "u",
    columns: ["id", "anchorNonce", "createdAt"],
  });
  const activationCommand = RUNTIME_RELEASE_SEALED_RUNTIME_TABLES.find(
    (entry) => entry.key === "sharedBetaTenantActivationCommand",
  );
  assert.deepEqual(activationCommand.columns, [
    "id",
    "tenantId",
    "action",
    "requestId",
    "requestDigest",
    "decisionId",
    "markerId",
    "markerPayloadDigest",
    "markerGeneration",
    "buildProvenanceId",
    "actualContextDigest",
    "actualShellDigest",
    "reservationSubjectId",
    "reservationClaimRevision",
    "issueRequestId",
    "issueRequestDigest",
    "issueCommandId",
    "inviteId",
    "outboxId",
    "messageKey",
    "tokenHash",
    "secretCiphertextDigest",
    "workflowLocator",
    "activatedByUserId",
    "entitlementProfileRevision",
    "executionRevisionBefore",
    "executionRevisionAfter",
    "trialPolicyVersion",
    "trialDurationSeconds",
    "trialStartsAt",
    "trialEndsAt",
    "receipt",
    "createdTransactionId",
    "activatedAt",
  ]);
  assert.equal(SEALED_RUNTIME_TYPES.length, 2);
  assert.equal(
    statements.length,
    110 + EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
  );
  assert.equal(
    statements.filter((statement) => statement.startsWith("GRANT EXECUTE"))
      .length,
    10,
  );
  assert.equal(
    statements.filter((statement) => statement.startsWith("ALTER FUNCTION"))
      .length,
    2,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE GRANT OPTION"),
    ).length,
    10,
  );
  assert.equal(
    statements.filter((statement) => statement.startsWith("REVOKE EXECUTE"))
      .length,
    28 + EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ("),
    ).length,
    28,
  );
  assert.equal(
    statements.filter(
      (statement) =>
        statement.startsWith("REVOKE ALL PRIVILEGES ON TABLE") &&
        statement.endsWith("FROM PUBLIC"),
    ).length,
    14,
  );
  assert.equal(
    statements.filter((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ON TYPE"),
    ).length,
    4,
  );

  const sql = statements.join("\n");
  assert.match(sql, /guest_game_delivery_transition_key_v1/u);
  assert.match(sql, /guest_game_reward_delivery_lock_v1/u);
  assert.match(sql, /assert_staff_attachment_state/u);
  assert.match(sql, /resolve_staff_attachment_resource_scope/u);
  assert.match(
    sql,
    /ALTER FUNCTION public\."assert_staff_attachment_state"\(TEXT\) SET search_path TO pg_catalog, public, pg_temp/u,
  );
  assert.match(
    sql,
    /ALTER FUNCTION public\."resolve_staff_attachment_resource_scope"\(public\."StaffAttachmentResourceKind", TEXT\) SET search_path TO pg_catalog, public, pg_temp/u,
  );
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
  assert.match(sql, /identity_initial_owner_invite_delivery_assert_sent_v1/u);
  assert.match(sql, /identity_owner_invite_issue_hold_v1/u);
  for (const entry of EXCLUDED_WORKER_FUNCTIONS) {
    assert.ok(
      statements.includes(
        `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM "leetplus_runtime"`,
      ),
    );
    assert.ok(
      !statements.includes(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO "leetplus_runtime"`,
      ),
    );
  }
  for (const entry of EXCLUDED_PENDING_FUNCTIONS) {
    assert.ok(
      statements.includes(
        `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM "leetplus_runtime"`,
      ),
    );
    assert.ok(
      !statements.includes(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO "leetplus_runtime"`,
      ),
    );
  }
  for (const entry of EXCLUDED_ADMISSION_FUNCTIONS) {
    assert.ok(
      statements.includes(
        `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM "leetplus_runtime"`,
      ),
    );
  }
  for (const entry of EXCLUDED_RUNTIME_RELEASE_FUNCTIONS) {
    assert.ok(
      statements.includes(
        `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM "leetplus_runtime"`,
      ),
    );
    assert.ok(
      !statements.includes(
        `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO "leetplus_runtime"`,
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
  assert.match(sql, /"releasedAt"/u);
  assert.match(sql, /"providerAcknowledgeUntil"/u);
  assert.match(sql, /"terminalAckDigest"/u);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailDeliveryTenantEnrollment"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailDeliveryEvent"/u,
  );
  assert.match(sql, /"providerAuthorityDigest"/u);
  assert.match(sql, /"createdTransactionId"/u);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaBuildProvenance"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeInstanceAnchor"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseChallenge"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseMarker"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseState"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaTenantActivationCommand"/u,
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
  assert.match(sql, /public\."IdentityMailOutboxStatus"/u);
  assert.match(sql, /public\."SharedBetaReleaseGateCode"/u);
  assert.match(sql, /identity_mail_outbox_delivery_guard_v1/u);
  assert.doesNotMatch(sql, /identity_mail_outbox_release_guard_v1/u);
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
  ).searchPathMatchesExpected = false;
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
  const runtimeReleaseFunction = snapshot.functions.find(
    (entry) => entry.key === EXCLUDED_RUNTIME_RELEASE_FUNCTIONS[0].key,
  );
  runtimeReleaseFunction.effectiveExecute = true;
  runtimeReleaseFunction.directExecute = true;
  const runtimeReleaseLanguageDrift = snapshot.functions.find(
    (entry) => entry.key === EXCLUDED_RUNTIME_RELEASE_FUNCTIONS[1].key,
  );
  runtimeReleaseLanguageDrift.language = "internal";
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
      `${runtimeReleaseLanguageDrift.key}:LANGUAGE_MISMATCH`,
      `${sealedType.key}:ENUM_LABEL_MANIFEST_MISMATCH`,
    ],
  );
  assert.deepEqual(runtimeFunctionEnrollmentComplianceViolations(snapshot), [
    "identityEmailClaimReserveInvite:SEARCH_PATH_ENROLLMENT_MISSING",
    "durableDeliveryEventWriter:WORKER_EXECUTE_PRESENT",
    "identityEmailClaimDirectLock:PENDING_EXECUTE_PRESENT",
    "identityOwnerInviteIssueHold:PENDING_EXECUTE_PRESENT",
    `${admissionFunction.key}:ADMISSION_EXECUTE_PRESENT`,
    `${runtimeReleaseFunction.key}:RUNTIME_RELEASE_EXECUTE_PRESENT`,
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

test("admits only the exact legacy-unset attachment path for enrollment", () => {
  const legacySnapshot = compliantSnapshot();
  const helper = legacySnapshot.functions.find(
    (entry) => entry.key === "staffAttachmentStateAssert",
  );
  helper.functionConfig = null;
  helper.searchPathUnset = true;
  helper.searchPathMatchesExpected = false;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(legacySnapshot, config),
    [],
  );
  assert.deepEqual(
    runtimeFunctionEnrollmentComplianceViolations(legacySnapshot),
    ["staffAttachmentStateAssert:SEARCH_PATH_ENROLLMENT_MISSING"],
  );

  helper.functionConfig = ["search_path=public, pg_catalog"];
  helper.searchPathUnset = false;
  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(legacySnapshot, config),
    ["staffAttachmentStateAssert:SEARCH_PATH_MISMATCH"],
  );
});

test("rejects CREATE on public for the runtime role", () => {
  const snapshot = compliantSnapshot();
  snapshot.role.schemaCreate = true;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    ["RUNTIME_ROLE_SCHEMA_CREATE_PRESENT"],
  );
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

test("rejects a logged replacement for the unlogged runtime instance anchor", () => {
  const snapshot = compliantSnapshot();
  const instanceAnchor = snapshot.sealedTables.find(
    (entry) => entry.key === "sharedBetaRuntimeInstanceAnchor",
  );
  instanceAnchor.persistence = "p";
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(snapshot, config),
    ["sharedBetaRuntimeInstanceAnchor:PERSISTENCE_MISMATCH"],
  );
});

test("rejects every activation-bound role before general enrollment", () => {
  const challengeBound = compliantSnapshot();
  challengeBound.role.liveActivationChallengeBindingCount = 1;
  const markerBound = compliantSnapshot();
  markerBound.role.unrevokedActivationMarkerBindingCount = 1;
  const config = parseRuntimeFunctionEnrollmentConfig(
    SAFE_ENVIRONMENT,
    "check",
  );

  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(challengeBound, config),
    ["RUNTIME_ROLE_BOUND_TO_LIVE_ACTIVATION_CHALLENGE"],
  );
  assert.deepEqual(
    runtimeFunctionEnrollmentPreconditionViolations(markerBound, config),
    ["RUNTIME_ROLE_BOUND_TO_UNREVOKED_ACTIVATION_MARKER"],
  );
});

test("binds enrollment to exact terminal migration 188 and exact count 188", () => {
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
