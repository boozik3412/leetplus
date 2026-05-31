-- Add duplicate-safe scheduler journal for staff recurring task rules.
ALTER TABLE "StaffTaskRecurringRule"
  ADD COLUMN "lastAutomaticRunAt" TIMESTAMP(3);

CREATE TABLE "StaffTaskRecurringRuleRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "createdTaskId" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffTaskRecurringRuleRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_task_rule_run_unique"
  ON "StaffTaskRecurringRuleRun"("ruleId", "scheduledFor");

CREATE INDEX "staff_task_rule_run_status_idx"
  ON "StaffTaskRecurringRuleRun"("tenantId", "status", "scheduledFor");

CREATE INDEX "staff_task_rule_run_started_idx"
  ON "StaffTaskRecurringRuleRun"("tenantId", "startedAt");

CREATE INDEX "staff_task_rule_run_task_idx"
  ON "StaffTaskRecurringRuleRun"("createdTaskId");

ALTER TABLE "StaffTaskRecurringRuleRun"
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRuleRun"
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "StaffTaskRecurringRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRuleRun"
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_createdTaskId_fkey"
  FOREIGN KEY ("createdTaskId") REFERENCES "StaffTask"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
