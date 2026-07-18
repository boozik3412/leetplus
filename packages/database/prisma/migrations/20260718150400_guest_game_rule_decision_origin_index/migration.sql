CREATE INDEX CONCURRENTLY "guest_game_rule_decision_origin_idx"
  ON "GuestGameRuleDecision"("tenantId", "originKey", "evaluatedAt");
