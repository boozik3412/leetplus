CREATE TABLE "StaffNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "actionLabel" TEXT,
    "actionHref" TEXT,
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_notification_tenant_dedupe_unique" ON "StaffNotification"("tenantId", "dedupeKey");
CREATE INDEX "staff_notification_status_severity_idx" ON "StaffNotification"("tenantId", "status", "severity");
CREATE INDEX "staff_notification_source_idx" ON "StaffNotification"("tenantId", "sourceType", "sourceId");
CREATE INDEX "staff_notification_created_idx" ON "StaffNotification"("tenantId", "createdAt");
CREATE INDEX "staff_notification_store_idx" ON "StaffNotification"("storeId");
CREATE INDEX "staff_notification_ack_user_idx" ON "StaffNotification"("acknowledgedByUserId");
CREATE INDEX "staff_notification_resolved_user_idx" ON "StaffNotification"("resolvedByUserId");

ALTER TABLE "StaffNotification"
    ADD CONSTRAINT "StaffNotification_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffNotification"
    ADD CONSTRAINT "StaffNotification_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffNotification"
    ADD CONSTRAINT "StaffNotification_acknowledgedByUserId_fkey"
    FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffNotification"
    ADD CONSTRAINT "StaffNotification_resolvedByUserId_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
