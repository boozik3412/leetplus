ALTER TABLE "Store" ADD COLUMN "city" TEXT;
ALTER TABLE "Store" ADD COLUMN "cityFiasId" TEXT;
ALTER TABLE "Store" ADD COLUMN "cityKladrId" TEXT;
ALTER TABLE "Store" ADD COLUMN "timeZone" TEXT;

UPDATE "Store"
SET "city" = 'Екатеринбург',
    "timeZone" = 'Asia/Yekaterinburg'
WHERE "timeZone" IS NULL
  AND (
    "name" ILIKE '%Радищева%'
    OR "name" ILIKE '%Родонит%'
    OR "address" ILIKE '%Радищева%'
    OR "address" ILIKE '%Родонит%'
  );
