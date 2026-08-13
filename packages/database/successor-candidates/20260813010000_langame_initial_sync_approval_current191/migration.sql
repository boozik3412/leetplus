-- CURRENT191: dormant persisted Langame initial-sync preflight and approval ledger.
-- NONCANONICAL / NOT_DEPLOYABLE / NO APPLICATION GRANTS / NO BUSINESS IMPORT.
BEGIN;

CREATE TABLE public."LangameInitialSyncPreflightV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "activationRequestId" VARCHAR(128) NOT NULL,
  "syncRequestId" VARCHAR(128) NOT NULL,
  "configDigest" CHAR(64) NOT NULL,
  "bindingDigest" CHAR(64) NOT NULL,
  "approvalDigest" CHAR(64) NOT NULL,
  "preflightReadSetDigest" CHAR(64) NOT NULL,
  "planDigest" CHAR(64) NOT NULL,
  "externalDomain" VARCHAR(253) NOT NULL,
  "externalClubId" VARCHAR(19) NOT NULL,
  "productsCount" INTEGER NOT NULL,
  "inventoryCount" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "confirmedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  CONSTRAINT "LangameInitialSyncPreflightV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameInitialSyncPreflightV1_status_check" CHECK (
    ("status" = 'PENDING_CONFIRMATION'
      AND "confirmedAt" IS NULL AND "expiredAt" IS NULL)
    OR ("status" = 'CONFIRMED'
      AND "confirmedAt" IS NOT NULL AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED'
      AND "confirmedAt" IS NULL AND "expiredAt" IS NOT NULL)
  ),
  CONSTRAINT "LangameInitialSyncPreflightV1_digest_check" CHECK (
    "configDigest" ~ '^[a-f0-9]{64}$'
    AND "bindingDigest" ~ '^[a-f0-9]{64}$'
    AND "approvalDigest" ~ '^[a-f0-9]{64}$'
    AND "preflightReadSetDigest" ~ '^[a-f0-9]{64}$'
    AND "planDigest" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "LangameInitialSyncPreflightV1_request_check" CHECK (
    "activationRequestId" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "syncRequestId" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "activationRequestId" <> "syncRequestId"
  ),
  CONSTRAINT "LangameInitialSyncPreflightV1_target_check" CHECK (
    "externalDomain" = pg_catalog.lower("externalDomain")
    AND "externalDomain" !~ '[/\\:]'
    AND (
      "externalDomain" = 'langame.ru'
      OR "externalDomain" LIKE '%.langame.ru'
      OR "externalDomain" = 'langamepro.ru'
      OR "externalDomain" LIKE '%.langamepro.ru'
    )
    AND "externalClubId" ~ '^[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT "LangameInitialSyncPreflightV1_count_check" CHECK (
    "productsCount" BETWEEN 0 AND 50000
    AND "inventoryCount" BETWEEN 0 AND 50000
  ),
  CONSTRAINT "LangameInitialSyncPreflightV1_expiry_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '15 minutes'
  )
);

CREATE TABLE public."LangameInitialSyncApprovalV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "preflightId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "syncRequestId" VARCHAR(128) NOT NULL,
  "confirmationRequestId" VARCHAR(128) NOT NULL,
  "confirmationRequestDigest" CHAR(64) NOT NULL,
  "approvalDigest" CHAR(64) NOT NULL,
  "preflightReadSetDigest" CHAR(64) NOT NULL,
  "planDigest" CHAR(64) NOT NULL,
  "approvedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameInitialSyncApprovalV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameInitialSyncApprovalV1_request_check" CHECK (
    "confirmationRequestId" ~ '^[A-Za-z0-9_-]{16,128}$'
  ),
  CONSTRAINT "LangameInitialSyncApprovalV1_digest_check" CHECK (
    "confirmationRequestDigest" ~ '^[a-f0-9]{64}$'
    AND "approvalDigest" ~ '^[a-f0-9]{64}$'
    AND "preflightReadSetDigest" ~ '^[a-f0-9]{64}$'
    AND "planDigest" ~ '^[a-f0-9]{64}$'
  )
);

CREATE TABLE public."LangameInitialSyncAuditEventV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "preflightId" TEXT NOT NULL,
  "eventType" VARCHAR(24) NOT NULL,
  "eventDigest" CHAR(64) NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "transactionId" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameInitialSyncAuditEventV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameInitialSyncAuditEventV1_type_check" CHECK (
    "eventType" IN ('PREFLIGHT_RECORDED', 'APPROVED', 'EXPIRED')
  ),
  CONSTRAINT "LangameInitialSyncAuditEventV1_digest_check" CHECK (
    "eventDigest" ~ '^[a-f0-9]{64}$'
  )
);

CREATE UNIQUE INDEX "langame_initial_sync_preflight_actor_request_uidx"
ON public."LangameInitialSyncPreflightV1" (
  "tenantId", "actorUserId", "syncRequestId"
);

CREATE UNIQUE INDEX "langame_initial_sync_preflight_approval_uidx"
ON public."LangameInitialSyncPreflightV1" ("approvalDigest");

CREATE INDEX "langame_initial_sync_preflight_expiry_idx"
ON public."LangameInitialSyncPreflightV1" ("expiresAt", "id")
WHERE "status" = 'PENDING_CONFIRMATION';

CREATE UNIQUE INDEX "langame_initial_sync_approval_preflight_uidx"
ON public."LangameInitialSyncApprovalV1" ("preflightId");

CREATE UNIQUE INDEX "langame_initial_sync_approval_actor_confirmation_uidx"
ON public."LangameInitialSyncApprovalV1" (
  "tenantId", "actorUserId", "confirmationRequestId"
);

CREATE UNIQUE INDEX "langame_initial_sync_audit_event_uidx"
ON public."LangameInitialSyncAuditEventV1" ("preflightId", "eventType");

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_actor_fkey"
FOREIGN KEY ("tenantId", "actorUserId")
REFERENCES public."User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_receipt_fkey"
FOREIGN KEY ("receiptId", "tenantId", "actorUserId")
REFERENCES public."LangameOnboardingStagedReceiptV1"(
  "id", "tenantId", "actorUserId"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_claim_fkey"
FOREIGN KEY ("claimId")
REFERENCES public."LangameExternalClubClaimV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_store_fkey"
FOREIGN KEY ("tenantId", "storeId")
REFERENCES public."Store"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_source_fkey"
FOREIGN KEY ("sourceId") REFERENCES public."IntegrationSource"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncPreflightV1"
ADD CONSTRAINT "langame_initial_sync_preflight_credential_fkey"
FOREIGN KEY ("credentialId") REFERENCES public."IntegrationCredential"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncApprovalV1"
ADD CONSTRAINT "langame_initial_sync_approval_preflight_fkey"
FOREIGN KEY ("preflightId")
REFERENCES public."LangameInitialSyncPreflightV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncAuditEventV1"
ADD CONSTRAINT "langame_initial_sync_audit_preflight_fkey"
FOREIGN KEY ("preflightId")
REFERENCES public."LangameInitialSyncPreflightV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public.langame_initial_sync_preflight_guard_current191_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  -- Only the two SECURITY DEFINER writers may perform the exact terminal
  -- transition assigned to them. The GUC alone is not transition authority.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight is append-preserving'
      USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting(
       'leetplus.langame_initial_sync_current191_writer', TRUE
     ) NOT IN ('confirm', 'expire') THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight writer is required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."tenantId" <> OLD."tenantId"
     OR NEW."actorUserId" <> OLD."actorUserId"
     OR NEW."receiptId" <> OLD."receiptId"
     OR NEW."claimId" <> OLD."claimId"
     OR NEW."storeId" <> OLD."storeId"
     OR NEW."sourceId" <> OLD."sourceId"
     OR NEW."credentialId" <> OLD."credentialId"
     OR NEW."activationRequestId" <> OLD."activationRequestId"
     OR NEW."syncRequestId" <> OLD."syncRequestId"
     OR NEW."configDigest" <> OLD."configDigest"
     OR NEW."bindingDigest" <> OLD."bindingDigest"
     OR NEW."approvalDigest" <> OLD."approvalDigest"
     OR NEW."preflightReadSetDigest" <> OLD."preflightReadSetDigest"
     OR NEW."planDigest" <> OLD."planDigest"
     OR NEW."externalDomain" <> OLD."externalDomain"
     OR NEW."externalClubId" <> OLD."externalClubId"
     OR NEW."productsCount" <> OLD."productsCount"
     OR NEW."inventoryCount" <> OLD."inventoryCount"
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."expiresAt" <> OLD."expiresAt"
  THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight binding is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.current_setting(
       'leetplus.langame_initial_sync_current191_writer', TRUE
     ) = 'confirm' THEN
    IF OLD."status" <> 'PENDING_CONFIRMATION'
       OR NEW."status" <> 'CONFIRMED'
       OR OLD."confirmedAt" IS NOT NULL
       OR NEW."confirmedAt" IS NULL
       OR NEW."expiredAt" IS DISTINCT FROM OLD."expiredAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT191 initial sync confirmation transition'
        USING ERRCODE = '42501';
    END IF;
  ELSIF pg_catalog.current_setting(
          'leetplus.langame_initial_sync_current191_writer', TRUE
        ) = 'expire' THEN
    IF OLD."status" <> 'PENDING_CONFIRMATION'
       OR NEW."status" <> 'EXPIRED'
       OR OLD."expiredAt" IS NOT NULL
       OR NEW."expiredAt" IS NULL
       OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT191 initial sync expiry transition'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_initial_sync_append_only_current191_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $append_only$
BEGIN
  RAISE EXCEPTION 'CURRENT191 initial sync ledger is append-only'
    USING ERRCODE = '42501';
END;
$append_only$;

CREATE TRIGGER langame_initial_sync_preflight_guard_current191_v1
BEFORE UPDATE OR DELETE ON public."LangameInitialSyncPreflightV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_initial_sync_preflight_guard_current191_v1();

CREATE TRIGGER langame_initial_sync_approval_append_only_current191_v1
BEFORE UPDATE OR DELETE ON public."LangameInitialSyncApprovalV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_initial_sync_append_only_current191_v1();

CREATE TRIGGER langame_initial_sync_audit_append_only_current191_v1
BEFORE UPDATE OR DELETE ON public."LangameInitialSyncAuditEventV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_initial_sync_append_only_current191_v1();

CREATE FUNCTION public.langame_initial_sync_record_preflight_current191_v1(
  target_preflight_id TEXT,
  target_tenant_id TEXT,
  actor_user_id TEXT,
  target_receipt_id TEXT,
  target_claim_id TEXT,
  target_store_id TEXT,
  target_source_id TEXT,
  target_credential_id TEXT,
  activation_request_id TEXT,
  sync_request_id TEXT,
  expected_config_digest TEXT,
  expected_binding_digest TEXT,
  approval_digest TEXT,
  preflight_read_set_digest TEXT,
  plan_digest TEXT,
  target_external_domain TEXT,
  target_external_club_id TEXT,
  products_count INTEGER,
  inventory_count INTEGER
)
RETURNS TABLE (
  "preflightId" TEXT,
  "status" TEXT,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "planDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $record$
DECLARE
  existing public."LangameInitialSyncPreflightV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  inserted_count INTEGER;
BEGIN
  IF target_preflight_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR activation_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR sync_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR activation_request_id = sync_request_id
     OR expected_config_digest !~ '^[a-f0-9]{64}$'
     OR expected_binding_digest !~ '^[a-f0-9]{64}$'
     OR approval_digest !~ '^[a-f0-9]{64}$'
     OR preflight_read_set_digest !~ '^[a-f0-9]{64}$'
     OR plan_digest !~ '^[a-f0-9]{64}$'
     OR products_count NOT BETWEEN 0 AND 50000
     OR inventory_count NOT BETWEEN 0 AND 50000
  THEN
    RAISE EXCEPTION 'Invalid CURRENT191 initial sync preflight request'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."tenantId" = target_tenant_id
    AND decision."decision" = 'GO'
    AND decision."consumedAt" IS NOT NULL
    AND decision."revokedAt" IS NULL
    AND decision."validUntil" > server_now
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."LangameOnboardingStagedReceiptV1" AS receipt
  INNER JOIN public."LangameExternalClubClaimV1" AS claim
    ON claim."id" = receipt."claimId"
   AND claim."tenantId" = receipt."tenantId"
   AND claim."storeId" = receipt."storeId"
   AND claim."receiptId" = receipt."id"
  INNER JOIN public."Store" AS store
    ON store."tenantId" = receipt."tenantId"
   AND store."id" = receipt."storeId"
  INNER JOIN public."IntegrationSource" AS source
    ON source."tenantId" = store."tenantId"
   AND source."id" = store."integrationSourceId"
  INNER JOIN public."IntegrationCredential" AS credential
    ON credential."tenantId" = source."tenantId"
   AND credential."id" = source."credentialId"
  INNER JOIN public."LangameOnboardingAuditEventV1" AS audit
    ON audit."tenantId" = receipt."tenantId"
   AND audit."receiptId" = receipt."id"
   AND audit."eventType" = 'ACTIVATED'
  WHERE receipt."id" = target_receipt_id
    AND receipt."tenantId" = target_tenant_id
    AND receipt."actorUserId" = actor_user_id
    AND receipt."status" = 'CONSUMED'
    AND receipt."claimId" = target_claim_id
    AND receipt."storeId" = target_store_id
    AND receipt."activationRequestId" = activation_request_id
    AND receipt."configDigest" = expected_config_digest
    AND receipt."bindingDigest" = expected_binding_digest
    AND claim."claimDigest" = expected_binding_digest
    AND claim."activatedAt" = receipt."consumedAt"
    AND claim."externalDomain" = target_external_domain
    AND claim."externalClubId" = target_external_club_id
    AND store."isActive" = TRUE
    AND store."externalProvider" = 'LANGAME'
    AND store."externalDomain" = target_external_domain
    AND store."externalClubId" = target_external_club_id
    AND store."integrationSourceId" = target_source_id
    AND source."provider" = 'LANGAME'
    AND source."domain" = target_external_domain
    AND source."baseUrl" = 'https://' || target_external_domain || '/public_api'
    AND source."isActive" = TRUE
    AND source."credentialId" = target_credential_id
    AND credential."provider" = 'LANGAME'
    AND credential."isActive" = TRUE
    AND credential."apiKeyEncrypted" IS NOT NULL
    AND credential."apiKeyEnvVar" IS NULL
    AND audit."requestDigest" = receipt."activationRequestDigest"
    AND audit."configDigest" = expected_config_digest
    AND audit."bindingDigest" = expected_binding_digest
    AND audit."claimDigest" = expected_binding_digest
    AND audit."eventAt" = receipt."consumedAt"
  FOR SHARE OF receipt, claim, store, source, credential;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync binding is unavailable'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public."LangameInitialSyncPreflightV1" (
    "id", "tenantId", "actorUserId", "receiptId", "claimId", "storeId",
    "sourceId", "credentialId", "activationRequestId", "syncRequestId",
    "configDigest", "bindingDigest", "approvalDigest",
    "preflightReadSetDigest", "planDigest", "externalDomain",
    "externalClubId", "productsCount", "inventoryCount", "expiresAt"
  ) VALUES (
    target_preflight_id, target_tenant_id, actor_user_id, target_receipt_id,
    target_claim_id, target_store_id, target_source_id, target_credential_id,
    activation_request_id, sync_request_id, expected_config_digest,
    expected_binding_digest, approval_digest, preflight_read_set_digest,
    plan_digest, target_external_domain, target_external_club_id,
    products_count, inventory_count, server_now + INTERVAL '15 minutes'
  ) ON CONFLICT ("tenantId", "actorUserId", "syncRequestId") DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT candidate.* INTO existing
  FROM public."LangameInitialSyncPreflightV1" AS candidate
  WHERE candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
    AND candidate."syncRequestId" = sync_request_id
  FOR UPDATE;

  IF existing."receiptId" <> target_receipt_id
     OR existing."claimId" <> target_claim_id
     OR existing."storeId" <> target_store_id
     OR existing."sourceId" <> target_source_id
     OR existing."credentialId" <> target_credential_id
     OR existing."activationRequestId" <> activation_request_id
     OR existing."configDigest" <> expected_config_digest
     OR existing."bindingDigest" <> expected_binding_digest
     OR existing."approvalDigest" <> approval_digest
     OR existing."preflightReadSetDigest" <> preflight_read_set_digest
     OR existing."planDigest" <> plan_digest
     OR existing."externalDomain" <> target_external_domain
     OR existing."externalClubId" <> target_external_club_id
     OR existing."productsCount" <> products_count
     OR existing."inventoryCount" <> inventory_count
  THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight replay mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF inserted_count = 1 THEN
    INSERT INTO public."LangameInitialSyncAuditEventV1" (
      "id", "tenantId", "preflightId", "eventType", "eventDigest",
      "eventAt", "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, existing."id",
      'PREFLIGHT_RECORDED', plan_digest, server_now,
      pg_catalog.txid_current()::TEXT
    );
  END IF;

  RETURN QUERY SELECT existing."id", existing."status"::TEXT,
    existing."expiresAt", existing."planDigest"::TEXT,
    (inserted_count = 0);
END;
$record$;

CREATE FUNCTION public.langame_initial_sync_confirm_current191_v1(
  target_tenant_id TEXT,
  actor_user_id TEXT,
  target_preflight_id TEXT,
  confirmation_request_id TEXT,
  confirmation_request_digest TEXT,
  expected_approval_digest TEXT,
  expected_plan_digest TEXT
)
RETURNS TABLE (
  "approvalId" TEXT,
  "status" TEXT,
  "approvedAt" TIMESTAMP(3) WITH TIME ZONE,
  "planDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $confirm$
DECLARE
  preflight public."LangameInitialSyncPreflightV1"%ROWTYPE;
  approval public."LangameInitialSyncApprovalV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
BEGIN
  IF target_preflight_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR confirmation_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR confirmation_request_digest !~ '^[a-f0-9]{64}$'
     OR expected_approval_digest !~ '^[a-f0-9]{64}$'
     OR expected_plan_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT191 initial sync confirmation'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."tenantId" = target_tenant_id
    AND decision."decision" = 'GO'
    AND decision."consumedAt" IS NOT NULL
    AND decision."revokedAt" IS NULL
    AND decision."validUntil" > server_now
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO preflight
  FROM public."LangameInitialSyncPreflightV1" AS candidate
  WHERE candidate."id" = target_preflight_id
    AND candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF preflight."approvalDigest" <> expected_approval_digest
     OR preflight."planDigest" <> expected_plan_digest
  THEN
    RAISE EXCEPTION 'CURRENT191 initial sync confirmation mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF preflight."status" = 'CONFIRMED' THEN
    SELECT candidate.* INTO STRICT approval
    FROM public."LangameInitialSyncApprovalV1" AS candidate
    WHERE candidate."preflightId" = preflight."id";
    IF approval."confirmationRequestId" <> confirmation_request_id
       OR approval."confirmationRequestDigest" <> confirmation_request_digest
       OR approval."approvalDigest" <> expected_approval_digest
       OR approval."planDigest" <> expected_plan_digest
    THEN
      RAISE EXCEPTION 'CURRENT191 initial sync confirmation replay mismatch'
        USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT approval."id", 'REPLAYED'::TEXT,
      approval."approvedAt", approval."planDigest"::TEXT, TRUE;
    RETURN;
  END IF;

  IF preflight."status" <> 'PENDING_CONFIRMATION'
     OR preflight."expiresAt" <= server_now
  THEN
    RAISE EXCEPTION 'CURRENT191 initial sync preflight is stale'
      USING ERRCODE = '55000';
  END IF;

  -- Confirmation is a fresh authorization boundary, not acceptance of a
  -- stale preflight snapshot. Re-lock and re-prove the complete CURRENT188
  -- activation/Store/source/credential binding immediately before approval.
  PERFORM 1
  FROM public."LangameOnboardingStagedReceiptV1" AS receipt
  INNER JOIN public."LangameExternalClubClaimV1" AS claim
    ON claim."id" = receipt."claimId"
   AND claim."tenantId" = receipt."tenantId"
   AND claim."storeId" = receipt."storeId"
   AND claim."receiptId" = receipt."id"
  INNER JOIN public."Store" AS store
    ON store."tenantId" = receipt."tenantId"
   AND store."id" = receipt."storeId"
  INNER JOIN public."IntegrationSource" AS source
    ON source."tenantId" = store."tenantId"
   AND source."id" = store."integrationSourceId"
  INNER JOIN public."IntegrationCredential" AS credential
    ON credential."tenantId" = source."tenantId"
   AND credential."id" = source."credentialId"
  INNER JOIN public."LangameOnboardingAuditEventV1" AS audit
    ON audit."tenantId" = receipt."tenantId"
   AND audit."receiptId" = receipt."id"
   AND audit."eventType" = 'ACTIVATED'
  WHERE receipt."id" = preflight."receiptId"
    AND receipt."tenantId" = preflight."tenantId"
    AND receipt."actorUserId" = preflight."actorUserId"
    AND receipt."status" = 'CONSUMED'
    AND receipt."claimId" = preflight."claimId"
    AND receipt."storeId" = preflight."storeId"
    AND receipt."activationRequestId" = preflight."activationRequestId"
    AND receipt."configDigest" = preflight."configDigest"
    AND receipt."bindingDigest" = preflight."bindingDigest"
    AND claim."claimDigest" = preflight."bindingDigest"
    AND claim."externalDomain" = preflight."externalDomain"
    AND claim."externalClubId" = preflight."externalClubId"
    AND claim."activatedAt" = receipt."consumedAt"
    AND store."isActive" = TRUE
    AND store."externalProvider" = 'LANGAME'
    AND store."externalDomain" = preflight."externalDomain"
    AND store."externalClubId" = preflight."externalClubId"
    AND store."integrationSourceId" = preflight."sourceId"
    AND source."provider" = 'LANGAME'
    AND source."domain" = preflight."externalDomain"
    AND source."baseUrl" = 'https://' || preflight."externalDomain" || '/public_api'
    AND source."isActive" = TRUE
    AND source."credentialId" = preflight."credentialId"
    AND credential."provider" = 'LANGAME'
    AND credential."isActive" = TRUE
    AND credential."apiKeyEncrypted" IS NOT NULL
    AND credential."apiKeyEnvVar" IS NULL
    AND audit."requestDigest" = receipt."activationRequestDigest"
    AND audit."configDigest" = preflight."configDigest"
    AND audit."bindingDigest" = preflight."bindingDigest"
    AND audit."claimDigest" = preflight."bindingDigest"
    AND audit."eventAt" = receipt."consumedAt"
  FOR SHARE OF receipt, claim, store, source, credential;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT191 initial sync binding changed before confirmation'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public."LangameInitialSyncApprovalV1" (
    "id", "tenantId", "actorUserId", "preflightId", "receiptId",
    "storeId", "sourceId", "syncRequestId", "confirmationRequestId",
    "confirmationRequestDigest", "approvalDigest",
    "preflightReadSetDigest", "planDigest", "approvedAt"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, actor_user_id,
    preflight."id", preflight."receiptId", preflight."storeId",
    preflight."sourceId", preflight."syncRequestId", confirmation_request_id,
    confirmation_request_digest, preflight."approvalDigest",
    preflight."preflightReadSetDigest", preflight."planDigest", server_now
  ) RETURNING * INTO approval;

  PERFORM pg_catalog.set_config(
    'leetplus.langame_initial_sync_current191_writer', 'confirm', TRUE
  );
  UPDATE public."LangameInitialSyncPreflightV1"
  SET "status" = 'CONFIRMED', "confirmedAt" = server_now
  WHERE "id" = preflight."id";

  INSERT INTO public."LangameInitialSyncAuditEventV1" (
    "id", "tenantId", "preflightId", "eventType", "eventDigest",
    "eventAt", "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, preflight."id",
    'APPROVED', confirmation_request_digest, server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT approval."id", 'APPROVED'::TEXT,
    approval."approvedAt", approval."planDigest"::TEXT, FALSE;
END;
$confirm$;

CREATE FUNCTION public.langame_initial_sync_expire_current191_v1(
  target_tenant_id TEXT,
  expire_limit INTEGER DEFAULT 100
)
RETURNS TABLE ("expiredCount" INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $expire$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  expired_count INTEGER;
BEGIN
  IF expire_limit < 1 OR expire_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid CURRENT191 initial sync expiry limit'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config(
    'leetplus.langame_initial_sync_current191_writer', 'expire', TRUE
  );
  WITH stale AS (
    SELECT candidate."id"
    FROM public."LangameInitialSyncPreflightV1" AS candidate
    WHERE candidate."tenantId" = target_tenant_id
      AND candidate."status" = 'PENDING_CONFIRMATION'
      AND candidate."expiresAt" <= server_now
    ORDER BY candidate."expiresAt", candidate."id"
    LIMIT expire_limit
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public."LangameInitialSyncPreflightV1" AS candidate
    SET "status" = 'EXPIRED', "expiredAt" = server_now
    FROM stale
    WHERE candidate."id" = stale."id"
    RETURNING candidate."id", candidate."tenantId", candidate."planDigest"
  ), audited AS (
    INSERT INTO public."LangameInitialSyncAuditEventV1" (
      "id", "tenantId", "preflightId", "eventType", "eventDigest",
      "eventAt", "transactionId"
    ) SELECT pg_catalog.gen_random_uuid()::TEXT, updated."tenantId",
      updated."id", 'EXPIRED', updated."planDigest", server_now,
      pg_catalog.txid_current()::TEXT
    FROM updated
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO expired_count FROM audited;
  RETURN QUERY SELECT expired_count;
END;
$expire$;

REVOKE ALL ON TABLE public."LangameInitialSyncPreflightV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameInitialSyncApprovalV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameInitialSyncAuditEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_preflight_guard_current191_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_append_only_current191_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_record_preflight_current191_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_confirm_current191_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_expire_current191_v1(
  TEXT, INTEGER
) FROM PUBLIC;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'LangameInitialSyncPreflightV1',
        'LangameInitialSyncApprovalV1',
        'LangameInitialSyncAuditEventV1'
      )
      AND grantee <> pg_catalog.current_user
  ) OR EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name LIKE 'langame_initial_sync_%_current191_v1'
      AND grantee <> pg_catalog.current_user
  ) THEN
    RAISE EXCEPTION 'CURRENT191 initial sync objects require owner-only ACL';
  END IF;
END;
$acl$;

COMMIT;
