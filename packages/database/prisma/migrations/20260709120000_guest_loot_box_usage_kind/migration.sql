ALTER TABLE "GuestGameLootBox" ADD COLUMN "usageKind" TEXT NOT NULL DEFAULT 'STANDALONE';

CREATE INDEX "guest_game_loot_box_usage_idx" ON "GuestGameLootBox"("tenantId", "usageKind", "status");
