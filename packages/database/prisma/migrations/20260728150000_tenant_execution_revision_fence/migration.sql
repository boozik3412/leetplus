BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE "Tenant", "ReportDigestScheduleRun", "GuestBonusLedgerEntry"
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ReportDigestScheduleRun"
    WHERE "status" = 'RUNNING'
  ) THEN
    RAISE EXCEPTION
      'Tenant execution revision migration requires zero RUNNING report digest jobs'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GuestBonusLedgerEntry"
    WHERE "status" IN ('PROCESSING', 'DISPATCHING')
  ) THEN
    RAISE EXCEPTION
      'Tenant execution revision migration requires zero in-flight bonus ledger claims'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE "Tenant"
  ADD COLUMN "executionRevision" INTEGER NOT NULL DEFAULT 0;

UPDATE "Tenant"
SET "executionRevision" = 1;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_executionRevision_nonnegative_check"
  CHECK ("executionRevision" >= 0);

ALTER TABLE "ReportDigestScheduleRun"
  ADD COLUMN "executionRevision" INTEGER,
  ADD CONSTRAINT "ReportDigestScheduleRun_executionRevision_positive_check"
    CHECK ("executionRevision" IS NULL OR "executionRevision" > 0);

ALTER TABLE "GuestBonusLedgerEntry"
  ADD COLUMN "executionRevision" INTEGER,
  ADD COLUMN "claimGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "GuestBonusLedgerEntry_executionRevision_positive_check"
    CHECK ("executionRevision" IS NULL OR "executionRevision" > 0),
  ADD CONSTRAINT "GuestBonusLedgerEntry_claimGeneration_nonnegative_check"
    CHECK ("claimGeneration" >= 0);

-- Only the exact suspended/provisioning shell may omit its finite trial
-- window. Every other PILOT/BETA lifecycle state must carry a complete,
-- ordered window.
ALTER TABLE "Tenant"
  DROP CONSTRAINT "Tenant_external_stage_trial_check",
  ADD CONSTRAINT "Tenant_external_stage_trial_check"
    CHECK (
      "customerStage" NOT IN ('PILOT', 'BETA')
      OR (
        "trialStartsAt" IS NOT NULL
        AND "trialEndsAt" IS NOT NULL
        AND "trialStartsAt" < "trialEndsAt"
      )
      OR (
        "status" = 'SUSPENDED'
        AND "onboardingStatus" = 'PROVISIONING'
        AND "trialStartsAt" IS NULL
        AND "trialEndsAt" IS NULL
      )
    );

CREATE OR REPLACE FUNCTION "tenant_execution_revision_fence"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD."status" IS DISTINCT FROM NEW."status"
    OR OLD."customerStage" IS DISTINCT FROM NEW."customerStage"
    OR OLD."onboardingStatus" IS DISTINCT FROM NEW."onboardingStatus"
    OR OLD."trialStartsAt" IS DISTINCT FROM NEW."trialStartsAt"
    OR OLD."trialEndsAt" IS DISTINCT FROM NEW."trialEndsAt"
    OR OLD."entitlementProfileRevision" IS DISTINCT FROM NEW."entitlementProfileRevision"
  THEN
    IF OLD."executionRevision" >= 2147483647 THEN
      RAISE EXCEPTION 'Tenant execution revision is exhausted'
        USING ERRCODE = '22003';
    END IF;

    NEW."executionRevision" := OLD."executionRevision" + 1;
  ELSIF OLD."executionRevision" IS DISTINCT FROM NEW."executionRevision" THEN
    RAISE EXCEPTION 'Tenant execution revision is trigger-owned'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Tenant_execution_revision_fence_trigger"
BEFORE UPDATE OF
  "status",
  "customerStage",
  "onboardingStatus",
  "trialStartsAt",
  "trialEndsAt",
  "entitlementProfileRevision",
  "executionRevision"
ON "Tenant"
FOR EACH ROW
EXECUTE FUNCTION "tenant_execution_revision_fence"();

CREATE INDEX "report_digest_schedule_execution_revision_idx"
  ON "ReportDigestScheduleRun" ("tenantId", "executionRevision", "status");

CREATE INDEX "guest_bonus_ledger_execution_revision_idx"
  ON "GuestBonusLedgerEntry" ("tenantId", "executionRevision", "status");

COMMIT;
