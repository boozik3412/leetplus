BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- The shell reservation id must remain addressable after subjectId moves from
-- the unbound reservation to a real UserInvite and eventually to a User.
-- Existing application writers already use UUID subjects; fail the migration
-- closed if an owner-only/manual row violated that prerequisite.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."IdentityEmailClaim" AS claim
    WHERE claim."subjectId" IS NULL
      OR claim."subjectId" IS DISTINCT FROM pg_catalog.lower(
        pg_catalog.btrim(claim."subjectId") COLLATE "C"
      )
      OR (claim."subjectId" COLLATE "C") !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Identity activation locator backfill requires canonical UUID subjects'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public."IdentityEmailClaim"
  ADD COLUMN "workflowLocator" TEXT;

-- The revision guard intentionally rejects non-CAS updates. Disable only that
-- named user trigger for the bounded one-time backfill, then restore it in the
-- same transaction before making the column mandatory.
ALTER TABLE public."IdentityEmailClaim"
  DISABLE TRIGGER "IdentityEmailClaim_revision_guard_trigger";

UPDATE public."IdentityEmailClaim"
SET "workflowLocator" = pg_catalog.lower(
  pg_catalog.btrim("subjectId") COLLATE "C"
);

ALTER TABLE public."IdentityEmailClaim"
  ENABLE TRIGGER "IdentityEmailClaim_revision_guard_trigger";

ALTER TABLE public."IdentityEmailClaim"
  ALTER COLUMN "workflowLocator" SET NOT NULL,
  ADD CONSTRAINT "IdentityEmailClaim_workflow_locator_check"
  CHECK (
    "workflowLocator" =
      pg_catalog.lower(pg_catalog.btrim("workflowLocator") COLLATE "C")
    AND ("workflowLocator" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

CREATE UNIQUE INDEX "identity_email_claim_workflow_locator_uidx"
  ON public."IdentityEmailClaim" ("workflowLocator")
  WHERE "claimType" IN (
    'INVITE'::public."IdentityEmailClaimType",
    'USER'::public."IdentityEmailClaimType"
  );

COMMENT ON COLUMN public."IdentityEmailClaim"."workflowLocator" IS
  'Immutable opaque workflow UUID. It remains stable when subjectId transitions and is never an email or authorization grant.';

-- Keep reserve_v1/v2 source compatible: their INSERT statements omit the new
-- column and this trigger derives it from the initial UUID subject. Explicit
-- owner writes may provide only the same canonical UUID.
CREATE OR REPLACE FUNCTION public."identity_email_claim_revision_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  initial_locator TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."revision" IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Identity email claim must start at revision one'
        USING ERRCODE = '23514';
    END IF;

    initial_locator := pg_catalog.lower(
      pg_catalog.btrim(NEW."subjectId") COLLATE "C"
    );

    IF initial_locator IS NULL
       OR NEW."subjectId" IS DISTINCT FROM initial_locator
       OR initial_locator !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR (
         NEW."workflowLocator" IS NOT NULL
         AND NEW."workflowLocator" IS DISTINCT FROM initial_locator
       )
    THEN
      RAISE EXCEPTION 'Identity workflow locator is invalid'
        USING ERRCODE = '23514';
    END IF;

    NEW."workflowLocator" := initial_locator;
    NEW."updatedAt" := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  IF NEW."emailCanonical" IS DISTINCT FROM OLD."emailCanonical" THEN
    RAISE EXCEPTION 'Identity email claim key is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" THEN
    RAISE EXCEPTION 'Identity email claim tenant is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."workflowLocator" IS DISTINCT FROM OLD."workflowLocator" THEN
    RAISE EXCEPTION 'Identity workflow locator is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Identity email claim creation timestamp is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."revision" IS DISTINCT FROM OLD."revision" + 1 THEN
    RAISE EXCEPTION 'Identity email claim revision must advance exactly once'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (
      OLD."claimType" = 'INVITE'::public."IdentityEmailClaimType"
      AND NEW."claimType" IN (
        'INVITE'::public."IdentityEmailClaimType",
        'USER'::public."IdentityEmailClaimType"
      )
    )
    OR (
      OLD."claimType" = 'EMAIL_CHANGE'::public."IdentityEmailClaimType"
      AND NEW."claimType" IN (
        'EMAIL_CHANGE'::public."IdentityEmailClaimType",
        'USER'::public."IdentityEmailClaimType"
      )
    )
  ) THEN
    RAISE EXCEPTION 'Identity email claim transition is not allowed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."subjectId" IS NOT DISTINCT FROM OLD."subjectId" THEN
    RAISE EXCEPTION 'Identity email claim transition requires a new subject'
      USING ERRCODE = '23514';
  END IF;

  initial_locator := pg_catalog.lower(
    pg_catalog.btrim(NEW."subjectId") COLLATE "C"
  );

  IF initial_locator IS NULL
     OR NEW."subjectId" IS DISTINCT FROM initial_locator
     OR initial_locator !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity email claim transition subject is invalid'
      USING ERRCODE = '23514';
  END IF;

  NEW."updatedAt" := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public."identity_email_claim_revision_guard_v1"()
FROM PUBLIC;

-- The first lookup is bounded by the unique locator index and deliberately
-- takes no row lock. Existing email-based writers acquire the advisory email
-- lock first, so this function must discover the canonical key, take the same
-- advisory lock, and only then lock/recheck the row to avoid lock inversion.
CREATE FUNCTION public."identity_email_claim_assert_invite_locator_v1"(
  requested_workflow_locator TEXT,
  expected_tenant_id TEXT,
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
     OR pg_catalog.char_length(tenant_id) NOT BETWEEN 1 AND 200
     OR tenant_id IS DISTINCT FROM expected_tenant_id
     OR subject_id IS NULL
     OR subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_revision IS NULL
     OR expected_revision < 1
  THEN
    RAISE EXCEPTION 'Identity activation locator input is invalid'
      USING ERRCODE = '22023';
  END IF;

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

REVOKE ALL
ON FUNCTION public."identity_email_claim_assert_invite_locator_v1"(
  TEXT,
  TEXT,
  TEXT,
  INTEGER
)
FROM PUBLIC;

COMMENT ON FUNCTION
  public."identity_email_claim_assert_invite_locator_v1"(
    TEXT,
    TEXT,
    TEXT,
    INTEGER
  ) IS
  'Private PII-free activation lookup boundary. It resolves an immutable opaque UUID, acquires the canonical email advisory lock, and rechecks an exact INVITE claim without returning the email.';

REVOKE ALL ON TABLE public."IdentityEmailClaim" FROM PUBLIC;

COMMIT;
