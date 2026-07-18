CREATE UNIQUE INDEX CONCURRENTLY "guest_game_event_origin_uidx"
  ON "GuestGameEvent"("tenantId", "originKey");
