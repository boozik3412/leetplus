CREATE TABLE "GuestPortalOtpChallenge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "phoneMasked" TEXT,
  "guestId" TEXT,
  "profileId" TEXT,
  "codeHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "deliveryChannel" TEXT NOT NULL DEFAULT 'DEV',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestPortalOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_portal_otp_scope_idx"
  ON "GuestPortalOtpChallenge"("tenantId", "storeId", "status", "createdAt");

CREATE INDEX "guest_portal_otp_phone_idx"
  ON "GuestPortalOtpChallenge"("tenantId", "phoneHash", "createdAt");

CREATE INDEX "guest_portal_otp_expires_idx"
  ON "GuestPortalOtpChallenge"("expiresAt");

CREATE INDEX "guest_portal_otp_guest_idx"
  ON "GuestPortalOtpChallenge"("guestId");

CREATE INDEX "guest_portal_otp_profile_idx"
  ON "GuestPortalOtpChallenge"("profileId");

ALTER TABLE "GuestPortalOtpChallenge"
  ADD CONSTRAINT "GuestPortalOtpChallenge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestPortalOtpChallenge"
  ADD CONSTRAINT "GuestPortalOtpChallenge_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestPortalOtpChallenge"
  ADD CONSTRAINT "GuestPortalOtpChallenge_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestPortalOtpChallenge"
  ADD CONSTRAINT "GuestPortalOtpChallenge_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
