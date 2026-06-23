ALTER TABLE "GuestGameProfile"
ADD COLUMN "isStaffTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "staffTestReason" TEXT,
ADD COLUMN "staffTestMatchedAt" TIMESTAMP(3);

CREATE INDEX "guest_game_profile_staff_test_idx"
ON "GuestGameProfile"("tenantId", "isStaffTest");
