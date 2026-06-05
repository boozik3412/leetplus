CREATE TABLE "BusinessSnapshotRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "staleAfterHours" INTEGER NOT NULL DEFAULT 24,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "sourceCounts" JSONB,
  "summary" JSONB,
  "freshness" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessSnapshotRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessSnapshotRun_tenantId_type_startedAt_idx" ON "BusinessSnapshotRun"("tenantId", "type", "startedAt");
CREATE INDEX "BusinessSnapshotRun_tenantId_status_idx" ON "BusinessSnapshotRun"("tenantId", "status");
CREATE INDEX "BusinessSnapshotRun_type_startedAt_idx" ON "BusinessSnapshotRun"("type", "startedAt");

ALTER TABLE "BusinessSnapshotRun"
  ADD CONSTRAINT "BusinessSnapshotRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
