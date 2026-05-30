CREATE TABLE "StaffKnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Общие стандарты',
    "roleScope" TEXT NOT NULL DEFAULT 'ALL_STAFF',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_knowledge_status_role_idx" ON "StaffKnowledgeArticle"("tenantId", "status", "roleScope");
CREATE INDEX "staff_knowledge_category_idx" ON "StaffKnowledgeArticle"("tenantId", "category");
CREATE INDEX "staff_knowledge_created_idx" ON "StaffKnowledgeArticle"("tenantId", "createdAt");
CREATE INDEX "staff_knowledge_store_idx" ON "StaffKnowledgeArticle"("storeId");
CREATE INDEX "staff_knowledge_created_by_idx" ON "StaffKnowledgeArticle"("createdByUserId");

ALTER TABLE "StaffKnowledgeArticle"
ADD CONSTRAINT "StaffKnowledgeArticle_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticle"
ADD CONSTRAINT "StaffKnowledgeArticle_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticle"
ADD CONSTRAINT "StaffKnowledgeArticle_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
