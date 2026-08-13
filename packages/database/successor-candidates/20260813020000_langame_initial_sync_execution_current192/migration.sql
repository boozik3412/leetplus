-- CURRENT192: dormant one-shot Langame initial-sync execution boundary.
-- NONCANONICAL / NOT_DEPLOYABLE / NO RUNTIME GRANTS / NO PROVIDER EFFECT.
BEGIN;

CREATE TABLE public."LangameInitialSyncExecutionV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "preflightId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "claimRequestId" VARCHAR(128) NOT NULL,
  "claimRequestDigest" CHAR(64) NOT NULL,
  "claimTokenDigest" CHAR(64) NOT NULL,
  "executionRequestId" VARCHAR(128),
  "executionRequestDigest" CHAR(64),
  "planDigest" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'CLAIMED',
  "claimedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "snapshotDate" TIMESTAMP(3) WITH TIME ZONE,
  "productsCount" INTEGER NOT NULL,
  "inventoryCount" INTEGER NOT NULL,
  "resultDigest" CHAR(64),
  "completedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameInitialSyncExecutionV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameInitialSyncExecutionV1_request_check" CHECK (
    "claimRequestId" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND ("executionRequestId" IS NULL
      OR "executionRequestId" ~ '^[A-Za-z0-9_-]{16,128}$')
  ),
  CONSTRAINT "LangameInitialSyncExecutionV1_digest_check" CHECK (
    "claimRequestDigest" ~ '^[a-f0-9]{64}$'
    AND "claimTokenDigest" ~ '^[a-f0-9]{64}$'
    AND "planDigest" ~ '^[a-f0-9]{64}$'
    AND ("executionRequestDigest" IS NULL
      OR "executionRequestDigest" ~ '^[a-f0-9]{64}$')
    AND ("resultDigest" IS NULL OR "resultDigest" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "LangameInitialSyncExecutionV1_count_check" CHECK (
    "productsCount" BETWEEN 0 AND 50000
    AND "inventoryCount" BETWEEN 0 AND 50000
  ),
  CONSTRAINT "LangameInitialSyncExecutionV1_lease_check" CHECK (
    "leaseExpiresAt" > "claimedAt"
    AND "leaseExpiresAt" <= "claimedAt" + INTERVAL '15 minutes'
  ),
  CONSTRAINT "LangameInitialSyncExecutionV1_state_check" CHECK (
    ("status" = 'CLAIMED'
      AND "executionRequestId" IS NULL
      AND "executionRequestDigest" IS NULL
      AND "snapshotDate" IS NULL
      AND "resultDigest" IS NULL
      AND "completedAt" IS NULL
      AND "expiredAt" IS NULL)
    OR ("status" = 'COMPLETED'
      AND "executionRequestId" IS NOT NULL
      AND "executionRequestDigest" IS NOT NULL
      AND "snapshotDate" IS NOT NULL
      AND "resultDigest" IS NOT NULL
      AND "completedAt" IS NOT NULL
      AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED'
      AND "executionRequestId" IS NULL
      AND "executionRequestDigest" IS NULL
      AND "snapshotDate" IS NULL
      AND "resultDigest" IS NULL
      AND "completedAt" IS NULL
      AND "expiredAt" IS NOT NULL)
  )
);

CREATE TABLE public."LangameInitialSyncExecutionEventV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "eventType" VARCHAR(24) NOT NULL,
  "eventDigest" CHAR(64) NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "transactionId" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "LangameInitialSyncExecutionEventV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameInitialSyncExecutionEventV1_type_check" CHECK (
    "eventType" IN ('CLAIMED', 'COMPLETED', 'EXPIRED')
  ),
  CONSTRAINT "LangameInitialSyncExecutionEventV1_digest_check" CHECK (
    "eventDigest" ~ '^[a-f0-9]{64}$'
  )
);

CREATE UNIQUE INDEX "langame_initial_sync_execution_approval_uidx"
ON public."LangameInitialSyncExecutionV1" ("approvalId");

CREATE UNIQUE INDEX "langame_initial_sync_execution_claim_request_uidx"
ON public."LangameInitialSyncExecutionV1" (
  "tenantId", "actorUserId", "claimRequestId"
);

CREATE UNIQUE INDEX "langame_initial_sync_execution_claim_token_uidx"
ON public."LangameInitialSyncExecutionV1" ("claimTokenDigest");

CREATE UNIQUE INDEX "langame_initial_sync_execution_execute_request_uidx"
ON public."LangameInitialSyncExecutionV1" (
  "tenantId", "actorUserId", "executionRequestId"
) WHERE "executionRequestId" IS NOT NULL;

CREATE INDEX "langame_initial_sync_execution_lease_idx"
ON public."LangameInitialSyncExecutionV1" ("leaseExpiresAt", "id")
WHERE "status" = 'CLAIMED';

CREATE UNIQUE INDEX "langame_initial_sync_execution_event_uidx"
ON public."LangameInitialSyncExecutionEventV1" (
  "executionId", "eventType"
);

ALTER TABLE public."LangameInitialSyncExecutionV1"
ADD CONSTRAINT "langame_initial_sync_execution_actor_fkey"
FOREIGN KEY ("tenantId", "actorUserId")
REFERENCES public."User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncExecutionV1"
ADD CONSTRAINT "langame_initial_sync_execution_approval_fkey"
FOREIGN KEY ("approvalId")
REFERENCES public."LangameInitialSyncApprovalV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncExecutionV1"
ADD CONSTRAINT "langame_initial_sync_execution_preflight_fkey"
FOREIGN KEY ("preflightId")
REFERENCES public."LangameInitialSyncPreflightV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncExecutionV1"
ADD CONSTRAINT "langame_initial_sync_execution_store_fkey"
FOREIGN KEY ("tenantId", "storeId")
REFERENCES public."Store"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncExecutionV1"
ADD CONSTRAINT "langame_initial_sync_execution_source_fkey"
FOREIGN KEY ("sourceId") REFERENCES public."IntegrationSource"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LangameInitialSyncExecutionEventV1"
ADD CONSTRAINT "langame_initial_sync_execution_event_execution_fkey"
FOREIGN KEY ("executionId")
REFERENCES public."LangameInitialSyncExecutionV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public.langame_initial_sync_execution_guard_current192_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CURRENT192 initial sync execution is append-preserving'
      USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting(
       'leetplus.langame_initial_sync_current192_writer', TRUE
     ) NOT IN ('execute', 'reconcile') THEN
    RAISE EXCEPTION 'CURRENT192 initial sync execution writer is required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."tenantId" <> OLD."tenantId"
     OR NEW."actorUserId" <> OLD."actorUserId"
     OR NEW."approvalId" <> OLD."approvalId"
     OR NEW."preflightId" <> OLD."preflightId"
     OR NEW."storeId" <> OLD."storeId"
     OR NEW."sourceId" <> OLD."sourceId"
     OR NEW."claimRequestId" <> OLD."claimRequestId"
     OR NEW."claimRequestDigest" <> OLD."claimRequestDigest"
     OR NEW."claimTokenDigest" <> OLD."claimTokenDigest"
     OR NEW."planDigest" <> OLD."planDigest"
     OR NEW."claimedAt" <> OLD."claimedAt"
     OR NEW."leaseExpiresAt" <> OLD."leaseExpiresAt"
     OR NEW."productsCount" <> OLD."productsCount"
     OR NEW."inventoryCount" <> OLD."inventoryCount"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync execution binding is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.current_setting(
       'leetplus.langame_initial_sync_current192_writer', TRUE
     ) = 'execute' THEN
    IF OLD."status" <> 'CLAIMED'
       OR NEW."status" <> 'COMPLETED'
       OR NEW."executionRequestId" IS NULL
       OR NEW."executionRequestDigest" IS NULL
       OR NEW."snapshotDate" IS NULL
       OR NEW."resultDigest" IS NULL
       OR NEW."completedAt" IS NULL
       OR NEW."expiredAt" IS DISTINCT FROM OLD."expiredAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT192 initial sync completion transition'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD."status" <> 'CLAIMED'
       OR NEW."status" <> 'EXPIRED'
       OR NEW."expiredAt" IS NULL
       OR NEW."executionRequestId" IS DISTINCT FROM OLD."executionRequestId"
       OR NEW."executionRequestDigest" IS DISTINCT FROM OLD."executionRequestDigest"
       OR NEW."snapshotDate" IS DISTINCT FROM OLD."snapshotDate"
       OR NEW."resultDigest" IS DISTINCT FROM OLD."resultDigest"
       OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT192 initial sync expiry transition'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_initial_sync_execution_event_guard_current192_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $append_only$
BEGIN
  RAISE EXCEPTION 'CURRENT192 initial sync execution events are append-only'
    USING ERRCODE = '42501';
END;
$append_only$;

CREATE TRIGGER langame_initial_sync_execution_guard_current192_v1
BEFORE UPDATE OR DELETE ON public."LangameInitialSyncExecutionV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_initial_sync_execution_guard_current192_v1();

CREATE TRIGGER langame_initial_sync_execution_event_guard_current192_v1
BEFORE UPDATE OR DELETE ON public."LangameInitialSyncExecutionEventV1"
FOR EACH ROW
EXECUTE FUNCTION public.langame_initial_sync_execution_event_guard_current192_v1();

CREATE FUNCTION public.langame_initial_sync_claim_current192_v1(
  target_execution_id TEXT,
  target_tenant_id TEXT,
  actor_user_id TEXT,
  target_approval_id TEXT,
  claim_request_id TEXT,
  claim_request_digest TEXT,
  raw_claim_token TEXT,
  expected_plan_digest TEXT
)
RETURNS TABLE (
  "executionId" TEXT,
  "status" TEXT,
  "leaseExpiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "planDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $claim$
DECLARE
  approval public."LangameInitialSyncApprovalV1"%ROWTYPE;
  preflight public."LangameInitialSyncPreflightV1"%ROWTYPE;
  execution public."LangameInitialSyncExecutionV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  token_digest TEXT;
BEGIN
  IF target_execution_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR claim_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR claim_request_digest !~ '^[a-f0-9]{64}$'
     OR expected_plan_digest !~ '^[a-f0-9]{64}$'
     OR raw_claim_token !~ '^[A-Za-z0-9_-]{43,128}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT192 initial sync claim request'
      USING ERRCODE = '22023';
  END IF;
  token_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_claim_token, 'UTF8')), 'hex'
  );

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync tenant is unavailable'
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
    RAISE EXCEPTION 'CURRENT192 initial sync admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO execution
  FROM public."LangameInitialSyncExecutionV1" AS candidate
  WHERE candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
    AND candidate."claimRequestId" = claim_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF execution."id" <> target_execution_id
       OR execution."approvalId" <> target_approval_id
       OR execution."claimRequestDigest" <> claim_request_digest
       OR execution."claimTokenDigest" <> token_digest
       OR execution."planDigest" <> expected_plan_digest
    THEN
      RAISE EXCEPTION 'CURRENT192 initial sync claim replay mismatch'
        USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT execution."id", execution."status"::TEXT,
      execution."leaseExpiresAt", execution."planDigest"::TEXT, TRUE;
    RETURN;
  END IF;

  SELECT candidate.* INTO approval
  FROM public."LangameInitialSyncApprovalV1" AS candidate
  WHERE candidate."id" = target_approval_id
    AND candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
  FOR UPDATE;
  IF NOT FOUND OR approval."validUntil" <= server_now
     OR approval."planDigest" <> expected_plan_digest
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync approval is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."LangameInitialSyncExecutionV1" AS prior_execution
  WHERE prior_execution."approvalId" = approval."id"
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync approval was already claimed'
      USING ERRCODE = '55000';
  END IF;

  SELECT candidate.* INTO preflight
  FROM public."LangameInitialSyncPreflightV1" AS candidate
  WHERE candidate."id" = approval."preflightId"
    AND candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
    AND candidate."status" = 'CONFIRMED'
    AND candidate."confirmedAt" = approval."approvedAt"
    AND candidate."expiresAt" = approval."validUntil"
    AND candidate."planDigest" = approval."planDigest"
    AND candidate."approvalDigest" = approval."approvalDigest"
    AND candidate."preflightReadSetDigest" = approval."preflightReadSetDigest"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync approval binding is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public."LangameOnboardingStagedReceiptV1" AS receipt
  INNER JOIN public."LangameExternalClubClaimV1" AS external_claim
    ON external_claim."id" = receipt."claimId"
   AND external_claim."tenantId" = receipt."tenantId"
   AND external_claim."storeId" = receipt."storeId"
   AND external_claim."receiptId" = receipt."id"
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
    AND external_claim."claimDigest" = preflight."bindingDigest"
    AND external_claim."externalDomain" = preflight."externalDomain"
    AND external_claim."externalClubId" = preflight."externalClubId"
    AND external_claim."activatedAt" = receipt."consumedAt"
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
  FOR SHARE OF receipt, external_claim, store, source, credential;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync binding changed before claim'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public."LangameInitialSyncExecutionV1" (
    "id", "tenantId", "actorUserId", "approvalId", "preflightId",
    "storeId", "sourceId", "claimRequestId", "claimRequestDigest",
    "claimTokenDigest", "planDigest", "claimedAt", "leaseExpiresAt",
    "productsCount", "inventoryCount"
  ) VALUES (
    target_execution_id, target_tenant_id, actor_user_id, approval."id",
    preflight."id", preflight."storeId", preflight."sourceId",
    claim_request_id, claim_request_digest, token_digest,
    expected_plan_digest, server_now, approval."validUntil",
    preflight."productsCount", preflight."inventoryCount"
  ) RETURNING * INTO execution;

  INSERT INTO public."LangameInitialSyncExecutionEventV1" (
    "id", "tenantId", "executionId", "eventType", "eventDigest",
    "eventAt", "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, execution."id",
    'CLAIMED', claim_request_digest, server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT execution."id", execution."status"::TEXT,
    execution."leaseExpiresAt", execution."planDigest"::TEXT, FALSE;
END;
$claim$;

CREATE FUNCTION public.langame_initial_sync_execute_current192_v1(
  target_tenant_id TEXT,
  actor_user_id TEXT,
  target_execution_id TEXT,
  raw_claim_token TEXT,
  execution_request_id TEXT,
  execution_request_digest TEXT,
  plan_canonical_json TEXT
)
RETURNS TABLE (
  "executionId" TEXT,
  "status" TEXT,
  "snapshotDate" TIMESTAMP(3) WITH TIME ZONE,
  "productsCount" INTEGER,
  "inventoryCount" INTEGER,
  "resultDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $execute$
DECLARE
  execution public."LangameInitialSyncExecutionV1"%ROWTYPE;
  approval public."LangameInitialSyncApprovalV1"%ROWTYPE;
  preflight public."LangameInitialSyncPreflightV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  snapshot_at TIMESTAMP(3) WITH TIME ZONE;
  token_digest TEXT;
  calculated_plan_digest TEXT;
  result_digest TEXT;
  plan_data JSONB;
  written_products INTEGER;
  written_inventory INTEGER;
BEGIN
  IF target_execution_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR execution_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR execution_request_digest !~ '^[a-f0-9]{64}$'
     OR raw_claim_token !~ '^[A-Za-z0-9_-]{43,128}$'
     OR plan_canonical_json IS NULL
     OR pg_catalog.octet_length(plan_canonical_json) > 16777216
  THEN
    RAISE EXCEPTION 'Invalid CURRENT192 initial sync execution request'
      USING ERRCODE = '22023';
  END IF;
  token_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_claim_token, 'UTF8')), 'hex'
  );
  calculated_plan_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(plan_canonical_json, 'UTF8')), 'hex'
  );
  BEGIN
    plan_data := plan_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid CURRENT192 canonical initial sync plan'
      USING ERRCODE = '22023';
  END;

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
    AND tenant."status"::TEXT = 'ACTIVE'
    AND tenant."customerStage"::TEXT IN ('PILOT', 'BETA', 'LIVE')
    AND tenant."onboardingStatus"::TEXT IN ('ONBOARDING', 'READY', 'ACTIVE')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync tenant is unavailable'
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
    RAISE EXCEPTION 'CURRENT192 initial sync admission is unavailable'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public."User" AS actor
  WHERE actor."tenantId" = target_tenant_id
    AND actor."id" = actor_user_id
    AND actor."isActive" = TRUE
    AND actor."accessScope"::TEXT = 'NETWORK'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync actor is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO execution
  FROM public."LangameInitialSyncExecutionV1" AS candidate
  WHERE candidate."id" = target_execution_id
    AND candidate."tenantId" = target_tenant_id
    AND candidate."actorUserId" = actor_user_id
  FOR UPDATE;
  IF NOT FOUND
     OR execution."claimTokenDigest" <> token_digest
     OR execution."planDigest" <> calculated_plan_digest
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync execution claim is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF execution."status" = 'COMPLETED' THEN
    IF execution."executionRequestId" <> execution_request_id
       OR execution."executionRequestDigest" <> execution_request_digest
    THEN
      RAISE EXCEPTION 'CURRENT192 initial sync execution replay mismatch'
        USING ERRCODE = '55000';
    END IF;
    RETURN QUERY SELECT execution."id", 'COMPLETED'::TEXT,
      execution."snapshotDate", execution."productsCount",
      execution."inventoryCount", execution."resultDigest"::TEXT, TRUE;
    RETURN;
  END IF;
  IF execution."status" <> 'CLAIMED'
     OR execution."leaseExpiresAt" <= server_now
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync execution claim is stale'
      USING ERRCODE = '55000';
  END IF;

  SELECT candidate.* INTO approval
  FROM public."LangameInitialSyncApprovalV1" AS candidate
  WHERE candidate."id" = execution."approvalId"
    AND candidate."tenantId" = execution."tenantId"
    AND candidate."actorUserId" = execution."actorUserId"
    AND candidate."preflightId" = execution."preflightId"
    AND candidate."storeId" = execution."storeId"
    AND candidate."sourceId" = execution."sourceId"
    AND candidate."planDigest" = execution."planDigest"
    AND candidate."validUntil" = execution."leaseExpiresAt"
    AND candidate."validUntil" > server_now
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync approval changed before execution'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO preflight
  FROM public."LangameInitialSyncPreflightV1" AS candidate
  WHERE candidate."id" = approval."preflightId"
    AND candidate."tenantId" = execution."tenantId"
    AND candidate."actorUserId" = execution."actorUserId"
    AND candidate."status" = 'CONFIRMED'
    AND candidate."confirmedAt" = approval."approvedAt"
    AND candidate."expiresAt" = approval."validUntil"
    AND candidate."planDigest" = approval."planDigest"
    AND candidate."approvalDigest" = approval."approvalDigest"
    AND candidate."preflightReadSetDigest" = approval."preflightReadSetDigest"
    AND candidate."productsCount" = execution."productsCount"
    AND candidate."inventoryCount" = execution."inventoryCount"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync preflight changed before execution'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.jsonb_typeof(plan_data) <> 'array'
     OR pg_catalog.jsonb_array_length(plan_data) <> 5
     OR plan_data->>0 <> 'LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1'
     OR plan_data->1 <> pg_catalog.jsonb_build_object(
       'tenantId', preflight."tenantId",
       'storeId', preflight."storeId",
       'sourceId', preflight."sourceId",
       'domain', preflight."externalDomain",
       'externalClubId', preflight."externalClubId"
     )
     OR plan_data->2 <> pg_catalog.jsonb_build_object(
       'approvalDigest', approval."approvalDigest",
       'preflightReadSetDigest', approval."preflightReadSetDigest"
     )
     OR pg_catalog.jsonb_typeof(plan_data->3) <> 'array'
     OR pg_catalog.jsonb_typeof(plan_data->4) <> 'array'
     OR pg_catalog.jsonb_array_length(plan_data->3) <> execution."productsCount"
     OR pg_catalog.jsonb_array_length(plan_data->4) <> execution."inventoryCount"
  THEN
    RAISE EXCEPTION 'CURRENT192 canonical initial sync plan binding mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(plan_data->3) AS product(item)
    WHERE pg_catalog.jsonb_typeof(product.item) <> 'object'
      OR (SELECT pg_catalog.count(*)
          FROM pg_catalog.jsonb_object_keys(product.item)) <> 4
      OR NOT product.item ?& ARRAY[
        'externalProductId', 'article', 'name', 'isActive'
      ]
      OR pg_catalog.jsonb_typeof(product.item->'externalProductId') <> 'string'
      OR pg_catalog.jsonb_typeof(product.item->'article') <> 'string'
      OR pg_catalog.jsonb_typeof(product.item->'name') <> 'string'
      OR pg_catalog.jsonb_typeof(product.item->'isActive') <> 'boolean'
      OR product.item->>'externalProductId' !~ '^[1-9][0-9]{0,18}$'
      OR product.item->>'article' <>
        'LG-' || preflight."externalDomain" || '-' ||
        (product.item->>'externalProductId')
      OR product.item->>'name' = ''
      OR product.item->>'name' <> pg_catalog.btrim(product.item->>'name')
      OR pg_catalog.octet_length(product.item->>'name') > 1024
      OR product.item->>'name' ~ '[[:cntrl:]]'
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT (product.item->>'externalProductId')::NUMERIC AS external_id,
        pg_catalog.lag((product.item->>'externalProductId')::NUMERIC)
          OVER (ORDER BY product.ordinality) AS previous_id
      FROM pg_catalog.jsonb_array_elements(plan_data->3)
        WITH ORDINALITY AS product(item, ordinality)
    ) AS ordered_products
    WHERE ordered_products.previous_id >= ordered_products.external_id
  ) THEN
    RAISE EXCEPTION 'Invalid CURRENT192 canonical product plan'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(plan_data->4) AS inventory(item)
    WHERE pg_catalog.jsonb_typeof(inventory.item) <> 'object'
      OR (SELECT pg_catalog.count(*)
          FROM pg_catalog.jsonb_object_keys(inventory.item)) <> 2
      OR NOT inventory.item ?& ARRAY['externalProductId', 'quantity']
      OR pg_catalog.jsonb_typeof(inventory.item->'externalProductId') <> 'string'
      OR pg_catalog.jsonb_typeof(inventory.item->'quantity') <> 'number'
      OR inventory.item->>'externalProductId' !~ '^[1-9][0-9]{0,18}$'
      OR inventory.item->>'quantity' !~ '^(0|[1-9][0-9]{0,9})$'
      OR (inventory.item->>'quantity')::NUMERIC > 2147483647
      OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(plan_data->3) AS product(item)
        WHERE product.item->>'externalProductId' =
          inventory.item->>'externalProductId'
      )
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT (inventory.item->>'externalProductId')::NUMERIC AS external_id,
        pg_catalog.lag((inventory.item->>'externalProductId')::NUMERIC)
          OVER (ORDER BY inventory.ordinality) AS previous_id
      FROM pg_catalog.jsonb_array_elements(plan_data->4)
        WITH ORDINALITY AS inventory(item, ordinality)
    ) AS ordered_inventory
    WHERE ordered_inventory.previous_id >= ordered_inventory.external_id
  ) THEN
    RAISE EXCEPTION 'Invalid CURRENT192 canonical inventory plan'
      USING ERRCODE = '22023';
  END IF;

  -- Re-prove the complete selected-Store binding immediately before DML.
  PERFORM 1
  FROM public."LangameOnboardingStagedReceiptV1" AS receipt
  INNER JOIN public."LangameExternalClubClaimV1" AS external_claim
    ON external_claim."id" = receipt."claimId"
   AND external_claim."tenantId" = receipt."tenantId"
   AND external_claim."storeId" = receipt."storeId"
   AND external_claim."receiptId" = receipt."id"
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
    AND external_claim."claimDigest" = preflight."bindingDigest"
    AND external_claim."externalDomain" = preflight."externalDomain"
    AND external_claim."externalClubId" = preflight."externalClubId"
    AND external_claim."activatedAt" = receipt."consumedAt"
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
  FOR SHARE OF receipt, external_claim, store, source, credential;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync binding changed before import'
      USING ERRCODE = '42501';
  END IF;

  -- Never merge a generated article into an unrelated manual/external row.
  IF EXISTS (
    WITH plan_products AS (
      SELECT product.item->>'externalProductId' AS external_id,
        product.item->>'article' AS article
      FROM pg_catalog.jsonb_array_elements(plan_data->3) AS product(item)
    )
    SELECT 1
    FROM public."Product" AS existing_product
    INNER JOIN plan_products
      ON plan_products.article = existing_product."article"
    WHERE existing_product."tenantId" = preflight."tenantId"
      AND NOT (
        existing_product."externalProvider" = 'LANGAME'
        AND existing_product."externalDomain" = preflight."externalDomain"
        AND existing_product."externalProductId" = plan_products.external_id
      )
  ) THEN
    RAISE EXCEPTION 'CURRENT192 initial sync article collision'
      USING ERRCODE = '23505';
  END IF;

  snapshot_at := pg_catalog.date_trunc(
    'day', server_now AT TIME ZONE 'UTC'
  ) AT TIME ZONE 'UTC';

  -- A same-day manual/foreign snapshot is evidence and is never overwritten.
  IF EXISTS (
    WITH plan_inventory AS (
      SELECT inventory.item->>'externalProductId' AS external_id
      FROM pg_catalog.jsonb_array_elements(plan_data->4) AS inventory(item)
    )
    SELECT 1
    FROM public."InventorySnapshot" AS snapshot
    INNER JOIN public."Product" AS existing_product
      ON existing_product."id" = snapshot."productId"
     AND existing_product."tenantId" = snapshot."tenantId"
    INNER JOIN plan_inventory
      ON plan_inventory.external_id = existing_product."externalProductId"
    WHERE snapshot."tenantId" = preflight."tenantId"
      AND snapshot."storeId" = preflight."storeId"
      AND snapshot."snapshotDate" = snapshot_at
      AND existing_product."externalProvider" = 'LANGAME'
      AND existing_product."externalDomain" = preflight."externalDomain"
      AND (
        snapshot."externalProvider" IS DISTINCT FROM 'LANGAME'
        OR snapshot."externalDomain" IS DISTINCT FROM preflight."externalDomain"
        OR snapshot."externalClubId" IS DISTINCT FROM preflight."externalClubId"
      )
  ) THEN
    RAISE EXCEPTION 'CURRENT192 initial sync inventory collision'
      USING ERRCODE = '23505';
  END IF;

  WITH plan_products AS (
    SELECT product.item->>'externalProductId' AS external_id,
      product.item->>'article' AS article,
      product.item->>'name' AS name,
      (product.item->>'isActive')::BOOLEAN AS is_active
    FROM pg_catalog.jsonb_array_elements(plan_data->3) AS product(item)
  ), upserted AS (
    INSERT INTO public."Product" (
      "id", "tenantId", "article", "name", "purchasePrice", "salePrice",
      "facing", "isActive", "assortmentRole", "isMandatory",
      "externalProvider", "externalDomain", "externalProductId",
      "externalMissingSince", "createdAt", "updatedAt"
    ) SELECT
      pg_catalog.gen_random_uuid()::TEXT, preflight."tenantId",
      plan_products.article, plan_products.name, 0, 0, 1,
      plan_products.is_active, 'OPTIONAL', FALSE, 'LANGAME',
      preflight."externalDomain", plan_products.external_id, NULL,
      server_now, server_now
    FROM plan_products
    ON CONFLICT (
      "tenantId", "externalProvider", "externalDomain", "externalProductId"
    ) DO UPDATE SET
      "name" = EXCLUDED."name",
      "isActive" = EXCLUDED."isActive",
      "externalMissingSince" = NULL,
      "updatedAt" = server_now
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER INTO written_products FROM upserted;

  WITH plan_inventory AS (
    SELECT inventory.item->>'externalProductId' AS external_id,
      (inventory.item->>'quantity')::INTEGER AS quantity
    FROM pg_catalog.jsonb_array_elements(plan_data->4) AS inventory(item)
  ), resolved AS (
    SELECT existing_product."id" AS product_id, plan_inventory.quantity
    FROM plan_inventory
    INNER JOIN public."Product" AS existing_product
      ON existing_product."tenantId" = preflight."tenantId"
     AND existing_product."externalProvider" = 'LANGAME'
     AND existing_product."externalDomain" = preflight."externalDomain"
     AND existing_product."externalProductId" = plan_inventory.external_id
  )
  INSERT INTO public."InventorySnapshot" (
    "id", "tenantId", "storeId", "productId", "snapshotDate",
    "quantity", "externalProvider", "externalDomain", "externalClubId",
    "createdAt", "updatedAt"
  ) SELECT
    pg_catalog.gen_random_uuid()::TEXT, preflight."tenantId",
    preflight."storeId", resolved.product_id, snapshot_at,
    resolved.quantity, 'LANGAME', preflight."externalDomain",
    preflight."externalClubId", server_now, server_now
  FROM resolved
  ON CONFLICT DO NOTHING;

  WITH plan_inventory AS (
    SELECT inventory.item->>'externalProductId' AS external_id,
      (inventory.item->>'quantity')::INTEGER AS quantity
    FROM pg_catalog.jsonb_array_elements(plan_data->4) AS inventory(item)
  ), resolved AS (
    SELECT existing_product."id" AS product_id, plan_inventory.quantity
    FROM plan_inventory
    INNER JOIN public."Product" AS existing_product
      ON existing_product."tenantId" = preflight."tenantId"
     AND existing_product."externalProvider" = 'LANGAME'
     AND existing_product."externalDomain" = preflight."externalDomain"
     AND existing_product."externalProductId" = plan_inventory.external_id
  ), updated AS (
    UPDATE public."InventorySnapshot" AS existing_snapshot
    SET "quantity" = resolved.quantity,
        "updatedAt" = server_now
    FROM resolved
    WHERE existing_snapshot."tenantId" = preflight."tenantId"
      AND existing_snapshot."storeId" = preflight."storeId"
      AND existing_snapshot."productId" = resolved.product_id
      AND existing_snapshot."snapshotDate" = snapshot_at
      AND existing_snapshot."externalProvider" = 'LANGAME'
      AND existing_snapshot."externalDomain" = preflight."externalDomain"
      AND existing_snapshot."externalClubId" = preflight."externalClubId"
    RETURNING existing_snapshot."id"
  )
  SELECT pg_catalog.count(*)::INTEGER INTO written_inventory FROM updated;

  IF written_products <> execution."productsCount"
     OR written_inventory <> execution."inventoryCount"
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync atomic import count mismatch'
      USING ERRCODE = '55000';
  END IF;

  result_digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    target_execution_id || E'\n' || execution_request_digest || E'\n' ||
    execution."planDigest" || E'\n' || snapshot_at::TEXT || E'\n' ||
    written_products::TEXT || E'\n' || written_inventory::TEXT,
    'UTF8'
  )), 'hex');
  PERFORM pg_catalog.set_config(
    'leetplus.langame_initial_sync_current192_writer', 'execute', TRUE
  );
  UPDATE public."LangameInitialSyncExecutionV1"
  SET "status" = 'COMPLETED',
      "executionRequestId" = execution_request_id,
      "executionRequestDigest" = execution_request_digest,
      "snapshotDate" = snapshot_at,
      "resultDigest" = result_digest,
      "completedAt" = server_now
  WHERE "id" = execution."id"
  RETURNING * INTO execution;

  INSERT INTO public."LangameInitialSyncExecutionEventV1" (
    "id", "tenantId", "executionId", "eventType", "eventDigest",
    "eventAt", "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, execution."id",
    'COMPLETED', result_digest, server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT execution."id", execution."status"::TEXT,
    execution."snapshotDate", execution."productsCount",
    execution."inventoryCount", execution."resultDigest"::TEXT, FALSE;
END;
$execute$;

CREATE FUNCTION public.langame_initial_sync_reconcile_current192_v1(
  target_tenant_id TEXT,
  target_execution_id TEXT,
  raw_claim_token TEXT,
  expected_plan_digest TEXT
)
RETURNS TABLE (
  "executionId" TEXT,
  "status" TEXT,
  "productsCount" INTEGER,
  "inventoryCount" INTEGER,
  "resultDigest" TEXT,
  "businessWritesCommitted" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $reconcile$
DECLARE
  execution public."LangameInitialSyncExecutionV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  token_digest TEXT;
BEGIN
  IF target_execution_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR raw_claim_token !~ '^[A-Za-z0-9_-]{43,128}$'
     OR expected_plan_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT192 initial sync reconciliation request'
      USING ERRCODE = '22023';
  END IF;
  token_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_claim_token, 'UTF8')), 'hex'
  );

  PERFORM 1 FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CURRENT192 initial sync tenant is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.* INTO execution
  FROM public."LangameInitialSyncExecutionV1" AS candidate
  WHERE candidate."id" = target_execution_id
    AND candidate."tenantId" = target_tenant_id
  FOR UPDATE;
  IF NOT FOUND
     OR execution."claimTokenDigest" <> token_digest
     OR execution."planDigest" <> expected_plan_digest
  THEN
    RAISE EXCEPTION 'CURRENT192 initial sync reconciliation claim is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF execution."status" = 'CLAIMED'
     AND execution."leaseExpiresAt" <= server_now
  THEN
    PERFORM pg_catalog.set_config(
      'leetplus.langame_initial_sync_current192_writer', 'reconcile', TRUE
    );
    UPDATE public."LangameInitialSyncExecutionV1"
    SET "status" = 'EXPIRED', "expiredAt" = server_now
    WHERE "id" = execution."id"
    RETURNING * INTO execution;

    INSERT INTO public."LangameInitialSyncExecutionEventV1" (
      "id", "tenantId", "executionId", "eventType", "eventDigest",
      "eventAt", "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT, target_tenant_id, execution."id",
      'EXPIRED', execution."planDigest", server_now,
      pg_catalog.txid_current()::TEXT
    );
  END IF;

  RETURN QUERY SELECT execution."id", execution."status"::TEXT,
    execution."productsCount", execution."inventoryCount",
    execution."resultDigest"::TEXT,
    (execution."status" = 'COMPLETED');
END;
$reconcile$;

REVOKE ALL ON TABLE public."LangameInitialSyncExecutionV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameInitialSyncExecutionEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_execution_guard_current192_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_execution_event_guard_current192_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_claim_current192_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_execute_current192_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_initial_sync_reconcile_current192_v1(
  TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'LangameInitialSyncExecutionV1',
        'LangameInitialSyncExecutionEventV1'
      )
      AND grantee <> CURRENT_USER
  ) OR EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name LIKE 'langame_initial_sync_%_current192_v1'
      AND grantee <> CURRENT_USER
  ) THEN
    RAISE EXCEPTION 'CURRENT192 initial sync objects require owner-only ACL';
  END IF;
END;
$acl$;

COMMIT;
