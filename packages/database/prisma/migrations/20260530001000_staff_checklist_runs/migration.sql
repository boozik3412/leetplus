CREATE TABLE "StaffChecklistRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "regulationId" TEXT NOT NULL,
  "storeId" TEXT,
  "shiftId" TEXT,
  "createdByUserId" TEXT,
  "assignedToUserId" TEXT,
  "reviewedByUserId" TEXT,
  "title" TEXT NOT NULL,
  "shiftKind" TEXT NOT NULL DEFAULT 'OPENING',
  "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "regulationVersion" INTEGER NOT NULL DEFAULT 1,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "sectionsSnapshot" JSONB NOT NULL,
  "answers" JSONB NOT NULL,
  "scoreTotal" INTEGER NOT NULL DEFAULT 0,
  "scoreEarned" INTEGER NOT NULL DEFAULT 0,
  "requiredItemsTotal" INTEGER NOT NULL DEFAULT 0,
  "requiredItemsDone" INTEGER NOT NULL DEFAULT 0,
  "evidenceTotal" INTEGER NOT NULL DEFAULT 0,
  "evidenceDone" INTEGER NOT NULL DEFAULT 0,
  "failedItems" INTEGER NOT NULL DEFAULT 0,
  "blockingIssues" JSONB,
  "reviewComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffChecklistRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_checklist_run_status_schedule_idx" ON "StaffChecklistRun"("tenantId", "status", "scheduledAt");
CREATE INDEX "staff_checklist_run_kind_created_idx" ON "StaffChecklistRun"("tenantId", "shiftKind", "createdAt");
CREATE INDEX "staff_checklist_run_regulation_idx" ON "StaffChecklistRun"("regulationId");
CREATE INDEX "staff_checklist_run_store_idx" ON "StaffChecklistRun"("storeId");
CREATE INDEX "staff_checklist_run_shift_idx" ON "StaffChecklistRun"("shiftId");
CREATE INDEX "staff_checklist_run_created_by_idx" ON "StaffChecklistRun"("createdByUserId");
CREATE INDEX "staff_checklist_run_assigned_to_idx" ON "StaffChecklistRun"("assignedToUserId");
CREATE INDEX "staff_checklist_run_reviewed_by_idx" ON "StaffChecklistRun"("reviewedByUserId");

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_regulationId_fkey"
  FOREIGN KEY ("regulationId") REFERENCES "StaffShiftRegulation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "GuestWorkingShift"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffChecklistRun"
  ADD CONSTRAINT "StaffChecklistRun_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
