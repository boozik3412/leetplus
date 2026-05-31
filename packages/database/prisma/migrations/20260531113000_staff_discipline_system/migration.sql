-- Staff discipline policies, violation rules, warnings and fines.

CREATE TABLE "StaffDisciplinePolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffDisciplinePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffDisciplineRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "firstFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "secondFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "thirdFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffDisciplineRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffDisciplineRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "storeId" TEXT,
  "userId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "categorySnapshot" TEXT NOT NULL,
  "ruleTitleSnapshot" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffDisciplineRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_discipline_policy_scope_unique" ON "StaffDisciplinePolicy"("tenantId", "storeId");
CREATE INDEX "staff_discipline_policy_enabled_idx" ON "StaffDisciplinePolicy"("tenantId", "enabled");
CREATE INDEX "staff_discipline_policy_store_idx" ON "StaffDisciplinePolicy"("storeId");
CREATE INDEX "staff_discipline_policy_updated_by_idx" ON "StaffDisciplinePolicy"("updatedByUserId");

CREATE UNIQUE INDEX "staff_discipline_rule_unique" ON "StaffDisciplineRule"("tenantId", "category", "title");
CREATE INDEX "staff_discipline_rule_active_order_idx" ON "StaffDisciplineRule"("tenantId", "isActive", "sortOrder");
CREATE INDEX "staff_discipline_rule_created_by_idx" ON "StaffDisciplineRule"("createdByUserId");

CREATE INDEX "staff_discipline_record_occurred_idx" ON "StaffDisciplineRecord"("tenantId", "occurredAt");
CREATE INDEX "staff_discipline_record_user_category_idx" ON "StaffDisciplineRecord"("tenantId", "userId", "categorySnapshot");
CREATE INDEX "staff_discipline_record_rule_user_idx" ON "StaffDisciplineRecord"("tenantId", "ruleId", "userId");
CREATE INDEX "staff_discipline_record_status_idx" ON "StaffDisciplineRecord"("tenantId", "status");
CREATE INDEX "staff_discipline_record_rule_idx" ON "StaffDisciplineRecord"("ruleId");
CREATE INDEX "staff_discipline_record_store_idx" ON "StaffDisciplineRecord"("storeId");
CREATE INDEX "staff_discipline_record_user_idx" ON "StaffDisciplineRecord"("userId");
CREATE INDEX "staff_discipline_record_created_by_idx" ON "StaffDisciplineRecord"("createdByUserId");

ALTER TABLE "StaffDisciplinePolicy"
  ADD CONSTRAINT "StaffDisciplinePolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplinePolicy"
  ADD CONSTRAINT "StaffDisciplinePolicy_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplinePolicy"
  ADD CONSTRAINT "StaffDisciplinePolicy_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRule"
  ADD CONSTRAINT "StaffDisciplineRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRule"
  ADD CONSTRAINT "StaffDisciplineRule_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRecord"
  ADD CONSTRAINT "StaffDisciplineRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRecord"
  ADD CONSTRAINT "StaffDisciplineRecord_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "StaffDisciplineRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRecord"
  ADD CONSTRAINT "StaffDisciplineRecord_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRecord"
  ADD CONSTRAINT "StaffDisciplineRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffDisciplineRecord"
  ADD CONSTRAINT "StaffDisciplineRecord_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
