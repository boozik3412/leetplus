CREATE TABLE "StaffSalaryPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "periodMode" TEXT NOT NULL DEFAULT 'CUSTOM',
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "storeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
    "userIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rows" JSONB NOT NULL DEFAULT '[]',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalBaseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalShiftAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalHourlyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalBonusAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPenaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalNetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSalaryPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_salary_period_range_idx" ON "StaffSalaryPeriod"("tenantId", "dateFrom", "dateTo");
CREATE INDEX "staff_salary_period_created_idx" ON "StaffSalaryPeriod"("tenantId", "createdAt");
