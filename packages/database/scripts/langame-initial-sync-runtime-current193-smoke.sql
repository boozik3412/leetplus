\set ON_ERROR_STOP on

-- Run only after CURRENT192 on a disposable *_ci database as a superuser.
-- The role and every ACL mutation are rolled back.
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
REVOKE ALL ON SCHEMA public FROM leetplus_langame_initial_sync_current192;
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

SET SESSION AUTHORIZATION leetplus_langame_initial_sync_current192;

DO $catalog_contract$
DECLARE
  role_row RECORD;
  owned_count INTEGER;
  membership_count INTEGER;
  executable_count INTEGER;
BEGIN
  IF CURRENT_USER <> 'leetplus_langame_initial_sync_current192'
     OR SESSION_USER <> 'leetplus_langame_initial_sync_current192'
  THEN
    RAISE EXCEPTION 'CURRENT193 session identity mismatch';
  END IF;

  SELECT * INTO STRICT role_row
  FROM pg_catalog.pg_roles
  WHERE rolname = 'leetplus_langame_initial_sync_current192';
  IF role_row.rolinherit OR role_row.rolsuper OR role_row.rolcreatedb
     OR role_row.rolcreaterole OR role_row.rolreplication
     OR role_row.rolbypassrls OR NOT role_row.rolcanlogin
  THEN
    RAISE EXCEPTION 'CURRENT193 executor role attributes widened';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER INTO membership_count
  FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.roleid = role_row.oid OR membership.member = role_row.oid;
  IF membership_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT193 executor role membership widened';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
    WHERE acl.grantee = role_row.oid
  ) THEN
    RAISE EXCEPTION 'CURRENT193 executor role default privilege widened';
  END IF;

  SELECT (
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_database
     WHERE datdba = role_row.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_namespace
     WHERE nspowner = role_row.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class
     WHERE relowner = role_row.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc
     WHERE proowner = role_row.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type
     WHERE typowner = role_row.oid)
  )::INTEGER INTO owned_count;
  IF owned_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT193 executor role owns database objects';
  END IF;

  IF NOT pg_catalog.has_database_privilege(
    CURRENT_USER, pg_catalog.current_database(), 'CONNECT'
  ) OR pg_catalog.has_database_privilege(
    CURRENT_USER, pg_catalog.current_database(), 'CREATE'
  ) OR pg_catalog.has_database_privilege(
    CURRENT_USER, pg_catalog.current_database(), 'TEMPORARY'
  ) OR NOT pg_catalog.has_schema_privilege(
    CURRENT_USER, 'public', 'USAGE'
  ) OR pg_catalog.has_schema_privilege(
    CURRENT_USER, 'public', 'CREATE'
  ) THEN
    RAISE EXCEPTION 'CURRENT193 database/schema ACL mismatch';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER INTO executable_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND pg_catalog.has_function_privilege(
      CURRENT_USER, routine.oid, 'EXECUTE'
    );
  IF executable_count <> 3 THEN
    RAISE EXCEPTION 'CURRENT193 executable routine set mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
        (
          routine.proname IN (
            'langame_initial_sync_claim_current192_v1',
            'langame_initial_sync_execute_current192_v1',
            'langame_initial_sync_reconcile_current192_v1'
          )
          AND routine.prosecdef = TRUE
          AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::TEXT[]
        ) OR (
          routine.proname IN (
            'langame_initial_sync_execution_guard_current192_v1',
            'langame_initial_sync_execution_event_guard_current192_v1'
          )
          AND routine.prosecdef = FALSE
          AND routine.proconfig IS NULL
        )
      )
  ) <> 5 OR (
    SELECT pg_catalog.count(DISTINCT routine.proowner)
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        'langame_initial_sync_claim_current192_v1',
        'langame_initial_sync_execute_current192_v1',
        'langame_initial_sync_reconcile_current192_v1',
        'langame_initial_sync_execution_guard_current192_v1',
        'langame_initial_sync_execution_event_guard_current192_v1'
      )
  ) <> 1 OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'langame_initial_sync%current192_v1'
      AND routine.proowner = role_row.oid
  ) THEN
    RAISE EXCEPTION 'CURRENT193 routine definition or owner mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        pg_catalog.has_table_privilege(
          CURRENT_USER, relation.oid, 'SELECT'
        ) OR pg_catalog.has_table_privilege(
          CURRENT_USER, relation.oid, 'INSERT'
        ) OR pg_catalog.has_table_privilege(
          CURRENT_USER, relation.oid, 'UPDATE'
        ) OR pg_catalog.has_table_privilege(
          CURRENT_USER, relation.oid, 'DELETE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'CURRENT193 direct relation privilege widened';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS sequence_object
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = sequence_object.relnamespace
    WHERE namespace.nspname = 'public'
      AND sequence_object.relkind = 'S'
      AND (
        pg_catalog.has_sequence_privilege(
          CURRENT_USER, sequence_object.oid, 'USAGE'
        ) OR pg_catalog.has_sequence_privilege(
          CURRENT_USER, sequence_object.oid, 'SELECT'
        ) OR pg_catalog.has_sequence_privilege(
          CURRENT_USER, sequence_object.oid, 'UPDATE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'CURRENT193 direct sequence privilege widened';
  END IF;
END;
$catalog_contract$;

DO $callable_contract$
BEGIN
  BEGIN
    PERFORM * FROM public.langame_initial_sync_claim_current192_v1(
      '', '', '', '', '', '', '', ''
    );
    RAISE EXCEPTION 'CURRENT193 claim validation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.langame_initial_sync_execute_current192_v1(
      '', '', '', '', '', '', ''
    );
    RAISE EXCEPTION 'CURRENT193 execute validation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.langame_initial_sync_reconcile_current192_v1(
      '', '', '', ''
    );
    RAISE EXCEPTION 'CURRENT193 reconcile validation unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$callable_contract$;

DO $negative_contract$
BEGIN
  BEGIN
    PERFORM 1 FROM public."LangameInitialSyncExecutionV1";
    RAISE EXCEPTION 'CURRENT193 direct table read unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.langame_initial_sync_execution_guard_current192_v1();
    RAISE EXCEPTION 'CURRENT193 guard execution unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TABLE public.current193_forbidden(id INTEGER)';
    RAISE EXCEPTION 'CURRENT193 schema DDL unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE TEMP TABLE current193_forbidden_temp(id INTEGER)';
    RAISE EXCEPTION 'CURRENT193 TEMP unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'CREATE ROLE current193_forbidden_role';
    RAISE EXCEPTION 'CURRENT193 role escalation unexpectedly passed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$negative_contract$;

RESET SESSION AUTHORIZATION;
ROLLBACK;

DO $zero_role_residue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN (
      'leetplus_langame_initial_sync_current192',
      'current193_forbidden_role'
    )
  ) THEN
    RAISE EXCEPTION 'CURRENT193 disposable role residue remains';
  END IF;
END;
$zero_role_residue$;
