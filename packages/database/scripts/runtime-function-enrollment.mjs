import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const RUNTIME_FUNCTION_ENROLLMENT_SCHEMA_VERSION = 1;
export const RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION =
  "20260729160000_guest_game_delivery_claim_fence";
export const RUNTIME_FUNCTION_ENROLLMENT_MIGRATION =
  "20260729230000_identity_invite_writer_boundary";
export const RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT = 169;

export const APPLICATION_RUNTIME_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "deliveryTransitionKey",
    catalogSignature:
      'public."guest_game_delivery_transition_key_v1"(text,text,text,bigint,integer,text,integer,text,text,text,text)',
    grantSignature:
      'public."guest_game_delivery_transition_key_v1"(TEXT, TEXT, TEXT, BIGINT, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: false,
    volatility: "i",
  }),
  Object.freeze({
    key: "rewardDeliveryLock",
    catalogSignature:
      'public."guest_game_reward_delivery_lock_v1"(text,text)',
    grantSignature:
      'public."guest_game_reward_delivery_lock_v1"(TEXT, TEXT)',
    securityDefiner: false,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimReserveInvite",
    catalogSignature:
      'public."identity_email_claim_reserve_invite_v2"(text,text,text)',
    grantSignature:
      'public."identity_email_claim_reserve_invite_v2"(TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimAssertInvite",
    catalogSignature:
      'public."identity_email_claim_assert_invite_v1"(text,text,text,integer)',
    grantSignature:
      'public."identity_email_claim_assert_invite_v1"(TEXT, TEXT, TEXT, INTEGER)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimTransition",
    catalogSignature:
      'public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)',
    grantSignature:
      'public."identity_email_claim_transition_v2"(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimRelease",
    catalogSignature:
      'public."identity_email_claim_release_v2"(text,text,text,text,integer)',
    grantSignature:
      'public."identity_email_claim_release_v2"(TEXT, TEXT, TEXT, TEXT, INTEGER)',
    securityDefiner: true,
    volatility: "v",
  }),
]);

export const EXCLUDED_WORKER_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "durableDeliveryEventWriter",
    catalogSignature:
      'public."guest_game_delivery_record_event_v1"(json)',
    grantSignature:
      'public."guest_game_delivery_record_event_v1"(JSON)',
    securityDefiner: true,
    volatility: "v",
  }),
]);

export const EXCLUDED_PENDING_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "identityEmailClaimDirectLock",
    catalogSignature:
      'public."identity_email_claim_lock_v1"(text)',
    grantSignature:
      'public."identity_email_claim_lock_v1"(TEXT)',
    securityDefiner: false,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimReserveInviteV1",
    catalogSignature:
      'public."identity_email_claim_reserve_invite_v1"(text,text,text)',
    grantSignature:
      'public."identity_email_claim_reserve_invite_v1"(TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimTransitionV1",
    catalogSignature:
      'public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)',
    grantSignature:
      'public."identity_email_claim_transition_v1"(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityEmailClaimReleaseV1",
    catalogSignature:
      'public."identity_email_claim_release_v1"(text,text,text,text,integer)',
    grantSignature:
      'public."identity_email_claim_release_v1"(TEXT, TEXT, TEXT, TEXT, INTEGER)',
    securityDefiner: true,
    volatility: "v",
  }),
]);

const EXCLUDED_RUNTIME_FUNCTIONS = Object.freeze([
  ...EXCLUDED_WORKER_FUNCTIONS,
  ...EXCLUDED_PENDING_FUNCTIONS,
]);
const ALL_RUNTIME_FUNCTIONS = Object.freeze([
  ...APPLICATION_RUNTIME_FUNCTIONS,
  ...EXCLUDED_RUNTIME_FUNCTIONS,
]);
export const SEALED_RUNTIME_TABLES = Object.freeze([
  Object.freeze({
    key: "identityEmailClaim",
    catalogName: 'public."IdentityEmailClaim"',
    grantName: 'public."IdentityEmailClaim"',
  }),
]);
const SAFE_DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/u;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);

export class RuntimeFunctionEnrollmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeFunctionEnrollmentError";
    this.code = code;
  }
}

function contractError(code, message) {
  throw new RuntimeFunctionEnrollmentError(code, message);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function expectedApplyConfirmation(
  databaseName,
  roleName,
) {
  return [
    "APPLY_RUNTIME_FUNCTION_ENROLLMENT_V1",
    databaseName,
    roleName,
    RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
    RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
  ].join(" ");
}

export function parseRuntimeFunctionEnrollmentConfig(
  environment,
  mode,
) {
  if (mode !== "check" && mode !== "apply") {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_MODE_INVALID",
      "Mode must be check or apply.",
    );
  }

  const rawDatabaseUrl = stringValue(environment.DATABASE_URL);
  if (!rawDatabaseUrl) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_REQUIRED",
      "DATABASE_URL is required.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawDatabaseUrl);
  } catch {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_INVALID",
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
  if (
    parsedUrl.protocol !== "postgresql:" &&
    parsedUrl.protocol !== "postgres:"
  ) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_PROTOCOL_INVALID",
      "DATABASE_URL must use PostgreSQL.",
    );
  }
  if (!parsedUrl.hostname || parsedUrl.hash) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_TARGET_INVALID",
      "DATABASE_URL must identify one PostgreSQL host and database.",
    );
  }

  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\/+/u, ""),
  );
  if (
    !SAFE_DATABASE_NAME.test(databaseName) ||
    SYSTEM_DATABASES.has(databaseName)
  ) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_INVALID",
      "DATABASE_URL must name one non-system lowercase PostgreSQL database.",
    );
  }
  const queryKeys = [...parsedUrl.searchParams.keys()];
  if (
    queryKeys.length !== 1 ||
    queryKeys[0] !== "schema" ||
    parsedUrl.searchParams.get("schema") !== "public"
  ) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
      "DATABASE_URL must contain only schema=public.",
    );
  }

  const expectedDatabase = stringValue(
    environment.RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE,
  );
  if (
    !SAFE_DATABASE_NAME.test(expectedDatabase) ||
    SYSTEM_DATABASES.has(expectedDatabase)
  ) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE_INVALID",
      "RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE must name one non-system lowercase database.",
    );
  }
  if (expectedDatabase !== databaseName) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DATABASE_MISMATCH",
      "DATABASE_URL does not match RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE.",
    );
  }

  const roleName = stringValue(
    environment.RUNTIME_FUNCTION_ENROLLMENT_ROLE,
  );
  if (!SAFE_ROLE_NAME.test(roleName) || roleName === "public") {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_ROLE_INVALID",
      "RUNTIME_FUNCTION_ENROLLMENT_ROLE must be one safe lowercase PostgreSQL role name.",
    );
  }

  const requiredConfirmation = expectedApplyConfirmation(
    databaseName,
    roleName,
  );
  if (
    mode === "apply" &&
    stringValue(environment.RUNTIME_FUNCTION_ENROLLMENT_CONFIRM) !==
      requiredConfirmation
  ) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_CONFIRMATION_INVALID",
      `RUNTIME_FUNCTION_ENROLLMENT_CONFIRM must equal ${requiredConfirmation}.`,
    );
  }

  return Object.freeze({
    mode,
    databaseName,
    databaseUrl: rawDatabaseUrl,
    roleName,
    expectedMigration: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
    expectedMigrationCount:
      RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
    requiredConfirmation,
  });
}

export function runtimeFunctionContractDigest() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: RUNTIME_FUNCTION_ENROLLMENT_SCHEMA_VERSION,
        requiredMigration:
          RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION,
        migration: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
        migrationCount:
          RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
        exactFunctionSearchPath: "pg_catalog",
        application: APPLICATION_RUNTIME_FUNCTIONS.map(
          ({ key, catalogSignature, securityDefiner, volatility }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
          }),
        ),
        excludedWorker: EXCLUDED_WORKER_FUNCTIONS.map(
          ({ key, catalogSignature, securityDefiner, volatility }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
          }),
        ),
        excludedPending: EXCLUDED_PENDING_FUNCTIONS.map(
          ({ key, catalogSignature, securityDefiner, volatility }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
          }),
        ),
        sealedTables: SEALED_RUNTIME_TABLES,
      }),
    )
    .digest("hex");
}

export function buildRuntimeFunctionEnrollmentStatements(roleName) {
  if (!SAFE_ROLE_NAME.test(roleName) || roleName === "public") {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_ROLE_INVALID",
      "Runtime role name is invalid.",
    );
  }
  const role = quoteIdentifier(roleName);
  const statements = [];

  for (const entry of SEALED_RUNTIME_TABLES) {
    statements.push(
      `REVOKE ALL PRIVILEGES ON TABLE ${entry.grantName} FROM ${role}`,
    );
  }
  for (const entry of APPLICATION_RUNTIME_FUNCTIONS) {
    statements.push(
      `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
    );
    statements.push(
      `REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION ${entry.grantSignature} FROM ${role}`,
    );
  }
  for (const entry of EXCLUDED_RUNTIME_FUNCTIONS) {
    statements.push(
      `REVOKE EXECUTE ON FUNCTION ${entry.grantSignature} FROM ${role}`,
    );
  }

  return Object.freeze(statements);
}

async function inspectFunction(prisma, roleName, entry) {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        function_object.oid IS NOT NULL AS exists,
        owner_role.rolname AS owner_name,
        function_object.prosecdef AS security_definer,
        function_object.provolatile::text AS volatility,
        COALESCE(
          function_object.proconfig =
            ARRAY['search_path=pg_catalog']::TEXT[],
          FALSE
        ) AS search_path_pg_catalog_only,
        CASE
          WHEN function_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_function_privilege(
            $1,
            function_object.oid,
            'EXECUTE'
          )
        END AS effective_execute,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              function_acl.grantee = target_role.oid
              AND function_acl.privilege_type = 'EXECUTE'
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                function_object.proacl,
                pg_catalog.acldefault('f', function_object.proowner)
              )
            ) AS function_acl
          ),
          FALSE
        ) AS direct_execute,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              function_acl.grantee = target_role.oid
              AND function_acl.privilege_type = 'EXECUTE'
              AND function_acl.is_grantable
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                function_object.proacl,
                pg_catalog.acldefault('f', function_object.proowner)
              )
            ) AS function_acl
          ),
          FALSE
        ) AS target_grant_option,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              function_acl.grantee = 0
              AND function_acl.privilege_type = 'EXECUTE'
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                function_object.proacl,
                pg_catalog.acldefault('f', function_object.proowner)
              )
            ) AS function_acl
          ),
          FALSE
        ) AS public_execute,
        CASE
          WHEN function_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_function_privilege(
            CURRENT_USER,
            function_object.oid,
            'EXECUTE WITH GRANT OPTION'
          )
        END AS grantor_can_enroll
      FROM (
        SELECT pg_catalog.to_regprocedure($2) AS oid
      ) AS requested
      LEFT JOIN pg_catalog.pg_proc AS function_object
        ON function_object.oid = requested.oid
      LEFT JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = function_object.proowner
      CROSS JOIN pg_catalog.pg_roles AS target_role
      WHERE target_role.rolname = $1
    `,
    roleName,
    entry.catalogSignature,
  );
  const row = rows[0];
  return {
    key: entry.key,
    catalogSignature: entry.catalogSignature,
    grantSignature: entry.grantSignature,
    expectedSecurityDefiner: entry.securityDefiner,
    expectedVolatility: entry.volatility,
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    securityDefiner: row?.security_definer === true,
    searchPathPgCatalogOnly:
      row?.search_path_pg_catalog_only === true,
    volatility:
      typeof row?.volatility === "string" ? row.volatility : null,
    effectiveExecute: row?.effective_execute === true,
    directExecute: row?.direct_execute === true,
    targetGrantOption: row?.target_grant_option === true,
    publicExecute: row?.public_execute === true,
    grantorCanEnroll: row?.grantor_can_enroll === true,
  };
}

async function inspectSealedTable(prisma, roleName, entry) {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        relation_object.oid IS NOT NULL AS exists,
        owner_role.rolname AS owner_name,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'SELECT'
          )
        END AS can_select,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'INSERT'
          )
        END AS can_insert,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'UPDATE'
          )
        END AS can_update,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'DELETE'
          )
        END AS can_delete,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'TRUNCATE'
          )
        END AS can_truncate,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'REFERENCES'
          )
        END AS can_reference,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_table_privilege(
            $1,
            relation_object.oid,
            'TRIGGER'
          )
        END AS can_trigger,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              table_acl.grantee = 0
              AND table_acl.privilege_type IN (
                'SELECT',
                'INSERT',
                'UPDATE',
                'DELETE',
                'TRUNCATE',
                'REFERENCES',
                'TRIGGER'
              )
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                relation_object.relacl,
                pg_catalog.acldefault('r', relation_object.relowner)
              )
            ) AS table_acl
          ),
          FALSE
        ) AS public_any_privilege,
        CASE
          WHEN relation_object.oid IS NULL THEN FALSE
          ELSE (
            relation_object.relowner = (
              SELECT role.oid
              FROM pg_catalog.pg_roles AS role
              WHERE role.rolname = CURRENT_USER
            )
            OR (
              SELECT role.rolsuper
              FROM pg_catalog.pg_roles AS role
              WHERE role.rolname = CURRENT_USER
            )
          )
        END AS grantor_can_revoke
      FROM (
        SELECT pg_catalog.to_regclass($2) AS oid
      ) AS requested
      LEFT JOIN pg_catalog.pg_class AS relation_object
        ON relation_object.oid = requested.oid
      LEFT JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = relation_object.relowner
    `,
    roleName,
    entry.catalogName,
  );
  const row = rows[0];
  return {
    key: entry.key,
    catalogName: entry.catalogName,
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    canSelect: row?.can_select === true,
    canInsert: row?.can_insert === true,
    canUpdate: row?.can_update === true,
    canDelete: row?.can_delete === true,
    canTruncate: row?.can_truncate === true,
    canReference: row?.can_reference === true,
    canTrigger: row?.can_trigger === true,
    publicAnyPrivilege: row?.public_any_privilege === true,
    grantorCanRevoke: row?.grantor_can_revoke === true,
  };
}

export async function inspectRuntimeFunctionEnrollment(prisma, config) {
  const [server] = await prisma.$queryRawUnsafe(
    `
      SELECT
        pg_catalog.current_database() AS database_name,
        CURRENT_USER AS current_user_name,
        pg_catalog.current_setting('server_version_num')::integer
          AS server_version_number
    `,
  );
  const roleRows = await prisma.$queryRawUnsafe(
    `
      SELECT
        role.rolcanlogin,
        role.rolinherit,
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolreplication,
        role.rolbypassrls,
        pg_catalog.has_database_privilege(
          role.rolname,
          pg_catalog.current_database(),
          'CONNECT'
        ) AS database_connect,
        pg_catalog.has_schema_privilege(
          role.rolname,
          'public',
          'USAGE'
        ) AS schema_usage,
        (
          SELECT pg_catalog.count(*)::integer
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.roleid = role.oid
             OR membership.member = role.oid
        ) AS membership_count,
        (
          (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_database AS database_object
            WHERE database_object.datdba = role.oid
          )
          + (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_namespace AS schema_object
            WHERE schema_object.nspowner = role.oid
          )
          + (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_class AS relation_object
            WHERE relation_object.relowner = role.oid
          )
          + (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_proc AS function_object
            WHERE function_object.proowner = role.oid
          )
        )::integer AS ownership_count
      FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = $1
    `,
    config.roleName,
  );
  const role = roleRows[0] ?? null;
  const [migration] = await prisma.$queryRawUnsafe(
    `
      SELECT
        pg_catalog.count(*) FILTER (
          WHERE migration_name = $1
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::integer AS completed_target_count,
        pg_catalog.count(*) FILTER (
          WHERE migration_name = $2
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::integer AS completed_required_count,
        pg_catalog.count(*) FILTER (
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::integer AS completed_count,
        pg_catalog.count(*) FILTER (
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        )::integer AS unfinished_count,
        (
          SELECT migration_name
          FROM public."_prisma_migrations"
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL
          ORDER BY migration_name DESC
          LIMIT 1
        ) AS latest_completed_migration
      FROM public."_prisma_migrations"
    `,
    RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
    RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION,
  );
  const functions = [];
  for (const entry of ALL_RUNTIME_FUNCTIONS) {
    functions.push(
      await inspectFunction(prisma, config.roleName, entry),
    );
  }
  const sealedTables = [];
  for (const entry of SEALED_RUNTIME_TABLES) {
    sealedTables.push(
      await inspectSealedTable(prisma, config.roleName, entry),
    );
  }

  return {
    server: {
      databaseName:
        typeof server?.database_name === "string"
          ? server.database_name
          : null,
      currentUserName:
        typeof server?.current_user_name === "string"
          ? server.current_user_name
          : null,
      serverVersionNumber:
        typeof server?.server_version_number === "number"
          ? server.server_version_number
          : null,
    },
    role:
      role === null
        ? null
        : {
            canLogin: role.rolcanlogin === true,
            inherits: role.rolinherit === true,
            superuser: role.rolsuper === true,
            createsDatabase: role.rolcreatedb === true,
            createsRole: role.rolcreaterole === true,
            replication: role.rolreplication === true,
            bypassesRls: role.rolbypassrls === true,
            databaseConnect: role.database_connect === true,
            schemaUsage: role.schema_usage === true,
            membershipCount: Number(role.membership_count ?? -1),
            ownershipCount: Number(role.ownership_count ?? -1),
          },
    migration: {
      completedTargetCount: Number(
        migration?.completed_target_count ?? -1,
      ),
      completedRequiredCount: Number(
        migration?.completed_required_count ?? -1,
      ),
      completedCount: Number(migration?.completed_count ?? -1),
      unfinishedCount: Number(migration?.unfinished_count ?? -1),
      latestCompletedMigration:
        typeof migration?.latest_completed_migration === "string"
          ? migration.latest_completed_migration
          : null,
    },
    functions,
    sealedTables,
  };
}

export function runtimeFunctionEnrollmentPreconditionViolations(
  snapshot,
  config,
) {
  const violations = [];
  if (snapshot.server.databaseName !== config.databaseName) {
    violations.push("CURRENT_DATABASE_MISMATCH");
  }
  if (
    snapshot.server.serverVersionNumber === null ||
    Math.floor(snapshot.server.serverVersionNumber / 10_000) !== 16
  ) {
    violations.push("POSTGRESQL_MAJOR_MUST_BE_16");
  }
  if (snapshot.server.currentUserName === config.roleName) {
    violations.push("MIGRATION_AND_RUNTIME_IDENTITIES_MUST_DIFFER");
  }
  if (!snapshot.role) {
    violations.push("RUNTIME_ROLE_NOT_FOUND");
  } else {
    if (!snapshot.role.canLogin) violations.push("RUNTIME_ROLE_MUST_LOGIN");
    if (snapshot.role.inherits) violations.push("RUNTIME_ROLE_MUST_NOINHERIT");
    if (snapshot.role.superuser) violations.push("RUNTIME_ROLE_SUPERUSER");
    if (snapshot.role.createsDatabase) {
      violations.push("RUNTIME_ROLE_CREATEDB");
    }
    if (snapshot.role.createsRole) violations.push("RUNTIME_ROLE_CREATEROLE");
    if (snapshot.role.replication) {
      violations.push("RUNTIME_ROLE_REPLICATION");
    }
    if (snapshot.role.bypassesRls) violations.push("RUNTIME_ROLE_BYPASSRLS");
    if (!snapshot.role.databaseConnect) {
      violations.push("RUNTIME_ROLE_DATABASE_CONNECT_MISSING");
    }
    if (!snapshot.role.schemaUsage) {
      violations.push("RUNTIME_ROLE_SCHEMA_USAGE_MISSING");
    }
    if (snapshot.role.membershipCount !== 0) {
      violations.push("RUNTIME_ROLE_MEMBERSHIP_PRESENT");
    }
    if (snapshot.role.ownershipCount !== 0) {
      violations.push("RUNTIME_ROLE_OWNS_OBJECTS");
    }
  }
  if (snapshot.migration.completedRequiredCount !== 1) {
    violations.push("MIGRATION_166_NOT_COMPLETED_EXACTLY_ONCE");
  }
  if (snapshot.migration.completedTargetCount !== 1) {
    violations.push("CURRENT_MIGRATION_NOT_COMPLETED_EXACTLY_ONCE");
  }
  if (
    snapshot.migration.latestCompletedMigration !==
    config.expectedMigration
  ) {
    violations.push("CURRENT_MIGRATION_MISMATCH");
  }
  if (
    snapshot.migration.completedCount !== config.expectedMigrationCount
  ) {
    violations.push("CURRENT_MIGRATION_COUNT_MISMATCH");
  }
  if (snapshot.migration.unfinishedCount !== 0) {
    violations.push("DATABASE_HAS_UNFINISHED_MIGRATION");
  }

  for (const entry of snapshot.functions) {
    if (!entry.exists) {
      violations.push(`${entry.key}:FUNCTION_MISSING`);
      continue;
    }
    if (entry.ownerName === config.roleName) {
      violations.push(`${entry.key}:RUNTIME_ROLE_OWNS_FUNCTION`);
    }
    if (entry.securityDefiner !== entry.expectedSecurityDefiner) {
      violations.push(`${entry.key}:SECURITY_MODE_MISMATCH`);
    }
    if (entry.volatility !== entry.expectedVolatility) {
      violations.push(`${entry.key}:VOLATILITY_MISMATCH`);
    }
    if (!entry.searchPathPgCatalogOnly) {
      violations.push(`${entry.key}:SEARCH_PATH_MISMATCH`);
    }
    if (entry.publicExecute) {
      violations.push(`${entry.key}:PUBLIC_EXECUTE_PRESENT`);
    }
    if (!entry.grantorCanEnroll) {
      violations.push(`${entry.key}:GRANTOR_CANNOT_ENROLL`);
    }
  }
  for (const entry of snapshot.sealedTables) {
    if (!entry.exists) {
      violations.push(`${entry.key}:TABLE_MISSING`);
      continue;
    }
    if (entry.ownerName === config.roleName) {
      violations.push(`${entry.key}:RUNTIME_ROLE_OWNS_TABLE`);
    }
    if (entry.publicAnyPrivilege) {
      violations.push(`${entry.key}:PUBLIC_TABLE_PRIVILEGE_PRESENT`);
    }
    if (!entry.grantorCanRevoke) {
      violations.push(`${entry.key}:GRANTOR_CANNOT_REVOKE`);
    }
  }
  return violations;
}

export function runtimeFunctionEnrollmentComplianceViolations(snapshot) {
  const violations = [];
  const applicationKeys = new Set(
    APPLICATION_RUNTIME_FUNCTIONS.map(({ key }) => key),
  );
  const workerKeys = new Set(
    EXCLUDED_WORKER_FUNCTIONS.map(({ key }) => key),
  );

  for (const entry of snapshot.functions) {
    if (applicationKeys.has(entry.key)) {
      if (!entry.effectiveExecute || !entry.directExecute) {
        violations.push(`${entry.key}:EXECUTE_MISSING`);
      }
      if (entry.targetGrantOption) {
        violations.push(`${entry.key}:GRANT_OPTION_PRESENT`);
      }
    } else {
      const exclusionKind = workerKeys.has(entry.key)
        ? "WORKER"
        : "PENDING";
      if (entry.effectiveExecute || entry.directExecute) {
        violations.push(`${entry.key}:${exclusionKind}_EXECUTE_PRESENT`);
      }
      if (entry.targetGrantOption) {
        violations.push(
          `${entry.key}:${exclusionKind}_GRANT_OPTION_PRESENT`,
        );
      }
    }
  }
  for (const entry of snapshot.sealedTables) {
    if (
      entry.canSelect ||
      entry.canInsert ||
      entry.canUpdate ||
      entry.canDelete ||
      entry.canTruncate ||
      entry.canReference ||
      entry.canTrigger
    ) {
      violations.push(`${entry.key}:DIRECT_TABLE_PRIVILEGE_PRESENT`);
    }
  }
  return violations;
}

function assertPreconditions(snapshot, config) {
  const violations = runtimeFunctionEnrollmentPreconditionViolations(
    snapshot,
    config,
  );
  if (violations.length > 0) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_PRECONDITION_FAILED",
      `Runtime function enrollment preconditions failed: ${violations.join(", ")}.`,
    );
  }
}

function enrollmentReceipt(config, snapshot, decision, changed) {
  return {
    ok: true,
    schemaVersion: RUNTIME_FUNCTION_ENROLLMENT_SCHEMA_VERSION,
    decision,
    changed,
    database: config.databaseName,
    role: config.roleName,
    foundationMigration: RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION,
    currentMigration: config.expectedMigration,
    currentMigrationCount: config.expectedMigrationCount,
    contractDigest: runtimeFunctionContractDigest(),
    applicationFunctions: APPLICATION_RUNTIME_FUNCTIONS.map(
      ({ key, catalogSignature }) => ({ key, catalogSignature }),
    ),
    excludedWorkerFunctions: EXCLUDED_WORKER_FUNCTIONS.map(
      ({ key, catalogSignature }) => ({ key, catalogSignature }),
    ),
    excludedPendingFunctions: EXCLUDED_PENDING_FUNCTIONS.map(
      ({ key, catalogSignature }) => ({ key, catalogSignature }),
    ),
    sealedTables: SEALED_RUNTIME_TABLES.map(({ key, catalogName }) => ({
      key,
      catalogName,
    })),
    postconditions: {
      applicationExecuteCount: snapshot.functions.filter(
        (entry) =>
          APPLICATION_RUNTIME_FUNCTIONS.some(
            (candidate) => candidate.key === entry.key,
          ) &&
          entry.effectiveExecute &&
          entry.directExecute &&
          !entry.targetGrantOption,
      ).length,
      excludedWorkerExecuteCount: snapshot.functions.filter(
        (entry) =>
          EXCLUDED_WORKER_FUNCTIONS.some(
            (candidate) => candidate.key === entry.key,
          ) &&
          (entry.effectiveExecute ||
            entry.directExecute ||
            entry.targetGrantOption),
      ).length,
      excludedPendingExecuteCount: snapshot.functions.filter(
        (entry) =>
          EXCLUDED_PENDING_FUNCTIONS.some(
            (candidate) => candidate.key === entry.key,
          ) &&
          (entry.effectiveExecute ||
            entry.directExecute ||
            entry.targetGrantOption),
        ).length,
      sealedTableWithoutRuntimePrivilegesCount: snapshot.sealedTables.filter(
        (entry) =>
          !entry.canSelect &&
          !entry.canInsert &&
          !entry.canUpdate &&
          !entry.canDelete &&
          !entry.canTruncate &&
          !entry.canReference &&
          !entry.canTrigger,
      ).length,
    },
  };
}

export async function checkRuntimeFunctionEnrollment(prisma, config) {
  const snapshot = await inspectRuntimeFunctionEnrollment(prisma, config);
  assertPreconditions(snapshot, config);
  const violations =
    runtimeFunctionEnrollmentComplianceViolations(snapshot);
  if (violations.length > 0) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_DRIFT",
      `Runtime function enrollment is not compliant: ${violations.join(", ")}.`,
    );
  }
  return enrollmentReceipt(config, snapshot, "COMPLIANT", false);
}

export async function applyRuntimeFunctionEnrollment(prisma, config) {
  const before = await inspectRuntimeFunctionEnrollment(prisma, config);
  assertPreconditions(before, config);
  const changed =
    runtimeFunctionEnrollmentComplianceViolations(before).length > 0;
  const statements = buildRuntimeFunctionEnrollmentStatements(
    config.roleName,
  );

  await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });

  const after = await inspectRuntimeFunctionEnrollment(prisma, config);
  assertPreconditions(after, config);
  const violations =
    runtimeFunctionEnrollmentComplianceViolations(after);
  if (violations.length > 0) {
    contractError(
      "RUNTIME_FUNCTION_ENROLLMENT_POSTCONDITION_FAILED",
      `Runtime function enrollment postconditions failed: ${violations.join(", ")}.`,
    );
  }
  return enrollmentReceipt(
    config,
    after,
    changed ? "ENROLLED" : "ALREADY_ENROLLED",
    changed,
  );
}

export function runRuntimeFunctionEnrollmentSelfTest() {
  const environment = {
    DATABASE_URL:
      "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public",
    RUNTIME_FUNCTION_ENROLLMENT_EXPECTED_DATABASE: "leetplus_ci",
    RUNTIME_FUNCTION_ENROLLMENT_ROLE: "leetplus_runtime",
  };
  const checkConfig = parseRuntimeFunctionEnrollmentConfig(
    environment,
    "check",
  );
  assert.equal(checkConfig.databaseName, "leetplus_ci");
  assert.equal(checkConfig.roleName, "leetplus_runtime");

  const applyEnvironment = {
    ...environment,
    RUNTIME_FUNCTION_ENROLLMENT_CONFIRM: expectedApplyConfirmation(
      "leetplus_ci",
      "leetplus_runtime",
    ),
  };
  const applyConfig = parseRuntimeFunctionEnrollmentConfig(
    applyEnvironment,
    "apply",
  );
  assert.equal(applyConfig.mode, "apply");

  const sql = buildRuntimeFunctionEnrollmentStatements(
    "leetplus_runtime",
  ).join("\n");
  assert.match(sql, /guest_game_reward_delivery_lock_v1/u);
  assert.match(sql, /guest_game_delivery_transition_key_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v2/u);
  assert.match(sql, /identity_email_claim_assert_invite_v1/u);
  assert.match(sql, /identity_email_claim_transition_v2/u);
  assert.match(sql, /identity_email_claim_release_v2/u);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityEmailClaim"/u,
  );
  assert.match(sql, /REVOKE EXECUTE.*guest_game_delivery_record_event_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_lock_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_transition_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_release_v1/su);
  assert.doesNotMatch(sql, /\bALL FUNCTIONS\b/iu);
  assert.doesNotMatch(sql, /\bTO PUBLIC\b/iu);
  assert.equal(runtimeFunctionContractDigest().length, 64);
}
