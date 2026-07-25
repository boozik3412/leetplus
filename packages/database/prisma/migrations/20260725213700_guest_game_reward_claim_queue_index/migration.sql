CREATE INDEX CONCURRENTLY "guest_game_reward_claim_queue_idx"
  ON "GuestGameReward"(
    "tenantId",
    "claimRequired",
    "deliveryRequestedAt",
    "claimExpiresAt",
    "status"
  );
