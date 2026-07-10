-- Persistent guest game diagnostics for successful and blocked game-module actions.

CREATE TABLE "GuestGameAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "storeId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reasonCode" TEXT,
  "reasonText" TEXT,
  "traceId" TEXT,
  "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_audit_event_time_idx"
  ON "GuestGameAuditEvent" ("tenantId", "happenedAt");
CREATE INDEX "guest_game_audit_event_action_idx"
  ON "GuestGameAuditEvent" ("tenantId", "action", "happenedAt");
CREATE INDEX "guest_game_audit_event_profile_idx"
  ON "GuestGameAuditEvent" ("profileId", "happenedAt");
CREATE INDEX "guest_game_audit_event_guest_idx"
  ON "GuestGameAuditEvent" ("guestId", "happenedAt");
CREATE INDEX "guest_game_audit_event_store_idx"
  ON "GuestGameAuditEvent" ("storeId", "happenedAt");
CREATE INDEX "guest_game_audit_event_entity_idx"
  ON "GuestGameAuditEvent" ("entityType", "entityId", "happenedAt");

ALTER TABLE "GuestGameAuditEvent"
  ADD CONSTRAINT "GuestGameAuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGameAuditEvent"
  ADD CONSTRAINT "GuestGameAuditEvent_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameAuditEvent"
  ADD CONSTRAINT "GuestGameAuditEvent_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameAuditEvent"
  ADD CONSTRAINT "GuestGameAuditEvent_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
