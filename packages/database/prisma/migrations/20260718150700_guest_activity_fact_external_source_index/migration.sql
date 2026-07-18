CREATE INDEX CONCURRENTLY "guest_activity_fact_external_source_idx"
  ON "GuestActivityFact"(
    "tenantId",
    "externalProvider",
    "externalDomain",
    "factType",
    "sourceExternalId"
  );
