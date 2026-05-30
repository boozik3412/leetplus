ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MARKETER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLUB_MANAGER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SENIOR_ADMINISTRATOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLUB_ADMINISTRATOR';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "UserStoreAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserStoreAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserStoreAccess_userId_storeId_key" ON "UserStoreAccess"("userId", "storeId");
CREATE INDEX IF NOT EXISTS "UserStoreAccess_storeId_idx" ON "UserStoreAccess"("storeId");
CREATE INDEX IF NOT EXISTS "User_tenantId_role_idx" ON "User"("tenantId", "role");
CREATE INDEX IF NOT EXISTS "User_tenantId_isActive_idx" ON "User"("tenantId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserStoreAccess_userId_fkey'
  ) THEN
    ALTER TABLE "UserStoreAccess"
      ADD CONSTRAINT "UserStoreAccess_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserStoreAccess_storeId_fkey'
  ) THEN
    ALTER TABLE "UserStoreAccess"
      ADD CONSTRAINT "UserStoreAccess_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
