CREATE TYPE "IntegrationSyncTrigger" AS ENUM ('MANUAL', 'AUTO');
CREATE TYPE "IntegrationSyncMode" AS ENUM ('QUICK', 'INVENTORY', 'CATALOG', 'BACKFILL', 'FULL');

ALTER TABLE "IntegrationSyncJob" ADD COLUMN "trigger" "IntegrationSyncTrigger" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "IntegrationSyncJob" ADD COLUMN "mode" "IntegrationSyncMode" NOT NULL DEFAULT 'BACKFILL';
ALTER TABLE "IntegrationSyncJob" ADD COLUMN "discrepancyCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IntegrationSyncJob" ADD COLUMN "discrepancyLogPath" TEXT;
