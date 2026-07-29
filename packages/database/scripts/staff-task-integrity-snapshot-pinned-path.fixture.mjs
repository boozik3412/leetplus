import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";

const RUN_CONFIRMATION = "run-public-only-pinned-path-fixture";
const NOW = new Date("2026-07-28T00:15:00.000Z");
const HMAC_KEY = "public-only-pinned-path-report-hmac-key-aaaaaaaa";
const DATABASE_NAME = "leetplus_snapshot_rehearsal";
const RELEASE_SHA = "f".repeat(40);
const SNAPSHOT_ARTIFACT_DIGEST = "b".repeat(64);
const APPROVAL_REFERENCE =
  "acquisition-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_ID = "staff-task-pinned-path-fixture-2026";
const fixturePath = realpathSync(fileURLToPath(import.meta.url));
let entrypointPath = null;
try {
  entrypointPath = realpathSync(String(process.argv[1] ?? ""));
} catch {
  // The bounded error below intentionally covers missing and invalid argv[1].
}

if (
  process.env.NODE_ENV !== "test" ||
  process.env.LEETPLUS_PINNED_PATH_FIXTURE_CONFIRM !== RUN_CONFIRMATION
) {
  throw new Error("The public-only pinned-path fixture is test-only.");
}
if (entrypointPath !== fixturePath) {
  throw new Error(
    "The public-only pinned-path fixture must be the direct process entrypoint.",
  );
}

const FIXTURE_ROOT = Object.freeze({
  keyId: KEY_ID,
  algorithm: "Ed25519",
  classification: "PRODUCTION_LIKE",
  profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
  purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\n" +
    "MCowBQYDK2VwAyEADBvrBgcmVajYs83H8xNKF3aZ7Im0C0gN2v4Mub9C0IM=\n" +
    "-----END PUBLIC KEY-----\n",
  publicKeyFingerprint:
    "de040f071d34167ff42d2b6d5aa48cc166e81e163c0c227f2bac5baf76e69074",
  notBefore: "2026-07-27T00:00:00.000Z",
  notAfter: "2026-08-01T00:00:00.000Z",
  status: "ACTIVE",
  supersedesKeyId: null,
  retiredAt: null,
  revokedAt: null,
});

const FIXTURE_ENVELOPE = Object.freeze({
  schemaVersion: 1,
  kind: "LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY",
  purpose: "STAFF_TASK_INTEGRITY_RECONCILIATION",
  classification: "PRODUCTION_LIKE",
  profile: "STAFF_TASK_INTEGRITY_PRODUCTION_LIKE_V1",
  signatureAlgorithm: "Ed25519",
  signingKeyId: KEY_ID,
  releaseSha: RELEASE_SHA,
  expectedState: "EXPAND_162",
  snapshotArtifactDigest: SNAPSHOT_ARTIFACT_DIGEST,
  creationNonce:
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  databaseIdentityDigest:
    "fa4b5416cb50c6723eb57d479820cc36f1dc3a04b6e6a8fb142eb952f155a785",
  approvalReferenceDigest:
    "97321f25570176fcab725a3989733229ed44c3a5e9c98c536f2dd87def13caab",
  isolationProfile: "ISOLATED_ENCRYPTED_NO_EGRESS_V1",
  acquiredAt: "2026-07-28T00:00:00.000Z",
  restoredAt: "2026-07-28T00:05:00.000Z",
  issuedAt: "2026-07-28T00:10:00.000Z",
  expiresAt: "2026-07-28T01:10:00.000Z",
  signature:
    "c28ZBf-3wPm1MP2TWB1iq29fLICxLYRrAlBIbZC2dnpYlVSLA7u89nRzzDSNu4IelshoeLJKUIRTgk-BLQOBCA",
});

const rootsModuleUrl = new URL(
  "./staff-task-integrity-snapshot-authority-roots.mjs",
  import.meta.url,
);
mock.module(rootsModuleUrl.href, {
  namedExports: {
    PINNED_PRODUCTION_LIKE_AUTHORITY_ROOTS: Object.freeze({
      [KEY_ID]: FIXTURE_ROOT,
    }),
  },
});

const authority = await import("./staff-task-integrity-snapshot-authority.mjs");
const admission = await import("./staff-task-integrity-snapshot-admission.mjs");
const planner = await import("./staff-task-integrity-reconciliation-plan.mjs");
const migrationState =
  await import("./staff-task-integrity-migration-state.mjs");

const encodedEnvelope = authority.encodeAuthorityEnvelope(FIXTURE_ENVELOPE);
const authorityExpectedContract = Object.freeze({
  releaseSha: RELEASE_SHA,
  expectedState: "EXPAND_162",
  snapshotArtifactDigest: SNAPSHOT_ARTIFACT_DIGEST,
  approvalReference: APPROVAL_REFERENCE,
  acquiredAt: FIXTURE_ENVELOPE.acquiredAt,
  restoredAt: FIXTURE_ENVELOPE.restoredAt,
  expiresAt: FIXTURE_ENVELOPE.expiresAt,
});

function environment() {
  return {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://reader:fixture@127.0.0.1:5432/${DATABASE_NAME}?schema=public`,
    RELEASE_SHA,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "PRODUCTION_LIKE",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: "EXPAND_162",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE: DATABASE_NAME,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM: admission.RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION:
      admission.ISOLATION_ATTESTATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY: HMAC_KEY,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST:
      SNAPSHOT_ARTIFACT_DIGEST,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
      APPROVAL_REFERENCE,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
      FIXTURE_ENVELOPE.acquiredAt,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
      FIXTURE_ENVELOPE.restoredAt,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
      FIXTURE_ENVELOPE.expiresAt,
    STAFF_TASK_INTEGRITY_SNAPSHOT_AUTHORITY_MANIFEST: encodedEnvelope,
  };
}

function privilegeRow() {
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
  };
}

function reportRows(databaseMarker, generatedAt = NOW) {
  return {
    snapshotRow: {
      generated_at: generatedAt,
      current_schema: "public",
      current_database: DATABASE_NAME,
      cluster_system_identifier: "7667202810308916656",
      database_oid: "16384",
      server_version_num: "160013",
      database_authority_marker: databaseMarker,
    },
    migrationRow: {
      migration_count: String(migrationState.STAFF_TASK_FROZEN_PREFIX_COUNT),
      latest_migration: migrationState.STAFF_TASK_FROZEN_PREFIX_LATEST,
      unfinished_migration_count: "0",
    },
    catalogRow: {
      composite_contract_match_count: String(
        planner.COMPOSITE_CONSTRAINTS.length,
      ),
      simple_contract_match_count: String(planner.SIMPLE_CONSTRAINTS.length),
      foreign_key_contract_mismatch_count: "0",
      unexpected_protected_foreign_key_count: "0",
      parent_index_contract_match_count: String(planner.PARENT_INDEXES.length),
      parent_index_contract_mismatch_count: "0",
    },
    privilegeRow: privilegeRow(),
    migrationManifest: {
      ready: true,
      expectedCount: migrationState.STAFF_TASK_FROZEN_PREFIX_COUNT,
      actualCount: migrationState.STAFF_TASK_FROZEN_PREFIX_COUNT,
      manifestDigest: "d".repeat(64),
    },
  };
}

const config = admission.parseRuntimeContract(environment(), NOW);
assert.equal(
  authority.isVerifiedProductionLikeAuthority(config.authority),
  true,
);
assert.equal(config.authority.expectedState, "EXPAND_162");
assert.equal(
  config.authority.databaseMarker,
  authority.authorityDatabaseMarker(config.authority.envelopeDigest),
);

const admitted = admission.buildAdmissionReport({
  config,
  ...reportRows(config.authority.databaseMarker),
});
assert.equal(admitted.summary.decision, "ADMITTED");
assert.equal(admitted.database.productionLikeAuthorityVerified, true);
assert.equal(
  admitted.database.productionLikeAuthorityDatabaseMarkerMatched,
  true,
);
assert.equal(admitted.database.databaseIdentityDigestMatched, true);
assert.equal(admission.exitCodeForAdmission(admitted, HMAC_KEY, NOW), 0);
assert.equal(
  admission.exitCodeForAdmission(structuredClone(admitted), HMAC_KEY, NOW),
  1,
);

const markerRejected = admission.buildAdmissionReport({
  config,
  ...reportRows("LEETPLUS_STAFF_TASK_SNAPSHOT_AUTHORITY_V2:" + "0".repeat(64)),
});
assert.equal(markerRejected.summary.decision, "REJECTED");
assert.ok(
  markerRejected.summary.rejectionCodes.includes(
    "PRODUCTION_LIKE_AUTHORITY_MARKER_MISMATCH",
  ),
);
assert.equal(admission.exitCodeForAdmission(markerRejected, HMAC_KEY, NOW), 3);

const expiredDuringAdmission = admission.buildAdmissionReport({
  config,
  ...reportRows(
    config.authority.databaseMarker,
    new Date(FIXTURE_ENVELOPE.expiresAt),
  ),
});
assert.equal(expiredDuringAdmission.summary.decision, "REJECTED");
assert.ok(
  expiredDuringAdmission.summary.rejectionCodes.includes(
    "SNAPSHOT_EXPIRED_DURING_ADMISSION",
  ),
);
assert.equal(
  admission.exitCodeForAdmission(expiredDuringAdmission, HMAC_KEY, NOW),
  3,
);
assert.equal(
  admission.exitCodeForAdmission(
    admitted,
    HMAC_KEY,
    new Date(FIXTURE_ENVELOPE.expiresAt),
  ),
  1,
);
assert.throws(
  () =>
    authority.verifyPinnedProductionLikeAuthority(
      encodedEnvelope,
      authorityExpectedContract,
      new Date(FIXTURE_ENVELOPE.expiresAt),
    ),
  { code: "PRODUCTION_LIKE_AUTHORITY_TIMELINE_INVALID" },
);

process.stdout.write(
  JSON.stringify({
    fixture: "public-only-pinned-path",
    productionRootRegistryOnDiskEmpty: true,
    fixtureRootScope: "isolated-child-module-mock",
    privateSigningMaterialPresent: false,
    positiveAdmission: true,
    markerMismatchRejected: true,
    expiryRejected: true,
    detachedReportRejected: true,
  }),
);
