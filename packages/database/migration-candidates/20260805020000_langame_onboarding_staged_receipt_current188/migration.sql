-- CURRENT188: dormant Langame staged onboarding receipt and exact club claim.
-- NONCANONICAL / NOT_DEPLOYABLE / NO APPLICATION GRANTS.
BEGIN;

CREATE TABLE public."LangameOnboardingStagedReceiptV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorDigest" CHAR(64) NOT NULL,
  "requestId" VARCHAR(128) NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "configDigest" CHAR(64) NOT NULL,
  "credentialDigest" CHAR(64) NOT NULL,
  "bindingDigest" CHAR(64) NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" public."IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" VARCHAR(253) NOT NULL,
  "externalClubId" VARCHAR(19) NOT NULL,
  "stagedApiKeyEncrypted" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "ciphertextClearedAt" TIMESTAMP(3) WITH TIME ZONE,
  "activationRequestId" VARCHAR(128),
  "activationRequestDigest" CHAR(64),
  "claimId" TEXT,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_status_check" CHECK (
    ("status" = 'PENDING'
      AND "stagedApiKeyEncrypted" IS NOT NULL
      AND "consumedAt" IS NULL
      AND "ciphertextClearedAt" IS NULL
      AND "activationRequestId" IS NULL
      AND "activationRequestDigest" IS NULL
      AND "claimId" IS NULL)
    OR
    ("status" = 'CONSUMED'
      AND "stagedApiKeyEncrypted" IS NULL
      AND "consumedAt" IS NOT NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "activationRequestId" IS NOT NULL
      AND "activationRequestDigest" IS NOT NULL
      AND "claimId" IS NOT NULL)
    OR
    ("status" = 'EXPIRED'
      AND "stagedApiKeyEncrypted" IS NULL
      AND "consumedAt" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "activationRequestId" IS NULL
      AND "activationRequestDigest" IS NULL
      AND "claimId" IS NULL)
  ),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_domain_check" CHECK (
    "externalDomain" = pg_catalog.lower("externalDomain")
    AND "externalDomain" !~ '[/\\:]'
    AND (
      "externalDomain" = 'langame.ru'
      OR "externalDomain" LIKE '%.langame.ru'
      OR "externalDomain" = 'langamepro.ru'
      OR "externalDomain" LIKE '%.langamepro.ru'
    )
  ),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_club_check" CHECK (
    "externalClubId" ~ '^[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_digest_check" CHECK (
    "actorDigest" ~ '^[a-f0-9]{64}$'
    AND "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "configDigest" ~ '^[a-f0-9]{64}$'
    AND "credentialDigest" ~ '^[a-f0-9]{64}$'
    AND "bindingDigest" ~ '^[a-f0-9]{64}$'
    AND (
      "activationRequestDigest" IS NULL
      OR "activationRequestDigest" ~ '^[a-f0-9]{64}$'
    )
  ),
  CONSTRAINT "LangameOnboardingStagedReceiptV1_expiry_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '15 minutes'
  )
);

CREATE TABLE public."LangameExternalClubClaimV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "provider" public."IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" VARCHAR(253) NOT NULL,
  "externalClubId" VARCHAR(19) NOT NULL,
  "claimDigest" CHAR(64) NOT NULL,
  "activatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameExternalClubClaimV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameExternalClubClaimV1_club_check" CHECK (
    "externalClubId" ~ '^[1-9][0-9]{0,18}$'
  ),
  CONSTRAINT "LangameExternalClubClaimV1_digest_check" CHECK (
    "claimDigest" ~ '^[a-f0-9]{64}$'
  )
);

CREATE TABLE public."LangameOnboardingAuditEventV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "actorDigest" CHAR(64) NOT NULL,
  "eventType" VARCHAR(32) NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "configDigest" CHAR(64) NOT NULL,
  "bindingDigest" CHAR(64) NOT NULL,
  "claimDigest" CHAR(64),
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "transactionId" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameOnboardingAuditEventV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameOnboardingAuditEventV1_type_check" CHECK (
    "eventType" IN ('STAGED', 'ACTIVATED', 'EXPIRED')
  ),
  CONSTRAINT "LangameOnboardingAuditEventV1_digest_check" CHECK (
    "actorDigest" ~ '^[a-f0-9]{64}$'
    AND "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "configDigest" ~ '^[a-f0-9]{64}$'
    AND "bindingDigest" ~ '^[a-f0-9]{64}$'
    AND ("claimDigest" IS NULL OR "claimDigest" ~ '^[a-f0-9]{64}$')
  )
);

CREATE UNIQUE INDEX "langame_onboarding_receipt_actor_request_uidx"
ON public."LangameOnboardingStagedReceiptV1" (
  "tenantId", "actorUserId", "requestId"
);

CREATE UNIQUE INDEX "langame_onboarding_receipt_id_tenant_actor_uidx"
ON public."LangameOnboardingStagedReceiptV1" (
  "id", "tenantId", "actorUserId"
);

CREATE INDEX "langame_onboarding_receipt_pending_expiry_idx"
ON public."LangameOnboardingStagedReceiptV1" ("expiresAt", "id")
WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "langame_external_club_claim_global_uidx"
ON public."LangameExternalClubClaimV1" (
  "provider", "externalDomain", "externalClubId"
);

CREATE UNIQUE INDEX "langame_external_club_claim_store_uidx"
ON public."LangameExternalClubClaimV1" ("tenantId", "storeId");

CREATE UNIQUE INDEX "langame_external_club_claim_receipt_uidx"
ON public."LangameExternalClubClaimV1" ("receiptId");

CREATE INDEX "langame_external_club_claim_tenant_idx"
ON public."LangameExternalClubClaimV1" ("tenantId", "activatedAt");

CREATE UNIQUE INDEX "langame_onboarding_audit_receipt_event_uidx"
ON public."LangameOnboardingAuditEventV1" ("receiptId", "eventType");

CREATE INDEX "langame_onboarding_audit_tenant_event_idx"
ON public."LangameOnboardingAuditEventV1" (
  "tenantId", "eventAt", "receiptId"
);

ALTER TABLE public."LangameOnboardingStagedReceiptV1"
ADD CONSTRAINT "langame_onboarding_receipt_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameOnboardingStagedReceiptV1"
ADD CONSTRAINT "langame_onboarding_receipt_actor_fkey"
FOREIGN KEY ("tenantId", "actorUserId")
REFERENCES public."User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameOnboardingStagedReceiptV1"
ADD CONSTRAINT "langame_onboarding_receipt_store_fkey"
FOREIGN KEY ("tenantId", "storeId")
REFERENCES public."Store"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameExternalClubClaimV1"
ADD CONSTRAINT "langame_external_club_claim_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameExternalClubClaimV1"
ADD CONSTRAINT "langame_external_club_claim_store_fkey"
FOREIGN KEY ("tenantId", "storeId")
REFERENCES public."Store"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameExternalClubClaimV1"
ADD CONSTRAINT "langame_external_club_claim_receipt_fkey"
FOREIGN KEY ("receiptId")
REFERENCES public."LangameOnboardingStagedReceiptV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameOnboardingStagedReceiptV1"
ADD CONSTRAINT "langame_onboarding_receipt_claim_fkey"
FOREIGN KEY ("claimId") REFERENCES public."LangameExternalClubClaimV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."LangameOnboardingAuditEventV1"
ADD CONSTRAINT "langame_onboarding_audit_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameOnboardingAuditEventV1"
ADD CONSTRAINT "langame_onboarding_audit_receipt_fkey"
FOREIGN KEY ("receiptId")
REFERENCES public."LangameOnboardingStagedReceiptV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public.langame_onboarding_receipt_guard_current188_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
  writer_mode TEXT := pg_catalog.current_setting(
    'leetplus.langame_onboarding_current188_writer', true
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Langame onboarding receipts cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF writer_mode = 'activate' THEN
    IF OLD."status" <> 'PENDING'
       OR NEW."status" <> 'CONSUMED'
       OR (
         pg_catalog.to_jsonb(NEW)
         - ARRAY[
           'status',
           'stagedApiKeyEncrypted',
           'consumedAt',
           'ciphertextClearedAt',
           'activationRequestId',
           'activationRequestDigest',
           'claimId'
         ]::TEXT[]
       ) IS DISTINCT FROM (
         pg_catalog.to_jsonb(OLD)
         - ARRAY[
           'status',
           'stagedApiKeyEncrypted',
           'consumedAt',
           'ciphertextClearedAt',
           'activationRequestId',
           'activationRequestDigest',
           'claimId'
         ]::TEXT[]
       )
       OR NEW."stagedApiKeyEncrypted" IS NOT NULL
       OR NEW."consumedAt" IS NULL
       OR NEW."ciphertextClearedAt" IS NULL
       OR NEW."activationRequestId" IS NULL
       OR NEW."activationRequestDigest" IS NULL
       OR NEW."claimId" IS NULL
    THEN
      RAISE EXCEPTION 'Invalid Langame onboarding receipt transition'
        USING ERRCODE = '55000';
    END IF;
  ELSIF writer_mode = 'expire' THEN
    IF OLD."status" <> 'PENDING'
       OR NEW."status" <> 'EXPIRED'
       OR (
         pg_catalog.to_jsonb(NEW)
         - ARRAY[
           'status', 'stagedApiKeyEncrypted', 'ciphertextClearedAt'
         ]::TEXT[]
       ) IS DISTINCT FROM (
         pg_catalog.to_jsonb(OLD)
         - ARRAY[
           'status', 'stagedApiKeyEncrypted', 'ciphertextClearedAt'
         ]::TEXT[]
       )
       OR NEW."stagedApiKeyEncrypted" IS NOT NULL
       OR NEW."ciphertextClearedAt" IS NULL
    THEN
      RAISE EXCEPTION 'Invalid Langame onboarding expiry transition'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'Langame onboarding receipt mutation is sealed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_onboarding_append_only_guard_current188_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  RAISE EXCEPTION 'Langame onboarding evidence is append-only'
    USING ERRCODE = '55000';
END;
$guard$;

CREATE TRIGGER langame_onboarding_receipt_guard_current188_v1
BEFORE UPDATE OR DELETE
ON public."LangameOnboardingStagedReceiptV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_onboarding_receipt_guard_current188_v1();

CREATE TRIGGER langame_external_club_claim_guard_current188_v1
BEFORE UPDATE OR DELETE
ON public."LangameExternalClubClaimV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_onboarding_append_only_guard_current188_v1();

CREATE TRIGGER langame_onboarding_audit_guard_current188_v1
BEFORE UPDATE OR DELETE
ON public."LangameOnboardingAuditEventV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_onboarding_append_only_guard_current188_v1();

CREATE FUNCTION public.langame_onboarding_stage_receipt_current188_v1(
  proposed_receipt_id TEXT,
  target_tenant_id TEXT,
  actor_user_id TEXT,
  actor_digest TEXT,
  stage_request_id TEXT,
  stage_request_digest TEXT,
  stage_config_digest TEXT,
  stage_credential_digest TEXT,
  stage_binding_digest TEXT,
  target_store_id TEXT,
  target_external_domain TEXT,
  target_external_club_id TEXT,
  staged_api_key_encrypted TEXT
)
RETURNS TABLE (
  "receiptId" TEXT,
  "status" TEXT,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "bindingDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $stage$
DECLARE
  existing_receipt public."LangameOnboardingStagedReceiptV1"%ROWTYPE;
  inserted_count INTEGER;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
BEGIN
  IF proposed_receipt_id IS NULL OR pg_catalog.length(proposed_receipt_id) > 128
     OR target_tenant_id IS NULL OR pg_catalog.length(target_tenant_id) > 128
     OR actor_user_id IS NULL OR pg_catalog.length(actor_user_id) > 128
     OR target_store_id IS NULL OR pg_catalog.length(target_store_id) > 128
     OR stage_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR actor_digest !~ '^[a-f0-9]{64}$'
     OR stage_request_digest !~ '^[a-f0-9]{64}$'
     OR stage_config_digest !~ '^[a-f0-9]{64}$'
     OR stage_credential_digest !~ '^[a-f0-9]{64}$'
     OR stage_binding_digest !~ '^[a-f0-9]{64}$'
     OR target_external_club_id !~ '^[1-9][0-9]{0,18}$'
     OR staged_api_key_encrypted IS NULL
     OR pg_catalog.length(staged_api_key_encrypted) < 16
     OR pg_catalog.length(staged_api_key_encrypted) > 16384
  THEN
    RAISE EXCEPTION 'Invalid Langame onboarding stage request'
      USING ERRCODE = '22023';
  END IF;

  IF target_external_domain <> pg_catalog.lower(target_external_domain)
     OR target_external_domain ~ '[/\\:]'
     OR NOT (
       target_external_domain = 'langame.ru'
       OR target_external_domain LIKE '%.langame.ru'
       OR target_external_domain = 'langamepro.ru'
       OR target_external_domain LIKE '%.langamepro.ru'
     )
  THEN
    RAISE EXCEPTION 'Unsupported Langame onboarding domain'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN (
      'OWNER_INVITED', 'ONBOARDING', 'READY', 'ACTIVE'
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."TenantAdmissionDecision" AS decision
    WHERE decision."tenantId" = target_tenant_id
      AND decision."decision" = 'GO'
      AND decision."consumedAt" IS NOT NULL
      AND decision."revokedAt" IS NULL
      AND decision."validUntil" > server_now
  ) THEN
    RAISE EXCEPTION 'Langame onboarding admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
    AND store."id" = target_store_id
    AND store."isActive" = TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding store is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."LangameExternalClubClaimV1" AS claim
    WHERE claim."provider" = 'LANGAME'
      AND claim."externalDomain" = target_external_domain
      AND claim."externalClubId" = target_external_club_id
  ) THEN
    RAISE EXCEPTION 'Langame external club is already claimed'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public."LangameOnboardingStagedReceiptV1" (
    "id", "tenantId", "actorUserId", "actorDigest", "requestId",
    "requestDigest", "configDigest", "credentialDigest", "bindingDigest",
    "storeId", "provider", "externalDomain", "externalClubId",
    "stagedApiKeyEncrypted", "status", "expiresAt", "createdAt"
  ) VALUES (
    proposed_receipt_id, target_tenant_id, actor_user_id, actor_digest,
    stage_request_id, stage_request_digest, stage_config_digest,
    stage_credential_digest, stage_binding_digest, target_store_id, 'LANGAME',
    target_external_domain, target_external_club_id, staged_api_key_encrypted,
    'PENDING', server_now + INTERVAL '15 minutes', server_now
  )
  ON CONFLICT ("tenantId", "actorUserId", "requestId") DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT receipt.*
  INTO existing_receipt
  FROM public."LangameOnboardingStagedReceiptV1" AS receipt
  WHERE receipt."tenantId" = target_tenant_id
    AND receipt."actorUserId" = actor_user_id
    AND receipt."requestId" = stage_request_id
  FOR UPDATE;

  IF NOT FOUND
     OR existing_receipt."requestDigest" <> stage_request_digest
     OR existing_receipt."configDigest" <> stage_config_digest
     OR existing_receipt."credentialDigest" <> stage_credential_digest
     OR existing_receipt."bindingDigest" <> stage_binding_digest
     OR existing_receipt."storeId" <> target_store_id
     OR existing_receipt."externalDomain" <> target_external_domain
     OR existing_receipt."externalClubId" <> target_external_club_id
     OR existing_receipt."actorDigest" <> actor_digest
     OR existing_receipt."status" <> 'PENDING'
     OR existing_receipt."expiresAt" <= server_now
  THEN
    RAISE EXCEPTION 'Langame onboarding stage replay mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF inserted_count = 0 THEN
    RETURN QUERY SELECT
      existing_receipt."id",
      existing_receipt."status"::TEXT,
      existing_receipt."expiresAt",
      existing_receipt."bindingDigest"::TEXT,
      TRUE;
    RETURN;
  END IF;

  INSERT INTO public."LangameOnboardingAuditEventV1" (
    "id", "tenantId", "receiptId", "actorDigest", "eventType",
    "requestDigest", "configDigest", "bindingDigest", "claimDigest",
    "eventAt", "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT,
    target_tenant_id,
    existing_receipt."id",
    actor_digest,
    'STAGED',
    stage_request_digest,
    stage_config_digest,
    stage_binding_digest,
    NULL,
    server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT
    existing_receipt."id",
    'PENDING'::TEXT,
    existing_receipt."expiresAt",
    existing_receipt."bindingDigest"::TEXT,
    FALSE;
END;
$stage$;

CREATE FUNCTION public.langame_onboarding_activate_current188_v1(
  target_tenant_id TEXT,
  actor_user_id TEXT,
  target_receipt_id TEXT,
  activation_request_id TEXT,
  activation_request_digest TEXT,
  expected_config_digest TEXT,
  expected_binding_digest TEXT,
  target_store_id TEXT,
  target_external_domain TEXT,
  target_external_club_id TEXT
)
RETURNS TABLE (
  "receiptId" TEXT,
  "status" TEXT,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "claimDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $activate$
DECLARE
  receipt public."LangameOnboardingStagedReceiptV1"%ROWTYPE;
  current_store public."Store"%ROWTYPE;
  credential_id TEXT;
  source_id TEXT;
  claim_id TEXT;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
BEGIN
  IF activation_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR activation_request_digest !~ '^[a-f0-9]{64}$'
     OR expected_config_digest !~ '^[a-f0-9]{64}$'
     OR expected_binding_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid Langame onboarding activation request'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."TenantAdmissionDecision" AS decision
    WHERE decision."tenantId" = target_tenant_id
      AND decision."decision" = 'GO'
      AND decision."consumedAt" IS NOT NULL
      AND decision."revokedAt" IS NULL
      AND decision."validUntil" > server_now
  ) THEN
    RAISE EXCEPTION 'Langame onboarding admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT store.*
  INTO current_store
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
    AND store."id" = target_store_id
    AND store."isActive" = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding store is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.*
  INTO receipt
  FROM public."LangameOnboardingStagedReceiptV1" AS candidate
  WHERE candidate."id" = target_receipt_id
    AND candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding receipt is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF receipt."configDigest" <> expected_config_digest
     OR receipt."bindingDigest" <> expected_binding_digest
     OR receipt."storeId" <> target_store_id
     OR receipt."externalDomain" <> target_external_domain
     OR receipt."externalClubId" <> target_external_club_id
  THEN
    RAISE EXCEPTION 'Langame onboarding activation binding mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF receipt."status" = 'CONSUMED' THEN
    IF receipt."activationRequestId" <> activation_request_id
       OR receipt."activationRequestDigest" <> activation_request_digest
       OR receipt."claimId" IS NULL
    THEN
      RAISE EXCEPTION 'Langame onboarding receipt replay rejected'
        USING ERRCODE = '55000';
    END IF;

    RETURN QUERY SELECT
      receipt."id",
      'REPLAYED'::TEXT,
      receipt."consumedAt",
      receipt."bindingDigest"::TEXT,
      TRUE;
    RETURN;
  END IF;

  IF receipt."status" <> 'PENDING'
     OR receipt."expiresAt" <= server_now
     OR receipt."stagedApiKeyEncrypted" IS NULL
  THEN
    RAISE EXCEPTION 'Langame onboarding receipt is stale'
      USING ERRCODE = '55000';
  END IF;

  IF current_store."externalProvider" IS NOT NULL
     AND NOT (
       current_store."externalProvider" = 'LANGAME'
       AND current_store."externalDomain" = target_external_domain
       AND current_store."externalClubId" = target_external_club_id
     )
  THEN
    RAISE EXCEPTION 'Store already has a different external club binding'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."LangameExternalClubClaimV1" AS existing_claim
    WHERE existing_claim."provider" = 'LANGAME'
      AND existing_claim."externalDomain" = target_external_domain
      AND existing_claim."externalClubId" = target_external_club_id
  ) THEN
    RAISE EXCEPTION 'Langame external club is already claimed'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public."IntegrationCredential" (
    "id", "tenantId", "provider", "name", "apiKeyEncrypted", "apiKeyEnvVar",
    "isActive", "createdAt", "updatedAt"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT,
    target_tenant_id,
    'LANGAME',
    'Langame API key',
    receipt."stagedApiKeyEncrypted",
    NULL,
    TRUE,
    server_now,
    server_now
  )
  ON CONFLICT ("tenantId", "provider", "name") DO UPDATE SET
    "apiKeyEncrypted" = EXCLUDED."apiKeyEncrypted",
    "apiKeyEnvVar" = NULL,
    "isActive" = TRUE,
    "updatedAt" = server_now
  RETURNING "id" INTO credential_id;

  INSERT INTO public."IntegrationSource" (
    "id", "tenantId", "credentialId", "provider", "name", "baseUrl",
    "domain", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT,
    target_tenant_id,
    credential_id,
    'LANGAME',
    target_external_domain,
    'https://' || target_external_domain || '/public_api',
    target_external_domain,
    TRUE,
    server_now,
    server_now
  )
  ON CONFLICT ("tenantId", "provider", "domain") DO UPDATE SET
    "credentialId" = EXCLUDED."credentialId",
    "baseUrl" = EXCLUDED."baseUrl",
    "isActive" = TRUE,
    "updatedAt" = server_now
  RETURNING "id" INTO source_id;

  claim_id := pg_catalog.gen_random_uuid()::TEXT;
  INSERT INTO public."LangameExternalClubClaimV1" (
    "id", "tenantId", "storeId", "receiptId", "provider",
    "externalDomain", "externalClubId", "claimDigest", "activatedAt"
  ) VALUES (
    claim_id,
    target_tenant_id,
    target_store_id,
    target_receipt_id,
    'LANGAME',
    target_external_domain,
    target_external_club_id,
    receipt."bindingDigest",
    server_now
  );

  UPDATE public."Store"
  SET "externalProvider" = 'LANGAME',
      "externalDomain" = target_external_domain,
      "externalClubId" = target_external_club_id,
      "integrationSourceId" = source_id,
      "updatedAt" = server_now
  WHERE "tenantId" = target_tenant_id
    AND "id" = target_store_id;

  PERFORM pg_catalog.set_config(
    'leetplus.langame_onboarding_current188_writer', 'activate', TRUE
  );

  UPDATE public."LangameOnboardingStagedReceiptV1"
  SET "status" = 'CONSUMED',
      "stagedApiKeyEncrypted" = NULL,
      "consumedAt" = server_now,
      "ciphertextClearedAt" = server_now,
      "activationRequestId" = activation_request_id,
      "activationRequestDigest" = activation_request_digest,
      "claimId" = claim_id
  WHERE "id" = target_receipt_id;

  INSERT INTO public."LangameOnboardingAuditEventV1" (
    "id", "tenantId", "receiptId", "actorDigest", "eventType",
    "requestDigest", "configDigest", "bindingDigest", "claimDigest",
    "eventAt", "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT,
    target_tenant_id,
    target_receipt_id,
    receipt."actorDigest",
    'ACTIVATED',
    activation_request_digest,
    receipt."configDigest",
    receipt."bindingDigest",
    receipt."bindingDigest",
    server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT
    target_receipt_id,
    'ACTIVATED'::TEXT,
    server_now,
    receipt."bindingDigest"::TEXT,
    FALSE;
END;
$activate$;

CREATE FUNCTION public.langame_onboarding_expire_current188_v1(
  target_tenant_id TEXT,
  expire_limit INTEGER
)
RETURNS TABLE ("expiredCount" INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $expire$
DECLARE
  receipt public."LangameOnboardingStagedReceiptV1"%ROWTYPE;
  expired_count INTEGER := 0;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
BEGIN
  IF target_tenant_id IS NULL
     OR pg_catalog.length(target_tenant_id) > 128
     OR expire_limit IS NULL
     OR expire_limit < 1
     OR expire_limit > 1000
  THEN
    RAISE EXCEPTION 'Invalid Langame onboarding expiry request'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Langame onboarding tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.langame_onboarding_current188_writer', 'expire', TRUE
  );

  FOR receipt IN
    SELECT candidate.*
    FROM public."LangameOnboardingStagedReceiptV1" AS candidate
    WHERE candidate."tenantId" = target_tenant_id
      AND candidate."status" = 'PENDING'
      AND candidate."expiresAt" <= server_now
    ORDER BY candidate."expiresAt", candidate."id"
    FOR UPDATE SKIP LOCKED
    LIMIT expire_limit
  LOOP
    UPDATE public."LangameOnboardingStagedReceiptV1"
    SET "status" = 'EXPIRED',
        "stagedApiKeyEncrypted" = NULL,
        "ciphertextClearedAt" = server_now
    WHERE "id" = receipt."id";

    INSERT INTO public."LangameOnboardingAuditEventV1" (
      "id", "tenantId", "receiptId", "actorDigest", "eventType",
      "requestDigest", "configDigest", "bindingDigest", "claimDigest",
      "eventAt", "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT,
      receipt."tenantId",
      receipt."id",
      receipt."actorDigest",
      'EXPIRED',
      receipt."requestDigest",
      receipt."configDigest",
      receipt."bindingDigest",
      NULL,
      server_now,
      pg_catalog.txid_current()::TEXT
    );

    expired_count := expired_count + 1;
  END LOOP;

  RETURN QUERY SELECT expired_count;
END;
$expire$;

REVOKE ALL ON TABLE public."LangameOnboardingStagedReceiptV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameExternalClubClaimV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameOnboardingAuditEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_onboarding_receipt_guard_current188_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_onboarding_append_only_guard_current188_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_onboarding_stage_receipt_current188_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_onboarding_activate_current188_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_onboarding_expire_current188_v1(
  TEXT, INTEGER
) FROM PUBLIC;

-- Hostile default ACLs must not silently grant candidate authority.
DO $owner_only_acl$
DECLARE
  unsafe_acl_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO unsafe_acl_count
  FROM (
    SELECT acl.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'LangameOnboardingStagedReceiptV1',
        'LangameExternalClubClaimV1',
        'LangameOnboardingAuditEventV1'
      )
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT acl.grantee
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'langame_onboarding_receipt_guard_current188_v1',
        'langame_onboarding_append_only_guard_current188_v1',
        'langame_onboarding_stage_receipt_current188_v1',
        'langame_onboarding_activate_current188_v1',
        'langame_onboarding_expire_current188_v1'
      )
      AND acl.grantee <> procedure.proowner
  ) AS unsafe_acl;

  IF unsafe_acl_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT188 Langame onboarding objects require owner-only ACL'
      USING ERRCODE = '55000';
  END IF;
END;
$owner_only_acl$;

COMMIT;
