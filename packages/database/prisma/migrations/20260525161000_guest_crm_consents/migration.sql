-- CreateEnum
CREATE TYPE "GuestCommunicationConsentStatus" AS ENUM ('UNKNOWN', 'GRANTED', 'DENIED', 'UNSUBSCRIBED');

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN "phoneConsentStatus" "GuestCommunicationConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "phoneConsentSource" TEXT,
ADD COLUMN "phoneConsentAt" TIMESTAMP(3),
ADD COLUMN "unsubscribedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GuestCrmLead" ADD COLUMN "phoneConsentStatus" "GuestCommunicationConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "phoneConsentSource" TEXT,
ADD COLUMN "phoneConsentAt" TIMESTAMP(3),
ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
