CREATE INDEX CONCURRENTLY "guest_game_event_profile_activation_xp_idx"
  ON "GuestGameEvent"("tenantId", "profileId", "occurredAt");
