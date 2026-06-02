CREATE TABLE "LangameEndpointSnapshotRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationSourceId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "domain" TEXT NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "requestParams" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "payloadKind" TEXT,
    "fieldKeys" JSONB,
    "snapshot" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LangameEndpointSnapshotRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LangameEndpointSnapshotRun_tenantId_endpointKey_startedAt_idx" ON "LangameEndpointSnapshotRun"("tenantId", "endpointKey", "startedAt");

CREATE INDEX "LangameEndpointSnapshotRun_integrationSourceId_startedAt_idx" ON "LangameEndpointSnapshotRun"("integrationSourceId", "startedAt");

CREATE INDEX "LangameEndpointSnapshotRun_status_idx" ON "LangameEndpointSnapshotRun"("status");

ALTER TABLE "LangameEndpointSnapshotRun" ADD CONSTRAINT "LangameEndpointSnapshotRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LangameEndpointSnapshotRun" ADD CONSTRAINT "LangameEndpointSnapshotRun_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
