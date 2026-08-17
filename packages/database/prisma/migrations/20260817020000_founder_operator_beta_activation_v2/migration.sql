-- Single-founder beta activation v2.
--
-- This successor deliberately does not depend on CURRENT198-202 offline roots.
-- It consumes exactly one persisted FounderOperatorBetaGo, activates exactly
-- one suspended beta tenant and releases exactly one mailbox-bound OWNER
-- invite in the same SERIALIZABLE transaction.

CREATE TABLE public."FounderOperatorBetaActivationCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL
    DEFAULT 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "goId" TEXT NOT NULL,
  "releaseSha" CHAR(40) NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "shellEvidenceDigest" CHAR(64) NOT NULL,
  "actualShellDigest" CHAR(64) NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "reservationClaimRevision" INTEGER NOT NULL,
  "issueRequestId" TEXT NOT NULL,
  "issueRequestDigest" CHAR(64) NOT NULL,
  "issueCommandId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "secretCiphertextDigest" CHAR(64) NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "activatedByUserId" TEXT NOT NULL,
  "entitlementProfileRevision" INTEGER NOT NULL,
  "executionRevisionBefore" INTEGER NOT NULL,
  "executionRevisionAfter" INTEGER NOT NULL,
  "trialPolicyVersion" VARCHAR(64) NOT NULL,
  "trialDurationSeconds" INTEGER NOT NULL,
  "trialStartsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "trialEndsAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "receipt" JSONB NOT NULL,
  "createdTransactionId" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "FounderOperatorBetaActivationCommand_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "FounderOperatorBetaActivationCommand_action_check" CHECK (
    "action" = 'ACTIVATE_AND_RELEASE_OWNER_INVITE'
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_uuid_check" CHECK (
    "id" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "tenantId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "requestId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "goId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reservationSubjectId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "issueRequestId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "issueCommandId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "inviteId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "outboxId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "messageKey" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "workflowLocator" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "activatedByUserId" COLLATE "C" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_digest_check" CHECK (
    "requestDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "shellEvidenceDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "actualShellDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "issueRequestDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "tokenHash" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "secretCiphertextDigest" COLLATE "C" ~ '^[0-9a-f]{64}$'
    AND "releaseSha" COLLATE "C" ~ '^[0-9a-f]{40}$'
    AND "environment" COLLATE "C" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_revision_check" CHECK (
    "reservationClaimRevision" BETWEEN 1 AND 2147483646
    AND "entitlementProfileRevision" BETWEEN 1 AND 2147483646
    AND "executionRevisionBefore" BETWEEN 0 AND 2147483645
    AND "executionRevisionAfter" = "executionRevisionBefore" + 1
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_trial_check" CHECK (
    "trialPolicyVersion" = 'FOUNDER_OPERATOR_BETA_TRIAL_V1'
    AND "trialDurationSeconds" = 2592000
    AND "trialStartsAt" = "activatedAt"
    AND "trialEndsAt" = "trialStartsAt" + INTERVAL '30 days'
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_transaction_check" CHECK (
    "createdTransactionId" COLLATE "C" ~ '^[1-9][0-9]*$'
  ),
  CONSTRAINT "FounderOperatorBetaActivationCommand_receipt_check" CHECK (
    "receipt" ->> 'schemaVersion' = '2'
    AND "receipt" ->> 'operation' =
      'ACTIVATE_AND_RELEASE_OWNER_INVITE'
    AND "receipt" ->> 'decision' = 'ACTIVATED'
    AND "receipt" ->> 'tenantId' = "tenantId"
    AND "receipt" ->> 'activationCommandId' = "id"
    AND "receipt" ->> 'goId' = "goId"
    AND "receipt" ->> 'releaseSha' = "releaseSha"
    AND "receipt" ->> 'environment' = "environment"
    AND "receipt" ->> 'inviteId' = "inviteId"
    AND "receipt" ->> 'outboxId' = "outboxId"
    AND "receipt" ->> 'createdTransactionId' = "createdTransactionId"
  )
);

CREATE UNIQUE INDEX "founder_operator_beta_activation_request_uidx"
  ON public."FounderOperatorBetaActivationCommand" (
    "tenantId", "action", "requestId"
  );
CREATE UNIQUE INDEX "founder_operator_beta_activation_tenant_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("tenantId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_go_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("goId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_go_tenant_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("goId", "tenantId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_issue_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("issueCommandId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_tenant_issue_uidx"
  ON public."FounderOperatorBetaActivationCommand" (
    "tenantId", "issueCommandId"
  );
CREATE UNIQUE INDEX "founder_operator_beta_activation_invite_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("inviteId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_tenant_invite_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("tenantId", "inviteId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_outbox_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("outboxId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_tenant_outbox_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("tenantId", "outboxId");
CREATE UNIQUE INDEX "founder_operator_beta_activation_locator_uidx"
  ON public."FounderOperatorBetaActivationCommand" ("workflowLocator");

CREATE UNIQUE INDEX "founder_operator_beta_go_id_tenant_uidx"
  ON public."FounderOperatorBetaGo" ("id", "tenantId");

ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_go_fkey"
  FOREIGN KEY ("goId", "tenantId")
  REFERENCES public."FounderOperatorBetaGo"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_issue_fkey"
  FOREIGN KEY ("tenantId", "issueCommandId")
  REFERENCES public."IdentityOwnerInviteIssueCommand"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityMailOutbox"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."FounderOperatorBetaActivationCommand"
  ADD CONSTRAINT "FounderOperatorBetaActivationCommand_actor_fkey"
  FOREIGN KEY ("activatedByUserId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public."founder_operator_beta_activation_immutable_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Founder operator beta activation is immutable'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "FounderOperatorBetaActivationCommand_immutable_trigger"
BEFORE UPDATE OR DELETE
ON public."FounderOperatorBetaActivationCommand"
FOR EACH ROW
EXECUTE FUNCTION public."founder_operator_beta_activation_immutable_v2"();

CREATE OR REPLACE FUNCTION public."founder_operator_beta_go_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Founder operator beta GO is append-only'
      USING ERRCODE = '42501';
  END IF;

  IF (
       pg_catalog.to_jsonb(NEW)
       - 'stateRevision'
       - 'revokedAt'
       - 'revocationReasonDigest'
       - 'consumedAt'
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(OLD)
       - 'stateRevision'
       - 'revokedAt'
       - 'revocationReasonDigest'
       - 'consumedAt'
     )
  THEN
    RAISE EXCEPTION 'Founder operator beta GO authority is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."consumedAt" IS NOT NULL
     OR NOT (
       (
         NEW."stateRevision" = 3
         AND NEW."consumedAt" IS NULL
         AND NEW."revokedAt" IS NOT NULL
         AND NEW."revocationReasonDigest" IS NOT NULL
       )
       OR (
         NEW."stateRevision" = 2
         AND NEW."revokedAt" IS NULL
         AND NEW."revocationReasonDigest" IS NULL
         AND NEW."consumedAt" IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public."FounderOperatorBetaActivationCommand" AS command
           WHERE command."goId" = OLD."id"
             AND command."tenantId" = OLD."tenantId"
             AND command."releaseSha" = OLD."releaseSha"
             AND command."environment" = OLD."environment"
             AND command."activatedByUserId" = OLD."approvedByUserId"
             AND OLD."rollbackOwnerUserId" = OLD."approvedByUserId"
             AND command."activatedAt" = NEW."consumedAt"
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Founder operator beta GO transition is invalid'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public."shared_beta_tenant_activation_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."customerStage" =
       'PILOT'::public."TenantCustomerStage"
     AND OLD."status" =
       'SUSPENDED'::public."TenantLifecycleStatus"
     AND OLD."onboardingStatus" =
       'PROVISIONING'::public."TenantOnboardingStatus"
     AND OLD."trialStartsAt" IS NULL
     AND OLD."trialEndsAt" IS NULL
     AND (
       NEW."customerStage" IS DISTINCT FROM OLD."customerStage"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."onboardingStatus" IS DISTINCT FROM
         OLD."onboardingStatus"
       OR NEW."trialStartsAt" IS DISTINCT FROM OLD."trialStartsAt"
       OR NEW."trialEndsAt" IS DISTINCT FROM OLD."trialEndsAt"
       OR NEW."entitlementProfileRevision" IS DISTINCT FROM
         OLD."entitlementProfileRevision"
       OR NEW."executionRevision" IS DISTINCT FROM
         OLD."executionRevision"
       OR NEW."statusChangedAt" IS DISTINCT FROM OLD."statusChangedAt"
       OR NEW."statusReason" IS DISTINCT FROM OLD."statusReason"
     )
     AND (
       NEW."status" IS DISTINCT FROM
         'ACTIVE'::public."TenantLifecycleStatus"
       OR NEW."customerStage" IS DISTINCT FROM
         'PILOT'::public."TenantCustomerStage"
       OR NEW."onboardingStatus" IS DISTINCT FROM
         'OWNER_INVITED'::public."TenantOnboardingStatus"
       OR NEW."trialStartsAt" IS NULL
       OR NEW."trialEndsAt" IS NULL
       OR NEW."trialEndsAt" <= NEW."trialStartsAt"
       OR NEW."entitlementProfileRevision" IS DISTINCT FROM
         OLD."entitlementProfileRevision"
       OR NEW."executionRevision" IS DISTINCT FROM
         OLD."executionRevision" + 1
       OR NOT (
         EXISTS (
           SELECT 1
           FROM public."SharedBetaTenantActivationCommand" AS command
           WHERE command."tenantId" = OLD."id"
             AND command."trialStartsAt" = NEW."trialStartsAt"
             AND command."trialEndsAt" = NEW."trialEndsAt"
             AND command."executionRevisionBefore" = OLD."executionRevision"
             AND command."executionRevisionAfter" = NEW."executionRevision"
             AND command."activatedAt" = NEW."trialStartsAt"
             AND NEW."statusChangedAt" =
               command."activatedAt" AT TIME ZONE 'UTC'
             AND NEW."statusReason" =
               'Shared beta activation ' || command."id"
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
         )
         OR EXISTS (
           SELECT 1
           FROM public."FounderOperatorBetaActivationCommand" AS command
           WHERE command."tenantId" = OLD."id"
             AND command."trialStartsAt" = NEW."trialStartsAt"
             AND command."trialEndsAt" = NEW."trialEndsAt"
             AND command."executionRevisionBefore" = OLD."executionRevision"
             AND command."executionRevisionAfter" = NEW."executionRevision"
             AND command."activatedAt" = NEW."trialStartsAt"
             AND NEW."statusChangedAt" =
               command."activatedAt" AT TIME ZONE 'UTC'
             AND NEW."statusReason" =
               'Founder beta activation ' || command."id"
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
         )
       )
     )
  THEN
    RAISE EXCEPTION 'Tenant shared beta activation transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

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

  IF OLD."status" =
       'HOLD'::public."IdentityMailOutboxStatus"
     AND NEW."status" =
       'PENDING'::public."IdentityMailOutboxStatus"
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
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
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
             AND command."createdTransactionId" =
               pg_catalog.pg_current_xact_id()::TEXT
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
         AND NEW."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_MARKED'
         AND OLD."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND NEW."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."providerAttemptKey" IS NOT NULL
       )
       OR (
         event_type IN ('PRE_PROVIDER_RETRY', 'REAP_RETRY')
         AND OLD."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" =
           'RETRY'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('PRE_PROVIDER_DEAD', 'REAP_DEAD')
         AND OLD."status" IN (
           'RETRY'::public."IdentityMailOutboxStatus",
           'CLAIMED'::public."IdentityMailOutboxStatus"
         )
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" =
           'DEAD'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('CANCELED', 'REAP_CANCELED')
         AND OLD."status" IN (
           'PENDING'::public."IdentityMailOutboxStatus",
           'RETRY'::public."IdentityMailOutboxStatus",
           'CLAIMED'::public."IdentityMailOutboxStatus"
         )
         AND OLD."providerAttemptKey" IS NULL
         AND NEW."status" =
           'CANCELED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_ACCEPTED'
         AND OLD."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" =
           'SENT'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'PROVIDER_DEFINITIVE_NOT_SENT'
         AND OLD."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" =
           'DEAD'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type IN ('PROVIDER_AMBIGUOUS', 'REAP_AMBIGUOUS')
         AND OLD."status" =
           'CLAIMED'::public."IdentityMailOutboxStatus"
         AND OLD."providerAttemptKey" IS NOT NULL
         AND NEW."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_SENT'
         AND OLD."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" =
           'SENT'::public."IdentityMailOutboxStatus"
       )
       OR (
         event_type = 'RECONCILED_DEAD'
         AND OLD."status" =
           'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
         AND NEW."status" =
           'DEAD'::public."IdentityMailOutboxStatus"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity mail delivery transition is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public."founder_operator_beta_tenant_activate_v2"(
  candidate_activation_command_id TEXT,
  expected_go_id TEXT,
  expected_tenant_id TEXT,
  activation_request_id TEXT,
  activation_request_digest TEXT,
  expected_release_sha TEXT,
  expected_environment TEXT,
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
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  tenant_id TEXT;
  go_id TEXT;
  request_id TEXT;
  request_digest TEXT;
  release_sha TEXT;
  environment_name TEXT;
  actor_id TEXT;
  dormant_request_id TEXT;
  dormant_request_digest TEXT;
  activation_command_id TEXT;
  transaction_id TEXT;
  secret_ciphertext_digest TEXT;
  activated_at TIMESTAMP(3) WITH TIME ZONE;
  trial_ends_at TIMESTAMP(3) WITH TIME ZONE;
  valid_actor_count INTEGER;
  shell_context JSONB;
  repeated_shell_context JSONB;
  issue_receipt JSONB;
  activation_receipt JSONB;
  go_record public."FounderOperatorBetaGo"%ROWTYPE;
  tenant_record public."Tenant"%ROWTYPE;
  issue_record public."IdentityOwnerInviteIssueCommand"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  activation_record public."FounderOperatorBetaActivationCommand"%ROWTYPE;
  audit_record public."PlatformAdminAuditEvent"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  go_id := pg_catalog.lower(
    pg_catalog.btrim(expected_go_id) COLLATE "C"
  );
  request_id := pg_catalog.lower(
    pg_catalog.btrim(activation_request_id) COLLATE "C"
  );
  request_digest := pg_catalog.btrim(activation_request_digest);
  release_sha := pg_catalog.lower(
    pg_catalog.btrim(expected_release_sha) COLLATE "C"
  );
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(expected_environment) COLLATE "C"
  );
  actor_id := pg_catalog.lower(
    pg_catalog.btrim(activated_by_user_id) COLLATE "C"
  );
  dormant_request_id := pg_catalog.lower(
    pg_catalog.btrim(issue_request_id) COLLATE "C"
  );
  dormant_request_digest := pg_catalog.btrim(issue_request_digest);

  IF tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR tenant_id !~ uuid_pattern
     OR go_id IS NULL
     OR expected_go_id IS DISTINCT FROM go_id
     OR go_id !~ uuid_pattern
     OR request_id IS NULL
     OR activation_request_id IS DISTINCT FROM request_id
     OR request_id !~ uuid_pattern
     OR request_digest IS NULL
     OR activation_request_digest IS DISTINCT FROM request_digest
     OR request_digest !~ '^[0-9a-f]{64}$'
     OR release_sha IS NULL
     OR expected_release_sha IS DISTINCT FROM release_sha
     OR release_sha !~ '^[0-9a-f]{40}$'
     OR environment_name IS NULL
     OR expected_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR actor_id IS NULL
     OR activated_by_user_id IS DISTINCT FROM actor_id
     OR actor_id !~ uuid_pattern
     OR dormant_request_id IS NULL
     OR issue_request_id IS DISTINCT FROM dormant_request_id
     OR dormant_request_id !~ uuid_pattern
     OR dormant_request_digest IS NULL
     OR issue_request_digest IS DISTINCT FROM dormant_request_digest
     OR dormant_request_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Founder beta activation authority is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'founder-operator-beta-go:' || tenant_id,
      0
    )
  );

  SELECT command.*
  INTO activation_record
  FROM public."FounderOperatorBetaActivationCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."action" = 'ACTIVATE_AND_RELEASE_OWNER_INVITE'
    AND command."requestId" = request_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT command.*
    INTO issue_record
    FROM public."IdentityOwnerInviteIssueCommand" AS command
    WHERE command."id" = activation_record."issueCommandId"
      AND command."tenantId" = tenant_id
    FOR SHARE;

    SELECT invite.*
    INTO invite_record
    FROM public."UserInvite" AS invite
    WHERE invite."id" = activation_record."inviteId"
      AND invite."tenantId" = tenant_id
    FOR SHARE;

    SELECT outbox.*
    INTO outbox_record
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."id" = activation_record."outboxId"
      AND outbox."tenantId" = tenant_id
    FOR SHARE;

    SELECT tenant.*
    INTO tenant_record
    FROM public."Tenant" AS tenant
    WHERE tenant."id" = tenant_id
    FOR SHARE;

    SELECT go_authority.*
    INTO go_record
    FROM public."FounderOperatorBetaGo" AS go_authority
    WHERE go_authority."id" = activation_record."goId"
      AND go_authority."tenantId" = tenant_id
    FOR SHARE;

    SELECT audit.*
    INTO audit_record
    FROM public."PlatformAdminAuditEvent" AS audit
    WHERE audit."id" = activation_record."id";

    IF activation_record."goId" IS DISTINCT FROM go_id
       OR activation_record."requestDigest" IS DISTINCT FROM request_digest
       OR activation_record."releaseSha" IS DISTINCT FROM release_sha
       OR activation_record."environment" IS DISTINCT FROM environment_name
       OR activation_record."activatedByUserId" IS DISTINCT FROM actor_id
       OR activation_record."issueRequestId" IS DISTINCT FROM
         dormant_request_id
       OR activation_record."issueRequestDigest" IS DISTINCT FROM
         dormant_request_digest
    THEN
      RAISE EXCEPTION 'Founder beta activation replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    IF issue_record."id" IS NULL
       OR invite_record."id" IS NULL
       OR outbox_record."id" IS NULL
       OR tenant_record."id" IS NULL
       OR go_record."id" IS NULL
       OR audit_record."id" IS NULL
       OR tenant_record."status" IS DISTINCT FROM
         'ACTIVE'::public."TenantLifecycleStatus"
       OR tenant_record."onboardingStatus" IS DISTINCT FROM
         'OWNER_INVITED'::public."TenantOnboardingStatus"
       OR tenant_record."trialStartsAt" IS DISTINCT FROM
         activation_record."trialStartsAt"
       OR tenant_record."trialEndsAt" IS DISTINCT FROM
         activation_record."trialEndsAt"
       OR tenant_record."executionRevision" IS DISTINCT FROM
         activation_record."executionRevisionAfter"
       OR go_record."stateRevision" <> 2
       OR go_record."consumedAt" IS DISTINCT FROM
         activation_record."activatedAt"
       OR issue_record."id" IS DISTINCT FROM
         activation_record."issueCommandId"
       OR issue_record."requestId" IS DISTINCT FROM
         activation_record."issueRequestId"
       OR issue_record."issueRequestDigest" IS DISTINCT FROM
         activation_record."issueRequestDigest"
       OR invite_record."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
       OR invite_record."accessScope" IS DISTINCT FROM
         'NETWORK'::public."UserAccessScope"
       OR outbox_record."status" IS DISTINCT FROM
         'PENDING'::public."IdentityMailOutboxStatus"
       OR outbox_record."releasedAt" IS DISTINCT FROM
         activation_record."activatedAt"
       OR outbox_record."transitionRevision" <> 1
       OR audit_record."tenantId" IS DISTINCT FROM tenant_id
       OR audit_record."actorUserId" IS DISTINCT FROM actor_id
       OR audit_record."requestId" IS DISTINCT FROM request_id
       OR audit_record."action" IS DISTINCT FROM
         'FOUNDER_OPERATOR_BETA_TENANT_ACTIVATED'
       OR audit_record."targetType" IS DISTINCT FROM 'TENANT'
       OR audit_record."targetId" IS DISTINCT FROM tenant_id
       OR audit_record."reason" IS NOT NULL
       OR audit_record."after" IS DISTINCT FROM activation_record."receipt"
    THEN
      RAISE EXCEPTION 'Founder beta activation replay is incomplete'
        USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_set(
      activation_record."receipt",
      '{decision}',
      '"REPLAYED"'::JSONB,
      false
    );
  END IF;

  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Founder beta activation requires SERIALIZABLE'
      USING ERRCODE = '25001';
  END IF;

  activation_command_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_activation_command_id) COLLATE "C"
  );
  IF activation_command_id IS NULL
     OR candidate_activation_command_id IS DISTINCT FROM activation_command_id
     OR activation_command_id !~ uuid_pattern
  THEN
    RAISE EXCEPTION 'Founder beta activation candidate is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT go_authority.*
  INTO go_record
  FROM public."FounderOperatorBetaGo" AS go_authority
  WHERE go_authority."id" = go_id
    AND go_authority."tenantId" = tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR go_record."contractVersion" <> 'FOUNDER_OPERATOR_BETA_GO_V1'
     OR go_record."decision" <> 'GO'
     OR go_record."stateRevision" <> 1
     OR go_record."revokedAt" IS NOT NULL
     OR go_record."consumedAt" IS NOT NULL
     OR go_record."validUntil" <= pg_catalog.clock_timestamp()
     OR go_record."releaseSha" IS DISTINCT FROM release_sha
     OR go_record."environment" IS DISTINCT FROM environment_name
     OR go_record."approvedByUserId" IS DISTINCT FROM actor_id
     OR go_record."rollbackOwnerUserId" IS DISTINCT FROM actor_id
     OR NOT go_record."singleFounderRiskAccepted"
     OR go_record."trialPolicyVersion" <>
       'FOUNDER_OPERATOR_BETA_TRIAL_V1'
     OR go_record."trialDurationSeconds" <> 2592000
  THEN
    RAISE EXCEPTION 'Founder beta GO is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO valid_actor_count
  FROM public."User" AS actor
  WHERE actor."id" = actor_id
    AND actor."isActive"
    AND actor."isPlatformAdmin";

  IF valid_actor_count <> 1 THEN
    RAISE EXCEPTION 'Founder beta activation actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  shell_context :=
    public."shared_beta_tenant_actual_shell_v1"(tenant_id);

  IF go_record."workflowLocator" IS DISTINCT FROM
       shell_context ->> 'workflowLocator'
     OR go_record."reservationSubjectId" IS DISTINCT FROM
       shell_context ->> 'reservationSubjectId'
     OR go_record."expectedClaimRevision" IS DISTINCT FROM
       (shell_context ->> 'reservationClaimRevision')::INTEGER
     OR go_record."expectedEntitlementProfileRevision" IS DISTINCT FROM
       (shell_context ->> 'entitlementProfileRevision')::INTEGER
     OR go_record."expectedExecutionRevision" IS DISTINCT FROM
       (shell_context ->> 'executionRevision')::INTEGER
     OR shell_context ->> 'actualShellDigest' IS NULL
     OR (shell_context ->> 'actualShellDigest') COLLATE "C" !~
       '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Founder beta GO does not match actual tenant shell'
      USING ERRCODE = '23514';
  END IF;

  issue_receipt := public."identity_owner_invite_issue_hold_v1"(
    go_record."workflowLocator",
    tenant_id,
    go_record."reservationSubjectId",
    go_record."expectedClaimRevision",
    dormant_request_id,
    dormant_request_digest,
    environment_name,
    candidate_issue_command_id,
    candidate_invite_id,
    candidate_outbox_id,
    candidate_message_key,
    candidate_token_hash,
    candidate_secret_ciphertext,
    candidate_invite_expires_at
  );

  SELECT command.*
  INTO issue_record
  FROM public."IdentityOwnerInviteIssueCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."action" = 'ISSUE_INITIAL_OWNER_INVITE'
    AND command."requestId" = dormant_request_id
  FOR SHARE;

  SELECT invite.*
  INTO invite_record
  FROM public."UserInvite" AS invite
  WHERE invite."tenantId" = tenant_id
    AND invite."id" = issue_record."inviteId"
  FOR UPDATE;

  SELECT outbox.*
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS outbox
  WHERE outbox."tenantId" = tenant_id
    AND outbox."id" = issue_record."outboxId"
  FOR UPDATE;

  repeated_shell_context :=
    public."shared_beta_tenant_actual_shell_v1"(tenant_id);

  IF shell_context ->> 'actualShellDigest' IS DISTINCT FROM
       repeated_shell_context ->> 'actualShellDigest'
     OR issue_record."id" IS NULL
     OR invite_record."id" IS NULL
     OR outbox_record."id" IS NULL
     OR issue_record."workflowLocator" IS DISTINCT FROM
       go_record."workflowLocator"
     OR issue_record."reservationSubjectId" IS DISTINCT FROM
       go_record."reservationSubjectId"
     OR issue_record."reservationClaimRevision" IS DISTINCT FROM
       go_record."expectedClaimRevision"
     OR issue_record."issueRequestDigest" IS DISTINCT FROM
       dormant_request_digest
     OR invite_record."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
     OR invite_record."accessScope" IS DISTINCT FROM
       'NETWORK'::public."UserAccessScope"
     OR outbox_record."status" IS DISTINCT FROM
       'HOLD'::public."IdentityMailOutboxStatus"
     OR outbox_record."releasedAt" IS NOT NULL
     OR issue_receipt ->> 'commandId' IS DISTINCT FROM issue_record."id"
  THEN
    RAISE EXCEPTION 'Founder beta activation aggregate changed during issue'
      USING ERRCODE = '40001';
  END IF;

  SELECT tenant.*
  INTO tenant_record
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR NO KEY UPDATE;

  activated_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  trial_ends_at := activated_at + INTERVAL '30 days';

  IF go_record."validUntil" <= activated_at
     OR outbox_record."expiresAt" <= activated_at
     OR outbox_record."expiresAt" > trial_ends_at
  THEN
    RAISE EXCEPTION 'Founder beta activation window is invalid'
      USING ERRCODE = '23514';
  END IF;

  transaction_id := pg_catalog.pg_current_xact_id()::TEXT;
  secret_ciphertext_digest := pg_catalog.encode(
    pg_catalog.sha256(outbox_record."secretCiphertext"),
    'hex'
  );
  activation_receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'ACTIVATE_AND_RELEASE_OWNER_INVITE',
    'decision', 'ACTIVATED',
    'tenantId', tenant_id,
    'activationCommandId', activation_command_id,
    'goId', go_record."id",
    'releaseSha', release_sha,
    'environment', environment_name,
    'tenantStatus', 'ACTIVE',
    'onboardingStatus', 'OWNER_INVITED',
    'executionRevision', tenant_record."executionRevision" + 1,
    'trialStartsAtEpochMs',
      (EXTRACT(EPOCH FROM activated_at) * 1000)::BIGINT,
    'trialEndsAtEpochMs',
      (EXTRACT(EPOCH FROM trial_ends_at) * 1000)::BIGINT,
    'inviteId', issue_record."inviteId",
    'outboxId', issue_record."outboxId",
    'outboxStatus', 'PENDING',
    'createdTransactionId', transaction_id
  );

  INSERT INTO public."FounderOperatorBetaActivationCommand" (
    "id", "tenantId", "requestId", "requestDigest", "goId",
    "releaseSha", "environment", "shellEvidenceDigest",
    "actualShellDigest", "reservationSubjectId",
    "reservationClaimRevision", "issueRequestId", "issueRequestDigest",
    "issueCommandId", "inviteId", "outboxId", "messageKey",
    "tokenHash", "secretCiphertextDigest", "workflowLocator",
    "activatedByUserId", "entitlementProfileRevision",
    "executionRevisionBefore", "executionRevisionAfter",
    "trialPolicyVersion", "trialDurationSeconds", "trialStartsAt",
    "trialEndsAt", "receipt", "createdTransactionId", "activatedAt"
  ) VALUES (
    activation_command_id, tenant_id, request_id, request_digest,
    go_record."id", release_sha, environment_name,
    go_record."shellEvidenceDigest", shell_context ->> 'actualShellDigest',
    go_record."reservationSubjectId", go_record."expectedClaimRevision",
    dormant_request_id, dormant_request_digest, issue_record."id",
    issue_record."inviteId", issue_record."outboxId",
    issue_record."messageKey", issue_record."tokenHash",
    secret_ciphertext_digest, go_record."workflowLocator", actor_id,
    tenant_record."entitlementProfileRevision",
    tenant_record."executionRevision", tenant_record."executionRevision" + 1,
    go_record."trialPolicyVersion", go_record."trialDurationSeconds",
    activated_at, trial_ends_at, activation_receipt, transaction_id,
    activated_at
  )
  RETURNING * INTO activation_record;

  UPDATE public."Tenant"
  SET
    "status" = 'ACTIVE'::public."TenantLifecycleStatus",
    "onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus",
    "trialStartsAt" = activated_at,
    "trialEndsAt" = trial_ends_at,
    "executionRevision" = tenant_record."executionRevision" + 1,
    "statusChangedAt" = activated_at AT TIME ZONE 'UTC',
    "statusReason" = 'Founder beta activation ' || activation_command_id,
    "updatedAt" = activated_at AT TIME ZONE 'UTC'
  WHERE "id" = tenant_id
    AND "status" = 'SUSPENDED'::public."TenantLifecycleStatus"
    AND "customerStage" = 'PILOT'::public."TenantCustomerStage"
    AND "onboardingStatus" =
      'PROVISIONING'::public."TenantOnboardingStatus"
    AND "trialStartsAt" IS NULL
    AND "trialEndsAt" IS NULL
    AND "entitlementProfileRevision" =
      go_record."expectedEntitlementProfileRevision"
    AND "executionRevision" = go_record."expectedExecutionRevision"
  RETURNING * INTO tenant_record;

  IF NOT FOUND
     OR tenant_record."executionRevision" IS DISTINCT FROM
       activation_record."executionRevisionAfter"
  THEN
    RAISE EXCEPTION 'Founder beta tenant activation CAS failed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."FounderOperatorBetaGo"
  SET
    "stateRevision" = 2,
    "consumedAt" = activated_at
  WHERE "id" = go_record."id"
    AND "tenantId" = tenant_id
    AND "stateRevision" = 1
    AND "revokedAt" IS NULL
    AND "consumedAt" IS NULL
    AND "validUntil" > activated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Founder beta GO consumption CAS failed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public."IdentityMailOutbox"
  SET
    "status" = 'PENDING'::public."IdentityMailOutboxStatus",
    "releasedAt" = activated_at
  WHERE "id" = outbox_record."id"
    AND "tenantId" = tenant_id
    AND "issueCommandId" = issue_record."id"
    AND "status" = 'HOLD'::public."IdentityMailOutboxStatus"
    AND "releasedAt" IS NULL
    AND "expiresAt" > activated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Founder beta owner invite release CAS failed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public."PlatformAdminAuditEvent" (
    "id", "tenantId", "actorUserId", "requestId", "action",
    "targetType", "targetId", "reason", "before", "after",
    "metadata", "createdAt"
  ) VALUES (
    activation_record."id", tenant_id, actor_id, request_id,
    'FOUNDER_OPERATOR_BETA_TENANT_ACTIVATED', 'TENANT', tenant_id, NULL,
    pg_catalog.jsonb_build_object(
      'status', 'SUSPENDED',
      'onboardingStatus', 'PROVISIONING',
      'executionRevision', activation_record."executionRevisionBefore"
    ),
    activation_receipt,
    pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'authority', 'FounderOperatorBetaActivationCommand',
      'activationCommandId', activation_record."id",
      'goId', activation_record."goId",
      'releaseSha', activation_record."releaseSha",
      'environment', activation_record."environment",
      'shellEvidenceDigest', activation_record."shellEvidenceDigest",
      'actualShellDigest', activation_record."actualShellDigest",
      'createdTransactionId', activation_record."createdTransactionId"
    ),
    activated_at AT TIME ZONE 'UTC'
  );

  RETURN activation_receipt;
END;
$$;

CREATE FUNCTION public."founder_operator_beta_activation_audit_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."action" = 'FOUNDER_OPERATOR_BETA_TENANT_ACTIVATED'
     OR (
       TG_OP = 'UPDATE'
       AND NEW."action" = 'FOUNDER_OPERATOR_BETA_TENANT_ACTIVATED'
     )
  THEN
    RAISE EXCEPTION 'Founder beta activation audit is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "PlatformAdminAuditEvent_founder_beta_activation_guard_trigger"
BEFORE UPDATE OR DELETE ON public."PlatformAdminAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION public."founder_operator_beta_activation_audit_guard_v2"();

REVOKE ALL ON TABLE public."FounderOperatorBetaActivationCommand" FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."founder_operator_beta_tenant_activate_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."founder_operator_beta_activation_immutable_v2"()
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."founder_operator_beta_activation_audit_guard_v2"()
FROM PUBLIC;

COMMENT ON TABLE public."FounderOperatorBetaActivationCommand" IS
  'Immutable PII-free authority for one atomic single-founder beta tenant activation and mailbox-bound owner invite release.';
COMMENT ON FUNCTION
  public."founder_operator_beta_tenant_activate_v2"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, BYTEA, TIMESTAMP(3) WITH TIME ZONE
  )
IS 'SERIALIZABLE atomic GO consume, tenant trial activation, initial OWNER issue and exact HOLD-to-PENDING release. Execute-only grant is intentionally deferred to runtime enrollment.';
