ALTER TABLE "StaffTask"
ADD COLUMN "sourceRecurringRuleId" TEXT;

CREATE TABLE "StaffTaskRecurringRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "assignedToUserId" TEXT,
    "lastCreatedTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "taskType" TEXT NOT NULL DEFAULT 'RECURRING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "timeOfDay" TEXT,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "dueOffsetMinutes" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastManualRunAt" TIMESTAMP(3),
    "labels" JSONB,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTaskRecurringRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_task_source_recurring_rule_idx"
ON "StaffTask"("sourceRecurringRuleId");

CREATE INDEX "staff_task_rule_status_cadence_idx"
ON "StaffTaskRecurringRule"("tenantId", "status", "cadence");

CREATE INDEX "staff_task_rule_next_run_idx"
ON "StaffTaskRecurringRule"("tenantId", "nextRunAt");

CREATE INDEX "staff_task_rule_template_idx"
ON "StaffTaskRecurringRule"("templateId");

CREATE INDEX "staff_task_rule_store_idx"
ON "StaffTaskRecurringRule"("storeId");

CREATE INDEX "staff_task_rule_created_by_idx"
ON "StaffTaskRecurringRule"("createdByUserId");

CREATE INDEX "staff_task_rule_assigned_to_idx"
ON "StaffTaskRecurringRule"("assignedToUserId");

CREATE INDEX "staff_task_rule_last_task_idx"
ON "StaffTaskRecurringRule"("lastCreatedTaskId");

ALTER TABLE "StaffTask"
ADD CONSTRAINT "StaffTask_sourceRecurringRuleId_fkey"
FOREIGN KEY ("sourceRecurringRuleId") REFERENCES "StaffTaskRecurringRule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "StaffTaskTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_assignedToUserId_fkey"
FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskRecurringRule"
ADD CONSTRAINT "StaffTaskRecurringRule_lastCreatedTaskId_fkey"
FOREIGN KEY ("lastCreatedTaskId") REFERENCES "StaffTask"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
