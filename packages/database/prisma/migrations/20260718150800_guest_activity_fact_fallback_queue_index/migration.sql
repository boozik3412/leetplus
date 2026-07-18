CREATE INDEX CONCURRENTLY "guest_activity_fact_fallback_queue_idx"
  ON "GuestActivityFact"(
    "tenantId",
    "lifecycleStatus",
    "confidence",
    "factType",
    "validFrom",
    "id"
  );
