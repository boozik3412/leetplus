BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT_183 is a stacked, disposable-rehearsal-only successor above the
-- exact frozen CURRENT_182 candidate. It is NOT_DEPLOYABLE. It grants no
-- authority, creates no enrollment and does not wire worker v2 into runtime.
-- The candidate changes only two owner-controlled routine bodies:
--
-- 1. the shared tenant lock requires READ COMMITTED so the next statement in
--    the same transaction receives a snapshot created after any lock wait;
-- 2. worker-v2 readiness is pinned to the exact CURRENT_183 receipt.
--
-- A caller must execute identity_mail_tenant_lock_v1 as a complete statement
-- before executing a data-reading RPC as the next statement. Re-acquiring the
-- same transaction advisory lock inside a worker RPC is intentional.
DO $prerequisite$
DECLARE
  completed_migration_count INTEGER;
  lexical_migration_head TEXT;
  migration_manifest_digest TEXT;
  migration_owner_oid OID;
  candidate_receipt_count INTEGER;
  candidate_receipt_checksum TEXT;
  candidate_receipt_applied_steps INTEGER;
  rehearsal_confirmation TEXT;
  rehearsal_candidate_sha256 TEXT;
BEGIN
  rehearsal_confirmation := pg_catalog.current_setting(
    'leetplus.identity_mail_worker_v2_freshness_current183_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_worker_v2_freshness_current183_sha256',
    true
  );

  IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-worker-v2-freshness-current183'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT_183 candidate is restricted to the confirmed disposable rehearsal boundary'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.min(migration."checksum"),
    pg_catalog.min(migration."applied_steps_count")
  INTO
    candidate_receipt_count,
    candidate_receipt_checksum,
    candidate_receipt_applied_steps
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260802010000_identity_mail_worker_v2_freshness_protocol'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1
     OR candidate_receipt_checksum IS DISTINCT FROM
       rehearsal_candidate_sha256
     OR candidate_receipt_applied_steps IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT_183 requires one exact unfinished Prisma rehearsal receipt'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.max(migration."migration_name"),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            migration."migration_name" || ' ' || migration."checksum",
            E'\n'
            ORDER BY migration."migration_name" COLLATE "C"
          ) || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    completed_migration_count,
    lexical_migration_head,
    migration_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF completed_migration_count IS DISTINCT FROM 182
     OR lexical_migration_head IS DISTINCT FROM
       '20260801030000_identity_mail_tenant_first_claim_protocol'
     OR migration_manifest_digest IS DISTINCT FROM
       'd30a07005d8df4940b05af4b2c6b340704387ed59446f4334e8765c287c71ffd'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260801030000_identity_mail_tenant_first_claim_protocol'
         AND migration."checksum" =
           '4367c2c50b036ae21c22b88dc0980895c9010abb018c3f7a04d58ed0f00efa22'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260802010000_identity_mail_worker_v2_freshness_protocol'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_183 requires the exact completed frozen CURRENT_182 candidate'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  IF migration_owner_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
           'public."identity_mail_tenant_lock_v1"(text)'
         )
         AND routine.proowner = migration_owner_oid
         AND routine.prosecdef = false
         AND routine.provolatile = 'v'::"char"
         AND routine.proparallel = 'u'::"char"
         AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
         AND pg_catalog.encode(
           pg_catalog.sha256(
             pg_catalog.convert_to(routine.prosrc, 'UTF8')
           ),
           'hex'
         ) =
           '31c675561131be5f7b8b20b417567d084fda580da2f6d449eae9470b3808e817'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = pg_catalog.to_regprocedure(
           'public."identity_mail_delivery_worker_assert_v2"(text,text)'
         )
         AND routine.proowner = migration_owner_oid
         AND routine.prosecdef = true
         AND routine.provolatile = 'v'::"char"
         AND routine.proparallel = 'u'::"char"
         AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
         AND pg_catalog.encode(
           pg_catalog.sha256(
             pg_catalog.convert_to(routine.prosrc, 'UTF8')
           ),
           'hex'
         ) =
           'c9f1c0639371712f464a9c879372e27081d34d84d17467e844291115125578e4'
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."identity_mail_tenant_lock_v1"(text)'),
           ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
           ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
           ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
           ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)')
       ) AS required("signature")
       LEFT JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
       WHERE routine.oid IS NULL
          OR routine.proowner <> migration_owner_oid
     )
  THEN
    RAISE EXCEPTION 'CURRENT_183 predecessor worker-v2 contract drifted'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public."identity_mail_tenant_lock_v1"(text)'),
        ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
        ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
        ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
        ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
        ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)')
    ) AS required("signature")
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(required."signature")
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) AS privilege
    WHERE privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee <> routine.proowner
  ) THEN
    RAISE EXCEPTION 'CURRENT_183 requires owner-only worker-v2 routines'
      USING ERRCODE = '42501';
  END IF;
END;
$prerequisite$;

CREATE OR REPLACE FUNCTION public."identity_mail_tenant_lock_v1"(
  p_tenant_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  statement_timeout_interval INTERVAL;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id <> pg_catalog.lower(
       pg_catalog.btrim(p_tenant_id COLLATE "C")
     )
     OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity mail tenant lock input is invalid'
      USING ERRCODE = '22023';
  END IF;

  statement_timeout_interval :=
    pg_catalog.current_setting('statement_timeout')::INTERVAL;

  IF pg_catalog.current_setting('transaction_isolation') <>
       'read committed'
     OR pg_catalog.current_setting('transaction_read_only') <> 'off'
     OR statement_timeout_interval <= INTERVAL '0 milliseconds'
     OR statement_timeout_interval > INTERVAL '30 seconds'
  THEN
    RAISE EXCEPTION
      'Identity mail tenant lock requires read-write READ COMMITTED and a pre-armed statement_timeout in (0,30s]'
      USING ERRCODE = '25001';
  END IF;

  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'leetplus:identity-mail-tenant:v1:' || p_tenant_id, 180
    )
  );

  RETURN p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  p_tenant_id TEXT,
  p_provider_authority_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  tenant_id TEXT;
  enrollment_record RECORD;
  migration_count INTEGER;
  migration_head TEXT;
  candidate_checksum TEXT;
BEGIN
  IF p_provider_authority_digest IS NULL
     OR (p_provider_authority_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity mail worker v2 authority is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);

  SELECT
    enrollment."tenantId",
    enrollment."workerRoleName",
    enrollment."workerRoleOid",
    enrollment."policyRevision",
    enrollment."state",
    enrollment."stateRevision",
    enrollment."activeCommandId",
    enrollment."maxAttempts",
    enrollment."leaseSeconds",
    enrollment."acknowledgeSeconds",
    enrollment."baseRetrySeconds",
    enrollment."maxRetrySeconds",
    enrollment."providerAuthorityDigest",
    enrollment."currentConfigurationDigest"
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  INNER JOIN pg_catalog.pg_roles AS worker_role
    ON worker_role.rolname = session_user
   AND worker_role.oid::BIGINT = enrollment."workerRoleOid"
  WHERE enrollment."tenantId" = tenant_id
    AND enrollment."state" = 'ACTIVE'
    AND enrollment."enabled" = true
    AND enrollment."activeCommandId" IS NULL
    AND enrollment."providerAuthorityDigest" = p_provider_authority_digest
    AND enrollment."workerRoleName" = session_user
    AND enrollment."enabledAt" IS NOT NULL
    AND enrollment."disabledAt" IS NULL
    AND session_user <> current_user
    AND worker_role.rolcanlogin = true
    AND worker_role.rolsuper = false
    AND worker_role.rolinherit = false
    AND worker_role.rolcreaterole = false
    AND worker_role.rolcreatedb = false
    AND worker_role.rolreplication = false
    AND worker_role.rolbypassrls = false
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = worker_role.oid
    )
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker v2 is not ACTIVE for tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.max(migration."migration_name"),
    pg_catalog.min(migration."checksum") FILTER (
      WHERE migration."migration_name" =
        '20260802010000_identity_mail_worker_v2_freshness_protocol'
    )
  INTO migration_count, migration_head, candidate_checksum
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 183
     OR migration_head IS DISTINCT FROM
       '20260802010000_identity_mail_worker_v2_freshness_protocol'
     OR candidate_checksum IS NULL
     OR (candidate_checksum COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker v2 database receipt is not exact CURRENT_183'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER_V2',
    'decision', 'REHEARSAL_READY',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'authorization', false,
    'canSend', false,
    'tenantId', tenant_id,
    'migrationHead', migration_head,
    'migrationCount', migration_count,
    'candidateChecksum', candidate_checksum,
    'state', enrollment_record."state",
    'stateRevision', enrollment_record."stateRevision",
    'policyRevision', enrollment_record."policyRevision",
    'currentConfigurationDigest',
      enrollment_record."currentConfigurationDigest",
    'maxAttempts', enrollment_record."maxAttempts",
    'leaseSeconds', enrollment_record."leaseSeconds",
    'acknowledgeSeconds', enrollment_record."acknowledgeSeconds",
    'baseRetrySeconds', enrollment_record."baseRetrySeconds",
    'maxRetrySeconds', enrollment_record."maxRetrySeconds",
    'providerAuthorityDigest',
      enrollment_record."providerAuthorityDigest"
  );
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT) IS
  'CURRENT_183 NOT_DEPLOYABLE shared READ COMMITTED transaction advisory lock. The caller must complete this lock statement before its next data-reading statement receives a fresh snapshot.';

COMMENT ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  TEXT,
  TEXT
) IS
  'CURRENT_183 NOT_DEPLOYABLE ACTIVE worker-v2 readiness pinned to exact CURRENT_183; no send authorization or runtime grant is created.';

DO $postcondition$
DECLARE
  migration_owner_oid OID;
  invalid_routine_count INTEGER;
  unexpected_overload_count INTEGER;
  unsafe_function_acl_count INTEGER;
  candidate_receipt_count INTEGER;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailDeliveryTenantEnrollment"'
  );

  WITH expected(
    "signature",
    "routine_name",
    "security_definer",
    "result_type",
    "prosrc_sha256"
  ) AS (
    VALUES
      (
        'public."identity_mail_tenant_lock_v1"(text)',
        'identity_mail_tenant_lock_v1',
        false,
        'text',
        'f443f99f51378b16b478238ead767d0beab66acba126444e71abbc6b22c6a702'
      ),
      (
        'public."identity_mail_delivery_worker_assert_v2"(text,text)',
        'identity_mail_delivery_worker_assert_v2',
        true,
        'jsonb',
        'fa0faa75a7ecd332c3dd08ef861489fbb6189aadb6767730c077918433ccad62'
      )
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO invalid_routine_count
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  LEFT JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
  WHERE routine.oid IS NULL
     OR routine.proname IS DISTINCT FROM expected."routine_name"
     OR routine.proowner IS DISTINCT FROM migration_owner_oid
     OR routine.prokind IS DISTINCT FROM 'f'::"char"
     OR routine.prosecdef IS DISTINCT FROM expected."security_definer"
     OR routine.provolatile IS DISTINCT FROM 'v'::"char"
     OR routine.proparallel IS DISTINCT FROM 'u'::"char"
     OR language.lanname IS DISTINCT FROM 'plpgsql'
     OR pg_catalog.format_type(routine.prorettype, NULL)
       IS DISTINCT FROM expected."result_type"
     OR routine.proconfig IS DISTINCT FROM
       ARRAY['search_path=pg_catalog']::TEXT[]
     OR routine.pronargdefaults IS DISTINCT FROM 0
     OR routine.proargdefaults IS NOT NULL
     OR routine.provariadic IS DISTINCT FROM 0::OID
     OR routine.proisstrict IS DISTINCT FROM false
     OR routine.proleakproof IS DISTINCT FROM false
     OR routine.proretset IS DISTINCT FROM false
     OR routine.proallargtypes IS NOT NULL
     OR routine.proargmodes IS NOT NULL
     OR pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM expected."prosrc_sha256";

  IF invalid_routine_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_183 routine catalog metadata is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("signature") AS (
    VALUES
      ('public."identity_mail_tenant_lock_v1"(text)'),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)')
  ),
  expected_routine AS (
    SELECT routine.oid, routine.proname
    FROM expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected."signature")
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unexpected_overload_count
  FROM pg_catalog.pg_proc AS candidate
  INNER JOIN expected_routine
    ON expected_routine.proname = candidate.proname
   AND expected_routine.oid <> candidate.oid
  WHERE candidate.pronamespace = pg_catalog.to_regnamespace('public');

  IF unexpected_overload_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_183 installed an unexpected routine overload'
      USING ERRCODE = '55000';
  END IF;

  WITH required("signature") AS (
    VALUES
      ('public."identity_mail_tenant_lock_v1"(text)'),
      ('public."identity_mail_delivery_worker_assert_v2"(text,text)'),
      ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'),
      ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'),
      ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'),
      ('public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)')
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_function_acl_count
  FROM required
  INNER JOIN pg_catalog.pg_proc AS routine
    ON routine.oid = pg_catalog.to_regprocedure(required."signature")
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f', routine.proowner)
    )
  ) AS privilege
  WHERE privilege.privilege_type = 'EXECUTE'
    AND privilege.grantee <> routine.proowner;

  IF unsafe_function_acl_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_183 installed a non-owner EXECUTE grant'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO candidate_receipt_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260802010000_identity_mail_worker_v2_freshness_protocol'
    AND migration."checksum" = pg_catalog.current_setting(
      'leetplus.identity_mail_worker_v2_freshness_current183_sha256'
    )
    AND migration."applied_steps_count" = 0
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CURRENT_183 rehearsal receipt changed during apply'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;
