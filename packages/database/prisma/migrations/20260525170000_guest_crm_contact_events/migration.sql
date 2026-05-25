CREATE TABLE "GuestCrmContactEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT,
    "guestId" TEXT,
    "leadId" TEXT,
    "createdByUserId" TEXT,
    "channel" TEXT NOT NULL,
    "result" TEXT,
    "note" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCrmContactEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_crm_contact_tenant_contacted_idx" ON "GuestCrmContactEvent"("tenantId", "contactedAt");
CREATE INDEX "guest_crm_contact_audience_idx" ON "GuestCrmContactEvent"("audienceId");
CREATE INDEX "guest_crm_contact_guest_idx" ON "GuestCrmContactEvent"("guestId");
CREATE INDEX "guest_crm_contact_lead_idx" ON "GuestCrmContactEvent"("leadId");
CREATE INDEX "guest_crm_contact_user_idx" ON "GuestCrmContactEvent"("createdByUserId");

ALTER TABLE "GuestCrmContactEvent" ADD CONSTRAINT "GuestCrmContactEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestCrmContactEvent" ADD CONSTRAINT "GuestCrmContactEvent_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestCrmContactEvent" ADD CONSTRAINT "GuestCrmContactEvent_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestCrmContactEvent" ADD CONSTRAINT "GuestCrmContactEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "GuestCrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestCrmContactEvent" ADD CONSTRAINT "GuestCrmContactEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
