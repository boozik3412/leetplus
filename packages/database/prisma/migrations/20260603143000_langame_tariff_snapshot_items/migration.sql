CREATE TABLE "LangameTariffSnapshotItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationSourceId" TEXT,
    "snapshotRunId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "domain" TEXT NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "label" TEXT,
    "kind" TEXT,
    "raw" JSONB NOT NULL,
    "fieldKeys" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LangameTariffSnapshotItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LangameTariffSnapshotItem_tenantId_endpointKey_domain_idx" ON "LangameTariffSnapshotItem"("tenantId", "endpointKey", "domain");

CREATE INDEX "LangameTariffSnapshotItem_tenantId_endpointKey_startedAt_idx" ON "LangameTariffSnapshotItem"("tenantId", "endpointKey", "startedAt");

CREATE INDEX "LangameTariffSnapshotItem_integrationSourceId_startedAt_idx" ON "LangameTariffSnapshotItem"("integrationSourceId", "startedAt");

CREATE INDEX "LangameTariffSnapshotItem_snapshotRunId_idx" ON "LangameTariffSnapshotItem"("snapshotRunId");

ALTER TABLE "LangameTariffSnapshotItem" ADD CONSTRAINT "LangameTariffSnapshotItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LangameTariffSnapshotItem" ADD CONSTRAINT "LangameTariffSnapshotItem_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LangameTariffSnapshotItem" ADD CONSTRAINT "LangameTariffSnapshotItem_snapshotRunId_fkey" FOREIGN KEY ("snapshotRunId") REFERENCES "LangameEndpointSnapshotRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
