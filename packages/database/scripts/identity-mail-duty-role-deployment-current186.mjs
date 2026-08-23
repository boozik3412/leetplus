import { createHash, randomUUID } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST,
  identityMailDutyRoleCatalogCurrent186ActualDigests,
  identityMailDutyRoleCatalogCurrent186Digest,
  identityMailDutyRoleCatalogCurrent186TargetDigests,
  inspectIdentityMailDutyRoleContainmentCurrent186,
  inspectIdentityMailDutyRoleCatalogCurrent186,
  inspectIdentityMailDutyRoleCatalogCurrent186Safety,
  normalizeIdentityMailDutyRoleCatalogCurrent186,
  readIdentityMailDutyRoleCatalogCurrent186,
} from "./identity-mail-duty-role-catalog-current186.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_APPLY_RECEIPT_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_APPLY_RECEIPT_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_EVIDENCE_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_REHEARSAL_EVIDENCE_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_MODES =
  Object.freeze(["apply", "attest", "check", "emergency", "plan", "rollback"]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE = Object.freeze({
  applicationRoleAllowlistBound: false,
  authorityScope: "CURRENT_DATABASE_ONLY",
  crossDatabaseAuthorityControlled: false,
  futureCreatorDefaultPrivilegesControlled: false,
  productionApplyAuthorized: false,
});

const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET = new Set(
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
);
const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_DESCRIPTORS =
  Object.freeze(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.map(
      (objectIdentity) => {
        const separator = objectIdentity.lastIndexOf(".");
        if (separator < 1 || separator === objectIdentity.length - 1) {
          throw new Error("Invalid CURRENT186 support-column identity.");
        }
        return Object.freeze({
          columnClause: objectIdentity.slice(separator + 1),
          objectIdentity,
          relationIdentity: objectIdentity.slice(0, separator),
        });
      },
    ),
  );
const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES =
  Object.freeze(
    [
      ...new Set(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_DESCRIPTORS.map(
          (entry) => entry.relationIdentity,
        ),
      ),
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PREAMBLE =
  "SET LOCAL ROLE NONE; SET LOCAL lock_timeout = '60s'; SET LOCAL statement_timeout = '90s'; SET LOCAL idle_in_transaction_session_timeout = '30s';";
const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_SETTINGS = Object.freeze([
  "SET LOCAL ROLE NONE",
  "SET LOCAL lock_timeout = '60s'",
  "SET LOCAL statement_timeout = '90s'",
  "SET LOCAL idle_in_transaction_session_timeout = '30s'",
]);
const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROFILE =
  "CURRENT186_LOCK_60S_STATEMENT_90S_IDLE_30S_V1";
const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_BEFORE_CATALOG_STORAGE_PROFILE =
  "EPOCH_COLUMN_CANONICAL_JSON_V1";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL =
  'SELECT public."identity_mail_duty_role_acl_lock_v1"()::TEXT AS "epoch"';
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL = `
SELECT
  "epoch"::TEXT AS "epoch",
  "operationId",
  "payloadDigest",
  "catalogDigest",
  "exactGrantsDigest",
  "ownerSurfaceDigest",
  "deploymentRoleName",
  "deploymentRoleOid"::TEXT AS "deploymentRoleOid",
  "applyReceiptDigest",
  "beforeCatalogDigest",
  "planDigest",
  "definitionManifestDigest",
  "reasonCode"
FROM public."IdentityMailDutyRoleAclEpochV1"
ORDER BY "epoch" DESC
LIMIT 1
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL = `
SELECT
  "epoch"::TEXT AS "epoch",
  "operationId",
  "payloadDigest",
  "catalogDigest",
  "exactGrantsDigest",
  "ownerSurfaceDigest",
  "deploymentRoleName",
  "deploymentRoleOid"::TEXT AS "deploymentRoleOid",
  "applyReceiptDigest",
  "beforeCatalogDigest",
  "planDigest",
  "definitionManifestDigest",
  "reasonCode",
  "payloadCanonicalJson",
  "beforeCatalogCanonicalJson",
  ((EXTRACT(EPOCH FROM "recordedAt") * 1000)::BIGINT)::TEXT
    AS "recordedAtEpochMs",
  "recordedTransactionId"
FROM public."IdentityMailDutyRoleAclEpochV1"
WHERE "operationId" = $1::TEXT
ORDER BY "epoch"
LIMIT 2
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_AUTHORIZED_EPOCH_READ_SQL = `
SELECT
  "epoch"::TEXT AS "epoch",
  "operationId",
  "payloadDigest",
  "catalogDigest",
  "exactGrantsDigest",
  "ownerSurfaceDigest",
  "deploymentRoleName",
  "deploymentRoleOid"::TEXT AS "deploymentRoleOid",
  "applyReceiptDigest",
  "beforeCatalogDigest",
  "planDigest",
  "definitionManifestDigest",
  "reasonCode"
FROM public."IdentityMailDutyRoleAclEpochV1"
WHERE "reasonCode" IN ('APPLY', 'ROTATE')
ORDER BY "epoch" DESC
LIMIT 1
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PUBLIC_ROUTINE_BINDING_SQL = `
WITH expected AS (
  SELECT binding."signature"
  FROM pg_catalog.jsonb_to_recordset($1::JSONB) AS binding(
    "oid" BIGINT,
    "ownerName" TEXT,
    "ownerOid" BIGINT,
    "routineKind" TEXT,
    "signature" TEXT
  )
)
SELECT
  expected."signature",
  routine_entry.oid::TEXT AS "oid",
  owner_role.rolname AS "ownerName",
  owner_role.oid::TEXT AS "ownerOid",
  routine_entry.prokind::TEXT AS "routineKind"
FROM expected
LEFT JOIN pg_catalog.pg_proc AS routine_entry
  ON routine_entry.oid = pg_catalog.to_regprocedure(expected."signature")
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = routine_entry.proowner
ORDER BY expected."signature" COLLATE "C"
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL =
  'SELECT public."identity_mail_duty_role_acl_epoch_append_v1"($1::TEXT, $2::TEXT, $3::TEXT) AS "receipt"';
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL = `
SELECT
  database_entry.datname AS "databaseName",
  database_entry.oid::TEXT AS "databaseOid",
  owner_role.rolname AS "deploymentRoleName",
  owner_role.oid::TEXT AS "deploymentRoleOid",
  owner_role.rolsuper AS "deploymentRoleSuperuser",
  SESSION_USER::TEXT AS "sessionUserName",
  session_role.oid::TEXT AS "sessionUserOid",
  CURRENT_USER::TEXT AS "currentUserName",
  current_role_entry.oid::TEXT AS "currentUserOid",
  coordinator.rolname AS "coordinatorRoleName",
  coordinator.oid::TEXT AS "coordinatorRoleOid",
  schema_owner.rolname AS "schemaOwnerRoleName",
  schema_owner.oid::TEXT AS "schemaOwnerRoleOid",
  worker.rolname AS "workerRoleName",
  worker.oid::TEXT AS "workerRoleOid"
FROM pg_catalog.pg_database AS database_entry
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = database_entry.datdba
JOIN pg_catalog.pg_roles AS session_role
  ON session_role.rolname = SESSION_USER
JOIN pg_catalog.pg_roles AS current_role_entry
  ON current_role_entry.rolname = CURRENT_USER
JOIN pg_catalog.pg_roles AS coordinator
  ON coordinator.rolname = 'identity_mail_enrollment_coordinator'
JOIN pg_catalog.pg_roles AS schema_owner
  ON schema_owner.rolname = 'identity_mail_schema_owner'
JOIN pg_catalog.pg_roles AS worker
  ON worker.rolname = 'identity_mail_worker_v2'
WHERE database_entry.datname = pg_catalog.current_database()
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL = `
SELECT pg_catalog.pg_terminate_backend(activity.pid) AS "terminated"
FROM pg_catalog.pg_stat_activity AS activity
WHERE activity.datname = pg_catalog.current_database()
  AND activity.usename IN ($1::TEXT, $2::TEXT, $3::TEXT)
  AND activity.pid <> pg_catalog.pg_backend_pid()
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL = `
SELECT pg_catalog.count(*)::TEXT AS "remainingSessionCount"
FROM pg_catalog.pg_stat_activity AS activity
WHERE activity.datname = pg_catalog.current_database()
  AND activity.usename IN ($1::TEXT, $2::TEXT, $3::TEXT)
  AND activity.pid <> pg_catalog.pg_backend_pid()
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_STRICT_MEMBERSHIP_CONTAINMENT_SQL =
  `
DO $current186_membership_containment$
DECLARE
  membership_entry RECORD;
BEGIN
  FOR membership_entry IN
    SELECT granted.rolname AS granted_name, member.rolname AS member_name
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    WHERE member.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    ) OR granted.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    )
    ORDER BY granted.rolname COLLATE "C", member.rolname COLLATE "C"
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE %I FROM %I',
      membership_entry.granted_name,
      membership_entry.member_name
    );
  END LOOP;
END
$current186_membership_containment$
`.trim();
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL = `
DO $current186_containment$
DECLARE
  namespace_entry RECORD;
  relation_entry RECORD;
  routine_entry RECORD;
  column_entry RECORD;
  type_entry RECORD;
  large_object_entry RECORD;
  authority_entry RECORD;
  default_acl_entry RECORD;
  membership_entry RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(database_entry.datacl) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE database_entry.datname = pg_catalog.current_database()
      AND grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      )
  ) THEN
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I, %I, %I',
      pg_catalog.current_database(),
      'identity_mail_schema_owner',
      'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    );
  END IF;

  FOR namespace_entry IN
    SELECT DISTINCT namespace_catalog.nspname
    FROM pg_catalog.pg_namespace AS namespace_catalog
    CROSS JOIN LATERAL pg_catalog.aclexplode(namespace_catalog.nspacl) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    )
    ORDER BY 1
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I, %I, %I',
        namespace_entry.nspname,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;

  FOR namespace_entry IN
    SELECT DISTINCT namespace_catalog.nspname
    FROM pg_catalog.pg_namespace AS namespace_catalog
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      namespace_catalog.nspacl,
      pg_catalog.acldefault('n', namespace_catalog.nspowner)
    )) AS acl
    WHERE acl.grantee = 0::OID
      AND namespace_catalog.nspname !~ '^pg_'
      AND namespace_catalog.nspname <> 'information_schema'
    ORDER BY 1
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON SCHEMA %I FROM PUBLIC',
        namespace_entry.nspname
      );
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;

  FOR relation_entry IN
    SELECT DISTINCT namespace_catalog.nspname, relation_catalog.relname,
      relation_catalog.relkind
    FROM pg_catalog.pg_class AS relation_catalog
    JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = relation_catalog.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation_catalog.relacl) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    )
      AND relation_catalog.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    ORDER BY 1, 2, 3
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        CASE WHEN relation_entry.relkind = 'S'::"char"
          THEN 'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I, %I, %I'
          ELSE 'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I, %I, %I'
        END,
        relation_entry.nspname,
        relation_entry.relname,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN
      NULL;
    END;
  END LOOP;

  FOR routine_entry IN
    SELECT DISTINCT
      pg_catalog.format(
        '%I.%I(%s)',
        namespace_catalog.nspname,
        routine_catalog.proname,
        pg_catalog.pg_get_function_identity_arguments(routine_catalog.oid)
      ) AS identity
    FROM pg_catalog.pg_proc AS routine_catalog
    JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = routine_catalog.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(routine_catalog.proacl) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    )
      AND routine_catalog.prokind IN ('f', 'p', 'a', 'w')
    ORDER BY 1
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON ROUTINE %s FROM %I, %I, %I',
        routine_entry.identity,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN
      NULL;
    END;
  END LOOP;

  FOR routine_entry IN
    SELECT DISTINCT
      pg_catalog.format(
        '%I.%I(%s)',
        namespace_catalog.nspname,
        routine_catalog.proname,
        pg_catalog.pg_get_function_identity_arguments(routine_catalog.oid)
      ) AS identity
    FROM pg_catalog.pg_proc AS routine_catalog
    JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = routine_catalog.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      routine_catalog.proacl,
      pg_catalog.acldefault('f', routine_catalog.proowner)
    )) AS acl
    WHERE acl.grantee = 0::OID
      AND acl.privilege_type = 'EXECUTE'
      AND routine_catalog.prokind IN ('f', 'p', 'a', 'w')
      AND namespace_catalog.nspname !~ '^pg_'
      AND namespace_catalog.nspname <> 'information_schema'
    ORDER BY 1
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC',
        routine_entry.identity
      );
    EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN
      NULL;
    END;
  END LOOP;

  FOR column_entry IN
    SELECT namespace_catalog.nspname, relation_catalog.relname,
      attribute_entry.attname, acl.privilege_type
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS relation_catalog
      ON relation_catalog.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = relation_catalog.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
      AND grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      )
      AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
    ORDER BY namespace_catalog.nspname COLLATE "C",
      relation_catalog.relname COLLATE "C", attribute_entry.attname COLLATE "C",
      acl.privilege_type COLLATE "C"
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE %s (%I) ON TABLE %I.%I FROM %I, %I, %I',
        column_entry.privilege_type,
        column_entry.attname,
        column_entry.nspname,
        column_entry.relname,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  FOR type_entry IN
    SELECT namespace_catalog.nspname, catalog_type.typname
    FROM pg_catalog.pg_type AS catalog_type
    JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = catalog_type.typnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      catalog_type.typacl,
      pg_catalog.acldefault('T', catalog_type.typowner)
    )) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    ) AND acl.grantee <> catalog_type.typowner
    ORDER BY namespace_catalog.nspname COLLATE "C", catalog_type.typname COLLATE "C"
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I, %I, %I',
        type_entry.nspname,
        type_entry.typname,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN
      NULL;
    END;
  END LOOP;
  FOR large_object_entry IN
    SELECT large_object.oid
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
      large_object.lomacl,
      pg_catalog.acldefault('L', large_object.lomowner)
    )) AS acl
    JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    ) AND acl.grantee <> large_object.lomowner
    ORDER BY large_object.oid
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON LARGE OBJECT %s FROM %I, %I, %I',
        large_object_entry.oid,
        'identity_mail_schema_owner',
        'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  FOR authority_entry IN
    SELECT authority_catalog.object_kind, authority_catalog.object_identity
    FROM (
      SELECT 'LANGUAGE'::TEXT AS object_kind,
        language_entry.lanname AS object_identity
      FROM pg_catalog.pg_language AS language_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        language_entry.lanacl,
        pg_catalog.acldefault('l', language_entry.lanowner)
      )) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      ) AND acl.grantee <> language_entry.lanowner
      UNION
      SELECT 'PARAMETER', parameter_entry.parname
      FROM pg_catalog.pg_parameter_acl AS parameter_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_entry.paracl) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      )
      UNION
      SELECT 'FOREIGN_DATA_WRAPPER', wrapper_entry.fdwname
      FROM pg_catalog.pg_foreign_data_wrapper AS wrapper_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        wrapper_entry.fdwacl,
        pg_catalog.acldefault('F', wrapper_entry.fdwowner)
      )) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      ) AND acl.grantee <> wrapper_entry.fdwowner
      UNION
      SELECT 'FOREIGN_SERVER', server_entry.srvname
      FROM pg_catalog.pg_foreign_server AS server_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        server_entry.srvacl,
        pg_catalog.acldefault('S', server_entry.srvowner)
      )) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      ) AND acl.grantee <> server_entry.srvowner
      UNION
      SELECT 'TABLESPACE', tablespace_entry.spcname
      FROM pg_catalog.pg_tablespace AS tablespace_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        tablespace_entry.spcacl,
        pg_catalog.acldefault('t', tablespace_entry.spcowner)
      )) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      ) AND acl.grantee <> tablespace_entry.spcowner
    ) AS authority_catalog
    ORDER BY authority_catalog.object_kind COLLATE "C",
      authority_catalog.object_identity COLLATE "C"
  LOOP
    BEGIN
      CASE authority_entry.object_kind
        WHEN 'LANGUAGE' THEN
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON LANGUAGE %I FROM %I, %I, %I',
            authority_entry.object_identity,
            'identity_mail_schema_owner',
            'identity_mail_enrollment_coordinator',
            'identity_mail_worker_v2'
          );
        WHEN 'PARAMETER' THEN
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON PARAMETER %I FROM %I, %I, %I',
            authority_entry.object_identity,
            'identity_mail_schema_owner',
            'identity_mail_enrollment_coordinator',
            'identity_mail_worker_v2'
          );
        WHEN 'FOREIGN_DATA_WRAPPER' THEN
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON FOREIGN DATA WRAPPER %I FROM %I, %I, %I',
            authority_entry.object_identity,
            'identity_mail_schema_owner',
            'identity_mail_enrollment_coordinator',
            'identity_mail_worker_v2'
          );
        WHEN 'FOREIGN_SERVER' THEN
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON FOREIGN SERVER %I FROM %I, %I, %I',
            authority_entry.object_identity,
            'identity_mail_schema_owner',
            'identity_mail_enrollment_coordinator',
            'identity_mail_worker_v2'
          );
        WHEN 'TABLESPACE' THEN
          EXECUTE pg_catalog.format(
            'REVOKE ALL PRIVILEGES ON TABLESPACE %I FROM %I, %I, %I',
            authority_entry.object_identity,
            'identity_mail_schema_owner',
            'identity_mail_enrollment_coordinator',
            'identity_mail_worker_v2'
          );
      END CASE;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  FOR default_acl_entry IN
    SELECT owner_role.rolname AS owner_name,
      namespace_catalog.nspname AS namespace_name,
      default_acl.defaclobjtype AS object_kind,
      CASE WHEN acl.grantee = 0::OID THEN 'PUBLIC' ELSE grantee.rolname END
        AS grantee_name,
      acl.grantee = 0::OID AS public_grantee
    FROM pg_catalog.pg_default_acl AS default_acl
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = default_acl.defaclrole
    LEFT JOIN pg_catalog.pg_namespace AS namespace_catalog
      ON namespace_catalog.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE (
      owner_role.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      ) OR grantee.rolname IN (
        'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
        'identity_mail_worker_v2'
      )
    ) AND default_acl.defaclobjtype IN ('r', 'S', 'f', 'T', 'n')
    ORDER BY owner_role.rolname COLLATE "C",
      namespace_catalog.nspname COLLATE "C", default_acl.defaclobjtype,
      acl.grantee
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %s',
        default_acl_entry.owner_name,
        CASE WHEN default_acl_entry.namespace_name IS NULL THEN ''
          ELSE pg_catalog.format(
            ' IN SCHEMA %I', default_acl_entry.namespace_name
          ) END,
        CASE default_acl_entry.object_kind
          WHEN 'r' THEN 'TABLES'
          WHEN 'S' THEN 'SEQUENCES'
          WHEN 'f' THEN 'ROUTINES'
          WHEN 'T' THEN 'TYPES'
          WHEN 'n' THEN 'SCHEMAS'
          ELSE 'TABLES'
        END,
        CASE WHEN default_acl_entry.public_grantee THEN 'PUBLIC'
          ELSE pg_catalog.quote_ident(default_acl_entry.grantee_name) END
      );
    EXCEPTION WHEN insufficient_privilege OR syntax_error THEN
      NULL;
    END;
  END LOOP;
  FOR membership_entry IN
    SELECT granted.rolname AS granted_name, member.rolname AS member_name
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    WHERE member.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    ) OR granted.rolname IN (
      'identity_mail_schema_owner', 'identity_mail_enrollment_coordinator',
      'identity_mail_worker_v2'
    )
    ORDER BY granted.rolname COLLATE "C", member.rolname COLLATE "C"
  LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'REVOKE %I FROM %I',
        membership_entry.granted_name,
        membership_entry.member_name
      );
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END
$current186_containment$
`.trim();

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const MAX_OID = 4_294_967_295;
const EMERGENCY_RUNTIME_SESSION_POLL_ATTEMPTS = 20;
const EMERGENCY_RUNTIME_SESSION_POLL_DELAY_MS = 50;
const EMERGENCY_RUNTIME_DRAIN_PROFILE =
  "CURRENT186_POST_COMMIT_TERMINATE_AND_ZERO_SESSION_V1";
const EMERGENCY_PHASE1_ATTEMPTS = 3;
const EMERGENCY_PHASE1_RECOVERY_PROFILE =
  "CURRENT186_LOCKED_IDEMPOTENT_PHASE1_COMMIT_RECOVERY_V1";
const CURRENT186_MIGRATION_COUNT = 186;
const CURRENT186_MIGRATION_HEAD =
  "20260803010000_identity_mail_duty_role_runtime_boundary_v2";
const CURRENT186_APPLICATION_CONTRACT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2";
const CONFIG_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "applicationArtifactSha256",
    "applicationContract",
    "applicationReleaseSha",
    "coordinatorRoleOid",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "deploymentRoleName",
    "deploymentRoleOid",
    "definitionManifestDigest",
    "expectedEpoch",
    "migrationCount",
    "migrationHead",
    "migrationManifestDigest",
    "operationId",
    "schemaOwnerRoleOid",
    "workerRoleOid",
  ].sort(),
);
const EPOCH_KEYS = Object.freeze(
  [
    "applyReceiptDigest",
    "beforeCatalogDigest",
    "catalogDigest",
    "definitionManifestDigest",
    "deploymentRoleName",
    "deploymentRoleOid",
    "epoch",
    "exactGrantsDigest",
    "operationId",
    "ownerSurfaceDigest",
    "payloadDigest",
    "planDigest",
    "reasonCode",
  ].sort(),
);
const EPOCH_PAYLOAD_KEYS = Object.freeze(
  [
    "actualContextDigest",
    "applicationArtifactSha256",
    "applicationContract",
    "applicationReleaseSha",
    "applyReceiptDigest",
    "beforeCatalogStorageProfile",
    "beforeCatalogDigest",
    "catalogContract",
    "catalogDigest",
    "catalogProfile",
    "coordinatorRoleName",
    "coordinatorRoleOid",
    "databaseIdentityDigest",
    "databaseName",
    "databaseOid",
    "definitionManifestDigest",
    "deploymentMarkerDigest",
    "deploymentMarkerId",
    "deploymentRoleName",
    "deploymentRoleOid",
    "directDutyAclDigest",
    "epoch",
    "evidenceDigest",
    "exactGrantsDigest",
    "exactGrantsProfile",
    "migrationCount",
    "migrationHead",
    "migrationManifestDigest",
    "operationId",
    "ownerSurfaceDigest",
    "planDigest",
    "previousEpoch",
    "previousPayloadDigest",
    "reasonCode",
    "schemaOwnerRoleName",
    "schemaOwnerRoleOid",
    "systemPublicAclBaselineDigest",
    "workerRoleName",
    "workerRoleOid",
  ].sort(),
);
const OPERATION_RECOVERY_ROW_KEYS = Object.freeze(
  [
    ...EPOCH_KEYS,
    "beforeCatalogCanonicalJson",
    "payloadCanonicalJson",
    "recordedAtEpochMs",
    "recordedTransactionId",
  ].sort(),
);
const APPLY_RECEIPT_KEYS = Object.freeze(
  [
    "applicationRoleAllowlistBound",
    "applyConfig",
    "applyReceiptDigest",
    "authorization",
    "authorityScope",
    "beforeCatalog",
    "beforeCatalogDigest",
    "canMutate",
    "canSend",
    "candidateStatus",
    "crossDatabaseAuthorityControlled",
    "decision",
    "epoch",
    "epochPayloadDigest",
    "epochReceipt",
    "futureCreatorDefaultPrivilegesControlled",
    "operationId",
    "planDigest",
    "productionApplyAuthorized",
    "targetCatalogDigest",
    "targetExactGrantsDigest",
    "targetDefinitionManifestDigest",
    "targetOwnerSurfaceDigest",
  ].sort(),
);
const EPOCH_APPEND_RECEIPT_KEYS = Object.freeze(
  [
    "applyReceiptDigest",
    "authorization",
    "authorityScope",
    "applicationRoleAllowlistBound",
    "beforeCatalogDigest",
    "canMutate",
    "candidateStatus",
    "crossDatabaseAuthorityControlled",
    "decision",
    "definitionManifestDigest",
    "directDutyAclDigest",
    "epoch",
    "evidenceDigest",
    "futureCreatorDefaultPrivilegesControlled",
    "operation",
    "operationId",
    "payloadDigest",
    "planDigest",
    "productionApplyAuthorized",
    "recordedAtEpochMs",
    "recordedTransactionId",
    "schemaVersion",
    "systemPublicAclBaselineDigest",
  ].sort(),
);

export class IdentityMailDutyRoleDeploymentCurrent186Error extends Error {
  constructor(reasonCode) {
    super("The CURRENT186 privileged duty-role deployment is blocked.");
    this.name = "IdentityMailDutyRoleDeploymentCurrent186Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 4;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailDutyRoleDeploymentCurrent186Error(reasonCode);
}

function exactRecord(value, expectedKeys, reasonCode) {
  let invalid;
  let descriptors;
  let prototype;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    if (!invalid) {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    }
  } catch {
    fail(reasonCode);
  }
  if (invalid || (prototype !== Object.prototype && prototype !== null)) {
    fail(reasonCode);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  keys.sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return result;
}

function validOid(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_OID;
}

function validPgRoleName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 63 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

export function normalizeIdentityMailDutyRoleDeploymentCurrent186Config(value) {
  const config = exactRecord(
    value,
    CONFIG_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CONFIG_INVALID",
  );
  if (
    !IDENTIFIER_PATTERN.test(config.databaseName) ||
    !validOid(config.databaseOid) ||
    !SHA256_PATTERN.test(config.databaseIdentityDigest) ||
    !IDENTIFIER_PATTERN.test(config.deploymentRoleName) ||
    config.deploymentRoleName.startsWith("pg_") ||
    !validOid(config.deploymentRoleOid) ||
    !SHA256_PATTERN.test(config.definitionManifestDigest) ||
    !validOid(config.schemaOwnerRoleOid) ||
    !validOid(config.coordinatorRoleOid) ||
    !validOid(config.workerRoleOid) ||
    new Set([
      config.schemaOwnerRoleOid,
      config.coordinatorRoleOid,
      config.workerRoleOid,
      config.deploymentRoleOid,
    ]).size !== 4 ||
    !UUID_PATTERN.test(config.deploymentMarkerId) ||
    !SHA256_PATTERN.test(config.deploymentMarkerDigest) ||
    !SHA256_PATTERN.test(config.actualContextDigest) ||
    !Number.isSafeInteger(config.migrationCount) ||
    config.migrationCount !== CURRENT186_MIGRATION_COUNT ||
    config.migrationHead !== CURRENT186_MIGRATION_HEAD ||
    !SHA256_PATTERN.test(config.migrationManifestDigest) ||
    config.applicationContract !== CURRENT186_APPLICATION_CONTRACT ||
    !SHA1_PATTERN.test(config.applicationReleaseSha) ||
    !SHA256_PATTERN.test(config.applicationArtifactSha256) ||
    !UUID_PATTERN.test(config.operationId) ||
    !Number.isSafeInteger(config.expectedEpoch) ||
    config.expectedEpoch < 0
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CONFIG_INVALID");
  }
  return Object.freeze({ ...config });
}

function assertCatalogIdentity(catalog, config) {
  if (
    catalog.database.name !== config.databaseName ||
    catalog.database.oid !== config.databaseOid ||
    catalog.database.identityDigest !== config.databaseIdentityDigest ||
    catalog.database.ownerName !== config.deploymentRoleName ||
    catalog.database.ownerOid !== config.deploymentRoleOid ||
    catalog.definitionManifestDigest !== config.definitionManifestDigest ||
    catalog.roles.schemaOwner.oid !== config.schemaOwnerRoleOid ||
    catalog.roles.coordinator.oid !== config.coordinatorRoleOid ||
    catalog.roles.worker.oid !== config.workerRoleOid
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_IDENTITY_MISMATCH");
  }
}

function quoteIdentifier(value) {
  if (!validPgRoleName(value)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_IDENTIFIER_INVALID");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function compareCanonicalValues(left, right) {
  const leftValue = canonicalStringify(left);
  const rightValue = canonicalStringify(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function objectClause(object) {
  if (object.kind === "DATABASE") {
    return `DATABASE ${quoteIdentifier(object.identity)}`;
  }
  if (object.kind === "SCHEMA") return 'SCHEMA "public"';
  if (object.kind === "RELATION") return `TABLE ${object.identity}`;
  if (object.kind === "ROUTINE") return `ROUTINE ${object.identity}`;
  fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
}

function alterOwnerStatement(object, ownerName) {
  if (object.kind === "DATABASE") return null;
  const keyword =
    object.kind === "SCHEMA"
      ? "SCHEMA"
      : object.kind === "RELATION"
        ? "TABLE"
        : "ROUTINE";
  return `ALTER ${keyword} ${object.identity === "public" ? '"public"' : object.identity} OWNER TO ${quoteIdentifier(ownerName)}`;
}

function grantOwnerAllStatement(object, ownerName) {
  if (object.kind === "DATABASE") return null;
  return `GRANT ALL PRIVILEGES ON ${objectClause(object)} TO ${quoteIdentifier(ownerName)} WITH GRANT OPTION`;
}

function revokeAllStatement(object, granteeName) {
  const grantee =
    granteeName === "public" ? "PUBLIC" : quoteIdentifier(granteeName);
  return `REVOKE ALL PRIVILEGES ON ${objectClause(object)} FROM ${grantee}`;
}

function grantStatement(object, acl) {
  const grantee =
    acl.granteeName === "public" ? "PUBLIC" : quoteIdentifier(acl.granteeName);
  return `GRANT ${acl.privilege} ON ${objectClause(object)} TO ${grantee}${acl.isGrantable ? " WITH GRANT OPTION" : ""}`;
}

function resetAclStatements(object, roleNames) {
  return roleNames.map((roleName) => revokeAllStatement(object, roleName));
}

const GRANT_OBJECT_PRIORITY = Object.freeze({
  SCHEMA: 0,
  DATABASE: 1,
  RELATION: 2,
  ROUTINE: 3,
});

function grantAsStatements(entries) {
  const statements = [];
  const grouped = new Map();
  for (const { acl, object } of entries) {
    const rows = grouped.get(acl.grantorName) ?? [];
    rows.push({ acl, object });
    grouped.set(acl.grantorName, rows);
  }
  for (const [grantorName, rows] of grouped) {
    rows.sort((left, right) => {
      const kindOrder =
        GRANT_OBJECT_PRIORITY[left.object.kind] -
        GRANT_OBJECT_PRIORITY[right.object.kind];
      return kindOrder !== 0
        ? kindOrder
        : compareCanonicalValues(left, right);
    });
    statements.push(`SET LOCAL ROLE ${quoteIdentifier(grantorName)}`);
    for (const row of rows)
      statements.push(grantStatement(row.object, row.acl));
    statements.push("SET LOCAL ROLE NONE");
  }
  return statements;
}

function supportColumnAuthorities(catalog) {
  return catalog.directAuthorities
    .filter(
      (entry) =>
        entry.objectKind === "COLUMN" &&
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET.has(
          entry.objectIdentity,
        ),
    )
    .sort(compareCanonicalValues);
}

function supportColumnDescriptor(objectIdentity) {
  const descriptor =
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_DESCRIPTORS.find(
      (entry) => entry.objectIdentity === objectIdentity,
    );
  if (!descriptor) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
  }
  return descriptor;
}

function supportColumnGroups(objectIdentities) {
  const requested = new Set(objectIdentities);
  if (
    requested.size !== objectIdentities.length ||
    [...requested].some(
      (identity) =>
        !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET.has(
          identity,
        ),
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
  }
  const groups = new Map();
  for (const descriptor of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_DESCRIPTORS) {
    if (!requested.has(descriptor.objectIdentity)) continue;
    const columns = groups.get(descriptor.relationIdentity) ?? [];
    columns.push(descriptor);
    groups.set(descriptor.relationIdentity, columns);
  }
  return groups;
}

function supportColumnList(descriptors) {
  return descriptors.map((entry) => entry.columnClause).join(", ");
}

function revokeSupportTableStatement(relationIdentity, granteeName) {
  if (
    !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.includes(
      relationIdentity,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
  }
  const grantee =
    granteeName === "public" ? "PUBLIC" : quoteIdentifier(granteeName);
  return `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM ${grantee}`;
}

function resetSupportAclStatements(roleNames) {
  const groups = supportColumnGroups(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
  );
  return roleNames.flatMap((roleName) => {
    const grantee =
      roleName === "public" ? "PUBLIC" : quoteIdentifier(roleName);
    return [...groups].flatMap(([relationIdentity, descriptors]) => [
      revokeSupportTableStatement(relationIdentity, roleName),
      `REVOKE ALL PRIVILEGES (${supportColumnList(descriptors)}) ON TABLE ${relationIdentity} FROM ${grantee}`,
    ]);
  });
}

function grantSupportColumnsAsStatements(entries) {
  const statements = [];
  const grouped = new Map();
  for (const entry of entries) {
    if (
      entry.source !== "ACL" ||
      !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET.has(
        entry.objectIdentity,
      )
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
    }
    const descriptor = supportColumnDescriptor(entry.objectIdentity);
    const key = canonicalStringify({
      grantorName: entry.grantorName,
      granteeName: entry.granteeName,
      isGrantable: entry.isGrantable,
      privilege: entry.privilege,
      relationIdentity: descriptor.relationIdentity,
    });
    const rows = grouped.get(key) ?? [];
    rows.push(entry);
    grouped.set(key, rows);
  }
  for (const rows of grouped.values()) {
    const [first] = rows;
    const grantee =
      first.granteeName === "public"
        ? "PUBLIC"
        : quoteIdentifier(first.granteeName);
    const relationIdentity = supportColumnDescriptor(
      first.objectIdentity,
    ).relationIdentity;
    const orderedIdentities =
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_DESCRIPTORS.filter(
        (descriptor) =>
          descriptor.relationIdentity === relationIdentity &&
          rows.some(
            (entry) => entry.objectIdentity === descriptor.objectIdentity,
          ),
      ).map((descriptor) => descriptor.objectIdentity);
    if (orderedIdentities.length !== rows.length) {
      fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
    }
    statements.push(`SET LOCAL ROLE ${quoteIdentifier(first.grantorName)}`);
    statements.push(
      `GRANT ${first.privilege} (${supportColumnList(
        orderedIdentities.map(supportColumnDescriptor),
      )}) ON TABLE ${relationIdentity} TO ${grantee}${first.isGrantable ? " WITH GRANT OPTION" : ""}`,
    );
    statements.push("SET LOCAL ROLE NONE");
  }
  return statements;
}

function targetSupportColumnAuthorities(target) {
  const entries = supportColumnAuthorities(target);
  if (
    entries.length !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.length ||
    target.directAuthorities.some(
      (entry) =>
        entry.objectKind === "RELATION" &&
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.some(
          (expected) => {
            const descriptor = supportColumnDescriptor(expected.objectIdentity);
            return (
              descriptor.relationIdentity === entry.objectIdentity &&
              expected.privilege === entry.privilege
            );
          },
        ),
    ) ||
    target.effectivePrivileges.some(
      (entry) =>
        entry.objectKind === "RELATION" &&
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.some(
          (expected) => {
            const descriptor = supportColumnDescriptor(expected.objectIdentity);
            return (
              descriptor.relationIdentity === entry.objectIdentity &&
              expected.privilege === entry.privilege
            );
          },
        ),
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
  }
  for (const expected of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES) {
    const matches = entries.filter(
      (entry) =>
        entry.objectIdentity === expected.objectIdentity &&
        entry.privilege === expected.privilege,
    );
    if (
      matches.length !== 1 ||
      matches[0].grantorName !== target.database.ownerName ||
      matches[0].grantorOid !== target.database.ownerOid ||
      matches[0].granteeName !== target.roles.schemaOwner.name ||
      matches[0].granteeOid !== target.roles.schemaOwner.oid ||
      matches[0].privilege !== expected.privilege ||
      matches[0].isGrantable ||
      matches[0].source !== "ACL"
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_OBJECT_INVALID");
    }
  }
  return entries;
}

function targetStatements(catalog, target) {
  const statements = [];
  const catalogSupportColumns = supportColumnAuthorities(catalog);
  const targetSupportColumns = targetSupportColumnAuthorities(target);
  const roleNames = [
    ...new Set([
      "public",
      target.roles.schemaOwner.name,
      target.roles.coordinator.name,
      target.roles.worker.name,
      ...catalog.objects.flatMap((object) =>
        object.acls.map((entry) => entry.granteeName),
      ),
      ...catalogSupportColumns.map((entry) => entry.granteeName),
      ...targetSupportColumns.map((entry) => entry.granteeName),
    ]),
  ].sort();
  const database = target.objects.find((entry) => entry.kind === "DATABASE");
  statements.push(...resetAclStatements(database, roleNames));
  for (const object of target.objects.filter(
    (entry) => entry.kind !== "DATABASE",
  )) {
    statements.push(...resetAclStatements(object, roleNames));
    const ownerStatement = alterOwnerStatement(object, object.ownerName);
    const ownerGrantStatement = grantOwnerAllStatement(
      object,
      object.ownerName,
    );
    if (ownerStatement !== null) statements.push(ownerStatement);
    if (ownerGrantStatement !== null) statements.push(ownerGrantStatement);
  }
  for (const entry of catalog.publicRoutineAcls) {
    statements.push(`REVOKE EXECUTE ON ROUTINE ${entry.signature} FROM PUBLIC`);
  }
  statements.push(...resetSupportAclStatements(roleNames));
  statements.push(
    ...grantAsStatements(
      target.objects.flatMap((object) =>
        object.acls.map((entry) => ({ acl: entry, object })),
      ),
    ),
    ...grantSupportColumnsAsStatements(targetSupportColumns),
  );
  return Object.freeze(statements);
}

function beforeImageRestoreStatements(
  beforeCatalog,
  currentCatalog = beforeCatalog,
) {
  const statements = [];
  const beforeSupportColumns = supportColumnAuthorities(beforeCatalog);
  const currentSupportColumns = supportColumnAuthorities(currentCatalog);
  const roleNames = [
    ...new Set([
      "public",
      beforeCatalog.roles.schemaOwner.name,
      beforeCatalog.roles.coordinator.name,
      beforeCatalog.roles.worker.name,
      ...beforeCatalog.objects.flatMap((object) =>
        object.acls.map((entry) => entry.granteeName),
      ),
      ...currentCatalog.objects.flatMap((object) =>
        object.acls.map((entry) => entry.granteeName),
      ),
      ...beforeSupportColumns.map((entry) => entry.granteeName),
      ...currentSupportColumns.map((entry) => entry.granteeName),
    ]),
  ].sort();
  for (const object of beforeCatalog.objects) {
    statements.push(...resetAclStatements(object, roleNames));
  }
  statements.push(...resetSupportAclStatements(roleNames));
  for (const object of beforeCatalog.objects.filter(
    (entry) => entry.kind !== "DATABASE",
  )) {
    const ownerStatement = alterOwnerStatement(object, object.ownerName);
    const ownerGrantStatement = grantOwnerAllStatement(
      object,
      object.ownerName,
    );
    if (ownerStatement !== null) statements.push(ownerStatement);
    if (ownerGrantStatement !== null) statements.push(ownerGrantStatement);
  }
  statements.push(
    ...grantAsStatements(
      beforeCatalog.objects.flatMap((object) =>
        object.acls.map((entry) => ({ acl: entry, object })),
      ),
    ),
    ...grantSupportColumnsAsStatements(beforeSupportColumns),
  );
  const publicRoutines = new Map();
  for (const entry of [
    ...beforeCatalog.publicRoutineAcls,
    ...currentCatalog.publicRoutineAcls,
  ]) {
    publicRoutines.set(`${entry.routineKind}\n${entry.signature}`, entry);
  }
  for (const entry of [...publicRoutines.values()].sort(
    compareCanonicalValues,
  )) {
    statements.push(`REVOKE EXECUTE ON ROUTINE ${entry.signature} FROM PUBLIC`);
  }
  for (const entry of beforeCatalog.publicRoutineAcls) {
    statements.push(`SET LOCAL ROLE ${quoteIdentifier(entry.grantorName)}`);
    statements.push(
      `GRANT EXECUTE ON ROUTINE ${entry.signature} TO PUBLIC${entry.isGrantable ? " WITH GRANT OPTION" : ""}`,
    );
    statements.push("SET LOCAL ROLE NONE");
  }
  return Object.freeze(statements);
}

function safePlanDigest(plan) {
  return createHash("sha256")
    .update(
      `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_PLAN_CURRENT186_V1\n${canonicalStringify(plan)}\n`,
      "utf8",
    )
    .digest("hex");
}

const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROTOCOL = Object.freeze({
  idleInTransactionSessionTimeoutMs: 30_000,
  lockTimeoutMs: 60_000,
  profile: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROFILE,
  statementTimeoutMs: 90_000,
  transactionPreambleSqlSha256: createHash("sha256")
    .update(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PREAMBLE, "utf8")
    .digest("hex"),
});

function compareTextC(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function directDutyAclDigest(catalogValue) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(catalogValue);
  const dutyRoleOids = new Set([
    catalog.roles.schemaOwner.oid,
    catalog.roles.coordinator.oid,
    catalog.roles.worker.oid,
  ]);
  const rows = catalog.directAuthorities
    .filter((entry) => dutyRoleOids.has(entry.granteeOid))
    .map((entry) => ({
      grantable: entry.isGrantable,
      granteeOid: entry.granteeOid,
      grantorOid: entry.grantorOid,
      identity: entry.objectIdentity,
      kind: entry.objectKind,
      privilege: entry.privilege,
    }))
    .sort(
      (left, right) =>
        compareTextC(left.kind, right.kind) ||
        compareTextC(left.identity, right.identity) ||
        left.grantorOid - right.grantorOid ||
        left.granteeOid - right.granteeOid ||
        compareTextC(left.privilege, right.privilege) ||
        Number(left.grantable) - Number(right.grantable),
    );
  const body = rows
    .map(
      (entry) =>
        `${entry.kind}|${entry.identity}|${entry.grantorOid}|${entry.granteeOid}|${entry.privilege}|${String(entry.grantable)}`,
    )
    .join("\n");
  return createHash("sha256")
    .update(
      `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DIRECT_DUTY_ACL_CURRENT186_V1\n${body}\n`,
      "utf8",
    )
    .digest("hex");
}

function beforeCatalogCanonicalJson(catalogValue) {
  const value = canonicalStringify(
    normalizeIdentityMailDutyRoleCatalogCurrent186(catalogValue),
  );
  const size = Buffer.byteLength(value, "utf8");
  if (size < 2 || size > 4_194_304) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_BEFORE_CATALOG_STORAGE_INVALID",
    );
  }
  return value;
}

function epochCatalogBinding(catalogValue, beforeCatalogValue = null) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(catalogValue);
  return Object.freeze({
    beforeCatalogStorageProfile:
      beforeCatalogValue === null
        ? null
        : IDENTITY_MAIL_DUTY_ROLE_CURRENT186_BEFORE_CATALOG_STORAGE_PROFILE,
    directDutyAclDigest: directDutyAclDigest(catalog),
    systemPublicAclBaselineDigest: catalog.systemPublicAclBaselineDigest,
  });
}

function rollbackPlan(config, currentCatalog, receipt) {
  beforeCatalogCanonicalJson(receipt.beforeCatalog);
  const core = Object.freeze({
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    applyReceiptDigest: receipt.applyReceiptDigest,
    beforeCatalogDigest:
      identityMailDutyRoleCatalogCurrent186Digest(currentCatalog),
    config,
    mode: "rollback",
    restoreCatalogDigest: receipt.beforeCatalogDigest,
    statements: beforeImageRestoreStatements(
      receipt.beforeCatalog,
      currentCatalog,
    ),
    transactionProtocol:
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROTOCOL,
  });
  return Object.freeze({ ...core, planDigest: safePlanDigest(core) });
}

function emergencyPlan(config) {
  const core = Object.freeze({
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    config,
    drainProtocol: Object.freeze({
      attempts: EMERGENCY_RUNTIME_SESSION_POLL_ATTEMPTS,
      delayMs: EMERGENCY_RUNTIME_SESSION_POLL_DELAY_MS,
      profile: EMERGENCY_RUNTIME_DRAIN_PROFILE,
      roleNames: Object.freeze([
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker,
      ]),
      sessionCountSqlSha256: createHash("sha256")
        .update(
          IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL,
          "utf8",
        )
        .digest("hex"),
      terminateSqlSha256: createHash("sha256")
        .update(
          IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL,
          "utf8",
        )
        .digest("hex"),
    }),
    mode: "emergency",
    phase1Protocol: Object.freeze({
      aclLockSqlSha256: createHash("sha256")
        .update(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL, "utf8")
        .digest("hex"),
      attempts: EMERGENCY_PHASE1_ATTEMPTS,
      epochReadSqlSha256: createHash("sha256")
        .update(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL, "utf8")
        .digest("hex"),
      profile: EMERGENCY_PHASE1_RECOVERY_PROFILE,
    }),
    phase1: Object.freeze([
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner)} NOLOGIN`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator)} NOLOGIN`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker)} NOLOGIN`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner)} RESET ALL`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator)} RESET ALL`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker)} RESET ALL`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner)} IN DATABASE ${quoteIdentifier(config.databaseName)} RESET ALL`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator)} IN DATABASE ${quoteIdentifier(config.databaseName)} RESET ALL`,
      `ALTER ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker)} IN DATABASE ${quoteIdentifier(config.databaseName)} RESET ALL`,
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(config.databaseName)} FROM ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner)}`,
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(config.databaseName)} FROM ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator)}`,
      `REVOKE CONNECT ON DATABASE ${quoteIdentifier(config.databaseName)} FROM ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker)}`,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_STRICT_MEMBERSHIP_CONTAINMENT_SQL,
    ]),
    phase2Digest: createHash("sha256")
      .update(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
        "utf8",
      )
      .digest("hex"),
    transactionProtocol:
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROTOCOL,
  });
  return Object.freeze({ ...core, planDigest: safePlanDigest(core) });
}

function applyReceiptCore({
  applyConfig,
  beforeCatalog,
  beforeCatalogDigest,
  epoch,
  operationId,
  planDigest,
  targetCatalogDigest,
  targetDefinitionManifestDigest,
  targetExactGrantsDigest,
  targetOwnerSurfaceDigest,
}) {
  return Object.freeze({
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    applyConfig,
    authorization: false,
    beforeCatalog,
    beforeCatalogDigest,
    canMutate: false,
    canSend: false,
    candidateStatus: "NOT_DEPLOYABLE",
    decision: "CURRENT186_DUTY_ROLE_DEPLOYMENT_APPLIED",
    epoch,
    operationId,
    planDigest,
    targetCatalogDigest,
    targetDefinitionManifestDigest,
    targetExactGrantsDigest,
    targetOwnerSurfaceDigest,
  });
}

function applyReceiptDigest(core) {
  const config = core.applyConfig;
  return createHash("sha256")
    .update(
      [
        IDENTITY_MAIL_DUTY_ROLE_APPLY_RECEIPT_CURRENT186_DIGEST_DOMAIN,
        core.operationId,
        "APPLY",
        core.beforeCatalogDigest,
        core.planDigest,
        core.targetCatalogDigest,
        core.targetExactGrantsDigest,
        core.targetOwnerSurfaceDigest,
        core.targetDefinitionManifestDigest,
        config.databaseIdentityDigest,
        config.deploymentMarkerDigest,
        config.actualContextDigest,
        config.migrationManifestDigest,
        config.applicationReleaseSha,
        config.applicationArtifactSha256,
        "",
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

function evidenceDigest(config, previous, reasonCode, digests, receiptBinding) {
  return createHash("sha256")
    .update(
      [
        IDENTITY_MAIL_DUTY_ROLE_EVIDENCE_CURRENT186_DIGEST_DOMAIN,
        config.operationId,
        String((previous?.epoch ?? 0) + 1),
        previous?.payloadDigest ?? "0".repeat(64),
        reasonCode,
        receiptBinding.applyReceiptDigest,
        receiptBinding.beforeCatalogDigest,
        receiptBinding.planDigest,
        digests.definitionManifestDigest,
        digests.catalogDigest,
        digests.exactGrantsDigest,
        digests.ownerSurfaceDigest,
        config.databaseIdentityDigest,
        config.deploymentMarkerDigest,
        config.actualContextDigest,
        config.migrationManifestDigest,
        config.applicationReleaseSha,
        config.applicationArtifactSha256,
        "",
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

export function buildIdentityMailDutyRoleDeploymentCurrent186Plan(
  catalogValue,
  configValue,
) {
  const config =
    normalizeIdentityMailDutyRoleDeploymentCurrent186Config(configValue);
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(catalogValue);
  assertCatalogIdentity(catalog, config);
  beforeCatalogCanonicalJson(catalog);
  const beforeCatalogDigest =
    identityMailDutyRoleCatalogCurrent186Digest(catalog);
  const { target, ...digests } =
    identityMailDutyRoleCatalogCurrent186TargetDigests(catalog);
  const safety = inspectIdentityMailDutyRoleCatalogCurrent186Safety(
    catalog,
    config.definitionManifestDigest,
  );
  const core = Object.freeze({
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    beforeCatalog: catalog,
    beforeCatalogDigest,
    candidateStatus: "NOT_DEPLOYABLE",
    config,
    currentDecision:
      inspectIdentityMailDutyRoleCatalogCurrent186(catalog).decision,
    safetyBlockers: safety.blockers,
    globalEffects: Object.freeze({
      databasePublicPrivilegesRevoked: Object.freeze([
        "CONNECT",
        "CREATE",
        "TEMPORARY",
      ]),
      futureRoutineDefaultPrivilegesControlled: false,
      productionApplyAuthorized: false,
      publicRoutineExecuteRevocationCount: catalog.publicRoutineAcls.length,
      requiresExplicitApplicationRoleAllowlist: true,
    }),
    statements: targetStatements(catalog, target),
    targetCatalogDigest: digests.catalogDigest,
    targetDefinitionManifestDigest: digests.definitionManifestDigest,
    targetExactGrantsDigest: digests.exactGrantsDigest,
    targetOwnerSurfaceDigest: digests.ownerSurfaceDigest,
    transactionProtocol:
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PROTOCOL,
  });
  return Object.freeze({
    ...core,
    planDigest: safePlanDigest(core),
  });
}

function normalizeEpochRow(value) {
  if (value === null || value === undefined) return null;
  const row = exactRecord(
    value,
    EPOCH_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_INVALID",
  );
  const epoch = Number(row.epoch);
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 1 ||
    !UUID_PATTERN.test(row.operationId) ||
    !SHA256_PATTERN.test(row.payloadDigest) ||
    !SHA256_PATTERN.test(row.catalogDigest) ||
    !SHA256_PATTERN.test(row.exactGrantsDigest) ||
    !SHA256_PATTERN.test(row.ownerSurfaceDigest) ||
    !validPgRoleName(row.deploymentRoleName) ||
    !validOid(Number(row.deploymentRoleOid)) ||
    !SHA256_PATTERN.test(row.applyReceiptDigest) ||
    !SHA256_PATTERN.test(row.beforeCatalogDigest) ||
    !SHA256_PATTERN.test(row.planDigest) ||
    !SHA256_PATTERN.test(row.definitionManifestDigest) ||
    !["APPLY", "EMERGENCY_CONTAINMENT", "ROLLBACK", "ROTATE"].includes(
      row.reasonCode,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_INVALID");
  }
  return Object.freeze({
    applyReceiptDigest: row.applyReceiptDigest,
    beforeCatalogDigest: row.beforeCatalogDigest,
    catalogDigest: row.catalogDigest,
    definitionManifestDigest: row.definitionManifestDigest,
    deploymentRoleName: row.deploymentRoleName,
    deploymentRoleOid: Number(row.deploymentRoleOid),
    epoch,
    exactGrantsDigest: row.exactGrantsDigest,
    operationId: row.operationId,
    ownerSurfaceDigest: row.ownerSurfaceDigest,
    payloadDigest: row.payloadDigest,
    planDigest: row.planDigest,
    reasonCode: row.reasonCode,
  });
}

function normalizeEpochAppendReceipt(value, expected) {
  const receipt = exactRecord(
    value,
    EPOCH_APPEND_RECEIPT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_APPEND_FAILED",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.operation !== "APPEND_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH" ||
    receipt.decision !== "APPENDED" ||
    receipt.candidateStatus !== "NOT_DEPLOYABLE" ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.authorityScope !== "CURRENT_DATABASE_ONLY" ||
    receipt.crossDatabaseAuthorityControlled !== false ||
    receipt.futureCreatorDefaultPrivilegesControlled !== false ||
    receipt.applicationRoleAllowlistBound !== false ||
    receipt.productionApplyAuthorized !== false ||
    receipt.epoch !== expected.payload.epoch ||
    receipt.operationId !== expected.payload.operationId ||
    receipt.payloadDigest !== expected.payloadDigest ||
    (Object.hasOwn(expected.payload, "applyReceiptDigest") &&
      (receipt.applyReceiptDigest !== expected.payload.applyReceiptDigest ||
        receipt.beforeCatalogDigest !== expected.payload.beforeCatalogDigest ||
        receipt.planDigest !== expected.payload.planDigest ||
        receipt.definitionManifestDigest !==
          expected.payload.definitionManifestDigest ||
        receipt.evidenceDigest !== expected.payload.evidenceDigest ||
        receipt.directDutyAclDigest !== expected.payload.directDutyAclDigest ||
        receipt.systemPublicAclBaselineDigest !==
          expected.payload.systemPublicAclBaselineDigest)) ||
    !SHA256_PATTERN.test(receipt.directDutyAclDigest) ||
    !SHA256_PATTERN.test(receipt.systemPublicAclBaselineDigest) ||
    !Number.isSafeInteger(receipt.recordedAtEpochMs) ||
    receipt.recordedAtEpochMs <= 0 ||
    typeof receipt.recordedTransactionId !== "string" ||
    !/^[0-9]{1,32}$/u.test(receipt.recordedTransactionId)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_APPEND_FAILED");
  }
  return Object.freeze({ ...receipt });
}

function normalizeApplyReceipt(value) {
  const receipt = exactRecord(
    value,
    APPLY_RECEIPT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  const beforeCatalog = normalizeIdentityMailDutyRoleCatalogCurrent186(
    receipt.beforeCatalog,
  );
  const applyConfig = normalizeIdentityMailDutyRoleDeploymentCurrent186Config(
    receipt.applyConfig,
  );
  const rebuiltPlan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    beforeCatalog,
    applyConfig,
  );
  const rebuiltTarget =
    identityMailDutyRoleCatalogCurrent186TargetDigests(beforeCatalog);
  if (
    receipt.applicationRoleAllowlistBound !== false ||
    receipt.authorityScope !== "CURRENT_DATABASE_ONLY" ||
    receipt.crossDatabaseAuthorityControlled !== false ||
    receipt.futureCreatorDefaultPrivilegesControlled !== false ||
    receipt.productionApplyAuthorized !== false ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.candidateStatus !== "NOT_DEPLOYABLE" ||
    receipt.decision !== "CURRENT186_DUTY_ROLE_DEPLOYMENT_APPLIED" ||
    !Number.isSafeInteger(receipt.epoch) ||
    receipt.epoch < 1 ||
    receipt.epoch !== applyConfig.expectedEpoch + 1 ||
    !UUID_PATTERN.test(receipt.operationId) ||
    receipt.operationId !== applyConfig.operationId ||
    !SHA256_PATTERN.test(receipt.beforeCatalogDigest) ||
    !SHA256_PATTERN.test(receipt.targetCatalogDigest) ||
    !SHA256_PATTERN.test(receipt.targetExactGrantsDigest) ||
    !SHA256_PATTERN.test(receipt.targetOwnerSurfaceDigest) ||
    !SHA256_PATTERN.test(receipt.targetDefinitionManifestDigest) ||
    !SHA256_PATTERN.test(receipt.epochPayloadDigest) ||
    !SHA256_PATTERN.test(receipt.planDigest) ||
    !SHA256_PATTERN.test(receipt.applyReceiptDigest) ||
    identityMailDutyRoleCatalogCurrent186Digest(beforeCatalog) !==
      receipt.beforeCatalogDigest ||
    rebuiltPlan.planDigest !== receipt.planDigest ||
    rebuiltTarget.catalogDigest !== receipt.targetCatalogDigest ||
    rebuiltTarget.exactGrantsDigest !== receipt.targetExactGrantsDigest ||
    rebuiltTarget.ownerSurfaceDigest !== receipt.targetOwnerSurfaceDigest ||
    rebuiltTarget.definitionManifestDigest !==
      receipt.targetDefinitionManifestDigest
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
    );
  }
  const epochReceipt = normalizeEpochAppendReceipt(receipt.epochReceipt, {
    payload: Object.freeze({
      epoch: receipt.epoch,
      operationId: receipt.operationId,
    }),
    payloadDigest: receipt.epochPayloadDigest,
  });
  const core = applyReceiptCore({
    applyConfig,
    beforeCatalog,
    beforeCatalogDigest: receipt.beforeCatalogDigest,
    epoch: receipt.epoch,
    operationId: receipt.operationId,
    planDigest: receipt.planDigest,
    targetCatalogDigest: receipt.targetCatalogDigest,
    targetDefinitionManifestDigest: receipt.targetDefinitionManifestDigest,
    targetExactGrantsDigest: receipt.targetExactGrantsDigest,
    targetOwnerSurfaceDigest: receipt.targetOwnerSurfaceDigest,
  });
  if (applyReceiptDigest(core) !== receipt.applyReceiptDigest) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
    );
  }
  return Object.freeze({
    ...receipt,
    applyConfig,
    beforeCatalog,
    epochReceipt,
  });
}

async function queryRows(executor, sql, parameters = []) {
  if (typeof executor.query !== "function") {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ADAPTER_INVALID");
  }
  const result = await executor.query(sql, parameters);
  return Array.isArray(result) ? result : result?.rows;
}

async function readEpoch(executor) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL,
  );
  return normalizeEpochRow(rows?.[0] ?? null);
}

async function readAuthorizedEpoch(executor) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_AUTHORIZED_EPOCH_READ_SQL,
  );
  return normalizeEpochRow(rows?.[0] ?? null);
}

function normalizeOperationRecoveryRow(value) {
  const row = exactRecord(
    value,
    OPERATION_RECOVERY_ROW_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
  );
  const epoch = normalizeEpochRow(
    Object.fromEntries(EPOCH_KEYS.map((key) => [key, row[key]])),
  );
  const recordedAtEpochMs = Number(row.recordedAtEpochMs);
  if (
    typeof row.beforeCatalogCanonicalJson !== "string" ||
    Buffer.byteLength(row.beforeCatalogCanonicalJson, "utf8") < 2 ||
    Buffer.byteLength(row.beforeCatalogCanonicalJson, "utf8") > 4_194_304 ||
    typeof row.payloadCanonicalJson !== "string" ||
    Buffer.byteLength(row.payloadCanonicalJson, "utf8") < 2 ||
    Buffer.byteLength(row.payloadCanonicalJson, "utf8") > 600_000 ||
    !Number.isSafeInteger(recordedAtEpochMs) ||
    recordedAtEpochMs <= 0 ||
    typeof row.recordedTransactionId !== "string" ||
    !/^[0-9]{1,32}$/u.test(row.recordedTransactionId)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  return Object.freeze({
    ...epoch,
    beforeCatalogCanonicalJson: row.beforeCatalogCanonicalJson,
    payloadCanonicalJson: row.payloadCanonicalJson,
    recordedAtEpochMs,
    recordedTransactionId: row.recordedTransactionId,
  });
}

function normalizeBeforeCatalogRecoveryImage(canonicalJson) {
  let parsed;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(parsed);
  if (
    canonicalStringify(catalog) !== canonicalJson ||
    catalog.profile !== IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE ||
    catalog.systemPublicAclBaselineDigest !==
      IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  return catalog;
}

function rebuildRecoveredApplyReceipt(row, config) {
  let parsed;
  try {
    parsed = JSON.parse(row.payloadCanonicalJson);
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  const payload = exactRecord(
    parsed,
    EPOCH_PAYLOAD_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
  );
  if (canonicalStringify(payload) !== row.payloadCanonicalJson) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  const beforeCatalog = normalizeBeforeCatalogRecoveryImage(
    row.beforeCatalogCanonicalJson,
  );
  assertCatalogIdentity(beforeCatalog, config);
  const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    beforeCatalog,
    config,
  );
  const target =
    identityMailDutyRoleCatalogCurrent186TargetDigests(beforeCatalog);
  const binding = epochCatalogBinding(target.target, beforeCatalog);
  const previous =
    config.expectedEpoch === 0
      ? null
      : Object.freeze({
          epoch: config.expectedEpoch,
          payloadDigest: payload.previousPayloadDigest,
        });
  const core = applyReceiptCore({
    applyConfig: config,
    beforeCatalog,
    beforeCatalogDigest: plan.beforeCatalogDigest,
    epoch: config.expectedEpoch + 1,
    operationId: config.operationId,
    planDigest: plan.planDigest,
    targetCatalogDigest: target.catalogDigest,
    targetDefinitionManifestDigest: target.definitionManifestDigest,
    targetExactGrantsDigest: target.exactGrantsDigest,
    targetOwnerSurfaceDigest: target.ownerSurfaceDigest,
  });
  const recoveredApplyReceiptDigest = applyReceiptDigest(core);
  const expectedEpochDocument = epochPayload(
    config,
    previous,
    "APPLY",
    {
      catalogDigest: target.catalogDigest,
      definitionManifestDigest: target.definitionManifestDigest,
      exactGrantsDigest: target.exactGrantsDigest,
      ownerSurfaceDigest: target.ownerSurfaceDigest,
    },
    {
      applyReceiptDigest: recoveredApplyReceiptDigest,
      beforeCatalogDigest: plan.beforeCatalogDigest,
      planDigest: plan.planDigest,
      ...binding,
    },
  );
  if (
    payload.reasonCode !== "APPLY" ||
    payload.operationId !== config.operationId ||
    payload.epoch !== config.expectedEpoch + 1 ||
    payload.previousEpoch !==
      (config.expectedEpoch === 0 ? null : config.expectedEpoch) ||
    payload.previousPayloadDigest !==
      (config.expectedEpoch === 0 ? null : previous.payloadDigest) ||
    payload.beforeCatalogDigest !== plan.beforeCatalogDigest ||
    identityMailDutyRoleCatalogCurrent186Digest(beforeCatalog) !==
      payload.beforeCatalogDigest ||
    beforeCatalogCanonicalJson(beforeCatalog) !==
      row.beforeCatalogCanonicalJson ||
    payload.beforeCatalogStorageProfile !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_BEFORE_CATALOG_STORAGE_PROFILE ||
    payload.beforeCatalogStorageProfile !==
      binding.beforeCatalogStorageProfile ||
    payload.directDutyAclDigest !== binding.directDutyAclDigest ||
    payload.systemPublicAclBaselineDigest !==
      binding.systemPublicAclBaselineDigest ||
    payload.applyReceiptDigest !== recoveredApplyReceiptDigest ||
    expectedEpochDocument.payloadCanonicalJson !== row.payloadCanonicalJson ||
    expectedEpochDocument.payloadDigest !== row.payloadDigest ||
    row.epoch !== payload.epoch ||
    row.operationId !== payload.operationId ||
    row.reasonCode !== payload.reasonCode ||
    row.catalogDigest !== payload.catalogDigest ||
    row.exactGrantsDigest !== payload.exactGrantsDigest ||
    row.ownerSurfaceDigest !== payload.ownerSurfaceDigest ||
    row.deploymentRoleName !== payload.deploymentRoleName ||
    row.deploymentRoleOid !== payload.deploymentRoleOid ||
    row.applyReceiptDigest !== payload.applyReceiptDigest ||
    row.beforeCatalogDigest !== payload.beforeCatalogDigest ||
    row.planDigest !== payload.planDigest ||
    row.definitionManifestDigest !== payload.definitionManifestDigest
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  const epochReceipt = normalizeEpochAppendReceipt(
    {
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
      applyReceiptDigest: payload.applyReceiptDigest,
      authorization: false,
      beforeCatalogDigest: payload.beforeCatalogDigest,
      canMutate: false,
      candidateStatus: "NOT_DEPLOYABLE",
      decision: "APPENDED",
      definitionManifestDigest: payload.definitionManifestDigest,
      directDutyAclDigest: payload.directDutyAclDigest,
      epoch: payload.epoch,
      evidenceDigest: payload.evidenceDigest,
      operation: "APPEND_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH",
      operationId: payload.operationId,
      payloadDigest: row.payloadDigest,
      planDigest: payload.planDigest,
      recordedAtEpochMs: row.recordedAtEpochMs,
      recordedTransactionId: row.recordedTransactionId,
      schemaVersion: 1,
      systemPublicAclBaselineDigest: payload.systemPublicAclBaselineDigest,
    },
    expectedEpochDocument,
  );
  return Object.freeze({
    ...core,
    applyReceiptDigest: recoveredApplyReceiptDigest,
    epochPayloadDigest: expectedEpochDocument.payloadDigest,
    epochReceipt,
  });
}

async function readRecoveredApplyReceipt(executor, config) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL,
    [config.operationId],
  );
  if (!Array.isArray(rows) || rows.length > 1) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
  if (rows.length === 0) return null;
  try {
    return rebuildRecoveredApplyReceipt(
      normalizeOperationRecoveryRow(rows[0]),
      config,
    );
  } catch {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
  }
}

async function lockEpoch(executor) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL,
  );
  const epoch = Number(rows?.[0]?.epoch ?? NaN);
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_LOCK_INVALID");
  }
  return epoch;
}

function epochPayload(config, previous, reasonCode, digests, receiptBinding) {
  const payload = Object.freeze({
    actualContextDigest: config.actualContextDigest,
    applicationArtifactSha256: config.applicationArtifactSha256,
    applicationContract: config.applicationContract,
    applicationReleaseSha: config.applicationReleaseSha,
    applyReceiptDigest: receiptBinding.applyReceiptDigest,
    beforeCatalogStorageProfile: receiptBinding.beforeCatalogStorageProfile,
    beforeCatalogDigest: receiptBinding.beforeCatalogDigest,
    catalogContract: IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_CONTRACT,
    catalogDigest: digests.catalogDigest,
    catalogProfile: IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE,
    coordinatorRoleName: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
    coordinatorRoleOid: config.coordinatorRoleOid,
    databaseIdentityDigest: config.databaseIdentityDigest,
    databaseName: config.databaseName,
    databaseOid: config.databaseOid,
    definitionManifestDigest: digests.definitionManifestDigest,
    deploymentRoleName: config.deploymentRoleName,
    deploymentRoleOid: config.deploymentRoleOid,
    deploymentMarkerDigest: config.deploymentMarkerDigest,
    deploymentMarkerId: config.deploymentMarkerId,
    directDutyAclDigest: receiptBinding.directDutyAclDigest,
    epoch: (previous?.epoch ?? 0) + 1,
    evidenceDigest: evidenceDigest(
      config,
      previous,
      reasonCode,
      digests,
      receiptBinding,
    ),
    exactGrantsDigest: digests.exactGrantsDigest,
    exactGrantsProfile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE,
    migrationCount: config.migrationCount,
    migrationHead: config.migrationHead,
    migrationManifestDigest: config.migrationManifestDigest,
    operationId: config.operationId,
    ownerSurfaceDigest: digests.ownerSurfaceDigest,
    planDigest: receiptBinding.planDigest,
    previousEpoch: previous?.epoch ?? null,
    previousPayloadDigest: previous?.payloadDigest ?? null,
    reasonCode,
    schemaOwnerRoleName: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
    schemaOwnerRoleOid: config.schemaOwnerRoleOid,
    systemPublicAclBaselineDigest: receiptBinding.systemPublicAclBaselineDigest,
    workerRoleName: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker,
    workerRoleOid: config.workerRoleOid,
  });
  const payloadCanonicalJson = canonicalStringify(payload);
  const payloadDigest = createHash("sha256")
    .update(
      `${IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_DIGEST_DOMAIN}\n${payloadCanonicalJson}\n`,
      "utf8",
    )
    .digest("hex");
  return Object.freeze({ payload, payloadCanonicalJson, payloadDigest });
}

async function appendEpoch(
  executor,
  value,
  beforeCatalogCanonicalJsonValue = null,
) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL,
    [
      value.payloadCanonicalJson,
      value.payloadDigest,
      beforeCatalogCanonicalJsonValue,
    ],
  );
  if (rows?.length !== 1 || rows[0]?.receipt === null) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_APPEND_FAILED");
  }
  return normalizeEpochAppendReceipt(rows[0].receipt, value);
}

async function executeStatements(executor, statements) {
  if (typeof executor.execute !== "function") {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ADAPTER_INVALID");
  }
  for (const statement of statements) await executor.execute(statement);
}

function assertAdapter(adapter) {
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.readCatalog !== "function" ||
    typeof adapter.query !== "function"
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ADAPTER_INVALID");
  }
}

async function readAndValidate(adapter, config) {
  const catalog = await readIdentityMailDutyRoleCatalogCurrent186(
    adapter,
    config,
  );
  assertCatalogIdentity(catalog, config);
  return catalog;
}

function assertCatalogSafety(catalog, config, reasonCode) {
  const safety = inspectIdentityMailDutyRoleCatalogCurrent186Safety(
    catalog,
    config.definitionManifestDigest,
  );
  if (!safety.compliant) fail(reasonCode);
  return safety;
}

function catalogWithoutAclSurface(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  return Object.freeze({
    ...catalog,
    directAuthorities: Object.freeze([]),
    effectivePrivileges: Object.freeze([]),
    objects: Object.freeze(
      catalog.objects
        .map((object) => Object.freeze({ ...object, acls: Object.freeze([]) }))
        .sort((left, right) => {
          const leftValue = canonicalStringify(left);
          const rightValue = canonicalStringify(right);
          return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        }),
    ),
    publicRoutineAcls: Object.freeze([]),
  });
}

function assertRollbackSourceCatalog(catalog, receipt, config, reasonCode) {
  const expectedTarget = identityMailDutyRoleCatalogCurrent186TargetDigests(
    receipt.beforeCatalog,
  ).target;
  if (
    canonicalStringify(catalogWithoutAclSurface(catalog)) !==
    canonicalStringify(catalogWithoutAclSurface(expectedTarget))
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
    );
  }

  if (
    expectedTarget.definitionManifestDigest !== config.definitionManifestDigest
  ) {
    fail(reasonCode);
  }

  const dutyRoles = Object.freeze(Object.values(expectedTarget.roles));
  const dutyRoleByOid = new Map(dutyRoles.map((role) => [role.oid, role]));
  const expectedObjectAcls = new Map(
    expectedTarget.objects.map((object) => [
      `${object.kind}\n${object.identity}`,
      new Set(object.acls.map((entry) => canonicalStringify(entry))),
    ]),
  );
  const objectByKey = new Map(
    catalog.objects.map((object) => [
      `${object.kind}\n${object.identity}`,
      object,
    ]),
  );
  const repairableCapabilities = new Set(
    expectedTarget.effectivePrivileges.map((entry) =>
      canonicalStringify(entry),
    ),
  );

  const repairableGrantee = (entry) => {
    if (entry.granteeName === "public" && entry.granteeOid === 0) return true;
    const role = dutyRoleByOid.get(entry.granteeOid);
    return role?.name === entry.granteeName;
  };
  const rememberCapability = (entry, objectKind, objectIdentity) => {
    const roles =
      entry.granteeOid === 0
        ? dutyRoles
        : [dutyRoleByOid.get(entry.granteeOid)].filter(Boolean);
    for (const role of roles) {
      repairableCapabilities.add(
        canonicalStringify({
          objectIdentity,
          objectKind,
          privilege: entry.privilege,
          roleName: role.name,
          roleOid: role.oid,
        }),
      );
    }
  };
  const repairableOwnerGrant = (entry, ownerName, ownerOid) =>
    entry.source === "ACL" &&
    entry.isGrantable === false &&
    entry.grantorName === ownerName &&
    entry.grantorOid === ownerOid &&
    repairableGrantee(entry);

  for (const object of catalog.objects) {
    const expected = expectedObjectAcls.get(
      `${object.kind}\n${object.identity}`,
    );
    for (const entry of object.acls) {
      if (expected?.has(canonicalStringify(entry))) continue;
      if (
        entry.isGrantable ||
        entry.grantorName !== object.ownerName ||
        entry.grantorOid !== object.ownerOid ||
        !repairableGrantee(entry)
      ) {
        fail(reasonCode);
      }
      rememberCapability(entry, object.kind, object.identity);
    }
  }

  const expectedDirectAuthorities = new Set(
    expectedTarget.directAuthorities.map((entry) => canonicalStringify(entry)),
  );
  for (const entry of catalog.directAuthorities) {
    if (expectedDirectAuthorities.has(canonicalStringify(entry))) continue;
    if (
      entry.objectKind === "COLUMN" &&
      !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.some(
        (expected) =>
          expected.objectIdentity === entry.objectIdentity &&
          expected.privilege === entry.privilege,
      )
    ) {
      fail(reasonCode);
    }
    let ownerObject = objectByKey.get(
      `${entry.objectKind}\n${entry.objectIdentity}`,
    );
    if (entry.objectKind === "COLUMN") {
      ownerObject = catalog.objects.find(
        (object) =>
          object.kind === "RELATION" &&
          entry.objectIdentity.startsWith(`${object.identity}.`),
      );
    }
    if (
      !ownerObject ||
      !repairableOwnerGrant(entry, ownerObject.ownerName, ownerObject.ownerOid)
    ) {
      fail(reasonCode);
    }
    rememberCapability(entry, entry.objectKind, entry.objectIdentity);
  }

  for (const entry of catalog.publicRoutineAcls) {
    if (
      entry.isGrantable ||
      entry.grantorName !== entry.ownerName ||
      entry.grantorOid !== entry.ownerOid
    ) {
      fail(reasonCode);
    }
    rememberCapability(
      {
        ...entry,
        granteeName: "public",
        granteeOid: 0,
        privilege: "EXECUTE",
      },
      "ROUTINE",
      entry.signature,
    );
  }

  if (
    catalog.effectivePrivileges.some(
      (entry) => !repairableCapabilities.has(canonicalStringify(entry)),
    )
  ) {
    fail(reasonCode);
  }
}

async function assertRollbackPublicRoutineBindings(
  adapter,
  receipt,
  reasonCode,
) {
  const expected = receipt.beforeCatalog.publicRoutineAcls
    .map((entry) =>
      Object.freeze({
        oid: entry.oid,
        ownerName: entry.ownerName,
        ownerOid: entry.ownerOid,
        routineKind: entry.routineKind,
        signature: entry.signature,
      }),
    )
    .sort(compareCanonicalValues);
  if (expected.length === 0) return;
  const rows = await queryRows(
    adapter,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PUBLIC_ROUTINE_BINDING_SQL,
    [canonicalStringify(expected)],
  );
  if (!Array.isArray(rows) || rows.length !== expected.length) {
    fail(reasonCode);
  }
  const actual = rows
    .map((value) => {
      const row = exactRecord(
        value,
        ["oid", "ownerName", "ownerOid", "routineKind", "signature"].sort(),
        reasonCode,
      );
      const oid = Number(row.oid);
      const ownerOid = Number(row.ownerOid);
      if (
        !validOid(oid) ||
        !validOid(ownerOid) ||
        !validPgRoleName(row.ownerName) ||
        !["a", "f", "p", "w"].includes(row.routineKind) ||
        typeof row.signature !== "string" ||
        row.signature.length === 0
      ) {
        fail(reasonCode);
      }
      return Object.freeze({
        oid,
        ownerName: row.ownerName,
        ownerOid,
        routineKind: row.routineKind,
        signature: row.signature,
      });
    })
    .sort(compareCanonicalValues);
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    fail(reasonCode);
  }
}

function assertActiveReceiptEpoch(previous, receipt, config) {
  if (
    previous === null ||
    previous.reasonCode !== "APPLY" ||
    previous.epoch !== receipt.epoch ||
    previous.epoch !== config.expectedEpoch ||
    previous.operationId !== receipt.operationId ||
    previous.applyReceiptDigest !== receipt.applyReceiptDigest ||
    previous.beforeCatalogDigest !== receipt.beforeCatalogDigest ||
    previous.planDigest !== receipt.planDigest ||
    previous.catalogDigest !== receipt.targetCatalogDigest ||
    previous.exactGrantsDigest !== receipt.targetExactGrantsDigest ||
    previous.ownerSurfaceDigest !== receipt.targetOwnerSurfaceDigest ||
    previous.definitionManifestDigest !==
      receipt.targetDefinitionManifestDigest ||
    previous.deploymentRoleName !== receipt.applyConfig.deploymentRoleName ||
    previous.deploymentRoleOid !== receipt.applyConfig.deploymentRoleOid
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
    );
  }
}

function deploymentOutput(value) {
  return Object.freeze({
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    authorization: false,
    candidateStatus: "NOT_DEPLOYABLE",
    canMutate: false,
    canSend: false,
    ...value,
  });
}

async function beginLockedCurrent186(executor, config) {
  await executeStatements(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_SETTINGS,
  );
  const lockedEpoch = await lockEpoch(executor);
  const previous = await readEpoch(executor);
  if (lockedEpoch !== (previous?.epoch ?? 0)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TORN_EPOCH");
  }
  if (lockedEpoch !== config.expectedEpoch) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_STALE_EPOCH");
  }
  return Object.freeze({ lockedEpoch, previous });
}

function containmentStatements(catalog) {
  const statements = [];
  const dutyRoleNames = [
    catalog.roles.schemaOwner.name,
    catalog.roles.coordinator.name,
    catalog.roles.worker.name,
  ];
  const publicSchema = catalog.objects.find(
    (object) => object.kind === "SCHEMA" && object.identity === "public",
  );
  if (!publicSchema) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CONTAINMENT_POSTCONDITION_FAILED",
    );
  }
  for (const object of catalog.objects) {
    statements.push(
      ...resetAclStatements(object, ["public", ...dutyRoleNames]),
    );
    const ownerGrantStatement = grantOwnerAllStatement(
      object,
      object.ownerName,
    );
    if (ownerGrantStatement !== null) statements.push(ownerGrantStatement);
  }
  for (const entry of catalog.publicRoutineAcls) {
    statements.push(`REVOKE EXECUTE ON ROUTINE ${entry.signature} FROM PUBLIC`);
  }
  if (publicSchema.ownerName !== "pg_database_owner") {
    statements.push(
      `SET LOCAL ROLE ${quoteIdentifier(publicSchema.ownerName)}`,
    );
  }
  statements.push('GRANT USAGE ON SCHEMA "public" TO PUBLIC');
  if (publicSchema.ownerName !== "pg_database_owner")
    statements.push("SET LOCAL ROLE NONE");
  for (const roleName of dutyRoleNames) {
    statements.push(`ALTER ROLE ${quoteIdentifier(roleName)} NOLOGIN`);
  }
  return Object.freeze(statements);
}

async function assertEmergencyIdentity(executor, config) {
  const rows = await queryRows(
    executor,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL,
  );
  const row = rows?.[0];
  if (
    rows?.length !== 1 ||
    row?.databaseName !== config.databaseName ||
    Number(row?.databaseOid) !== config.databaseOid ||
    row?.deploymentRoleName !== config.deploymentRoleName ||
    Number(row?.deploymentRoleOid) !== config.deploymentRoleOid ||
    row?.deploymentRoleSuperuser !== true ||
    row?.sessionUserName !== config.deploymentRoleName ||
    Number(row?.sessionUserOid) !== config.deploymentRoleOid ||
    row?.currentUserName !== config.deploymentRoleName ||
    Number(row?.currentUserOid) !== config.deploymentRoleOid ||
    row?.coordinatorRoleName !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator ||
    Number(row?.coordinatorRoleOid) !== config.coordinatorRoleOid ||
    row?.schemaOwnerRoleName !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner ||
    Number(row?.schemaOwnerRoleOid) !== config.schemaOwnerRoleOid ||
    row?.workerRoleName !== IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker ||
    Number(row?.workerRoleOid) !== config.workerRoleOid
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EMERGENCY_IDENTITY_INVALID",
    );
  }
}

async function emergencyPhaseOneAttempt(adapter, config) {
  return adapter.transaction(async (transaction) => {
    await executeStatements(
      transaction,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_SETTINGS,
    );
    const lockedEpoch = await lockEpoch(transaction);
    const previous = await readEpoch(transaction);
    if (lockedEpoch !== (previous?.epoch ?? 0)) {
      fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TORN_EPOCH");
    }
    await assertEmergencyIdentity(transaction, config);
    const plan = emergencyPlan(config);
    await executeStatements(transaction, plan.phase1);
    return Object.freeze({ lockedEpoch, plan });
  });
}

function isTypedDeploymentContractError(error) {
  return (
    error instanceof IdentityMailDutyRoleDeploymentCurrent186Error ||
    (error !== null &&
      typeof error === "object" &&
      error.safeContractError === true)
  );
}

async function emergencyPhaseOne(adapter, config) {
  for (let attempt = 1; attempt <= EMERGENCY_PHASE1_ATTEMPTS; attempt += 1) {
    try {
      const result = await emergencyPhaseOneAttempt(adapter, config);
      return Object.freeze({
        attempts: attempt,
        confirmed: true,
        ...result,
      });
    } catch (error) {
      if (isTypedDeploymentContractError(error)) throw error;
    }
  }
  return Object.freeze({
    attempts: EMERGENCY_PHASE1_ATTEMPTS,
    confirmed: false,
  });
}

function waitForEmergencySessionPoll() {
  return new Promise((resolve) => {
    setTimeout(resolve, EMERGENCY_RUNTIME_SESSION_POLL_DELAY_MS);
  });
}

async function terminateAndDrainEmergencyRuntimeSessions(adapter) {
  const parameters = [
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker,
  ];
  let allTerminationSignalsAccepted = true;
  let zeroSessionsObserved = false;
  for (
    let attempt = 0;
    attempt < EMERGENCY_RUNTIME_SESSION_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const terminationRows = await queryRows(
      adapter,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL,
      parameters,
    );
    if (!Array.isArray(terminationRows)) {
      return Object.freeze({
        compliant: false,
        reasonCode:
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TERMINATE_RESULT_INVALID",
      });
    }
    if (
      terminationRows.some(
        (row) =>
          row === null || typeof row !== "object" || row.terminated !== true,
      )
    ) {
      allTerminationSignalsAccepted = false;
    }
    const rows = await queryRows(
      adapter,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL,
      parameters,
    );
    const count = Number(rows?.[0]?.remainingSessionCount ?? Number.NaN);
    if (rows?.length !== 1 || !Number.isSafeInteger(count) || count < 0) {
      return Object.freeze({
        compliant: false,
        reasonCode:
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_RUNTIME_SESSION_POLL_INVALID",
      });
    }
    if (count === 0) {
      zeroSessionsObserved = true;
      break;
    }
    if (attempt + 1 < EMERGENCY_RUNTIME_SESSION_POLL_ATTEMPTS) {
      await waitForEmergencySessionPoll();
    }
  }
  if (!allTerminationSignalsAccepted) {
    return Object.freeze({
      compliant: false,
      reasonCode:
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TERMINATE_RESULT_FALSE",
    });
  }
  if (!zeroSessionsObserved) {
    return Object.freeze({
      compliant: false,
      reasonCode:
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_RUNTIME_SESSION_DRAIN_TIMEOUT",
    });
  }
  return Object.freeze({ compliant: true, reasonCode: null });
}

async function runEmergency(adapter, config) {
  const phaseOne = await emergencyPhaseOne(adapter, config);
  if (!phaseOne.confirmed) {
    return deploymentOutput({
      decision: "CURRENT186_DUTY_ROLE_EMERGENCY_PHASE1_UNCONFIRMED",
      phase1Attempts: phaseOne.attempts,
      phase1CommitState: "UNCONFIRMED",
      reasonCode:
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EMERGENCY_PHASE1_COMMIT_UNCONFIRMED",
    });
  }
  const { plan } = phaseOne;
  let runtimeDrain;
  try {
    runtimeDrain = await terminateAndDrainEmergencyRuntimeSessions(adapter);
  } catch {
    runtimeDrain = Object.freeze({
      compliant: false,
      reasonCode:
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_RUNTIME_SESSION_DRAIN_FAILED",
    });
  }
  if (!runtimeDrain.compliant) {
    return deploymentOutput({
      decision: "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED",
      phase1Committed: true,
      reasonCode: runtimeDrain.reasonCode,
    });
  }
  try {
    return await adapter.transaction(async (transaction) => {
      await executeStatements(
        transaction,
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_SETTINGS,
      );
      const lockedEpoch = await lockEpoch(transaction);
      const previous = await readEpoch(transaction);
      if (lockedEpoch !== (previous?.epoch ?? 0)) {
        fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TORN_EPOCH");
      }
      await executeStatements(transaction, [
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
      ]);
      const catalog = await readAndValidate(transaction, config);
      await executeStatements(transaction, containmentStatements(catalog));
      const finalCatalog = await readAndValidate(transaction, config);
      const containment =
        inspectIdentityMailDutyRoleContainmentCurrent186(finalCatalog);
      if (!containment.compliant) {
        fail(
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_CONTAINMENT_POSTCONDITION_FAILED",
        );
      }
      if (previous === null || previous.epoch !== config.expectedEpoch) {
        fail(
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EMERGENCY_EPOCH_UNAVAILABLE",
        );
      }
      const finalDigests =
        identityMailDutyRoleCatalogCurrent186ActualDigests(finalCatalog);
      const beforeCatalogDigest =
        identityMailDutyRoleCatalogCurrent186Digest(catalog);
      const epochDocument = epochPayload(
        config,
        previous,
        "EMERGENCY_CONTAINMENT",
        {
          ...finalDigests,
          exactGrantsDigest: previous.exactGrantsDigest,
        },
        {
          applyReceiptDigest: previous.applyReceiptDigest,
          beforeCatalogDigest,
          planDigest: plan.planDigest,
          ...epochCatalogBinding(finalCatalog),
        },
      );
      const epochReceipt = await appendEpoch(transaction, epochDocument);
      return deploymentOutput({
        decision: "CURRENT186_DUTY_ROLE_EMERGENCY_CONTAINED",
        epoch: epochDocument.payload.epoch,
        epochPayloadDigest: epochDocument.payloadDigest,
        epochReceipt,
        finalCatalogDigest: finalDigests.catalogDigest,
        finalDefinitionManifestDigest: finalDigests.definitionManifestDigest,
        finalOwnerSurfaceDigest: finalDigests.ownerSurfaceDigest,
        phase1Committed: true,
      });
    });
  } catch (error) {
    return deploymentOutput({
      decision: "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED",
      phase1Committed: true,
      reasonCode:
        error instanceof IdentityMailDutyRoleDeploymentCurrent186Error
          ? error.reasonCode
          : "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EMERGENCY_PHASE2_FAILED",
    });
  }
}

export async function runIdentityMailDutyRoleDeploymentCurrent186(value) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ARGUMENTS_INVALID");
  }
  const options = exactRecord(
    value,
    ["adapter", "config", "mode", "receipt"].sort(),
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ARGUMENTS_INVALID",
  );
  const { adapter, mode, receipt } = options;
  if (!IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_MODES.includes(mode)) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_MODE_INVALID");
  }
  if (
    (mode === "rollback" && receipt === null) ||
    (mode !== "rollback" && receipt !== null)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ARGUMENTS_INVALID");
  }
  assertAdapter(adapter);
  const config = normalizeIdentityMailDutyRoleDeploymentCurrent186Config(
    options.config,
  );
  if (mode === "check" || mode === "plan") {
    const catalog = await readAndValidate(adapter, config);
    const epoch = await readEpoch(adapter);
    const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(catalog);
    const safety = inspectIdentityMailDutyRoleCatalogCurrent186Safety(
      catalog,
      config.definitionManifestDigest,
    );
    if (mode === "check") {
      return deploymentOutput({
        containmentDecision:
          inspectIdentityMailDutyRoleContainmentCurrent186(catalog).decision,
        decision: inspection.decision,
        epoch,
        findings: inspection.findings,
        safetyBlockers: safety.blockers,
      });
    }
    if (mode === "plan") {
      return deploymentOutput({
        decision: "CURRENT186_DUTY_ROLE_DEPLOYMENT_PLAN",
        epoch,
        plan: buildIdentityMailDutyRoleDeploymentCurrent186Plan(
          catalog,
          config,
        ),
      });
    }
  }

  if (typeof adapter.transaction !== "function") {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ADAPTER_INVALID");
  }
  if (mode === "emergency") return runEmergency(adapter, config);

  if (mode === "attest") {
    return adapter.transaction(async (transaction) => {
      const { lockedEpoch, previous } = await beginLockedCurrent186(
        transaction,
        config,
      );
      if (previous === null || previous.epoch !== lockedEpoch) {
        fail(
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ATTESTATION_BLOCKED",
        );
      }
      const catalog = await readAndValidate(transaction, config);
      const actualDigests =
        identityMailDutyRoleCatalogCurrent186ActualDigests(catalog);
      const inactiveEpoch = ["EMERGENCY_CONTAINMENT", "ROLLBACK"].includes(
        previous.reasonCode,
      );
      const emergencyEpoch = previous.reasonCode === "EMERGENCY_CONTAINMENT";
      const inspection = emergencyEpoch
        ? inspectIdentityMailDutyRoleContainmentCurrent186(catalog)
        : inspectIdentityMailDutyRoleCatalogCurrent186(catalog);
      const authorizedEpoch = inactiveEpoch
        ? await readAuthorizedEpoch(transaction)
        : previous;
      const confirmedEpoch = await readEpoch(transaction);
      if (
        ((!inactiveEpoch || emergencyEpoch) && !inspection.compliant) ||
        authorizedEpoch === null ||
        confirmedEpoch?.epoch !== previous.epoch ||
        confirmedEpoch?.payloadDigest !== previous.payloadDigest ||
        previous.deploymentRoleName !== config.deploymentRoleName ||
        previous.deploymentRoleOid !== config.deploymentRoleOid ||
        previous.catalogDigest !== actualDigests.catalogDigest ||
        previous.definitionManifestDigest !==
          actualDigests.definitionManifestDigest ||
        (inactiveEpoch
          ? previous.exactGrantsDigest !== authorizedEpoch.exactGrantsDigest
          : previous.exactGrantsDigest !== actualDigests.exactGrantsDigest) ||
        previous.ownerSurfaceDigest !== actualDigests.ownerSurfaceDigest ||
        (inactiveEpoch &&
          previous.applyReceiptDigest !== authorizedEpoch.applyReceiptDigest)
      ) {
        fail(
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ATTESTATION_BLOCKED",
        );
      }
      return deploymentOutput({
        catalogDigest: actualDigests.catalogDigest,
        decision: inactiveEpoch
          ? emergencyEpoch
            ? "CURRENT186_DUTY_ROLE_CONTAINMENT_ATTESTED"
            : "CURRENT186_DUTY_ROLE_ROLLBACK_ATTESTED_INACTIVE"
          : "CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED",
        epoch: previous,
        exactGrantsDigest: previous.exactGrantsDigest,
        definitionManifestDigest: actualDigests.definitionManifestDigest,
        lastAuthorizedEpoch: inactiveEpoch ? authorizedEpoch : null,
        ownerSurfaceDigest: actualDigests.ownerSurfaceDigest,
      });
    });
  }

  const rollbackReceipt =
    mode === "rollback" ? normalizeApplyReceipt(receipt) : null;
  if (mode === "apply") {
    const recoveredReceipt = await readRecoveredApplyReceipt(adapter, config);
    if (recoveredReceipt !== null) return recoveredReceipt;
  }
  const preflightEpoch = await readEpoch(adapter);
  if ((preflightEpoch?.epoch ?? 0) !== config.expectedEpoch) {
    fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_STALE_EPOCH");
  }
  if (mode === "rollback") {
    assertActiveReceiptEpoch(preflightEpoch, rollbackReceipt, config);
  }
  const preflightCatalog = await readAndValidate(adapter, config);
  let preflightPlan;
  if (mode === "apply") {
    assertCatalogSafety(
      preflightCatalog,
      config,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_BLOCKED",
    );
    preflightPlan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
      preflightCatalog,
      config,
    );
  } else {
    await assertRollbackPublicRoutineBindings(
      adapter,
      rollbackReceipt,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
    );
    assertRollbackSourceCatalog(
      preflightCatalog,
      rollbackReceipt,
      config,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_PREFLIGHT_BLOCKED",
    );
  }
  return adapter.transaction(async (transaction) => {
    const { lockedEpoch, previous } = await beginLockedCurrent186(
      transaction,
      config,
    );

    if (mode === "apply") {
      const beforeCatalog = await readAndValidate(transaction, config);
      assertCatalogSafety(
        beforeCatalog,
        config,
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_LOCKED_PREFLIGHT_BLOCKED",
      );
      if (
        identityMailDutyRoleCatalogCurrent186Digest(beforeCatalog) !==
        preflightPlan.beforeCatalogDigest
      ) {
        fail("IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_STALE");
      }
      const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
        beforeCatalog,
        config,
      );
      await executeStatements(transaction, plan.statements);
      const afterCatalog = await readAndValidate(transaction, config);
      const inspection =
        inspectIdentityMailDutyRoleCatalogCurrent186(afterCatalog);
      if (
        !inspection.compliant ||
        inspection.catalogDigest !== plan.targetCatalogDigest ||
        inspection.definitionManifestDigest !==
          plan.targetDefinitionManifestDigest ||
        inspection.exactGrantsDigest !== plan.targetExactGrantsDigest ||
        inspection.ownerSurfaceDigest !== plan.targetOwnerSurfaceDigest
      ) {
        fail(
          "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_POSTCONDITION_FAILED",
        );
      }
      const core = applyReceiptCore({
        applyConfig: config,
        beforeCatalog: plan.beforeCatalog,
        beforeCatalogDigest: plan.beforeCatalogDigest,
        epoch: lockedEpoch + 1,
        operationId: config.operationId,
        planDigest: plan.planDigest,
        targetCatalogDigest: plan.targetCatalogDigest,
        targetDefinitionManifestDigest: plan.targetDefinitionManifestDigest,
        targetExactGrantsDigest: plan.targetExactGrantsDigest,
        targetOwnerSurfaceDigest: plan.targetOwnerSurfaceDigest,
      });
      const receiptDigest = applyReceiptDigest(core);
      const epochDocument = epochPayload(
        config,
        previous,
        "APPLY",
        {
          catalogDigest: plan.targetCatalogDigest,
          definitionManifestDigest: plan.targetDefinitionManifestDigest,
          exactGrantsDigest: plan.targetExactGrantsDigest,
          ownerSurfaceDigest: plan.targetOwnerSurfaceDigest,
        },
        {
          applyReceiptDigest: receiptDigest,
          beforeCatalogDigest: plan.beforeCatalogDigest,
          planDigest: plan.planDigest,
          ...epochCatalogBinding(afterCatalog, plan.beforeCatalog),
        },
      );
      await executeStatements(transaction, [
        `SET LOCAL ROLE ${quoteIdentifier(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner)}`,
      ]);
      const epochReceipt = await appendEpoch(
        transaction,
        epochDocument,
        beforeCatalogCanonicalJson(plan.beforeCatalog),
      );
      return Object.freeze({
        ...core,
        applyReceiptDigest: receiptDigest,
        epochPayloadDigest: epochDocument.payloadDigest,
        epochReceipt,
      });
    }

    assertActiveReceiptEpoch(previous, rollbackReceipt, config);
    if (rollbackReceipt.operationId === config.operationId) {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
      );
    }
    const currentCatalog = await readAndValidate(transaction, config);
    await assertRollbackPublicRoutineBindings(
      transaction,
      rollbackReceipt,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
    );
    assertRollbackSourceCatalog(
      currentCatalog,
      rollbackReceipt,
      config,
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_LOCKED_PREFLIGHT_BLOCKED",
    );
    const beforeCatalog = rollbackReceipt.beforeCatalog;
    const plan = rollbackPlan(config, currentCatalog, rollbackReceipt);
    await executeStatements(transaction, [
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
      ...plan.statements,
    ]);
    const restored = await readAndValidate(transaction, config);
    const restoredDigest =
      identityMailDutyRoleCatalogCurrent186Digest(restored);
    if (restoredDigest !== rollbackReceipt.beforeCatalogDigest) {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_POSTCONDITION_FAILED",
      );
    }
    const finalDigests =
      identityMailDutyRoleCatalogCurrent186ActualDigests(restored);
    const inactiveEpochDigests = Object.freeze({
      catalogDigest: finalDigests.catalogDigest,
      definitionManifestDigest: finalDigests.definitionManifestDigest,
      exactGrantsDigest: previous.exactGrantsDigest,
      ownerSurfaceDigest: finalDigests.ownerSurfaceDigest,
    });
    const epochDocument = epochPayload(
      config,
      previous,
      "ROLLBACK",
      inactiveEpochDigests,
      {
        applyReceiptDigest: rollbackReceipt.applyReceiptDigest,
        beforeCatalogDigest: plan.beforeCatalogDigest,
        planDigest: plan.planDigest,
        ...epochCatalogBinding(restored),
      },
    );
    const epochReceipt = await appendEpoch(transaction, epochDocument);
    return deploymentOutput({
      applyReceiptDigest: rollbackReceipt.applyReceiptDigest,
      beforeCatalogDigest: plan.beforeCatalogDigest,
      decision: "CURRENT186_DUTY_ROLE_DEPLOYMENT_ROLLED_BACK",
      epoch: epochDocument.payload.epoch,
      epochPayloadDigest: epochDocument.payloadDigest,
      epochReceipt,
      finalCatalogDigest: finalDigests.catalogDigest,
      finalObservedGrantsDigest: finalDigests.exactGrantsDigest,
      finalOwnerSurfaceDigest: finalDigests.ownerSurfaceDigest,
      finalDefinitionManifestDigest: finalDigests.definitionManifestDigest,
      lastAuthorizedExactGrantsDigest: previous.exactGrantsDigest,
      planDigest: plan.planDigest,
      restoredCatalogDigest: restoredDigest,
    });
  });
}

export function createIdentityMailDutyRoleDeploymentCurrent186OperationId() {
  return randomUUID();
}

export const identityMailDutyRoleDeploymentCurrent186Internals = Object.freeze({
  beforeImageRestoreStatements,
  epochPayload,
  targetStatements,
});
