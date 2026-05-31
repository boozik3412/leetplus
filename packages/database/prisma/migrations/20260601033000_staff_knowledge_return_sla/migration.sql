ALTER TABLE "StaffKnowledgeArticle"
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "revisionDueAt" TIMESTAMP(3);

UPDATE "StaffKnowledgeArticle"
SET
  "returnedAt" = "updatedAt",
  "revisionDueAt" = "updatedAt" + INTERVAL '2 days'
WHERE "status" = 'RETURNED';

CREATE INDEX "staff_knowledge_revision_due_idx" ON "StaffKnowledgeArticle"("tenantId", "revisionDueAt");
