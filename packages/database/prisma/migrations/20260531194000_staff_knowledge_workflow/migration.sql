ALTER TABLE "StaffKnowledgeArticle"
ADD COLUMN "approvedByUserId" TEXT,
ADD COLUMN "folder" TEXT NOT NULL DEFAULT 'Общие',
ADD COLUMN "templateKey" TEXT,
ADD COLUMN "requiresReading" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "relatedLinks" JSONB,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewRequestedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvalNote" TEXT;

CREATE TABLE "StaffKnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "folder" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "roleScope" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" JSONB,
    "relatedLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffKnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_knowledge_folder_idx" ON "StaffKnowledgeArticle"("tenantId", "folder");
CREATE INDEX "staff_knowledge_required_idx" ON "StaffKnowledgeArticle"("tenantId", "requiresReading");
CREATE INDEX "staff_knowledge_approved_by_idx" ON "StaffKnowledgeArticle"("approvedByUserId");
CREATE UNIQUE INDEX "staff_knowledge_version_article_version_key" ON "StaffKnowledgeArticleVersion"("articleId", "version");
CREATE INDEX "staff_knowledge_version_tenant_created_idx" ON "StaffKnowledgeArticleVersion"("tenantId", "createdAt");
CREATE INDEX "staff_knowledge_version_created_by_idx" ON "StaffKnowledgeArticleVersion"("createdByUserId");

ALTER TABLE "StaffKnowledgeArticle"
ADD CONSTRAINT "StaffKnowledgeArticle_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticleVersion"
ADD CONSTRAINT "StaffKnowledgeArticleVersion_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticleVersion"
ADD CONSTRAINT "StaffKnowledgeArticleVersion_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "StaffKnowledgeArticle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticleVersion"
ADD CONSTRAINT "StaffKnowledgeArticleVersion_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
