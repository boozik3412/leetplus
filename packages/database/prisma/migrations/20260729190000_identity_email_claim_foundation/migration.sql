BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- The first shared-beta OWNER must reserve one canonical email globally before
-- a UserInvite or User can exist. This additive migration deliberately does not
-- backfill legacy users/invites and does not enable the external provisioning
-- endpoint; both actions require a separately admitted reconciliation.
CREATE TYPE "IdentityEmailClaimType" AS ENUM (
  'INVITE',
  'USER',
  'EMAIL_CHANGE'
);

CREATE TABLE "IdentityEmailClaim" (
  "emailCanonical" VARCHAR(320) NOT NULL,
  "claimType" "IdentityEmailClaimType" NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IdentityEmailClaim_pkey" PRIMARY KEY ("emailCanonical"),
  CONSTRAINT "IdentityEmailClaim_email_canonical_check" CHECK (
    char_length("emailCanonical") BETWEEN 3 AND 320
    AND "emailCanonical" = btrim("emailCanonical")
    AND "emailCanonical" = lower("emailCanonical" COLLATE "C")
    AND ("emailCanonical" COLLATE "C") ~ '^[!-~]+$'
    AND ("emailCanonical" COLLATE "C")
      ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT "IdentityEmailClaim_subject_check" CHECK (
    char_length("subjectId") BETWEEN 1 AND 200
    AND "subjectId" = btrim("subjectId")
  ),
  CONSTRAINT "IdentityEmailClaim_revision_positive_check" CHECK (
    "revision" >= 1
  )
);

CREATE INDEX "identity_email_claim_tenant_subject_idx"
  ON "IdentityEmailClaim" ("tenantId", "subjectId");

CREATE INDEX "identity_email_claim_tenant_type_idx"
  ON "IdentityEmailClaim" ("tenantId", "claimType");

REVOKE ALL ON TABLE public."IdentityEmailClaim" FROM PUBLIC;

ALTER TABLE "IdentityEmailClaim"
  ADD CONSTRAINT "IdentityEmailClaim_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- Every provision/issue/accept/reissue/revoke/email-change command must acquire
-- this exact transaction-scoped namespace before inspecting or mutating a
-- claim. The helper returns the canonical value so application code cannot
-- accidentally lock one spelling and persist another.
CREATE FUNCTION public."identity_email_claim_lock_v1"(
  candidate_email TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  canonical_email TEXT;
BEGIN
  IF candidate_email IS NULL THEN
    RAISE EXCEPTION 'Identity email is required'
      USING ERRCODE = '22023';
  END IF;

  canonical_email := lower(btrim(candidate_email) COLLATE "C");

  IF char_length(canonical_email) NOT BETWEEN 3 AND 320
     OR (canonical_email COLLATE "C") !~ '^[!-~]+$'
     OR (canonical_email COLLATE "C")
       !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Identity email is not a supported canonical address'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity-email:v1:' || canonical_email, 167)
  );

  RETURN canonical_email;
END;
$$;

REVOKE ALL ON FUNCTION public."identity_email_claim_lock_v1"(TEXT)
  FROM PUBLIC;

COMMENT ON FUNCTION public."identity_email_claim_lock_v1"(TEXT) IS
  'Private transaction lock and ASCII canonicalization boundary for global identity email claims. Runtime EXECUTE must be granted explicitly.';

-- The claim key and tenant are immutable. A legitimate INVITE -> USER,
-- reissue, or email-change transition must advance revision exactly once.
CREATE FUNCTION public."identity_email_claim_revision_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."revision" IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'Identity email claim must start at revision one'
        USING ERRCODE = '23514';
    END IF;

    NEW."updatedAt" := clock_timestamp();
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

  NEW."updatedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."identity_email_claim_revision_guard_v1"()
  FROM PUBLIC;

CREATE TRIGGER "IdentityEmailClaim_revision_guard_trigger"
BEFORE INSERT OR UPDATE ON "IdentityEmailClaim"
FOR EACH ROW
EXECUTE FUNCTION public."identity_email_claim_revision_guard_v1"();

COMMENT ON TABLE "IdentityEmailClaim" IS
  'Global canonical email reservation for initial OWNER and later identity workflows; not authorization to issue or deliver an invite.';

COMMIT;
