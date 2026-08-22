-- Staff task catalog audit, EXPAND phase.
--
-- Records security-relevant template/rule catalog mutations without storing
-- titles, email addresses, or participant lists. Application writes are
-- introduced separately and are atomic with their domain mutation.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TABLE "StaffTaskCatalogAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "entityKind" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "effectiveStoreId" TEXT,
  "changedFields" TEXT[] NOT NULL,
  "beforeState" JSONB,
  "afterState" JSONB,
  "releaseSha" TEXT,
  "reasonCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffTaskCatalogAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffTaskCatalogAuditEvent_entity_kind_check"
    CHECK ("entityKind" IN ('TEMPLATE', 'RULE')),
  CONSTRAINT "StaffTaskCatalogAuditEvent_action_check"
    CHECK (
      "action" IN (
        'CREATED',
        'UPDATED',
        'ACTIVATED',
        'ARCHIVED',
        'PAUSED',
        'TASK_LAUNCHED'
      )
    )
);

CREATE INDEX "staff_task_catalog_audit_tenant_created_idx"
  ON "StaffTaskCatalogAuditEvent"("tenantId", "createdAt");

CREATE INDEX "staff_task_catalog_audit_entity_created_idx"
  ON "StaffTaskCatalogAuditEvent"(
    "entityKind",
    "entityId",
    "createdAt"
  );

CREATE INDEX "staff_task_catalog_audit_actor_created_idx"
  ON "StaffTaskCatalogAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "StaffTaskCatalogAuditEvent"
  ADD CONSTRAINT "StaffTaskCatalogAuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "StaffTaskCatalogAuditEvent"
  ADD CONSTRAINT "StaffTaskCatalogAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

COMMIT;
