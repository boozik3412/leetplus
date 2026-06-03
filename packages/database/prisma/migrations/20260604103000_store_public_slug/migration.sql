ALTER TABLE "Store" ADD COLUMN "publicSlug" TEXT;

UPDATE "Store"
SET "publicSlug" = 'club-' || lower(substr(replace("id", '-', ''), 1, 8))
WHERE "publicSlug" IS NULL;

CREATE UNIQUE INDEX "store_tenant_public_slug_uidx"
  ON "Store"("tenantId", "publicSlug");
