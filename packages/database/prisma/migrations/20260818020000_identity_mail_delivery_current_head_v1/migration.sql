BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The active initial-owner mail worker is deliberately fail-closed against an
-- exact canonical migration manifest. Founder beta activation and owner-invite
-- reissue moved the canonical head past CURRENT_179, so re-pin only the
-- readiness receipt to the exact CURRENT_185 manifest. The delivery RPCs and
-- their authority surface remain unchanged.
DO $$
DECLARE
  completed_migration_count INTEGER;
  lexical_migration_head TEXT;
  preterminal_manifest_digest TEXT;
  migration_owner_oid OID;
BEGIN
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
    preterminal_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF completed_migration_count IS DISTINCT FROM 184
     OR lexical_migration_head IS DISTINCT FROM
       '20260818010000_founder_owner_invite_reissue_v1'
     OR preterminal_manifest_digest IS DISTINCT FROM
       'f269f0878c9940b7ee2619e778e032361acc844364ab876bbe7fcc01e15a9fcd'
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260818020000_identity_mail_delivery_current_head_v1'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_185 requires the exact completed CURRENT_184 migration set'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailOutbox"'
  );

  IF migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'public."identity_mail_delivery_worker_assert_v1"(text)',
             'a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37'
           ),
           (
             'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
             'f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b'
           ),
           (
             'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
             'a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742'
           ),
           (
             'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
             '650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc'
           ),
           (
             'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
             'a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2'
           )
       ) AS required("signature", "prosrc_sha256")
       LEFT JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
       LEFT JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
       WHERE routine.oid IS NULL
          OR routine.proowner <> migration_owner_oid
          OR pg_catalog.encode(
            pg_catalog.sha256(
              pg_catalog.convert_to(routine.prosrc, 'UTF8')
            ),
            'hex'
          ) <> required."prosrc_sha256"
          OR routine.prokind IS DISTINCT FROM 'f'::"char"
          OR routine.prorettype IS DISTINCT FROM
            pg_catalog.to_regtype('pg_catalog.jsonb')
          OR routine.prosecdef IS DISTINCT FROM TRUE
          OR routine.proleakproof IS DISTINCT FROM FALSE
          OR routine.proisstrict IS DISTINCT FROM FALSE
          OR routine.proretset IS DISTINCT FROM FALSE
          OR routine.provolatile IS DISTINCT FROM 'v'::"char"
          OR routine.proparallel IS DISTINCT FROM 'u'::"char"
          OR language.lanname IS DISTINCT FROM 'plpgsql'
          OR routine.proconfig IS DISTINCT FROM
            ARRAY['search_path=pg_catalog']::TEXT[]
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."identity_mail_delivery_worker_assert_v1"(text)'),
           ('public."identity_initial_owner_mail_claim_v1"(text,text,text,text)'),
           ('public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)'),
           ('public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)')
       ) AS required("signature")
       INNER JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS granted_role
         ON granted_role.oid = privilege.grantee
       WHERE privilege.privilege_type = 'EXECUTE'
         AND privilege.grantee <> routine.proowner
         AND (
           privilege.grantee = 0
           OR privilege.is_grantable
           OR NOT EXISTS (
             SELECT 1
             FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
             WHERE enrollment."workerRoleOid" = privilege.grantee::BIGINT
               AND enrollment."workerRoleName" = granted_role.rolname
           )
         )
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_185 identity mail worker prerequisite is unsafe'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v1"(
  p_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  enrollment_record RECORD;
  migration_count INTEGER;
  migration_head TEXT;
  preterminal_manifest_digest TEXT;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id <> pg_catalog.lower(
       pg_catalog.btrim(p_tenant_id COLLATE "C")
     )
     OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity mail worker tenant is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    enrollment."policyRevision",
    enrollment."maxAttempts",
    enrollment."leaseSeconds",
    enrollment."acknowledgeSeconds",
    enrollment."baseRetrySeconds",
    enrollment."maxRetrySeconds",
    enrollment."providerAuthorityDigest"
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  INNER JOIN pg_catalog.pg_roles AS worker_role
    ON worker_role.rolname = session_user
   AND worker_role.oid::BIGINT = enrollment."workerRoleOid"
  WHERE enrollment."tenantId" = p_tenant_id
    AND enrollment."enabled" = true
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
         OR membership.roleid = worker_role.oid
    )
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker is not enrolled for tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    (
      SELECT migration."migration_name"
      FROM public."_prisma_migrations" AS migration
      WHERE migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL
      ORDER BY
        migration."started_at" DESC,
        migration."migration_name" DESC
      LIMIT 1
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            migration."migration_name" || ' ' || migration."checksum",
            E'\n'
            ORDER BY migration."migration_name" COLLATE "C"
          ) FILTER (
            WHERE migration."migration_name" <>
              '20260818020000_identity_mail_delivery_current_head_v1'
          ) || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    migration_count,
    migration_head,
    preterminal_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 185
     OR migration_head IS DISTINCT FROM
       '20260818020000_identity_mail_delivery_current_head_v1'
     OR preterminal_manifest_digest IS DISTINCT FROM
       'f269f0878c9940b7ee2619e778e032361acc844364ab876bbe7fcc01e15a9fcd'
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker database migration receipt is not CURRENT_185'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER',
    'decision', 'READY',
    'tenantId', p_tenant_id,
    'migrationHead', migration_head,
    'migrationCount', migration_count,
    'preterminalManifestDigest', preterminal_manifest_digest,
    'policyRevision', enrollment_record."policyRevision",
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
ON FUNCTION public."identity_mail_delivery_worker_assert_v1"(TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION
  public."identity_mail_delivery_worker_assert_v1"(TEXT)
IS
  'Fail-closed identity mail worker readiness receipt bound to the exact canonical CURRENT_185 release head.';

DO $$
DECLARE
  migration_owner_oid OID;
  worker_assert_oid OID;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailOutbox"'
  );

  worker_assert_oid := pg_catalog.to_regprocedure(
    'public."identity_mail_delivery_worker_assert_v1"(text)'
  );

  IF worker_assert_oid IS NULL
     OR migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
       WHERE routine.oid = worker_assert_oid
         AND (
           routine.proowner <> migration_owner_oid
           OR routine.prokind IS DISTINCT FROM 'f'::"char"
           OR routine.prorettype IS DISTINCT FROM
             pg_catalog.to_regtype('pg_catalog.jsonb')
           OR routine.prosecdef IS DISTINCT FROM TRUE
           OR routine.proleakproof IS DISTINCT FROM FALSE
           OR routine.proisstrict IS DISTINCT FROM FALSE
           OR routine.proretset IS DISTINCT FROM FALSE
           OR routine.provolatile IS DISTINCT FROM 'v'::"char"
           OR routine.proparallel IS DISTINCT FROM 'u'::"char"
           OR language.lanname IS DISTINCT FROM 'plpgsql'
           OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog']::TEXT[]
         )
     )
     OR (
       SELECT pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(routine.prosrc, 'UTF8')
         ),
         'hex'
       )
       FROM pg_catalog.pg_proc AS routine
       WHERE routine.oid = worker_assert_oid
     ) IS DISTINCT FROM
       '47690501257272fd455475a00bea0e21b13f27187a669adef2115de349633315'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(
           routine.proacl,
           pg_catalog.acldefault('f', routine.proowner)
         )
       ) AS privilege
       LEFT JOIN pg_catalog.pg_roles AS granted_role
         ON granted_role.oid = privilege.grantee
       WHERE routine.oid = worker_assert_oid
         AND privilege.privilege_type = 'EXECUTE'
         AND privilege.grantee <> routine.proowner
         AND (
           privilege.grantee = 0
           OR privilege.is_grantable
           OR NOT EXISTS (
             SELECT 1
             FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
             WHERE enrollment."workerRoleOid" = privilege.grantee::BIGINT
               AND enrollment."workerRoleName" = granted_role.rolname
           )
         )
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_185 identity mail worker assertion postcondition failed'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

COMMIT;
