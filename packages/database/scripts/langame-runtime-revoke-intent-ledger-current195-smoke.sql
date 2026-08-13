\set ON_ERROR_STOP on

-- Run after CURRENT192, CURRENT194 and CURRENT195 only on a disposable *_ci DB.
-- Every fixture role, row and ACL mutation is rolled back.
BEGIN;

CREATE ROLE leetplus_langame_initial_sync_current192
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;

DO $database_acl$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC',
    pg_catalog.current_database()
  );
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON DATABASE %I FROM %I',
    pg_catalog.current_database(),
    'leetplus_langame_initial_sync_current192'
  );
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO %I',
    pg_catalog.current_database(),
    'leetplus_langame_initial_sync_current192'
  );
END;
$database_acl$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO leetplus_langame_initial_sync_current192;
REVOKE ALL ON ALL TABLES IN SCHEMA public
FROM leetplus_langame_initial_sync_current192;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public
FROM leetplus_langame_initial_sync_current192;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM leetplus_langame_initial_sync_current192;
GRANT EXECUTE ON FUNCTION public.langame_initial_sync_claim_current192_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO leetplus_langame_initial_sync_current192;
GRANT EXECUTE ON FUNCTION public.langame_initial_sync_execute_current192_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO leetplus_langame_initial_sync_current192;
GRANT EXECUTE ON FUNCTION public.langame_initial_sync_reconcile_current192_v1(
  TEXT, TEXT, TEXT, TEXT
) TO leetplus_langame_initial_sync_current192;
GRANT EXECUTE ON FUNCTION public.langame_runtime_attestation_consume_current194_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO leetplus_langame_initial_sync_current192;

CREATE TEMP TABLE current195_identity AS
SELECT database_object.oid::BIGINT AS database_oid,
  executor.oid::BIGINT AS executor_oid,
  owner_role.oid::BIGINT AS owner_oid,
  owner_role.rolname AS owner_name
FROM pg_catalog.pg_database AS database_object
CROSS JOIN pg_catalog.pg_roles AS executor
CROSS JOIN pg_catalog.pg_roles AS owner_role
WHERE database_object.datname = pg_catalog.current_database()
  AND executor.rolname = 'leetplus_langame_initial_sync_current192'
  AND owner_role.rolname = CURRENT_USER;

CREATE TEMP TABLE current195_attestation_a AS
SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
  'attestation-current195-a', 'register-request-195-a', repeat('1', 64),
  repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('a', 40),
  'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
  pg_catalog.current_database(),
  (SELECT database_oid FROM current195_identity),
  'leetplus_langame_initial_sync_current192',
  (SELECT executor_oid FROM current195_identity),
  (SELECT owner_name FROM current195_identity),
  (SELECT owner_oid FROM current195_identity),
  'langame-current193-current195-a', repeat('5', 64),
  pg_catalog.clock_timestamp() - INTERVAL '1 minute',
  pg_catalog.clock_timestamp() + INTERVAL '3 minutes'
);

CREATE TEMP TABLE current195_attestation_b AS
SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
  'attestation-current195-b', 'register-request-195-b', repeat('a', 64),
  repeat('b', 64), repeat('c', 64), repeat('d', 64), repeat('b', 40),
  'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
  pg_catalog.current_database(),
  (SELECT database_oid FROM current195_identity),
  'leetplus_langame_initial_sync_current192',
  (SELECT executor_oid FROM current195_identity),
  (SELECT owner_name FROM current195_identity),
  (SELECT owner_oid FROM current195_identity),
  'langame-current193-current195-b', repeat('f', 64),
  pg_catalog.clock_timestamp() - INTERVAL '1 minute',
  pg_catalog.clock_timestamp() + INTERVAL '3 minutes'
);

SET SESSION AUTHORIZATION leetplus_langame_initial_sync_current192;

DO $consume$
DECLARE
  consumed_a RECORD;
  consumed_b RECORD;
BEGIN
  SELECT * INTO STRICT consumed_a
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current195-a', repeat('2', 64), repeat('3', 64),
    repeat('a', 40), 'consume-request-195-a', repeat('6', 64)
  );
  SELECT * INTO STRICT consumed_b
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current195-b', repeat('b', 64), repeat('c', 64),
    repeat('b', 40), 'consume-request-195-b', repeat('e', 64)
  );
  IF consumed_a."status" <> 'CONSUMED'
     OR consumed_b."status" <> 'CONSUMED'
  THEN
    RAISE EXCEPTION 'CURRENT195 prerequisite consume failed';
  END IF;
END;
$consume$;

RESET SESSION AUTHORIZATION;

CREATE TEMP TABLE current195_registered AS
SELECT * FROM public.langame_runtime_revoke_intent_register_current195_v1(
  'revoke-intent-current195-a', repeat('9', 64),
  'attestation-current195-a', repeat('2', 64),
  'langame-current193-current195-a', repeat('5', 64),
  'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1', repeat('a', 40),
  pg_catalog.current_database(),
  (SELECT database_oid FROM current195_identity),
  (SELECT owner_name FROM current195_identity),
  (SELECT owner_oid FROM current195_identity),
  'revoke-request-current195-a', repeat('7', 64), repeat('8', 64),
  'langame-current195-ci-a', repeat('6', 64), repeat('A', 86),
  pg_catalog.clock_timestamp() - INTERVAL '30 seconds',
  pg_catalog.clock_timestamp() + INTERVAL '2 minutes'
);

CREATE TEMP TABLE current195_register_replay AS
SELECT * FROM public.langame_runtime_revoke_intent_register_current195_v1(
  'revoke-intent-current195-a', repeat('9', 64),
  'attestation-current195-a', repeat('2', 64),
  'langame-current193-current195-a', repeat('5', 64),
  'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1', repeat('a', 40),
  pg_catalog.current_database(),
  (SELECT database_oid FROM current195_identity),
  (SELECT owner_name FROM current195_identity),
  (SELECT owner_oid FROM current195_identity),
  'revoke-request-current195-a', repeat('7', 64), repeat('8', 64),
  'langame-current195-ci-a', repeat('6', 64), repeat('A', 86),
  (SELECT "issuedAt" FROM public."LangameRuntimeRevokeIntentV1"
   WHERE "id" = 'revoke-intent-current195-a'),
  (SELECT "validUntil" FROM public."LangameRuntimeRevokeIntentV1"
   WHERE "id" = 'revoke-intent-current195-a')
);

DO $register_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current195_registered
    WHERE "status" = 'PENDING' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current195_register_replay
    WHERE "status" = 'PENDING' AND "replayed" = TRUE
  ) THEN
    RAISE EXCEPTION 'CURRENT195 register/replay assertion failed';
  END IF;
  BEGIN
    PERFORM *
    FROM public.langame_runtime_revoke_intent_register_current195_v1(
      'revoke-intent-current195-a', repeat('9', 64),
      'attestation-current195-a', repeat('2', 64),
      'langame-current193-current195-a', repeat('5', 64),
      'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1', repeat('a', 40),
      pg_catalog.current_database(),
      (SELECT database_oid FROM current195_identity),
      (SELECT owner_name FROM current195_identity),
      (SELECT owner_oid FROM current195_identity),
      'revoke-request-current195-a', repeat('7', 64), repeat('0', 64),
      'langame-current195-ci-a', repeat('6', 64), repeat('A', 86),
      (SELECT "issuedAt" FROM public."LangameRuntimeRevokeIntentV1"
       WHERE "id" = 'revoke-intent-current195-a'),
      (SELECT "validUntil" FROM public."LangameRuntimeRevokeIntentV1"
       WHERE "id" = 'revoke-intent-current195-a')
    );
    RAISE EXCEPTION 'CURRENT195 changed register replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    UPDATE public."LangameRuntimeRevokeIntentV1"
    SET "status" = 'APPLIED', "appliedAt" = pg_catalog.clock_timestamp();
    RAISE EXCEPTION 'CURRENT195 direct intent mutation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$register_assertions$;

CREATE TEMP TABLE current195_expiring AS
SELECT * FROM public.langame_runtime_revoke_intent_register_current195_v1(
  'revoke-intent-current195-b', repeat('0', 64),
  'attestation-current195-b', repeat('b', 64),
  'langame-current193-current195-b', repeat('f', 64),
  'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1', repeat('b', 40),
  pg_catalog.current_database(),
  (SELECT database_oid FROM current195_identity),
  (SELECT owner_name FROM current195_identity),
  (SELECT owner_oid FROM current195_identity),
  'revoke-request-current195-b', repeat('e', 64), repeat('d', 64),
  'langame-current195-ci-b', repeat('c', 64), repeat('B', 86),
  pg_catalog.clock_timestamp() - INTERVAL '30 seconds',
  pg_catalog.clock_timestamp() + INTERVAL '200 milliseconds'
);

SELECT pg_catalog.pg_sleep(0.3);

CREATE TEMP TABLE current195_applied AS
SELECT * FROM public.langame_runtime_revoke_intent_apply_current195_v1(
  'revoke-intent-current195-a', repeat('9', 64)
);
CREATE TEMP TABLE current195_apply_replay AS
SELECT * FROM public.langame_runtime_revoke_intent_apply_current195_v1(
  'revoke-intent-current195-a', repeat('9', 64)
);
CREATE TEMP TABLE current195_expired AS
SELECT * FROM public.langame_runtime_revoke_intent_apply_current195_v1(
  'revoke-intent-current195-b', repeat('0', 64)
);
CREATE TEMP TABLE current195_expiry_replay AS
SELECT * FROM public.langame_runtime_revoke_intent_apply_current195_v1(
  'revoke-intent-current195-b', repeat('0', 64)
);

DO $apply_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current195_applied
    WHERE "status" = 'APPLIED' AND "replayed" = FALSE
      AND "appliedAt" IS NOT NULL AND "expiredAt" IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM current195_apply_replay
    WHERE "status" = 'APPLIED' AND "replayed" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM current195_expired
    WHERE "status" = 'EXPIRED' AND "replayed" = FALSE
      AND "appliedAt" IS NULL AND "expiredAt" IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM current195_expiry_replay
    WHERE "status" = 'EXPIRED' AND "replayed" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameRuntimeAttestationV1"
    WHERE "id" = 'attestation-current195-a' AND "status" = 'REVOKED'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."LangameRuntimeAttestationV1"
    WHERE "id" = 'attestation-current195-b' AND "status" = 'CONSUMED'
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameRuntimeRevokeIntentEventV1") <> 4
  THEN
    RAISE EXCEPTION 'CURRENT195 apply/expiry assertion failed';
  END IF;
  BEGIN
    PERFORM *
    FROM public.langame_runtime_revoke_intent_apply_current195_v1(
      'revoke-intent-current195-a', repeat('1', 64)
    );
    RAISE EXCEPTION 'CURRENT195 changed apply replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    DELETE FROM public."LangameRuntimeRevokeIntentEventV1";
    RAISE EXCEPTION 'CURRENT195 event deletion unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$apply_assertions$;

ROLLBACK;

DO $zero_role_residue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_langame_initial_sync_current192'
  ) THEN
    RAISE EXCEPTION 'CURRENT195 disposable role residue remains';
  END IF;
END;
$zero_role_residue$;
