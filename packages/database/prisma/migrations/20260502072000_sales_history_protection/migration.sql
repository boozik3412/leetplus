-- Keep externally synced products for sales history even after they disappear
-- from the source catalog, and track the data coverage date per integration.
ALTER TABLE "Product"
  ADD COLUMN "externalMissingSince" TIMESTAMP(3);

ALTER TABLE "IntegrationSource"
  ADD COLUMN "lastSyncedDate" TIMESTAMP(3);

ALTER TABLE "SalesFact"
  ADD COLUMN "externalProductId" TEXT,
  ADD COLUMN "externalClubId" TEXT,
  ADD COLUMN "productNameAtSale" TEXT,
  ADD COLUMN "storeNameAtSale" TEXT,
  ADD COLUMN "sourcePayloadHash" TEXT,
  ADD COLUMN "isCanceled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canceledAt" TIMESTAMP(3);

UPDATE "SalesFact" AS sf
SET
  "externalProductId" = p."externalProductId",
  "productNameAtSale" = p."name"
FROM "Product" AS p
WHERE sf."productId" = p."id"
  AND sf."tenantId" = p."tenantId";

UPDATE "SalesFact" AS sf
SET
  "externalClubId" = s."externalClubId",
  "storeNameAtSale" = s."name"
FROM "Store" AS s
WHERE sf."storeId" = s."id"
  AND sf."tenantId" = s."tenantId";

UPDATE "IntegrationSource" AS src
SET "lastSyncedDate" = COALESCE(
  (
    SELECT date_trunc('day', MAX(date_value))::timestamp(3)
    FROM (
      SELECT MAX(sf."saleDate") AS date_value
      FROM "SalesFact" AS sf
      WHERE sf."tenantId" = src."tenantId"
        AND sf."externalProvider" = src."provider"
        AND sf."externalDomain" = src."domain"
      UNION ALL
      SELECT MAX(inv."snapshotDate") AS date_value
      FROM "InventorySnapshot" AS inv
      WHERE inv."tenantId" = src."tenantId"
        AND inv."externalProvider" = src."provider"
        AND inv."externalDomain" = src."domain"
      UNION ALL
      SELECT MAX(cr."revenueDate") AS date_value
      FROM "ClubRevenueFact" AS cr
      WHERE cr."tenantId" = src."tenantId"
        AND cr."externalProvider" = src."provider"
        AND cr."externalDomain" = src."domain"
    ) AS dates
  ),
  date_trunc('day', src."lastSyncedAt")::timestamp(3)
)
WHERE src."provider" = 'LANGAME';

CREATE INDEX "Product_tenantId_externalMissingSince_idx"
  ON "Product"("tenantId", "externalMissingSince");

CREATE INDEX "SalesFact_tenantId_isCanceled_saleDate_idx"
  ON "SalesFact"("tenantId", "isCanceled", "saleDate");

CREATE INDEX "IntegrationSource_lastSyncedDate_idx"
  ON "IntegrationSource"("lastSyncedDate");
