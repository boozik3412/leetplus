ALTER TYPE "IntegrationSyncMode" ADD VALUE IF NOT EXISTS 'CATEGORIES';

CREATE TYPE "CategorySourceMappingStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

CREATE TABLE "CategorySourceMapping" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "source" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "status" "CategorySourceMappingStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confidence" INTEGER,
  "confirmedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CategorySourceMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CategorySourceMapping_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategorySourceMapping_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategorySourceMapping_confirmedByUserId_fkey"
    FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CategorySourceMappingEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mappingId" TEXT,
  "productId" TEXT,
  "action" TEXT NOT NULL,
  "source" "IntegrationProvider" NOT NULL,
  "externalDomain" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "previousValue" JSONB,
  "nextValue" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategorySourceMappingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CategorySourceMappingEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CategorySourceMappingEvent_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "CategorySourceMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CategorySourceMappingEvent_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CategorySourceMappingEvent_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "category_source_mapping_external_uidx"
ON "CategorySourceMapping"("tenantId", "source", "externalDomain", "externalGroupId");

CREATE INDEX "category_source_mapping_category_idx"
ON "CategorySourceMapping"("tenantId", "categoryId");

CREATE INDEX "category_source_mapping_status_idx"
ON "CategorySourceMapping"("tenantId", "source", "status");

CREATE INDEX "category_source_mapping_confirmed_by_idx"
ON "CategorySourceMapping"("confirmedByUserId");

CREATE INDEX "category_source_mapping_event_created_idx"
ON "CategorySourceMappingEvent"("tenantId", "createdAt");

CREATE INDEX "category_source_mapping_event_external_idx"
ON "CategorySourceMappingEvent"("tenantId", "source", "externalDomain", "externalGroupId");

CREATE INDEX "category_source_mapping_event_mapping_idx"
ON "CategorySourceMappingEvent"("mappingId");

CREATE INDEX "category_source_mapping_event_product_idx"
ON "CategorySourceMappingEvent"("productId");

CREATE INDEX "category_source_mapping_event_user_idx"
ON "CategorySourceMappingEvent"("createdByUserId");
