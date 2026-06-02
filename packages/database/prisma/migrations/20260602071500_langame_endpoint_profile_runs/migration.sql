-- CreateTable
CREATE TABLE "LangameEndpointProfileRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationSourceId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "domain" TEXT NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "requestParams" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "payloadKind" TEXT,
    "fieldKeys" JSONB,
    "profile" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LangameEndpointProfileRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LangameEndpointProfileRun_tenantId_endpointKey_checkedAt_idx" ON "LangameEndpointProfileRun"("tenantId", "endpointKey", "checkedAt");

-- CreateIndex
CREATE INDEX "LangameEndpointProfileRun_integrationSourceId_checkedAt_idx" ON "LangameEndpointProfileRun"("integrationSourceId", "checkedAt");

-- CreateIndex
CREATE INDEX "LangameEndpointProfileRun_status_idx" ON "LangameEndpointProfileRun"("status");

-- AddForeignKey
ALTER TABLE "LangameEndpointProfileRun" ADD CONSTRAINT "LangameEndpointProfileRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LangameEndpointProfileRun" ADD CONSTRAINT "LangameEndpointProfileRun_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
