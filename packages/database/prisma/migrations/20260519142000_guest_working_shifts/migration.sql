-- Persist Langame working shifts for staff-control analytics.
CREATE TABLE "GuestWorkingShift" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "storeId" TEXT,
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalShiftId" TEXT NOT NULL,
  "externalUserId" TEXT,
  "externalClubId" TEXT,
  "startedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "cashStart" DECIMAL(65,30),
  "cashAmount" DECIMAL(65,30),
  "cashlessAmount" DECIMAL(65,30),
  "refundsCash" DECIMAL(65,30),
  "refundsCashless" DECIMAL(65,30),
  "mobilePay" DECIMAL(65,30),
  "yandexPay" DECIMAL(65,30),
  "incassAmount" DECIMAL(65,30),
  "middleCheck" DECIMAL(65,30),
  "message" TEXT,
  "sourcePayloadHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestWorkingShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestWorkingShift_tenantId_externalProvider_externalDomain_externalShiftId_key"
  ON "GuestWorkingShift"("tenantId", "externalProvider", "externalDomain", "externalShiftId");

CREATE INDEX "GuestWorkingShift_tenantId_startedAt_idx"
  ON "GuestWorkingShift"("tenantId", "startedAt");

CREATE INDEX "GuestWorkingShift_tenantId_externalUserId_idx"
  ON "GuestWorkingShift"("tenantId", "externalUserId");

CREATE INDEX "GuestWorkingShift_guestId_idx"
  ON "GuestWorkingShift"("guestId");

CREATE INDEX "GuestWorkingShift_storeId_idx"
  ON "GuestWorkingShift"("storeId");

ALTER TABLE "GuestWorkingShift"
  ADD CONSTRAINT "GuestWorkingShift_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestWorkingShift"
  ADD CONSTRAINT "GuestWorkingShift_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestWorkingShift"
  ADD CONSTRAINT "GuestWorkingShift_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
