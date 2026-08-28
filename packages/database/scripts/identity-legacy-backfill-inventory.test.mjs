import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APPLIED_MIGRATION_STATE_SQL,
  CATALOG_STATE_SQL,
  EXPECTED_PRISMA_CLIENT_VERSION,
  FINDING_MANIFEST,
  HMAC_KEY_VERSION,
  INVENTORY_SQL,
  PRIVILEGE_STATE_SQL,
  PRODUCTION_ATTESTATION,
  REQUIRED_COLUMN_SELECTS,
  RUN_CONFIRMATION,
  SNAPSHOT_STATE_SQL,
  assertRuntimeDependencyVersions,
  buildCatalogState,
  buildInventoryState,
  buildMigrationSourceArtifact,
  buildMigrationState,
  buildPrivilegeState,
  buildReadOnlyDatabaseUrl,
  buildReport,
  exitCodeForReport,
  inspectDatabase,
  loadExpectedMigrationArtifact,
  parseArguments,
  parseRuntimeContract,
  releaseRuntimePathMatches,
} from "./identity-legacy-backfill-inventory.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
} from "./staff-task-integrity-migration-state.mjs";
import {
  SHARED_BETA_ADMISSION_COLUMNS,
  SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS,
  SHARED_BETA_ADMISSION_DORMANT_RELATIONS,
  SHARED_BETA_ADMISSION_DORMANT_TYPES,
  SHARED_BETA_ADMISSION_FUNCTIONS,
  SHARED_BETA_ADMISSION_RELATIONS,
} from "./shared-beta-admission-provenance-catalog.mjs";
import { EXCLUDED_RUNTIME_RELEASE_FUNCTIONS } from "./runtime-function-enrollment.mjs";

const METRIC_CODES = Object.freeze([
  "USER_TOTAL",
  "LIVE_INVITE_TOTAL",
  "ACCEPTED_INVITE_TOTAL",
  "REVOKED_INVITE_TOTAL",
  "EXPIRED_INVITE_TOTAL",
  "INVALID_INVITE_STATE_TOTAL",
  "IDENTITY_CLAIM_TOTAL",
]);

const FIXED_AS_OF = new Date("2026-07-29T12:00:00.000Z");
const FIXED_GENERATED_AT = new Date("2026-07-29T12:00:01.000Z");

function runtimeEnvironment(overrides = {}) {
  return {
    NODE_ENV: "test",
    DATABASE_URL:
      "postgresql://identity_reader:fixture_secret@127.0.0.1:5432/identity_inventory_ci?schema=public",
    RELEASE_SHA: "a".repeat(40),
    IDENTITY_LEGACY_INVENTORY_TARGET: "development",
    IDENTITY_LEGACY_INVENTORY_CONFIRM: RUN_CONFIRMATION,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE: "identity_inventory_ci",
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY:
      "identity-inventory-test-key-aaaaaaaaaaaa",
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION: HMAC_KEY_VERSION,
    ...overrides,
  };
}

function expectedMigrationArtifact() {
  const migrationNames = Array.from(
    { length: CURRENT_EXPECTED_MIGRATION_COUNT },
    (_, index) =>
      index === CURRENT_EXPECTED_MIGRATION_COUNT - 1
        ? CURRENT_EXPECTED_LATEST_MIGRATION
        : `${String(index).padStart(14, "0")}_identity_inventory_test`,
  );
  return buildMigrationSourceArtifact(
    migrationNames,
    migrationNames.map((migrationName) => ({
      path: `packages/database/prisma/migrations/${migrationName}/migration.sql`,
      content: Buffer.from(`-- fixture ${migrationName}\n`, "utf8"),
    })),
  );
}

function appliedMigrationRows(artifact = expectedMigrationArtifact()) {
  return artifact.migrationNames.map((migrationName, index) => ({
    migration_name: migrationName,
    checksum: artifact.migrationChecksums[index],
    finished_at: new Date("2026-07-29T00:00:00.000Z"),
    rolled_back_at: null,
  }));
}

function catalogRow(overrides = {}) {
  return {
    expected_relation_count: "11",
    matched_relation_count: "11",
    dormant_relation_owner_mismatch_count: "0",
    dormant_relation_nonowner_acl_count: "0",
    dormant_column_nonowner_acl_count: "0",
    dormant_function_owner_mismatch_count: "0",
    dormant_function_nonowner_acl_count: "0",
    dormant_type_owner_mismatch_count: "0",
    dormant_type_nonowner_acl_count: "0",
    expected_column_count: "177",
    matched_column_count: "177",
    expected_exact_identity_column_count: "154",
    actual_exact_identity_column_count: "154",
    matched_constraint_count: "83",
    actual_constraint_count: "83",
    matched_index_count: "48",
    actual_index_count: "48",
    matched_function_count: "46",
    actual_function_count: "46",
    matched_enum_label_count: "15",
    total_enum_label_count: "15",
    matched_trigger_count: "9",
    actual_identity_trigger_count: "9",
    matched_ri_trigger_count: "56",
    actual_ri_trigger_count: "56",
    ...overrides,
  };
}

function privilegeRow(overrides = {}) {
  return {
    session_role_unchanged: true,
    transaction_read_only: true,
    repeatable_read: true,
    role_can_login: true,
    role_inherits: false,
    role_superuser: false,
    role_can_create_role: false,
    role_can_create_database: false,
    role_replication: false,
    role_bypass_rls: false,
    database_owner: false,
    public_schema_owner: false,
    current_database_connect_privilege: true,
    current_database_connect_grant_option: false,
    database_create_privilege: false,
    database_temp_privilege: false,
    public_schema_usage_privilege: true,
    public_schema_usage_grant_option: false,
    public_schema_create_privilege: false,
    role_membership_count: "0",
    owned_database_count: "0",
    owned_schema_count: "0",
    owned_relation_count: "0",
    owned_function_count: "0",
    owned_type_count: "0",
    ownership_dependency_count: "0",
    other_database_connect_count: "0",
    explicit_other_database_connect_count: "0",
    non_public_schema_usage_count: "0",
    non_public_schema_create_count: "0",
    system_schema_create_count: "0",
    system_schema_privilege_count: "0",
    system_object_privilege_count: "0",
    system_security_definer_function_count: "0",
    system_high_oid_executable_function_count: "0",
    writable_relation_count: "0",
    table_select_relation_count: "0",
    excess_select_column_count: "0",
    table_select_grant_option_count: "0",
    column_select_grant_option_count: "0",
    required_relation_missing_count: "0",
    required_select_missing_count: "0",
    required_relation_rls_count: "0",
    public_relation_privilege_count: "0",
    public_column_privilege_count: "0",
    sequence_privilege_count: "0",
    executable_user_function_count: "0",
    dormant_type_usage_count: "0",
    foreign_server_usage_count: "0",
    foreign_data_wrapper_usage_count: "0",
    parameter_privilege_count: "0",
    large_object_privilege_count: "0",
    ...overrides,
  };
}

function snapshotRow(overrides = {}) {
  return {
    generated_at: FIXED_AS_OF,
    current_schema: "public",
    current_database: "identity_inventory_ci",
    current_role: "identity_reader",
    session_role: "identity_reader",
    cluster_system_identifier: "1234567890123456789",
    database_oid: "16384",
    server_version_num: "160009",
    transport_encrypted: false,
    ...overrides,
  };
}

function aggregateRows(overrides = {}, metricOverrides = {}) {
  const counts = Object.fromEntries(
    Object.keys(FINDING_MANIFEST).map((code) => [code, 0]),
  );
  Object.assign(counts, overrides);
  return [
    ...Object.entries(FINDING_MANIFEST).map(([code, severity]) => ({
      row_type: "FINDING",
      code,
      severity,
      count: String(counts[code]),
    })),
    ...METRIC_CODES.map((code) => ({
      row_type: "METRIC",
      code,
      severity: null,
      count: String(metricOverrides[code] ?? 0),
    })),
  ];
}

function admittedStates() {
  const artifact = expectedMigrationArtifact();
  return {
    migrationState: buildMigrationState(
      artifact,
      appliedMigrationRows(artifact),
    ),
    catalogState: buildCatalogState(catalogRow()),
    privilegeState: buildPrivilegeState(privilegeRow()),
  };
}

function reportForInventory(inventoryState, overrides = {}) {
  const config = parseRuntimeContract(runtimeEnvironment());
  return {
    config,
    report: buildReport({
      config,
      snapshotRow: snapshotRow(),
      ...admittedStates(),
      inventoryState,
      generatedAt: FIXED_GENERATED_AT,
      ...overrides,
    }),
  };
}

function contractCode(error) {
  return error?.code;
}

test("CLI and runtime contract require explicit identity inventory authority", () => {
  assert.deepEqual(parseArguments(["--pretty"]), {
    help: false,
    selfTest: false,
    verifyReleaseArtifact: false,
    pretty: true,
  });
  assert.deepEqual(parseArguments(["--self-test", "--pretty"]), {
    help: false,
    selfTest: true,
    verifyReleaseArtifact: false,
    pretty: true,
  });
  assert.deepEqual(parseArguments(["--verify-release-artifact"]), {
    help: false,
    selfTest: false,
    verifyReleaseArtifact: true,
    pretty: false,
  });
  assert.throws(
    () => parseArguments(["--self-test", "--verify-release-artifact"]),
    { code: "CLI_MODE_CONFLICT" },
  );
  assert.throws(() => parseArguments(["--apply"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });
  assert.throws(() => parseArguments(["--fix"]), {
    code: "CLI_ARGUMENT_UNSUPPORTED",
  });

  const config = parseRuntimeContract(runtimeEnvironment());
  assert.equal(config.target, "development");
  assert.equal(config.nodeEnvironment, "test");
  assert.equal(config.productionAttested, false);
  assert.equal(config.hmacKeyVersion, "v1");
  assert.equal(config.connectTimeoutSeconds, 10);
  assert.equal(config.lockTimeoutMs, 500);
  assert.equal(config.statementTimeoutMs, 30_000);
  assert.equal(config.transactionTimeoutMs, 120_000);

  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          IDENTITY_LEGACY_INVENTORY_CONFIRM: "not-confirmed",
        }),
      ),
    { code: "RUN_CONFIRMATION_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          RELEASE_SHA: "A".repeat(40),
        }),
      ),
    { code: "RELEASE_SHA_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE: "other_database",
        }),
      ),
    { code: "EXPECTED_DATABASE_URL_MISMATCH" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          IDENTITY_LEGACY_INVENTORY_HMAC_KEY: "too-short",
        }),
      ),
    { code: "HMAC_KEY_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION: "v2",
        }),
      ),
    { code: "HMAC_KEY_VERSION_INVALID" },
  );
});

test("production requires target agreement and the exact attestation", () => {
  const production = runtimeEnvironment({
    NODE_ENV: "production",
    IDENTITY_LEGACY_INVENTORY_TARGET: "production",
  });
  assert.throws(() => parseRuntimeContract(production), {
    code: "PRODUCTION_ATTESTATION_REQUIRED",
  });

  const admitted = parseRuntimeContract({
    ...production,
    DATABASE_URL:
      "postgresql://identity_reader:secret@db.example.test:5432/identity_inventory_ci?schema=public&sslmode=require&sslaccept=strict",
    IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION: PRODUCTION_ATTESTATION,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST: "d".repeat(64),
  });
  assert.equal(admitted.productionAttested, true);
  assert.equal(admitted.target, "production");
  assert.equal(admitted.transportEncryptionRequired, true);
  assert.equal(admitted.expectedDatabaseIdentityDigest, "d".repeat(64));

  assert.throws(
    () =>
      parseRuntimeContract({
        ...production,
        IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
          PRODUCTION_ATTESTATION,
      }),
    { code: "EXPECTED_DATABASE_IDENTITY_DIGEST_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract({
        ...production,
        IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
          PRODUCTION_ATTESTATION,
        IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST: "d".repeat(
          64,
        ),
      }),
    { code: "STRICT_TLS_REQUIRED" },
  );

  assert.throws(
    () =>
      parseRuntimeContract({
        ...production,
        DATABASE_URL:
          "postgresql://identity_reader:secret@db.example.test:5432/identity_inventory_ci?schema=public&sslmode=require&sslaccept=accept_invalid_certs",
        IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
          PRODUCTION_ATTESTATION,
        IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST: "d".repeat(
          64,
        ),
      }),
    { code: "STRICT_TLS_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract({
        ...production,
        DATABASE_URL:
          "postgresql://identity_reader:secret@db.example.test:5432/identity_inventory_ci?schema=public&sslmode=require&sslmode=prefer&sslaccept=strict",
        IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
          PRODUCTION_ATTESTATION,
        IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST: "d".repeat(
          64,
        ),
      }),
    { code: "DATABASE_URL_PARAMETER_DUPLICATE" },
  );

  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          NODE_ENV: "production",
          IDENTITY_LEGACY_INVENTORY_TARGET: "staging",
          IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
            PRODUCTION_ATTESTATION,
        }),
      ),
    { code: "PRODUCTION_TARGET_MISMATCH" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        runtimeEnvironment({
          NODE_ENV: "test",
          IDENTITY_LEGACY_INVENTORY_TARGET: "production",
          IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION:
            PRODUCTION_ATTESTATION,
        }),
      ),
    { code: "PRODUCTION_TARGET_MISMATCH" },
  );
});

test("remote non-production inventory also requires strict Prisma TLS", () => {
  const remote = runtimeEnvironment({
    DATABASE_URL:
      "postgresql://identity_reader:secret@staging.example.test:5432/identity_inventory_ci?schema=public",
    IDENTITY_LEGACY_INVENTORY_TARGET: "staging",
  });
  assert.throws(() => parseRuntimeContract(remote), {
    code: "STRICT_TLS_REQUIRED",
  });
  const admitted = parseRuntimeContract({
    ...remote,
    DATABASE_URL:
      "postgresql://identity_reader:secret@staging.example.test:5432/identity_inventory_ci?schema=public&sslmode=require&sslaccept=strict",
  });
  assert.equal(admitted.transportEncryptionRequired, true);
  assert.equal(
    new URL(admitted.databaseUrl).searchParams.get("sslaccept"),
    "strict",
  );
  assert.throws(
    () =>
      parseRuntimeContract({
        ...remote,
        DATABASE_URL:
          "postgresql://identity_reader:secret@staging.example.test:5432/identity_inventory_ci?schema=public&host=/tmp/postgresql&sslmode=require&sslaccept=strict",
      }),
    { code: "DATABASE_URL_HOST_OVERRIDE_UNSUPPORTED" },
  );
});

test("production report requires both approved database identity and encrypted transport", () => {
  const inventoryState = buildInventoryState(aggregateRows());
  const developmentReport = reportForInventory(inventoryState).report;
  const productionEnvironment = runtimeEnvironment({
    NODE_ENV: "production",
    IDENTITY_LEGACY_INVENTORY_TARGET: "production",
    DATABASE_URL:
      "postgresql://identity_reader:secret@db.example.test:5432/identity_inventory_ci?schema=public&sslmode=require&sslaccept=strict",
    IDENTITY_LEGACY_INVENTORY_PRODUCTION_ATTESTATION: PRODUCTION_ATTESTATION,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST:
      developmentReport.database.databaseIdentityDigest,
  });
  const productionConfig = parseRuntimeContract(productionEnvironment);
  const admitted = buildReport({
    config: productionConfig,
    snapshotRow: snapshotRow({ transport_encrypted: true }),
    ...admittedStates(),
    inventoryState,
    generatedAt: FIXED_GENERATED_AT,
  });
  assert.equal(admitted.summary.decision, "PASS");
  assert.equal(admitted.database.databaseIdentityDigestMatched, true);
  assert.equal(admitted.database.transportEncryptionMatched, true);

  const wrongIdentityConfig = parseRuntimeContract({
    ...productionEnvironment,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE_IDENTITY_DIGEST: "d".repeat(64),
  });
  const rejectedIdentity = buildReport({
    config: wrongIdentityConfig,
    snapshotRow: snapshotRow({ transport_encrypted: true }),
    ...admittedStates(),
    inventoryState: null,
    generatedAt: FIXED_GENERATED_AT,
  });
  assert.deepEqual(rejectedIdentity.summary.schemaRejectionCodes, [
    "DATABASE_IDENTITY_DIGEST_MISMATCH",
  ]);

  const rejectedTransport = buildReport({
    config: productionConfig,
    snapshotRow: snapshotRow({ transport_encrypted: false }),
    ...admittedStates(),
    inventoryState: null,
    generatedAt: FIXED_GENERATED_AT,
  });
  assert.deepEqual(rejectedTransport.summary.schemaRejectionCodes, [
    "ENCRYPTED_TRANSPORT_REQUIRED",
  ]);
});

test("timeouts are bounded and embedded in the one-connection read-only URL", () => {
  const environment = runtimeEnvironment({
    IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS: "7",
    IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS: "700",
    IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS: "17000",
    IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS: "70000",
  });
  const config = parseRuntimeContract(environment);
  assert.equal(config.connectTimeoutSeconds, 7);
  assert.equal(config.lockTimeoutMs, 700);
  assert.equal(config.statementTimeoutMs, 17_000);
  assert.equal(config.transactionTimeoutMs, 70_000);

  const url = new URL(
    buildReadOnlyDatabaseUrl(environment.DATABASE_URL, config),
  );
  assert.equal(url.searchParams.get("schema"), "public");
  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.equal(url.searchParams.get("connect_timeout"), "7");
  const options = url.searchParams.get("options");
  assert.match(options, /default_transaction_read_only=on/u);
  assert.match(options, /timezone=UTC/u);
  assert.match(options, /lock_timeout=700/u);
  assert.match(options, /statement_timeout=17000/u);
  assert.match(options, /idle_in_transaction_session_timeout=70000/u);

  for (const [name, value, expectedCode] of [
    [
      "IDENTITY_LEGACY_INVENTORY_CONNECT_TIMEOUT_SECONDS",
      "0",
      "CONNECT_TIMEOUT_INVALID",
    ],
    ["IDENTITY_LEGACY_INVENTORY_LOCK_TIMEOUT_MS", "99", "LOCK_TIMEOUT_INVALID"],
    [
      "IDENTITY_LEGACY_INVENTORY_STATEMENT_TIMEOUT_MS",
      "999",
      "STATEMENT_TIMEOUT_INVALID",
    ],
    [
      "IDENTITY_LEGACY_INVENTORY_TRANSACTION_TIMEOUT_MS",
      "600001",
      "TRANSACTION_TIMEOUT_INVALID",
    ],
  ]) {
    assert.throws(
      () => parseRuntimeContract(runtimeEnvironment({ [name]: value })),
      (error) => contractCode(error) === expectedCode,
    );
  }
});

test("the manifest exposes exactly two create-only proposal codes and exact column ACL", () => {
  assert.equal(CURRENT_EXPECTED_MIGRATION_COUNT, 188);
  assert.equal(
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "20260828190000_guest_support_bug_reports",
  );
  assert.deepEqual(
    Object.entries(FINDING_MANIFEST)
      .filter(([, severity]) => severity === "PROPOSAL")
      .map(([code]) => code)
      .sort(),
    ["LIVE_INVITE_CLAIM_CREATE_CANDIDATE", "USER_CLAIM_CREATE_CANDIDATE"],
  );
  assert.doesNotMatch(
    JSON.stringify(FINDING_MANIFEST),
    /REVISION_ATTACH|APPLY|FIX/iu,
  );
  assert.deepEqual(REQUIRED_COLUMN_SELECTS, {
    _prisma_migrations: [
      "migration_name",
      "checksum",
      "finished_at",
      "rolled_back_at",
    ],
    User: [
      "id",
      "tenantId",
      "email",
      "identityClaimRevision",
      "isPlatformAdmin",
      "emailVerifiedAt",
    ],
    UserInvite: [
      "id",
      "tenantId",
      "email",
      "acceptedAt",
      "acceptedByUserId",
      "revokedAt",
      "expiresAt",
      "identityClaimRevision",
    ],
    IdentityEmailClaim: [
      "emailCanonical",
      "claimType",
      "tenantId",
      "subjectId",
      "revision",
    ],
  });
  assert.equal(Object.hasOwn(REQUIRED_COLUMN_SELECTS, "Tenant"), false);
  assert.equal(
    REQUIRED_COLUMN_SELECTS._prisma_migrations.includes("checksum"),
    true,
  );
  assert.equal(
    REQUIRED_COLUMN_SELECTS.IdentityEmailClaim.includes("workflowLocator"),
    false,
  );
  assert.equal(SHARED_BETA_ADMISSION_RELATIONS.length, 3);
  assert.equal(SHARED_BETA_ADMISSION_COLUMNS.length, 64);
  assert.equal(SHARED_BETA_ADMISSION_FUNCTIONS.length, 9);
  assert.equal(SHARED_BETA_ADMISSION_DORMANT_TYPES.length, 1);
  assert.deepEqual(
    [...SHARED_BETA_ADMISSION_DORMANT_RELATIONS].sort(),
    [...SHARED_BETA_ADMISSION_RELATIONS].sort(),
  );
  assert.deepEqual(
    [...SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS].sort(),
    SHARED_BETA_ADMISSION_FUNCTIONS.map((entry) => entry.name).sort(),
  );
  assert.equal(
    SHARED_BETA_ADMISSION_FUNCTIONS.some(
      (entry) => entry.volatility === "s" && entry.language === "sql",
    ),
    true,
  );
  assert.equal(
    SHARED_BETA_ADMISSION_RELATIONS.every(
      (relationName) => !Object.hasOwn(REQUIRED_COLUMN_SELECTS, relationName),
    ),
    true,
  );
  for (const unsafePrivilege of [
    { current_database_connect_grant_option: true },
    { public_schema_usage_grant_option: true },
    { non_public_schema_create_count: "1" },
    { owned_type_count: "1" },
    { ownership_dependency_count: "1" },
    { system_schema_create_count: "1" },
    { system_schema_privilege_count: "1" },
    { system_object_privilege_count: "1" },
    { system_security_definer_function_count: "1" },
    { system_high_oid_executable_function_count: "1" },
    { writable_relation_count: "1" },
    { dormant_type_usage_count: "1" },
    { foreign_data_wrapper_usage_count: "1" },
    { parameter_privilege_count: "1" },
  ]) {
    assert.equal(
      buildPrivilegeState(privilegeRow(unsafePrivilege)).ready,
      false,
    );
  }
  for (const catalogDrift of [
    { dormant_relation_owner_mismatch_count: "1" },
    { dormant_relation_nonowner_acl_count: "1" },
    { dormant_column_nonowner_acl_count: "1" },
    { dormant_function_owner_mismatch_count: "1" },
    { dormant_function_nonowner_acl_count: "1" },
    { dormant_type_owner_mismatch_count: "1" },
    { dormant_type_nonowner_acl_count: "1" },
    { matched_column_count: "176" },
    { actual_exact_identity_column_count: "155" },
    { matched_constraint_count: "82" },
    { actual_index_count: "49" },
    { actual_function_count: "47" },
    { total_enum_label_count: "10" },
    { actual_identity_trigger_count: "10" },
    { matched_ri_trigger_count: "55" },
    { actual_ri_trigger_count: "57" },
  ]) {
    assert.equal(buildCatalogState(catalogRow(catalogDrift)).ready, false);
  }
  assert.match(CATALOG_STATE_SQL, /pg_catalog\.sha256/iu);
  assert.match(CATALOG_STATE_SQL, /pg_get_function_identity_arguments/iu);
  assert.match(CATALOG_STATE_SQL, /workflowLocator/u);
  assert.match(CATALOG_STATE_SQL, /IdentityEmailClaim_workflow_locator_check/u);
  assert.match(
    CATALOG_STATE_SQL,
    /abcebbd5b0ea9e9a36afcbdecdab1eed408283728a9d3c934dbf216a32e8a645/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /a9a330b5ed46e578cffd7eda8846fe5b04b4c2fd74a0d46c69ae6e3a0002b7bc/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /6e0abd4cccc01c0a8412c04faee92b9ec93984ccc9a840557178b27837422096/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /identity_email_claim_workflow_locator_uidx/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /b06323d8a990d2e1d76457425cf9051e08d916ee5f25d0649836186a53dbf920/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /identity_email_claim_assert_invite_locator_v1/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /requested_workflow_locator text, expected_tenant_id text, expected_subject_id text, expected_revision integer/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /f0da633f430e049b5577070b0e665a7911f1ef053011eeeeb43baa0e72cd4fa5/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /433e282c5ce0920ebad6d1ced19220f870e3944d84ed6a0e7ddb7d53fd9cd411/u,
  );
  assert.match(CATALOG_STATE_SQL, /IdentityEmailClaim_revision_guard_trigger/u);
  assert.match(
    CATALOG_STATE_SQL,
    /388dcc06ff27451656b844d302b4a536f7720062f470f0c2b8befd884be9c6a7/u,
  );
  assert.match(CATALOG_STATE_SQL, /IdentityOwnerInviteIssueCommand/u);
  assert.match(CATALOG_STATE_SQL, /IdentityMailOutbox/u);
  assert.match(CATALOG_STATE_SQL, /IdentityMailDeliveryEvent/u);
  assert.match(CATALOG_STATE_SQL, /actorDigest/u);
  assert.match(
    CATALOG_STATE_SQL,
    /f7e062b75bbbd5789da016e0a2c56df31356acbc73ebe38dc348dbe3af470df9/u,
  );
  assert.match(CATALOG_STATE_SQL, /identity_mail_delivery_event_append_v1/u);
  assert.match(
    CATALOG_STATE_SQL,
    /35bedbeb9b06b060d9b1459784b55769e3773fbf7ceb9d9b92ec992578c1af33/u,
  );
  assert.match(CATALOG_STATE_SQL, /identity_mail_delivery_worker_assert_v1/u);
  assert.match(
    CATALOG_STATE_SQL,
    /public\."identity_mail_delivery_worker_assert_v1"\(text\)/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /a48f6bf4e52306fcf476178c668a7b5bd130f9e957f16ca14d018e22154f43fc/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /a9a4bf75b8d5a381ebfc5ed9a35c6b966cbaac9b631a321ee66c1a6c1cc113a5/u,
  );
  assert.match(CATALOG_STATE_SQL, /releasedAt/u);
  assert.match(CATALOG_STATE_SQL, /secretCiphertext/u);
  assert.match(CATALOG_STATE_SQL, /identity_owner_invite_issue_hold_v1/u);
  assert.match(
    CATALOG_STATE_SQL,
    /787e025ba9fa501fc3d62dde7502c0e82bf01afeac1858031db54a6b2b982533/u,
  );
  assert.match(CATALOG_STATE_SQL, /IdentityMailOutbox_delivery_guard_trigger/u);
  assert.match(
    CATALOG_STATE_SQL,
    /cc6948e28e24e8c6985cf1939983fdaf71239d03ae48751599814a282eb5f151/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /3ce446e3ef40b4e6693485d00e5e38d9a7451887e265ba28572c908361d1d879/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /d27ce0e9a3644f39707dab510384805d34def0f68a8ef99dbefa7aadebeea891/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /cc00921ee3b6ee66feec020918749528c0cd8f220dd40c98779ae70f52a69947/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /858cd4ca21dc83d394178534690cebd15e4ef9932dc83000bb143c2b17b488d7/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /tenant_admission_decision_one_available_uidx/u,
  );
  assert.doesNotMatch(
    CATALOG_STATE_SQL,
    /tenant_admission_decision_one_unrevoked_uidx/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /f5643096ae50c2b9fc64e47ba5eb8d6ed6b5617ed4b4b782b0a4aef9393b8fa0/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /a135da3dc5eb1651c29d8d64056b5a193be5ce22cd8f0107df5a693aff569b9a/u,
  );
  assert.match(
    CATALOG_STATE_SQL,
    /IdentityOwnerInviteIssueCommand_immutable_trigger/u,
  );
  assert.match(CATALOG_STATE_SQL, /IdentityMailOutboxStatus/u);
  assert.match(CATALOG_STATE_SQL, /PENDING/u);
  assert.match(CATALOG_STATE_SQL, /IdentityMailTemplate/u);
  assert.match(CATALOG_STATE_SQL, /actual_exact_identity_column_count/u);
  assert.match(CATALOG_STATE_SQL, /dormant_relation_nonowner_acl_count/u);
  assert.match(CATALOG_STATE_SQL, /dormant_column_nonowner_acl_count/u);
  assert.match(CATALOG_STATE_SQL, /dormant_function_nonowner_acl_count/u);
  assert.match(CATALOG_STATE_SQL, /dormant_type_owner_mismatch_count/u);
  assert.match(CATALOG_STATE_SQL, /dormant_type_nonowner_acl_count/u);
  assert.match(CATALOG_STATE_SQL, /pg_catalog\.aclexplode/iu);
  assert.match(CATALOG_STATE_SQL, /pg_catalog\.acldefault\('f'/u);
  assert.match(CATALOG_STATE_SQL, /pg_catalog\.acldefault\('T'/u);
  assert.doesNotMatch(
    JSON.stringify(REQUIRED_COLUMN_SELECTS),
    /IdentityOwnerInviteIssueCommand|IdentityMailOutbox|tokenHash|secretCiphertext/u,
  );
  assert.match(CATALOG_STATE_SQL, /format_type/iu);
  assert.match(CATALOG_STATE_SQL, /matched_ri_trigger_count/iu);
  assert.match(CATALOG_STATE_SQL, /trigger_row\.tgenabled = 'O'/u);
  assert.match(CATALOG_STATE_SQL, /expected\.volatility/u);
  assert.match(CATALOG_STATE_SQL, /expected\.language_name/u);
  assert.match(CATALOG_STATE_SQL, /expected\.search_path_setting/u);
  assert.match(CATALOG_STATE_SQL, /shared_beta_/u);
  assert.doesNotMatch(CATALOG_STATE_SQL, /excluded_runtime_release_function/u);
  assert.match(
    CATALOG_STATE_SQL,
    /function_row\.oid =\s+pg_catalog\.to_regprocedure\(expected\.catalog_signature\)/iu,
  );
  const currentRuntimeReleaseFunctions = EXCLUDED_RUNTIME_RELEASE_FUNCTIONS;
  assert.equal(currentRuntimeReleaseFunctions.length, 20);
  for (const entry of currentRuntimeReleaseFunctions) {
    assert.equal(CATALOG_STATE_SQL.includes(entry.catalogSignature), true);
  }
  assert.match(PRIVILEGE_STATE_SQL, /ownership_dependency_count/iu);
  assert.match(PRIVILEGE_STATE_SQL, /system_schema_create_count/iu);
  assert.match(PRIVILEGE_STATE_SQL, /system_object_privilege_count/iu);
  assert.match(PRIVILEGE_STATE_SQL, /pg_catalog\.pg_init_privs/iu);
  assert.match(PRIVILEGE_STATE_SQL, /system_schema_privilege_count/iu);
  assert.match(
    PRIVILEGE_STATE_SQL,
    /initial_row\.objsubid = attribute_row\.attnum/iu,
  );
  assert.match(PRIVILEGE_STATE_SQL, /function_row\.prosecdef/iu);
  assert.match(PRIVILEGE_STATE_SQL, /function_row\.oid >= 16384/u);
  assert.match(PRIVILEGE_STATE_SQL, /dormant_type_usage_count/u);
  assert.match(PRIVILEGE_STATE_SQL, /has_type_privilege/iu);
});

test("migration artifact and database state bind ordered Git blob checksums", () => {
  const firstName = "20260730010000_first_fixture";
  const secondName = "20260730010100_second_fixture";
  const firstContent = Buffer.from("-- first fixture\r\n", "utf8");
  const secondContent = Buffer.from("-- second fixture\n", "utf8");
  const artifact = buildMigrationSourceArtifact(
    [firstName, secondName],
    [
      {
        path: `packages/database/prisma/migrations/${firstName}/migration.sql`,
        content: firstContent,
      },
      {
        path: `packages/database/prisma/migrations/${secondName}/migration.sql`,
        content: secondContent,
      },
    ],
  );
  assert.deepEqual(artifact.migrationChecksums, [
    createHash("sha256").update(firstContent).digest("hex"),
    createHash("sha256").update(secondContent).digest("hex"),
  ]);
  assert.notEqual(
    artifact.migrationChecksums[0],
    createHash("sha256")
      .update(Buffer.from("-- first fixture\n", "utf8"))
      .digest("hex"),
  );
  assert.match(artifact.sourceManifestDigest, /^[0-9a-f]{64}$/u);
  assert.throws(
    () =>
      buildMigrationSourceArtifact(
        [firstName],
        [
          {
            path: `packages/database/prisma/migrations/${secondName}/migration.sql`,
            content: firstContent,
          },
        ],
      ),
    { code: "SOURCE_MIGRATION_MANIFEST_INVALID" },
  );

  const currentArtifact = expectedMigrationArtifact();
  const currentRows = appliedMigrationRows(currentArtifact);
  const admitted = buildMigrationState(currentArtifact, currentRows);
  assert.equal(admitted.ready, true);
  assert.equal(admitted.orderedChecksumsMatched, true);
  assert.equal(admitted.checksumMismatchCount, 0);
  assert.equal(admitted.invalidChecksumCount, 0);
  assert.equal(
    admitted.databaseMigrationManifestDigest,
    currentArtifact.sourceManifestDigest,
  );

  const changedChecksum =
    currentRows[0].checksum[0] === "0"
      ? `1${currentRows[0].checksum.slice(1)}`
      : `0${currentRows[0].checksum.slice(1)}`;
  const checksumDrift = buildMigrationState(currentArtifact, [
    { ...currentRows[0], checksum: changedChecksum },
    ...currentRows.slice(1),
  ]);
  assert.equal(checksumDrift.ready, false);
  assert.equal(checksumDrift.orderedNamesMatched, true);
  assert.equal(checksumDrift.orderedChecksumsMatched, false);
  assert.equal(checksumDrift.checksumMismatchCount, 1);
  assert.equal(checksumDrift.invalidChecksumCount, 0);
  const serializedDrift = JSON.stringify(checksumDrift);
  assert.equal(serializedDrift.includes(changedChecksum), false);
  assert.equal(
    serializedDrift.includes(currentArtifact.migrationChecksums[0]),
    false,
  );

  const invalidChecksum = buildMigrationState(currentArtifact, [
    { ...currentRows[0], checksum: "A".repeat(64) },
    ...currentRows.slice(1),
  ]);
  assert.equal(invalidChecksum.ready, false);
  assert.equal(invalidChecksum.invalidChecksumCount, 1);
  assert.throws(
    () =>
      buildMigrationState(
        {
          ...currentArtifact,
          sourceManifestDigest: "f".repeat(64),
        },
        currentRows,
      ),
    { code: "EXPECTED_MIGRATION_ARTIFACT_INVALID" },
  );
});

test("buildInventoryState produces PASS, READY, REVIEW, and BLOCKED deterministically", () => {
  const pass = buildInventoryState(aggregateRows());
  assert.equal(pass.summary.decision, "PASS");
  assert.equal(pass.summary.blockingTotal, 0);
  assert.equal(pass.summary.proposalTotal, 0);
  assert.equal(pass.summary.reviewTotal, 0);

  const ready = buildInventoryState(
    aggregateRows({ USER_CLAIM_CREATE_CANDIDATE: 2 }),
  );
  assert.equal(ready.summary.decision, "READY_FOR_PROPOSAL");
  assert.equal(ready.summary.proposalTotal, 2);
  assert.deepEqual(ready.summary.proposalCodes, [
    "USER_CLAIM_CREATE_CANDIDATE",
  ]);

  const sensitiveReview = buildInventoryState(
    aggregateRows({
      USER_CLAIM_CREATE_CANDIDATE: 1,
      USER_SENSITIVE_IDENTITY_REVIEW: 1,
    }),
  );
  assert.equal(sensitiveReview.summary.decision, "REVIEW");
  assert.equal(sensitiveReview.summary.proposalTotal, 1);
  assert.equal(sensitiveReview.summary.reviewTotal, 1);

  const blocked = buildInventoryState(
    aggregateRows({
      USER_CLAIM_CREATE_CANDIDATE: 1,
      EMAIL_CHANGE_CLAIM_PRESENT: 1,
    }),
  );
  assert.equal(blocked.summary.decision, "BLOCKED");
  assert.equal(blocked.summary.blockingTotal, 1);
  assert.equal(blocked.summary.proposalTotal, 1);
  assert.deepEqual(blocked.summary.blockingCodes, [
    "EMAIL_CHANGE_CLAIM_PRESENT",
  ]);

  const repeated = buildInventoryState(aggregateRows());
  assert.deepEqual(pass, repeated);
  assert.deepEqual(
    pass.findings,
    [...pass.findings].sort(
      (left, right) =>
        left.severity.localeCompare(right.severity, "en") ||
        left.code.localeCompare(right.code, "en"),
    ),
  );
});

test("a live invite create candidate carries mandatory legacy-token review", () => {
  const state = buildInventoryState(
    aggregateRows(
      {
        LIVE_INVITE_CLAIM_CREATE_CANDIDATE: 3,
        LIVE_INVITE_LEGACY_TOKEN_REVIEW: 3,
      },
      { LIVE_INVITE_TOTAL: 3 },
    ),
  );
  assert.equal(state.summary.decision, "REVIEW");
  assert.equal(state.summary.proposalTotal, 3);
  assert.equal(state.summary.reviewTotal, 3);
  assert.deepEqual(state.summary.proposalCodes, [
    "LIVE_INVITE_CLAIM_CREATE_CANDIDATE",
  ]);
  assert.deepEqual(state.summary.reviewCodes, [
    "LIVE_INVITE_LEGACY_TOKEN_REVIEW",
  ]);
});

test("aggregate manifests fail closed on unknown, duplicate, or incomplete rows", () => {
  const complete = aggregateRows();
  assert.throws(() => buildInventoryState(complete.slice(1)), {
    code: "INVENTORY_AGGREGATE_INCOMPLETE",
  });
  assert.throws(
    () =>
      buildInventoryState([
        ...complete,
        {
          row_type: "FINDING",
          code: "UNKNOWN_PROPOSAL",
          severity: "PROPOSAL",
          count: "1",
        },
      ]),
    { code: "INVENTORY_FINDING_MANIFEST_MISMATCH" },
  );
  assert.throws(() => buildInventoryState([...complete, complete[0]]), {
    code: "INVENTORY_FINDING_MANIFEST_MISMATCH",
  });
});

test("reports are HMAC-bound, aggregate-only, and reject tampering", () => {
  const inventoryState = buildInventoryState(aggregateRows());
  const { config, report } = reportForInventory(inventoryState);
  assert.equal(report.summary.decision, "PASS");
  assert.equal(report.summary.inventoryExecuted, true);
  assert.equal(report.keyVersion, "v1");
  assert.match(report.contentDigest, /^[0-9a-f]{64}$/u);
  assert.match(report.executionDigest, /^[0-9a-f]{64}$/u);
  assert.equal(exitCodeForReport(report, config.hmacKey), 0);

  const repeated = reportForInventory(inventoryState).report;
  assert.equal(report.contentDigest, repeated.contentDigest);
  assert.equal(report.executionDigest, repeated.executionDigest);

  const later = buildReport({
    config,
    snapshotRow: snapshotRow(),
    ...admittedStates(),
    inventoryState,
    generatedAt: new Date("2026-07-29T12:00:02.000Z"),
  });
  assert.equal(report.contentDigest, later.contentDigest);
  assert.notEqual(report.executionDigest, later.executionDigest);

  const serialized = JSON.stringify(report);
  for (const secretValue of [
    "identity_inventory_ci",
    "identity_reader",
    "fixture_secret",
    "1234567890123456789",
    "16384",
    config.hmacKey,
    "legacy-owner@example.test",
    "11111111-1111-4111-8111-111111111111",
  ]) {
    assert.equal(serialized.includes(secretValue), false);
  }
  assert.equal(report.safety.outputContainsDatabaseName, false);
  assert.equal(report.safety.outputContainsRoleName, false);
  assert.equal(report.safety.outputContainsRowIdentifiers, false);
  assert.equal(report.safety.outputContainsEmailAddresses, false);
  assert.equal(report.safety.outputContainsMigrationChecksums, false);
  assert.equal(report.safety.evidenceAuthorizesProposalOrApply, false);
  for (const checksum of expectedMigrationArtifact().migrationChecksums) {
    assert.equal(serialized.includes(checksum), false);
  }

  const tampered = structuredClone(report);
  tampered.summary.blockingTotal = 1;
  assert.equal(exitCodeForReport(tampered, config.hmacKey), 1);
  assert.equal(
    exitCodeForReport(report, "different-hmac-key-aaaaaaaaaaaaaaaa"),
    1,
  );
});

test("schema and admission rejections are signed, skip inventory, and exit 3", () => {
  const config = parseRuntimeContract(runtimeEnvironment());
  const states = admittedStates();
  const schemaReport = buildReport({
    config,
    snapshotRow: snapshotRow(),
    migrationState: { ...states.migrationState, ready: false },
    catalogState: states.catalogState,
    privilegeState: states.privilegeState,
    inventoryState: null,
    generatedAt: FIXED_GENERATED_AT,
  });
  assert.equal(schemaReport.summary.decision, "SCHEMA_MISMATCH");
  assert.equal(schemaReport.summary.inventoryExecuted, false);
  assert.deepEqual(schemaReport.summary.schemaRejectionCodes, [
    "MIGRATION_STATE_MISMATCH",
  ]);
  assert.equal(exitCodeForReport(schemaReport, config.hmacKey), 3);

  const admissionReport = buildReport({
    config,
    snapshotRow: snapshotRow(),
    migrationState: states.migrationState,
    catalogState: states.catalogState,
    privilegeState: { ...states.privilegeState, ready: false },
    inventoryState: null,
    generatedAt: FIXED_GENERATED_AT,
  });
  assert.equal(admissionReport.summary.decision, "ADMISSION_MISMATCH");
  assert.equal(admissionReport.summary.inventoryExecuted, false);
  assert.deepEqual(admissionReport.summary.admissionRejectionCodes, [
    "LEAST_PRIVILEGE_ROLE_REQUIRED",
  ]);
  assert.equal(exitCodeForReport(admissionReport, config.hmacKey), 3);
});

test("inspectDatabase never executes inventory SQL after ACL rejection", async () => {
  const environment = runtimeEnvironment();
  const config = parseRuntimeContract(environment);
  const artifact = expectedMigrationArtifact();
  const executedStatements = [];
  const queriedStatements = [];
  let disconnected = false;
  let transactionOptions = null;

  const transaction = {
    async $executeRawUnsafe(sql) {
      executedStatements.push(sql);
      return 0;
    },
    async $queryRawUnsafe(sql) {
      queriedStatements.push(sql);
      if (sql === SNAPSHOT_STATE_SQL) return [snapshotRow()];
      if (sql === APPLIED_MIGRATION_STATE_SQL) {
        return appliedMigrationRows(artifact);
      }
      if (sql === CATALOG_STATE_SQL) return [catalogRow()];
      if (sql === PRIVILEGE_STATE_SQL) {
        return [privilegeRow({ writable_relation_count: "1" })];
      }
      if (sql === INVENTORY_SQL) {
        throw new Error("Inventory SQL must not execute after rejection.");
      }
      throw new Error("Unexpected SQL in mock.");
    },
  };
  const prisma = {
    async $transaction(callback, options) {
      transactionOptions = options;
      return callback(transaction);
    },
    async $disconnect() {
      disconnected = true;
    },
  };

  const report = await inspectDatabase(environment, config, {
    expectedMigrationArtifact: artifact,
    prismaFactory: () => prisma,
  });

  assert.equal(report.summary.decision, "ADMISSION_MISMATCH");
  assert.equal(report.summary.inventoryExecuted, false);
  assert.equal(report.summary.evidenceScope, "SYNTHETIC_FIXTURE");
  assert.equal(report.safety.releaseArtifactBound, false);
  assert.equal(exitCodeForReport(report, config.hmacKey), 3);
  assert.equal(queriedStatements.includes(INVENTORY_SQL), false);
  assert.equal(queriedStatements.includes(APPLIED_MIGRATION_STATE_SQL), false);
  assert.deepEqual(queriedStatements, [
    SNAPSHOT_STATE_SQL,
    CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
  ]);
  assert.equal(executedStatements[0], "SET TRANSACTION READ ONLY");
  assert.ok(executedStatements.includes("SET LOCAL TIME ZONE 'UTC'"));
  assert.ok(
    executedStatements.includes("SET LOCAL search_path = public, pg_catalog"),
  );
  assert.match(
    executedStatements.join("\n"),
    /SET LOCAL lock_timeout = '500ms'/u,
  );
  assert.match(
    executedStatements.join("\n"),
    /SET LOCAL statement_timeout = '30000ms'/u,
  );
  assert.match(
    executedStatements.join("\n"),
    /SET LOCAL idle_in_transaction_session_timeout = '120000ms'/u,
  );
  assert.deepEqual(transactionOptions, {
    isolationLevel: "RepeatableRead",
    timeout: 120_000,
    maxWait: 10_000,
  });
  assert.equal(disconnected, true);
});

test("inspectDatabase signs rejection before reading migrations when required ACL is missing", async () => {
  const environment = runtimeEnvironment();
  const config = parseRuntimeContract(environment);
  const artifact = expectedMigrationArtifact();
  const queriedStatements = [];
  const transaction = {
    async $executeRawUnsafe() {
      return 0;
    },
    async $queryRawUnsafe(sql) {
      queriedStatements.push(sql);
      if (sql === SNAPSHOT_STATE_SQL) return [snapshotRow()];
      if (sql === CATALOG_STATE_SQL) return [catalogRow()];
      if (sql === PRIVILEGE_STATE_SQL) {
        return [
          privilegeRow({
            required_select_missing_count: "1",
          }),
        ];
      }
      throw new Error("Protected relation SQL must not execute.");
    },
  };
  const prisma = {
    async $transaction(callback) {
      return callback(transaction);
    },
    async $disconnect() {},
  };
  const report = await inspectDatabase(environment, config, {
    expectedMigrationArtifact: artifact,
    prismaFactory: () => prisma,
  });
  assert.equal(report.summary.decision, "ADMISSION_MISMATCH");
  assert.equal(report.summary.inventoryExecuted, false);
  assert.deepEqual(report.summary.schemaRejectionCodes, []);
  assert.deepEqual(report.summary.admissionRejectionCodes, [
    "LEAST_PRIVILEGE_ROLE_REQUIRED",
  ]);
  assert.deepEqual(queriedStatements, [
    SNAPSHOT_STATE_SQL,
    CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
  ]);
  assert.equal(queriedStatements.includes(APPLIED_MIGRATION_STATE_SQL), false);
  assert.equal(exitCodeForReport(report, config.hmacKey), 3);
});

test("inspectDatabase rejects checksum drift before inventory SQL", async () => {
  const environment = runtimeEnvironment();
  const config = parseRuntimeContract(environment);
  const artifact = expectedMigrationArtifact();
  const migrationRows = appliedMigrationRows(artifact);
  const changedChecksum =
    migrationRows[0].checksum[0] === "0"
      ? `1${migrationRows[0].checksum.slice(1)}`
      : `0${migrationRows[0].checksum.slice(1)}`;
  migrationRows[0] = {
    ...migrationRows[0],
    checksum: changedChecksum,
  };
  const queriedStatements = [];
  const transaction = {
    async $executeRawUnsafe() {
      return 0;
    },
    async $queryRawUnsafe(sql) {
      queriedStatements.push(sql);
      if (sql === SNAPSHOT_STATE_SQL) return [snapshotRow()];
      if (sql === CATALOG_STATE_SQL) return [catalogRow()];
      if (sql === PRIVILEGE_STATE_SQL) return [privilegeRow()];
      if (sql === APPLIED_MIGRATION_STATE_SQL) return migrationRows;
      if (sql === INVENTORY_SQL) {
        throw new Error("Inventory SQL must not execute after checksum drift.");
      }
      throw new Error("Unexpected SQL in checksum drift mock.");
    },
  };
  const prisma = {
    async $transaction(callback) {
      return callback(transaction);
    },
    async $disconnect() {},
  };
  const report = await inspectDatabase(environment, config, {
    expectedMigrationArtifact: artifact,
    prismaFactory: () => prisma,
  });
  assert.equal(report.summary.decision, "SCHEMA_MISMATCH");
  assert.equal(report.summary.inventoryExecuted, false);
  assert.deepEqual(report.summary.schemaRejectionCodes, [
    "MIGRATION_STATE_MISMATCH",
  ]);
  assert.equal(report.database.migrations.orderedNamesMatched, true);
  assert.equal(report.database.migrations.orderedChecksumsMatched, false);
  assert.equal(report.database.migrations.checksumMismatchCount, 1);
  assert.equal(report.database.migrations.invalidChecksumCount, 0);
  assert.equal(JSON.stringify(report).includes(changedChecksum), false);
  assert.deepEqual(queriedStatements, [
    SNAPSHOT_STATE_SQL,
    CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
    APPLIED_MIGRATION_STATE_SQL,
  ]);
  assert.equal(queriedStatements.includes(INVENTORY_SQL), false);
  assert.equal(exitCodeForReport(report, config.hmacKey), 3);
});

test("all database SQL is read-only and inventory source avoids sensitive columns", () => {
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/iu;
  const stripSqlLiterals = (sql) => sql.replace(/'(?:''|[^'])*'/gu, "''");
  for (const sql of [
    SNAPSHOT_STATE_SQL,
    APPLIED_MIGRATION_STATE_SQL,
    CATALOG_STATE_SQL,
    PRIVILEGE_STATE_SQL,
    INVENTORY_SQL,
  ]) {
    const stripped = stripSqlLiterals(sql);
    assert.match(stripped.trim(), /^(?:SELECT|WITH)\b/iu);
    assert.doesNotMatch(stripped, mutatingKeyword);
    assert.doesNotMatch(stripped, /SELECT\s+\*/iu);
  }

  assert.doesNotMatch(
    INVENTORY_SQL,
    /passwordHash|tokenHash|fullName|createdByUserId|revokedByUserId/iu,
  );
  assert.match(
    INVENTORY_SQL,
    /'USER_SENSITIVE_IDENTITY_REVIEW'[\s\S]+?FROM user_row[\s\S]+?user_row\."isPlatformAdmin"[\s\S]+?user_row\."emailVerifiedAt"/u,
  );
  assert.match(INVENTORY_SQL, /transaction_timestamp\(\)/u);
  assert.match(INVENTORY_SQL, /lower\(btrim\([^)]*\)\s+COLLATE\s+"C"\)/iu);
  assert.match(
    INVENTORY_SQL,
    /acceptedAt" IS NOT NULL[\s\S]*acceptedByUserId" IS NULL/u,
  );
  assert.match(
    INVENTORY_SQL,
    /acceptedAt" IS NULL[\s\S]*acceptedByUserId" IS NOT NULL/u,
  );
  assert.match(PRIVILEGE_STATE_SQL, /required_relation_rls_count/u);
  assert.match(PRIVILEGE_STATE_SQL, /table_select_relation_count/u);
  assert.match(PRIVILEGE_STATE_SQL, /excess_select_column_count/u);
  assert.match(APPLIED_MIGRATION_STATE_SQL, /"checksum"::text AS checksum/u);
});

test("release artifact guard rejects malformed and non-canonical SHAs before Git inspection", async () => {
  await assert.rejects(loadExpectedMigrationArtifact("not-a-release-sha"), {
    code: "RELEASE_SHA_INVALID",
  });
  await assert.rejects(loadExpectedMigrationArtifact("A".repeat(40)), {
    code: "RELEASE_SHA_INVALID",
  });
});

test("release source path matching preserves case-sensitive production semantics", () => {
  const canonicalize = (value) => String(value);
  assert.equal(
    releaseRuntimePathMatches(
      "/srv/leetplus/packages/database/scripts/identity-legacy-backfill-inventory.mjs",
      "/srv/leetplus/packages/database/scripts/identity-legacy-backfill-inventory.mjs",
      { platform: "linux", canonicalize },
    ),
    true,
  );
  assert.equal(
    releaseRuntimePathMatches(
      "/srv/leetplus/packages/database/scripts/Identity-legacy-backfill-inventory.mjs",
      "/srv/leetplus/packages/database/scripts/identity-legacy-backfill-inventory.mjs",
      { platform: "linux", canonicalize },
    ),
    false,
  );
  assert.equal(
    releaseRuntimePathMatches(
      "C:\\Repo\\Identity-legacy-backfill-inventory.mjs",
      "c:\\repo\\identity-legacy-backfill-inventory.mjs",
      { platform: "win32", canonicalize },
    ),
    true,
  );
  assert.equal(
    releaseRuntimePathMatches(
      "/srv/leetplus/runtime.mjs",
      "/srv/leetplus/runtime.mjs",
      {
        platform: "linux",
        canonicalize: () => {
          throw new Error("missing");
        },
      },
    ),
    false,
  );
});

test("runtime dependency boundary pins the reviewed Prisma 6 client", () => {
  assert.equal(EXPECTED_PRISMA_CLIENT_VERSION, "6.19.3");
  assert.equal(assertRuntimeDependencyVersions(), true);
  assert.throws(() => assertRuntimeDependencyVersions("6.19.4"), {
    code: "PRISMA_CLIENT_VERSION_MISMATCH",
  });
});

test("migration checkouts stay LF-stable for Prisma checksum portability", () => {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const representativeMigration =
    "packages/database/prisma/migrations/20260730020000_shared_beta_admission_provenance/migration.sql";
  const attributes = readFileSync(
    new URL("../../../.gitattributes", import.meta.url),
    "utf8",
  );
  const migrationPolicy =
    "packages/database/prisma/migrations/**/migration.sql text eol=lf";

  assert.equal(
    attributes
      .split(/\r?\n/gu)
      .filter((line) => line.trim() === migrationPolicy).length,
    1,
  );
  const effectiveAttribute = spawnSync(
    "git",
    ["check-attr", "eol", "--", representativeMigration],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(effectiveAttribute.status, 0);
  assert.equal(
    effectiveAttribute.stdout.trim(),
    `${representativeMigration}: eol: lf`,
  );
});
