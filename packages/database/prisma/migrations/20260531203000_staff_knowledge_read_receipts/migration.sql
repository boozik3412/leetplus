CREATE TABLE "StaffKnowledgeArticleReadReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "StaffKnowledgeArticleReadReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_knowledge_read_article_user_version_key"
ON "StaffKnowledgeArticleReadReceipt"("articleId", "userId", "version");

CREATE INDEX "staff_knowledge_read_user_idx"
ON "StaffKnowledgeArticleReadReceipt"("tenantId", "userId", "readAt");

CREATE INDEX "staff_knowledge_read_article_idx"
ON "StaffKnowledgeArticleReadReceipt"("tenantId", "articleId", "version");

ALTER TABLE "StaffKnowledgeArticleReadReceipt"
ADD CONSTRAINT "StaffKnowledgeArticleReadReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticleReadReceipt"
ADD CONSTRAINT "StaffKnowledgeArticleReadReceipt_articleId_fkey"
FOREIGN KEY ("articleId") REFERENCES "StaffKnowledgeArticle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeArticleReadReceipt"
ADD CONSTRAINT "StaffKnowledgeArticleReadReceipt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
