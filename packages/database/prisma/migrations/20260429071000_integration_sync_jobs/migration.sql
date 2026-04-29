CREATE TYPE "IntegrationSyncStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "IntegrationSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationSourceId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "IntegrationSyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "storesCount" INTEGER NOT NULL DEFAULT 0,
    "productsCount" INTEGER NOT NULL DEFAULT 0,
    "inventoryCount" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "IntegrationSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationSyncJob_tenantId_startedAt_idx" ON "IntegrationSyncJob"("tenantId", "startedAt");
CREATE INDEX "IntegrationSyncJob_integrationSourceId_idx" ON "IntegrationSyncJob"("integrationSourceId");
CREATE INDEX "IntegrationSyncJob_status_idx" ON "IntegrationSyncJob"("status");

ALTER TABLE "IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
