CREATE TABLE "StaffTaskObserver" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTaskObserver_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_task_observer_task_user_unique" ON "StaffTaskObserver"("taskId", "userId");
CREATE INDEX "staff_task_observer_tenant_task_idx" ON "StaffTaskObserver"("tenantId", "taskId");
CREATE INDEX "staff_task_observer_tenant_user_idx" ON "StaffTaskObserver"("tenantId", "userId");

ALTER TABLE "StaffTaskObserver" ADD CONSTRAINT "StaffTaskObserver_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffTaskObserver" ADD CONSTRAINT "StaffTaskObserver_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StaffTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffTaskObserver" ADD CONSTRAINT "StaffTaskObserver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
