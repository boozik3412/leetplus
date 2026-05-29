CREATE TABLE "StaffTaskComment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT,
  "evidenceType" TEXT,
  "evidenceLabel" TEXT,
  "evidenceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffTaskComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffTaskAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffTaskAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_task_comment_tenant_created_idx" ON "StaffTaskComment"("tenantId", "createdAt");
CREATE INDEX "staff_task_comment_task_created_idx" ON "StaffTaskComment"("taskId", "createdAt");
CREATE INDEX "staff_task_comment_author_idx" ON "StaffTaskComment"("authorUserId");

CREATE INDEX "staff_task_audit_tenant_created_idx" ON "StaffTaskAuditEvent"("tenantId", "createdAt");
CREATE INDEX "staff_task_audit_task_created_idx" ON "StaffTaskAuditEvent"("taskId", "createdAt");
CREATE INDEX "staff_task_audit_actor_idx" ON "StaffTaskAuditEvent"("actorUserId");

ALTER TABLE "StaffTaskComment"
  ADD CONSTRAINT "StaffTaskComment_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskComment"
  ADD CONSTRAINT "StaffTaskComment_taskId_fkey"
  FOREIGN KEY ("taskId")
  REFERENCES "StaffTask"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskComment"
  ADD CONSTRAINT "StaffTaskComment_authorUserId_fkey"
  FOREIGN KEY ("authorUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskAuditEvent"
  ADD CONSTRAINT "StaffTaskAuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskAuditEvent"
  ADD CONSTRAINT "StaffTaskAuditEvent_taskId_fkey"
  FOREIGN KEY ("taskId")
  REFERENCES "StaffTask"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskAuditEvent"
  ADD CONSTRAINT "StaffTaskAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
