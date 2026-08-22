-- CURRENT189: external tenant employee invite + durable mail boundary.
-- NONCANONICAL / NOT_DEPLOYABLE / NO RUNTIME GRANTS / NO PROVIDER AUTHORITY.
-- The INITIAL_OWNER_INVITE tables and v1/v2 RPCs are deliberately untouched.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

CREATE TABLE public."IdentityEmployeeInviteIssueCommandV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operation" VARCHAR(32) NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "previousInviteId" TEXT,
  "reservationSubjectId" TEXT,
  "deliveryLocator" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "messageKey" TEXT NOT NULL,
  "role" public."UserRole" NOT NULL,
  "customRoleId" TEXT,
  "accessScope" public."UserAccessScope" NOT NULL,
  "storeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "claimRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "createdTransactionId" XID8 NOT NULL DEFAULT pg_catalog.pg_current_xact_id(),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_operation_check" CHECK (
    ("operation" = 'ISSUE_EMPLOYEE_INVITE'
      AND "previousInviteId" IS NULL
      AND "reservationSubjectId" IS NOT NULL)
    OR
    ("operation" = 'REISSUE_EMPLOYEE_INVITE'
      AND "previousInviteId" IS NOT NULL
      AND "reservationSubjectId" IS NULL)
  ),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_role_check" CHECK (
    "role" <> 'OWNER'::public."UserRole"
  ),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_scope_check" CHECK (
    ("accessScope" = 'NETWORK'::public."UserAccessScope"
      AND pg_catalog.cardinality("storeIds") = 0)
    OR
    ("accessScope" = 'STORES'::public."UserAccessScope"
      AND pg_catalog.cardinality("storeIds") BETWEEN 1 AND 100)
  ),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_digest_check" CHECK (
    "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "tokenHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_claim_revision_check"
    CHECK ("claimRevision" >= 1)
);

CREATE TABLE public."IdentityEmployeeMailOutboxV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issueCommandId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "deliveryLocator" TEXT NOT NULL,
  "template" VARCHAR(32) NOT NULL DEFAULT 'EMPLOYEE_USER_INVITE',
  "messageKey" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "tokenDigestVersion" VARCHAR(16) NOT NULL DEFAULT 'sha256-v1',
  "secretCiphertext" BYTEA,
  "envelopeVersion" INTEGER NOT NULL DEFAULT 1,
  "keyVersion" VARCHAR(16) NOT NULL,
  "aadEnvironment" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "availableAt" TIMESTAMP(3) WITH TIME ZONE,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "transitionRevision" BIGINT NOT NULL DEFAULT 0,
  "leaseOwnerDigest" CHAR(64),
  "leaseTokenDigest" CHAR(64),
  "claimedAt" TIMESTAMP(3) WITH TIME ZONE,
  "leaseExpiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "providerAttemptKey" VARCHAR(96),
  "providerAuthorityDigest" CHAR(64),
  "providerAttemptedAt" TIMESTAMP(3) WITH TIME ZONE,
  "providerAcknowledgeUntil" TIMESTAMP(3) WITH TIME ZONE,
  "messageIdDigest" CHAR(64),
  "providerReceiptDigest" CHAR(64),
  "terminalAckDigest" CHAR(64),
  "ciphertextClearedAt" TIMESTAMP(3) WITH TIME ZONE,
  "sentAt" TIMESTAMP(3) WITH TIME ZONE,
  "terminalAt" TIMESTAMP(3) WITH TIME ZONE,
  "stateReasonCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_template_check" CHECK (
    "template" = 'EMPLOYEE_USER_INVITE'
  ),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_digest_check" CHECK (
    "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "tokenHash" ~ '^[a-f0-9]{64}$'
    AND ("leaseOwnerDigest" IS NULL OR "leaseOwnerDigest" ~ '^[a-f0-9]{64}$')
    AND ("leaseTokenDigest" IS NULL OR "leaseTokenDigest" ~ '^[a-f0-9]{64}$')
    AND ("providerAuthorityDigest" IS NULL OR "providerAuthorityDigest" ~ '^[a-f0-9]{64}$')
    AND ("messageIdDigest" IS NULL OR "messageIdDigest" ~ '^[a-f0-9]{64}$')
    AND ("providerReceiptDigest" IS NULL OR "providerReceiptDigest" ~ '^[a-f0-9]{64}$')
    AND ("terminalAckDigest" IS NULL OR "terminalAckDigest" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_envelope_check" CHECK (
    "tokenDigestVersion" = 'sha256-v1'
    AND "envelopeVersion" = 1
    AND pg_catalog.char_length("keyVersion") BETWEEN 1 AND 16
    AND pg_catalog.char_length("aadEnvironment") BETWEEN 1 AND 64
  ),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_attempt_check" CHECK (
    "attempts" BETWEEN 0 AND 20
    AND "leaseVersion" >= 0
    AND "transitionRevision" >= 0
  ),
  CONSTRAINT "IdentityEmployeeMailOutboxV1_state_check" CHECK (
    ("status" IN ('PENDING', 'RETRY')
      AND "secretCiphertext" IS NOT NULL
      AND pg_catalog.octet_length("secretCiphertext") = 71
      AND "availableAt" IS NOT NULL
      AND "leaseOwnerDigest" IS NULL
      AND "leaseTokenDigest" IS NULL
      AND "leaseExpiresAt" IS NULL
      AND "providerAttemptKey" IS NULL
      AND "providerReceiptDigest" IS NULL
      AND "terminalAckDigest" IS NULL
      AND "ciphertextClearedAt" IS NULL
      AND "terminalAt" IS NULL)
    OR
    ("status" = 'CLAIMED'
      AND "leaseOwnerDigest" IS NOT NULL
      AND "leaseTokenDigest" IS NOT NULL
      AND "claimedAt" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
      AND "terminalAt" IS NULL
      AND (
        ("providerAttemptKey" IS NULL
          AND "providerReceiptDigest" IS NULL
          AND "terminalAckDigest" IS NULL
          AND "secretCiphertext" IS NOT NULL
          AND pg_catalog.octet_length("secretCiphertext") = 71
          AND "ciphertextClearedAt" IS NULL)
        OR
        ("providerAttemptKey" IS NOT NULL
          AND "providerAuthorityDigest" IS NOT NULL
          AND "providerAttemptedAt" IS NOT NULL
          AND "providerAcknowledgeUntil" IS NOT NULL
          AND "messageIdDigest" IS NOT NULL
          AND "providerReceiptDigest" IS NULL
          AND "terminalAckDigest" IS NULL
          AND "secretCiphertext" IS NULL
          AND "ciphertextClearedAt" IS NOT NULL)
      ))
    OR
    ("status" = 'SENT'
      AND "providerAttemptKey" IS NOT NULL
      AND "providerReceiptDigest" IS NOT NULL
      AND "terminalAckDigest" IS NOT NULL
      AND "secretCiphertext" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "sentAt" IS NOT NULL
      AND "terminalAt" IS NOT NULL)
    OR
    ("status" = 'RECONCILIATION_REQUIRED'
      AND "terminalAckDigest" IS NOT NULL
      AND "secretCiphertext" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "terminalAt" IS NOT NULL)
    OR
    ("status" IN ('DEAD', 'CANCELED')
      AND "secretCiphertext" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "terminalAt" IS NOT NULL)
  )
);

CREATE TABLE public."IdentityEmployeeInviteRevokeCommandV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "inviteId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "releasedClaimRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "createdTransactionId" XID8 NOT NULL DEFAULT pg_catalog.pg_current_xact_id(),
  CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_digest_check" CHECK (
    "requestDigest" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_revision_check" CHECK (
    "releasedClaimRevision" >= 1
  )
);

CREATE TABLE public."IdentityEmployeeMailDeliveryEventV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "eventType" VARCHAR(48) NOT NULL,
  "transitionRevision" BIGINT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "eventDigest" CHAR(64) NOT NULL,
  "reasonCode" VARCHAR(64),
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "transactionId" XID8 NOT NULL DEFAULT pg_catalog.pg_current_xact_id(),
  CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_type_check" CHECK (
    "eventType" IN (
      'PENDING', 'CLAIMED', 'PROVIDER_MARKED', 'RETRY', 'SENT', 'DEAD',
      'CANCELED', 'RECONCILIATION_REQUIRED'
    )
  ),
  CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_digest_check" CHECK (
    "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "eventDigest" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_revision_check" CHECK (
    "transitionRevision" >= 0
  )
);

CREATE TABLE public."IdentityEmployeeMailTenantEnrollmentV1" (
  "tenantId" TEXT NOT NULL,
  "workerRoleName" VARCHAR(63) NOT NULL,
  "workerRoleOid" OID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "state" VARCHAR(16) NOT NULL DEFAULT 'DRAINING',
  "stateRevision" BIGINT NOT NULL DEFAULT 1,
  "policyRevision" INTEGER NOT NULL DEFAULT 1,
  "providerAuthorityDigest" CHAR(64) NOT NULL,
  "maxAttempts" INTEGER NOT NULL,
  "leaseSeconds" INTEGER NOT NULL,
  "acknowledgeSeconds" INTEGER NOT NULL,
  "baseRetrySeconds" INTEGER NOT NULL,
  "maxRetrySeconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "IdentityEmployeeMailTenantEnrollmentV1_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "IdentityEmployeeMailTenantEnrollmentV1_state_check" CHECK (
    "state" IN ('ACTIVE', 'DRAINING')
  ),
  CONSTRAINT "IdentityEmployeeMailTenantEnrollmentV1_policy_check" CHECK (
    "stateRevision" >= 1
    AND "policyRevision" >= 1
    AND "providerAuthorityDigest" ~ '^[a-f0-9]{64}$'
    AND "maxAttempts" BETWEEN 1 AND 20
    AND "leaseSeconds" BETWEEN 30 AND 900
    AND "acknowledgeSeconds" BETWEEN 10 AND 900
    AND "baseRetrySeconds" BETWEEN 1 AND 3600
    AND "maxRetrySeconds" BETWEEN "baseRetrySeconds" AND 86400
  )
);

CREATE UNIQUE INDEX "identity_employee_issue_actor_request_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" (
  "tenantId", "actorUserId", "requestId"
);
CREATE UNIQUE INDEX "identity_employee_issue_tenant_id_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" ("tenantId", "id");
CREATE UNIQUE INDEX "identity_employee_issue_invite_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" ("tenantId", "inviteId");
CREATE UNIQUE INDEX "identity_employee_issue_outbox_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" ("tenantId", "outboxId");
CREATE UNIQUE INDEX "identity_employee_issue_message_key_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" ("messageKey");
CREATE UNIQUE INDEX "identity_employee_issue_delivery_locator_uidx"
ON public."IdentityEmployeeInviteIssueCommandV1" (
  "tenantId", "deliveryLocator"
);
CREATE UNIQUE INDEX "identity_employee_outbox_issue_uidx"
ON public."IdentityEmployeeMailOutboxV1" ("tenantId", "issueCommandId");
CREATE UNIQUE INDEX "identity_employee_outbox_tenant_id_uidx"
ON public."IdentityEmployeeMailOutboxV1" ("tenantId", "id");
CREATE UNIQUE INDEX "identity_employee_outbox_invite_uidx"
ON public."IdentityEmployeeMailOutboxV1" ("tenantId", "inviteId");
CREATE UNIQUE INDEX "identity_employee_outbox_message_key_uidx"
ON public."IdentityEmployeeMailOutboxV1" ("messageKey");
CREATE UNIQUE INDEX "identity_employee_outbox_provider_attempt_uidx"
ON public."IdentityEmployeeMailOutboxV1" ("providerAttemptKey")
WHERE "providerAttemptKey" IS NOT NULL;
CREATE INDEX "identity_employee_outbox_ready_idx"
ON public."IdentityEmployeeMailOutboxV1" (
  "tenantId", "status", "availableAt", "createdAt", "id"
);
CREATE INDEX "identity_employee_outbox_lease_idx"
ON public."IdentityEmployeeMailOutboxV1" ("leaseExpiresAt", "id")
WHERE "status" = 'CLAIMED';
CREATE UNIQUE INDEX "identity_employee_revoke_actor_request_uidx"
ON public."IdentityEmployeeInviteRevokeCommandV1" (
  "tenantId", "actorUserId", "requestId"
);
CREATE UNIQUE INDEX "identity_employee_delivery_event_revision_uidx"
ON public."IdentityEmployeeMailDeliveryEventV1" (
  "tenantId", "outboxId", "transitionRevision"
);

ALTER TABLE public."IdentityEmployeeInviteIssueCommandV1"
  ADD CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_actor_fkey"
  FOREIGN KEY ("tenantId", "actorUserId")
  REFERENCES public."User"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeInviteIssueCommandV1_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."IdentityEmployeeMailOutboxV1"
  ADD CONSTRAINT "IdentityEmployeeMailOutboxV1_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeMailOutboxV1_issue_fkey"
  FOREIGN KEY ("tenantId", "issueCommandId")
  REFERENCES public."IdentityEmployeeInviteIssueCommandV1"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeMailOutboxV1_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."IdentityEmployeeInviteRevokeCommandV1"
  ADD CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_actor_fkey"
  FOREIGN KEY ("tenantId", "actorUserId")
  REFERENCES public."User"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeInviteRevokeCommandV1_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityEmployeeMailOutboxV1"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."IdentityEmployeeMailDeliveryEventV1"
  ADD CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_outbox_fkey"
  FOREIGN KEY ("tenantId", "outboxId")
  REFERENCES public."IdentityEmployeeMailOutboxV1"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "IdentityEmployeeMailDeliveryEventV1_invite_fkey"
  FOREIGN KEY ("tenantId", "inviteId")
  REFERENCES public."UserInvite"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."IdentityEmployeeMailTenantEnrollmentV1"
  ADD CONSTRAINT "IdentityEmployeeMailTenantEnrollmentV1_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- All candidate relations use one transaction-local tenant GUC. FORCE RLS
-- prevents even a future table grant from becoming a cross-tenant bypass.
ALTER TABLE public."IdentityEmployeeInviteIssueCommandV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityEmployeeInviteIssueCommandV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_employee_issue_tenant_policy"
ON public."IdentityEmployeeInviteIssueCommandV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
);

ALTER TABLE public."IdentityEmployeeMailOutboxV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityEmployeeMailOutboxV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_employee_outbox_tenant_policy"
ON public."IdentityEmployeeMailOutboxV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
);

ALTER TABLE public."IdentityEmployeeInviteRevokeCommandV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityEmployeeInviteRevokeCommandV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_employee_revoke_tenant_policy"
ON public."IdentityEmployeeInviteRevokeCommandV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
);

ALTER TABLE public."IdentityEmployeeMailDeliveryEventV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityEmployeeMailDeliveryEventV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_employee_event_tenant_policy"
ON public."IdentityEmployeeMailDeliveryEventV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
);

ALTER TABLE public."IdentityEmployeeMailTenantEnrollmentV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IdentityEmployeeMailTenantEnrollmentV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "identity_employee_enrollment_tenant_policy"
ON public."IdentityEmployeeMailTenantEnrollmentV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.employee_invite_tenant_id', true
  )
);

CREATE FUNCTION public."identity_employee_invite_actor_assert_current189_v1"(
  p_tenant_id TEXT,
  p_actor_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_actor_user_id IS NULL
     OR p_actor_user_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Employee invite actor binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.employee_invite_tenant_id', p_tenant_id, true
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-tenant:v1:' || p_tenant_id,
      180
    )
  );

  -- FOR UPDATE on parent rows also fences concurrent FK-backed inserts into
  -- entitlement, role-override and actor-store authority while this command
  -- is being admitted. All rows are acquired in one deterministic order.
  PERFORM 1
  FROM public."Tenant" AS tenant_lock
  WHERE tenant_lock."id" = p_tenant_id
  FOR UPDATE;
  PERFORM 1
  FROM public."TenantModuleEntitlement" AS entitlement_lock
  WHERE entitlement_lock."tenantId" = p_tenant_id
  ORDER BY entitlement_lock."id" COLLATE "C"
  FOR UPDATE;
  PERFORM 1
  FROM public."User" AS actor_lock
  WHERE actor_lock."tenantId" = p_tenant_id
    AND actor_lock."id" = p_actor_user_id
  FOR UPDATE;
  PERFORM 1
  FROM public."UserRoleOverride" AS override_lock
  WHERE override_lock."tenantId" = p_tenant_id
    AND override_lock."role" = 'OWNER'::public."UserRole"
  ORDER BY override_lock."id" COLLATE "C"
  FOR UPDATE;
  PERFORM 1
  FROM public."UserStoreAccess" AS actor_store_lock
  WHERE actor_store_lock."userId" = p_actor_user_id
  ORDER BY actor_store_lock."storeId" COLLATE "C"
  FOR UPDATE;
  server_now := pg_catalog.clock_timestamp();

  IF NOT EXISTS (
    SELECT 1
    FROM public."Tenant" AS tenant
    WHERE tenant."id" = p_tenant_id
      AND tenant."status"::TEXT = 'ACTIVE'
      AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
      AND tenant."onboardingStatus"::TEXT IN (
        'ONBOARDING', 'READY', 'ACTIVE'
      )
      AND tenant."trialStartsAt" IS NOT NULL
      AND tenant."trialStartsAt" <= server_now
      AND tenant."trialEndsAt" IS NOT NULL
      AND tenant."trialEndsAt" > server_now
      AND EXISTS (
        SELECT 1
        FROM public."TenantModuleEntitlement" AS entitlement
        WHERE entitlement."tenantId" = tenant."id"
          AND entitlement."module"::TEXT = 'USERS_ROLES'
          AND entitlement."profileRevision" =
            tenant."entitlementProfileRevision"
          AND entitlement."readEnabled" = TRUE
          AND entitlement."writeEnabled" = TRUE
          AND (
            entitlement."validFrom" IS NULL
            OR entitlement."validFrom" <= server_now
          )
          AND (
            entitlement."validUntil" IS NULL
            OR entitlement."validUntil" > server_now
          )
      )
  ) THEN
    RAISE EXCEPTION 'Employee invite tenant is not admitted'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."User" AS actor
    WHERE actor."id" = p_actor_user_id
      AND actor."tenantId" = p_tenant_id
      AND actor."isActive" = TRUE
      AND actor."isPlatformAdmin" = FALSE
      AND actor."role" = 'OWNER'::public."UserRole"
      AND actor."customRoleId" IS NULL
      AND actor."accessScope" = 'NETWORK'::public."UserAccessScope"
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public."UserRoleOverride" AS role_override
          WHERE role_override."tenantId" = actor."tenantId"
            AND role_override."role" = 'OWNER'::public."UserRole"
        )
        OR EXISTS (
          SELECT 1
          FROM public."UserRoleOverride" AS role_override
          WHERE role_override."tenantId" = actor."tenantId"
            AND role_override."role" = 'OWNER'::public."UserRole"
            AND 'manage_users' = ANY(role_override."permissions")
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public."UserStoreAccess" AS actor_store
        WHERE actor_store."userId" = actor."id"
      )
  ) THEN
    RAISE EXCEPTION 'Fresh NETWORK OWNER authority is required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public."identity_employee_invite_deliver_current189_v1"(
  p_operation TEXT,
  p_command_id TEXT,
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_request_id TEXT,
  p_request_digest TEXT,
  p_previous_invite_id TEXT,
  p_reservation_subject_id TEXT,
  p_delivery_locator TEXT,
  p_invite_id TEXT,
  p_outbox_id TEXT,
  p_message_key TEXT,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_custom_role_id TEXT,
  p_access_scope TEXT,
  p_store_ids TEXT[],
  p_token_hash TEXT,
  p_secret_ciphertext BYTEA,
  p_envelope_version INTEGER,
  p_key_version TEXT,
  p_aad_environment TEXT,
  p_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  canonical_email TEXT;
  reservation_receipt JSONB;
  transition_receipt JSONB;
  claim_revision INTEGER;
  previous_claim_revision INTEGER;
  previous_scope TEXT;
  previous_store_ids TEXT[];
  previous_outbox_record public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  replay_command public."IdentityEmployeeInviteIssueCommandV1"%ROWTYPE;
  inserted_count INTEGER;
BEGIN
  PERFORM public."identity_employee_invite_actor_assert_current189_v1"(
    p_tenant_id, p_actor_user_id
  );

  IF p_operation NOT IN (
       'ISSUE_EMPLOYEE_INVITE', 'REISSUE_EMPLOYEE_INVITE'
     )
     OR p_command_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_request_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_request_digest !~ '^[a-f0-9]{64}$'
     OR p_delivery_locator !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_invite_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_outbox_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_message_key !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR p_secret_ciphertext IS NULL
     OR pg_catalog.octet_length(p_secret_ciphertext) <> 71
     OR p_envelope_version <> 1
     OR pg_catalog.char_length(p_key_version) NOT BETWEEN 1 AND 16
     OR p_key_version !~ '^[A-Za-z0-9._-]+$'
     OR pg_catalog.char_length(p_aad_environment) NOT BETWEEN 1 AND 64
     OR p_aad_environment !~ '^[A-Za-z0-9._-]+$'
     OR p_full_name IS NOT NULL
       AND (
         p_full_name IS DISTINCT FROM pg_catalog.btrim(p_full_name)
         OR pg_catalog.char_length(p_full_name) NOT BETWEEN 1 AND 200
       )
  THEN
    RAISE EXCEPTION 'Employee invite delivery command is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (p_operation = 'ISSUE_EMPLOYEE_INVITE'
        AND (p_previous_invite_id IS NOT NULL
          OR p_reservation_subject_id IS NULL
          OR p_reservation_subject_id !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
     OR
     (p_operation = 'REISSUE_EMPLOYEE_INVITE'
        AND (p_previous_invite_id IS NULL
          OR p_previous_invite_id !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR p_reservation_subject_id IS NOT NULL))
  THEN
    RAISE EXCEPTION 'Employee invite issue/reissue binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_role IS NULL
     OR p_role = 'OWNER'
     OR p_role NOT IN (
       'ADMIN', 'MANAGER', 'BUYER', 'MARKETER', 'CLUB_MANAGER',
       'STANDARDS_MANAGER', 'SENIOR_ADMINISTRATOR',
       'CLUB_ADMINISTRATOR', 'TRAINEE'
     )
     OR p_access_scope NOT IN ('NETWORK', 'STORES')
     OR p_store_ids IS NULL
     OR pg_catalog.cardinality(p_store_ids) > 100
     OR (p_access_scope = 'NETWORK'
       AND pg_catalog.cardinality(p_store_ids) <> 0)
     OR (p_access_scope = 'STORES'
       AND pg_catalog.cardinality(p_store_ids) < 1)
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(p_store_ids) AS supplied("storeId")
       GROUP BY supplied."storeId"
       HAVING pg_catalog.count(*) > 1
     )
  THEN
    RAISE EXCEPTION 'Employee invite delegated scope is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_custom_role_id IS NOT NULL THEN
    PERFORM 1
    FROM public."UserAccessRole" AS custom_role_lock
    WHERE custom_role_lock."tenantId" = p_tenant_id
      AND custom_role_lock."id" = p_custom_role_id
    FOR UPDATE;
  END IF;
  PERFORM 1
  FROM public."Store" AS store_lock
  WHERE store_lock."tenantId" = p_tenant_id
    AND store_lock."id" = ANY(p_store_ids)
  ORDER BY store_lock."id" COLLATE "C"
  FOR UPDATE;
  server_now := pg_catalog.clock_timestamp();

  IF p_expires_at < server_now + INTERVAL '15 minutes'
     OR p_expires_at > server_now + INTERVAL '30 days'
  THEN
    RAISE EXCEPTION 'Employee invite expiry is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (p_custom_role_id IS NULL AND p_role IS NULL)
     OR (p_custom_role_id IS NOT NULL AND (
       p_custom_role_id !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR p_role <> 'CLUB_ADMINISTRATOR'
       OR NOT EXISTS (
         SELECT 1
         FROM public."UserAccessRole" AS custom_role
         WHERE custom_role."id" = p_custom_role_id
           AND custom_role."tenantId" = p_tenant_id
       )
     ))
  THEN
    RAISE EXCEPTION 'Employee invite role delegation is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public."Store" AS store
    WHERE store."tenantId" = p_tenant_id
      AND store."id" = ANY(p_store_ids)
      AND store."isActive" = TRUE
  ) <> pg_catalog.cardinality(p_store_ids) THEN
    RAISE EXCEPTION 'Employee invite contains an unavailable store'
      USING ERRCODE = '23514';
  END IF;

  canonical_email := public."identity_email_claim_lock_v1"(p_email);
  IF canonical_email IS DISTINCT FROM p_email THEN
    RAISE EXCEPTION 'Employee invite mailbox must be canonical'
      USING ERRCODE = '22023';
  END IF;
  SELECT command.*
  INTO replay_command
  FROM public."IdentityEmployeeInviteIssueCommandV1" AS command
  WHERE command."tenantId" = p_tenant_id
    AND command."actorUserId" = p_actor_user_id
    AND command."requestId" = p_request_id;

  IF FOUND THEN
    IF replay_command."operation" IS DISTINCT FROM p_operation
       OR replay_command."requestDigest" IS DISTINCT FROM p_request_digest
       OR replay_command."previousInviteId" IS DISTINCT FROM p_previous_invite_id
       OR replay_command."role"::TEXT IS DISTINCT FROM p_role
       OR replay_command."customRoleId" IS DISTINCT FROM p_custom_role_id
       OR replay_command."accessScope"::TEXT IS DISTINCT FROM p_access_scope
       OR replay_command."storeIds" IS DISTINCT FROM p_store_ids
       OR replay_command."expiresAt" IS DISTINCT FROM p_expires_at
       OR NOT EXISTS (
         SELECT 1
         FROM public."UserInvite" AS persisted_invite
         WHERE persisted_invite."tenantId" = replay_command."tenantId"
           AND persisted_invite."id" = replay_command."inviteId"
           AND persisted_invite."email" = canonical_email
           AND persisted_invite."fullName" IS NOT DISTINCT FROM p_full_name
           AND persisted_invite."role" = replay_command."role"
           AND persisted_invite."customRoleId" IS NOT DISTINCT FROM
             replay_command."customRoleId"
           AND persisted_invite."accessScope" = replay_command."accessScope"
           AND persisted_invite."storeIds" = replay_command."storeIds"
           AND persisted_invite."tokenHash" = replay_command."tokenHash"
           AND persisted_invite."expiresAt" = replay_command."expiresAt"
           AND persisted_invite."identityClaimRevision" =
             replay_command."claimRevision"
       )
    THEN
      RAISE EXCEPTION 'Employee invite request replay mismatch'
        USING ERRCODE = '23514';
    END IF;
    -- PENDING is the immutable status captured by the original command
    -- receipt. Callers that need live delivery state must use the separately
    -- authorized status projection; replay never turns into a status oracle.
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', replay_command."operation",
      'decision', 'REPLAYED',
      'tenantId', replay_command."tenantId",
      'actorUserId', replay_command."actorUserId",
      'requestId', replay_command."requestId",
      'commandId', replay_command."id",
      'previousInviteId', replay_command."previousInviteId",
      'inviteId', replay_command."inviteId",
      'outboxId', replay_command."outboxId",
      'outboxStatus', 'PENDING',
      'expiresAtEpochMs',
        pg_catalog.floor(
          extract(epoch FROM replay_command."expiresAt") * 1000
        )::BIGINT,
      'createdTransactionId', replay_command."createdTransactionId"::TEXT
    );
  END IF;

  IF p_operation = 'ISSUE_EMPLOYEE_INVITE' THEN
    reservation_receipt := public."identity_email_claim_reserve_invite_v2"(
      canonical_email, p_tenant_id, p_reservation_subject_id
    );
    IF reservation_receipt->>'decision' NOT IN ('CREATED', 'ALREADY_RESERVED')
       OR reservation_receipt->>'tenantId' IS DISTINCT FROM p_tenant_id
       OR reservation_receipt->>'subjectId' IS DISTINCT FROM
         p_reservation_subject_id
    THEN
      RAISE EXCEPTION 'Employee invite identity reservation is invalid'
        USING ERRCODE = '23514';
    END IF;
    claim_revision := (reservation_receipt->>'revision')::INTEGER;
  ELSE
    SELECT
      existing."identityClaimRevision",
      existing."accessScope"::TEXT,
      existing."storeIds"
    INTO previous_claim_revision, previous_scope, previous_store_ids
    FROM public."UserInvite" AS existing
    INNER JOIN public."IdentityEmployeeInviteIssueCommandV1" AS source
      ON source."tenantId" = existing."tenantId"
     AND source."inviteId" = existing."id"
    WHERE existing."tenantId" = p_tenant_id
      AND existing."id" = p_previous_invite_id
      AND existing."email" = canonical_email
      AND existing."acceptedAt" IS NULL
      AND existing."revokedAt" IS NULL
      AND existing."expiresAt" > server_now
    FOR UPDATE OF existing;
    IF NOT FOUND OR previous_claim_revision IS NULL THEN
      RAISE EXCEPTION 'Employee invite reissue source is unavailable'
        USING ERRCODE = '23514';
    END IF;
    IF previous_scope = 'STORES' AND (
      p_access_scope = 'NETWORK'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(p_store_ids) AS next_store("storeId")
        WHERE NOT next_store."storeId" = ANY(previous_store_ids)
      )
    ) THEN
      RAISE EXCEPTION 'Employee invite reissue cannot widen scope'
        USING ERRCODE = '23514';
    END IF;
    claim_revision := previous_claim_revision;
  END IF;

  INSERT INTO public."UserInvite" (
    "id", "tenantId", "email", "fullName", "role", "accessScope",
    "customRoleId", "storeIds", "tokenHash", "expiresAt",
    "createdByUserId", "identityClaimRevision", "revokedAt",
    "revokedByUserId", "createdAt", "updatedAt"
  ) VALUES (
    p_invite_id, p_tenant_id, canonical_email, p_full_name,
    p_role::public."UserRole", p_access_scope::public."UserAccessScope",
    p_custom_role_id, p_store_ids, p_token_hash, p_expires_at,
    p_actor_user_id, NULL, NULL, NULL, server_now, server_now
  );

  IF p_operation = 'REISSUE_EMPLOYEE_INVITE' THEN
    UPDATE public."UserInvite"
    SET
      "expiresAt" = LEAST(
        "expiresAt", server_now::TIMESTAMP(3) WITHOUT TIME ZONE
      ),
      "revokedAt" = server_now,
      "revokedByUserId" = p_actor_user_id,
      "updatedAt" = server_now
    WHERE "tenantId" = p_tenant_id
      AND "id" = p_previous_invite_id
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NULL;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count <> 1 THEN
      RAISE EXCEPTION 'Employee invite changed during reissue'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public."IdentityEmployeeMailOutboxV1"
    SET
      "status" = 'CANCELED',
      "secretCiphertext" = NULL,
      "ciphertextClearedAt" = server_now,
      "terminalAt" = server_now,
      "stateReasonCode" = 'REISSUED',
      "leaseOwnerDigest" = NULL,
      "leaseTokenDigest" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = server_now,
      "transitionRevision" = "transitionRevision" + 1
    WHERE "tenantId" = p_tenant_id
      AND "inviteId" = p_previous_invite_id
      AND "status" IN ('PENDING', 'RETRY', 'CLAIMED')
    RETURNING * INTO previous_outbox_record;
    IF FOUND THEN
      INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
        "id", "tenantId", "outboxId", "inviteId", "eventType",
        "transitionRevision", "requestDigest", "eventDigest", "reasonCode",
        "eventAt"
      ) VALUES (
        previous_outbox_record."id" || ':' ||
          previous_outbox_record."transitionRevision"::TEXT,
        p_tenant_id,
        previous_outbox_record."id",
        p_previous_invite_id,
        'CANCELED',
        previous_outbox_record."transitionRevision",
        p_request_digest,
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            p_tenant_id || E'\n' || previous_outbox_record."id" || E'\n' ||
              previous_outbox_record."transitionRevision"::TEXT ||
              E'\nCANCELED',
            'UTF8'
          )),
          'hex'
        ),
        'REISSUED',
        server_now
      );
    END IF;
  END IF;

  transition_receipt := public."identity_email_claim_transition_v2"(
    canonical_email,
    p_tenant_id,
    'INVITE',
    CASE
      WHEN p_operation = 'ISSUE_EMPLOYEE_INVITE'
        THEN p_reservation_subject_id
      ELSE p_previous_invite_id
    END,
    claim_revision,
    'INVITE',
    p_invite_id
  );
  IF transition_receipt->>'decision' NOT IN (
       'TRANSITIONED', 'ALREADY_TRANSITIONED'
     )
     OR transition_receipt->>'tenantId' IS DISTINCT FROM p_tenant_id
     OR transition_receipt->>'subjectId' IS DISTINCT FROM p_invite_id
  THEN
    RAISE EXCEPTION 'Employee invite identity transition is invalid'
      USING ERRCODE = '23514';
  END IF;
  claim_revision := (transition_receipt->>'revision')::INTEGER;

  UPDATE public."UserInvite"
  SET "identityClaimRevision" = claim_revision, "updatedAt" = server_now
  WHERE "tenantId" = p_tenant_id
    AND "id" = p_invite_id
    AND "identityClaimRevision" IS NULL;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> 1 THEN
    RAISE EXCEPTION 'Employee invite claim revision write failed'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public."IdentityEmployeeInviteIssueCommandV1" (
    "id", "tenantId", "actorUserId", "operation", "requestId",
    "requestDigest", "previousInviteId", "reservationSubjectId",
    "deliveryLocator", "inviteId", "outboxId", "messageKey",
    "role", "customRoleId", "accessScope",
    "storeIds", "tokenHash", "expiresAt", "claimRevision", "createdAt"
  ) VALUES (
    p_command_id, p_tenant_id, p_actor_user_id, p_operation, p_request_id,
    p_request_digest, p_previous_invite_id, p_reservation_subject_id,
    p_delivery_locator, p_invite_id, p_outbox_id, p_message_key,
    p_role::public."UserRole", p_custom_role_id,
    p_access_scope::public."UserAccessScope", p_store_ids, p_token_hash,
    p_expires_at, claim_revision, server_now
  );

  INSERT INTO public."IdentityEmployeeMailOutboxV1" (
    "id", "tenantId", "issueCommandId", "inviteId", "deliveryLocator",
    "template", "messageKey", "requestDigest",
    "tokenHash", "tokenDigestVersion", "secretCiphertext",
    "envelopeVersion", "keyVersion", "aadEnvironment", "status",
    "expiresAt", "availableAt", "createdAt", "updatedAt"
  ) VALUES (
    p_outbox_id, p_tenant_id, p_command_id, p_invite_id,
    p_delivery_locator, 'EMPLOYEE_USER_INVITE', p_message_key,
    p_request_digest, p_token_hash, 'sha256-v1',
    p_secret_ciphertext, p_envelope_version, p_key_version,
    p_aad_environment, 'PENDING', p_expires_at, server_now,
    server_now, server_now
  );

  INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
    "id", "tenantId", "outboxId", "inviteId", "eventType",
    "transitionRevision", "requestDigest", "eventDigest", "eventAt"
  ) VALUES (
    p_outbox_id || ':0', p_tenant_id, p_outbox_id, p_invite_id, 'PENDING',
    0, p_request_digest,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          p_tenant_id || E'\n' || p_outbox_id || E'\n0\nPENDING',
          'UTF8'
        )
      ),
      'hex'
    ),
    server_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', p_operation,
    'decision', 'CREATED',
    'tenantId', p_tenant_id,
    'actorUserId', p_actor_user_id,
    'requestId', p_request_id,
    'commandId', p_command_id,
    'previousInviteId', p_previous_invite_id,
    'inviteId', p_invite_id,
    'outboxId', p_outbox_id,
    'outboxStatus', 'PENDING',
    'expiresAtEpochMs',
      pg_catalog.floor(extract(epoch FROM p_expires_at) * 1000)::BIGINT,
    'createdTransactionId', pg_catalog.pg_current_xact_id()::TEXT
  );
END;
$$;

CREATE FUNCTION public."identity_employee_invite_issue_current189_v1"(
  p_command_id TEXT,
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_request_id TEXT,
  p_request_digest TEXT,
  p_previous_invite_id TEXT,
  p_reservation_subject_id TEXT,
  p_delivery_locator TEXT,
  p_invite_id TEXT,
  p_outbox_id TEXT,
  p_message_key TEXT,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_custom_role_id TEXT,
  p_access_scope TEXT,
  p_store_ids TEXT[],
  p_token_hash TEXT,
  p_secret_ciphertext BYTEA,
  p_envelope_version INTEGER,
  p_key_version TEXT,
  p_aad_environment TEXT,
  p_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public."identity_employee_invite_deliver_current189_v1"(
    'ISSUE_EMPLOYEE_INVITE', p_command_id, p_tenant_id, p_actor_user_id,
    p_request_id, p_request_digest, p_previous_invite_id,
    p_reservation_subject_id, p_delivery_locator, p_invite_id, p_outbox_id,
    p_message_key, p_email, p_full_name, p_role, p_custom_role_id,
    p_access_scope, p_store_ids, p_token_hash, p_secret_ciphertext,
    p_envelope_version, p_key_version, p_aad_environment, p_expires_at
  );
$$;

CREATE FUNCTION public."identity_employee_invite_reissue_current189_v1"(
  p_command_id TEXT,
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_request_id TEXT,
  p_request_digest TEXT,
  p_previous_invite_id TEXT,
  p_reservation_subject_id TEXT,
  p_delivery_locator TEXT,
  p_invite_id TEXT,
  p_outbox_id TEXT,
  p_message_key TEXT,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_custom_role_id TEXT,
  p_access_scope TEXT,
  p_store_ids TEXT[],
  p_token_hash TEXT,
  p_secret_ciphertext BYTEA,
  p_envelope_version INTEGER,
  p_key_version TEXT,
  p_aad_environment TEXT,
  p_expires_at TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public."identity_employee_invite_deliver_current189_v1"(
    'REISSUE_EMPLOYEE_INVITE', p_command_id, p_tenant_id, p_actor_user_id,
    p_request_id, p_request_digest, p_previous_invite_id,
    p_reservation_subject_id, p_delivery_locator, p_invite_id, p_outbox_id,
    p_message_key, p_email, p_full_name, p_role, p_custom_role_id,
    p_access_scope, p_store_ids, p_token_hash, p_secret_ciphertext,
    p_envelope_version, p_key_version, p_aad_environment, p_expires_at
  );
$$;

CREATE FUNCTION public."identity_employee_invite_revoke_current189_v1"(
  p_command_id TEXT,
  p_tenant_id TEXT,
  p_actor_user_id TEXT,
  p_request_id TEXT,
  p_request_digest TEXT,
  p_invite_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  replay_command public."IdentityEmployeeInviteRevokeCommandV1"%ROWTYPE;
  release_receipt JSONB;
  canonical_email TEXT;
  next_revision BIGINT;
  changed_count INTEGER;
BEGIN
  PERFORM public."identity_employee_invite_actor_assert_current189_v1"(
    p_tenant_id, p_actor_user_id
  );
  IF p_command_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_request_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_request_digest !~ '^[a-f0-9]{64}$'
     OR p_invite_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Employee invite revoke command is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT command.*
  INTO replay_command
  FROM public."IdentityEmployeeInviteRevokeCommandV1" AS command
  WHERE command."tenantId" = p_tenant_id
    AND command."actorUserId" = p_actor_user_id
    AND command."requestId" = p_request_id;
  IF FOUND THEN
    IF replay_command."requestDigest" IS DISTINCT FROM p_request_digest
       OR replay_command."inviteId" IS DISTINCT FROM p_invite_id
    THEN
      RAISE EXCEPTION 'Employee invite revoke replay mismatch'
        USING ERRCODE = '23514';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'REVOKE_EMPLOYEE_INVITE',
      'decision', 'REPLAYED',
      'tenantId', replay_command."tenantId",
      'actorUserId', replay_command."actorUserId",
      'requestId', replay_command."requestId",
      'commandId', replay_command."id",
      'inviteId', replay_command."inviteId",
      'outboxStatus', 'CANCELED',
      'claimReleased', true,
      'createdTransactionId', replay_command."createdTransactionId"::TEXT
    );
  END IF;

  SELECT invite.*
  INTO invite_record
  FROM public."UserInvite" AS invite
  INNER JOIN public."IdentityEmployeeInviteIssueCommandV1" AS source
    ON source."tenantId" = invite."tenantId"
   AND source."inviteId" = invite."id"
  WHERE invite."tenantId" = p_tenant_id
    AND invite."id" = p_invite_id
    AND invite."acceptedAt" IS NULL
    AND invite."revokedAt" IS NULL
  FOR UPDATE OF invite;
  IF NOT FOUND
     OR invite_record."email" IS NULL
     OR invite_record."identityClaimRevision" IS NULL
  THEN
    RAISE EXCEPTION 'Employee invite revoke target is unavailable'
      USING ERRCODE = '23514';
  END IF;

  canonical_email := public."identity_email_claim_lock_v1"(
    invite_record."email"
  );
  IF canonical_email IS DISTINCT FROM invite_record."email" THEN
    RAISE EXCEPTION 'Employee invite mailbox provenance drifted'
      USING ERRCODE = '23514';
  END IF;

  SELECT outbox.*
  INTO outbox_record
  FROM public."IdentityEmployeeMailOutboxV1" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."inviteId" = p_invite_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee invite outbox is unavailable'
      USING ERRCODE = '23514';
  END IF;
  server_now := pg_catalog.clock_timestamp();

  UPDATE public."UserInvite"
  SET
    "expiresAt" = LEAST(
      "expiresAt", server_now::TIMESTAMP(3) WITHOUT TIME ZONE
    ),
    "revokedAt" = server_now,
    "revokedByUserId" = p_actor_user_id,
    "updatedAt" = server_now
  WHERE "tenantId" = p_tenant_id
    AND "id" = p_invite_id
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'Employee invite changed during revoke'
      USING ERRCODE = '23514';
  END IF;

  release_receipt := public."identity_email_claim_release_v2"(
    canonical_email,
    p_tenant_id,
    'INVITE',
    p_invite_id,
    invite_record."identityClaimRevision"
  );
  IF release_receipt->>'decision' IS DISTINCT FROM 'RELEASED'
     OR release_receipt->>'tenantId' IS DISTINCT FROM p_tenant_id
     OR release_receipt->>'subjectId' IS DISTINCT FROM p_invite_id
  THEN
    RAISE EXCEPTION 'Employee invite claim release is invalid'
      USING ERRCODE = '23514';
  END IF;

  next_revision := outbox_record."transitionRevision" + 1;
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET
    "status" = 'CANCELED',
    "secretCiphertext" = NULL,
    "ciphertextClearedAt" =
      COALESCE("ciphertextClearedAt", server_now),
    "leaseOwnerDigest" = NULL,
    "leaseTokenDigest" = NULL,
    "leaseExpiresAt" = NULL,
    "terminalAt" = COALESCE("terminalAt", server_now),
    "stateReasonCode" = 'REVOKED_BY_OWNER',
    "transitionRevision" = next_revision,
    "updatedAt" = server_now
  WHERE "tenantId" = p_tenant_id
    AND "id" = outbox_record."id";

  INSERT INTO public."IdentityEmployeeInviteRevokeCommandV1" (
    "id", "tenantId", "actorUserId", "requestId", "requestDigest",
    "inviteId", "outboxId", "releasedClaimRevision", "createdAt"
  ) VALUES (
    p_command_id, p_tenant_id, p_actor_user_id, p_request_id,
    p_request_digest, p_invite_id, outbox_record."id",
    invite_record."identityClaimRevision", server_now
  );

  INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
    "id", "tenantId", "outboxId", "inviteId", "eventType",
    "transitionRevision", "requestDigest", "eventDigest", "reasonCode",
    "eventAt"
  ) VALUES (
    outbox_record."id" || ':' || next_revision::TEXT,
    p_tenant_id, outbox_record."id", p_invite_id, 'CANCELED',
    next_revision, p_request_digest,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          p_tenant_id || E'\n' || outbox_record."id" || E'\n' ||
            next_revision::TEXT || E'\nCANCELED',
          'UTF8'
        )
      ),
      'hex'
    ),
    'REVOKED_BY_OWNER', server_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REVOKE_EMPLOYEE_INVITE',
    'decision', 'REVOKED',
    'tenantId', p_tenant_id,
    'actorUserId', p_actor_user_id,
    'requestId', p_request_id,
    'commandId', p_command_id,
    'inviteId', p_invite_id,
    'outboxStatus', 'CANCELED',
    'claimReleased', true,
    'createdTransactionId', pg_catalog.pg_current_xact_id()::TEXT
  );
END;
$$;

CREATE FUNCTION public."identity_employee_mail_worker_assert_current189_v1"(
  p_tenant_id TEXT,
  p_provider_authority_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  enrollment public."IdentityEmployeeMailTenantEnrollmentV1"%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_provider_authority_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Employee mail worker binding is invalid'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config(
    'leetplus.employee_invite_tenant_id', p_tenant_id, true
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-tenant:v1:' || p_tenant_id,
      180
    )
  );
  SELECT target.*
  INTO enrollment
  FROM public."IdentityEmployeeMailTenantEnrollmentV1" AS target
  WHERE target."tenantId" = p_tenant_id
  FOR SHARE;
  IF NOT FOUND
     OR enrollment."enabled" = FALSE
     OR enrollment."workerRoleName" IS DISTINCT FROM session_user
     OR enrollment."workerRoleOid" IS DISTINCT FROM (
       SELECT role.oid
       FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = session_user
     )
     OR enrollment."providerAuthorityDigest" IS DISTINCT FROM
       p_provider_authority_digest
  THEN
    RAISE EXCEPTION 'Employee mail worker is not enrolled'
      USING ERRCODE = '42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_EMPLOYEE_MAIL_WORKER',
    'decision', 'REHEARSAL_READY',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'authorization', false,
    'canSend', false,
    'tenantId', enrollment."tenantId",
    'state', enrollment."state",
    'stateRevision', enrollment."stateRevision",
    'policyRevision', enrollment."policyRevision",
    'maxAttempts', enrollment."maxAttempts",
    'leaseSeconds', enrollment."leaseSeconds",
    'acknowledgeSeconds', enrollment."acknowledgeSeconds",
    'baseRetrySeconds', enrollment."baseRetrySeconds",
    'maxRetrySeconds', enrollment."maxRetrySeconds"
  );
END;
$$;

CREATE FUNCTION public."identity_employee_mail_claim_current189_v1"(
  p_tenant_id TEXT,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_authority_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  worker_receipt JSONB;
  enrollment public."IdentityEmployeeMailTenantEnrollmentV1"%ROWTYPE;
  outbox_record public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  canonical_email TEXT;
  next_revision BIGINT;
BEGIN
  IF p_lease_owner_digest !~ '^[a-f0-9]{64}$'
     OR p_lease_token_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Employee mail claim lease binding is invalid'
      USING ERRCODE = '22023';
  END IF;
  worker_receipt := public."identity_employee_mail_worker_assert_current189_v1"(
    p_tenant_id, p_provider_authority_digest
  );
  server_now := pg_catalog.clock_timestamp();
  SELECT target.*
  INTO enrollment
  FROM public."IdentityEmployeeMailTenantEnrollmentV1" AS target
  WHERE target."tenantId" = p_tenant_id;
  IF enrollment."state" <> 'ACTIVE' THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CLAIM_EMPLOYEE_MAIL',
      'decision', 'EMPTY',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', p_tenant_id
    );
  END IF;

  SELECT candidate.*
  INTO outbox_record
  FROM public."IdentityEmployeeMailOutboxV1" AS candidate
  WHERE candidate."tenantId" = p_tenant_id
    AND candidate."status" IN ('PENDING', 'RETRY')
    AND candidate."availableAt" <= server_now
    AND candidate."expiresAt" > server_now
    AND candidate."attempts" < enrollment."maxAttempts"
  ORDER BY candidate."availableAt", candidate."createdAt", candidate."id"
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CLAIM_EMPLOYEE_MAIL',
      'decision', 'EMPTY',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', p_tenant_id
    );
  END IF;

  SELECT invite.*
  INTO invite_record
  FROM public."UserInvite" AS invite
  WHERE invite."tenantId" = p_tenant_id
    AND invite."id" = outbox_record."inviteId"
  FOR SHARE;
  IF NOT FOUND OR invite_record."email" IS NULL THEN
    canonical_email := NULL;
  ELSE
    canonical_email := public."identity_email_claim_lock_v1"(
      invite_record."email"
    );
  END IF;

  IF invite_record."id" IS NULL
     OR invite_record."email" IS DISTINCT FROM canonical_email
     OR invite_record."tokenHash" IS DISTINCT FROM outbox_record."tokenHash"
     OR invite_record."acceptedAt" IS NOT NULL
     OR invite_record."revokedAt" IS NOT NULL
     OR invite_record."expiresAt" <= server_now
     OR invite_record."identityClaimRevision" IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public."IdentityEmailClaim" AS claim
       WHERE claim."emailCanonical" = canonical_email
         AND claim."tenantId" = p_tenant_id
         AND claim."claimType" = 'INVITE'::public."IdentityEmailClaimType"
         AND claim."subjectId" = invite_record."id"
         AND claim."revision" = invite_record."identityClaimRevision"
     )
  THEN
    next_revision := outbox_record."transitionRevision" + 1;
    UPDATE public."IdentityEmployeeMailOutboxV1"
    SET
      "status" = 'CANCELED',
      "secretCiphertext" = NULL,
      "ciphertextClearedAt" = server_now,
      "terminalAt" = server_now,
      "stateReasonCode" = 'INVITE_NOT_LIVE',
      "transitionRevision" = next_revision,
      "updatedAt" = server_now
    WHERE "tenantId" = p_tenant_id AND "id" = outbox_record."id";
    INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
      "id", "tenantId", "outboxId", "inviteId", "eventType",
      "transitionRevision", "requestDigest", "eventDigest", "reasonCode",
      "eventAt"
    ) VALUES (
      outbox_record."id" || ':' || next_revision::TEXT,
      p_tenant_id, outbox_record."id", outbox_record."inviteId",
      'CANCELED', next_revision, outbox_record."requestDigest",
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          p_tenant_id || E'\n' || outbox_record."id" || E'\n' ||
            next_revision::TEXT || E'\nCANCELED', 'UTF8'
        )), 'hex'
      ),
      'INVITE_NOT_LIVE', server_now
    );
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CLAIM_EMPLOYEE_MAIL',
      'decision', 'CANCELED',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', p_tenant_id,
      'outboxId', outbox_record."id"
    );
  END IF;

  next_revision := outbox_record."transitionRevision" + 1;
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET
    "status" = 'CLAIMED',
    "attempts" = "attempts" + 1,
    "leaseVersion" = "leaseVersion" + 1,
    "transitionRevision" = next_revision,
    "leaseOwnerDigest" = p_lease_owner_digest,
    "leaseTokenDigest" = p_lease_token_digest,
    "claimedAt" = server_now,
    "leaseExpiresAt" = server_now +
      pg_catalog.make_interval(secs => enrollment."leaseSeconds"),
    "availableAt" = NULL,
    "updatedAt" = server_now
  WHERE "tenantId" = p_tenant_id AND "id" = outbox_record."id"
  RETURNING * INTO outbox_record;

  INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
    "id", "tenantId", "outboxId", "inviteId", "eventType",
    "transitionRevision", "requestDigest", "eventDigest", "eventAt"
  ) VALUES (
    outbox_record."id" || ':' || next_revision::TEXT,
    p_tenant_id, outbox_record."id", outbox_record."inviteId", 'CLAIMED',
    next_revision, outbox_record."requestDigest",
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        p_tenant_id || E'\n' || outbox_record."id" || E'\n' ||
          next_revision::TEXT || E'\nCLAIMED', 'UTF8'
      )), 'hex'
    ),
    server_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'CLAIM_EMPLOYEE_MAIL',
    'decision', 'CLAIMED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', p_tenant_id,
    'outboxId', outbox_record."id",
    'inviteId', outbox_record."inviteId",
    'deliveryLocator', outbox_record."deliveryLocator",
    'template', outbox_record."template",
    'messageKey', outbox_record."messageKey",
    'requestDigest', outbox_record."requestDigest",
    'recipientEmail', canonical_email,
    'tokenHash', outbox_record."tokenHash",
    'digestVersion', outbox_record."tokenDigestVersion",
    'secretCiphertextBase64',
      pg_catalog.encode(outbox_record."secretCiphertext", 'base64'),
    'envelopeVersion', outbox_record."envelopeVersion",
    'keyVersion', outbox_record."keyVersion",
    'aadEnvironment', outbox_record."aadEnvironment",
    'expiresAt', outbox_record."expiresAt",
    'attemptNumber', outbox_record."attempts",
    'leaseVersion', outbox_record."leaseVersion",
    'transitionRevision', outbox_record."transitionRevision",
    'claimEnrollmentStateRevision', enrollment."stateRevision",
    'claimPolicyRevision', enrollment."policyRevision",
    'claimProviderAuthorityDigest', enrollment."providerAuthorityDigest"
  );
END;
$$;

CREATE FUNCTION public."identity_employee_mail_provider_mark_current189_v1"(
  p_tenant_id TEXT,
  p_outbox_id TEXT,
  p_lease_version INTEGER,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_attempt_key TEXT,
  p_provider_authority_digest TEXT,
  p_message_id_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  worker_receipt JSONB;
  enrollment public."IdentityEmployeeMailTenantEnrollmentV1"%ROWTYPE;
  outbox_record public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  next_revision BIGINT;
  marker_request_digest TEXT;
BEGIN
  IF p_outbox_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_version IS NULL OR p_lease_version < 1
     OR p_lease_owner_digest !~ '^[a-f0-9]{64}$'
     OR p_lease_token_digest !~ '^[a-f0-9]{64}$'
     OR pg_catalog.char_length(p_provider_attempt_key) NOT BETWEEN 16 AND 96
     OR p_provider_attempt_key IS DISTINCT FROM
       pg_catalog.btrim(p_provider_attempt_key)
     OR p_message_id_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Employee mail provider marker is invalid'
      USING ERRCODE = '22023';
  END IF;
  worker_receipt := public."identity_employee_mail_worker_assert_current189_v1"(
    p_tenant_id, p_provider_authority_digest
  );
  server_now := pg_catalog.clock_timestamp();
  SELECT target.*
  INTO enrollment
  FROM public."IdentityEmployeeMailTenantEnrollmentV1" AS target
  WHERE target."tenantId" = p_tenant_id;

  SELECT outbox.*
  INTO outbox_record
  FROM public."IdentityEmployeeMailOutboxV1" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."id" = p_outbox_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee mail outbox was not found'
      USING ERRCODE = '23503';
  END IF;

  marker_request_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      p_tenant_id || E'\n' || p_outbox_id || E'\n' ||
        p_lease_version::TEXT || E'\n' || p_provider_attempt_key || E'\n' ||
        p_provider_authority_digest || E'\n' || p_message_id_digest,
      'UTF8'
    )), 'hex'
  );

  IF outbox_record."providerAttemptKey" IS NOT NULL THEN
    IF outbox_record."leaseVersion" = p_lease_version
       AND outbox_record."leaseOwnerDigest" = p_lease_owner_digest
       AND outbox_record."leaseTokenDigest" = p_lease_token_digest
       AND outbox_record."providerAttemptKey" = p_provider_attempt_key
       AND outbox_record."providerAuthorityDigest" =
         p_provider_authority_digest
       AND outbox_record."messageIdDigest" = p_message_id_digest
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'operation', 'MARK_EMPLOYEE_MAIL_PROVIDER_ATTEMPT',
        'decision', 'MARKED',
        'candidateStatus', 'NOT_DEPLOYABLE',
        'tenantId', p_tenant_id,
        'outboxId', p_outbox_id,
        'leaseVersion', outbox_record."leaseVersion",
        'transitionRevision', outbox_record."transitionRevision",
        'providerAttemptKey', outbox_record."providerAttemptKey",
        'settlementState', enrollment."state"
      );
    END IF;

    IF outbox_record."status" = 'CLAIMED' THEN
      next_revision := outbox_record."transitionRevision" + 1;
      UPDATE public."IdentityEmployeeMailOutboxV1"
      SET
        "status" = 'RECONCILIATION_REQUIRED',
        "terminalAckDigest" = pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            marker_request_digest || E'\nPROVIDER_MARKER_CONFLICT',
            'UTF8'
          )),
          'hex'
        ),
        "secretCiphertext" = NULL,
        "ciphertextClearedAt" =
          COALESCE("ciphertextClearedAt", server_now),
        "terminalAt" = server_now,
        "stateReasonCode" = 'PROVIDER_MARKER_CONFLICT',
        "transitionRevision" = next_revision,
        "updatedAt" = server_now
      WHERE "tenantId" = p_tenant_id AND "id" = p_outbox_id;
      INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
        "id", "tenantId", "outboxId", "inviteId", "eventType",
        "transitionRevision", "requestDigest", "eventDigest", "reasonCode",
        "eventAt"
      ) VALUES (
        p_outbox_id || ':' || next_revision::TEXT,
        p_tenant_id, p_outbox_id, outbox_record."inviteId",
        'RECONCILIATION_REQUIRED', next_revision, marker_request_digest,
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            p_tenant_id || E'\n' || p_outbox_id || E'\n' ||
              next_revision::TEXT || E'\nRECONCILIATION_REQUIRED', 'UTF8'
          )), 'hex'
        ),
        'PROVIDER_MARKER_CONFLICT', server_now
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'MARK_EMPLOYEE_MAIL_PROVIDER_ATTEMPT',
      'decision', 'HANDOFF',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'tenantId', p_tenant_id,
      'outboxId', p_outbox_id,
      'leaseVersion', outbox_record."leaseVersion",
      'transitionRevision',
        GREATEST(outbox_record."transitionRevision", next_revision),
      'settlementState', enrollment."state",
      'handoffReason', 'MARKER_NOT_REUSABLE'
    );
  END IF;

  IF outbox_record."status" <> 'CLAIMED'
     OR outbox_record."leaseVersion" <> p_lease_version
     OR outbox_record."leaseOwnerDigest" <> p_lease_owner_digest
     OR outbox_record."leaseTokenDigest" <> p_lease_token_digest
     OR outbox_record."leaseExpiresAt" <= server_now
     OR outbox_record."secretCiphertext" IS NULL
     OR outbox_record."ciphertextClearedAt" IS NOT NULL
  THEN
    RAISE EXCEPTION 'Employee mail provider lease changed'
      USING ERRCODE = '23514';
  END IF;

  next_revision := outbox_record."transitionRevision" + 1;
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET
    "providerAttemptKey" = p_provider_attempt_key,
    "providerAuthorityDigest" = p_provider_authority_digest,
    "providerAttemptedAt" = server_now,
    "providerAcknowledgeUntil" = server_now +
      pg_catalog.make_interval(secs => enrollment."acknowledgeSeconds"),
    "messageIdDigest" = p_message_id_digest,
    "secretCiphertext" = NULL,
    "ciphertextClearedAt" = server_now,
    "transitionRevision" = next_revision,
    "updatedAt" = server_now
  WHERE "tenantId" = p_tenant_id AND "id" = p_outbox_id;

  INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
    "id", "tenantId", "outboxId", "inviteId", "eventType",
    "transitionRevision", "requestDigest", "eventDigest", "eventAt"
  ) VALUES (
    p_outbox_id || ':' || next_revision::TEXT,
    p_tenant_id, p_outbox_id, outbox_record."inviteId", 'PROVIDER_MARKED',
    next_revision, marker_request_digest,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        p_tenant_id || E'\n' || p_outbox_id || E'\n' ||
          next_revision::TEXT || E'\nPROVIDER_MARKED', 'UTF8'
      )), 'hex'
    ),
    server_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'MARK_EMPLOYEE_MAIL_PROVIDER_ATTEMPT',
    'decision', 'MARKED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', p_tenant_id,
    'outboxId', p_outbox_id,
    'leaseVersion', p_lease_version,
    'transitionRevision', next_revision,
    'providerAttemptKey', p_provider_attempt_key,
    'settlementState', enrollment."state"
  );
END;
$$;

CREATE FUNCTION public."identity_employee_mail_complete_current189_v1"(
  p_tenant_id TEXT,
  p_outbox_id TEXT,
  p_lease_version INTEGER,
  p_lease_owner_digest TEXT,
  p_lease_token_digest TEXT,
  p_provider_authority_digest TEXT,
  p_outcome TEXT,
  p_provider_receipt_digest TEXT,
  p_terminal_ack_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  worker_receipt JSONB;
  enrollment public."IdentityEmployeeMailTenantEnrollmentV1"%ROWTYPE;
  outbox_record public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  next_status TEXT;
  reason_code TEXT;
  next_revision BIGINT;
  transition_request_digest TEXT;
  retry_seconds INTEGER;
BEGIN
  IF p_outbox_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_lease_version IS NULL OR p_lease_version < 1
     OR p_lease_owner_digest !~ '^[a-f0-9]{64}$'
     OR p_lease_token_digest !~ '^[a-f0-9]{64}$'
     OR p_outcome NOT IN (
       'PRE_PROVIDER_RETRY', 'PRE_PROVIDER_DEAD',
       'PROVIDER_ACCEPTED', 'PROVIDER_AMBIGUOUS'
     )
     OR (p_provider_receipt_digest IS NOT NULL
       AND p_provider_receipt_digest !~ '^[a-f0-9]{64}$')
     OR (p_terminal_ack_digest IS NOT NULL
       AND p_terminal_ack_digest !~ '^[a-f0-9]{64}$')
     OR (p_outcome = 'PROVIDER_ACCEPTED'
       AND (p_provider_receipt_digest IS NULL
         OR p_terminal_ack_digest IS NULL))
     OR (p_outcome = 'PROVIDER_AMBIGUOUS'
       AND (p_provider_receipt_digest IS NOT NULL
         OR p_terminal_ack_digest IS NULL))
     OR (p_outcome LIKE 'PRE_PROVIDER_%'
       AND (p_provider_receipt_digest IS NOT NULL
         OR p_terminal_ack_digest IS NOT NULL))
  THEN
    RAISE EXCEPTION 'Employee mail completion binding is invalid'
      USING ERRCODE = '22023';
  END IF;
  worker_receipt := public."identity_employee_mail_worker_assert_current189_v1"(
    p_tenant_id, p_provider_authority_digest
  );
  server_now := pg_catalog.clock_timestamp();
  SELECT target.*
  INTO enrollment
  FROM public."IdentityEmployeeMailTenantEnrollmentV1" AS target
  WHERE target."tenantId" = p_tenant_id;

  transition_request_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      p_tenant_id || E'\n' || p_outbox_id || E'\n' ||
        p_lease_version::TEXT || E'\n' || p_outcome || E'\n' ||
        COALESCE(p_provider_receipt_digest, '') || E'\n' ||
        COALESCE(p_terminal_ack_digest, ''),
      'UTF8'
    )), 'hex'
  );

  SELECT outbox.*
  INTO outbox_record
  FROM public."IdentityEmployeeMailOutboxV1" AS outbox
  WHERE outbox."tenantId" = p_tenant_id
    AND outbox."id" = p_outbox_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee mail outbox was not found'
      USING ERRCODE = '23503';
  END IF;

  IF outbox_record."status" IN (
    'SENT', 'DEAD', 'CANCELED', 'RECONCILIATION_REQUIRED'
  ) THEN
    IF (p_outcome = 'PROVIDER_ACCEPTED'
          AND outbox_record."status" = 'SENT'
          AND outbox_record."providerReceiptDigest" =
            p_provider_receipt_digest
          AND outbox_record."terminalAckDigest" =
            p_terminal_ack_digest)
       OR (p_outcome = 'PROVIDER_AMBIGUOUS'
          AND outbox_record."status" = 'RECONCILIATION_REQUIRED'
          AND outbox_record."stateReasonCode" =
            'SMTP_OUTCOME_AMBIGUOUS'
          AND outbox_record."providerReceiptDigest" IS NULL
          AND outbox_record."terminalAckDigest" =
            p_terminal_ack_digest)
       OR (p_outcome = 'PRE_PROVIDER_DEAD'
          AND outbox_record."status" = 'DEAD')
       OR outbox_record."status" = 'CANCELED'
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'operation', 'COMPLETE_EMPLOYEE_MAIL',
        'decision', outbox_record."status",
        'candidateStatus', 'NOT_DEPLOYABLE',
        'tenantId', p_tenant_id,
        'outboxId', p_outbox_id,
        'leaseVersion', outbox_record."leaseVersion",
        'transitionRevision', outbox_record."transitionRevision",
        'settlementState', enrollment."state"
      );
    END IF;
    RAISE EXCEPTION 'Employee mail terminal replay mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF outbox_record."status" <> 'CLAIMED'
     OR outbox_record."leaseVersion" <> p_lease_version
     OR outbox_record."leaseOwnerDigest" <> p_lease_owner_digest
     OR outbox_record."leaseTokenDigest" <> p_lease_token_digest
  THEN
    RAISE EXCEPTION 'Employee mail completion lease changed'
      USING ERRCODE = '23514';
  END IF;

  IF p_outcome LIKE 'PROVIDER_%' AND (
       outbox_record."providerAttemptKey" IS NULL
       OR outbox_record."providerAuthorityDigest" IS DISTINCT FROM
         p_provider_authority_digest
       OR outbox_record."secretCiphertext" IS NOT NULL
       OR outbox_record."ciphertextClearedAt" IS NULL
     )
  THEN
    RAISE EXCEPTION 'Employee mail provider evidence is missing'
      USING ERRCODE = '23514';
  END IF;
  IF p_outcome LIKE 'PRE_PROVIDER_%' AND (
       outbox_record."providerAttemptKey" IS NOT NULL
       OR outbox_record."secretCiphertext" IS NULL
       OR outbox_record."ciphertextClearedAt" IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'Employee mail pre-provider evidence changed'
      USING ERRCODE = '23514';
  END IF;

  IF p_outcome = 'PROVIDER_ACCEPTED' THEN
    next_status := 'SENT';
    reason_code := 'SMTP_ACCEPTED';
  ELSIF p_outcome = 'PROVIDER_AMBIGUOUS' THEN
    next_status := 'RECONCILIATION_REQUIRED';
    reason_code := 'SMTP_OUTCOME_AMBIGUOUS';
  ELSIF p_outcome = 'PRE_PROVIDER_DEAD'
     OR outbox_record."attempts" >= enrollment."maxAttempts"
  THEN
    next_status := 'DEAD';
    reason_code := CASE
      WHEN p_outcome = 'PRE_PROVIDER_DEAD' THEN 'PRE_PROVIDER_PERMANENT'
      ELSE 'MAX_ATTEMPTS_EXHAUSTED'
    END;
  ELSE
    next_status := 'RETRY';
    reason_code := 'PRE_PROVIDER_RETRY';
  END IF;

  next_revision := outbox_record."transitionRevision" + 1;
  retry_seconds := LEAST(
    enrollment."maxRetrySeconds",
    enrollment."baseRetrySeconds" *
      (2 ^ GREATEST(outbox_record."attempts" - 1, 0))::INTEGER
  );
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET
    "status" = next_status,
    "availableAt" = CASE
      WHEN next_status = 'RETRY' THEN server_now +
        pg_catalog.make_interval(secs => retry_seconds)
      ELSE NULL
    END,
    "leaseOwnerDigest" = NULL,
    "leaseTokenDigest" = NULL,
    "leaseExpiresAt" = NULL,
    "providerReceiptDigest" = CASE
      WHEN next_status = 'SENT' THEN p_provider_receipt_digest
      ELSE "providerReceiptDigest"
    END,
    "terminalAckDigest" = CASE
      WHEN next_status IN ('SENT', 'RECONCILIATION_REQUIRED')
        THEN p_terminal_ack_digest
      ELSE NULL
    END,
    "secretCiphertext" = CASE
      WHEN next_status = 'RETRY' THEN "secretCiphertext"
      ELSE NULL
    END,
    "ciphertextClearedAt" = CASE
      WHEN next_status = 'RETRY' THEN NULL
      ELSE COALESCE("ciphertextClearedAt", server_now)
    END,
    "sentAt" = CASE WHEN next_status = 'SENT' THEN server_now ELSE NULL END,
    "terminalAt" = CASE
      WHEN next_status IN ('SENT', 'DEAD', 'RECONCILIATION_REQUIRED')
        THEN server_now
      ELSE NULL
    END,
    "stateReasonCode" = reason_code,
    "transitionRevision" = next_revision,
    "updatedAt" = server_now,
    "providerAttemptKey" = CASE
      WHEN next_status = 'RETRY' THEN NULL ELSE "providerAttemptKey"
    END,
    "providerAuthorityDigest" = CASE
      WHEN next_status = 'RETRY' THEN NULL ELSE "providerAuthorityDigest"
    END,
    "providerAttemptedAt" = CASE
      WHEN next_status = 'RETRY' THEN NULL ELSE "providerAttemptedAt"
    END,
    "providerAcknowledgeUntil" = CASE
      WHEN next_status = 'RETRY' THEN NULL ELSE "providerAcknowledgeUntil"
    END,
    "messageIdDigest" = CASE
      WHEN next_status = 'RETRY' THEN NULL ELSE "messageIdDigest"
    END
  WHERE "tenantId" = p_tenant_id AND "id" = p_outbox_id;

  INSERT INTO public."IdentityEmployeeMailDeliveryEventV1" (
    "id", "tenantId", "outboxId", "inviteId", "eventType",
    "transitionRevision", "requestDigest", "eventDigest", "reasonCode",
    "eventAt"
  ) VALUES (
    p_outbox_id || ':' || next_revision::TEXT,
    p_tenant_id, p_outbox_id, outbox_record."inviteId", next_status,
    next_revision, transition_request_digest,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        p_tenant_id || E'\n' || p_outbox_id || E'\n' ||
          next_revision::TEXT || E'\n' || next_status, 'UTF8'
      )), 'hex'
    ),
    reason_code, server_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'COMPLETE_EMPLOYEE_MAIL',
    'decision', next_status,
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', p_tenant_id,
    'outboxId', p_outbox_id,
    'leaseVersion', p_lease_version,
    'transitionRevision', next_revision,
    'settlementState', enrollment."state"
  );
END;
$$;

CREATE FUNCTION public."identity_employee_mail_reap_current189_v1"(
  p_tenant_id TEXT,
  p_provider_authority_digest TEXT,
  p_batch_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  worker_receipt JSONB;
  candidate public."IdentityEmployeeMailOutboxV1"%ROWTYPE;
  completion_receipt JSONB;
  processed INTEGER := 0;
  retry_count INTEGER := 0;
  dead_count INTEGER := 0;
  reconciliation_count INTEGER := 0;
  terminal_ack_digest TEXT;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Employee mail reap batch is invalid'
      USING ERRCODE = '22023';
  END IF;
  worker_receipt := public."identity_employee_mail_worker_assert_current189_v1"(
    p_tenant_id, p_provider_authority_digest
  );
  server_now := pg_catalog.clock_timestamp();

  FOR candidate IN
    SELECT outbox.*
    FROM public."IdentityEmployeeMailOutboxV1" AS outbox
    WHERE outbox."tenantId" = p_tenant_id
      AND outbox."status" = 'CLAIMED'
      AND outbox."leaseExpiresAt" <= server_now
    ORDER BY outbox."leaseExpiresAt", outbox."id"
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF candidate."providerAttemptKey" IS NULL THEN
      completion_receipt :=
        public."identity_employee_mail_complete_current189_v1"(
          p_tenant_id,
          candidate."id",
          candidate."leaseVersion",
          candidate."leaseOwnerDigest",
          candidate."leaseTokenDigest",
          p_provider_authority_digest,
          'PRE_PROVIDER_RETRY',
          NULL,
          NULL
        );
    ELSE
      terminal_ack_digest := pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          p_tenant_id || E'\n' || candidate."id" || E'\n' ||
            candidate."leaseVersion"::TEXT || E'\nREAP_MARKED_AMBIGUOUS',
          'UTF8'
        )), 'hex'
      );
      completion_receipt :=
        public."identity_employee_mail_complete_current189_v1"(
          p_tenant_id,
          candidate."id",
          candidate."leaseVersion",
          candidate."leaseOwnerDigest",
          candidate."leaseTokenDigest",
          p_provider_authority_digest,
          'PROVIDER_AMBIGUOUS',
          NULL,
          terminal_ack_digest
        );
    END IF;
    processed := processed + 1;
    IF completion_receipt->>'decision' = 'RETRY' THEN
      retry_count := retry_count + 1;
    ELSIF completion_receipt->>'decision' = 'DEAD' THEN
      dead_count := dead_count + 1;
    ELSIF completion_receipt->>'decision' = 'RECONCILIATION_REQUIRED' THEN
      reconciliation_count := reconciliation_count + 1;
    ELSE
      RAISE EXCEPTION 'Employee mail reap completion is invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REAP_EMPLOYEE_MAIL',
    'decision', 'REAPED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'tenantId', p_tenant_id,
    'processed', processed,
    'retry', retry_count,
    'dead', dead_count,
    'reconciliationRequired', reconciliation_count
  );
END;
$$;

-- Public invite preview and acceptance must not infer delivery from the
-- existence of UserInvite alone. This assertion binds the presented token to
-- the employee issue provenance, current identity claim, terminal SENT outbox
-- state and the admitted tenant snapshot. The common tenant lock keeps the
-- result fresh across issue/reissue/revoke/accept paths.
CREATE FUNCTION
  public."identity_employee_invite_delivery_assert_sent_current189_v1"(
    p_tenant_id TEXT,
    p_invite_id TEXT,
    p_presented_token_hash TEXT
  )
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE;
  canonical_email TEXT;
  locked_invite public."UserInvite"%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_invite_id IS NULL
     OR p_invite_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_presented_token_hash IS NULL
     OR p_presented_token_hash !~ '^[a-f0-9]{64}$'
  THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.employee_invite_tenant_id', p_tenant_id, true
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-tenant:v1:' || p_tenant_id,
      180
    )
  );

  -- Revalidate the full admission/scope snapshot after acquiring the common
  -- tenant lock. Parent-row locks fence FK-backed entitlement and store
  -- mutations; child rows are acquired in deterministic key order.
  PERFORM 1
  FROM public."Tenant" AS tenant_lock
  WHERE tenant_lock."id" = p_tenant_id
  FOR UPDATE;
  PERFORM 1
  FROM public."TenantModuleEntitlement" AS entitlement_lock
  WHERE entitlement_lock."tenantId" = p_tenant_id
  ORDER BY entitlement_lock."id" COLLATE "C"
  FOR UPDATE;

  SELECT target_invite.*
  INTO locked_invite
  FROM public."UserInvite" AS target_invite
  INNER JOIN public."IdentityEmployeeInviteIssueCommandV1" AS source
    ON source."tenantId" = target_invite."tenantId"
   AND source."inviteId" = target_invite."id"
   AND source."tokenHash" = target_invite."tokenHash"
  INNER JOIN public."IdentityEmployeeMailOutboxV1" AS target_outbox
    ON target_outbox."tenantId" = source."tenantId"
   AND target_outbox."issueCommandId" = source."id"
   AND target_outbox."inviteId" = source."inviteId"
   AND target_outbox."tokenHash" = source."tokenHash"
  WHERE target_invite."tenantId" = p_tenant_id
    AND target_invite."id" = p_invite_id
    AND target_invite."tokenHash" = p_presented_token_hash
  FOR UPDATE OF target_invite, target_outbox;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  canonical_email := locked_invite."email";
  IF canonical_email IS NULL THEN
    RETURN FALSE;
  END IF;

  IF locked_invite."customRoleId" IS NOT NULL THEN
    PERFORM 1
    FROM public."UserAccessRole" AS custom_role_lock
    WHERE custom_role_lock."tenantId" = p_tenant_id
      AND custom_role_lock."id" = locked_invite."customRoleId"
    FOR UPDATE;
  END IF;
  PERFORM 1
  FROM public."Store" AS store_lock
  WHERE store_lock."tenantId" = p_tenant_id
    AND store_lock."id" = ANY(locked_invite."storeIds")
  ORDER BY store_lock."id" COLLATE "C"
  FOR UPDATE;

  IF public."identity_email_claim_lock_v1"(canonical_email)
       IS DISTINCT FROM canonical_email
  THEN
    RETURN FALSE;
  END IF;
  server_now := pg_catalog.clock_timestamp();

  RETURN EXISTS (
    SELECT 1
    FROM public."UserInvite" AS target_invite
    INNER JOIN public."Tenant" AS target_tenant
      ON target_tenant."id" = target_invite."tenantId"
    INNER JOIN public."IdentityEmployeeInviteIssueCommandV1" AS source
      ON source."tenantId" = target_invite."tenantId"
     AND source."inviteId" = target_invite."id"
     AND source."tokenHash" = target_invite."tokenHash"
     AND source."role" = target_invite."role"
     AND source."customRoleId" IS NOT DISTINCT FROM
       target_invite."customRoleId"
     AND source."accessScope" = target_invite."accessScope"
     AND source."storeIds" = target_invite."storeIds"
     AND source."claimRevision" = target_invite."identityClaimRevision"
    INNER JOIN public."IdentityEmployeeMailOutboxV1" AS target_outbox
      ON target_outbox."tenantId" = source."tenantId"
     AND target_outbox."issueCommandId" = source."id"
     AND target_outbox."inviteId" = source."inviteId"
     AND target_outbox."tokenHash" = source."tokenHash"
     AND target_outbox."requestDigest" = source."requestDigest"
     AND target_outbox."messageKey" = source."messageKey"
     AND target_outbox."deliveryLocator" = source."deliveryLocator"
     AND target_outbox."expiresAt" = source."expiresAt"
    INNER JOIN public."IdentityEmailClaim" AS identity_claim
      ON identity_claim."emailCanonical" = target_invite."email"
     AND identity_claim."claimType" =
       'INVITE'::public."IdentityEmailClaimType"
     AND identity_claim."tenantId" = target_invite."tenantId"
     AND identity_claim."subjectId" = target_invite."id"
     AND identity_claim."revision" =
       target_invite."identityClaimRevision"
    INNER JOIN public."IdentityEmployeeMailDeliveryEventV1" AS sent_event
      ON sent_event."tenantId" = target_outbox."tenantId"
     AND sent_event."outboxId" = target_outbox."id"
     AND sent_event."inviteId" = target_outbox."inviteId"
     AND sent_event."transitionRevision" =
       target_outbox."transitionRevision"
     AND sent_event."eventType" = 'SENT'
     AND sent_event."requestDigest" = pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(
         target_outbox."tenantId" || E'\n' || target_outbox."id" || E'\n' ||
           target_outbox."leaseVersion"::TEXT ||
           E'\nPROVIDER_ACCEPTED\n' ||
           target_outbox."providerReceiptDigest" || E'\n' ||
           target_outbox."terminalAckDigest",
         'UTF8'
       )),
       'hex'
     )
     AND sent_event."eventDigest" = pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(
         target_outbox."tenantId" || E'\n' || target_outbox."id" || E'\n' ||
           target_outbox."transitionRevision"::TEXT || E'\nSENT',
         'UTF8'
       )),
       'hex'
     )
     AND sent_event."reasonCode" = 'SMTP_ACCEPTED'
     AND sent_event."eventAt" = target_outbox."sentAt"
    WHERE target_invite."tenantId" = p_tenant_id
      AND target_invite."id" = p_invite_id
      AND target_invite."tokenHash" = p_presented_token_hash
      AND target_invite."email" = canonical_email
      AND target_invite."role" <> 'OWNER'::public."UserRole"
      AND (
        target_invite."customRoleId" IS NULL
        OR EXISTS (
          SELECT 1
          FROM public."UserAccessRole" AS custom_role
          WHERE custom_role."tenantId" = target_invite."tenantId"
            AND custom_role."id" = target_invite."customRoleId"
        )
      )
      AND (
        (target_invite."accessScope" =
            'NETWORK'::public."UserAccessScope"
          AND pg_catalog.cardinality(target_invite."storeIds") = 0)
        OR
        (target_invite."accessScope" =
            'STORES'::public."UserAccessScope"
          AND pg_catalog.cardinality(target_invite."storeIds")
            BETWEEN 1 AND 100
          AND (
            SELECT pg_catalog.count(*)
            FROM public."Store" AS allowed_store
            WHERE allowed_store."tenantId" = target_invite."tenantId"
              AND allowed_store."id" = ANY(target_invite."storeIds")
              AND allowed_store."isActive" = TRUE
          ) = pg_catalog.cardinality(target_invite."storeIds"))
      )
      AND target_invite."acceptedAt" IS NULL
      AND target_invite."revokedAt" IS NULL
      AND target_invite."expiresAt" > server_now
      AND target_tenant."status"::TEXT = 'ACTIVE'
      AND target_tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
      AND target_tenant."onboardingStatus"::TEXT IN (
        'ONBOARDING', 'READY', 'ACTIVE'
      )
      AND target_tenant."trialStartsAt" IS NOT NULL
      AND target_tenant."trialStartsAt" <= server_now
      AND target_tenant."trialEndsAt" IS NOT NULL
      AND target_tenant."trialEndsAt" > server_now
      AND EXISTS (
        SELECT 1
        FROM public."TenantModuleEntitlement" AS entitlement
        WHERE entitlement."tenantId" = target_tenant."id"
          AND entitlement."module"::TEXT = 'USERS_ROLES'
          AND entitlement."profileRevision" =
            target_tenant."entitlementProfileRevision"
          AND entitlement."readEnabled" = TRUE
          AND entitlement."writeEnabled" = TRUE
          AND (
            entitlement."validFrom" IS NULL
            OR entitlement."validFrom" <= server_now
          )
          AND (
            entitlement."validUntil" IS NULL
            OR entitlement."validUntil" > server_now
          )
      )
      AND target_outbox."template" = 'EMPLOYEE_USER_INVITE'
      AND target_outbox."status" = 'SENT'
      AND target_outbox."expiresAt" > server_now
      AND target_outbox."secretCiphertext" IS NULL
      AND target_outbox."ciphertextClearedAt" IS NOT NULL
      AND target_outbox."providerAttemptKey" IS NOT NULL
      AND target_outbox."providerAuthorityDigest" IS NOT NULL
      AND target_outbox."messageIdDigest" IS NOT NULL
      AND target_outbox."providerReceiptDigest" IS NOT NULL
      AND target_outbox."terminalAckDigest" IS NOT NULL
      AND target_outbox."sentAt" IS NOT NULL
      AND target_outbox."terminalAt" = target_outbox."sentAt"
  );
END;
$$;

REVOKE ALL ON TABLE
  public."IdentityEmployeeInviteIssueCommandV1",
  public."IdentityEmployeeMailOutboxV1",
  public."IdentityEmployeeInviteRevokeCommandV1",
  public."IdentityEmployeeMailDeliveryEventV1",
  public."IdentityEmployeeMailTenantEnrollmentV1"
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public."identity_employee_invite_actor_assert_current189_v1"(TEXT, TEXT),
  public."identity_employee_invite_deliver_current189_v1"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, BYTEA, INTEGER, TEXT,
    TEXT, TIMESTAMP(3) WITH TIME ZONE
  ),
  public."identity_employee_invite_issue_current189_v1"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, BYTEA, INTEGER, TEXT,
    TEXT, TIMESTAMP(3) WITH TIME ZONE
  ),
  public."identity_employee_invite_reissue_current189_v1"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, BYTEA, INTEGER, TEXT,
    TEXT, TIMESTAMP(3) WITH TIME ZONE
  ),
  public."identity_employee_invite_revoke_current189_v1"(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
  ),
  public."identity_employee_mail_worker_assert_current189_v1"(TEXT, TEXT),
  public."identity_employee_mail_claim_current189_v1"(
    TEXT, TEXT, TEXT, TEXT
  ),
  public."identity_employee_mail_provider_mark_current189_v1"(
    TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
  ),
  public."identity_employee_mail_complete_current189_v1"(
    TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
  ),
  public."identity_employee_mail_reap_current189_v1"(
    TEXT, TEXT, INTEGER
  ),
  public."identity_employee_invite_delivery_assert_sent_current189_v1"(
    TEXT, TEXT, TEXT
  )
FROM PUBLIC;

COMMENT ON TABLE public."IdentityEmployeeMailOutboxV1" IS
  'CURRENT189 separate encrypted employee-invite outbox. NONCANONICAL and NOT_DEPLOYABLE; no runtime grants.';
COMMENT ON FUNCTION public."identity_employee_invite_issue_current189_v1"(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, BYTEA, INTEGER, TEXT,
  TEXT, TIMESTAMP(3) WITH TIME ZONE
) IS
  'Dormant CURRENT189 mailbox-bound employee invite issue RPC. It never returns token, URL, email or ciphertext.';
COMMENT ON FUNCTION public."identity_employee_mail_provider_mark_current189_v1"(
  TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'Dormant CURRENT189 provider marker. Ciphertext is irreversibly cleared before SMTP may be attempted.';
COMMENT ON FUNCTION
  public."identity_employee_invite_delivery_assert_sent_current189_v1"(
    TEXT, TEXT, TEXT
  ) IS
  'Dormant CURRENT189 employee-invite preview/accept gate. It returns only a boolean and requires exact terminal SENT provenance.';

COMMIT;
