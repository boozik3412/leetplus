-- Staff salary schemes and payroll calculation presets.

CREATE TABLE "StaffSalaryScheme" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
  "periodType" TEXT NOT NULL DEFAULT 'MONTHLY',
  "fixedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "hourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shiftRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "bonusRules" JSONB,
  "penaltyRules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffSalaryScheme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_salary_scheme_status_role_idx" ON "StaffSalaryScheme"("tenantId", "status", "roleScope");
CREATE INDEX "staff_salary_scheme_store_idx" ON "StaffSalaryScheme"("tenantId", "storeId");
CREATE INDEX "staff_salary_scheme_created_idx" ON "StaffSalaryScheme"("tenantId", "createdAt");
CREATE INDEX "staff_salary_scheme_store_fk_idx" ON "StaffSalaryScheme"("storeId");
CREATE INDEX "staff_salary_scheme_created_by_idx" ON "StaffSalaryScheme"("createdByUserId");

ALTER TABLE "StaffSalaryScheme"
  ADD CONSTRAINT "StaffSalaryScheme_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffSalaryScheme"
  ADD CONSTRAINT "StaffSalaryScheme_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffSalaryScheme"
  ADD CONSTRAINT "StaffSalaryScheme_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
