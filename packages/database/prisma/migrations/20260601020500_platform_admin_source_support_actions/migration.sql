ALTER TABLE "IntegrationSource"
ADD COLUMN "supportDisabledAt" TIMESTAMP(3),
ADD COLUMN "supportDisabledReason" TEXT,
ADD COLUMN "supportReviewRequestedAt" TIMESTAMP(3),
ADD COLUMN "supportReviewReason" TEXT;
