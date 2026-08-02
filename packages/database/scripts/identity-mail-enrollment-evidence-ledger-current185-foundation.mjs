import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FOUNDATION_CONTRACT =
  "IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FOUNDATION_STATIC_V1";
export const IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE =
  "20260802030000_identity_mail_enrollment_evidence_ledger_v2";
export const IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_PREDECESSOR =
  "20260802020000_identity_mail_worker_v2_lost_response_replay";
export const IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_ORDINAL = 185;

export const IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS =
  Object.freeze({
    ACL_SURFACE_DRIFT: "ACL_SURFACE_DRIFT",
    APPEND_ONLY_DRIFT: "APPEND_ONLY_DRIFT",
    ARTIFACT_INVALID: "ARTIFACT_INVALID",
    BUNDLE_DIGEST_DRIFT: "BUNDLE_DIGEST_DRIFT",
    CANDIDATE_CHAIN_DRIFT: "CANDIDATE_CHAIN_DRIFT",
    COMMAND_V2_SURFACE_DRIFT: "COMMAND_V2_SURFACE_DRIFT",
    COMPOSITE_BINDING_DRIFT: "COMPOSITE_BINDING_DRIFT",
    CONFLICT_CONTRACT_DRIFT: "CONFLICT_CONTRACT_DRIFT",
    EXECUTION_FENCE_MISSING: "EXECUTION_FENCE_MISSING",
    FINAL_COLUMN_MANIFEST_DRIFT: "FINAL_COLUMN_MANIFEST_DRIFT",
    FORBIDDEN_AUTHORITY_OR_DML: "FORBIDDEN_AUTHORITY_OR_DML",
    IMPORT_INSERT_GUARD_DRIFT: "IMPORT_INSERT_GUARD_DRIFT",
    IMPORTER_CATALOG_DRIFT: "IMPORTER_CATALOG_DRIFT",
    IMPORTER_SURFACE_DRIFT: "IMPORTER_SURFACE_DRIFT",
    MANIFEST_LEDGER_DRIFT: "MANIFEST_LEDGER_DRIFT",
    METADATA_DRIFT: "METADATA_DRIFT",
    POSTCONDITION_DRIFT: "POSTCONDITION_DRIFT",
    PREDECESSOR_CATALOG_DRIFT: "PREDECESSOR_CATALOG_DRIFT",
    PREDECESSOR_DRIFT: "PREDECESSOR_DRIFT",
    RECEIPT_SURFACE_DRIFT: "RECEIPT_SURFACE_DRIFT",
    REPLAY_ORDER_DRIFT: "REPLAY_ORDER_DRIFT",
    RETAINED_RPC_CONTINUITY_DRIFT: "RETAINED_RPC_CONTINUITY_DRIFT",
    REVOCATION_LOCK_DRIFT: "REVOCATION_LOCK_DRIFT",
    RUNTIME_EXPOSURE_DRIFT: "RUNTIME_EXPOSURE_DRIFT",
    SQL_SHA_DRIFT: "SQL_SHA_DRIFT",
    TENANT_LOCK_CONTINUITY_DRIFT: "TENANT_LOCK_CONTINUITY_DRIFT",
    TENANT_LOCK_ORDER_DRIFT: "TENANT_LOCK_ORDER_DRIFT",
    TRANSACTION_ENVELOPE_INVALID: "TRANSACTION_ENVELOPE_INVALID",
  });

const EXPECTED_CANONICAL_COUNT = 179;
const EXPECTED_CANONICAL_HEAD =
  "20260731120000_identity_mail_delivery_release_head";
const EXPECTED_CANONICAL_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const EXPECTED_PREDECESSOR_MANIFEST_DIGEST =
  "9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819";
const EXPECTED_PREDECESSOR_SHA256 =
  "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424";
const EXPECTED_CURRENT185_SHA256 =
  "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6";
const EXPECTED_PREDECESSOR_COLUMN_MANIFEST_DIGEST =
  "be490e0aa6819487811dc010cdec3a9165f8b5134eef2acb2585f34886478617";
const EXPECTED_PREDECESSOR_CONSTRAINT_MANIFEST_DIGEST =
  "4c92d9e5d371003ae3512e2c450ec2b981e6209a7ef1d56ffe2d8ff9dd10c8bc";
const EXPECTED_PREDECESSOR_INDEX_MANIFEST_DIGEST =
  "b1722ac29aa6197dc73c5b0687779d9c2bfdbe8fffa9c03df48406ee1ab6d771";
const EXPECTED_PREDECESSOR_TENANT_LOCK_PROSRC_SHA256 =
  "c53780aa0df846a4085b01b4c62cbb857f69e0f145a8c72a43ef1af35fafc790";
const EXPECTED_PREDECESSOR_COMMAND_GUARD_PROSRC_SHA256 =
  "9d0e35ef0b95ff070c7957825fa01fb022b0a3f64ae99955b888538acb58cd53";
const EXPECTED_FINAL_COLUMN_MANIFESTS = Object.freeze([
  Object.freeze({
    count: 86,
    digest: "5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa2",
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
  }),
  Object.freeze({
    count: 36,
    digest: "2c143eb3707f8f77f2922378b394ad6dab6e704893fb987fd2576edc94d73b0e",
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
  }),
  Object.freeze({
    count: 5,
    digest: "9086e1a3ed6a0767868a24696820c4639e4bba6b49aa257125e5ecc90c04d44e",
    relation: "IdentityMailDutyRoleManifestRevocationV2",
  }),
]);
const EXPECTED_RETAINED_RPC_SURFACE = Object.freeze([
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_provider_authority_digest",
    ]),
    bodySha256:
      "56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c",
    signature: 'public."identity_mail_delivery_worker_assert_v2"(text,text)',
  }),
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_lease_owner_digest",
      "p_lease_token_digest",
      "p_provider_authority_digest",
    ]),
    bodySha256:
      "99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1",
    signature:
      'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
  }),
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_outbox_id",
      "p_expected_lease_version",
      "p_lease_owner_digest",
      "p_lease_token_digest",
      "p_provider_attempt_key",
      "p_provider_authority_digest",
      "p_message_id_digest",
    ]),
    bodySha256:
      "ed440a728feb80b1740246855da8f8eea83b6b17b9d6fd1a59368184c3287af3",
    signature:
      'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
  }),
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_outbox_id",
      "p_expected_lease_version",
      "p_lease_owner_digest",
      "p_lease_token_digest",
      "p_provider_authority_digest",
      "p_outcome_code",
      "p_provider_receipt_digest",
      "p_terminal_ack_digest",
    ]),
    bodySha256:
      "ffa78b8844522a7b80ed38fe6eb11454b9d8e4c2fe319878cbd7bda42ed02730",
    signature:
      'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
  }),
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_provider_authority_digest",
      "p_worker_actor_digest",
      "p_batch_limit",
    ]),
    bodySha256:
      "1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d",
    signature:
      'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
  }),
  Object.freeze({
    argumentNames: Object.freeze([
      "p_tenant_id",
      "p_outbox_id",
      "p_expected_transition_revision",
      "p_resolution_code",
      "p_evidence_digest",
      "p_actor_digest",
    ]),
    bodySha256:
      "39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151",
    signature:
      'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
  }),
]);
const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  "20260801010000_identity_mail_tenant_enrollment_control_plane",
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  "20260801030000_identity_mail_tenant_first_claim_protocol",
  "20260802010000_identity_mail_worker_v2_freshness_protocol",
  IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_PREDECESSOR,
  IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE,
]);
const EXPECTED_PREDECESSOR_COLUMN_MANIFEST = Object.freeze(
  `1|id|text|true|false
2|tenantId|text|true|false
3|requestId|text|true|false
4|action|character varying(16)|true|false
5|intent|character varying(16)|true|true
6|contractVersion|character varying(64)|true|true
7|signatureDomain|character varying(64)|true|true
8|rollbackOfCommandId|text|false|false
9|proposalContentDigest|character(64)|true|false
10|proposalCanonicalJson|text|true|false
11|authorizationEnvelopeDigest|character(64)|true|false
12|authorizationEnvelopeCanonicalJson|text|true|false
13|expectedState|character varying(16)|true|false
14|targetState|character varying(16)|true|false
15|expectedPolicyRevision|integer|true|false
16|nextPolicyRevision|integer|true|false
17|stateRevisionBefore|bigint|true|false
18|drainStateRevision|bigint|false|false
19|finalStateRevision|bigint|true|false
20|previousWorkerRoleName|character varying(63)|false|false
21|previousWorkerRoleOid|bigint|false|false
22|previousProviderAuthorityDigest|character(64)|false|false
23|previousMaxAttempts|integer|false|false
24|previousLeaseSeconds|integer|false|false
25|previousAcknowledgeSeconds|integer|false|false
26|previousBaseRetrySeconds|integer|false|false
27|previousMaxRetrySeconds|integer|false|false
28|previousConfigurationDigest|character(64)|false|false
29|targetWorkerRoleName|character varying(63)|true|false
30|targetWorkerRoleOid|bigint|true|false
31|targetProviderAuthorityDigest|character(64)|true|false
32|targetMaxAttempts|integer|true|false
33|targetLeaseSeconds|integer|true|false
34|targetAcknowledgeSeconds|integer|true|false
35|targetBaseRetrySeconds|integer|true|false
36|targetMaxRetrySeconds|integer|true|false
37|targetConfigurationDigest|character(64)|true|false
38|runtimeConfigDigest|character(64)|true|false
39|expectedDatabaseName|character varying(63)|true|false
40|expectedDatabaseOid|bigint|true|false
41|databaseIdentityDigest|character(64)|true|false
42|deploymentMarkerId|text|true|false
43|deploymentMarkerDigest|character(64)|true|false
44|actualContextDigest|character(64)|true|false
45|releaseSha|character(40)|true|false
46|actorDigest|character(64)|true|false
47|signatureAlgorithm|character varying(16)|true|true
48|signingKeyId|character varying(64)|true|false
49|publicKeyFingerprint|character(64)|true|false
50|signatureBase64url|text|true|false
51|signatureVerifiedAt|timestamp(3) with time zone|true|false
52|requestedAt|timestamp(3) with time zone|true|false
53|expiresAt|timestamp(3) with time zone|true|false
54|acceptedAt|timestamp(3) with time zone|true|false
55|acceptedTransactionId|character varying(32)|true|false
56|receipt|jsonb|true|false
57|receiptDigest|character(64)|true|false`.split("\n"),
);
const EXPECTED_PREDECESSOR_CATALOG_MANIFEST = Object.freeze(
  `IdentityMailDeliveryTenantEnrollmentCommand_pkey|constraint|true
identity_mail_tenant_enrollment_command_tenant_id_key|constraint|true
identity_mail_tenant_enrollment_command_request_uidx|constraint|true
identity_mail_tenant_enrollment_command_digest_key|constraint|true
identity_mail_tenant_enrollment_command_drain_projection_key|constraint|true
identity_mail_tenant_enrollment_command_identifier_check|constraint|false
identity_mail_tenant_enrollment_command_kind_check|constraint|false
identity_mail_tenant_enrollment_command_digest_check|constraint|false
identity_mail_tenant_enrollment_command_transition_check|constraint|false
identity_mail_tenant_enrollment_command_revision_check|constraint|false
identity_mail_tenant_enrollment_command_previous_check|constraint|false
identity_mail_tenant_enrollment_command_target_check|constraint|false
identity_mail_tenant_enrollment_command_mutation_check|constraint|false
identity_mail_tenant_enrollment_command_binding_check|constraint|false
identity_mail_tenant_enrollment_command_signature_check|constraint|false
identity_mail_tenant_enrollment_command_timeline_check|constraint|false
identity_mail_tenant_enrollment_command_payload_check|constraint|false
identity_mail_tenant_enrollment_command_receipt_check|constraint|false
IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey|constraint|false
IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey|constraint|false
IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey|constraint|false
IdentityMailDeliveryTenantEnrollmentCommand_pkey|index|true
identity_mail_tenant_enrollment_command_tenant_id_key|index|true
identity_mail_tenant_enrollment_command_request_uidx|index|true
identity_mail_tenant_enrollment_command_digest_key|index|true
identity_mail_tenant_enrollment_command_drain_projection_key|index|true
identity_mail_tenant_enrollment_command_marker_idx|index|false
identity_mail_tenant_enrollment_command_rollback_idx|index|false
identity_mail_tenant_enrollment_command_accepted_idx|index|false
identity_mail_tenant_enrollment_command_rollback_once_uidx|index|true`.split("\n"),
);
const EXPECTED_COMMAND_V2_COLUMNS = Object.freeze([
  "id", "tenantId", "requestId", "action", "intent", "contractVersion",
  "signatureDomain", "rollbackOfCommandId", "proposalContentDigest",
  "proposalCanonicalJson", "authorizationEnvelopeDigest",
  "authorizationEnvelopeCanonicalJson", "expectedState", "targetState",
  "expectedPolicyRevision", "nextPolicyRevision", "stateRevisionBefore",
  "drainStateRevision", "finalStateRevision", "previousWorkerRoleName",
  "previousWorkerRoleOid", "previousProviderAuthorityDigest",
  "previousMaxAttempts", "previousLeaseSeconds",
  "previousAcknowledgeSeconds", "previousBaseRetrySeconds",
  "previousMaxRetrySeconds", "previousConfigurationDigest",
  "targetWorkerRoleName", "targetWorkerRoleOid",
  "targetProviderAuthorityDigest", "targetMaxAttempts", "targetLeaseSeconds",
  "targetAcknowledgeSeconds", "targetBaseRetrySeconds",
  "targetMaxRetrySeconds", "targetConfigurationDigest", "runtimeConfigDigest",
  "expectedDatabaseName", "expectedDatabaseOid", "databaseIdentityDigest",
  "deploymentMarkerId", "deploymentMarkerDigest", "actualContextDigest",
  "releaseSha", "actorDigest", "signatureAlgorithm", "signingKeyId",
  "publicKeyFingerprint", "signatureBase64url", "requestedAt", "expiresAt",
  "dutyManifestContract", "dutyManifestProfile", "dutyManifestId",
  "dutyManifestRevision", "dutyManifestPayloadDigest",
  "dutyManifestSigningKeyId", "dutyManifestPublicKeyFingerprint",
  "dutyCoordinatorRoleName", "dutyCoordinatorRoleOid", "dutyWorkerRoleName",
  "dutyWorkerRoleOid", "dutyExactGrantsProfile", "dutyExactGrantsDigest",
  "dutyPredecessorManifestDigest", "dutyApplicationContract",
  "dutyApplicationReleaseSha", "dutyApplicationArtifactSha256",
]);
const EXPECTED_DUTY_BINDING_COLUMNS = Object.freeze(
  EXPECTED_COMMAND_V2_COLUMNS.slice(52),
);
const EXPECTED_MANIFEST_FK_SPECS = Object.freeze([
  Object.freeze({
    confkey: Object.freeze([1, 2, 3, 4, 5, 11, 12, 22, 23, 24, 25, 26, 27]),
    conkey: Object.freeze([62, 60, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70]),
    localColumns: Object.freeze([
      "dutyManifestPayloadDigest",
      "dutyManifestId",
      "dutyManifestRevision",
      "dutyManifestContract",
      "dutyManifestProfile",
      "dutyManifestSigningKeyId",
      "dutyManifestPublicKeyFingerprint",
      "dutyCoordinatorRoleName",
      "dutyCoordinatorRoleOid",
      "dutyWorkerRoleName",
      "dutyWorkerRoleOid",
      "dutyExactGrantsProfile",
      "dutyExactGrantsDigest",
    ]),
    name: "identity_mail_command_manifest_v2_evidence_fkey",
    referencedColumns: Object.freeze([
      "payloadDigest",
      "manifestId",
      "manifestRevision",
      "contractVersion",
      "profile",
      "signingKeyId",
      "publicKeyFingerprint",
      "coordinatorRoleName",
      "coordinatorRoleOid",
      "workerRoleName",
      "workerRoleOid",
      "exactGrantsProfile",
      "exactGrantsDigest",
    ]),
  }),
  Object.freeze({
    confkey: Object.freeze([1, 2, 3, 16, 17, 18, 19, 20, 21, 29, 30, 31, 32]),
    conkey: Object.freeze([62, 60, 61, 39, 40, 41, 42, 43, 44, 71, 72, 73, 74]),
    localColumns: Object.freeze([
      "dutyManifestPayloadDigest",
      "dutyManifestId",
      "dutyManifestRevision",
      "expectedDatabaseName",
      "expectedDatabaseOid",
      "databaseIdentityDigest",
      "deploymentMarkerId",
      "deploymentMarkerDigest",
      "actualContextDigest",
      "dutyPredecessorManifestDigest",
      "dutyApplicationContract",
      "dutyApplicationReleaseSha",
      "dutyApplicationArtifactSha256",
    ]),
    name: "identity_mail_command_manifest_v2_context_fkey",
    referencedColumns: Object.freeze([
      "payloadDigest",
      "manifestId",
      "manifestRevision",
      "databaseName",
      "databaseOid",
      "databaseIdentityDigest",
      "deploymentMarkerId",
      "deploymentMarkerDigest",
      "actualContextDigest",
      "predecessorManifestDigest",
      "applicationContract",
      "applicationReleaseSha",
      "applicationArtifactSha256",
    ]),
  }),
]);
const EXPECTED_MANIFEST_FK_SHARDS = Object.freeze(
  EXPECTED_MANIFEST_FK_SPECS.map(({ name }) => name),
);
const EXPECTED_FOREIGN_KEY_POSTCONDITION = Object.freeze([
  Object.freeze({
    confkey: Object.freeze([1]),
    conkey: Object.freeze([2]),
    deferred: false,
    deferrable: false,
    name: "IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey",
    referencedRelation: "Tenant",
    sourceRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
  }),
  Object.freeze({
    confkey: Object.freeze([1, 22, 10, 12]),
    conkey: Object.freeze([42, 43, 41, 44]),
    deferred: false,
    deferrable: false,
    name: "IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey",
    referencedRelation: "SharedBetaRuntimeReleaseMarker",
    sourceRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
  }),
  Object.freeze({
    confkey: Object.freeze([2, 1]),
    conkey: Object.freeze([2, 8]),
    deferred: false,
    deferrable: false,
    name: "IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey",
    referencedRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
    sourceRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
  }),
  ...EXPECTED_MANIFEST_FK_SPECS.map(({ confkey, conkey, name }) =>
    Object.freeze({
      confkey,
      conkey,
      deferred: false,
      deferrable: false,
      name,
      referencedRelation: "IdentityMailDutyRoleManifestEvidenceV2",
      sourceRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
    })
  ),
  Object.freeze({
    confkey: Object.freeze([1, 22, 10, 12]),
    conkey: Object.freeze([19, 20, 18, 21]),
    deferred: false,
    deferrable: false,
    name: "identity_mail_manifest_v2_marker_fkey",
    referencedRelation: "SharedBetaRuntimeReleaseMarker",
    sourceRelation: "IdentityMailDutyRoleManifestEvidenceV2",
  }),
  Object.freeze({
    confkey: Object.freeze([1, 86]),
    conkey: Object.freeze([33, 36]),
    deferred: true,
    deferrable: true,
    name: "identity_mail_manifest_v2_import_command_fkey",
    referencedRelation: "IdentityMailDeliveryTenantEnrollmentCommand",
    sourceRelation: "IdentityMailDutyRoleManifestEvidenceV2",
  }),
  Object.freeze({
    confkey: Object.freeze([1]),
    conkey: Object.freeze([1]),
    deferred: false,
    deferrable: false,
    name: "identity_mail_manifest_revocation_v2_manifest_fkey",
    referencedRelation: "IdentityMailDutyRoleManifestEvidenceV2",
    sourceRelation: "IdentityMailDutyRoleManifestRevocationV2",
  }),
]);
const EXPECTED_COMPOSITION_BUNDLE_COLUMNS = Object.freeze([
  "compositionContract",
  "compositionProfile",
  "bindingCanonicalJson",
  "bindingDigest",
  "bundleContract",
  "bundleProfile",
  "bundleCanonicalJson",
  "bundleDigest",
]);
const EXPECTED_SERVER_EVIDENCE_COLUMNS = Object.freeze([
  "signatureVerifiedAt",
  "acceptedAt",
  "acceptedTransactionId",
  "receipt",
  "receiptDigest",
  "importedAt",
  "importedTransactionId",
  "importReceipt",
  "importReceiptDigest",
]);
const EXPECTED_FINAL_COMMAND_COLUMN_COUNT =
  EXPECTED_COMMAND_V2_COLUMNS.length +
  EXPECTED_COMPOSITION_BUNDLE_COLUMNS.length +
  EXPECTED_SERVER_EVIDENCE_COLUMNS.length;
const EXPECTED_MANIFEST_EVIDENCE_COLUMNS = Object.freeze([
  "payloadDigest",
  "manifestId",
  "manifestRevision",
  "contractVersion",
  "profile",
  "trustDomain",
  "purpose",
  "payloadCanonicalJson",
  "manifestEvidence",
  "signatureAlgorithm",
  "signingKeyId",
  "publicKeyFingerprint",
  "signatureBase64url",
  "issuedAt",
  "validUntil",
  "databaseName",
  "databaseOid",
  "databaseIdentityDigest",
  "deploymentMarkerId",
  "deploymentMarkerDigest",
  "actualContextDigest",
  "coordinatorRoleName",
  "coordinatorRoleOid",
  "workerRoleName",
  "workerRoleOid",
  "exactGrantsProfile",
  "exactGrantsDigest",
  "exactGrantsProjection",
  "predecessorManifestDigest",
  "applicationContract",
  "applicationReleaseSha",
  "applicationArtifactSha256",
  "importedCommandId",
  "importedAt",
  "importedTransactionId",
  "importReceiptDigest",
]);
const EXPECTED_REVOCATION_COLUMNS = Object.freeze([
  "manifestPayloadDigest",
  "reasonDigest",
  "evidenceDigest",
  "revokedAt",
  "revokedTransactionId",
]);
const EXPECTED_APPEND_ONLY_TRIGGERS = Object.freeze([
  Object.freeze({
    dml: "IdentityMailEnrollmentCommand_immutable_dml_trigger",
    table: "IdentityMailDeliveryTenantEnrollmentCommand",
    truncate: "IdentityMailEnrollmentCommand_immutable_truncate_trigger",
  }),
  Object.freeze({
    dml: "IdentityMailManifestV2_immutable_dml_trigger",
    table: "IdentityMailDutyRoleManifestEvidenceV2",
    truncate: "IdentityMailManifestV2_immutable_truncate_trigger",
  }),
  Object.freeze({
    dml: "IdentityMailManifestRevocationV2_immutable_dml_trigger",
    table: "IdentityMailDutyRoleManifestRevocationV2",
    truncate: "IdentityMailManifestRevocationV2_immutable_truncate_trigger",
  }),
]);
const EXPECTED_TRIGGER_SURFACE = Object.freeze([
  Object.freeze({
    name: "IdentityMailEnrollmentCommand_immutable_dml_trigger",
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 26,
  }),
  Object.freeze({
    name: "IdentityMailEnrollmentCommand_immutable_truncate_trigger",
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 34,
  }),
  Object.freeze({
    name: "IdentityMailEnrollmentCommand_import_insert_guard_trigger",
    relation: "IdentityMailDeliveryTenantEnrollmentCommand",
    routine: "identity_mail_evidence_import_insert_guard_v2",
    type: 7,
  }),
  Object.freeze({
    name: "IdentityMailManifestV2_immutable_dml_trigger",
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 26,
  }),
  Object.freeze({
    name: "IdentityMailManifestV2_immutable_truncate_trigger",
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 34,
  }),
  Object.freeze({
    name: "IdentityMailManifestV2_import_insert_guard_trigger",
    relation: "IdentityMailDutyRoleManifestEvidenceV2",
    routine: "identity_mail_evidence_import_insert_guard_v2",
    type: 7,
  }),
  Object.freeze({
    name: "IdentityMailManifestRevocationV2_immutable_dml_trigger",
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 26,
  }),
  Object.freeze({
    name: "IdentityMailManifestRevocationV2_immutable_truncate_trigger",
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    routine: "identity_mail_evidence_immutable_guard_v2",
    type: 34,
  }),
  Object.freeze({
    name: "IdentityMailManifestRevocationV2_insert_lock_trigger",
    relation: "IdentityMailDutyRoleManifestRevocationV2",
    routine: "identity_mail_manifest_revocation_lock_v2",
    type: 7,
  }),
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const IMPORTER_NAME = "identity_mail_tenant_enrollment_import_evidence_v2";
const EXPECTED_OWNER_ONLY_TABLES = Object.freeze([
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDutyRoleManifestEvidenceV2",
  "IdentityMailDutyRoleManifestRevocationV2",
]);
const EXPECTED_OWNER_ONLY_ROUTINES = Object.freeze([
  Object.freeze({
    argumentsSql: "",
    name: "identity_mail_evidence_immutable_guard_v2",
  }),
  Object.freeze({
    argumentsSql: "",
    name: "identity_mail_evidence_import_insert_guard_v2",
  }),
  Object.freeze({ argumentsSql: "TEXT, TEXT", name: IMPORTER_NAME }),
  Object.freeze({
    argumentsSql: "",
    name: "identity_mail_manifest_revocation_lock_v2",
  }),
]);
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANONICAL_DIRECTORY = join(DATABASE_DIRECTORY, "prisma", "migrations");
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const API_SOURCE_DIRECTORY = join(dirname(dirname(DATABASE_DIRECTORY)), "apps", "api", "src");
const CURRENT185_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE,
);

const HELP = `
Identity-mail enrollment evidence-ledger CURRENT185 static gate

Usage:
  node scripts/identity-mail-enrollment-evidence-ledger-current185-foundation.mjs --check
  node scripts/identity-mail-enrollment-evidence-ledger-current185-foundation.mjs --self-test
  node scripts/identity-mail-enrollment-evidence-ledger-current185-foundation.mjs --help

The command is read-only. A compliant result does not authorize migration,
runtime grants, driver wiring, SMTP, email delivery, or production mutation.
`.trim();

export class IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError extends Error {
  constructor(findings) {
    super("Identity-mail enrollment evidence-ledger CURRENT185 foundation is blocked.");
    this.name = "IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError";
    this.code = "IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_BLOCKED";
    this.findings = Object.freeze([...new Set(findings)].sort());
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function manifestDigest(entries) {
  const manifest = [...entries]
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map(({ name, checksum }) => `${name} ${checksum}`)
    .join("\n");
  return sha256(`${manifest}\n`);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function maskDollarQuotedBodies(sql) {
  const opener = /\$([a-z_][a-z0-9_]*)?\$/gimu;
  let cursor = 0;
  let masked = "";
  while (true) {
    opener.lastIndex = cursor;
    const match = opener.exec(sql);
    if (match === null) break;
    const token = match[0];
    const closeAt = sql.indexOf(token, opener.lastIndex);
    if (closeAt < 0) break;
    masked += sql.slice(cursor, match.index) + token + token;
    cursor = closeAt + token.length;
  }
  return masked + sql.slice(cursor);
}

function functionBody(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = sql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\."${escaped}"\\([\\s\\S]*?\\nAS \\$([a-z_][a-z0-9_]*)?\\$\\n([\\s\\S]*?)\\n\\$\\1\\$;`,
      "iu",
    ),
  );
  return match?.[2] ?? null;
}

function functionDeclaration(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = sql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\."${escaped}"\\(([\\s\\S]*?)\\)\\nRETURNS[\\s\\S]*?\\nAS \\$`,
      "iu",
    ),
  );
  return match?.[0] ?? null;
}

function tableBlock(sql, pattern) {
  const start = sql.search(pattern);
  if (start < 0) return null;
  const end = sql.indexOf("\n);", start);
  return end < 0 ? null : sql.slice(start, end + 3);
}

function declaredTableColumns(block) {
  if (block === null) return [];
  return [...block.matchAll(/^\s{2}"([A-Za-z0-9]+)"\s+[A-Z]/gmu)].map(
    (match) => match[1],
  );
}

function ordered(source, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const foundAt = source.indexOf(needle, cursor + 1);
    if (foundAt < 0) return false;
    cursor = foundAt;
  }
  return true;
}

function exactTextArrayAfter(source, anchor) {
  const anchorAt = source.indexOf(anchor);
  if (anchorAt < 0) return null;
  const arrayAt = source.indexOf("ARRAY[", anchorAt);
  const arrayEnd = source.indexOf("]::TEXT[]", arrayAt);
  if (arrayAt < 0 || arrayEnd < 0) return null;
  return [
    ...source.slice(arrayAt, arrayEnd).matchAll(/'([A-Za-z0-9_]+)'/gu),
  ].map((match) => match[1]);
}

function valuesBlockAfter(source, anchor) {
  const anchorAt = source.indexOf(anchor);
  if (anchorAt < 0) return null;
  const valuesAt = source.indexOf("    VALUES\n", anchorAt);
  const endAt = source.indexOf("\n  )\n", valuesAt);
  if (valuesAt < 0 || endAt < 0) return null;
  return source.slice(valuesAt + "    VALUES\n".length, endAt);
}

function retainedRpcManifest(source) {
  const block = valuesBlockAfter(
    source,
    'WITH expected(\n    "signature",\n    "body_sha256",\n    "argument_count",\n    "argument_names"',
  );
  if (block === null) return null;
  return [...block.matchAll(
    /\(\s*'([^']+)'\s*,\s*'([0-9a-f]{64})'\s*,\s*(\d+)\s*,\s*ARRAY\[([\s\S]*?)\]::TEXT\[\]\s*\)/gmu,
  )].map((match) => ({
    argumentNames: [...match[4].matchAll(/'([^']+)'/gu)].map(
      (argumentMatch) => argumentMatch[1],
    ),
    bodySha256: match[2],
    signature: match[1],
    statedArgumentCount: Number(match[3]),
  }));
}

function expectedRetainedRpcManifest() {
  return EXPECTED_RETAINED_RPC_SURFACE.map(
    ({ argumentNames, bodySha256, signature }) => ({
      argumentNames: [...argumentNames],
      bodySha256,
      signature,
      statedArgumentCount: argumentNames.length,
    }),
  );
}

function finalColumnManifest(source) {
  const block = valuesBlockAfter(
    source,
    "WITH expected(\n    relation_name,\n    column_count,\n    column_manifest_digest",
  );
  if (block === null) return null;
  return [...block.matchAll(
    /\(\s*'([^']+)'(?:::TEXT)?\s*,\s*(\d+)\s*,\s*'([0-9a-f]{64})'(?:::TEXT)?\s*\)/gmu,
  )].map((match) => ({
    count: Number(match[2]),
    digest: match[3],
    relation: match[1],
  }));
}

function compositeForeignKeyManifest(source) {
  const block = valuesBlockAfter(
    source,
    "WITH expected(\n    constraint_name,\n    source_relation,\n    referenced_relation,\n    source_columns,\n    referenced_columns,\n    is_deferrable,\n    is_deferred",
  );
  if (block === null) return null;
  return [...block.matchAll(
    /\(\s*'([^']+)'(?:::TEXT)?\s*,\s*'([^']+)'(?:::TEXT)?\s*,\s*'([^']+)'(?:::TEXT)?\s*,\s*ARRAY\[([\s\S]*?)\]::SMALLINT\[\]\s*,\s*ARRAY\[([\s\S]*?)\]::SMALLINT\[\]\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/gmu,
  )].map((match) => ({
    confkey: [...match[5].matchAll(/\d+/gu)].map((entry) => Number(entry[0])),
    conkey: [...match[4].matchAll(/\d+/gu)].map((entry) => Number(entry[0])),
    deferred: match[7] === "true",
    deferrable: match[6] === "true",
    name: match[1],
    referencedRelation: match[3],
    sourceRelation: match[2],
  }));
}

function predecessorColumnManifest(sql) {
  const block = valuesBlockAfter(
    sql,
    'WITH expected(\n    "ordinal", "column_name", "formatted_type", "not_null", "has_default"',
  );
  if (block === null) return null;
  return [...block.matchAll(
    /^\s*\((\d+), '([^']+)', '([^']+)', (true|false), (true|false)\),?\s*$/gmu,
  )].map((match) =>
    `${match[1]}|${match[2]}|${match[3]}|${match[4]}|${match[5]}`,
  );
}

function predecessorCatalogManifest(sql) {
  const block = valuesBlockAfter(
    sql,
    'WITH expected("object_name", "object_kind", "is_unique") AS (',
  );
  if (block === null) return null;
  return [...block.matchAll(
    /^\s*\('([^']+)', '(constraint|index)', (true|false)\),?\s*$/gmu,
  )].map((match) => `${match[1]}|${match[2]}|${match[3]}`);
}

function dollarBlock(sql, tag) {
  const startToken = `DO $${tag}$`;
  const endToken = `$${tag}$;`;
  const startAt = sql.indexOf(startToken);
  const endAt = sql.indexOf(endToken, startAt + startToken.length);
  if (startAt < 0 || endAt < 0) return null;
  return sql.slice(startAt, endAt + endToken.length);
}

function routineHasTriggerMetadata(declaration) {
  return (
    declaration !== null &&
    /^CREATE FUNCTION/iu.test(declaration) &&
    /\(\)\nRETURNS TRIGGER/iu.test(declaration) &&
    /LANGUAGE\s+plpgsql/iu.test(declaration) &&
    /SECURITY\s+INVOKER/iu.test(declaration) &&
    /\bVOLATILE\b/iu.test(declaration) &&
    /PARALLEL\s+UNSAFE/iu.test(declaration) &&
    /SET\s+search_path\s*=\s*pg_catalog/iu.test(declaration)
  );
}

function hasExactTrigger(sql, { name, relation, routine }, eventSql, level = "ROW") {
  return new RegExp(
    `CREATE TRIGGER "${name}"\\s+${eventSql}\\s+ON public\\."${relation}"\\s+FOR EACH ${level}\\s+EXECUTE FUNCTION public\\."${routine}"\\(\\);`,
    "u",
  ).test(sql);
}

async function migrationEntries(directory) {
  const directories = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    directories.map(async (name) => ({
      name,
      checksum: sha256(Buffer.from(normalizeSql(await readFile(join(directory, name, "migration.sql"), "utf8")), "utf8")),
    })),
  );
}

async function candidateDirectories() {
  return (await readdir(CANDIDATES_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function candidateMigrationEntries(names) {
  return Promise.all(
    names.map(async (name) => ({
      name,
      checksum: sha256(Buffer.from(normalizeSql(await readFile(join(CANDIDATES_DIRECTORY, name, "migration.sql"), "utf8")), "utf8")),
    })),
  );
}

async function sourceText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await sourceText(path));
    else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry.name)) parts.push(await readFile(path, "utf8"));
  }
  return parts.join("\n");
}

// Static inspectors are intentionally split so mutation tests can demonstrate
// that each authority, ordering and immutability invariant fails closed.
function inspectTransactionAndFence(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const doTags = [...sql.matchAll(/^\s*DO\s+\$([a-z_][a-z0-9_]*)\$/gimu)].map((match) => match[1]);
  const postconditionStart = sql.indexOf("DO $postcondition$");
  const postconditionEnd = sql.indexOf("$postcondition$;", postconditionStart);
  if (
    (sql.match(/^BEGIN;$/gmu) ?? []).length !== 1 ||
    (sql.match(/^COMMIT;$/gmu) ?? []).length !== 1 ||
    !sql.startsWith("BEGIN;\n") ||
    !sql.endsWith("COMMIT;\n") ||
    !sql.includes("SET LOCAL lock_timeout = '5s';") ||
    !sql.includes("SET LOCAL statement_timeout = '180s';") ||
    JSON.stringify(doTags) !== JSON.stringify(["prerequisite", "postcondition"]) ||
    postconditionStart < 0 ||
    postconditionEnd < 0 ||
    sql.slice(postconditionEnd + "$postcondition$;".length) !== "\n\nCOMMIT;\n"
  ) findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  if (
    !sql.includes("leetplus.identity_mail_enrollment_evidence_ledger_current185_confirmation") ||
    !sql.includes("rehearse-noncanonical-identity-mail-enrollment-evidence-ledger-current185") ||
    !sql.includes("leetplus.identity_mail_enrollment_evidence_ledger_current185_sha256") ||
    !sql.includes("^lp_imtec_[0-9a-f]{32}_ci$") ||
    !sql.includes("one exact unfinished Prisma rehearsal receipt") ||
    !sql.includes('FROM public."_prisma_migrations" AS migration') ||
    !sql.includes(
      `migration."migration_name" =\n      '${IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE}'`,
    ) ||
    !sql.includes('migration."finished_at" IS NULL') ||
    !sql.includes('migration."rolled_back_at" IS NULL') ||
    !sql.includes("candidate_receipt_count IS DISTINCT FROM 1") ||
    !sql.includes(
      "candidate_receipt_checksum IS DISTINCT FROM\n       rehearsal_candidate_sha256",
    ) ||
    !sql.includes("candidate_receipt_applied_steps IS DISTINCT FROM 0")
  ) findings.push(F.EXECUTION_FENCE_MISSING);
}

function inspectPredecessorCatalog(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const prerequisite = dollarBlock(sql, "prerequisite");
  const columnManifest = predecessorColumnManifest(sql);
  const catalogManifest = predecessorCatalogManifest(sql);
  const expectedConstraintCount = EXPECTED_PREDECESSOR_CATALOG_MANIFEST.filter(
    (entry) => entry.includes("|constraint|"),
  ).length;
  const expectedIndexCount = EXPECTED_PREDECESSOR_CATALOG_MANIFEST.filter(
    (entry) => entry.includes("|index|"),
  ).length;
  if (
    prerequisite === null ||
    JSON.stringify(columnManifest) !==
      JSON.stringify(EXPECTED_PREDECESSOR_COLUMN_MANIFEST) ||
    JSON.stringify(catalogManifest) !==
      JSON.stringify(EXPECTED_PREDECESSOR_CATALOG_MANIFEST) ||
    EXPECTED_PREDECESSOR_COLUMN_MANIFEST.length !== 57 ||
    expectedConstraintCount !== 21 ||
    expectedIndexCount !== 9 ||
    !prerequisite.includes("command_column_count IS DISTINCT FROM 57") ||
    !prerequisite.includes("invalid_command_column_count <> 0") ||
    !prerequisite.includes(
      `command_constraint_count IS DISTINCT FROM ${expectedConstraintCount}`,
    ) ||
    !prerequisite.includes(
      `command_index_count IS DISTINCT FROM ${expectedIndexCount}`,
    ) ||
    !prerequisite.includes("invalid_command_catalog_count <> 0") ||
    !prerequisite.includes(EXPECTED_PREDECESSOR_COLUMN_MANIFEST_DIGEST) ||
    !prerequisite.includes(EXPECTED_PREDECESSOR_CONSTRAINT_MANIFEST_DIGEST) ||
    !prerequisite.includes(EXPECTED_PREDECESSOR_INDEX_MANIFEST_DIGEST) ||
    !prerequisite.includes(
      'ORDER BY target_constraint.conname COLLATE "C"',
    ) ||
    !prerequisite.includes('ORDER BY index_relation.relname COLLATE "C"') ||
    !prerequisite.includes(EXPECTED_PREDECESSOR_COMMAND_GUARD_PROSRC_SHA256) ||
    !prerequisite.includes(
      "('IdentityMailEnrollmentCommand_dml_guard_trigger', 30)",
    ) ||
    !prerequisite.includes(
      "('IdentityMailEnrollmentCommand_truncate_guard_trigger', 34)",
    ) ||
    !prerequisite.includes(
      "target_trigger.tgisinternal = false",
    ) ||
    !prerequisite.includes(
      "target_trigger.tgenabled IS DISTINCT FROM 'O'::\"char\"",
    ) ||
    !prerequisite.includes(
      'FROM public."IdentityMailDeliveryTenantEnrollmentCommand"',
    )
  ) findings.push(F.PREDECESSOR_CATALOG_DRIFT);
}

function inspectOwnerOnlyRoutinesAndGuards(sql, importerBody, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const createdRoutineNames = [...sql.matchAll(
    /^CREATE(?: OR REPLACE)? FUNCTION public\."([^"]+)"\(/gmu,
  )].map((match) => match[1]);
  const expectedRoutineNames = EXPECTED_OWNER_ONLY_ROUTINES.map(
    ({ name }) => name,
  );
  if (
    JSON.stringify(createdRoutineNames) !== JSON.stringify(expectedRoutineNames) ||
    EXPECTED_OWNER_ONLY_ROUTINES.some(
      ({ name }) => functionDeclaration(sql, name) === null,
    )
  ) findings.push(F.ACL_SURFACE_DRIFT);

  const insertGuardName = "identity_mail_evidence_import_insert_guard_v2";
  const insertGuardDeclaration = functionDeclaration(sql, insertGuardName);
  const insertGuardBody = functionBody(sql, insertGuardName);
  const insertGuardTriggers = EXPECTED_TRIGGER_SURFACE.filter(
    ({ routine }) => routine === insertGuardName,
  );
  const importContextSetting =
    "leetplus.identity_mail_evidence_import_receipt_v2";
  if (
    !routineHasTriggerMetadata(insertGuardDeclaration) ||
    insertGuardBody === null ||
    !insertGuardBody.includes(
      `pg_catalog.current_setting(\n    '${importContextSetting}',\n    true\n  )`,
    ) ||
    !insertGuardBody.includes(
      `(active_receipt_digest COLLATE "C") !~ '^[0-9a-f]{64}$'`,
    ) ||
    !insertGuardBody.includes(
      'NEW."importReceiptDigest" IS DISTINCT FROM active_receipt_digest',
    ) ||
    !insertGuardBody.includes(
      "Identity mail V2 evidence INSERT requires importer context",
    ) ||
    insertGuardTriggers.length !== 2 ||
    insertGuardTriggers.some(
      (trigger) => !hasExactTrigger(sql, trigger, "BEFORE INSERT"),
    ) ||
    importerBody === null ||
    (importerBody.match(new RegExp(importContextSetting, "gu")) ?? []).length !== 2 ||
    !ordered(importerBody, [
      `PERFORM pg_catalog.set_config(\n    '${importContextSetting}',\n    import_receipt_digest,\n    true\n  );`,
      'INSERT INTO public."IdentityMailDutyRoleManifestEvidenceV2"',
      'INSERT INTO public."IdentityMailDeliveryTenantEnrollmentCommand"',
      `PERFORM pg_catalog.set_config(\n    '${importContextSetting}',\n    '',\n    true\n  );`,
      "RETURN import_receipt;",
    ])
  ) findings.push(F.IMPORT_INSERT_GUARD_DRIFT);

  const revocationRoutineName = "identity_mail_manifest_revocation_lock_v2";
  const revocationDeclaration = functionDeclaration(sql, revocationRoutineName);
  const revocationBody = functionBody(sql, revocationRoutineName);
  const [revocationTrigger] = EXPECTED_TRIGGER_SURFACE.filter(
    ({ routine }) => routine === revocationRoutineName,
  );
  if (
    !routineHasTriggerMetadata(revocationDeclaration) ||
    revocationBody === null ||
    revocationTrigger === undefined ||
    !hasExactTrigger(sql, revocationTrigger, "BEFORE INSERT") ||
    !ordered(revocationBody, [
      'FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest',
      'tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);',
      "PERFORM pg_catalog.pg_advisory_xact_lock(",
      "IF NOT EXISTS (",
      'NEW."revokedAt" := pg_catalog.clock_timestamp();',
      'NEW."revokedTransactionId" :=',
      "RETURN NEW;",
    ]) ||
    !revocationBody.includes(
      "IDENTITY_MAIL_MANIFEST_REVOCATION_MANIFEST_UNKNOWN",
    ) ||
    !revocationBody.includes("IDENTITY_MAIL_MANIFEST_REVOCATION_CONFLICT")
  ) findings.push(F.REVOCATION_LOCK_DRIFT);
}

function inspectRetainedRpcContinuity(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const prerequisite = dollarBlock(sql, "prerequisite");
  const postcondition = dollarBlock(sql, "postcondition");
  const expectedManifest = expectedRetainedRpcManifest();
  const requiredFragments = [
    "INTO retained_rpc_drift_count",
    'pg_catalog.to_regprocedure(expected."signature")',
    "routine.prokind IS DISTINCT FROM 'f'::\"char\"",
    "routine.prosecdef IS DISTINCT FROM true",
    "routine.proleakproof IS DISTINCT FROM false",
    "routine.proisstrict IS DISTINCT FROM false",
    "routine.proretset IS DISTINCT FROM false",
    "routine.provolatile IS DISTINCT FROM 'v'::\"char\"",
    "routine.proparallel IS DISTINCT FROM 'u'::\"char\"",
    'routine.pronargs IS DISTINCT FROM expected."argument_count"',
    "routine.pronargdefaults IS DISTINCT FROM 0",
    "routine.proargdefaults IS NOT NULL",
    "routine.provariadic IS DISTINCT FROM 0::OID",
    "routine.prorettype IS DISTINCT FROM 'jsonb'::pg_catalog.regtype",
    "ARRAY['search_path=pg_catalog']::TEXT[]",
    'routine.proargnames IS DISTINCT FROM expected."argument_names"',
    "routine.proargmodes IS NOT NULL",
    "routine.proallargtypes IS NOT NULL",
    "language.lanname IS DISTINCT FROM 'plpgsql'",
    "pg_catalog.sha256(",
    "pg_catalog.convert_to(routine.prosrc, 'UTF8')",
    'expected."body_sha256"',
    "pg_catalog.aclexplode(",
    "pg_catalog.acldefault('f', routine.proowner)",
    "privilege.grantor IS DISTINCT FROM routine.proowner",
    "privilege.grantee IS DISTINCT FROM routine.proowner",
    "privilege.privilege_type IS DISTINCT FROM 'EXECUTE'",
    "privilege.is_grantable IS DISTINCT FROM false",
    "retained_rpc_drift_count IS DISTINCT FROM 0",
  ];
  const exactAclFragments = [
    "privilege.grantor IS DISTINCT FROM routine.proowner",
    "privilege.grantee IS DISTINCT FROM routine.proowner",
    "privilege.privilege_type IS DISTINCT FROM 'EXECUTE'",
    "privilege.is_grantable IS DISTINCT FROM false",
  ];
  if (
    prerequisite === null ||
    postcondition === null ||
    JSON.stringify(retainedRpcManifest(prerequisite)) !==
      JSON.stringify(expectedManifest) ||
    JSON.stringify(retainedRpcManifest(postcondition)) !==
      JSON.stringify(expectedManifest) ||
    !prerequisite.includes(
      "routine.proowner IS DISTINCT FROM command_owner_oid",
    ) ||
    !postcondition.includes(
      "routine.proowner IS DISTINCT FROM owner_role.oid",
    ) ||
    [prerequisite, postcondition].some(
      (block) => requiredFragments.some((fragment) => !block.includes(fragment)),
    ) ||
    [prerequisite, postcondition].some(
      (block) =>
        exactAclFragments.some(
          (fragment) => (block.match(new RegExp(fragment, "gu")) ?? []).length !== 2,
        ),
    ) ||
    EXPECTED_RETAINED_RPC_SURFACE.some(
      ({ bodySha256 }) =>
        (sql.match(new RegExp(bodySha256, "gu")) ?? []).length !== 2,
    )
  ) findings.push(F.RETAINED_RPC_CONTINUITY_DRIFT);
}

function catalogCountBlock(block, target) {
  const intoAt = block.indexOf(`INTO ${target}`);
  if (intoAt < 0) return null;
  const start = block.lastIndexOf("  SELECT pg_catalog.count(*)::INTEGER", intoAt);
  const end = block.indexOf(";", intoAt);
  return start < 0 || end < 0 ? null : block.slice(start, end + 1);
}

function inspectRetainedTenantLockContinuity(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const prerequisite = dollarBlock(sql, "prerequisite");
  const postcondition = dollarBlock(sql, "postcondition");
  const blocks = [prerequisite, postcondition];
  const metadataBlocks = blocks.map((block) =>
    block === null
      ? null
      : catalogCountBlock(block, "retained_tenant_lock_metadata_count")
  );
  const sharedBlockFragments = [
    "INTO retained_tenant_lock_named_routine_count",
    "routine.pronamespace = pg_catalog.to_regnamespace('public')",
    "routine.proname = 'identity_mail_tenant_lock_v1'",
    "retained_tenant_lock_named_routine_count IS DISTINCT FROM 1",
    "INTO retained_tenant_lock_metadata_count",
    "retained_tenant_lock_metadata_count IS DISTINCT FROM 1",
  ];
  const metadataFragments = [
    "pg_catalog.to_regprocedure(\n      'public.\"identity_mail_tenant_lock_v1\"(text)'\n    )",
    "routine.prokind = 'f'::\"char\"",
    "routine.prosecdef = false",
    "routine.proleakproof = false",
    "routine.proisstrict = false",
    "routine.proretset = false",
    "routine.provolatile = 'v'::\"char\"",
    "routine.proparallel = 'u'::\"char\"",
    "routine.pronargs = 1",
    "routine.pronargdefaults = 0",
    "routine.proargdefaults IS NULL",
    "routine.provariadic = 0::OID",
    "routine.prorettype = 'text'::pg_catalog.regtype",
    "routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]",
    "routine.proargnames = ARRAY['p_tenant_id']::TEXT[]",
    "routine.proargmodes IS NULL",
    "routine.proallargtypes IS NULL",
    "language.lanname = 'plpgsql'",
    EXPECTED_PREDECESSOR_TENANT_LOCK_PROSRC_SHA256,
    "pg_catalog.aclexplode(",
    "pg_catalog.acldefault('f', routine.proowner)",
    ") = 1",
    "privilege.grantor IS DISTINCT FROM routine.proowner",
    "privilege.grantee IS DISTINCT FROM routine.proowner",
    "privilege.privilege_type IS DISTINCT FROM 'EXECUTE'",
    "privilege.is_grantable IS DISTINCT FROM false",
  ];
  if (
    blocks.some(
      (block) =>
        block === null ||
        sharedBlockFragments.some((fragment) => !block.includes(fragment)),
    ) ||
    metadataBlocks.some(
      (block) =>
        block === null ||
        metadataFragments.some((fragment) => !block.includes(fragment)),
    ) ||
    !metadataBlocks[0]?.includes("routine.proowner = command_owner_oid") ||
    !metadataBlocks[1]?.includes("routine.proowner = owner_role.oid") ||
    (sql.match(new RegExp(EXPECTED_PREDECESSOR_TENANT_LOCK_PROSRC_SHA256, "gu")) ?? [])
      .length !== 2
  ) findings.push(F.TENANT_LOCK_CONTINUITY_DRIFT);
}

function inspectFinalColumnManifests(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const postcondition = dollarBlock(sql, "postcondition");
  const expectedManifest = EXPECTED_FINAL_COLUMN_MANIFESTS.map(
    ({ count, digest, relation }) => ({ count, digest, relation }),
  );
  const requiredFragments = [
    "INTO column_mismatch_count",
    "CROSS JOIN LATERAL (",
    "pg_catalog.string_agg(",
    "attribute.attnum::TEXT || E'\\n'",
    "attribute.attname || E'\\n'",
    "pg_catalog.format_type(",
    "attribute.atttypid",
    "attribute.atttypmod",
    "attribute.attnotnull::TEXT || E'\\n'",
    "pg_catalog.pg_get_expr(",
    "default_value.adbin",
    "default_value.adrelid",
    "'<NULL>'",
    "E'\\n' ORDER BY attribute.attnum",
    "LEFT JOIN pg_catalog.pg_attrdef AS default_value",
    "default_value.adrelid = attribute.attrelid",
    "default_value.adnum = attribute.attnum",
    "pg_catalog.quote_ident(expected.relation_name)",
    "actual.column_count IS DISTINCT FROM expected.column_count",
    "actual.column_manifest_digest IS DISTINCT FROM",
    "expected.column_manifest_digest",
    "column_mismatch_count IS DISTINCT FROM 0",
  ];
  if (
    postcondition === null ||
    JSON.stringify(finalColumnManifest(postcondition)) !==
      JSON.stringify(expectedManifest) ||
    requiredFragments.some((fragment) => !postcondition.includes(fragment)) ||
    EXPECTED_FINAL_COLUMN_MANIFESTS.some(
      ({ digest }) =>
        (postcondition.match(new RegExp(digest, "gu")) ?? []).length !== 1,
    )
  ) findings.push(F.FINAL_COLUMN_MANIFEST_DRIFT);
}

function inspectCompositeForeignKeyPostcondition(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const postcondition = dollarBlock(sql, "postcondition");
  const foreignKeyCountBlock = postcondition === null
    ? null
    : catalogCountBlock(postcondition, "foreign_key_count");
  const expectedManifest = EXPECTED_FOREIGN_KEY_POSTCONDITION.map(
    ({
      confkey,
      conkey,
      deferred,
      deferrable,
      name,
      referencedRelation,
      sourceRelation,
    }) => ({
      confkey: [...confkey],
      conkey: [...conkey],
      deferred,
      deferrable,
      name,
      referencedRelation,
      sourceRelation,
    }),
  );
  const requiredFragments = [
    "INTO foreign_key_drift",
    "pg_catalog.quote_ident(expected.source_relation)",
    "pg_catalog.quote_ident(expected.referenced_relation)",
    "constraint_entry.contype IS DISTINCT FROM 'f'::\"char\"",
    "constraint_entry.conkey IS DISTINCT FROM expected.source_columns",
    "constraint_entry.confkey IS DISTINCT FROM expected.referenced_columns",
    "constraint_entry.confmatchtype IS DISTINCT FROM 's'::\"char\"",
    "constraint_entry.confupdtype IS DISTINCT FROM 'r'::\"char\"",
    "constraint_entry.confdeltype IS DISTINCT FROM 'r'::\"char\"",
    "constraint_entry.condeferrable IS DISTINCT FROM expected.is_deferrable",
    "constraint_entry.condeferred IS DISTINCT FROM expected.is_deferred",
    "constraint_entry.convalidated IS DISTINCT FROM true",
    "foreign_key_count IS DISTINCT FROM 8",
    "foreign_key_drift IS DISTINCT FROM 0",
  ];
  const countFragments = [
    "INTO foreign_key_count",
    "WHERE constraint_entry.contype = 'f'::\"char\"",
    'public."IdentityMailDeliveryTenantEnrollmentCommand"',
    'public."IdentityMailDutyRoleManifestEvidenceV2"',
    'public."IdentityMailDutyRoleManifestRevocationV2"',
  ];
  if (
    postcondition === null ||
    foreignKeyCountBlock === null ||
    JSON.stringify(compositeForeignKeyManifest(postcondition)) !==
      JSON.stringify(expectedManifest) ||
    requiredFragments.some((fragment) => !postcondition.includes(fragment)) ||
    countFragments.some((fragment) => !foreignKeyCountBlock.includes(fragment))
  ) findings.push(F.COMPOSITE_BINDING_DRIFT);
}

function inspectImporterCatalogBoundary(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const prerequisite = dollarBlock(sql, "prerequisite");
  const postcondition = dollarBlock(sql, "postcondition");
  const importerSignature =
    "public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)";
  const importerNamePredicate =
    "routine.proname =\n      'identity_mail_tenant_enrollment_import_evidence_v2'";
  const importerMetadataBlock = postcondition === null
    ? null
    : catalogCountBlock(postcondition, "importer_metadata_count");
  const postconditionFragments = [
    "INTO importer_named_routine_count",
    importerNamePredicate,
    "importer_named_routine_count IS DISTINCT FROM 1",
    "INTO importer_metadata_count",
    `pg_catalog.to_regprocedure(\n      '${importerSignature}'`,
    "routine.pronargs = 2",
    "routine.pronargdefaults = 0",
    "routine.proargdefaults IS NULL",
    "routine.provariadic = 0::OID",
    "routine.proargmodes IS NULL",
    "routine.proallargtypes IS NULL",
    "importer_metadata_count IS DISTINCT FROM 1",
  ];
  if (
    prerequisite === null ||
    postcondition === null ||
    !prerequisite.includes("INTO unexpected_importer_routine_count") ||
    !prerequisite.includes(importerNamePredicate) ||
    !prerequisite.includes(
      "unexpected_importer_routine_count IS DISTINCT FROM 0",
    ) ||
    postconditionFragments.slice(0, 3).some(
      (fragment) => !postcondition.includes(fragment),
    ) ||
    importerMetadataBlock === null ||
    postconditionFragments.slice(3, -1).some(
      (fragment) => !importerMetadataBlock.includes(fragment),
    ) ||
    !postcondition.includes(postconditionFragments.at(-1))
  ) findings.push(F.IMPORTER_CATALOG_DRIFT);
}

function inspectPostcondition(sql, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const postcondition = dollarBlock(sql, "postcondition");
  const expectedRoutineSignatures = EXPECTED_OWNER_ONLY_ROUTINES.map(
    ({ argumentsSql, name }) =>
      `public.${name}(${argumentsSql.toLowerCase().replaceAll(" ", "")})`,
  );
  const routineSetAt = postcondition?.indexOf("WHERE routine.oid IN (") ?? -1;
  const routineSetEnd = routineSetAt < 0
    ? -1
    : postcondition.indexOf("\n  );", routineSetAt);
  const routineSet = routineSetAt < 0 || routineSetEnd < 0
    ? ""
    : postcondition.slice(routineSetAt, routineSetEnd);
  const postconditionRoutineSignatures = [...new Set([...routineSet.matchAll(
      /pg_catalog\.to_regprocedure\(\s*'([^']+)'\s*\)/gmu,
    )].map((match) => match[1]))].sort();
  const triggerNames = postcondition === null
    ? null
    : exactTextArrayAfter(
      postcondition,
      "trigger_names IS DISTINCT FROM ARRAY[",
    );
  const expectedTriggerNames = EXPECTED_TRIGGER_SURFACE.map(
    ({ name }) => name,
  ).sort();
  const triggerMetadataBlock = postcondition === null
    ? null
    : valuesBlockAfter(
      postcondition,
      "WITH expected(\n    relation_name,\n    trigger_name,\n    trigger_type,\n    routine_signature",
    );
  const triggerMetadataManifest = triggerMetadataBlock === null
    ? null
    : [...triggerMetadataBlock.matchAll(
      /\(\s*'([^']+)'(?:::TEXT)?,\s*'([^']+)'(?:::TEXT)?,\s*(\d+),\s*'public\.([^']+\(\))'(?:::TEXT)?\s*\)/gmu,
    )].map(
      (match) => `${match[1]}|${match[2]}|${match[3]}|${match[4]}`,
    );
  const expectedTriggerMetadataManifest = EXPECTED_TRIGGER_SURFACE.map(
    ({ name, relation, routine, type }) =>
      `${relation}|${name}|${type}|${routine}()`,
  );
  const exactRelationAclSet = new RegExp(
    `relation\\.relname IN \\(\\s*${EXPECTED_OWNER_ONLY_TABLES.map(
      (table) => `'${table}'`,
    ).join(",\\s*")}\\s*\\)`,
    "u",
  );
  if (
    postcondition === null ||
    JSON.stringify(postconditionRoutineSignatures) !==
      JSON.stringify([...expectedRoutineSignatures].sort()) ||
    JSON.stringify(triggerNames) !== JSON.stringify(expectedTriggerNames) ||
    JSON.stringify(triggerMetadataManifest) !==
      JSON.stringify(expectedTriggerMetadataManifest) ||
    !exactRelationAclSet.test(postcondition) ||
    !postcondition.includes("relation_count IS DISTINCT FROM 3") ||
    !postcondition.includes("relation_owner_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("relation_acl_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("column_acl_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("relation_row_count IS DISTINCT FROM 0") ||
    !postcondition.includes("column_mismatch_count IS DISTINCT FROM 0") ||
    !postcondition.includes("constraint_count IS DISTINCT FROM 45") ||
    !postcondition.includes("invalid_constraint_count IS DISTINCT FROM 0") ||
    !postcondition.includes("foreign_key_count IS DISTINCT FROM 8") ||
    !postcondition.includes("foreign_key_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("routine_count IS DISTINCT FROM 4") ||
    !postcondition.includes("routine_owner_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("routine_acl_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("routine_metadata_drift IS DISTINCT FROM 0") ||
    !postcondition.includes("importer_metadata_count IS DISTINCT FROM 1") ||
    !postcondition.includes("trigger_metadata_drift IS DISTINCT FROM 0") ||
    !postcondition.includes(
      "privilege.grantee <> relation.relowner",
    ) ||
    !postcondition.includes(
      "relation.relowner IS DISTINCT FROM owner_role.oid",
    ) ||
    !postcondition.includes("pg_catalog.acldefault('r', relation.relowner)") ||
    !postcondition.includes("attribute.attacl IS NOT NULL") ||
    !postcondition.includes("privilege.grantee <> routine.proowner") ||
    !postcondition.includes("privilege.privilege_type = 'EXECUTE'") ||
    !postcondition.includes("pg_catalog.acldefault('f', routine.proowner)") ||
    !postcondition.includes("routine.provolatile IS DISTINCT FROM 'v'::\"char\"") ||
    !postcondition.includes("routine.proparallel IS DISTINCT FROM 'u'::\"char\"") ||
    !postcondition.includes(
      "ARRAY['search_path=pg_catalog']::TEXT[]",
    ) ||
    !postcondition.includes("NOT routine.prosecdef") ||
    !postcondition.includes("routine.prorettype IS DISTINCT FROM") ||
    !postcondition.includes("'jsonb'::pg_catalog.regtype") ||
    !postcondition.includes("'trigger'::pg_catalog.regtype") ||
    !postcondition.includes("trigger_entry.tgenabled IS DISTINCT FROM 'O'::\"char\"") ||
    !postcondition.includes(
      "trigger_entry.tgfoid IS DISTINCT FROM pg_catalog.to_regprocedure(",
    ) ||
    EXPECTED_TRIGGER_SURFACE.some(
      ({ name, relation, routine, type }) =>
        !new RegExp(
          `'${relation}'(?:::TEXT)?,\\s+'${name}'(?:::TEXT)?,\\s+${type},\\s+'public\\.${routine}\\(\\)'(?:::TEXT)?`,
          "u",
        ).test(postcondition),
    )
  ) findings.push(F.POSTCONDITION_DRIFT);
}

function inspectStaticContract(sql, runtimeSourceText, findings) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const manifest = tableBlock(sql, /CREATE TABLE public\."[^"]*ManifestEvidenceV2"/u);
  const revocation = tableBlock(sql, /CREATE TABLE public\."[^"]*ManifestRevocationV2"/u);
  if (
    manifest === null ||
    revocation === null ||
    JSON.stringify(declaredTableColumns(manifest)) !==
      JSON.stringify(EXPECTED_MANIFEST_EVIDENCE_COLUMNS) ||
    JSON.stringify(declaredTableColumns(revocation)) !==
      JSON.stringify(EXPECTED_REVOCATION_COLUMNS) ||
    sql.includes('"publicKeyPem"') ||
    /CREATE\s+TABLE\s+public\."[^"]*(?:TrustRoot|SigningRoot)[^"]*"/iu.test(sql)
  ) findings.push(F.MANIFEST_LEDGER_DRIFT);
  const addedDutyColumns = [
    ...sql.matchAll(/\bADD\s+COLUMN\s+"(duty[A-Za-z0-9]+)"/gimu),
  ].map((match) => match[1]);
  if (
    !sql.includes(
      'ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"',
    ) ||
    EXPECTED_COMMAND_V2_COLUMNS.length !== 69 ||
    EXPECTED_FINAL_COMMAND_COLUMN_COUNT !== 86 ||
    !sql.includes("command_column_count IS DISTINCT FROM 57") ||
    EXPECTED_COMPOSITION_BUNDLE_COLUMNS.some(
      (column) => !sql.includes(`ADD COLUMN "${column}"`),
    ) ||
    JSON.stringify(addedDutyColumns) !==
      JSON.stringify(EXPECTED_DUTY_BINDING_COLUMNS)
  ) findings.push(F.COMMAND_V2_SURFACE_DRIFT);
  if (
    /RENAME\s+COLUMN\s+"(?:acceptedAt|acceptedTransactionId|receipt|receiptDigest)"/iu.test(
      sql,
    ) ||
    !["importedAt", "importedTransactionId", "importReceipt", "importReceiptDigest"]
      .every((column) => sql.includes(`ADD COLUMN "${column}"`)) ||
    !sql.includes('"acceptedAt" = "importedAt"') ||
    !sql.includes(
      '"acceptedTransactionId" = "importedTransactionId"',
    ) ||
    !sql.includes('"receipt" = "importReceipt"') ||
    !sql.includes('"receiptDigest" = "importReceiptDigest"') ||
    !sql.includes("'identity_mail_tenant_enrollment_command_accepted_idx'")
  ) findings.push(F.RECEIPT_SURFACE_DRIFT);
  const importerBody = functionBody(sql, IMPORTER_NAME);
  const importerDeclaration = functionDeclaration(sql, IMPORTER_NAME);
  if (
    importerBody === null || importerDeclaration === null ||
    !/^\s*p_[a-z0-9_]+\s+TEXT\s*,\s*p_[a-z0-9_]+\s+TEXT\s*$/imu.test(
      importerDeclaration.slice(importerDeclaration.indexOf("(") + 1, importerDeclaration.indexOf(")\nRETURNS")),
    ) ||
    !/\)\nRETURNS JSONB/iu.test(importerDeclaration) ||
    !/LANGUAGE\s+plpgsql/iu.test(importerDeclaration) ||
    !/SECURITY\s+DEFINER/iu.test(importerDeclaration) ||
    !/\bVOLATILE\b/iu.test(importerDeclaration) ||
    !/PARALLEL\s+UNSAFE/iu.test(importerDeclaration) ||
    !/SET\s+search_path\s*=\s*pg_catalog/iu.test(importerDeclaration)
  ) findings.push(F.IMPORTER_SURFACE_DRIFT);
  if (importerBody !== null) {
    const lockAt = importerBody.indexOf('public."identity_mail_tenant_lock_v1"(');
    const firstReadAt = importerBody.search(/\bFROM\s+public\./iu);
    if (lockAt < 0 || firstReadAt < 0 || lockAt >= firstReadAt) findings.push(F.TENANT_LOCK_ORDER_DRIFT);
    if (!importerBody.includes("LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORT_BUNDLE_V2_V1")) findings.push(F.BUNDLE_DIGEST_DRIFT);
    if (!ordered(importerBody, ["IMPORT_REPLAY", "expiresAt", "IMPORTED"])) findings.push(F.REPLAY_ORDER_DRIFT);
    if (/^\s*EXECUTE\b/gimu.test(importerBody)) findings.push(F.FORBIDDEN_AUTHORITY_OR_DML);
  } else {
    findings.push(F.TENANT_LOCK_ORDER_DRIFT);
    findings.push(F.BUNDLE_DIGEST_DRIFT);
    findings.push(F.REPLAY_ORDER_DRIFT);
  }
  if (
    importerBody === null ||
    EXPECTED_COMMAND_V2_COLUMNS.some(
      (column) => !importerBody.includes(`"${column}"`),
    ) ||
    JSON.stringify(
      exactTextArrayAfter(
        importerBody,
        "FROM pg_catalog.jsonb_object_keys(command_arguments)",
      ),
    ) !== JSON.stringify([...EXPECTED_COMMAND_V2_COLUMNS].sort())
  ) findings.push(F.COMMAND_V2_SURFACE_DRIFT);
  const commandManifestForeignKeys = [
    ...sql.matchAll(
      /ADD\s+CONSTRAINT\s+"(identity_mail_command_manifest_v2_(?:evidence|context)_fkey)"\s+FOREIGN\s+KEY\s*\(([\s\S]*?)\)\s*REFERENCES\s+public\."IdentityMailDutyRoleManifestEvidenceV2"\s*\(([\s\S]*?)\)/gimu,
    ),
  ];
  const commandManifestForeignKeyManifest = commandManifestForeignKeys.map(
    (match) => ({
      localColumns: [...match[2].matchAll(/"([A-Za-z0-9]+)"/gu)].map(
        (columnMatch) => columnMatch[1],
      ),
      name: match[1],
      referencedColumns: [...match[3].matchAll(/"([A-Za-z0-9]+)"/gu)].map(
        (columnMatch) => columnMatch[1],
      ),
    }),
  );
  const expectedCommandManifestForeignKeyManifest =
    EXPECTED_MANIFEST_FK_SPECS.map(
      ({ localColumns, name, referencedColumns }) => ({
        localColumns: [...localColumns],
        name,
        referencedColumns: [...referencedColumns],
      }),
    );
  if (
    JSON.stringify(commandManifestForeignKeyManifest) !==
      JSON.stringify(expectedCommandManifestForeignKeyManifest) ||
    JSON.stringify(commandManifestForeignKeys.map((match) => match[1]).sort()) !==
      JSON.stringify([...EXPECTED_MANIFEST_FK_SHARDS].sort())
  ) findings.push(F.COMPOSITE_BINDING_DRIFT);
  const immutableGuardDeclaration = functionDeclaration(
    sql,
    "identity_mail_evidence_immutable_guard_v2",
  );
  const immutableGuardBody = functionBody(
    sql,
    "identity_mail_evidence_immutable_guard_v2",
  );
  if (
    !sql.includes(
      'DROP TRIGGER "IdentityMailEnrollmentCommand_dml_guard_trigger"',
    ) ||
    !sql.includes(
      'DROP TRIGGER "IdentityMailEnrollmentCommand_truncate_guard_trigger"',
    ) ||
    immutableGuardBody === null ||
    !routineHasTriggerMetadata(immutableGuardDeclaration) ||
    !/append-only/iu.test(immutableGuardBody) ||
    EXPECTED_APPEND_ONLY_TRIGGERS.some(
      ({ dml, table, truncate }) =>
        !new RegExp(
          `CREATE TRIGGER "${dml}"\\s+BEFORE UPDATE OR DELETE\\s+ON public\\."${table}"[\\s\\S]*?identity_mail_evidence_immutable_guard_v2`,
          "u",
        ).test(sql) ||
        !new RegExp(
          `CREATE TRIGGER "${truncate}"\\s+BEFORE TRUNCATE\\s+ON public\\."${table}"[\\s\\S]*?identity_mail_evidence_immutable_guard_v2`,
          "u",
        ).test(sql),
    )
  ) findings.push(F.APPEND_ONLY_DRIFT);
  if (
    !["importReceipt", "importReceiptDigest", "importedAt", "importedTransactionId"]
      .every((field) => sql.includes(`"${field}"`)) ||
    !["importReceiptDigest", "importedAtEpochMs", "importedTransactionId"]
      .every((field) => sql.includes(`'${field}'`))
  ) findings.push(F.RECEIPT_SURFACE_DRIFT);
  inspectOwnerOnlyRoutinesAndGuards(sql, importerBody, findings);
  if (
    EXPECTED_OWNER_ONLY_TABLES.some(
      (table) =>
        !new RegExp(
          `REVOKE ALL PRIVILEGES\\s+ON TABLE public\\."${table}"\\s+FROM PUBLIC;`,
          "u",
        ).test(sql),
    ) ||
    EXPECTED_OWNER_ONLY_ROUTINES.some(
      ({ argumentsSql, name }) =>
        !new RegExp(
          `REVOKE ALL PRIVILEGES\\s+ON FUNCTION public\\."${name}"\\(\\s*${argumentsSql.replace(
            ", ",
            "\\s*,\\s*",
          )}\\s*\\)\\s+FROM PUBLIC;`,
          "iu",
        ).test(sql),
    ) ||
    !sql.includes("privilege.grantee <> routine.proowner") ||
    !sql.includes("privilege.grantee <> relation.relowner")
  ) findings.push(F.ACL_SURFACE_DRIFT);
  const topLevelSql = maskDollarQuotedBodies(sql);
  if (
    /^\s*(?:CREATE|ALTER)\s+(?:ROLE|USER)\b/gimu.test(topLevelSql) ||
    /^\s*GRANT\b/gimu.test(topLevelSql) ||
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/gimu.test(topLevelSql) ||
    /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\."[^"]*(?:drive_command|smtp|send_mail)[^"]*"/iu.test(
      sql,
    ) ||
    /\b(?:dblink|postgres_fdw|http_post|nodemailer)\b/iu.test(sql) ||
    /\bCOPY\b[\s\S]*?\bPROGRAM\b/iu.test(topLevelSql)
  ) findings.push(F.FORBIDDEN_AUTHORITY_OR_DML);
  inspectRetainedRpcContinuity(sql, findings);
  inspectRetainedTenantLockContinuity(sql, findings);
  inspectFinalColumnManifests(sql, findings);
  inspectCompositeForeignKeyPostcondition(sql, findings);
  inspectImporterCatalogBoundary(sql, findings);
  inspectPostcondition(sql, findings);
  if (runtimeSourceText.includes(IMPORTER_NAME)) findings.push(F.RUNTIME_EXPOSURE_DRIFT);
}

export async function inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation(
  overrides = {},
) {
  const F = IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS;
  const findings = [];
  const canonical = overrides.canonicalEntries ?? await migrationEntries(CANONICAL_DIRECTORY);
  const predecessorEntries = (
    overrides.predecessorEntries ?? [
      ...canonical,
      ...(await candidateMigrationEntries(EXPECTED_CANDIDATE_DIRECTORIES.slice(0, -1))),
    ]
  ).sort((left, right) => left.name.localeCompare(right.name, "en"));
  const directories = overrides.candidateDirectories ?? await candidateDirectories();
  let sql = "";
  let metadataText = "";
  try {
    sql = normalizeSql(overrides.sql ?? await readFile(join(CURRENT185_DIRECTORY, "migration.sql"), "utf8"));
    metadataText = overrides.metadataText ?? await readFile(join(CURRENT185_DIRECTORY, "candidate.json"), "utf8");
  } catch {
    findings.push(F.ARTIFACT_INVALID);
  }
  const runtimeSourceText = overrides.runtimeSourceText ?? await sourceText(API_SOURCE_DIRECTORY);

  if (
    canonical.length !== EXPECTED_CANONICAL_COUNT ||
    canonical.at(-1)?.name !== EXPECTED_CANONICAL_HEAD ||
    manifestDigest(canonical) !== EXPECTED_CANONICAL_MANIFEST_DIGEST
  ) findings.push(F.ARTIFACT_INVALID);
  if (JSON.stringify(directories) !== JSON.stringify(EXPECTED_CANDIDATE_DIRECTORIES)) findings.push(F.CANDIDATE_CHAIN_DRIFT);
  if (
    predecessorEntries.length !== 184 ||
    predecessorEntries.at(-1)?.name !== IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_PREDECESSOR ||
    predecessorEntries.at(-1)?.checksum !== EXPECTED_PREDECESSOR_SHA256 ||
    manifestDigest(predecessorEntries) !== EXPECTED_PREDECESSOR_MANIFEST_DIGEST
  ) findings.push(F.PREDECESSOR_DRIFT);

  let metadata = null;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    findings.push(F.METADATA_DRIFT);
  }
  if (
    !exactKeys(metadata, [
      "schemaVersion", "contract", "candidate", "ordinal", "predecessor",
      "migrationSqlSha256", "authorization", "canMutate", "canSend", "status",
    ]) ||
    metadata?.schemaVersion !== 1 ||
    metadata?.contract !== "IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_V2_CANDIDATE_V1" ||
    metadata?.candidate !== IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE ||
    metadata?.ordinal !== IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_ORDINAL ||
    metadata?.authorization !== false || metadata?.canMutate !== false ||
    metadata?.canSend !== false || metadata?.status !== "NOT_DEPLOYABLE" ||
    !SHA256_PATTERN.test(String(metadata?.migrationSqlSha256 ?? ""))
  ) findings.push(F.METADATA_DRIFT);
  if (
    !exactKeys(metadata?.predecessor, ["count", "head", "manifestDigest", "headChecksum"]) ||
    metadata?.predecessor?.count !== 184 ||
    metadata?.predecessor?.head !== IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_PREDECESSOR ||
    metadata?.predecessor?.manifestDigest !== EXPECTED_PREDECESSOR_MANIFEST_DIGEST ||
    metadata?.predecessor?.headChecksum !== EXPECTED_PREDECESSOR_SHA256
  ) findings.push(F.PREDECESSOR_DRIFT);

  const actualSqlSha256 = sha256(sql);
  if (
    metadata?.migrationSqlSha256 !== actualSqlSha256 ||
    actualSqlSha256 !== EXPECTED_CURRENT185_SHA256
  ) findings.push(F.SQL_SHA_DRIFT);
  if (
    !sql.includes("completed_migration_count IS DISTINCT FROM 184") ||
    !sql.includes(IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_PREDECESSOR) ||
    !sql.includes(EXPECTED_PREDECESSOR_MANIFEST_DIGEST) ||
    !sql.includes(EXPECTED_PREDECESSOR_SHA256)
  ) findings.push(F.PREDECESSOR_DRIFT);

  inspectTransactionAndFence(sql, findings);
  inspectPredecessorCatalog(sql, findings);
  inspectStaticContract(sql, runtimeSourceText, findings);
  if (findings.length > 0) {
    return Object.freeze({
      authorization: false,
      canMutate: false,
      canSend: false,
      candidate: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE,
      contract: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FOUNDATION_CONTRACT,
      decision: "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_BLOCKED",
      findings: Object.freeze([...new Set(findings)].sort()),
    });
  }
  return Object.freeze({
    authorization: false,
    canMutate: false,
    canSend: false,
    candidate: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE,
    contract: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FOUNDATION_CONTRACT,
    decision: "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_COMPLIANT",
    findings: Object.freeze([]),
    migrationSqlSha256: actualSqlSha256,
    ordinal: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_ORDINAL,
    runtime: "NOT_WIRED_OWNER_ONLY",
  });
}

export async function checkIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation(
  overrides = {},
) {
  const report = await inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation(overrides);
  if (report.decision !== "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_COMPLIANT") {
    throw new IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError(report.findings);
  }
  return report;
}

export async function runIdentityMailEnrollmentEvidenceLedgerCurrent185SelfTest() {
  const sql = await readFile(join(CURRENT185_DIRECTORY, "migration.sql"), "utf8");
  const metadataText = await readFile(join(CURRENT185_DIRECTORY, "candidate.json"), "utf8");
  const probes = [
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replaceAll('"dutyApplicationArtifactSha256"', '"dutyApplicationArtifactDigest"') },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.ACL_SURFACE_DRIFT, sql: sql.replace("FROM PUBLIC;", "TO PUBLIC;") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.REPLAY_ORDER_DRIFT, sql: sql.replace("IMPORT_REPLAY", "REPLAY_IMPORT") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.PREDECESSOR_CATALOG_DRIFT, sql: sql.replace("(57, 'receiptDigest', 'character(64)', true, false)", "(57, 'receiptDigest', 'character(63)', true, false)") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.RECEIPT_SURFACE_DRIFT, sql: sql.replace('"acceptedAt" = "importedAt"', '"importedAt" = "acceptedAt"') },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.IMPORT_INSERT_GUARD_DRIFT, sql: sql.replace("Identity mail V2 evidence INSERT requires importer context", "Identity mail V2 evidence INSERT context missing") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.POSTCONDITION_DRIFT, sql: sql.replace("column_acl_drift IS DISTINCT FROM 0", "column_acl_drift IS DISTINCT FROM 1") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.REVOCATION_LOCK_DRIFT, sql: sql.replace('NEW."revokedAt" := pg_catalog.clock_timestamp();', 'NEW."revokedAt" = pg_catalog.clock_timestamp();') },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.ACL_SURFACE_DRIFT, sql: sql.replace('CREATE FUNCTION public."identity_mail_evidence_import_insert_guard_v2"()', 'CREATE FUNCTION public."identity_mail_evidence_import_insert_guard_v2_drift"()') },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.FINAL_COLUMN_MANIFEST_DRIFT, sql: sql.replace("5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa2", "5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa3") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("62, 60, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70", "60, 62, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("ARRAY[42, 43, 41, 44]::SMALLINT[]", "ARRAY[42, 41, 43, 44]::SMALLINT[]") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("constraint_entry.confmatchtype IS DISTINCT FROM 's'::\"char\"", "constraint_entry.confmatchtype IS DISTINCT FROM 'f'::\"char\"") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("constraint_entry.contype IS DISTINCT FROM 'f'::\"char\"", "constraint_entry.contype IS DISTINCT FROM 'c'::\"char\"") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("WHERE constraint_entry.contype = 'f'::\"char\"\n    AND constraint_entry.conrelid IN", "WHERE constraint_entry.contype = 'c'::\"char\"\n    AND constraint_entry.conrelid IN") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("constraint_entry.condeferrable IS DISTINCT FROM expected.is_deferrable", "constraint_entry.condeferrable IS DISTINCT FROM false") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.COMPOSITE_BINDING_DRIFT, sql: sql.replace("foreign_key_count IS DISTINCT FROM 8", "foreign_key_count IS DISTINCT FROM 7") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.RETAINED_RPC_CONTINUITY_DRIFT, sql: sql.replace("56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c", "56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500d") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.RETAINED_RPC_CONTINUITY_DRIFT, sql: sql.replace("routine.proargdefaults IS NOT NULL", "routine.proargdefaults IS NULL") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.TENANT_LOCK_CONTINUITY_DRIFT, sql: sql.replace("retained_tenant_lock_named_routine_count IS DISTINCT FROM 1", "retained_tenant_lock_named_routine_count IS DISTINCT FROM 2") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.TENANT_LOCK_CONTINUITY_DRIFT, sql: sql.replace(EXPECTED_PREDECESSOR_TENANT_LOCK_PROSRC_SHA256, "c53780aa0df846a4085b01b4c62cbb857f69e0f145a8c72a43ef1af35fafc791") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.IMPORTER_CATALOG_DRIFT, sql: sql.replace("importer_named_routine_count IS DISTINCT FROM 1", "importer_named_routine_count IS DISTINCT FROM 2") },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.METADATA_DRIFT, metadataText: JSON.stringify({ ...JSON.parse(metadataText), authorization: true }) },
    { expected: IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS.CANDIDATE_CHAIN_DRIFT, candidateDirectories: EXPECTED_CANDIDATE_DIRECTORIES.slice(0, -1) },
  ];
  for (const probe of probes) {
    if (Object.hasOwn(probe, "sql")) assert.notEqual(probe.sql, sql);
    const report = await inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation(probe);
    assert.equal(report.decision, "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_BLOCKED");
    assert.ok(report.findings.includes(probe.expected));
  }
  return Object.freeze({ decision: "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_SELF_TEST_PASSED", negativeProbes: probes.length });
}

async function main() {
  const [argument] = process.argv.slice(2);
  if (argument === "--help") { process.stdout.write(`${HELP}\n`); return; }
  if (argument === "--self-test") { process.stdout.write(`${JSON.stringify(await runIdentityMailEnrollmentEvidenceLedgerCurrent185SelfTest())}\n`); return; }
  if (argument === "--check") { process.stdout.write(`${JSON.stringify(await checkIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation())}\n`); return; }
  throw new Error(HELP);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError) {
      process.stderr.write(`${JSON.stringify({ code: error.code, findings: error.findings })}\n`);
    } else process.stderr.write(`${String(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  });
}
