-- Lets the gamification scheduler efficiently pick sessions whose Langame
-- snapshot was just updated with a stop time and duration.
CREATE INDEX "guest_session_tenant_updated_idx"
ON "GuestSession"("tenantId", "updatedAt");
