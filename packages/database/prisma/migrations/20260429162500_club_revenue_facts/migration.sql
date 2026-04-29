CREATE TABLE "ClubRevenueFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(65,30) NOT NULL,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalClubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubRevenueFact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubRevenueFact_tenantId_storeId_revenueDate_key" ON "ClubRevenueFact"("tenantId", "storeId", "revenueDate");
CREATE INDEX "ClubRevenueFact_tenantId_revenueDate_idx" ON "ClubRevenueFact"("tenantId", "revenueDate");
CREATE INDEX "ClubRevenueFact_storeId_idx" ON "ClubRevenueFact"("storeId");

ALTER TABLE "ClubRevenueFact" ADD CONSTRAINT "ClubRevenueFact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubRevenueFact" ADD CONSTRAINT "ClubRevenueFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
