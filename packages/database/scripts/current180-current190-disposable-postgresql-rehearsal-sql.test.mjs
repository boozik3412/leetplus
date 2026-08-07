import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONNECTION_IDENTITIES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_LIVE_QUERY_EVIDENCE_REQUIREMENTS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_REQUIRED_RELATIONS,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_CONTRACT,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS,
  Current180Current190PostgresqlRehearsalSqlError,
  buildCurrent180Current190PostgresqlAlterAllowConnectionsSql,
  buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery,
  buildCurrent180Current190PostgresqlCatalogReconciliationQuery,
  buildCurrent180Current190PostgresqlCommentDatabaseSql,
  buildCurrent180Current190PostgresqlCreateDatabaseSql,
  buildCurrent180Current190PostgresqlDropDatabaseSql,
  buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest,
  buildCurrent180Current190PostgresqlRenameDatabaseSql,
  buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery,
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames,
  inspectCurrent180Current190PostgresqlConnectionIdentity,
  quoteCurrent180Current190PostgresqlIdentifier,
  quoteCurrent180Current190PostgresqlLiteral,
  reconcileCurrent180Current190PostgresqlCatalogEvidence,
  validateCurrent180Current190PostgresqlRehearsalDatabaseNames,
} from "./current180-current190-disposable-postgresql-rehearsal-sql.mjs";

const RUN_TOKEN = "0123456789abcdef".repeat(2);
const OTHER_TOKEN = "fedcba9876543210".repeat(2);
const MARKER = `LEETPLUS_CURRENT180190_REHEARSAL_V1:${"a".repeat(64)}`;
const SECOND_MARKER = `LEETPLUS_CURRENT180190_REHEARSAL_V1:${"b".repeat(64)}`;
const OWNERSHIP_MARKERS = [MARKER, SECOND_MARKER];
const NAMES =
  deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(RUN_TOKEN);

function expectSqlError(callback, code, finding = undefined) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof Current180Current190PostgresqlRehearsalSqlError);
    assert.equal(error.code, code);
    if (finding !== undefined) assert.ok(error.findings.includes(finding));
    return true;
  });
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const entry of Object.values(value)) assertDeepFrozen(entry, seen);
}

function catalogScope(overrides = {}) {
  return {
    expectedMarker: null,
    expectedOid: null,
    finalDatabaseName: NAMES.finalDatabaseName,
    ownershipMarkers: OWNERSHIP_MARKERS,
    runToken: RUN_TOKEN,
    workingDatabaseName: NAMES.workingDatabaseName,
    ...overrides,
  };
}

function catalogRow(overrides = {}) {
  return {
    activeSessionCount: 0,
    allowConnections: false,
    databaseName: NAMES.workingDatabaseName,
    databaseOid: 101,
    isTemplate: false,
    marker: null,
    ownerName: "postgres",
    ownerOid: 10,
    ...overrides,
  };
}

function identityReceipt(overrides = {}) {
  const marker =
    Object.hasOwn(overrides, "marker") && overrides.marker !== undefined
      ? overrides.marker
      : MARKER;
  const row = catalogRow({ marker, ...overrides });
  const querySpec =
    buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
      catalogScope({
        expectedMarker: row.marker,
        expectedOid: row.databaseOid,
      }),
    );
  const result = reconcileCurrent180Current190PostgresqlCatalogEvidence({
    querySpec,
    rows: [row],
  });
  assert.equal(result.decision, "STRUCTURED_IDENTITY_VERIFIED");
  assert.ok(result.identityReceipt);
  return result.identityReceipt;
}

test("exports only frozen, zero-effect contract material at import time", () => {
  assert.equal(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_CONTRACT,
    "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_SQL_V1",
  );
  assert.deepEqual(CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS, {
    databaseConnectionOpened: false,
    databaseMutationAttempted: false,
    externalProviderCallAttempted: false,
    filesystemMutationAttempted: false,
    networkCallAttempted: false,
    processSpawnAttempted: false,
    productionApplyAuthorized: false,
  });
  for (const value of [
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONNECTION_IDENTITIES,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_LIVE_QUERY_EVIDENCE_REQUIREMENTS,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_REQUIRED_RELATIONS,
  ]) {
    assertDeepFrozen(value);
  }
  assert.equal(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY.callerSuppliedRowsAcceptedAsExecutionEvidence,
    false,
  );
  assert.equal(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY.moduleStructuredIdentityReceiptIsExecutionAuthority,
    false,
  );
});

test("pins the exact source and maintenance identities without credentials", () => {
  assert.deepEqual(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONNECTION_IDENTITIES,
    {
      maintenance: {
        databaseName: "postgres",
        host: "127.0.0.1",
        port: 55_432,
        roleName: "postgres",
      },
      source: {
        databaseName: "leetplus_current179_ci",
        host: "127.0.0.1",
        port: 55_432,
        roleName: "postgres",
        schemaName: "public",
      },
    },
  );
  const source = inspectCurrent180Current190PostgresqlConnectionIdentity({
    databaseName: "leetplus_current179_ci",
    host: "127.0.0.1",
    port: 55_432,
    roleName: "postgres",
  });
  const maintenance = inspectCurrent180Current190PostgresqlConnectionIdentity({
    databaseName: "postgres",
    host: "127.0.0.1",
    port: 55_432,
    roleName: "postgres",
  });
  assert.equal(source.kind, "SOURCE");
  assert.equal(maintenance.kind, "MAINTENANCE");
  assertDeepFrozen(source);
  assertDeepFrozen(maintenance);
  assert.equal(JSON.stringify(source).includes("password"), false);
});

test("rejects any connection identity drift", () => {
  for (const candidate of [
    {
      databaseName: "leetplus_current179_ci",
      host: "localhost",
      port: 55_432,
      roleName: "postgres",
    },
    {
      databaseName: "leetplus_current179_ci",
      host: "127.0.0.1",
      port: 5432,
      roleName: "postgres",
    },
    {
      databaseName: "production",
      host: "127.0.0.1",
      port: 55_432,
      roleName: "postgres",
    },
    {
      databaseName: "postgres",
      host: "127.0.0.1",
      port: 55_432,
      roleName: "app",
    },
  ]) {
    expectSqlError(
      () => inspectCurrent180Current190PostgresqlConnectionIdentity(candidate),
      "POSTGRESQL_CONNECTION_IDENTITY_INVALID",
      "EXACT_PINNED_LOOPBACK_IDENTITY_REQUIRED",
    );
  }
});

test("derives and validates only one same-token working/final pair", () => {
  assert.deepEqual(NAMES, {
    finalDatabaseName: `lp_c180190_${RUN_TOKEN}_ci`,
    runToken: RUN_TOKEN,
    workingDatabaseName: `lp_imtec_${RUN_TOKEN}_ci`,
  });
  assert.deepEqual(
    validateCurrent180Current190PostgresqlRehearsalDatabaseNames(NAMES),
    NAMES,
  );
  for (const token of [
    "A".repeat(32),
    "a".repeat(31),
    "a".repeat(33),
    "g".repeat(32),
    "a".repeat(31) + ";",
  ]) {
    expectSqlError(
      () => deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(token),
      "POSTGRESQL_REHEARSAL_RUN_TOKEN_INVALID",
    );
  }
  expectSqlError(
    () =>
      validateCurrent180Current190PostgresqlRehearsalDatabaseNames({
        ...NAMES,
        finalDatabaseName: `lp_c180190_${OTHER_TOKEN}_ci`,
      }),
    "POSTGRESQL_REHEARSAL_DATABASE_NAMES_INVALID",
    "SAME_TOKEN_DERIVED_DATABASE_NAMES_REQUIRED",
  );
});

test("quotes PostgreSQL identifiers and literals without an injection surface", () => {
  assert.equal(
    quoteCurrent180Current190PostgresqlIdentifier(
      'safe"; DROP DATABASE prod;--',
    ),
    '"safe""; DROP DATABASE prod;--"',
  );
  assert.equal(
    quoteCurrent180Current190PostgresqlLiteral("x\\'; DROP DATABASE prod;--"),
    "E'x\\\\''; DROP DATABASE prod;--'",
  );
  expectSqlError(
    () => quoteCurrent180Current190PostgresqlIdentifier("x\u0000y"),
    "POSTGRESQL_IDENTIFIER_INVALID",
  );
  expectSqlError(
    () => quoteCurrent180Current190PostgresqlLiteral("x\u0000y"),
    "POSTGRESQL_LITERAL_INVALID",
  );
  expectSqlError(
    () => quoteCurrent180Current190PostgresqlIdentifier(Symbol("x")),
    "POSTGRESQL_IDENTIFIER_INVALID",
  );
});

test("defines exact read-only authority, ownership, migration, occupancy, and session projections", () => {
  const queries = CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES;
  for (const query of Object.values(queries)) {
    assert.equal(query.readOnly, true);
    assert.equal(query.transactionMode, "READ ONLY");
    assert.equal(query.authorityClaimed, false);
    assert.deepEqual(query.parameters, []);
    assert.equal(query.effects.databaseConnectionOpened, false);
    assert.match(query.sql, /^SELECT|^WITH/u);
    assert.match(query.querySpecDigest, /^[0-9a-f]{64}$/u);
  }
  assert.match(
    queries.sourceAuthority.sql,
    /current_setting\('server_version_num'\)/u,
  );
  assert.match(queries.sourceAuthority.sql, /currentUserCanCreateDatabase/u);
  assert.deepEqual(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_REQUIRED_RELATIONS,
    [
      "IdentityMailDeliveryTenantEnrollment",
      "IdentityMailOutbox",
      "SharedBetaRuntimeReleaseMarker",
      "Tenant",
    ],
  );
  for (const relationName of CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_REQUIRED_RELATIONS) {
    assert.ok(queries.requiredRelationOwners.sql.includes(relationName));
  }
  assert.match(
    queries.identityClaimLockOwner.sql,
    /identity_email_claim_lock_v1"\(text\)/u,
  );
  assert.deepEqual(queries.migrationRows.resultColumns, [
    "migrationName",
    "checksum",
    "finishedAt",
    "rolledBackAt",
    "appliedStepsCount",
  ]);
  for (const field of [
    "tenantCount",
    "userCount",
    "mailOutboxCount",
    "enrollmentCount",
    "claimedOutboxCount",
    "current180SuccessorObjectCount",
    "current186NamedRoutineCount",
    "otherSessionCount",
  ]) {
    assert.ok(queries.sourceOccupancy.resultColumns.includes(field));
    assert.ok(queries.sourceOccupancy.sql.includes(field));
  }
  assert.match(queries.sourceOccupancy.sql, /pg_stat_activity/u);
  assert.match(queries.sourceOccupancy.sql, /pg_backend_pid\(\)/u);
});

test("exposes exact live-query requests without accepting caller rows or module receipts", () => {
  const querySpec =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaColumns;
  const request = buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
    querySpec,
  });
  assert.equal(request.exactQuerySpec, querySpec);
  assert.equal(request.exactQuerySpecDigest, querySpec.querySpecDigest);
  assert.equal(request.runnerMustExecuteLive, true);
  assert.equal(request.callerSuppliedRowsAccepted, false);
  assert.equal(request.callerSuppliedModuleReceiptAccepted, false);
  assert.equal(request.moduleCanAttestQueryExecution, false);
  assert.deepEqual(
    request.requiredAuthenticatedReceiptFields,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_LIVE_QUERY_EVIDENCE_REQUIREMENTS.requiredAuthenticatedReceiptFields,
  );
  assertDeepFrozen(request);

  for (const invalidInput of [
    { querySpec: { ...querySpec } },
    { querySpec, rows: [] },
    { moduleReceipt: {}, querySpec },
  ]) {
    expectSqlError(
      () =>
        buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest(
          invalidInput,
        ),
      "POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_INVALID",
      "EXACT_MODULE_ISSUED_READ_ONLY_QUERY_SPEC_REQUIRED",
    );
  }
});

test("live-query request rejects accessor and proxy specs without invocation", () => {
  let getterCalls = 0;
  const accessorInput = {};
  Object.defineProperty(accessorInput, "querySpec", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.catalog;
    },
  });
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest(
        accessorInput,
      ),
    "POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_INVALID",
  );
  assert.equal(getterCalls, 0);

  let proxyCalls = 0;
  const querySpec =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.catalog;
  const proxySpec = new Proxy(querySpec, {
    get(target, key, receiver) {
      proxyCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
        querySpec: proxySpec,
      }),
    "POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_INVALID",
  );
  assert.equal(proxyCalls, 0);
});

test("builds one exhaustive catalog query across names, identity, and both run-attempt markers", () => {
  const query = buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
    catalogScope({ expectedMarker: MARKER, expectedOid: 101 }),
  );
  assert.equal(
    query.exhaustivePredicate,
    "TARGET_NAMES_OR_EXPECTED_OID_OR_EXPECTED_MARKER_OR_BOTH_RUN_ATTEMPT_MARKERS",
  );
  assert.deepEqual(query.parameters, [
    NAMES.workingDatabaseName,
    NAMES.finalDatabaseName,
    101,
    MARKER,
    ...OWNERSHIP_MARKERS,
  ]);
  assert.match(query.sql, /database\.datname IN/u);
  assert.match(query.sql, /database\.oid = scope\."expectedOid"/u);
  assert.match(query.sql, /shobj_description[\s\S]*expectedMarker/u);
  assert.match(query.sql, /attemptOneOwnershipMarker/u);
  assert.match(query.sql, /attemptTwoOwnershipMarker/u);
  assert.equal(query.readOnly, true);
  assert.equal(query.authorityClaimed, false);
  assert.equal(query.querySpecDigest, query.scopeDigest);
  assert.match(query.scopeDigest, /^[0-9a-f]{64}$/u);
  const evidenceRequest =
    buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
      querySpec: query,
    });
  assert.equal(evidenceRequest.exactQuerySpecDigest, query.querySpecDigest);
  assertDeepFrozen(query);
});

test("rejects a non-exhaustive or injected catalog scope", () => {
  const missingMarker = {
    expectedOid: null,
    finalDatabaseName: NAMES.finalDatabaseName,
    ownershipMarkers: OWNERSHIP_MARKERS,
    runToken: RUN_TOKEN,
    workingDatabaseName: NAMES.workingDatabaseName,
  };
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
        missingMarker,
      ),
    "POSTGRESQL_CATALOG_SCOPE_INVALID",
    "EXHAUSTIVE_DATA_ONLY_CATALOG_SCOPE_REQUIRED",
  );
  for (const scope of [
    catalogScope({ expectedMarker: "x'; DROP DATABASE prod;--" }),
    catalogScope({ expectedOid: "101 OR 1=1" }),
    catalogScope({ ownershipMarkers: [MARKER] }),
    catalogScope({ ownershipMarkers: [MARKER, MARKER] }),
    catalogScope({ ownershipMarkers: [MARKER, "not-a-marker"] }),
    catalogScope({ workingDatabaseName: `${NAMES.workingDatabaseName};DROP` }),
    catalogScope({ finalDatabaseName: `lp_c180190_${OTHER_TOKEN}_ci` }),
  ]) {
    expectSqlError(
      () =>
        buildCurrent180Current190PostgresqlCatalogReconciliationQuery(scope),
      "POSTGRESQL_CATALOG_SCOPE_INVALID",
    );
  }
});

test("reconciles absence, ambiguity, blocked identity, and one structured identity", () => {
  const emptyQuery =
    buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
      catalogScope(),
    );
  assert.equal(
    reconcileCurrent180Current190PostgresqlCatalogEvidence({
      querySpec: emptyQuery,
      rows: [],
    }).decision,
    "TARGETS_ABSENT",
  );

  const ambiguous = reconcileCurrent180Current190PostgresqlCatalogEvidence({
    querySpec: emptyQuery,
    rows: [
      catalogRow(),
      catalogRow({
        databaseName: NAMES.finalDatabaseName,
        databaseOid: 102,
      }),
    ],
  });
  assert.equal(ambiguous.decision, "CATALOG_IDENTITY_AMBIGUOUS");
  assert.equal(ambiguous.identityReceipt, null);

  const blocked = reconcileCurrent180Current190PostgresqlCatalogEvidence({
    querySpec: emptyQuery,
    rows: [catalogRow({ ownerName: "foreign_owner" })],
  });
  assert.equal(blocked.decision, "CATALOG_IDENTITY_BLOCKED");

  const renamedOwned = reconcileCurrent180Current190PostgresqlCatalogEvidence({
    querySpec: emptyQuery,
    rows: [
      catalogRow({
        databaseName: "renamed_owned_rehearsal",
        marker: OWNERSHIP_MARKERS[0],
      }),
    ],
  });
  assert.equal(renamedOwned.decision, "CATALOG_IDENTITY_BLOCKED");
  assert.equal(renamedOwned.identityReceipt, null);

  const verified = reconcileCurrent180Current190PostgresqlCatalogEvidence({
    querySpec: emptyQuery,
    rows: [catalogRow()],
  });
  assert.equal(verified.decision, "STRUCTURED_IDENTITY_VERIFIED");
  assert.equal(
    verified.identityReceipt.status,
    "STRUCTURE_VERIFIED_OWNED_SEALED_UNMARKED",
  );
  assert.equal(verified.identityReceipt.authorityClaimed, false);
  assert.equal(verified.identityReceipt.executionAuthority, false);
  assert.equal(
    verified.identityReceipt
      .callerSuppliedRowsAreAuthenticatedExecutionEvidence,
    false,
  );
  assert.equal(verified.identityReceipt.externalQueryExecutionVerified, false);
  assertDeepFrozen(verified);
});

test("rejects rows outside the exhaustive predicate and forged query specs", () => {
  const querySpec =
    buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
      catalogScope(),
    );
  expectSqlError(
    () =>
      reconcileCurrent180Current190PostgresqlCatalogEvidence({
        querySpec,
        rows: [
          catalogRow({
            databaseName: "foreign_database",
            databaseOid: 999,
          }),
        ],
      }),
    "POSTGRESQL_CATALOG_RECONCILIATION_INVALID",
    "ROWS_MUST_BE_EXACT_EXHAUSTIVE_SCOPE_PROJECTION",
  );
  expectSqlError(
    () =>
      reconcileCurrent180Current190PostgresqlCatalogEvidence({
        querySpec: { ...querySpec, sql: "SELECT true" },
        rows: [],
      }),
    "POSTGRESQL_CATALOG_RECONCILIATION_INVALID",
    "EXACT_EXHAUSTIVE_QUERY_SPEC_REQUIRED",
  );
});

test("builds fixed-template CREATE and never accepts a caller-selected template", () => {
  const statement = buildCurrent180Current190PostgresqlCreateDatabaseSql({
    runToken: RUN_TOKEN,
    workingDatabaseName: NAMES.workingDatabaseName,
  });
  assert.equal(statement.kind, "CREATE_DATABASE_FROM_FIXED_CURRENT179");
  assert.equal(
    statement.sql,
    `CREATE DATABASE "${NAMES.workingDatabaseName}" WITH TEMPLATE = "leetplus_current179_ci" OWNER = "postgres" ALLOW_CONNECTIONS = false IS_TEMPLATE = false;`,
  );
  assert.equal(statement.authority.databaseMutationAuthorized, false);
  assert.equal(statement.authority.callerSuppliedRowsAuthorized, false);
  assert.equal(statement.authority.moduleReceiptAuthorized, false);
  assert.equal(statement.effects.executed, false);
  assert.equal(
    statement.executionBoundary.authenticatedLiveQueryExecutionReceiptRequired,
    true,
  );
  assert.equal(
    statement.executionBoundary.durableJournalExecutionReceiptRequired,
    true,
  );
  assert.match(statement.statementSpecDigest, /^[0-9a-f]{64}$/u);
  assertDeepFrozen(statement);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCreateDatabaseSql({
        runToken: RUN_TOKEN,
        workingDatabaseName: `${NAMES.workingDatabaseName}" TEMPLATE production`,
      }),
    "POSTGRESQL_CREATE_DATABASE_INPUT_INVALID",
  );
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCreateDatabaseSql({
        runToken: RUN_TOKEN,
        sourceDatabaseName: "production",
        workingDatabaseName: NAMES.workingDatabaseName,
      }),
    "POSTGRESQL_CREATE_DATABASE_INPUT_INVALID",
  );
});

test("COMMENT requires a sealed unmarked receipt and emits a safe fixed marker", () => {
  const unmarkedReceipt = identityReceipt({ marker: null });
  const statement = buildCurrent180Current190PostgresqlCommentDatabaseSql({
    identityReceipt: unmarkedReceipt,
    marker: MARKER,
  });
  assert.equal(statement.kind, "COMMENT_OWNERSHIP_MARKER");
  assert.match(statement.sql, /^COMMENT ON DATABASE /u);
  assert.ok(statement.sql.includes(`E'${MARKER}'`));
  assert.equal(statement.authority.databaseMutationAuthorized, false);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCommentDatabaseSql({
        identityReceipt: identityReceipt(),
        marker: MARKER,
      }),
    "POSTGRESQL_COMMENT_DATABASE_INPUT_INVALID",
  );
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCommentDatabaseSql({
        identityReceipt: unmarkedReceipt,
        marker: `${MARKER}'; DROP DATABASE prod;--`,
      }),
    "POSTGRESQL_COMMENT_DATABASE_INPUT_INVALID",
  );
});

test("ALLOW_CONNECTIONS changes only the opposite marked identity state", () => {
  const sealed = identityReceipt();
  const open = identityReceipt({ allowConnections: true });
  const allow = buildCurrent180Current190PostgresqlAlterAllowConnectionsSql({
    allowConnections: true,
    identityReceipt: sealed,
  });
  const seal = buildCurrent180Current190PostgresqlAlterAllowConnectionsSql({
    allowConnections: false,
    identityReceipt: open,
  });
  assert.match(allow.sql, /ALLOW_CONNECTIONS = true/u);
  assert.match(seal.sql, /ALLOW_CONNECTIONS = false/u);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlAlterAllowConnectionsSql({
        allowConnections: false,
        identityReceipt: sealed,
      }),
    "POSTGRESQL_ALTER_ALLOW_CONNECTIONS_INPUT_INVALID",
  );
});

test("RENAME permits only a sealed marked same-token working/final transition", () => {
  const receipt = identityReceipt();
  const statement = buildCurrent180Current190PostgresqlRenameDatabaseSql({
    fromDatabaseName: NAMES.workingDatabaseName,
    identityReceipt: receipt,
    toDatabaseName: NAMES.finalDatabaseName,
  });
  assert.equal(statement.kind, "RENAME_SAME_TOKEN_DATABASE");
  assert.equal(
    statement.sql,
    `ALTER DATABASE "${NAMES.workingDatabaseName}" RENAME TO "${NAMES.finalDatabaseName}";`,
  );
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlRenameDatabaseSql({
        fromDatabaseName: NAMES.workingDatabaseName,
        identityReceipt: receipt,
        toDatabaseName: `lp_c180190_${OTHER_TOKEN}_ci`,
      }),
    "POSTGRESQL_RENAME_DATABASE_INPUT_INVALID",
    "SAME_TOKEN_WORKING_FINAL_RENAME_REQUIRED",
  );
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlRenameDatabaseSql({
        fromDatabaseName: NAMES.workingDatabaseName,
        identityReceipt: identityReceipt({ marker: null }),
        toDatabaseName: NAMES.finalDatabaseName,
      }),
    "POSTGRESQL_RENAME_DATABASE_INPUT_INVALID",
    "SEALED_MARKED_SOURCE_IDENTITY_REQUIRED",
  );
});

test("DROP requires the exact previously verified owned sealed marked identity", () => {
  const receipt = identityReceipt();
  const nameOnlyObservation =
    reconcileCurrent180Current190PostgresqlCatalogEvidence({
      querySpec:
        buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
          catalogScope(),
        ),
      rows: [catalogRow({ marker: MARKER })],
    }).identityReceipt;
  assert.equal(nameOnlyObservation.exhaustiveIdentityScopeBound, false);
  const statement = buildCurrent180Current190PostgresqlDropDatabaseSql({
    databaseName: NAMES.workingDatabaseName,
    identityReceipt: receipt,
  });
  assert.equal(statement.kind, "DROP_EXACT_OWNED_SEALED_TARGET");
  assert.equal(statement.sql, `DROP DATABASE "${NAMES.workingDatabaseName}";`);
  assert.equal(statement.authority.databaseMutationAuthorized, false);
  assert.equal(statement.preconditions.exactDatabaseOid, 101);
  assert.equal(statement.preconditions.exactMarker, MARKER);

  for (const badReceipt of [
    identityReceipt({ allowConnections: true }),
    identityReceipt({ activeSessionCount: 1 }),
    identityReceipt({ marker: null }),
    nameOnlyObservation,
    { ...receipt },
    { ...receipt, identityReceiptDigest: "b".repeat(64) },
    { ...receipt, authorityClaimed: true },
  ]) {
    expectSqlError(
      () =>
        buildCurrent180Current190PostgresqlDropDatabaseSql({
          databaseName: NAMES.workingDatabaseName,
          identityReceipt: badReceipt,
        }),
      "POSTGRESQL_DROP_DATABASE_INPUT_INVALID",
      "PREVIOUSLY_VERIFIED_OWNED_SEALED_MARKED_IDENTITY_REQUIRED",
    );
  }
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlDropDatabaseSql({
        databaseName: NAMES.finalDatabaseName,
        identityReceipt: receipt,
      }),
    "POSTGRESQL_DROP_DATABASE_INPUT_INVALID",
  );
});

test("fingerprint plan covers catalog, schema, migration semantics, and every application table", () => {
  const plan = CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN;
  assert.equal(
    plan.canonicalization,
    "QUERY_SPEC_DIGEST_PLUS_ORDERED_QUERY_ROWS_CANONICAL_JSON_UTF8_LF_SHA256",
  );
  assert.equal(
    plan.contract,
    "CURRENT180_CURRENT190_POSTGRESQL_SEMANTIC_FINGERPRINT_V2",
  );
  assert.deepEqual(plan.explicitExclusions.applicationDataColumns, []);
  assert.deepEqual(plan.explicitExclusions.databaseIdentity, [
    "pg_database.datname",
    "pg_database.oid",
  ]);
  assert.ok(
    plan.explicitExclusions.timestamps.includes(
      "_prisma_migrations.finished_at value (nullness retained)",
    ),
  );
  for (const component of [
    "catalog",
    "databaseRoleSettings",
    "clusterRoles",
    "clusterRoleMemberships",
    "schemaRelations",
    "schemaColumns",
    "schemaConstraints",
    "schemaIndexes",
    "schemaRoutines",
    "schemaTriggersPoliciesEnums",
    "schemaTopologyDependencies",
    "migrationSemantics",
    "dataTableInventory",
    "dataSequenceInventory",
  ]) {
    assert.ok(plan.comparisonComponents.includes(component));
    assert.equal(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES[component]
        .readOnly,
      true,
    );
    assert.match(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES[component]
        .querySpecDigest,
      /^[0-9a-f]{64}$/u,
    );
  }
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .migrationSemantics.sql,
    /finished_at" IS NOT NULL/u,
  );
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .dataTableInventory.sql,
    /relation\.relname <> '_prisma_migrations'/u,
  );
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaColumns
      .sql,
    /attribute\.attacl/u,
  );
  assert.ok(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaColumns.resultColumns.includes(
      "acl",
    ),
  );
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .schemaTriggersPoliciesEnums.sql,
    /target_trigger\.tgenabled/u,
  );
  assert.ok(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaTriggersPoliciesEnums.resultColumns.includes(
      "objectState",
    ),
  );
  const topology =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaTopologyDependencies;
  assert.match(topology.sql, /pg_catalog\.pg_inherits/u);
  assert.match(topology.sql, /pg_catalog\.pg_get_partkeydef/u);
  assert.match(topology.sql, /SEQUENCE_OWNER/u);
  assert.match(topology.sql, /SEQUENCE_RELATION_DEPENDENCY/u);
  assert.match(topology.sql, /pg_catalog\.pg_depend/u);
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .schemaRelations.sql,
    /relation\.relispopulated/u,
  );
  assert.match(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .dataTableInventory.sql,
    /relation\.relkind IN \('r', 'p', 'm'\)/u,
  );
  assert.deepEqual(plan.requiredSemanticCoverage, {
    clusterRoleAttributesAndMemberships: true,
    columnAcl: true,
    databaseAndRoleSettings: true,
    domainConstraints: true,
    indexClusterAndReplicaIdentity: true,
    materializedViewData: true,
    materializedViewPopulationState: true,
    partitionAndInheritanceTopology: true,
    sequenceOwnershipAndDependencies: true,
    triggerEnablement: true,
  });
  assert.equal(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN
      .explicitExclusions.sequenceDataFields.length,
    0,
  );
});

test("fingerprints cluster-global role attributes, password-verifier drift, and memberships without OID identity", () => {
  const roles =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.clusterRoles;
  assert.deepEqual(roles.resultColumns, [
    "roleName",
    "superuser",
    "inherit",
    "createRole",
    "createDatabase",
    "canLogin",
    "replication",
    "bypassRls",
    "connectionLimit",
    "passwordSet",
    "passwordVerifierDigest",
    "validUntil",
    "comment",
  ]);
  assert.match(roles.sql, /pg_catalog\.pg_authid/u);
  assert.match(roles.sql, /target_role\.rolsuper/u);
  assert.match(roles.sql, /target_role\.rolbypassrls/u);
  assert.match(roles.sql, /target_role\.rolpassword IS NOT NULL/u);
  assert.match(
    roles.sql,
    /pg_catalog\.sha256\([\s\S]*COALESCE\(target_role\.rolpassword, ''\)/u,
  );
  assert.match(roles.sql, /target_role\.rolvaliduntil/u);
  assert.match(roles.sql, /pg_catalog\.shobj_description/u);
  assert.match(roles.sql, /ORDER BY target_role\.rolname COLLATE "C"/u);
  assert.equal(roles.resultColumns.includes("roleOid"), false);
  assert.deepEqual(
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN
      .explicitExclusions.clusterRoleSecrets,
    ["raw pg_authid.rolpassword (SHA-256 digest retained)"],
  );

  const memberships =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.clusterRoleMemberships;
  assert.deepEqual(memberships.resultColumns, [
    "roleName",
    "memberName",
    "grantorName",
    "adminOption",
    "inheritOption",
    "setOption",
  ]);
  assert.match(memberships.sql, /pg_catalog\.pg_auth_members/u);
  assert.match(memberships.sql, /membership\.admin_option/u);
  assert.match(memberships.sql, /membership\.inherit_option/u);
  assert.match(memberships.sql, /membership\.set_option/u);
  assert.match(memberships.sql, /pg_catalog\.pg_authid AS granted_role/u);
  assert.match(memberships.sql, /pg_catalog\.pg_authid AS member_role/u);
  assert.match(memberships.sql, /pg_catalog\.pg_authid AS grantor_role/u);
  assert.equal(memberships.resultColumns.includes("roleOid"), false);
  assert.equal(memberships.resultColumns.includes("memberOid"), false);
  assert.equal(memberships.resultColumns.includes("grantorOid"), false);
});

test("fingerprints global and current-database role settings without OID or sentinel collisions", () => {
  const querySpec =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.databaseRoleSettings;
  assert.deepEqual(querySpec.resultColumns, [
    "databaseScope",
    "roleScope",
    "roleName",
    "setting",
  ]);
  assert.match(querySpec.sql, /pg_catalog\.pg_db_role_setting/u);
  assert.match(querySpec.sql, /setdatabase = 0/u);
  assert.match(querySpec.sql, /pg_catalog\.current_database\(\)/u);
  assert.match(querySpec.sql, /pg_catalog\.pg_roles/u);
  assert.match(
    querySpec.sql,
    /pg_catalog\.unnest\(database_role_setting\.setconfig\)/u,
  );
  assert.match(querySpec.sql, /ELSE 'NAMED_ROLE'/u);
  assert.match(querySpec.sql, /COALESCE\(target_role\.rolname::text, ''\)/u);
  assert.match(querySpec.sql, /records AS \([\s\S]*FROM records/u);
  assert.match(
    querySpec.sql,
    /records\."databaseScope" COLLATE "C"[\s\S]*records\."roleScope" COLLATE "C"[\s\S]*records\."roleName" COLLATE "C"[\s\S]*records\."setting" COLLATE "C"/u,
  );
  assert.equal(querySpec.resultColumns.includes("databaseOid"), false);
  assert.equal(querySpec.resultColumns.includes("roleOid"), false);

  const request = buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
    querySpec,
  });
  assert.equal(request.exactQuerySpec, querySpec);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest({
        querySpec: { ...querySpec },
      }),
    "POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_INVALID",
    "EXACT_MODULE_ISSUED_READ_ONLY_QUERY_SPEC_REQUIRED",
  );
});

test("closes index-state and domain-constraint semantic false negatives", () => {
  const indexes =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaIndexes;
  assert.match(indexes.sql, /target_index\.indisreplident/u);
  assert.match(indexes.sql, /target_index\.indisclustered/u);
  assert.ok(indexes.resultColumns.includes("replicaIdentity"));
  assert.ok(indexes.resultColumns.includes("clustered"));

  const combinedSchemaObjects =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES.schemaTriggersPoliciesEnums;
  assert.match(combinedSchemaObjects.sql, /'DOMAIN_CONSTRAINT'::text/u);
  assert.match(combinedSchemaObjects.sql, /target_constraint\.contypid/u);
  assert.match(
    combinedSchemaObjects.sql,
    /pg_catalog\.pg_get_constraintdef\(target_constraint\.oid, true\)/u,
  );
  assert.match(combinedSchemaObjects.sql, /target_constraint\.convalidated/u);
});

test("builds a full-row application data digest without column exclusions", () => {
  const query =
    buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery({
      materializedViewPopulated: null,
      relationKind: "r",
      schemaName: "public",
      tableName: 'Odd"; DROP DATABASE prod;--',
    });
  assert.deepEqual(query.explicitExcludedColumns, []);
  assert.equal(query.readOnly, true);
  assert.match(query.sql, /to_jsonb\(source_row\)/u);
  assert.match(query.sql, /string_agg/u);
  assert.ok(query.sql.includes('"Odd""; DROP DATABASE prod;--"'));
  assert.equal(query.relationIdentity.relationKind, "r");
  assert.equal(query.relationReadRequiredByFutureRunner, true);
  assert.equal(query.derivation.authenticatedInventoryReceiptRequired, true);
  assert.equal(
    query.derivation.callerSuppliedInventoryRowAuthorizesExecution,
    false,
  );
  assertDeepFrozen(query);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery({
        materializedViewPopulated: null,
        relationKind: "r",
        schemaName: "public",
        tableName: "_prisma_migrations",
      }),
    "POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID",
    "MIGRATION_TABLE_HAS_DEDICATED_SEMANTIC_QUERY",
  );
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery({
        materializedViewPopulated: null,
        relationKind: "r",
        schemaName: "private",
        tableName: "Tenant",
      }),
    "POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID",
  );
});

test("fingerprints populated materialized data and safely represents unpopulated state", () => {
  const populated =
    buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery({
      materializedViewPopulated: true,
      relationKind: "m",
      schemaName: "public",
      tableName: "RevenueMaterialized",
    });
  assert.equal(populated.id, "fingerprint-materialized-view-data");
  assert.equal(populated.relationReadRequiredByFutureRunner, true);
  assert.match(populated.sql, /to_jsonb\(source_row\)/u);
  assert.ok(populated.sql.includes('"public"."RevenueMaterialized"'));

  const unpopulated =
    buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery({
      materializedViewPopulated: false,
      relationKind: "m",
      schemaName: "public",
      tableName: "RevenueMaterialized",
    });
  assert.equal(unpopulated.relationReadRequiredByFutureRunner, false);
  assert.match(unpopulated.sql, /0::bigint AS "rowCount"/u);
  assert.equal(unpopulated.sql.includes('"RevenueMaterialized"'), false);
  assert.notEqual(populated.querySpecDigest, unpopulated.querySpecDigest);

  for (const invalidInput of [
    {
      materializedViewPopulated: false,
      relationKind: "r",
      schemaName: "public",
      tableName: "Tenant",
    },
    {
      materializedViewPopulated: null,
      relationKind: "m",
      schemaName: "public",
      tableName: "RevenueMaterialized",
    },
    {
      materializedViewPopulated: true,
      relationKind: "v",
      schemaName: "public",
      tableName: "RevenueView",
    },
  ]) {
    expectSqlError(
      () =>
        buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery(
          invalidInput,
        ),
      "POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID",
      "PUBLIC_BOUNDED_RELATION_AND_EXACT_POPULATION_STATE_REQUIRED",
    );
  }
});

test("builds exact public sequence state projections without exclusions", () => {
  const query = buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery(
    {
      schemaName: "public",
      sequenceName: 'Odd"; DROP DATABASE prod;--',
    },
  );
  assert.deepEqual(query.explicitExcludedFields, []);
  assert.deepEqual(query.resultColumns, ["lastValue", "isCalled"]);
  assert.equal(query.readOnly, true);
  assert.equal(query.sequenceReadAttemptedByThisModule, false);
  assert.equal(
    query.derivation.callerSuppliedInventoryRowAuthorizesExecution,
    false,
  );
  assert.equal(
    query.derivation.inventoryQuerySpecDigest,
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
      .dataSequenceInventory.querySpecDigest,
  );
  assert.ok(query.sql.includes('"Odd""; DROP DATABASE prod;--"'));
  assertDeepFrozen(query);
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery({
        schemaName: "private",
        sequenceName: "unsafe",
      }),
    "POSTGRESQL_SEQUENCE_FINGERPRINT_INPUT_INVALID",
  );
});

test("rejects accessors, proxies, symbol keys, cycles, and sparse arrays without invoking code", () => {
  let getterCalls = 0;
  const accessor = {
    expectedMarker: null,
    expectedOid: null,
    finalDatabaseName: NAMES.finalDatabaseName,
    runToken: RUN_TOKEN,
  };
  Object.defineProperty(accessor, "workingDatabaseName", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return NAMES.workingDatabaseName;
    },
  });
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCatalogReconciliationQuery(accessor),
    "POSTGRESQL_CATALOG_SCOPE_INVALID",
  );
  assert.equal(getterCalls, 0);

  let proxyGetCalls = 0;
  let proxyOwnKeyCalls = 0;
  const proxy = new Proxy(catalogScope(), {
    get(target, key, receiver) {
      proxyGetCalls += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      proxyOwnKeyCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  expectSqlError(
    () => buildCurrent180Current190PostgresqlCatalogReconciliationQuery(proxy),
    "POSTGRESQL_CATALOG_SCOPE_INVALID",
  );
  assert.equal(proxyGetCalls, 0);
  assert.equal(proxyOwnKeyCalls, 0);

  const symbolKey = catalogScope();
  Object.defineProperty(symbolKey, Symbol("hidden"), {
    enumerable: true,
    value: "ignored",
  });
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlCatalogReconciliationQuery(symbolKey),
    "POSTGRESQL_CATALOG_SCOPE_INVALID",
  );

  const cycle = catalogScope();
  cycle.self = cycle;
  expectSqlError(
    () => buildCurrent180Current190PostgresqlCatalogReconciliationQuery(cycle),
    "POSTGRESQL_CATALOG_SCOPE_INVALID",
  );

  const querySpec =
    buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
      catalogScope(),
    );
  const sparseRows = new Array(1);
  expectSqlError(
    () =>
      reconcileCurrent180Current190PostgresqlCatalogEvidence({
        querySpec,
        rows: sparseRows,
      }),
    "POSTGRESQL_CATALOG_RECONCILIATION_INVALID",
  );
});

test("mutation statement builders reject accessor and proxy receipts without invocation", () => {
  const receipt = identityReceipt();
  let getterCalls = 0;
  const accessorInput = { databaseName: NAMES.workingDatabaseName };
  Object.defineProperty(accessorInput, "identityReceipt", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return receipt;
    },
  });
  expectSqlError(
    () => buildCurrent180Current190PostgresqlDropDatabaseSql(accessorInput),
    "POSTGRESQL_DROP_DATABASE_INPUT_INVALID",
  );
  assert.equal(getterCalls, 0);

  let proxyCalls = 0;
  const proxyReceipt = new Proxy(receipt, {
    get(target, key, receiver) {
      proxyCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  expectSqlError(
    () =>
      buildCurrent180Current190PostgresqlDropDatabaseSql({
        databaseName: NAMES.workingDatabaseName,
        identityReceipt: proxyReceipt,
      }),
    "POSTGRESQL_DROP_DATABASE_INPUT_INVALID",
  );
  assert.equal(proxyCalls, 0);
});
