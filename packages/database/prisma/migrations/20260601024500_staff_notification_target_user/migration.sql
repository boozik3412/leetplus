ALTER TABLE "StaffNotification"
    ADD COLUMN "targetUserId" TEXT;

CREATE INDEX "staff_notification_target_user_idx" ON "StaffNotification"("targetUserId");

ALTER TABLE "StaffNotification"
    ADD CONSTRAINT "StaffNotification_targetUserId_fkey"
    FOREIGN KEY ("targetUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
