-- Immutable initial-owner invite reissue. A reissue always creates a new
-- invite, token, issue command and encrypted delivery. Existing token material
-- is never made deliverable again.

CREATE TABLE public."FounderOwnerInviteReissueCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL DEFAULT 'FOUNDER_OWNER_INVITE_REISSUE',
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "predecessorInviteId" TEXT NOT NULL,
  "predecessorOutboxId" TEXT NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "issueRequestId" TEXT NOT NULL,
  "issueRequestDigest" CHAR(64) NOT NULL,
  "issueCommandId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "secretCiphertextDigest" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "reissuedByUserId" TEXT NOT NULL,
  "reasonDigest" CHAR(64) NOT NULL,
  "supportTicketDigest" CHAR(64),
  "receipt" JSONB NOT NULL,
  "createdTransactionId" TEXT NOT NULL,
  "reissuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "FounderOwnerInviteReissueCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FounderOwnerInviteReissueCommand_shape_check" CHECK (
    "id" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "tenantId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "requestId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "predecessorInviteId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "predecessorOutboxId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reservationSubjectId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "workflowLocator" = "reservationSubjectId"
    AND "issueRequestId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "issueCommandId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "inviteId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "outboxId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "messageKey" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reissuedByUserId" COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "action" = 'FOUNDER_OWNER_INVITE_REISSUE'
    AND "sequence" > 0
    AND "requestDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "issueRequestDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "tokenHash" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "secretCiphertextDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "reasonDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND (
      "supportTicketDigest" IS NULL
      OR "supportTicketDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    )
    AND "expiresAt" > "reissuedAt"
    AND "createdTransactionId" COLLATE "C" ~ '^[1-9][0-9]*$'
    AND "id" <> "predecessorInviteId"
    AND "inviteId" <> "predecessorInviteId"
    AND "inviteId" <> "outboxId"
    AND "issueCommandId" <> "inviteId"
    AND "issueCommandId" <> "outboxId"
  )
);

CREATE UNIQUE INDEX "founder_owner_invite_reissue_request_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("tenantId", "action", "requestId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_sequence_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("tenantId", "sequence");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_predecessor_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("predecessorInviteId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_reservation_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("reservationSubjectId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_locator_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("workflowLocator");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_issue_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("issueCommandId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_invite_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("inviteId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_outbox_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("outboxId");
CREATE UNIQUE INDEX "founder_owner_invite_reissue_message_key_uidx"
  ON public."FounderOwnerInviteReissueCommand" ("messageKey");
CREATE INDEX "founder_owner_invite_reissue_tenant_sequence_idx"
  ON public."FounderOwnerInviteReissueCommand" ("tenantId", "sequence");

ALTER TABLE public."FounderOwnerInviteReissueCommand"
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_predecessor_invite_fkey"
  FOREIGN KEY ("tenantId", "predecessorInviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_predecessor_outbox_fkey"
  FOREIGN KEY ("tenantId", "predecessorOutboxId")
  REFERENCES public."IdentityMailOutbox"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_issue_fkey"
  FOREIGN KEY ("tenantId", "issueCommandId")
  REFERENCES public."IdentityOwnerInviteIssueCommand"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityMailOutbox"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "FounderOwnerInviteReissueCommand_actor_fkey"
  FOREIGN KEY ("reissuedByUserId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public."founder_owner_invite_reissue_immutable_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Founder owner invite reissue authority is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "FounderOwnerInviteReissueCommand_immutable_trigger"
BEFORE UPDATE OR DELETE ON public."FounderOwnerInviteReissueCommand"
FOR EACH ROW
EXECUTE FUNCTION public."founder_owner_invite_reissue_immutable_v1"();

-- Admit exactly one additional HOLD -> PENDING authority: the immutable
-- reissue command created in the same transaction for the exact aggregate.
CREATE OR REPLACE FUNCTION public."identity_mail_outbox_delivery_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" IS DISTINCT FROM
         'HOLD'::public."IdentityMailOutboxStatus"
    THEN
      RAISE EXCEPTION 'Identity mail outbox must be inserted as HOLD'
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
             'status', 'releasedAt', 'attempts', 'leaseVersion',
             'transitionRevision', 'availableAt', 'leaseOwnerDigest',
             'leaseTokenDigest', 'claimedAt', 'leaseExpiresAt',
             'providerAttemptKey', 'providerAttemptedAt',
             'providerAcknowledgeUntil', 'providerAuthorityDigest',
             'messageIdDigest', 'providerOutcomeClass', 'providerObservedAt',
             'providerReceiptDigest', 'terminalAckDigest', 'secretCiphertext',
             'ciphertextClearedAt', 'sentAt', 'terminalAt', 'stateReasonCode',
             'updatedAt'
           ]::TEXT[]
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(NEW)
         - ARRAY[
             'status', 'releasedAt', 'attempts', 'leaseVersion',
             'transitionRevision', 'availableAt', 'leaseOwnerDigest',
             'leaseTokenDigest', 'claimedAt', 'leaseExpiresAt',
             'providerAttemptKey', 'providerAttemptedAt',
             'providerAcknowledgeUntil', 'providerAuthorityDigest',
             'messageIdDigest', 'providerOutcomeClass', 'providerObservedAt',
             'providerReceiptDigest', 'terminalAckDigest', 'secretCiphertext',
             'ciphertextClearedAt', 'sentAt', 'terminalAt', 'stateReasonCode',
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
       OR NOT (
         EXISTS (
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
             AND command."createdTransactionId" = pg_catalog.pg_current_xact_id()::TEXT
         )
         OR EXISTS (
           SELECT 1
           FROM public."FounderOperatorBetaActivationCommand" AS command
           WHERE command."tenantId" = OLD."tenantId"
             AND command."outboxId" = OLD."id"
             AND command."issueCommandId" = OLD."issueCommandId"
             AND command."inviteId" = OLD."inviteId"
             AND command."workflowLocator" = OLD."workflowLocator"
             AND command."issueRequestDigest" = OLD."issueRequestDigest"
             AND command."tokenHash" = OLD."tokenHash"
             AND command."activatedAt" = NEW."releasedAt"
             AND command."createdTransactionId" = pg_catalog.pg_current_xact_id()::TEXT
         )
         OR EXISTS (
           SELECT 1
           FROM public."FounderOwnerInviteReissueCommand" AS command
           WHERE command."tenantId" = OLD."tenantId"
             AND command."outboxId" = OLD."id"
             AND command."issueCommandId" = OLD."issueCommandId"
             AND command."inviteId" = OLD."inviteId"
             AND command."workflowLocator" = OLD."workflowLocator"
             AND command."issueRequestDigest" = OLD."issueRequestDigest"
             AND command."tokenHash" = OLD."tokenHash"
             AND command."reissuedAt" = NEW."releasedAt"
             AND command."createdTransactionId" = pg_catalog.pg_current_xact_id()::TEXT
         )
       )
    THEN
      RAISE EXCEPTION 'Identity mail release transition is invalid'
        USING ERRCODE = '55000';
    END IF;

    NEW."availableAt" := NEW."releasedAt";
    NEW."transitionRevision" := 1;
    NEW."updatedAt" := NEW."releasedAt";
    PERFORM pg_catalog.set_config(
      'leetplus.identity_mail_delivery_event', 'RELEASED', true
    );
    RETURN NEW;
  END IF;

  event_type := pg_catalog.current_setting(
    'leetplus.identity_mail_delivery_event', true
  );

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
         AND NEW."status" = 'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_SENT'
         AND OLD."status" = 'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" = 'SENT'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_DEAD'
         AND OLD."status" = 'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" = 'DEAD'::public."IdentityMailOutboxStatus"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail delivery transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public."founder_owner_invite_reissue_v1"(
  expected_tenant_id TEXT,
  reissue_request_id TEXT,
  reissue_request_digest TEXT,
  expected_predecessor_invite_id TEXT,
  reissued_by_user_id TEXT,
  operation_reason TEXT,
  operation_reason_digest TEXT,
  operation_support_ticket TEXT,
  operation_support_ticket_digest TEXT,
  requested_aad_environment TEXT,
  candidate_command_id TEXT,
  candidate_reservation_subject_id TEXT,
  candidate_issue_request_id TEXT,
  candidate_issue_request_digest TEXT,
  candidate_issue_command_id TEXT,
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
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  digest_pattern CONSTANT TEXT := '^[0-9a-f]{64}$';
  tenant_id TEXT := pg_catalog.lower(pg_catalog.btrim(expected_tenant_id) COLLATE "C");
  request_id TEXT := pg_catalog.lower(pg_catalog.btrim(reissue_request_id) COLLATE "C");
  predecessor_invite_id TEXT := pg_catalog.lower(pg_catalog.btrim(expected_predecessor_invite_id) COLLATE "C");
  actor_id TEXT := pg_catalog.lower(pg_catalog.btrim(reissued_by_user_id) COLLATE "C");
  command_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_command_id) COLLATE "C");
  reservation_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_reservation_subject_id) COLLATE "C");
  issue_request_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_issue_request_id) COLLATE "C");
  issue_command_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_issue_command_id) COLLATE "C");
  invite_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_invite_id) COLLATE "C");
  outbox_id TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_outbox_id) COLLATE "C");
  message_key TEXT := pg_catalog.lower(pg_catalog.btrim(candidate_message_key) COLLATE "C");
  aad_environment TEXT := pg_catalog.lower(pg_catalog.btrim(requested_aad_environment) COLLATE "C");
  canonical_email TEXT;
  current_invite_id TEXT;
  current_outbox_id TEXT;
  current_sequence INTEGER;
  issued_at TIMESTAMP(3) WITH TIME ZONE;
  transaction_id TEXT;
  prior_delivery_status TEXT;
  prior_invite_state TEXT;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  replay_record public."FounderOwnerInviteReissueCommand"%ROWTYPE;
  receipt JSONB;
BEGIN
  IF tenant_id IS NULL OR tenant_id !~ uuid_pattern OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR request_id IS NULL OR request_id !~ uuid_pattern OR request_id IS DISTINCT FROM reissue_request_id
     OR predecessor_invite_id IS NULL OR predecessor_invite_id !~ uuid_pattern OR predecessor_invite_id IS DISTINCT FROM expected_predecessor_invite_id
     OR actor_id IS NULL OR actor_id !~ uuid_pattern OR actor_id IS DISTINCT FROM reissued_by_user_id
     OR command_id IS NULL OR command_id !~ uuid_pattern OR command_id IS DISTINCT FROM candidate_command_id
     OR reservation_id IS NULL OR reservation_id !~ uuid_pattern OR reservation_id IS DISTINCT FROM candidate_reservation_subject_id
     OR issue_request_id IS NULL OR issue_request_id !~ uuid_pattern OR issue_request_id IS DISTINCT FROM candidate_issue_request_id
     OR issue_command_id IS NULL OR issue_command_id !~ uuid_pattern OR issue_command_id IS DISTINCT FROM candidate_issue_command_id
     OR invite_id IS NULL OR invite_id !~ uuid_pattern OR invite_id IS DISTINCT FROM candidate_invite_id
     OR outbox_id IS NULL OR outbox_id !~ uuid_pattern OR outbox_id IS DISTINCT FROM candidate_outbox_id
     OR message_key IS NULL OR message_key !~ uuid_pattern OR message_key IS DISTINCT FROM candidate_message_key
     OR reissue_request_digest IS NULL OR reissue_request_digest !~ digest_pattern
     OR candidate_issue_request_digest IS NULL OR candidate_issue_request_digest !~ digest_pattern
     OR candidate_token_hash IS NULL OR candidate_token_hash !~ digest_pattern
     OR operation_reason_digest IS NULL OR operation_reason_digest !~ digest_pattern
     OR (operation_support_ticket_digest IS NOT NULL AND operation_support_ticket_digest !~ digest_pattern)
     OR aad_environment IS NULL OR aad_environment !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR candidate_secret_ciphertext IS NULL OR pg_catalog.octet_length(candidate_secret_ciphertext) <> 71
     OR candidate_expires_at IS NULL
     OR candidate_expires_at IS DISTINCT FROM pg_catalog.date_trunc('milliseconds', candidate_expires_at)
     OR operation_reason IS NULL OR operation_reason IS DISTINCT FROM pg_catalog.btrim(operation_reason)
     OR pg_catalog.octet_length(pg_catalog.convert_to(operation_reason, 'UTF8')) NOT BETWEEN 10 AND 500
     OR (operation_support_ticket IS NOT NULL AND (
       operation_support_ticket IS DISTINCT FROM pg_catalog.btrim(operation_support_ticket)
       OR pg_catalog.octet_length(pg_catalog.convert_to(operation_support_ticket, 'UTF8')) NOT BETWEEN 1 AND 200
     ))
     OR (operation_support_ticket IS NULL) IS DISTINCT FROM (operation_support_ticket_digest IS NULL)
     OR pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(operation_reason, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM operation_reason_digest
     OR (
       operation_support_ticket IS NOT NULL
       AND pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(operation_support_ticket, 'UTF8')),
         'hex'
       ) IS DISTINCT FROM operation_support_ticket_digest
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM (
         SELECT DISTINCT candidate.value
         FROM pg_catalog.unnest(
           ARRAY[
             command_id,
             reservation_id,
             issue_request_id,
             issue_command_id,
             invite_id,
             outbox_id,
             message_key
           ]
         ) AS candidate(value)
       ) AS distinct_candidates
     ) <> 7
  THEN
    RAISE EXCEPTION 'Owner invite reissue input is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('leetplus:identity-mail-tenant:v1:' || tenant_id, 180)
  );

  SELECT command.* INTO replay_record
  FROM public."FounderOwnerInviteReissueCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."action" = 'FOUNDER_OWNER_INVITE_REISSUE'
    AND command."requestId" = request_id;

  IF FOUND THEN
    IF replay_record."requestDigest" IS DISTINCT FROM reissue_request_digest
       OR replay_record."predecessorInviteId" IS DISTINCT FROM predecessor_invite_id
       OR replay_record."reissuedByUserId" IS DISTINCT FROM actor_id
       OR replay_record."reasonDigest" IS DISTINCT FROM operation_reason_digest
       OR replay_record."supportTicketDigest" IS DISTINCT FROM operation_support_ticket_digest
    THEN
      RAISE EXCEPTION 'Owner invite reissue request conflicts with persisted authority'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = tenant_id
      AND invite."id" = replay_record."inviteId"
      AND invite."role" = 'OWNER'::public."UserRole"
      AND invite."accessScope" = 'NETWORK'::public."UserAccessScope"
      AND invite."acceptedAt" IS NULL
      AND invite."revokedAt" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Owner invite reissue replay aggregate is invalid' USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id
      AND outbox."id" = replay_record."outboxId"
      AND outbox."inviteId" = replay_record."inviteId"
      AND outbox."status" <> 'HOLD'::public."IdentityMailOutboxStatus";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Owner invite reissue replay delivery is invalid' USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_set(replay_record."receipt", '{decision}', '"REPLAYED"'::JSONB, false);
  END IF;

  PERFORM 1 FROM public."User" AS actor
  WHERE actor."id" = actor_id AND actor."isActive" AND actor."isPlatformAdmin"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner invite reissue actor is not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
    AND tenant."status" = 'ACTIVE'::public."TenantLifecycleStatus"
    AND tenant."customerStage" = 'PILOT'::public."TenantCustomerStage"
    AND tenant."onboardingStatus" = 'OWNER_INVITED'::public."TenantOnboardingStatus"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant is not awaiting its initial owner' USING ERRCODE = '23514';
  END IF;

  SELECT command."inviteId", command."outboxId", command."sequence"
  INTO current_invite_id, current_outbox_id, current_sequence
  FROM public."FounderOwnerInviteReissueCommand" AS command
  WHERE command."tenantId" = tenant_id
  ORDER BY command."sequence" DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT activation."inviteId", activation."outboxId", 0
    INTO current_invite_id, current_outbox_id, current_sequence
    FROM public."FounderOperatorBetaActivationCommand" AS activation
    WHERE activation."tenantId" = tenant_id;
  END IF;

  IF current_invite_id IS NULL
     OR current_invite_id IS DISTINCT FROM predecessor_invite_id
  THEN
    RAISE EXCEPTION 'Initial owner invite changed before reissue' USING ERRCODE = '23514';
  END IF;

  SELECT invite.* INTO invite_record
  FROM public."UserInvite" AS invite
  WHERE invite."tenantId" = tenant_id AND invite."id" = current_invite_id
  FOR UPDATE;
  SELECT outbox.* INTO outbox_record
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = tenant_id
    AND outbox."id" = current_outbox_id
    AND outbox."inviteId" = current_invite_id
  FOR UPDATE;

  issued_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  transaction_id := pg_catalog.pg_current_xact_id()::TEXT;

  IF invite_record."id" IS NULL OR outbox_record."id" IS NULL
     OR invite_record."email" IS NULL
     OR invite_record."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
     OR invite_record."accessScope" IS DISTINCT FROM 'NETWORK'::public."UserAccessScope"
     OR invite_record."customRoleId" IS NOT NULL
     OR pg_catalog.cardinality(invite_record."storeIds") <> 0
     OR invite_record."acceptedAt" IS NOT NULL
     OR (invite_record."revokedAt" IS NULL AND invite_record."expiresAt" > issued_at AT TIME ZONE 'UTC')
     OR candidate_expires_at <= issued_at + INTERVAL '15 minutes'
     OR candidate_expires_at > issued_at + INTERVAL '30 days'
  THEN
    RAISE EXCEPTION 'Current owner invite is not eligible for reissue' USING ERRCODE = '23514';
  END IF;

  canonical_email := pg_catalog.lower(pg_catalog.btrim(invite_record."email") COLLATE "C");
  IF pg_catalog.strpos(pg_catalog.lower(operation_reason), canonical_email) > 0
     OR (
       operation_support_ticket IS NOT NULL
       AND pg_catalog.strpos(pg_catalog.lower(operation_support_ticket), canonical_email) > 0
     )
  THEN
    RAISE EXCEPTION 'Owner identity must not be copied into reissue metadata' USING ERRCODE = '22023';
  END IF;

  prior_invite_state := CASE WHEN invite_record."revokedAt" IS NULL THEN 'EXPIRED' ELSE 'REVOKED' END;
  prior_delivery_status := outbox_record."status"::TEXT;

  IF invite_record."revokedAt" IS NULL THEN
    UPDATE public."UserInvite"
    SET "revokedAt" = issued_at AT TIME ZONE 'UTC',
        "revokedByUserId" = actor_id,
        "updatedAt" = issued_at AT TIME ZONE 'UTC'
    WHERE "tenantId" = tenant_id AND "id" = current_invite_id AND "revokedAt" IS NULL;
  END IF;

  IF outbox_record."status" IN (
       'PENDING'::public."IdentityMailOutboxStatus",
       'RETRY'::public."IdentityMailOutboxStatus",
       'CLAIMED'::public."IdentityMailOutboxStatus"
     ) AND outbox_record."providerAttemptKey" IS NULL
  THEN
    PERFORM pg_catalog.set_config('leetplus.identity_mail_delivery_event', 'CANCELED', true);
    UPDATE public."IdentityMailOutbox"
    SET "status" = 'CANCELED'::public."IdentityMailOutboxStatus",
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
        "providerObservedAt" = issued_at,
        "providerReceiptDigest" = NULL,
        "terminalAckDigest" = NULL,
        "sentAt" = NULL,
        "terminalAt" = issued_at,
        "stateReasonCode" = 'OWNER_INVITE_REISSUED',
        "updatedAt" = issued_at
    WHERE "tenantId" = tenant_id AND "id" = current_outbox_id;
  ELSIF NOT (
    outbox_record."status" IN (
      'CANCELED'::public."IdentityMailOutboxStatus",
      'SENT'::public."IdentityMailOutboxStatus",
      'DEAD'::public."IdentityMailOutboxStatus",
      'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
    ) OR (
      outbox_record."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
      AND outbox_record."providerAttemptKey" IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Current owner invite delivery cannot be reissued safely' USING ERRCODE = '23514';
  END IF;

  SELECT claim.* INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = canonical_email
  FOR UPDATE;
  IF FOUND THEN
    IF claim_record."tenantId" IS DISTINCT FROM tenant_id
       OR claim_record."claimType" IS DISTINCT FROM 'INVITE'::public."IdentityEmailClaimType"
       OR claim_record."subjectId" IS DISTINCT FROM current_invite_id
       OR claim_record."revision" IS DISTINCT FROM invite_record."identityClaimRevision"
    THEN
      RAISE EXCEPTION 'Current owner identity claim changed before reissue' USING ERRCODE = '23514';
    END IF;
    PERFORM public."identity_email_claim_release_v2"(
      canonical_email, tenant_id, 'INVITE', current_invite_id, claim_record."revision"
    );
  END IF;

  PERFORM public."identity_email_claim_reserve_invite_v2"(
    canonical_email, tenant_id, reservation_id
  );
  PERFORM public."identity_owner_invite_issue_hold_v1"(
    reservation_id,
    tenant_id,
    reservation_id,
    1,
    issue_request_id,
    candidate_issue_request_digest,
    aad_environment,
    issue_command_id,
    invite_id,
    outbox_id,
    message_key,
    candidate_token_hash,
    candidate_secret_ciphertext,
    candidate_expires_at
  );

  receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REISSUE_INITIAL_OWNER_INVITE',
    'decision', 'REISSUED',
    'tenantId', tenant_id,
    'commandId', command_id,
    'sequence', current_sequence + 1,
    'predecessorInviteId', current_invite_id,
    'inviteId', invite_id,
    'outboxId', outbox_id,
    'outboxStatus', 'PENDING',
    'expiresAtEpochMs', pg_catalog.floor(EXTRACT(EPOCH FROM candidate_expires_at) * 1000)::BIGINT,
    'createdTransactionId', transaction_id
  );

  INSERT INTO public."FounderOwnerInviteReissueCommand" (
    "id", "tenantId", "requestId", "requestDigest", "sequence",
    "predecessorInviteId", "predecessorOutboxId", "reservationSubjectId",
    "workflowLocator", "issueRequestId", "issueRequestDigest",
    "issueCommandId", "inviteId", "outboxId", "messageKey", "tokenHash",
    "secretCiphertextDigest", "expiresAt", "reissuedByUserId", "reasonDigest",
    "supportTicketDigest", "receipt", "createdTransactionId", "reissuedAt"
  ) VALUES (
    command_id, tenant_id, request_id, reissue_request_digest,
    current_sequence + 1, current_invite_id, current_outbox_id, reservation_id,
    reservation_id, issue_request_id, candidate_issue_request_digest,
    issue_command_id, invite_id, outbox_id, message_key, candidate_token_hash,
    pg_catalog.encode(pg_catalog.sha256(candidate_secret_ciphertext), 'hex'),
    candidate_expires_at, actor_id, operation_reason_digest,
    operation_support_ticket_digest, receipt, transaction_id, issued_at
  );

  UPDATE public."IdentityMailOutbox"
  SET "status" = 'PENDING'::public."IdentityMailOutboxStatus",
      "releasedAt" = issued_at
  WHERE "tenantId" = tenant_id
    AND "id" = outbox_id
    AND "status" = 'HOLD'::public."IdentityMailOutboxStatus";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'New owner invite delivery was not released' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public."PlatformAdminAuditEvent" (
    "tenantId", "actorUserId", "requestId", "action", "targetType",
    "targetId", "reason", "before", "after", "metadata", "createdAt"
  ) VALUES (
    tenant_id, actor_id, request_id, 'FOUNDER_OWNER_INVITE_REISSUED',
    'UserInvite', invite_id, operation_reason,
    pg_catalog.jsonb_build_object(
      'inviteId', current_invite_id,
      'inviteState', prior_invite_state,
      'deliveryStatus', prior_delivery_status
    ),
    receipt,
    pg_catalog.jsonb_build_object(
      'contractVersion', 'FOUNDER_OWNER_INVITE_LIFECYCLE_V1',
      'requestDigest', reissue_request_digest,
      'expectedInviteId', current_invite_id,
      'supportTicket', operation_support_ticket,
      'blindResend', false
    ),
    issued_at AT TIME ZONE 'UTC'
  );

  RETURN receipt;
END;
$$;

REVOKE ALL ON TABLE public."FounderOwnerInviteReissueCommand" FROM PUBLIC;
REVOKE ALL ON FUNCTION public."founder_owner_invite_reissue_immutable_v1"() FROM PUBLIC;
REVOKE ALL ON FUNCTION public."founder_owner_invite_reissue_v1"(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
) FROM PUBLIC;

COMMENT ON TABLE public."FounderOwnerInviteReissueCommand" IS
  'Immutable PII-free predecessor-to-successor authority for one new initial OWNER invite and token.';
COMMENT ON FUNCTION public."founder_owner_invite_reissue_v1"(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BYTEA,
  TIMESTAMP(3) WITH TIME ZONE
) IS
  'Atomic founder reissue boundary. It invalidates an eligible predecessor, creates a new encrypted invite aggregate and releases only the new outbox.';
