-- CreateTable
CREATE TABLE "StaffChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "sourceRegulationId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "shiftKind" TEXT NOT NULL DEFAULT 'OPENING',
    "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sections" JSONB NOT NULL,
    "sectionsCount" INTEGER NOT NULL DEFAULT 0,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "requiredItemsCount" INTEGER NOT NULL DEFAULT 0,
    "evidenceItemsCount" INTEGER NOT NULL DEFAULT 0,
    "scoreTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StaffChecklistRun" ADD COLUMN "templateId" TEXT;
ALTER TABLE "StaffChecklistRun" ADD COLUMN "templateVersion" INTEGER;
ALTER TABLE "StaffChecklistRun" ALTER COLUMN "regulationId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "staff_checklist_template_status_kind_idx" ON "StaffChecklistTemplate"("tenantId", "status", "shiftKind");
CREATE INDEX "staff_checklist_template_created_idx" ON "StaffChecklistTemplate"("tenantId", "createdAt");
CREATE INDEX "staff_checklist_template_store_idx" ON "StaffChecklistTemplate"("storeId");
CREATE INDEX "staff_checklist_template_source_regulation_idx" ON "StaffChecklistTemplate"("sourceRegulationId");
CREATE INDEX "staff_checklist_template_created_by_idx" ON "StaffChecklistTemplate"("createdByUserId");
CREATE INDEX "staff_checklist_run_template_idx" ON "StaffChecklistRun"("templateId");

-- AddForeignKey
ALTER TABLE "StaffChecklistTemplate" ADD CONSTRAINT "StaffChecklistTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffChecklistTemplate" ADD CONSTRAINT "StaffChecklistTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffChecklistTemplate" ADD CONSTRAINT "StaffChecklistTemplate_sourceRegulationId_fkey" FOREIGN KEY ("sourceRegulationId") REFERENCES "StaffShiftRegulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffChecklistTemplate" ADD CONSTRAINT "StaffChecklistTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffChecklistRun" ADD CONSTRAINT "StaffChecklistRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StaffChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
