ALTER TABLE "GuestCrmTask" ADD COLUMN "assignedToUserId" TEXT;

CREATE INDEX "guest_crm_task_assignee_idx" ON "GuestCrmTask"("assignedToUserId");

ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
