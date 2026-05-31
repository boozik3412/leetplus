CREATE TABLE "StaffOnboardingPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "durationDays" INTEGER,
    "steps" JSONB NOT NULL,
    "stepsCount" INTEGER NOT NULL DEFAULT 0,
    "coursesCount" INTEGER NOT NULL DEFAULT 0,
    "tasksCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOnboardingPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_onboarding_plan_status_role_idx" ON "StaffOnboardingPlan"("tenantId", "status", "roleScope");
CREATE INDEX "staff_onboarding_plan_created_idx" ON "StaffOnboardingPlan"("tenantId", "createdAt");
CREATE INDEX "staff_onboarding_plan_store_idx" ON "StaffOnboardingPlan"("storeId");
CREATE INDEX "staff_onboarding_plan_created_by_idx" ON "StaffOnboardingPlan"("createdByUserId");

ALTER TABLE "StaffOnboardingPlan"
ADD CONSTRAINT "StaffOnboardingPlan_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffOnboardingPlan"
ADD CONSTRAINT "StaffOnboardingPlan_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffOnboardingPlan"
ADD CONSTRAINT "StaffOnboardingPlan_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
