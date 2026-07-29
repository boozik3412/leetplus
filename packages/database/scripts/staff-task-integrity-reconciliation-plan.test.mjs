import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_STATE_SQL,
  COMPOSITE_CONSTRAINTS,
  CURRENT_SCHEMA_CONTRACT,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  FINDING_MANIFEST,
  FROZEN_EXPAND_SCHEMA_CONTRACT,
  MIGRATION_STATE_SQL,
  PARENT_INDEXES,
  PROTECTED_MIGRATION_PREFIX_COUNT,
  PROTECTED_MIGRATION_PREFIX_LATEST,
  PRODUCTION_ATTESTATION,
  READ_QUERY_TEXTS,
  RUN_CONFIRMATION,
  SIMPLE_CONSTRAINTS,
  SNAPSHOT_STATE_SQL,
  buildPlan,
  canonicalStringify,
  computeDatabaseIdentityDigest,
  exitCodeForPlan,
  parseArguments,
  parseRuntimeContract,
  runSelfTest,
  scanDatabase,
} from "./staff-task-integrity-reconciliation-plan.mjs";
import { INVENTORY_SQL } from "./staff-task-integrity-inventory.mjs";

const HMAC_KEY = "unit-test-reconciliation-hmac-key-32-bytes";
const RELEASE_SHA = "a".repeat(40);

function stagingEnvironment(overrides = {}) {
  return {
    DATABASE_URL:
      "postgresql://planner:secret@127.0.0.1:5432/example?schema=public",
    RELEASE_SHA,
    STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: "staging",
    STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM: RUN_CONFIRMATION,
    STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY: HMAC_KEY,
    STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE: "leetplus_staging",
    ...overrides,
  };
}

function rows(overrides = {}) {
  return FINDING_MANIFEST.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    count: String(overrides[finding.code] ?? 0),
  }));
}

function config(overrides = {}) {
  return {
    target: "staging",
    productionAttested: false,
    releaseSha: RELEASE_SHA,
    hmacKey: HMAC_KEY,
    expectedDatabaseName: "leetplus_staging",
    staleStartedMinutes: 60,
    failedWindowDays: 14,
    failedThreshold: 3,
    lockTimeoutMs: 500,
    statementTimeoutMs: 30_000,
    transactionTimeoutMs: 120_000,
    maxCandidates: 10_000,
    ...overrides,
  };
}

function planInput(overrides = {}) {
  return {
    config: config(overrides.config),
    rows: rows(overrides.findings),
    snapshotRow: {
      generated_at: overrides.generatedAt ?? "2026-07-27T00:00:00.000Z",
      current_schema: overrides.currentSchema ?? "public",
      current_database: overrides.currentDatabase ?? "leetplus_staging",
      cluster_system_identifier:
        overrides.clusterSystemIdentifier ?? "7667202810308916656",
      database_oid: String(overrides.databaseOid ?? 16_384),
    },
    migrationRow: {
      migration_count: String(
        overrides.migrationCount ?? EXPECTED_MIGRATION_COUNT,
      ),
      latest_migration: overrides.latestMigration ?? EXPECTED_LATEST_MIGRATION,
      unfinished_migration_count: String(
        overrides.unfinishedMigrationCount ?? 0,
      ),
    },
    catalogRow: {
      composite_contract_match_count: String(
        overrides.compositeContractMatchCount ?? COMPOSITE_CONSTRAINTS.length,
      ),
      simple_contract_match_count: String(
        overrides.simpleContractMatchCount ?? SIMPLE_CONSTRAINTS.length,
      ),
      foreign_key_contract_mismatch_count: String(
        overrides.foreignKeyContractMismatchCount ?? 0,
      ),
      unexpected_protected_foreign_key_count: String(
        overrides.unexpectedProtectedForeignKeyCount ?? 0,
      ),
      parent_index_contract_match_count: String(
        overrides.parentIndexContractMatchCount ?? PARENT_INDEXES.length,
      ),
      parent_index_contract_mismatch_count: String(
        overrides.parentIndexContractMismatchCount ?? 0,
      ),
    },
    inventoryExecuted: overrides.inventoryExecuted ?? true,
    schemaContract: overrides.schemaContract,
  };
}

test("help short-circuits unsupported and mutation-like CLI options", () => {
  assert.deepEqual(parseArguments(["--apply", "--help", "--pretty"]), {
    help: true,
    selfTest: false,
    pretty: false,
  });
  assert.deepEqual(parseArguments(["--pretty", "--self-test"]), {
    help: false,
    selfTest: true,
    pretty: true,
  });
  for (const argument of ["--apply", "--fix", "--delete", "--target"]) {
    assert.throws(() => parseArguments([argument]), {
      code: "CLI_ARGUMENT_UNSUPPORTED",
    });
  }
});

test("runtime contract requires exact target, confirmation, SHA, and HMAC key", () => {
  const parsed = parseRuntimeContract(stagingEnvironment());
  assert.equal(parsed.target, "staging");
  assert.equal(parsed.releaseSha, RELEASE_SHA);
  assert.equal(parsed.maxCandidates, 10_000);

  const cases = [
    [
      { STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: " staging " },
      "TARGET_ENVIRONMENT_REQUIRED",
    ],
    [
      { STAFF_TASK_INTEGRITY_RECONCILIATION_CONFIRM: "yes" },
      "RUN_CONFIRMATION_REQUIRED",
    ],
    [{ RELEASE_SHA: "A".repeat(40) }, "RELEASE_SHA_INVALID"],
    [{ RELEASE_SHA: "a".repeat(39) }, "RELEASE_SHA_INVALID"],
    [
      { STAFF_TASK_INTEGRITY_RECONCILIATION_HMAC_KEY: "too-short" },
      "HMAC_KEY_INVALID",
    ],
    [{ DATABASE_URL: "" }, "DATABASE_URL_REQUIRED"],
    [
      {
        STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE: "leetplus",
      },
      "EXPECTED_DATABASE_TARGET_MISMATCH",
    ],
  ];
  for (const [overrides, errorCode] of cases) {
    assert.throws(() => parseRuntimeContract(stagingEnvironment(overrides)), {
      code: errorCode,
    });
  }
});

test("production requires exact attestation and NODE_ENV cannot disguise target", () => {
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: "production",
        }),
      ),
    { code: "PRODUCTION_ATTESTATION_REQUIRED" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          NODE_ENV: "production",
        }),
      ),
    { code: "PRODUCTION_TARGET_MISMATCH" },
  );

  const parsed = parseRuntimeContract(
    stagingEnvironment({
      NODE_ENV: "production",
      STAFF_TASK_INTEGRITY_RECONCILIATION_TARGET: "production",
      STAFF_TASK_INTEGRITY_RECONCILIATION_EXPECTED_DATABASE: "leetplus",
      STAFF_TASK_INTEGRITY_RECONCILIATION_PRODUCTION_ATTESTATION:
        PRODUCTION_ATTESTATION,
    }),
  );
  assert.equal(parsed.productionAttested, true);
});

test("runtime limits are bounded and ordered", () => {
  const bounded = parseRuntimeContract(
    stagingEnvironment({
      STAFF_TASK_INTEGRITY_RECONCILIATION_LOCK_TIMEOUT_MS: "1000",
      STAFF_TASK_INTEGRITY_RECONCILIATION_STATEMENT_TIMEOUT_MS: "2000",
      STAFF_TASK_INTEGRITY_RECONCILIATION_TRANSACTION_TIMEOUT_MS: "5000",
      STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES: "77",
    }),
  );
  assert.equal(bounded.lockTimeoutMs, 1000);
  assert.equal(bounded.statementTimeoutMs, 2000);
  assert.equal(bounded.transactionTimeoutMs, 5000);
  assert.equal(bounded.maxCandidates, 77);

  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_RECONCILIATION_MAX_CANDIDATES: "1000001",
        }),
      ),
    { code: "MAX_CANDIDATES_INVALID" },
  );
  assert.throws(
    () =>
      parseRuntimeContract(
        stagingEnvironment({
          STAFF_TASK_INTEGRITY_RECONCILIATION_LOCK_TIMEOUT_MS: "5000",
          STAFF_TASK_INTEGRITY_RECONCILIATION_STATEMENT_TIMEOUT_MS: "1000",
        }),
      ),
    { code: "TIMEOUT_ORDER_INVALID" },
  );
});

test("planner defaults to CURRENT_167 and permits only sanctioned schema contracts", () => {
  const current = buildPlan(planInput());
  assert.equal(current.schema.ready, true);
  assert.equal(
    current.schema.expected.migrationCount,
    CURRENT_SCHEMA_CONTRACT.migrationCount,
  );
  assert.equal(
    current.schema.expected.latestMigration,
    CURRENT_SCHEMA_CONTRACT.latestMigration,
  );
  assert.equal(CURRENT_SCHEMA_CONTRACT.state, "CURRENT_167");

  const frozen = buildPlan(
    planInput({
      schemaContract: FROZEN_EXPAND_SCHEMA_CONTRACT,
      migrationCount: PROTECTED_MIGRATION_PREFIX_COUNT,
      latestMigration: PROTECTED_MIGRATION_PREFIX_LATEST,
    }),
  );
  assert.equal(frozen.schema.ready, true);
  assert.equal(
    frozen.schema.expected.migrationCount,
    PROTECTED_MIGRATION_PREFIX_COUNT,
  );
  assert.equal(
    frozen.schema.expected.latestMigration,
    PROTECTED_MIGRATION_PREFIX_LATEST,
  );

  const frozenRowsUnderCurrentDefault = buildPlan(
    planInput({
      migrationCount: PROTECTED_MIGRATION_PREFIX_COUNT,
      latestMigration: PROTECTED_MIGRATION_PREFIX_LATEST,
      inventoryExecuted: false,
    }),
  );
  assert.equal(frozenRowsUnderCurrentDefault.schema.ready, false);

  const currentRowsUnderFrozenContract = buildPlan(
    planInput({
      schemaContract: FROZEN_EXPAND_SCHEMA_CONTRACT,
      inventoryExecuted: false,
    }),
  );
  assert.equal(currentRowsUnderFrozenContract.schema.ready, false);

  for (const schemaContract of [
    null,
    {
      ...FROZEN_EXPAND_SCHEMA_CONTRACT,
      migrationCount: EXPECTED_MIGRATION_COUNT,
    },
    {
      ...CURRENT_SCHEMA_CONTRACT,
      extra: true,
    },
    {
      state: "CURRENT_163",
      migrationCount: 163,
      latestMigration: "20260728120000_tenant_execution_control_plane_expand",
    },
  ]) {
    assert.throws(
      () =>
        buildPlan(
          planInput({
            schemaContract,
          }),
        ),
      { code: "SCHEMA_CONTRACT_UNSUPPORTED" },
    );
  }
});

test("all 43 inventory codes are classified exactly once", () => {
  const inventoryCodes = [
    ...INVENTORY_SQL.matchAll(
      /SELECT\s+'([A-Z0-9_]+)'(?:\s*::text\s+AS code)?\s*,\s*'(BLOCKING|REVIEW)'/g,
    ),
  ].map((match) => ({ code: match[1], severity: match[2] }));
  const manifestCodes = FINDING_MANIFEST.map(({ code, severity }) => ({
    code,
    severity,
  }));

  assert.equal(inventoryCodes.length, 43);
  assert.equal(FINDING_MANIFEST.length, 43);
  assert.equal(new Set(FINDING_MANIFEST.map(({ code }) => code)).size, 43);
  assert.deepEqual(
    inventoryCodes.sort((left, right) => left.code.localeCompare(right.code)),
    manifestCodes.sort((left, right) => left.code.localeCompare(right.code)),
  );
  assert.deepEqual(
    new Set(FINDING_MANIFEST.map(({ classification }) => classification)),
    new Set(["proposal", "operator", "review"]),
  );
  assert.deepEqual(
    Object.fromEntries(
      ["proposal", "operator", "review"].map((classification) => [
        classification,
        FINDING_MANIFEST.filter(
          (finding) => finding.classification === classification,
        ).length,
      ]),
    ),
    { proposal: 8, operator: 29, review: 6 },
  );
  assert.deepEqual(
    FINDING_MANIFEST.find(
      ({ code }) => code === "TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID",
    ),
    {
      code: "TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID",
      severity: "BLOCKING",
      classification: "operator",
    },
  );
  for (const code of [
    "TEMPLATE_STORE_CROSS_TENANT",
    "RULE_STORE_CROSS_TENANT",
    "RULE_ASSIGNEE_CROSS_TENANT",
    "RUN_RULE_CROSS_TENANT",
    "RUN_TASK_CROSS_TENANT",
    "TASK_STORE_CROSS_TENANT",
    "TASK_ASSIGNEE_CROSS_TENANT",
    "RULE_TEMPLATE_STORE_MISMATCH",
    "RUN_TASK_SOURCE_MISMATCH",
    "STALE_STARTED_RUN",
    "REPEATED_FAILED_RUN",
  ]) {
    assert.equal(
      FINDING_MANIFEST.find((finding) => finding.code === code)?.classification,
      "operator",
      code,
    );
  }
});

test("all planner data queries are aggregate read-only SQL", () => {
  const mutatingKeyword =
    /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE)\b/i;
  assert.equal(READ_QUERY_TEXTS.length, 4);
  for (const query of READ_QUERY_TEXTS) {
    assert.doesNotMatch(query, mutatingKeyword);
    assert.doesNotMatch(query, /SELECT\s+\*/i);
  }
  assert.match(INVENTORY_SQL, /COUNT\(\*\)/);
  assert.match(SNAPSHOT_STATE_SQL, /CURRENT_TIMESTAMP/);
  assert.match(SNAPSHOT_STATE_SQL, /pg_control_system\(\)/);
  assert.match(SNAPSHOT_STATE_SQL, /JOIN pg_database/);
  assert.match(MIGRATION_STATE_SQL, /"_prisma_migrations"/);
  assert.match(MIGRATION_STATE_SQL, /FROM public\."_prisma_migrations"/);
  for (const fragment of [
    "actual.validated = false",
    "actual.deferrable = false",
    "actual.deferred = false",
    "actual.local_columns = expected.local_columns",
    "actual.parent_columns = expected.parent_columns",
    "actual.delete_action = expected.delete_action",
    "actual.update_action = expected.update_action",
    "actual.match_type = expected.match_type",
    "actual.index_relation_kind = 'i'",
    "actual.key_columns = expected.key_columns",
    "actual.unique_index",
    "actual.valid_index",
    "actual.ready_index",
    "actual.live_index",
    "actual.immediate_index",
    "NOT actual.exclusion_index",
    "actual.nonpartial",
    "actual.no_expressions",
    "actual.total_attribute_count = cardinality(expected.key_columns)",
  ]) {
    assert(CATALOG_STATE_SQL.includes(fragment), fragment);
  }

  for (const entry of [...COMPOSITE_CONSTRAINTS, ...SIMPLE_CONSTRAINTS]) {
    assert.match(CATALOG_STATE_SQL, new RegExp(`'${entry.name}'`), entry.name);
  }
  for (const entry of PARENT_INDEXES) {
    assert.match(CATALOG_STATE_SQL, new RegExp(`'${entry.name}'`), entry.name);
  }
  assert.equal(COMPOSITE_CONSTRAINTS.length, 14);
  assert.equal(SIMPLE_CONSTRAINTS.length, 14);
  assert.equal(PARENT_INDEXES.length, 5);

  assert.equal(
    new Set(
      [...COMPOSITE_CONSTRAINTS, ...SIMPLE_CONSTRAINTS].map(
        ({ childTable, name }) => `${childTable}\0${name}`,
      ),
    ).size,
    28,
  );
  assert.equal(new Set(PARENT_INDEXES.map(({ name }) => name)).size, 5);
  for (const entry of COMPOSITE_CONSTRAINTS) {
    assert.deepEqual(entry.localColumns.slice(0, 1), ["tenantId"]);
    assert.deepEqual(entry.parentColumns, ["tenantId", "id"]);
    assert.equal(entry.localColumns.length, 2);
    assert.equal(entry.updateAction, "r");
    assert.equal(entry.matchType, "s");
    assert(entry.parentIndex);
    if (entry.deleteSetColumns !== null) {
      assert.deepEqual(entry.deleteSetColumns, [entry.localColumns[1]]);
    }
  }
  for (const entry of SIMPLE_CONSTRAINTS) {
    assert.equal(entry.localColumns.length, 1);
    assert.deepEqual(entry.parentColumns, ["id"]);
    assert.equal(entry.updateAction, "r");
    assert.equal(entry.matchType, "s");
    assert.equal(entry.deleteSetColumns, null);
    assert.equal(entry.parentIndex, null);
  }
  for (const entry of PARENT_INDEXES) {
    assert.deepEqual(entry.columns, ["tenantId", "id"]);
  }
});

test("digests separate stable content from timestamp-bound execution", () => {
  assert.equal(
    canonicalStringify({ z: 1, a: { y: 2, x: 3 } }),
    canonicalStringify({ a: { x: 3, y: 2 }, z: 1 }),
  );

  const first = buildPlan(planInput());
  const later = buildPlan(
    planInput({ generatedAt: "2027-05-01T12:00:00.000Z" }),
  );
  assert.equal(first.contentDigest, later.contentDigest);
  assert.notEqual(first.executionDigest, later.executionDigest);
  assert.equal(first.databaseIdentityDigest, later.databaseIdentityDigest);
  assert.notEqual(first.generatedAt, later.generatedAt);
  assert.match(first.databaseIdentityDigest, /^[0-9a-f]{64}$/);
  assert.match(first.contentDigest, /^[0-9a-f]{64}$/);
  assert.match(first.executionDigest, /^[0-9a-f]{64}$/);
  assert.equal(first.safety.proposalIsAuthorization, false);
  assert.equal(first.safety.applySupported, false);
  assert.equal(first.safety.databaseWrites, false);

  const changed = buildPlan(
    planInput({ findings: { TEMPLATE_STORE_CROSS_TENANT: 1 } }),
  );
  assert.notEqual(first.contentDigest, changed.contentDigest);
  assert.notEqual(first.executionDigest, changed.executionDigest);

  const otherDatabase = buildPlan(
    planInput({
      config: { expectedDatabaseName: "other_staging" },
      currentDatabase: "other_staging",
      databaseOid: 16_385,
    }),
  );
  assert.equal(otherDatabase.schema.actual.databaseIdentityMatched, true);
  assert.notEqual(
    first.databaseIdentityDigest,
    otherDatabase.databaseIdentityDigest,
  );
  assert.notEqual(first.contentDigest, otherDatabase.contentDigest);
  assert.notEqual(first.executionDigest, otherDatabase.executionDigest);

  const otherCluster = buildPlan(
    planInput({
      clusterSystemIdentifier: "7667202810308916657",
    }),
  );
  assert.equal(otherCluster.schema.actual.databaseIdentityMatched, true);
  assert.notEqual(
    first.databaseIdentityDigest,
    otherCluster.databaseIdentityDigest,
  );
  assert.notEqual(first.contentDigest, otherCluster.contentDigest);
  assert.notEqual(first.executionDigest, otherCluster.executionDigest);
  assert.equal(
    computeDatabaseIdentityDigest(planInput().snapshotRow, HMAC_KEY),
    first.databaseIdentityDigest,
  );

  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(serialized, new RegExp(HMAC_KEY));
  assert.doesNotMatch(serialized, /planner:secret/);
  assert.doesNotMatch(serialized, /leetplus_staging/);
  assert.doesNotMatch(serialized, /7667202810308916656/);
  assert.doesNotMatch(
    serialized,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});

test("exit decisions distinguish findings, review, cap, and schema mismatch", () => {
  const pass = buildPlan(planInput());
  assert.equal(pass.summary.decision, "PASS");
  assert.equal(exitCodeForPlan(pass), 0);

  const review = buildPlan(
    planInput({
      config: { maxCandidates: 1 },
      findings: { ACTIVE_TEMPLATE_NULL_STORE: 2 },
    }),
  );
  assert.equal(review.summary.decision, "REVIEW");
  assert.equal(review.summary.blockingTotal, 0);
  assert.equal(review.summary.candidateOccurrences, 0);
  assert.equal(review.summary.observedOccurrences, 2);
  assert.equal(review.summary.capExceeded, false);
  assert.equal(exitCodeForPlan(review), 0);

  const findings = buildPlan(
    planInput({
      findings: { TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID: 1 },
    }),
  );
  assert.equal(findings.summary.decision, "FINDINGS");
  assert.equal(findings.summary.blockingTotal, 1);
  assert.equal(exitCodeForPlan(findings), 2);

  const cap = buildPlan(
    planInput({
      config: { maxCandidates: 1 },
      findings: { TASK_ASSIGNEE_GLOBAL_SCOPE_INVALID: 2 },
    }),
  );
  assert.equal(cap.summary.decision, "CAP_EXCEEDED");
  assert.equal(cap.summary.capExceeded, true);
  assert.equal(exitCodeForPlan(cap), 3);

  for (const mismatch of [
    { currentSchema: "shadow" },
    { currentDatabase: "another_staging" },
    { migrationCount: 161 },
    { latestMigration: "20260727130500_staff_task_tenant_key" },
    { unfinishedMigrationCount: 1 },
    { compositeContractMatchCount: 13 },
    { compositeContractMatchCount: 15 },
    { simpleContractMatchCount: 13 },
    { simpleContractMatchCount: 15 },
    { foreignKeyContractMismatchCount: 1 },
    { unexpectedProtectedForeignKeyCount: 1 },
    { parentIndexContractMatchCount: 4 },
    { parentIndexContractMatchCount: 6 },
    { parentIndexContractMismatchCount: 1 },
  ]) {
    const plan = buildPlan(
      planInput({ ...mismatch, inventoryExecuted: false }),
    );
    assert.equal(plan.schema.ready, false);
    assert.equal(plan.summary.decision, "SCHEMA_MISMATCH");
    assert.equal(exitCodeForPlan(plan), 3);
  }

  assert.throws(() => buildPlan(planInput({ inventoryExecuted: false })), {
    code: "INVENTORY_EXECUTION_STATE_INVALID",
  });
  assert.throws(
    () =>
      buildPlan(
        planInput({
          migrationCount: 161,
          inventoryExecuted: true,
        }),
      ),
    { code: "INVENTORY_EXECUTION_STATE_INVALID" },
  );
  assert.equal(
    exitCodeForPlan({
      schema: { ready: true },
      summary: {
        inventoryExecuted: false,
        capExceeded: false,
        blockingTotal: null,
      },
    }),
    1,
  );
});

test("database scan uses one connection and one read-only repeatable-read transaction", async () => {
  const events = [];
  let constructorCount = 0;
  const queryResults = new Map([
    [
      SNAPSHOT_STATE_SQL,
      [
        {
          generated_at: new Date("2026-07-27T00:00:00.000Z"),
          current_schema: "public",
          current_database: "leetplus_staging",
          cluster_system_identifier: "7667202810308916656",
          database_oid: "16384",
        },
      ],
    ],
    [
      MIGRATION_STATE_SQL,
      [
        {
          migration_count: String(EXPECTED_MIGRATION_COUNT),
          latest_migration: EXPECTED_LATEST_MIGRATION,
          unfinished_migration_count: "0",
        },
      ],
    ],
    [
      CATALOG_STATE_SQL,
      [
        {
          composite_contract_match_count: "14",
          simple_contract_match_count: "14",
          foreign_key_contract_mismatch_count: "0",
          unexpected_protected_foreign_key_count: "0",
          parent_index_contract_match_count: "5",
          parent_index_contract_mismatch_count: "0",
        },
      ],
    ],
  ]);

  class FakePrismaClient {
    constructor(options) {
      constructorCount += 1;
      events.push(["construct", options]);
    }

    async $transaction(callback, options) {
      events.push(["transaction", options]);
      const transaction = {
        async $executeRawUnsafe(query) {
          events.push(["execute", query]);
          return 0;
        },
        async $queryRawUnsafe(query, ...parameters) {
          events.push(["query", query, parameters]);
          if (query.includes("current_setting('transaction_read_only')")) {
            return [{ read_only: "on", isolation: "repeatable read" }];
          }
          if (query === INVENTORY_SQL) {
            return rows();
          }
          const result = queryResults.get(query);
          assert(result, "unexpected read query");
          return result;
        },
      };
      return callback(transaction);
    }

    async $disconnect() {
      events.push(["disconnect"]);
    }
  }

  const parsedConfig = parseRuntimeContract(stagingEnvironment());
  const plan = await scanDatabase(
    stagingEnvironment(),
    parsedConfig,
    FakePrismaClient,
  );
  assert.equal(constructorCount, 1);
  assert.equal(plan.summary.decision, "PASS");
  assert.equal(plan.summary.inventoryExecuted, true);

  const construct = events.find(([kind]) => kind === "construct");
  const datasource = new URL(construct[1].datasourceUrl);
  assert.equal(datasource.searchParams.get("connection_limit"), "1");
  assert.match(
    datasource.searchParams.get("options") ?? "",
    /default_transaction_read_only=on/,
  );

  const transactions = events.filter(([kind]) => kind === "transaction");
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0][1], {
    isolationLevel: "RepeatableRead",
    timeout: 120_000,
    maxWait: 10_000,
  });

  const executes = events
    .filter(([kind]) => kind === "execute")
    .map(([, query]) => query);
  assert.equal(executes.length, 4);
  assert.equal(executes[0], "SET TRANSACTION READ ONLY");
  for (const query of executes) {
    assert.match(query, /^SET (?:TRANSACTION|LOCAL) /);
  }

  const queries = events
    .filter(([kind]) => kind === "query")
    .map(([, query]) => query);
  assert.equal(queries.length, 5);
  assert.equal(queries.filter((query) => query === INVENTORY_SQL).length, 1);
  assert.equal(
    queries.filter((query) => query === SNAPSHOT_STATE_SQL).length,
    1,
  );
  assert.equal(
    queries.filter((query) => query === MIGRATION_STATE_SQL).length,
    1,
  );
  assert.equal(
    queries.filter((query) => query === CATALOG_STATE_SQL).length,
    1,
  );
  assert(queries.indexOf(CATALOG_STATE_SQL) < queries.indexOf(INVENTORY_SQL));
  assert.equal(events.filter(([kind]) => kind === "disconnect").length, 1);
});

test("database scan rejects catalog drift before running inventory", async () => {
  let inventoryQueries = 0;
  let disconnects = 0;

  class DriftedCatalogPrismaClient {
    async $transaction(callback) {
      return callback({
        async $executeRawUnsafe() {
          return 0;
        },
        async $queryRawUnsafe(query) {
          if (query.includes("current_setting('transaction_read_only')")) {
            return [{ read_only: "on", isolation: "repeatable read" }];
          }
          if (query === SNAPSHOT_STATE_SQL) {
            return [
              {
                generated_at: new Date("2026-07-27T00:00:00.000Z"),
                current_schema: "public",
                current_database: "leetplus_staging",
                cluster_system_identifier: "7667202810308916656",
                database_oid: "16384",
              },
            ];
          }
          if (query === MIGRATION_STATE_SQL) {
            return [
              {
                migration_count: String(EXPECTED_MIGRATION_COUNT),
                latest_migration: EXPECTED_LATEST_MIGRATION,
                unfinished_migration_count: "0",
              },
            ];
          }
          if (query === CATALOG_STATE_SQL) {
            return [
              {
                composite_contract_match_count: "13",
                simple_contract_match_count: "14",
                foreign_key_contract_mismatch_count: "1",
                unexpected_protected_foreign_key_count: "0",
                parent_index_contract_match_count: "5",
                parent_index_contract_mismatch_count: "0",
              },
            ];
          }
          if (query === INVENTORY_SQL) {
            inventoryQueries += 1;
            return rows();
          }
          assert.fail("unexpected read query");
        },
      });
    }

    async $disconnect() {
      disconnects += 1;
    }
  }

  const environment = stagingEnvironment();
  const plan = await scanDatabase(
    environment,
    parseRuntimeContract(environment),
    DriftedCatalogPrismaClient,
  );
  assert.equal(plan.schema.ready, false);
  assert.equal(plan.summary.decision, "SCHEMA_MISMATCH");
  assert.equal(plan.summary.inventoryExecuted, false);
  assert.equal(plan.summary.blockingTotal, null);
  assert.equal(plan.summary.reviewTotal, null);
  assert.deepEqual(plan.findings, []);
  assert.equal(exitCodeForPlan(plan), 3);
  assert.equal(inventoryQueries, 0);
  assert.equal(disconnects, 1);
});

test("embedded self-test is database-independent and complete", () => {
  assert.deepEqual(runSelfTest(), {
    script: "staff-task-integrity-reconciliation-plan",
    status: "PASS",
    checks: 20,
    findingCodes: 43,
    compositeConstraints: 14,
    simpleConstraints: 14,
    parentIndexes: 5,
  });
});
