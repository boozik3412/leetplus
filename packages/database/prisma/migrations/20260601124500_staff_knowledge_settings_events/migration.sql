CREATE TABLE "StaffKnowledgeSettingsEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "settingsId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL DEFAULT 'REVISION_SLA_POLICY_UPDATED',
  "previousRevisionSlaPolicy" JSONB,
  "nextRevisionSlaPolicy" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffKnowledgeSettingsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_knowledge_settings_event_tenant_created_idx" ON "StaffKnowledgeSettingsEvent"("tenantId", "createdAt");
CREATE INDEX "staff_knowledge_settings_event_settings_created_idx" ON "StaffKnowledgeSettingsEvent"("settingsId", "createdAt");
CREATE INDEX "staff_knowledge_settings_event_actor_idx" ON "StaffKnowledgeSettingsEvent"("actorUserId");

ALTER TABLE "StaffKnowledgeSettingsEvent"
ADD CONSTRAINT "StaffKnowledgeSettingsEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeSettingsEvent"
ADD CONSTRAINT "StaffKnowledgeSettingsEvent_settingsId_fkey"
FOREIGN KEY ("settingsId") REFERENCES "StaffKnowledgeSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffKnowledgeSettingsEvent"
ADD CONSTRAINT "StaffKnowledgeSettingsEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
