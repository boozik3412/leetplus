CREATE TABLE "GuestGameRuleDecision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "storeId" TEXT,
  "eventId" TEXT,
  "evaluationRunId" TEXT NOT NULL,
  "evaluationMode" TEXT NOT NULL DEFAULT 'LIVE',
  "evaluatorVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
  "ruleType" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleName" TEXT,
  "ruleStatus" TEXT,
  "triggerKind" TEXT,
  "sourceEventType" TEXT,
  "sourceFactId" TEXT,
  "sourceFactKind" TEXT,
  "traceId" TEXT,
  "status" TEXT NOT NULL,
  "reasons" JSONB,
  "blockers" JSONB,
  "input" JSONB,
  "evidence" JSONB,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameRuleDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_rule_decision_tenant_time_idx"
  ON "GuestGameRuleDecision" ("tenantId", "evaluatedAt");
CREATE INDEX "guest_game_rule_decision_profile_time_idx"
  ON "GuestGameRuleDecision" ("profileId", "evaluatedAt");
CREATE INDEX "guest_game_rule_decision_guest_time_idx"
  ON "GuestGameRuleDecision" ("guestId", "evaluatedAt");
CREATE INDEX "guest_game_rule_decision_store_time_idx"
  ON "GuestGameRuleDecision" ("storeId", "evaluatedAt");
CREATE INDEX "guest_game_rule_decision_rule_time_idx"
  ON "GuestGameRuleDecision" ("tenantId", "ruleType", "ruleId", "evaluatedAt");
CREATE INDEX "guest_game_rule_decision_run_idx"
  ON "GuestGameRuleDecision" ("evaluationRunId");
CREATE INDEX "guest_game_rule_decision_event_idx"
  ON "GuestGameRuleDecision" ("eventId");
CREATE INDEX "guest_game_rule_decision_status_idx"
  ON "GuestGameRuleDecision" ("tenantId", "status", "evaluatedAt");

ALTER TABLE "GuestGameRuleDecision"
  ADD CONSTRAINT "GuestGameRuleDecision_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGameRuleDecision"
  ADD CONSTRAINT "GuestGameRuleDecision_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameRuleDecision"
  ADD CONSTRAINT "GuestGameRuleDecision_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameRuleDecision"
  ADD CONSTRAINT "GuestGameRuleDecision_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameRuleDecision"
  ADD CONSTRAINT "GuestGameRuleDecision_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "GuestGameEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
