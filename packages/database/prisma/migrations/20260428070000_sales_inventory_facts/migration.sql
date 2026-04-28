CREATE TABLE "SalesFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "revenue" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesFact_tenantId_storeId_productId_saleDate_key" ON "SalesFact"("tenantId", "storeId", "productId", "saleDate");
CREATE INDEX "SalesFact_tenantId_saleDate_idx" ON "SalesFact"("tenantId", "saleDate");
CREATE INDEX "SalesFact_storeId_idx" ON "SalesFact"("storeId");
CREATE INDEX "SalesFact_productId_idx" ON "SalesFact"("productId");

CREATE UNIQUE INDEX "InventorySnapshot_tenantId_storeId_productId_snapshotDate_key" ON "InventorySnapshot"("tenantId", "storeId", "productId", "snapshotDate");
CREATE INDEX "InventorySnapshot_tenantId_snapshotDate_idx" ON "InventorySnapshot"("tenantId", "snapshotDate");
CREATE INDEX "InventorySnapshot_storeId_idx" ON "InventorySnapshot"("storeId");
CREATE INDEX "InventorySnapshot_productId_idx" ON "InventorySnapshot"("productId");

ALTER TABLE "SalesFact" ADD CONSTRAINT "SalesFact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesFact" ADD CONSTRAINT "SalesFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesFact" ADD CONSTRAINT "SalesFact_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
