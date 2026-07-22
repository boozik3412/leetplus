CREATE TABLE "GuestGameProfileIdentityLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider" NOT NULL,
    "externalDomain" TEXT NOT NULL,
    "externalGuestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "matchSource" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'EXACT',
    "consecutiveMatches" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestGameProfileIdentityLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GuestGameProfileIdentityLink_status_check"
      CHECK ("status" IN ('ACTIVE', 'PENDING_REBIND', 'SUPERSEDED', 'CONFLICT')),
    CONSTRAINT "GuestGameProfileIdentityLink_consecutiveMatches_check"
      CHECK ("consecutiveMatches" >= 1)
);

CREATE UNIQUE INDEX "guest_game_profile_identity_link_uidx"
ON "GuestGameProfileIdentityLink"("tenantId", "profileId", "externalProvider", "externalDomain", "guestId");

CREATE INDEX "guest_game_profile_identity_link_profile_idx"
ON "GuestGameProfileIdentityLink"("tenantId", "profileId", "status", "externalProvider", "externalDomain");

CREATE INDEX "guest_game_profile_identity_link_guest_idx"
ON "GuestGameProfileIdentityLink"("guestId", "status");

CREATE INDEX "guest_game_profile_identity_link_status_idx"
ON "GuestGameProfileIdentityLink"("tenantId", "status", "verifiedAt");

CREATE INDEX "guest_game_profile_identity_link_external_idx"
ON "GuestGameProfileIdentityLink"("tenantId", "externalProvider", "externalDomain", "externalGuestId");

CREATE UNIQUE INDEX "guest_game_profile_identity_link_active_domain_uidx"
ON "GuestGameProfileIdentityLink"("tenantId", "profileId", "externalProvider", "externalDomain")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "guest_game_profile_identity_link_active_guest_uidx"
ON "GuestGameProfileIdentityLink"("tenantId", "guestId")
WHERE "status" = 'ACTIVE';

ALTER TABLE "GuestGameProfileIdentityLink"
ADD CONSTRAINT "GuestGameProfileIdentityLink_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameProfileIdentityLink"
ADD CONSTRAINT "GuestGameProfileIdentityLink_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameProfileIdentityLink"
ADD CONSTRAINT "GuestGameProfileIdentityLink_guestId_fkey"
FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "GuestGameProfileIdentityLink" (
    "id",
    "tenantId",
    "profileId",
    "guestId",
    "externalProvider",
    "externalDomain",
    "externalGuestId",
    "status",
    "matchSource",
    "confidence",
    "consecutiveMatches",
    "verifiedAt",
    "lastSeenAt",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    profile."tenantId",
    profile."id",
    guest."id",
    guest."externalProvider",
    guest."externalDomain",
    guest."externalGuestId",
    'ACTIVE',
    'MIGRATION_LEGACY_PROFILE_GUEST',
    'EXACT',
    1,
    COALESCE(guest."lastSyncedAt", profile."updatedAt", CURRENT_TIMESTAMP),
    COALESCE(guest."lastSyncedAt", profile."updatedAt", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GuestGameProfile" profile
JOIN "Guest" guest ON guest."id" = profile."guestId"
WHERE profile."guestId" IS NOT NULL
  AND profile."status" = 'ACTIVE'
  AND profile."phoneHash" IS NOT NULL
  AND guest."phoneHash" IS NOT NULL
  AND profile."phoneHash" = guest."phoneHash"
  AND guest."tenantId" = profile."tenantId"
  AND guest."isDisabled" = false
  AND guest."externalProvider" IS NOT NULL
  AND guest."externalDomain" IS NOT NULL
ON CONFLICT DO NOTHING;
