\set ON_ERROR_STOP on

-- Run only against a disposable database after CURRENT188-CURRENT192.
-- Every fixture and business write is rolled back.
BEGIN;
SET LOCAL session_replication_role = replica;

DO $drop_synthetic_decision_checks$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT constraint_def.conname
    FROM pg_catalog.pg_constraint AS constraint_def
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = constraint_def.conrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'TenantAdmissionDecision'
      AND constraint_def.contype = 'c'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      'TenantAdmissionDecision', constraint_row.conname
    );
  END LOOP;
END;
$drop_synthetic_decision_checks$;

INSERT INTO public."Tenant" (
  "id", "name", "slug", "updatedAt", "status", "customerStage",
  "onboardingStatus", "trialStartsAt", "trialEndsAt"
) VALUES
  ('current192-tenant-a', 'CURRENT192 A', 'current192-a', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days'),
  ('current192-tenant-b', 'CURRENT192 B', 'current192-b', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days');

INSERT INTO public."User" (
  "id", "tenantId", "email", "passwordHash", "role", "accessScope",
  "updatedAt", "isActive"
) VALUES
  ('current192-user-a', 'current192-tenant-a', 'current192-a@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE),
  ('current192-user-b', 'current192-tenant-b', 'current192-b@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE);

INSERT INTO public."Store" (
  "id", "tenantId", "name", "updatedAt", "isActive"
) VALUES
  ('current192-store-a', 'current192-tenant-a', 'A1', CURRENT_TIMESTAMP, TRUE),
  ('current192-store-b', 'current192-tenant-b', 'B1', CURRENT_TIMESTAMP, TRUE);

INSERT INTO public."TenantAdmissionDecision" (
  "id", "tenantId", "requestId", "requestDigest", "workflowLocator",
  "reservationSubjectId", "expectedClaimRevision", "shellEvidenceDigest",
  "releaseSha", "environment", "artifactDigest", "schemaHead",
  "migrationCount", "policyManifestDigest", "databaseIdentityDigest",
  "expectedEntitlementProfileRevision", "expectedExecutionRevision",
  "profileDigest", "gateSetDigest", "approvedByUserId",
  "approvalReferenceDigest", "payload", "payloadDigest", "signingKeyId",
  "publicKeyFingerprint", "signature", "approvedAt", "validUntil",
  "consumedAt"
) VALUES
  (
    'current192-go-a', 'current192-tenant-a', 'go-request-current192-a',
    repeat('1', 64), 'locator-a', 'subject-a', 1, repeat('2', 64),
    repeat('a', 40), 'test', repeat('3', 64), 'CURRENT190', 190,
    repeat('4', 64), repeat('5', 64), 1, 1, repeat('6', 64),
    repeat('7', 64), 'current192-user-a', repeat('8', 64), '{}'::JSONB,
    repeat('9', 64), 'test-key', repeat('a', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  ),
  (
    'current192-go-b', 'current192-tenant-b', 'go-request-current192-b',
    repeat('b', 64), 'locator-b', 'subject-b', 1, repeat('c', 64),
    repeat('b', 40), 'test', repeat('d', 64), 'CURRENT190', 190,
    repeat('e', 64), repeat('f', 64), 1, 1, repeat('0', 64),
    repeat('1', 64), 'current192-user-b', repeat('2', 64), '{}'::JSONB,
    repeat('3', 64), 'test-key', repeat('4', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  );
SET LOCAL session_replication_role = origin;

SELECT * FROM public.langame_onboarding_stage_receipt_current188_v1(
  'current192-receipt-a', 'current192-tenant-a', 'current192-user-a',
  repeat('a', 64), 'stage-request-1920001', repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), 'current192-store-a',
  '443.langame.ru', '42', 'opaque-ciphertext-current192-a'
);

SELECT * FROM public.langame_onboarding_activate_current188_v1(
  'current192-tenant-a', 'current192-user-a', 'current192-receipt-a',
  'activate-request-19201', repeat('f', 64), repeat('c', 64),
  repeat('e', 64), 'current192-store-a', '443.langame.ru', '42'
);

CREATE TEMP TABLE current192_plan AS
WITH plan_text AS (
  SELECT (
    '["LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1",' ||
    '{"tenantId":"current192-tenant-a","storeId":"current192-store-a",' ||
    '"sourceId":"' || store."integrationSourceId" || '",' ||
    '"domain":"443.langame.ru","externalClubId":"42"},' ||
    '{"approvalDigest":"' || repeat('1', 64) || '",' ||
    '"preflightReadSetDigest":"' || repeat('2', 64) || '"},' ||
    '[{"externalProductId":"10","article":"LG-443.langame.ru-10",' ||
    '"name":"Water","isActive":true},' ||
    '{"externalProductId":"11","article":"LG-443.langame.ru-11",' ||
    '"name":"Snack","isActive":false}],' ||
    '[{"externalProductId":"10","quantity":5}]]'
  )::TEXT AS canonical_plan
  FROM public."Store" AS store
  WHERE store."id" = 'current192-store-a'
)
SELECT canonical_plan,
  pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(canonical_plan, 'UTF8')
  ), 'hex') AS plan_digest
FROM plan_text;

SELECT * FROM public.langame_initial_sync_record_preflight_current191_v1(
  'current192-preflight-a', 'current192-tenant-a', 'current192-user-a',
  'current192-receipt-a',
  (SELECT "claimId" FROM public."LangameOnboardingStagedReceiptV1"
   WHERE "id" = 'current192-receipt-a'),
  'current192-store-a',
  (SELECT "integrationSourceId" FROM public."Store"
   WHERE "id" = 'current192-store-a'),
  (SELECT source."credentialId" FROM public."Store" AS store
   INNER JOIN public."IntegrationSource" AS source
     ON source."id" = store."integrationSourceId"
   WHERE store."id" = 'current192-store-a'),
  'activate-request-19201', 'initial-sync-req-19201',
  repeat('c', 64), repeat('e', 64), repeat('1', 64), repeat('2', 64),
  (SELECT plan_digest FROM current192_plan),
  '443.langame.ru', '42', 2, 1
);

CREATE TEMP TABLE current192_approval AS
SELECT * FROM public.langame_initial_sync_confirm_current191_v1(
  'current192-tenant-a', 'current192-user-a', 'current192-preflight-a',
  'confirm-request-19201', repeat('4', 64), repeat('1', 64),
  (SELECT plan_digest FROM current192_plan)
);

-- An existing Langame-bound product exercises preservation of manual fields.
INSERT INTO public."Product" (
  "id", "tenantId", "article", "name", "purchasePrice", "salePrice",
  "facing", "isActive", "assortmentRole", "isMandatory",
  "externalProvider", "externalDomain", "externalProductId",
  "createdAt", "updatedAt"
) VALUES
  ('current192-product-10', 'current192-tenant-a', 'CUSTOM-ARTICLE-10',
   'Old Water', 7, 9, 3, FALSE, 'CORE', TRUE,
   'LANGAME', '443.langame.ru', '10', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('current192-product-99', 'current192-tenant-a', 'CUSTOM-ARTICLE-99',
   'Missing but preserved', 4, 6, 2, TRUE, 'MARGIN_DRIVER', TRUE,
   'LANGAME', '443.langame.ru', '99', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TEMP TABLE current192_claim AS
SELECT * FROM public.langame_initial_sync_claim_current192_v1(
  'current192-execution-a', 'current192-tenant-a', 'current192-user-a',
  (SELECT "approvalId" FROM current192_approval),
  'claim-request-192001', repeat('5', 64),
  repeat('claim-token-192-a_', 3),
  (SELECT plan_digest FROM current192_plan)
);

CREATE TEMP TABLE current192_claim_replay AS
SELECT * FROM public.langame_initial_sync_claim_current192_v1(
  'current192-execution-a', 'current192-tenant-a', 'current192-user-a',
  (SELECT "approvalId" FROM current192_approval),
  'claim-request-192001', repeat('5', 64),
  repeat('claim-token-192-a_', 3),
  (SELECT plan_digest FROM current192_plan)
);

DO $claim_replay_mismatch$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_claim_current192_v1(
      'current192-execution-a', 'current192-tenant-a', 'current192-user-a',
      (SELECT "approvalId" FROM current192_approval),
      'claim-request-192001', repeat('5', 64),
      repeat('changed-token-192_', 3),
      (SELECT plan_digest FROM current192_plan)
    );
    RAISE EXCEPTION 'CURRENT192 changed claim replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$claim_replay_mismatch$;

DO $assert_claim$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current192_claim
    WHERE "executionId" = 'current192-execution-a'
      AND "status" = 'CLAIMED' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current192_claim_replay
    WHERE "executionId" = 'current192-execution-a'
      AND "status" = 'CLAIMED' AND "replayed" = TRUE
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameInitialSyncExecutionV1") <> 1
  OR (SELECT pg_catalog.count(*)
      FROM public."LangameInitialSyncExecutionEventV1"
      WHERE "eventType" = 'CLAIMED') <> 1
  OR EXISTS (
    SELECT 1 FROM public."InventorySnapshot"
    WHERE "tenantId" = 'current192-tenant-a'
  ) THEN
    RAISE EXCEPTION 'CURRENT192 claim assertion failed';
  END IF;
END;
$assert_claim$;

CREATE TEMP TABLE current192_execution AS
SELECT * FROM public.langame_initial_sync_execute_current192_v1(
  'current192-tenant-a', 'current192-user-a', 'current192-execution-a',
  repeat('claim-token-192-a_', 3),
  'execute-request-19201', repeat('6', 64),
  (SELECT canonical_plan FROM current192_plan)
);

CREATE TEMP TABLE current192_execution_replay AS
SELECT * FROM public.langame_initial_sync_execute_current192_v1(
  'current192-tenant-a', 'current192-user-a', 'current192-execution-a',
  repeat('claim-token-192-a_', 3),
  'execute-request-19201', repeat('6', 64),
  (SELECT canonical_plan FROM current192_plan)
);

DO $execute_replay_mismatch$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_execute_current192_v1(
      'current192-tenant-a', 'current192-user-a', 'current192-execution-a',
      repeat('claim-token-192-a_', 3),
      'execute-request-changed', repeat('7', 64),
      (SELECT canonical_plan FROM current192_plan)
    );
    RAISE EXCEPTION 'CURRENT192 changed execution replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$execute_replay_mismatch$;

CREATE TEMP TABLE current192_reconciled AS
SELECT * FROM public.langame_initial_sync_reconcile_current192_v1(
  'current192-tenant-a', 'current192-execution-a',
  repeat('claim-token-192-a_', 3),
  (SELECT plan_digest FROM current192_plan)
);

DO $assert_execution$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current192_execution
    WHERE "status" = 'COMPLETED' AND "productsCount" = 2
      AND "inventoryCount" = 1 AND "resultDigest" ~ '^[a-f0-9]{64}$'
      AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current192_execution_replay
    WHERE "status" = 'COMPLETED' AND "replayed" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM current192_reconciled
    WHERE "status" = 'COMPLETED' AND "businessWritesCommitted" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."Product"
    WHERE "id" = 'current192-product-10'
      AND "article" = 'CUSTOM-ARTICLE-10'
      AND "name" = 'Water' AND "purchasePrice" = 7 AND "salePrice" = 9
      AND "facing" = 3 AND "isActive" = TRUE
      AND "assortmentRole" = 'CORE' AND "isMandatory" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."Product"
    WHERE "tenantId" = 'current192-tenant-a'
      AND "externalProvider" = 'LANGAME'
      AND "externalDomain" = '443.langame.ru'
      AND "externalProductId" = '11'
      AND "article" = 'LG-443.langame.ru-11'
      AND "name" = 'Snack' AND "isActive" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."Product"
    WHERE "id" = 'current192-product-99'
      AND "isActive" = TRUE AND "externalMissingSince" IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public."InventorySnapshot" AS snapshot
    INNER JOIN public."Product" AS product ON product."id" = snapshot."productId"
    WHERE snapshot."tenantId" = 'current192-tenant-a'
      AND snapshot."storeId" = 'current192-store-a'
      AND snapshot."quantity" = 5
      AND snapshot."externalProvider" = 'LANGAME'
      AND snapshot."externalDomain" = '443.langame.ru'
      AND snapshot."externalClubId" = '42'
      AND product."externalProductId" = '10'
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameInitialSyncExecutionEventV1"
        WHERE "executionId" = 'current192-execution-a') <> 2
  OR EXISTS (
    SELECT 1 FROM public."IntegrationSyncJob"
    WHERE "tenantId" = 'current192-tenant-a'
  ) THEN
    RAISE EXCEPTION 'CURRENT192 execution/reconcile assertion failed';
  END IF;
END;
$assert_execution$;

-- A second approved plan is claimed but never executed, then reconciled after
-- a synthetic lease age. It must expire without adding business rows.
SELECT * FROM public.langame_initial_sync_record_preflight_current191_v1(
  'current192-preflight-expire', 'current192-tenant-a', 'current192-user-a',
  'current192-receipt-a',
  (SELECT "claimId" FROM public."LangameOnboardingStagedReceiptV1"
   WHERE "id" = 'current192-receipt-a'),
  'current192-store-a',
  (SELECT "integrationSourceId" FROM public."Store"
   WHERE "id" = 'current192-store-a'),
  (SELECT source."credentialId" FROM public."Store" AS store
   INNER JOIN public."IntegrationSource" AS source
     ON source."id" = store."integrationSourceId"
   WHERE store."id" = 'current192-store-a'),
  'activate-request-19201', 'initial-sync-req-expire',
  repeat('c', 64), repeat('e', 64), repeat('8', 64), repeat('9', 64),
  repeat('a', 64), '443.langame.ru', '42', 0, 0
);
CREATE TEMP TABLE current192_expiry_approval AS
SELECT * FROM public.langame_initial_sync_confirm_current191_v1(
  'current192-tenant-a', 'current192-user-a', 'current192-preflight-expire',
  'confirm-request-expire', repeat('b', 64), repeat('8', 64), repeat('a', 64)
);
SELECT * FROM public.langame_initial_sync_claim_current192_v1(
  'current192-execution-expire', 'current192-tenant-a', 'current192-user-a',
  (SELECT "approvalId" FROM current192_expiry_approval),
  'claim-request-expire', repeat('c', 64), repeat('expire-token-192_', 3),
  repeat('a', 64)
);

SET LOCAL session_replication_role = replica;
UPDATE public."LangameInitialSyncExecutionV1"
SET "claimedAt" = clock_timestamp() - INTERVAL '16 minutes',
    "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 minute'
WHERE "id" = 'current192-execution-expire';
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE current192_expired AS
SELECT * FROM public.langame_initial_sync_reconcile_current192_v1(
  'current192-tenant-a', 'current192-execution-expire',
  repeat('expire-token-192_', 3), repeat('a', 64)
);

DO $assert_expired$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current192_expired
    WHERE "status" = 'EXPIRED' AND "businessWritesCommitted" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameInitialSyncExecutionV1"
    WHERE "id" = 'current192-execution-expire'
      AND "status" = 'EXPIRED' AND "expiredAt" IS NOT NULL
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameInitialSyncExecutionEventV1"
        WHERE "executionId" = 'current192-execution-expire') <> 2
  OR (SELECT pg_catalog.count(*) FROM public."InventorySnapshot"
      WHERE "tenantId" = 'current192-tenant-a') <> 1 THEN
    RAISE EXCEPTION 'CURRENT192 expiry assertion failed';
  END IF;
END;
$assert_expired$;

ROLLBACK;
