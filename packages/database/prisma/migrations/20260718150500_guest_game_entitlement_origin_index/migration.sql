CREATE INDEX CONCURRENTLY "guest_game_entitlement_origin_idx"
  ON "GuestGameEntitlement"("tenantId", "originKey");
