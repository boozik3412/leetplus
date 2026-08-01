BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

-- CURRENT_182 is a stacked, disposable-rehearsal-only candidate above the
-- frozen CURRENT_181 candidate. It changes no relation data, grants no
-- authority and is NOT_DEPLOYABLE. Its only purpose is to make every current
-- application IdentityEmailClaim entrypoint acquire the CURRENT_181 tenant
-- advisory lock before the email advisory lock or any relation access.
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
    'leetplus.identity_mail_tenant_first_claim_current182_confirmation',
    true
  );
  rehearsal_candidate_sha256 := pg_catalog.current_setting(
    'leetplus.identity_mail_tenant_first_claim_current182_sha256',
    true
  );

  IF pg_catalog.current_database() !~ '^lp_imtec_[0-9a-f]{32}_ci$'
     OR rehearsal_confirmation IS DISTINCT FROM
       'rehearse-noncanonical-identity-mail-tenant-first-claim-current182'
     OR rehearsal_candidate_sha256 IS NULL
     OR (rehearsal_candidate_sha256 COLLATE "C") !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION
      'CURRENT_182 candidate is restricted to the confirmed disposable rehearsal boundary'
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
      '20260801030000_identity_mail_tenant_first_claim_protocol'
    AND migration."finished_at" IS NULL
    AND migration."rolled_back_at" IS NULL;

  IF candidate_receipt_count IS DISTINCT FROM 1
     OR candidate_receipt_checksum IS DISTINCT FROM
       rehearsal_candidate_sha256
     OR candidate_receipt_applied_steps IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION
      'CURRENT_182 requires one exact unfinished Prisma rehearsal receipt'
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

  IF completed_migration_count IS DISTINCT FROM 181
     OR lexical_migration_head IS DISTINCT FROM
       '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
     OR migration_manifest_digest IS DISTINCT FROM
       '7db51f4803b9c6c76b9593e5e8e3573b58b165237d44796e6d6efe27a367c110'
     OR NOT EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."migration_name" =
         '20260801020000_identity_mail_tenant_lock_drain_worker_v2'
         AND migration."checksum" =
           'b78b40ce37f48419c8d9e4f6ad8a90ddb9a242128a33d7dbfa76d8439ba0f455'
         AND migration."finished_at" IS NOT NULL
         AND migration."rolled_back_at" IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
         AND migration."migration_name" <>
           '20260801030000_identity_mail_tenant_first_claim_protocol'
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_182 requires the exact completed frozen CURRENT_181 candidate'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    pg_catalog.to_regclass('public."IdentityEmailClaim"');

  IF migration_owner_oid IS NULL
     OR pg_catalog.to_regprocedure(
       'public."identity_mail_tenant_lock_v1"(text)'
     ) IS NULL
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."identity_email_claim_reserve_invite_v2"(text,text,text)'),
           ('public."identity_email_claim_assert_invite_v1"(text,text,text,integer)'),
           ('public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'),
           ('public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)'),
           ('public."identity_email_claim_release_v2"(text,text,text,text,integer)'),
           ('public."identity_email_claim_reserve_invite_v1"(text,text,text)'),
           ('public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)'),
           ('public."identity_email_claim_release_v1"(text,text,text,text,integer)')
       ) AS required("signature")
       LEFT JOIN pg_catalog.pg_proc AS routine
         ON routine.oid = pg_catalog.to_regprocedure(required."signature")
       LEFT JOIN pg_catalog.pg_language AS language
         ON language.oid = routine.prolang
       WHERE routine.oid IS NULL
          OR routine.proowner <> migration_owner_oid
          OR routine.prokind IS DISTINCT FROM 'f'::"char"
          OR routine.prosecdef IS DISTINCT FROM true
          OR routine.provolatile IS DISTINCT FROM 'v'::"char"
          OR routine.proparallel IS DISTINCT FROM 'u'::"char"
          OR language.lanname IS DISTINCT FROM 'plpgsql'
          OR routine.proconfig IS DISTINCT FROM
            ARRAY['search_path=pg_catalog']::TEXT[]
     )
  THEN
    RAISE EXCEPTION 'CURRENT_182 predecessor claim routine contract drifted'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
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
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('public."identity_mail_tenant_lock_v1"(text)'),
           ('public."identity_email_claim_reserve_invite_v2"(text,text,text)'),
           ('public."identity_email_claim_assert_invite_v1"(text,text,text,integer)'),
           ('public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'),
           ('public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)'),
           ('public."identity_email_claim_release_v2"(text,text,text,text,integer)'),
           ('public."identity_email_claim_reserve_invite_v1"(text,text,text)'),
           ('public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)'),
           ('public."identity_email_claim_release_v1"(text,text,text,text,integer)')
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
     )
  THEN
    RAISE EXCEPTION
      'CURRENT_182 requires owner-only tenant and identity claim routines'
      USING ERRCODE = '42501';
  END IF;
END;
$prerequisite$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_reserve_invite_v2"(
  candidate_email TEXT,
  requested_tenant_id TEXT,
  requested_subject_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
  tenant_id TEXT;
  subject_id TEXT;
  claim_found BOOLEAN;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.btrim(requested_tenant_id);
  subject_id := pg_catalog.lower(
    pg_catalog.btrim(requested_subject_id) COLLATE "C"
  );

  IF tenant_id IS NULL
     OR tenant_id IS DISTINCT FROM requested_tenant_id
     OR (tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity claim tenant identifier is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF subject_id IS NULL
     OR subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity claim subject identifier is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);
  canonical_email :=
    public."identity_email_claim_lock_v1"(candidate_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = canonical_email
  FOR UPDATE;
  claim_found := FOUND;

  PERFORM 1
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity claim tenant was not found'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."User" AS existing_user
    WHERE pg_catalog.lower(
      pg_catalog.btrim(existing_user."email") COLLATE "C"
    ) = canonical_email
  ) OR EXISTS (
    SELECT 1
    FROM public."UserInvite" AS existing_invite
    WHERE existing_invite."email" IS NOT NULL
      AND pg_catalog.lower(
        pg_catalog.btrim(existing_invite."email") COLLATE "C"
      ) = canonical_email
      AND existing_invite."acceptedAt" IS NULL
      AND existing_invite."revokedAt" IS NULL
      AND existing_invite."expiresAt" > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Identity email claim is not available'
      USING
        ERRCODE = '23505',
        DETAIL = 'An existing identity workflow already owns this address.';
  END IF;

  IF claim_found THEN
    IF claim_record."claimType" = 'INVITE'::public."IdentityEmailClaimType"
       AND claim_record."tenantId" = tenant_id
       AND claim_record."subjectId" = subject_id
       AND claim_record."revision" = 1
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'schemaVersion', 2,
        'operation', 'RESERVE_INVITE',
        'decision', 'ALREADY_RESERVED',
        'claimType', 'INVITE',
        'tenantId', claim_record."tenantId",
        'subjectId', claim_record."subjectId",
        'revision', claim_record."revision"
      );
    END IF;

    RAISE EXCEPTION 'Identity email claim is not available'
      USING
        ERRCODE = '23505',
        DETAIL = 'A different identity claim already owns this address.';
  END IF;

  BEGIN
    INSERT INTO public."IdentityEmailClaim" (
      "emailCanonical",
      "claimType",
      "tenantId",
      "subjectId",
      "revision",
      "updatedAt"
    )
    VALUES (
      canonical_email,
      'INVITE'::public."IdentityEmailClaimType",
      tenant_id,
      subject_id,
      1,
      pg_catalog.clock_timestamp()
    )
    RETURNING *
    INTO claim_record;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Identity email claim is not available'
        USING
          ERRCODE = '23505',
          DETAIL = 'A conflicting identity claim already exists.';
  END;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'RESERVE_INVITE',
    'decision', 'CREATED',
    'claimType', 'INVITE',
    'tenantId', claim_record."tenantId",
    'subjectId', claim_record."subjectId",
    'revision', claim_record."revision"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_transition_v2"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_claim_type TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER,
  next_claim_type TEXT,
  next_subject_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
  tenant_id TEXT;
  expected_type TEXT;
  expected_subject TEXT;
  target_type TEXT;
  target_subject TEXT;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.btrim(expected_tenant_id);
  expected_type := pg_catalog.upper(
    pg_catalog.btrim(expected_claim_type) COLLATE "C"
  );
  expected_subject := pg_catalog.lower(
    pg_catalog.btrim(expected_subject_id) COLLATE "C"
  );
  target_type := pg_catalog.upper(
    pg_catalog.btrim(next_claim_type) COLLATE "C"
  );
  target_subject := pg_catalog.lower(
    pg_catalog.btrim(next_subject_id) COLLATE "C"
  );

  IF tenant_id IS NULL
     OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR (tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_type IS DISTINCT FROM 'INVITE'
     OR target_type IS NULL
     OR target_type NOT IN ('INVITE', 'USER')
     OR expected_revision IS NULL
     OR expected_revision < 1
  THEN
    RAISE EXCEPTION 'Identity claim transition input is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF expected_subject IS NULL
     OR expected_subject !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR target_subject IS NULL
     OR target_subject !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR target_subject = expected_subject
  THEN
    RAISE EXCEPTION 'Identity claim transition subject is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);
  canonical_email :=
    public."identity_email_claim_lock_v1"(candidate_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = canonical_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity email claim was not found'
      USING ERRCODE = '23503';
  END IF;

  IF target_type = 'INVITE' AND NOT EXISTS (
    SELECT 1
    FROM public."UserInvite" AS target_invite
    WHERE target_invite."id" = target_subject
      AND target_invite."tenantId" = tenant_id
      AND target_invite."email" IS NOT NULL
      AND pg_catalog.lower(
        pg_catalog.btrim(target_invite."email") COLLATE "C"
      ) = canonical_email
      AND target_invite."acceptedAt" IS NULL
      AND target_invite."revokedAt" IS NULL
      AND target_invite."expiresAt" > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Identity claim destination was not found'
      USING ERRCODE = '23503';
  ELSIF target_type = 'USER' AND NOT EXISTS (
    SELECT 1
    FROM public."User" AS target_user
    WHERE target_user."id" = target_subject
      AND target_user."tenantId" = tenant_id
      AND pg_catalog.lower(
        pg_catalog.btrim(target_user."email") COLLATE "C"
      ) = canonical_email
  ) THEN
    RAISE EXCEPTION 'Identity claim destination was not found'
      USING ERRCODE = '23503';
  END IF;

  IF claim_record."tenantId" = tenant_id
     AND claim_record."claimType"::TEXT = target_type
     AND claim_record."subjectId" = target_subject
     AND claim_record."revision" = expected_revision + 1
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 2,
      'operation', 'TRANSITION_INVITE',
      'decision', 'ALREADY_TRANSITIONED',
      'claimType', target_type,
      'tenantId', claim_record."tenantId",
      'subjectId', claim_record."subjectId",
      'revision', claim_record."revision"
    );
  END IF;

  IF claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType"::TEXT IS DISTINCT FROM expected_type
     OR claim_record."subjectId" IS DISTINCT FROM expected_subject
     OR claim_record."revision" IS DISTINCT FROM expected_revision
  THEN
    RAISE EXCEPTION 'Identity email claim changed before transition'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    UPDATE public."IdentityEmailClaim"
    SET
      "claimType" = target_type::public."IdentityEmailClaimType",
      "subjectId" = target_subject,
      "revision" = expected_revision + 1,
      "updatedAt" = pg_catalog.clock_timestamp()
    WHERE "emailCanonical" = canonical_email
      AND "tenantId" = tenant_id
      AND "claimType" = expected_type::public."IdentityEmailClaimType"
      AND "subjectId" = expected_subject
      AND "revision" = expected_revision
    RETURNING *
    INTO claim_record;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Identity claim destination is not available'
        USING
          ERRCODE = '23505',
          DETAIL = 'A conflicting subject claim already exists.';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity email claim changed before transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'TRANSITION_INVITE',
    'decision', 'TRANSITIONED',
    'claimType', claim_record."claimType"::TEXT,
    'tenantId', claim_record."tenantId",
    'subjectId', claim_record."subjectId",
    'revision', claim_record."revision"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_release_v2"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_claim_type TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
  tenant_id TEXT;
  expected_type TEXT;
  subject_id TEXT;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.btrim(expected_tenant_id);
  expected_type := pg_catalog.upper(
    pg_catalog.btrim(expected_claim_type) COLLATE "C"
  );
  subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_subject_id) COLLATE "C"
  );

  IF tenant_id IS NULL
     OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR (tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_type IS DISTINCT FROM 'INVITE'
     OR expected_revision IS NULL
     OR expected_revision < 1
     OR subject_id IS NULL
     OR subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity claim release input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);
  canonical_email :=
    public."identity_email_claim_lock_v1"(candidate_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = canonical_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity email claim was not found'
      USING ERRCODE = '23503';
  END IF;

  IF claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType"::TEXT IS DISTINCT FROM expected_type
     OR claim_record."subjectId" IS DISTINCT FROM subject_id
     OR claim_record."revision" IS DISTINCT FROM expected_revision
  THEN
    RAISE EXCEPTION 'Identity email claim changed before release'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."User" AS bound_user
    WHERE bound_user."id" = subject_id
  ) THEN
    RAISE EXCEPTION 'Identity email claim is bound and cannot be released'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."UserInvite" AS bound_invite
    WHERE bound_invite."id" = subject_id
      AND (
        bound_invite."tenantId" IS DISTINCT FROM tenant_id
        OR bound_invite."email" IS NULL
        OR pg_catalog.lower(
          pg_catalog.btrim(bound_invite."email") COLLATE "C"
        ) IS DISTINCT FROM canonical_email
        OR bound_invite."acceptedAt" IS NOT NULL
        OR bound_invite."revokedAt" IS NULL
        OR bound_invite."identityClaimRevision" IS DISTINCT FROM
          expected_revision
      )
  ) THEN
    RAISE EXCEPTION 'Identity email claim is bound and cannot be released'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public."IdentityEmailClaim"
  WHERE "emailCanonical" = canonical_email
    AND "tenantId" = tenant_id
    AND "claimType" = 'INVITE'::public."IdentityEmailClaimType"
    AND "subjectId" = subject_id
    AND "revision" = expected_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity email claim changed before release'
      USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'operation', 'RELEASE_INVITE',
    'decision', 'RELEASED',
    'tenantId', tenant_id,
    'subjectId', subject_id,
    'releasedRevision', expected_revision
  );
END;
$$;

-- The superseded v1 writers remain discoverable only as owner-only immediate
-- fail-closed stubs. They perform no validation, lock, relation read or DML.
CREATE OR REPLACE FUNCTION public."identity_email_claim_reserve_invite_v1"(
  candidate_email TEXT,
  requested_tenant_id TEXT,
  requested_subject_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_transition_v1"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_claim_type TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER,
  next_claim_type TEXT,
  next_subject_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_release_v1"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_claim_type TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public."identity_email_claim_assert_invite_v1"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
  tenant_id TEXT;
  subject_id TEXT;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
BEGIN
  tenant_id := pg_catalog.btrim(expected_tenant_id);
  subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_subject_id) COLLATE "C"
  );

  IF tenant_id IS NULL
     OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR (tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_revision IS NULL
     OR expected_revision < 1
     OR subject_id IS NULL
     OR subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity claim assertion input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);
  canonical_email :=
    public."identity_email_claim_lock_v1"(candidate_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = canonical_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity email claim was not found'
      USING ERRCODE = '23503';
  END IF;

  IF claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
     OR claim_record."subjectId" IS DISTINCT FROM subject_id
     OR claim_record."revision" IS DISTINCT FROM expected_revision
  THEN
    RAISE EXCEPTION 'Identity email claim changed before assertion'
      USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_INVITE',
    'decision', 'MATCHED',
    'claimType', 'INVITE',
    'tenantId', claim_record."tenantId",
    'subjectId', claim_record."subjectId",
    'revision', claim_record."revision"
  );
END;
$$;

CREATE OR REPLACE FUNCTION
  public."identity_email_claim_assert_invite_locator_v1"(
    requested_workflow_locator TEXT,
    expected_tenant_id TEXT,
    expected_subject_id TEXT,
    expected_revision INTEGER
  )
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  workflow_locator TEXT;
  tenant_id TEXT;
  subject_id TEXT;
  canonical_email TEXT;
  locked_canonical_email TEXT;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
BEGIN
  workflow_locator := pg_catalog.lower(
    pg_catalog.btrim(requested_workflow_locator) COLLATE "C"
  );
  tenant_id := pg_catalog.btrim(expected_tenant_id);
  subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_subject_id) COLLATE "C"
  );

  IF workflow_locator IS NULL
     OR workflow_locator !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR tenant_id IS NULL
     OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR (tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR subject_id IS NULL
     OR subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_revision IS NULL
     OR expected_revision < 1
  THEN
    RAISE EXCEPTION 'Identity activation locator input is invalid'
      USING ERRCODE = '22023';
  END IF;

  tenant_id := public."identity_mail_tenant_lock_v1"(tenant_id);

  SELECT claim."emailCanonical"
  INTO canonical_email
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."workflowLocator" = workflow_locator
    AND claim."tenantId" = tenant_id
    AND claim."claimType" =
      'INVITE'::public."IdentityEmailClaimType"
    AND claim."subjectId" = subject_id
    AND claim."revision" = expected_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity activation locator was not found'
      USING ERRCODE = '23503';
  END IF;

  locked_canonical_email :=
    public."identity_email_claim_lock_v1"(canonical_email);

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."emailCanonical" = locked_canonical_email
    AND claim."workflowLocator" = workflow_locator
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity activation locator changed before assertion'
      USING ERRCODE = '23514';
  END IF;

  IF claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
     OR claim_record."subjectId" IS DISTINCT FROM subject_id
     OR claim_record."revision" IS DISTINCT FROM expected_revision
  THEN
    RAISE EXCEPTION 'Identity activation locator claim does not match'
      USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_INVITE_LOCATOR',
    'decision', 'MATCHED',
    'claimType', 'INVITE',
    'tenantId', claim_record."tenantId",
    'subjectId', claim_record."subjectId",
    'workflowLocator', claim_record."workflowLocator",
    'revision', claim_record."revision"
  );
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_reserve_invite_v2"(
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_assert_invite_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_assert_invite_locator_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_transition_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_release_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_reserve_invite_v1"(
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_transition_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_email_claim_release_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_email_claim_reserve_invite_v2"(
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_182 NOT_DEPLOYABLE tenant-first reservation boundary; exact receipt compatibility is retained.';

COMMENT ON FUNCTION public."identity_email_claim_assert_invite_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'CURRENT_182 NOT_DEPLOYABLE tenant-first exact invite assertion; the tenant lock precedes the email and claim locks.';

COMMENT ON FUNCTION
  public."identity_email_claim_assert_invite_locator_v1"(
    TEXT,
    TEXT,
    TEXT,
    INTEGER
  ) IS
  'CURRENT_182 NOT_DEPLOYABLE tenant-first locator assertion; no relation lookup precedes the tenant lock.';

COMMENT ON FUNCTION public."identity_email_claim_transition_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT
) IS
  'CURRENT_182 NOT_DEPLOYABLE tenant-first INVITE transition boundary; exact receipt compatibility is retained.';

COMMENT ON FUNCTION public."identity_email_claim_release_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'CURRENT_182 NOT_DEPLOYABLE tenant-first INVITE release boundary; exact receipt compatibility is retained.';

COMMENT ON FUNCTION public."identity_email_claim_reserve_invite_v1"(
  TEXT,
  TEXT,
  TEXT
) IS
  'CURRENT_182 immediate fail-closed stub. The legacy reservation writer is retired before validation, locks, relation reads or DML.';

COMMENT ON FUNCTION public."identity_email_claim_transition_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT
) IS
  'CURRENT_182 immediate fail-closed stub. The legacy transition writer is retired before validation, locks, relation reads or DML.';

COMMENT ON FUNCTION public."identity_email_claim_release_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'CURRENT_182 immediate fail-closed stub. The legacy release writer is retired before validation, locks, relation reads or DML.';

DO $postcondition$
DECLARE
  migration_owner_oid OID;
  invalid_routine_count INTEGER;
  unexpected_overload_count INTEGER;
  unsafe_function_acl_count INTEGER;
BEGIN
  SELECT relation.relowner
  INTO migration_owner_oid
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    pg_catalog.to_regclass('public."IdentityEmailClaim"');

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
        '31c675561131be5f7b8b20b417567d084fda580da2f6d449eae9470b3808e817'
      ),
      (
        'public."identity_email_claim_reserve_invite_v2"(text,text,text)',
        'identity_email_claim_reserve_invite_v2',
        true,
        'jsonb',
        'd8e6dfb1634be66e6a4f3be87fc480f2e4a5aba417a97e26eff8ccdefbaed6b5'
      ),
      (
        'public."identity_email_claim_assert_invite_v1"(text,text,text,integer)',
        'identity_email_claim_assert_invite_v1',
        true,
        'jsonb',
        '148532adcee88fe3dd309912d0929e53cb8c3a71c4c838bfa50535df21046bed'
      ),
      (
        'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
        'identity_email_claim_assert_invite_locator_v1',
        true,
        'jsonb',
        '59d2de1db1405e4c9cf66b3ba25cfe341639f92b293173280f0e36e059a8050d'
      ),
      (
        'public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)',
        'identity_email_claim_transition_v2',
        true,
        'jsonb',
        'e6b34e1044f9ffa7dffd95eb09ac7e4f08e640d7ef6146b99bf9c42ed3802775'
      ),
      (
        'public."identity_email_claim_release_v2"(text,text,text,text,integer)',
        'identity_email_claim_release_v2',
        true,
        'jsonb',
        '39e553ed4e89ff2054a8b462827175779cf6829fde36f02e28cafca64310ac12'
      ),
      (
        'public."identity_email_claim_reserve_invite_v1"(text,text,text)',
        'identity_email_claim_reserve_invite_v1',
        true,
        'jsonb',
        'cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef'
      ),
      (
        'public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)',
        'identity_email_claim_transition_v1',
        true,
        'jsonb',
        'cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef'
      ),
      (
        'public."identity_email_claim_release_v1"(text,text,text,text,integer)',
        'identity_email_claim_release_v1',
        true,
        'jsonb',
        'cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef'
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
     OR routine.proisstrict IS DISTINCT FROM false
     OR routine.proleakproof IS DISTINCT FROM false
     OR routine.proretset IS DISTINCT FROM false
     OR routine.pronargdefaults IS DISTINCT FROM 0
     OR routine.proargdefaults IS NOT NULL
     OR routine.provariadic IS DISTINCT FROM 0::OID
     OR routine.proallargtypes IS NOT NULL
     OR routine.proargmodes IS NOT NULL
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(routine.prosrc, 'UTF8')
       ),
       'hex'
     ) IS DISTINCT FROM expected."prosrc_sha256";

  IF invalid_routine_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_182 routine catalog or body pin is unsafe'
      USING ERRCODE = '55000';
  END IF;

  WITH expected("routine_name") AS (
    VALUES
      ('identity_mail_tenant_lock_v1'),
      ('identity_email_claim_reserve_invite_v2'),
      ('identity_email_claim_assert_invite_v1'),
      ('identity_email_claim_assert_invite_locator_v1'),
      ('identity_email_claim_transition_v2'),
      ('identity_email_claim_release_v2'),
      ('identity_email_claim_reserve_invite_v1'),
      ('identity_email_claim_transition_v1'),
      ('identity_email_claim_release_v1')
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO unexpected_overload_count
  FROM expected
  INNER JOIN LATERAL (
    SELECT pg_catalog.count(*)::INTEGER AS "overload_count"
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.pronamespace = pg_catalog.to_regnamespace('public')
      AND routine.proname = expected."routine_name"
  ) AS actual
    ON actual."overload_count" <> 1;

  IF unexpected_overload_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_182 has an unexpected routine overload'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO unsafe_function_acl_count
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      routine.proacl,
      pg_catalog.acldefault('f', routine.proowner)
    )
  ) AS privilege
  WHERE routine.oid IN (
      pg_catalog.to_regprocedure(
        'public."identity_mail_tenant_lock_v1"(text)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_reserve_invite_v2"(text,text,text)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_assert_invite_v1"(text,text,text,integer)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_release_v2"(text,text,text,text,integer)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_reserve_invite_v1"(text,text,text)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)'
      ),
      pg_catalog.to_regprocedure(
        'public."identity_email_claim_release_v1"(text,text,text,text,integer)'
      )
    )
    AND privilege.privilege_type = 'EXECUTE'
    AND privilege.grantee <> routine.proowner;

  IF unsafe_function_acl_count <> 0 THEN
    RAISE EXCEPTION 'CURRENT_182 routine ACL is not owner-only'
      USING ERRCODE = '42501';
  END IF;
END;
$postcondition$;

COMMIT;
