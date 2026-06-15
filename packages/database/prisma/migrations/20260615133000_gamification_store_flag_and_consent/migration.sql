ALTER TABLE "Store"
  ADD COLUMN "gamificationEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GuestPortalOtpChallenge"
  ADD COLUMN "gameConsentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "gameConsentVersion" TEXT;
