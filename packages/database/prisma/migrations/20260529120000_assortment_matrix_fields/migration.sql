CREATE TYPE "ProductAssortmentRole" AS ENUM (
  'CORE',
  'TRAFFIC_DRIVER',
  'MARGIN_DRIVER',
  'IMPULSE',
  'SEASONAL',
  'TEST',
  'SERVICE',
  'OPTIONAL',
  'EXCLUDED'
);

ALTER TABLE "Product"
  ADD COLUMN "assortmentRole" "ProductAssortmentRole" NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN "isMandatory" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_tenantId_assortmentRole_idx" ON "Product"("tenantId", "assortmentRole");
CREATE INDEX "Product_tenantId_isMandatory_idx" ON "Product"("tenantId", "isMandatory");
