CREATE INDEX CONCURRENTLY "guest_identity_phone_domain_idx"
ON "Guest"("tenantId", "phoneHash", "externalProvider", "externalDomain")
WHERE "phoneHash" IS NOT NULL AND "isDisabled" = false;
