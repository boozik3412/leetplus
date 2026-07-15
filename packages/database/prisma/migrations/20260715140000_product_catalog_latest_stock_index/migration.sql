-- Supports the latest inventory lookup for a page of tenant-scoped SKU.
CREATE INDEX "InventorySnapshot_tenantId_productId_storeId_snapshotDate_idx"
ON "InventorySnapshot"("tenantId", "productId", "storeId", "snapshotDate");
