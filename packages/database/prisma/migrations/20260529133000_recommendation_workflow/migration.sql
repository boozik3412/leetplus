CREATE TYPE "RecommendationStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'REJECTED', 'HIDDEN', 'REAPPEARED');

CREATE TYPE "RecommendationRole" AS ENUM ('COMMERCIAL_DIRECTOR', 'BUYER', 'CLUB_MANAGER');

CREATE TABLE "RecommendationState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recommendationKey" TEXT NOT NULL,
    "role" "RecommendationRole" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recommendation_state_tenant_key_uidx" ON "RecommendationState"("tenantId", "recommendationKey");

CREATE INDEX "recommendation_state_status_idx" ON "RecommendationState"("tenantId", "status");

CREATE INDEX "recommendation_state_role_idx" ON "RecommendationState"("tenantId", "role");

CREATE INDEX "recommendation_state_last_seen_idx" ON "RecommendationState"("tenantId", "lastSeenAt");

ALTER TABLE "RecommendationState"
ADD CONSTRAINT "RecommendationState_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
