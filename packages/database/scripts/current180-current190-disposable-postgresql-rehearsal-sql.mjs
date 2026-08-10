import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_SQL_V1";

const QUERY_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_READ_ONLY_QUERY_V1";
const STATEMENT_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_STATEMENT_V1";
const CATALOG_QUERY_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_CATALOG_SCOPE_V1";
const IDENTITY_RECEIPT_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_STRUCTURED_IDENTITY_V1";
const LIVE_QUERY_EVIDENCE_REQUEST_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_V1";
const SOURCE_DATABASE_NAME = "leetplus_current180_ci";
const MAINTENANCE_DATABASE_NAME = "postgres";
const DATABASE_OWNER_NAME = "postgres";
const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_PORT = 55_432;
const RUN_TOKEN_PATTERN = /^[0-9a-f]{32}$/u;
const WORKING_DATABASE_PATTERN = /^lp_imtec_([0-9a-f]{32})_ci$/u;
const FINAL_DATABASE_PATTERN = /^lp_c180190_([0-9a-f]{32})_ci$/u;
const OWNERSHIP_MARKER_PATTERN =
  /^LEETPLUS_CURRENT180190_REHEARSAL_V1:[0-9a-f]{64}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_OID = 4_294_967_295;
const issuedCatalogQuerySpecs = new WeakSet();
const issuedLiveQuerySpecs = new WeakSet();
const issuedStructuredIdentityReceipts = new WeakSet();

export class Current180Current190PostgresqlRehearsalSqlError extends Error {
  constructor(code, findings) {
    super(code);
    this.name = "Current180Current190PostgresqlRehearsalSqlError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, findings) {
  throw new Current180Current190PostgresqlRehearsalSqlError(code, findings);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function isStrictDataTree(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        descriptor === undefined ||
        !("value" in descriptor) ||
        (key !== "length" && descriptor.enumerable !== true)
      );
    })
  ) {
    return false;
  }
  if (Array.isArray(value)) {
    if (keys.length !== value.length + 1 || keys.at(-1) !== "length") {
      return false;
    }
    for (let index = 0; index < value.length; index += 1) {
      if (keys[index] !== String(index)) return false;
    }
    return Array.from({ length: value.length }, (_, index) =>
      isStrictDataTree(descriptors[String(index)].value, seen),
    ).every(Boolean);
  }
  return keys.every((key) => isStrictDataTree(descriptors[key].value, seen));
}

function strictRecord(value, expectedKeys) {
  if (!isStrictDataTree(value) || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort(compareText);
  return (
    keys.length === expectedKeys.length &&
    keys.every(
      (key, index) => key === [...expectedKeys].sort(compareText)[index],
    )
  );
}

function strictArray(value) {
  return isStrictDataTree(value) && Array.isArray(value);
}

function positiveOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_OID;
}

function boundedIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 63 &&
    !value.includes("\u0000")
  );
}

export function quoteCurrent180Current190PostgresqlIdentifier(value) {
  if (!boundedIdentifier(value)) {
    fail("POSTGRESQL_IDENTIFIER_INVALID", ["BOUNDED_IDENTIFIER_REQUIRED"]);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function quoteCurrent180Current190PostgresqlLiteral(value) {
  if (
    typeof value !== "string" ||
    value.length > 4_096 ||
    value.includes("\u0000")
  ) {
    fail("POSTGRESQL_LITERAL_INVALID", ["BOUNDED_TEXT_LITERAL_REQUIRED"]);
  }
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS =
  deepFreeze({
    databaseConnectionOpened: false,
    databaseMutationAttempted: false,
    externalProviderCallAttempted: false,
    filesystemMutationAttempted: false,
    networkCallAttempted: false,
    processSpawnAttempted: false,
    productionApplyAuthorized: false,
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY =
  deepFreeze({
    authenticatedLiveQueryExecutionReceiptRequired: true,
    callerSuppliedRowsAcceptedAsExecutionEvidence: false,
    canAuthorizeDatabaseExecution: false,
    durableJournalExecutionReceiptRequired: true,
    externalQueryExecutionVerified: false,
    moduleStructuredIdentityReceiptIsExecutionAuthority: false,
    processLocalBrandPurpose:
      "IN_PROCESS_CONSTRUCTION_PROVENANCE_AND_CLONE_REJECTION_ONLY",
    processLocalModuleBrandIsDatabaseEvidence: false,
    productionApplyAuthorized: false,
    statementSpecAloneAuthorizesExecution: false,
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_LIVE_QUERY_EVIDENCE_REQUIREMENTS =
  deepFreeze({
    acceptedEvidenceOrigin: "AUTHENTICATED_FUTURE_RUNNER_LIVE_QUERY_ONLY",
    callerSuppliedModuleReceiptAccepted: false,
    callerSuppliedRowsAccepted: false,
    contract: LIVE_QUERY_EVIDENCE_REQUEST_CONTRACT,
    moduleCanAttestQueryExecution: false,
    requiredAuthenticatedReceiptFields: [
      "connectionIdentityDigest",
      "durableJournalEntryDigest",
      "executorKeyId",
      "querySpecDigest",
      "resultRowsDigest",
      "signature",
    ],
    requiredBinding: "EXACT_QUERY_SPEC_AND_CONNECTION_IDENTITY",
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_CONNECTION_IDENTITIES =
  deepFreeze({
    maintenance: {
      databaseName: MAINTENANCE_DATABASE_NAME,
      host: LOOPBACK_HOST,
      port: LOOPBACK_PORT,
      roleName: DATABASE_OWNER_NAME,
    },
    source: {
      databaseName: SOURCE_DATABASE_NAME,
      host: LOOPBACK_HOST,
      port: LOOPBACK_PORT,
      roleName: DATABASE_OWNER_NAME,
      schemaName: "public",
    },
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_REQUIRED_RELATIONS =
  deepFreeze([
    "IdentityMailDeliveryTenantEnrollment",
    "IdentityMailOutbox",
    "SharedBetaRuntimeReleaseMarker",
    "Tenant",
  ]);

export function inspectCurrent180Current190PostgresqlConnectionIdentity(input) {
  if (!strictRecord(input, ["databaseName", "host", "port", "roleName"])) {
    fail("POSTGRESQL_CONNECTION_IDENTITY_INVALID", [
      "EXACT_DATA_ONLY_CONNECTION_IDENTITY_REQUIRED",
    ]);
  }
  const candidate = {
    databaseName: input.databaseName,
    host: input.host,
    port: input.port,
    roleName: input.roleName,
  };
  const source = {
    databaseName: SOURCE_DATABASE_NAME,
    host: LOOPBACK_HOST,
    port: LOOPBACK_PORT,
    roleName: DATABASE_OWNER_NAME,
  };
  const maintenance = {
    databaseName: MAINTENANCE_DATABASE_NAME,
    host: LOOPBACK_HOST,
    port: LOOPBACK_PORT,
    roleName: DATABASE_OWNER_NAME,
  };
  const kind =
    canonicalJson(candidate) === canonicalJson(source)
      ? "SOURCE"
      : canonicalJson(candidate) === canonicalJson(maintenance)
        ? "MAINTENANCE"
        : null;
  if (kind === null) {
    fail("POSTGRESQL_CONNECTION_IDENTITY_INVALID", [
      "EXACT_PINNED_LOOPBACK_IDENTITY_REQUIRED",
    ]);
  }
  return deepFreeze({
    contract: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_CONTRACT,
    identity: candidate,
    kind,
    verified: true,
  });
}

export function deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
  runToken,
) {
  if (typeof runToken !== "string" || !RUN_TOKEN_PATTERN.test(runToken)) {
    fail("POSTGRESQL_REHEARSAL_RUN_TOKEN_INVALID", [
      "LOWERCASE_32_HEX_RUN_TOKEN_REQUIRED",
    ]);
  }
  return deepFreeze({
    finalDatabaseName: `lp_c180190_${runToken}_ci`,
    runToken,
    workingDatabaseName: `lp_imtec_${runToken}_ci`,
  });
}

export function validateCurrent180Current190PostgresqlRehearsalDatabaseNames(
  input,
) {
  if (
    !strictRecord(input, [
      "finalDatabaseName",
      "runToken",
      "workingDatabaseName",
    ])
  ) {
    fail("POSTGRESQL_REHEARSAL_DATABASE_NAMES_INVALID", [
      "EXACT_DATA_ONLY_DATABASE_NAMES_REQUIRED",
    ]);
  }
  const expected = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    input.runToken,
  );
  if (
    input.workingDatabaseName !== expected.workingDatabaseName ||
    input.finalDatabaseName !== expected.finalDatabaseName
  ) {
    fail("POSTGRESQL_REHEARSAL_DATABASE_NAMES_INVALID", [
      "SAME_TOKEN_DERIVED_DATABASE_NAMES_REQUIRED",
    ]);
  }
  return expected;
}

function readOnlyQuery(id, connection, resultColumns, sql, options = {}) {
  const document = {
    authorityClaimed: false,
    connection,
    contract: QUERY_CONTRACT,
    effects: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS,
    id,
    parameters: [],
    readOnly: true,
    resultColumns,
    sql,
    transactionMode: "READ ONLY",
    ...options,
  };
  const querySpec = deepFreeze({
    ...document,
    querySpecDigest: sha256(canonicalJson(document)),
  });
  issuedLiveQuerySpecs.add(querySpec);
  return querySpec;
}

function validIssuedLiveQuerySpec(value) {
  if (
    !issuedLiveQuerySpecs.has(value) ||
    !isStrictDataTree(value) ||
    Array.isArray(value) ||
    value.authorityClaimed !== false ||
    value.readOnly !== true ||
    value.transactionMode !== "READ ONLY" ||
    value.effects !== CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS ||
    typeof value.querySpecDigest !== "string" ||
    !SHA256_PATTERN.test(value.querySpecDigest)
  ) {
    return false;
  }
  const document = { ...value };
  delete document.querySpecDigest;
  if (value.contract === CATALOG_QUERY_CONTRACT) {
    if (value.scopeDigest !== value.querySpecDigest) return false;
    delete document.scopeDigest;
  } else if (value.contract !== QUERY_CONTRACT) {
    return false;
  }
  return value.querySpecDigest === sha256(canonicalJson(document));
}

export function buildCurrent180Current190PostgresqlLiveQueryEvidenceRequest(
  input,
) {
  if (
    !strictRecord(input, ["querySpec"]) ||
    !validIssuedLiveQuerySpec(input.querySpec)
  ) {
    fail("POSTGRESQL_LIVE_QUERY_EVIDENCE_REQUEST_INVALID", [
      "EXACT_MODULE_ISSUED_READ_ONLY_QUERY_SPEC_REQUIRED",
    ]);
  }
  return deepFreeze({
    authorityClaimed: false,
    callerSuppliedModuleReceiptAccepted: false,
    callerSuppliedRowsAccepted: false,
    connection: input.querySpec.connection,
    contract: LIVE_QUERY_EVIDENCE_REQUEST_CONTRACT,
    exactQuerySpec: input.querySpec,
    exactQuerySpecDigest: input.querySpec.querySpecDigest,
    expectedResultColumns: input.querySpec.resultColumns,
    moduleCanAttestQueryExecution: false,
    requiredAuthenticatedReceiptFields:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_LIVE_QUERY_EVIDENCE_REQUIREMENTS.requiredAuthenticatedReceiptFields,
    runnerMustExecuteLive: true,
    transactionMode: "READ ONLY",
  });
}

const SOURCE_IDENTITY_SQL = `SELECT
  pg_catalog.current_database()::text AS "databaseName",
  database.oid AS "databaseOid",
  database.datistemplate AS "isTemplate",
  database.datallowconn AS "allowConnections",
  database_owner.oid AS "databaseOwnerOid",
  database_owner.rolname::text AS "databaseOwnerName",
  CURRENT_USER::text AS "currentUserName",
  caller_role.oid AS "currentUserOid",
  caller_role.rolsuper AS "currentUserSuperuser",
  caller_role.rolcreatedb AS "currentUserCanCreateDatabase",
  pg_catalog.current_setting('server_version_num')::integer AS "serverVersionNumber"
FROM pg_catalog.pg_database AS database
INNER JOIN pg_catalog.pg_roles AS database_owner
  ON database_owner.oid = database.datdba
INNER JOIN pg_catalog.pg_roles AS caller_role
  ON caller_role.rolname = CURRENT_USER
WHERE database.datname = pg_catalog.current_database();`;

const REQUIRED_RELATION_OWNERS_SQL = `WITH required("ordinal", "relationName", "regclassName") AS (
  VALUES
    (1, 'IdentityMailDeliveryTenantEnrollment'::text, 'public."IdentityMailDeliveryTenantEnrollment"'::text),
    (2, 'IdentityMailOutbox'::text, 'public."IdentityMailOutbox"'::text),
    (3, 'SharedBetaRuntimeReleaseMarker'::text, 'public."SharedBetaRuntimeReleaseMarker"'::text),
    (4, 'Tenant'::text, 'public."Tenant"'::text)
)
SELECT
  required."ordinal",
  required."relationName",
  relation.oid IS NOT NULL AS "exists",
  relation.relkind::text AS "relationKind",
  relation.relowner AS "ownerOid",
  owner.rolname::text AS "ownerName"
FROM required
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.oid = pg_catalog.to_regclass(required."regclassName")
LEFT JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = relation.relowner
ORDER BY required."ordinal";`;

const CLAIM_LOCK_OWNER_SQL = `WITH target AS (
  SELECT pg_catalog.to_regprocedure(
    'public."identity_email_claim_lock_v1"(text)'
  ) AS "routineOid"
)
SELECT
  'identity_email_claim_lock_v1(text)'::text AS "routineIdentity",
  routine.oid IS NOT NULL AS "exists",
  routine.prokind::text AS "routineKind",
  pg_catalog.pg_get_function_identity_arguments(routine.oid)::text AS "identityArguments",
  routine.proowner AS "ownerOid",
  owner.rolname::text AS "ownerName"
FROM target
LEFT JOIN pg_catalog.pg_proc AS routine
  ON routine.oid = target."routineOid"
LEFT JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = routine.proowner;`;

const MIGRATION_ROWS_SQL = `SELECT
  migration."migration_name"::text AS "migrationName",
  migration."checksum"::text AS "checksum",
  migration."finished_at" AS "finishedAt",
  migration."rolled_back_at" AS "rolledBackAt",
  migration."applied_steps_count"::integer AS "appliedStepsCount"
FROM public."_prisma_migrations" AS migration
ORDER BY migration."migration_name" COLLATE "C";`;

const SOURCE_OCCUPANCY_SQL = `SELECT
  (SELECT pg_catalog.count(*)::bigint
   FROM public."Tenant") AS "tenantCount",
  (SELECT pg_catalog.count(*)::bigint
   FROM public."User") AS "userCount",
  (SELECT pg_catalog.count(*)::bigint
   FROM public."IdentityMailOutbox") AS "mailOutboxCount",
  (SELECT pg_catalog.count(*)::bigint
   FROM public."IdentityMailDeliveryTenantEnrollment") AS "enrollmentCount",
  (SELECT pg_catalog.count(*)::bigint
   FROM public."IdentityMailOutbox" AS outbox
   WHERE outbox."status" = 'CLAIMED'::public."IdentityMailOutboxStatus") AS "claimedOutboxCount",
  (
    (CASE WHEN pg_catalog.to_regclass('public."IdentityMailDeliveryTenantEnrollmentCommand"') IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN pg_catalog.to_regclass('public."IdentityMailDeliveryTenantEnrollmentEvent"') IS NULL THEN 0 ELSE 1 END) +
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_attribute AS attribute
     WHERE attribute.attrelid = pg_catalog.to_regclass('public."IdentityMailDeliveryTenantEnrollment"')
       AND attribute.attname IN ('state', 'stateRevision', 'activeCommandId', 'lastEventDigest', 'currentConfigurationDigest', 'stateChangedAt')
       AND attribute.attnum > 0
       AND attribute.attisdropped = false) +
    (SELECT pg_catalog.count(*)::integer
     FROM pg_catalog.pg_constraint AS target_constraint
     WHERE target_constraint.conrelid = pg_catalog.to_regclass('public."SharedBetaRuntimeReleaseMarker"')
       AND target_constraint.conname = 'shared_beta_runtime_marker_enrollment_binding_key') +
    (CASE WHEN pg_catalog.to_regprocedure('public."identity_mail_tenant_enrollment_command_guard_v1"()') IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN pg_catalog.to_regprocedure('public."identity_mail_tenant_enrollment_event_guard_v1"()') IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN pg_catalog.to_regprocedure('public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()') IS NULL THEN 0 ELSE 1 END)
  )::integer AS "current180SuccessorObjectCount",
  (SELECT pg_catalog.count(*)::integer
   FROM pg_catalog.pg_proc AS routine
   INNER JOIN pg_catalog.pg_namespace AS namespace
     ON namespace.oid = routine.pronamespace
   WHERE namespace.nspname = 'public'
     AND routine.proname IN (
       'identity_mail_duty_role_acl_lock_v1',
       'identity_mail_duty_role_acl_epoch_append_v1',
       'identity_mail_duty_role_acl_epoch_immutable_guard_v1',
       'identity_mail_duty_role_live_assert_v1',
       'identity_mail_tenant_enrollment_event_write_guard_v2',
       'identity_mail_tenant_enrollment_registry_write_guard_v2',
       'identity_mail_tenant_enrollment_drive_command_v2'
     )) AS "current186NamedRoutineCount",
  (SELECT pg_catalog.count(*)::integer
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.datid = (
     SELECT database.oid
     FROM pg_catalog.pg_database AS database
     WHERE database.datname = pg_catalog.current_database()
   )
     AND activity.pid <> pg_catalog.pg_backend_pid()) AS "otherSessionCount";`;

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_READ_ONLY_QUERIES =
  deepFreeze({
    maintenanceAuthority: readOnlyQuery(
      "maintenance-authority",
      "MAINTENANCE",
      [
        "databaseName",
        "databaseOid",
        "isTemplate",
        "allowConnections",
        "databaseOwnerOid",
        "databaseOwnerName",
        "currentUserName",
        "currentUserOid",
        "currentUserSuperuser",
        "currentUserCanCreateDatabase",
        "serverVersionNumber",
      ],
      SOURCE_IDENTITY_SQL,
    ),
    sourceAuthority: readOnlyQuery(
      "source-authority",
      "SOURCE",
      [
        "databaseName",
        "databaseOid",
        "isTemplate",
        "allowConnections",
        "databaseOwnerOid",
        "databaseOwnerName",
        "currentUserName",
        "currentUserOid",
        "currentUserSuperuser",
        "currentUserCanCreateDatabase",
        "serverVersionNumber",
      ],
      SOURCE_IDENTITY_SQL,
    ),
    requiredRelationOwners: readOnlyQuery(
      "required-relation-owners",
      "SOURCE",
      [
        "ordinal",
        "relationName",
        "exists",
        "relationKind",
        "ownerOid",
        "ownerName",
      ],
      REQUIRED_RELATION_OWNERS_SQL,
    ),
    identityClaimLockOwner: readOnlyQuery(
      "identity-claim-lock-owner",
      "SOURCE",
      [
        "routineIdentity",
        "exists",
        "routineKind",
        "identityArguments",
        "ownerOid",
        "ownerName",
      ],
      CLAIM_LOCK_OWNER_SQL,
    ),
    migrationRows: readOnlyQuery(
      "migration-rows",
      "SOURCE_OR_TARGET",
      [
        "migrationName",
        "checksum",
        "finishedAt",
        "rolledBackAt",
        "appliedStepsCount",
      ],
      MIGRATION_ROWS_SQL,
    ),
    sourceOccupancy: readOnlyQuery(
      "source-occupancy",
      "SOURCE",
      [
        "tenantCount",
        "userCount",
        "mailOutboxCount",
        "enrollmentCount",
        "claimedOutboxCount",
        "current180SuccessorObjectCount",
        "current186NamedRoutineCount",
        "otherSessionCount",
      ],
      SOURCE_OCCUPANCY_SQL,
    ),
  });

function catalogScope(input) {
  if (
    !strictRecord(input, [
      "expectedMarker",
      "expectedOid",
      "finalDatabaseName",
      "ownershipMarkers",
      "runToken",
      "workingDatabaseName",
    ])
  ) {
    fail("POSTGRESQL_CATALOG_SCOPE_INVALID", [
      "EXHAUSTIVE_DATA_ONLY_CATALOG_SCOPE_REQUIRED",
    ]);
  }
  let names;
  try {
    names = validateCurrent180Current190PostgresqlRehearsalDatabaseNames({
      finalDatabaseName: input.finalDatabaseName,
      runToken: input.runToken,
      workingDatabaseName: input.workingDatabaseName,
    });
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalSqlError) {
      fail("POSTGRESQL_CATALOG_SCOPE_INVALID", [
        "SAME_TOKEN_DERIVED_DATABASE_NAMES_REQUIRED",
      ]);
    }
    throw error;
  }
  if (
    !(input.expectedOid === null || positiveOid(input.expectedOid)) ||
    !(
      input.expectedMarker === null ||
      (typeof input.expectedMarker === "string" &&
        OWNERSHIP_MARKER_PATTERN.test(input.expectedMarker))
    ) ||
    !strictArray(input.ownershipMarkers) ||
    input.ownershipMarkers.length !== 2 ||
    input.ownershipMarkers.some(
      (marker) =>
        typeof marker !== "string" || !OWNERSHIP_MARKER_PATTERN.test(marker),
    ) ||
    new Set(input.ownershipMarkers).size !== 2
  ) {
    fail("POSTGRESQL_CATALOG_SCOPE_INVALID", [
      "EXPECTED_OID_MARKER_AND_TWO_DISTINCT_RUN_MARKERS_REQUIRED",
    ]);
  }
  return {
    expectedMarker: input.expectedMarker,
    expectedOid: input.expectedOid,
    finalDatabaseName: names.finalDatabaseName,
    ownershipMarkers: [...input.ownershipMarkers],
    runToken: names.runToken,
    workingDatabaseName: names.workingDatabaseName,
  };
}

export function buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
  input,
) {
  const scope = catalogScope(input);
  const sql = `WITH scope AS (
  SELECT
    $1::name AS "workingDatabaseName",
    $2::name AS "finalDatabaseName",
    $3::oid AS "expectedOid",
    $4::text AS "expectedMarker",
    $5::text AS "attemptOneOwnershipMarker",
    $6::text AS "attemptTwoOwnershipMarker"
)
SELECT
  database.datname::text AS "databaseName",
  database.oid AS "databaseOid",
  owner.rolname::text AS "ownerName",
  owner.oid AS "ownerOid",
  database.datistemplate AS "isTemplate",
  database.datallowconn AS "allowConnections",
  pg_catalog.shobj_description(database.oid, 'pg_database') AS "marker",
  (SELECT pg_catalog.count(*)::integer
   FROM pg_catalog.pg_stat_activity AS activity
   WHERE activity.datid = database.oid
     AND activity.pid <> pg_catalog.pg_backend_pid()) AS "activeSessionCount"
FROM pg_catalog.pg_database AS database
INNER JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = database.datdba
CROSS JOIN scope
WHERE database.datname IN (scope."workingDatabaseName", scope."finalDatabaseName")
   OR (scope."expectedOid" IS NOT NULL AND database.oid = scope."expectedOid")
   OR (
      scope."expectedMarker" IS NOT NULL
      AND pg_catalog.shobj_description(database.oid, 'pg_database') = scope."expectedMarker"
   )
   OR (
      pg_catalog.shobj_description(database.oid, 'pg_database') IN (
        scope."attemptOneOwnershipMarker",
        scope."attemptTwoOwnershipMarker"
      )
   )
ORDER BY database.datname COLLATE "C", database.oid;`;
  const document = {
    authorityClaimed: false,
    connection: "MAINTENANCE",
    contract: CATALOG_QUERY_CONTRACT,
    effects: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EFFECTS,
    exhaustivePredicate:
      "TARGET_NAMES_OR_EXPECTED_OID_OR_EXPECTED_MARKER_OR_BOTH_RUN_ATTEMPT_MARKERS",
    parameterTypes: ["name", "name", "oid", "text", "text", "text"],
    parameters: [
      scope.workingDatabaseName,
      scope.finalDatabaseName,
      scope.expectedOid,
      scope.expectedMarker,
      ...scope.ownershipMarkers,
    ],
    readOnly: true,
    resultColumns: [
      "databaseName",
      "databaseOid",
      "ownerName",
      "ownerOid",
      "isTemplate",
      "allowConnections",
      "marker",
      "activeSessionCount",
    ],
    scope,
    sql,
    transactionMode: "READ ONLY",
  };
  const querySpecDigest = sha256(canonicalJson(document));
  const querySpec = deepFreeze({
    ...document,
    querySpecDigest,
    scopeDigest: querySpecDigest,
  });
  issuedCatalogQuerySpecs.add(querySpec);
  issuedLiveQuerySpecs.add(querySpec);
  return querySpec;
}

function validCatalogQuerySpec(value) {
  if (
    !issuedCatalogQuerySpecs.has(value) ||
    !strictRecord(value, [
      "authorityClaimed",
      "connection",
      "contract",
      "effects",
      "exhaustivePredicate",
      "parameterTypes",
      "parameters",
      "readOnly",
      "resultColumns",
      "scope",
      "querySpecDigest",
      "scopeDigest",
      "sql",
      "transactionMode",
    ])
  ) {
    return false;
  }
  try {
    const expected =
      buildCurrent180Current190PostgresqlCatalogReconciliationQuery(
        value.scope,
      );
    return (
      value.querySpecDigest === value.scopeDigest &&
      canonicalJson(value) === canonicalJson(expected)
    );
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalSqlError) {
      return false;
    }
    throw error;
  }
}

function normalizeCatalogRows(rows) {
  if (!strictArray(rows)) {
    fail("POSTGRESQL_CATALOG_EVIDENCE_INVALID", [
      "DENSE_DATA_ONLY_CATALOG_ROWS_REQUIRED",
    ]);
  }
  return rows.map((row) => {
    if (
      !strictRecord(row, [
        "allowConnections",
        "activeSessionCount",
        "databaseName",
        "databaseOid",
        "isTemplate",
        "marker",
        "ownerName",
        "ownerOid",
      ]) ||
      typeof row.allowConnections !== "boolean" ||
      !Number.isSafeInteger(row.activeSessionCount) ||
      row.activeSessionCount < 0 ||
      typeof row.isTemplate !== "boolean" ||
      !boundedIdentifier(row.databaseName) ||
      !positiveOid(row.databaseOid) ||
      !positiveOid(row.ownerOid) ||
      typeof row.ownerName !== "string" ||
      !(
        row.marker === null ||
        (typeof row.marker === "string" &&
          OWNERSHIP_MARKER_PATTERN.test(row.marker))
      )
    ) {
      fail("POSTGRESQL_CATALOG_EVIDENCE_INVALID", [
        "EXACT_CATALOG_ROW_PROJECTION_REQUIRED",
      ]);
    }
    return { ...row };
  });
}

function catalogRowMatchesScope(row, scope) {
  return (
    row.databaseName === scope.workingDatabaseName ||
    row.databaseName === scope.finalDatabaseName ||
    (scope.expectedOid !== null && row.databaseOid === scope.expectedOid) ||
    (scope.expectedMarker !== null && row.marker === scope.expectedMarker) ||
    scope.ownershipMarkers.includes(row.marker)
  );
}

function identityReceiptDocument(row, scope, evidenceDigest) {
  const sealed = row.allowConnections === false;
  const markerState = row.marker === null ? "UNMARKED" : "MARKED";
  const exhaustiveIdentityScopeBound =
    row.marker !== null &&
    scope.scope.expectedOid === row.databaseOid &&
    scope.scope.expectedMarker === row.marker;
  return {
    authorityClaimed: false,
    activeSessionCount: row.activeSessionCount,
    callerSuppliedRowsAreAuthenticatedExecutionEvidence: false,
    catalogEvidenceDigest: evidenceDigest,
    catalogScopeDigest: scope.scopeDigest,
    contract: IDENTITY_RECEIPT_CONTRACT,
    databaseName: row.databaseName,
    databaseOid: row.databaseOid,
    executionAuthority: false,
    exhaustiveIdentityScopeBound,
    externalQueryExecutionVerified: false,
    isTemplate: row.isTemplate,
    marker: row.marker,
    ownerName: row.ownerName,
    ownerOid: row.ownerOid,
    runToken: scope.scope.runToken,
    sealed,
    status: `STRUCTURE_VERIFIED_OWNED_${sealed ? "SEALED" : "OPEN"}_${markerState}`,
    structureVerified: true,
  };
}

export function reconcileCurrent180Current190PostgresqlCatalogEvidence(input) {
  if (!strictRecord(input, ["querySpec", "rows"])) {
    fail("POSTGRESQL_CATALOG_RECONCILIATION_INVALID", [
      "EXACT_DATA_ONLY_RECONCILIATION_INPUT_REQUIRED",
    ]);
  }
  if (!validCatalogQuerySpec(input.querySpec)) {
    fail("POSTGRESQL_CATALOG_RECONCILIATION_INVALID", [
      "EXACT_EXHAUSTIVE_QUERY_SPEC_REQUIRED",
    ]);
  }
  const rows = normalizeCatalogRows(input.rows);
  const scope = input.querySpec.scope;
  if (
    rows.some((row) => !catalogRowMatchesScope(row, scope)) ||
    new Set(rows.map((row) => row.databaseOid)).size !== rows.length ||
    new Set(rows.map((row) => row.databaseName)).size !== rows.length
  ) {
    fail("POSTGRESQL_CATALOG_RECONCILIATION_INVALID", [
      "ROWS_MUST_BE_EXACT_EXHAUSTIVE_SCOPE_PROJECTION",
    ]);
  }
  const evidenceDigest = sha256(canonicalJson(rows));
  if (rows.length === 0) {
    return deepFreeze({
      authorityClaimed: false,
      catalogEvidenceDigest: evidenceDigest,
      catalogScopeDigest: input.querySpec.scopeDigest,
      decision: "TARGETS_ABSENT",
      identityReceipt: null,
    });
  }
  if (rows.length !== 1) {
    return deepFreeze({
      authorityClaimed: false,
      catalogEvidenceDigest: evidenceDigest,
      catalogScopeDigest: input.querySpec.scopeDigest,
      decision: "CATALOG_IDENTITY_AMBIGUOUS",
      identityReceipt: null,
    });
  }
  const row = rows[0];
  const exactDerivedName =
    row.databaseName === scope.workingDatabaseName ||
    row.databaseName === scope.finalDatabaseName;
  const expectedIdentityMatches =
    (scope.expectedOid === null || row.databaseOid === scope.expectedOid) &&
    (scope.expectedMarker === null || row.marker === scope.expectedMarker);
  if (
    !exactDerivedName ||
    !expectedIdentityMatches ||
    row.ownerName !== DATABASE_OWNER_NAME ||
    row.isTemplate !== false
  ) {
    return deepFreeze({
      authorityClaimed: false,
      catalogEvidenceDigest: evidenceDigest,
      catalogScopeDigest: input.querySpec.scopeDigest,
      decision: "CATALOG_IDENTITY_BLOCKED",
      identityReceipt: null,
    });
  }
  const document = identityReceiptDocument(
    row,
    input.querySpec,
    evidenceDigest,
  );
  const identityReceipt = deepFreeze({
    ...document,
    identityReceiptDigest: sha256(canonicalJson(document)),
  });
  issuedStructuredIdentityReceipts.add(identityReceipt);
  return deepFreeze({
    authorityClaimed: false,
    catalogEvidenceDigest: evidenceDigest,
    catalogScopeDigest: input.querySpec.scopeDigest,
    decision: "STRUCTURED_IDENTITY_VERIFIED",
    identityReceipt,
  });
}

function validIdentityReceipt(value) {
  if (
    !issuedStructuredIdentityReceipts.has(value) ||
    !strictRecord(value, [
      "authorityClaimed",
      "activeSessionCount",
      "callerSuppliedRowsAreAuthenticatedExecutionEvidence",
      "catalogEvidenceDigest",
      "catalogScopeDigest",
      "contract",
      "databaseName",
      "databaseOid",
      "executionAuthority",
      "exhaustiveIdentityScopeBound",
      "externalQueryExecutionVerified",
      "identityReceiptDigest",
      "isTemplate",
      "marker",
      "ownerName",
      "ownerOid",
      "runToken",
      "sealed",
      "status",
      "structureVerified",
    ])
  ) {
    return false;
  }
  const copy = { ...value };
  delete copy.identityReceiptDigest;
  const names = RUN_TOKEN_PATTERN.test(value.runToken)
    ? deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(value.runToken)
    : null;
  const markerState = value.marker === null ? "UNMARKED" : "MARKED";
  return (
    value.contract === IDENTITY_RECEIPT_CONTRACT &&
    value.authorityClaimed === false &&
    value.callerSuppliedRowsAreAuthenticatedExecutionEvidence === false &&
    Number.isSafeInteger(value.activeSessionCount) &&
    value.activeSessionCount >= 0 &&
    typeof value.exhaustiveIdentityScopeBound === "boolean" &&
    (value.exhaustiveIdentityScopeBound === false || value.marker !== null) &&
    value.externalQueryExecutionVerified === false &&
    value.executionAuthority === false &&
    value.structureVerified === true &&
    SHA256_PATTERN.test(value.catalogEvidenceDigest) &&
    SHA256_PATTERN.test(value.catalogScopeDigest) &&
    positiveOid(value.databaseOid) &&
    positiveOid(value.ownerOid) &&
    value.ownerName === DATABASE_OWNER_NAME &&
    value.isTemplate === false &&
    typeof value.sealed === "boolean" &&
    (value.marker === null ||
      (typeof value.marker === "string" &&
        OWNERSHIP_MARKER_PATTERN.test(value.marker))) &&
    names !== null &&
    [names.workingDatabaseName, names.finalDatabaseName].includes(
      value.databaseName,
    ) &&
    value.status ===
      `STRUCTURE_VERIFIED_OWNED_${value.sealed ? "SEALED" : "OPEN"}_${markerState}` &&
    SHA256_PATTERN.test(value.identityReceiptDigest) &&
    value.identityReceiptDigest === sha256(canonicalJson(copy))
  );
}

function statement(kind, sql, preconditions) {
  const document = {
    authority: {
      callerSuppliedRowsAuthorized: false,
      databaseMutationAuthorized: false,
      moduleReceiptAuthorized: false,
      productionApplyAuthorized: false,
      roleOrGrantMutationAuthorized: false,
    },
    connection: "MAINTENANCE",
    contract: STATEMENT_CONTRACT,
    effects: {
      databaseMutationPossibleIfExecuted: true,
      executed: false,
    },
    executionBoundary:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_SQL_EXECUTION_BOUNDARY,
    kind,
    parameters: [],
    preconditions,
    requiresAutocommit: true,
    sql,
  };
  return deepFreeze({
    ...document,
    statementSpecDigest: sha256(canonicalJson(document)),
  });
}

export function buildCurrent180Current190PostgresqlCreateDatabaseSql(input) {
  if (!strictRecord(input, ["runToken", "workingDatabaseName"])) {
    fail("POSTGRESQL_CREATE_DATABASE_INPUT_INVALID", [
      "EXACT_DATA_ONLY_CREATE_INPUT_REQUIRED",
    ]);
  }
  const names = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    input.runToken,
  );
  if (input.workingDatabaseName !== names.workingDatabaseName) {
    fail("POSTGRESQL_CREATE_DATABASE_INPUT_INVALID", [
      "EXACT_DERIVED_WORKING_DATABASE_REQUIRED",
    ]);
  }
  const sql = `CREATE DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(names.workingDatabaseName)} WITH TEMPLATE = ${quoteCurrent180Current190PostgresqlIdentifier(SOURCE_DATABASE_NAME)} OWNER = ${quoteCurrent180Current190PostgresqlIdentifier(DATABASE_OWNER_NAME)} ALLOW_CONNECTIONS = false IS_TEMPLATE = false;`;
  return statement("CREATE_DATABASE_FROM_FIXED_CURRENT180", sql, {
    catalogAbsenceReconciliationMustImmediatelyPrecedeExecution: true,
    exactSourceTemplate: SOURCE_DATABASE_NAME,
    sourceConnectionsMustBeZero: true,
    targetNamesMustBeAbsent: true,
  });
}

export function buildCurrent180Current190PostgresqlCommentDatabaseSql(input) {
  if (!strictRecord(input, ["identityReceipt", "marker"])) {
    fail("POSTGRESQL_COMMENT_DATABASE_INPUT_INVALID", [
      "EXACT_DATA_ONLY_COMMENT_INPUT_REQUIRED",
    ]);
  }
  if (
    !validIdentityReceipt(input.identityReceipt) ||
    input.identityReceipt.activeSessionCount !== 0 ||
    input.identityReceipt.sealed !== true ||
    input.identityReceipt.marker !== null ||
    typeof input.marker !== "string" ||
    !OWNERSHIP_MARKER_PATTERN.test(input.marker)
  ) {
    fail("POSTGRESQL_COMMENT_DATABASE_INPUT_INVALID", [
      "SEALED_UNMARKED_IDENTITY_AND_EXACT_MARKER_REQUIRED",
    ]);
  }
  const sql = `COMMENT ON DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(input.identityReceipt.databaseName)} IS ${quoteCurrent180Current190PostgresqlLiteral(input.marker)};`;
  return statement("COMMENT_OWNERSHIP_MARKER", sql, {
    activeSessionCount: 0,
    catalogReconciliationMustImmediatelyPrecedeExecution: true,
    identityReceiptDigest: input.identityReceipt.identityReceiptDigest,
    receiptIsExecutionAuthority: false,
  });
}

export function buildCurrent180Current190PostgresqlAlterAllowConnectionsSql(
  input,
) {
  if (!strictRecord(input, ["allowConnections", "identityReceipt"])) {
    fail("POSTGRESQL_ALTER_ALLOW_CONNECTIONS_INPUT_INVALID", [
      "EXACT_DATA_ONLY_ALLOW_CONNECTIONS_INPUT_REQUIRED",
    ]);
  }
  if (
    typeof input.allowConnections !== "boolean" ||
    !validIdentityReceipt(input.identityReceipt) ||
    input.identityReceipt.exhaustiveIdentityScopeBound !== true ||
    input.identityReceipt.activeSessionCount !== 0 ||
    input.identityReceipt.marker === null ||
    input.identityReceipt.sealed === !input.allowConnections
  ) {
    fail("POSTGRESQL_ALTER_ALLOW_CONNECTIONS_INPUT_INVALID", [
      "MARKED_IDENTITY_WITH_OPPOSITE_CURRENT_STATE_REQUIRED",
    ]);
  }
  const sql = `ALTER DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(input.identityReceipt.databaseName)} WITH ALLOW_CONNECTIONS = ${input.allowConnections ? "true" : "false"};`;
  return statement("ALTER_ALLOW_CONNECTIONS", sql, {
    activeSessionCount: 0,
    catalogReconciliationMustImmediatelyPrecedeExecution: true,
    identityReceiptDigest: input.identityReceipt.identityReceiptDigest,
    receiptIsExecutionAuthority: false,
  });
}

export function buildCurrent180Current190PostgresqlRenameDatabaseSql(input) {
  if (
    !strictRecord(input, [
      "fromDatabaseName",
      "identityReceipt",
      "toDatabaseName",
    ])
  ) {
    fail("POSTGRESQL_RENAME_DATABASE_INPUT_INVALID", [
      "EXACT_DATA_ONLY_RENAME_INPUT_REQUIRED",
    ]);
  }
  if (
    !validIdentityReceipt(input.identityReceipt) ||
    input.identityReceipt.exhaustiveIdentityScopeBound !== true ||
    input.identityReceipt.activeSessionCount !== 0 ||
    input.identityReceipt.sealed !== true ||
    input.identityReceipt.marker === null ||
    input.fromDatabaseName !== input.identityReceipt.databaseName
  ) {
    fail("POSTGRESQL_RENAME_DATABASE_INPUT_INVALID", [
      "SEALED_MARKED_SOURCE_IDENTITY_REQUIRED",
    ]);
  }
  const names = deriveCurrent180Current190PostgresqlRehearsalDatabaseNames(
    input.identityReceipt.runToken,
  );
  const validDirection =
    (input.fromDatabaseName === names.workingDatabaseName &&
      input.toDatabaseName === names.finalDatabaseName) ||
    (input.fromDatabaseName === names.finalDatabaseName &&
      input.toDatabaseName === names.workingDatabaseName);
  if (!validDirection) {
    fail("POSTGRESQL_RENAME_DATABASE_INPUT_INVALID", [
      "SAME_TOKEN_WORKING_FINAL_RENAME_REQUIRED",
    ]);
  }
  const sql = `ALTER DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(input.fromDatabaseName)} RENAME TO ${quoteCurrent180Current190PostgresqlIdentifier(input.toDatabaseName)};`;
  return statement("RENAME_SAME_TOKEN_DATABASE", sql, {
    activeSessionCount: 0,
    catalogReconciliationMustImmediatelyPrecedeExecution: true,
    identityReceiptDigest: input.identityReceipt.identityReceiptDigest,
    receiptIsExecutionAuthority: false,
  });
}

export function buildCurrent180Current190PostgresqlDropDatabaseSql(input) {
  if (!strictRecord(input, ["databaseName", "identityReceipt"])) {
    fail("POSTGRESQL_DROP_DATABASE_INPUT_INVALID", [
      "EXACT_DATA_ONLY_DROP_INPUT_REQUIRED",
    ]);
  }
  if (
    !validIdentityReceipt(input.identityReceipt) ||
    input.identityReceipt.exhaustiveIdentityScopeBound !== true ||
    input.identityReceipt.activeSessionCount !== 0 ||
    input.identityReceipt.status !== "STRUCTURE_VERIFIED_OWNED_SEALED_MARKED" ||
    input.identityReceipt.sealed !== true ||
    input.identityReceipt.marker === null ||
    input.databaseName !== input.identityReceipt.databaseName
  ) {
    fail("POSTGRESQL_DROP_DATABASE_INPUT_INVALID", [
      "PREVIOUSLY_VERIFIED_OWNED_SEALED_MARKED_IDENTITY_REQUIRED",
    ]);
  }
  const sql = `DROP DATABASE ${quoteCurrent180Current190PostgresqlIdentifier(input.databaseName)};`;
  return statement("DROP_EXACT_OWNED_SEALED_TARGET", sql, {
    activeSessionCount: 0,
    exactDatabaseOid: input.identityReceipt.databaseOid,
    exactMarker: input.identityReceipt.marker,
    exactOwnerName: input.identityReceipt.ownerName,
    exactOwnerOid: input.identityReceipt.ownerOid,
    identityReceiptDigest: input.identityReceipt.identityReceiptDigest,
    catalogReconciliationMustImmediatelyPrecedeExecution: true,
    receiptIsExecutionAuthority: false,
  });
}

const CATALOG_FINGERPRINT_SQL = `SELECT
  pg_catalog.pg_encoding_to_char(database.encoding)::text AS "encoding",
  database.datlocprovider::text AS "localeProvider",
  database.datcollate::text AS "collation",
  database.datctype::text AS "characterType",
  database.daticulocale::text AS "icuLocale",
  database.daticurules::text AS "icuRules",
  database.datcollversion::text AS "collationVersion",
  database.datconnlimit::integer AS "connectionLimit",
  database.datistemplate AS "isTemplate",
  database.datallowconn AS "allowConnections",
  owner.rolname::text AS "ownerName",
  COALESCE(database.datacl::text, '') AS "databaseAcl"
FROM pg_catalog.pg_database AS database
INNER JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = database.datdba
WHERE database.datname = pg_catalog.current_database();`;

const DATABASE_ROLE_SETTINGS_SQL = `WITH current_database_identity AS (
  SELECT database.oid AS "databaseOid"
  FROM pg_catalog.pg_database AS database
  WHERE database.datname = pg_catalog.current_database()
),
records AS (
  SELECT
    CASE
      WHEN database_role_setting.setdatabase = 0 THEN 'ALL_DATABASES'
      ELSE 'CURRENT_DATABASE'
    END::text AS "databaseScope",
    CASE
      WHEN database_role_setting.setrole = 0 THEN 'ALL_ROLES'
      ELSE 'NAMED_ROLE'
    END::text AS "roleScope",
    COALESCE(target_role.rolname::text, '') AS "roleName",
    expanded_setting."setting"::text AS "setting"
  FROM pg_catalog.pg_db_role_setting AS database_role_setting
  CROSS JOIN current_database_identity
  LEFT JOIN pg_catalog.pg_roles AS target_role
    ON target_role.oid = database_role_setting.setrole
  CROSS JOIN LATERAL pg_catalog.unnest(database_role_setting.setconfig)
    AS expanded_setting("setting")
  WHERE database_role_setting.setdatabase IN (
      0,
      current_database_identity."databaseOid"
    )
    AND (
      database_role_setting.setrole = 0
      OR target_role.oid IS NOT NULL
    )
)
SELECT
  records."databaseScope",
  records."roleScope",
  records."roleName",
  records."setting"
FROM records
ORDER BY
  records."databaseScope" COLLATE "C",
  records."roleScope" COLLATE "C",
  records."roleName" COLLATE "C",
  records."setting" COLLATE "C";`;

const CLUSTER_ROLES_SQL = `SELECT
  target_role.rolname::text AS "roleName",
  target_role.rolsuper AS "superuser",
  target_role.rolinherit AS "inherit",
  target_role.rolcreaterole AS "createRole",
  target_role.rolcreatedb AS "createDatabase",
  target_role.rolcanlogin AS "canLogin",
  target_role.rolreplication AS "replication",
  target_role.rolbypassrls AS "bypassRls",
  target_role.rolconnlimit::integer AS "connectionLimit",
  target_role.rolpassword IS NOT NULL AS "passwordSet",
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(COALESCE(target_role.rolpassword, ''), 'UTF8')
    ),
    'hex'
  ) AS "passwordVerifierDigest",
  COALESCE(target_role.rolvaliduntil::text, '') AS "validUntil",
  COALESCE(
    pg_catalog.shobj_description(target_role.oid, 'pg_authid'),
    ''
  )::text AS "comment"
FROM pg_catalog.pg_authid AS target_role
ORDER BY target_role.rolname COLLATE "C";`;

const CLUSTER_ROLE_MEMBERSHIPS_SQL = `SELECT
  granted_role.rolname::text AS "roleName",
  member_role.rolname::text AS "memberName",
  grantor_role.rolname::text AS "grantorName",
  membership.admin_option AS "adminOption",
  membership.inherit_option AS "inheritOption",
  membership.set_option AS "setOption"
FROM pg_catalog.pg_auth_members AS membership
INNER JOIN pg_catalog.pg_authid AS granted_role
  ON granted_role.oid = membership.roleid
INNER JOIN pg_catalog.pg_authid AS member_role
  ON member_role.oid = membership.member
INNER JOIN pg_catalog.pg_authid AS grantor_role
  ON grantor_role.oid = membership.grantor
ORDER BY
  granted_role.rolname COLLATE "C",
  member_role.rolname COLLATE "C",
  grantor_role.rolname COLLATE "C",
  membership.admin_option,
  membership.inherit_option,
  membership.set_option;`;

const SCHEMA_RELATIONS_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "relationName",
  relation.relkind::text AS "relationKind",
  relation.relpersistence::text AS "persistence",
  relation.relispartition AS "isPartition",
  COALESCE(
    pg_catalog.pg_get_expr(relation.relpartbound, relation.oid, true),
    ''
  )::text AS "partitionBound",
  COALESCE(pg_catalog.pg_get_partkeydef(relation.oid), '')::text AS "partitionKey",
  CASE
    WHEN relation.relkind = 'm' THEN relation.relispopulated
    ELSE NULL
  END AS "materializedViewPopulated",
  owner.rolname::text AS "ownerName",
  relation.relrowsecurity AS "rowSecurity",
  relation.relforcerowsecurity AS "forceRowSecurity",
  relation.relreplident::text AS "replicaIdentity",
  COALESCE(relation.reloptions::text, '') AS "options",
  COALESCE(relation.relacl::text, '') AS "acl",
  COALESCE(pg_catalog.obj_description(relation.oid, 'pg_class'), '') AS "comment"
FROM pg_catalog.pg_class AS relation
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
INNER JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = relation.relowner
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY relation.relname COLLATE "C", relation.relkind;`;

const SCHEMA_COLUMNS_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "relationName",
  attribute.attnum::integer AS "ordinal",
  attribute.attname::text AS "columnName",
  pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)::text AS "dataType",
  attribute.attnotnull AS "notNull",
  attribute.attidentity::text AS "identityKind",
  attribute.attgenerated::text AS "generatedKind",
  COALESCE(attribute.attacl::text, '') AS "acl",
  COALESCE(pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid), '') AS "defaultExpression",
  COALESCE(target_collation.collname::text, '') AS "collationName",
  COALESCE(pg_catalog.col_description(relation.oid, attribute.attnum), '') AS "comment"
FROM pg_catalog.pg_attribute AS attribute
INNER JOIN pg_catalog.pg_class AS relation
  ON relation.oid = attribute.attrelid
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
LEFT JOIN pg_catalog.pg_collation AS target_collation
  ON target_collation.oid = attribute.attcollation
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute.attnum > 0
  AND attribute.attisdropped = false
ORDER BY relation.relname COLLATE "C", attribute.attnum;`;

const SCHEMA_CONSTRAINTS_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "relationName",
  target_constraint.conname::text AS "constraintName",
  target_constraint.contype::text AS "constraintType",
  target_constraint.condeferrable AS "deferrable",
  target_constraint.condeferred AS "initiallyDeferred",
  target_constraint.convalidated AS "validated",
  pg_catalog.pg_get_constraintdef(target_constraint.oid, true)::text AS "definition"
FROM pg_catalog.pg_constraint AS target_constraint
INNER JOIN pg_catalog.pg_class AS relation
  ON relation.oid = target_constraint.conrelid
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
ORDER BY relation.relname COLLATE "C", target_constraint.conname COLLATE "C";`;

const SCHEMA_INDEXES_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "relationName",
  index_relation.relname::text AS "indexName",
  target_index.indisunique AS "unique",
  target_index.indisprimary AS "primary",
  target_index.indisvalid AS "valid",
  target_index.indisready AS "ready",
  target_index.indisreplident AS "replicaIdentity",
  target_index.indisclustered AS "clustered",
  pg_catalog.pg_get_indexdef(index_relation.oid)::text AS "definition",
  COALESCE(index_relation.reloptions::text, '') AS "options",
  COALESCE(index_relation.relacl::text, '') AS "acl"
FROM pg_catalog.pg_index AS target_index
INNER JOIN pg_catalog.pg_class AS relation
  ON relation.oid = target_index.indrelid
INNER JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = target_index.indexrelid
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
ORDER BY relation.relname COLLATE "C", index_relation.relname COLLATE "C";`;

const SCHEMA_ROUTINES_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  routine.proname::text AS "routineName",
  pg_catalog.pg_get_function_identity_arguments(routine.oid)::text AS "identityArguments",
  pg_catalog.pg_get_function_result(routine.oid)::text AS "resultType",
  language.lanname::text AS "language",
  owner.rolname::text AS "ownerName",
  routine.prokind::text AS "routineKind",
  routine.provolatile::text AS "volatility",
  routine.proisstrict AS "strict",
  routine.prosecdef AS "securityDefiner",
  routine.proleakproof AS "leakproof",
  routine.proparallel::text AS "parallelSafety",
  COALESCE(routine.proconfig::text, '') AS "configuration",
  COALESCE(routine.proacl::text, '') AS "acl",
  COALESCE(pg_catalog.obj_description(routine.oid, 'pg_proc'), '') AS "comment",
  pg_catalog.pg_get_functiondef(routine.oid)::text AS "definition"
FROM pg_catalog.pg_proc AS routine
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = routine.pronamespace
INNER JOIN pg_catalog.pg_language AS language
  ON language.oid = routine.prolang
INNER JOIN pg_catalog.pg_roles AS owner
  ON owner.oid = routine.proowner
WHERE namespace.nspname = 'public'
ORDER BY routine.proname COLLATE "C", pg_catalog.pg_get_function_identity_arguments(routine.oid) COLLATE "C";`;

const SCHEMA_TRIGGERS_POLICIES_ENUMS_SQL = `WITH records AS (
  SELECT
    'TRIGGER'::text AS "objectKind",
    relation.relname::text AS "parentName",
    target_trigger.tgname::text AS "objectName",
    target_trigger.tgenabled::text AS "objectState",
    pg_catalog.pg_get_triggerdef(target_trigger.oid, true)::text AS "definition"
  FROM pg_catalog.pg_trigger AS target_trigger
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = target_trigger.tgrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND target_trigger.tgisinternal = false
  UNION ALL
  SELECT
    'POLICY'::text,
    relation.relname::text,
    policy.polname::text,
    ''::text,
    pg_catalog.concat_ws('|', policy.polcmd::text, policy.polpermissive::text,
      COALESCE((
        SELECT pg_catalog.string_agg(
          CASE
            WHEN policy_role."roleOid" = 0 THEN 'PUBLIC'
            ELSE target_role.rolname::text
          END,
          ',' ORDER BY
            CASE
              WHEN policy_role."roleOid" = 0 THEN 'PUBLIC'
              ELSE target_role.rolname::text
            END COLLATE "C"
        )
        FROM pg_catalog.unnest(policy.polroles) AS policy_role("roleOid")
        LEFT JOIN pg_catalog.pg_roles AS target_role
          ON target_role.oid = policy_role."roleOid"
      ), ''),
      COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
      COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''))::text
  FROM pg_catalog.pg_policy AS policy
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = policy.polrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
  UNION ALL
  SELECT
    'ENUM_LABEL'::text,
    target_type.typname::text,
    target_enum.enumlabel::text,
    ''::text,
    target_enum.enumsortorder::text
  FROM pg_catalog.pg_enum AS target_enum
  INNER JOIN pg_catalog.pg_type AS target_type
    ON target_type.oid = target_enum.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = target_type.typnamespace
  WHERE namespace.nspname = 'public'
  UNION ALL
  SELECT
    CASE relation.relkind
      WHEN 'v' THEN 'VIEW'
      ELSE 'MATERIALIZED_VIEW'
    END::text,
    relation.relname::text,
    relation.relname::text,
    CASE
      WHEN relation.relkind = 'm' THEN relation.relispopulated::text
      ELSE ''::text
    END,
    pg_catalog.pg_get_viewdef(relation.oid, true)::text
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('v', 'm')
  UNION ALL
  SELECT
    'SEQUENCE'::text,
    relation.relname::text,
    relation.relname::text,
    ''::text,
    pg_catalog.concat_ws('|',
      pg_catalog.format_type(target_sequence.seqtypid, NULL),
      target_sequence.seqstart::text,
      target_sequence.seqincrement::text,
      target_sequence.seqmax::text,
      target_sequence.seqmin::text,
      target_sequence.seqcache::text,
      target_sequence.seqcycle::text)::text
  FROM pg_catalog.pg_sequence AS target_sequence
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = target_sequence.seqrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
  UNION ALL
  SELECT
    'DOMAIN'::text,
    target_type.typname::text,
    target_type.typname::text,
    ''::text,
    pg_catalog.concat_ws('|',
      pg_catalog.format_type(target_type.typbasetype, target_type.typtypmod),
      target_type.typnotnull::text,
      COALESCE(target_type.typdefault, ''),
      owner.rolname::text,
      COALESCE(target_type.typacl::text, ''))::text
  FROM pg_catalog.pg_type AS target_type
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = target_type.typnamespace
  INNER JOIN pg_catalog.pg_roles AS owner
    ON owner.oid = target_type.typowner
  WHERE namespace.nspname = 'public'
    AND target_type.typtype = 'd'
  UNION ALL
  SELECT
    'DOMAIN_CONSTRAINT'::text,
    target_type.typname::text,
    target_constraint.conname::text,
    target_constraint.convalidated::text,
    pg_catalog.pg_get_constraintdef(target_constraint.oid, true)::text
  FROM pg_catalog.pg_constraint AS target_constraint
  INNER JOIN pg_catalog.pg_type AS target_type
    ON target_type.oid = target_constraint.contypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = target_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND target_type.typtype = 'd'
  UNION ALL
  SELECT
    'ENUM_TYPE'::text,
    target_type.typname::text,
    target_type.typname::text,
    ''::text,
    pg_catalog.concat_ws('|',
      owner.rolname::text,
      COALESCE(target_type.typacl::text, ''),
      COALESCE(pg_catalog.obj_description(target_type.oid, 'pg_type'), ''))::text
  FROM pg_catalog.pg_type AS target_type
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = target_type.typnamespace
  INNER JOIN pg_catalog.pg_roles AS owner
    ON owner.oid = target_type.typowner
  WHERE namespace.nspname = 'public'
    AND target_type.typtype = 'e'
  UNION ALL
  SELECT
    'SCHEMA'::text,
    namespace.nspname::text,
    namespace.nspname::text,
    ''::text,
    pg_catalog.concat_ws('|',
      owner.rolname::text,
      COALESCE(namespace.nspacl::text, ''),
      COALESCE(pg_catalog.obj_description(namespace.oid, 'pg_namespace'), ''))::text
  FROM pg_catalog.pg_namespace AS namespace
  INNER JOIN pg_catalog.pg_roles AS owner
    ON owner.oid = namespace.nspowner
  WHERE namespace.nspname = 'public'
  UNION ALL
  SELECT
    'DEFAULT_ACL'::text,
    COALESCE(namespace.nspname::text, 'GLOBAL'),
    owner.rolname::text || ':' || default_acl.defaclobjtype::text,
    ''::text,
    COALESCE(default_acl.defaclacl::text, '')::text
  FROM pg_catalog.pg_default_acl AS default_acl
  INNER JOIN pg_catalog.pg_roles AS owner
    ON owner.oid = default_acl.defaclrole
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = default_acl.defaclnamespace
  WHERE default_acl.defaclnamespace = 0
     OR namespace.nspname = 'public'
  UNION ALL
  SELECT
    'EXTENSION'::text,
    namespace.nspname::text,
    target_extension.extname::text,
    ''::text,
    target_extension.extversion::text
  FROM pg_catalog.pg_extension AS target_extension
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = target_extension.extnamespace
)
SELECT "objectKind", "parentName", "objectName", "objectState", "definition"
FROM records
ORDER BY "objectKind" COLLATE "C", "parentName" COLLATE "C", "objectName" COLLATE "C", "objectState" COLLATE "C", "definition" COLLATE "C";`;

const SCHEMA_TOPOLOGY_DEPENDENCIES_SQL = `WITH records AS (
  SELECT
    'INHERITANCE'::text AS "objectKind",
    child_namespace.nspname::text AS "sourceSchemaName",
    child.relname::text AS "sourceObjectName",
    parent_namespace.nspname::text AS "targetSchemaName",
    parent.relname::text AS "targetObjectName",
    ''::text AS "targetColumnName",
    target_inheritance.inhseqno::text AS "dependencyType",
    COALESCE(
      pg_catalog.pg_get_expr(child.relpartbound, child.oid, true),
      ''
    )::text AS "definition"
  FROM pg_catalog.pg_inherits AS target_inheritance
  INNER JOIN pg_catalog.pg_class AS child
    ON child.oid = target_inheritance.inhrelid
  INNER JOIN pg_catalog.pg_namespace AS child_namespace
    ON child_namespace.oid = child.relnamespace
  INNER JOIN pg_catalog.pg_class AS parent
    ON parent.oid = target_inheritance.inhparent
  INNER JOIN pg_catalog.pg_namespace AS parent_namespace
    ON parent_namespace.oid = parent.relnamespace
  WHERE child_namespace.nspname = 'public'
     OR parent_namespace.nspname = 'public'
  UNION ALL
  SELECT
    'PARTITION_KEY'::text,
    namespace.nspname::text,
    relation.relname::text,
    ''::text,
    ''::text,
    ''::text,
    ''::text,
    COALESCE(pg_catalog.pg_get_partkeydef(relation.oid), '')::text
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'p'
  UNION ALL
  SELECT
    'SEQUENCE_OWNER'::text,
    sequence_namespace.nspname::text,
    target_sequence.relname::text,
    ''::text,
    owner.rolname::text,
    ''::text,
    'OWNER'::text,
    ''::text
  FROM pg_catalog.pg_class AS target_sequence
  INNER JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = target_sequence.relnamespace
  INNER JOIN pg_catalog.pg_roles AS owner
    ON owner.oid = target_sequence.relowner
  WHERE sequence_namespace.nspname = 'public'
    AND target_sequence.relkind = 'S'
  UNION ALL
  SELECT
    'SEQUENCE_RELATION_DEPENDENCY'::text,
    sequence_namespace.nspname::text,
    target_sequence.relname::text,
    referenced_namespace.nspname::text,
    referenced_relation.relname::text,
    COALESCE(referenced_attribute.attname::text, ''),
    dependency.deptype::text,
    dependency.refobjsubid::text
  FROM pg_catalog.pg_depend AS dependency
  INNER JOIN pg_catalog.pg_class AS target_sequence
    ON dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
   AND dependency.objid = target_sequence.oid
   AND target_sequence.relkind = 'S'
  INNER JOIN pg_catalog.pg_namespace AS sequence_namespace
    ON sequence_namespace.oid = target_sequence.relnamespace
  INNER JOIN pg_catalog.pg_class AS referenced_relation
    ON dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
   AND dependency.refobjid = referenced_relation.oid
  INNER JOIN pg_catalog.pg_namespace AS referenced_namespace
    ON referenced_namespace.oid = referenced_relation.relnamespace
  LEFT JOIN pg_catalog.pg_attribute AS referenced_attribute
    ON referenced_attribute.attrelid = referenced_relation.oid
   AND referenced_attribute.attnum = dependency.refobjsubid
   AND referenced_attribute.attisdropped = false
  WHERE sequence_namespace.nspname = 'public'
)
SELECT
  "objectKind",
  "sourceSchemaName",
  "sourceObjectName",
  "targetSchemaName",
  "targetObjectName",
  "targetColumnName",
  "dependencyType",
  "definition"
FROM records
ORDER BY
  "objectKind" COLLATE "C",
  "sourceSchemaName" COLLATE "C",
  "sourceObjectName" COLLATE "C",
  "targetSchemaName" COLLATE "C",
  "targetObjectName" COLLATE "C",
  "targetColumnName" COLLATE "C",
  "dependencyType" COLLATE "C",
  "definition" COLLATE "C";`;

const DATA_TABLE_INVENTORY_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "tableName",
  relation.relkind::text AS "relationKind",
  CASE
    WHEN relation.relkind = 'm' THEN relation.relispopulated
    ELSE NULL
  END AS "materializedViewPopulated"
FROM pg_catalog.pg_class AS relation
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p', 'm')
  AND relation.relispartition = false
  AND relation.relname <> '_prisma_migrations'
ORDER BY relation.relname COLLATE "C";`;

const DATA_SEQUENCE_INVENTORY_SQL = `SELECT
  namespace.nspname::text AS "schemaName",
  relation.relname::text AS "sequenceName"
FROM pg_catalog.pg_class AS relation
INNER JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind = 'S'
ORDER BY relation.relname COLLATE "C";`;

const MIGRATION_SEMANTIC_FINGERPRINT_SQL = `SELECT
  migration."migration_name"::text AS "migrationName",
  migration."checksum"::text AS "checksum",
  migration."finished_at" IS NOT NULL AS "finished",
  migration."rolled_back_at" IS NOT NULL AS "rolledBack",
  migration."applied_steps_count"::integer AS "appliedStepsCount",
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(COALESCE(migration."logs", ''), 'UTF8')
    ),
    'hex'
  ) AS "logsSha256"
FROM public."_prisma_migrations" AS migration
ORDER BY migration."migration_name" COLLATE "C";`;

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES =
  deepFreeze({
    catalog: readOnlyQuery(
      "fingerprint-catalog",
      "SOURCE_OR_TARGET",
      [
        "encoding",
        "localeProvider",
        "collation",
        "characterType",
        "icuLocale",
        "icuRules",
        "collationVersion",
        "connectionLimit",
        "isTemplate",
        "allowConnections",
        "ownerName",
        "databaseAcl",
      ],
      CATALOG_FINGERPRINT_SQL,
    ),
    databaseRoleSettings: readOnlyQuery(
      "fingerprint-database-role-settings",
      "SOURCE_OR_TARGET",
      ["databaseScope", "roleScope", "roleName", "setting"],
      DATABASE_ROLE_SETTINGS_SQL,
    ),
    clusterRoles: readOnlyQuery(
      "fingerprint-cluster-roles",
      "SOURCE_OR_TARGET",
      [
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
      ],
      CLUSTER_ROLES_SQL,
    ),
    clusterRoleMemberships: readOnlyQuery(
      "fingerprint-cluster-role-memberships",
      "SOURCE_OR_TARGET",
      [
        "roleName",
        "memberName",
        "grantorName",
        "adminOption",
        "inheritOption",
        "setOption",
      ],
      CLUSTER_ROLE_MEMBERSHIPS_SQL,
    ),
    schemaRelations: readOnlyQuery(
      "fingerprint-schema-relations",
      "SOURCE_OR_TARGET",
      [
        "schemaName",
        "relationName",
        "relationKind",
        "persistence",
        "isPartition",
        "partitionBound",
        "partitionKey",
        "materializedViewPopulated",
        "ownerName",
        "rowSecurity",
        "forceRowSecurity",
        "replicaIdentity",
        "options",
        "acl",
        "comment",
      ],
      SCHEMA_RELATIONS_SQL,
    ),
    schemaColumns: readOnlyQuery(
      "fingerprint-schema-columns",
      "SOURCE_OR_TARGET",
      [
        "schemaName",
        "relationName",
        "ordinal",
        "columnName",
        "dataType",
        "notNull",
        "identityKind",
        "generatedKind",
        "acl",
        "defaultExpression",
        "collationName",
        "comment",
      ],
      SCHEMA_COLUMNS_SQL,
    ),
    schemaConstraints: readOnlyQuery(
      "fingerprint-schema-constraints",
      "SOURCE_OR_TARGET",
      [
        "schemaName",
        "relationName",
        "constraintName",
        "constraintType",
        "deferrable",
        "initiallyDeferred",
        "validated",
        "definition",
      ],
      SCHEMA_CONSTRAINTS_SQL,
    ),
    schemaIndexes: readOnlyQuery(
      "fingerprint-schema-indexes",
      "SOURCE_OR_TARGET",
      [
        "schemaName",
        "relationName",
        "indexName",
        "unique",
        "primary",
        "valid",
        "ready",
        "replicaIdentity",
        "clustered",
        "definition",
        "options",
        "acl",
      ],
      SCHEMA_INDEXES_SQL,
    ),
    schemaRoutines: readOnlyQuery(
      "fingerprint-schema-routines",
      "SOURCE_OR_TARGET",
      [
        "schemaName",
        "routineName",
        "identityArguments",
        "resultType",
        "language",
        "ownerName",
        "routineKind",
        "volatility",
        "strict",
        "securityDefiner",
        "leakproof",
        "parallelSafety",
        "configuration",
        "acl",
        "comment",
        "definition",
      ],
      SCHEMA_ROUTINES_SQL,
    ),
    schemaTriggersPoliciesEnums: readOnlyQuery(
      "fingerprint-schema-triggers-policies-enums",
      "SOURCE_OR_TARGET",
      ["objectKind", "parentName", "objectName", "objectState", "definition"],
      SCHEMA_TRIGGERS_POLICIES_ENUMS_SQL,
    ),
    schemaTopologyDependencies: readOnlyQuery(
      "fingerprint-schema-topology-dependencies",
      "SOURCE_OR_TARGET",
      [
        "objectKind",
        "sourceSchemaName",
        "sourceObjectName",
        "targetSchemaName",
        "targetObjectName",
        "targetColumnName",
        "dependencyType",
        "definition",
      ],
      SCHEMA_TOPOLOGY_DEPENDENCIES_SQL,
    ),
    dataTableInventory: readOnlyQuery(
      "fingerprint-data-table-inventory",
      "SOURCE_OR_TARGET",
      ["schemaName", "tableName", "relationKind", "materializedViewPopulated"],
      DATA_TABLE_INVENTORY_SQL,
    ),
    dataSequenceInventory: readOnlyQuery(
      "fingerprint-data-sequence-inventory",
      "SOURCE_OR_TARGET",
      ["schemaName", "sequenceName"],
      DATA_SEQUENCE_INVENTORY_SQL,
    ),
    migrationSemantics: readOnlyQuery(
      "fingerprint-migration-semantics",
      "SOURCE_OR_TARGET",
      [
        "migrationName",
        "checksum",
        "finished",
        "rolledBack",
        "appliedStepsCount",
        "logsSha256",
      ],
      MIGRATION_SEMANTIC_FINGERPRINT_SQL,
    ),
  });

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_PLAN =
  deepFreeze({
    canonicalization:
      "QUERY_SPEC_DIGEST_PLUS_ORDERED_QUERY_ROWS_CANONICAL_JSON_UTF8_LF_SHA256",
    comparisonComponents: [
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
      "oneApplicationOrMaterializedViewDataDigestPerInventoryRow",
      "dataSequenceInventory",
      "oneSequenceStatePerInventoryRow",
    ],
    contract: "CURRENT180_CURRENT190_POSTGRESQL_SEMANTIC_FINGERPRINT_V2",
    explicitExclusions: {
      applicationDataColumns: [],
      clusterRoleSecrets: [
        "raw pg_authid.rolpassword (SHA-256 digest retained)",
      ],
      databaseIdentity: ["pg_database.datname", "pg_database.oid"],
      databaseRunIdentity: [
        "pg_shdescription ownership marker for the disposable pg_database row",
      ],
      generatedMigrationReceiptIdentity: ["_prisma_migrations.id"],
      objectIdentity: [
        "pg_class.oid",
        "pg_constraint.oid",
        "pg_database.datdba",
        "pg_enum.oid",
        "pg_index.indexrelid",
        "pg_namespace.oid",
        "pg_proc.oid",
        "pg_roles.oid",
        "pg_trigger.oid",
        "all catalog OID reference columns",
      ],
      physicalAndStatisticsState: [
        "pg_database.datfrozenxid",
        "pg_database.datminmxid",
        "pg_class.relfilenode",
        "pg_class.relpages",
        "pg_class.reltuples",
        "pg_stat_activity backend/session timing fields",
      ],
      sequenceDataFields: [],
      timestamps: [
        "_prisma_migrations.started_at",
        "_prisma_migrations.finished_at value (nullness retained)",
        "_prisma_migrations.rolled_back_at value (nullness retained)",
      ],
    },
    requiredSemanticCoverage: {
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
    },
    sourceFingerprintIncludesDatabaseNameOrOid: false,
  });

export function buildCurrent180Current190PostgresqlApplicationDataFingerprintQuery(
  input,
) {
  if (
    !strictRecord(input, [
      "materializedViewPopulated",
      "relationKind",
      "schemaName",
      "tableName",
    ])
  ) {
    fail("POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID", [
      "EXACT_AUTHENTICATED_INVENTORY_ROW_SHAPE_REQUIRED",
    ]);
  }
  if (
    input.schemaName !== "public" ||
    !boundedIdentifier(input.tableName) ||
    !["r", "p", "m"].includes(input.relationKind) ||
    (input.relationKind === "m"
      ? typeof input.materializedViewPopulated !== "boolean"
      : input.materializedViewPopulated !== null)
  ) {
    fail("POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID", [
      "PUBLIC_BOUNDED_RELATION_AND_EXACT_POPULATION_STATE_REQUIRED",
    ]);
  }
  if (input.tableName === "_prisma_migrations") {
    fail("POSTGRESQL_DATA_FINGERPRINT_INPUT_INVALID", [
      "MIGRATION_TABLE_HAS_DEDICATED_SEMANTIC_QUERY",
    ]);
  }
  const qualified = `${quoteCurrent180Current190PostgresqlIdentifier(input.schemaName)}.${quoteCurrent180Current190PostgresqlIdentifier(input.tableName)}`;
  const readsRelation =
    input.relationKind !== "m" || input.materializedViewPopulated;
  const sql = readsRelation
    ? `WITH canonical_rows AS (
  SELECT pg_catalog.to_jsonb(source_row)::text AS "rowJson"
  FROM ${qualified} AS source_row
)
SELECT
  pg_catalog.count(*)::bigint AS "rowCount",
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        COALESCE(
          pg_catalog.string_agg("rowJson", E'\\n' ORDER BY "rowJson" COLLATE "C"),
          ''
        ) || E'\\n',
        'UTF8'
      )
    ),
    'hex'
  ) AS "contentSha256"
FROM canonical_rows;`
    : `SELECT
  0::bigint AS "rowCount",
  pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(E'\\n', 'UTF8')),
    'hex'
  ) AS "contentSha256";`;
  return readOnlyQuery(
    input.relationKind === "m"
      ? "fingerprint-materialized-view-data"
      : "fingerprint-application-data-table",
    "SOURCE_OR_TARGET",
    ["rowCount", "contentSha256"],
    sql,
    {
      explicitExcludedColumns: [],
      derivation: {
        authenticatedInventoryReceiptRequired: true,
        callerSuppliedInventoryRowAuthorizesExecution: false,
        inventoryQuerySpecDigest:
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
            .dataTableInventory.querySpecDigest,
      },
      relationIdentity: {
        materializedViewPopulated: input.materializedViewPopulated,
        relationKind: input.relationKind,
        schemaName: input.schemaName,
        tableName: input.tableName,
      },
      relationReadAttemptedByThisModule: false,
      relationReadRequiredByFutureRunner: readsRelation,
    },
  );
}

export function buildCurrent180Current190PostgresqlSequenceDataFingerprintQuery(
  input,
) {
  if (!strictRecord(input, ["schemaName", "sequenceName"])) {
    fail("POSTGRESQL_SEQUENCE_FINGERPRINT_INPUT_INVALID", [
      "EXACT_DATA_ONLY_SEQUENCE_IDENTITY_REQUIRED",
    ]);
  }
  if (input.schemaName !== "public" || !boundedIdentifier(input.sequenceName)) {
    fail("POSTGRESQL_SEQUENCE_FINGERPRINT_INPUT_INVALID", [
      "PUBLIC_BOUNDED_SEQUENCE_IDENTITY_REQUIRED",
    ]);
  }
  const qualified = `${quoteCurrent180Current190PostgresqlIdentifier(input.schemaName)}.${quoteCurrent180Current190PostgresqlIdentifier(input.sequenceName)}`;
  const sql = `SELECT
  sequence_state.last_value::text AS "lastValue",
  sequence_state.is_called AS "isCalled"
FROM ${qualified} AS sequence_state;`;
  return readOnlyQuery(
    "fingerprint-application-sequence-state",
    "SOURCE_OR_TARGET",
    ["lastValue", "isCalled"],
    sql,
    {
      derivation: {
        authenticatedInventoryReceiptRequired: true,
        callerSuppliedInventoryRowAuthorizesExecution: false,
        inventoryQuerySpecDigest:
          CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_FINGERPRINT_QUERIES
            .dataSequenceInventory.querySpecDigest,
      },
      explicitExcludedFields: [],
      sequenceReadAttemptedByThisModule: false,
      sequenceIdentity: {
        schemaName: input.schemaName,
        sequenceName: input.sequenceName,
      },
    },
  );
}
