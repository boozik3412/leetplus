CREATE TABLE "ReportDigestScheduleRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "scheduledForDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportDigestScheduleRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReportDigestScheduleRun"
  ADD CONSTRAINT "ReportDigestScheduleRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "report_digest_schedule_tenant_type_date_uidx"
  ON "ReportDigestScheduleRun"("tenantId", "type", "scheduledForDate");

CREATE INDEX "report_digest_schedule_status_started_idx"
  ON "ReportDigestScheduleRun"("tenantId", "status", "startedAt");
