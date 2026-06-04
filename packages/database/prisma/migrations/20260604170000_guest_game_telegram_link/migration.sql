CREATE TABLE "GuestGameTelegramLinkChallenge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "guestId" TEXT,
  "phoneHash" TEXT,
  "codeHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "telegramChatIdMasked" TEXT,
  "telegramUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameTelegramLinkChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_telegram_link_scope_idx"
  ON "GuestGameTelegramLinkChallenge"("tenantId", "storeId", "status", "createdAt");

CREATE INDEX "guest_game_telegram_link_code_idx"
  ON "GuestGameTelegramLinkChallenge"("codeHash", "status");

CREATE INDEX "guest_game_telegram_link_profile_idx"
  ON "GuestGameTelegramLinkChallenge"("profileId");

CREATE INDEX "guest_game_telegram_link_guest_idx"
  ON "GuestGameTelegramLinkChallenge"("guestId");

CREATE INDEX "guest_game_telegram_link_expires_idx"
  ON "GuestGameTelegramLinkChallenge"("expiresAt");

ALTER TABLE "GuestGameTelegramLinkChallenge"
  ADD CONSTRAINT "GuestGameTelegramLinkChallenge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameTelegramLinkChallenge"
  ADD CONSTRAINT "GuestGameTelegramLinkChallenge_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameTelegramLinkChallenge"
  ADD CONSTRAINT "GuestGameTelegramLinkChallenge_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameTelegramLinkChallenge"
  ADD CONSTRAINT "GuestGameTelegramLinkChallenge_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
