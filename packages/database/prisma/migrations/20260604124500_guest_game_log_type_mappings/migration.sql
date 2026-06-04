CREATE TABLE "GuestGameLogTypeMapping" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "rawType" TEXT NOT NULL,
  "normalizedType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "preset" TEXT NOT NULL DEFAULT 'custom',
  "intent" TEXT NOT NULL DEFAULT 'allow',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameLogTypeMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_game_log_type_mapping_uidx"
  ON "GuestGameLogTypeMapping"("tenantId", "normalizedType");

CREATE INDEX "guest_game_log_type_mapping_preset_idx"
  ON "GuestGameLogTypeMapping"("tenantId", "preset");

CREATE INDEX "guest_game_log_type_mapping_created_by_idx"
  ON "GuestGameLogTypeMapping"("createdByUserId");

CREATE INDEX "guest_game_log_type_mapping_updated_by_idx"
  ON "GuestGameLogTypeMapping"("updatedByUserId");

ALTER TABLE "GuestGameLogTypeMapping"
  ADD CONSTRAINT "GuestGameLogTypeMapping_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameLogTypeMapping"
  ADD CONSTRAINT "GuestGameLogTypeMapping_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameLogTypeMapping"
  ADD CONSTRAINT "GuestGameLogTypeMapping_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
