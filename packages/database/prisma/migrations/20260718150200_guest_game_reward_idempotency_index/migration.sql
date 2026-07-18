CREATE UNIQUE INDEX CONCURRENTLY "guest_game_reward_idempotency_uidx"
  ON "GuestGameReward"("tenantId", "idempotencyKey");
