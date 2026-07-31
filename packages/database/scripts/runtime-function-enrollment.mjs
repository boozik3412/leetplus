import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SHARED_BETA_ADMISSION_COLUMNS,
  SHARED_BETA_ADMISSION_FUNCTIONS,
  SHARED_BETA_ADMISSION_GATE_CODES,
  SHARED_BETA_ADMISSION_RELATIONS,
  SHARED_BETA_ADMISSION_TYPES,
} from "./shared-beta-admission-provenance-catalog.mjs";

export const RUNTIME_FUNCTION_ENROLLMENT_SCHEMA_VERSION = 1;
export const RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION =
  "20260729160000_guest_game_delivery_claim_fence";
export const RUNTIME_FUNCTION_ENROLLMENT_MIGRATION =
  "20260731020000_initial_owner_mail_delivery_boundary";
export const RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT = 176;

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
    catalogSignature: 'public."guest_game_reward_delivery_lock_v1"(text,text)',
    grantSignature: 'public."guest_game_reward_delivery_lock_v1"(TEXT, TEXT)',
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
    key: "identityEmailClaimAssertInviteLocator",
    catalogSignature:
      'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
    grantSignature:
      'public."identity_email_claim_assert_invite_locator_v1"(TEXT, TEXT, TEXT, INTEGER)',
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
  Object.freeze({
    key: "identityInitialOwnerInviteDeliveryAssertSent",
    catalogSignature:
      'public."identity_initial_owner_invite_delivery_assert_sent_v1"(text,text,text)',
    grantSignature:
      'public."identity_initial_owner_invite_delivery_assert_sent_v1"(TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "s",
    language: "sql",
  }),
]);

export const EXCLUDED_WORKER_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "durableDeliveryEventWriter",
    catalogSignature: 'public."guest_game_delivery_record_event_v1"(json)',
    grantSignature: 'public."guest_game_delivery_record_event_v1"(JSON)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityMailDeliveryWorkerAssert",
    catalogSignature:
      'public."identity_mail_delivery_worker_assert_v1"(text)',
    grantSignature:
      'public."identity_mail_delivery_worker_assert_v1"(TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerMailClaim",
    catalogSignature:
      'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_claim_v1"(TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerMailProviderMark",
    catalogSignature:
      'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_provider_mark_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerMailComplete",
    catalogSignature:
      'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_complete_v1"(TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerMailReap",
    catalogSignature:
      'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
    grantSignature:
      'public."identity_initial_owner_mail_reap_v1"(TEXT, TEXT, TEXT, INTEGER)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
]);

export const EXCLUDED_PENDING_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "identityEmailClaimDirectLock",
    catalogSignature: 'public."identity_email_claim_lock_v1"(text)',
    grantSignature: 'public."identity_email_claim_lock_v1"(TEXT)',
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
  Object.freeze({
    key: "identityOwnerInviteIssueHold",
    catalogSignature:
      'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
    grantSignature:
      'public."identity_owner_invite_issue_hold_v1"(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP WITH TIME ZONE)',
    securityDefiner: true,
    volatility: "v",
  }),
  Object.freeze({
    key: "identityMailDeliveryEventGuard",
    catalogSignature:
      'public."identity_mail_delivery_event_guard_v1"()',
    grantSignature: 'public."identity_mail_delivery_event_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityMailDeliveryEventTruncateGuard",
    catalogSignature:
      'public."identity_mail_delivery_event_truncate_guard_v1"()',
    grantSignature:
      'public."identity_mail_delivery_event_truncate_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityMailDeliveryEnrollmentGuard",
    catalogSignature:
      'public."identity_mail_delivery_enrollment_guard_v1"()',
    grantSignature:
      'public."identity_mail_delivery_enrollment_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityMailDeliveryEnrollmentTruncateGuard",
    catalogSignature:
      'public."identity_mail_delivery_enrollment_truncate_guard_v1"()',
    grantSignature:
      'public."identity_mail_delivery_enrollment_truncate_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityMailOutboxDeliveryGuard",
    catalogSignature:
      'public."identity_mail_outbox_delivery_guard_v1"()',
    grantSignature: 'public."identity_mail_outbox_delivery_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityMailDeliveryEventAppend",
    catalogSignature:
      'public."identity_mail_delivery_event_append_v1"()',
    grantSignature:
      'public."identity_mail_delivery_event_append_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerInviteAcceptSentGuard",
    catalogSignature:
      'public."identity_initial_owner_invite_accept_sent_guard_v1"()',
    grantSignature:
      'public."identity_initial_owner_invite_accept_sent_guard_v1"()',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "identityInitialOwnerMailReconcile",
    catalogSignature:
      'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
    grantSignature:
      'public."identity_initial_owner_mail_reconcile_v1"(TEXT, BIGINT, TEXT, TEXT, TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
]);

assert.equal(
  SHARED_BETA_ADMISSION_FUNCTIONS.length,
  9,
  "CURRENT_172 must expose exactly nine dormant admission functions.",
);
export const EXCLUDED_ADMISSION_FUNCTIONS = Object.freeze(
  SHARED_BETA_ADMISSION_FUNCTIONS.map((entry) => {
    assert.deepEqual(
      entry.searchPath,
      ["pg_catalog"],
      `${entry.name} must use the sealed pg_catalog search_path.`,
    );
    return Object.freeze({
      key: entry.name,
      catalogSignature: entry.catalogSignature,
      grantSignature: entry.grantSignature,
      securityDefiner: entry.securityDefiner,
      volatility: entry.volatility,
      language: entry.language,
    });
  }),
);

const CURRENT_174_UPDATED_ADMISSION_GUARD = EXCLUDED_ADMISSION_FUNCTIONS.find(
  (entry) =>
    entry.catalogSignature ===
    'public."shared_beta_tenant_admission_decision_guard_v1"()',
);
assert.deepEqual(
  CURRENT_174_UPDATED_ADMISSION_GUARD,
  {
    key: "shared_beta_tenant_admission_decision_guard_v1",
    catalogSignature:
      'public."shared_beta_tenant_admission_decision_guard_v1"()',
    grantSignature: 'public."shared_beta_tenant_admission_decision_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  },
  "CURRENT_174 must retain the exact updated admission decision guard contract.",
);

// CURRENT_174 created twenty-one routines and replaced the admission decision
// guard already sealed by CURRENT_172. CURRENT_176 replaces the old outbox
// release guard with its delivery-state guard, so twenty CURRENT_174 routines
// remain in this group and the replacement is sealed with the new delivery
// internals in EXCLUDED_PENDING_FUNCTIONS.
export const EXCLUDED_RUNTIME_RELEASE_FUNCTIONS = Object.freeze([
  Object.freeze({
    key: "shared_beta_activation_audit_guard_v1",
    catalogSignature: 'public."shared_beta_activation_audit_guard_v1"()',
    grantSignature: 'public."shared_beta_activation_audit_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_activation_command_immutable_v1",
    catalogSignature: 'public."shared_beta_activation_command_immutable_v1"()',
    grantSignature: 'public."shared_beta_activation_command_immutable_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_build_provenance_guard_v1",
    catalogSignature: 'public."shared_beta_build_provenance_guard_v1"()',
    grantSignature: 'public."shared_beta_build_provenance_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_build_provenance_persist_v1",
    catalogSignature:
      'public."shared_beta_build_provenance_persist_v1"(text,text,text,timestamp with time zone,text,text,text,integer,text,text,text,integer,text,jsonb,text,text,text,text,text,timestamp with time zone)',
    grantSignature:
      'public."shared_beta_build_provenance_persist_v1"(TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_activation_role_assert_v1",
    catalogSignature:
      'public."shared_beta_runtime_activation_role_assert_v1"(text,bigint)',
    grantSignature:
      'public."shared_beta_runtime_activation_role_assert_v1"(TEXT, BIGINT)',
    securityDefiner: true,
    volatility: "s",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_actual_context_assert_v1",
    catalogSignature:
      'public."shared_beta_runtime_actual_context_assert_v1"(text)',
    grantSignature:
      'public."shared_beta_runtime_actual_context_assert_v1"(TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_actual_context_from_challenge_v1",
    catalogSignature:
      'public."shared_beta_runtime_actual_context_from_challenge_v1"(text)',
    grantSignature:
      'public."shared_beta_runtime_actual_context_from_challenge_v1"(TEXT)',
    securityDefiner: true,
    volatility: "s",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_canonical_json_v1",
    catalogSignature: 'public."shared_beta_runtime_canonical_json_v1"(jsonb)',
    grantSignature: 'public."shared_beta_runtime_canonical_json_v1"(JSONB)',
    securityDefiner: true,
    volatility: "i",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_challenge_guard_v1",
    catalogSignature: 'public."shared_beta_runtime_challenge_guard_v1"()',
    grantSignature: 'public."shared_beta_runtime_challenge_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_database_identity_digest_v1",
    catalogSignature:
      'public."shared_beta_runtime_database_identity_digest_v1"(text)',
    grantSignature:
      'public."shared_beta_runtime_database_identity_digest_v1"(TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_instance_anchor_guard_v1",
    catalogSignature: 'public."shared_beta_runtime_instance_anchor_guard_v1"()',
    grantSignature: 'public."shared_beta_runtime_instance_anchor_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_digest_v1",
    catalogSignature: 'public."shared_beta_runtime_digest_v1"(text,jsonb)',
    grantSignature: 'public."shared_beta_runtime_digest_v1"(TEXT, JSONB)',
    securityDefiner: true,
    volatility: "i",
    language: "sql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_marker_guard_v1",
    catalogSignature: 'public."shared_beta_runtime_marker_guard_v1"()',
    grantSignature: 'public."shared_beta_runtime_marker_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_migration_state_v1",
    catalogSignature: 'public."shared_beta_runtime_migration_state_v1"()',
    grantSignature: 'public."shared_beta_runtime_migration_state_v1"()',
    securityDefiner: true,
    volatility: "s",
    language: "sql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_release_challenge_create_v1",
    catalogSignature:
      'public."shared_beta_runtime_release_challenge_create_v1"(text,text,text,text,timestamp with time zone)',
    grantSignature:
      'public."shared_beta_runtime_release_challenge_create_v1"(TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_release_marker_persist_v1",
    catalogSignature:
      'public."shared_beta_runtime_release_marker_persist_v1"(text,text,text,text,text,text,text,text,bigint,text,text,text,bigint,timestamp with time zone,jsonb,text,text,text,text,text,timestamp with time zone)',
    grantSignature:
      'public."shared_beta_runtime_release_marker_persist_v1"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMP WITH TIME ZONE, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_runtime_state_guard_v1",
    catalogSignature: 'public."shared_beta_runtime_state_guard_v1"()',
    grantSignature: 'public."shared_beta_runtime_state_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_tenant_activate_v1",
    catalogSignature:
      'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
    grantSignature:
      'public."shared_beta_tenant_activate_v1"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP WITH TIME ZONE)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_tenant_activation_guard_v1",
    catalogSignature: 'public."shared_beta_tenant_activation_guard_v1"()',
    grantSignature: 'public."shared_beta_tenant_activation_guard_v1"()',
    securityDefiner: false,
    volatility: "v",
    language: "plpgsql",
  }),
  Object.freeze({
    key: "shared_beta_tenant_actual_shell_v1",
    catalogSignature: 'public."shared_beta_tenant_actual_shell_v1"(text)',
    grantSignature: 'public."shared_beta_tenant_actual_shell_v1"(TEXT)',
    securityDefiner: true,
    volatility: "v",
    language: "plpgsql",
  }),
]);
assert.equal(
  EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
  20,
  "CURRENT_176 must retain exactly twenty CURRENT_174 runtime-release routines.",
);
assert.equal(
  new Set([
    ...EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map(
      ({ catalogSignature }) => catalogSignature,
    ),
    CURRENT_174_UPDATED_ADMISSION_GUARD.catalogSignature,
  ]).size,
  21,
  "CURRENT_176 must cover twenty retained runtime-release routines plus the updated admission guard.",
);

const EXCLUDED_RUNTIME_FUNCTIONS = Object.freeze([
  ...EXCLUDED_WORKER_FUNCTIONS,
  ...EXCLUDED_PENDING_FUNCTIONS,
  ...EXCLUDED_ADMISSION_FUNCTIONS,
  ...EXCLUDED_RUNTIME_RELEASE_FUNCTIONS,
]);
const ALL_RUNTIME_FUNCTIONS = Object.freeze([
  ...APPLICATION_RUNTIME_FUNCTIONS,
  ...EXCLUDED_RUNTIME_FUNCTIONS,
]);
assert.equal(
  ALL_RUNTIME_FUNCTIONS.length,
  56,
  "Runtime enrollment must inspect exactly 56 CURRENT_176 function contracts.",
);
assert.equal(
  new Set(ALL_RUNTIME_FUNCTIONS.map(({ catalogSignature }) => catalogSignature))
    .size,
  ALL_RUNTIME_FUNCTIONS.length,
  "Runtime enrollment function signatures must be unique.",
);
const LEGACY_SEALED_RUNTIME_TABLES = Object.freeze([
  Object.freeze({
    key: "identityEmailClaim",
    catalogName: 'public."IdentityEmailClaim"',
    grantName: 'public."IdentityEmailClaim"',
    columns: Object.freeze([
      "emailCanonical",
      "claimType",
      "tenantId",
      "subjectId",
      "revision",
      "createdAt",
      "updatedAt",
      "workflowLocator",
    ]),
  }),
  Object.freeze({
    key: "identityOwnerInviteIssueCommand",
    catalogName: 'public."IdentityOwnerInviteIssueCommand"',
    grantName: 'public."IdentityOwnerInviteIssueCommand"',
    columns: Object.freeze([
      "id",
      "tenantId",
      "action",
      "requestId",
      "issueRequestDigest",
      "aadEnvironment",
      "workflowLocator",
      "reservationSubjectId",
      "reservationClaimRevision",
      "inviteId",
      "outboxId",
      "messageKey",
      "tokenHash",
      "tokenDigestVersion",
      "template",
      "envelopeVersion",
      "keyVersion",
      "expiresAt",
      "claimRevision",
      "createdAt",
    ]),
  }),
  Object.freeze({
    key: "identityMailOutbox",
    catalogName: 'public."IdentityMailOutbox"',
    grantName: 'public."IdentityMailOutbox"',
    columns: Object.freeze([
      "id",
      "tenantId",
      "issueCommandId",
      "inviteId",
      "workflowLocator",
      "aadEnvironment",
      "template",
      "status",
      "messageKey",
      "issueRequestDigest",
      "tokenHash",
      "tokenDigestVersion",
      "secretCiphertext",
      "envelopeVersion",
      "keyVersion",
      "expiresAt",
      "createdAt",
      "releasedAt",
      "attempts",
      "leaseVersion",
      "transitionRevision",
      "availableAt",
      "leaseOwnerDigest",
      "leaseTokenDigest",
      "claimedAt",
      "leaseExpiresAt",
      "providerAttemptKey",
      "providerAttemptedAt",
      "providerAcknowledgeUntil",
      "providerAuthorityDigest",
      "messageIdDigest",
      "providerOutcomeClass",
      "providerObservedAt",
      "providerReceiptDigest",
      "terminalAckDigest",
      "ciphertextClearedAt",
      "sentAt",
      "terminalAt",
      "stateReasonCode",
      "updatedAt",
    ]),
  }),
]);
assert.equal(
  SHARED_BETA_ADMISSION_RELATIONS.length,
  3,
  "CURRENT_172 must expose exactly three sealed admission tables.",
);
assert.equal(
  SHARED_BETA_ADMISSION_COLUMNS.length,
  64,
  "CURRENT_172 must expose exactly 64 sealed admission columns.",
);
const ADMISSION_SEALED_RUNTIME_TABLES = Object.freeze(
  SHARED_BETA_ADMISSION_RELATIONS.map((relationName) => {
    const columns = SHARED_BETA_ADMISSION_COLUMNS.filter(
      ([candidateRelation]) => candidateRelation === relationName,
    ).map(([, columnName]) => columnName);
    assert.ok(
      columns.length > 0,
      `Admission table ${relationName} has no exact column manifest.`,
    );
    return Object.freeze({
      key: relationName[0].toLowerCase() + relationName.slice(1),
      catalogName: `public.${quoteIdentifier(relationName)}`,
      grantName: `public.${quoteIdentifier(relationName)}`,
      columns: Object.freeze(columns),
    });
  }),
);
export const RUNTIME_RELEASE_SEALED_RUNTIME_TABLES = Object.freeze([
  Object.freeze({
    key: "sharedBetaRuntimeInstanceAnchor",
    catalogName: 'public."SharedBetaRuntimeInstanceAnchor"',
    grantName: 'public."SharedBetaRuntimeInstanceAnchor"',
    expectedPersistence: "u",
    columns: Object.freeze(["id", "anchorNonce", "createdAt"]),
  }),
  Object.freeze({
    key: "sharedBetaBuildProvenance",
    catalogName: 'public."SharedBetaBuildProvenance"',
    grantName: 'public."SharedBetaBuildProvenance"',
    columns: Object.freeze([
      "id",
      "authorityDomain",
      "contractVersion",
      "releaseSha",
      "buildTime",
      "builtAt",
      "artifactContentDigest",
      "releaseManifestDigest",
      "schemaHead",
      "migrationCount",
      "migrationManifestDigest",
      "policyManifestDigest",
      "trialPolicyVersion",
      "trialDurationSeconds",
      "buildReferenceDigest",
      "payload",
      "payloadDigest",
      "signatureAlgorithm",
      "signingKeyId",
      "publicKeyFingerprint",
      "signatureBase64url",
      "validUntil",
      "stateRevision",
      "revokedAt",
      "revocationReasonDigest",
      "createdAt",
    ]),
  }),
  Object.freeze({
    key: "sharedBetaRuntimeReleaseChallenge",
    catalogName: 'public."SharedBetaRuntimeReleaseChallenge"',
    grantName: 'public."SharedBetaRuntimeReleaseChallenge"',
    columns: Object.freeze([
      "id",
      "buildProvenanceId",
      "environment",
      "activationRoleName",
      "activationRoleOid",
      "installerRoleName",
      "installerRoleOid",
      "creationNonce",
      "databaseIdentityDigest",
      "schemaHead",
      "migrationCount",
      "migrationManifestDigest",
      "expectedStateRevision",
      "candidateGeneration",
      "predecessorMarkerId",
      "predecessorMarkerDigest",
      "challengeDigest",
      "actualContextDigest",
      "stateRevision",
      "consumedAt",
      "createdAt",
      "validUntil",
    ]),
  }),
  Object.freeze({
    key: "sharedBetaRuntimeReleaseMarker",
    catalogName: 'public."SharedBetaRuntimeReleaseMarker"',
    grantName: 'public."SharedBetaRuntimeReleaseMarker"',
    columns: Object.freeze([
      "id",
      "buildProvenanceId",
      "challengeId",
      "authorityDomain",
      "contractVersion",
      "generation",
      "environment",
      "buildPayloadDigest",
      "deploymentInstanceDigest",
      "databaseIdentityDigest",
      "databaseChallengeDigest",
      "actualContextDigest",
      "schemaHead",
      "migrationCount",
      "migrationManifestDigest",
      "activationDatabaseRole",
      "coordinatorRoleName",
      "coordinatorRoleOid",
      "predecessorMarkerId",
      "predecessorMarkerDigest",
      "payload",
      "payloadDigest",
      "signatureAlgorithm",
      "signingKeyId",
      "publicKeyFingerprint",
      "signatureBase64url",
      "deployedAt",
      "validUntil",
      "stateRevision",
      "revokedAt",
      "revocationReasonDigest",
      "createdAt",
    ]),
  }),
  Object.freeze({
    key: "sharedBetaRuntimeReleaseState",
    catalogName: 'public."SharedBetaRuntimeReleaseState"',
    grantName: 'public."SharedBetaRuntimeReleaseState"',
    columns: Object.freeze([
      "id",
      "currentMarkerId",
      "generation",
      "stateRevision",
      "updatedAt",
    ]),
  }),
  Object.freeze({
    key: "sharedBetaTenantActivationCommand",
    catalogName: 'public."SharedBetaTenantActivationCommand"',
    grantName: 'public."SharedBetaTenantActivationCommand"',
    columns: Object.freeze([
      "id",
      "tenantId",
      "action",
      "requestId",
      "requestDigest",
      "decisionId",
      "markerId",
      "markerPayloadDigest",
      "markerGeneration",
      "buildProvenanceId",
      "actualContextDigest",
      "actualShellDigest",
      "reservationSubjectId",
      "reservationClaimRevision",
      "issueRequestId",
      "issueRequestDigest",
      "issueCommandId",
      "inviteId",
      "outboxId",
      "messageKey",
      "tokenHash",
      "secretCiphertextDigest",
      "workflowLocator",
      "activatedByUserId",
      "entitlementProfileRevision",
      "executionRevisionBefore",
      "executionRevisionAfter",
      "trialPolicyVersion",
      "trialDurationSeconds",
      "trialStartsAt",
      "trialEndsAt",
      "receipt",
      "createdTransactionId",
      "activatedAt",
    ]),
  }),
]);
export const IDENTITY_MAIL_DELIVERY_SEALED_RUNTIME_TABLES = Object.freeze([
  Object.freeze({
    key: "identityMailDeliveryTenantEnrollment",
    catalogName: 'public."IdentityMailDeliveryTenantEnrollment"',
    grantName: 'public."IdentityMailDeliveryTenantEnrollment"',
    columns: Object.freeze([
      "tenantId",
      "workerRoleName",
      "workerRoleOid",
      "policyRevision",
      "enabled",
      "maxAttempts",
      "leaseSeconds",
      "acknowledgeSeconds",
      "baseRetrySeconds",
      "maxRetrySeconds",
      "providerAuthorityDigest",
      "enabledAt",
      "disabledAt",
      "createdAt",
      "updatedAt",
    ]),
  }),
  Object.freeze({
    key: "identityMailDeliveryEvent",
    catalogName: 'public."IdentityMailDeliveryEvent"',
    grantName: 'public."IdentityMailDeliveryEvent"',
    columns: Object.freeze([
      "id",
      "tenantId",
      "outboxId",
      "inviteId",
      "transitionRevision",
      "leaseVersion",
      "attemptNumber",
      "eventType",
      "fromStatus",
      "toStatus",
      "leaseOwnerDigest",
      "providerAttemptKey",
      "providerAuthorityDigest",
      "actorDigest",
      "messageIdDigest",
      "providerOutcomeClass",
      "providerReceiptDigest",
      "terminalAckDigest",
      "stateReasonCode",
      "eventAt",
      "createdTransactionId",
      "eventDigest",
    ]),
  }),
]);
export const SEALED_RUNTIME_TABLES = Object.freeze([
  ...LEGACY_SEALED_RUNTIME_TABLES,
  ...ADMISSION_SEALED_RUNTIME_TABLES,
  ...RUNTIME_RELEASE_SEALED_RUNTIME_TABLES,
  ...IDENTITY_MAIL_DELIVERY_SEALED_RUNTIME_TABLES,
]);
assert.equal(
  SEALED_RUNTIME_TABLES.reduce(
    (count, entry) => count + entry.columns.length,
    0,
  ),
  291,
  "CURRENT_176 must seal exactly 291 runtime-inaccessible columns.",
);
assert.equal(
  SHARED_BETA_ADMISSION_TYPES.length,
  1,
  "CURRENT_172 must expose exactly one sealed admission enum.",
);
assert.equal(
  SHARED_BETA_ADMISSION_GATE_CODES.length,
  3,
  "CURRENT_172 must expose exactly three admission gate codes.",
);
const ADMISSION_SEALED_RUNTIME_TYPES = Object.freeze(
  SHARED_BETA_ADMISSION_TYPES.map((entry) => {
    assert.equal(entry.kind, "e", `${entry.name} must remain an enum.`);
    assert.equal(
      entry.ownerPolicy,
      "DATABASE_OWNER",
      `${entry.name} must remain database-owner-owned.`,
    );
    assert.equal(
      entry.aclPolicy,
      "OWNER_USAGE_ONLY",
      `${entry.name} must remain owner-only.`,
    );
    return Object.freeze({
      key: entry.name[0].toLowerCase() + entry.name.slice(1),
      catalogName: `public.${quoteIdentifier(entry.name)}`,
      grantName: `public.${quoteIdentifier(entry.name)}`,
      labels: Object.freeze([...SHARED_BETA_ADMISSION_GATE_CODES]),
    });
  }),
);
export const SEALED_RUNTIME_TYPES = Object.freeze([
  Object.freeze({
    key: "identityMailOutboxStatus",
    catalogName: 'public."IdentityMailOutboxStatus"',
    grantName: 'public."IdentityMailOutboxStatus"',
    labels: Object.freeze([
      "HOLD",
      "PENDING",
      "CLAIMED",
      "RETRY",
      "SENT",
      "DEAD",
      "CANCELED",
      "RECONCILIATION_REQUIRED",
    ]),
  }),
  ...ADMISSION_SEALED_RUNTIME_TYPES,
]);
const EFFECTIVE_COLUMN_PRIVILEGE_FIELDS = Object.freeze([
  "canSelect",
  "canInsert",
  "canUpdate",
  "canReference",
]);
const DIRECT_COLUMN_PRIVILEGE_FIELDS = Object.freeze([
  "directSelect",
  "directInsert",
  "directUpdate",
  "directReference",
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

export function expectedApplyConfirmation(databaseName, roleName) {
  return [
    "APPLY_RUNTIME_FUNCTION_ENROLLMENT_V1",
    databaseName,
    roleName,
    RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
    RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
  ].join(" ");
}

export function parseRuntimeFunctionEnrollmentConfig(environment, mode) {
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

  const roleName = stringValue(environment.RUNTIME_FUNCTION_ENROLLMENT_ROLE);
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
    expectedMigrationCount: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
    requiredConfirmation,
  });
}

export function runtimeFunctionContractDigest() {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: RUNTIME_FUNCTION_ENROLLMENT_SCHEMA_VERSION,
        requiredMigration: RUNTIME_FUNCTION_ENROLLMENT_REQUIRED_MIGRATION,
        migration: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION,
        migrationCount: RUNTIME_FUNCTION_ENROLLMENT_MIGRATION_COUNT,
        exactFunctionSearchPath: "pg_catalog",
        application: APPLICATION_RUNTIME_FUNCTIONS.map(
          ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language: language ?? null,
          }),
        ),
        excludedWorker: EXCLUDED_WORKER_FUNCTIONS.map(
          ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language: language ?? null,
          }),
        ),
        excludedPending: EXCLUDED_PENDING_FUNCTIONS.map(
          ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language: language ?? null,
          }),
        ),
        excludedAdmission: EXCLUDED_ADMISSION_FUNCTIONS.map(
          ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }),
        ),
        excludedRuntimeRelease: EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map(
          ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }) => ({
            key,
            catalogSignature,
            securityDefiner,
            volatility,
            language,
          }),
        ),
        sealedTables: SEALED_RUNTIME_TABLES,
        sealedTypes: SEALED_RUNTIME_TYPES,
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
    const columns = entry.columns
      .map((columnName) => quoteIdentifier(columnName))
      .join(", ");
    statements.push(
      `REVOKE ALL PRIVILEGES ON TABLE ${entry.grantName} FROM ${role}`,
    );
    statements.push(
      `REVOKE ALL PRIVILEGES ON TABLE ${entry.grantName} FROM PUBLIC`,
    );
    statements.push(
      `REVOKE ALL PRIVILEGES (${columns}) ON TABLE ${entry.grantName} FROM ${role}`,
    );
    statements.push(
      `REVOKE ALL PRIVILEGES (${columns}) ON TABLE ${entry.grantName} FROM PUBLIC`,
    );
  }
  for (const entry of SEALED_RUNTIME_TYPES) {
    statements.push(
      `REVOKE ALL PRIVILEGES ON TYPE ${entry.grantName} FROM ${role}`,
    );
    statements.push(
      `REVOKE ALL PRIVILEGES ON TYPE ${entry.grantName} FROM PUBLIC`,
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
        language_object.lanname AS language_name,
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
      LEFT JOIN pg_catalog.pg_language AS language_object
        ON language_object.oid = function_object.prolang
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
    expectedLanguage:
      typeof entry.language === "string" ? entry.language : null,
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    securityDefiner: row?.security_definer === true,
    searchPathPgCatalogOnly: row?.search_path_pg_catalog_only === true,
    volatility: typeof row?.volatility === "string" ? row.volatility : null,
    language: typeof row?.language_name === "string" ? row.language_name : null,
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
        relation_object.relpersistence::text AS persistence,
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
  const columnRows = await prisma.$queryRawUnsafe(
    `
      SELECT
        attribute.attname AS column_name,
        pg_catalog.has_column_privilege(
          $1,
          relation_object.oid,
          attribute.attnum,
          'SELECT'
        ) AS can_select,
        pg_catalog.has_column_privilege(
          $1,
          relation_object.oid,
          attribute.attnum,
          'INSERT'
        ) AS can_insert,
        pg_catalog.has_column_privilege(
          $1,
          relation_object.oid,
          attribute.attnum,
          'UPDATE'
        ) AS can_update,
        pg_catalog.has_column_privilege(
          $1,
          relation_object.oid,
          attribute.attnum,
          'REFERENCES'
        ) AS can_reference,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              column_acl.grantee = target_role.oid
              AND column_acl.privilege_type = 'SELECT'
            )
            FROM pg_catalog.aclexplode(
              attribute.attacl
            ) AS column_acl
          ),
          FALSE
        ) AS direct_select,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              column_acl.grantee = target_role.oid
              AND column_acl.privilege_type = 'INSERT'
            )
            FROM pg_catalog.aclexplode(
              attribute.attacl
            ) AS column_acl
          ),
          FALSE
        ) AS direct_insert,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              column_acl.grantee = target_role.oid
              AND column_acl.privilege_type = 'UPDATE'
            )
            FROM pg_catalog.aclexplode(
              attribute.attacl
            ) AS column_acl
          ),
          FALSE
        ) AS direct_update,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              column_acl.grantee = target_role.oid
              AND column_acl.privilege_type = 'REFERENCES'
            )
            FROM pg_catalog.aclexplode(
              attribute.attacl
            ) AS column_acl
          ),
          FALSE
        ) AS direct_reference,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(column_acl.grantee = 0)
            FROM pg_catalog.aclexplode(
              attribute.attacl
            ) AS column_acl
          ),
          FALSE
        ) AS public_any_privilege
      FROM (
        SELECT pg_catalog.to_regclass($2) AS oid
      ) AS requested
      JOIN pg_catalog.pg_class AS relation_object
        ON relation_object.oid = requested.oid
      JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = relation_object.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      CROSS JOIN pg_catalog.pg_roles AS target_role
      WHERE target_role.rolname = $1
      ORDER BY attribute.attnum
    `,
    roleName,
    entry.catalogName,
  );
  const row = rows[0];
  const columns = columnRows.map((column) => ({
    name: typeof column.column_name === "string" ? column.column_name : null,
    canSelect: column.can_select === true,
    canInsert: column.can_insert === true,
    canUpdate: column.can_update === true,
    canReference: column.can_reference === true,
    directSelect: column.direct_select === true,
    directInsert: column.direct_insert === true,
    directUpdate: column.direct_update === true,
    directReference: column.direct_reference === true,
    publicAnyPrivilege: column.public_any_privilege === true,
  }));
  return {
    key: entry.key,
    catalogName: entry.catalogName,
    expectedColumns: [...entry.columns],
    expectedPersistence: entry.expectedPersistence ?? null,
    columnManifestMatches:
      columns.length === entry.columns.length &&
      columns.every((column, index) => column.name === entry.columns[index]),
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    persistence: typeof row?.persistence === "string" ? row.persistence : null,
    canSelect: row?.can_select === true,
    canInsert: row?.can_insert === true,
    canUpdate: row?.can_update === true,
    canDelete: row?.can_delete === true,
    canTruncate: row?.can_truncate === true,
    canReference: row?.can_reference === true,
    canTrigger: row?.can_trigger === true,
    publicAnyPrivilege: row?.public_any_privilege === true,
    publicAnyColumnPrivilege: columns.some(
      (column) => column.publicAnyPrivilege,
    ),
    columns,
    grantorCanRevoke: row?.grantor_can_revoke === true,
  };
}

async function inspectSealedType(prisma, roleName, entry) {
  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        type_object.oid IS NOT NULL AS exists,
        owner_role.rolname AS owner_name,
        CASE
          WHEN type_object.oid IS NULL THEN FALSE
          ELSE pg_catalog.has_type_privilege(
            $1,
            type_object.oid,
            'USAGE'
          )
        END AS effective_usage,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              type_acl.grantee = target_role.oid
              AND type_acl.privilege_type = 'USAGE'
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                type_object.typacl,
                pg_catalog.acldefault('T', type_object.typowner)
              )
            ) AS type_acl
          ),
          FALSE
        ) AS direct_usage,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              type_acl.grantee = target_role.oid
              AND type_acl.privilege_type = 'USAGE'
              AND type_acl.is_grantable
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                type_object.typacl,
                pg_catalog.acldefault('T', type_object.typowner)
              )
            ) AS type_acl
          ),
          FALSE
        ) AS target_grant_option,
        COALESCE(
          (
            SELECT pg_catalog.bool_or(
              type_acl.grantee = 0
              AND type_acl.privilege_type = 'USAGE'
            )
            FROM pg_catalog.aclexplode(
              COALESCE(
                type_object.typacl,
                pg_catalog.acldefault('T', type_object.typowner)
              )
            ) AS type_acl
          ),
          FALSE
        ) AS public_usage,
        CASE
          WHEN type_object.oid IS NULL THEN FALSE
          ELSE (
            type_object.typowner = (
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
        SELECT pg_catalog.to_regtype($2) AS oid
      ) AS requested
      LEFT JOIN pg_catalog.pg_type AS type_object
        ON type_object.oid = requested.oid
      LEFT JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid = type_object.typowner
      CROSS JOIN pg_catalog.pg_roles AS target_role
      WHERE target_role.rolname = $1
    `,
    roleName,
    entry.catalogName,
  );
  const labelRows = await prisma.$queryRawUnsafe(
    `
      SELECT enum_value.enumlabel
      FROM pg_catalog.pg_enum AS enum_value
      WHERE enum_value.enumtypid = pg_catalog.to_regtype($1)
      ORDER BY enum_value.enumsortorder
    `,
    entry.catalogName,
  );
  const labels = labelRows
    .map((row) => row.enumlabel)
    .filter((label) => typeof label === "string");
  const row = rows[0];
  return {
    key: entry.key,
    catalogName: entry.catalogName,
    grantName: entry.grantName,
    expectedLabels: [...entry.labels],
    labelManifestMatches:
      labels.length === entry.labels.length &&
      labels.every((label, index) => label === entry.labels[index]),
    labels,
    exists: row?.exists === true,
    ownerName: typeof row?.owner_name === "string" ? row.owner_name : null,
    effectiveUsage: row?.effective_usage === true,
    directUsage: row?.direct_usage === true,
    targetGrantOption: row?.target_grant_option === true,
    publicUsage: row?.public_usage === true,
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
        )::integer AS ownership_count,
        (
          SELECT pg_catalog.count(*)::integer
          FROM public."SharedBetaRuntimeReleaseChallenge" AS challenge
          WHERE challenge."stateRevision" = 1
            AND challenge."consumedAt" IS NULL
            AND challenge."validUntil" >
              pg_catalog.statement_timestamp()
            AND (
              challenge."activationRoleName" = role.rolname
              OR challenge."activationRoleOid" = role.oid::BIGINT
            )
        ) AS live_activation_challenge_binding_count,
        (
          SELECT pg_catalog.count(*)::integer
          FROM public."SharedBetaRuntimeReleaseMarker" AS marker
          WHERE marker."stateRevision" = 1
            AND marker."revokedAt" IS NULL
            AND (
              marker."activationDatabaseRole" = role.rolname
              OR marker."coordinatorRoleName" = role.rolname
              OR marker."coordinatorRoleOid" = role.oid::BIGINT
            )
        ) AS unrevoked_activation_marker_binding_count
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
    functions.push(await inspectFunction(prisma, config.roleName, entry));
  }
  const sealedTables = [];
  for (const entry of SEALED_RUNTIME_TABLES) {
    sealedTables.push(await inspectSealedTable(prisma, config.roleName, entry));
  }
  const sealedTypes = [];
  for (const entry of SEALED_RUNTIME_TYPES) {
    sealedTypes.push(await inspectSealedType(prisma, config.roleName, entry));
  }

  return {
    server: {
      databaseName:
        typeof server?.database_name === "string" ? server.database_name : null,
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
            liveActivationChallengeBindingCount: Number(
              role.live_activation_challenge_binding_count ?? -1,
            ),
            unrevokedActivationMarkerBindingCount: Number(
              role.unrevoked_activation_marker_binding_count ?? -1,
            ),
          },
    migration: {
      completedTargetCount: Number(migration?.completed_target_count ?? -1),
      completedRequiredCount: Number(migration?.completed_required_count ?? -1),
      completedCount: Number(migration?.completed_count ?? -1),
      unfinishedCount: Number(migration?.unfinished_count ?? -1),
      latestCompletedMigration:
        typeof migration?.latest_completed_migration === "string"
          ? migration.latest_completed_migration
          : null,
    },
    functions,
    sealedTables,
    sealedTypes,
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
    if (snapshot.role.liveActivationChallengeBindingCount !== 0) {
      violations.push("RUNTIME_ROLE_BOUND_TO_LIVE_ACTIVATION_CHALLENGE");
    }
    if (snapshot.role.unrevokedActivationMarkerBindingCount !== 0) {
      violations.push("RUNTIME_ROLE_BOUND_TO_UNREVOKED_ACTIVATION_MARKER");
    }
  }
  if (snapshot.migration.completedRequiredCount !== 1) {
    violations.push("MIGRATION_166_NOT_COMPLETED_EXACTLY_ONCE");
  }
  if (snapshot.migration.completedTargetCount !== 1) {
    violations.push("CURRENT_MIGRATION_NOT_COMPLETED_EXACTLY_ONCE");
  }
  if (
    snapshot.migration.latestCompletedMigration !== config.expectedMigration
  ) {
    violations.push("CURRENT_MIGRATION_MISMATCH");
  }
  if (snapshot.migration.completedCount !== config.expectedMigrationCount) {
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
    if (
      entry.expectedLanguage !== null &&
      entry.language !== entry.expectedLanguage
    ) {
      violations.push(`${entry.key}:LANGUAGE_MISMATCH`);
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
    if (!entry.columnManifestMatches) {
      violations.push(`${entry.key}:COLUMN_MANIFEST_MISMATCH`);
    }
    if (
      entry.expectedPersistence !== null &&
      entry.persistence !== entry.expectedPersistence
    ) {
      violations.push(`${entry.key}:PERSISTENCE_MISMATCH`);
    }
    if (entry.ownerName === config.roleName) {
      violations.push(`${entry.key}:RUNTIME_ROLE_OWNS_TABLE`);
    }
    if (!entry.grantorCanRevoke) {
      violations.push(`${entry.key}:GRANTOR_CANNOT_REVOKE`);
    }
  }
  for (const entry of snapshot.sealedTypes) {
    if (!entry.exists) {
      violations.push(`${entry.key}:TYPE_MISSING`);
      continue;
    }
    if (!entry.labelManifestMatches) {
      violations.push(`${entry.key}:ENUM_LABEL_MANIFEST_MISMATCH`);
    }
    if (entry.ownerName === config.roleName) {
      violations.push(`${entry.key}:RUNTIME_ROLE_OWNS_TYPE`);
    }
    if (!entry.grantorCanRevoke) {
      violations.push(`${entry.key}:GRANTOR_CANNOT_REVOKE_TYPE`);
    }
  }
  return violations;
}

export function runtimeFunctionEnrollmentComplianceViolations(snapshot) {
  const violations = [];
  const applicationKeys = new Set(
    APPLICATION_RUNTIME_FUNCTIONS.map(({ key }) => key),
  );
  const workerKeys = new Set(EXCLUDED_WORKER_FUNCTIONS.map(({ key }) => key));
  const admissionKeys = new Set(
    EXCLUDED_ADMISSION_FUNCTIONS.map(({ key }) => key),
  );
  const runtimeReleaseKeys = new Set(
    EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map(({ key }) => key),
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
        : admissionKeys.has(entry.key)
          ? "ADMISSION"
          : runtimeReleaseKeys.has(entry.key)
            ? "RUNTIME_RELEASE"
            : "PENDING";
      if (entry.effectiveExecute || entry.directExecute) {
        violations.push(`${entry.key}:${exclusionKind}_EXECUTE_PRESENT`);
      }
      if (entry.targetGrantOption) {
        violations.push(`${entry.key}:${exclusionKind}_GRANT_OPTION_PRESENT`);
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
    if (entry.publicAnyPrivilege) {
      violations.push(`${entry.key}:PUBLIC_TABLE_PRIVILEGE_PRESENT`);
    }
    if (
      entry.columns.some((column) =>
        EFFECTIVE_COLUMN_PRIVILEGE_FIELDS.some((field) => column[field]),
      )
    ) {
      violations.push(`${entry.key}:EFFECTIVE_COLUMN_PRIVILEGE_PRESENT`);
    }
    if (
      entry.columns.some((column) =>
        DIRECT_COLUMN_PRIVILEGE_FIELDS.some((field) => column[field]),
      )
    ) {
      violations.push(`${entry.key}:DIRECT_COLUMN_PRIVILEGE_PRESENT`);
    }
    if (entry.publicAnyColumnPrivilege) {
      violations.push(`${entry.key}:PUBLIC_COLUMN_PRIVILEGE_PRESENT`);
    }
  }
  for (const entry of snapshot.sealedTypes) {
    if (entry.effectiveUsage || entry.directUsage || entry.targetGrantOption) {
      violations.push(`${entry.key}:RUNTIME_TYPE_USAGE_PRESENT`);
    }
    if (entry.publicUsage) {
      violations.push(`${entry.key}:PUBLIC_TYPE_USAGE_PRESENT`);
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
    excludedAdmissionFunctions: EXCLUDED_ADMISSION_FUNCTIONS.map(
      ({ key, catalogSignature }) => ({ key, catalogSignature }),
    ),
    excludedRuntimeReleaseFunctions: EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.map(
      ({ key, catalogSignature }) => ({ key, catalogSignature }),
    ),
    sealedTables: SEALED_RUNTIME_TABLES.map(
      ({ key, catalogName, columns, expectedPersistence }) => ({
        key,
        catalogName,
        columns,
        expectedPersistence: expectedPersistence ?? null,
      }),
    ),
    sealedTypes: SEALED_RUNTIME_TYPES.map(({ key, catalogName, labels }) => ({
      key,
      catalogName,
      labels,
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
      excludedAdmissionExecuteCount: snapshot.functions.filter(
        (entry) =>
          EXCLUDED_ADMISSION_FUNCTIONS.some(
            (candidate) => candidate.key === entry.key,
          ) &&
          (entry.effectiveExecute ||
            entry.directExecute ||
            entry.targetGrantOption),
      ).length,
      excludedRuntimeReleaseExecuteCount: snapshot.functions.filter(
        (entry) =>
          EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.some(
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
      sealedPublicTablePrivilegeCount: snapshot.sealedTables.filter(
        (entry) => entry.publicAnyPrivilege,
      ).length,
      sealedColumnCount: snapshot.sealedTables.reduce(
        (count, entry) => count + entry.columns.length,
        0,
      ),
      sealedColumnWithoutRuntimePrivilegesCount: snapshot.sealedTables.reduce(
        (count, entry) =>
          count +
          entry.columns.filter(
            (column) =>
              !EFFECTIVE_COLUMN_PRIVILEGE_FIELDS.some(
                (field) => column[field],
              ) &&
              !DIRECT_COLUMN_PRIVILEGE_FIELDS.some((field) => column[field]) &&
              !column.publicAnyPrivilege,
          ).length,
        0,
      ),
      sealedEffectiveColumnPrivilegeCount: snapshot.sealedTables.reduce(
        (count, entry) =>
          count +
          entry.columns.reduce(
            (columnCount, column) =>
              columnCount +
              EFFECTIVE_COLUMN_PRIVILEGE_FIELDS.filter((field) => column[field])
                .length,
            0,
          ),
        0,
      ),
      sealedDirectColumnPrivilegeCount: snapshot.sealedTables.reduce(
        (count, entry) =>
          count +
          entry.columns.reduce(
            (columnCount, column) =>
              columnCount +
              DIRECT_COLUMN_PRIVILEGE_FIELDS.filter((field) => column[field])
                .length,
            0,
          ),
        0,
      ),
      sealedPublicColumnPrivilegeCount: snapshot.sealedTables.reduce(
        (count, entry) =>
          count +
          entry.columns.filter((column) => column.publicAnyPrivilege).length,
        0,
      ),
      sealedTypeWithoutRuntimeUsageCount: snapshot.sealedTypes.filter(
        (entry) =>
          !entry.effectiveUsage &&
          !entry.directUsage &&
          !entry.targetGrantOption,
      ).length,
      sealedPublicTypeUsageCount: snapshot.sealedTypes.filter(
        (entry) => entry.publicUsage,
      ).length,
    },
  };
}

export async function checkRuntimeFunctionEnrollment(prisma, config) {
  const snapshot = await inspectRuntimeFunctionEnrollment(prisma, config);
  assertPreconditions(snapshot, config);
  const violations = runtimeFunctionEnrollmentComplianceViolations(snapshot);
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
  const statements = buildRuntimeFunctionEnrollmentStatements(config.roleName);

  await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });

  const after = await inspectRuntimeFunctionEnrollment(prisma, config);
  assertPreconditions(after, config);
  const violations = runtimeFunctionEnrollmentComplianceViolations(after);
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

  const sql =
    buildRuntimeFunctionEnrollmentStatements("leetplus_runtime").join("\n");
  assert.equal(
    buildRuntimeFunctionEnrollmentStatements("leetplus_runtime").length,
    104 + EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length,
  );
  assert.equal(APPLICATION_RUNTIME_FUNCTIONS.length, 8);
  assert.equal(EXCLUDED_WORKER_FUNCTIONS.length, 6);
  assert.equal(EXCLUDED_PENDING_FUNCTIONS.length, 13);
  assert.equal(EXCLUDED_ADMISSION_FUNCTIONS.length, 9);
  assert.equal(EXCLUDED_RUNTIME_RELEASE_FUNCTIONS.length, 20);
  assert.equal(SEALED_RUNTIME_TABLES.length, 14);
  assert.equal(SEALED_RUNTIME_TYPES.length, 2);
  assert.match(sql, /guest_game_reward_delivery_lock_v1/u);
  assert.match(sql, /guest_game_delivery_transition_key_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v1/u);
  assert.match(sql, /identity_email_claim_reserve_invite_v2/u);
  assert.match(sql, /identity_email_claim_assert_invite_v1/u);
  assert.match(sql, /identity_email_claim_assert_invite_locator_v1/u);
  assert.match(sql, /identity_email_claim_transition_v2/u);
  assert.match(sql, /identity_email_claim_release_v2/u);
  assert.match(sql, /identity_owner_invite_issue_hold_v1/u);
  assert.match(sql, /identity_initial_owner_invite_delivery_assert_sent_v1/u);
  assert.match(sql, /identity_initial_owner_mail_claim_v1/u);
  assert.match(sql, /identity_initial_owner_mail_provider_mark_v1/u);
  assert.match(sql, /identity_initial_owner_mail_complete_v1/u);
  assert.match(sql, /identity_initial_owner_mail_reap_v1/u);
  assert.match(sql, /identity_initial_owner_mail_reconcile_v1/u);
  assert.match(sql, /identity_mail_outbox_delivery_guard_v1/u);
  assert.doesNotMatch(sql, /identity_mail_outbox_release_guard_v1/u);
  assert.match(sql, /shared_beta_tenant_profile_digest_v1/u);
  assert.match(sql, /SharedBetaReleaseGateCode/u);
  assert.match(sql, /IdentityMailOutboxStatus/u);
  assert.match(sql, /"releasedAt"/u);
  assert.match(sql, /"transitionRevision"/u);
  assert.match(sql, /"providerAttemptKey"/u);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityEmailClaim"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityOwnerInviteIssueCommand"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailOutbox"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaBuildProvenance"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseChallenge"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseMarker"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaRuntimeReleaseState"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."SharedBetaTenantActivationCommand"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailDeliveryTenantEnrollment"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityMailDeliveryEvent"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES \("emailCanonical", "claimType", "tenantId", "subjectId", "revision", "createdAt", "updatedAt", "workflowLocator"\) ON TABLE public\."IdentityEmailClaim" FROM "leetplus_runtime"/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES \("id", "tenantId", "issueCommandId".*\) ON TABLE public\."IdentityMailOutbox" FROM PUBLIC/u,
  );
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TABLE public\."IdentityOwnerInviteIssueCommand" FROM PUBLIC/u,
  );
  assert.match(sql, /REVOKE EXECUTE.*guest_game_delivery_record_event_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_lock_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_transition_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*identity_email_claim_release_v1/su);
  assert.match(sql, /REVOKE EXECUTE.*shared_beta_release_gate_attestation/su);
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES ON TYPE public\."SharedBetaReleaseGateCode" FROM PUBLIC/u,
  );
  assert.doesNotMatch(sql, /\bALL FUNCTIONS\b/iu);
  assert.doesNotMatch(sql, /\bTO PUBLIC\b/iu);
  assert.equal(runtimeFunctionContractDigest().length, 64);
}
