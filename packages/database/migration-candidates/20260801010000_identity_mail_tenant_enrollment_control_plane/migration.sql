BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- CURRENT_180 is deliberately schema-only and dormant. It introduces the
-- signed command authority and append-only state evidence required by a later
-- coordinator, but installs no apply RPC and grants no runtime authority.
DO $prerequisite$
DECLARE
  completed_migration_count INTEGER;
  lexical_migration_head TEXT;
  migration_manifest_digest TEXT;
  migration_owner_oid OID;
  enrollment_count BIGINT;
  claimed_outbox_count BIGINT;
  candidate_receipt_count INTEGER;
  candidate_receipt_checksum TEXT;
  candidate_receipt_applied_steps INTEGER;
  rehearsal_confirmation TEXT;
  rehearsal_candidate_sha256 TEXT;
BEGIN
  rehearsal_confirmation := pg_catalog.current_setting(
    'leetplus.identity_mail_tenant_enrollment_current180_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_tenant_enrollment_current180_sha256',
    true
  );

  IF pg_catalog.current_database() !~
       '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-dormant-identity-mail-tenant-enrollment-current180'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT_180 candidate is restricted to the confirmed disposable rehearsal boundary'
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
      '20260801010000_identity_mail_tenant_enrollment_control_plane'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1
     OR candidate_receipt_checksum IS NULL
     OR (candidate_receipt_checksum COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR candidate_receipt_checksum IS DISTINCT FROM
       rehearsal_candidate_sha256
     OR candidate_receipt_applied_steps IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT_180 candidate requires one exact unfinished Prisma rehearsal receipt'
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

  IF completed_migration_count IS DISTINCT FROM 179
     OR lexical_migration_head IS DISTINCT FROM
       '20260731120000_identity_mail_delivery_release_head'
     OR migration_manifest_digest IS DISTINCT FROM
       '3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260731120000_identity_mail_delivery_release_head'
         AND migration."checksum" =
           'c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260801010000_identity_mail_tenant_enrollment_control_plane'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_180 requires the exact completed CURRENT_179 migration set'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollment"'
     ) IS NULL
     OR pg_catalog.to_regclass('public."IdentityMailOutbox"') IS NULL
     OR pg_catalog.to_regclass('public."Tenant"') IS NULL
     OR pg_catalog.to_regclass(
       'public."SharedBetaRuntimeReleaseMarker"'
     ) IS NULL
  THEN
    RAISE EXCEPTION
      'CURRENT_180 identity mail or release foundation is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  IF migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."IdentityMailOutbox"'),
           ('public."Tenant"'),
           ('public."SharedBetaRuntimeReleaseMarker"')
       ) AS required("relation_name")
       LEFT JOIN pg_catalog.pg_class AS relation
         ON relation.oid = pg_catalog.to_regclass(required."relation_name")
       WHERE relation.oid IS NULL
          OR relation.relowner <> migration_owner_oid
     )
  THEN
    RAISE EXCEPTION 'CURRENT_180 migration ownership is unsafe'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO enrollment_count
  FROM public."IdentityMailDeliveryTenantEnrollment";

  SELECT pg_catalog.count(*)
  INTO claimed_outbox_count
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."status" = 'CLAIMED'::public."IdentityMailOutboxStatus";

  IF enrollment_count <> 0 OR claimed_outbox_count <> 0 THEN
    RAISE EXCEPTION
      'CURRENT_180 requires an empty enrollment registry and zero CLAIMED mail outbox rows'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollmentCommand"'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollmentEvent"'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollment"'
       )
         AND attribute.attname IN (
           'state',
            'stateRevision',
            'activeCommandId',
            'lastEventDigest',
            'currentConfigurationDigest',
            'stateChangedAt'
         )
         AND attribute.attnum > 0
         AND attribute.attisdropped = false
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS target_constraint
       WHERE target_constraint.conrelid = pg_catalog.to_regclass(
         'public."SharedBetaRuntimeReleaseMarker"'
       )
         AND target_constraint.conname =
           'shared_beta_runtime_marker_enrollment_binding_key'
     )
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_enrollment_command_guard_v1"()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_enrollment_event_guard_v1"()'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'CURRENT_180 target catalog is not pristine'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public."identity_mail_delivery_worker_assert_v1"(text)',
          'a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37'
        ),
        (
          'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
          'f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b'
        ),
        (
          'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
          'a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742'
        ),
        (
          'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
          '650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc'
        ),
        (
          'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
          'a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2'
        )
    ) AS required("signature", "prosrc_sha256")
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    LEFT JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR routine.proowner <> migration_owner_oid
       OR pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(routine.prosrc, 'UTF8')
         ),
         'hex'
       ) <> required."prosrc_sha256"
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prorettype IS DISTINCT FROM
         pg_catalog.to_regtype('pg_catalog.jsonb')
       OR routine.prosecdef IS DISTINCT FROM true
       OR routine.provolatile IS DISTINCT FROM 'v'::"char"
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR language.lanname IS DISTINCT FROM 'plpgsql'
       OR routine.proconfig IS DISTINCT FROM
         ARRAY['search_path=pg_catalog']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'CURRENT_180 worker v1 contract drifted'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisite$;

ALTER TABLE public."SharedBetaRuntimeReleaseMarker"
  ADD CONSTRAINT "shared_beta_runtime_marker_enrollment_binding_key"
  UNIQUE (
    "id",
    "payloadDigest",
    "databaseIdentityDigest",
    "actualContextDigest"
  );

CREATE TABLE public."IdentityMailDeliveryTenantEnrollmentCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "action" VARCHAR(16) NOT NULL,
  "intent" VARCHAR(16) NOT NULL DEFAULT 'FORWARD',
  "contractVersion" VARCHAR(64) NOT NULL
    DEFAULT 'PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1',
  "signatureDomain" VARCHAR(64) NOT NULL
    DEFAULT 'IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1',
  "rollbackOfCommandId" TEXT,
  "proposalContentDigest" CHAR(64) NOT NULL,
  "proposalCanonicalJson" TEXT NOT NULL,
  "authorizationEnvelopeDigest" CHAR(64) NOT NULL,
  "authorizationEnvelopeCanonicalJson" TEXT NOT NULL,
  "expectedState" VARCHAR(16) NOT NULL,
  "targetState" VARCHAR(16) NOT NULL,
  "expectedPolicyRevision" INTEGER NOT NULL,
  "nextPolicyRevision" INTEGER NOT NULL,
  "stateRevisionBefore" BIGINT NOT NULL,
  "drainStateRevision" BIGINT,
  "finalStateRevision" BIGINT NOT NULL,
  "previousWorkerRoleName" VARCHAR(63),
  "previousWorkerRoleOid" BIGINT,
  "previousProviderAuthorityDigest" CHAR(64),
  "previousMaxAttempts" INTEGER,
  "previousLeaseSeconds" INTEGER,
  "previousAcknowledgeSeconds" INTEGER,
  "previousBaseRetrySeconds" INTEGER,
  "previousMaxRetrySeconds" INTEGER,
  "previousConfigurationDigest" CHAR(64),
  "targetWorkerRoleName" VARCHAR(63) NOT NULL,
  "targetWorkerRoleOid" BIGINT NOT NULL,
  "targetProviderAuthorityDigest" CHAR(64) NOT NULL,
  "targetMaxAttempts" INTEGER NOT NULL,
  "targetLeaseSeconds" INTEGER NOT NULL,
  "targetAcknowledgeSeconds" INTEGER NOT NULL,
  "targetBaseRetrySeconds" INTEGER NOT NULL,
  "targetMaxRetrySeconds" INTEGER NOT NULL,
  "targetConfigurationDigest" CHAR(64) NOT NULL,
  "runtimeConfigDigest" CHAR(64) NOT NULL,
  "expectedDatabaseName" VARCHAR(63) NOT NULL,
  "expectedDatabaseOid" BIGINT NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "deploymentMarkerId" TEXT NOT NULL,
  "deploymentMarkerDigest" CHAR(64) NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "releaseSha" CHAR(40) NOT NULL,
  "actorDigest" CHAR(64) NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  "signingKeyId" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signatureBase64url" TEXT NOT NULL,
  "signatureVerifiedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "requestedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "acceptedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "acceptedTransactionId" VARCHAR(32) NOT NULL,
  "receipt" JSONB NOT NULL,
  "receiptDigest" CHAR(64) NOT NULL,

  CONSTRAINT "IdentityMailDeliveryTenantEnrollmentCommand_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "identity_mail_tenant_enrollment_command_tenant_id_key"
    UNIQUE ("tenantId", "id"),
  CONSTRAINT "identity_mail_tenant_enrollment_command_request_uidx"
    UNIQUE ("tenantId", "requestId"),
  CONSTRAINT "identity_mail_tenant_enrollment_command_digest_key"
    UNIQUE ("tenantId", "id", "authorizationEnvelopeDigest"),
  CONSTRAINT "identity_mail_tenant_enrollment_command_drain_projection_key"
    UNIQUE ("tenantId", "id", "drainStateRevision"),
  CONSTRAINT "identity_mail_tenant_enrollment_command_identifier_check"
    CHECK (
      "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
      AND ("id" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "tenantId" =
        pg_catalog.lower(pg_catalog.btrim("tenantId") COLLATE "C")
      AND ("tenantId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "requestId" =
        pg_catalog.lower(pg_catalog.btrim("requestId") COLLATE "C")
      AND ("requestId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (
        "rollbackOfCommandId" IS NULL
        OR (
          "rollbackOfCommandId" <> "id"
          AND "rollbackOfCommandId" = pg_catalog.lower(
            pg_catalog.btrim("rollbackOfCommandId") COLLATE "C"
          )
          AND ("rollbackOfCommandId" COLLATE "C") ~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
      AND "deploymentMarkerId" = pg_catalog.lower(
        pg_catalog.btrim("deploymentMarkerId") COLLATE "C"
      )
      AND ("deploymentMarkerId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_kind_check"
    CHECK (
      "action" IN ('ENABLE', 'ROTATE', 'DISABLE')
      AND "intent" IN ('FORWARD', 'ROLLBACK')
      AND "contractVersion" =
        'PROTECTED_MAIL_WORKER_TENANT_ENROLLMENT_V1'
      AND "signatureDomain" =
        'IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V1'
      AND (
        ("intent" = 'FORWARD' AND "rollbackOfCommandId" IS NULL)
        OR ("intent" = 'ROLLBACK' AND "rollbackOfCommandId" IS NOT NULL)
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_digest_check"
    CHECK (
      ("proposalContentDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("authorizationEnvelopeDigest" COLLATE "C") ~
        '^[0-9a-f]{64}$'
      AND "authorizationEnvelopeDigest" <> "proposalContentDigest"
      AND ("targetProviderAuthorityDigest" COLLATE "C") ~
        '^[0-9a-f]{64}$'
      AND ("targetConfigurationDigest" COLLATE "C") ~
        '^[0-9a-f]{64}$'
      AND ("runtimeConfigDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("deploymentMarkerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("actorDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("receiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("releaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_transition_check"
    CHECK (
      (
        "action" = 'ENABLE'
        AND "expectedState" IN ('ABSENT', 'DISABLED')
        AND "targetState" = 'ACTIVE'
      )
      OR (
        "action" = 'ROTATE'
        AND "expectedState" = 'ACTIVE'
        AND "targetState" = 'ACTIVE'
      )
      OR (
        "action" = 'DISABLE'
        AND "expectedState" = 'ACTIVE'
        AND "targetState" = 'DISABLED'
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_revision_check"
    CHECK (
      "nextPolicyRevision" = "expectedPolicyRevision" + 1
      AND (
        (
          "expectedState" = 'ABSENT'
          AND "expectedPolicyRevision" = 0
          AND "stateRevisionBefore" = 0
        )
        OR (
          "expectedState" <> 'ABSENT'
          AND "expectedPolicyRevision" >= 1
          AND "stateRevisionBefore" >= "expectedPolicyRevision"
        )
      )
      AND (
        (
          "action" = 'ENABLE'
          AND "drainStateRevision" IS NULL
          AND "finalStateRevision" = "stateRevisionBefore" + 1
        )
        OR (
          "action" IN ('ROTATE', 'DISABLE')
          AND "drainStateRevision" = "stateRevisionBefore" + 1
          AND "finalStateRevision" = "stateRevisionBefore" + 2
        )
      )
      AND "finalStateRevision" > 0
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_previous_check"
    CHECK (
      (
        "expectedState" = 'ABSENT'
        AND "previousWorkerRoleName" IS NULL
        AND "previousWorkerRoleOid" IS NULL
        AND "previousProviderAuthorityDigest" IS NULL
        AND "previousMaxAttempts" IS NULL
        AND "previousLeaseSeconds" IS NULL
        AND "previousAcknowledgeSeconds" IS NULL
        AND "previousBaseRetrySeconds" IS NULL
        AND "previousMaxRetrySeconds" IS NULL
        AND "previousConfigurationDigest" IS NULL
      )
      OR (
        "expectedState" <> 'ABSENT'
        AND ("previousWorkerRoleName"::TEXT COLLATE "C") ~
          '^[a-z_][a-z0-9_]{2,62}$'
        AND "previousWorkerRoleName" <> 'public'
        AND "previousWorkerRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
        AND "previousWorkerRoleOid" BETWEEN 1 AND 4294967295
        AND ("previousProviderAuthorityDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
        AND "previousMaxAttempts" BETWEEN 1 AND 20
        AND "previousLeaseSeconds" BETWEEN 30 AND 900
        AND "previousAcknowledgeSeconds" BETWEEN 10 AND 900
        AND "previousBaseRetrySeconds" BETWEEN 1 AND 3600
        AND "previousMaxRetrySeconds" BETWEEN
          "previousBaseRetrySeconds" AND 86400
        AND ("previousConfigurationDigest" COLLATE "C") ~
          '^[0-9a-f]{64}$'
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_target_check"
    CHECK (
      ("targetWorkerRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND "targetWorkerRoleName" <> 'public'
      AND "targetWorkerRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
      AND "targetWorkerRoleOid" BETWEEN 1 AND 4294967295
      AND "targetMaxAttempts" BETWEEN 1 AND 20
      AND "targetLeaseSeconds" BETWEEN 30 AND 900
      AND "targetAcknowledgeSeconds" BETWEEN 10 AND 900
      AND "targetBaseRetrySeconds" BETWEEN 1 AND 3600
      AND "targetMaxRetrySeconds" BETWEEN
        "targetBaseRetrySeconds" AND 86400
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_mutation_check"
    CHECK (
      "action" = 'ENABLE'
      OR (
        "action" = 'ROTATE'
        AND "targetConfigurationDigest" <>
          "previousConfigurationDigest"
      )
      OR (
        "action" = 'DISABLE'
        AND "targetWorkerRoleName" = "previousWorkerRoleName"
        AND "targetWorkerRoleOid" = "previousWorkerRoleOid"
        AND "targetProviderAuthorityDigest" =
          "previousProviderAuthorityDigest"
        AND "targetMaxAttempts" = "previousMaxAttempts"
        AND "targetLeaseSeconds" = "previousLeaseSeconds"
        AND "targetAcknowledgeSeconds" =
          "previousAcknowledgeSeconds"
        AND "targetBaseRetrySeconds" = "previousBaseRetrySeconds"
        AND "targetMaxRetrySeconds" = "previousMaxRetrySeconds"
        AND "targetConfigurationDigest" =
          "previousConfigurationDigest"
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_binding_check"
    CHECK (
      "expectedDatabaseName" = pg_catalog.lower(
        pg_catalog.btrim("expectedDatabaseName") COLLATE "C"
      )
      AND ("expectedDatabaseName"::TEXT COLLATE "C") ~
        '^[a-z][a-z0-9_]{0,62}$'
      AND "expectedDatabaseName" NOT IN (
        'postgres', 'template0', 'template1'
      )
      AND "expectedDatabaseOid" BETWEEN 1 AND 4294967295
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_signature_check"
    CHECK (
      "signatureAlgorithm" = 'Ed25519'
      AND "signingKeyId" = pg_catalog.lower(
        pg_catalog.btrim("signingKeyId") COLLATE "C"
      )
      AND ("signingKeyId" COLLATE "C") ~
        '^[a-z0-9][a-z0-9._-]{2,63}$'
      AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("signatureBase64url" COLLATE "C") ~ '^[A-Za-z0-9_-]{86}$'
      AND "signatureVerifiedAt" = "acceptedAt"
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_timeline_check"
    CHECK (
      "expiresAt" > "requestedAt"
      AND "expiresAt" <= "requestedAt" + INTERVAL '15 minutes'
      AND "acceptedAt" >= "requestedAt" - INTERVAL '5 minutes'
      AND "acceptedAt" <= "expiresAt"
      AND ("acceptedTransactionId" COLLATE "C") ~ '^[0-9]{1,32}$'
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_command_payload_check"
    CHECK (
      pg_catalog.octet_length("proposalCanonicalJson") BETWEEN 2 AND 65536
      AND "proposalCanonicalJson" = pg_catalog.btrim(
        "proposalCanonicalJson" COLLATE "C"
      )
      AND ("proposalCanonicalJson" COLLATE "C") !~ '[[:space:]]'
      AND "proposalCanonicalJson"::JSONB = pg_catalog.jsonb_build_object(
        'action', "action"::TEXT,
        'authorization', false,
        'canMutate', false,
        'contract', "contractVersion"::TEXT,
        'deploymentMarkerDigest', "deploymentMarkerDigest",
        'expectedDatabaseName', "expectedDatabaseName"::TEXT,
        'expectedDatabaseOid', "expectedDatabaseOid",
        'expectedRevision', "expectedPolicyRevision",
        'expectedState', "expectedState"::TEXT,
        'expiresAt', pg_catalog.to_char(
          "expiresAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'nextRevision', "nextPolicyRevision",
        'policy', pg_catalog.jsonb_build_object(
          'acknowledgeSeconds', "targetAcknowledgeSeconds",
          'baseRetrySeconds', "targetBaseRetrySeconds",
          'leaseSeconds', "targetLeaseSeconds",
          'maxAttempts', "targetMaxAttempts",
          'maxRetrySeconds', "targetMaxRetrySeconds"
        ),
        'providerAuthorityDigest', "targetProviderAuthorityDigest",
        'releaseSha', "releaseSha",
        'requestId', "requestId",
        'requestedAt', pg_catalog.to_char(
          "requestedAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'runtimeConfigDigest', "runtimeConfigDigest",
        'tenantId', "tenantId",
        'workerRoleName', "targetWorkerRoleName"::TEXT,
        'workerRoleOid', "targetWorkerRoleOid"
      )
      AND "proposalContentDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to("proposalCanonicalJson", 'UTF8')
        ),
        'hex'
      )
      AND pg_catalog.octet_length(
        "authorizationEnvelopeCanonicalJson"
      ) BETWEEN 2 AND 65536
      AND "authorizationEnvelopeCanonicalJson" = pg_catalog.btrim(
        "authorizationEnvelopeCanonicalJson" COLLATE "C"
      )
      AND ("authorizationEnvelopeCanonicalJson" COLLATE "C") !~
        '[[:space:]]'
      AND "authorizationEnvelopeCanonicalJson"::JSONB =
        pg_catalog.jsonb_build_object(
          'schemaVersion', 1,
          'authorityDomain', "signatureDomain"::TEXT,
          'authorization', true,
          'canMutate', true,
          'contract', "contractVersion"::TEXT,
          'commandId', "id",
          'tenantId', "tenantId",
          'requestId', "requestId",
          'action', "action"::TEXT,
          'intent', "intent"::TEXT,
          'rollbackOfCommandId', "rollbackOfCommandId",
          'proposalContentDigest', "proposalContentDigest",
          'expectedState', "expectedState"::TEXT,
          'targetState', "targetState"::TEXT,
          'expectedPolicyRevision', "expectedPolicyRevision",
          'nextPolicyRevision', "nextPolicyRevision",
          'stateRevisionBefore', "stateRevisionBefore",
          'drainStateRevision', "drainStateRevision",
          'finalStateRevision', "finalStateRevision",
          'previousConfiguration',
            CASE
              WHEN "expectedState" = 'ABSENT' THEN 'null'::JSONB
              ELSE pg_catalog.jsonb_build_object(
                'workerRoleName', "previousWorkerRoleName"::TEXT,
                'workerRoleOid', "previousWorkerRoleOid",
                'providerAuthorityDigest',
                  "previousProviderAuthorityDigest",
                'maxAttempts', "previousMaxAttempts",
                'leaseSeconds', "previousLeaseSeconds",
                'acknowledgeSeconds', "previousAcknowledgeSeconds",
                'baseRetrySeconds', "previousBaseRetrySeconds",
                'maxRetrySeconds', "previousMaxRetrySeconds",
                'configurationDigest', "previousConfigurationDigest"
              )
            END,
          'targetConfiguration', pg_catalog.jsonb_build_object(
            'workerRoleName', "targetWorkerRoleName"::TEXT,
            'workerRoleOid', "targetWorkerRoleOid",
            'providerAuthorityDigest', "targetProviderAuthorityDigest",
            'maxAttempts', "targetMaxAttempts",
            'leaseSeconds', "targetLeaseSeconds",
            'acknowledgeSeconds', "targetAcknowledgeSeconds",
            'baseRetrySeconds', "targetBaseRetrySeconds",
            'maxRetrySeconds', "targetMaxRetrySeconds",
            'configurationDigest', "targetConfigurationDigest"
          ),
          'runtimeConfigDigest', "runtimeConfigDigest",
          'expectedDatabaseName', "expectedDatabaseName"::TEXT,
          'expectedDatabaseOid', "expectedDatabaseOid",
          'databaseIdentityDigest', "databaseIdentityDigest",
          'deploymentMarkerId', "deploymentMarkerId",
          'deploymentMarkerDigest', "deploymentMarkerDigest",
          'actualContextDigest', "actualContextDigest",
          'releaseSha', "releaseSha",
          'actorDigest', "actorDigest",
          'signatureAlgorithm', "signatureAlgorithm"::TEXT,
          'signingKeyId', "signingKeyId"::TEXT,
          'publicKeyFingerprint', "publicKeyFingerprint",
          'requestedAt', pg_catalog.to_char(
            "requestedAt" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'expiresAt', pg_catalog.to_char(
            "expiresAt" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        )
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
  CONSTRAINT "identity_mail_tenant_enrollment_command_receipt_check"
    CHECK (
      "receipt" = pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'operation', 'ACCEPT_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND',
        'decision', 'ACCEPTED',
        'commandId', "id",
        'tenantId', "tenantId",
        'requestId', "requestId",
        'action', "action"::TEXT,
        'intent', "intent"::TEXT,
        'proposalContentDigest', "proposalContentDigest",
        'authorizationEnvelopeDigest', "authorizationEnvelopeDigest",
        'expectedState', "expectedState"::TEXT,
        'targetState', "targetState"::TEXT,
        'expectedPolicyRevision', "expectedPolicyRevision",
        'nextPolicyRevision', "nextPolicyRevision",
        'stateRevisionBefore', "stateRevisionBefore",
        'drainStateRevision', "drainStateRevision",
        'finalStateRevision', "finalStateRevision",
        'deploymentMarkerId', "deploymentMarkerId",
        'deploymentMarkerDigest', "deploymentMarkerDigest",
        'databaseIdentityDigest', "databaseIdentityDigest",
        'actualContextDigest', "actualContextDigest",
        'releaseSha', "releaseSha",
        'actorDigest', "actorDigest",
        'acceptedTransactionId', "acceptedTransactionId"::TEXT,
        'acceptedAtEpochMs',
          (EXTRACT(EPOCH FROM "acceptedAt") * 1000)::BIGINT
      )
      AND "receiptDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to("receipt"::TEXT, 'UTF8')
        ),
        'hex'
      )
    )
);

CREATE TABLE public."IdentityMailDeliveryTenantEnrollmentEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "eventSequence" INTEGER NOT NULL,
  "eventType" VARCHAR(40) NOT NULL,
  "fromState" VARCHAR(16) NOT NULL,
  "toState" VARCHAR(16) NOT NULL,
  "fromPolicyRevision" INTEGER NOT NULL,
  "toPolicyRevision" INTEGER NOT NULL,
  "fromStateRevision" BIGINT NOT NULL,
  "toStateRevision" BIGINT NOT NULL,
  "fromConfigurationDigest" CHAR(64),
  "toConfigurationDigest" CHAR(64) NOT NULL,
  "commandContentDigest" CHAR(64) NOT NULL,
  "actorDigest" CHAR(64) NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdTransactionId" VARCHAR(32) NOT NULL,
  "previousEventDigest" CHAR(64),
  "eventDigest" CHAR(64) NOT NULL,
  "receipt" JSONB NOT NULL,
  "receiptDigest" CHAR(64) NOT NULL,

  CONSTRAINT "IdentityMailDeliveryTenantEnrollmentEvent_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "identity_mail_tenant_enrollment_event_tenant_digest_key"
    UNIQUE ("tenantId", "eventDigest"),
  CONSTRAINT "identity_mail_tenant_enrollment_event_terminal_projection_key"
    UNIQUE (
      "tenantId",
      "eventDigest",
      "toState",
      "toPolicyRevision",
      "toStateRevision",
      "toConfigurationDigest"
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_command_sequence_uidx"
    UNIQUE ("tenantId", "commandId", "eventSequence"),
  CONSTRAINT "identity_mail_tenant_enrollment_event_state_revision_uidx"
    UNIQUE ("tenantId", "toStateRevision"),
  CONSTRAINT "identity_mail_tenant_enrollment_event_previous_uidx"
    UNIQUE NULLS NOT DISTINCT ("tenantId", "previousEventDigest"),
  CONSTRAINT "identity_mail_tenant_enrollment_event_identifier_check"
    CHECK (
      "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
      AND ("id" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "tenantId" =
        pg_catalog.lower(pg_catalog.btrim("tenantId") COLLATE "C")
      AND ("tenantId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND "commandId" =
        pg_catalog.lower(pg_catalog.btrim("commandId") COLLATE "C")
      AND ("commandId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_transition_check"
    CHECK (
      (
        "eventType" = 'ENABLED'
        AND "eventSequence" = 1
        AND "fromState" IN ('ABSENT', 'DISABLED')
        AND "toState" = 'ACTIVE'
      )
      OR (
        "eventType" = 'DRAIN_STARTED'
        AND "eventSequence" = 1
        AND "fromState" = 'ACTIVE'
        AND "toState" = 'DRAINING'
      )
      OR (
        "eventType" = 'ROTATED'
        AND "eventSequence" = 2
        AND "fromState" = 'DRAINING'
        AND "toState" = 'ACTIVE'
      )
      OR (
        "eventType" = 'DISABLED'
        AND "eventSequence" = 2
        AND "fromState" = 'DRAINING'
        AND "toState" = 'DISABLED'
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_revision_check"
    CHECK (
      "fromPolicyRevision" >= 0
      AND "toPolicyRevision" >= 1
      AND "fromStateRevision" >= 0
      AND "toStateRevision" = "fromStateRevision" + 1
      AND (
        (
          "fromState" = 'ABSENT'
          AND "fromPolicyRevision" = 0
          AND "fromStateRevision" = 0
        )
        OR (
          "fromState" <> 'ABSENT'
          AND "fromPolicyRevision" >= 1
          AND "fromStateRevision" >= "fromPolicyRevision"
        )
      )
      AND (
        (
          "eventType" = 'DRAIN_STARTED'
          AND "toPolicyRevision" = "fromPolicyRevision"
        )
        OR (
          "eventType" IN ('ENABLED', 'ROTATED', 'DISABLED')
          AND "toPolicyRevision" = "fromPolicyRevision" + 1
        )
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_digest_check"
    CHECK (
      (
        (
          "fromState" = 'ABSENT'
          AND "fromConfigurationDigest" IS NULL
          AND "previousEventDigest" IS NULL
        )
        OR (
          "fromState" <> 'ABSENT'
          AND ("fromConfigurationDigest" COLLATE "C") ~
            '^[0-9a-f]{64}$'
          AND ("previousEventDigest" COLLATE "C") ~
            '^[0-9a-f]{64}$'
        )
      )
      AND ("toConfigurationDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("commandContentDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("actorDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("eventDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("receiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND (
        "eventType" NOT IN ('DRAIN_STARTED', 'DISABLED')
        OR "toConfigurationDigest" = "fromConfigurationDigest"
      )
      AND (
        "eventType" <> 'ROTATED'
        OR "toConfigurationDigest" <> "fromConfigurationDigest"
      )
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_timeline_check"
    CHECK (
      ("createdTransactionId" COLLATE "C") ~ '^[0-9]{1,32}$'
      AND "eventAt" >= TIMESTAMPTZ '2026-01-01 00:00:00+00'
    ),
  CONSTRAINT "identity_mail_tenant_enrollment_event_receipt_check"
    CHECK (
      "receipt" = pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'operation', 'APPEND_IDENTITY_MAIL_TENANT_ENROLLMENT_EVENT',
        'eventId', "id",
        'tenantId', "tenantId",
        'commandId', "commandId",
        'eventSequence', "eventSequence",
        'eventType', "eventType"::TEXT,
        'fromState', "fromState"::TEXT,
        'toState', "toState"::TEXT,
        'fromPolicyRevision', "fromPolicyRevision",
        'toPolicyRevision', "toPolicyRevision",
        'fromStateRevision', "fromStateRevision",
        'toStateRevision', "toStateRevision",
        'fromConfigurationDigest', "fromConfigurationDigest",
        'toConfigurationDigest', "toConfigurationDigest",
        'commandContentDigest', "commandContentDigest",
        'actorDigest', "actorDigest",
        'previousEventDigest', "previousEventDigest",
        'createdTransactionId', "createdTransactionId"::TEXT,
        'eventAtEpochMs',
          (EXTRACT(EPOCH FROM "eventAt") * 1000)::BIGINT
      )
      AND "receiptDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to("receipt"::TEXT, 'UTF8')
        ),
        'hex'
      )
      AND "eventDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            'IDENTITY_MAIL_TENANT_ENROLLMENT_EVENT_V1' || E'\n'
              || COALESCE(
                "previousEventDigest"::TEXT,
                pg_catalog.repeat('0', 64)
              ) || E'\n'
              || "receiptDigest" || E'\n',
            'UTF8'
          )
        ),
        'hex'
      )
    )
);

CREATE INDEX "identity_mail_tenant_enrollment_command_marker_idx"
  ON public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "deploymentMarkerId"
  );

CREATE INDEX "identity_mail_tenant_enrollment_command_rollback_idx"
  ON public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "rollbackOfCommandId"
  );

CREATE INDEX "identity_mail_tenant_enrollment_command_accepted_idx"
  ON public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "acceptedAt"
  );

CREATE INDEX "identity_mail_tenant_enrollment_event_timeline_idx"
  ON public."IdentityMailDeliveryTenantEnrollmentEvent" (
    "tenantId",
    "eventAt",
    "id"
  );

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentCommand_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey"
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
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentCommand_rollback_fkey"
  FOREIGN KEY ("tenantId", "rollbackOfCommandId")
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "id"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentEvent"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentEvent"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentEvent_command_fkey"
  FOREIGN KEY ("tenantId", "commandId", "commandContentDigest")
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "id",
    "authorizationEnvelopeDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentEvent"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollmentEvent_previous_fkey"
  FOREIGN KEY ("tenantId", "previousEventDigest")
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent" (
    "tenantId",
    "eventDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentEvent"
  ADD CONSTRAINT
    "IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey"
  FOREIGN KEY (
    "tenantId",
    "previousEventDigest",
    "fromState",
    "fromPolicyRevision",
    "fromStateRevision",
    "fromConfigurationDigest"
  )
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent" (
    "tenantId",
    "eventDigest",
    "toState",
    "toPolicyRevision",
    "toStateRevision",
    "toConfigurationDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD COLUMN "state" VARCHAR(16) NOT NULL,
  ADD COLUMN "stateRevision" BIGINT NOT NULL,
  ADD COLUMN "activeCommandId" TEXT,
  ADD COLUMN "lastEventDigest" CHAR(64) NOT NULL,
  ADD COLUMN "currentConfigurationDigest" CHAR(64) NOT NULL,
  ADD COLUMN "stateChangedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  DROP CONSTRAINT "IdentityMailDeliveryTenantEnrollment_state_check";

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollment_state_check"
  CHECK (
    (
      "state" = 'ACTIVE'
      AND "enabled" = true
      AND "activeCommandId" IS NULL
      AND "enabledAt" IS NOT NULL
      AND "disabledAt" IS NULL
      AND "enabledAt" <= "stateChangedAt"
    )
    OR (
      "state" = 'DRAINING'
      AND "enabled" = false
      AND "activeCommandId" IS NOT NULL
      AND "enabledAt" IS NOT NULL
      AND "disabledAt" IS NULL
      AND "enabledAt" <= "stateChangedAt"
    )
    OR (
      "state" = 'DISABLED'
      AND "enabled" = false
      AND "activeCommandId" IS NULL
      AND "enabledAt" IS NOT NULL
      AND "disabledAt" = "stateChangedAt"
      AND "disabledAt" >= "enabledAt"
    )
  );

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollment_ledger_check"
  CHECK (
    "stateRevision" >= "policyRevision"
    AND "stateRevision" > 0
    AND ("lastEventDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("currentConfigurationDigest" COLLATE "C") ~
      '^[0-9a-f]{64}$'
    AND "stateChangedAt" >= "createdAt"
    AND "updatedAt" >= "stateChangedAt"
    AND (
      "activeCommandId" IS NULL
      OR (
        "activeCommandId" = pg_catalog.lower(
          pg_catalog.btrim("activeCommandId") COLLATE "C"
        )
        AND ("activeCommandId" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  );

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollment_activeCommand_fkey"
  FOREIGN KEY ("tenantId", "activeCommandId", "stateRevision")
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "id",
    "drainStateRevision"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollment_lastEvent_fkey"
  FOREIGN KEY (
    "tenantId",
    "lastEventDigest",
    "state",
    "policyRevision",
    "stateRevision",
    "currentConfigurationDigest"
  )
  REFERENCES public."IdentityMailDeliveryTenantEnrollmentEvent" (
    "tenantId",
    "eventDigest",
    "toState",
    "toPolicyRevision",
    "toStateRevision",
    "toConfigurationDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "identity_mail_tenant_enrollment_worker_state_idx"
  ON public."IdentityMailDeliveryTenantEnrollment" (
    "workerRoleName",
    "workerRoleOid",
    "state"
  );

CREATE INDEX "identity_mail_tenant_enrollment_active_command_idx"
  ON public."IdentityMailDeliveryTenantEnrollment" (
    "tenantId",
    "activeCommandId"
  );

CREATE FUNCTION
  public."identity_mail_tenant_enrollment_command_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'Identity mail tenant enrollment command registry is dormant at CURRENT_180'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION public."identity_mail_tenant_enrollment_event_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'Identity mail tenant enrollment event ledger is dormant at CURRENT_180'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION
  public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'Identity mail tenant enrollment registry is dormant at CURRENT_180'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailEnrollmentCommand_dml_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON public."IdentityMailDeliveryTenantEnrollmentCommand"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_tenant_enrollment_command_guard_v1"();

CREATE TRIGGER "IdentityMailEnrollmentCommand_truncate_guard_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDeliveryTenantEnrollmentCommand"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_tenant_enrollment_command_guard_v1"();

CREATE TRIGGER "IdentityMailEnrollmentEvent_dml_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON public."IdentityMailDeliveryTenantEnrollmentEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_tenant_enrollment_event_guard_v1"();

CREATE TRIGGER "IdentityMailEnrollmentEvent_truncate_guard_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDeliveryTenantEnrollmentEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_tenant_enrollment_event_guard_v1"();

CREATE TRIGGER "IdentityMailEnrollment_00_dormant_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"();

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDeliveryTenantEnrollmentEvent"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_command_guard_v1"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_event_guard_v1"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION
  public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()
FROM PUBLIC;

COMMENT ON TABLE public."IdentityMailDeliveryTenantEnrollmentCommand" IS
  'Dormant immutable PII-free signed authority for one identity-mail tenant enrollment transition; no CURRENT_180 apply RPC exists.';

COMMENT ON COLUMN
  public."IdentityMailDeliveryTenantEnrollmentCommand"."proposalCanonicalJson"
IS
  'Exact canonical UTF-8 non-authorizing proposal bytes; authorization=false and canMutate=false are enforced.';

COMMENT ON COLUMN
  public."IdentityMailDeliveryTenantEnrollmentCommand"."authorizationEnvelopeCanonicalJson"
IS
  'Exact domain-separated mutation authority envelope covered by authorizationEnvelopeDigest and the externally verified Ed25519 signature.';

COMMENT ON TABLE public."IdentityMailDeliveryTenantEnrollmentEvent" IS
  'Dormant append-only PII-free tenant enrollment state ledger chained by previousEventDigest and monotonic stateRevision.';

COMMENT ON COLUMN
  public."IdentityMailDeliveryTenantEnrollment"."activeCommandId"
IS
  'Non-null only while an already persisted signed ROTATE or DISABLE command is in DRAINING.';

DO $postcondition$
DECLARE
  migration_owner_oid OID;
  command_column_count INTEGER;
  command_not_null_count INTEGER;
  command_default_count INTEGER;
  event_column_count INTEGER;
  event_not_null_count INTEGER;
  event_default_count INTEGER;
  enrollment_column_count INTEGER;
  enrollment_not_null_count INTEGER;
  enrollment_default_count INTEGER;
  command_constraint_count INTEGER;
  event_constraint_count INTEGER;
  enrollment_constraint_count INTEGER;
  command_index_count INTEGER;
  event_index_count INTEGER;
  enrollment_index_count INTEGER;
  unsafe_relation_acl_count INTEGER;
  unsafe_column_acl_count INTEGER;
  unsafe_function_acl_count INTEGER;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  IF migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."IdentityMailDeliveryTenantEnrollmentCommand"'),
           ('public."IdentityMailDeliveryTenantEnrollmentEvent"'),
           ('public."IdentityMailDeliveryTenantEnrollment"')
       ) AS expected("relation_name")
       LEFT JOIN pg_catalog.pg_class AS relation
         ON relation.oid = pg_catalog.to_regclass(expected."relation_name")
       WHERE relation.oid IS NULL
          OR relation.relkind IS DISTINCT FROM 'r'::"char"
          OR relation.relowner <> migration_owner_oid
      )
  THEN
    RAISE EXCEPTION 'CURRENT_180 relation ownership postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE attribute.attnotnull)::INTEGER,
    pg_catalog.count(default_value.oid)::INTEGER
  INTO
    command_column_count,
    command_not_null_count,
    command_default_count
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE attribute.attnotnull)::INTEGER,
    pg_catalog.count(default_value.oid)::INTEGER
  INTO
    event_column_count,
    event_not_null_count,
    event_default_count
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentEvent"'
  )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (WHERE attribute.attnotnull)::INTEGER,
    pg_catalog.count(default_value.oid)::INTEGER
  INTO
    enrollment_column_count,
    enrollment_not_null_count,
    enrollment_default_count
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE attribute.attrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  IF command_column_count <> 57
     OR command_not_null_count <> 46
     OR command_default_count <> 4
     OR event_column_count <> 21
     OR event_not_null_count <> 19
     OR event_default_count <> 0
     OR enrollment_column_count <> 21
     OR enrollment_not_null_count <> 18
     OR enrollment_default_count <> 4
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'proposalCanonicalJson',
             'text',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'authorizationEnvelopeDigest',
             'character(64)',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'authorizationEnvelopeCanonicalJson',
             'text',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'receipt',
             'jsonb',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'acceptedAt',
             'timestamp(3) with time zone',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'fromConfigurationDigest',
             'character(64)',
             false
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'eventDigest',
             'character(64)',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'receipt',
             'jsonb',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'state',
             'character varying(16)',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'stateRevision',
             'bigint',
             true
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'activeCommandId',
             'text',
             false
           ),
            (
              'IdentityMailDeliveryTenantEnrollment',
              'lastEventDigest',
              'character(64)',
              true
            ),
            (
              'IdentityMailDeliveryTenantEnrollment',
              'currentConfigurationDigest',
              'character(64)',
              true
            ),
            (
              'IdentityMailDeliveryTenantEnrollment',
              'stateChangedAt',
             'timestamp(3) with time zone',
             true
           )
       ) AS expected(
         "relation_name",
         "column_name",
         "type_name",
         "not_null"
       )
       LEFT JOIN pg_catalog.pg_class AS relation
         ON relation.oid = pg_catalog.to_regclass(
           'public.' || pg_catalog.quote_ident(expected."relation_name")
         )
       LEFT JOIN pg_catalog.pg_attribute AS attribute
         ON attribute.attrelid = relation.oid
        AND attribute.attname = expected."column_name"
        AND attribute.attnum > 0
        AND attribute.attisdropped = false
       WHERE attribute.attnum IS NULL
          OR pg_catalog.format_type(
            attribute.atttypid,
            attribute.atttypmod
          ) <> expected."type_name"
          OR attribute.attnotnull <> expected."not_null"
     )
  THEN
    RAISE EXCEPTION 'CURRENT_180 column catalog postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO command_constraint_count
  FROM pg_catalog.pg_constraint AS target_constraint
  WHERE target_constraint.conrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO event_constraint_count
  FROM pg_catalog.pg_constraint AS target_constraint
  WHERE target_constraint.conrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentEvent"'
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO enrollment_constraint_count
  FROM pg_catalog.pg_constraint AS target_constraint
  WHERE target_constraint.conrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  IF command_constraint_count <> 21
     OR event_constraint_count <> 16
     OR enrollment_constraint_count <> 9
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'identity_mail_tenant_enrollment_command_payload_check',
             'c'
           ),
            (
              'IdentityMailDeliveryTenantEnrollmentCommand',
              'identity_mail_tenant_enrollment_command_drain_projection_key',
              'u'
            ),
            (
              'IdentityMailDeliveryTenantEnrollmentCommand',
              'IdentityMailDeliveryTenantEnrollmentCommand_marker_fkey',
              'f'
            ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'identity_mail_tenant_enrollment_event_receipt_check',
             'c'
           ),
            (
              'IdentityMailDeliveryTenantEnrollmentEvent',
              'identity_mail_tenant_enrollment_event_terminal_projection_key',
              'u'
            ),
            (
              'IdentityMailDeliveryTenantEnrollmentEvent',
              'IdentityMailDeliveryTenantEnrollmentEvent_previous_fkey',
              'f'
            ),
            (
              'IdentityMailDeliveryTenantEnrollmentEvent',
              'IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey',
              'f'
            ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'identity_mail_tenant_enrollment_event_previous_uidx',
             'u'
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_state_check',
             'c'
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_ledger_check',
             'c'
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_activeCommand_fkey',
             'f'
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_lastEvent_fkey',
             'f'
           ),
           (
             'SharedBetaRuntimeReleaseMarker',
             'shared_beta_runtime_marker_enrollment_binding_key',
             'u'
           )
       ) AS expected("relation_name", "constraint_name", "constraint_type")
       LEFT JOIN pg_catalog.pg_constraint AS target_constraint
         ON target_constraint.conrelid = pg_catalog.to_regclass(
           'public.' || pg_catalog.quote_ident(expected."relation_name")
         )
        AND target_constraint.conname = expected."constraint_name"
       WHERE target_constraint.oid IS NULL
          OR target_constraint.contype <>
            expected."constraint_type"::"char"
          OR target_constraint.convalidated IS DISTINCT FROM true
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
            (
              'IdentityMailDeliveryTenantEnrollmentEvent',
              'IdentityMailDeliveryTenantEnrollmentEvent_previous_fkey'
            ),
            (
              'IdentityMailDeliveryTenantEnrollmentEvent',
              'IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey'
            ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_activeCommand_fkey'
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_lastEvent_fkey'
           )
       ) AS expected("relation_name", "constraint_name")
       LEFT JOIN pg_catalog.pg_constraint AS target_constraint
         ON target_constraint.conrelid = pg_catalog.to_regclass(
           'public.' || pg_catalog.quote_ident(expected."relation_name")
         )
        AND target_constraint.conname = expected."constraint_name"
       WHERE target_constraint.oid IS NULL
          OR target_constraint.condeferrable IS DISTINCT FROM true
          OR target_constraint.condeferred IS DISTINCT FROM true
      )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'identity_mail_tenant_enrollment_command_drain_projection_key',
             ARRAY[
               'tenantId', 'id', 'drainStateRevision'
             ]::TEXT[]
           ),
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'identity_mail_tenant_enrollment_event_terminal_projection_key',
             ARRAY[
               'tenantId', 'eventDigest', 'toState',
               'toPolicyRevision', 'toStateRevision',
               'toConfigurationDigest'
             ]::TEXT[]
           )
       ) AS expected(
         "relation_name",
         "constraint_name",
         "column_names"
       )
       LEFT JOIN pg_catalog.pg_constraint AS target_constraint
         ON target_constraint.conrelid = pg_catalog.to_regclass(
           'public.' || pg_catalog.quote_ident(expected."relation_name")
         )
        AND target_constraint.conname = expected."constraint_name"
       LEFT JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           attribute.attname
           ORDER BY key_column."ordinality"
         )::TEXT[] AS "column_names"
         FROM pg_catalog.unnest(
           target_constraint.conkey
         ) WITH ORDINALITY AS key_column("attnum", "ordinality")
         INNER JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = target_constraint.conrelid
          AND attribute.attnum = key_column."attnum"
       ) AS actual ON true
       WHERE target_constraint.oid IS NULL
          OR target_constraint.contype IS DISTINCT FROM 'u'::"char"
          OR actual."column_names" IS DISTINCT FROM
            expected."column_names"
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'IdentityMailDeliveryTenantEnrollmentEvent_continuity_fkey',
             'IdentityMailDeliveryTenantEnrollmentEvent',
             ARRAY[
               'tenantId', 'previousEventDigest', 'fromState',
               'fromPolicyRevision', 'fromStateRevision',
               'fromConfigurationDigest'
             ]::TEXT[],
             ARRAY[
               'tenantId', 'eventDigest', 'toState',
               'toPolicyRevision', 'toStateRevision',
               'toConfigurationDigest'
             ]::TEXT[]
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_activeCommand_fkey',
             'IdentityMailDeliveryTenantEnrollmentCommand',
             ARRAY[
               'tenantId', 'activeCommandId', 'stateRevision'
             ]::TEXT[],
             ARRAY[
               'tenantId', 'id', 'drainStateRevision'
             ]::TEXT[]
           ),
           (
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollment_lastEvent_fkey',
             'IdentityMailDeliveryTenantEnrollmentEvent',
             ARRAY[
               'tenantId', 'lastEventDigest', 'state',
               'policyRevision', 'stateRevision',
               'currentConfigurationDigest'
             ]::TEXT[],
             ARRAY[
               'tenantId', 'eventDigest', 'toState',
               'toPolicyRevision', 'toStateRevision',
               'toConfigurationDigest'
             ]::TEXT[]
           )
       ) AS expected(
         "relation_name",
         "constraint_name",
         "referenced_relation_name",
         "column_names",
         "referenced_column_names"
       )
       LEFT JOIN pg_catalog.pg_constraint AS target_constraint
         ON target_constraint.conrelid = pg_catalog.to_regclass(
           'public.' || pg_catalog.quote_ident(expected."relation_name")
         )
        AND target_constraint.conname = expected."constraint_name"
       LEFT JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           attribute.attname
           ORDER BY key_column."ordinality"
         )::TEXT[] AS "column_names"
         FROM pg_catalog.unnest(
           target_constraint.conkey
         ) WITH ORDINALITY AS key_column("attnum", "ordinality")
         INNER JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = target_constraint.conrelid
          AND attribute.attnum = key_column."attnum"
       ) AS actual ON true
       LEFT JOIN LATERAL (
         SELECT pg_catalog.array_agg(
           attribute.attname
           ORDER BY key_column."ordinality"
         )::TEXT[] AS "column_names"
         FROM pg_catalog.unnest(
           target_constraint.confkey
         ) WITH ORDINALITY AS key_column("attnum", "ordinality")
         INNER JOIN pg_catalog.pg_attribute AS attribute
           ON attribute.attrelid = target_constraint.confrelid
          AND attribute.attnum = key_column."attnum"
       ) AS referenced ON true
       WHERE target_constraint.oid IS NULL
          OR target_constraint.contype IS DISTINCT FROM 'f'::"char"
          OR target_constraint.confrelid IS DISTINCT FROM
            pg_catalog.to_regclass(
              'public.' || pg_catalog.quote_ident(
                expected."referenced_relation_name"
              )
            )
          OR target_constraint.confmatchtype IS DISTINCT FROM 's'::"char"
          OR target_constraint.confupdtype IS DISTINCT FROM 'r'::"char"
          OR target_constraint.confdeltype IS DISTINCT FROM 'r'::"char"
          OR actual."column_names" IS DISTINCT FROM
            expected."column_names"
          OR referenced."column_names" IS DISTINCT FROM
            expected."referenced_column_names"
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS target_constraint
       INNER JOIN pg_catalog.pg_index AS target_index
         ON target_index.indexrelid = target_constraint.conindid
       WHERE target_constraint.conrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollmentEvent"'
       )
         AND target_constraint.conname =
           'identity_mail_tenant_enrollment_event_previous_uidx'
         AND target_constraint.contype = 'u'::"char"
         AND target_index.indnullsnotdistinct = true
         AND target_index.indnkeyatts = 2
     )
  THEN
    RAISE EXCEPTION 'CURRENT_180 constraint catalog postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO command_index_count
  FROM pg_catalog.pg_index AS target_index
  WHERE target_index.indrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentCommand"'
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO event_index_count
  FROM pg_catalog.pg_index AS target_index
  WHERE target_index.indrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollmentEvent"'
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO enrollment_index_count
  FROM pg_catalog.pg_index AS target_index
  WHERE target_index.indrelid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  IF command_index_count <> 8
     OR event_index_count <> 7
     OR enrollment_index_count <> 4
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS target_index
       WHERE target_index.indrelid IN (
         pg_catalog.to_regclass(
           'public."IdentityMailDeliveryTenantEnrollmentCommand"'
         ),
         pg_catalog.to_regclass(
           'public."IdentityMailDeliveryTenantEnrollmentEvent"'
         ),
         pg_catalog.to_regclass(
           'public."IdentityMailDeliveryTenantEnrollment"'
         )
       )
         AND (
           target_index.indisvalid IS DISTINCT FROM true
           OR target_index.indisready IS DISTINCT FROM true
         )
     )
  THEN
    RAISE EXCEPTION 'CURRENT_180 index catalog postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'IdentityMailDeliveryTenantEnrollmentCommand',
          'IdentityMailEnrollmentCommand_dml_guard_trigger',
          'identity_mail_tenant_enrollment_command_guard_v1',
          30
        ),
        (
          'IdentityMailDeliveryTenantEnrollmentCommand',
          'IdentityMailEnrollmentCommand_truncate_guard_trigger',
          'identity_mail_tenant_enrollment_command_guard_v1',
          34
        ),
        (
          'IdentityMailDeliveryTenantEnrollmentEvent',
          'IdentityMailEnrollmentEvent_dml_guard_trigger',
          'identity_mail_tenant_enrollment_event_guard_v1',
          30
        ),
        (
          'IdentityMailDeliveryTenantEnrollmentEvent',
          'IdentityMailEnrollmentEvent_truncate_guard_trigger',
          'identity_mail_tenant_enrollment_event_guard_v1',
          34
        ),
        (
          'IdentityMailDeliveryTenantEnrollment',
          'IdentityMailEnrollment_00_dormant_guard_trigger',
          'identity_mail_tenant_enrollment_registry_dormant_guard_v1',
          30
        )
    ) AS expected(
      "relation_name",
      "trigger_name",
      "function_name",
      "trigger_type"
    )
    LEFT JOIN pg_catalog.pg_trigger AS target_trigger
      ON target_trigger.tgrelid = pg_catalog.to_regclass(
        'public.' || pg_catalog.quote_ident(expected."relation_name")
      )
     AND target_trigger.tgname = expected."trigger_name"
     AND target_trigger.tgisinternal = false
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = target_trigger.tgfoid
    WHERE target_trigger.oid IS NULL
       OR target_trigger.tgtype <> expected."trigger_type"
       OR target_trigger.tgenabled IS DISTINCT FROM 'O'::"char"
       OR routine.proname <> expected."function_name"
  )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS target_trigger
       WHERE target_trigger.tgrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollmentCommand"'
       )
         AND target_trigger.tgisinternal = false
     ) <> 2
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS target_trigger
       WHERE target_trigger.tgrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollmentEvent"'
       )
         AND target_trigger.tgisinternal = false
     ) <> 2
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS target_trigger
       WHERE target_trigger.tgrelid = pg_catalog.to_regclass(
         'public."IdentityMailDeliveryTenantEnrollment"'
       )
         AND target_trigger.tgisinternal = false
     ) <> 3
  THEN
    RAISE EXCEPTION 'CURRENT_180 trigger catalog postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('identity_mail_tenant_enrollment_command_guard_v1'),
        ('identity_mail_tenant_enrollment_event_guard_v1'),
        ('identity_mail_tenant_enrollment_registry_dormant_guard_v1')
    ) AS expected("function_name")
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(
        'public.' || pg_catalog.quote_ident(expected."function_name") || '()'
      )
    LEFT JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR routine.proowner <> migration_owner_oid
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prorettype IS DISTINCT FROM
         pg_catalog.to_regtype('pg_catalog.trigger')
       OR routine.prosecdef IS DISTINCT FROM false
       OR routine.provolatile IS DISTINCT FROM 'v'::"char"
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR language.lanname IS DISTINCT FROM 'plpgsql'
       OR routine.proconfig IS DISTINCT FROM
         ARRAY['search_path=pg_catalog']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'CURRENT_180 guard routine postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_relation_acl_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) AS privilege
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'IdentityMailDeliveryTenantEnrollmentCommand',
      'IdentityMailDeliveryTenantEnrollmentEvent',
      'IdentityMailDeliveryTenantEnrollment'
    )
    AND privilege.grantee <> relation.relowner;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_column_acl_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'IdentityMailDeliveryTenantEnrollmentCommand',
      'IdentityMailDeliveryTenantEnrollmentEvent',
      'IdentityMailDeliveryTenantEnrollment'
    )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false
    AND privilege.grantee <> relation.relowner;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_function_acl_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f', routine.proowner)
    )
  ) AS privilege
  WHERE namespace.nspname = 'public'
    AND routine.proname IN (
      'identity_mail_tenant_enrollment_command_guard_v1',
      'identity_mail_tenant_enrollment_event_guard_v1',
      'identity_mail_tenant_enrollment_registry_dormant_guard_v1'
    )
    AND privilege.grantee <> routine.proowner;

  IF unsafe_relation_acl_count <> 0
     OR unsafe_column_acl_count <> 0
     OR unsafe_function_acl_count <> 0
  THEN
    RAISE EXCEPTION 'CURRENT_180 owner-only ACL postcondition failed'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollment"
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollmentCommand"
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollmentEvent"
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailOutbox" AS outbox
       WHERE outbox."status" =
         'CLAIMED'::public."IdentityMailOutboxStatus"
     )
  THEN
    RAISE EXCEPTION 'CURRENT_180 must remain empty and dormant'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public."identity_mail_delivery_worker_assert_v1"(text)',
          'a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37'
        ),
        (
          'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
          'f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b'
        ),
        (
          'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
          'a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742'
        ),
        (
          'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
          '650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc'
        ),
        (
          'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
          'a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2'
        )
    ) AS required("signature", "prosrc_sha256")
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    WHERE routine.oid IS NULL
       OR pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(routine.prosrc, 'UTF8')
         ),
         'hex'
       ) <> required."prosrc_sha256"
  ) THEN
    RAISE EXCEPTION 'CURRENT_180 changed worker v1 source'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
