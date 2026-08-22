\set ON_ERROR_STOP on

-- Run only against a disposable database after the CURRENT188 candidate.
-- Every fixture and activation mutation is rolled back at the end.
BEGIN;
SET LOCAL session_replication_role = replica;

-- Synthetic admission fixtures do not claim to be signed evidence. Relax only
-- their CHECK constraints inside this transaction; ROLLBACK restores them.
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
  ('current188-tenant-a', 'CURRENT188 A', 'current188-a', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days'),
  ('current188-tenant-b', 'CURRENT188 B', 'current188-b', CURRENT_TIMESTAMP,
   'ACTIVE', 'PILOT', 'ONBOARDING', clock_timestamp(),
   clock_timestamp() + INTERVAL '14 days');

INSERT INTO public."User" (
  "id", "tenantId", "email", "passwordHash", "role", "accessScope",
  "updatedAt", "isActive"
) VALUES
  ('current188-user-a', 'current188-tenant-a', 'current188-a@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE),
  ('current188-user-b', 'current188-tenant-b', 'current188-b@example.invalid',
   'not-a-real-password-hash', 'OWNER', 'NETWORK', CURRENT_TIMESTAMP, TRUE);

INSERT INTO public."Store" (
  "id", "tenantId", "name", "updatedAt", "isActive"
) VALUES
  ('current188-store-a', 'current188-tenant-a', 'A1', CURRENT_TIMESTAMP, TRUE),
  ('current188-store-a2', 'current188-tenant-a', 'A2', CURRENT_TIMESTAMP, TRUE),
  ('current188-store-b', 'current188-tenant-b', 'B1', CURRENT_TIMESTAMP, TRUE);

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
    'current188-go-a', 'current188-tenant-a', 'go-request-current188-a',
    repeat('1', 64), 'locator-a', 'subject-a', 1, repeat('2', 64),
    repeat('a', 40), 'test', repeat('3', 64), 'CURRENT187', 187,
    repeat('4', 64), repeat('5', 64), 1, 1, repeat('6', 64),
    repeat('7', 64), 'current188-user-a', repeat('8', 64), '{}'::JSONB,
    repeat('9', 64), 'test-key', repeat('a', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  ),
  (
    'current188-go-b', 'current188-tenant-b', 'go-request-current188-b',
    repeat('b', 64), 'locator-b', 'subject-b', 1, repeat('c', 64),
    repeat('b', 40), 'test', repeat('d', 64), 'CURRENT187', 187,
    repeat('e', 64), repeat('f', 64), 1, 1, repeat('0', 64),
    repeat('1', 64), 'current188-user-b', repeat('2', 64), '{}'::JSONB,
    repeat('3', 64), 'test-key', repeat('4', 64), decode('00', 'hex'),
    clock_timestamp(), clock_timestamp() + INTERVAL '1 day', clock_timestamp()
  );

SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE current188_stage AS
SELECT *
FROM public.langame_onboarding_stage_receipt_current188_v1(
  'current188-receipt-a',
  'current188-tenant-a',
  'current188-user-a',
  repeat('a', 64),
  'stage-request-00000001',
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64),
  repeat('e', 64),
  'current188-store-a',
  '443.langame.ru',
  '42',
  'opaque-ciphertext-current188-a'
);

DO $assert_stage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current188_stage
    WHERE "receiptId" = 'current188-receipt-a'
      AND "status" = 'PENDING'
      AND "bindingDigest" = repeat('e', 64)
      AND "replayed" = FALSE
  ) THEN
    RAISE EXCEPTION 'CURRENT188 initial stage assertion failed';
  END IF;
END;
$assert_stage$;

CREATE TEMP TABLE current188_stage_replay AS
SELECT *
FROM public.langame_onboarding_stage_receipt_current188_v1(
  'ignored-receipt-id-on-replay',
  'current188-tenant-a',
  'current188-user-a',
  repeat('a', 64),
  'stage-request-00000001',
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64),
  repeat('e', 64),
  'current188-store-a',
  '443.langame.ru',
  '42',
  'opaque-ciphertext-current188-a'
);

DO $assert_stage_replay$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current188_stage_replay
    WHERE "receiptId" = 'current188-receipt-a'
      AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameOnboardingStagedReceiptV1"
    WHERE "tenantId" = 'current188-tenant-a'
  ) <> 1 THEN
    RAISE EXCEPTION 'CURRENT188 stage replay assertion failed';
  END IF;
END;
$assert_stage_replay$;

DO $cross_tenant$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_onboarding_activate_current188_v1(
      'current188-tenant-b', 'current188-user-b', 'current188-receipt-a',
      'activate-request-0001', repeat('f', 64), repeat('c', 64),
      repeat('e', 64), 'current188-store-b', '443.langame.ru', '42'
    );
    RAISE EXCEPTION 'CURRENT188 cross-tenant activation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_tenant$;

DO $cross_club$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_onboarding_activate_current188_v1(
      'current188-tenant-a', 'current188-user-a', 'current188-receipt-a',
      'activate-request-0001', repeat('f', 64), repeat('c', 64),
      repeat('e', 64), 'current188-store-a', '443.langame.ru', '43'
    );
    RAISE EXCEPTION 'CURRENT188 cross-club activation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_club$;

CREATE TEMP TABLE current188_activation AS
SELECT *
FROM public.langame_onboarding_activate_current188_v1(
  'current188-tenant-a',
  'current188-user-a',
  'current188-receipt-a',
  'activate-request-0001',
  repeat('f', 64),
  repeat('c', 64),
  repeat('e', 64),
  'current188-store-a',
  '443.langame.ru',
  '42'
);

DO $assert_activation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current188_activation
    WHERE "status" = 'ACTIVATED' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameExternalClubClaimV1"
    WHERE "tenantId" = 'current188-tenant-a'
      AND "storeId" = 'current188-store-a'
      AND "externalDomain" = '443.langame.ru'
      AND "externalClubId" = '42'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."IntegrationCredential"
    WHERE "tenantId" = 'current188-tenant-a'
      AND "apiKeyEncrypted" = 'opaque-ciphertext-current188-a'
      AND "isActive" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."IntegrationSource"
    WHERE "tenantId" = 'current188-tenant-a'
      AND "domain" = '443.langame.ru'
      AND "isActive" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."Store"
    WHERE "id" = 'current188-store-a'
      AND "tenantId" = 'current188-tenant-a'
      AND "externalDomain" = '443.langame.ru'
      AND "externalClubId" = '42'
      AND "backgroundExecutionEnabled" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameOnboardingStagedReceiptV1"
    WHERE "id" = 'current188-receipt-a'
      AND "status" = 'CONSUMED'
      AND "stagedApiKeyEncrypted" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameOnboardingAuditEventV1"
    WHERE "receiptId" = 'current188-receipt-a'
  ) <> 2 OR EXISTS (
    SELECT 1 FROM public."IntegrationSyncJob"
    WHERE "tenantId" = 'current188-tenant-a'
  ) THEN
    RAISE EXCEPTION 'CURRENT188 atomic activation assertion failed';
  END IF;
END;
$assert_activation$;

CREATE TEMP TABLE current188_activation_replay AS
SELECT *
FROM public.langame_onboarding_activate_current188_v1(
  'current188-tenant-a',
  'current188-user-a',
  'current188-receipt-a',
  'activate-request-0001',
  repeat('f', 64),
  repeat('c', 64),
  repeat('e', 64),
  'current188-store-a',
  '443.langame.ru',
  '42'
);

DO $assert_activation_replay$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current188_activation_replay
    WHERE "status" = 'REPLAYED' AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameExternalClubClaimV1"
    WHERE "externalDomain" = '443.langame.ru' AND "externalClubId" = '42'
  ) <> 1 THEN
    RAISE EXCEPTION 'CURRENT188 exact activation replay assertion failed';
  END IF;
END;
$assert_activation_replay$;

DO $changed_replay$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_onboarding_activate_current188_v1(
      'current188-tenant-a', 'current188-user-a', 'current188-receipt-a',
      'activate-request-CHANGED', repeat('0', 64), repeat('c', 64),
      repeat('e', 64), 'current188-store-a', '443.langame.ru', '42'
    );
    RAISE EXCEPTION 'CURRENT188 changed activation replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$changed_replay$;

DO $claimed_cross_tenant$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_onboarding_stage_receipt_current188_v1(
      'current188-receipt-b', 'current188-tenant-b', 'current188-user-b',
      repeat('1', 64), 'stage-request-00000002', repeat('2', 64),
      repeat('3', 64), repeat('4', 64), repeat('5', 64),
      'current188-store-b', '443.langame.ru', '42',
      'opaque-ciphertext-current188-b'
    );
    RAISE EXCEPTION 'CURRENT188 duplicate external claim unexpectedly staged';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$claimed_cross_tenant$;

SET LOCAL session_replication_role = replica;
INSERT INTO public."LangameOnboardingStagedReceiptV1" (
  "id", "tenantId", "actorUserId", "actorDigest", "requestId",
  "requestDigest", "configDigest", "credentialDigest", "bindingDigest",
  "storeId", "externalDomain", "externalClubId", "stagedApiKeyEncrypted",
  "status", "createdAt", "expiresAt"
) VALUES (
  'current188-stale', 'current188-tenant-a', 'current188-user-a',
  repeat('6', 64), 'stage-request-stale01', repeat('7', 64), repeat('8', 64),
  repeat('9', 64), repeat('a', 64), 'current188-store-a2',
  '46.langamepro.ru', '77', 'opaque-ciphertext-current188-stale', 'PENDING',
  clock_timestamp() - INTERVAL '10 minutes',
  clock_timestamp() - INTERVAL '1 minute'
);
SET LOCAL session_replication_role = origin;

DO $stale$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_onboarding_activate_current188_v1(
      'current188-tenant-a', 'current188-user-a', 'current188-stale',
      'activate-request-stale', repeat('b', 64), repeat('8', 64),
      repeat('a', 64), 'current188-store-a2', '46.langamepro.ru', '77'
    );
    RAISE EXCEPTION 'CURRENT188 stale receipt unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$stale$;

CREATE TEMP TABLE current188_expiry AS
SELECT *
FROM public.langame_onboarding_expire_current188_v1(
  'current188-tenant-a',
  100
);

DO $assert_expiry$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current188_expiry
    WHERE "expiredCount" = 1
  ) OR NOT EXISTS (
    SELECT 1
    FROM public."LangameOnboardingStagedReceiptV1"
    WHERE "id" = 'current188-stale'
      AND "status" = 'EXPIRED'
      AND "stagedApiKeyEncrypted" IS NULL
      AND "ciphertextClearedAt" IS NOT NULL
      AND "consumedAt" IS NULL
      AND "claimId" IS NULL
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."LangameOnboardingAuditEventV1"
    WHERE "receiptId" = 'current188-stale'
      AND "eventType" = 'EXPIRED'
  ) <> 1 THEN
    RAISE EXCEPTION 'CURRENT188 expiry cleanup assertion failed';
  END IF;
END;
$assert_expiry$;

ROLLBACK;
