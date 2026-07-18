CREATE INDEX CONCURRENTLY "guest_activity_raw_external_source_idx"
  ON "GuestActivityRawRecord"(
    "tenantId",
    "externalProvider",
    "externalDomain",
    "sourceKind",
    "sourceExternalId"
  );
