\set ON_ERROR_STOP on

-- Run after CURRENT192 and CURRENT194 only on a disposable *_ci database.
-- All fixture roles, ACLs and ledger rows are rolled back.
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

CREATE TEMP TABLE current194_identity AS
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

CREATE TEMP TABLE current194_registered AS
SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
  'attestation-current194-a', 'register-request-194-a', repeat('1', 64),
  repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('a', 40),
  'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
  pg_catalog.current_database(),
  (SELECT database_oid FROM current194_identity),
  'leetplus_langame_initial_sync_current192',
  (SELECT executor_oid FROM current194_identity),
  (SELECT owner_name FROM current194_identity),
  (SELECT owner_oid FROM current194_identity),
  'langame-current194-ci-1', repeat('5', 64),
  pg_catalog.clock_timestamp() - INTERVAL '1 minute',
  pg_catalog.clock_timestamp() + INTERVAL '3 minutes'
);

CREATE TEMP TABLE current194_register_replay AS
SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
  'attestation-current194-a', 'register-request-194-a', repeat('1', 64),
  repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('a', 40),
  'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
  pg_catalog.current_database(),
  (SELECT database_oid FROM current194_identity),
  'leetplus_langame_initial_sync_current192',
  (SELECT executor_oid FROM current194_identity),
  (SELECT owner_name FROM current194_identity),
  (SELECT owner_oid FROM current194_identity),
  'langame-current194-ci-1', repeat('5', 64),
  (SELECT "issuedAt" FROM public."LangameRuntimeAttestationV1"
   WHERE "id" = 'attestation-current194-a'),
  (SELECT "validUntil" FROM public."LangameRuntimeAttestationV1"
   WHERE "id" = 'attestation-current194-a')
);

DO $register_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current194_registered
    WHERE "status" = 'ACTIVE' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current194_register_replay
    WHERE "status" = 'ACTIVE' AND "replayed" = TRUE
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameRuntimeAttestationEventV1"
        WHERE "eventType" = 'REGISTERED') <> 1 THEN
    RAISE EXCEPTION 'CURRENT194 register/replay assertion failed';
  END IF;

  BEGIN
    PERFORM * FROM public.langame_runtime_attestation_register_current194_v1(
      'attestation-current194-a', 'register-request-194-a', repeat('9', 64),
      repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('a', 40),
      'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
      pg_catalog.current_database(),
      (SELECT database_oid FROM current194_identity),
      'leetplus_langame_initial_sync_current192',
      (SELECT executor_oid FROM current194_identity),
      (SELECT owner_name FROM current194_identity),
      (SELECT owner_oid FROM current194_identity),
      'langame-current194-ci-1', repeat('5', 64),
      (SELECT "issuedAt" FROM public."LangameRuntimeAttestationV1"
       WHERE "id" = 'attestation-current194-a'),
      (SELECT "validUntil" FROM public."LangameRuntimeAttestationV1"
       WHERE "id" = 'attestation-current194-a')
    );
    RAISE EXCEPTION 'CURRENT194 changed register replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    UPDATE public."LangameRuntimeAttestationV1"
    SET "status" = 'EXPIRED', "expiredAt" = pg_catalog.clock_timestamp();
    RAISE EXCEPTION 'CURRENT194 direct ledger mutation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$register_assertions$;

CREATE TEMP TABLE current194_expiring AS
SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
  'attestation-current194-b', 'register-request-194-b', repeat('9', 64),
  repeat('b', 64), repeat('c', 64), repeat('d', 64), repeat('b', 40),
  'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3',
  pg_catalog.current_database(),
  (SELECT database_oid FROM current194_identity),
  'leetplus_langame_initial_sync_current192',
  (SELECT executor_oid FROM current194_identity),
  (SELECT owner_name FROM current194_identity),
  (SELECT owner_oid FROM current194_identity),
  'langame-current194-ci-1', repeat('f', 64),
  pg_catalog.clock_timestamp() - INTERVAL '1 minute',
  pg_catalog.clock_timestamp() + INTERVAL '200 milliseconds'
);
SELECT pg_catalog.pg_sleep(0.3);

SET SESSION AUTHORIZATION leetplus_langame_initial_sync_current192;

DO $runtime_consume$
DECLARE
  consumed RECORD;
  replayed RECORD;
  expired RECORD;
  expiry_replayed RECORD;
BEGIN
  BEGIN
    PERFORM 1 FROM public."LangameRuntimeAttestationV1";
    RAISE EXCEPTION 'CURRENT194 direct runtime table read unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT * INTO STRICT consumed
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current194-a', repeat('2', 64), repeat('3', 64),
    repeat('a', 40), 'consume-request-194-a', repeat('6', 64)
  );
  SELECT * INTO STRICT replayed
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current194-a', repeat('2', 64), repeat('3', 64),
    repeat('a', 40), 'consume-request-194-a', repeat('6', 64)
  );
  IF consumed."status" <> 'CONSUMED' OR consumed."replayed" <> FALSE
     OR consumed."consumedAt" IS NULL
     OR replayed."status" <> 'CONSUMED' OR replayed."replayed" <> TRUE
  THEN
    RAISE EXCEPTION 'CURRENT194 consume/replay assertion failed';
  END IF;

  BEGIN
    PERFORM * FROM public.langame_runtime_attestation_consume_current194_v1(
      'attestation-current194-a', repeat('2', 64), repeat('3', 64),
      repeat('a', 40), 'consume-request-changed', repeat('7', 64)
    );
    RAISE EXCEPTION 'CURRENT194 changed consume replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  SELECT * INTO STRICT expired
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current194-b', repeat('b', 64), repeat('c', 64),
    repeat('b', 40), 'consume-request-194-b', repeat('e', 64)
  );
  SELECT * INTO STRICT expiry_replayed
  FROM public.langame_runtime_attestation_consume_current194_v1(
    'attestation-current194-b', repeat('b', 64), repeat('c', 64),
    repeat('b', 40), 'consume-request-194-b', repeat('e', 64)
  );
  IF expired."status" <> 'EXPIRED' OR expired."replayed" <> FALSE
     OR expired."consumedAt" IS NOT NULL
     OR expiry_replayed."status" <> 'EXPIRED'
     OR expiry_replayed."replayed" <> TRUE
  THEN
    RAISE EXCEPTION 'CURRENT194 expiry/replay assertion failed';
  END IF;
  BEGIN
    PERFORM * FROM public.langame_runtime_attestation_consume_current194_v1(
      'attestation-current194-b', repeat('b', 64), repeat('c', 64),
      repeat('b', 40), 'consume-request-changed-b', repeat('f', 64)
    );
    RAISE EXCEPTION 'CURRENT194 changed expiry replay unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$runtime_consume$;

RESET SESSION AUTHORIZATION;

CREATE TEMP TABLE current194_revoked AS
SELECT * FROM public.langame_runtime_attestation_revoke_current194_v1(
  'attestation-current194-a', repeat('2', 64), 'revoke-request-194-a',
  repeat('7', 64), repeat('8', 64)
);
CREATE TEMP TABLE current194_revoke_replay AS
SELECT * FROM public.langame_runtime_attestation_revoke_current194_v1(
  'attestation-current194-a', repeat('2', 64), 'revoke-request-194-a',
  repeat('7', 64), repeat('8', 64)
);

DO $final_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current194_revoked
    WHERE "status" = 'REVOKED' AND "replayed" = FALSE
      AND "revokedAt" IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM current194_revoke_replay
    WHERE "status" = 'REVOKED' AND "replayed" = TRUE
  ) OR (SELECT pg_catalog.count(*)
        FROM public."LangameRuntimeAttestationV1") <> 2
  OR (SELECT pg_catalog.count(*)
      FROM public."LangameRuntimeAttestationEventV1") <> 5
  OR (SELECT pg_catalog.count(*)
      FROM public."LangameRuntimeAttestationEventV1"
      WHERE "eventType" IN (
        'REGISTERED', 'CONSUMED', 'EXPIRED', 'REVOKED'
      )) <> 5 THEN
    RAISE EXCEPTION 'CURRENT194 terminal ledger assertion failed';
  END IF;
END;
$final_assertions$;

ROLLBACK;

DO $zero_role_residue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'leetplus_langame_initial_sync_current192'
  ) THEN
    RAISE EXCEPTION 'CURRENT194 disposable role residue remains';
  END IF;
END;
$zero_role_residue$;
