ALTER TABLE "GuestActivityFact"
  ADD COLUMN "parserVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN "normalizationRunId" TEXT,
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "supersededAt" TIMESTAMP(3);

DROP INDEX "guest_activity_fact_hash_uidx";

CREATE UNIQUE INDEX "guest_activity_fact_hash_parser_uidx"
  ON "GuestActivityFact" ("tenantId", "factType", "sourceHash", "parserVersion");

CREATE INDEX "guest_activity_fact_lifecycle_idx"
  ON "GuestActivityFact" ("tenantId", "lifecycleStatus", "factType", "happenedAt");

CREATE INDEX "guest_activity_fact_parser_run_idx"
  ON "GuestActivityFact" ("tenantId", "parserVersion", "normalizationRunId");
