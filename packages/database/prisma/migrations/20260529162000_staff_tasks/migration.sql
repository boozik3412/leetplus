CREATE TABLE "StaffTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "shiftId" TEXT,
  "createdByUserId" TEXT,
  "assignedToUserId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL DEFAULT 'ONE_TIME',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "labels" JSONB,
  "checklist" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_task_status_due_idx" ON "StaffTask"("tenantId", "status", "dueAt");
CREATE INDEX "staff_task_created_idx" ON "StaffTask"("tenantId", "createdAt");
CREATE INDEX "staff_task_store_idx" ON "StaffTask"("storeId");
CREATE INDEX "staff_task_shift_idx" ON "StaffTask"("shiftId");
CREATE INDEX "staff_task_created_by_idx" ON "StaffTask"("createdByUserId");
CREATE INDEX "staff_task_assigned_to_idx" ON "StaffTask"("assignedToUserId");

ALTER TABLE "StaffTask"
  ADD CONSTRAINT "StaffTask_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "StaffTask"
  ADD CONSTRAINT "StaffTask_storeId_fkey"
  FOREIGN KEY ("storeId")
  REFERENCES "Store"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "StaffTask"
  ADD CONSTRAINT "StaffTask_shiftId_fkey"
  FOREIGN KEY ("shiftId")
  REFERENCES "GuestWorkingShift"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "StaffTask"
  ADD CONSTRAINT "StaffTask_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "StaffTask"
  ADD CONSTRAINT "StaffTask_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
