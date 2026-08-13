\set ON_ERROR_STOP on

-- Run only against a disposable database after CURRENT188 and CURRENT191.
-- All synthetic fixtures and ledger rows are rolled back at the end.
BEGIN;
SET LOCAL session_replication_role = replica;

-- Synthetic GO rows are deliberately not signed production evidence. Their
-- CHECK constraints are removed only inside this rolled-back transaction.
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
      'TenantAdmissionDecision',
      constraint_row.conname
    );
  END LOOP;
END;
$drop_synthetic_decision_checks$;

INSERT INTO public."Tenant" (
  "id", "name", "slug", "updatedAt", "status", "customerStage",
  "onboardingStatus", "trialStartsAt", "trialEndsAt"
) VALUES
  ('current191-tenant-a', 'CURRENT191 A', 'current191-a', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days'),
  ('current191-tenant-b', 'CURRENT191 B', 'current191-b', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days');

INSERT INTO public."User" (
  "id", "tenantId", "email", "passwordHash", "role", "accessScope",
  "updatedAt", "isActive"
) VALUES
  ('current191-user-a', 'current191-tenant-a', 'current191-a@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE),
  ('current191-user-b', 'current191-tenant-b', 'current191-b@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE);

INSERT INTO public."Store" (
  "id", "tenantId", "name", "updatedAt", "isActive"
) VALUES
  ('current191-store-a', 'current191-tenant-a', 'A1', CURRENT_TIMESTAMP, TRUE),
  ('current191-store-b', 'current191-tenant-b', 'B1', CURRENT_TIMESTAMP, TRUE);

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
    'current191-go-a', 'current191-tenant-a', 'go-request-current191-a',
    repeat('1', 64), 'locator-a', 'subject-a', 1, repeat('2', 64),
    repeat('a', 40), 'test', repeat('3', 64), 'CURRENT190', 190,
    repeat('4', 64), repeat('5', 64), 1, 1, repeat('6', 64),
    repeat('7', 64), 'current191-user-a', repeat('8', 64), '{}'::JSONB,
    repeat('9', 64), 'test-key', repeat('a', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  ),
  (
    'current191-go-b', 'current191-tenant-b', 'go-request-current191-b',
    repeat('b', 64), 'locator-b', 'subject-b', 1, repeat('c', 64),
    repeat('b', 40), 'test', repeat('d', 64), 'CURRENT190', 190,
    repeat('e', 64), repeat('f', 64), 1, 1, repeat('0', 64),
    repeat('1', 64), 'current191-user-b', repeat('2', 64), '{}'::JSONB,
    repeat('3', 64), 'test-key', repeat('4', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  );

SET LOCAL session_replication_role = origin;

SELECT * FROM public.langame_onboarding_stage_receipt_current188_v1(
  'current191-receipt-a', 'current191-tenant-a', 'current191-user-a',
  repeat('a', 64), 'stage-request-1910001', repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), 'current191-store-a',
  '443.langame.ru', '42', 'opaque-ciphertext-current191-a'
);

SELECT * FROM public.langame_onboarding_activate_current188_v1(
  'current191-tenant-a', 'current191-user-a', 'current191-receipt-a',
  'activate-request-19101', repeat('f', 64), repeat('c', 64),
  repeat('e', 64), 'current191-store-a', '443.langame.ru', '42'
);

CREATE TEMP TABLE current191_preflight AS
SELECT *
FROM public.langame_initial_sync_record_preflight_current191_v1(
  'current191-preflight-a',
  'current191-tenant-a',
  'current191-user-a',
  'current191-receipt-a',
  (SELECT "claimId" FROM public."LangameOnboardingStagedReceiptV1"
   WHERE "id" = 'current191-receipt-a'),
  'current191-store-a',
  (SELECT "integrationSourceId" FROM public."Store"
   WHERE "id" = 'current191-store-a'),
  (SELECT source."credentialId" FROM public."Store" AS store
   INNER JOIN public."IntegrationSource" AS source
     ON source."id" = store."integrationSourceId"
   WHERE store."id" = 'current191-store-a'),
  'activate-request-19101',
  'initial-sync-req-19101',
  repeat('c', 64),
  repeat('e', 64),
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64),
  '443.langame.ru',
  '42',
  2,
  1
);

CREATE TEMP TABLE current191_preflight_replay AS
SELECT *
FROM public.langame_initial_sync_record_preflight_current191_v1(
  'ignored-preflight-id',
  'current191-tenant-a',
  'current191-user-a',
  'current191-receipt-a',
  (SELECT "claimId" FROM public."LangameOnboardingStagedReceiptV1"
   WHERE "id" = 'current191-receipt-a'),
  'current191-store-a',
  (SELECT "integrationSourceId" FROM public."Store"
   WHERE "id" = 'current191-store-a'),
  (SELECT source."credentialId" FROM public."Store" AS store
   INNER JOIN public."IntegrationSource" AS source
     ON source."id" = store."integrationSourceId"
   WHERE store."id" = 'current191-store-a'),
  'activate-request-19101',
  'initial-sync-req-19101',
  repeat('c', 64),
  repeat('e', 64),
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64),
  '443.langame.ru',
  '42',
  2,
  1
);

DO $assert_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current191_preflight
    WHERE "preflightId" = 'current191-preflight-a'
      AND "status" = 'PENDING_CONFIRMATION'
      AND "planDigest" = repeat('3', 64)
      AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current191_preflight_replay
    WHERE "preflightId" = 'current191-preflight-a'
      AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameInitialSyncPreflightV1"
  ) <> 1 OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameInitialSyncAuditEventV1"
    WHERE "eventType" = 'PREFLIGHT_RECORDED'
  ) <> 1 THEN
    RAISE EXCEPTION 'CURRENT191 preflight/replay assertion failed';
  END IF;
END;
$assert_preflight$;

DO $cross_tenant$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_confirm_current191_v1(
      'current191-tenant-b', 'current191-user-b', 'current191-preflight-a',
      'confirm-request-19101', repeat('4', 64), repeat('1', 64), repeat('3', 64)
    );
    RAISE EXCEPTION 'CURRENT191 cross-tenant confirmation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_tenant$;

-- A revoked GO between preflight and confirmation must fail closed.
SET LOCAL session_replication_role = replica;
UPDATE public."TenantAdmissionDecision"
SET "revokedAt" = clock_timestamp()
WHERE "id" = 'current191-go-a';
SET LOCAL session_replication_role = origin;

DO $revoked_go$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_confirm_current191_v1(
      'current191-tenant-a', 'current191-user-a', 'current191-preflight-a',
      'confirm-request-19101', repeat('4', 64), repeat('1', 64), repeat('3', 64)
    );
    RAISE EXCEPTION 'CURRENT191 revoked GO unexpectedly confirmed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$revoked_go$;

SET LOCAL session_replication_role = replica;
UPDATE public."TenantAdmissionDecision"
SET "revokedAt" = NULL
WHERE "id" = 'current191-go-a';
SET LOCAL session_replication_role = origin;

-- Credential drift after provider-read preflight must also fail closed.
UPDATE public."IntegrationCredential"
SET "isActive" = FALSE
WHERE "id" = (
  SELECT source."credentialId" FROM public."IntegrationSource" AS source
  WHERE source."id" = (
    SELECT store."integrationSourceId" FROM public."Store" AS store
    WHERE store."id" = 'current191-store-a'
  )
);

DO $credential_drift$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_confirm_current191_v1(
      'current191-tenant-a', 'current191-user-a', 'current191-preflight-a',
      'confirm-request-19101', repeat('4', 64), repeat('1', 64), repeat('3', 64)
    );
    RAISE EXCEPTION 'CURRENT191 credential drift unexpectedly confirmed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$credential_drift$;

UPDATE public."IntegrationCredential"
SET "isActive" = TRUE
WHERE "id" = (
  SELECT source."credentialId" FROM public."IntegrationSource" AS source
  WHERE source."id" = (
    SELECT store."integrationSourceId" FROM public."Store" AS store
    WHERE store."id" = 'current191-store-a'
  )
);

CREATE TEMP TABLE current191_approval AS
SELECT *
FROM public.langame_initial_sync_confirm_current191_v1(
  'current191-tenant-a', 'current191-user-a', 'current191-preflight-a',
  'confirm-request-19101', repeat('4', 64), repeat('1', 64), repeat('3', 64)
);

CREATE TEMP TABLE current191_approval_replay AS
SELECT *
FROM public.langame_initial_sync_confirm_current191_v1(
  'current191-tenant-a', 'current191-user-a', 'current191-preflight-a',
  'confirm-request-19101', repeat('4', 64), repeat('1', 64), repeat('3', 64)
);

DO $changed_confirmation_replay$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_confirm_current191_v1(
      'current191-tenant-a', 'current191-user-a', 'current191-preflight-a',
      'confirm-request-changed', repeat('5', 64), repeat('1', 64), repeat('3', 64)
    );
    RAISE EXCEPTION 'CURRENT191 changed confirmation replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$changed_confirmation_replay$;

DO $assert_approval$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current191_approval
    WHERE "status" = 'APPROVED' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current191_approval_replay
    WHERE "status" = 'REPLAYED' AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*) FROM public."LangameInitialSyncApprovalV1"
  ) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public."LangameInitialSyncPreflightV1"
    WHERE "id" = 'current191-preflight-a'
      AND "status" = 'CONFIRMED'
      AND "confirmedAt" IS NOT NULL
  ) OR (
    SELECT pg_catalog.count(*) FROM public."LangameInitialSyncAuditEventV1"
    WHERE "preflightId" = 'current191-preflight-a'
  ) <> 2 OR EXISTS (
    SELECT 1 FROM public."IntegrationSyncJob"
    WHERE "tenantId" = 'current191-tenant-a'
  ) OR EXISTS (
    SELECT 1 FROM public."Product"
    WHERE "tenantId" = 'current191-tenant-a'
  ) THEN
    RAISE EXCEPTION 'CURRENT191 approval/effect assertion failed';
  END IF;
END;
$assert_approval$;

DO $append_only$
BEGIN
  BEGIN
    UPDATE public."LangameInitialSyncPreflightV1"
    SET "planDigest" = repeat('9', 64)
    WHERE "id" = 'current191-preflight-a';
    RAISE EXCEPTION 'CURRENT191 immutable preflight unexpectedly changed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    DELETE FROM public."LangameInitialSyncApprovalV1"
    WHERE "preflightId" = 'current191-preflight-a';
    RAISE EXCEPTION 'CURRENT191 approval unexpectedly deleted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$append_only$;

-- A second exact preflight is aged synthetically to exercise bounded expiry.
SELECT *
FROM public.langame_initial_sync_record_preflight_current191_v1(
  'current191-preflight-expire',
  'current191-tenant-a',
  'current191-user-a',
  'current191-receipt-a',
  (SELECT "claimId" FROM public."LangameOnboardingStagedReceiptV1"
   WHERE "id" = 'current191-receipt-a'),
  'current191-store-a',
  (SELECT "integrationSourceId" FROM public."Store"
   WHERE "id" = 'current191-store-a'),
  (SELECT source."credentialId" FROM public."Store" AS store
   INNER JOIN public."IntegrationSource" AS source
     ON source."id" = store."integrationSourceId"
   WHERE store."id" = 'current191-store-a'),
  'activate-request-19101',
  'initial-sync-req-expire',
  repeat('c', 64),
  repeat('e', 64),
  repeat('6', 64),
  repeat('7', 64),
  repeat('8', 64),
  '443.langame.ru',
  '42',
  2,
  1
);

SET LOCAL session_replication_role = replica;
UPDATE public."LangameInitialSyncPreflightV1"
SET "createdAt" = clock_timestamp() - INTERVAL '16 minutes',
    "expiresAt" = clock_timestamp() - INTERVAL '1 minute'
WHERE "id" = 'current191-preflight-expire';
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE current191_expiry AS
SELECT * FROM public.langame_initial_sync_expire_current191_v1(
  'current191-tenant-a', 100
);

DO $assert_expiry$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current191_expiry WHERE "expiredCount" = 1
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameInitialSyncPreflightV1"
    WHERE "id" = 'current191-preflight-expire'
      AND "status" = 'EXPIRED'
      AND "expiredAt" IS NOT NULL
  ) OR (
    SELECT pg_catalog.count(*) FROM public."LangameInitialSyncAuditEventV1"
    WHERE "preflightId" = 'current191-preflight-expire'
  ) <> 2 THEN
    RAISE EXCEPTION 'CURRENT191 expiry assertion failed';
  END IF;
END;
$assert_expiry$;

ROLLBACK;
