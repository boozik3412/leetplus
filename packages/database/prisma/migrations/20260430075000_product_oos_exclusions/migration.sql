CREATE TYPE "ProductOosExclusionType" AS ENUM ('SERVICE', 'OOS_EXCLUDED');

CREATE TABLE "ProductOosExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "ProductOosExclusionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOosExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductOosExclusion_tenantId_productId_key" ON "ProductOosExclusion"("tenantId", "productId");
CREATE INDEX "ProductOosExclusion_tenantId_type_idx" ON "ProductOosExclusion"("tenantId", "type");
CREATE INDEX "ProductOosExclusion_productId_idx" ON "ProductOosExclusion"("productId");

ALTER TABLE "ProductOosExclusion" ADD CONSTRAINT "ProductOosExclusion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductOosExclusion" ADD CONSTRAINT "ProductOosExclusion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
