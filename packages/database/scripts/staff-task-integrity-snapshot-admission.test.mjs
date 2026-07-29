import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BASELINE_LATEST_MIGRATION,
  BASELINE_MIGRATION_COUNT,
  BASELINE_STATE,
  CURRENT_STATE,
  EXPAND_STATE,
  ISOLATION_ATTESTATION,
  PRIVILEGE_STATE_SQL,
  RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH,
  RELEASE_RUNTIME_SOURCE_PATHS,
  REQUIRED_COLUMN_SELECTS,
  RUN_CONFIRMATION,
  buildAdmissionReport,
  buildMigrationManifestState,
  buildReadOnlyDatabaseUrl,
  exitCodeForAdmission,
  parseArguments,
  parseRuntimeContract,
  runSelfTest,
} from "./staff-task-integrity-snapshot-admission.mjs";
import {
  COMPOSITE_CONSTRAINTS,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  PARENT_INDEXES,
  SIMPLE_CONSTRAINTS,
} from "./staff-task-integrity-reconciliation-plan.mjs";
import {
  STAFF_TASK_FROZEN_PREFIX_COUNT,
  STAFF_TASK_FROZEN_PREFIX_LATEST,
} from "./staff-task-integrity-migration-state.mjs";
import { computeNonceBoundDatabaseIdentityDigest } from "./staff-task-integrity-snapshot-authority.mjs";
import { CEREMONY_RELEASE_SOURCE_PATHS } from "./staff-task-integrity-snapshot-authority-offline-sign.cli.mjs";
import { PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS } from "./staff-task-integrity-snapshot-authority-roots.mjs";

const NOW = new Date("2026-07-27T00:00:00.000Z");
const HMAC_KEY = "unit-test-snapshot-admission-hmac-key-aaaaaaaa";
const SYNTHETIC_DATABASE = "lp_snapshot_admission_ci_aaaaaaaaaaaaaaaa";

test("admission release evidence covers the detached ceremony runtime", () => {
  assert.equal(
    RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH,
    "packages/database/scripts/staff-task-integrity-snapshot-admission.mjs",
  );
  assert.ok(
    RELEASE_RUNTIME_SOURCE_PATHS.includes(
      RELEASE_RUNTIME_ENTRYPOINT_SOURCE_PATH,
    ),
  );
  for (const ceremonySource of CEREMONY_RELEASE_SOURCE_PATHS) {
    assert.ok(
      RELEASE_RUNTIME_SOURCE_PATHS.includes(ceremonySource),
      `unbound ceremony source: ${ceremonySource}`,
    );
  }
});

function environment(overrides = {}) {
  return {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://reader:secret@127.0.0.1:5432/${SYNTHETIC_DATABASE}?schema=public`,
    RELEASE_SHA: "a".repeat(40),
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "SYNTHETIC",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: CURRENT_STATE,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
      SYNTHETIC_DATABASE,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM: RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION:
      ISOLATION_ATTESTATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY: HMAC_KEY,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST: "b".repeat(64),
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
      "synthetic:unit-test",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
      "2026-07-26T23:58:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
      "2026-07-26T23:59:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
      "2026-07-28T00:00:00.000Z",
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
    database_create_privilege: false,
    database_temp_privilege: false,
    public_schema_usage_privilege: true,
    public_schema_create_privilege: false,
    role_membership_count: "0",
    owned_database_count: "0",
    owned_schema_count: "0",
    owned_relation_count: "0",
    owned_function_count: "0",
    other_database_connect_count: "0",
    non_public_schema_usage_count: "0",
    writable_relation_count: "0",
    excess_select_relation_count: "0",
    select_grant_option_relation_count: "0",
    column_scoped_table_select_count: "0",
    excess_select_column_count: "0",
    select_grant_option_column_count: "0",
    public_select_relation_count: "0",
    writable_sequence_count: "0",
    selectable_sequence_count: "0",
    executable_user_function_count: "0",
    foreign_server_usage_count: "0",
    large_object_privilege_count: "0",
    required_select_missing_count: "0",
    ...overrides,
  };
}

function expandRows(overrides = {}) {
  return {
    snapshotRow: {
      generated_at: new Date("2026-07-27T00:00:00.000Z"),
      current_schema: "public",
      current_database: SYNTHETIC_DATABASE,
      cluster_system_identifier: "1234567890123456789",
      database_oid: "16384",
      server_version_num: "160009",
    },
    migrationRow: {
      migration_count: String(EXPECTED_MIGRATION_COUNT),
      latest_migration: EXPECTED_LATEST_MIGRATION,
      unfinished_migration_count: "0",
    },
    catalogRow: {
      composite_contract_match_count: String(COMPOSITE_CONSTRAINTS.length),
      simple_contract_match_count: String(SIMPLE_CONSTRAINTS.length),
      foreign_key_contract_mismatch_count: "0",
      unexpected_protected_foreign_key_count: "0",
      parent_index_contract_match_count: String(PARENT_INDEXES.length),
      parent_index_contract_mismatch_count: "0",
    },
    privilegeRow: privilegeRow(),
    migrationManifest: {
      ready: true,
      expectedCount: EXPECTED_MIGRATION_COUNT,
      actualCount: EXPECTED_MIGRATION_COUNT,
      manifestDigest: "c".repeat(64),
    },
    ...overrides,
  };
}

function baselineRows() {
  return {
    snapshotRow: {
      generated_at: new Date("2026-07-27T00:00:00.000Z"),
      current_schema: "public",
      current_database: SYNTHETIC_DATABASE,
      cluster_system_identifier: "1234567890123456789",
      database_oid: "16384",
      server_version_num: "160009",
    },
    migrationRow: {
      migration_count: String(BASELINE_MIGRATION_COUNT),
      latest_migration: BASELINE_LATEST_MIGRATION,
      unfinished_migration_count: "0",
    },
    catalogRow: {
      baseline_fk_match_count: String(SIMPLE_CONSTRAINTS.length),
      baseline_fk_mismatch_count: "0",
      unexpected_protected_fk_count: "0",
      protected_composite_present_count: "0",
      protected_parent_index_present_count: "0",
    },
    privilegeRow: privilegeRow(),
    migrationManifest: {
      ready: true,
      expectedCount: BASELINE_MIGRATION_COUNT,
      actualCount: BASELINE_MIGRATION_COUNT,
      manifestDigest: "d".repeat(64),
    },
  };
}

function frozenExpandRows() {
  return {
    ...expandRows(),
    migrationRow: {
      migration_count: String(STAFF_TASK_FROZEN_PREFIX_COUNT),
      latest_migration: STAFF_TASK_FROZEN_PREFIX_LATEST,
      unfinished_migration_count: "0",
    },
    migrationManifest: {
      ready: true,
      expectedCount: STAFF_TASK_FROZEN_PREFIX_COUNT,
      actualCount: STAFF_TASK_FROZEN_PREFIX_COUNT,
      manifestDigest: "e".repeat(64),
    },
  };
}

test("CLI is read-only and rejects mutation-like arguments", () => {
  assert.deepEqual(parseArguments(["--pretty", "--self-test"]), {
    help: false,
    selfTest: true,
    pretty: true,
  });
  for (const argument of ["--apply", "--fix", "--delete", "--restore"]) {
    assert.throws(() => parseArguments([argument]), {
      code: "CLI_ARGUMENT_UNSUPPORTED",
    });
  }
});

test("synthetic runtime contract is anchored to a local test database", () => {
  const config = parseRuntimeContract(environment(), NOW);
  assert.equal(config.classification, "SYNTHETIC");
  assert.equal(config.expectedState, CURRENT_STATE);
  assert.equal(config.expectedDatabaseName, SYNTHETIC_DATABASE);
  assert.equal(config.localHost, true);

  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          DATABASE_URL: `postgresql://reader:secret@db.internal:5432/${SYNTHETIC_DATABASE}`,
        }),
        NOW,
      ),
    { code: "REMOTE_TARGET_PROHIBITED" },
  );
});

test("production process and missing attestations fail closed", () => {
  assert.throws(
    () => parseRuntimeContract(environment({ NODE_ENV: "production" }), NOW),
    { code: "PRODUCTION_PROCESS_PROHIBITED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM: "yes",
        }),
        NOW,
      ),
    { code: "RUN_CONFIRMATION_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION: "",
        }),
        NOW,
      ),
    { code: "ISOLATION_ATTESTATION_REQUIRED" },
  );
});

test("remote targets stay NO-GO and production-like authority fails closed", () => {
  const remoteEnvironment = environment({
    DATABASE_URL:
      "postgresql://reader:secret@db.internal:5432/leetplus_snapshot_rehearsal",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "PRODUCTION_LIKE",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
      "leetplus_snapshot_rehearsal",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST:
      "c".repeat(64),
  });
  assert.throws(() => parseRuntimeContract(remoteEnvironment, NOW), {
    code: "REMOTE_TARGET_PROHIBITED",
  });

  const localProductionLike = environment({
    DATABASE_URL:
      "postgresql://reader:secret@127.0.0.1:5432/leetplus_snapshot_rehearsal",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "PRODUCTION_LIKE",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
      "leetplus_snapshot_rehearsal",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE: `acquisition-v1:${"a".repeat(64)}`,
  });
  assert.throws(
    () =>
      parseRuntimeContract(
        {
          ...localProductionLike,
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
            "security-approval:caller-controlled",
        },
        NOW,
      ),
    { code: "PRODUCTION_LIKE_ACQUISITION_REFERENCE_REQUIRED" },
  );
  const ambiguousMarker = "leetplus_contest";
  assert.throws(
    () =>
      parseRuntimeContract(
        {
          ...localProductionLike,
          DATABASE_URL: `postgresql://reader:secret@127.0.0.1:5432/${ambiguousMarker}`,
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
            ambiguousMarker,
        },
        NOW,
      ),
    { code: "PRODUCTION_LIKE_TARGET_INVALID" },
  );
  assert.throws(() => parseRuntimeContract(localProductionLike, NOW), {
    code: "PRODUCTION_LIKE_AUTHORITY_NOT_ENROLLED",
  });
  assert.throws(
    () =>
      parseRuntimeContract(
        {
          ...localProductionLike,
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST:
            "c".repeat(64),
        },
        NOW,
      ),
    {
      code: "LEGACY_PRODUCTION_LIKE_AUTHORITY_PROHIBITED",
    },
  );
});

test("a public-only fixture exercises the isolated positive pinned path", () => {
  assert.deepEqual(PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS, {});
  const fixturePath = fileURLToPath(
    new URL(
      "./staff-task-integrity-snapshot-pinned-path.fixture.mjs",
      import.meta.url,
    ),
  );
  const fixtureSource = readFileSync(fixturePath, "utf8");
  assert.doesNotMatch(
    fixtureSource,
    /BEGIN (?:ENCRYPTED )?PRIVATE KEY|createPrivateKey|generateKeyPair|privateKey|\bsign\s*\(|signingSeed/iu,
  );

  const fixtureEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    NODE_OPTIONS: "",
    LEETPLUS_PINNED_PATH_FIXTURE_CONFIRM: "run-public-only-pinned-path-fixture",
  };
  const preloadResult = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-test-module-mocks",
      "--import",
      pathToFileURL(fixturePath).href,
      "--input-type=module",
      "--eval",
      "process.stdout.write('unexpected-preload-entry-executed')",
    ],
    {
      encoding: "utf8",
      env: fixtureEnvironment,
      timeout: 30_000,
      windowsHide: true,
    },
  );
  assert.notEqual(preloadResult.status, 0);
  assert.match(preloadResult.stderr, /must be the direct process entrypoint/u);
  assert.doesNotMatch(
    preloadResult.stdout,
    /unexpected-preload-entry-executed|public-only-pinned-path/u,
  );
  assert.deepEqual(PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS, {});

  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-test-module-mocks", fixturePath],
    {
      encoding: "utf8",
      env: fixtureEnvironment,
      timeout: 30_000,
      windowsHide: true,
    },
  );
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join("\n"),
  );
  assert.deepEqual(JSON.parse(result.stdout), {
    fixture: "public-only-pinned-path",
    productionRootRegistryOnDiskEmpty: true,
    fixtureRootScope: "isolated-child-module-mock",
    privateSigningMaterialPresent: false,
    positiveAdmission: true,
    markerMismatchRejected: true,
    expiryRejected: true,
    detachedReportRejected: true,
  });
});

test("database marker, public schema, HMAC, expiry, and timeout order are exact", () => {
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
            "another_snapshot_test",
        }),
        NOW,
      ),
    { code: "EXPECTED_DATABASE_URL_MISMATCH" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          DATABASE_URL: `postgresql://reader:secret@127.0.0.1:5432/${SYNTHETIC_DATABASE}?schema=private`,
        }),
        NOW,
      ),
    { code: "DATABASE_SCHEMA_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY: "short",
        }),
        NOW,
      ),
    { code: "HMAC_KEY_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST: "abc",
        }),
        NOW,
      ),
    { code: "SNAPSHOT_DIGEST_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE: "x",
        }),
        NOW,
      ),
    { code: "APPROVAL_REFERENCE_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
            "2026-07-27T00:00:00.000Z",
        }),
        NOW,
      ),
    { code: "SNAPSHOT_EXPIRY_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          DATABASE_URL:
            "postgresql://reader:secret@127.0.0.1:5432/leetplus_snapshot_rehearsal",
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION:
            "PRODUCTION_LIKE",
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE:
            "leetplus_snapshot_rehearsal",
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE: `acquisition-v1:${"a".repeat(64)}`,
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
            "2026-07-31T00:00:00.000Z",
        }),
        NOW,
      ),
    { code: "SNAPSHOT_EXPIRY_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
            "2026-07-27T00:01:00.000Z",
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
            "2026-07-27T00:00:00.000Z",
        }),
        NOW,
      ),
    { code: "SNAPSHOT_TIMELINE_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_LOCK_TIMEOUT_MS: "2000",
          STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_STATEMENT_TIMEOUT_MS: "1000",
        }),
        NOW,
      ),
    { code: "TIMEOUT_ORDER_INVALID" },
  );
});

test("read-only URL fixes one connection, public schema, and bounded settings", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const built = new URL(buildReadOnlyDatabaseUrl(config.databaseUrl, config));
  assert.equal(built.searchParams.get("schema"), "public");
  assert.equal(built.searchParams.get("connection_limit"), "1");
  assert.equal(
    built.searchParams.get("application_name"),
    "leetplus_staff_task_snapshot_admission",
  );
  assert.match(
    built.searchParams.get("options"),
    /default_transaction_read_only=on/u,
  );
});

test("User evidence stays column-scoped and missing columns reject structurally", () => {
  assert.deepEqual(REQUIRED_COLUMN_SELECTS.User, [
    "id",
    "tenantId",
    "isPlatformAdmin",
    "isActive",
    "accessScope",
  ]);
  assert.match(
    PRIVILEGE_STATE_SQL,
    /has_column_privilege\(\s*current_user,\s*required\.relation_oid,\s*required\.attribute_number,\s*'SELECT'\s*\)/u,
  );
  assert.match(PRIVILEGE_STATE_SQL, /public_select_relation_count/u);
  assert.match(PRIVILEGE_STATE_SQL, /privilege\.grantee = 0/u);
});

test("exact current release state is admitted without running inventory", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const report = buildAdmissionReport({ config, ...expandRows() });
  assert.equal(report.summary.decision, "ADMITTED");
  assert.equal(report.summary.inventoryExecuted, false);
  assert.equal(report.summary.plannerExecuted, false);
  assert.equal(report.database.migrations.detectedState, CURRENT_STATE);
  assert.equal(exitCodeForAdmission(report, HMAC_KEY, NOW), 0);
});

test("exact EXPAND_162 prefix remains independently admissible", () => {
  const config = parseRuntimeContract(
    environment({
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: EXPAND_STATE,
    }),
    NOW,
  );
  const report = buildAdmissionReport({ config, ...frozenExpandRows() });
  assert.equal(report.summary.decision, "ADMITTED");
  assert.equal(report.database.migrations.detectedState, EXPAND_STATE);
  assert.equal(exitCodeForAdmission(report, HMAC_KEY, NOW), 0);
});

test("snapshot expiry is rechecked at database generation and before emit", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const expiredDuringQuery = buildAdmissionReport({
    config,
    ...expandRows(),
    snapshotRow: {
      ...expandRows().snapshotRow,
      generated_at: new Date(config.expiresAt),
    },
  });
  assert.equal(expiredDuringQuery.summary.decision, "REJECTED");
  assert.ok(
    expiredDuringQuery.summary.rejectionCodes.includes(
      "SNAPSHOT_EXPIRED_DURING_ADMISSION",
    ),
  );
  assert.equal(exitCodeForAdmission(expiredDuringQuery, HMAC_KEY, NOW), 3);

  const admitted = buildAdmissionReport({ config, ...expandRows() });
  assert.equal(
    exitCodeForAdmission(admitted, HMAC_KEY, new Date(config.expiresAt)),
    1,
  );
});

test("a truthy forged production-like authority cannot bypass verification", () => {
  const syntheticConfig = parseRuntimeContract(environment(), NOW);
  const rows = expandRows();
  rows.snapshotRow.current_database = "leetplus_snapshot_rehearsal";
  const creationNonce = "d".repeat(64);
  const rejected = buildAdmissionReport({
    config: {
      ...syntheticConfig,
      classification: "PRODUCTION_LIKE",
      expectedDatabaseName: "leetplus_snapshot_rehearsal",
      authority: {
        creationNonce,
        databaseIdentityDigest: computeNonceBoundDatabaseIdentityDigest(
          rows.snapshotRow,
          creationNonce,
        ),
      },
    },
    ...rows,
  });
  assert.equal(rejected.database.databaseIdentityDigestRequired, true);
  assert.equal(rejected.database.databaseIdentityDigestMatched, false);
  assert.equal(rejected.database.productionLikeAuthorityVerified, false);
  assert.equal(
    rejected.database.productionLikeAuthorityDatabaseMarkerMatched,
    false,
  );
  assert.ok(
    rejected.summary.rejectionCodes.includes(
      "DATABASE_IDENTITY_DIGEST_MISMATCH",
    ),
  );
  assert.ok(
    rejected.summary.rejectionCodes.includes(
      "PRODUCTION_LIKE_AUTHORITY_REQUIRED",
    ),
  );
});

test("exact BASELINE_156 state is admitted only under its own catalog", () => {
  const config = parseRuntimeContract(
    environment({
      STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: BASELINE_STATE,
    }),
    NOW,
  );
  const report = buildAdmissionReport({ config, ...baselineRows() });
  assert.equal(report.summary.decision, "ADMITTED");
  assert.equal(report.database.migrations.detectedState, BASELINE_STATE);
  assert.equal(report.database.catalog.actual.foreignKeyMatchCount, 14);
});

test("unfinished or intermediate migration state is rejected", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const report = buildAdmissionReport({
    config,
    ...expandRows(),
    migrationRow: {
      migration_count: "160",
      latest_migration: "20260727130400_staff_task_recurring_rule_tenant_key",
      unfinished_migration_count: "1",
    },
  });
  assert.equal(report.summary.decision, "REJECTED");
  assert.deepEqual(report.summary.rejectionCodes, ["MIGRATION_STATE_MISMATCH"]);
  assert.equal(exitCodeForAdmission(report, HMAC_KEY, NOW), 3);
});

test("full ordered migration names and checksums must match release artifacts", () => {
  const expected = [
    { migrationName: "20260101000000_first", checksum: "a".repeat(64) },
    { migrationName: "20260101000001_second", checksum: "b".repeat(64) },
  ];
  const exact = buildMigrationManifestState(expected, [
    { migration_name: "20260101000000_first", checksum: "a".repeat(64) },
    { migration_name: "20260101000001_second", checksum: "b".repeat(64) },
  ]);
  assert.equal(exact.ready, true);
  assert.match(exact.manifestDigest, /^[0-9a-f]{64}$/u);

  const tampered = buildMigrationManifestState(expected, [
    { migration_name: "20260101000000_first", checksum: "a".repeat(64) },
    { migration_name: "20260101000001_second", checksum: "c".repeat(64) },
  ]);
  assert.equal(tampered.ready, false);
});

test("catalog drift and PostgreSQL major drift are rejected", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const catalogDrift = buildAdmissionReport({
    config,
    ...expandRows(),
    catalogRow: {
      ...expandRows().catalogRow,
      unexpected_protected_foreign_key_count: "1",
    },
  });
  assert.equal(catalogDrift.summary.decision, "REJECTED");
  assert.ok(
    catalogDrift.summary.rejectionCodes.includes("CATALOG_STATE_MISMATCH"),
  );

  const versionDrift = buildAdmissionReport({
    config,
    ...expandRows(),
    snapshotRow: {
      ...expandRows().snapshotRow,
      server_version_num: "170001",
    },
  });
  assert.ok(
    versionDrift.summary.rejectionCodes.includes("POSTGRESQL_16_REQUIRED"),
  );
});

test("every privilege escalation class rejects admission", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const unsafeRows = [
    { role_superuser: true },
    { role_inherits: true },
    { role_can_create_role: true },
    { role_can_create_database: true },
    { role_replication: true },
    { role_bypass_rls: true },
    { database_owner: true },
    { public_schema_owner: true },
    { current_database_connect_privilege: false },
    { database_create_privilege: true },
    { database_temp_privilege: true },
    { public_schema_usage_privilege: false },
    { public_schema_create_privilege: true },
    { role_membership_count: "1" },
    { owned_database_count: "1" },
    { owned_schema_count: "1" },
    { owned_relation_count: "1" },
    { owned_function_count: "1" },
    { other_database_connect_count: "1" },
    { non_public_schema_usage_count: "1" },
    { writable_relation_count: "1" },
    { excess_select_relation_count: "1" },
    { select_grant_option_relation_count: "1" },
    { column_scoped_table_select_count: "1" },
    { excess_select_column_count: "1" },
    { select_grant_option_column_count: "1" },
    { public_select_relation_count: "1" },
    { writable_sequence_count: "1" },
    { selectable_sequence_count: "1" },
    { executable_user_function_count: "1" },
    { foreign_server_usage_count: "1" },
    { large_object_privilege_count: "1" },
    { required_select_missing_count: "1" },
  ];
  for (const unsafe of unsafeRows) {
    const report = buildAdmissionReport({
      config,
      ...expandRows(),
      privilegeRow: privilegeRow(unsafe),
    });
    assert.equal(report.summary.decision, "REJECTED");
    assert.ok(
      report.summary.rejectionCodes.includes("LEAST_PRIVILEGE_ROLE_REQUIRED"),
    );
  }
});

test("digests are stable, timestamp-bound, database-bound, and privacy-safe", () => {
  const config = parseRuntimeContract(environment(), NOW);
  const first = buildAdmissionReport({ config, ...expandRows() });
  const repeated = buildAdmissionReport({ config, ...expandRows() });
  assert.equal(first.contentDigest, repeated.contentDigest);
  assert.equal(first.executionDigest, repeated.executionDigest);

  const later = buildAdmissionReport({
    config,
    ...expandRows(),
    snapshotRow: {
      ...expandRows().snapshotRow,
      generated_at: new Date("2026-07-27T00:00:01.000Z"),
    },
  });
  assert.equal(first.contentDigest, later.contentDigest);
  assert.notEqual(first.executionDigest, later.executionDigest);

  const otherDatabase = buildAdmissionReport({
    config: { ...config, expectedDatabaseName: "another_snapshot_test" },
    ...expandRows(),
    snapshotRow: {
      ...expandRows().snapshotRow,
      current_database: "another_snapshot_test",
      database_oid: "16385",
    },
  });
  assert.notEqual(
    first.databaseIdentityDigest,
    otherDatabase.databaseIdentityDigest,
  );
  assert.notEqual(first.contentDigest, otherDatabase.contentDigest);

  const serialized = JSON.stringify(first);
  for (const secret of [
    SYNTHETIC_DATABASE,
    "1234567890123456789",
    "16384",
    "reader",
    "secret",
    HMAC_KEY,
    "synthetic:unit-test",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret, "u"));
  }
});

test("forged or incomplete reports never produce a success exit", () => {
  assert.equal(exitCodeForAdmission({}, HMAC_KEY, NOW), 1);
  const config = parseRuntimeContract(environment(), NOW);
  const report = buildAdmissionReport({ config, ...expandRows() });
  assert.equal(
    exitCodeForAdmission(
      {
        ...report,
        summary: { ...report.summary, inventoryExecuted: true },
      },
      HMAC_KEY,
      NOW,
    ),
    1,
  );
  assert.equal(
    exitCodeForAdmission(
      {
        ...report,
        database: {
          ...report.database,
          catalog: { ...report.database.catalog, ready: false },
        },
      },
      HMAC_KEY,
      NOW,
    ),
    1,
  );
});

test("offline self-test validates the frozen read-only source contract", () => {
  assert.deepEqual(runSelfTest(), {
    script: "staff-task-integrity-snapshot-admission",
    status: "PASS",
    checks: 12,
  });
});
