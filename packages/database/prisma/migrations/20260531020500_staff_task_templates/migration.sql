ALTER TABLE "StaffTask"
ADD COLUMN "sourceTemplateId" TEXT;

CREATE TABLE "StaffTaskTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SHIFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dueOffsetMinutes" INTEGER,
    "labels" JSONB,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTaskTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_task_source_template_idx" ON "StaffTask"("sourceTemplateId");
CREATE INDEX "staff_task_template_status_type_idx" ON "StaffTaskTemplate"("tenantId", "status", "type");
CREATE INDEX "staff_task_template_created_idx" ON "StaffTaskTemplate"("tenantId", "createdAt");
CREATE INDEX "staff_task_template_store_idx" ON "StaffTaskTemplate"("storeId");
CREATE INDEX "staff_task_template_created_by_idx" ON "StaffTaskTemplate"("createdByUserId");

ALTER TABLE "StaffTask"
ADD CONSTRAINT "StaffTask_sourceTemplateId_fkey"
FOREIGN KEY ("sourceTemplateId") REFERENCES "StaffTaskTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskTemplate"
ADD CONSTRAINT "StaffTaskTemplate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTaskTemplate"
ADD CONSTRAINT "StaffTaskTemplate_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTaskTemplate"
ADD CONSTRAINT "StaffTaskTemplate_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
