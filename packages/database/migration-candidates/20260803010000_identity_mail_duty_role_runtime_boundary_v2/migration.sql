BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- CURRENT186 is a noncanonical, NOT_DEPLOYABLE rehearsal candidate.  It
-- deliberately creates no PostgreSQL role, grant, credential, trust root, or
-- production authority.  A separate privileged controller must transfer the
-- owner-only objects and append the first ACL epoch before either runtime role
-- can execute this boundary.
DO $prerequisite$
DECLARE
  completed_count INTEGER;
  completed_head TEXT;
  completed_manifest_digest TEXT;
  unfinished_count INTEGER;
  relation_count INTEGER;
  nonempty_count BIGINT;
  named_routine_count INTEGER;
BEGIN
  IF pg_catalog.current_setting(
       'leetplus.identity_mail_duty_role_runtime_current186_confirmation',
       true
     ) IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-duty-role-runtime-current186'
     OR pg_catalog.current_setting(
       'leetplus.identity_mail_duty_role_runtime_current186_sha256',
       true
     ) IS NULL
     OR pg_catalog.current_setting(
       'leetplus.identity_mail_duty_role_runtime_current186_sha256',
       true
     ) !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT186 runtime boundary requires explicit disposable rehearsal confirmation'
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
  INTO completed_count, completed_head, completed_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unfinished_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF completed_count IS DISTINCT FROM 185
     OR completed_head IS DISTINCT FROM
       '20260802030000_identity_mail_enrollment_evidence_ledger_v2'
     OR completed_manifest_digest IS DISTINCT FROM
       'efee75130a1ed33c7c9f431acc60e4c3275f90a2479c34906cfa40fa0332ab19'
     OR unfinished_count IS DISTINCT FROM 1
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
           '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
         AND migration."checksum" = pg_catalog.current_setting(
           'leetplus.identity_mail_duty_role_runtime_current186_sha256',
           true
         )
         AND migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" = completed_head
         AND migration."checksum" =
           '2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'CURRENT186 runtime boundary requires the exact completed CURRENT185 stack and one unfinished CURRENT186 receipt'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO relation_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'IdentityMailDeliveryTenantEnrollment',
      'IdentityMailDeliveryTenantEnrollmentCommand',
      'IdentityMailDeliveryTenantEnrollmentEvent',
      'IdentityMailDutyRoleManifestEvidenceV2',
      'IdentityMailDutyRoleManifestRevocationV2',
      'IdentityMailOutbox'
    )
    AND relation.relkind = 'r';

  SELECT
      (SELECT pg_catalog.count(*)
       FROM public."IdentityMailDeliveryTenantEnrollment")
    + (SELECT pg_catalog.count(*)
       FROM public."IdentityMailDeliveryTenantEnrollmentCommand")
    + (SELECT pg_catalog.count(*)
       FROM public."IdentityMailDeliveryTenantEnrollmentEvent")
    + (SELECT pg_catalog.count(*)
       FROM public."IdentityMailDutyRoleManifestEvidenceV2")
    + (SELECT pg_catalog.count(*)
       FROM public."IdentityMailDutyRoleManifestRevocationV2")
  INTO nonempty_count;

  SELECT pg_catalog.count(*)::INTEGER
  INTO named_routine_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.proname IN (
      'identity_mail_duty_role_acl_lock_v1',
      'identity_mail_duty_role_acl_epoch_append_v1',
      'identity_mail_duty_role_acl_epoch_immutable_guard_v1',
      'identity_mail_duty_role_live_assert_v1',
      'identity_mail_tenant_enrollment_event_write_guard_v2',
      'identity_mail_tenant_enrollment_registry_write_guard_v2',
      'identity_mail_tenant_enrollment_drive_command_v2'
    );

  IF relation_count IS DISTINCT FROM 6
     OR nonempty_count IS DISTINCT FROM 0
     OR named_routine_count IS DISTINCT FROM 0
     OR pg_catalog.to_regclass(
       'public."IdentityMailDutyRoleAclEpochV1"'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.identity_mail_tenant_lock_v1(text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'CURRENT186 runtime boundary prerequisite drifted'
      USING ERRCODE = '55000';
  END IF;
END;
$prerequisite$;

-- CURRENT185's rehearsal-only importer pinned one synthetic database-owner
-- name.  CURRENT186 binds the same immutable evidence projection to the live
-- database owner name and OID before the runtime ACL epoch can consume it.
-- The predecessor body and every routine attribute are exact prerequisites;
-- this is deliberately a two-fragment upgrade rather than a generic rewrite.
DO $importer_owner_binding$
DECLARE
  importer_oid OID;
  importer_owner_oid OID;
  importer_acl ACLITEM[];
  importer_comment TEXT;
  importer_prosrc TEXT;
  patched_prosrc TEXT;
  importer_metadata_before JSONB;
  importer_metadata_after JSONB;
  legacy_occurrences INTEGER;
  replacement_occurrences INTEGER;
  legacy_marker_occurrences INTEGER;
  replacement_marker_occurrences INTEGER;
  legacy_fragment CONSTANT TEXT := $legacy$
     OR grants_projection#>>'{database,ownerName}' IS DISTINCT FROM
       'leetplus_database_owner'
     OR (grants_projection#>>'{database,ownerOid}' COLLATE "C") !~
       '^[1-9][0-9]{0,9}$'$legacy$;
  replacement_fragment CONSTANT TEXT := $replacement$
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_database AS database_entry
       INNER JOIN pg_catalog.pg_roles AS database_owner
         ON database_owner.oid = database_entry.datdba
       WHERE database_entry.datname = pg_catalog.current_database()
         AND database_entry.datname::TEXT IS NOT DISTINCT FROM
           command_record."expectedDatabaseName"::TEXT
         AND database_entry.oid::BIGINT IS NOT DISTINCT FROM
           command_record."expectedDatabaseOid"
         AND (database_owner.rolname::TEXT COLLATE "C") ~
           '^[a-z_][a-z0-9_]{2,62}$'
         AND database_owner.rolname::TEXT NOT IN (
           'current_role', 'current_user', 'none', 'postgres', 'public'
         )
         AND (database_owner.rolname::TEXT COLLATE "C") NOT LIKE
           'azure\_%' ESCAPE '\'
         AND (database_owner.rolname::TEXT COLLATE "C") NOT LIKE
           'cloudsql%'
         AND (database_owner.rolname::TEXT COLLATE "C") NOT LIKE
           'pg\_%' ESCAPE '\'
         AND (database_owner.rolname::TEXT COLLATE "C") NOT LIKE
           'rds\_%' ESCAPE '\'
         AND (grants_projection#>>'{database,ownerName}' COLLATE "C")
           IS NOT DISTINCT FROM
             (database_owner.rolname::TEXT COLLATE "C")
         AND (grants_projection#>>'{database,ownerOid}' COLLATE "C")
           IS NOT DISTINCT FROM
             (database_owner.oid::TEXT COLLATE "C")
     )$replacement$;
  legacy_marker_fragment CONSTANT TEXT := $legacy_marker$
         AND marker."schemaHead" =
           '20260802020000_identity_mail_worker_v2_lost_response_replay'
         AND marker."migrationCount" = 184
         AND marker."migrationManifestDigest" =
           '9da93df51df3945b3219409f06118134712edb2a96543d1eb183217da9767819'$legacy_marker$;
  replacement_marker_fragment CONSTANT TEXT := $replacement_marker$
         AND marker."schemaHead" =
           '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
         AND marker."migrationCount" = 186
         AND marker."migrationManifestDigest" = (
           SELECT pg_catalog.encode(
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
           FROM public."_prisma_migrations" AS migration
           WHERE migration."finished_at" IS NOT NULL
             AND migration."rolled_back_at" IS NULL
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public."_prisma_migrations" AS migration
           WHERE migration."finished_at" IS NULL
              OR migration."rolled_back_at" IS NOT NULL
         )$replacement_marker$;
BEGIN
  importer_oid := pg_catalog.to_regprocedure(
    'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
  );

  SELECT
    routine.proowner,
    routine.proacl,
    pg_catalog.obj_description(routine.oid, 'pg_proc'),
    routine.prosrc,
    pg_catalog.jsonb_build_object(
      'oid', routine.oid::BIGINT,
      'ownerOid', routine.proowner::BIGINT,
      'acl', pg_catalog.to_jsonb(routine.proacl),
      'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
      'kind', routine.prokind::TEXT,
      'languageOid', routine.prolang::BIGINT,
      'returnTypeOid', routine.prorettype::BIGINT,
      'securityDefiner', routine.prosecdef,
      'leakproof', routine.proleakproof,
      'strict', routine.proisstrict,
      'returnsSet', routine.proretset,
      'volatility', routine.provolatile::TEXT,
      'parallelSafety', routine.proparallel::TEXT,
      'argumentCount', routine.pronargs,
      'argumentDefaultCount', routine.pronargdefaults,
      'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
      'variadicTypeOid', routine.provariadic::BIGINT,
      'argumentTypes', routine.proargtypes::TEXT,
      'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
      'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
      'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
      'config', pg_catalog.to_jsonb(routine.proconfig),
      'cost', routine.procost,
      'rows', routine.prorows,
      'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
      'supportOid', routine.prosupport::BIGINT,
      'binary', routine.probin,
      'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
    )
  INTO
    importer_owner_oid,
    importer_acl,
    importer_comment,
    importer_prosrc,
    importer_metadata_before
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = importer_oid;

  IF importer_oid IS NULL
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc AS named
       WHERE named.pronamespace = pg_catalog.to_regnamespace('public')
         AND named.proname =
           'identity_mail_tenant_enrollment_import_evidence_v2'
     ) IS DISTINCT FROM 1::BIGINT
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = routine.pronamespace
        AND namespace.nspname = 'public'
       INNER JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
        AND language.lanname = 'plpgsql'
       INNER JOIN pg_catalog.pg_database AS database_entry
         ON database_entry.datname = pg_catalog.current_database()
        AND database_entry.datdba = routine.proowner
       INNER JOIN pg_catalog.pg_roles AS migration_role
         ON migration_role.oid = routine.proowner
        AND migration_role.rolname = CURRENT_USER
       WHERE routine.oid = importer_oid
         AND routine.prokind = 'f'::"char"
         AND routine.prosecdef
         AND NOT routine.proleakproof
         AND NOT routine.proisstrict
         AND NOT routine.proretset
         AND routine.provolatile = 'v'::"char"
         AND routine.proparallel = 'u'::"char"
         AND routine.pronargs = 2
         AND routine.pronargdefaults = 0
         AND routine.proargdefaults IS NULL
         AND routine.provariadic = 0::OID
         AND routine.proargtypes[0] = 'text'::pg_catalog.regtype
         AND routine.proargtypes[1] = 'text'::pg_catalog.regtype
         AND routine.prorettype = 'jsonb'::pg_catalog.regtype
         AND routine.proargnames = ARRAY[
           'p_bundle_canonical_json', 'p_bundle_digest'
         ]::TEXT[]
         AND routine.proargmodes IS NULL
         AND routine.proallargtypes IS NULL
         AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
         AND routine.procost = 100
         AND routine.prorows = 0
         AND routine.protrftypes IS NULL
         AND routine.prosupport = 0::OID
         AND routine.probin IS NULL
         AND routine.prosqlbody IS NULL
         AND pg_catalog.encode(
           pg_catalog.sha256(
             pg_catalog.convert_to(routine.prosrc, 'UTF8')
           ),
           'hex'
         ) =
           '8e01d66ba74b77312b4cc4938709b354eee9fc2005fdfbc538e7cc2dfc9e839e'
         AND (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.aclexplode(
             COALESCE(
               routine.proacl,
               pg_catalog.acldefault('f', routine.proowner)
             )
           )
         ) = 1
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(
             COALESCE(
               routine.proacl,
               pg_catalog.acldefault('f', routine.proowner)
             )
           ) AS acl
           WHERE acl.grantor <> routine.proowner
              OR acl.grantee <> routine.proowner
              OR acl.privilege_type <> 'EXECUTE'
              OR acl.is_grantable
         )
     )
  THEN
    RAISE EXCEPTION
      'CURRENT186 importer source/metadata prerequisite drifted'
      USING ERRCODE = '55000';
  END IF;

  legacy_occurrences := (
    pg_catalog.length(importer_prosrc)
      - pg_catalog.length(
        pg_catalog.replace(importer_prosrc, legacy_fragment, '')
      )
  ) / pg_catalog.length(legacy_fragment);
  replacement_occurrences := (
    pg_catalog.length(importer_prosrc)
      - pg_catalog.length(
        pg_catalog.replace(importer_prosrc, replacement_fragment, '')
      )
  ) / pg_catalog.length(replacement_fragment);
  legacy_marker_occurrences := (
    pg_catalog.length(importer_prosrc)
      - pg_catalog.length(
        pg_catalog.replace(importer_prosrc, legacy_marker_fragment, '')
      )
  ) / pg_catalog.length(legacy_marker_fragment);
  replacement_marker_occurrences := (
    pg_catalog.length(importer_prosrc)
      - pg_catalog.length(
        pg_catalog.replace(importer_prosrc, replacement_marker_fragment, '')
      )
  ) / pg_catalog.length(replacement_marker_fragment);

  IF legacy_occurrences IS DISTINCT FROM 1
     OR replacement_occurrences IS DISTINCT FROM 0
     OR legacy_marker_occurrences IS DISTINCT FROM 1
     OR replacement_marker_occurrences IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT186 importer runtime-binding fragment prerequisite drifted'
      USING ERRCODE = '55000';
  END IF;

  patched_prosrc := pg_catalog.replace(
    pg_catalog.replace(
      importer_prosrc,
      legacy_fragment,
      replacement_fragment
    ),
    legacy_marker_fragment,
    replacement_marker_fragment
  );

  IF pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(patched_prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM
       '04789b4d5504938ed4c4c64be66cd2e972e0fe89a410ba7a51bdef88a4d27c4a'
  THEN
    RAISE EXCEPTION 'CURRENT186 importer patched source digest drifted'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.format(
    $ddl$
CREATE OR REPLACE FUNCTION public."identity_mail_tenant_enrollment_import_evidence_v2"(
  p_bundle_canonical_json TEXT,
  p_bundle_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
CALLED ON NULL INPUT
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
COST 100
SET search_path = pg_catalog
AS %L$ddl$,
    patched_prosrc
  );

  SELECT pg_catalog.jsonb_build_object(
    'oid', routine.oid::BIGINT,
    'ownerOid', routine.proowner::BIGINT,
    'acl', pg_catalog.to_jsonb(routine.proacl),
    'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
    'kind', routine.prokind::TEXT,
    'languageOid', routine.prolang::BIGINT,
    'returnTypeOid', routine.prorettype::BIGINT,
    'securityDefiner', routine.prosecdef,
    'leakproof', routine.proleakproof,
    'strict', routine.proisstrict,
    'returnsSet', routine.proretset,
    'volatility', routine.provolatile::TEXT,
    'parallelSafety', routine.proparallel::TEXT,
    'argumentCount', routine.pronargs,
    'argumentDefaultCount', routine.pronargdefaults,
    'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
    'variadicTypeOid', routine.provariadic::BIGINT,
    'argumentTypes', routine.proargtypes::TEXT,
    'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
    'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
    'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
    'config', pg_catalog.to_jsonb(routine.proconfig),
    'cost', routine.procost,
    'rows', routine.prorows,
    'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
    'supportOid', routine.prosupport::BIGINT,
    'binary', routine.probin,
    'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
  )
  INTO importer_metadata_after
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = pg_catalog.to_regprocedure(
    'public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'
  );

  IF importer_metadata_after IS DISTINCT FROM importer_metadata_before
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           (
             SELECT routine.prosrc
             FROM pg_catalog.pg_proc AS routine
             WHERE routine.oid = importer_oid
           ),
           'UTF8'
         )
       ),
       'hex'
     ) IS DISTINCT FROM
       '04789b4d5504938ed4c4c64be66cd2e972e0fe89a410ba7a51bdef88a4d27c4a'
  THEN
    RAISE EXCEPTION 'CURRENT186 importer replacement postcondition drifted'
      USING ERRCODE = '55000';
  END IF;
END;
$importer_owner_binding$;

-- The five worker-v2 routines previously materialized whole Tenant and
-- UserInvite rows even though their policy only consumes a small, fixed
-- projection.  Once the routines move to the schema-owner role, whole-row
-- reads would either fail or force an over-broad PII grant.  Narrow the source
-- before ownership transfer so the runtime boundary can grant only the exact
-- columns used by the policy.  Exact predecessor and successor source digests
-- make this a closed, auditable rewrite rather than a generic text patch.
DO $worker_v2_projection_narrowing$
DECLARE
  expected RECORD;
  routine_oid OID;
  routine_prosrc TEXT;
  patched_prosrc TEXT;
  routine_definition TEXT;
  patched_definition TEXT;
  metadata_before JSONB;
  metadata_after JSONB;
  source_occurrences INTEGER;
  invite_declaration CONSTANT TEXT :=
    'invite_record public."UserInvite"%ROWTYPE;';
  tenant_declaration CONSTANT TEXT :=
    'tenant_record public."Tenant"%ROWTYPE;';
  claim_declaration CONSTANT TEXT :=
    'claim_record public."IdentityEmailClaim"%ROWTYPE;';
  invite_record_declaration CONSTANT TEXT := 'invite_record RECORD;';
  tenant_record_declaration CONSTANT TEXT := 'tenant_record RECORD;';
  claim_record_declaration CONSTANT TEXT := 'claim_record RECORD;';
  invite_select_top CONSTANT TEXT :=
    E'SELECT target_invite.*\n  INTO invite_record';
  invite_select_nested CONSTANT TEXT :=
    E'SELECT target_invite.*\n    INTO invite_record';
  invite_select_top_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'    target_invite."id",\n'
      || E'    target_invite."tenantId",\n'
      || E'    target_invite."email",\n'
      || E'    target_invite."identityClaimRevision",\n'
      || E'    target_invite."tokenHash",\n'
      || E'    target_invite."acceptedAt",\n'
      || E'    target_invite."revokedAt",\n'
      || E'    target_invite."expiresAt",\n'
      || E'    target_invite."role",\n'
      || E'    target_invite."accessScope",\n'
      || E'    target_invite."customRoleId",\n'
      || E'    target_invite."storeIds"\n'
      || E'  INTO invite_record';
  invite_select_nested_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'      target_invite."id",\n'
      || E'      target_invite."tenantId",\n'
      || E'      target_invite."email",\n'
      || E'      target_invite."identityClaimRevision",\n'
      || E'      target_invite."tokenHash",\n'
      || E'      target_invite."acceptedAt",\n'
      || E'      target_invite."revokedAt",\n'
      || E'      target_invite."expiresAt",\n'
      || E'      target_invite."role",\n'
      || E'      target_invite."accessScope",\n'
      || E'      target_invite."customRoleId",\n'
      || E'      target_invite."storeIds"\n'
      || E'    INTO invite_record';
  tenant_select CONSTANT TEXT :=
    E'SELECT target_tenant.*\n  INTO tenant_record';
  tenant_select_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'    target_tenant."id",\n'
      || E'    target_tenant."status",\n'
      || E'    target_tenant."customerStage",\n'
      || E'    target_tenant."onboardingStatus",\n'
      || E'    target_tenant."trialStartsAt",\n'
      || E'    target_tenant."trialEndsAt"\n'
      || E'  INTO tenant_record';
  claim_select_top CONSTANT TEXT :=
    E'SELECT identity_claim.*\n  INTO claim_record';
  claim_select_nested CONSTANT TEXT :=
    E'SELECT identity_claim.*\n    INTO claim_record';
  claim_select_deep CONSTANT TEXT :=
    E'SELECT identity_claim.*\n      INTO claim_record';
  claim_select_top_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'    identity_claim."emailCanonical",\n'
      || E'    identity_claim."tenantId",\n'
      || E'    identity_claim."claimType",\n'
      || E'    identity_claim."subjectId",\n'
      || E'    identity_claim."revision"\n'
      || E'  INTO claim_record';
  claim_select_nested_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'      identity_claim."emailCanonical",\n'
      || E'      identity_claim."tenantId",\n'
      || E'      identity_claim."claimType",\n'
      || E'      identity_claim."subjectId",\n'
      || E'      identity_claim."revision"\n'
      || E'    INTO claim_record';
  claim_select_deep_narrow CONSTANT TEXT :=
    E'SELECT\n'
      || E'        identity_claim."emailCanonical",\n'
      || E'        identity_claim."tenantId",\n'
      || E'        identity_claim."claimType",\n'
      || E'        identity_claim."subjectId",\n'
      || E'        identity_claim."revision"\n'
      || E'      INTO claim_record';
  claim_record_reset CONSTANT TEXT := '    claim_record := NULL;';
  claim_record_typed_null CONSTANT TEXT :=
    E'    SELECT\n'
      || E'      NULL::VARCHAR(320) AS "emailCanonical",\n'
      || E'      NULL::TEXT AS "tenantId",\n'
      || E'      NULL::public."IdentityEmailClaimType" AS "claimType",\n'
      || E'      NULL::TEXT AS "subjectId",\n'
      || E'      NULL::INTEGER AS "revision"\n'
      || E'    INTO claim_record;';
  reap_email_order_alias CONSTANT TEXT :=
    '    ORDER BY "emailCanonical" COLLATE "C"';
  reap_email_order_expression CONSTANT TEXT :=
    '    ORDER BY "emailCanonical"';
  worker_assert_signature CONSTANT TEXT :=
    'public.identity_mail_delivery_worker_assert_v2(text,text)';
  worker_assert_predecessor_digest CONSTANT TEXT :=
    '56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c';
  worker_assert_successor_digest CONSTANT TEXT :=
    '6baacb6fe11a7bbe0633986422f98d13c045e4038d5c1136ed94df080ae7af2e';
  current184_migration_name CONSTANT TEXT :=
    '20260802020000_identity_mail_worker_v2_lost_response_replay';
  current186_migration_name CONSTANT TEXT :=
    '20260803010000_identity_mail_duty_role_runtime_boundary_v2';
  current184_receipt_guard CONSTANT TEXT :=
    'migration_count IS DISTINCT FROM 184';
  current186_receipt_guard CONSTANT TEXT :=
    'migration_count IS DISTINCT FROM 186';
  current184_receipt_error CONSTANT TEXT :=
    'database receipt is not exact CURRENT_184';
  current186_receipt_error CONSTANT TEXT :=
    'database receipt is not exact CURRENT_186';
BEGIN
  FOR expected IN
    SELECT *
    FROM (
      VALUES
        (
          'public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT,
          '99f96769c953251d52e40baa5d937ff101efba56b32d0e05b021a60948c9e0f1'::TEXT,
          'aa36a0d9e9711210cd042b1e1097060ce0fe3d97d79010da8b778a5973fd13d0'::TEXT,
          false,
          2,
          0,
          0
        ),
        (
          'public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT,
          '2037007f96e0626f46d3f6cfe7504383ac453e12e405c2d2b7ad4fd777cc52fb'::TEXT,
          '02f349d30854af22c2f6dfacdb3322ad52c03f19fb9a36fc40f2ac3bb5d942ec'::TEXT,
          false,
          4,
          0,
          0
        ),
        (
          'public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT,
          '190bb0100186f233cd33f1b4bb4065dd4c401e5156e5b0e9ecb8c7ba190c5754'::TEXT,
          'd6f6194029f390f8d9712b2d1dc25c821df0982f2e22a73660379d427e0a7db3'::TEXT,
          false,
          4,
          0,
          0
        ),
        (
          'public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT,
          '1f6310957a575d8e9ffe9660c3d0e0a8a507f538193e1a14db6d8a296bb7356d'::TEXT,
          'c0b0f3caf102b35613ea809fd380883ef0fd0843c2d58c8ad31badd960ab12e8'::TEXT,
          true,
          6,
          1,
          1
        ),
        (
          'public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT,
          '39fc2456da022057b22cf5334f99a1fb777381c16bf807cb96f72bff7d891151'::TEXT,
          '491f6fca8721a4140b37284537436b016dbd9aff9dc8a88fd5ae61d96c98d71e'::TEXT,
          false,
          4,
          1,
          0
        )
    ) AS expected_source(
      signature,
      predecessor_digest,
      successor_digest,
      nested_invite_select,
      claim_select_indent,
      claim_record_reset_count,
      reap_email_order_alias_count
    )
    ORDER BY expected_source.signature COLLATE "C"
  LOOP
    routine_oid := pg_catalog.to_regprocedure(expected.signature);

    SELECT
      routine.prosrc,
      pg_catalog.jsonb_build_object(
        'oid', routine.oid::BIGINT,
        'ownerOid', routine.proowner::BIGINT,
        'acl', pg_catalog.to_jsonb(routine.proacl),
        'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
        'kind', routine.prokind::TEXT,
        'languageOid', routine.prolang::BIGINT,
        'returnTypeOid', routine.prorettype::BIGINT,
        'securityDefiner', routine.prosecdef,
        'leakproof', routine.proleakproof,
        'strict', routine.proisstrict,
        'returnsSet', routine.proretset,
        'volatility', routine.provolatile::TEXT,
        'parallelSafety', routine.proparallel::TEXT,
        'argumentCount', routine.pronargs,
        'argumentDefaultCount', routine.pronargdefaults,
        'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
        'variadicTypeOid', routine.provariadic::BIGINT,
        'argumentTypes', routine.proargtypes::TEXT,
        'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
        'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
        'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
        'config', pg_catalog.to_jsonb(routine.proconfig),
        'cost', routine.procost,
        'rows', routine.prorows,
        'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
        'supportOid', routine.prosupport::BIGINT,
        'binary', routine.probin,
        'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
      )
    INTO routine_prosrc, metadata_before
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_language AS language
      ON language.oid = routine.prolang
     AND language.lanname = 'plpgsql'
    INNER JOIN pg_catalog.pg_database AS database_entry
      ON database_entry.datname = pg_catalog.current_database()
     AND database_entry.datdba = routine.proowner
    INNER JOIN pg_catalog.pg_roles AS migration_role
      ON migration_role.oid = routine.proowner
     AND migration_role.rolname = CURRENT_USER
    WHERE routine.oid = routine_oid
      AND routine.prokind = 'f'::"char"
      AND routine.prosecdef
      AND NOT routine.proleakproof
      AND NOT routine.proisstrict
      AND NOT routine.proretset
      AND routine.provolatile = 'v'::"char"
      AND routine.proparallel = 'u'::"char"
      AND routine.prorettype = 'jsonb'::pg_catalog.regtype
      AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
      AND routine.procost = 100
      AND routine.prorows = 0
      AND routine.protrftypes IS NULL
      AND routine.prosupport = 0::OID
      AND routine.probin IS NULL
      AND routine.prosqlbody IS NULL;

    IF routine_oid IS NULL
       OR routine_prosrc IS NULL
       OR metadata_before IS NULL
       OR pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(routine_prosrc, 'UTF8')),
         'hex'
       ) IS DISTINCT FROM expected.predecessor_digest
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, invite_declaration, '')
           )
       ) / pg_catalog.length(invite_declaration) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, tenant_declaration, '')
           )
       ) / pg_catalog.length(tenant_declaration) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, claim_declaration, '')
           )
       ) / pg_catalog.length(claim_declaration) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(
               routine_prosrc,
               CASE
                 WHEN expected.nested_invite_select
                 THEN invite_select_nested
                 ELSE invite_select_top
               END,
               ''
             )
           )
       ) / pg_catalog.length(
         CASE
           WHEN expected.nested_invite_select
           THEN invite_select_nested
           ELSE invite_select_top
         END
       ) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, tenant_select, '')
           )
       ) / pg_catalog.length(tenant_select) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(
               routine_prosrc,
               CASE expected.claim_select_indent
                 WHEN 2 THEN claim_select_top
                 WHEN 4 THEN claim_select_nested
                 WHEN 6 THEN claim_select_deep
                 ELSE NULL
               END,
               ''
             )
           )
       ) / pg_catalog.length(
         CASE expected.claim_select_indent
           WHEN 2 THEN claim_select_top
           WHEN 4 THEN claim_select_nested
           WHEN 6 THEN claim_select_deep
           ELSE NULL
         END
       ) IS DISTINCT FROM 1
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, claim_record_reset, '')
           )
       ) / pg_catalog.length(claim_record_reset) IS DISTINCT FROM
         expected.claim_record_reset_count
       OR (
         pg_catalog.length(routine_prosrc)
           - pg_catalog.length(
             pg_catalog.replace(routine_prosrc, reap_email_order_alias, '')
           )
       ) / pg_catalog.length(reap_email_order_alias) IS DISTINCT FROM
         expected.reap_email_order_alias_count
    THEN
      RAISE EXCEPTION
        'CURRENT186 worker-v2 projection prerequisite drifted for %',
        expected.signature
        USING ERRCODE = '55000';
    END IF;

    patched_prosrc := pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.replace(
              pg_catalog.replace(
                routine_prosrc,
                invite_declaration,
                invite_record_declaration
              ),
              tenant_declaration,
              tenant_record_declaration
            ),
            claim_declaration,
            claim_record_declaration
          ),
          CASE
            WHEN expected.nested_invite_select
            THEN invite_select_nested
            ELSE invite_select_top
          END,
          CASE
            WHEN expected.nested_invite_select
            THEN invite_select_nested_narrow
            ELSE invite_select_top_narrow
          END
        ),
        tenant_select,
        tenant_select_narrow
      ),
      CASE expected.claim_select_indent
        WHEN 2 THEN claim_select_top
        WHEN 4 THEN claim_select_nested
        WHEN 6 THEN claim_select_deep
        ELSE NULL
      END,
      CASE expected.claim_select_indent
        WHEN 2 THEN claim_select_top_narrow
        WHEN 4 THEN claim_select_nested_narrow
        WHEN 6 THEN claim_select_deep_narrow
        ELSE NULL
      END
    );

    IF expected.claim_record_reset_count = 1 THEN
      patched_prosrc := pg_catalog.replace(
        patched_prosrc,
        claim_record_reset,
        claim_record_typed_null
      );
    END IF;

    IF expected.reap_email_order_alias_count = 1 THEN
      patched_prosrc := pg_catalog.replace(
        patched_prosrc,
        reap_email_order_alias,
        reap_email_order_expression
      );
    END IF;

    IF pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(patched_prosrc, 'UTF8')),
         'hex'
       ) IS DISTINCT FROM expected.successor_digest
       OR patched_prosrc LIKE '%target_invite.*%'
       OR patched_prosrc LIKE '%target_tenant.*%'
       OR patched_prosrc LIKE '%identity_claim.*%'
       OR patched_prosrc LIKE '%public."UserInvite"%ROWTYPE%'
       OR patched_prosrc LIKE '%public."Tenant"%ROWTYPE%'
       OR patched_prosrc LIKE '%public."IdentityEmailClaim"%ROWTYPE%'
       OR (
         expected.claim_record_reset_count = 1
         AND patched_prosrc LIKE '%claim_record := NULL;%'
       )
       OR (
         expected.reap_email_order_alias_count = 1
         AND patched_prosrc LIKE '%ORDER BY "emailCanonical" COLLATE "C"%'
       )
    THEN
      RAISE EXCEPTION
        'CURRENT186 worker-v2 narrowed source drifted for %',
        expected.signature
        USING ERRCODE = '55000';
    END IF;

    routine_definition := pg_catalog.pg_get_functiondef(routine_oid);
    source_occurrences := (
      pg_catalog.length(routine_definition)
        - pg_catalog.length(
          pg_catalog.replace(routine_definition, routine_prosrc, '')
        )
    ) / pg_catalog.length(routine_prosrc);

    IF source_occurrences IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION
        'CURRENT186 worker-v2 definition source boundary drifted for %',
        expected.signature
        USING ERRCODE = '55000';
    END IF;

    patched_definition := pg_catalog.replace(
      routine_definition,
      routine_prosrc,
      patched_prosrc
    );
    EXECUTE patched_definition;

    SELECT pg_catalog.jsonb_build_object(
      'oid', routine.oid::BIGINT,
      'ownerOid', routine.proowner::BIGINT,
      'acl', pg_catalog.to_jsonb(routine.proacl),
      'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
      'kind', routine.prokind::TEXT,
      'languageOid', routine.prolang::BIGINT,
      'returnTypeOid', routine.prorettype::BIGINT,
      'securityDefiner', routine.prosecdef,
      'leakproof', routine.proleakproof,
      'strict', routine.proisstrict,
      'returnsSet', routine.proretset,
      'volatility', routine.provolatile::TEXT,
      'parallelSafety', routine.proparallel::TEXT,
      'argumentCount', routine.pronargs,
      'argumentDefaultCount', routine.pronargdefaults,
      'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
      'variadicTypeOid', routine.provariadic::BIGINT,
      'argumentTypes', routine.proargtypes::TEXT,
      'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
      'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
      'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
      'config', pg_catalog.to_jsonb(routine.proconfig),
      'cost', routine.procost,
      'rows', routine.prorows,
      'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
      'supportOid', routine.prosupport::BIGINT,
      'binary', routine.probin,
      'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
    )
    INTO metadata_after
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = routine_oid
      AND pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
        'hex'
      ) = expected.successor_digest;

    IF metadata_after IS NULL
       OR metadata_after IS DISTINCT FROM metadata_before
    THEN
      RAISE EXCEPTION
        'CURRENT186 worker-v2 metadata changed while narrowing %',
        expected.signature
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  -- CURRENT184's tenant-aware assertion is reused by all five worker RPCs.
  -- Rebind its exact database receipt to this candidate after the projection
  -- rewrite, without changing its OID, ACL, owner or executable attributes.
  routine_oid := pg_catalog.to_regprocedure(worker_assert_signature);

  SELECT
    routine.prosrc,
    pg_catalog.jsonb_build_object(
      'oid', routine.oid::BIGINT,
      'ownerOid', routine.proowner::BIGINT,
      'acl', pg_catalog.to_jsonb(routine.proacl),
      'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
      'kind', routine.prokind::TEXT,
      'languageOid', routine.prolang::BIGINT,
      'returnTypeOid', routine.prorettype::BIGINT,
      'securityDefiner', routine.prosecdef,
      'leakproof', routine.proleakproof,
      'strict', routine.proisstrict,
      'returnsSet', routine.proretset,
      'volatility', routine.provolatile::TEXT,
      'parallelSafety', routine.proparallel::TEXT,
      'argumentCount', routine.pronargs,
      'argumentDefaultCount', routine.pronargdefaults,
      'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
      'variadicTypeOid', routine.provariadic::BIGINT,
      'argumentTypes', routine.proargtypes::TEXT,
      'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
      'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
      'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
      'config', pg_catalog.to_jsonb(routine.proconfig),
      'cost', routine.procost,
      'rows', routine.prorows,
      'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
      'supportOid', routine.prosupport::BIGINT,
      'binary', routine.probin,
      'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
    )
  INTO routine_prosrc, metadata_before
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_language AS language
    ON language.oid = routine.prolang
   AND language.lanname = 'plpgsql'
  INNER JOIN pg_catalog.pg_database AS database_entry
    ON database_entry.datname = pg_catalog.current_database()
   AND database_entry.datdba = routine.proowner
  INNER JOIN pg_catalog.pg_roles AS migration_role
    ON migration_role.oid = routine.proowner
   AND migration_role.rolname = CURRENT_USER
  WHERE routine.oid = routine_oid
    AND routine.prokind = 'f'::"char"
    AND routine.prosecdef
    AND NOT routine.proleakproof
    AND NOT routine.proisstrict
    AND NOT routine.proretset
    AND routine.provolatile = 'v'::"char"
    AND routine.proparallel = 'u'::"char"
    AND routine.prorettype = 'jsonb'::pg_catalog.regtype
    AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AND routine.procost = 100
    AND routine.prorows = 0
    AND routine.protrftypes IS NULL
    AND routine.prosupport = 0::OID
    AND routine.probin IS NULL
    AND routine.prosqlbody IS NULL;

  IF routine_oid IS NULL
     OR routine_prosrc IS NULL
     OR metadata_before IS NULL
     OR pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(routine_prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM worker_assert_predecessor_digest
     OR (
       pg_catalog.length(routine_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(routine_prosrc, current184_migration_name, '')
         )
     ) / pg_catalog.length(current184_migration_name) IS DISTINCT FROM 2
     OR (
       pg_catalog.length(routine_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(routine_prosrc, current184_receipt_guard, '')
         )
     ) / pg_catalog.length(current184_receipt_guard) IS DISTINCT FROM 1
     OR (
       pg_catalog.length(routine_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(routine_prosrc, current184_receipt_error, '')
         )
     ) / pg_catalog.length(current184_receipt_error) IS DISTINCT FROM 1
     OR routine_prosrc LIKE '%' || current186_migration_name || '%'
     OR routine_prosrc LIKE '%' || current186_receipt_guard || '%'
     OR routine_prosrc LIKE '%' || current186_receipt_error || '%'
  THEN
    RAISE EXCEPTION
      'CURRENT186 worker-v2 database receipt prerequisite drifted'
      USING ERRCODE = '55000';
  END IF;

  patched_prosrc := pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        routine_prosrc,
        current184_migration_name,
        current186_migration_name
      ),
      current184_receipt_guard,
      current186_receipt_guard
    ),
    current184_receipt_error,
    current186_receipt_error
  );

  IF pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(patched_prosrc, 'UTF8')),
       'hex'
     ) IS DISTINCT FROM worker_assert_successor_digest
     OR patched_prosrc LIKE '%' || current184_migration_name || '%'
     OR patched_prosrc LIKE '%' || current184_receipt_guard || '%'
     OR patched_prosrc LIKE '%' || current184_receipt_error || '%'
     OR (
       pg_catalog.length(patched_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(patched_prosrc, current186_migration_name, '')
         )
     ) / pg_catalog.length(current186_migration_name) IS DISTINCT FROM 2
     OR (
       pg_catalog.length(patched_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(patched_prosrc, current186_receipt_guard, '')
         )
     ) / pg_catalog.length(current186_receipt_guard) IS DISTINCT FROM 1
     OR (
       pg_catalog.length(patched_prosrc)
         - pg_catalog.length(
           pg_catalog.replace(patched_prosrc, current186_receipt_error, '')
         )
     ) / pg_catalog.length(current186_receipt_error) IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION 'CURRENT186 worker-v2 database receipt rewrite drifted'
      USING ERRCODE = '55000';
  END IF;

  routine_definition := pg_catalog.pg_get_functiondef(routine_oid);
  source_occurrences := (
    pg_catalog.length(routine_definition)
      - pg_catalog.length(
        pg_catalog.replace(routine_definition, routine_prosrc, '')
      )
  ) / pg_catalog.length(routine_prosrc);

  IF source_occurrences IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'CURRENT186 worker-v2 database receipt definition boundary drifted'
      USING ERRCODE = '55000';
  END IF;

  patched_definition := pg_catalog.replace(
    routine_definition,
    routine_prosrc,
    patched_prosrc
  );
  EXECUTE patched_definition;

  SELECT pg_catalog.jsonb_build_object(
    'oid', routine.oid::BIGINT,
    'ownerOid', routine.proowner::BIGINT,
    'acl', pg_catalog.to_jsonb(routine.proacl),
    'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'),
    'kind', routine.prokind::TEXT,
    'languageOid', routine.prolang::BIGINT,
    'returnTypeOid', routine.prorettype::BIGINT,
    'securityDefiner', routine.prosecdef,
    'leakproof', routine.proleakproof,
    'strict', routine.proisstrict,
    'returnsSet', routine.proretset,
    'volatility', routine.provolatile::TEXT,
    'parallelSafety', routine.proparallel::TEXT,
    'argumentCount', routine.pronargs,
    'argumentDefaultCount', routine.pronargdefaults,
    'argumentDefaults', pg_catalog.to_jsonb(routine.proargdefaults),
    'variadicTypeOid', routine.provariadic::BIGINT,
    'argumentTypes', routine.proargtypes::TEXT,
    'argumentNames', pg_catalog.to_jsonb(routine.proargnames),
    'argumentModes', pg_catalog.to_jsonb(routine.proargmodes),
    'allArgumentTypes', pg_catalog.to_jsonb(routine.proallargtypes),
    'config', pg_catalog.to_jsonb(routine.proconfig),
    'cost', routine.procost,
    'rows', routine.prorows,
    'transformTypes', pg_catalog.to_jsonb(routine.protrftypes),
    'supportOid', routine.prosupport::BIGINT,
    'binary', routine.probin,
    'sqlBody', pg_catalog.to_jsonb(routine.prosqlbody)
  )
  INTO metadata_after
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = routine_oid
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8')),
      'hex'
    ) = worker_assert_successor_digest;

  IF metadata_after IS NULL
     OR metadata_after IS DISTINCT FROM metadata_before
  THEN
    RAISE EXCEPTION
      'CURRENT186 worker-v2 metadata changed while rebinding database receipt'
      USING ERRCODE = '55000';
  END IF;
END;
$worker_v2_projection_narrowing$;

COMMENT ON FUNCTION public."identity_mail_delivery_worker_assert_v2"(
  TEXT,
  TEXT
) IS
  'CURRENT_186 NOT_DEPLOYABLE ACTIVE worker-v2 readiness pinned to exact CURRENT_186; database-local authorization boundary only and send remain false.';

-- The worker routines invoke the global email-claim lock while owned by the
-- schema-owner role.  Keep the helper itself database-owner controlled and
-- pin its exact executable body, attributes and pre-boundary ACL before the
-- deployment catalog is allowed to grant the one bounded EXECUTE authority.
DO $claim_lock_support_prerequisite$
DECLARE
  helper_oid OID :=
    pg_catalog.to_regprocedure('public.identity_email_claim_lock_v1(text)');
  database_owner_oid OID;
  overload_count INTEGER;
  metadata_match_count INTEGER;
  acl_count INTEGER;
  acl_drift INTEGER;
BEGIN
  SELECT database_entry.datdba
  INTO database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  SELECT pg_catalog.count(*)::INTEGER
  INTO overload_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND routine.proname = 'identity_email_claim_lock_v1';

  IF helper_oid IS NULL
     OR database_owner_oid IS NULL
     OR overload_count IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION
      'CURRENT186 email-claim lock helper prerequisite is missing or ambiguous'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO metadata_match_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_language AS language_entry
    ON language_entry.oid = routine.prolang
  WHERE routine.oid = helper_oid
    AND routine.proowner = database_owner_oid
    AND routine.prokind = 'f'::"char"
    AND language_entry.lanname = 'plpgsql'
    AND NOT routine.prosecdef
    AND NOT routine.proleakproof
    AND NOT routine.proisstrict
    AND routine.provolatile = 'v'::"char"
    AND routine.proparallel = 'u'::"char"
    AND routine.pronargs = 1
    AND routine.proargtypes = '25'::pg_catalog.oidvector
    AND routine.prorettype = 'pg_catalog.text'::pg_catalog.regtype
    AND routine.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AND pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(routine.prosrc, 'UTF8')
      ),
      'hex'
    ) = 'ba68aaef2db7b6302bad2a4b385d211e19566639182be7b6a300f8ad7e429b7c';

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE acl.grantor IS DISTINCT FROM database_owner_oid
         OR acl.grantee IS DISTINCT FROM database_owner_oid
         OR acl.privilege_type IS DISTINCT FROM 'EXECUTE'
         OR acl.is_grantable
    )::INTEGER
  INTO acl_count, acl_drift
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f'::"char", routine.proowner)
    )
  ) AS acl
  WHERE routine.oid = helper_oid;

  IF metadata_match_count IS DISTINCT FROM 1
     OR acl_count IS DISTINCT FROM 1
     OR acl_drift IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT186 email-claim lock helper prerequisite drifted'
      USING ERRCODE = '55000';
  END IF;
END;
$claim_lock_support_prerequisite$;

CREATE TABLE public."IdentityMailDutyRoleAclEpochV1" (
  "epoch" BIGINT NOT NULL,
  "operationId" TEXT NOT NULL,
  "previousEpoch" BIGINT,
  "previousPayloadDigest" CHAR(64),
  "catalogContract" VARCHAR(64) NOT NULL,
  "catalogProfile" VARCHAR(64) NOT NULL,
  "catalogDigest" CHAR(64) NOT NULL,
  "exactGrantsProfile" VARCHAR(64) NOT NULL,
  "exactGrantsDigest" CHAR(64) NOT NULL,
  "ownerSurfaceDigest" CHAR(64) NOT NULL,
  "databaseName" VARCHAR(63) NOT NULL,
  "databaseOid" BIGINT NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "deploymentMarkerId" TEXT NOT NULL,
  "deploymentMarkerDigest" CHAR(64) NOT NULL,
  "actualContextDigest" CHAR(64) NOT NULL,
  "deploymentRoleName" VARCHAR(63) NOT NULL,
  "deploymentRoleOid" BIGINT NOT NULL,
  "schemaOwnerRoleName" VARCHAR(63) NOT NULL,
  "schemaOwnerRoleOid" BIGINT NOT NULL,
  "coordinatorRoleName" VARCHAR(63) NOT NULL,
  "coordinatorRoleOid" BIGINT NOT NULL,
  "workerRoleName" VARCHAR(63) NOT NULL,
  "workerRoleOid" BIGINT NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "migrationHead" VARCHAR(128) NOT NULL,
  "migrationManifestDigest" CHAR(64) NOT NULL,
  "applicationContract" VARCHAR(96) NOT NULL,
  "applicationReleaseSha" CHAR(40) NOT NULL,
  "applicationArtifactSha256" CHAR(64) NOT NULL,
  "reasonCode" VARCHAR(32) NOT NULL,
  "applyReceiptDigest" CHAR(64) NOT NULL,
  "beforeCatalogDigest" CHAR(64) NOT NULL,
  "beforeCatalogCanonicalJson" TEXT,
  "planDigest" CHAR(64) NOT NULL,
  "definitionManifestDigest" CHAR(64) NOT NULL,
  "evidenceDigest" CHAR(64) NOT NULL,
  "payloadCanonicalJson" TEXT NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "recordedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "recordedTransactionId" VARCHAR(32) NOT NULL,

  CONSTRAINT "IdentityMailDutyRoleAclEpochV1_pkey"
    PRIMARY KEY ("epoch"),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_operation_key"
    UNIQUE ("operationId"),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_payload_key"
    UNIQUE ("epoch", "payloadDigest"),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_identifier_check"
    CHECK (
      "epoch" >= 1
      AND "operationId" = pg_catalog.lower(
        pg_catalog.btrim("operationId" COLLATE "C")
      )
      AND ("operationId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (
        ("epoch" = 1 AND "previousEpoch" IS NULL
          AND "previousPayloadDigest" IS NULL)
        OR
        ("epoch" > 1 AND "previousEpoch" = "epoch" - 1
          AND ("previousPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$')
      )
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_contract_check"
    CHECK (
      "catalogContract" = 'IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'
      AND "catalogProfile" =
        'IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1'
      AND "exactGrantsProfile" = 'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
      AND "migrationCount" = 186
      AND "migrationHead" =
        '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
      AND "applicationContract" =
        'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2'
      AND "reasonCode" IN (
        'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'
      )
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_definition_manifest_check"
    CHECK (
      "definitionManifestDigest" =
        '46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be'
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_digest_check"
    CHECK (
      ("catalogDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("exactGrantsDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("ownerSurfaceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("deploymentMarkerDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("actualContextDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("migrationManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("applicationReleaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
      AND ("applicationArtifactSha256" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("applyReceiptDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("beforeCatalogDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("planDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("definitionManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("evidenceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      AND "recordedTransactionId" ~ '^[0-9]{1,32}$'
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_context_check"
    CHECK (
      "databaseName" = pg_catalog.lower(
        pg_catalog.btrim("databaseName" COLLATE "C")
      )
      AND ("databaseName"::TEXT COLLATE "C") ~ '^[a-z][a-z0-9_]{0,62}$'
      AND "databaseName" NOT IN ('postgres', 'template0', 'template1')
      AND "databaseOid" BETWEEN 1 AND 4294967295
      AND "deploymentMarkerId" = pg_catalog.lower(
        pg_catalog.btrim("deploymentMarkerId" COLLATE "C")
      )
      AND ("deploymentMarkerId" COLLATE "C") ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_roles_check"
    CHECK (
      ("deploymentRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND ("schemaOwnerRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND ("coordinatorRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND ("workerRoleName"::TEXT COLLATE "C") ~
        '^[a-z_][a-z0-9_]{2,62}$'
      AND "deploymentRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
      AND "schemaOwnerRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
      AND "coordinatorRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
      AND "workerRoleName" NOT LIKE 'pg\_%' ESCAPE '\'
      AND "deploymentRoleName" <> 'public'
      AND "schemaOwnerRoleName" <> 'public'
      AND "coordinatorRoleName" <> 'public'
      AND "workerRoleName" <> 'public'
      AND "deploymentRoleOid" BETWEEN 1 AND 4294967295
      AND "schemaOwnerRoleOid" BETWEEN 1 AND 4294967295
      AND "coordinatorRoleOid" BETWEEN 1 AND 4294967295
      AND "workerRoleOid" BETWEEN 1 AND 4294967295
      AND "deploymentRoleName" <> "schemaOwnerRoleName"
      AND "deploymentRoleName" <> "coordinatorRoleName"
      AND "deploymentRoleName" <> "workerRoleName"
      AND "schemaOwnerRoleName" <> "coordinatorRoleName"
      AND "schemaOwnerRoleName" <> "workerRoleName"
      AND "coordinatorRoleName" <> "workerRoleName"
      AND "deploymentRoleOid" <> "schemaOwnerRoleOid"
      AND "deploymentRoleOid" <> "coordinatorRoleOid"
      AND "deploymentRoleOid" <> "workerRoleOid"
      AND "schemaOwnerRoleOid" <> "coordinatorRoleOid"
      AND "schemaOwnerRoleOid" <> "workerRoleOid"
      AND "coordinatorRoleOid" <> "workerRoleOid"
    ),
  CONSTRAINT "identity_mail_duty_role_acl_epoch_payload_check"
    CHECK (
      pg_catalog.octet_length("payloadCanonicalJson") BETWEEN 2 AND 600000
      AND "payloadCanonicalJson" = pg_catalog.btrim(
        "payloadCanonicalJson" COLLATE "C"
      )
      AND ("payloadCanonicalJson" COLLATE "C") !~ '[[:space:]]'
      AND "payloadDigest" = pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1'
              || E'\n' || "payloadCanonicalJson" || E'\n',
            'UTF8'
          )
        ),
        'hex'
      )
      AND (
        (
          "reasonCode" IN ('APPLY', 'ROTATE')
          AND ("payloadCanonicalJson"::JSONB)
            ->>'beforeCatalogStorageProfile' =
              'EPOCH_COLUMN_CANONICAL_JSON_V1'
          AND "beforeCatalogCanonicalJson" IS NOT NULL
          AND pg_catalog.octet_length("beforeCatalogCanonicalJson")
            BETWEEN 2 AND 4194304
          AND "beforeCatalogDigest" = pg_catalog.encode(
            pg_catalog.sha256(
              pg_catalog.convert_to(
                'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'
                  || E'\n' || "beforeCatalogCanonicalJson" || E'\n',
                'UTF8'
              )
            ),
            'hex'
          )
        )
        OR
        (
          "reasonCode" IN ('ROLLBACK', 'EMERGENCY_CONTAINMENT')
          AND ("payloadCanonicalJson"::JSONB)
            ->'beforeCatalogStorageProfile' = 'null'::JSONB
          AND "beforeCatalogCanonicalJson" IS NULL
        )
      )
    )
);

ALTER TABLE public."IdentityMailDutyRoleAclEpochV1"
  ALTER COLUMN "beforeCatalogCanonicalJson" SET STORAGE EXTENDED;

ALTER TABLE public."IdentityMailDutyRoleAclEpochV1"
  ADD CONSTRAINT "identity_mail_duty_role_acl_epoch_previous_fkey"
  FOREIGN KEY ("previousEpoch", "previousPayloadDigest")
  REFERENCES public."IdentityMailDutyRoleAclEpochV1" (
    "epoch", "payloadDigest"
  )
  MATCH FULL
  ON DELETE RESTRICT
  ON UPDATE RESTRICT
  DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "identity_mail_duty_role_acl_epoch_marker_fkey"
  FOREIGN KEY (
    "deploymentMarkerId",
    "deploymentMarkerDigest",
    "databaseIdentityDigest",
    "actualContextDigest"
  )
  REFERENCES public."SharedBetaRuntimeReleaseMarker" (
    "id",
    "payloadDigest",
    "databaseIdentityDigest",
    "actualContextDigest"
  )
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_epoch BIGINT;
BEGIN
  -- Global ACL serialization key.  Tenant lifecycle always takes the tenant
  -- lock first and this lock second; the privileged controller takes only this
  -- lock, so no reverse tenant/ACL cycle exists.
  PERFORM pg_catalog.pg_advisory_xact_lock(1279677004, 186);

  SELECT COALESCE(pg_catalog.max(epoch."epoch"), 0)
  INTO current_epoch
  FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch;

  RETURN current_epoch;
END;
$$;

CREATE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Identity-mail duty-role ACL evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger"
BEFORE UPDATE OR DELETE
ON public."IdentityMailDutyRoleAclEpochV1"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();

CREATE TRIGGER "IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger"
BEFORE TRUNCATE
ON public."IdentityMailDutyRoleAclEpochV1"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();

CREATE FUNCTION public."identity_mail_duty_role_live_assert_v1"(
  p_deployment_role_oid BIGINT,
  p_schema_owner_role_oid BIGINT,
  p_coordinator_role_oid BIGINT,
  p_worker_role_oid BIGINT,
  p_reason_code TEXT,
  p_expected_definition_manifest_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  database_oid OID;
  database_owner_oid OID;
  caller_role_oid OID;
  expected_protected_owner_oid OID;
  routine_definition_count INTEGER;
  trigger_definition_count INTEGER;
  protected_relation_count INTEGER;
  trigger_definition_drift BOOLEAN;
  definition_manifest_constraint_drift BOOLEAN;
  observed_definition_manifest_digest TEXT;
  observed_direct_duty_acl_digest TEXT;
  observed_system_public_acl_digest TEXT;
  active_duty_role_session_count INTEGER;
  direct_acl_drift BOOLEAN;
  protected_surface_acl_drift BOOLEAN;
  role_boundary_drift BOOLEAN;
  owner_surface_drift BOOLEAN;
  unexpected_owned_object BOOLEAN;
  public_acl_drift BOOLEAN;
BEGIN
  IF p_deployment_role_oid NOT BETWEEN 1 AND 4294967295
     OR p_schema_owner_role_oid NOT BETWEEN 1 AND 4294967295
     OR p_coordinator_role_oid NOT BETWEEN 1 AND 4294967295
     OR p_worker_role_oid NOT BETWEEN 1 AND 4294967295
     OR p_reason_code NOT IN (
       'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',
       'RUNTIME_COORDINATOR'
     )
     OR p_expected_definition_manifest_digest IS NULL
     OR (p_expected_definition_manifest_digest COLLATE "C") !~
       '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role live assertion input is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT database_entry.oid, database_entry.datdba
  INTO database_oid, database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  SELECT role_entry.oid
  INTO caller_role_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = current_user;

  IF database_oid IS NULL
     OR database_owner_oid IS DISTINCT FROM p_deployment_role_oid::OID
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles AS deployment_role
       WHERE deployment_role.oid = p_deployment_role_oid::OID
         AND deployment_role.rolsuper
     )
     OR (
       p_reason_code <> 'RUNTIME_COORDINATOR'
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_roles AS deployment_role
         WHERE deployment_role.oid = p_deployment_role_oid::OID
           AND deployment_role.rolname = session_user
           AND deployment_role.rolsuper
       )
     )
     OR (
       p_reason_code = 'RUNTIME_COORDINATOR'
       AND NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_roles AS coordinator_role
         WHERE coordinator_role.oid = p_coordinator_role_oid::OID
           AND coordinator_role.rolname = session_user
       )
     )
     OR caller_role_oid IS NULL
     OR (
       p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID
     )
     OR (
       p_reason_code = 'ROLLBACK'
       AND caller_role_oid IS DISTINCT FROM p_deployment_role_oid::OID
     )
     OR (
       p_reason_code = 'EMERGENCY_CONTAINMENT'
       AND caller_role_oid NOT IN (
         p_deployment_role_oid::OID, p_schema_owner_role_oid::OID
       )
     )
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role live assertion caller drifted'
      USING ERRCODE = '42501';
  END IF;

  expected_protected_owner_oid := CASE
    WHEN p_reason_code IN (
      'APPLY', 'ROTATE', 'EMERGENCY_CONTAINMENT', 'RUNTIME_COORDINATOR'
    )
      THEN p_schema_owner_role_oid::OID
    WHEN p_reason_code = 'ROLLBACK'
      THEN p_deployment_role_oid::OID
  END;

  SELECT
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.oid = p_schema_owner_role_oid::OID
        AND NOT role_entry.rolcanlogin
        AND NOT role_entry.rolinherit
        AND NOT role_entry.rolsuper
        AND NOT role_entry.rolcreaterole
        AND NOT role_entry.rolcreatedb
        AND NOT role_entry.rolreplication
        AND NOT role_entry.rolbypassrls
        AND role_entry.rolconnlimit = -1
        AND role_entry.rolvaliduntil IS NULL
    )
    OR (
      SELECT pg_catalog.count(*) IS DISTINCT FROM 2
      FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.oid IN (
        p_coordinator_role_oid::OID, p_worker_role_oid::OID
      )
        AND NOT role_entry.rolinherit
        AND NOT role_entry.rolsuper
        AND NOT role_entry.rolcreaterole
        AND NOT role_entry.rolcreatedb
        AND NOT role_entry.rolreplication
        AND NOT role_entry.rolbypassrls
        AND role_entry.rolconnlimit = -1
        AND role_entry.rolvaliduntil IS NULL
        AND (
          p_reason_code = 'ROLLBACK'
          OR (
            p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
            AND role_entry.rolcanlogin
          )
          OR (
            p_reason_code = 'EMERGENCY_CONTAINMENT'
            AND NOT role_entry.rolcanlogin
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member IN (
        p_schema_owner_role_oid::OID,
        p_coordinator_role_oid::OID,
        p_worker_role_oid::OID
      )
         OR membership.roleid IN (
           p_schema_owner_role_oid::OID,
           p_coordinator_role_oid::OID,
           p_worker_role_oid::OID
         )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_db_role_setting AS setting
      WHERE setting.setrole IN (
        p_schema_owner_role_oid::OID,
        p_coordinator_role_oid::OID,
        p_worker_role_oid::OID
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_default_acl AS default_acl
      WHERE default_acl.defaclrole IN (
        p_schema_owner_role_oid::OID,
        p_coordinator_role_oid::OID,
        p_worker_role_oid::OID
      )
         OR EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(default_acl.defaclacl) AS acl
           WHERE acl.grantee IN (
             p_schema_owner_role_oid::OID,
             p_coordinator_role_oid::OID,
             p_worker_role_oid::OID
           )
         )
    )
  INTO role_boundary_drift;

  IF role_boundary_drift THEN
    RAISE EXCEPTION 'Identity-mail duty-role live role boundary drifted'
      USING ERRCODE = '42501';
  END IF;

  -- EMERGENCY_CONTAINMENT is admissible only after the cluster-visible
  -- sessions authenticated as every duty role have drained.  NOLOGIN and the
  -- membership checks above make this a stable zero barrier for the epoch
  -- append; clearing the statistics snapshot prevents a cached activity view
  -- from authorizing stale containment evidence.
  IF p_reason_code = 'EMERGENCY_CONTAINMENT' THEN
    PERFORM pg_catalog.pg_stat_clear_snapshot();

    SELECT pg_catalog.count(*)::INTEGER
    INTO active_duty_role_session_count
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.usesysid IN (
      p_schema_owner_role_oid::OID,
      p_coordinator_role_oid::OID,
      p_worker_role_oid::OID
    );

    IF active_duty_role_session_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION
        'Identity-mail duty-role emergency session barrier is not zero'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  WITH
  expected_routines(signature) AS (
    VALUES
      ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_email_claim_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
      ('public.identity_mail_delivery_event_append_v2()'::TEXT),
      ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
      ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
      ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
      ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
      ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
      ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
      ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
  ),
  expected_triggers(relation_name, trigger_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT),
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_truncate_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_delete_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_write_guard_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_dml_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_dml_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_insert_guard_v2_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_insert_lock_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_event_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_guard_trigger'::TEXT)
  ),
  protected_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('_prisma_migrations'::TEXT)
  ),
  protected_relation_oids AS (
    SELECT relation.oid, relation.relname
    FROM protected_relations AS expected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.relation_name
     AND relation.relkind IN ('r', 'p')
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
  ),
  definition_rows(kind, identity, definition_sha256) AS (
    SELECT
      'ROUTINE'::TEXT,
      expected.signature,
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.pg_get_functiondef(routine.oid), 'UTF8'
          )
        ),
        'hex'
      )
    FROM expected_routines AS expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    UNION ALL
    SELECT
      'TRIGGER',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, trigger_entry.tgname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            trigger_entry.tgenabled::TEXT || '|'
              || pg_catalog.pg_get_triggerdef(trigger_entry.oid, false),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM expected_triggers AS expected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.relation_name
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    INNER JOIN pg_catalog.pg_trigger AS trigger_entry
      ON trigger_entry.tgrelid = relation.oid
     AND trigger_entry.tgname = expected.trigger_name
     AND NOT trigger_entry.tgisinternal
    UNION ALL
    SELECT
      'CONSTRAINT',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, constraint_entry.conname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            constraint_entry.contype::TEXT || '|'
              || constraint_entry.condeferrable::TEXT || '|'
              || constraint_entry.condeferred::TEXT || '|'
              || constraint_entry.convalidated::TEXT || '|'
              || pg_catalog.pg_get_constraintdef(
                constraint_entry.oid, false
              ),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM protected_relation_oids AS relation
    INNER JOIN pg_catalog.pg_constraint AS constraint_entry
      ON constraint_entry.conrelid = relation.oid
    WHERE constraint_entry.conname <>
      'identity_mail_duty_role_acl_epoch_definition_manifest_check'
    UNION ALL
    SELECT
      'INDEX',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, index_relation.relname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            index_entry.indisunique::TEXT || '|'
              || index_entry.indisprimary::TEXT || '|'
              || index_entry.indisexclusion::TEXT || '|'
              || index_entry.indimmediate::TEXT || '|'
              || index_entry.indisvalid::TEXT || '|'
              || index_entry.indisready::TEXT || '|'
              || index_entry.indislive::TEXT || '|'
              || index_entry.indisreplident::TEXT || '|'
              || pg_catalog.pg_get_indexdef(
                index_entry.indexrelid, 0, false
              ),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM protected_relation_oids AS relation
    INNER JOIN pg_catalog.pg_index AS index_entry
      ON index_entry.indrelid = relation.oid
    INNER JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_entry.indexrelid
  )
  SELECT
    pg_catalog.count(*) FILTER (WHERE kind = 'ROUTINE')::INTEGER,
    pg_catalog.count(*) FILTER (WHERE kind = 'TRIGGER')::INTEGER,
    (
      SELECT pg_catalog.count(*)::INTEGER FROM protected_relation_oids
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_V1'
            || E'\n'
            || pg_catalog.string_agg(
              kind || '|' || identity || '|' || definition_sha256,
              E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C"
            )
            || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    routine_definition_count,
    trigger_definition_count,
    protected_relation_count,
    observed_definition_manifest_digest
  FROM definition_rows;

  IF routine_definition_count IS DISTINCT FROM 23
     OR trigger_definition_count IS DISTINCT FROM 21
     OR protected_relation_count IS DISTINCT FROM 9
     OR observed_definition_manifest_digest IS DISTINCT FROM
       p_expected_definition_manifest_digest
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role live definition manifest drifted'
      USING ERRCODE = '55000';
  END IF;

  WITH expected(relation_name, trigger_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT),
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_truncate_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_delete_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_write_guard_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_dml_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_dml_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_insert_guard_v2_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_insert_lock_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_event_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_guard_trigger'::TEXT)
  ),
  protected_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('_prisma_migrations'::TEXT)
  ),
  actual(relation_name, trigger_name, enabled) AS (
    SELECT relation.relname, trigger_entry.tgname, trigger_entry.tgenabled
    FROM pg_catalog.pg_trigger AS trigger_entry
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_entry.tgrelid
    INNER JOIN protected_relations AS protected
      ON protected.relation_name = relation.relname
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    WHERE NOT trigger_entry.tgisinternal
  )
  SELECT EXISTS (
    SELECT 1
    FROM actual
    FULL OUTER JOIN expected
      ON expected.relation_name = actual.relation_name
     AND expected.trigger_name = actual.trigger_name
    WHERE actual.trigger_name IS NULL
       OR expected.trigger_name IS NULL
       OR actual.enabled <> 'O'::"char"
  )
  INTO trigger_definition_drift;

  SELECT pg_catalog.count(*) IS DISTINCT FROM 1
  INTO definition_manifest_constraint_drift
  FROM pg_catalog.pg_constraint AS constraint_entry
  WHERE constraint_entry.conrelid =
      'public."IdentityMailDutyRoleAclEpochV1"'::pg_catalog.regclass
    AND constraint_entry.conname =
      'identity_mail_duty_role_acl_epoch_definition_manifest_check'
    AND constraint_entry.contype = 'c'::"char"
    AND NOT constraint_entry.condeferrable
    AND NOT constraint_entry.condeferred
    AND constraint_entry.convalidated
    AND constraint_entry.conkey = ARRAY[
      (
        SELECT attribute.attnum
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_entry.conrelid
          AND attribute.attname = 'definitionManifestDigest'
          AND NOT attribute.attisdropped
      )
    ]::SMALLINT[]
    AND pg_catalog.pg_get_expr(
      constraint_entry.conbin, constraint_entry.conrelid, false
    ) = pg_catalog.format(
      '("definitionManifestDigest" = %L::bpchar)',
      p_expected_definition_manifest_digest
    );

  IF trigger_definition_drift OR definition_manifest_constraint_drift THEN
    RAISE EXCEPTION
      'Identity-mail duty-role live trigger/self-hash definition drifted'
      USING ERRCODE = '55000';
  END IF;

  WITH
  protected_owner_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT)
  ),
  underlying_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('IdentityEmailClaim'::TEXT),
      ('SharedBetaRuntimeReleaseMarker'::TEXT),
      ('Tenant'::TEXT),
      ('UserInvite'::TEXT),
      ('_prisma_migrations'::TEXT)
  )
  SELECT
    (
      SELECT pg_catalog.count(*) IS DISTINCT FROM 5
      FROM protected_owner_relations AS expected
      INNER JOIN pg_catalog.pg_class AS relation
        ON relation.relname = expected.relation_name
       AND relation.relowner = expected_protected_owner_oid
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
       AND namespace.nspname = 'public'
    )
    OR (
      SELECT pg_catalog.count(*) IS DISTINCT FROM 8
      FROM underlying_relations AS expected
      INNER JOIN pg_catalog.pg_class AS relation
        ON relation.relname = expected.relation_name
       AND relation.relowner = p_deployment_role_oid::OID
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
       AND namespace.nspname = 'public'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_namespace AS namespace
      WHERE namespace.nspname = 'public'
        AND (
          (
            p_reason_code IN (
              'APPLY', 'ROTATE', 'EMERGENCY_CONTAINMENT',
              'RUNTIME_COORDINATOR'
            )
            AND namespace.nspowner = p_schema_owner_role_oid::OID
          )
          OR (
            p_reason_code = 'ROLLBACK'
            AND (
              namespace.nspowner = p_deployment_role_oid::OID
              OR (
                namespace.nspowner = 6171::OID
                AND EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_roles AS predefined_role
                  WHERE predefined_role.oid = 6171::OID
                    AND predefined_role.rolname = 'pg_database_owner'
                )
              )
            )
          )
        )
    )
    OR (
      SELECT pg_catalog.count(*) IS DISTINCT FROM 22
      FROM pg_catalog.pg_proc AS routine
      INNER JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = routine.pronamespace
      WHERE namespace.nspname = 'public'
        AND routine.proowner = expected_protected_owner_oid
        AND routine.oid IN (
          SELECT pg_catalog.to_regprocedure(signature)
          FROM (
            VALUES
              ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
              ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
              ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
              ('public.identity_mail_delivery_event_append_v2()'::TEXT),
              ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
              ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
              ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
              ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
              ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
              ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
              ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
              ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
              ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
              ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
              ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
              ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
              ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
              ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
              ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
              ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
              ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
              ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
          ) AS expected(signature)
        )
    )
  INTO owner_surface_drift;

  IF owner_surface_drift THEN
    RAISE EXCEPTION 'Identity-mail duty-role live owner surface drifted'
      USING ERRCODE = '42501';
  END IF;

  WITH
  duty_roles(role_oid) AS (
    VALUES
      (p_schema_owner_role_oid::OID),
      (p_coordinator_role_oid::OID),
      (p_worker_role_oid::OID)
  ),
  protected_owner_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT)
  ),
  protected_owner_relation_oids(oid, reltype, reltoastrelid) AS (
    SELECT relation.oid, relation.reltype, relation.reltoastrelid
    FROM protected_owner_relations AS expected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.relation_name
     AND relation.relkind IN ('r', 'p')
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
  ),
  protected_owner_toast_oids(oid) AS (
    SELECT relation.reltoastrelid
    FROM protected_owner_relation_oids AS relation
    WHERE relation.reltoastrelid <> 0::OID
  ),
  allowed_schema_owner_relation_oids(oid) AS (
    SELECT relation.oid FROM protected_owner_relation_oids AS relation
    UNION
    SELECT index_entry.indexrelid
    FROM pg_catalog.pg_index AS index_entry
    WHERE index_entry.indrelid IN (
      SELECT relation.oid FROM protected_owner_relation_oids AS relation
    )
    UNION
    SELECT toast.oid FROM protected_owner_toast_oids AS toast
    UNION
    SELECT index_entry.indexrelid
    FROM pg_catalog.pg_index AS index_entry
    WHERE index_entry.indrelid IN (
      SELECT toast.oid FROM protected_owner_toast_oids AS toast
    )
    UNION
    SELECT sequence.oid
    FROM pg_catalog.pg_class AS sequence
    INNER JOIN pg_catalog.pg_depend AS dependency
      ON dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
     AND dependency.objid = sequence.oid
     AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
     AND dependency.refobjid IN (
       SELECT relation.oid FROM protected_owner_relation_oids AS relation
     )
     AND dependency.deptype IN ('a'::"char", 'i'::"char")
    WHERE sequence.relkind = 'S'::"char"
  ),
  allowed_schema_owner_type_oids(oid) AS (
    SELECT row_type.oid
    FROM protected_owner_relation_oids AS relation
    INNER JOIN pg_catalog.pg_type AS row_type
      ON row_type.oid = relation.reltype
     AND row_type.typrelid = relation.oid
     AND row_type.typtype = 'c'::"char"
    UNION
    SELECT row_type.typarray
    FROM protected_owner_relation_oids AS relation
    INNER JOIN pg_catalog.pg_type AS row_type
      ON row_type.oid = relation.reltype
     AND row_type.typrelid = relation.oid
     AND row_type.typtype = 'c'::"char"
    WHERE row_type.typarray <> 0::OID
  ),
  allowed_schema_owner_routine_oids(oid) AS (
    SELECT pg_catalog.to_regprocedure(expected.signature)::OID
    FROM (
      VALUES
        ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
        ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
        ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
        ('public.identity_mail_delivery_event_append_v2()'::TEXT),
        ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
        ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
        ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
        ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
        ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
        ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
        ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
        ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
        ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
        ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
        ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
        ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
        ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
        ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
        ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
        ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
        ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
        ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
    ) AS expected(signature)
  ),
  owned(kind, object_oid, owner_oid) AS (
    SELECT 'DATABASE'::TEXT, database_entry.oid, database_entry.datdba
    FROM pg_catalog.pg_database AS database_entry
    WHERE database_entry.oid = database_oid
    UNION ALL
    SELECT 'SCHEMA', namespace.oid, namespace.nspowner
    FROM pg_catalog.pg_namespace AS namespace
    UNION ALL
    SELECT 'RELATION', relation.oid, relation.relowner
    FROM pg_catalog.pg_class AS relation
    UNION ALL
    SELECT 'ROUTINE', routine.oid, routine.proowner
    FROM pg_catalog.pg_proc AS routine
    UNION ALL
    SELECT 'TYPE', type_entry.oid, type_entry.typowner
    FROM pg_catalog.pg_type AS type_entry
    UNION ALL
    SELECT 'LANGUAGE', language.oid, language.lanowner
    FROM pg_catalog.pg_language AS language
    UNION ALL
    SELECT 'FOREIGN_DATA_WRAPPER', wrapper.oid, wrapper.fdwowner
    FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
    UNION ALL
    SELECT 'FOREIGN_SERVER', server.oid, server.srvowner
    FROM pg_catalog.pg_foreign_server AS server
    UNION ALL
    SELECT 'TABLESPACE', tablespace.oid, tablespace.spcowner
    FROM pg_catalog.pg_tablespace AS tablespace
    UNION ALL
    SELECT 'LARGE_OBJECT', large_object.oid, large_object.lomowner
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    UNION ALL
    SELECT 'EXTENSION', extension.oid, extension.extowner
    FROM pg_catalog.pg_extension AS extension
    UNION ALL
    SELECT 'COLLATION', collation_entry.oid, collation_entry.collowner
    FROM pg_catalog.pg_collation AS collation_entry
    UNION ALL
    SELECT 'CONVERSION', conversion.oid, conversion.conowner
    FROM pg_catalog.pg_conversion AS conversion
    UNION ALL
    SELECT 'OPERATOR', operator_entry.oid, operator_entry.oprowner
    FROM pg_catalog.pg_operator AS operator_entry
    UNION ALL
    SELECT 'OPERATOR_CLASS', operator_class.oid, operator_class.opcowner
    FROM pg_catalog.pg_opclass AS operator_class
    UNION ALL
    SELECT 'OPERATOR_FAMILY', operator_family.oid, operator_family.opfowner
    FROM pg_catalog.pg_opfamily AS operator_family
    UNION ALL
    SELECT 'TEXT_SEARCH_CONFIGURATION', configuration.oid, configuration.cfgowner
    FROM pg_catalog.pg_ts_config AS configuration
    UNION ALL
    SELECT 'TEXT_SEARCH_DICTIONARY', dictionary.oid, dictionary.dictowner
    FROM pg_catalog.pg_ts_dict AS dictionary
    UNION ALL
    SELECT 'STATISTICS', statistics.oid, statistics.stxowner
    FROM pg_catalog.pg_statistic_ext AS statistics
    UNION ALL
    SELECT 'EVENT_TRIGGER', event_trigger.oid, event_trigger.evtowner
    FROM pg_catalog.pg_event_trigger AS event_trigger
    UNION ALL
    SELECT 'PUBLICATION', publication.oid, publication.pubowner
    FROM pg_catalog.pg_publication AS publication
    UNION ALL
    SELECT 'SUBSCRIPTION', subscription.oid, subscription.subowner
    FROM pg_catalog.pg_subscription AS subscription
    UNION ALL
    SELECT 'USER_MAPPING', mapping.umid, mapping.umuser
    FROM pg_catalog.pg_user_mappings AS mapping
    WHERE mapping.umuser <> 0::OID
    UNION ALL
    SELECT 'PREPARED_TRANSACTION', NULL::OID, owner_role.oid
    FROM pg_catalog.pg_prepared_xacts AS prepared
    INNER JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.rolname = prepared.owner
    WHERE prepared.database = pg_catalog.current_database()
  )
  SELECT EXISTS (
    SELECT 1
    FROM owned
    WHERE owned.owner_oid IN (SELECT role_oid FROM duty_roles)
      AND NOT (
        owned.owner_oid = p_schema_owner_role_oid::OID
        AND p_reason_code IN (
          'APPLY', 'ROTATE', 'EMERGENCY_CONTAINMENT',
          'RUNTIME_COORDINATOR'
        )
        AND (
          (
            owned.kind = 'SCHEMA'
            AND owned.object_oid = 'public'::pg_catalog.regnamespace::OID
          )
          OR (
            owned.kind = 'RELATION'
            AND owned.object_oid IN (
              SELECT allowed.oid FROM allowed_schema_owner_relation_oids AS allowed
            )
          )
          OR (
            owned.kind = 'ROUTINE'
            AND owned.object_oid IN (
              SELECT allowed.oid FROM allowed_schema_owner_routine_oids AS allowed
            )
          )
          OR (
            owned.kind = 'TYPE'
            AND owned.object_oid IN (
              SELECT allowed.oid FROM allowed_schema_owner_type_oids AS allowed
            )
          )
        )
      )
  )
  INTO unexpected_owned_object;

  IF unexpected_owned_object THEN
    RAISE EXCEPTION
      'Identity-mail duty role owns an object outside the frozen allowlist'
      USING ERRCODE = '42501';
  END IF;

  WITH
  duty_roles(role_oid) AS (
    VALUES
      (p_schema_owner_role_oid::OID),
      (p_coordinator_role_oid::OID),
      (p_worker_role_oid::OID)
  ),
  actual(kind, identity, grantor_oid, grantee_oid, privilege, grantable) AS (
    SELECT
      'DATABASE', database_entry.datname::TEXT, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        database_entry.datacl,
        pg_catalog.acldefault('d', database_entry.datdba)
      )
    ) AS acl
    WHERE database_entry.oid = database_oid
      AND acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> database_entry.datdba
    UNION ALL
    SELECT
      'SCHEMA', namespace.nspname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> namespace.nspowner
    UNION ALL
    SELECT
      CASE WHEN relation.relkind = 'S'::"char" THEN 'SEQUENCE' ELSE 'RELATION' END,
      pg_catalog.format(
        '%I."%s"', namespace.nspname,
        pg_catalog.replace(relation.relname, '"', '""')
      ),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault(
          CASE WHEN relation.relkind = 'S'::"char"
            THEN 's'::"char" ELSE 'r'::"char" END,
          relation.relowner
        )
      )
    ) AS acl
    WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> relation.relowner
    UNION ALL
    SELECT
      'COLUMN',
      pg_catalog.format(
        '%I."%s"."%s"', namespace.nspname,
        pg_catalog.replace(relation.relname, '"', '""'),
        pg_catalog.replace(attribute.attname, '"', '""')
      ),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
      AND acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> relation.relowner
    UNION ALL
    SELECT
      'ROUTINE',
      pg_catalog.format(
        '%I."%s"(%s)', namespace.nspname,
        pg_catalog.replace(routine.proname, '"', '""'),
        pg_catalog.replace(
          pg_catalog.oidvectortypes(routine.proargtypes),
          ', ', ','
        )
      ),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> routine.proowner
    UNION ALL
    SELECT
      'TYPE', pg_catalog.format('%I.%I', namespace.nspname, type_entry.typname),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_type AS type_entry
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_entry.typnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> type_entry.typowner
    UNION ALL
    SELECT
      'LANGUAGE', language.lanname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_language AS language
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(language.lanacl, pg_catalog.acldefault('l', language.lanowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> language.lanowner
    UNION ALL
    SELECT
      'PARAMETER', parameter.parname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_parameter_acl AS parameter
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter.paracl) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
    UNION ALL
    SELECT
      'FOREIGN_DATA_WRAPPER', wrapper.fdwname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(wrapper.fdwacl, pg_catalog.acldefault('F', wrapper.fdwowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> wrapper.fdwowner
    UNION ALL
    SELECT
      'FOREIGN_SERVER', server.srvname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_foreign_server AS server
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(server.srvacl, pg_catalog.acldefault('S', server.srvowner))
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> server.srvowner
    UNION ALL
    SELECT
      'TABLESPACE', tablespace.spcname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_tablespace AS tablespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        tablespace.spcacl,
        pg_catalog.acldefault('t', tablespace.spcowner)
      )
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> tablespace.spcowner
    UNION ALL
    SELECT
      'LARGE_OBJECT', large_object.oid::TEXT, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        large_object.lomacl,
        pg_catalog.acldefault('L', large_object.lomowner)
      )
    ) AS acl
    WHERE acl.grantee IN (SELECT role_oid FROM duty_roles)
      AND acl.grantee <> large_object.lomowner
  ),
  expected(kind, identity, grantor_oid, grantee_oid, privilege, grantable) AS (
    SELECT
      'DATABASE'::TEXT, pg_catalog.current_database()::TEXT,
      p_deployment_role_oid::OID, expected_role.role_oid,
      'CONNECT'::TEXT, false
    FROM (
      VALUES (p_coordinator_role_oid::OID), (p_worker_role_oid::OID)
    ) AS expected_role(role_oid)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'RELATION', expected_relation.identity,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      expected_relation.privilege, false
    FROM (
      VALUES
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'INSERT'::TEXT),
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailOutbox"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityMailOutbox"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailDeliveryEvent"'::TEXT, 'INSERT'::TEXT),
        ('public."IdentityMailDeliveryEvent"'::TEXT, 'SELECT'::TEXT),
        ('public."_prisma_migrations"'::TEXT, 'SELECT'::TEXT)
    ) AS expected_relation(identity, privilege)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'COLUMN', expected_column.identity,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      expected_column.privilege, false
    FROM (
      VALUES
        ('public."SharedBetaRuntimeReleaseMarker"."actualContextDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleName"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleOid"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."databaseIdentityDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."migrationCount"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."migrationManifestDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."payloadDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."revokedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."schemaHead"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."stateRevision"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."validUntil"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."status"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."customerStage"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."onboardingStatus"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."trialStartsAt"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."trialEndsAt"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."id"'::TEXT, 'UPDATE'::TEXT),
        ('public."UserInvite"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."tenantId"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."email"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."identityClaimRevision"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."tokenHash"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."acceptedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."revokedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."expiresAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."role"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."accessScope"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."customRoleId"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."storeIds"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."id"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."tenantId"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."claimType"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."subjectId"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."revision"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailDeliveryEvent"."id"'::TEXT, 'UPDATE'::TEXT)
    ) AS expected_column(identity, privilege)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'ROUTINE',
      'public."identity_email_claim_lock_v1"(text)'::TEXT,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      'EXECUTE', false
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'ROUTINE', expected_routine.signature,
      p_schema_owner_role_oid::OID, expected_routine.grantee_oid,
      'EXECUTE', false
    FROM (
      VALUES
        ('public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)'::TEXT, p_coordinator_role_oid::OID),
        ('public."identity_mail_delivery_worker_assert_v2"(text,text)'::TEXT, p_worker_role_oid::OID),
        ('public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'::TEXT, p_worker_role_oid::OID),
        ('public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'::TEXT, p_worker_role_oid::OID),
        ('public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'::TEXT, p_worker_role_oid::OID),
        ('public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'::TEXT, p_worker_role_oid::OID)
    ) AS expected_routine(signature, grantee_oid)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM actual
      FULL OUTER JOIN expected
        ON expected.kind = actual.kind
       AND expected.identity = actual.identity
       AND expected.grantor_oid = actual.grantor_oid
       AND expected.grantee_oid = actual.grantee_oid
       AND expected.privilege = actual.privilege
       AND expected.grantable = actual.grantable
      WHERE actual.kind IS NULL OR expected.kind IS NULL
    ),
    (
      SELECT pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DIRECT_DUTY_ACL_CURRENT186_V1'
              || E'\n'
              || COALESCE(
                pg_catalog.string_agg(
                  kind || '|' || identity || '|' || grantor_oid::TEXT || '|'
                    || grantee_oid::TEXT || '|' || privilege || '|'
                    || grantable::TEXT,
                  E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C",
                    grantor_oid, grantee_oid, privilege COLLATE "C", grantable
                ),
                ''
              )
              || E'\n',
            'UTF8'
          )
        ),
        'hex'
      )
      FROM actual
    )
  INTO direct_acl_drift, observed_direct_duty_acl_digest;

  IF direct_acl_drift THEN
    RAISE EXCEPTION 'Identity-mail duty-role direct ACL surface drifted'
      USING ERRCODE = '42501';
  END IF;

  -- The duty-role scan above proves that none of the three bounded roles has
  -- authority outside the profile.  This second exact scan closes the other
  -- direction: no named bystander may hold authority on the database, public
  -- schema, thirteen protected relations (including the exact thirty-five
  -- column worker support surface) or twenty-three protected routines.
  WITH
  protected_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('IdentityEmailClaim'::TEXT),
      ('SharedBetaRuntimeReleaseMarker'::TEXT),
      ('Tenant'::TEXT),
      ('UserInvite'::TEXT),
      ('_prisma_migrations'::TEXT)
  ),
  protected_routines(signature) AS (
    VALUES
      ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_email_claim_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
      ('public.identity_mail_delivery_event_append_v2()'::TEXT),
      ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
      ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
      ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
      ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
      ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
      ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
      ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
  ),
  actual(kind, identity, grantor_oid, grantee_oid, privilege, grantable) AS (
    SELECT
      'DATABASE', database_entry.datname::TEXT, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        database_entry.datacl,
        pg_catalog.acldefault('d', database_entry.datdba)
      )
    ) AS acl
    WHERE database_entry.oid = database_oid
      AND acl.grantee <> 0::OID
      AND acl.grantee <> database_entry.datdba
    UNION ALL
    SELECT
      'SCHEMA', namespace.nspname, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND acl.grantee <> 0::OID
      AND acl.grantee <> namespace.nspowner
    UNION ALL
    SELECT
      'RELATION', pg_catalog.format(
        '%I."%s"', namespace.nspname,
        pg_catalog.replace(relation.relname, '"', '""')
      ),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM protected_relations AS protected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = protected.relation_name
     AND relation.relkind IN ('r', 'p')
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) AS acl
    WHERE acl.grantee <> 0::OID AND acl.grantee <> relation.relowner
    UNION ALL
    SELECT
      'COLUMN',
      pg_catalog.format(
        '%I."%s"."%s"', namespace.nspname,
        pg_catalog.replace(relation.relname, '"', '""'),
        pg_catalog.replace(attribute.attname, '"', '""')
      ),
      acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
    FROM protected_relations AS protected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = protected.relation_name
     AND relation.relkind IN ('r', 'p')
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    INNER JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE acl.grantee <> 0::OID AND acl.grantee <> relation.relowner
    UNION ALL
    SELECT
      'ROUTINE', expected.signature, acl.grantor, acl.grantee,
      acl.privilege_type, acl.is_grantable
    FROM protected_routines AS expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
    ) AS acl
    WHERE acl.grantee <> 0::OID AND acl.grantee <> routine.proowner
  ),
  expected(kind, identity, grantor_oid, grantee_oid, privilege, grantable) AS (
    SELECT
      'DATABASE'::TEXT, pg_catalog.current_database()::TEXT,
      p_deployment_role_oid::OID, expected_role.role_oid,
      'CONNECT'::TEXT, false
    FROM (
      VALUES (p_coordinator_role_oid::OID), (p_worker_role_oid::OID)
    ) AS expected_role(role_oid)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'RELATION', expected_relation.identity,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      expected_relation.privilege, false
    FROM (
      VALUES
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'INSERT'::TEXT),
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailOutbox"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityMailOutbox"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailDeliveryEvent"'::TEXT, 'INSERT'::TEXT),
        ('public."IdentityMailDeliveryEvent"'::TEXT, 'SELECT'::TEXT),
        ('public."_prisma_migrations"'::TEXT, 'SELECT'::TEXT)
    ) AS expected_relation(identity, privilege)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'COLUMN', expected_column.identity,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      expected_column.privilege, false
    FROM (
      VALUES
        ('public."SharedBetaRuntimeReleaseMarker"."actualContextDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleName"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleOid"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."databaseIdentityDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."migrationCount"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."migrationManifestDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."payloadDigest"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."revokedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."schemaHead"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."stateRevision"'::TEXT, 'SELECT'::TEXT),
        ('public."SharedBetaRuntimeReleaseMarker"."validUntil"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."status"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."customerStage"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."onboardingStatus"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."trialStartsAt"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."trialEndsAt"'::TEXT, 'SELECT'::TEXT),
        ('public."Tenant"."id"'::TEXT, 'UPDATE'::TEXT),
        ('public."UserInvite"."id"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."tenantId"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."email"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."identityClaimRevision"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."tokenHash"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."acceptedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."revokedAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."expiresAt"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."role"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."accessScope"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."customRoleId"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."storeIds"'::TEXT, 'SELECT'::TEXT),
        ('public."UserInvite"."id"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."tenantId"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."claimType"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."subjectId"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."revision"'::TEXT, 'SELECT'::TEXT),
        ('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'UPDATE'::TEXT),
        ('public."IdentityMailDeliveryEvent"."id"'::TEXT, 'UPDATE'::TEXT)
    ) AS expected_column(identity, privilege)
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'ROUTINE',
      'public.identity_email_claim_lock_v1(text)'::TEXT,
      p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,
      'EXECUTE', false
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
    UNION ALL
    SELECT
      'ROUTINE', expected_routine.signature,
      p_schema_owner_role_oid::OID,
      CASE
        WHEN expected_routine.signature =
          'public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'
        THEN p_coordinator_role_oid::OID
        ELSE p_worker_role_oid::OID
      END,
      'EXECUTE', false
    FROM protected_routines AS expected_routine
    WHERE p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')
      AND expected_routine.signature IN (
        'public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)',
        'public.identity_mail_delivery_worker_assert_v2(text,text)',
        'public.identity_initial_owner_mail_claim_v2(text,text,text,text)',
        'public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)',
        'public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)',
        'public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'
      )
  )
  SELECT EXISTS (
    SELECT 1
    FROM actual
    FULL OUTER JOIN expected
      ON expected.kind = actual.kind
     AND expected.identity = actual.identity
     AND expected.grantor_oid = actual.grantor_oid
     AND expected.grantee_oid = actual.grantee_oid
     AND expected.privilege = actual.privilege
     AND expected.grantable = actual.grantable
    WHERE actual.kind IS NULL OR expected.kind IS NULL
  )
  INTO protected_surface_acl_drift;

  IF protected_surface_acl_drift THEN
    RAISE EXCEPTION
      'Identity-mail duty-role protected surface has an unexpected principal'
      USING ERRCODE = '42501';
  END IF;

  -- The exact PG16 system PUBLIC baseline is version-pinned below.  Application
  -- objects are checked separately because APPLY intentionally removes their
  -- default PUBLIC authority while preserving only public-schema USAGE.
  WITH system_public_rows(kind, identity, grantor_name, privilege, grantable) AS (
    SELECT
      'SCHEMA', namespace.nspname::TEXT,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
    ) AS acl
    WHERE namespace.nspname IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND acl.grantee = 0::OID
    UNION ALL
    SELECT
      CASE WHEN relation.relkind = 'S'::"char" THEN 'SEQUENCE' ELSE 'RELATION' END,
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault(
          CASE WHEN relation.relkind = 'S'::"char"
            THEN 's'::"char" ELSE 'r'::"char" END,
          relation.relowner
        )
      )
    ) AS acl
    WHERE namespace.nspname IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND acl.grantee = 0::OID
    UNION ALL
    SELECT
      'ROUTINE',
      pg_catalog.format(
        '%I.%I(%s)', namespace.nspname, routine.proname,
        pg_catalog.pg_get_function_identity_arguments(routine.oid)
      ),
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
    ) AS acl
    WHERE namespace.nspname IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND acl.grantee = 0::OID
    UNION ALL
    SELECT
      'TYPE', pg_catalog.format('%I.%I', namespace.nspname, type_entry.typname),
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_type AS type_entry
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type_entry.typnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
    ) AS acl
    WHERE namespace.nspname IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND acl.grantee = 0::OID
    UNION ALL
    SELECT
      'LANGUAGE', language.lanname,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_language AS language
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(language.lanacl, pg_catalog.acldefault('l', language.lanowner))
    ) AS acl
    WHERE acl.grantee = 0::OID
    UNION ALL
    SELECT
      'PARAMETER', parameter.parname,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_parameter_acl AS parameter
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter.paracl) AS acl
    WHERE acl.grantee = 0::OID
    UNION ALL
    SELECT
      'FOREIGN_DATA_WRAPPER', wrapper.fdwname,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(wrapper.fdwacl, pg_catalog.acldefault('F', wrapper.fdwowner))
    ) AS acl
    WHERE acl.grantee = 0::OID
    UNION ALL
    SELECT
      'FOREIGN_SERVER', server.srvname,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_foreign_server AS server
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(server.srvacl, pg_catalog.acldefault('S', server.srvowner))
    ) AS acl
    WHERE acl.grantee = 0::OID
    UNION ALL
    SELECT
      'TABLESPACE', tablespace.spcname,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_tablespace AS tablespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        tablespace.spcacl,
        pg_catalog.acldefault('t', tablespace.spcowner)
      )
    ) AS acl
    WHERE acl.grantee = 0::OID
    UNION ALL
    SELECT
      'LARGE_OBJECT', large_object.oid::TEXT,
      pg_catalog.pg_get_userbyid(acl.grantor), acl.privilege_type,
      acl.is_grantable
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        large_object.lomacl,
        pg_catalog.acldefault('L', large_object.lomowner)
      )
    ) AS acl
    WHERE acl.grantee = 0::OID
  )
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_PUBLIC_ACL_BASELINE_PG16_V1'
          || E'\n'
          || COALESCE(
            pg_catalog.string_agg(
              kind || '|' || identity || '|' || grantor_name || '|'
                || privilege || '|' || grantable::TEXT,
              E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C",
                grantor_name COLLATE "C", privilege COLLATE "C",
                grantable
            ),
            ''
          )
          || E'\n',
        'UTF8'
      )
    ),
    'hex'
  )
  INTO observed_system_public_acl_digest
  FROM system_public_rows;

  IF observed_system_public_acl_digest IS DISTINCT FROM
       'ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117'
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role PG16 PUBLIC baseline drifted'
      USING ERRCODE = '42501';
  END IF;

  -- ROLLBACK is proven by the controller's exact before-image digest.  The
  -- other reasons must independently prove the bounded application PUBLIC
  -- surface because no epoch receipt is an authorization substitute.
  IF p_reason_code IN (
    'APPLY', 'ROTATE', 'EMERGENCY_CONTAINMENT', 'RUNTIME_COORDINATOR'
  ) THEN
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            database_entry.datacl,
            pg_catalog.acldefault('d', database_entry.datdba)
          )
        ) AS acl
        WHERE database_entry.oid = database_oid AND acl.grantee = 0::OID
      )
      OR (
        SELECT pg_catalog.count(*) IS DISTINCT FROM 1
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )
        ) AS acl
        WHERE namespace.nspname = 'public'
          AND acl.grantee = 0::OID
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )
        ) AS acl
        WHERE namespace.nspname = 'public'
          AND acl.grantee = 0::OID
          AND (
            acl.grantor <> namespace.nspowner
            OR acl.privilege_type <> 'USAGE'
            OR acl.is_grantable
          )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )
        ) AS acl
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname NOT IN ('information_schema', 'public')
          AND acl.grantee = 0::OID
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            relation.relacl,
            pg_catalog.acldefault(
              CASE WHEN relation.relkind = 'S'::"char"
                THEN 's'::"char" ELSE 'r'::"char" END,
              relation.relowner
            )
          )
        ) AS acl
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname <> 'information_schema'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND acl.grantee = 0::OID
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        INNER JOIN pg_catalog.pg_class AS relation
          ON relation.oid = attribute.attrelid
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname <> 'information_schema'
          AND attribute.attnum > 0 AND NOT attribute.attisdropped
          AND acl.grantee = 0::OID
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS routine
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = routine.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            routine.proacl,
            pg_catalog.acldefault('f', routine.proowner)
          )
        ) AS acl
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname <> 'information_schema'
          AND acl.grantee = 0::OID
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_type AS type_entry
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = type_entry.typnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            type_entry.typacl,
            pg_catalog.acldefault('T', type_entry.typowner)
          )
        ) AS acl
        WHERE namespace.nspname !~ '^pg_'
          AND namespace.nspname <> 'information_schema'
          AND acl.grantee = 0::OID
          AND (
            acl.privilege_type <> 'USAGE' OR acl.is_grantable
          )
      )
    INTO public_acl_drift;

    IF public_acl_drift THEN
      RAISE EXCEPTION 'Identity-mail duty-role application PUBLIC ACL drifted'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_IDENTITY_MAIL_DUTY_ROLE_LIVE_BOUNDARY_V1',
    'decision', 'COMPLIANT',
    'authorityScope', 'CURRENT_DATABASE_ONLY',
    'crossDatabaseAuthorityControlled', false,
    'futureCreatorDefaultPrivilegesControlled', false,
    'applicationRoleAllowlistBound', false,
    'productionApplyAuthorized', false,
    'definitionManifestDigest', observed_definition_manifest_digest,
    'directDutyAclDigest', observed_direct_duty_acl_digest,
    'systemPublicAclBaselineDigest', observed_system_public_acl_digest
  );
END;
$$;

CREATE FUNCTION public."identity_mail_duty_role_acl_epoch_append_v1"(
  p_payload_canonical_json TEXT,
  p_payload_digest TEXT,
  p_before_catalog_canonical_json TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  payload JSONB;
  current_epoch BIGINT;
  previous_record public."IdentityMailDutyRoleAclEpochV1"%ROWTYPE;
  database_oid BIGINT;
  observed_database_oid BIGINT;
  database_owner_oid BIGINT;
  deployment_role RECORD;
  owner_role RECORD;
  coordinator_role RECORD;
  worker_role RECORD;
  epoch_value BIGINT;
  operation_id TEXT;
  previous_epoch BIGINT;
  previous_payload_digest TEXT;
  catalog_contract TEXT;
  catalog_profile TEXT;
  catalog_digest TEXT;
  exact_grants_profile TEXT;
  exact_grants_digest TEXT;
  owner_surface_digest TEXT;
  database_name TEXT;
  database_identity_digest TEXT;
  deployment_marker_id TEXT;
  deployment_marker_digest TEXT;
  actual_context_digest TEXT;
  deployment_role_name TEXT;
  deployment_role_oid BIGINT;
  schema_owner_role_name TEXT;
  schema_owner_role_oid BIGINT;
  coordinator_role_name TEXT;
  coordinator_role_oid BIGINT;
  worker_role_name TEXT;
  worker_role_oid BIGINT;
  migration_count INTEGER;
  migration_head TEXT;
  migration_manifest_digest TEXT;
  application_contract TEXT;
  application_release_sha TEXT;
  application_artifact_sha256 TEXT;
  reason_code TEXT;
  apply_receipt_digest TEXT;
  before_catalog_digest TEXT;
  before_catalog_storage_profile TEXT;
  before_catalog JSONB;
  plan_digest TEXT;
  definition_manifest_digest TEXT;
  evidence_digest TEXT;
  observed_apply_receipt_digest TEXT;
  observed_evidence_digest TEXT;
  direct_duty_acl_digest TEXT;
  system_public_acl_baseline_digest TEXT;
  observed_direct_duty_acl_digest TEXT;
  observed_system_public_acl_baseline_digest TEXT;
  active_duty_role_session_count INTEGER;
  live_assertion JSONB;
  observed_migration_count INTEGER;
  observed_migration_head TEXT;
  observed_migration_manifest_digest TEXT;
  observed_head_checksum TEXT;
  observed_head_count INTEGER;
  unfinished_migration_count INTEGER;
  rolled_back_migration_count INTEGER;
  recorded_at TIMESTAMP(3) WITH TIME ZONE;
  recorded_transaction_id TEXT;
BEGIN
  IF p_payload_canonical_json IS NULL
     OR pg_catalog.octet_length(p_payload_canonical_json) NOT BETWEEN 2 AND 600000
     OR p_payload_canonical_json <> pg_catalog.btrim(
       p_payload_canonical_json COLLATE "C"
     )
     OR (p_payload_canonical_json COLLATE "C") ~ '[[:space:]]'
     OR p_payload_digest IS NULL
     OR (p_payload_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_payload_digest <> pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1'
             || E'\n' || p_payload_canonical_json || E'\n',
           'UTF8'
         )
       ),
       'hex'
     )
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch payload is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    payload := p_payload_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch payload is invalid'
      USING ERRCODE = '22023';
  END;

  IF pg_catalog.jsonb_typeof(payload) <> 'object'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(payload))
       IS DISTINCT FROM 39::BIGINT
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch payload shape is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    epoch_value := (payload->>'epoch')::BIGINT;
    operation_id := payload->>'operationId';
    previous_epoch := (payload->>'previousEpoch')::BIGINT;
    previous_payload_digest := payload->>'previousPayloadDigest';
    catalog_contract := payload->>'catalogContract';
    catalog_profile := payload->>'catalogProfile';
    catalog_digest := payload->>'catalogDigest';
    exact_grants_profile := payload->>'exactGrantsProfile';
    exact_grants_digest := payload->>'exactGrantsDigest';
    owner_surface_digest := payload->>'ownerSurfaceDigest';
    database_name := payload->>'databaseName';
    database_oid := (payload->>'databaseOid')::BIGINT;
    database_identity_digest := payload->>'databaseIdentityDigest';
    deployment_marker_id := payload->>'deploymentMarkerId';
    deployment_marker_digest := payload->>'deploymentMarkerDigest';
    actual_context_digest := payload->>'actualContextDigest';
    deployment_role_name := payload->>'deploymentRoleName';
    deployment_role_oid := (payload->>'deploymentRoleOid')::BIGINT;
    schema_owner_role_name := payload->>'schemaOwnerRoleName';
    schema_owner_role_oid := (payload->>'schemaOwnerRoleOid')::BIGINT;
    coordinator_role_name := payload->>'coordinatorRoleName';
    coordinator_role_oid := (payload->>'coordinatorRoleOid')::BIGINT;
    worker_role_name := payload->>'workerRoleName';
    worker_role_oid := (payload->>'workerRoleOid')::BIGINT;
    migration_count := (payload->>'migrationCount')::INTEGER;
    migration_head := payload->>'migrationHead';
    migration_manifest_digest := payload->>'migrationManifestDigest';
    application_contract := payload->>'applicationContract';
    application_release_sha := payload->>'applicationReleaseSha';
    application_artifact_sha256 := payload->>'applicationArtifactSha256';
    reason_code := payload->>'reasonCode';
    apply_receipt_digest := payload->>'applyReceiptDigest';
    before_catalog_digest := payload->>'beforeCatalogDigest';
    before_catalog_storage_profile :=
      payload->>'beforeCatalogStorageProfile';
    direct_duty_acl_digest := payload->>'directDutyAclDigest';
    system_public_acl_baseline_digest :=
      payload->>'systemPublicAclBaselineDigest';
    plan_digest := payload->>'planDigest';
    definition_manifest_digest := payload->>'definitionManifestDigest';
    evidence_digest := payload->>'evidenceDigest';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch payload scalar is invalid'
      USING ERRCODE = '22023';
  END;

  IF payload IS DISTINCT FROM pg_catalog.jsonb_build_object(
       'actualContextDigest', actual_context_digest,
       'applyReceiptDigest', apply_receipt_digest,
       'applicationArtifactSha256', application_artifact_sha256,
       'applicationContract', application_contract,
       'applicationReleaseSha', application_release_sha,
       'beforeCatalogDigest', before_catalog_digest,
       'beforeCatalogStorageProfile', before_catalog_storage_profile,
       'catalogContract', catalog_contract,
       'catalogDigest', catalog_digest,
       'catalogProfile', catalog_profile,
       'coordinatorRoleName', coordinator_role_name,
       'coordinatorRoleOid', coordinator_role_oid,
       'databaseIdentityDigest', database_identity_digest,
       'databaseName', database_name,
       'databaseOid', database_oid,
       'deploymentMarkerDigest', deployment_marker_digest,
       'deploymentMarkerId', deployment_marker_id,
       'deploymentRoleName', deployment_role_name,
       'deploymentRoleOid', deployment_role_oid,
       'definitionManifestDigest', definition_manifest_digest,
       'directDutyAclDigest', direct_duty_acl_digest,
       'epoch', epoch_value,
       'evidenceDigest', evidence_digest,
       'exactGrantsDigest', exact_grants_digest,
       'exactGrantsProfile', exact_grants_profile,
       'migrationCount', migration_count,
       'migrationHead', migration_head,
       'migrationManifestDigest', migration_manifest_digest,
       'operationId', operation_id,
       'ownerSurfaceDigest', owner_surface_digest,
       'planDigest', plan_digest,
       'previousEpoch', previous_epoch,
       'previousPayloadDigest', previous_payload_digest,
       'reasonCode', reason_code,
       'schemaOwnerRoleName', schema_owner_role_name,
       'schemaOwnerRoleOid', schema_owner_role_oid,
       'systemPublicAclBaselineDigest', system_public_acl_baseline_digest,
       'workerRoleName', worker_role_name,
       'workerRoleOid', worker_role_oid
     )
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch payload keys drifted'
      USING ERRCODE = '22023';
  END IF;

  -- APPLY/ROTATE must durably bind the exact normalized catalog that can
  -- restore the pre-operation state.  The canonical UTF-8 JSON is stored in
  -- the immutable TOASTed epoch sidecar, while the bounded outer payload
  -- carries only its exact storage profile.  Inactive epochs must carry
  -- neither a profile nor a replacement recovery image.
  IF reason_code IN ('APPLY', 'ROTATE') THEN
    IF before_catalog_storage_profile IS DISTINCT FROM
         'EPOCH_COLUMN_CANONICAL_JSON_V1'
       OR p_before_catalog_canonical_json IS NULL
       OR pg_catalog.octet_length(p_before_catalog_canonical_json)
         NOT BETWEEN 2 AND 4194304
    THEN
      RAISE EXCEPTION
        'Identity-mail duty-role recovery sidecar profile is invalid'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      before_catalog := p_before_catalog_canonical_json::JSONB;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION
        'Identity-mail duty-role recovery sidecar is not canonical JSON'
        USING ERRCODE = '22023';
    END;

    IF pg_catalog.jsonb_typeof(before_catalog) <> 'object'
       OR before_catalog IS DISTINCT FROM pg_catalog.jsonb_build_object(
         'database', before_catalog->'database',
         'databaseRoleSettings', before_catalog->'databaseRoleSettings',
         'defaultAcls', before_catalog->'defaultAcls',
         'definitionManifest', before_catalog->'definitionManifest',
         'definitionManifestDigest',
           before_catalog->'definitionManifestDigest',
         'directAuthorities', before_catalog->'directAuthorities',
         'dutyRoutines', before_catalog->'dutyRoutines',
         'effectivePrivileges', before_catalog->'effectivePrivileges',
         'memberships', before_catalog->'memberships',
         'objects', before_catalog->'objects',
         'profile', before_catalog->'profile',
         'publicRoutineAcls', before_catalog->'publicRoutineAcls',
         'roles', before_catalog->'roles',
         'roleSettings', before_catalog->'roleSettings',
         'schemaVersion', before_catalog->'schemaVersion',
         'supportColumnBindings', before_catalog->'supportColumnBindings',
         'systemPublicAclBaselineDigest',
           before_catalog->'systemPublicAclBaselineDigest',
         'unexpectedOwnedObjects', before_catalog->'unexpectedOwnedObjects',
         'userRoutineDefinitionCount',
           before_catalog->'userRoutineDefinitionCount',
         'userRoutineDefinitionDigest',
           before_catalog->'userRoutineDefinitionDigest'
       )
       OR before_catalog->>'schemaVersion' IS DISTINCT FROM '1'
       OR before_catalog->>'profile' IS DISTINCT FROM
         'IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1'
       OR before_catalog->>'systemPublicAclBaselineDigest' IS DISTINCT FROM
         'ad50619e4ea13c2923f089fa4e6ac003cb56da160a30e40d61359ac034097117'
       OR pg_catalog.jsonb_typeof(
         before_catalog->'userRoutineDefinitionCount'
       ) IS DISTINCT FROM 'number'
       OR before_catalog->>'userRoutineDefinitionCount' !~
         '^(0|[1-9][0-9]{0,15})$'
       OR (before_catalog->>'userRoutineDefinitionCount')::NUMERIC >
         9007199254740991
       OR pg_catalog.jsonb_typeof(
         before_catalog->'userRoutineDefinitionDigest'
       ) IS DISTINCT FROM 'string'
       OR before_catalog->>'userRoutineDefinitionDigest' !~
         '^[0-9a-f]{64}$'
       OR pg_catalog.encode(
         pg_catalog.sha256(
           pg_catalog.convert_to(
             'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'
               || E'\n' || p_before_catalog_canonical_json || E'\n',
             'UTF8'
           )
         ),
         'hex'
       ) IS DISTINCT FROM before_catalog_digest
    THEN
      RAISE EXCEPTION
        'Identity-mail duty-role recovery sidecar is not canonical'
        USING ERRCODE = '22023';
    END IF;
  ELSIF before_catalog_storage_profile IS NOT NULL
     OR p_before_catalog_canonical_json IS NOT NULL
  THEN
    RAISE EXCEPTION
      'Inactive ACL epochs require a null recovery sidecar'
      USING ERRCODE = '22023';
  END IF;

  current_epoch := public."identity_mail_duty_role_acl_lock_v1"();

  IF epoch_value IS DISTINCT FROM current_epoch + 1 THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch compare-and-swap failed'
      USING ERRCODE = '40001';
  END IF;

  IF current_epoch = 0 THEN
    IF previous_epoch IS NOT NULL OR previous_payload_digest IS NOT NULL THEN
      RAISE EXCEPTION 'Identity-mail duty-role first ACL epoch predecessor is invalid'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT epoch.*
    INTO previous_record
    FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch
    WHERE epoch."epoch" = current_epoch
    FOR SHARE OF epoch;

    IF NOT FOUND
       OR previous_epoch IS DISTINCT FROM previous_record."epoch"
       OR previous_payload_digest IS DISTINCT FROM
         previous_record."payloadDigest"::TEXT
    THEN
      RAISE EXCEPTION 'Identity-mail duty-role ACL epoch predecessor is stale'
      USING ERRCODE = '40001';
    END IF;
  END IF;

  IF reason_code IN ('ROLLBACK', 'EMERGENCY_CONTAINMENT')
     AND (
       current_epoch = 0
       OR exact_grants_profile IS DISTINCT FROM
         previous_record."exactGrantsProfile"::TEXT
        OR exact_grants_digest IS DISTINCT FROM
          previous_record."exactGrantsDigest"::TEXT
        OR apply_receipt_digest IS DISTINCT FROM
          previous_record."applyReceiptDigest"::TEXT
      )
  THEN
    RAISE EXCEPTION
      'Inactive ACL epochs must carry forward the last authorized grants provenance'
      USING ERRCODE = '22023';
  END IF;

  SELECT database_entry.oid::BIGINT, database_entry.datdba::BIGINT
  INTO observed_database_oid, database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  IF database_name IS DISTINCT FROM pg_catalog.current_database()
     OR observed_database_oid IS DISTINCT FROM database_oid
     OR database_owner_oid IS DISTINCT FROM deployment_role_oid
     OR catalog_contract IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'
     OR catalog_profile IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_ROLE_RUNTIME_BOUNDARY_PG16_V1'
     OR exact_grants_profile IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
     OR migration_count IS DISTINCT FROM 186
     OR migration_head IS DISTINCT FROM
       '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
     OR application_contract IS DISTINCT FROM
       'IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2'
     OR reason_code NOT IN (
       'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."SharedBetaRuntimeReleaseMarker" AS marker
        WHERE marker."id" = deployment_marker_id
          AND marker."payloadDigest" = deployment_marker_digest
          AND marker."databaseIdentityDigest" = database_identity_digest
          AND marker."actualContextDigest" = actual_context_digest
          AND marker."schemaHead" = migration_head
          AND marker."migrationCount" = migration_count
          AND marker."migrationManifestDigest" = migration_manifest_digest
          AND marker."coordinatorRoleName" = coordinator_role_name
          AND marker."coordinatorRoleOid" = coordinator_role_oid
      )
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch context is invalid'
      USING ERRCODE = '55000';
  END IF;

  SELECT role_entry.* INTO deployment_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = deployment_role_name
    AND role_entry.oid::BIGINT = deployment_role_oid;
  SELECT role_entry.* INTO owner_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = schema_owner_role_name
    AND role_entry.oid::BIGINT = schema_owner_role_oid;
  SELECT role_entry.* INTO coordinator_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = coordinator_role_name
    AND role_entry.oid::BIGINT = coordinator_role_oid;
  SELECT role_entry.* INTO worker_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = worker_role_name
    AND role_entry.oid::BIGINT = worker_role_oid;

  IF deployment_role.oid IS NULL OR owner_role.oid IS NULL
     OR coordinator_role.oid IS NULL OR worker_role.oid IS NULL
     OR deployment_role.rolname IS DISTINCT FROM session_user
     OR NOT deployment_role.rolsuper
     OR database_owner_oid IS DISTINCT FROM deployment_role.oid::BIGINT
     OR (
       reason_code IN ('APPLY', 'ROTATE')
       AND current_user IS DISTINCT FROM schema_owner_role_name
     )
     OR (
       reason_code = 'ROLLBACK'
       AND current_user IS DISTINCT FROM deployment_role_name
     )
     OR (
       reason_code = 'EMERGENCY_CONTAINMENT'
       AND current_user NOT IN (deployment_role_name, schema_owner_role_name)
     )
     OR owner_role.rolcanlogin OR owner_role.rolinherit OR owner_role.rolsuper
     OR owner_role.rolcreaterole OR owner_role.rolcreatedb
     OR owner_role.rolreplication OR owner_role.rolbypassrls
     OR coordinator_role.rolinherit
     OR coordinator_role.rolsuper OR coordinator_role.rolcreaterole
     OR coordinator_role.rolcreatedb OR coordinator_role.rolreplication
     OR coordinator_role.rolbypassrls
     OR worker_role.rolinherit
     OR worker_role.rolsuper OR worker_role.rolcreaterole
     OR worker_role.rolcreatedb OR worker_role.rolreplication
     OR worker_role.rolbypassrls
     OR (
       reason_code = 'EMERGENCY_CONTAINMENT'
       AND (coordinator_role.rolcanlogin OR worker_role.rolcanlogin)
     )
     OR (
       reason_code IN ('APPLY', 'ROTATE')
       AND (
         NOT coordinator_role.rolcanlogin OR NOT worker_role.rolcanlogin
       )
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member IN (
         owner_role.oid, coordinator_role.oid, worker_role.oid
       ) OR membership.roleid IN (
         owner_role.oid, coordinator_role.oid, worker_role.oid
       )
     )
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch roles are invalid'
      USING ERRCODE = '42501';
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
    ),
    pg_catalog.max(migration."checksum") FILTER (
      WHERE migration."migration_name" =
        '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    ),
    pg_catalog.count(*) FILTER (
      WHERE migration."migration_name" =
        '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    )::INTEGER
  INTO
    observed_migration_count,
    observed_migration_head,
    observed_migration_manifest_digest,
    observed_head_checksum,
    observed_head_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE migration."finished_at" IS NULL
        AND migration."rolled_back_at" IS NULL
    )::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE migration."rolled_back_at" IS NOT NULL
    )::INTEGER
  INTO unfinished_migration_count, rolled_back_migration_count
  FROM public."_prisma_migrations" AS migration;

  IF observed_migration_count IS DISTINCT FROM migration_count
     OR observed_migration_head IS DISTINCT FROM migration_head
     OR observed_migration_manifest_digest IS DISTINCT FROM
       migration_manifest_digest
     OR observed_head_count IS DISTINCT FROM 1
     OR observed_head_checksum IS NULL
     OR (observed_head_checksum COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR unfinished_migration_count IS DISTINCT FROM 0
     OR rolled_back_migration_count IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role ACL epoch migration head is not ready'
      USING ERRCODE = '55000';
  END IF;

  live_assertion := public."identity_mail_duty_role_live_assert_v1"(
    deployment_role_oid,
    schema_owner_role_oid,
    coordinator_role_oid,
    worker_role_oid,
    reason_code,
    definition_manifest_digest
  );

  observed_direct_duty_acl_digest := live_assertion->>'directDutyAclDigest';
  observed_system_public_acl_baseline_digest :=
    live_assertion->>'systemPublicAclBaselineDigest';

  IF live_assertion->>'decision' IS DISTINCT FROM 'COMPLIANT'
     OR live_assertion->>'authorityScope' IS DISTINCT FROM
       'CURRENT_DATABASE_ONLY'
     OR (live_assertion->>'crossDatabaseAuthorityControlled')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'futureCreatorDefaultPrivilegesControlled')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'applicationRoleAllowlistBound')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'productionApplyAuthorized')::BOOLEAN IS DISTINCT FROM
       false
     OR live_assertion->>'definitionManifestDigest' IS DISTINCT FROM
       definition_manifest_digest
     OR observed_direct_duty_acl_digest IS NULL
     OR (observed_direct_duty_acl_digest COLLATE "C") !~
       '^[0-9a-f]{64}$'
     OR observed_system_public_acl_baseline_digest IS NULL
     OR (observed_system_public_acl_baseline_digest COLLATE "C") !~
       '^[0-9a-f]{64}$'
     OR direct_duty_acl_digest IS DISTINCT FROM
       observed_direct_duty_acl_digest
     OR system_public_acl_baseline_digest IS DISTINCT FROM
       observed_system_public_acl_baseline_digest
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role live assertion receipt drifted'
      USING ERRCODE = '55000';
  END IF;

  IF apply_receipt_digest IS NULL
     OR before_catalog_digest IS NULL
     OR direct_duty_acl_digest IS NULL
     OR system_public_acl_baseline_digest IS NULL
     OR plan_digest IS NULL
     OR definition_manifest_digest IS NULL
     OR evidence_digest IS NULL
     OR (apply_receipt_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR (before_catalog_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR (direct_duty_acl_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR (system_public_acl_baseline_digest COLLATE "C") !~
       '^[0-9a-f]{64}$'
     OR (plan_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR (definition_manifest_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR (evidence_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity-mail duty-role operation evidence is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF reason_code IN ('APPLY', 'ROTATE') THEN
    observed_apply_receipt_digest := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_APPLY_RECEIPT_CURRENT186_V1'
            || E'\n' || operation_id
            || E'\n' || reason_code
            || E'\n' || before_catalog_digest
            || E'\n' || plan_digest
            || E'\n' || catalog_digest
            || E'\n' || exact_grants_digest
            || E'\n' || owner_surface_digest
            || E'\n' || definition_manifest_digest
            || E'\n' || database_identity_digest
            || E'\n' || deployment_marker_digest
            || E'\n' || actual_context_digest
            || E'\n' || migration_manifest_digest
            || E'\n' || application_release_sha
            || E'\n' || application_artifact_sha256 || E'\n',
          'UTF8'
        )
      ),
      'hex'
    );

    IF apply_receipt_digest IS DISTINCT FROM observed_apply_receipt_digest THEN
      RAISE EXCEPTION 'Identity-mail duty-role apply receipt digest drifted'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  observed_evidence_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_REHEARSAL_EVIDENCE_CURRENT186_V1'
          || E'\n' || operation_id
          || E'\n' || epoch_value::TEXT
          || E'\n' || COALESCE(
            previous_payload_digest, pg_catalog.repeat('0', 64)
          )
          || E'\n' || reason_code
          || E'\n' || apply_receipt_digest
          || E'\n' || before_catalog_digest
          || E'\n' || plan_digest
          || E'\n' || definition_manifest_digest
          || E'\n' || catalog_digest
          || E'\n' || exact_grants_digest
          || E'\n' || owner_surface_digest
          || E'\n' || database_identity_digest
          || E'\n' || deployment_marker_digest
          || E'\n' || actual_context_digest
          || E'\n' || migration_manifest_digest
          || E'\n' || application_release_sha
          || E'\n' || application_artifact_sha256 || E'\n',
        'UTF8'
      )
    ),
    'hex'
  );

  IF evidence_digest IS DISTINCT FROM observed_evidence_digest THEN
    RAISE EXCEPTION 'Identity-mail duty-role rehearsal evidence digest drifted'
      USING ERRCODE = '22023';
  END IF;

  -- Recheck the emergency session barrier in this SECURITY INVOKER appender,
  -- called by the exact deployment/database owner after containment,
  -- immediately before the immutable epoch insert. The live assertion above
  -- is necessary but its receipt is not a substitute for this DB observation.
  IF reason_code = 'EMERGENCY_CONTAINMENT' THEN
    PERFORM pg_catalog.pg_stat_clear_snapshot();

    SELECT pg_catalog.count(*)::INTEGER
    INTO active_duty_role_session_count
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.usesysid IN (
      owner_role.oid, coordinator_role.oid, worker_role.oid
    );

    IF active_duty_role_session_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION
        'Identity-mail duty-role emergency epoch session barrier is not zero'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  recorded_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  recorded_transaction_id := pg_catalog.txid_current()::TEXT;

  INSERT INTO public."IdentityMailDutyRoleAclEpochV1" (
    "epoch", "operationId", "previousEpoch", "previousPayloadDigest",
    "catalogContract", "catalogProfile", "catalogDigest",
    "exactGrantsProfile", "exactGrantsDigest", "ownerSurfaceDigest",
    "databaseName", "databaseOid", "databaseIdentityDigest",
    "deploymentMarkerId", "deploymentMarkerDigest", "actualContextDigest",
    "deploymentRoleName", "deploymentRoleOid",
    "schemaOwnerRoleName", "schemaOwnerRoleOid", "coordinatorRoleName",
    "coordinatorRoleOid", "workerRoleName", "workerRoleOid",
    "migrationCount", "migrationHead", "migrationManifestDigest",
    "applicationContract", "applicationReleaseSha",
    "applicationArtifactSha256", "reasonCode", "applyReceiptDigest",
    "beforeCatalogDigest", "beforeCatalogCanonicalJson", "planDigest",
    "definitionManifestDigest",
    "evidenceDigest",
    "payloadCanonicalJson", "payloadDigest", "recordedAt",
    "recordedTransactionId"
  ) VALUES (
    epoch_value, operation_id, previous_epoch, previous_payload_digest,
    catalog_contract, catalog_profile, catalog_digest,
    exact_grants_profile, exact_grants_digest, owner_surface_digest,
    database_name, database_oid, database_identity_digest,
    deployment_marker_id, deployment_marker_digest, actual_context_digest,
    deployment_role_name, deployment_role_oid,
    schema_owner_role_name, schema_owner_role_oid, coordinator_role_name,
    coordinator_role_oid, worker_role_name, worker_role_oid,
    migration_count, migration_head, migration_manifest_digest,
    application_contract, application_release_sha,
    application_artifact_sha256, reason_code, apply_receipt_digest,
    before_catalog_digest, p_before_catalog_canonical_json, plan_digest,
    definition_manifest_digest,
    evidence_digest,
    p_payload_canonical_json, p_payload_digest, recorded_at,
    recorded_transaction_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'APPEND_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH',
    'decision', 'APPENDED',
    'candidateStatus', 'NOT_DEPLOYABLE',
    'authorization', false,
    'canMutate', false,
    'authorityScope', 'CURRENT_DATABASE_ONLY',
    'crossDatabaseAuthorityControlled', false,
    'futureCreatorDefaultPrivilegesControlled', false,
    'applicationRoleAllowlistBound', false,
    'productionApplyAuthorized', false,
    'epoch', epoch_value,
    'operationId', operation_id,
    'applyReceiptDigest', apply_receipt_digest,
    'beforeCatalogDigest', before_catalog_digest,
    'planDigest', plan_digest,
    'definitionManifestDigest', definition_manifest_digest,
    'directDutyAclDigest', direct_duty_acl_digest,
    'evidenceDigest', evidence_digest,
    'payloadDigest', p_payload_digest,
    'recordedAtEpochMs',
      (EXTRACT(EPOCH FROM recorded_at) * 1000)::BIGINT,
    'recordedTransactionId', recorded_transaction_id,
    'systemPublicAclBaselineDigest', system_public_acl_baseline_digest
  );
END;
$$;

-- Replace the CURRENT180 statement-dormant guards with row-bound driver
-- contexts.  The contexts are an anti-accident fence; authorization remains
-- the NOLOGIN owner plus absence of runtime relation DML.
DROP TRIGGER "IdentityMailEnrollmentEvent_dml_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollmentEvent";
DROP TRIGGER "IdentityMailEnrollmentEvent_truncate_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollmentEvent";
DROP TRIGGER "IdentityMailEnrollment_00_dormant_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollment";
DROP TRIGGER "IdentityMailDeliveryTenantEnrollment_row_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollment";
DROP TRIGGER "IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger"
ON public."IdentityMailDeliveryTenantEnrollment";
DROP FUNCTION public."identity_mail_tenant_enrollment_event_guard_v1"();
DROP FUNCTION public."identity_mail_tenant_enrollment_registry_dormant_guard_v1"();

CREATE FUNCTION public."identity_mail_tenant_enrollment_event_write_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  expected_receipt_digest TEXT;
BEGIN
  expected_receipt_digest := pg_catalog.current_setting(
    'leetplus.identity_mail_enrollment_driver_event_receipt_v2', true
  );
  IF expected_receipt_digest IS NULL
     OR (expected_receipt_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR NEW."receiptDigest" IS DISTINCT FROM expected_receipt_digest
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment event INSERT requires driver context'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public."identity_mail_tenant_enrollment_registry_write_guard_v2"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  expected_event_digest TEXT;
BEGIN
  expected_event_digest := pg_catalog.current_setting(
    'leetplus.identity_mail_enrollment_driver_event_digest_v2', true
  );
  IF expected_event_digest IS NULL
     OR (expected_event_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR NEW."lastEventDigest" IS DISTINCT FROM expected_event_digest
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment registry write requires driver context'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "IdentityMailEnrollmentEvent_insert_guard_v2_trigger"
BEFORE INSERT ON public."IdentityMailDeliveryTenantEnrollmentEvent"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_tenant_enrollment_event_write_guard_v2"();
CREATE TRIGGER "IdentityMailEnrollmentEvent_immutable_dml_v2_trigger"
BEFORE UPDATE OR DELETE ON public."IdentityMailDeliveryTenantEnrollmentEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();
CREATE TRIGGER "IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger"
BEFORE TRUNCATE ON public."IdentityMailDeliveryTenantEnrollmentEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();

CREATE TRIGGER "IdentityMailEnrollment_registry_write_guard_v2_trigger"
BEFORE INSERT OR UPDATE ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH ROW
EXECUTE FUNCTION public."identity_mail_tenant_enrollment_registry_write_guard_v2"();
CREATE TRIGGER "IdentityMailEnrollment_registry_immutable_delete_v2_trigger"
BEFORE DELETE ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();
CREATE TRIGGER "IdentityMailEnrollment_registry_immutable_truncate_v2_trigger"
BEFORE TRUNCATE ON public."IdentityMailDeliveryTenantEnrollment"
FOR EACH STATEMENT
EXECUTE FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"();

CREATE FUNCTION public."identity_mail_tenant_enrollment_drive_command_v2"(
  p_tenant_id TEXT,
  p_command_id TEXT,
  p_authorization_envelope_digest TEXT,
  p_manifest_payload_digest TEXT
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
  current_acl_epoch BIGINT;
  acl_record public."IdentityMailDutyRoleAclEpochV1"%ROWTYPE;
  command_record public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  manifest_record public."IdentityMailDutyRoleManifestEvidenceV2"%ROWTYPE;
  enrollment_record public."IdentityMailDeliveryTenantEnrollment"%ROWTYPE;
  referenced_command public."IdentityMailDeliveryTenantEnrollmentCommand"%ROWTYPE;
  terminal_event public."IdentityMailDeliveryTenantEnrollmentEvent"%ROWTYPE;
  prior_terminal_event public."IdentityMailDeliveryTenantEnrollmentEvent"%ROWTYPE;
  deployment_role RECORD;
  coordinator_role RECORD;
  owner_role RECORD;
  worker_role RECORD;
  live_assertion JSONB;
  direct_duty_acl_digest TEXT;
  system_public_acl_baseline_digest TEXT;
  database_oid BIGINT;
  database_owner_oid OID;
  observed_migration_count INTEGER;
  observed_migration_head TEXT;
  observed_migration_manifest_digest TEXT;
  observed_head_checksum TEXT;
  observed_head_count INTEGER;
  unfinished_migration_count INTEGER;
  rolled_back_migration_count INTEGER;
  observed_at TIMESTAMP(3) WITH TIME ZONE;
  event_at TIMESTAMP(3) WITH TIME ZONE;
  transaction_id TEXT;
  event_id TEXT;
  event_receipt JSONB;
  event_receipt_digest TEXT;
  event_digest TEXT;
  event_type TEXT;
  from_state TEXT;
  to_state TEXT;
  from_policy_revision INTEGER;
  to_policy_revision INTEGER;
  from_state_revision BIGINT;
  to_state_revision BIGINT;
  from_configuration_digest TEXT;
  to_configuration_digest TEXT;
  previous_event_digest TEXT;
  pending_secret_count BIGINT;
  pending_queue_count BIGINT;
  claimed_count BIGINT;
  is_continuation BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_command_id IS NULL OR (p_command_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_authorization_envelope_digest IS NULL
     OR (p_authorization_envelope_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR p_manifest_payload_digest IS NULL
     OR (p_manifest_payload_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver references are invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);
  current_acl_epoch := public."identity_mail_duty_role_acl_lock_v1"();
  IF current_acl_epoch < 1 THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver ACL epoch is absent'
      USING ERRCODE = '42501';
  END IF;

  SELECT epoch.* INTO acl_record
  FROM public."IdentityMailDutyRoleAclEpochV1" AS epoch
  WHERE epoch."epoch" = current_acl_epoch
  FOR SHARE OF epoch;

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
    ),
    pg_catalog.max(migration."checksum") FILTER (
      WHERE migration."migration_name" =
        '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    ),
    pg_catalog.count(*) FILTER (
      WHERE migration."migration_name" =
        '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    )::INTEGER
  INTO
    observed_migration_count,
    observed_migration_head,
    observed_migration_manifest_digest,
    observed_head_checksum,
    observed_head_count
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE migration."finished_at" IS NULL
        AND migration."rolled_back_at" IS NULL
    )::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE migration."rolled_back_at" IS NOT NULL
    )::INTEGER
  INTO unfinished_migration_count, rolled_back_migration_count
  FROM public."_prisma_migrations" AS migration;

  IF acl_record."epoch" IS NULL
     OR acl_record."reasonCode" NOT IN ('APPLY', 'ROTATE')
     OR acl_record."exactGrantsProfile" IS DISTINCT FROM
       'IDENTITY_MAIL_DUTY_GRANTS_PG16_V1'
     OR acl_record."migrationCount" IS DISTINCT FROM 186
     OR acl_record."migrationHead" IS DISTINCT FROM
       '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
     OR observed_migration_count IS DISTINCT FROM acl_record."migrationCount"
     OR observed_migration_head IS DISTINCT FROM acl_record."migrationHead"
     OR observed_migration_manifest_digest IS DISTINCT FROM
       acl_record."migrationManifestDigest"
     OR observed_head_count IS DISTINCT FROM 1
     OR observed_head_checksum IS NULL
     OR (observed_head_checksum COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR unfinished_migration_count IS DISTINCT FROM 0
     OR rolled_back_migration_count IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver migration stack drifted'
      USING ERRCODE = '55000';
  END IF;

  SELECT command.* INTO command_record
  FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS command
  WHERE command."tenantId" = tenant_id
    AND command."id" = p_command_id
    AND command."authorizationEnvelopeDigest" =
      p_authorization_envelope_digest
    AND command."dutyManifestPayloadDigest" = p_manifest_payload_digest
  FOR SHARE OF command;

  SELECT manifest.* INTO manifest_record
  FROM public."IdentityMailDutyRoleManifestEvidenceV2" AS manifest
  WHERE manifest."payloadDigest" = p_manifest_payload_digest
  FOR SHARE OF manifest;

  IF command_record."id" IS NULL OR manifest_record."payloadDigest" IS NULL
     OR command_record."dutyManifestPayloadDigest" IS DISTINCT FROM
       manifest_record."payloadDigest"
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver evidence is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT database_entry.oid::BIGINT, database_entry.datdba
  INTO database_oid, database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();
  SELECT role_entry.* INTO deployment_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = acl_record."deploymentRoleName"
    AND role_entry.oid::BIGINT = acl_record."deploymentRoleOid";
  SELECT role_entry.* INTO coordinator_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = session_user
    AND role_entry.oid::BIGINT = acl_record."coordinatorRoleOid";
  SELECT role_entry.* INTO owner_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = current_user
    AND role_entry.oid::BIGINT = acl_record."schemaOwnerRoleOid";
  SELECT role_entry.* INTO worker_role
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = acl_record."workerRoleName"
    AND role_entry.oid::BIGINT = acl_record."workerRoleOid";

  IF acl_record."databaseName" IS DISTINCT FROM pg_catalog.current_database()
     OR acl_record."databaseOid" IS DISTINCT FROM database_oid
     OR deployment_role.oid IS NULL
     OR deployment_role.rolsuper IS DISTINCT FROM true
     OR database_owner_oid IS DISTINCT FROM deployment_role.oid
     OR acl_record."databaseIdentityDigest" IS DISTINCT FROM
       command_record."databaseIdentityDigest"
     OR acl_record."deploymentMarkerId" IS DISTINCT FROM
       command_record."deploymentMarkerId"
     OR acl_record."deploymentMarkerDigest" IS DISTINCT FROM
       command_record."deploymentMarkerDigest"
     OR acl_record."actualContextDigest" IS DISTINCT FROM
       command_record."actualContextDigest"
     OR acl_record."schemaOwnerRoleName" IS DISTINCT FROM
       'identity_mail_schema_owner'
     OR acl_record."schemaOwnerRoleName" IS DISTINCT FROM current_user
     OR acl_record."coordinatorRoleName" IS DISTINCT FROM session_user
     OR acl_record."coordinatorRoleName" IS DISTINCT FROM
       'identity_mail_enrollment_coordinator'
     OR acl_record."coordinatorRoleName" IS DISTINCT FROM
       command_record."dutyCoordinatorRoleName"
     OR acl_record."coordinatorRoleOid" IS DISTINCT FROM
       command_record."dutyCoordinatorRoleOid"
     OR acl_record."workerRoleName" IS DISTINCT FROM
       command_record."dutyWorkerRoleName"
     OR acl_record."workerRoleName" IS DISTINCT FROM 'identity_mail_worker_v2'
     OR acl_record."workerRoleOid" IS DISTINCT FROM
       command_record."dutyWorkerRoleOid"
     OR acl_record."exactGrantsProfile" IS DISTINCT FROM
       command_record."dutyExactGrantsProfile"
     OR acl_record."exactGrantsDigest" IS DISTINCT FROM
       command_record."dutyExactGrantsDigest"
     OR acl_record."applicationContract" IS DISTINCT FROM
       command_record."dutyApplicationContract"
     OR acl_record."applicationReleaseSha" IS DISTINCT FROM
       command_record."dutyApplicationReleaseSha"
     OR acl_record."applicationArtifactSha256" IS DISTINCT FROM
       command_record."dutyApplicationArtifactSha256"
     OR command_record."expectedDatabaseName" IS DISTINCT FROM
       pg_catalog.current_database()
     OR command_record."expectedDatabaseOid" IS DISTINCT FROM database_oid
     OR owner_role.oid IS NULL OR coordinator_role.oid IS NULL
     OR worker_role.oid IS NULL OR database_owner_oid IS NULL
     OR session_user = current_user
     OR database_owner_oid IN (
       owner_role.oid, coordinator_role.oid, worker_role.oid
     )
     OR coordinator_role.rolcanlogin IS DISTINCT FROM true
     OR coordinator_role.rolinherit IS DISTINCT FROM false
     OR coordinator_role.rolsuper IS DISTINCT FROM false
     OR coordinator_role.rolcreaterole IS DISTINCT FROM false
     OR coordinator_role.rolcreatedb IS DISTINCT FROM false
     OR coordinator_role.rolreplication IS DISTINCT FROM false
     OR coordinator_role.rolbypassrls IS DISTINCT FROM false
     OR coordinator_role.rolconnlimit IS DISTINCT FROM -1
     OR coordinator_role.rolvaliduntil IS NOT NULL
     OR worker_role.rolcanlogin IS DISTINCT FROM true
     OR worker_role.rolinherit IS DISTINCT FROM false
     OR worker_role.rolsuper IS DISTINCT FROM false
     OR worker_role.rolcreaterole IS DISTINCT FROM false
     OR worker_role.rolcreatedb IS DISTINCT FROM false
     OR worker_role.rolreplication IS DISTINCT FROM false
     OR worker_role.rolbypassrls IS DISTINCT FROM false
     OR worker_role.rolconnlimit IS DISTINCT FROM -1
     OR worker_role.rolvaliduntil IS NOT NULL
     OR owner_role.rolcanlogin IS DISTINCT FROM false
     OR owner_role.rolinherit IS DISTINCT FROM false
     OR owner_role.rolsuper IS DISTINCT FROM false
     OR owner_role.rolcreaterole IS DISTINCT FROM false
     OR owner_role.rolcreatedb IS DISTINCT FROM false
     OR owner_role.rolreplication IS DISTINCT FROM false
     OR owner_role.rolbypassrls IS DISTINCT FROM false
     OR owner_role.rolconnlimit IS DISTINCT FROM -1
     OR owner_role.rolvaliduntil IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member IN (
         owner_role.oid, coordinator_role.oid, worker_role.oid
       )
          OR membership.roleid IN (
            owner_role.oid, coordinator_role.oid, worker_role.oid
          )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_db_role_setting AS setting
       WHERE setting.setrole IN (
         owner_role.oid, coordinator_role.oid, worker_role.oid
       )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_default_acl AS default_acl
       WHERE default_acl.defaclrole IN (
         owner_role.oid, coordinator_role.oid, worker_role.oid
       )
     )
     OR EXISTS (
       WITH runtime_owned(owner_oid) AS (
         SELECT database_entry.datdba
         FROM pg_catalog.pg_database AS database_entry
         WHERE database_entry.oid = database_oid::OID
         UNION ALL SELECT namespace.nspowner
         FROM pg_catalog.pg_namespace AS namespace
         UNION ALL SELECT relation.relowner
         FROM pg_catalog.pg_class AS relation
         UNION ALL SELECT routine.proowner
         FROM pg_catalog.pg_proc AS routine
         UNION ALL SELECT type_entry.typowner
         FROM pg_catalog.pg_type AS type_entry
         UNION ALL SELECT language.lanowner
         FROM pg_catalog.pg_language AS language
         UNION ALL SELECT wrapper.fdwowner
         FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
         UNION ALL SELECT server.srvowner
         FROM pg_catalog.pg_foreign_server AS server
         UNION ALL SELECT tablespace.spcowner
         FROM pg_catalog.pg_tablespace AS tablespace
         UNION ALL SELECT large_object.lomowner
         FROM pg_catalog.pg_largeobject_metadata AS large_object
         UNION ALL SELECT extension.extowner
         FROM pg_catalog.pg_extension AS extension
         UNION ALL SELECT collation_entry.collowner
         FROM pg_catalog.pg_collation AS collation_entry
         UNION ALL SELECT conversion.conowner
         FROM pg_catalog.pg_conversion AS conversion
         UNION ALL SELECT operator_entry.oprowner
         FROM pg_catalog.pg_operator AS operator_entry
         UNION ALL SELECT operator_class.opcowner
         FROM pg_catalog.pg_opclass AS operator_class
         UNION ALL SELECT operator_family.opfowner
         FROM pg_catalog.pg_opfamily AS operator_family
         UNION ALL SELECT configuration.cfgowner
         FROM pg_catalog.pg_ts_config AS configuration
         UNION ALL SELECT dictionary.dictowner
         FROM pg_catalog.pg_ts_dict AS dictionary
         UNION ALL SELECT statistics.stxowner
         FROM pg_catalog.pg_statistic_ext AS statistics
         UNION ALL SELECT event_trigger.evtowner
         FROM pg_catalog.pg_event_trigger AS event_trigger
         UNION ALL SELECT publication.pubowner
         FROM pg_catalog.pg_publication AS publication
         UNION ALL SELECT subscription.subowner
         FROM pg_catalog.pg_subscription AS subscription
         UNION ALL SELECT mapping.umuser
         FROM pg_catalog.pg_user_mappings AS mapping
         WHERE mapping.umuser <> 0::OID
         UNION ALL SELECT prepared_owner.oid
         FROM pg_catalog.pg_prepared_xacts AS prepared
         INNER JOIN pg_catalog.pg_roles AS prepared_owner
           ON prepared_owner.rolname = prepared.owner
         WHERE prepared.database = pg_catalog.current_database()
       )
       SELECT 1
       FROM runtime_owned
       WHERE runtime_owned.owner_oid IN (
         coordinator_role.oid, worker_role.oid
       )
     )
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver live duty-role binding drifted'
      USING ERRCODE = '42501';
  END IF;

  live_assertion := public."identity_mail_duty_role_live_assert_v1"(
    acl_record."deploymentRoleOid",
    acl_record."schemaOwnerRoleOid",
    acl_record."coordinatorRoleOid",
    acl_record."workerRoleOid",
    'RUNTIME_COORDINATOR',
    acl_record."definitionManifestDigest"::TEXT
  );
  direct_duty_acl_digest := live_assertion->>'directDutyAclDigest';
  system_public_acl_baseline_digest :=
    live_assertion->>'systemPublicAclBaselineDigest';

  IF live_assertion->>'decision' IS DISTINCT FROM 'COMPLIANT'
     OR live_assertion->>'authorityScope' IS DISTINCT FROM
       'CURRENT_DATABASE_ONLY'
     OR (live_assertion->>'crossDatabaseAuthorityControlled')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'futureCreatorDefaultPrivilegesControlled')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'applicationRoleAllowlistBound')::BOOLEAN
       IS DISTINCT FROM false
     OR (live_assertion->>'productionApplyAuthorized')::BOOLEAN IS DISTINCT FROM
       false
     OR live_assertion->>'definitionManifestDigest' IS DISTINCT FROM
       acl_record."definitionManifestDigest"::TEXT
     OR direct_duty_acl_digest IS NULL
     OR (direct_duty_acl_digest COLLATE "C") !~ '^[0-9a-f]{64}$'
     OR system_public_acl_baseline_digest IS NULL
     OR (system_public_acl_baseline_digest COLLATE "C") !~
       '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver live assertion drifted'
      USING ERRCODE = '55000';
  END IF;

  -- The epoch is provenance, not a substitute for a fresh authorization
  -- boundary.  Re-read the bounded ownership surface while the global ACL lock
  -- is held so direct catalog drift without an epoch bump fails closed.
  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_namespace AS namespace
       WHERE namespace.nspname = 'public'
         AND namespace.nspowner = owner_role.oid
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind = 'r'::"char"
         AND relation.relowner = owner_role.oid
         AND relation.relname IN (
           'IdentityMailDeliveryTenantEnrollmentCommand',
           'IdentityMailDeliveryTenantEnrollmentEvent',
           'IdentityMailDutyRoleAclEpochV1',
           'IdentityMailDutyRoleManifestEvidenceV2',
           'IdentityMailDutyRoleManifestRevocationV2'
         )
     ) IS DISTINCT FROM 5::BIGINT
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind = 'r'::"char"
         AND relation.relowner = database_owner_oid
         AND relation.relname IN (
           'IdentityMailDeliveryEvent',
           'IdentityMailDeliveryTenantEnrollment',
           'IdentityMailOutbox',
           'IdentityEmailClaim',
           'SharedBetaRuntimeReleaseMarker',
           'Tenant',
           'UserInvite',
           '_prisma_migrations'
         )
     ) IS DISTINCT FROM 8::BIGINT
     OR (
       SELECT pg_catalog.count(*)
       FROM (
         VALUES
           ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'),
           ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'),
           ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'),
           ('public.identity_mail_delivery_event_append_v2()'),
           ('public.identity_mail_delivery_worker_assert_v2(text,text)'),
           ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'),
           ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'),
            ('public.identity_mail_duty_role_acl_lock_v1()'),
            ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'),
            ('public.identity_mail_evidence_immutable_guard_v2()'),
           ('public.identity_mail_evidence_import_insert_guard_v2()'),
           ('public.identity_mail_manifest_revocation_lock_v2()'),
           ('public.identity_mail_outbox_delivery_guard_v2()'),
           ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'),
           ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'),
           ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'),
           ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'),
           ('public.identity_mail_tenant_lock_v1(text)'),
           ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'),
           ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'),
           ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'),
           ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)')
       ) AS expected(signature)
       INNER JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
       WHERE routine.proowner = owner_role.oid
     ) IS DISTINCT FROM 22::BIGINT
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_namespace AS namespace
       WHERE namespace.nspowner = owner_role.oid
         AND namespace.nspname <> 'public'
         AND namespace.nspname !~ '^pg_'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE relation.relowner = owner_role.oid
         AND namespace.nspname !~ '^pg_'
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
         AND NOT (
           namespace.nspname = 'public'
           AND relation.relkind = 'r'::"char"
           AND relation.relname IN (
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'IdentityMailDutyRoleAclEpochV1',
             'IdentityMailDutyRoleManifestEvidenceV2',
             'IdentityMailDutyRoleManifestRevocationV2'
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = routine.pronamespace
       WHERE routine.proowner = owner_role.oid
         AND namespace.nspname !~ '^pg_'
         AND routine.oid NOT IN (
           SELECT pg_catalog.to_regprocedure(expected.signature)
           FROM (
             VALUES
               ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'),
               ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'),
               ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'),
               ('public.identity_mail_delivery_event_append_v2()'),
               ('public.identity_mail_delivery_worker_assert_v2(text,text)'),
               ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'),
               ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'),
                ('public.identity_mail_duty_role_acl_lock_v1()'),
                ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'),
                ('public.identity_mail_evidence_immutable_guard_v2()'),
               ('public.identity_mail_evidence_import_insert_guard_v2()'),
               ('public.identity_mail_manifest_revocation_lock_v2()'),
               ('public.identity_mail_outbox_delivery_guard_v2()'),
               ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'),
               ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'),
               ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'),
               ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'),
               ('public.identity_mail_tenant_lock_v1(text)'),
               ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'),
               ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'),
               ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'),
               ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)')
           ) AS expected(signature)
         )
     )
     OR EXISTS (
       WITH
       protected_owner_relations(relation_name) AS (
         VALUES
           ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
           ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
           ('IdentityMailDutyRoleAclEpochV1'::TEXT),
           ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
           ('IdentityMailDutyRoleManifestRevocationV2'::TEXT)
       ),
       protected_owner_relation_oids(oid, reltype, reltoastrelid) AS (
         SELECT relation.oid, relation.reltype, relation.reltoastrelid
         FROM protected_owner_relations AS expected
         INNER JOIN pg_catalog.pg_class AS relation
           ON relation.relname = expected.relation_name
          AND relation.relkind IN ('r', 'p')
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
          AND namespace.nspname = 'public'
       ),
       protected_owner_toast_oids(oid) AS (
         SELECT relation.reltoastrelid
         FROM protected_owner_relation_oids AS relation
         WHERE relation.reltoastrelid <> 0::OID
       ),
       allowed_relation_oids(oid) AS (
         SELECT relation.oid FROM protected_owner_relation_oids AS relation
         UNION
         SELECT index_entry.indexrelid
         FROM pg_catalog.pg_index AS index_entry
         WHERE index_entry.indrelid IN (
           SELECT relation.oid FROM protected_owner_relation_oids AS relation
         )
         UNION
         SELECT toast.oid FROM protected_owner_toast_oids AS toast
         UNION
         SELECT index_entry.indexrelid
         FROM pg_catalog.pg_index AS index_entry
         WHERE index_entry.indrelid IN (
           SELECT toast.oid FROM protected_owner_toast_oids AS toast
         )
         UNION
         SELECT sequence.oid
         FROM pg_catalog.pg_class AS sequence
         INNER JOIN pg_catalog.pg_depend AS dependency
           ON dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.objid = sequence.oid
          AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.refobjid IN (
            SELECT relation.oid FROM protected_owner_relation_oids AS relation
          )
          AND dependency.deptype IN ('a'::"char", 'i'::"char")
         WHERE sequence.relkind = 'S'::"char"
       ),
       allowed_type_oids(oid) AS (
         SELECT row_type.oid
         FROM protected_owner_relation_oids AS relation
         INNER JOIN pg_catalog.pg_type AS row_type
           ON row_type.oid = relation.reltype
          AND row_type.typrelid = relation.oid
          AND row_type.typtype = 'c'::"char"
         UNION
         SELECT row_type.typarray
         FROM protected_owner_relation_oids AS relation
         INNER JOIN pg_catalog.pg_type AS row_type
           ON row_type.oid = relation.reltype
          AND row_type.typrelid = relation.oid
          AND row_type.typtype = 'c'::"char"
         WHERE row_type.typarray <> 0::OID
       ),
       allowed_routine_oids(oid) AS (
         SELECT pg_catalog.to_regprocedure(expected.signature)::OID
         FROM (
           VALUES
             ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
             ('public.identity_mail_delivery_event_append_v2()'::TEXT),
             ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
             ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
             ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
             ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
             ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
             ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
             ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
             ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
             ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
             ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
             ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
             ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
             ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
             ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
             ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
         ) AS expected(signature)
       ),
       owned(kind, object_oid, owner_oid) AS (
         SELECT 'DATABASE'::TEXT, database_entry.oid, database_entry.datdba
         FROM pg_catalog.pg_database AS database_entry
         WHERE database_entry.oid = database_oid::OID
         UNION ALL SELECT 'SCHEMA', namespace.oid, namespace.nspowner
         FROM pg_catalog.pg_namespace AS namespace
         UNION ALL SELECT 'RELATION', relation.oid, relation.relowner
         FROM pg_catalog.pg_class AS relation
         UNION ALL SELECT 'ROUTINE', routine.oid, routine.proowner
         FROM pg_catalog.pg_proc AS routine
         UNION ALL SELECT 'TYPE', type_entry.oid, type_entry.typowner
         FROM pg_catalog.pg_type AS type_entry
         UNION ALL SELECT 'LANGUAGE', language.oid, language.lanowner
         FROM pg_catalog.pg_language AS language
         UNION ALL SELECT 'FOREIGN_DATA_WRAPPER', wrapper.oid, wrapper.fdwowner
         FROM pg_catalog.pg_foreign_data_wrapper AS wrapper
         UNION ALL SELECT 'FOREIGN_SERVER', server.oid, server.srvowner
         FROM pg_catalog.pg_foreign_server AS server
         UNION ALL SELECT 'TABLESPACE', tablespace.oid, tablespace.spcowner
         FROM pg_catalog.pg_tablespace AS tablespace
         UNION ALL SELECT 'LARGE_OBJECT', large_object.oid, large_object.lomowner
         FROM pg_catalog.pg_largeobject_metadata AS large_object
         UNION ALL SELECT 'EXTENSION', extension.oid, extension.extowner
         FROM pg_catalog.pg_extension AS extension
         UNION ALL SELECT 'COLLATION', collation_entry.oid, collation_entry.collowner
         FROM pg_catalog.pg_collation AS collation_entry
         UNION ALL SELECT 'CONVERSION', conversion.oid, conversion.conowner
         FROM pg_catalog.pg_conversion AS conversion
         UNION ALL SELECT 'OPERATOR', operator_entry.oid, operator_entry.oprowner
         FROM pg_catalog.pg_operator AS operator_entry
         UNION ALL SELECT 'OPERATOR_CLASS', operator_class.oid, operator_class.opcowner
         FROM pg_catalog.pg_opclass AS operator_class
         UNION ALL SELECT 'OPERATOR_FAMILY', operator_family.oid, operator_family.opfowner
         FROM pg_catalog.pg_opfamily AS operator_family
         UNION ALL SELECT 'TEXT_SEARCH_CONFIGURATION', configuration.oid, configuration.cfgowner
         FROM pg_catalog.pg_ts_config AS configuration
         UNION ALL SELECT 'TEXT_SEARCH_DICTIONARY', dictionary.oid, dictionary.dictowner
         FROM pg_catalog.pg_ts_dict AS dictionary
         UNION ALL SELECT 'STATISTICS', statistics.oid, statistics.stxowner
         FROM pg_catalog.pg_statistic_ext AS statistics
         UNION ALL SELECT 'EVENT_TRIGGER', event_trigger.oid, event_trigger.evtowner
         FROM pg_catalog.pg_event_trigger AS event_trigger
         UNION ALL SELECT 'PUBLICATION', publication.oid, publication.pubowner
         FROM pg_catalog.pg_publication AS publication
         UNION ALL SELECT 'SUBSCRIPTION', subscription.oid, subscription.subowner
         FROM pg_catalog.pg_subscription AS subscription
         UNION ALL SELECT 'USER_MAPPING', mapping.umid, mapping.umuser
         FROM pg_catalog.pg_user_mappings AS mapping
         WHERE mapping.umuser <> 0::OID
         UNION ALL SELECT 'PREPARED_TRANSACTION', NULL::OID, prepared_owner.oid
         FROM pg_catalog.pg_prepared_xacts AS prepared
         INNER JOIN pg_catalog.pg_roles AS prepared_owner
           ON prepared_owner.rolname = prepared.owner
         WHERE prepared.database = pg_catalog.current_database()
       )
       SELECT 1
       FROM owned
       WHERE owned.owner_oid = owner_role.oid
         AND NOT (
           (owned.kind = 'SCHEMA'
             AND owned.object_oid = 'public'::pg_catalog.regnamespace::OID)
           OR (owned.kind = 'RELATION'
             AND owned.object_oid IN (SELECT allowed.oid FROM allowed_relation_oids AS allowed))
           OR (owned.kind = 'ROUTINE'
             AND owned.object_oid IN (SELECT allowed.oid FROM allowed_routine_oids AS allowed))
           OR (owned.kind = 'TYPE'
             AND owned.object_oid IN (SELECT allowed.oid FROM allowed_type_oids AS allowed))
         )
     )
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver owner surface drifted'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
       WITH
       expected_routines(signature, grantee_oid) AS (
         VALUES
           (
             'public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)'::TEXT,
             coordinator_role.oid
           ),
           (
             'public."identity_mail_delivery_worker_assert_v2"(text,text)'::TEXT,
             worker_role.oid
           ),
           (
             'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)'::TEXT,
             worker_role.oid
           ),
           (
             'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)'::TEXT,
             worker_role.oid
           ),
           (
             'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)'::TEXT,
             worker_role.oid
           ),
           (
             'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)'::TEXT,
             worker_role.oid
           )
       ),
       all_owner_routines(signature) AS (
         VALUES
           ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
           ('public.identity_mail_delivery_event_append_v2()'::TEXT),
           ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
           ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
           ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
            ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
            ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
            ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
           ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
           ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
           ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
           ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
           ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
           ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
           ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
           ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
           ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
       ),
       actual AS (
         SELECT
           'DATABASE'::TEXT AS object_kind,
           database_entry.datname::TEXT AS object_identity,
           privilege.grantor AS grantor_oid,
           privilege.grantee AS grantee_oid,
           privilege.privilege_type::TEXT AS privilege,
           privilege.is_grantable
         FROM pg_catalog.pg_database AS database_entry
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             database_entry.datacl,
             pg_catalog.acldefault('d', database_entry.datdba)
           )
         ) AS privilege
         WHERE database_entry.oid = database_oid::OID
           AND privilege.grantee IN (
             0::OID, owner_role.oid, coordinator_role.oid, worker_role.oid
           )
           AND privilege.grantee <> database_entry.datdba
         UNION ALL
         SELECT
           'SCHEMA', namespace.nspname, privilege.grantor,
           privilege.grantee, privilege.privilege_type, privilege.is_grantable
         FROM pg_catalog.pg_namespace AS namespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             namespace.nspacl,
             pg_catalog.acldefault('n', namespace.nspowner)
           )
         ) AS privilege
         WHERE namespace.nspname = 'public'
           AND privilege.grantee IN (
             0::OID, owner_role.oid, coordinator_role.oid, worker_role.oid
           )
           AND privilege.grantee <> namespace.nspowner
         UNION ALL
         SELECT
           'RELATION',
           pg_catalog.format(
             '%I."%s"', namespace.nspname,
             pg_catalog.replace(relation.relname, '"', '""')
           ),
           privilege.grantor, privilege.grantee, privilege.privilege_type,
           privilege.is_grantable
         FROM pg_catalog.pg_class AS relation
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             relation.relacl,
             pg_catalog.acldefault('r', relation.relowner)
           )
         ) AS privilege
         WHERE namespace.nspname = 'public'
           AND relation.relname IN (
             'IdentityMailDeliveryEvent',
             'IdentityMailDeliveryTenantEnrollment',
             'IdentityMailDeliveryTenantEnrollmentCommand',
             'IdentityMailDeliveryTenantEnrollmentEvent',
             'IdentityMailDutyRoleAclEpochV1',
             'IdentityMailDutyRoleManifestEvidenceV2',
             'IdentityMailDutyRoleManifestRevocationV2',
             'IdentityMailOutbox',
             '_prisma_migrations'
           )
           AND privilege.grantee IN (
             0::OID, owner_role.oid, coordinator_role.oid, worker_role.oid
           )
           AND privilege.grantee <> relation.relowner
         UNION ALL
         SELECT
           'ROUTINE',
           pg_catalog.format(
             '%I."%s"(%s)', namespace.nspname,
             pg_catalog.replace(routine.proname, '"', '""'),
             pg_catalog.replace(
               pg_catalog.oidvectortypes(routine.proargtypes), ', ', ','
             )
           ),
           privilege.grantor,
           privilege.grantee, privilege.privilege_type,
           privilege.is_grantable
         FROM all_owner_routines AS expected
         INNER JOIN pg_catalog.pg_proc AS routine
           ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = routine.pronamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           COALESCE(
             routine.proacl,
             pg_catalog.acldefault('f', routine.proowner)
           )
         ) AS privilege
         WHERE privilege.grantee IN (
             0::OID, owner_role.oid, coordinator_role.oid, worker_role.oid
           )
           AND privilege.grantee <> routine.proowner
       ),
       expected AS (
         SELECT
           'DATABASE'::TEXT AS object_kind,
           pg_catalog.current_database()::TEXT AS object_identity,
           database_owner_oid AS grantor_oid,
           expected_grantee.grantee_oid,
           'CONNECT'::TEXT AS privilege,
           false AS is_grantable
         FROM (
           VALUES (coordinator_role.oid), (worker_role.oid)
         ) AS expected_grantee(grantee_oid)
         UNION ALL
         SELECT 'SCHEMA', 'public', owner_role.oid, 0::OID, 'USAGE', false
         UNION ALL
         SELECT
           'RELATION', expected_relation.object_identity,
           database_owner_oid, owner_role.oid,
           expected_relation.privilege, false
         FROM (
           VALUES
             ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'INSERT'::TEXT),
             ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'SELECT'::TEXT),
             ('public."IdentityMailDeliveryTenantEnrollment"'::TEXT, 'UPDATE'::TEXT),
             ('public."IdentityMailOutbox"'::TEXT, 'SELECT'::TEXT),
             ('public."IdentityMailOutbox"'::TEXT, 'UPDATE'::TEXT),
             ('public."IdentityMailDeliveryEvent"'::TEXT, 'INSERT'::TEXT),
             ('public."IdentityMailDeliveryEvent"'::TEXT, 'SELECT'::TEXT),
             ('public."_prisma_migrations"'::TEXT, 'SELECT'::TEXT)
         ) AS expected_relation(object_identity, privilege)
         UNION ALL
         SELECT
           'ROUTINE', expected_routine.signature, owner_role.oid,
           expected_routine.grantee_oid, 'EXECUTE', false
         FROM expected_routines AS expected_routine
       )
       SELECT 1
       FROM actual
       FULL OUTER JOIN expected
         ON expected.object_kind = actual.object_kind
        AND expected.object_identity = actual.object_identity
        AND expected.grantor_oid = actual.grantor_oid
        AND expected.grantee_oid = actual.grantee_oid
        AND expected.privilege = actual.privilege
        AND expected.is_grantable = actual.is_grantable
       WHERE actual.object_kind IS NULL OR expected.object_kind IS NULL
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM (
         VALUES
           ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
           ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
           ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
           ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
       ) AS expected(signature)
       INNER JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
       INNER JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
       WHERE routine.proowner = owner_role.oid
         AND routine.prosecdef
         AND routine.provolatile = 'v'::"char"
         AND routine.proparallel = 'u'::"char"
         AND routine.prokind = 'f'::"char"
         AND routine.provariadic = 0::OID
         AND routine.pronargdefaults = 0
         AND routine.proargdefaults IS NULL
         AND routine.prorettype = 'jsonb'::pg_catalog.regtype
         AND routine.proconfig IS NOT DISTINCT FROM
           ARRAY['search_path=pg_catalog']::TEXT[]
         AND language.lanname = 'plpgsql'
     ) IS DISTINCT FROM 6::BIGINT
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver direct ACL drifted'
      USING ERRCODE = '42501';
  END IF;

  IF NOT pg_catalog.has_database_privilege(
       coordinator_role.oid, database_oid::OID, 'CONNECT'
     )
     OR NOT pg_catalog.has_database_privilege(
       worker_role.oid, database_oid::OID, 'CONNECT'
     )
     OR pg_catalog.has_database_privilege(
       coordinator_role.oid, database_oid::OID, 'CREATE'
     )
     OR pg_catalog.has_database_privilege(
       coordinator_role.oid, database_oid::OID, 'TEMPORARY'
     )
     OR pg_catalog.has_database_privilege(
       worker_role.oid, database_oid::OID, 'CREATE'
     )
     OR pg_catalog.has_database_privilege(
       worker_role.oid, database_oid::OID, 'TEMPORARY'
     )
     OR EXISTS (
       WITH
       duty_roles(role_oid) AS (
         VALUES (coordinator_role.oid), (worker_role.oid)
       ),
       actual AS (
         SELECT role.role_oid, namespace.oid AS namespace_oid,
           candidate.privilege
         FROM duty_roles AS role
         CROSS JOIN pg_catalog.pg_namespace AS namespace
         CROSS JOIN (VALUES ('USAGE'::TEXT), ('CREATE'::TEXT))
           AS candidate(privilege)
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_schema_privilege(
             role.role_oid, namespace.oid, candidate.privilege
           )
       ),
       expected AS (
         SELECT role.role_oid, namespace.oid AS namespace_oid,
           'USAGE'::TEXT AS privilege
         FROM duty_roles AS role
         CROSS JOIN pg_catalog.pg_namespace AS namespace
         WHERE namespace.nspname = 'public'
       )
       SELECT 1
       FROM actual
       FULL OUTER JOIN expected
         ON expected.role_oid = actual.role_oid
        AND expected.namespace_oid = actual.namespace_oid
        AND expected.privilege = actual.privilege
       WHERE actual.role_oid IS NULL OR expected.role_oid IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES (coordinator_role.oid), (worker_role.oid)
       ) AS role(role_oid)
       CROSS JOIN pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       CROSS JOIN (
         VALUES
           ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
           ('DELETE'::TEXT), ('TRUNCATE'::TEXT), ('REFERENCES'::TEXT),
           ('TRIGGER'::TEXT)
       ) AS candidate(privilege)
       WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
         AND pg_catalog.has_table_privilege(
           role.role_oid, relation.oid, candidate.privilege
         )
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES (coordinator_role.oid), (worker_role.oid)
       ) AS role(role_oid)
       CROSS JOIN pg_catalog.pg_class AS sequence
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = sequence.relnamespace
       CROSS JOIN (
         VALUES ('USAGE'::TEXT), ('SELECT'::TEXT), ('UPDATE'::TEXT)
       ) AS candidate(privilege)
       WHERE sequence.relkind = 'S'::"char"
         AND namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
         AND pg_catalog.has_sequence_privilege(
           role.role_oid, sequence.oid, candidate.privilege
         )
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES (coordinator_role.oid), (worker_role.oid)
       ) AS role(role_oid)
       CROSS JOIN pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       INNER JOIN pg_catalog.pg_attribute AS attribute
         ON attribute.attrelid = relation.oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
       CROSS JOIN (
         VALUES
           ('SELECT'::TEXT), ('INSERT'::TEXT), ('UPDATE'::TEXT),
           ('REFERENCES'::TEXT)
       ) AS candidate(privilege)
       WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND namespace.nspname !~ '^pg_'
         AND namespace.nspname <> 'information_schema'
         AND pg_catalog.has_column_privilege(
           role.role_oid, relation.oid, attribute.attnum,
           candidate.privilege
         )
     )
     OR EXISTS (
       WITH
       actual AS (
         SELECT role.role_oid, routine.oid AS routine_oid
         FROM (
           VALUES (coordinator_role.oid), (worker_role.oid)
         ) AS role(role_oid)
         CROSS JOIN pg_catalog.pg_proc AS routine
         INNER JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid = routine.pronamespace
         WHERE namespace.nspname !~ '^pg_'
           AND namespace.nspname <> 'information_schema'
           AND pg_catalog.has_function_privilege(
             role.role_oid, routine.oid, 'EXECUTE'
           )
       ),
       expected AS (
         SELECT coordinator_role.oid AS role_oid,
           pg_catalog.to_regprocedure(
             'public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'
           ) AS routine_oid
         UNION ALL
         SELECT worker_role.oid, pg_catalog.to_regprocedure(signature)
         FROM (
           VALUES
             ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
             ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
             ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
         ) AS worker_rpc(signature)
       )
       SELECT 1
       FROM actual
       FULL OUTER JOIN expected
         ON expected.role_oid = actual.role_oid
        AND expected.routine_oid = actual.routine_oid
       WHERE actual.role_oid IS NULL OR expected.role_oid IS NULL
     )
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver effective ACL drifted'
      USING ERRCODE = '42501';
  END IF;

  SELECT event.* INTO terminal_event
  FROM public."IdentityMailDeliveryTenantEnrollmentEvent" AS event
  WHERE event."tenantId" = tenant_id
    AND event."commandId" = command_record."id"
    AND event."eventType" IN ('ENABLED', 'ROTATED', 'DISABLED')
  ORDER BY event."eventSequence" DESC
  LIMIT 1;

  IF terminal_event."id" IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'DRIVE_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2',
      'decision', 'COMPLETED',
      'phase', 'TERMINAL_REPLAY',
      'candidateStatus', 'NOT_DEPLOYABLE',
      'authorization', true,
      'canMutate', true,
      'authorityScope', 'CURRENT_DATABASE_ONLY',
      'crossDatabaseAuthorityControlled', false,
      'futureCreatorDefaultPrivilegesControlled', false,
      'applicationRoleAllowlistBound', false,
      'productionApplyAuthorized', false,
      'tenantId', tenant_id,
      'commandId', command_record."id",
      'authorizationEnvelopeDigest', command_record."authorizationEnvelopeDigest",
      'manifestPayloadDigest', command_record."dutyManifestPayloadDigest",
      'eventDigest', terminal_event."eventDigest",
      'state', terminal_event."toState",
      'policyRevision', terminal_event."toPolicyRevision",
      'stateRevision', terminal_event."toStateRevision",
      'aclEpoch', current_acl_epoch,
      'definitionManifestDigest', acl_record."definitionManifestDigest",
      'directDutyAclDigest', direct_duty_acl_digest,
      'systemPublicAclBaselineDigest', system_public_acl_baseline_digest
    );
  END IF;

  SELECT enrollment.* INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  WHERE enrollment."tenantId" = tenant_id
  FOR UPDATE OF enrollment;

  is_continuation := FOUND
    AND enrollment_record."state" = 'DRAINING'
    AND enrollment_record."activeCommandId" = command_record."id";
  observed_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());

  IF NOT is_continuation AND (
       observed_at >= command_record."expiresAt"
       OR observed_at < manifest_record."issuedAt" - INTERVAL '1 minute'
       OR observed_at >= manifest_record."validUntil"
       OR EXISTS (
         SELECT 1
         FROM public."IdentityMailDutyRoleManifestRevocationV2" AS revocation
         WHERE revocation."manifestPayloadDigest" = manifest_record."payloadDigest"
       )
     )
  THEN
    RAISE EXCEPTION 'Identity-mail enrollment driver evidence is stale or revoked'
      USING ERRCODE = '42501';
  END IF;

  IF NOT is_continuation THEN
    IF command_record."expectedState" = 'ABSENT' THEN
      IF enrollment_record."tenantId" IS NOT NULL THEN
        RAISE EXCEPTION 'Identity-mail enrollment expected ABSENT state drifted'
          USING ERRCODE = '40001';
      END IF;
    ELSIF enrollment_record."tenantId" IS NULL
       OR enrollment_record."state" IS DISTINCT FROM command_record."expectedState"
       OR enrollment_record."policyRevision" IS DISTINCT FROM
         command_record."expectedPolicyRevision"
       OR enrollment_record."stateRevision" IS DISTINCT FROM
         command_record."stateRevisionBefore"
       OR enrollment_record."workerRoleName" IS DISTINCT FROM
         command_record."previousWorkerRoleName"
       OR enrollment_record."workerRoleOid" IS DISTINCT FROM
         command_record."previousWorkerRoleOid"
       OR enrollment_record."providerAuthorityDigest" IS DISTINCT FROM
         command_record."previousProviderAuthorityDigest"
       OR enrollment_record."maxAttempts" IS DISTINCT FROM
         command_record."previousMaxAttempts"
       OR enrollment_record."leaseSeconds" IS DISTINCT FROM
         command_record."previousLeaseSeconds"
       OR enrollment_record."acknowledgeSeconds" IS DISTINCT FROM
         command_record."previousAcknowledgeSeconds"
       OR enrollment_record."baseRetrySeconds" IS DISTINCT FROM
         command_record."previousBaseRetrySeconds"
       OR enrollment_record."maxRetrySeconds" IS DISTINCT FROM
         command_record."previousMaxRetrySeconds"
       OR enrollment_record."currentConfigurationDigest" IS DISTINCT FROM
         command_record."previousConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity-mail enrollment command before-image drifted'
        USING ERRCODE = '40001';
    END IF;

    IF command_record."intent" = 'ROLLBACK' THEN
      SELECT source.* INTO referenced_command
      FROM public."IdentityMailDeliveryTenantEnrollmentCommand" AS source
      WHERE source."tenantId" = tenant_id
        AND source."id" = command_record."rollbackOfCommandId"
      FOR SHARE OF source;
      SELECT event.* INTO prior_terminal_event
      FROM public."IdentityMailDeliveryTenantEnrollmentEvent" AS event
      WHERE event."tenantId" = tenant_id
        AND event."commandId" = referenced_command."id"
        AND event."eventType" IN ('ENABLED', 'ROTATED', 'DISABLED')
      ORDER BY event."eventSequence" DESC LIMIT 1;

      IF referenced_command."id" IS NULL
         OR referenced_command."intent" <> 'FORWARD'
         OR prior_terminal_event."id" IS NULL
         OR prior_terminal_event."toState" IS DISTINCT FROM
           command_record."expectedState"
         OR prior_terminal_event."toPolicyRevision" IS DISTINCT FROM
           command_record."expectedPolicyRevision"
         OR prior_terminal_event."toStateRevision" IS DISTINCT FROM
           command_record."stateRevisionBefore"
         OR prior_terminal_event."toConfigurationDigest" IS DISTINCT FROM
           command_record."previousConfigurationDigest"
         OR prior_terminal_event."toState" IS DISTINCT FROM
           referenced_command."targetState"
         OR prior_terminal_event."toPolicyRevision" IS DISTINCT FROM
           referenced_command."nextPolicyRevision"
         OR prior_terminal_event."toStateRevision" IS DISTINCT FROM
           referenced_command."finalStateRevision"
         OR prior_terminal_event."toConfigurationDigest" IS DISTINCT FROM
           referenced_command."targetConfigurationDigest"
         OR ROW(
           command_record."previousWorkerRoleName",
           command_record."previousWorkerRoleOid",
           command_record."previousProviderAuthorityDigest",
           command_record."previousMaxAttempts",
           command_record."previousLeaseSeconds",
           command_record."previousAcknowledgeSeconds",
           command_record."previousBaseRetrySeconds",
           command_record."previousMaxRetrySeconds",
           command_record."previousConfigurationDigest"
         ) IS DISTINCT FROM ROW(
           referenced_command."targetWorkerRoleName",
           referenced_command."targetWorkerRoleOid",
           referenced_command."targetProviderAuthorityDigest",
           referenced_command."targetMaxAttempts",
           referenced_command."targetLeaseSeconds",
           referenced_command."targetAcknowledgeSeconds",
           referenced_command."targetBaseRetrySeconds",
           referenced_command."targetMaxRetrySeconds",
           referenced_command."targetConfigurationDigest"
         )
         -- The V1 state machine has no ABSENT terminal event and cannot
         -- exactly restore an ENABLE before-image; fail rather than perform a
         -- state-only pseudo-rollback.
         OR referenced_command."action" = 'ENABLE'
         OR (
           referenced_command."action" = 'ROTATE'
           AND (
             command_record."action" <> 'ROTATE'
             OR ROW(
               command_record."targetWorkerRoleName",
               command_record."targetWorkerRoleOid",
               command_record."targetProviderAuthorityDigest",
               command_record."targetMaxAttempts",
               command_record."targetLeaseSeconds",
               command_record."targetAcknowledgeSeconds",
               command_record."targetBaseRetrySeconds",
               command_record."targetMaxRetrySeconds",
               command_record."targetConfigurationDigest"
             ) IS DISTINCT FROM ROW(
               referenced_command."previousWorkerRoleName",
               referenced_command."previousWorkerRoleOid",
               referenced_command."previousProviderAuthorityDigest",
               referenced_command."previousMaxAttempts",
               referenced_command."previousLeaseSeconds",
               referenced_command."previousAcknowledgeSeconds",
               referenced_command."previousBaseRetrySeconds",
               referenced_command."previousMaxRetrySeconds",
               referenced_command."previousConfigurationDigest"
             )
           )
         )
         OR (
           referenced_command."action" = 'DISABLE'
           AND (
             command_record."action" <> 'ENABLE'
             OR ROW(
               command_record."targetWorkerRoleName",
               command_record."targetWorkerRoleOid",
               command_record."targetProviderAuthorityDigest",
               command_record."targetMaxAttempts",
               command_record."targetLeaseSeconds",
               command_record."targetAcknowledgeSeconds",
               command_record."targetBaseRetrySeconds",
               command_record."targetMaxRetrySeconds",
               command_record."targetConfigurationDigest"
             ) IS DISTINCT FROM ROW(
               referenced_command."previousWorkerRoleName",
               referenced_command."previousWorkerRoleOid",
               referenced_command."previousProviderAuthorityDigest",
               referenced_command."previousMaxAttempts",
               referenced_command."previousLeaseSeconds",
               referenced_command."previousAcknowledgeSeconds",
               referenced_command."previousBaseRetrySeconds",
               referenced_command."previousMaxRetrySeconds",
               referenced_command."previousConfigurationDigest"
             )
           )
         )
      THEN
        RAISE EXCEPTION 'Identity-mail enrollment rollback mapping is invalid'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  transaction_id := pg_catalog.txid_current()::TEXT;

  IF is_continuation THEN
    IF command_record."action" NOT IN ('ROTATE', 'DISABLE')
       OR enrollment_record."stateRevision" IS DISTINCT FROM
         command_record."drainStateRevision"
       OR enrollment_record."policyRevision" IS DISTINCT FROM
         command_record."expectedPolicyRevision"
       OR enrollment_record."workerRoleName" IS DISTINCT FROM
         command_record."previousWorkerRoleName"
       OR enrollment_record."workerRoleOid" IS DISTINCT FROM
         command_record."previousWorkerRoleOid"
       OR enrollment_record."providerAuthorityDigest" IS DISTINCT FROM
         command_record."previousProviderAuthorityDigest"
       OR enrollment_record."maxAttempts" IS DISTINCT FROM
         command_record."previousMaxAttempts"
       OR enrollment_record."leaseSeconds" IS DISTINCT FROM
         command_record."previousLeaseSeconds"
       OR enrollment_record."acknowledgeSeconds" IS DISTINCT FROM
         command_record."previousAcknowledgeSeconds"
       OR enrollment_record."baseRetrySeconds" IS DISTINCT FROM
         command_record."previousBaseRetrySeconds"
       OR enrollment_record."maxRetrySeconds" IS DISTINCT FROM
         command_record."previousMaxRetrySeconds"
       OR enrollment_record."currentConfigurationDigest" IS DISTINCT FROM
         command_record."previousConfigurationDigest"
    THEN
      RAISE EXCEPTION 'Identity-mail enrollment drain continuation drifted'
        USING ERRCODE = '40001';
    END IF;

    PERFORM outbox."id"
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id
    ORDER BY outbox."id"
    FOR UPDATE OF outbox;

    SELECT
      pg_catalog.count(*) FILTER (
        WHERE outbox."secretCiphertext" IS NOT NULL
      ),
      pg_catalog.count(*) FILTER (
        WHERE outbox."status" IN (
          'HOLD'::public."IdentityMailOutboxStatus",
          'PENDING'::public."IdentityMailOutboxStatus",
          'RETRY'::public."IdentityMailOutboxStatus"
        )
      ),
      pg_catalog.count(*) FILTER (
        WHERE outbox."status" = 'CLAIMED'::public."IdentityMailOutboxStatus"
      )
    INTO pending_secret_count, pending_queue_count, claimed_count
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id;

    IF pending_secret_count <> 0 OR pending_queue_count <> 0 OR claimed_count <> 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 1,
        'operation', 'DRIVE_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2',
        'decision', 'PENDING_ZERO_INFLIGHT',
        'phase', 'WAIT_ZERO_INFLIGHT',
        'candidateStatus', 'NOT_DEPLOYABLE',
        'authorization', true,
        'canMutate', true,
        'authorityScope', 'CURRENT_DATABASE_ONLY',
        'crossDatabaseAuthorityControlled', false,
        'futureCreatorDefaultPrivilegesControlled', false,
        'applicationRoleAllowlistBound', false,
        'productionApplyAuthorized', false,
        'tenantId', tenant_id,
        'commandId', command_record."id",
        'authorizationEnvelopeDigest', command_record."authorizationEnvelopeDigest",
        'manifestPayloadDigest', command_record."dutyManifestPayloadDigest",
        'secretBearingCount', pending_secret_count,
        'queuedCount', pending_queue_count,
        'claimedCount', claimed_count,
        'aclEpoch', current_acl_epoch,
        'definitionManifestDigest', acl_record."definitionManifestDigest",
        'directDutyAclDigest', direct_duty_acl_digest,
        'systemPublicAclBaselineDigest', system_public_acl_baseline_digest
      );
    END IF;

    event_at := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
    event_id := pg_catalog.gen_random_uuid()::TEXT;
    event_type := CASE command_record."action"
      WHEN 'ROTATE' THEN 'ROTATED' ELSE 'DISABLED' END;
    from_state := 'DRAINING';
    to_state := command_record."targetState";
    from_policy_revision := command_record."expectedPolicyRevision";
    to_policy_revision := command_record."nextPolicyRevision";
    from_state_revision := command_record."drainStateRevision";
    to_state_revision := command_record."finalStateRevision";
    from_configuration_digest := command_record."previousConfigurationDigest";
    to_configuration_digest := command_record."targetConfigurationDigest";
    previous_event_digest := enrollment_record."lastEventDigest";
  ELSIF command_record."action" = 'ENABLE' THEN
    event_at := observed_at;
    event_id := pg_catalog.gen_random_uuid()::TEXT;
    event_type := 'ENABLED';
    from_state := command_record."expectedState";
    to_state := 'ACTIVE';
    from_policy_revision := command_record."expectedPolicyRevision";
    to_policy_revision := command_record."nextPolicyRevision";
    from_state_revision := command_record."stateRevisionBefore";
    to_state_revision := command_record."finalStateRevision";
    from_configuration_digest := command_record."previousConfigurationDigest";
    to_configuration_digest := command_record."targetConfigurationDigest";
    previous_event_digest := enrollment_record."lastEventDigest";
  ELSE
    event_at := observed_at;
    event_id := pg_catalog.gen_random_uuid()::TEXT;
    event_type := 'DRAIN_STARTED';
    from_state := 'ACTIVE';
    to_state := 'DRAINING';
    from_policy_revision := command_record."expectedPolicyRevision";
    to_policy_revision := command_record."expectedPolicyRevision";
    from_state_revision := command_record."stateRevisionBefore";
    to_state_revision := command_record."drainStateRevision";
    from_configuration_digest := command_record."previousConfigurationDigest";
    to_configuration_digest := command_record."previousConfigurationDigest";
    previous_event_digest := enrollment_record."lastEventDigest";
  END IF;

  event_receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'APPEND_IDENTITY_MAIL_TENANT_ENROLLMENT_EVENT',
    'eventId', event_id,
    'tenantId', tenant_id,
    'commandId', command_record."id",
    'eventSequence', CASE WHEN event_type IN ('ROTATED', 'DISABLED') THEN 2 ELSE 1 END,
    'eventType', event_type,
    'fromState', from_state,
    'toState', to_state,
    'fromPolicyRevision', from_policy_revision,
    'toPolicyRevision', to_policy_revision,
    'fromStateRevision', from_state_revision,
    'toStateRevision', to_state_revision,
    'fromConfigurationDigest', from_configuration_digest,
    'toConfigurationDigest', to_configuration_digest,
    'commandContentDigest', command_record."authorizationEnvelopeDigest",
    'actorDigest', command_record."actorDigest",
    'previousEventDigest', previous_event_digest,
    'createdTransactionId', transaction_id,
    'eventAtEpochMs', (EXTRACT(EPOCH FROM event_at) * 1000)::BIGINT
  );
  event_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(event_receipt::TEXT, 'UTF8')), 'hex'
  );
  event_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'IDENTITY_MAIL_TENANT_ENROLLMENT_EVENT_V1' || E'\n'
          || COALESCE(previous_event_digest, pg_catalog.repeat('0', 64))
          || E'\n' || event_receipt_digest || E'\n',
        'UTF8'
      )
    ), 'hex'
  );

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_enrollment_driver_event_receipt_v2',
    event_receipt_digest, true
  );
  INSERT INTO public."IdentityMailDeliveryTenantEnrollmentEvent" (
    "id", "tenantId", "commandId", "eventSequence", "eventType",
    "fromState", "toState", "fromPolicyRevision", "toPolicyRevision",
    "fromStateRevision", "toStateRevision", "fromConfigurationDigest",
    "toConfigurationDigest", "commandContentDigest", "actorDigest",
    "eventAt", "createdTransactionId", "previousEventDigest", "eventDigest",
    "receipt", "receiptDigest"
  ) VALUES (
    event_id, tenant_id, command_record."id",
    CASE WHEN event_type IN ('ROTATED', 'DISABLED') THEN 2 ELSE 1 END,
    event_type, from_state, to_state, from_policy_revision,
    to_policy_revision, from_state_revision, to_state_revision,
    from_configuration_digest, to_configuration_digest,
    command_record."authorizationEnvelopeDigest", command_record."actorDigest",
    event_at, transaction_id, previous_event_digest, event_digest,
    event_receipt, event_receipt_digest
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_enrollment_driver_event_receipt_v2', '', true
  );
  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_enrollment_driver_event_digest_v2',
    event_digest, true
  );

  IF event_type = 'ENABLED' AND command_record."expectedState" = 'ABSENT' THEN
    INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
      "tenantId", "workerRoleName", "workerRoleOid", "policyRevision",
      "enabled", "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
      "baseRetrySeconds", "maxRetrySeconds", "providerAuthorityDigest",
      "enabledAt", "disabledAt", "createdAt", "updatedAt", "state",
      "stateRevision", "activeCommandId", "lastEventDigest",
      "currentConfigurationDigest", "stateChangedAt"
    ) VALUES (
      tenant_id, command_record."targetWorkerRoleName",
      command_record."targetWorkerRoleOid", command_record."nextPolicyRevision",
      true, command_record."targetMaxAttempts", command_record."targetLeaseSeconds",
      command_record."targetAcknowledgeSeconds",
      command_record."targetBaseRetrySeconds",
      command_record."targetMaxRetrySeconds",
      command_record."targetProviderAuthorityDigest", event_at, NULL,
      event_at, event_at, 'ACTIVE', command_record."finalStateRevision", NULL,
      event_digest, command_record."targetConfigurationDigest", event_at
    );
  ELSIF event_type = 'ENABLED' THEN
    UPDATE public."IdentityMailDeliveryTenantEnrollment"
    SET "workerRoleName" = command_record."targetWorkerRoleName",
        "workerRoleOid" = command_record."targetWorkerRoleOid",
        "policyRevision" = command_record."nextPolicyRevision",
        "enabled" = true,
        "maxAttempts" = command_record."targetMaxAttempts",
        "leaseSeconds" = command_record."targetLeaseSeconds",
        "acknowledgeSeconds" = command_record."targetAcknowledgeSeconds",
        "baseRetrySeconds" = command_record."targetBaseRetrySeconds",
        "maxRetrySeconds" = command_record."targetMaxRetrySeconds",
        "providerAuthorityDigest" = command_record."targetProviderAuthorityDigest",
        "enabledAt" = event_at, "disabledAt" = NULL, "updatedAt" = event_at,
        "state" = 'ACTIVE', "stateRevision" = command_record."finalStateRevision",
        "activeCommandId" = NULL, "lastEventDigest" = event_digest,
        "currentConfigurationDigest" = command_record."targetConfigurationDigest",
        "stateChangedAt" = event_at
    WHERE "tenantId" = tenant_id;
  ELSIF event_type = 'DRAIN_STARTED' THEN
    UPDATE public."IdentityMailDeliveryTenantEnrollment"
    SET "enabled" = false, "updatedAt" = event_at, "state" = 'DRAINING',
        "stateRevision" = command_record."drainStateRevision",
        "activeCommandId" = command_record."id",
        "lastEventDigest" = event_digest, "stateChangedAt" = event_at
    WHERE "tenantId" = tenant_id;
  ELSE
    UPDATE public."IdentityMailDeliveryTenantEnrollment"
    SET "workerRoleName" = command_record."targetWorkerRoleName",
        "workerRoleOid" = command_record."targetWorkerRoleOid",
        "policyRevision" = command_record."nextPolicyRevision",
        "enabled" = (event_type = 'ROTATED'),
        "maxAttempts" = command_record."targetMaxAttempts",
        "leaseSeconds" = command_record."targetLeaseSeconds",
        "acknowledgeSeconds" = command_record."targetAcknowledgeSeconds",
        "baseRetrySeconds" = command_record."targetBaseRetrySeconds",
        "maxRetrySeconds" = command_record."targetMaxRetrySeconds",
        "providerAuthorityDigest" = command_record."targetProviderAuthorityDigest",
        "enabledAt" = CASE WHEN event_type = 'ROTATED' THEN event_at ELSE "enabledAt" END,
        "disabledAt" = CASE WHEN event_type = 'DISABLED' THEN event_at ELSE NULL END,
        "updatedAt" = event_at, "state" = to_state,
        "stateRevision" = command_record."finalStateRevision",
        "activeCommandId" = NULL, "lastEventDigest" = event_digest,
        "currentConfigurationDigest" = command_record."targetConfigurationDigest",
        "stateChangedAt" = event_at
    WHERE "tenantId" = tenant_id;
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.identity_mail_enrollment_driver_event_digest_v2', '', true
  );

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'DRIVE_IDENTITY_MAIL_TENANT_ENROLLMENT_COMMAND_V2',
    'decision', CASE WHEN event_type = 'DRAIN_STARTED'
      THEN 'PENDING_ZERO_INFLIGHT' ELSE 'COMPLETED' END,
    'phase', CASE WHEN event_type = 'DRAIN_STARTED'
      THEN 'BEGIN_DRAIN' ELSE 'FINALIZE' END,
    'candidateStatus', 'NOT_DEPLOYABLE',
    'authorization', true,
    'canMutate', true,
    'authorityScope', 'CURRENT_DATABASE_ONLY',
    'crossDatabaseAuthorityControlled', false,
    'futureCreatorDefaultPrivilegesControlled', false,
    'applicationRoleAllowlistBound', false,
    'productionApplyAuthorized', false,
    'tenantId', tenant_id,
    'commandId', command_record."id",
    'authorizationEnvelopeDigest', command_record."authorizationEnvelopeDigest",
    'manifestPayloadDigest', command_record."dutyManifestPayloadDigest",
    'eventDigest', event_digest,
    'state', to_state,
    'policyRevision', to_policy_revision,
    'stateRevision', to_state_revision,
    'aclEpoch', current_acl_epoch,
    'definitionManifestDigest', acl_record."definitionManifestDigest",
    'directDutyAclDigest', direct_duty_acl_digest,
    'systemPublicAclBaselineDigest', system_public_acl_baseline_digest
  );
END;
$$;

REVOKE ALL PRIVILEGES
ON TABLE public."IdentityMailDutyRoleAclEpochV1"
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_duty_role_acl_lock_v1"()
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_duty_role_acl_epoch_append_v1"(TEXT, TEXT, TEXT)
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_duty_role_acl_epoch_immutable_guard_v1"()
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_duty_role_live_assert_v1"(
  BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT
)
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_event_write_guard_v2"()
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_registry_write_guard_v2"()
FROM PUBLIC;
REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_tenant_enrollment_drive_command_v2"(
  TEXT, TEXT, TEXT, TEXT
)
FROM PUBLIC;

COMMENT ON TABLE public."IdentityMailDutyRoleAclEpochV1" IS
  'CURRENT186 NOT_DEPLOYABLE append-only ACL/catalog epoch evidence. Rollback appends N+1 and never rewinds history.';
COMMENT ON FUNCTION public."identity_mail_duty_role_acl_lock_v1"() IS
  'CURRENT186 owner-only global ACL transaction lock; tenant lifecycle takes tenant lock before this lock.';
COMMENT ON FUNCTION public."identity_mail_duty_role_acl_epoch_append_v1"(TEXT, TEXT, TEXT) IS
  'CURRENT186 owner-only compare-and-swap append of one domain-separated canonical ACL epoch and immutable TOASTed recovery sidecar.';
COMMENT ON FUNCTION public."identity_mail_duty_role_live_assert_v1"(
  BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT
) IS
  'CURRENT186 current-database-only DB-native owner, definition and ACL assertion; no cross-database or future-default claim.';
COMMENT ON FUNCTION public."identity_mail_tenant_enrollment_drive_command_v2"(
  TEXT, TEXT, TEXT, TEXT
) IS
  'CURRENT186 owner-only four-reference phaseful enrollment driver; no JSON authority is accepted from runtime.';

DO $postcondition$
DECLARE
  epoch_count BIGINT;
  relation_owner_drift INTEGER;
  relation_acl_drift INTEGER;
  routine_count INTEGER;
  routine_drift INTEGER;
  non_owner_routine_acl_count INTEGER;
  trigger_count INTEGER;
  trigger_drift INTEGER;
  definition_manifest_constraint_count INTEGER;
  definition_routine_count INTEGER;
  definition_trigger_count INTEGER;
  definition_protected_relation_count INTEGER;
  observed_definition_manifest_digest TEXT;
BEGIN
  SELECT pg_catalog.count(*) INTO epoch_count
  FROM public."IdentityMailDutyRoleAclEpochV1";

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE pg_catalog.pg_get_userbyid(relation.relowner) <> current_user
    )::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) AS acl
        WHERE acl.grantee <> relation.relowner
      )
    )::INTEGER
  INTO relation_owner_drift, relation_acl_drift
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public."IdentityMailDutyRoleAclEpochV1"'::pg_catalog.regclass;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE routine.prosecdef IS DISTINCT FROM expected.security_definer
         OR routine.provolatile IS DISTINCT FROM expected.volatility
         OR routine.proparallel IS DISTINCT FROM 'u'::"char"
         OR routine.provariadic <> 0
         OR routine.pronargdefaults <> 0
         OR routine.proargdefaults IS NOT NULL
         OR routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::TEXT[]
         OR pg_catalog.pg_get_userbyid(routine.proowner) <> current_user
    )::INTEGER
  INTO routine_count, routine_drift
  FROM (
    VALUES
      ('identity_mail_duty_role_acl_lock_v1', 0, true, 'v'::"char"),
      ('identity_mail_duty_role_acl_epoch_append_v1', 3, false, 'v'::"char"),
      ('identity_mail_duty_role_acl_epoch_immutable_guard_v1', 0, false, 'v'::"char"),
      ('identity_mail_duty_role_live_assert_v1', 6, false, 'v'::"char"),
      ('identity_mail_tenant_enrollment_event_write_guard_v2', 0, false, 'v'::"char"),
      ('identity_mail_tenant_enrollment_registry_write_guard_v2', 0, false, 'v'::"char"),
      ('identity_mail_tenant_enrollment_drive_command_v2', 4, true, 'v'::"char")
  ) AS expected(name, argument_count, security_definer, volatility)
  INNER JOIN pg_catalog.pg_proc AS routine
    ON routine.proname = expected.name
   AND routine.pronargs = expected.argument_count
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
   AND namespace.nspname = 'public';

  SELECT pg_catalog.count(*)::INTEGER
  INTO non_owner_routine_acl_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f', routine.proowner)
    )
  ) AS acl
  WHERE namespace.nspname = 'public'
    AND routine.proname IN (
      'identity_mail_duty_role_acl_lock_v1',
      'identity_mail_duty_role_acl_epoch_append_v1',
      'identity_mail_duty_role_acl_epoch_immutable_guard_v1',
      'identity_mail_duty_role_live_assert_v1',
      'identity_mail_tenant_enrollment_event_write_guard_v2',
      'identity_mail_tenant_enrollment_registry_write_guard_v2',
      'identity_mail_tenant_enrollment_drive_command_v2'
    )
    AND acl.grantee <> routine.proowner;

  WITH expected(relation_name, trigger_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT),
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_truncate_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_delete_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_write_guard_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_dml_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_dml_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_insert_guard_v2_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_insert_lock_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_event_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_guard_trigger'::TEXT)
  ),
  protected_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('_prisma_migrations'::TEXT)
  ),
  actual AS (
    SELECT relation.relname AS relation_name,
      trigger_entry.tgname AS trigger_name,
      trigger_entry.tgenabled
    FROM pg_catalog.pg_trigger AS trigger_entry
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger_entry.tgrelid
    INNER JOIN protected_relations AS protected
      ON protected.relation_name = relation.relname
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    WHERE NOT trigger_entry.tgisinternal
  )
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE expected.trigger_name IS NOT NULL
        AND actual.tgenabled = 'O'::"char"
    )::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE expected.trigger_name IS NULL
         OR actual.trigger_name IS NULL
         OR actual.tgenabled <> 'O'::"char"
    )::INTEGER
  INTO trigger_count, trigger_drift
  FROM actual
  FULL OUTER JOIN expected
    ON expected.relation_name = actual.relation_name
   AND expected.trigger_name = actual.trigger_name;

  SELECT pg_catalog.count(*)::INTEGER
  INTO definition_manifest_constraint_count
  FROM pg_catalog.pg_constraint AS constraint_entry
  WHERE constraint_entry.conrelid =
      'public."IdentityMailDutyRoleAclEpochV1"'::pg_catalog.regclass
    AND constraint_entry.conname =
      'identity_mail_duty_role_acl_epoch_definition_manifest_check'
    AND constraint_entry.contype = 'c'::"char"
    AND NOT constraint_entry.condeferrable
    AND NOT constraint_entry.condeferred
    AND constraint_entry.convalidated
    AND constraint_entry.conkey = ARRAY[
      (
        SELECT attribute.attnum
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = constraint_entry.conrelid
          AND attribute.attname = 'definitionManifestDigest'
          AND NOT attribute.attisdropped
      )
    ]::SMALLINT[]
    AND pg_catalog.pg_get_expr(
      constraint_entry.conbin, constraint_entry.conrelid, false
    ) =
      '("definitionManifestDigest" = ''46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be''::bpchar)';

  PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);

  WITH
  expected_routines(signature) AS (
    VALUES
      ('public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_email_claim_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reconcile_v2(text,text,bigint,text,text,text)'::TEXT),
      ('public.identity_mail_delivery_event_append_v2()'::TEXT),
      ('public.identity_mail_delivery_worker_assert_v2(text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)'::TEXT),
      ('public.identity_mail_duty_role_acl_epoch_immutable_guard_v1()'::TEXT),
      ('public.identity_mail_duty_role_acl_lock_v1()'::TEXT),
      ('public.identity_mail_duty_role_live_assert_v1(bigint,bigint,bigint,bigint,text,text)'::TEXT),
      ('public.identity_mail_evidence_immutable_guard_v2()'::TEXT),
      ('public.identity_mail_evidence_import_insert_guard_v2()'::TEXT),
      ('public.identity_mail_manifest_revocation_lock_v2()'::TEXT),
      ('public.identity_mail_outbox_delivery_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_event_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_enrollment_import_evidence_v2(text,text)'::TEXT),
      ('public.identity_mail_tenant_enrollment_registry_write_guard_v2()'::TEXT),
      ('public.identity_mail_tenant_lock_v1(text)'::TEXT),
      ('public.identity_initial_owner_mail_claim_v2(text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_complete_v2(text,text,integer,text,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_provider_mark_v2(text,text,integer,text,text,text,text,text)'::TEXT),
      ('public.identity_initial_owner_mail_reap_v2(text,text,text,integer)'::TEXT)
  ),
  expected_triggers(relation_name, trigger_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT),
      ('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_truncate_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_delete_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT, 'IdentityMailEnrollment_registry_write_guard_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_dml_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT, 'IdentityMailEnrollmentCommand_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_dml_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_immutable_truncate_v2_trigger'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT, 'IdentityMailEnrollmentEvent_insert_guard_v2_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT, 'IdentityMailDutyRoleAclEpochV1_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT, 'IdentityMailManifestV2_import_insert_guard_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_dml_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_immutable_truncate_trigger'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT, 'IdentityMailManifestRevocationV2_insert_lock_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_event_trigger'::TEXT),
      ('IdentityMailOutbox'::TEXT, 'IdentityMailOutbox_delivery_guard_trigger'::TEXT)
  ),
  protected_relations(relation_name) AS (
    VALUES
      ('IdentityMailDeliveryEvent'::TEXT),
      ('IdentityMailDeliveryTenantEnrollment'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentCommand'::TEXT),
      ('IdentityMailDeliveryTenantEnrollmentEvent'::TEXT),
      ('IdentityMailDutyRoleAclEpochV1'::TEXT),
      ('IdentityMailDutyRoleManifestEvidenceV2'::TEXT),
      ('IdentityMailDutyRoleManifestRevocationV2'::TEXT),
      ('IdentityMailOutbox'::TEXT),
      ('_prisma_migrations'::TEXT)
  ),
  protected_relation_oids AS (
    SELECT relation.oid, relation.relname
    FROM protected_relations AS expected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.relation_name
     AND relation.relkind IN ('r', 'p')
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
  ),
  definition_rows(kind, identity, definition_sha256) AS (
    SELECT
      'ROUTINE'::TEXT,
      expected.signature,
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.pg_get_functiondef(routine.oid), 'UTF8'
          )
        ),
        'hex'
      )
    FROM expected_routines AS expected
    INNER JOIN pg_catalog.pg_proc AS routine
      ON routine.oid = pg_catalog.to_regprocedure(expected.signature)
    UNION ALL
    SELECT
      'TRIGGER',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, trigger_entry.tgname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            trigger_entry.tgenabled::TEXT || '|'
              || pg_catalog.pg_get_triggerdef(trigger_entry.oid, false),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM expected_triggers AS expected
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.relname = expected.relation_name
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
     AND namespace.nspname = 'public'
    INNER JOIN pg_catalog.pg_trigger AS trigger_entry
      ON trigger_entry.tgrelid = relation.oid
     AND trigger_entry.tgname = expected.trigger_name
     AND NOT trigger_entry.tgisinternal
    UNION ALL
    SELECT
      'CONSTRAINT',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, constraint_entry.conname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            constraint_entry.contype::TEXT || '|'
              || constraint_entry.condeferrable::TEXT || '|'
              || constraint_entry.condeferred::TEXT || '|'
              || constraint_entry.convalidated::TEXT || '|'
              || pg_catalog.pg_get_constraintdef(
                constraint_entry.oid, false
              ),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM protected_relation_oids AS relation
    INNER JOIN pg_catalog.pg_constraint AS constraint_entry
      ON constraint_entry.conrelid = relation.oid
    WHERE constraint_entry.conname <>
      'identity_mail_duty_role_acl_epoch_definition_manifest_check'
    UNION ALL
    SELECT
      'INDEX',
      pg_catalog.format(
        '%I.%I::%I', 'public', relation.relname, index_relation.relname
      ),
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            index_entry.indisunique::TEXT || '|'
              || index_entry.indisprimary::TEXT || '|'
              || index_entry.indisexclusion::TEXT || '|'
              || index_entry.indimmediate::TEXT || '|'
              || index_entry.indisvalid::TEXT || '|'
              || index_entry.indisready::TEXT || '|'
              || index_entry.indislive::TEXT || '|'
              || index_entry.indisreplident::TEXT || '|'
              || pg_catalog.pg_get_indexdef(
                index_entry.indexrelid, 0, false
              ),
            'UTF8'
          )
        ),
        'hex'
      )
    FROM protected_relation_oids AS relation
    INNER JOIN pg_catalog.pg_index AS index_entry
      ON index_entry.indrelid = relation.oid
    INNER JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_entry.indexrelid
  )
  SELECT
    pg_catalog.count(*) FILTER (WHERE kind = 'ROUTINE')::INTEGER,
    pg_catalog.count(*) FILTER (WHERE kind = 'TRIGGER')::INTEGER,
    (
      SELECT pg_catalog.count(*)::INTEGER FROM protected_relation_oids
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_V1'
            || E'\n'
            || pg_catalog.string_agg(
              kind || '|' || identity || '|' || definition_sha256,
              E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C"
            )
            || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    definition_routine_count,
    definition_trigger_count,
    definition_protected_relation_count,
    observed_definition_manifest_digest
  FROM definition_rows;

  IF epoch_count IS DISTINCT FROM 0
     OR relation_owner_drift IS DISTINCT FROM 0
     OR relation_acl_drift IS DISTINCT FROM 0
     OR routine_count IS DISTINCT FROM 7
     OR routine_drift IS DISTINCT FROM 0
     OR non_owner_routine_acl_count IS DISTINCT FROM 0
     OR trigger_count IS DISTINCT FROM 21
     OR trigger_drift IS DISTINCT FROM 0
     OR definition_manifest_constraint_count IS DISTINCT FROM 1
     OR definition_routine_count IS DISTINCT FROM 23
     OR definition_trigger_count IS DISTINCT FROM 21
     OR definition_protected_relation_count IS DISTINCT FROM 9
     OR observed_definition_manifest_digest IS DISTINCT FROM
        '46fcb3cd89f8b8dbb7d064e242de3df417a641e7bc3f1823781f5e914aced8be'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = routine.pronamespace
       WHERE namespace.nspname = 'public'
         AND routine.proname =
           'identity_mail_tenant_enrollment_drive_command_v2'
         AND pg_catalog.pg_get_function_identity_arguments(routine.oid) <>
           'p_tenant_id text, p_command_id text, p_authorization_envelope_digest text, p_manifest_payload_digest text'
     )
  THEN
    RAISE EXCEPTION 'CURRENT186 runtime boundary postcondition failed'
      USING ERRCODE = '55000',
        DETAIL = pg_catalog.format(
          'epoch=%s relation_owner=%s relation_acl=%s routines=%s routine_drift=%s routine_acl=%s triggers=%s trigger_drift=%s definition_check=%s definition_routines=%s definition_triggers=%s definition_relations=%s definition_digest=%s',
          epoch_count,
          relation_owner_drift,
          relation_acl_drift,
          routine_count,
          routine_drift,
          non_owner_routine_acl_count,
          trigger_count,
          trigger_drift,
          definition_manifest_constraint_count,
          definition_routine_count,
          definition_trigger_count,
          definition_protected_relation_count,
          observed_definition_manifest_digest
        );
  END IF;
END;
$postcondition$;

COMMIT;
