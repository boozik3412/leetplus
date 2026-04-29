CREATE TYPE "ProductParsingSuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

ALTER TABLE "Product" ADD COLUMN "canonicalProductId" TEXT;

CREATE TABLE "CanonicalProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "brand" TEXT,
    "volumeValue" INTEGER,
    "volumeUnit" TEXT,
    "flavor" TEXT,
    "packageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductParsingRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "suggestionsCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductParsingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductParsingSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "canonicalProductId" TEXT,
    "suggestedName" TEXT NOT NULL,
    "selectedName" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" JSONB NOT NULL,
    "productIds" TEXT[],
    "candidateNames" TEXT[],
    "status" "ProductParsingSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductParsingSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalProduct_tenantId_normalizedKey_key" ON "CanonicalProduct"("tenantId", "normalizedKey");
CREATE INDEX "CanonicalProduct_tenantId_idx" ON "CanonicalProduct"("tenantId");
CREATE INDEX "Product_canonicalProductId_idx" ON "Product"("canonicalProductId");
CREATE INDEX "ProductParsingRun_tenantId_createdAt_idx" ON "ProductParsingRun"("tenantId", "createdAt");
CREATE INDEX "ProductParsingSuggestion_tenantId_status_idx" ON "ProductParsingSuggestion"("tenantId", "status");
CREATE INDEX "ProductParsingSuggestion_runId_idx" ON "ProductParsingSuggestion"("runId");
CREATE INDEX "ProductParsingSuggestion_canonicalProductId_idx" ON "ProductParsingSuggestion"("canonicalProductId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CanonicalProduct" ADD CONSTRAINT "CanonicalProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductParsingRun" ADD CONSTRAINT "ProductParsingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductParsingSuggestion" ADD CONSTRAINT "ProductParsingSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductParsingSuggestion" ADD CONSTRAINT "ProductParsingSuggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductParsingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductParsingSuggestion" ADD CONSTRAINT "ProductParsingSuggestion_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
