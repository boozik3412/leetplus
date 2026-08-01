BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT_181 is a stacked, disposable-rehearsal-only candidate above the
-- exact dormant CURRENT_180 candidate. It is NOT_DEPLOYABLE. It grants no
-- authority, creates no enrollment, and leaves the CURRENT_180 enrollment
-- statement guard enabled. The only callable non-trigger routines after this
-- transaction are the implicit database-owner paths; worker v2 receives zero
-- EXECUTE grants. Legacy producer v1 signatures are retired before any v2
-- surface is installed.
DO $prerequisite$
DECLARE
  completed_migration_count INTEGER;
  lexical_migration_head TEXT;
  migration_manifest_digest TEXT;
  migration_owner_oid OID;
  candidate_receipt_count INTEGER;
  candidate_receipt_checksum TEXT;
  candidate_receipt_applied_steps INTEGER;
  rehearsal_confirmation TEXT;
  rehearsal_candidate_sha256 TEXT;
BEGIN
  rehearsal_confirmation := pg_catalog.current_setting(
    'leetplus.identity_mail_tenant_lock_drain_current181_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_tenant_lock_drain_current181_sha256',
    true
  );

  IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-tenant-lock-drain-current181'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT_181 candidate is restricted to the confirmed disposable rehearsal boundary'
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
      '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
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
      'CURRENT_181 requires one exact unfinished Prisma rehearsal receipt'
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

  IF completed_migration_count IS DISTINCT FROM 180
     OR lexical_migration_head IS DISTINCT FROM
       '20260801010000_identity_mail_tenant_enrollment_control_plane'
     OR migration_manifest_digest IS DISTINCT FROM
       'c41f3854bff364deb4f169f56f31bb5bd7e46249a677c66bc879cb967b6fae58'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260801010000_identity_mail_tenant_enrollment_control_plane'
         AND migration."checksum" =
           'e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_181 requires the exact completed dormant CURRENT_180 candidate'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollmentCommand"'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollmentEvent"'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollment"'
     ) IS NULL
     OR pg_catalog.to_regclass('public."IdentityMailOutbox"') IS NULL
     OR pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"') IS NULL
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"()'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'CURRENT_181 dormant enrollment foundation is incomplete'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS target_trigger
       WHERE target_trigger.tgrelid = pg_catalog.to_regclass(
           'public."IdentityMailDeliveryTenantEnrollment"'
         )
         AND target_trigger.tgname =
           'IdentityMailEnrollment_00_dormant_guard_trigger'
         AND target_trigger.tgenabled = 'O'
         AND NOT target_trigger.tgisinternal
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryTenantEnrollment"
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailOutbox" AS outbox
       WHERE outbox."status" =
         'CLAIMED'::public."IdentityMailOutboxStatus"
          OR outbox."attempts" <> 0
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryEvent" AS delivery_event
       WHERE delivery_event."attemptNumber" <> 0
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_181 requires dormant enrollment, zero claims and zero historical attempts'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid IN (
        pg_catalog.to_regclass('public."IdentityMailOutbox"'),
        pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"')
      )
      AND attribute.attname IN (
        'claimEnrollmentStateRevision',
        'claimPolicyRevision',
        'claimProviderAuthorityDigest'
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public."identity_mail_tenant_lock_v1"(text)'),
        ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
        ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
        ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
        ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)')
    ) AS candidate("signature")
    WHERE pg_catalog.to_regprocedure(candidate."signature") IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CURRENT_181 target catalog is not pristine'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailOutbox"'
  );

  IF migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."IdentityMailDeliveryEvent"'),
           ('public."IdentityMailDeliveryTenantEnrollment"'),
           ('public."IdentityMailDeliveryTenantEnrollmentCommand"'),
           ('public."IdentityMailDeliveryTenantEnrollmentEvent"')
       ) AS required("relation_name")
       LEFT JOIN pg_catalog.pg_class AS relation
         ON relation.oid = pg_catalog.to_regclass(required."relation_name")
       WHERE relation.oid IS NULL
          OR relation.relowner <> migration_owner_oid
     )
  THEN
    RAISE EXCEPTION 'CURRENT_181 migration ownership is unsafe'
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
        ),
        (
          'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
          '6ebfbc2d6dd435fe7b4abc474ebc8e43b7178de8bd9723e3eb420f4079ed7d8e'
        ),
        (
          'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
          'a4c3b991e7cf6927bddef8fe2b6cc9d4a7771d79bea0533c776a6d7302530dd0'
        ),
        (
          'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
          'a114fc0f36d3d633b91ac8973b60e9ea96dd67174bdd5349fd005e17435a3a34'
        )
    ) AS required("signature", "prosrc_sha256")
    LEFT JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    LEFT JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
    WHERE routine.oid IS NULL
       OR routine.proowner <> migration_owner_oid
       OR pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
         'hex'
       ) <> required."prosrc_sha256"
       OR routine.prokind IS DISTINCT FROM 'f'::"char"
       OR routine.prosecdef IS DISTINCT FROM true
       OR routine.provolatile IS DISTINCT FROM 'v'::"char"
       OR routine.proparallel IS DISTINCT FROM 'u'::"char"
       OR language.lanname IS DISTINCT FROM 'plpgsql'
       OR routine.proconfig IS DISTINCT FROM
         ARRAY['search_path=pg_catalog']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'CURRENT_181 predecessor routine contract drifted'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public."identity_mail_delivery_worker_assert_v1"(text)'),
        ('public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'),
        ('public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)'),
        ('public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)')
    ) AS required("signature")
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) AS privilege
    WHERE privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee <> routine.proowner
  ) THEN
    RAISE EXCEPTION
      'CURRENT_181 requires zero non-owner worker v1 or reconcile v1 EXECUTE'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisite$;

ALTER TABLE public."IdentityMailOutbox"
  ADD COLUMN "claimEnrollmentStateRevision" BIGINT,
  ADD COLUMN "claimPolicyRevision" INTEGER,
  ADD COLUMN "claimProviderAuthorityDigest" CHAR(64),
  ADD CONSTRAINT "identity_mail_outbox_claim_enrollment_binding_check"
  CHECK (
    (
      "attempts" = 0
      AND "claimEnrollmentStateRevision" IS NULL
      AND "claimPolicyRevision" IS NULL
      AND "claimProviderAuthorityDigest" IS NULL
    )
    OR (
      "attempts" >= 1
      AND "claimEnrollmentStateRevision" >= 1
      AND "claimPolicyRevision" >= 1
      AND "claimEnrollmentStateRevision" >= "claimPolicyRevision"
      AND ("claimProviderAuthorityDigest" COLLATE "C") ~
        '^[0-9a-f]{64}$'
    )
  );

ALTER TABLE public."IdentityMailDeliveryEvent"
  ADD COLUMN "claimEnrollmentStateRevision" BIGINT,
  ADD COLUMN "claimPolicyRevision" INTEGER,
  ADD COLUMN "claimProviderAuthorityDigest" CHAR(64),
  ADD CONSTRAINT
    "identity_mail_delivery_event_claim_enrollment_binding_check"
  CHECK (
    (
      "attemptNumber" = 0
      AND "claimEnrollmentStateRevision" IS NULL
      AND "claimPolicyRevision" IS NULL
      AND "claimProviderAuthorityDigest" IS NULL
    )
    OR (
      "attemptNumber" >= 1
      AND "claimEnrollmentStateRevision" >= 1
      AND "claimPolicyRevision" >= 1
      AND "claimEnrollmentStateRevision" >= "claimPolicyRevision"
      AND ("claimProviderAuthorityDigest" COLLATE "C") ~
        '^[0-9a-f]{64}$'
    )
  );

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  DROP CONSTRAINT IF EXISTS
    "identity_mail_tenant_enrollment_command_mutation_check";

ALTER TABLE public."IdentityMailDeliveryTenantEnrollmentCommand"
  ADD CONSTRAINT "identity_mail_tenant_enrollment_command_mutation_check"
  CHECK (
    (
      "action" = 'ENABLE'
      AND (
        "expectedState" = 'ABSENT'
        OR (
          "expectedState" = 'DISABLED'
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
      )
    )
    OR (
      "action" = 'ROTATE'
      AND "targetConfigurationDigest" <> "previousConfigurationDigest"
    )
    OR (
      "action" = 'DISABLE'
      AND "targetWorkerRoleName" = "previousWorkerRoleName"
      AND "targetWorkerRoleOid" = "previousWorkerRoleOid"
      AND "targetProviderAuthorityDigest" =
        "previousProviderAuthorityDigest"
      AND "targetMaxAttempts" = "previousMaxAttempts"
      AND "targetLeaseSeconds" = "previousLeaseSeconds"
      AND "targetAcknowledgeSeconds" = "previousAcknowledgeSeconds"
      AND "targetBaseRetrySeconds" = "previousBaseRetrySeconds"
      AND "targetMaxRetrySeconds" = "previousMaxRetrySeconds"
      AND "targetConfigurationDigest" = "previousConfigurationDigest"
    )
  );

CREATE UNIQUE INDEX
  "identity_mail_tenant_enrollment_command_rollback_once_uidx"
  ON public."IdentityMailDeliveryTenantEnrollmentCommand" (
    "tenantId",
    "rollbackOfCommandId"
  )
  WHERE "intent" = 'ROLLBACK' AND "rollbackOfCommandId" IS NOT NULL;

CREATE INDEX "identity_mail_outbox_ready_tenant_v2_idx"
  ON public."IdentityMailOutbox" (
    "tenantId",
    "availableAt",
    "createdAt",
    "id"
  )
  WHERE "status" IN (
    'PENDING'::public."IdentityMailOutboxStatus",
    'RETRY'::public."IdentityMailOutboxStatus"
  );

CREATE INDEX "identity_mail_outbox_drain_barrier_v2_idx"
  ON public."IdentityMailOutbox" ("tenantId", "id")
  WHERE "status" IN (
    'HOLD'::public."IdentityMailOutboxStatus",
    'PENDING'::public."IdentityMailOutboxStatus",
    'RETRY'::public."IdentityMailOutboxStatus",
    'CLAIMED'::public."IdentityMailOutboxStatus"
  );

CREATE INDEX "identity_mail_outbox_secret_barrier_v2_idx"
  ON public."IdentityMailOutbox" ("tenantId", "id")
  WHERE "secretCiphertext" IS NOT NULL;

CREATE INDEX "identity_mail_outbox_unmarked_tenant_v2_idx"
  ON public."IdentityMailOutbox" ("tenantId", "leaseExpiresAt", "id")
  WHERE "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
    AND "providerAttemptKey" IS NULL;

CREATE INDEX "identity_mail_outbox_marked_tenant_v2_idx"
  ON public."IdentityMailOutbox" (
    "tenantId",
    "providerAcknowledgeUntil",
    "id"
  )
  WHERE "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
    AND "providerAttemptKey" IS NOT NULL;

DROP TRIGGER "IdentityMailOutbox_delivery_guard_trigger"
ON public."IdentityMailOutbox";

DROP TRIGGER "IdentityMailOutbox_delivery_event_trigger"
ON public."IdentityMailOutbox";

CREATE FUNCTION public."identity_mail_outbox_delivery_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" IS DISTINCT FROM
         'HOLD'::public."IdentityMailOutboxStatus"
       OR NEW."claimEnrollmentStateRevision" IS NOT NULL
       OR NEW."claimPolicyRevision" IS NOT NULL
       OR NEW."claimProviderAuthorityDigest" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Identity mail outbox must be inserted as unclaimed HOLD'
        USING ERRCODE = '55000';
    END IF;
    NEW."updatedAt" := NEW."createdAt";
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Identity mail outbox cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF (
       pg_catalog.to_jsonb(OLD)
         - ARRAY[
             'status',
             'releasedAt',
             'attempts',
             'leaseVersion',
             'transitionRevision',
             'availableAt',
             'leaseOwnerDigest',
             'leaseTokenDigest',
             'claimedAt',
             'leaseExpiresAt',
             'claimEnrollmentStateRevision',
             'claimPolicyRevision',
             'claimProviderAuthorityDigest',
             'providerAttemptKey',
             'providerAttemptedAt',
             'providerAcknowledgeUntil',
             'providerAuthorityDigest',
             'messageIdDigest',
             'providerOutcomeClass',
             'providerObservedAt',
             'providerReceiptDigest',
             'terminalAckDigest',
             'secretCiphertext',
             'ciphertextClearedAt',
             'sentAt',
             'terminalAt',
             'stateReasonCode',
             'updatedAt'
           ]::TEXT[]
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(NEW)
         - ARRAY[
             'status',
             'releasedAt',
             'attempts',
             'leaseVersion',
             'transitionRevision',
             'availableAt',
             'leaseOwnerDigest',
             'leaseTokenDigest',
             'claimedAt',
             'leaseExpiresAt',
             'claimEnrollmentStateRevision',
             'claimPolicyRevision',
             'claimProviderAuthorityDigest',
             'providerAttemptKey',
             'providerAttemptedAt',
             'providerAcknowledgeUntil',
             'providerAuthorityDigest',
             'messageIdDigest',
             'providerOutcomeClass',
             'providerObservedAt',
             'providerReceiptDigest',
             'terminalAckDigest',
             'secretCiphertext',
             'ciphertextClearedAt',
             'sentAt',
             'terminalAt',
             'stateReasonCode',
             'updatedAt'
           ]::TEXT[]
     )
  THEN
    RAISE EXCEPTION 'Identity mail outbox authority fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'HOLD'::public."IdentityMailOutboxStatus"
     AND NEW."status" = 'PENDING'::public."IdentityMailOutboxStatus"
  THEN
    IF OLD."releasedAt" IS NOT NULL
       OR NEW."releasedAt" IS NULL
       OR NEW."attempts" <> 0
       OR NEW."leaseVersion" <> 0
       OR NEW."transitionRevision" <> 0
       OR NEW."claimEnrollmentStateRevision" IS NOT NULL
       OR NEW."claimPolicyRevision" IS NOT NULL
       OR NEW."claimProviderAuthorityDigest" IS NOT NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public."SharedBetaTenantActivationCommand" AS command
         WHERE command."tenantId" = OLD."tenantId"
           AND command."outboxId" = OLD."id"
           AND command."issueCommandId" = OLD."issueCommandId"
           AND command."inviteId" = OLD."inviteId"
           AND command."workflowLocator" = OLD."workflowLocator"
           AND command."issueRequestDigest" = OLD."issueRequestDigest"
           AND command."tokenHash" = OLD."tokenHash"
           AND command."activatedAt" = NEW."releasedAt"
           AND command."createdTransactionId" =
             pg_catalog.pg_current_xact_id()::TEXT
       )
    THEN
      RAISE EXCEPTION 'Identity mail release transition is invalid'
        USING ERRCODE = '55000';
    END IF;

    NEW."availableAt" := NEW."releasedAt";
    NEW."transitionRevision" := 1;
    NEW."updatedAt" := NEW."releasedAt";
    PERFORM pg_catalog.set_config(
      'leetplus.identity_mail_delivery_event',
      'RELEASED',
      true
    );
    RETURN NEW;
  END IF;

  event_type := pg_catalog.current_setting(
    'leetplus.identity_mail_delivery_event',
    true
  );

  IF event_type = 'CLAIMED' THEN
    IF NEW."claimEnrollmentStateRevision" IS NULL
       OR NEW."claimPolicyRevision" IS NULL
       OR NEW."claimProviderAuthorityDigest" IS NULL
       OR NEW."attempts" <> OLD."attempts" + 1
       OR NEW."leaseVersion" <> NEW."attempts"
    THEN
      RAISE EXCEPTION 'Identity mail claim authority capture is invalid'
        USING ERRCODE = '55000';
    END IF;
  ELSIF NEW."claimEnrollmentStateRevision" IS DISTINCT FROM
          OLD."claimEnrollmentStateRevision"
     OR NEW."claimPolicyRevision" IS DISTINCT FROM OLD."claimPolicyRevision"
     OR NEW."claimProviderAuthorityDigest" IS DISTINCT FROM
          OLD."claimProviderAuthorityDigest"
  THEN
    RAISE EXCEPTION 'Identity mail claim authority is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."releasedAt" IS DISTINCT FROM OLD."releasedAt"
     OR NEW."transitionRevision" <> OLD."transitionRevision" + 1
     OR NEW."updatedAt" <= OLD."updatedAt"
     OR event_type IS NULL
     OR NOT (
       (
         event_type = 'CLAIMED'
         AND OLD."status" IN (
           'PENDING'::public."IdentityMailOutboxStatus",
           'RETRY'::public."IdentityMailOutboxStatus"
         )
         AND NEW."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_MARKED'
         AND OLD."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND NEW."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."providerAttemptKey" IS NOT NULL
       )
       OR (
         event_type IN ('PRE_PROVIDER_RETRY', 'REAP_RETRY')
         AND OLD."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" = 'RETRY'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('PRE_PROVIDER_DEAD', 'REAP_DEAD')
         AND OLD."status" IN (
           'RETRY'::public."IdentityMailOutboxStatus",
           'CLAIMED'::public."IdentityMailOutboxStatus"
         )
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" = 'DEAD'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('CANCELED', 'REAP_CANCELED')
         AND OLD."status" IN (
           'HOLD'::public."IdentityMailOutboxStatus",
           'PENDING'::public."IdentityMailOutboxStatus",
           'RETRY'::public."IdentityMailOutboxStatus",
           'CLAIMED'::public."IdentityMailOutboxStatus"
         )
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" = 'CANCELED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_ACCEPTED'
         AND OLD."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" = 'SENT'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_DEFINITIVE_NOT_SENT'
         AND OLD."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" = 'DEAD'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('PROVIDER_AMBIGUOUS', 'REAP_AMBIGUOUS')
         AND OLD."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_SENT'
         AND OLD."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" = 'SENT'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_DEAD'
         AND OLD."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" = 'DEAD'::public."IdentityMailOutboxStatus"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail delivery v2 transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public."identity_mail_delivery_event_append_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  event_type TEXT;
  event_digest TEXT;
  actor_digest TEXT;
BEGIN
  event_type := pg_catalog.current_setting(
    'leetplus.identity_mail_delivery_event',
    true
  );

  IF event_type IS NULL
     OR NEW."transitionRevision" <> OLD."transitionRevision" + 1
  THEN
    RAISE EXCEPTION 'Identity mail delivery event context is missing'
      USING ERRCODE = '55000';
  END IF;

  IF event_type IN (
       'REAP_RETRY',
       'REAP_DEAD',
       'REAP_CANCELED',
       'REAP_AMBIGUOUS',
       'RECONCILED_SENT',
       'RECONCILED_DEAD'
     )
  THEN
    actor_digest := pg_catalog.current_setting(
      'leetplus.identity_mail_delivery_actor_digest',
      true
    );
    IF actor_digest IS NULL
       OR (actor_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION 'Identity mail delivery actor context is missing'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    actor_digest := NULL;
  END IF;

  event_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2',
          NEW."tenantId",
          NEW."id",
          NEW."inviteId",
          NEW."transitionRevision"::TEXT,
          NEW."leaseVersion"::TEXT,
          NEW."attempts"::TEXT,
          event_type,
          OLD."status"::TEXT,
          NEW."status"::TEXT,
          COALESCE(NEW."leaseOwnerDigest", OLD."leaseOwnerDigest", '-'),
          COALESCE(NEW."claimEnrollmentStateRevision"::TEXT, '-'),
          COALESCE(NEW."claimPolicyRevision"::TEXT, '-'),
          COALESCE(NEW."claimProviderAuthorityDigest", '-'),
          COALESCE(NEW."providerAttemptKey", '-'),
          COALESCE(NEW."providerAuthorityDigest", '-'),
          COALESCE(NEW."messageIdDigest", '-'),
          COALESCE(NEW."providerOutcomeClass", '-'),
          COALESCE(NEW."providerReceiptDigest", '-'),
          COALESCE(NEW."terminalAckDigest", '-'),
          COALESCE(actor_digest, '-'),
          COALESCE(NEW."stateReasonCode", '-'),
          pg_catalog.floor(
            pg_catalog.date_part('epoch', NEW."updatedAt") * 1000
          )::BIGINT::TEXT,
          pg_catalog.pg_current_xact_id()::TEXT
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  INSERT INTO public."IdentityMailDeliveryEvent" (
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
    "claimEnrollmentStateRevision",
    "claimPolicyRevision",
    "claimProviderAuthorityDigest",
    "providerAttemptKey",
    "providerAuthorityDigest",
    "messageIdDigest",
    "providerOutcomeClass",
    "providerReceiptDigest",
    "terminalAckDigest",
    "actorDigest",
    "stateReasonCode",
    "eventAt",
    "createdTransactionId",
    "eventDigest"
  )
  VALUES (
    NEW."id" || ':' || NEW."transitionRevision"::TEXT,
    NEW."tenantId",
    NEW."id",
    NEW."inviteId",
    NEW."transitionRevision",
    NEW."leaseVersion",
    NEW."attempts",
    event_type,
    OLD."status",
    NEW."status",
    COALESCE(NEW."leaseOwnerDigest", OLD."leaseOwnerDigest"),
    NEW."claimEnrollmentStateRevision",
    NEW."claimPolicyRevision",
    NEW."claimProviderAuthorityDigest",
    NEW."providerAttemptKey",
    NEW."providerAuthorityDigest",
    NEW."messageIdDigest",
    NEW."providerOutcomeClass",
    NEW."providerReceiptDigest",
    NEW."terminalAckDigest",
    actor_digest,
    NEW."stateReasonCode",
    NEW."updatedAt",
    pg_catalog.pg_current_xact_id()::TEXT,
    event_digest
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER "IdentityMailOutbox_delivery_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON public."IdentityMailOutbox"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_outbox_delivery_guard_v2"();

CREATE TRIGGER "IdentityMailOutbox_delivery_event_trigger"
AFTER UPDATE
ON public."IdentityMailOutbox"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_delivery_event_append_v2"();

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_outbox_delivery_guard_v2"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_delivery_event_append_v2"()
FROM PUBLIC;

CREATE FUNCTION public."identity_mail_tenant_lock_v1"(
  p_tenant_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  statement_timeout_interval INTERVAL;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id <> pg_catalog.lower(
       pg_catalog.btrim(p_tenant_id COLLATE "C")
     )
     OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity mail tenant lock input is invalid'
      USING ERRCODE = '22023';
  END IF;

  statement_timeout_interval :=
    pg_catalog.current_setting('statement_timeout')::INTERVAL;

  IF pg_catalog.current_setting('transaction_isolation') <>
       'serializable'
     OR pg_catalog.current_setting('transaction_read_only') <> 'off'
     OR statement_timeout_interval <= INTERVAL '0 milliseconds'
     OR statement_timeout_interval > INTERVAL '30 seconds'
  THEN
    RAISE EXCEPTION
      'Identity mail tenant lock requires read-write SERIALIZABLE and a pre-armed statement_timeout in (0,30s]'
      USING ERRCODE = '25001';
  END IF;

  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-tenant:v1:' || p_tenant_id, 180
    )
  );

  RETURN p_tenant_id;
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT) IS
  'Owner-only shared transaction advisory lock primitive for every future identity-mail producer, worker, reconcile and enrollment coordinator path.';

CREATE OR REPLACE FUNCTION public."identity_owner_invite_issue_hold_v1"(
  requested_workflow_locator TEXT,
  expected_tenant_id TEXT,
  expected_reservation_subject_id TEXT,
  expected_claim_revision INTEGER,
  issue_request_id TEXT,
  issue_request_digest TEXT,
  requested_aad_environment TEXT,
  candidate_command_id TEXT,
  candidate_invite_id TEXT,
  candidate_outbox_id TEXT,
  candidate_message_key TEXT,
  candidate_token_hash TEXT,
  candidate_secret_ciphertext BYTEA,
  candidate_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public."shared_beta_tenant_activate_v1"(
  candidate_activation_command_id TEXT,
  expected_tenant_id TEXT,
  activation_request_id TEXT,
  activation_request_digest TEXT,
  expected_decision_id TEXT,
  expected_deployment_marker_id TEXT,
  activated_by_user_id TEXT,
  issue_request_id TEXT,
  issue_request_digest TEXT,
  candidate_issue_command_id TEXT,
  candidate_invite_id TEXT,
  candidate_outbox_id TEXT,
  candidate_message_key TEXT,
  candidate_token_hash TEXT,
  candidate_secret_ciphertext BYTEA,
  candidate_invite_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_owner_invite_issue_hold_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."shared_beta_tenant_activate_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_owner_invite_issue_hold_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
) IS
  'CURRENT_181 immediate fail-closed stub. The legacy producer is retired before any relation read, lock or DML.';

COMMENT ON FUNCTION public."shared_beta_tenant_activate_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
) IS
  'CURRENT_181 immediate fail-closed stub. The legacy activation producer is retired before any relation read, lock or DML.';

CREATE FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  p_tenant_id TEXT,
  p_provider_authority_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  enrollment_record RECORD;
  migration_count INTEGER;
  migration_head TEXT;
  candidate_checksum TEXT;
BEGIN
  IF p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity mail worker v2 authority is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT
    enrollment."tenantId",
    enrollment."workerRoleName",
    enrollment."workerRoleOid",
    enrollment."policyRevision",
    enrollment."state",
    enrollment."stateRevision",
    enrollment."activeCommandId",
    enrollment."maxAttempts",
    enrollment."leaseSeconds",
    enrollment."acknowledgeSeconds",
    enrollment."baseRetrySeconds",
    enrollment."maxRetrySeconds",
    enrollment."providerAuthorityDigest",
    enrollment."currentConfigurationDigest"
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  INNER JOIN pg_catalog.pg_roles AS worker_role
    ON worker_role.rolname = session_user
   AND worker_role.oid::BIGINT = enrollment."workerRoleOid"
  WHERE enrollment."tenantId" = tenant_id
    AND enrollment."state" = 'ACTIVE'
    AND enrollment."enabled" = true
    AND enrollment."activeCommandId" IS NULL
    AND enrollment."providerAuthorityDigest" = p_provider_authority_digest
    AND enrollment."workerRoleName" = session_user
    AND enrollment."enabledAt" IS NOT NULL
    AND enrollment."disabledAt" IS NULL
    AND session_user <> current_user
    AND worker_role.rolcanlogin = true
    AND worker_role.rolsuper = false
    AND worker_role.rolinherit = false
    AND worker_role.rolcreaterole = false
    AND worker_role.rolcreatedb = false
    AND worker_role.rolreplication = false
    AND worker_role.rolbypassrls = false
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = worker_role.oid
    )
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker v2 is not ACTIVE for tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.max(migration."migration_name"),
    pg_catalog.min(migration."checksum") FILTER (
      WHERE migration."migration_name" =
        '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
    )
  INTO migration_count, migration_head, candidate_checksum
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 181
     OR migration_head IS DISTINCT FROM
       '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
     OR candidate_checksum IS NULL
     OR (candidate_checksum COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker v2 database receipt is not exact CURRENT_181'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER_V2',
    'decision', 'REHEARSAL_READY',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'authorization', false,
    'canSend', false,
    'tenantId', tenant_id,
    'migrationHead', migration_head,
    'migrationCount', migration_count,
    'candidateChecksum', candidate_checksum,
    'state', enrollment_record."state",
    'stateRevision', enrollment_record."stateRevision",
    'policyRevision', enrollment_record."policyRevision",
    'currentConfigurationDigest',
      enrollment_record."currentConfigurationDigest",
    'maxAttempts', enrollment_record."maxAttempts",
    'leaseSeconds', enrollment_record."leaseSeconds",
    'acknowledgeSeconds', enrollment_record."acknowledgeSeconds",
    'baseRetrySeconds', enrollment_record."baseRetrySeconds",
    'maxRetrySeconds', enrollment_record."maxRetrySeconds",
    'providerAuthorityDigest',
      enrollment_record."providerAuthorityDigest"
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_claim_v2"(
  p_tenant_id TEXT,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_authority_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  policy JSONB;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  canonical_email TEXT;
  next_revision BIGINT;
  next_attempt INTEGER;
BEGIN
  IF p_lease_owner_digest IS NULL
     OR (p_lease_owner_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_token_digest IS NULL
     OR (p_lease_token_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_owner_digest = p_lease_token_digest
  THEN
    RAISE EXCEPTION 'Identity mail worker v2 lease binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  policy := public."identity_mail_delivery_worker_assert_v2"(
    p_tenant_id,
    p_provider_authority_digest
  );
  now_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  SELECT target_outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS target_outbox
  INNER JOIN public."UserInvite" AS candidate_invite
    ON candidate_invite."tenantId" = target_outbox."tenantId"
   AND candidate_invite."id" = target_outbox."inviteId"
  CROSS JOIN LATERAL (
    SELECT pg_catalog.lower(
      pg_catalog.btrim(candidate_invite."email") COLLATE "C"
    ) AS "emailCanonical"
  ) AS candidate_email
  CROSS JOIN LATERAL (
    SELECT
      pg_catalog.split_part(candidate_email."emailCanonical", '@', 1)
        AS "localPart",
      pg_catalog.split_part(candidate_email."emailCanonical", '@', 2)
        AS "domainPart"
  ) AS candidate_email_parts
  INNER JOIN public."IdentityEmailClaim" AS candidate_claim
    ON candidate_claim."emailCanonical" = candidate_email."emailCanonical"
   AND candidate_claim."tenantId" = candidate_invite."tenantId"
   AND candidate_claim."claimType" =
     'INVITE'::public."IdentityEmailClaimType"
   AND candidate_claim."subjectId" = candidate_invite."id"
   AND candidate_claim."revision" =
     candidate_invite."identityClaimRevision"
  INNER JOIN public."Tenant" AS candidate_tenant
    ON candidate_tenant."id" = candidate_invite."tenantId"
  WHERE target_outbox."tenantId" = p_tenant_id
    AND target_outbox."status" IN (
      'PENDING'::public."IdentityMailOutboxStatus",
      'RETRY'::public."IdentityMailOutboxStatus"
    )
    AND target_outbox."availableAt" <= now_at
    AND target_outbox."expiresAt" > now_at
    AND target_outbox."attempts" < (policy ->> 'maxAttempts')::INTEGER
    AND target_outbox."secretCiphertext" IS NOT NULL
    AND candidate_invite."tokenHash" = target_outbox."tokenHash"
    AND candidate_invite."acceptedAt" IS NULL
    AND candidate_invite."revokedAt" IS NULL
    AND candidate_invite."expiresAt" > now_at
    AND pg_catalog.char_length(
      candidate_email."emailCanonical"
    ) BETWEEN 3 AND 320
    AND (candidate_email."emailCanonical" COLLATE "C") ~ '^[!-~]+$'
    AND candidate_email."emailCanonical" =
      candidate_email_parts."localPart" || '@' ||
      candidate_email_parts."domainPart"
    AND pg_catalog.char_length(
      candidate_email_parts."localPart"
    ) BETWEEN 1 AND 64
    AND (candidate_email_parts."localPart" COLLATE "C") ~
      '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
    AND (candidate_email_parts."localPart" COLLATE "C") !~
      '(^\.|\.$|\.\.)'
    AND pg_catalog.char_length(
      candidate_email_parts."domainPart"
    ) BETWEEN 3 AND 253
    AND (candidate_email_parts."domainPart" COLLATE "C") ~
      '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND candidate_invite."role" = 'OWNER'::public."UserRole"
    AND candidate_invite."accessScope" =
      'NETWORK'::public."UserAccessScope"
    AND candidate_invite."customRoleId" IS NULL
    AND pg_catalog.cardinality(candidate_invite."storeIds") = 0
    AND candidate_tenant."status" =
      'ACTIVE'::public."TenantLifecycleStatus"
    AND candidate_tenant."customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND candidate_tenant."onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus"
    AND candidate_tenant."trialStartsAt" <= now_at
    AND candidate_tenant."trialEndsAt" > now_at
  ORDER BY
    target_outbox."availableAt",
    target_outbox."createdAt",
    target_outbox."id"
  FOR UPDATE OF target_outbox SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'CLAIM_INITIAL_OWNER_MAIL_V2',
      'decision', 'EMPTY',
      'tenantId', p_tenant_id
    );
  END IF;

  SELECT target_invite.*
  INTO invite_record
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = p_tenant_id
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker v2 invite is missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT target_tenant.*
  INTO tenant_record
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = p_tenant_id
  FOR SHARE OF target_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker v2 tenant is missing'
      USING ERRCODE = '23514';
  END IF;

  canonical_email := public."identity_email_claim_lock_v1"(
    invite_record."email"
  );

  SELECT identity_claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS identity_claim
  WHERE identity_claim."emailCanonical" = canonical_email
  FOR SHARE OF identity_claim;

  IF NOT FOUND
     OR claim_record."tenantId" IS DISTINCT FROM p_tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
     OR claim_record."subjectId" IS DISTINCT FROM invite_record."id"
     OR claim_record."revision" IS DISTINCT FROM
       invite_record."identityClaimRevision"
     OR invite_record."tokenHash" IS DISTINCT FROM outbox_record."tokenHash"
     OR invite_record."acceptedAt" IS NOT NULL
     OR invite_record."revokedAt" IS NOT NULL
     OR invite_record."expiresAt" <= now_at
     OR invite_record."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
     OR invite_record."accessScope" IS DISTINCT FROM
       'NETWORK'::public."UserAccessScope"
     OR invite_record."customRoleId" IS NOT NULL
     OR pg_catalog.cardinality(invite_record."storeIds") <> 0
     OR tenant_record."status" IS DISTINCT FROM
       'ACTIVE'::public."TenantLifecycleStatus"
     OR tenant_record."customerStage" IS DISTINCT FROM
       'PILOT'::public."TenantCustomerStage"
     OR tenant_record."onboardingStatus" IS DISTINCT FROM
       'OWNER_INVITED'::public."TenantOnboardingStatus"
     OR tenant_record."trialStartsAt" > now_at
     OR tenant_record."trialEndsAt" <= now_at
     OR outbox_record."secretCiphertext" IS NULL
  THEN
    RAISE EXCEPTION 'Identity mail worker v2 candidate is not deliverable'
      USING ERRCODE = '40001';
  END IF;

  now_at := GREATEST(
    now_at,
    outbox_record."updatedAt" + INTERVAL '1 millisecond'
  );

  next_attempt := outbox_record."attempts" + 1;
  next_revision := outbox_record."transitionRevision" + 1;

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_delivery_event',
    'CLAIMED',
    true
  );

  UPDATE public."IdentityMailOutbox"
  SET
    "status" = 'CLAIMED'::public."IdentityMailOutboxStatus",
    "attempts" = next_attempt,
    "leaseVersion" = next_attempt,
    "transitionRevision" = next_revision,
    "availableAt" = NULL,
    "leaseOwnerDigest" = p_lease_owner_digest,
    "leaseTokenDigest" = p_lease_token_digest,
    "claimedAt" = now_at,
    "leaseExpiresAt" = now_at + pg_catalog.make_interval(
      secs => (policy ->> 'leaseSeconds')::INTEGER
    ),
    "claimEnrollmentStateRevision" =
      (policy ->> 'stateRevision')::BIGINT,
    "claimPolicyRevision" = (policy ->> 'policyRevision')::INTEGER,
    "claimProviderAuthorityDigest" = p_provider_authority_digest,
    "stateReasonCode" = NULL,
    "updatedAt" = now_at
  WHERE "tenantId" = p_tenant_id
    AND "id" = outbox_record."id"
    AND "status" = outbox_record."status"
    AND "transitionRevision" = outbox_record."transitionRevision";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker v2 claim CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'CLAIM_INITIAL_OWNER_MAIL_V2',
    'decision', 'CLAIMED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'outboxId', outbox_record."id",
    'tenantId', outbox_record."tenantId",
    'inviteId', outbox_record."inviteId",
    'workflowLocator', outbox_record."workflowLocator",
    'aadEnvironment', outbox_record."aadEnvironment",
    'template', outbox_record."template"::TEXT,
    'messageKey', outbox_record."messageKey",
    'requestDigest', outbox_record."issueRequestDigest",
    'tokenHash', outbox_record."tokenHash",
    'digestVersion', outbox_record."tokenDigestVersion",
    'secretCiphertextBase64',
      pg_catalog.encode(outbox_record."secretCiphertext", 'base64'),
    'envelopeVersion', outbox_record."envelopeVersion",
    'keyVersion', outbox_record."keyVersion",
    'recipientEmail', invite_record."email",
    'expiresAt', outbox_record."expiresAt",
    'attemptNumber', next_attempt,
    'leaseVersion', next_attempt,
    'transitionRevision', next_revision,
    'claimEnrollmentStateRevision',
      (policy ->> 'stateRevision')::BIGINT,
    'claimPolicyRevision', (policy ->> 'policyRevision')::INTEGER,
    'claimProviderAuthorityDigest', p_provider_authority_digest
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_provider_mark_v2"(
  p_tenant_id TEXT,
  p_outbox_id TEXT,
  p_expected_lease_version INTEGER,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_attempt_key TEXT,
  p_provider_authority_digest TEXT,
  p_message_id_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  worker_role_record RECORD;
  canonical_email TEXT;
  invite_live BOOLEAN := false;
  draining BOOLEAN := false;
BEGIN
  IF p_outbox_id IS NULL
     OR (p_outbox_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_expected_lease_version IS NULL
     OR p_expected_lease_version < 1
     OR p_lease_owner_digest IS NULL
     OR (p_lease_owner_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_token_digest IS NULL
     OR (p_lease_token_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_provider_attempt_key IS NULL
     OR p_provider_attempt_key <> pg_catalog.lower(
       pg_catalog.btrim(p_provider_attempt_key COLLATE "C")
     )
     OR (p_provider_attempt_key COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_message_id_digest IS NULL
     OR (p_message_id_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity mail provider marker v2 input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT enrollment.*
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  WHERE enrollment."tenantId" = tenant_id
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail settlement enrollment is missing'
      USING ERRCODE = '42501';
  END IF;

  SELECT worker_role.*
  INTO worker_role_record
  FROM pg_catalog.pg_roles AS worker_role
  WHERE worker_role.rolname = session_user
    AND worker_role.oid::BIGINT = enrollment_record."workerRoleOid";

  IF NOT FOUND
     OR enrollment_record."workerRoleName" IS DISTINCT FROM session_user
     OR session_user = current_user
     OR worker_role_record.rolcanlogin IS DISTINCT FROM true
     OR worker_role_record.rolsuper IS DISTINCT FROM false
     OR worker_role_record.rolinherit IS DISTINCT FROM false
     OR worker_role_record.rolcreaterole IS DISTINCT FROM false
     OR worker_role_record.rolcreatedb IS DISTINCT FROM false
     OR worker_role_record.rolreplication IS DISTINCT FROM false
     OR worker_role_record.rolbypassrls IS DISTINCT FROM false
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = worker_role_record.oid
     )
  THEN
    RAISE EXCEPTION 'Identity mail settlement worker role is invalid'
      USING ERRCODE = '42501';
  END IF;

  IF enrollment_record."state" = 'ACTIVE'
     AND enrollment_record."enabled" = true
     AND enrollment_record."activeCommandId" IS NULL
     AND enrollment_record."providerAuthorityDigest" =
       p_provider_authority_digest
  THEN
    draining := false;
  ELSIF enrollment_record."state" = 'DRAINING'
     AND enrollment_record."enabled" = false
     AND enrollment_record."activeCommandId" IS NOT NULL
  THEN
    draining := true;
    SELECT command.*
    INTO command_record
    FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
    WHERE command."tenantId" = tenant_id
      AND command."id" = enrollment_record."activeCommandId"
    FOR SHARE OF command;

    IF NOT FOUND
       OR command_record."action" NOT IN ('ROTATE', 'DISABLE')
       OR command_record."drainStateRevision" IS DISTINCT FROM
         enrollment_record."stateRevision"
       OR command_record."expectedPolicyRevision" IS DISTINCT FROM
         enrollment_record."policyRevision"
       OR command_record."previousWorkerRoleName" IS DISTINCT FROM
         enrollment_record."workerRoleName"
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         enrollment_record."workerRoleOid"
       OR command_record."previousProviderAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR command_record."previousConfigurationDigest" IS DISTINCT FROM
         enrollment_record."currentConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity mail drain settlement authority is invalid'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Identity mail settlement state is not eligible'
      USING ERRCODE = '42501';
  END IF;

  SELECT target_outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS target_outbox
  WHERE target_outbox."tenantId" = tenant_id
    AND target_outbox."id" = p_outbox_id
  FOR UPDATE OF target_outbox;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail outbox was not found for tenant'
      USING ERRCODE = 'P0002';
  END IF;

  now_at := GREATEST(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
    outbox_record."updatedAt" + INTERVAL '1 millisecond'
  );

  IF outbox_record."status" IS DISTINCT FROM
       'CLAIMED'::public."IdentityMailOutboxStatus"
     OR outbox_record."leaseVersion" IS DISTINCT FROM
       p_expected_lease_version
     OR outbox_record."leaseOwnerDigest" IS DISTINCT FROM
       p_lease_owner_digest
     OR outbox_record."leaseTokenDigest" IS DISTINCT FROM
       p_lease_token_digest
     OR outbox_record."leaseExpiresAt" <= now_at
     OR outbox_record."providerAttemptKey" IS NOT NULL
     OR outbox_record."secretCiphertext" IS NULL
     OR outbox_record."claimProviderAuthorityDigest" IS DISTINCT FROM
       p_provider_authority_digest
     OR (
       NOT draining
       AND (
         outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
           enrollment_record."stateRevision"
         OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
           enrollment_record."policyRevision"
       )
     )
     OR (
       draining
       AND (
         outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
           command_record."stateRevisionBefore"
         OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
           command_record."expectedPolicyRevision"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail provider marker v2 CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  SELECT target_invite.*
  INTO invite_record
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = tenant_id
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  SELECT target_tenant.*
  INTO tenant_record
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = tenant_id
  FOR SHARE OF target_tenant;

  IF invite_record."id" IS NOT NULL THEN
    canonical_email := public."identity_email_claim_lock_v1"(
      invite_record."email"
    );
    SELECT identity_claim.*
    INTO claim_record
    FROM public."IdentityEmailClaim" AS identity_claim
    WHERE identity_claim."emailCanonical" = canonical_email
    FOR SHARE OF identity_claim;
  END IF;

  invite_live :=
    invite_record."id" IS NOT NULL
    AND tenant_record."id" IS NOT NULL
    AND claim_record."emailCanonical" IS NOT NULL
    AND claim_record."tenantId" = tenant_id
    AND claim_record."claimType" =
      'INVITE'::public."IdentityEmailClaimType"
    AND claim_record."subjectId" = invite_record."id"
    AND claim_record."revision" = invite_record."identityClaimRevision"
    AND invite_record."tokenHash" = outbox_record."tokenHash"
    AND invite_record."acceptedAt" IS NULL
    AND invite_record."revokedAt" IS NULL
    AND invite_record."expiresAt" > now_at
    AND invite_record."role" = 'OWNER'::public."UserRole"
    AND invite_record."accessScope" =
      'NETWORK'::public."UserAccessScope"
    AND invite_record."customRoleId" IS NULL
    AND pg_catalog.cardinality(invite_record."storeIds") = 0
    AND tenant_record."status" = 'ACTIVE'::public."TenantLifecycleStatus"
    AND tenant_record."customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND tenant_record."onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus"
    AND tenant_record."trialStartsAt" <= now_at
    AND tenant_record."trialEndsAt" > now_at
    AND outbox_record."expiresAt" > now_at;

  IF NOT invite_live THEN
    PERFORM pg_catalog.set_config(
      'leetplus.identity_mail_delivery_event',
      'CANCELED',
      true
    );

    UPDATE public."IdentityMailOutbox"
    SET
      "status" = 'CANCELED'::public."IdentityMailOutboxStatus",
      "transitionRevision" = "transitionRevision" + 1,
      "availableAt" = NULL,
      "leaseOwnerDigest" = NULL,
      "leaseTokenDigest" = NULL,
      "claimedAt" = NULL,
      "leaseExpiresAt" = NULL,
      "providerAttemptKey" = NULL,
      "providerAttemptedAt" = NULL,
      "providerAcknowledgeUntil" = NULL,
      "providerAuthorityDigest" = NULL,
      "messageIdDigest" = NULL,
      "secretCiphertext" = NULL,
      "ciphertextClearedAt" = NULL,
      "providerOutcomeClass" = 'CANCELED',
      "providerObservedAt" = now_at,
      "providerReceiptDigest" = NULL,
      "terminalAckDigest" = NULL,
      "sentAt" = NULL,
      "terminalAt" = now_at,
      "stateReasonCode" = 'INVITE_NOT_DELIVERABLE',
      "updatedAt" = now_at
    WHERE "tenantId" = tenant_id
      AND "id" = p_outbox_id
      AND "transitionRevision" = outbox_record."transitionRevision";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Identity mail provider cancel v2 CAS is stale'
        USING ERRCODE = '40001';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
      'decision', 'CANCELED',
      'outboxId', p_outbox_id,
      'tenantId', tenant_id,
      'leaseVersion', p_expected_lease_version,
      'transitionRevision', outbox_record."transitionRevision" + 1
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_delivery_event',
    'PROVIDER_MARKED',
    true
  );

  UPDATE public."IdentityMailOutbox"
  SET
    "transitionRevision" = "transitionRevision" + 1,
    "providerAttemptKey" = p_provider_attempt_key,
    "providerAttemptedAt" = now_at,
    "providerAcknowledgeUntil" = now_at + pg_catalog.make_interval(
      secs => CASE
        WHEN draining THEN command_record."previousAcknowledgeSeconds"
        ELSE enrollment_record."acknowledgeSeconds"
      END
    ),
    "providerAuthorityDigest" = p_provider_authority_digest,
    "messageIdDigest" = p_message_id_digest,
    "secretCiphertext" = NULL,
    "ciphertextClearedAt" = now_at,
    "updatedAt" = now_at
  WHERE "tenantId" = tenant_id
    AND "id" = p_outbox_id
    AND "transitionRevision" = outbox_record."transitionRevision";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail provider marker v2 write CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
    'decision', 'MARKED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'outboxId', p_outbox_id,
    'tenantId', tenant_id,
    'leaseVersion', p_expected_lease_version,
    'transitionRevision', outbox_record."transitionRevision" + 1,
    'providerAttemptKey', p_provider_attempt_key,
    'settlementState', enrollment_record."state"
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_complete_v2"(
  p_tenant_id TEXT,
  p_outbox_id TEXT,
  p_expected_lease_version INTEGER,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_authority_digest TEXT,
  p_outcome_code TEXT,
  p_provider_receipt_digest TEXT,
  p_terminal_ack_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  worker_role_record RECORD;
  canonical_email TEXT;
  invite_live BOOLEAN := false;
  draining BOOLEAN := false;
  max_attempts INTEGER;
  base_retry_seconds INTEGER;
  max_retry_seconds INTEGER;
  next_status public."IdentityMailOutboxStatus";
  event_type TEXT;
  outcome_class TEXT;
  reason_code TEXT;
  next_available_at TIMESTAMP(3) WITH TIME ZONE;
  deliverable_until TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF p_outbox_id IS NULL
     OR (p_outbox_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_expected_lease_version IS NULL
     OR p_expected_lease_version < 1
     OR p_lease_owner_digest IS NULL
     OR (p_lease_owner_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_token_digest IS NULL
     OR (p_lease_token_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_outcome_code IS NULL
     OR p_outcome_code NOT IN (
       'PRE_PROVIDER_RETRY',
       'PRE_PROVIDER_DEAD',
       'PROVIDER_ACCEPTED',
       'PROVIDER_DEFINITIVE_NOT_SENT',
       'PROVIDER_AMBIGUOUS',
       'CANCELED'
     )
     OR (
       p_provider_receipt_digest IS NOT NULL
       AND (p_provider_receipt_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     )
     OR (
       p_terminal_ack_digest IS NOT NULL
       AND (p_terminal_ack_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     )
  THEN
    RAISE EXCEPTION 'Identity mail completion v2 input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT enrollment.*
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  WHERE enrollment."tenantId" = tenant_id
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail completion enrollment is missing'
      USING ERRCODE = '42501';
  END IF;

  SELECT worker_role.*
  INTO worker_role_record
  FROM pg_catalog.pg_roles AS worker_role
  WHERE worker_role.rolname = session_user
    AND worker_role.oid::BIGINT = enrollment_record."workerRoleOid";

  IF NOT FOUND
     OR enrollment_record."workerRoleName" IS DISTINCT FROM session_user
     OR session_user = current_user
     OR worker_role_record.rolcanlogin IS DISTINCT FROM true
     OR worker_role_record.rolsuper IS DISTINCT FROM false
     OR worker_role_record.rolinherit IS DISTINCT FROM false
     OR worker_role_record.rolcreaterole IS DISTINCT FROM false
     OR worker_role_record.rolcreatedb IS DISTINCT FROM false
     OR worker_role_record.rolreplication IS DISTINCT FROM false
     OR worker_role_record.rolbypassrls IS DISTINCT FROM false
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = worker_role_record.oid
     )
  THEN
    RAISE EXCEPTION 'Identity mail completion worker role is invalid'
      USING ERRCODE = '42501';
  END IF;

  IF enrollment_record."state" = 'ACTIVE'
     AND enrollment_record."enabled" = true
     AND enrollment_record."activeCommandId" IS NULL
     AND enrollment_record."providerAuthorityDigest" =
       p_provider_authority_digest
  THEN
    max_attempts := enrollment_record."maxAttempts";
    base_retry_seconds := enrollment_record."baseRetrySeconds";
    max_retry_seconds := enrollment_record."maxRetrySeconds";
  ELSIF enrollment_record."state" = 'DRAINING'
     AND enrollment_record."enabled" = false
     AND enrollment_record."activeCommandId" IS NOT NULL
  THEN
    draining := true;
    SELECT command.*
    INTO command_record
    FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
    WHERE command."tenantId" = tenant_id
      AND command."id" = enrollment_record."activeCommandId"
    FOR SHARE OF command;

    IF NOT FOUND
       OR command_record."action" NOT IN ('ROTATE', 'DISABLE')
       OR command_record."drainStateRevision" IS DISTINCT FROM
         enrollment_record."stateRevision"
       OR command_record."expectedPolicyRevision" IS DISTINCT FROM
         enrollment_record."policyRevision"
       OR command_record."previousWorkerRoleName" IS DISTINCT FROM
         enrollment_record."workerRoleName"
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         enrollment_record."workerRoleOid"
       OR command_record."previousProviderAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR command_record."previousConfigurationDigest" IS DISTINCT FROM
         enrollment_record."currentConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity mail drain completion authority is invalid'
        USING ERRCODE = '42501';
    END IF;

    max_attempts := command_record."previousMaxAttempts";
    base_retry_seconds := command_record."previousBaseRetrySeconds";
    max_retry_seconds := command_record."previousMaxRetrySeconds";
  ELSE
    RAISE EXCEPTION 'Identity mail completion state is not eligible'
      USING ERRCODE = '42501';
  END IF;

  SELECT target_outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS target_outbox
  WHERE target_outbox."tenantId" = tenant_id
    AND target_outbox."id" = p_outbox_id
  FOR UPDATE OF target_outbox;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail completion outbox was not found for tenant'
      USING ERRCODE = 'P0002';
  END IF;

  now_at := GREATEST(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
    outbox_record."updatedAt" + INTERVAL '1 millisecond'
  );

  IF outbox_record."status" IS DISTINCT FROM
       'CLAIMED'::public."IdentityMailOutboxStatus"
     OR outbox_record."leaseVersion" IS DISTINCT FROM
       p_expected_lease_version
     OR outbox_record."leaseOwnerDigest" IS DISTINCT FROM
       p_lease_owner_digest
     OR outbox_record."leaseTokenDigest" IS DISTINCT FROM
       p_lease_token_digest
     OR outbox_record."claimProviderAuthorityDigest" IS DISTINCT FROM
       p_provider_authority_digest
     OR (
       NOT draining
       AND (
         outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
           enrollment_record."stateRevision"
         OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
           enrollment_record."policyRevision"
       )
     )
     OR (
       draining
       AND (
         outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
           command_record."stateRevisionBefore"
         OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
           command_record."expectedPolicyRevision"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail completion v2 CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  SELECT target_invite.*
  INTO invite_record
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = tenant_id
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  SELECT target_tenant.*
  INTO tenant_record
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = tenant_id
  FOR SHARE OF target_tenant;

  IF invite_record."id" IS NOT NULL THEN
    canonical_email := public."identity_email_claim_lock_v1"(
      invite_record."email"
    );
    SELECT identity_claim.*
    INTO claim_record
    FROM public."IdentityEmailClaim" AS identity_claim
    WHERE identity_claim."emailCanonical" = canonical_email
    FOR SHARE OF identity_claim;
  END IF;

  invite_live :=
    invite_record."id" IS NOT NULL
    AND tenant_record."id" IS NOT NULL
    AND claim_record."emailCanonical" IS NOT NULL
    AND claim_record."tenantId" = tenant_id
    AND claim_record."claimType" =
      'INVITE'::public."IdentityEmailClaimType"
    AND claim_record."subjectId" = invite_record."id"
    AND claim_record."revision" = invite_record."identityClaimRevision"
    AND invite_record."tokenHash" = outbox_record."tokenHash"
    AND invite_record."acceptedAt" IS NULL
    AND invite_record."revokedAt" IS NULL
    AND invite_record."expiresAt" > now_at
    AND invite_record."role" = 'OWNER'::public."UserRole"
    AND invite_record."accessScope" =
      'NETWORK'::public."UserAccessScope"
    AND invite_record."customRoleId" IS NULL
    AND pg_catalog.cardinality(invite_record."storeIds") = 0
    AND tenant_record."status" = 'ACTIVE'::public."TenantLifecycleStatus"
    AND tenant_record."customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND tenant_record."onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus"
    AND tenant_record."trialStartsAt" <= now_at
    AND tenant_record."trialEndsAt" > now_at
    AND outbox_record."expiresAt" > now_at;

  IF invite_record."id" IS NOT NULL AND tenant_record."id" IS NOT NULL THEN
    deliverable_until := LEAST(
      outbox_record."expiresAt",
      invite_record."expiresAt",
      tenant_record."trialEndsAt"
    );
  END IF;

  IF outbox_record."providerAttemptKey" IS NULL THEN
    IF p_outcome_code NOT IN (
         'PRE_PROVIDER_RETRY',
         'PRE_PROVIDER_DEAD',
         'CANCELED'
       )
       OR outbox_record."leaseExpiresAt" <= now_at
       OR p_provider_receipt_digest IS NOT NULL
       OR p_terminal_ack_digest IS NOT NULL
    THEN
      RAISE EXCEPTION 'Identity mail pre-provider completion v2 is invalid'
        USING ERRCODE = '40001';
    END IF;

    IF p_outcome_code = 'CANCELED'
       AND invite_live
       AND NOT draining
    THEN
      RAISE EXCEPTION
        'Identity mail active live invite cannot be force-canceled'
        USING ERRCODE = '40001';
    END IF;

    IF NOT invite_live THEN
      next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
      event_type := 'CANCELED';
      outcome_class := 'CANCELED';
      reason_code := 'INVITE_NOT_DELIVERABLE';
    ELSIF draining AND p_outcome_code IN (
        'PRE_PROVIDER_RETRY',
        'CANCELED'
      )
    THEN
      next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
      event_type := 'CANCELED';
      outcome_class := 'CANCELED';
      reason_code := 'TENANT_DRAINING';
    ELSIF NOT draining
       AND p_outcome_code = 'PRE_PROVIDER_RETRY'
       AND outbox_record."attempts" < max_attempts
    THEN
      next_available_at := now_at + pg_catalog.make_interval(
        secs => LEAST(
          max_retry_seconds::NUMERIC,
          base_retry_seconds::NUMERIC * pg_catalog.power(
            2::NUMERIC,
            GREATEST(outbox_record."attempts" - 1, 0)
          )
        )::INTEGER
      );
      IF next_available_at < deliverable_until THEN
        next_status := 'RETRY'::public."IdentityMailOutboxStatus";
        event_type := 'PRE_PROVIDER_RETRY';
        outcome_class := NULL;
        reason_code := 'PRE_PROVIDER_TRANSIENT';
      ELSE
        next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
        event_type := 'CANCELED';
        outcome_class := 'CANCELED';
        reason_code := 'RETRY_WINDOW_EXHAUSTED';
        next_available_at := NULL;
      END IF;
    ELSE
      next_status := 'DEAD'::public."IdentityMailOutboxStatus";
      event_type := 'PRE_PROVIDER_DEAD';
      outcome_class := 'PRE_PROVIDER_FAILURE';
      reason_code := CASE
        WHEN draining THEN 'TENANT_DRAINING_PRE_PROVIDER_FAILURE'
        WHEN outbox_record."attempts" >= max_attempts
          THEN 'ATTEMPT_BUDGET_EXHAUSTED'
        ELSE 'PRE_PROVIDER_PERMANENT'
      END;
    END IF;

    PERFORM pg_catalog.set_config(
      'leetplus.identity_mail_delivery_event',
      event_type,
      true
    );

    UPDATE public."IdentityMailOutbox"
    SET
      "status" = next_status,
      "transitionRevision" = "transitionRevision" + 1,
      "availableAt" = next_available_at,
      "leaseOwnerDigest" = NULL,
      "leaseTokenDigest" = NULL,
      "claimedAt" = NULL,
      "leaseExpiresAt" = NULL,
      "secretCiphertext" = CASE
        WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
          THEN "secretCiphertext"
        ELSE NULL
      END,
      "providerOutcomeClass" = outcome_class,
      "providerObservedAt" = CASE
        WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
          THEN NULL
        ELSE now_at
      END,
      "providerReceiptDigest" = NULL,
      "terminalAckDigest" = NULL,
      "sentAt" = NULL,
      "terminalAt" = CASE
        WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
          THEN NULL
        ELSE now_at
      END,
      "stateReasonCode" = reason_code,
      "updatedAt" = now_at
    WHERE "tenantId" = tenant_id
      AND "id" = p_outbox_id
      AND "transitionRevision" = outbox_record."transitionRevision";
  ELSE
    IF p_outcome_code NOT IN (
         'PROVIDER_ACCEPTED',
         'PROVIDER_DEFINITIVE_NOT_SENT',
         'PROVIDER_AMBIGUOUS'
       )
       OR outbox_record."providerAcknowledgeUntil" <= now_at
       OR outbox_record."providerAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR p_terminal_ack_digest IS NULL
       OR (
         p_outcome_code IN (
           'PROVIDER_ACCEPTED',
           'PROVIDER_DEFINITIVE_NOT_SENT'
         )
         AND p_provider_receipt_digest IS NULL
       )
    THEN
      RAISE EXCEPTION 'Identity mail provider completion v2 is invalid'
        USING ERRCODE = '40001';
    END IF;

    IF p_outcome_code = 'PROVIDER_ACCEPTED' THEN
      next_status := 'SENT'::public."IdentityMailOutboxStatus";
      event_type := 'PROVIDER_ACCEPTED';
      outcome_class := 'ACCEPTED';
      reason_code := NULL;
    ELSIF p_outcome_code = 'PROVIDER_DEFINITIVE_NOT_SENT' THEN
      next_status := 'DEAD'::public."IdentityMailOutboxStatus";
      event_type := 'PROVIDER_DEFINITIVE_NOT_SENT';
      outcome_class := 'DEFINITIVE_NOT_SENT';
      reason_code := 'PROVIDER_DEFINITIVE_NOT_SENT';
    ELSE
      next_status :=
        'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus";
      event_type := 'PROVIDER_AMBIGUOUS';
      outcome_class := 'AMBIGUOUS';
      reason_code := 'PROVIDER_OUTCOME_AMBIGUOUS';
    END IF;

    PERFORM pg_catalog.set_config(
      'leetplus.identity_mail_delivery_event',
      event_type,
      true
    );

    UPDATE public."IdentityMailOutbox"
    SET
      "status" = next_status,
      "transitionRevision" = "transitionRevision" + 1,
      "leaseOwnerDigest" = NULL,
      "leaseTokenDigest" = NULL,
      "claimedAt" = NULL,
      "leaseExpiresAt" = NULL,
      "providerOutcomeClass" = outcome_class,
      "providerObservedAt" = now_at,
      "providerReceiptDigest" = p_provider_receipt_digest,
      "terminalAckDigest" = p_terminal_ack_digest,
      "sentAt" = CASE
        WHEN next_status = 'SENT'::public."IdentityMailOutboxStatus"
          THEN now_at
        ELSE NULL
      END,
      "terminalAt" = now_at,
      "stateReasonCode" = reason_code,
      "updatedAt" = now_at
    WHERE "tenantId" = tenant_id
      AND "id" = p_outbox_id
      AND "transitionRevision" = outbox_record."transitionRevision";
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail completion v2 write CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'COMPLETE_INITIAL_OWNER_MAIL_V2',
    'decision', next_status::TEXT,
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', tenant_id,
    'outboxId', p_outbox_id,
    'leaseVersion', p_expected_lease_version,
    'transitionRevision', outbox_record."transitionRevision" + 1,
    'settlementState', enrollment_record."state"
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_reap_v2"(
  p_tenant_id TEXT,
  p_provider_authority_digest TEXT,
  p_worker_actor_digest TEXT,
  p_batch_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  transition_at TIMESTAMP(3) WITH TIME ZONE;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  worker_role_record RECORD;
  canonical_email TEXT;
  selected_ids TEXT[];
  draining BOOLEAN := false;
  invite_live BOOLEAN;
  max_attempts INTEGER;
  base_retry_seconds INTEGER;
  max_retry_seconds INTEGER;
  next_status public."IdentityMailOutboxStatus";
  event_type TEXT;
  reason_code TEXT;
  next_available_at TIMESTAMP(3) WITH TIME ZONE;
  deliverable_until TIMESTAMP(3) WITH TIME ZONE;
  processed_count INTEGER := 0;
BEGIN
  IF p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_worker_actor_digest IS NULL
     OR (p_worker_actor_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_batch_limit IS NULL
     OR p_batch_limit NOT BETWEEN 1 AND 100
     OR p_provider_authority_digest = p_worker_actor_digest
  THEN
    RAISE EXCEPTION 'Identity mail reaper v2 input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT enrollment.*
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  WHERE enrollment."tenantId" = tenant_id
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail reaper enrollment is missing'
      USING ERRCODE = '42501';
  END IF;

  SELECT worker_role.*
  INTO worker_role_record
  FROM pg_catalog.pg_roles AS worker_role
  WHERE worker_role.rolname = session_user
    AND worker_role.oid::BIGINT = enrollment_record."workerRoleOid";

  IF NOT FOUND
     OR enrollment_record."workerRoleName" IS DISTINCT FROM session_user
     OR session_user = current_user
     OR worker_role_record.rolcanlogin IS DISTINCT FROM true
     OR worker_role_record.rolsuper IS DISTINCT FROM false
     OR worker_role_record.rolinherit IS DISTINCT FROM false
     OR worker_role_record.rolcreaterole IS DISTINCT FROM false
     OR worker_role_record.rolcreatedb IS DISTINCT FROM false
     OR worker_role_record.rolreplication IS DISTINCT FROM false
     OR worker_role_record.rolbypassrls IS DISTINCT FROM false
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = worker_role_record.oid
     )
  THEN
    RAISE EXCEPTION 'Identity mail reaper worker role is invalid'
      USING ERRCODE = '42501';
  END IF;

  IF enrollment_record."state" = 'ACTIVE'
     AND enrollment_record."enabled" = true
     AND enrollment_record."activeCommandId" IS NULL
     AND enrollment_record."providerAuthorityDigest" =
       p_provider_authority_digest
  THEN
    max_attempts := enrollment_record."maxAttempts";
    base_retry_seconds := enrollment_record."baseRetrySeconds";
    max_retry_seconds := enrollment_record."maxRetrySeconds";
  ELSIF enrollment_record."state" = 'DRAINING'
     AND enrollment_record."enabled" = false
     AND enrollment_record."activeCommandId" IS NOT NULL
  THEN
    draining := true;
    SELECT command.*
    INTO command_record
    FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
    WHERE command."tenantId" = tenant_id
      AND command."id" = enrollment_record."activeCommandId"
    FOR SHARE OF command;

    IF NOT FOUND
       OR command_record."action" NOT IN ('ROTATE', 'DISABLE')
       OR command_record."drainStateRevision" IS DISTINCT FROM
         enrollment_record."stateRevision"
       OR command_record."expectedPolicyRevision" IS DISTINCT FROM
         enrollment_record."policyRevision"
       OR command_record."previousWorkerRoleName" IS DISTINCT FROM
         enrollment_record."workerRoleName"
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         enrollment_record."workerRoleOid"
       OR command_record."previousProviderAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR command_record."previousConfigurationDigest" IS DISTINCT FROM
         enrollment_record."currentConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity mail drain reaper authority is invalid'
        USING ERRCODE = '42501';
    END IF;

    max_attempts := command_record."previousMaxAttempts";
    base_retry_seconds := command_record."previousBaseRetrySeconds";
    max_retry_seconds := command_record."previousMaxRetrySeconds";
  ELSE
    RAISE EXCEPTION 'Identity mail reaper state is not eligible'
      USING ERRCODE = '42501';
  END IF;

  now_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  SELECT pg_catalog.array_agg(locked_outbox."id" ORDER BY locked_outbox."id")
  INTO selected_ids
  FROM (
    SELECT target_outbox."id"
    FROM public."IdentityMailOutbox" AS target_outbox
    WHERE target_outbox."tenantId" = tenant_id
      AND (
        (
          draining
          AND (
            target_outbox."status" IN (
              'HOLD'::public."IdentityMailOutboxStatus",
              'PENDING'::public."IdentityMailOutboxStatus",
              'RETRY'::public."IdentityMailOutboxStatus"
            )
            OR (
              target_outbox."status" =
                'CLAIMED'::public."IdentityMailOutboxStatus"
              AND (
                (
                  target_outbox."providerAttemptKey" IS NULL
                  AND target_outbox."leaseExpiresAt" <= now_at
                )
                OR (
                  target_outbox."providerAttemptKey" IS NOT NULL
                  AND target_outbox."providerAcknowledgeUntil" <= now_at
                )
              )
            )
          )
        )
        OR (
          NOT draining
          AND (
            (
              target_outbox."status" =
                'CLAIMED'::public."IdentityMailOutboxStatus"
              AND (
                (
                  target_outbox."providerAttemptKey" IS NULL
                  AND target_outbox."leaseExpiresAt" <= now_at
                )
                OR (
                  target_outbox."providerAttemptKey" IS NOT NULL
                  AND target_outbox."providerAcknowledgeUntil" <= now_at
                )
              )
            )
            OR (
              target_outbox."status" IN (
                'PENDING'::public."IdentityMailOutboxStatus",
                'RETRY'::public."IdentityMailOutboxStatus"
              )
              AND (
                target_outbox."expiresAt" <= now_at
                OR target_outbox."availableAt" >= target_outbox."expiresAt"
                OR (
                  target_outbox."status" =
                    'RETRY'::public."IdentityMailOutboxStatus"
                  AND target_outbox."attempts" >= max_attempts
                )
                OR NOT EXISTS (
                  SELECT 1
                  FROM public."UserInvite" AS target_invite
                  INNER JOIN public."IdentityEmailClaim" AS identity_claim
                    ON identity_claim."emailCanonical" =
                      pg_catalog.lower(
                        pg_catalog.btrim(target_invite."email") COLLATE "C"
                      )
                   AND identity_claim."claimType" =
                     'INVITE'::public."IdentityEmailClaimType"
                   AND identity_claim."tenantId" =
                     target_invite."tenantId"
                   AND identity_claim."subjectId" = target_invite."id"
                   AND identity_claim."revision" =
                     target_invite."identityClaimRevision"
                  INNER JOIN public."Tenant" AS target_tenant
                    ON target_tenant."id" = target_invite."tenantId"
                  WHERE target_invite."tenantId" = tenant_id
                    AND target_invite."id" = target_outbox."inviteId"
                    AND target_invite."tokenHash" =
                      target_outbox."tokenHash"
                    AND target_outbox."expiresAt" > now_at
                    AND target_invite."acceptedAt" IS NULL
                    AND target_invite."revokedAt" IS NULL
                    AND target_invite."expiresAt" > now_at
                    AND target_invite."email" IS NOT NULL
                    AND pg_catalog.char_length(
                      target_invite."email"
                    ) BETWEEN 3 AND 320
                    AND (
                      pg_catalog.lower(
                        pg_catalog.btrim(target_invite."email") COLLATE "C"
                      ) COLLATE "C"
                    ) ~ '^[!-~]+$'
                    AND pg_catalog.char_length(
                      pg_catalog.split_part(
                        pg_catalog.lower(
                          pg_catalog.btrim(
                            target_invite."email"
                          ) COLLATE "C"
                        ),
                        '@',
                        1
                      )
                    ) BETWEEN 1 AND 64
                    AND (
                      pg_catalog.split_part(
                        pg_catalog.lower(
                          pg_catalog.btrim(
                            target_invite."email"
                          ) COLLATE "C"
                        ),
                        '@',
                        1
                      ) COLLATE "C"
                    ) ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
                    AND (
                      pg_catalog.split_part(
                        pg_catalog.lower(
                          pg_catalog.btrim(
                            target_invite."email"
                          ) COLLATE "C"
                        ),
                        '@',
                        1
                      ) COLLATE "C"
                    ) !~ '(^\.|\.$|\.\.)'
                    AND pg_catalog.char_length(
                      pg_catalog.split_part(
                        pg_catalog.lower(
                          pg_catalog.btrim(
                            target_invite."email"
                          ) COLLATE "C"
                        ),
                        '@',
                        2
                      )
                    ) BETWEEN 3 AND 253
                    AND (
                      pg_catalog.split_part(
                        pg_catalog.lower(
                          pg_catalog.btrim(
                            target_invite."email"
                          ) COLLATE "C"
                        ),
                        '@',
                        2
                      ) COLLATE "C"
                    ) ~
                      '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
                    AND target_invite."role" =
                      'OWNER'::public."UserRole"
                    AND target_invite."accessScope" =
                      'NETWORK'::public."UserAccessScope"
                    AND target_invite."customRoleId" IS NULL
                    AND pg_catalog.cardinality(
                      target_invite."storeIds"
                    ) = 0
                    AND target_tenant."status" =
                      'ACTIVE'::public."TenantLifecycleStatus"
                    AND target_tenant."customerStage" =
                      'PILOT'::public."TenantCustomerStage"
                    AND target_tenant."onboardingStatus" =
                      'OWNER_INVITED'::public."TenantOnboardingStatus"
                    AND target_tenant."trialStartsAt" <= now_at
                    AND target_tenant."trialEndsAt" > now_at
                )
              )
            )
          )
        )
      )
    ORDER BY target_outbox."id"
    FOR UPDATE OF target_outbox
    LIMIT p_batch_limit
  ) AS locked_outbox;

  IF selected_ids IS NULL OR pg_catalog.cardinality(selected_ids) = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'REAP_INITIAL_OWNER_MAIL_V2',
      'decision', 'COMPLETED',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', tenant_id,
      'settlementState', enrollment_record."state",
      'processed', 0
    );
  END IF;

  PERFORM target_invite."id"
  FROM public."UserInvite" AS target_invite
  INNER JOIN public."IdentityMailOutbox" AS selected_outbox
    ON selected_outbox."tenantId" = target_invite."tenantId"
   AND selected_outbox."inviteId" = target_invite."id"
  WHERE selected_outbox."tenantId" = tenant_id
    AND selected_outbox."id" = ANY(selected_ids)
  ORDER BY target_invite."id"
  FOR SHARE OF target_invite;

  SELECT target_tenant.*
  INTO tenant_record
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = tenant_id
  FOR SHARE OF target_tenant;

  FOR canonical_email IN
    SELECT DISTINCT pg_catalog.lower(
      pg_catalog.btrim(target_invite."email") COLLATE "C"
    ) AS "emailCanonical"
    FROM public."UserInvite" AS target_invite
    INNER JOIN public."IdentityMailOutbox" AS selected_outbox
      ON selected_outbox."tenantId" = target_invite."tenantId"
     AND selected_outbox."inviteId" = target_invite."id"
    WHERE selected_outbox."tenantId" = tenant_id
      AND selected_outbox."id" = ANY(selected_ids)
      AND target_invite."email" IS NOT NULL
      AND pg_catalog.char_length(
        pg_catalog.lower(
          pg_catalog.btrim(target_invite."email") COLLATE "C"
        )
      ) BETWEEN 3 AND 320
      AND (
        pg_catalog.lower(
          pg_catalog.btrim(target_invite."email") COLLATE "C"
        ) COLLATE "C"
      ) ~ '^[!-~]+$'
      AND pg_catalog.lower(
        pg_catalog.btrim(target_invite."email") COLLATE "C"
      ) =
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) || '@' ||
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        )
      AND pg_catalog.char_length(
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        )
      ) BETWEEN 1 AND 64
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) COLLATE "C"
      ) ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) COLLATE "C"
      ) !~ '(^\.|\.$|\.\.)'
      AND pg_catalog.char_length(
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        )
      ) BETWEEN 3 AND 253
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        ) COLLATE "C"
      ) ~
        '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    ORDER BY "emailCanonical" COLLATE "C"
  LOOP
    PERFORM public."identity_email_claim_lock_v1"(canonical_email);
  END LOOP;

  PERFORM identity_claim."emailCanonical"
  FROM public."IdentityEmailClaim" AS identity_claim
  WHERE identity_claim."emailCanonical" IN (
    SELECT pg_catalog.lower(
      pg_catalog.btrim(target_invite."email") COLLATE "C"
    )
    FROM public."UserInvite" AS target_invite
    INNER JOIN public."IdentityMailOutbox" AS selected_outbox
      ON selected_outbox."tenantId" = target_invite."tenantId"
     AND selected_outbox."inviteId" = target_invite."id"
    WHERE selected_outbox."tenantId" = tenant_id
      AND selected_outbox."id" = ANY(selected_ids)
      AND target_invite."email" IS NOT NULL
      AND pg_catalog.char_length(
        pg_catalog.lower(
          pg_catalog.btrim(target_invite."email") COLLATE "C"
        )
      ) BETWEEN 3 AND 320
      AND (
        pg_catalog.lower(
          pg_catalog.btrim(target_invite."email") COLLATE "C"
        ) COLLATE "C"
      ) ~ '^[!-~]+$'
      AND pg_catalog.lower(
        pg_catalog.btrim(target_invite."email") COLLATE "C"
      ) =
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) || '@' ||
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        )
      AND pg_catalog.char_length(
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        )
      ) BETWEEN 1 AND 64
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) COLLATE "C"
      ) ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          1
        ) COLLATE "C"
      ) !~ '(^\.|\.$|\.\.)'
      AND pg_catalog.char_length(
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        )
      ) BETWEEN 3 AND 253
      AND (
        pg_catalog.split_part(
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          ),
          '@',
          2
        ) COLLATE "C"
      ) ~
        '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
  ORDER BY identity_claim."emailCanonical" COLLATE "C"
  FOR SHARE OF identity_claim;

  FOR outbox_record IN
    SELECT selected_outbox.*
    FROM public."IdentityMailOutbox" AS selected_outbox
    WHERE selected_outbox."tenantId" = tenant_id
      AND selected_outbox."id" = ANY(selected_ids)
    ORDER BY selected_outbox."id"
  LOOP
    next_available_at := NULL;
    deliverable_until := NULL;
    invite_live := false;
    transition_at := GREATEST(
      now_at,
      outbox_record."updatedAt" + INTERVAL '1 millisecond'
    );

    IF outbox_record."attempts" > 0
       AND (
         outbox_record."claimProviderAuthorityDigest" IS DISTINCT FROM
           p_provider_authority_digest
         OR (
           NOT draining
           AND (
             outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
               enrollment_record."stateRevision"
             OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
               enrollment_record."policyRevision"
           )
         )
         OR (
           draining
           AND (
             outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM
               command_record."stateRevisionBefore"
             OR outbox_record."claimPolicyRevision" IS DISTINCT FROM
               command_record."expectedPolicyRevision"
           )
         )
       )
    THEN
      RAISE EXCEPTION 'Identity mail reaper claim authority drifted'
        USING ERRCODE = '55000';
    END IF;

    SELECT target_invite.*
    INTO invite_record
    FROM public."UserInvite" AS target_invite
    WHERE target_invite."tenantId" = tenant_id
      AND target_invite."id" = outbox_record."inviteId";

    claim_record := NULL;
    IF invite_record."id" IS NOT NULL
       AND invite_record."email" IS NOT NULL
       AND pg_catalog.char_length(
         pg_catalog.lower(
           pg_catalog.btrim(invite_record."email") COLLATE "C"
         )
       ) BETWEEN 3 AND 320
       AND (
         pg_catalog.lower(
           pg_catalog.btrim(invite_record."email") COLLATE "C"
         ) COLLATE "C"
       ) ~ '^[!-~]+$'
       AND pg_catalog.lower(
         pg_catalog.btrim(invite_record."email") COLLATE "C"
       ) =
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           1
         ) || '@' ||
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           2
         )
       AND pg_catalog.char_length(
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           1
         )
       ) BETWEEN 1 AND 64
       AND (
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           1
         ) COLLATE "C"
       ) ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
       AND (
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           1
         ) COLLATE "C"
       ) !~ '(^\.|\.$|\.\.)'
       AND pg_catalog.char_length(
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           2
         )
       ) BETWEEN 3 AND 253
       AND (
         pg_catalog.split_part(
           pg_catalog.lower(
             pg_catalog.btrim(invite_record."email") COLLATE "C"
           ),
           '@',
           2
         ) COLLATE "C"
       ) ~
         '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    THEN
      canonical_email := public."identity_email_claim_lock_v1"(
        invite_record."email"
      );
      SELECT identity_claim.*
      INTO claim_record
      FROM public."IdentityEmailClaim" AS identity_claim
      WHERE identity_claim."emailCanonical" = canonical_email
      FOR SHARE OF identity_claim;
    END IF;

    invite_live :=
      invite_record."id" IS NOT NULL
      AND tenant_record."id" IS NOT NULL
      AND claim_record."emailCanonical" IS NOT NULL
      AND claim_record."tenantId" = tenant_id
      AND claim_record."claimType" =
        'INVITE'::public."IdentityEmailClaimType"
      AND claim_record."subjectId" = invite_record."id"
      AND claim_record."revision" = invite_record."identityClaimRevision"
      AND invite_record."tokenHash" = outbox_record."tokenHash"
      AND invite_record."acceptedAt" IS NULL
      AND invite_record."revokedAt" IS NULL
      AND invite_record."expiresAt" > now_at
      AND invite_record."role" = 'OWNER'::public."UserRole"
      AND invite_record."accessScope" =
        'NETWORK'::public."UserAccessScope"
      AND invite_record."customRoleId" IS NULL
      AND pg_catalog.cardinality(invite_record."storeIds") = 0
      AND tenant_record."status" = 'ACTIVE'::public."TenantLifecycleStatus"
      AND tenant_record."customerStage" =
        'PILOT'::public."TenantCustomerStage"
      AND tenant_record."onboardingStatus" =
        'OWNER_INVITED'::public."TenantOnboardingStatus"
      AND tenant_record."trialStartsAt" <= now_at
      AND tenant_record."trialEndsAt" > now_at
      AND outbox_record."expiresAt" > now_at;

    IF invite_record."id" IS NOT NULL AND tenant_record."id" IS NOT NULL THEN
      deliverable_until := LEAST(
        outbox_record."expiresAt",
        invite_record."expiresAt",
        tenant_record."trialEndsAt"
      );
    END IF;

    IF outbox_record."providerAttemptKey" IS NOT NULL THEN
      next_status :=
        'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus";
      event_type := 'REAP_AMBIGUOUS';
      reason_code := 'PROVIDER_ACK_TIMEOUT';

      PERFORM pg_catalog.set_config(
        'leetplus.identity_mail_delivery_event',
        event_type,
        true
      );
      PERFORM pg_catalog.set_config(
        'leetplus.identity_mail_delivery_actor_digest',
        p_worker_actor_digest,
        true
      );

      UPDATE public."IdentityMailOutbox"
      SET
        "status" = next_status,
        "transitionRevision" = "transitionRevision" + 1,
        "leaseOwnerDigest" = NULL,
        "leaseTokenDigest" = NULL,
        "claimedAt" = NULL,
        "leaseExpiresAt" = NULL,
        "providerOutcomeClass" = 'AMBIGUOUS',
        "providerObservedAt" = transition_at,
        "terminalAt" = transition_at,
        "stateReasonCode" = reason_code,
        "updatedAt" = transition_at
      WHERE "tenantId" = tenant_id
        AND "id" = outbox_record."id"
        AND "transitionRevision" = outbox_record."transitionRevision";
    ELSE
      IF draining THEN
        next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_CANCELED';
        reason_code := 'TENANT_DRAINING';
      ELSIF NOT invite_live THEN
        next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_CANCELED';
        reason_code := 'INVITE_NOT_DELIVERABLE';
      ELSIF outbox_record."status" =
          'RETRY'::public."IdentityMailOutboxStatus"
        AND outbox_record."attempts" >= max_attempts
      THEN
        next_status := 'DEAD'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_DEAD';
        reason_code := 'ATTEMPT_BUDGET_EXHAUSTED';
      ELSIF outbox_record."status" IN (
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
      THEN
        next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_CANCELED';
        reason_code := 'RETRY_WINDOW_EXHAUSTED';
      ELSE
        next_available_at := transition_at + pg_catalog.make_interval(
          secs => LEAST(
            max_retry_seconds::NUMERIC,
            base_retry_seconds::NUMERIC * pg_catalog.power(
              2::NUMERIC,
              GREATEST(outbox_record."attempts" - 1, 0)
            )
          )::INTEGER
        );
        IF next_available_at < deliverable_until
           AND outbox_record."attempts" < max_attempts
        THEN
          next_status := 'RETRY'::public."IdentityMailOutboxStatus";
          event_type := 'REAP_RETRY';
          reason_code := 'LEASE_EXPIRED_BEFORE_PROVIDER';
        ELSE
          next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
          event_type := 'REAP_CANCELED';
          reason_code := 'RETRY_WINDOW_EXHAUSTED';
          next_available_at := NULL;
        END IF;
      END IF;

      PERFORM pg_catalog.set_config(
        'leetplus.identity_mail_delivery_event',
        event_type,
        true
      );
      PERFORM pg_catalog.set_config(
        'leetplus.identity_mail_delivery_actor_digest',
        p_worker_actor_digest,
        true
      );

      UPDATE public."IdentityMailOutbox"
      SET
        "status" = next_status,
        "transitionRevision" = "transitionRevision" + 1,
        "availableAt" = next_available_at,
        "leaseOwnerDigest" = NULL,
        "leaseTokenDigest" = NULL,
        "claimedAt" = NULL,
        "leaseExpiresAt" = NULL,
        "secretCiphertext" = CASE
          WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
            THEN "secretCiphertext"
          ELSE NULL
        END,
        "providerOutcomeClass" = CASE
          WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
          WHEN next_status = 'CANCELED'::public."IdentityMailOutboxStatus"
            THEN 'CANCELED'
          ELSE 'PRE_PROVIDER_FAILURE'
        END,
        "providerObservedAt" = CASE
          WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
            ELSE transition_at
        END,
        "terminalAt" = CASE
          WHEN next_status = 'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
            ELSE transition_at
        END,
        "stateReasonCode" = reason_code,
        "updatedAt" = transition_at
      WHERE "tenantId" = tenant_id
        AND "id" = outbox_record."id"
        AND "transitionRevision" = outbox_record."transitionRevision";
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Identity mail reaper v2 write CAS is stale'
        USING ERRCODE = '40001';
    END IF;

    processed_count := processed_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'REAP_INITIAL_OWNER_MAIL_V2',
    'decision', 'COMPLETED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', tenant_id,
    'settlementState', enrollment_record."state",
    'processed', processed_count
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_reconcile_v2"(
  p_tenant_id TEXT,
  p_outbox_id TEXT,
  p_expected_transition_revision BIGINT,
  p_resolution_code TEXT,
  p_evidence_digest TEXT,
  p_actor_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  canonical_email TEXT;
  email_local_part TEXT;
  email_domain_part TEXT;
  event_type TEXT;
  next_status public."IdentityMailOutboxStatus";
BEGIN
  IF p_outbox_id IS NULL
     OR (p_outbox_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_expected_transition_revision IS NULL
     OR p_expected_transition_revision < 1
     OR p_resolution_code IS NULL
     OR p_resolution_code NOT IN ('SENT', 'DEAD')
     OR p_evidence_digest IS NULL
     OR (p_evidence_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_actor_digest IS NULL
     OR (p_actor_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_evidence_digest = p_actor_digest
  THEN
    RAISE EXCEPTION 'Identity mail reconciliation v2 input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT enrollment.*
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  WHERE enrollment."tenantId" = tenant_id
  FOR SHARE OF enrollment;

  IF NOT FOUND
     OR enrollment_record."state" NOT IN (
       'ACTIVE',
       'DRAINING',
       'DISABLED'
     )
  THEN
    RAISE EXCEPTION 'Identity mail reconciliation enrollment is invalid'
      USING ERRCODE = '42501';
  END IF;

  IF p_resolution_code = 'SENT' THEN
    event_type := 'RECONCILED_SENT';
    next_status := 'SENT'::public."IdentityMailOutboxStatus";
  ELSE
    event_type := 'RECONCILED_DEAD';
    next_status := 'DEAD'::public."IdentityMailOutboxStatus";
  END IF;

  SELECT target_outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS target_outbox
  WHERE target_outbox."tenantId" = tenant_id
    AND target_outbox."id" = p_outbox_id
  FOR UPDATE OF target_outbox;

  IF FOUND
     AND outbox_record."status" IS NOT DISTINCT FROM next_status
     AND outbox_record."transitionRevision" IS NOT DISTINCT FROM
       p_expected_transition_revision + 1
     AND outbox_record."terminalAckDigest" IS NOT DISTINCT FROM
       p_evidence_digest
     AND EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryEvent" AS replay_event
       WHERE replay_event."tenantId" = tenant_id
         AND replay_event."outboxId" = p_outbox_id
         AND replay_event."transitionRevision" =
           p_expected_transition_revision + 1
         AND replay_event."eventType" = event_type
         AND replay_event."toStatus" = next_status
         AND replay_event."terminalAckDigest" = p_evidence_digest
         AND replay_event."actorDigest" = p_actor_digest
     )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'RECONCILE_INITIAL_OWNER_MAIL_V2',
      'decision', next_status::TEXT,
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', tenant_id,
      'outboxId', p_outbox_id,
      'transitionRevision', p_expected_transition_revision + 1,
      'actorDigest', p_actor_digest,
      'replayed', true,
      'settlementState', enrollment_record."state"
    );
  END IF;

  IF NOT FOUND
     OR outbox_record."status" IS DISTINCT FROM
       'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
     OR outbox_record."transitionRevision" IS DISTINCT FROM
       p_expected_transition_revision
     OR outbox_record."providerAttemptKey" IS NULL
     OR outbox_record."providerAttemptedAt" IS NULL
     OR outbox_record."providerAcknowledgeUntil" IS NULL
     OR outbox_record."providerAuthorityDigest" IS NULL
     OR outbox_record."messageIdDigest" IS NULL
     OR outbox_record."claimEnrollmentStateRevision" IS NULL
     OR outbox_record."claimPolicyRevision" IS NULL
     OR outbox_record."claimProviderAuthorityDigest" IS NULL
     OR outbox_record."providerAuthorityDigest" IS DISTINCT FROM
       outbox_record."claimProviderAuthorityDigest"
     OR outbox_record."secretCiphertext" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Identity mail reconciliation v2 CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  SELECT target_invite.*
  INTO invite_record
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = tenant_id
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail reconciliation invite is missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT target_tenant.*
  INTO tenant_record
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = tenant_id
  FOR SHARE OF target_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail reconciliation tenant is missing'
      USING ERRCODE = '23514';
  END IF;

  canonical_email := pg_catalog.lower(
    pg_catalog.btrim(invite_record."email") COLLATE "C"
  );
  email_local_part := pg_catalog.split_part(canonical_email, '@', 1);
  email_domain_part := pg_catalog.split_part(canonical_email, '@', 2);

  IF invite_record."email" IS NOT NULL
     AND pg_catalog.char_length(canonical_email) BETWEEN 3 AND 320
     AND (canonical_email COLLATE "C") ~ '^[!-~]+$'
     AND canonical_email = email_local_part || '@' || email_domain_part
     AND pg_catalog.char_length(email_local_part) BETWEEN 1 AND 64
     AND (email_local_part COLLATE "C") ~
       '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
     AND (email_local_part COLLATE "C") !~ '(^\.|\.$|\.\.)'
     AND pg_catalog.char_length(email_domain_part) BETWEEN 3 AND 253
     AND (email_domain_part COLLATE "C") ~
       '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  THEN
    canonical_email := public."identity_email_claim_lock_v1"(
      canonical_email
    );

    SELECT identity_claim.*
    INTO claim_record
    FROM public."IdentityEmailClaim" AS identity_claim
    WHERE identity_claim."emailCanonical" = canonical_email
    FOR SHARE OF identity_claim;
  ELSE
    canonical_email := NULL;
    claim_record := NULL;
  END IF;

  now_at := GREATEST(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
    outbox_record."updatedAt" + INTERVAL '1 millisecond'
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_delivery_event',
    event_type,
    true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_delivery_actor_digest',
    p_actor_digest,
    true
  );

  UPDATE public."IdentityMailOutbox"
  SET
    "status" = next_status,
    "transitionRevision" = "transitionRevision" + 1,
    "providerOutcomeClass" = CASE
      WHEN next_status = 'SENT'::public."IdentityMailOutboxStatus"
        THEN 'RESOLVED_SENT'
      ELSE 'RESOLVED_DEAD'
    END,
    "providerObservedAt" = now_at,
    "providerReceiptDigest" = COALESCE(
      "providerReceiptDigest",
      p_evidence_digest
    ),
    "terminalAckDigest" = p_evidence_digest,
    "sentAt" = CASE
      WHEN next_status = 'SENT'::public."IdentityMailOutboxStatus"
        THEN now_at
      ELSE NULL
    END,
    "terminalAt" = now_at,
    "stateReasonCode" = CASE
      WHEN next_status = 'SENT'::public."IdentityMailOutboxStatus"
        THEN NULL
      ELSE 'RECONCILED_NOT_SENT'
    END,
    "updatedAt" = now_at
  WHERE "tenantId" = tenant_id
    AND "id" = p_outbox_id
    AND "status" = outbox_record."status"
    AND "transitionRevision" = outbox_record."transitionRevision"
    AND "providerAttemptKey" = outbox_record."providerAttemptKey"
    AND "providerAuthorityDigest" =
      outbox_record."providerAuthorityDigest"
    AND "claimEnrollmentStateRevision" =
      outbox_record."claimEnrollmentStateRevision"
    AND "claimPolicyRevision" = outbox_record."claimPolicyRevision"
    AND "claimProviderAuthorityDigest" =
      outbox_record."claimProviderAuthorityDigest";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail reconciliation v2 write CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'RECONCILE_INITIAL_OWNER_MAIL_V2',
    'decision', next_status::TEXT,
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', tenant_id,
    'outboxId', p_outbox_id,
    'transitionRevision', p_expected_transition_revision + 1,
    'actorDigest', p_actor_digest,
    'replayed', false,
    'settlementState', enrollment_record."state"
  );
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_claim_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_provider_mark_v2"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_complete_v2"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_reap_v2"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_reconcile_v2"(
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  TEXT,
  TEXT
) IS
  'CURRENT_181 NOT_DEPLOYABLE owner-only worker-v2 rehearsal boundary; no runtime EXECUTE grant is installed.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_claim_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_181 NOT_DEPLOYABLE tenant-first ACTIVE claim with lease-captured enrollment and provider authority.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_provider_mark_v2"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_181 NOT_DEPLOYABLE tenant-first provider marker with exact ACTIVE or pre-drain lease authority.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_complete_v2"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_181 NOT_DEPLOYABLE tenant-first bounded completion; live ACTIVE invites cannot be force-canceled.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_reap_v2"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'CURRENT_181 NOT_DEPLOYABLE tenant-first reaper; DRAINING never returns an outbox row to RETRY.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_reconcile_v2"(
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_181 NOT_DEPLOYABLE owner-only terminal reconciliation; it has no provider or secret access path and receives no non-owner grant.';

COMMENT ON TABLE public."IdentityMailOutbox" IS
  'Encrypted initial-owner mail outbox. CURRENT_181 is NOT_DEPLOYABLE and adds tenant-first v2 claim authority capture without granting a runtime caller.';

COMMENT ON COLUMN
  public."IdentityMailOutbox"."claimEnrollmentStateRevision" IS
  'Secret-free immutable ACTIVE enrollment state revision captured by worker-v2 claim and retained through terminal evidence.';

COMMENT ON COLUMN public."IdentityMailOutbox"."claimPolicyRevision" IS
  'Secret-free immutable tenant delivery policy revision captured by worker-v2 claim.';

COMMENT ON COLUMN
  public."IdentityMailOutbox"."claimProviderAuthorityDigest" IS
  'Secret-free immutable provider authority digest captured by worker-v2 claim.';

COMMENT ON TABLE public."IdentityMailDeliveryEvent" IS
  'Append-only PII-free delivery evidence. CURRENT_181 is NOT_DEPLOYABLE and copies immutable tenant claim authority into every attempted transition event.';

DO $postcondition$
DECLARE
  migration_owner_oid OID;
  invalid_column_count INTEGER;
  invalid_constraint_count INTEGER;
  invalid_index_count INTEGER;
  invalid_trigger_count INTEGER;
  invalid_function_count INTEGER;
  unexpected_function_count INTEGER;
  unsafe_function_acl_count INTEGER;
  unsafe_relation_acl_count INTEGER;
  unsafe_column_acl_count INTEGER;
  unsafe_owner_membership_count INTEGER;
  v1_drift_count INTEGER;
  invalid_stub_count INTEGER;
  candidate_receipt_count INTEGER;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailOutbox"'
  );

  IF migration_owner_oid IS NULL THEN
    RAISE EXCEPTION 'CURRENT_181 migration owner is unavailable'
      USING ERRCODE = '55000';
  END IF;

  WITH RECURSIVE
  roles_reaching_owner("role_oid") AS (
    SELECT membership.member
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = migration_owner_oid
    UNION
    SELECT membership.member
    FROM pg_catalog.pg_auth_members AS membership
    INNER JOIN roles_reaching_owner AS inherited_owner
      ON membership.roleid = inherited_owner."role_oid"
  ),
  roles_reached_by_owner("role_oid") AS (
    SELECT membership.roleid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = migration_owner_oid
    UNION
    SELECT membership.roleid
    FROM pg_catalog.pg_auth_members AS membership
    INNER JOIN roles_reached_by_owner AS inherited_role
      ON membership.member = inherited_role."role_oid"
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_owner_membership_count
  FROM (
    SELECT "role_oid" FROM roles_reaching_owner
    UNION
    SELECT "role_oid" FROM roles_reached_by_owner
  ) AS effective_membership;

  IF unsafe_owner_membership_count <> 0 THEN
    RAISE EXCEPTION
      'CURRENT_181 migration owner has transitive role membership'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("relation_name", "column_name", "type_name") AS (
    VALUES
      ('IdentityMailOutbox', 'claimEnrollmentStateRevision', 'bigint'),
      ('IdentityMailOutbox', 'claimPolicyRevision', 'integer'),
      (
        'IdentityMailOutbox',
        'claimProviderAuthorityDigest',
        'character(64)'
      ),
      (
        'IdentityMailDeliveryEvent',
        'claimEnrollmentStateRevision',
        'bigint'
      ),
      ('IdentityMailDeliveryEvent', 'claimPolicyRevision', 'integer'),
      (
        'IdentityMailDeliveryEvent',
        'claimProviderAuthorityDigest',
        'character(64)'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_column_count
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = expected."relation_name"
   AND relation.relnamespace = pg_catalog.to_regnamespace('public')
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = expected."column_name"
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  WHERE attribute.attrelid IS NULL
     OR attribute.attnotnull
     OR attribute.atthasdef
     OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
       IS DISTINCT FROM expected."type_name";

  IF invalid_column_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 claim authority columns are incomplete'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    "relation_name",
    "constraint_name",
    "constraint_definition"
  ) AS (
    VALUES
      (
        'IdentityMailOutbox',
        'identity_mail_outbox_claim_enrollment_binding_check',
        $definition$CHECK (attempts = 0 AND "claimEnrollmentStateRevision" IS NULL AND "claimPolicyRevision" IS NULL AND "claimProviderAuthorityDigest" IS NULL OR attempts >= 1 AND "claimEnrollmentStateRevision" >= 1 AND "claimPolicyRevision" >= 1 AND "claimEnrollmentStateRevision" >= "claimPolicyRevision" AND ("claimProviderAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'::text)$definition$
      ),
      (
        'IdentityMailDeliveryEvent',
        'identity_mail_delivery_event_claim_enrollment_binding_check',
        $definition$CHECK ("attemptNumber" = 0 AND "claimEnrollmentStateRevision" IS NULL AND "claimPolicyRevision" IS NULL AND "claimProviderAuthorityDigest" IS NULL OR "attemptNumber" >= 1 AND "claimEnrollmentStateRevision" >= 1 AND "claimPolicyRevision" >= 1 AND "claimEnrollmentStateRevision" >= "claimPolicyRevision" AND ("claimProviderAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'::text)$definition$
      ),
      (
        'IdentityMailDeliveryTenantEnrollmentCommand',
        'identity_mail_tenant_enrollment_command_mutation_check',
        $definition$CHECK (action::text = 'ENABLE'::text AND ("expectedState"::text = 'ABSENT'::text OR "expectedState"::text = 'DISABLED'::text AND "targetWorkerRoleName"::text = "previousWorkerRoleName"::text AND "targetWorkerRoleOid" = "previousWorkerRoleOid" AND "targetProviderAuthorityDigest" = "previousProviderAuthorityDigest" AND "targetMaxAttempts" = "previousMaxAttempts" AND "targetLeaseSeconds" = "previousLeaseSeconds" AND "targetAcknowledgeSeconds" = "previousAcknowledgeSeconds" AND "targetBaseRetrySeconds" = "previousBaseRetrySeconds" AND "targetMaxRetrySeconds" = "previousMaxRetrySeconds" AND "targetConfigurationDigest" = "previousConfigurationDigest") OR action::text = 'ROTATE'::text AND "targetConfigurationDigest" <> "previousConfigurationDigest" OR action::text = 'DISABLE'::text AND "targetWorkerRoleName"::text = "previousWorkerRoleName"::text AND "targetWorkerRoleOid" = "previousWorkerRoleOid" AND "targetProviderAuthorityDigest" = "previousProviderAuthorityDigest" AND "targetMaxAttempts" = "previousMaxAttempts" AND "targetLeaseSeconds" = "previousLeaseSeconds" AND "targetAcknowledgeSeconds" = "previousAcknowledgeSeconds" AND "targetBaseRetrySeconds" = "previousBaseRetrySeconds" AND "targetMaxRetrySeconds" = "previousMaxRetrySeconds" AND "targetConfigurationDigest" = "previousConfigurationDigest")$definition$
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_constraint_count
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = expected."relation_name"
   AND relation.relnamespace = pg_catalog.to_regnamespace('public')
  LEFT JOIN pg_catalog.pg_constraint AS target_constraint
    ON target_constraint.conrelid = relation.oid
   AND target_constraint.conname = expected."constraint_name"
  WHERE target_constraint.oid IS NULL
     OR target_constraint.contype IS DISTINCT FROM 'c'::"char"
     OR target_constraint.convalidated IS DISTINCT FROM true
     OR pg_catalog.pg_get_constraintdef(target_constraint.oid, true)
       IS DISTINCT FROM expected."constraint_definition";

  IF invalid_constraint_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 lifecycle constraints are incomplete'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("index_name", "is_unique", "index_definition") AS (
    VALUES
      (
        'identity_mail_tenant_enrollment_command_rollback_once_uidx',
        true,
        $definition$CREATE UNIQUE INDEX identity_mail_tenant_enrollment_command_rollback_once_uidx ON public."IdentityMailDeliveryTenantEnrollmentCommand" USING btree ("tenantId", "rollbackOfCommandId") WHERE (((intent)::text = 'ROLLBACK'::text) AND ("rollbackOfCommandId" IS NOT NULL))$definition$
      ),
      (
        'identity_mail_outbox_ready_tenant_v2_idx',
        false,
        $definition$CREATE INDEX identity_mail_outbox_ready_tenant_v2_idx ON public."IdentityMailOutbox" USING btree ("tenantId", "availableAt", "createdAt", id) WHERE (status = ANY (ARRAY['PENDING'::"IdentityMailOutboxStatus", 'RETRY'::"IdentityMailOutboxStatus"]))$definition$
      ),
      (
        'identity_mail_outbox_drain_barrier_v2_idx',
        false,
        $definition$CREATE INDEX identity_mail_outbox_drain_barrier_v2_idx ON public."IdentityMailOutbox" USING btree ("tenantId", id) WHERE (status = ANY (ARRAY['HOLD'::"IdentityMailOutboxStatus", 'PENDING'::"IdentityMailOutboxStatus", 'RETRY'::"IdentityMailOutboxStatus", 'CLAIMED'::"IdentityMailOutboxStatus"]))$definition$
      ),
      (
        'identity_mail_outbox_secret_barrier_v2_idx',
        false,
        $definition$CREATE INDEX identity_mail_outbox_secret_barrier_v2_idx ON public."IdentityMailOutbox" USING btree ("tenantId", id) WHERE ("secretCiphertext" IS NOT NULL)$definition$
      ),
      (
        'identity_mail_outbox_unmarked_tenant_v2_idx',
        false,
        $definition$CREATE INDEX identity_mail_outbox_unmarked_tenant_v2_idx ON public."IdentityMailOutbox" USING btree ("tenantId", "leaseExpiresAt", id) WHERE ((status = 'CLAIMED'::"IdentityMailOutboxStatus") AND ("providerAttemptKey" IS NULL))$definition$
      ),
      (
        'identity_mail_outbox_marked_tenant_v2_idx',
        false,
        $definition$CREATE INDEX identity_mail_outbox_marked_tenant_v2_idx ON public."IdentityMailOutbox" USING btree ("tenantId", "providerAcknowledgeUntil", id) WHERE ((status = 'CLAIMED'::"IdentityMailOutboxStatus") AND ("providerAttemptKey" IS NOT NULL))$definition$
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_index_count
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.relname = expected."index_name"
   AND index_relation.relnamespace = pg_catalog.to_regnamespace('public')
  LEFT JOIN pg_catalog.pg_index AS target_index
    ON target_index.indexrelid = index_relation.oid
  WHERE target_index.indexrelid IS NULL
     OR index_relation.relkind IS DISTINCT FROM 'i'::"char"
     OR target_index.indisvalid IS DISTINCT FROM true
     OR target_index.indisready IS DISTINCT FROM true
     OR target_index.indisunique IS DISTINCT FROM expected."is_unique"
     OR target_index.indpred IS NULL
     OR pg_catalog.pg_get_indexdef(target_index.indexrelid)
       IS DISTINCT FROM expected."index_definition";

  IF invalid_index_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 tenant-leading indexes are incomplete'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    "relation_name",
    "trigger_name",
    "function_name",
    "trigger_type"
  ) AS (
    VALUES
      (
        'IdentityMailOutbox',
        'IdentityMailOutbox_delivery_guard_trigger',
        'identity_mail_outbox_delivery_guard_v2',
        31
      ),
      (
        'IdentityMailOutbox',
        'IdentityMailOutbox_delivery_event_trigger',
        'identity_mail_delivery_event_append_v2',
        17
      ),
      (
        'IdentityMailDeliveryTenantEnrollment',
        'IdentityMailEnrollment_00_dormant_guard_trigger',
        'identity_mail_tenant_enrollment_registry_dormant_guard_v1',
        30
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_trigger_count
  FROM expected
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = expected."relation_name"
   AND relation.relnamespace = pg_catalog.to_regnamespace('public')
  LEFT JOIN pg_catalog.pg_trigger AS target_trigger
    ON target_trigger.tgrelid = relation.oid
   AND target_trigger.tgname = expected."trigger_name"
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = target_trigger.tgfoid
  WHERE target_trigger.oid IS NULL
     OR target_trigger.tgenabled IS DISTINCT FROM 'O'::"char"
     OR target_trigger.tgisinternal IS DISTINCT FROM false
     OR target_trigger.tgtype IS DISTINCT FROM
       expected."trigger_type"::SMALLINT
     OR routine.proname IS DISTINCT FROM expected."function_name"
     OR routine.pronamespace IS DISTINCT FROM
       pg_catalog.to_regnamespace('public');

  IF invalid_trigger_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 trigger boundary is incomplete'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    "signature",
    "security_definer",
    "result_type",
    "prosrc_sha256"
  ) AS (
    VALUES
      (
        'public."identity_mail_outbox_delivery_guard_v2"()',
        false,
        'trigger',
        'b7ff9d46dc48589dd9073f5000786140a0fd1f23c9b217c6b4adb0c0524d894c'
      ),
      (
        'public."identity_mail_delivery_event_append_v2"()',
        false,
        'trigger',
        '9fb8564858536138f4b818eaf145670eaa157f940b61e342cb3c6312499a451a'
      ),
      (
        'public."identity_mail_tenant_lock_v1"(text)',
        false,
        'text',
        '31c675561131be5f7b8b20b417567d084fda580da2f6d449eae9470b3808e817'
      ),
      (
        'public."identity_mail_delivery_worker_assert_v2"(text,text)',
        true,
        'jsonb',
        'c9f1c0639371712f464a9c879372e27081d34d84d17467e844291115125578e4'
      ),
      (
        'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
        true,
        'jsonb',
        '99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1'
      ),
      (
        'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
        true,
        'jsonb',
        '190bb0100186f233cd33f1b4bb4065dd4c401e5156e5b0e9ecb8c7ba190c5754'
      ),
      (
        'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
        true,
        'jsonb',
        '2037007f96e0626f46d3f6cfe7504383ac453e12e405c2d2b7ad4fd777cc52fb'
      ),
      (
        'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
        true,
        'jsonb',
        '1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d'
      ),
      (
        'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
        true,
        'jsonb',
        '39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151'
      ),
      (
        'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
        true,
        'jsonb',
        '7106bab43a04c732886ccf73c84abeab187a56bc2ed1f4c482e8828788799fc9'
      ),
      (
        'public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
        true,
        'jsonb',
        '7106bab43a04c732886ccf73c84abeab187a56bc2ed1f4c482e8828788799fc9'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_function_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid IS NULL
     OR routine.proowner IS DISTINCT FROM migration_owner_oid
     OR routine.prosecdef IS DISTINCT FROM expected."security_definer"
     OR routine.provolatile IS DISTINCT FROM 'v'::"char"
     OR routine.proparallel IS DISTINCT FROM 'u'::"char"
     OR routine.prokind IS DISTINCT FROM 'f'::"char"
     OR routine.pronargdefaults IS DISTINCT FROM 0
     OR routine.proargdefaults IS NOT NULL
     OR routine.provariadic IS DISTINCT FROM 0::OID
     OR routine.proisstrict IS DISTINCT FROM false
     OR routine.proleakproof IS DISTINCT FROM false
     OR routine.proretset IS DISTINCT FROM false
     OR routine.proallargtypes IS NOT NULL
     OR routine.proargmodes IS NOT NULL
     OR language.lanname IS DISTINCT FROM 'plpgsql'
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[]
     OR pg_catalog.format_type(routine.prorettype, NULL)
       IS DISTINCT FROM expected."result_type"
     OR pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM expected."prosrc_sha256";

  IF invalid_function_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 routine catalog metadata is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("signature") AS (
    VALUES
      ('public."identity_mail_outbox_delivery_guard_v2"()'),
      ('public."identity_mail_delivery_event_append_v2"()'),
      ('public."identity_mail_tenant_lock_v1"(text)'),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
      ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
      ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)'),
      ('public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'),
      ('public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)')
  ),
  expected_routine AS (
    SELECT routine.oid, routine.proname
    FROM expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unexpected_function_count
  FROM pg_catalog.pg_proc AS candidate
  INNER JOIN expected_routine
    ON expected_routine.proname = candidate.proname
   AND expected_routine.oid <> candidate.oid
  WHERE candidate.pronamespace = pg_catalog.to_regnamespace('public');

  IF unexpected_function_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 installed an unexpected routine overload'
      USING ERRCODE = '55000';
  END IF;

  WITH required("signature") AS (
    VALUES
      ('public."identity_mail_outbox_delivery_guard_v2"()'),
      ('public."identity_mail_delivery_event_append_v2"()'),
      ('public."identity_mail_tenant_lock_v1"(text)'),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
      ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
      ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)'),
      ('public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'),
      ('public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'),
      ('public."identity_mail_delivery_worker_assert_v1"(text)'),
      ('public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)'),
      ('public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)')
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_function_acl_count
  FROM required
  INNER JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(required."signature")
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f', routine.proowner)
    )
  ) AS privilege
  WHERE privilege.privilege_type = 'EXECUTE'
    AND privilege.grantee <> routine.proowner;

  IF unsafe_function_acl_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 installed a non-owner EXECUTE grant'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_relation_acl_count
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      relation.relacl,
      pg_catalog.acldefault('r', relation.relowner)
    )
  ) AS privilege
  WHERE relation.oid IN (
      pg_catalog.to_regclass('public."IdentityMailOutbox"'),
      pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"'),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollment"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentEvent"'
      )
    )
    AND privilege.grantee <> relation.relowner;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_column_acl_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  WHERE relation.oid IN (
      pg_catalog.to_regclass('public."IdentityMailOutbox"'),
      pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"'),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollment"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentCommand"'
      ),
      pg_catalog.to_regclass(
        'public."IdentityMailDeliveryTenantEnrollmentEvent"'
      )
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND privilege.grantee <> relation.relowner;

  IF unsafe_relation_acl_count <> 0 OR unsafe_column_acl_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 relation authority is not owner-only'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("signature", "prosrc_sha256") AS (
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
      ),
      (
        'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
        '6ebfbc2d6dd435fe7b4abc474ebc8e43b7178de8bd9723e3eb420f4079ed7d8e'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO v1_drift_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  WHERE routine.oid IS NULL
     OR pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM expected."prosrc_sha256";

  IF v1_drift_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 changed a pinned worker-v1 routine'
      USING ERRCODE = '55000';
  END IF;

  WITH required("signature") AS (
    VALUES
      ('public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)'),
      ('public."shared_beta_tenant_activate_v1"(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)')
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_stub_count
  FROM required
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(required."signature")
  WHERE routine.oid IS NULL
     OR pg_catalog.btrim(
       pg_catalog.regexp_replace(
         routine.prosrc,
         '[[:space:]]+',
         ' ',
         'g'
       )
     ) IS DISTINCT FROM
       'BEGIN RAISE EXCEPTION ''LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED'' USING ERRCODE = ''55000''; END;';

  IF invalid_stub_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_181 legacy producer retirement is not immediate'
      USING ERRCODE = '55000';
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
       WHERE outbox."claimEnrollmentStateRevision" IS NOT NULL
          OR outbox."claimPolicyRevision" IS NOT NULL
          OR outbox."claimProviderAuthorityDigest" IS NOT NULL
          OR outbox."attempts" <> 0
     )
     OR EXISTS (
       SELECT 1
       FROM public."IdentityMailDeliveryEvent" AS delivery_event
       WHERE delivery_event."claimEnrollmentStateRevision" IS NOT NULL
          OR delivery_event."claimPolicyRevision" IS NOT NULL
          OR delivery_event."claimProviderAuthorityDigest" IS NOT NULL
          OR delivery_event."attemptNumber" <> 0
     )
  THEN
    RAISE EXCEPTION 'CURRENT_181 candidate changed dormant runtime data'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO candidate_receipt_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
    AND migration."checksum" = pg_catalog.current_setting(
      'leetplus.identity_mail_tenant_lock_drain_current181_sha256'
    )
    AND migration."applied_steps_count" = 0
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CURRENT_181 rehearsal receipt changed during apply'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
