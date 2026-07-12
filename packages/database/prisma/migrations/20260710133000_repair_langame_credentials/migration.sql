-- Repair Langame credential duplicates created by older settings saves.
-- The application expects one tenant-level Langame API key named "Langame API key".
-- Older data can contain an empty canonical credential plus a populated case-variant
-- duplicate, while IntegrationSource rows point at the empty one.

WITH preferred AS (
  SELECT DISTINCT ON ("tenantId", provider)
    id,
    "tenantId",
    provider,
    "apiKeyEncrypted",
    "apiKeyEnvVar"
  FROM "IntegrationCredential"
  WHERE provider = 'LANGAME'
    AND "isActive" = true
    AND (
      "apiKeyEncrypted" IS NOT NULL
      OR NULLIF("apiKeyEnvVar", '') IS NOT NULL
    )
  ORDER BY
    "tenantId",
    provider,
    CASE WHEN name = 'Langame API key' THEN 0 ELSE 1 END,
    "updatedAt" DESC
),
canonical AS (
  UPDATE "IntegrationCredential" target
  SET
    "apiKeyEncrypted" = COALESCE(target."apiKeyEncrypted", preferred."apiKeyEncrypted"),
    "apiKeyEnvVar" = COALESCE(NULLIF(target."apiKeyEnvVar", ''), preferred."apiKeyEnvVar"),
    "isActive" = true,
    "updatedAt" = NOW()
  FROM preferred
  WHERE target."tenantId" = preferred."tenantId"
    AND target.provider = preferred.provider
    AND target.name = 'Langame API key'
  RETURNING target.id, target."tenantId", target.provider
),
source_repair AS (
  UPDATE "IntegrationSource" source
  SET
    "credentialId" = canonical.id,
    "updatedAt" = NOW()
  FROM canonical
  WHERE source."tenantId" = canonical."tenantId"
    AND source.provider = canonical.provider
    AND source."credentialId" <> canonical.id
  RETURNING source.id
)
UPDATE "IntegrationCredential" duplicate
SET
  "isActive" = false,
  "updatedAt" = NOW()
FROM canonical
WHERE duplicate."tenantId" = canonical."tenantId"
  AND duplicate.provider = canonical.provider
  AND duplicate.id <> canonical.id
  AND lower(duplicate.name) = lower('Langame API key');
