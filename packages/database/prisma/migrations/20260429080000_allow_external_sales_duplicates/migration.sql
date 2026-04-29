DROP INDEX IF EXISTS "SalesFact_tenantId_storeId_productId_saleDate_key";
CREATE INDEX "SalesFact_tenantId_storeId_productId_saleDate_idx" ON "SalesFact"("tenantId", "storeId", "productId", "saleDate");
