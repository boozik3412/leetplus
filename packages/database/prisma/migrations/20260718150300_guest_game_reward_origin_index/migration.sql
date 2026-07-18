CREATE INDEX CONCURRENTLY "guest_game_reward_origin_idx"
  ON "GuestGameReward"("tenantId", "originKey");
