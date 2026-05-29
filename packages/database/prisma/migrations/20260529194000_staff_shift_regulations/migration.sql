CREATE TABLE "StaffShiftRegulation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "shiftKind" TEXT NOT NULL DEFAULT 'OPENING',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
  "version" INTEGER NOT NULL DEFAULT 1,
  "sections" JSONB NOT NULL,
  "effectiveFrom" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffShiftRegulation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_shift_regulation_status_kind_idx" ON "StaffShiftRegulation"("tenantId", "status", "shiftKind");
CREATE INDEX "staff_shift_regulation_created_idx" ON "StaffShiftRegulation"("tenantId", "createdAt");
CREATE INDEX "staff_shift_regulation_store_idx" ON "StaffShiftRegulation"("storeId");
CREATE INDEX "staff_shift_regulation_created_by_idx" ON "StaffShiftRegulation"("createdByUserId");

ALTER TABLE "StaffShiftRegulation"
  ADD CONSTRAINT "StaffShiftRegulation_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "StaffShiftRegulation"
  ADD CONSTRAINT "StaffShiftRegulation_storeId_fkey"
  FOREIGN KEY ("storeId")
  REFERENCES "Store"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "StaffShiftRegulation"
  ADD CONSTRAINT "StaffShiftRegulation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
