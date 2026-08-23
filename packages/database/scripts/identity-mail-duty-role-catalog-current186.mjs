import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_VERSION,
} from "./identity-mail-duty-role-grants-current185.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE =
  "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE =
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE;
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_DIGEST_DOMAIN =
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN;
export const IDENTITY_MAIL_DUTY_ROLE_OWNER_SURFACE_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_OWNER_SURFACE_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_V1";
export const IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_PUBLIC_ACL_BASELINE_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_USER_ROUTINE_DEFINITION_CURRENT186_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_USER_ROUTINE_DEFINITION_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST =
  "ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117";

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES = Object.freeze({
  coordinator: "identity_mail_enrollment_coordinator",
  schemaOwner: "identity_mail_schema_owner",
  worker: "identity_mail_worker_v2",
});

export const IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT186_RPC_SIGNATURE =
  'public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)';

export const IDENTITY_MAIL_WORKER_CURRENT186_RPC_SIGNATURES = Object.freeze(
  [
    'public."identity_mail_delivery_worker_assert_v2"(text,text)',
    'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
    'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
    'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
    'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
  ].sort(),
);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES = Object.freeze(
  [
    IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT186_RPC_SIGNATURE,
    ...IDENTITY_MAIL_WORKER_CURRENT186_RPC_SIGNATURES,
  ].sort(),
);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS =
  Object.freeze(
    [
      'public."IdentityMailDeliveryTenantEnrollmentCommand"',
      'public."IdentityMailDeliveryTenantEnrollmentEvent"',
      'public."IdentityMailDutyRoleAclEpochV1"',
      'public."IdentityMailDutyRoleManifestEvidenceV2"',
      'public."IdentityMailDutyRoleManifestRevocationV2"',
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS =
  Object.freeze(
    [
      'public."IdentityMailDeliveryEvent"',
      'public."IdentityMailDeliveryTenantEnrollment"',
      'public."IdentityMailOutbox"',
      'public."_prisma_migrations"',
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY =
  'public."SharedBetaRuntimeReleaseMarker"';

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS =
  Object.freeze([
    "id",
    "payloadDigest",
    "databaseIdentityDigest",
    "actualContextDigest",
    "schemaHead",
    "migrationCount",
    "migrationManifestDigest",
    "coordinatorRoleName",
    "coordinatorRoleOid",
  ]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMN_IDENTITIES =
  Object.freeze(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS.map(
      (column) =>
        `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."${column}"`,
    ),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES =
  Object.freeze([
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMN_IDENTITIES,
    `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."stateRevision"`,
    `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."revokedAt"`,
    `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."validUntil"`,
    ...[
      "id",
      "status",
      "customerStage",
      "onboardingStatus",
      "trialStartsAt",
      "trialEndsAt",
    ].map((column) => `public."Tenant"."${column}"`),
    ...[
      "id",
      "tenantId",
      "email",
      "identityClaimRevision",
      "tokenHash",
      "acceptedAt",
      "revokedAt",
      "expiresAt",
      "role",
      "accessScope",
      "customRoleId",
      "storeIds",
    ].map((column) => `public."UserInvite"."${column}"`),
    ...["emailCanonical", "tenantId", "claimType", "subjectId", "revision"].map(
      (column) => `public."IdentityEmailClaim"."${column}"`,
    ),
  ]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES =
  Object.freeze([
    'public."Tenant"."id"',
    'public."UserInvite"."id"',
    'public."IdentityEmailClaim"."emailCanonical"',
    'public."IdentityMailDeliveryEvent"."id"',
  ]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES =
  Object.freeze([
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES.map(
      (objectIdentity) =>
        Object.freeze({ objectIdentity, privilege: "SELECT" }),
    ),
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES.map(
      (objectIdentity) =>
        Object.freeze({ objectIdentity, privilege: "UPDATE" }),
    ),
  ]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES =
  Object.freeze([
    ...new Set(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.map(
        (entry) => entry.objectIdentity,
      ),
    ),
  ]);

const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET = new Set(
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES =
  Object.freeze(
    [
      ...new Set(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.map(
          (identity) => identity.slice(0, identity.lastIndexOf(".")),
        ),
      ),
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS =
  Object.freeze(
    [
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS,
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS =
  Object.freeze(
    [
      ...new Set([
        ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS,
        ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES,
      ]),
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ONLY_RELATIONS =
  Object.freeze(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS.filter(
      (identity) =>
        !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS.includes(
          identity,
        ),
    ),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DATABASE_OWNER_RELATIONS =
  Object.freeze(
    [
      ...new Set([
        ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
        ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.filter(
          (identity) =>
            !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS.includes(
              identity,
            ),
        ),
      ]),
    ].sort(),
  );

function isProtectedColumnIdentity(objectIdentity) {
  return (
    typeof objectIdentity === "string" &&
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS.some((identity) =>
      objectIdentity.startsWith(`${identity}.`),
    )
  );
}

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES =
  Object.freeze([
    Object.freeze({
      objectIdentity: 'public."identity_email_claim_lock_v1"(text)',
      privilege: "EXECUTE",
    }),
  ]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_INTERNAL_ROUTINE_SIGNATURES =
  Object.freeze(
    [
      'public."identity_initial_owner_mail_complete_current183"(text,text,integer,text,text,text,text,text,text)',
      'public."identity_initial_owner_mail_provider_mark_current183"(text,text,integer,text,text,text,text,text)',
      'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
      'public."identity_mail_delivery_event_append_v2"()',
      'public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text)',
      'public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"()',
      'public."identity_mail_duty_role_acl_lock_v1"()',
      'public."identity_mail_duty_role_live_assert_v1"(bigint,bigint,bigint,bigint,text,text)',
      'public."identity_mail_evidence_immutable_guard_v2"()',
      'public."identity_mail_evidence_import_insert_guard_v2"()',
      'public."identity_mail_manifest_revocation_lock_v2"()',
      'public."identity_mail_outbox_delivery_guard_v2"()',
      'public."identity_mail_tenant_enrollment_event_write_guard_v2"()',
      'public."identity_mail_tenant_enrollment_import_evidence_v2"(text,text)',
      'public."identity_mail_tenant_enrollment_registry_write_guard_v2"()',
      'public."identity_mail_tenant_lock_v1"(text)',
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES =
  Object.freeze(
    [
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES,
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_INTERNAL_ROUTINE_SIGNATURES,
    ].sort(),
  );
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES =
  Object.freeze(
    [
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES,
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES.map(
        (entry) => entry.objectIdentity,
      ),
    ].sort(),
  );
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_DEFINITION_IDENTITIES =
  Object.freeze(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES.map(
      (signature) => signature.replace(/^public\."([^"]+)"\(/u, "public.$1("),
    ).sort(),
  );
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_DEFINITION_IDENTITIES =
  Object.freeze(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.map(
      (signature) => signature.replace(/^public\."([^"]+)"\(/u, "public.$1("),
    ).sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_RELATION_PRIVILEGES =
  Object.freeze(
    [
      ['public."IdentityMailDeliveryTenantEnrollment"', "INSERT"],
      ['public."IdentityMailDeliveryTenantEnrollment"', "SELECT"],
      ['public."IdentityMailDeliveryTenantEnrollment"', "UPDATE"],
      ['public."IdentityMailOutbox"', "SELECT"],
      ['public."IdentityMailOutbox"', "UPDATE"],
      ['public."IdentityMailDeliveryEvent"', "INSERT"],
      ['public."IdentityMailDeliveryEvent"', "SELECT"],
      ['public."_prisma_migrations"', "SELECT"],
    ].map(([objectIdentity, privilege]) =>
      Object.freeze({ objectIdentity, privilege }),
    ),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_NAMES =
  Object.freeze(
    [
      "IdentityMailDeliveryEvent_row_guard_trigger",
      "IdentityMailDeliveryEvent_truncate_guard_trigger",
      "IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger",
      "IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger",
      "IdentityMailEnrollmentCommand_immutable_dml_trigger",
      "IdentityMailEnrollmentCommand_immutable_truncate_trigger",
      "IdentityMailEnrollmentCommand_import_insert_guard_trigger",
      "IdentityMailEnrollmentEvent_immutable_dml_v2_trigger",
      "IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger",
      "IdentityMailEnrollmentEvent_insert_guard_v2_trigger",
      "IdentityMailEnrollment_registry_immutable_delete_v2_trigger",
      "IdentityMailEnrollment_registry_immutable_truncate_v2_trigger",
      "IdentityMailEnrollment_registry_write_guard_v2_trigger",
      "IdentityMailManifestRevocationV2_immutable_dml_trigger",
      "IdentityMailManifestRevocationV2_immutable_truncate_trigger",
      "IdentityMailManifestRevocationV2_insert_lock_trigger",
      "IdentityMailManifestV2_immutable_dml_trigger",
      "IdentityMailManifestV2_immutable_truncate_trigger",
      "IdentityMailManifestV2_import_insert_guard_trigger",
      "IdentityMailOutbox_delivery_event_trigger",
      "IdentityMailOutbox_delivery_guard_trigger",
    ].sort(),
  );
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES =
  Object.freeze(
    [
      'public."IdentityMailDeliveryEvent"::"IdentityMailDeliveryEvent_row_guard_trigger"',
      'public."IdentityMailDeliveryEvent"::"IdentityMailDeliveryEvent_truncate_guard_trigger"',
      'public."IdentityMailDutyRoleAclEpochV1"::"IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger"',
      'public."IdentityMailDutyRoleAclEpochV1"::"IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentCommand"::"IdentityMailEnrollmentCommand_immutable_dml_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentCommand"::"IdentityMailEnrollmentCommand_immutable_truncate_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentCommand"::"IdentityMailEnrollmentCommand_import_insert_guard_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentEvent"::"IdentityMailEnrollmentEvent_immutable_dml_v2_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentEvent"::"IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger"',
      'public."IdentityMailDeliveryTenantEnrollmentEvent"::"IdentityMailEnrollmentEvent_insert_guard_v2_trigger"',
      'public."IdentityMailDeliveryTenantEnrollment"::"IdentityMailEnrollment_registry_immutable_delete_v2_trigger"',
      'public."IdentityMailDeliveryTenantEnrollment"::"IdentityMailEnrollment_registry_immutable_truncate_v2_trigger"',
      'public."IdentityMailDeliveryTenantEnrollment"::"IdentityMailEnrollment_registry_write_guard_v2_trigger"',
      'public."IdentityMailDutyRoleManifestRevocationV2"::"IdentityMailManifestRevocationV2_immutable_dml_trigger"',
      'public."IdentityMailDutyRoleManifestRevocationV2"::"IdentityMailManifestRevocationV2_immutable_truncate_trigger"',
      'public."IdentityMailDutyRoleManifestRevocationV2"::"IdentityMailManifestRevocationV2_insert_lock_trigger"',
      'public."IdentityMailDutyRoleManifestEvidenceV2"::"IdentityMailManifestV2_immutable_dml_trigger"',
      'public."IdentityMailDutyRoleManifestEvidenceV2"::"IdentityMailManifestV2_immutable_truncate_trigger"',
      'public."IdentityMailDutyRoleManifestEvidenceV2"::"IdentityMailManifestV2_import_insert_guard_trigger"',
      'public."IdentityMailOutbox"::"IdentityMailOutbox_delivery_event_trigger"',
      'public."IdentityMailOutbox"::"IdentityMailOutbox_delivery_guard_trigger"',
    ].sort(),
  );

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_CHECK_CONSTRAINT =
  "identity_mail_duty_role_acl_epoch_definition_manifest_check";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const PUBLIC_ROUTINE_SIGNATURE_PATTERN =
  /^[a-z_][a-z0-9_]{0,62}\."[a-z_][a-z0-9_]{0,62}"\((?:[a-z][a-z0-9_ ]*(?:\[\])?(?:,[a-z][a-z0-9_ ]*(?:\[\])?)*)?\)$/u;
const MAX_OID = 4_294_967_295;
const MAX_ATTRIBUTE_NUMBER = 1_600;
const PG_DATABASE_OWNER_OID = 6_171;
const MAX_ROWS = 2_048;
const MAX_AUTHORITY_ROWS = 65_536;
const ROLE_KEYS = Object.freeze(
  [
    "bypassRls",
    "canLogin",
    "connectionLimit",
    "createDatabase",
    "createRole",
    "inherit",
    "name",
    "oid",
    "replication",
    "superuser",
    "validUntil",
  ].sort(),
);
const DATABASE_KEYS = Object.freeze(
  [
    "currentUserName",
    "currentUserOid",
    "identityDigest",
    "name",
    "oid",
    "ownerName",
    "ownerOid",
    "ownerSuperuser",
    "sessionUserName",
    "sessionUserOid",
  ].sort(),
);
const CATALOG_KEYS = Object.freeze(
  [
    "database",
    "databaseRoleSettings",
    "defaultAcls",
    "definitionManifest",
    "definitionManifestDigest",
    "directAuthorities",
    "dutyRoutines",
    "effectivePrivileges",
    "memberships",
    "objects",
    "profile",
    "publicRoutineAcls",
    "roles",
    "roleSettings",
    "schemaVersion",
    "supportColumnBindings",
    "systemPublicAclBaselineDigest",
    "unexpectedOwnedObjects",
    "userRoutineDefinitionCount",
    "userRoutineDefinitionDigest",
  ].sort(),
);
const OBJECT_KEYS = Object.freeze(
  ["acls", "identity", "kind", "oid", "ownerName", "ownerOid"].sort(),
);
const ACL_KEYS = Object.freeze(
  [
    "granteeName",
    "granteeOid",
    "grantorName",
    "grantorOid",
    "isGrantable",
    "privilege",
  ].sort(),
);
const EFFECTIVE_KEYS = Object.freeze(
  ["objectIdentity", "objectKind", "privilege", "roleName", "roleOid"].sort(),
);
const DUTY_ROUTINE_KEYS = Object.freeze(
  [
    "language",
    "oid",
    "ownerName",
    "ownerOid",
    "parallelSafety",
    "returnType",
    "searchPath",
    "securityDefiner",
    "signature",
    "volatility",
  ].sort(),
);
const PUBLIC_ROUTINE_ACL_KEYS = Object.freeze(
  [
    "grantorName",
    "grantorOid",
    "isGrantable",
    "oid",
    "ownerName",
    "ownerOid",
    "routineKind",
    "signature",
  ].sort(),
);
const DEFINITION_MANIFEST_KEYS = Object.freeze(
  ["definitionSha256", "identity", "kind"].sort(),
);
const DIRECT_AUTHORITY_KEYS = Object.freeze(
  [
    "grantorName",
    "grantorOid",
    "granteeName",
    "granteeOid",
    "isGrantable",
    "objectIdentity",
    "objectKind",
    "privilege",
    "source",
  ].sort(),
);
const UNEXPECTED_OWNED_OBJECT_KEYS = Object.freeze(
  ["identity", "kind", "oid", "ownerName", "ownerOid"].sort(),
);
const SUPPORT_COLUMN_BINDING_KEYS = Object.freeze(
  ["attributeNumber", "objectIdentity", "relationOid"].sort(),
);

export class IdentityMailDutyRoleCatalogCurrent186Error extends Error {
  constructor(reasonCode) {
    super("The CURRENT186 identity-mail duty-role catalog is invalid.");
    this.name = "IdentityMailDutyRoleCatalogCurrent186Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

export const IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL = `
WITH
ambient_context AS MATERIALIZED (
  SELECT pg_catalog.current_setting('search_path') AS ambient_search_path
),
deparse_context AS MATERIALIZED (
  SELECT ambient_context.ambient_search_path,
    pg_catalog.set_config('search_path', 'pg_catalog', true)
      AS fixed_search_path
  FROM ambient_context
),
input AS (
  SELECT $1::JSONB AS config, $2::JSONB AS expected_objects
),
expected_roles AS (
  SELECT *
  FROM pg_catalog.jsonb_to_recordset(
    (SELECT config->'roles' FROM input)
  ) AS role_entry("roleKey" TEXT, "name" TEXT, "oid" BIGINT)
),
roles AS (
  SELECT pg_catalog.jsonb_object_agg(
    expected."roleKey",
    pg_catalog.jsonb_build_object(
      'bypassRls', role_entry.rolbypassrls,
      'canLogin', role_entry.rolcanlogin,
      'connectionLimit', role_entry.rolconnlimit,
      'createDatabase', role_entry.rolcreatedb,
      'createRole', role_entry.rolcreaterole,
      'inherit', role_entry.rolinherit,
      'name', role_entry.rolname,
      'oid', role_entry.oid::BIGINT,
      'replication', role_entry.rolreplication,
      'superuser', role_entry.rolsuper,
      'validUntil', role_entry.rolvaliduntil
    ) ORDER BY expected."roleKey" COLLATE "C"
  ) AS value
  FROM expected_roles AS expected
  LEFT JOIN pg_catalog.pg_roles AS role_entry
    ON role_entry.rolname = expected."name"
   AND role_entry.oid = expected."oid"::OID
),
expected_objects AS (
  SELECT *
  FROM pg_catalog.jsonb_to_recordset(
    (SELECT expected_objects FROM input)
  ) AS object_entry("kind" TEXT, "identity" TEXT)
),
database_objects AS (
  SELECT expected."kind", expected."identity", database_entry.oid,
    database_entry.datdba AS owner_oid, database_entry.datacl AS acl,
    'd'::"char" AS acl_kind
  FROM expected_objects AS expected
  LEFT JOIN pg_catalog.pg_database AS database_entry
    ON expected."kind" = 'DATABASE'
   AND database_entry.datname = expected."identity"
  WHERE expected."kind" = 'DATABASE'
),
schema_objects AS (
  SELECT expected."kind", expected."identity", namespace_entry.oid,
    namespace_entry.nspowner AS owner_oid, namespace_entry.nspacl AS acl,
    'n'::"char" AS acl_kind
  FROM expected_objects AS expected
  LEFT JOIN pg_catalog.pg_namespace AS namespace_entry
    ON expected."kind" = 'SCHEMA'
   AND namespace_entry.nspname = expected."identity"
  WHERE expected."kind" = 'SCHEMA'
),
relation_objects AS (
  SELECT expected."kind", expected."identity", relation_entry.oid,
    relation_entry.relowner AS owner_oid, relation_entry.relacl AS acl,
    'r'::"char" AS acl_kind
  FROM expected_objects AS expected
  LEFT JOIN pg_catalog.pg_class AS relation_entry
    ON expected."kind" = 'RELATION'
   AND relation_entry.oid = pg_catalog.to_regclass(expected."identity")
  WHERE expected."kind" = 'RELATION'
),
routine_objects AS (
  SELECT expected."kind", expected."identity", routine_entry.oid,
    routine_entry.proowner AS owner_oid, routine_entry.proacl AS acl,
    'f'::"char" AS acl_kind
  FROM expected_objects AS expected
  LEFT JOIN pg_catalog.pg_proc AS routine_entry
    ON expected."kind" = 'ROUTINE'
   AND routine_entry.oid = pg_catalog.to_regprocedure(expected."identity")
  WHERE expected."kind" = 'ROUTINE'
),
raw_objects AS (
  SELECT * FROM database_objects
  UNION ALL SELECT * FROM schema_objects
  UNION ALL SELECT * FROM relation_objects
  UNION ALL SELECT * FROM routine_objects
),
objects AS (
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'acls', COALESCE((
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'granteeName', CASE WHEN privilege.grantee = 0
              THEN 'public' ELSE grantee.rolname END,
            'granteeOid', privilege.grantee::BIGINT,
            'grantorName', grantor.rolname,
            'grantorOid', privilege.grantor::BIGINT,
            'isGrantable', privilege.is_grantable,
            'privilege', privilege.privilege_type
          ) ORDER BY privilege.grantee, privilege.privilege_type COLLATE "C"
        )
        FROM pg_catalog.aclexplode(
          COALESCE(raw.acl, pg_catalog.acldefault(raw.acl_kind, raw.owner_oid))
        ) AS privilege
        LEFT JOIN pg_catalog.pg_roles AS grantee
          ON grantee.oid = privilege.grantee
        LEFT JOIN pg_catalog.pg_roles AS grantor
          ON grantor.oid = privilege.grantor
        WHERE privilege.grantee <> raw.owner_oid
      ), '[]'::JSONB),
      'identity', raw."identity",
      'kind', raw."kind",
      'oid', raw.oid::BIGINT,
      'ownerName', pg_catalog.pg_get_userbyid(raw.owner_oid),
      'ownerOid', raw.owner_oid::BIGINT
    ) ORDER BY raw."kind" COLLATE "C", raw."identity" COLLATE "C"
  ) AS value
  FROM raw_objects AS raw
),
duty_roles AS (
  SELECT role_entry.oid, role_entry.rolname
  FROM pg_catalog.pg_roles AS role_entry
  INNER JOIN expected_roles AS expected
    ON expected."oid"::OID = role_entry.oid
  WHERE expected."roleKey" IN ('coordinator', 'worker')
),
schema_owner_role AS (
  SELECT role_entry.oid, role_entry.rolname
  FROM pg_catalog.pg_roles AS role_entry
  INNER JOIN expected_roles AS expected
    ON expected."oid"::OID = role_entry.oid
  WHERE expected."roleKey" = 'schemaOwner'
),
support_relations AS (
  SELECT expected.relation_identity, relation_entry.oid,
    relation_entry.relname, namespace_entry.nspname
  FROM (VALUES
    ${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.map(
      (identity) => `('${identity.replaceAll("'", "''")}'::TEXT)`,
    ).join(",\n    ")}
  ) AS expected(relation_identity)
  INNER JOIN pg_catalog.pg_class AS relation_entry
    ON relation_entry.oid = pg_catalog.to_regclass(
      expected.relation_identity
    )
   AND relation_entry.relkind IN ('r', 'p')
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
),
support_routines AS (
  SELECT expected.routine_identity, expected.privilege, routine_entry.oid
  FROM (VALUES
    ${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES.map(
      (entry) =>
        `('${entry.objectIdentity.replaceAll("'", "''")}'::TEXT, '${entry.privilege}'::TEXT)`,
    ).join(",\n    ")}
  ) AS expected(routine_identity, privilege)
  INNER JOIN pg_catalog.pg_proc AS routine_entry
    ON routine_entry.oid = pg_catalog.to_regprocedure(
      expected.routine_identity
    )
),
support_column_bindings AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'attributeNumber', attribute_entry.attnum,
      'objectIdentity', expected.object_identity,
      'relationOid', relation_entry.oid::BIGINT
    ) ORDER BY expected.object_identity COLLATE "C"
  ), '[]'::JSONB) AS value
  FROM (VALUES
    ${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.map(
      (identity) => `('${identity.replaceAll("'", "''")}'::TEXT)`,
    ).join(",\n    ")}
  ) AS expected(object_identity)
  INNER JOIN support_relations AS relation_entry
    ON pg_catalog.starts_with(
      expected.object_identity,
      relation_entry.relation_identity || '.'
    )
  INNER JOIN pg_catalog.pg_attribute AS attribute_entry
    ON attribute_entry.attrelid = relation_entry.oid
   AND attribute_entry.attnum > 0
   AND NOT attribute_entry.attisdropped
   AND expected.object_identity = pg_catalog.format(
     '%I."%s"."%s"',
     relation_entry.nspname,
     pg_catalog.replace(relation_entry.relname, '"', '""'),
     pg_catalog.replace(attribute_entry.attname, '"', '""')
   )
),
effective AS (
  SELECT role_entry.rolname AS role_name, role_entry.oid AS role_oid,
    'DATABASE'::TEXT AS object_kind,
    pg_catalog.current_database()::TEXT AS object_identity,
    privilege
  FROM duty_roles AS role_entry
  CROSS JOIN (VALUES ('CONNECT'), ('CREATE'), ('TEMPORARY')) AS candidate(privilege)
  WHERE pg_catalog.has_database_privilege(
    role_entry.oid,
    pg_catalog.current_database(),
    candidate.privilege
  )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'SCHEMA', namespace_entry.nspname,
    candidate.privilege
  FROM duty_roles AS role_entry
  CROSS JOIN pg_catalog.pg_namespace AS namespace_entry
  CROSS JOIN (VALUES ('USAGE'), ('CREATE')) AS candidate(privilege)
  WHERE namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
    AND pg_catalog.has_schema_privilege(
      role_entry.oid, namespace_entry.oid, candidate.privilege
    )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'RELATION',
    namespace_entry.nspname || '."' ||
      pg_catalog.replace(relation_entry.relname, '"', '""') || '"',
    candidate.privilege
  FROM duty_roles AS role_entry
  CROSS JOIN pg_catalog.pg_class AS relation_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  CROSS JOIN (VALUES
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
    ('REFERENCES'), ('TRIGGER')
  ) AS candidate(privilege)
  WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
    AND pg_catalog.has_table_privilege(
      role_entry.oid, relation_entry.oid, candidate.privilege
    )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'SEQUENCE',
    namespace_entry.nspname || '."' ||
      pg_catalog.replace(relation_entry.relname, '"', '""') || '"',
    candidate.privilege
  FROM duty_roles AS role_entry
  CROSS JOIN pg_catalog.pg_class AS relation_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS candidate(privilege)
  WHERE relation_entry.relkind = 'S'
    AND namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
    AND pg_catalog.has_sequence_privilege(
      role_entry.oid, relation_entry.oid, candidate.privilege
    )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'ROUTINE',
    COALESCE(
      expected."identity",
      namespace_entry.nspname || '."' ||
        pg_catalog.replace(routine_entry.proname, '"', '""') || '"(' ||
        pg_catalog.replace(
          pg_catalog.pg_get_function_identity_arguments(routine_entry.oid),
          ', ', ','
        ) || ')'
    ),
    'EXECUTE'
  FROM duty_roles AS role_entry
  CROSS JOIN pg_catalog.pg_proc AS routine_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  LEFT JOIN expected_objects AS expected
    ON expected."kind" = 'ROUTINE'
   AND pg_catalog.to_regprocedure(expected."identity") = routine_entry.oid
  WHERE namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
    AND routine_entry.prokind IN ('f', 'p', 'a', 'w')
    AND pg_catalog.has_function_privilege(
      role_entry.oid, routine_entry.oid, 'EXECUTE'
    )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'COLUMN',
    namespace_entry.nspname || '."' ||
      pg_catalog.replace(relation_entry.relname, '"', '""') || '".' ||
      pg_catalog.quote_ident(attribute.attname), candidate.privilege
  FROM duty_roles AS role_entry
  CROSS JOIN pg_catalog.pg_class AS relation_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  INNER JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation_entry.oid
   AND attribute.attnum > 0 AND NOT attribute.attisdropped
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES'))
    AS candidate(privilege)
  WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
    AND pg_catalog.has_column_privilege(
      role_entry.oid, relation_entry.oid, attribute.attnum, candidate.privilege
    )
    AND NOT pg_catalog.has_table_privilege(
      role_entry.oid, relation_entry.oid, candidate.privilege
    )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'RELATION',
    pg_catalog.format('%I."%s"', relation_entry.nspname,
      pg_catalog.replace(relation_entry.relname, '"', '""')),
    candidate.privilege
  FROM schema_owner_role AS role_entry
  CROSS JOIN support_relations AS relation_entry
  CROSS JOIN (VALUES
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
    ('REFERENCES'), ('TRIGGER')
  ) AS candidate(privilege)
  WHERE pg_catalog.has_table_privilege(
    role_entry.oid, relation_entry.oid, candidate.privilege
  )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'ROUTINE',
    routine_entry.routine_identity, routine_entry.privilege
  FROM schema_owner_role AS role_entry
  CROSS JOIN support_routines AS routine_entry
  WHERE pg_catalog.has_function_privilege(
    role_entry.oid, routine_entry.oid, routine_entry.privilege
  )
  UNION ALL
  SELECT role_entry.rolname, role_entry.oid, 'COLUMN',
    pg_catalog.format('%I."%s"."%s"', relation_entry.nspname,
      pg_catalog.replace(relation_entry.relname, '"', '""'),
      pg_catalog.replace(attribute_entry.attname, '"', '""')),
    candidate.privilege
  FROM schema_owner_role AS role_entry
  CROSS JOIN support_relations AS relation_entry
  INNER JOIN pg_catalog.pg_attribute AS attribute_entry
    ON attribute_entry.attrelid = relation_entry.oid
   AND attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES'))
    AS candidate(privilege)
  WHERE pg_catalog.has_column_privilege(
    role_entry.oid, relation_entry.oid, attribute_entry.attnum,
    candidate.privilege
  )
    AND NOT pg_catalog.has_table_privilege(
      role_entry.oid, relation_entry.oid, candidate.privilege
    )
),
effective_json AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'objectIdentity', object_identity,
      'objectKind', object_kind,
      'privilege', privilege,
      'roleName', role_name,
      'roleOid', role_oid::BIGINT
    ) ORDER BY role_name COLLATE "C", object_kind COLLATE "C",
      object_identity COLLATE "C", privilege COLLATE "C"
  ), '[]'::JSONB) AS value
  FROM effective
),
direct_authority_acl_sources AS (
  SELECT 'DATABASE'::TEXT AS object_kind,
    database_entry.datname::TEXT AS object_identity,
    database_entry.datacl AS acl, database_entry.datdba AS owner_oid,
    'd'::"char" AS acl_kind, false AS system_object
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database()
  UNION ALL
  SELECT 'SCHEMA', pg_catalog.quote_ident(namespace_entry.nspname),
    namespace_entry.nspacl, namespace_entry.nspowner, 'n'::"char",
    namespace_entry.nspname ~ '^pg_' OR
      namespace_entry.nspname = 'information_schema'
  FROM pg_catalog.pg_namespace AS namespace_entry
  UNION ALL
  SELECT CASE WHEN relation_entry.relkind = 'S'
      THEN 'SEQUENCE' ELSE 'RELATION' END,
    pg_catalog.format('%I."%s"', namespace_entry.nspname,
      pg_catalog.replace(relation_entry.relname, '"', '""')),
    relation_entry.relacl, relation_entry.relowner,
    CASE WHEN relation_entry.relkind = 'S'
      THEN 's'::"char" ELSE 'r'::"char" END,
    namespace_entry.nspname ~ '^pg_' OR
      namespace_entry.nspname = 'information_schema'
  FROM pg_catalog.pg_class AS relation_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  UNION ALL
  SELECT 'COLUMN',
    pg_catalog.format('%I."%s"."%s"', namespace_entry.nspname,
      pg_catalog.replace(relation_entry.relname, '"', '""'),
      pg_catalog.replace(attribute_entry.attname, '"', '""')),
    attribute_entry.attacl, relation_entry.relowner, 'c'::"char",
    namespace_entry.nspname ~ '^pg_' OR
      namespace_entry.nspname = 'information_schema'
  FROM pg_catalog.pg_attribute AS attribute_entry
  INNER JOIN pg_catalog.pg_class AS relation_entry
    ON relation_entry.oid = attribute_entry.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
  UNION ALL
  SELECT 'ROUTINE',
    COALESCE(
      expected."identity",
      pg_catalog.format('%I."%s"(%s)', namespace_entry.nspname,
        pg_catalog.replace(routine_entry.proname, '"', '""'),
        pg_catalog.replace(
          pg_catalog.pg_get_function_identity_arguments(routine_entry.oid),
          ', ', ','
        ))
    ),
    routine_entry.proacl, routine_entry.proowner, 'f'::"char",
    namespace_entry.nspname ~ '^pg_' OR
      namespace_entry.nspname = 'information_schema'
  FROM pg_catalog.pg_proc AS routine_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  LEFT JOIN expected_objects AS expected
    ON expected."kind" = 'ROUTINE'
   AND pg_catalog.to_regprocedure(expected."identity") = routine_entry.oid
  UNION ALL
  SELECT 'TYPE',
    pg_catalog.format('%I.%I', namespace_entry.nspname, type_entry.typname),
    type_entry.typacl, type_entry.typowner, 'T'::"char",
    namespace_entry.nspname ~ '^pg_' OR
      namespace_entry.nspname = 'information_schema'
  FROM pg_catalog.pg_type AS type_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  UNION ALL
  SELECT 'LANGUAGE', pg_catalog.quote_ident(language_entry.lanname),
    language_entry.lanacl, language_entry.lanowner, 'l'::"char", true
  FROM pg_catalog.pg_language AS language_entry
  UNION ALL
  SELECT 'FOREIGN_DATA_WRAPPER', pg_catalog.quote_ident(fdw_entry.fdwname),
    fdw_entry.fdwacl, fdw_entry.fdwowner, 'F'::"char", true
  FROM pg_catalog.pg_foreign_data_wrapper AS fdw_entry
  UNION ALL
  SELECT 'FOREIGN_SERVER', pg_catalog.quote_ident(server_entry.srvname),
    server_entry.srvacl, server_entry.srvowner, 'S'::"char", true
  FROM pg_catalog.pg_foreign_server AS server_entry
  UNION ALL
  SELECT 'PARAMETER', parameter_entry.parname,
    parameter_entry.paracl, NULL::OID, NULL::"char", true
  FROM pg_catalog.pg_parameter_acl AS parameter_entry
  UNION ALL
  SELECT 'TABLESPACE', pg_catalog.quote_ident(tablespace_entry.spcname),
    tablespace_entry.spcacl, tablespace_entry.spcowner, 't'::"char", true
  FROM pg_catalog.pg_tablespace AS tablespace_entry
  UNION ALL
  SELECT 'LARGE_OBJECT', large_object.oid::TEXT,
    large_object.lomacl, large_object.lomowner, 'L'::"char", false
  FROM pg_catalog.pg_largeobject_metadata AS large_object
  UNION ALL
  SELECT 'INITIAL_PRIVILEGE',
    pg_catalog.pg_describe_object(initial.classoid, initial.objoid,
      initial.objsubid),
    initial.initprivs, NULL::OID, NULL::"char", true
  FROM pg_catalog.pg_init_privs AS initial
),
direct_authority AS (
  SELECT source.object_kind, source.object_identity,
    CASE WHEN privilege.grantee = 0 THEN 'public' ELSE grantee.rolname END
      AS grantee_name,
    privilege.grantee AS grantee_oid,
    grantor.rolname AS grantor_name,
    privilege.grantor AS grantor_oid,
    privilege.privilege_type AS privilege,
    privilege.is_grantable,
    CASE
      WHEN source.object_kind = 'INITIAL_PRIVILEGE' THEN 'PG_INIT_PRIVS'
      WHEN source.acl IS NULL THEN 'ACL_DEFAULT'
      ELSE 'ACL'
    END AS source
  FROM direct_authority_acl_sources AS source
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    CASE
      WHEN source.acl IS NOT NULL THEN source.acl
      WHEN source.acl_kind IS NOT NULL
        THEN pg_catalog.acldefault(source.acl_kind, source.owner_oid)
      ELSE ARRAY[]::ACLITEM[]
    END
  ) AS privilege
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = privilege.grantee
  LEFT JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = privilege.grantor
  WHERE (
    privilege.grantee IN (SELECT "oid"::OID FROM expected_roles)
    OR (privilege.grantee = 0 AND source.system_object)
    OR (
      source.object_kind = 'COLUMN'
      AND EXISTS (
        SELECT 1
        FROM expected_objects AS protected_relation
        WHERE protected_relation."kind" = 'RELATION'
          AND pg_catalog.starts_with(
            source.object_identity,
            protected_relation."identity" || '.'
          )
      )
    )
  )
    AND (source.owner_oid IS NULL OR privilege.grantee <> source.owner_oid)
),
direct_authorities AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'grantorName', grantor_name,
    'grantorOid', grantor_oid::BIGINT,
    'granteeName', grantee_name,
    'granteeOid', grantee_oid::BIGINT,
    'isGrantable', is_grantable,
    'objectIdentity', object_identity,
    'objectKind', object_kind,
    'privilege', privilege,
    'source', source
  ) ORDER BY grantee_oid, object_kind COLLATE "C", object_identity COLLATE "C",
    privilege COLLATE "C", grantor_oid), '[]'::JSONB) AS value
  FROM direct_authority
),
system_public_rows AS (
  SELECT 'SCHEMA'::TEXT AS kind, namespace_entry.nspname::TEXT AS identity,
    pg_catalog.pg_get_userbyid(acl.grantor) AS grantor_name,
    acl.privilege_type AS privilege, acl.is_grantable AS grantable
  FROM pg_catalog.pg_namespace AS namespace_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    namespace_entry.nspacl,
    pg_catalog.acldefault('n', namespace_entry.nspowner)
  )) AS acl
  WHERE namespace_entry.nspname IN (
    'information_schema', 'pg_catalog', 'pg_toast'
  ) AND acl.grantee = 0::OID
  UNION ALL
  SELECT CASE WHEN relation_entry.relkind = 'S'::"char"
      THEN 'SEQUENCE' ELSE 'RELATION' END,
    pg_catalog.format('%I.%I', namespace_entry.nspname, relation_entry.relname),
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_class AS relation_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    relation_entry.relacl,
    pg_catalog.acldefault(
      CASE WHEN relation_entry.relkind = 'S'::"char"
        THEN 's'::"char" ELSE 'r'::"char" END,
      relation_entry.relowner
    )
  )) AS acl
  WHERE namespace_entry.nspname IN (
    'information_schema', 'pg_catalog', 'pg_toast'
  )
    AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND acl.grantee = 0::OID
  UNION ALL
  SELECT 'ROUTINE', pg_catalog.format(
      '%I.%I(%s)', namespace_entry.nspname, routine_entry.proname,
      pg_catalog.pg_get_function_identity_arguments(routine_entry.oid)
    ),
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_proc AS routine_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    routine_entry.proacl,
    pg_catalog.acldefault('f', routine_entry.proowner)
  )) AS acl
  WHERE namespace_entry.nspname IN (
    'information_schema', 'pg_catalog', 'pg_toast'
  ) AND acl.grantee = 0::OID
  UNION ALL
  SELECT 'TYPE',
    pg_catalog.format('%I.%I', namespace_entry.nspname, type_entry.typname),
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_type AS type_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner)
  )) AS acl
  WHERE namespace_entry.nspname IN (
    'information_schema', 'pg_catalog', 'pg_toast'
  ) AND acl.grantee = 0::OID
  UNION ALL
  SELECT 'LANGUAGE', language_entry.lanname,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_language AS language_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    language_entry.lanacl,
    pg_catalog.acldefault('l', language_entry.lanowner)
  )) AS acl
  WHERE acl.grantee = 0::OID
  UNION ALL
  SELECT 'PARAMETER', parameter_entry.parname,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_parameter_acl AS parameter_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_entry.paracl) AS acl
  WHERE acl.grantee = 0::OID
  UNION ALL
  SELECT 'FOREIGN_DATA_WRAPPER', wrapper_entry.fdwname,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_foreign_data_wrapper AS wrapper_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    wrapper_entry.fdwacl,
    pg_catalog.acldefault('F', wrapper_entry.fdwowner)
  )) AS acl
  WHERE acl.grantee = 0::OID
  UNION ALL
  SELECT 'FOREIGN_SERVER', server_entry.srvname,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_foreign_server AS server_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    server_entry.srvacl,
    pg_catalog.acldefault('S', server_entry.srvowner)
  )) AS acl
  WHERE acl.grantee = 0::OID
  UNION ALL
  SELECT 'TABLESPACE', tablespace_entry.spcname,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_tablespace AS tablespace_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    tablespace_entry.spcacl,
    pg_catalog.acldefault('t', tablespace_entry.spcowner)
  )) AS acl
  WHERE acl.grantee = 0::OID
  UNION ALL
  SELECT 'LARGE_OBJECT', large_object.oid::TEXT,
    pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
    acl.is_grantable
  FROM pg_catalog.pg_largeobject_metadata AS large_object
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
    large_object.lomacl,
    pg_catalog.acldefault('L', large_object.lomowner)
  )) AS acl
  WHERE acl.grantee = 0::OID
),
system_public_acl_baseline AS (
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '${IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_DIGEST_DOMAIN}\n' ||
    COALESCE(pg_catalog.string_agg(
      kind || '|' || identity || '|' || grantor_name || '|' || privilege ||
        '|' || grantable::TEXT,
      E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C",
        grantor_name COLLATE "C", privilege COLLATE "C", grantable
    ), '') || E'\n',
    'UTF8'
  )), 'hex') AS digest
  FROM system_public_rows
),
duty_routines AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'language', language_entry.lanname,
      'oid', routine_entry.oid::BIGINT,
      'ownerName', owner_role.rolname,
      'ownerOid', owner_role.oid::BIGINT,
      'parallelSafety', routine_entry.proparallel,
      'returnType', pg_catalog.format_type(routine_entry.prorettype, NULL),
      'searchPath', CASE
        WHEN routine_entry.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
          THEN 'pg_catalog'
        ELSE COALESCE(pg_catalog.array_to_string(routine_entry.proconfig, ','), '')
      END,
      'securityDefiner', routine_entry.prosecdef,
      'signature', expected."identity",
      'volatility', routine_entry.provolatile
    ) ORDER BY expected."identity" COLLATE "C"
  ), '[]'::JSONB) AS value
  FROM expected_objects AS expected
  INNER JOIN pg_catalog.pg_proc AS routine_entry
    ON expected."kind" = 'ROUTINE'
   AND routine_entry.oid = pg_catalog.to_regprocedure(expected."identity")
  INNER JOIN pg_catalog.pg_language AS language_entry
    ON language_entry.oid = routine_entry.prolang
  INNER JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine_entry.proowner
  WHERE expected."identity" IN (${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.map(
    (signature) => `'${signature.replaceAll("'", "''")}'`,
  ).join(", ")})
),
user_routine_inventory_rows AS MATERIALIZED (
  SELECT routine_entry.oid,
    (pg_catalog.to_jsonb(routine_entry) - 'proacl' - 'proowner') ||
      pg_catalog.jsonb_build_object(
        'aggregateDefinition', CASE
          WHEN aggregate_entry.aggfnoid IS NULL THEN NULL::JSONB
          ELSE pg_catalog.to_jsonb(aggregate_entry)
        END,
        'ownerBinding', CASE
          WHEN EXISTS (
            SELECT 1
            FROM expected_objects AS expected
            WHERE expected."kind" = 'ROUTINE'
              AND pg_catalog.to_regprocedure(expected."identity") =
                routine_entry.oid
          ) THEN NULL::BIGINT
          ELSE routine_entry.proowner::BIGINT
        END
      ) AS definition
  FROM pg_catalog.pg_proc AS routine_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  LEFT JOIN pg_catalog.pg_aggregate AS aggregate_entry
    ON aggregate_entry.aggfnoid = routine_entry.oid
  WHERE namespace_entry.nspname !~ '^pg_'
    AND namespace_entry.nspname <> 'information_schema'
),
user_routine_definition_inventory AS MATERIALIZED (
  SELECT pg_catalog.count(*)::INTEGER AS count,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      '${IDENTITY_MAIL_DUTY_ROLE_USER_ROUTINE_DEFINITION_CURRENT186_DIGEST_DOMAIN}\n' ||
      COALESCE(pg_catalog.string_agg(
        routine.oid::TEXT || '|' || routine.definition::TEXT,
        E'\n' ORDER BY routine.oid
      ), '') || E'\n',
      'UTF8'
    )), 'hex') AS digest
  FROM user_routine_inventory_rows AS routine
),
public_routine_acls AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'grantorName', grantor_role.rolname,
      'grantorOid', privilege.grantor::BIGINT,
      'isGrantable', privilege.is_grantable,
      'oid', routine_entry.oid::BIGINT,
      'ownerName', owner_role.rolname,
      'ownerOid', owner_role.oid::BIGINT,
      'routineKind', routine_entry.prokind,
      'signature', pg_catalog.quote_ident(namespace_entry.nspname) || '."' ||
        pg_catalog.replace(routine_entry.proname, '"', '""') || '"(' ||
        pg_catalog.replace(
          pg_catalog.pg_get_function_identity_arguments(routine_entry.oid),
          ', ', ','
        ) || ')'
    ) ORDER BY routine_entry.oid
  ), '[]'::JSONB) AS value
  FROM pg_catalog.pg_proc AS routine_entry
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  INNER JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.oid = routine_entry.proowner
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine_entry.proacl,
      pg_catalog.acldefault('f'::"char", routine_entry.proowner)
    )
  ) AS privilege
  INNER JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = privilege.grantor
  WHERE privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE'
    AND routine_entry.prokind IN ('f', 'p', 'a', 'w')
    AND namespace_entry.nspname !~ '^pg_'
    AND namespace_entry.nspname <> 'information_schema'
    AND NOT EXISTS (
      SELECT 1
      FROM expected_objects AS expected
      WHERE expected."kind" = 'ROUTINE'
        AND pg_catalog.to_regprocedure(expected."identity") = routine_entry.oid
    )
),
protected_relations AS (
  SELECT expected."identity", relation_entry.oid,
    namespace_entry.nspname AS schema_name,
    relation_entry.relname AS relation_name
  FROM expected_objects AS expected
  INNER JOIN pg_catalog.pg_class AS relation_entry
    ON expected."kind" = 'RELATION'
   AND relation_entry.oid = pg_catalog.to_regclass(expected."identity")
  INNER JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE expected."identity" IN (${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS.map(
    (identity) => `'${identity.replaceAll("'", "''")}'`,
  ).join(", ")})
),
definition_source AS MATERIALIZED (
  SELECT 'ROUTINE'::TEXT AS kind,
    pg_catalog.replace(expected."identity", '"', '') AS identity,
    pg_catalog.pg_get_functiondef(routine_entry.oid) AS definition
  FROM expected_objects AS expected
  INNER JOIN pg_catalog.pg_proc AS routine_entry
    ON expected."kind" = 'ROUTINE'
   AND routine_entry.oid = pg_catalog.to_regprocedure(expected."identity")
  CROSS JOIN deparse_context
  WHERE deparse_context.fixed_search_path = 'pg_catalog'
  UNION ALL
  SELECT 'TRIGGER',
    pg_catalog.format('%I.%I::%I', protected.schema_name,
      protected.relation_name, trigger_entry.tgname),
    trigger_entry.tgenabled::TEXT || '|' ||
      pg_catalog.pg_get_triggerdef(trigger_entry.oid, false)
  FROM protected_relations AS protected
  INNER JOIN pg_catalog.pg_trigger AS trigger_entry
    ON trigger_entry.tgrelid = protected.oid
  CROSS JOIN deparse_context
  WHERE deparse_context.fixed_search_path = 'pg_catalog'
    AND NOT trigger_entry.tgisinternal
  UNION ALL
  SELECT 'CONSTRAINT',
    pg_catalog.format('%I.%I::%I', protected.schema_name,
      protected.relation_name, constraint_entry.conname),
    constraint_entry.contype::TEXT || '|' ||
      constraint_entry.condeferrable::TEXT || '|' ||
      constraint_entry.condeferred::TEXT || '|' ||
      constraint_entry.convalidated::TEXT || '|' ||
      pg_catalog.pg_get_constraintdef(constraint_entry.oid, false)
  FROM protected_relations AS protected
  INNER JOIN pg_catalog.pg_constraint AS constraint_entry
    ON constraint_entry.conrelid = protected.oid
  CROSS JOIN deparse_context
  WHERE deparse_context.fixed_search_path = 'pg_catalog'
    AND constraint_entry.conname <>
    '${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_CHECK_CONSTRAINT}'
  UNION ALL
  SELECT 'INDEX',
    pg_catalog.format('%I.%I::%I', protected.schema_name,
      protected.relation_name, index_relation.relname),
    index_entry.indisunique::TEXT || '|' ||
      index_entry.indisprimary::TEXT || '|' ||
      index_entry.indisexclusion::TEXT || '|' ||
      index_entry.indimmediate::TEXT || '|' ||
      index_entry.indisvalid::TEXT || '|' ||
      index_entry.indisready::TEXT || '|' ||
      index_entry.indislive::TEXT || '|' ||
      index_entry.indisreplident::TEXT || '|' ||
      pg_catalog.pg_get_indexdef(index_entry.indexrelid, 0, false)
  FROM protected_relations AS protected
  INNER JOIN pg_catalog.pg_index AS index_entry
    ON index_entry.indrelid = protected.oid
  INNER JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_entry.indexrelid
  CROSS JOIN deparse_context
  WHERE deparse_context.fixed_search_path = 'pg_catalog'
),
definition_rows AS (
  SELECT kind, identity,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(definition, 'UTF8')),
      'hex'
    ) AS definition_sha256
  FROM definition_source
),
definition_manifest AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'definitionSha256', definition_sha256,
      'identity', identity,
      'kind', kind
    ) ORDER BY kind COLLATE "C", identity COLLATE "C"
  ), '[]'::JSONB) AS value,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '${IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_DIGEST_DOMAIN}\n' ||
    COALESCE(pg_catalog.string_agg(
      kind || '|' || identity || '|' || definition_sha256,
      E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C"
    ), '') || E'\n',
    'UTF8'
  )), 'hex') AS digest
  FROM definition_rows
),
memberships AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'memberName', member_role.rolname,
    'memberOid', membership.member::BIGINT,
    'roleName', granted_role.rolname,
    'roleOid', membership.roleid::BIGINT,
    'adminOption', membership.admin_option
  ) ORDER BY membership.roleid, membership.member,
    membership.admin_option), '[]'::JSONB) AS value
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
  WHERE membership.member IN (SELECT "oid"::OID FROM expected_roles)
     OR membership.roleid IN (SELECT "oid"::OID FROM expected_roles)
),
settings AS (
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'databaseOid', setting.setdatabase::BIGINT,
      'roleOid', setting.setrole::BIGINT,
      'settings', setting.setconfig
    ) ORDER BY setting.setrole, setting.setdatabase,
      setting.setconfig::TEXT COLLATE "C")
      FILTER (WHERE setting.setdatabase = 0), '[]'::JSONB) AS role_value,
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'databaseOid', setting.setdatabase::BIGINT,
      'roleOid', setting.setrole::BIGINT,
      'settings', setting.setconfig
    ) ORDER BY setting.setrole, setting.setdatabase,
      setting.setconfig::TEXT COLLATE "C")
      FILTER (WHERE setting.setdatabase <> 0), '[]'::JSONB) AS database_value
  FROM pg_catalog.pg_db_role_setting AS setting
  WHERE setting.setrole IN (SELECT "oid"::OID FROM expected_roles)
),
default_acls AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'namespaceOid', default_acl.defaclnamespace::BIGINT,
    'objectKind', default_acl.defaclobjtype,
    'ownerOid', default_acl.defaclrole::BIGINT,
    'acl', default_acl.defaclacl::TEXT
  ) ORDER BY default_acl.defaclrole, default_acl.defaclnamespace,
    default_acl.defaclobjtype::TEXT COLLATE "C",
    default_acl.defaclacl::TEXT COLLATE "C"), '[]'::JSONB) AS value
  FROM pg_catalog.pg_default_acl AS default_acl
  WHERE default_acl.defaclrole IN (SELECT "oid"::OID FROM expected_roles)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(default_acl.defaclacl) AS default_privilege
       WHERE default_privilege.grantee IN (
         SELECT "oid"::OID FROM expected_roles
       )
     )
),
allowed_control_relations AS (
  SELECT pg_catalog.to_regclass(expected."identity") AS oid
  FROM expected_objects AS expected
  WHERE expected."kind" = 'RELATION'
    AND expected."identity" IN (${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS.map(
      (identity) => `'${identity.replaceAll("'", "''")}'`,
    ).join(", ")})
),
allowed_owned_classes AS (
  SELECT oid FROM allowed_control_relations WHERE oid IS NOT NULL
  UNION
  SELECT index_entry.indexrelid
  FROM pg_catalog.pg_index AS index_entry
  WHERE index_entry.indrelid IN (SELECT oid FROM allowed_control_relations)
  UNION
  SELECT relation_entry.reltoastrelid
  FROM pg_catalog.pg_class AS relation_entry
  WHERE relation_entry.oid IN (SELECT oid FROM allowed_control_relations)
    AND relation_entry.reltoastrelid <> 0::OID
  UNION
  SELECT index_entry.indexrelid
  FROM pg_catalog.pg_index AS index_entry
  WHERE index_entry.indrelid IN (
    SELECT relation_entry.reltoastrelid
    FROM pg_catalog.pg_class AS relation_entry
    WHERE relation_entry.oid IN (SELECT oid FROM allowed_control_relations)
      AND relation_entry.reltoastrelid <> 0::OID
  )
),
allowed_owned_types AS (
  SELECT relation_entry.reltype AS oid
  FROM pg_catalog.pg_class AS relation_entry
  WHERE relation_entry.oid IN (SELECT oid FROM allowed_control_relations)
    AND relation_entry.reltype <> 0::OID
  UNION
  SELECT type_entry.typarray
  FROM pg_catalog.pg_type AS type_entry
  WHERE type_entry.oid IN (
    SELECT relation_entry.reltype
    FROM pg_catalog.pg_class AS relation_entry
    WHERE relation_entry.oid IN (SELECT oid FROM allowed_control_relations)
      AND relation_entry.reltype <> 0::OID
  ) AND type_entry.typarray <> 0::OID
),
owned AS (
  SELECT 'DATABASE'::TEXT AS kind,
    pg_catalog.quote_ident(database_entry.datname) AS identity,
    database_entry.oid AS object_oid, database_entry.datdba AS owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datdba IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'SCHEMA', pg_catalog.quote_ident(namespace_entry.nspname),
    namespace_entry.oid, namespace_entry.nspowner
  FROM pg_catalog.pg_namespace AS namespace_entry
  WHERE namespace_entry.nspowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'CLASS',
    pg_catalog.format('%I.%I', namespace_entry.nspname, relation_entry.relname),
    relation_entry.oid, relation_entry.relowner
  FROM pg_catalog.pg_class AS relation_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE relation_entry.relowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'ROUTINE', COALESCE(
      expected."identity",
      pg_catalog.format('%I.%I(%s)', namespace_entry.nspname,
        routine_entry.proname,
        pg_catalog.replace(
          pg_catalog.pg_get_function_identity_arguments(routine_entry.oid),
          ', ', ','
        ))
    ),
    routine_entry.oid, routine_entry.proowner
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  LEFT JOIN expected_objects AS expected
    ON expected."kind" = 'ROUTINE'
   AND pg_catalog.to_regprocedure(expected."identity") = routine_entry.oid
  WHERE routine_entry.proowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'TYPE',
    pg_catalog.format('%I.%I', namespace_entry.nspname, type_entry.typname),
    type_entry.oid, type_entry.typowner
  FROM pg_catalog.pg_type AS type_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  WHERE type_entry.typowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'LANGUAGE', pg_catalog.quote_ident(language_entry.lanname),
    language_entry.oid, language_entry.lanowner
  FROM pg_catalog.pg_language AS language_entry
  WHERE language_entry.lanowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'FOREIGN_DATA_WRAPPER', pg_catalog.quote_ident(wrapper_entry.fdwname),
    wrapper_entry.oid, wrapper_entry.fdwowner
  FROM pg_catalog.pg_foreign_data_wrapper AS wrapper_entry
  WHERE wrapper_entry.fdwowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'FOREIGN_SERVER', pg_catalog.quote_ident(server_entry.srvname),
    server_entry.oid, server_entry.srvowner
  FROM pg_catalog.pg_foreign_server AS server_entry
  WHERE server_entry.srvowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'TABLESPACE', pg_catalog.quote_ident(tablespace_entry.spcname),
    tablespace_entry.oid, tablespace_entry.spcowner
  FROM pg_catalog.pg_tablespace AS tablespace_entry
  WHERE tablespace_entry.spcowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'LARGE_OBJECT', large_object.oid::TEXT,
    large_object.oid, large_object.lomowner
  FROM pg_catalog.pg_largeobject_metadata AS large_object
  WHERE large_object.lomowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'EXTENSION', pg_catalog.quote_ident(extension_entry.extname),
    extension_entry.oid, extension_entry.extowner
  FROM pg_catalog.pg_extension AS extension_entry
  WHERE extension_entry.extowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'COLLATION', 'oid:' || collation_entry.oid::TEXT,
    collation_entry.oid, collation_entry.collowner
  FROM pg_catalog.pg_collation AS collation_entry
  WHERE collation_entry.collowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'CONVERSION', 'oid:' || conversion_entry.oid::TEXT,
    conversion_entry.oid, conversion_entry.conowner
  FROM pg_catalog.pg_conversion AS conversion_entry
  WHERE conversion_entry.conowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'OPERATOR', 'oid:' || operator_entry.oid::TEXT,
    operator_entry.oid, operator_entry.oprowner
  FROM pg_catalog.pg_operator AS operator_entry
  WHERE operator_entry.oprowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'OPERATOR_CLASS', 'oid:' || operator_class.oid::TEXT,
    operator_class.oid, operator_class.opcowner
  FROM pg_catalog.pg_opclass AS operator_class
  WHERE operator_class.opcowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'OPERATOR_FAMILY', 'oid:' || operator_family.oid::TEXT,
    operator_family.oid, operator_family.opfowner
  FROM pg_catalog.pg_opfamily AS operator_family
  WHERE operator_family.opfowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'TEXT_SEARCH_CONFIGURATION', 'oid:' || configuration_entry.oid::TEXT,
    configuration_entry.oid, configuration_entry.cfgowner
  FROM pg_catalog.pg_ts_config AS configuration_entry
  WHERE configuration_entry.cfgowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'TEXT_SEARCH_DICTIONARY', 'oid:' || dictionary_entry.oid::TEXT,
    dictionary_entry.oid, dictionary_entry.dictowner
  FROM pg_catalog.pg_ts_dict AS dictionary_entry
  WHERE dictionary_entry.dictowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'STATISTICS', 'oid:' || statistics_entry.oid::TEXT,
    statistics_entry.oid, statistics_entry.stxowner
  FROM pg_catalog.pg_statistic_ext AS statistics_entry
  WHERE statistics_entry.stxowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'EVENT_TRIGGER', 'oid:' || event_trigger_entry.oid::TEXT,
    event_trigger_entry.oid, event_trigger_entry.evtowner
  FROM pg_catalog.pg_event_trigger AS event_trigger_entry
  WHERE event_trigger_entry.evtowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'PUBLICATION', 'oid:' || publication_entry.oid::TEXT,
    publication_entry.oid, publication_entry.pubowner
  FROM pg_catalog.pg_publication AS publication_entry
  WHERE publication_entry.pubowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'SUBSCRIPTION', 'oid:' || subscription_entry.oid::TEXT,
    subscription_entry.oid, subscription_entry.subowner
  FROM pg_catalog.pg_subscription AS subscription_entry
  WHERE subscription_entry.subowner IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'USER_MAPPING', 'oid:' || mapping_entry.umid::TEXT,
    mapping_entry.umid, mapping_entry.umuser
  FROM pg_catalog.pg_user_mappings AS mapping_entry
  WHERE mapping_entry.umuser IN (SELECT "oid"::OID FROM expected_roles)
  UNION ALL
  SELECT 'PREPARED_TRANSACTION',
    'gid_hex:' || pg_catalog.encode(
      pg_catalog.convert_to(prepared_entry.gid, 'UTF8'), 'hex'
    ), NULL::OID, owner_role.oid
  FROM pg_catalog.pg_prepared_xacts AS prepared_entry
  INNER JOIN pg_catalog.pg_roles AS owner_role
    ON owner_role.rolname = prepared_entry.owner
  WHERE prepared_entry.database = pg_catalog.current_database()
    AND owner_role.oid IN (SELECT "oid"::OID FROM expected_roles)
),
unexpected_owned AS (
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'identity', owned.identity,
    'kind', owned.kind,
    'oid', owned.object_oid::BIGINT,
    'ownerName', pg_catalog.pg_get_userbyid(owned.owner_oid),
    'ownerOid', owned.owner_oid::BIGINT
  ) ORDER BY owned.kind COLLATE "C", owned.identity COLLATE "C",
    owned.object_oid), '[]'::JSONB) AS value
  FROM owned
  WHERE NOT (
    owned.owner_oid = (
      SELECT "oid"::OID FROM expected_roles WHERE "roleKey" = 'schemaOwner'
    ) AND (
      (owned.kind = 'SCHEMA' AND owned.object_oid =
        pg_catalog.to_regnamespace('public'))
      OR (owned.kind = 'CLASS' AND owned.object_oid IN
        (SELECT oid FROM allowed_owned_classes))
      OR (owned.kind = 'ROUTINE' AND owned.object_oid IN (
        SELECT pg_catalog.to_regprocedure(expected."identity")
        FROM expected_objects AS expected
        WHERE expected."kind" = 'ROUTINE'
      ))
      OR (owned.kind = 'TYPE' AND owned.object_oid IN
        (SELECT oid FROM allowed_owned_types))
    )
  )
),
database_context AS (
  SELECT pg_catalog.jsonb_build_object(
    'currentUserName', current_role_entry.rolname,
    'currentUserOid', current_role_entry.oid::BIGINT,
    'identityDigest', (SELECT config->>'databaseIdentityDigest' FROM input),
    'name', database_entry.datname,
    'oid', database_entry.oid::BIGINT,
    'ownerName', owner_role.rolname,
    'ownerOid', owner_role.oid::BIGINT,
    'ownerSuperuser', owner_role.rolsuper,
    'sessionUserName', session_role.rolname,
    'sessionUserOid', session_role.oid::BIGINT
  ) AS value
  FROM pg_catalog.pg_database AS database_entry
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = database_entry.datdba
  JOIN pg_catalog.pg_roles AS session_role
    ON session_role.rolname = SESSION_USER
  JOIN pg_catalog.pg_roles AS current_role_entry
    ON current_role_entry.rolname = CURRENT_USER
  WHERE database_entry.datname = pg_catalog.current_database()
),
catalog_payload AS MATERIALIZED (
  SELECT pg_catalog.jsonb_build_object(
    'database', (SELECT value FROM database_context),
    'databaseRoleSettings', (SELECT database_value FROM settings),
    'defaultAcls', (SELECT value FROM default_acls),
    'definitionManifest', (SELECT value FROM definition_manifest),
    'definitionManifestDigest', (SELECT digest FROM definition_manifest),
    'directAuthorities', (SELECT value FROM direct_authorities),
    'dutyRoutines', (SELECT value FROM duty_routines),
    'effectivePrivileges', (SELECT value FROM effective_json),
    'memberships', (SELECT value FROM memberships),
    'objects', (SELECT value FROM objects),
    'profile', '${IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE}',
    'publicRoutineAcls', (SELECT value FROM public_routine_acls),
    'roles', (SELECT value FROM roles),
    'roleSettings', (SELECT role_value FROM settings),
    'schemaVersion', ${IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SCHEMA_VERSION},
    'supportColumnBindings', (SELECT value FROM support_column_bindings),
    'systemPublicAclBaselineDigest',
      (SELECT digest FROM system_public_acl_baseline),
    'unexpectedOwnedObjects', (SELECT value FROM unexpected_owned),
    'userRoutineDefinitionCount',
      (SELECT count FROM user_routine_definition_inventory),
    'userRoutineDefinitionDigest',
      (SELECT digest FROM user_routine_definition_inventory)
  ) AS catalog
),
restore_context AS MATERIALIZED (
  SELECT pg_catalog.set_config(
    'search_path', ambient_context.ambient_search_path, true
  ) AS restored_search_path
  FROM ambient_context
  CROSS JOIN catalog_payload
)
SELECT catalog_payload.catalog AS "catalog"
FROM catalog_payload
CROSS JOIN restore_context
WHERE restore_context.restored_search_path IS NOT NULL
`.trim();

function fail(reasonCode) {
  throw new IdentityMailDutyRoleCatalogCurrent186Error(reasonCode);
}

function compareCanonical(left, right) {
  const leftValue = canonicalStringify(left);
  const rightValue = canonicalStringify(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function dataRecord(value, expectedKeys, reasonCode) {
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

function dataArray(value, reasonCode, maximum = MAX_ROWS) {
  let invalid;
  let descriptors;
  let prototype;
  try {
    invalid = !Array.isArray(value) || utilTypes.isProxy(value);
    if (!invalid) {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    }
  } catch {
    fail(reasonCode);
  }
  if (invalid || prototype !== Array.prototype) fail(reasonCode);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
    fail(reasonCode);
  }
  const indexes = keys.filter((key) => key !== "length").sort();
  const expected = Array.from({ length }, (_, index) => String(index)).sort();
  if (
    indexes.length !== expected.length ||
    indexes.some((key, index) => key !== expected[index]) ||
    indexes.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode);
  }
  return indexes.map((key) => descriptors[key].value);
}

function validOid(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_OID;
}

function validRoleName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 63 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n${canonicalStringify(value)}\n`, "utf8")
    .digest("hex");
}

export function identityMailDutyRoleDefinitionManifestCurrent186Digest(value) {
  const rows = dataArray(
    value,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFINITION_MANIFEST_INVALID",
  )
    .map(normalizeDefinitionManifestEntry)
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
      if (left.identity !== right.identity) {
        return left.identity < right.identity ? -1 : 1;
      }
      return left.definitionSha256 < right.definitionSha256
        ? -1
        : left.definitionSha256 > right.definitionSha256
          ? 1
          : 0;
    });
  const body = rows
    .map((entry) => `${entry.kind}|${entry.identity}|${entry.definitionSha256}`)
    .join("\n");
  return createHash("sha256")
    .update(
      `${IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_DIGEST_DOMAIN}\n${body}\n`,
      "utf8",
    )
    .digest("hex");
}

function normalizeDatabase(value) {
  const database = dataRecord(
    value,
    DATABASE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DATABASE_INVALID",
  );
  if (
    typeof database.name !== "string" ||
    !DATABASE_NAME_PATTERN.test(database.name) ||
    !validOid(database.oid) ||
    !validRoleName(database.ownerName) ||
    !validOid(database.ownerOid) ||
    database.ownerSuperuser !== true ||
    database.sessionUserName !== database.ownerName ||
    database.sessionUserOid !== database.ownerOid ||
    database.currentUserName !== database.ownerName ||
    database.currentUserOid !== database.ownerOid ||
    typeof database.identityDigest !== "string" ||
    !SHA256_PATTERN.test(database.identityDigest)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DATABASE_INVALID");
  }
  return Object.freeze({ ...database });
}

function normalizeRole(value, key) {
  const role = dataRecord(
    value,
    ROLE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_INVALID",
  );
  if (
    role.name !== IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES[key] ||
    !validOid(role.oid) ||
    typeof role.canLogin !== "boolean" ||
    (key === "schemaOwner" && role.canLogin !== false) ||
    role.inherit !== false ||
    role.superuser !== false ||
    role.createRole !== false ||
    role.createDatabase !== false ||
    role.replication !== false ||
    role.bypassRls !== false ||
    role.connectionLimit !== -1 ||
    role.validUntil !== null
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_INVALID");
  }
  return Object.freeze({ ...role });
}

function normalRuntimeRole(role, key) {
  return Object.freeze({
    ...role,
    canLogin: key !== "schemaOwner",
  });
}

function normalizeRoles(value, database) {
  const roles = dataRecord(
    value,
    Object.keys(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES).sort(),
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_INVALID",
  );
  const result = Object.freeze({
    coordinator: normalizeRole(roles.coordinator, "coordinator"),
    schemaOwner: normalizeRole(roles.schemaOwner, "schemaOwner"),
    worker: normalizeRole(roles.worker, "worker"),
  });
  const values = Object.values(result);
  if (
    new Set(values.map((role) => role.oid)).size !== 3 ||
    values.some(
      (role) =>
        role.oid === database.ownerOid || role.name === database.ownerName,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_TOPOLOGY_INVALID");
  }
  return result;
}

function normalizeAcl(value) {
  const acl = dataRecord(
    value,
    ACL_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ACL_INVALID",
  );
  if (
    !validRoleName(acl.grantorName) ||
    !validOid(acl.grantorOid) ||
    (acl.granteeName !== "public" && !validRoleName(acl.granteeName)) ||
    (acl.granteeName === "public"
      ? acl.granteeOid !== 0
      : !validOid(acl.granteeOid)) ||
    typeof acl.privilege !== "string" ||
    !/^[A-Z ]{3,24}$/u.test(acl.privilege) ||
    typeof acl.isGrantable !== "boolean"
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ACL_INVALID");
  }
  return Object.freeze({ ...acl });
}

function normalizeObject(value) {
  const object = dataRecord(
    value,
    OBJECT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID",
  );
  if (
    !["DATABASE", "RELATION", "ROUTINE", "SCHEMA"].includes(object.kind) ||
    typeof object.identity !== "string" ||
    object.identity.length === 0 ||
    !validOid(object.oid) ||
    !validRoleName(object.ownerName) ||
    !validOid(object.ownerOid)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID");
  }
  const acls = dataArray(
    object.acls,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ACL_INVALID",
    64,
  )
    .map(normalizeAcl)
    .sort(compareCanonical);
  if (
    new Set(acls.map((entry) => canonicalStringify(entry))).size !== acls.length
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ACL_INVALID");
  }
  return Object.freeze({ ...object, acls: Object.freeze(acls) });
}

function normalizeEffective(value) {
  const entry = dataRecord(
    value,
    EFFECTIVE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EFFECTIVE_INVALID",
  );
  if (
    ![
      "COLUMN",
      "DATABASE",
      "RELATION",
      "ROUTINE",
      "SCHEMA",
      "SEQUENCE",
    ].includes(entry.objectKind) ||
    typeof entry.objectIdentity !== "string" ||
    entry.objectIdentity.length === 0 ||
    !validRoleName(entry.roleName) ||
    !validOid(entry.roleOid) ||
    typeof entry.privilege !== "string" ||
    !/^[A-Z ]{3,24}$/u.test(entry.privilege)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EFFECTIVE_INVALID");
  }
  return Object.freeze({ ...entry });
}

function normalizeDutyRoutine(value) {
  const routine = dataRecord(
    value,
    DUTY_ROUTINE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DUTY_ROUTINE_INVALID",
  );
  if (
    !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.includes(
      routine.signature,
    ) ||
    !validOid(routine.oid) ||
    !validRoleName(routine.ownerName) ||
    !validOid(routine.ownerOid) ||
    typeof routine.securityDefiner !== "boolean" ||
    typeof routine.volatility !== "string" ||
    !/^[a-z]$/u.test(routine.volatility) ||
    typeof routine.parallelSafety !== "string" ||
    !/^[a-z]$/u.test(routine.parallelSafety) ||
    typeof routine.language !== "string" ||
    routine.language.length === 0 ||
    typeof routine.returnType !== "string" ||
    routine.returnType.length === 0 ||
    typeof routine.searchPath !== "string"
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DUTY_ROUTINE_INVALID");
  }
  return Object.freeze({ ...routine });
}

function normalizePublicRoutineAcl(value) {
  const entry = dataRecord(
    value,
    PUBLIC_ROUTINE_ACL_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PUBLIC_ROUTINE_ACL_INVALID",
  );
  if (
    typeof entry.signature !== "string" ||
    entry.signature.length === 0 ||
    !PUBLIC_ROUTINE_SIGNATURE_PATTERN.test(entry.signature) ||
    !validOid(entry.oid) ||
    !validRoleName(entry.ownerName) ||
    !validOid(entry.ownerOid) ||
    !validRoleName(entry.grantorName) ||
    !validOid(entry.grantorOid) ||
    typeof entry.routineKind !== "string" ||
    !["a", "f", "p", "w"].includes(entry.routineKind) ||
    typeof entry.isGrantable !== "boolean"
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PUBLIC_ROUTINE_ACL_INVALID",
    );
  }
  return Object.freeze({ ...entry });
}

function normalizeDefinitionManifestEntry(value) {
  const entry = dataRecord(
    value,
    DEFINITION_MANIFEST_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFINITION_MANIFEST_INVALID",
  );
  if (
    !["CONSTRAINT", "INDEX", "ROUTINE", "TRIGGER"].includes(entry.kind) ||
    typeof entry.identity !== "string" ||
    entry.identity.length === 0 ||
    Buffer.byteLength(entry.identity, "utf8") > 1_024 ||
    /[\u0000-\u001f\u007f]/u.test(entry.identity) ||
    !SHA256_PATTERN.test(entry.definitionSha256)
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFINITION_MANIFEST_INVALID",
    );
  }
  return Object.freeze({ ...entry });
}

function normalizeDirectAuthority(value) {
  const entry = dataRecord(
    value,
    DIRECT_AUTHORITY_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIRECT_AUTHORITY_INVALID",
  );
  if (
    ![
      "COLUMN",
      "DATABASE",
      "FOREIGN_DATA_WRAPPER",
      "FOREIGN_SERVER",
      "INITIAL_PRIVILEGE",
      "LANGUAGE",
      "LARGE_OBJECT",
      "PARAMETER",
      "RELATION",
      "ROUTINE",
      "SCHEMA",
      "SEQUENCE",
      "TABLESPACE",
      "TYPE",
    ].includes(entry.objectKind) ||
    typeof entry.objectIdentity !== "string" ||
    entry.objectIdentity.length === 0 ||
    Buffer.byteLength(entry.objectIdentity, "utf8") > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(entry.objectIdentity) ||
    !validRoleName(entry.grantorName) ||
    !validOid(entry.grantorOid) ||
    (entry.granteeName !== "public" && !validRoleName(entry.granteeName)) ||
    (entry.granteeName === "public"
      ? entry.granteeOid !== 0
      : !validOid(entry.granteeOid)) ||
    typeof entry.privilege !== "string" ||
    !/^[A-Z ]{2,32}$/u.test(entry.privilege) ||
    typeof entry.isGrantable !== "boolean" ||
    !["ACL", "ACL_DEFAULT", "PG_INIT_PRIVS"].includes(entry.source)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIRECT_AUTHORITY_INVALID");
  }
  return Object.freeze({ ...entry });
}

function normalizeSupportColumnBinding(value) {
  const entry = dataRecord(
    value,
    SUPPORT_COLUMN_BINDING_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SUPPORT_COLUMN_BINDING_INVALID",
  );
  if (
    !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET.has(
      entry.objectIdentity,
    ) ||
    !validOid(entry.relationOid) ||
    !Number.isInteger(entry.attributeNumber) ||
    entry.attributeNumber < 1 ||
    entry.attributeNumber > MAX_ATTRIBUTE_NUMBER
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SUPPORT_COLUMN_BINDING_INVALID",
    );
  }
  return Object.freeze({ ...entry });
}

function normalizeUnexpectedOwnedObject(value) {
  const entry = dataRecord(
    value,
    UNEXPECTED_OWNED_OBJECT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OWNERSHIP_INVALID",
  );
  if (
    ![
      "CLASS",
      "COLLATION",
      "CONVERSION",
      "DATABASE",
      "EVENT_TRIGGER",
      "EXTENSION",
      "FOREIGN_DATA_WRAPPER",
      "FOREIGN_SERVER",
      "LANGUAGE",
      "LARGE_OBJECT",
      "OPERATOR",
      "OPERATOR_CLASS",
      "OPERATOR_FAMILY",
      "PREPARED_TRANSACTION",
      "PUBLICATION",
      "ROUTINE",
      "SCHEMA",
      "STATISTICS",
      "SUBSCRIPTION",
      "TABLESPACE",
      "TEXT_SEARCH_CONFIGURATION",
      "TEXT_SEARCH_DICTIONARY",
      "TYPE",
      "USER_MAPPING",
    ].includes(entry.kind) ||
    typeof entry.identity !== "string" ||
    entry.identity.length === 0 ||
    Buffer.byteLength(entry.identity, "utf8") > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(entry.identity) ||
    (entry.kind === "PREPARED_TRANSACTION"
      ? entry.oid !== null || !/^gid_hex:[0-9a-f]{0,400}$/u.test(entry.identity)
      : !validOid(entry.oid)) ||
    !validRoleName(entry.ownerName) ||
    !validOid(entry.ownerOid)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OWNERSHIP_INVALID");
  }
  return Object.freeze({ ...entry });
}

function normalizeJsonData(value, reasonCode, depth = 0) {
  if (depth > 12) fail(reasonCode);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(reasonCode);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      dataArray(value, reasonCode, 256).map((entry) =>
        normalizeJsonData(entry, reasonCode, depth + 1),
      ),
    );
  }
  let invalid;
  let descriptors;
  let prototype;
  try {
    invalid =
      value === null || typeof value !== "object" || utilTypes.isProxy(value);
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
  if (
    keys.length > 64 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(reasonCode);
  }
  const output = Object.create(null);
  for (const key of keys.sort()) {
    output[key] = normalizeJsonData(
      descriptors[key].value,
      reasonCode,
      depth + 1,
    );
  }
  return Object.freeze(output);
}

function normalizeOpaqueRows(value, reasonCode) {
  return Object.freeze(
    dataArray(value, reasonCode)
      .map((row) => {
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
          fail(reasonCode);
        }
        return normalizeJsonData(row, reasonCode);
      })
      .sort(compareCanonical),
  );
}

export function normalizeIdentityMailDutyRoleCatalogCurrent186(value) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ARGUMENTS_INVALID");
  }
  const catalog = dataRecord(
    value,
    CATALOG_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SNAPSHOT_INVALID",
  );
  if (
    catalog.schemaVersion !==
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SCHEMA_VERSION ||
    catalog.profile !== IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE ||
    !SHA256_PATTERN.test(catalog.systemPublicAclBaselineDigest) ||
    !Number.isSafeInteger(catalog.userRoutineDefinitionCount) ||
    catalog.userRoutineDefinitionCount < 0 ||
    !SHA256_PATTERN.test(catalog.userRoutineDefinitionDigest)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_CONTRACT_INVALID");
  }
  const database = normalizeDatabase(catalog.database);
  const roles = normalizeRoles(catalog.roles, database);
  const objects = dataArray(
    catalog.objects,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID",
  )
    .map(normalizeObject)
    .sort(compareCanonical);
  const objectKeys = objects.map((entry) => `${entry.kind}\n${entry.identity}`);
  const expectedObjectKeys = [
    `DATABASE\n${database.name}`,
    "SCHEMA\npublic",
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS.map(
      (identity) => `RELATION\n${identity}`,
    ),
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.map(
      (identity) => `ROUTINE\n${identity}`,
    ),
  ].sort();
  objectKeys.sort();
  if (
    new Set(objectKeys).size !== objectKeys.length ||
    canonicalStringify(objectKeys) !== canonicalStringify(expectedObjectKeys)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID");
  }
  const knownRoleOids = new Map([
    ["public", 0],
    [database.ownerName, database.ownerOid],
    ...Object.values(roles).map((role) => [role.name, role.oid]),
  ]);
  const knownRoleNames = new Map(
    [...knownRoleOids].map(([name, oid]) => [oid, name]),
  );
  const bindRoleIdentity = (name, oid) => {
    if (
      (name === "public"
        ? oid !== 0
        : !validRoleName(name) || !validOid(oid)) ||
      (knownRoleOids.has(name) && knownRoleOids.get(name) !== oid) ||
      (knownRoleNames.has(oid) && knownRoleNames.get(oid) !== name)
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_IDENTITY_INVALID");
    }
    knownRoleOids.set(name, oid);
    knownRoleNames.set(oid, name);
  };
  const ownerOids = new Map([
    [database.ownerName, database.ownerOid],
    [roles.schemaOwner.name, roles.schemaOwner.oid],
  ]);
  const schemaObjectForOwner = objects.find(
    (object) => object.kind === "SCHEMA" && object.identity === "public",
  );
  if (schemaObjectForOwner?.ownerName === "pg_database_owner") {
    if (schemaObjectForOwner.ownerOid !== PG_DATABASE_OWNER_OID) {
      fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID");
    }
    ownerOids.set(
      schemaObjectForOwner.ownerName,
      schemaObjectForOwner.ownerOid,
    );
    knownRoleOids.set(
      schemaObjectForOwner.ownerName,
      schemaObjectForOwner.ownerOid,
    );
    knownRoleNames.set(
      schemaObjectForOwner.ownerOid,
      schemaObjectForOwner.ownerName,
    );
  }
  const privilegesByKind = Object.freeze({
    DATABASE: new Set(["CONNECT", "CREATE", "TEMPORARY"]),
    RELATION: new Set([
      "DELETE",
      "INSERT",
      "REFERENCES",
      "SELECT",
      "TRIGGER",
      "TRUNCATE",
      "UPDATE",
    ]),
    ROUTINE: new Set(["EXECUTE"]),
    SCHEMA: new Set(["CREATE", "USAGE"]),
  });
  for (const object of objects) {
    bindRoleIdentity(object.ownerName, object.ownerOid);
    for (const entry of object.acls) {
      bindRoleIdentity(entry.granteeName, entry.granteeOid);
      bindRoleIdentity(entry.grantorName, entry.grantorOid);
    }
  }
  for (const object of objects) {
    const expectedOwnerOid = ownerOids.get(object.ownerName);
    if (
      expectedOwnerOid !== object.ownerOid ||
      (object.ownerName === "pg_database_owner" && object.kind !== "SCHEMA") ||
      (object.kind === "DATABASE" && object.ownerOid !== database.ownerOid) ||
      (object.kind === "RELATION" &&
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DATABASE_OWNER_RELATIONS.includes(
          object.identity,
        ) &&
        object.ownerOid !== database.ownerOid)
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OBJECT_INVALID");
    }
    for (const entry of object.acls) {
      if (!privilegesByKind[object.kind].has(entry.privilege)) {
        fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ACL_INVALID");
      }
    }
  }
  const supportColumnBindings = dataArray(
    catalog.supportColumnBindings,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SUPPORT_COLUMN_BINDING_INVALID",
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.length,
  )
    .map(normalizeSupportColumnBinding)
    .sort(compareCanonical);
  if (
    supportColumnBindings.length !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.length ||
    new Set(supportColumnBindings.map((entry) => entry.objectIdentity)).size !==
      supportColumnBindings.length
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SUPPORT_COLUMN_BINDING_INVALID",
    );
  }
  for (const binding of supportColumnBindings) {
    const relationIdentity =
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.find(
        (identity) => binding.objectIdentity.startsWith(`${identity}.`),
      );
    const relationObject = objects.find(
      (object) =>
        object.kind === "RELATION" && object.identity === relationIdentity,
    );
    if (!relationIdentity || relationObject?.oid !== binding.relationOid) {
      fail(
        "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SUPPORT_COLUMN_BINDING_INVALID",
      );
    }
  }
  const effectivePrivileges = dataArray(
    catalog.effectivePrivileges,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EFFECTIVE_INVALID",
  )
    .map(normalizeEffective)
    .sort(compareCanonical);
  if (
    new Set(effectivePrivileges.map((entry) => canonicalStringify(entry)))
      .size !== effectivePrivileges.length
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EFFECTIVE_INVALID");
  }
  const dutyRoutines = dataArray(
    catalog.dutyRoutines,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DUTY_ROUTINE_INVALID",
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.length,
  )
    .map(normalizeDutyRoutine)
    .sort(compareCanonical);
  if (
    dutyRoutines.length !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.length ||
    new Set(dutyRoutines.map((entry) => entry.signature)).size !==
      dutyRoutines.length ||
    new Set(dutyRoutines.map((entry) => entry.oid)).size !== dutyRoutines.length
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DUTY_ROUTINE_INVALID");
  }
  for (const routine of dutyRoutines) {
    const object = objects.find(
      (entry) =>
        entry.kind === "ROUTINE" && entry.identity === routine.signature,
    );
    if (object?.oid !== routine.oid) {
      fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DUTY_ROUTINE_INVALID");
    }
  }
  const publicRoutineAcls = dataArray(
    catalog.publicRoutineAcls,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PUBLIC_ROUTINE_ACL_INVALID",
  )
    .map(normalizePublicRoutineAcl)
    .sort(compareCanonical);
  if (
    new Set(publicRoutineAcls.map((entry) => entry.oid)).size !==
    publicRoutineAcls.length
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PUBLIC_ROUTINE_ACL_INVALID",
    );
  }
  for (const entry of publicRoutineAcls) {
    bindRoleIdentity(entry.ownerName, entry.ownerOid);
    bindRoleIdentity(entry.grantorName, entry.grantorOid);
  }
  const definitionManifest = dataArray(
    catalog.definitionManifest,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFINITION_MANIFEST_INVALID",
  )
    .map(normalizeDefinitionManifestEntry)
    .sort(compareCanonical);
  if (
    new Set(
      definitionManifest.map((entry) => `${entry.kind}\n${entry.identity}`),
    ).size !== definitionManifest.length ||
    canonicalStringify(
      definitionManifest
        .filter((entry) => entry.kind === "ROUTINE")
        .map((entry) => entry.identity)
        .sort(),
    ) !==
      canonicalStringify(
        [
          ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_DEFINITION_IDENTITIES,
        ].sort(),
      ) ||
    canonicalStringify(
      definitionManifest
        .filter((entry) => entry.kind === "TRIGGER")
        .map((entry) => entry.identity)
        .sort(),
    ) !==
      canonicalStringify(
        [
          ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES,
        ].sort(),
      ) ||
    !SHA256_PATTERN.test(catalog.definitionManifestDigest) ||
    identityMailDutyRoleDefinitionManifestCurrent186Digest(
      definitionManifest,
    ) !== catalog.definitionManifestDigest
  ) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFINITION_MANIFEST_INVALID",
    );
  }
  const directAuthorities = dataArray(
    catalog.directAuthorities,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIRECT_AUTHORITY_INVALID",
    MAX_AUTHORITY_ROWS,
  )
    .map(normalizeDirectAuthority)
    .sort(compareCanonical);
  if (
    new Set(directAuthorities.map((entry) => canonicalStringify(entry)))
      .size !== directAuthorities.length
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIRECT_AUTHORITY_INVALID");
  }
  for (const entry of directAuthorities) {
    bindRoleIdentity(entry.granteeName, entry.granteeOid);
    bindRoleIdentity(entry.grantorName, entry.grantorOid);
  }
  const unexpectedOwnedObjects = dataArray(
    catalog.unexpectedOwnedObjects,
    "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OWNERSHIP_INVALID",
    MAX_AUTHORITY_ROWS,
  )
    .map(normalizeUnexpectedOwnedObject)
    .sort(compareCanonical);
  const dutyRoleIdentities = new Map(
    Object.values(roles).map((role) => [role.oid, role.name]),
  );
  if (
    new Set(
      unexpectedOwnedObjects.map(
        (entry) =>
          `${entry.kind}\n${entry.oid === null ? entry.identity : entry.oid}`,
      ),
    ).size !== unexpectedOwnedObjects.length ||
    unexpectedOwnedObjects.some(
      (entry) => dutyRoleIdentities.get(entry.ownerOid) !== entry.ownerName,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_OWNERSHIP_INVALID");
  }
  return Object.freeze({
    database,
    databaseRoleSettings: normalizeOpaqueRows(
      catalog.databaseRoleSettings,
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DATABASE_ROLE_SETTING_INVALID",
    ),
    defaultAcls: normalizeOpaqueRows(
      catalog.defaultAcls,
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DEFAULT_ACL_INVALID",
    ),
    definitionManifest: Object.freeze(definitionManifest),
    definitionManifestDigest: catalog.definitionManifestDigest,
    directAuthorities: Object.freeze(directAuthorities),
    dutyRoutines: Object.freeze(dutyRoutines),
    effectivePrivileges: Object.freeze(effectivePrivileges),
    memberships: normalizeOpaqueRows(
      catalog.memberships,
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_MEMBERSHIP_INVALID",
    ),
    objects: Object.freeze(objects),
    profile: catalog.profile,
    publicRoutineAcls: Object.freeze(publicRoutineAcls),
    roles,
    roleSettings: normalizeOpaqueRows(
      catalog.roleSettings,
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ROLE_SETTING_INVALID",
    ),
    schemaVersion: catalog.schemaVersion,
    supportColumnBindings: Object.freeze(supportColumnBindings),
    systemPublicAclBaselineDigest: catalog.systemPublicAclBaselineDigest,
    unexpectedOwnedObjects: Object.freeze(unexpectedOwnedObjects),
    userRoutineDefinitionCount: catalog.userRoutineDefinitionCount,
    userRoutineDefinitionDigest: catalog.userRoutineDefinitionDigest,
  });
}

function acl(grantor, grantee, privilege) {
  return Object.freeze({
    granteeName: grantee.name,
    granteeOid: grantee.oid,
    grantorName: grantor.name,
    grantorOid: grantor.oid,
    isGrantable: false,
    privilege,
  });
}

function directAcl(grantor, grantee, objectIdentity, objectKind, privilege) {
  return Object.freeze({
    ...acl(grantor, grantee, privilege),
    objectIdentity,
    objectKind,
    source: "ACL",
  });
}

function expectedObject(catalog, kind, identity, owner, acls) {
  const observed = catalog.objects.find(
    (entry) => entry.kind === kind && entry.identity === identity,
  );
  if (!observed) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_REQUIRED_OBJECT_MISSING");
  }
  return Object.freeze({
    acls: Object.freeze(acls.sort(compareCanonical)),
    identity,
    kind,
    oid: observed.oid,
    ownerName: owner.name,
    ownerOid: owner.oid,
  });
}

export function identityMailDutyRoleCatalogCurrent186Target(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  const { database } = catalog;
  const roles = Object.freeze({
    coordinator: normalRuntimeRole(catalog.roles.coordinator, "coordinator"),
    schemaOwner: normalRuntimeRole(catalog.roles.schemaOwner, "schemaOwner"),
    worker: normalRuntimeRole(catalog.roles.worker, "worker"),
  });
  const databaseOwner = Object.freeze({
    name: database.ownerName,
    oid: database.ownerOid,
  });
  const objects = [];
  objects.push(
    expectedObject(catalog, "DATABASE", database.name, databaseOwner, [
      acl(databaseOwner, roles.coordinator, "CONNECT"),
      acl(databaseOwner, roles.worker, "CONNECT"),
    ]),
    expectedObject(catalog, "SCHEMA", "public", roles.schemaOwner, [
      acl(
        roles.schemaOwner,
        Object.freeze({ name: "public", oid: 0 }),
        "USAGE",
      ),
    ]),
  );
  for (const identity of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS) {
    objects.push(
      expectedObject(catalog, "RELATION", identity, roles.schemaOwner, []),
    );
  }
  for (const identity of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS) {
    const privileges =
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_RELATION_PRIVILEGES.filter(
        (entry) => entry.objectIdentity === identity,
      ).map((entry) => acl(databaseOwner, roles.schemaOwner, entry.privilege));
    objects.push(
      expectedObject(catalog, "RELATION", identity, databaseOwner, privileges),
    );
  }
  for (const identity of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ONLY_RELATIONS) {
    objects.push(
      expectedObject(catalog, "RELATION", identity, databaseOwner, []),
    );
  }
  for (const identity of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES) {
    const grantees = [];
    if (
      identity === IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT186_RPC_SIGNATURE
    ) {
      grantees.push(acl(roles.schemaOwner, roles.coordinator, "EXECUTE"));
    } else if (
      IDENTITY_MAIL_WORKER_CURRENT186_RPC_SIGNATURES.includes(identity)
    ) {
      grantees.push(acl(roles.schemaOwner, roles.worker, "EXECUTE"));
    }
    objects.push(
      expectedObject(catalog, "ROUTINE", identity, roles.schemaOwner, grantees),
    );
  }
  for (const entry of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES) {
    objects.push(
      expectedObject(catalog, "ROUTINE", entry.objectIdentity, databaseOwner, [
        acl(databaseOwner, roles.schemaOwner, entry.privilege),
      ]),
    );
  }
  const oidBySignature = new Map(
    catalog.dutyRoutines.map((routine) => [routine.signature, routine.oid]),
  );
  const dutyRoutines = IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.map(
    (signature) =>
      Object.freeze({
        language: "plpgsql",
        oid: oidBySignature.get(signature),
        ownerName: roles.schemaOwner.name,
        ownerOid: roles.schemaOwner.oid,
        parallelSafety: "u",
        returnType: "jsonb",
        searchPath: "pg_catalog",
        securityDefiner: true,
        signature,
        volatility: "v",
      }),
  ).sort(compareCanonical);
  const effectivePrivileges = [];
  for (const role of [roles.coordinator, roles.worker]) {
    effectivePrivileges.push(
      Object.freeze({
        objectIdentity: database.name,
        objectKind: "DATABASE",
        privilege: "CONNECT",
        roleName: role.name,
        roleOid: role.oid,
      }),
      Object.freeze({
        objectIdentity: "public",
        objectKind: "SCHEMA",
        privilege: "USAGE",
        roleName: role.name,
        roleOid: role.oid,
      }),
    );
  }
  effectivePrivileges.push(
    Object.freeze({
      objectIdentity:
        IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT186_RPC_SIGNATURE,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
      roleName: roles.coordinator.name,
      roleOid: roles.coordinator.oid,
    }),
  );
  for (const signature of IDENTITY_MAIL_WORKER_CURRENT186_RPC_SIGNATURES) {
    effectivePrivileges.push(
      Object.freeze({
        objectIdentity: signature,
        objectKind: "ROUTINE",
        privilege: "EXECUTE",
        roleName: roles.worker.name,
        roleOid: roles.worker.oid,
      }),
    );
  }
  for (const entry of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES) {
    effectivePrivileges.push(
      Object.freeze({
        objectIdentity: entry.objectIdentity,
        objectKind: "COLUMN",
        privilege: entry.privilege,
        roleName: roles.schemaOwner.name,
        roleOid: roles.schemaOwner.oid,
      }),
    );
  }
  for (const entry of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_RELATION_PRIVILEGES) {
    if (
      !IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.includes(
        entry.objectIdentity,
      )
    ) {
      continue;
    }
    effectivePrivileges.push(
      Object.freeze({
        objectIdentity: entry.objectIdentity,
        objectKind: "RELATION",
        privilege: entry.privilege,
        roleName: roles.schemaOwner.name,
        roleOid: roles.schemaOwner.oid,
      }),
    );
  }
  for (const entry of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES) {
    effectivePrivileges.push(
      Object.freeze({
        objectIdentity: entry.objectIdentity,
        objectKind: "ROUTINE",
        privilege: entry.privilege,
        roleName: roles.schemaOwner.name,
        roleOid: roles.schemaOwner.oid,
      }),
    );
  }
  const sortedObjects = Object.freeze(objects.sort(compareCanonical));
  const expectedRoleOids = new Set(
    Object.values(roles).map((role) => role.oid),
  );
  const directAuthorities = sortedObjects
    .flatMap((object) =>
      object.acls
        .filter((entry) => expectedRoleOids.has(entry.granteeOid))
        .map((entry) =>
          Object.freeze({
            ...entry,
            objectIdentity: object.identity,
            objectKind: object.kind,
            source: "ACL",
          }),
        ),
    )
    .concat(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.map(
        (entry) =>
          directAcl(
            databaseOwner,
            roles.schemaOwner,
            entry.objectIdentity,
            "COLUMN",
            entry.privilege,
          ),
      ),
      catalog.directAuthorities.filter(
        (entry) =>
          entry.granteeOid === 0 &&
          !sortedObjects.some(
            (object) =>
              object.kind === entry.objectKind &&
              object.identity === entry.objectIdentity,
          ) &&
          !(
            entry.objectKind === "COLUMN" &&
            isProtectedColumnIdentity(entry.objectIdentity)
          ),
      ),
    )
    .sort(compareCanonical);
  return Object.freeze({
    database,
    databaseRoleSettings: Object.freeze([]),
    defaultAcls: Object.freeze([]),
    definitionManifest: catalog.definitionManifest,
    definitionManifestDigest: catalog.definitionManifestDigest,
    directAuthorities: Object.freeze(directAuthorities),
    dutyRoutines: Object.freeze(dutyRoutines),
    effectivePrivileges: Object.freeze(
      effectivePrivileges.sort(compareCanonical),
    ),
    memberships: Object.freeze([]),
    objects: sortedObjects,
    profile: catalog.profile,
    publicRoutineAcls: Object.freeze([]),
    roles,
    roleSettings: Object.freeze([]),
    schemaVersion: catalog.schemaVersion,
    supportColumnBindings: catalog.supportColumnBindings,
    systemPublicAclBaselineDigest: catalog.systemPublicAclBaselineDigest,
    unexpectedOwnedObjects: Object.freeze([]),
    userRoutineDefinitionCount: catalog.userRoutineDefinitionCount,
    userRoutineDefinitionDigest: catalog.userRoutineDefinitionDigest,
  });
}

export function identityMailDutyRoleCatalogCurrent186Digest(value) {
  return digest(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIGEST_DOMAIN,
    normalizeIdentityMailDutyRoleCatalogCurrent186(value),
  );
}

export function identityMailDutyRoleCatalogCurrent186TargetDigests(value) {
  const target = identityMailDutyRoleCatalogCurrent186Target(value);
  return Object.freeze({
    ...identityMailDutyRoleCatalogCurrent186ActualDigests(target),
    target,
  });
}

function grantsAcl(object, entry) {
  return Object.freeze({
    grantorName: entry.grantorName,
    grantorOid: entry.grantorOid,
    granteeName: entry.granteeName,
    granteeOid: entry.granteeOid,
    isGrantable: entry.isGrantable,
    objectIdentity: object.identity,
    objectKind: object.kind,
    privilege: entry.privilege,
  });
}

export function identityMailDutyRoleCatalogCurrent186GrantsProjection(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  const databaseObject = catalog.objects.find(
    (object) =>
      object.kind === "DATABASE" && object.identity === catalog.database.name,
  );
  const schemaObject = catalog.objects.find(
    (object) => object.kind === "SCHEMA" && object.identity === "public",
  );
  if (!databaseObject || !schemaObject) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_REQUIRED_OBJECT_MISSING");
  }
  const runtimeOids = new Set([
    catalog.roles.coordinator.oid,
    catalog.roles.worker.oid,
  ]);
  const supportAcls = [
    ...databaseObject.acls
      .filter((entry) => runtimeOids.has(entry.granteeOid))
      .map((entry) => grantsAcl(databaseObject, entry)),
    ...schemaObject.acls
      .filter((entry) => entry.granteeOid === 0)
      .map((entry) => grantsAcl(schemaObject, entry)),
  ].sort(compareCanonical);
  const nonOwnerRoutineAcls = catalog.objects
    .filter(
      (object) =>
        object.kind === "ROUTINE" &&
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.includes(
          object.identity,
        ),
    )
    .flatMap((object) => object.acls.map((entry) => grantsAcl(object, entry)))
    .sort(compareCanonical);
  return Object.freeze({
    contract: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT,
    // CURRENT185 V1 is a frozen compatibility surface. Keep its database
    // projection byte-for-byte limited to the five fields that existed in
    // that contract even though CURRENT186 records the deployment identity.
    database: Object.freeze({
      identityDigest: catalog.database.identityDigest,
      name: catalog.database.name,
      oid: catalog.database.oid,
      ownerName: catalog.database.ownerName,
      ownerOid: catalog.database.ownerOid,
    }),
    databaseRoleSettings: catalog.databaseRoleSettings,
    defaultAcls: catalog.defaultAcls,
    effectivePrivileges: Object.freeze(
      catalog.effectivePrivileges.filter((entry) =>
        runtimeOids.has(entry.roleOid),
      ),
    ),
    memberships: catalog.memberships,
    nonOwnerRoutineAcls: Object.freeze(nonOwnerRoutineAcls),
    profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
    roles: catalog.roles,
    roleSettings: catalog.roleSettings,
    routines: catalog.dutyRoutines,
    schema: Object.freeze({
      name: schemaObject.identity,
      oid: schemaObject.oid,
      ownerName: schemaObject.ownerName,
      ownerOid: schemaObject.ownerOid,
    }),
    schemaVersion: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_VERSION,
    supportAcls: Object.freeze(supportAcls),
    unexpectedDutyRoleOwnerships: catalog.unexpectedOwnedObjects,
  });
}

export function identityMailDutyRoleCatalogCurrent186ActualDigests(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  const ownerObjects = catalog.objects.filter(
    (object) =>
      object.ownerOid === catalog.roles.schemaOwner.oid ||
      object.acls.some(
        (entry) => entry.granteeOid === catalog.roles.schemaOwner.oid,
      ),
  );
  return Object.freeze({
    catalogDigest: digest(
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DIGEST_DOMAIN,
      catalog,
    ),
    exactGrantsDigest: digest(
      IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_DIGEST_DOMAIN,
      identityMailDutyRoleCatalogCurrent186GrantsProjection(catalog),
    ),
    definitionManifestDigest: catalog.definitionManifestDigest,
    ownerSurfaceDigest: digest(
      IDENTITY_MAIL_DUTY_ROLE_OWNER_SURFACE_CURRENT186_DIGEST_DOMAIN,
      Object.freeze({
        dutyRoutines: catalog.dutyRoutines,
        objects: Object.freeze(ownerObjects),
        role: catalog.roles.schemaOwner,
      }),
    ),
  });
}

export function inspectIdentityMailDutyRoleCatalogCurrent186(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  const { target, ...digests } =
    identityMailDutyRoleCatalogCurrent186TargetDigests(catalog);
  const findings = [];
  if (catalog.memberships.length !== 0) findings.push("MEMBERSHIP_DRIFT");
  if (catalog.roleSettings.length !== 0) findings.push("ROLE_SETTING_DRIFT");
  if (catalog.databaseRoleSettings.length !== 0) {
    findings.push("DATABASE_ROLE_SETTING_DRIFT");
  }
  if (catalog.defaultAcls.length !== 0) findings.push("DEFAULT_ACL_DRIFT");
  if (catalog.unexpectedOwnedObjects.length !== 0) {
    findings.push("UNEXPECTED_OWNERSHIP");
  }
  if (canonicalStringify(catalog.roles) !== canonicalStringify(target.roles)) {
    findings.push("ROLE_ATTRIBUTE_DRIFT");
  }
  if (
    canonicalStringify(catalog.dutyRoutines) !==
    canonicalStringify(target.dutyRoutines)
  ) {
    findings.push("DUTY_ROUTINE_DRIFT");
  }
  if (catalog.publicRoutineAcls.length !== 0) {
    findings.push("PUBLIC_ROUTINE_EXECUTE_DRIFT");
  }
  if (
    canonicalStringify(catalog.objects) !== canonicalStringify(target.objects)
  ) {
    findings.push("OBJECT_OR_ACL_DRIFT");
  }
  if (
    canonicalStringify(catalog.effectivePrivileges) !==
    canonicalStringify(target.effectivePrivileges)
  ) {
    findings.push("EFFECTIVE_PRIVILEGE_DRIFT");
  }
  if (
    canonicalStringify(catalog.directAuthorities) !==
    canonicalStringify(target.directAuthorities)
  ) {
    findings.push("DIRECT_AUTHORITY_DRIFT");
  }
  if (
    catalog.systemPublicAclBaselineDigest !==
    IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST
  ) {
    findings.push("SYSTEM_PUBLIC_ACL_BASELINE_DRIFT");
  }
  const expectedPrincipalOids = new Set([
    0,
    catalog.database.ownerOid,
    ...Object.values(catalog.roles).map((role) => role.oid),
  ]);
  const publicSchema = catalog.objects.find(
    (object) => object.kind === "SCHEMA" && object.identity === "public",
  );
  if (
    publicSchema?.ownerName === "pg_database_owner" &&
    publicSchema.ownerOid === PG_DATABASE_OWNER_OID
  ) {
    expectedPrincipalOids.add(PG_DATABASE_OWNER_OID);
  }
  const unexpectedAclPrincipals = catalog.objects
    .flatMap((object) =>
      object.acls
        .filter(
          (entry) =>
            !expectedPrincipalOids.has(entry.granteeOid) ||
            !expectedPrincipalOids.has(entry.grantorOid),
        )
        .map((entry) =>
          Object.freeze({
            granteeName: entry.granteeName,
            granteeOid: entry.granteeOid,
            grantorName: entry.grantorName,
            grantorOid: entry.grantorOid,
            objectIdentity: object.identity,
            objectKind: object.kind,
          }),
        ),
    )
    .sort(compareCanonical);
  if (unexpectedAclPrincipals.length !== 0) {
    findings.push("UNEXPECTED_ACL_PRINCIPAL");
  }
  return Object.freeze({
    ...digests,
    catalog,
    compliant: findings.length === 0,
    decision:
      findings.length === 0
        ? "CURRENT186_DUTY_ROLE_CATALOG_COMPLIANT"
        : "CURRENT186_DUTY_ROLE_CATALOG_DRIFT",
    findings: Object.freeze(findings.sort()),
    target,
    unexpectedAclPrincipals: Object.freeze(unexpectedAclPrincipals),
  });
}

export function inspectIdentityMailDutyRoleCatalogCurrent186Safety(
  value,
  expectedDefinitionManifestDigest,
) {
  const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(value);
  if (!SHA256_PATTERN.test(expectedDefinitionManifestDigest)) {
    fail(
      "IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EXPECTED_DEFINITION_INVALID",
    );
  }
  const blockers = [];
  if (inspection.catalog.unexpectedOwnedObjects.length !== 0) {
    blockers.push("UNEXPECTED_OWNERSHIP");
  }
  if (
    inspection.catalog.roles.schemaOwner.canLogin !== false ||
    inspection.catalog.roles.coordinator.canLogin !== true ||
    inspection.catalog.roles.worker.canLogin !== true
  ) {
    blockers.push("ROLE_ATTRIBUTE_DRIFT");
  }
  if (
    inspection.catalog.effectivePrivileges.some(
      (entry) =>
        entry.objectKind === "SCHEMA" && entry.objectIdentity !== "public",
    )
  ) {
    blockers.push("UNRESTORABLE_CUSTOM_SCHEMA_AUTHORITY");
  }
  if (inspection.unexpectedAclPrincipals.length !== 0) {
    blockers.push("UNEXPECTED_ACL_PRINCIPAL");
  }
  const targetObjectAcls = new Map(
    inspection.target.objects.map((object) => [
      `${object.kind}\n${object.identity}`,
      new Set(object.acls.map((entry) => canonicalStringify(entry))),
    ]),
  );
  if (
    inspection.catalog.objects.some((object) => {
      const expected = targetObjectAcls.get(
        `${object.kind}\n${object.identity}`,
      );
      return object.acls.some(
        (entry) =>
          !expected?.has(canonicalStringify(entry)) &&
          !(
            entry.granteeName === "public" &&
            entry.granteeOid === 0 &&
            entry.grantorName === object.ownerName &&
            entry.grantorOid === object.ownerOid &&
            entry.isGrantable === false
          ),
      );
    })
  ) {
    blockers.push("UNRESTORABLE_OBJECT_ACL_GRAPH");
  }
  if (
    inspection.catalog.objects.some((object) =>
      object.acls.some((entry) => entry.granteeOid === 0 && entry.isGrantable),
    )
  ) {
    blockers.push("UNRESTORABLE_PUBLIC_GRANT_OPTION");
  }
  if (
    inspection.catalog.publicRoutineAcls.some(
      (entry) =>
        entry.grantorName !== entry.ownerName ||
        entry.grantorOid !== entry.ownerOid ||
        entry.isGrantable,
    )
  ) {
    blockers.push("UNRESTORABLE_PUBLIC_ROUTINE_ACL_GRAPH");
  }
  const targetDirectAuthorities = new Set(
    inspection.target.directAuthorities.map((entry) =>
      canonicalStringify(entry),
    ),
  );
  if (
    inspection.catalog.directAuthorities.some(
      (entry) =>
        !targetDirectAuthorities.has(canonicalStringify(entry)) &&
        !(
          entry.objectKind === "COLUMN" &&
          IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITY_SET.has(
            entry.objectIdentity,
          ) &&
          entry.granteeName === "public" &&
          entry.granteeOid === 0 &&
          entry.grantorName === inspection.catalog.database.ownerName &&
          entry.grantorOid === inspection.catalog.database.ownerOid &&
          entry.isGrantable === false &&
          entry.source === "ACL" &&
          ["INSERT", "REFERENCES", "SELECT", "UPDATE"].includes(entry.privilege)
        ),
    )
  ) {
    blockers.push("UNEXPECTED_DIRECT_AUTHORITY");
  }
  if (
    inspection.catalog.definitionManifestDigest !==
    expectedDefinitionManifestDigest
  ) {
    blockers.push("DEFINITION_MANIFEST_DRIFT");
  }
  if (
    inspection.catalog.systemPublicAclBaselineDigest !==
    IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST
  ) {
    blockers.push("SYSTEM_PUBLIC_ACL_BASELINE_DRIFT");
  }
  return Object.freeze({
    blockers: Object.freeze(blockers.sort()),
    compliant: blockers.length === 0,
    definitionManifestDigest: inspection.catalog.definitionManifestDigest,
    expectedDefinitionManifestDigest,
    unexpectedAclPrincipals: inspection.unexpectedAclPrincipals,
  });
}

export function inspectIdentityMailDutyRoleContainmentCurrent186(value) {
  const catalog = normalizeIdentityMailDutyRoleCatalogCurrent186(value);
  const findings = [];
  if (
    catalog.roles.schemaOwner.canLogin !== false ||
    catalog.roles.coordinator.canLogin !== false ||
    catalog.roles.worker.canLogin !== false
  ) {
    findings.push("RUNTIME_LOGIN_NOT_CONTAINED");
  }
  if (catalog.memberships.length !== 0) findings.push("MEMBERSHIP_DRIFT");
  if (catalog.roleSettings.length !== 0) findings.push("ROLE_SETTING_DRIFT");
  if (catalog.databaseRoleSettings.length !== 0) {
    findings.push("DATABASE_ROLE_SETTING_DRIFT");
  }
  if (catalog.defaultAcls.length !== 0) findings.push("DEFAULT_ACL_DRIFT");
  if (catalog.unexpectedOwnedObjects.length !== 0) {
    findings.push("UNEXPECTED_OWNERSHIP");
  }
  const dutyRoleOids = new Set([
    catalog.roles.schemaOwner.oid,
    catalog.roles.coordinator.oid,
    catalog.roles.worker.oid,
  ]);
  if (
    catalog.objects.some((object) =>
      object.acls.some((entry) => dutyRoleOids.has(entry.granteeOid)),
    ) ||
    catalog.directAuthorities.some((entry) =>
      dutyRoleOids.has(entry.granteeOid),
    )
  ) {
    findings.push("DIRECT_DUTY_GRANT_REMAINS");
  }
  const expectedEffectivePrivileges = [
    catalog.roles.coordinator,
    catalog.roles.worker,
  ]
    .map((role) =>
      Object.freeze({
        objectIdentity: "public",
        objectKind: "SCHEMA",
        privilege: "USAGE",
        roleName: role.name,
        roleOid: role.oid,
      }),
    )
    .sort(compareCanonical);
  if (
    canonicalStringify(catalog.effectivePrivileges) !==
    canonicalStringify(expectedEffectivePrivileges)
  ) {
    findings.push("EFFECTIVE_RUNTIME_AUTHORITY_REMAINS");
  }
  if (catalog.publicRoutineAcls.length !== 0) {
    findings.push("PUBLIC_ROUTINE_EXECUTE_REMAINS");
  }
  const publicSchema = catalog.objects.find(
    (object) => object.kind === "SCHEMA" && object.identity === "public",
  );
  const publicSchemaAcls =
    publicSchema?.acls.filter((entry) => entry.granteeOid === 0) ?? [];
  if (
    publicSchemaAcls.length !== 1 ||
    publicSchemaAcls[0].granteeName !== "public" ||
    publicSchemaAcls[0].grantorName !== publicSchema?.ownerName ||
    publicSchemaAcls[0].grantorOid !== publicSchema?.ownerOid ||
    publicSchemaAcls[0].privilege !== "USAGE" ||
    publicSchemaAcls[0].isGrantable !== false
  ) {
    findings.push("PUBLIC_SCHEMA_AUTHORITY_DRIFT");
  }
  if (
    catalog.objects.some(
      (object) =>
        !(object.kind === "SCHEMA" && object.identity === "public") &&
        object.acls.some((entry) => entry.granteeOid === 0),
    )
  ) {
    findings.push("PUBLIC_OBJECT_AUTHORITY_REMAINS");
  }
  return Object.freeze({
    ...identityMailDutyRoleCatalogCurrent186ActualDigests(catalog),
    catalog,
    compliant: findings.length === 0,
    decision:
      findings.length === 0
        ? "CURRENT186_DUTY_ROLE_CONTAINMENT_COMPLIANT"
        : "CURRENT186_DUTY_ROLE_CONTAINMENT_DRIFT",
    findings: Object.freeze(findings.sort()),
  });
}

export function buildIdentityMailDutyRoleCatalogCurrent186ReadRequest(
  expectations,
) {
  let databaseName;
  let databaseIdentityDigest;
  let schemaOwnerRoleOid;
  let coordinatorRoleOid;
  let workerRoleOid;
  try {
    if (
      expectations === null ||
      typeof expectations !== "object" ||
      Array.isArray(expectations) ||
      utilTypes.isProxy(expectations)
    ) {
      fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EXPECTATIONS_INVALID");
    }
    const descriptors = Object.getOwnPropertyDescriptors(expectations);
    for (const key of [
      "databaseName",
      "databaseIdentityDigest",
      "schemaOwnerRoleOid",
      "coordinatorRoleOid",
      "workerRoleOid",
    ]) {
      if (
        !Object.hasOwn(descriptors, key) ||
        !Object.hasOwn(descriptors[key], "value")
      ) {
        fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EXPECTATIONS_INVALID");
      }
    }
    databaseName = descriptors.databaseName.value;
    databaseIdentityDigest = descriptors.databaseIdentityDigest.value;
    schemaOwnerRoleOid = descriptors.schemaOwnerRoleOid.value;
    coordinatorRoleOid = descriptors.coordinatorRoleOid.value;
    workerRoleOid = descriptors.workerRoleOid.value;
  } catch (error) {
    if (error instanceof IdentityMailDutyRoleCatalogCurrent186Error)
      throw error;
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EXPECTATIONS_INVALID");
  }
  if (
    !DATABASE_NAME_PATTERN.test(databaseName) ||
    !SHA256_PATTERN.test(databaseIdentityDigest) ||
    !validOid(schemaOwnerRoleOid) ||
    !validOid(coordinatorRoleOid) ||
    !validOid(workerRoleOid) ||
    new Set([schemaOwnerRoleOid, coordinatorRoleOid, workerRoleOid]).size !== 3
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_EXPECTATIONS_INVALID");
  }
  const expectedObjects = Object.freeze(
    [
      Object.freeze({ identity: databaseName, kind: "DATABASE" }),
      Object.freeze({ identity: "public", kind: "SCHEMA" }),
      ...[...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS].map(
        (identity) => Object.freeze({ identity, kind: "RELATION" }),
      ),
      ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.map(
        (identity) => Object.freeze({ identity, kind: "ROUTINE" }),
      ),
    ].sort(compareCanonical),
  );
  const config = Object.freeze({
    databaseIdentityDigest,
    roles: Object.freeze(
      [
        Object.freeze({
          name: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
          oid: coordinatorRoleOid,
          roleKey: "coordinator",
        }),
        Object.freeze({
          name: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
          oid: schemaOwnerRoleOid,
          roleKey: "schemaOwner",
        }),
        Object.freeze({
          name: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker,
          oid: workerRoleOid,
          roleKey: "worker",
        }),
      ].sort(compareCanonical),
    ),
  });
  return Object.freeze({
    expectedObjects,
    parameters: Object.freeze([
      canonicalStringify(config),
      canonicalStringify(expectedObjects),
    ]),
  });
}

export async function readIdentityMailDutyRoleCatalogCurrent186FromPostgres(
  executor,
  expectations,
) {
  if (
    executor === null ||
    typeof executor !== "object" ||
    typeof executor.query !== "function"
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ADAPTER_INVALID");
  }
  const request =
    buildIdentityMailDutyRoleCatalogCurrent186ReadRequest(expectations);
  const result = await executor.query(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    request.parameters,
  );
  const rows = Array.isArray(result) ? result : result?.rows;
  if (!Array.isArray(rows) || rows.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_FAILED");
  }
  return normalizeIdentityMailDutyRoleCatalogCurrent186(rows[0]?.catalog);
}

// The privileged caller supplies a live pg_catalog snapshot through this
// bounded adapter. Keeping SQL execution outside the pure catalog contract
// prevents connection configuration from entering catalog evidence.
export async function readIdentityMailDutyRoleCatalogCurrent186(
  adapter,
  expectations,
) {
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.readCatalog !== "function"
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_ADAPTER_INVALID");
  }
  const raw = await adapter.readCatalog(expectations);
  return normalizeIdentityMailDutyRoleCatalogCurrent186(raw);
}
