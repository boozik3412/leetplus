ALTER TABLE "GuestActivityFact"
DROP CONSTRAINT IF EXISTS "GuestActivityFact_rawRecordId_fkey";

ALTER TABLE "GuestActivityFact"
ADD CONSTRAINT "GuestActivityFact_rawRecordId_fkey"
FOREIGN KEY ("rawRecordId") REFERENCES "GuestActivityRawRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GuestGameDataRetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rawRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "factRetentionDays" INTEGER NOT NULL DEFAULT 1095,
    "decisionRetentionDays" INTEGER NOT NULL DEFAULT 1095,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 1095,
    "liveCleanupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuestGameDataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameDataRetentionRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "rawCutoff" TIMESTAMP(3) NOT NULL,
    "factCutoff" TIMESTAMP(3) NOT NULL,
    "decisionCutoff" TIMESTAMP(3) NOT NULL,
    "auditCutoff" TIMESTAMP(3) NOT NULL,
    "candidates" JSONB,
    "deleted" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestGameDataRetentionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestGameDataRetentionPolicy_tenantId_key"
ON "GuestGameDataRetentionPolicy"("tenantId");
CREATE INDEX "guest_game_retention_policy_live_idx"
ON "GuestGameDataRetentionPolicy"("tenantId", "liveCleanupEnabled");
CREATE UNIQUE INDEX "GuestGameDataRetentionRun_runKey_key"
ON "GuestGameDataRetentionRun"("runKey");
CREATE INDEX "guest_game_retention_run_tenant_idx"
ON "GuestGameDataRetentionRun"("tenantId", "startedAt");
CREATE INDEX "guest_game_retention_run_status_idx"
ON "GuestGameDataRetentionRun"("status", "startedAt");

ALTER TABLE "GuestGameDataRetentionPolicy"
ADD CONSTRAINT "GuestGameDataRetentionPolicy_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameDataRetentionRun"
ADD CONSTRAINT "GuestGameDataRetentionRun_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
