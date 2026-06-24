ALTER TABLE "GuestGameReward"
  ADD COLUMN "rewardRarity" TEXT,
  ADD COLUMN "rewardRarityLabel" TEXT,
  ADD COLUMN "rewardDropChance" DECIMAL(8, 4);
