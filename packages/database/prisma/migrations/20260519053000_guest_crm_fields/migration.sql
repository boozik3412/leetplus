CREATE TYPE "GuestCrmStatus" AS ENUM (
  'NONE',
  'WATCH',
  'CONTACT',
  'INVITED',
  'LOYAL',
  'VIP',
  'PROBLEM',
  'DO_NOT_CONTACT'
);

ALTER TABLE "Guest"
  ADD COLUMN "crmStatus" "GuestCrmStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "crmNote" TEXT,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextContactAt" TIMESTAMP(3),
  ADD COLUMN "crmUpdatedByUserId" TEXT,
  ADD COLUMN "crmUpdatedAt" TIMESTAMP(3);

CREATE TABLE "GuestCrmEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "status" "GuestCrmStatus" NOT NULL,
  "note" TEXT,
  "nextAction" TEXT,
  "nextContactAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestCrmEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Guest_crmStatus_idx" ON "Guest"("tenantId", "crmStatus");
CREATE INDEX "Guest_nextContactAt_idx" ON "Guest"("tenantId", "nextContactAt");
CREATE INDEX "GuestCrmEvent_tenantId_createdAt_idx" ON "GuestCrmEvent"("tenantId", "createdAt");
CREATE INDEX "GuestCrmEvent_guestId_createdAt_idx" ON "GuestCrmEvent"("guestId", "createdAt");
CREATE INDEX "GuestCrmEvent_createdByUserId_idx" ON "GuestCrmEvent"("createdByUserId");

ALTER TABLE "GuestCrmEvent"
  ADD CONSTRAINT "GuestCrmEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestCrmEvent"
  ADD CONSTRAINT "GuestCrmEvent_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestCrmEvent"
  ADD CONSTRAINT "GuestCrmEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
