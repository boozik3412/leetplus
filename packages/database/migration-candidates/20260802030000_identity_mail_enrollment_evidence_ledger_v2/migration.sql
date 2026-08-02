BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT185 is a disposable-rehearsal-only, NOT_DEPLOYABLE evidence slice
-- above the exact frozen CURRENT184 stack. It creates no role or grant, wires
-- no runtime path, sends no mail and conveys no apply authorization.

-- The prerequisite, immutable ledger DDL, exact two-TEXT owner importer and
-- catalog postconditions are intentionally kept in this one atomic candidate.

DO $prerequisite$
DECLARE
  completed_migration_count INTEGER;
  lexical_migration_head TEXT;
  migration_manifest_digest TEXT;
  candidate_receipt_count INTEGER;
  candidate_receipt_checksum TEXT;
  candidate_receipt_applied_steps INTEGER;
  rehearsal_confirmation TEXT;
  rehearsal_candidate_sha256 TEXT;
  database_owner_oid OID;
  command_owner_oid OID;
  current_role_oid OID;
  command_column_count INTEGER;
  invalid_command_column_count INTEGER;
  command_constraint_count INTEGER;
  command_index_count INTEGER;
  invalid_command_catalog_count INTEGER;
  command_column_manifest_digest TEXT;
  command_constraint_manifest_digest TEXT;
  command_index_manifest_digest TEXT;
  retained_rpc_drift_count INTEGER;
  retained_tenant_lock_named_routine_count INTEGER;
  retained_tenant_lock_metadata_count INTEGER;
  unexpected_importer_routine_count INTEGER;
BEGIN
  rehearsal_confirmation := pg_catalog.current_setting(
    'leetplus.identity_mail_enrollment_evidence_ledger_current185_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_enrollment_evidence_ledger_current185_sha256',
    true
  );

  IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-enrollment-evidence-ledger-current185'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT185 evidence ledger is restricted to the confirmed disposable rehearsal boundary'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.min(migration."checksum"),
    pg_catalog.min(migration."applied_steps_count")
  INTO
    candidate_receipt_count,
    candidate_receipt_checksum,
    candidate_receipt_applied_steps
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260802030000_identity_mail_enrollment_evidence_ledger_v2'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1
     OR candidate_receipt_checksum IS DISTINCT FROM
       rehearsal_candidate_sha256
     OR candidate_receipt_applied_steps IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT185 evidence ledger requires one exact unfinished Prisma rehearsal receipt'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.max(migration."migration_name"),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            migration."migration_name" || ' ' || migration."checksum",
            E'\n'
            ORDER BY migration."migration_name" COLLATE "C"
          ) || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    completed_migration_count,
    lexical_migration_head,
    migration_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF completed_migration_count IS DISTINCT FROM 184
     OR lexical_migration_head IS DISTINCT FROM
       '20260802020000_identity_mail_worker_v2_lost_response_replay'
     OR migration_manifest_digest IS DISTINCT FROM
       '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260802020000_identity_mail_worker_v2_lost_response_replay'
         AND migration."checksum" =
           'd889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260802030000_identity_mail_enrollment_evidence_ledger_v2'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT185 evidence ledger requires the exact completed frozen CURRENT184 stack'
      USING ERRCODE = '55000';
  END IF;

  SELECT database_entry.datdba
  INTO database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  SELECT relation.relowner
  INTO command_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT role_entry.oid
  INTO current_role_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = current_user;

  WITH expected(
    "signature",
    "body_sha256",
    "argument_count",
    "argument_names"
  ) AS (
    VALUES
      (
        'public."identity_mail_delivery_worker_assert_v2"(text,text)',
        '56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c',
        2,
        ARRAY[
          'p_tenant_id',
          'p_provider_authority_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
        '99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1',
        4,
        ARRAY[
          'p_tenant_id',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_authority_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
        'ed440a728feb80b1740246855da8f8eea83b6b17b9d6fd1a59368184c3287af3',
        8,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_lease_version',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_attempt_key',
          'p_provider_authority_digest',
          'p_message_id_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
        'ffa78b8844522a7b80ed38fe6eb11454b9d8e4c2fe319878cbd7bda42ed02730',
        9,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_lease_version',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_authority_digest',
          'p_outcome_code',
          'p_provider_receipt_digest',
          'p_terminal_ack_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
        '1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d',
        4,
        ARRAY[
          'p_tenant_id',
          'p_provider_authority_digest',
          'p_worker_actor_digest',
          'p_batch_limit'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
        '39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151',
        6,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_transition_revision',
          'p_resolution_code',
          'p_evidence_digest',
          'p_actor_digest'
        ]::TEXT[]
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_rpc_drift_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid IS NULL
     OR routine.proowner IS DISTINCT FROM command_owner_oid
     OR routine.prokind IS DISTINCT FROM 'f'::"char"
     OR routine.prosecdef IS DISTINCT FROM true
     OR routine.proleakproof IS DISTINCT FROM false
     OR routine.proisstrict IS DISTINCT FROM false
     OR routine.proretset IS DISTINCT FROM false
     OR routine.provolatile IS DISTINCT FROM 'v'::"char"
     OR routine.proparallel IS DISTINCT FROM 'u'::"char"
     OR routine.pronargs IS DISTINCT FROM expected."argument_count"
     OR routine.pronargdefaults IS DISTINCT FROM 0
     OR routine.proargdefaults IS NOT NULL
     OR routine.provariadic IS DISTINCT FROM 0::OID
     OR routine.prorettype IS DISTINCT FROM 'jsonb'::pg_catalog.regtype
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[]
     OR routine.proargnames IS DISTINCT FROM expected."argument_names"
     OR routine.proargmodes IS NOT NULL
     OR routine.proallargtypes IS NOT NULL
     OR language.lanname IS DISTINCT FROM 'plpgsql'
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(routine.prosrc, 'UTF8')
       ),
       'hex'
     ) IS DISTINCT FROM expected."body_sha256"
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
     ) IS DISTINCT FROM 1
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
       WHERE privilege.grantor IS DISTINCT FROM routine.proowner
          OR privilege.grantee IS DISTINCT FROM routine.proowner
          OR privilege.privilege_type IS DISTINCT FROM 'EXECUTE'
           OR privilege.is_grantable IS DISTINCT FROM false
      );

  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_tenant_lock_named_routine_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname = 'identity_mail_tenant_lock_v1';

  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_tenant_lock_metadata_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid = pg_catalog.to_regprocedure(
      'public."identity_mail_tenant_lock_v1"(text)'
    )
    AND routine.proowner = command_owner_oid
    AND routine.prokind = 'f'::"char"
    AND routine.prosecdef = false
    AND routine.proleakproof = false
    AND routine.proisstrict = false
    AND routine.proretset = false
    AND routine.provolatile = 'v'::"char"
    AND routine.proparallel = 'u'::"char"
    AND routine.pronargs = 1
    AND routine.pronargdefaults = 0
    AND routine.proargdefaults IS NULL
    AND routine.provariadic = 0::OID
    AND routine.prorettype = 'text'::pg_catalog.regtype
    AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AND routine.proargnames = ARRAY['p_tenant_id']::TEXT[]
    AND routine.proargmodes IS NULL
    AND routine.proallargtypes IS NULL
    AND language.lanname = 'plpgsql'
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
      'hex'
    ) = 'c53780aa0df846a4085b01b4c62cbb857f69e0f145a8c72a43ef1af35fafc790'
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(
        COALESCE(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) AS privilege
    ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) AS privilege
      WHERE privilege.grantor IS DISTINCT FROM routine.proowner
         OR privilege.grantee IS DISTINCT FROM routine.proowner
         OR privilege.privilege_type IS DISTINCT FROM 'EXECUTE'
         OR privilege.is_grantable IS DISTINCT FROM false
    );

  SELECT pg_catalog.count(*)::INTEGER
  INTO unexpected_importer_routine_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname =
      'identity_mail_tenant_enrollment_import_evidence_v2';

  SELECT pg_catalog.count(*)::INTEGER
  INTO command_column_count
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  WITH expected(
    "ordinal", "column_name", "formatted_type", "not_null", "has_default"
  ) AS (
    VALUES
      (1, 'id', 'text', true, false),
      (2, 'tenantId', 'text', true, false),
      (3, 'requestId', 'text', true, false),
      (4, 'action', 'character varying(16)', true, false),
      (5, 'intent', 'character varying(16)', true, true),
      (6, 'contractVersion', 'character varying(64)', true, true),
      (7, 'signatureDomain', 'character varying(64)', true, true),
      (8, 'rollbackOfCommandId', 'text', false, false),
      (9, 'proposalContentDigest', 'character(64)', true, false),
      (10, 'proposalCanonicalJson', 'text', true, false),
      (11, 'authorizationEnvelopeDigest', 'character(64)', true, false),
      (12, 'authorizationEnvelopeCanonicalJson', 'text', true, false),
      (13, 'expectedState', 'character varying(16)', true, false),
      (14, 'targetState', 'character varying(16)', true, false),
      (15, 'expectedPolicyRevision', 'integer', true, false),
      (16, 'nextPolicyRevision', 'integer', true, false),
      (17, 'stateRevisionBefore', 'bigint', true, false),
      (18, 'drainStateRevision', 'bigint', false, false),
      (19, 'finalStateRevision', 'bigint', true, false),
      (20, 'previousWorkerRoleName', 'character varying(63)', false, false),
      (21, 'previousWorkerRoleOid', 'bigint', false, false),
      (22, 'previousProviderAuthorityDigest', 'character(64)', false, false),
      (23, 'previousMaxAttempts', 'integer', false, false),
      (24, 'previousLeaseSeconds', 'integer', false, false),
      (25, 'previousAcknowledgeSeconds', 'integer', false, false),
      (26, 'previousBaseRetrySeconds', 'integer', false, false),
      (27, 'previousMaxRetrySeconds', 'integer', false, false),
      (28, 'previousConfigurationDigest', 'character(64)', false, false),
      (29, 'targetWorkerRoleName', 'character varying(63)', true, false),
      (30, 'targetWorkerRoleOid', 'bigint', true, false),
      (31, 'targetProviderAuthorityDigest', 'character(64)', true, false),
      (32, 'targetMaxAttempts', 'integer', true, false),
      (33, 'targetLeaseSeconds', 'integer', true, false),
      (34, 'targetAcknowledgeSeconds', 'integer', true, false),
      (35, 'targetBaseRetrySeconds', 'integer', true, false),
      (36, 'targetMaxRetrySeconds', 'integer', true, false),
      (37, 'targetConfigurationDigest', 'character(64)', true, false),
      (38, 'runtimeConfigDigest', 'character(64)', true, false),
      (39, 'expectedDatabaseName', 'character varying(63)', true, false),
      (40, 'expectedDatabaseOid', 'bigint', true, false),
      (41, 'databaseIdentityDigest', 'character(64)', true, false),
      (42, 'deploymentMarkerId', 'text', true, false),
      (43, 'deploymentMarkerDigest', 'character(64)', true, false),
      (44, 'actualContextDigest', 'character(64)', true, false),
      (45, 'releaseSha', 'character(40)', true, false),
      (46, 'actorDigest', 'character(64)', true, false),
      (47, 'signatureAlgorithm', 'character varying(16)', true, true),
      (48, 'signingKeyId', 'character varying(64)', true, false),
      (49, 'publicKeyFingerprint', 'character(64)', true, false),
      (50, 'signatureBase64url', 'text', true, false),
      (51, 'signatureVerifiedAt', 'timestamp(3) with time zone', true, false),
      (52, 'requestedAt', 'timestamp(3) with time zone', true, false),
      (53, 'expiresAt', 'timestamp(3) with time zone', true, false),
      (54, 'acceptedAt', 'timestamp(3) with time zone', true, false),
      (55, 'acceptedTransactionId', 'character varying(32)', true, false),
      (56, 'receipt', 'jsonb', true, false),
      (57, 'receiptDigest', 'character(64)', true, false)
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_command_column_count
  FROM expected
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    )
   AND attribute.attnum = expected."ordinal"
   AND attribute.attname = expected."column_name"
   AND attribute.attisdropped = false
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attnum IS NULL
     OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
       IS DISTINCT FROM expected."formatted_type"
     OR attribute.attnotnull IS DISTINCT FROM expected."not_null"
      OR (default_value.oid IS NOT NULL) IS DISTINCT FROM
        expected."has_default";

  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.string_agg(
          attribute.attnum::TEXT || E'\n'
            || attribute.attname || E'\n'
            || pg_catalog.format_type(
              attribute.atttypid,
              attribute.atttypmod
            ) || E'\n'
            || attribute.attnotnull::TEXT || E'\n'
            || COALESCE(
              pg_catalog.pg_get_expr(
                default_value.adbin,
                default_value.adrelid,
                true
              ),
              '<NULL>'
            ),
          E'\n' ORDER BY attribute.attnum
        ) || E'\n',
        'UTF8'
      )
    ),
    'hex'
  )
  INTO command_column_manifest_digest
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  SELECT pg_catalog.count(*)::INTEGER
  INTO command_constraint_count
  FROM pg_catalog.pg_constraint AS target_constraint
  WHERE target_constraint.conrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO command_index_count
  FROM pg_catalog.pg_index AS target_index
  WHERE target_index.indrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.string_agg(
          target_constraint.conname || E'\n'
            || pg_catalog.pg_get_constraintdef(
              target_constraint.oid,
              true
            ),
          E'\n' ORDER BY target_constraint.conname COLLATE "C"
        ) || E'\n',
        'UTF8'
      )
    ),
    'hex'
  )
  INTO command_constraint_manifest_digest
  FROM pg_catalog.pg_constraint AS target_constraint
  WHERE target_constraint.conrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.string_agg(
          index_relation.relname || E'\n'
            || pg_catalog.pg_get_indexdef(
              target_index.indexrelid,
              0,
              true
            ),
          E'\n' ORDER BY index_relation.relname COLLATE "C"
        ) || E'\n',
        'UTF8'
      )
    ),
    'hex'
  )
  INTO command_index_manifest_digest
  FROM pg_catalog.pg_index AS target_index
  INNER JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = target_index.indexrelid
  WHERE target_index.indrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  WITH expected("object_name", "object_kind", "is_unique") AS (
    VALUES
      ('IdentityMailDeliveryTenantEnrollmentCommand_pkey', 'constraint', true),
      ('identity_mail_tenant_enrollment_command_tenant_id_key', 'constraint', true),
      ('identity_mail_tenant_enrollment_command_request_uidx', 'constraint', true),
      ('identity_mail_tenant_enrollment_command_digest_key', 'constraint', true),
      ('identity_mail_tenant_enrollment_command_drain_projection_key', 'constraint', true),
      ('identity_mail_tenant_enrollment_command_identifier_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_kind_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_digest_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_transition_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_revision_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_previous_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_target_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_mutation_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_binding_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_signature_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_timeline_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_payload_check', 'constraint', false),
      ('identity_mail_tenant_enrollment_command_receipt_check', 'constraint', false),
      ('IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey', 'constraint', false),
      ('IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey', 'constraint', false),
      ('IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey', 'constraint', false),
      ('IdentityMailDeliveryTenantEnrollmentCommand_pkey', 'index', true),
      ('identity_mail_tenant_enrollment_command_tenant_id_key', 'index', true),
      ('identity_mail_tenant_enrollment_command_request_uidx', 'index', true),
      ('identity_mail_tenant_enrollment_command_digest_key', 'index', true),
      ('identity_mail_tenant_enrollment_command_drain_projection_key', 'index', true),
      ('identity_mail_tenant_enrollment_command_marker_idx', 'index', false),
      ('identity_mail_tenant_enrollment_command_rollback_idx', 'index', false),
      ('identity_mail_tenant_enrollment_command_accepted_idx', 'index', false),
      ('identity_mail_tenant_enrollment_command_rollback_once_uidx', 'index', true)
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_command_catalog_count
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS target_constraint
    ON expected."object_kind" = 'constraint'
   AND target_constraint.conrelid = pg_catalog.to_regclass(
     'public."IdentityMailDeliveryTenantEnrollmentCommand"'
   )
   AND target_constraint.conname = expected."object_name"
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON expected."object_kind" = 'index'
   AND index_relation.relnamespace = pg_catalog.to_regnamespace('public')
   AND index_relation.relname = expected."object_name"
  LEFT JOIN pg_catalog.pg_index AS target_index
    ON target_index.indexrelid = index_relation.oid
   AND target_index.indrelid = pg_catalog.to_regclass(
     'public."IdentityMailDeliveryTenantEnrollmentCommand"'
   )
  WHERE (
      expected."object_kind" = 'constraint'
      AND (
        target_constraint.oid IS NULL
        OR target_constraint.convalidated IS DISTINCT FROM true
      )
    )
    OR (
      expected."object_kind" = 'index'
      AND (
        target_index.indexrelid IS NULL
        OR target_index.indisunique IS DISTINCT FROM expected."is_unique"
        OR target_index.indisvalid IS DISTINCT FROM true
        OR target_index.indisready IS DISTINCT FROM true
      )
    );

  IF database_owner_oid IS NULL
     OR command_owner_oid IS NULL
     OR current_role_oid IS NULL
     OR command_owner_oid IS DISTINCT FROM database_owner_oid
     OR current_role_oid IS DISTINCT FROM database_owner_oid
     OR command_column_count IS DISTINCT FROM 57
     OR invalid_command_column_count <> 0
     OR command_constraint_count IS DISTINCT FROM 21
     OR command_index_count IS DISTINCT FROM 9
     OR invalid_command_catalog_count <> 0
     OR command_column_manifest_digest IS DISTINCT FROM
       'be490e0aa6819487811dc010cdec3a9165f8b5134eef2acb2585f34886478617'
     OR command_constraint_manifest_digest IS DISTINCT FROM
       '4c92d9e5d371003ae3512e2c450ec2b981e6209a7ef1d56ffe2d8ff9dd10c8bc'
     OR command_index_manifest_digest IS DISTINCT FROM
       'b1722ac29aa6197dc73c5b0687779d9c2bfdbe8fffa9c03df48406ee1ab6d771'
     OR retained_rpc_drift_count IS DISTINCT FROM 0
     OR retained_tenant_lock_named_routine_count IS DISTINCT FROM 1
     OR retained_tenant_lock_metadata_count IS DISTINCT FROM 1
     OR unexpected_importer_routine_count IS DISTINCT FROM 0
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
           'public."identity_mail_tenant_enrollment_command_guard_v1"()'
         )
         AND routine.proowner = command_owner_oid
         AND routine.prosecdef = false
         AND routine.provolatile = 'v'::"char"
         AND routine.proparallel = 'u'::"char"
         AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
         AND pg_catalog.encode(
           pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
           'hex'
         ) =
           '9d0e35ef0b95ff070c7957825fa01fb022b0a3f64ae99955b888538acb58cd53'
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('IdentityMailEnrollmentCommand_dml_guard_trigger', 30),
           ('IdentityMailEnrollmentCommand_truncate_guard_trigger', 34)
       ) AS expected("trigger_name", "trigger_type")
       LEFT JOIN pg_catalog.pg_trigger AS target_trigger
         ON target_trigger.tgrelid = pg_catalog.to_regclass(
           'public."IdentityMailDeliveryTenantEnrollmentCommand"'
         )
        AND target_trigger.tgname = expected."trigger_name"
        AND target_trigger.tgisinternal = false
       WHERE target_trigger.oid IS NULL
          OR target_trigger.tgfoid <> pg_catalog.to_regprocedure(
            'public."identity_mail_tenant_enrollment_command_guard_v1"()'
          )
          OR target_trigger.tgtype <> expected."trigger_type"
          OR target_trigger.tgenabled IS DISTINCT FROM 'O'::"char"
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS target_trigger
       WHERE target_trigger.tgrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollmentCommand"'
       )
         AND target_trigger.tgisinternal = false
     ) <> 2
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_lock_v1"(text)'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDutyRoleManifestEvidenceV2"'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDutyRoleManifestRevocationV2"'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
     )
  THEN
    RAISE EXCEPTION
      'CURRENT185 evidence ledger requires the exact empty owner-held CURRENT180 command foundation'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisite$;

DROP TRIGGER "IdentityMailEnrollmentCommand_dml_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollmentCommand";

DROP TRIGGER "IdentityMailEnrollmentCommand_truncate_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollmentCommand";

DROP FUNCTION public."identity_mail_tenant_enrollment_command_guard_v1"();

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_kind_check",
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_digest_check",
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_signature_check",
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_timeline_check",
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_payload_check",
  DROP CONSTRAINT "identity_mail_tenant_enrollment_command_receipt_check";

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ALTER COLUMN "contractVersion"
    SET DEFAULT 'PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2',
  ALTER COLUMN "signatureDomain"
    SET DEFAULT 'IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2',
  ADD COLUMN "dutyManifestContract" VARCHAR(64) NOT NULL,
  ADD COLUMN "dutyManifestProfile" VARCHAR(64) NOT NULL,
  ADD COLUMN "dutyManifestId" TEXT NOT NULL,
  ADD COLUMN "dutyManifestRevision" INTEGER NOT NULL,
  ADD COLUMN "dutyManifestPayloadDigest" CHAR(64) NOT NULL,
  ADD COLUMN "dutyManifestSigningKeyId" VARCHAR(64) NOT NULL,
  ADD COLUMN "dutyManifestPublicKeyFingerprint" CHAR(64) NOT NULL,
  ADD COLUMN "dutyCoordinatorRoleName" VARCHAR(63) NOT NULL,
  ADD COLUMN "dutyCoordinatorRoleOid" BIGINT NOT NULL,
  ADD COLUMN "dutyWorkerRoleName" VARCHAR(63) NOT NULL,
  ADD COLUMN "dutyWorkerRoleOid" BIGINT NOT NULL,
  ADD COLUMN "dutyExactGrantsProfile" VARCHAR(64) NOT NULL,
  ADD COLUMN "dutyExactGrantsDigest" CHAR(64) NOT NULL,
  ADD COLUMN "dutyPredecessorManifestDigest" CHAR(64) NOT NULL,
  ADD COLUMN "dutyApplicationContract" VARCHAR(64) NOT NULL,
  ADD COLUMN "dutyApplicationReleaseSha" CHAR(40) NOT NULL,
  ADD COLUMN "dutyApplicationArtifactSha256" CHAR(64) NOT NULL,
  ADD COLUMN "compositionContract" VARCHAR(64) NOT NULL,
  ADD COLUMN "compositionProfile" VARCHAR(64) NOT NULL,
  ADD COLUMN "bindingCanonicalJson" TEXT NOT NULL,
  ADD COLUMN "bindingDigest" CHAR(64) NOT NULL,
  ADD COLUMN "bundleContract" VARCHAR(64) NOT NULL,
  ADD COLUMN "bundleProfile" VARCHAR(64) NOT NULL,
  ADD COLUMN "bundleCanonicalJson" TEXT NOT NULL,
  ADD COLUMN "bundleDigest" CHAR(64) NOT NULL,
  ADD COLUMN "importedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  ADD COLUMN "importedTransactionId" VARCHAR(32) NOT NULL,
  ADD COLUMN "importReceipt" JSONB NOT NULL,
  ADD COLUMN "importReceiptDigest" CHAR(64) NOT NULL;

CREATE INDEX "identity_mail_tenant_enrollment_command_imported_idx"
  ON public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "importedAt"
  );

CREATE TABLE public."IdentityMailDutyRoleManifestEvidenceV2" (
  "payloadDigest" CHAR(64) NOT NULL,
  "manifestId" TEXT NOT NULL,
  "manifestRevision" INTEGER NOT NULL,
  "contractVersion" VARCHAR(64) NOT NULL,
  "profile" VARCHAR(64) NOT NULL,
  "trustDomain" VARCHAR(64) NOT NULL,
  "purpose" VARCHAR(64) NOT NULL,
  "payloadCanonicalJson" TEXT NOT NULL,
  "manifestEvidence" JSONB NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL,
  "signingKeyId" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signatureBase64url" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "databaseName" VARCHAR(63) NOT NULL,
  "databaseOid" BIGINT NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "deploymentMarkerId" TEXT NOT NULL,
  "deploymentMarkerDigest" CHAR(64) NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "coordinatorRoleName" VARCHAR(63) NOT NULL,
  "coordinatorRoleOid" BIGINT NOT NULL,
  "workerRoleName" VARCHAR(63) NOT NULL,
  "workerRoleOid" BIGINT NOT NULL,
  "exactGrantsProfile" VARCHAR(64) NOT NULL,
  "exactGrantsDigest" CHAR(64) NOT NULL,
  "exactGrantsProjection" JSONB NOT NULL,
  "predecessorManifestDigest" CHAR(64) NOT NULL,
  "applicationContract" VARCHAR(64) NOT NULL,
  "applicationReleaseSha" CHAR(40) NOT NULL,
  "applicationArtifactSha256" CHAR(64) NOT NULL,
  "importedCommandId" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "importedTransactionId" VARCHAR(32) NOT NULL,
  "importReceiptDigest" CHAR(64) NOT NULL,

  CONSTRAINT "IdentityMailDutyRoleManifestEvidenceV2_pkey"
    PRIMARY KEY ("payloadDigest"),
  CONSTRAINT "identity_mail_manifest_v2_revision_key"
    UNIQUE ("manifestId", "manifestRevision"),
  CONSTRAINT "identity_mail_manifest_v2_command_binding_key"
    UNIQUE (
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
      "exactGrantsDigest"
    ),
  CONSTRAINT "identity_mail_manifest_v2_context_binding_key"
    UNIQUE (
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
      "applicationArtifactSha256"
    ),
  CONSTRAINT "identity_mail_manifest_v2_identifier_check"
    CHECK (
      ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND "manifestId" = pg_catalog.lower(
        pg_catalog.btrim("manifestId" COLLATE "C")
      )
      AND ("manifestId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "manifestRevision" BETWEEN 1 AND 2147483647
      AND "importedCommandId" = pg_catalog.lower(
        pg_catalog.btrim("importedCommandId" COLLATE "C")
      )
      AND ("importedCommandId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "identity_mail_manifest_v2_contract_check"
    CHECK (
      "contractVersion" = 'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2'
      AND "profile" = 'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2'
      AND "trustDomain" = 'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V2'
      AND "purpose" = 'IDENTITY_MAIL_DUTY_ROLE_BINDING_V2'
      AND "signatureAlgorithm" = 'Ed25519'
      AND "exactGrantsProfile" = 'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
      AND "predecessorManifestDigest" =
        '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'
      AND "applicationContract" =
        'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2'
    ),
  CONSTRAINT "identity_mail_manifest_v2_context_check"
    CHECK (
      "databaseName" = pg_catalog.lower(
        pg_catalog.btrim("databaseName" COLLATE "C")
      )
      AND ("databaseName"::TEXT COLLATE "C") ~
        '^[a-z][a-z0-9_]{0,62}$'
      AND "databaseName" NOT IN ('postgres', 'template0', 'template1')
      AND "databaseOid" BETWEEN 1 AND 4294967295
      AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("deploymentMarkerId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND ("deploymentMarkerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "identity_mail_manifest_v2_roles_check"
    CHECK (
      ("coordinatorRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND ("workerRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND "coordinatorRoleName" <> "workerRoleName"
      AND "coordinatorRoleOid" BETWEEN 1 AND 4294967295
      AND "workerRoleOid" BETWEEN 1 AND 4294967295
      AND "coordinatorRoleOid" <> "workerRoleOid"
    ),
  CONSTRAINT "identity_mail_manifest_v2_signature_check"
    CHECK (
      "signingKeyId" = pg_catalog.lower(
        pg_catalog.btrim("signingKeyId" COLLATE "C")
      )
      AND ("signingKeyId" COLLATE "C") ~
        '^[a-z0-9][a-z0-9._-]{2,63}$'
      AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("signatureBase64url" COLLATE "C") ~ '^[A-Za-z0-9_-]{86}$'
      AND ("exactGrantsDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("applicationReleaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
      AND ("applicationArtifactSha256" COLLATE "C") ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "identity_mail_manifest_v2_timeline_check"
    CHECK (
      "validUntil" > "issuedAt"
      AND "validUntil" <= "issuedAt" + INTERVAL '15 minutes'
      AND "importedAt" >= "issuedAt" - INTERVAL '1 minute'
      AND ("importedTransactionId" COLLATE "C") ~ '^[0-9]{1,32}$'
      AND ("importReceiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "identity_mail_manifest_v2_payload_check"
    CHECK (
      pg_catalog.octet_length("payloadCanonicalJson") BETWEEN 2 AND 131072
      AND "payloadCanonicalJson" = pg_catalog.btrim(
        "payloadCanonicalJson" COLLATE "C"
      )
      AND ("payloadCanonicalJson" COLLATE "C") !~ '[[:space:]]'
      AND pg_catalog.jsonb_typeof("manifestEvidence") = 'object'
      AND pg_catalog.jsonb_typeof("exactGrantsProjection") = 'object'
      AND "payloadDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to("payloadCanonicalJson", 'UTF8')
        ),
        'hex'
      )
    )
);

CREATE TABLE public."IdentityMailDutyRoleManifestRevocationV2" (
  "manifestPayloadDigest" CHAR(64) NOT NULL,
  "reasonDigest" CHAR(64) NOT NULL,
  "evidenceDigest" CHAR(64) NOT NULL,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "revokedTransactionId" VARCHAR(32) NOT NULL,

  CONSTRAINT "IdentityMailDutyRoleManifestRevocationV2_pkey"
    PRIMARY KEY ("manifestPayloadDigest"),
  CONSTRAINT "identity_mail_manifest_revocation_v2_evidence_check"
    CHECK (
      ("manifestPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("reasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("evidenceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("revokedTransactionId" COLLATE "C") ~ '^[0-9]{1,32}$'
      AND "reasonDigest" <> "evidenceDigest"
  )
);

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_kind_check"
  CHECK (
    "action" IN ('ENABLE', 'ROTATE', 'DISABLE')
    AND "intent" IN ('FORWARD', 'ROLLBACK')
    AND "contractVersion" =
      'PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V2'
    AND "signatureDomain" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2'
    AND (
      ("intent" = 'FORWARD' AND "rollbackOfCommandId" IS NULL)
      OR ("intent" = 'ROLLBACK' AND "rollbackOfCommandId" IS NOT NULL)
    )
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_digest_check"
  CHECK (
    ("proposalContentDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("authorizationEnvelopeDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "authorizationEnvelopeDigest" <> "proposalContentDigest"
    AND ("targetProviderAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("targetConfigurationDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("runtimeConfigDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("deploymentMarkerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("actorDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("importReceiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("releaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    AND ("dutyManifestPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("dutyManifestPublicKeyFingerprint" COLLATE "C") ~
      '^[0-9a-f]{64}$'
    AND ("dutyExactGrantsDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("dutyPredecessorManifestDigest" COLLATE "C") ~
      '^[0-9a-f]{64}$'
    AND ("dutyApplicationReleaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    AND ("dutyApplicationArtifactSha256" COLLATE "C") ~
      '^[0-9a-f]{64}$'
    AND ("bindingDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("bundleDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_signature_check"
  CHECK (
    "signatureAlgorithm" = 'Ed25519'
    AND "signingKeyId" = pg_catalog.lower(
      pg_catalog.btrim("signingKeyId" COLLATE "C")
    )
    AND ("signingKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("signatureBase64url" COLLATE "C") ~ '^[A-Za-z0-9_-]{86}$'
    AND "signatureVerifiedAt" = "importedAt"
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_timeline_check"
  CHECK (
    "expiresAt" > "requestedAt"
    AND "expiresAt" <= "requestedAt" + INTERVAL '15 minutes'
    AND "importedAt" >= "requestedAt" - INTERVAL '5 minutes'
    AND "importedAt" <= "expiresAt"
    AND ("importedTransactionId" COLLATE "C") ~ '^[0-9]{1,32}$'
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_duty_check"
  CHECK (
    "dutyManifestContract" = 'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2'
    AND "dutyManifestProfile" =
      'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2'
    AND ("dutyManifestId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "dutyManifestRevision" BETWEEN 1 AND 2147483647
    AND "dutyManifestSigningKeyId" = pg_catalog.lower(
      pg_catalog.btrim("dutyManifestSigningKeyId" COLLATE "C")
    )
    AND ("dutyManifestSigningKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("dutyCoordinatorRoleName"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{2,62}$'
    AND ("dutyWorkerRoleName"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{2,62}$'
    AND "dutyCoordinatorRoleName" <> "dutyWorkerRoleName"
    AND "dutyCoordinatorRoleOid" BETWEEN 1 AND 4294967295
    AND "dutyWorkerRoleOid" BETWEEN 1 AND 4294967295
    AND "dutyCoordinatorRoleOid" <> "dutyWorkerRoleOid"
    AND "dutyWorkerRoleName" = "targetWorkerRoleName"
    AND "dutyWorkerRoleOid" = "targetWorkerRoleOid"
    AND "dutyExactGrantsProfile" =
      'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
    AND "dutyPredecessorManifestDigest" =
      '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'
    AND "dutyApplicationContract" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2'
    AND "dutyApplicationReleaseSha" = "releaseSha"
    AND "publicKeyFingerprint" <>
      "dutyManifestPublicKeyFingerprint"
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_bundle_check"
  CHECK (
    "compositionContract" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2'
    AND "compositionProfile" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE_V1'
    AND "bundleContract" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2'
    AND "bundleProfile" =
      'IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE_V1'
    AND pg_catalog.octet_length("bindingCanonicalJson") BETWEEN 2 AND 65536
    AND "bindingCanonicalJson" = pg_catalog.btrim(
      "bindingCanonicalJson" COLLATE "C"
    )
    AND ("bindingCanonicalJson" COLLATE "C") !~ '[[:space:]]'
    AND "bindingDigest" = pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_V1'
            || E'\n' || "bindingCanonicalJson" || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
    AND pg_catalog.octet_length("bundleCanonicalJson") BETWEEN 2 AND 262144
    AND "bundleCanonicalJson" = pg_catalog.btrim(
      "bundleCanonicalJson" COLLATE "C"
    )
    AND ("bundleCanonicalJson" COLLATE "C") !~ '[[:space:]]'
    AND pg_catalog.strpos("bundleCanonicalJson", '@') = 0
    AND "bundleDigest" = pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORT_BUNDLE_V2_V1'
            || E'\n' || "bundleCanonicalJson" || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_payload_check"
  CHECK (
    pg_catalog.octet_length("proposalCanonicalJson") BETWEEN 2 AND 131072
    AND "proposalCanonicalJson" = pg_catalog.btrim(
      "proposalCanonicalJson" COLLATE "C"
    )
    AND ("proposalCanonicalJson" COLLATE "C") !~ '[[:space:]]'
    AND "proposalContentDigest" = pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to("proposalCanonicalJson", 'UTF8')
      ),
      'hex'
    )
    AND pg_catalog.octet_length(
      "authorizationEnvelopeCanonicalJson"
    ) BETWEEN 2 AND 131072
    AND "authorizationEnvelopeCanonicalJson" = pg_catalog.btrim(
      "authorizationEnvelopeCanonicalJson" COLLATE "C"
    )
    AND ("authorizationEnvelopeCanonicalJson" COLLATE "C") !~
      '[[:space:]]'
    AND "authorizationEnvelopeDigest" = pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          "signatureDomain"::TEXT || E'\n'
            || "authorizationEnvelopeCanonicalJson" || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_receipt_check"
  CHECK (
    "importReceipt" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'IMPORT_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_V2',
      'operationId', "bundleDigest",
      'tenantId', "tenantId",
      'commandId', "id",
      'requestId', "requestId",
      'authorizationEnvelopeDigest', "authorizationEnvelopeDigest",
      'manifestId', "dutyManifestId",
      'manifestPayloadDigest', "dutyManifestPayloadDigest",
      'exactGrantsDigest', "dutyExactGrantsDigest",
      'bindingDigest', "bindingDigest",
      'bundleDigest', "bundleDigest",
      'decision', 'IMPORTED',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'canPersistEvidence', true,
      'authorization', false,
      'canMutate', false,
      'canSend', false,
      'importReceiptDigest', "importReceiptDigest",
      'importedAtEpochMs',
        (EXTRACT(EPOCH FROM "importedAt") * 1000)::BIGINT,
      'importedTransactionId', "importedTransactionId"::TEXT
    )
    AND "importReceiptDigest" = pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          ("importReceipt" - 'importReceiptDigest')::TEXT,
          'UTF8'
        )
      ),
      'hex'
    )
  ),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_legacy_bridge_check"
  CHECK (
    "acceptedAt" = "importedAt"
    AND "acceptedTransactionId" = "importedTransactionId"
    AND "receipt" = "importReceipt"
    AND "receiptDigest" = "importReceiptDigest"
  );

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_envelope_key"
    UNIQUE ("authorizationEnvelopeDigest"),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_bundle_key"
    UNIQUE ("bundleDigest"),
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_import_key"
    UNIQUE ("id", "importReceiptDigest");

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "identity_mail_command_manifest_v2_evidence_fkey"
  FOREIGN KEY (
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
    "dutyExactGrantsDigest"
  )
  REFERENCES public."IdentityMailDutyRoleManifestEvidenceV2" (
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
    "exactGrantsDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "identity_mail_command_manifest_v2_context_fkey"
  FOREIGN KEY (
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
    "dutyApplicationArtifactSha256"
  )
  REFERENCES public."IdentityMailDutyRoleManifestEvidenceV2" (
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
    "applicationArtifactSha256"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDutyRoleManifestEvidenceV2"
  ADD CONSTRAINT "identity_mail_manifest_v2_marker_fkey"
  FOREIGN KEY (
    "deploymentMarkerId",
    "deploymentMarkerDigest",
    "databaseIdentityDigest",
    "actualContextDigest"
  )
  REFERENCES public."SharedBetaRuntimeReleaseMarker" (
    "id",
    "payloadDigest",
    "databaseIdentityDigest",
    "actualContextDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "identity_mail_manifest_v2_import_command_fkey"
  FOREIGN KEY ("importedCommandId", "importReceiptDigest")
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "id",
    "importReceiptDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."IdentityMailDutyRoleManifestRevocationV2"
  ADD CONSTRAINT "identity_mail_manifest_revocation_v2_manifest_fkey"
  FOREIGN KEY ("manifestPayloadDigest")
  REFERENCES public."IdentityMailDutyRoleManifestEvidenceV2" (
    "payloadDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

CREATE FUNCTION public."identity_mail_evidence_immutable_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Identity mail V2 evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailEnrollmentCommand_immutable_dml_trigger"
BEFORE UPDATE OR DELETE
ON public."IdentityMailDeliveryTenantEnrollmentCommand"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE TRIGGER "IdentityMailEnrollmentCommand_immutable_truncate_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDeliveryTenantEnrollmentCommand"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE TRIGGER "IdentityMailManifestV2_immutable_dml_trigger"
BEFORE UPDATE OR DELETE
ON public."IdentityMailDutyRoleManifestEvidenceV2"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE TRIGGER "IdentityMailManifestV2_immutable_truncate_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDutyRoleManifestEvidenceV2"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE TRIGGER "IdentityMailManifestRevocationV2_immutable_dml_trigger"
BEFORE UPDATE OR DELETE
ON public."IdentityMailDutyRoleManifestRevocationV2"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE TRIGGER "IdentityMailManifestRevocationV2_immutable_truncate_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDutyRoleManifestRevocationV2"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_evidence_immutable_guard_v2"();

CREATE FUNCTION public."identity_mail_evidence_import_insert_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  active_receipt_digest TEXT;
BEGIN
  active_receipt_digest := pg_catalog.current_setting(
    'leetplus.identity_mail_evidence_import_receipt_v2',
    true
  );

  IF active_receipt_digest IS NULL
     OR (active_receipt_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR NEW."importReceiptDigest" IS DISTINCT FROM active_receipt_digest
  THEN
    RAISE EXCEPTION 'Identity mail V2 evidence INSERT requires importer context'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "IdentityMailEnrollmentCommand_import_insert_guard_trigger"
BEFORE INSERT
ON public."IdentityMailDeliveryTenantEnrollmentCommand"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_evidence_import_insert_guard_v2"();

CREATE TRIGGER "IdentityMailManifestV2_import_insert_guard_trigger"
BEFORE INSERT
ON public."IdentityMailDutyRoleManifestEvidenceV2"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_evidence_import_insert_guard_v2"();

CREATE FUNCTION public."identity_mail_tenant_enrollment_import_evidence_v2"(
  p_bundle_canonical_json TEXT,
  p_bundle_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  bundle JSONB;
  binding JSONB;
  command_arguments JSONB;
  command_evidence JSONB;
  manifest_evidence JSONB;
  manifest_payload JSONB;
  grants_projection JSONB;
  proposal_payload JSONB;
  authorization_envelope JSONB;
  duty_binding JSONB;
  expected_binding JSONB;
  expected_proposal JSONB;
  expected_envelope JSONB;
  expected_manifest_payload JSONB;
  replay_receipt JSONB;
  actual_keys TEXT[];
  routine_signatures TEXT[];
  input_key TEXT;
  forbidden_key TEXT;
  computed_bundle_digest TEXT;
  computed_binding_digest TEXT;
  computed_grants_digest TEXT;
  binding_canonical_json TEXT;
  grants_canonical_json TEXT;
  tenant_id TEXT;
  existing_command_id TEXT;
  current_database_oid BIGINT;
  observed_at TIMESTAMP(3) WITH TIME ZONE;
  manifest_issued_at TIMESTAMP(3) WITH TIME ZONE;
  manifest_valid_until TIMESTAMP(3) WITH TIME ZONE;
  imported_at TIMESTAMP(3) WITH TIME ZONE;
  imported_transaction_id TEXT;
  import_receipt_base JSONB;
  import_receipt JSONB;
  import_receipt_digest TEXT;
  conflict_count INTEGER;
  manifest_conflict_count INTEGER;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  existing_command public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  manifest_record public."IdentityMailDutyRoleManifestEvidenceV2"%ROWTYPE;
  existing_manifest public."IdentityMailDutyRoleManifestEvidenceV2"%ROWTYPE;
BEGIN
  IF p_bundle_canonical_json IS NULL
     OR p_bundle_digest IS NULL
     OR pg_catalog.octet_length(p_bundle_canonical_json) NOT BETWEEN 2 AND 262144
     OR p_bundle_canonical_json IS DISTINCT FROM pg_catalog.btrim(
       p_bundle_canonical_json COLLATE "C"
     )
     OR (p_bundle_canonical_json COLLATE "C") ~ '[[:space:]]'
     OR (p_bundle_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BUNDLE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  computed_bundle_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORT_BUNDLE_V2_V1'
          || E'\n' || p_bundle_canonical_json || E'\n',
        'UTF8'
      )
    ),
    'hex'
  );

  IF computed_bundle_digest IS DISTINCT FROM p_bundle_digest THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BUNDLE_DIGEST_INVALID'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    bundle := p_bundle_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BUNDLE_JSON_INVALID'
      USING ERRCODE = '22023';
  END;

  IF pg_catalog.jsonb_typeof(bundle) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BUNDLE_SHAPE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(bundle_key ORDER BY bundle_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(bundle) AS keys(bundle_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'authorization',
       'binding',
       'canMutate',
       'canSend',
       'commandDatabaseArguments',
       'commandEvidence',
       'contract',
       'exactGrantsProjection',
       'manifestEvidence',
       'profile',
       'schemaVersion'
     ]::TEXT[]
     OR bundle->>'contract' IS DISTINCT FROM
       'IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2'
     OR bundle->>'profile' IS DISTINCT FROM
       'IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_IMPORTER_V2_PROFILE_V1'
     OR bundle->'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR bundle->'authorization' IS DISTINCT FROM 'false'::JSONB
     OR bundle->'canMutate' IS DISTINCT FROM 'false'::JSONB
     OR bundle->'canSend' IS DISTINCT FROM 'false'::JSONB
     OR pg_catalog.jsonb_typeof(bundle->'binding') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(bundle->'commandDatabaseArguments')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(bundle->'commandEvidence')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(bundle->'manifestEvidence')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(bundle->'exactGrantsProjection')
       IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BUNDLE_SHAPE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  FOREACH forbidden_key IN ARRAY ARRAY[
    'accesstoken',
    'emailaddress',
    'messageid',
    'password',
    'phonenumber',
    'providerpayload',
    'providermessageid',
    'rawemail',
    'refreshtoken',
    'secretciphertext',
    'tokenhash'
  ]::TEXT[]
  LOOP
    IF pg_catalog.strpos(
         pg_catalog.lower(p_bundle_canonical_json),
         '"' || forbidden_key || '":'
       ) > 0
       OR pg_catalog.strpos(
         pg_catalog.lower(p_bundle_canonical_json),
         '\"' || forbidden_key || '\":'
       ) > 0
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_PII_KEY_FORBIDDEN'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF pg_catalog.strpos(p_bundle_canonical_json, '@') > 0 THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_PII_VALUE_FORBIDDEN'
      USING ERRCODE = '22023';
  END IF;

  binding := bundle->'binding';
  command_arguments := bundle->'commandDatabaseArguments';
  command_evidence := bundle->'commandEvidence';
  manifest_evidence := bundle->'manifestEvidence';
  grants_projection := bundle->'exactGrantsProjection';

  SELECT pg_catalog.array_agg(binding_key ORDER BY binding_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(binding) AS keys(binding_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'action',
       'actualContextDigest',
       'applicationArtifactSha256',
       'applicationContract',
       'applicationReleaseSha',
       'authorization',
       'authorizationEnvelopeDigest',
       'bindingDigest',
       'canMutate',
       'canSend',
       'commandId',
       'commandPublicKeyFingerprint',
       'commandSigningKeyId',
       'contract',
       'coordinatorRoleName',
       'coordinatorRoleOid',
       'databaseIdentityDigest',
       'databaseName',
       'databaseOid',
       'deploymentMarkerDigest',
       'deploymentMarkerId',
       'exactGrantsDigest',
       'exactGrantsProfile',
       'intent',
       'manifestId',
       'manifestPayloadDigest',
       'manifestPublicKeyFingerprint',
       'manifestRevision',
       'manifestSigningKeyId',
       'predecessorManifestDigest',
       'profile',
       'requestId',
       'schemaVersion',
       'tenantId',
       'workerRoleName',
       'workerRoleOid'
     ]::TEXT[]
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BINDING_SHAPE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(argument_key ORDER BY argument_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(command_arguments) AS keys(argument_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'action',
       'actorDigest',
       'actualContextDigest',
       'authorizationEnvelopeCanonicalJson',
       'authorizationEnvelopeDigest',
       'contractVersion',
       'databaseIdentityDigest',
       'deploymentMarkerDigest',
       'deploymentMarkerId',
       'drainStateRevision',
       'dutyApplicationArtifactSha256',
       'dutyApplicationContract',
       'dutyApplicationReleaseSha',
       'dutyCoordinatorRoleName',
       'dutyCoordinatorRoleOid',
       'dutyExactGrantsDigest',
       'dutyExactGrantsProfile',
       'dutyManifestContract',
       'dutyManifestId',
       'dutyManifestPayloadDigest',
       'dutyManifestProfile',
       'dutyManifestPublicKeyFingerprint',
       'dutyManifestRevision',
       'dutyManifestSigningKeyId',
       'dutyPredecessorManifestDigest',
       'dutyWorkerRoleName',
       'dutyWorkerRoleOid',
       'expectedDatabaseName',
       'expectedDatabaseOid',
       'expectedPolicyRevision',
       'expectedState',
       'expiresAt',
       'finalStateRevision',
       'id',
       'intent',
       'nextPolicyRevision',
       'previousAcknowledgeSeconds',
       'previousBaseRetrySeconds',
       'previousConfigurationDigest',
       'previousLeaseSeconds',
       'previousMaxAttempts',
       'previousMaxRetrySeconds',
       'previousProviderAuthorityDigest',
       'previousWorkerRoleName',
       'previousWorkerRoleOid',
       'proposalCanonicalJson',
       'proposalContentDigest',
       'publicKeyFingerprint',
       'releaseSha',
       'requestId',
       'requestedAt',
       'rollbackOfCommandId',
       'runtimeConfigDigest',
       'signatureAlgorithm',
       'signatureBase64url',
       'signatureDomain',
       'signingKeyId',
       'stateRevisionBefore',
       'targetAcknowledgeSeconds',
       'targetBaseRetrySeconds',
       'targetConfigurationDigest',
       'targetLeaseSeconds',
       'targetMaxAttempts',
       'targetMaxRetrySeconds',
       'targetProviderAuthorityDigest',
       'targetState',
       'targetWorkerRoleName',
       'targetWorkerRoleOid',
       'tenantId'
     ]::TEXT[]
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_ARGUMENTS_INVALID'
      USING ERRCODE = '22023';
  END IF;

  FOREACH input_key IN ARRAY ARRAY[
    'action', 'actorDigest', 'actualContextDigest',
    'authorizationEnvelopeCanonicalJson', 'authorizationEnvelopeDigest',
    'contractVersion', 'databaseIdentityDigest', 'deploymentMarkerDigest',
    'deploymentMarkerId', 'dutyApplicationArtifactSha256',
    'dutyApplicationContract', 'dutyApplicationReleaseSha',
    'dutyCoordinatorRoleName', 'dutyExactGrantsDigest',
    'dutyExactGrantsProfile', 'dutyManifestContract', 'dutyManifestId',
    'dutyManifestPayloadDigest', 'dutyManifestProfile',
    'dutyManifestPublicKeyFingerprint', 'dutyManifestSigningKeyId',
    'dutyPredecessorManifestDigest', 'dutyWorkerRoleName',
    'expectedDatabaseName', 'expectedState', 'expiresAt', 'id', 'intent',
    'proposalCanonicalJson', 'proposalContentDigest', 'publicKeyFingerprint',
    'releaseSha', 'requestedAt', 'requestId', 'runtimeConfigDigest',
    'signatureAlgorithm', 'signatureBase64url', 'signatureDomain',
    'signingKeyId', 'targetConfigurationDigest',
    'targetProviderAuthorityDigest', 'targetState', 'targetWorkerRoleName',
    'tenantId'
  ]::TEXT[]
  LOOP
    IF pg_catalog.jsonb_typeof(command_arguments->input_key)
         IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_TYPE_INVALID'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH input_key IN ARRAY ARRAY[
    'dutyCoordinatorRoleOid', 'dutyManifestRevision', 'dutyWorkerRoleOid',
    'expectedDatabaseOid', 'expectedPolicyRevision', 'finalStateRevision',
    'nextPolicyRevision', 'stateRevisionBefore', 'targetAcknowledgeSeconds',
    'targetBaseRetrySeconds', 'targetLeaseSeconds', 'targetMaxAttempts',
    'targetMaxRetrySeconds', 'targetWorkerRoleOid'
  ]::TEXT[]
  LOOP
    IF pg_catalog.jsonb_typeof(command_arguments->input_key)
         IS DISTINCT FROM 'number'
       OR (command_arguments->>input_key COLLATE "C") !~ '^(0|[1-9][0-9]*)$'
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_TYPE_INVALID'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH input_key IN ARRAY ARRAY[
    'rollbackOfCommandId', 'previousConfigurationDigest',
    'previousProviderAuthorityDigest', 'previousWorkerRoleName'
  ]::TEXT[]
  LOOP
    IF pg_catalog.jsonb_typeof(command_arguments->input_key)
         NOT IN ('null', 'string')
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_TYPE_INVALID'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH input_key IN ARRAY ARRAY[
    'drainStateRevision', 'previousAcknowledgeSeconds',
    'previousBaseRetrySeconds', 'previousLeaseSeconds',
    'previousMaxAttempts', 'previousMaxRetrySeconds',
    'previousWorkerRoleOid'
  ]::TEXT[]
  LOOP
    IF pg_catalog.jsonb_typeof(command_arguments->input_key) = 'number'
       AND (command_arguments->>input_key COLLATE "C") ~
         '^(0|[1-9][0-9]*)$'
    THEN
      CONTINUE;
    END IF;
    IF pg_catalog.jsonb_typeof(command_arguments->input_key) <> 'null' THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_TYPE_INVALID'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  BEGIN
    command_record."id" := command_arguments->>'id';
    command_record."tenantId" := command_arguments->>'tenantId';
    command_record."requestId" := command_arguments->>'requestId';
    command_record."action" := command_arguments->>'action';
    command_record."intent" := command_arguments->>'intent';
    command_record."contractVersion" := command_arguments->>'contractVersion';
    command_record."signatureDomain" := command_arguments->>'signatureDomain';
    command_record."rollbackOfCommandId" := command_arguments->>'rollbackOfCommandId';
    command_record."proposalContentDigest" := command_arguments->>'proposalContentDigest';
    command_record."proposalCanonicalJson" := command_arguments->>'proposalCanonicalJson';
    command_record."authorizationEnvelopeDigest" := command_arguments->>'authorizationEnvelopeDigest';
    command_record."authorizationEnvelopeCanonicalJson" := command_arguments->>'authorizationEnvelopeCanonicalJson';
    command_record."expectedState" := command_arguments->>'expectedState';
    command_record."targetState" := command_arguments->>'targetState';
    command_record."expectedPolicyRevision" := (command_arguments->>'expectedPolicyRevision')::INTEGER;
    command_record."nextPolicyRevision" := (command_arguments->>'nextPolicyRevision')::INTEGER;
    command_record."stateRevisionBefore" := (command_arguments->>'stateRevisionBefore')::BIGINT;
    command_record."drainStateRevision" := (command_arguments->>'drainStateRevision')::BIGINT;
    command_record."finalStateRevision" := (command_arguments->>'finalStateRevision')::BIGINT;
    command_record."previousWorkerRoleName" := command_arguments->>'previousWorkerRoleName';
    command_record."previousWorkerRoleOid" := (command_arguments->>'previousWorkerRoleOid')::BIGINT;
    command_record."previousProviderAuthorityDigest" := command_arguments->>'previousProviderAuthorityDigest';
    command_record."previousMaxAttempts" := (command_arguments->>'previousMaxAttempts')::INTEGER;
    command_record."previousLeaseSeconds" := (command_arguments->>'previousLeaseSeconds')::INTEGER;
    command_record."previousAcknowledgeSeconds" := (command_arguments->>'previousAcknowledgeSeconds')::INTEGER;
    command_record."previousBaseRetrySeconds" := (command_arguments->>'previousBaseRetrySeconds')::INTEGER;
    command_record."previousMaxRetrySeconds" := (command_arguments->>'previousMaxRetrySeconds')::INTEGER;
    command_record."previousConfigurationDigest" := command_arguments->>'previousConfigurationDigest';
    command_record."targetWorkerRoleName" := command_arguments->>'targetWorkerRoleName';
    command_record."targetWorkerRoleOid" := (command_arguments->>'targetWorkerRoleOid')::BIGINT;
    command_record."targetProviderAuthorityDigest" := command_arguments->>'targetProviderAuthorityDigest';
    command_record."targetMaxAttempts" := (command_arguments->>'targetMaxAttempts')::INTEGER;
    command_record."targetLeaseSeconds" := (command_arguments->>'targetLeaseSeconds')::INTEGER;
    command_record."targetAcknowledgeSeconds" := (command_arguments->>'targetAcknowledgeSeconds')::INTEGER;
    command_record."targetBaseRetrySeconds" := (command_arguments->>'targetBaseRetrySeconds')::INTEGER;
    command_record."targetMaxRetrySeconds" := (command_arguments->>'targetMaxRetrySeconds')::INTEGER;
    command_record."targetConfigurationDigest" := command_arguments->>'targetConfigurationDigest';
    command_record."runtimeConfigDigest" := command_arguments->>'runtimeConfigDigest';
    command_record."expectedDatabaseName" := command_arguments->>'expectedDatabaseName';
    command_record."expectedDatabaseOid" := (command_arguments->>'expectedDatabaseOid')::BIGINT;
    command_record."databaseIdentityDigest" := command_arguments->>'databaseIdentityDigest';
    command_record."deploymentMarkerId" := command_arguments->>'deploymentMarkerId';
    command_record."deploymentMarkerDigest" := command_arguments->>'deploymentMarkerDigest';
    command_record."actualContextDigest" := command_arguments->>'actualContextDigest';
    command_record."releaseSha" := command_arguments->>'releaseSha';
    command_record."actorDigest" := command_arguments->>'actorDigest';
    command_record."signatureAlgorithm" := command_arguments->>'signatureAlgorithm';
    command_record."signingKeyId" := command_arguments->>'signingKeyId';
    command_record."publicKeyFingerprint" := command_arguments->>'publicKeyFingerprint';
    command_record."signatureBase64url" := command_arguments->>'signatureBase64url';
    command_record."requestedAt" := (command_arguments->>'requestedAt')::TIMESTAMPTZ;
    command_record."expiresAt" := (command_arguments->>'expiresAt')::TIMESTAMPTZ;
    command_record."dutyManifestContract" := command_arguments->>'dutyManifestContract';
    command_record."dutyManifestProfile" := command_arguments->>'dutyManifestProfile';
    command_record."dutyManifestId" := command_arguments->>'dutyManifestId';
    command_record."dutyManifestRevision" := (command_arguments->>'dutyManifestRevision')::INTEGER;
    command_record."dutyManifestPayloadDigest" := command_arguments->>'dutyManifestPayloadDigest';
    command_record."dutyManifestSigningKeyId" := command_arguments->>'dutyManifestSigningKeyId';
    command_record."dutyManifestPublicKeyFingerprint" := command_arguments->>'dutyManifestPublicKeyFingerprint';
    command_record."dutyCoordinatorRoleName" := command_arguments->>'dutyCoordinatorRoleName';
    command_record."dutyCoordinatorRoleOid" := (command_arguments->>'dutyCoordinatorRoleOid')::BIGINT;
    command_record."dutyWorkerRoleName" := command_arguments->>'dutyWorkerRoleName';
    command_record."dutyWorkerRoleOid" := (command_arguments->>'dutyWorkerRoleOid')::BIGINT;
    command_record."dutyExactGrantsProfile" := command_arguments->>'dutyExactGrantsProfile';
    command_record."dutyExactGrantsDigest" := command_arguments->>'dutyExactGrantsDigest';
    command_record."dutyPredecessorManifestDigest" := command_arguments->>'dutyPredecessorManifestDigest';
    command_record."dutyApplicationContract" := command_arguments->>'dutyApplicationContract';
    command_record."dutyApplicationReleaseSha" := command_arguments->>'dutyApplicationReleaseSha';
    command_record."dutyApplicationArtifactSha256" := command_arguments->>'dutyApplicationArtifactSha256';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_CAST_INVALID'
      USING ERRCODE = '22023';
  END;

  SELECT pg_catalog.array_agg(evidence_key ORDER BY evidence_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(command_evidence) AS keys(evidence_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'authorityDomain',
       'authorizationEnvelopeCanonicalJson',
       'authorizationEnvelopeDigest',
       'contract',
       'expiresAt',
       'proposalCanonicalJson',
       'proposalContentDigest',
       'publicKeyFingerprint',
       'requestedAt',
       'schemaVersion',
       'signatureAlgorithm',
       'signatureBase64url',
       'signingKeyId'
     ]::TEXT[]
     OR command_evidence->'schemaVersion' IS DISTINCT FROM '2'::JSONB
     OR command_evidence->>'authorityDomain' IS DISTINCT FROM
       command_record."signatureDomain"::TEXT
     OR command_evidence->>'contract' IS DISTINCT FROM
       command_record."contractVersion"::TEXT
     OR command_evidence->>'proposalCanonicalJson' IS DISTINCT FROM
       command_record."proposalCanonicalJson"
     OR command_evidence->>'proposalContentDigest' IS DISTINCT FROM
       command_record."proposalContentDigest"
     OR command_evidence->>'authorizationEnvelopeCanonicalJson'
       IS DISTINCT FROM command_record."authorizationEnvelopeCanonicalJson"
     OR command_evidence->>'authorizationEnvelopeDigest' IS DISTINCT FROM
       command_record."authorizationEnvelopeDigest"
     OR command_evidence->>'signatureBase64url' IS DISTINCT FROM
       command_record."signatureBase64url"
     OR command_evidence->>'signatureAlgorithm' IS DISTINCT FROM
       command_record."signatureAlgorithm"::TEXT
     OR command_evidence->>'signingKeyId' IS DISTINCT FROM
       command_record."signingKeyId"::TEXT
     OR command_evidence->>'publicKeyFingerprint' IS DISTINCT FROM
       command_record."publicKeyFingerprint"
     OR command_evidence->>'requestedAt' IS DISTINCT FROM
       command_arguments->>'requestedAt'
     OR command_evidence->>'expiresAt' IS DISTINCT FROM
       command_arguments->>'expiresAt'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_EVIDENCE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    proposal_payload := command_record."proposalCanonicalJson"::JSONB;
    authorization_envelope :=
      command_record."authorizationEnvelopeCanonicalJson"::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_CANONICAL_JSON_INVALID'
      USING ERRCODE = '22023';
  END;

  duty_binding := pg_catalog.jsonb_build_object(
    'applicationArtifactSha256',
      command_record."dutyApplicationArtifactSha256",
    'applicationContract', command_record."dutyApplicationContract"::TEXT,
    'applicationReleaseSha', command_record."dutyApplicationReleaseSha",
    'coordinatorRoleName', command_record."dutyCoordinatorRoleName"::TEXT,
    'coordinatorRoleOid', command_record."dutyCoordinatorRoleOid",
    'exactGrantsDigest', command_record."dutyExactGrantsDigest",
    'exactGrantsProfile', command_record."dutyExactGrantsProfile"::TEXT,
    'manifestContract', command_record."dutyManifestContract"::TEXT,
    'manifestId', command_record."dutyManifestId",
    'manifestPayloadDigest', command_record."dutyManifestPayloadDigest",
    'manifestProfile', command_record."dutyManifestProfile"::TEXT,
    'manifestPublicKeyFingerprint',
      command_record."dutyManifestPublicKeyFingerprint",
    'manifestRevision', command_record."dutyManifestRevision",
    'manifestSigningKeyId',
      command_record."dutyManifestSigningKeyId"::TEXT,
    'predecessorManifestDigest',
      command_record."dutyPredecessorManifestDigest",
    'workerRoleName', command_record."dutyWorkerRoleName"::TEXT,
    'workerRoleOid', command_record."dutyWorkerRoleOid"
  );

  expected_proposal := pg_catalog.jsonb_build_object(
    'action', command_record."action"::TEXT,
    'authorization', false,
    'canMutate', false,
    'contract', command_record."contractVersion"::TEXT,
    'deploymentMarkerDigest', command_record."deploymentMarkerDigest",
    'dutyRoleBinding', duty_binding,
    'expectedDatabaseName', command_record."expectedDatabaseName"::TEXT,
    'expectedDatabaseOid', command_record."expectedDatabaseOid",
    'expectedRevision', command_record."expectedPolicyRevision",
    'expectedState', command_record."expectedState"::TEXT,
    'expiresAt', command_arguments->>'expiresAt',
    'nextRevision', command_record."nextPolicyRevision",
    'policy', pg_catalog.jsonb_build_object(
      'acknowledgeSeconds', command_record."targetAcknowledgeSeconds",
      'baseRetrySeconds', command_record."targetBaseRetrySeconds",
      'leaseSeconds', command_record."targetLeaseSeconds",
      'maxAttempts', command_record."targetMaxAttempts",
      'maxRetrySeconds', command_record."targetMaxRetrySeconds"
    ),
    'providerAuthorityDigest', command_record."targetProviderAuthorityDigest",
    'releaseSha', command_record."releaseSha",
    'requestId', command_record."requestId",
    'requestedAt', command_arguments->>'requestedAt',
    'runtimeConfigDigest', command_record."runtimeConfigDigest",
    'tenantId', command_record."tenantId",
    'workerRoleName', command_record."targetWorkerRoleName"::TEXT,
    'workerRoleOid', command_record."targetWorkerRoleOid"
  );

  expected_envelope := pg_catalog.jsonb_build_object(
    'action', command_record."action"::TEXT,
    'actorDigest', command_record."actorDigest",
    'actualContextDigest', command_record."actualContextDigest",
    'authorityDomain', command_record."signatureDomain"::TEXT,
    'authorization', true,
    'canMutate', true,
    'commandId', command_record."id",
    'contract', command_record."contractVersion"::TEXT,
    'databaseIdentityDigest', command_record."databaseIdentityDigest",
    'deploymentMarkerDigest', command_record."deploymentMarkerDigest",
    'deploymentMarkerId', command_record."deploymentMarkerId",
    'drainStateRevision', command_record."drainStateRevision",
    'dutyRoleBinding', duty_binding,
    'expectedDatabaseName', command_record."expectedDatabaseName"::TEXT,
    'expectedDatabaseOid', command_record."expectedDatabaseOid",
    'expectedPolicyRevision', command_record."expectedPolicyRevision",
    'expectedState', command_record."expectedState"::TEXT,
    'expiresAt', command_arguments->>'expiresAt',
    'finalStateRevision', command_record."finalStateRevision",
    'intent', command_record."intent"::TEXT,
    'nextPolicyRevision', command_record."nextPolicyRevision",
    'previousConfiguration',
      CASE
        WHEN command_record."expectedState" = 'ABSENT' THEN 'null'::JSONB
        ELSE pg_catalog.jsonb_build_object(
          'acknowledgeSeconds', command_record."previousAcknowledgeSeconds",
          'baseRetrySeconds', command_record."previousBaseRetrySeconds",
          'configurationDigest', command_record."previousConfigurationDigest",
          'leaseSeconds', command_record."previousLeaseSeconds",
          'maxAttempts', command_record."previousMaxAttempts",
          'maxRetrySeconds', command_record."previousMaxRetrySeconds",
          'providerAuthorityDigest',
            command_record."previousProviderAuthorityDigest",
          'workerRoleName', command_record."previousWorkerRoleName"::TEXT,
          'workerRoleOid', command_record."previousWorkerRoleOid"
        )
      END,
    'proposalContentDigest', command_record."proposalContentDigest",
    'publicKeyFingerprint', command_record."publicKeyFingerprint",
    'releaseSha', command_record."releaseSha",
    'requestId', command_record."requestId",
    'requestedAt', command_arguments->>'requestedAt',
    'rollbackOfCommandId', command_record."rollbackOfCommandId",
    'runtimeConfigDigest', command_record."runtimeConfigDigest",
    'schemaVersion', 2,
    'signatureAlgorithm', command_record."signatureAlgorithm"::TEXT,
    'signingKeyId', command_record."signingKeyId"::TEXT,
    'stateRevisionBefore', command_record."stateRevisionBefore",
    'targetConfiguration', pg_catalog.jsonb_build_object(
      'acknowledgeSeconds', command_record."targetAcknowledgeSeconds",
      'baseRetrySeconds', command_record."targetBaseRetrySeconds",
      'configurationDigest', command_record."targetConfigurationDigest",
      'leaseSeconds', command_record."targetLeaseSeconds",
      'maxAttempts', command_record."targetMaxAttempts",
      'maxRetrySeconds', command_record."targetMaxRetrySeconds",
      'providerAuthorityDigest', command_record."targetProviderAuthorityDigest",
      'workerRoleName', command_record."targetWorkerRoleName"::TEXT,
      'workerRoleOid', command_record."targetWorkerRoleOid"
    ),
    'targetState', command_record."targetState"::TEXT,
    'tenantId', command_record."tenantId"
  );

  IF proposal_payload IS DISTINCT FROM expected_proposal
     OR authorization_envelope IS DISTINCT FROM expected_envelope
     OR command_record."proposalContentDigest" IS DISTINCT FROM
       pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(command_record."proposalCanonicalJson", 'UTF8')
         ),
         'hex'
       )
     OR command_record."authorizationEnvelopeDigest" IS DISTINCT FROM
       pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(
             command_record."signatureDomain"::TEXT || E'\n'
               || command_record."authorizationEnvelopeCanonicalJson"
               || E'\n',
             'UTF8'
           )
         ),
         'hex'
       )
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_CANONICAL_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  expected_binding := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'contract', 'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2',
    'profile', 'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_PROFILE_V1',
    'authorization', false,
    'canMutate', false,
    'canSend', false,
    'commandId', command_record."id",
    'tenantId', command_record."tenantId",
    'requestId', command_record."requestId",
    'action', command_record."action"::TEXT,
    'intent', command_record."intent"::TEXT,
    'authorizationEnvelopeDigest',
      command_record."authorizationEnvelopeDigest",
    'manifestId', command_record."dutyManifestId",
    'manifestRevision', command_record."dutyManifestRevision",
    'manifestPayloadDigest', command_record."dutyManifestPayloadDigest",
    'databaseName', command_record."expectedDatabaseName"::TEXT,
    'databaseOid', command_record."expectedDatabaseOid",
    'databaseIdentityDigest', command_record."databaseIdentityDigest",
    'deploymentMarkerId', command_record."deploymentMarkerId",
    'deploymentMarkerDigest', command_record."deploymentMarkerDigest",
    'actualContextDigest', command_record."actualContextDigest",
    'coordinatorRoleName', command_record."dutyCoordinatorRoleName"::TEXT,
    'coordinatorRoleOid', command_record."dutyCoordinatorRoleOid",
    'workerRoleName', command_record."dutyWorkerRoleName"::TEXT,
    'workerRoleOid', command_record."dutyWorkerRoleOid",
    'exactGrantsProfile', command_record."dutyExactGrantsProfile"::TEXT,
    'exactGrantsDigest', command_record."dutyExactGrantsDigest",
    'predecessorManifestDigest',
      command_record."dutyPredecessorManifestDigest",
    'applicationContract', command_record."dutyApplicationContract"::TEXT,
    'applicationReleaseSha', command_record."dutyApplicationReleaseSha",
    'applicationArtifactSha256',
      command_record."dutyApplicationArtifactSha256",
    'commandSigningKeyId', command_record."signingKeyId"::TEXT,
    'commandPublicKeyFingerprint', command_record."publicKeyFingerprint",
    'manifestSigningKeyId',
      command_record."dutyManifestSigningKeyId"::TEXT,
    'manifestPublicKeyFingerprint',
      command_record."dutyManifestPublicKeyFingerprint",
    'bindingDigest', binding->>'bindingDigest'
  );

  IF binding IS DISTINCT FROM expected_binding THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BINDING_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    '{' || pg_catalog.string_agg(
      pg_catalog.to_json(binding_key)::TEXT || ':' || binding_value::TEXT,
      ',' ORDER BY binding_key COLLATE "C"
    ) || '}'
  INTO binding_canonical_json
  FROM pg_catalog.jsonb_each(binding - 'bindingDigest')
    AS entries(binding_key, binding_value);

  computed_binding_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2_V1'
          || E'\n' || binding_canonical_json || E'\n',
        'UTF8'
      )
    ),
    'hex'
  );

  IF computed_binding_digest IS DISTINCT FROM binding->>'bindingDigest' THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_BINDING_DIGEST_INVALID'
      USING ERRCODE = '22023';
  END IF;

  grants_canonical_json := pg_catalog.substring(
    p_bundle_canonical_json,
    E'"exactGrantsProjection":(\\{.*\\}),"manifestEvidence":'
  );

  IF grants_canonical_json IS NULL
     OR pg_catalog.octet_length(grants_canonical_json) NOT BETWEEN 2 AND 131072
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_CANONICAL_INVALID'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF grants_canonical_json::JSONB IS DISTINCT FROM grants_projection THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_CANONICAL_MISMATCH'
        USING ERRCODE = '22023';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_CANONICAL_INVALID'
      USING ERRCODE = '22023';
  END;

  computed_grants_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1'
          || E'\n' || grants_canonical_json || E'\n',
        'UTF8'
      )
    ),
    'hex'
  );

  IF computed_grants_digest IS DISTINCT FROM
       command_record."dutyExactGrantsDigest"
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_DIGEST_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(grants_key ORDER BY grants_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(grants_projection)
    AS keys(grants_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'contract',
       'database',
       'databaseRoleSettings',
       'defaultAcls',
       'effectivePrivileges',
       'memberships',
       'nonOwnerRoutineAcls',
       'profile',
       'roleSettings',
       'roles',
       'routines',
       'schema',
       'schemaVersion',
       'supportAcls',
       'unexpectedDutyRoleOwnerships'
     ]::TEXT[]
     OR grants_projection->'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR grants_projection->>'contract' IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1'
     OR grants_projection->>'profile' IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
     OR pg_catalog.jsonb_typeof(grants_projection->'database')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(grants_projection->'schema')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(grants_projection->'roles')
       IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(grants_projection->'routines')
       IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(grants_projection->'nonOwnerRoutineAcls')
       IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(grants_projection->'supportAcls')
       IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(grants_projection->'effectivePrivileges')
       IS DISTINCT FROM 'array'
     OR grants_projection->'databaseRoleSettings' IS DISTINCT FROM '[]'::JSONB
     OR grants_projection->'defaultAcls' IS DISTINCT FROM '[]'::JSONB
     OR grants_projection->'memberships' IS DISTINCT FROM '[]'::JSONB
     OR grants_projection->'roleSettings' IS DISTINCT FROM '[]'::JSONB
     OR grants_projection->'unexpectedDutyRoleOwnerships'
       IS DISTINCT FROM '[]'::JSONB
     OR pg_catalog.jsonb_array_length(grants_projection->'routines') <> 6
     OR pg_catalog.jsonb_array_length(
       grants_projection->'nonOwnerRoutineAcls'
     ) <> 6
     OR pg_catalog.jsonb_array_length(grants_projection->'supportAcls') <> 3
     OR pg_catalog.jsonb_array_length(
       grants_projection->'effectivePrivileges'
     ) <> 10
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_SHAPE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(database_key ORDER BY database_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(grants_projection->'database')
    AS keys(database_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'identityDigest', 'name', 'oid', 'ownerName', 'ownerOid'
     ]::TEXT[]
     OR grants_projection#>>'{database,name}' IS DISTINCT FROM
       command_record."expectedDatabaseName"::TEXT
     OR grants_projection#>>'{database,identityDigest}' IS DISTINCT FROM
       command_record."databaseIdentityDigest"
     OR (grants_projection#>>'{database,oid}')::BIGINT IS DISTINCT FROM
       command_record."expectedDatabaseOid"
     OR grants_projection#>>'{database,ownerName}' IS DISTINCT FROM
       'leetplus_database_owner'
     OR (grants_projection#>>'{database,ownerOid}' COLLATE "C") !~
       '^[1-9][0-9]{0,9}$'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_DATABASE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(schema_key ORDER BY schema_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(grants_projection->'schema')
    AS keys(schema_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'name', 'oid', 'ownerName', 'ownerOid'
     ]::TEXT[]
     OR grants_projection#>>'{schema,name}' IS DISTINCT FROM 'public'
     OR grants_projection#>>'{schema,ownerName}' IS DISTINCT FROM
       'identity_mail_schema_owner'
     OR (grants_projection#>>'{schema,oid}' COLLATE "C") !~
       '^[1-9][0-9]{0,9}$'
     OR (grants_projection#>>'{schema,ownerOid}' COLLATE "C") !~
       '^[1-9][0-9]{0,9}$'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_SCHEMA_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(role_key ORDER BY role_key COLLATE "C")
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(grants_projection->'roles')
    AS keys(role_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'coordinator', 'schemaOwner', 'worker'
     ]::TEXT[]
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_each(grants_projection->'roles') AS role_entry(
         role_kind,
         role_value
       )
       CROSS JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           role_attribute ORDER BY role_attribute COLLATE "C"
         ) AS role_keys
         FROM pg_catalog.jsonb_object_keys(role_entry.role_value)
           AS role_attributes(role_attribute)
       ) AS role_shape
       WHERE pg_catalog.jsonb_typeof(role_entry.role_value) <> 'object'
          OR role_shape.role_keys IS DISTINCT FROM ARRAY[
            'bypassRls', 'canLogin', 'connectionLimit', 'createDatabase',
            'createRole', 'inherit', 'name', 'oid', 'replication',
            'superuser', 'validUntil'
          ]::TEXT[]
          OR role_entry.role_value->'bypassRls' <> 'false'::JSONB
          OR role_entry.role_value->'connectionLimit' <> '-1'::JSONB
          OR role_entry.role_value->'createDatabase' <> 'false'::JSONB
          OR role_entry.role_value->'createRole' <> 'false'::JSONB
          OR role_entry.role_value->'inherit' <> 'false'::JSONB
          OR role_entry.role_value->'replication' <> 'false'::JSONB
          OR role_entry.role_value->'superuser' <> 'false'::JSONB
          OR role_entry.role_value->'validUntil' <> 'null'::JSONB
     )
     OR grants_projection#>>'{roles,coordinator,name}' IS DISTINCT FROM
       command_record."dutyCoordinatorRoleName"::TEXT
     OR (grants_projection#>>'{roles,coordinator,oid}')::BIGINT
       IS DISTINCT FROM command_record."dutyCoordinatorRoleOid"
     OR grants_projection#>'{roles,coordinator,canLogin}' <> 'true'::JSONB
     OR grants_projection#>>'{roles,worker,name}' IS DISTINCT FROM
       command_record."dutyWorkerRoleName"::TEXT
     OR (grants_projection#>>'{roles,worker,oid}')::BIGINT
       IS DISTINCT FROM command_record."dutyWorkerRoleOid"
     OR grants_projection#>'{roles,worker,canLogin}' <> 'true'::JSONB
     OR grants_projection#>>'{roles,schemaOwner,name}' IS DISTINCT FROM
       'identity_mail_schema_owner'
     OR grants_projection#>'{roles,schemaOwner,canLogin}' <> 'false'::JSONB
     OR grants_projection#>'{roles,schemaOwner,oid}' IS DISTINCT FROM
       grants_projection#>'{schema,ownerOid}'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_ROLES_INVALID'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(grants_projection->'routines')
         AS routine_entry(value)
       CROSS JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           routine_key ORDER BY routine_key COLLATE "C"
         ) AS routine_keys
         FROM pg_catalog.jsonb_object_keys(routine_entry.value)
           AS routine_keys(routine_key)
       ) AS shape
       WHERE pg_catalog.jsonb_typeof(routine_entry.value) <> 'object'
          OR shape.routine_keys IS DISTINCT FROM ARRAY[
            'language', 'oid', 'ownerName', 'ownerOid', 'parallelSafety',
            'returnType', 'searchPath', 'securityDefiner', 'signature',
            'volatility'
          ]::TEXT[]
          OR routine_entry.value->>'language' <> 'plpgsql'
          OR routine_entry.value->>'ownerName' <>
            'identity_mail_schema_owner'
          OR routine_entry.value->'ownerOid' IS DISTINCT FROM
            grants_projection#>'{schema,ownerOid}'
          OR (routine_entry.value->>'oid' COLLATE "C") !~
            '^[1-9][0-9]{0,9}$'
          OR routine_entry.value->>'parallelSafety' <> 'u'
          OR routine_entry.value->>'returnType' <> 'jsonb'
          OR routine_entry.value->>'searchPath' <> 'pg_catalog'
          OR routine_entry.value->'securityDefiner' <> 'true'::JSONB
          OR routine_entry.value->>'volatility' <> 'v'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         grants_projection->'nonOwnerRoutineAcls'
       ) AS acl_entry(value)
       CROSS JOIN LATERAL (
         SELECT pg_catalog.array_agg(acl_key ORDER BY acl_key COLLATE "C")
           AS acl_keys
         FROM pg_catalog.jsonb_object_keys(acl_entry.value)
           AS acl_keys(acl_key)
       ) AS shape
       WHERE pg_catalog.jsonb_typeof(acl_entry.value) <> 'object'
          OR shape.acl_keys IS DISTINCT FROM ARRAY[
            'granteeName', 'granteeOid', 'grantorName', 'grantorOid',
            'isGrantable', 'objectIdentity', 'objectKind', 'privilege'
          ]::TEXT[]
          OR acl_entry.value->>'grantorName' <> 'identity_mail_schema_owner'
          OR acl_entry.value->'grantorOid' IS DISTINCT FROM
            grants_projection#>'{schema,ownerOid}'
          OR acl_entry.value->'isGrantable' <> 'false'::JSONB
          OR acl_entry.value->>'objectKind' <> 'ROUTINE'
          OR acl_entry.value->>'privilege' <> 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(
         grants_projection->'effectivePrivileges'
       ) AS privilege_entry(value)
       CROSS JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           privilege_key ORDER BY privilege_key COLLATE "C"
         ) AS privilege_keys
         FROM pg_catalog.jsonb_object_keys(privilege_entry.value)
           AS privilege_keys(privilege_key)
       ) AS shape
       WHERE pg_catalog.jsonb_typeof(privilege_entry.value) <> 'object'
          OR shape.privilege_keys IS DISTINCT FROM ARRAY[
            'objectIdentity', 'objectKind', 'privilege', 'roleName',
            'roleOid'
          ]::TEXT[]
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(grants_projection->'supportAcls')
         AS acl_entry(value)
       CROSS JOIN LATERAL (
         SELECT pg_catalog.array_agg(acl_key ORDER BY acl_key COLLATE "C")
           AS acl_keys
         FROM pg_catalog.jsonb_object_keys(acl_entry.value)
           AS acl_keys(acl_key)
       ) AS shape
       WHERE pg_catalog.jsonb_typeof(acl_entry.value) <> 'object'
          OR shape.acl_keys IS DISTINCT FROM ARRAY[
            'granteeName', 'granteeOid', 'grantorName', 'grantorOid',
            'isGrantable', 'objectIdentity', 'objectKind', 'privilege'
          ]::TEXT[]
          OR acl_entry.value->'isGrantable' <> 'false'::JSONB
     )
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_ROWS_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(
    routine_entry.value->>'signature'
    ORDER BY routine_entry.value->>'signature' COLLATE "C"
  )
  INTO routine_signatures
  FROM pg_catalog.jsonb_array_elements(grants_projection->'routines')
    AS routine_entry(value);

  IF routine_signatures IS DISTINCT FROM ARRAY[
       'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
       'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
       'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
       'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
       'public."identity_mail_delivery_worker_assert_v2"(text,text)',
       'public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)'
     ]::TEXT[]
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_GRANTS_ROUTINES_INVALID'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(
    evidence_key ORDER BY evidence_key COLLATE "C"
  )
  INTO actual_keys
  FROM pg_catalog.jsonb_object_keys(manifest_evidence)
    AS keys(evidence_key);

  IF actual_keys IS DISTINCT FROM ARRAY[
       'contract', 'issuedAt', 'payloadCanonicalJson', 'payloadDigest',
       'profile', 'publicKeyFingerprint', 'purpose', 'schemaVersion',
       'signatureAlgorithm', 'signatureBase64url', 'signingKeyId',
       'trustDomain', 'validUntil'
     ]::TEXT[]
     OR manifest_evidence->'schemaVersion' IS DISTINCT FROM '2'::JSONB
     OR manifest_evidence->>'contract' IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_V2'
     OR manifest_evidence->>'profile' IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_MANIFEST_PROFILE_V2'
     OR manifest_evidence->>'trustDomain' IS DISTINCT FROM
       'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V2'
     OR manifest_evidence->>'purpose' IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_BINDING_V2'
     OR manifest_evidence->>'payloadDigest' IS DISTINCT FROM
       command_record."dutyManifestPayloadDigest"
     OR manifest_evidence->>'signingKeyId' IS DISTINCT FROM
       command_record."dutyManifestSigningKeyId"::TEXT
     OR manifest_evidence->>'publicKeyFingerprint' IS DISTINCT FROM
       command_record."dutyManifestPublicKeyFingerprint"
     OR manifest_evidence->>'signatureAlgorithm' IS DISTINCT FROM 'Ed25519'
     OR (manifest_evidence->>'signatureBase64url' COLLATE "C") !~
       '^[A-Za-z0-9_-]{86}$'
     OR pg_catalog.octet_length(
       manifest_evidence->>'payloadCanonicalJson'
     ) NOT BETWEEN 2 AND 131072
     OR manifest_evidence->>'payloadCanonicalJson' IS DISTINCT FROM
       pg_catalog.btrim(
         manifest_evidence->>'payloadCanonicalJson' COLLATE "C"
       )
     OR (manifest_evidence->>'payloadCanonicalJson' COLLATE "C") ~
       '[[:space:]]'
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_MANIFEST_EVIDENCE_INVALID'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    manifest_payload :=
      (manifest_evidence->>'payloadCanonicalJson')::JSONB;
    manifest_issued_at := (manifest_evidence->>'issuedAt')::TIMESTAMPTZ;
    manifest_valid_until := (manifest_evidence->>'validUntil')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_MANIFEST_CAST_INVALID'
      USING ERRCODE = '22023';
  END;

  expected_manifest_payload := pg_catalog.jsonb_build_object(
    'actualContextDigest', command_record."actualContextDigest",
    'authorization', false,
    'canMutate', false,
    'canSend', false,
    'chain', pg_catalog.jsonb_build_object(
      'head', pg_catalog.jsonb_build_object(
        'artifactSha256', command_record."dutyApplicationArtifactSha256",
        'contract', command_record."dutyApplicationContract"::TEXT,
        'kind', 'APPLICATION_BOUNDARY',
        'ordinal', 185,
        'releaseSha', command_record."dutyApplicationReleaseSha"
      ),
      'predecessor', pg_catalog.jsonb_build_object(
        'count', 184,
        'head',
          '20260802020000_identity_mail_worker_v2_lost_response_replay',
        'headChecksum',
          'd889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424',
        'manifestDigest',
          '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'
      )
    ),
    'contract', command_record."dutyManifestContract"::TEXT,
    'database', pg_catalog.jsonb_build_object(
      'identityDigest', command_record."databaseIdentityDigest",
      'name', command_record."expectedDatabaseName"::TEXT,
      'oid', command_record."expectedDatabaseOid"
    ),
    'deploymentMarkerDigest', command_record."deploymentMarkerDigest",
    'deploymentMarkerId', command_record."deploymentMarkerId",
    'exactGrants', pg_catalog.jsonb_build_object(
      'digest', command_record."dutyExactGrantsDigest",
      'profile', command_record."dutyExactGrantsProfile"::TEXT
    ),
    'issuedAt', manifest_evidence->>'issuedAt',
    'kind', 'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_MANIFEST',
    'manifestId', command_record."dutyManifestId",
    'manifestRevision', command_record."dutyManifestRevision",
    'profile', command_record."dutyManifestProfile"::TEXT,
    'publicKeyFingerprint',
      command_record."dutyManifestPublicKeyFingerprint",
    'purpose', 'IDENTITY_MAIL_DUTY_ROLE_BINDING_V2',
    'roles', pg_catalog.jsonb_build_object(
      'coordinator', pg_catalog.jsonb_build_object(
        'name', command_record."dutyCoordinatorRoleName"::TEXT,
        'oid', command_record."dutyCoordinatorRoleOid"
      ),
      'worker', pg_catalog.jsonb_build_object(
        'name', command_record."dutyWorkerRoleName"::TEXT,
        'oid', command_record."dutyWorkerRoleOid"
      )
    ),
    'schemaVersion', 2,
    'signingKeyId', command_record."dutyManifestSigningKeyId"::TEXT,
    'trustDomain', 'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_AUTHORITY_V2',
    'validUntil', manifest_evidence->>'validUntil'
  );

  IF manifest_payload IS DISTINCT FROM expected_manifest_payload
     OR manifest_evidence->>'payloadDigest' IS DISTINCT FROM
       pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(
             manifest_evidence->>'payloadCanonicalJson',
             'UTF8'
           )
         ),
         'hex'
       )
     OR manifest_issued_at IS DISTINCT FROM command_record."requestedAt"
     OR manifest_valid_until IS DISTINCT FROM command_record."expiresAt"
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_MANIFEST_PAYLOAD_INVALID'
      USING ERRCODE = '22023';
  END IF;

  command_record."compositionContract" := binding->>'contract';
  command_record."compositionProfile" := binding->>'profile';
  command_record."bindingCanonicalJson" := binding_canonical_json;
  command_record."bindingDigest" := binding->>'bindingDigest';
  command_record."bundleContract" := bundle->>'contract';
  command_record."bundleProfile" := bundle->>'profile';
  command_record."bundleCanonicalJson" := p_bundle_canonical_json;
  command_record."bundleDigest" := p_bundle_digest;

  manifest_record."payloadDigest" :=
    manifest_evidence->>'payloadDigest';
  manifest_record."manifestId" := command_record."dutyManifestId";
  manifest_record."manifestRevision" :=
    command_record."dutyManifestRevision";
  manifest_record."contractVersion" :=
    manifest_evidence->>'contract';
  manifest_record."profile" := manifest_evidence->>'profile';
  manifest_record."trustDomain" := manifest_evidence->>'trustDomain';
  manifest_record."purpose" := manifest_evidence->>'purpose';
  manifest_record."payloadCanonicalJson" :=
    manifest_evidence->>'payloadCanonicalJson';
  manifest_record."manifestEvidence" := manifest_evidence;
  manifest_record."signatureAlgorithm" :=
    manifest_evidence->>'signatureAlgorithm';
  manifest_record."signingKeyId" := manifest_evidence->>'signingKeyId';
  manifest_record."publicKeyFingerprint" :=
    manifest_evidence->>'publicKeyFingerprint';
  manifest_record."signatureBase64url" :=
    manifest_evidence->>'signatureBase64url';
  manifest_record."issuedAt" := manifest_issued_at;
  manifest_record."validUntil" := manifest_valid_until;
  manifest_record."databaseName" :=
    command_record."expectedDatabaseName";
  manifest_record."databaseOid" := command_record."expectedDatabaseOid";
  manifest_record."databaseIdentityDigest" :=
    command_record."databaseIdentityDigest";
  manifest_record."deploymentMarkerId" :=
    command_record."deploymentMarkerId";
  manifest_record."deploymentMarkerDigest" :=
    command_record."deploymentMarkerDigest";
  manifest_record."actualContextDigest" :=
    command_record."actualContextDigest";
  manifest_record."coordinatorRoleName" :=
    command_record."dutyCoordinatorRoleName";
  manifest_record."coordinatorRoleOid" :=
    command_record."dutyCoordinatorRoleOid";
  manifest_record."workerRoleName" :=
    command_record."dutyWorkerRoleName";
  manifest_record."workerRoleOid" := command_record."dutyWorkerRoleOid";
  manifest_record."exactGrantsProfile" :=
    command_record."dutyExactGrantsProfile";
  manifest_record."exactGrantsDigest" :=
    command_record."dutyExactGrantsDigest";
  manifest_record."exactGrantsProjection" := grants_projection;
  manifest_record."predecessorManifestDigest" :=
    command_record."dutyPredecessorManifestDigest";
  manifest_record."applicationContract" :=
    command_record."dutyApplicationContract";
  manifest_record."applicationReleaseSha" :=
    command_record."dutyApplicationReleaseSha";
  manifest_record."applicationArtifactSha256" :=
    command_record."dutyApplicationArtifactSha256";

  tenant_id := public."identity_mail_tenant_lock_v1"(
    command_record."tenantId"
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-evidence-bundle:v2:' || p_bundle_digest,
      185
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-duty-manifest:v2:'
        || manifest_record."payloadDigest",
      185
    )
  );

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.min(command."id")
  INTO conflict_count, existing_command_id
  FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
  WHERE command."id" = command_record."id"
     OR (
       command."tenantId" = tenant_id
       AND command."requestId" = command_record."requestId"
     )
     OR command."authorizationEnvelopeDigest" =
       command_record."authorizationEnvelopeDigest"
     OR command."bundleDigest" = p_bundle_digest;

  IF conflict_count > 0 THEN
    IF conflict_count <> 1 THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_IDENTITY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    SELECT command.*
    INTO STRICT existing_command
    FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
    WHERE command."id" = existing_command_id;

    IF (
      pg_catalog.to_jsonb(existing_command) - ARRAY[
        'signatureVerifiedAt',
        'acceptedAt',
        'acceptedTransactionId',
        'receipt',
        'receiptDigest',
        'importedAt',
        'importedTransactionId',
        'importReceipt',
        'importReceiptDigest'
      ]::TEXT[]
    ) IS DISTINCT FROM (
      pg_catalog.to_jsonb(command_record) - ARRAY[
        'signatureVerifiedAt',
        'acceptedAt',
        'acceptedTransactionId',
        'receipt',
        'receiptDigest',
        'importedAt',
        'importedTransactionId',
        'importReceipt',
        'importReceiptDigest'
      ]::TEXT[]
    )
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_COMMAND_IDENTITY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    replay_receipt := existing_command."importReceipt"
      || pg_catalog.jsonb_build_object('decision', 'IMPORT_REPLAY');

    RETURN replay_receipt;
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO manifest_conflict_count
  FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest
  WHERE manifest."payloadDigest" = manifest_record."payloadDigest"
     OR (
       manifest."manifestId" = manifest_record."manifestId"
       AND manifest."manifestRevision" = manifest_record."manifestRevision"
     );

  IF manifest_conflict_count > 1 THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_MANIFEST_IDENTITY_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF manifest_conflict_count = 1 THEN
    SELECT manifest.*
    INTO STRICT existing_manifest
    FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest
    WHERE manifest."payloadDigest" = manifest_record."payloadDigest"
       OR (
         manifest."manifestId" = manifest_record."manifestId"
         AND manifest."manifestRevision" = manifest_record."manifestRevision"
       );

    IF (
      pg_catalog.to_jsonb(existing_manifest) - ARRAY[
        'importedCommandId',
        'importedAt',
        'importedTransactionId',
        'importReceiptDigest'
      ]::TEXT[]
    ) IS DISTINCT FROM (
      pg_catalog.to_jsonb(manifest_record) - ARRAY[
        'importedCommandId',
        'importedAt',
        'importedTransactionId',
        'importReceiptDigest'
      ]::TEXT[]
    )
    THEN
      RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_MANIFEST_IDENTITY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  observed_at := pg_catalog.clock_timestamp();

  SELECT database_entry.oid::BIGINT
  INTO current_database_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  IF command_record."expectedDatabaseName"::TEXT IS DISTINCT FROM
       pg_catalog.current_database()
     OR command_record."expectedDatabaseOid" IS DISTINCT FROM
       current_database_oid
     OR command_record."requestedAt" > observed_at + INTERVAL '1 minute'
     OR command_record."expiresAt" <= observed_at
     OR manifest_issued_at > observed_at + INTERVAL '1 minute'
     OR manifest_valid_until <= observed_at
     OR NOT EXISTS (
       SELECT 1
       FROM public."Tenant" AS tenant
       WHERE tenant."id" = tenant_id
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."SharedBetaRuntimeReleaseMarker" AS marker
       WHERE marker."id" = command_record."deploymentMarkerId"
         AND marker."payloadDigest" = command_record."deploymentMarkerDigest"
         AND marker."databaseIdentityDigest" =
           command_record."databaseIdentityDigest"
         AND marker."actualContextDigest" =
           command_record."actualContextDigest"
         AND marker."coordinatorRoleName"::TEXT =
           command_record."dutyCoordinatorRoleName"::TEXT
         AND marker."coordinatorRoleOid" =
           command_record."dutyCoordinatorRoleOid"
         AND marker."schemaHead" =
           '20260802020000_identity_mail_worker_v2_lost_response_replay'
         AND marker."migrationCount" = 184
         AND marker."migrationManifestDigest" =
           '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'
         AND marker."stateRevision" = 1
         AND marker."revokedAt" IS NULL
        AND marker."validUntil" > observed_at
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDutyRoleManifestRevocationV2" AS revocation
       WHERE revocation."manifestPayloadDigest" =
         manifest_record."payloadDigest"
     )
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_EVIDENCE_FIRST_IMPORT_NOT_CURRENT'
      USING ERRCODE = '55000';
  END IF;

  imported_at := pg_catalog.clock_timestamp();
  imported_transaction_id := pg_catalog.pg_current_xact_id()::TEXT;

  import_receipt_base := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'IMPORT_IDENTITY_MAIL_TENANT_ENROLLMENT_EVIDENCE_V2',
    'operationId', p_bundle_digest,
    'tenantId', tenant_id,
    'commandId', command_record."id",
    'requestId', command_record."requestId",
    'authorizationEnvelopeDigest',
      command_record."authorizationEnvelopeDigest",
    'manifestId', manifest_record."manifestId",
    'manifestPayloadDigest', manifest_record."payloadDigest",
    'exactGrantsDigest', command_record."dutyExactGrantsDigest",
    'bindingDigest', command_record."bindingDigest",
    'bundleDigest', p_bundle_digest,
    'decision', 'IMPORTED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'canPersistEvidence', true,
    'authorization', false,
    'canMutate', false,
    'canSend', false,
    'importedAtEpochMs',
      (EXTRACT(EPOCH FROM imported_at) * 1000)::BIGINT,
    'importedTransactionId', imported_transaction_id
  );

  import_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(import_receipt_base::TEXT, 'UTF8')
    ),
    'hex'
  );
  import_receipt := import_receipt_base || pg_catalog.jsonb_build_object(
    'importReceiptDigest', import_receipt_digest
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_evidence_import_receipt_v2',
    import_receipt_digest,
    true
  );

  IF manifest_conflict_count = 0 THEN
    INSERT INTO public."IdentityMailDutyRoleManifestEvidenceV2" (
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
      "importReceiptDigest"
    ) VALUES (
      manifest_record."payloadDigest",
      manifest_record."manifestId",
      manifest_record."manifestRevision",
      manifest_record."contractVersion",
      manifest_record."profile",
      manifest_record."trustDomain",
      manifest_record."purpose",
      manifest_record."payloadCanonicalJson",
      manifest_record."manifestEvidence",
      manifest_record."signatureAlgorithm",
      manifest_record."signingKeyId",
      manifest_record."publicKeyFingerprint",
      manifest_record."signatureBase64url",
      manifest_record."issuedAt",
      manifest_record."validUntil",
      manifest_record."databaseName",
      manifest_record."databaseOid",
      manifest_record."databaseIdentityDigest",
      manifest_record."deploymentMarkerId",
      manifest_record."deploymentMarkerDigest",
      manifest_record."actualContextDigest",
      manifest_record."coordinatorRoleName",
      manifest_record."coordinatorRoleOid",
      manifest_record."workerRoleName",
      manifest_record."workerRoleOid",
      manifest_record."exactGrantsProfile",
      manifest_record."exactGrantsDigest",
      manifest_record."exactGrantsProjection",
      manifest_record."predecessorManifestDigest",
      manifest_record."applicationContract",
      manifest_record."applicationReleaseSha",
      manifest_record."applicationArtifactSha256",
      command_record."id",
      imported_at,
      imported_transaction_id,
      import_receipt_digest
    );
  END IF;

  INSERT INTO public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "id",
    "tenantId",
    "requestId",
    "action",
    "intent",
    "contractVersion",
    "signatureDomain",
    "rollbackOfCommandId",
    "proposalContentDigest",
    "proposalCanonicalJson",
    "authorizationEnvelopeDigest",
    "authorizationEnvelopeCanonicalJson",
    "expectedState",
    "targetState",
    "expectedPolicyRevision",
    "nextPolicyRevision",
    "stateRevisionBefore",
    "drainStateRevision",
    "finalStateRevision",
    "previousWorkerRoleName",
    "previousWorkerRoleOid",
    "previousProviderAuthorityDigest",
    "previousMaxAttempts",
    "previousLeaseSeconds",
    "previousAcknowledgeSeconds",
    "previousBaseRetrySeconds",
    "previousMaxRetrySeconds",
    "previousConfigurationDigest",
    "targetWorkerRoleName",
    "targetWorkerRoleOid",
    "targetProviderAuthorityDigest",
    "targetMaxAttempts",
    "targetLeaseSeconds",
    "targetAcknowledgeSeconds",
    "targetBaseRetrySeconds",
    "targetMaxRetrySeconds",
    "targetConfigurationDigest",
    "runtimeConfigDigest",
    "expectedDatabaseName",
    "expectedDatabaseOid",
    "databaseIdentityDigest",
    "deploymentMarkerId",
    "deploymentMarkerDigest",
    "actualContextDigest",
    "releaseSha",
    "actorDigest",
    "signatureAlgorithm",
    "signingKeyId",
    "publicKeyFingerprint",
    "signatureBase64url",
    "signatureVerifiedAt",
    "requestedAt",
    "expiresAt",
    "acceptedAt",
    "acceptedTransactionId",
    "receipt",
    "receiptDigest",
    "dutyManifestContract",
    "dutyManifestProfile",
    "dutyManifestId",
    "dutyManifestRevision",
    "dutyManifestPayloadDigest",
    "dutyManifestSigningKeyId",
    "dutyManifestPublicKeyFingerprint",
    "dutyCoordinatorRoleName",
    "dutyCoordinatorRoleOid",
    "dutyWorkerRoleName",
    "dutyWorkerRoleOid",
    "dutyExactGrantsProfile",
    "dutyExactGrantsDigest",
    "dutyPredecessorManifestDigest",
    "dutyApplicationContract",
    "dutyApplicationReleaseSha",
    "dutyApplicationArtifactSha256",
    "compositionContract",
    "compositionProfile",
    "bindingCanonicalJson",
    "bindingDigest",
    "bundleContract",
    "bundleProfile",
    "bundleCanonicalJson",
    "bundleDigest",
    "importedAt",
    "importedTransactionId",
    "importReceipt",
    "importReceiptDigest"
  ) VALUES (
    command_record."id",
    command_record."tenantId",
    command_record."requestId",
    command_record."action",
    command_record."intent",
    command_record."contractVersion",
    command_record."signatureDomain",
    command_record."rollbackOfCommandId",
    command_record."proposalContentDigest",
    command_record."proposalCanonicalJson",
    command_record."authorizationEnvelopeDigest",
    command_record."authorizationEnvelopeCanonicalJson",
    command_record."expectedState",
    command_record."targetState",
    command_record."expectedPolicyRevision",
    command_record."nextPolicyRevision",
    command_record."stateRevisionBefore",
    command_record."drainStateRevision",
    command_record."finalStateRevision",
    command_record."previousWorkerRoleName",
    command_record."previousWorkerRoleOid",
    command_record."previousProviderAuthorityDigest",
    command_record."previousMaxAttempts",
    command_record."previousLeaseSeconds",
    command_record."previousAcknowledgeSeconds",
    command_record."previousBaseRetrySeconds",
    command_record."previousMaxRetrySeconds",
    command_record."previousConfigurationDigest",
    command_record."targetWorkerRoleName",
    command_record."targetWorkerRoleOid",
    command_record."targetProviderAuthorityDigest",
    command_record."targetMaxAttempts",
    command_record."targetLeaseSeconds",
    command_record."targetAcknowledgeSeconds",
    command_record."targetBaseRetrySeconds",
    command_record."targetMaxRetrySeconds",
    command_record."targetConfigurationDigest",
    command_record."runtimeConfigDigest",
    command_record."expectedDatabaseName",
    command_record."expectedDatabaseOid",
    command_record."databaseIdentityDigest",
    command_record."deploymentMarkerId",
    command_record."deploymentMarkerDigest",
    command_record."actualContextDigest",
    command_record."releaseSha",
    command_record."actorDigest",
    command_record."signatureAlgorithm",
    command_record."signingKeyId",
    command_record."publicKeyFingerprint",
    command_record."signatureBase64url",
    imported_at,
    command_record."requestedAt",
    command_record."expiresAt",
    imported_at,
    imported_transaction_id,
    import_receipt,
    import_receipt_digest,
    command_record."dutyManifestContract",
    command_record."dutyManifestProfile",
    command_record."dutyManifestId",
    command_record."dutyManifestRevision",
    command_record."dutyManifestPayloadDigest",
    command_record."dutyManifestSigningKeyId",
    command_record."dutyManifestPublicKeyFingerprint",
    command_record."dutyCoordinatorRoleName",
    command_record."dutyCoordinatorRoleOid",
    command_record."dutyWorkerRoleName",
    command_record."dutyWorkerRoleOid",
    command_record."dutyExactGrantsProfile",
    command_record."dutyExactGrantsDigest",
    command_record."dutyPredecessorManifestDigest",
    command_record."dutyApplicationContract",
    command_record."dutyApplicationReleaseSha",
    command_record."dutyApplicationArtifactSha256",
    command_record."compositionContract",
    command_record."compositionProfile",
    command_record."bindingCanonicalJson",
    command_record."bindingDigest",
    command_record."bundleContract",
    command_record."bundleProfile",
    command_record."bundleCanonicalJson",
    command_record."bundleDigest",
    imported_at,
    imported_transaction_id,
    import_receipt,
    import_receipt_digest
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_evidence_import_receipt_v2',
    '',
    true
  );

  RETURN import_receipt;
END;
$$;

CREATE FUNCTION public."identity_mail_manifest_revocation_lock_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
BEGIN
  SELECT command."tenantId"
  INTO tenant_id
  FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest
  INNER JOIN public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
    ON command."id" = manifest."importedCommandId"
   AND command."importReceiptDigest" = manifest."importReceiptDigest"
  WHERE manifest."payloadDigest" = NEW."manifestPayloadDigest";

  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_MANIFEST_REVOCATION_MANIFEST_UNKNOWN'
      USING ERRCODE = '23503';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-duty-manifest:v2:'
        || NEW."manifestPayloadDigest",
      185
    )
  );

  IF NOT EXISTS (
       SELECT 1
       FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest
       INNER JOIN
         public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
         ON command."id" = manifest."importedCommandId"
        AND command."importReceiptDigest" = manifest."importReceiptDigest"
       WHERE manifest."payloadDigest" = NEW."manifestPayloadDigest"
         AND command."tenantId" = tenant_id
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDutyRoleManifestRevocationV2" AS revocation
       WHERE revocation."manifestPayloadDigest" =
         NEW."manifestPayloadDigest"
     )
  THEN
    RAISE EXCEPTION 'IDENTITY_MAIL_MANIFEST_REVOCATION_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  NEW."revokedAt" := pg_catalog.clock_timestamp();
  NEW."revokedTransactionId" :=
    pg_catalog.pg_current_xact_id()::TEXT;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "IdentityMailManifestRevocationV2_insert_lock_trigger"
BEFORE INSERT
ON public."IdentityMailDutyRoleManifestRevocationV2"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_manifest_revocation_lock_v2"();

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDutyRoleManifestEvidenceV2"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDutyRoleManifestRevocationV2"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_evidence_immutable_guard_v2"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_evidence_import_insert_guard_v2"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_import_evidence_v2"(
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_manifest_revocation_lock_v2"()
FROM PUBLIC;

COMMENT ON TABLE public."IdentityMailDutyRoleManifestEvidenceV2" IS
  'CURRENT185 NOT_DEPLOYABLE immutable application-verified duty-manifest evidence. This relation is owner-only and grants no runtime authority.';

COMMENT ON TABLE public."IdentityMailDutyRoleManifestRevocationV2" IS
  'CURRENT185 NOT_DEPLOYABLE append-only manifest revocation evidence serialized by tenant then manifest advisory locks.';

COMMENT ON FUNCTION
  public."identity_mail_tenant_enrollment_import_evidence_v2"(TEXT, TEXT) IS
  'CURRENT185 NOT_DEPLOYABLE owner-only two-TEXT evidence importer. It persists no PII, sends no mail and grants no coordinator or worker authority.';

COMMENT ON FUNCTION public."identity_mail_manifest_revocation_lock_v2"() IS
  'CURRENT185 owner-only trigger boundary: resolves the persisted tenant, takes the shared tenant lock followed by the manifest lock, then stamps revocation metadata.';

DO $postcondition$
DECLARE
  relation_count INTEGER;
  relation_owner_drift INTEGER;
  relation_acl_drift INTEGER;
  column_acl_drift INTEGER;
  relation_row_count BIGINT;
  constraint_count INTEGER;
  invalid_constraint_count INTEGER;
  foreign_key_count INTEGER;
  foreign_key_drift INTEGER;
  routine_count INTEGER;
  routine_owner_drift INTEGER;
  routine_acl_drift INTEGER;
  routine_metadata_drift INTEGER;
  retained_rpc_drift_count INTEGER;
  retained_tenant_lock_named_routine_count INTEGER;
  retained_tenant_lock_metadata_count INTEGER;
  importer_named_routine_count INTEGER;
  importer_metadata_count INTEGER;
  trigger_names TEXT[];
  trigger_metadata_drift INTEGER;
  column_mismatch_count INTEGER;
BEGIN
  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE relation.relowner IS DISTINCT FROM owner_role.oid
         OR relation.relkind IS DISTINCT FROM 'r'::"char"
    )::INTEGER,
    COALESCE(pg_catalog.sum((
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(
        COALESCE(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) AS privilege
      WHERE privilege.grantee <> relation.relowner
    )), 0)::INTEGER
  INTO relation_count, relation_owner_drift, relation_acl_drift
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL (
    SELECT role.oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = CURRENT_USER
  ) AS owner_role
  WHERE relation.relnamespace = pg_catalog.to_regnamespace('public')
    AND relation.relname IN (
      'IdentityMailDeliveryTenantEnrollmentCommand',
      'IdentityMailDutyRoleManifestEvidenceV2',
      'IdentityMailDutyRoleManifestRevocationV2'
    );

  SELECT pg_catalog.count(*)::INTEGER
  INTO column_acl_drift
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid IN (
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestEvidenceV2"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestRevocationV2"'
      )
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attacl IS NOT NULL;

  WITH expected(
    relation_name,
    column_count,
    column_manifest_digest
  ) AS (
    VALUES
      (
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        86,
        '5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa2'::TEXT
      ),
      (
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        36,
        '2c143eb3707f8f77f2922378b394ad6dab6e704893fb987fd2576edc94d73b0e'::TEXT
      ),
      (
        'IdentityMailDutyRoleManifestRevocationV2'::TEXT,
        5,
        '9086e1a3ed6a0767868a24696820c4639e4bba6b49aa257125e5ecc90c04d44e'::TEXT
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO column_mismatch_count
  FROM expected
  CROSS JOIN LATERAL (
    SELECT
      pg_catalog.count(*)::INTEGER AS column_count,
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.string_agg(
              attribute.attnum::TEXT || E'\n'
                || attribute.attname || E'\n'
                || pg_catalog.format_type(
                  attribute.atttypid,
                  attribute.atttypmod
                ) || E'\n'
                || attribute.attnotnull::TEXT || E'\n'
                || COALESCE(
                  pg_catalog.pg_get_expr(
                    default_value.adbin,
                    default_value.adrelid,
                    true
                  ),
                  '<NULL>'
                ),
              E'\n' ORDER BY attribute.attnum
            ) || E'\n',
            'UTF8'
          )
        ),
        'hex'
      ) AS column_manifest_digest
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = pg_catalog.to_regclass(
        'public.' || pg_catalog.quote_ident(expected.relation_name)
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) AS actual
  WHERE actual.column_count IS DISTINCT FROM expected.column_count
     OR actual.column_manifest_digest IS DISTINCT FROM
       expected.column_manifest_digest;

  SELECT
    (SELECT pg_catalog.count(*)
     FROM public."IdentityMailDeliveryTenantEnrollmentCommand")
      +
    (SELECT pg_catalog.count(*)
     FROM public."IdentityMailDutyRoleManifestEvidenceV2")
      +
    (SELECT pg_catalog.count(*)
     FROM public."IdentityMailDutyRoleManifestRevocationV2")
  INTO relation_row_count;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE NOT constraint_entry.convalidated
    )::INTEGER
  INTO constraint_count, invalid_constraint_count
  FROM pg_catalog.pg_constraint AS constraint_entry
  WHERE constraint_entry.conrelid IN (
    pg_catalog.to_regclass(
      'public."IdentityMailDeliveryTenantEnrollmentCommand"'
    ),
    pg_catalog.to_regclass(
      'public."IdentityMailDutyRoleManifestEvidenceV2"'
    ),
    pg_catalog.to_regclass(
      'public."IdentityMailDutyRoleManifestRevocationV2"'
    )
  );

  WITH expected(
    constraint_name,
    source_relation,
    referenced_relation,
    source_columns,
    referenced_columns,
    is_deferrable,
    is_deferred
  ) AS (
    VALUES
      (
        'IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'Tenant'::TEXT,
        ARRAY[2]::SMALLINT[],
        ARRAY[1]::SMALLINT[],
        false,
        false
      ),
      (
        'IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'SharedBetaRuntimeReleaseMarker'::TEXT,
        ARRAY[42, 43, 41, 44]::SMALLINT[],
        ARRAY[1, 22, 10, 12]::SMALLINT[],
        false,
        false
      ),
      (
        'IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        ARRAY[2, 8]::SMALLINT[],
        ARRAY[2, 1]::SMALLINT[],
        false,
        false
      ),
      (
        'identity_mail_command_manifest_v2_evidence_fkey'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        ARRAY[
          62, 60, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70
        ]::SMALLINT[],
        ARRAY[
          1, 2, 3, 4, 5, 11, 12, 22, 23, 24, 25, 26, 27
        ]::SMALLINT[],
        false,
        false
      ),
      (
        'identity_mail_command_manifest_v2_context_fkey'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        ARRAY[
          62, 60, 61, 39, 40, 41, 42, 43, 44, 71, 72, 73, 74
        ]::SMALLINT[],
        ARRAY[
          1, 2, 3, 16, 17, 18, 19, 20, 21, 29, 30, 31, 32
        ]::SMALLINT[],
        false,
        false
      ),
      (
        'identity_mail_manifest_v2_marker_fkey'::TEXT,
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        'SharedBetaRuntimeReleaseMarker'::TEXT,
        ARRAY[19, 20, 18, 21]::SMALLINT[],
        ARRAY[1, 22, 10, 12]::SMALLINT[],
        false,
        false
      ),
      (
        'identity_mail_manifest_v2_import_command_fkey'::TEXT,
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        ARRAY[33, 36]::SMALLINT[],
        ARRAY[1, 86]::SMALLINT[],
        true,
        true
      ),
      (
        'identity_mail_manifest_revocation_v2_manifest_fkey'::TEXT,
        'IdentityMailDutyRoleManifestRevocationV2'::TEXT,
        'IdentityMailDutyRoleManifestEvidenceV2'::TEXT,
        ARRAY[1]::SMALLINT[],
        ARRAY[1]::SMALLINT[],
        false,
        false
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO foreign_key_drift
  FROM expected
  LEFT JOIN pg_catalog.pg_constraint AS constraint_entry
    ON constraint_entry.conrelid = pg_catalog.to_regclass(
      'public.' || pg_catalog.quote_ident(expected.source_relation)
    )
   AND constraint_entry.conname = expected.constraint_name
  WHERE constraint_entry.oid IS NULL
     OR constraint_entry.contype IS DISTINCT FROM 'f'::"char"
     OR constraint_entry.confrelid IS DISTINCT FROM pg_catalog.to_regclass(
       'public.' || pg_catalog.quote_ident(expected.referenced_relation)
     )
     OR constraint_entry.conkey IS DISTINCT FROM expected.source_columns
     OR constraint_entry.confkey IS DISTINCT FROM expected.referenced_columns
     OR constraint_entry.confmatchtype IS DISTINCT FROM 's'::"char"
     OR constraint_entry.confupdtype IS DISTINCT FROM 'r'::"char"
     OR constraint_entry.confdeltype IS DISTINCT FROM 'r'::"char"
     OR constraint_entry.condeferrable IS DISTINCT FROM expected.is_deferrable
     OR constraint_entry.condeferred IS DISTINCT FROM expected.is_deferred
     OR constraint_entry.convalidated IS DISTINCT FROM true;

  SELECT pg_catalog.count(*)::INTEGER
  INTO foreign_key_count
  FROM pg_catalog.pg_constraint AS constraint_entry
  WHERE constraint_entry.contype = 'f'::"char"
    AND constraint_entry.conrelid IN (
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestEvidenceV2"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestRevocationV2"'
      )
    );

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE routine.proowner IS DISTINCT FROM owner_role.oid
    )::INTEGER,
    COALESCE(pg_catalog.sum((
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(
        COALESCE(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) AS privilege
      WHERE privilege.grantee <> routine.proowner
        AND privilege.privilege_type = 'EXECUTE'
    )), 0)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE routine.provolatile IS DISTINCT FROM 'v'::"char"
         OR routine.proparallel IS DISTINCT FROM 'u'::"char"
         OR routine.proconfig IS DISTINCT FROM
           ARRAY['search_path=pg_catalog']::TEXT[]
         OR (
           routine.oid = pg_catalog.to_regprocedure(
             'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
           )
           AND (
             NOT routine.prosecdef
             OR routine.prorettype IS DISTINCT FROM
               'jsonb'::pg_catalog.regtype
           )
         )
         OR (
           routine.oid <> pg_catalog.to_regprocedure(
             'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
           )
           AND (
             routine.prosecdef
             OR routine.prorettype IS DISTINCT FROM
               'trigger'::pg_catalog.regtype
           )
         )
    )::INTEGER
  INTO
    routine_count,
    routine_owner_drift,
    routine_acl_drift,
    routine_metadata_drift
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL (
    SELECT role.oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = CURRENT_USER
  ) AS owner_role
  WHERE routine.oid IN (
    pg_catalog.to_regprocedure(
      'public.identity_mail_evidence_immutable_guard_v2()'
    ),
    pg_catalog.to_regprocedure(
      'public.identity_mail_evidence_import_insert_guard_v2()'
    ),
    pg_catalog.to_regprocedure(
      'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
    ),
    pg_catalog.to_regprocedure(
      'public.identity_mail_manifest_revocation_lock_v2()'
    )
  );

  WITH expected(
    "signature",
    "body_sha256",
    "argument_count",
    "argument_names"
  ) AS (
    VALUES
      (
        'public."identity_mail_delivery_worker_assert_v2"(text,text)',
        '56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c',
        2,
        ARRAY[
          'p_tenant_id',
          'p_provider_authority_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
        '99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1',
        4,
        ARRAY[
          'p_tenant_id',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_authority_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
        'ed440a728feb80b1740246855da8f8eea83b6b17b9d6fd1a59368184c3287af3',
        8,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_lease_version',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_attempt_key',
          'p_provider_authority_digest',
          'p_message_id_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
        'ffa78b8844522a7b80ed38fe6eb11454b9d8e4c2fe319878cbd7bda42ed02730',
        9,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_lease_version',
          'p_lease_owner_digest',
          'p_lease_token_digest',
          'p_provider_authority_digest',
          'p_outcome_code',
          'p_provider_receipt_digest',
          'p_terminal_ack_digest'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
        '1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d',
        4,
        ARRAY[
          'p_tenant_id',
          'p_provider_authority_digest',
          'p_worker_actor_digest',
          'p_batch_limit'
        ]::TEXT[]
      ),
      (
        'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
        '39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151',
        6,
        ARRAY[
          'p_tenant_id',
          'p_outbox_id',
          'p_expected_transition_revision',
          'p_resolution_code',
          'p_evidence_digest',
          'p_actor_digest'
        ]::TEXT[]
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_rpc_drift_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  CROSS JOIN LATERAL (
    SELECT role.oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = CURRENT_USER
  ) AS owner_role
  WHERE routine.oid IS NULL
     OR routine.proowner IS DISTINCT FROM owner_role.oid
     OR routine.prokind IS DISTINCT FROM 'f'::"char"
     OR routine.prosecdef IS DISTINCT FROM true
     OR routine.proleakproof IS DISTINCT FROM false
     OR routine.proisstrict IS DISTINCT FROM false
     OR routine.proretset IS DISTINCT FROM false
     OR routine.provolatile IS DISTINCT FROM 'v'::"char"
     OR routine.proparallel IS DISTINCT FROM 'u'::"char"
     OR routine.pronargs IS DISTINCT FROM expected."argument_count"
     OR routine.pronargdefaults IS DISTINCT FROM 0
     OR routine.proargdefaults IS NOT NULL
     OR routine.provariadic IS DISTINCT FROM 0::OID
     OR routine.prorettype IS DISTINCT FROM 'jsonb'::pg_catalog.regtype
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[]
     OR routine.proargnames IS DISTINCT FROM expected."argument_names"
     OR routine.proargmodes IS NOT NULL
     OR routine.proallargtypes IS NOT NULL
     OR language.lanname IS DISTINCT FROM 'plpgsql'
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(routine.prosrc, 'UTF8')
       ),
       'hex'
     ) IS DISTINCT FROM expected."body_sha256"
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
     ) IS DISTINCT FROM 1
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
       WHERE privilege.grantor IS DISTINCT FROM routine.proowner
          OR privilege.grantee IS DISTINCT FROM routine.proowner
          OR privilege.privilege_type IS DISTINCT FROM 'EXECUTE'
           OR privilege.is_grantable IS DISTINCT FROM false
      );

  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_tenant_lock_named_routine_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname = 'identity_mail_tenant_lock_v1';

  SELECT pg_catalog.count(*)::INTEGER
  INTO retained_tenant_lock_metadata_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  CROSS JOIN LATERAL (
    SELECT role.oid
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = CURRENT_USER
  ) AS owner_role
  WHERE routine.oid = pg_catalog.to_regprocedure(
      'public."identity_mail_tenant_lock_v1"(text)'
    )
    AND routine.proowner = owner_role.oid
    AND routine.prokind = 'f'::"char"
    AND routine.prosecdef = false
    AND routine.proleakproof = false
    AND routine.proisstrict = false
    AND routine.proretset = false
    AND routine.provolatile = 'v'::"char"
    AND routine.proparallel = 'u'::"char"
    AND routine.pronargs = 1
    AND routine.pronargdefaults = 0
    AND routine.proargdefaults IS NULL
    AND routine.provariadic = 0::OID
    AND routine.prorettype = 'text'::pg_catalog.regtype
    AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AND routine.proargnames = ARRAY['p_tenant_id']::TEXT[]
    AND routine.proargmodes IS NULL
    AND routine.proallargtypes IS NULL
    AND language.lanname = 'plpgsql'
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
      'hex'
    ) = 'c53780aa0df846a4085b01b4c62cbb857f69e0f145a8c72a43ef1af35fafc790'
    AND (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.aclexplode(
        COALESCE(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) AS privilege
    ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) AS privilege
      WHERE privilege.grantor IS DISTINCT FROM routine.proowner
         OR privilege.grantee IS DISTINCT FROM routine.proowner
         OR privilege.privilege_type IS DISTINCT FROM 'EXECUTE'
         OR privilege.is_grantable IS DISTINCT FROM false
    );

  SELECT pg_catalog.count(*)::INTEGER
  INTO importer_named_routine_count
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
    AND routine.proname =
      'identity_mail_tenant_enrollment_import_evidence_v2';

  SELECT pg_catalog.count(*)::INTEGER
  INTO importer_metadata_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid = pg_catalog.to_regprocedure(
      'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
    )
    AND routine.prokind = 'f'::"char"
    AND routine.prosecdef
    AND NOT routine.proleakproof
    AND NOT routine.proisstrict
    AND NOT routine.proretset
    AND routine.provolatile = 'v'
    AND routine.proparallel = 'u'
    AND routine.pronargs = 2
    AND routine.pronargdefaults = 0
    AND routine.proargdefaults IS NULL
    AND routine.provariadic = 0::OID
    AND routine.prorettype = 'jsonb'::pg_catalog.regtype
    AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AND routine.proargnames = ARRAY[
      'p_bundle_canonical_json',
      'p_bundle_digest'
    ]::TEXT[]
    AND routine.proargmodes IS NULL
    AND routine.proallargtypes IS NULL
    AND language.lanname = 'plpgsql';

  SELECT pg_catalog.array_agg(
    trigger_entry.tgname ORDER BY trigger_entry.tgname COLLATE "C"
  )
  INTO trigger_names
  FROM pg_catalog.pg_trigger AS trigger_entry
  WHERE NOT trigger_entry.tgisinternal
    AND trigger_entry.tgrelid IN (
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestEvidenceV2"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDutyRoleManifestRevocationV2"'
      )
    );

  WITH expected(
    relation_name,
    trigger_name,
    trigger_type,
    routine_signature
  ) AS (
    VALUES
      (
        'IdentityMailDeliveryTenantEnrollmentCommand'::TEXT,
        'IdentityMailEnrollmentCommand_immutable_dml_trigger'::TEXT,
        26,
        'public.identity_mail_evidence_immutable_guard_v2()'::TEXT
      ),
      (
        'IdentityMailDeliveryTenantEnrollmentCommand',
        'IdentityMailEnrollmentCommand_immutable_truncate_trigger',
        34,
        'public.identity_mail_evidence_immutable_guard_v2()'
      ),
      (
        'IdentityMailDeliveryTenantEnrollmentCommand',
        'IdentityMailEnrollmentCommand_import_insert_guard_trigger',
        7,
        'public.identity_mail_evidence_import_insert_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestEvidenceV2',
        'IdentityMailManifestV2_immutable_dml_trigger',
        26,
        'public.identity_mail_evidence_immutable_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestEvidenceV2',
        'IdentityMailManifestV2_immutable_truncate_trigger',
        34,
        'public.identity_mail_evidence_immutable_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestEvidenceV2',
        'IdentityMailManifestV2_import_insert_guard_trigger',
        7,
        'public.identity_mail_evidence_import_insert_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestRevocationV2',
        'IdentityMailManifestRevocationV2_immutable_dml_trigger',
        26,
        'public.identity_mail_evidence_immutable_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestRevocationV2',
        'IdentityMailManifestRevocationV2_immutable_truncate_trigger',
        34,
        'public.identity_mail_evidence_immutable_guard_v2()'
      ),
      (
        'IdentityMailDutyRoleManifestRevocationV2',
        'IdentityMailManifestRevocationV2_insert_lock_trigger',
        7,
        'public.identity_mail_manifest_revocation_lock_v2()'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO trigger_metadata_drift
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = pg_catalog.to_regnamespace('public')
   AND relation.relname = expected.relation_name
  LEFT JOIN pg_catalog.pg_trigger AS trigger_entry
    ON trigger_entry.tgrelid = relation.oid
   AND trigger_entry.tgname = expected.trigger_name
   AND NOT trigger_entry.tgisinternal
  WHERE trigger_entry.oid IS NULL
     OR trigger_entry.tgtype IS DISTINCT FROM expected.trigger_type
     OR trigger_entry.tgenabled IS DISTINCT FROM 'O'::"char"
     OR trigger_entry.tgfoid IS DISTINCT FROM pg_catalog.to_regprocedure(
       expected.routine_signature
     );

  IF relation_count IS DISTINCT FROM 3
     OR relation_owner_drift IS DISTINCT FROM 0
     OR relation_acl_drift IS DISTINCT FROM 0
     OR column_acl_drift IS DISTINCT FROM 0
     OR relation_row_count IS DISTINCT FROM 0
     OR column_mismatch_count IS DISTINCT FROM 0
     OR constraint_count IS DISTINCT FROM 45
     OR invalid_constraint_count IS DISTINCT FROM 0
     OR foreign_key_count IS DISTINCT FROM 8
     OR foreign_key_drift IS DISTINCT FROM 0
     OR routine_count IS DISTINCT FROM 4
     OR routine_owner_drift IS DISTINCT FROM 0
     OR routine_acl_drift IS DISTINCT FROM 0
     OR routine_metadata_drift IS DISTINCT FROM 0
     OR retained_rpc_drift_count IS DISTINCT FROM 0
     OR retained_tenant_lock_named_routine_count IS DISTINCT FROM 1
     OR retained_tenant_lock_metadata_count IS DISTINCT FROM 1
     OR importer_named_routine_count IS DISTINCT FROM 1
     OR importer_metadata_count IS DISTINCT FROM 1
     OR trigger_metadata_drift IS DISTINCT FROM 0
     OR trigger_names IS DISTINCT FROM ARRAY[
       'IdentityMailEnrollmentCommand_immutable_dml_trigger',
       'IdentityMailEnrollmentCommand_immutable_truncate_trigger',
       'IdentityMailEnrollmentCommand_import_insert_guard_trigger',
       'IdentityMailManifestRevocationV2_immutable_dml_trigger',
       'IdentityMailManifestRevocationV2_immutable_truncate_trigger',
       'IdentityMailManifestRevocationV2_insert_lock_trigger',
       'IdentityMailManifestV2_immutable_dml_trigger',
       'IdentityMailManifestV2_immutable_truncate_trigger',
       'IdentityMailManifestV2_import_insert_guard_trigger'
     ]::TEXT[]
  THEN
    RAISE EXCEPTION 'CURRENT185 evidence ledger postcondition failed'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
