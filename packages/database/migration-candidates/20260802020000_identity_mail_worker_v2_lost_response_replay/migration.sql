BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT_184 is a stacked, disposable-rehearsal-only successor above the
-- exact frozen CURRENT_183 candidate. It is NOT_DEPLOYABLE. It creates no
-- role, grants no authority and does not wire worker v2 into runtime.
--
-- This slice makes only the two provider-settlement calls replay-safe after
-- an unknown database outcome. The original CURRENT_183 bodies remain
-- owner-only implementation details; the exact five-RPC worker surface is
-- preserved by same-signature wrappers. SMTP itself is never retried here.
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
    'leetplus.identity_mail_worker_v2_replay_current184_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_worker_v2_replay_current184_sha256',
    true
  );

  IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-worker-v2-replay-current184'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT_184 candidate is restricted to the confirmed disposable rehearsal boundary'
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
      '20260802020000_identity_mail_worker_v2_lost_response_replay'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1
     OR candidate_receipt_checksum IS DISTINCT FROM
       rehearsal_candidate_sha256
     OR candidate_receipt_applied_steps IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT_184 requires one exact unfinished Prisma rehearsal receipt'
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

  IF completed_migration_count IS DISTINCT FROM 183
     OR lexical_migration_head IS DISTINCT FROM
       '20260802010000_identity_mail_worker_v2_freshness_protocol'
     OR migration_manifest_digest IS DISTINCT FROM
       '70f66215bdadf0652ade1640e9dd20cf565d25a81d5d319a4c3d68c4e1c9e256'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260802010000_identity_mail_worker_v2_freshness_protocol'
         AND migration."checksum" =
           'a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260802020000_identity_mail_worker_v2_lost_response_replay'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_184 requires the exact completed frozen CURRENT_183 candidate'
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
           ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
           ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
           ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
           ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)'),
           ('public."identity_mail_delivery_event_append_v2"()')
       ) AS required("signature")
       LEFT JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
       WHERE routine.oid IS NULL
          OR routine.proowner <> migration_owner_oid
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
           ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
           ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
           ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)')
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
     )
  THEN
    RAISE EXCEPTION 'CURRENT_184 predecessor worker-v2 contract drifted'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisite$;

ALTER TABLE public."IdentityMailDeliveryEvent"
  ADD COLUMN "transitionRequestDigest" CHAR(64),
  ADD COLUMN "settlementState" VARCHAR(16),
  ADD CONSTRAINT
    "identity_mail_delivery_event_transition_request_check"
  CHECK (
    (
      "transitionRequestDigest" IS NULL
      AND "settlementState" IS NULL
    )
    OR (
      "transitionRequestDigest" IS NOT NULL
      AND "settlementState" IS NOT NULL
      AND ("transitionRequestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND "settlementState" IN ('ACTIVE', 'DRAINING')
      AND "eventType" IN (
        'PROVIDER_MARKED',
        'CANCELED',
        'PRE_PROVIDER_RETRY',
        'PRE_PROVIDER_DEAD',
        'PROVIDER_ACCEPTED',
        'PROVIDER_DEFINITIVE_NOT_SENT',
        'PROVIDER_AMBIGUOUS'
      )
    )
  );

CREATE UNIQUE INDEX
  "identity_mail_delivery_event_transition_request_uidx"
  ON public."IdentityMailDeliveryEvent" (
    "tenantId",
    "outboxId",
    "transitionRequestDigest"
  )
  WHERE "transitionRequestDigest" IS NOT NULL;

ALTER FUNCTION public."identity_initial_owner_mail_provider_mark_v2"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
RENAME TO "identity_initial_owner_mail_provider_mark_current183";

ALTER FUNCTION public."identity_initial_owner_mail_complete_v2"(
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
RENAME TO "identity_initial_owner_mail_complete_current183";

CREATE OR REPLACE FUNCTION public."identity_mail_delivery_event_append_v2"()
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
  transition_request_digest TEXT;
  settlement_state TEXT;
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

  transition_request_digest := NULLIF(
    pg_catalog.current_setting(
      'leetplus.identity_mail_transition_request_digest',
      true
    ),
    ''
  );
  settlement_state := NULLIF(
    pg_catalog.current_setting(
      'leetplus.identity_mail_settlement_state',
      true
    ),
    ''
  );

  IF (transition_request_digest IS NULL) <>
       (settlement_state IS NULL)
     OR (
       transition_request_digest IS NOT NULL
       AND (
         (transition_request_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
         OR settlement_state NOT IN ('ACTIVE', 'DRAINING')
         OR event_type NOT IN (
           'PROVIDER_MARKED',
           'CANCELED',
           'PRE_PROVIDER_RETRY',
           'PRE_PROVIDER_DEAD',
           'PROVIDER_ACCEPTED',
           'PROVIDER_DEFINITIVE_NOT_SENT',
           'PROVIDER_AMBIGUOUS'
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail transition request context is invalid'
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
        CASE
          WHEN transition_request_digest IS NULL THEN
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
              COALESCE(
                NEW."leaseOwnerDigest",
                OLD."leaseOwnerDigest",
                '-'
              ),
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
            )
          ELSE
            pg_catalog.concat_ws(
              '|',
              'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V3',
              NEW."tenantId",
              NEW."id",
              NEW."inviteId",
              NEW."transitionRevision"::TEXT,
              NEW."leaseVersion"::TEXT,
              NEW."attempts"::TEXT,
              event_type,
              OLD."status"::TEXT,
              NEW."status"::TEXT,
              COALESCE(
                NEW."leaseOwnerDigest",
                OLD."leaseOwnerDigest",
                '-'
              ),
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
              transition_request_digest,
              settlement_state,
              pg_catalog.floor(
                pg_catalog.date_part('epoch', NEW."updatedAt") * 1000
              )::BIGINT::TEXT,
              pg_catalog.pg_current_xact_id()::TEXT
            )
        END,
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
    "transitionRequestDigest",
    "settlementState",
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
    transition_request_digest,
    settlement_state,
    NEW."updatedAt",
    pg_catalog.pg_current_xact_id()::TEXT,
    event_digest
  );

  RETURN NULL;
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
  request_digest TEXT;
  settlement_state TEXT;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  replay_event public."IdentityMailDeliveryEvent"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  worker_role_record RECORD;
  result JSONB;
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
    settlement_state := 'ACTIVE';
  ELSIF enrollment_record."state" = 'DRAINING'
     AND enrollment_record."enabled" = false
     AND enrollment_record."activeCommandId" IS NOT NULL
  THEN
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
       OR command_record."previousWorkerRoleName" IS DISTINCT FROM
         session_user
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         enrollment_record."workerRoleOid"
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         worker_role_record.oid::BIGINT
       OR command_record."previousProviderAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR command_record."previousConfigurationDigest" IS DISTINCT FROM
         enrollment_record."currentConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity mail drain settlement authority is invalid'
        USING ERRCODE = '42501';
    END IF;
    settlement_state := 'DRAINING';
  ELSE
    RAISE EXCEPTION 'Identity mail settlement state is not eligible'
      USING ERRCODE = '42501';
  END IF;

  request_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          'LEETPLUS_IDENTITY_MAIL_PROVIDER_MARK_REQUEST_V2',
          tenant_id,
          p_outbox_id,
          p_expected_lease_version::TEXT,
          p_lease_owner_digest,
          p_lease_token_digest,
          p_provider_attempt_key,
          p_provider_authority_digest,
          p_message_id_digest
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  SELECT delivery_event.*
  INTO replay_event
  FROM public."IdentityMailDeliveryEvent" AS delivery_event
  WHERE delivery_event."tenantId" = tenant_id
    AND delivery_event."outboxId" = p_outbox_id
    AND delivery_event."transitionRequestDigest" = request_digest
  FOR SHARE OF delivery_event;

  IF FOUND THEN
    IF replay_event."eventType" = 'CANCELED' THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 2,
        'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
        'decision', 'CANCELED',
        'outboxId', p_outbox_id,
        'tenantId', tenant_id,
        'leaseVersion', p_expected_lease_version,
        'transitionRevision', replay_event."transitionRevision"
      );
    END IF;

    IF replay_event."eventType" <> 'PROVIDER_MARKED'
       OR replay_event."providerAttemptKey" IS DISTINCT FROM
         p_provider_attempt_key
       OR replay_event."providerAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR replay_event."messageIdDigest" IS DISTINCT FROM
         p_message_id_digest
    THEN
      RAISE EXCEPTION 'Identity mail provider marker replay evidence drifted'
        USING ERRCODE = '55000';
    END IF;

    SELECT target_outbox.*
    INTO outbox_record
    FROM public."IdentityMailOutbox" AS target_outbox
    WHERE target_outbox."tenantId" = tenant_id
      AND target_outbox."id" = p_outbox_id
    FOR SHARE OF target_outbox;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Identity mail provider marker replay outbox is missing'
        USING ERRCODE = '55000';
    END IF;

    now_at := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );

    IF outbox_record."status" =
         'CLAIMED'::public."IdentityMailOutboxStatus"
       AND outbox_record."transitionRevision" =
         replay_event."transitionRevision"
       AND outbox_record."leaseVersion" = p_expected_lease_version
       AND outbox_record."leaseOwnerDigest" = p_lease_owner_digest
       AND outbox_record."leaseTokenDigest" = p_lease_token_digest
       AND outbox_record."providerAttemptKey" = p_provider_attempt_key
       AND outbox_record."providerAuthorityDigest" =
         p_provider_authority_digest
       AND outbox_record."messageIdDigest" = p_message_id_digest
       AND outbox_record."providerAcknowledgeUntil" > now_at
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 2,
        'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
        'decision', 'MARKED',
        'candidateStatus', 'NOT_DEPLOYABLE',
        'outboxId', p_outbox_id,
        'tenantId', tenant_id,
        'leaseVersion', p_expected_lease_version,
        'transitionRevision', replay_event."transitionRevision",
        'providerAttemptKey', p_provider_attempt_key,
        'settlementState', replay_event."settlementState"
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT_V2',
      'decision', 'HANDOFF',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'outboxId', p_outbox_id,
      'tenantId', tenant_id,
      'leaseVersion', p_expected_lease_version,
      'transitionRevision', outbox_record."transitionRevision",
      'settlementState', replay_event."settlementState",
      'handoffReason', 'MARKER_NOT_REUSABLE',
      'durableEvidenceEventId', replay_event."id"
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_transition_request_digest',
    request_digest,
    true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_settlement_state',
    settlement_state,
    true
  );

  result := public."identity_initial_owner_mail_provider_mark_current183"(
    tenant_id,
    p_outbox_id,
    p_expected_lease_version,
    p_lease_owner_digest,
    p_lease_token_digest,
    p_provider_attempt_key,
    p_provider_authority_digest,
    p_message_id_digest
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_transition_request_digest',
    '',
    true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_settlement_state',
    '',
    true
  );

  RETURN result;
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
  request_digest TEXT;
  settlement_state TEXT;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  replay_event public."IdentityMailDeliveryEvent"%ROWTYPE;
  worker_role_record RECORD;
  result JSONB;
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
    settlement_state := 'ACTIVE';
  ELSIF enrollment_record."state" = 'DRAINING'
     AND enrollment_record."enabled" = false
     AND enrollment_record."activeCommandId" IS NOT NULL
  THEN
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
       OR command_record."previousWorkerRoleName" IS DISTINCT FROM
         session_user
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         enrollment_record."workerRoleOid"
       OR command_record."previousWorkerRoleOid" IS DISTINCT FROM
         worker_role_record.oid::BIGINT
       OR command_record."previousProviderAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR command_record."previousConfigurationDigest" IS DISTINCT FROM
         enrollment_record."currentConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity mail drain completion authority is invalid'
        USING ERRCODE = '42501';
    END IF;
    settlement_state := 'DRAINING';
  ELSE
    RAISE EXCEPTION 'Identity mail completion state is not eligible'
      USING ERRCODE = '42501';
  END IF;

  request_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          'LEETPLUS_IDENTITY_MAIL_COMPLETE_REQUEST_V2',
          tenant_id,
          p_outbox_id,
          p_expected_lease_version::TEXT,
          p_lease_owner_digest,
          p_lease_token_digest,
          p_provider_authority_digest,
          p_outcome_code,
          COALESCE(p_provider_receipt_digest, '-'),
          COALESCE(p_terminal_ack_digest, '-')
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  SELECT delivery_event.*
  INTO replay_event
  FROM public."IdentityMailDeliveryEvent" AS delivery_event
  WHERE delivery_event."tenantId" = tenant_id
    AND delivery_event."outboxId" = p_outbox_id
    AND delivery_event."transitionRequestDigest" = request_digest
  FOR SHARE OF delivery_event;

  IF FOUND THEN
    IF replay_event."leaseVersion" IS DISTINCT FROM
         p_expected_lease_version
    THEN
      RAISE EXCEPTION 'Identity mail completion replay evidence drifted'
        USING ERRCODE = '55000';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'COMPLETE_INITIAL_OWNER_MAIL_V2',
      'decision', replay_event."toStatus"::TEXT,
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', tenant_id,
      'outboxId', p_outbox_id,
      'leaseVersion', p_expected_lease_version,
      'transitionRevision', replay_event."transitionRevision",
      'settlementState', replay_event."settlementState"
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_transition_request_digest',
    request_digest,
    true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_settlement_state',
    settlement_state,
    true
  );

  result := public."identity_initial_owner_mail_complete_current183"(
    tenant_id,
    p_outbox_id,
    p_expected_lease_version,
    p_lease_owner_digest,
    p_lease_token_digest,
    p_provider_authority_digest,
    p_outcome_code,
    p_provider_receipt_digest,
    p_terminal_ack_digest
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_transition_request_digest',
    '',
    true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_settlement_state',
    '',
    true
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v2"(
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
        '20260802020000_identity_mail_worker_v2_lost_response_replay'
    )
  INTO migration_count, migration_head, candidate_checksum
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 184
     OR migration_head IS DISTINCT FROM
       '20260802020000_identity_mail_worker_v2_lost_response_replay'
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
      'Identity mail worker v2 database receipt is not exact CURRENT_184'
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

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_delivery_event_append_v2"()
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_initial_owner_mail_provider_mark_current183"(
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
ON FUNCTION public."identity_initial_owner_mail_complete_current183"(
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
ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)
FROM PUBLIC;

COMMENT ON COLUMN
  public."IdentityMailDeliveryEvent"."transitionRequestDigest" IS
  'CURRENT_184 domain-separated digest of the exact provider settlement request; excludes PII and enables committed-response replay.';

COMMENT ON COLUMN public."IdentityMailDeliveryEvent"."settlementState" IS
  'CURRENT_184 ACTIVE or DRAINING enrollment state captured with a replay-safe settlement transition.';

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
  'CURRENT_184 NOT_DEPLOYABLE exact-request provider-marker replay. MARKED is replayed only while the durable marker is still current and acknowledgement-live; otherwise HANDOFF forbids SMTP.';

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
  'CURRENT_184 NOT_DEPLOYABLE exact-request completion replay from immutable delivery-event evidence; no provider call is performed.';

COMMENT ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  TEXT,
  TEXT
) IS
  'CURRENT_184 NOT_DEPLOYABLE ACTIVE worker-v2 readiness pinned to exact CURRENT_184; authorization and send remain false.';

DO $postcondition$
DECLARE
  migration_owner_oid OID;
  invalid_column_count INTEGER;
  invalid_index_count INTEGER;
  invalid_routine_count INTEGER;
  unsafe_function_acl_count INTEGER;
  candidate_receipt_count INTEGER;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  WITH expected("column_name", "formatted_type") AS (
    VALUES
      ('transitionRequestDigest', 'character(64)'),
      ('settlementState', 'character varying(16)')
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_column_count
  FROM expected
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid =
      pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"')
   AND attribute.attname = expected."column_name"
   AND attribute.attnum > 0
   AND attribute.attisdropped = false
  WHERE attribute.attnum IS NULL
     OR pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
       IS DISTINCT FROM expected."formatted_type"
     OR attribute.attnotnull = true;

  IF invalid_column_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_184 replay evidence columns are unsafe'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_index_count
  FROM pg_catalog.pg_index AS index_entry
  INNER JOIN pg_catalog.pg_class AS index_relation
    ON index_relation.oid = index_entry.indexrelid
  WHERE index_entry.indrelid =
      pg_catalog.to_regclass('public."IdentityMailDeliveryEvent"')
    AND index_relation.relname =
      'identity_mail_delivery_event_transition_request_uidx'
    AND index_entry.indisunique = true
    AND index_entry.indisvalid = true
    AND index_entry.indpred IS NOT NULL;

  IF invalid_index_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CURRENT_184 replay uniqueness index is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("signature", "security_definer") AS (
    VALUES
      ('public."identity_mail_delivery_event_append_v2"()', false),
      ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)', true),
      ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)', true),
      ('public."identity_initial_owner_mail_provider_mark_current183"(text,text,integer,text,text,text,text,text)', true),
      ('public."identity_initial_owner_mail_complete_current183"(text,text,integer,text,text,text,text,text,text)', true),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)', true)
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_routine_count
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
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[]
     OR language.lanname IS DISTINCT FROM 'plpgsql';

  IF invalid_routine_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_184 routine catalog metadata is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH required("signature") AS (
    VALUES
      ('public."identity_mail_delivery_event_append_v2"()'),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
      ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
      ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_current183"(text,text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_current183"(text,text,integer,text,text,text,text,text,text)')
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
    RAISE EXCEPTION 'CURRENT_184 installed a non-owner EXECUTE grant'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO candidate_receipt_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260802020000_identity_mail_worker_v2_lost_response_replay'
    AND migration."checksum" = pg_catalog.current_setting(
      'leetplus.identity_mail_worker_v2_replay_current184_sha256'
    )
    AND migration."applied_steps_count" = 0
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CURRENT_184 rehearsal receipt changed during apply'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
