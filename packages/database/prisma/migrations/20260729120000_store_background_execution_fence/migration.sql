BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "Store"
  ADD COLUMN "backgroundExecutionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Store_executionRevision_nonnegative_check"
    CHECK ("executionRevision" >= 0),
  ADD CONSTRAINT "Store_backgroundExecution_requires_active_check"
    CHECK (NOT "backgroundExecutionEnabled" OR "isActive");

CREATE OR REPLACE FUNCTION public."store_execution_revision_fence"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  policy_changed BOOLEAN;
  is_archiving BOOLEAN;
  authority_reduced BOOLEAN;
BEGIN
  -- Store creation is deliberately fail-closed. Enabling background execution
  -- is a separate, audited control-plane transition after provisioning.
  IF TG_OP = 'INSERT' THEN
    IF NEW."backgroundExecutionEnabled" IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'New Store must start with background execution disabled'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."executionRevision" IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'Store execution revision is trigger-owned'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  -- Reject a caller-supplied revision even when a policy field changes in the
  -- same statement. Only this trigger may advance the fence.
  IF OLD."executionRevision" IS DISTINCT FROM NEW."executionRevision" THEN
    RAISE EXCEPTION 'Store execution revision is trigger-owned'
      USING ERRCODE = '23514';
  END IF;

  is_archiving :=
    OLD."isActive" IS TRUE
    AND NEW."isActive" IS FALSE;

  IF is_archiving THEN
    -- Direct archive DML is fail-safe: revocation is part of the same row
    -- update and cannot leave background effects enabled.
    NEW."backgroundExecutionEnabled" := false;
  ELSIF
    NEW."isActive" IS FALSE
    AND NEW."backgroundExecutionEnabled" IS TRUE
  THEN
    RAISE EXCEPTION 'Inactive Store cannot enable background execution'
      USING ERRCODE = '23514';
  END IF;

  policy_changed :=
    OLD."isActive" IS DISTINCT FROM NEW."isActive"
    OR OLD."gamificationEnabled" IS DISTINCT FROM NEW."gamificationEnabled"
    OR OLD."backgroundExecutionEnabled" IS DISTINCT FROM NEW."backgroundExecutionEnabled"
    OR OLD."integrationSourceId" IS DISTINCT FROM NEW."integrationSourceId"
    OR OLD."externalProvider" IS DISTINCT FROM NEW."externalProvider"
    OR OLD."externalDomain" IS DISTINCT FROM NEW."externalDomain"
    OR OLD."externalClubId" IS DISTINCT FROM NEW."externalClubId";

  IF policy_changed THEN
    IF OLD."executionRevision" >= 2147483647 THEN
      RAISE EXCEPTION 'Store execution revision is exhausted'
        USING ERRCODE = '22003';
    ELSIF OLD."executionRevision" = 2147483646 THEN
      authority_reduced :=
        (
          OLD."backgroundExecutionEnabled" IS TRUE
          AND NEW."backgroundExecutionEnabled" IS FALSE
        )
        OR (
          OLD."isActive" IS TRUE
          AND NEW."isActive" IS FALSE
        );

      IF
        NOT authority_reduced
        OR NEW."backgroundExecutionEnabled" IS TRUE
      THEN
        RAISE EXCEPTION
          'Store execution revision permits only one terminal revocation'
          USING ERRCODE = '22003';
      END IF;

      -- Revision 2147483647 is a terminal, fail-closed state. The final
      -- monotonic transition can only revoke background authority.
      NEW."executionRevision" := 2147483647;
    ELSE
      NEW."executionRevision" := OLD."executionRevision" + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public."store_execution_revision_fence"() FROM PUBLIC;

CREATE TRIGGER "Store_execution_revision_fence_trigger"
BEFORE INSERT OR UPDATE OF
  "isActive",
  "gamificationEnabled",
  "backgroundExecutionEnabled",
  "integrationSourceId",
  "externalProvider",
  "externalDomain",
  "externalClubId",
  "executionRevision"
ON "Store"
FOR EACH ROW
EXECUTE FUNCTION public."store_execution_revision_fence"();

COMMIT;
