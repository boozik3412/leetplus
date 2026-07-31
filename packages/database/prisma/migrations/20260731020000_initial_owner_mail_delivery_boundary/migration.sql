BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

DO $precondition$
DECLARE
  labels TEXT[];
BEGIN
  SELECT pg_catalog.array_agg(
    enum_value.enumlabel
    ORDER BY enum_value.enumsortorder
  )
  INTO labels
  FROM pg_catalog.pg_enum AS enum_value
  INNER JOIN pg_catalog.pg_type AS enum_type
    ON enum_type.oid = enum_value.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'IdentityMailOutboxStatus';

  IF labels IS DISTINCT FROM ARRAY[
    'HOLD',
    'PENDING',
    'CLAIMED',
    'RETRY',
    'SENT',
    'DEAD',
    'CANCELED',
    'RECONCILIATION_REQUIRED'
  ]::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus must be exact CURRENT_175 delivery enum'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.to_regclass(
       'public."IdentityMailDeliveryTenantEnrollment"'
     ) IS NOT NULL
     OR pg_catalog.to_regclass(
       'public."IdentityMailDeliveryEvent"'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Initial-owner mail delivery schema already exists'
      USING ERRCODE = '55000';
  END IF;
END;
$precondition$;

LOCK TABLE
  public."Tenant",
  public."UserInvite",
  public."IdentityEmailClaim",
  public."IdentityOwnerInviteIssueCommand",
  public."IdentityMailOutbox"
IN ACCESS EXCLUSIVE MODE;

DO $legacy_recipient_aad_precondition$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."IdentityMailOutbox"
    LIMIT 1
  )
  THEN
    RAISE EXCEPTION
      'LEGACY_RECIPIENT_AAD_REISSUE_REQUIRED'
      USING ERRCODE = '55000';
  END IF;
END;
$legacy_recipient_aad_precondition$;

ALTER TABLE public."IdentityEmailClaim"
  DROP CONSTRAINT "IdentityEmailClaim_email_canonical_check",
  ADD CONSTRAINT "IdentityEmailClaim_email_canonical_check" CHECK (
    pg_catalog.char_length("emailCanonical") BETWEEN 3 AND 320
    AND "emailCanonical" = pg_catalog.btrim("emailCanonical")
    AND "emailCanonical" =
      pg_catalog.lower("emailCanonical" COLLATE "C")
    AND ("emailCanonical" COLLATE "C") ~ '^[!-~]+$'
    AND "emailCanonical" =
      pg_catalog.split_part("emailCanonical", '@', 1)
      || '@'
      || pg_catalog.split_part("emailCanonical", '@', 2)
    AND pg_catalog.char_length(
      pg_catalog.split_part("emailCanonical", '@', 1)
    ) BETWEEN 1 AND 64
    AND (
      pg_catalog.split_part("emailCanonical", '@', 1) COLLATE "C"
    ) ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
    AND (
      pg_catalog.split_part("emailCanonical", '@', 1) COLLATE "C"
    ) !~ '(^\.|\.$|\.\.)'
    AND pg_catalog.char_length(
      pg_catalog.split_part("emailCanonical", '@', 2)
    ) BETWEEN 3 AND 253
    AND (
      pg_catalog.split_part("emailCanonical", '@', 2) COLLATE "C"
    ) ~
      '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  );

CREATE OR REPLACE FUNCTION public."identity_email_claim_lock_v1"(
  candidate_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
  local_part TEXT;
  domain_part TEXT;
BEGIN
  IF candidate_email IS NULL THEN
    RAISE EXCEPTION 'Identity email is required'
      USING ERRCODE = '22023';
  END IF;

  canonical_email :=
    pg_catalog.lower(pg_catalog.btrim(candidate_email) COLLATE "C");
  local_part := pg_catalog.split_part(canonical_email, '@', 1);
  domain_part := pg_catalog.split_part(canonical_email, '@', 2);

  IF pg_catalog.char_length(canonical_email) NOT BETWEEN 3 AND 320
     OR (canonical_email COLLATE "C") !~ '^[!-~]+$'
     OR canonical_email IS DISTINCT FROM
       local_part || '@' || domain_part
     OR pg_catalog.char_length(local_part) NOT BETWEEN 1 AND 64
     OR (local_part COLLATE "C")
       !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
     OR (local_part COLLATE "C") ~ '(^\.|\.$|\.\.)'
     OR pg_catalog.char_length(domain_part) NOT BETWEEN 3 AND 253
     OR (domain_part COLLATE "C")
       !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  THEN
    RAISE EXCEPTION 'Identity email is not a supported canonical address'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-email:v1:' || canonical_email,
      167
    )
  );

  RETURN canonical_email;
END;
$$;

DROP TRIGGER "IdentityMailOutbox_release_guard_trigger"
ON public."IdentityMailOutbox";

DROP FUNCTION public."identity_mail_outbox_release_guard_v1"();

ALTER TABLE public."IdentityMailOutbox"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "transitionRevision" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "leaseOwnerDigest" CHAR(64),
  ADD COLUMN "leaseTokenDigest" CHAR(64),
  ADD COLUMN "claimedAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "providerAttemptKey" VARCHAR(96),
  ADD COLUMN "providerAttemptedAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "providerAcknowledgeUntil" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "providerAuthorityDigest" CHAR(64),
  ADD COLUMN "messageIdDigest" CHAR(64),
  ADD COLUMN "providerOutcomeClass" VARCHAR(32),
  ADD COLUMN "providerObservedAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "providerReceiptDigest" CHAR(64),
  ADD COLUMN "terminalAckDigest" CHAR(64),
  ADD COLUMN "ciphertextClearedAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "sentAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "terminalAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD COLUMN "stateReasonCode" VARCHAR(64),
  ADD COLUMN "updatedAt" TIMESTAMP(3) WITH TIME ZONE
    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "secretCiphertext" DROP NOT NULL;

CREATE TABLE public."IdentityMailDeliveryTenantEnrollment" (
  "tenantId" TEXT NOT NULL,
  "workerRoleName" VARCHAR(63) NOT NULL,
  "workerRoleOid" BIGINT NOT NULL,
  "policyRevision" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "maxAttempts" INTEGER NOT NULL,
  "leaseSeconds" INTEGER NOT NULL,
  "acknowledgeSeconds" INTEGER NOT NULL,
  "baseRetrySeconds" INTEGER NOT NULL,
  "maxRetrySeconds" INTEGER NOT NULL,
  "providerAuthorityDigest" CHAR(64) NOT NULL,
  "enabledAt" TIMESTAMP(3) WITH TIME ZONE,
  "disabledAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IdentityMailDeliveryTenantEnrollment_pkey"
    PRIMARY KEY ("tenantId"),
  CONSTRAINT "IdentityMailDeliveryTenantEnrollment_role_check" CHECK (
    ("workerRoleName"::TEXT COLLATE "C") ~
      '^[a-z_][a-z0-9_]{0,62}$'
    AND "workerRoleOid" BETWEEN 1 AND 4294967295
  ),
  CONSTRAINT "IdentityMailDeliveryTenantEnrollment_policy_check" CHECK (
    "policyRevision" >= 1
    AND "maxAttempts" BETWEEN 1 AND 20
    AND "leaseSeconds" BETWEEN 10 AND 900
    AND "acknowledgeSeconds" BETWEEN 10 AND 900
    AND "baseRetrySeconds" BETWEEN 1 AND 3600
    AND "maxRetrySeconds" BETWEEN "baseRetrySeconds" AND 86400
    AND ("providerAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityMailDeliveryTenantEnrollment_state_check" CHECK (
    (
      "enabled" = false
      AND "enabledAt" IS NULL
      AND "disabledAt" IS NULL
    )
    OR (
      "enabled" = true
      AND "enabledAt" IS NOT NULL
      AND "disabledAt" IS NULL
      AND "enabledAt" >= "createdAt"
    )
    OR (
      "enabled" = false
      AND "enabledAt" IS NOT NULL
      AND "disabledAt" IS NOT NULL
      AND "disabledAt" >= "enabledAt"
    )
  ),
  CONSTRAINT "IdentityMailDeliveryTenantEnrollment_timeline_check" CHECK (
    "updatedAt" >= "createdAt"
  )
);

CREATE INDEX "identity_mail_delivery_enrollment_worker_idx"
  ON public."IdentityMailDeliveryTenantEnrollment" (
    "workerRoleName",
    "workerRoleOid",
    "enabled"
  );

CREATE TABLE public."IdentityMailDeliveryEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "transitionRevision" BIGINT NOT NULL,
  "leaseVersion" INTEGER NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "fromStatus" public."IdentityMailOutboxStatus",
  "toStatus" public."IdentityMailOutboxStatus" NOT NULL,
  "leaseOwnerDigest" CHAR(64),
  "providerAttemptKey" VARCHAR(96),
  "providerAuthorityDigest" CHAR(64),
  "messageIdDigest" CHAR(64),
  "providerOutcomeClass" VARCHAR(32),
  "providerReceiptDigest" CHAR(64),
  "terminalAckDigest" CHAR(64),
  "actorDigest" CHAR(64),
  "stateReasonCode" VARCHAR(64),
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdTransactionId" VARCHAR(32) NOT NULL,
  "eventDigest" CHAR(64) NOT NULL,

  CONSTRAINT "IdentityMailDeliveryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityMailDeliveryEvent_id_check" CHECK (
    ("id" COLLATE "C") ~
      '^[0-9a-f-]{36}:[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT "IdentityMailDeliveryEvent_transition_check" CHECK (
    "transitionRevision" >= 1
    AND "leaseVersion" >= 0
    AND "attemptNumber" >= 0
    AND "eventType" =
      pg_catalog.upper(pg_catalog.btrim("eventType" COLLATE "C"))
    AND ("eventType" COLLATE "C") ~ '^[A-Z][A-Z0-9_]{2,63}$'
    AND ("createdTransactionId" COLLATE "C") ~ '^[0-9]+$'
    AND ("eventDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IdentityMailDeliveryEvent_digest_check" CHECK (
    (
      "leaseOwnerDigest" IS NULL
      OR ("leaseOwnerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerAuthorityDigest" IS NULL
      OR ("providerAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "messageIdDigest" IS NULL
      OR ("messageIdDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerReceiptDigest" IS NULL
      OR ("providerReceiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "terminalAckDigest" IS NULL
      OR ("terminalAckDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "actorDigest" IS NULL
      OR ("actorDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerAttemptKey" IS NULL
      OR (
        "providerAttemptKey" =
          pg_catalog.lower(pg_catalog.btrim("providerAttemptKey") COLLATE "C")
        AND ("providerAttemptKey" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    AND (
      "stateReasonCode" IS NULL
      OR (
        "stateReasonCode" =
          pg_catalog.upper(pg_catalog.btrim("stateReasonCode" COLLATE "C"))
        AND ("stateReasonCode" COLLATE "C") ~ '^[A-Z][A-Z0-9_]{2,63}$'
      )
    )
    AND (
      (
        "eventType" IN (
          'REAP_RETRY',
          'REAP_DEAD',
          'REAP_CANCELED',
          'REAP_AMBIGUOUS',
          'RECONCILED_SENT',
          'RECONCILED_DEAD'
        )
        AND "actorDigest" IS NOT NULL
      )
      OR (
        "eventType" NOT IN (
          'REAP_RETRY',
          'REAP_DEAD',
          'REAP_CANCELED',
          'REAP_AMBIGUOUS',
          'RECONCILED_SENT',
          'RECONCILED_DEAD'
        )
        AND "actorDigest" IS NULL
      )
    )
  )
);

CREATE UNIQUE INDEX "identity_mail_delivery_event_transition_uidx"
  ON public."IdentityMailDeliveryEvent" (
    "tenantId",
    "outboxId",
    "transitionRevision"
  );

CREATE UNIQUE INDEX "identity_mail_delivery_event_digest_key"
  ON public."IdentityMailDeliveryEvent" ("eventDigest");

CREATE INDEX "identity_mail_delivery_event_invite_idx"
  ON public."IdentityMailDeliveryEvent" (
    "tenantId",
    "inviteId",
    "eventAt"
  );

CREATE INDEX "identity_mail_delivery_event_outbox_idx"
  ON public."IdentityMailDeliveryEvent" ("outboxId", "eventAt");

ALTER TABLE public."IdentityMailDeliveryTenantEnrollment"
  ADD CONSTRAINT "IdentityMailDeliveryTenantEnrollment_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailDeliveryEvent"
  ADD CONSTRAINT "IdentityMailDeliveryEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityMailDeliveryEvent_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityMailOutbox" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityMailDeliveryEvent_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite" ("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."IdentityMailOutbox"
  DROP CONSTRAINT "IdentityMailOutbox_crypto_check",
  ADD CONSTRAINT "IdentityMailOutbox_delivery_counter_check" CHECK (
    "attempts" BETWEEN 0 AND 20
    AND "leaseVersion" = "attempts"
    AND "transitionRevision" >= 0
    AND "updatedAt" >= "createdAt"
  ),
  ADD CONSTRAINT "IdentityMailOutbox_delivery_digest_check" CHECK (
    (
      "leaseOwnerDigest" IS NULL
      OR ("leaseOwnerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "leaseTokenDigest" IS NULL
      OR ("leaseTokenDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerAuthorityDigest" IS NULL
      OR ("providerAuthorityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "messageIdDigest" IS NULL
      OR ("messageIdDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerReceiptDigest" IS NULL
      OR ("providerReceiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "terminalAckDigest" IS NULL
      OR ("terminalAckDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    )
    AND (
      "providerAttemptKey" IS NULL
      OR (
        "providerAttemptKey" =
          pg_catalog.lower(pg_catalog.btrim("providerAttemptKey") COLLATE "C")
        AND ("providerAttemptKey" COLLATE "C") ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    AND (
      "stateReasonCode" IS NULL
      OR (
        "stateReasonCode" =
          pg_catalog.upper(pg_catalog.btrim("stateReasonCode" COLLATE "C"))
        AND ("stateReasonCode" COLLATE "C") ~ '^[A-Z][A-Z0-9_]{2,63}$'
      )
    )
  ),
  ADD CONSTRAINT "IdentityMailOutbox_delivery_shape_check" CHECK (
    "tokenDigestVersion" = 'sha256-v1'
    AND "template" =
      'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"
    AND "envelopeVersion" = 1
    AND "keyVersion" = 'v1'
    AND (
      (
        "providerAttemptKey" IS NULL
        AND "providerAttemptedAt" IS NULL
        AND "providerAcknowledgeUntil" IS NULL
        AND "providerAuthorityDigest" IS NULL
        AND "messageIdDigest" IS NULL
        AND "ciphertextClearedAt" IS NULL
      )
      OR (
        "providerAttemptKey" IS NOT NULL
        AND "providerAttemptedAt" IS NOT NULL
        AND "providerAcknowledgeUntil" IS NOT NULL
        AND "providerAcknowledgeUntil" > "providerAttemptedAt"
        AND "providerAuthorityDigest" IS NOT NULL
        AND "messageIdDigest" IS NOT NULL
        AND "ciphertextClearedAt" = "providerAttemptedAt"
      )
    )
    AND (
      (
        "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
        AND "leaseOwnerDigest" IS NOT NULL
        AND "leaseTokenDigest" IS NOT NULL
        AND "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" > "claimedAt"
      )
      OR (
        "status" <> 'CLAIMED'::public."IdentityMailOutboxStatus"
        AND "leaseOwnerDigest" IS NULL
        AND "leaseTokenDigest" IS NULL
        AND "claimedAt" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
    )
    AND (
      (
        "status" IN (
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
        AND "availableAt" IS NOT NULL
      )
      OR (
        "status" NOT IN (
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
        AND "availableAt" IS NULL
      )
    )
    AND (
      (
        "status" IN (
          'HOLD'::public."IdentityMailOutboxStatus",
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
        OR (
          "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
          AND "providerAttemptKey" IS NULL
        )
      )
      AND "secretCiphertext" IS NOT NULL
      AND pg_catalog.octet_length("secretCiphertext") = 71
      OR (
        (
          "status" IN (
            'SENT'::public."IdentityMailOutboxStatus",
            'DEAD'::public."IdentityMailOutboxStatus",
            'CANCELED'::public."IdentityMailOutboxStatus",
            'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
          )
          OR (
            "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
            AND "providerAttemptKey" IS NOT NULL
          )
        )
        AND "secretCiphertext" IS NULL
      )
    )
  );

ALTER TABLE public."IdentityMailOutbox"
  ADD CONSTRAINT "IdentityMailOutbox_delivery_state_check" CHECK (
    (
      "status" = 'HOLD'::public."IdentityMailOutboxStatus"
      AND "releasedAt" IS NULL
      AND "attempts" = 0
      AND "transitionRevision" = 0
      AND "providerOutcomeClass" IS NULL
      AND "providerObservedAt" IS NULL
      AND "providerReceiptDigest" IS NULL
      AND "terminalAckDigest" IS NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NULL
      AND "stateReasonCode" IS NULL
    )
    OR (
      "status" = 'PENDING'::public."IdentityMailOutboxStatus"
      AND "releasedAt" IS NOT NULL
      AND "releasedAt" >= "createdAt"
      AND "releasedAt" < "expiresAt"
      AND "attempts" = 0
      AND "transitionRevision" >= 1
      AND "providerAttemptKey" IS NULL
      AND "providerOutcomeClass" IS NULL
      AND "providerObservedAt" IS NULL
      AND "providerReceiptDigest" IS NULL
      AND "terminalAckDigest" IS NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NULL
      AND "stateReasonCode" IS NULL
    )
    OR (
      "status" = 'RETRY'::public."IdentityMailOutboxStatus"
      AND "releasedAt" IS NOT NULL
      AND "attempts" >= 1
      AND "providerAttemptKey" IS NULL
      AND "providerOutcomeClass" IS NULL
      AND "providerObservedAt" IS NULL
      AND "providerReceiptDigest" IS NULL
      AND "terminalAckDigest" IS NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NULL
      AND "stateReasonCode" IS NOT NULL
    )
    OR (
      "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
      AND "releasedAt" IS NOT NULL
      AND "attempts" >= 1
      AND "providerOutcomeClass" IS NULL
      AND "providerObservedAt" IS NULL
      AND "providerReceiptDigest" IS NULL
      AND "terminalAckDigest" IS NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NULL
      AND "stateReasonCode" IS NULL
    )
    OR (
      "status" = 'SENT'::public."IdentityMailOutboxStatus"
      AND "providerAttemptKey" IS NOT NULL
      AND "providerOutcomeClass" IN ('ACCEPTED', 'RESOLVED_SENT')
      AND "providerObservedAt" IS NOT NULL
      AND "providerReceiptDigest" IS NOT NULL
      AND "terminalAckDigest" IS NOT NULL
      AND "sentAt" IS NOT NULL
      AND "terminalAt" = "sentAt"
      AND "stateReasonCode" IS NULL
    )
    OR (
      "status" = 'DEAD'::public."IdentityMailOutboxStatus"
      AND "providerOutcomeClass" IN (
        'PRE_PROVIDER_FAILURE',
        'DEFINITIVE_NOT_SENT',
        'RESOLVED_DEAD'
      )
      AND "providerObservedAt" IS NOT NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NOT NULL
      AND "stateReasonCode" IS NOT NULL
    )
    OR (
      "status" = 'CANCELED'::public."IdentityMailOutboxStatus"
      AND "providerAttemptKey" IS NULL
      AND "providerOutcomeClass" = 'CANCELED'
      AND "providerObservedAt" IS NOT NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NOT NULL
      AND "stateReasonCode" IS NOT NULL
    )
    OR (
      "status" =
        'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
      AND "providerAttemptKey" IS NOT NULL
      AND "providerOutcomeClass" = 'AMBIGUOUS'
      AND "providerObservedAt" IS NOT NULL
      AND "sentAt" IS NULL
      AND "terminalAt" IS NOT NULL
      AND "stateReasonCode" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "identity_mail_outbox_provider_attempt_key_uidx"
  ON public."IdentityMailOutbox" ("providerAttemptKey")
  WHERE "providerAttemptKey" IS NOT NULL;

CREATE INDEX "identity_mail_outbox_ready_idx"
  ON public."IdentityMailOutbox" (
    "status",
    "availableAt",
    "createdAt",
    "id"
  )
  WHERE "status" IN (
    'PENDING'::public."IdentityMailOutboxStatus",
    'RETRY'::public."IdentityMailOutboxStatus"
  );

CREATE INDEX "identity_mail_outbox_unmarked_lease_idx"
  ON public."IdentityMailOutbox" ("leaseExpiresAt", "id")
  WHERE "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
    AND "providerAttemptedAt" IS NULL;

CREATE INDEX "identity_mail_outbox_marked_ack_idx"
  ON public."IdentityMailOutbox" (
    "providerAcknowledgeUntil",
    "id"
  )
  WHERE "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
    AND "providerAttemptedAt" IS NOT NULL;

CREATE INDEX "identity_mail_outbox_reconciliation_idx"
  ON public."IdentityMailOutbox" ("terminalAt", "id")
  WHERE "status" =
    'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus";

CREATE FUNCTION public."identity_mail_delivery_event_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP <> 'INSERT'
     OR pg_catalog.pg_trigger_depth() < 1
     OR pg_catalog.current_setting(
       'leetplus.identity_mail_delivery_event',
       true
     ) IS NULL
  THEN
    RAISE EXCEPTION 'Identity mail delivery event ledger is append-only'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public."identity_mail_delivery_event_truncate_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Identity mail delivery event ledger cannot be truncated'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailDeliveryEvent_row_guard_trigger"
BEFORE INSERT OR UPDATE OR DELETE
ON public."IdentityMailDeliveryEvent"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_delivery_event_guard_v1"();

CREATE TRIGGER "IdentityMailDeliveryEvent_truncate_guard_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDeliveryEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_delivery_event_truncate_guard_v1"();

CREATE FUNCTION public."identity_mail_delivery_enrollment_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Identity mail worker enrollment cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."policyRevision" <> OLD."policyRevision" + 1
       OR NEW."updatedAt" <= OLD."updatedAt"
     )
  THEN
    RAISE EXCEPTION 'Identity mail worker enrollment CAS is invalid'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION
  public."identity_mail_delivery_enrollment_truncate_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Identity mail worker enrollment cannot be truncated'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailDeliveryTenantEnrollment_row_guard_trigger"
BEFORE UPDATE OR DELETE
ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_delivery_enrollment_guard_v1"();

CREATE TRIGGER
  "IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH STATEMENT
EXECUTE FUNCTION
  public."identity_mail_delivery_enrollment_truncate_guard_v1"();

CREATE FUNCTION public."identity_mail_outbox_delivery_guard_v1"()
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

CREATE FUNCTION public."identity_mail_delivery_event_append_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
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
          'LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V1',
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
          COALESCE(NEW."providerAttemptKey", '-'),
          COALESCE(NEW."providerAuthorityDigest", '-'),
          COALESCE(NEW."messageIdDigest", '-'),
          COALESCE(NEW."providerOutcomeClass", '-'),
          COALESCE(NEW."providerReceiptDigest", '-'),
          COALESCE(NEW."terminalAckDigest", '-'),
          COALESCE(actor_digest, '-'),
          COALESCE(NEW."stateReasonCode", '-'),
          NEW."updatedAt"::TEXT,
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
EXECUTE FUNCTION public."identity_mail_outbox_delivery_guard_v1"();

CREATE TRIGGER "IdentityMailOutbox_delivery_event_trigger"
AFTER UPDATE
ON public."IdentityMailOutbox"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_delivery_event_append_v1"();

CREATE FUNCTION
  public."identity_initial_owner_invite_accept_sent_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  db_accepted_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."acceptedAt" IS NOT NULL
       AND NEW."role" = 'OWNER'::public."UserRole"
       AND NEW."accessScope" =
         'NETWORK'::public."UserAccessScope"
       AND NEW."customRoleId" IS NULL
       AND pg_catalog.cardinality(NEW."storeIds") = 0
       AND EXISTS (
         SELECT 1
         FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = NEW."tenantId"
           AND target_tenant."status" =
             'ACTIVE'::public."TenantLifecycleStatus"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
    THEN
      RAISE EXCEPTION
        'Initial owner invite cannot be inserted as accepted'
        USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD."acceptedAt" IS NULL
     AND NEW."acceptedAt" IS NOT NULL
     AND (
       (
         OLD."role" = 'OWNER'::public."UserRole"
         AND OLD."accessScope" = 'NETWORK'::public."UserAccessScope"
         AND OLD."customRoleId" IS NULL
         AND pg_catalog.cardinality(OLD."storeIds") = 0
       )
       OR (
         NEW."role" = 'OWNER'::public."UserRole"
         AND NEW."accessScope" = 'NETWORK'::public."UserAccessScope"
         AND NEW."customRoleId" IS NULL
         AND pg_catalog.cardinality(NEW."storeIds") = 0
       )
     )
     AND (
       EXISTS (
         SELECT 1
         FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = OLD."tenantId"
           AND target_tenant."status" =
             'ACTIVE'::public."TenantLifecycleStatus"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
       OR EXISTS (
         SELECT 1
         FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = NEW."tenantId"
           AND target_tenant."status" =
             'ACTIVE'::public."TenantLifecycleStatus"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
     )
  THEN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
       OR OLD."role" IS DISTINCT FROM NEW."role"
       OR OLD."accessScope" IS DISTINCT FROM NEW."accessScope"
       OR OLD."customRoleId" IS DISTINCT FROM NEW."customRoleId"
       OR OLD."storeIds" IS DISTINCT FROM NEW."storeIds"
       OR OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash"
       OR OLD."email" IS DISTINCT FROM NEW."email"
       OR OLD."identityClaimRevision" IS DISTINCT FROM
         NEW."identityClaimRevision"
       OR NEW."role" IS DISTINCT FROM
         'OWNER'::public."UserRole"
       OR NEW."accessScope" IS DISTINCT FROM
         'NETWORK'::public."UserAccessScope"
       OR NEW."customRoleId" IS NOT NULL
       OR pg_catalog.cardinality(NEW."storeIds") IS DISTINCT FROM 0
    THEN
      RAISE EXCEPTION
        'Initial owner invite identity cannot change during acceptance'
        USING ERRCODE = '55000';
    END IF;

    db_accepted_at := pg_catalog.clock_timestamp();

    IF NOT EXISTS (
       SELECT 1
       FROM public."IdentityMailOutbox" AS target_outbox
       INNER JOIN public."IdentityEmailClaim" AS identity_claim
         ON identity_claim."emailCanonical" = NEW."email"
        AND identity_claim."claimType" =
          'INVITE'::public."IdentityEmailClaimType"
        AND identity_claim."tenantId" = NEW."tenantId"
        AND identity_claim."subjectId" = NEW."id"
        AND identity_claim."revision" =
          NEW."identityClaimRevision"
       INNER JOIN public."Tenant" AS target_tenant
         ON target_tenant."id" = NEW."tenantId"
       INNER JOIN public."IdentityMailDeliveryEvent" AS sent_event
         ON sent_event."tenantId" = target_outbox."tenantId"
        AND sent_event."outboxId" = target_outbox."id"
        AND sent_event."transitionRevision" =
          target_outbox."transitionRevision"
        AND sent_event."toStatus" =
          'SENT'::public."IdentityMailOutboxStatus"
         AND sent_event."eventType" IN (
           'PROVIDER_ACCEPTED',
           'RECONCILED_SENT'
         )
         AND (
           (
             sent_event."eventType" = 'PROVIDER_ACCEPTED'
             AND sent_event."actorDigest" IS NULL
           )
           OR (
             sent_event."eventType" = 'RECONCILED_SENT'
             AND sent_event."actorDigest" IS NOT NULL
           )
         )
       WHERE target_outbox."tenantId" = NEW."tenantId"
         AND target_outbox."inviteId" = NEW."id"
         AND target_outbox."tokenHash" = NEW."tokenHash"
         AND target_outbox."status" =
           'SENT'::public."IdentityMailOutboxStatus"
         AND NEW."revokedAt" IS NULL
         AND NEW."expiresAt" > db_accepted_at
         AND target_tenant."status" =
           'ACTIVE'::public."TenantLifecycleStatus"
         AND target_tenant."customerStage" =
           'PILOT'::public."TenantCustomerStage"
         AND target_tenant."onboardingStatus" =
           'OWNER_INVITED'::public."TenantOnboardingStatus"
         AND target_tenant."trialStartsAt" <= db_accepted_at
         AND target_tenant."trialEndsAt" > db_accepted_at
         AND target_outbox."expiresAt" > db_accepted_at
         AND target_outbox."secretCiphertext" IS NULL
          AND target_outbox."providerAttemptKey" IS NOT NULL
          AND target_outbox."sentAt" IS NOT NULL
          AND target_outbox."terminalAt" =
            target_outbox."sentAt"
          AND target_outbox."sentAt" <= db_accepted_at
    )
    THEN
      RAISE EXCEPTION
        'Initial owner invite cannot be accepted before verified delivery'
        USING ERRCODE = '55000';
    END IF;

    NEW."acceptedAt" := db_accepted_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserInvite_initial_owner_delivery_sent_guard_trigger"
BEFORE UPDATE OF "acceptedAt"
ON public."UserInvite"
FOR EACH ROW
EXECUTE FUNCTION
  public."identity_initial_owner_invite_accept_sent_guard_v1"();

CREATE TRIGGER "UserInvite_initial_owner_unaccepted_insert_guard_trigger"
BEFORE INSERT
ON public."UserInvite"
FOR EACH ROW
EXECUTE FUNCTION
  public."identity_initial_owner_invite_accept_sent_guard_v1"();

CREATE FUNCTION public."identity_mail_delivery_worker_assert_v1"(
  p_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  enrollment_record RECORD;
  migration_count INTEGER;
  migration_head TEXT;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id <> pg_catalog.lower(
       pg_catalog.btrim(p_tenant_id COLLATE "C")
     )
     OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity mail worker tenant is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    enrollment."policyRevision",
    enrollment."maxAttempts",
    enrollment."leaseSeconds",
    enrollment."acknowledgeSeconds",
    enrollment."baseRetrySeconds",
    enrollment."maxRetrySeconds",
    enrollment."providerAuthorityDigest"
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  INNER JOIN pg_catalog.pg_roles AS worker_role
    ON worker_role.rolname = session_user
   AND worker_role.oid::BIGINT = enrollment."workerRoleOid"
  WHERE enrollment."tenantId" = p_tenant_id
    AND enrollment."enabled" = true
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
    RAISE EXCEPTION 'Identity mail worker is not enrolled for tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    (
      SELECT migration."migration_name"
      FROM public."_prisma_migrations" AS migration
      WHERE migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL
      ORDER BY
        migration."started_at" DESC,
        migration."migration_name" DESC
      LIMIT 1
    )
  INTO migration_count, migration_head
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 176
     OR migration_head IS DISTINCT FROM
       '20260731020000_initial_owner_mail_delivery_boundary'
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker database migration receipt is not CURRENT_176'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER',
    'decision', 'READY',
    'tenantId', p_tenant_id,
    'migrationHead', migration_head,
    'migrationCount', migration_count,
    'policyRevision', enrollment_record."policyRevision",
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

CREATE FUNCTION public."identity_initial_owner_mail_claim_v1"(
  p_tenant_id TEXT,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_worker_config_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  policy JSONB;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record RECORD;
  next_revision BIGINT;
  next_attempt INTEGER;
BEGIN
  IF p_lease_owner_digest IS NULL
     OR (p_lease_owner_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_token_digest IS NULL
     OR (p_lease_token_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_worker_config_digest IS NULL
     OR (p_worker_config_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_lease_owner_digest = p_lease_token_digest
  THEN
    RAISE EXCEPTION 'Identity mail worker lease binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  policy :=
    public."identity_mail_delivery_worker_assert_v1"(p_tenant_id);
  IF p_worker_config_digest <>
       (policy ->> 'providerAuthorityDigest')
  THEN
    RAISE EXCEPTION
      'Identity mail worker configuration is not enrolled for tenant'
      USING ERRCODE = '42501';
  END IF;
  now_at := pg_catalog.clock_timestamp();

  SELECT
    target_outbox.*,
    target_invite."email" AS recipient_email
  INTO outbox_record
  FROM public."IdentityMailOutbox" AS target_outbox
  INNER JOIN public."UserInvite" AS target_invite
    ON target_invite."tenantId" = target_outbox."tenantId"
   AND target_invite."id" = target_outbox."inviteId"
   AND target_invite."tokenHash" = target_outbox."tokenHash"
  INNER JOIN public."IdentityEmailClaim" AS identity_claim
    ON identity_claim."emailCanonical" = target_invite."email"
   AND identity_claim."claimType" =
     'INVITE'::public."IdentityEmailClaimType"
   AND identity_claim."tenantId" = target_outbox."tenantId"
   AND identity_claim."subjectId" = target_outbox."inviteId"
   AND identity_claim."revision" =
     target_invite."identityClaimRevision"
  INNER JOIN public."Tenant" AS target_tenant
    ON target_tenant."id" = target_outbox."tenantId"
  WHERE target_outbox."tenantId" = p_tenant_id
    AND target_outbox."status" IN (
      'PENDING'::public."IdentityMailOutboxStatus",
      'RETRY'::public."IdentityMailOutboxStatus"
    )
    AND target_outbox."availableAt" <= now_at
    AND target_outbox."expiresAt" > now_at
    AND target_outbox."attempts" < (policy ->> 'maxAttempts')::INTEGER
    AND target_invite."acceptedAt" IS NULL
    AND target_invite."revokedAt" IS NULL
    AND target_invite."expiresAt" > now_at
    AND target_invite."email" IS NOT NULL
    AND pg_catalog.char_length(target_invite."email") BETWEEN 3 AND 320
    AND target_invite."email" =
      pg_catalog.lower(
        pg_catalog.btrim(target_invite."email") COLLATE "C"
      )
    AND (target_invite."email" COLLATE "C") ~ '^[!-~]+$'
    AND (target_invite."email" COLLATE "C") ~
      '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
    AND pg_catalog.char_length(
      pg_catalog.split_part(target_invite."email", '@', 1)
    ) BETWEEN 1 AND 64
    AND (
      pg_catalog.split_part(target_invite."email", '@', 1) COLLATE "C"
    ) !~ '(^\.|\.$|\.\.)'
    AND pg_catalog.char_length(
      pg_catalog.split_part(target_invite."email", '@', 2)
    ) BETWEEN 3 AND 253
    AND (
      pg_catalog.split_part(target_invite."email", '@', 2) COLLATE "C"
    ) ~
      '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND target_invite."role" = 'OWNER'::public."UserRole"
    AND target_invite."accessScope" =
      'NETWORK'::public."UserAccessScope"
    AND target_invite."customRoleId" IS NULL
    AND pg_catalog.cardinality(target_invite."storeIds") = 0
    AND target_tenant."status" =
      'ACTIVE'::public."TenantLifecycleStatus"
    AND target_tenant."customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND target_tenant."onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus"
    AND target_tenant."trialStartsAt" <= now_at
    AND target_tenant."trialEndsAt" > now_at
  ORDER BY
    target_outbox."availableAt",
    target_outbox."createdAt",
    target_outbox."id"
  FOR UPDATE OF target_outbox SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CLAIM_INITIAL_OWNER_MAIL',
      'decision', 'EMPTY'
    );
  END IF;

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
    "leaseExpiresAt" =
      now_at + pg_catalog.make_interval(
        secs => (policy ->> 'leaseSeconds')::INTEGER
      ),
    "stateReasonCode" = NULL,
    "updatedAt" = now_at
  WHERE "id" = outbox_record."id";

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'CLAIM_INITIAL_OWNER_MAIL',
    'decision', 'CLAIMED',
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
    'recipientEmail', outbox_record.recipient_email,
    'expiresAt', outbox_record."expiresAt",
    'attemptNumber', next_attempt,
    'leaseVersion', next_attempt,
    'transitionRevision', next_revision
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_provider_mark_v1"(
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
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  policy JSONB;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record RECORD;
  invite_live BOOLEAN := false;
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
    RAISE EXCEPTION 'Identity mail provider marker input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO outbox_record
  FROM public."IdentityMailOutbox"
  WHERE "id" = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail outbox was not found'
      USING ERRCODE = 'P0002';
  END IF;

  policy :=
    public."identity_mail_delivery_worker_assert_v1"(
      outbox_record."tenantId"
    );
  now_at := pg_catalog.clock_timestamp();

  IF p_provider_authority_digest IS DISTINCT FROM
       (policy ->> 'providerAuthorityDigest')
     OR outbox_record."status" IS DISTINCT FROM
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
  THEN
    RAISE EXCEPTION 'Identity mail provider marker CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  -- The provider marker is the delivery linearization point. Serialize the
  -- target invite first so a committed revoke/accept cannot race past it.
  PERFORM 1
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = outbox_record."tenantId"
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  PERFORM 1
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = outbox_record."tenantId"
  FOR SHARE OF target_tenant;

  PERFORM 1
  FROM public."IdentityEmailClaim" AS identity_claim
  WHERE identity_claim."emailCanonical" = (
      SELECT target_invite."email"
      FROM public."UserInvite" AS target_invite
      WHERE target_invite."tenantId" = outbox_record."tenantId"
        AND target_invite."id" = outbox_record."inviteId"
    )
  FOR SHARE OF identity_claim;

  SELECT EXISTS (
    SELECT 1
    FROM public."UserInvite" AS target_invite
    INNER JOIN public."IdentityEmailClaim" AS identity_claim
      ON identity_claim."emailCanonical" = target_invite."email"
     AND identity_claim."claimType" =
       'INVITE'::public."IdentityEmailClaimType"
     AND identity_claim."tenantId" = target_invite."tenantId"
     AND identity_claim."subjectId" = target_invite."id"
     AND identity_claim."revision" =
       target_invite."identityClaimRevision"
    INNER JOIN public."Tenant" AS target_tenant
      ON target_tenant."id" = target_invite."tenantId"
    WHERE target_invite."tenantId" = outbox_record."tenantId"
      AND target_invite."id" = outbox_record."inviteId"
      AND target_invite."tokenHash" = outbox_record."tokenHash"
      AND outbox_record."expiresAt" > now_at
      AND target_invite."acceptedAt" IS NULL
      AND target_invite."revokedAt" IS NULL
      AND target_invite."expiresAt" > now_at
      AND target_invite."email" IS NOT NULL
      AND pg_catalog.char_length(target_invite."email") BETWEEN 3 AND 320
      AND target_invite."email" =
        pg_catalog.lower(
          pg_catalog.btrim(target_invite."email") COLLATE "C"
        )
      AND (target_invite."email" COLLATE "C") ~ '^[!-~]+$'
      AND (target_invite."email" COLLATE "C") ~
        '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
      AND pg_catalog.char_length(
        pg_catalog.split_part(target_invite."email", '@', 1)
      ) BETWEEN 1 AND 64
      AND (
        pg_catalog.split_part(target_invite."email", '@', 1) COLLATE "C"
      ) !~ '(^\.|\.$|\.\.)'
      AND pg_catalog.char_length(
        pg_catalog.split_part(target_invite."email", '@', 2)
      ) BETWEEN 3 AND 253
      AND (
        pg_catalog.split_part(target_invite."email", '@', 2) COLLATE "C"
      ) ~
        '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      AND target_invite."role" = 'OWNER'::public."UserRole"
      AND target_invite."accessScope" =
        'NETWORK'::public."UserAccessScope"
      AND target_invite."customRoleId" IS NULL
      AND pg_catalog.cardinality(target_invite."storeIds") = 0
      AND target_tenant."status" =
        'ACTIVE'::public."TenantLifecycleStatus"
      AND target_tenant."customerStage" =
        'PILOT'::public."TenantCustomerStage"
      AND target_tenant."onboardingStatus" =
        'OWNER_INVITED'::public."TenantOnboardingStatus"
      AND target_tenant."trialStartsAt" <= now_at
      AND target_tenant."trialEndsAt" > now_at
  )
  INTO invite_live;

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
    WHERE "id" = p_outbox_id;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
      'decision', 'CANCELED',
      'reasonCode', 'NOT_DELIVERABLE',
      'outboxId', p_outbox_id,
      'tenantId', outbox_record."tenantId",
      'inviteId', outbox_record."inviteId",
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
    "providerAcknowledgeUntil" =
      now_at + pg_catalog.make_interval(
        secs => (policy ->> 'acknowledgeSeconds')::INTEGER
      ),
    "providerAuthorityDigest" = p_provider_authority_digest,
    "messageIdDigest" = p_message_id_digest,
    "secretCiphertext" = NULL,
    "ciphertextClearedAt" = now_at,
    "updatedAt" = now_at
  WHERE "id" = p_outbox_id;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'MARK_INITIAL_OWNER_MAIL_PROVIDER_ATTEMPT',
    'decision', 'MARKED',
    'reasonCode', NULL,
    'outboxId', p_outbox_id,
    'tenantId', outbox_record."tenantId",
    'inviteId', outbox_record."inviteId",
    'leaseVersion', p_expected_lease_version,
    'transitionRevision', outbox_record."transitionRevision" + 1,
    'providerAttemptKey', p_provider_attempt_key
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_complete_v1"(
  p_outbox_id TEXT,
  p_expected_lease_version INTEGER,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_outcome_code TEXT,
  p_provider_receipt_digest TEXT,
  p_terminal_ack_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  policy JSONB;
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record RECORD;
  invite_live BOOLEAN;
  next_status public."IdentityMailOutboxStatus";
  event_type TEXT;
  outcome_class TEXT;
  reason_code TEXT;
  next_available_at TIMESTAMP(3) WITH TIME ZONE;
  deliverable_until TIMESTAMP(3) WITH TIME ZONE;
  keep_receipt TEXT;
  keep_ack TEXT;
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
    RAISE EXCEPTION 'Identity mail completion input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO outbox_record
  FROM public."IdentityMailOutbox"
  WHERE "id" = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail outbox was not found'
      USING ERRCODE = 'P0002';
  END IF;

  policy :=
    public."identity_mail_delivery_worker_assert_v1"(
      outbox_record."tenantId"
    );
  now_at := pg_catalog.clock_timestamp();

  IF outbox_record."status" IS DISTINCT FROM
       'CLAIMED'::public."IdentityMailOutboxStatus"
     OR outbox_record."leaseVersion" IS DISTINCT FROM
       p_expected_lease_version
     OR outbox_record."leaseOwnerDigest" IS DISTINCT FROM
       p_lease_owner_digest
     OR outbox_record."leaseTokenDigest" IS DISTINCT FROM
       p_lease_token_digest
  THEN
    RAISE EXCEPTION 'Identity mail completion CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  PERFORM 1
  FROM public."UserInvite" AS target_invite
  WHERE target_invite."tenantId" = outbox_record."tenantId"
    AND target_invite."id" = outbox_record."inviteId"
  FOR SHARE OF target_invite;

  PERFORM 1
  FROM public."Tenant" AS target_tenant
  WHERE target_tenant."id" = outbox_record."tenantId"
  FOR SHARE OF target_tenant;

  PERFORM 1
  FROM public."IdentityEmailClaim" AS identity_claim
  WHERE identity_claim."emailCanonical" = (
      SELECT target_invite."email"
      FROM public."UserInvite" AS target_invite
      WHERE target_invite."tenantId" = outbox_record."tenantId"
        AND target_invite."id" = outbox_record."inviteId"
    )
  FOR SHARE OF identity_claim;

  SELECT LEAST(
    outbox_record."expiresAt",
    target_invite."expiresAt",
    target_tenant."trialEndsAt"
  )
  INTO deliverable_until
  FROM public."UserInvite" AS target_invite
  INNER JOIN public."IdentityEmailClaim" AS identity_claim
    ON identity_claim."emailCanonical" = target_invite."email"
   AND identity_claim."claimType" =
     'INVITE'::public."IdentityEmailClaimType"
   AND identity_claim."tenantId" = target_invite."tenantId"
   AND identity_claim."subjectId" = target_invite."id"
   AND identity_claim."revision" =
     target_invite."identityClaimRevision"
  INNER JOIN public."Tenant" AS target_tenant
    ON target_tenant."id" = target_invite."tenantId"
  WHERE target_invite."tenantId" = outbox_record."tenantId"
    AND target_invite."id" = outbox_record."inviteId"
    AND target_invite."tokenHash" = outbox_record."tokenHash"
    AND outbox_record."expiresAt" > now_at
    AND target_invite."acceptedAt" IS NULL
    AND target_invite."revokedAt" IS NULL
    AND target_invite."expiresAt" > now_at
    AND target_invite."email" IS NOT NULL
    AND pg_catalog.char_length(target_invite."email") BETWEEN 3 AND 320
    AND target_invite."email" =
      pg_catalog.lower(
        pg_catalog.btrim(target_invite."email") COLLATE "C"
      )
    AND (target_invite."email" COLLATE "C") ~ '^[!-~]+$'
    AND (target_invite."email" COLLATE "C") ~
      '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
    AND pg_catalog.char_length(
      pg_catalog.split_part(target_invite."email", '@', 1)
    ) BETWEEN 1 AND 64
    AND (
      pg_catalog.split_part(target_invite."email", '@', 1) COLLATE "C"
    ) !~ '(^\.|\.$|\.\.)'
    AND pg_catalog.char_length(
      pg_catalog.split_part(target_invite."email", '@', 2)
    ) BETWEEN 3 AND 253
    AND (
      pg_catalog.split_part(target_invite."email", '@', 2) COLLATE "C"
    ) ~
      '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND target_invite."role" = 'OWNER'::public."UserRole"
    AND target_invite."accessScope" =
      'NETWORK'::public."UserAccessScope"
    AND target_invite."customRoleId" IS NULL
    AND pg_catalog.cardinality(target_invite."storeIds") = 0
    AND target_tenant."status" =
      'ACTIVE'::public."TenantLifecycleStatus"
    AND target_tenant."customerStage" =
      'PILOT'::public."TenantCustomerStage"
    AND target_tenant."onboardingStatus" =
      'OWNER_INVITED'::public."TenantOnboardingStatus"
    AND target_tenant."trialStartsAt" <= now_at
    AND target_tenant."trialEndsAt" > now_at;
  invite_live := FOUND;

  IF outbox_record."providerAttemptKey" IS NULL THEN
    IF p_outcome_code NOT IN (
      'PRE_PROVIDER_RETRY',
      'PRE_PROVIDER_DEAD',
      'CANCELED'
    )
       OR outbox_record."leaseExpiresAt" <= now_at
    THEN
      RAISE EXCEPTION 'Identity mail pre-provider completion is invalid'
        USING ERRCODE = '40001';
    END IF;

    IF p_outcome_code = 'CANCELED' AND invite_live THEN
      RAISE EXCEPTION 'A live identity mail invite cannot be canceled'
        USING ERRCODE = '55000';
    END IF;

    IF NOT invite_live OR p_outcome_code = 'CANCELED' THEN
      next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
      event_type := 'CANCELED';
      outcome_class := 'CANCELED';
      reason_code := 'INVITE_NOT_DELIVERABLE';
    ELSIF p_outcome_code = 'PRE_PROVIDER_RETRY'
       AND outbox_record."attempts" <
         (policy ->> 'maxAttempts')::INTEGER
    THEN
      next_available_at :=
        now_at + pg_catalog.make_interval(
          secs => LEAST(
            (policy ->> 'maxRetrySeconds')::NUMERIC,
            (policy ->> 'baseRetrySeconds')::NUMERIC
              * pg_catalog.power(
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
      reason_code :=
        CASE
          WHEN outbox_record."attempts" >=
            (policy ->> 'maxAttempts')::INTEGER
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
      "secretCiphertext" =
        CASE
          WHEN next_status =
            'RETRY'::public."IdentityMailOutboxStatus"
          THEN "secretCiphertext"
          ELSE NULL
        END,
      "providerOutcomeClass" = outcome_class,
      "providerObservedAt" =
        CASE
          WHEN next_status =
            'RETRY'::public."IdentityMailOutboxStatus"
          THEN NULL
          ELSE now_at
        END,
      "providerReceiptDigest" = NULL,
      "terminalAckDigest" = NULL,
      "sentAt" = NULL,
      "terminalAt" =
        CASE
          WHEN next_status =
            'RETRY'::public."IdentityMailOutboxStatus"
          THEN NULL
          ELSE now_at
        END,
      "stateReasonCode" = reason_code,
      "updatedAt" = now_at
    WHERE "id" = p_outbox_id;
  ELSE
    IF p_outcome_code NOT IN (
      'PROVIDER_ACCEPTED',
      'PROVIDER_DEFINITIVE_NOT_SENT',
      'PROVIDER_AMBIGUOUS'
    )
       OR outbox_record."providerAcknowledgeUntil" <= now_at
       OR p_terminal_ack_digest IS NULL
       OR (
         p_outcome_code IN (
           'PROVIDER_ACCEPTED',
           'PROVIDER_DEFINITIVE_NOT_SENT'
         )
         AND p_provider_receipt_digest IS NULL
       )
    THEN
      RAISE EXCEPTION 'Identity mail provider completion is invalid'
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

    keep_receipt := p_provider_receipt_digest;
    keep_ack := p_terminal_ack_digest;

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
      "providerReceiptDigest" = keep_receipt,
      "terminalAckDigest" = keep_ack,
      "sentAt" =
        CASE
          WHEN next_status =
            'SENT'::public."IdentityMailOutboxStatus"
          THEN now_at
          ELSE NULL
        END,
      "terminalAt" = now_at,
      "stateReasonCode" = reason_code,
      "updatedAt" = now_at
    WHERE "id" = p_outbox_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'COMPLETE_INITIAL_OWNER_MAIL',
    'decision', next_status::TEXT,
    'outboxId', p_outbox_id,
    'leaseVersion', p_expected_lease_version,
    'transitionRevision', outbox_record."transitionRevision" + 1
  );
END;
$$;

CREATE FUNCTION public."identity_initial_owner_mail_reap_v1"(
  p_tenant_id TEXT,
  p_worker_config_digest TEXT,
  p_worker_actor_digest TEXT,
  p_batch_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record RECORD;
  policy JSONB;
  invite_live BOOLEAN;
  next_status public."IdentityMailOutboxStatus";
  event_type TEXT;
  reason_code TEXT;
  next_available_at TIMESTAMP(3) WITH TIME ZONE;
  deliverable_until TIMESTAMP(3) WITH TIME ZONE;
  processed_count INTEGER := 0;
BEGIN
  IF p_worker_config_digest IS NULL
     OR (p_worker_config_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_worker_actor_digest IS NULL
     OR (p_worker_actor_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_batch_limit IS NULL
     OR p_batch_limit NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION 'Identity mail reaper input is invalid'
      USING ERRCODE = '22023';
  END IF;

  policy :=
    public."identity_mail_delivery_worker_assert_v1"(p_tenant_id);
  IF p_worker_config_digest IS DISTINCT FROM
       (policy ->> 'providerAuthorityDigest')
  THEN
    RAISE EXCEPTION
      'Identity mail worker configuration is not enrolled for tenant'
      USING ERRCODE = '42501';
  END IF;

  now_at := pg_catalog.clock_timestamp();

  FOR outbox_record IN
    SELECT target_outbox.*
    FROM public."IdentityMailOutbox" AS target_outbox
    WHERE target_outbox."tenantId" = p_tenant_id
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
              AND target_outbox."attempts" >=
                (policy ->> 'maxAttempts')::INTEGER
            )
            OR NOT EXISTS (
              SELECT 1
              FROM public."UserInvite" AS target_invite
              INNER JOIN public."IdentityEmailClaim" AS identity_claim
                ON identity_claim."emailCanonical" = target_invite."email"
               AND identity_claim."claimType" =
                 'INVITE'::public."IdentityEmailClaimType"
               AND identity_claim."tenantId" = target_invite."tenantId"
               AND identity_claim."subjectId" = target_invite."id"
               AND identity_claim."revision" =
                 target_invite."identityClaimRevision"
              INNER JOIN public."Tenant" AS target_tenant
                ON target_tenant."id" = target_invite."tenantId"
              WHERE target_invite."tenantId" =
                  target_outbox."tenantId"
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
                AND target_invite."email" =
                  pg_catalog.lower(
                    pg_catalog.btrim(
                      target_invite."email"
                    ) COLLATE "C"
                  )
                AND (target_invite."email" COLLATE "C") ~ '^[!-~]+$'
                AND (target_invite."email" COLLATE "C") ~
                  '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
                AND pg_catalog.char_length(
                  pg_catalog.split_part(target_invite."email", '@', 1)
                ) BETWEEN 1 AND 64
                AND (
                  pg_catalog.split_part(
                    target_invite."email",
                    '@',
                    1
                  ) COLLATE "C"
                ) !~ '(^\.|\.$|\.\.)'
                AND pg_catalog.char_length(
                  pg_catalog.split_part(target_invite."email", '@', 2)
                ) BETWEEN 3 AND 253
                AND (
                  pg_catalog.split_part(
                    target_invite."email",
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
    ORDER BY
      COALESCE(
        target_outbox."providerAcknowledgeUntil",
        target_outbox."leaseExpiresAt",
        target_outbox."availableAt",
        target_outbox."expiresAt"
      ),
      target_outbox."id"
    FOR UPDATE OF target_outbox SKIP LOCKED
    LIMIT p_batch_limit
  LOOP
    next_available_at := NULL;
    deliverable_until := NULL;
    invite_live := false;

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
        "providerObservedAt" = now_at,
        "terminalAt" = now_at,
        "stateReasonCode" = reason_code,
        "updatedAt" = now_at
      WHERE "id" = outbox_record."id";
    ELSE
      PERFORM 1
      FROM public."UserInvite" AS target_invite
      WHERE target_invite."tenantId" = outbox_record."tenantId"
        AND target_invite."id" = outbox_record."inviteId"
      FOR SHARE OF target_invite;

      PERFORM 1
      FROM public."Tenant" AS target_tenant
      WHERE target_tenant."id" = outbox_record."tenantId"
      FOR SHARE OF target_tenant;

      PERFORM 1
      FROM public."IdentityEmailClaim" AS identity_claim
      WHERE identity_claim."emailCanonical" = (
          SELECT target_invite."email"
          FROM public."UserInvite" AS target_invite
          WHERE target_invite."tenantId" = outbox_record."tenantId"
            AND target_invite."id" = outbox_record."inviteId"
        )
      FOR SHARE OF identity_claim;

      SELECT LEAST(
        outbox_record."expiresAt",
        target_invite."expiresAt",
        target_tenant."trialEndsAt"
      )
      INTO deliverable_until
      FROM public."UserInvite" AS target_invite
      INNER JOIN public."IdentityEmailClaim" AS identity_claim
        ON identity_claim."emailCanonical" = target_invite."email"
       AND identity_claim."claimType" =
         'INVITE'::public."IdentityEmailClaimType"
       AND identity_claim."tenantId" = target_invite."tenantId"
       AND identity_claim."subjectId" = target_invite."id"
       AND identity_claim."revision" =
         target_invite."identityClaimRevision"
      INNER JOIN public."Tenant" AS target_tenant
        ON target_tenant."id" = target_invite."tenantId"
      WHERE target_invite."tenantId" = outbox_record."tenantId"
        AND target_invite."id" = outbox_record."inviteId"
        AND target_invite."tokenHash" = outbox_record."tokenHash"
        AND outbox_record."expiresAt" > now_at
        AND target_invite."acceptedAt" IS NULL
        AND target_invite."revokedAt" IS NULL
        AND target_invite."expiresAt" > now_at
        AND target_invite."email" IS NOT NULL
        AND pg_catalog.char_length(target_invite."email") BETWEEN 3 AND 320
        AND target_invite."email" =
          pg_catalog.lower(
            pg_catalog.btrim(target_invite."email") COLLATE "C"
          )
        AND (target_invite."email" COLLATE "C") ~ '^[!-~]+$'
        AND (target_invite."email" COLLATE "C") ~
          '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
        AND pg_catalog.char_length(
          pg_catalog.split_part(target_invite."email", '@', 1)
        ) BETWEEN 1 AND 64
        AND (
          pg_catalog.split_part(target_invite."email", '@', 1) COLLATE "C"
        ) !~ '(^\.|\.$|\.\.)'
        AND pg_catalog.char_length(
          pg_catalog.split_part(target_invite."email", '@', 2)
        ) BETWEEN 3 AND 253
        AND (
          pg_catalog.split_part(target_invite."email", '@', 2) COLLATE "C"
        ) ~
          '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
        AND target_invite."role" = 'OWNER'::public."UserRole"
        AND target_invite."accessScope" =
          'NETWORK'::public."UserAccessScope"
        AND target_invite."customRoleId" IS NULL
        AND pg_catalog.cardinality(target_invite."storeIds") = 0
        AND target_tenant."status" =
          'ACTIVE'::public."TenantLifecycleStatus"
        AND target_tenant."customerStage" =
          'PILOT'::public."TenantCustomerStage"
        AND target_tenant."onboardingStatus" =
          'OWNER_INVITED'::public."TenantOnboardingStatus"
        AND target_tenant."trialStartsAt" <= now_at
        AND target_tenant."trialEndsAt" > now_at;
      invite_live := FOUND;

      IF NOT invite_live THEN
        next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_CANCELED';
        reason_code := 'INVITE_NOT_DELIVERABLE';
      ELSIF outbox_record."status" =
          'RETRY'::public."IdentityMailOutboxStatus"
        AND outbox_record."attempts" >=
          (policy ->> 'maxAttempts')::INTEGER
      THEN
        next_status := 'DEAD'::public."IdentityMailOutboxStatus";
        event_type := 'REAP_DEAD';
        reason_code := 'ATTEMPT_BUDGET_EXHAUSTED';
      ELSIF outbox_record."status" IN (
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
      THEN
        IF outbox_record."availableAt" >= deliverable_until THEN
          next_status := 'CANCELED'::public."IdentityMailOutboxStatus";
          event_type := 'REAP_CANCELED';
          reason_code := 'RETRY_WINDOW_EXHAUSTED';
        ELSE
          CONTINUE;
        END IF;
      ELSE
        next_available_at :=
          now_at + pg_catalog.make_interval(
            secs => LEAST(
              (policy ->> 'maxRetrySeconds')::NUMERIC,
              (policy ->> 'baseRetrySeconds')::NUMERIC
                * pg_catalog.power(
                    2::NUMERIC,
                    GREATEST(outbox_record."attempts" - 1, 0)
                  )
            )::INTEGER
          );
        IF next_available_at < deliverable_until THEN
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
        "secretCiphertext" =
          CASE
            WHEN next_status =
              'RETRY'::public."IdentityMailOutboxStatus"
            THEN "secretCiphertext"
            ELSE NULL
          END,
        "providerOutcomeClass" =
          CASE
            WHEN next_status =
              'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
            WHEN next_status =
              'CANCELED'::public."IdentityMailOutboxStatus"
            THEN 'CANCELED'
            ELSE 'PRE_PROVIDER_FAILURE'
          END,
        "providerObservedAt" =
          CASE
            WHEN next_status =
              'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
            ELSE now_at
          END,
        "terminalAt" =
          CASE
            WHEN next_status =
              'RETRY'::public."IdentityMailOutboxStatus"
            THEN NULL
            ELSE now_at
          END,
        "stateReasonCode" = reason_code,
        "updatedAt" = now_at
      WHERE "id" = outbox_record."id";
    END IF;

    processed_count := processed_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REAP_INITIAL_OWNER_MAIL',
    'decision', 'COMPLETED',
    'processed', processed_count
  );
END;
$$;

CREATE FUNCTION
  public."identity_initial_owner_invite_delivery_assert_sent_v1"(
    p_tenant_id TEXT,
    p_invite_id TEXT,
    p_presented_token_hash TEXT
  )
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    p_tenant_id IS NOT NULL
    AND p_invite_id IS NOT NULL
    AND p_presented_token_hash IS NOT NULL
    AND (p_presented_token_hash COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND EXISTS (
      SELECT 1
      FROM public."UserInvite" AS target_invite
      INNER JOIN public."Tenant" AS target_tenant
        ON target_tenant."id" = target_invite."tenantId"
      INNER JOIN public."IdentityEmailClaim" AS identity_claim
        ON identity_claim."emailCanonical" = target_invite."email"
       AND identity_claim."claimType" =
         'INVITE'::public."IdentityEmailClaimType"
       AND identity_claim."tenantId" = target_invite."tenantId"
       AND identity_claim."subjectId" = target_invite."id"
       AND identity_claim."revision" =
         target_invite."identityClaimRevision"
      INNER JOIN public."IdentityMailOutbox" AS target_outbox
        ON target_outbox."tenantId" = target_invite."tenantId"
       AND target_outbox."inviteId" = target_invite."id"
       AND target_outbox."tokenHash" = target_invite."tokenHash"
      INNER JOIN public."IdentityMailDeliveryEvent" AS sent_event
        ON sent_event."tenantId" = target_outbox."tenantId"
       AND sent_event."outboxId" = target_outbox."id"
       AND sent_event."transitionRevision" =
         target_outbox."transitionRevision"
       AND sent_event."toStatus" =
         'SENT'::public."IdentityMailOutboxStatus"
       AND sent_event."eventType" IN (
         'PROVIDER_ACCEPTED',
         'RECONCILED_SENT'
       )
       AND (
         (
           sent_event."eventType" = 'PROVIDER_ACCEPTED'
           AND sent_event."actorDigest" IS NULL
         )
         OR (
           sent_event."eventType" = 'RECONCILED_SENT'
           AND sent_event."actorDigest" IS NOT NULL
         )
       )
      WHERE target_invite."tenantId" = p_tenant_id
        AND target_invite."id" = p_invite_id
        AND target_invite."tokenHash" = p_presented_token_hash
        AND target_invite."role" = 'OWNER'::public."UserRole"
        AND target_invite."accessScope" =
          'NETWORK'::public."UserAccessScope"
        AND target_invite."customRoleId" IS NULL
        AND pg_catalog.cardinality(target_invite."storeIds") = 0
        AND target_invite."acceptedAt" IS NULL
        AND target_invite."revokedAt" IS NULL
        AND target_invite."expiresAt" > pg_catalog.clock_timestamp()
        AND target_invite."email" IS NOT NULL
        AND target_tenant."status" =
          'ACTIVE'::public."TenantLifecycleStatus"
        AND target_tenant."customerStage" =
          'PILOT'::public."TenantCustomerStage"
        AND target_tenant."onboardingStatus" =
          'OWNER_INVITED'::public."TenantOnboardingStatus"
        AND target_tenant."trialStartsAt" <=
          pg_catalog.clock_timestamp()
        AND target_tenant."trialEndsAt" >
          pg_catalog.clock_timestamp()
        AND target_outbox."status" =
          'SENT'::public."IdentityMailOutboxStatus"
        AND target_outbox."expiresAt" > pg_catalog.clock_timestamp()
        AND target_outbox."secretCiphertext" IS NULL
        AND target_outbox."providerAttemptKey" IS NOT NULL
        AND target_outbox."sentAt" IS NOT NULL
        AND target_outbox."terminalAt" = target_outbox."sentAt"
    )
$$;

CREATE FUNCTION public."identity_initial_owner_mail_reconcile_v1"(
  p_outbox_id TEXT,
  p_expected_transition_revision BIGINT,
  p_resolution_code TEXT,
  p_evidence_digest TEXT,
  p_actor_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  now_at TIMESTAMP(3) WITH TIME ZONE;
  outbox_record RECORD;
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
    RAISE EXCEPTION 'Identity mail reconciliation input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO outbox_record
  FROM public."IdentityMailOutbox"
  WHERE "id" = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND
     OR outbox_record."status" IS DISTINCT FROM
       'RECONCILIATION_REQUIRED'::public."IdentityMailOutboxStatus"
     OR outbox_record."transitionRevision" IS DISTINCT FROM
       p_expected_transition_revision
     OR outbox_record."providerAttemptKey" IS NULL
  THEN
    RAISE EXCEPTION 'Identity mail reconciliation CAS is stale'
      USING ERRCODE = '40001';
  END IF;

  now_at := pg_catalog.clock_timestamp();

  IF p_resolution_code = 'SENT' THEN
    event_type := 'RECONCILED_SENT';
    next_status := 'SENT'::public."IdentityMailOutboxStatus";
  ELSE
    event_type := 'RECONCILED_DEAD';
    next_status := 'DEAD'::public."IdentityMailOutboxStatus";
  END IF;

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
    "providerOutcomeClass" =
      CASE
        WHEN next_status =
          'SENT'::public."IdentityMailOutboxStatus"
        THEN 'RESOLVED_SENT'
        ELSE 'RESOLVED_DEAD'
      END,
    "providerObservedAt" = now_at,
    "providerReceiptDigest" = COALESCE(
      "providerReceiptDigest",
      p_evidence_digest
    ),
    "terminalAckDigest" = p_evidence_digest,
    "sentAt" =
      CASE
        WHEN next_status =
          'SENT'::public."IdentityMailOutboxStatus"
        THEN now_at
        ELSE NULL
      END,
    "terminalAt" = now_at,
    "stateReasonCode" =
      CASE
        WHEN next_status =
          'SENT'::public."IdentityMailOutboxStatus"
        THEN NULL
        ELSE 'RECONCILED_NOT_SENT'
      END,
    "updatedAt" = now_at
  WHERE "id" = p_outbox_id;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'RECONCILE_INITIAL_OWNER_MAIL',
    'decision', next_status::TEXT,
    'outboxId', p_outbox_id,
    'transitionRevision', p_expected_transition_revision + 1,
    'actorDigest', p_actor_digest
  );
END;
$$;

COMMENT ON TABLE public."IdentityMailDeliveryTenantEnrollment" IS
  'Empty-by-default canary enrollment binding one tenant to one exact NOINHERIT worker session_user name and OID.';

COMMENT ON TABLE public."IdentityMailDeliveryEvent" IS
  'Append-only PII-free evidence for leased initial-owner mail delivery transitions.';

COMMENT ON TABLE public."IdentityMailOutbox" IS
  'Encrypted initial-owner mail outbox. CURRENT_176 permits only sealed lease/CAS/provider-marker transitions; application and worker roles retain zero direct table access.';

COMMENT ON COLUMN public."IdentityMailOutbox"."secretCiphertext" IS
  'AES-256-GCM envelope v1. It is required before provider marker and erased atomically when the provider marker commits or a pre-provider terminal state is recorded.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_claim_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'Worker-only canary claim. Uses exact role/OID enrollment and FOR UPDATE SKIP LOCKED; returns one encrypted payload without raw token.';

COMMENT ON FUNCTION
  public."identity_initial_owner_mail_provider_mark_v1"(
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT
  ) IS
  'Worker-only CAS provider marker. Erases ciphertext in the marker transaction before any SMTP network call.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_complete_v1"(
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'Worker-only bounded completion. Marked ambiguity is quarantined and can never return to automatic retry.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_reap_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'Worker-only lease reaper. Unmarked claims may retry; marked claims can only enter reconciliation.';

COMMENT ON FUNCTION
  public."identity_initial_owner_invite_delivery_assert_sent_v1"(
    TEXT,
    TEXT,
    TEXT
  ) IS
  'PII-free application assertion for one live initial OWNER invite with exact SENT terminal evidence.';

COMMENT ON FUNCTION public."identity_initial_owner_mail_reconcile_v1"(
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT
) IS
  'Owner-only reconciliation of a quarantined provider marker. No runtime grant is installed by migration.';

REVOKE ALL
ON FUNCTION public."identity_mail_delivery_event_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_delivery_event_truncate_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_delivery_enrollment_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public."identity_mail_delivery_enrollment_truncate_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_outbox_delivery_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_delivery_event_append_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public."identity_initial_owner_invite_accept_sent_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_mail_delivery_worker_assert_v1"(TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_initial_owner_mail_claim_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_initial_owner_mail_provider_mark_v1"(
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_initial_owner_mail_complete_v1"(
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_initial_owner_mail_reap_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public."identity_initial_owner_invite_delivery_assert_sent_v1"(
    TEXT,
    TEXT,
    TEXT
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."identity_initial_owner_mail_reconcile_v1"(
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON TABLE public."IdentityMailDeliveryTenantEnrollment"
FROM PUBLIC;

REVOKE ALL
ON TABLE public."IdentityMailDeliveryEvent"
FROM PUBLIC;

REVOKE ALL
ON TABLE public."IdentityMailOutbox"
FROM PUBLIC;

DO $postcondition$
DECLARE
  labels TEXT[];
  delivery_column_count INTEGER;
  event_column_count INTEGER;
  target_function_count INTEGER;
  invalid_function_catalog_count INTEGER;
  invalid_trigger_catalog_count INTEGER;
  identity_claim_constraint_count INTEGER;
  unsafe_relation_acl_count INTEGER;
  unsafe_column_acl_count INTEGER;
  unsafe_function_acl_count INTEGER;
  active_enrollment_count INTEGER;
  event_count INTEGER;
  unexpected_outbox_count INTEGER;
  migration_owner_oid OID;
BEGIN
  SELECT pg_catalog.array_agg(
    enum_value.enumlabel
    ORDER BY enum_value.enumsortorder
  )
  INTO labels
  FROM pg_catalog.pg_enum AS enum_value
  INNER JOIN pg_catalog.pg_type AS enum_type
    ON enum_type.oid = enum_value.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'IdentityMailOutboxStatus';

  IF labels IS DISTINCT FROM ARRAY[
    'HOLD',
    'PENDING',
    'CLAIMED',
    'RETRY',
    'SENT',
    'DEAD',
    'CANCELED',
    'RECONCILIATION_REQUIRED'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'CURRENT_176 delivery enum postcondition failed'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO delivery_column_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'IdentityMailOutbox'
    AND attribute.attname IN (
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
      'ciphertextClearedAt',
      'sentAt',
      'terminalAt',
      'stateReasonCode',
      'updatedAt'
    )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  IF delivery_column_count <> 22 THEN
    RAISE EXCEPTION 'CURRENT_176 delivery columns are incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO event_column_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'IdentityMailDeliveryEvent'
    AND attribute.attnum > 0
    AND attribute.attisdropped = false;

  IF event_column_count <> 22
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       INNER JOIN pg_catalog.pg_class AS relation
         ON relation.oid = attribute.attrelid
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'IdentityMailDeliveryEvent'
         AND attribute.attname = 'actorDigest'
         AND attribute.attnum > 0
         AND attribute.attisdropped = false
         AND attribute.attnotnull = false
         AND pg_catalog.format_type(
           attribute.atttypid,
           attribute.atttypmod
         ) = 'character(64)'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_176 durable delivery actor provenance is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'IdentityMailOutbox';

  IF migration_owner_oid IS NULL THEN
    RAISE EXCEPTION 'CURRENT_176 migration owner is unavailable'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO target_function_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.proname IN (
      'identity_mail_delivery_event_guard_v1',
      'identity_mail_delivery_event_truncate_guard_v1',
      'identity_mail_delivery_enrollment_guard_v1',
      'identity_mail_delivery_enrollment_truncate_guard_v1',
      'identity_mail_outbox_delivery_guard_v1',
      'identity_mail_delivery_event_append_v1',
      'identity_initial_owner_invite_accept_sent_guard_v1',
      'identity_mail_delivery_worker_assert_v1',
      'identity_initial_owner_mail_claim_v1',
      'identity_initial_owner_mail_provider_mark_v1',
      'identity_initial_owner_mail_complete_v1',
      'identity_initial_owner_mail_reap_v1',
      'identity_initial_owner_invite_delivery_assert_sent_v1',
      'identity_initial_owner_mail_reconcile_v1'
    );

  IF target_function_count <> 14 THEN
    RAISE EXCEPTION 'CURRENT_176 delivery routine catalog is incomplete'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    signature,
    security_definer,
    volatility,
    language_name,
    result_type
  ) AS (
    VALUES
      (
        'public."identity_mail_delivery_event_guard_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_delivery_event_truncate_guard_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_delivery_enrollment_guard_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_delivery_enrollment_truncate_guard_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_outbox_delivery_guard_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_delivery_event_append_v1"()',
        false, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_initial_owner_invite_accept_sent_guard_v1"()',
        true, 'v', 'plpgsql', 'trigger'
      ),
      (
        'public."identity_mail_delivery_worker_assert_v1"(text)',
        true, 'v', 'plpgsql', 'jsonb'
      ),
      (
        'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
        true, 'v', 'plpgsql', 'jsonb'
      ),
      (
        'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
        true, 'v', 'plpgsql', 'jsonb'
      ),
      (
        'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
        true, 'v', 'plpgsql', 'jsonb'
      ),
      (
        'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
        true, 'v', 'plpgsql', 'jsonb'
      ),
      (
        'public."identity_initial_owner_invite_delivery_assert_sent_v1"(text,text,text)',
        true, 's', 'sql', 'boolean'
      ),
      (
        'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
        true, 'v', 'plpgsql', 'jsonb'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_function_catalog_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid IS NULL
     OR routine.proowner IS DISTINCT FROM migration_owner_oid
     OR routine.prosecdef IS DISTINCT FROM expected.security_definer
     OR routine.provolatile IS DISTINCT FROM expected.volatility::"char"
     OR language.lanname IS DISTINCT FROM expected.language_name
     OR pg_catalog.format_type(routine.prorettype, NULL)
       IS DISTINCT FROM expected.result_type
     OR routine.prokind IS DISTINCT FROM 'f'::"char"
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[];

  IF invalid_function_catalog_count <> 0 THEN
    RAISE EXCEPTION
      'CURRENT_176 delivery routine catalog metadata is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(
    relation_name,
    trigger_name,
    function_name,
    trigger_type,
    update_column
  ) AS (
    VALUES
      (
        'IdentityMailDeliveryEvent',
        'IdentityMailDeliveryEvent_row_guard_trigger',
        'identity_mail_delivery_event_guard_v1',
        31,
        NULL::TEXT
      ),
      (
        'IdentityMailDeliveryEvent',
        'IdentityMailDeliveryEvent_truncate_guard_trigger',
        'identity_mail_delivery_event_truncate_guard_v1',
        34,
        NULL::TEXT
      ),
      (
        'IdentityMailDeliveryTenantEnrollment',
        'IdentityMailDeliveryTenantEnrollment_row_guard_trigger',
        'identity_mail_delivery_enrollment_guard_v1',
        27,
        NULL::TEXT
      ),
      (
        'IdentityMailDeliveryTenantEnrollment',
        'IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger',
        'identity_mail_delivery_enrollment_truncate_guard_v1',
        34,
        NULL::TEXT
      ),
      (
        'IdentityMailOutbox',
        'IdentityMailOutbox_delivery_guard_trigger',
        'identity_mail_outbox_delivery_guard_v1',
        31,
        NULL::TEXT
      ),
      (
        'IdentityMailOutbox',
        'IdentityMailOutbox_delivery_event_trigger',
        'identity_mail_delivery_event_append_v1',
        17,
        NULL::TEXT
      ),
      (
        'UserInvite',
        'UserInvite_initial_owner_delivery_sent_guard_trigger',
        'identity_initial_owner_invite_accept_sent_guard_v1',
        19,
        'acceptedAt'
      ),
      (
        'UserInvite',
        'UserInvite_initial_owner_unaccepted_insert_guard_trigger',
        'identity_initial_owner_invite_accept_sent_guard_v1',
        7,
        NULL::TEXT
      )
  ),
  public_relations AS (
    SELECT relation.*
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_trigger_catalog_count
  FROM expected
  LEFT JOIN public_relations AS relation
    ON relation.relname = expected.relation_name
  LEFT JOIN pg_catalog.pg_trigger AS target_trigger
    ON target_trigger.tgrelid = relation.oid
   AND target_trigger.tgname = expected.trigger_name
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = target_trigger.tgfoid
  WHERE target_trigger.oid IS NULL
     OR target_trigger.tgisinternal IS DISTINCT FROM false
     OR target_trigger.tgenabled IS DISTINCT FROM 'O'::"char"
     OR target_trigger.tgtype IS DISTINCT FROM expected.trigger_type::SMALLINT
     OR routine.proname IS DISTINCT FROM expected.function_name
     OR routine.proowner IS DISTINCT FROM migration_owner_oid
     OR (
       expected.update_column IS NULL
       AND target_trigger.tgattr::TEXT IS DISTINCT FROM ''
     )
     OR (
       expected.update_column IS NOT NULL
       AND target_trigger.tgattr::TEXT IS DISTINCT FROM (
         SELECT attribute.attnum::TEXT
         FROM pg_catalog.pg_attribute AS attribute
         WHERE attribute.attrelid = relation.oid
           AND attribute.attname = expected.update_column
           AND attribute.attnum > 0
           AND attribute.attisdropped = false
       )
     );

  IF invalid_trigger_catalog_count <> 0
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger AS target_trigger
       INNER JOIN pg_catalog.pg_class AS relation
         ON relation.oid = target_trigger.tgrelid
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'IdentityMailOutbox'
         AND target_trigger.tgname =
           'IdentityMailOutbox_release_guard_trigger'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_176 delivery trigger catalog metadata is unsafe'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO identity_claim_constraint_count
  FROM pg_catalog.pg_constraint AS target_constraint
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = target_constraint.conrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'IdentityEmailClaim'
    AND target_constraint.conname =
      'IdentityEmailClaim_email_canonical_check'
    AND target_constraint.contype = 'c'
    AND target_constraint.convalidated = true
    AND pg_catalog.pg_get_constraintdef(target_constraint.oid)
      LIKE '%split_part%'
    AND pg_catalog.pg_get_constraintdef(target_constraint.oid)
      LIKE '%<= 64%'
    AND pg_catalog.pg_get_constraintdef(target_constraint.oid)
      LIKE '%<= 253%'
    AND pg_catalog.pg_get_constraintdef(target_constraint.oid)
      LIKE '%{0,61}%';

  IF identity_claim_constraint_count <> 1 THEN
    RAISE EXCEPTION
      'CURRENT_176 identity email canonical constraint is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
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
      'IdentityMailOutbox',
      'IdentityMailDeliveryTenantEnrollment',
      'IdentityMailDeliveryEvent'
    )
    AND privilege.grantee <> relation.relowner;

  SELECT pg_catalog.count(*)
  INTO unsafe_column_acl_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'IdentityMailOutbox',
      'IdentityMailDeliveryTenantEnrollment',
      'IdentityMailDeliveryEvent'
    )
    AND attribute.attnum > 0
    AND attribute.attisdropped = false
    AND privilege.grantee <> relation.relowner;

  SELECT pg_catalog.count(*)
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
      'identity_mail_delivery_event_guard_v1',
      'identity_mail_delivery_event_truncate_guard_v1',
      'identity_mail_delivery_enrollment_guard_v1',
      'identity_mail_delivery_enrollment_truncate_guard_v1',
      'identity_mail_outbox_delivery_guard_v1',
      'identity_mail_delivery_event_append_v1',
      'identity_initial_owner_invite_accept_sent_guard_v1',
      'identity_mail_delivery_worker_assert_v1',
      'identity_initial_owner_mail_claim_v1',
      'identity_initial_owner_mail_provider_mark_v1',
      'identity_initial_owner_mail_complete_v1',
      'identity_initial_owner_mail_reap_v1',
      'identity_initial_owner_invite_delivery_assert_sent_v1',
      'identity_initial_owner_mail_reconcile_v1'
    )
    AND privilege.grantee <> routine.proowner;

  IF unsafe_relation_acl_count <> 0
     OR unsafe_column_acl_count <> 0
     OR unsafe_function_acl_count <> 0
  THEN
    RAISE EXCEPTION
      'CURRENT_176 inherited unsafe default privileges'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)
  INTO active_enrollment_count
  FROM public."IdentityMailDeliveryTenantEnrollment"
  WHERE "enabled" = true;

  SELECT pg_catalog.count(*)
  INTO event_count
  FROM public."IdentityMailDeliveryEvent";

  SELECT pg_catalog.count(*)
  INTO unexpected_outbox_count
  FROM public."IdentityMailOutbox";

  IF active_enrollment_count <> 0
     OR event_count <> 0
     OR unexpected_outbox_count <> 0
  THEN
    RAISE EXCEPTION
      'CURRENT_176 must remain dormant after migration'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
