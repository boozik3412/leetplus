CREATE TYPE "TenantLifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "Tenant"
ADD COLUMN "status" "TenantLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "statusChangedAt" TIMESTAMP(3),
ADD COLUMN "statusReason" TEXT;

CREATE TABLE "PlatformAdminAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAdminAuditEvent_tenantId_createdAt_idx" ON "PlatformAdminAuditEvent"("tenantId", "createdAt");
CREATE INDEX "PlatformAdminAuditEvent_actorUserId_createdAt_idx" ON "PlatformAdminAuditEvent"("actorUserId", "createdAt");
CREATE INDEX "PlatformAdminAuditEvent_action_idx" ON "PlatformAdminAuditEvent"("action");
CREATE INDEX "PlatformAdminAuditEvent_createdAt_idx" ON "PlatformAdminAuditEvent"("createdAt");

ALTER TABLE "PlatformAdminAuditEvent" ADD CONSTRAINT "PlatformAdminAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformAdminAuditEvent" ADD CONSTRAINT "PlatformAdminAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
