ALTER TABLE "StaffKnowledgeArticle"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ARTICLE';

ALTER TABLE "StaffChatMessage"
ADD COLUMN "knowledgeArticleId" TEXT;

CREATE INDEX "staff_knowledge_kind_status_idx"
ON "StaffKnowledgeArticle"("tenantId", "kind", "status");

CREATE INDEX "staff_chat_message_knowledge_article_idx"
ON "StaffChatMessage"("knowledgeArticleId");

ALTER TABLE "StaffChatMessage"
ADD CONSTRAINT "StaffChatMessage_knowledgeArticleId_fkey"
FOREIGN KEY ("knowledgeArticleId") REFERENCES "StaffKnowledgeArticle"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
