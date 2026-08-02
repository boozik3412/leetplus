BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Dormant encrypted transport boundary for one initial NETWORK OWNER invite.
-- This migration intentionally grants no runtime role, sends no mail, and
-- permits only HOLD outbox rows. A later admitted migration must add delivery
-- states and replace the immutable outbox guard before a worker can run.
CREATE TYPE public."IdentityMailTemplate" AS ENUM (
  'INITIAL_OWNER_INVITE'
);

CREATE TYPE public."IdentityMailOutboxStatus" AS ENUM (
  'HOLD'
);

-- The redundant composite key is deliberate: every new provenance relation
-- includes tenantId so a mismatched-tenant invite cannot be linked.
CREATE UNIQUE INDEX "UserInvite_tenantId_id_key"
  ON public."UserInvite" ("tenantId", "id");

CREATE TABLE public."IdentityOwnerInviteIssueCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL DEFAULT 'ISSUE_INITIAL_OWNER_INVITE',
  "requestId" TEXT NOT NULL,
  "issueRequestDigest" VARCHAR(64) NOT NULL,
  "aadEnvironment" VARCHAR(64) NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "reservationClaimRevision" INTEGER NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "tokenDigestVersion" VARCHAR(16) NOT NULL DEFAULT 'sha256-v1',
  "template" public."IdentityMailTemplate" NOT NULL
    DEFAULT 'INITIAL_OWNER_INVITE',
  "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
  "keyVersion" VARCHAR(16) NOT NULL DEFAULT 'v1',
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "claimRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IdentityOwnerInviteIssueCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_tenant_check" CHECK (
    "tenantId" = pg_catalog.lower(
      pg_catalog.btrim("tenantId") COLLATE "C"
    )
    AND ("tenantId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_action_check" CHECK (
    "action" = 'ISSUE_INITIAL_OWNER_INVITE'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_request_id_check" CHECK (
    "requestId" = pg_catalog.lower(
      pg_catalog.btrim("requestId") COLLATE "C"
    )
    AND ("requestId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_digest_check" CHECK (
    ("issueRequestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_aad_env_check" CHECK (
    "aadEnvironment" =
      pg_catalog.lower(pg_catalog.btrim("aadEnvironment") COLLATE "C")
    AND ("aadEnvironment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_locator_check" CHECK (
    "workflowLocator" = pg_catalog.lower(
      pg_catalog.btrim("workflowLocator") COLLATE "C"
    )
    AND ("workflowLocator" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_subject_check" CHECK (
    "reservationSubjectId" = pg_catalog.lower(
      pg_catalog.btrim("reservationSubjectId") COLLATE "C"
    )
    AND ("reservationSubjectId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_invite_id_check" CHECK (
    "inviteId" = pg_catalog.lower(
      pg_catalog.btrim("inviteId") COLLATE "C"
    )
    AND ("inviteId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_outbox_id_check" CHECK (
    "outboxId" = pg_catalog.lower(
      pg_catalog.btrim("outboxId") COLLATE "C"
    )
    AND ("outboxId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_message_key_check" CHECK (
    "messageKey" = pg_catalog.lower(
      pg_catalog.btrim("messageKey") COLLATE "C"
    )
    AND ("messageKey" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_token_hash_check" CHECK (
    ("tokenHash" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_crypto_check" CHECK (
    "tokenDigestVersion" = 'sha256-v1'
    AND "template" =
      'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"
    AND "envelopeVersion" = 1
    AND "keyVersion" = 'v1'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_revision_check" CHECK (
    "reservationClaimRevision" >= 1
    AND "claimRevision" = "reservationClaimRevision" + 1
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_expiry_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '30 days'
  ),
  CONSTRAINT "IdentityOwnerInviteIssueCommand_ids_distinct_check" CHECK (
    "id" <> "reservationSubjectId"
    AND "id" <> "inviteId"
    AND "id" <> "outboxId"
    AND "reservationSubjectId" <> "inviteId"
    AND "inviteId" <> "outboxId"
  )
);

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_tenant_id_key"
  ON public."IdentityOwnerInviteIssueCommand" ("tenantId", "id");

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_request_uidx"
  ON public."IdentityOwnerInviteIssueCommand" (
    "tenantId",
    "action",
    "requestId"
  );

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_invite_uidx"
  ON public."IdentityOwnerInviteIssueCommand" ("tenantId", "inviteId");

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_outbox_uidx"
  ON public."IdentityOwnerInviteIssueCommand" ("tenantId", "outboxId");

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_message_key"
  ON public."IdentityOwnerInviteIssueCommand" ("messageKey");

CREATE UNIQUE INDEX "identity_owner_invite_issue_command_locator_uidx"
  ON public."IdentityOwnerInviteIssueCommand" (
    "tenantId",
    "workflowLocator"
  );

CREATE TABLE public."IdentityMailOutbox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issueCommandId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "aadEnvironment" VARCHAR(64) NOT NULL,
  "template" public."IdentityMailTemplate" NOT NULL
    DEFAULT 'INITIAL_OWNER_INVITE',
  "status" public."IdentityMailOutboxStatus" NOT NULL DEFAULT 'HOLD',
  "messageKey" TEXT NOT NULL,
  "issueRequestDigest" VARCHAR(64) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "tokenDigestVersion" VARCHAR(16) NOT NULL DEFAULT 'sha256-v1',
  "secretCiphertext" BYTEA NOT NULL,
  "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
  "keyVersion" VARCHAR(16) NOT NULL DEFAULT 'v1',
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IdentityMailOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityMailOutbox_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_tenant_check" CHECK (
    "tenantId" = pg_catalog.lower(
      pg_catalog.btrim("tenantId") COLLATE "C"
    )
    AND ("tenantId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_command_id_check" CHECK (
    "issueCommandId" = pg_catalog.lower(
      pg_catalog.btrim("issueCommandId") COLLATE "C"
    )
    AND ("issueCommandId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_invite_id_check" CHECK (
    "inviteId" = pg_catalog.lower(
      pg_catalog.btrim("inviteId") COLLATE "C"
    )
    AND ("inviteId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_locator_check" CHECK (
    "workflowLocator" = pg_catalog.lower(
      pg_catalog.btrim("workflowLocator") COLLATE "C"
    )
    AND ("workflowLocator" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_aad_env_check" CHECK (
    "aadEnvironment" =
      pg_catalog.lower(pg_catalog.btrim("aadEnvironment") COLLATE "C")
    AND ("aadEnvironment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT "IdentityMailOutbox_message_key_check" CHECK (
    "messageKey" = pg_catalog.lower(
      pg_catalog.btrim("messageKey") COLLATE "C"
    )
    AND ("messageKey" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "IdentityMailOutbox_request_digest_check" CHECK (
    ("issueRequestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityMailOutbox_token_hash_check" CHECK (
    ("tokenHash" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityMailOutbox_crypto_check" CHECK (
    "tokenDigestVersion" = 'sha256-v1'
    AND "template" =
      'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"
    AND "status" = 'HOLD'::public."IdentityMailOutboxStatus"
    AND "envelopeVersion" = 1
    AND "keyVersion" = 'v1'
    AND pg_catalog.octet_length("secretCiphertext") = 71
  ),
  CONSTRAINT "IdentityMailOutbox_expiry_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '30 days'
  )
);

CREATE UNIQUE INDEX "identity_mail_outbox_tenant_id_key"
  ON public."IdentityMailOutbox" ("tenantId", "id");

CREATE UNIQUE INDEX "identity_mail_outbox_issue_command_uidx"
  ON public."IdentityMailOutbox" ("tenantId", "issueCommandId");

CREATE UNIQUE INDEX "identity_mail_outbox_invite_uidx"
  ON public."IdentityMailOutbox" ("tenantId", "inviteId");

CREATE UNIQUE INDEX "identity_mail_outbox_locator_uidx"
  ON public."IdentityMailOutbox" ("tenantId", "workflowLocator");

CREATE UNIQUE INDEX "identity_mail_outbox_message_key"
  ON public."IdentityMailOutbox" ("messageKey");

CREATE INDEX "identity_mail_outbox_tenant_status_created_idx"
  ON public."IdentityMailOutbox" ("tenantId", "status", "createdAt");

ALTER TABLE public."IdentityOwnerInviteIssueCommand"
  ADD CONSTRAINT "IdentityOwnerInviteIssueCommand_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityOwnerInviteIssueCommand_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailOutbox"
  ADD CONSTRAINT "IdentityMailOutbox_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityMailOutbox_issueCommand_fkey"
  FOREIGN KEY ("tenantId", "issueCommandId")
  REFERENCES public."IdentityOwnerInviteIssueCommand" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityMailOutbox_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

CREATE FUNCTION public."identity_owner_invite_issue_command_immutable_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Initial owner invite issue command is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityOwnerInviteIssueCommand_immutable_trigger"
BEFORE UPDATE OR DELETE ON public."IdentityOwnerInviteIssueCommand"
FOR EACH ROW
EXECUTE FUNCTION
  public."identity_owner_invite_issue_command_immutable_v1"();

CREATE FUNCTION public."identity_mail_outbox_hold_immutable_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Dormant identity mail HOLD outbox is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailOutbox_hold_immutable_trigger"
BEFORE UPDATE OR DELETE ON public."IdentityMailOutbox"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_outbox_hold_immutable_v1"();

-- Lock order:
--   request advisory namespace
--   -> command replay lookup
--   -> locator discovery without a row lock
--   -> canonical email advisory namespace
--   -> exact IdentityEmailClaim FOR UPDATE/recheck
--   -> invite / command / outbox / claim / audit writes.
-- No Tenant row is selected or explicitly locked.
CREATE FUNCTION public."identity_owner_invite_issue_hold_v1"(
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
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  fixed_action CONSTANT TEXT := 'ISSUE_INITIAL_OWNER_INVITE';
  workflow_locator TEXT;
  tenant_id TEXT;
  reservation_subject_id TEXT;
  request_id TEXT;
  request_digest TEXT;
  aad_environment TEXT;
  command_id TEXT;
  invite_id TEXT;
  outbox_id TEXT;
  message_key TEXT;
  token_hash TEXT;
  canonical_email TEXT;
  locked_canonical_email TEXT;
  issued_at TIMESTAMP(3) WITH TIME ZONE;
  command_found BOOLEAN;
  receipt JSONB;
  command_record public."IdentityOwnerInviteIssueCommand"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  audit_record public."PlatformAdminAuditEvent"%ROWTYPE;
BEGIN
  workflow_locator := pg_catalog.lower(
    pg_catalog.btrim(requested_workflow_locator) COLLATE "C"
  );
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  reservation_subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_reservation_subject_id) COLLATE "C"
  );
  request_id := pg_catalog.lower(
    pg_catalog.btrim(issue_request_id) COLLATE "C"
  );
  request_digest := pg_catalog.btrim(issue_request_digest);
  aad_environment := pg_catalog.lower(
    pg_catalog.btrim(requested_aad_environment) COLLATE "C"
  );

  IF workflow_locator IS NULL
     OR workflow_locator !~ uuid_pattern
     OR requested_workflow_locator IS DISTINCT FROM workflow_locator
     OR tenant_id IS NULL
     OR tenant_id !~ uuid_pattern
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR reservation_subject_id IS NULL
     OR reservation_subject_id !~ uuid_pattern
     OR expected_reservation_subject_id IS DISTINCT FROM
       reservation_subject_id
     OR expected_claim_revision IS NULL
     OR expected_claim_revision NOT BETWEEN 1 AND 2147483646
     OR request_id IS NULL
     OR request_id !~ uuid_pattern
     OR issue_request_id IS DISTINCT FROM request_id
     OR request_digest IS NULL
     OR issue_request_digest IS DISTINCT FROM request_digest
     OR request_digest !~ '^[0-9a-f]{64}$'
     OR aad_environment IS NULL
     OR requested_aad_environment IS DISTINCT FROM aad_environment
     OR aad_environment !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  THEN
    RAISE EXCEPTION 'Initial owner invite authority input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-owner-invite-issue:v1:' || tenant_id || ':' || request_id,
      171
    )
  );

  SELECT command.*
  INTO command_record
  FROM public."IdentityOwnerInviteIssueCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."action" = fixed_action
    AND command."requestId" = request_id;

  command_found := FOUND;

  IF command_found AND (
    command_record."issueRequestDigest" IS DISTINCT FROM request_digest
    OR command_record."aadEnvironment" IS DISTINCT FROM aad_environment
    OR command_record."workflowLocator" IS DISTINCT FROM workflow_locator
    OR command_record."reservationSubjectId" IS DISTINCT FROM
      reservation_subject_id
    OR command_record."reservationClaimRevision" IS DISTINCT FROM
      expected_claim_revision
  ) THEN
    RAISE EXCEPTION 'Initial owner invite request conflicts with authority'
      USING ERRCODE = '23514';
  END IF;

  -- Replay resolves the progressed INVITE claim. It does not repeat the
  -- original reservation assertion and does not inspect fresh candidates.
  IF command_found THEN
    SELECT claim."emailCanonical"
    INTO canonical_email
    FROM public."IdentityEmailClaim" AS claim
    WHERE claim."workflowLocator" = command_record."workflowLocator"
      AND claim."tenantId" = command_record."tenantId"
      AND claim."claimType" =
        'INVITE'::public."IdentityEmailClaimType"
      AND claim."subjectId" = command_record."inviteId"
      AND claim."revision" = command_record."claimRevision";
  ELSE
    SELECT claim."emailCanonical"
    INTO canonical_email
    FROM public."IdentityEmailClaim" AS claim
    WHERE claim."workflowLocator" = workflow_locator
      AND claim."tenantId" = tenant_id
      AND claim."claimType" =
        'INVITE'::public."IdentityEmailClaimType"
      AND claim."subjectId" = reservation_subject_id
      AND claim."revision" = expected_claim_revision;
  END IF;

  IF NOT FOUND THEN
    IF command_found THEN
      RAISE EXCEPTION 'Initial owner invite replay aggregate is incomplete'
        USING ERRCODE = '23514';
    END IF;

    RAISE EXCEPTION 'Initial owner invite reservation was not found'
      USING ERRCODE = '23503';
  END IF;

  locked_canonical_email :=
    public."identity_email_claim_lock_v1"(canonical_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = locked_canonical_email
    AND claim."workflowLocator" = workflow_locator
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initial owner invite claim changed before issue'
      USING ERRCODE = '23514';
  END IF;

  IF command_found THEN
    IF claim_record."tenantId" IS DISTINCT FROM tenant_id
       OR claim_record."claimType" IS DISTINCT FROM
         'INVITE'::public."IdentityEmailClaimType"
       OR claim_record."subjectId" IS DISTINCT FROM
         command_record."inviteId"
       OR claim_record."revision" IS DISTINCT FROM
         command_record."claimRevision"
    THEN
      RAISE EXCEPTION 'Initial owner invite replay claim does not match'
        USING ERRCODE = '23514';
    END IF;

    SELECT invite.*
    INTO invite_record
    FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = command_record."tenantId"
      AND invite."id" = command_record."inviteId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Initial owner invite replay invite is missing'
        USING ERRCODE = '23514';
    END IF;

    SELECT outbox.*
    INTO outbox_record
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = command_record."tenantId"
      AND outbox."id" = command_record."outboxId"
      AND outbox."issueCommandId" = command_record."id";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Initial owner invite replay outbox is missing'
        USING ERRCODE = '23514';
    END IF;

    receipt := pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'ISSUE_DORMANT_OWNER_INVITE',
      'decision', 'CREATED',
      'tenantId', command_record."tenantId",
      'commandId', command_record."id",
      'inviteId', command_record."inviteId",
      'outboxId', command_record."outboxId",
      'claimType', 'INVITE',
      'claimRevision', command_record."claimRevision",
      'role', 'OWNER',
      'accessScope', 'NETWORK',
      'outboxStatus', 'HOLD'
    );

    SELECT audit.*
    INTO audit_record
    FROM public."PlatformAdminAuditEvent" AS audit
    WHERE audit."id" = command_record."id";

    IF NOT FOUND
       OR invite_record."email" IS DISTINCT FROM locked_canonical_email
       OR invite_record."fullName" IS NOT NULL
       OR invite_record."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
       OR invite_record."accessScope" IS DISTINCT FROM
         'NETWORK'::public."UserAccessScope"
       OR invite_record."customRoleId" IS NOT NULL
       OR pg_catalog.cardinality(invite_record."storeIds") <> 0
       OR invite_record."tokenHash" IS DISTINCT FROM
         command_record."tokenHash"
       OR invite_record."expiresAt" IS DISTINCT FROM
         command_record."expiresAt" AT TIME ZONE 'UTC'
       OR invite_record."acceptedAt" IS NOT NULL
       OR invite_record."acceptedByUserId" IS NOT NULL
       OR invite_record."createdByUserId" IS NOT NULL
       OR invite_record."revokedAt" IS NOT NULL
       OR invite_record."revokedByUserId" IS NOT NULL
       OR invite_record."identityClaimRevision" IS DISTINCT FROM
         command_record."claimRevision"
       OR outbox_record."inviteId" IS DISTINCT FROM
         command_record."inviteId"
       OR outbox_record."workflowLocator" IS DISTINCT FROM
         command_record."workflowLocator"
       OR outbox_record."aadEnvironment" IS DISTINCT FROM
         command_record."aadEnvironment"
       OR outbox_record."template" IS DISTINCT FROM
         command_record."template"
       OR outbox_record."status" IS DISTINCT FROM
         'HOLD'::public."IdentityMailOutboxStatus"
       OR outbox_record."messageKey" IS DISTINCT FROM
         command_record."messageKey"
       OR outbox_record."issueRequestDigest" IS DISTINCT FROM
         command_record."issueRequestDigest"
       OR outbox_record."tokenHash" IS DISTINCT FROM
         command_record."tokenHash"
       OR outbox_record."tokenDigestVersion" IS DISTINCT FROM
         command_record."tokenDigestVersion"
       OR outbox_record."secretCiphertext" IS NULL
       OR pg_catalog.octet_length(
         outbox_record."secretCiphertext"
       ) <> 71
       OR outbox_record."envelopeVersion" IS DISTINCT FROM
         command_record."envelopeVersion"
       OR outbox_record."keyVersion" IS DISTINCT FROM
         command_record."keyVersion"
       OR outbox_record."expiresAt" IS DISTINCT FROM
         command_record."expiresAt"
       OR audit_record."tenantId" IS DISTINCT FROM
         command_record."tenantId"
       OR audit_record."actorUserId" IS NOT NULL
       OR audit_record."requestId" IS DISTINCT FROM
         command_record."requestId"
       OR audit_record."action" IS DISTINCT FROM fixed_action
       OR audit_record."targetType" IS DISTINCT FROM 'UserInvite'
       OR audit_record."targetId" IS DISTINCT FROM
         command_record."inviteId"
       OR audit_record."reason" IS NOT NULL
       OR audit_record."before" IS NOT NULL
       OR audit_record."after" IS DISTINCT FROM receipt
       OR audit_record."metadata" IS DISTINCT FROM
         pg_catalog.jsonb_build_object(
           'schemaVersion', 1,
           'authority', 'IdentityOwnerInviteIssueCommand',
           'issueCommandId', command_record."id"
         )
    THEN
      RAISE EXCEPTION 'Initial owner invite replay aggregate does not match'
        USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_set(
      receipt,
      '{decision}',
      '"REPLAYED"'::JSONB,
      false
    );
  END IF;

  IF claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
     OR claim_record."subjectId" IS DISTINCT FROM reservation_subject_id
     OR claim_record."revision" IS DISTINCT FROM expected_claim_revision
  THEN
    RAISE EXCEPTION 'Initial owner invite reservation does not match'
      USING ERRCODE = '23514';
  END IF;

  -- Ephemeral values are validated only after replay has been ruled out.
  command_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_command_id) COLLATE "C"
  );
  invite_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_invite_id) COLLATE "C"
  );
  outbox_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_outbox_id) COLLATE "C"
  );
  message_key := pg_catalog.lower(
    pg_catalog.btrim(candidate_message_key) COLLATE "C"
  );
  token_hash := pg_catalog.btrim(candidate_token_hash);
  issued_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF command_id IS NULL
     OR command_id !~ uuid_pattern
     OR candidate_command_id IS DISTINCT FROM command_id
     OR invite_id IS NULL
     OR invite_id !~ uuid_pattern
     OR candidate_invite_id IS DISTINCT FROM invite_id
     OR outbox_id IS NULL
     OR outbox_id !~ uuid_pattern
     OR candidate_outbox_id IS DISTINCT FROM outbox_id
     OR message_key IS NULL
     OR message_key !~ uuid_pattern
     OR candidate_message_key IS DISTINCT FROM message_key
     OR token_hash IS NULL
     OR candidate_token_hash IS DISTINCT FROM token_hash
     OR token_hash !~ '^[0-9a-f]{64}$'
     OR candidate_secret_ciphertext IS NULL
     OR pg_catalog.octet_length(candidate_secret_ciphertext) <> 71
     OR candidate_expires_at IS NULL
     OR candidate_expires_at IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_expires_at)
     OR candidate_expires_at <= issued_at
     OR candidate_expires_at > issued_at + INTERVAL '30 days'
     OR command_id = reservation_subject_id
     OR command_id = invite_id
     OR command_id = outbox_id
     OR reservation_subject_id = invite_id
     OR invite_id = outbox_id
  THEN
    RAISE EXCEPTION 'Initial owner invite candidate input is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
  INSERT INTO public."UserInvite" (
    "id",
    "tenantId",
    "email",
    "fullName",
    "role",
    "accessScope",
    "customRoleId",
    "storeIds",
    "tokenHash",
    "expiresAt",
    "acceptedAt",
    "acceptedByUserId",
    "createdByUserId",
    "revokedAt",
    "revokedByUserId",
    "identityClaimRevision",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    invite_id,
    tenant_id,
    locked_canonical_email,
    NULL,
    'OWNER'::public."UserRole",
    'NETWORK'::public."UserAccessScope",
    NULL,
    ARRAY[]::TEXT[],
    token_hash,
    candidate_expires_at AT TIME ZONE 'UTC',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    expected_claim_revision + 1,
    issued_at AT TIME ZONE 'UTC',
    issued_at AT TIME ZONE 'UTC'
  );

  INSERT INTO public."IdentityOwnerInviteIssueCommand" (
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
    "createdAt"
  )
  VALUES (
    command_id,
    tenant_id,
    fixed_action,
    request_id,
    request_digest,
    aad_environment,
    workflow_locator,
    reservation_subject_id,
    expected_claim_revision,
    invite_id,
    outbox_id,
    message_key,
    token_hash,
    'sha256-v1',
    'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
    1,
    'v1',
    candidate_expires_at,
    expected_claim_revision + 1,
    issued_at
  );

  INSERT INTO public."IdentityMailOutbox" (
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
    "createdAt"
  )
  VALUES (
    outbox_id,
    tenant_id,
    command_id,
    invite_id,
    workflow_locator,
    aad_environment,
    'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate",
    'HOLD'::public."IdentityMailOutboxStatus",
    message_key,
    request_digest,
    token_hash,
    'sha256-v1',
    candidate_secret_ciphertext,
    1,
    'v1',
    candidate_expires_at,
    issued_at
  );

  UPDATE public."IdentityEmailClaim"
  SET
    "claimType" = 'INVITE'::public."IdentityEmailClaimType",
    "subjectId" = invite_id,
    "revision" = expected_claim_revision + 1,
    "updatedAt" = issued_at
  WHERE "emailCanonical" = locked_canonical_email
    AND "tenantId" = tenant_id
    AND "workflowLocator" = workflow_locator
    AND "claimType" = 'INVITE'::public."IdentityEmailClaimType"
    AND "subjectId" = reservation_subject_id
    AND "revision" = expected_claim_revision
  RETURNING *
  INTO claim_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Initial owner invite claim changed during issue'
      USING ERRCODE = '23514';
  END IF;

  receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ISSUE_DORMANT_OWNER_INVITE',
    'decision', 'CREATED',
    'tenantId', tenant_id,
    'commandId', command_id,
    'inviteId', invite_id,
    'outboxId', outbox_id,
    'claimType', 'INVITE',
    'claimRevision', expected_claim_revision + 1,
    'role', 'OWNER',
    'accessScope', 'NETWORK',
    'outboxStatus', 'HOLD'
  );

  INSERT INTO public."PlatformAdminAuditEvent" (
    "id",
    "tenantId",
    "actorUserId",
    "requestId",
    "action",
    "targetType",
    "targetId",
    "reason",
    "before",
    "after",
    "metadata",
    "createdAt"
  )
  VALUES (
    command_id,
    tenant_id,
    NULL,
    request_id,
    fixed_action,
    'UserInvite',
    invite_id,
    NULL,
    NULL,
    receipt,
    pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'authority', 'IdentityOwnerInviteIssueCommand',
      'issueCommandId', command_id
    ),
    issued_at AT TIME ZONE 'UTC'
  );

  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Initial owner invite candidate conflicts with existing state'
        USING ERRCODE = '23505';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Initial owner invite database precondition is missing'
        USING ERRCODE = '23503';
    WHEN check_violation OR not_null_violation THEN
      RAISE EXCEPTION 'Initial owner invite write invariant failed'
        USING ERRCODE = '23514';
  END;

  RETURN receipt;
END;
$$;

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
  'Dormant private atomic writer for one initial NETWORK OWNER invite and encrypted HOLD outbox. Locator is correlation only; execution remains ungranted.';

COMMENT ON COLUMN public."IdentityMailOutbox"."secretCiphertext" IS
  'AES-256-GCM envelope v1: nonce(12) || ciphertext(43-byte ASCII base64url raw invite token) || authTag(16), exactly 71 bytes. Raw token is never accepted by SQL.';

COMMENT ON COLUMN public."IdentityMailOutbox"."aadEnvironment" IS
  'Persisted non-authority AAD binding. A future worker must equal it to configured IDENTITY_MAIL_AAD_ENVIRONMENT and use the configured value when reconstructing AAD.';

COMMENT ON TABLE public."IdentityOwnerInviteIssueCommand" IS
  'Immutable idempotency authority for one dormant initial owner invite. It stores only PII-free provenance and secret digests.';

COMMENT ON TABLE public."IdentityMailOutbox" IS
  'Dormant encrypted identity mail payload. Migration 171 permits immutable HOLD rows only and creates no sender grant.';

COMMENT ON TYPE public."IdentityMailTemplate" IS
  'Enum USAGE permits constructing typed values only. It grants no table access, RPC execution, or owner-invite authority.';

COMMENT ON TYPE public."IdentityMailOutboxStatus" IS
  'Enum USAGE permits constructing typed values only. It grants no table access, RPC execution, or mail-delivery authority.';

REVOKE ALL
ON FUNCTION public."identity_owner_invite_issue_command_immutable_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_outbox_hold_immutable_v1"()
FROM PUBLIC;

REVOKE ALL
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

REVOKE ALL ON TABLE public."IdentityOwnerInviteIssueCommand" FROM PUBLIC;
REVOKE ALL ON TABLE public."IdentityMailOutbox" FROM PUBLIC;

-- REVOKE FROM PUBLIC does not remove privileges inherited from an operator's
-- ALTER DEFAULT PRIVILEGES policy. Fail the entire transactional migration if
-- either dormant table, any of its exact 37 columns, or any new function has
-- an ACL grantee other than its owner. Enum USAGE is intentionally outside
-- this assertion: a role that can name an enum value still cannot read a table
-- or execute a function.
DO $owner_only_acl$
DECLARE
  guarded_table_count INTEGER;
  guarded_column_count INTEGER;
  expected_column_count INTEGER;
  guarded_function_count INTEGER;
  unsafe_acl_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO guarded_table_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'IdentityOwnerInviteIssueCommand',
      'IdentityMailOutbox'
    );

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE (
        relation.relname,
        attribute.attname
      ) IN (
        ('IdentityOwnerInviteIssueCommand', 'id'),
        ('IdentityOwnerInviteIssueCommand', 'tenantId'),
        ('IdentityOwnerInviteIssueCommand', 'action'),
        ('IdentityOwnerInviteIssueCommand', 'requestId'),
        ('IdentityOwnerInviteIssueCommand', 'issueRequestDigest'),
        ('IdentityOwnerInviteIssueCommand', 'aadEnvironment'),
        ('IdentityOwnerInviteIssueCommand', 'workflowLocator'),
        ('IdentityOwnerInviteIssueCommand', 'reservationSubjectId'),
        ('IdentityOwnerInviteIssueCommand', 'reservationClaimRevision'),
        ('IdentityOwnerInviteIssueCommand', 'inviteId'),
        ('IdentityOwnerInviteIssueCommand', 'outboxId'),
        ('IdentityOwnerInviteIssueCommand', 'messageKey'),
        ('IdentityOwnerInviteIssueCommand', 'tokenHash'),
        ('IdentityOwnerInviteIssueCommand', 'tokenDigestVersion'),
        ('IdentityOwnerInviteIssueCommand', 'template'),
        ('IdentityOwnerInviteIssueCommand', 'envelopeVersion'),
        ('IdentityOwnerInviteIssueCommand', 'keyVersion'),
        ('IdentityOwnerInviteIssueCommand', 'expiresAt'),
        ('IdentityOwnerInviteIssueCommand', 'claimRevision'),
        ('IdentityOwnerInviteIssueCommand', 'createdAt'),
        ('IdentityMailOutbox', 'id'),
        ('IdentityMailOutbox', 'tenantId'),
        ('IdentityMailOutbox', 'issueCommandId'),
        ('IdentityMailOutbox', 'inviteId'),
        ('IdentityMailOutbox', 'workflowLocator'),
        ('IdentityMailOutbox', 'aadEnvironment'),
        ('IdentityMailOutbox', 'template'),
        ('IdentityMailOutbox', 'status'),
        ('IdentityMailOutbox', 'messageKey'),
        ('IdentityMailOutbox', 'issueRequestDigest'),
        ('IdentityMailOutbox', 'tokenHash'),
        ('IdentityMailOutbox', 'tokenDigestVersion'),
        ('IdentityMailOutbox', 'secretCiphertext'),
        ('IdentityMailOutbox', 'envelopeVersion'),
        ('IdentityMailOutbox', 'keyVersion'),
        ('IdentityMailOutbox', 'expiresAt'),
        ('IdentityMailOutbox', 'createdAt')
      )
    )
  INTO guarded_column_count, expected_column_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'IdentityOwnerInviteIssueCommand',
      'IdentityMailOutbox'
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  SELECT pg_catalog.count(*)
  INTO guarded_function_count
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'identity_owner_invite_issue_command_immutable_v1',
      'identity_mail_outbox_hold_immutable_v1',
      'identity_owner_invite_issue_hold_v1'
    );

  IF guarded_table_count <> 2
    OR guarded_column_count <> 37
    OR expected_column_count <> 37
    OR guarded_function_count <> 3
  THEN
    RAISE EXCEPTION 'Identity owner invite ACL inventory is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO unsafe_acl_count
  FROM (
    SELECT
      relation.oid AS object_oid,
      acl.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname IN (
        'IdentityOwnerInviteIssueCommand',
        'IdentityMailOutbox'
      )
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT
      attribute.attrelid AS object_oid,
      acl.grantee
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname IN (
        'IdentityOwnerInviteIssueCommand',
        'IdentityMailOutbox'
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT
      procedure.oid AS object_oid,
      acl.grantee
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'identity_owner_invite_issue_command_immutable_v1',
        'identity_mail_outbox_hold_immutable_v1',
        'identity_owner_invite_issue_hold_v1'
      )
      AND acl.grantee <> procedure.proowner
  ) AS unsafe_acl;

  IF unsafe_acl_count <> 0 THEN
    RAISE EXCEPTION 'Identity owner invite objects require owner-only ACL'
      USING ERRCODE = '55000';
  END IF;
END;
$owner_only_acl$;

COMMIT;
