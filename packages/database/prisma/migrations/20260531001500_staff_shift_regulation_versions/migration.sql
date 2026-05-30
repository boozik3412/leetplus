-- CreateTable
CREATE TABLE "StaffShiftRegulationVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "shiftKind" TEXT NOT NULL,
    "roleScope" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffShiftRegulationVersion_pkey" PRIMARY KEY ("id")
);

-- Backfill a first snapshot for regulations that were already published before this migration.
INSERT INTO "StaffShiftRegulationVersion" (
    "id",
    "tenantId",
    "regulationId",
    "storeId",
    "createdByUserId",
    "version",
    "title",
    "description",
    "shiftKind",
    "roleScope",
    "sections",
    "effectiveFrom",
    "publishedAt",
    "createdAt"
)
SELECT
    gen_random_uuid()::text,
    "tenantId",
    "id",
    "storeId",
    "createdByUserId",
    "version",
    "title",
    "description",
    "shiftKind",
    "roleScope",
    "sections",
    "effectiveFrom",
    "publishedAt",
    COALESCE("publishedAt", "updatedAt", "createdAt")
FROM "StaffShiftRegulation"
WHERE "publishedAt" IS NOT NULL OR "status" IN ('PUBLISHED', 'ARCHIVED');

-- CreateIndex
CREATE UNIQUE INDEX "staff_shift_regulation_version_unique" ON "StaffShiftRegulationVersion"("regulationId", "version");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_version_regulation_idx" ON "StaffShiftRegulationVersion"("tenantId", "regulationId", "version");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_version_created_idx" ON "StaffShiftRegulationVersion"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_version_store_idx" ON "StaffShiftRegulationVersion"("storeId");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_version_created_by_idx" ON "StaffShiftRegulationVersion"("createdByUserId");

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationVersion" ADD CONSTRAINT "StaffShiftRegulationVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationVersion" ADD CONSTRAINT "StaffShiftRegulationVersion_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "StaffShiftRegulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationVersion" ADD CONSTRAINT "StaffShiftRegulationVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationVersion" ADD CONSTRAINT "StaffShiftRegulationVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
