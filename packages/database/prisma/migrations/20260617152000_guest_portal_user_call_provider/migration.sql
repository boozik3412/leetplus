ALTER TABLE "GuestPortalOtpChallenge"
ADD COLUMN "providerName" TEXT,
ADD COLUMN "providerChallengeId" TEXT;

CREATE INDEX "guest_portal_otp_provider_idx"
ON "GuestPortalOtpChallenge"("deliveryChannel", "providerName", "providerChallengeId");
