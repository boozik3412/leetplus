CREATE TABLE "GuestGameMediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestGameMediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_media_asset_tenant_created_idx"
ON "GuestGameMediaAsset"("tenantId", "createdAt");

ALTER TABLE "GuestGameMediaAsset"
ADD CONSTRAINT "GuestGameMediaAsset_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
