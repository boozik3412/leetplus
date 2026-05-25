-- CreateTable
CREATE TABLE "GuestCrmLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matchedGuestId" TEXT,
    "createdByUserId" TEXT,
    "fullNameHash" TEXT,
    "fullNameMasked" TEXT,
    "fullNameEncrypted" TEXT,
    "phoneHash" TEXT NOT NULL,
    "phoneMasked" TEXT,
    "phoneEncrypted" TEXT,
    "emailHash" TEXT,
    "emailMasked" TEXT,
    "source" TEXT,
    "eventName" TEXT,
    "crmStatus" "GuestCrmStatus" NOT NULL DEFAULT 'CONTACT',
    "crmNote" TEXT,
    "nextAction" TEXT,
    "nextContactAt" TIMESTAMP(3),
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestCrmTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT,
    "guestId" TEXT,
    "leadId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_crm_lead_tenant_created_idx" ON "GuestCrmLead"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "guest_crm_lead_phone_idx" ON "GuestCrmLead"("tenantId", "phoneHash");

-- CreateIndex
CREATE INDEX "guest_crm_lead_guest_idx" ON "GuestCrmLead"("matchedGuestId");

-- CreateIndex
CREATE INDEX "guest_crm_lead_user_idx" ON "GuestCrmLead"("createdByUserId");

-- CreateIndex
CREATE INDEX "guest_crm_task_status_due_idx" ON "GuestCrmTask"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "guest_crm_task_audience_idx" ON "GuestCrmTask"("audienceId");

-- CreateIndex
CREATE INDEX "guest_crm_task_guest_idx" ON "GuestCrmTask"("guestId");

-- CreateIndex
CREATE INDEX "guest_crm_task_lead_idx" ON "GuestCrmTask"("leadId");

-- CreateIndex
CREATE INDEX "guest_crm_task_user_idx" ON "GuestCrmTask"("createdByUserId");

-- AddForeignKey
ALTER TABLE "GuestCrmLead" ADD CONSTRAINT "GuestCrmLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmLead" ADD CONSTRAINT "GuestCrmLead_matchedGuestId_fkey" FOREIGN KEY ("matchedGuestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmLead" ADD CONSTRAINT "GuestCrmLead_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "GuestCrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestCrmTask" ADD CONSTRAINT "GuestCrmTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
