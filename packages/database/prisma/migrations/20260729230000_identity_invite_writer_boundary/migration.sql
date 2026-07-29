BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Application workflows must persist the exact claim revision they asserted.
-- Legacy rows remain NULL until a separately admitted inventory/backfill; a
-- NULL provenance is fail-closed in every migrated writer.
ALTER TABLE public."UserInvite"
  ADD COLUMN "identityClaimRevision" INTEGER,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT;

ALTER TABLE public."User"
  ADD COLUMN "identityClaimRevision" INTEGER;

ALTER TABLE public."UserInvite"
  ADD CONSTRAINT "UserInvite_identity_claim_revision_positive_check"
  CHECK (
    "identityClaimRevision" IS NULL
    OR "identityClaimRevision" >= 1
  );

ALTER TABLE public."UserInvite"
  ADD CONSTRAINT "UserInvite_revoked_unaccepted_check"
  CHECK (
    "revokedAt" IS NULL
    OR "acceptedAt" IS NULL
  );

ALTER TABLE public."UserInvite"
  ADD CONSTRAINT "UserInvite_revoked_actor_requires_timestamp_check"
  CHECK (
    "revokedByUserId" IS NULL
    OR "revokedAt" IS NOT NULL
  );

ALTER TABLE public."UserInvite"
  ADD CONSTRAINT "UserInvite_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId")
  REFERENCES public."User" ("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "UserInvite_revokedByUserId_idx"
  ON public."UserInvite" ("revokedByUserId");

ALTER TABLE public."User"
  ADD CONSTRAINT "User_identity_claim_revision_positive_check"
  CHECK (
    "identityClaimRevision" IS NULL
    OR "identityClaimRevision" >= 1
  );

COMMENT ON COLUMN public."UserInvite"."identityClaimRevision" IS
  'Exact IdentityEmailClaim revision asserted by issue/reissue/accept/revoke. NULL means legacy provenance is not admitted.';

COMMENT ON COLUMN public."UserInvite"."revokedAt" IS
  'Explicit terminal revocation timestamp. Natural expiry alone does not authorize identity-claim release.';

COMMENT ON COLUMN public."UserInvite"."revokedByUserId" IS
  'Actor that explicitly revoked or superseded the invite; nullable after actor deletion.';

COMMENT ON COLUMN public."User"."identityClaimRevision" IS
  'Exact USER IdentityEmailClaim revision established by invite acceptance. NULL means legacy provenance is not admitted.';

-- The sealed boundary canonicalizes with lower(btrim(email) COLLATE "C").
-- These indexes keep its legacy collision checks bounded without asserting
-- that historical rows are already reconciled.
CREATE INDEX "user_identity_email_canonical_idx"
  ON public."User" (
    (pg_catalog.lower(pg_catalog.btrim("email") COLLATE "C"))
  );

CREATE INDEX "user_invite_live_identity_email_canonical_idx"
  ON public."UserInvite" (
    (pg_catalog.lower(pg_catalog.btrim("email") COLLATE "C"))
  )
  WHERE "email" IS NOT NULL
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL;

-- v2 excludes explicitly revoked invite history from the availability
-- preflight. Natural expiry remains non-owning for reservation purposes, while
-- a live non-revoked invite continues to block duplicate issuance.
CREATE FUNCTION public."identity_email_claim_reserve_invite_v2"(
  candidate_email TEXT,
  requested_tenant_id TEXT,
  requested_subject_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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
     OR pg_catalog.char_length(tenant_id) NOT BETWEEN 1 AND 200
     OR tenant_id IS DISTINCT FROM requested_tenant_id
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

REVOKE ALL
ON FUNCTION public."identity_email_claim_reserve_invite_v2"(TEXT, TEXT, TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION
  public."identity_email_claim_reserve_invite_v2"(TEXT, TEXT, TEXT) IS
  'Private SECURITY DEFINER boundary for an initial INVITE reservation. Explicitly revoked invite history does not block a new reservation.';

-- v2 validates the destination before both a first transition and an
-- ALREADY_TRANSITIONED replay. Inactive Users still own their email.
CREATE FUNCTION public."identity_email_claim_transition_v2"(
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
     OR pg_catalog.char_length(tenant_id) NOT BETWEEN 1 AND 200
     OR tenant_id IS DISTINCT FROM expected_tenant_id
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

REVOKE ALL
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

COMMENT ON FUNCTION public."identity_email_claim_transition_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT
) IS
  'Private SECURITY DEFINER CAS boundary for INVITE reissue or INVITE to USER promotion. Destination validation also applies to replay and inactive Users retain ownership.';

-- v2 may release either an unbound shell reservation or an exact retained
-- UserInvite that has an explicit revocation marker and is still unaccepted.
-- Natural expiry, live/accepted/mismatched, and USER-bound subjects remain
-- fail-closed.
CREATE FUNCTION public."identity_email_claim_release_v2"(
  candidate_email TEXT,
  expected_tenant_id TEXT,
  expected_claim_type TEXT,
  expected_subject_id TEXT,
  expected_revision INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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
     OR pg_catalog.char_length(tenant_id) NOT BETWEEN 1 AND 200
     OR tenant_id IS DISTINCT FROM expected_tenant_id
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

REVOKE ALL
ON FUNCTION public."identity_email_claim_release_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

COMMENT ON FUNCTION public."identity_email_claim_release_v2"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) IS
  'Private SECURITY DEFINER CAS boundary that releases an unbound reservation or exact retained terminal invite while preserving invite history.';

REVOKE ALL ON TABLE public."IdentityEmailClaim" FROM PUBLIC;

COMMIT;
