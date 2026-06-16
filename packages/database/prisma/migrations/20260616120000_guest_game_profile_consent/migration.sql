ALTER TABLE "GuestGameProfile"
  ADD COLUMN "phoneConsentStatus" "GuestCommunicationConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "phoneConsentSource" TEXT,
  ADD COLUMN "phoneConsentAt" TIMESTAMP(3),
  ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
