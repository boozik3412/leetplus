CREATE TABLE "LangameProductGroup" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationSourceId" TEXT NOT NULL,
  "externalDomain" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "iconUrl" TEXT,
  "sort" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LangameProductGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameProductGroup_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LangameProductGroup_integrationSourceId_fkey"
    FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LangameClubProductConfiguration" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationSourceId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT,
  "externalDomain" TEXT NOT NULL,
  "externalClubId" TEXT NOT NULL,
  "externalConfigurationId" TEXT,
  "externalProductId" TEXT NOT NULL,
  "externalGroupId" TEXT,
  "productName" TEXT NOT NULL,
  "priceSale" DECIMAL(12,2),
  "purchasePrice" DECIMAL(12,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LangameClubProductConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LangameClubProductConfiguration_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LangameClubProductConfiguration_integrationSourceId_fkey"
    FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LangameClubProductConfiguration_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LangameClubProductConfiguration_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "langame_product_group_scope_uidx"
ON "LangameProductGroup"("tenantId", "externalDomain", "externalGroupId");

CREATE INDEX "langame_product_group_active_idx"
ON "LangameProductGroup"("tenantId", "externalDomain", "isActive");

CREATE INDEX "langame_product_group_source_idx"
ON "LangameProductGroup"("integrationSourceId");

CREATE UNIQUE INDEX "langame_club_product_scope_uidx"
ON "LangameClubProductConfiguration"("tenantId", "externalDomain", "externalClubId", "externalProductId");

CREATE INDEX "langame_club_product_group_active_idx"
ON "LangameClubProductConfiguration"("tenantId", "storeId", "externalGroupId", "isActive");

CREATE INDEX "langame_club_product_product_idx"
ON "LangameClubProductConfiguration"("tenantId", "productId");

CREATE INDEX "langame_club_product_source_idx"
ON "LangameClubProductConfiguration"("integrationSourceId");
