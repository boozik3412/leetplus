CREATE TABLE "GuestGameQualitySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncLagSecondsMax" INTEGER,
    "staleSyncCount" INTEGER NOT NULL DEFAULT 0,
    "failedSyncCount" INTEGER NOT NULL DEFAULT 0,
    "partialSyncCount" INTEGER NOT NULL DEFAULT 0,
    "pendingJobCount" INTEGER NOT NULL DEFAULT 0,
    "retryJobCount" INTEGER NOT NULL DEFAULT 0,
    "failedJobCount" INTEGER NOT NULL DEFAULT 0,
    "decisionRunCount" INTEGER NOT NULL DEFAULT 0,
    "pairedDecisionCount" INTEGER NOT NULL DEFAULT 0,
    "missingDecisionCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchedRunCount" INTEGER NOT NULL DEFAULT 0,
    "decisionCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shadowMismatchRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceCounts" JSONB,
    "syncStatusCounts" JSONB,
    "jobStatusCounts" JSONB,
    "eventMix" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestGameQualitySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameQualityAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'TENANT',
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuestGameQualityAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_quality_snapshot_tenant_idx"
ON "GuestGameQualitySnapshot"("tenantId", "measuredAt");
CREATE INDEX "guest_game_quality_snapshot_time_idx"
ON "GuestGameQualitySnapshot"("measuredAt");
CREATE UNIQUE INDEX "guest_game_quality_alert_scope_uidx"
ON "GuestGameQualityAlert"("tenantId", "code", "scopeKey");
CREATE INDEX "guest_game_quality_alert_status_idx"
ON "GuestGameQualityAlert"("tenantId", "status", "severity", "lastSeenAt");
CREATE INDEX "guest_game_quality_alert_code_idx"
ON "GuestGameQualityAlert"("code", "status", "lastSeenAt");

ALTER TABLE "GuestGameQualitySnapshot"
ADD CONSTRAINT "GuestGameQualitySnapshot_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameQualityAlert"
ADD CONSTRAINT "GuestGameQualityAlert_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
