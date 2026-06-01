CREATE TABLE "StaffKnowledgeSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "revisionSlaPolicy" JSONB,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffKnowledgeSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffKnowledgeSettings_tenantId_key" ON "StaffKnowledgeSettings"("tenantId");
CREATE INDEX "staff_knowledge_settings_updated_by_idx" ON "StaffKnowledgeSettings"("updatedByUserId");

ALTER TABLE "StaffKnowledgeSettings"
ADD CONSTRAINT "StaffKnowledgeSettings_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeSettings"
ADD CONSTRAINT "StaffKnowledgeSettings_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
