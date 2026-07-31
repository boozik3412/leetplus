import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const IDENTITY_MAIL_WORKER_ENROLLMENT_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION =
  "20260731020000_initial_owner_mail_delivery_boundary";
export const IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT = 176;

export const IDENTITY_MAIL_WORKER_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "workerAssert",
    catalogSignature: 'public."identity_mail_delivery_worker_assert_v1"(text)',
    grantSignature: 'public."identity_mail_delivery_worker_assert_v1"(TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "claim",
    catalogSignature:
      'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "providerMark",
    catalogSignature:
      'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "complete",
    catalogSignature:
      'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "reap",
    catalogSignature:
      'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
    grantSignature:
      'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
]);

export const IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "deliveryEventGuard",
    catalogSignature: 'public."identity_mail_delivery_event_guard_v1"()',
    grantSignature: 'public."identity_mail_delivery_event_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "deliveryEventTruncateGuard",
    catalogSignature:
      'public."identity_mail_delivery_event_truncate_guard_v1"()',
    grantSignature: 'public."identity_mail_delivery_event_truncate_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "deliveryEnrollmentGuard",
    catalogSignature: 'public."identity_mail_delivery_enrollment_guard_v1"()',
    grantSignature: 'public."identity_mail_delivery_enrollment_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "deliveryEnrollmentTruncateGuard",
    catalogSignature:
      'public."identity_mail_delivery_enrollment_truncate_guard_v1"()',
    grantSignature:
      'public."identity_mail_delivery_enrollment_truncate_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "outboxDeliveryGuard",
    catalogSignature: 'public."identity_mail_outbox_delivery_guard_v1"()',
    grantSignature: 'public."identity_mail_outbox_delivery_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "deliveryEventAppend",
    catalogSignature: 'public."identity_mail_delivery_event_append_v1"()',
    grantSignature: 'public."identity_mail_delivery_event_append_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "inviteAcceptSentGuard",
    catalogSignature:
      'public."identity_initial_owner_invite_accept_sent_guard_v1"()',
    grantSignature:
      'public."identity_initial_owner_invite_accept_sent_guard_v1"()',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "inviteDeliveryAssertSent",
    catalogSignature:
      'public."identity_initial_owner_invite_delivery_assert_sent_v1"(text,text,text)',
    grantSignature:
      'public."identity_initial_owner_invite_delivery_assert_sent_v1"(TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "s",
    language: "sql",
  }),
  Object.freeze({
    key: "reconcile",
    catalogSignature:
      'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_reconcile_v1"(TEXT, BIGINT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
]);

const ALL_DELIVERY_FUNCTIONS = Object.freeze([
  ...IDENTITY_MAIL_WORKER_FUNCTIONS,
  ...IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
]);
const SAFE_DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_NAME = /^[a-z_][a-z0-9_]{2,62}$/u;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const PLAINTEXT_LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);
const MAX_POSTGRES_OID = 4_294_967_295n;

assert.equal(
  IDENTITY_MAIL_WORKER_FUNCTIONS.length,
  5,
  "Worker enrollment must grant exactly five delivery RPCs.",
);
assert.equal(
  IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS.length,
  9,
  "Worker enrollment must deny the other nine CURRENT_176 delivery routines.",
);
assert.equal(
  new Set(
    ALL_DELIVERY_FUNCTIONS.map(({ catalogSignature }) => catalogSignature),
  ).size,
  14,
  "CURRENT_176 delivery routine signatures must be unique.",
);

export class IdentityMailWorkerEnrollmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IdentityMailWorkerEnrollmentError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new IdentityMailWorkerEnrollmentError(code, message);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseExpectedOid(value) {
  const raw = stringValue(value);
  if (!/^[1-9][0-9]{0,9}$/u.test(raw)) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_OID_INVALID",
      "IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID must be one positive PostgreSQL OID.",
    );
  }
  const oid = BigInt(raw);
  if (oid > MAX_POSTGRES_OID) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_OID_INVALID",
      "IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID is outside the PostgreSQL OID range.",
    );
  }
  return oid;
}

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function expectedIdentityMailWorkerEnrollmentConfirmation(
  databaseName,
  roleName,
  roleOid,
) {
  return [
    "APPLY_IDENTITY_MAIL_WORKER_ENROLLMENT_V1",
    databaseName,
    roleName,
    String(roleOid),
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
  ].join(" ");
}

export function parseIdentityMailWorkerEnrollmentConfig(environment, mode) {
  if (mode !== "check" && mode !== "apply") {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_MODE_INVALID",
      "Mode must be check or apply.",
    );
  }

  const databaseUrl = stringValue(environment.DATABASE_URL);
  if (!databaseUrl) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_REQUIRED",
      "DATABASE_URL is required.",
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_INVALID",
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_PROTOCOL_INVALID",
      "DATABASE_URL must use PostgreSQL.",
    );
  }
  if (!parsed.hostname || parsed.hash) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_TARGET_INVALID",
      "DATABASE_URL must identify one PostgreSQL host and contain no fragment.",
    );
  }
  let username;
  let password;
  try {
    username = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
      "DATABASE_URL credentials must use valid percent encoding.",
    );
  }
  if (
    !username ||
    username !== username.trim() ||
    /[\u0000-\u001f\u007f]/u.test(username) ||
    password !== password.trim() ||
    /[\u0000-\u001f\u007f]/u.test(password)
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
      "DATABASE_URL must contain bounded, non-whitespace PostgreSQL credentials.",
    );
  }
  const authorityStart = databaseUrl.indexOf("//") + 2;
  const authorityEnd = databaseUrl.indexOf("/", authorityStart);
  const rawAuthority = databaseUrl.slice(
    authorityStart,
    authorityEnd === -1 ? databaseUrl.length : authorityEnd,
  );
  const rawEndpoint = rawAuthority.slice(rawAuthority.lastIndexOf("@") + 1);
  const normalizedEndpoint = parsed.port
    ? `${parsed.hostname}:${parsed.port}`
    : parsed.hostname;
  const loopbackPlaintext =
    PLAINTEXT_LOOPBACK_HOSTS.has(parsed.hostname) &&
    rawEndpoint === normalizedEndpoint;
  if (!loopbackPlaintext && !password) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_CREDENTIALS_INVALID",
      "Remote DATABASE_URL requires a password.",
    );
  }
  let databaseName;
  try {
    databaseName = decodeURIComponent(
      parsed.pathname.replace(/^\/+/u, ""),
    );
  } catch {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_INVALID",
      "DATABASE_URL database name must use valid percent encoding.",
    );
  }
  if (
    !parsed.hostname ||
    !SAFE_DATABASE_NAME.test(databaseName) ||
    SYSTEM_DATABASES.has(databaseName)
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_INVALID",
      "DATABASE_URL must name one non-system lowercase PostgreSQL database.",
    );
  }
  const queryEntries = [...parsed.searchParams.entries()];
  const expectedQueryEntries = loopbackPlaintext
    ? [["schema", "public"]]
    : [
        ["schema", "public"],
        ["sslmode", "require"],
        ["sslaccept", "strict"],
      ];
  if (
    queryEntries.length !== expectedQueryEntries.length ||
    expectedQueryEntries.some(
      ([key, value]) =>
        queryEntries.filter(
          ([candidateKey, candidateValue]) =>
            candidateKey === key && candidateValue === value,
        ).length !== 1,
    ) ||
    queryEntries.some(
      ([key, value]) =>
        !expectedQueryEntries.some(
          ([expectedKey, expectedValue]) =>
            key === expectedKey && value === expectedValue,
        ),
    )
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_URL_OPTIONS_INVALID",
      loopbackPlaintext
        ? "Loopback DATABASE_URL must contain exactly one schema=public option."
        : "Remote DATABASE_URL must contain exactly schema=public, sslmode=require and sslaccept=strict.",
    );
  }

  const expectedDatabase = stringValue(
    environment.IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE,
  );
  if (
    !SAFE_DATABASE_NAME.test(expectedDatabase) ||
    SYSTEM_DATABASES.has(expectedDatabase)
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE_INVALID",
      "IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE must name one non-system lowercase database.",
    );
  }
  if (expectedDatabase !== databaseName) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DATABASE_MISMATCH",
      "DATABASE_URL does not match IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE.",
    );
  }

  const roleName = stringValue(
    environment.IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE,
  );
  if (
    !SAFE_ROLE_NAME.test(roleName) ||
    roleName === "public" ||
    roleName.startsWith("pg_")
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE_INVALID",
      "IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE must be one safe, non-system PostgreSQL role name.",
    );
  }
  const roleOid = parseExpectedOid(
    environment.IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID,
  );
  const requiredConfirmation = expectedIdentityMailWorkerEnrollmentConfirmation(
    databaseName,
    roleName,
    roleOid,
  );
  if (
    mode === "apply" &&
    stringValue(environment.IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM) !==
      requiredConfirmation
  ) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRMATION_INVALID",
      `IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM must equal ${requiredConfirmation}.`,
    );
  }

  return Object.freeze({
    mode,
    databaseName,
    databaseUrl,
    databaseHost: parsed.hostname,
    transportPolicy: loopbackPlaintext
      ? "LOOPBACK_PLAINTEXT"
      : "REMOTE_STRICT_TLS",
    roleName,
    roleOid,
    requiredConfirmation,
    expectedMigration: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
    expectedMigrationCount: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
  });
}

export function identityMailWorkerEnrollmentContractDigest() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: IDENTITY_MAIL_WORKER_ENROLLMENT_SCHEMA_VERSION,
        migration: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
        migrationCount: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
        enrollmentRows: 0,
        databasePrivileges: {
          connect: true,
          create: false,
          temporary: false,
        },
        schemaUsage: "public",
        transportPolicies: [
          "LOOPBACK_PLAINTEXT",
          "REMOTE_STRICT_TLS",
        ],
        granted: IDENTITY_MAIL_WORKER_FUNCTIONS.map(
          ({ key, catalogSignature }) => ({ key, catalogSignature }),
        ),
        denied: IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS.map(
          ({ key, catalogSignature }) => ({ key, catalogSignature }),
        ),
      }),
    )
    .digest("hex");
}

async function inspectFunction(prisma, roleName, entry) {
  const [row] = await prisma.$queryRawUnsafe(
    `
      WITH target AS (
        SELECT pg_catalog.to_regprocedure($1)::OID AS oid
      )
      SELECT
        routine.oid IS NOT NULL AS exists,
        pg_catalog.pg_get_userbyid(routine.proowner) AS owner_name,
        routine.prosecdef AS security_definer,
        routine.provolatile AS volatility,
        language.lanname AS language,
        routine.proconfig AS configuration,
        CASE
          WHEN routine.oid IS NULL THEN false
          ELSE pg_catalog.has_function_privilege($2, routine.oid, 'EXECUTE')
        END AS effective_execute,
        COALESCE((
          SELECT pg_catalog.bool_or(privilege.is_grantable)
          FROM pg_catalog.aclexplode(routine.proacl) AS privilege
          WHERE privilege.grantee =
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $2)
            AND privilege.privilege_type = 'EXECUTE'
        ), false) AS direct_grant_option,
        COALESCE((
          SELECT true
          FROM pg_catalog.aclexplode(routine.proacl) AS privilege
          WHERE privilege.grantee =
            (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $2)
            AND privilege.privilege_type = 'EXECUTE'
          LIMIT 1
        ), false) AS direct_execute,
        COALESCE((
          SELECT true
          FROM pg_catalog.aclexplode(
            COALESCE(
              routine.proacl,
              pg_catalog.acldefault('f', routine.proowner)
            )
          ) AS privilege
          WHERE privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
          LIMIT 1
        ), false) AS public_execute
      FROM target
      LEFT JOIN pg_catalog.pg_proc AS routine ON routine.oid = target.oid
      LEFT JOIN pg_catalog.pg_language AS language
        ON language.oid = routine.prolang
    `,
    entry.catalogSignature,
    roleName,
  );
  return {
    ...entry,
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    actualSecurityDefiner: row?.security_definer === true,
    actualVolatility:
      typeof row?.volatility === "string" ? row.volatility : null,
    actualLanguage: typeof row?.language === "string" ? row.language : null,
    configuration: Array.isArray(row?.configuration) ? row.configuration : [],
    effectiveExecute: row?.effective_execute === true,
    directExecute: row?.direct_execute === true,
    directGrantOption: row?.direct_grant_option === true,
    publicExecute: row?.public_execute === true,
  };
}

export async function inspectIdentityMailWorkerEnrollment(prisma, config) {
  const [server] = await prisma.$queryRawUnsafe(`
    SELECT
      pg_catalog.current_database() AS database_name,
      CURRENT_USER AS current_user_name,
      SESSION_USER AS session_user_name,
      current_role_row.oid::BIGINT AS current_user_oid,
      session_role_row.oid::BIGINT AS session_user_oid,
      database_owner.rolname AS database_owner_name,
      database_owner.oid::BIGINT AS database_owner_oid,
      pg_catalog.current_setting('server_version_num')::INTEGER
        AS server_version_number,
      connection_ssl.ssl AS tls_active,
      connection_ssl.version AS tls_version,
      connection_ssl.cipher AS tls_cipher
    FROM pg_catalog.pg_database AS database_row
    INNER JOIN pg_catalog.pg_roles AS current_role_row
      ON current_role_row.rolname = CURRENT_USER
    INNER JOIN pg_catalog.pg_roles AS session_role_row
      ON session_role_row.rolname = SESSION_USER
    INNER JOIN pg_catalog.pg_roles AS database_owner
      ON database_owner.oid = database_row.datdba
    LEFT JOIN pg_catalog.pg_stat_ssl AS connection_ssl
      ON connection_ssl.pid = pg_catalog.pg_backend_pid()
    WHERE database_row.datname = pg_catalog.current_database()
  `);

  const [role] = await prisma.$queryRawUnsafe(
    `
      SELECT
        worker.oid::BIGINT AS role_oid,
        worker.rolcanlogin,
        worker.rolinherit,
        worker.rolsuper,
        worker.rolcreatedb,
        worker.rolcreaterole,
        worker.rolreplication,
        worker.rolbypassrls,
        worker.rolconfig,
        pg_catalog.has_database_privilege(
          worker.rolname,
          pg_catalog.current_database(),
          'CONNECT'
        ) AS database_connect,
        pg_catalog.has_database_privilege(
          worker.rolname,
          pg_catalog.current_database(),
          'CREATE'
        ) AS database_create,
        pg_catalog.has_database_privilege(
          worker.rolname,
          pg_catalog.current_database(),
          'TEMPORARY'
        ) AS database_temporary,
        pg_catalog.has_schema_privilege(
          worker.rolname,
          'public',
          'USAGE'
        ) AS public_schema_usage,
        pg_catalog.has_schema_privilege(
          worker.rolname,
          'public',
          'CREATE'
        ) AS public_schema_create,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = worker.oid
             OR membership.roleid = worker.oid
        ) AS membership_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_db_role_setting AS setting
          WHERE setting.setrole = worker.oid
        ) AS role_setting_count,
        (
          (SELECT pg_catalog.count(*) FROM pg_catalog.pg_database
            WHERE datdba = worker.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_namespace
            WHERE nspowner = worker.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class
            WHERE relowner = worker.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc
            WHERE proowner = worker.oid)
          + (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type
            WHERE typowner = worker.oid)
        )::INTEGER AS ownership_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_namespace AS namespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND privilege.privilege_type = 'CREATE'
        ) AS direct_schema_create_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_namespace AS namespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_schema_privilege(
              worker.rolname,
              namespace.oid,
              'USAGE'
            )
        ) AS effective_schema_usage_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND relation.relkind <> 'S'
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS direct_relation_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_class AS relation
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_table_privilege(
              worker.rolname,
              relation.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
        ) AS effective_relation_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_attribute AS attribute
          INNER JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND attribute.attnum > 0
            AND attribute.attisdropped = false
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS direct_column_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_attribute AS attribute
          INNER JOIN pg_catalog.pg_class AS relation
            ON relation.oid = attribute.attrelid
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND attribute.attnum > 0
            AND attribute.attisdropped = false
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_column_privilege(
              worker.rolname,
              relation.oid,
              attribute.attnum,
              'SELECT,INSERT,UPDATE,REFERENCES'
            )
        ) AS effective_column_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_class AS sequence
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = sequence.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(sequence.relacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND sequence.relkind = 'S'
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS direct_sequence_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_class AS sequence
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = sequence.relnamespace
          WHERE sequence.relkind = 'S'
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND CASE
              WHEN sequence.relkind = 'S'
              THEN pg_catalog.has_sequence_privilege(
                worker.rolname,
                sequence.oid,
                'USAGE,SELECT,UPDATE'
              )
              ELSE false
            END
        ) AS effective_sequence_privilege_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl)
            AS privilege
          WHERE privilege.grantee = worker.oid
            AND privilege.privilege_type = 'EXECUTE'
            AND namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
        ) AS direct_function_execute_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM pg_catalog.pg_proc AS routine
          INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = routine.pronamespace
          WHERE namespace.nspname !~ '^pg_'
            AND namespace.nspname <> 'information_schema'
            AND pg_catalog.has_function_privilege(
              worker.rolname,
              routine.oid,
              'EXECUTE'
            )
        ) AS effective_function_execute_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
          WHERE challenge."stateRevision" = 1
            AND challenge."consumedAt" IS NULL
            AND challenge."validUntil" >
              pg_catalog.statement_timestamp()
            AND (
              challenge."activationRoleName" = worker.rolname
              OR challenge."activationRoleOid" = worker.oid::BIGINT
            )
        ) AS live_activation_binding_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."SharedBetaRuntimeReleaseMarker" AS marker
          WHERE marker."stateRevision" = 1
            AND marker."revokedAt" IS NULL
            AND (
              marker."activationDatabaseRole" = worker.rolname
              OR marker."coordinatorRoleName" = worker.rolname
              OR marker."coordinatorRoleOid" = worker.oid::BIGINT
            )
        ) AS live_marker_binding_count
      FROM pg_catalog.pg_roles AS worker
      WHERE worker.rolname = $1
    `,
    config.roleName,
  );

  const [migration] = await prisma.$queryRawUnsafe(
    `
      SELECT
        pg_catalog.count(*) FILTER (
          WHERE migration_name = $1
            AND finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::INTEGER AS completed_target_count,
        pg_catalog.count(*) FILTER (
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL
        )::INTEGER AS completed_count,
        pg_catalog.count(*) FILTER (
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        )::INTEGER AS unfinished_count,
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
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
  );

  const [enrollment] = await prisma.$queryRawUnsafe(`
    SELECT
      pg_catalog.count(*)::INTEGER AS total_count,
      pg_catalog.count(*) FILTER (
        WHERE "enabled" = true
      )::INTEGER AS enabled_count
    FROM public."IdentityMailDeliveryTenantEnrollment"
  `);

  const functions = [];
  for (const entry of ALL_DELIVERY_FUNCTIONS) {
    functions.push(await inspectFunction(prisma, config.roleName, entry));
  }

  return {
    server: {
      databaseName: server?.database_name ?? null,
      currentUserName: server?.current_user_name ?? null,
      sessionUserName: server?.session_user_name ?? null,
      currentUserOid: server?.current_user_oid ?? null,
      sessionUserOid: server?.session_user_oid ?? null,
      databaseOwnerName: server?.database_owner_name ?? null,
      databaseOwnerOid: server?.database_owner_oid ?? null,
      serverVersionNumber: server?.server_version_number ?? null,
      tlsActive: server?.tls_active === true,
      tlsVersion:
        typeof server?.tls_version === "string"
          ? server.tls_version
          : null,
      tlsCipher:
        typeof server?.tls_cipher === "string"
          ? server.tls_cipher
          : null,
    },
    role:
      role === undefined
        ? null
        : {
            oid: role.role_oid,
            canLogin: role.rolcanlogin === true,
            inherits: role.rolinherit === true,
            superuser: role.rolsuper === true,
            createsDatabase: role.rolcreatedb === true,
            createsRole: role.rolcreaterole === true,
            replication: role.rolreplication === true,
            bypassesRls: role.rolbypassrls === true,
            hasRoleConfiguration:
              Array.isArray(role.rolconfig) && role.rolconfig.length > 0,
            databaseConnect: role.database_connect === true,
            databaseCreate: role.database_create === true,
            databaseTemporary: role.database_temporary === true,
            publicSchemaUsage: role.public_schema_usage === true,
            publicSchemaCreate: role.public_schema_create === true,
            membershipCount: Number(role.membership_count ?? -1),
            roleSettingCount: Number(role.role_setting_count ?? -1),
            ownershipCount: Number(role.ownership_count ?? -1),
            directSchemaCreateCount: Number(
              role.direct_schema_create_count ?? -1,
            ),
            effectiveSchemaUsageCount: Number(
              role.effective_schema_usage_count ?? -1,
            ),
            directRelationPrivilegeCount: Number(
              role.direct_relation_privilege_count ?? -1,
            ),
            effectiveRelationPrivilegeCount: Number(
              role.effective_relation_privilege_count ?? -1,
            ),
            directColumnPrivilegeCount: Number(
              role.direct_column_privilege_count ?? -1,
            ),
            effectiveColumnPrivilegeCount: Number(
              role.effective_column_privilege_count ?? -1,
            ),
            directSequencePrivilegeCount: Number(
              role.direct_sequence_privilege_count ?? -1,
            ),
            effectiveSequencePrivilegeCount: Number(
              role.effective_sequence_privilege_count ?? -1,
            ),
            directFunctionExecuteCount: Number(
              role.direct_function_execute_count ?? -1,
            ),
            effectiveFunctionExecuteCount: Number(
              role.effective_function_execute_count ?? -1,
            ),
            liveActivationBindingCount: Number(
              role.live_activation_binding_count ?? -1,
            ),
            liveMarkerBindingCount: Number(
              role.live_marker_binding_count ?? -1,
            ),
          },
    migration: {
      completedTargetCount: Number(migration?.completed_target_count ?? -1),
      completedCount: Number(migration?.completed_count ?? -1),
      unfinishedCount: Number(migration?.unfinished_count ?? -1),
      latestCompletedMigration: migration?.latest_completed_migration ?? null,
    },
    enrollment: {
      totalCount: Number(enrollment?.total_count ?? -1),
      enabledCount: Number(enrollment?.enabled_count ?? -1),
    },
    allowedFunctions: functions.slice(0, IDENTITY_MAIL_WORKER_FUNCTIONS.length),
    deniedFunctions: functions.slice(IDENTITY_MAIL_WORKER_FUNCTIONS.length),
  };
}

function functionCatalogViolations(snapshot) {
  const violations = [];
  for (const entry of [
    ...snapshot.allowedFunctions,
    ...snapshot.deniedFunctions,
  ]) {
    if (!entry.exists) violations.push(`${entry.key}:MISSING`);
    if (entry.ownerName !== snapshot.server.databaseOwnerName) {
      violations.push(`${entry.key}:OWNER_MISMATCH`);
    }
    if (entry.actualSecurityDefiner !== entry.securityDefiner) {
      violations.push(`${entry.key}:SECURITY_MISMATCH`);
    }
    if (entry.actualVolatility !== entry.volatility) {
      violations.push(`${entry.key}:VOLATILITY_MISMATCH`);
    }
    if (entry.actualLanguage !== entry.language) {
      violations.push(`${entry.key}:LANGUAGE_MISMATCH`);
    }
    if (
      entry.configuration.length !== 1 ||
      entry.configuration[0] !== "search_path=pg_catalog"
    ) {
      violations.push(`${entry.key}:SEARCH_PATH_MISMATCH`);
    }
  }
  return violations;
}

export function identityMailWorkerEnrollmentPreconditionViolations(
  snapshot,
  config,
) {
  const violations = [];
  if (snapshot.server.databaseName !== config.databaseName) {
    violations.push("DATABASE_MISMATCH");
  }
  if (
    !Number.isInteger(snapshot.server.serverVersionNumber) ||
    Math.floor(snapshot.server.serverVersionNumber / 10_000) !== 16
  ) {
    violations.push("POSTGRESQL_MAJOR_NOT_16");
  }
  if (
    config.transportPolicy === "LOOPBACK_PLAINTEXT" &&
    snapshot.server.tlsActive !== false
  ) {
    violations.push("LOOPBACK_PLAINTEXT_CONNECTION_REQUIRED");
  }
  if (
    config.transportPolicy === "REMOTE_STRICT_TLS" &&
    snapshot.server.tlsActive !== true
  ) {
    violations.push("REMOTE_TLS_CONNECTION_REQUIRED");
  }
  if (
    config.transportPolicy === "REMOTE_STRICT_TLS" &&
    (
      typeof snapshot.server.tlsVersion !== "string" ||
      snapshot.server.tlsVersion.length === 0 ||
      typeof snapshot.server.tlsCipher !== "string" ||
      snapshot.server.tlsCipher.length === 0
    )
  ) {
    violations.push("REMOTE_TLS_EVIDENCE_MISSING");
  }
  if (
    snapshot.server.currentUserName !== snapshot.server.sessionUserName ||
    snapshot.server.currentUserOid !== snapshot.server.sessionUserOid
  ) {
    violations.push("SESSION_USER_CHANGED");
  }
  if (
    snapshot.server.currentUserName !== snapshot.server.databaseOwnerName ||
    snapshot.server.currentUserOid !== snapshot.server.databaseOwnerOid
  ) {
    violations.push("OPERATOR_IS_NOT_DATABASE_OWNER");
  }
  if (snapshot.role === null) {
    violations.push("ROLE_NOT_FOUND");
  } else {
    if (snapshot.role.oid !== config.roleOid)
      violations.push("ROLE_OID_MISMATCH");
    if (snapshot.server.currentUserName === config.roleName) {
      violations.push("OPERATOR_IS_TARGET_ROLE");
    }
    if (!snapshot.role.canLogin) violations.push("ROLE_NOT_LOGIN");
    if (snapshot.role.inherits) violations.push("ROLE_INHERITS");
    if (snapshot.role.superuser) violations.push("ROLE_SUPERUSER");
    if (snapshot.role.createsDatabase) violations.push("ROLE_CREATEDB");
    if (snapshot.role.createsRole) violations.push("ROLE_CREATEROLE");
    if (snapshot.role.replication) violations.push("ROLE_REPLICATION");
    if (snapshot.role.bypassesRls) violations.push("ROLE_BYPASSRLS");
    if (snapshot.role.hasRoleConfiguration)
      violations.push("ROLE_CONFIGURATION");
    if (!snapshot.role.databaseConnect) violations.push("ROLE_NO_CONNECT");
    if (snapshot.role.databaseCreate) {
      violations.push("DATABASE_CREATE_PRESENT");
    }
    if (snapshot.role.databaseTemporary) {
      violations.push("DATABASE_TEMPORARY_PRESENT");
    }
    if (snapshot.role.membershipCount !== 0) violations.push("ROLE_MEMBERSHIP");
    if (snapshot.role.roleSettingCount !== 0) violations.push("ROLE_SETTING");
    if (snapshot.role.ownershipCount !== 0) violations.push("ROLE_OWNS_OBJECT");
    if (snapshot.role.liveActivationBindingCount !== 0) {
      violations.push("ROLE_BOUND_TO_ACTIVATION");
    }
    if (snapshot.role.liveMarkerBindingCount !== 0) {
      violations.push("ROLE_BOUND_TO_RUNTIME_MARKER");
    }
  }
  if (snapshot.migration.completedTargetCount !== 1) {
    violations.push("TARGET_MIGRATION_NOT_COMPLETED");
  }
  if (
    snapshot.migration.completedCount !==
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT
  ) {
    violations.push("MIGRATION_COUNT_MISMATCH");
  }
  if (snapshot.migration.unfinishedCount !== 0) {
    violations.push("UNFINISHED_MIGRATION");
  }
  if (
    snapshot.migration.latestCompletedMigration !==
    IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION
  ) {
    violations.push("MIGRATION_HEAD_MISMATCH");
  }
  if (
    snapshot.enrollment.totalCount !== 0 ||
    snapshot.enrollment.enabledCount !== 0
  ) {
    violations.push("TENANT_ENROLLMENT_NOT_EMPTY");
  }
  violations.push(...functionCatalogViolations(snapshot));
  return violations;
}

export function identityMailWorkerEnrollmentComplianceViolations(snapshot) {
  const violations = [];
  const role = snapshot.role;
  if (role === null) return ["ROLE_NOT_FOUND"];
  if (!role.publicSchemaUsage) violations.push("PUBLIC_SCHEMA_USAGE_MISSING");
  if (role.effectiveSchemaUsageCount !== 1) {
    violations.push("EFFECTIVE_SCHEMA_USAGE_ALLOWLIST_MISMATCH");
  }
  if (role.publicSchemaCreate) violations.push("PUBLIC_SCHEMA_CREATE_PRESENT");
  if (role.directSchemaCreateCount !== 0) {
    violations.push("DIRECT_SCHEMA_CREATE_PRESENT");
  }
  if (role.directRelationPrivilegeCount !== 0) {
    violations.push("DIRECT_RELATION_PRIVILEGE_PRESENT");
  }
  if (role.effectiveRelationPrivilegeCount !== 0) {
    violations.push("EFFECTIVE_RELATION_PRIVILEGE_PRESENT");
  }
  if (role.directColumnPrivilegeCount !== 0) {
    violations.push("DIRECT_COLUMN_PRIVILEGE_PRESENT");
  }
  if (role.effectiveColumnPrivilegeCount !== 0) {
    violations.push("EFFECTIVE_COLUMN_PRIVILEGE_PRESENT");
  }
  if (role.directSequencePrivilegeCount !== 0) {
    violations.push("DIRECT_SEQUENCE_PRIVILEGE_PRESENT");
  }
  if (role.effectiveSequencePrivilegeCount !== 0) {
    violations.push("EFFECTIVE_SEQUENCE_PRIVILEGE_PRESENT");
  }
  if (
    role.directFunctionExecuteCount !== IDENTITY_MAIL_WORKER_FUNCTIONS.length
  ) {
    violations.push("DIRECT_FUNCTION_ALLOWLIST_MISMATCH");
  }
  if (
    role.effectiveFunctionExecuteCount !==
    IDENTITY_MAIL_WORKER_FUNCTIONS.length
  ) {
    violations.push("EFFECTIVE_FUNCTION_ALLOWLIST_MISMATCH");
  }
  for (const entry of snapshot.allowedFunctions) {
    if (!entry.effectiveExecute || !entry.directExecute) {
      violations.push(`${entry.key}:EXECUTE_MISSING`);
    }
    if (entry.directGrantOption) {
      violations.push(`${entry.key}:GRANT_OPTION_PRESENT`);
    }
    if (entry.publicExecute) violations.push(`${entry.key}:PUBLIC_EXECUTE`);
  }
  for (const entry of snapshot.deniedFunctions) {
    if (entry.effectiveExecute || entry.directExecute) {
      violations.push(`${entry.key}:EXECUTE_PRESENT`);
    }
    if (entry.directGrantOption) {
      violations.push(`${entry.key}:GRANT_OPTION_PRESENT`);
    }
    if (entry.publicExecute) violations.push(`${entry.key}:PUBLIC_EXECUTE`);
  }
  return violations;
}

function roleAssertionBlock(config) {
  return `
DO $identity_mail_worker_enrollment$
DECLARE
  worker pg_catalog.pg_roles%ROWTYPE;
BEGIN
  IF CURRENT_USER <> SESSION_USER THEN
    RAISE EXCEPTION 'Identity mail worker enrollment forbids SET ROLE'
      USING ERRCODE = '42501';
  END IF;

  LOCK TABLE public."_prisma_migrations" IN SHARE MODE;
  LOCK TABLE public."IdentityMailDeliveryTenantEnrollment"
    IN SHARE ROW EXCLUSIVE MODE;

  IF (
    SELECT pg_catalog.count(*)
    FROM public."_prisma_migrations"
    WHERE finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) <> ${IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT}
     OR (
       SELECT migration_name
       FROM public."_prisma_migrations"
       WHERE finished_at IS NOT NULL
         AND rolled_back_at IS NULL
       ORDER BY migration_name DESC
       LIMIT 1
     ) <> ${quoteLiteral(IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION)}
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollment"
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_database AS database
       INNER JOIN pg_catalog.pg_roles AS owner
         ON owner.oid = database.datdba
       WHERE database.datname = pg_catalog.current_database()
         AND owner.rolname = CURRENT_USER
     )
  THEN
    RAISE EXCEPTION 'Identity mail worker enrollment context changed'
      USING ERRCODE = '55000';
  END IF;

  SELECT *
  INTO worker
  FROM pg_catalog.pg_roles
  WHERE rolname = ${quoteLiteral(config.roleName)};

  IF NOT FOUND
     OR worker.oid::BIGINT <> ${config.roleOid.toString()}::BIGINT
     OR worker.rolcanlogin = false
     OR worker.rolinherit = true
     OR worker.rolsuper = true
     OR worker.rolcreatedb = true
     OR worker.rolcreaterole = true
     OR worker.rolreplication = true
     OR worker.rolbypassrls = true
     OR worker.rolconfig IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = worker.oid
          OR membership.roleid = worker.oid
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_db_role_setting AS setting
       WHERE setting.setrole = worker.oid
     )
  THEN
    RAISE EXCEPTION 'Identity mail worker role identity changed'
      USING ERRCODE = '42501';
  END IF;
END;
$identity_mail_worker_enrollment$`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildIdentityMailWorkerEnrollmentStatements(config) {
  const role = quoteIdentifier(config.roleName);
  const database = quoteIdentifier(config.databaseName);
  const statements = [
    roleAssertionBlock(config),
    `REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM ${role}`,
    `
DO $identity_mail_worker_revoke$
DECLARE
  target_schema RECORD;
  target_column RECORD;
BEGIN
  FOR target_schema IN
    SELECT nspname
    FROM pg_catalog.pg_namespace
    WHERE nspname !~ '^pg_'
      AND nspname <> 'information_schema'
    ORDER BY nspname
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE CREATE ON SCHEMA %I FROM %I',
      target_schema.nspname,
      ${quoteLiteral(config.roleName)}
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I',
      target_schema.nspname,
      ${quoteLiteral(config.roleName)}
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I',
      target_schema.nspname,
      ${quoteLiteral(config.roleName)}
    );
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I',
      target_schema.nspname,
      ${quoteLiteral(config.roleName)}
    );
  END LOOP;

  FOR target_column IN
    SELECT
      namespace.nspname,
      relation.relname,
      attribute.attname
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
    WHERE privilege.grantee =
      (SELECT oid FROM pg_catalog.pg_roles
       WHERE rolname = ${quoteLiteral(config.roleName)})
      AND attribute.attnum > 0
      AND attribute.attisdropped = false
      AND namespace.nspname !~ '^pg_'
      AND namespace.nspname <> 'information_schema'
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE %I.%I FROM %I',
      target_column.attname,
      target_column.attname,
      target_column.attname,
      target_column.attname,
      target_column.nspname,
      target_column.relname,
      ${quoteLiteral(config.roleName)}
    );
  END LOOP;
END;
$identity_mail_worker_revoke$`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
  ];
  for (const entry of ALL_DELIVERY_FUNCTIONS) {
    statements.push(
      `REVOKE ALL PRIVILEGES ON FUNCTION ${entry.grantSignature} FROM PUBLIC`,
    );
  }
  for (const entry of IDENTITY_MAIL_WORKER_FUNCTIONS) {
    statements.push(
      `GRANT EXECUTE ON FUNCTION ${entry.grantSignature} TO ${role}`,
    );
  }
  return Object.freeze(statements);
}

function assertPreconditions(snapshot, config) {
  const violations = identityMailWorkerEnrollmentPreconditionViolations(
    snapshot,
    config,
  );
  if (violations.length > 0) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_PRECONDITION_FAILED",
      `Identity mail worker enrollment preconditions failed: ${violations.join(", ")}.`,
    );
  }
}

function receipt(config, snapshot, decision, changed) {
  return {
    ok: true,
    schemaVersion: IDENTITY_MAIL_WORKER_ENROLLMENT_SCHEMA_VERSION,
    decision,
    changed,
    database: config.databaseName,
    databaseHost: config.databaseHost,
    transportPolicy: config.transportPolicy,
    transportEvidence: {
      tlsActive: snapshot.server.tlsActive,
      tlsVersion: snapshot.server.tlsVersion,
      tlsCipher: snapshot.server.tlsCipher,
    },
    role: config.roleName,
    roleOid: config.roleOid.toString(),
    migration: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION,
    migrationCount: IDENTITY_MAIL_WORKER_ENROLLMENT_MIGRATION_COUNT,
    contractDigest: identityMailWorkerEnrollmentContractDigest(),
    workerRpcCount: snapshot.allowedFunctions.filter(
      (entry) => entry.directExecute && entry.effectiveExecute,
    ).length,
    deniedDeliveryRpcCount: snapshot.deniedFunctions.filter(
      (entry) => !entry.directExecute && !entry.effectiveExecute,
    ).length,
    tenantEnrollmentCount: snapshot.enrollment.totalCount,
    databaseCreatePrivilege:
      snapshot.role?.databaseCreate ?? null,
    databaseTemporaryPrivilege:
      snapshot.role?.databaseTemporary ?? null,
    directRelationPrivilegeCount:
      snapshot.role?.directRelationPrivilegeCount ?? null,
    effectiveRelationPrivilegeCount:
      snapshot.role?.effectiveRelationPrivilegeCount ?? null,
    directColumnPrivilegeCount:
      snapshot.role?.directColumnPrivilegeCount ?? null,
    effectiveColumnPrivilegeCount:
      snapshot.role?.effectiveColumnPrivilegeCount ?? null,
    directSequencePrivilegeCount:
      snapshot.role?.directSequencePrivilegeCount ?? null,
    effectiveSequencePrivilegeCount:
      snapshot.role?.effectiveSequencePrivilegeCount ?? null,
    effectiveFunctionExecuteCount:
      snapshot.role?.effectiveFunctionExecuteCount ?? null,
  };
}

export async function checkIdentityMailWorkerEnrollment(prisma, config) {
  const snapshot = await inspectIdentityMailWorkerEnrollment(prisma, config);
  assertPreconditions(snapshot, config);
  const violations = identityMailWorkerEnrollmentComplianceViolations(snapshot);
  if (violations.length > 0) {
    fail(
      "IDENTITY_MAIL_WORKER_ENROLLMENT_DRIFT",
      `Identity mail worker enrollment is not compliant: ${violations.join(", ")}.`,
    );
  }
  return receipt(config, snapshot, "COMPLIANT", false);
}

export async function applyIdentityMailWorkerEnrollment(prisma, config) {
  const before = await inspectIdentityMailWorkerEnrollment(prisma, config);
  assertPreconditions(before, config);
  const changed =
    identityMailWorkerEnrollmentComplianceViolations(before).length > 0;
  const statements = buildIdentityMailWorkerEnrollmentStatements(config);
  const after = await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
    const transactionalSnapshot = await inspectIdentityMailWorkerEnrollment(
      tx,
      config,
    );
    assertPreconditions(transactionalSnapshot, config);
    const violations = identityMailWorkerEnrollmentComplianceViolations(
      transactionalSnapshot,
    );
    if (violations.length > 0) {
      fail(
        "IDENTITY_MAIL_WORKER_ENROLLMENT_POSTCONDITION_FAILED",
        `Identity mail worker enrollment postconditions failed: ${violations.join(", ")}.`,
      );
    }
    return transactionalSnapshot;
  });
  return receipt(
    config,
    after,
    changed ? "ENROLLED" : "ALREADY_ENROLLED",
    changed,
  );
}

export function runIdentityMailWorkerEnrollmentSelfTest() {
  const base = {
    DATABASE_URL:
      "postgresql://migration:secret@127.0.0.1:5432/leetplus_ci?schema=public",
    IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_DATABASE: "leetplus_ci",
    IDENTITY_MAIL_WORKER_ENROLLMENT_ROLE: "leetplus_identity_mail_worker",
    IDENTITY_MAIL_WORKER_ENROLLMENT_EXPECTED_ROLE_OID: "16384",
  };
  const check = parseIdentityMailWorkerEnrollmentConfig(base, "check");
  assert.equal(check.databaseName, "leetplus_ci");
  assert.equal(check.roleName, "leetplus_identity_mail_worker");
  assert.equal(check.roleOid, 16_384n);
  const apply = parseIdentityMailWorkerEnrollmentConfig(
    {
      ...base,
      IDENTITY_MAIL_WORKER_ENROLLMENT_CONFIRM:
        expectedIdentityMailWorkerEnrollmentConfirmation(
          "leetplus_ci",
          "leetplus_identity_mail_worker",
          16_384n,
        ),
    },
    "apply",
  );
  const sql = buildIdentityMailWorkerEnrollmentStatements(apply).join("\n");
  assert.doesNotMatch(sql, /\bCREATE\s+ROLE\b/iu);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b[\s\S]*IdentityMailDeliveryTenantEnrollment/iu,
  );
  assert.equal((sql.match(/\bGRANT EXECUTE ON FUNCTION\b/gu) ?? []).length, 5);
  assert.equal(
    (sql.match(/\bFROM PUBLIC\b/gu) ?? []).length,
    ALL_DELIVERY_FUNCTIONS.length,
  );
  assert.equal(identityMailWorkerEnrollmentContractDigest().length, 64);
}
