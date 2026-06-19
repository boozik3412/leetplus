ALTER TABLE "GuestGameSeason"
  ADD COLUMN "storeIds" JSONB;

CREATE TABLE "GuestGamePromoCard" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "label" TEXT,
  "description" TEXT,
  "tag" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "targetAnchor" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "storeIds" JSONB,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGamePromoCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameVisualDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "publishedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "payload" JSONB NOT NULL,
  "note" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameVisualDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_game_promo_card_status_idx" ON "GuestGamePromoCard"("tenantId", "status", "updatedAt");
CREATE INDEX "guest_game_promo_card_created_by_idx" ON "GuestGamePromoCard"("createdByUserId");

CREATE INDEX "guest_game_visual_draft_scope_idx" ON "GuestGameVisualDraft"("tenantId", "storeId", "status", "updatedAt");
CREATE INDEX "guest_game_visual_draft_created_by_idx" ON "GuestGameVisualDraft"("createdByUserId");
CREATE INDEX "guest_game_visual_draft_updated_by_idx" ON "GuestGameVisualDraft"("updatedByUserId");
CREATE INDEX "guest_game_visual_draft_published_by_idx" ON "GuestGameVisualDraft"("publishedByUserId");

ALTER TABLE "GuestGamePromoCard" ADD CONSTRAINT "GuestGamePromoCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGamePromoCard" ADD CONSTRAINT "GuestGamePromoCard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameVisualDraft" ADD CONSTRAINT "GuestGameVisualDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGameVisualDraft" ADD CONSTRAINT "GuestGameVisualDraft_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameVisualDraft" ADD CONSTRAINT "GuestGameVisualDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameVisualDraft" ADD CONSTRAINT "GuestGameVisualDraft_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameVisualDraft" ADD CONSTRAINT "GuestGameVisualDraft_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
