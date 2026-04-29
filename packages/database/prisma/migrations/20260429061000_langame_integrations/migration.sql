CREATE TYPE "IntegrationProvider" AS ENUM ('LANGAME');

CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiKeyEnvVar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Store" ADD COLUMN "externalProvider" "IntegrationProvider";
ALTER TABLE "Store" ADD COLUMN "externalDomain" TEXT;
ALTER TABLE "Store" ADD COLUMN "externalClubId" TEXT;
ALTER TABLE "Store" ADD COLUMN "integrationSourceId" TEXT;

ALTER TABLE "Product" ADD COLUMN "externalProvider" "IntegrationProvider";
ALTER TABLE "Product" ADD COLUMN "externalDomain" TEXT;
ALTER TABLE "Product" ADD COLUMN "externalProductId" TEXT;

ALTER TABLE "SalesFact" ADD COLUMN "externalProvider" "IntegrationProvider";
ALTER TABLE "SalesFact" ADD COLUMN "externalDomain" TEXT;
ALTER TABLE "SalesFact" ADD COLUMN "externalSaleId" TEXT;

ALTER TABLE "InventorySnapshot" ADD COLUMN "externalProvider" "IntegrationProvider";
ALTER TABLE "InventorySnapshot" ADD COLUMN "externalDomain" TEXT;
ALTER TABLE "InventorySnapshot" ADD COLUMN "externalClubId" TEXT;

CREATE UNIQUE INDEX "IntegrationCredential_tenantId_provider_name_key" ON "IntegrationCredential"("tenantId", "provider", "name");
CREATE INDEX "IntegrationCredential_tenantId_idx" ON "IntegrationCredential"("tenantId");

CREATE UNIQUE INDEX "IntegrationSource_tenantId_provider_domain_key" ON "IntegrationSource"("tenantId", "provider", "domain");
CREATE INDEX "IntegrationSource_tenantId_idx" ON "IntegrationSource"("tenantId");
CREATE INDEX "IntegrationSource_credentialId_idx" ON "IntegrationSource"("credentialId");

CREATE UNIQUE INDEX "Store_tenantId_externalProvider_externalDomain_externalClubId_key" ON "Store"("tenantId", "externalProvider", "externalDomain", "externalClubId");
CREATE INDEX "Store_integrationSourceId_idx" ON "Store"("integrationSourceId");

CREATE UNIQUE INDEX "Product_tenantId_externalProvider_externalDomain_externalProductId_key" ON "Product"("tenantId", "externalProvider", "externalDomain", "externalProductId");

CREATE UNIQUE INDEX "SalesFact_tenantId_externalProvider_externalDomain_externalSaleId_key" ON "SalesFact"("tenantId", "externalProvider", "externalDomain", "externalSaleId");

ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "IntegrationCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Store" ADD CONSTRAINT "Store_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
