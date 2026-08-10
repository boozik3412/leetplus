import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_STATIC_V1";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY =
  "20260803010000_identity_mail_duty_role_runtime_boundary_v2";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE =
  "20260804190000_identity_mail_duty_role_runtime_boundary_v2";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PREDECESSOR =
  "20260802030000_identity_mail_enrollment_evidence_ledger_v2";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ORDINAL = 186;
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SQL_SHA256 =
  "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_COMPLETED_MANIFEST_DIGEST =
  "3bbf04f88643d94076be96c3ae714c441454e6a7fcd6107af5bd194dca579ed6";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_MANIFEST_DIGEST =
  "2ac0ff62303d899a70b7600749fcd895f184523ef9dc9fc74d9b60a44eca9109";
export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST =
  "ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117";
const EXPECTED_CURRENT185_IMPORTER_PROSRC_SHA256 =
  "8e01d66ba74b77312b4cc4938709b354eee9fc2005fdfbc538e7cc2dfc9e839e";
const EXPECTED_CURRENT186_IMPORTER_PROSRC_SHA256 =
  "04789b4d5504938ed4c4c64be66cd2e972e0fe89a410ba7a51bdef88a4d27c4a";
const EXPECTED_CURRENT185_WORKER_ASSERT_PROSRC_SHA256 =
  "56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c";
const EXPECTED_CURRENT186_WORKER_ASSERT_PROSRC_SHA256 =
  "6baacb6fe11a7bbe0633986422f98d13c045e4038d5c1136ed94df080ae7af2e";
const EXPECTED_EMAIL_CLAIM_LOCK_PROSRC_SHA256 =
  "ba68aaef2db7b6302bad2a4b385d211e19566639182be7b6a300f8ad7e429b7c";
const EXPECTED_WORKER_PROJECTION_REWRITES = Object.freeze([
  Object.freeze({
    predecessor:
      "99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1",
    signature:
      "public.identity_initial_owner_mail_claim_v2(text,text,text,text)",
    successor:
      "aa36a0d9e9711210cd042b1e1097060ce0fe3d97d79010da8b778a5973fd13d0",
  }),
  Object.freeze({
    predecessor:
      "2037007f96e0626f46d3f6cfe7504383ac453e12e405c2d2b7ad4fd777cc52fb",
    signature:
      "public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)",
    successor:
      "02f349d30854af22c2f6dfacdb3322ad52c03f19fb9a36fc40f2ac3bb5d942ec",
  }),
  Object.freeze({
    predecessor:
      "190bb0100186f233cd33f1b4bb4065dd4c401e5156e5b0e9ecb8c7ba190c5754",
    signature:
      "public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)",
    successor:
      "d6f6194029f390f8d9712b2d1dc25c821df0982f2e22a73660379d427e0a7db3",
  }),
  Object.freeze({
    predecessor:
      "1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d",
    signature:
      "public.identity_initial_owner_mail_reap_v2(text,text,text,integer)",
    successor:
      "c0b0f3caf102b35613ea809fd380883ef0fd0843c2d58c8ad31badd960ab12e8",
  }),
  Object.freeze({
    predecessor:
      "39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151",
    signature:
      "public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)",
    successor:
      "491f6fca8721a4140b37284537436b016dbd9aff9dc8a88fd5ae61d96c98d71e",
  }),
]);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FINDINGS = Object.freeze({
  ACL_DRIFT: "ACL_DRIFT",
  AUTHORITY_SCOPE_DRIFT: "AUTHORITY_SCOPE_DRIFT",
  CANDIDATE_CHAIN_DRIFT: "CANDIDATE_CHAIN_DRIFT",
  DRIVER_PHASE_DRIFT: "DRIVER_PHASE_DRIFT",
  DRIVER_REFERENCE_SURFACE_DRIFT: "DRIVER_REFERENCE_SURFACE_DRIFT",
  DRIVER_REPLAY_DRIFT: "DRIVER_REPLAY_DRIFT",
  DRIVER_REVOCATION_POLICY_DRIFT: "DRIVER_REVOCATION_POLICY_DRIFT",
  DRIVER_ZERO_BARRIER_DRIFT: "DRIVER_ZERO_BARRIER_DRIFT",
  EMERGENCY_SESSION_BARRIER_DRIFT: "EMERGENCY_SESSION_BARRIER_DRIFT",
  EPOCH_DIGEST_DOMAIN_DRIFT: "EPOCH_DIGEST_DOMAIN_DRIFT",
  EPOCH_LEDGER_DRIFT: "EPOCH_LEDGER_DRIFT",
  EPOCH_MONOTONICITY_DRIFT: "EPOCH_MONOTONICITY_DRIFT",
  EVIDENCE_DIGEST_DRIFT: "EVIDENCE_DIGEST_DRIFT",
  EXPIRY_BOUNDARY_DRIFT: "EXPIRY_BOUNDARY_DRIFT",
  FUNCTION_SURFACE_DRIFT: "FUNCTION_SURFACE_DRIFT",
  GRANT_FORBIDDEN: "GRANT_FORBIDDEN",
  IMMUTABILITY_DRIFT: "IMMUTABILITY_DRIFT",
  LOCK_DRIFT: "LOCK_DRIFT",
  LOCK_ORDER_DRIFT: "LOCK_ORDER_DRIFT",
  MARKER_COLUMN_AUTHORITY_DRIFT: "MARKER_COLUMN_AUTHORITY_DRIFT",
  METADATA_DRIFT: "METADATA_DRIFT",
  DEFINITION_MANIFEST_DRIFT: "DEFINITION_MANIFEST_DRIFT",
  OWNERSHIP_SURFACE_DRIFT: "OWNERSHIP_SURFACE_DRIFT",
  POSTCONDITION_DRIFT: "POSTCONDITION_DRIFT",
  PREDECESSOR_DRIFT: "PREDECESSOR_DRIFT",
  PRODUCTION_AUTHORITY_FORBIDDEN: "PRODUCTION_AUTHORITY_FORBIDDEN",
  PUBLIC_ACL_BASELINE_DRIFT: "PUBLIC_ACL_BASELINE_DRIFT",
  READ_ERROR: "READ_ERROR",
  RECOVERY_BEFORE_IMAGE_DRIFT: "RECOVERY_BEFORE_IMAGE_DRIFT",
  ROLE_DDL_FORBIDDEN: "ROLE_DDL_FORBIDDEN",
  ROLLBACK_MAPPING_DRIFT: "ROLLBACK_MAPPING_DRIFT",
  RUNTIME_CALLER_BINDING_DRIFT: "RUNTIME_CALLER_BINDING_DRIFT",
  SEARCH_PATH_DRIFT: "SEARCH_PATH_DRIFT",
  SECURITY_DEFINER_DRIFT: "SECURITY_DEFINER_DRIFT",
  SQL_SHA_DRIFT: "SQL_SHA_DRIFT",
  TRANSACTION_ENVELOPE: "TRANSACTION_ENVELOPE",
});

const F = IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FINDINGS;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const CANDIDATE_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY,
);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");

const EXPECTED_METADATA_PREDECESSOR_COUNT = 186;
const EXPECTED_METADATA_PREDECESSOR =
  "20260804180000_identity_mail_enrollment_evidence_ledger_v2";
const EXPECTED_METADATA_PREDECESSOR_MANIFEST_DIGEST =
  "a7a90ef8c5de5c8a54bdccd54309837ddda2c2e161d6650b335d83f7af04034d";
const EXPECTED_SQL_PREDECESSOR_COUNT = 185;
const EXPECTED_SQL_PREDECESSOR_MANIFEST_DIGEST =
  "efee75130a1ed33c7c9f431acc60e4c3275f90a2479c34906cfa40fa0332ab19";
const EXPECTED_PREDECESSOR_SHA256 =
  "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6";
const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  "20260801010000_identity_mail_tenant_enrollment_control_plane",
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  "20260801030000_identity_mail_tenant_first_claim_protocol",
  "20260802010000_identity_mail_worker_v2_freshness_protocol",
  "20260802020000_identity_mail_worker_v2_lost_response_replay",
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PREDECESSOR,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY,
  "20260805020000_langame_onboarding_staged_receipt_current188",
  "20260805030000_identity_employee_invite_mail_boundary_current189",
  "20260805040000_guest_portal_session_current190",
  "20260805050000_identity_mail_ddl_fence_ledger_current187",
]);
const EXPECTED_CANDIDATE_IDENTITIES = Object.freeze({
  "20260801010000_identity_mail_tenant_enrollment_control_plane":
    "20260804130000_identity_mail_tenant_enrollment_control_plane",
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2":
    "20260804140000_identity_mail_tenant_lock_drain_worker_v2",
  "20260801030000_identity_mail_tenant_first_claim_protocol":
    "20260804150000_identity_mail_tenant_first_claim_protocol",
  "20260802010000_identity_mail_worker_v2_freshness_protocol":
    "20260804160000_identity_mail_worker_v2_freshness_protocol",
  "20260802020000_identity_mail_worker_v2_lost_response_replay":
    "20260804170000_identity_mail_worker_v2_lost_response_replay",
  "20260802030000_identity_mail_enrollment_evidence_ledger_v2":
    EXPECTED_METADATA_PREDECESSOR,
  [IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY]:
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE,
  "20260805020000_langame_onboarding_staged_receipt_current188":
    "20260805020000_langame_onboarding_staged_receipt_current188",
  "20260805030000_identity_employee_invite_mail_boundary_current189":
    "20260805030000_identity_employee_invite_mail_boundary_current189",
  "20260805040000_guest_portal_session_current190":
    "20260805040000_guest_portal_session_current190",
  "20260805050000_identity_mail_ddl_fence_ledger_current187":
    "20260805050000_identity_mail_ddl_fence_ledger_current187",
});
const EXPECTED_FUNCTIONS = Object.freeze([
  Object.freeze({
    args: 0,
    name: "identity_mail_duty_role_acl_lock_v1",
    securityDefiner: true,
  }),
  Object.freeze({
    args: 3,
    name: "identity_mail_duty_role_acl_epoch_append_v1",
    securityDefiner: false,
  }),
  Object.freeze({
    args: 0,
    name: "identity_mail_duty_role_acl_epoch_immutable_guard_v1",
    securityDefiner: false,
  }),
  Object.freeze({
    args: 6,
    name: "identity_mail_duty_role_live_assert_v1",
    securityDefiner: false,
  }),
  Object.freeze({
    args: 0,
    name: "identity_mail_tenant_enrollment_event_write_guard_v2",
    securityDefiner: false,
  }),
  Object.freeze({
    args: 0,
    name: "identity_mail_tenant_enrollment_registry_write_guard_v2",
    securityDefiner: false,
  }),
  Object.freeze({
    args: 4,
    name: "identity_mail_tenant_enrollment_drive_command_v2",
    securityDefiner: true,
  }),
]);
const EXPECTED_SUPPORT_SELECT_COLUMN_IDENTITIES = Object.freeze([
  'public."SharedBetaRuntimeReleaseMarker"."actualContextDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleName"',
  'public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleOid"',
  'public."SharedBetaRuntimeReleaseMarker"."databaseIdentityDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."id"',
  'public."SharedBetaRuntimeReleaseMarker"."migrationCount"',
  'public."SharedBetaRuntimeReleaseMarker"."migrationManifestDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."payloadDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."revokedAt"',
  'public."SharedBetaRuntimeReleaseMarker"."schemaHead"',
  'public."SharedBetaRuntimeReleaseMarker"."stateRevision"',
  'public."SharedBetaRuntimeReleaseMarker"."validUntil"',
  'public."Tenant"."id"',
  'public."Tenant"."status"',
  'public."Tenant"."customerStage"',
  'public."Tenant"."onboardingStatus"',
  'public."Tenant"."trialStartsAt"',
  'public."Tenant"."trialEndsAt"',
  'public."UserInvite"."id"',
  'public."UserInvite"."tenantId"',
  'public."UserInvite"."email"',
  'public."UserInvite"."identityClaimRevision"',
  'public."UserInvite"."tokenHash"',
  'public."UserInvite"."acceptedAt"',
  'public."UserInvite"."revokedAt"',
  'public."UserInvite"."expiresAt"',
  'public."UserInvite"."role"',
  'public."UserInvite"."accessScope"',
  'public."UserInvite"."customRoleId"',
  'public."UserInvite"."storeIds"',
  'public."IdentityEmailClaim"."emailCanonical"',
  'public."IdentityEmailClaim"."tenantId"',
  'public."IdentityEmailClaim"."claimType"',
  'public."IdentityEmailClaim"."subjectId"',
  'public."IdentityEmailClaim"."revision"',
]);
const EXPECTED_SUPPORT_UPDATE_COLUMN_IDENTITIES = Object.freeze([
  'public."Tenant"."id"',
  'public."UserInvite"."id"',
  'public."IdentityEmailClaim"."emailCanonical"',
  'public."IdentityMailDeliveryEvent"."id"',
]);
const EXPECTED_SUPPORT_COLUMN_PRIVILEGES = Object.freeze([
  ...EXPECTED_SUPPORT_SELECT_COLUMN_IDENTITIES.map((identity) =>
    Object.freeze({ identity, privilege: "SELECT" }),
  ),
  ...EXPECTED_SUPPORT_UPDATE_COLUMN_IDENTITIES.map((identity) =>
    Object.freeze({ identity, privilege: "UPDATE" }),
  ),
]);
const EXPECTED_PROTECTED_RELATIONS = Object.freeze([
  "IdentityMailDeliveryEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDutyRoleAclEpochV1",
  "IdentityMailDutyRoleManifestEvidenceV2",
  "IdentityMailDutyRoleManifestRevocationV2",
  "IdentityMailOutbox",
  "IdentityEmailClaim",
  "SharedBetaRuntimeReleaseMarker",
  "Tenant",
  "UserInvite",
  "_prisma_migrations",
]);
const EXPECTED_DATABASE_OWNER_RELATIONS = Object.freeze([
  "IdentityMailDeliveryEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailOutbox",
  "IdentityEmailClaim",
  "SharedBetaRuntimeReleaseMarker",
  "Tenant",
  "UserInvite",
  "_prisma_migrations",
]);
const EXPECTED_CREATED_TRIGGERS = Object.freeze([
  "IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger",
  "IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger",
  "IdentityMailEnrollmentEvent_insert_guard_v2_trigger",
  "IdentityMailEnrollmentEvent_immutable_dml_v2_trigger",
  "IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger",
  "IdentityMailEnrollment_registry_write_guard_v2_trigger",
  "IdentityMailEnrollment_registry_immutable_delete_v2_trigger",
  "IdentityMailEnrollment_registry_immutable_truncate_v2_trigger",
]);
const EXPECTED_PROTECTED_TRIGGERS = Object.freeze([
  Object.freeze({
    relation: "IdentityMailDeliveryEvent",
    trigger: "IdentityMailDeliveryEvent_row_guard_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryEvent",
    trigger: "IdentityMailDeliveryEvent_truncate_guard_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollment",
    trigger: "IdentityMailEnrollment_registry_immutable_delete_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollment",
    trigger: "IdentityMailEnrollment_registry_immutable_truncate_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollment",
    trigger: "IdentityMailEnrollment_registry_write_guard_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    trigger: "IdentityMailEnrollmentCommand_immutable_dml_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    trigger: "IdentityMailEnrollmentCommand_immutable_truncate_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    trigger: "IdentityMailEnrollmentCommand_import_insert_guard_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentEvent",
    trigger: "IdentityMailEnrollmentEvent_immutable_dml_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentEvent",
    trigger: "IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDeliveryTenantEnrollmentEvent",
    trigger: "IdentityMailEnrollmentEvent_insert_guard_v2_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleAclEpochV1",
    trigger: "IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleAclEpochV1",
    trigger: "IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    trigger: "IdentityMailManifestV2_immutable_dml_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    trigger: "IdentityMailManifestV2_immutable_truncate_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    trigger: "IdentityMailManifestV2_import_insert_guard_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    trigger: "IdentityMailManifestRevocationV2_immutable_dml_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    trigger: "IdentityMailManifestRevocationV2_immutable_truncate_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    trigger: "IdentityMailManifestRevocationV2_insert_lock_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailOutbox",
    trigger: "IdentityMailOutbox_delivery_event_trigger",
  }),
  Object.freeze({
    relation: "IdentityMailOutbox",
    trigger: "IdentityMailOutbox_delivery_guard_trigger",
  }),
]);

function normalizeText(value) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function digestText(value) {
  return createHash("sha256")
    .update(normalizeText(value), "utf8")
    .digest("hex");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function replaceInsideLiveAssert(value, searchValue, replacement) {
  const start = value.indexOf(
    'CREATE FUNCTION public."identity_mail_duty_role_live_assert_v1"',
  );
  const end = value.indexOf("\n$$;", start);
  if (start < 0 || end < 0) return value;
  const section = value.slice(start, end);
  const mutated = section.replace(searchValue, replacement);
  if (mutated === section) return value;
  return `${value.slice(0, start)}${mutated}${value.slice(end)}`;
}

function replaceInsideProtectedSurface(value, searchValue, replacement) {
  const start = value.indexOf(
    "-- The duty-role scan above proves that none of the three bounded roles has",
  );
  const end = value.indexOf(
    "-- The exact PG16 system PUBLIC baseline is version-pinned below.",
    start,
  );
  if (start < 0 || end < 0) return value;
  const section = value.slice(start, end);
  const mutated = section.replace(searchValue, replacement);
  if (mutated === section) return value;
  return `${value.slice(0, start)}${mutated}${value.slice(end)}`;
}

function exactMetadata(metadata) {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return false;
  }
  const keys = Object.keys(metadata).sort();
  const expectedKeys = [
    "applicationRoleAllowlistBound",
    "authorization",
    "authorityScope",
    "canMutate",
    "canSend",
    "candidate",
    "contract",
    "crossDatabaseAuthorityControlled",
    "futureCreatorDefaultPrivilegesControlled",
    "migrationSqlSha256",
    "ordinal",
    "predecessor",
    "productionApplyAuthorized",
    "schemaVersion",
    "status",
  ].sort();
  const predecessorKeys =
    metadata.predecessor && typeof metadata.predecessor === "object"
      ? Object.keys(metadata.predecessor).sort()
      : [];
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    predecessorKeys.join("|") ===
      ["count", "head", "headChecksum", "manifestDigest"].sort().join("|") &&
    metadata.schemaVersion === 1 &&
    metadata.contract ===
      "IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_V2_CANDIDATE_V1" &&
    metadata.candidate === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE &&
    metadata.ordinal === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ORDINAL &&
    metadata.authorization === false &&
    metadata.applicationRoleAllowlistBound === false &&
    metadata.authorityScope === "CURRENT_DATABASE_ONLY" &&
    metadata.canMutate === false &&
    metadata.canSend === false &&
    metadata.crossDatabaseAuthorityControlled === false &&
    metadata.futureCreatorDefaultPrivilegesControlled === false &&
    metadata.productionApplyAuthorized === false &&
    metadata.status === "NOT_DEPLOYABLE"
  );
}

function auditSql(sql, metadata, candidateDirectories) {
  const findings = new Set();
  const normalized = normalizeText(sql);
  const statements = normalized.replace(/^\s*--.*$/gmu, "");

  if (
    !/^BEGIN;\n/u.test(normalized) ||
    !/\nCOMMIT;\n?$/u.test(normalized) ||
    countMatches(normalized, /^BEGIN;$/gmu) !== 1 ||
    countMatches(normalized, /^COMMIT;$/gmu) !== 1 ||
    !normalized.includes("SET LOCAL lock_timeout = '5s';") ||
    !normalized.includes("SET LOCAL statement_timeout = '60s';") ||
    !normalized.includes(
      "SET LOCAL idle_in_transaction_session_timeout = '60s';",
    )
  ) {
    findings.add(F.TRANSACTION_ENVELOPE);
  }

  if (
    !exactMetadata(metadata) ||
    metadata.migrationSqlSha256 !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SQL_SHA256
  ) {
    findings.add(F.METADATA_DRIFT);
  }
  if (digestText(normalized) !== metadata?.migrationSqlSha256) {
    findings.add(F.SQL_SHA_DRIFT);
  }
  if (
    metadata?.predecessor?.count !== EXPECTED_METADATA_PREDECESSOR_COUNT ||
    metadata?.predecessor?.head !== EXPECTED_METADATA_PREDECESSOR ||
    metadata?.predecessor?.manifestDigest !==
      EXPECTED_METADATA_PREDECESSOR_MANIFEST_DIGEST ||
    metadata?.predecessor?.headChecksum !== EXPECTED_PREDECESSOR_SHA256 ||
    !normalized.includes(
      `completed_count IS DISTINCT FROM ${EXPECTED_SQL_PREDECESSOR_COUNT}`,
    ) ||
    !normalized.includes(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PREDECESSOR) ||
    !normalized.includes(EXPECTED_SQL_PREDECESSOR_MANIFEST_DIGEST) ||
    !normalized.includes(EXPECTED_PREDECESSOR_SHA256)
  ) {
    findings.add(F.PREDECESSOR_DRIFT);
  }

  if (/^\s*(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER)\b/gimu.test(statements)) {
    findings.add(F.ROLE_DDL_FORBIDDEN);
  }
  if (/^\s*GRANT\b/gimu.test(statements)) findings.add(F.GRANT_FORBIDDEN);
  if (
    /^\s*(?:ALTER\s+SYSTEM|CREATE\s+EXTENSION|COPY\b[^\n]*\bPROGRAM\b)/gimu.test(
      statements,
    ) ||
    /\b(?:dblink|pg_read_file|pg_write_file|lo_import|lo_export)\s*\(/iu.test(
      statements,
    ) ||
    /\b(?:PASSWORD|SMTP|CREDENTIAL|PRIVATE[_ ]KEY)\b/iu.test(statements) ||
    !normalized.includes("NOT_DEPLOYABLE")
  ) {
    findings.add(F.PRODUCTION_AUTHORITY_FORBIDDEN);
  }

  if (
    !normalized.includes(
      'CREATE TABLE public."IdentityMailDutyRoleAclEpochV1"',
    ) ||
    !normalized.includes('PRIMARY KEY ("epoch")') ||
    !normalized.includes('UNIQUE ("operationId")') ||
    !normalized.includes('UNIQUE ("epoch", "payloadDigest")') ||
    !normalized.includes(
      'FOREIGN KEY ("previousEpoch", "previousPayloadDigest")',
    ) ||
    !normalized.includes("MATCH FULL") ||
    !normalized.includes("DEFERRABLE INITIALLY DEFERRED") ||
    !normalized.includes("IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1") ||
    !normalized.includes("IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1") ||
    !normalized.includes("IDENTITY_MAIL_DUTY_GRANTS_PG16_V1") ||
    !normalized.includes('"deploymentRoleName" VARCHAR(63) NOT NULL') ||
    !normalized.includes('"deploymentRoleOid" BIGINT NOT NULL') ||
    !normalized.includes('"applyReceiptDigest" CHAR(64) NOT NULL') ||
    !normalized.includes('"beforeCatalogDigest" CHAR(64) NOT NULL') ||
    !normalized.includes('"beforeCatalogCanonicalJson" TEXT,') ||
    !normalized.includes('"planDigest" CHAR(64) NOT NULL') ||
    !normalized.includes('"definitionManifestDigest" CHAR(64) NOT NULL') ||
    !normalized.includes(
      "\"reasonCode\" IN (\n        'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'\n      )",
    ) ||
    !normalized.includes("IS DISTINCT FROM 39::BIGINT")
  ) {
    findings.add(F.EPOCH_LEDGER_DRIFT);
  }
  if (
    countMatches(
      normalized,
      /LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1/gu,
    ) < 2 ||
    !normalized.includes("|| E'\\n' || p_payload_canonical_json || E'\\n'") ||
    !normalized.includes("|| E'\\n' || \"payloadCanonicalJson\" || E'\\n'")
  ) {
    findings.add(F.EPOCH_DIGEST_DOMAIN_DRIFT);
  }
  if (
    !normalized.includes("epoch_value IS DISTINCT FROM current_epoch + 1") ||
    !normalized.includes(
      'previous_epoch IS DISTINCT FROM previous_record."epoch"',
    ) ||
    !normalized.includes(
      'previous_payload_digest IS DISTINCT FROM\n         previous_record."payloadDigest"::TEXT',
    ) ||
    !normalized.includes("unfinished_migration_count IS DISTINCT FROM 0") ||
    !normalized.includes("rolled_back_migration_count IS DISTINCT FROM 0") ||
    countMatches(
      normalized,
      /observed_migration_manifest_digest IS DISTINCT FROM/gu,
    ) < 2 ||
    !normalized.includes(
      "reason_code IN ('ROLLBACK', 'EMERGENCY_CONTAINMENT')",
    ) ||
    !normalized.includes('previous_record."exactGrantsProfile"::TEXT') ||
    !normalized.includes('previous_record."exactGrantsDigest"::TEXT') ||
    !normalized.includes('previous_record."applyReceiptDigest"::TEXT') ||
    !normalized.includes("Inactive ACL epochs must carry forward")
  ) {
    findings.add(F.EPOCH_MONOTONICITY_DRIFT);
  }

  if (
    countMatches(
      normalized,
      /LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_APPLY_RECEIPT_CURRENT186_V1/gu,
    ) !== 1 ||
    countMatches(
      normalized,
      /LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_REHEARSAL_EVIDENCE_CURRENT186_V1/gu,
    ) !== 1 ||
    !normalized.includes(
      "evidence_digest IS DISTINCT FROM observed_evidence_digest",
    ) ||
    !normalized.includes(
      "apply_receipt_digest IS DISTINCT FROM observed_apply_receipt_digest",
    ) ||
    !normalized.includes("|| E'\\n' || operation_id") ||
    !normalized.includes("|| E'\\n' || epoch_value::TEXT") ||
    !normalized.includes("|| E'\\n' || before_catalog_digest") ||
    !normalized.includes("|| E'\\n' || plan_digest") ||
    !normalized.includes("|| E'\\n' || definition_manifest_digest") ||
    !normalized.includes("|| E'\\n' || application_artifact_sha256 || E'\\n'")
  ) {
    findings.add(F.EVIDENCE_DIGEST_DRIFT);
  }

  if (
    countMatches(
      normalized,
      /LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_V1/gu,
    ) !== 2 ||
    countMatches(
      normalized,
      new RegExp(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_MANIFEST_DIGEST,
        "gu",
      ),
    ) < 3 ||
    !normalized.includes("routine_definition_count IS DISTINCT FROM 23") ||
    !normalized.includes("trigger_definition_count IS DISTINCT FROM 21") ||
    !normalized.includes("protected_relation_count IS DISTINCT FROM 9") ||
    !normalized.includes("definition_routine_count IS DISTINCT FROM 23") ||
    !normalized.includes("definition_trigger_count IS DISTINCT FROM 21") ||
    !normalized.includes(
      "definition_protected_relation_count IS DISTINCT FROM 9",
    ) ||
    !normalized.includes(
      "identity_mail_duty_role_acl_epoch_definition_manifest_check",
    ) ||
    !normalized.includes("trigger_definition_drift") ||
    !normalized.includes("definition_manifest_constraint_drift") ||
    !normalized.includes('acl_record."definitionManifestDigest"::TEXT') ||
    EXPECTED_PROTECTED_TRIGGERS.some(
      ({ relation, trigger }) =>
        normalized.split(`('${relation}'::TEXT, '${trigger}'::TEXT)`).length -
          1 !==
        4,
    )
  ) {
    findings.add(F.DEFINITION_MANIFEST_DRIFT);
  }

  if (
    !normalized.includes(
      "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_PUBLIC_ACL_BASELINE_PG16_V1",
    ) ||
    countMatches(
      normalized,
      new RegExp(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST,
        "gu",
      ),
    ) !== 2 ||
    !normalized.includes("pg_catalog.pg_parameter_acl") ||
    !normalized.includes("pg_catalog.pg_foreign_data_wrapper") ||
    !normalized.includes("pg_catalog.pg_foreign_server") ||
    !normalized.includes("pg_catalog.pg_tablespace") ||
    !normalized.includes("pg_catalog.pg_largeobject_metadata") ||
    !normalized.includes(
      "p_reason_code IN (\n    'APPLY', 'ROTATE', 'EMERGENCY_CONTAINMENT', 'RUNTIME_COORDINATOR'\n  )",
    ) ||
    !normalized.includes("acl.grantor <> namespace.nspowner") ||
    !normalized.includes(
      "namespace.nspname NOT IN ('information_schema', 'public')",
    ) ||
    !normalized.includes("systemPublicAclBaselineDigest")
  ) {
    findings.add(F.PUBLIC_ACL_BASELINE_DRIFT);
  }

  if (
    countMatches(normalized, /'authorityScope', 'CURRENT_DATABASE_ONLY'/gu) !==
      5 ||
    countMatches(normalized, /'crossDatabaseAuthorityControlled', false/gu) !==
      5 ||
    countMatches(
      normalized,
      /'futureCreatorDefaultPrivilegesControlled', false/gu,
    ) !== 5 ||
    countMatches(normalized, /'applicationRoleAllowlistBound', false/gu) !==
      5 ||
    countMatches(normalized, /'productionApplyAuthorized', false/gu) !== 5
  ) {
    findings.add(F.AUTHORITY_SCOPE_DRIFT);
  }

  if (
    !normalized.includes("pg_catalog.pg_advisory_xact_lock(1279677004, 186)") ||
    countMatches(normalized, /identity_mail_duty_role_acl_lock_v1"\(\)/gu) < 4
  ) {
    findings.add(F.LOCK_DRIFT);
  }
  const driverStart = normalized.indexOf(
    'CREATE FUNCTION public."identity_mail_tenant_enrollment_drive_command_v2"',
  );
  const tenantLock = normalized.indexOf(
    'tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);',
    driverStart,
  );
  const aclLock = normalized.indexOf(
    'current_acl_epoch := public."identity_mail_duty_role_acl_lock_v1"();',
    driverStart,
  );
  if (driverStart < 0 || tenantLock < driverStart || aclLock < tenantLock) {
    findings.add(F.LOCK_ORDER_DRIFT);
  }

  const createdFunctions = [
    ...normalized.matchAll(/CREATE FUNCTION public\."([a-z0-9_]+)"\s*\(/gu),
  ].map((match) => match[1]);
  const importerBindingStart = normalized.indexOf(
    "DO $importer_owner_binding$",
  );
  const importerBindingEnd = normalized.indexOf(
    "$importer_owner_binding$;",
    importerBindingStart + 1,
  );
  const importerBinding =
    importerBindingStart < 0 || importerBindingEnd < 0
      ? ""
      : normalized.slice(importerBindingStart, importerBindingEnd);
  const projectionNarrowingStart = normalized.indexOf(
    "DO $worker_v2_projection_narrowing$",
  );
  const projectionNarrowingEnd = normalized.indexOf(
    "$worker_v2_projection_narrowing$;",
    projectionNarrowingStart + 1,
  );
  const projectionNarrowing =
    projectionNarrowingStart < 0 || projectionNarrowingEnd < 0
      ? ""
      : normalized.slice(projectionNarrowingStart, projectionNarrowingEnd);
  const expectedIdentityClaimProjection = [
    "emailCanonical",
    "tenantId",
    "claimType",
    "subjectId",
    "revision",
  ];
  if (
    createdFunctions.length !== EXPECTED_FUNCTIONS.length ||
    EXPECTED_FUNCTIONS.some(
      ({ name }) =>
        createdFunctions.filter((entry) => entry === name).length !== 1,
    ) ||
    normalized.includes("'identity_mail_duty_role_acl_immutable_guard_v1'") ||
    countMatches(normalized, /CREATE OR REPLACE FUNCTION/gu) !== 1 ||
    !importerBinding.includes(
      'CREATE OR REPLACE FUNCTION public."identity_mail_tenant_enrollment_import_evidence_v2"(',
    ) ||
    countMatches(
      importerBinding,
      new RegExp(EXPECTED_CURRENT185_IMPORTER_PROSRC_SHA256, "gu"),
    ) !== 1 ||
    countMatches(
      importerBinding,
      new RegExp(EXPECTED_CURRENT186_IMPORTER_PROSRC_SHA256, "gu"),
    ) !== 2 ||
    countMatches(importerBinding, /'leetplus_database_owner'/gu) !== 1 ||
    countMatches(
      importerBinding,
      /'20260802020000_identity_mail_worker_v2_lost_response_replay'/gu,
    ) !== 1 ||
    countMatches(
      importerBinding,
      /'20260803010000_identity_mail_duty_role_runtime_boundary_v2'/gu,
    ) !== 1 ||
    countMatches(
      importerBinding,
      /'9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'/gu,
    ) !== 1 ||
    countMatches(importerBinding, /marker\."migrationCount" = 184/gu) !== 1 ||
    countMatches(importerBinding, /marker\."migrationCount" = 186/gu) !== 1 ||
    !importerBinding.includes(
      "INNER JOIN pg_catalog.pg_roles AS database_owner",
    ) ||
    !importerBinding.includes("database_entry.datdba = routine.proowner") ||
    !importerBinding.includes(
      'database_entry.oid::BIGINT IS NOT DISTINCT FROM\n           command_record."expectedDatabaseOid"',
    ) ||
    !importerBinding.includes(
      "(grants_projection#>>'{database,ownerName}' COLLATE \"C\")",
    ) ||
    !importerBinding.includes(
      "(grants_projection#>>'{database,ownerOid}' COLLATE \"C\")",
    ) ||
    importerBinding.includes(
      "(grants_projection#>>'{database,ownerOid}')::BIGINT",
    ) ||
    !importerBinding.includes(
      'pg_catalog.string_agg(\n                   migration."migration_name" || \' \' || migration."checksum"',
    ) ||
    countMatches(
      importerBinding,
      /FROM public\."_prisma_migrations" AS migration/gu,
    ) !== 2 ||
    !importerBinding.includes(
      'WHERE migration."finished_at" IS NULL\n              OR migration."rolled_back_at" IS NOT NULL',
    ) ||
    !importerBinding.includes(
      "database_owner.rolname::TEXT NOT IN (\n           'current_role', 'current_user', 'none', 'postgres', 'public'",
    ) ||
    !importerBinding.includes(
      "patched_prosrc := pg_catalog.replace(\n    pg_catalog.replace(\n      importer_prosrc",
    ) ||
    !importerBinding.includes("legacy_marker_occurrences IS DISTINCT FROM 1") ||
    !importerBinding.includes(
      "replacement_marker_occurrences IS DISTINCT FROM 0",
    ) ||
    !importerBinding.includes(
      "importer_metadata_after IS DISTINCT FROM importer_metadata_before",
    ) ||
    !importerBinding.includes("FROM pg_catalog.aclexplode(") ||
    !importerBinding.includes("routine.prosrc, 'UTF8'") ||
    !importerBinding.includes("CALLED ON NULL INPUT") ||
    !importerBinding.includes("SECURITY DEFINER") ||
    !importerBinding.includes("SET search_path = pg_catalog") ||
    projectionNarrowing.length === 0 ||
    EXPECTED_WORKER_PROJECTION_REWRITES.some(
      ({ predecessor, signature, successor }) =>
        projectionNarrowing.split(`'${signature}'::TEXT`).length - 1 !== 1 ||
        projectionNarrowing.split(`'${predecessor}'::TEXT`).length - 1 !== 1 ||
        projectionNarrowing.split(`'${successor}'::TEXT`).length - 1 !== 1,
    ) ||
    countMatches(
      projectionNarrowing,
      new RegExp(EXPECTED_CURRENT185_WORKER_ASSERT_PROSRC_SHA256, "gu"),
    ) !== 1 ||
    countMatches(
      projectionNarrowing,
      new RegExp(EXPECTED_CURRENT186_WORKER_ASSERT_PROSRC_SHA256, "gu"),
    ) !== 1 ||
    !projectionNarrowing.includes(
      "worker_assert_signature CONSTANT TEXT :=\n    'public.identity_mail_delivery_worker_assert_v2(text,text)'",
    ) ||
    !projectionNarrowing.includes(
      "current184_receipt_guard CONSTANT TEXT :=\n    'migration_count IS DISTINCT FROM 184'",
    ) ||
    !projectionNarrowing.includes(
      "current186_receipt_guard CONSTANT TEXT :=\n    'migration_count IS DISTINCT FROM 186'",
    ) ||
    !projectionNarrowing.includes(
      "metadata changed while rebinding database receipt",
    ) ||
    !normalized.includes(
      "CURRENT_186 NOT_DEPLOYABLE ACTIVE worker-v2 readiness pinned to exact CURRENT_186; database-local authorization boundary only and send remain false.",
    ) ||
    countMatches(
      normalized,
      new RegExp(EXPECTED_EMAIL_CLAIM_LOCK_PROSRC_SHA256, "gu"),
    ) !== 1 ||
    countMatches(
      normalized,
      /public\."identity_email_claim_lock_v1"\(text\)/gu,
    ) !== 1 ||
    [
      "patched_prosrc LIKE '%target_invite.*%'",
      "patched_prosrc LIKE '%target_tenant.*%'",
      "patched_prosrc LIKE '%identity_claim.*%'",
      `patched_prosrc LIKE '%public."UserInvite"%ROWTYPE%'`,
      `patched_prosrc LIKE '%public."Tenant"%ROWTYPE%'`,
      `patched_prosrc LIKE '%public."IdentityEmailClaim"%ROWTYPE%'`,
    ].some((guard) => projectionNarrowing.split(guard).length - 1 !== 1) ||
    expectedIdentityClaimProjection.some(
      (column) =>
        projectionNarrowing.split(`identity_claim."${column}"`).length - 1 !==
        3,
    ) ||
    projectionNarrowing.split('NULL::VARCHAR(320) AS "emailCanonical"').length -
      1 !==
      1 ||
    projectionNarrowing.split("expected.claim_record_reset_count = 1").length -
      1 !==
      2 ||
    projectionNarrowing.split("expected.reap_email_order_alias_count = 1")
      .length -
      1 !==
      2 ||
    !projectionNarrowing.includes(
      "reap_email_order_expression CONSTANT TEXT :=\n    '    ORDER BY \"emailCanonical\"';",
    ) ||
    !projectionNarrowing.includes(
      "patched_prosrc LIKE '%claim_record := NULL;%'",
    ) ||
    !projectionNarrowing.includes(
      'patched_prosrc LIKE \'%ORDER BY "emailCanonical" COLLATE "C"%\'',
    ) ||
    projectionNarrowing.includes('identity_claim."createdAt"') ||
    projectionNarrowing.includes('identity_claim."updatedAt"') ||
    projectionNarrowing.includes('identity_claim."workflowLocator"') ||
    !normalized.includes(
      "p_payload_canonical_json TEXT,\n  p_payload_digest TEXT,\n  p_before_catalog_canonical_json TEXT",
    ) ||
    normalized.includes(
      "identity_mail_duty_role_acl_epoch_append_v1(text,text)",
    ) ||
    countMatches(
      normalized,
      /identity_mail_duty_role_acl_epoch_append_v1\(text,text,text\)/gu,
    ) !== 9 ||
    !normalized.includes(
      "('identity_mail_duty_role_acl_epoch_append_v1', 3, false, 'v'::\"char\")",
    ) ||
    !normalized.includes(
      'ON FUNCTION public."identity_mail_duty_role_acl_epoch_append_v1"(TEXT, TEXT, TEXT)',
    ) ||
    !normalized.includes(
      "p_tenant_id text, p_command_id text, p_authorization_envelope_digest text, p_manifest_payload_digest text",
    )
  ) {
    findings.add(F.FUNCTION_SURFACE_DRIFT);
  }
  for (const expected of EXPECTED_FUNCTIONS) {
    const start = normalized.indexOf(
      `CREATE FUNCTION public."${expected.name}"`,
    );
    const end = normalized.indexOf("$$;", start);
    const body = start < 0 || end < 0 ? "" : normalized.slice(start, end);
    if (
      (expected.securityDefiner && !body.includes("SECURITY DEFINER")) ||
      (!expected.securityDefiner && !body.includes("SECURITY INVOKER"))
    ) {
      findings.add(F.SECURITY_DEFINER_DRIFT);
    }
    if (!body.includes("SET search_path = pg_catalog")) {
      findings.add(F.SEARCH_PATH_DRIFT);
    }
  }
  const postconditionStart = normalized.indexOf("DO $postcondition$");
  const postconditionManifestStart = normalized.indexOf(
    "  WITH\n  expected_routines(signature) AS (",
    postconditionStart,
  );
  const postconditionDeparseContext = normalized.indexOf(
    "PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);",
    postconditionStart,
  );
  if (
    postconditionStart < 0 ||
    postconditionManifestStart < 0 ||
    postconditionDeparseContext < postconditionStart ||
    postconditionDeparseContext > postconditionManifestStart ||
    countMatches(
      normalized,
      /PERFORM pg_catalog\.set_config\('search_path', 'pg_catalog', true\);/gu,
    ) !== 1
  ) {
    findings.add(F.SEARCH_PATH_DRIFT);
  }

  if (
    countMatches(normalized, /^REVOKE ALL PRIVILEGES$/gmu) !== 8 ||
    countMatches(normalized, /has_database_privilege/gu) !== 6 ||
    !normalized.includes("has_schema_privilege") ||
    !normalized.includes("has_table_privilege") ||
    !normalized.includes("has_sequence_privilege") ||
    !normalized.includes("has_column_privilege") ||
    !normalized.includes("has_function_privilege") ||
    !normalized.includes("pg_catalog.oidvectortypes(routine.proargtypes)") ||
    !normalized.includes("effective ACL drifted") ||
    !normalized.includes(
      "coordinator_role.rolcanlogin IS DISTINCT FROM true",
    ) ||
    !normalized.includes("worker_role.rolcanlogin IS DISTINCT FROM true") ||
    !normalized.includes("owner_role.rolcanlogin IS DISTINCT FROM false") ||
    !normalized.includes("pg_catalog.pg_auth_members") ||
    !normalized.includes("pg_catalog.pg_db_role_setting") ||
    !normalized.includes("pg_catalog.pg_default_acl") ||
    !normalized.includes(
      "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DIRECT_DUTY_ACL_CURRENT186_V1",
    ) ||
    !normalized.includes("protected surface has an unexpected principal") ||
    !normalized.includes('acl_record."exactGrantsDigest" IS DISTINCT FROM') ||
    !normalized.includes("acl_record.\"reasonCode\" NOT IN ('APPLY', 'ROTATE')")
  ) {
    findings.add(F.ACL_DRIFT);
  }

  const liveAssertStart = normalized.indexOf(
    'CREATE FUNCTION public."identity_mail_duty_role_live_assert_v1"',
  );
  const liveAssertEnd = normalized.indexOf("\n$$;", liveAssertStart);
  const liveAssert =
    liveAssertStart < 0 || liveAssertEnd < 0
      ? ""
      : normalized.slice(liveAssertStart, liveAssertEnd);
  if (
    !liveAssert.includes(
      "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',\n       'RUNTIME_COORDINATOR'",
    ) ||
    countMatches(
      liveAssert,
      /p_reason_code <> 'RUNTIME_COORDINATOR'\n       AND NOT EXISTS \(\n         SELECT 1\n         FROM pg_catalog\.pg_roles AS deployment_role\n         WHERE deployment_role\.oid = p_deployment_role_oid::OID\n           AND deployment_role\.rolname = session_user\n           AND deployment_role\.rolsuper/gu,
    ) !== 1 ||
    countMatches(
      liveAssert,
      /p_reason_code = 'RUNTIME_COORDINATOR'\n       AND NOT EXISTS \(\n         SELECT 1\n         FROM pg_catalog\.pg_roles AS coordinator_role\n         WHERE coordinator_role\.oid = p_coordinator_role_oid::OID\n           AND coordinator_role\.rolname = session_user/gu,
    ) !== 1 ||
    countMatches(
      liveAssert,
      /p_reason_code IN \('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR'\)\n       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID/gu,
    ) !== 1
  ) {
    findings.add(F.RUNTIME_CALLER_BINDING_DRIFT);
  }
  const protectedSurfaceStart = liveAssert.indexOf(
    "-- The duty-role scan above proves that none of the three bounded roles has",
  );
  const protectedSurfaceEnd = liveAssert.indexOf(
    "-- The exact PG16 system PUBLIC baseline is version-pinned below.",
    protectedSurfaceStart,
  );
  const protectedSurface =
    protectedSurfaceStart < 0 || protectedSurfaceEnd < 0
      ? ""
      : liveAssert.slice(protectedSurfaceStart, protectedSurfaceEnd);
  const supportRoutineAclTuple =
    `'ROUTINE',\n` +
    `      'public."identity_email_claim_lock_v1"(text)'::TEXT,\n` +
    `      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,\n` +
    `      'EXECUTE', false`;
  const protectedSupportRoutineAclTuple =
    `'ROUTINE',\n` +
    `      'public.identity_email_claim_lock_v1(text)'::TEXT,\n` +
    `      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,\n` +
    `      'EXECUTE', false`;
  const supportRelationsWithoutTableDml = [
    "SharedBetaRuntimeReleaseMarker",
    "Tenant",
    "UserInvite",
    "IdentityEmailClaim",
  ];
  if (
    EXPECTED_SUPPORT_COLUMN_PRIVILEGES.some(
      ({ identity, privilege }) =>
        liveAssert.split(`('${identity}'::TEXT, '${privilege}'::TEXT)`).length -
          1 !==
        2,
    ) ||
    countMatches(
      liveAssert,
      /'COLUMN', expected_column\.identity,\n      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,\n      expected_column\.privilege, false/gu,
    ) !== 2 ||
    countMatches(
      liveAssert,
      /\) AS expected_column\(identity, privilege\)\n    WHERE p_reason_code IN \('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR'\)/gu,
    ) !== 2 ||
    EXPECTED_PROTECTED_RELATIONS.some(
      (relation) =>
        protectedSurface.split(`('${relation}'::TEXT)`).length - 1 !== 1,
    ) ||
    liveAssert.split(supportRoutineAclTuple).length - 1 !== 1 ||
    protectedSurface.split(protectedSupportRoutineAclTuple).length - 1 !== 1 ||
    protectedSurface.split(
      `('public.identity_email_claim_lock_v1(text)'::TEXT)`,
    ).length -
      1 !==
      1 ||
    supportRelationsWithoutTableDml.some((relation) =>
      ["SELECT", "UPDATE"].some((privilege) =>
        liveAssert.includes(
          `('public."${relation}"'::TEXT, '${privilege}'::TEXT)`,
        ),
      ),
    ) ||
    liveAssert.includes(
      `('public."IdentityMailDeliveryEvent"'::TEXT, 'UPDATE'::TEXT)`,
    )
  ) {
    findings.add(F.MARKER_COLUMN_AUTHORITY_DRIFT);
  }
  if (
    !protectedSurface.includes("FROM protected_routines AS expected_routine") ||
    !protectedSurface.includes(
      "WHEN expected_routine.signature =\n          'public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'\n        THEN p_coordinator_role_oid::OID\n        ELSE p_worker_role_oid::OID",
    )
  ) {
    findings.add(F.ACL_DRIFT);
  }
  const epochAppenderStart = normalized.indexOf(
    'CREATE FUNCTION public."identity_mail_duty_role_acl_epoch_append_v1"',
  );
  const epochAppenderEnd = normalized.indexOf("\n$$;", epochAppenderStart);
  const epochAppender =
    epochAppenderStart < 0 || epochAppenderEnd < 0
      ? ""
      : normalized.slice(epochAppenderStart, epochAppenderEnd);
  const epochInsert = epochAppender.indexOf(
    'INSERT INTO public."IdentityMailDutyRoleAclEpochV1"',
  );
  const appenderEmergencySessionProbe = epochAppender.lastIndexOf(
    "FROM pg_catalog.pg_stat_activity AS activity",
  );
  if (
    countMatches(liveAssert, /pg_catalog\.pg_stat_clear_snapshot\(\)/gu) !==
      1 ||
    countMatches(epochAppender, /pg_catalog\.pg_stat_clear_snapshot\(\)/gu) !==
      1 ||
    countMatches(
      liveAssert,
      /FROM pg_catalog\.pg_stat_activity AS activity/gu,
    ) !== 1 ||
    countMatches(
      epochAppender,
      /FROM pg_catalog\.pg_stat_activity AS activity/gu,
    ) !== 1 ||
    !liveAssert.includes(
      "WHERE activity.usesysid IN (\n      p_schema_owner_role_oid::OID,\n      p_coordinator_role_oid::OID,\n      p_worker_role_oid::OID\n    )",
    ) ||
    !epochAppender.includes(
      "WHERE activity.usesysid IN (\n      owner_role.oid, coordinator_role.oid, worker_role.oid\n    )",
    ) ||
    !liveAssert.includes(
      "Identity-mail duty-role emergency session barrier is not zero",
    ) ||
    !epochAppender.includes(
      "Identity-mail duty-role emergency epoch session barrier is not zero",
    ) ||
    appenderEmergencySessionProbe < 0 ||
    epochInsert < 0 ||
    appenderEmergencySessionProbe > epochInsert
  ) {
    findings.add(F.EMERGENCY_SESSION_BARRIER_DRIFT);
  }

  const recoveryCatalogProjectionStart = epochAppender.indexOf(
    "before_catalog IS DISTINCT FROM pg_catalog.jsonb_build_object(",
  );
  const recoveryCatalogProjectionEnd = epochAppender.indexOf(
    "OR before_catalog->>'schemaVersion' IS DISTINCT FROM '1'",
    recoveryCatalogProjectionStart,
  );
  const recoveryCatalogProjection =
    recoveryCatalogProjectionStart < 0 || recoveryCatalogProjectionEnd < 0
      ? ""
      : epochAppender.slice(
          recoveryCatalogProjectionStart,
          recoveryCatalogProjectionEnd,
        );
  const recoveryCatalogKeys = Object.freeze([
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
  ]);
  if (
    countMatches(normalized, /BETWEEN 2 AND 600000/gu) !== 2 ||
    !epochAppender.includes("IS DISTINCT FROM 39::BIGINT") ||
    normalized.includes("beforeCatalogCanonicalJsonHex") ||
    !normalized.includes('"beforeCatalogCanonicalJson" TEXT,') ||
    !normalized.includes(
      'ALTER COLUMN "beforeCatalogCanonicalJson" SET STORAGE EXTENDED',
    ) ||
    countMatches(normalized, /EPOCH_COLUMN_CANONICAL_JSON_V1/gu) !== 2 ||
    countMatches(normalized, /BETWEEN 2 AND 4194304/gu) !== 2 ||
    countMatches(
      normalized,
      /LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1/gu,
    ) !== 2 ||
    !normalized.includes(
      "\"reasonCode\" IN ('APPLY', 'ROTATE')\n          AND (\"payloadCanonicalJson\"::JSONB)",
    ) ||
    !normalized.includes(
      "->>'beforeCatalogStorageProfile' =\n              'EPOCH_COLUMN_CANONICAL_JSON_V1'",
    ) ||
    !normalized.includes('"beforeCatalogCanonicalJson" IS NOT NULL') ||
    !normalized.includes(
      "\"reasonCode\" IN ('ROLLBACK', 'EMERGENCY_CONTAINMENT')",
    ) ||
    !normalized.includes("->'beforeCatalogStorageProfile' = 'null'::JSONB") ||
    !normalized.includes('"beforeCatalogCanonicalJson" IS NULL') ||
    !epochAppender.includes("p_before_catalog_canonical_json TEXT") ||
    !epochAppender.includes("payload->>'beforeCatalogStorageProfile'") ||
    !epochAppender.includes("payload->>'directDutyAclDigest'") ||
    !epochAppender.includes("payload->>'systemPublicAclBaselineDigest'") ||
    !epochAppender.includes(
      "'beforeCatalogStorageProfile', before_catalog_storage_profile",
    ) ||
    !epochAppender.includes("'directDutyAclDigest', direct_duty_acl_digest") ||
    !epochAppender.includes(
      "'systemPublicAclBaselineDigest', system_public_acl_baseline_digest",
    ) ||
    !epochAppender.includes(
      "before_catalog_storage_profile IS DISTINCT FROM\n         'EPOCH_COLUMN_CANONICAL_JSON_V1'",
    ) ||
    !epochAppender.includes("p_before_catalog_canonical_json::JSONB") ||
    recoveryCatalogKeys.some(
      (key) =>
        countMatches(
          recoveryCatalogProjection,
          new RegExp(`before_catalog->'${key}'`, "gu"),
        ) !== 1,
    ) ||
    countMatches(recoveryCatalogProjection, /before_catalog->'/gu) !== 20 ||
    !epochAppender.includes(
      "before_catalog->>'userRoutineDefinitionCount' !~\n         '^(0|[1-9][0-9]{0,15})$'",
    ) ||
    !epochAppender.includes(
      "before_catalog->>'userRoutineDefinitionDigest' !~\n         '^[0-9a-f]{64}$'",
    ) ||
    !epochAppender.includes(
      "before_catalog->'userRoutineDefinitionDigest'\n       ) IS DISTINCT FROM 'string'",
    ) ||
    !epochAppender.includes(
      "'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'",
    ) ||
    !epochAppender.includes(") IS DISTINCT FROM before_catalog_digest") ||
    !epochAppender.includes(
      "ELSIF before_catalog_storage_profile IS NOT NULL\n     OR p_before_catalog_canonical_json IS NOT NULL",
    ) ||
    !epochAppender.includes(
      "Inactive ACL epochs require a null recovery sidecar",
    ) ||
    !epochAppender.includes(
      '"beforeCatalogDigest", "beforeCatalogCanonicalJson", "planDigest"',
    ) ||
    !epochAppender.includes(
      "before_catalog_digest, p_before_catalog_canonical_json, plan_digest",
    ) ||
    !epochAppender.includes(
      "direct_duty_acl_digest IS DISTINCT FROM\n       observed_direct_duty_acl_digest",
    ) ||
    !epochAppender.includes(
      "system_public_acl_baseline_digest IS DISTINCT FROM\n       observed_system_public_acl_baseline_digest",
    )
  ) {
    findings.add(F.RECOVERY_BEFORE_IMAGE_DRIFT);
  }
  const driverOwnershipSurface =
    driverStart < 0 ? "" : normalized.slice(driverStart);
  const liveDatabaseOwnerRelationsStart = liveAssert.indexOf(
    "underlying_relations(relation_name) AS (",
  );
  const liveDatabaseOwnerRelationsEnd = liveAssert.indexOf(
    "\n  )\n  SELECT",
    liveDatabaseOwnerRelationsStart,
  );
  const liveDatabaseOwnerRelations =
    liveDatabaseOwnerRelationsStart < 0 || liveDatabaseOwnerRelationsEnd < 0
      ? ""
      : liveAssert.slice(
          liveDatabaseOwnerRelationsStart,
          liveDatabaseOwnerRelationsEnd,
        );
  const freshDatabaseOwnerRelationsStart = driverOwnershipSurface.indexOf(
    "AND relation.relowner = database_owner_oid\n         AND relation.relname IN (",
  );
  const freshDatabaseOwnerRelationsEnd = driverOwnershipSurface.indexOf(
    "\n         )\n     ) IS DISTINCT FROM 8::BIGINT",
    freshDatabaseOwnerRelationsStart,
  );
  const freshDatabaseOwnerRelations =
    freshDatabaseOwnerRelationsStart < 0 || freshDatabaseOwnerRelationsEnd < 0
      ? ""
      : driverOwnershipSurface.slice(
          freshDatabaseOwnerRelationsStart,
          freshDatabaseOwnerRelationsEnd,
        );
  const ownerCatalogs = Object.freeze([
    "pg_catalog.pg_database",
    "pg_catalog.pg_namespace",
    "pg_catalog.pg_class",
    "pg_catalog.pg_proc",
    "pg_catalog.pg_type",
    "pg_catalog.pg_language",
    "pg_catalog.pg_foreign_data_wrapper",
    "pg_catalog.pg_foreign_server",
    "pg_catalog.pg_tablespace",
    "pg_catalog.pg_largeobject_metadata",
    "pg_catalog.pg_extension",
    "pg_catalog.pg_collation",
    "pg_catalog.pg_conversion",
    "pg_catalog.pg_operator",
    "pg_catalog.pg_opclass",
    "pg_catalog.pg_opfamily",
    "pg_catalog.pg_ts_config",
    "pg_catalog.pg_ts_dict",
    "pg_catalog.pg_statistic_ext",
    "pg_catalog.pg_event_trigger",
    "pg_catalog.pg_publication",
    "pg_catalog.pg_subscription",
    "pg_catalog.pg_user_mappings",
    "pg_catalog.pg_prepared_xacts",
  ]);
  if (
    !normalized.includes("unexpected_owned_object") ||
    !normalized.includes("live role boundary drifted") ||
    !normalized.includes("owns an object outside the frozen allowlist") ||
    normalized.includes("FROM pg_catalog.pg_user_mapping AS") ||
    !liveAssert.includes("allowed_schema_owner_relation_oids(oid) AS") ||
    !liveAssert.includes("allowed_schema_owner_type_oids(oid) AS") ||
    !liveAssert.includes("allowed_schema_owner_routine_oids(oid) AS") ||
    !driverOwnershipSurface.includes("runtime_owned(owner_oid) AS") ||
    !driverOwnershipSurface.includes("allowed_relation_oids(oid) AS") ||
    !driverOwnershipSurface.includes("allowed_type_oids(oid) AS") ||
    !driverOwnershipSurface.includes("allowed_routine_oids(oid) AS") ||
    !liveAssert.includes(
      "SELECT pg_catalog.count(*) IS DISTINCT FROM 8\n      FROM underlying_relations AS expected",
    ) ||
    countMatches(liveDatabaseOwnerRelations, /\('[^']+'::TEXT\)/gu) !==
      EXPECTED_DATABASE_OWNER_RELATIONS.length ||
    countMatches(freshDatabaseOwnerRelations, /^\s+'[^']+',?$/gmu) !==
      EXPECTED_DATABASE_OWNER_RELATIONS.length ||
    EXPECTED_DATABASE_OWNER_RELATIONS.some(
      (relation) =>
        liveDatabaseOwnerRelations.split(`('${relation}'::TEXT)`).length - 1 !==
          1 ||
        freshDatabaseOwnerRelations.split(`'${relation}'`).length - 1 !== 1,
    ) ||
    ownerCatalogs.some(
      (catalog) =>
        !liveAssert.includes(catalog) ||
        driverOwnershipSurface.split(catalog).length - 1 < 2,
    ) ||
    !normalized.includes("p_deployment_role_oid::OID") ||
    !normalized.includes("namespace.nspowner = 6171::OID") ||
    !normalized.includes("predefined_role.rolname = 'pg_database_owner'") ||
    !normalized.includes(
      "database_owner_oid IS DISTINCT FROM deployment_role.oid",
    ) ||
    !normalized.includes(
      "deployment_role.rolname IS DISTINCT FROM session_user",
    ) ||
    !liveAssert.includes("deployment_role.rolname = session_user") ||
    !liveAssert.includes("deployment_role.rolsuper") ||
    !epochAppender.includes("OR NOT deployment_role.rolsuper") ||
    !driverOwnershipSurface.includes(
      "deployment_role.rolsuper IS DISTINCT FROM true",
    ) ||
    !normalized.includes("reason_code IN ('APPLY', 'ROTATE')") ||
    !normalized.includes("reason_code = 'ROLLBACK'") ||
    !normalized.includes("reason_code = 'EMERGENCY_CONTAINMENT'")
  ) {
    findings.add(F.OWNERSHIP_SURFACE_DRIFT);
  }

  if (
    EXPECTED_CREATED_TRIGGERS.some(
      (name) =>
        countMatches(
          normalized,
          new RegExp(`CREATE TRIGGER "${name}"`, "gu"),
        ) !== 1,
    ) ||
    !normalized.includes("append-only") ||
    !normalized.includes("BEFORE UPDATE OR DELETE") ||
    countMatches(normalized, /BEFORE TRUNCATE/gu) < 3 ||
    !normalized.includes(
      'DROP TRIGGER "IdentityMailEnrollmentEvent_dml_guard_trigger"',
    ) ||
    !normalized.includes(
      'DROP TRIGGER "IdentityMailEnrollment_00_dormant_guard_trigger"',
    ) ||
    !normalized.includes(
      'DROP TRIGGER "IdentityMailDeliveryTenantEnrollment_row_guard_trigger"',
    ) ||
    !normalized.includes(
      'DROP TRIGGER "IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger"',
    ) ||
    !normalized.includes("WHERE actual.trigger_name IS NULL") ||
    countMatches(
      normalized,
      /INNER JOIN protected_relations AS protected/gu,
    ) !== 2 ||
    countMatches(
      normalized,
      /AND expected\.trigger_name = actual\.trigger_name/gu,
    ) !== 2 ||
    !normalized.includes("actual.enabled <> 'O'::\"char\"") ||
    !normalized.includes("actual.tgenabled <> 'O'::\"char\"") ||
    EXPECTED_PROTECTED_TRIGGERS.some(
      ({ relation, trigger }) =>
        normalized.split(`('${relation}'::TEXT, '${trigger}'::TEXT)`).length -
          1 !==
        4,
    )
  ) {
    findings.add(F.IMMUTABILITY_DRIFT);
  }

  const driver = driverStart < 0 ? "" : normalized.slice(driverStart);
  if (
    !driver.includes("p_tenant_id TEXT") ||
    !driver.includes("p_command_id TEXT") ||
    !driver.includes("p_authorization_envelope_digest TEXT") ||
    !driver.includes("p_manifest_payload_digest TEXT") ||
    /p_[a-z0-9_]+\s+JSONB/iu.test(
      driver.slice(0, driver.indexOf("RETURNS JSONB")),
    ) ||
    !driver.includes('command."authorizationEnvelopeDigest" =') ||
    !driver.includes(
      'command."dutyManifestPayloadDigest" = p_manifest_payload_digest',
    ) ||
    !driver.includes('acl_record."workerRoleOid" IS DISTINCT FROM') ||
    !driver.includes("observed_migration_manifest_digest") ||
    countMatches(
      driver,
      /'RUNTIME_COORDINATOR',\n    acl_record\."definitionManifestDigest"::TEXT/gu,
    ) !== 1 ||
    driver.includes(
      'acl_record."reasonCode",\n    acl_record."definitionManifestDigest"::TEXT',
    )
  ) {
    findings.add(F.DRIVER_REFERENCE_SURFACE_DRIFT);
  }
  if (
    !driver.includes("'phase', 'WAIT_ZERO_INFLIGHT'") ||
    !driver.includes("'phase', CASE WHEN event_type = 'DRAIN_STARTED'") ||
    !driver.includes("THEN 'BEGIN_DRAIN' ELSE 'FINALIZE' END") ||
    !driver.includes("'PENDING_ZERO_INFLIGHT'") ||
    !driver.includes("enrollment_record.\"state\" = 'DRAINING'") ||
    !driver.includes(
      'enrollment_record."activeCommandId" = command_record."id"',
    )
  ) {
    findings.add(F.DRIVER_PHASE_DRIFT);
  }
  const replayIndex = driver.indexOf('terminal_event."id" IS NOT NULL');
  const staleIndex = driver.indexOf(
    'observed_at >= command_record."expiresAt"',
  );
  if (
    replayIndex < 0 ||
    staleIndex < 0 ||
    replayIndex > staleIndex ||
    !driver.includes("'phase', 'TERMINAL_REPLAY'")
  ) {
    findings.add(F.DRIVER_REPLAY_DRIFT);
  }
  if (
    staleIndex < 0 ||
    driver.includes('observed_at > command_record."expiresAt"')
  ) {
    findings.add(F.EXPIRY_BOUNDARY_DRIFT);
  }
  const continuationPolicy = driver.indexOf("IF NOT is_continuation AND (");
  const revocation = driver.indexOf(
    'FROM public."IdentityMailDutyRoleManifestRevocationV2"',
    continuationPolicy,
  );
  if (
    continuationPolicy < 0 ||
    revocation < continuationPolicy ||
    !driver.includes("evidence is stale or revoked")
  ) {
    findings.add(F.DRIVER_REVOCATION_POLICY_DRIFT);
  }
  const outboxLock = driver.indexOf('PERFORM outbox."id"');
  const outboxCounts = driver.indexOf("pending_secret_count", outboxLock);
  const zeroDecision = driver.indexOf(
    "'phase', 'WAIT_ZERO_INFLIGHT'",
    outboxCounts,
  );
  const finalize = driver.indexOf("event_at :=", zeroDecision);
  if (
    outboxLock < 0 ||
    outboxCounts < outboxLock ||
    zeroDecision < outboxCounts ||
    finalize < zeroDecision ||
    !driver.includes('outbox."secretCiphertext" IS NOT NULL') ||
    !driver.includes("'HOLD'::public.\"IdentityMailOutboxStatus\"") ||
    !driver.includes("'PENDING'::public.\"IdentityMailOutboxStatus\"") ||
    !driver.includes("'RETRY'::public.\"IdentityMailOutboxStatus\"") ||
    !driver.includes("'CLAIMED'::public.\"IdentityMailOutboxStatus\"") ||
    !driver.includes("FOR UPDATE OF outbox")
  ) {
    findings.add(F.DRIVER_ZERO_BARRIER_DRIFT);
  }
  if (
    !driver.includes("command_record.\"intent\" = 'ROLLBACK'") ||
    countMatches(driver, /IS DISTINCT FROM ROW\(/gu) < 3 ||
    !driver.includes("referenced_command.\"action\" = 'ENABLE'") ||
    !driver.includes("state-only pseudo-rollback") ||
    !driver.includes('command_record."rollbackOfCommandId"') ||
    countMatches(driver, /referenced_command\."previousWorkerRoleName"/gu) !==
      2 ||
    countMatches(driver, /referenced_command\."targetWorkerRoleName"/gu) !== 1
  ) {
    findings.add(F.ROLLBACK_MAPPING_DRIFT);
  }

  if (
    !normalized.includes("DO $postcondition$") ||
    !normalized.includes("routine_count IS DISTINCT FROM 7") ||
    !normalized.includes("OR trigger_count IS DISTINCT FROM 21") ||
    !normalized.includes("non_owner_routine_acl_count IS DISTINCT FROM 0") ||
    !normalized.includes(
      "definition_manifest_constraint_count IS DISTINCT FROM 1",
    ) ||
    !normalized.includes(
      "observed_definition_manifest_digest IS DISTINCT FROM",
    ) ||
    !normalized.includes("CURRENT186 runtime boundary postcondition failed")
  ) {
    findings.add(F.POSTCONDITION_DRIFT);
  }

  if (
    candidateDirectories.length !== EXPECTED_CANDIDATE_DIRECTORIES.length ||
    candidateDirectories.some(
      (entry, index) => entry !== EXPECTED_CANDIDATE_DIRECTORIES[index],
    )
  ) {
    findings.add(F.CANDIDATE_CHAIN_DRIFT);
  }

  return [...findings].sort();
}

async function readCandidateDirectories() {
  return (await readdir(CANDIDATES_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function auditCandidateChain(candidateDirectories) {
  for (const candidate of candidateDirectories) {
    try {
      const directory = join(CANDIDATES_DIRECTORY, candidate);
      const metadata = JSON.parse(
        await readFile(join(directory, "candidate.json"), "utf8"),
      );
      const sql = await readFile(join(directory, "migration.sql"), "utf8");
      if (
        metadata.candidate !== EXPECTED_CANDIDATE_IDENTITIES[candidate] ||
        metadata.migrationSqlSha256 !== digestText(sql)
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export async function inspectIdentityMailDutyRoleCurrent186Foundation(
  overrides = {},
) {
  let sql;
  let metadataText;
  let candidateDirectories;
  try {
    [sql, metadataText, candidateDirectories] = await Promise.all([
      overrides.sql === undefined ? readFile(SQL_PATH, "utf8") : overrides.sql,
      overrides.metadataText === undefined
        ? readFile(METADATA_PATH, "utf8")
        : overrides.metadataText,
      overrides.candidateDirectories === undefined
        ? readCandidateDirectories()
        : overrides.candidateDirectories,
    ]);
  } catch {
    return Object.freeze({
      authorization: false,
      applicationRoleAllowlistBound: false,
      authorityScope: "CURRENT_DATABASE_ONLY",
      canMutate: false,
      canSend: false,
      crossDatabaseAuthorityControlled: false,
      contract: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_CONTRACT,
      decision: "CURRENT186_DUTY_ROLE_FOUNDATION_BLOCKED",
      findings: Object.freeze([F.READ_ERROR]),
      futureCreatorDefaultPrivilegesControlled: false,
      productionApplyAuthorized: false,
    });
  }

  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    metadata = null;
  }
  const findings = auditSql(sql, metadata, [...candidateDirectories].sort());
  if (
    overrides.candidateDirectories === undefined &&
    !(await auditCandidateChain(candidateDirectories))
  ) {
    findings.push(F.CANDIDATE_CHAIN_DRIFT);
  }
  const uniqueFindings = Object.freeze([...new Set(findings)].sort());
  return Object.freeze({
    authorization: false,
    applicationRoleAllowlistBound: false,
    authorityScope: "CURRENT_DATABASE_ONLY",
    canMutate: false,
    canSend: false,
    candidate: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE,
    completedMigrationManifestDigest:
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_COMPLETED_MANIFEST_DIGEST,
    contract: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_CONTRACT,
    crossDatabaseAuthorityControlled: false,
    decision:
      uniqueFindings.length === 0
        ? "CURRENT186_DUTY_ROLE_FOUNDATION_COMPLIANT"
        : "CURRENT186_DUTY_ROLE_FOUNDATION_BLOCKED",
    findings: uniqueFindings,
    futureCreatorDefaultPrivilegesControlled: false,
    migrationSqlSha256: digestText(sql),
    productionApplyAuthorized: false,
    status: "NOT_DEPLOYABLE",
  });
}

export class IdentityMailDutyRoleCurrent186FoundationError extends Error {
  constructor(report) {
    super("The CURRENT186 identity-mail duty-role foundation is blocked.");
    this.name = "IdentityMailDutyRoleCurrent186FoundationError";
    this.code = "IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_BLOCKED";
    this.exitCode = 3;
    this.report = report;
  }
}

export async function checkIdentityMailDutyRoleCurrent186Foundation(
  overrides = {},
) {
  const report =
    await inspectIdentityMailDutyRoleCurrent186Foundation(overrides);
  if (report.decision !== "CURRENT186_DUTY_ROLE_FOUNDATION_COMPLIANT") {
    throw new IdentityMailDutyRoleCurrent186FoundationError(report);
  }
  return report;
}

function repinMetadata(metadataText, sql) {
  const metadata = JSON.parse(metadataText);
  metadata.migrationSqlSha256 = digestText(sql);
  return JSON.stringify(metadata);
}

export async function runIdentityMailDutyRoleCurrent186SelfTest() {
  const [sql, metadataText] = await Promise.all([
    readFile(SQL_PATH, "utf8"),
    readFile(METADATA_PATH, "utf8"),
  ]);
  const probes = [
    [sql.replace("BEGIN;", "BEGIN WORK;"), F.TRANSACTION_ENVELOPE],
    [
      sql.replace(
        "completed_count IS DISTINCT FROM 185",
        "completed_count IS DISTINCT FROM 184",
      ),
      F.PREDECESSOR_DRIFT,
    ],
    [
      sql.replace("CREATE TABLE", "CREATE ROLE forbidden;\nCREATE TABLE"),
      F.ROLE_DDL_FORBIDDEN,
    ],
    [
      sql.replace(
        "REVOKE ALL PRIVILEGES",
        "GRANT EXECUTE ON FUNCTION x() TO PUBLIC;\nREVOKE ALL PRIVILEGES",
      ),
      F.GRANT_FORBIDDEN,
    ],
    [
      sql.replaceAll("NOT_DEPLOYABLE", "DEPLOYABLE"),
      F.PRODUCTION_AUTHORITY_FORBIDDEN,
    ],
    [sql.replace("MATCH FULL", "MATCH SIMPLE"), F.EPOCH_LEDGER_DRIFT],
    [
      sql.replace(
        "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1",
        "LEETPLUS_DRIFT",
      ),
      F.EPOCH_DIGEST_DOMAIN_DRIFT,
    ],
    [
      sql.replace("current_epoch + 1", "current_epoch + 2"),
      F.EPOCH_MONOTONICITY_DRIFT,
    ],
    [
      sql.replace(
        "Inactive ACL epochs must carry forward",
        "Inactive epochs accepted",
      ),
      F.EPOCH_MONOTONICITY_DRIFT,
    ],
    [
      sql.replace(
        "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_REHEARSAL_EVIDENCE_CURRENT186_V1",
        "LEETPLUS_EVIDENCE_DRIFT",
      ),
      F.EVIDENCE_DIGEST_DRIFT,
    ],
    [
      sql.replaceAll(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_MANIFEST_DIGEST,
        "0".repeat(64),
      ),
      F.DEFINITION_MANIFEST_DRIFT,
    ],
    [
      sql.replace(
        "('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT)",
        "('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_unpinned_trigger'::TEXT)",
      ),
      F.DEFINITION_MANIFEST_DRIFT,
    ],
    [
      sql.replace(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST,
        "0".repeat(64),
      ),
      F.PUBLIC_ACL_BASELINE_DRIFT,
    ],
    [
      sql.replace(
        "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',\n       'RUNTIME_COORDINATOR'",
        "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'",
      ),
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      sql.replace(
        "p_reason_code <> 'RUNTIME_COORDINATOR'",
        "p_reason_code <> 'UNREACHABLE_RUNTIME_REASON'",
      ),
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      sql.replace(
        "coordinator_role.rolname = session_user",
        "coordinator_role.rolname = current_user",
      ),
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      sql.replace(
        "p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')\n       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID",
        "p_reason_code IN ('APPLY', 'ROTATE')\n       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID",
      ),
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      sql.replace(
        "    'RUNTIME_COORDINATOR',\n    acl_record.\"definitionManifestDigest\"::TEXT",
        '    acl_record."reasonCode",\n    acl_record."definitionManifestDigest"::TEXT',
      ),
      F.DRIVER_REFERENCE_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'\n      )",
        "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',\n        'RUNTIME_COORDINATOR'\n      )",
      ),
      F.EPOCH_LEDGER_DRIFT,
    ],
    [
      sql.replace(
        "FROM pg_catalog.pg_stat_activity AS activity",
        "FROM pg_catalog.pg_stat_replication AS activity",
      ),
      F.EMERGENCY_SESSION_BARRIER_DRIFT,
    ],
    [
      sql.replace(
        "WHERE activity.usesysid IN (\n      owner_role.oid, coordinator_role.oid, worker_role.oid\n    )",
        "WHERE activity.usesysid IN (\n      coordinator_role.oid, worker_role.oid\n    )",
      ),
      F.EMERGENCY_SESSION_BARRIER_DRIFT,
    ],
    [
      sql.replace("BETWEEN 2 AND 600000", "BETWEEN 2 AND 65536"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("IS DISTINCT FROM 39::BIGINT", "IS DISTINCT FROM 36::BIGINT"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        '"beforeCatalogCanonicalJson" TEXT,',
        '"beforeCatalogCanonicalJsonRemoved" TEXT,',
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replaceAll(
        "beforeCatalogStorageProfile",
        "beforeCatalogCanonicalJsonHex",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replaceAll(
        "userRoutineDefinitionDigest",
        "userRoutineDefinitionDigestRemoved",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "before_catalog->'userRoutineDefinitionDigest'\n       ) IS DISTINCT FROM 'string'",
        "before_catalog->'userRoutineDefinitionDigest'\n       ) IS DISTINCT FROM 'number'",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("BETWEEN 2 AND 4194304", "BETWEEN 2 AND 4194305"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replaceAll(
        "EPOCH_COLUMN_CANONICAL_JSON_V1",
        "EPOCH_COLUMN_CANONICAL_JSON_DRIFT",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("SET STORAGE EXTENDED", "SET STORAGE EXTERNAL"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'",
        "'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DRIFT'",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "Inactive ACL epochs require a null recovery sidecar",
        "Inactive ACL epochs accept a recovery sidecar",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "before_catalog_digest, p_before_catalog_canonical_json, plan_digest",
        "before_catalog_digest, NULL, plan_digest",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "direct_duty_acl_digest IS DISTINCT FROM\n       observed_direct_duty_acl_digest",
        "direct_duty_acl_digest IS NOT DISTINCT FROM\n       observed_direct_duty_acl_digest",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "'authorityScope', 'CURRENT_DATABASE_ONLY'",
        "'authorityScope', 'CLUSTER_WIDE'",
      ),
      F.AUTHORITY_SCOPE_DRIFT,
    ],
    [
      sql.replace(
        "'applicationRoleAllowlistBound', false",
        "'applicationRoleAllowlistBound', true",
      ),
      F.AUTHORITY_SCOPE_DRIFT,
    ],
    [sql.replace("1279677004, 186", "1279677004, 185"), F.LOCK_DRIFT],
    [
      sql.replace(
        'tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);',
        "tenant_id := p_tenant_id;",
      ),
      F.LOCK_ORDER_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v0"',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "identity_mail_duty_role_acl_epoch_append_v1(text,text,text)",
        "identity_mail_duty_role_acl_epoch_append_v1(text,text)",
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(EXPECTED_CURRENT186_IMPORTER_PROSRC_SHA256, "0".repeat(64)),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        EXPECTED_CURRENT186_WORKER_ASSERT_PROSRC_SHA256,
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        'NULL::VARCHAR(320) AS "emailCanonical"',
        'NULL::TEXT AS "emailCanonical"',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "reap_email_order_expression CONSTANT TEXT :=\n    '    ORDER BY \"emailCanonical\"';",
        'reap_email_order_expression CONSTANT TEXT :=\n    E\'    ORDER BY \\"emailCanonical\\" COLLATE \\"C\\"\'',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY INVOKER',
      ),
      F.SECURITY_DEFINER_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER\nSET search_path = pg_catalog',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER\nSET search_path = public',
      ),
      F.SEARCH_PATH_DRIFT,
    ],
    [
      sql.replace(
        "PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);",
        "PERFORM pg_catalog.set_config('search_path', 'public', true);",
      ),
      F.SEARCH_PATH_DRIFT,
    ],
    [
      sql.replace("has_function_privilege", "function_privilege_probe_removed"),
      F.ACL_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        "('public.\"SharedBetaRuntimeReleaseMarker\".\"actualContextDigest\"'::TEXT, 'SELECT'::TEXT)",
        "('public.\"SharedBetaRuntimeReleaseMarker\".\"actualContextDigestRemoved\"'::TEXT, 'SELECT'::TEXT)",
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        "('public.\"Tenant\".\"id\"'::TEXT, 'SELECT'::TEXT)",
        "('public.\"Tenant\".\"idRemoved\"'::TEXT, 'SELECT'::TEXT)",
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideProtectedSurface(
        sql,
        "('SharedBetaRuntimeReleaseMarker'::TEXT),",
        "('SharedBetaRuntimeReleaseMarkerRemoved'::TEXT),",
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideProtectedSurface(
        sql,
        "('Tenant'::TEXT),",
        "('TenantRemoved'::TEXT),",
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        "FROM protected_routines AS expected_routine",
        "FROM protected_routines_removed AS expected_routine",
      ),
      F.ACL_DRIFT,
    ],
    [
      sql.replaceAll(
        "pg_catalog.oidvectortypes(routine.proargtypes)",
        "pg_catalog.pg_get_function_identity_arguments(routine.oid)",
      ),
      F.ACL_DRIFT,
    ],
    [
      sql.replace(
        "namespace.nspname NOT IN ('information_schema', 'public')",
        "namespace.nspname = 'public'",
      ),
      F.PUBLIC_ACL_BASELINE_DRIFT,
    ],
    [
      sql.replace(
        "acl_record.\"reasonCode\" NOT IN ('APPLY', 'ROTATE')",
        "acl_record.\"reasonCode\" NOT IN ('APPLY', 'ROTATE', 'ROLLBACK')",
      ),
      F.ACL_DRIFT,
    ],
    [
      sql.replace(
        "owns an object outside the frozen allowlist",
        "owned object accepted",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "deployment_role.rolname = session_user",
        "deployment_role.rolname = current_user",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "OR NOT deployment_role.rolsuper",
        "OR deployment_role.rolsuper",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "deployment_role.rolsuper IS DISTINCT FROM true",
        "deployment_role.rolsuper IS DISTINCT FROM false",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "allowed_schema_owner_type_oids(oid) AS",
        "allowed_schema_owner_type_oids_removed(oid) AS",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "runtime_owned(owner_oid) AS",
        "runtime_owned_removed(owner_oid) AS",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "allowed_type_oids(oid) AS",
        "allowed_type_oids_removed(oid) AS",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replaceAll(
        "pg_catalog.pg_subscription AS subscription",
        "pg_catalog.pg_publication AS subscription",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "FROM pg_catalog.pg_user_mappings AS mapping",
        "FROM pg_catalog.pg_user_mapping AS mapping",
      ),
      F.OWNERSHIP_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        'CREATE TRIGGER "IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger"',
        'CREATE TRIGGER "IdentityMailDutyRoleAclEpochV1_mutable_dml_trigger"',
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "INNER JOIN protected_relations AS protected",
        "INNER JOIN expected AS protected",
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "actual.enabled <> 'O'::\"char\"",
        "actual.enabled = 'D'::\"char\"",
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "p_manifest_payload_digest TEXT",
        "p_manifest_payload_digest JSONB",
      ),
      F.DRIVER_REFERENCE_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "THEN 'BEGIN_DRAIN' ELSE 'FINALIZE' END",
        "THEN 'BEGIN' ELSE 'FINALIZE' END",
      ),
      F.DRIVER_PHASE_DRIFT,
    ],
    [
      sql.replace("'phase', 'TERMINAL_REPLAY'", "'phase', 'REPLAY'"),
      F.DRIVER_REPLAY_DRIFT,
    ],
    [
      sql.replace(
        'observed_at >= command_record."expiresAt"',
        'observed_at > command_record."expiresAt"',
      ),
      F.EXPIRY_BOUNDARY_DRIFT,
    ],
    [
      sql.replace("IF NOT is_continuation AND (", "IF true AND ("),
      F.DRIVER_REVOCATION_POLICY_DRIFT,
    ],
    [
      sql.replace("FOR UPDATE OF outbox", "FOR SHARE OF outbox"),
      F.DRIVER_ZERO_BARRIER_DRIFT,
    ],
    [
      sql.replace("state-only pseudo-rollback", "inexact rollback"),
      F.ROLLBACK_MAPPING_DRIFT,
    ],
    [
      sql.replace(
        "trigger_count IS DISTINCT FROM 21",
        "trigger_count IS DISTINCT FROM 20",
      ),
      F.POSTCONDITION_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of probes) {
    assert.notEqual(mutatedSql, sql);
    const report = await inspectIdentityMailDutyRoleCurrent186Foundation({
      candidateDirectories: EXPECTED_CANDIDATE_DIRECTORIES,
      metadataText: repinMetadata(metadataText, mutatedSql),
      sql: mutatedSql,
    });
    assert.ok(
      report.findings.includes(finding),
      `${finding}: ${JSON.stringify(report)}`,
    );
  }
  return Object.freeze({
    authorization: false,
    applicationRoleAllowlistBound: false,
    authorityScope: "CURRENT_DATABASE_ONLY",
    canMutate: false,
    canSend: false,
    contract: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_CONTRACT,
    crossDatabaseAuthorityControlled: false,
    decision: "CURRENT186_DUTY_ROLE_FOUNDATION_SELF_TEST_PASSED",
    futureCreatorDefaultPrivilegesControlled: false,
    negativeProbes: probes.length,
    productionApplyAuthorized: false,
  });
}

function help() {
  return `Usage: node identity-mail-duty-role-current186-foundation.mjs <mode>

Modes:
  --check      Validate the frozen CURRENT186 candidate and candidate chain.
  --self-test  Exercise bounded fail-closed mutation probes.
  --help       Show this help.

This gate is static, read-only, non-authorizing and cannot deploy or send.`;
}

async function main(argv) {
  const mode = argv[0] ?? "--check";
  if (mode === "--help") {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (mode === "--self-test") {
    process.stdout.write(
      `${JSON.stringify(await runIdentityMailDutyRoleCurrent186SelfTest())}\n`,
    );
    return;
  }
  if (mode !== "--check" || argv.length !== 1) {
    process.stderr.write(`${help()}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(
      `${JSON.stringify(await checkIdentityMailDutyRoleCurrent186Foundation())}\n`,
    );
  } catch (error) {
    if (error instanceof IdentityMailDutyRoleCurrent186FoundationError) {
      process.stderr.write(`${JSON.stringify(error.report)}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
