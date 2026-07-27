import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSITE_CONSTRAINTS,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  FINDING_MANIFEST,
  PARENT_INDEXES,
  SIMPLE_CONSTRAINTS,
  buildPlan,
  computeDatabaseIdentityDigest,
} from "./staff-task-integrity-reconciliation-plan.mjs";
import {
  EXPAND_STATE,
  ISOLATION_ATTESTATION,
  RUN_CONFIRMATION as ADMISSION_RUN_CONFIRMATION,
  buildAdmissionReport,
} from "./staff-task-integrity-snapshot-admission.mjs";
import {
  MAX_RENDERED_REPORT_BYTES,
  PROPOSAL_ACTIONS,
  PROPOSAL_CODES,
  PROPOSAL_ROWS_SQL,
  RLS_STATE_SQL,
  RUN_CONFIRMATION,
  buildDryRunReport,
  buildProposalCases,
  buildSyntheticProvenanceManifest,
  encodeSyntheticProvenanceManifest,
  exitCodeForDryRun,
  parseArguments,
  parseRuntimeContract,
  parseSyntheticProvenanceManifest,
  renderBoundedReport,
  syntheticProvenanceDatabaseMarker,
  verifySyntheticProvenanceSnapshot,
} from "./staff-task-integrity-reconciliation-proposal-dry-run.mjs";

const NOW = new Date("2026-07-27T00:00:00.000Z");
const RELEASE_SHA = "a".repeat(40);
const ADMISSION_HMAC_KEY = "unit-test-admission-hmac-key-aaaaaaaaaaaaaaaa";
const DRY_RUN_HMAC_KEY = "unit-test-proposal-hmac-key-bbbbbbbbbbbbbbbbb";
const PROVENANCE_HMAC_KEY = "unit-test-provenance-hmac-key-ccccccccccccccc";
const DATABASE_NAME = "leetplus_ci_test";
const MUTATING_KEYWORD_PATTERN =
  /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE|VACUUM|ANALYZE|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY\s+LABEL)\b/iu;

function environment(overrides = {}) {
  const provenanceManifest = buildSyntheticProvenanceManifest(
    {
      releaseSha: RELEASE_SHA,
      databaseIdentityDigest: "c".repeat(64),
      creationNonce: "d".repeat(64),
      createdAt: "2026-07-26T23:59:00.000Z",
      expiresAt: "2026-07-27T01:00:00.000Z",
    },
    PROVENANCE_HMAC_KEY,
  );
  return {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://reader:secret@127.0.0.1:5432/${DATABASE_NAME}?schema=public`,
    RELEASE_SHA,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION: "SYNTHETIC",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: EXPAND_STATE,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_DATABASE: DATABASE_NAME,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CONFIRM: ADMISSION_RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ISOLATION_ATTESTATION:
      ISOLATION_ATTESTATION,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_HMAC_KEY: ADMISSION_HMAC_KEY,
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_SNAPSHOT_DIGEST: "b".repeat(64),
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_APPROVAL_REFERENCE:
      "synthetic:proposal-unit-test",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_ACQUIRED_AT:
      "2026-07-26T23:58:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_RESTORED_AT:
      "2026-07-26T23:59:00.000Z",
    STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPIRES_AT:
      "2026-07-28T00:00:00.000Z",
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM: RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY: DRY_RUN_HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY:
      PROVENANCE_HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST:
      encodeSyntheticProvenanceManifest(provenanceManifest),
    ...overrides,
  };
}

function config(overrides = {}) {
  const parsed = parseRuntimeContract(environment(), NOW);
  return {
    ...parsed,
    ...overrides,
    admission: {
      ...parsed.admission,
      ...(overrides.admission ?? {}),
    },
  };
}

function inventoryRows(overrides = {}) {
  return FINDING_MANIFEST.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    count: String(overrides[finding.code] ?? 0),
  }));
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
    writable_sequence_count: "0",
    selectable_sequence_count: "0",
    executable_user_function_count: "0",
    foreign_server_usage_count: "0",
    large_object_privilege_count: "0",
    required_select_missing_count: "0",
    ...overrides,
  };
}

function admissionRows() {
  return {
    snapshotRow: {
      generated_at: new Date("2026-07-27T00:00:00.000Z"),
      current_schema: "public",
      current_database: DATABASE_NAME,
      cluster_system_identifier: "7667202810308916656",
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
      manifestDigest: "e".repeat(64),
    },
  };
}

function planFor(
  dryRunConfig,
  findings = {},
  { generatedAt = "2026-07-27T00:00:00.000Z" } = {},
) {
  return buildPlan({
    config: {
      target: "development",
      productionAttested: false,
      releaseSha: dryRunConfig.admission.releaseSha,
      hmacKey: dryRunConfig.hmacKey,
      expectedDatabaseName: DATABASE_NAME,
      staleStartedMinutes: dryRunConfig.staleStartedMinutes,
      failedWindowDays: dryRunConfig.failedWindowDays,
      failedThreshold: dryRunConfig.failedThreshold,
      lockTimeoutMs: dryRunConfig.admission.lockTimeoutMs,
      statementTimeoutMs: dryRunConfig.admission.statementTimeoutMs,
      transactionTimeoutMs: dryRunConfig.admission.transactionTimeoutMs,
      maxCandidates: dryRunConfig.maxCases,
    },
    rows: inventoryRows(findings),
    snapshotRow: {
      generated_at: generatedAt,
      current_schema: "public",
      current_database: DATABASE_NAME,
      cluster_system_identifier: "7667202810308916656",
      database_oid: "16384",
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
    inventoryExecuted: true,
  });
}

function admissionReport(dryRunConfig, { decision = "ADMITTED" } = {}) {
  const report = buildAdmissionReport({
    config: dryRunConfig.admission,
    ...admissionRows(),
  });
  if (decision !== report.summary.decision) {
    report.summary.decision = decision;
  }
  return report;
}

function proposalRow(code, overrides = {}) {
  const action = PROPOSAL_ACTIONS[code];
  assert.ok(action, `Unknown proposal test fixture code: ${code}`);
  return {
    code,
    resource_type: action.resourceType,
    resource_id: "raw-resource-id",
    tenant_id: "raw-tenant-a",
    target_column: action.targetColumn,
    current_value: "raw-reference-id",
    updated_at: "2026-07-27T00:00:00.000Z",
    related_tenant_id: "raw-tenant-b",
    context_value: null,
    ...overrides,
  };
}

function reportFor({
  dryRunConfig = config(),
  findings = {},
  proposalRows = [],
  generatedAt,
  admission = admissionReport(dryRunConfig),
  gates = {},
} = {}) {
  const plan = planFor(dryRunConfig, findings, { generatedAt });
  return buildDryRunReport({
    config: dryRunConfig,
    admissionReport: admission,
    plan,
    proposalRows,
    privilegeReady: true,
    releaseArtifactReady: true,
    rlsReady: true,
    advisoryLockAcquired: true,
    provenanceBinding: {
      ready: true,
      bindingDigest: "9".repeat(64),
    },
    databaseIdentityDigest: admission.databaseIdentityDigest,
    ...gates,
  });
}

test("CLI is fail-closed even when help accompanies a mutation-like option", () => {
  assert.deepEqual(parseArguments([]), {
    help: false,
    selfTest: false,
    pretty: false,
  });
  assert.deepEqual(parseArguments(["--help"]), {
    help: true,
    selfTest: false,
    pretty: false,
  });
  assert.deepEqual(parseArguments(["--pretty", "--self-test"]), {
    help: false,
    selfTest: true,
    pretty: true,
  });

  for (const argv of [
    ["--apply"],
    ["--apply", "--help"],
    ["--help", "--apply"],
    ["--fix"],
    ["--delete"],
    ["--target", "production"],
  ]) {
    assert.throws(() => parseArguments(argv), {
      code: "CLI_ARGUMENT_UNSUPPORTED",
    });
  }
});

test("runtime contract accepts only a distinct-key SYNTHETIC EXPAND_162 loopback snapshot", () => {
  const parsed = parseRuntimeContract(
    environment({
      STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES: "17",
    }),
    NOW,
  );
  assert.equal(parsed.admission.classification, "SYNTHETIC");
  assert.equal(parsed.admission.expectedState, EXPAND_STATE);
  assert.equal(parsed.admission.localHost, true);
  assert.equal(parsed.maxCases, 17);
  assert.notEqual(parsed.hmacKey, parsed.admission.hmacKey);
  assert.notEqual(parsed.provenanceHmacKey, parsed.hmacKey);
  assert.notEqual(parsed.provenanceHmacKey, parsed.admission.hmacKey);
  assert.equal(parsed.provenance.releaseSha, RELEASE_SHA);
  assert.match(parsed.provenance.signature, /^[0-9a-f]{64}$/u);

  const rejected = [
    [
      {
        STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_STATE: "BASELINE_156",
      },
      "SYNTHETIC_EXPAND_ADMISSION_REQUIRED",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_CLASSIFICATION:
          "PRODUCTION_LIKE",
        STAFF_TASK_INTEGRITY_SNAPSHOT_ADMISSION_EXPECTED_IDENTITY_DIGEST:
          "c".repeat(64),
      },
      "SYNTHETIC_EXPAND_ADMISSION_REQUIRED",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_CONFIRM: "almost",
      },
      "DRY_RUN_CONFIRMATION_REQUIRED",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_HMAC_KEY:
          ADMISSION_HMAC_KEY,
      },
      "HMAC_KEY_SEPARATION_REQUIRED",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_HMAC_KEY:
          ADMISSION_HMAC_KEY,
      },
      "HMAC_KEY_SEPARATION_REQUIRED",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_PROVENANCE_MANIFEST: "W10",
      },
      "SYNTHETIC_PROVENANCE_MANIFEST_INVALID",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES: "0",
      },
      "MAX_CASES_INVALID",
    ],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_DRY_RUN_MAX_CASES: "10001",
      },
      "MAX_CASES_INVALID",
    ],
  ];
  for (const [overrides, code] of rejected) {
    assert.throws(() => parseRuntimeContract(environment(overrides), NOW), {
      code,
    });
  }

  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          DATABASE_URL: `postgresql://reader:secret@db.example.test:5432/${DATABASE_NAME}?schema=public`,
        }),
        NOW,
      ),
    { code: "REMOTE_TARGET_PROHIBITED" },
  );
  assert.throws(
    () => parseRuntimeContract(environment({ NODE_ENV: "production" }), NOW),
    { code: "PRODUCTION_PROCESS_PROHIBITED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        environment({
          DATABASE_URL: `postgresql://reader:secret@127.0.0.1:5432/${DATABASE_NAME}?schema=public&options=-c%20search_path%3Devil`,
        }),
        NOW,
      ),
    { code: "DRY_RUN_DATABASE_URL_OPTIONS_PROHIBITED" },
  );
});

test("signed synthetic provenance rejects tampering, expiry, and database marker mismatch", () => {
  const snapshotRow = {
    current_database: DATABASE_NAME,
    cluster_system_identifier: "7667202810308916656",
    database_oid: "16384",
  };
  const creationNonce = "7".repeat(64);
  const manifest = buildSyntheticProvenanceManifest(
    {
      releaseSha: RELEASE_SHA,
      databaseIdentityDigest: computeDatabaseIdentityDigest(
        snapshotRow,
        PROVENANCE_HMAC_KEY,
      ),
      creationNonce,
      createdAt: "2026-07-26T23:59:00.000Z",
      expiresAt: "2026-07-27T01:00:00.000Z",
    },
    PROVENANCE_HMAC_KEY,
  );
  const parsed = parseSyntheticProvenanceManifest(
    encodeSyntheticProvenanceManifest(manifest),
    PROVENANCE_HMAC_KEY,
    { releaseSha: RELEASE_SHA, now: NOW },
  );
  const verified = verifySyntheticProvenanceSnapshot({
    provenance: parsed,
    provenanceHmacKey: PROVENANCE_HMAC_KEY,
    snapshotRow,
    provenanceRow: {
      database_comment: syntheticProvenanceDatabaseMarker(creationNonce),
      verified_at: NOW,
    },
  });
  assert.equal(verified.ready, true);
  assert.match(verified.bindingDigest, /^[0-9a-f]{64}$/u);

  const tampered = {
    ...manifest,
    signature: `${manifest.signature[0] === "0" ? "1" : "0"}${manifest.signature.slice(1)}`,
  };
  assert.throws(
    () =>
      parseSyntheticProvenanceManifest(
        encodeSyntheticProvenanceManifest(tampered),
        PROVENANCE_HMAC_KEY,
        { releaseSha: RELEASE_SHA, now: NOW },
      ),
    { code: "SYNTHETIC_PROVENANCE_BINDING_INVALID", exitCode: 3 },
  );

  const expired = buildSyntheticProvenanceManifest(
    {
      releaseSha: RELEASE_SHA,
      databaseIdentityDigest: manifest.databaseIdentityDigest,
      creationNonce,
      createdAt: "2026-07-26T22:00:00.000Z",
      expiresAt: "2026-07-26T23:00:00.000Z",
    },
    PROVENANCE_HMAC_KEY,
  );
  assert.throws(
    () =>
      parseSyntheticProvenanceManifest(
        encodeSyntheticProvenanceManifest(expired),
        PROVENANCE_HMAC_KEY,
        { releaseSha: RELEASE_SHA, now: NOW },
      ),
    { code: "SYNTHETIC_PROVENANCE_TIMELINE_INVALID", exitCode: 3 },
  );

  for (const [rejectedSnapshot, databaseComment] of [
    [snapshotRow, syntheticProvenanceDatabaseMarker("8".repeat(64))],
    [
      { ...snapshotRow, database_oid: "16385" },
      syntheticProvenanceDatabaseMarker(manifest.creationNonce),
    ],
  ]) {
    assert.throws(
      () =>
        verifySyntheticProvenanceSnapshot({
          provenance: parsed,
          provenanceHmacKey: PROVENANCE_HMAC_KEY,
          snapshotRow: rejectedSnapshot,
          provenanceRow: {
            database_comment: databaseComment,
            verified_at: NOW,
          },
        }),
      { code: "SYNTHETIC_PROVENANCE_DATABASE_REJECTED", exitCode: 3 },
    );
  }
});

test("the catalog exposes exactly eight nullable-reference suggestions and excludes operator/review codes", () => {
  const byClassification = Object.groupBy(
    FINDING_MANIFEST,
    ({ classification }) => classification,
  );
  assert.equal(byClassification.proposal.length, 8);
  assert.equal(byClassification.operator.length, 29);
  assert.equal(byClassification.review.length, 6);
  assert.deepEqual(
    [...PROPOSAL_CODES],
    byClassification.proposal
      .map(({ code }) => code)
      .sort((left, right) => left.localeCompare(right)),
  );
  assert.deepEqual(
    Object.entries(PROPOSAL_ACTIONS)
      .map(([code, action]) => [
        code,
        action.resourceType,
        action.targetColumn,
        action.operation,
      ])
      .sort(),
    [
      [
        "RULE_CREATOR_CROSS_TENANT",
        "StaffTaskRecurringRule",
        "createdByUserId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "RULE_LAST_TASK_CROSS_TENANT",
        "StaffTaskRecurringRule",
        "lastCreatedTaskId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "RULE_LAST_TASK_SOURCE_MISMATCH",
        "StaffTaskRecurringRule",
        "lastCreatedTaskId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "RULE_TEMPLATE_CROSS_TENANT",
        "StaffTaskRecurringRule",
        "templateId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "TASK_CREATOR_CROSS_TENANT",
        "StaffTask",
        "createdByUserId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "TASK_RULE_CROSS_TENANT",
        "StaffTask",
        "sourceRecurringRuleId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "TASK_TEMPLATE_CROSS_TENANT",
        "StaffTask",
        "sourceTemplateId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
      [
        "TEMPLATE_CREATOR_CROSS_TENANT",
        "StaffTaskTemplate",
        "createdByUserId",
        "REFERENCE_CLEAR_CANDIDATE",
      ],
    ].sort(),
  );
  for (const finding of [
    ...byClassification.operator,
    ...byClassification.review,
  ]) {
    assert.equal(PROPOSAL_ACTIONS[finding.code], undefined);
  }
});

test("row and RLS SQL are bounded read-only projections without direct PII fields", () => {
  for (const sql of [PROPOSAL_ROWS_SQL, RLS_STATE_SQL]) {
    assert.equal(MUTATING_KEYWORD_PATTERN.test(sql), false);
    assert.doesNotMatch(sql, /SELECT\s+\*/iu);
    assert.doesNotMatch(sql, /;\s*\S/iu);
  }
  assert.doesNotMatch(
    PROPOSAL_ROWS_SQL,
    /"(?:email|phone|passwordHash|firstName|lastName|username|telegramId|title|description)"/iu,
  );
  assert.match(PROPOSAL_ROWS_SQL, /ORDER BY code, resource_type, resource_id/u);
  for (const code of PROPOSAL_CODES) {
    assert.match(PROPOSAL_ROWS_SQL, new RegExp(`'${code}'`, "u"));
  }
  for (const relation of [
    "_prisma_migrations",
    "Tenant",
    "Store",
    "User",
    "UserStoreAccess",
    "StaffTaskTemplate",
    "StaffTaskRecurringRule",
    "StaffTaskRecurringRuleRun",
    "StaffTask",
  ]) {
    assert.match(RLS_STATE_SQL, new RegExp(`'${relation}'`, "u"));
  }
});

test("the two last-task findings coalesce into one review-required case", () => {
  const dryRunConfig = config();
  const plan = planFor(dryRunConfig, {
    RULE_LAST_TASK_CROSS_TENANT: 1,
    RULE_LAST_TASK_SOURCE_MISMATCH: 1,
  });
  const common = {
    resource_id: "raw-rule-id",
    tenant_id: "raw-tenant-a",
    current_value: "raw-task-id",
    updated_at: "2026-07-27T00:00:00.000Z",
    related_tenant_id: "raw-tenant-b",
  };
  const cases = buildProposalCases({
    config: dryRunConfig,
    plan,
    databaseIdentityDigest: plan.databaseIdentityDigest,
    rows: [
      proposalRow("RULE_LAST_TASK_CROSS_TENANT", {
        ...common,
        context_value: "raw-other-rule-id",
      }),
      proposalRow("RULE_LAST_TASK_SOURCE_MISMATCH", {
        ...common,
        context_value: "raw-other-rule-id",
      }),
    ],
  });

  assert.equal(cases.length, 1);
  assert.deepEqual(cases[0].target, {
    resourceType: "StaffTaskRecurringRule",
    column: "lastCreatedTaskId",
  });
  assert.deepEqual(cases[0].suggestion, {
    kind: "REFERENCE_CLEAR_CANDIDATE",
    reasonCodes: [
      "RULE_LAST_TASK_CROSS_TENANT",
      "RULE_LAST_TASK_SOURCE_MISMATCH",
    ],
    ownerApprovalRequired: true,
    fullInvariantRecheckRequired: true,
  });
});

test("aggregate/row mismatches and conflicting duplicate preconditions reject without partial cases", () => {
  const dryRunConfig = config();
  const oneFindingPlan = planFor(dryRunConfig, {
    TEMPLATE_CREATOR_CROSS_TENANT: 1,
  });
  assert.throws(
    () =>
      buildProposalCases({
        config: dryRunConfig,
        plan: oneFindingPlan,
        databaseIdentityDigest: oneFindingPlan.databaseIdentityDigest,
        rows: [
          proposalRow("TEMPLATE_CREATOR_CROSS_TENANT", {
            code: "TASK_STORE_CROSS_TENANT",
          }),
        ],
      }),
    { code: "DATABASE_PROPOSAL_CODE_INVALID" },
  );
  assert.throws(
    () =>
      buildProposalCases({
        config: dryRunConfig,
        plan: oneFindingPlan,
        databaseIdentityDigest: oneFindingPlan.databaseIdentityDigest,
        rows: [
          proposalRow("TEMPLATE_CREATOR_CROSS_TENANT", {
            target_column: "tenantId",
          }),
        ],
      }),
    { code: "DATABASE_PROPOSAL_TARGET_INVALID" },
  );
  assert.throws(
    () =>
      buildProposalCases({
        config: dryRunConfig,
        plan: oneFindingPlan,
        databaseIdentityDigest: oneFindingPlan.databaseIdentityDigest,
        rows: [],
      }),
    { code: "PROPOSAL_COUNT_MISMATCH", exitCode: 3 },
  );

  const twoFindingPlan = planFor(dryRunConfig, {
    RULE_LAST_TASK_CROSS_TENANT: 1,
    RULE_LAST_TASK_SOURCE_MISMATCH: 1,
  });
  assert.throws(
    () =>
      buildProposalCases({
        config: dryRunConfig,
        plan: twoFindingPlan,
        databaseIdentityDigest: twoFindingPlan.databaseIdentityDigest,
        rows: [
          proposalRow("RULE_LAST_TASK_CROSS_TENANT", {
            resource_id: "raw-rule-id",
            current_value: "raw-task-id",
          }),
          proposalRow("RULE_LAST_TASK_SOURCE_MISMATCH", {
            resource_id: "raw-rule-id",
            current_value: "raw-task-id",
            updated_at: "2026-07-27T00:00:01.000Z",
          }),
        ],
      }),
    { code: "PROPOSAL_DEDUPLICATION_CONFLICT", exitCode: 3 },
  );
});

test("operator findings remain aggregate-only when an allowed proposal is present", () => {
  const dryRunConfig = config();
  const report = reportFor({
    dryRunConfig,
    findings: {
      TEMPLATE_CREATOR_CROSS_TENANT: 1,
      TASK_STORE_CROSS_TENANT: 1,
    },
    proposalRows: [proposalRow("TEMPLATE_CREATOR_CROSS_TENANT")],
  });

  assert.equal(report.summary.decision, "OPERATOR_ACTION_REQUIRED");
  assert.equal(report.summary.proposalOccurrences, 1);
  assert.equal(report.summary.operatorOccurrences, 1);
  assert.equal(report.cases.length, 1);
  assert.deepEqual(report.cases[0].suggestion.reasonCodes, [
    "TEMPLATE_CREATOR_CROSS_TENANT",
  ]);
  assert.equal(exitCodeForDryRun(report, dryRunConfig.hmacKey), 2);
});

test("reports contain pseudonymous evidence and never expose row identities or keys", () => {
  const dryRunConfig = config();
  const rawValues = [
    "raw-resource-id",
    "raw-tenant-a",
    "raw-reference-id",
    "raw-tenant-b",
    "raw-context-id",
    dryRunConfig.hmacKey,
    dryRunConfig.admission.hmacKey,
  ];
  const report = reportFor({
    dryRunConfig,
    findings: { TEMPLATE_CREATOR_CROSS_TENANT: 1 },
    proposalRows: [
      proposalRow("TEMPLATE_CREATOR_CROSS_TENANT", {
        context_value: "raw-context-id",
      }),
    ],
  });

  assert.equal(report.cases.length, 1);
  assert.match(report.cases[0].caseToken, /^[0-9a-f]{64}$/u);
  assert.match(report.cases[0].preconditionDigest, /^[0-9a-f]{64}$/u);
  assert.equal(report.safety.outputContainsRawIdentifiers, false);
  assert.equal(report.safety.suggestionsAuthorizeApply, false);
  const serialized = JSON.stringify(report);
  for (const rawValue of rawValues) {
    assert.equal(serialized.includes(rawValue), false);
  }
  assert.equal(exitCodeForDryRun(report, dryRunConfig.hmacKey), 2);
});

test("case evidence is deterministic within one execution and unlinkable across executions", () => {
  const dryRunConfig = config();
  const findings = { TEMPLATE_CREATOR_CROSS_TENANT: 1 };
  const first = reportFor({
    dryRunConfig,
    findings,
    proposalRows: [proposalRow("TEMPLATE_CREATOR_CROSS_TENANT")],
  });
  const repeated = reportFor({
    dryRunConfig,
    findings,
    proposalRows: [proposalRow("TEMPLATE_CREATOR_CROSS_TENANT")],
  });
  assert.equal(first.cases[0].caseToken, repeated.cases[0].caseToken);
  assert.equal(
    first.cases[0].preconditionDigest,
    repeated.cases[0].preconditionDigest,
  );
  assert.equal(first.contentDigest, repeated.contentDigest);
  assert.equal(first.executionDigest, repeated.executionDigest);

  const stateChanged = reportFor({
    dryRunConfig,
    findings,
    proposalRows: [
      proposalRow("TEMPLATE_CREATOR_CROSS_TENANT", {
        current_value: "raw-reference-id-after-change",
        updated_at: "2026-07-27T00:01:00.000Z",
      }),
    ],
  });
  assert.equal(first.cases[0].caseToken, stateChanged.cases[0].caseToken);
  assert.notEqual(
    first.cases[0].preconditionDigest,
    stateChanged.cases[0].preconditionDigest,
  );
  assert.notEqual(first.contentDigest, stateChanged.contentDigest);

  const laterExecution = reportFor({
    dryRunConfig,
    findings,
    proposalRows: [proposalRow("TEMPLATE_CREATOR_CROSS_TENANT")],
    generatedAt: "2026-07-27T00:02:00.000Z",
  });
  assert.notEqual(first.cases[0].caseToken, laterExecution.cases[0].caseToken);
  assert.notEqual(
    first.cases[0].preconditionDigest,
    laterExecution.cases[0].preconditionDigest,
  );
  assert.notEqual(first.contentDigest, laterExecution.contentDigest);
  assert.notEqual(first.executionDigest, laterExecution.executionDigest);
  assert.equal(first.safety.caseTokensLinkableAcrossExecutions, false);
});

test("tampering with content, execution, cases, safety, or key fails report verification", () => {
  const dryRunConfig = config();
  const report = reportFor({
    dryRunConfig,
    findings: { TEMPLATE_CREATOR_CROSS_TENANT: 1 },
    proposalRows: [proposalRow("TEMPLATE_CREATOR_CROSS_TENANT")],
  });
  assert.equal(exitCodeForDryRun(report, dryRunConfig.hmacKey), 2);

  const mutations = [
    (copy) => {
      copy.contentDigest = `0${copy.contentDigest.slice(1)}`;
    },
    (copy) => {
      copy.executionDigest = `0${copy.executionDigest.slice(1)}`;
    },
    (copy) => {
      copy.cases[0].caseToken = `0${copy.cases[0].caseToken.slice(1)}`;
    },
    (copy) => {
      copy.summary.blockingTotal = 0;
    },
    (copy) => {
      copy.safety.applySupported = true;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(report);
    mutate(copy);
    assert.equal(exitCodeForDryRun(copy, dryRunConfig.hmacKey), 1);
  }
  assert.equal(
    exitCodeForDryRun(report, "unit-test-wrong-proposal-hmac-key-cccccccccc"),
    1,
  );
});

test("rendering rejects an oversized report instead of emitting partial evidence", () => {
  assert.throws(
    () =>
      renderBoundedReport(
        {
          script: "synthetic-oversized-report",
          canary: "x".repeat(MAX_RENDERED_REPORT_BYTES),
        },
        false,
      ),
    { code: "REPORT_SIZE_LIMIT_EXCEEDED", exitCode: 3 },
  );
});

test("cap, operator, review, and pass plans have distinct fail-closed exits", () => {
  const capConfig = config({ maxCases: 1 });
  const capReport = reportFor({
    dryRunConfig: capConfig,
    findings: { TEMPLATE_CREATOR_CROSS_TENANT: 2 },
    proposalRows: [],
  });
  assert.equal(capReport.summary.decision, "CAP_EXCEEDED");
  assert.equal(capReport.summary.uniqueProposalCases, 0);
  assert.deepEqual(capReport.cases, []);
  assert.equal(exitCodeForDryRun(capReport, capConfig.hmacKey), 3);

  const operatorReport = reportFor({
    findings: { TASK_STORE_CROSS_TENANT: 1 },
  });
  assert.equal(operatorReport.summary.decision, "OPERATOR_ACTION_REQUIRED");
  assert.equal(operatorReport.summary.proposalOccurrences, 0);
  assert.deepEqual(operatorReport.cases, []);
  assert.equal(exitCodeForDryRun(operatorReport, config().hmacKey), 2);

  const reviewReport = reportFor({
    dryRunConfig: capConfig,
    findings: { TASK_TEMPLATE_STORE_MISMATCH: 1_000_000 },
  });
  assert.equal(reviewReport.summary.decision, "REVIEW");
  assert.equal(reviewReport.summary.reviewOccurrences, 1_000_000);
  assert.equal(reviewReport.summary.capExceeded, false);
  assert.deepEqual(reviewReport.cases, []);
  assert.equal(exitCodeForDryRun(reviewReport, capConfig.hmacKey), 0);

  const passReport = reportFor();
  assert.equal(passReport.summary.decision, "PASS");
  assert.deepEqual(passReport.cases, []);
  assert.equal(exitCodeForDryRun(passReport, config().hmacKey), 0);
});

test("admission and same-snapshot gates reject before a proposal report is issued", () => {
  const dryRunConfig = config();
  const rejectedAdmission = admissionReport(dryRunConfig, {
    decision: "REJECTED",
  });
  assert.throws(
    () =>
      reportFor({
        dryRunConfig,
        admission: rejectedAdmission,
      }),
    { code: "ADMISSION_BINDING_INVALID", exitCode: 3 },
  );

  for (const gates of [
    { privilegeReady: false },
    { releaseArtifactReady: false },
    { rlsReady: false },
    { advisoryLockAcquired: false },
    {
      provenanceBinding: {
        ready: false,
        bindingDigest: "9".repeat(64),
      },
    },
    { databaseIdentityDigest: "0".repeat(64) },
  ]) {
    assert.throws(
      () =>
        reportFor({
          dryRunConfig,
          gates,
        }),
      { code: "DRY_RUN_GATE_REJECTED", exitCode: 3 },
    );
  }
});
