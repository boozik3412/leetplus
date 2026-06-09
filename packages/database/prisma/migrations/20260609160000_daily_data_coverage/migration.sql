-- CreateEnum
CREATE TYPE "DailyDataCoverageScope" AS ENUM ('BUSINESS_FACTS', 'GUEST_FOUNDATION', 'STAFF_SHIFTS', 'BUSINESS_SNAPSHOTS');

-- CreateEnum
CREATE TYPE "DailyDataCoverageStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "DailyDataCoverage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "scope" "DailyDataCoverageScope" NOT NULL,
    "status" "DailyDataCoverageStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sourceCounts" JSONB,
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyDataCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyDataCoverage_tenantId_businessDate_scope_key" ON "DailyDataCoverage"("tenantId", "businessDate", "scope");

-- CreateIndex
CREATE INDEX "DailyDataCoverage_tenantId_businessDate_idx" ON "DailyDataCoverage"("tenantId", "businessDate");

-- CreateIndex
CREATE INDEX "DailyDataCoverage_tenantId_status_idx" ON "DailyDataCoverage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DailyDataCoverage_scope_businessDate_idx" ON "DailyDataCoverage"("scope", "businessDate");

-- AddForeignKey
ALTER TABLE "DailyDataCoverage" ADD CONSTRAINT "DailyDataCoverage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
