// Generated from a clean PostgreSQL 16 CURRENT_172 catalog.
//
// Source migration:
//   20260730020000_shared_beta_admission_provenance
//   SHA-256 58f0ee03e49f64fe7a21562fc5c64f8741a270cafba2232ce99b732e9ea99bb0
//
// Snapshot digest:
//   RFC8785_STYLE_CANONICAL_JSON_SHA256_V1
//
// Do not edit catalog rows or definition hashes by hand. Re-materialize them
// from pg_catalog after applying the exact migration to template0 with:
//   node scripts/shared-beta-admission-provenance-catalog-materialize.mjs --write

function freezeTuples(values) {
  return Object.freeze(
    values.map((value) => Object.freeze([...value])),
  );
}

function freezeRecords(values) {
  return Object.freeze(
    values.map((value) =>
      Object.freeze({
        ...value,
        ...(Array.isArray(value.searchPath)
          ? { searchPath: Object.freeze([...value.searchPath]) }
          : {}),
      }),
    ),
  );
}

export const SHARED_BETA_ADMISSION_GATE_CODES = Object.freeze(
  [
  "MODULE_POLICY_ENFORCED",
  "EMAIL_INVITE_WORKFLOW_VERIFIED",
  "POSTGRESQL_RELEASE_REHEARSAL_VERIFIED"
],
);

export const SHARED_BETA_ADMISSION_RELATIONS = Object.freeze(
  [
  "ReleaseGateAttestation",
  "TenantAdmissionDecision",
  "TenantAdmissionDecisionGate"
],
);

export const SHARED_BETA_ADMISSION_COLUMNS = freezeTuples(
  [
  [
    "ReleaseGateAttestation",
    "id",
    1,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "gateCode",
    2,
    "\"SharedBetaReleaseGateCode\"",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "contractVersion",
    3,
    "character varying(40)",
    true,
    "'RELEASE_GATE_ATTESTATION_V1'::character varying",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "releaseSha",
    4,
    "character(40)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "environment",
    5,
    "character varying(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "artifactDigest",
    6,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "schemaHead",
    7,
    "character varying(128)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "migrationCount",
    8,
    "integer",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "policyManifestDigest",
    9,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "payload",
    10,
    "jsonb",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "payloadDigest",
    11,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "signatureAlgorithm",
    12,
    "character varying(16)",
    true,
    "'Ed25519'::character varying",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "signingKeyId",
    13,
    "character varying(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "provenanceKeyVersion",
    14,
    "character varying(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "publicKeyFingerprint",
    15,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "signature",
    16,
    "bytea",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "passedAt",
    17,
    "timestamp(3) with time zone",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "validUntil",
    18,
    "timestamp(3) with time zone",
    true,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "stateRevision",
    19,
    "integer",
    true,
    "1",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "revokedAt",
    20,
    "timestamp(3) with time zone",
    false,
    "",
    ""
  ],
  [
    "ReleaseGateAttestation",
    "revocationReasonDigest",
    21,
    "character(64)",
    false,
    "",
    "pg_catalog.default"
  ],
  [
    "ReleaseGateAttestation",
    "createdAt",
    22,
    "timestamp(3) with time zone",
    true,
    "CURRENT_TIMESTAMP",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "id",
    1,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "tenantId",
    2,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "decision",
    3,
    "character varying(8)",
    true,
    "'GO'::character varying",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "requestId",
    4,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "requestDigest",
    5,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "workflowLocator",
    6,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "reservationSubjectId",
    7,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "expectedClaimRevision",
    8,
    "integer",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "shellEvidenceDigest",
    9,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "releaseSha",
    10,
    "character(40)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "environment",
    11,
    "character varying(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "artifactDigest",
    12,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "schemaHead",
    13,
    "character varying(128)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "migrationCount",
    14,
    "integer",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "policyManifestDigest",
    15,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "databaseIdentityDigest",
    16,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "expectedEntitlementProfileRevision",
    17,
    "integer",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "expectedExecutionRevision",
    18,
    "integer",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "profileDigest",
    19,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "gateSetVersion",
    20,
    "character varying(32)",
    true,
    "'SHARED_BETA_GATE_SET_V1'::character varying",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "gateSetDigest",
    21,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "approvedByUserId",
    22,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "approvalReferenceDigest",
    23,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "payload",
    24,
    "jsonb",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "payloadDigest",
    25,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "signatureAlgorithm",
    26,
    "character varying(16)",
    true,
    "'Ed25519'::character varying",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "signingKeyId",
    27,
    "character varying(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "publicKeyFingerprint",
    28,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "signature",
    29,
    "bytea",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "approvedAt",
    30,
    "timestamp(3) with time zone",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "validUntil",
    31,
    "timestamp(3) with time zone",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "stateRevision",
    32,
    "integer",
    true,
    "1",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "revokedAt",
    33,
    "timestamp(3) with time zone",
    false,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "revocationReasonDigest",
    34,
    "character(64)",
    false,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecision",
    "consumedAt",
    35,
    "timestamp(3) with time zone",
    false,
    "",
    ""
  ],
  [
    "TenantAdmissionDecision",
    "createdAt",
    36,
    "timestamp(3) with time zone",
    true,
    "CURRENT_TIMESTAMP",
    ""
  ],
  [
    "TenantAdmissionDecisionGate",
    "decisionId",
    1,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecisionGate",
    "gateCode",
    2,
    "\"SharedBetaReleaseGateCode\"",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecisionGate",
    "attestationId",
    3,
    "text",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecisionGate",
    "boundAttestationRevision",
    4,
    "integer",
    true,
    "",
    ""
  ],
  [
    "TenantAdmissionDecisionGate",
    "boundPayloadDigest",
    5,
    "character(64)",
    true,
    "",
    "pg_catalog.default"
  ],
  [
    "TenantAdmissionDecisionGate",
    "createdAt",
    6,
    "timestamp(3) with time zone",
    true,
    "CURRENT_TIMESTAMP",
    ""
  ]
],
);

export const SHARED_BETA_ADMISSION_CONSTRAINTS = freezeTuples(
  [
  [
    "ReleaseGateAttestation_id_check",
    "ReleaseGateAttestation",
    "c",
    "2e2abebdc6aae2ba2d2d911df1816ba0f059a01ad86ceb3ee66ddc53f71c146a"
  ],
  [
    "ReleaseGateAttestation_payload_check",
    "ReleaseGateAttestation",
    "c",
    "a3228c1ccf6a75a5347a9beb849caf5d5f45fec06ca6c9d50646aebe63f7fe24"
  ],
  [
    "ReleaseGateAttestation_pkey",
    "ReleaseGateAttestation",
    "p",
    "8c8464f42472e42ee190fc91ca8db79b5351d3a4609040516578d229c56f6fa5"
  ],
  [
    "ReleaseGateAttestation_provenance_check",
    "ReleaseGateAttestation",
    "c",
    "55152ff0d513b81806b9875c71b47ab2dd40b334c0b87fb8d02040f3b38ec7cc"
  ],
  [
    "ReleaseGateAttestation_release_check",
    "ReleaseGateAttestation",
    "c",
    "7c3338add1adba922fc314e619a35277f7d2481954446a23f4b05ad91ca9cb78"
  ],
  [
    "ReleaseGateAttestation_state_check",
    "ReleaseGateAttestation",
    "c",
    "8cbf228dbc76fbb9e589e16b44e821b9bc8b35560bb9721dae45b67e953f5d95"
  ],
  [
    "ReleaseGateAttestation_timeline_check",
    "ReleaseGateAttestation",
    "c",
    "d2ffcb8ca51aaf21730c3e6706759d7adbefd1f660590f992c8d7463d700a858"
  ],
  [
    "TenantAdmissionDecision_approvedByUserId_fkey",
    "TenantAdmissionDecision",
    "f",
    "0d2e6b1bd2c5da0c1303815676b478b0f3d586cf3b14356d11af9c9b5c874677"
  ],
  [
    "TenantAdmissionDecision_approver_check",
    "TenantAdmissionDecision",
    "c",
    "76fe560ac40f42e2a513cae26382af011335a4dd7d5ec0b834b0fcb626bf0745"
  ],
  [
    "TenantAdmissionDecision_digest_check",
    "TenantAdmissionDecision",
    "c",
    "342fee3a5b26f342953670a832381cc4fc12809540237cddbcec4515b82050ac"
  ],
  [
    "TenantAdmissionDecision_id_check",
    "TenantAdmissionDecision",
    "c",
    "2e2abebdc6aae2ba2d2d911df1816ba0f059a01ad86ceb3ee66ddc53f71c146a"
  ],
  [
    "TenantAdmissionDecision_kind_check",
    "TenantAdmissionDecision",
    "c",
    "ad241da7aabe04d91c4c81fdbf1e0770bf9e78c33e2395cfb4b6776664fecc55"
  ],
  [
    "TenantAdmissionDecision_payload_check",
    "TenantAdmissionDecision",
    "c",
    "5c0c2e57eba36b9a7f4c063fbbde194758ed996ff12a9173192e92df53e6b7d6"
  ],
  [
    "TenantAdmissionDecision_pkey",
    "TenantAdmissionDecision",
    "p",
    "8c8464f42472e42ee190fc91ca8db79b5351d3a4609040516578d229c56f6fa5"
  ],
  [
    "TenantAdmissionDecision_provenance_check",
    "TenantAdmissionDecision",
    "c",
    "c29f433f3aafa8480ae4afb65cbbe535da680bc6b71d0a655b348d3680fb45de"
  ],
  [
    "TenantAdmissionDecision_release_check",
    "TenantAdmissionDecision",
    "c",
    "e235194f0740541a9f7850e238ee143b570aa371072eee3248cf9170fb812d17"
  ],
  [
    "TenantAdmissionDecision_request_identity_check",
    "TenantAdmissionDecision",
    "c",
    "117e9dba81db6a0a0fb787d95b7f3950ac8f2491e0ac2fb3440440b0f4e67b27"
  ],
  [
    "TenantAdmissionDecision_revision_check",
    "TenantAdmissionDecision",
    "c",
    "eb3ae1e59c7b182136ae83840de12437d5ffd4943eefb2852e1a19c65cf5e4d6"
  ],
  [
    "TenantAdmissionDecision_state_check",
    "TenantAdmissionDecision",
    "c",
    "6fde71bdd9b8cd24aaeadfef58e83ca59d8433ce8a4d34a9a96deac0a946b8c5"
  ],
  [
    "TenantAdmissionDecision_tenantId_fkey",
    "TenantAdmissionDecision",
    "f",
    "10c53f59767da1037868e70c34767641c6f2ea5cff4ad85c4249247201afdeba"
  ],
  [
    "TenantAdmissionDecision_tenant_check",
    "TenantAdmissionDecision",
    "c",
    "9493cd7988ac4bfe706f271e819e524b55c9f2c76953cb74fb75b15d8e3fe6f4"
  ],
  [
    "TenantAdmissionDecision_timeline_check",
    "TenantAdmissionDecision",
    "c",
    "217a72aa0f54fea75244a8a030e7885de9c6bd0d41823d4d19f29108c39c38e9"
  ],
  [
    "TenantAdmissionDecisionGate_attestation_id_check",
    "TenantAdmissionDecisionGate",
    "c",
    "d4d7329cde6e69450fc16dbbdd0964946084460c937f6f8342bccff6633e966e"
  ],
  [
    "TenantAdmissionDecisionGate_binding_check",
    "TenantAdmissionDecisionGate",
    "c",
    "d257f28b463f922a26f0ffa1032b59d636347109e36e6c98d5684edf53aed74b"
  ],
  [
    "TenantAdmissionDecisionGate_decisionId_fkey",
    "TenantAdmissionDecisionGate",
    "f",
    "a2622714670727523e2e15f7d878624e504468a69c11621733e3a647187bda77"
  ],
  [
    "TenantAdmissionDecisionGate_decision_id_check",
    "TenantAdmissionDecisionGate",
    "c",
    "5d6212b64c082e1c9a56f922606734f0a94dbd0b1d2ed73defff08e28e351e62"
  ],
  [
    "TenantAdmissionDecisionGate_pkey",
    "TenantAdmissionDecisionGate",
    "p",
    "1e9379e82cf0b37a37f5123fd76f2241b38143336c1a8d911684b7d890039ae3"
  ],
  [
    "tenant_admission_decision_gate_attestation_fkey",
    "TenantAdmissionDecisionGate",
    "f",
    "26d8d0a9ecb0b5cd1c1dcc3490b80f4cb1b44b952a61e3a1c9bf28a5bd78fc57"
  ]
],
);

export const SHARED_BETA_ADMISSION_INDEXES = freezeTuples(
  [
  [
    "ReleaseGateAttestation",
    "ReleaseGateAttestation_pkey",
    true,
    true,
    "b52ecc8002ab7dbecf2126fceda3a17740550fad40a92a8363895294f18e5c83"
  ],
  [
    "ReleaseGateAttestation",
    "release_gate_attestation_id_code_key",
    true,
    false,
    "663ec38a7acd5c3cc025f89c835872318ba08f43223fa654f4c2ea52868ac938"
  ],
  [
    "ReleaseGateAttestation",
    "release_gate_attestation_payload_digest_key",
    true,
    false,
    "c8dd8eeeb3a360a1cebf5c9684dbb3afe4779fb33654e65b69acd4ab05ee38c4"
  ],
  [
    "ReleaseGateAttestation",
    "release_gate_attestation_release_env_code_valid_idx",
    false,
    false,
    "da4bd1906a370756d1b6da8ffd82879f4e0fe1e66e9149df9f10dc832bffe88d"
  ],
  [
    "TenantAdmissionDecision",
    "TenantAdmissionDecision_pkey",
    true,
    true,
    "7aa047e79fdb30952181a9cfbf563e371c8fe4dfe329f517dda9855130ebf0b5"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_approver_idx",
    false,
    false,
    "0d297dee22fd10748da3f11cc04d15be099a1545fa2219252d5bda1e8a29e2c7"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_id_tenant_key",
    true,
    false,
    "efaed77a9599db6bd8b103210c99cc64905b2d8c5c0993ceafedfe2a8179a0b1"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_one_unrevoked_uidx",
    true,
    false,
    "89bf29bef818f8e909c79afe6d57d0573641361866560fc5b5ef7c6e97acfa7d"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_payload_digest_key",
    true,
    false,
    "9a672e30163d7b9e871dc9e712f9e97e2522e6e233adb72a5dc6af0370cf8610"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_request_key",
    true,
    false,
    "0fe29ce03b08cf63371a04ca7c90c7a1159e1b2b649b07e2864d80dd3d58ff77"
  ],
  [
    "TenantAdmissionDecision",
    "tenant_admission_decision_tenant_valid_idx",
    false,
    false,
    "0f341f5395ff01e8edd8051eb90ede66a2609d524314c48389bd35785f991e72"
  ],
  [
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate_pkey",
    true,
    true,
    "04f800aee25166c497a58dba96b0ebb2d8d090145d5719a60202016d902ed757"
  ],
  [
    "TenantAdmissionDecisionGate",
    "tenant_admission_decision_gate_attestation_idx",
    false,
    false,
    "323c02a1b57cc884f7f8ad2b3afb00c8fa9b68f143cefbd5144c4c286900c3ed"
  ],
  [
    "TenantAdmissionDecisionGate",
    "tenant_admission_decision_gate_attestation_key",
    true,
    false,
    "d7d2be1e755ed5c4f6990ab225be9f8f9e7eba83ee0f53b9b92b935b95ee92a7"
  ]
],
);

export const SHARED_BETA_ADMISSION_FUNCTIONS = freezeRecords(
  [
  {
    "name": "shared_beta_release_gate_attestation_guard_v1",
    "result": "trigger",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "",
    "grantSignature": "public.\"shared_beta_release_gate_attestation_guard_v1\"()",
    "securityDefiner": false,
    "catalogSignature": "public.\"shared_beta_release_gate_attestation_guard_v1\"()",
    "definitionDigest": "916d3b95408de749db15d18e48c260695b3cbe9d686ed1fd649fb776b585fa8c",
    "identityArguments": ""
  },
  {
    "name": "shared_beta_release_gate_attestation_persist_v1",
    "result": "jsonb",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "text, \"SharedBetaReleaseGateCode\", text, text, text, text, integer, text, jsonb, text, text, text, text, bytea, timestamp with time zone, timestamp with time zone",
    "grantSignature": "public.\"shared_beta_release_gate_attestation_persist_v1\"(text, \"SharedBetaReleaseGateCode\", text, text, text, text, integer, text, jsonb, text, text, text, text, bytea, timestamp with time zone, timestamp with time zone)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_release_gate_attestation_persist_v1\"(text, \"SharedBetaReleaseGateCode\", text, text, text, text, integer, text, jsonb, text, text, text, text, bytea, timestamp with time zone, timestamp with time zone)",
    "definitionDigest": "6d0023c10a05922b266e0015e345dcd818333ebe90a18c7ae690cd4a94912dc1",
    "identityArguments": "candidate_attestation_id text, candidate_gate_code \"SharedBetaReleaseGateCode\", candidate_release_sha text, candidate_environment text, candidate_artifact_digest text, candidate_schema_head text, candidate_migration_count integer, candidate_policy_manifest_digest text, candidate_payload jsonb, candidate_payload_digest text, candidate_signing_key_id text, candidate_provenance_key_version text, candidate_public_key_fingerprint text, candidate_signature bytea, candidate_passed_at timestamp with time zone, candidate_valid_until timestamp with time zone"
  },
  {
    "name": "shared_beta_release_gate_attestation_revoke_v1",
    "result": "jsonb",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "text, integer, text",
    "grantSignature": "public.\"shared_beta_release_gate_attestation_revoke_v1\"(text, integer, text)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_release_gate_attestation_revoke_v1\"(text, integer, text)",
    "definitionDigest": "67c82e017edd5c7ac44f32aa7bfc9c0733c605590e1095932c704358bf4ea452",
    "identityArguments": "expected_attestation_id text, expected_state_revision integer, revocation_reason_digest text"
  },
  {
    "name": "shared_beta_tenant_admission_decision_assert_v1",
    "result": "jsonb",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "text, text, text, text, integer, text, text, text, text, integer, text, text, integer, integer, text, text",
    "grantSignature": "public.\"shared_beta_tenant_admission_decision_assert_v1\"(text, text, text, text, integer, text, text, text, text, integer, text, text, integer, integer, text, text)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_tenant_admission_decision_assert_v1\"(text, text, text, text, integer, text, text, text, text, integer, text, text, integer, integer, text, text)",
    "definitionDigest": "96defeb57181cda16e9f19660b55336f3683f0f2bebf1ccd4fa27ffaf3ea4cb3",
    "identityArguments": "expected_decision_id text, expected_tenant_id text, expected_workflow_locator text, expected_reservation_subject_id text, expected_claim_revision integer, expected_release_sha text, expected_environment text, expected_artifact_digest text, expected_schema_head text, expected_migration_count integer, expected_policy_manifest_digest text, expected_database_identity_digest text, expected_entitlement_profile_revision integer, expected_execution_revision integer, expected_profile_digest text, expected_gate_set_digest text"
  },
  {
    "name": "shared_beta_tenant_admission_decision_create_v1",
    "result": "jsonb",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "text, text, text, text, text, text, integer, text, text, text, text, text, integer, text, text, integer, integer, text, text, text, text, jsonb, text, text, text, bytea, timestamp with time zone, timestamp with time zone, text, text, text",
    "grantSignature": "public.\"shared_beta_tenant_admission_decision_create_v1\"(text, text, text, text, text, text, integer, text, text, text, text, text, integer, text, text, integer, integer, text, text, text, text, jsonb, text, text, text, bytea, timestamp with time zone, timestamp with time zone, text, text, text)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_tenant_admission_decision_create_v1\"(text, text, text, text, text, text, integer, text, text, text, text, text, integer, text, text, integer, integer, text, text, text, text, jsonb, text, text, text, bytea, timestamp with time zone, timestamp with time zone, text, text, text)",
    "definitionDigest": "cf5065c716c9b84124455d54273edb8fd0c80b7038afaf2727f9c10d8143fc49",
    "identityArguments": "candidate_decision_id text, expected_tenant_id text, admission_request_id text, admission_request_digest text, expected_workflow_locator text, expected_reservation_subject_id text, expected_claim_revision integer, expected_shell_evidence_digest text, expected_release_sha text, expected_environment text, expected_artifact_digest text, expected_schema_head text, expected_migration_count integer, expected_policy_manifest_digest text, expected_database_identity_digest text, expected_entitlement_profile_revision integer, expected_execution_revision integer, expected_profile_digest text, expected_gate_set_digest text, approved_by_user_id text, approval_reference_digest text, candidate_payload jsonb, candidate_payload_digest text, candidate_signing_key_id text, candidate_public_key_fingerprint text, candidate_signature bytea, candidate_approved_at timestamp with time zone, candidate_valid_until timestamp with time zone, module_policy_attestation_id text, email_workflow_attestation_id text, postgres_rehearsal_attestation_id text"
  },
  {
    "name": "shared_beta_tenant_admission_decision_guard_v1",
    "result": "trigger",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "",
    "grantSignature": "public.\"shared_beta_tenant_admission_decision_guard_v1\"()",
    "securityDefiner": false,
    "catalogSignature": "public.\"shared_beta_tenant_admission_decision_guard_v1\"()",
    "definitionDigest": "2e5ceda2d61060093c5742a078cfeba8a1db2f77acfff351feaf83f1323f71b0",
    "identityArguments": ""
  },
  {
    "name": "shared_beta_tenant_admission_decision_revoke_v1",
    "result": "jsonb",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "text, text, integer, text",
    "grantSignature": "public.\"shared_beta_tenant_admission_decision_revoke_v1\"(text, text, integer, text)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_tenant_admission_decision_revoke_v1\"(text, text, integer, text)",
    "definitionDigest": "6358cc71cf5597ae60c3a33b39ae4174fbdcb7310d96c11a00e8016be5622f48",
    "identityArguments": "expected_decision_id text, expected_tenant_id text, expected_state_revision integer, revocation_reason_digest text"
  },
  {
    "name": "shared_beta_tenant_admission_gate_immutable_v1",
    "result": "trigger",
    "language": "plpgsql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "v",
    "argumentTypes": "",
    "grantSignature": "public.\"shared_beta_tenant_admission_gate_immutable_v1\"()",
    "securityDefiner": false,
    "catalogSignature": "public.\"shared_beta_tenant_admission_gate_immutable_v1\"()",
    "definitionDigest": "2f903e39ca2b3f93ad0309d46ddcfa51bba88e5b17e96e5fb140f5a6c6ea5b76",
    "identityArguments": ""
  },
  {
    "name": "shared_beta_tenant_profile_digest_v1",
    "result": "text",
    "language": "sql",
    "searchPath": [
      "pg_catalog"
    ],
    "volatility": "s",
    "argumentTypes": "text, integer",
    "grantSignature": "public.\"shared_beta_tenant_profile_digest_v1\"(text, integer)",
    "securityDefiner": true,
    "catalogSignature": "public.\"shared_beta_tenant_profile_digest_v1\"(text, integer)",
    "definitionDigest": "fcb5b640761941cd7974dde2a8ed231585e96050ab684053f08cdc848bba2bea",
    "identityArguments": "expected_tenant_id text, expected_profile_revision integer"
  }
],
);

export const SHARED_BETA_ADMISSION_TYPES = freezeRecords(
  [
  {
    "name": "SharedBetaReleaseGateCode",
    "kind": "e",
    "ownerPolicy": "DATABASE_OWNER",
    "aclPolicy": "OWNER_USAGE_ONLY"
  }
],
);

export const SHARED_BETA_ADMISSION_ENUMS = freezeTuples(
  [
  [
    "SharedBetaReleaseGateCode",
    "MODULE_POLICY_ENFORCED",
    1
  ],
  [
    "SharedBetaReleaseGateCode",
    "EMAIL_INVITE_WORKFLOW_VERIFIED",
    2
  ],
  [
    "SharedBetaReleaseGateCode",
    "POSTGRESQL_RELEASE_REHEARSAL_VERIFIED",
    3
  ]
],
);

export const SHARED_BETA_ADMISSION_TRIGGERS = freezeTuples(
  [
  [
    "ReleaseGateAttestation",
    "ReleaseGateAttestation_guard_trigger",
    "shared_beta_release_gate_attestation_guard_v1",
    27,
    "0acab2dca1c28eb242dc96e4094ae8d7777e13f1e38c8946f415889698636cfc"
  ],
  [
    "TenantAdmissionDecision",
    "TenantAdmissionDecision_guard_trigger",
    "shared_beta_tenant_admission_decision_guard_v1",
    27,
    "d46e1cd7ac776a05c4c18e9d9ea251ec0445a747853141855c359b8fb3ec0690"
  ],
  [
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate_immutable_trigger",
    "shared_beta_tenant_admission_gate_immutable_v1",
    27,
    "bbeacd8bd83e10dc84b9a15484943d02a7b120b8b6cbaef1f5e9e779a5a44284"
  ]
],
);

export const SHARED_BETA_ADMISSION_REFERENTIAL_CONSTRAINTS =
  freezeTuples(
    [
  [
    "TenantAdmissionDecisionGate_decisionId_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecision",
    "TenantAdmissionDecisionGate",
    "RI_FKey_restrict_del",
    9
  ],
  [
    "TenantAdmissionDecisionGate_decisionId_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecision",
    "TenantAdmissionDecisionGate",
    "RI_FKey_restrict_upd",
    17
  ],
  [
    "TenantAdmissionDecisionGate_decisionId_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecision",
    "RI_FKey_check_ins",
    5
  ],
  [
    "TenantAdmissionDecisionGate_decisionId_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecision",
    "RI_FKey_check_upd",
    17
  ],
  [
    "TenantAdmissionDecision_approvedByUserId_fkey",
    "TenantAdmissionDecision",
    "User",
    "TenantAdmissionDecision",
    "RI_FKey_restrict_del",
    9
  ],
  [
    "TenantAdmissionDecision_approvedByUserId_fkey",
    "TenantAdmissionDecision",
    "User",
    "TenantAdmissionDecision",
    "RI_FKey_restrict_upd",
    17
  ],
  [
    "TenantAdmissionDecision_approvedByUserId_fkey",
    "TenantAdmissionDecision",
    "TenantAdmissionDecision",
    "User",
    "RI_FKey_check_ins",
    5
  ],
  [
    "TenantAdmissionDecision_approvedByUserId_fkey",
    "TenantAdmissionDecision",
    "TenantAdmissionDecision",
    "User",
    "RI_FKey_check_upd",
    17
  ],
  [
    "TenantAdmissionDecision_tenantId_fkey",
    "TenantAdmissionDecision",
    "Tenant",
    "TenantAdmissionDecision",
    "RI_FKey_restrict_del",
    9
  ],
  [
    "TenantAdmissionDecision_tenantId_fkey",
    "TenantAdmissionDecision",
    "Tenant",
    "TenantAdmissionDecision",
    "RI_FKey_restrict_upd",
    17
  ],
  [
    "TenantAdmissionDecision_tenantId_fkey",
    "TenantAdmissionDecision",
    "TenantAdmissionDecision",
    "Tenant",
    "RI_FKey_check_ins",
    5
  ],
  [
    "TenantAdmissionDecision_tenantId_fkey",
    "TenantAdmissionDecision",
    "TenantAdmissionDecision",
    "Tenant",
    "RI_FKey_check_upd",
    17
  ],
  [
    "tenant_admission_decision_gate_attestation_fkey",
    "TenantAdmissionDecisionGate",
    "ReleaseGateAttestation",
    "TenantAdmissionDecisionGate",
    "RI_FKey_restrict_del",
    9
  ],
  [
    "tenant_admission_decision_gate_attestation_fkey",
    "TenantAdmissionDecisionGate",
    "ReleaseGateAttestation",
    "TenantAdmissionDecisionGate",
    "RI_FKey_restrict_upd",
    17
  ],
  [
    "tenant_admission_decision_gate_attestation_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate",
    "ReleaseGateAttestation",
    "RI_FKey_check_ins",
    5
  ],
  [
    "tenant_admission_decision_gate_attestation_fkey",
    "TenantAdmissionDecisionGate",
    "TenantAdmissionDecisionGate",
    "ReleaseGateAttestation",
    "RI_FKey_check_upd",
    17
  ]
],
  );

export const SHARED_BETA_ADMISSION_DORMANT_RELATIONS = Object.freeze(
  [...SHARED_BETA_ADMISSION_RELATIONS],
);

export const SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS = Object.freeze(
  SHARED_BETA_ADMISSION_FUNCTIONS.map((entry) => entry.name),
);

export const SHARED_BETA_ADMISSION_DORMANT_TYPES = Object.freeze(
  SHARED_BETA_ADMISSION_TYPES.map((entry) => entry.name),
);

export const SHARED_BETA_ADMISSION_CATALOG = Object.freeze({
  schemaVersion: 1,
  migration: "20260730020000_shared_beta_admission_provenance",
  migrationSqlSha256:
    "58f0ee03e49f64fe7a21562fc5c64f8741a270cafba2232ce99b732e9ea99bb0",
  source: "POSTGRESQL_16_PG_CATALOG",
  catalogSnapshotDigestAlgorithm:
    "RFC8785_STYLE_CANONICAL_JSON_SHA256_V1",
  catalogSnapshotDigestSha256:
    "3f53d6aac9f48445e6bef5cbbdcdb6a4a21bc8f253ea59d3056be040e026eb3b",
  postgresqlMajor: 16,
  relationCount: 3,
  columnCount: 64,
  sealedColumnCount: 64,
  constraintCount: 28,
  indexCount: 14,
  functionCount: 9,
  typeCount: 1,
  enumLabelCount: 3,
  triggerCount: 3,
  referentialTriggerCount: 16,
});
