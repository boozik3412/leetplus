ALTER TABLE "ClubRevenueFact" DROP CONSTRAINT "ClubRevenueFact_storeId_fkey";

ALTER TABLE "ClubRevenueFact" ALTER COLUMN "storeId" DROP NOT NULL;

CREATE UNIQUE INDEX "ClubRevenueFact_tenantId_externalProvider_externalDomain_externalClubId_revenueDate_key"
ON "ClubRevenueFact"("tenantId", "externalProvider", "externalDomain", "externalClubId", "revenueDate");

ALTER TABLE "ClubRevenueFact" ADD CONSTRAINT "ClubRevenueFact_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
