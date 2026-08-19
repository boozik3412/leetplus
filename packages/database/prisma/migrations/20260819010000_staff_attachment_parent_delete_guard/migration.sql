-- Staff attachment parent delete guard and canonical CURRENT_186 readiness
-- receipt.
--
-- StaffAttachmentBinding is polymorphic by design, so PostgreSQL cannot express
-- the parent reference as a regular foreign key. These deferred constraint
-- triggers make the DB enforce the important part of that FK contract: a parent
-- row may not disappear while it still grants BOUND attachment authority.
--
-- This migration also re-pins the initial-owner mail worker readiness receipt
-- to the exact CURRENT_186 terminal migration so runtime workers cannot keep
-- claiming CURRENT_185 after the guard becomes part of the canonical chain.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

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

  IF completed_migration_count IS DISTINCT FROM 185
     OR lexical_migration_head IS DISTINCT FROM
       '20260818020000_identity_mail_delivery_current_head_v1'
     OR preterminal_manifest_digest NOT IN (
       -- Canonical clean install.
       '589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda',
       -- Exact production-history restored-copy lane: two reviewed
       -- comment-only legacy checksums plus CURRENT179/CURRENT185 bridges.
       '094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b'
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260819010000_staff_attachment_parent_delete_guard'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_186 requires the exact completed CURRENT_185 migration set'
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
             '47690501257272fd455475a00bea0e21b13f27187a669adef2115de349633315'
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
      'CURRENT_186 identity mail worker prerequisite is unsafe'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public."assert_staff_attachment_parent_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  resource_kind public."StaffAttachmentResourceKind";
  has_bound_binding BOOLEAN;
BEGIN
  resource_kind := TG_ARGV[0]::public."StaffAttachmentResourceKind";

  SELECT EXISTS (
    SELECT 1
    FROM public."StaffAttachmentBinding" AS binding
    WHERE binding."tenantId" = OLD."tenantId"
      AND binding."resourceKind" = resource_kind
      AND binding."resourceId" = OLD."id"
      AND binding."state" = 'BOUND'
  )
  INTO has_bound_binding;

  IF has_bound_binding THEN
    RAISE EXCEPTION
      'Staff attachment parent cannot be deleted while BOUND attachment bindings exist'
      USING ERRCODE = '23503',
            CONSTRAINT = 'StaffAttachmentBinding_parent_delete_check';
  END IF;

  RETURN OLD;
END
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."assert_staff_attachment_parent_delete"()
FROM PUBLIC;

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_chat_message_parent_delete_check"
ON public."StaffChatMessage";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_chat_message_parent_delete_check"
AFTER DELETE ON public."StaffChatMessage"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('CHAT_MESSAGE');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_staff_task_parent_delete_check"
ON public."StaffTask";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_staff_task_parent_delete_check"
AFTER DELETE ON public."StaffTask"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('STAFF_TASK');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_checklist_run_parent_delete_check"
ON public."StaffChecklistRun";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_checklist_run_parent_delete_check"
AFTER DELETE ON public."StaffChecklistRun"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('CHECKLIST_RUN');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_knowledge_article_parent_delete_check"
ON public."StaffKnowledgeArticle";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_knowledge_article_parent_delete_check"
AFTER DELETE ON public."StaffKnowledgeArticle"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('KNOWLEDGE_ARTICLE');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_shift_regulation_parent_delete_check"
ON public."StaffShiftRegulation";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_shift_regulation_parent_delete_check"
AFTER DELETE ON public."StaffShiftRegulation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('SHIFT_REGULATION');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_training_course_parent_delete_check"
ON public."StaffTrainingCourse";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_training_course_parent_delete_check"
AFTER DELETE ON public."StaffTrainingCourse"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('TRAINING_COURSE');

DROP TRIGGER IF EXISTS "StaffAttachmentBinding_onboarding_plan_parent_delete_check"
ON public."StaffOnboardingPlan";
CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_onboarding_plan_parent_delete_check"
AFTER DELETE ON public."StaffOnboardingPlan"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public."assert_staff_attachment_parent_delete"('ONBOARDING_PLAN');

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
              '20260819010000_staff_attachment_parent_delete_guard'
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

  IF migration_count IS DISTINCT FROM 186
     OR migration_head IS DISTINCT FROM
       '20260819010000_staff_attachment_parent_delete_guard'
     OR preterminal_manifest_digest NOT IN (
       '589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda',
       '094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b'
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker database migration receipt is not CURRENT_186'
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
  'Fail-closed identity mail worker readiness receipt bound to the exact canonical CURRENT_186 release head.';

DO $$
DECLARE
  migration_owner_oid OID;
  guard_function_oid OID;
  worker_assert_oid OID;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass(
    'public."IdentityMailOutbox"'
  );

  guard_function_oid := pg_catalog.to_regprocedure(
    'public."assert_staff_attachment_parent_delete"()'
  );
  worker_assert_oid := pg_catalog.to_regprocedure(
    'public."identity_mail_delivery_worker_assert_v1"(text)'
  );

  IF guard_function_oid IS NULL
     OR worker_assert_oid IS NULL
     OR migration_owner_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
       WHERE routine.oid = guard_function_oid
         AND (
           routine.proowner <> migration_owner_oid
           OR routine.prokind IS DISTINCT FROM 'f'::"char"
           OR routine.prorettype IS DISTINCT FROM
             pg_catalog.to_regtype('pg_catalog.trigger')
           OR routine.prosecdef IS DISTINCT FROM FALSE
           OR routine.proleakproof IS DISTINCT FROM FALSE
           OR routine.proisstrict IS DISTINCT FROM FALSE
           OR routine.proretset IS DISTINCT FROM FALSE
           OR routine.provolatile IS DISTINCT FROM 'v'::"char"
           OR routine.proparallel IS DISTINCT FROM 'u'::"char"
           OR language.lanname IS DISTINCT FROM 'plpgsql'
           OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=public, pg_catalog']::TEXT[]
         )
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'public."StaffChatMessage"',
             'StaffAttachmentBinding_chat_message_parent_delete_check'
           ),
           (
             'public."StaffTask"',
             'StaffAttachmentBinding_staff_task_parent_delete_check'
           ),
           (
             'public."StaffChecklistRun"',
             'StaffAttachmentBinding_checklist_run_parent_delete_check'
           ),
           (
             'public."StaffKnowledgeArticle"',
             'StaffAttachmentBinding_knowledge_article_parent_delete_check'
           ),
           (
             'public."StaffShiftRegulation"',
             'StaffAttachmentBinding_shift_regulation_parent_delete_check'
           ),
           (
             'public."StaffTrainingCourse"',
             'StaffAttachmentBinding_training_course_parent_delete_check'
           ),
           (
             'public."StaffOnboardingPlan"',
             'StaffAttachmentBinding_onboarding_plan_parent_delete_check'
           )
       ) AS expected("table_name", "trigger_name")
       LEFT JOIN pg_catalog.pg_trigger AS trigger_entry
         ON trigger_entry.tgrelid =
              pg_catalog.to_regclass(expected."table_name")
        AND trigger_entry.tgname = expected."trigger_name"
        AND trigger_entry.tgfoid = guard_function_oid
        AND trigger_entry.tgconstraint <> 0
        AND trigger_entry.tgdeferrable = TRUE
        AND trigger_entry.tginitdeferred = TRUE
        AND trigger_entry.tgisinternal = FALSE
       WHERE trigger_entry.oid IS NULL
     )
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
       '645feb480c46c42d7d8ca2dae07ec1c82f88264ac5d0e30d26593a8e566f3f66'
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
       WHERE routine.oid IN (guard_function_oid, worker_assert_oid)
         AND privilege.privilege_type = 'EXECUTE'
         AND privilege.grantee <> routine.proowner
         AND (
           privilege.grantee = 0
           OR privilege.is_grantable
           OR (
             routine.oid = worker_assert_oid
             AND NOT EXISTS (
               SELECT 1
               FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
               WHERE enrollment."workerRoleOid" = privilege.grantee::BIGINT
                 AND enrollment."workerRoleName" = granted_role.rolname
             )
           )
         )
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_186 staff attachment parent guard postcondition failed'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

COMMIT;
